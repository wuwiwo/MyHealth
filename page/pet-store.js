/* ============================================
   MyHealth — Pet Store & Sources (M4-5)
   dh-pets-v1 持久化 + 材料获取来源 + 每日结算入口。
   依赖 store.js（注册表）、pets.js、pet-materials.js、pet-codex.js。
   ============================================ */

/* 注册 dh-pets-v1 schema（若 store 注册表存在） */
if (typeof store !== 'undefined' && store.registerSchema) {
  store.registerSchema('pets', {
    version: 1,
    defaultValue: function () {
      return {
        version: 1,
        pets: [],            // [{...createPet 结构}]
        materials: {         // 材料袋
          nutrition: 0, feed: 0, spirit: 0,
          refineNormal: 0, refineHigh: 0, orbShard: 0
        },
        orbs: [],            // v2.1.17 未装配的宝珠库存 [{id,type,rarity,level,exp}]
        battlePicks: [],     // v2.2 WP-H1：参战宠物选择（speciesId 数组，刷新/重开后保留）
        lastSettleDate: null,  // 宠物系统上次结算日
        monthlyKey: null       // 月度重置键
      };
    },
    validate: function (v) { return v && typeof v === 'object' && Array.isArray(v.pets); },
    migrate: {}
  });
}

/* 读取宠物数据（默认值兜底） */
function getPetStore() {
  if (typeof store === 'undefined') {
    return { version: 1, pets: [], materials: { nutrition:0, feed:0, spirit:0, refineNormal:0, refineHigh:0, orbShard:0 }, orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null };
  }
  var d = store.get('pets');
  if (!d) { d = { version: 1, pets: [], materials: { nutrition:0, feed:0, spirit:0, refineNormal:0, refineHigh:0, orbShard:0 }, orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null }; store.set('pets', d); }
  if (!Array.isArray(d.orbs)) d.orbs = [];   // v2.1.17 老存档补齐宝珠库存
  /* v2.2 WP-H1：参战宠物选择持久化 —— 旧存档没有该字段时**优雅退化**为 []（＝未选择，
     行为与改动前一致：开战时自动带成熟宠物）。不迁移、不补偿，缺失即空。 */
  if (!Array.isArray(d.battlePicks)) d.battlePicks = [];
  /* v2.2 WP-A2：**宝珠口径迁移**（幂等）—— 旧 N 档折算碎片、R/SR/SSR 品质映射 + 等级保号、
     超过新品质等级上限则截断（口径见 doc/changelog-v2.2.md「旧宝珠迁移口径定案」）。
     迁移后 N 档已不存在，再次调用不会命中任何分支，所以放在读取路径上是安全的。 */
  if (typeof migrateOrbs === 'function') {
    var mig = migrateOrbs(d);
    if (mig.dropped || mig.clamped) {
      savePetStore(d);
      console.log('[orb] v2.2 迁移：N 档 ' + mig.dropped + ' 颗 → ' + mig.shards + ' 碎片；等级截断 ' + mig.clamped + ' 颗');
    }
  }
  return d;
}

/* 保存 */
function savePetStore(d) {
  if (typeof store !== 'undefined') store.set('pets', d);
}

/* 初始赠送：1 颗随机蛋（未拥有过的） */
function grantStarterPet() {
  var d = getPetStore();
  if (d.pets.length > 0) return { ok: false, reason: '已有宠物' };
  var codex = listPetCodex();
  var sid = codex[Math.floor(battleRnd() * codex.length)];
  var pet = createPet({ speciesId: sid, rarity: getPetCodex(sid).rarity, name: getPetCodex(sid).name });
  d.pets.push(pet);
  savePetStore(d);
  return { ok: true, pet: pet, msg: '🥚 获得宠物蛋：' + pet.name };
}

/* 材料掉落（隐藏挑战胜利结算调用） */
function grantMaterial(type, n) {
  var d = getPetStore();
  addMaterial(d.materials, type, n);
  // 获取记录（最近 20 条）
  d.materialLog = d.materialLog || [];
  d.materialLog.unshift({ type: type, n: n, date: dateKey(new Date()), ts: Date.now() });
  if (d.materialLog.length > 20) d.materialLog.length = 20;
  savePetStore(d);
  return { ok: true, type: type, n: n };
}

/* 材料中文名 */
var MATERIAL_NAMES = {
  nutrition: '🧪 营养液',
  feed: '🍖 宠物饲料',
  spirit: '✨ 宠物灵能',
  refineNormal: '🪨 普通炼化石',
  refineHigh: '💎 高级炼化石',
  orbShard: '🔮 宝珠碎片'
};
function getMaterialName(type) { return MATERIAL_NAMES[type] || type; }

/* 材料获取说明 */
var MATERIAL_SOURCES = {
  nutrition: '隐藏挑战胜利掉落（10-20%）',
  feed: '隐藏挑战胜利掉落（20-30%）',
  spirit: '隐藏挑战胜利掉落（5-10%）',
  refineNormal: '隐藏挑战胜利掉落',
  refineHigh: '隐藏挑战胜利掉落（Boss 关）',
  orbShard: '隐藏挑战胜利掉落 / 分解宝珠'
};

/* 每日结算入口（app 初始化/进宠物页时调用）：
   对每只宠物按天结算，返回事件 */
function settleAllPets(now) {
  var d = getPetStore();
  var today = dateKey(now || new Date());
  var allEvents = [];
  if (!d.lastSettleDate) { d.lastSettleDate = today; }
  d.pets.forEach(function (pet) {
    // 补 lastSettleDate（每只宠物自己的）
    var r = settlePet(pet, today, now);
    allEvents = allEvents.concat(r.events);
  });
  d.lastSettleDate = today;
  savePetStore(d);
  return allEvents;
}

/* 月度重置入口（月底调用）：炼化/技能/材料 */
/* v2.1.19：战斗失败后，参战的成熟宠物各有 50% 几率进入受伤状态。
   受伤期间不可出战，需喂营养液（+10~15%）/ 饲料（+4~5%）把恢复进度喂到 100 解除。
   @param {string[]} speciesIds 本场参战的宠物 speciesId
   @returns {string[]} 本次受伤的宠物名 */
function applyDefeatInjuries(d, speciesIds) {
  var hurt = [];
  var chance = (typeof PET_CONFIG !== 'undefined' && PET_CONFIG.matureInjuryChance) || 0.5;
  (speciesIds || []).forEach(function (sid) {
    var pet = (d.pets || []).find(function (p) { return p.speciesId === sid; });
    if (!pet || !canPetBattle(pet)) return;
    if (battleRnd() >= chance) return;
    var r = injurePet(pet);
    if (r.ok) hurt.push((getPetCodex(pet.speciesId) || {}).name || pet.name || sid);
  });
  return hurt;
}

function monthlyResetPets(now) {
  var d = getPetStore();
  var cur = monthKey(now || new Date());
  if (d.monthlyKey === cur) return { ok: false, reason: '本月已重置' };
  d.pets.forEach(function (pet) {
    monthlyResetPet(pet);
    /* v2.1.17 宝珠月重置：已装宝珠回 1 级（本体保留）+ 碎片清空。
       此前 monthlyResetOrbs 无人调用，与宝珠系统整体一样是死代码。 */
    if (typeof monthlyResetOrbs === 'function') monthlyResetOrbs(pet, d.materials);
  });
  monthlyResetMaterials(d.materials);
  d.monthlyKey = cur;
  savePetStore(d);
  return { ok: true, msg: '宠物月度重置完成' };
}

/* 孵化检查（进宠物页时）：所有蛋检查是否孵化 */
function hatchAllEggs() {
  var d = getPetStore();
  var results = [];
  d.pets.forEach(function (pet) {
    var r = hatchCheck(pet);
    if (r.hatched) results.push(r);
  });
  if (results.length) savePetStore(d);
  return results;
}

/* 获取可参战宠物（成熟期） */
function getBattleReadyPets() {
  var d = getPetStore();
  // v2.1.19：受伤期间无法参战
  return d.pets.filter(function (p) { return canPetBattle(p); });
}

/* ============================================================
   v2.2 WP-H5：**一键修复受伤（自动消耗）**
   doc/2.2 修改-补充.md 原话：「宠物现在支持一键修复受伤（自动消耗）」。
   规则（与单只营养液治疗**同源**，不另立数值）：
     · 只处理「**成熟 + 未阵亡 + injured**」的宠物 ——
       已阵亡 / 未成熟 / 未受伤的一律**跳过且不消耗**（不允许把死宠也一起治）。
     · 对每只受伤宠物逐瓶消耗营养液，直到痊愈或营养液耗尽；
     · 单瓶恢复量 = `PET_CONFIG.injuryHeal.nutrition`（+10%~15%，由 healPetInjury 结算）。
   @returns {{ok, healed:string[], partial:string[], consumed:number, reason?}} */
function healAllInjuredPets() {
  var d = getPetStore();
  var bag = d.materials || {};
  var healed = [], partial = [], consumed = 0;
  (d.pets || []).forEach(function (pet) {
    if (!pet || pet.isDead || pet.stage !== 'mature' || !pet.injured) return;   // 不可治疗的跳过
    if (pet.injuryHeal == null) pet.injuryHeal = 0;
    while (pet.injured && (bag.nutrition || 0) >= 1) {
      bag.nutrition--;
      consumed++;
      var r = healPetInjury(pet, 'nutrition');
      if (!r.ok) break;
    }
    var nm = (getPetCodex(pet.speciesId) || {}).name || pet.name || pet.speciesId;
    if (pet.injured) partial.push(nm); else healed.push(nm);
  });
  if (consumed) savePetStore(d);
  var touched = healed.length + partial.length;
  return { ok: touched > 0, healed: healed, partial: partial, consumed: consumed,
           reason: touched ? undefined : '没有需要治疗的宠物' };
}

/* ============================================================
   v2.2 WP-H1：参战宠物选择的持久化
   存在 `dh-pets-v1` 的 `battlePicks` 字段（沿用本模块既有的 getPetStore / savePetStore 约定，
   不另开 store 键）。旧存档没有该字段 → getPetStore() 补齐为 []（优雅退化）。
   ============================================================ */
function getPetBattlePicks() {
  var d = getPetStore();
  return Array.isArray(d.battlePicks) ? d.battlePicks.slice() : [];
}
function savePetBattlePicks(ids) {
  var d = getPetStore();
  d.battlePicks = (Array.isArray(ids) ? ids : []).slice(0, PET_BATTLE_MAX);
  savePetStore(d);
  return d.battlePicks.slice();
}

/* v2.2 WP-A3：参战宠物上限 2 → 4（dundun 2026-09-29 裁决）——
   全项目唯一来源，别在调用点再写死数字。 */
var PET_BATTLE_MAX = 4;

/* 生成参战 Unit（最多 maxRoster 只） */
function createPetUnitsForBattle(petIds, maxRoster) {
  var d = getPetStore();
  var max = maxRoster || PET_BATTLE_MAX;
  var units = [];
  (petIds || []).slice(0, max).forEach(function (pid) {
    var pet = d.pets.find(function (p) { return p.speciesId === pid || p.name === pid; });
    if (pet && canPetBattle(pet)) {   // v2.1.19：受伤不可出战
      var u = createPetUnit(pet);
      if (u) units.push(u);
    }
  });
  return units;
}

/* ============================================================
   v2.2 WP-A4：团队凝聚（新）+ 共鸣（接线）
   两者**共存可叠加**，且**同形**：都把「未上场宠物的基础属性」按比例加成到
   **参战宠物的基础属性**上 —— 之后随参战宠物一起进入百分比池。

   📌 dundun 2026-09-29 口径（总模型）：
     **只要「直接加属性值」的就属于基础属性部分；写成百分比的才进可叠加的百分比池。**
     · 基础属性 = 图鉴基础 + 炼化加成 + 天赋静态修正 + **团队凝聚** + **共鸣**
     · 百分比池 = 稀有度倍率 + Σ宝珠%
     · 最终属性 = 基础属性 × 百分比池
     所以两处都必须加在 `boostPetForGroup()`（百分比池）**之前**。

   · **团队凝聚**：所有「成熟 + 未受伤 + 未上场」的宠物，各把基础属性 ×**10%** 贡献给参战宠物
   · **共鸣**（design-v2.0.md §2.3 / OQ-15）：同样的贡献，但比例按**持有总数**取档
     （>1 ×3% / >3 ×5% / >6 ×7% / >10 ×10%）
   ⚠️「不受百分比加成影响」= 计算源取的是未上场宠物的**基础属性**，
      不是它们被百分比放大后的最终属性。
   ============================================================ */
var TEAM_COHESION_RATE = 0.10;
var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];   // 速度不参与（与 A1 公式一致）

/* 未上场宠物按比例贡献的基础属性合计；只取「基础属性部分」（剔除宝珠的扁平贡献，A2 后自然为 0） */
function benchBonusSum(benchPets, rate) {
  var sum = { hp: 0, atk: 0, def: 0, soulAtk: 0, soulDef: 0 };
  if (!rate) return sum;
  (benchPets || []).forEach(function (pet) {
    var u = createPetUnit(pet);
    if (!u || !u.base) return;
    var orb = u._orbBonus || {};
    PET_BONUS_ATTRS.forEach(function (k) {
      var baseOnly = (u.base[k] || 0) - (orb[k] || 0);
      sum[k] += Math.floor(baseOnly * rate);
    });
  });
  return sum;
}

/* 团队凝聚：未上场宠物基础属性 ×10% */
function teamCohesionBonus(benchPets) {
  return benchBonusSum(benchPets, TEAM_COHESION_RATE);
}

/* 「成熟 + 未受伤 + 未上场」的宠物 = 提供加成的后备阵容 */
function benchPetList(units) {
  var d = getPetStore();
  var fielded = {};
  (units || []).forEach(function (u) { fielded[u._petSpecies] = true; });
  return (d.pets || []).filter(function (p) { return canPetBattle(p) && !fielded[p.speciesId]; });
}

/* 把「团队凝聚 + 共鸣」加进参战宠物的**基础属性**（必须在 boostPetForGroup 之前调用） */
function applyBattlePetBaseBonuses(units) {
  if (!units || !units.length) return units;
  var d = getPetStore();
  var bench = benchPetList(units);
  var coh = benchBonusSum(bench, TEAM_COHESION_RATE);
  var resRate = (typeof resonanceBonus === 'function') ? resonanceBonus((d.pets || []).length) : 0;
  var res = benchBonusSum(bench, resRate);
  units.forEach(function (u) {
    PET_BONUS_ATTRS.forEach(function (k) {
      var add = (coh[k] || 0) + (res[k] || 0);
      if (add > 0) u.base[k] = (u.base[k] || 0) + add;
    });
    u.hp = u.base.hp;   // 基础值变动后同步当前血量
  });
  return units;
}

/* ============================================================
   v2.2 WP-H5：宠物属性拆解（**纯展示 / 只读**）
   doc/2.2 修改-补充.md 原话：「宠物面板现在需要显示加成值、最终属性」。
   ⚠️ 只改展示、**不改任何数值口径、不写存档**：本函数**不重写任何公式**，
      三个阶段的数都直接取自既有唯一来源 ——
        ① 基础 = `createPetUnit(pet).base`（图鉴基础 + 炼化 + 天赋静态修正，pet-codex.js）
        ② 加成 = 团队凝聚（`benchBonusSum(bench, TEAM_COHESION_RATE)`）
               + 共鸣（`benchBonusSum(bench, resonanceBonus(持有总数))`）
               —— 与 `applyBattlePetBaseBonuses()` 同源（同一对函数），只是这里把两项分开留痕
        ③ 最终 = `boostPetForGroup(同一 unit)`（百分比池 = 稀有度倍率 + Σ宝珠%，group-levels.js）
      百分比池的「稀有度百分点 / 宝珠百分点」只**读取**（`PET_GROUP_SCALE[rarity]` / `unit._orbPct`）。
      速度不参与百分比池（与 boostPetForGroup 一致）。
   ============================================================ */
var PET_STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
function petStatBreakdown(pet) {
  var zero = function () { var o = {}; PET_STAT_KEYS.forEach(function (k) { o[k] = 0; }); return o; };
  var out = { ok: false, base: zero(), cohesion: zero(), resonance: zero(), bench: zero(),
              rarityPct: 0, orbPct: {}, poolPct: {}, final: zero(),
              benchCount: 0, resonanceRate: 0, boosted: false };
  if (!pet || typeof createPetUnit !== 'function') return out;
  var u = createPetUnit(pet);
  if (!u || !u.base) return out;
  out.ok = true;
  PET_STAT_KEYS.forEach(function (k) { out.base[k] = u.base[k] || 0; });

  /* 未上场（成熟 + 未受伤 + 非本宠）的宠物基础属性 × 比例 */
  var d = getPetStore();
  var fielded = {}; fielded[pet.speciesId] = true;
  var bench = (d.pets || []).filter(function (p) { return canPetBattle(p) && !fielded[p.speciesId]; });
  var coh = benchBonusSum(bench, TEAM_COHESION_RATE);
  var resRate = (typeof resonanceBonus === 'function') ? resonanceBonus((d.pets || []).length) : 0;
  var res = benchBonusSum(bench, resRate);
  out.benchCount = bench.length;
  out.resonanceRate = resRate;
  PET_BONUS_ATTRS.forEach(function (k) { u.base[k] = (u.base[k] || 0) + (coh[k] || 0) + (res[k] || 0); });
  u.hp = u.base.hp;
  PET_STAT_KEYS.forEach(function (k) {
    out.cohesion[k] = coh[k] || 0;
    out.resonance[k] = res[k] || 0;
    out.bench[k] = u.base[k] || 0;
  });

  out.rarityPct = ((typeof PET_GROUP_SCALE !== 'undefined') && PET_GROUP_SCALE[pet.rarity]) || 0;
  out.orbPct = u._orbPct || {};
  if (typeof boostPetForGroup === 'function') { boostPetForGroup(u); out.boosted = true; }
  PET_STAT_KEYS.forEach(function (k) {
    out.final[k] = u.base[k] || 0;
    out.poolPct[k] = (k === 'spd') ? 0 : (out.rarityPct + (out.orbPct[k] || 0));
  });
  return out;
}

/* ============================================================
   v2.2 WP-I A-6：属性区**展示口径辅助**（作者要求「加成统一用 ×N% 表达」）
   ⚠️ **纯展示**：不产生任何新数值、不改公式、不写存档 ——
      输入是上面 `petStatBreakdown()` 已经算好的字段，
      输出只是给 UI 打印用的整数「倍数百分比」。
   · benchMultPct = 凝聚＋共鸣 把本宠「基础」抬到「上场基础」的倍数（bench ÷ base）
   · poolMultPct  = 倍率池倍数（稀有度% ＋ Σ宝珠%；速度不参与 → 100）
   · orbMultPct   = 宝珠自身倍数（100 ＋ 该属性宝珠%，未装配 = 100）
   · statMultPct  = 基础 → 最终 的总倍数（＝上两者之积）
   引擎（`group-levels.js` 的 `boostPetForGroup`）本身就是「先把凝聚/共鸣加进基础值、
   再把整块乘倍率池」，所以「上两者之积」与引擎结果同源；四舍五入可能带来 ±1 的
   **显示**偏差（引擎结果另由 `bd.final` 原样展示），不是口径差异。
   base ≤ 0 时返回 null → UI 显示「×—」（无法表达为倍数）。
   ============================================================ */
function petStatBaseOf(bd, k) { return (bd && bd.base && bd.base[k]) || 0; }
function petBenchMultPct(bd, k) {
  if (!bd || !bd.ok) return null;
  var b = petStatBaseOf(bd, k);
  if (b <= 0) return null;
  return Math.round(((bd.bench[k] || 0) * 100) / b);
}
function petPoolMultPct(bd, k) {
  if (!bd || !bd.ok) return null;
  if (k === 'spd') return 100;                    // 速度不参与百分比池（与 boostPetForGroup 一致）
  return bd.poolPct[k] || 0;
}
function petOrbMultPct(bd, k) {
  if (!bd || !bd.ok) return null;
  return 100 + ((bd.orbPct || {})[k] || 0);
}
function petStatMultPct(bd, k) {
  if (!bd || !bd.ok) return null;
  var b = petStatBaseOf(bd, k);
  if (b <= 0) return null;
  return Math.round(((bd.bench[k] || 0) * (petPoolMultPct(bd, k) || 0)) / b);
}

/* 对比：**只列主要几项**（作者要求「只显示主要几项即可，别塞满」） */
var PET_COMPARE_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];
/* 对比口径（UI 必须写明）：两只宠**都用「此宠上场计算」** ——
   即各自走 `petStatBreakdown()`，与详情面板展示的是同一个口径，
   杜绝「拿 A 的上场值比 B 的基础值」。两宠各自把对方算作「未上场后备」，
   与引擎「本场谁上场」的语义一致（同一次对比里口径完全一致）。
   @returns {{ok:boolean, baseline:'fielded', rows:[{key,a,b,diff}]}}  diff = 对比宠 − 本宠 */
function petCompareFinal(petA, petB) {
  var a = (typeof petStatBreakdown === 'function') ? petStatBreakdown(petA) : { ok: false };
  var b = (typeof petStatBreakdown === 'function') ? petStatBreakdown(petB) : { ok: false };
  var rows = PET_COMPARE_KEYS.map(function (k) {
    var av = a.ok ? (a.final[k] || 0) : null;
    var bv = b.ok ? (b.final[k] || 0) : null;
    return { key: k, a: av, b: bv, diff: (av == null || bv == null) ? null : (bv - av) };
  });
  return { ok: !!(a.ok && b.ok), baseline: 'fielded', rows: rows };
}

/* ============================================================
   v2.2 WP-A3/A4：敌群参战宠物的**唯一入口**
   = 建单位 → 基础值加成（团队凝聚 / 共鸣）→ 稀有度放大（百分比池）。
   ⚠️ 顺序不能反：基础值必须在百分比池之前进入，否则两类加成的性质就变了。
   三个调用点（`game-render.js` / `pet-ui.js` / `debug.js`）统一走这里，
   避免「三处各自判断导致口径分叉」（同 `groupStageEnemies` 的教训）。
   ============================================================ */
function buildGroupBattlePets(petIds, maxRoster) {
  var units = createPetUnitsForBattle(petIds, maxRoster);
  applyBattlePetBaseBonuses(units);
  /* WP-G：角色等级系统的**宠物档**效果 —— 同为基础属性部分，必须与凝聚/共鸣一样
     加在 `boostPetForGroup()`（百分比池）**之前**（否则 +10~+40 会被 ×12~16 二次放大）。
     未加载 level-system.js 时静默跳过。 */
  if (typeof applyPetLevelBaseBonuses === 'function') applyPetLevelBaseBonuses(units);
  units.forEach(function (u) { if (typeof boostPetForGroup === 'function') boostPetForGroup(u); });
  /* v2.2.5（WP-B 共享桥，推翻 OQ-11）：玩家**已装配**的暴击/格挡/气力恢复 → 按**宠物档**挂到参战宠物。
     单向（玩家 → 宠物），不反向污染玩家档；本模块未加载时静默跳过。 */
  if (typeof attachPetSharedSkills === 'function') attachPetSharedSkills(units);
  return units;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.PET_BATTLE_MAX = PET_BATTLE_MAX;
  window.TEAM_COHESION_RATE = TEAM_COHESION_RATE;
  window.getPetStore = getPetStore;
  window.savePetStore = savePetStore;
  window.grantStarterPet = grantStarterPet;
  window.grantMaterial = grantMaterial;
  window.settleAllPets = settleAllPets;
  window.monthlyResetPets = monthlyResetPets;
  window.hatchAllEggs = hatchAllEggs;
  window.getBattleReadyPets = getBattleReadyPets;
  window.healAllInjuredPets = healAllInjuredPets;
  window.petStatBreakdown = petStatBreakdown;
  window.petStatMultPct = petStatMultPct;
  window.petBenchMultPct = petBenchMultPct;
  window.petPoolMultPct = petPoolMultPct;
  window.petOrbMultPct = petOrbMultPct;
  window.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  window.petCompareFinal = petCompareFinal;
  window.getPetBattlePicks = getPetBattlePicks;
  window.savePetBattlePicks = savePetBattlePicks;
  window.createPetUnitsForBattle = createPetUnitsForBattle;
  window.teamCohesionBonus = teamCohesionBonus;
  window.benchBonusSum = benchBonusSum;
  window.benchPetList = benchPetList;
  window.applyBattlePetBaseBonuses = applyBattlePetBaseBonuses;
  window.buildGroupBattlePets = buildGroupBattlePets;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_BATTLE_MAX = PET_BATTLE_MAX;
  globalThis.TEAM_COHESION_RATE = TEAM_COHESION_RATE;
  globalThis.getPetStore = getPetStore;
  globalThis.savePetStore = savePetStore;
  globalThis.grantStarterPet = grantStarterPet;
  globalThis.grantMaterial = grantMaterial;
  globalThis.settleAllPets = settleAllPets;
  globalThis.monthlyResetPets = monthlyResetPets;
  globalThis.hatchAllEggs = hatchAllEggs;
  globalThis.getBattleReadyPets = getBattleReadyPets;
  globalThis.healAllInjuredPets = healAllInjuredPets;
  globalThis.petStatBreakdown = petStatBreakdown;
  globalThis.petStatMultPct = petStatMultPct;
  globalThis.petBenchMultPct = petBenchMultPct;
  globalThis.petPoolMultPct = petPoolMultPct;
  globalThis.petOrbMultPct = petOrbMultPct;
  globalThis.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  globalThis.petCompareFinal = petCompareFinal;
  globalThis.getPetBattlePicks = getPetBattlePicks;
  globalThis.savePetBattlePicks = savePetBattlePicks;
  globalThis.createPetUnitsForBattle = createPetUnitsForBattle;
  globalThis.teamCohesionBonus = teamCohesionBonus;
  globalThis.benchBonusSum = benchBonusSum;
  globalThis.benchPetList = benchPetList;
  globalThis.applyBattlePetBaseBonuses = applyBattlePetBaseBonuses;
  globalThis.buildGroupBattlePets = buildGroupBattlePets;
}

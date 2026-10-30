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

/* ============================================================
   v2.3 WP-I：**结算按钮的可用判据**（作者原话：「结算按钮没有用就隐藏，有用再显示」）
   —— 纯函数、只读、不写存档。

   ⚠️ 判据**逐条镜像** `settleAllPets()` → `settlePet()`（pets.js:172）的实际分支，
      不新增任何业务条件（也不看受伤 / 产出 / 材料 —— 结算与它们无关）：
        · `!pet.lastSettleDate`      → settlePet 走首日分支：写 today + 产出 1 条「开始记录」事件；
        · `pet.isDead`               → settlePet 直接 return []（**点了也不会变**）；
        · `daysBetween(上次, 今天)>0` → settlePet 真的逐日推进（ageDays / 饥饿 / 成长 / 孵化 / 阵亡）。
      三者之外（今天已结算过且无离线天数、存档里没有宠物）点一下**没有任何可观察变化**，
      故按钮应隐藏。已阵亡且日期陈旧的宠物单独统计（dead），便于解释「为什么按钮没了」。
   @returns {{ready:boolean, due:number, firstTimers:number, dead:number, total:number, today:string}}
   ============================================================ */
function petSettleStatus(d, now) {
  d = d || getPetStore();
  var today = dateKey(now || new Date());
  var pets = d.pets || [];
  var due = 0, firstTimers = 0, dead = 0;
  pets.forEach(function (pet) {
    if (!pet) return;
    if (!pet.lastSettleDate) { firstTimers++; return; }        // settlePet 首日分支（会写 lastSettleDate）
    if (pet.isDead) { dead++; return; }                        // settlePet 对已阵亡直接跳过
    if (daysBetween(pet.lastSettleDate, today) > 0) due++;      // 真正会推进天数
  });
  return {
    ready: (due + firstTimers) > 0,
    due: due, firstTimers: firstTimers, dead: dead,
    total: pets.length, today: today
  };
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

/* ============================================================
   v2.15：**营养液 ⇄ 宠物粮 互兑的唯一落盘入口**（作者原话「让营养液与宠物粮
   可以 1:2 互相兑换（2 换 1）」）
   · 比例 / 整组 / 不足判据 / 原因文案**全部**在 pet-materials.js 的
     `exchangeNutritionFeed()`（唯一来源），本函数只做「读存档 → 兑换 → 立即落盘」；
   · UI **只调这里**（不自己 get/save、不自己写 2 这个数字）；
   · 失败不写盘（与 exchangeRefineStones 的既有行为一致：不足就一个都不扣）。
   @param {'nutrition'|'feed'} from 用哪种材料去换（另一端自动推导）
   @param {number} times 整组次数（缺省 1）
   @returns {{ok,from?,to?,spent?,gained?,fromBalance?,toBalance?,reason?}} */
function exchangePetMaterials(from, times) {
  var d = getPetStore();
  if (typeof exchangeNutritionFeed !== 'function') return { ok: false, reason: '材料模块未加载' };
  var r = exchangeNutritionFeed(d.materials, from, times);
  if (r.ok) savePetStore(d);       // 立即落盘：刷新/重开后台都保持
  return r;
}

/* 只读：面板渲染互兑按钮的可用态与原因（**不写存档**） */
function petMatExchangeInfo() {
  if (typeof matExchangeView !== 'function') return { rate: 0, rows: [] };
  return matExchangeView(getPetStore().materials);
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

/* ============================================================
   v2.14.2（修真实 bug「宠物面板加成一直增加」）：**纯计算**的加成明细
   ⚠️ 本函数**不得修改入参**：`units` 只被读取 —— 不写 base / hp / 任何字段，
      所有结果都在**返回对象**里：
        · cohesion      团队凝聚（每属性一个整数）
        · resonance     共鸣（每属性一个整数）
        · total         cohesion + resonance（真正要加到基础属性上的量）
        · resonanceRate 共鸣档位（按持有总数）
        · benchCount    提供加成的未上场宠数量
   两个消费方（`applyBattlePetBaseBonuses` / `petStatBreakdown`）都从这里取数，
   保证「面板显示」与「实战建场」是**同一份**加成，不会各算一套。
   ============================================================ */
function petBaseBonusView(units) {
  var d = getPetStore();
  var bench = benchPetList(units);
  var coh = benchBonusSum(bench, TEAM_COHESION_RATE);
  var resRate = (typeof resonanceBonus === 'function') ? resonanceBonus((d.pets || []).length) : 0;
  var res = benchBonusSum(bench, resRate);
  var total = {};
  PET_BONUS_ATTRS.forEach(function (k) { total[k] = (coh[k] || 0) + (res[k] || 0); });
  return { cohesion: coh, resonance: res, total: total,
           resonanceRate: resRate, benchCount: bench.length };
}

/* 「上一次已经写进 base 的加成」登记表（WeakMap；兜底＝不可枚举属性）。
   为什么需要它：`applyBattlePetBaseBonuses()` 的既有契约是**把加成写进 u.base**
   （`buildGroupBattlePets` 的管道、以及两套受保护的既有断言都依赖这一点），但它
   **绝不能累加** —— 同一批单位被复用 / 重复渲染时再 `+=` 就会一路往上爬。
   所以每次按「当前 base − 上次那层 ＋ 本次这层」**反算**：
     · 首次调用：上次 = 0 → 结果与修前**逐值一致**（既没涨也没少）；
     · 再调一次：等于把上次那层换成本次的 → 数值恒定，不会涨；
     · 两次之间若有人合法改过 base（例如 WP-G 的等级增益），那份改动会被**保住**
       （这也是不存「原始基线快照」而存「已加的加成」的原因）。
   ⚠️ 不放在单位上做可枚举字段 —— 否则会进 groupSnapshot / 战斗日志 / JSON 快照。 */
var _petAppliedBonus = (typeof WeakMap === 'function') ? new WeakMap() : null;
function petAppliedBonusOf(u) {
  if (_petAppliedBonus) return _petAppliedBonus.get(u) || null;
  return u._petAppliedBonus || null;            // 没有 WeakMap 的兜底：不可枚举属性
}
function petSetAppliedBonus(u, rec) {
  if (_petAppliedBonus) { _petAppliedBonus.set(u, rec); return; }
  try {
    Object.defineProperty(u, '_petAppliedBonus', { value: rec, enumerable: false, configurable: true, writable: true });
  } catch (e) {
    // 忽略：极旧环境没有 defineProperty（或对象不可扩展）→ 退回普通字段，
    // 只是会多一个可枚举属性，基线语义仍然正确（不会累加）。
    u._petAppliedBonus = rec;
  }
}

/* 把「团队凝聚 + 共鸣」加进参战宠物的**基础属性**（必须在 boostPetForGroup 之前调用）。
   ⚠️ v2.14.2：写的是「换掉上一次那层、加上本次这层」的**反算值**，不再 `base += add` ——
      同一批单位连续调用 10 次数值完全不变（修前每调一次就多叠一层；
      回归测试 scripts/test-pet-bonus-stability.js）。
   ⚠️ 本函数是「写进 u.base」的**兼容层**（建场管道与受保护断言依赖该契约）；
      **需要纯计算 / 不碰入参请用 `petBaseBonusView(units)`（它一行都不写入参）**。 */
function applyBattlePetBaseBonuses(units) {
  if (!units || !units.length) return units;
  var bonus = petBaseBonusView(units);            // 纯：不碰任何单位
  units.forEach(function (u) {
    if (!u || !u.base) return;
    var prev = petAppliedBonusOf(u) || {};
    var rec = {};
    PET_BONUS_ATTRS.forEach(function (k) {
      var add = bonus.total[k] || 0;
      var prevAdd = prev[k] || 0;
      rec[k] = add;
      if (!add && !prevAdd) return;                       // 恒无加成 → 一个字节都不动（与修前一致）
      u.base[k] = (u.base[k] || 0) - prevAdd + add;       // 换掉上次那层，绝不累加
    });
    petSetAppliedBonus(u, rec);
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
               —— 与 `applyBattlePetBaseBonuses()` 同源（同一份 `petBaseBonusView`），只是这里把两项分开留痕
        ③ 最终 = `boostPetForGroup(同一 unit)`（百分比池 = 稀有度倍率 + Σ宝珠%，group-levels.js）
      百分比池的「稀有度百分点 / 宝珠百分点」只**读取**（`PET_GROUP_SCALE[rarity]` / `unit._orbPct`）。
      速度不参与百分比池（与 boostPetForGroup 一致）。

   🔴 v2.14.2 修复（真实 bug「宠物面板加成一直增加」）：
      **本函数不得修改入参**（也不得写回 `createPetUnit()` 产物）。修前这里有一行
      `u.base[k] = (u.base[k] || 0) + coh[k] + res[k]`，接着又让 `boostPetForGroup(u)`
      把 `u.base` **就地**乘掉 —— 只要传进来的是「非一次性克隆」的单位（缓存 / 存档 /
      同一对象多次渲染），每渲染一次就多叠一层凝聚+共鸣，面板读数一路往上爬。
      现在「带加成的基础值」只算进**局部对象**并以 `out.baseWithBonus`（= `out.bench`）
      **显式返回**；`boostPetForGroup` 只作用于局部副本 → 本函数零写入、可重复调用。
   ============================================================ */
var PET_STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];

/* 单位浅副本（换掉 base）—— 给 `boostPetForGroup()` 这种**就地乘法**用。
   ⚠️ 只为「不碰原单位」而存在：tags / _orbPct / _skillLevels 等字段按引用沿用，
      与原单位语义一致（boostPetForGroup 只读 tags/_orbPct，只写 base/hp）。 */
function petUnitWithBase(u, base) {
  var c = {};
  for (var k in u) { if (Object.prototype.hasOwnProperty.call(u, k)) c[k] = u[k]; }
  c.base = base;
  return c;
}

function petStatBreakdown(pet) {
  var zero = function () { var o = {}; PET_STAT_KEYS.forEach(function (k) { o[k] = 0; }); return o; };
  var out = { ok: false, base: zero(), cohesion: zero(), resonance: zero(), bench: zero(),
              baseWithBonus: zero(),
              rarityPct: 0, orbPct: {}, poolPct: {}, final: zero(),
              benchCount: 0, resonanceRate: 0, boosted: false };
  if (!pet || typeof createPetUnit !== 'function') return out;
  var u = createPetUnit(pet);
  if (!u || !u.base) return out;
  out.ok = true;
  PET_STAT_KEYS.forEach(function (k) { out.base[k] = u.base[k] || 0; });

  /* 未上场（成熟 + 未受伤 + 非本宠）的宠物基础属性 × 比例 ——
     与 `applyBattlePetBaseBonuses()` **同一份来源**（`petBaseBonusView`），
     用一个「假单位」只把 speciesId 交给它（`benchPetList` 只读 `_petSpecies`）。 */
  var vb = petBaseBonusView([{ _petSpecies: pet.speciesId }]);
  var coh = vb.cohesion;
  var res = vb.resonance;
  out.benchCount = vb.benchCount;
  out.resonanceRate = vb.resonanceRate;
  /* ⚠️ 本函数不得修改入参：带加成的基础值算进**局部** withBonus，
     不写 `u.base`（写成 `u.base[k] = (u.base[k] || 0) + …` 就是「加成一直涨」的源头）。 */
  var withBonus = {};
  PET_STAT_KEYS.forEach(function (k) {
    var add = (PET_BONUS_ATTRS.indexOf(k) > -1) ? ((coh[k] || 0) + (res[k] || 0)) : 0;   // 速度不参与
    withBonus[k] = (out.base[k] || 0) + add;
  });
  PET_STAT_KEYS.forEach(function (k) {
    out.cohesion[k] = coh[k] || 0;
    out.resonance[k] = res[k] || 0;
    out.bench[k] = withBonus[k];
    out.baseWithBonus[k] = withBonus[k];      // 显式返回「带加成的基础值」（＝bench，留着更清楚）
  });

  out.rarityPct = ((typeof PET_GROUP_SCALE !== 'undefined') && PET_GROUP_SCALE[pet.rarity]) || 0;
  out.orbPct = u._orbPct || {};
  if (typeof boostPetForGroup === 'function') {
    /* 百分比池是**就地乘法**，只作用于局部副本 pb —— 原单位 u 一个字段都不动 */
    var pb = petUnitWithBase(u, withBonus);
    boostPetForGroup(pb);
    out.boosted = true;
    PET_STAT_KEYS.forEach(function (k) { out.final[k] = pb.base[k] || 0; });
  } else {
    PET_STAT_KEYS.forEach(function (k) { out.final[k] = withBonus[k] || 0; });
  }
  PET_STAT_KEYS.forEach(function (k) {
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

/* ============================================================
   v2.14.4：② 段「可解释的两行」的**唯一数值来源**（纯展示 / 只读）
   作者实测反馈：② 只有一个合成倍数（梦幻 UR 生命 ×2846% / 小负鼠 SSR ×8505%）
   「看不懂」。核算下来算术与口径都对 —— 那个数其实是三件事乘在一起的结果：
       稀有度倍率 / Σ宝珠% / 凝聚＋共鸣把基数抬高后的放大
   UR 基数大 → 比值低；SSR 基数小、又被凝聚/共鸣垫了一层固定值 → 比值爆表。
   所以这里把 `petStatBreakdown()` **已有的**中间量逐属性显式露出成两行：
     · 倍率池（%）：`rarityPct ＋ orbPct[k]`（两项**相加**，= `bd.poolPct[k]`）
     · 基数加值：`bench − base`（凝聚＋共鸣的绝对值）＋ 占基数的比例
   ⚠️ 本组函数**不重写任何公式、不产生新数值**：每个数都直接读 bd 的既有字段
      （唯一来源仍是 group-levels.js 的 `boostPetForGroup` ＋ 本文件的 `petBaseBonusView`），
      UI 只把它们拼成文本，**不在 UI 里重算一遍**。
   ⚠️ 速度不参与百分比池、也不吃凝聚/共鸣（见 `PET_BONUS_ATTRS`）：
      participates=false、poolMultPct=100、baseAdd=0（与 v2.2 起的 ×100% 语义一致）。
   ============================================================ */
function petBonusRow(bd, k, rarityTag) {
  var ok = !!(bd && bd.ok);
  var base = ok ? ((bd.base || {})[k] || 0) : 0;
  var bench = ok ? ((bd.bench || {})[k] || 0) : 0;
  var inPool = PET_BONUS_ATTRS.indexOf(k) > -1;
  var add = bench - base;                                  // 凝聚＋共鸣（速度恒 0）
  var poolPct = ok ? ((bd.poolPct || {})[k] || 0) : 0;
  /* 稀有度标签只在「与 bd.rarityPct 对得上」时才给（对不上就不编一个） */
  var tag = (rarityTag && typeof PET_GROUP_SCALE !== 'undefined' &&
             PET_GROUP_SCALE[rarityTag] === (ok ? (bd.rarityPct || 0) : 0)) ? rarityTag : null;
  return {
    key: k,
    participates: inPool,                                  // 速度 = false
    rarity: tag,
    base: base,
    cohesion: ok ? ((bd.cohesion || {})[k] || 0) : 0,
    resonance: ok ? ((bd.resonance || {})[k] || 0) : 0,
    baseAdd: add,
    baseAddPct: (base > 0) ? Math.round(add * 100 / base) : null,
    bench: bench,
    rarityPct: ok ? (bd.rarityPct || 0) : 0,
    orbPct: ok ? (((bd.orbPct || {})[k]) || 0) : 0,
    poolPct: poolPct,                                      // 速度 = 0（不参与）
    poolMultPct: inPool ? poolPct : 100,                   // 展示口径：速度固定 ×100%
    final: ok ? ((bd.final || {})[k] || 0) : 0
  };
}
/* 逐属性两行的整份摘要（含「谁在垫基数」所需的只数 / 档位）。
   ⚠️ 档位同时给出**小数**（cohesionRate / resonanceRate，与 `petBaseBonusView` 同源）
      和**已换算好的整数百分比**（cohesionPct / resonancePct）—— 后者专供 UI 打印，
      免得 UI 里再写一次 `× 100`（口径与换算都留在本文件）。
   @returns {{ok,rarity,benchCount,cohesionRate,resonanceRate,cohesionPct,resonancePct,rows:Array}} */
function petBonusLines(bd, rarityTag) {
  var resRate = (bd && bd.resonanceRate) || 0;
  return {
    ok: !!(bd && bd.ok),
    rarity: rarityTag || null,
    benchCount: (bd && bd.benchCount) || 0,
    cohesionRate: TEAM_COHESION_RATE,
    resonanceRate: resRate,
    cohesionPct: Math.round(TEAM_COHESION_RATE * 100),
    resonancePct: Math.round(resRate * 100),
    rows: PET_STAT_KEYS.map(function (k) { return petBonusRow(bd, k, rarityTag); })
  };
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
  window.petSettleStatus = petSettleStatus;
  window.monthlyResetPets = monthlyResetPets;
  window.hatchAllEggs = hatchAllEggs;
  window.getBattleReadyPets = getBattleReadyPets;
  window.healAllInjuredPets = healAllInjuredPets;
  window.petStatBreakdown = petStatBreakdown;
  window.petStatMultPct = petStatMultPct;
  window.petBenchMultPct = petBenchMultPct;
  window.petPoolMultPct = petPoolMultPct;
  window.petOrbMultPct = petOrbMultPct;
  window.petBonusRow = petBonusRow;
  window.petBonusLines = petBonusLines;
  window.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  window.petCompareFinal = petCompareFinal;
  window.getPetBattlePicks = getPetBattlePicks;
  window.savePetBattlePicks = savePetBattlePicks;
  window.exchangePetMaterials = exchangePetMaterials;
  window.petMatExchangeInfo = petMatExchangeInfo;
  window.createPetUnitsForBattle = createPetUnitsForBattle;
  window.teamCohesionBonus = teamCohesionBonus;
  window.benchBonusSum = benchBonusSum;
  window.benchPetList = benchPetList;
  window.petBaseBonusView = petBaseBonusView;
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
  globalThis.petSettleStatus = petSettleStatus;
  globalThis.monthlyResetPets = monthlyResetPets;
  globalThis.hatchAllEggs = hatchAllEggs;
  globalThis.getBattleReadyPets = getBattleReadyPets;
  globalThis.healAllInjuredPets = healAllInjuredPets;
  globalThis.petStatBreakdown = petStatBreakdown;
  globalThis.petStatMultPct = petStatMultPct;
  globalThis.petBenchMultPct = petBenchMultPct;
  globalThis.petPoolMultPct = petPoolMultPct;
  globalThis.petOrbMultPct = petOrbMultPct;
  globalThis.petBonusRow = petBonusRow;
  globalThis.petBonusLines = petBonusLines;
  globalThis.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  globalThis.petCompareFinal = petCompareFinal;
  globalThis.getPetBattlePicks = getPetBattlePicks;
  globalThis.savePetBattlePicks = savePetBattlePicks;
  globalThis.exchangePetMaterials = exchangePetMaterials;
  globalThis.petMatExchangeInfo = petMatExchangeInfo;
  globalThis.createPetUnitsForBattle = createPetUnitsForBattle;
  globalThis.teamCohesionBonus = teamCohesionBonus;
  globalThis.benchBonusSum = benchBonusSum;
  globalThis.benchPetList = benchPetList;
  globalThis.petBaseBonusView = petBaseBonusView;
  globalThis.applyBattlePetBaseBonuses = applyBattlePetBaseBonuses;
  globalThis.buildGroupBattlePets = buildGroupBattlePets;
}

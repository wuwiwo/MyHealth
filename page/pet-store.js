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
   v2.16（作者裁决，**以第二段为准**）：宠物「凝聚 / 共鸣」口径重写 ——
   本节是这条口径的**唯一来源**（纯计算核心 = `petBonusAdditivePool()`，
   池的唯一出口 = `group-levels.js` 的 `boostPetForGroup()`）。

   唯一公式：
     ① 凝聚 S凝聚[k]  ← **固定值**，与基础**相加**（速度不参与）
        S凝聚[k] = 3% × Σ(所有【成熟期】宠物该属性 base)
     ② 共鸣 S共鸣%    ← **百分比**，按稀有度逐只**相加**（只统计【成熟期】）
        S共鸣%   = Σ(每只成熟期宠物的稀有度档位)   UR 10 / SSR 8 / SR 7 / R 6
     ③ 加成合计%[k]   = 稀有度%(本宠) ＋ Σ宝珠%[k](本宠) ＋ S共鸣%
     ④ 最终[k]        = floor( (base[k] ＋ S凝聚[k]) × 加成合计%[k] / 100 )
     速度 spd         = base.spd（不参与凝聚、不参与百分比池 —— 沿用现状语义）

   ⚠️ **硬性不变量**：S凝聚[k] 与 S共鸣% 都是**全局常量** —— 同一存档下，
      每只宠看到的这两个值**完全相同**（作者原话「所有宠物的 Σ共鸣、Σ凝聚 应该会是相同的」）。
      它们只取决于「存档里有几只成熟期宠物、各自的基础 / 稀有度」，
      与本宠是谁、谁上场、本宠的稀有度都无关。
   ⚠️ **只筛阶段**：凝聚 / 共鸣只统计 `stage === 'mature'`（蛋期 / 成长期不计）。
      受伤 / 阵亡**不另外筛**（作者只说「成熟期」，按字面只筛阶段；
      阵亡宠的 `stage` 仍是受伤时的那个阶段，不额外排除）。
   ⚠️ 与 v2.15（凝聚/共鸣都折成「贡献值 ÷ 本宠基础」的百分比进池）的区别：
      凝聚从「百分比」改回「**固定值加在基础上**」；共鸣从「贡献值折算」改为
      「按稀有度**逐只相加**的百分点」。池里从此只剩三项
      （稀有度 ＋ Σ宝珠 ＋ Σ共鸣），v2.15 里那两个由「全部宠物之和」折算出来的
      百分项**已全部清掉**（没有任何残留项，见 test-pet-bonus-cohesion-resonance §2）。
   ============================================================ */
var TEAM_COHESION_PCT = 3;                         // 凝聚：每只成熟期宠物该属性基础的 3%
var TEAM_COHESION_RATE = TEAM_COHESION_PCT / 100; // 小数形态（与上一行同源，不另取值）
/* 共鸣：每只【成熟期】宠物按稀有度提供的百分点，**相加**（作者给定档位） */
var PET_RESONANCE_SCALE = { UR: 10, SSR: 8, SR: 7, R: 6 };
var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];   // 速度不参与（与 A1 公式一致）
var PET_STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];

/* 稀有度 → 共鸣档位（百分点）。未知 / 缺失一律回退 R（与 `petUnitRarityPct` 的回退一致）。
   ⚠️ 新口径**不再**使用 pets.js 的 `resonanceBonus(持有总数)`（那是「按只数取档」的旧口径）；
      该函数仍作为历史 API 留在 pets.js（既有断言仍按它自己跑），但**不在本公式链路上**。 */
function petRarityResonancePct(rarity) {
  return PET_RESONANCE_SCALE[rarity] || PET_RESONANCE_SCALE.R;
}

/* ============================================================
   **一次扫描**给出凝聚 / 共鸣需要的全部原料（新口径唯一的取数口）
     · allBaseSum     = 存档里**每一条**宠物的 base 之和（信息性口径；**不参与公式**）
     · matureBaseSum  = **只统计 `stage === 'mature'`** 的 base 之和 → 凝聚的分母
     · resonancePct   = Σ(每只成熟期宠物的稀有度档位)            → 共鸣（百分点）
     · allCount / matureCount
   「全部」与「成熟期」共用同一次 `createPetUnit()` —— 两套口径不可能各算一套。
   ⚠️ 唯一的统计条件就是阶段（`stage === 'mature'`）：
      · 受伤 / 阵亡 —— **不另外筛**（作者只说「成熟期」，按字面只筛阶段）
      · 本宠 / 参战宠 —— 都算（成熟期就在里面）
   ⚠️ 只读：`createPetUnit()` 每次返回新对象，这里一个字段都不写回存档 / 不写回宠物。
   ============================================================ */
function petTeamBaseScan(d) {
  d = d || getPetStore();
  var all = {}, mat = {};
  PET_STAT_KEYS.forEach(function (k) { all[k] = 0; mat[k] = 0; });
  var resPct = 0, matureCount = 0;
  (d.pets || []).forEach(function (pet) {           // 逐条都看 —— 不 filter / 不 find
    if (!pet || typeof createPetUnit !== 'function') return;
    var u = createPetUnit(pet);
    if (!u || !u.base) return;                      // 图鉴缺失的脏存档：跳过（计 0，不抛错）
    var isMature = (pet.stage === 'mature');        // **唯一**的筛选条件
    PET_STAT_KEYS.forEach(function (k) {
      var v = u.base[k] || 0;
      all[k] += v;
      if (isMature) mat[k] += v;
    });
    if (isMature) {
      matureCount++;
      resPct += petRarityResonancePct(((u.tags || [])[1] || 'R'));
    }
  });
  return { allBaseSum: all, matureBaseSum: mat, allCount: (d.pets || []).length,
           matureCount: matureCount, resonancePct: resPct };
}

/* 全部宠物（不筛阶段 / 伤病）—— 信息性口径，**不参与**凝聚 / 共鸣的公式 */
function petAllPetsBaseSum(d) { return petTeamBaseScan(d).allBaseSum; }
/* 【成熟期】宠物该属性基础之和 —— 凝聚的唯一取数口 */
function petMatureBaseSum(d) { return petTeamBaseScan(d).matureBaseSum; }
/* Σ共鸣%（百分点）—— 共鸣的唯一取数口 */
function petTeamResonancePct(d) { return petTeamBaseScan(d).resonancePct; }

/* 单位 → 稀有度百分点（口径与 `boostPetForGroup` 一致：tags[1] 是稀有度，未知回退 R） */
function petUnitRarityPct(unit) {
  if (typeof PET_GROUP_SCALE === 'undefined' || !PET_GROUP_SCALE) return 0;
  var tag = ((unit && unit.tags) || [])[1] || 'R';
  return PET_GROUP_SCALE[tag] || PET_GROUP_SCALE.R || 0;
}

/* ============================================================
   🔴 新口径的**纯计算核心**（唯一公式实现）—— **不得修改入参**
   @param {Object} matureBaseSum 【成熟期】宠物该属性的基础合计（`petMatureBaseSum()` 的产物）
   @param {Object} selfBase     本宠该属性的基础（`createPetUnit().base` 原样，不含任何加成）
   @param {number} rarityPct    稀有度百分点（1200 / 1400 / 1500 / 1600）
   @param {Object} orbPct       本宠 Σ宝珠%（逐属性）
   @param {number} resonancePct Σ共鸣%（百分点；UR 10 / SSR 8 / SR 7 / R 6 **逐只相加**）
   @returns {{ok:boolean, participates:Object, rarityPct:number, orbPct:Object,
              cohesion:Object, resonancePct:number, totalPct:Object, final:Object}}
     · cohesion[k]  = S凝聚[k]（**固定值** = 成熟期之和 × 3%）—— 同一存档下每只宠完全相同
     · resonancePct = S共鸣%（**全局一个数**）—— 同一存档下每只宠完全相同
     · totalPct[k]  = rarityPct ＋ orbPct[k] ＋ resonancePct（三项加算，同一层）
     · final[k]     = max(1, floor((selfBase[k] ＋ cohesion[k]) × totalPct[k] ÷ 100))
     · 速度：participates=false、cohesion=0、totalPct=100、final = 基础
   ⚠️ 本函数**一行都不写**入参（不写 matureBaseSum / selfBase / orbPct，也不写任何单位对象）：
      两个消费方（`applyBattlePetBaseBonuses` / `petStatBreakdown`）都只从这里取数。
   ⚠️ soulDef 的既有下限（≥ ⌊放大后 def ÷ 2⌋）在末尾**原样保留**（不是新口径），
      与 `boostPetForGroup()` 的收尾顺序一致（先全部乘完，再抬魂防）。
   ============================================================ */
function petBonusAdditivePool(matureBaseSum, selfBase, rarityPct, orbPct, resonancePct) {
  var sum = matureBaseSum || {};
  var base = selfBase || {};
  var orbs = orbPct || {};
  var rar = (typeof rarityPct === 'number' && isFinite(rarityPct)) ? rarityPct : 0;
  var resPct = (typeof resonancePct === 'number' && isFinite(resonancePct)) ? resonancePct : 0;
  var out = { ok: true, participates: {}, rarityPct: rar, orbPct: {},
              cohesion: {}, resonancePct: resPct, totalPct: {}, final: {} };
  PET_STAT_KEYS.forEach(function (k) {
    var inPool = PET_BONUS_ATTRS.indexOf(k) > -1;
    var b = (typeof base[k] === 'number' && isFinite(base[k])) ? base[k] : 0;
    var orb = (typeof orbs[k] === 'number' && isFinite(orbs[k])) ? orbs[k] : 0;
    /* 凝聚固定值：先乘整数百分点再 ÷100（而不是 ×0.03），避免二进制误差污染 final 的 floor 边界 */
    var coh = inPool ? ((sum[k] || 0) * TEAM_COHESION_PCT / 100) : 0;
    var total = inPool ? (rar + orb + resPct) : 100;       // 速度 = ×100%（不参与）
    out.participates[k] = inPool;
    out.orbPct[k] = orb;
    out.cohesion[k] = coh;
    out.totalPct[k] = total;
    out.final[k] = inPool ? Math.max(1, Math.floor((b + coh) * total / 100)) : b;
  });
  /* 既有规则（未改）：魂防下限 = 放大后防御的一半（否则被敌人魂攻打全额） */
  out.final.soulDef = Math.max(out.final.soulDef || 0, Math.floor((out.final.def || 0) * 0.5));
  return out;
}

/* 「凝聚（固定值）／共鸣（Σ%）」在单位上的挂载点。
   ⚠️ 存**非枚举**属性 / WeakMap：不进 groupSnapshot / 战斗日志 / JSON 快照
      （与 v2.14.2 的 `_petAppliedBonus` 同一手法）。
   `boostPetForGroup()` 只读它、只做「(基础 ＋ 凝聚) × (稀有度 ＋ Σ宝珠 ＋ Σ共鸣)」——
   **池的唯一出口仍是那个函数**。 */
var _petBenchPct = (typeof WeakMap === 'function') ? new WeakMap() : null;
function petBenchPctOf(u) {
  if (!u) return null;
  if (_petBenchPct) return _petBenchPct.get(u) || null;
  return u._benchPct || null;
}
function petSetBenchPct(u, rec) {
  if (!u) return;
  if (_petBenchPct) { _petBenchPct.set(u, rec); return; }
  try {
    Object.defineProperty(u, '_benchPct', { value: rec, enumerable: false, configurable: true, writable: true });
  } catch (e) {
    console.log('[pet] 无法定义不可枚举的 _benchPct，退回普通字段（只影响快照体积，口径不变）', e);
    u._benchPct = rec;
  }
}

/* 把「凝聚（固定值）／Σ共鸣%」挂到单位上（**唯一的写入口**）。
   @param {Object} unit 参战单位（只写 `_benchPct`，不碰 base / hp）
   @param {Object} [view] `petBaseBonusView()` 的结果（同一批单位复用同一份，避免重复算合计） */
function petAttachBenchPct(unit, view) {
  if (!unit || !unit.base) return unit;
  var v = view || petBaseBonusView();
  var pool = petBonusAdditivePool(v.matureBaseSum, unit.base, petUnitRarityPct(unit),
                                  unit._orbPct, v.resonancePct);
  petSetBenchPct(unit, { cohesion: pool.cohesion, resonancePct: pool.resonancePct,
                         totalPct: pool.totalPct });
  return unit;
}

/* ============================================================
   纯计算视图：**成熟期宠物**的合计 ＋ Σ共鸣%（与「谁上场」无关，不写任何单位）
   `applyBattlePetBaseBonuses()` 与 `petStatBreakdown()` 都从这里取数 ——
   保证「面板显示」与「实战建场」是**同一份**加成，不会各算一套。
   @param {Array} [_unitsIgnored] 兼容旧签名（本视图**与 units 无关**，参数保留只为不改调用点）
   @returns {{allBaseSum:Object, matureBaseSum:Object, allCount:number, matureCount:number,
              cohesion:Object, cohesionRatePct:number, resonancePct:number, resonanceRate:number}}
     · cohesion[k]  = S凝聚[k]（**固定值**；同一存档下每只宠相同）
     · resonancePct = S共鸣%（**全局一个数**；同一存档下每只宠相同）
   ============================================================ */
function petBaseBonusView(_unitsIgnored) {
  var d = getPetStore();
  var scan = petTeamBaseScan(d);
  var coh = {};
  PET_BONUS_ATTRS.forEach(function (k) {
    coh[k] = scan.matureBaseSum[k] * TEAM_COHESION_PCT / 100;
  });
  return { allBaseSum: scan.allBaseSum,           // 全部宠物（信息性口径，不参与公式）
           matureBaseSum: scan.matureBaseSum,     // 【成熟期】之和（凝聚的分母）
           allCount: scan.allCount, matureCount: scan.matureCount,
           cohesion: coh, cohesionRatePct: TEAM_COHESION_PCT,
           resonancePct: scan.resonancePct, resonanceRate: scan.resonancePct / 100 };
}

/* 🔴 v2.16（作者裁决）：本函数**不把凝聚/共鸣写进 `u.base`** —— 那正是 v2.2~v2.14 的旧口径
   （「先把绝对值垫进基数、再整块乘倍率池」＝ 面板 ×8505% 与「面板比实战高 29%」的源头）。
   新口径下**凝聚是固定值、共鸣是百分比**，两者都由 `boostPetForGroup()` 一次性收口：
       最终 = floor((基础 ＋ S凝聚) × (稀有度 ＋ Σ宝珠 ＋ S共鸣) ÷ 100)
   本函数现在唯一的职责：**给每个单位挂上 S凝聚（固定值）与 S共鸣（Σ%）**（走 `petAttachBenchPct`）。
   ⚠️ 函数名保留（历史 API）：`buildGroupBattlePets` 的建场管道与多套既有断言仍按这个名字
      接线；语义已从「写进 base」变为「把这两个全局值挂到单位上」。**它一个字节都不会改
      `u.base` / `u.hp`**（`v2.14.2` 的「就地累加」bug 因此从根上不可能复发）。
   ⚠️ 天然幂等：每次只是用同一份只读视图重新算一遍并覆盖挂载点 → 连续调用 N 次
      结果逐字节相同（回归测试 scripts/test-pet-bonus-stability.js）。 */
function applyBattlePetBaseBonuses(units) {
  if (!units || !units.length) return units;
  var view = petBaseBonusView();                  // 纯：成熟期宠物的合计 ＋ Σ共鸣%（算一次，全单位复用）
  units.forEach(function (u) {
    if (!u || !u.base) return;
    petAttachBenchPct(u, view);                   // 只写非枚举的 _benchPct
  });
  return units;
}

/* ============================================================
   v2.2 WP-H5：宠物属性拆解（**纯展示 / 只读**）
   doc/2.2 修改-补充.md 原话：「宠物面板现在需要显示加成值、最终属性」。

   v2.16（作者裁决）后的三条链路 —— 每一项都只有**一个**来源：
     ① 基础   = `createPetUnit(pet).base`（图鉴 + 炼化 + 天赋静态，pet-codex.js）
     ② 加成   = `petBonusAdditivePool()`：cohesion（固定值，加到①上）
                ＋ totalPct（稀有度% ＋ Σ宝珠% ＋ Σ共鸣%）
                —— 和实战建场用的是**同一个纯函数**（`petAttachBenchPct` 也走它）
     ③ 最终   = `boostPetForGroup()`（池的**唯一出口**，就地「(基础＋凝聚) × 池%」+ 取整）
     「成熟期宠物」的合计/Σ共鸣 = `petBaseBonusView()` → `petTeamBaseScan()`（唯一取数口）

   ⚠️ 本函数**不得修改入参**（`v2.14.2` 修过的真实 bug：「宠物面板加成一直增加」）：
      带加成的基数只算进**局部副本**，`boostPetForGroup` 只作用于那个副本 →
      本函数零写入、可重复调用、连续 N 次结果逐字节相同。
   ⚠️ 速度不参与（与 `boostPetForGroup` 一致）：凝聚 = 0、totalPct = 100、final = 基础。
   ============================================================ */

/* 单位浅副本（换掉 base）—— 给 `boostPetForGroup()` 这种**就地乘法**用。
   ⚠️ 只为「不碰原单位」而存在：tags / _orbPct / _skillLevels 等字段按引用沿用，
      与原单位语义一致（boostPetForGroup 只读 tags/_orbPct/_benchPct，只写 base/hp）。 */
function petUnitWithBase(u, base) {
  var c = {};
  for (var k in u) { if (Object.prototype.hasOwnProperty.call(u, k)) c[k] = u[k]; }
  c.base = base;
  return c;
}

function petStatBreakdown(pet) {
  var zero = function () { var o = {}; PET_STAT_KEYS.forEach(function (k) { o[k] = 0; }); return o; };
  var out = { ok: false, base: zero(), cohesion: zero(), totalPct: zero(),
              bench: zero(), poolPct: zero(), final: zero(), pureFinal: zero(),
              rarityPct: 0, orbPct: {}, resonancePct: 0, cohesionRatePct: TEAM_COHESION_PCT,
              allCount: 0, matureCount: 0, resonanceRate: 0,
              ratePct: { cohesion: TEAM_COHESION_PCT, resonance: 0 }, boosted: false };
  if (!pet || typeof createPetUnit !== 'function') return out;
  var u = createPetUnit(pet);
  if (!u || !u.base) return out;
  out.ok = true;
  PET_STAT_KEYS.forEach(function (k) { out.base[k] = u.base[k] || 0; });

  /* 「成熟期宠物」的合计 / Σ共鸣 —— 与建场**同一份来源**（petBaseBonusView → petTeamBaseScan），
     所以面板读数与实战数值**不可能**再各算一套（旧版差 29% 的根因）。 */
  var vb = petBaseBonusView();
  out.allCount = vb.allCount;
  out.matureCount = vb.matureCount;
  out.resonanceRate = vb.resonanceRate;
  out.resonancePct = vb.resonancePct;
  out.cohesionRatePct = vb.cohesionRatePct;
  out.ratePct = { cohesion: vb.cohesionRatePct, resonance: vb.resonancePct };
  out.rarityPct = petUnitRarityPct(u);
  out.orbPct = u._orbPct || {};

  /* 唯一公式实现（纯函数，不写入参）：凝聚固定值 ＋ 三项加算池 ＋ 逐属性 final */
  var pool = petBonusAdditivePool(vb.matureBaseSum, out.base, out.rarityPct, out.orbPct, vb.resonancePct);
  PET_STAT_KEYS.forEach(function (k) {
    out.cohesion[k] = pool.cohesion[k];            // S凝聚：固定值（同一存档下每只宠相同）
    out.totalPct[k] = pool.totalPct[k];            // 加成合计%（稀有度 ＋ Σ宝珠 ＋ Σ共鸣）
    out.pureFinal[k] = pool.final[k];              // 纯函数算出的最终值（供交叉校验）
    /* 池的**子集**口径（稀有度＋Σ宝珠），单独留着：既有的 ×N% 展示换算
       （`petStatMultPct` / `petPoolMultPct`）与 test-pet-compare 的
       「两项相加、不是相乘」判据都建在它上面。速度不进池 → 0。 */
    out.poolPct[k] = (k === 'spd') ? 0 : (out.rarityPct + (out.orbPct[k] || 0));
    /* `bench` = **等效基数**：把「凝聚固定值 ＋ 三项加算」折算回「只用稀有度＋Σ宝珠池」时的等价基础值
       （以 final 反解：bench ＝ final × 100 ÷ poolPct），既有 ×N% 展示链无需改定义。 */
    out.bench[k] = (out.poolPct[k] > 0 && out.base[k] > 0)
      ? (pool.final[k] * 100 / out.poolPct[k]) : out.base[k];
  });

  if (typeof boostPetForGroup === 'function') {
    /* ③ 最终值走**真实的池出口**（就地在局部副本上算）——
       保证「面板 = 实战」是同一条代码路径，而不是展示层另写一套。
       ⚠️ 传进副本的 base 必须是**另一次拷贝**：`boostPetForGroup` 是就地写入，
          若直接传 `out.base` 会把「① 基础属性」也一起改掉（本文件踩过一次）。 */
    var baseCopy = {};
    PET_STAT_KEYS.forEach(function (k) { baseCopy[k] = out.base[k]; });
    var pb = petUnitWithBase(u, baseCopy);         // 局部副本：原单位 u 与 out.base 都不动
    petSetBenchPct(pb, { cohesion: pool.cohesion, resonancePct: pool.resonancePct,
                         totalPct: pool.totalPct });
    boostPetForGroup(pb);
    out.boosted = true;
    PET_STAT_KEYS.forEach(function (k) { out.final[k] = pb.base[k] || 0; });
  } else {
    PET_STAT_KEYS.forEach(function (k) { out.final[k] = pool.final[k]; });
  }
  return out;
}

/* ============================================================
   v2.2 WP-I A-6：属性区**展示口径辅助**（作者要求「加成统一用 ×N% 表达」）
   ⚠️ **纯展示**：不产生任何新数值、不改公式、不写存档 ——
      输入是上面 `petStatBreakdown()` 已经算好的字段，
      输出只是给 UI 打印用的整数「倍数百分比」。
   · benchMultPct = 总加成 ÷（稀有度＋Σ宝珠）的倍数（bench ÷ base；bench 是等效基数）
   · poolMultPct  = 稀有度＋Σ宝珠 两项之和小池（速度不参与 → 100）
   · orbMultPct   = 宝珠自身倍数（100 ＋ 该属性宝珠%，未装配 = 100）
   · statMultPct  = 基础 → 最终 的总倍数（＝上两者之积 ≈ 加成合计%）
   四舍五入可能带来 ±1 的**显示**偏差（引擎结果另由 `bd.final` 原样展示），不是口径差异。
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
   v2.16：② 段「凝聚固定值 ＋ 一个加成合计 ＋ 可展开的来源明细」的**唯一数值来源**
   （纯展示 / 只读）。作者本轮裁决后 ② 只有两件事：
     · **凝聚（固定值）**：S凝聚[k] ＝ 成熟期宠物该属性基础之和 × 3%，**与基础相加**（速度 —）
     · **加成合计%（进池百分比）**：稀有度% ＋ Σ宝珠% ＋ Σ共鸣%
   共鸣是**进池的百分比**（UR 10 / SSR 8 / SR 7 / R 6 逐只相加），与凝聚完全是两种东西 ——
   展示层必须让这两件事一眼可分（作者要求「凝聚是加在基础上的固定值、共鸣是进池的百分比」）。
   ⚠️ 本组函数**不重写任何公式、不产生新数值**：每个数都直接读 `petStatBreakdown()` 的
      既有字段（唯一公式实现是 `petBonusAdditivePool` ＋ 池出口 `boostPetForGroup`），
      UI 只把它们拼成文本，**不在 UI 里重算一遍**。
   ⚠️ 速度不参与（见 `PET_BONUS_ATTRS`）：participates=false、凝聚=0、totalPct=100（×100%）。
   ============================================================ */
function petBonusRow(bd, k, rarityTag) {
  var ok = !!(bd && bd.ok);
  var inPool = PET_BONUS_ATTRS.indexOf(k) > -1;
  var num = function (o) {
    var v = ok && o ? o[k] : 0;
    return (typeof v === 'number' && isFinite(v)) ? v : 0;
  };
  /* 稀有度标签只在「与 bd.rarityPct 对得上」时才给（对不上就不编一个） */
  var tag = (rarityTag && typeof PET_GROUP_SCALE !== 'undefined' &&
             PET_GROUP_SCALE[rarityTag] === (ok ? (bd.rarityPct || 0) : 0)) ? rarityTag : null;
  var totalPct = num(bd && bd.totalPct);
  var resPct = (ok && typeof bd.resonancePct === 'number' && isFinite(bd.resonancePct)) ? bd.resonancePct : 0;
  return {
    key: k,
    participates: inPool,                                  // 速度 = false
    rarity: tag,
    base: ok ? (((bd.base || {})[k]) || 0) : 0,
    rarityPct: ok ? (bd.rarityPct || 0) : 0,               // 稀有度%（进池的一项）
    orbPct: num(bd && bd.orbPct),                          // Σ宝珠%（进池的一项，逐属性）
    cohesion: inPool ? num(bd && bd.cohesion) : 0,         // **凝聚固定值**（加在①上；速度 = 0）
    cohesionRatePct: ok ? (bd.cohesionRatePct || TEAM_COHESION_PCT) : TEAM_COHESION_PCT,
    resonancePct: inPool ? resPct : 0,                     // **Σ共鸣%**（进池的百分比；速度 = 0）
    poolPct: ok ? (((bd.poolPct || {})[k]) || 0) : 0,      // 子集池：稀有度 ＋ Σ宝珠（速度 = 0）
    totalPct: inPool ? totalPct : 100,                     // 加成合计%（速度 = ×100%）
    final: ok ? (((bd.final || {})[k]) || 0) : 0
  };
}
/* 逐属性「凝聚固定值 ＋ 加成合计 ＋ 来源明细」的整份摘要（含档位 / 只数）。
   ⚠️ 档位同时给出**整数百分点**（cohesionRatePct / resonanceRatePct，专供 UI 打印，
      免得 UI 里再写一次 × 100）。
   @returns {{ok,rarity,allCount,matureCount,cohesionRatePct,resonanceRatePct,rows:Array}} */
function petBonusLines(bd, rarityTag) {
  var rate = (bd && bd.ratePct) || {};
  var allCount = (bd && bd.allCount) || 0;
  var matureCount = (bd && bd.matureCount != null) ? bd.matureCount : allCount;
  var picks = (typeof getPetBattlePicks === 'function') ? getPetBattlePicks() : [];
  return {
    ok: !!(bd && bd.ok),
    rarity: rarityTag || null,
    allCount: allCount,
    matureCount: matureCount,
    /* 未上场只数 = 全部 − 参战选择（**仅用于解释口径**，不参与任何计算）。
       新口径只统计成熟期 → 这里额外给出成熟期只数，便于对照。 */
    notFieldedCount: Math.max(0, allCount - (picks ? picks.length : 0)),
    fieldedCount: picks ? picks.length : 0,
    cohesionRatePct: (rate.cohesion != null) ? rate.cohesion : TEAM_COHESION_PCT,
    resonanceRatePct: (rate.resonance != null) ? rate.resonance : 0,
    rows: PET_STAT_KEYS.map(function (k) { return petBonusRow(bd, k, rarityTag); })
  };
}

/* 百分比 → **整数**（只给 UI 的 ×N% 大字用；明细里的精确值走 `petPctTxt`）。
   取整只影响「② 的那一个大字」，③ 的最终值永远由精确百分比算出 —— 不参与任何公式。 */
function petPctInt(pct) {
  var v = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
  return Math.round(v);
}

/* 百分比文本（UI 唯一可用的格式化入口 —— 乘除与取整都留在本文件）。
   · 整数 → 「1600%」；一位小数 → 「110.8%」
   · null / NaN / Infinity → 「0%」（展示层不打印脏数，也不假装有加成）
   速度的 ×100% 由调用方按 `participates` 决定，不在这里特殊处理。 */
function petPctTxt(pct) {
  var v = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
  var r = Math.round(v * 10) / 10;
  return ((r === Math.round(r)) ? String(Math.round(r)) : r.toFixed(1)) + '%';
}

/* **固定值**文本（UI 唯一可用的数值格式化入口 —— 凝聚是「数值」不是「百分比」）。
   · 整数 → 「153」；一位小数 → 「153.6」（凝聚 = 成熟期之和 × 3%，可能不是整数）
   · null / NaN / Infinity → 「0」（展示层不打印脏数）
   ⚠️ 只做显示取整，**不参与任何公式**：最终值永远由精确数值算出。 */
function petValueTxt(v) {
  var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
  var r = Math.round(n * 10) / 10;
  return (r === Math.round(r)) ? String(Math.round(r)) : r.toFixed(1);
}

/* 带符号的固定值文本（凝聚的「+153.6」写法；符号与取整都留在本文件，UI 不自己算） */
function petSignedValueTxt(v) {
  var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
  return (n > 0 ? '+' : (n < 0 ? '−' : '+')) + petValueTxt(Math.abs(n));
}

/* 对比：**只列主要几项**（作者要求「只显示主要几项即可，别塞满」） */
var PET_COMPARE_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];
/* 对比口径（UI 必须写明）：两只宠**都按「此宠上场计算」** ——
   即各自走 `petStatBreakdown()`，与详情面板展示的是同一个口径，
   杜绝「拿 A 的上场值比 B 的基础值」。
   v2.16 起 S凝聚 / S共鸣% 是**全局常量**：两只宠看到的这两个值完全相同，
   差异只来自各自的基础与稀有度档位 —— 这正是新口径要露出来的东西。
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
   v2.2 WP-A3/A4（v2.16 改口径，接线不变）：敌群参战宠物的**唯一入口**
   = 建单位 → 挂 S凝聚（固定值）／S共鸣%（`applyBattlePetBaseBonuses`）→ 等级基础化 → **池出口**
     `boostPetForGroup`（(基础 ＋ S凝聚) × (稀有度% ＋ Σ宝珠% ＋ S共鸣%) ÷ 100 后取整）。
   ⚠️ 顺序：挂载必须在 `boostPetForGroup()` **之前**（否则凝聚/共鸣没人加）；
      等级加成仍排在池之前（属基础属性部分，与 v2.2 起的口径一致）。
   ⚠️ 成熟期宠物的合计/Σ共鸣在 `applyBattlePetBaseBonuses` 里**只算一次**，全单位复用
      → 每次建场 O(宠物数) 次 createPetUnit（≈15 只），与旧口径同量级。
   三个调用点（`game-render.js` / `pet-ui.js` / `debug.js`）统一走这里，
   避免「三处各自判断导致口径分叉」（同 `groupStageEnemies` 的教训）。
   ============================================================ */
function buildGroupBattlePets(petIds, maxRoster) {
  var units = createPetUnitsForBattle(petIds, maxRoster);
  applyBattlePetBaseBonuses(units);
  /* WP-G：角色等级系统的**宠物档**效果 —— 仍是**基础属性**部分，必须排在池出口之前。
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
  window.TEAM_COHESION_PCT = TEAM_COHESION_PCT;
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
  window.petPctTxt = petPctTxt;
  window.petValueTxt = petValueTxt;
  window.petSignedValueTxt = petSignedValueTxt;
  window.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  window.petCompareFinal = petCompareFinal;
  window.getPetBattlePicks = getPetBattlePicks;
  window.savePetBattlePicks = savePetBattlePicks;
  window.exchangePetMaterials = exchangePetMaterials;
  window.petMatExchangeInfo = petMatExchangeInfo;
  window.createPetUnitsForBattle = createPetUnitsForBattle;
  window.petAllPetsBaseSum = petAllPetsBaseSum;
  window.petMatureBaseSum = petMatureBaseSum;
  window.petTeamBaseScan = petTeamBaseScan;
  window.petTeamResonancePct = petTeamResonancePct;
  window.petRarityResonancePct = petRarityResonancePct;
  window.PET_RESONANCE_SCALE = PET_RESONANCE_SCALE;
  window.petUnitRarityPct = petUnitRarityPct;
  window.petBonusAdditivePool = petBonusAdditivePool;
  window.petBenchPctOf = petBenchPctOf;
  window.petAttachBenchPct = petAttachBenchPct;
  window.petBaseBonusView = petBaseBonusView;
  window.applyBattlePetBaseBonuses = applyBattlePetBaseBonuses;
  window.buildGroupBattlePets = buildGroupBattlePets;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_BATTLE_MAX = PET_BATTLE_MAX;
  globalThis.TEAM_COHESION_RATE = TEAM_COHESION_RATE;
  globalThis.TEAM_COHESION_PCT = TEAM_COHESION_PCT;
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
  globalThis.petPctTxt = petPctTxt;
  globalThis.petValueTxt = petValueTxt;
  globalThis.petSignedValueTxt = petSignedValueTxt;
  globalThis.PET_COMPARE_KEYS = PET_COMPARE_KEYS;
  globalThis.petCompareFinal = petCompareFinal;
  globalThis.getPetBattlePicks = getPetBattlePicks;
  globalThis.savePetBattlePicks = savePetBattlePicks;
  globalThis.exchangePetMaterials = exchangePetMaterials;
  globalThis.petMatExchangeInfo = petMatExchangeInfo;
  globalThis.createPetUnitsForBattle = createPetUnitsForBattle;
  globalThis.petAllPetsBaseSum = petAllPetsBaseSum;
  globalThis.petMatureBaseSum = petMatureBaseSum;
  globalThis.petTeamBaseScan = petTeamBaseScan;
  globalThis.petTeamResonancePct = petTeamResonancePct;
  globalThis.petRarityResonancePct = petRarityResonancePct;
  globalThis.PET_RESONANCE_SCALE = PET_RESONANCE_SCALE;
  globalThis.petUnitRarityPct = petUnitRarityPct;
  globalThis.petBonusAdditivePool = petBonusAdditivePool;
  globalThis.petBenchPctOf = petBenchPctOf;
  globalThis.petAttachBenchPct = petAttachBenchPct;
  globalThis.petBaseBonusView = petBaseBonusView;
  globalThis.applyBattlePetBaseBonuses = applyBattlePetBaseBonuses;
  globalThis.buildGroupBattlePets = buildGroupBattlePets;
}

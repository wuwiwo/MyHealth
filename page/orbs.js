/* ============================================
   MyHealth — Orb System (M6 / v2.2 WP-A2 重构)
   宠物宝珠：升级 / 分解 / 装配 / 掉落 / 月重置。

   **v2.2 口径（dundun 2026-09-29 裁决）**
     · 宝珠**不直接加属性值**，而是加**百分比** → 进「百分比池」，与稀有度倍率**相加**：
       `最终属性 = 基础属性 ×（稀有度倍率 + Σ宝珠%）`
     · 品质链 **R → SR → SSR → UR**（**删除 N 档**），**满级自动升品质**：
       | 品质 | 起始 | 每级 | 本级上限 | 升到 |
       |---|---|---|---|---|
       | R   | +10%  | +1% | 10 级 | SR  |
       | SR  | +20%  | +2% | 25 级 | SSR |
       | SSR | +70%  | +2% | 40 级 | UR  |
       | UR  | +150% | +3% | 50 级 | —   |
       （UR 满级 = +150% + 49×3% = **+297% ≈ 单颗上限 +300%**）
     · **碎片只用于升级**（不再合成宝珠）；宝珠本体由**隐藏挑战**掉落
       ⚠️ 上一条自 **v2.15** 起被作者裁决**部分推翻**：合成已恢复（见下方 v2.15 口径），
          但「宝珠本体由隐藏挑战掉落」与「碎片可用于升级」两条仍然有效。
     · 迁移：旧 **N 档 → 每颗 20 碎片**；R/SR/SSR 按**品质映射 + 等级保号**，超新上限则截断

   ⚠️ 字段名沿革：存档里仍用 `rarity` 存「品质」（存量数据兼容），语义即 R/SR/SSR/UR。

   **v2.15 口径（作者裁决）**
     · **分解返还 = 该宝珠的加成百分点数**（`orbPct`）：R·Lv1 = **10 碎片**（基准），
       随品质 / 等级连续单调递增，UR 满级 = 297 碎片。不另建数值表，仍以
       `ORB_QUALITY_SPEC` 为唯一来源；「加成多少 % 就返还多少碎片」＝等价碎片。
       （旧 `ORB_DECOMPOSE` 品质定额表 R8/SR10/SSR20/UR40 已删除：它不看等级。）
     · **恢复合成**：`ORB_SYNTH_COST` 碎片 → 随机类型 **R·Lv1** 宝珠，100% 成功，
       每天最多 `ORB_SYNTH_DAILY_LIMIT` 次；次数按自然日存在 `data.orbSynth`，
       随 `pets` 存档一起云同步。合成是碎片汇（20 换 1 颗 R·Lv1，分解只返 10）。
     ⚠️ 合成函数接受调用方传入的 `todayKey`（日期由 UI 注入），本文件保持纯逻辑、
        不依赖 date-roll.js / Date / DOM / store。
   纯逻辑，无 DOM/store。设计来源：`design-v2.0.md` §2.7 + 2026-09-29 / v2.15 补充裁决。
   ============================================ */

/* 5 类型（**不再含数值表** —— 数值全部由品质决定） */
var ORB_TYPES = {
  hp:     { id: 'hp',      name: '血气宝珠' },
  atk:    { id: 'atk',     name: '攻击宝珠' },
  soulAtk:{ id: 'soulAtk', name: '魂攻宝珠' },
  def:    { id: 'def',     name: '防御宝珠' },
  soulDef:{ id: 'soulDef', name: '魂防宝珠' }
};

var ORB_QUALITIES = ['R', 'SR', 'SSR', 'UR'];

/* 品质规格：数值为**百分点**（+10 = +10%）；maxLv = 本级品质的等级上限，到顶后再升即升品质 */
var ORB_QUALITY_SPEC = {
  R:   { base: 10,  grow: 1, maxLv: 10, next: 'SR'  },
  SR:  { base: 20,  grow: 2, maxLv: 25, next: 'SSR' },
  SSR: { base: 70,  grow: 2, maxLv: 40, next: 'UR'  },
  UR:  { base: 150, grow: 3, maxLv: 50, next: null  }
};

var ORB_PCT_CAP = 300;                                   // 单颗上限 +300%
var ORB_UPGRADE_BASE = 2;                                // 升级消耗 =（当前等级 + 1）× 2 碎片
var ORB_MIGRATE_N_SHARDS = 20;                           // 旧 N 档每颗折算的碎片
/* 挑战掉落品质分布（Agent 拟定：R 为主，UR 稀有） */
var ORB_DROP_RATES = { R: 0.60, SR: 0.25, SSR: 0.12, UR: 0.03 };
/* v2.15：分解 / 合成经济（数值唯一来源 = 本段 + ORB_QUALITY_SPEC） */
var ORB_SYNTH_COST = 20;                                 // 合成 1 颗消耗碎片
var ORB_SYNTH_DAILY_LIMIT = 5;                           // 每日合成次数上限
var ORB_SYNTH_RARITY = 'R';                              // 合成产出品质（恒 R·Lv1）

function orbSpec(orb) {
  return ORB_QUALITY_SPEC[(orb && orb.rarity) || 'R'] || ORB_QUALITY_SPEC.R;
}

/* 创建宝珠 */
function createOrb(typeId, rarity) {
  if (!ORB_TYPES[typeId]) return null;
  return {
    id: 'orb-' + typeId + '-' + (rarity || 'R') + '-' + Math.floor(battleRnd() * 1e6),
    type: typeId,
    rarity: ORB_QUALITY_SPEC[rarity] ? rarity : 'R',
    level: 1
  };
}

/* 单颗宝珠的加成（**百分点**）：base + (等级−1)×grow，封顶 ORB_PCT_CAP */
function orbPct(orb) {
  if (!orb) return 0;
  var s = orbSpec(orb);
  var lv = Math.max(1, Math.min(s.maxLv, Math.floor(orb.level || 1)));
  return Math.min(ORB_PCT_CAP, s.base + (lv - 1) * s.grow);
}

/* 该宝珠距下一次「升品质」还差几级（UI 用） */
function orbLevelsToPromote(orb) {
  var s = orbSpec(orb);
  if (!s.next) return null;
  return Math.max(0, s.maxLv - Math.floor(orb.level || 1) + 1);
}

/* 套装加成：把宠物已装配的宝珠按**属性**汇总成百分点表 { hp: 10, atk: 5, ... }
   —— 供 boostPetForGroup 的百分比池使用（v2.2） */
function petOrbPct(orbs) {
  var out = {};
  if (!orbs) return out;
  Object.keys(orbs).forEach(function (t) {
    var pct = orbPct(orbs[t]);
    if (pct > 0) out[t] = (out[t] || 0) + pct;
  });
  return out;
}

/* 升级（消耗碎片；**本级满级后再升即升品质**） */
function orbUpgradeCost(orb) {
  if (!orb) return 0;
  var s = orbSpec(orb);
  if (!s.next && orb.level >= s.maxLv) return 0;   // UR 满级 = 真正到顶
  return (Math.floor(orb.level || 1) + 1) * ORB_UPGRADE_BASE;
}

function upgradeOrb(orb, bag) {
  if (!orb) return { ok: false, reason: '无宝珠' };
  var s = orbSpec(orb);
  if (!s.next && orb.level >= s.maxLv) return { ok: false, reason: '已满级' };
  var cost = orbUpgradeCost(orb);
  bag = bag || {};
  if ((bag.orbShard || 0) < cost) return { ok: false, reason: '碎片不足（需 ' + cost + '）' };
  bag.orbShard -= cost;
  var promoted = false;
  orb.level = Math.floor(orb.level || 1) + 1;
  if (orb.level > s.maxLv && s.next) {   // 满级自动升品质，等级回到 1
    orb.rarity = s.next;
    orb.level = 1;
    promoted = true;
  }
  return { ok: true, level: orb.level, rarity: orb.rarity, promoted: promoted, pct: orbPct(orb) };
}

/* ============================================================
   v2.15 分解：等价碎片 = 该宝珠的加成百分点数（orbPct）。
     R·Lv1 = 10（作者给的基准）→ R·Lv10 = 19 → SR·Lv1 = 20 → …
     UR·Lv50 = 297。随品质 / 等级连续单调递增，不另写数值表。
   ============================================================ */
function orbDecomposeShards(orb) {
  return orbPct(orb);
}

/* 分解宝珠 → 碎片（写 bag，不碰存档本体） */
function decomposeOrb(orb, bag) {
  if (!orb) return { ok: false, reason: '无宝珠' };
  var n = orbDecomposeShards(orb);
  bag = bag || {};
  bag.orbShard = (bag.orbShard || 0) + n;
  return { ok: true, shards: n, rarity: orb.rarity, pct: orbPct(orb) };
}

/* 随机宝珠类型（掉落 / 合成共用，避免两处各写一遍 Object.keys） */
function randomOrbType() {
  var types = Object.keys(ORB_TYPES);
  return types[Math.floor(battleRnd() * types.length)];
}

/* 挑战掉落：随机类型 + 按 ORB_DROP_RATES 抽品质 */
function rollOrbDrop() {
  var roll = battleRnd();
  var rarity = 'R';
  var acc = 0;
  for (var i = 0; i < ORB_QUALITIES.length; i++) {
    acc += ORB_DROP_RATES[ORB_QUALITIES[i]];
    if (roll < acc) { rarity = ORB_QUALITIES[i]; break; }
  }
  return createOrb(randomOrbType(), rarity);
}

/* ============================================================
   v2.15 合成：ORB_SYNTH_COST 碎片 → 随机类型 R·Lv1 宝珠（100% 成功），每日最多 5 次。
   @param {Object} data       petStore 数据（materials / orbs / orbSynth）
   @param {string} todayKey   本地日历日键 'YYYY-MM-DD'（由 UI 注入）
   ⚠️ 跨日重置是**读时**判定：dayKey 与 todayKey 不同即把 count 归零 ——
      不留定时任务、不需要月重置；旧存档没有 orbSynth 时优雅退化为空计数。
   ⚠️ 失败一律**不扣碎片、不计数**（与升级 / 兑换的既有口径一致）。
   ⚠️ 合成是碎片汇：花 20 得 1 颗 R·Lv1，而分解 R·Lv1 只返 10 碎片。
   ============================================================ */
function orbSynthState(data, todayKey) {
  var key = String(todayKey || '');
  var st = data && data.orbSynth;
  if (!st || typeof st !== 'object' || st.dayKey !== key) return { dayKey: key, count: 0 };
  var c = Math.max(0, Math.floor(Number(st.count) || 0));
  return { dayKey: key, count: Math.min(c, ORB_SYNTH_DAILY_LIMIT) };
}

/* 只读视图：UI 渲染按钮态用，绝不写 data */
function orbSynthStatus(data, todayKey) {
  var st = orbSynthState(data, todayKey);
  var bag = (data && data.materials) || {};
  var remaining = Math.max(0, ORB_SYNTH_DAILY_LIMIT - st.count);
  var enough = (bag.orbShard || 0) >= ORB_SYNTH_COST;
  return {
    count: st.count, remaining: remaining, limit: ORB_SYNTH_DAILY_LIMIT,
    cost: ORB_SYNTH_COST, shards: bag.orbShard || 0, enough: enough,
    canSynth: remaining > 0 && enough,
    reason: remaining <= 0 ? ('今日已达上限（' + ORB_SYNTH_DAILY_LIMIT + ' 次）')
          : !enough ? ('碎片不足（需 ' + ORB_SYNTH_COST + '）') : ''
  };
}

function synthOrb(data, todayKey) {
  if (!data) return { ok: false, reason: '无存档' };
  var st = orbSynthStatus(data, todayKey);
  if (!st.canSynth) return { ok: false, reason: st.reason, count: st.count, remaining: st.remaining };
  var orb = createOrb(randomOrbType(), ORB_SYNTH_RARITY);
  if (!orb) return { ok: false, reason: '宝珠类型表未加载' };   // 理论上不可达
  var bag = data.materials || (data.materials = {});
  bag.orbShard = (bag.orbShard || 0) - ORB_SYNTH_COST;
  var next = { dayKey: String(todayKey || ''), count: st.count + 1 };
  data.orbSynth = next;
  data.orbs = data.orbs || [];
  data.orbs.push(orb);
  return { ok: true, orb: orb, cost: ORB_SYNTH_COST, count: next.count,
           remaining: ORB_SYNTH_DAILY_LIMIT - next.count, rarity: orb.rarity, level: orb.level };
}

/* 装配：宠物每类型 1 颗 */
function equipOrb(pet, orb) {
  if (!pet || !orb) return { ok: false, reason: '参数缺失' };
  pet.orbs = pet.orbs || {};
  pet.orbs[orb.type] = orb;
  return { ok: true };
}
function unequipOrb(pet, type) {
  if (pet.orbs && pet.orbs[type]) {
    var orb = pet.orbs[type];
    delete pet.orbs[type];
    return { ok: true, orb: orb };
  }
  return { ok: false, reason: '该类型未装配' };
}

/* 月重置：已合成宝珠保留本体与品质，**等级回 1**；碎片清空 */
function monthlyResetOrbs(pet, bag) {
  if (pet && pet.orbs) {
    for (var t in pet.orbs) {
      pet.orbs[t].level = 1;
      if (pet.orbs[t].exp != null) pet.orbs[t].exp = 0;
    }
  }
  if (bag) bag.orbShard = 0;
  return pet;
}

/* ============================================================
   v2.2 存量迁移（存档只跑一次，见 pet-store.js 的迁移钩子）
     · 旧 **N 档** → 每颗折算 ORB_MIGRATE_N_SHARDS 个碎片（新链没有 N）
     · R / SR / SSR **按品质映射 + 等级保号**；**超过新品质等级上限则截断**
     · 不发放任何一次性补偿（dundun 裁决）
   处理两处：库存 `data.orbs`（数组）与每只宠的 `pet.orbs`（按类型的映射）
   返回 { dropped, clamped, shards } 供日志/测试。
   ============================================================ */
function migrateOrbs(data) {
  var out = { dropped: 0, clamped: 0, shards: 0 };
  if (!data) return out;
  function fix(orb) {
    if (!orb) return null;
    if (!ORB_QUALITY_SPEC[orb.rarity]) {          // N 档或未知品质
      out.dropped++;
      out.shards += ORB_MIGRATE_N_SHARDS;
      return null;
    }
    var s = ORB_QUALITY_SPEC[orb.rarity];
    var lv = Math.max(1, Math.floor(orb.level || 1));
    if (lv > s.maxLv) { lv = s.maxLv; out.clamped++; }
    orb.level = lv;
    return orb;
  }
  if (Array.isArray(data.orbs)) {
    var kept = [];
    data.orbs.forEach(function (o) { var k = fix(o); if (k) kept.push(k); });
    data.orbs = kept;
  }
  (data.pets || []).forEach(function (p) {
    if (!p.orbs) return;
    Object.keys(p.orbs).forEach(function (t) {
      if (!fix(p.orbs[t])) delete p.orbs[t];
    });
  });
  if (out.shards) {
    data.materials = data.materials || {};
    data.materials.orbShard = (data.materials.orbShard || 0) + out.shards;
  }
  return out;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.ORB_TYPES = ORB_TYPES;
  window.ORB_QUALITIES = ORB_QUALITIES;
  window.ORB_QUALITY_SPEC = ORB_QUALITY_SPEC;
  window.ORB_PCT_CAP = ORB_PCT_CAP;
  window.ORB_DROP_RATES = ORB_DROP_RATES;
  window.ORB_SYNTH_COST = ORB_SYNTH_COST;
  window.ORB_SYNTH_DAILY_LIMIT = ORB_SYNTH_DAILY_LIMIT;
  window.ORB_SYNTH_RARITY = ORB_SYNTH_RARITY;
  window.createOrb = createOrb;
  window.orbPct = orbPct;
  window.orbSpec = orbSpec;
  window.orbLevelsToPromote = orbLevelsToPromote;
  window.petOrbPct = petOrbPct;
  window.orbUpgradeCost = orbUpgradeCost;
  window.upgradeOrb = upgradeOrb;
  window.decomposeOrb = decomposeOrb;
  window.rollOrbDrop = rollOrbDrop;
  window.equipOrb = equipOrb;
  window.unequipOrb = unequipOrb;
  window.monthlyResetOrbs = monthlyResetOrbs;
  window.migrateOrbs = migrateOrbs;
  window.randomOrbType = randomOrbType;
  window.orbDecomposeShards = orbDecomposeShards;
  window.orbSynthState = orbSynthState;
  window.orbSynthStatus = orbSynthStatus;
  window.synthOrb = synthOrb;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ORB_TYPES = ORB_TYPES;
  globalThis.ORB_QUALITIES = ORB_QUALITIES;
  globalThis.ORB_QUALITY_SPEC = ORB_QUALITY_SPEC;
  globalThis.ORB_PCT_CAP = ORB_PCT_CAP;
  globalThis.ORB_DROP_RATES = ORB_DROP_RATES;
  globalThis.ORB_SYNTH_COST = ORB_SYNTH_COST;
  globalThis.ORB_SYNTH_DAILY_LIMIT = ORB_SYNTH_DAILY_LIMIT;
  globalThis.ORB_SYNTH_RARITY = ORB_SYNTH_RARITY;
  globalThis.createOrb = createOrb;
  globalThis.orbPct = orbPct;
  globalThis.orbSpec = orbSpec;
  globalThis.orbLevelsToPromote = orbLevelsToPromote;
  globalThis.petOrbPct = petOrbPct;
  globalThis.orbUpgradeCost = orbUpgradeCost;
  globalThis.upgradeOrb = upgradeOrb;
  globalThis.decomposeOrb = decomposeOrb;
  globalThis.rollOrbDrop = rollOrbDrop;
  globalThis.equipOrb = equipOrb;
  globalThis.unequipOrb = unequipOrb;
  globalThis.monthlyResetOrbs = monthlyResetOrbs;
  globalThis.migrateOrbs = migrateOrbs;
  globalThis.randomOrbType = randomOrbType;
  globalThis.orbDecomposeShards = orbDecomposeShards;
  globalThis.orbSynthState = orbSynthState;
  globalThis.orbSynthStatus = orbSynthStatus;
  globalThis.synthOrb = synthOrb;
}

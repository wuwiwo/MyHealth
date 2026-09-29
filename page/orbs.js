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
     · 迁移：旧 **N 档 → 每颗 20 碎片**；R/SR/SSR 按**品质映射 + 等级保号**，超新上限则截断

   ⚠️ 字段名沿革：存档里仍用 `rarity` 存「品质」（存量数据兼容），语义即 R/SR/SSR/UR。
   纯逻辑，无 DOM/store。设计来源：`design-v2.0.md` §2.7 + 2026-09-29 补充裁决。
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
var ORB_DECOMPOSE = { R: 8, SR: 10, SSR: 20, UR: 40 };   // 分解返还碎片（UR 为外推值）
var ORB_UPGRADE_BASE = 2;                                // 升级消耗 =（当前等级 + 1）× 2 碎片
var ORB_MIGRATE_N_SHARDS = 20;                           // 旧 N 档每颗折算的碎片
/* 挑战掉落品质分布（Agent 拟定：R 为主，UR 稀有） */
var ORB_DROP_RATES = { R: 0.60, SR: 0.25, SSR: 0.12, UR: 0.03 };

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

/* 分解宝珠 → 碎片 */
function decomposeOrb(orb, bag) {
  if (!orb) return { ok: false, reason: '无宝珠' };
  var n = ORB_DECOMPOSE[orb.rarity] || 0;
  bag = bag || {};
  bag.orbShard = (bag.orbShard || 0) + n;
  return { ok: true, shards: n, rarity: orb.rarity };
}

/* 挑战掉落：随机类型 + 按 ORB_DROP_RATES 抽品质 */
function rollOrbDrop() {
  var types = Object.keys(ORB_TYPES);
  var type = types[Math.floor(battleRnd() * types.length)];
  var roll = battleRnd();
  var rarity = 'R';
  var acc = 0;
  for (var i = 0; i < ORB_QUALITIES.length; i++) {
    acc += ORB_DROP_RATES[ORB_QUALITIES[i]];
    if (roll < acc) { rarity = ORB_QUALITIES[i]; break; }
  }
  return createOrb(type, rarity);
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
}
if (typeof globalThis !== 'undefined') {
  globalThis.ORB_TYPES = ORB_TYPES;
  globalThis.ORB_QUALITIES = ORB_QUALITIES;
  globalThis.ORB_QUALITY_SPEC = ORB_QUALITY_SPEC;
  globalThis.ORB_PCT_CAP = ORB_PCT_CAP;
  globalThis.ORB_DROP_RATES = ORB_DROP_RATES;
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
}

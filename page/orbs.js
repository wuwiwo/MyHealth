/* ============================================
   MyHealth — Orb System (M6)
   宠物宝珠：合成/升级/分解/装配 + 月重置。
   5 类型 × 4 品质（N/R/SR/SSR）。
   纯逻辑，无 DOM/store。
   设计来源：design-v2.0.md §2.7
   ============================================ */

/* 宝珠类型定义 */
var ORB_TYPES = {
  hp:     { id:'hp',     name:'血气宝珠', base:{N:70, R:100, SR:150, SSR:200}, grow:{N:10, R:15, SR:20, SSR:25}, maxLv:{N:10, R:20, SR:30, SSR:40} },
  atk:    { id:'atk',    name:'攻击宝珠', base:{N:2,  R:4,   SR:6,   SSR:8},   grow:{N:1,  R:2,  SR:4,  SSR:6},  maxLv:{N:10, R:20, SR:30, SSR:40} },
  soulAtk:{ id:'soulAtk',name:'魂攻宝珠', base:{N:1,  R:2,   SR:4,   SSR:6},   grow:{N:1,  R:1,  SR:2,  SSR:3},  maxLv:{N:10, R:20, SR:30, SSR:40} },
  def:    { id:'def',    name:'防御宝珠', base:{N:2,  R:3,   SR:5,   SSR:7},   grow:{N:1,  R:2,  SR:3,  SSR:5},  maxLv:{N:10, R:20, SR:30, SSR:40} },
  soulDef:{ id:'soulDef',name:'魂防宝珠', base:{N:1,  R:2,   SR:3,   SSR:5},   grow:{N:0.5,R:1,  SR:1.5,SSR:2},  maxLv:{N:10, R:20, SR:30, SSR:40} }
};

var ORB_RARITIES = ['N', 'R', 'SR', 'SSR'];

/* 合成品质分布 */
var ORB_SYNTH_RATES = { N: 0.40, R: 0.30, SR: 0.20, SSR: 0.10 };
/* 分解返还碎片 */
var ORB_DECOMPOSE = { N: 4, R: 8, SR: 10, SSR: 20 };
/* 合成消耗碎片 */
var ORB_SYNTH_COST = 20;
/* 合成成功率 */
var ORB_SYNTH_SUCCESS = 0.65;

/* 创建宝珠 */
function createOrb(typeId, rarity) {
  var t = ORB_TYPES[typeId];
  if (!t) return null;
  return {
    id: 'orb-' + typeId + '-' + rarity + '-' + Math.floor(Math.random() * 1e6),
    type: typeId,
    rarity: rarity || 'N',
    level: 1,
    exp: 0
  };
}

/* 宝珠当前属性值 */
function orbStat(orb) {
  var t = ORB_TYPES[orb.type];
  var rarity = orb.rarity;
  return t.base[rarity] + t.grow[rarity] * (orb.level - 1);
}

/* 合成（消耗 20 碎片，65% 成功）：
   成功 → 随机类型 + 按分布随机品质；失败 → 碎片损失 */
function synthOrb(bag) {
  if (!bag || (bag.orbShard || 0) < ORB_SYNTH_COST) return { ok: false, reason: '碎片不足（需 ' + ORB_SYNTH_COST + '）' };
  bag.orbShard -= ORB_SYNTH_COST;
  if (Math.random() > ORB_SYNTH_SUCCESS) return { ok: false, success: false, reason: '合成失败' };
  var types = Object.keys(ORB_TYPES);
  var type = types[Math.floor(Math.random() * types.length)];
  var roll = Math.random();
  var rarity = 'N';
  var acc = 0;
  for (var i = 0; i < ORB_RARITIES.length; i++) {
    acc += ORB_SYNTH_RATES[ORB_RARITIES[i]];
    if (roll < acc) { rarity = ORB_RARITIES[i]; break; }
  }
  var orb = createOrb(type, rarity);
  return { ok: true, success: true, orb: orb, type: type, rarity: rarity };
}

/* 分解宝珠 → 碎片 */
function decomposeOrb(orb, bag) {
  if (!orb) return { ok: false, reason: '无宝珠' };
  bag.orbShard = (bag.orbShard || 0) + ORB_DECOMPOSE[orb.rarity] || 0;
  return { ok: true, shards: ORB_DECOMPOSE[orb.rarity] };
}

/* 升级（消耗碎片，1 级 +1；到 maxLv 停） */
function orbUpgradeCost(orb) {
  var t = ORB_TYPES[orb.type];
  var maxLv = t.maxLv[orb.rarity];
  if (orb.level >= maxLv) return 0;
  // 升级消耗：随等级递增（每级 = 等级×2 碎片）
  return (orb.level + 1) * 2;
}
function upgradeOrb(orb, bag) {
  var t = ORB_TYPES[orb.type];
  var maxLv = t.maxLv[orb.rarity];
  if (orb.level >= maxLv) return { ok: false, reason: '已满级' };
  var cost = orbUpgradeCost(orb);
  if ((bag.orbShard || 0) < cost) return { ok: false, reason: '碎片不足（需 ' + cost + '）' };
  bag.orbShard -= cost;
  orb.level++;
  return { ok: true, level: orb.level, stat: orbStat(orb) };
}

/* 装配：宠物每类型 1 颗 */
function equipOrb(pet, orb) {
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

/* 月重置：已合成宝珠保留本体，升级部分重置（回到 1 级）；碎片清空 */
function monthlyResetOrbs(pet, bag) {
  if (pet.orbs) {
    for (var t in pet.orbs) {
      pet.orbs[t].level = 1;
      pet.orbs[t].exp = 0;
    }
  }
  bag.orbShard = 0;
  return pet;
}

/* 宠物战斗属性应用宝珠加成 */
function applyOrbStats(petUnit, pet) {
  if (!pet.orbs) return petUnit;
  for (var t in pet.orbs) {
    var orb = pet.orbs[t];
    var stat = orbStat(orb);
    if (petUnit.base[t] !== undefined) petUnit.base[t] += stat;
    else if (t === 'hp') petUnit.base.hp += stat;
  }
  if (pet.orbs.hp) petUnit.hp += orbStat(pet.orbs.hp);
  return petUnit;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.ORB_TYPES = ORB_TYPES;
  window.createOrb = createOrb;
  window.orbStat = orbStat;
  window.synthOrb = synthOrb;
  window.decomposeOrb = decomposeOrb;
  window.orbUpgradeCost = orbUpgradeCost;
  window.upgradeOrb = upgradeOrb;
  window.equipOrb = equipOrb;
  window.unequipOrb = unequipOrb;
  window.monthlyResetOrbs = monthlyResetOrbs;
  window.applyOrbStats = applyOrbStats;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ORB_TYPES = ORB_TYPES;
  globalThis.createOrb = createOrb;
  globalThis.orbStat = orbStat;
  globalThis.synthOrb = synthOrb;
  globalThis.decomposeOrb = decomposeOrb;
  globalThis.orbUpgradeCost = orbUpgradeCost;
  globalThis.upgradeOrb = upgradeOrb;
  globalThis.equipOrb = equipOrb;
  globalThis.unequipOrb = unequipOrb;
  globalThis.monthlyResetOrbs = monthlyResetOrbs;
  globalThis.applyOrbStats = applyOrbStats;
}

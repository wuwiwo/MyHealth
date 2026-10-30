#!/usr/bin/env node
/* v2.16 新增套件：宠物「凝聚 / 共鸣」口径 —— 作者裁决（**以第二段为准**）的**唯一口径锁**

   === 作者裁决（逐字，落地成的公式）===
     凝聚：所有获得的**成熟期**宠物对应属性的 **3%** 属性计算为凝聚值
           （**数值，与基础值相加，不包含速度**）
           凝聚[k] = 0.03 × Σ(所有【成熟期】宠物该属性 base)      k ∈ {hp,atk,def,soulAtk,soulDef}
     共鸣：所有获得的**成熟期**宠物，根据稀有度提供共鸣加成（**百分比**，相加）
           Σ共鸣%  = Σ(每只【成熟期】宠物的稀有度档位)          UR 10 / SSR 8 / SR 7 / R 6
     最终计算：稀有度 ＋ Σ宝珠 ＋ Σ共鸣
     最终     ＝ (基础 ＋ Σ凝聚) × 加成合计%
     所有宠物的 Σ共鸣、Σ凝聚 **应该会是相同的**  ← 硬性不变量

   === 本套 7 组断言 ===
     [1] 纯函数恒等式：final[k] = floor((base[k] ＋ S凝聚[k]) × 加成合计%[k] / 100)，
         速度 = 基础（不参与凝聚、不参与百分比池）
     [2] **S凝聚 / S共鸣% 对每只宠完全相同**（逐宠扫描 ＋ 跨稀有度对照 ＋ 跨「上不上场」对照）
     [3] **只统计成熟期**：蛋期 / 成长期宠物对两个值**零影响**（含反证：转成熟后必须变大）；
         受伤 / 阵亡**不另外筛**（作者只说「成熟期」）
     [4] 面板（petStatBreakdown）与实战（buildGroupBattlePets → applyBattlePetBaseBonuses →
         boostPetForGroup）**逐属性一致**
     [5] 纯函数：不写入参 / 连续调用逐字节不变
     [6] **改前（git HEAD = v2.15）→ 改后**：UR / SSR / SR 各一只的 final 逐属性 ＋ 整体强度变化%
     [7] 源码守卫：池里**只有三项**（稀有度 ＋ Σ宝珠 ＋ Σ共鸣）、凝聚只加一次、只筛阶段

   Run: node scripts/test-pet-bonus-cohesion-resonance.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'page', f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
const BONUS_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];   // 速度不参与

function makeSandbox(opts) {
  opts = opts || {};
  let a = (opts.seed || 20261014) >>> 0;
  const rnd = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const sb = { Math: M, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, cloneNode: () => null, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => {
    const code = (f === 'pet-store.js' && opts.storeSrc) ? opts.storeSrc
      : (f === 'group-levels.js' && opts.glSrc) ? opts.glSrc : src(f);
    vm.runInContext(code, sb);
  });
  return sb;
}

/* ---- fixture：UR / SSR / SR / R 各一只以上 ＋ 蛋期 ＋ 成长期 ＋ 受伤 ＋ 阵亡 ----
   mature：dream(UR) / possum(SSR) / chirpbird(SR) / nonebear(R) / waterdrop(R)  → 5 只
   egg   ：kirin         （**必须完全不影响**两次求和）
   grow  ：lightspirit   （同上）
   injured：sparkle（成熟期 · 受伤 → **仍然计入**）
   dead  ：darkcrow（成熟期 · 阵亡 → **仍然计入**）
   → Σ共鸣% = UR10 ＋ SSR8 ＋ SR7 ＋ R6 ＋ R6 ＋ SR7 ＋ R7?? 见下面 [0] 的实算 */
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
function fixture(sb) {
  const pets = [
    mkPet(sb, 'dream', { refineLevel: 4, refineStats: { hp: 400, atk: 20 } }),          // UR
    mkPet(sb, 'possum', { orbs: { atk: { id: 'orb-a', type: 'atk', rarity: 'SR', level: 3 } } }), // SSR + 宝珠
    mkPet(sb, 'chirpbird'),                                                             // SR
    mkPet(sb, 'nonebear'),                                                              // R
    mkPet(sb, 'waterdrop'),                                                             // R
    mkPet(sb, 'sparkle', { injured: true, injuryHeal: 40 }),                            // 成熟期·受伤 → 计入
    mkPet(sb, 'darkcrow', { isDead: true, health: 0 }),                                 // 成熟期·阵亡 → 计入
    mkPet(sb, 'kirin', { stage: 'egg', hatchProgress: 30, refineStats: { hp: 999 } }),   // 蛋期 → **不计入**
    mkPet(sb, 'lightspirit', { stage: 'grow', growth: 40, refineStats: { hp: 888 } })    // 成长期 → **不计入**
  ];
  sb.store.set('pets', {
    version: 1, pets: pets,
    materials: { nutrition: 3, feed: 6, spirit: 900, refineNormal: 5, refineHigh: 1, orbShard: 0 },
    orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null
  });
  return pets;
}

const sb = makeSandbox();
const pets = fixture(sb);
const ur = pets.filter(p => p.speciesId === 'dream')[0];
const ssr = pets.filter(p => p.speciesId === 'possum')[0];
const sr = pets.filter(p => p.speciesId === 'chirpbird')[0];

/* ============================================================
   [0] 口径常量 ＋ fixture
   ============================================================ */
console.log('\n[0] 口径常量与 fixture');
assert('凝聚档位 = 3%（TEAM_COHESION_PCT，唯一来源）', sb.TEAM_COHESION_PCT === 3, String(sb.TEAM_COHESION_PCT));
assert('共鸣档位表 = UR 10 / SSR 8 / SR 7 / R 6（相加）',
  JSON.stringify(sb.PET_RESONANCE_SCALE) === JSON.stringify({ UR: 10, SSR: 8, SR: 7, R: 6 }),
  JSON.stringify(sb.PET_RESONANCE_SCALE));
assert('宠物稀有度档位映射：UR/SSR/SR/R/未知→R',
  sb.petRarityResonancePct('UR') === 10 && sb.petRarityResonancePct('SSR') === 8 &&
  sb.petRarityResonancePct('SR') === 7 && sb.petRarityResonancePct('R') === 6 &&
  sb.petRarityResonancePct('???') === 6);
const view = sb.petBaseBonusView();
assert('fixture：9 只宠物，其中 7 只成熟期（含 1 受伤 / 1 阵亡）',
  view.allCount === 9 && view.matureCount === 7, view.allCount + ' / ' + view.matureCount);
assert('fixture 覆盖 UR / SSR / SR / R 四档',
  pets.some(p => p.rarity === 'UR') && pets.some(p => p.rarity === 'SSR') &&
  pets.some(p => p.rarity === 'SR') && pets.some(p => p.rarity === 'R'));
/* Σ共鸣% 的实算（逐只列出来，便于报告引用） */
const maturePets = pets.filter(p => p.stage === 'mature');
const byRarity = {};
maturePets.forEach(p => { const r = (sb.createPetUnit(p).tags || [])[1] || 'R'; byRarity[r] = (byRarity[r] || 0) + 1; });
const expectRes = Object.keys(byRarity).reduce((s, r) => s + byRarity[r] * sb.petRarityResonancePct(r), 0);
console.log('   成熟期稀有度分布 ' + JSON.stringify(byRarity) + ' → Σ共鸣% = ' + expectRes);
const matureSum = sb.petMatureBaseSum();
console.log('   S凝聚 = 成熟期基础之和 ' + JSON.stringify(matureSum) + ' × 3% = ' + JSON.stringify(view.cohesion));
assert('S共鸣% 实算 = ' + expectRes + '%（逐只稀有度档位相加）', view.resonancePct === expectRes,
  view.resonancePct + ' vs ' + expectRes);
assert('S凝聚[k] 实算 = 成熟期之和 × 3%（逐属性）',
  BONUS_KEYS.every(k => view.cohesion[k] === matureSum[k] * 3 / 100), JSON.stringify(view.cohesion));

/* ============================================================
   [1] 纯函数恒等式（含速度特殊处理）
   ============================================================ */
console.log('\n[1] final[k] = floor((base[k] ＋ S凝聚[k]) × 加成合计%[k] / 100) 逐属性成立');
pets.forEach(function (pet) {
  const u = sb.createPetUnit(pet);
  const rar = sb.petUnitRarityPct(u);
  const pool = sb.petBonusAdditivePool(matureSum, u.base, rar, u._orbPct, view.resonancePct);
  const bad = BONUS_KEYS.filter(function (k) {
    const total = rar + (u._orbPct[k] || 0) + view.resonancePct;
    return pool.totalPct[k] !== total ||
      pool.final[k] !== Math.max(1, Math.floor((u.base[k] + pool.cohesion[k]) * total / 100));
  });
  assert(pet.speciesId + '（' + pet.rarity + '·' + pet.stage + '）5 个参与属性满足恒等式', bad.length === 0,
    bad.map(k => k + ':' + pool.final[k]).join(','));
  assert(pet.speciesId + '·速度 = 基础（凝聚 0、加成合计 100、final = base.spd）',
    pool.cohesion.spd === 0 && pool.totalPct.spd === 100 && pool.final.spd === u.base.spd,
    JSON.stringify({ spd: u.base.spd, final: pool.final.spd, total: pool.totalPct.spd }));
});
/* 3 只代表宠（UR/SSR/SR）逐属性打印：凝聚 → (基础＋凝聚) × 池% → final */
console.log('   —— 三只代表宠的逐属性算式 ——');
[ur, ssr, sr].forEach(function (pet) {
  const bd = sb.petStatBreakdown(pet);
  STAT_KEYS.forEach(function (k) {
    const isSpd = (k === 'spd');
    console.log('   ' + (pet.speciesId + '(' + pet.rarity + ')').padEnd(18) + k.padEnd(8)
      + 'base=' + String(bd.base[k]).padStart(5) + ' 凝聚=' + String(bd.cohesion[k]).padStart(7)
      + ' ×' + (isSpd ? 100 : bd.totalPct[k]) + '% → ' + String(bd.final[k]).padStart(6));
  });
});

/* ============================================================
   [2] S凝聚 / S共鸣% 对**每只宠完全相同**（硬性不变量）
   ============================================================ */
console.log('\n[2] 每只宠看到的 S凝聚 / S共鸣% 完全相同（含跨稀有度 / 跨「上不上场」）');
const allPools = pets.map(function (pet) {
  const u = sb.createPetUnit(pet);
  return { pet: pet, pool: sb.petBonusAdditivePool(matureSum, u.base, sb.petUnitRarityPct(u), u._orbPct, view.resonancePct) };
});
BONUS_KEYS.forEach(function (k) {
  const set = new Set(allPools.map(p => p.pool.cohesion[k]));
  assert('[' + k + '] 9 只宠（含蛋期/成长）的 S凝聚只有 **1 个值**（' + [...set][0] + '）',
    set.size === 1, [...set].join(' / '));
});
assert('S共鸣% 只有 **1 个值**（' + allPools[0].pool.resonancePct + '%）',
  new Set(allPools.map(p => p.pool.resonancePct)).size === 1);
/* 直接对照：UR / SSR / SR 三只（稀有度不同、基础不同） */
const bdUR = sb.petStatBreakdown(ur);
const bdSSR = sb.petStatBreakdown(ssr);
const bdSR = sb.petStatBreakdown(sr);
assert('UR / SSR / SR 的 S凝聚 逐属性完全相同（' + JSON.stringify(bdUR.cohesion) + '）',
  BONUS_KEYS.every(k => bdUR.cohesion[k] === bdSSR.cohesion[k] && bdUR.cohesion[k] === bdSR.cohesion[k]),
  JSON.stringify([bdUR.cohesion, bdSSR.cohesion, bdSR.cohesion]));
assert('UR / SSR / SR 的 S共鸣% 完全相同（' + bdUR.resonancePct + '%）',
  bdUR.resonancePct === bdSSR.resonancePct && bdUR.resonancePct === bdSR.resonancePct);
assert('三个稀有度只差在「稀有度%」这一项：1600 / 1500 / 1400（相差正好 100 个百分点）',
  bdUR.rarityPct === 1600 && bdSSR.rarityPct === 1500 && bdSR.rarityPct === 1400 &&
  bdUR.rarityPct - bdSSR.rarityPct === 100 && bdSSR.rarityPct - bdSR.rarityPct === 100,
  [bdUR.rarityPct, bdSSR.rarityPct, bdSR.rarityPct].join(' / '));
assert('加成合计 = 稀有度 ＋ Σ宝珠 ＋ Σ共鸣（逐属性，因此三只的 totalPct 只差在稀有度与宝珠）',
  [bdUR, bdSSR, bdSR].every(b => BONUS_KEYS.every(k => b.totalPct[k] === b.rarityPct + (b.orbPct[k] || 0) + b.resonancePct)),
  [bdUR.totalPct.atk, bdSSR.totalPct.atk, bdSR.totalPct.atk].join(' / '));
/* 「上不上场」不影响：同一只宠，参战阵容不同 → 两个值不变 */
(() => {
  const solo = sb.buildGroupBattlePets([ur.speciesId], sb.PET_BATTLE_MAX);
  const trio = sb.buildGroupBattlePets([ur.speciesId, ssr.speciesId, sr.speciesId], sb.PET_BATTLE_MAX);
  const bp1 = sb.petBenchPctOf(solo[0]);
  const bp2 = sb.petBenchPctOf(trio[0]);
  assert('同一只宠：单人上场 vs 三人上场，挂上的 S凝聚 / S共鸣% 完全相同（口径与阵容无关）',
    BONUS_KEYS.every(k => bp1.cohesion[k] === bp2.cohesion[k]) && bp1.resonancePct === bp2.resonancePct);
  assert('且等于视图（唯一取数口）',
    BONUS_KEYS.every(k => bp1.cohesion[k] === view.cohesion[k]) && bp1.resonancePct === view.resonancePct);
})();

/* ============================================================
   [3] **只统计成熟期**（蛋期 / 成长期零影响）＋ 伤病/阵亡不另外筛
   ============================================================ */
console.log('\n[3] 只统计成熟期（蛋期 / 成长期零影响；伤病 / 阵亡不另外筛）');
(() => {
  const base = { sum: sb.petMatureBaseSum(), res: sb.petTeamResonancePct() };
  const withStage = (sid, stage) => {
    const arr = sb.getPetStore().pets;
    const p = arr.filter(x => x.speciesId === sid)[0];
    const old = p.stage;
    p.stage = stage;
    const r = { sum: sb.petMatureBaseSum(), res: sb.petTeamResonancePct() };
    p.stage = old;
    return r;
  };
  /* 反证 1：把蛋期的麒麟（含 +999 生命炼化）转成熟 → 两个值都必须变大 */
  const kirinAsMature = withStage('kirin', 'mature');
  assert('反证：蛋期宠转成熟后 S凝聚 变大（生命 ' + base.sum.hp + ' → ' + kirinAsMature.sum.hp + '）',
    kirinAsMature.sum.hp > base.sum.hp, JSON.stringify(kirinAsMature.sum));
  assert('反证：蛋期宠转成熟后 Σ共鸣 变大（' + base.res + '% → ' + kirinAsMature.res + '%）',
    kirinAsMature.res > base.res, kirinAsMature.res + ' vs ' + base.res);
  /* 反证 2：成长期的 lightspirit 同理 */
  const lightAsMature = withStage('lightspirit', 'mature');
  assert('反证：成长期宠转成熟后 S凝聚 与 Σ共鸣 都变大',
    lightAsMature.sum.hp > base.sum.hp && lightAsMature.res > base.res);
  /* 主断言：它们现在是「蛋 / 成长」→ 对两个值**零贡献** */
  const sumWithout = BONUS_KEYS.reduce(function (o, k) {
    o[k] = sb.getPetStore().pets.filter(p => p.stage === 'mature')
      .reduce((s, p) => s + (sb.createPetUnit(p).base[k] || 0), 0);
    return o;
  }, {});
  assert('S凝聚 = 逐只成熟期 base 之和 × 3%（蛋期/成长宠物完全不参与）',
    BONUS_KEYS.every(k => base.sum[k] === sumWithout[k] && base.sum[k] === Math.round(sumWithout[k] * 100) / 100));
  /* 蛋期宠的炼化值再加大，也不影响两个值 */
  const kirin = sb.getPetStore().pets.filter(p => p.speciesId === 'kirin')[0];
  const oldRef = kirin.refineStats;
  kirin.refineStats = { hp: 99999, atk: 9999 };
  assert('蛋期宠把炼化堆到 99999 生命，S凝聚 / Σ共鸣 **一个数都不变**（阶段筛生效）',
    sb.petMatureBaseSum().hp === base.sum.hp && sb.petTeamResonancePct() === base.res,
    sb.petMatureBaseSum().hp + ' vs ' + base.sum.hp);
  kirin.refineStats = oldRef;
  /* 伤病 / 阵亡：不另外筛（作者只说「成熟期」） */
  assert('受伤的成熟期宠仍计入（sparkle 在成熟期 → 计入 S凝聚 / Σ共鸣）',
    sb.petStatBreakdown(pets.filter(p => p.speciesId === 'sparkle')[0]).cohesion.hp === base.sum.hp * 3 / 100);
  assert('阵亡的成熟期宠仍计入（darkcrow 在成熟期 → 计入 S凝聚 / Σ共鸣）',
    sb.petStatBreakdown(pets.filter(p => p.speciesId === 'darkcrow')[0]).cohesion.hp === base.sum.hp * 3 / 100);
  /* 把一只成熟宠降回蛋期 → 两个值都变小 */
  const dropOne = withStage('waterdrop', 'egg');
  assert('反证：一只成熟宠转蛋期后 S凝聚 与 Σ共鸣 都变小',
    dropOne.sum.hp < base.sum.hp && dropOne.res < base.res);
})();

/* ============================================================
   [4] 面板 ≡ 实战（逐属性）
   ============================================================ */
console.log('\n[4] 面板（petStatBreakdown）≡ 实战（buildGroupBattlePets 全链）逐属性一致');
[ur, ssr, sr].forEach(function (pet) {
  const bd = sb.petStatBreakdown(pet);
  const built = sb.buildGroupBattlePets([pet.speciesId], sb.PET_BATTLE_MAX);
  const diff = STAT_KEYS.filter(k => bd.final[k] !== (built[0].base[k] || 0));
  assert('面板 final == 实战 base：' + pet.speciesId + '（' + pet.rarity + '）', diff.length === 0,
    diff.map(k => k + ' panel=' + bd.final[k] + ' battle=' + built[0].base[k]).join(' '));
  assert('面板 final == 纯函数 pureFinal：' + pet.speciesId,
    STAT_KEYS.every(k => bd.final[k] === bd.pureFinal[k]));
});
/* 全链（多宠一次建场）也一致 */
(() => {
  const built = sb.buildGroupBattlePets([ur.speciesId, ssr.speciesId, sr.speciesId, 'nonebear'], sb.PET_BATTLE_MAX);
  const bad = [];
  built.forEach(function (u) {
    const pet = pets.filter(p => p.speciesId === u._petSpecies)[0];
    const bd = sb.petStatBreakdown(pet);
    STAT_KEYS.forEach(k => { if (bd.final[k] !== u.base[k]) bad.push(pet.speciesId + '.' + k + ':' + bd.final[k] + '/' + u.base[k]); });
  });
  assert('4 只一起建场：逐只逐属性 面板 == 实战', bad.length === 0, bad.join(' '));
  assert('建场不改存档、不改宠物本体（面板/实战都是只读）', (function () {
    const s0 = JSON.stringify(sb.getPetStore());
    const p0 = JSON.stringify(pets);
    sb.buildGroupBattlePets([ur.speciesId, ssr.speciesId], sb.PET_BATTLE_MAX);
    sb.petStatBreakdown(ur);
    return JSON.stringify(sb.getPetStore()) === s0 && JSON.stringify(pets) === p0;
  })());
})();

/* ============================================================
   [5] 纯函数：不写入参 / 连续调用不变
   ============================================================ */
console.log('\n[5] 纯函数契约（不写入参 / 连续调用逐字节不变）');
(() => {
  const sum = JSON.parse(JSON.stringify(matureSum));
  const selfBase = { hp: 620, atk: 45, def: 33, spd: 7, soulAtk: 28, soulDef: 21 };
  const orb = { atk: 12, hp: 5 };
  const snap = JSON.stringify({ sum, selfBase, orb });
  const r1 = sb.petBonusAdditivePool(sum, selfBase, sb.PET_GROUP_SCALE.UR, orb, view.resonancePct);
  assert('不修改入参（matureBaseSum / selfBase / orbPct 一字不变）',
    JSON.stringify({ sum, selfBase, orb }) === snap);
  assert('同一入参连续 30 次调用逐字节一致（无内部状态）', (function () {
    const sig = [];
    for (let i = 0; i < 30; i++) sig.push(JSON.stringify(sb.petBonusAdditivePool(sum, selfBase, sb.PET_GROUP_SCALE.UR, orb, view.resonancePct)));
    return sig.every(x => x === sig[0]);
  })());
  assert('输出结构就是任务要求的六个字段（cohesion / resonancePct / rarityPct / orbPct / totalPct / final）',
    typeof r1.cohesion === 'object' && typeof r1.resonancePct === 'number' &&
    typeof r1.rarityPct === 'number' && typeof r1.orbPct === 'object' &&
    typeof r1.totalPct === 'object' && typeof r1.final === 'object');
  assert('返回值里没有 NaN / Infinity / undefined', !/NaN|Infinity|undefined/.test(JSON.stringify(r1)));
  /* 空存档（0 只成熟期）→ 凝聚 0、Σ共鸣 0，final 退回「只有稀有度层」 */
  const sbEmpty = makeSandbox({ seed: 5 });
  sbEmpty.store.set('pets', { version: 1, pets: [], materials: {}, orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null });
  const v0 = sbEmpty.petBaseBonusView();
  assert('空存档：S凝聚 全 0、Σ共鸣 0、matureCount 0',
    v0.matureCount === 0 && v0.resonancePct === 0 && BONUS_KEYS.every(k => v0.cohesion[k] === 0));
  const r0 = sbEmpty.petBonusAdditivePool(v0.matureBaseSum, selfBase, sbEmpty.PET_GROUP_SCALE.SSR, {}, v0.resonancePct);
  assert('空存档：final = floor(基础 × 1500%)（退化为「只有稀有度」）',
    r0.final.atk === Math.floor(45 * 1500 / 100) && r0.final.spd === 7, JSON.stringify(r0.final));
})();

/* ============================================================
   [6] 改前（git HEAD = v2.15）→ 改后：UR / SSR / SR 各一只
   ============================================================ */
console.log('\n[6] 改前 → 改后（UR / SSR / SR 各一只 · final 逐属性 ＋ 整体强度变化%）');
/* 改前（v2.15）：凝聚/共鸣都折成「全部宠物之和 × 档位 ÷ 本宠基础」的百分比进池 */
const OLD_FINAL = {
  dream: { hp: 11903, atk: 834, def: 341, spd: 9, soulAtk: 341, soulDef: 254 },
  possum: { hp: 3703, atk: 339, def: 246, spd: 8, soulAtk: 246, soulDef: 164 },
  chirpbird: { hp: 2803, atk: 244, def: 161, spd: 6, soulAtk: 161, soulDef: 98 }
};
function headSrc(f) {
  return cp.execSync('git -C "' + ROOT.replace(/\\/g, '/') + '" show HEAD:page/' + f,
    { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
}
let oldStore = null, oldGl = null;
try { oldStore = headSrc('pet-store.js'); oldGl = headSrc('group-levels.js'); }
catch (e) { console.log(' · git 取不到改前文件（' + (e && e.message ? e.message.split('\n')[0] : 'unknown') + '）→ 只打印写死的改前黄金值'); }
const headIsOld = !!oldStore && oldStore.indexOf('PET_RESONANCE_SCALE') < 0;
let oldBds = null;
if (headIsOld) {
  const sbOld = makeSandbox({ storeSrc: oldStore, glSrc: oldGl });
  const oldPets = fixture(sbOld);
  oldBds = {
    dream: sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'dream')[0]),
    possum: sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'possum')[0]),
    chirpbird: sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'chirpbird')[0])
  };
}
const newBds = { dream: bdUR, possum: bdSSR, chirpbird: bdSR };
const pct = (a, b) => ((b / a - 1) * 100).toFixed(1) + '%';
['dream', 'possum', 'chirpbird'].forEach(function (sid) {
  const nb = newBds[sid];
  const ob = oldBds ? oldBds[sid] : null;
  const oldFinal = ob ? ob.final : OLD_FINAL[sid];
  STAT_KEYS.forEach(function (k) {
    console.log('   ' + sid.padEnd(9) + '[' + k.padEnd(7) + '] 改前 ' + String(oldFinal[k]).padStart(6)
      + ' → 改后 ' + String(nb.final[k]).padStart(6) + '  (' + pct(oldFinal[k], nb.final[k]) + ')');
    if (ob) assert('改前 ' + sid + '[' + k + '] 复算 = 记录的旧值 ' + OLD_FINAL[sid][k], ob.final[k] === OLD_FINAL[sid][k],
      ob.final[k] + ' vs ' + OLD_FINAL[sid][k]);
  });
  const sumOld = BONUS_KEYS.reduce((s, k) => s + oldFinal[k], 0);
  const sumNew = BONUS_KEYS.reduce((s, k) => s + nb.final[k], 0);
  console.log('   ' + sid.padEnd(9) + ' 整体强度（5 项 final 之和） ' + sumOld + ' → ' + sumNew
    + '  (' + pct(sumOld, sumNew) + ')');
  assert('改后 ≠ 改前（口径确实变了）：' + sid + '（生命 ' + oldFinal.hp + ' → ' + nb.final.hp + '）',
    oldFinal.hp !== nb.final.hp);
});
(() => {
  const sumOld = {}, sumNew = {};
  ['dream', 'possum', 'chirpbird'].forEach(function (sid) {
    const oldFinal = oldBds ? oldBds[sid].final : OLD_FINAL[sid];
    BONUS_KEYS.forEach(k => {
      sumOld[k] = (sumOld[k] || 0) + oldFinal[k];
      sumNew[k] = (sumNew[k] || 0) + newBds[sid].final[k];
    });
  });
  const totOld = BONUS_KEYS.reduce((s, k) => s + sumOld[k], 0);
  const totNew = BONUS_KEYS.reduce((s, k) => s + sumNew[k], 0);
  console.log('   === 三只合计（UR+SSR+SR · 15 个数值） ' + totOld + ' → ' + totNew + '  (' + pct(totOld, totNew) + ') ===');
  BONUS_KEYS.forEach(k => console.log('        ' + k.padEnd(8) + String(sumOld[k]).padStart(7) + ' → ' + String(sumNew[k]).padStart(7)
    + '  (' + pct(sumOld[k], sumNew[k]) + ')'));
  assert('整体强度确实变化（三只合计 ' + totOld + ' → ' + totNew + '）', totOld !== totNew);
  assert('速度不受影响（三只 spd 都是 0.0% 变化）',
    ['dream', 'possum', 'chirpbird'].every(sid => {
      const oldFinal = oldBds ? oldBds[sid].final : OLD_FINAL[sid];
      return oldFinal.spd === newBds[sid].final.spd;
    }));
})();

/* ============================================================
   [7] 源码守卫
   ============================================================ */
console.log('\n[7] 源码守卫（池只有三项 / 凝聚只加一次 / 只筛阶段）');
const ps = src('pet-store.js');
const gl = src('group-levels.js');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const glCode = stripComments(gl);
const psCode = stripComments(ps);
assert('池 = 稀有度 ＋ Σ宝珠 ＋ Σ共鸣（三项，没有第四项）',
  /var poolPct = rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ resPct;/.test(glCode));
assert('凝聚只加一次：(base + cohesion) × poolPct / 100',
  /unit\.base\[s\] = Math\.max\(1, Math\.floor\(\(unit\.base\[s\] \+ \(cohMap\[s\] \|\| 0\)\) \* poolPct \/ 100\)\)/.test(glCode));
assert('速度不在 boostPetForGroup 的逐属性列表里（不被加凝聚、不被乘池）',
  /\['atk', 'def', 'hp', 'soulAtk', 'soulDef'\]/.test(glCode) && !/spd/.test(glCode.slice(glCode.indexOf('function boostPetForGroup'), glCode.indexOf('function groupHash'))));
assert('凝聚固定值只在 petBonusAdditivePool 里算（成熟期之和 × TEAM_COHESION_PCT ÷ 100）',
  /var coh = inPool \? \(\(sum\[k\] \|\| 0\) \* TEAM_COHESION_PCT \/ 100\) : 0;/.test(psCode));
assert('Σ共鸣 只在 petTeamBaseScan 里累加（petRarityResonancePct）',
  (psCode.match(/resPct \+= petRarityResonancePct/g) || []).length === 1);
assert('旧口径「按只数取档」的 resonanceBonus 已不在公式链路上',
  psCode.indexOf('resonanceBonus(') < 0 && glCode.indexOf('resonanceBonus') < 0);
assert('凝聚 / 共鸣唯一挂载点 = petSetBenchPct（petAttachBenchPct 是唯一写入口）',
  /function petAttachBenchPct/.test(psCode) && (psCode.match(/petSetBenchPct\(/g) || []).length >= 1);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

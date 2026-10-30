#!/usr/bin/env node
/* v2.16 套件：宠物加成**口径**（作者裁决，**以第二段为准**）
   —— 凝聚是「固定值」、共鸣是「进池百分比」，两者都只统计【成熟期】宠物。

   被钉死的口径（唯一真相）：
       凝聚 S凝聚[k] = 3% × Σ(所有【成熟期】宠物该属性 base)      k ∈ {hp,atk,def,soulAtk,soulDef}
       共鸣 S共鸣%   = Σ(每只【成熟期】宠物的稀有度档位)            UR 10 / SSR 8 / SR 7 / R 6（相加）
       加成合计%[k]  = 稀有度%(本宠) ＋ Σ宝珠%[k](本宠) ＋ S共鸣%
       最终[k]       = floor( (base[k] ＋ S凝聚[k]) × 加成合计%[k] / 100 )
       速度 spd      = base.spd（不参与凝聚、不参与百分比池）

   本套 7 组断言：
     [1] 纯函数逐属性恒等式：final = floor((基础 ＋ 凝聚) × (稀有度＋宝珠＋Σ共鸣) ÷ 100)
     [2] **S凝聚 / S共鸣% 对每只宠完全相同**（全局常量），且等于契约值
     [3] 面板链（petStatBreakdown）与实战链（buildGroupBattlePets）**逐属性同值**
     [4] 池的唯一出口 boostPetForGroup：池**只有三项**（稀有度 ＋ Σ宝珠 ＋ Σ共鸣），无残留项
     [5] 纯函数：不写入参 / 连续 N 次不变 / 脏存档安全
     [6] **只统计成熟期**：蛋期 / 成长期不影响两值（含反证）；受伤 / 阵亡**不另外筛**
     [7] 源码级守卫：池唯一出口 / 单一公式实现 / 只筛阶段 / applyBattlePetBaseBonuses 不写 base

   Run: node scripts/test-pet-bonus-additive.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'page', f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
const BONUS_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];

/* 与 test-pet-bonus-display / test-pet-compare 同一套沙箱（口径同源、加载顺序一致） */
function makeSandbox(seed) {
  let a = (seed || 20261013) >>> 0;
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
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(src(f), sb));
  return sb;
}

function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
function seedStore(sb, pets) {
  sb.store.set('pets', { version: 1, pets: pets, materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null });
  return pets;
}

/* ============================================================
   fixture A：12 只宠，覆盖 UR / SSR / SR / R ＋ 炼化 ＋ 宝珠 ＋ 受伤 ＋ 阵亡 ＋ 蛋期
   ============================================================ */
const sb = makeSandbox();
const petsA = [
  mkPet(sb, 'dream', { refineLevel: 6, refineStats: { hp: 720, atk: 30, def: 20, soulAtk: 20, soulDef: 15 } }),   // UR
  mkPet(sb, 'possum', { orbs: { atk: { id: 'orb-a', type: 'atk', rarity: 'SR', level: 3 } } }),                   // SSR + 宝珠
  mkPet(sb, 'icecrystal', { refineLevel: 2, refineStats: { hp: 60, atk: 8 } }),                                    // SSR
  mkPet(sb, 'chirpbird'),                                                                                          // SR
  mkPet(sb, 'sparkle', { injured: true, injuryHeal: 40 }),                                                         // 受伤（仍是成熟期）
  mkPet(sb, 'nonebear', { isDead: true, health: 0 }),                                                              // 阵亡（仍是成熟期）
  Object.assign(mkPet(sb, 'kirin'), { stage: 'egg', hatchProgress: 30 }),                                          // 蛋期 → 不计入
  mkPet(sb, 'lightspirit'),
  mkPet(sb, 'darkcrow'),
  mkPet(sb, 'flamechick'),
  mkPet(sb, 'rocksteady'),
  mkPet(sb, 'waterdrop')
];
seedStore(sb, petsA);
console.log('\n[0] fixture A：' + petsA.length + ' 只（UR/SSR/SR/R ＋ 宝珠 ＋ 受伤 ＋ 阵亡 ＋ 蛋期）');
assert('12 只宠全部进了存档', sb.getPetStore().pets.length === 12);
assert('含 1 只受伤 / 1 只阵亡 / 1 只蛋期',
  petsA.filter(p => p.injured).length === 1 && petsA.filter(p => p.isDead).length === 1 &&
  petsA.filter(p => p.stage === 'egg').length === 1);
const view = sb.petBaseBonusView();
assert('成熟期只数 = 11（12 只减去 1 只蛋期）', view.matureCount === 11 && view.allCount === 12,
  view.matureCount + ' / ' + view.allCount);
assert('凝聚档位常量 = 3%（TEAM_COHESION_PCT）', sb.TEAM_COHESION_PCT === 3 && view.cohesionRatePct === 3);
assert('共鸣档位表 = UR 10 / SSR 8 / SR 7 / R 6',
  JSON.stringify(sb.PET_RESONANCE_SCALE) === JSON.stringify({ UR: 10, SSR: 8, SR: 7, R: 6 }),
  JSON.stringify(sb.PET_RESONANCE_SCALE));

/* ============================================================
   [1] 纯函数逐属性恒等式
   ============================================================ */
console.log('\n[1] final = floor((基础 ＋ 凝聚) × (稀有度＋Σ宝珠＋Σ共鸣) ÷ 100) 逐属性成立');
const matureSum = sb.petMatureBaseSum();
const allSum = sb.petAllPetsBaseSum();
assert('petMatureBaseSum 逐属性 > 0（11 只成熟期）',
  BONUS_KEYS.every(k => matureSum[k] > 0) && matureSum.spd > 0);
assert('成熟期之和 < 全部之和（蛋期那只被排除在外）',
  BONUS_KEYS.every(k => matureSum[k] < allSum[k]),
  JSON.stringify(matureSum) + ' vs ' + JSON.stringify(allSum));
petsA.forEach(function (pet) {
  const u = sb.createPetUnit(pet);
  const rar = sb.petUnitRarityPct(u);
  const pool = sb.petBonusAdditivePool(matureSum, u.base, rar, u._orbPct, view.resonancePct);
  const bad = BONUS_KEYS.filter(function (k) {
    const total = rar + (u._orbPct[k] || 0) + view.resonancePct;
    return pool.cohesion[k] !== matureSum[k] * 3 / 100 ||
      pool.totalPct[k] !== total ||
      pool.final[k] !== Math.max(1, Math.floor((u.base[k] + pool.cohesion[k]) * total / 100));
  });
  assert(pet.speciesId + '（' + pet.rarity + '）5 个参与属性全部满足恒等式', bad.length === 0,
    bad.map(k => k + ':' + pool.final[k]).join(','));
  assert(pet.speciesId + '·速度不参与（凝聚 0、加成合计 = 100、final = 基础）',
    pool.totalPct.spd === 100 && pool.final.spd === u.base.spd && pool.cohesion.spd === 0);
});
/* 恒等式的**等价展开形式**：final = floor(基础×稀有度% + 基础×宝珠% + 基础×Σ共鸣% + 凝聚×池%)
   —— 用来证明「凝聚只被池放大一次、且加在基础上」（不是被重复计一层） */
(() => {
  const u = sb.createPetUnit(petsA[0]);
  const pool = sb.petBonusAdditivePool(matureSum, u.base, 1600, u._orbPct, view.resonancePct);
  const k = 'hp';
  const exact = (u.base[k] + pool.cohesion[k]) * pool.totalPct[k] / 100;
  const byParts = u.base[k] * 1600 / 100 + u.base[k] * view.resonancePct / 100 + pool.cohesion[k] * pool.totalPct[k] / 100;
  assert('展开形式与合并形式同值（凝聚确实与基础同乘一个池）',
    Math.abs(exact - byParts) < 1e-6, exact + ' vs ' + byParts);
})();

/* ============================================================
   [2] S凝聚 / S共鸣% 对**每只宠完全相同**（全局常量）
   ============================================================ */
console.log('\n[2] 每只宠看到的 S凝聚 / S共鸣% 完全相同（作者硬性不变量）');
const pools = petsA.map(function (pet) {
  const u = sb.createPetUnit(pet);
  return { pet: pet, pool: sb.petBonusAdditivePool(matureSum, u.base, sb.petUnitRarityPct(u), u._orbPct, view.resonancePct) };
});
BONUS_KEYS.forEach(function (k) {
  const cohSet = new Set(pools.map(p => p.pool.cohesion[k]));
  assert('[' + k + '] 12 只宠的 S凝聚只有 1 个值（' + [...cohSet][0] + '）', cohSet.size === 1,
    [...cohSet].join(','));
  assert('[' + k + '] 契约值 = 成熟期之和 ' + matureSum[k] + ' × 3% = ' + (matureSum[k] * 3 / 100),
    pools[0].pool.cohesion[k] === matureSum[k] * 3 / 100);
});
assert('S共鸣% 只有一个值（' + view.resonancePct + '%）',
  new Set(pools.map(p => p.pool.resonancePct)).size === 1, String(view.resonancePct));
/* Σ共鸣% 的契约值：逐只按稀有度相加（成熟期） */
(() => {
  const expect = petsA.filter(p => p.stage === 'mature')
    .reduce((s, p) => s + sb.petRarityResonancePct(((sb.createPetUnit(p).tags || [])[1] || 'R')), 0);
  assert('S共鸣% = 成熟期逐只稀有度档位之和（' + expect + '%）', view.resonancePct === expect,
    view.resonancePct + ' vs ' + expect);
  const byRarity = {};
  petsA.filter(p => p.stage === 'mature').forEach(p => { byRarity[p.rarity] = (byRarity[p.rarity] || 0) + 1; });
  console.log('   成熟期稀有度分布：' + JSON.stringify(byRarity)
    + ' → Σ共鸣 ' + view.resonancePct + '%');
})();
assert('但 final 各不相同（差异只来自各自的基础与稀有度档位）',
  new Set(pools.map(p => p.pool.final.hp)).size > 3);

/* ============================================================
   [3] 面板链 ≡ 实战链（同一组 final）
   ============================================================ */
console.log('\n[3] 面板（petStatBreakdown）≡ 实战（buildGroupBattlePets）逐属性同值');
const ids = petsA.map(p => p.speciesId);
const built = sb.buildGroupBattlePets(ids, sb.PET_BATTLE_MAX);          // 最多 4 只
assert('实战只建出 4 只（PET_BATTLE_MAX）', built.length === sb.PET_BATTLE_MAX, String(built.length));
built.forEach(function (u) {
  const pet = petsA.filter(p => p.speciesId === u._petSpecies)[0];
  const bd = sb.petStatBreakdown(pet);
  const diff = STAT_KEYS.filter(k => bd.final[k] !== bd.pureFinal[k] || bd.pureFinal[k] !== (u.base[k] || 0));
  assert('面板 / 纯函数 / 实战 三链一致：' + pet.speciesId, diff.length === 0,
    diff.map(k => k + ' panel=' + bd.final[k] + ' pure=' + bd.pureFinal[k] + ' battle=' + u.base[k]).join(' '));
});
/* 面板与「谁上场」无关：换阵容，同一只宠的 final 不变 */
(() => {
  const bdSolo = sb.petStatBreakdown(petsA[0]);
  const builtSolo = sb.buildGroupBattlePets([petsA[0].speciesId], sb.PET_BATTLE_MAX);
  assert('同一只宠：单人上场 vs 满编上场，面板 final 逐属性相同（口径不依赖阵容）',
    STAT_KEYS.every(k => builtSolo[0].base[k] === bdSolo.final[k] && bdSolo.final[k] === bdSolo.pureFinal[k]),
    JSON.stringify(builtSolo[0].base) + ' vs ' + JSON.stringify(bdSolo.final));
})();
/* 面板内部：final 就是 boostPetForGroup 在副本上算出来的（同一条代码路径） */
(() => {
  const bd = sb.petStatBreakdown(petsA[1]);
  assert('petStatBreakdown 的 final 来自 boostPetForGroup（boosted = true）', bd.boosted === true);
  assert('BD 的纯函数值 pureFinal 也等于 final（两条独立实现互校）',
    STAT_KEYS.every(k => bd.final[k] === bd.pureFinal[k]), JSON.stringify(bd.final));
  assert('面板上的 S凝聚 / S共鸣% 与视图同值（同一份取数口）',
    BONUS_KEYS.every(k => bd.cohesion[k] === view.cohesion[k]) && bd.resonancePct === view.resonancePct);
})();

/* ============================================================
   [4] 池的唯一出口 boostPetForGroup —— 池**只有三项**
   ============================================================ */
console.log('\n[4] 池的唯一出口：boostPetForGroup 做「(基础＋凝聚) × 三项之和 ÷ 100」');
(() => {
  const u = sb.createPetUnit(petsA[2]);
  const raw = Object.assign({}, u.base);
  sb.applyBattlePetBaseBonuses([u]);              // 只挂 _benchPct
  assert('applyBattlePetBaseBonuses 不改 base（旧口径会在这里加绝对值）',
    JSON.stringify(u.base) === JSON.stringify(raw));
  const bp = sb.petBenchPctOf(u);
  assert('挂载点存在：cohesion 是**固定值**表、resonancePct 是**一个数**',
    !!bp && BONUS_KEYS.every(k => bp.cohesion[k] > 0) && typeof bp.resonancePct === 'number' && bp.resonancePct > 0,
    JSON.stringify(bp));
  assert('挂载的 cohesion 就是 S凝聚（成熟期之和 × 3%，每只宠相同）',
    BONUS_KEYS.every(k => bp.cohesion[k] === matureSum[k] * 3 / 100));
  sb.boostPetForGroup(u);
  const bad = BONUS_KEYS.filter(function (k) {
    const want = Math.max(1, Math.floor((raw[k] + bp.cohesion[k]) * (sb.petUnitRarityPct(u) + (u._orbPct[k] || 0) + bp.resonancePct) / 100));
    return u.base[k] !== want;
  });
  assert('boostPetForGroup 逐属性 = floor((基础＋凝聚) × 三项之和 ÷ 100)', bad.length === 0, bad.join(','));
  assert('boostPetForGroup 之后 hp 与 base.hp 同步', u.hp === u.base.hp);
  assert('速度不被 boostPetForGroup 改动（也不加凝聚）', u.base.spd === raw.spd, u.base.spd + ' vs ' + raw.spd);
})();
/* 没有挂载点时（老调用点 / 单测直接造单位）池 = 稀有度 ＋ Σ宝珠（行为与 v2.14 一致） */
(() => {
  const a = sb.boostPetForGroup(sb.createUnit({ id: 'p1', side: 'ally', name: '宠', tags: ['pet', 'SSR'],
    base: { hp: 200, atk: 20, def: 15, spd: 8, soulAtk: 15, soulDef: 10 } }));
  assert('未挂载 → 只走稀有度（SSR 1500%）', a.base.atk === Math.floor(20 * 1500 / 100), String(a.base.atk));
  const bUnit = sb.createUnit({ id: 'p2', side: 'ally', name: '宠', tags: ['pet', 'SSR'],
    base: { hp: 200, atk: 20, def: 15, spd: 8, soulAtk: 15, soulDef: 10 } });
  bUnit._orbPct = { atk: 10 };            // 宝珠挂在单位上的形态（与 createPetUnit 一致）
  const b = sb.boostPetForGroup(bUnit);
  assert('未挂载 + 宝珠 → 稀有度 ＋ Σ宝珠（1510%）', b.base.atk === Math.floor(20 * 1510 / 100), String(b.base.atk));
})();
/* v2.15 的两个「贡献值百分比」项必须**彻底消失**（不残留成第四项） */
(() => {
  const u = sb.createPetUnit(petsA[1]);
  const pool = sb.petBonusAdditivePool(matureSum, u.base, sb.petUnitRarityPct(u), u._orbPct, view.resonancePct);
  assert('旧口径字段 cohesionPct / resonanceValue / cohesionValue 已下线',
    pool.cohesionPct === undefined && pool.cohesionValue === undefined && pool.resonanceValue === undefined);
  assert('总数里没有第四项：totalPct = 稀有度 ＋ Σ宝珠 ＋ Σ共鸣（逐属性）',
    BONUS_KEYS.every(k => pool.totalPct[k] === sb.petUnitRarityPct(u) + (u._orbPct[k] || 0) + view.resonancePct));
})();

/* ============================================================
   [5] 纯函数契约：不写入参 / 连续 N 次不变 / 除零安全
   ============================================================ */
console.log('\n[5] 纯函数契约（不写入参 / 幂等 / 除零与脏存档）');
(() => {
  const u = sb.createPetUnit(petsA[0]);
  const snap = JSON.stringify({ sum: matureSum, base: u.base, unit: u });
  const r1 = sb.petBonusAdditivePool(matureSum, u.base, 1600, u._orbPct, view.resonancePct);
  assert('不修改入参（matureBaseSum / selfBase / 单位本体 JSON 一字不变）',
    JSON.stringify({ sum: matureSum, base: u.base, unit: u }) === snap);
  const series = [];
  for (let i = 0; i < 50; i++) series.push(JSON.stringify(sb.petBonusAdditivePool(matureSum, u.base, 1600, u._orbPct, view.resonancePct)));
  assert('连续 50 次调用结果逐字节一致', series.every(x => x === series[0]));
  assert('返回值里没有 NaN / Infinity / undefined',
    !/NaN|Infinity|undefined/.test(JSON.stringify(r1)));
})();
(() => {
  const st = JSON.stringify(sb.getPetStore());
  for (let i = 0; i < 20; i++) sb.petStatBreakdown(petsA[i % petsA.length]);
  assert('petStatBreakdown ×20（轮着拆）不写存档', JSON.stringify(sb.getPetStore()) === st);
  const snap0 = JSON.stringify(petsA);
  for (let i = 0; i < 20; i++) sb.petStatBreakdown(petsA[i % petsA.length]);
  assert('petStatBreakdown ×20（轮着拆）不改宠物本体', JSON.stringify(petsA) === snap0);
  const bd1 = JSON.stringify(sb.petStatBreakdown(petsA[0]));
  const bd2 = JSON.stringify(sb.petStatBreakdown(petsA[0]));
  assert('同一只宠连拆两次读数逐字节一致（不会越刷越大）', bd1 === bd2);
})();
(() => {
  const zero = { hp: 0, atk: 0, def: 0, spd: 0, soulAtk: 0, soulDef: 0 };
  const r = sb.petBonusAdditivePool(matureSum, zero, 1600, {}, view.resonancePct);
  assert('基础全 0 → 不产生 NaN / Infinity', !/NaN|Infinity/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 100));
  assert('基础全 0 → 凝聚仍是全局值、final = 凝聚×池%（速度 final = 0）',
    r.cohesion.hp === matureSum.hp * 3 / 100 && r.final.spd === 0 &&
    r.final.hp === Math.floor(r.cohesion.hp * (1600 + view.resonancePct) / 100));
  assert('空存档（0 只宠）→ 凝聚 / Σ共鸣 全 0、不报错', (function () {
    const sbEmpty = makeSandbox(7);
    seedStore(sbEmpty, []);
    const v = sbEmpty.petBaseBonusView();
    const rr = sbEmpty.petBonusAdditivePool(v.matureBaseSum, { hp: 100, atk: 10, def: 5, spd: 3, soulAtk: 4, soulDef: 2 },
      sbEmpty.PET_GROUP_SCALE.SSR, {}, v.resonancePct);
    return v.allCount === 0 && v.matureCount === 0 && v.resonancePct === 0 &&
      rr.cohesion.hp === 0 && rr.final.hp === 1500 && !/NaN|Infinity/.test(JSON.stringify(rr));
  })());
})();

/* ============================================================
   [6] 只统计【成熟期】—— 阶段是**唯一**的筛选条件
   ============================================================ */
console.log('\n[6] 只统计成熟期（蛋期 / 成长期不影响两值；受伤 / 阵亡不另外筛）');
(() => {
  const base = { sum: sb.petMatureBaseSum(), res: sb.petTeamResonancePct() };
  const mutate = (fn) => {
    const pets = sb.getPetStore().pets; const save = pets.map(p => JSON.stringify(p));
    fn(pets);
    const after = { sum: sb.petMatureBaseSum(), res: sb.petTeamResonancePct() };
    pets.forEach((p, i) => { const o = JSON.parse(save[i]); for (const k in o) p[k] = o[k]; });
    return after;
  };
  const injured = mutate(ps => { ps.forEach(p => { p.injured = true; }); });
  assert('全部受伤 → 凝聚/Σ共鸣不变（受伤不另外筛，只筛阶段）',
    JSON.stringify(injured) === JSON.stringify(base));
  const dead = mutate(ps => { ps.forEach(p => { p.isDead = true; }); });
  assert('全部阵亡 → 凝聚/Σ共鸣不变（阵亡不另外筛）', JSON.stringify(dead) === JSON.stringify(base));
  const eggs = mutate(ps => { ps.forEach(p => { p.stage = 'egg'; }); });
  assert('全部蛋期 → 凝聚全 0、Σ共鸣 0（阶段筛生效）',
    BONUS_KEYS.every(k => eggs.sum[k] === 0) && eggs.res === 0, JSON.stringify(eggs));
  const grow = mutate(ps => { ps.forEach(p => { p.stage = 'grow'; }); });
  assert('全部成长期 → 凝聚全 0、Σ共鸣 0', BONUS_KEYS.every(k => grow.sum[k] === 0) && grow.res === 0);
  /* 反证：只把「那一只蛋期宠」变成成熟期 → 两值都必须变大 */
  const oneMore = mutate(ps => { ps.forEach(p => { if (p.stage === 'egg') p.stage = 'mature'; }); });
  assert('反证：唯一那只蛋期宠转成熟后，S凝聚 与 S共鸣% 都严格变大',
    BONUS_KEYS.every(k => oneMore.sum[k] > base.sum[k]) && oneMore.res > base.res,
    JSON.stringify(oneMore) + ' vs ' + JSON.stringify(base));
  /* 反证：把一只成熟期宠降回蛋期 → 两值都必须变小 */
  const oneLess = mutate(ps => { ps[0].stage = 'egg'; });
  assert('反证：一只成熟宠转蛋期后，S凝聚 与 Σ共鸣 都严格变小',
    BONUS_KEYS.every(k => oneLess.sum[k] < base.sum[k]) && oneLess.res < base.res);
})();
(() => {
  /* 参战宠 / 本宠都在成熟期口径里（不是「未上场后备」） */
  const bd = sb.petStatBreakdown(petsA[0]);
  assert('本宠（成熟期）自己也在合计里：去掉它合计严格变小', (function () {
    const u = sb.createPetUnit(petsA[0]);
    const without = {};
    BONUS_KEYS.forEach(k => { without[k] = (sb.getPetStore().pets.slice(1)
      .filter(p => p.stage === 'mature')
      .reduce((s, p) => s + (sb.createPetUnit(p).base[k] || 0), 0)); });
    return BONUS_KEYS.every(k => bd.cohesion[k] > without[k] * 3 / 100);
  })());
  assert('参战宠不被剔除（matureCount = 11 / allCount = 12）',
    bd.matureCount === 11 && bd.allCount === 12, bd.matureCount + ' / ' + bd.allCount);
})();
(() => {
  /* 共鸣档位与「持有总数」无关（旧口径 resonanceBonus 已下线） */
  const sb2 = makeSandbox(11);
  const tiers = [];
  [1, 2, 4, 7, 11].forEach(function (n) {
    seedStore(sb2, petsA.slice(0, n).map(p => { const q = JSON.parse(JSON.stringify(p)); q.stage = 'mature'; return q; }));
    tiers.push(sb2.petBaseBonusView().resonancePct);
  });
  assert('Σ共鸣% 由「成熟期只数 × 稀有度」决定，1/2/4/7/11 只各不相同',
    new Set(tiers).size === 5 && tiers[0] < tiers[4], JSON.stringify(tiers));
  const one = sb2.petBaseBonusView();
  assert('Σ共鸣% 不再按只数取档（旧档位 0/3/5/7/10 已无意义）',
    !/NaN|Infinity/.test(String(one.resonancePct)) && one.resonancePct > 10);
})();

/* ============================================================
   [7] 源码级守卫
   ============================================================ */
console.log('\n[7] 源码守卫（唯一出口 / 单一实现 / 只筛阶段 / 不写 base）');
const ps = src('pet-store.js');
const gl = src('group-levels.js');
const ui = src('pet-ui.js');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const psCode = stripComments(ps);
const glCode = stripComments(gl);
const fnBody = (s, name) => {
  const i = s.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') { depth++; started = true; }
    else if (s[j] === '}') { depth--; if (started && depth === 0) return s.slice(i, j + 1); }
  }
  return s.slice(i);
};
assert('唯一公式实现 petBonusAdditivePool 在 pet-store.js', psCode.indexOf('function petBonusAdditivePool') >= 0);
assert('池的唯一出口 boostPetForGroup 在 group-levels.js', glCode.indexOf('function boostPetForGroup') >= 0);
assert('其他地方没有第二个「三项相加」的池（boostPetForGroup 是唯一出处）',
  (glCode.match(/var poolPct = rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ resPct/g) || []).length === 1);
assert('boostPetForGroup 只读 _benchPct（通过 petBenchPctOf），不自己算 3% / 稀有度档位',
  /petBenchPctOf\(unit\)/.test(glCode) && glCode.indexOf('TEAM_COHESION_PCT') < 0 &&
  glCode.indexOf('PET_RESONANCE_SCALE') < 0 && glCode.indexOf('resonanceBonus') < 0);
assert('凝聚/共鸣的唯一挂载点是 petAttachBenchPct → petSetBenchPct',
  (psCode.match(/petSetBenchPct\(/g) || []).length >= 1 && /function petAttachBenchPct/.test(psCode));
assert('applyBattlePetBaseBonuses 不写 base / hp',
  !/\.(base|hp)\s*(\[[^\]]*\])?\s*=[^=]/.test(fnBody(psCode, 'applyBattlePetBaseBonuses')));
assert('「成熟期」的唯一筛选口是 petTeamBaseScan，且只用 `pet.stage === \'mature\'`', (function () {
  const body = fnBody(psCode, 'petTeamBaseScan');
  return body.length > 200 && body.indexOf("pet.stage === 'mature'") >= 0 &&
    body.indexOf('injured') < 0 && body.indexOf('isDead') < 0 && body.indexOf('canPetBattle') < 0 &&
    (body.match(/'mature'/g) || []).length === 1;
})());
assert('旧口径按只数取档的 petResonancePct 已下线（不再调用 resonanceBonus）',
  psCode.indexOf('function petResonancePct') < 0 && psCode.indexOf('resonanceBonus(') < 0);
assert('旧口径的三个函数仍不在（benchBonusSum / teamCohesionBonus / benchPetList）',
  ps.indexOf('function benchBonusSum') < 0 && ps.indexOf('function teamCohesionBonus') < 0 &&
  ps.indexOf('function benchPetList') < 0);
assert('凝聚档位常量 = 3、共鸣档位表 = UR10/SSR8/SR7/R6（唯一来源）',
  /var TEAM_COHESION_PCT = 3;/.test(psCode) &&
  /var PET_RESONANCE_SCALE = \{ UR: 10, SSR: 8, SR: 7, R: 6 \};/.test(psCode));
assert('UI 不重写口径（不引 PET_GROUP_SCALE / 不定义 petStatBreakdown / 不调 applyBattlePetBaseBonuses）',
  ui.indexOf('PET_GROUP_SCALE') < 0 && ui.indexOf('function petStatBreakdown') < 0 &&
  ui.indexOf('applyBattlePetBaseBonuses') < 0);
assert('UI 的 ② 与明细都走 pet-store 的出口（petBonusLines / petPctTxt / petValueTxt / petBonusRow）',
  ui.indexOf('petBonusLines(') >= 0 && ui.indexOf('petPctTxt(') >= 0 &&
  ui.indexOf('petValueTxt(') >= 0 && ui.indexOf('petBonusRow(') >= 0);
assert('速度语义常量仍是「不含 spd」的那五个',
  ps.indexOf("var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef']") >= 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

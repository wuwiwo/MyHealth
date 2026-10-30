#!/usr/bin/env node
/* v2.15 新增套件：宠物加成**加算层**（作者裁决「改成按所有宠物计算，加成之间用加算」）

   被钉死的口径（唯一真相）：
       基础        = 图鉴基础 ＋ 炼化 ＋ 天赋静态            （createPetUnit，未改）
       加成合计%   = 稀有度% ＋ Σ宝珠% ＋ 凝聚% ＋ 共鸣%      （四项【加算】，同一层）
         凝聚贡献值 = (全部宠物该属性基础之和) × 10%
         共鸣贡献值 = (全部宠物该属性基础之和) × resonanceBonus(持有总数)   ← 3/5/7/10% 取档
         凝聚%      = 凝聚贡献值 ÷ 本宠该属性基础 × 100
         共鸣%      = 共鸣贡献值 ÷ 本宠该属性基础 × 100
       最终        = floor(基础 × 加成合计% / 100)
       速度        = 不参与百分比池（×100%）

   本套 7 组断言：
     [1] 纯函数逐属性恒等式：final = floor(基础 × (稀有度＋宝珠＋凝聚＋共鸣) ÷ 100)
     [2] **同一存档下每只宠的凝聚/共鸣贡献值完全相同**（旧口径下人人不同）
     [3] 面板链（petStatBreakdown）与实战链（buildGroupBattlePets）给出**同一组 final**
     [4] 池的唯一出口 boostPetForGroup：只有它做「四项相加 + 取整」
     [5] 纯函数：不写入参 / 连续 N 次不变 / 除零与脏存档安全
     [6] 「全部宠物」的取数口径：含蛋期 / 受伤 / 阵亡 / 本宠 / 参战，一个都不筛
     [7] 源码级守卫：池唯一出口 / 单一公式实现 / applyBattlePetBaseBonuses 不写 base

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
  mkPet(sb, 'sparkle', { injured: true, injuryHeal: 40 }),                                                         // 受伤
  mkPet(sb, 'nonebear', { isDead: true, health: 0 }),                                                              // 阵亡
  Object.assign(mkPet(sb, 'kirin'), { stage: 'egg', hatchProgress: 30 }),                                          // 蛋期
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

/* ============================================================
   [1] 纯函数逐属性恒等式
   ============================================================ */
console.log('\n[1] final = floor(基础 × (稀有度＋Σ宝珠＋凝聚%＋共鸣%) ÷ 100) 逐属性成立');
const allSum = sb.petAllPetsBaseSum();
const view = sb.petBaseBonusView();
assert('petAllPetsBaseSum 是逐属性的合计（全部 12 只）',
  BONUS_KEYS.every(k => allSum[k] > 0) && view.allCount === 12);
petsA.forEach(function (pet) {
  const u = sb.createPetUnit(pet);
  const rar = sb.petUnitRarityPct(u);
  const pool = sb.petBonusAdditivePool(allSum, u.base, rar, u._orbPct, view.resonancePct);
  const bad = BONUS_KEYS.filter(function (k) {
    const total = rar + (u._orbPct[k] || 0) + pool.cohesionPct[k] + pool.resonancePct[k];
    return pool.totalPct[k] !== total || pool.final[k] !== Math.max(1, Math.floor(u.base[k] * total / 100));
  });
  assert(pet.speciesId + '（' + pet.rarity + '）5 个参与属性全部满足恒等式', bad.length === 0,
    bad.map(k => k + ':' + pool.final[k]).join(','));
  assert(pet.speciesId + '·速度不参与（加成合计 = 100、final = 基础）',
    pool.totalPct.spd === 100 && pool.final.spd === u.base.spd && pool.cohesionPct.spd === 0 &&
    pool.resonancePct.spd === 0);
});
/* 恒等式的**等价绝对形式**：final ≈ 基础×稀有度/100 + Σ宝珠 + 凝聚贡献值 + 共鸣贡献值
   （floor 之前等值；用它证明「凝聚/共鸣不再被池放大」） */
(() => {
  const u = sb.createPetUnit(petsA[0]);
  const pool = sb.petBonusAdditivePool(allSum, u.base, 1600, u._orbPct, view.resonancePct);
  const k = 'hp';
  const exact = u.base[k] * pool.totalPct[k] / 100;
  const byParts = u.base[k] * 1600 / 100 + pool.cohesionValue[k] + pool.resonanceValue[k];
  assert('绝对值形式与百分比形式同值（凝聚/共鸣按面值进入，不被池放大）',
    Math.abs(exact - byParts) < 1e-6, exact + ' vs ' + byParts);
})();

/* ============================================================
   [2] 同一存档下每只宠的凝聚/共鸣**贡献值完全相同**
   ============================================================ */
console.log('\n[2] 每只宠的凝聚贡献值 / 共鸣贡献值完全相同（旧口径下人人不同）');
const contribs = petsA.map(function (pet) {
  const u = sb.createPetUnit(pet);
  return sb.petBonusAdditivePool(allSum, u.base, sb.petUnitRarityPct(u), u._orbPct, view.resonancePct);
});
BONUS_KEYS.forEach(function (k) {
  const cohSet = new Set(contribs.map(p => p.cohesionValue[k]));
  const resSet = new Set(contribs.map(p => p.resonanceValue[k]));
  assert('[' + k + '] 12 只宠的凝聚贡献值只有 1 个值（' + [...cohSet][0] + '）', cohSet.size === 1,
    [...cohSet].join(','));
  assert('[' + k + '] 12 只宠的共鸣贡献值只有 1 个值（' + [...resSet][0] + '）', resSet.size === 1,
    [...resSet].join(','));
  assert('[' + k + '] 契约值 = 全部宠物之和 × 10% / × ' + view.resonancePct + '%',
    contribs[0].cohesionValue[k] === allSum[k] * 10 / 100 &&
    contribs[0].resonanceValue[k] === allSum[k] * view.resonancePct / 100);
});
assert('百分比却各不相同（÷ 各自基础）—— 基础小的宠百分比更大',
  new Set(contribs.map(p => p.cohesionPct.hp)).size > 1 &&
  contribs[1].cohesionPct.hp > contribs[0].cohesionPct.hp,   // possum(200) 的基础 < dream(1020)
  contribs[0].cohesionPct.hp + '% vs ' + contribs[1].cohesionPct.hp + '%');

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
})();

/* ============================================================
   [4] 池的唯一出口 boostPetForGroup
   ============================================================ */
console.log('\n[4] 池的唯一出口：boostPetForGroup 做「四项相加 + 取整」');
(() => {
  const u = sb.createPetUnit(petsA[2]);
  const raw = Object.assign({}, u.base);
  sb.applyBattlePetBaseBonuses([u]);              // 只挂 _benchPct
  assert('applyBattlePetBaseBonuses 不改 base（旧口径会在这里加绝对值）',
    JSON.stringify(u.base) === JSON.stringify(raw));
  const pct = sb.petBenchPctOf(u);
  assert('挂载点存在且逐属性有凝聚% / 共鸣%',
    !!pct && BONUS_KEYS.every(k => pct.cohesion[k] > 0 || raw[k] === 0), JSON.stringify(pct.cohesion));
  sb.boostPetForGroup(u);
  const bad = BONUS_KEYS.filter(function (k) {
    const want = Math.max(1, Math.floor(raw[k] * (sb.petUnitRarityPct(u) + (u._orbPct[k] || 0)
      + pct.cohesion[k] + pct.resonance[k]) / 100));
    return u.base[k] !== want;
  });
  assert('boostPetForGroup 逐属性 = floor(基础 × 四项之和 ÷ 100)', bad.length === 0, bad.join(','));
  assert('boostPetForGroup 之后 hp 与 base.hp 同步', u.hp === u.base.hp);
})();
/* 没有挂载点时（老调用点 / 单测直接造单位）行为与旧版一致：池 = 稀有度 ＋ Σ宝珠 */
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

/* ============================================================
   [5] 纯函数契约：不写入参 / 连续 N 次不变 / 除零安全
   ============================================================ */
console.log('\n[5] 纯函数契约（不写入参 / 幂等 / 除零与脏存档）');
(() => {
  const s = JSON.stringify({ a: allSum, b: sb.createPetUnit(petsA[0]).base });
  const u = sb.createPetUnit(petsA[0]);
  const snap = JSON.stringify(u);
  const r1 = sb.petBonusAdditivePool(allSum, u.base, 1600, u._orbPct, 10);
  assert('不修改入参（allBaseSum / selfBase / 单位本体 JSON 一字不变）',
    JSON.stringify({ a: allSum, b: u.base }) === s && JSON.stringify(u) === snap);
  const series = [];
  for (let i = 0; i < 50; i++) series.push(JSON.stringify(sb.petBonusAdditivePool(allSum, u.base, 1600, u._orbPct, 10)));
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
  const r = sb.petBonusAdditivePool(allSum, zero, 1600, {}, 10);
  assert('基础全 0 → 不产生 NaN / Infinity（除法被跳过）',
    !/NaN|Infinity/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 100));
  assert('基础全 0 → 凝聚%/共鸣% 记 0、速度 final = 0',
    r.cohesionPct.hp === 0 && r.resonancePct.hp === 0 && r.final.spd === 0);
  assert('空存档（0 只宠）→ 合计全 0、贡献值 0、不报错', (function () {
    const sbEmpty = makeSandbox(7);
    seedStore(sbEmpty, []);
    const v = sbEmpty.petBaseBonusView();
    const rr = sbEmpty.petBonusAdditivePool(v.allBaseSum, { hp: 100, atk: 10, def: 5, spd: 3, soulAtk: 4, soulDef: 2 },
      sbEmpty.PET_GROUP_SCALE.SSR, {}, v.resonancePct);
    return v.allCount === 0 && rr.cohesionValue.hp === 0 && rr.final.hp === 1500 &&
      !/NaN|Infinity/.test(JSON.stringify(rr));
  })());
})();

/* ============================================================
   [6] 「全部宠物」的取数口径
   ============================================================ */
console.log('\n[6] 「全部宠物」= 存档里的所有宠物（一个都不筛）');
(() => {
  const base = sb.petAllPetsBaseSum();
  const mutate = (fn) => { const pets = sb.getPetStore().pets; const save = pets.map(p => JSON.stringify(p)); fn(pets);
    const after = sb.petAllPetsBaseSum(); pets.forEach((p, i) => { const o = JSON.parse(save[i]); for (const k in o) p[k] = o[k]; });
    return after; };
  const injured = mutate(ps => { ps.forEach(p => { p.injured = true; }); });
  assert('全部受伤 → 合计不变（受伤只影响能不能上场）', JSON.stringify(injured) === JSON.stringify(base));
  const dead = mutate(ps => { ps.forEach(p => { p.isDead = true; }); });
  assert('全部阵亡 → 合计不变', JSON.stringify(dead) === JSON.stringify(base));
  const eggs = mutate(ps => { ps.forEach(p => { p.stage = 'egg'; }); });
  assert('全部蛋期 → 合计不变（阶段不影响基础值口径）', JSON.stringify(eggs) === JSON.stringify(base));
  const grow = mutate(ps => { ps.forEach(p => { p.stage = 'grow'; }); });
  assert('全部成长期 → 合计不变', JSON.stringify(grow) === JSON.stringify(base));
})();
(() => {
  /* 本宠也在合计里：去掉本宠后，合计严格变小 */
  const full = sb.petAllPetsBaseSum();
  const withoutSelf = petsA.slice(1).reduce(function (s, p) {
    const u = sb.createPetUnit(p);
    BONUS_KEYS.forEach(k => { s[k] = (s[k] || 0) + (u.base[k] || 0); });
    return s;
  }, {});
  assert('本宠自己也在「全部宠物」里（合计 > 去掉本宠的合计）',
    BONUS_KEYS.every(k => full[k] > withoutSelf[k]), JSON.stringify(full) + ' vs ' + JSON.stringify(withoutSelf));
})();
(() => {
  /* 参战宠也在合计里：参战 4 只不会从「全部」里被剔掉 */
  const full = sb.petAllPetsBaseSum();
  const bd = sb.petStatBreakdown(petsA[0]);
  const cnt = sb.getPetStore().pets.length;
  assert('参战宠不被剔除（allCount = 存档只数 ' + cnt + '）', bd.allCount === cnt, String(bd.allCount));
  assert('合计 = 逐只 createPetUnit 的 base 之和（独立重算）',
    BONUS_KEYS.concat(['spd']).every(function (k) {
      const s = sb.getPetStore().pets.reduce((acc, p) => acc + (sb.createPetUnit(p).base[k] || 0), 0);
      return full[k] === s;
    }));
})();
(() => {
  /* 共鸣档位随持有总数变化（3/5/7/10%），阈值由 pets.js 唯一决定 */
  const sb2 = makeSandbox(11);
  const tiers = [];
  [1, 2, 4, 7, 11].forEach(function (n) {
    seedStore(sb2, petsA.slice(0, n).map(p => JSON.parse(JSON.stringify(p))));
    tiers.push(sb2.petBaseBonusView().resonancePct);
  });
  assert('共鸣档位 1/2/4/7/11 只 → 0/3/5/7/10%', JSON.stringify(tiers) === JSON.stringify([0, 3, 5, 7, 10]),
    JSON.stringify(tiers));
})();

/* ============================================================
   [7] 源码级守卫
   ============================================================ */
console.log('\n[7] 源码守卫（唯一出口 / 单一实现 / 不写 base）');
const ps = src('pet-store.js');
const gl = src('group-levels.js');
const ui = src('pet-ui.js');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const psCode = stripComments(ps);
const glCode = stripComments(gl);
assert('唯一公式实现 petBonusAdditivePool 在 pet-store.js', psCode.indexOf('function petBonusAdditivePool') >= 0);
assert('池的唯一出口 boostPetForGroup 在 group-levels.js', glCode.indexOf('function boostPetForGroup') >= 0);
assert('其他地方没有第二个「四项相加」的池（boostPetForGroup 是唯一出处）',
  (psCode.match(/rarityPct\s*\+\s*\(orbMap/g) || []).length === 0 &&
  (glCode.match(/rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ \(cohMap\[s\] \|\| 0\) \+ \(resMap\[s\] \|\| 0\)/g) || []).length === 1);
assert('凝聚/共鸣的百分比只在 petAttachBenchPct 里挂（唯一写入口）',
  (psCode.match(/petSetBenchPct\(/g) || []).length >= 1 &&
  /function petAttachBenchPct/.test(psCode));
assert('boostPetForGroup 只读 _benchPct（通过 petBenchPctOf），不自己算百分比',
  /petBenchPctOf\(unit\)/.test(glCode) && glCode.indexOf('TEAM_COHESION_PCT') < 0 &&
  glCode.indexOf('resonanceBonus') < 0);
assert('applyBattlePetBaseBonuses 不写 base / hp',
  !/\.(base|hp)\s*(\[[^\]]*\])?\s*=[^=]/.test((function () {
    const i = psCode.indexOf('function applyBattlePetBaseBonuses');
    let d = 0, j = psCode.indexOf('{', i), k = j;
    for (; k < psCode.length; k++) { if (psCode[k] === '{') d++; else if (psCode[k] === '}') { d--; if (d === 0) break; } }
    return psCode.slice(j, k + 1);
  })()));
assert('「全部宠物」的唯一取数口是 petAllPetsBaseSum（不做 canPetBattle 筛选）', (function () {
  const i = psCode.indexOf('function petAllPetsBaseSum');
  let d = 0, j = psCode.indexOf('{', i), k = j;
  for (; k < psCode.length; k++) { if (psCode[k] === '{') d++; else if (psCode[k] === '}') { d--; if (d === 0) break; } }
  const body = psCode.slice(j, k + 1);
  return body.indexOf('canPetBattle') < 0 && body.indexOf('.filter(') < 0 &&
         body.indexOf('stage') < 0 && body.indexOf('injured') < 0 && body.indexOf('isDead') < 0;
})());
assert('旧口径的三个函数已下线（benchBonusSum / teamCohesionBonus / benchPetList）',
  ps.indexOf('function benchBonusSum') < 0 && ps.indexOf('function teamCohesionBonus') < 0 &&
  ps.indexOf('function benchPetList') < 0);
assert('UI 不重写口径（不引 PET_GROUP_SCALE / 不定义 petStatBreakdown / 不调 applyBattlePetBaseBonuses）',
  ui.indexOf('PET_GROUP_SCALE') < 0 && ui.indexOf('function petStatBreakdown') < 0 &&
  ui.indexOf('applyBattlePetBaseBonuses') < 0);
assert('UI 的 ② 与明细都走 pet-store 的出口（petBonusLines / petPctTxt / petBonusRow）',
  ui.indexOf('petBonusLines(') >= 0 && ui.indexOf('petPctTxt(') >= 0 && ui.indexOf('petBonusRow(') >= 0);
assert('速度语义常量仍是「不含 spd」的那五个',
  ps.indexOf("var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef']") >= 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

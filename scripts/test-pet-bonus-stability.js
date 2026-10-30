#!/usr/bin/env node
/* v2.14.2 回归：宠物「凝聚 + 共鸣」加成**稳定性**（修真实 bug「加成一直增加」）
   —— v2.15 按新口径（作者裁决「按所有宠物计算、加成之间用加算」）等价改写。

   背景（v2.14.2 修的真实 bug，真实 Chrome + 沙箱都复现）：
     · `petStatBreakdown(pet)` 里有一行 `u.base[k] = (u.base[k]||0) + coh[k] + res[k]`，
       紧接着 `boostPetForGroup(u)` 又把 `u.base` **就地**乘掉 —— 只要传进来的不是
       一次性克隆（缓存单位 / 存档 / 同一对象多次渲染），每渲染一次就多叠一层。
     · `applyBattlePetBaseBonuses(units)` 里是 `u.base[k] = (u.base[k]||0) + add`
       —— 同一批 units 连续调用：修前 hp 317 → 434 → 551 …（每次 +117，永不收敛）。

   v2.15 起「加成不再进 base」所以这类累加从根上不可能发生；本节仍逐条钉住：
     1) `petStatBreakdown` 连续 10 次**数值完全不变**，且**不修改入参**（pet / 存档）
     2) `petBaseBonusView`（纯计算核心）连续 10 次不变，且 `JSON.stringify(units)` 一字不改
     3) `applyBattlePetBaseBonuses` 连续 10 次：**base / hp 一个字节都不变**，挂上去的
        百分比也逐字节相同（新口径下它只挂 `_benchPct`，不再写 base）
     4) 数值口径：`final = floor(基础 × (稀有度＋Σ宝珠＋凝聚%＋共鸣%) ÷ 100)`，
        且 `buildGroupBattlePets`（实战）与 `petStatBreakdown`（面板）给出**同一组 final**
   另加源码级守卫：`pet-store.js` 里不得再出现 `u.base[k] = … + …` 这种就地累加，
   且纯函数都写明「不得修改入参」。

   Run: node scripts/test-pet-bonus-stability.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 与 test-pet-compare.js / test-pet-heal-display.js 同一套沙箱与加载顺序（口径同源） */
function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
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
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(load(f), sb));
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

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
const BONUS_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];

const sb = makeSandbox(20261028);

/* ============================================================
   fixture：6 只成熟宠（1 只受伤 + 1 只阵亡 → 都不进后备），
            被拆解的那只带炼化 + 1 颗宝珠（覆盖 _orbPct 分支）
   ============================================================ */
const subj = mkPet(sb, 'icecrystal');
subj.refineLevel = 3;
subj.refineStats = { atk: 12, hp: 50 };
subj.orbs = { atk: { id: 'orb-stab-1', type: 'atk', rarity: 'R', level: 1 } };
const mate = mkPet(sb, 'dream');
const mate2 = mkPet(sb, 'chirpbird');
const mate3 = mkPet(sb, 'waterdrop');
const hurt = mkPet(sb, 'sparkle'); sb.injurePet(hurt);
const dead = mkPet(sb, 'nonebear', { isDead: true });
sb.store.set('pets', {
  version: 1, pets: [subj, mate, mate2, mate3, hurt, dead], materials: emptyBag(),
  orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null
});
console.log('\n[0] fixture');
assert('6 只宠（4 只可贡献后备 + 1 受伤 + 1 阵亡）', sb.getPetStore().pets.length === 6);
assert('被拆解宠物带宝珠（覆盖 _orbPct 分支）', !!subj.orbs.atk && sb.petOrbPct(subj.orbs).atk > 0);

/* ============================================================
   1) petStatBreakdown：连续 10 次数值完全不变 + 不修改入参
   ============================================================ */
console.log('\n[1] petStatBreakdown ×10（面板详情走的正是这条路径）');
const petSnap = JSON.stringify(subj);
const storeSnap = JSON.stringify(sb.getPetStore());
const runs = [];
for (let i = 0; i < 10; i++) runs.push(sb.petStatBreakdown(subj));
const sig = bd => JSON.stringify({
  base: bd.base, cohesion: bd.cohesion, resonance: bd.resonance,
  cohesionPct: bd.cohesionPct, resonancePct: bd.resonancePct, totalPct: bd.totalPct,
  bench: bd.bench, final: bd.final, pureFinal: bd.pureFinal, poolPct: bd.poolPct,
  allCount: bd.allCount, resonanceRate: bd.resonanceRate, rarityPct: bd.rarityPct, boosted: bd.boosted
});
const first = sig(runs[0]);
const changedAt = runs.findIndex(r => sig(r) !== first);
assert('拆解可用', runs[0].ok === true);
assert('10 次调用结果**逐字节一致**（不会越刷越大）', changedAt === -1,
  changedAt >= 0 ? ('第 ' + (changedAt + 1) + ' 次就开始变了:\n  ' + first + '\n  ' + sig(runs[changedAt])) : '');
assert('不修改入参宠物本体（JSON.stringify 相同）', JSON.stringify(subj) === petSnap);
assert('不写存档（JSON 相同）', JSON.stringify(sb.getPetStore()) === storeSnap);
assert('① 基础仍是 createPetUnit 的原值（加成不再进 base）',
  STAT_KEYS.every(k => runs[0].base[k] === (sb.createPetUnit(subj).base[k] || 0)));

/* 数值口径：final = floor(基础 × (稀有度＋Σ宝珠＋凝聚%＋共鸣%) ÷ 100)，速度不参与 */
assert('凝聚贡献值 = 全部宠物该属性基础之和 ×10%（每只宠相同）',
  BONUS_KEYS.every(k => Math.abs(runs[0].cohesion[k] - sb.petBaseBonusView().allBaseSum[k] * 0.1) < 1e-9),
  JSON.stringify(runs[0].cohesion));
assert('凝聚 + 共鸣 > 0（fixture 有宠物，断言不会因为全 0 而变得无意义）',
  BONUS_KEYS.some(k => (runs[0].cohesion[k] || 0) + (runs[0].resonance[k] || 0) > 0));
assert('百分比 = 贡献值 ÷ 本宠基础 × 100',
  BONUS_KEYS.every(k => Math.abs(runs[0].cohesionPct[k] - runs[0].cohesion[k] * 100 / runs[0].base[k]) < 1e-9 &&
    Math.abs(runs[0].resonancePct[k] - runs[0].resonance[k] * 100 / runs[0].base[k]) < 1e-9));
assert('加成合计 = 稀有度 ＋ Σ宝珠 ＋ 凝聚% ＋ 共鸣%（四项相加）',
  BONUS_KEYS.every(k => Math.abs(runs[0].totalPct[k] -
    (runs[0].rarityPct + (runs[0].orbPct[k] || 0) + runs[0].cohesionPct[k] + runs[0].resonancePct[k])) < 1e-9));
assert('最终值 = max(1, floor(基础 × 加成合计% ÷ 100))（数值口径唯一）',
  BONUS_KEYS.every(k => runs[0].final[k] === Math.max(1, Math.floor(runs[0].base[k] * runs[0].totalPct[k] / 100))),
  BONUS_KEYS.map(k => k + ':' + runs[0].final[k]).join(' '));
assert('纯函数与池出口给出的 final 逐属性相同（pureFinal === final）',
  STAT_KEYS.every(k => runs[0].pureFinal[k] === runs[0].final[k]),
  JSON.stringify(runs[0].pureFinal) + ' vs ' + JSON.stringify(runs[0].final));
assert('速度不进池（加成合计 = 100、最终 = 基础）',
  runs[0].totalPct.spd === 100 && runs[0].final.spd === runs[0].base.spd);

/* 换一只宠再拆一次，前一次的读数不得被影响（交叉污染守卫） */
const bdOther = sb.petStatBreakdown(mate);
assert('拆别的宠物不会污染上一次的结果', sig(sb.petStatBreakdown(subj)) === first);
assert('另一只宠的读数同样自洽', bdOther.ok === true && bdOther.final.hp >= bdOther.base.hp);

/* ============================================================
   2) petBaseBonusView：纯计算核心，连续 10 次不变 + 零写入
   ============================================================ */
console.log('\n[2] petBaseBonusView ×10（纯计算核心）');
assert('petBaseBonusView 已导出', typeof sb.petBaseBonusView === 'function');
const units = sb.createPetUnitsForBattle([subj.speciesId, mate.speciesId], sb.PET_BATTLE_MAX);
assert('建出 2 个参战单位', units.length === 2);
const unitsSnap = JSON.stringify(units);
const viewSigs = [];
for (let i = 0; i < 10; i++) viewSigs.push(JSON.stringify(sb.petBaseBonusView(units)));
assert('10 次结果逐字一致', viewSigs.every(s => s === viewSigs[0]));
assert('**不修改入参**：units 的 JSON.stringify 一字未变', JSON.stringify(units) === unitsSnap);
const view = sb.petBaseBonusView(units);
assert('返回结构含 allBaseSum / cohesion / resonance / total / allCount',
  !!view.allBaseSum && !!view.cohesion && !!view.resonance && !!view.total && typeof view.allCount === 'number');
assert('total = cohesion + resonance（每属性）',
  BONUS_KEYS.every(k => view.total[k] === view.cohesion[k] + view.resonance[k]));
assert('「全部宠物」= 存档 6 只（含受伤 1 / 阵亡 1；不排除本宠与参战）', view.allCount === 6, String(view.allCount));

/* ============================================================
   3) applyBattlePetBaseBonuses：连续 10 次 **base 保持不变**
      （新口径下它只挂逐属性的「凝聚% / 共鸣%」，一个字节都不写 base / hp；
        旧口径「首次写回 base」的契约随裁决作废，见报告）
   ============================================================ */
console.log('\n[3] applyBattlePetBaseBonuses ×10（同一批 units）');
const uArr = sb.createPetUnitsForBattle([subj.speciesId, mate.speciesId], sb.PET_BATTLE_MAX);
const rawBases = uArr.map(u => JSON.stringify(u.base));
const unitsKeysBefore = uArr.map(u => Object.keys(u).slice().sort().join(','));
sb.applyBattlePetBaseBonuses(uArr);
const afterFirst = JSON.stringify(uArr);
assert('首次调用**不改 base**（新口径：凝聚/共鸣是百分比，不是绝对值）',
  uArr.every((u, i) => JSON.stringify(u.base) === rawBases[i]), JSON.stringify(uArr[0].base));
assert('首次调用**不改 hp**', uArr.every(u => u.hp === u.base.hp));
assert('不在单位上新增可枚举字段（_benchPct 走 WeakMap / 非枚举）',
  uArr.every((u, i) => Object.keys(u).slice().sort().join(',') === unitsKeysBefore[i]));
assert('挂上了逐属性的凝聚% / 共鸣%（都 > 0）',
  uArr.every(u => {
    const bp = sb.petBenchPctOf(u);
    return !!bp && bp.cohesion.atk > 0 && bp.resonance.atk > 0;
  }));

let grewAt = -1;
for (let i = 1; i < 10; i++) {
  sb.applyBattlePetBaseBonuses(uArr);
  if (JSON.stringify(uArr) !== afterFirst) { grewAt = i + 1; break; }
}
assert('第 2..10 次调用**逐字节完全不变**（不再累加）', grewAt === -1,
  grewAt >= 0 ? ('第 ' + grewAt + ' 次变了：' + afterFirst + ' → ' + JSON.stringify(uArr)) : '');
assert('重复调用不改 hp', uArr.every(u => u.hp === u.base.hp));

/* 两次调用之间若有**合法**的 base 改动（如 WP-G 等级增益），不得被重算抹掉 */
(function () {
  const ids = [subj.speciesId];
  const arr2 = sb.createPetUnitsForBattle(ids, sb.PET_BATTLE_MAX);
  sb.applyBattlePetBaseBonuses(arr2);
  const u2 = arr2[0];
  const beforeBase = JSON.stringify(u2.base);
  const lvl = { hp: 40, atk: 6, def: 3, soulAtk: 2, soulDef: 1 };
  BONUS_KEYS.forEach(k => { u2.base[k] = u2.base[k] + lvl[k]; });   // 模拟 applyLevelStatBonus
  const afterLvl = JSON.stringify(u2.base);
  sb.applyBattlePetBaseBonuses(arr2);                               // 再调一次：只覆盖百分比
  assert('重复调用不会抹掉两次之间别人加的合法基础值（也不再加任何绝对值）',
    JSON.stringify(u2.base) === afterLvl && afterLvl !== beforeBase);
})();

/* buildGroupBattlePets（唯一入口）连开 3 次必须一致 —— 真实战斗建场不涨 */
console.log('\n[3b] buildGroupBattlePets ×3（真实建场管道）');
const built = [];
for (let i = 0; i < 3; i++) built.push(JSON.stringify(sb.buildGroupBattlePets([subj.speciesId, mate.speciesId], sb.PET_BATTLE_MAX).map(u => u.base)));
assert('连开 3 次数值逐字一致', built.every(s => s === built[0]));
/* 面板 = 实战：同一次「谁上场」下，建场最终值逐属性等于面板 bd.final（两条链同一组数） */
const bdSubj = sb.petStatBreakdown(subj);
const grown = sb.buildGroupBattlePets([subj.speciesId], sb.PET_BATTLE_MAX);
assert('建场（只带本宠）与面板 final 逐属性相同',
  STAT_KEYS.every(k => grown[0].base[k] === bdSubj.final[k]),
  JSON.stringify(grown[0].base) + ' vs ' + JSON.stringify(bdSubj.final));

/* ============================================================
   4) 源码级守卫（防回退）
   ============================================================ */
console.log('\n[4] 源码守卫');
const ps = src('pet-store.js');
const ui = src('pet-ui.js');
/* 守卫要看**代码**而不是注释（注释里刻意保留了「修前长什么样」的说明） */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const psCode = stripComments(ps);
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
const bdBody = fnBody(psCode, 'petStatBreakdown');
const apBody = fnBody(psCode, 'applyBattlePetBaseBonuses');
assert('pet-store.js 代码里不再有「base += 加成」这种就地累加',
  !/\bu\.base\[[^\]]*\]\s*\+=/.test(psCode));
assert('petStatBreakdown 函数体里**一行都不写**入参 u 的 base/hp（零写入）',
  bdBody.length > 0 && !/\bu\.(base|hp)\s*(\[[^\]]*\])?\s*=[^=]/.test(bdBody), bdBody.slice(0, 60));
assert('两个函数都写明「不得修改入参」', (ps.match(/不得修改入参/g) || []).length >= 2);
assert('petStatBreakdown 把 boostPetForGroup 作用在局部副本上（不是 boostPetForGroup(u)）',
  bdBody.indexOf('boostPetForGroup(u)') < 0 && /boostPetForGroup\(pb\)/.test(bdBody));
assert('applyBattlePetBaseBonuses 函数体里没有任何 base / hp 赋值（新口径：只挂百分比）',
  apBody.length > 0 && !/\.(base|hp)\s*(\[[^\]]*\])?\s*=[^=]/.test(apBody), apBody.slice(0, 80));
assert('applyBattlePetBaseBonuses 不出现 `+=` / `-=` 这类就地运算',
  apBody.length > 0 && !/\+=|-=/.test(apBody));
assert('纯计算核心 petBaseBonusView 定义在 pet-store.js', psCode.indexOf('function petBaseBonusView') >= 0);
assert('纯函数 petBonusAdditivePool 定义在 pet-store.js（唯一公式实现）',
  psCode.indexOf('function petBonusAdditivePool') >= 0);
assert('petBaseBonusView 函数体里不写任何单位字段（不碰 .base / .hp）',
  !/\.(base|hp)\s*(\[[^\]]*\]\s*)?=[^=]/.test(fnBody(psCode, 'petBaseBonusView')));
assert('petBonusAdditivePool 函数体里不写任何 .base / .hp（不修改入参）',
  !/\.(base|hp)\s*(\[[^\]]*\]\s*)?=[^=]/.test(fnBody(psCode, 'petBonusAdditivePool')));
assert('applyBattlePetBaseBonuses 走 petBaseBonusView（单一来源）',
  /var view = petBaseBonusView\(\)/.test(apBody));
assert('applyBattlePetBaseBonuses 只通过 petAttachBenchPct 挂百分比（唯一写入口）',
  /petAttachBenchPct\(u, view\)/.test(apBody));
assert('boostPetForGroup 的池是四项相加（稀有度 ＋ Σ宝珠 ＋ 凝聚 ＋ 共鸣）',
  /var poolPct = rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ \(cohMap\[s\] \|\| 0\) \+ \(resMap\[s\] \|\| 0\)/.test(src('group-levels.js')));
assert('buildGroupBattlePets 仍在 boostPetForGroup 之前调基础值/百分比挂载（顺序契约未破）',
  psCode.indexOf('applyBattlePetBaseBonuses(units)') >= 0 &&
  psCode.indexOf('applyBattlePetBaseBonuses(units)') < psCode.indexOf('boostPetForGroup(u)'));
assert('pet-ui.js 仍只调 petStatBreakdown（不自算、不传单位）',
  ui.indexOf('petStatBreakdown') >= 0 && ui.indexOf('function petStatBreakdown') < 0 &&
  ui.indexOf('applyBattlePetBaseBonuses') < 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

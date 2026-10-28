#!/usr/bin/env node
/* v2.14.2 回归：宠物「团队凝聚 + 共鸣」加成**稳定性**（修真实 bug「加成一直增加」）

   背景（修前实测，真实 Chrome + 沙箱都复现）：
     · `petStatBreakdown(pet)` 里有一行 `u.base[k] = (u.base[k]||0) + coh[k] + res[k]`，
       紧接着 `boostPetForGroup(u)` 又把 `u.base` **就地**乘掉 —— 只要传进来的不是
       一次性克隆（缓存单位 / 存档 / 同一对象多次渲染），每渲染一次就多叠一层。
     · `applyBattlePetBaseBonuses(units)` 里是 `u.base[k] = (u.base[k]||0) + add`
       —— 同一批 units 连续调用：修前 hp 317 → 434 → 551 …（每次 +117，永不收敛）。

   本套钉四件事：
     1) `petStatBreakdown` 连续 10 次**数值完全不变**，且**不修改入参**（pet / 存档）
     2) `petBaseBonusView`（纯计算核心）连续 10 次不变，且 `JSON.stringify(units)` 一字不改
     3) `applyBattlePetBaseBonuses` 连续 10 次**数值完全不变**（不再累加），
        且第 2..10 次调用连 `JSON.stringify(units)` 都不变（首次写回是既有契约，见下）
     4) 数值口径没变（既不能涨也不能少）：一次调用 = 原始基础 + (凝聚 + 共鸣)，与
        `petStatBreakdown().baseWithBonus` **逐值一致**；`buildGroupBattlePets` 连开 3 次一致
   另加源码级守卫：`pet-store.js` 里不得再出现 `u.base[k] = (u.base[k] || 0) + …`，
   且两个函数都写明「不得修改入参」。

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
  base: bd.base, cohesion: bd.cohesion, resonance: bd.resonance, bench: bd.bench,
  baseWithBonus: bd.baseWithBonus, final: bd.final, poolPct: bd.poolPct,
  benchCount: bd.benchCount, resonanceRate: bd.resonanceRate, rarityPct: bd.rarityPct, boosted: bd.boosted
});
const first = sig(runs[0]);
const changedAt = runs.findIndex(r => sig(r) !== first);
assert('拆解可用', runs[0].ok === true);
assert('10 次调用结果**逐字节一致**（不会越刷越大）', changedAt === -1,
  changedAt >= 0 ? ('第 ' + (changedAt + 1) + ' 次就开始变了:\n  ' + first + '\n  ' + sig(runs[changedAt])) : '');
assert('不修改入参宠物本体（JSON.stringify 相同）', JSON.stringify(subj) === petSnap);
assert('不写存档（JSON 相同）', JSON.stringify(sb.getPetStore()) === storeSnap);
assert('显式返回带加成的基础值 out.baseWithBonus（且 = out.bench）',
  !!runs[0].baseWithBonus && STAT_KEYS.every(k => runs[0].baseWithBonus[k] === runs[0].bench[k]));

/* 数值口径：baseWithBonus = base + (凝聚 + 共鸣)，速度不参与 */
assert('带加成基础值 = 基础 + 凝聚 + 共鸣（速度不参与）',
  BONUS_KEYS.every(k => runs[0].baseWithBonus[k] === runs[0].base[k] + runs[0].cohesion[k] + runs[0].resonance[k]) &&
  runs[0].baseWithBonus.spd === runs[0].base.spd);
assert('凝聚 + 共鸣 > 0（fixture 有后备宠，断言不会因为全 0 而变得无意义）',
  BONUS_KEYS.some(k => (runs[0].cohesion[k] || 0) + (runs[0].resonance[k] || 0) > 0));
/* 最终值仍走百分比池（既没涨也没少）：floor(bench × pool / 100) */
assert('最终值仍 = floor(带加成基础值 × 池/100)（数值口径未变）',
  BONUS_KEYS.every(k => runs[0].final[k] === Math.floor(runs[0].baseWithBonus[k] * runs[0].poolPct[k] / 100)));
assert('速度不进池（最终 = 带加成基础值）', runs[0].poolPct.spd === 0 && runs[0].final.spd === runs[0].baseWithBonus.spd);

/* 换一只宠再拆一次，前一次的读数不得被影响（交叉污染守卫） */
const bdOther = sb.petStatBreakdown(mate);
assert('拆别的宠物不会污染上一次的结果', sig(sb.petStatBreakdown(subj)) === first);
assert('另一只宠的读数同样自洽（不同宠后备集合不同）', bdOther.ok === true && bdOther.baseWithBonus.hp >= bdOther.base.hp);

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
assert('返回结构含 cohesion / resonance / total / benchCount',
  !!view.cohesion && !!view.resonance && !!view.total && typeof view.benchCount === 'number');
assert('total = cohesion + resonance（每属性）',
  BONUS_KEYS.every(k => view.total[k] === view.cohesion[k] + view.resonance[k]));

/* ============================================================
   3) applyBattlePetBaseBonuses：连续 10 次数值完全不变
      （修前：同一批 units 每调一次就再叠一层 → hp 317/434/551…）
      ⚠️ 首次调用会写回 u.base —— 这是既有契约（buildGroupBattlePets 的管道 +
         test-pet-store.js / test-pet-heal-display.js 两套受保护断言都依赖它），
         本套因此断言的是「**不再累加**」：第 2..10 次连 JSON 都不许变。
   ============================================================ */
console.log('\n[3] applyBattlePetBaseBonuses ×10（同一批 units，修前每次 +一层）');
const uArr = sb.createPetUnitsForBattle([subj.speciesId, mate.speciesId], sb.PET_BATTLE_MAX);
const rawBases = uArr.map(u => JSON.stringify(u.base));
const unitsKeysBefore = uArr.map(u => Object.keys(u).slice().sort().join(','));
sb.applyBattlePetBaseBonuses(uArr);
const afterFirst = JSON.stringify(uArr);
const added = uArr.map((u, i) => {
  const before = JSON.parse(rawBases[i]);
  const o = {};
  BONUS_KEYS.forEach(k => { o[k] = (u.base[k] || 0) - (before[k] || 0); });
  return o;
});
assert('首次调用 = 原始基础 + (凝聚 + 共鸣)（口径没变、没少给）',
  uArr.every((u, i) => BONUS_KEYS.every(k => added[i][k] === view.total[k])), JSON.stringify(added));
assert('首次调用后 hp 与 base.hp 同步（既有契约）', uArr.every(u => u.hp === u.base.hp));
assert('不在单位上新增可枚举字段（不污染快照/日志）',
  uArr.every((u, i) => Object.keys(u).slice().sort().join(',') === unitsKeysBefore[i]));

let grewAt = -1;
for (let i = 1; i < 10; i++) {
  sb.applyBattlePetBaseBonuses(uArr);
  if (JSON.stringify(uArr) !== afterFirst) { grewAt = i + 1; break; }
}
assert('第 2..10 次调用**数值完全不变**（不再累加）', grewAt === -1,
  grewAt >= 0 ? ('第 ' + grewAt + ' 次又变大了：' + afterFirst + ' → ' + JSON.stringify(uArr)) : '');
assert('重复调用不改 hp（与 base.hp 保持一致）', uArr.every(u => u.hp === u.base.hp));

/* 反证：同样输入下「修前的算法」会翻倍 → 说明上面的断言是有判别力的 */
(function () {
  const raw = { hp: 100, atk: 10, def: 5, soulAtk: 4, soulDef: 2 };
  const add = view.total;
  const oldWay = {};
  BONUS_KEYS.forEach(k => { oldWay[k] = raw[k]; });
  for (let i = 0; i < 2; i++) BONUS_KEYS.forEach(k => { oldWay[k] = oldWay[k] + add[k]; });
  const newWay = {};
  BONUS_KEYS.forEach(k => { newWay[k] = raw[k] + add[k]; });
  assert('反证：旧算法（累加）在第二次调用后会明显变大，新算法不变',
    BONUS_KEYS.some(k => oldWay[k] > newWay[k]));
})();

/* 两次调用之间若有**合法**的 base 改动（如 WP-G 等级增益），不得被重算抹掉 */
(function () {
  const ids = [subj.speciesId];
  const rawFresh = JSON.parse(JSON.stringify(sb.createPetUnitsForBattle(ids, sb.PET_BATTLE_MAX)[0].base));
  const arr2 = sb.createPetUnitsForBattle(ids, sb.PET_BATTLE_MAX);
  sb.applyBattlePetBaseBonuses(arr2);
  const u2 = arr2[0];
  const lvl = { hp: 40, atk: 6, def: 3, soulAtk: 2, soulDef: 1 };
  BONUS_KEYS.forEach(k => { u2.base[k] = u2.base[k] + lvl[k]; });   // 模拟 applyLevelStatBonus
  const bv2 = sb.petBaseBonusView(arr2);                            // 本次（只带本宠）的加成
  sb.applyBattlePetBaseBonuses(arr2);                               // 再调一次：只换自己那层
  assert('重复调用会保住两次之间别人加的合法基础值（不抹掉等级增益）',
    BONUS_KEYS.every(k => u2.base[k] === rawFresh[k] + bv2.total[k] + lvl[k]),
    JSON.stringify(u2.base) + ' vs expect ' + JSON.stringify(BONUS_KEYS.map(k => rawFresh[k] + bv2.total[k] + lvl[k])));
})();

/* buildGroupBattlePets（唯一入口）连开 3 次必须一致 —— 真实战斗建场不涨 */
console.log('\n[3b] buildGroupBattlePets ×3（真实建场管道）');
const built = [];
for (let i = 0; i < 3; i++) built.push(JSON.stringify(sb.buildGroupBattlePets([subj.speciesId, mate.speciesId], sb.PET_BATTLE_MAX).map(u => u.base)));
assert('连开 3 次数值逐字一致', built.every(s => s === built[0]));
/* 与 petStatBreakdown 的口径一致：同一次「谁上场」下，建场基础值 = 面板的带加成基础值 */
const bdSubj = sb.petStatBreakdown(subj);
const grown = sb.buildGroupBattlePets([subj.speciesId], sb.PET_BATTLE_MAX);
const finalPool = k => grown[0].base[k];
assert('建场（只带本宠）与面板 baseWithBonus 同源（×池后一致）',
  BONUS_KEYS.every(k => finalPool(k) === bdSubj.final[k] || finalPool(k) === Math.max(1, Math.floor(bdSubj.baseWithBonus[k] * bdSubj.poolPct[k] / 100))));

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
assert('applyBattlePetBaseBonuses 函数体里没有 `+=` 写 base',
  apBody.length > 0 && !/\.base\[[^\]]*\]\s*\+=/.test(apBody));
assert('纯计算核心 petBaseBonusView 定义在 pet-store.js', psCode.indexOf('function petBaseBonusView') >= 0);
assert('petBaseBonusView 函数体里不写任何单位字段（不碰 .base / .hp）',
  !/\.(base|hp)\s*(\[[^\]]*\]\s*)?=[^=]/.test(fnBody(psCode, 'petBaseBonusView')));
assert('applyBattlePetBaseBonuses 走 petBaseBonusView（单一来源）',
  /var bonus = petBaseBonusView\(units\)/.test(apBody));
assert('applyBattlePetBaseBonuses 里是「减掉上次那层 + 加上本次这层」（不是累加）',
  /u\.base\[k\] = \(u\.base\[k\] \|\| 0\) - prevAdd \+ add/.test(apBody));
assert('buildGroupBattlePets 仍在 boostPetForGroup 之前调基础值加成（顺序契约未破）',
  psCode.indexOf('applyBattlePetBaseBonuses(units)') >= 0 &&
  psCode.indexOf('applyBattlePetBaseBonuses(units)') < psCode.indexOf('boostPetForGroup(u)'));
assert('pet-ui.js 仍只调 petStatBreakdown（不自算、不传单位）',
  ui.indexOf('petStatBreakdown') >= 0 && ui.indexOf('function petStatBreakdown') < 0 &&
  ui.indexOf('applyBattlePetBaseBonuses') < 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

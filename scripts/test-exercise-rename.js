#!/usr/bin/env node
/* 动作改名/合并迁移测试（v2.0.6 renameOrMergeExercise）
   场景:
   1) 纯改名 B→C：exercises id/name、strength entries、prs 键、plans 引用全迁移，dsId 保留
   2) 合并 B→A：entries 归并、PR 取最大值+日期取较大者、plans 引用、B 删除
   3) 合并 dsId：目标无关联 → 继承源的
   4) 合并 dsId：目标已有关联 → 保留目标的
   5) renameOrMergeExercise 同名/不存在 → ok:false
   6) 三视图 gameContent 显隐（switchGameTab 行为抽查）
   Run: node scripts/test-exercise-rename.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function makeSandbox(entries, prs, plans, exercises) {
  const sandbox = { JSON, console, Date };
  sandbox.Math = Object.create(Math);
  sandbox.window = sandbox;
  const elCache = {};
  sandbox.__els = elCache;
  const fakeEl = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild() {}, remove() {}, setAttribute() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', dataset: {}, getContext: () => ({}) });
  sandbox.document = {
    getElementById: id => { if (!elCache[id]) elCache[id] = fakeEl(); return elCache[id]; },
    createElement: fakeEl,
    body: fakeEl(),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } }
  };
  sandbox.toast = function() {};
  const ls = {};
  sandbox.localStorage = {
    getItem(k) { return k in ls ? ls[k] : null; },
    setItem(k, v) { ls[k] = String(v); },
    removeItem(k) { delete ls[k]; },
    key(i) { return Object.keys(ls)[i] || null; },
    get length() { return Object.keys(ls).length; }
  };
  sandbox.location = { search: '' };
  sandbox.addEventListener = () => {};
  sandbox.confirm = () => true;
  sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
  sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
  sandbox.requestAnimationFrame = () => 0;
  vm.createContext(sandbox);
  const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
  ['store.js', 'utils.js', 'app.js', 'game-views.js'].forEach(f => vm.runInContext(load(f), sandbox, { filename: f }));
  // 用真实 store 写入测试数据（走 S0 校验链）
  sandbox.store.set('strength', { entries: entries });
  sandbox.store.set('exercises', exercises);
  sandbox.store.set('prs', prs);
  sandbox.store.set('plans', { plans: plans });
  return sandbox;
}

function ex(id, extra) { return Object.assign({ id, name: id, type: 'strength', ratio: 100, description: '', eqWeight: null, unit: 'rep' }, extra || {}); }
function entry(date, exercise, weight, reps) { return { id: 'e' + Math.random().toString(36).slice(2, 8), date, exercise, weight, actualReps: reps }; }

/* 1. 纯改名 B→C */
let sb = makeSandbox(
  [entry('2026-09-01', 'B', 50, 10)],
  { B: { maxWeight: 60, weightDate: '2026-09-01', maxReps: 15, repsDate: '2026-09-01', maxVolume: 600, volDate: '2026-09-01' } },
  [{ id: 'p1', name: '计划', exercises: [{ exercise: 'B', weight: 50, targetReps: 12 }] }],
  [ex('B', { dsId: '0285' }), ex('其他')]
);
let r = sb.renameOrMergeExercise('B', 'C');
assert('1a 纯改名 ok 且非合并', r.ok === true && r.merged === false);
let exs = sb.getExercises();
assert('1b exercises 无 B 有 C，dsId 保留', !exs.some(e => e.id === 'B') && exs.some(e => e.id === 'C' && e.dsId === '0285'));
assert('1c 历史记录 B→C', sb.store.get('strength').entries.every(e => e.exercise === 'C'));
let prs = sb.store.get('prs');
assert('1d PR 键 B→C', prs['C'] && !prs['B'] && prs['C'].maxWeight === 60);
assert('1e 计划引用 B→C', sb.store.get('plans').plans[0].exercises[0].exercise === 'C');

/* 2. 合并 B→A：PR 取最大值 */
sb = makeSandbox(
  [entry('2026-09-01', 'B', 50, 10), entry('2026-08-20', 'A', 45, 8)],
  {
    A: { maxWeight: 50, weightDate: '2026-08-20', maxReps: 12, repsDate: '2026-08-20', maxVolume: 550, volDate: '2026-08-20' },
    B: { maxWeight: 60, weightDate: '2026-09-01', maxReps: 10, repsDate: '2026-09-01', maxVolume: 600, volDate: '2026-09-01' }
  },
  [{ id: 'p1', name: '计划', exercises: [{ exercise: 'B', weight: 50, targetReps: 12 }] }],
  [ex('A'), ex('B')]
);
r = sb.renameOrMergeExercise('B', 'A');
assert('2a 合并 ok', r.ok === true && r.merged === true);
exs = sb.getExercises();
assert('2b B 已删除，A 保留', !exs.some(e => e.id === 'B') && exs.some(e => e.id === 'A'));
assert('2c 历史 B→A 归并', sb.store.get('strength').entries.every(e => e.exercise === 'A'));
prs = sb.store.get('prs');
assert('2d PR maxWeight=60(取B大值)+日期取09-01', prs['A'].maxWeight === 60 && prs['A'].weightDate === '2026-09-01', JSON.stringify(prs['A']));
assert('2e PR maxReps=12(取A大值)', prs['A'].maxReps === 12 && prs['A'].repsDate === '2026-08-20');
assert('2f PR maxVolume=600(取B大值)', prs['A'].maxVolume === 600);
assert('2g 无 B 残留键', !prs['B']);
assert('2h 计划引用 B→A', sb.store.get('plans').plans[0].exercises[0].exercise === 'A');

/* 3. 合并 dsId：目标无关联 → 继承源的 */
sb = makeSandbox([entry('2026-09-01', 'B', 50, 5)], {}, [], [ex('A'), ex('B', { dsId: '0298' })]);
r = sb.renameOrMergeExercise('B', 'A');
assert('3 目标无 dsId → 继承源的 0298', r.merged && sb.getExercises().find(e => e.id === 'A').dsId === '0298');

/* 4. 合并 dsId：目标已有关联 → 保留目标的 */
sb = makeSandbox([entry('2026-09-01', 'B', 50, 5)], {}, [], [ex('A', { dsId: '0361' }), ex('B', { dsId: '0298' })]);
r = sb.renameOrMergeExercise('B', 'A');
assert('4 目标已有关联 → 保留 0361', sb.getExercises().find(e => e.id === 'A').dsId === '0361');

/* 5. 边界 */
sb = makeSandbox([], {}, [], [ex('A')]);
r = sb.renameOrMergeExercise('不存在', 'A');
assert('5a 源不存在 → ok:false', r.ok === false);
r = sb.renameOrMergeExercise('A', 'A');
assert('5b 同名 → ok:false', r.ok === false);

/* 6. 三视图 gameContent 显隐（switchGameTab 行为抽查） */
sb = makeSandbox([], {}, [], []);
let els = sb.__els;
let gcEl = sb.document.getElementById('gameContent');
gcEl._levelViewOpen = true;
sb.switchGameTab('battle');
assert('6a battle+展开 → gameContent 显示', gcEl.style.display === 'block', gcEl.style.display);
sb.switchGameTab('train');
assert('6b 切培养 → gameContent 隐藏（修复点）', gcEl.style.display === 'none', gcEl.style.display);
sb.switchGameTab('record');
assert('6c 切记录 → gameContent 隐藏', gcEl.style.display === 'none', gcEl.style.display);
gcEl._levelViewOpen = false;
sb.switchGameTab('battle');
assert('6d battle 未展开 → 隐藏', gcEl.style.display === 'none', gcEl.style.display);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

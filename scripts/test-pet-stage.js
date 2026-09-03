#!/usr/bin/env node
/* 宠物阶段实时校正测试（v2.0.9 normalizePetStage）
   场景:
   1) hatchProgress=100 但 stage=egg → 校正为 grow
   2) growth=120 但 stage=grow → 校正为 mature
   3) 喂营养液到 100% → 立即提升为 grow（不再卡 egg）
   4) 喂饲料成长满 100 → 立即成熟
   5) 成长期可喂饲料（stage=grow 通过）；蛋期喂饲料被拒
   6) 蛋期喂营养液有效；成熟期喂营养液被拒
   Run: node scripts/test-pet-stage.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sandbox = { JSON, console, Date };
sandbox.Math = Object.create(Math);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ls = {};
sandbox.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sandbox.document = {
  getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild() {}, remove() {}, setAttribute() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', dataset: {}, getContext: () => ({}) }),
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', dataset: {} }),
  body: { appendChild() {}, remove() {} },
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } }
};
sandbox.toast = function() {};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
sandbox.clearTimeout = ()=>{}; sandbox.clearInterval = ()=>{};
sandbox.requestAnimationFrame = () => 0;
vm.createContext(sandbox);
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
['store.js', 'utils.js', 'date-roll.js', 'pets.js', 'pet-materials.js', 'pet-codex.js', 'pet-store.js', 'pet-ui.js'].forEach(f => vm.runInContext(load(f), sandbox, { filename: f }));

/* 1. 卡 egg 校正 */
let p = sandbox.createPet({ speciesId: 'test', name: '测试鸟', rarity: 'SR' });
p.stage = 'egg'; p.hatchProgress = 100;
sandbox.normalizePetStage(p);
assert('1 hatchProgress=100 卡 egg → 校正为 grow', p.stage === 'grow' && p.growth === 0, 'stage=' + p.stage);

/* 2. 卡 grow 校正 */
p = sandbox.createPet({ speciesId: 'test', name: '测试鸟' });
p.stage = 'grow'; p.growth = 120;
sandbox.normalizePetStage(p);
assert('2 growth=120 卡 grow → 校正为 mature', p.stage === 'mature', 'stage=' + p.stage);

/* 3. 喂营养液到 100% 立即提升（固定 rng 使一次喂满） */
p = sandbox.createPet({ speciesId: 'test', name: '测试鸟' });
p.stage = 'egg'; p.hatchProgress = 99;
sandbox.Math.random = () => 1; // inc = 0.5 + 1*(2-0.5) = 2.0 → 99+2=101→100
let r = sandbox.feedNutrition(p);
assert('3a 喂营养液满 100 → stage 提升为 grow', p.stage === 'grow', 'stage=' + p.stage + ' progress=' + p.hatchProgress);
assert('3b feedNutrition 返回 stage=grow', r.stage === 'grow', JSON.stringify(r));

/* 4. 喂饲料成长满 → 成熟 */
p = sandbox.createPet({ speciesId: 'test', name: '测试鸟' });
p.stage = 'grow'; p.growth = 95; p.health = 100; p.hunger = 50;
sandbox.Math.random = () => 1; // growInc = 2+1*3=5 → 95+5=100
r = sandbox.feedPet(p);
assert('4 喂饲料成长满 → mature', p.stage === 'mature' && r.matured === true, 'stage=' + p.stage);

/* 5. 阶段-材料匹配 */
p = sandbox.createPet({ speciesId: 'test', name: '测试鸟' });
p.stage = 'egg';
let r5 = sandbox.feedPet(p);
assert('5a 蛋期喂饲料被拒', r5.ok === false && /非成长期/.test(r5.reason), JSON.stringify(r5));
p.stage = 'grow';
let r6 = sandbox.feedNutrition(p);
assert('5b 成长期喂营养液被拒', r6.ok === false && /非孵化期/.test(r6.reason), JSON.stringify(r6));
p.stage = 'egg'; p.hatchProgress = 50;
let r7 = sandbox.feedNutrition(p);
assert('5c 蛋期喂营养液有效', r7.ok === true, JSON.stringify(r7));

/* 6. 正常阶段不变 */
p = sandbox.createPet({ speciesId: 'test', name: '测试鸟' });
p.stage = 'egg'; p.hatchProgress = 50;
sandbox.normalizePetStage(p);
assert('6a 蛋期未满 → 保持 egg', p.stage === 'egg', 'stage=' + p.stage);
p.stage = 'grow'; p.growth = 50;
sandbox.normalizePetStage(p);
assert('6b 成长期未满 → 保持 grow', p.stage === 'grow', 'stage=' + p.stage);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

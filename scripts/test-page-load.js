#!/usr/bin/env node
/* 页面加载链冒烟测试（防 v2.0.0 事故复发：24 个模块漏挂 script 标签）
   解析 page/index.html 的实际 <script src> 顺序，在 vm 沙盒按序加载全部模块，
   断言: 0 加载失败 + v2.0 关键全局存在。
   Run: node scripts/test-page-load.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }

/* 1. 解析 index.html 的 script 顺序 */
const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);
ok(scripts.length >= 40, 'script 标签数量 ' + scripts.length + ' (≥40)');

/* 2. 沙盒按序加载 */
const sandbox = { JSON, console, Date, navigator: { userAgent: 'test' } };
sandbox.Math = Object.create(Math);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const store = {};
sandbox.localStorage = {
  _s: store,
  getItem(k) { return k in store ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
  key(i) { return Object.keys(store)[i] || null; },
  get length() { return Object.keys(store).length; }
};
sandbox.document = {
  getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', dataset: {} }),
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', dataset: {} }),
  body: { appendChild() {}, remove() {} },
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: { setAttribute() {} }
};
sandbox.toast = function() {};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.innerWidth = 375; sandbox.innerHeight = 700;
sandbox.navigator.vibrate = () => {};
vm.createContext(sandbox);

const loadErrors = [];
scripts.forEach(src => {
  const f = path.join(__dirname, '..', 'page', src);
  if (!fs.existsSync(f)) { loadErrors.push(src + ' (文件不存在)'); return; }
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: src }); }
  catch (e) { loadErrors.push(src + ': ' + e.message); }
});
ok(loadErrors.length === 0, '全部 ' + scripts.length + ' 个模块加载零异常' + (loadErrors.length ? ' — ' + loadErrors.join(' | ') : ''));

/* 3. v2.0 关键全局存在（每个系统抽一个代表性全局） */
const globals = {
  'store 注册表 store.registerSchema': s => typeof s.store.registerSchema === 'function',
  '材料掉落 grantMaterial': s => typeof s.grantMaterial === 'function',
  '宠物持久化 getPetStore': s => typeof s.getPetStore === 'function',
  '玩家技能 getSkillState': s => typeof s.getSkillState === 'function',
  '群战引擎 createGroupBattle': s => typeof s.createGroupBattle === 'function',
  '敌群关卡 getGroupStage': s => typeof s.getGroupStage === 'function',
  '宠物图鉴 listPetCodex': s => typeof s.listPetCodex === 'function',
  '宝珠合成 synthOrb': s => typeof s.synthOrb === 'function',
  '宝珠属性 orbStat': s => typeof s.orbStat === 'function',
  '挑战三视图 renderGameViews': s => typeof s.renderGameViews === 'function',
  '状态框架 defineStatus': s => typeof s.defineStatus === 'function',
  '时间工具 dateKey': s => typeof s.dateKey === 'function',
  '月度重置 resolveMonthWindow': s => typeof s.resolveMonthWindow === 'function',
  '召唤 canSummon': s => typeof s.canSummon === 'function',
  '玩家技能挂钩 attachPlayerSkills': s => typeof s.attachPlayerSkills === 'function'
};
Object.entries(globals).forEach(([label, check]) => {
  ok(check(sandbox), label);
});

/* 4. HTML 骨架接线检查（防接线事故：JS 依赖的容器/静态按钮缺失 + 旧部件已删） */
const requiredIds = ['gameTrainView', 'gameBattleView', 'gameRecordView', 'gameContent', 'battleOverlay', 'summonPanel'];
requiredIds.forEach(id => {
  ok(html.includes('id="' + id + '"'), '骨架容器 #' + id);
});
const gtabCount = (html.match(/data-gtab=/g) || []).length;
ok(gtabCount === 3, '三视图选项卡按钮 [data-gtab] ×3 (实际 ' + gtabCount + ')');
/* v2.0.5: 旧部件容器必须已删（三视图接管，防新旧共存） */
['gameStatsBar', 'periodCard', 'recordsCard'].forEach(id => {
  ok(!html.includes('id="' + id + '"'), '旧容器 #' + id + ' 已从骨架移除');
});

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

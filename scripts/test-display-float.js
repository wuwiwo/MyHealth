#!/usr/bin/env node
/* v2.2 WP-H3 测试：浮点显示尾数（展示层修复，不改数值本身）
   ① 挑战页「旬容量」卡：sumVolume() 的浮点值必须按整数 kg 渲染
   ② 折线图（月度总容量趋势 / 30 天趋势 / 体重趋势）：最新值标签与点击浮层不得出现浮点尾数
   沙盒按 page/index.html 的真实加载顺序装全部模块。
   Run: node scripts/test-display-float.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);

const ls = {};
const els = {};
function mkEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', textContent: '', value: ''
  };
}
function el(k) { if (!els[k]) els[k] = mkEl(); return els[k]; }

const sandbox = { console, JSON, Date, navigator: { userAgent: 'test' } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sandbox.document = {
  getElementById: el,
  createElement: () => mkEl(),
  body: { appendChild() {}, remove() {} },
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  documentElement: { setAttribute() {} }
};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.innerWidth = 375; sandbox.innerHeight = 700;
sandbox.navigator.vibrate = () => {};
vm.createContext(sandbox);
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', src), 'utf8'), sandbox, { filename: src });
});

/* 造一份「会产生浮点尾数」的本旬训练数据：1.1 × 3 = 3.3000000000000003 */
sandbox.store.set('exercises', [{ id: 'EX1', name: 'EX1', type: 'strength', ratio: 100, description: '', eqWeight: null, unit: 'rep' }]);
sandbox.store.set('strength', { entries: [{ id: 'e1', date: sandbox.today(), exercise: 'EX1', weight: 1.1, actualReps: 3 }] });

/* ---------- ① 挑战页「旬容量」卡 ---------- */
(function () {
  const vol = sandbox.getGameStats().periodVol;
  ok(typeof vol === 'number' && String(vol) === '3.3000000000000003',
    '前置：旬容量确实是浮点尾数（' + vol + '）');
  sandbox.renderBattleView();
  const h = els['gameBattleView'] ? els['gameBattleView'].innerHTML : '';
  ok(h.length > 0, '挑战页战斗视图已渲染');
  ok(h.indexOf(String(vol)) < 0, '① 页面不再出现原始浮点值 ' + vol);
  ok(h.indexOf(String(Math.round(vol)) + '<span style="font-size:var(--fs-xs)">kg</span>') >= 0,
    '① 旬容量按整数渲染（' + Math.round(vol) + 'kg）');
  ok(!/\d\.\d{3,}/.test(h), '① 战斗视图整体无浮点尾数');
})();

/* ---------- ② 折线图最新值标签 / 点击浮层 ---------- */
(function () {
  const texts = [];
  const ctx = {
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, closePath() {}, bezierCurveTo() {}, arc() {},
    fillText(t) { texts.push(String(t)); },
    createLinearGradient() { return { addColorStop() {} }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', lineJoin: '', lineCap: ''
  };
  const canvas = {
    width: 0, height: 0, style: {},
    getContext() { return ctx; },
    getBoundingClientRect() { return { width: 300, height: 180 }; },
    addEventListener() {},
    parentElement: { style: {}, appendChild() {}, clientWidth: 300 }
  };
  sandbox.drawLineChart(canvas, {
    labels: ['1月', '2月', '3月'],
    values: [3.3000000000000003, 12.100000000000001, 2862.1000000000004],
    color: 'var(--green)', suffix: 'kg'
  });
  ok(texts.length > 0, '折线图已绘制');
  ok(texts.indexOf('2862.1kg') >= 0, '② 最新值标签去掉尾数（2862.1kg，原文案为 2862.1000000000004kg）');
  ok(!texts.some(t => /\d\.\d{3,}/.test(t)), '② 图上所有文本均无浮点尾数');
  ok(sandbox.lcFmt(3.3000000000000003) === '3.3', 'lcFmt(3.3000000000000003) === "3.3"');
  ok(sandbox.lcFmt(5) === '5', 'lcFmt(整数) 不带小数位');
  ok(sandbox.lcFmt('x') === 'x', 'lcFmt 非数值原样返回（防回归）');
})();

/* ---------- ③ 训练页「本周统计」总容量卡（WP-H3 首轮漏网点，展示层取整） ---------- */
(function () {
  const wv = sandbox.sumVolume(sandbox.getWeekStr(), sandbox.getExerciseMap());
  ok(String(wv) === '3.3000000000000003', '③ 前置：本周容量确实是浮点尾数（' + wv + '）');
  sandbox.renderStrStats();
  const h = els['strStats'] ? els['strStats'].innerHTML : '';
  ok(h.length > 0, '③ 训练页本周统计已渲染');
  ok(h.indexOf(String(wv)) < 0, '③ 本周统计不再出现原始浮点值 ' + wv);
  /* 只看可见文本：进度环的 stroke-dasharray/dashoffset 属性本来就是长浮点，不会显示给用户 */
  const txt = h.replace(/<[^>]*>/g, ' ');
  ok(!/\d\.\d{3,}/.test(txt), '③ 本周统计可见文本无浮点尾数');
  ok(h.indexOf('>3<span') >= 0, '③ 本周统计总容量按整数渲染（3 kg）');
})();

/* ---------- ④ 挑战页「记录」视图历史最佳（最大容量） ---------- */
(function () {
  const prVol = 1.1 * 3;
  ok(String(prVol) === '3.3000000000000003', '④ 前置：PR 容量确实是浮点尾数（' + prVol + '）');
  sandbox.store.set('prs', { EX1: { maxWeight: 1.1, weightDate: 'x', maxReps: 3, repsDate: 'x', maxVolume: prVol, volDate: 'x' } });
  sandbox.renderRecordView();
  const h = els['gameRecordView'] ? els['gameRecordView'].innerHTML : '';
  ok(h.length > 0, '④ 挑战页记录视图已渲染');
  ok(h.indexOf(String(prVol)) < 0, '④ 历史最佳不再出现原始浮点值 ' + prVol);
  ok(!/\d\.\d{3,}/.test(h), '④ 记录视图无浮点尾数');
  ok(h.indexOf('最大容量 3kg') >= 0, '④ 最大容量按整数 + kg 渲染');
})();

/* ---------- ⑤ 个人页「个人最佳」PR 容量（同一口径） ---------- */
(function () {
  sandbox.renderPRs();
  const h = els['prSection'] ? els['prSection'].innerHTML : '';
  ok(h.length > 0, '⑤ 个人最佳已渲染');
  ok(h.indexOf(String(1.1 * 3)) < 0, '⑤ 个人最佳不再出现原始浮点值');
  ok(!/\d\.\d{3,}/.test(h), '⑤ 个人最佳无浮点尾数');
})();

/* ---------- ⑥ 属性变更日志 reason 里的容量 ---------- */
(function () {
  sandbox.store.set('attrLog', []);
  sandbox.trackStats({ atk: 2, def: 1, hp: 100, permBonusAtk: 0, permBonusDef: 0, permPenAtk: 0, permPenDef: 0 },
    { strVol: 3.3000000000000003, carEff: 0 });
  const log = sandbox.store.get('attrLog') || [];
  const reason = log.length ? String(log[log.length - 1].reason) : '';
  ok(reason.indexOf('容量') >= 0, '⑥ 属性日志写入容量原因（' + reason + '）');
  ok(!/\d\.\d{3,}/.test(reason), '⑥ 属性日志 reason 无浮点尾数');
})();

/* ---------- ⑦ 破 PR 提示（toast）里的容量 ---------- */
(function () {
  sandbox.store.set('prs', {});
  const made = [];
  const origCreate = sandbox.document.createElement;
  sandbox.document.createElement = function () { const e = mkEl(); made.push(e); return e; };
  sandbox.checkPR({ exercise: 'EX1', weight: 1.1, actualReps: 3, date: sandbox.today() });
  sandbox.document.createElement = origCreate;
  const msg = made.map(function (e) { return String(e.textContent || ''); }).join(' | ');
  ok(msg.indexOf('容量') >= 0, '⑦ 破 PR 提示已生成（' + msg + '）');
  ok(!/\d\.\d{3,}/.test(msg), '⑦ 破 PR 提示无浮点尾数');
})();

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

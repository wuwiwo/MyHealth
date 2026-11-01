#!/usr/bin/env node
/* v2.14.12 自定义重量（±0.5kg 微调）回归测试
   作者原话：「当前没有 9.5kg 选项，所以希望增加自定义重量（可 +−0.5kg）」。

   守六件事：
   ① ±0.5 步进 + 上下限夹紧（0.5 ~ 200kg，0.5 的整数倍，无浮点尾巴）
   ② 直接输入 9.5 生效（失焦 / 回车两条入口）、非法输入回退上次有效值并提示
   ③ 预设值命中不改档（预设高亮照旧）、非预设值才走「✏️ 自定义 9.5kg」格
   ④ fmtKg 无浮点尾巴（9.5 / 10 / 0.5），且不把老存档的 9.7 谎报成 9.5
   ⑤ 计划编辑重量步进 1 → 0.5、限幅 1~50 → 0.5~200，落库仍是数字、显示保留一位小数
   ⑥ `buildWtGrid(c, sel, onChg, isEdit)` 回调协议不变（仍是 onChg(数字 kg)）+ CSS/aria 契约

   沙箱：按 page/index.html 真实顺序加载 store/utils/stats/app/tab-strength（同 test-workout-quick-repeat），
   mini-DOM 支持 innerHTML / children / classList / dataset / click / blur / keydown 分发，
   因此网格与自定义条走的是**页面里那份真代码**（不是重写一份）。

   Run: node scripts/test-custom-weight.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const SRC_STRENGTH = src('tab-strength.js');
const CSS = src('index.css');
const HTML = src('index.html');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

/* ================= mini-DOM ================= */
function makeEl(tag) {
  const cl = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: '', style: {}, dataset: {},
    children: [], parentNode: null, innerHTML: '', textContent: '', value: '',
    type: '', focused: false, _attrs: {}, _on: {},
    classList: {
      add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c),
      toggle: (c, f) => {
        if (f === undefined) { if (cl.has(c)) cl.delete(c); else cl.add(c); }
        else if (f) cl.add(c); else cl.delete(c);
      }
    },
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } this.parentNode = null; },
    get firstChild() { return this.children[0] || null; },
    querySelector(sel) { return findAll(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(this, sel); },
    focus() { this.focused = true; }, blur() { this.focused = false; }, select() { this.selected = true; },
    addEventListener(t, fn) { (this._on[t] = this._on[t] || []).push(fn); },
    removeEventListener() {},
    dispatch(t, extra) {
      const ev = Object.assign({ type: t, target: this, preventDefault() {}, stopPropagation() {} }, extra || {});
      (this._on[t] || []).slice().forEach(fn => fn(ev));
      return ev;
    },
    click() { return this.dispatch('click'); }
  };
  Object.defineProperty(el, 'className', {
    get() { return [...cl].join(' '); },
    set(v) { cl.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cl.add(c)); }
  });
  return el;
}
function matchSel(el, sel) {
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel[0] === '.') return el.classList.contains(sel.slice(1));
  return String(el.tagName).toLowerCase() === sel.toLowerCase();
}
function findAll(root, sel) {
  const out = [];
  (function walk(n) {
    (n.children || []).forEach(c => { if (matchSel(c, sel)) out.push(c); walk(c); });
  })(root);
  return out;
}

/* ================= 沙箱（真实模块顺序） ================= */
const PAGE_IDS = ['app', 'toastC', 'todaySnapshot', 'summonPanel', 'strDateMain', 'strDateSub', 'strDayVol',
  'strPlansList', 'strList', 'strAddBtn', 'strAddCard', 'strExercise', 'strSuggest', 'strExList',
  'strWeightFg', 'strWeight', 'strEqWeightInfo', 'strEqWeightDisplay', 'strRepsLabel', 'strRepsFg',
  'strTgtVal', 'strActVal', 'strSubmit', 'strMissedDays', 'strStats', 'mtToast', 'seWeight', 'peExList'];

function makeSandbox(entries, exercises) {
  const sb = { JSON, console, Date };
  sb.Math = Object.create(Math);
  sb.window = sb; sb.globalThis = sb;
  sb.matchMedia = null;
  const mem = {};
  sb.localStorage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
    key: i => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  const els = {};
  PAGE_IDS.forEach(id => { const e = makeEl('div'); e.id = id; els[id] = e; });
  sb.document = {
    getElementById: id => {
      if (!els[id]) { const e = makeEl('div'); e.id = id; els[id] = e; }
      return els[id];
    },
    createElement: t => makeEl(t),
    body: Object.assign(makeEl('body'), {
      appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) els[c.id] = c; return c; }
    }),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: { setAttribute() {}, style: {}, classList: { add() {}, remove() {} }, scrollTop: 0 },
    activeElement: null, contains: () => true
  };
  sb.confirm = () => true;
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.requestAnimationFrame = () => 0;
  sb.scrollTo = () => {};
  sb.location = { search: '' };
  sb.addEventListener = () => {};
  sb.innerWidth = 390; sb.innerHeight = 844;
  sb.navigator = { userAgent: 'test', vibrate: () => {} };
  vm.createContext(sb);
  ['store.js', 'utils.js', 'stats.js', 'app.js', 'tab-strength.js'].forEach(f => vm.runInContext(src(f), sb, { filename: f }));
  sb.renderSummonPanel = function () {};          // game-render.js 不在本沙箱（同 test-workout-quick-repeat）
  sb.store.set('exercises', exercises || []);
  sb.store.set('strength', { entries: entries || [] });
  return sb;
}
const lex = (sb, expr) => vm.runInContext(expr, sb);

function mkEx(name, extra) {
  return Object.assign({ id: name, name: name, type: 'strength', ratio: 100, intensity: null, emoji: null,
    hasDist: false, description: '', eqWeight: null, unit: 'rep' }, extra || {});
}
const DATASET = ['二头弯举', '肩推', '深蹲', '卧推', '划船', '硬拉'].map(n => mkEx(n));
function dstr(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
let seq = 0;
function mkEntry(exercise, offsetDays, weight, reps) {
  seq++;
  return { id: 'cw' + seq, date: dstr(offsetDays), exercise: exercise, weight: weight,
    targetReps: reps, actualReps: reps, createdAt: 1700000000000 + seq * 1000 };
}

/* 网格取元素的小工具（全部走 children + classList，不依赖 innerHTML 解析） */
const presetBtn = (grid, w) => grid.children.find(c => c.classList.contains('wt-btn') && c.dataset.w === String(w)) || null;
const customBtn = grid => grid.children.find(c => c.classList.contains('wt-custom')) || null;
const barEl = grid => grid.children.find(c => c.classList.contains('wt-custombar')) || null;
const stepBtn = (grid, which) => {
  const bar = barEl(grid); if (!bar) return null;
  const bs = bar.children.filter(c => c.classList.contains('sp-btn'));
  return which === 'up' ? bs[bs.length - 1] : bs[0];
};
const inputEl = grid => {
  const bar = barEl(grid); if (!bar) return null;
  return bar.children.find(c => c.tagName === 'INPUT') || null;
};
function toasts(sb) {
  return (sb.document.getElementById('toastC').children || []).map(x => String(x.textContent)).join(' | ');
}
/* 造一个空网格容器（模拟 #strWeight / #seWeight 这类调用点） */
function mkGrid(sb, id) {
  const c = makeEl('div'); c.id = id || 'strWeight';
  c.className = 'weight-grid';
  return c;
}

/* ================= 1. ±0.5 步进 + 上下限夹紧 ================= */
section('1. ±0.5 步进 / 上下限夹紧（0.5 ~ 200kg）');
{
  const sb = makeSandbox([], DATASET);
  ok(sb.WT_STEP === 0.5, '1.1 步进常量 = 0.5kg（WT_STEP）');
  ok(sb.WT_MIN === 0.5 && sb.WT_MAX === 200, '1.2 范围常量 = 0.5 ~ 200kg（WT_MIN / WT_MAX）');
  ok(sb.wtStep(9, 1) === 9.5, '1.3 9 → +0.5 = 9.5');
  ok(sb.wtStep(9.5, 1) === 10, '1.4 9.5 → +0.5 = 10（进位不出现 10.000000001）');
  ok(sb.wtStep(10, -1) === 9.5, '1.5 10 → −0.5 = 9.5');
  ok(sb.wtStep(0.5, -1) === 0.5, '1.6 下界夹紧：0.5 − 0.5 仍是 0.5（原限幅 1 已放宽）');
  ok(sb.wtStep(200, 1) === 200, '1.7 上界夹紧：200 + 0.5 仍是 200（原限幅 50 已放宽）');
  ok(sb.wtClamp(500) === 200 && sb.wtClamp(0.1) === 0.5, '1.8 越界值直接夹紧（500→200 / 0.1→0.5）');
  ok(sb.wtClamp(9.4) === 9.5 && sb.wtClamp(9.2) === 9, '1.9 非半档值就近吸附（9.4→9.5 / 9.2→9）');
  ok(sb.wtClamp(NaN, 7) === 7, '1.10 非法值退回上次有效值（NaN + fallback 7 → 7）');
  ok(sb.wtStep(0, 1) === 0.5, '1.11 从 0 起步 +0.5 = 0.5（不会被先抬到下限再 +0.5 变成 1）');

  /* 连续 400 次 +0.5：一路到 200 都无浮点尾巴 */
  let v = 0.5, dirty = [];
  for (let i = 0; i < 400; i++) {
    v = sb.wtStep(v, 1);
    if (/\d\.\d{2,}/.test(String(v)) || Math.round(v / 0.5) * 0.5 !== v) dirty.push(v);
  }
  ok(dirty.length === 0, '1.11 连按 400 次 +0.5：值始终是 0.5 的整数倍且无浮点尾巴（末值 ' + v + '）');
  ok(v === 200, '1.12 400 次后停在 200（上限生效）');
}

/* ================= 2. 直接输入（失焦 / 回车） ================= */
section('2. 直接输入 9.5 生效 / 非法输入回退');
{
  const sb = makeSandbox([], DATASET);
  let got = [];
  const c = mkGrid(sb, 'seWeight');
  sb.buildWtGrid(c, 5, w => got.push(w), true);

  ok(customBtn(c).textContent === '✏️ 自定义', '2.1 未选自定义时该格文案 =「✏️ 自定义」');
  customBtn(c).click();
  ok(barEl(c).style.display === 'flex', '2.2 点自定义格 → 内联自定义条展开（display:flex）');
  ok(customBtn(c).getAttribute('aria-expanded') === 'true', '2.3 展开时 aria-expanded="true"');
  ok(inputEl(c).value === '5', '2.4 展开时以当前选中值为起点（5，便于 +0.5 微调）');

  /* 失焦生效 */
  inputEl(c).value = '9.5';
  inputEl(c).dispatch('blur');
  ok(got[got.length - 1] === 9.5, '2.5 输入 9.5 失焦 → 回调收到 9.5');
  ok(customBtn(c).textContent === '✏️ 自定义 9.5kg', '2.6 该格高亮为「✏️ 自定义 9.5kg」');
  ok(customBtn(c).classList.contains('selected'), '2.7 自定义格进入选中态（selected）');
  ok(inputEl(c).value === '9.5', '2.8 输入框回填规范值 9.5（无浮点尾巴）');

  /* 回车生效 */
  inputEl(c).value = '12.5';
  inputEl(c).dispatch('keydown', { key: 'Enter' });
  ok(got[got.length - 1] === 12.5, '2.9 输入 12.5 + 回车 → 生效（键盘可达）');

  /* 逗号当小数点（部分键盘） */
  inputEl(c).value = '7,5';
  inputEl(c).dispatch('blur');
  ok(got[got.length - 1] === 7.5, '2.10 "7,5" 也认（逗号键盘兜底）');

  /* 非法输入：回退上次有效值 + 提示 */
  const before = got.length;
  inputEl(c).value = 'abc';
  inputEl(c).dispatch('blur');
  ok(got.length === before, '2.11 非法输入 "abc" 不触发回调（不写脏值）');
  ok(inputEl(c).value === '7.5', '2.12 非法输入回退上次有效值（7.5）');
  ok(toasts(sb).indexOf('0.5') >= 0 && toasts(sb).indexOf('😅') >= 0, '2.13 非法输入有用户可见提示（toast）');

  /* 越界：夹紧 + 提示 */
  inputEl(c).value = '300';
  inputEl(c).dispatch('blur');
  ok(got[got.length - 1] === 200, '2.14 输入 300 → 夹紧到 200（上界）');
  ok(toasts(sb).indexOf('200') >= 0, '2.15 夹紧有提示（告诉用户被调成 200kg）');
  inputEl(c).value = '0';
  inputEl(c).dispatch('blur');
  ok(got[got.length - 1] === 0.5, '2.16 输入 0 → 抬到下限 0.5');

  /* ± 按钮（先回到 9.5 再测，避免贴着下限做减法） */
  inputEl(c).value = '9.5';
  inputEl(c).dispatch('blur');
  ok(got[got.length - 1] === 9.5, '2.17 回到 9.5（下面的 ± 从这里出发）');
  stepBtn(c, 'up').click();
  ok(got[got.length - 1] === 10, '2.18 + 按钮每次 +0.5（9.5 → 10）');
  stepBtn(c, 'down').click(); stepBtn(c, 'down').click();
  ok(got[got.length - 1] === 9, '2.19 − 按钮每次 −0.5（10 → 9，两次）');

  /* 贴着边界按也不越界 */
  inputEl(c).value = '0.5';
  inputEl(c).dispatch('blur');
  stepBtn(c, 'down').click();
  ok(got[got.length - 1] === 0.5, '2.20 0.5 再按 − 仍是 0.5（按钮侧也夹紧）');
  inputEl(c).value = '200';
  inputEl(c).dispatch('blur');
  stepBtn(c, 'up').click();
  ok(got[got.length - 1] === 200, '2.21 200 再按 + 仍是 200（按钮侧也夹紧）');
}

/* ================= 3. 预设命中不改档 / 非预设才走自定义格 ================= */
section('3. 预设值命中不改档');
{
  const sb = makeSandbox([], DATASET);
  let got = [];
  const c = mkGrid(sb, 'seWeight');
  sb.buildWtGrid(c, 5, w => got.push(w), true);
  ok(presetBtn(c, 5).classList.contains('selected'), '3.1 selW=5（预设）→ 5 号格高亮');
  ok(!customBtn(c).classList.contains('selected'), '3.2 selW=5 时自定义格**不**高亮（不强行改档）');
  ok(customBtn(c).textContent === '✏️ 自定义', '3.3 预设态下自定义格只显示「✏️ 自定义」');

  customBtn(c).click();
  inputEl(c).value = '6';
  inputEl(c).dispatch('blur');
  ok(presetBtn(c, 6).classList.contains('selected') && !customBtn(c).classList.contains('selected'),
    '3.4 自定义条里输入 6（正好是预设档）→ 高亮回到 6 号格，自定义格不高亮');
  ok(customBtn(c).textContent === '✏️ 自定义', '3.5 命中预设档 → 自定义格不显示数值');

  inputEl(c).value = '9.5';
  inputEl(c).dispatch('blur');
  const selectedPresets = c.children.filter(x => x.classList.contains('selected') && x.classList.contains('wt-btn') && x.dataset.w !== 'custom');
  ok(selectedPresets.length === 0, '3.6 输入 9.5（非预设）→ 没有任何预设格高亮');
  ok(customBtn(c).textContent === '✏️ 自定义 9.5kg', '3.7 非预设值 → 自定义格高亮并显示 9.5kg');

  /* 点预设档 → 收起自定义条，回调仍是预设值 */
  presetBtn(c, 7).click();
  ok(got[got.length - 1] === 7, '3.8 点 7 号预设 → 回调收到 7');
  ok(barEl(c).style.display === 'none', '3.9 选预设后内联自定义条收起');
  ok(presetBtn(c, 7).classList.contains('selected') && !customBtn(c).classList.contains('selected'),
    '3.10 选中态回到预设格');

  /* weight=0 的旧记录：任何格都不高亮（不被抬成「自定义 0.5kg」） */
  const c0 = mkGrid(sb, 'seWeight0');
  sb.buildWtGrid(c0, 0, null, true);
  ok(!customBtn(c0).classList.contains('selected') && customBtn(c0).textContent === '✏️ 自定义',
    '3.11 selW=0 → 不高亮「自定义 0.5kg」（与改动前「无档选中」一致）');
  ok(c0.children.filter(x => x.classList.contains('selected')).length === 0, '3.12 selW=0 时没有任何格高亮');
}

/* ================= 4. fmtKg：无浮点尾巴，也不谎报 ================= */
section('4. fmtKg 展示口径');
{
  const sb = makeSandbox([], DATASET);
  ok(sb.fmtKg(9.5) === '9.5', '4.1 fmtKg(9.5) === "9.5"');
  ok(sb.fmtKg(10) === '10', '4.2 fmtKg(10) === "10"（整数不带 .0）');
  ok(sb.fmtKg(0.5) === '0.5', '4.3 fmtKg(0.5) === "0.5"');
  ok(sb.fmtKg(9.5 + 1e-10) === '9.5', '4.4 fmtKg(9.5000000001) === "9.5"（浮点尾巴被吸收）');
  ok(sb.fmtKg(0.5 * 19) === '9.5', '4.5 fmtKg(0.5*19) === "9.5"（乘法不产生 9.500000001）');
  ok(sb.fmtKg(9.7) === '9.7', '4.6 老存档的 9.7 不被谎报成 9.5（非半档值保留一位）');
  ok(sb.fmtKg('8') === '8' && sb.fmtKg(null) === '0', '4.7 字符串数字照常 / 空值兜底 "0"（不输出 NaN）');
  const bad = [9.5, 10, 0.5, 12.5, 200, 0.5, 3.5].filter(v => /\d\.\d{2,}/.test(sb.fmtKg(v)));
  ok(bad.length === 0, '4.8 半档值集合逐个格式化后均无浮点尾巴');
}

/* ================= 5. buildWtGrid 回调协议不变（4 参调用） ================= */
section('5. buildWtGrid 回调协议不变');
{
  const sb = makeSandbox([], DATASET);
  ok(/function buildWtGrid\(c,sel,onChg,isEdit\)/.test(SRC_STRENGTH),
    '5.1 签名仍是 buildWtGrid(c,sel,onChg,isEdit)');
  ok(/buildWtGrid\(modal\.querySelector\('#seWeight'\),selW,w=>selW=w,true\)/.test(SRC_STRENGTH),
    '5.2 调用点 #seWeight 原样保留（4 参 + w=>selW=w 回调）');
  ok(/buildWtGrid\(document\.getElementById\('strWeight'\),_strSelW,w=>_strSelW=w\)/.test(src('app.js')),
    '5.3 app.js 的 #strWeight 调用点一字未改（覆盖后自动获得自定义格）');
  ok(/buildWtGrid\(wg,_strSelW,function\(w\)\{_strSelW=w\}\)/.test(SRC_STRENGTH),
    '5.4 applyStrLastSet 的三参调用点一字未改');

  const c = mkGrid(sb, 'strWeight');
  const got = [];
  sb.buildWtGrid(c, 9.5, w => got.push(w), true);          // isEdit=true 不得改变协议
  ok(typeof got[0] === 'undefined', '5.5 构建时**不**触发回调（与原来一致）');
  presetBtn(c, 8).click();
  ok(got.length === 1 && got[0] === 8 && typeof got[0] === 'number', '5.6 点预设 → 回调收到数字 8（一次）');
  customBtn(c).click(); inputEl(c).value = '9.5'; inputEl(c).dispatch('blur');
  ok(got.length === 2 && got[1] === 9.5 && typeof got[1] === 'number', '5.7 自定义 9.5 → 回调收到数字 9.5（一次）');

  /* 预设档位全部还在（13 个），一个不少 */
  const presets = c.children.filter(x => x.classList.contains('wt-btn') && x.dataset.w !== 'custom');
  const commonLen = lex(sb, 'COMMON_W.length');          // utils.js 里是 const（词法绑定，不挂 global 对象）
  ok(presets.length === commonLen, '5.8 预设档位一格不动（' + presets.length + ' = COMMON_W 长度）');
  ok(presets.every(p => p.textContent === p.dataset.w), '5.9 预设格文案仍是档位数字（未夹带单位）');
  ok(!!customBtn(c) && c.children.indexOf(customBtn(c)) > c.children.indexOf(presetBtn(c, lex(sb, 'COMMON_W[COMMON_W.length-1]'))),
    '5.10 「✏️ 自定义」格排在所有预设档位**之后**');
}

/* ================= 6. 端到端：记录 9.5kg（作者的真实需求） ================= */
section('6. 端到端：记一组 9.5kg');
{
  const sb = makeSandbox([mkEntry('二头弯举', 0, 5, 12)], DATASET);
  sb.pickStrExercise('二头弯举');                            // 真实路径：applyStrLastSet → buildWtGrid(#strWeight,…)
  const grid = sb.document.getElementById('strWeight');
  ok(!!grid._wtState && !!customBtn(grid), '6.1 #strWeight 网格经真实调用点构建，且含自定义格');
  customBtn(grid).click();
  const inp = inputEl(grid);
  ok(!!inp && inp.type === 'number' && String(inp.step) === '0.5' && String(inp.min) === '0.5' && String(inp.max) === '200',
    '6.2 输入框 type=number / step=0.5 / min=0.5 / max=200');
  ok(inp.getAttribute('inputmode') === 'decimal', '6.3 移动端键盘 inputmode="decimal"');
  ok(inp.getAttribute('aria-label').indexOf('公斤') >= 0, '6.4 输入框有 aria-label');
  inp.value = '9.5';
  inp.dispatch('blur');
  ok(lex(sb, '_strSelW') === 9.5, '6.5 选中 9.5 → 写回表单的 _strSelW（9.5）');

  sb.document.getElementById('strExercise').value = '二头弯举';
  sb.document.getElementById('strTgtVal').textContent = '12';
  sb.document.getElementById('strActVal').textContent = '12';
  ok(sb.onStrengthEvent(sb.document.getElementById('strSubmit'), 'strSubmit', undefined) === true, '6.6 记录成功（原提交路径）');
  const rec = sb.store.get('strength').entries.slice(-1)[0];
  ok(rec.weight === 9.5, '6.7 落库 weight = 9.5（仍是数字，存储语义不变）');
  const html = sb.document.getElementById('strList').innerHTML;
  ok(html.indexOf('● 9.5 kg') >= 0, '6.8 记录行显示「● 9.5 kg」（不是 9.500000001）');
  ok(!/\d\.\d{2,}/.test(html.replace(/<[^>]*>/g, ' ')), '6.9 记录列表可见文本无浮点尾巴');
  ok(sb.strSetLabel(rec).indexOf('9.5kg') >= 0, '6.10 快速复训按钮文案带 9.5kg（strSetLabel 统一 fmtKg）');

  /* 训练中页 + 完成汇总 */
  const sb2 = makeSandbox([], DATASET);
  sb2.savePlans([{ id: 'p1', name: '计划A', exercises: [{ exercise: '二头弯举', weight: 9.5, targetReps: 12, restSeconds: 0 }], createdAt: 1700000000000 }]);
  ok(sb2.getPlans().length === 1, '6.11 计划夹具落库成功（savePlans 走真实现）');
  sb2.startStrPlan('p1');
  const overlay = sb2.document.body.children[sb2.document.body.children.length - 1];
  ok(overlay && overlay.innerHTML.indexOf('9.5 kg · 目标 12 次') >= 0, '6.12 训练中页显示「9.5 kg · 目标 12 次」');
  const arena = makeEl('div'); arena.className = 'battle-arena';
  const ov = sb2.document.getElementById('woOverlay'); ov.appendChild(arena);
  lex(sb2, "_woDone=[{exercise:'二头弯举',weight:9.5,targetReps:12,actualReps:12}]");
  sb2.showWoSummary();
  ok(arena.innerHTML.indexOf('9.5kg × 12/12') >= 0, '6.12 完成汇总显示「9.5kg × 12/12」');
}

/* ================= 7. 计划编辑：步进 0.5 / 限幅 0.5~200 ================= */
section('7. 计划编辑重量（±0.5，0.5 ~ 200）');
{
  const sb = makeSandbox([], DATASET);
  const wEl = sb.document.getElementById('peExWeight');
  const ev = id => sb.onStrengthEvent(makeEl('button'), id);

  wEl.textContent = '9';
  ev('peExWUp');
  ok(wEl.textContent === '9.5', '7.1 + 一步 = 9 → 9.5（原来 +1）');
  ev('peExWDown');
  ok(wEl.textContent === '9', '7.2 − 一步 = 9.5 → 9');
  wEl.textContent = '9.5';
  ev('peExWUp');
  ok(wEl.textContent === '10', '7.3 9.5 + 0.5 = 10（整数不显示 .0）');

  wEl.textContent = '1';
  ev('peExWDown'); ev('peExWDown');
  ok(wEl.textContent === '0.5', '7.4 下限 0.5（原来夹在 1，9.5kg 场景必须先放宽）');
  ev('peExWDown');
  ok(wEl.textContent === '0.5', '7.5 到 0.5 后不再往下');
  wEl.textContent = '50';
  ev('peExWUp');
  ok(wEl.textContent === '50.5', '7.6 上限不再卡在 50（50 + 0.5 = 50.5）');
  wEl.textContent = '200';
  ev('peExWUp');
  ok(wEl.textContent === '200', '7.7 上界 200 夹紧');

  /* 确认落库：仍是数字 9.5，列表显示 9.5 kg */
  lex(sb, '_peEditing={exercises:[]}');
  lex(sb, '_peTempIdx=null');
  sb.document.getElementById('peExName').value = '二头弯举';
  sb.document.getElementById('peExWeight').textContent = '9.5';
  sb.document.getElementById('peExReps').textContent = '12';
  sb.document.getElementById('peExRest').textContent = '60';
  ok(ev('peExConfirm') === true, '7.8 计划动作确认路径仍可用');
  ok(lex(sb, '_peEditing.exercises[0].weight') === 9.5, '7.9 计划里存的是数字 9.5（不是字符串）');
  ok(sb.document.getElementById('peExList').innerHTML.indexOf('9.5 kg × 12 次') >= 0, '7.10 计划行显示「9.5 kg × 12 次」');

  /* 源码规格：重量那两个 case 不再有旧的 ±1 / 1~50 限幅 */
  const wDown = (/case 'peExWDown':\{[^\n]*/.exec(SRC_STRENGTH) || [''])[0];
  const wUp = (/case 'peExWUp':\{[^\n]*/.exec(SRC_STRENGTH) || [''])[0];
  ok(wDown && wUp && !/Math\.max\(1,/.test(wDown) && !/Math\.min\(50,/.test(wUp),
    '7.11 重量步进的旧限幅（Math.max(1,…) / Math.min(50,…)）已删除');
  ok(/case 'peExWDown':\{var wEl=.*wtStep\(/.test(SRC_STRENGTH) && /case 'peExWUp':\{var wEl=.*wtStep\(/.test(SRC_STRENGTH),
    '7.12 两个步进改用 wtStep（0.5 步进 + 0.5~200 夹紧）');
}

/* ================= 8. 可访问性 / 风格契约 ================= */
section('8. a11y / 扁平风契约');
{
  const sb = makeSandbox([], DATASET);
  const c = mkGrid(sb, 'seWeight');
  sb.buildWtGrid(c, 5, null, true);
  const bar = barEl(c);
  ok(stepBtn(c, 'down').getAttribute('aria-label') === '减少 0.5 公斤', '8.1 − 按钮 aria-label =「减少 0.5 公斤」');
  ok(stepBtn(c, 'up').getAttribute('aria-label') === '增加 0.5 公斤', '8.2 + 按钮 aria-label =「增加 0.5 公斤」');
  ok(bar.getAttribute('role') === 'group' && String(bar.getAttribute('aria-label')).indexOf('0.5') >= 0,
    '8.3 自定义条 role=group + aria-label 说明 0.5 公斤步进');
  ok(customBtn(c).getAttribute('aria-controls') === bar.id && bar.id === 'seWeight-custom',
    '8.4 自定义格 aria-controls 指向本网格的自定义条（id 唯一，不与 #strWeight 冲突）');
  ok(stepBtn(c, 'down').tagName === 'BUTTON' && stepBtn(c, 'up').tagName === 'BUTTON',
    '8.5 ± 是真按钮（键盘可达，非 div/span 伪按钮）');
  ok(c.children.filter(x => x.classList.contains('wt-btn')).every(b => b.tagName === 'BUTTON'),
    '8.6 所有档位格 / 自定义格都是 button');

  ok(/\.wt-btn\.wt-custom\{[^}]*grid-column:span 2/.test(CSS), '8.7 自定义格占 2 列（13 档 + 2 列 = 末行填满，无孤立行）');
  ok(/\.wt-custombar\{[^}]*min-height:var\(--touch-min\)/.test(CSS), '8.8 自定义条 min-height = --touch-min(44px)');
  ok(/\.wt-customval\{[^}]*min-height:var\(--touch-min\)/.test(CSS), '8.9 输入框 min-height = --touch-min(44px)');
  ok(/\.wt-custombar \.sp-btn:focus-visible,\.wt-customval:focus-visible,\.wt-btn\.wt-custom:focus-visible\{[^}]*outline:var\(--bw\) solid var\(--orange\)/.test(CSS),
    '8.10 focus 用 2px 描边（--bw=2px，不用阴影）');
  const block = CSS.slice(CSS.indexOf('自定义重量（v2.14.12）'), CSS.indexOf('/* Stepper */'));
  ok(block.length > 500, '8.11 新增 CSS 块可定位（' + block.length + ' 字符）');
  ok(!/box-shadow:(?!none)/.test(block), '8.12 新增 CSS 无阴影（除 none）');
  ok(!/border-radius:(?!0)/.test(block), '8.13 新增 CSS 圆角只有 0（无中间圆角）');
  ok(!/transition[^;]*?\b([1-9]\d{2,}|[2-9]\d)ms/.test(block), '8.14 新增 CSS 无 >75ms 过渡（本块未新增过渡）');
  ok(!/linear-gradient|radial-gradient/.test(block), '8.15 新增 CSS 无渐变');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), '8.16 新增 CSS 无硬编码颜色（全走令牌）');

  const codeBlock = SRC_STRENGTH.slice(SRC_STRENGTH.indexOf('v2.14.12 — 自定义重量'), SRC_STRENGTH.indexOf('/* ========== TODAY SNAPSHOT'));
  ok(codeBlock.length > 3000, '8.17 新增 JS 块可定位（' + codeBlock.length + ' 字符）');
  ok(!/font-size:\s*[0-9.]+\s*(px|rem|em)/.test(codeBlock), '8.18 新代码无内联裸字号');
  ok(!/\bcatch\b/.test(codeBlock), '8.19 新代码里没有 catch（也就没有空 catch）');
  ok(!/#[0-9a-fA-F]{6}\b/.test(codeBlock), '8.20 新代码无硬编码十六进制颜色');
  ok(/setAttribute\('step','0\.5'\)/.test(codeBlock) && /setAttribute\('min',String\(WT_MIN\)\)/.test(codeBlock),
    '8.21 输入框的 step/min/max 以属性形式落盘（原生校验与虚拟键盘都认）');
  ok(/aria-label','减少 0\.5 公斤'/.test(codeBlock) && /aria-label','增加 0\.5 公斤'/.test(codeBlock),
    '8.22 ± 按钮的 aria-label 在源码里（不是靠 title）');

  /* 覆盖生效前提：tab-strength.js 必须晚于 utils.js 加载 */
  const iUtils = HTML.indexOf('src="utils.js');
  const iStr = HTML.indexOf('src="tab-strength.js');
  ok(iUtils > -1 && iStr > iUtils, '8.23 index.html 里 tab-strength.js 晚于 utils.js（同名覆盖生效）');
  ok(/function buildWtGrid\(c,sel,onChg\)/.test(src('utils.js')), '8.24 utils.js 的原始 buildWtGrid 未被改动（本批不可写）');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) console.log('失败项:\n  ' + fails.join('\n  '));
process.exit(fail === 0 ? 0 : 1);

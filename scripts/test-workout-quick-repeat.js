#!/usr/bin/env node
/* v2.4.9 训练页两件功能测试（作者原话）
   ①「新训练时，将训练列表最常用的和不常用的进行区分」
   ②「可以方便将某次训练再次快速训练（如这次 12 下二头弯举，下一组也是一样组数和重量可以快速复制）」

   守四件事：
   1) **频次统计算法**（`strFreqStats` / `strRankExercises` / `strSplitCommon`）：
      口径 = 该用户真实记录的**组数**（一组 = 一条 entry）；窗口 30 天、阈值 ≥2 组、
      上限 6 个、薄样本退化到「最近 30 组」、无历史不谎报常用。
   2) **常用 / 兜底分组**（`strSuggestHtml` / `strExPickerHtml`）：
      常用置顶且带标记、不常用**不丢**（chips 区可展开、弹层里完整可见）、
      无历史时按数据集默认顺序列全部（不出现空列表）；渲染顺序用字符串下标断死。
   3) **快速复制产出的记录字段与手输一致**（`strEntryPayload`）：
      对照物是**真的跑一遍 `strSubmit`**（手输路径）后落库的那条记录，逐字段比对
      （id/createdAt 由 `addStr` 生成，比对时剔除）。
   4) **不影响原有记录流程**：✏️/🗑️ 仍在、手输仍落库、编辑/删除仍可用、
      表单路径没有新增必填步骤。

   另有 CSS / aria 契约守卫（折叠开关热区、无裸字号、🔁 有 aria-label、无空 catch）。

   Run: node scripts/test-workout-quick-repeat.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const SRC_STRENGTH = src('tab-strength.js');
const CSS = src('index.css');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

/* ================= mini-DOM 沙箱（口径：test-exercise-rename / test-page-load 同族） ================= */
function matches(el, sel) {
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel[0] === '.') return el.classList.contains(sel.slice(1));
  return false;
}
function findIn(root, sel) {
  for (const c of (root.children || [])) {
    if (matches(c, sel)) return c;
    const deep = findIn(c, sel);
    if (deep) return deep;
  }
  return null;
}
function makeEl(tag) {
  const cl = new Set();
  const el = {
    tagName: tag || 'div', id: '', style: {}, dataset: {}, children: [], parentNode: null,
    innerHTML: '', textContent: '', value: '', _attrs: {},
    classList: {
      add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c),
      toggle: (c, f) => { if (f === undefined) { cl.has(c) ? cl.delete(c) : cl.add(c); } else if (f) cl.add(c); else cl.delete(c); }
    },
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    get firstChild() { return this.children[0] || null; },
    insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } this.parentNode = null; },
    querySelector(sel) { return findIn(this, sel); }, querySelectorAll() { return []; },
    focus() {}, closest() { return null }
  };
  return el;
}
/* 训练页骨架里真实存在的容器（其余 id 一律返回 null，跟真 DOM 一样） */
const PAGE_IDS = ['app', 'toastC', 'todaySnapshot', 'summonPanel', 'strDateMain', 'strDateSub', 'strDayVol',
  'strPlansList', 'strList', 'strAddBtn', 'strAddCard', 'strExercise', 'strSuggest', 'strExList',
  'strWeightFg', 'strWeight', 'strEqWeightInfo', 'strEqWeightDisplay', 'strRepsLabel', 'strRepsFg',
  'strTgtVal', 'strActVal', 'strSubmit', 'strMissedDays', 'strStats', 'mtToast'];

function makeSandbox(entries, exercises) {
  const sb = { JSON, console, Date };
  sb.Math = Object.create(Math);
  sb.window = sb; sb.globalThis = sb;
  sb.matchMedia = null;         // ← utils.js 的 _sysMq 走 null 分支
  const mem = {};
  sb.localStorage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
    key: i => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  const els = {}, created = [];
  PAGE_IDS.forEach(id => { const e = makeEl('div'); e.id = id; els[id] = e; created.push(e); });
  sb.__els = els;
  sb.document = {
    getElementById: id => els[id] || created.find(e => e.id === id) || null,
    createElement: tag => { const e = makeEl(tag); created.push(e); return e; },
    body: makeEl('body'),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: { setAttribute() {}, style: {}, scrollTop: 0 },
    activeElement: null, contains: () => true
  };
  sb.__toasts = [];   // toast() 由 utils.js 定义（沙箱内跑真实现）→ 下面 toasts() 从 #toastC 读
  sb.confirm = () => true;
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.requestAnimationFrame = () => 0;
  sb.scrollTo = () => {};
  sb.location = { search: '' };
  vm.createContext(sb);
  ['store.js', 'utils.js', 'stats.js', 'app.js', 'tab-strength.js'].forEach(f => vm.runInContext(src(f), sb, { filename: f }));
  /* 本沙箱不载 game-render.js：补 renderStr() 依赖的同名全局（口径同 test-pet-panel-layout 的 _petBattlePicks） */
  sb.renderSummonPanel = function () {};
  sb.store.set('exercises', exercises || []);
  sb.store.set('strength', { entries: entries || [] });
  return sb;
}

/* tab-strength.js 的模块级 `let _strDate/_strSelW` 在 vm 里是**词法作用域**绑定（不挂 global 对象），
   必须用 runInContext 读写（口径：同族测试对引擎内部状态的取法） */
const lex = (sb, expr) => vm.runInContext(expr, sb);
/* 页面真实入口是 index.html 里的 init()（本沙箱不跑 init）→ 显式调一次 renderStr() 拿渲染结果 */
function boot(sb) { sb.renderStr(); return sb; }

/* toast() 走 utils.js 真实现（往 #toastC 里 append）；沙箱里 setTimeout 不执行 → 元素会留下 */
function toasts(sb) {
  const c = sb.document.getElementById('toastC');
  return (c.children || []).map(x => String(x.textContent)).join(' | ');
}

/* ------------- fixture 工具 ------------- */
function mkEx(name, extra) {
  return Object.assign({ id: name, name: name, type: 'strength', ratio: 100, intensity: null, emoji: null,
    hasDist: false, description: '', eqWeight: null, unit: 'rep' }, extra || {});
}
const DATASET = ['二头弯举', '肩推', '深蹲', '卧推', '划船', '硬拉', '侧平举', '前平举', '锤式弯举', '俯身飞鸟',
  '颈后臂屈伸', '俯身臂屈伸', '直立划船', '推举', '阿诺德推举', '哑铃飞鸟', '哑铃耸肩', '弓步蹲', '保加利亚深蹲', '站姿提踵'];
const ALL_EX = DATASET.map(n => mkEx(n));

function dstr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
let seq = 0;
function mkEntry(exercise, offsetDays, weight, reps, extra) {
  seq++;
  return Object.assign({ id: 'e' + seq, date: dstr(offsetDays), exercise: exercise, weight: weight,
    targetReps: reps, actualReps: reps, createdAt: 1700000000000 + seq * 1000 }, extra || {});
}
/* 作者的场景 fixture：二头弯举 12 下 · 5kg ×3 组（今天），另有肩推 / 深蹲历史 */
function authorFixture() {
  return [
    mkEntry('二头弯举', -1, 5, 12),
    mkEntry('二头弯举', 0, 5, 12),
    mkEntry('肩推', -2, 8, 10),
    mkEntry('肩推', 0, 8, 10),
    mkEntry('深蹲', -3, 20, 15),
    mkEntry('深蹲', 0, 20, 15)
  ];
}

/* ================= 1. 频次统计算法 ================= */
{
  const sb = makeSandbox([], ALL_EX);
  const today = sb.today();

  /* 1.1 一组 = 一条记录（不是"动作去重"） */
  const e1 = [mkEntry('二头弯举', 0, 5, 12), mkEntry('二头弯举', -1, 5, 12), mkEntry('二头弯举', -2, 5, 12),
    mkEntry('深蹲', 0, 20, 15), mkEntry('深蹲', -1, 20, 15)];
  let s = sb.strFreqStats(e1, today);
  ok(s.counts['二头弯举'] === 3 && s.counts['深蹲'] === 2 && s.totalSets === 5,
    '1.1 频次 = 该动作在窗口内的**组数**（二头 3 组 / 深蹲 2 组）');
  ok(s.source === 'window', '1.2 窗口内 ≥5 组 → 用近 30 天窗口（实测 ' + s.source + '）');

  /* 1.3 窗口边界：today-29 计入、today-30 不计入（窗口内 ≥5 组才不会走退化分支） */
  const winE = [mkEntry('A', 0, 5, 10), mkEntry('A', -8, 5, 10), mkEntry('A', -16, 5, 10), mkEntry('A', -24, 5, 10),
    mkEntry('A', -29, 5, 10), mkEntry('B', -30, 5, 10)];
  s = sb.strFreqStats(winE, today);
  ok(s.source === 'window' && s.counts['A'] === 5 && s.counts['B'] === undefined,
    '1.3 窗口边界：today-29 计入、today-30 排除（A=' + s.counts['A'] + ' / B=' + s.counts['B'] + '）');

  /* 1.4 薄样本退化：窗口内 <5 组 → 用「全历史最近 30 组」 */
  const thin = [mkEntry('C', -90, 5, 10), mkEntry('C', -95, 5, 10), mkEntry('D', -100, 5, 10)];
  s = sb.strFreqStats(thin, today);
  ok(s.source === 'recent' && s.counts['C'] === 2 && s.counts['D'] === 1 && s.totalSets === 3,
    '1.4 窗口样本 <5 组 → 退化到「全历史最近 30 组」（source=' + s.source + '）');

  /* 1.5 完全无历史 */
  s = sb.strFreqStats([], today);
  ok(s.source === 'none' && s.totalSets === 0 && Object.keys(s.counts).length === 0,
    '1.5 无历史 → source=none / totalSets=0（兜底分支的判据）');

  /* 1.6 createdAt 缺失时用时序回落日期（外部同步 / 老存档） */
  const noTs = [mkEntry('E', -1, 5, 10, { createdAt: undefined }), mkEntry('E', 0, 5, 10, { createdAt: undefined })];
  delete noTs[0].createdAt; delete noTs[1].createdAt;
  s = sb.strFreqStats(noTs, today);
  ok(s.lastAt['E'] === sb.parseDate(dstr(0)).getTime(),
    '1.6 缺 createdAt → 最近使用时间回落到日期（取更新的那条）');

  /* 1.7 缺 exercise 的脏记录被忽略，不炸 */
  s = sb.strFreqStats([{ date: today, weight: 5, actualReps: 1 }, mkEntry('F', 0, 5, 10)], today);
  ok(s.totalSets === 1 && s.counts['F'] === 1, '1.7 无 exercise 的脏记录被跳过（不抛异常）');
}

/* ================= 2. 排序 & 常用/不常用分组 ================= */
{
  const sb = makeSandbox([], ALL_EX);
  const today = sb.today();

  /* 2.1 组数降序 → 最近使用降序 → 数据集顺序 */
  const e = [mkEntry('深蹲', 0, 20, 15), mkEntry('二头弯举', 0, 5, 12), mkEntry('二头弯举', 0, 5, 12), mkEntry('深蹲', 0, 20, 15), mkEntry('肩推', 0, 8, 10)];
  e[1].createdAt = 9000; e[2].createdAt = 9999; e[0].createdAt = 5000; e[3].createdAt = 6000;
  let stats = sb.strFreqStats(e, today);
  let ranked = sb.strRankExercises(DATASET, stats);
  ok(ranked[0].name === '二头弯举' && ranked[1].name === '深蹲' && ranked[2].name === '肩推',
    '2.1 排序 = 组数降序（并列时按最近使用）');
  const tie = sb.strRankExercises(['B', 'A'], { counts: { A: 1, B: 1 }, lastAt: {} });
  ok(tie[0].name === 'B', '2.2 完全并列 → 回落到**数据集顺序**（稳定可复现）');

  /* 2.3 常用阈值：≥2 组；只练 1 次的不算常用 */
  stats = sb.strFreqStats(authorFixture(), today);
  ranked = sb.strRankExercises(DATASET, stats);
  let sp = sb.strSplitCommon(ranked, stats);
  const commonNames = sp.common.map(r => r.name).slice().sort().join(',');
  ok(sp.hasHistory === true && sp.common.length === 3 && sp.common.every(r => r.count >= 2) &&
    commonNames === ['二头弯举', '肩推', '深蹲'].sort().join(','),
    '2.3 常用 = 窗口内 ≥2 组（' + sp.common.map(r => r.name + '×' + r.count).join(' / ') + '）');
  ok(sp.others.length === DATASET.length - 3 && sp.others.every(r => r.count < 2),
    '2.3b 其余动作（含 0 组的）全部进「其它动作」，一个不丢（' + sp.others.length + ' 个）');
  const once = [mkEntry('卧推', 0, 30, 10), mkEntry('卧推', 0, 30, 10), mkEntry('划船', 0, 20, 10), mkEntry('划船', 0, 20, 10), mkEntry('硬拉', 0, 40, 8)];
  stats = sb.strFreqStats(once, today);
  sp = sb.strSplitCommon(sb.strRankExercises(DATASET, stats), stats);
  ok(sp.common.map(r => r.name).slice().sort().join(',') === ['卧推', '划船'].sort().join(',') && sp.others.some(r => r.name === '硬拉'),
    '2.4 只练过 1 次的动作不进「常用」（避免首练即置顶）');

  /* 2.5 上限 6 个 */
  const many = [];
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(n => { many.push(mkEntry(n, 0, 5, 10), mkEntry(n, 0, 5, 10)); });
  stats = sb.strFreqStats(many, today);
  sp = sb.strSplitCommon(sb.strRankExercises(['a', 'b', 'c', 'd', 'e', 'f', 'g'], stats), stats);
  ok(sp.common.length === sb.STR_FREQ.maxCommon && sp.others.length === 1,
    '2.5 「常用」上限 ' + sb.STR_FREQ.maxCommon + ' 个，其余进其它动作');

  /* 2.6 无历史兜底：hasHistory=false / common 空 / others 非空且保持数据集顺序 */
  sp = sb.strSplitCommon(sb.strRankExercises(DATASET, sb.strFreqStats([], today)), sb.strFreqStats([], today));
  ok(sp.hasHistory === false && sp.common.length === 0 && sp.others.length === DATASET.length &&
    sp.others.slice(0, 3).every((r, i) => r.name === DATASET[i]),
    '2.6 无历史 → 不谎报常用；全部动作按**数据集默认顺序**兜底（' + sp.others.length + ' 个，非空）');

  /* 2.7 不写死清单：换一批记录，常用表跟着换（同一份代码、同一个数据集） */
  const armStats = sb.strFreqStats(authorFixture(), today);
  const armSplit = sb.strSplitCommon(sb.strRankExercises(DATASET, armStats), armStats);
  const legDay = [];
  ['深蹲', '弓步蹲', '保加利亚深蹲'].forEach(n => { legDay.push(mkEntry(n, 0, 20, 15), mkEntry(n, 0, 20, 15), mkEntry(n, 0, 20, 15)); });
  const legStats = sb.strFreqStats(legDay, today);
  const spLeg = sb.strSplitCommon(sb.strRankExercises(DATASET, legStats), legStats);
  ok(spLeg.common.some(r => r.name === '深蹲') && !spLeg.common.some(r => r.name === '二头弯举') &&
    armSplit.common.some(r => r.name === '二头弯举') && !armSplit.common.some(r => r.name === '弓步蹲'),
    '2.7 常用表来自**记录本身**，不是写死清单（练腿日 → 深蹲进常用 / 二头弯举出局）');
  ok(spLeg.others.some(r => r.name === '二头弯举'),
    '2.8 掉出常用的动作仍在「其它动作」里（降级而不是消失）');
}

/* ================= 3. 常用 / 不常用 呈现（chips 区 + 弹层） ================= */
{
  const sb = makeSandbox(authorFixture(), ALL_EX);
  const chips = sb.strSuggestHtml(sb.strCommonSet(), false);
  ok(chips.indexOf('⭐ 常用') >= 0, '3.1 chips 区有「⭐ 常用」分组标签');
  ok(chips.indexOf('二头弯举') >= 0 && chips.indexOf('二头弯举') < chips.indexOf('⋯ 其它动作'),
    '3.2 常用动作在「其它动作」开关**之前**（置顶，零操作步数）');
  ok(/⋯ 其它动作（17）/.test(chips), '3.3 不常用默认折叠为「⋯ 其它动作（N）」（实测 ' +
    (chips.match(/⋯ 其它动作（\d+）/) || ['无'])[0] + '）');
  ok(chips.indexOf('保加利亚深蹲') < 0, '3.4 折叠态不含不常用动作（一眼可辨，不靠猜）');
  ok((chips.match(/data-a="strPickEx"/g) || []).length === 3,
    '3.5 折叠态只有 3 个可点动作（= 常用数），点开才展开其余');
  const chipsOpen = sb.strSuggestHtml(sb.strCommonSet(), true);
  ok(chipsOpen.indexOf('保加利亚深蹲') >= 0 && chipsOpen.indexOf('收起其它动作') >= 0,
    '3.6 展开后不常用动作**全在**（可收起，会话内记忆）');
  ok(chipsOpen.indexOf('⭐ 常用') >= 0 && (chipsOpen.match(/data-a="strPickEx"/g) || []).length === DATASET.length,
    '3.7 展开态 = 常用 + 其它动作，无动作丢失（' + DATASET.length + ' 个）');

  /* 无历史：不出现空列表 */
  const sb2 = makeSandbox([], ALL_EX);
  const chipsEmpty = sb2.strSuggestHtml(sb2.strCommonSet(), false);
  ok(chipsEmpty.indexOf('⭐ 常用') < 0 && chipsEmpty.indexOf('全部动作') >= 0,
    '3.8 无历史 → 不显示「常用」分组（不谎报），改显示「全部动作」');
  ok((chipsEmpty.match(/data-a="strPickEx"/g) || []).length === DATASET.length,
    '3.9 无历史矩阵也**不是空列表**（' + DATASET.length + ' 个动作全部可点）');
  ok(/练几次后这里会自动按常用度排序/.test(chipsEmpty), '3.10 无历史有引导文案说明为何没分组');

  /* 弹层：两组都完整可见（点选主路径步数不变） */
  const picker = sb.strExPickerHtml(sb.strCommonSet());
  ok(picker.indexOf('⭐ 常用') >= 0 && picker.indexOf('其它动作') > picker.indexOf('⭐ 常用'),
    '3.11 弹层：常用段在其它动作段之前');
  ok(picker.indexOf('二头弯举') < picker.indexOf('保加利亚深蹲'),
    '3.12 弹层：常用动作排在非常用动作之前');
  ok(picker.indexOf('保加利亚深蹲') >= 0 && picker.indexOf('站姿提踵') >= 0,
    '3.13 弹层里不常用动作**完整可见**（不折叠 → 主路径仍是一次点击）');
  ok((picker.match(/data-pickex="/g) || []).length === DATASET.length,
    '3.14 弹层卡片数 = 动作总数（' + DATASET.length + ' 张，一张不少）');
  ok(/ex-common-tag">⭐ 常用</.test(picker) && (picker.match(/ex-common-tag/g) || []).length === 3,
    '3.15 弹层里常用项带「⭐ 常用」小标记（3 个 = 常用数）');
  /* openStrExPicker 不返回元素（真实行为）：openModal 会把遮罩 append 到 body → 取 body 最后一个子节点 */
  sb.openStrExPicker();
  const modal = sb.document.body.children[sb.document.body.children.length - 1];
  ok(modal && modal.innerHTML.indexOf('🎯 选择动作') >= 0 && modal.innerHTML.indexOf('⭐ 常用') >= 0 && modal.innerHTML.indexOf('其它动作') >= 0,
    '3.16 openStrExPicker() 真的用分组版 HTML 渲染（接线未断）');
  ok(modal && modal.id === 'strExPicker' && (modal.innerHTML.match(/data-pickex="/g) || []).length === DATASET.length,
    '3.17 弹层渲染的卡片数仍为动作总数（id=strExPicker 未变）');
}

/* ================= 4. 一键复制：字段与手输完全一致 ================= */
function keysWithoutIds(e) {
  const o = {};
  Object.keys(e).filter(k => k !== 'id' && k !== 'createdAt').sort().forEach(k => { o[k] = e[k]; });
  return o;
}
{
  /* 4.1 手输路径（真跑 strSubmit）与复制路径逐字段比对 —— 普通动作 5kg×12 */
  const sb = makeSandbox([], ALL_EX);
  sb.document.getElementById('strExercise').value = '二头弯举';
  sb.document.getElementById('strTgtVal').textContent = '12';
  sb.document.getElementById('strActVal').textContent = '12';
  ok(sb.onStrengthEvent(sb.document.getElementById('strSubmit'), 'strSubmit', undefined) === true, '4.1a 手输路径仍可用（strSubmit 被处理）');
  const typed = sb.store.get('strength').entries[0];
  const clone = sb.strEntryPayload(typed, sb.today());
  ok(JSON.stringify(keysWithoutIds(clone)) === JSON.stringify(keysWithoutIds(typed)),
    '4.1b 复制产出的字段与手输**完全一致**（' + Object.keys(keysWithoutIds(typed)).join(',') + '）');
  ok(clone.weight === 5 && clone.targetReps === 12 && clone.actualReps === 12 && clone.exercise === '二头弯举' && clone.date === sb.today(),
    '4.1c 复制体的值 = 源记录的值（5kg × 12 次 × 二头弯举）');
  ok(!('id' in clone) && !('createdAt' in clone), '4.2 复制体不带 id/createdAt（由 addStr 生成新记录）');

  /* 4.3 等效重量动作（eqWeight / unit）字段形状一致 */
  const sbEq = makeSandbox([], ALL_EX.map(e => e.name === '哑铃飞鸟' ? mkEx('哑铃飞鸟', { eqWeight: 4, unit: 'rep' }) : e));
  sbEq.document.getElementById('strExercise').value = '哑铃飞鸟';
  sbEq.document.getElementById('strTgtVal').textContent = '15';
  sbEq.document.getElementById('strActVal').textContent = '15';
  sbEq.onStrengthEvent(sbEq.document.getElementById('strSubmit'), 'strSubmit', undefined);
  const typedEq = sbEq.store.get('strength').entries[0];
  const cloneEq = sbEq.strEntryPayload(typedEq, sbEq.today());
  ok(JSON.stringify(keysWithoutIds(cloneEq)) === JSON.stringify(keysWithoutIds(typedEq)) &&
    cloneEq.weight === 0 && cloneEq.eqWeight === 4 && cloneEq.unit === 'rep',
    '4.3 等效重量动作：字段与手输一致（weight=0 / eqWeight=4 / unit=rep）');
  const secClone = sbEq.strEntryPayload({ exercise: '平板支撑', eqWeight: 3, unit: 'sec', weight: 0, targetReps: 30, actualReps: 30 }, '2026-01-01');
  ok(secClone.unit === 'sec' && secClone.weight === 0 && secClone.eqWeight === 3 && secClone.date === '2026-01-01',
    '4.4 秒单位动作（unit=sec）原样保留，日期按传入覆写');

  /* 4.5 秒单位动作：源记录缺 unit 时兜底 rep（与手输同口径） */
  const noUnit = sb.strEntryPayload({ exercise: 'X', eqWeight: 2, weight: 0, targetReps: 5, actualReps: 5 }, 'd');
  ok(noUnit.unit === 'rep', '4.5 源记录缺 unit → 兜底 rep（与手输的 `exDef.unit||"rep"` 同口径）');

  /* 4.6 源记录缺 weight → 0（不产出 undefined，与手输 `_strSelW` 同族） */
  const noW = sb.strEntryPayload({ exercise: 'Y', targetReps: 5, actualReps: 5 }, 'd');
  ok(noW.weight === 0 && !('eqWeight' in noW), '4.6 普通动作缺 weight → 0，且不带 eqWeight/unit 键');
}

/* ================= 5. 一键复制：端到端（store 真写入 + 列表渲染） ================= */
{
  const sb = boot(makeSandbox(authorFixture(), ALL_EX));
  const before = sb.store.get('strength').entries.length;
  const lastSrc = sb.getStr(sb.today()).slice(-1)[0];
  const srcSnapshot = JSON.stringify(lastSrc);

  /* 5.1 列表末尾整行按钮 = 复制当前日期最后一条 */
  const html = sb.document.getElementById('strList').innerHTML;
  ok(/data-a="strRepeatLast"/.test(html) && html.indexOf('🔁 再来一组相同') >= 0,
    '5.1 列表末尾渲染「🔁 再来一组相同」整行按钮（作者场景的默认落点）');
  ok((html.match(/data-a="strRepeat"/g) || []).length === sb.getStr(sb.today()).length,
    '5.2 每条记录上都有 🔁（可复制**任意一组**）');
  const btn = makeEl('button'); btn.dataset.a = 'strRepeatLast';
  ok(sb.onStrengthEvent(btn, '', 'strRepeatLast') === true, '5.3 整行按钮被事件处理器接住');
  const after = sb.store.get('strength').entries;
  ok(after.length === before + 1, '5.4 一键复制真的落库（' + before + ' → ' + after.length + ' 条）');
  const dup = after[after.length - 1];
  ok(dup.id !== lastSrc.id && dup.createdAt >= lastSrc.createdAt, '5.5 新记录是**新**条目（新 id / 新 createdAt）');
  ok(JSON.stringify(keysWithoutIds(dup)) === JSON.stringify(keysWithoutIds(lastSrc)),
    '5.6 新记录字段与源记录一致（exercise/weight/targetReps/actualReps/date）');
  ok(JSON.stringify(sb.store.get('strength').entries.find(e => e.id === lastSrc.id)) === srcSnapshot,
    '5.7 源记录**未被改写**（复制不是原地改）');
  ok(toasts(sb).indexOf('已再来一组') >= 0, '5.8 有「已再来一组」反馈 toast');

  /* 5.9 指定某一条（不是最后一条）也能复制 */
  const firstId = sb.getStr(sb.today())[0].id;
  const b2 = makeEl('button'); b2.dataset.a = 'strRepeat'; b2.dataset.id = firstId;
  sb.onStrengthEvent(b2, '', 'strRepeat');
  const last = sb.store.get('strength').entries.slice(-1)[0];
  const firstSrc = sb.store.get('strength').entries.find(e => e.id === firstId);
  ok(last.exercise === firstSrc.exercise && last.weight === firstSrc.weight && last.actualReps === firstSrc.actualReps,
    '5.9 点某一条的 🔁 → 复制的是**那一条**（不是"总是最后一条"）');

  /* 5.10 不存在的 id / 空日期 不炸、有错误反馈 */
  const b3 = makeEl('button'); b3.dataset.a = 'strRepeat'; b3.dataset.id = '不存在的id';
  ok(sb.onStrengthEvent(b3, '', 'strRepeat') === true && toasts(sb).indexOf('已经不在了') >= 0,
    '5.10 复制不存在的 id → 提示而不是静默失败（无空 catch）');
  const sbEmpty = makeSandbox([], ALL_EX);
  ok(sbEmpty.strRepeatLast() === null && toasts(sbEmpty).indexOf('还没有可复制') >= 0,
    '5.11 当前日期没有记录 → 明确提示，不写脏数据');

  /* 5.12 复制遵循"查看中的日期"（与手输表单同口径） */
  const sbOld = boot(makeSandbox([mkEntry('二头弯举', -5, 5, 12)], ALL_EX));
  lex(sbOld, "_strDate='" + dstr(-5) + "'");
  const b4 = makeEl('button'); b4.dataset.a = 'strRepeatLast';
  sbOld.onStrengthEvent(b4, '', 'strRepeatLast');
  ok(sbOld.getStr(dstr(-5)).length === 2 && sbOld.getStr(sbOld.today()).length === 0,
    '5.12 复制落在**正在查看的日期**（与手输表单一致，不会偷跑到今天）');
}

/* ================= 6. 同动作连续组：默认带出上一次 ================= */
{
  const sb = makeSandbox(authorFixture(), ALL_EX);
  ok(lex(sb, '_strSelW') === 5, '6.0a 初始重量档位 = COMMON_W[4] = 5（改动前的基线）');
  lex(sb, '_strSelW=1');
  sb.pickStrExercise('二头弯举');
  ok(lex(sb, '_strSelW') === 5, '6.1 带出上一次的**重量**（1 → 5kg，重量网格跟着选中 5）');
  ok(sb.document.getElementById('strTgtVal').textContent === '12' && sb.document.getElementById('strActVal').textContent === '12',
    '6.2 带出上一次的**次数**（目标 12 / 实际 12）');
  const hint = sb.document.getElementById('strLastHint');
  ok(hint && /已带出上次/.test(hint.textContent) && /二头弯举/.test(hint.textContent),
    '6.3 表单里有「已带出上次」提示（用户能看出值是哪来的）');
  ok(hint.style.display !== 'none', '6.4 有历史 → 提示行可见');

  /* 6.5 从未练过的动作：不覆盖当前值，提示隐藏 */
  sb.document.getElementById('strTgtVal').textContent = '9';
  sb.pickStrExercise('站姿提踵');
  ok(sb.document.getElementById('strTgtVal').textContent === '9' && sb.strLastEntryOf('站姿提踵') === null,
    '6.5 没练过的动作不凭空造值（保持原样）');
  ok(sb.document.getElementById('strLastHint').textContent === '' && sb.document.getElementById('strLastHint').style.display === 'none',
    '6.6 没有"上一次"→ 提示行整行隐藏（不留空白）');

  /* 6.7 取的是**最近**一条（跨日期） */
  const sb2 = makeSandbox([mkEntry('二头弯举', -10, 5, 12), mkEntry('二头弯举', 0, 7, 8)], ALL_EX);
  sb2.pickStrExercise('二头弯举');
  ok(lex(sb2, '_strSelW') === 7 && sb2.document.getElementById('strTgtVal').textContent === '8',
    '6.7 带出的是该动作**最近一次**的重量/次数（7kg × 8 次，不是更早的 5kg × 12）');

  /* 6.8 自定义重量（不在 COMMON_W 里）→ 不动网格选择，但次数照带 */
  const sb3 = makeSandbox([mkEntry('二头弯举', 0, 7.5, 12)], ALL_EX);
  lex(sb3, '_strSelW=3');
  sb3.pickStrExercise('二头弯举');
  ok(lex(sb3, '_strSelW') === 3, '6.8 重量不在常用档位（7.5kg）→ 不强行改网格选择（避免选到不存在的档）');
  ok(sb3.document.getElementById('strTgtVal').textContent === '12', '6.9 次数照常带出（重量与次数独立兜底）');

  /* 6.10 等效重量动作：只带次数，重量由 eqWeight 派生 */
  const sbEq = makeSandbox([mkEntry('哑铃飞鸟', 0, 0, 15, { eqWeight: 4, unit: 'rep' })], ALL_EX.map(e => e.name === '哑铃飞鸟' ? mkEx('哑铃飞鸟', { eqWeight: 4 }) : e));
  lex(sbEq, '_strSelW=3');
  sbEq.pickStrExercise('哑铃飞鸟');
  ok(lex(sbEq, '_strSelW') === 3 && sbEq.document.getElementById('strTgtVal').textContent === '15',
    '6.10 等效重量动作：重量走 eqWeight 派生（不动网格），次数照带');

  /* 6.11 带出的值直接可用于"记录"（连记两组，字段与手输一致） */
  const sb4 = makeSandbox(authorFixture(), ALL_EX);
  sb4.pickStrExercise('二头弯举');
  sb4.document.getElementById('strActVal').textContent = '12';
  ok(sb4.onStrengthEvent(sb4.document.getElementById('strSubmit'), 'strSubmit', undefined) === true, '6.11a 带出后直接记录成功');
  const rec = sb4.getStr(sb4.today()).slice(-1)[0];
  ok(rec.weight === 5 && rec.targetReps === 12 && rec.actualReps === 12,
    '6.11b 连记第二组：5kg × 12 与上一组一致（作者场景：下一组同样组数重量）');
}

/* ================= 7. 不影响原有记录流程 ================= */
{
  const sb = boot(makeSandbox(authorFixture(), ALL_EX));
  const html = sb.document.getElementById('strList').innerHTML;
  ok(/data-a="strEdit"/.test(html) && /data-a="strDel"/.test(html), '7.1 ✏️ 编辑 / 🗑️ 删除入口仍在（原流程未删）');
  ok((html.match(/class="ec-act"/g) || []).length === sb.getStr(sb.today()).length * 3,
    '7.2 每条 = 🔁 + ✏️ + 🗑️ 三个 44px 按钮（热区沿用 .ec-act）');
  ok(/aria-label="再来一组相同"/.test(html), '7.3 🔁 是 emoji 按钮，带 aria-label（设计规范 §6.1）');

  const n0 = sb.store.get('strength').entries.length;
  const b = makeEl('button'); b.dataset.a = 'strDel'; b.dataset.id = sb.getStr(sb.today())[0].id;
  sb.onStrengthEvent(b, '', 'strDel');
  ok(sb.store.get('strength').entries.length === n0 - 1, '7.4 删除路径仍可用');

  ok(typeof sb.openStrEdit === 'function' && typeof sb.openMakeupDialog === 'function' && typeof sb.startStrPlan === 'function',
    '7.5 编辑弹层 / 补签 / 按计划训练 等既有入口函数都还在');

  /* 7.6 表单默认流程没有新增必填步骤：动作 + 次数 + 记录，路径不变 */
  const sb2 = boot(makeSandbox([], ALL_EX));
  sb2.document.getElementById('strExercise').value = '深蹲';
  sb2.document.getElementById('strTgtVal').textContent = '15';
  sb2.document.getElementById('strActVal').textContent = '15';
  sb2.onStrengthEvent(sb2.document.getElementById('strSubmit'), 'strSubmit', undefined);
  ok(sb2.store.get('strength').entries.length === 1 && sb2.store.get('strength').entries[0].weight === lex(sb2, '_strSelW'),
    '7.6 空历史下"动作 + 次数 + 记录"三步仍能一次落库（未新增必填项）');
  ok(sb2.document.getElementById('strList').innerHTML.indexOf('data-a="strRepeatLast"') >= 0,
    '7.7 刚记完就出现「🔁 再来一组相同」（作者：记完马上能再来一组）');

  /* 7.8 常用度即时刷新：练过的动作立刻升进常用 */
  const sb3 = boot(makeSandbox([mkEntry('深蹲', 0, 20, 15), mkEntry('深蹲', 0, 20, 15), mkEntry('卧推', 0, 30, 10), mkEntry('卧推', 0, 30, 10), mkEntry('划船', 0, 20, 10)], ALL_EX));
  const chipsBefore = sb3.document.getElementById('strSuggest').innerHTML;
  ok(chipsBefore.indexOf('深蹲') >= 0 && chipsBefore.indexOf('肩推') < 0,
    '7.8 打开页面时 chips 已按真实频次重排（常用在前，不常用被折叠）');
  sb3.pickStrExercise('肩推');
  sb3.document.getElementById('strActVal').textContent = '10';
  sb3.onStrengthEvent(sb3.document.getElementById('strSubmit'), 'strSubmit', undefined);
  ok(sb3.strCommonSet().stats.counts['肩推'] === 1, '7.9 新记录进入频次统计（练习次数 +1）');
  sb3.pickStrExercise('肩推');
  sb3.onStrengthEvent(sb3.document.getElementById('strSubmit'), 'strSubmit', undefined);
  ok(sb3.strCommonSet().common.some(r => r.name === '肩推'),
    '7.10 第二组落库后「肩推」自动升入常用（常用表随用随变，不是写死的）');

  /* 7.11 展开/收起开关 */
  const sb4 = boot(makeSandbox(authorFixture(), ALL_EX));
  const bMore = makeEl('button'); bMore.dataset.a = 'strMoreEx';
  const nChipBefore = (sb4.document.getElementById('strSuggest').innerHTML.match(/data-a="strPickEx"/g) || []).length;
  sb4.onStrengthEvent(bMore, '', 'strMoreEx');
  const nChipAfter = (sb4.document.getElementById('strSuggest').innerHTML.match(/data-a="strPickEx"/g) || []).length;
  ok(nChipBefore === 3 && nChipAfter === DATASET.length, '7.11 一次点击展开全部动作（可再收起）');
  sb4.onStrengthEvent(bMore, '', 'strMoreEx');
  ok((sb4.document.getElementById('strSuggest').innerHTML.match(/data-a="strPickEx"/g) || []).length === 3,
    '7.12 再点一次收回到折叠态');
}

/* ================= 8. 护栏 / 契约（CSS + 源码） ================= */
{
  ok(/\.ex-grp\{[^}]*font-size:var\(--fs-xs\)/.test(CSS), '8.1 .ex-grp 用既有字阶令牌（无新字号）');
  ok(/\.ex-common-tag\{[^}]*color:var\(--orange\)/.test(CSS) && /\.ex-common-tag\{[^}]*background:rgba\(var\(--brand-rgb\)/.test(CSS),
    '8.2 .ex-common-tag 用既有颜色令牌（无新颜色）');
  ok(/\.ex-suggest button\{[^}]*min-height:var\(--touch-min\)/.test(CSS),
    '8.3 折叠开关沿用 .ex-suggest button 的 --touch-min=44px 热区（不缩尺寸）');
  ok(/\.add-btn\.repeat\{[^}]*color:var\(--orange\)/.test(CSS) && /\.add-btn\.repeat\{[^}]*background:rgba\(var\(--brand-rgb\)/.test(CSS),
    '8.4 .add-btn.repeat 只换观感（令牌化），沿用 .add-btn 的舒适尺寸');
  ok(/\.ec-act\{[^}]*width:var\(--touch-min\)[^}]*height:var\(--touch-min\)/.test(CSS),
    '8.5 🔁 复用的 .ec-act 仍是 44×44 热区');

  const newBlock = SRC_STRENGTH.slice(SRC_STRENGTH.indexOf('v2.4.9 — 训练页两件功能'));
  ok(newBlock.length > 1000, '8.6 新代码段可定位（' + newBlock.length + ' 字符）');
  ok(!/font-size:\s*[0-9.]+\s*(px|rem|em)/.test(newBlock), '8.7 新代码里没有内联裸字号（全部 var(--fs-*)）');
  ok(!/\bcatch\b/.test(newBlock), '8.8 新代码里没有 catch（也就没有空 catch）');
  ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/.test(newBlock.replace(/\\u[0-9a-f]{4}/g, '')), '8.9 新代码里没有硬编码十六进制颜色（走令牌）');
  ok(/aria-label="再来一组相同"/.test(newBlock), '8.10 🔁 按钮的 aria-label 在源码里（不是靠 title）');
  ok(/strFreqStats/.test(newBlock) && /strSplitCommon/.test(newBlock) && /strEntryPayload/.test(newBlock) && /applyStrLastSet/.test(newBlock),
    '8.11 四个核心纯函数都在（频次统计 / 分组 / 复制字段 / 带出上次）');
  /* 口径常量集中在一处，改口径只改这里 */
  const freqDecl = /var STR_FREQ=\{[\s\S]*?\};/.exec(SRC_STRENGTH);
  ok(!!freqDecl && /windowDays:30/.test(freqDecl[0]) && /minWindowSets:5/.test(freqDecl[0]) &&
    /recentSets:30/.test(freqDecl[0]) && /minSetsForCommon:2/.test(freqDecl[0]) && /maxCommon:6/.test(freqDecl[0]),
    '8.12 频次口径集中在 STR_FREQ（30 天 / 薄样本 5 组 / 退化 30 组 / ≥2 组 / 上限 6）');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) console.log('失败项:\n  ' + fails.join('\n  '));
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/* v2.14.15 测试：敌群「自动战斗」升级为「自动连打下一关」
   作者澄清原话：「我说的自动战斗是指可以自动下一关，如果开启自动，则会一直自动战斗+自动下一关
   直到失败/手动关闭」。

   全部**真断言**，逐条对应规格（编号与任务书一致）：
     ① 胜利 → 自动进入下一关（`_groupStageId` 递增；开战走**同一个** `startGroupTrial()`）；
     ② 连打 3 关：每关的 `groupVictoryReward` / `markGroupStageCleared` **各 1 次**（逐关精确）；
     ③ 失败 → 立即停，且**不重试同一关**（不排队、不再开战、不发奖、不记通关）；
     ④ 已是最后一关 → 停 + **可见提示**（toast + 结算面板文案 + 开关 title）；
     ⑤ 手动关闭（⏸）→ 停，并**取消已排队的下一关**（关掉之后绝不再自己跳关）；
     ⑥ 切 tab / document.hidden / 关闭敌群战斗 → 整条链停且两个定时器都清零；
     ⑦ 安全阀：「起战失败」「关卡 id 未变」→ 立即停 + 记原因，**绝不重试**（无死循环）；
     ⑧ 自动状态跨关保持（不需要玩家再点 ▶）；
     ⑨ 手动模式完全不受影响（不排队 / 不跳关 / 奖励仍只 1 次）；
     ⑩ 结算展示：排队定时器 = `GROUP_AUTO_NEXT_MS`（1400ms ≤ 1.5s），且**先结算再开下一关**；
     ⑪ 改速度档不会把「排队中的下一关」弄丢（回归：cancelGroupAutoTimer 也清排队定时器）。

   沙箱口径：真实 store / battle-history / 战斗引擎 / 真实 `game-render.js` 与**真实
   `startGroupTrial`**（外面只套一层计数，证明连打命中的是同一个全局符号）。
   三处受控替身（都写明理由，且都不替换被测契约）：
     · `groupStageEnemies` → 木桩敌人（必胜 / 必败两套），让连打数值可复现（每关 ≥2 拍，
       这样「已进入下一关但还没打完」的状态可被断言）；
     · `getGameStats` → 拉满的属性（避免「玩家打不动木桩」这种与本题无关的失败）；
     · `groupVictoryReward` → 计数桩（真实实现依赖 skill-store.js，本沙箱未加载；
       本测试考的是「一关只发一次 / 记在对的关」，奖励数值本身由 test-skill-store.js 覆盖）。

   Run: node scripts/test-group-auto-next.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const read = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(actual, expected, msg) {
  ok(actual === expected, msg + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}
function fnBody(source, name) {
  const i = source.indexOf('function ' + name);
  if (i < 0) return '';
  const s = source.indexOf('{', i);
  let depth = 0, j = s;
  for (; j < source.length; j++) {
    const c = source[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < source.length && source[j] !== q) { if (source[j] === '\\') j++; j++; }
    }
  }
  return source.slice(s, j + 1);
}

/* ============================================================
   沙箱：与 test-group-auto.js 同一套（真实模块 + 可点桩），
   只多四样：toast 记录、按关计数的奖励/通关桩、木桩敌人、runUntil 驱动。
   ============================================================ */
const MODULES = ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
  'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
  'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
  'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
  'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js', 'game-render.js'];

function makeLS(seed) {
  const mem = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); },
    removeItem(k) { delete mem[k]; },
    clear() { Object.keys(mem).forEach(k => delete mem[k]); },
    _mem: mem
  };
}

function mkEl(id, attrs, text) {
  const cls = {};
  const el = {
    id: id || '', style: {}, dataset: {}, textContent: text || '', innerHTML: text || '', value: '',
    offsetWidth: 0, scrollTop: 0, scrollHeight: 0, handlers: {}, _attrs: Object.assign({}, attrs || {}),
    classList: {
      add(c) { cls[c] = 1; }, remove(c) { delete cls[c]; }, contains(c) { return !!cls[c]; },
      toggle(c, v) { if (v === undefined) v = !cls[c]; if (v) cls[c] = 1; else delete cls[c]; }
    },
    addEventListener(t, f) { (el.handlers[t] = el.handlers[t] || []).push(f); },
    removeEventListener() {},
    click() { (el.handlers.click || []).forEach(function (f) { f({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} }); }); },
    appendChild() {}, remove() {}, closest() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return el._attrs[k] == null ? null : el._attrs[k]; }
  };
  ((attrs && attrs['class']) || '').split(/\s+/).filter(Boolean).forEach(c => { cls[c] = 1; });
  Object.keys(attrs || {}).forEach(function (k) {
    if (k.indexOf('data-') === 0) {
      const name = k.slice(5).replace(/-([a-z])/g, (m, x) => x.toUpperCase());
      el.dataset[name] = attrs[k];
    }
  });
  return el;
}
function parseAttrs(s) {
  const out = {}; const rx = /([A-Za-z0-9_:\-]+)="([^"]*)"/g; let m;
  while ((m = rx.exec(s))) out[m[1]] = m[2];
  return out;
}

function makeHarness() {
  const ls = makeLS({});
  const logs = { warn: [], error: [], info: [] };
  const toasts = [];
  /* 按关计数：'g1-1' 各记一次才算合格（不是只数总数） */
  const calls = { stages: 0, start: [], reward: [], cleared: [], injuries: 0 };
  const timers = [];
  let timerSeq = 0;
  let mode = 'win';              /* 'win' → 木桩必败；'lose' → 铁壁木桩必杀玩家 */

  const panel = mkEl('panelOverlay', { 'class': 'panel-overlay' });
  const tabGame = mkEl('tabGame', { 'class': 'tab-content active' });
  const registry = {};            /* renderGroupOverlay 渲染出的按钮（id → 元素） */
  const ov = mkEl('battleOverlay', { 'class': 'battle-overlay' });
  Object.defineProperty(ov, 'innerHTML', {
    get() { return ov._html || ''; },
    set(h) {
      ov._html = String(h);
      Object.keys(registry).forEach(k => delete registry[k]);
      const rx = /<button\b([^>]*)>([\s\S]*?)<\/button>/g; let m;
      while ((m = rx.exec(ov._html))) {
        const attrs = parseAttrs(m[1]);
        if (!attrs.id) continue;
        const text = m[2].replace(/<[^>]*>/g, '').trim();
        const e = mkEl(attrs.id, attrs, text);
        e.innerHTML = m[2];
        registry[attrs.id] = e;
      }
    }
  });

  const doc = {
    hidden: false,
    events: {},
    getElementById(id) {
      if (id === 'battleOverlay') return ov;
      if (id === 'tabGame') return tabGame;
      if (id === 'panelOverlay') return panel;
      return registry[id] || null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return mkEl('', {}, ''); },
    body: { appendChild() {} },
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } },
    addEventListener(name, fn) { (doc.events[name] = doc.events[name] || []).push(fn); }
  };

  const sb = {
    JSON, Date, Math, parseInt, parseFloat, isNaN, isFinite,
    document: doc, localStorage: ls,
    setTimeout(fn, delay) { const id = ++timerSeq; timers.push({ id, fn, delay: delay || 0 }); return id; },
    clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval() { throw new Error('[测试] game-render 不应使用 setInterval（定时器必须是可清单个 setTimeout）'); },
    console: {
      log() {}, info(m) { logs.info.push(String(m)); }, debug() {},
      warn(...a) { logs.warn.push(a.map(String).join(' ')); },
      error(...a) { logs.error.push(a.map(String).join(' ')); }
    }
  };
  sb.window = sb; sb.globalThis = sb;
  sb.navigator = { clipboard: { writeText() { return { then() {} }; } } };
  sb._petBattlePicks = [];
  vm.createContext(sb);
  vm.runInContext(read('store.js'), sb, { filename: 'store.js' });
  vm.runInContext(read('battle-history.js'), sb, { filename: 'battle-history.js' });
  MODULES.forEach(function (f) {
    if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(read(f), sb, { filename: f });
  });

  /* toast 真实实现（utils.js）会盖掉沙箱里的同名函数 → 必须在模块加载**之后**覆写：
     既捕获文案（「已是最后一关」等可见提示），也避免它去操作沙箱里不存在的 #toastC。 */
  sb.toast = function (m, t) { toasts.push({ m: String(m), t: t || '' }); };

  /* --- 渲染副作用桩（只换「画面」，不换推进 / 结算 / 开战） --- */
  sb.renderGroupBattlePane = function () { return ''; };
  sb.playAttackFeedback = function () {};
  sb.gbShowSkillCast = function () {};
  sb.gbFxClear = function () {};
  sb.gbFxKillMarks = function () {};
  sb.showGroupStages = function () { calls.stages++; };
  sb.getPetStore = function () { return { pets: [] }; };
  sb.savePetStore = function () {};
  sb.applyDefeatInjuries = function () { calls.injuries++; return []; };

  /* 玩家属性拉满：本题只考「连打调度」，不想被「打不动木桩」这种数值问题干扰 */
  sb.getGameStats = function () { return { hp: 99999, atk: 100, def: 99999, spd: 10, soulAtk: 0, soulDef: 0 }; };
  /* 敌人：必胜 / 必败两套木桩（真实 createEnemyUnit 仍会跑，只是数值受控）。
     必胜木桩 hp=300（玩家继承后一击 ~53 → 每关约 6 拍），保证「已进入下一关但尚未打完」可断言。 */
  sb.groupStageEnemies = function () {
    return mode === 'win'
      ? [{ tier: 'minion', name: '木桩', level: 1, base: { hp: 300, atk: 0, def: 0, spd: 1 } }]
      : [{ tier: 'minion', name: '铁壁木桩', level: 1, base: { hp: 1e9, atk: 1e9, def: 1e9, spd: 1 } }];
  };
  /* 奖励计数桩（真实实现依赖 skill-store.js，本沙箱未加载；按关记名） */
  sb.groupVictoryReward = function () { calls.reward.push(sb._groupStageId); return { msg: '💠 技能点 +4' }; };
  /* 通关记录：**保留真实实现**（真写进度），外面套计数 → 连打 3 关后进度数组可精确比对 */
  const realMark = sb.markGroupStageCleared;
  sb.markGroupStageCleared = function (sid) { calls.cleared.push(sid); return realMark(sid); };
  /* 开战入口：**保留真实实现**，只套计数 —— 连打命中的就是玩家点关卡时用的同一个全局符号 */
  const realStart = sb.startGroupTrial;
  sb.startGroupTrial = function (gid) { calls.start.push(gid); return realStart(gid); };

  const h = {
    sb, ls, ov, tabGame, panel, doc, timers, calls, logs, toasts, registry,
    setMode(m) { mode = m; },
    el(id) { return doc.getElementById(id); },
    pending() { return timers.length; },
    runOldest() { const t = timers.shift(); if (!t) return null; t.fn(); return t; },
    drain(cap) {
      let n = 0;
      while (timers.length && n < (cap || 200)) { h.runOldest(); n++; }
      return n;
    },
    /* 跑到 cond() 为真（或定时器耗尽 / 到 cap） */
    runUntil(cond, cap) {
      let n = 0;
      while (!cond() && timers.length && n < (cap || 500)) { h.runOldest(); n++; }
      return n;
    },
    /* 打开自动并把**第一关打到胜利**（队列里出现下一关）——多处前置共用 */
    armQueue(stageId) {
      sb.startGroupTrial(stageId || 'g1-1');
      h.el('gbAuto').click();
      h.runUntil(function () { return !!sb._groupChainNext; }, 200);
      return sb._groupChainNext;
    }
  };
  return h;
}

const grSrc = read('game-render.js');
const appSrc = read('app.js');
const viewsSrc = read('game-views.js');

/* ============ A. 源码守卫：连打不复制任何入口 ============ */
console.log('--- A. 源码守卫：只调 startGroupTrial / 只有一个定时器清理点 ---');
{
  const chainBody = fnBody(grSrc, '_groupChainEnter');
  ok(chainBody.length > 0, '找到 _groupChainEnter（「排队中的下一关」的落地点）');
  ok(/startGroupTrial\(next\)/.test(chainBody), '连打落地调用的是**唯一开战入口** startGroupTrial(next)');
  ok(chainBody.indexOf('createGroupBattle') < 0, '连打落地**没有**自建战斗对象（源码里不得出现该建场函数名）');
  ok(chainBody.indexOf('groupBattleStep') < 0, '连打落地**没有**第二份引擎推进（不得出现 groupBattleStep）');
  ok(/groupAutoViewActive\(\)/.test(chainBody), '连打落地前复核「还在敌群视图里」（切 tab / 隐藏 / 关闭都不跳关）');
  ok(/closeGroupSettlementPanel\(\)/.test(chainBody), '开下一关前先收起结算面板（不盖住新战场）');
  ok(/try\{[\s\S]*catch\(e\)\{[\s\S]*console\.warn/.test(chainBody), '起战异常被捕获且落日志（不是空 catch）');

  const armBody = fnBody(grSrc, '_armGroupAutoNext');
  ok(armBody.length > 0, '找到 _armGroupAutoNext（结算后的唯一分叉点）');
  ok(armBody.indexOf('clearTimeout') < 0, '_armGroupAutoNext 不自己 clearTimeout（定时器只有 cancelGroupAutoTimer 一个清理点）');
  ok(/groupNextStageId\(/.test(armBody), '下一关 id 由 groupNextStageId() 统一算（与 allStageIds 同一份顺序表）');

  eq((grSrc.match(/clearTimeout\(_groupTimer\)/g) || []).length, 1, '「下一拍出手」定时器只有一处 clearTimeout（唯一清理点）');
  eq((grSrc.match(/clearTimeout\(_groupChainTimer\)/g) || []).length, 1, '「排队下一关」定时器只有一处 clearTimeout（唯一清理点）');
  const clearBody = fnBody(grSrc, 'cancelGroupAutoTimer');
  ok(/_groupTimer/.test(clearBody) && /_groupChainTimer/.test(clearBody), 'cancelGroupAutoTimer 同时清两个自动侧定时器');
  const stopBody = fnBody(grSrc, 'stopGroupAuto');
  ok(/_groupChainNext=null/.test(stopBody), 'stopGroupAuto 清空「排队中的下一关」（⏸ 之后不会再跳关）');

  ok(/startGroupTrial\(/.test(viewsSrc), '关卡列表的开战入口也是 startGroupTrial（同一个符号，非新入口）');
  const mNext = /GROUP_AUTO_NEXT_MS=(\d+)/.exec(grSrc);
  ok(!!mNext, 'GROUP_AUTO_NEXT_MS 有常量（自动模式的结算停留）');
  ok(!!mNext && Number(mNext[1]) <= 1500, '结算停留 ' + (mNext && mNext[1]) + 'ms ≤ 1.5s（规格⑤）');
  ok(/scheduleGroupOutro\(outro,showOutcome,800\)/.test(grSrc) && /scheduleGroupOutro\(outro,showStats,1200,deadline\)/.test(grSrc),
    '既有 outro 阶段值（800/1200ms）保持原样，未被连打改动');
}

/* ============ 1 + 8. 胜利 → 自动进入下一关；自动状态跨关保持 ============ */
console.log('--- 1/8. 胜利后自动进入下一关（_groupStageId 递增、同一个 startGroupTrial） ---');
{
  const h = makeHarness();
  h.setMode('win');
  h.sb.startGroupTrial('g1-1');
  eq(h.sb._groupStageId, 'g1-1', '前置：开战入口把 _groupStageId 设成 g1-1');
  const gb1 = h.sb._groupBattle;
  ok(!!gb1 && !gb1.done, '前置：拿到一场未结束的战斗');
  eq(h.el('gbAuto').getAttribute('data-auto-state'), 'off', '前置：自动默认关（data-auto-state="off"）');
  ok(h.el('gbAuto').textContent.indexOf('▶ 自动连打') === 0, 'UI：开关文案体现新语义「▶ 自动连打」（实际 ' + h.el('gbAuto').textContent + '）');
  ok(h.el('gbAuto')._attrs['class'].split(/\s+/).indexOf('gb-auto-btn') >= 0, '开关仍带 .gb-auto-btn（扁平描边沿用 v2.14.14）');

  h.el('gbAuto').click();                                   /* 开自动 */
  const n1 = h.runUntil(function () { return !!h.sb._groupChainNext; }, 300);
  ok(n1 > 1, '第一关是被「自动出手」一拍拍打完的（跑了 ' + n1 + ' 拍定时器）');
  ok(gb1.done && gb1.winner === 'ally', '① 第一关已胜利');
  eq(h.sb._groupStageId, 'g1-1', '① 结算时 _groupStageId 仍是 g1-1（奖励记在对的关）');
  eq(h.sb._groupChainNext, 'g1-2', '① 胜利后立即把下一关 g1-2 排进队列');
  ok(!!h.sb._groupChainTimer, '① 排队定时器已排上');
  ok(h.timers.some(t => t.delay === h.sb.GROUP_AUTO_NEXT_MS), '⑩ 排队定时器的 delay = GROUP_AUTO_NEXT_MS（' + h.sb.GROUP_AUTO_NEXT_MS + 'ms）');
  eq(h.el('gbAuto').getAttribute('data-auto-state'), 'next', 'UI：等待下一关时 data-auto-state="next"');
  ok(h.el('gbAuto').textContent.indexOf('⏳ 连打中') === 0, 'UI：等待下一关时文案「⏳ 连打中」（实际 ' + h.el('gbAuto').textContent + '）');

  h.runUntil(function () { return h.sb._groupStageId === 'g1-2'; }, 40);
  eq(h.sb._groupStageId, 'g1-2', '① 定时器到点后 _groupStageId 递增到 g1-2');
  eq(JSON.stringify(h.calls.start), '["g1-1","g1-2"]', '① 开战调用序列 = g1-1 → g1-2（同一个 startGroupTrial）');
  ok(h.sb._groupBattle !== gb1, '① 换成了**一个新的**战斗对象（没有复用已结束的那一场）');
  ok(!!h.sb._groupBattle && h.sb._groupBattle.done !== true, '① 新一关正在进行中（尚未打完）');
  eq(h.sb._groupAuto, true, '⑧ 自动状态跨关保持（不需要玩家再点 ▶）');
  eq(h.sb._groupChainNext, null, '落地后队列已清空');
  eq(h.el('gbAuto').getAttribute('aria-pressed'), 'true', '⑧ 新一关的开关仍是 aria-pressed="true"');
  ok(h.el('gbAuto').textContent.indexOf('⏸ 自动中') === 0, '⑧ 新一关文案「⏸ 自动中」（实际 ' + h.el('gbAuto').textContent + '）');
  eq(h.panel.classList.contains('open'), false, '⑩ 新一关开始前结算面板已收起（不盖住新战场）');
  ok(h.toasts.filter(t => /开始/.test(t.m)).length >= 2, '两关都弹了开战提示（第二关确实是新开的一场）');
  eq(h.calls.reward.join(','), 'g1-1', '① 第一关奖励只记 1 次（下一关还没打完，不能提前发）');
}

/* ============ 2. 连打 3 关：每关奖励 / 通关各 1 次 ============ */
console.log('--- 2. 连打 3 关：逐关奖励与通关记录各 1 次 ---');
{
  const h = makeHarness();
  h.setMode('win');
  h.sb.startGroupTrial('g1-1');
  h.el('gbAuto').click();
  h.runUntil(function () { return h.calls.cleared.length >= 3; }, 800);
  eq(h.calls.cleared.length, 3, '② 连打 3 关：通关记录恰好 3 次');
  eq(h.calls.cleared.join(','), 'g1-1,g1-2,g1-3', '② 通关记录逐关各 1 次（顺序精确）');
  eq(h.calls.reward.join(','), 'g1-1,g1-2,g1-3', '② 奖励逐关各 1 次（顺序精确，不丢不重）');
  eq(JSON.stringify(h.sb.getGroupProgress().cleared), '["g1-1","g1-2","g1-3"]', '② 进度数组精确 = 三关各一次');
  eq(h.sb._groupStageId, 'g1-3', '② 当前停在第 3 关');
  eq(h.sb._groupChainNext, 'g1-4', '② 第 4 关已排队（说明连打没有停）');
  eq(h.sb._groupAuto, true, '② 连打中途自动一直是开的');

  h.drain(40);                                              /* 再连打若干拍 */
  eq(h.calls.reward.filter(s => s === 'g1-1').length, 1, '② 继续连打：第 1 关奖励仍恰好 1 次');
  eq(h.calls.reward.filter(s => s === 'g1-2').length, 1, '② 继续连打：第 2 关奖励仍恰好 1 次');
  eq(h.calls.reward.filter(s => s === 'g1-3').length, 1, '② 继续连打：第 3 关奖励仍恰好 1 次');
  eq(h.calls.cleared.filter(s => s === 'g1-1').length, 1, '② 继续连打：第 1 关通关记录仍恰好 1 次');
  eq(h.calls.reward.length, h.calls.cleared.length, '② 奖励次数与通关次数始终一一对应（不跨关重复发奖）');
}

/* ============ 3. 失败 → 立即停，且不重试同一关 ============ */
console.log('--- 3. 失败即停且不重试同一关 ---');
{
  const h = makeHarness();
  h.setMode('lose');
  h.sb.startGroupTrial('g1-1');
  h.el('gbAuto').click();
  h.runUntil(function () { return !!h.sb._groupBattle && h.sb._groupBattle.done === true; }, 100);
  const gb = h.sb._groupBattle;
  eq(gb.winner, 'enemy', '③ 本场失败');
  eq(h.sb._groupAuto, false, '③ 失败 → 自动开关已关');
  eq(h.sb._groupChainNext, null, '③ 失败 → 不排队任何下一关');
  eq(h.sb._groupChainTimer, null, '③ 失败 → 排队定时器为 null');
  eq(h.sb._groupTimer, null, '③ 失败 → 出手定时器为 null');
  eq(h.calls.cleared.length, 0, '③ 失败 → 不记通关');
  eq(h.calls.reward.length, 0, '③ 失败 → 不发奖励');
  ok(h.sb._groupAutoStopNote.indexOf('失败') >= 0, '③ 停止原因已记录（' + h.sb._groupAutoStopNote + '）');
  ok(h.logs.info.some(l => /失败/.test(l)), '③ 停止原因进了日志（不静默停止）');
  ok(h.el('gbAuto').textContent.indexOf('▶ 自动连打') === 0, '③ 失败后文案回到「▶ 自动连打」');

  const startN = h.calls.start.length, stage = h.sb._groupStageId;
  h.drain(300);
  eq(h.calls.start.length, startN, '③ 失败后把定时器全跑完：没有再调 startGroupTrial（不重试同一关）');
  eq(h.calls.cleared.length, 0, '③ 失败后仍没有通关记录');
  eq(h.sb._groupStageId, stage, '③ 失败后关卡 id 不变（没有偷偷换关重打）');
}

/* ============ 4. 已是最后一关 → 停 + 可见提示 ============ */
console.log('--- 4. 最后一关：停 + 可见提示「已是最后一关」 ---');
{
  const h = makeHarness();
  h.setMode('win');
  const all = h.sb.allStageIds();
  const last = all[all.length - 1];
  ok(!!last, '前置：能取到最后一关 id（' + last + '）');
  h.sb.startGroupTrial(last);
  eq(h.sb._groupStageId, last, '前置：开战入口把 _groupStageId 设成最后一关');
  h.el('gbAuto').click();
  h.runUntil(function () { return !!h.sb._groupBattle && h.sb._groupBattle.done === true; }, 200);
  eq(h.sb._groupBattle.winner, 'ally', '④ 最后一关胜利');
  eq(h.sb._groupAuto, false, '④ 已是最后一关 → 自动停');
  eq(h.sb._groupChainNext, null, '④ 没有排队任何下一关（不会越界）');
  eq(h.sb._groupChainTimer, null, '④ 排队定时器为 null');
  ok(h.toasts.some(t => /已是最后一关/.test(t.m)), '④ 有可见提示 toast「已是最后一关」');
  ok(/已是最后一关/.test(h.sb._groupOutcomeMessage), '④ 结算面板文案含「已是最后一关」（' + h.sb._groupOutcomeMessage + '）');
  ok(/已是最后一关/.test(h.sb._groupAutoStopNote), '④ 停止原因 = 已是最后一关');
  const btn = h.el('gbAuto');
  eq(btn.getAttribute('data-auto-state'), 'off', '④ 开关回到 off 态');
  ok(/已是最后一关/.test(btn.getAttribute('title')), '④ 开关 title 里写明停止原因（不静默）');
  const startN = h.calls.start.length;
  h.drain(300);
  eq(h.calls.start.length, startN, '④ 最后一关之后不再开新关');
}

/* ============ 5. 手动关闭（⏸）取消「已排队的下一关」 ============ */
console.log('--- 5. ⏸ 取消已排队的下一关（关掉后不再跳关） ---');
{
  const h = makeHarness();
  h.setMode('win');
  eq(h.armQueue('g1-1'), 'g1-2', '⑤ 前置：第一关胜利后 g1-2 已排队');
  ok(!!h.sb._groupChainTimer, '⑤ 前置：排队定时器已排上');
  const rewardBefore = h.calls.reward.length;

  h.el('gbAuto').click();                         /* 结算等待中点 ⏸ */
  eq(h.sb._groupAuto, false, '⑤ 点⏸ → 自动立即停');
  eq(h.sb._groupChainNext, null, '⑤ 点⏸ → 排队中的下一关被取消');
  eq(h.sb._groupChainTimer, null, '⑤ 点⏸ → 排队定时器已清');
  eq(h.sb._groupTimer, null, '⑤ 点⏸ → 出手定时器已清');
  ok(/玩家点了⏸/.test(h.sb._groupAutoStopNote), '⑤ 停止原因 = 玩家点了⏸（' + h.sb._groupAutoStopNote + '）');
  const startN = h.calls.start.length;
  h.drain(400);
  eq(h.calls.start.length, startN, '⑤ 关掉后把定时器全跑完：**没有自己跳关**');
  eq(h.sb._groupStageId, 'g1-1', '⑤ 关卡停在 g1-1');
  eq(h.sb._groupBattle.winner, 'ally', '⑤ 第一关的战果保留（已结算不丢）');
  eq(h.calls.reward.length, rewardBefore, '⑤ 已结算的奖励保留且没有多发');
  ok(h.el('gbAuto').textContent.indexOf('▶ 自动连打') === 0, '⑤ 文案回到「▶ 自动连打」');
}

/* ============ 6. 切 tab / 页面隐藏 / 关闭 → 整条链停，定时器清零 ============ */
console.log('--- 6. 切 tab / document.hidden / 关闭 → 链停且定时器清零 ---');
{
  /* 6a document.hidden（visibilitychange） */
  const h = makeHarness();
  h.setMode('win');
  eq(h.armQueue('g1-1'), 'g1-2', '6a 前置：下一关已排队');
  h.doc.hidden = true;
  (h.doc.events['visibilitychange'] || []).forEach(fn => fn());
  eq(h.sb._groupAuto, false, '6a 页面隐藏 → 自动停');
  eq(h.sb._groupChainNext, null, '6a 页面隐藏 → 队列清空');
  eq(h.sb._groupTimer, null, '6a 页面隐藏 → 出手定时器为 null');
  eq(h.sb._groupChainTimer, null, '6a 页面隐藏 → 排队定时器为 null');
  const startN = h.calls.start.length;
  h.drain(300);
  eq(h.calls.start.length, startN, '6a 页面隐藏后把定时器跑完：不再开新关');
  eq(h.sb._groupStageId, 'g1-1', '6a 页面隐藏后关卡不变');

  /* 6b 切走「挑战」tab：视图守卫在排队定时器到点那一刻复核 */
  const h2 = makeHarness();
  h2.setMode('win');
  eq(h2.armQueue('g1-1'), 'g1-2', '6b 前置：下一关已排队');
  h2.tabGame.classList.remove('active');
  const startN2 = h2.calls.start.length;
  h2.drain(60);
  eq(h2.sb._groupAuto, false, '6b 切走 #tabGame → 定时器到点复核时自动已停');
  eq(h2.sb._groupChainNext, null, '6b 切走 tab → 队列清空');
  eq(h2.sb._groupTimer, null, '6b 切走 tab → 出手定时器为 null');
  eq(h2.sb._groupChainTimer, null, '6b 切走 tab → 排队定时器为 null');
  eq(h2.calls.start.length, startN2, '6b 切走 tab → 不自动跳关');
  ok(/离开敌群视图/.test(h2.sb._groupAutoStopNote), '6b 停止原因写明「离开敌群视图」（' + h2.sb._groupAutoStopNote + '）');

  /* 6c 关掉敌群战斗（✕） */
  const h3 = makeHarness();
  h3.setMode('win');
  eq(h3.armQueue('g1-1'), 'g1-2', '6c 前置：下一关已排队');
  h3.el('gbClose').click();
  eq(h3.sb._groupBattle, null, '6c ✕ → 战斗对象已释放');
  eq(h3.sb._groupAuto, false, '6c ✕ → 自动停');
  eq(h3.sb._groupChainNext, null, '6c ✕ → 队列清空');
  eq(h3.sb._groupTimer, null, '6c ✕ → 出手定时器为 null');
  eq(h3.sb._groupChainTimer, null, '6c ✕ → 排队定时器为 null');
  eq(h3.pending(), 0, '6c ✕ → 没有残留定时器（pending=' + h3.pending() + '）');

  /* 6d app.js 切 tab 的真实调用路径（源码 + 行为两条） */
  ok(/function switchTab[\s\S]{0,600}stopGroupAuto\(/.test(appSrc), '6d app.js 的 switchTab 里接了 stopGroupAuto');
  const h4 = makeHarness();
  h4.setMode('win');
  eq(h4.armQueue('g1-1'), 'g1-2', '6d 前置：下一关已排队');
  h4.sb.stopGroupAuto('切换 tab：training');      /* ＝ switchTab 非 game 分支做的事 */
  eq(h4.sb._groupAuto, false, '6d 切 tab → 自动停');
  eq(h4.sb._groupChainNext, null, '6d 切 tab → 排队中的下一关被取消');
  const startN4 = h4.calls.start.length;
  h4.drain(300);
  eq(h4.calls.start.length, startN4, '6d 切 tab 后把定时器跑完：不再开新关');
}

/* ============ 7. 安全阀：起战失败 / 关卡 id 未变 → 停且不重试 ============ */
console.log('--- 7. 安全阀：起战失败 / 关卡 id 未变 → 立即停 + 记原因 ---');
{
  /* 7a 起战失败（startGroupTrial 没有产生新战斗） */
  const h = makeHarness();
  h.setMode('win');
  eq(h.armQueue('g1-1'), 'g1-2', '7a 前置：下一关已排队');
  const gb1 = h.sb._groupBattle;
  let boom = 0;
  h.sb.startGroupTrial = function () { boom++; };        /* 模拟「起战失败」：不换战斗对象 */
  h.drain(60);
  eq(boom, 1, '7a 安全阀：队列到点只尝试开战 1 次（绝不重试）');
  eq(h.sb._groupAuto, false, '7a 起战失败 → 立即停');
  eq(h.sb._groupChainNext, null, '7a 起战失败 → 队列清空');
  eq(h.sb._groupChainTimer, null, '7a 起战失败 → 排队定时器为 null');
  eq(h.sb._groupBattle, gb1, '7a 起战失败 → 战斗对象没被换掉');
  eq(h.sb._groupStageId, 'g1-1', '7a 起战失败 → 关卡 id 回滚到 g1-1（不留「新关 id + 旧战斗」的坑）');
  eq(h.sb._groupRewarded, true, '7a 起战失败 → 幂等标记回滚为 true（已结算的那场不会被二次结算）');
  ok(/未能开战/.test(h.sb._groupAutoStopNote), '7a 停止原因写明「未能开战」（' + h.sb._groupAutoStopNote + '）');
  ok(h.toasts.some(t => /自动连打已停/.test(t.m)), '7a 玩家可见提示「自动连打已停」');
  ok(h.logs.info.concat(h.logs.warn).some(l => /未能开战|自动连打/.test(l)), '7a 停止原因进了日志（不静默）');
  h.drain(300);
  eq(boom, 1, '7a 之后再跑定时器也不再重试（无死循环）');

  /* 7b 「关卡 id 未变」：下一关已通关，真实 startGroupTrial 会早退 → 不得重试 */
  const h2 = makeHarness();
  h2.setMode('win');
  h2.sb.markGroupStageCleared('g1-2');           /* 人为把「下一关」标成已通关 */
  eq(h2.armQueue('g1-1'), 'g1-2', '7b 前置：已排队 g1-2（人为标成已通关）');
  const clearsBefore = h2.calls.cleared.length;
  h2.drain(80);
  eq(h2.calls.cleared.length, clearsBefore, '7b 关卡 id 未变：不会反复写通关（无死循环重试）');
  eq(h2.sb._groupAuto, false, '7b 关卡 id 未变 → 停');
  eq(h2.sb._groupStageId, 'g1-1', '7b 关卡 id 未变 → 回滚到 g1-1（旧战斗 + 新 stageId 的坑被堵住）');
  eq(h2.sb._groupChainNext, null, '7b 关卡 id 未变 → 队列清空');
  ok(/未能开战|未变/.test(h2.sb._groupAutoStopNote), '7b 停止原因可定位（' + h2.sb._groupAutoStopNote + '）');
  ok(h2.toasts.some(t => /该关卡已通关/.test(t.m)), '7b 用户看到既有提示「该关卡已通关 ✅」');
  ok(h2.pending() < 20, '7b 不残留大量定时器（pending=' + h2.pending() + '）');
}

/* ============ 9. 手动模式完全不受影响 ============ */
console.log('--- 9. 手动模式：不排队、不跳关、奖励仍只 1 次 ---');
{
  const h = makeHarness();
  h.setMode('win');
  h.sb.startGroupTrial('g1-1');
  eq(h.sb._groupAuto, false, '⑨ 手动模式：自动默认关');
  eq(h.el('gbAuto').getAttribute('data-auto-state'), 'off', '⑨ 手动模式：data-auto-state="off"');
  const gb = h.sb._groupBattle;
  let g = 0;
  while (!gb.done && g++ < 80) h.el('gbStep').click();   /* 全程手动点「⏭️ 下一回合」 */
  eq(gb.winner, 'ally', '⑨ 手动打完了第一关');
  eq(h.sb._groupAuto, false, '⑨ 手动模式：胜利后自动仍是关');
  eq(h.sb._groupChainNext, null, '⑨ 手动模式：不排队下一关');
  eq(h.sb._groupChainTimer, null, '⑨ 手动模式：没有排队定时器');
  eq(h.calls.cleared.join(','), 'g1-1', '⑨ 手动模式：只记本关通关 1 次');
  eq(h.calls.reward.join(','), 'g1-1', '⑨ 手动模式：只发本关奖励 1 次');
  const startN = h.calls.start.length;
  h.drain(300);
  eq(h.calls.start.length, startN, '⑨ 手动模式：定时器跑完也不会自动跳关');
  eq(h.sb._groupStageId, 'g1-1', '⑨ 手动模式：关卡不变');
  eq(h.sb._groupBattle, gb, '⑨ 手动模式：战斗对象仍是玩家打完的那一场');
}

/* ============ 11. 回归：改速度档不会把「排队中的下一关」弄丢 ============ */
console.log('--- 11. 改速度档不丢队列（cancelGroupAutoTimer 会清排队定时器） ---');
{
  const h = makeHarness();
  h.setMode('win');
  eq(h.armQueue('g1-1'), 'g1-2', '⑪ 前置：下一关已排队');
  h.el('gbSpeed4').click();
  eq(h.sb._groupChainNext, 'g1-2', '⑪ 改档（×4）后队列仍在');
  ok(!!h.sb._groupChainTimer, '⑪ 改档后排队定时器已重排');
  eq(h.sb._groupSpeed, 4, '⑪ 改档生效（_groupSpeed=4）');
  h.runUntil(function () { return h.sb._groupStageId === 'g1-2'; }, 60);
  eq(h.sb._groupStageId, 'g1-2', '⑪ 改档后仍然正常进入下一关');
  eq(h.sb._groupAuto, true, '⑪ 改档后自动仍是开的');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) fails.forEach(f => console.log(' ✗ ' + f));
process.exit(fail === 0 ? 0 : 1);

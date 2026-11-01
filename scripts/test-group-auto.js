#!/usr/bin/env node
/* v2.14.14 测试：敌群战斗「自动战斗」（作者需求原话：「敌群战斗增加自动战斗」）

   全部**真断言**（不是「没抛异常」），逐条对应任务书规格：

   1) 同一入口 —— 自动开关 / 定时器 / 手动「下一回合」都只调 `_groupStep()`（零参数）：
      · 源码守卫：`_groupAutoStep` 里只有 `_groupStep()`，没有第二份引擎推进（无 groupBattleStep）；
      · 运行期：把 `_groupStep` 换成计数包装后，点「▶ 自动」→ 1 次调用（0 参数），
        跑一拍定时器 → 再 1 次（0 参数），点「⏭️ 下一回合」→ 再 1 次（0 参数），
        三者命中**同一个全局符号**。项目曾因「复制一份入口」出过严重 bug
        （进度被写错关、奖励静默不结算），这条断言就是防它回归。
   2) 等价性 —— 同 seed 下「自动跑 N 拍」与「手动点 N 次」的**战斗状态完全一致**
      （回合 / 每单位 HP / 日志条数 / rng 状态）。
   3) 战斗结束自动停 + 定时器已清（`_groupTimer===null`；把剩余定时器全跑完也不再推进）。
   4) 切视图 / visibilitychange / 关 overlay / 切 tab 后停且清定时器。
   5) 奖励只发一次（自动推进 100 次 / 定时器尾拍 / 手动连点都不重复加）。
   6) 速度档 ×1/×2/×4 生效 + 持久化键独立（`dh-group-auto-speed`，不碰 `dh-battle-speed`）。
   7) 自动关闭后手动推进仍可用；aria-pressed / 文案随状态切换。
   8) 并发重入：`_groupAutoStepBusy` 为真时再调 `_groupStep()` 是 no-op（上一拍未完成不进下一拍）。

   Run: node scripts/test-group-auto.js */
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
   沙箱：真实 store.js / battle-history.js / 战斗引擎 / 真实 game-render.js
   —— 只把**渲染副作用**换成可计数 / 可点击的桩（推进入口与结算保持真实实现）
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

function makeHarness(seedLS) {
  const ls = makeLS(seedLS);
  const logs = { warn: [], error: [], info: [] };
  const calls = { cleared: 0, reward: 0, stages: 0, injuries: 0 };
  const timers = [];
  let timerSeq = 0;

  const panel = mkEl('panelOverlay', { 'class': 'panel-overlay' });
  const tabGame = mkEl('tabGame', { 'class': 'tab-content active' });
  const registry = {};            /* renderGroupOverlay 渲染出的按钮（id → 元素） */
  const ov = mkEl('battleOverlay', { 'class': 'battle-overlay' });
  Object.defineProperty(ov, 'innerHTML', {
    get() { return ov._html || ''; },
    set(h) {
      ov._html = String(h);
      Object.keys(registry).forEach(k => delete registry[k]);
      /* 只解析 <button>：控制条上的所有可点控件都是按钮，够本测试用 */
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
    },
    toast() {}
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

  /* 渲染副作用桩（推进入口 / 结算 / 奖励幂等全部保持真实实现） */
  sb.renderGroupBattlePane = function () { return ''; };
  sb.playAttackFeedback = function () {};
  sb.gbShowSkillCast = function () {};
  sb.gbFxClear = function () {};
  sb.gbFxKillMarks = function () {};
  sb._openDetailPanel = function () {};
  sb.showGroupResultPanel = function () {};
  sb.showGroupStages = function () { calls.stages++; };
  sb.markGroupStageCleared = function () { calls.cleared++; return { firstClear: true, nextStage: 'g1-2' }; };
  sb.groupVictoryReward = function () { calls.reward++; return { msg: '💠 技能点 +4' }; };
  sb.getPetStore = function () { return { pets: [] }; };
  sb.savePetStore = function () {};
  sb.applyDefeatInjuries = function () { calls.injuries++; return []; };

  const h = {
    sb, ls, ov, tabGame, panel, doc, timers, calls, logs, registry,
    el(id) { return doc.getElementById(id); },
    pending() { return timers.length; },
    /* 跑掉最早的一个定时器（= 自动战斗的下一拍 / 结算面板的展示阶段） */
    runOldest() { const t = timers.shift(); if (!t) return null; t.fn(); return t; },
    drain(cap) {
      let n = 0;
      while (timers.length && n < (cap || 200)) { h.runOldest(); n++; }
      return n;
    }
  };
  return h;
}

/* 造一场真战斗（同 seed 完全可复现：敌人建场也传独立种子 rng） */
function buildBattle(h, opts) {
  opts = opts || {};
  const sb = h.sb;
  const player = sb.createUnit({
    id: 'player', side: 'ally', name: '🧑 你', level: 1,
    base: { hp: opts.hp || 4000, atk: opts.atk || 300, def: 50, spd: 10, soulAtk: 0, soulDef: 0 }
  });
  const enemies = [];
  const n = opts.enemies || 2;
  for (let i = 0; i < n; i++) {
    enemies.push(sb.createEnemyUnit({
      id: 'enemy-' + i, tier: 'minion', name: '魔像' + (i + 1),
      base: { hp: opts.ehp || (opts.smallFoes ? 40 : 3000), atk: 5, def: 1, spd: 5 },
      rng: sb.makeSeededRng((opts.seed || 12345) + i * 977)
    }));
  }
  return sb.createGroupBattle({ allies: [player], enemies: enemies, seed: opts.seed || 12345 });
}
/* 把战斗挂到真实的 game-render 状态上，并真实渲染一次（绑上 #gbAuto / #gbSpeed1..4 / #gbStep） */
function startBattle(h, opts) {
  const gb = buildBattle(h, opts);
  h.sb._groupBattle = gb;
  h.sb._groupStageId = opts && opts.stageId !== undefined ? opts.stageId : 'g1-1';
  h.sb._groupRewarded = false;
  h.sb._groupOutcomeMessage = '';
  h.sb._groupTimer = null;
  h.sb._gbOutroActive = null;
  h.sb._gbOutroGeneration = 0;
  h.sb._groupActing = null;
  h.sb._groupPaused = false;
  h.sb._groupAuto = false;
  h.sb._groupAutoSpeed = 2;
  h.sb._groupSpeed = 2;
  h.sb._groupAutoStepBusy = false;
  h.ov.classList.add('open');
  h.sb.renderGroupOverlay(true);
  return gb;
}
/* 战斗状态指纹（等价性比对用） */
function fingerprint(h, gb) {
  const snap = h.sb.groupSnapshot(gb);
  return JSON.stringify({
    turn: gb.turn, done: !!gb.done, winner: gb.winner || null,
    log: gb.log.length,
    rng: snap ? snap.rngState : null,
    hp: (gb.units || []).map(u => u.id + ':' + u.hp),
    statuses: (gb.units || []).map(u => u.id + ':' + (u.statuses || []).map(s => s.id).join('+'))
  });
}
/* 把 _groupStep 换成计数包装（证明自动/手动命中**同一个**全局符号） */
function spyStep(h) {
  const orig = h.sb._groupStep;
  const rec = [];
  h.sb._groupStep = function () { rec.push(arguments.length); return orig.apply(null, arguments); };
  return rec;
}

const grSrc = read('game-render.js');
const appSrc = read('app.js');
const css = read('index.css');

/* ============ 1. 同一入口：源码守卫 + 运行期计数 ============ */
console.log('--- 1. 自动 / 手动走同一个 _groupStep() ---');
{
  const tick = fnBody(grSrc, '_groupAutoStep');
  ok(tick.length > 0, '找到 _groupAutoStep（定时器那一拍）');
  ok(tick.indexOf('_groupStep()') >= 0, '_groupAutoStep 里调用的是 _groupStep()');
  ok(tick.indexOf('groupBattleStep') < 0, '_groupAutoStep 内没有第二份引擎推进（不得出现 groupBattleStep）');
  ok(tick.indexOf('_groupDone') < 0, '_groupAutoStep 内不自己收尾（结算必须走唯一入口）');
  ok((tick.match(/_groupStep\(\)/g) || []).length === 1, '_groupAutoStep 只调一次 _groupStep()');

  const stepBody = fnBody(grSrc, '_groupStep');
  ok(stepBody.length > 0, '找到 _groupStep（唯一推进入口）');
  ok(stepBody.indexOf('_groupAutoStepBusy') >= 0, '_groupStep 入口有单拍重入守卫（_groupAutoStepBusy）');
  ok(/finally\s*\{/.test(stepBody), '_groupStep 用 try/finally 释放重入守卫（中途 return 也不会卡死）');
  ok(!/setInterval\(/.test(grSrc), 'game-render.js 不用 setInterval（定时器必须可清单个清理）');
  /* 定时器仍由 _groupSpeed 驱动（test-auto-speed.js 的对照组守卫同源） */
  ok(/setTimeout\([^;]*_groupSpeed\s*\)/.test(grSrc), '自动这一拍仍是 setTimeout(.../_groupSpeed)');

  /* 运行期：点开关 / 跑一拍 / 点手动 → 计数与参数都证明是同一个入口 */
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, ehp: 3000 });
  const rec = spyStep(h);
  const autoBtn = h.el('gbAuto');
  ok(!!autoBtn, '控制条渲染出 #gbAuto（自动开关）');
  ok(!!h.el('gbStep'), '控制条渲染出 #gbStep（手动推进）');
  ok(!!h.el('gbSpeed1') && !!h.el('gbSpeed2') && !!h.el('gbSpeed4'), '控制条渲染出 ×1/×2/×4 三个速度档');

  autoBtn.click();
  eq(rec.length, 1, '点「▶ 自动」→ _groupStep 被调用 1 次');
  eq(rec[0], 0, '自动调用传 0 个参数（与手动按钮同签名）');
  eq(h.sb._groupAuto, true, '开关状态 = 开');

  h.runOldest();
  eq(rec.length, 2, '定时器一拍 → _groupStep 再被调用 1 次');
  eq(rec[1], 0, '定时器这一拍同样 0 参数');

  h.el('gbStep').click();
  eq(rec.length, 3, '点「⏭️ 下一回合」→ 同一个 _groupStep 再被调用 1 次');
  eq(rec[2], 0, '手动调用同样 0 参数');
  ok(gb.turn >= 1, '真实推进发生（回合号前进：' + gb.turn + '）');
}

/* ============ 2. 等价性：自动 N 拍 == 手动 N 次 ============ */
console.log('--- 2. 自动 N 拍与手动 N 次状态完全等价 ---');
{
  const N = 10;
  const spec = { hp: 4000, atk: 40, ehp: 3000, seed: 987654 };
  /* A：自动（开关 1 拍 + 定时器 9 拍） */
  const ha = makeHarness({});
  const gbA = startBattle(ha, spec);
  ha.el('gbAuto').click();
  for (let i = 1; i < N; i++) {
    const t = ha.runOldest();
    ok(!!t, '第 ' + (i + 1) + ' 拍排上了定时器');
  }
  /* B：手动（点 N 次「⏭️ 下一回合」） */
  const hb = makeHarness({});
  const gbB = startBattle(hb, spec);
  for (let i = 0; i < N; i++) hb.el('gbStep').click();

  ok(ha.sb._groupAuto === true, 'A 组处于自动模式');
  ok(hb.sb._groupAuto === false, 'B 组处于手动模式（自动关）');
  eq(gbA.turn, gbB.turn, '回合数一致');
  eq(gbA.log.length, gbB.log.length, '日志条数一致');
  eq(gbA.done, gbB.done, '胜负未分状态一致');
  eq(fingerprint(ha, gbA), fingerprint(hb, gbB), '同一 seed 下「自动 N 拍」与「手动点 N 次」的战斗状态完全一致');
  ok(gbA.turn >= 2, 'N 拍确实跨了多个回合（实际回合 ' + gbA.turn + '）');
}

/* ============ 3. 战斗结束自动停 + 定时器已清 ============ */
console.log('--- 3. 战斗结束自动停且清定时器 ---');
{
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, atk: 400, ehp: 40, smallFoes: true, enemies: 2 });
  h.el('gbAuto').click();
  let guard = 0;
  while (!gb.done && guard++ < 400) {
    if (!h.runOldest()) break;
  }
  ok(gb.done, '自动跑到了战斗结束（回合 ' + gb.turn + '，winner=' + gb.winner + '）');
  eq(gb.winner, 'ally', '本场是我方胜利（用于验奖励路径）');
  eq(h.sb._groupAuto, false, '战斗结束 → 自动开关已关（停止条件①）');
  eq(h.sb._groupTimer, null, '战斗结束 → _groupTimer 已清（无残留 timeout）');
  eq(h.el('gbAuto').getAttribute('aria-pressed'), 'false', '结算重绘后 #gbAuto 回到 aria-pressed="false"');
  ok(h.el('gbAuto').textContent.indexOf('▶ 自动') === 0, '结算重绘后按钮文案回到「▶ 自动」（实际 ' + h.el('gbAuto').textContent + '）');

  const turnAfter = gb.turn, logAfter = gb.log.length;
  h.drain(400);
  eq(gb.turn, turnAfter, '把剩余定时器全跑完，回合不再前进（定时器确实清掉了）');
  eq(gb.log.length, logAfter, '把剩余定时器全跑完，日志不再追加');
}

/* ============ 4. 切视图 / visibilitychange / 关 overlay / 切 tab → 停 + 清定时器 ============ */
console.log('--- 4. 离开敌群视图 / 页面隐藏 → 立即停 ---');
{
  /* 4a 页面隐藏（visibilitychange） */
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, atk: 40, ehp: 3000 });
  h.el('gbAuto').click();
  ok(h.pending() > 0, '自动模式排上了下一拍');
  const visFns = h.doc.events['visibilitychange'] || [];
  ok(visFns.length > 0, 'game-render.js 注册了 visibilitychange 监听');
  h.doc.hidden = true;
  visFns.forEach(fn => fn());
  eq(h.sb._groupAuto, false, '页面隐藏 → 自动开关已关');
  eq(h.sb._groupTimer, null, '页面隐藏 → _groupTimer 已清');
  const turn4a = gb.turn, log4a = gb.log.length;
  h.drain(200);
  eq(gb.turn, turn4a, '页面隐藏后把剩余定时器跑完：回合不动');
  eq(gb.log.length, log4a, '页面隐藏后把剩余定时器跑完：日志不追加');

  /* 4b overlay 被关掉（离开敌群视图）—— 拍前复核 groupAutoViewActive() */
  const h2 = makeHarness({});
  const gb2 = startBattle(h2, { hp: 4000, atk: 40, ehp: 3000 });
  h2.el('gbAuto').click();
  h2.ov.classList.remove('open');
  const turn4b = gb2.turn;
  h2.runOldest();
  eq(h2.sb._groupAuto, false, 'overlay 关闭 → 下一拍复核时自动已停');
  eq(h2.sb._groupTimer, null, 'overlay 关闭 → 定时器已清');
  eq(gb2.turn, turn4b, 'overlay 关闭 → 这一拍不推进战斗');

  /* 4c 切走「挑战」tab（app.js 的 switchTab 接线；这里验源码 + 视图守卫两条） */
  ok(/function switchTab[\s\S]{0,600}stopGroupAuto\(/.test(appSrc), 'app.js 的 switchTab 里接了 stopGroupAuto（切 tab 立即停）');
  const h3 = makeHarness({});
  const gb3 = startBattle(h3, { hp: 4000, atk: 40, ehp: 3000 });
  h3.el('gbAuto').click();
  h3.tabGame.classList.remove('active');
  const turn4c = gb3.turn;
  h3.runOldest();
  eq(h3.sb._groupAuto, false, '切走 #tabGame → 下一拍复核时自动已停（不偷偷打完一局）');
  eq(gb3.turn, turn4c, '切走 tab 后这一拍不推进战斗');

  /* 4d 用户点 ✕ 关闭敌群战斗 */
  const h4 = makeHarness({});
  const gb4 = startBattle(h4, { hp: 4000, atk: 40, ehp: 3000 });
  h4.el('gbAuto').click();
  h4.el('gbClose').click();
  eq(h4.sb._groupBattle, null, '✕ → 战斗对象已释放');
  eq(h4.sb._groupAuto, false, '✕ → 自动开关已关');
  eq(h4.sb._groupTimer, null, '✕ → 定时器已清');
  eq(h4.pending(), 0, '✕ → 没有残留定时器（pending=' + h4.pending() + '）');
}

/* ============ 5. 奖励只发一次（幂等） ============ */
console.log('--- 5. 自动推进 100 次，奖励只发一次 ---');
{
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, atk: 400, ehp: 40, smallFoes: true, enemies: 2 });
  h.el('gbAuto').click();
  let guard = 0;
  while (!gb.done && guard++ < 400) { if (!h.runOldest()) break; }
  ok(gb.done, '本场已结束（' + gb.winner + '）');
  eq(h.calls.reward, 1, '胜利奖励恰好发 1 次');
  eq(h.calls.cleared, 1, '通关标记恰好写 1 次');
  eq(h.sb._groupRewarded, true, '_groupRewarded 幂等标记已置位');

  const turnSettled = gb.turn, logSettled = gb.log.length;
  for (let i = 0; i < 100; i++) h.sb._groupStep();   /* 模拟「定时器尾拍 / 玩家连点」100 次 */
  h.drain(400);
  eq(h.calls.reward, 1, '再推进 100 次：奖励仍是 1 次（不重复加）');
  eq(h.calls.cleared, 1, '再推进 100 次：通关仍只写 1 次');
  eq(gb.turn, turnSettled, '结算后战斗状态冻结（回合不再变化）');
  eq(gb.log.length, logSettled, '结算后战斗中日志不再追加');
}

/* ============ 6. 速度档 ×1/×2/×4 + 持久化键独立 ============ */
console.log('--- 6. 速度档与持久化键 ---');
{
  const h = makeHarness({});
  const S = h.sb;
  eq(S.GROUP_AUTO_SPEED_KEY, 'dh-group-auto-speed', '自动战斗速度键名 = dh-group-auto-speed');
  ok(S.GROUP_AUTO_SPEED_KEY !== 'dh-battle-speed', '与关卡挑战的键 dh-battle-speed 不同（键名独立）');
  ok(S.GROUP_AUTO_SPEED_KEY !== 'dh-group-speed', '与敌群旧键 dh-group-speed 不同（互不覆盖）');
  eq(JSON.stringify(S.GROUP_AUTO_SPEEDS), '[1,2,4]', '档位集合 = ×1/×2/×4');

  /* 读口径：新键 > 旧键兜底 > 默认 ×2 */
  delete h.ls._mem['dh-group-auto-speed'];
  delete h.ls._mem['dh-group-speed'];
  delete h.ls._mem['dh-battle-speed'];
  eq(S.loadGroupAutoSpeed(), 2, '空存档 → 默认 ×2');
  h.ls._mem['dh-group-auto-speed'] = '4';
  eq(S.loadGroupAutoSpeed(), 4, '新键 = 4 → ×4');
  h.ls._mem['dh-group-auto-speed'] = '7';
  eq(S.loadGroupAutoSpeed(), 2, '新键非法值（7）→ 归一为默认 ×2');
  h.ls._mem['dh-group-auto-speed'] = '2';
  h.ls._mem['dh-group-speed'] = '8';
  eq(S.loadGroupAutoSpeed(), 2, '新键优先：旧键 8 不覆盖新键 2');
  delete h.ls._mem['dh-group-auto-speed'];
  eq(S.loadGroupAutoSpeed(), 4, '只有旧键 8 → 归一到 ×4（旧存档设置不丢）');
  delete h.ls._mem['dh-group-speed'];
  h.ls._mem['dh-battle-speed'] = '8';
  eq(S.loadGroupAutoSpeed(), 2, '关卡挑战键 dh-battle-speed 不影响敌群自动速度（互不牵连）');

  /* 点击档位：落盘 + 立即生效 + 下一拍间隔换算 */
  const gb = startBattle(h, { hp: 4000, atk: 40, ehp: 3000 });
  h.el('gbAuto').click();                       /* 自动开 → 排一拍 */
  [
    { id: 'gbSpeed1', sp: 1, expect: 700 },
    { id: 'gbSpeed2', sp: 2, expect: 350 },
    { id: 'gbSpeed4', sp: 4, expect: 175 }
  ].forEach(function (c) {
    h.el(c.id).click();
    eq(h.ls._mem['dh-group-auto-speed'], String(c.sp), '点 ×' + c.sp + ' → 落盘 ' + c.sp);
    eq(h.sb._groupAutoSpeed, c.sp, '点 ×' + c.sp + ' → _groupAutoSpeed 生效');
    eq(h.sb._groupSpeed, c.sp, '点 ×' + c.sp + ' → _groupSpeed（演出档位）同步');
    eq(h.el(c.id).getAttribute('aria-pressed'), 'true', '×' + c.sp + ' 按钮 aria-pressed="true"');
    eq(h.el('gbSpeed' + (c.sp === 1 ? 2 : 1)).getAttribute('aria-pressed'), 'false', '其它档位 aria-pressed="false"');
    const t = h.timers[h.timers.length - 1];
    ok(!!t, '×' + c.sp + ' 后排上了一拍');
    /* 气泡停顿时 900，单位行动 700；两者都随档位整除 */
    ok(t && (t.delay * c.sp === 700 || t.delay * c.sp === 900),
      '×' + c.sp + ' 的下一拍间隔 = 基准/' + c.sp + '（实际 ' + (t && t.delay) + 'ms，基准 700/900）');
  });
  ok(h.ls._mem['dh-battle-speed'] === '8', '点敌群速度档不会改写关卡挑战键 dh-battle-speed（仍为 8）');
  ok(gb.turn >= 1, '改档后战斗仍在正常推进（回合 ' + gb.turn + '）');
}

/* ============ 7. 关闭自动后手动仍可用 + aria 状态 ============ */
console.log('--- 7. 手动推进可用性 + aria-pressed 状态 ---');
{
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, atk: 40, ehp: 3000 });
  const autoBtn0 = h.el('gbAuto');
  eq(autoBtn0.getAttribute('aria-pressed'), 'false', '开战时「自动」默认关（aria-pressed="false"）');
  ok(autoBtn0.textContent.indexOf('▶ 自动') >= 0, '开战时文案「▶ 自动」（实际 ' + autoBtn0.textContent + '）');

  autoBtn0.click();
  eq(h.el('gbAuto').getAttribute('aria-pressed'), 'true', '点开 → aria-pressed="true"');
  ok(h.el('gbAuto').textContent.indexOf('⏸ 自动中') >= 0, '点开 → 文案「⏸ 自动中」');
  ok(h.el('gbAuto')._attrs['class'].split(/\s+/).indexOf('gb-auto-btn') >= 0, '开关带 .gb-auto-btn（扁平描边由 index.css 统一给）');

  const turnBefore = gb.turn;
  h.el('gbAuto').click();                        /* ⏸ */
  eq(h.sb._groupAuto, false, '点「⏸」→ 立即停');
  eq(h.sb._groupTimer, null, '点「⏸」→ 定时器已清');
  eq(h.el('gbAuto').getAttribute('aria-pressed'), 'false', '点「⏸」→ aria-pressed 回到 "false"');
  ok(h.el('gbAuto').textContent.indexOf('▶ 自动') >= 0, '点「⏸」→ 文案回到「▶ 自动」');
  ok(gb.turn >= turnBefore, '停止不影响已发生的进度');

  const logBefore = gb.log.length;
  h.el('gbStep').click();
  ok(gb.log.length > logBefore || gb.turn > turnBefore, '自动关闭后「⏭️ 下一回合」仍能推进（日志 ' + logBefore + ' → ' + gb.log.length + '）');

  /* 已结束的战斗不给「开自动」（不替玩家重开一局） */
  gb.done = true;
  h.el('gbAuto').click();
  eq(h.sb._groupAuto, false, '战斗已结束 → 点自动不会开启（不替玩家重开）');
}

/* ============ 8. 并发重入守卫 + 需要用户决策时降级为暂停 ============ */
console.log('--- 8. 重入守卫 / 决策时点降级暂停 ---');
{
  const h = makeHarness({});
  const gb = startBattle(h, { hp: 4000, atk: 40, ehp: 3000 });
  h.el('gbAuto').click();
  const logBefore = gb.log.length;
  h.sb._groupAutoStepBusy = true;          /* 模拟「上一拍未完成（出手动画/日志追加中）」 */
  h.sb._groupStep();
  eq(gb.log.length, logBefore, '上一拍未完成时，再来的这一步被丢弃（不并发重入）');
  h.sb._groupAutoStepBusy = false;

  /* 需要玩家决策：打开详情 → 自动降级为暂停（关掉开关，不替玩家继续） */
  h.el('gbAuto').click();
  ok(h.sb._groupAuto === false, '（前置）上一段结束时自动是关的');
  h.el('gbAuto').click();
  eq(h.sb._groupAuto, true, '重新开自动');
  /* 打开详情时**不抢着重绘**（紧跟其后就是 renderGroupDetail 的整屏替换） */
  const origRender = h.sb.renderGroupOverlay;
  let renders = 0;
  h.sb.renderGroupOverlay = function () { renders++; return origRender.apply(null, arguments); };
  h.sb.pauseGroupBattle();
  h.sb.renderGroupOverlay = origRender;
  eq(renders, 0, '打开详情（暂停自动）时不额外重绘 overlay（没有 DOM churn）');
  eq(h.sb._groupAuto, false, '打开详情（需要玩家决策）→ 自动停');
  eq(h.sb._groupTimer, null, '打开详情 → 定时器已清');
  h.sb.resumeGroupBattle();
  eq(h.sb._groupPaused, false, '关闭详情恢复 _groupPaused');
  eq(h.sb._groupAuto, false, '关闭详情**不会**自己续跑自动（不替玩家选）');
}

/* ============ 9. 扁平风 / 令牌（新增样式只用既有令牌） ============ */
console.log('--- 9. 样式：扁平 + 只用既有令牌 ---');
{
  const i = css.indexOf('v2.14.14 敌群「自动战斗」');
  ok(i > -1, 'index.css 有 v2.14.14 自动战斗样式块');
  /* 只比对**规则体**（注释里出现的「border-radius / box-shadow / gradient」是禁令说明，不算违规） */
  const start = css.lastIndexOf('/*', i);   /* 从注释块开头切，才能整块剥掉注释 */
  const blkRaw = css.slice(start, css.indexOf('.gb-auto-btn[aria-pressed="true"]', i) + 120);
  const blk = blkRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(blk.trim().length > 0, '样式块规则体非空（' + blk.trim().split('\n').length + ' 行）');
  ok(!/border-radius/.test(blk), '新增样式不含 border-radius（圆角 0）');
  ok(!/box-shadow/.test(blk), '新增样式无 box-shadow');
  ok(!/gradient/.test(blk), '新增样式无渐变');
  ok(!/font-size/.test(blk), '新增样式不引入字号（不新增字阶）');
  ok(!/#[0-9a-fA-F]{3,8}/.test(blk), '新增样式不写死颜色（只用令牌）');
  ok(/var\(--green\)/.test(blk), '按下态用既有语义令牌 var(--green)');
  ok(/var\(--sp-1\)/.test(blk), '速度档行距用既有间距令牌 var(--sp-1)');
  ok(/aria-pressed="true"/.test(blk), '按下态用属性选择器（视觉状态与无障碍状态同源）');
  ok(/\.speed-btn\{[^}]*min-height:var\(--touch-min\)/.test(css), '.speed-btn 热区仍是 var(--touch-min)=44px（未缩水）');
  ok(/\.speed-btn\{[^}]*border:var\(--bw\) solid/.test(css), '.speed-btn 边框仍是 2px 实线令牌 --bw');
  ok(/\.speed-btn\{[^}]*transition:[^;}]*75ms/.test(css), '.speed-btn 过渡仍 ≤75ms');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) fails.forEach(f => console.log(' ✗ ' + f));
process.exit(fail === 0 ? 0 : 1);

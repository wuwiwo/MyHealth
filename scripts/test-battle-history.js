#!/usr/bin/env node
/* v2.13.0 批次 B 测试：战斗历史（单敌 / 敌群）与分模式长期统计

   覆盖（全部真断言，不是「没抛异常」）：
     1) schema：拒绝 6 类非法形状（非对象 / version 不符 / battles 非数组 /
        条目缺字段 / 条目类型不符 / 条目数 > 100）+ 合法形状的正向对照
     2) 旧档无键 → 空列表 + 空统计（winRate / avgRounds 为 null，而不是 0）
     3) 100 条 FIFO（append 105 条 → 长度 100、最旧被淘汰、顺序正确）
     4) 幂等（同 id 二次 append 不翻倍；同场重复调用结算入口不写第二条）
     5) 写入失败可检测（配额抛 QuotaExceededError → ok:false + console.error +
        列表不出现未落盘的记录「假装成功」；对照组：store.get() 的内存缓存**确实**被污染）
     6) 统计口径（aborted 不计胜率分母 / 不打断连胜；count / winRate /
        currentStreak / bestStreak / avgRounds 逐项断言；分模式不合并）
     7) 接入点（真实 endBattle / endBattleAborted / _groupDone 驱动）：
        单敌胜/败/异常各一条；敌群胜/败各一条；重复结算不写第二条；
        历史写失败时奖励 / 进度 / 失败次数与成功路径**逐项一致**
     8) 单敌 playerHealed === null 且 UI 渲染出「不适用」；空历史走空状态文案

   另有判红模式（对旧代码基线给出新断言的判红证据）：
     node scripts/test-battle-history.js --red-evidence <目录>
   （目录内需有 `git show HEAD:page/game-battle.js` / `game-views.js` 的旧版本文件）

   Run: node scripts/test-battle-history.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'page');
const read = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + '（期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + '）'); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + '（期望 ' + b + '，实际 ' + a + '）'); }
function section(t) { console.log('\n--- ' + t + ' ---'); }

/* ============================================================
   通用夹具
   ============================================================ */
/* 确定性 Math（rollLoot / 引擎随机不得让断言飘） */
function detMath() {
  const m = Object.create(Math);
  m.random = function () { return 0.5; };
  return m;
}
/* 内存 localStorage（可被单测改写 setItem 以模拟配额失败） */
function makeLS(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i]; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _m: map
  };
}
/* 最小 DOM 元素（惰性创建；innerHTML 就是字符串） */
function mkEl(id) {
  const cls = {};
  return {
    id, style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
    offsetWidth: 0, scrollTop: 0, scrollHeight: 0, handlers: {},
    classList: {
      add(c) { cls[c] = 1; }, remove(c) { delete cls[c]; },
      toggle(c, v) { if (v === undefined) v = !cls[c]; if (v) cls[c] = 1; else delete cls[c]; },
      contains(c) { return !!cls[c]; }
    },
    addEventListener(t, f) { this.handlers[t] = f; },
    click() { if (this.handlers.click) this.handlers.click({ preventDefault() {} }); },
    appendChild() {}, remove() {}, removeEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    closest() { return null; }, setAttribute() {}, getAttribute() { return null; }
  };
}
function lsThrowQuota(key) {
  const e = new Error('[测试] 配额耗尽');
  e.name = 'QuotaExceededError';
  throw e;
}

/* 数据层沙箱：store.js + battle-history.js（真实 store，真实 localStorage 桩） */
function makeHistorySandbox(opts) {
  opts = opts || {};
  const ls = makeLS(opts.seed);
  const logs = { error: [], warn: [] };
  const els = {};
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = mkEl(id); return els[id]; },
    createElement() { return mkEl('new'); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    body: { appendChild() {} }, addEventListener() {}
  };
  const sb = {
    JSON, Date, parseInt, parseFloat, isNaN, isFinite,
    Math: opts.math || detMath(),
    document: doc, localStorage: ls,
    setTimeout() { return 0; }, clearTimeout() {},
    console: {
      log() {},
      warn() { logs.warn.push(Array.prototype.map.call(arguments, String).join(' ')); },
      error() { logs.error.push(Array.prototype.map.call(arguments, String).join(' ')); }
    },
    toast() {}
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('store.js'), sb, { filename: 'store.js' });
  vm.runInContext(read('battle-history.js'), sb, { filename: 'battle-history.js' });
  return { sb, ls, els, logs, doc };
}

/* 冻结记录骨架 */
let idSeq = 0;
function mkRec(over) {
  const base = {
    id: 'r-' + (++idSeq),
    endedAt: '2026-01-01T00:00:00.000Z',
    mode: 'single',
    stageId: '1-1',
    result: 'win',
    rounds: 1,
    metrics: { playerDealt: 10, playerTaken: 2, playerHealed: null, terrain: null, dot: null, shield: null },
    party: [{ name: '你', dealt: 10, taken: 2, healed: null, alive: true }],
    note: null
  };
  const out = Object.assign({}, base, over || {});
  out.metrics = Object.assign({}, base.metrics, (over && over.metrics) || {});
  out.party = (over && over.party) ? over.party : base.party;
  return out;
}
/* 递增 ISO 时间（同一天内逐秒递增） */
function iso(n) { return new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(); }

/* 单敌接入沙箱：store.js + battle-history.js + game-battle.js（真实结算入口） */
const BE = (function () {
  const sb = { Math: detMath(), JSON, console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('levels.js'), sb, { filename: 'levels.js' });
  vm.runInContext(read('battle.js'), sb, { filename: 'battle.js' });   /* findLevel / buildBattleSides 的来源 */
  return { sb };
})();

function makeBattleHost(opts) {
  opts = opts || {};
  const base = makeHistorySandbox({ math: detMath() });
  const sb = base.sb;
  const game = { attempts: {}, cleared: [], current: '1-1' };
  const refine = { points: 0, unlocked: true };
  const calls = { trackLevel: [], celebrate: 0 };
  const timers = [];
  sb.setTimeout = function (fn) { timers.push(fn); return timers.length; };
  sb.clearTimeout = function () {};
  sb.getGame = function () { return game; };
  sb.setGame = function () {};
  sb.today = function () { return '2026-10-06'; };
  sb.getGameStats = function () { return { atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }; };
  sb.trackLevel = function (id) { calls.trackLevel.push(id); };
  sb.getRefine = function () { return refine; };
  sb.saveRefine = function (r) { refine.points = r.points; };
  sb.celebrate = function () { calls.celebrate++; };
  sb.showShareCard = function () {};
  sb.LEVELS = BE.sb.LEVELS;
  sb.findLevel = BE.sb.findLevel;
  base.els.battleOverlay = mkEl('battleOverlay');
  base.els.battleOverlay.classList.add('open');   // 战绩层推进需要「本场 overlay 仍打开」
  if (opts.failHistoryWrites) {
    const orig = base.ls.setItem;
    base.ls.setItem = function (k, v) {
      if (k === 'dh-battleHistory-v1') lsThrowQuota(k);
      return orig.call(this, k, v);
    };
  }
  vm.runInContext(opts.gameBattleSrc || read('game-battle.js'), sb, { filename: 'game-battle.js' });
  return {
    sb, ls: base.ls, els: base.els, logs: base.logs, timers, game, refine, calls,
    /* _battle 是 vm 顶层的 let 绑定 → 只能在上下文内部读写 */
    getBattle() { return vm.runInContext('_battle', sb); },
    snapshot() { return vm.runInContext('_battleEndSnapshot', sb); },
    /* 驱动真实 runBattle()：最后一次排队的 timer = 下一次 tick（演出动画的 timer 排在它前面） */
    flushLast() { const fn = timers.pop(); if (fn) fn(); return !!fn; },
    drive(battle, tickImpl) {
      sb.__b = battle; sb.battleTick = tickImpl;
      vm.runInContext('_battle=__b;_battleRunning=false;_battleAuto=false;_battleLevelId="1-1";runBattle()', sb);
      return vm.runInContext('_battle', sb);
    }
  };
}
function ghBattle(over) {
  const b = {
    player: { atk: 50, def: 30, hp: 300, maxHP: 300, soulAtk: 0, soulDef: 0 },
    enemy: { atk: 10, def: 5, hp: 100, maxHP: 100, soulAtk: 0, soulDef: 0 },
    level: { npc: '测试兵', boss: false }, affix: null,
    turn: 0, done: false, winner: null
  };
  if (over) for (const k in over) b[k] = over[k];
  return b;
}
/* 一个「结束本场」的 tick 实现：伤害事件按给定数组返回 */
function endingTick(events, turn, winner) {
  return function (bb) {
    bb.turn = turn;
    bb.done = true;
    bb.winner = winner;
    return { turn: turn, events: events };
  };
}

/* 敌群接入沙箱：真实 game-render.js（含真实 groupBattleStats / showGroupResultPanel）+ game-battle.js */
const GROUP_MODULES = ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
  'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
  'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
  'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
  'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js',
  'game-render.js', 'game-battle.js'];

function makeGroupHost(opts) {
  opts = opts || {};
  const base = makeHistorySandbox({ math: detMath() });
  const sb = base.sb;
  const timers = [];
  const calls = { cleared: 0, reward: 0, stages: 0, injuries: 0 };
  sb.setTimeout = function (fn) { timers.push(fn); return timers.length; };
  sb.clearTimeout = function () {};
  GROUP_MODULES.forEach(function (f) {
    if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(read(f), sb, { filename: f });
  });
  /* 只把「重渲染 / 副作用」换成可计数的桩；结算与统计保持真实实现 */
  sb.gbFxClear = function () {};
  sb.renderGroupOverlay = function () {};
  sb.markGroupStageCleared = function () { calls.cleared++; return { firstClear: true, nextStage: 'g1-2' }; };
  sb.groupVictoryReward = function () { calls.reward++; return { msg: '💠 技能点 +4' }; };
  sb.showGroupStages = function () { calls.stages++; };
  sb.getPetStore = function () { return { pets: [] }; };
  sb.applyDefeatInjuries = function () { calls.injuries++; return ['🐾 星尘']; };
  sb.savePetStore = function () {};
  sb.toast = function () {};
  if (opts.failHistoryWrites) {
    const orig = base.ls.setItem;
    base.ls.setItem = function (k, v) {
      if (k === 'dh-battleHistory-v1') lsThrowQuota(k);
      return orig.call(this, k, v);
    };
  }
  return {
    sb, ls: base.ls, els: base.els, logs: base.logs, timers, calls,
    setBattle(gb, stageId) {
      sb._groupBattle = gb; sb._groupStageId = stageId;
      sb._groupRewarded = false; sb._groupOutcomeMessage = '';
      sb._groupTimer = null; sb._gbOutroActive = null; sb._gbOutroGeneration = 0;
      sb._groupActing = null; sb._groupPaused = false; sb._detailRestore = null;
    },
    flushLast() { const fn = timers.pop(); if (fn) fn(); return !!fn; },
    panel() { return base.els.panelOverlay ? base.els.panelOverlay.innerHTML : ''; }
  };
}
/* 构造一场已结束的群战（真实 createUnit / createGroupBattle + 真实事件形态日志） */
function buildGroupGb(S, winner, opts) {
  opts = opts || {};
  const mk = (id, name, side, hp) => S.createUnit({ id, side, name, base: { hp, atk: 10, def: 10, spd: 10 } });
  const player = mk('player', '你', 'ally', 300);
  const e1 = mk('enemy-0', '敌1', 'enemy', 150);
  const allies = [player];
  if (opts.dup) allies.push(S.createUnit({ id: 'pet-1', side: 'ally', name: '你', base: { hp: 100, atk: 5, def: 5, spd: 3 } }));
  const gb = S.createGroupBattle({ allies: allies, enemies: [e1] });
  gb.log = [
    { turn: 1, unit: '你', events: [
      { msg: '⚔️ 你 攻击 敌1 → 40 伤害', type: 'damage', targetId: 'enemy-0' },
      { msg: '🛡️ 你 护盾吸收 12', type: 'status', targetId: 'player' },
      { msg: '💚 你 → 你 治疗 +8', type: 'heal', targetId: 'player' }
    ] },
    { turn: 2, unit: '敌1', events: [
      { msg: '☠️ 中毒: -6', type: 'dot', targetId: 'player' },
      { msg: '🪨 你 受碎石伤害 5', type: 'terrain' }
    ] }
  ];
  gb.turn = 2;
  gb.winner = winner;
  gb.done = true;
  return gb;
}

/* ============================================================
   判红模式：对旧代码基线跑新断言，证明断言有判别力
   ============================================================ */
if (process.argv[2] === '--red-evidence') {
  const dir = process.argv[3];
  if (!dir) { console.log('用法: node scripts/test-battle-history.js --red-evidence <目录>'); process.exit(2); }
  const oldGameBattle = fs.readFileSync(path.join(dir, 'game-battle.js'), 'utf8');
  const oldGameViews = fs.readFileSync(path.join(dir, 'game-views.js'), 'utf8');
  console.log('基线目录: ' + dir);
  let discriminated = 0, notDiscriminated = 0;
  function redCheck(label, expectation, actual) {
    /* 判红成立 = 新断言在旧代码基线上**不通过**（旧代码的实际值 ≠ 新断言要求的值） */
    if (actual !== expectation) {
      discriminated++;
      console.log(' ✗ 判红成立：' + label + ' —— 新断言要求 ' + JSON.stringify(expectation) + '，旧代码实际 ' + JSON.stringify(actual));
    } else {
      notDiscriminated++;
      console.log(' ✓ 旧代码已满足该断言（无判别力，需要换一条）：' + label + ' —— 旧代码实际 = ' + JSON.stringify(actual));
    }
  }
  /* ① 单敌胜利必须写一条历史记录（旧 game-battle.js 完全不接历史） */
  let oldSingleLen = 'throw';
  try {
    const H = makeBattleHost({ gameBattleSrc: oldGameBattle });
    H.drive(ghBattle(), endingTick([
      { type: 'damage', sourceSide: 'player', targetSide: 'enemy', amount: 30, hpDamage: 30, msg: '你 → 敌 30' }
    ], 1, true));
    oldSingleLen = H.sb.battleHistoryList().length;
  } catch (e) { console.log('   （旧 game-battle.js 夹具异常：' + e.message + '）'); }
  redCheck('单敌胜利写一条历史记录', 1, oldSingleLen);

  /* ② 记录视图必须有「⚔️ 战斗记录」区块（旧 game-views.js 没有） */
  let oldHasBlock = 'throw';
  try {
    const U = makeHistorySandbox();
    U.sb.getGameStats = function () { return { atk: 1, def: 1, hp: 1, soulAtk: 0, soulDef: 0 }; };
    U.sb.battleHistoryAppend(mkRec({ id: 'u1', result: 'win' }));
    vm.runInContext(oldGameViews, U.sb, { filename: 'game-views.js' });
    U.sb.renderRecordView();
    oldHasBlock = /战斗记录/.test(U.els.gameRecordView.innerHTML);
  } catch (e) { console.log('   （旧 game-views.js 夹具异常：' + e.message + '）'); }
  redCheck('记录视图包含「⚔️ 战斗记录」区块', true, oldHasBlock);

  /* ③ 单敌记录必须带 playerHealed（旧代码根本不产生记录） */
  let oldHasRecord = 'throw';
  try {
    const H = makeBattleHost({ gameBattleSrc: oldGameBattle });
    H.drive(ghBattle(), endingTick([], 2, true));
    oldHasRecord = H.sb.battleHistoryList().some(r => r.metrics.playerHealed === null && r.metrics.playerTaken !== null);
  } catch (e) { console.log('   （旧 game-battle.js 夹具异常：' + e.message + '）'); }
  redCheck('单敌记录存在且 playerHealed === null', true, oldHasRecord);

  console.log('\n判红结论：' + discriminated + ' 条新断言在旧基线上判红，' + notDiscriminated + ' 条无判别力');
  process.exit(notDiscriminated > 0 ? 1 : 0);
}

/* ============================================================
   1. schema 校验
   ============================================================ */
section('1. schema：拒绝 6 类非法形状（+ 正向对照）');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  const good = mkRec({ id: 'shape-ok' });
  const bad = [
    ['非对象（字符串）', 'nope'],
    ['非对象（null）', null],
    ['version 不符（v2）', { version: 2, battles: [] }],
    ['battles 非数组', { version: 1, battles: 'x' }],
    ['条目缺关键字段', { version: 1, battles: [{ id: 'a' }] }],
    ['条目类型不符（rounds 为字符串）', { version: 1, battles: [Object.assign(mkRec({ id: 'bad-rounds' }), { rounds: '3' })] }],
    ['条目 metrics 缺字段', { version: 1, battles: [Object.assign(mkRec({ id: 'bad-metrics' }), { metrics: { playerDealt: 1 } })] }],
    ['条目 party.alive 非布尔', { version: 1, battles: [Object.assign(mkRec({ id: 'bad-alive' }), { party: [{ name: '你', dealt: 1, taken: 1, healed: null, alive: 1 }] })] }],
    ['条目数 > 100', { version: 1, battles: new Array(101).fill(good) }]
  ];
  bad.forEach(function (c) {
    eq(S.store.set('battleHistory', c[1]), false, '拒绝：' + c[0]);
  });
  eq(bad.length >= 6, true, '非法形状用例数 ≥ 6（实际 ' + bad.length + '）');
  /* 正向对照：合法形状必须被接受（否则上面的「拒绝」可能是恒真） */
  eq(S.store.set('battleHistory', { version: 1, battles: [good] }), true, '正向对照：合法形状被接受');
  eq(S.battleHistoryList().length, 1, '合法形状可读回');
}

/* ============================================================
   2. 旧档无键 / 空统计
   ============================================================ */
section('2. 旧档无键 → 空列表 + 空统计（null 不是 0）');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  eq(S.battleHistoryList().length, 0, '无键 → 空列表');
  eq(H.ls.getItem('dh-battleHistory-v1'), null, '只读不写（不因读取而落盘）');
  const st = S.battleHistoryStats('single');
  eq(st.count, 0, 'count = 0');
  eq(st.winRate, null, 'winRate = null（分母 0，UI 显示「—」而不是 0%）');
  eq(st.currentStreak, 0, 'currentStreak = 0');
  eq(st.bestStreak, 0, 'bestStreak = 0');
  eq(st.avgRounds, null, 'avgRounds = null');
  eq(st.abortedCount, 0, 'abortedCount = 0');
  eq(st.abortedSkipped, true, '口径标记 abortedSkipped 回传');
  const stg = S.battleHistoryStats('group');
  eq(stg.winRate, null, '敌群同样：winRate = null');
  /* 存档损坏 / 形状非法 → 按空历史处理，不抛错 */
  H.ls.setItem('dh-battleHistory-v1', '{oops');
  eq(S.battleHistoryList().length, 0, '损坏 JSON → 空列表（不抛错）');
  H.ls.setItem('dh-battleHistory-v1', JSON.stringify({ version: 2, battles: [] }));
  eq(S.battleHistoryList().length, 0, '版本不符的存档 → 空列表');
  eq(H.logs.warn.length > 0, true, '读取异常有 console.warn（不静默）');
}

/* ============================================================
   3. 100 条 FIFO
   ============================================================ */
section('3. 100 条 FIFO（append 105 → 长度 100、淘汰最旧、顺序正确）');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  let allOk = true;
  for (let i = 1; i <= 105; i++) {
    const r = S.battleHistoryAppend(mkRec({ id: 'r' + i, endedAt: iso(i), result: (i % 3 === 0 ? 'loss' : 'win'), rounds: i }));
    if (!r.ok) { allOk = false; console.log('   append r' + i + ' 失败: ' + r.reason); }
  }
  eq(allOk, true, '105 条 append 全部返回 ok');
  const list = S.battleHistoryList();
  eq(list.length, 100, '长度被夹到 100');
  eq(list[0].id, 'r6', '最旧的 5 条被淘汰（首条 = r6）');
  eq(list[99].id, 'r105', '最新记录在数组末尾');
  let ordered = true;
  for (let i = 0; i < 100; i++) { if (list[i].id !== 'r' + (i + 6)) ordered = false; }
  eq(ordered, true, '保留的 100 条顺序正确（append 顺序不变）');
  const stats = S.battleHistoryStats('single');
  eq(stats.total, 100, '统计口径同样基于 100 条');
  eq(stats.losses, 34, 'losses = 34（r3 被淘汰，保留 r6..r105 里的 3 的倍数）');
  eq(stats.wins, 66, 'wins = 66');
  eq(stats.count, 100, 'count = win+loss = 100');
  /* 物理键内容与列表一致（回读依据） */
  const disk = JSON.parse(H.ls.getItem('dh-battleHistory-v1'));
  eq(disk.battles.length, 100, '物理键 dh-battleHistory-v1 也已夹到 100 条');
  eq(disk.battles[99].id, 'r105', '物理键末尾 = 最新记录');
}

/* ============================================================
   4. 幂等
   ============================================================ */
section('4. 幂等（同 id 不写第二条）');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  const rec = mkRec({ id: 'dup-1' });
  const a = S.battleHistoryAppend(rec);
  eq(a.ok, true, '首次 append ok');
  eq(a.count, 1, '首次 count = 1');
  const b = S.battleHistoryAppend(rec);
  eq(b.ok, true, '同 id 二次 append 仍是 ok（幂等，不算失败）');
  eq(b.duplicated, true, '同 id 二次 append 标记 duplicated');
  eq(S.battleHistoryList().length, 1, '同 id 二次 append 不翻倍');
  /* 内容相同的不同 id 必须都写入（幂等是按 id，不是按内容） */
  S.battleHistoryAppend(mkRec({ id: 'dup-2' }));
  eq(S.battleHistoryList().length, 2, '不同 id 的相同内容照常写入');
}

/* ============================================================
   5. 写入失败可检测
   ============================================================ */
section('5. 写入失败：ok:false + console.error + 列表不假装成功');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  S.battleHistoryAppend(mkRec({ id: 'ok-1', endedAt: iso(1) }));
  const before = S.battleHistoryList();
  eq(before.length, 1, '前置：已有 1 条确认落盘的记录');
  const orig = H.ls.setItem;
  let toastCount = 0;
  H.sb.toast = function () { toastCount++; };
  H.ls.setItem = function (k, v) { if (k === 'dh-battleHistory-v1') lsThrowQuota(k); return orig.call(this, k, v); };
  const res = S.battleHistoryAppend(mkRec({ id: 'fail-1', endedAt: iso(2) }));
  eq(res.ok, false, '配额失败 → ok:false');
  eq(res.reason, 'verify-failed', 'reason = verify-failed（回读校验不通过）');
  eq(H.logs.error.length > 0, true, '有 console.error（不静默 catch）');
  eq(/battle-history/.test(H.logs.error.join(' ')), true, 'console.error 带 [battle-history] 前缀：' + H.logs.error.join(' | ').slice(0, 120));
  /* 关键：列表 / 统计不得出现这条未落盘的记录 */
  const after = S.battleHistoryList();
  eq(after.length, before.length, '列表长度不因失败而增长');
  eq(after.some(r => r.id === 'fail-1'), false, '列表不含未落盘的记录（缓存未被污染成「假装成功」）');
  eq(S.battleHistoryStats('single').count, 1, '统计口径同样不含未落盘的记录');
  /* store 的内存缓存也必须回滚：sync.js 的 collectOtherKeys() 从 store.getAll()（= 缓存）
     派生推送载荷 → 不回滚的话，未落盘的记录会被下一次云推送带上云端 */
  const cached = S.store.get('battleHistory');
  eq(!!(cached && cached.battles.some(r => r.id === 'fail-1')), false,
    'store 内存缓存已回滚（未落盘的记录不会被 getAll() 带去云同步）');
  eq(cached && cached.battles.length, 1, '回滚后缓存仍是 append 之前的 1 条（既有记录未被破坏）');
  eq((S.store.getAll().battleHistory || {}).battles.length, 1, 'store.getAll()（推送载荷来源）同样只有 1 条');
  /* 恢复后同一 id 可正常写入 */
  H.ls.setItem = orig;
  const res2 = S.battleHistoryAppend(mkRec({ id: 'fail-1', endedAt: iso(2) }));
  eq(res2.ok, true, '恢复后同一 id 可正常写入');
  eq(S.battleHistoryList().length, 2, '恢复后列表 = 2 条');
  /* store.set 自身抛异常 → 也必须 ok:false 且不抛 */
  const origSet = S.store.set;
  S.store.set = function () { throw new Error('[测试] store.set 抛异常'); };
  const res3 = S.battleHistoryAppend(mkRec({ id: 'fail-2', endedAt: iso(3) }));
  eq(res3.ok, false, 'store.set 抛异常 → ok:false（不向外抛）');
  eq(res3.reason, 'set-threw', 'reason = set-threw');
  S.store.set = origSet;
  /* 全部写入失败（配额整体耗尽）→ 仍必须 ok:false 且不抛 */
  const allOrig = H.ls.setItem;
  H.ls.setItem = function () { lsThrowQuota('all'); };
  const res4 = S.battleHistoryAppend(mkRec({ id: 'fail-3', endedAt: iso(4) }));
  eq(res4.ok, false, '整体配额耗尽 → ok:false');
  eq(res4.reason, 'set-threw', '整体配额耗尽 → set-threw（touchModTime 也写不进 → 冒泡到本模块的兜底）');
  H.ls.setItem = allOrig;
  eq(toastCount > 0, true, '配额失败仍走既有 notifyQuota 提示（未吞掉用户可感知的信号）');
}

/* ============================================================
   6. 统计口径（固定数据集逐项断言）
   ============================================================ */
section('6. 统计口径：count / winRate / currentStreak / bestStreak / avgRounds');
{
  const H = makeHistorySandbox();
  const S = H.sb;
  /* 时间递增：win(3) → aborted(2) → win(4) → loss(6) → win(8) → aborted(9) */
  const seq = [['w1', 'win', 3], ['a1', 'aborted', 2], ['w2', 'win', 4], ['l1', 'loss', 6], ['w3', 'win', 8], ['a2', 'aborted', 9]];
  seq.forEach(function (s, i) {
    const r = S.battleHistoryAppend(mkRec({ id: s[0], result: s[1], rounds: s[2], endedAt: iso(i + 1) }));
    eq(r.ok, true, '夹具写入 ' + s[0]);
  });
  const st = S.battleHistoryStats('single');
  eq(st.total, 6, 'total = 6（含异常中止）');
  eq(st.count, 4, 'count = win+loss = 4（不含 aborted）');
  eq(st.wins, 3, 'wins = 3');
  eq(st.losses, 1, 'losses = 1');
  near(st.winRate, 0.75, 'winRate = 3/4 = 0.75');
  eq(st.abortedCount, 2, 'abortedCount = 2（单独回传）');
  eq(st.abortedSkipped, true, '口径标记 abortedSkipped = true');
  eq(st.currentStreak, 1, 'currentStreak：最新是 aborted（跳过）→ w3 计 1，再往前是 loss → 停');
  eq(st.bestStreak, 2, 'bestStreak：w1 → aborted（跳过，不打断）→ w2 = 2');
  eq(st.avgRounds, 5.3, 'avgRounds 只算 win/loss：(3+4+6+8)/4 = 5.25 → 5.3');
  ok(st.winRate !== 0.5, 'aborted 不进胜率分母（若当 loss 则 3/6 = 0.5）');
  /* 分模式不合并 */
  S.battleHistoryAppend(mkRec({ id: 'g1', mode: 'group', result: 'win', rounds: 2, endedAt: iso(20) }));
  eq(S.battleHistoryStats('single').count, 4, '分模式统计不跨模式合并（single 仍 4）');
  eq(S.battleHistoryStats('group').count, 1, 'group 统计独立（1）');
  eq(S.battleHistoryStats('group').total, 1, 'group total = 1');
  eq(S.battleHistoryStats('group').avgRounds, 2, 'group avgRounds = 2');
  /* 非法 mode 归一为 single（不产生「第三模式」） */
  eq(S.battleHistoryStats('nope').count, 4, '未知 mode 归一到 single');
}
{
  const H = makeHistorySandbox();
  const S = H.sb;
  /* 只有 aborted：分母 0 → winRate null；aborted 也不计入连胜 */
  S.battleHistoryAppend(mkRec({ id: 'x1', result: 'aborted', rounds: 5, endedAt: iso(1) }));
  S.battleHistoryAppend(mkRec({ id: 'x2', result: 'aborted', rounds: 7, endedAt: iso(2) }));
  const st = S.battleHistoryStats('single');
  eq(st.count, 0, '只有 aborted → count = 0');
  eq(st.winRate, null, '分母 0 → winRate = null（不是 0%）');
  eq(st.avgRounds, null, 'avgRounds = null（aborted 的回合不参与平均）');
  eq(st.abortedCount, 2, 'abortedCount = 2');
  eq(st.currentStreak, 0, 'aborted 不计入连胜');
  /* loss 打断连胜 */
  S.battleHistoryAppend(mkRec({ id: 'x3', result: 'win', endedAt: iso(3) }));
  S.battleHistoryAppend(mkRec({ id: 'x4', result: 'win', endedAt: iso(4) }));
  eq(S.battleHistoryStats('single').currentStreak, 2, '连续两胜 → currentStreak = 2');
  S.battleHistoryAppend(mkRec({ id: 'x5', result: 'loss', endedAt: iso(5) }));
  eq(S.battleHistoryStats('single').currentStreak, 0, '最新是 loss → currentStreak = 0');
  eq(S.battleHistoryStats('single').bestStreak, 2, 'bestStreak 仍保留历史最好 2');
}

/* ============================================================
   7. 单敌接入（真实 endBattle / endBattleAborted / runBattle 累计）
   ============================================================ */
section('7. 单敌接入：真实结算入口写历史');
{
  /* 7a 胜利：多回合累计 + 只读 hpDamage 口径 */
  const H = makeBattleHost();
  let t = 0;
  H.drive(ghBattle(), function (bb) {
    t++;
    const events = [
      { type: 'damage', sourceSide: 'player', targetSide: 'enemy', amount: 10, hpDamage: 10, msg: '你 → 敌 10' },
      { type: 'damage', sourceSide: 'enemy', targetSide: 'player', amount: 3, hpDamage: 3, msg: '敌 → 你 3' },
      { type: 'shield', sourceSide: 'enemy', targetSide: 'player', amount: 4, hpDamage: 0, msg: '🛡️ 你 护盾吸收 4' },
      { type: 'heal', sourceSide: 'enemy', targetSide: 'enemy', amount: 4, msg: '💚 Boss 生命汲取' }
    ];
    if (t === 3) { bb.done = true; bb.winner = true; }
    return { turn: t, events: events };
  });
  let guard = 0;
  while (!vm.runInContext('_battle.done', H.sb) && guard++ < 10) H.flushLast();
  const list = H.sb.battleHistoryList();
  eq(list.length, 1, '7a 单敌胜利写一条历史');
  const r = list[0];
  eq(r.mode, 'single', '7a mode = single');
  eq(r.result, 'win', '7a result = win');
  eq(r.stageId, '1-1', '7a stageId = 本场快照关卡（_battleLevelId）');
  eq(r.rounds, 3, '7a rounds = 本场回合数');
  eq(typeof r.endedAt, 'string', '7a endedAt 是字符串（ISO）');
  eq(isNaN(Date.parse(r.endedAt)), false, '7a endedAt 可被 Date.parse 解析');
  eq(r.metrics.playerDealt, 30, '7a 玩家输出 = 3 回合 × 10（只读 hpDamage）');
  eq(r.metrics.playerTaken, 9, '7a 玩家承伤 = 3 回合 × 3（护盾事件 hpDamage=0 不计）');
  eq(r.metrics.playerHealed, null, '7a 单敌无治疗通道 → playerHealed 必须是 null（不得以 0 冒充）');
  eq(r.metrics.terrain, null, '7a 单敌 terrain = null');
  eq(r.metrics.dot, null, '7a 单敌 dot = null');
  eq(r.metrics.shield, null, '7a 单敌 shield = null（护盾吸收未汇总）');
  eq(r.party.length, 1, '7a party 只含玩家一条');
  eq(r.party[0].healed, null, '7a party[].healed = null');
  eq(r.party[0].dealt, 30, '7a party[].dealt 与本场一致');
  eq(r.party[0].alive, true, '7a party[].alive = hp>0');
  eq(r.note, null, '7a 单敌 note = null');
  /* 结算本身不受历史影响 */
  eq(H.refine.points > 0, true, '7a 胜利奖励照常发放：+' + H.refine.points + ' 炼化点');
  eq(H.game.cleared.indexOf('1-1') >= 0, true, '7a 通关照常记录');
  eq(H.calls.trackLevel.length, 1, '7a trackLevel 照常调用');

  /* 7b 同场重复调用结算入口 → 不写第二条 */
  vm.runInContext('endBattle(true)', H.sb);
  eq(H.sb.battleHistoryList().length, 1, '7b 同场重复 endBattle(true) 不写第二条（_settled 守卫）');
  vm.runInContext('endBattle(false)', H.sb);
  eq(H.sb.battleHistoryList().length, 1, '7b 同场再调 endBattle(false) 也不写第二条');
  /* 7c 同场走另一条结算入口（异常中止）→ id 判重，仍不写第二条 */
  vm.runInContext('endBattleAborted(new Error("late"),{stage:"x"})', H.sb);
  eq(H.sb.battleHistoryList().length, 1, '7c 同场再走 endBattleAborted 也不写第二条（同场 id 判重）');
}
{
  /* 7d 战败 */
  const H = makeBattleHost();
  H.drive(ghBattle(), endingTick([
    { type: 'damage', sourceSide: 'enemy', targetSide: 'player', amount: 25, hpDamage: 25, msg: '敌 → 你 25' }
  ], 2, false));
  const list = H.sb.battleHistoryList();
  eq(list.length, 1, '7d 单敌战败写一条历史');
  eq(list[0].result, 'loss', '7d result = loss');
  eq(list[0].rounds, 2, '7d rounds = 2');
  eq(list[0].metrics.playerDealt, 0, '7d 玩家输出 0（本场没有玩家伤害事件）');
  eq(list[0].metrics.playerTaken, 25, '7d 玩家承伤 25');
  eq(H.game.attempts['2026-10-06_1-1'], 1, '7d 失败次数照常 +1');
  eq(H.refine.points, 0, '7d 战败不发奖励');
}
{
  /* 7e 异常中止 */
  const H = makeBattleHost();
  H.drive(ghBattle({ turn: 4 }), function () { throw new Error('history-boom'); });
  const list = H.sb.battleHistoryList();
  eq(list.length, 1, '7e 单敌异常中止写一条历史');
  eq(list[0].result, 'aborted', '7e result = aborted');
  eq(list[0].rounds, 4, '7e rounds 取 battleErrorContext 的回合（不伪造成 0）');
  eq(H.refine.points, 0, '7e 异常不发奖励');
  eq(H.game.cleared.length, 0, '7e 异常不推进通关');
  eq(Object.keys(H.game.attempts).length, 0, '7e 异常不计失败次数');
  const err = H.sb.getLastBattleError();
  eq(!!(err && err.message === 'history-boom'), true, '7e 异常上下文仍可查');
  /* 同场重复进入异常中止 → id 判重 */
  vm.runInContext('endBattleAborted(new Error("history-boom-2"),{stage:"x"})', H.sb);
  eq(H.sb.battleHistoryList().length, 1, '7e 同场重复 endBattleAborted 不写第二条');
}

/* ============================================================
   8. 历史写失败时：奖励 / 进度 / 失败次数与成功路径逐项一致
   ============================================================ */
section('8. 历史写失败不影响奖励 / 进度 / 失败次数（与成功路径逐项一致）');
{
  function runWin(host) {
    host.drive(ghBattle(), endingTick([
      { type: 'damage', sourceSide: 'player', targetSide: 'enemy', amount: 60, hpDamage: 60, msg: '你 → 敌 60' }
    ], 2, true));
    return {
      points: host.refine.points, cleared: host.game.cleared.slice(), current: host.game.current,
      attempts: JSON.stringify(host.game.attempts), trackLevel: host.calls.trackLevel.slice()
    };
  }
  function runLoss(host) {
    host.drive(ghBattle(), endingTick([
      { type: 'damage', sourceSide: 'enemy', targetSide: 'player', amount: 300, hpDamage: 300, msg: '敌 → 你 300' }
    ], 1, false));
    return {
      points: host.refine.points, cleared: host.game.cleared.slice(), current: host.game.current,
      attempts: JSON.stringify(host.game.attempts)
    };
  }
  const OKwin = runWin(makeBattleHost());
  const BADwin = makeBattleHost({ failHistoryWrites: true });
  const BADwinRes = runWin(BADwin);
  eq(JSON.stringify(BADwinRes), JSON.stringify(OKwin), '胜利：历史写失败时奖励/进度/关卡推进与成功路径完全一致');
  eq(BADwin.sb.battleHistoryList().length, 0, '胜利：历史确实没落盘');
  eq(BADwin.snapshot().history.ok, false, '胜利：本场快照携带 history.ok=false（供战绩层提示）');
  eq(BADwin.logs.error.length > 0, true, '胜利：写入失败有 console.error');
  /* 战绩层显示「本场战绩未保存」 */
  BADwin.flushLast();   // 800ms 阶段 → 战果层
  BADwin.flushLast();   // 1200ms 阶段 → 战绩层
  eq(/本场战绩未保存/.test(BADwin.els.battleEnd.innerHTML), true, '胜利：战绩层出现「本场战绩未保存」提示');
  eq(/战利品/.test(BADwin.els.battleEnd.innerHTML), true, '胜利：战绩层仍照常展示战利品（结果呈现不被阻断）');

  const OKloss = runLoss(makeBattleHost());
  const BADloss = makeBattleHost({ failHistoryWrites: true });
  const BADlossRes = runLoss(BADloss);
  eq(JSON.stringify(BADlossRes), JSON.stringify(OKloss), '战败：历史写失败时失败次数/进度与成功路径完全一致');
  eq(BADloss.game.attempts['2026-10-06_1-1'], 1, '战败：失败次数仍 +1');
  eq(BADloss.sb.battleHistoryList().length, 0, '战败：历史确实没落盘');
  /* 正常路径的对照组：写成功时战绩层不出现提示 */
  const OKnote = makeBattleHost();
  runWin(OKnote);
  OKnote.flushLast(); OKnote.flushLast();
  eq(!/本场战绩未保存/.test(OKnote.els.battleEnd.innerHTML), true, '对照：写成功时战绩层不出现「未保存」提示');
  eq(OKnote.sb.battleHistoryList().length, 1, '对照：写成功时历史 = 1 条');
}

/* ============================================================
   9. 敌群接入（真实 _groupDone / groupBattleStats / showGroupResultPanel）
   ============================================================ */
section('9. 敌群接入：真实 _groupDone 写历史');
{
  /* 9a 胜利：metrics / party 与 groupBattleStats() 逐项一致 */
  const G = makeGroupHost();
  const gb = buildGroupGb(G.sb, 'ally');
  const st = G.sb.groupBattleStats(gb);
  eq(st.terrain === 5 && st.dot === 6 && st.shield === 12, true,
    '夹具前置：真实统计给出非零 场地/DOT/护盾（' + st.terrain + '/' + st.dot + '/' + st.shield + '）');
  eq(st.rows.length, 1, '夹具前置：rows 只有玩家一行');
  G.setBattle(gb, 'g1-1');
  G.sb._groupDone();
  const list = G.sb.battleHistoryList();
  eq(list.length, 1, '9a 敌群胜利写一条历史');
  const r = list[0];
  eq(r.mode, 'group', '9a mode = group');
  eq(r.result, 'win', '9a result = win');
  eq(r.stageId, 'g1-1', '9a stageId = _groupStageId');
  eq(r.rounds, st.rounds, '9a rounds = groupBattleStats().rounds');
  eq(r.metrics.terrain, st.terrain, '9a terrain 与统计一致');
  eq(r.metrics.dot, st.dot, '9a dot 与统计一致');
  eq(r.metrics.shield, st.shield, '9a shield 与统计一致');
  eq(r.metrics.playerDealt, st.rows[0].dealt, '9a playerDealt = 我方玩家行 dealt');
  eq(r.metrics.playerTaken, st.rows[0].taken, '9a playerTaken = 我方玩家行 taken');
  eq(r.metrics.playerHealed, st.rows[0].healed, '9a playerHealed = 我方玩家行 healed（敌群有治疗通道 → 数字）');
  eq(typeof r.metrics.playerHealed, 'number', '9a 敌群 playerHealed 是数字（区别于单敌的 null）');
  eq(r.party.length, st.rows.length, '9a party 与 rows 条数一致');
  eq(r.party[0].name, st.rows[0].name, '9a party[0].name 与 rows 一致');
  eq(r.party[0].alive, true, '9a party[].alive = hp>0');
  eq(r.note, null, '9a 无同名 → note = null');
  eq(G.calls.cleared, 1, '9a 通关进度照常记录');
  eq(G.calls.reward, 1, '9a 奖励照常发放');
  /* 9b 幂等：真实守卫 + 同场 id 判重 */
  G.sb._groupDone();
  eq(G.sb.battleHistoryList().length, 1, '9b 重复 _groupDone 不写第二条（_groupRewarded 守卫）');
  G.sb._groupRewarded = false;
  G.sb._groupDone();
  eq(G.sb.battleHistoryList().length, 1, '9b 重置幂等标记后重复结算：靠同场 id 判重，仍不写第二条');
  /* 9c 战绩层提示（历史未保存）——成功路径无提示 */
  G.flushLast(); G.flushLast();
  eq(/data-group-outro="stats"/.test(G.panel()), true, '9c 夹具前置：已推进到战绩层');
  eq(!/本场战绩未保存/.test(G.panel()), true, '9c 写成功时结果面板不出现「未保存」提示');
}
{
  /* 9d 战败 */
  const G = makeGroupHost();
  const gb = buildGroupGb(G.sb, 'enemy');
  G.setBattle(gb, 'g1-2');
  G.sb._groupDone();
  const list = G.sb.battleHistoryList();
  eq(list.length, 1, '9d 敌群战败写一条历史');
  eq(list[0].result, 'loss', '9d result = loss');
  eq(list[0].stageId, 'g1-2', '9d stageId = g1-2');
  eq(G.calls.reward, 0, '9d 战败不发奖励');
  eq(G.calls.injuries, 1, '9d 战败的宠物受伤副作用照常结算');
}
{
  /* 9e 同名单位 → note 披露 */
  const G = makeGroupHost();
  const gb = buildGroupGb(G.sb, 'ally', { dup: true });
  const st = G.sb.groupBattleStats(gb);
  eq(st.dup, true, '夹具前置：存在同名单位（dup=true）');
  G.setBattle(gb, 'g1-3');
  G.sb._groupDone();
  const r = G.sb.battleHistoryList()[0];
  eq(r.note, '本场存在同名单位：按首个同名单位归因', '9e dup=true → note 如实披露归因局限');
  eq(r.party.length, st.rows.length, '9e party 覆盖全部 rows（同名单位不被静默合并）');
}
{
  /* 9f 历史写失败：奖励 / 进度 与成功路径一致 + 战绩层提示 */
  const GOK = makeGroupHost();
  GOK.setBattle(buildGroupGb(GOK.sb, 'ally'), 'g1-1');
  GOK.sb._groupDone();
  const okCalls = JSON.stringify(GOK.calls);
  const G = makeGroupHost({ failHistoryWrites: true });
  G.setBattle(buildGroupGb(G.sb, 'ally'), 'g1-1');
  G.sb._groupDone();
  eq(G.sb.battleHistoryList().length, 0, '9f 历史确实没落盘');
  eq(JSON.stringify(G.calls), okCalls, '9f 历史写失败时通关/奖励/关卡列表刷新与成功路径完全一致');
  eq(!!(G.sb._gbOutroActive && G.sb._gbOutroActive.history && G.sb._gbOutroActive.history.ok === false), true,
    '9f outro 状态携带 history.ok=false');
  eq(G.logs.error.length > 0, true, '9f 写入失败有 console.error');
  G.flushLast(); G.flushLast();
  eq(/data-group-outro="stats"/.test(G.panel()), true, '9f 夹具前置：结果面板已到统计层');
  eq(/本场战绩未保存/.test(G.panel()), true, '9f 结果面板统计层出现「本场战绩未保存」提示');
}
{
  /* 9g 没有本场战斗 → 不凭空写历史 */
  const G = makeGroupHost();
  G.setBattle(null, null);
  const before = G.sb.battleHistoryList().length;
  G.sb._groupDone();
  eq(G.sb.battleHistoryList().length, before, '9g _groupBattle=null 时不写任何历史');
}
{
  /* 9h 我方没有 id==='player' 的行 → player* 一律 null（不得以 0 冒充） */
  const G = makeGroupHost();
  const mk = (id, name, side, hp) => G.sb.createUnit({ id, side, name, base: { hp, atk: 10, def: 10, spd: 10 } });
  const gb = G.sb.createGroupBattle({ allies: [mk('hero-1', '你', 'ally', 300)], enemies: [mk('enemy-0', '敌1', 'enemy', 100)] });
  gb.log = [{ turn: 1, unit: '你', events: [{ msg: '⚔️ 你 攻击 敌1 → 33 伤害', type: 'damage', targetId: 'enemy-0' }] }];
  gb.turn = 1; gb.winner = 'ally'; gb.done = true;
  G.setBattle(gb, 'g1-4');
  G.sb._groupDone();
  const r = G.sb.battleHistoryList()[0];
  eq(r.metrics.playerDealt, null, '9h 无 id===player 的行 → playerDealt = null（不以 0 冒充）');
  eq(r.metrics.playerTaken, null, '9h playerTaken = null');
  eq(r.metrics.playerHealed, null, '9h playerHealed = null');
  eq(r.party.length, 1, '9h party 仍如实包含我方那一行');
  eq(r.party[0].dealt, 33, '9h party 的 dealt 照常记录');
}

/* ============================================================
   10. UI：记录视图分模式统计 + 单场摘要
   ============================================================ */
section('10. 记录视图 UI：分模式统计 + null → 「不适用」+ 空状态');
{
  /* 10a 有记录：单敌 playerHealed=null → 「不适用」；敌群展示 场地/DOT/护盾 */
  const H = makeHistorySandbox();
  H.sb.battleHistoryAppend(mkRec({
    id: 'ui-1', endedAt: iso(1), mode: 'single', result: 'win', rounds: 3,
    metrics: { playerDealt: 12, playerTaken: 4, playerHealed: null, terrain: null, dot: null, shield: null }
  }));
  H.sb.battleHistoryAppend(mkRec({
    id: 'ui-2', endedAt: iso(2), mode: 'group', result: 'loss', rounds: 5, stageId: 'g1-1',
    metrics: { playerDealt: null, playerTaken: null, playerHealed: null, terrain: 7, dot: 3, shield: 2 },
    party: [{ name: '某宠物', dealt: 5, taken: 9, healed: 1, alive: false }],
    note: '本场存在同名单位：按首个同名单位归因'
  }));
  H.sb.battleHistoryAppend(mkRec({ id: 'ui-3', endedAt: iso(3), mode: 'single', result: 'aborted', rounds: 2 }));
  H.sb.getGameStats = function () { return { atk: 1, def: 1, hp: 1, soulAtk: 0, soulDef: 0 }; };
  vm.runInContext(read('game-views.js'), H.sb, { filename: 'game-views.js' });
  H.sb.renderRecordView();
  const html = H.els.gameRecordView.innerHTML;
  eq(html.length > 0, true, '10a 记录视图已渲染');
  eq(/⚔️ 战斗记录/.test(html), true, '10a 出现「⚔️ 战斗记录」区块');
  eq(/单敌挑战/.test(html) && /敌群试炼/.test(html), true, '10a 单敌 / 敌群**分列**（两张卡）');
  eq(/胜率/.test(html) && /当前连胜/.test(html) && /最佳连胜/.test(html) && /平均回合/.test(html), true,
    '10a 卡片含 胜率/当前连胜/最佳连胜/平均回合');
  eq(/不适用/.test(html), true, '10a 单敌 playerHealed=null → 渲染「不适用」（不得以 0 冒充）');
  const singleCard = html.slice(html.indexOf('单敌挑战'), html.indexOf('敌群试炼'));
  eq(/100%/.test(singleCard), true, '10a 单敌卡胜率 = 100%（1 胜 0 负，aborted 不进分母）');
  eq(/异常中止 1 次/.test(singleCard), true, '10a 单敌卡披露「异常中止 1 次」（不计胜率）');
  eq(/异常中止 1 次/.test(html.slice(html.indexOf('敌群试炼'))), false, '10a abortedCount 只出现在对应模式卡内');
  eq(/场地 7/.test(html) && /DOT 3/.test(html) && /护盾 2/.test(html), true, '10a 敌群单条显示 场地/DOT/护盾');
  eq(/本场存在同名单位/.test(html), true, '10a note 非空 → 小字披露');
  eq(/异常中止/.test(html.slice(html.indexOf('最近战斗'))), true, '10a 最近战斗列表显示「异常中止」结果');
  /* 10b 最近战斗最多 10 条、最新在前 */
  const recent = H.sb.battleHistoryRecent(10);
  eq(recent.length, 3, '10b battleHistoryRecent 返回 3 条');
  eq(recent[0].id, 'ui-3', '10b 最新在前（endedAt 倒序）');
  const H2 = makeHistorySandbox();
  for (let i = 1; i <= 12; i++) H2.sb.battleHistoryAppend(mkRec({ id: 'm' + i, endedAt: iso(i) }));
  eq(H2.sb.battleHistoryRecent(10).length, 10, '10b 最近战斗最多 10 条');
  eq(H2.sb.battleHistoryRecent(10)[0].id, 'm12', '10b 最近战斗取最新 10 条');
}
{
  /* 10c 空历史：空状态文案，不得把「无数据」显示成 0 / 不适用 */
  const H = makeHistorySandbox();
  H.sb.getGameStats = function () { return { atk: 1, def: 1, hp: 1, soulAtk: 0, soulDef: 0 }; };
  vm.runInContext(read('game-views.js'), H.sb, { filename: 'game-views.js' });
  H.sb.renderRecordView();
  const html = H.els.gameRecordView.innerHTML;
  eq(/暂无战斗记录/.test(html), true, '10c 空历史 → 明确空状态文案');
  eq(/完成一场挑战后自动记录/.test(html), true, '10c 空状态给出下一步指引');
  eq(/单敌挑战/.test(html), false, '10c 空历史不渲染模式卡（不与「0 场」混淆）');
  eq(/不适用/.test(html), false, '10c 空历史不出现「不适用」');
  eq(/胜率/.test(html), false, '10c 空历史不出现「胜率 0%」之类的假数据');
}
{
  /* 10d 缺 battle-history.js（模块未加载）→ 区块走空状态，不抛错 */
  const H = makeHistorySandbox();
  H.sb.battleHistoryList = undefined;
  H.sb.battleHistoryStats = undefined;
  H.sb.battleHistoryRecent = undefined;
  H.sb.getGameStats = function () { return { atk: 1, def: 1, hp: 1, soulAtk: 0, soulDef: 0 }; };
  vm.runInContext(read('game-views.js'), H.sb, { filename: 'game-views.js' });
  let err = null;
  try { H.sb.renderRecordView(); } catch (e) { err = e; }
  eq(err, null, '10d 模块缺失时 renderRecordView 不抛错（typeof 守卫）');
  eq(/暂无战斗记录/.test(H.els.gameRecordView.innerHTML), true, '10d 模块缺失时走空状态');
}

/* ============================================================
   11. typeof 守卫（部分测试夹具只加载子集）
   ============================================================ */
section('11. typeof 守卫：模块缺失时接入点静默跳过（不抛 ReferenceError）');
{
  const H = makeBattleHost();
  /* 模拟「只加载 levels/battle/game-battle」的夹具：历史接口不可见。
     ⚠️ 用赋 undefined 而不是 delete —— vm 上下文里由脚本内部创建的全局属性，
        从沙箱对象外部 delete 不一定能删掉（赋值则一定能改到）。 */
  H.sb.battleHistoryAppend = undefined;
  H.drive(ghBattle(), endingTick([
    { type: 'damage', sourceSide: 'player', targetSide: 'enemy', amount: 9, hpDamage: 9, msg: '你 → 敌 9' }
  ], 1, true));
  eq(H.refine.points > 0, true, '11 缺 battle-history.js 时单敌结算照常（奖励照发）');
  eq(H.snapshot().history, null, '11 单敌快照 history = null（未写历史，也不报错）');
  eq(H.logs.error.length, 0, '11 模块缺失不是错误路径（无 console.error）');
}
{
  const G = makeGroupHost();
  G.sb.battleHistoryAppend = undefined;   // 同 11 单敌侧：模块不可见
  G.setBattle(buildGroupGb(G.sb, 'ally'), 'g1-1');
  let err = null;
  try { G.sb._groupDone(); } catch (e) { err = e; }
  eq(err, null, '11 缺 battle-history.js 时敌群 _groupDone 不抛 ReferenceError');
  eq(G.calls.reward, 1, '11 缺 battle-history.js 时敌群奖励照常发放');
  eq(!!(G.sb._gbOutroActive && G.sb._gbOutroActive.history === null), true, '11 敌群 outro.history = null（未写历史）');
}

/* ============================================================
   12. 同步覆盖样本与 schema 一致
   ============================================================ */
section('12. test-sync-coverage.js 的 battleHistory 样本必须过本模块的 validate');
{
  const src = fs.readFileSync(path.join(__dirname, 'test-sync-coverage.js'), 'utf8');
  const anchor = src.indexOf('battleHistory: {');
  let sample = null, err = null;
  if (anchor < 0) err = '未找到 SAMPLES.battleHistory';
  else {
    let depth = 0, end = -1;
    const openAt = src.indexOf('{', anchor);
    for (let i = openAt; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) err = '样本括号不平衡';
    else {
      try { sample = vm.runInNewContext('(' + src.slice(openAt, end) + ')', {}); }
      catch (e) { err = '解析失败: ' + e.message; }
    }
  }
  eq(err, null, '12 从 test-sync-coverage.js 提取 battleHistory 样本（' + err + '）');
  const H = makeHistorySandbox();
  eq(H.sb.store.set('battleHistory', sample), true, '12 该样本通过 battleHistory 的 schema validate');
  eq(Array.isArray(sample && sample.battles) && sample.battles.length > 0, true, '12 样本含至少一条记录（不是空壳）');
}

/* ============================================================
   汇总
   ============================================================ */
console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

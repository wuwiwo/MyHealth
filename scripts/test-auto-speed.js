#!/usr/bin/env node
/* 关卡挑战（单敌）「自动模式继承战斗速度」测试

   作者报告：**关卡挑战**（单敌 / `page/levels.js` 那套）开「🔄 自动」+ 选 **×8**，
   战斗实际仍以 **×1** 推进。

   根因：`startBattle` 每次开头都无条件 `_battleSpeed=1`；而自动模式正是靠
   「胜利 → 2 秒后 `startBattle(下一关)`」推进的（`endBattle` 的 `_battleAuto` 分支）
   → 第一关之后**每一关都退回 ×1**，而 8× 按钮仍高亮（没人同步高亮）= 报告症状。
   敌群侧（game-render.js：`_groupSpeed` + `dh-group-speed`）是正常工作的对照组：
   它「选了就落盘 + 开战恢复」，所以本修复与它同口径。

   本套守 5 件事：
   1) **纯函数折算** —— `battleStepDelay(600, ×1/2/4/8)` → 600/300/150/75；
      非法 / 缺失 / 未登记档位一律回落 ×1（不产生 NaN / Infinity 间隔）。
   2) **存·读往返** —— `dh-battle-speed` 落盘 + 归一边界（脏数据 '0' / '7' / 'abc'）；
      无存档时沿用 fallback（内存值）——正是这一点让自动模式的下一关不退回 ×1。
   3) **点击即落盘** —— 模块注册的 document 级委托：点档位落盘，点「自动 / ✕」不误写。
   4) **行为回归（真跑 startBattle + 捕获真实定时器）** —— 存档 ×8 → 每回合 75ms
      （修复前 600ms）· ×1 场景仍 600ms · **自动模式逐关继承**：胜利 → 2000ms 自动进关
      → 200ms → 下一关首次调度仍是 75ms。
   5) **源码级守卫** —— tick 循环必须经 `battleStepDelay(…, _battleSpeed)`（速度真的
      参与延时计算）· `startBattle` 必须经 `loadBattleSpeed(...)`（防再次硬重置 ×1）·
      新键 `dh-battle-speed` 只出现在 game-battle.js（敌群侧 `dh-group-speed` 不被牵连）。

   Run: node scripts/test-auto-speed.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}

/* ============================================================
   假 DOM / 假定时器 / 假 localStorage（无 jsdom 依赖，与其它套件同风格）
   ============================================================ */
function makeEl(id) {
  return {
    id: id, dataset: {}, style: {}, className: '', textContent: '', innerHTML: '', value: '',
    scrollTop: 0, scrollHeight: 0, offsetWidth: 1, hidden: false, _kids: [], _on: {},
    classList: {
      _s: Object.create(null),
      add(c) { this._s[c] = true; },
      remove(c) { delete this._s[c]; },
      contains(c) { return !!this._s[c]; },
      toggle(c, force) { const on = (force === undefined) ? !this._s[c] : !!force; if (on) this._s[c] = true; else delete this._s[c]; return on; }
    },
    appendChild(c) { this._kids.push(c); return c; },
    removeChild(c) { const i = this._kids.indexOf(c); if (i >= 0) this._kids.splice(i, 1); return c; },
    remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener(t, fn) { (this._on[t] = this._on[t] || []).push(fn); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
  };
}

/* 确定性随机（battle.js 的伤害带 ±variance）；Math 属性不可枚举 → Object.create 继承 */
function deterministicMath() {
  const M = Object.create(Math);
  M.random = function () { return 0.5; };
  return M;
}

/* stats 由测试按场景替换（长战斗 / 秒杀两种都要） */
function statsHolder(sb, initial) {
  let stats = initial || { atk: 50, def: 10, hp: 500, soulAtk: 0, soulDef: 0 };
  sb.__setStats = s => { stats = s; };
  sb.getGameStats = () => stats;
}

function makeHarness(opt) {
  const o = opt || {};
  const ls = Object.assign(Object.create(null), o.localStorage || {});
  const els = Object.create(null);
  const timers = [];                 // 捕获的定时器（顺序 = 注册顺序）
  const docListeners = {};
  /* 单敌表头那 4 个档位按钮（供 syncBattleSpeedButtons 的 querySelectorAll 用） */
  const speedBtns = ['1', '2', '4', '8'].map(v => {
    const b = makeEl('spd' + v); b.dataset.speed = v; if (v === '1') b.classList.add('active');
    return b;
  });
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement() { return makeEl(''); },
    querySelector() { return null; },
    querySelectorAll(sel) { return sel === '.battle-speed .speed-btn[data-speed]' ? speedBtns : []; },
    body: { appendChild() {} }, documentElement: { setAttribute() {} },
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); }
  };

  const sb = { Math: deterministicMath(), JSON, console, Date };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = {
    getItem: k => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: k => { delete ls[k]; }
  };
  sb.document = doc;
  sb.setTimeout = function (fn, ms) { timers.push({ fn: fn, ms: ms === undefined ? 0 : ms }); return timers.length; };
  sb.clearTimeout = function () {};
  sb.toast = function () {};
  let game = { current: '1-1', cleared: [], attempts: {} };
  sb.getGame = function () { return game; };
  sb.setGame = function (g) { game = g; };
  sb.store = { get: () => ({ entries: [] }), set() {}, registerSchema() {} };
  sb.today = () => '2026-10-01';
  statsHolder(sb, o.stats);
  sb.getRefine = () => ({ points: 0, unlocked: true });
  sb.saveRefine = function () {};
  sb.trackLevel = function () {};
  sb.celebrate = function () {};

  vm.createContext(sb);
  ['levels.js', 'battle.js', 'game-battle.js'].forEach(f => vm.runInContext(src(f), sb, { filename: f }));

  const H = {
    sb, ls, timers, speedBtns, docListeners,
    /* 读 / 写模块级（vm 顶层 let）变量：同 context 的后续 script 可直接访问 */
    get: expr => vm.runInContext(expr, sb),
    set: (expr, v) => vm.runInContext(expr + '=' + JSON.stringify(v), sb),
    game: () => game,
    lastTimer: () => timers[timers.length - 1],
    /* 清空队列并执行最后一个定时器（= 战斗 tick 的下一次调度 / 流程的下一步），返回其延时 */
    flushToLast: function () {
      const t = H.lastTimer();
      timers.length = 0;
      if (!t) return null;
      t.fn();
      return t.ms;
    },
    btn: v => speedBtns.find(b => b.dataset.speed === String(v))
  };
  return H;
}

/* ============================================================
   1. 纯函数折算（判据核心：速度必须真的参与延时计算）
   ============================================================ */
console.log('--- 1. battleStepDelay 纯函数折算 ---');
const H = makeHarness();
/* 逐调用包装：修复前的代码里没有这些函数 → 断言失败而不是整套崩掉（便于回归定位） */
const NOOP = function () { return NaN; };
const api = name => (typeof H.sb[name] === 'function' ? H.sb[name] : NOOP);
const delay = (base, sp) => api('battleStepDelay')(base, sp);
const normalize = v => api('normalizeBattleSpeed')(v);
const saveSpeed = v => api('saveBattleSpeed')(v);
const loadSpeed = fb => api('loadBattleSpeed')(fb);
[[1, 600], [2, 300], [4, 150], [8, 75]].forEach(function (c) {
  const v = delay(600, c[0]);
  assert('battleStepDelay(600, ×' + c[0] + ') === ' + c[1] + 'ms', v === c[1], '实际 ' + v);
});
assert('字符串档位 "8" 同样算出 75ms', delay(600, '8') === 75, String(delay(600, '8')));
assert('其它基准时长同口径换算（900ms / ×8）',
  delay(900, 8) === Math.round(900 / 8), String(delay(900, 8)));
assert('基准缺省时用 BATTLE_STEP_BASE_MS（= 600）',
  delay(undefined, 8) === 75, String(delay(undefined, 8)));
const badCases = [];
[0, -1, 7, 'abc', undefined, null, NaN, {}].forEach(function (v) {
  const d = delay(600, v);
  if (d !== 600) badCases.push(String(v) + '→' + d);
});
assert('非法 / 缺失 / 未登记档位一律回落 ×1（600ms，不产生 NaN / Infinity）', badCases.length === 0, badCases.join(', '));
assert('normalizeBattleSpeed 归一：4 → 4，0 → 1，null → 1',
  normalize('4') === 4 && normalize('0') === 1 && normalize(null) === 1);
assert('档位表 = [1,2,4,8]（与敌群侧同口径，未新增档位）',
  JSON.stringify(H.sb.BATTLE_SPEEDS) === '[1,2,4,8]', JSON.stringify(H.sb.BATTLE_SPEEDS));

/* ============================================================
   2. 存 · 读（速度选择的载体）
   ============================================================ */
console.log('--- 2. 存档往返（dh-battle-speed） ---');
saveSpeed(8);
assert("点 ×8 → localStorage['dh-battle-speed'] === '8'", H.ls['dh-battle-speed'] === '8', String(H.ls['dh-battle-speed']));
assert('loadBattleSpeed() 读回 8', loadSpeed() === 8, String(loadSpeed()));
saveSpeed('2');
assert("点击 ×2 → 存档更新为 '2'", H.ls['dh-battle-speed'] === '2', String(H.ls['dh-battle-speed']));
saveSpeed(99);
assert("非法档位不写进存档（归一为 '1'）", H.ls['dh-battle-speed'] === '1', String(H.ls['dh-battle-speed']));
delete H.ls['dh-battle-speed'];
assert('无存档 → 沿用 fallback（内存值），不会把玩家选择打回 ×1', loadSpeed(4) === 4, String(loadSpeed(4)));
assert('无存档且无 fallback → ×1', loadSpeed() === 1, String(loadSpeed()));
H.ls['dh-battle-speed'] = 'abc';
assert('存档脏数据 → 回落 ×1（不产生 NaN 间隔）', loadSpeed() === 1, String(loadSpeed()));

/* ============================================================
   3. 「存」的一环：点档位即落盘（document 级委托）
   ============================================================ */
console.log('--- 3. 点击档位落盘 ---');
const clickHooks = H.docListeners.click || [];
assert('game-battle.js 注册了 document 级点击委托（速度落盘入口）', clickHooks.length >= 1);
delete H.ls['dh-battle-speed'];
clickHooks.forEach(fn => fn({ target: { closest: () => ({ dataset: { speed: '4' } }) } }));
assert("点 ×4 → 立刻落盘 '4'", H.ls['dh-battle-speed'] === '4', String(H.ls['dh-battle-speed']));
H.ls['dh-battle-speed'] = '2';
clickHooks.forEach(fn => fn({ target: { closest: () => null } }));   // 自动 / ✕ / 敌群调速按钮
assert('点非档位按钮（自动 / ✕ / 敌群调速）不误写速度存档', H.ls['dh-battle-speed'] === '2', String(H.ls['dh-battle-speed']));

/* ============================================================
   4. 行为回归：真跑 startBattle + 捕获真实调度间隔
   ============================================================ */
console.log('--- 4. 行为回归：开战间隔真的随档位变 ---');
const LEVELS = vm.runInContext('LEVELS', H.sb);
const order = [];
Object.keys(LEVELS).forEach(k => LEVELS[k].levels.forEach(lv => order.push(lv)));
assert('LEVELS 有序展开（用于挑选用例关卡）', order.length > 10 && !!order[0].id, '共 ' + order.length + ' 关');

/* 4a 长战斗：挑一个血量最大的关卡，玩家伤害压到 ≈hp/8 → 能连打数回合而不结束 */
let longLv = order[0];
order.forEach(lv => { if (lv.hp > longLv.hp) longLv = lv; });
const longStats = {
  atk: 200 + (longLv.def || 0) + Math.ceil(longLv.hp / 8),
  def: 0, hp: 1e9, soulAtk: 0, soulDef: 0
};
const H8 = makeHarness({ localStorage: { 'dh-battle-speed': '8' } });
H8.sb.__setStats(longStats);
H8.sb.startBattle(longLv.id);
const boot = H8.timers.pop();
assert('开战引导延时仍是 500ms（战斗流程未改）', !!boot && boot.ms === 500, boot && String(boot.ms));
assert('★ startBattle 恢复存档里的 ×8（不再被硬重置回 ×1）', H8.get('_battleSpeed') === 8, String(H8.get('_battleSpeed')));
assert('★ 8× 按钮高亮、1× 不再高亮（界面与真实速度一致）',
  H8.btn(8).classList.contains('active') && !H8.btn(1).classList.contains('active'));
H8.timers.length = 0; boot.fn();                    // 500ms → runBattle() → 立刻推一回合并排下一次
const d8 = [H8.lastTimer().ms];
for (let i = 0; i < 2; i++) d8.push(H8.flushToLast());
assert('★ ×8：连续 3 次回合调度间隔均为 75ms（= 600/8）', d8.every(v => v === 75), JSON.stringify(d8));
assert('长战斗用例确实还在打（不是一回合秒杀导致误判）', H8.get('_battle.done') === false, 'done=' + H8.get('_battle.done'));
H8.ls['dh-battle-speed'] = '2';
H8.set('_battleSpeed', 2);                          // 等价于 app.js 点击处理器改内存值
const pending = H8.lastTimer();
H8.timers.length = 0;
pending.fn();                                       // 本回合仍按旧档收尾 → 排下一次时才读新档
const dSwitch = H8.lastTimer().ms;
assert('战斗中切档位立即生效：改 ×2 后下一次调度 300ms', dSwitch === 300, '实际 ' + dSwitch);

/* 4b ×1 仍正常（无存档 = 新玩家） */
const H1 = makeHarness({});
H1.sb.__setStats(longStats);
H1.sb.startBattle(longLv.id);
const boot1 = H1.timers.pop();
assert('×1 场景：startBattle 仍是 ×1（默认档位没被改动）', H1.get('_battleSpeed') === 1, String(H1.get('_battleSpeed')));
H1.timers.length = 0; boot1.fn();
assert('★ ×1：回合间隔仍是 600ms（原节奏未变）', H1.lastTimer().ms === 600, String(H1.lastTimer().ms));

/* 4c ★ 自动模式逐关继承：胜利 → 2s 自动进关 → 下一关仍是 ×8 */
console.log('--- 4c. 自动模式继承（胜利 → 自动进关 → 下一关） ---');
/* 关卡要「后面还有下一关」且下一关血量不至于被一击秒掉：取一个有后继、且后继血量不缩水的中间关卡 */
const cands = order.filter((lv, i) => order[i + 1] && order[i + 1].hp >= lv.hp * 0.8 && lv.hp > 0);
const midLv = cands[Math.floor(cands.length / 2)];
const nextLv = order[order.indexOf(midLv) + 1];
assert('自动进关用例：选中关卡有后继且后继血量不缩水', !!midLv && !!nextLv,
  midLv ? (midLv.id + ' → ' + nextLv.id + ' (hp ' + midLv.hp + ' → ' + nextLv.hp + ')') : '未找到');
const chainStats = {
  atk: 200 + Math.max(midLv.def || 0, nextLv.def || 0) + Math.ceil(Math.max(midLv.hp, nextLv.hp) / 8),
  def: 0, hp: 1e9, soulAtk: 0, soulDef: 0
};
const HA = makeHarness({ localStorage: { 'dh-battle-speed': '8' } });
HA.sb.__setStats(chainStats);
HA.set('_battleAuto', true);                        // 等价于 tab-game.js 点「🔄 自动」
HA.set('_battleSpeed', 8);                          // 等价于 app.js 点 ×8（落盘由点击委托负责，已存档）
HA.game().current = midLv.id;                        // 真实流程里 current 由战斗列表设置（startBattle 只收 id 参数）
HA.sb.startBattle(midLv.id);
const bootA = HA.timers.pop();
assert('自动模式开战引导仍是 500ms', !!bootA && bootA.ms === 500, bootA && String(bootA.ms));
HA.timers.length = 0; bootA.fn();
let ticks = 0, tickDelays = [];
while (!HA.get('_battle.done') && ticks < 60) { tickDelays.push(HA.flushToLast()); ticks++; }
assert('战斗在有限回合内结束（用例自检：驱动有效）', HA.get('_battle.done') === true, 'ticks=' + ticks);
assert('★ ×8 全程每个回合间隔都是 75ms（' + ticks + ' 回合）', tickDelays.every(v => v === 75), JSON.stringify(tickDelays));
const adv = HA.lastTimer();
assert('胜利后自动进关延时仍是 2000ms（未改自动节奏）', !!adv && adv.ms === 2000, adv && String(adv.ms));
HA.flushToLast();                                   // 2000ms：关 overlay + 排 200ms
const step = HA.lastTimer();
assert('200ms 后进入下一关（原流程未改）', !!step && step.ms === 200, step && String(step.ms));
const nextId = HA.game().current;
assert('玩家进度已推进到下一关（' + midLv.id + ' → ' + nextId + '，用例预期 ' + nextLv.id + '）',
  nextId === nextLv.id, String(nextId));
HA.timers.length = 0; step.fn();                    // startBattle(下一关)
const bootB = HA.timers.pop();
assert('下一关开战引导 500ms', !!bootB && bootB.ms === 500, bootB && String(bootB.ms));
assert('★ 下一关仍继承 ×8（= 修复的目标行为）', HA.get('_battleSpeed') === 8, String(HA.get('_battleSpeed')));
bootB.fn();
const dNext = HA.lastTimer().ms;
assert('★ 下一关的首次回合调度 = 75ms（修复前会被硬重置成 600ms）', dNext === 75, String(dNext));
assert('★ 8× 高亮在自动进关后仍保持（不再出现「高亮 8×、实跑 1×」）',
  HA.btn(8).classList.contains('active') && !HA.btn(1).classList.contains('active'));

/* ============================================================
   5. 源码级守卫（防回归：速度必须参与延时计算；不得再硬重置）
   ============================================================ */
console.log('--- 5. 源码级守卫 ---');
const gbSrc = src('game-battle.js');
assert('tick 循环经 battleStepDelay(…, _battleSpeed) 取间隔（速度真的参与计算）',
  /setTimeout\(\s*tick\s*,\s*battleStepDelay\([^)]*_battleSpeed\s*\)/.test(gbSrc));
assert('不存在绕过速度换算的裸除法 600/_battleSpeed', !/600\s*\/\s*_battleSpeed/.test(gbSrc));
const startBody = (function () {
  const i = gbSrc.indexOf('function startBattle');
  const j = gbSrc.indexOf('function runBattle');
  return (i >= 0 && j > i) ? gbSrc.slice(i, j) : '';
})();
assert('startBattle 经 loadBattleSpeed(…) 取速度（防再次硬重置 _battleSpeed=1）',
  /_battleSpeed\s*=\s*loadBattleSpeed\(/.test(startBody) && !/_battleSpeed\s*=\s*1[^\d]/.test(startBody));
assert('startBattle 会同步按钮高亮（防「界面 8×、实跑 1×」）', /syncBattleSpeedButtons\(\)/.test(startBody));
assert('「存」的一环存在：document 级点击委托里调用 saveBattleSpeed(…)',
  /document\.addEventListener\('click'/.test(gbSrc) && /saveBattleSpeed\(/.test(gbSrc));
assert("速度存档键唯一入口：'dh-battle-speed' 只出现在 game-battle.js",
  (function () {
    const hits = fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).filter(f => src(f).includes("'dh-battle-speed'"));
    return hits.length === 1 && hits[0] === 'game-battle.js';
  })(), "'dh-battle-speed' 出现在：" + fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).filter(f => src(f).includes("'dh-battle-speed'")).join(', '));
/* 对照组：敌群侧那套（dh-group-speed）不被本修复牵连 */
const grSrc = src('game-render.js');
assert('敌群侧仍是自己的键 dh-group-speed（两套速度互不干扰）',
  /localStorage\.getItem\('dh-group-speed'\)/.test(grSrc) && /localStorage\.setItem\('dh-group-speed'/.test(grSrc));
assert('敌群侧仍用 _groupSpeed 驱动自己的间隔（对照组机制未被动过）',
  /setTimeout\([^;]*_groupSpeed\s*\)/.test(grSrc));

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

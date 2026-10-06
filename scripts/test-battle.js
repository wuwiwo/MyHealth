#!/usr/bin/env node
/* M2a S1-C 测试：battle.js rng 注缝 + 零回归验证
   1) 确定性：同种子战斗结果一致（可复现）
   2) API 冻结：buildBattleSides/rollBossAffixFor/createBattle/battleTick/findLevel 签名不变
   3) 语义保持：dualAffix Boss 双词条、敌方属性直接取自关卡
   4) 多关卡遍历不崩 + Boss 词条组合正常
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const battleSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'battle.js'), 'utf8');
const levelsSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'levels.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(levelsSrc, sandbox);
vm.runInContext(battleSrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. API 冻结 ----
['buildBattleSides', 'rollBossAffixFor', 'createBattle', 'battleTick', 'findLevel', 'mulberry32']
  .forEach(fn => assert('API 存在: ' + fn, typeof sandbox[fn] === 'function'));

// ---- 2. findLevel 语义（嵌套 LEVELS）----
const lv11 = sandbox.findLevel('1-1');
assert('findLevel(1-1) 返回关卡', !!lv11 && lv11.id === '1-1');
assert('关卡敌方属性直接可用 (atk/def/hp)', lv11 && typeof lv11.atk === 'number' && typeof lv11.hp === 'number');
const lv166 = sandbox.findLevel('16-6');
assert('findLevel(16-6) Boss 存在', !!lv166 && lv166.boss);

// ---- 3. 确定性：同种子两次一致 ----
function runBattleSeed(seed, levelId) {
  const rng = sandbox.mulberry32(seed);
  sandbox._battleRng = rng;  // 先注入，覆盖 affix 抽取 + 战斗全程
  const lv = sandbox.findLevel(levelId);
  const sides = sandbox.buildBattleSides({ atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }, lv);
  const affix = sandbox.rollBossAffixFor(lv);
  const b = sandbox.createBattle(sides.player, sides.enemy, { npc: lv.npc, boss: lv.boss }, affix);
  let guard = 0;
  while (!b.done && guard++ < 300) sandbox.battleTick(b);
  return { winner: b.winner, turn: b.turn, pHP: b.player.hp, eHP: b.enemy.hp };
}
const r1 = runBattleSeed(42, '1-1');
const r2 = runBattleSeed(42, '1-1');
assert('同种子结果一致', JSON.stringify(r1) === JSON.stringify(r2), JSON.stringify(r1) + ' vs ' + JSON.stringify(r2));
assert('同种子 turn 一致', r1.turn === r2.turn);

// ---- 4. 不同种子不同 ----
const r3 = runBattleSeed(7, '1-1');
assert('不同种子结果不同', JSON.stringify(r1) !== JSON.stringify(r3) || r1.turn !== r3.turn);

// ---- 5. dualAffix Boss 双词条 ----
const affix166 = sandbox.rollBossAffixFor(lv166);
assert('16-6 dualAffix 双词条', !!affix166 && affix166.name && affix166.name.includes('·'), affix166 ? affix166.name : 'null');
const affix14 = sandbox.rollBossAffixFor(sandbox.findLevel('1-6'));
assert('1-6 普通 Boss 单词条', !affix14 || !affix14.name || !affix14.name.includes('·'));

// ---- 6. 多关卡遍历不崩（前 30 关）----
let crash = 0, wins = 0;
const allLevels = [];
Object.values(sandbox.LEVELS).forEach(ch => (ch.levels || []).forEach(l => allLevels.push(l)));
allLevels.slice(0, 30).forEach((lv, i) => {
  try {
    const r = runBattleSeed(100 + i, lv.id);
    if (r.winner === true) wins++;
  } catch (e) { crash++; console.log('  崩溃 ' + lv.id + ': ' + e.message); }
});
assert('前 30 关遍历无崩溃', crash === 0, crash + ' 崩溃');
assert('存在玩家胜利关卡（50/30/300 属性）', wins > 0, 'wins=' + wins);

/* ============================================================
   7. v2.5.0：battleTick 抛异常**不得伪装成玩家胜利**
   ------------------------------------------------------------
   旧实现（page/game-battle.js 的 catch）：`_battle.enemy.hp = min(hp,0)` + `winner=true`
   + `endBattle(true)` → 引擎异常会**发放通关奖励、把关卡记为已通关并推进到下一关**，
   而错误信息只进 console。下面这组断言在旧实现上**必然变红**。
   覆盖：不判胜 / 不发胜利奖励 / 不推进通关 / 不计失败次数 / 错误上下文可查
        + 反向对照（正常胜利路径仍照常发奖，证明上面的断言不是恒真）。
   ============================================================ */
console.log('\n[7] battleTick 异常不得判胜（v2.5.0）');

const gameBattleSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'game-battle.js'), 'utf8');

/* 最小 DOM 桩：只要求 getElementById/createElement/querySelectorAll/addEventListener
   返回可用的假元素，让 game-battle.js 的渲染分支不抛错（本套件不校验样式）。 */
function ghMakeEl(id) {
  const el = {
    id: id, style: {}, dataset: {}, textContent: '', innerHTML: '', offsetWidth: 0, scrollTop: 0, scrollHeight: 0,
    classList: {
      _s: {},
      add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
      toggle(c, v) { if (v) this._s[c] = 1; else delete this._s[c]; },
      contains(c) { return !!this._s[c]; }
    },
    appendChild() { }, remove() { }, addEventListener() { }, removeEventListener() { },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
  return el;
}
/* game-battle.js 的沙箱：只需单敌战斗所需的全局（battleTick 由每个用例各自注入） */
function makeGameBattleSandbox() {
  const els = {};
  const doc = {
    getElementById(id) { if (!els[id]) els[id] = ghMakeEl(id); return els[id]; },
    createElement(tag) { return ghMakeEl('_new_' + tag); },
    querySelectorAll() { return []; },
    addEventListener() { }
  };
  const game = { attempts: {}, cleared: [], current: '1-1' };
  const refine = { points: 0, unlocked: true };
  const calls = { trackLevel: [], celebrate: 0 };
  const sb = {
    Math, JSON, console, Date, document: doc,
    setTimeout() { }, clearTimeout() { },
    /* battle.js 的纯函数 + 关卡表由上一个 sandbox 提供（同源，避免第二份实现） */
    LEVELS: sandbox.LEVELS, findLevel: sandbox.findLevel,
    getGame() { return game; }, setGame() { },
    today() { return '2026-10-06'; },
    store: { get() { return null; }, set() { } },
    getGameStats() { return { atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }; },
    trackLevel(id) { calls.trackLevel.push(id); },
    getRefine() { return refine; }, saveRefine(r) { refine.points = r.points; },
    celebrate() { calls.celebrate++; }, toast() { }, showShareCard() { },
    localStorage: { getItem() { return null; }, setItem() { } }
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(gameBattleSrc, sb);
  return { sb, els, game, refine, calls };
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
/* 驱动真实的 runBattle()：_battle 是 `let` 词法绑定（不是 sandbox 属性），
   只能在上下文内部读写。 */
function ghRunBattle(host, battle, tickImpl) {
  host.sb.__ghBattle = battle;
  host.sb.battleTick = tickImpl;
  vm.runInContext('_battle = __ghBattle; _battleRunning = false; _battleAuto = false; runBattle();', host.sb);
  return vm.runInContext('_battle', host.sb);
}

/* ---- 7a. 异常路径 ---- */
{
  const host = makeGameBattleSandbox();
  const b = ghRunBattle(host, ghBattle(), function () { throw new Error('引擎自检异常 boom-777'); });
  const ctx = (typeof host.sb.getLastBattleError === 'function') ? host.sb.getLastBattleError() : null;
  assert('7a 异常不判胜（winner 不是 true）', b.winner !== true, 'winner=' + JSON.stringify(b.winner));
  assert('7a 异常不把敌人 HP 改成 0（不再伪造击杀）', b.enemy.hp === 100, 'enemy.hp=' + b.enemy.hp);
  assert('7a 战斗被标记为「异常中止」并收尾（不卡死）', b.done === true && b.aborted === true,
    JSON.stringify({ done: b.done, aborted: b.aborted }));
  assert('7a 不发胜利奖励（炼化点未增加）', host.refine.points === 0, 'points=' + host.refine.points);
  assert('7a 不推进正常通关（cleared 未增 / current 未变）',
    host.game.cleared.length === 0 && host.game.current === '1-1',
    JSON.stringify({ cleared: host.game.cleared, current: host.game.current }));
  assert('7a 不调用 trackLevel（不写关卡进度）', host.calls.trackLevel.length === 0, JSON.stringify(host.calls.trackLevel));
  assert('7a 不触发胜利庆祝', host.calls.celebrate === 0, 'celebrate=' + host.calls.celebrate);
  assert('7a 异常不计入每日失败次数（异常不是战败）', Object.keys(host.game.attempts).length === 0,
    JSON.stringify(host.game.attempts));
  assert('7a 异常面板是「中止」提示，不是胜利/战败', /异常|中止/.test(host.els.battleEnd.innerHTML)
    && !/胜利/.test(host.els.battleEnd.innerHTML),
    String(host.els.battleEnd.innerHTML).slice(0, 120));
  assert('7a 错误上下文可查：stage/message/stack 齐备',
    !!ctx && ctx.stage === 'battleTick' && /boom-777/.test(ctx.message) && !!ctx.stack,
    JSON.stringify(ctx && { stage: ctx.stage, message: ctx.message, hasStack: !!ctx.stack }));
  assert('7a 错误上下文含定位字段（回合 / 关卡 / 敌我 HP / 时间）',
    !!ctx && ctx.turn === 0 && ctx.level === '1-1' && ctx.npc === '测试兵'
    && ctx.playerHP === 300 && ctx.enemyHP === 100 && !!ctx.at,
    JSON.stringify(ctx && { turn: ctx.turn, level: ctx.level, npc: ctx.npc, at: ctx.at }));
  assert('7a 错误上下文同时挂在战斗对象上（可从 _battle 复查）',
    !!b.error && b.error.message === ctx.message && /boom-777/.test(b.error.message),
    JSON.stringify(b.error && b.error.message));
}
/* ---- 7b. 正常胜利路径对照（防止 7a 变成恒真断言） ---- */
{
  const host = makeGameBattleSandbox();
  const b = ghRunBattle(host, ghBattle(), function (bb) {
    bb.turn = 1; bb.enemy.hp = 0; bb.done = true; bb.winner = true;
    return { turn: 1, events: [] };
  });
  assert('7b 对照：正常胜利仍发奖励并推进通关', host.refine.points > 0 && host.game.cleared.length === 1,
    JSON.stringify({ points: host.refine.points, cleared: host.game.cleared }));
  assert('7b 对照：正常胜利写关卡进度且无异常标记',
    host.calls.trackLevel.length === 1 && !b.aborted && !b.error,
    JSON.stringify({ trackLevel: host.calls.trackLevel, aborted: b.aborted }));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

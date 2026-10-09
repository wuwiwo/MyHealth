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
    appendChild() { this.appendChildCount = (this.appendChildCount || 0) + 1; }, remove() { }, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, click() { if (this.handlers.click) this.handlers.click(); }, removeEventListener() { },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
  return el;
}
/* game-battle.js 的沙箱：只需单敌战斗所需的全局（battleTick 由每个用例各自注入） */
function makeGameBattleSandbox() {
  const els = {};
  const docEvents = {}, winEvents = {};
  const doc = {
    getElementById(id) { if (!els[id]) { const el=ghMakeEl(id); el.id=id; els[id] = el; } return els[id]; },
    createElement(tag) { return ghMakeEl('_new_' + tag); },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { docEvents[type] = fn; }
  };
  const game = { attempts: {}, cleared: [], current: '1-1' };
  const refine = { points: 0, unlocked: true };
  const calls = { trackLevel: [], celebrate: 0 };
  const sb = {
    Math, JSON, console, Date, document: doc,
    setTimeout() { }, clearTimeout() { },
    addEventListener(type, fn) { winEvents[type] = fn; },
    /* battle.js 的纯函数 + 关卡表由上一个 sandbox 提供（同源，避免第二份实现） */
    LEVELS: sandbox.LEVELS, findLevel: sandbox.findLevel,
    buildBattleSides: sandbox.buildBattleSides, createBattle: sandbox.createBattle,
    rollBossAffixFor: sandbox.rollBossAffixFor,
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
  return { sb, els, game, refine, calls, docEvents, winEvents };
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

/* ============================================================
   8. v2.5.1 单敌 Boss 吸血 / 护盾 / 伤害来源与目标口径
   用户裁决：生命汲取 = 敌方物理 HP 伤害的 25%；单敌魂伤会过护盾；
   荆棘反伤按护盾吸收前伤害。事件 type='damage' 不编码攻击方向，
   方向由 sourceSide / targetSide 明确表达，UI 应按这两个字段播放动画。
   ============================================================ */
console.log('\n[8] v2.5.1 单敌伤害结算与事件方向');

const lifestealAffix = sandbox.BOSS_AFFIXES.find(a => a.name === '生命汲取');
assert('8 生命汲取唯一倍率常量 = 25%', sandbox.BOSS_LIFESTEAL_RATE === 0.25,
  'BOSS_LIFESTEAL_RATE=' + sandbox.BOSS_LIFESTEAL_RATE);
assert('8 Boss 词条池含唯一生命汲取项', sandbox.BOSS_AFFIXES.filter(a => a.name === '生命汲取').length === 1);
{
  const samples = [1, 3, 21, 23, 100, 1001, 10000, 12345];
  let invariant = true, counterexampleAgainstHalf = false;
  samples.forEach(function (dmg) {
    const boss = { hp: 1000000, _heal: 0 };
    lifestealAffix.onAttack(dmg, boss);
    if (boss._heal !== Math.floor(dmg * sandbox.BOSS_LIFESTEAL_RATE)) invariant = false;
    if (dmg === 10000) counterexampleAgainstHalf = boss._heal > Math.floor(dmg * 0.125);
  });
  assert('8 25% 不变量：样本回血等于 floor(物理伤害×唯一倍率)', invariant,
    'rate=' + sandbox.BOSS_LIFESTEAL_RATE);
  assert('8 反证：保留旧 ×50% 会低于已裁 25%', counterexampleAgainstHalf);
  const boss = { hp: 100, _heal: 0 };
  lifestealAffix.onAttack(21, boss);
  lifestealAffix.onAttack(23, boss);
  assert('8 多次攻击按逐击 floor 累积 25%（5+5=10）', boss._heal === 10,
    '_heal=' + boss._heal);
}
{
  /* 真实 battleTick：玩家攻击 1 点（被高防压至最低 1），Boss 物理攻击 21 点，
     Boss 起始 80 HP → 玩家击后 79 → 按 25% 回 5 → 84。 */
  const affix = Object.assign({}, lifestealAffix, { index: 3 });
  const b = sandbox.createBattle(
    { atk: 1, def: 0, hp: 100, soulAtk: 0, soulDef: 0 },
    { atk: 20, def: 100, hp: 80, soulAtk: 0, soulDef: 0 },
    { npc: '吸血测试 Boss', boss: true }, affix, function () { return 0; });
  const r = sandbox.battleTick(b);
  const healEvent = r.events.find(e => /Boss 生命汲取/.test(e.msg));
  assert('8 实战 Boss 每次物理伤害 21 后回复 5 HP', b.enemy.hp === 84,
    'enemy.hp=' + b.enemy.hp + ' events=' + JSON.stringify(r.events));
  /* 判据必须是「日志数 = 真实回血数」：旧实现日志写 5、实际只回 2（残留 ×50%），
     只断言日志文案会放过这个 bug（实测旧代码 enemy.hp=81 → 真实回血 2）。 */
  const healMsg = healEvent ? /恢复 (\d+) HP/.exec(healEvent.msg) : null;
  const loggedHeal = healMsg ? Number(healMsg[1]) : NaN;
  const actualHeal = b.enemy.hp - 79;   // 玩家先打 1 点（80→79），随后才结算汲取
  assert('8 吸血日志报告实际回复量（日志数 = 真实回血数）',
    loggedHeal === 5 && actualHeal === loggedHeal,
    JSON.stringify({ logged: loggedHeal, actualHeal: actualHeal, enemyHP: b.enemy.hp }));
}
{
  /* shield=10；玩家物理攻击=20，HP 实伤=10；荆棘函数收到吸收前的 20。 */
  let reflectInput = null;
  const thorns = { index: 1, reflect(dmg) { reflectInput = dmg; return Math.floor(dmg / 2); } };
  const b = sandbox.createBattle(
    { atk: 19, def: 0, hp: 100, soulAtk: 0, soulDef: 0 },
    { atk: 0, def: 0, hp: 100, soulAtk: 0, soulDef: 0 },
    { npc: '护盾测试 Boss', boss: true }, thorns, function () { return 0; });
  b.enemy._shield = 10;
  const r = sandbox.battleTick(b);
  const hit = r.events.find(e => e.targetSide === 'enemy' && e.type === 'damage');
  const reflect = r.events.find(e => /荆棘反伤/.test(e.msg));
  assert('8 护盾吸收 10 后敌方 HP 只扣 10', b.enemy.hp === 90 && b.enemy._shield === 0,
    JSON.stringify({ hp: b.enemy.hp, shield: b.enemy._shield }));
  assert('8 伤害事件分开记录来源/目标、hpDamage=10 与 shieldAbsorbed=10', !!hit
    && hit.sourceSide === 'player' && hit.targetSide === 'enemy'
    && hit.hpDamage === 10 && hit.shieldAbsorbed === 10,
    JSON.stringify(hit));
  assert('8 荆棘反伤事件为敌人→玩家且按吸收前 20 结算', reflectInput === 20
    && !!reflect && reflect.sourceSide === 'enemy' && reflect.targetSide === 'player'
    && reflect.rawDamage === 10 && reflect.hpDamage === 10,
    JSON.stringify({ reflectInput: reflectInput, event: reflect }));
}
{
  /* 物理 1 点先吃盾 1，余盾 9；魂伤 20 再吃盾 9，只扣 HP 11。 */
  const b = sandbox.createBattle(
    { atk: 1, def: 0, hp: 100, soulAtk: 20, soulDef: 0 },
    { atk: 0, def: 100, hp: 100, soulAtk: 0, soulDef: 0 },
    { npc: '魂伤盾测试 Boss', boss: true }, null, function () { return 0; });
  b.enemy._shield = 10;
  const r = sandbox.battleTick(b);
  const soulHit = r.events.find(e => /魂攻击/.test(e.msg) && e.targetSide === 'enemy');
  assert('8 单敌魂伤经过护盾：最终 HP=89、护盾=0', b.enemy.hp === 89 && b.enemy._shield === 0,
    JSON.stringify({ hp: b.enemy.hp, shield: b.enemy._shield }));
  assert('8 魂伤事件标记玩家→敌人并记录 rawDamage=20 / 护盾吸收 9 / HP 伤害 11', !!soulHit
    && soulHit.sourceSide === 'player' && soulHit.targetSide === 'enemy'
    && soulHit.rawDamage === 20 && soulHit.amount === 11 && soulHit.shieldAbsorbed === 9 && soulHit.hpDamage === 11,
    JSON.stringify(soulHit));
}
/* 护盾三种边界 × 物理 / 魂伤（计划 §2 任务 2 的验收项）：
   逐击「先吃盾、余量扣 HP」，核对 HP / 剩余护盾 / 事件记账与日志。
   · 物理侧令 atk = raw-1：rng 钉 0 时 rollDamage = atk+1，物理伤害恰好等于 raw；
   · 魂伤侧物理那一下固定 1 点（atk=0 → rollDamage 下限 1），故通道按 [1, raw] 依次吃盾。
   期望值由同一模型独立算出，不写死常数。 */
function shieldSteps(shield, raws) {
  let s = shield, hpLoss = 0;
  const steps = raws.map(function (r) {
    const a = Math.min(s, r); s -= a;
    const st = { raw: r, shieldAbsorbed: a, hpDamage: r - a, shieldAfter: s };
    hpLoss += st.hpDamage;
    return st;
  });
  return { steps: steps, shieldAfter: s, hpLoss: hpLoss };
}
function shieldBoundary(damageType, raw, shield) {
  const enemy = { atk: 0, def: 0, hp: 1000, soulAtk: 0, soulDef: 0 };
  const player = (damageType === 'soul')
    ? { atk: 0, def: 0, hp: 1000, soulAtk: raw, soulDef: 0 }
    : { atk: raw - 1, def: 0, hp: 1000, soulAtk: 0, soulDef: 0 };
  const b = sandbox.createBattle(player, enemy, { npc: '盾边界', boss: false }, null, function () { return 0; });
  b.enemy._shield = shield;
  const r = sandbox.battleTick(b);
  const dmgEvs = r.events.filter(function (e) { return e.targetSide === 'enemy' && e.type === 'damage'; });
  const shieldEvs = r.events.filter(function (e) { return e.type === 'shield' && e.targetSide === 'enemy'; });
  return { hp: b.enemy.hp, shield: b.enemy._shield, ev: dmgEvs[dmgEvs.length - 1] || null, shieldEvs: shieldEvs };
}
[['physical', 10, 30, '不破'], ['physical', 20, 20, '恰好破'], ['physical', 30, 20, '超量破'],
 ['soul', 10, 30, '不破'], ['soul', 20, 20, '恰好破'], ['soul', 30, 20, '超量破']
].forEach(function (cs) {
  const type = cs[0], raw = cs[1], shield = cs[2], label = cs[3];
  const kindCn = (type === 'soul' ? '魂伤' : '物理');
  const chain = shieldSteps(shield, type === 'soul' ? [1, raw] : [raw]);
  const want = chain.steps[chain.steps.length - 1];
  const got = shieldBoundary(type, raw, shield);
  assert('8 护盾边界(' + kindCn + '·' + label + ') HP 只扣余量 ' + chain.hpLoss,
    got.hp === 1000 - chain.hpLoss, 'hp=' + got.hp + ' want=' + (1000 - chain.hpLoss));
  assert('8 护盾边界(' + kindCn + '·' + label + ') 剩余护盾 = ' + chain.shieldAfter,
    got.shield === chain.shieldAfter, 'shield=' + got.shield + ' want=' + chain.shieldAfter);
  assert('8 护盾边界(' + kindCn + '·' + label + ') 事件记账 rawDamage/shieldAbsorbed/hpDamage 与日志',
    !!got.ev && got.ev.damageType === type
    && got.ev.rawDamage === raw
    && got.ev.shieldAbsorbed === want.shieldAbsorbed
    && got.ev.hpDamage === want.hpDamage
    && new RegExp('→ ' + want.hpDamage + (type === 'soul' ? ' 魂伤害' : ' 伤害')).test(got.ev.msg),
    JSON.stringify(got.ev));
  const absorbedTotal = chain.steps.reduce(function (n, s) { return n + s.shieldAbsorbed; }, 0);
  assert('8 护盾边界(' + kindCn + '·' + label + ') 吸收事件条数与吸收量一致（' + absorbedTotal + '）',
    got.shieldEvs.length === chain.steps.filter(function (s) { return s.shieldAbsorbed > 0; }).length
    && got.shieldEvs.reduce(function (n, e) { return n + e.amount; }, 0) === absorbedTotal,
    JSON.stringify(got.shieldEvs.map(function (e) { return e.amount; })));
});


{
  const host = makeGameBattleSandbox();
  /* 旧代码没有这两个函数：**必须干净地判失败**，不能让整份套件崩在 TypeError 上
     （崩掉的结果行缺失，严格运行器只能把它归类为「格式无法识别」，可诊断性差）。 */
  const sidesFn = (typeof host.sb.battleEventSides === 'function') ? host.sb.battleEventSides : null;
  const animFn = (typeof host.sb.animateBattleEvent === 'function') ? host.sb.animateBattleEvent : null;
  const p = ghMakeEl('battlePlayer'), e = ghMakeEl('battleEnemy');
  assert('8 UI 事件映射函数存在（不再按旧 dmg/e 类型猜方向）', !!sidesFn && !!animFn,
    JSON.stringify({ sides: !!sidesFn, anim: !!animFn }));
  const playerHit = { type: 'damage', sourceSide: 'player', targetSide: 'enemy',
    amount: 10, hpDamage: 10, msg: '玩家攻击敌人 → 10 伤害' };
  const enemyHit = { type: 'damage', sourceSide: 'enemy', targetSide: 'player',
    amount: 10, hpDamage: 10, msg: '敌人攻击玩家 → 10 伤害' };
  assert('8 事件映射显式返回玩家→敌人', !!sidesFn && JSON.stringify(sidesFn(playerHit))
    === JSON.stringify({ sourceSide: 'player', targetSide: 'enemy' }));
  assert('8 事件映射显式返回敌人→玩家', !!sidesFn && JSON.stringify(sidesFn(enemyHit))
    === JSON.stringify({ sourceSide: 'enemy', targetSide: 'player' }));
  if (animFn) animFn(playerHit, p, e);
  assert('8 UI：玩家攻击事件使玩家前冲、敌人受击', !!animFn && p.classList.contains('attacking')
    && e.classList.contains('hit'), JSON.stringify({ player: p.classList._s, enemy: e.classList._s }));
  const p2 = ghMakeEl('battlePlayer'), e2 = ghMakeEl('battleEnemy');
  if (animFn) animFn(enemyHit, p2, e2);
  assert('8 UI：敌人攻击事件使敌人前冲、玩家受击', !!animFn && e2.classList.contains('attacking-enemy')
    && p2.classList.contains('hit'), JSON.stringify({ player: p2.classList._s, enemy: e2.classList._s }));
  const p3 = ghMakeEl('battlePlayer'), e3 = ghMakeEl('battleEnemy');
  if (animFn) animFn({ type: 'damage', damageType: 'reflect', sourceSide: 'enemy', targetSide: 'player',
    amount: 10, hpDamage: 10, msg: '荆棘反伤 → 10 伤害' }, p3, e3);
  assert('8 UI：反伤只表现为玩家受击，不伪装成敌方前冲', !!animFn && p3.classList.contains('hit')
    && !e3.classList.contains('attacking-enemy'), JSON.stringify({ player: p3.classList._s, enemy: e3.classList._s }));
}

/* ============================================================
   9. v2.5.2：异常守卫必须覆盖整段 tick，且错误上下文要能复位
   ------------------------------------------------------------
   旧实现的 try 只包 `battleTick`：其后的日志/渲染块一旦抛错（畸形返回、缺 DOM 节点）
   会**逃逸出 runBattle** → `_battleRunning` 卡 true、`done` 仍 false、无计时器、无提示、
   无错误上下文 = 永久冻结。本节在旧代码上必红。
   ============================================================ */
console.log('\n[9] 异常守卫覆盖整段 tick + 错误上下文复位（v2.5.2）');

/* ---- 9a. 渲染/日志块抛错（畸形返回）不得让战斗冻结 ---- */
let abortedBattle = null;
{
  const host = makeGameBattleSandbox();
  let escaped = null, b = null;
  try {
    b = ghRunBattle(host, ghBattle(), function (bb) { bb.turn = 1; return { turn: 1 }; });  // 缺 events → 渲染块抛 TypeError
  } catch (e) { escaped = String(e && e.message); }
  abortedBattle = b;
  const ctx = (typeof host.sb.getLastBattleError === 'function') ? host.sb.getLastBattleError() : null;
  const running = (function () { try { return vm.runInContext('_battleRunning', host.sb); } catch (e) { return 'unreadable'; } })();
  assert('9a 渲染块抛错不会逃逸出 runBattle', escaped === null, String(escaped));
  assert('9a 战斗被收尾（done+aborted），没有卡在 _battleRunning=true', running === false
    && !!b && b.done === true && b.aborted === true,
    JSON.stringify({ running: running, done: b && b.done, aborted: b && b.aborted }));
  assert('9a 仍然留下可查的错误上下文（stage 能区分是渲染阶段而不是引擎 tick）',
    !!ctx && ctx.stage === 'battleRender' && /forEach/.test(ctx.message || ''),
    JSON.stringify(ctx && { stage: ctx.stage, message: ctx.message }));
  assert('9a 该路径同样不发奖、不推进通关', host.refine.points === 0 && host.game.cleared.length === 0,
    JSON.stringify({ points: host.refine.points, cleared: host.game.cleared }));
}
/* ---- 9b. 新一场战斗开始时清掉上一场的错误上下文 ---- */
{
  const host = makeGameBattleSandbox();
  /* 前置必须用「抛错的 battleTick」：这条路径在旧代码里也会走 endBattleAborted、真的留下上下文；
     若用渲染块抛错，旧代码会先逃逸掉、上下文恒为 null，后面的复位断言就成了恒真。 */
  let escaped = null;
  try {
    ghRunBattle(host, ghBattle(), function () { throw new Error('boom-9b'); });
  } catch (e) { escaped = String(e && e.message); }
  const afterAbort = (typeof host.sb.getLastBattleError === 'function') ? host.sb.getLastBattleError() : null;
  assert('9b 前置条件：抛错路径确实留下了异常上下文（否则复位断言会恒真）',
    escaped === null && !!afterAbort && /boom-9b/.test(afterAbort.message || ''),
    JSON.stringify({ escaped: escaped, ctx: afterAbort && afterAbort.message }));
  const b2 = ghRunBattle(host, ghBattle(), function (bb) {
    bb.turn = 1; bb.enemy.hp = 0; bb.done = true; bb.winner = true;
    return { turn: 1, events: [] };
  });
  const afterNormal = (typeof host.sb.getLastBattleError === 'function') ? host.sb.getLastBattleError() : 'MISSING';
  assert('9b 正常战斗开始后 getLastBattleError() 复位为 null（注释承诺「正常战斗保持 null」）',
    afterNormal === null, JSON.stringify(afterNormal));
  assert('9b 复位不影响本场正常结算', b2.winner === true && host.refine.points > 0,
    JSON.stringify({ winner: b2.winner, points: host.refine.points }));
}

console.log('\n[9] 单敌演出 parity（v2.11.3：评审根因 1 单敌侧）');
{
  /* (a) 档位策略表：寿命随档位收缩、×2 起聚合 */
  const host = makeGameBattleSandbox();
  const pol = s2 => (typeof host.sb.battleFxPolicy === 'function' ? host.sb.battleFxPolicy(s2) : undefined);
  const q1 = pol(1), q2 = pol(2), q4 = pol(4), q8 = pol(8);
  assert('9a battleFxPolicy 给出四档策略（源码级）', !!(q1 && q2 && q4 && q8), JSON.stringify({ q1: q1, q8: q8 }));
  assert('9a ×1：不聚合、寿命 600ms（与既有 .bc-impact .6s 对齐）', !!q1 && q1.aggregate === false && q1.lifeMs === 600, JSON.stringify(q1));
  assert('9a ×2 起聚合、寿命随档位收缩（×4 ≤ 260 / ×8 ≤ 170）',
    !!q2 && q2.aggregate === true && q2.lifeMs < q1.lifeMs && q4.lifeMs <= 260 && q8.lifeMs <= 170,
    JSON.stringify({ q2: q2, q4: q4, q8: q8 }));
  assert('9a ×8 寿命 < 2 个步进（评审口径：不超过约 1~2 批）', !!q8 && q8.lifeMs < q8.stepMs * 2, JSON.stringify(q8));

  /* (b)(c)(d) 一 tick 三个同目标伤害事件 → 1 个 impact、带内联动画时长、每单位只重启一次动画 */
  const created = [];
  const origCreate = host.sb.document.createElement.bind(host.sb.document);
  host.sb.document.createElement = function (tag) { const el = origCreate(tag); created.push(el); return el; };
  const p = host.sb.document.getElementById('battlePlayer');
  const e = host.sb.document.getElementById('battleEnemy');
  const reflows = { p: 0, e: 0 };
  Object.defineProperty(p, 'offsetWidth', { get() { reflows.p++; return 0; }, configurable: true });
  Object.defineProperty(e, 'offsetWidth', { get() { reflows.e++; return 0; }, configurable: true });
  /* ⚠️ `_battleSpeed` 是 `let` 声明（不是 sandbox 属性）→ 必须走 vm.runInContext 才能改到模块内变量 */
  vm.runInContext('_battleSpeed=4', host.sb);
  const evs = [
    { type: 'damage', damageType: 'physical', sourceSide: 'player', targetSide: 'enemy', hpDamage: 100, msg: '⚔️ 甲 攻击 乙 → 100 伤害' },
    { type: 'damage', damageType: 'soul', sourceSide: 'player', targetSide: 'enemy', hpDamage: 150, msg: '👻 甲 魂攻击 乙 → 150 魂伤害' },
    { type: 'damage', damageType: 'physical', sourceSide: 'player', targetSide: 'enemy', hpDamage: 50, msg: '⚔️ 甲 攻击 乙 → 50 伤害' }
  ];
  if (typeof host.sb.animateBattleEvents === 'function') host.sb.animateBattleEvents(evs, p, e, 100000);
  const impacts = created.filter(x => String(x.className || '').indexOf('bc-impact') >= 0);
  assert('9b ×4 同目标 3 次伤害聚合成 1 个 impact（旧实现 3 个）', impacts.length === 1,
    'n=' + impacts.length + ' | texts=' + JSON.stringify(impacts.map(i => i.textContent)));
  assert('9c 聚合数值 = 三者之和（100+150+50=300）', impacts.length === 1 && /300/.test(String(impacts[0].textContent)),
    JSON.stringify(impacts.map(i => i.textContent)));
  assert('9c impact 带内联 animationDuration = 档位寿命（旧实现只有 CSS 固定 .6s）',
    impacts.length === 1 && String(impacts[0].style.animationDuration) === q4.lifeMs + 'ms',
    'duration=' + (impacts[0] && impacts[0].style.animationDuration) + ' | 期望 ' + (q4 || {}).lifeMs + 'ms');
  assert('9d 一 tick 内每单位只强制重启一次动画（旧实现每事件一次 reflow）',
    reflows.e <= 1 && reflows.p <= 1, JSON.stringify(reflows));
  assert('9d 受击类确实挂上了（不是因为没动而「只有一次」）', e.classList.contains('hit') && p.classList.contains('attacking'),
    JSON.stringify({ e: e.classList._s, p: p.classList._s }));
}
console.log('\n[10] 单敌状态类即时反馈（v2.11.4：评审根因 3 的单敌侧）');
{
  const host = makeGameBattleSandbox();
  const created = [];
  const origCreate = host.sb.document.createElement.bind(host.sb.document);
  host.sb.document.createElement = function (tag) { const el = origCreate(tag); created.push(el); return el; };
  const p = host.sb.document.getElementById('battlePlayer');
  const e = host.sb.document.getElementById('battleEnemy');
  vm.runInContext('_battleSpeed=1', host.sb);
  const marksOf = () => created.filter(x => String(x.className || '').indexOf('bc-mark') >= 0);

  /* (a) 护盾吸收 → 敌人身上 1 条标记 */
  created.length = 0;
  if (typeof host.sb.animateBattleEvents === 'function') host.sb.animateBattleEvents([
    { msg: '🛡️ 敌人 护盾吸收 120', type: 'shield', sourceSide: 'player', targetSide: 'enemy', shieldAbsorbed: 120, amount: 120, hpDamage: 0 }
  ], p, e, 200000);
  const m1 = marksOf();
  assert('10a 护盾吸收产生 1 条即时标记（旧实现 0 条）', m1.length === 1, 'n=' + m1.length);
  assert('10a 标记内容含护盾与吸收量', m1.length === 1 && /🛡️/.test(m1[0].textContent) && /120/.test(m1[0].textContent), JSON.stringify(m1.map(x => x.textContent)));
  assert('10a 标记挂在**目标**元素上（enemy）', m1.length === 1 && e.appendChildCount === 1, 'enemyAppends=' + e.appendChildCount + ' playerAppends=' + p.appendChildCount);
  assert('10a 标记带内联 animationDuration（随档位）', m1.length === 1 && String(m1[0].style.animationDuration) === '600ms', 'd=' + (m1[0] && m1[0].style.animationDuration));

  /* (b) 护盾破碎 → 标记含破碎语义；同侧两条只出一条（防刷屏） */
  created.length = 0;
  if (typeof host.sb.animateBattleEvents === 'function') host.sb.animateBattleEvents([
    { msg: '🛡️ 你 护盾吸收 30（护盾破碎）', type: 'shield', sourceSide: 'enemy', targetSide: 'player', shieldAbsorbed: 30, amount: 30, hpDamage: 0 },
    { msg: '🛡️ 你 护盾吸收 10', type: 'shield', sourceSide: 'enemy', targetSide: 'player', shieldAbsorbed: 10, amount: 10, hpDamage: 0 }
  ], p, e, 201000);
  const m2 = marksOf();
  assert('10b 同一目标一 tick 内最多 1 条标记（不刷屏）', m2.length === 1, 'n=' + m2.length);
  assert('10b 护盾破碎语义保留（🛡️💥）', m2.length === 1 && /💥/.test(m2[0].textContent), JSON.stringify(m2.map(x => x.textContent)));

  /* (c) 无法识别的状态 / 缺 targetSide → 不出标记（防噪声） */
  created.length = 0;
  if (typeof host.sb.animateBattleEvents === 'function') host.sb.animateBattleEvents([
    { msg: '某个不可识别的状态变化', type: 'def', sourceSide: 'enemy', targetSide: 'player' },
    { msg: '🛡️ 护盾吸收 50', type: 'shield', sourceSide: 'player' }
  ], p, e, 202000);
  assert('10c 不可识别 / 缺 targetSide 的事件**不**产生标记（不猜、不造噪声）', marksOf().length === 0, 'n=' + marksOf().length);
}
/* ============================================================
   11. 批次 A：终局按 800ms 胜负 → 1200ms 战果 → 战绩推进
   ------------------------------------------------------------
   对 endBattle 使用可控时钟驱动公开渲染入口；结算只能发生在 endBattle，
   推进展示 timer 不得再次发奖/写进度。旧版会立即同时显示所有层并设 2 秒 auto。
   ============================================================ */
console.log('\n[11] 批次 A 单敌终局分阶段与 auto 中止');
/* 可控时钟终局宿主：
   · `Date.now()` 由假时钟提供，fire 时**推进到该 timer 的到期时刻**（真实浏览器语义：
     timer 不会提前触发），phase/auto 的绝对 deadline 才能被精确断言；
   · `#battleEnd` 的 innerHTML 赋值会重建其中的 id 节点（真实 DOM 语义）——否则
     `bindContinue` 会把旧层的 click 监听器叠加到同一个假元素上，点击一次推进两层。 */
function makeOutroHost(startClock){
  const host=makeGameBattleSandbox();
  const tasks=[];let nextId=1;
  let now=(typeof startClock==='number')?startClock:1000;
  host.sb.Date={now:()=>now};
  /* 结算含 Math.random（战利品）→ 固定随机数，便于跨 host 逐项对比 */
  const detMath=Object.create(Math);detMath.random=function(){return 0.5};
  host.sb.Math=detMath;
  host.sb.setTimeout=function(fn,ms){const t={id:nextId++,fn:fn,ms:(typeof ms==='number'?ms:0),due:now+(typeof ms==='number'?ms:0),cancelled:false};tasks.push(t);return t.id};
  host.sb.clearTimeout=function(id){const t=tasks.find(x=>x.id===id);if(t)t.cancelled=true};
  const end=host.sb.document.getElementById('battleEnd');let endHtml='';
  const layerNodes=Object.create(null);
  Object.defineProperty(end,'innerHTML',{configurable:true,
    get(){return endHtml},
    set(v){endHtml=String(v);
      Object.keys(layerNodes).forEach(k=>delete layerNodes[k]);
      (endHtml.match(/id="[^"]+"/g)||[]).forEach(x=>{const id=x.slice(4,-1);layerNodes[id]=ghMakeEl(id)})}});
  const baseGet=host.sb.document.getElementById.bind(host.sb.document);
  host.sb.document.getElementById=function(id){if(id==='battleEnd')return end;if(layerNodes[id])return layerNodes[id];return baseGet(id)};
  host.sb.document.getElementById('battleOverlay').classList.add('open');
  host.sb.__tasks=tasks;
  host.sb.__now=function(){return now};
  host.sb.__setNow=function(v){now=v};
  /* 按名义延时触发（并把假时钟推进到到期时刻）；找不到则返回 false（断言据此判红） */
  host.sb.__runDelay=function(ms){
    const t=tasks.find(x=>!x.cancelled&&x.ms===ms);
    if(!t)return false;
    t.cancelled=true;if(t.due>now)now=t.due;t.fn();return true;
  };
  host.sb.__pending=function(){return tasks.filter(x=>!x.cancelled)};
  return host;
}
{
  const host=makeOutroHost();
  const b=ghBattle();
  b.done=true;b.winner=true;b.enemy.hp=0;
  host.sb.getGame().current='1-1';
  host.sb.getGame().cleared=[];
  host.sb._battleAuto=false;
  vm.runInContext('_battle=__ghBattle; endBattle(true)',Object.assign(host.sb,{__ghBattle:b}));
  const end=host.els.battleEnd;
  assert('11 普通胜利初始只呈现胜负，不提前显示战果/战绩动作',/胜利/.test(end.innerHTML)&&!/战利品/.test(end.innerHTML)&&!/battleNext/.test(end.innerHTML),String(end.innerHTML).slice(0,160));
  assert('11 800ms 后才呈现战果',host.sb.__runDelay(800)&&/战利品/.test(end.innerHTML)&&!/battleNext/.test(end.innerHTML),String(end.innerHTML).slice(0,160));
  assert('11 再经 1200ms 才呈现战绩操作',host.sb.__runDelay(1200)&&/battleNext/.test(end.innerHTML),String(end.innerHTML).slice(0,160));
  const once={points:host.refine.points,cleared:host.game.cleared.slice(),tracks:host.calls.trackLevel.slice(),attempts:JSON.stringify(host.game.attempts)};
  vm.runInContext('_battle=__ghBattle; endBattle(true)',Object.assign(host.sb,{__ghBattle:b}));
  assert('11 重复 endBattle 对同一实例保持结算幂等（无二次奖励/进度）',host.refine.points===once.points&&host.game.cleared.length===once.cleared.length&&host.calls.trackLevel.length===once.tracks.length&&JSON.stringify(host.game.attempts)===once.attempts,
    JSON.stringify({once:once,again:{points:host.refine.points,cleared:host.game.cleared,tracks:host.calls.trackLevel,attempts:host.game.attempts}}));
}
{
  const host=makeOutroHost();
  const b=ghBattle();b.done=true;b.winner=true;b.enemy.hp=0;
  host.sb.getGame().current='1-1';host.sb.getGame().cleared=[];
  vm.runInContext('_battleAuto=true',host.sb);
  Object.assign(host.sb,{__ghBattle:b});
  vm.runInContext('_battle=__ghBattle; endBattle(true)',host.sb);
  assert('11 auto 胜利同样先展示胜负 800ms',!/战利品/.test(host.els.battleEnd.innerHTML)&&host.sb.__tasks.some(t=>t.ms===800),String(host.els.battleEnd.innerHTML));
  assert('11 auto 胜利战果不少于 2000ms 后安排推进',host.sb.__runDelay(800)&&/战利品/.test(host.els.battleEnd.innerHTML)&&host.sb.__tasks.some(t=>t.ms===2000),JSON.stringify(host.sb.__tasks.map(t=>t.ms)));
  vm.runInContext('_battleAuto=false',host.sb);
  const before=host.calls.trackLevel.length;
  host.sb.__runDelay(2000);
  assert('11 玩家关闭 auto 可阻止自动下一关',host.els.battleOverlay.classList.contains('open')&&host.calls.trackLevel.length===before,
    JSON.stringify({open:host.els.battleOverlay.classList.contains('open'),tracks:host.calls.trackLevel.length}));
}
{
  const host=makeOutroHost();
  const b=ghBattle();b.done=true;b.winner=false;b.player.hp=0;
  host.sb.getGame().current='1-1';
  vm.runInContext('_battleAuto=true',host.sb);Object.assign(host.sb,{__ghBattle:b});
  vm.runInContext('_battle=__ghBattle; endBattle(false)',host.sb);
  assert('11 单敌失败立即关闭 auto 且只显示胜负层',vm.runInContext('_battleAuto',host.sb)===false&&/战败/.test(host.els.battleEnd.innerHTML)&&!/battleRetry/.test(host.els.battleEnd.innerHTML),String(host.els.battleEnd.innerHTML));
  assert('11 失败 800ms 后展示失败战果而非奖励',host.sb.__runDelay(800)&&/失败/.test(host.els.battleEnd.innerHTML)&&!/战利品/.test(host.els.battleEnd.innerHTML)&&!/battleRetry/.test(host.els.battleEnd.innerHTML),String(host.els.battleEnd.innerHTML));
  assert('11 失败战果后才出现重试层且不会自动重试',host.sb.__runDelay(1200)&&/battleRetry/.test(host.els.battleEnd.innerHTML)&&!host.sb.__tasks.some(t=>t.ms===2000),String(host.els.battleEnd.innerHTML));
}

/* ============================================================
   12. 批次 A 收尾（F2/F3/F4/F5）：显式「继续」、跨后台追赶、本场快照、彩带分层
   ------------------------------------------------------------
   全部用假时钟（fire 时推进到到期时刻）驱动真实 endBattle / resumeBattleOutroTimers，
   断言「按绝对 deadline 追赶多个已过期阶段」「提前推进后旧 callback 失效」
   「重复/迟到 callback 不重绘旧层、不二次结算」。
   ============================================================ */
console.log('\n[12] 批次 A 收尾：显式推进 / 后台追赶 / 本场快照 / 彩带分层');

/* 结算快照（用于断言「只结算一次」「追赶与单步一致」；彩带次数单独断言） */
function outroSettlement(host){
  return JSON.stringify({points:host.refine.points,cleared:host.sb.getGame().cleared.slice(),
    tracks:host.calls.trackLevel.slice(),attempts:host.sb.getGame().attempts||{},
    current:host.sb.getGame().current});
}
function ghWinBattle(){const b=ghBattle();b.done=true;b.winner=true;b.enemy.hp=0;return b}
function ghLoseBattle(){const b=ghBattle();b.done=true;b.winner=false;b.player.hp=0;return b}
function ghStartOutro(host,battle,auto){
  host.sb.getGame().current='1-1';host.sb.getGame().cleared=[];
  vm.runInContext('_battleAuto='+(auto?'true':'false'),host.sb);
  vm.runInContext('_battle=__ghBattle; endBattle('+(battle.winner?'true':'false')+')',Object.assign(host.sb,{__ghBattle:battle}));
}

/* ---- 12a 胜负层「继续」提前推进 + 旧 800/1200 callback 失效 ---- */
{
  const host=makeOutroHost(10000);
  ghStartOutro(host,ghWinBattle(),false);
  const end=host.els.battleEnd;
  const phase=host.sb.__tasks.find(t=>t.ms===800&&!t.cancelled);
  assert('12a 胜负层自带明确「继续」按钮，不再放跳过战果的「查看战绩」',
    !!phase&&/id="battleOutroContinue"/.test(end.innerHTML)&&!/battleViewRecord/.test(end.innerHTML),String(end.innerHTML));
  const settled=outroSettlement(host);
  const cont=host.sb.document.getElementById('battleOutroContinue');
  cont.handlers.click();
  assert('12a 点「继续」立即进入战果层（不等 800ms）',/战利品/.test(end.innerHTML)&&!/battleNext/.test(end.innerHTML),String(end.innerHTML));
  assert('12a 提前推进取消了 800ms 阶段 timer',!!phase&&phase.cancelled===true);
  if(phase)phase.fn();
  assert('12a 旧 800ms callback 迟到不重绘旧层、不二次结算',
    /战利品/.test(end.innerHTML)&&!/battleNext/.test(end.innerHTML)&&outroSettlement(host)===settled,String(end.innerHTML));
  const reward=host.sb.__pending().find(t=>t.ms===1200);
  assert('12a 战果层有「继续」且自动阶段为 1200ms',!!reward&&/id="battleOutroContinue"/.test(end.innerHTML),String(end.innerHTML));
  host.sb.document.getElementById('battleOutroContinue').handlers.click();
  assert('12a 战果层「继续」立即进入战绩层',/battleNext/.test(end.innerHTML)&&/battleShare/.test(end.innerHTML),String(end.innerHTML));
  assert('12a 提前推进取消了 1200ms 阶段 timer',!!reward&&reward.cancelled===true);
  const recordHtml=end.innerHTML,settledRecord=outroSettlement(host);
  if(reward)reward.fn();
  if(phase)phase.fn();
  assert('12a 旧 1200ms callback 迟到不重绘战绩层、不二次结算',
    end.innerHTML===recordHtml&&outroSettlement(host)===settledRecord,String(end.innerHTML).slice(0,140));
}

/* ---- 12b 单敌 auto 胜利：战果层「查看战绩」取消自动推进（无「继续」） ---- */
{
  const host=makeOutroHost(20000);
  ghStartOutro(host,ghWinBattle(),true);
  const end=host.els.battleEnd;
  host.sb.__runDelay(800);
  assert('12b auto 胜利战果层只有「查看战绩」、保留自动提示、不出现「继续」',
    /battleViewRecord/.test(end.innerHTML)&&!/battleOutroContinue/.test(end.innerHTML)&&/自动模式/.test(end.innerHTML),String(end.innerHTML));
  const auto=host.sb.__pending().find(t=>t.ms===2000);
  assert('12b auto 战果阶段至少 2000ms 后才推进',!!auto);
  host.sb.document.getElementById('battleViewRecord').handlers.click();
  assert('12b 点「查看战绩」立即进入战绩层',/battleNext/.test(end.innerHTML),String(end.innerHTML));
  assert('12b 点「查看战绩」取消了自动推进 timer 并关掉 auto',!!auto&&auto.cancelled===true&&vm.runInContext('_battleAuto',host.sb)===false);
  const tracks=host.calls.trackLevel.length,stable=end.innerHTML,settledAuto=outroSettlement(host);
  if(auto)auto.fn();
  assert('12b 迟到 auto callback 不再自动进下一关、不重绘',
    host.calls.trackLevel.length===tracks&&host.els.battleOverlay.classList.contains('open')&&end.innerHTML===stable,
    JSON.stringify({tracks:host.calls.trackLevel.length,open:host.els.battleOverlay.classList.contains('open')}));
  assert('12b 「查看战绩」只结算一次',outroSettlement(host)===settledAuto,outroSettlement(host)+' vs '+settledAuto);
}

/* ---- 12c pageshow 跨 800+1200 两个 deadline：一次收敛到战绩层，且与单步推进一致 ---- */
{
  const host=makeOutroHost(30000);
  ghStartOutro(host,ghWinBattle(),false);
  const atSettle=outroSettlement(host);
  assert('12c 追赶前仍停在胜负层且未放彩带',!/战利品/.test(host.els.battleEnd.innerHTML)&&host.calls.celebrate===0,String(host.calls.celebrate));
  host.sb.__setNow(30000+2500);
  host.winEvents.pageshow();
  assert('12c pageshow 一次收敛到战绩层（不逐层重计）',/battleNext/.test(host.els.battleEnd.innerHTML),String(host.els.battleEnd.innerHTML).slice(0,140));
  assert('12c 战绩层无遗留推进 timer',host.sb.__pending().length===0,JSON.stringify(host.sb.__pending().map(t=>t.ms)));
  assert('12c 追赶不重复结算（奖励/进度/失败次数/通关不变）',outroSettlement(host)===atSettle,outroSettlement(host)+' vs '+atSettle);
  assert('12c 追赶只在收敛到战绩层时放一次彩带',host.calls.celebrate===1,String(host.calls.celebrate));
  const again=host.els.battleEnd.innerHTML;
  host.winEvents.pageshow();
  host.docEvents.visibilitychange();
  assert('12c 再次恢复不改写战绩层',host.els.battleEnd.innerHTML===again);

  const single=makeOutroHost(30000);
  ghStartOutro(single,ghWinBattle(),false);
  single.sb.__runDelay(800);
  single.sb.__runDelay(1200);
  assert('12c 与「只推进一次」的单步路径逐项一致（奖励/进度/失败次数/通关/彩带）',
    outroSettlement(host)===outroSettlement(single)&&host.calls.celebrate===single.calls.celebrate,
    outroSettlement(host)+' vs '+outroSettlement(single)+' | 彩带 '+host.calls.celebrate+' vs '+single.calls.celebrate);
  assert('12c 收敛后的界面与单步路径一致',host.els.battleEnd.innerHTML===single.els.battleEnd.innerHTML);
}

/* ---- 12d visibilitychange 剩余时间按绝对 deadline 重排（不重新计满） ---- */
{
  const host=makeOutroHost(40000);
  ghStartOutro(host,ghWinBattle(),false);
  const first=host.sb.__tasks.find(t=>t.ms===800&&!t.cancelled);
  host.sb.__setNow(40000+500);
  host.docEvents.visibilitychange();
  const pend=host.sb.__pending();
  assert('12d 原 800ms timer 已取消',!!first&&first.cancelled===true);
  assert('12d 按绝对剩余 300ms 重排（due 仍是 t0+800，不重新计满）',
    pend.length===1&&pend[0].ms===300&&pend[0].due===40000+800,
    JSON.stringify(pend.map(t=>({ms:t.ms,due:t.due}))));
  host.sb.__setNow(40000+800);
  assert('12d 剩余时间到期后进入战果层',host.sb.__runDelay(300)&&/战利品/.test(host.els.battleEnd.innerHTML),String(host.els.battleEnd.innerHTML).slice(0,120));
  assert('12d 战果层自动阶段仍是完整的 1200ms',!!host.sb.__pending().find(t=>t.ms===1200));
}

/* ---- 12e F4 本场快照：分享卡片显示刚打完的关卡（不是已推进的下一关） ---- */
{
  const host=makeOutroHost(50000);
  host.sb.startBattle('1-1');
  const b=ghWinBattle();
  vm.runInContext('_battle=__ghBattle; endBattle(true)',Object.assign(host.sb,{__ghBattle:b}));
  host.sb.__runDelay(800);host.sb.__runDelay(1200);
  const lv=host.sb.findLevel('1-1');
  assert('12e 前置：胜利结算后 current 已推进到下一关',host.sb.getGame().current==='1-2',String(host.sb.getGame().current));
  host.sb.document.getElementById('battleShare').handlers.click();
  assert('12e 点「分享卡片」后 #shareLevel 仍是刚打完的关卡',
    host.els.shareLevel.textContent==='1-1 '+lv.npc,JSON.stringify(host.els.shareLevel.textContent));
  assert('12e 分享入口仍关掉 auto 并取消 timer',vm.runInContext('_battleAuto',host.sb)===false&&host.sb.__pending().length===0);
}

/* ---- 12f F5 彩带分层：胜负/战果不放，进入战绩层恰好一次；失败路径不放 ---- */
{
  const host=makeOutroHost(60000);
  ghStartOutro(host,ghWinBattle(),false);
  assert('12f 胜负阶段不放彩带',host.calls.celebrate===0,String(host.calls.celebrate));
  host.sb.__runDelay(800);
  assert('12f 战果阶段不放彩带（不遮挡奖励文字）',host.calls.celebrate===0,String(host.calls.celebrate));
  host.sb.__runDelay(1200);
  assert('12f 进入战绩层恰好放一次彩带',host.calls.celebrate===1,String(host.calls.celebrate));
  host.winEvents.pageshow();
  host.docEvents.visibilitychange();
  assert('12f 重复恢复不重复放彩带',host.calls.celebrate===1,String(host.calls.celebrate));

  const loss=makeOutroHost(70000);
  ghStartOutro(loss,ghLoseBattle(),true);
  loss.sb.__runDelay(800);loss.sb.__runDelay(1200);
  assert('12f 失败路径进入战绩层也不放彩带',loss.calls.celebrate===0&&/battleRetry/.test(loss.els.battleEnd.innerHTML),String(loss.calls.celebrate));

  const auto=makeOutroHost(80000);
  ghStartOutro(auto,ghWinBattle(),true);
  auto.sb.__runDelay(800);
  auto.sb.__runDelay(2000);
  assert('12f auto 胜利直接进下一关时不放彩带（取舍：不经战绩层）',
    auto.calls.celebrate===0&&auto.calls.trackLevel.length===1,String(auto.calls.celebrate));
}

/* ---- 12g 本场 overlay 已关闭后，阶段 callback 不得再推进/重绘 ---- */
{
  const host=makeOutroHost(90000);
  ghStartOutro(host,ghWinBattle(),false);
  const end=host.els.battleEnd,html=end.innerHTML;
  host.els.battleOverlay.classList.remove('open');
  host.sb.__runDelay(800);
  assert('12g overlay 关闭后阶段 callback 不重绘、不排下一层',
    end.innerHTML===html&&host.sb.__pending().length===0,
    JSON.stringify({html:String(end.innerHTML).slice(0,80),pending:host.sb.__pending().map(t=>t.ms)}));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

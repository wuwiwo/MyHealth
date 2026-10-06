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

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

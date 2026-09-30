#!/usr/bin/env node
/* v2.2.16 测试：敌群天赋「固化进关卡配置」（§5.4E）+ 死配置清理（§5.4F）
   ─────────────────────────────────────────────────────────────────
   1) `cfg.talents` 真正被赋值（此前**从未赋值** → 实战走 enemy.js 的兜底随机抽取）
   2) 同一关、同一槽位永远同一套天赋：
        · 与 Math 随机种子无关（两个沙箱对比）
        · 与**战斗随机种子**无关（此前每场重摇，实测 g12-10 的 Boss 抽到过 magicshield+slowstart+lazy）
   3) 负面天赋 lazy / slowstart 的出场面（v2.2.16：Boss/精英一律排除；v2.3.0 作者裁决：
        **Boss 仍排除**，精英 / 普通怪恢复可抽）——两个入口都要一致：
        · group-levels.js 的池子（固化路径 + `WEAK_TALENT_CHANCE` 注入）
        · enemy.js 的 pickRandomTalents()（兜底路径，按 tier 剔除 `weak`）
   4) 词条 / 技能的编成**没有**被天赋相关改动扰动（种子流哨兵）
   5) 死配置清理：慢启动 `config.rounds`、多目标 `config.extra` / `config.penalty` 的数值真正被消费
   6) v2.3.0（作者裁决，线 1）：两个 Boss 天赋集调整（改前→改后 + 其余 Boss 逐条钉死）
        + 带负面特性的单位**属性数值更高**（补偿常量可调、速度不参与）
   7) 尚未清理（禁改文件 / 已知缺口）登记：magicshield 消费端硬编码、多目标额外攻击不可达
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'affix.js', 'skill.js', 'enemy.js',
  'terrain.js', 'battle.js', 'group-levels.js', 'battle-group.js'];

/* Math 种子可变的沙箱：用来证明「关卡配置与 Math 随机无关」 */
function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math);
  M.random = rnd;
  const sb = { Math: M, JSON, console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  files.forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sb = makeSandbox(20260930);
const sb2 = makeSandbox(13579);
const groups = Object.keys(sb.GROUP_LEVELS);
const WEAK = ['lazy', 'slowstart'];

function allEnemies(s) {
  const out = [];
  Object.keys(s.GROUP_LEVELS).forEach(function (gk) {
    (s.GROUP_LEVELS[gk].stages || []).forEach(function (st) {
      (st.enemies || []).forEach(function (e, slot) { out.push({ id: st.id, slot: slot, e: e }); });
    });
  });
  return out;
}

/* ============================================================
   1. cfg.talents 真正被赋值（固化）
   ============================================================ */
const enemies = allEnemies(sb);
const nonMinion = enemies.filter(x => x.e.tier !== 'minion');
const minions = enemies.filter(x => x.e.tier === 'minion');
assert('敌群共有 ' + groups.length + ' 大关 / ' + enemies.length + ' 个敌人槽位',
  enemies.length > 0 && groups.length === (sb.GROUP_MAX || 0), '槽位 ' + enemies.length);
assert('所有非杂兵槽位都带**固化**天赋（' + nonMinion.length + ' 个）',
  nonMinion.length > 0 && nonMinion.every(x => Array.isArray(x.e.talents) && x.e.talents.length > 0),
  '缺天赋的槽位: ' + nonMinion.filter(x => !(x.e.talents || []).length).slice(0, 3).map(x => x.id + '#' + x.slot).join(','));
assert('杂兵槽位不带天赋（tier 区间 [0,0]，与改前一致）',
  minions.every(x => !Array.isArray(x.e.talents) || x.e.talents.length === 0),
  String(minions.filter(x => (x.e.talents || []).length).length));

/* 个数必须落在 GROUP_TALENT_COUNT[tier] 区间内（含端点） */
const countBad = nonMinion.filter(function (x) {
  const r = (sb.GROUP_TALENT_COUNT || {})[x.e.tier] || (sb.ENEMY_TIERS && sb.ENEMY_TIERS[x.e.tier] && sb.ENEMY_TIERS[x.e.tier].talent) || [0, 0];
  const n = (x.e.talents || []).length;
  return n < r[0] || n > r[1];
});
assert('天赋个数落在 GROUP_TALENT_COUNT[tier] 区间内', countBad.length === 0,
  countBad.slice(0, 3).map(x => x.id + '#' + x.slot + '=' + (x.e.talents || []).length).join(','));
assert('GROUP_TALENT_COUNT 与 enemy.js 的 ENEMY_TIERS 同源（两份清单守卫）', (function () {
  const a = sb.GROUP_TALENT_COUNT || {}, b = sb.ENEMY_TIERS || {};
  const keys = Object.keys(a).concat(Object.keys(b).filter(k => !a[k]));
  return keys.every(k => a[k] && b[k] && a[k][0] === b[k].talent[0] && a[k][1] === b[k].talent[1]);
})() && Object.keys(sb.ENEMY_TIERS).every(k => sb.GROUP_TALENT_COUNT[k]),
  JSON.stringify(sb.GROUP_TALENT_COUNT) + ' vs ' + JSON.stringify(Object.keys(sb.ENEMY_TIERS).map(k => k + ':' + sb.ENEMY_TIERS[k].talent.join('~'))));

/* 每个槽位的天赋个数分布：应同时出现 Boss 的多个档位（不是恒 2 / 恒 4） */
const bossCounts = new Set();
enemies.forEach(x => { if (x.e.tier === 'boss') bossCounts.add((x.e.talents || []).length); });
assert('Boss 天赋个数是**抽出来的**（出现 ' + Array.from(bossCounts).sort().join('/') + ' 档，区间 1~4）',
  Array.from(bossCounts).every(n => n >= 1 && n <= 4) && bossCounts.size >= 2, Array.from(bossCounts).join(','));

/* ============================================================
   2. 同一关永远同一套（可复现）
   ============================================================ */
/* 2a. 与 Math 随机种子无关 */
function snapshot(s) {
  return JSON.stringify(Object.keys(s.GROUP_LEVELS).map(gk => (s.GROUP_LEVELS[gk].stages || []).map(st =>
    (st.enemies || []).map(e => ({ t: e.talents || null, a: e.affixes || null, s: e.skills || null })))));
}
assert('关卡编成（天赋/词条/技能）与 Math 随机种子无关', snapshot(sb) === snapshot(sb2));

/* 2b. 与战斗随机种子无关：模拟「同一个关卡开 5 场不同的战斗」 */
const battleStages = ['g6-10', 'g12-10', 'g20-10'];
const seeds = [1, 11, 22, 33, 999];
let seedDrift = [];
battleStages.forEach(function (sid) {
  const stage = sb.getGroupStage(sid);
  const want = JSON.stringify(stage.enemies.map(e => e.talents || []));
  seeds.forEach(function (sd) {
    sb.setBattleRng(sb.makeSeededRng(sd));
    const got = JSON.stringify(stage.enemies.map(function (ec, i) {
      return sb.createEnemyUnit({ id: 'enemy-' + i, tier: ec.tier, name: ec.name, talents: ec.talents, skills: ec.skills, base: ec.base, level: ec.level })._talents;
    }));
    sb.setBattleRng(null);
    if (got !== want) seedDrift.push(sid + '@seed' + sd);
  });
});
assert('同一关 5 个不同战斗种子下天赋完全一致（固化前是「每场重摇」）', seedDrift.length === 0, seedDrift.join(','));

/* 2c. 实战入口（createEnemyUnit）拿到的一定是关卡配置里的那一套 */
const s1210 = sb.getGroupStage('g12-10');
const cfgTalents = s1210.enemies[0].talents;
const u1210 = sb.createEnemyUnit({ id: 'e0', tier: s1210.enemies[0].tier, name: s1210.enemies[0].name, talents: cfgTalents, skills: s1210.enemies[0].skills, base: s1210.enemies[0].base, level: s1210.enemies[0].level });
assert('createEnemyUnit 装上的天赋 == 关卡配置的天赋（' + cfgTalents.join('+') + '）', eq(u1210._talents, cfgTalents), JSON.stringify(u1210._talents));

/* 2d. 兜底路径（不传 talents）仍然每场随机 —— 这是「未固化时」的行为，只对单敌战等入口生效。
       ⚠️ 该断言的作用是**标明分界**：敌群走固化，兜底仍随机（保持单敌战原手感）。 */
(function () {
  const stage = sb.getGroupStage('g12-10');
  sb.setBattleRng(sb.makeSeededRng(11));
  const a = sb.createEnemyUnit({ tier: 'boss', base: stage.enemies[0].base })._talents;
  sb.setBattleRng(sb.makeSeededRng(22));
  const b = sb.createEnemyUnit({ tier: 'boss', base: stage.enemies[0].base })._talents;
  sb.setBattleRng(null);
  assert('兜底路径（不传 talents）仍按战斗种子随机抽取', JSON.stringify(a) !== JSON.stringify(b), JSON.stringify(a) + ' vs ' + JSON.stringify(b));
})();

/* ============================================================
   3. 负面天赋（lazy / slowstart）的出场面
      · v2.2.16：Boss / 精英一律排除 → 两条天赋其实**从未出场**（`TALENTS_LOW` 只并进
        个数为 0 的杂兵池）
      · v2.3.0（作者裁决「保留，给精英怪/普通怪」）：**Boss 仍排除**，精英 / 普通怪恢复可抽，
        且带负面特性的单位属性数值更高（见第 6/7 节）
   ============================================================ */
const high = sb.TALENTS_HIGH || [];
assert('TALENTS_HIGH 非空且不含 weak 天赋', high.length > 0 && high.every(id => !sb.isWeakTalent(id)),
  high.filter(id => sb.isWeakTalent(id)).join(','));
assert('TALENTS_LOW == talent.js 标记 weak 的天赋（两份清单守卫）',
  eq((sb.TALENTS_LOW || []).slice().sort(), Object.keys(sb.TALENTS).filter(id => sb.isWeakTalent(id)).sort()),
  JSON.stringify(sb.TALENTS_LOW) + ' vs ' + JSON.stringify(Object.keys(sb.TALENTS).filter(id => sb.isWeakTalent(id))));

const bossSlots = enemies.filter(x => x.e.tier === 'boss');
const lowSlots = enemies.filter(x => x.e.tier !== 'boss');
const poolBadBoss = bossSlots.filter(x => (x.e.talents || []).some(t => high.indexOf(t) < 0));
assert('Boss 的天赋全部来自 TALENTS_HIGH（' + bossSlots.length + ' 个 Boss 槽位）', poolBadBoss.length === 0,
  poolBadBoss.slice(0, 5).map(x => x.id + ':' + (x.e.talents || []).join('+')).join(','));
const poolBadLow = lowSlots.filter(x => (x.e.talents || []).some(t => high.concat(WEAK).indexOf(t) < 0));
assert('非 Boss 的天赋来自 TALENTS_HIGH ∪ TALENTS_LOW', poolBadLow.length === 0,
  poolBadLow.slice(0, 5).map(x => x.id + ':' + (x.e.talents || []).join('+')).join(','));
const weakBoss = bossSlots.filter(x => (x.e.talents || []).some(t => WEAK.indexOf(t) >= 0));
assert('Boss 不抽 lazy / slowstart（评审原文「boss不会获得」）', weakBoss.length === 0,
  weakBoss.slice(0, 5).map(x => x.id + ':' + (x.e.talents || []).join('+')).join(','));
const weakUsed = lowSlots.filter(x => (x.e.talents || []).some(t => WEAK.indexOf(t) >= 0));
assert('精英 / 普通怪的负面天赋**恢复出场**（' + weakUsed.length + ' 个非 Boss 槽位带上它）',
  weakUsed.length > 0 && weakUsed.every(x => x.e.tier !== 'minion'),
  weakUsed.slice(0, 5).map(x => x.id + '#' + x.slot + ':' + (x.e.talents || []).join('+')).join(','));
assert('杂兵仍按设计表 0 天赋（拿不到负面特性）',
  enemies.filter(x => x.e.tier === 'minion').every(x => !(x.e.talents || []).length));
assert('负面特性的出现是**确定性**的（同一关两次生成一致，不随战斗种子漂移）', (function () {
  const st = sb.getGroupStage('g17-10');
  const a = JSON.stringify(st.enemies.map(e => e.talents || []));
  const b = JSON.stringify(sb.getGroupStage('g17-10').enemies.map(e => e.talents || []));
  return a === b && a.indexOf('lazy') >= 0;   // 该关第二个护卫抽到了 lazy（见第 6 节）
})(), JSON.stringify(sb.getGroupStage('g17-10').enemies.map(e => (e.talents || []).join('+'))));
assert('天赋 id 全部存在（防拼写错误静默失效）',
  enemies.every(x => (x.e.talents || []).every(t => !!sb.getTalent(t))));
assert('同一槽位天赋不重复',
  enemies.every(x => new Set(x.e.talents || []).size === (x.e.talents || []).length));

/* 兜底抽取也必须挡住（tier-aware）—— v2.3.0：排除面收到 **Boss 一档** */
(function () {
  let leak = null;
  for (let i = 0; i < 400 && !leak; i++) {
    sb.pickRandomTalents(6, 'boss').forEach(id => { if (WEAK.indexOf(id) >= 0) leak = id; });
  }
  assert('兜底抽取 pickRandomTalents(n, "boss") 400 次不抽到 lazy / slowstart', leak === null, String(leak));
  /* v2.3.0（作者裁决「保留，给精英怪/普通怪」）：精英 / 普通怪**恢复可抽** —— 断言方向翻转 */
  let leak2 = null;
  for (let i = 0; i < 400 && !leak2; i++) {
    sb.pickRandomTalents(6, 'elite2').forEach(id => { if (WEAK.indexOf(id) >= 0) leak2 = id; });
  }
  assert('兜底抽取 pickRandomTalents(n, "elite2") **仍可能**抽到 lazy / slowstart（v2.3.0 恢复出场）',
    leak2 !== null, String(leak2));
  let leak3 = null;
  for (let i = 0; i < 400 && !leak3; i++) {
    sb.pickRandomTalents(6, 'elite1').forEach(id => { if (WEAK.indexOf(id) >= 0) leak3 = id; });
  }
  assert('兜底抽取 pickRandomTalents(n, "elite1") **仍可能**抽到 lazy / slowstart', leak3 !== null, String(leak3));
  let seenWeak = false;
  for (let i = 0; i < 400 && !seenWeak; i++) {
    if (sb.pickRandomTalents(6, 'minion').some(id => WEAK.indexOf(id) >= 0)) seenWeak = true;
  }
  assert('非精英（tier="minion"）仍可能抽到 lazy / slowstart（未从池子里删掉）', seenWeak);
  assert('不传 tier 时行为不变（全池，含 weak）', (function () {
    for (let i = 0; i < 400; i++) { if (sb.pickRandomTalents(6).some(id => WEAK.indexOf(id) >= 0)) return true; }
    return false;
  })());
})();

/* ============================================================
   4. 词条 / 技能编成未被天赋固化扰动（种子流哨兵）
      值取自固化前的采集结果（page/group-levels.js 的天赋抽取放在词条/技能之后）
   ============================================================ */
const SENTINEL = {
  'g3-4': [{ tier: 'minion', affixes: [], skills: [] }, { tier: 'minion', affixes: [], skills: [] }],
  'g6-10': [{ tier: 'boss', affixes: ['cut_boss', 'extra_act', 'aoe_guard'], skills: ['doom', 'drainbuff'] },
    { tier: 'elite2', affixes: ['cut_elite', 'skill_guard'], skills: ['empower'] },
    { tier: 'elite2', affixes: ['cut_elite', 'extra_act'], skills: ['empower'] }],
  'g7-5': [{ tier: 'elite2', affixes: ['cut_elite', 'aoe_guard'], skills: ['clearfog', 'spikes'] },
    { tier: 'minion', affixes: [], skills: [] }, { tier: 'minion', affixes: [], skills: [] }],
  'g12-10': [{ tier: 'boss', affixes: ['cut_boss', 'extra_act', 'grow_def'], skills: ['spikes', 'bulwark'] },
    { tier: 'elite2', affixes: ['cut_elite', 'doom_call'], skills: ['clearfog', 'spikes'] },
    { tier: 'elite2', affixes: ['cut_elite', 'extra_act'], skills: ['taunt', 'spikes'] }],
  'g20-10': [{ tier: 'boss', affixes: ['cut_boss', 'grow_def', 'grow_atk'], skills: ['blizzard', 'heal'] },
    { tier: 'elite2', affixes: ['cut_elite', 'grow_def'], skills: ['lastword', 'spikes'] },
    { tier: 'elite2', affixes: ['cut_elite', 'grow_atk'], skills: ['stardust', 'spikes'] }]
};
Object.keys(SENTINEL).forEach(function (sid) {
  const st = sb.getGroupStage(sid);
  const got = (st.enemies || []).map(e => ({ tier: e.tier, affixes: e.affixes || [], skills: e.skills || [] }));
  assert('词条/技能未被扰动 ' + sid, eq(got, SENTINEL[sid]), JSON.stringify(got) + ' ≠ ' + JSON.stringify(SENTINEL[sid]));
});

/* ============================================================
   5. 死配置清理：数值真的被消费（§5.4F）
   ============================================================ */
/* 5a. 慢启动：config.rounds 是唯一来源（本小节 = **hook 层**直接派发）
       v2.3.0（作者裁决「设定 x 回合就真的 x 回合」）：判据改为**实际回合号** ——
       群战链路另传 `ctx.actualTurn`；只给 ctx.turn 时按既有约定反推（ctx.turn − 1）。 */
function slowSkip(actualTurn) {
  const u = sb.createEnemyUnit({ id: 's', tier: 'minion', talents: ['slowstart'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  return !!sb.talentDispatch(u, 'onBeforeAction', { turn: actualTurn + 1, actualTurn: actualTurn }).skipAction;
}
assert('慢启动（hook 层）：config.rounds=2 → **实际第 1、2 回合**不能行动、第 3 回合可以',
  slowSkip(1) && slowSkip(2) && !slowSkip(3), JSON.stringify([slowSkip(1), slowSkip(2), slowSkip(3)]));
assert('慢启动：只给 `ctx.turn` 时按既有约定反推实际回合号（ctx.turn − 1，= 群战 ctx.turn = gb.turn + 1）',
  (function () {
    const u = sb.createEnemyUnit({ id: 's0', tier: 'minion', talents: ['slowstart'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
    return !!sb.talentDispatch(u, 'onBeforeAction', { turn: 3 }).skipAction &&           // → 实际第 2 回合，跳过
      !sb.talentDispatch(u, 'onBeforeAction', { turn: 4 }).skipAction;                    // → 实际第 3 回合，可动
  })());
sb.TALENTS.slowstart.config.rounds = 4;
assert('慢启动（hook 层）：改 config.rounds=4 **立即生效**（实际第 1~4 回合不能行动、5 可以）',
  slowSkip(1) && slowSkip(4) && !slowSkip(5));
sb.TALENTS.slowstart.config.rounds = 1;
assert('慢启动（hook 层）：改 config.rounds=1 → 只有实际第 1 回合不能行动',
  slowSkip(1) && !slowSkip(2));
sb.TALENTS.slowstart.config.rounds = 2;
assert('慢启动（hook 层）：恢复 config.rounds=2 后回到原行为', slowSkip(2) && !slowSkip(3));
assert('慢启动：`_slowRounds` 已不再是读取来源（唯一来源 = config）', (function () {
  const u = sb.createEnemyUnit({ id: 's2', tier: 'minion', talents: ['slowstart'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  u._slowRounds = 99;
  return !sb.talentDispatch(u, 'onBeforeAction', { turn: 4 }).skipAction;   // 实际第 3 回合
})());

/* 5b. 多目标：config.extra / config.penalty 是唯一来源 */
function multiTargets() {
  const u = sb.createEnemyUnit({ id: 'm', tier: 'minion', talents: ['multitarget'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  const r = sb.talentDispatch(u, 'onBeforeAction', {});
  const m = r.mutations.find(x => x.key === 'multiTarget');
  return m ? m.value : null;
}
function multiPenalty() {
  const u = sb.createEnemyUnit({ id: 'm', tier: 'minion', talents: ['multitarget'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  const r = sb.talentDispatch(u, 'onDamage', { isPlayerAttack: true, amount: 100 });
  const m = r.mutations.find(x => x.key === 'dmgReduce');
  return m ? m.value : null;
}
assert('多目标：config.extra=1 → multiTarget=2（总目标数 = 额外 1 + 原目标 1）', multiTargets() === 2, String(multiTargets()));
assert('多目标：config.penalty=0.7 → dmgReduce=0.3（= 1 − 0.7）', Math.abs(multiPenalty() - 0.3) < 1e-9, String(multiPenalty()));
sb.TALENTS.multitarget.config.extra = 2;
assert('多目标：改 config.extra=2 **立即生效**（multiTarget=3）', multiTargets() === 3, String(multiTargets()));
sb.TALENTS.multitarget.config.penalty = 0.8;
assert('多目标：改 config.penalty=0.8 **立即生效**（dmgReduce=0.2）', Math.abs(multiPenalty() - 0.2) < 1e-9, String(multiPenalty()));
sb.TALENTS.multitarget.config.extra = 1;
sb.TALENTS.multitarget.config.penalty = 0.7;
assert('多目标：恢复原配置后回到原值（2 / 0.3）', multiTargets() === 2 && Math.abs(multiPenalty() - 0.3) < 1e-9);
assert('多目标：`_multiExtra` 已不再是读取来源（唯一来源 = config）', (function () {
  const u = sb.createEnemyUnit({ id: 'm2', tier: 'minion', talents: ['multitarget'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  u._multiExtra = 9;
  const r = sb.talentDispatch(u, 'onBeforeAction', {});
  return r.mutations.find(x => x.key === 'multiTarget').value === 2;
})());

/* 5c. 慢启动端到端：真打一场，统计「无法行动（慢启动）」回合数
   v2.3.0（作者裁决「以设计原文为准 —— 设定 x 回合就真的 x 回合」）：
   改前 `ctx.turn = gb.turn + 1` 被直接拿来比 rounds → `rounds: N` 实际只跳 **N−1** 次
   （改前实测 0/1/2/3）。现在 `rounds: N` = 真正跳过前 N 个回合。
   ⚠️ 这会**改变慢启动持有者的难度**（每个持有者多空过 1 回合），故同时锁住次数。 */
function slowSkipRounds(rounds) {
  sb.TALENTS.slowstart.config.rounds = rounds;
  const foe = sb.createEnemyUnit({ id: 'e', tier: 'minion', name: '慢兵', talents: ['slowstart'], base: { hp: 999999, atk: 1, def: 0, spd: 20 } });
  const me = sb.createUnit({ id: 'p', side: 'ally', name: '你', base: { hp: 999999, atk: 1, def: 9999, spd: 1 } });
  const gb = sb.createGroupBattle({ allies: [me], enemies: [foe], seed: 4242 });
  let n = 0;
  for (let i = 0; i < 40 && !gb.done; i++) {
    const r = sb.groupBattleStep(gb);
    (r.events || []).forEach(e => { if (e.msg && e.msg.indexOf('慢启动') >= 0) n++; });
  }
  return n;
}
const skip1 = slowSkipRounds(1);
const skip2 = slowSkipRounds(2);
const skip4 = slowSkipRounds(4);
assert('慢启动端到端：rounds=1 → 实战 1 次「无法行动」（改前为 0）', skip1 === 1, String(skip1));
assert('慢启动端到端：rounds=2 → 实战 2 次「无法行动」（改前为 1）', skip2 === 2, String(skip2));
assert('慢启动端到端：rounds=4 → 实战 4 次「无法行动」（改前为 3，改配置真的改变实战行为）', skip4 === 4, String(skip4));
sb.TALENTS.slowstart.config.rounds = 2;

/* 5d. 魔法盾：WP-C 已把消费端**单源化**（读 m.value）并补上真正的消费通道，这里改为**行为断言**。
      改前：battle-group.js 消费端硬编码 `dmg * 0.7`，且只在**物理**分支读 —— 而生产端 hook 的判据是
            `ctx.isSoul` → 该天赋一次都没生效；当时只能断言「生产端值 + 硬编码 = 1」防漂移。
      改后：魂攻伤害结算前按 isSoul 派发受击方天赋、统一按 `m.value` 缩放
            → 直接断言「改生产端值，实战魂攻伤害跟着变」。 */
(function () {
  function soulDmg(v) {
    const orig = sb.MAGICSHIELD_SOUL_REDUCE;
    sb.MAGICSHIELD_SOUL_REDUCE = v;
    const att = sb.createUnit({ id: 'gatt', side: 'ally', name: '打手', base: { hp: 9999, atk: 100, def: 5, soulAtk: 200, spd: 5 } });
    /* soulDef=0 → 魂攻伤害 = soulAtk（无随机项），便于逐值比对 */
    const foe = sb.createEnemyUnit({ id: 'gsh', tier: 'minion', name: '盾兵', talents: ['magicshield'], base: { hp: 99999, atk: 1, def: 0, soulDef: 0, spd: 1 } });
    const gb = sb.createGroupBattle({ allies: [att], enemies: [foe], seed: 4242 });
    const ev = sb.normalAttack(gb, gb.allies[0], gb.enemies[0], 1);
    sb.MAGICSHIELD_SOUL_REDUCE = orig;
    const hit = ev.find(e => /魂攻击/.test(e.msg || ''));
    return hit ? +(/→ (\d+) 魂伤害/.exec(hit.msg)[1]) : null;
  }
  const m = sb.talentDispatch(
    sb.createEnemyUnit({ id: 'gsh0', tier: 'minion', talents: ['magicshield'], base: { hp: 100, atk: 1, def: 0, spd: 1 } }),
    'onDamage', { isSoul: true }).mutations.find(x => x.key === 'soulDmgReduce');
  assert('魔法盾：生产端仍产出 soulDmgReduce=0.3', m && Math.abs(m.value - 0.3) < 1e-9, JSON.stringify(m));

  const d0 = soulDmg(0);
  const d30 = soulDmg(0.3);
  const d50 = soulDmg(0.5);
  assert('魔法盾：魂攻伤害真的被削减（未削 200 → ×0.7 = 140）', d0 === 200 && d30 === 140, d0 + ' → ' + d30);
  assert('魔法盾：改生产端立即生效（0.5 → 100，证明消费端读 m.value、不再硬编码）', d50 === 100, d0 + ' → ' + d50);
  const src = load('battle-group.js');
  assert('魔法盾：消费端已无硬编码 `dmg * 0.7`（1 行级遗留收口）',
    !/soulDmgReduce'\)\s*dmg = Math\.floor\(dmg \* 0?\.7\)/.test(src));
  assert('魔法盾：消费端改为读 m.value（两处：物理分支 + 魂攻分支）',
    (src.match(/soulDmgReduce'\)\s*dmg = Math\.floor\(dmg \* \(1 - m\.value\)\)/g) || []).length >= 1);
})();

/* 5e. 多目标：额外攻击的**可达性**（WP-C 已修）
       battle-group.js 的普攻分支原先用 `targets.slice(0, nTargets)`，而 targets 在
       `selectTargets(gb, actor, null)`（skillDef=null → 'random1'）下恒为 1 个 → 额外目标拿不到。
       现在会从对侧补足到 nTargets 个再逐个普攻 —— 这里断言「真的多打到了一个目标」。 */
(function () {
  const me = sb.createUnit({ id: 'mt-a', side: 'ally', name: '你', base: { hp: 500, atk: 5, def: 3, spd: 5 } });
  const f1 = sb.createUnit({ id: 'mt-e1', side: 'enemy', name: '敌1', base: { hp: 500, atk: 5, def: 3, spd: 5 } });
  const f2 = sb.createUnit({ id: 'mt-e2', side: 'enemy', name: '敌2', base: { hp: 500, atk: 5, def: 3, spd: 4 } });
  const gb = sb.createGroupBattle({ allies: [me], enemies: [f1, f2], seed: 99 });
  const targets = sb.selectTargets(gb, me, null);
  assert('普攻首目标仍只有 1 个（selectTargets 口径不变）', targets.length === 1, String(targets.length));

  /* 带 multitarget 的我方单位走完整回合：普攻应打到 **2 个不同**目标 */
  const mt = sb.createUnit({ id: 'mt-p', side: 'ally', name: '多目标者', base: { hp: 500, atk: 5, def: 3, spd: 9 } });
  mt._talents = ['multitarget'];
  const e1 = sb.createUnit({ id: 'mt-t1', side: 'enemy', name: '靶1', base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
  const e2 = sb.createUnit({ id: 'mt-t2', side: 'enemy', name: '靶2', base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
  const gb2 = sb.createGroupBattle({ allies: [mt], enemies: [e1, e2], seed: 7 });
  gb2.turn = 1;
  const hitNames = {};
  for (let i = 0; i < 20; i++) {
    const ev = sb.groupUnitTurn(gb2, mt);
    ev.forEach(function (e) {
      const mm = e.msg && /^⚔️ .* 攻击 (\S+) →/.exec(e.msg);
      if (mm) hitNames[mm[1]] = true;
    });
    e1.hp = 9999; e2.hp = 9999;   // 保证两个目标都活着、可再被打
    if (Object.keys(hitNames).length >= 2) break;
  }
  assert('多目标：普攻真的多打到了一个目标（额外目标可达）',
    Object.keys(hitNames).length === 2, JSON.stringify(Object.keys(hitNames)));
})();

/* ============================================================
   6. v2.3.0 作者裁决（线 1）：负面天赋恢复出场 + 属性补偿 + 两个 Boss 天赋集调整
   ============================================================ */
/* 6a. 两个 Boss 的固定天赋集「调整」（doc/plans/v2.2.18-平衡复测.md §3.3 的证据 + 作者裁决）
       改前 → 改后：
         · g17-10 Boss·混沌魔   [roughskin, vengeance, blade, vigor] → [roughskin, vigor, regen]
           （拆掉 2 个进攻天赋 blade / vengeance，换 1 个回复类 regen）
         · g18-10 Boss·战争领主 [magicmirror, vigor, bloodthirst]    → [magicshield, vigor, bloodthirst]
           （magicmirror 会免疫/反弹玩家的辅助技能 = 硬克制玩家打法 → 换成只减魂伤的 magicshield）
       约束：仍在合法池（TALENTS_HIGH）、不含 Boss 禁用项（weak）、**不改其它 Boss**。 */
const OVR = sb.GROUP_BOSS_TALENT_OVERRIDE || {};
assert('Boss 天赋覆盖表只含这两个关卡（不改其它 Boss）',
  Object.keys(OVR).sort().join(',') === 'g17-10,g18-10', JSON.stringify(Object.keys(OVR)));
assert('g17-10 Boss 天赋 = [roughskin, vigor, regen]（拆掉 blade / vengeance 两个进攻天赋）',
  eq(OVR['g17-10'], ['roughskin', 'vigor', 'regen']), JSON.stringify(OVR['g17-10']));
assert('g18-10 Boss 天赋 = [magicshield, vigor, bloodthirst]（换掉硬克制玩家的 magicmirror）',
  eq(OVR['g18-10'], ['magicshield', 'vigor', 'bloodthirst']), JSON.stringify(OVR['g18-10']));
Object.keys(OVR).forEach(function (sid) {
  assert(sid + ' 覆盖集仍在合法池内且不含 Boss 禁用项',
    OVR[sid].length >= 1 && OVR[sid].length <= 4 &&
    OVR[sid].every(t => high.indexOf(t) >= 0) && OVR[sid].every(t => !sb.isWeakTalent(t)),
    JSON.stringify(OVR[sid]));
});
assert('覆盖表已落到关卡配置（改前→改后生效）',
  eq((sb.getGroupStage('g17-10').enemies[0].talents || []), ['roughskin', 'vigor', 'regen']) &&
  eq((sb.getGroupStage('g18-10').enemies[0].talents || []), ['magicshield', 'vigor', 'bloodthirst']),
  JSON.stringify([sb.getGroupStage('g17-10').enemies[0].talents, sb.getGroupStage('g18-10').enemies[0].talents]));
assert('调整后不再带 `magicmirror`（g18）/ 不再带 `blade`+`vengeance`（g17）',
  (sb.getGroupStage('g18-10').enemies[0].talents || []).indexOf('magicmirror') < 0 &&
  (sb.getGroupStage('g17-10').enemies[0].talents || []).indexOf('blade') < 0 &&
  (sb.getGroupStage('g17-10').enemies[0].talents || []).indexOf('vengeance') < 0);
/* 其余 Boss 的天赋集**逐条钉死**（否则「只动这两个 Boss」无法证伪；值取自本批改动后的实测枚举，
   与 v2.2.18 的 §3.3 编成表逐行一致 —— 除 g17-10 / g18-10 两行按裁决调整）。 */
const BOSS_SETS = {
  'g16-10': ['intimidate', 'vengeance', 'magicmirror'],
  'g19-10': ['vigor', 'regen', 'vengeance'],
  'g20-10': ['plain', 'magicshield', 'regen', 'roughskin'],
  'g21-10': ['bloodthirst'],
  'g22-10': ['intimidate', 'vengeance', 'regen'],
  'g23-10': ['regen'],
  'g24-10': ['intimidate']
};
Object.keys(BOSS_SETS).forEach(function (sid) {
  const got = sb.getGroupStage(sid).enemies[0].talents || [];
  assert('未受影响的 Boss ' + sid + ' 天赋集与改动前一致', eq(got, BOSS_SETS[sid]),
    JSON.stringify(got) + ' vs ' + JSON.stringify(BOSS_SETS[sid]));
});

/* 6b. 负面特性补偿（作者：「一般配这种负面特性的，它的属性数值更高」）
       幅度常量是**首版取值**（作者未给数），这里的判据是「机制成立 + 常量可调」——
       把常量改成 0 复现「无补偿」，再改回 1.25 倍，逐属性比对 floor(base × mul)。 */
(function () {
  const w = weakUsed[0];
  assert('存在带负面特性的槽位可供校验（' + (w && w.id) + '）', !!w);
  if (!w) return;
  const st = sb.getGroupStage(w.id);
  const lg = parseInt(w.id.slice(1), 10);
  const s = parseInt(w.id.split('-')[1], 10);
  const isElite = (s === 5), isBoss = (s === 10);
  const gen = () => sb.genEnemyCfg(lg, s, w.slot, isElite, isBoss);
  const save = sb.WEAK_TALENT_STAT_BONUS;
  const mul = () => (1 + save * (w.e.talents || []).filter(t => WEAK.indexOf(t) >= 0).length);
  sb.WEAK_TALENT_STAT_BONUS = 0;
  const raw = gen();
  sb.WEAK_TALENT_STAT_BONUS = save;
  const comp = gen();
  const keys = ['atk', 'def', 'hp', 'soulAtk', 'soulDef'].filter(k => raw.base[k] != null);
  assert('补偿：常量=' + save + ' → 攻/防/血/魂攻/魂防 逐属性 ×(1+' + save + '×负面个数)',
    keys.length >= 3 && keys.every(k => comp.base[k] === Math.max(1, Math.floor(raw.base[k] * mul()))),
    JSON.stringify(keys.map(k => k + ':' + raw.base[k] + '→' + comp.base[k])));
  assert('补偿：**速度不参与**（与 WP-A1「速度不参与倍率池」同口径）',
    comp.base.spd === raw.base.spd, raw.base.spd + '→' + comp.base.spd);
  assert('补偿：常量 = 0 时回到未补偿形状（常量可调、不是写死的魔法数）',
    keys.every(k => raw.base[k] === Math.max(1, Math.floor(raw.base[k] * 1))) &&
    sb.weakTalentStatMul(['slowstart']) === (1 + save) && sb.weakTalentStatMul(['vigor']) === 1,
    String(sb.weakTalentStatMul(['slowstart'])) + '/' + String(sb.weakTalentStatMul(['vigor'])));
  /* 没有负面特性的槽位：属性一字不变 */
  const plainSlot = enemies.filter(x => x.e.tier !== 'minion' && !(x.e.talents || []).some(t => WEAK.indexOf(t) >= 0))[0];
  const lg2 = parseInt(plainSlot.id.slice(1), 10), s2 = parseInt(plainSlot.id.split('-')[1], 10);
  const p2 = sb.genEnemyCfg(lg2, s2, plainSlot.slot, s2 === 5, s2 === 10);
  assert('无负面特性的槽位属性不受补偿影响（' + plainSlot.id + '#' + plainSlot.slot + '）',
    JSON.stringify(p2.base) === JSON.stringify(plainSlot.e.base),
    JSON.stringify(p2.base) + ' vs ' + JSON.stringify(plainSlot.e.base));
})();

/* ============================================================
   7. 天赋固化后的难度侧写（给主控做平衡复测对照用，不断言强弱）
   ============================================================ */
(function () {
  const rows = [];
  ['g6-10', 'g12-10', 'g17-10', 'g18-10', 'g20-10'].forEach(function (sid) {
    const st = sb.getGroupStage(sid);
    rows.push(sid + ' → ' + (st.enemies || []).map(e => (e.talents || []).join('+') || '—').join(' | '));
  });
  console.log('\n  [固化 + v2.3.0 调整后编成] ' + rows.join('\n                 '));
  console.log('  [带负面特性的非 Boss 槽位] ' + weakUsed.length + ' / ' + lowSlots.length +
    '（WEAK_TALENT_CHANCE=' + sb.WEAK_TALENT_CHANCE + '，补偿 +' + (sb.WEAK_TALENT_STAT_BONUS * 100) + '%）');
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

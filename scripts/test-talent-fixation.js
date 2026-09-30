#!/usr/bin/env node
/* v2.2.16 测试：敌群天赋「固化进关卡配置」（§5.4E）+ 死配置清理（§5.4F）
   ─────────────────────────────────────────────────────────────────
   1) `cfg.talents` 真正被赋值（此前**从未赋值** → 实战走 enemy.js 的兜底随机抽取）
   2) 同一关、同一槽位永远同一套天赋：
        · 与 Math 随机种子无关（两个沙箱对比）
        · 与**战斗随机种子**无关（此前每场重摇，实测 g12-10 的 Boss 抽到过 magicshield+slowstart+lazy）
   3) Boss / 精英不抽 lazy / slowstart —— 两个入口都要挡住：
        · group-levels.js 的池子（固化路径）
        · enemy.js 的 pickRandomTalents()（兜底路径，按 tier 剔除 `weak`）
   4) 词条 / 技能的编成**没有**被天赋固化扰动（种子流哨兵：天赋抽取刻意放在它们之后）
   5) 死配置清理：慢启动 `config.rounds`、多目标 `config.extra` / `config.penalty` 的数值真正被消费
   6) 尚未清理（禁改文件 / 已知缺口）登记：magicshield 消费端硬编码、多目标额外攻击不可达
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
   3. Boss / 精英不抽 lazy / slowstart
   ============================================================ */
const high = sb.TALENTS_HIGH || [];
assert('TALENTS_HIGH 非空且不含 weak 天赋', high.length > 0 && high.every(id => !sb.isWeakTalent(id)),
  high.filter(id => sb.isWeakTalent(id)).join(','));
assert('TALENTS_LOW == talent.js 标记 weak 的天赋（两份清单守卫）',
  eq((sb.TALENTS_LOW || []).slice().sort(), Object.keys(sb.TALENTS).filter(id => sb.isWeakTalent(id)).sort()),
  JSON.stringify(sb.TALENTS_LOW) + ' vs ' + JSON.stringify(Object.keys(sb.TALENTS).filter(id => sb.isWeakTalent(id))));

const poolBad = nonMinion.filter(x => (x.e.talents || []).some(t => high.indexOf(t) < 0));
assert('Boss / 精英的天赋全部来自 TALENTS_HIGH', poolBad.length === 0,
  poolBad.slice(0, 5).map(x => x.id + ':' + (x.e.talents || []).join('+')).join(','));
const weakUsed = [];
enemies.forEach(x => (x.e.talents || []).forEach(t => { if (WEAK.indexOf(t) >= 0) weakUsed.push(x.id + '#' + x.slot + ':' + t); }));
assert('全 ' + groups.length * 10 + ' 关的敌群天赋里没有 lazy / slowstart', weakUsed.length === 0, weakUsed.slice(0, 5).join(','));
assert('天赋 id 全部存在（防拼写错误静默失效）',
  enemies.every(x => (x.e.talents || []).every(t => !!sb.getTalent(t))));
assert('同一槽位天赋不重复',
  enemies.every(x => new Set(x.e.talents || []).size === (x.e.talents || []).length));

/* 兜底抽取也必须挡住（tier-aware） */
(function () {
  let leak = null;
  for (let i = 0; i < 400 && !leak; i++) {
    sb.pickRandomTalents(6, 'boss').forEach(id => { if (WEAK.indexOf(id) >= 0) leak = id; });
  }
  assert('兜底抽取 pickRandomTalents(n, "boss") 400 次不抽到 lazy / slowstart', leak === null, String(leak));
  let leak2 = null;
  for (let i = 0; i < 400 && !leak2; i++) {
    sb.pickRandomTalents(6, 'elite2').forEach(id => { if (WEAK.indexOf(id) >= 0) leak2 = id; });
  }
  assert('兜底抽取 pickRandomTalents(n, "elite2") 400 次不抽到 lazy / slowstart', leak2 === null, String(leak2));
  /* 反向：非精英（或不传 tier）时 lazy / slowstart 仍在池子里 —— 证明是「按 tier 剔除」而不是「从注册表删掉」 */
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
/* 5a. 慢启动：config.rounds 是唯一来源（本小节 = **hook 层**直接派发，ctx.turn 由调用方给定；
       实战口径见 5c） */
function slowSkip(turn) {
  const u = sb.createEnemyUnit({ id: 's', tier: 'minion', talents: ['slowstart'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  return !!sb.talentDispatch(u, 'onBeforeAction', { turn: turn }).skipAction;
}
assert('慢启动（hook 层）：默认 config.rounds=2 → 派发 ctx.turn=1、2 时不能行动',
  slowSkip(1) && slowSkip(2) && !slowSkip(3));
sb.TALENTS.slowstart.config.rounds = 4;
assert('慢启动（hook 层）：改 config.rounds=4 **立即生效**（ctx.turn=1~4 不能行动、5 可以）',
  slowSkip(1) && slowSkip(4) && !slowSkip(5));
sb.TALENTS.slowstart.config.rounds = 1;
assert('慢启动（hook 层）：改 config.rounds=1 → 只有 ctx.turn=1 不能行动',
  slowSkip(1) && !slowSkip(2));
sb.TALENTS.slowstart.config.rounds = 2;
assert('慢启动（hook 层）：恢复 config.rounds=2 后回到原行为', slowSkip(2) && !slowSkip(3));
assert('慢启动：`_slowRounds` 已不再是读取来源（唯一来源 = config）', (function () {
  const u = sb.createEnemyUnit({ id: 's2', tier: 'minion', talents: ['slowstart'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  u._slowRounds = 99;
  return !sb.talentDispatch(u, 'onBeforeAction', { turn: 3 }).skipAction;
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
   ⚠️ 口径如实记录：`ctx.turn` = 实际回合号 + 1（`battle-group.js` 的 `groupUnitTurn` 写 `gb.turn + 1`），
      所以 `rounds: N` 实际跳过 **N−1** 个回合 —— 这是**改前就有**的口径（原实现同为 `ctx.turn <= 2`），
      本批只做单源化、不改行为。若要改成「前 N 回合」，需另行裁决（会改变慢启动持有者的难度）。 */
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
assert('慢启动端到端：rounds=1 → 0 次无法行动（阈值语义 = ctx.turn，起点 2，与改前一致）', skip1 === 0, String(skip1));
assert('慢启动端到端：rounds=2 → 实战 1 次「无法行动」', skip2 === 1, String(skip2));
assert('慢启动端到端：rounds=4 → 实战 3 次「无法行动」（改配置真的改变实战行为）', skip4 === 3, String(skip4));
sb.TALENTS.slowstart.config.rounds = 2;

/* 5d. 魔法盾：**本批未完成的第 3 项** —— 消费端在禁改文件里硬编码 ×0.7 */
(function () {
  const u = sb.createEnemyUnit({ id: 'g', tier: 'minion', talents: ['magicshield'], base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  const m = sb.talentDispatch(u, 'onDamage', { isSoul: true }).mutations.find(x => x.key === 'soulDmgReduce');
  const src = load('battle-group.js');
  const hard = /m\.key === 'soulDmgReduce'\)\s*dmg = Math\.floor\(dmg \* ([\d.]+)\)/.exec(src);
  assert('魔法盾：生产端仍产出 soulDmgReduce=0.3', m && Math.abs(m.value - 0.3) < 1e-9, JSON.stringify(m));
  assert('魔法盾（防漂移）：生产端数值 + 消费端硬编码 = 1（消费端 battle-group.js:415 未读 m.value）',
    !!hard && Math.abs(parseFloat(hard[1]) + m.value - 1) < 1e-9,
    hard ? '硬编码 ' + hard[1] + ' vs 生产端 ' + m.value : '未匹配到消费端写法（可能已被清理 → 请同步本断言）');
  assert('⚠️ 已知缺口：magicshield 的 soulDmgReduce 消费端硬编码（改生产端不生效，需改 battle-group.js:415）', !!hard);
})();

/* 5e. 多目标：额外攻击的**可达性**缺口登记
      battle-group.js 的普攻分支用 `targets.slice(0, nTargets)`，而 targets 在
      `selectTargets(gb, actor, null)`（skillDef=null → 'random1'）下恒为 1 个 → 额外目标拿不到。 */
(function () {
  const foe = sb.createUnit({ id: 'e', side: 'enemy', name: '敌', base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  const me = sb.createUnit({ id: 'p', side: 'ally', name: '你', base: { hp: 100, atk: 5, def: 3, spd: 5 } });
  const gb = sb.createGroupBattle({ allies: [me], enemies: [foe], seed: 1 });
  const n = sb.selectTargets(gb, foe, null).length;
  assert('⚠️ 已知缺口：普攻目标选择恒返回 1 个 → multitarget 的额外目标不可达（需改 battle-group.js:842-847）', n === 1, String(n));
})();

/* ============================================================
   6. 天赋固化后的难度侧写（给主控做平衡复测对照用，不断言强弱）
   ============================================================ */
(function () {
  const rows = [];
  ['g6-10', 'g12-10', 'g20-10'].forEach(function (sid) {
    const st = sb.getGroupStage(sid);
    rows.push(sid + ' → ' + (st.enemies || []).map(e => (e.talents || []).join('+') || '—').join(' | '));
  });
  console.log('\n  [固化后编成] ' + rows.join('\n                 '));
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

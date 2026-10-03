#!/usr/bin/env node
/* v2.4.8 测试：三条作者裁定的引擎改动的「真接线」守卫（清单 doc/plans/战斗阶段化-技能与天赋清单.md §8.5 第 14 条 + §8.6）
   作者裁定：
     ① 修敌人词条死接线（并同时把难度补偿一起定）—— 词条在真实战斗里必须真装配；额外词条走战斗种子；
     ② 先制度 = 「本回合真用了先制技能才先手」（准备阶段预声明 + 失效当场回退）；
     ③ 疾影 = 「每回合 55%」（取消跨回合冷却）。

   本文件与 scripts/test-engine-gaps.js（v2.4.7 的 27 条）**互不覆盖**：
   gaps 锁的是「先制度分档存在」「疾影每次机会 55%」等 v2.4.7 行为；
   本文件锁的是 v2.4.8 的三条新口径，每条都配「**修前会红**、修后必绿」的真断言。

   Run: node scripts/test-engine-wiring.js
*/
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var load = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8'); };
var files = ['utils.js', 'date-roll.js', 'levels.js', 'group-levels.js', 'unit.js', 'state-core.js',
  'status-defs.js', 'talent.js', 'affix.js', 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js',
  'terrain.js', 'ai.js', 'pets.js', 'pet-materials.js', 'pet-codex.js', 'skills.js', 'player-skill-hooks.js'];
/* 默认确定性随机（Math.random 钉死 0.5）：命中判定等不引入抖动。
   ⚠️ 任务 1 的两条断言要求 Math.random **会变化**（否则「同种子同结果」在修前也能假绿），
      故 forTask1() 临时把它换成推进式伪随机，用完还原。 */
var deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };
var sb = { Math: deterministicMath, JSON: JSON, console: console, Date: Date };
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
files.forEach(function (f) { vm.runInContext(load(f), sb); });

var pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
function mk(id, side, base, extra) {
  var o = { id: id, side: side, name: id, base: base };
  if (extra) { for (var k in extra) o[k] = extra[k]; }
  return sb.createUnit(o);
}
function ids(list) { return (list || []).map(function (u) { return u && u.id; }).join(','); }
/* 把 Math.random 换成推进会变的伪随机（确定性：固定起点） */
function withAdvancingRandom(fn) {
  var old = sb.Math.random;
  var st = 987654321;
  sb.Math.random = function () { st = (Math.imul(st, 1103515245) + 12345) >>> 0; return st / 4294967296; };
  try { return fn(); } finally { sb.Math.random = old; }
}

/* ============================================================
   [1] 敌人词条（affix）在真实战斗里真装配（§8.5 第 14 条）
   修前：createEnemyUnit 先自动装配、紧接着用 `opts.affixes || []` 覆盖清空；
        真实建场（game-render.js）从不传 affixes → 线上敌人一件词条都没有。
   ============================================================ */
console.log('\n[1] 敌人词条（affix）真装配');
{
  var BOSS_BASE = { hp: 500, atk: 30, def: 20, spd: 5 };
  /* ① 兜底路径：不再被清空（修前恒为 []） */
  var b1 = sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE });
  assert('兜底路径：Boss 的 _affixes 不再被清空（修前恒为 []）',
    Array.isArray(b1._affixes) && b1._affixes.length >= 2, JSON.stringify(b1._affixes));
  assert('兜底路径：Boss 的第一条是固定减伤·大（cut_boss）',
    (b1._affixes || [])[0] === 'cut_boss', JSON.stringify(b1._affixes));
  var e1 = sb.createEnemyUnit({ tier: 'elite2', base: BOSS_BASE });
  assert('兜底路径：精英（elite2）拿到固定减伤·中（cut_elite）',
    (e1._affixes || [])[0] === 'cut_elite', JSON.stringify(e1._affixes));
  var m1 = sb.createEnemyUnit({ tier: 'minion', base: BOSS_BASE });
  assert('兜底路径：杂兵不装词条（按设计收窄，不凭空加强）',
    (m1._affixes || []).length === 0, JSON.stringify(m1._affixes));
  assert('兜底路径：_affixIds 与 _affixes 一致',
    JSON.stringify(b1._affixIds) === JSON.stringify(b1._affixes), JSON.stringify(b1._affixIds));

  /* ② 显式传入（真实战斗走这条）：原样装配、不被覆盖 */
  var b2 = sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE, affixes: ['cut_boss', 'doom_call'] });
  assert('显式传入 affixes → 原样装配（不再被任何东西清空）',
    JSON.stringify(b2._affixes) === JSON.stringify(['cut_boss', 'doom_call']), JSON.stringify(b2._affixes));

  /* ③ 真实关卡的固化词条（group-levels.js = 唯一权威来源）逐项一致 */
  var st = sb.getGroupStage('g8-10');
  var cfg = sb.groupStageEnemies('g8', st, []);
  var units = cfg.map(function (ec, i) {
    return sb.createEnemyUnit({ id: 'e' + i, tier: ec.tier, name: ec.name, talents: ec.talents,
      skills: ec.skills, base: ec.base, level: ec.level, affixes: ec.affixes });
  });
  assert('g8-10 的敌人配置里带固化词条（Boss 2~3 条 / 精英 1~2 条）',
    cfg.length > 0 && cfg[0].affixes && cfg[0].affixes.indexOf('cut_boss') === 0, JSON.stringify(cfg[0] && cfg[0].affixes));
  var same = units.every(function (u, i) { return JSON.stringify(u._affixes) === JSON.stringify(cfg[i].affixes); });
  assert('真实建场：装配结果 == 关卡固化词条（逐项一致）', same,
    JSON.stringify(units.map(function (u) { return u._affixes; })));

  /* ④ 真实建场入口（game-render.js）必须把固化词条传下去 —— 修前这一行不存在 */
  var renderSrc = load('game-render.js');
  assert('game-render.js 建场时把 ec.affixes 传给 createEnemyUnit（修前缺失）',
    /affixes\s*:\s*ec\.affixes/.test(renderSrc), '源码里找不到 affixes:ec.affixes');

  /* ⑤ 兜底固定词条与 group-levels 的清单同源（不另造一份） */
  var fixedBoss = (typeof sb.fixedAffixForTier === 'function') ? sb.fixedAffixForTier('boss') : '<missing>';
  var fixedElite = (typeof sb.fixedAffixForTier === 'function') ? sb.fixedAffixForTier('elite') : '<missing>';
  assert('兜底固定词条与 group-levels 的 GROUP_AFFIX_FIXED 同源（boss）',
    fixedBoss === sb.GROUP_AFFIX_FIXED.boss, String(fixedBoss));
  assert('兜底固定词条与 group-levels 的 GROUP_AFFIX_FIXED 同源（elite）',
    fixedElite === sb.GROUP_AFFIX_FIXED.elite, String(fixedElite));

  /* ⑥ 硬要求：同种子同结果（兜底装配那条随机额外词条必须走种子 rng，不再用 Math.random） */
  var seqA = withAdvancingRandom(function () { return sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE, rng: sb.makeSeededRng(20261003) }); });
  var seqB = withAdvancingRandom(function () { return sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE, rng: sb.makeSeededRng(20261003) }); });
  console.log('   同种子两次建场：A=' + JSON.stringify(seqA._affixes) + ' / B=' + JSON.stringify(seqB._affixes));
  assert('兜底装配拿到词条（非空，否则「一致」是假绿）', (seqA._affixes || []).length >= 2, JSON.stringify(seqA._affixes));
  assert('同种子两次建场：_affixes 完全一致（修前用 Math.random → 不一致）',
    JSON.stringify(seqA._affixes) === JSON.stringify(seqB._affixes),
    JSON.stringify(seqA._affixes) + ' vs ' + JSON.stringify(seqB._affixes));
  assert('同种子两次建场：_talents / _affixIds 也完全一致',
    JSON.stringify(seqA._talents) === JSON.stringify(seqB._talents) &&
    JSON.stringify(seqA._affixIds) === JSON.stringify(seqB._affixIds),
    JSON.stringify(seqA._talents) + ' vs ' + JSON.stringify(seqB._talents));

  /* ⑦ 兜底装配**不调用 Math.random**（修前 pickExtraAffixes 传的是 Math.random） */
  var calls = 0;
  var realRnd = sb.Math.random;
  sb.Math.random = function () { calls++; return realRnd(); };
  var viaRng = sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE, rng: sb.makeSeededRng(777) });
  sb.Math.random = realRnd;
  console.log('   兜底装配期间的 Math.random 调用次数 = ' + calls + '，词条=' + JSON.stringify(viaRng._affixes));
  assert('兜底装配不再走 Math.random（修前 1 次）', calls === 0, 'calls=' + calls);

  /* ⑧ 未传 opts.rng 时走 battleRnd()（= 本场战斗 rng 口径）—— 同种子可复现 */
  var r1 = sb.beginBattleRng(4242);
  var br1 = sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE });
  sb.beginBattleRng(4242);
  var br2 = sb.createEnemyUnit({ tier: 'boss', base: BOSS_BASE });
  sb.setBattleRng(null);
  assert('未传 rng 时走 battleRnd()：同 battle 种子两次建场 _affixes 一致',
    JSON.stringify(br1._affixes) === JSON.stringify(br2._affixes),
    JSON.stringify(br1._affixes) + ' vs ' + JSON.stringify(br2._affixes));
  void r1;
}

/* ============================================================
   [2] 先制度 =「本回合真用了先制技能才先手」（准备阶段预声明 + 失效回退）
   修前：按「持有可用先制技能」即进先制档 —— 不管这一回合会不会真的用它。
   本节的队列断言全部走 runPhasePrepare（真实编排的准备阶段）。
   ============================================================ */
console.log('\n[2] 先制度 = 本回合真用了先制技能才先手');
{
  function prep(gb) { sb._setBattleRng(gb); return sb.runPhasePrepare(gb); }

  /* ① 持有先制技能、但 AI 这一回合声明的是**非先制技能** → 不进先制档（修前会进） */
  var gb1 = sb.createGroupBattle({
    allies: [mk('hero', 'ally', { hp: 5000, atk: 10, def: 1, spd: 500 })],
    enemies: [mk('boss', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 1 }, { skills: ['possess', 'charge'] })]
  });
  /* 固定掷骰 0.1：aiPickSkill 走「70% 用最强」分支 → 按 power + priority×20 排序
     charge(200+0) > possess(0+20) → 声明 charge（非先制） */
  gb1.rng = function () { return 0.1; };
  var q1 = prep(gb1);
  console.log('   g8-10 同型例：boss 带 possess+charge，声明=' + (gb1.enemies[0]._declared || {}).skillId +
    '，队列=' + ids(q1));
  assert('声明了非先制技能 → **不进**先制档（按速度排序，修前 held 口径会排第一）',
    ids(q1) === 'hero,boss', 'queue=' + ids(q1));
  assert('声明内容 = charge（非先制技能）', (gb1.enemies[0]._declared || {}).skillId === 'charge',
    JSON.stringify(gb1.enemies[0]._declared));

  /* ② 只有先制技能可声明时 → 进先制档，速度再低也先手 */
  var gb2 = sb.createGroupBattle({
    allies: [mk('hero2', 'ally', { hp: 5000, atk: 10, def: 1, spd: 500 })],
    enemies: [mk('boss2', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 1 }, { skills: ['possess'] })]
  });
  gb2.rng = function () { return 0.1; };
  var q2 = prep(gb2);
  assert('声明了先制技能 → 进先制档（spd1 先于 spd500 出手）', ids(q2) === 'boss2,hero2', 'queue=' + ids(q2));
  assert('先制度与速度正交：先制档优先于一切非先制单位', sb.unitPriorityRank(gb2.enemies[0], gb2) === 1,
    String(sb.unitPriorityRank(gb2.enemies[0], gb2)));

  /* ③ 同档内仍是「有效速度降序 + 既有 tie-break」（一分不动）
     ⚠️ 用**同阵营两个敌人**：本版只对敌方单位预声明（我方行动不走 aiDecide，见实现注释）。 */
  var gb3 = sb.createGroupBattle({
    allies: [mk('hero3', 'ally', { hp: 5000, atk: 10, def: 1, spd: 3 })],
    enemies: [mk('e20', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 20 }),
      mk('e10b', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 10 }, { skills: ['possess'] })]
  });
  gb3.rng = function () { return 0.1; };
  var q3 = prep(gb3);
  assert('同档内按有效速度降序；非先制单位一律排在先制档之后',
    ids(q3) === 'e10b,e20,hero3', 'queue=' + ids(q3));

  /* ③b 口径边界守卫：当前**没有任何我方（玩家/宠物）技能**带 priority 字段 ——
     所以「我方不参与预声明」在今天不产生可观测差异。
     若将来给玩家/宠物技能加了先制度，本断言会红，提醒把我方侧一并接上。 */
  var allyPrio = [];
  Object.keys(sb.SKILLS || {}).forEach(function (id) {
    var d = sb.SKILLS[id];
    if (d && d.priority && !/^(surprise|deepfreeze|possess)$/.test(id)) allyPrio.push('SKILLS.' + id);
  });
  (sb.PET_CODEX ? Object.keys(sb.PET_CODEX) : []).forEach(function (sp) {
    (((sb.PET_CODEX[sp] || {}).skills) || []).forEach(function (id) {
      if (sb.SKILLS[id] && sb.SKILLS[id].priority) allyPrio.push('pet:' + sp + '.' + id);
    });
  });
  assert('口径边界：全表里带 priority 的技能只有那 3 个敌群技能（我方不参与预声明无影响）',
    allyPrio.length === 0, allyPrio.join(','));
  assert('玩家技能表（skills.js）确实没有 priority 字段',
    !/priority/.test(load('skills.js')), 'skills.js 里出现了 priority');

  /* ④ 没有先制技能在场时，队列 == 纯速度序（预声明机制不扰动普通战斗） */
  var gb4 = sb.createGroupBattle({
    allies: [mk('h10', 'ally', { hp: 5000, atk: 10, def: 1, spd: 10 })],
    enemies: [mk('m20', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 20 }),
      mk('m10', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 10 })]
  });
  gb4.rng = function () { return 0.1; };
  var q4 = prep(gb4);
  assert('无先制技能时队列 = 速度降序 + 同速我方先手（h10 与 m10 同速）',
    ids(q4) === 'm20,h10,m10', 'queue=' + ids(q4));
  assert('无先制技能时无人声明（不白掷骰）',
    (gb4.units || []).every(function (u) { return !u._declared; }),
    JSON.stringify(gb4.units.map(function (u) { return u._declared; })));

  /* ⑤ 声明发生在**准备阶段**（修前准备阶段一次 aiDecide 都不调） */
  var gb5 = sb.createGroupBattle({
    allies: [mk('hero5', 'ally', { hp: 5000, atk: 10, def: 1, spd: 500 })],
    enemies: [mk('boss5', 'enemy', { hp: 5000, atk: 10, def: 1, spd: 1 }, { skills: ['possess'] })]
  });
  gb5.rng = function () { return 0.1; };
  var preCalls = 0;
  var realDecide5 = sb.aiDecide;
  sb.aiDecide = function (g, a) { preCalls++; return realDecide5(g, a); };
  prep(gb5);
  sb.aiDecide = realDecide5;
  assert('准备阶段就完成了选技（声明）：aiDecide 被调用 1 次（修前 0 次）', preCalls === 1, 'calls=' + preCalls);
  assert('声明带回合戳与目标 id（可 JSON 快照，不含活引用）',
    gb5.enemies[0]._declaredTurn === gb5.turn &&
    Array.isArray(gb5.enemies[0]._declared.targetIds) && gb5.enemies[0]._declared.targetIds.length > 0,
    JSON.stringify(gb5.enemies[0]._declared));

  /* ⑥ 失效回退：声明的技能进了冷却 → 当场重选（aiDecide 第 2 次），且不跳过整回合 */
  var gb6 = sb.createGroupBattle({
    allies: [mk('hero6', 'ally', { hp: 9000, atk: 10, def: 0, spd: 500 })],
    enemies: [mk('foe6', 'enemy', { hp: 9000, atk: 300, def: 0, spd: 1 }, { skills: ['surprise'] })]
  });
  gb6.rng = function () { return 0.1; };
  var calls6 = [];
  var realDecide6 = sb.aiDecide;
  sb.aiDecide = function (g, a) { calls6.push(a.id + (a._declaredTurn === g.turn && a._declared ? '(回退/二次)' : '(声明)')); return realDecide6(g, a); };
  prep(gb6);
  var declaredSkill = gb6.enemies[0]._declared.skillId;
  sb.setSkillCooldown(gb6.enemies[0], declaredSkill, 3);   // 让声明失效（技能进冷却）
  var heroHpBefore = gb6.allies[0].hp;
  var ev6 = sb.runUnitActionStep(gb6, gb6.enemies[0]);
  sb.aiDecide = realDecide6;
  console.log('   声明失效例：声明=' + declaredSkill + ' → 调用序列=' + calls6.join(' / ') + '，事件数=' + ev6.length);
  assert('声明失效 → 当场用同一个 aiDecide 重选（该单位本回合第 2 次调用）',
    calls6.length === 2 && /回退|二次/.test(calls6[1]), calls6.join(','));
  assert('声明失效不会跳过整回合：单位仍然出手（对手掉血）',
    gb6.allies[0].hp < heroHpBefore, heroHpBefore + ' → ' + gb6.allies[0].hp);
  assert('声明失效不会打出那个已失效的技能（本轮没有技能气泡）',
    !(ev6 || []).some(function (e) { return e && e.type === 'bubble' && e.skillId === declaredSkill; }),
    JSON.stringify((ev6 || []).filter(function (e) { return e && e.type === 'bubble'; })));

  /* ⑦ 声明有效时不额外掷骰：一场整回合里该单位只被 aiDecide 询问 1 次 */
  var gb7 = sb.createGroupBattle({
    allies: [mk('hero7', 'ally', { hp: 9000, atk: 10, def: 0, spd: 1 })],
    enemies: [mk('foe7', 'enemy', { hp: 9000, atk: 10, def: 0, spd: 2 }, { skills: ['possess'] })]
  });
  gb7.rng = sb.makeSeededRng(31337);
  var cnt7 = 0;
  var realDecide7 = sb.aiDecide;
  sb.aiDecide = function (g, a) { if (a.id === 'foe7') cnt7++; return realDecide7(g, a); };
  sb.groupBattleTick(gb7);
  sb.aiDecide = realDecide7;
  assert('声明有效的回合里，选技只发生一次（准备阶段），行动阶段不重复掷骰',
    cnt7 === 1, 'aiDecide calls=' + cnt7);

  /* ⑧ 疾影的额外行动**不重复使用**同一声明（否则会绕过技能冷却多放一次技能） */
  var gb8 = sb.createGroupBattle({
    allies: [mk('hero8', 'ally', { hp: 9000, atk: 10, def: 0, spd: 1 })],
    enemies: [mk('foe8', 'enemy', { hp: 9000, atk: 10, def: 0, spd: 2 }, { skills: ['possess'] })]
  });
  gb8.rng = function () { return 0.1; };
  sb.attachAffixes(gb8.enemies[0], ['extra_act']);   // 每次机会 55%，固定 0.1 → 必触发
  var cnt8 = 0;
  var realDecide8 = sb.aiDecide;
  sb.aiDecide = function (g, a) { if (a.id === 'foe8') cnt8++; return realDecide8(g, a); };
  sb._setBattleRng(gb8);
  prep(gb8);
  sb.runUnitActionStep(gb8, gb8.enemies[0]);
  sb.aiDecide = realDecide8;
  assert('额外行动会重新选技（声明一回合只消费一次）→ aiDecide 共 2 次',
    cnt8 === 2, 'aiDecide calls=' + cnt8);
}

/* ============================================================
   [3] 疾影 =「每回合 55%」（取消跨回合冷却）
   修前：触发后 _extraCd=3 → 每 3 个回合才有一次机会（每回合 ≈18~26%）。
   ============================================================ */
console.log('\n[3] 疾影：每回合 55%');
{
  var TURNS = 12000;
  var probe = mk('shadowP', 'enemy', { hp: 10000000, atk: 1, def: 0, spd: 5 });
  sb.attachAffixes(probe, ['extra_act']);
  var dummy = mk('dummyD', 'ally', { hp: 100000000, atk: 0, def: 0, spd: 1 });
  var gb = sb.createGroupBattle({ allies: [dummy], enemies: [probe], seed: 20261003 });
  var calls = 0;
  var realGTU = sb.groupUnitTurn;
  sb.groupUnitTurn = function (g, u) { if (u === probe) calls++; return realGTU(g, u); };
  var trig = 0, chained = 0, consecutive = 0, prevTrig = false, cdSeen = 0;
  for (var t = 0; t < TURNS; t++) {
    if ((probe._extraCd || 0) > 0) cdSeen++;   // 修前：触发后会有跨回合冷却
    calls = 0;
    sb.groupBattleTick(gb);
    var did = calls >= 2;
    if (did) trig++;
    if (did && prevTrig) consecutive++;
    if (calls > 2) chained++;
    prevTrig = did;
  }
  sb.groupUnitTurn = realGTU;
  var rate = trig / TURNS;
  var sd = Math.sqrt(0.55 * 0.45 / TURNS);
  console.log('   抽样 ' + TURNS + ' 回合：额外行动 ' + trig + ' 次 → 每回合触发率 = ' + (rate * 100).toFixed(2) +
    '%（定义 55%；95% 置信区间 ±' + (1.96 * sd * 100).toFixed(2) + ' 个百分点）');
  console.log('   连续两回合都触发的次数 = ' + consecutive + '（修前恒为 0：触发后锁 3 回合）');
  assert('每回合触发率 ≈ 55%（实测 ' + (rate * 100).toFixed(2) + '%，容差 ±3pp）',
    Math.abs(rate - 0.55) <= 0.03, (rate * 100).toFixed(2) + '%');
  assert('每回合触发率明显高于修前的 26.21%（防回退到跨回合冷却）', rate > 0.45, (rate * 100).toFixed(2) + '%');
  assert('允许连续两回合触发（修前恒为 0）', consecutive > 0, 'consecutive=' + consecutive);
  assert('不再存在跨回合冷却（_extraCd 全程为 0 的回合数 = ' + cdSeen + '）', cdSeen === 0, 'cdSeen=' + cdSeen);
  assert('一次机会最多额外行动一次（不连环叠加）', chained === 0, 'chained=' + chained);

  /* 冷却字段与钩子：extra_act 自己不再有跨回合冷却 */
  var probe2 = mk('p2', 'enemy', { hp: 100000, atk: 1, def: 0, spd: 5 });
  sb.attachAffixes(probe2, ['extra_act']);
  var gb2 = sb.createGroupBattle({ allies: [mk('d2', 'ally', { hp: 100000, atk: 0, def: 0, spd: 1 })], enemies: [probe2] });
  gb2.rng = function () { return 0.1; };          // 必触发
  sb._setBattleRng(gb2);
  sb.runUnitActionStep(gb2, probe2);
  assert('触发后不再写 _extraCd（修前 = 3）', probe2._extraCd === undefined, String(probe2._extraCd));
  assert('extra_act 不再有 onTurnEnd 冷却递减钩子（修前存在）',
    !(sb.AFFIXES.extra_act.hooks && sb.AFFIXES.extra_act.hooks.onTurnEnd),
    JSON.stringify(Object.keys((sb.AFFIXES.extra_act.hooks || {}))));
  assert('extra_act 的描述改为「每回合 55%」', /每回合/.test(sb.AFFIXES.extra_act.desc), sb.AFFIXES.extra_act.desc);

  /* 隔离：_extraCd / extraAction 只属于 extra_act（没有别的天赋/词条复用） */
  var clutter = [];
  ['talent.js', 'affix.js', 'player-skill-hooks.js', 'pet-codex.js', 'skill.js', 'status-defs.js'].forEach(function (f) {
    var src = load(f);
    var hits = (src.match(/_extraCd|extraAction/g) || []).length;
    if (f !== 'affix.js' && hits > 0) clutter.push(f + ':' + hits);
  });
  assert('隔离核实：_extraCd / extraAction 只出现在 affix.js（别的模块 0 处）',
    clutter.length === 0, clutter.join(','));
}

console.log('\n结果：' + pass + ' 绿 / ' + fail + ' 红');
process.exit(fail ? 1 : 0);

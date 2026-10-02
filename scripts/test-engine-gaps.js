#!/usr/bin/env node
/* v2.4.7 测试：四条「写了但没生效」的引擎缺陷（清单 doc/plans/战斗阶段化-技能与天赋清单.md §8.5 第 1/2/10/13 条）
   作者裁定：这 4 条先修。每条都配一个「修前会红、修后必绿」的真断言（不是「没抛错」）。

   覆盖：
     [1] 先制度 priority 进出手队列（§8.5-1）
         · 先制单位速度**低于**对手时仍先出手（分档语义，不是「+50 速度」）
         · 先制度高者先于**所有**非先制单位（速度 500 vs 先制 spd 1）
         · 非先制单位之间仍按有效速度降序 + 既有 tie-break（同速我方先手 / 同方创建序）
         · 先制技能在冷却中 → 不享受先制（判据 = usableSkills 口径）
         · buildActionQueue 不掷骰（同种子可复现的不变式）
     [2] 懒惰 lazy 的减伤真正生效（§8.5-2）：放弃行动回合受击掉血 < 对照；
         只在「本单位是受击方且本回合放弃行动」时生效（技能通道同样生效）
     [3] 末日 doomed「普攻伤害减半」真正生效（§8.5-13）：中末日者自己普攻 ≈ 对照的 50%；
         同时守住末日其余三项（禁技 / 治疗阻断 / 每回合开始伤害）不被弄坏
     [4] 词条「疾影」extra_act 的额外行动率 ≈ 55%（§8.5-10）：抽样 ≥2000 次机会；
         并锁死「onAfterAction 每个单位每次行动只派发一次」（§8.6 的历史遗留双重派发）

   Run: node scripts/test-engine-gaps.js
*/
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var load = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8'); };
/* 与 test-battle-phases.js 同一套加载清单（多一个 affix.js —— 疾影是**词条**不是天赋） */
var files = ['utils.js', 'date-roll.js', 'levels.js', 'group-levels.js', 'unit.js', 'state-core.js',
  'status-defs.js', 'talent.js', 'affix.js', 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js',
  'terrain.js', 'ai.js', 'pets.js', 'pet-materials.js', 'pet-codex.js', 'skills.js', 'player-skill-hooks.js'];
/* 确定性随机：Math.random 钉死 0.5（命中判定 0.5 < 0.95 必中）。需要真抽样的用例走 gb 的种子 RNG。 */
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
function order(gb) { return sb.buildActionQueue(gb).map(function (u) { return u.id; }).join(','); }

/* ============================================================
   [1] 先制度 priority 进出手队列（§8.5-1）
   修前：buildActionQueue 传 unitInitiative(u, null) → priority 永不参与排序，
        先制单位永远按裸速度排在后面。
   ============================================================ */
console.log('\n[1] 先制度 priority 进出手队列');
{
  /* ① 先制单位速度**远低于**对手：修前是 hero(30) 先手，修后必须 boss 先手。
     这条同时否掉「把 priority 当 +50 速度」的另一种实现（那样 speed 500 的 hero 仍先手）。 */
  var gb1 = sb.createGroupBattle({
    allies: [mk('hero1', 'ally', { hp: 100, atk: 10, def: 1, spd: 30 })],
    enemies: [mk('boss1', 'enemy', { hp: 100, atk: 10, def: 1, spd: 1 }, { skills: ['surprise'] }),
      mk('mob1', 'enemy', { hp: 100, atk: 10, def: 1, spd: 20 })]
  });
  assert('先制单位（spd1，击掌奇袭 priority+1）先于 spd30 的对手出手',
    sb.buildActionQueue(gb1)[0].id === 'boss1', 'queue=' + order(gb1));
  assert('先制单位也先于同阵营更快的杂兵（spd20）', order(gb1) === 'boss1,hero1,mob1', 'queue=' + order(gb1));

  /* ② 先制度是**分档**而不是速度加成：对手速度 500，先制单位速度 1 —— 仍是先制单位先手 */
  var gb2 = sb.createGroupBattle({
    allies: [mk('hero2', 'ally', { hp: 100, atk: 10, def: 1, spd: 500 })],
    enemies: [mk('boss2', 'enemy', { hp: 100, atk: 10, def: 1, spd: 1 }, { skills: ['possess'] })]
  });
  assert('先制度与速度正交：spd500 的非先制单位仍排在先制单位之后',
    sb.buildActionQueue(gb2)[0].id === 'boss2', 'queue=' + order(gb2));

  /* ③ 普通单位之间：有效速度降序 + 既有 tie-break（同速我方先手、同方按创建序）—— 一分不动 */
  var gb3 = sb.createGroupBattle({
    allies: [mk('a10', 'ally', { hp: 100, atk: 10, def: 1, spd: 10 })],
    enemies: [mk('e10a', 'enemy', { hp: 100, atk: 10, def: 1, spd: 10 }),
      mk('e20', 'enemy', { hp: 100, atk: 10, def: 1, spd: 20 }),
      mk('e10b', 'enemy', { hp: 100, atk: 10, def: 1, spd: 10 })]
  });
  assert('无先制单位时：速度降序 + 同速我方先手 + 同方创建序（e20,a10,e10a,e10b）',
    order(gb3) === 'e20,a10,e10a,e10b', 'queue=' + order(gb3));

  /* ④ 判据 = 「可用的先制技能」：冷却中不算可用（否则等于给一个放不出来的技能先手权） */
  var gb4 = sb.createGroupBattle({
    allies: [mk('hero4', 'ally', { hp: 100, atk: 10, def: 1, spd: 30 })],
    enemies: [mk('boss4', 'enemy', { hp: 100, atk: 10, def: 1, spd: 1 }, { skills: ['surprise'] })]
  });
  sb.setSkillCooldown(gb4.enemies[0], 'surprise', 3);
  assert('先制技能在冷却中 → 不进先制档（仍按速度排队）',
    order(gb4) === 'hero4,boss4', 'queue=' + order(gb4));

  /* ⑤ 两个同为先制度 +1 的单位：同级内按有效速度降序，且都先于非先制单位 */
  var gb5 = sb.createGroupBattle({
    allies: [mk('hero5', 'ally', { hp: 100, atk: 10, def: 1, spd: 5 }, { skills: ['deepfreeze'] })],
    enemies: [mk('boss5', 'enemy', { hp: 100, atk: 10, def: 1, spd: 8 }, { skills: ['possess'] }),
      mk('mob5', 'enemy', { hp: 100, atk: 10, def: 1, spd: 99 })]
  });
  assert('同为 +1 先制：档内按速度降序（boss5 spd8 > hero5 spd5），且都先于 spd99 的非先制单位',
    order(gb5) === 'boss5,hero5,mob5', 'queue=' + order(gb5));

  /* ⑥ 不变式：buildActionQueue 不掷骰 —— 同种子结果必须可复现（test-group-determinism 依赖它） */
  var probeGb = sb.createGroupBattle({
    allies: [mk('p1', 'ally', { hp: 100, atk: 10, def: 1, spd: 10 }, { skills: ['deepfreeze'] })],
    enemies: [mk('p2', 'enemy', { hp: 100, atk: 10, def: 1, spd: 20 }, { skills: ['surprise'] })]
  });
  probeGb.rng = sb.makeSeededRng(987654);
  var r1 = probeGb.rng();
  probeGb.rng = sb.makeSeededRng(987654);
  sb.buildActionQueue(probeGb);
  var r2 = probeGb.rng();
  assert('buildActionQueue 不消耗 gb.rng（不掷骰、不影响同种子结果）', r1 === r2, r1 + ' vs ' + r2);
}

/* ============================================================
   [2] 懒惰 lazy 的减伤真正生效（§8.5-2）
   修前：lazy.onDamage 产出 dmgReduce，但受击方 mutation 循环不消费该键 → 掉血与对照完全相同。
   口径：dmgReduce 值来自 talent 定义（level1 → 区间下限 0.20）。
   ============================================================ */
console.log('\n[2] 懒惰 lazy：放弃行动回合受击减伤');
{
  var LAZY_SEED = 4242;
  /* 同一击的可比性：两侧用**同一 seed** 建场 → 命中判定与伤害浮动一致，唯一变量是该天赋 */
  function hitOnce(opts) {
    var a = mk('atkA', 'ally', { hp: 100000, atk: 100, def: 0, spd: 10 });
    var b = mk('tgtB', 'enemy', { hp: 100000, atk: 1, def: 0, spd: 1 });
    if (opts.talent) sb.attachTalents(b, opts.talent);
    if (opts.skip != null) b._lazySkip = opts.skip;
    var gb = sb.createGroupBattle({ allies: [a], enemies: [b], seed: LAZY_SEED });
    var before = b.hp;
    var evts = sb.normalAttack(gb, a, b);
    return { dmg: before - b.hp, msgs: (evts || []).map(function (e) { return e.msg; }).join(' | ') };
  }
  var noTalent = hitOnce({});
  var lazySkip = hitOnce({ talent: ['lazy'], skip: true });
  var lazyNoSkip = hitOnce({ talent: ['lazy'], skip: false });
  var rate = sb.talentValue('lazy', 'dmgReduce', sb.createUnit({ side: 'enemy', base: { hp: 1 } }), 0.30);
  console.log('   不带该天赋           : ' + noTalent.dmg + '  (' + noTalent.msgs + ')');
  console.log('   带 lazy 且放弃行动    : ' + lazySkip.dmg + '  (' + lazySkip.msgs + ')');
  console.log('   带 lazy 但未放弃行动  : ' + lazyNoSkip.dmg + '  (' + lazyNoSkip.msgs + ')');
  console.log('   定义减伤幅度（level1）= ' + rate);
  /* 先确认对照组真的打中了（否则三条断言会一起退化成「0 vs 0」的假绿） */
  assert('对照组必须命中（seed ' + LAZY_SEED + ' 的命中判定落地）', noTalent.dmg > 0, String(noTalent.dmg));
  assert('带 lazy 且放弃行动 → 受击掉血**低于**不带该天赋的对照',
    lazySkip.dmg < noTalent.dmg, lazySkip.dmg + ' vs ' + noTalent.dmg);
  assert('掉血 = 对照 ×(1 − 定义减伤)（'+ noTalent.dmg + ' → ' + lazySkip.dmg + '）',
    lazySkip.dmg === Math.floor(noTalent.dmg * (1 - rate)), lazySkip.dmg + ' vs ' + Math.floor(noTalent.dmg * (1 - rate)));
  assert('带 lazy 但**未**放弃行动 → 减伤不生效（掉血与对照一致）',
    lazyNoSkip.dmg === noTalent.dmg, lazyNoSkip.dmg + ' vs ' + noTalent.dmg);

  /* 减伤只属于「受击方」：本单位作为**攻击方**时不该被这个键削自己的伤害 */
  var atkLazy = (function () {
    var a = mk('atkLazy', 'ally', { hp: 100000, atk: 100, def: 0, spd: 10 });
    sb.attachTalents(a, ['lazy']);
    a._lazySkip = true;                       // 攻击方处于「放弃行动」标记（反应式 hook 可能带出）
    var b = mk('tgtPlain', 'enemy', { hp: 100000, atk: 1, def: 0, spd: 1 });
    var gb = sb.createGroupBattle({ allies: [a], enemies: [b], seed: LAZY_SEED });
    var before = b.hp;
    sb.normalAttack(gb, a, b);
    return { dmg: before - b.hp };
  })();
  assert('攻击方带 lazy 标记时**不**削自己造成的伤害（dmgReduce 只属于受击方）',
    atkLazy.dmg === noTalent.dmg, atkLazy.dmg + ' vs ' + noTalent.dmg);

  /* 技能通道同样吃减伤（生产端不区分伤害通道） */
  var SK_SEED = 8181;
  function skillHitOnce(skip) {
    var caster = mk('casterC', 'enemy', { hp: 100000, atk: 100, def: 0, spd: 10 }, { skills: ['charge'] });
    var target = mk('tgtC', 'ally', { hp: 100000, atk: 1, def: 0, spd: 1 });
    sb.attachTalents(target, ['lazy']);
    target._lazySkip = skip;
    var gb = sb.createGroupBattle({ allies: [target], enemies: [caster], seed: SK_SEED });
    var before = target.hp;
    var evts = sb.castSkill(gb, caster, 'charge');
    return { dmg: before - target.hp, msgs: (evts || []).map(function (e) { return e.msg; }).join(' | ') };
  }
  var skPlain = skillHitOnce(false);
  var skLazy = skillHitOnce(true);
  console.log('   技能通道：未放弃行动 ' + skPlain.dmg + ' → 放弃行动 ' + skLazy.dmg);
  assert('技能通道对照组必须命中（防「0 对 0」假绿）', skPlain.dmg > 0, String(skPlain.dmg));
  assert('技能伤害同样被 lazy 减伤覆盖（且为定义幅度）',
    skLazy.dmg === Math.floor(skPlain.dmg * (1 - rate)), skLazy.dmg + ' vs ' + skPlain.dmg);
}

/* ============================================================
   [3] 末日 doomed「普攻伤害减半」（§8.5-13）
   修前：doomed.onDamage 产出 dmgDealtHalf，但状态钩子只在**受击方**通道派发 → 比值恒为 1.0。
   ============================================================ */
console.log('\n[3] 末日 doomed：中末日者自己普攻伤害减半');
{
  var DOOM_SEED = 5150;
  function doomedAttack(doomed) {
    var a = mk('doomedGuy', 'enemy', { hp: 100000, atk: 200, def: 0, spd: 10 });
    var b = mk('victimV', 'ally', { hp: 1000000, atk: 1, def: 0, spd: 1 });
    var gb = sb.createGroupBattle({ allies: [b], enemies: [a], seed: DOOM_SEED });
    if (doomed) sb.applyStatus(a, { id: 'doomed', duration: 5, source: b });
    var before = b.hp;
    var evts = sb.normalAttack(gb, a, b);
    return { dmg: before - b.hp, msgs: (evts || []).map(function (e) { return e.msg; }).join(' | ') };
  }
  var dNone = doomedAttack(false);
  var dDoom = doomedAttack(true);
  var ratio = dDoom.dmg / dNone.dmg;
  console.log('   对照（未中末日）: ' + dNone.dmg + '  (' + dNone.msgs + ')');
  console.log('   中末日者自己普攻: ' + dDoom.dmg + '  (' + dDoom.msgs + ')');
  console.log('   比值 = ' + ratio.toFixed(4) + '（期望 ≈ 0.50）');
  assert('对照组必须命中（防「0 对 0」假绿）', dNone.dmg > 0, String(dNone.dmg));
  assert('中末日者自己普攻的伤害 ≈ 对照的 50%（' + dDoom.dmg + ' vs ' + dNone.dmg + '）',
    ratio >= 0.45 && ratio <= 0.55, 'ratio=' + ratio.toFixed(4));
  assert('减半口径 = floor(对照 / 2)',
    dDoom.dmg === Math.floor(dNone.dmg / 2), dDoom.dmg + ' vs ' + Math.floor(dNone.dmg / 2));

  /* 末日其余三项不许被弄坏（作者口径：其余三项已生效） */
  var other = mk('doomedOther', 'enemy', { hp: 1000, atk: 10, def: 1, spd: 5 }, { skills: ['charge'] });
  sb.applyStatus(other, { id: 'doomed', duration: 5, source: mk('srcS', 'ally', { hp: 1, atk: 1, def: 1, soulAtk: 100 }) });
  var dis = sb.dispatch(other, 'onBeforeAction', {});
  assert('末日②技能禁用：onBeforeAction 仍产出 skillsDisabled',
    dis.mutations.some(function (m) { return m.key === 'skillsDisabled' && m.value; }),
    JSON.stringify(dis.mutations));
  var healBlock = sb.dispatch(other, 'onHeal', {});
  assert('末日③治疗阻断：onHeal 仍 skipAction',
    healBlock.skipAction === true, JSON.stringify(healBlock.events));
  var dot = sb.dispatch(other, 'onTurnStart', { turn: 2 });
  assert('末日④回合开始伤害：onTurnStart 仍按施加者魂攻 50% 掉血',
    dot.events.length === 1 && /末日: -\d+/.test(dot.events[0].msg), JSON.stringify(dot.events));
  /* 起手后仍是「受击方通道」的减伤：doomed 不该在受击方通道被当成 dmgReduce/dmgTakenReduce */
  assert('末日不在**受击方**通道产出 dmgReduce（减半只作用于持有者自己的出手）',
    !sb.dispatch(other, 'onDamage', { isPlayerAttack: false }).mutations.some(function (m) { return m.key === 'dmgReduce'; }));
}

/* ============================================================
   [4] 词条「疾影」extra_act：额外行动率 ≈ 55%（§8.5-10）+ onAfterAction 单一派发（§8.6）
   修前：内层派发先掷（掷中即置 _extraCd=3 但 mutation 被丢弃）→ 外层必然冷却早退
        → 每次机会 0.45 × 0.55 ≈ 24.75%。
   ============================================================ */
console.log('\n[4] 词条「疾影」额外行动率（抽样）');
{
  var TURNS = 12000;
  var probe = mk('shadowP', 'enemy', { hp: 10000000, atk: 1, def: 0, spd: 5 });
  sb.attachAffixes(probe, ['extra_act']);
  var dummy = mk('dummyD', 'ally', { hp: 100000000, atk: 0, def: 0, spd: 1 });
  var gb = sb.createGroupBattle({ allies: [dummy], enemies: [probe], seed: 20261003 });
  var calls = 0;
  var realGTU = sb.groupUnitTurn;
  sb.groupUnitTurn = function (g, u) { if (u === probe) calls++; return realGTU(g, u); };
  var opp = 0, trig = 0, trigWhileCd = 0, chained = 0;
  for (var t = 0; t < TURNS; t++) {
    var cd0 = probe._extraCd || 0;
    calls = 0;
    sb.groupBattleTick(gb);
    if (cd0 === 0) {
      opp++;
      if (calls >= 2) trig++;
    } else if (calls >= 2) {
      trigWhileCd++;                 // 冷却期内还额外行动 = 冷却失效
    }
    if (calls > 2) chained++;        // 一次机会最多额外行动一次（不连环）
  }
  sb.groupUnitTurn = realGTU;
  var rate = trig / opp;
  var sd = Math.sqrt(0.55 * 0.45 / opp);
  console.log('   抽样：' + TURNS + ' 回合，可触发机会（_extraCd==0）=' + opp + '，实际额外行动=' + trig);
  console.log('   额外行动率 = ' + (rate * 100).toFixed(2) + '%（定义 55%；95% 置信区间 ±' +
    (1.96 * sd * 100).toFixed(2) + ' 个百分点）');
  assert('抽样机会数 ≥ 2000（实际 ' + opp + '）', opp >= 2000, String(opp));
  assert('额外行动率 ≈ 55%（实测 ' + (rate * 100).toFixed(2) + '%，容差 ±3pp）',
    Math.abs(rate - 0.55) <= 0.03, (rate * 100).toFixed(2) + '%');
  assert('额外行动率明显高于修前的 24.75%（防回归到双重派发）', rate > 0.40, (rate * 100).toFixed(2) + '%');
  assert('冷却期内不额外行动（_extraCd 语义生效）', trigWhileCd === 0, 'violations=' + trigWhileCd);
  assert('一次机会最多额外行动一次（不连环叠加）', chained === 0, 'chained=' + chained);

  /* 单独锁死 §8.6「onAfterAction 双重派发」：每个单位每次行动只派发一次 */
  var count = 0;
  var realTD = sb.talentDispatch;
  sb.talentDispatch = function (u, hook, ctx) { if (hook === 'onAfterAction') count++; return realTD(u, hook, ctx); };
  var g2 = sb.createGroupBattle({
    allies: [mk('aA', 'ally', { hp: 100000, atk: 10, def: 0, spd: 1 })],
    enemies: [mk('aB', 'enemy', { hp: 100000, atk: 10, def: 0, spd: 1 })]
  });
  sb.attachAffixes(g2.enemies[0], ['extra_act']);
  g2.enemies[0]._extraCd = 0;
  count = 0;
  sb.runUnitActionStep(g2, g2.enemies[0]);
  var first = count;
  count = 0;
  sb.runUnitActionStep(g2, g2.allies[0]);
  var second = count;
  sb.talentDispatch = realTD;
  assert('onAfterAction 每次单位行动只派发一次（内层重复派发已删除）',
    first === 1 && second === 1, 'enemy=' + first + ' ally=' + second);
}

console.log('\n结果：' + pass + ' 绿 / ' + fail + ' 红');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* v2.4.5 测试：每回合拆成四阶段（准备 → 行动 → 判定 → 结束）
   实现依据：doc/plans/战斗阶段化-技能与天赋清单.md §10「作者裁定记录」。

   本套件覆盖（全部是**真断言**，不是「没抛错」）：
     1) 冻结契约：GB_PHASES 顺序 / window 导出 / gb.phase 合法 / **每条 gb.log 条目带 phase**
     2) 一场真战斗的四阶段序列（准备→行动→判定→结束，逐回合校验顺序）
     3) **作者核心诉求**：灵感涌动在准备阶段落地 → 本回合「更慢出手」的我方单位也吃到加成
        （正反两个位次：慢受益人 / 快受益人 —— 后者能抓住「提前到队列之前」这一条）
     4) 诅咒类（哈欠/末日/遗言/幻影之瞳）在**准备阶段**结算；附身类在**目标自己的行动阶段开始时**
     5) dot / duration 到期 / 天赋 onTurnEnd（振翅）在**判定阶段**结算
     6) 蓄力释放仍在**行动阶段**（作者裁定 §10-1 否掉了「搬去判定阶段」的拟改）
     7) 末日 / 遗言的**实际扣血次数**（作者预判 3 / 6，实测见下方断言处的说明）
     8) 两条推进路径（groupBattleTick / groupBattleStep）行为**完全一致**
     9) 每回合派发次数（灵感涌动：每回合 1 次，不是每个单位 1 次）
   Run: node scripts/test-battle-phases.js
*/
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var load = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8'); };
var files = ['utils.js', 'date-roll.js', 'levels.js', 'group-levels.js', 'unit.js', 'state-core.js',
  'status-defs.js', 'talent.js', 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js', 'terrain.js', 'ai.js',
  'pets.js', 'pet-materials.js', 'pet-codex.js', 'skills.js', 'player-skill-hooks.js'];
/* 确定性随机：Math.random 钉死 0.5（命中判定 0.5 < 0.95 必中）；需要特定掷骰的用例单独覆盖 gb.rng */
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
var msgs = function (evts) {
  return (evts || []).map(function (e) { return (e && e.msg) || ''; }).join(' | ');
};
function mk(id, side, base, extra) {
  var opts = { id: id, side: side, name: id, base: base };
  if (extra) { for (var k in extra) opts[k] = extra[k]; }
  return sb.createUnit(opts);
}
/* 日志条目 → 「回合 → 该回合出现过的阶段（去重保序）」 */
function phasesByTurn(gb) {
  var out = [], cur = null;
  (gb.log || []).forEach(function (l) {
    if (!cur || cur.turn !== l.turn) { cur = { turn: l.turn, phases: [] }; out.push(cur); }
    if (cur.phases[cur.phases.length - 1] !== l.phase) cur.phases.push(l.phase);
  });
  return out;
}
/* 含某文案的日志条目（返回 [{turn, phase, unit, events}]） */
function entriesMatching(gb, re) {
  var out = [];
  (gb.log || []).forEach(function (l) {
    if (re.test(msgs(l.events))) out.push(l);
  });
  return out;
}
function entriesInPhase(gb, phase, re) {
  return entriesMatching(gb, re).filter(function (l) { return l.phase === phase; });
}

/* ============================================================
   1. 冻结契约
   ============================================================ */
console.log('\n[1] 冻结契约（GB_PHASES / gb.phase / 每条日志带 phase）');
assert('GB_PHASES 顺序固定 = 准备·行动·判定·结束',
  Array.isArray(sb.GB_PHASES) && sb.GB_PHASES.length === 4 &&
  sb.GB_PHASES[0] === '准备' && sb.GB_PHASES[1] === '行动' &&
  sb.GB_PHASES[2] === '判定' && sb.GB_PHASES[3] === '结束',
  JSON.stringify(sb.GB_PHASES));
assert('GB_PHASES 已导出到 window（显示层唯一取数口）', sb.window.GB_PHASES === sb.GB_PHASES);
{
  var gbC = sb.createGroupBattle({ allies: [mk('c1', 'ally', { hp: 100, atk: 10, def: 5, spd: 5 })], enemies: [mk('c2', 'enemy', { hp: 100, atk: 10, def: 5, spd: 1 })] });
  assert('新建战斗的 gb.phase 是合法阶段名', sb.GB_PHASES.indexOf(gbC.phase) >= 0, String(gbC.phase));
  assert('未跑任何阶段前 phase = 准备（建场初值）', gbC.phase === '准备', String(gbC.phase));
}

/* ============================================================
   2. 一场真战斗的四阶段序列
   构造：酷暑场地（必产「结束阶段」条目）+ 中毒（必产「判定阶段」条目）
        + 末日（必产「准备阶段」条目）+ 双方都会普攻（「行动阶段」条目）
   ============================================================ */
console.log('\n[2] 四阶段序列（真战斗跑完，从 gb.log 的 phase 读）');
var gb2;
{
  var victim2 = mk('靶', 'ally', { hp: 100000, atk: 1, def: 9999, soulDef: 0, spd: 5 });
  var caster2 = mk('术', 'enemy', { hp: 100000, atk: 1, def: 9999, soulAtk: 200, spd: 1 });
  gb2 = sb.createGroupBattle({ allies: [victim2], enemies: [caster2], terrain: sb.getTerrain('heat') });
  sb.applyStatus(victim2, { id: 'poison', duration: 3 });
  sb.applyStatus(victim2, { id: 'doomed', duration: 3, source: caster2 });
  sb.runGroupBattle(gb2, 4);
}
assert('跑完后 gb.phase 停在最后一个阶段「结束」', gb2.phase === '结束', String(gb2.phase));
assert('整场每条 gb.log 条目都带合法 phase',
  gb2.log.length > 0 && gb2.log.every(function (l) { return sb.GB_PHASES.indexOf(l.phase) >= 0; }),
  JSON.stringify(gb2.log.filter(function (l) { return sb.GB_PHASES.indexOf(l.phase) < 0; }).map(function (l) { return l.unit + '/' + l.phase; })));
{
  var byTurn = phasesByTurn(gb2);
  var t1 = byTurn.filter(function (x) { return x.turn === 1; })[0];
  var t2 = byTurn.filter(function (x) { return x.turn === 2; })[0];
  var t3 = byTurn.filter(function (x) { return x.turn === 3; })[0];
  var want = ['准备', '行动', '判定', '结束'];
  [['回合 1', t1], ['回合 2', t2], ['回合 3', t3]].forEach(function (pair) {
    var label = pair[0], rec = pair[1];
    assert(label + ' 的阶段序列 = 准备→行动→判定→结束',
      !!rec && rec.phases.join(',') === want.join(','),
      rec ? rec.phases.join(',') : '（该回合没有日志）');
  });
  /* 同一回合内阶段序号必须单调不减（契约顺序不可乱） */
  var idxOf = function (p) { return sb.GB_PHASES.indexOf(p); };
  var monotone = true, bad = '';
  byTurn.forEach(function (rec) {
    for (var i = 1; i < rec.phases.length; i++) {
      if (idxOf(rec.phases[i]) <= idxOf(rec.phases[i - 1])) { monotone = false; bad = 't' + rec.turn + ':' + rec.phases.join(','); }
    }
  });
  assert('同一回合内阶段顺序单调递增（不乱序）', monotone, bad);
}
assert('准备阶段的条目来自末日结算（phase=准备）',
  entriesInPhase(gb2, '准备', /🌑 末日: -/).length >= 1,
  JSON.stringify(phasesByTurn(gb2).map(function (x) { return 't' + x.turn + ':' + x.phases.join(','); })));
assert('判定阶段的条目来自中毒结算（phase=判定）',
  entriesInPhase(gb2, '判定', /☠️ 中毒: -/).length >= 1);
assert('结束阶段的条目来自场地结算（phase=结束）',
  entriesInPhase(gb2, '结束', /☀️ 酷暑/).length >= 1);

/* ============================================================
   3. 作者核心诉求：灵感涌动在准备阶段落地，慢出手的队友也吃到加成
   ============================================================ */
console.log('\n[3] 灵感涌动（每回合一次的回合开始类效果 → 准备阶段）');
/* 3a. 受益者是**更慢**的队友（任务书指定场景） */
{
  var slow = mk('slow', 'ally', { hp: 5000, atk: 10, def: 0, soulAtk: 100, spd: 1 });
  var dreamFast = mk('dream', 'ally', { hp: 5000, atk: 10, def: 0, soulAtk: 50, spd: 50 });
  dreamFast._talents = ['inspiration'];
  var foe3 = mk('foe', 'enemy', { hp: 99999, atk: 1, def: 0, spd: 10 });
  var gb3 = sb.createGroupBattle({ allies: [slow, dreamFast], enemies: [foe3] });
  gb3.rng = function () { return 0; };   // 灵感涌动必选 allies[0] = slow
  var baseline = sb.effectiveStat(slow, 'soulAtk');
  var atSlowAction = null;
  for (var i3 = 0; i3 < 8 && atSlowAction === null; i3++) {
    var r3 = sb.groupBattleStep(gb3);
    if (r3.unit && r3.unit.id === 'slow') atSlowAction = sb.effectiveStat(slow, 'soulAtk');
  }
  assert('3a 基线：慢宠魂攻 = 100', baseline === 100, String(baseline));
  assert('3a 灵感涌动记在**准备阶段**的日志里',
    entriesInPhase(gb3, '准备', /✨ 灵感涌动/).length === 1,
    JSON.stringify(gb3.log.map(function (l) { return l.phase + ':' + msgs(l.events); })));
  assert('3a **慢宠行动时**魂攻 120 > 基线 100（核心诉求）',
    atSlowAction === 120, '在慢宠行动时读到 ' + atSlowAction);
  assert('3a 加成落在慢宠身上（日志点名）', new RegExp('✨ 灵感涌动: slow 魂攻 \\+20%').test(msgs(
    entriesInPhase(gb3, '准备', /灵感涌动/).reduce(function (a, l) { return a.concat(l.events); }, []))));
}
/* 3b. 受益者是**更快**的队友：只有「在出手队列建立之前」落地才吃得到
       （把准备阶段那次派发改回每单位 → 受益人先出手，读到的仍是基线 → 本断言变红） */
{
  var fastB = mk('fast', 'ally', { hp: 5000, atk: 10, def: 0, soulAtk: 100, spd: 50 });
  var dreamSlow = mk('dream', 'ally', { hp: 5000, atk: 10, def: 0, soulAtk: 50, spd: 1 });
  dreamSlow._talents = ['inspiration'];
  var foe3b = mk('foe2', 'enemy', { hp: 99999, atk: 1, def: 0, spd: 40 });
  var gb3b = sb.createGroupBattle({ allies: [fastB, dreamSlow], enemies: [foe3b] });
  gb3b.rng = function () { return 0; };   // 必选 allies[0] = fast
  var base3b = sb.effectiveStat(fastB, 'soulAtk');
  var atFastAction = null;
  for (var i3b = 0; i3b < 8 && atFastAction === null; i3b++) {
    var r3b = sb.groupBattleStep(gb3b);
    if (r3b.unit && r3b.unit.id === 'fast') atFastAction = sb.effectiveStat(fastB, 'soulAtk');
  }
  assert('3b 速度最快的受益人（在梦幻之前出手）也吃到加成：120 > 100',
    base3b === 100 && atFastAction === 120, 'base=' + base3b + ' atAction=' + atFastAction);
}
/* 3c. 派发次数：每**回合**一次（不是每个单位一次） */
{
  var a1 = mk('a1', 'ally', { hp: 5000, atk: 5, def: 0, spd: 20 });
  var a2 = mk('a2', 'ally', { hp: 5000, atk: 5, def: 0, spd: 10 });
  var dream3 = mk('dream', 'ally', { hp: 5000, atk: 5, def: 0, spd: 30 });
  dream3._talents = ['inspiration'];
  var foe3c = mk('foe3', 'enemy', { hp: 99999, atk: 1, def: 0, spd: 1 });
  var gb3c = sb.createGroupBattle({ allies: [a1, a2, dream3], enemies: [foe3c] });
  gb3c.rng = function () { return 0; };
  sb.groupBattleTick(gb3c);
  sb.groupBattleTick(gb3c);
  var insEntries = entriesMatching(gb3c, /✨ 灵感涌动/);
  assert('3c 3 名我方单位 + 2 个回合 → 灵感涌动只派发 2 次（每回合 1 次）',
    insEntries.length === 2, '实际 ' + insEntries.length + ' 次: ' + JSON.stringify(insEntries.map(function (l) { return l.turn + '/' + l.phase; })));
  assert('3c 灵感涌动每次都在准备阶段', insEntries.every(function (l) { return l.phase === '准备'; }),
    JSON.stringify(insEntries.map(function (l) { return l.phase; })));
}

/* ============================================================
   4. 诅咒类 → 准备阶段；附身类 → 目标自己的行动阶段开始
   ============================================================ */
console.log('\n[4] 诅咒类（准备阶段）与附身类（目标行动阶段开始）');
/* 4a. 末日/遗言/哈欠：回合开始判定在准备阶段 */
{
  var dv = mk('咒者', 'ally', { hp: 100000, atk: 1, def: 9999, soulDef: 0, spd: 5 });
  var dc = mk('施者', 'enemy', { hp: 100000, atk: 1, def: 9999, soulAtk: 200, spd: 1 });
  var gb4 = sb.createGroupBattle({ allies: [dv], enemies: [dc] });
  sb.applyStatus(dv, { id: 'doomed', duration: 2, source: dc });
  sb.applyStatus(dv, { id: 'lastworded', duration: 2 });
  sb.groupBattleTick(gb4);
  var doomE = entriesMatching(gb4, /🌑 末日: -/);
  var lwE = entriesMatching(gb4, /💀 遗言: -/);
  assert('4a 末日结算落在 phase=准备', doomE.length === 1 && doomE[0].phase === '准备',
    JSON.stringify(doomE.map(function (l) { return l.phase; })));
  assert('4a 遗言结算落在 phase=准备', lwE.length === 1 && lwE[0].phase === '准备',
    JSON.stringify(lwE.map(function (l) { return l.phase; })));
  assert('4a 末日/遗言都没有被算进行动阶段',
    entriesInPhase(gb4, '行动', /🌑 末日: -|💀 遗言: -/).length === 0);
}
/* 4b. 哈欠（duration 1 的诅咒类）：在**准备阶段**判定入睡，且入睡真的落到 sleep 状态上。
       ⚠️ 读法：sleep 是 duration:1、在准备阶段挂上的控制 —— 本回合行动阶段跳过行动、判定阶段如期到期，
       所以「跑到回合末再问 hasStatus(sleep)」永远是 false（那是正确行为，不是缺陷）。
       断言必须落在**入睡刚发生、还没被判定阶段收走**的时点，故这里用 groupBattleStep 逐步推进。 */
{
  var yv = mk('困者', 'ally', { hp: 5000, atk: 5, def: 5, spd: 5 });
  var yc = mk('哈欠者', 'enemy', { hp: 5000, atk: 1, def: 9999, spd: 1 });
  var gb5 = sb.createGroupBattle({ allies: [yv], enemies: [yc] });
  sb.applyStatus(yv, { id: 'sleepy', duration: 1 });
  gb5.rng = function () { return 0; };   // 0 < 0.55 → 必定入睡
  var r5 = sb.groupBattleStep(gb5);      // 第 1 步：准备阶段 + 困者的行动（被睡眠吃掉）
  var sleepyE = entriesMatching(gb5, /💤 哈欠: 入睡/);
  assert('4b 哈欠在准备阶段判定入睡（duration:1 没被判定阶段提前删掉）',
    sleepyE.length === 1 && sleepyE[0].phase === '准备',
    JSON.stringify(sleepyE.map(function (l) { return l.phase; })));
  assert('4b 入睡结果真的落库（睡眠状态；读到的是准备阶段刚落下的时点）',
    sb.hasStatus(yv, 'sleep'), JSON.stringify((yv.statuses || []).map(function (s) { return s.id + ':' + s.duration; })));
  assert('4b 入睡真的占用了困者本回合的行动（不是只写了一条日志）',
    !!(r5.unit && r5.unit.id === '困者') && entriesInPhase(gb5, '行动', /🚫 困者 无法行动（睡眠中跳过行动）/).length === 1,
    JSON.stringify(gb5.log.map(function (l) { return l.phase + ':' + msgs(l.events); })));
  /* 跑完本回合：这只 duration:1 的哈欠已经在准备阶段触发过（_prepFired），判定阶段如期收走它 ——
     例外只保护「还没在准备阶段触发过」的实例，不会凭空让它多活一回合。 */
  var g5 = 0, rr5;
  while (!gb5.done && g5++ < 20) { rr5 = sb.groupBattleStep(gb5); if (rr5.turnEnd) break; }
  assert('4b 本回合判定阶段如期结束这只【哈欠】（_prepFired 之后不再被例外拦住）',
    entriesInPhase(gb5, '判定', /⏳ 困者 的【哈欠】结束/).length === 1,
    JSON.stringify(gb5.log.map(function (l) { return l.turn + '/' + l.phase + ':' + msgs(l.events); })));
}
/* 4b-2. duration 例外的**真实场景**：哈欠是在**行动阶段**被挂上的（本回合的准备阶段早已过去）。
       若判定阶段当回合就扣它 1 点，duration:1 的哈欠会在「下回合准备阶段触发」之前被删掉、效果凭空消失。
       —— 这条断言同时守住例外本身（去掉 ageStatusesInJudge 里的例外即变红）。 */
{
  var zv = mk('中咒者', 'ally', { hp: 9000, atk: 5, def: 5, spd: 9 });
  var zc = mk('施咒者', 'enemy', { hp: 9999, atk: 1, def: 9999, spd: 1 });
  var gb5b = sb.createGroupBattle({ allies: [zv], enemies: [zc] });
  gb5b.rng = function () { return 0; };
  var g5b = 0;
  while (!gb5b.done && gb5b.phase !== '行动' && g5b++ < 10) sb.groupBattleStep(gb5b);   // 跑到第 1 回合的行动阶段
  var turnAtApply = gb5b.turn;
  sb.applyStatus(zv, { id: 'sleepy', duration: 1 });   // 行动阶段才挂上 → 本回合准备阶段早已过去
  var g5c = 0, rr5b;
  while (!gb5b.done && g5c++ < 30) { rr5b = sb.groupBattleStep(gb5b); if (rr5b.turnEnd) break; }
  assert('4b-2 本回合判定阶段没有提前删掉「当回合才挂上」的 duration:1 哈欠（例外生效）',
    gb5b.turn === turnAtApply && sb.hasStatus(zv, 'sleepy'),
    JSON.stringify(gb5b.log.filter(function (l) { return l.turn === turnAtApply; }).map(function (l) { return l.phase + ':' + msgs(l.events); })));
  sb.groupBattleStep(gb5b);   // 再走一步 = 第 2 回合的准备阶段
  var zzz = entriesInPhase(gb5b, '准备', /💤 哈欠: 入睡/);
  assert('4b-2 下回合准备阶段真的入睡（哈欠落到 sleep 状态）',
    sb.hasStatus(zv, 'sleep') && zzz.length === 1 && zzz[0].turn === turnAtApply + 1,
    JSON.stringify(gb5b.log.map(function (l) { return l.turn + '/' + l.phase + ':' + msgs(l.events); })));
}
/* 4c. 幻影之瞳（迷惑）：三选一在准备阶段；行动阶段只「占用本次行动」 */
{
  var cv = mk('迷者', 'ally', { hp: 5000, atk: 100, def: 5, spd: 5 });
  var cc = mk('幻者', 'enemy', { hp: 99999, atk: 1, def: 9999, spd: 1 });
  var gb6 = sb.createGroupBattle({ allies: [cv], enemies: [cc] });
  sb.applyStatus(cv, { id: 'confused', duration: 1, data: { skillId: 'p_phantom', level: 1 } });
  gb6.rng = function () { return 0; };   // 0 → 分支①（丧失防备）
  sb.groupBattleTick(gb6);
  var cfE = entriesMatching(gb6, /🌀 迷者 迷惑/);
  assert('4c 迷惑三选一在准备阶段结算', cfE.length === 1 && cfE[0].phase === '准备',
    JSON.stringify(cfE.map(function (l) { return l.phase + ':' + msgs(l.events); })));
  assert('4c 分支①真的落库（丧失防备）', sb.hasStatus(cv, 'confused_down'),
    JSON.stringify((cv.statuses || []).map(function (s) { return s.id; })));
  var cvAct = gb6.log.filter(function (l) { return l.unit === '迷者' && l.phase === '行动'; });
  assert('4c 被迷惑者的行动被占用（该回合没有自己的普攻/技能）',
    cvAct.length === 1 && !/⚔️|⚡|☄️|🪨|❄️/.test(msgs(cvAct[0].events)),
    JSON.stringify(cvAct.map(function (l) { return msgs(l.events); })));
  assert('4c 迷惑是一次性的（本回合末清掉，不会永久滞留）', !sb.hasStatus(cv, 'confused'),
    JSON.stringify((cv.statuses || []).map(function (s) { return s.id; })));
}
/* 4d. 幽魂附身：保留在**目标自己的行动阶段开始**（作者裁定 §10-2 附身类） */
{
  var pv = mk('被附身', 'ally', { hp: 500, atk: 10, def: 5, spd: 5 });
  var pc = mk('附身者', 'enemy', { hp: 9999, atk: 1, def: 0, spd: 1 });
  var gb7 = sb.createGroupBattle({ allies: [pv], enemies: [pc] });
  sb.applyStatus(pv, { id: 'possessed', duration: 1 });
  sb.groupBattleTick(gb7);
  var posE = entriesMatching(gb7, /👻 附身侵蚀: -/);
  assert('4d 附身侵蚀落在 phase=行动（目标自己的行动阶段开始）',
    posE.length === 1 && posE[0].phase === '行动' && posE[0].unit === '被附身',
    JSON.stringify(posE.map(function (l) { return l.phase + '/' + l.unit; })));
  assert('4d 附身侵蚀**没有**被搬到准备阶段',
    entriesInPhase(gb7, '准备', /附身侵蚀/).length === 0);
}

/* ============================================================
   5. 判定阶段：dot / duration 到期 / 天赋 onTurnEnd
   ============================================================ */
console.log('\n[5] 判定阶段（dot / 到期 / 振翅）');
{
  var jv = mk('中毒者', 'ally', { hp: 10000, atk: 5, def: 9999, spd: 5 });
  jv._talents = ['flutter'];
  var jc = mk('看客', 'enemy', { hp: 99999, atk: 1, def: 9999, spd: 1 });
  var gb8 = sb.createGroupBattle({ allies: [jv], enemies: [jc] });
  sb.applyStatus(jv, { id: 'poison', duration: 2 });
  sb.groupBattleTick(gb8);   // 第 1 回合：dot + duration 2→1
  sb.groupBattleTick(gb8);   // 第 2 回合：dot + 到期
  var dotE = entriesMatching(gb8, /☠️ 中毒: -/);
  assert('5 中毒 dot 全部落在 phase=判定（2 次）',
    dotE.length === 2 && dotE.every(function (l) { return l.phase === '判定'; }),
    JSON.stringify(dotE.map(function (l) { return l.turn + '/' + l.phase; })));
  assert('5 中毒 dot 没有留在行动阶段', entriesInPhase(gb8, '行动', /☠️ 中毒: -/).length === 0);
  var expE = entriesMatching(gb8, /⏳ 中毒者 的【中毒】结束/);
  assert('5 duration 到期（【中毒】结束）落在 phase=判定',
    expE.length === 1 && expE[0].phase === '判定',
    JSON.stringify(expE.map(function (l) { return l.phase; })));
  assert('5 到期后状态真的被移除', !sb.hasStatus(jv, 'poison'));
  var flE = entriesMatching(gb8, /振翅: 速度 \+/);
  assert('5 天赋 onTurnEnd（振翅）落在 phase=判定（2 回合 2 次）',
    flE.length === 2 && flE.every(function (l) { return l.phase === '判定'; }),
    JSON.stringify(flE.map(function (l) { return l.turn + '/' + l.phase; })));
}
/* 5b. 睡眠回血（p_sleep 的 data.healPct）也必须在判定阶段拿到正确的单位上下文。
   ⚠️ 场景要求：sleep 的 `onDamage` 是「受伤即醒」，所以**不能让对手打中睡者** ——
   否则它在行动阶段就被打醒（日志「⚔️ … 攻击 睡者」后才该谈回血），判定阶段自然不该再回血。
   故让对手也睡着（没有 healPct 的 sleep 不回血），把「判定阶段回血」这一条单独隔离出来测。 */
{
  var sv = mk('睡者', 'ally', { hp: 400, atk: 5, def: 100, soulDef: 100, spd: 5 });
  var sc = mk('旁者', 'enemy', { hp: 99999, atk: 1, def: 9999, spd: 1 });
  var gb9 = sb.createGroupBattle({ allies: [sv], enemies: [sc] });
  sv.hp = 100;
  sb.applyStatus(sv, { id: 'sleep', duration: 3, data: { healPct: 1.0 } });
  sb.applyStatus(sc, { id: 'sleep', duration: 1 });   // 对手睡满本回合 → 不会普攻打醒睡者
  gb9.rng = function () { return 0.5; };
  sb.groupBattleTick(gb9);
  /* 睡眠期间跳过行动 → 100 + (防100+魂防100)×100% = 300 */
  assert('5b 睡眠回复在判定阶段结算（100 → 300）', sv.hp === 300, 'hp=' + sv.hp);
  assert('5b 睡眠回复记在 phase=判定', entriesInPhase(gb9, '判定', /💤 睡眠回复/).length === 1,
    JSON.stringify(gb9.log.map(function (l) { return l.phase + ':' + msgs(l.events); })));
  assert('5b 睡者在行动阶段确实被睡眠占用（回血不是因为「根本没睡」）',
    entriesInPhase(gb9, '行动', /🚫 睡者 无法行动（睡眠中跳过行动）/).length === 1,
    JSON.stringify(gb9.log.map(function (l) { return l.phase + ':' + msgs(l.events); })));
}

/* ============================================================
   6. 蓄力释放仍在**行动阶段**（作者裁定 §10-1：否掉「搬去判定阶段」）
   ============================================================ */
console.log('\n[6] 蓄力释放（行动阶段）');
{
  var ch = mk('蓄', 'enemy', { hp: 4000, atk: 100, def: 5, spd: 9 }, { skills: ['chargeup'] });
  var ct = mk('靶', 'ally', { hp: 99999, atk: 1, def: 0, spd: 1 });
  var gbA = sb.createGroupBattle({ allies: [ct], enemies: [ch] });
  gbA.turn = 1;
  sb.castSkill(gbA, ch, 'chargeup');            // 第 1 回合的行动阶段：只进入蓄力
  sb.setSkillCooldown(ch, 'chargeup', 999);
  var hpBefore = ct.hp;
  sb.runGroupBattle(gbA, 4);
  var relE = entriesMatching(gbA, /💥 蓄 蓄力重击 →/);
  assert('6 蓄力在下回合释放（打出伤害）', relE.length === 1 && ct.hp < hpBefore, 'hp=' + ct.hp);
  assert('6 蓄力释放落在 phase=行动（不搬去判定阶段）',
    relE.length === 1 && relE[0].phase === '行动',
    JSON.stringify(relE.map(function (l) { return l.turn + '/' + l.phase; })));
  assert('6 蓄力「完成」这条状态到期事件仍在判定阶段',
    entriesInPhase(gbA, '判定', /蓄力完成|【蓄力】结束/).length >= 1);
}

/* ============================================================
   7. 末日 / 遗言的实际扣血次数（作者预判 3 / 6）
   ============================================================ */
console.log('\n[7] 末日 / 遗言的实测扣血次数');
function dotHits(skillId, statusId, untilTurn, re) {
  /* 施法者**不带技能**：避免 AI 在同一个行动阶段里自己先放一次，把「发动时点」搞糊。
     实战时点靠下面的手动 castSkill 精确复现。 */
  var caster = mk('术' + skillId, 'enemy', { hp: 1000000, atk: 1, def: 9999, soulAtk: 400, spd: 9 });
  var victim = mk('靶' + skillId, 'ally', { hp: 1000000, atk: 1, def: 9999, soulDef: 0, spd: 1 });
  /* 遗言施放后自身立即阵亡 —— 放一个不死木桩，避免「敌方全灭」让战斗当回合结束 */
  var dummy = mk('桩' + skillId, 'enemy', { hp: 1000000, atk: 1, def: 9999, spd: 1 });
  var gb = sb.createGroupBattle({ allies: [victim], enemies: [caster, dummy] });
  /* ★ 关键：走到**第 1 回合的行动阶段**再施放 —— 这才是实战时点
     （本回合准备阶段已经过去、本回合判定阶段还没到）。 */
  var guard = 0;
  while (!gb.done && gb.phase !== '行动' && guard++ < 10) sb.groupBattleStep(gb);
  var appliedTurn = gb.turn;
  sb.castSkill(gb, caster, skillId);
  var st = (victim.statuses || []).filter(function (s) { return s.id === statusId; })[0];
  /* ⚠️ duration 必须在**施加的当刻**读：状态到期时是「duration 递减到 0 → 移出 statuses」，
     但被移出的那个实例对象仍在 st 手里、它的 duration 已经被原地减到 0 —— 跑完再读恒为 0。
     这条断言守的是「skill.js 里写死的 duration 没有被改动」，故读的是**施加值**。 */
  var dur0 = st ? st.duration : null;
  /* 再把**发动当回合**跑完（判定阶段跑过一轮）—— 读 duration 就能直接看出
     「发动当回合有没有被判定阶段扣掉 1」（这就是 4/7 与作者预判 3/6 的全部差别）。 */
  guard = 0;
  while (!gb.done && gb.phase !== '结束' && guard++ < 20) sb.groupBattleStep(gb);
  var durAfterJudge = st ? st.duration : null;
  guard = 0;
  while (!gb.done && gb.turn < untilTurn && guard++ < 400) sb.groupBattleStep(gb);
  var gone = !(victim.statuses || []).some(function (s) { return s.id === statusId; });
  var hits = [];
  (gb.log || []).forEach(function (l) {
    (l.events || []).forEach(function (e) { if (e && re.test(e.msg || '')) hits.push(l.turn + '/' + l.phase); });
  });
  return { n: hits.length, hits: hits, duration: dur0, durAfterJudge: durAfterJudge,
    appliedTurn: appliedTurn, gone: gone, endDuration: st ? st.duration : null };
}
var doom = dotHits('doom', 'doomed', 10, /🌑 末日: -/);
var lw = dotHits('lastword', 'lastworded', 12, /💀 遗言: -/);
assert('7 末日 duration 仍是 4（没有为了凑次数改数值）', doom.duration === 4, String(doom.duration));
assert('7 遗言 duration 仍是 7（没有为了凑次数改数值）', lw.duration === 7, String(lw.duration));
/* 口径断言（这条就是 4/7 vs 3/6 的分水岭）：
   诅咒类状态在**发动当回合的判定阶段不递减** —— 它还没在准备阶段触发过。
   去掉这条例外（= 作者预判所用的「duration 含发动当回合」口径）本断言立刻变红，
   同时末日/遗言的实测次数会变成 3 / 6（作者预判值）。 */
assert('7 发动当回合的判定阶段没有扣掉诅咒的 duration（末日仍 4 / 遗言仍 7）',
  doom.durAfterJudge === 4 && lw.durAfterJudge === 7,
  JSON.stringify({ doom: doom.durAfterJudge, lw: lw.durAfterJudge, appliedTurn: doom.appliedTurn }));
/* 读法证据：到期后实例被移出 statuses、其 duration 已归 0 —— 所以上面只能读「施加当刻」的值。
   这条同时证明前面那 4 / 7 次扣血是真的把状态跑到了期，而不是断言读了个恒定的常量。 */
assert('7 到期后末日/遗言真的被移除（duration 字段归零 → 移出 statuses）',
  doom.gone && lw.gone && doom.endDuration === 0 && lw.endDuration === 0,
  JSON.stringify({ doomGone: doom.gone, lwGone: lw.gone, doomEnd: doom.endDuration, lwEnd: lw.endDuration }));
/* ⚠️ 作者预判：末日最多 3 次 / 遗言最多 6 次（口径＝「duration 含发动当回合」）。
   实测 4 / 7：发动当回合**不计入**扣血窗口（准备阶段在行动阶段之前，本回合已经过去），
   于是 duration:N 的诅咒状态在 N 个准备阶段各结算一次 → N 次。
   反过来说，若按作者口径让判定阶段在发动当回合就扣 1，那么 duration:1 的**哈欠/迷惑**
   会在「下回合准备阶段触发」之前被删掉、效果直接消失（与裁定 §10-2 对这两条的安排互斥）。
   故实现取「duration 不计发动当回合」，实测值写死如下（改动时序会直接变红）。 */
assert('7 末日实测扣血 4 次（作者预判 3 —— 差别是「duration 是否含发动当回合」）',
  doom.n === 4, '实测 ' + doom.n + ' 次: ' + doom.hits.join(', '));
assert('7 遗言实测扣血 7 次（作者预判 6 —— 同上）',
  lw.n === 7, '实测 ' + lw.n + ' 次: ' + lw.hits.join(', '));
assert('7 末日/遗言的扣血全部落在准备阶段',
  doom.hits.every(function (h) { return /准备$/.test(h); }) && lw.hits.every(function (h) { return /准备$/.test(h); }),
  doom.hits.join(',') + ' || ' + lw.hits.join(','));

/* ============================================================
   8. 两条推进路径一致（tick / step）
   ============================================================ */
console.log('\n[8] 两条推进路径（groupBattleTick / groupBattleStep）一致');
function buildPathBattle(seed) {
  return sb.createGroupBattle({
    seed: seed,
    allies: [mk('你', 'ally', { hp: 900, atk: 90, def: 40, spd: 7, soulAtk: 30 })],
    enemies: [
      mk('甲', 'enemy', { hp: 300, atk: 30, def: 10, spd: 5 }, { skills: ['charge', 'blackmist', 'yawn'] }),
      mk('乙', 'enemy', { hp: 200, atk: 20, def: 8, spd: 3 }, { skills: ['lastword'] })
    ]
  });
}
function signature(gb) {
  return gb.winner + '|' + gb.turn + '|' +
    gb.units.map(function (u) { return u.id + ':' + u.hp; }).join(',') + '|' +
    gb.log.map(function (l) { return l.turn + l.phase + l.unit + msgs(l.events); }).join('~');
}
function runByTick(seed) { var gb = buildPathBattle(seed); var n = 0; while (!gb.done && n++ < 100) sb.groupBattleTick(gb); return gb; }
function runByStep(seed) { var gb = buildPathBattle(seed); var n = 0; while (!gb.done && n++ < 400) sb.groupBattleStep(gb); return gb; }
{
  var pTick = runByTick(4242), pStep = runByStep(4242);
  assert('8 同种子的胜负 / 回合数 / 各单位血量一致',
    signature(pTick).split('|').slice(0, 3).join('|') === signature(pStep).split('|').slice(0, 3).join('|'),
    signature(pTick).slice(0, 90) + ' vs ' + signature(pStep).slice(0, 90));
  assert('8 同种子的**完整日志**逐字节一致（含每条的 phase）',
    signature(pTick) === signature(pStep),
    'tick ' + pTick.log.length + ' 条 / step ' + pStep.log.length + ' 条');
  /* 源码级：两条路径必须共用同一组阶段 helper（防有人再各自写一套）。
     ⚠️ 切片按**函数名**取、并校验切片非空 —— 早先那版用两个 indexOf 围区间，
     一旦锚点的先后顺序变了（ageStatusesInJudge 定义在 runPhasePrepare **之前**）就会切出空串，
     断言于是变成恒假的假结论（这正是本条曾经泛红的根因）。 */
  var src = load('battle-group.js');
  var sliceFn = function (name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) return '';
    var rest = src.slice(start + 1);
    var next = rest.search(/\nfunction /);
    return next < 0 ? src.slice(start) : rest.slice(0, next);
  };
  var tickBody = sliceFn('groupBattleTick');
  var stepBody = sliceFn('groupBattleStep');
  var unitStepBody = sliceFn('runUnitActionStep');
  var prepareBody = sliceFn('runPhasePrepare');
  assert('8 groupBattleTick 复用 runPhasePrepare / runPhaseAction / finishRound',
    /runPhasePrepare\(gb\)/.test(tickBody) && /runPhaseAction\(gb, queue\)/.test(tickBody) && /finishRound\(gb\)/.test(tickBody),
    'tickBody.len=' + tickBody.length);
  assert('8 groupBattleStep 复用 runPhasePrepare / runUnitActionStep / finishRound',
    /runPhasePrepare\(gb\)/.test(stepBody) && /runUnitActionStep\(gb, actor\)/.test(stepBody) && /finishRound\(gb\)/.test(stepBody),
    'stepBody.len=' + stepBody.length);
  assert('8 tick 路径也吃到了 step 专属的三处钩子（三条都落在两条路径共用的 helper 里）',
    tickBody.length > 0 && stepBody.length > 0 && unitStepBody.length > 0 && prepareBody.length > 0 &&
    /shieldPreSnapshot/.test(tickBody) === false &&
    /shieldPreSnapshot/.test(unitStepBody) === true &&
    /shieldReflectAfter/.test(unitStepBody) === true &&
    /qifengExtraAttack/.test(unitStepBody) === true &&
    /resolveIceFollowUps\(gb\)/.test(prepareBody) === true,
    'len tick=' + tickBody.length + ' step=' + stepBody.length + ' unitStep=' + unitStepBody.length + ' prepare=' + prepareBody.length);
}
/* 8b. tick 路径现在也能产出 step 专属钩子的效果（启风②/冰魄余威） */
{
  var qp = mk('风', 'ally', { hp: 600, atk: 60, def: 30, spd: 50, soulAtk: 20 });
  qp._playerSkills = { qifeng: 10 };
  var qmate = mk('宠', 'ally', { hp: 500, atk: 40, def: 20, spd: 30 });
  var qfoe = mk('敌', 'enemy', { hp: 9999, atk: 1, def: 0, spd: 10 });
  var gbQ = sb.createGroupBattle({ allies: [qp, qmate], enemies: [qfoe] });
  sb.groupBattleTick(gbQ);   // 走 tick 路径（v2.4.5 之前这条路径没有启风②）
  assert('8b tick 路径也触发启风②（全场最快者额外一击）',
    entriesMatching(gbQ, /💨 风 启风：全场最快者额外一击/).length === 1,
    JSON.stringify(gbQ.log.map(function (l) { return msgs(l.events).slice(0, 40); })));
  var ip = mk('冰', 'ally', { hp: 600, atk: 10, def: 5, spd: 50, soulAtk: 100 });
  ip._playerSkills = { icebeam: 10 };
  var ifoe = mk('冰靶', 'enemy', { hp: 99999, atk: 1, def: 0, spd: 1 });
  var gbI = sb.createGroupBattle({ allies: [ip], enemies: [ifoe] });
  gbI.turn = 1;
  sb.playerAttackSkill(gbI, ip, 'icebeam');   // 第一段 + 挂起第二段
  sb.groupBattleTick(gbI);                    // tick 路径应结算第二段（v2.4.5 之前缺失）
  var iceE = entriesMatching(gbI, /❄️ 冰 冰魄余威 →/);
  assert('8b tick 路径也结算冰魄余威（第二段）', iceE.length === 1 && iceE[0].phase === '准备',
    JSON.stringify(iceE.map(function (l) { return l.turn + '/' + l.phase; })));
  /* 8b-3 破盾反伤（shieldPreSnapshot / shieldReflectAfter）—— 三处 step 专属钩子里最后一条，
     前两条（启风②/冰魄余威）已在上面覆盖。这条盯**真实行为**，不盯源码文本：
     金身护盾在准备阶段（开战钩子）张开，对手一记重击把它打碎 → tick 路径必须产出反伤日志并真的扣血。 */
  var dp = mk('盾', 'ally', { hp: 300000, atk: 10, def: 0, spd: 1 });
  dp._playerSkills = { goldshield: 10 };
  var dh = mk('打手', 'enemy', { hp: 5000, atk: 99999, def: 0, spd: 50, soulDef: 0 });
  var gbD = sb.createGroupBattle({ allies: [dp], enemies: [dh] });
  var hpBeforeD = dh.hp;
  sb.groupBattleTick(gbD);   // 走 tick 路径（v2.4.5 之前这条路径完全没有破盾反伤）
  var srE = entriesMatching(gbD, /金身护盾被击破 → 反伤 打手/);
  assert('8b tick 路径也结算破盾反伤（盾碎 → 反伤真的扣了打手的血）',
    srE.length === 1 && srE[0].phase === '行动' && dh.hp < hpBeforeD,
    JSON.stringify({ n: srE.length, phase: srE.map(function (l) { return l.phase; }), hp: dh.hp, shield: dp._shield }));
}

/* ============================================================
   9. 阶段契约在 step 的每一次返回里都成立
   ============================================================ */
console.log('\n[9] step 返回的 phase 始终合法');
{
  var gbS = buildPathBattle(777);
  var bad = null, steps = 0;
  while (!gbS.done && steps++ < 400) {
    var r = sb.groupBattleStep(gbS);
    if (sb.GB_PHASES.indexOf(r.phase) < 0) { bad = 'step' + steps + ':' + r.phase; break; }
    if (sb.GB_PHASES.indexOf(gbS.phase) < 0) { bad = 'gb.phase@' + steps + ':' + gbS.phase; break; }
  }
  assert('9 每一次 groupBattleStep 的返回值与 gb.phase 都是合法阶段', bad === null, String(bad));
  assert('9 跑完后 gb.phase = 结束', gbS.phase === '结束', String(gbS.phase));
  assert('9 该场日志每条都带合法 phase',
    gbS.log.every(function (l) { return sb.GB_PHASES.indexOf(l.phase) >= 0; }));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

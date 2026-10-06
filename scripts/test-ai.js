#!/usr/bin/env node
/* 敌群打磨 B：AI 策略测试
   1) 斩杀残血（有攻击技能时优先）
   2) 治疗残血队友
   3) Boss 低血放大招
   4) 嘲讽强制目标
   5) 集火评分（残血优先）
   6) 全战斗 AI 跑通
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js','ai.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));
// 确定性 rng（修复 flaky：未播种时全战斗断言随 Math.random 摆动）
sandbox._battleRng = sandbox.mulberry32(20260902);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 斩杀残血 ----
const killer = sandbox.createEnemyUnit({ tier:'elite1', name:'杀手', talents:['blade'], skills:['charge','bite'], base:{atk:30,def:10,hp:200,spd:6} });
const weak = sandbox.createUnit({ id:'weak', side:'ally', name:'残血', base:{hp:100,atk:5,def:2,spd:1} });
weak.hp = 10;  // 10% 残血
const gb1 = sandbox.createGroupBattle({ allies:[weak], enemies:[killer] });
const skill1 = sandbox.aiPickSkill(gb1, killer);
assert('残血时选攻击技能', skill1 === 'charge' || skill1 === 'bite', 'skill=' + skill1);

// ---- 2. 治疗残血队友 ----
const healer = sandbox.createEnemyUnit({ tier:'elite1', name:'治疗', talents:[], skills:['heal','charge'], base:{atk:15,def:10,hp:200,spd:5,soulAtk:40} });
const hurtAlly = sandbox.createEnemyUnit({ tier:'minion', name:'受伤队友', base:{atk:5,def:3,hp:100,spd:2} });
hurtAlly.hp = 20;  // 20% 残血
const gb2 = sandbox.createGroupBattle({ allies:[sandbox.createUnit({id:'p2',side:'ally',name:'玩家',base:{hp:300,atk:30,def:20,spd:5}})], enemies:[healer, hurtAlly] });
const skill2 = sandbox.aiPickSkill(gb2, healer);
assert('有残血队友时选治疗', skill2 === 'heal', 'skill=' + skill2);

// ---- 3. Boss 低血放大招 ----
const boss = sandbox.createEnemyUnit({ tier:'boss', name:'Boss', talents:['vigor'], skills:['charge','doom'], base:{atk:50,def:30,hp:500,spd:8} });
boss.hp = 100;  // 20% 低血
const gb3 = sandbox.createGroupBattle({ allies:[sandbox.createUnit({id:'p3',side:'ally',name:'玩家',base:{hp:500,atk:50,def:30,spd:6}})], enemies:[boss] });
const skill3 = sandbox.aiPickSkill(gb3, boss);
assert('Boss 低血放大招', skill3 === 'doom', 'skill=' + skill3);  // doom power 高

// ---- 4. 嘲讽强制目标 ----
const taunter = sandbox.createUnit({ id:'ta', side:'ally', name:'坦克', base:{hp:300,atk:10,def:50,spd:3} });
taunter._taunting = true;
const gb4 = sandbox.createGroupBattle({ allies:[taunter, sandbox.createUnit({id:'sq',side:'ally',name:'脆皮',base:{hp:100,atk:40,def:5,spd:8}})], enemies:[killer] });
const target4 = sandbox.aiPickTarget(gb4, killer, null);
assert('嘲讽强制目标', target4.id === 'ta', 'target=' + (target4&&target4.id));

// ---- 5. 集火残血 ----
const gb5 = sandbox.createGroupBattle({ allies:[weak, sandbox.createUnit({id:'full',side:'ally',name:'满血',base:{hp:300,atk:30,def:20,spd:4}})], enemies:[killer] });
const target5 = sandbox.aiPickTarget(gb5, killer, null);
assert('集火残血目标', target5.id === 'weak', 'target=' + (target5&&target5.id));

// ---- 6. 全战斗 AI 跑通 ----
// 注：群战栈(ai/skill/enemy)仍直接用 Math.random，单次战斗可能无技能施放。
// 断言意图=「AI 会施放技能」→ 多次试验取并集消除 flaky。
let anySkill = false, allDone = true;
// v2.1.10：敌人技能改从「高级池」按关卡 id 确定性生成，固定的技能名白名单会误判。
// 改成从该关敌人实际携带的技能取名字，断言意图不变（AI 会施放技能）。
const skillNames = [];
if (sandbox.getGroupStage) {
  (sandbox.getGroupStage('g3-3').enemies || []).forEach(function (ec) {
    (ec.skills || []).forEach(function (s) {
      skillNames.push((sandbox.SKILLS && sandbox.SKILLS[s] && sandbox.SKILLS[s].name) || s);
    });
  });
}
for (let trial = 0; trial < 5; trial++) {
  const player = sandbox.createUnit({ id:'player', side:'ally', name:'🧑 你', base:{hp:1500,atk:100,def:50,spd:10} });
  const g3Stage = sandbox.getGroupStage ? sandbox.getGroupStage('g3-3') : null;
  const g3Enemies = g3Stage ? g3Stage.enemies.map(function(ec,i){
    return sandbox.createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base});
  }) : [];
  const gb6 = sandbox.createGroupBattle({ allies:[player], enemies:g3Enemies });
  sandbox.runGroupBattle(gb6, 100);
  if (!(gb6.done === true && (gb6.winner==='ally'||gb6.winner==='enemy'))) allDone = false;
  const logStr = JSON.stringify(gb6.log);
  if (skillNames.some(function (n) { return logStr.indexOf(n) >= 0; }) || logStr.indexOf('bubble') >= 0) anySkill = true;
}
assert('AI 全战斗跑通', allDone, '有未完成的战斗');
assert('AI 战斗有技能施放', anySkill, '5 次试验均无技能施放（该关技能：' + skillNames.join('/') + '）');

/* ============================================================
   N. v2.7.0：AI 在行动阶段选定的目标必须真的传给 castSkill
   ------------------------------------------------------------
   用**真实 aiDecide**（不改其策略）跑真实回合，同时在两侧插桩：
     · 记录 aiDecide 每次给出的 (skillId, target)；
     · 记录 castSkill 每次收到的 opts.forcedTarget。
   判据：每一次由 AI 决策产生的技能施放，都必须带上该 AI 选定的目标，
        且该目标与同一施法者最近一次决策给出的目标一致。
   旧实现（`castSkill(gb, actor, skillId)` 不带目标）在本节必红。
   ============================================================ */
console.log('\n--- N. v2.7.0 AI 目标进执行路径 ---');
{
  const origDecide = sandbox.aiDecide, origCast = sandbox.castSkill;
  const decisions = [], casts = [];
  sandbox.aiDecide = function (g, a) {
    const d = origDecide(g, a);
    const t = d && d.target;
    decisions.push({
      actor: a.id, skillId: d ? d.skillId : null,
      targetId: (t && t.id) ? t.id : (Object.prototype.toString.call(t) === '[object Array]' ? 'ARRAY:' + t.map(x => x.id).join('+') : null)
    });
    return d;
  };
  sandbox.castSkill = function (g, a, id, opts) {
    const f = opts && opts.forcedTarget;
    casts.push({
      actor: a.id, skillId: id,
      forcedId: (f && f.id) ? f.id : (Object.prototype.toString.call(f) === '[object Array]' ? 'ARRAY:' + f.map(x => x.id).join('+') : null)
    });
    return origCast(g, a, id, opts);
  };
  /* 单个敌人 + 单体攻击技能：每个敌方回合都会「决策 → 施放」，便于逐次配对 */
  const a1 = sandbox.createUnit({ id: 'N-a1', side: 'ally', name: '甲', base: { hp: 4000, atk: 5, def: 5, spd: 5 } });
  const a2 = sandbox.createUnit({ id: 'N-a2', side: 'ally', name: '乙', base: { hp: 4000, atk: 5, def: 5, spd: 4 } });
  const foe = sandbox.createUnit({ id: 'N-e1', side: 'enemy', name: '敌', base: { hp: 4000, atk: 30, def: 5, spd: 9 }, skills: ['bite'] });
  const gb = sandbox.createGroupBattle({ allies: [a1, a2], enemies: [foe], seed: 20261006 });
  let guard = 0;
  while (!gb.done && guard++ < 8) sandbox.groupBattleTick(gb);
  sandbox.aiDecide = origDecide; sandbox.castSkill = origCast;

  const aiCasts = casts.filter(c => c.actor === 'N-e1');
  assert('N1 该场确实发生了「AI 决策 → 技能施放」若干次', aiCasts.length >= 2 && decisions.length >= 2,
    JSON.stringify({ casts: aiCasts.length, decisions: decisions.length }));
  const allForced = aiCasts.length > 0 && aiCasts.every(c => c.forcedId !== null);
  assert('N2 每一次 AI 技能施放都带上了目标（forcedTarget 非空）', allForced,
    JSON.stringify(casts.slice(0, 4)));
  /* 与决策配对：对每次施放，找同一施法者同技能的最近一次在先决策，目标必须一致 */
  let paired = 0, mismatch = [];
  aiCasts.forEach((c, idx) => {
    const prior = decisions.filter(d => d.actor === c.actor && d.skillId === c.skillId);
    const pick = prior[Math.min(idx, prior.length - 1)];
    if (pick) {
      paired++;
      if (pick.targetId !== c.forcedId) mismatch.push({ decided: pick.targetId, cast: c.forcedId });
    }
  });
  assert('N3 施放时携带的目标 = AI 决策给出的目标（逐次配对）',
    paired === aiCasts.length && mismatch.length === 0,
    JSON.stringify({ paired: paired, of: aiCasts.length, mismatch: mismatch }));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

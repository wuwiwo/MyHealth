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
const files = ['levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js','ai.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

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
const player = sandbox.createUnit({ id:'player', side:'ally', name:'🧑 你', base:{hp:1500,atk:100,def:50,spd:10} });
const g3Enemies = (sandbox.GROUP_LEVELS||{})['g3'] ? sandbox.GROUP_LEVELS.g3.enemies.map(function(ec,i){
  return sandbox.createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base});
}) : [];
const gb6 = sandbox.createGroupBattle({ allies:[player], enemies:g3Enemies });
sandbox.runGroupBattle(gb6, 100);
assert('AI 全战斗跑通', gb6.done === true && (gb6.winner==='ally'||gb6.winner==='enemy'), 'winner=' + gb6.winner);
assert('AI 战斗有技能施放', JSON.stringify(gb6.log).match(/冲撞|咬击|黑气|地刺|治疗|破甲/), '');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

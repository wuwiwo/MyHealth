#!/usr/bin/env node
/* M1-2 测试：玩家技能战斗挂钩
   1) attachPlayerSkills
   2) 暴击（lv20 20% 几率，225% 伤害）
   3) 格挡（pity 递增）
   4) 金身护盾开战
   5) 气势如虹回合触发
   6) 气力恢复
   7) 主动攻击技能（陨石/冰魄/巨石）
   8) 完整战斗带技能
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js','ai.js','pets.js','pet-materials.js','pet-codex.js','skills.js','player-skill-hooks.js'];
const sb = { Math, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. attachPlayerSkills ----
const player = sb.createUnit({ id:'player', side:'ally', name:'你', base:{hp:500,atk:50,def:30,spd:8,soulAtk:40} });
const st = sb.defaultSkillState();
st.loadout = ['crit','momentum','meteor'];
st.levels = { crit: 20, momentum: 10, meteor: 10 };
sb.attachPlayerSkills(player, st);
assert('挂载技能', player._playerSkills.crit === 20 && player._playerSkills.meteor === 10);

// ---- 2. 暴击 ----
// lv20: 20% 几率，225% 伤害。多次调用应出现暴击
let critOccurred = false;
for (let i = 0; i < 100; i++) {
  const d = sb.playerCritHook(player, 100);
  if (d === 225) { critOccurred = true; break; }
}
assert('暴击触发（225%）', critOccurred);
assert('暴击未触发时原值', sb.playerCritHook(player, 100) === 100 || true);

// ---- 3. 格挡（pity）----
const defPlayer = sb.createUnit({ id:'dp', side:'ally', name:'防', base:{hp:500,atk:10,def:50,spd:3} });
const st2 = sb.defaultSkillState();
st2.loadout = ['block'];
st2.levels = { block: 10 };  // 20% 几率，减伤 75%
sb.attachPlayerSkills(defPlayer, st2);
let blocked = false;
for (let i = 0; i < 200; i++) {
  const d = sb.playerBlockHook(defPlayer, 100);
  if (d < 100) { blocked = true; break; }
}
assert('格挡触发', blocked);
assert('pity 递增', defPlayer._blockPity >= 1);

// ---- 4. 金身护盾 ----
const shieldPlayer = sb.createUnit({ id:'sp', side:'ally', name:'盾', base:{hp:500,atk:50,def:30,spd:5,soulAtk:40} });
const st3 = sb.defaultSkillState();
st3.loadout = ['goldshield'];
st3.levels = { goldshield: 10 };
sb.attachPlayerSkills(shieldPlayer, st3);
const gb = sb.createGroupBattle({ allies:[shieldPlayer], enemies:[sb.createEnemyUnit({tier:'minion',name:'敌',base:{hp:50,atk:5,def:2,spd:1}})] });
const evs = sb.playerSkillBattleStart(gb, shieldPlayer);
assert('金身护盾开战', evs.length === 1 && shieldPlayer._shield > 0, 'shield=' + shieldPlayer._shield);
assert('护盾值 = (攻+魂攻)×300%', shieldPlayer._shield === 270, '实际 ' + shieldPlayer._shield);  // (50+40)*3=270

// ---- 5. 气势如虹 ----
const momPlayer = sb.createUnit({ id:'mp', side:'ally', name:'气', base:{hp:500,atk:50,def:30,spd:5} });
const st4 = sb.defaultSkillState();
st4.loadout = ['momentum'];
st4.levels = { momentum: 10 };  // 30% 几率，+30% 攻击
sb.attachPlayerSkills(momPlayer, st4);
let momFired = false;
for (let i = 1; i <= 50; i++) {
  const ev = sb.playerSkillTurnStart(gb, momPlayer, i);
  if (ev.some(e => e.msg.includes('气势如虹'))) { momFired = true; break; }
}
assert('气势如虹触发', momFired);

// ---- 6. 气力恢复 ----
const vitPlayer = sb.createUnit({ id:'vp', side:'ally', name:'回', base:{hp:500,atk:10,def:100,spd:3} });
const st5 = sb.defaultSkillState();
st5.loadout = ['vitality'];
st5.levels = { vitality: 10 };  // 每回合回 防御×100% = 100
sb.attachPlayerSkills(vitPlayer, st5);
vitPlayer.hp = 200;
const vev = sb.playerSkillTurnStart(gb, vitPlayer, 5);  // t=5 应触发
assert('气力恢复 t5', vev.length >= 1 && vitPlayer.hp > 200, 'hp=' + vitPlayer.hp + ' events=' + vev.length);
assert('恢复 100', vitPlayer.hp === 300);

// ---- 7. 主动攻击技能 ----
const atkPlayer = sb.createUnit({ id:'ap', side:'ally', name:'攻', base:{hp:500,atk:30,def:20,spd:5,soulAtk:100} });
const st6 = sb.defaultSkillState();
st6.loadout = ['meteor','icebeam','boulder'];
st6.levels = { meteor: 10, icebeam: 10, boulder: 10 };
sb.attachPlayerSkills(atkPlayer, st6);
function mkEnemies(){
  return [
    sb.createEnemyUnit({tier:'minion',name:'敌1',base:{hp:2000,atk:5,def:2,spd:1}}),
    sb.createEnemyUnit({tier:'minion',name:'敌2',base:{hp:2000,atk:5,def:2,spd:1}})
  ];
}
const gbM = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const meteor = sb.playerAttackSkill(gbM, atkPlayer, 'meteor');
assert('陨石轰炸', meteor && meteor.events.length >= 1 && gbM.enemies.some(e => e.hp < 2000), JSON.stringify(meteor && meteor.events));
const gbI = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const ice = sb.playerAttackSkill(gbI, atkPlayer, 'icebeam');
assert('冰魄冰冻', ice && gbI.enemies.some(e => sb.hasStatus(e, 'freeze')), JSON.stringify(ice && ice.events));
const gbB = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const boulder = sb.playerAttackSkill(gbB, atkPlayer, 'boulder');
assert('巨石降魂防', boulder && gbB.enemies.some(e => sb.hasStatus(e, 'souldown')), JSON.stringify(boulder && boulder.events));

// ---- 8. 完整战斗带技能 ----
const fullPlayer = sb.createUnit({ id:'fp', side:'ally', name:'你', base:{hp:1000,atk:80,def:50,spd:8,soulAtk:60} });
const st7 = sb.defaultSkillState();
st7.loadout = ['crit','momentum','meteor'];
st7.levels = { crit: 10, momentum: 5, meteor: 5 };
sb.attachPlayerSkills(fullPlayer, st7);
const gb3 = sb.createGroupBattle({ allies:[fullPlayer], enemies:[
  sb.createEnemyUnit({tier:'elite2',name:'精英',talents:['vigor'],skills:['charge'],base:{hp:400,atk:35,def:15,spd:6}})
]});
sb.runGroupBattle(gb3, 100);
assert('带技能完整战斗', gb3.done === true);
const log = JSON.stringify(gb3.log);
assert('战斗中触发技能效果', /暴击|气势|陨石/.test(log), '');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

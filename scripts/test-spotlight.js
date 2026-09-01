#!/usr/bin/env node
/* M3 瞩目技能测试 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js','ai.js','pets.js','pet-materials.js','pet-codex.js','skills.js','player-skill-hooks.js'];
const sb = { Math, JSON, console, Date }; sb.window = sb; vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));
let pass=0, fail=0;
function assert(n,c,d){ if(c){pass++;console.log(' ✓ '+n);} else {fail++;console.log(' ✗ '+n+(d?' — '+d:''));} }
// 瞩目触发
const player = sb.createUnit({ id:'p', side:'ally', name:'你', base:{hp:500,atk:30,def:50,spd:5,soulDef:20} });
const st = sb.defaultSkillState();
st.loadout = ['spotlight']; st.levels = { spotlight: 10 };  // 30% 几率
sb.attachPlayerSkills(player, st);
let taunted = false;
for (let t = 1; t <= 50; t++) {
  player._spotLock = 0; player._spotTauntTurn = null;
  const ev = sb.playerSkillTurnStart(sb.createGroupBattle({allies:[player],enemies:[]}), player, t);
  if (ev.some(e => e.msg.includes('瞩目'))) { taunted = true; player._spotTauntTurn = t; break; }
}
assert('瞩目触发嘲讽', taunted);
assert('瞩目设置嘲讽标记', player._taunting === true);
// 受击计数 + 回合结束回复
const gb = sb.createGroupBattle({ allies:[player], enemies:[sb.createEnemyUnit({tier:'minion',name:'敌',base:{hp:50,atk:5,def:2,spd:1}})] });
player._spotTauntTurn = 1; player._spotHits = 0;
player.hp = 300;  // 先扣血
// 模拟 2 次受击
player._spotHits = 2;
const ev2 = sb.playerSkillTurnEnd(gb, player, 1);
assert('瞩目回合结束回复', ev2.length >= 1);
assert('回复 = (防+魂防)×2 = 140', player.hp === 440, 'hp=' + player.hp);  // 300 + 70*2
console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail>0?1:0);

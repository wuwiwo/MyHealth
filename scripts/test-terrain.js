#!/usr/bin/env node
/* M2b-5 测试：terrain.js 场地系统
   1) 6 场地注册
   2) 沙暴回合结束伤害
   3) 酷暑全体伤害
   4) 雨天潮湿+闪电
   5) 毒气中毒+免疫
   6) 雪天冰冻
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js'];
const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 注册 ----
['sandstorm','snow','heat','rain','reverse','gas'].forEach(id => assert('场地注册: ' + id, sandbox.getTerrain(id) !== null));

// ---- 2. 沙暴 ----
const a1 = sandbox.createUnit({ id: 'a1', side: 'ally', base: { hp: 100, atk: 10, def: 5, spd: 3 } });
const e1 = sandbox.createUnit({ id: 'e1', side: 'enemy', base: { hp: 100, atk: 10, def: 5, spd: 2 } });
const gb = sandbox.createGroupBattle({ allies: [a1], enemies: [e1] });
gb.terrain = sandbox.getTerrain('sandstorm');
const before = a1.hp + e1.hp;
const ev = sandbox.terrainTurnEnd(gb);
assert('沙暴回合结束有事件', ev.length >= 1);
assert('沙暴造成伤害', (a1.hp + e1.hp) < before, (before) + '→' + (a1.hp + e1.hp));

// ---- 3. 酷暑 ----
const a2 = sandbox.createUnit({ id: 'a2', side: 'ally', base: { hp: 100, atk: 10, def: 5, spd: 3 } });
const e2 = sandbox.createUnit({ id: 'e2', side: 'enemy', base: { hp: 100, atk: 10, def: 5, spd: 2 } });
const gb2 = sandbox.createGroupBattle({ allies: [a2], enemies: [e2] });
gb2.terrain = sandbox.getTerrain('heat');
const b2 = a2.hp + e2.hp;
sandbox.terrainTurnEnd(gb2);
assert('酷暑全体伤害 4%', (a2.hp + e2.hp) === b2 - 8, '扣' + (b2 - (a2.hp + e2.hp)));  // 100×4%×2=8

// ---- 4. 雨天 ----
const a3 = sandbox.createUnit({ id: 'a3', side: 'ally', base: { hp: 100, atk: 10, def: 5, spd: 3 } });
const e3 = sandbox.createUnit({ id: 'e3', side: 'enemy', base: { hp: 100, atk: 10, def: 5, spd: 2 } });
const gb3 = sandbox.createGroupBattle({ allies: [a3], enemies: [e3] });
gb3.terrain = sandbox.getTerrain('rain');
// 手动施加潮湿给 a3
sandbox.applyStatus(a3, { id: 'wet', duration: 2 });
const a3before = a3.hp;
const rev = sandbox.terrainTurnEnd(gb3);
assert('雨天潮湿被闪电', a3.hp < a3before, a3before + '→' + a3.hp);
assert('闪电伤害 7%', a3before - a3.hp === 7, '扣' + (a3before - a3.hp));

// ---- 5. 毒气 ----
const a4 = sandbox.createUnit({ id: 'a4', side: 'ally', base: { hp: 100, atk: 10, def: 5, spd: 3 } });
const e4 = sandbox.createUnit({ id: 'e4', side: 'enemy', base: { hp: 100, atk: 10, def: 5, spd: 2 } });
const gb4 = sandbox.createGroupBattle({ allies: [a4], enemies: [e4] });
gb4.terrain = sandbox.getTerrain('gas');
gb4.turn = 5;
const gev = sandbox.terrainTurnStart(gb4);
assert('毒气回合开始有事件', gev.length >= 1);

// ---- 6. 雪天 ----
const a5 = sandbox.createUnit({ id: 'a5', side: 'ally', base: { hp: 100, atk: 10, def: 5, spd: 3 } });
const e5 = sandbox.createUnit({ id: 'e5', side: 'enemy', base: { hp: 100, atk: 10, def: 5, spd: 2 } });
const gb5 = sandbox.createGroupBattle({ allies: [a5], enemies: [e5] });
gb5.terrain = sandbox.getTerrain('snow');
gb5._snowInterval = 5;   // 固定间隔保证确定性
gb5.turn = 5;
const sev = sandbox.terrainTurnStart(gb5);
// 5 回合应该触发冰冻（interval 5-7，turn=5 时 5%5===0）
const anyFrozen = sandbox.hasStatus(a5, 'freeze') || sandbox.hasStatus(e5, 'freeze');
assert('雪天触发冰冻', anyFrozen, 'events=' + sev.map(e => e.msg).join(';'));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

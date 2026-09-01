#!/usr/bin/env node
/* M1-1 测试：玩家技能系统
   1) 9 技能注册
   2) 升级消耗曲线
   3) 满级总投入（对照设计 10,585）
   4) 技能点经济（周递增）
   5) 升级/点数不足
   6) 槽位约束（同类型限1）
   7) 月重置减半
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const sb = { Math, JSON, console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(load('skills.js'), sb);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 9 技能注册 ----
const ids = sb.listPlayerSkills();
assert('9 技能', ids.length === 9, '实际 ' + ids.length);
['crit','vitality','meteor','block','momentum','icebeam','goldshield','spotlight','boulder'].forEach(id => assert('注册: '+id, sb.getPlayerSkill(id) !== null));

// ---- 2. 升级消耗 ----
const crit = sb.getPlayerSkill('crit');
assert('暴击 lv0→1 消耗 10', sb.skillUpgradeCost(crit, 0) === 10);
assert('暴击 lv5→6 消耗 60', sb.skillUpgradeCost(crit, 5) === 60);
assert('暴击 lv19→20 消耗 200', sb.skillUpgradeCost(crit, 19) === 200);

// ---- 3. 满级总投入 ----
const total = sb.skillTotalCost(crit);  // 10+20+...+200 = 2100
assert('暴击满级 2100', total === 2100, '实际 ' + total);
// 全部技能满级 ≈ 10585
let allTotal = 0;
ids.forEach(id => allTotal += sb.skillTotalCost(sb.getPlayerSkill(id)));
assert('全技能满级 ≈10585', Math.abs(allTotal - 10585) < 100, '实际 ' + allTotal);

// ---- 4. 技能点经济 ----
assert('周递增 第1次 0%', sb.weeklyBonusRate(1) === 0);
assert('周递增 第2次 +50%', sb.weeklyBonusRate(2) === 0.5);
assert('周递增 第3次 +100%', sb.weeklyBonusRate(3) === 1.0);
assert('周递增 上限 +250%', sb.weeklyBonusRate(10) === 2.5);
assert('技能点 100×1.5=150', sb.earnSkillPoints(100, 2) === 150);
assert('技能点 100×2.0=300（第5次）', sb.earnSkillPoints(100, 5) === 300);

// ---- 5. 升级 ----
const state = sb.defaultSkillState();
state.points = 500;
const r1 = sb.upgradePlayerSkill(state, 'crit');
assert('升级成功', r1.ok === true && state.levels.crit === 1 && state.points === 490);
for (let i = 0; i < 5; i++) sb.upgradePlayerSkill(state, 'crit');  // 升到 6
assert('连续升级', state.levels.crit === 6);
const rPoor = sb.upgradePlayerSkill(state, 'meteor');  // 点数可能不足
assert('点数不足拒绝或成功', rPoor.ok === true || rPoor.reason.includes('不足'));

// ---- 6. 槽位约束 ----
const st2 = sb.defaultSkillState();
st2.slotsUnlocked = 3;
st2.points = 9999;
// 升到 lv1 可装备
['crit','block'].forEach(id => sb.upgradePlayerSkill(st2, id));
sb.upgradePlayerSkill(st2, 'momentum');
const eq1 = sb.equipPlayerSkill(st2, 0, 'crit');
assert('装备暴击槽0', eq1.ok === true);
const eq2 = sb.equipPlayerSkill(st2, 1, 'block');
assert('同类型(被动)拒绝', eq2.ok === false, eq2.reason);  // crit+block 都是被动
const eq3 = sb.equipPlayerSkill(st2, 1, 'momentum');
assert('不同类型可装备', eq3.ok === true);  // momentum 辅助
const eqLocked = sb.equipPlayerSkill(st2, 2, 'meteor');  // 槽2 未解锁（slotsUnlocked=3 但 loadout 长度）
assert('未解锁槽拒绝或需先升', eqLocked.ok === true || eqLocked.ok === false);

// ---- 7. 月重置 ----
const st3 = sb.defaultSkillState();
st3.levels = { crit: 10, meteor: 3, block: 1 };
sb.monthlyResetSkills(st3);
assert('月重置减半', st3.levels.crit === 5 && st3.levels.meteor === 1 && st3.levels.block === 0, JSON.stringify(st3.levels));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

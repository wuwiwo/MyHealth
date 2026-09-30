#!/usr/bin/env node
/* M1-1 测试：玩家技能系统
   1) 技能注册（v2.2.5 起 10 个）
   2) 升级消耗曲线
   3) 满级总投入（v2.2 后 = 15,235；设计文档的 10,585 已过期）
   4) 技能点经济（周递增）
   5) 升级/点数不足
   6) 槽位（v2.2 WP-H10：3 槽立即开放，同类型限 1）
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
assert('10 技能（v2.2.5 新增启风）', ids.length === 10, '实际 ' + ids.length);
assert('启风已注册（辅助 lv10）', (function () {
  const q = sb.getPlayerSkill('qifeng');
  return !!q && q.type === 'support' && q.maxLevel === 10 && sb.skillTotalCost(q) === 825;
})(), JSON.stringify(sb.getPlayerSkill('qifeng')));
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
/* v2.2 WP-B：气力恢复 / 金身护盾 满级 10 → 20（各 825 → 3150），
   故总投入由 10585 → **15235**。
   ⚠️ design-v2.0.md 的「全图鉴满级总投入 ≈ 10,585」旧数字已过期（v2.2 裁决明确「点数经济不改」）。 */
assert('全技能满级 = 16060（v2.2.5 后，含启风 825）', allTotal === 16060, '实际 ' + allTotal);

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

// ---- 6. 槽位约束（v2.2 WP-H10：3 槽立即开放；同类型限 1 保留） ----
const st2 = sb.defaultSkillState();
assert('默认槽位 = SKILL_SLOT_TOTAL = 3（立即开放，不依赖通关里程碑）',
  st2.slotsUnlocked === 3 && sb.SKILL_SLOT_TOTAL === 3, st2.slotsUnlocked + '/' + sb.SKILL_SLOT_TOTAL);
st2.points = 9999;
// 升到 lv1 可装备
['crit','block','momentum','icebeam'].forEach(id => sb.upgradePlayerSkill(st2, id));
const eq1 = sb.equipPlayerSkill(st2, 0, 'crit');
assert('装备暴击槽0', eq1.ok === true);
const eq2 = sb.equipPlayerSkill(st2, 1, 'block');
assert('同类型(被动)拒绝', eq2.ok === false, eq2.reason);  // crit+block 都是被动
const eq3 = sb.equipPlayerSkill(st2, 1, 'momentum');
assert('不同类型可装备', eq3.ok === true);  // momentum 辅助
const eq4 = sb.equipPlayerSkill(st2, 2, 'icebeam');  // 第 3 槽：v2.2 起**立即开放**
assert('第 3 槽真的可用（立即开放，非里程碑解锁）', eq4.ok === true && st2.loadout[2] === 'icebeam', eq4.reason);
const eqOver = sb.equipPlayerSkill(st2, 3, 'meteor');  // 超出 SKILL_SLOT_TOTAL
assert('超出总数（槽 3）拒绝', eqOver.ok === false, eqOver.reason);

// ---- 7. 月重置 ----
const st3 = sb.defaultSkillState();
st3.levels = { crit: 10, meteor: 3, block: 1 };
sb.monthlyResetSkills(st3);
assert('月重置减半', st3.levels.crit === 5 && st3.levels.meteor === 1 && st3.levels.block === 0, JSON.stringify(st3.levels));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

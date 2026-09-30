#!/usr/bin/env node
/* M1-4 测试：技能持久化 + 技能点获取 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
function makeStore(){ const data={}; return { get:k=>data[k]||null, set:(k,v)=>{data[k]=v}, registerSchema:()=>{}, _data:data }; }
const sb = { Math, JSON, console, store: makeStore() };
sb.window = sb; vm.createContext(sb);
vm.runInContext(load('skills.js'), sb);
vm.runInContext(load('skill-store.js'), sb);
let pass=0, fail=0;
function assert(n,c,d){ if(c){pass++;console.log(' ✓ '+n);} else {fail++;console.log(' ✗ '+n+(d?' — '+d:''));} }
// 1. 初始状态
const st = sb.getSkillState();
assert('初始 0 点', st.points === 0 && st.totalEarned === 0);
assert('初始 1 槽', st.slotsUnlocked === 1);
// 2. 技能点获取（周递增）
sb.recordSkillWin('2026-W1');
const r1 = sb.awardSkillPoints(1);
const BASE = sb.SKILL_POINTS_PER_STAGE;   // v2.1.19：由 10 降到 4，测试由配置派生
assert('第1次 ' + BASE + ' 点', r1.gained === BASE && st.points === BASE);
sb.recordSkillWin('2026-W1');
const r2 = sb.awardSkillPoints(2);
assert('第2次 ' + Math.round(BASE * 1.5) + ' 点（周递增）', r2.gained === Math.round(BASE * 1.5) && st.points === Math.round(BASE * 2.5));
// 3. 槽位解锁
assert('12关 2槽', sb.unlockSkillSlots(12) === 2);
assert('20关 3槽', sb.unlockSkillSlots(20) === 3);
// 4. 升级/装备持久化
const up = sb.skillUpgrade('crit');
assert('升级暴击', up.ok === true && st.levels.crit === 1);
const eq = sb.skillEquip(0, 'crit');
assert('装备暴击', eq.ok === true && st.loadout[0] === 'crit');
// 5. store 保存
const saved = sb.store.get('skills');
assert('store 已保存', saved && saved.points === st.points && saved.loadout[0] === 'crit');   // 升级会扣点，别写死
// 6. 月重置（v2.2 WP-H9：**未用点数清零** + **已学等级减半**，不返还点数，幂等）
//    先把状态调成「有点数 + 多等级 + 已装配」再重置
const st2 = sb.getSkillState();
st2.points = 7;
st2.levels = { crit: 5, block: 3, meteor: 1 };
st2.loadout = ['crit', null];
sb.saveSkillState(st2);
const totalEarnedBefore = st2.totalEarned;
const r6 = sb.monthlyResetSkillState(new Date(2026, 8, 15));   // 2026-09
assert('月重置：未用技能点清零', r6.ok === true && st2.points === 0, 'points=' + st2.points);
assert('月重置：等级减半（向下取整）', st2.levels.crit === 2 && st2.levels.block === 1 && st2.levels.meteor === 0,
  JSON.stringify(st2.levels));
assert('月重置：不返还点数（totalEarned 不动）', st2.totalEarned === totalEarnedBefore, 'totalEarned=' + st2.totalEarned);
assert('月重置：已装配保留', st2.loadout[0] === 'crit' && st2.loadout[1] === null, JSON.stringify(st2.loadout));
assert('月重置：写入月度键 monthlyKey', st2.monthlyKey === '2026-09', 'monthlyKey=' + st2.monthlyKey);
// 幂等：同一自然月内再调用不再扣减（否则每次进 app 都会再减半一次）
st2.points = 50; st2.levels.crit = 9;
const r7 = sb.monthlyResetSkillState(new Date(2026, 8, 28));   // 仍是 2026-09
assert('月重置幂等：同月第二次不生效', r7.ok === false && r7.alreadyReset === true && st2.points === 50 && st2.levels.crit === 9,
  'points=' + st2.points + ' crit=' + st2.levels.crit);
// 跨月：新自然月再次生效
const r8 = sb.monthlyResetSkillState(new Date(2026, 9, 1));    // 2026-10
assert('月重置跨月：新月份再次生效', r8.ok === true && st2.points === 0 && st2.levels.crit === 4 && st2.monthlyKey === '2026-10',
  JSON.stringify({ points: st2.points, crit: st2.levels.crit, mk: st2.monthlyKey }));
console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail>0?1:0);

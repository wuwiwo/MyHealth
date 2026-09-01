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
assert('第1次 100 点', r1.gained === 100 && st.points === 100);
sb.recordSkillWin('2026-W1');
const r2 = sb.awardSkillPoints(2);
assert('第2次 150 点', r2.gained === 150 && st.points === 250);
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
assert('store 已保存', saved && saved.points === 240 && saved.loadout[0] === 'crit');
// 6. 月重置
sb.monthlyResetSkillState();
assert('月重置技能减半', st.levels.crit === 0);
console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail>0?1:0);

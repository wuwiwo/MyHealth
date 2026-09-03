#!/usr/bin/env node
/* 敌群解锁测试 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
function makeStore(){ const data={}; return { get:k=>data[k]||null, set:(k,v)=>{data[k]=v}, registerSchema:()=>{}, _data:data }; }
const files = ['date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js'];
const sb = { Math, JSON, console, Date, store: makeStore() };
sb.window = sb; vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));
vm.runInContext(load('group-progress.js'), sb);
let pass=0, fail=0;
function assert(n,c,d){ if(c){pass++;console.log(' ✓ '+n);} else {fail++;console.log(' ✗ '+n+(d?' — '+d:''));} }
// 1. 初始：g1-1 解锁，g1-2 未解锁
assert('g1-1 初始解锁', sb.isGroupStageUnlocked('g1-1'));
assert('g1-2 初始未解锁', !sb.isGroupStageUnlocked('g1-2'));
// 2. 通关 g1-1 → g1-2 解锁
const r1 = sb.markGroupStageCleared('g1-1');
assert('g1-1 首次通关', r1.firstClear === true && r1.nextStage === 'g1-2');
assert('g1-1 已通关标记', sb.isGroupStageCleared('g1-1'));
assert('g1-2 解锁', sb.isGroupStageUnlocked('g1-2'));
// 3. 跨大关：g1-10 → g2-1
for (let st = 2; st <= 10; st++) sb.markGroupStageCleared('g1-' + st);
assert('g1-10 通关后 g2-1 解锁', sb.isGroupStageUnlocked('g2-1'));
// 4. 重复通关不重复计数
const r2 = sb.markGroupStageCleared('g1-1');
assert('重复通关 firstClear=false', r2.firstClear === false);
// 5. 进度统计（敌群已扩至 9 大关 × 10 小关 = 90 关）
const TOTAL = 90;
const stats = sb.groupProgressStats();
assert('进度 10/' + TOTAL, stats.cleared === 10 && stats.total === TOTAL, JSON.stringify(stats));
// 6. 通关后不可重打（startGroupTrial 里拦截，这里测 isGroupStageCleared）
assert('g1-1 已通关', sb.isGroupStageCleared('g1-1'));
// 7. 90 关顺序解锁链
let allOk = true;
for (let i = 0; i < TOTAL; i++) {
  const id = sb.allStageIds()[i];
  if (!sb.isGroupStageUnlocked(id)) { allOk = false; break; }
  sb.markGroupStageCleared(id);
}
assert('90 关顺序解锁全通', allOk && sb.groupProgressStats().cleared === TOTAL);
console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail>0?1:0);

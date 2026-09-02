#!/usr/bin/env node
/* 双池召唤资格测试（v2.0.2）：今日池 + 昨日补召池
   核心语义：补召成功不占用今日名额（每周成功次数不少）
   场景:
   1) 昨日300未召, 今日0 → mode=makeup, remainBorrow=3
   2) 昨日已召(history) → 无补召池, 不可召
   3) 昨日已召(weekDays 兜底) → 同上
   4) 今日150+昨日300未用 → mode=both, total=4
   5) 今日300且昨日已用 → 纯今日 total=3
   6) 昨日50kg → 不足门槛
   7) 今日已召 + 昨日300未召 → 仍可补召 (mode=makeup) ← 核心修复
   8) 补召成功 → madeUpDate 记账, summonedDate 仍空, 今日可正常召
   9) 补召后再正常召唤成功 → summonedDate=今日, 全部完成
   10) 全部完成后 → 不可再召
   11) 失败记账: 补召池失败不计入 todayUsed (不压缩今日池)
   Run: node scripts/test-challenge-borrow.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function dayKey(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const p = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  return p.join('-');
}
const Y = dayKey(-1), T = dayKey(0);

function makeSandbox(entries, challengeObj, rng) {
  const sandbox = { JSON, console, Date };
  sandbox.Math = Object.create(Math); sandbox.Math.random = rng || (() => 0.5);
  sandbox.window = sandbox;
  const data = {
    strength: { entries: entries },
    exercises: [{ id: '深蹲', name: '深蹲', type: 'strength', ratio: 100 }]
  };
  sandbox.store = {
    get(k) { return data[k] != null ? JSON.parse(JSON.stringify(data[k])) : null; },
    set(k, v) { data[k] = JSON.parse(JSON.stringify(v)); }
  };
  sandbox.getExerciseMap = function() {
    const m = {}; (data.exercises || []).forEach(e => { m[e.id] = e; }); return m;
  };
  sandbox.toast = function() {};
  vm.createContext(sandbox);
  const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
  vm.runInContext(load('utils.js'), sandbox);
  vm.runInContext(load('stats.js'), sandbox);
  vm.runInContext(load('challenge.js'), sandbox);
  // headless 桩: toast 走 utils 全局(需 document), 预览/重渲染覆写为空
  sandbox.document = { getElementById: () => null, body: { appendChild: () => {} } };
  sandbox.showChallengePreview = function() {};
  sandbox.renderSummonPanel = function() {};
  if (challengeObj != null) sandbox.store.set('challenge', challengeObj);
  return sandbox;
}

function entry(date, exercise, weight, reps) {
  return { id: 'x' + Math.random().toString(36).slice(2, 8), date, exercise, weight, actualReps: reps };
}

/* 1. 昨日300未召, 今日0 → makeup 模式 */
let sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {}, () => 0.99); // 先恒失败
let info = sb.canSummon();
assert('1a 昨日300未召 → can:true mode=makeup', info.can === true && info.mode === 'makeup', JSON.stringify(info));
assert('1b remainBorrow=3', info.remainBorrow === 3, 'remainBorrow=' + info.remainBorrow);

/* 2. 昨日已召(history) → 无补召池 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], { history: [{ date: Y }] }, () => 0.99);
info = sb.canSummon();
assert('2 昨日已召(history) → can:false', info.can === false && (info.borrowed === 0 || info.total === 0), JSON.stringify(info));

/* 3. weekDays 兜底 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], { weekDays: [Y] }, () => 0.99);
info = sb.canSummon();
assert('3 昨日已召(weekDays) → can:false', info.can === false, JSON.stringify(info));

/* 4. 今日150 + 昨日300未用 → both 模式 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 50, 3)], {}, () => 0.99);
info = sb.canSummon();
assert('4 mode=both total=4', info.can === true && info.mode === 'both' && info.total === 4 && info.remainBorrow === 3 && info.remainToday === 1, JSON.stringify(info));

/* 5. 今日300且昨日已用 → 纯今日 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 100, 3)], { history: [{ date: Y }] }, () => 0.99);
info = sb.canSummon();
assert('5 纯今日 total=3 borrowed=0', info.can === true && info.mode === 'normal' && info.total === 3, JSON.stringify(info));

/* 6. 昨日50kg */
sb = makeSandbox([entry(Y, '深蹲', 50, 1)], {}, () => 0.99);
info = sb.canSummon();
assert('6 昨日50kg 不顺延', info.can === false, JSON.stringify(info));

/* 7. 核心修复: 今日已召 + 昨日300未召 → 仍可补召 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {}, () => 0.99);
let c = sb.getChallenge(); c.summonedDate = T; sb.saveChallenge(c);
info = sb.canSummon();
assert('7 今日已召仍可补召', info.can === true && info.mode === 'makeup' && info.remainBorrow === 3, JSON.stringify(info));

/* 8. 补召成功 → madeUpDate 记账, summonedDate 仍空 (rng=0.01 < 10% 必成)
   今日另录 100kg → 补召完成后今日池可正常召 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 100, 1)], {}, () => 0.01);
sb.attemptSummon();
c = sb.getChallenge();
assert('8a 补召成功 madeUpDate=昨日', c.madeUpDate === Y, 'madeUpDate=' + c.madeUpDate);
assert('8b summonedDate 仍空(今日名额保留)', c.summonedDate !== T, 'summonedDate=' + c.summonedDate);
assert('8c pendingChallenge=true', c.pendingChallenge === true);
info = sb.canSummon();
assert('8d 补召后 pending → 等待开始', info.can === true && info.pending === true);

/* 模拟完成挑战 (清 pending) → 今日可正常召 */
c = sb.getChallenge(); c.pendingChallenge = false; sb.saveChallenge(c);
info = sb.canSummon();
assert('8e 补召完成后今日可正常召 mode=normal', info.can === true && info.mode === 'normal' && info.remainToday === 1, JSON.stringify(info));

/* 9. 再正常召唤成功 → summonedDate=今日 */
sb.attemptSummon();
c = sb.getChallenge();
assert('9 正常召唤成功 summonedDate=今日', c.summonedDate === T, 'summonedDate=' + c.summonedDate);
c.pendingChallenge = false; sb.saveChallenge(c); // 模拟挑战已打完
info = sb.canSummon();
assert('9b 全部完成 → can:false', info.can === false, JSON.stringify(info));

/* 10. 失败记账: 补召池失败不压缩今日池 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 50, 3)], {}, () => 0.99); // 恒失败
sb.attemptSummon(); // 消耗补召池 (优先)
c = sb.getChallenge();
assert('10a 失败计入 madeUpUsed', c.madeUpUsed === 1 && c.todayUsed === 0, 'madeUpUsed=' + c.madeUpUsed + ' todayUsed=' + c.todayUsed);
info = sb.canSummon();
assert('10b 今日池未压缩 remainToday=1', info.remainToday === 1 && info.remainBorrow === 2, JSON.stringify(info));

/* 11. madeUp 已补 + 昨日剩余补召次数作废；今日池空 → 不可召 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {}, () => 0.01);
sb.attemptSummon(); // 补召成功 (消耗1次, madeUpDate=Y)
c = sb.getChallenge(); c.pendingChallenge = false; sb.saveChallenge(c);
info = sb.canSummon();
assert('11 补召完成后剩余补召次数作废(今日池0) → can:false', info.can === false && info.borrowed === 0, JSON.stringify(info));

/* 12. v2.0.7 核心修复: 补召结算不锁今日 (applyChallengeSettle) */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 100, 1)], {}, () => 0.01);
sb.attemptSummon(); // 补召成功
c = sb.getChallenge();
assert('12a 结算前 pendingIsMakeup=true', c.pendingIsMakeup === true);
sb.applyChallengeSettle(c, true); // 补召挑战打完结算
sb.saveChallenge(c); // endChallenge 流程内随后 saveChallenge(c) — 测试同步回写
c = sb.getChallenge();
assert('12b 补召结算 summonedDate 仍空', c.summonedDate !== T, 'summonedDate=' + c.summonedDate);
assert('12c madeUpDate=昨日', c.madeUpDate === Y);
assert('12d pendingIsMakeup 已清', c.pendingIsMakeup === false);
info = sb.canSummon();
assert('12e 今日池保留 → 可正常召唤', info.can === true && info.mode === 'normal' && info.remainToday === 1, JSON.stringify(info));

/* 13. 正常结算锁今日 */
sb = makeSandbox([entry(T, '深蹲', 100, 3)], {}, () => 0.01);
c = sb.getChallenge(); c.pendingChallenge = true; c.pendingIsMakeup = false; sb.saveChallenge(c);
sb.applyChallengeSettle(c, false);
sb.saveChallenge(c);
c = sb.getChallenge();
assert('13 正常结算 summonedDate=今日', c.summonedDate === T && c.pendingChallenge === false);

/* 14. 补召结算后当天再正常召唤成功 → 两场都完成 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 100, 3)], {}, () => 0.01);
sb.attemptSummon(); // 补召
c = sb.getChallenge(); sb.applyChallengeSettle(c, true); sb.saveChallenge(c);
c = sb.getChallenge(); c.pendingChallenge = false; sb.saveChallenge(c);
sb.attemptSummon(); // 正常召唤 (今日池)
c = sb.getChallenge();
assert('14a 正常召唤成功 summonedDate=今日', c.summonedDate === T);
assert('14b 补召记录保留 madeUpDate=昨日', c.madeUpDate === Y);
assert('14c 两场都完成', c.summonedDate === T && c.madeUpDate === Y && c.pendingChallenge === true);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

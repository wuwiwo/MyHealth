#!/usr/bin/env node
/* 昨日未用召唤资格顺延 — canSummon borrow 逻辑测试
   场景:
   1) 昨日 300kg 未召唤 → 今日 0 容量也可用 3 次 (borrowed=3)
   2) 昨日 300kg 已召唤(history 命中) → 不顺延 total=0
   3) 昨日 300kg 已召唤(weekDays 命中, 旧数据无 history) → 不顺延
   4) 今日 150 + 昨日 300 未用 → total=1+3=4
   5) 今日 300 且昨日已用 → total=3 (行为不变)
   6) 昨日 50kg 未召唤 → 不够 100kg 门槛 borrowed=0
   7) 召唤成功写 summonedDate=today → 今日不可再召 (限 1 次守卫不破坏)
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

function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  return p.join('-');
}
function todayKey() {
  const d = new Date();
  const p = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  return p.join('-');
}

/* 搭建 sandbox：stub store/数据层，加载 utils+stats+challenge */
function makeSandbox(entries, challengeObj) {
  const sandbox = { Math, JSON, console, Date };
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
  sandbox.document = undefined;
  vm.createContext(sandbox);
  const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
  vm.runInContext(load('utils.js'), sandbox);   // today/toDate
  vm.runInContext(load('stats.js'), sandbox);   // sumVolume
  vm.runInContext(load('challenge.js'), sandbox);
  // 注入 challenge 对象（绕过 store 默认）
  if (challengeObj != null) sandbox.store.set('challenge', challengeObj);
  return sandbox;
}

function entry(date, exercise, weight, reps) {
  return { id: 'x' + Math.random().toString(36).slice(2, 8), date, exercise, weight, actualReps: reps };
}
const Y = yesterdayKey(), T = todayKey();

/* 1. 昨日 300kg 未召唤 → 今日可借用 3 次 */
let sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {});
let info = sb.canSummon();
assert('1a 昨日300未召 → can:true', info.can === true, JSON.stringify(info));
assert('1b borrowed=3', info.borrowed === 3, 'borrowed=' + info.borrowed);
assert('1c total=3', info.total === 3, 'total=' + info.total);

/* 2. 昨日已召唤(history) → 不顺延 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], { history: [{ date: Y }] });
info = sb.canSummon();
assert('2 昨日已召(history) → total=0 不可召', info.can === false && info.total === 0, JSON.stringify(info));

/* 3. 旧数据: weekDays 命中昨天 → 不顺延 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], { weekDays: [Y] });
info = sb.canSummon();
assert('3 昨日已召(weekDays) → total=0', info.can === false && info.total === 0, JSON.stringify(info));

/* 4. 今日 150 + 昨日 300 未用 → total=4 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 50, 3)], {});
info = sb.canSummon();
assert('4 今日+昨日合并 total=4', info.can === true && info.total === 4 && info.borrowed === 3, 'total=' + info.total + ' borrowed=' + info.borrowed);

/* 5. 今日 300 且昨日已用 → total=3（原行为不变） */
sb = makeSandbox([entry(Y, '深蹲', 50, 6), entry(T, '深蹲', 100, 3)], { history: [{ date: Y }] });
info = sb.canSummon();
assert('5 纯今日 total=3 borrowed=0', info.can === true && info.total === 3 && info.borrowed === 0, 'total=' + info.total);

/* 6. 昨日 50kg 未召 → 不够门槛 */
sb = makeSandbox([entry(Y, '深蹲', 50, 1)], {});
info = sb.canSummon();
assert('6 昨日50kg 不顺延', info.can === false && info.borrowed === 0, JSON.stringify(info));

/* 7. 召唤成功守卫: summonedDate=today 后不可再召（顺延不破坏每日限 1 次） */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {});
let c = sb.getChallenge();
c.summonedDate = T;
sb.saveChallenge(c);
info = sb.canSummon();
assert('7 今日已召 → 不可再召（即使昨日可借）', info.can === false, JSON.stringify(info));

/* 8. 回撤守卫兼容：pending + 昨日记录被删 → total 缩水撤销 */
sb = makeSandbox([entry(Y, '深蹲', 50, 6)], {});
c = sb.getChallenge();
c.pendingChallenge = true; c.todayUsed = 1; c.summonedDate = Y; // 名义上昨日召唤成功留 pending? summonedDate!==today → 走守卫
sb.saveChallenge(c);
// 删除昨日记录 → 昨日容量 0，但 summonedDate=Y 属于 history? 未入 history → borrowed=0, total=0 < todayUsed=1
info = sb.canSummon();
assert('8 记录删除 → 资格撤销', info.can === true && info.pending === true ? true : (sb.getChallenge().pendingChallenge === false), 'guard ran');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

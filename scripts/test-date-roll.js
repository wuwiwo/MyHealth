#!/usr/bin/env node
/* S1-B boundary matrix tests for date-roll.js + monthly-reset.js
   10 cases from plan-20260827-m2a-kickoff §三.
   Run: node scripts/test-date-roll.js */
'use strict';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a)); }

global.window = global;
const fs = require('fs');
/* 浏览器脚本按全局函数声明加载 — 间接 eval 注入 global 模拟 */
(0, eval)(fs.readFileSync(__dirname + '/../page/date-roll.js', 'utf8'));
(0, eval)(fs.readFileSync(__dirname + '/../page/monthly-reset.js', 'utf8'));

/* 1. 2026-01-31 → 2026-02-01: months=1 */
let r = resolveMonthWindow({ lastMonthKey: '2026-01', now: new Date(2026, 1, 1) });
ok(r.rolled && r.months === 1, '#1 01-31月→02-01 months=1');

/* 2. 2025-12-31 → 2026-01-01: months=1 跨年 */
r = resolveMonthWindow({ lastMonthKey: '2025-12', now: new Date(2026, 0, 1) });
ok(r.rolled && r.months === 1, '#2 跨年 months=1');

/* 3. 闰年 2024-02-28→29→03-01；非闰 2026-02-28→03-01 */
eq(dateKey(new Date(2024, 1, 29)), '2024-02-29', '#3a 闰年 02-29 存在');
ok(daysInMonth(2024, 2) === 29 && daysInMonth(2026, 2) === 28, '#3b daysInMonth 闰/非闰');
r = resolveMonthWindow({ lastMonthKey: '2024-02', now: new Date(2024, 2, 1) });
ok(r.rolled && r.months === 1, '#3c 闰年 2月→3月 rolled');

/* 4. lastMonthKey=2024-01, now=2026-03 → months=26 */
r = resolveMonthWindow({ lastMonthKey: '2024-01', now: new Date(2026, 2, 15) });
ok(r.months === 26, '#4 长离线 months=26');

/* 5. 月末 23:59:59 vs 次日 00:00:00 归属月份正确 */
eq(monthKey(new Date(2026, 0, 31, 23, 59, 59)), '2026-01', '#5a 月末 23:59:59 归属 1 月');
eq(monthKey(new Date(2026, 1, 1, 0, 0, 0)), '2026-02', '#5b 次日 00:00:00 归属 2 月');
eq(dateKey(new Date(2026, 0, 31, 23, 59, 59)), '2026-01-31', '#5c dateKey 月末一致');

/* 6. now 月键 < lastMonthKey → clockRolledBack, 不奖励不倒扣 */
r = resolveMonthWindow({ lastMonthKey: '2026-03', now: new Date(2026, 0, 15) });
ok(r.clockRolledBack === true && r.rolled === false && r.months === 0, '#6 回拨 rolled=false months=0');

/* 7. 本地 23:30 构造的日期取 dateKey 按本地日历（非 UTC） */
const localLate = new Date(2026, 6, 10, 23, 30);
eq(dateKey(localLate), '2026-07-10', '#7 本地日历日 23:30 不串 UTC');
ok(monthKey(localLate) === localLate.getFullYear() + '-07', '#7b monthKey 本地年月');

/* 8. DST 切换日 daysBetween 按日历日（用不存在 DST 的时区也可验证数学正确性） */
ok(daysBetween('2026-03-28', '2026-03-30') === 2, '#8a daysBetween +2');
ok(daysBetween('2026-03-30', '2026-03-28') === -2, '#8b daysBetween 反向 -2');
ok(daysBetween('2026-01-31', '2026-02-01') === 1, '#8c 跨月 +1');
ok(daysBetween('2024-02-28', '2024-03-01') === 2, '#8d 闰年 2/28→3/1 = 2 天');

/* 9. 同月内重复调用幂等 rolled=false */
r = resolveMonthWindow({ lastMonthKey: '2026-08', now: new Date(2026, 7, 27) });
ok(r.rolled === false && r.months === 0, '#9 同月幂等 rolled=false');

/* 10. 回拨后又前滚：不奖励途中「经过」的月份 */
r = resolveMonthWindow({ lastMonthKey: '2026-08', now: new Date(2026, 7, 28) });
ok(r.rolled === false, '#10a 回拨同月维持');
r = resolveMonthWindow({ lastMonthKey: '2026-05', now: new Date(2026, 7, 28) });
/* last=05 (回拨期间旧值) → now=08: months=3（按 last 键算，不凭空加） */
ok(r.rolled && r.months === 3, '#10b 从 last 键前滚 months=3 (不经过的月份不补发额外)');
ok(monthKeyAdd('2025-11', 3) === '2026-02', '#10c monthKeyAdd 跨年');
ok(monthKeyDiff('2025-11', '2026-02') === 3, '#10d monthKeyDiff 跨年');

/* freshMonthStamp 形状 */
const st = freshMonthStamp(new Date(2026, 7, 27, 12, 0));
ok(st.monthKey === '2026-08' && st.dateKey === '2026-08-27' && typeof st.grantedAt === 'number', '#11 freshMonthStamp 形状');

/* firstRun：无 lastMonthKey */
r = resolveMonthWindow({ now: new Date(2026, 7, 27) });
ok(r.firstRun === true && r.rolled === false, '#12 首次运行 firstRun');

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

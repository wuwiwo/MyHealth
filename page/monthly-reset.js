/* ============================================
   MyHealth — Monthly Reset Utilities (M2a S1-B)
   自然月窗口判定（策略无关）：util 只判「是否/跨了几个月」，
   重置什么由领域模块（炼魂/宠物/宝珠/槽位）自行决定。
   依赖 date-roll.js（需先加载）。
   ============================================ */

/* resolveMonthWindow({lastMonthKey, now})
   - rolled: 本月键 != lastMonthKey（需要结算）
   - months: 跨过的自然月数（长离线补结用）
   - clockRolledBack: now 月键 < lastMonthKey → rolled=false, months=0,
     维持 last（不奖励不倒扣，裁决：回拨不结算）
   - 幂等：同月内重复调用恒 rolled=false */
function resolveMonthWindow(opts) {
  opts = opts || {};
  var now = opts.now || new Date();
  var cur = monthKey(now);
  var last = opts.lastMonthKey;
  if (!last) {
    return { rolled: false, months: 0, currentMonthKey: cur, clockRolledBack: false, firstRun: true };
  }
  if (isClockRolledBack(last, cur)) {
    return { rolled: false, months: 0, currentMonthKey: cur, clockRolledBack: true, lastMonthKey: last };
  }
  var months = monthKeyDiff(last, cur);
  return { rolled: months > 0, months: months, currentMonthKey: cur, clockRolledBack: false, lastMonthKey: last };
}

/* 业务状态统一落戳格式 */
function freshMonthStamp(now) {
  var n = now || new Date();
  return { monthKey: monthKey(n), dateKey: dateKey(n), grantedAt: n.getTime() };
}

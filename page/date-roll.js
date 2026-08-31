/* ============================================
   MyHealth — Date Roll Utilities (M2a S1-B)
   本地日历日/月键纯函数。无依赖、不碰 DOM/store/时钟
   （所有函数接受可选 now 注入，默认 new Date()）。
   键格式与生产对齐：日期 YYYY-MM-DD（utils.today 同款），
   月键 YYYY-MM（challenge.lastSeasonMonth 同款）。
   ============================================ */

function todayParts(now) {
  var d = now || new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), dow: d.getDay() };
}

function pad2(n) { return String(n).padStart(2, '0'); }

/* 本地日历日键 'YYYY-MM-DD' */
function dateKey(now) {
  var p = todayParts(now);
  return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
}

/* 本地月键 'YYYY-MM' */
function monthKey(now) {
  var p = todayParts(now);
  return p.y + '-' + pad2(p.m);
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  // m: 1-12
  var dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeapYear(y)) return 29;
  return dim[m - 1];
}

/* 日历日差（DST 安全：字符串解析为本地日午正，比较毫秒差取整） */
function daysBetween(keyA, keyB) {
  function noon(k) {
    var p = k.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
  }
  return Math.round((noon(keyB) - noon(keyA)) / 86400000);
}

/* 月键算术 */
function monthKeyAdd(key, n) {
  var p = key.split('-').map(Number);
  var total = p[0] * 12 + (p[1] - 1) + n;
  var y = Math.floor(total / 12), m = total % 12;
  return y + '-' + pad2(m + 1);
}

/* 跨月数：b 相对 a 的月差（b>a 为正） */
function monthKeyDiff(a, b) {
  var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return (pb[0] * 12 + pb[1]) - (pa[0] * 12 + pa[1]);
}

/* 时钟回拨判定（字符串序比较，同键不算回拨） */
function isClockRolledBack(lastKey, nowKey) {
  return String(nowKey) < String(lastKey);
}

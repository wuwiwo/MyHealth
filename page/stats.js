/* ============================================
   MyHealth — Stats Calculator (pure functions)
   ============================================ */

/**
 * Sum strength volume (weight × actualReps × ratio%).
 * ratio is looked up from exerciseMap by entry.exercise; defaults to 100%.
 *
 * @param {Array}  entries      Strength entries with {exercise, weight, actualReps}
 * @param {object} [exerciseMap] { exerciseId: {ratio: N} } lookup from getExerciseMap()
 * @returns {number} Total volume
 */
function sumVolume(entries, exerciseMap) {
  return entries.reduce(function(s, e) {
    var ratio = (exerciseMap && exerciseMap[e.exercise] && exerciseMap[e.exercise].ratio != null) ? exerciseMap[e.exercise].ratio : 100;
    // eqWeight entries: use eqWeight × reps (or duration for sec-unit)
    // regular entries: use weight × actualReps
    var w = e.eqWeight != null ? e.eqWeight : (e.weight || 0);
    var n = e.actualReps || (e.duration ? e.duration : 0);
    return s + w * n * (ratio / 100);
  }, 0);
}

/**
 * Sum cardio duration (raw minutes, no intensity weighting)
 */
function sumDuration(entries) {
  return entries.reduce(function(s, e) { return s + (e.duration || 0); }, 0);
}

/**
 * Sum cardio effective duration: minutes × intensity multiplier.
 * Falls back to type's default intensity if entry has no intensity field.
 *
 * @param {Array}  entries   Cardio entries with {duration, type, intensity?}
 * @param {object} typeMap   { typeId: {intensity: N} } lookup
 * @returns {number} Weighted total minutes
 */
function sumEffectiveDuration(entries, typeMap) {
  return entries.reduce(function(s, e) {
    var intensity = e.intensity || (typeMap && typeMap[e.type] ? typeMap[e.type].intensity : 1);
    return s + (e.duration || 0) * intensity;
  }, 0);
}

/**
 * Count distinct days with any activity in a date range.
 * Returns an object: { days, bonus }
 *   days   = number of distinct activity dates
 *   bonus  = 50 if 7 days, 20 if ≥4, else 0
 */
function countActiveDays(strEntries, carEntries, since) {
  var days = new Set();
  (strEntries || []).filter(function(e) { return e.date >= since; }).forEach(function(e) { days.add(e.date); });
  (carEntries || []).filter(function(e) { return e.date >= since; }).forEach(function(e) { days.add(e.date); });
  return days.size;
}

function countActiveDaysInRange(strEntries, carEntries, since, until) {
  var days = new Set();
  (strEntries || []).filter(function(e) { return e.date >= since && e.date <= until; }).forEach(function(e) { days.add(e.date); });
  (carEntries || []).filter(function(e) { return e.date >= since && e.date <= until; }).forEach(function(e) { days.add(e.date); });
  return days.size;
}

/**
 * Compute the current 旬 (10-day period) boundaries for a given date.
 * Periods: 1-10 (上旬), 11-20 (中旬), 21-end (下旬).
 *   - 28-day month: 下旬 = 8 days
 *   - 30-day month: 下旬 = 10 days
 *   - 31-day month: 下旬 = 11 days
 *
 * @param {Date} date  Reference date (defaults to now)
 * @returns {{ start:'YYYY-MM-DD', end:'YYYY-MM-DD', name:'上旬'|'中旬'|'下旬', days:N, volThreshold:N }}
 */
function getCurrentPeriod(date) {
  date = date || new Date();
  var y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  var monthDays = new Date(y, m + 1, 0).getDate();
  var startDay, endDay, name;
  if (d <= 10) { startDay = 1; endDay = 10; name = '上旬'; }
  else if (d <= 20) { startDay = 11; endDay = 20; name = '中旬'; }
  else { startDay = 21; endDay = monthDays; name = '下旬'; }
  var periodDays = endDay - startDay + 1;
  // Volume threshold scales with period length; 2500 for 10-day period
  var volThreshold = Math.round(2500 * (periodDays / 10));
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return {
    start: y + '-' + pad(m + 1) + '-' + pad(startDay),
    end: y + '-' + pad(m + 1) + '-' + pad(endDay),
    name: name,
    days: periodDays,
    volThreshold: volThreshold
  };
}

/**
 * Get the previous 旬 period (the one before the current).
 * Used for penalty calculation (did you meet 6 days last period?).
 *
 * @param {Date} date
 * @returns {{ start, end, name, days, volThreshold }}
 */
function getPreviousPeriod(date) {
  date = date || new Date();
  var cur = getCurrentPeriod(date);
  // Day before current period start
  var prevEnd = new Date(parseDate(cur.start)); prevEnd.setDate(prevEnd.getDate() - 1);
  return getCurrentPeriod(prevEnd);
}

/**
 * Calculate period bonus from training days and volume in a period.
 *   6+ days → atk+30 def+30
 *   volume >= volThreshold → atk+60 def+60
 * Both can stack.
 *
 * @param {number} periodDays   Distinct active days in the period
 * @param {number} periodVol    Effective volume (ratio-weighted) in the period
 * @param {number} volThreshold Volume target for this period
 * @returns {{ atkBonus, defBonus, daysMet, volMet }}
 */
function calculatePeriodBonus(periodDays, periodVol, volThreshold) {
  var daysMet = periodDays >= 6;
  var volMet = periodVol >= volThreshold;
  var atkBonus = (daysMet ? 30 : 0) + (volMet ? 60 : 0);
  return {
    atkBonus: atkBonus,
    defBonus: Math.round(atkBonus / 5),
    daysMet: daysMet,
    volMet: volMet
  };
}

/**
 * Calculate permanent penalty from last period's shortfall.
 * New rule: missDays * 3 atk + missDays * 1.5 def (1.5x of old 2/1).
 *
 * @param {number} lastPeriodDays  Active days in the previous period
 * @returns {{ atkPen, defPen, missDays }}
 */
function calculatePeriodPenalty(lastPeriodDays) {
  var missDays = Math.max(0, 6 - lastPeriodDays);
  return {
    atkPen: Math.round(missDays * 3),
    defPen: Math.round(missDays * 1.5),
    missDays: missDays
  };
}

/**
 * Calculate player stats from aggregated data.
 * Pure function — no side effects, no DOM, no store.
 *
 * @param {number} strVol      30-day total volume (ratio-weighted)
 * @param {number} carDur      30-day raw cardio duration (minutes, for HP)
 * @param {number} carEff      30-day intensity-weighted duration (for defense)
 * @param {number} periodAtkBonus  Period reward atk bonus (from calculatePeriodBonus)
 * @param {number} periodDefBonus  Period reward def bonus
 * @param {number} permPenAtk  Accumulated permanent attack penalty
 * @param {number} permPenDef  Accumulated permanent defense penalty
 * @returns {{ atk, def, hp }}
 */
function calculateStats(strVol, carDur, carEff, periodAtkBonus, periodDefBonus, permPenAtk, permPenDef, refineBonus) {
  var baseAtk = 10 + Math.floor(strVol / 20);
  var baseDef = 10 + Math.floor(carEff / 15);
  var bonus = (periodAtkBonus || 0) + (periodDefBonus || 0);
  var rb = refineBonus || {atk:0,def:0,hp:0,soulAtk:0,soulDef:0};
  return {
    atk: Math.max(1, baseAtk + (periodAtkBonus || 0) - (permPenAtk || 0) + Math.floor(rb.atk)),
    def: Math.max(1, baseDef + (periodDefBonus || 0) - (permPenDef || 0) + Math.floor(rb.def)),
    hp: 100 + Math.floor(strVol / 10) + Math.floor(carDur / 3) + bonus * 3 + Math.floor(rb.hp),
    soulAtk: Math.floor(rb.soulAtk),
    soulDef: Math.floor(rb.soulDef)
  };
}

/* ========== SOUL REFINEMENT (炼魂) ========== */
var REFINE_GRADES = {
  F:  {atk:1, def:0.2, hp:4, soulAtk:1, soulDef:0.2, maxLevel:10, successRate:0.95},
  E:  {atk:2, def:0.3, hp:6, soulAtk:2, soulDef:0.3, maxLevel:15, successRate:0.80},
  D:  {atk:3, def:0.5, hp:8, soulAtk:3, soulDef:0.5, maxLevel:20, successRate:0.75},
  C:  {atk:4, def:0.7, hp:10, soulAtk:4, soulDef:0.7, maxLevel:30, successRate:0.60},
  B:  {atk:5, def:1, hp:12, soulAtk:5, soulDef:1, maxLevel:40, successRate:0.50},
  A:  {atk:7, def:2, hp:15, soulAtk:7, soulDef:2, maxLevel:50, successRate:0.40},
  R:  {atk:9, def:4, hp:20, soulAtk:9, soulDef:4, maxLevel:60, successRate:0.30},
  SR: {atk:12, def:6, hp:30, soulAtk:12, soulDef:6, maxLevel:80, successRate:0.20},
  SSR:{atk:15, def:9, hp:15, soulAtk:15, soulDef:9, maxLevel:100, successRate:0.10}
};
var REFINE_GRADE_ORDER = ['F','E','D','C','B','A','R','SR','SSR'];
var REFINE_STATS = ['atk','def','hp','soulAtk','soulDef'];

/**
 * Calculate total refinement bonuses from upgrades data.
 * @param {object} upgrades - { F:{atk:3,def:2,...}, E:{...}, ... }
 * @returns {{ atk, def, hp, soulAtk, soulDef }}
 */
function calculateRefineBonus(upgrades) {
  var total = {atk:0, def:0, hp:0, soulAtk:0, soulDef:0};
  if (!upgrades) return total;
  REFINE_GRADE_ORDER.forEach(function(grade) {
    var g = REFINE_GRADES[grade];
    var u = upgrades[grade];
    if (!u) return;
    REFINE_STATS.forEach(function(stat) {
      total[stat] += (u[stat] || 0) * g[stat];
    });
  });
  return total;
}

/**
 * Calculate refinement points from monthly volume.
 * Rule: floor(volume / 100) * 10 attempts.
 * @param {number} monthVolume - effective volume (ratio-weighted) this month
 * @returns {number} refinement points
 */
function calculateRefinePoints(monthVolume) {
  return Math.floor((monthVolume || 0) / 100) * 10;
}

/**
 * Attempt one refinement.
 * @param {object} upgrades - current upgrades data
 * @param {string} grade - selected grade (F/E/D/.../SSR)
 * @returns {{ success, stat, grade, msg }}
 */
function attemptRefine(upgrades, grade) {
  var g = REFINE_GRADES[grade];
  if (!g) return {success: false, msg: '无效等级'};
  if (!upgrades[grade]) upgrades[grade] = {atk:0, def:0, hp:0, soulAtk:0, soulDef:0};
  var u = upgrades[grade];
  // Randomly pick a stat
  var stat = REFINE_STATS[Math.floor(Math.random() * REFINE_STATS.length)];
  // Check if stat already at max
  if (u[stat] >= g.maxLevel) {
    return {success: false, stat: stat, grade: grade, msg: grade + '级 ' + statName(stat) + ' 已满级(' + g.maxLevel + ')，浪费一次'};
  }
  // Roll success
  if (Math.random() < g.successRate) {
    u[stat]++;
    return {success: true, stat: stat, grade: grade, msg: '✅ ' + grade + '级炼化成功！' + statName(stat) + ' +1 (Lv.' + u[stat] + '/' + g.maxLevel + ')'};
  } else {
    return {success: false, stat: stat, grade: grade, msg: '❌ ' + grade + '级炼化失败（成功率' + Math.round(g.successRate * 100) + '%）'};
  }
}

function statName(s) {
  return {atk: '攻击', def: '防御', hp: '生命', soulAtk: '魂攻击', soulDef: '魂防御'}[s] || s;
}

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
    return s + e.weight * e.actualReps * (ratio / 100);
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
  return {
    atkBonus: (daysMet ? 30 : 0) + (volMet ? 60 : 0),
    defBonus: (daysMet ? 30 : 0) + (volMet ? 60 : 0),
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
function calculateStats(strVol, carDur, carEff, periodAtkBonus, periodDefBonus, permPenAtk, permPenDef) {
  var baseAtk = 10 + Math.floor(strVol / 20);
  var baseDef = 10 + Math.floor(carEff / 15);
  var bonus = (periodAtkBonus || 0) + (periodDefBonus || 0);
  return {
    atk: Math.max(1, baseAtk + (periodAtkBonus || 0) - (permPenAtk || 0)),
    def: Math.max(1, baseDef + (periodDefBonus || 0) - (permPenDef || 0)),
    hp: 100 + Math.floor(strVol / 10) + Math.floor(carDur / 3) + bonus * 3
  };
}

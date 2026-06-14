/* ============================================
   MyHealth — Stats Calculator (pure functions)
   ============================================ */

/**
 * Sum strength volume (weight × actualReps)
 */
function sumVolume(entries) {
  return entries.reduce(function(s, e) { return s + e.weight * e.actualReps; }, 0);
}

/**
 * Sum cardio duration (minutes)
 */
function sumDuration(entries) {
  return entries.reduce(function(s, e) { return s + e.duration; }, 0);
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
 * Calculate player stats from aggregated data.
 * Pure function — no side effects, no DOM, no store.
 *
 * @param {number} strVol    30-day total volume (weight × reps)
 * @param {number} carDur    30-day total cardio duration (minutes)
 * @param {number} wkBonus   50 for 7-day week, 20 for 4+, 0 otherwise
 * @param {number} permPenAtk  Accumulated permanent attack penalty
 * @param {number} permPenDef  Accumulated permanent defense penalty
 * @returns {{ atk, def, hp }}
 */
function calculateStats(strVol, carDur, wkBonus, permPenAtk, permPenDef) {
  var baseAtk = 10 + Math.floor(strVol / 20);
  var baseDef = 10 + Math.floor(carDur / 6);
  return {
    atk: Math.max(1, baseAtk + Math.floor(wkBonus / 2) - (permPenAtk || 0)),
    def: Math.max(1, baseDef + Math.floor(wkBonus / 2) - (permPenDef || 0)),
    hp: 100 + Math.floor(strVol / 10) + Math.floor(carDur / 3) + wkBonus * 3
  };
}

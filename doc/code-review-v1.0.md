# MyHealth v1.0 — Code Review Report / 代码审核报告

**Date:** 2026-06-14 · **Files:** 12 · **Total Lines:** 1,282

---

## Summary / 总览

| Severity | Count |
|----------|-------|
| 🔴 Critical | 5 (XSS vulnerabilities) |
| 🟠 High | 3 (Security & data) |
| 🟡 Medium | 6 (Bugs & logic) |
| 🔵 Low | 7 (Style & duplication) |

---

## 🔴 Critical / 严重

### C1 — 5 XSS Injection Points (innerHTML without escaping)

All user-entered text fields are concatenated directly into `innerHTML` strings without any sanitization, allowing script injection.

| File | Line | Field |
|------|------|-------|
| `tab-cardio.js` | 20 | `e.note` (cardio note 有氧备注) |
| `tab-strength.js` | 22 | `e.exercise` (exercise name 动作名称) |
| `tab-strength.js` | 48 | `getMissed()[dd]` (break note 断签说明) |
| `tab-strength.js` | 132, 245 | `ex.exercise` (plan editor 计划编辑器) |
| `tab-profile.js` | 24 | `r.note` (weight note 体重备注) |

**Fix:** Add an `escapeHtml()` function and wrap all user inputs before `innerHTML` concatenation.

---

## 🟠 High / 高危

### H1 — API No Authentication + Public Blobs

`api/data.mjs` — CORS `Access-Control-Allow-Origin: *` + `access: 'public'` + no authentication. Anyone who knows the endpoint URL can read/write all health data.

**Fix:** Add a simple token header check; change blob access to `private`.

### H2 — Blob Storage Unlimited Growth

`api/data.mjs:37` — Every PUT creates a new blob with `myhealth-sync-{timestamp}.json`. Old blobs are never deleted. Storage grows unbounded over time.

**Fix:** Delete old blobs before PUT, or use a fixed blob key with `addRandomSuffix: false`.

### H3 — setTheme No Null Check

`utils.js:81` — `document.getElementById('themeToggle').textContent` has no null guard. If the HTML element is missing, the app crashes entirely.

**Fix:** Add `if (!el) return;` guard.

---

## 🟡 Medium / 中危

### M1 — Battle HP Bar Denominator Wrong

`tab-game.js:194` — Player HP percentage uses `player.currentHP + enemy.maxHP` as denominator, but should use player's max HP (which is never stored). The HP bar shrinks at an incorrect rate.

**Fix:** Store `playerMaxHP` in the battle object, use it as the denominator.

### M2 — Dead Code: Penalty Info Never Shows

`tab-game.js:282` — `info.penalty` is never defined in `_attrCalcInfo`. The condition `info.penalty > 0` is always false. The penalty warning text in the attribute info modal never appears.

**Fix:** Remove the dead branch or pass `permPenAtk + permPenDef` as the `penalty` key.

### M3 — NaN Weight Can Be Stored

`tab-profile.js:43` — Empty weight input → `parseFloat('')` returns `NaN`, which is stored directly. This corrupts the chart (division by zero in `linechart.js` when range=0).

**Fix:** Validate `isNaN(w) || w <= 0` before calling `addWt()`.

### M4 — Migration Runs After Initial Renders

`app.js:50-52` — `migrateOldData()` is called after `renderStr()/renderCar()/renderProf()/renderGame()`. Any migrated data is invisible until the next re-render.

**Fix:** Move `migrateOldData()` before the initial render calls.

### M5 — Flat-Line Chart Division by Zero

`linechart.js:34` — When 2+ weight values are identical, `range = max - min = 0`, causing `yv()` to return `NaN` for all positions, completely breaking the chart.

**Fix:** Use `range = Math.max(1, max - min)`.

### M6 — Sync Push/Pull Race Condition

`sync.js` — No mutual exclusion between `pushSync` (800ms debounced) and `pullSync` (120s interval). A pull may overwrite local changes while a push is in flight.

**Fix:** Add a `_syncPending` flag to prevent concurrent operations.

---

## 🔵 Low / 低危

### L1 — Workout Rest Timer Leak

`tab-strength.js:173` — Closing the workout overlay does not clear `_woTimer`. The interval continues to fire `showWoExercise()`, trying to update removed DOM.

### L2 — Consecutive Celebrate Animation Collision

`utils.js:72-74` — `celebrate()` generates `@keyframes cf0..cf29`. If called twice within 3500ms, animation names collide causing visual glitches.

### L3 — Heatmap Month Navigation Unbounded

`tab-strength.js:234` — Users can navigate to year 9999 or year -1. No upper/lower bound check.

### L4 — Code Duplication (7 clusters)

- Week-start date calculation: ×3 (`getWeekStr`, `getWeekCar`, `getWeekDays`)
- Date navigation (prev/next/today): ×2 (strength + cardio event handlers)
- `getStr`/`getCar` data accessors: near-identical pattern
- `addStr`/`addCar` mutators: near-identical pattern
- `hasItems`/`hasKeys` validators: ×2 (in `sync.js`)
- Data shape normalization: ×2 (server → local mapping)
- Modal overlay pattern: ×7+ (create div, append to body, click-outside-to-close)

### L5 — Coding Style Inconsistency

- `var`/`let`/`const` severely mixed across files
- Arrow functions vs. function declarations used inconsistently
- `data.mjs` uses ES modules (`import`/`export`) — the only file to do so

### L6 — Toast Element Accumulation

`utils.js:63-66` — Multiple rapid toasts share a single `_tt` timer. Old DOM elements accumulate in the container until the final clear.

### L7 — Cardio Distance Float Precision Drift

`tab-cardio.js:44-45` — Distance steps by ±0.5. Repeated increments may cause floating-point drift (e.g., 1.0000000000000002).

---

## Fix Priority / 修复优先级

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| C1 | 5 XSS injection points | 5 files | Small — add escapeHtml() |
| H1 | API no authentication | data.mjs | Small — add token check |
| H2 | Blob unlimited growth | data.mjs | Small — fixed key or cleanup |
| H3 | setTheme null check | utils.js:81 | Small — add guard |
| M1 | Battle HP bar wrong | tab-game.js:194 | Small — store maxHP |
| M2 | Dead penalty code | tab-game.js:282 | Small — fix or remove |
| M3 | NaN weight accepted | tab-profile.js:43 | Small — validate input |
| M4 | Migration render order | app.js:50 | Small — reorder |
| M5 | Chart division by zero | linechart.js:34 | Small — Math.max(1, range) |
| M6 | Sync race condition | sync.js | Medium — add pending flag |

---

## Recommendations / 建议

**Immediate:** Fix XSS (5 injection points) + API auth + HP bar + NaN weight + chart div-by-zero

**Short-term:** Blob cleanup + migration order + sync lock + dead code removal

**Long-term:** Unify coding style (let/const), eliminate 7 duplications, add input validation layer

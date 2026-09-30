/* ============================================
   MyHealth — WP-G 角色等级系统（新系统，10 月实装）
   ============================================
   规格原文（`doc/2.2 修改-补充.md`「我的角色」段，逐字）：
     · 「现在增加等级概念，每训练10kg或者5min有氧运动可以获得1点经验，达到经验可以升级」
     · 「初始 lv1」 / 「每级需要经验：目标等级×10」
     · 「还会获得不同称号」 / 「记录至历史记录」
     · 「等级每季度清零一次，本周训练次数未达标，则扣除1000×未达标天数的经验」
       「本周训练达标，额外获得500经验」
     · 「等级效果（叠加）」26 档（lv10 ~ lv2100）→ 见下方 LEVEL_TIERS
     · 「lv 2000 …（玩家，敌群战斗效果为2倍）」
   口径补充（`doc/2.2 修改-补充.md` 裁决回执 #5）：「经验按**有效时长 / 有效容量**计；
     等级效果**均为基础属性**加成」。
   施工计划（`doc/plans/v2.2-施工计划.md` §WP-G）：「经验：每 10kg 容量 或 5min 有效时长
     （均按有效口径）= 1 点；等级：初始 lv1，升到下一级所需经验 = 目标等级 × 10；
     称号体系；每季度清零；本周训练未达标扣 1000×未达标天数 经验，达标额外 +500；
     等级效果（全部为基础属性，玩家/宠物分开，含 lv2000 玩家效果在敌群 ×2）」。

   ⚠️ 本文件是等级系统的**唯一数值来源**：升级公式、经验换算、26 档位、季度/周结算，
     其它模块一律读这里的常量/函数，别在调用点写死数字（同 SKILL_POINTS_PER_STAGE 的教训）。
   ⚠️ 本模块不依赖 DOM；UI 只产出 HTML 字符串，由 game-views.js / tab-profile.js 挂载。
   ============================================ */

/* ============ 数值唯一来源 ============ */

/* 经验来源：每 10kg **有效容量** 或 5min **有效时长** = 1 点经验 */
var LEVEL_EXP_VOL_PER_POINT = 10;   // kg 容量 / 1 点
var LEVEL_EXP_MIN_PER_POINT = 5;    // 有效分钟 / 1 点

/* 等级：初始 lv1；升到下一级所需经验 = 目标等级 × 10（目标等级 = 当前级 + 1） */
var LEVEL_START = 1;
var LEVEL_EXP_REQ_MULT = 10;

/* 周结算：本周「达标」天数 = 4 天。
   📌 依据（非发明）：`page/tab-strength.js:37` 的「本周」块以 `weekCount>=4` 显示「🏅 达标」，
     与旬标准的 6 天（`stats.js` calculatePeriodBonus）同形；扣除口径也照 calculatePeriodPenalty
     （missDays = 标准 − 达标天数）逐字实现。
   ⚠️ 文档只写「本周训练次数未达标 / 达标」，未给标准天数与结算时点 → 见报告「需裁决」。 */
var LEVEL_WEEK_STANDARD_DAYS = 4;
var LEVEL_WEEK_BONUS = 500;          // 达标：额外获得
var LEVEL_WEEK_MISS_PENALTY = 1000;  // 未达标：每天扣除

/* 历史记录条数上限（「记录至历史记录」） */
var LEVEL_HISTORY_MAX = 50;

/* 称号：文档只给了 lv1 的「健身勇士」（`page/game-views.js:61` 原有文案亦为此），
   其余档位称号文档未列 → 不发明，统一用基线称号；见报告「需裁决」。 */
var LEVEL_TITLE_BASE = '健身勇士';

/* 属性键（基础属性加成）与战斗修正键（百分比，非基础属性） */
var LEVEL_STAT_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef', 'spd'];
var LEVEL_MOD_KEYS = ['dmgDealtPct', 'dmgTakenPct'];

/* ============ 26 档位效果表（逐字取自 doc/2.2 修改-补充.md 第 86~111 行） ============
   lv 10 / 30 / 50 / 80 / 120 / 160 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900 /
   1000 / 1100 / 1200 / 1300 / 1400 / 1500 / 1600 / 1700 / 1800 / 1900 / 2000 / 2100
   = 26 档。`target` 区分「（玩家）/（宠物）」，效果**叠加**。
   `groupMult` = 敌群战斗里的额外倍率（文档对 lv2000 玩家档注明「敌群战斗效果为2倍」）。 */
var LEVEL_TIERS = [
  { lv: 10,   target: 'player', stats: { atk: 10 } },
  { lv: 30,   target: 'player', stats: { def: 8 } },
  { lv: 50,   target: 'player', stats: { soulAtk: 15 } },
  { lv: 80,   target: 'player', stats: { soulDef: 10 } },
  { lv: 120,  target: 'player', stats: { spd: 5 } },
  { lv: 160,  target: 'player', stats: { atk: 30, def: 20 } },
  { lv: 200,  target: 'player', stats: { soulAtk: 50, soulDef: 30 } },
  { lv: 300,  target: 'pet',    stats: { atk: 10, def: 8 } },
  { lv: 400,  target: 'pet',    stats: { soulAtk: 15, soulDef: 10 } },
  { lv: 500,  target: 'pet',    stats: { spd: 4 } },
  { lv: 600,  target: 'player', stats: { atk: 60, soulAtk: 60 } },
  { lv: 700,  target: 'player', stats: { def: 40, soulDef: 40 } },
  { lv: 800,  target: 'pet',    stats: { atk: 30, soulAtk: 30 } },
  { lv: 900,  target: 'pet',    stats: { def: 20, soulDef: 20 } },
  { lv: 1000, target: 'player', stats: { dmgDealtPct: 0.05 } },
  { lv: 1100, target: 'player', stats: { dmgTakenPct: 0.05 } },
  { lv: 1200, target: 'pet',    stats: { dmgDealtPct: 0.05 } },
  { lv: 1300, target: 'pet',    stats: { dmgTakenPct: 0.05 } },
  { lv: 1400, target: 'player', stats: { spd: 10 } },
  { lv: 1500, target: 'pet',    stats: { spd: 8 } },
  { lv: 1600, target: 'player', stats: { atk: 90, soulAtk: 90 } },
  { lv: 1700, target: 'player', stats: { def: 60, soulDef: 60 } },
  { lv: 1800, target: 'pet',    stats: { atk: 40, soulAtk: 40 } },
  { lv: 1900, target: 'pet',    stats: { def: 30, soulDef: 30 } },
  { lv: 2000, target: 'player', stats: { atk: 120, soulAtk: 120, def: 90, soulDef: 90 }, groupMult: 2 },
  { lv: 2100, target: 'pet',    stats: { atk: 40, soulAtk: 40, def: 30, soulDef: 30 } }
];
var LEVEL_TIER_COUNT = LEVEL_TIERS.length;      // = 26
var LEVEL_TIER_MAX = LEVEL_TIERS[LEVEL_TIER_COUNT - 1].lv;   // = 2100

/* 空加成（避免调用点写 {} 时缺键） */
function levelEmptyBonus() {
  var o = { hp: 0, atk: 0, def: 0, soulAtk: 0, soulDef: 0, spd: 0, dmgDealtPct: 0, dmgTakenPct: 0 };
  return o;
}

/* ============ 升级需求（纯函数） ============ */

/* 升到下一级所需经验 = 目标等级 × 10；level=1 → 20 */
function levelExpToNext(level) {
  var lv = Math.max(LEVEL_START, Math.floor(level || LEVEL_START));
  return (lv + 1) * LEVEL_EXP_REQ_MULT;
}

/* 从 lv1 累计升到 `level` 所需经验 = Σ_{k=2..level} k×10 = 10 × (level(level+1)/2 − 1) */
function levelCumExp(level) {
  var n = Math.max(LEVEL_START, Math.floor(level || LEVEL_START));
  return LEVEL_EXP_REQ_MULT * (n * (n + 1) / 2 - 1);
}

/* 经验 → 等级（等级由本季度累计经验**推导**，不单独存；季度清零 = 经验清零） */
function levelFromExp(exp) {
  var e = Math.max(0, Math.floor(exp || 0));
  var lv = LEVEL_START;
  var guard = 0;
  while (guard++ < 200000 && e >= levelCumExp(lv + 1)) lv++;
  return lv;
}

/* ============ 经验来源（有效口径） ============ */

/* 训练容量 → 经验：每 10kg 有效容量 1 点（向下取整） */
function levelExpFromVolume(vol) {
  var v = (typeof vol === 'number' && isFinite(vol)) ? vol : 0;
  return Math.floor(Math.max(0, v) / LEVEL_EXP_VOL_PER_POINT);
}
/* 有氧有效时长 → 经验：每 5min 有效时长 1 点（向下取整） */
function levelExpFromCardio(effMinutes) {
  var m = (typeof effMinutes === 'number' && isFinite(effMinutes)) ? effMinutes : 0;
  return Math.floor(Math.max(0, m) / LEVEL_EXP_MIN_PER_POINT);
}
/* 一批训练记录 → 经验：有效容量（动作 ratio 加权，sumVolume）+ 有效时长（强度加权，sumEffectiveDuration） */
function levelTrainingExp(strEntries, carEntries, exerciseMap, cardioTypeMap) {
  var vol = (typeof sumVolume === 'function') ? sumVolume(strEntries || [], exerciseMap) : 0;
  var eff = (typeof sumEffectiveDuration === 'function') ? sumEffectiveDuration(carEntries || [], cardioTypeMap) : 0;
  return levelExpFromVolume(vol) + levelExpFromCardio(eff);
}

/* ============ 季度 / 周键（幂等键） ============ */

/* 季度键 'YYYY-Qn'（n=1..4，自然季度）—— 幂等重置键，写法同 pet-store.js 的 monthlyKey */
function levelQuarterKey(now) {
  var d = now || new Date();
  return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
}
/* 本季度第一天（'YYYY-MM-DD'） */
function levelQuarterStart(now) {
  var d = now || new Date();
  var q = Math.floor(d.getMonth() / 3);
  return dateKey(new Date(d.getFullYear(), q * 3, 1));
}
/* 下一个季度键（展示「重置周期」用） */
function levelNextQuarterKey(now) {
  var d = now || new Date();
  var q = Math.floor(d.getMonth() / 3);
  return levelQuarterKey(new Date(d.getFullYear(), q * 3 + 3, 1));
}
/* 本周周一（'YYYY-MM-DD'）—— 与 challenge.js 的 getWeekKey() 同算法 */
function levelWeekStartKey(now) {
  var d = now || new Date();
  var dow = d.getDay();
  var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return dateKey(m);
}
function levelAddDays(key, n) {
  var p = String(key).split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/* ============ 存档（store 键 `level`；缺字段优雅退化） ============ */

function defaultLevelStore() {
  return {
    version: 1,
    quarterKey: null,     // 当前季度键（幂等重置）
    since: null,          // 启用日：迁移**不追溯补偿**，只统计启用日之后的训练
    weekKey: null,        // 当前的周键（跨周时把上一周结算掉）
    settledWeekKey: null, // 已结算的上一个完整周（幂等键）
    adjust: 0,            // 周奖惩累计（本季度内；季度清零时一并归零）
    lastLevel: LEVEL_START,
    history: []           // 历史记录（升级 / 季度重置 / 周结算）
  };
}

/* 注册 schema（store.js 的 `dh-<逻辑名>-v<n>` 约定；缺字段由 getLevelStore 兜底补齐） */
if (typeof store !== 'undefined' && store.registerSchema) {
  store.registerSchema('level', {
    version: 1,
    validate: function (v) { return v != null && typeof v === 'object' && !Array.isArray(v); },
    migrate: {}
  });
}

/* 读取等级存档。
   ⚠️ 旧存档迁移策略（与 `pet-store.js` 的 battlePicks 同款**优雅退化**）：
     缺字段一律补默认值、不报错、不补偿、不重算历史 —— 等级从 lv1 起
     （因为经验是「本季度内训练记录」推导出来的，`since` 之前的记录不追溯）。 */
function getLevelStore() {
  if (typeof store === 'undefined') return defaultLevelStore();
  var d = store.get('level');
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = defaultLevelStore();
  if (typeof d.quarterKey !== 'string' || !d.quarterKey) d.quarterKey = levelQuarterKey(new Date());
  if (typeof d.since !== 'string' || !d.since) d.since = dateKey(new Date());
  if (typeof d.weekKey !== 'string') d.weekKey = null;
  if (typeof d.settledWeekKey !== 'string') d.settledWeekKey = null;
  if (typeof d.adjust !== 'number' || !isFinite(d.adjust)) d.adjust = 0;
  if (typeof d.lastLevel !== 'number' || !isFinite(d.lastLevel)) d.lastLevel = LEVEL_START;
  if (!Array.isArray(d.history)) d.history = [];
  d.version = 1;
  return d;
}
function saveLevelStore(d) {
  if (typeof store === 'undefined' || !d) return false;
  return store.set('level', d);
}
function levelHistoryPush(d, entry) {
  if (!d || !entry) return;
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift(entry);
  if (d.history.length > LEVEL_HISTORY_MAX) d.history.length = LEVEL_HISTORY_MAX;
}

/* ============ 26 档位加成查询 ============ */

/* 某一级、某一目标（player/pet）已激活的档位加成合计（效果叠加）。
   opts.inGroup = true 时，带 groupMult 的档位按其倍率放大（lv2000 玩家档 = ×2）。 */
function levelStatBonus(level, target, opts) {
  opts = opts || {};
  var out = levelEmptyBonus();
  var lv = Math.max(LEVEL_START, Math.floor(level || LEVEL_START));
  for (var i = 0; i < LEVEL_TIERS.length; i++) {
    var t = LEVEL_TIERS[i];
    if (t.target !== target) continue;
    if (lv < t.lv) continue;
    var mul = (opts.inGroup && t.groupMult) ? t.groupMult : 1;
    for (var k in t.stats) {
      if (out[k] == null) continue;
      out[k] += t.stats[k] * mul;
    }
  }
  return out;
}
function playerLevelBonus(level, opts) { return levelStatBonus(level, 'player', opts); }
function petLevelBonus(level, opts) { return levelStatBonus(level, 'pet', opts); }

/* 把基础属性加成合并进一份战斗属性对象（就地修改并返回）：hp/atk/def/soulAtk/soulDef/spd */
function applyLevelStatBonus(stats, bonus) {
  if (!stats || !bonus) return stats;
  for (var i = 0; i < LEVEL_STAT_KEYS.length; i++) {
    var k = LEVEL_STAT_KEYS[i];
    if (bonus[k]) stats[k] = (stats[k] || 0) + bonus[k];
  }
  return stats;
}

/* 下一个未达成档位（展示「下个效果」用）；全达成返回 null */
function levelNextTier(level, target) {
  var lv = Math.max(LEVEL_START, Math.floor(level || LEVEL_START));
  for (var i = 0; i < LEVEL_TIERS.length; i++) {
    var t = LEVEL_TIERS[i];
    if (target && t.target !== target) continue;
    if (t.lv > lv) return t;
  }
  return null;
}

/* 档位效果文案（如「⚔️+120 👻+120 🛡️+90 🔮+90」） */
var LEVEL_STAT_LABEL = { hp: '❤️', atk: '⚔️', def: '🛡️', soulAtk: '👻', soulDef: '🔮', spd: '💨', dmgDealtPct: '💥', dmgTakenPct: '🛡' };
function levelTierText(tier) {
  if (!tier) return '';
  var parts = [];
  for (var k in tier.stats) {
    var v = tier.stats[k];
    var txt = (k === 'dmgDealtPct' || k === 'dmgTakenPct') ? Math.round(v * 100) + '%' : '+' + v;
    parts.push((LEVEL_STAT_LABEL[k] || k) + txt);
  }
  return parts.join(' ');
}

/* ============ 等级状态（读路径，纯读） ============ */

/* 经验统计窗口起点 = max(本季度第一天, 启用日) */
function levelWindowStart(d, now) {
  var qs = levelQuarterStart(now);
  var since = (d && d.since) ? d.since : qs;
  return since > qs ? since : qs;
}

/* 窗口内训练得到的原始经验（不含周奖惩） */
function levelRawExp(d, now) {
  var from = levelWindowStart(d, now);
  var strE = [], carE = [];
  if (typeof store !== 'undefined') {
    var s = store.get('strength') || {};
    var c = store.get('cardio') || {};
    strE = (s.entries || []).filter(function (e) { return e && e.date >= from; });
    carE = (c.entries || []).filter(function (e) { return e && e.date >= from; });
  }
  var exMap = (typeof getExerciseMap === 'function') ? getExerciseMap() : null;
  /* ⚠️ `getCardioTypeMap()` 由 utils.js 定义，但它内部依赖 app.js 的 `getCardioExercises()`。
     测试沙箱可能只加载 utils.js → 直接调用会 ReferenceError。
     故以「app.js 数据层是否就绪」（`getExerciseMap` 同为 app.js 提供）为唯一判据，
     未就绪则回落到 null（sumEffectiveDuration 会退回条目自带的 intensity）。 */
  var carMap = (typeof getExerciseMap === 'function' && typeof getCardioTypeMap === 'function')
    ? getCardioTypeMap() : null;
  return { from: from, exp: levelTrainingExp(strE, carE, exMap, carMap) };
}

function levelState(now) {
  now = now || new Date();
  var d = getLevelStore();
  var raw = levelRawExp(d, now);
  var total = Math.max(0, raw.exp + (d.adjust || 0));
  var level = levelFromExp(total);
  var cumNow = levelCumExp(level);
  var cumNext = levelCumExp(level + 1);
  return {
    level: level,
    title: LEVEL_TITLE_BASE,
    total: total,                     // 本季度累计经验（含周奖惩）
    raw: raw.exp,                     // 本季度训练经验
    adjust: d.adjust || 0,            // 周奖惩净额
    from: raw.from,                   // 统计窗口起点
    inLevel: total - cumNow,          // 本级已积累
    need: cumNext - cumNow,           // 本级所需（= 目标等级×10）
    nextExp: levelExpToNext(level),   // 同上（同一口径的别名）
    cum: cumNow,
    quarterKey: d.quarterKey,
    quarterStart: levelQuarterStart(now),
    weekKey: d.weekKey,
    settledWeekKey: d.settledWeekKey,
    since: d.since,
    history: (d.history || []).slice()
  };
}

/* ============ 周结算（幂等） ============ */

/* 某周内有训练记录的天数（周 = 周一 ~ 周日） */
function levelWeekActiveDays(weekKey) {
  if (!weekKey || typeof store === 'undefined') return 0;
  var end = levelAddDays(weekKey, 6);
  var days = {};
  var collect = function (entries) {
    (entries || []).forEach(function (e) {
      if (e && e.date >= weekKey && e.date <= end) days[e.date] = true;
    });
  };
  collect(((store.get('strength') || {}).entries || []));
  collect(((store.get('cardio') || {}).entries || []));
  return Object.keys(days).length;
}

/* 纯函数：按该周达标天数算经验增减（逐字实现文档口径）
   - 达标（activeDays >= 标准）→ +500
   - 未达标 → −1000 × 未达标天数（= 标准 − 达标天数） */
function levelSettleWeekDelta(activeDays) {
  var days = Math.max(0, Math.floor(activeDays || 0));
  var met = days >= LEVEL_WEEK_STANDARD_DAYS;
  var missDays = Math.max(0, LEVEL_WEEK_STANDARD_DAYS - days);
  if (met) return { met: true, activeDays: days, missDays: 0, delta: LEVEL_WEEK_BONUS };
  return { met: false, activeDays: days, missDays: missDays, delta: -LEVEL_WEEK_MISS_PENALTY * missDays };
}

/* 跨周时结算**上一个完整周**（幂等：settledWeekKey）。
   首次运行没有「上一周」→ 只记周键、不追溯结算（否则新档一进来就被倒扣）。 */
function settleLevelWeek(now) {
  now = now || new Date();
  var d = getLevelStore();
  var cur = levelWeekStartKey(now);
  if (d.weekKey === cur) return { ok: false, reason: '本周未跨周', weekKey: cur };
  var prev = d.weekKey;
  if (!prev) {
    d.weekKey = cur;
    saveLevelStore(d);
    return { ok: false, reason: '首次运行，跳过历史周结算', weekKey: cur };
  }
  if (d.settledWeekKey === prev) {
    d.weekKey = cur;
    saveLevelStore(d);
    return { ok: false, reason: '该周已结算', weekKey: prev };
  }
  var days = levelWeekActiveDays(prev);
  var r = levelSettleWeekDelta(days);
  d.adjust = (d.adjust || 0) + r.delta;
  d.settledWeekKey = prev;
  d.weekKey = cur;
  levelHistoryPush(d, {
    type: 'week', weekKey: prev, activeDays: r.activeDays, met: r.met,
    delta: r.delta, date: dateKey(now)
  });
  saveLevelStore(d);
  return { ok: true, weekKey: prev, activeDays: r.activeDays, met: r.met, delta: r.delta };
}

/* ============ 季度重置（幂等） ============ */

/* 等级每季度清零一次：经验归零（等级由经验推导 → 回到 lv1）、周奖惩归零、周键重置。
   幂等键 = `quarterKey`（同季度重复调用恒 ok:false，不重复结算）。 */
function resetLevelQuarter(now) {
  now = now || new Date();
  var d = getLevelStore();
  var cur = levelQuarterKey(now);
  if (d.quarterKey === cur) return { ok: false, reason: '本季度已重置', quarterKey: cur };
  d.quarterKey = cur;
  d.adjust = 0;              // 经验清零
  d.settledWeekKey = null;   // 新季度重新开始记周
  d.weekKey = null;
  d.lastLevel = LEVEL_START;
  levelHistoryPush(d, { type: 'quarter-reset', quarter: cur, date: dateKey(now) });
  saveLevelStore(d);
  return { ok: true, quarterKey: cur };
}

/* ============ 同步入口（季度重置 → 周结算 → 升级历史） ============ */

/* 幂等：同季度重复调用不会重复重置；同周重复调用不会重复结算。
   调用点：等级 UI 渲染前、开战前（见 game-views / tab-profile / game-render）。 */
function syncLevel(now) {
  now = now || new Date();
  var events = [];
  var q = resetLevelQuarter(now);
  if (q.ok) events.push('季度重置（' + q.quarterKey + '）');
  var w = settleLevelWeek(now);
  if (w.ok) events.push('周结算 ' + w.weekKey + ' → ' + (w.delta >= 0 ? '+' : '') + w.delta);
  var d = getLevelStore();
  var st = levelState(now);
  if (st.level !== d.lastLevel) {
    var prevLevel = d.lastLevel;
    levelHistoryPush(d, { type: 'level', level: st.level, from: prevLevel, date: dateKey(now) });
    d.lastLevel = st.level;
    saveLevelStore(d);
    events.push(st.level > prevLevel ? '升级到 lv' + st.level : '等级降至 lv' + st.level);
  }
  return { level: st.level, events: events, quarterReset: q.ok, weekSettled: w.ok };
}

/* ============ 战斗接线助手 ============ */

/* 敌群/单敌战斗：把玩家等级加成写进战斗属性（含 spd）；
   opts.inGroup = true → lv2000 玩家档 ×2（文档「敌群战斗效果为2倍」）。
   ⚠️ 落点：加在敌群继承（GROUP_INHERIT）**之后**，等级效果不打折 —— 见报告「需裁决」。 */
function applyPlayerLevelBonus(stats, opts) {
  if (!stats) return stats;
  var st = levelState();
  var b = playerLevelBonus(st.level, opts || {});
  return applyLevelStatBonus(stats, b);
}
/* 等级带来的战斗百分比修正（非基础属性）：造成伤害 / 受到伤害 */
function playerLevelMods(level) { return playerLevelBonus(level); }
function petLevelMods(level) { return petLevelBonus(level); }

/* 参战宠物的等级基础属性加成（必须在 boostPetForGroup 之前调用：等级效果属基础属性部分） */
function applyPetLevelBaseBonuses(units) {
  if (!units || !units.length) return units;
  var st = levelState();
  var b = petLevelBonus(st.level, {});
  units.forEach(function (u) {
    if (!u || !u.base) return;
    applyLevelStatBonus(u.base, b);
    if (u.base.hp != null) u.hp = u.base.hp;
    u._levelDmgDealtPct = b.dmgDealtPct || 0;
    u._levelDmgTakenPct = b.dmgTakenPct || 0;
  });
  return units;
}

/* 伤害结算时按等级百分比修正（普攻与技能同一入口）。
   只在单位带 `_levelDmgDealtPct` / `_levelDmgTakenPct` 时生效；不传 = 原值。 */
function levelDamageAdjust(actor, target, dmg) {
  var v = dmg;
  if (actor && actor._levelDmgDealtPct) v = Math.max(1, Math.floor(v * (1 + actor._levelDmgDealtPct)));
  if (target && target._levelDmgTakenPct) v = Math.max(1, Math.floor(v * (1 - target._levelDmgTakenPct)));
  return v;
}

/* ============ UI（只产出 HTML 字符串；字号/颜色一律走设计令牌） ============ */

function levelCardHtml(now) {
  var st = levelState(now);
  var pct = st.need > 0 ? Math.min(100, Math.round(st.inLevel / st.need * 100)) : 0;
  var pb = playerLevelBonus(st.level, {});
  var nb = levelNextTier(st.level, 'player');
  var h = ''
    + '<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:var(--r);padding:14px">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
    + '<span id="lvCardTitle" style="font-size:var(--fs-lg);font-weight:700">我的等级 · Lv ' + st.level + '</span>'
    + '<span style="font-size:var(--fs-xs);color:var(--text3)">' + st.title + '</span>'
    + '<span style="flex:1"></span>'
    + '<span style="font-size:var(--fs-3xs);color:var(--text3)">本季度 ' + st.quarterKey + '</span>'
    + '</div>'
    + '<div style="height:8px;background:var(--surface-3);border-radius:var(--rad-full);overflow:hidden" role="progressbar" aria-labelledby="lvCardTitle" aria-valuenow="' + st.inLevel + '" aria-valuemin="0" aria-valuemax="' + st.need + '">'
    + '<div style="height:100%;width:' + pct + '%;background:var(--brand-fill)"></div>'
    + '</div>'
    + '<div style="font-size:var(--fs-xs);color:var(--text2);margin-top:6px">经验 ' + st.inLevel + ' / ' + st.need
    + '（本季度累计 <b style="color:var(--text)">' + st.total + '</b>'
    + '＝训练 ' + st.raw + (st.adjust ? ' ' + (st.adjust >= 0 ? '+' : '') + st.adjust : '') + '）</div>'
    + '<div style="font-size:var(--fs-3xs);color:var(--text3);margin-top:4px;line-height:1.7">'
    + '换算：每 ' + LEVEL_EXP_VOL_PER_POINT + 'kg 有效容量 / 每 ' + LEVEL_EXP_MIN_PER_POINT + 'min 有效时长 = 1 点经验；'
    + '升到下一级需 ' + st.need + ' 经验（目标等级×' + LEVEL_EXP_REQ_MULT + '）<br>'
    + '重置：等级每季度清零一次（下个季度 ' + levelNextQuarterKey(now) + ' 起算）；'
    + '每周达标（≥' + LEVEL_WEEK_STANDARD_DAYS + ' 天）额外 +' + LEVEL_WEEK_BONUS + ' 经验，未达标每天 −' + LEVEL_WEEK_MISS_PENALTY + ' 经验'
    + '</div>'
    + '<div style="font-size:var(--fs-xs);color:var(--text2);margin-top:8px">已激活：'
    + (pb.atk || pb.def || pb.soulAtk || pb.soulDef || pb.spd || pb.dmgDealtPct || pb.dmgTakenPct
        ? '⚔️+' + pb.atk + ' 🛡️+' + pb.def + ' 👻+' + pb.soulAtk + ' 🔮+' + pb.soulDef + ' 💨+' + pb.spd
          + (pb.dmgDealtPct ? ' 💥+' + Math.round(pb.dmgDealtPct * 100) + '%' : '')
          + (pb.dmgTakenPct ? ' 🛡' + Math.round(pb.dmgTakenPct * 100) + '%' : '')
        : '暂无（首个档位 lv' + LEVEL_TIERS[0].lv + '）')
    + '</div>'
    + (nb ? '<div style="font-size:var(--fs-3xs);color:var(--text3);margin-top:4px">下一档位：lv' + nb.lv + '（' + (nb.target === 'player' ? '玩家' : '宠物') + '）' + levelTierText(nb) + '</div>' : '')
    + (st.history.length
        ? '<div style="font-size:var(--fs-3xs);color:var(--text3);margin-top:6px;line-height:1.7">历史记录：'
          + st.history.slice(0, 3).map(function (e) {
              if (e.type === 'quarter-reset') return e.date + ' 季度重置（' + e.quarter + '）';
              if (e.type === 'week') return e.date + ' 周结算 ' + (e.delta >= 0 ? '+' : '') + e.delta;
              return e.date + ' 等级 ' + e.from + ' → ' + e.level;
            }).join('<br>')
          + '</div>'
        : '')
    + '</div>';
  return h;
}

/* 一行摘要（挑战页「我的角色」卡用） */
function levelInlineText(now) {
  var st = levelState(now);
  return 'Lv ' + st.level + ' · ' + st.title;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.LEVEL_EXP_VOL_PER_POINT = LEVEL_EXP_VOL_PER_POINT;
  window.LEVEL_EXP_MIN_PER_POINT = LEVEL_EXP_MIN_PER_POINT;
  window.LEVEL_START = LEVEL_START;
  window.LEVEL_EXP_REQ_MULT = LEVEL_EXP_REQ_MULT;
  window.LEVEL_WEEK_STANDARD_DAYS = LEVEL_WEEK_STANDARD_DAYS;
  window.LEVEL_WEEK_BONUS = LEVEL_WEEK_BONUS;
  window.LEVEL_WEEK_MISS_PENALTY = LEVEL_WEEK_MISS_PENALTY;
  window.LEVEL_TIERS = LEVEL_TIERS;
  window.LEVEL_TIER_COUNT = LEVEL_TIER_COUNT;
  window.LEVEL_TIER_MAX = LEVEL_TIER_MAX;
  window.levelQuarterKey = levelQuarterKey;
  window.levelCumExp = levelCumExp;
  window.levelExpToNext = levelExpToNext;
  window.levelFromExp = levelFromExp;
  window.levelTrainingExp = levelTrainingExp;
  window.levelStatBonus = levelStatBonus;
  window.playerLevelBonus = playerLevelBonus;
  window.petLevelBonus = petLevelBonus;
  window.levelState = levelState;
  window.getLevelStore = getLevelStore;
  window.saveLevelStore = saveLevelStore;
  window.settleLevelWeek = settleLevelWeek;
  window.levelSettleWeekDelta = levelSettleWeekDelta;
  window.resetLevelQuarter = resetLevelQuarter;
  window.syncLevel = syncLevel;
  window.applyPlayerLevelBonus = applyPlayerLevelBonus;
  window.applyPetLevelBaseBonuses = applyPetLevelBaseBonuses;
  window.levelDamageAdjust = levelDamageAdjust;
  window.levelCardHtml = levelCardHtml;
  window.levelInlineText = levelInlineText;
}

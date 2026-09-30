#!/usr/bin/env node
/* v2.2 WP-G 测试：角色等级系统（`page/level-system.js`）
   规格：doc/2.2 修改-补充.md「我的角色」段 + doc/plans/v2.2-施工计划.md §WP-G
   覆盖：
     1) 升级边界（初始 lv1 / 目标等级×10 / 累计阈值）
     2) 经验来源换算（10kg 有效容量 / 5min 有效时长 = 1 点，ratio 与强度加权）
     3) 26 档位（逐档数值 + 上限 + 叠加）
     4) lv2000 玩家档「敌群战斗效果为 2 倍」
     5) 季度重置幂等（季度键）
     6) 周结算（达标 +500 / 未达标 −1000×天数）与幂等
     7) 旧存档迁移（缺字段优雅退化、迁移不追溯）
     8) 战斗接线守卫（源码级：落点/顺序/百分比通道）
   Run: node scripts/test-level-system.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

function makeStore() {
  const s = {
    _data: {},
    get(k) { return (k in s._data) ? s._data[k] : null; },
    set(k, v) { s._data[k] = v; return true; },
    registerSchema() {}
  };
  return s;
}

const files = ['utils.js', 'date-roll.js', 'stats.js', 'level-system.js'];
const sb = { Math, JSON, console, Date, parseInt, parseFloat, isFinite, Object, Array, String, Number };
sb.window = sb;
sb.store = makeStore();
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
const D = (y, m, d) => new Date(y, m - 1, d);

/* ============ 1. 升级边界（目标等级 × 10） ============ */
assert('初始等级 lv1', sb.LEVEL_START === 1, String(sb.LEVEL_START));
assert('升级需求倍率 = 10（目标等级×10）', sb.LEVEL_EXP_REQ_MULT === 10, String(sb.LEVEL_EXP_REQ_MULT));
assert('lv1 → lv2 需要 20 经验', sb.levelExpToNext(1) === 20, String(sb.levelExpToNext(1)));
assert('lv10 → lv11 需要 110 经验', sb.levelExpToNext(10) === 110, String(sb.levelExpToNext(10)));
assert('累计需求 lv1=0 / lv2=20 / lv3=50 / lv4=90',
  sb.levelCumExp(1) === 0 && sb.levelCumExp(2) === 20 && sb.levelCumExp(3) === 50 && sb.levelCumExp(4) === 90,
  [1, 2, 3, 4].map(n => sb.levelCumExp(n)).join(','));
assert('levelCumExp 与 levelExpToNext 口径一致（Σ 目标等级×10）',
  sb.levelCumExp(4) === sb.levelExpToNext(1) + sb.levelExpToNext(2) + sb.levelExpToNext(3),
  String(sb.levelCumExp(4)));
/* 边界：差 1 点不升级 */
assert('19 经验仍是 lv1', sb.levelFromExp(19) === 1, String(sb.levelFromExp(19)));
assert('20 经验 → lv2（边界命中）', sb.levelFromExp(20) === 2, String(sb.levelFromExp(20)));
assert('49 经验仍是 lv2', sb.levelFromExp(49) === 2, String(sb.levelFromExp(49)));
assert('50 经验 → lv3', sb.levelFromExp(50) === 3, String(sb.levelFromExp(50)));
assert('0 / 负数经验 = lv1', sb.levelFromExp(0) === 1 && sb.levelFromExp(-999) === 1);
assert('levelFromExp(levelCumExp(N)) === N（N=50/500/2100）',
  [50, 500, 2100].every(n => sb.levelFromExp(sb.levelCumExp(n)) === n),
  String(sb.levelFromExp(sb.levelCumExp(2100))));

/* ============ 2. 经验来源换算（有效口径） ============ */
assert('常量：每 10kg 容量 = 1 点', sb.LEVEL_EXP_VOL_PER_POINT === 10, String(sb.LEVEL_EXP_VOL_PER_POINT));
assert('常量：每 5min 有效时长 = 1 点', sb.LEVEL_EXP_MIN_PER_POINT === 5, String(sb.LEVEL_EXP_MIN_PER_POINT));
assert('容量换算：9kg→0 / 10kg→1 / 99kg→9',
  sb.levelExpFromVolume(9) === 0 && sb.levelExpFromVolume(10) === 1 && sb.levelExpFromVolume(99) === 9,
  [9, 10, 99].map(v => sb.levelExpFromVolume(v)).join(','));
assert('时长换算：4min→0 / 5min→1 / 12min→2',
  sb.levelExpFromCardio(4) === 0 && sb.levelExpFromCardio(5) === 1 && sb.levelExpFromCardio(12) === 2,
  [4, 5, 12].map(v => sb.levelExpFromCardio(v)).join(','));
/* 力量：100kg × 10 次 = 1000kg 有效容量 → 100 点 */
assert('训练记录换算：100kg×10 次 = 1000kg → 100 点',
  sb.levelTrainingExp([{ date: '2026-09-01', weight: 100, actualReps: 10 }], [], null, null) === 100,
  String(sb.levelTrainingExp([{ date: '2026-09-01', weight: 100, actualReps: 10 }], [], null, null)));
/* 有效容量 = 动作 ratio 加权（ratio 50% → 减半） */
assert('有效容量按动作 ratio 加权（50% → 50 点）',
  sb.levelTrainingExp([{ date: '2026-09-01', exercise: '卧推', weight: 100, actualReps: 10 }], [], { 卧推: { ratio: 50 } }, null) === 50,
  String(sb.levelTrainingExp([{ date: '2026-09-01', exercise: '卧推', weight: 100, actualReps: 10 }], [], { 卧推: { ratio: 50 } }, null)));
/* 有氧：有效时长 = 时长 × 强度（30min × 2 = 60 有效分钟 → 12 点） */
assert('有效时长按强度加权（30min×2 = 60 → 12 点）',
  sb.levelTrainingExp([], [{ date: '2026-09-01', duration: 30, intensity: 2 }], null, null) === 12,
  String(sb.levelTrainingExp([], [{ date: '2026-09-01', duration: 30, intensity: 2 }], null, null)));
assert('两来源相加（100 + 12 = 112）',
  sb.levelTrainingExp([{ date: '2026-09-01', weight: 100, actualReps: 10 }], [{ date: '2026-09-01', duration: 30, intensity: 2 }], null, null) === 112);
/* 无类型表时强度兜底 1（不产生 NaN） */
assert('强度缺失时兜底 1（30min → 6 点）',
  sb.levelTrainingExp([], [{ date: '2026-09-01', duration: 30 }], null, null) === 6,
  String(sb.levelTrainingExp([], [{ date: '2026-09-01', duration: 30 }], null, null)));

/* ============ 3. 26 档位 ============ */
assert('档位总数 = 26（doc 逐条列出）', sb.LEVEL_TIER_COUNT === 26, String(sb.LEVEL_TIER_COUNT));
assert('档位等级序列 = doc 原话（10 … 2100）',
  sb.LEVEL_TIERS.map(t => t.lv).join(',') === '10,30,50,80,120,160,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600,1700,1800,1900,2000,2100',
  sb.LEVEL_TIERS.map(t => t.lv).join(','));
assert('档位上限 = 2100', sb.LEVEL_TIER_MAX === 2100, String(sb.LEVEL_TIER_MAX));
/* 逐档数值核对（与 doc 表格逐字一致） */
const DOC_TIERS = [
  [10, 'player', { atk: 10 }], [30, 'player', { def: 8 }], [50, 'player', { soulAtk: 15 }],
  [80, 'player', { soulDef: 10 }], [120, 'player', { spd: 5 }], [160, 'player', { atk: 30, def: 20 }],
  [200, 'player', { soulAtk: 50, soulDef: 30 }], [300, 'pet', { atk: 10, def: 8 }],
  [400, 'pet', { soulAtk: 15, soulDef: 10 }], [500, 'pet', { spd: 4 }],
  [600, 'player', { atk: 60, soulAtk: 60 }], [700, 'player', { def: 40, soulDef: 40 }],
  [800, 'pet', { atk: 30, soulAtk: 30 }], [900, 'pet', { def: 20, soulDef: 20 }],
  [1000, 'player', { dmgDealtPct: 0.05 }], [1100, 'player', { dmgTakenPct: 0.05 }],
  [1200, 'pet', { dmgDealtPct: 0.05 }], [1300, 'pet', { dmgTakenPct: 0.05 }],
  [1400, 'player', { spd: 10 }], [1500, 'pet', { spd: 8 }],
  [1600, 'player', { atk: 90, soulAtk: 90 }], [1700, 'player', { def: 60, soulDef: 60 }],
  [1800, 'pet', { atk: 40, soulAtk: 40 }], [1900, 'pet', { def: 30, soulDef: 30 }],
  [2000, 'player', { atk: 120, soulAtk: 120, def: 90, soulDef: 90 }],
  [2100, 'pet', { atk: 40, soulAtk: 40, def: 30, soulDef: 30 }]
];
let tierBad = [];
DOC_TIERS.forEach(function (t, i) {
  const got = sb.LEVEL_TIERS[i];
  if (!got || got.lv !== t[0] || got.target !== t[1] || JSON.stringify(got.stats) !== JSON.stringify(t[2])) {
    tierBad.push('#' + i + ' 期望 ' + JSON.stringify(t) + ' 实得 ' + JSON.stringify(got));
  }
});
assert('26 档数值与 doc 表格逐字一致', tierBad.length === 0, tierBad.slice(0, 3).join(' | '));
/* 档位是「达到即激活」，且叠加 */
assert('lv9 无任何档位加成', sb.playerLevelBonus(9).atk === 0 && sb.playerLevelBonus(9).def === 0);
assert('lv10 激活首个档位（攻+10）', sb.playerLevelBonus(10).atk === 10);
assert('lv200 玩家档叠加（攻+40 防+28 魂攻+65 魂防+40 速+5）',
  (function () {
    const b = sb.playerLevelBonus(200);
    return b.atk === 40 && b.def === 28 && b.soulAtk === 65 && b.soulDef === 40 && b.spd === 5;
  })(), JSON.stringify(sb.playerLevelBonus(200)));
assert('玩家/宠物档分开（lv300 宠物档不给玩家）',
  sb.playerLevelBonus(300).atk === 40 && sb.petLevelBonus(300).atk === 10,
  'player=' + sb.playerLevelBonus(300).atk + ' pet=' + sb.petLevelBonus(300).atk);
assert('lv2100 宠物档累计（攻 +120 魂攻 +125 防 +88 魂防 +90 速 +12）',
  (function () {
    const b = sb.petLevelBonus(2100);
    return b.atk === 120 && b.soulAtk === 125 && b.def === 88 && b.soulDef === 90 && b.spd === 12;
  })(), JSON.stringify(sb.petLevelBonus(2100)));
assert('lv1000/1100 百分比效果落在修正键上（各 5%）',
  sb.playerLevelBonus(1100).dmgDealtPct === 0.05 && sb.playerLevelBonus(1100).dmgTakenPct === 0.05);
assert('档位上限后不再增长（lv2100 与 lv9999 相同）',
  JSON.stringify(sb.playerLevelBonus(2100)) === JSON.stringify(sb.playerLevelBonus(9999)));

/* ============ 4. lv2000 玩家档：敌群战斗效果为 2 倍 ============ */
const lv2000 = sb.playerLevelBonus(2000);
const lv2000G = sb.playerLevelBonus(2000, { inGroup: true });
assert('lv2000 玩家档普通口径（攻 +310，含累计）', lv2000.atk === 310, String(lv2000.atk));
assert('★ 敌群口径：仅 lv2000 档 ×2（攻 310 → 430）', lv2000G.atk === 310 + 120, String(lv2000G.atk));
assert('敌群口径：防御 218 → 308', lv2000.def === 218 && lv2000G.def === 308, lv2000.def + ' → ' + lv2000G.def);
assert('敌群口径：魂攻 335 → 455', lv2000.soulAtk === 335 && lv2000G.soulAtk === 455, lv2000.soulAtk + ' → ' + lv2000G.soulAtk);
assert('敌群口径：魂防 230 → 320', lv2000.soulDef === 230 && lv2000G.soulDef === 320, lv2000.soulDef + ' → ' + lv2000G.soulDef);
assert('敌群 ×2 不外溢到其它档位（速度 15 不变）', lv2000.spd === 15 && lv2000G.spd === 15);
assert('敌群 ×2 仅 lv2000 档拥有（宠物档无 groupMult）',
  sb.LEVEL_TIERS.filter(t => t.groupMult).length === 1 && sb.LEVEL_TIERS.filter(t => t.groupMult)[0].lv === 2000);

/* ============ 5. 季度重置（幂等） ============ */
assert('季度键 = 自然季度 YYYY-Qn',
  sb.levelQuarterKey(D(2026, 1, 15)) === '2026-Q1' && sb.levelQuarterKey(D(2026, 4, 1)) === '2026-Q2'
  && sb.levelQuarterKey(D(2026, 12, 31)) === '2026-Q4',
  [sb.levelQuarterKey(D(2026, 1, 15)), sb.levelQuarterKey(D(2026, 12, 31))].join(','));
sb.store._data['level'] = {
  version: 1, quarterKey: '2026-Q3', since: '2026-07-01', weekKey: null,
  settledWeekKey: null, adjust: 5000, lastLevel: 12, history: []
};
assert('同季度调用 → 不重置（幂等）', sb.resetLevelQuarter(D(2026, 9, 15)).ok === false);
assert('同季度重复调用 3 次仍只算未重置',
  (function () {
    for (let i = 0; i < 3; i++) { if (sb.resetLevelQuarter(D(2026, 9, 15)).ok) return false; }
    return sb.getLevelStore().adjust === 5000;
  })());
const rst = sb.resetLevelQuarter(D(2026, 10, 2));
assert('跨季度 → 触发一次重置', rst.ok === true && rst.quarterKey === '2026-Q4', JSON.stringify(rst));
assert('季度重置后经验/等级清零（adjust=0 → lv1）',
  sb.getLevelStore().adjust === 0 && sb.levelState(D(2026, 10, 2)).level === 1,
  'adjust=' + sb.getLevelStore().adjust + ' lv=' + sb.levelState(D(2026, 10, 2)).level);
const rst2 = sb.resetLevelQuarter(D(2026, 10, 20));
assert('★ 同季度再调用不重复结算（幂等键 = quarterKey）', rst2.ok === false, JSON.stringify(rst2));
assert('季度重置写入历史记录',
  sb.getLevelStore().history.some(h => h.type === 'quarter-reset' && h.quarter === '2026-Q4'));

/* ============ 6. 周结算（达标 +500 / 未达标 −1000×天数） ============ */
assert('标准 4 天 / 达标 +500 / 未达标每天 −1000',
  sb.LEVEL_WEEK_STANDARD_DAYS === 4 && sb.LEVEL_WEEK_BONUS === 500 && sb.LEVEL_WEEK_MISS_PENALTY === 1000);
assert('达标（4 天 / 5 天）→ +500',
  sb.levelSettleWeekDelta(4).delta === 500 && sb.levelSettleWeekDelta(5).met === true,
  JSON.stringify(sb.levelSettleWeekDelta(4)));
assert('未达标 3 天 → −1000（1 天缺口）',
  sb.levelSettleWeekDelta(3).delta === -1000 && sb.levelSettleWeekDelta(3).missDays === 1,
  JSON.stringify(sb.levelSettleWeekDelta(3)));
assert('未达标 0 天 → −4000（4 天缺口）',
  sb.levelSettleWeekDelta(0).delta === -4000 && sb.levelSettleWeekDelta(0).missDays === 4,
  JSON.stringify(sb.levelSettleWeekDelta(0)));
/* 跨周结算：上一周（2026-08-31 起）有 4 天训练 → +500，且只结算一次 */
sb.store._data['level'] = {
  version: 1, quarterKey: '2026-Q3', since: '2026-08-01', weekKey: '2026-08-31',
  settledWeekKey: null, adjust: 0, lastLevel: 1, history: []
};
sb.store._data['strength'] = { entries: [
  { date: '2026-09-01', weight: 10, actualReps: 1 }, { date: '2026-09-02', weight: 10, actualReps: 1 },
  { date: '2026-09-03', weight: 10, actualReps: 1 }, { date: '2026-09-04', weight: 10, actualReps: 1 }
] };
sb.store._data['cardio'] = { entries: [] };
const w1 = sb.settleLevelWeek(D(2026, 9, 7));
assert('跨周结算上一周：4 天 → +500', w1.ok === true && w1.delta === 500 && w1.activeDays === 4, JSON.stringify(w1));
assert('周结算幂等：同周重复调用不再结算', sb.settleLevelWeek(D(2026, 9, 8)).ok === false);
assert('周结算已落到 adjust', sb.getLevelStore().adjust === 500, String(sb.getLevelStore().adjust));
assert('周结算写入历史记录', sb.getLevelStore().history.some(h => h.type === 'week' && h.delta === 500));
/* 未达标的一周 → 扣 1000×缺口 */
sb.store._data['level'] = {
  version: 1, quarterKey: '2026-Q3', since: '2026-08-01', weekKey: '2026-08-31',
  settledWeekKey: null, adjust: 0, lastLevel: 1, history: []
};
sb.store._data['strength'] = { entries: [{ date: '2026-09-01', weight: 10, actualReps: 1 }] };
const w2 = sb.settleLevelWeek(D(2026, 9, 7));
assert('未达标一周（1 天）→ 扣 1000×3 = −3000', w2.ok === true && w2.delta === -3000 && w2.activeDays === 1,
  JSON.stringify(w2));
assert('未达标结算同样写入 adjust 与历史',
  sb.getLevelStore().adjust === -3000 && sb.getLevelStore().history.some(h => h.type === 'week' && h.delta === -3000),
  String(sb.getLevelStore().adjust));

/* ============ 7. 旧存档迁移（缺字段优雅退化 / 不追溯） ============ */
sb.store._data = {};
const fresh = sb.getLevelStore();
assert('无 level 键 → 默认档（lv1 / 经验 0）',
  fresh.version === 1 && fresh.adjust === 0 && fresh.lastLevel === 1 && Array.isArray(fresh.history),
  JSON.stringify(fresh));
assert('无 level 键 → quarterKey / since 自动补齐',
  typeof fresh.quarterKey === 'string' && /-Q[1-4]$/.test(fresh.quarterKey) && /^\d{4}-\d{2}-\d{2}$/.test(fresh.since),
  fresh.quarterKey + ' / ' + fresh.since);
sb.store._data['level'] = { lastLevel: 7 };   // 只有部分旧字段
const partial = sb.getLevelStore();
assert('残缺档 → 缺失字段全部补齐（不抛错）',
  typeof partial.quarterKey === 'string' && typeof partial.since === 'string' && partial.adjust === 0
  && partial.weekKey === null && Array.isArray(partial.history),
  JSON.stringify(partial));
sb.store._data['level'] = { adjust: 'NaN*', history: 'oops', lastLevel: null, version: 99 };
const dirty = sb.getLevelStore();
assert('污染档 → 数值/数组字段归一化',
  dirty.adjust === 0 && Array.isArray(dirty.history) && dirty.lastLevel === 1, JSON.stringify(dirty));
/* 迁移不追溯：since 之前的训练不计经验 */
sb.store._data['level'] = { version: 1, quarterKey: '2026-Q3', since: '2026-09-10', weekKey: null, settledWeekKey: null, adjust: 0, lastLevel: 1, history: [] };
sb.store._data['strength'] = { entries: [
  { date: '2026-09-01', weight: 1000, actualReps: 10 },   // 启用日前 → 不计
  { date: '2026-09-12', weight: 100, actualReps: 10 }     // 启用日后 → 100 点
] };
sb.store._data['cardio'] = { entries: [] };
const migrated = sb.levelState(D(2026, 9, 15));
assert('★ 迁移不追溯：since 之前的训练不计经验（只算 100 点 → lv4）',
  migrated.raw === 100 && migrated.level === 4, 'raw=' + migrated.raw + ' lv=' + migrated.level);
assert('窗口起点 = max(季度首日, 启用日)', migrated.from === '2026-09-10', migrated.from);
assert('本级进度 = 累计 − 本级阈值（100 − 90 = 10）', migrated.inLevel === 10, String(migrated.inLevel));
assert('本级需求 = 目标等级×10（lv4 → lv5 = 50）', migrated.need === 50, String(migrated.need));

/* ============ 8. 战斗接线守卫（源码级） ============ */
const gr = src('game-render.js');
assert('敌群开战接线：playerLevelBonus(…,{inGroup:true}) 落点存在',
  /playerLevelBonus\(levelState\(\)\.level,\{inGroup:true\}\)/.test(gr));
assert('敌群开战前调用 syncLevel（季度/周结算）', /startGroupTrial[\s\S]{0,900}syncLevel\(\)/.test(gr));
assert('玩家百分比通道挂到单位字段',
  gr.indexOf('player._levelDmgDealtPct=') >= 0 && gr.indexOf('player._levelDmgTakenPct=') >= 0);
const bg = src('battle-group.js');
assert('战斗伤害结算消费 levelDamageAdjust（普攻 + 技能各 1 处）',
  (bg.match(/levelDamageAdjust\(/g) || []).length === 2, String((bg.match(/levelDamageAdjust\(/g) || []).length));
assert('普攻落点在伤害公式之后',
  bg.indexOf('var dmg = Math.max(1, atkVal -') < bg.indexOf('levelDamageAdjust(actor, target, dmg)'));
/* 事实来源：函数定义在 level-system.js */
assert('levelDamageAdjust 定义在 level-system.js', /function levelDamageAdjust\(/.test(src('level-system.js')));
const ps = src('pet-store.js');
assert('宠物档接线：applyPetLevelBaseBonuses 在唯一入口 buildGroupBattlePets 内',
  ps.indexOf('applyPetLevelBaseBonuses(units)') > ps.indexOf('function buildGroupBattlePets'));
/* ⚠️ 必须限定在 buildGroupBattlePets 函数体内比对 —— petStatBreakdown 里另有一处
   `boostPetForGroup(u)`（更早出现），否则这条守卫会拿错落点（本项目 PITFALL-11 同款坑）。 */
const iBuild = ps.indexOf('function buildGroupBattlePets');
assert('★ 顺序守卫：宠物等级加成排在稀有度放大（boostPetForGroup）之前',
  iBuild >= 0 && ps.indexOf('applyPetLevelBaseBonuses(units)', iBuild) > iBuild
  && ps.indexOf('applyPetLevelBaseBonuses(units)', iBuild) < ps.indexOf('boostPetForGroup(u)', iBuild),
  ps.indexOf('applyPetLevelBaseBonuses(units)', iBuild) + ' vs ' + ps.indexOf('boostPetForGroup(u)', iBuild));
assert('单敌接线：buildBattleSides 走 applyPlayerLevelBonus', /applyPlayerLevelBonus\(stats,\{\}\)/.test(src('battle.js')));
/* UI 接线 */
assert('挑战页「我的角色」不再写死 Lv 1', src('game-views.js').indexOf('>Lv 1 · 健身勇士<') < 0);
assert('挑战页读 levelState() 显示等级', /levelState\(\)/.test(src('game-views.js')));
assert('个人页挂载等级卡（levelCardHtml）', /levelCardHtml\(\)/.test(src('tab-profile.js')));
/* 展示层护栏：不得引入新字号/颜色硬编码 */
const lvSrc = src('level-system.js');
assert('等级 UI 无内联硬编码字号', !/font-size:\s*[0-9.]+(?:rem|px|em)/.test(lvSrc));
assert('等级 UI 无硬编码十六进制颜色', !/#[0-9a-fA-F]{3,6}\b/.test(lvSrc));
assert('等级卡包含等级/经验/重置周期三项',
  (function () {
    const h = sb.levelCardHtml(D(2026, 9, 15));
    return /Lv \d+/.test(h) && h.indexOf('经验') >= 0 && h.indexOf('季度') >= 0 && h.indexOf('每 10kg') >= 0;
  })());

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
/* v2.17 宠物等级（成熟期经验等级）—— 规格逐条断言。

   作者规格（逐字，本套件按同一口气断言）：
     · 成熟期以上开始累计；**所需经验 = 目标等级 × 100**
     · 获得经验 = 今日力量训练（kg）× 5 ／ 有氧训练（min）× 20
     · 随机分配给当前**最多 10 只**成熟期宠物，**每只最多 20%**
     · 今日触发挑战 → 额外 **本次伤害 × 1%**（同样最多 10 只 / 每只 20%）
     · 每级 +1% 基础属性，每属性最多 +50% 基础值、每只最高 50 级、每月清空、满级跳过
     · 增加的是**基础值（不计算加成）**，且需要**额外显示**

   本套件覆盖（任务书的 9 条）：
     [1] 升级曲线（目标级×100 / 累计 / 边界）      [2] 每日来源（力量 + 有氧）
     [3] 挑战来源（伤害×1%）                       [4] 20% 上限
     [5] 10 只上限                                 [6] 满级跳过
     [7] 月度清空幂等                              [8] 旧档迁移（优雅退化）
     [9] 等级加成只加基础（不进稀有度/宝珠/共鸣池）  [10] 连续调用不重复发放
     [11] 剩余经验如实丢弃并记账                     [12] 显示字段（等级 / 经验 / 等级提供的属性）

   Run: node scripts/test-pet-level.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 与 test-pet-bonus-stability.js 同一套沙箱与加载顺序（口径同源） */
function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const sb = { Math: M, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'stats.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js',
   'talent.js', 'skill.js', 'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js',
   'pets.js', 'pet-materials.js', 'pet-store.js', 'group-levels.js', 'pet-ui.js']
    .forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function head(t) { console.log('\n' + t); }

const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }

const NOW = new Date(2026, 9, 20, 10, 0, 0);      // 2026-10-20
const SB = makeSandbox(20261020);

/* 建一只成熟宠（可选覆盖字段） */
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
/* 一个干净存档：pets + 空账本（monthKey 已对齐当月 → 不会触发月度清空） */
function resetStore(sb, pets) {
  sb.store.set('pets', {
    version: 1, pets: pets, materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null,
    levelLedger: { monthKey: sb.monthKey(NOW), dayKey: null, dailyGranted: 0, challengeKeys: [], log: [] }
  });
  sb.store.set('strength', { entries: [] });
  sb.store.set('cardio', { entries: [] });
}
function todayKey(sb, d) { return sb.dateKey(d || NOW); }

/* ============================================================
   [1] 升级曲线：所需经验 = 目标等级 × 100
   ============================================================ */
head('[1] 升级曲线（所需经验 = 目标等级 × 100）');
{
  const sb = SB;
  assert('常量：最高 50 级 / 每级 +1% / 上限 +50%',
    sb.PET_LEVEL_MAX === 50 && sb.PET_LEVEL_BONUS_PCT === 1 && sb.PET_LEVEL_BONUS_CAP_PCT === 50,
    sb.PET_LEVEL_MAX + '/' + sb.PET_LEVEL_BONUS_PCT + '/' + sb.PET_LEVEL_BONUS_CAP_PCT);
  assert('本级所需经验：lv1=100 / lv2=200 / lv50=5000',
    sb.petLevelStepExp(1) === 100 && sb.petLevelStepExp(2) === 200 && sb.petLevelStepExp(50) === 5000,
    [sb.petLevelStepExp(1), sb.petLevelStepExp(2), sb.petLevelStepExp(50)].join('/'));
  assert('累计经验：lv1=100 / lv2=300 / lv3=600 / lv50=127500',
    sb.petLevelCumExp(1) === 100 && sb.petLevelCumExp(2) === 300 && sb.petLevelCumExp(3) === 600 && sb.petLevelCumExp(50) === 127500,
    [1, 2, 3, 50].map(l => sb.petLevelCumExp(l)).join('/'));
  assert('经验→等级：0→lv0 / 99→lv0 / 100→lv1 / 299→lv1 / 300→lv2',
    sb.petLevelFromExp(0) === 0 && sb.petLevelFromExp(99) === 0 && sb.petLevelFromExp(100) === 1 &&
    sb.petLevelFromExp(299) === 1 && sb.petLevelFromExp(300) === 2,
    [0, 99, 100, 299, 300].map(e => sb.petLevelFromExp(e)).join('/'));
  assert('经验→等级：差值一步（lv49 门槛 122500 / lv50 门槛 127500）',
    sb.petLevelFromExp(127499) === 49 && sb.petLevelFromExp(127500) === 50,
    sb.petLevelFromExp(127499) + '/' + sb.petLevelFromExp(127500));
  assert('等级→加成%：lv0=0 / lv1=1 / lv10=10 / lv50=50 / 超上限仍 50',
    sb.petLevelBonusPct(0) === 0 && sb.petLevelBonusPct(1) === 1 && sb.petLevelBonusPct(10) === 10 &&
    sb.petLevelBonusPct(50) === 50 && sb.petLevelBonusPct(99) === 50);
  const p = mkPet(sb, 'waterdrop', { exp: 350 });
  const info = sb.petLevelInfo(p);
  assert('petLevelInfo（exp=350）：lv2 / 本级 50 / 下一级需 300 / 进度 17%',
    info.level === 2 && info.inLevel === 50 && info.need === 300 && info.pct === 17,
    JSON.stringify({ lv: info.level, inLevel: info.inLevel, need: info.need, pct: info.pct }));
  const p2 = mkPet(sb, 'waterdrop', { exp: sb.petLevelCumExp(50) + 99999 });
  const i2 = sb.petLevelInfo(p2);
  assert('满级封顶：exp 超出部分不再累计、need=0、pct=100',
    i2.level === 50 && i2.maxed === true && i2.need === 0 && i2.exp === sb.petLevelCumExp(50) && i2.pct === 100,
    JSON.stringify({ lv: i2.level, exp: i2.exp, need: i2.need, pct: i2.pct }));
}

/* ============================================================
   [2] 每日来源：今日力量容量（kg）×5 ＋ 今日有氧时长（min）×20
   ============================================================ */
head('[2] 每日来源（力量 kg×5 ＋ 有氧 min×20，按增量补发）');
{
  const sb = SB;
  const pets = [mkPet(sb, 'waterdrop'), mkPet(sb, 'sparkle'), mkPet(sb, 'pongpong'),
                mkPet(sb, 'flamechick'), mkPet(sb, 'rocksteady')];
  resetStore(sb, pets);
  const tk = todayKey(sb);
  sb.store.set('strength', { entries: [
    { date: tk, exercise: 'squat', weight: 100, actualReps: 10 },      // 1000 kg（ratio 100%）
    { date: '2026-10-19', exercise: 'squat', weight: 999, actualReps: 10 }  // 昨天 → 不算
  ] });
  sb.store.set('cardio', { entries: [
    { date: tk, type: 'run', duration: 30, intensity: 2 },             // 30 min（**原始分钟**，不乘强度）
    { date: '2026-10-19', type: 'run', duration: 99, intensity: 2 }
  ] });
  const basis = sb.petLevelTodayBasis(tk);
  assert('今日口径：只算今天（昨天 999kg / 99min 不计入）', basis.volume === 1000 && basis.minutes === 30,
    JSON.stringify({ volume: basis.volume, minutes: basis.minutes }));
  assert('换算：1000kg×5 + 30min×20 = 5000 + 600 = 5600 经验',
    basis.strengthExp === 5000 && basis.cardioExp === 600 && basis.exp === 5600,
    JSON.stringify(basis));
  const r1 = sb.syncPetLevelExp(NOW);
  assert('首次同步发放 5600（granted + dropped === total，经验守恒）',
    r1.total === 5600 && r1.granted + r1.dropped === 5600, JSON.stringify({ t: r1.total, g: r1.granted, d: r1.dropped }));
  const r2 = sb.syncPetLevelExp(NOW);
  assert('同一天再调一次：duplicate=true、发 0（幂等水印）',
    r2.duplicate === true && r2.total === 0 && r2.granted === 0, JSON.stringify(r2));
  /* 追加一次训练 → 只补差额 */
  const entries = sb.store.get('strength').entries.slice();
  entries.push({ date: tk, exercise: 'squat', weight: 50, actualReps: 10 });   // +500 kg → +2500 经验
  sb.store.set('strength', { entries: entries });
  const r3 = sb.syncPetLevelExp(NOW);
  assert('追加 500kg 后只补发 2500（差额 = 增量，不是再发一整天的量）',
    r3.duplicate === false && r3.total === 2500 && r3.basis.exp === 8100, JSON.stringify({ t: r3.total, b: r3.basis.exp }));
  /* 删记录（raw 变小）不会倒扣 / 不会重复发 */
  sb.store.set('strength', { entries: [] });
  const r4 = sb.syncPetLevelExp(NOW);
  assert('删掉力量记录后：不发也不倒扣（水印只升不降）',
    r4.duplicate === true && r4.total === 0 && sb.petLevelLedger().dailyGranted === 8100,
    JSON.stringify({ dup: r4.duplicate, t: r4.total, mark: sb.petLevelLedger().dailyGranted }));
}

/* ============================================================
   [3] 挑战来源：本次伤害 × 1%（每次结算发一次）
   ============================================================ */
head('[3] 挑战额外来源（本次伤害 × 1%）');
{
  const sb = SB;
  resetStore(sb, [mkPet(sb, 'waterdrop'), mkPet(sb, 'sparkle'), mkPet(sb, 'pongpong'),
                  mkPet(sb, 'flamechick'), mkPet(sb, 'rocksteady')]);
  const r1 = sb.grantPetLevelChallengeExp(123456, 'ch_run_1', NOW);
  assert('本次伤害 123456 × 1% = 1234 经验', r1.exp === 1234 && r1.total === 1234 && r1.duplicate === false,
    JSON.stringify({ exp: r1.exp, total: r1.total }));
  const r2 = sb.grantPetLevelChallengeExp(123456, 'ch_run_1', NOW);
  assert('同一个结算键再调一次：duplicate=true、发 0',
    r2.duplicate === true && r2.granted === 0 && r2.total === 0, JSON.stringify(r2));
  const r3 = sb.grantPetLevelChallengeExp(123456, 'ch_run_2', NOW);
  assert('**另一场**同样伤害的挑战照常发放（键不同 ≠ 同一场）',
    r3.duplicate === false && r3.exp === 1234, JSON.stringify({ dup: r3.duplicate, exp: r3.exp }));
  const r4 = sb.grantPetLevelChallengeExp(50, 'ch_run_3', NOW);
  assert('伤害×1% 取整为 0（50 → 0）：不发、但键已记账（不反复重算）',
    r4.exp === 0 && r4.granted === 0 && sb.petLevelLedger().challengeKeys.indexOf('ch_run_3') > -1,
    JSON.stringify({ exp: r4.exp, keys: sb.petLevelLedger().challengeKeys }));
  assert('账本 log 记录来源（daily / challenge）',
    sb.petLevelLedger().log.some(e => e.source === 'challenge'), JSON.stringify(sb.petLevelLedger().log));
}

/* ============================================================
   [4] 20% 上限（每只最多获得本次总量的 20%）
   ============================================================ */
head('[4] 每只最多 20%');
{
  const sb = SB;
  /* 10 只宠：总量 1000 → 每只上限 = 200 */
  const ten = ['waterdrop', 'sparkle', 'pongpong', 'flamechick', 'rocksteady',
               'chirpbird', 'thunderdog', 'possum', 'icecrystal', 'lightspirit'].map(id => mkPet(sb, id));
  const b1 = sb.petLevelAllocateBatch(1000, ten, sb.Math.random);
  const over = b1.amounts.filter(a => a > b1.cap);
  assert('10 只 / 总量 1000：cap = floor(1000×20%) = 200', b1.cap === 200, String(b1.cap));
  assert('每只都不超过 20% 上限', over.length === 0, JSON.stringify(b1.amounts));
  assert('10 只可吃满（10×20% = 200% ≥ 100%）：dropped = 0、granted = 1000',
    b1.dropped === 0 && b1.granted === 1000, JSON.stringify({ g: b1.granted, d: b1.dropped }));
  /* 1 只宠：只能吃 20%，其余 80% 丢弃 */
  const b2 = sb.petLevelAllocateBatch(1000, [ten[0]], sb.Math.random);
  assert('1 只 / 总量 1000：只发 200，其余 800 **如实丢弃**（不偷偷均摊）',
    b2.granted === 200 && b2.dropped === 800 && b2.amounts[0] === 200,
    JSON.stringify({ g: b2.granted, d: b2.dropped, a: b2.amounts }));
  /* 4 只：容量 800 < 1000 → 丢 200 */
  const b3 = sb.petLevelAllocateBatch(1000, ten.slice(0, 4), sb.Math.random);
  assert('4 只 / 总量 1000：容量 800 → 丢 200',
    b3.granted === 800 && b3.dropped === 200, JSON.stringify({ g: b3.granted, d: b3.dropped }));
  /* 极小总量：cap 取整为 0 → 全丢（不特例放水） */
  const b4 = sb.petLevelAllocateBatch(4, ten, sb.Math.random);
  assert('总量 4（cap=floor(0.8)=0）：整批丢弃、一笔不发', b4.granted === 0 && b4.dropped === 4 && b4.cap === 0,
    JSON.stringify({ g: b4.granted, d: b4.dropped, cap: b4.cap }));
}

/* ============================================================
   [5] 最多 10 只
   ============================================================ */
head('[5] 最多 10 只成熟期宠物');
{
  const sb = SB;
  const ids = ['waterdrop', 'sparkle', 'pongpong', 'flamechick', 'rocksteady', 'chirpbird',
               'thunderdog', 'possum', 'darkcrow', 'icecrystal', 'lightspirit', 'dream'];
  const pets = ids.map(id => mkPet(sb, id));
  const b = sb.petLevelAllocateBatch(10000, pets, sb.Math.random);
  assert('12 只可吃 → 只抽 10 只（picks.length = 10）', b.picks.length === 10 && b.amounts.length === 10,
    String(b.picks.length));
  const gotSet = new Set(b.picks.map(p => p.speciesId));
  assert('未被抽中的 2 只：一分经验都没有',
    pets.filter(p => !gotSet.has(p.speciesId)).every(p => !p.exp), 'some unlucky pet gained exp');
  /* 全量发出去（10×20% ≥ 100%）→ 宠上的 exp 总和 = 10000 */
  const sum = b.amounts.reduce((s, v) => s + v, 0);
  assert('抽中的 10 只合计 = 10000（granted 与 amounts 一致）', sum === 10000 && b.granted === 10000, String(sum));
  assert('业务常量唯一来源：PET_LEVEL_BATCH_MAX = 10', sb.PET_LEVEL_BATCH_MAX === 10);
  /* 成熟期不足 10 只时按实际只数发 */
  const b2 = sb.petLevelAllocateBatch(1000, pets.slice(0, 3), sb.Math.random);
  assert('只有 3 只可吃 → 只发 3 只（每只 ≤200，合计 600）',
    b2.picks.length === 3 && b2.granted === 600 && b2.dropped === 400, JSON.stringify({ g: b2.granted, d: b2.dropped }));
}

/* ============================================================
   [6] 满级跳过（lv50 不吃经验）+ 成熟期判定（阵亡 / 受伤排除）
   ============================================================ */
head('[6] 满级跳过 ＋ 成熟期判定');
{
  const sb = SB;
  const maxed = mkPet(sb, 'waterdrop', { exp: sb.petLevelCumExp(50) });
  const fresh = mkPet(sb, 'sparkle');
  const egg = mkPet(sb, 'pongpong', { stage: 'egg', hatchProgress: 10 });
  const grow = mkPet(sb, 'flamechick', { stage: 'grow', growth: 20 });
  const dead = mkPet(sb, 'rocksteady', { isDead: true });
  const hurt = mkPet(sb, 'chirpbird');
  sb.injurePet(hurt);
  resetStore(sb, [maxed, fresh, egg, grow, dead, hurt]);
  sb.petLevelSync(maxed);
  assert('满级宠物的 level = 50（由 exp 推导）', maxed.level === 50, String(maxed.level));
  const elig = sb.petLevelEligiblePets().map(p => p.speciesId);
  assert('可吃经验的只有 1 只（满级 / 蛋期 / 成长期 / 阵亡 / 受伤 全被排除）',
    elig.length === 1 && elig[0] === 'sparkle', JSON.stringify(elig));
  const b = sb.petLevelAllocateBatch(1000, [maxed, fresh, egg, grow, dead, hurt], sb.Math.random);
  assert('分配器同样跳过满级 / 未成熟 / 阵亡 / 受伤（picks=1 → 只发 200、丢 800）',
    b.picks.length === 1 && b.picks[0].speciesId === 'sparkle' && b.granted === 200 && b.dropped === 800,
    JSON.stringify({ picks: b.picks.map(p => p.speciesId), g: b.granted, d: b.dropped }));
  assert('满级宠物的 exp 经验不会被继续累加（仍等于 lv50 门槛）',
    maxed.exp === sb.petLevelCumExp(50), String(maxed.exp));
}

/* ============================================================
   [7] 月度清空幂等（同月只清一次）
   ============================================================ */
head('[7] 月度清空幂等');
{
  const sb = SB;
  const pets = [mkPet(sb, 'waterdrop', { exp: sb.petLevelCumExp(7) }), mkPet(sb, 'sparkle', { exp: sb.petLevelCumExp(3) })];
  pets.forEach(p => sb.petLevelSync(p));
  sb.store.set('pets', {
    version: 1, pets: pets, materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null,
    /* 上个月（2026-09）的键 → 本月第一次调用应清空 */
    levelLedger: { monthKey: sb.monthKey(new Date(2026, 8, 1)), dayKey: '2026-09-30', dailyGranted: 999, challengeKeys: [], log: [] }
  });
  assert('前置：两只宠有等级（lv7 / lv3）', pets[0].level === 7 && pets[1].level === 3,
    pets.map(p => p.level).join('/'));
  const r1 = sb.syncPetLevelMonth(NOW);
  assert('跨月第一次：清空执行（ok=true）', r1.ok === true && r1.cleared === 2, JSON.stringify(r1));
  assert('清空后：level=0、exp=0', pets.every(p => p.level === 0 && p.exp === 0),
    JSON.stringify(pets.map(p => ({ lv: p.level, exp: p.exp }))));
  assert('清空同时把当日水印归零（新月第一笔训练从头算）',
    sb.petLevelLedger().dailyGranted === 0 && sb.petLevelLedger().dayKey === null,
    JSON.stringify(sb.petLevelLedger()));
  /* 同月再调：一只都不碰 */
  pets[0].exp = sb.petLevelCumExp(5);
  sb.petLevelSync(pets[0]);
  const r2 = sb.syncPetLevelMonth(NOW);
  assert('同月第二次：ok=false（本月已清空）、**宠物一个字段都不动**',
    r2.ok === false && r2.reason === '本月已清空' && pets[0].level === 5, JSON.stringify({ r2, lv: pets[0].level }));
  /* 幂等闸门与「今日水印」互不影响：同月内重复 syncPetLevelExp 不会清等级 */
  sb.store.set('strength', { entries: [{ date: todayKey(sb), exercise: 'squat', weight: 10, actualReps: 10 }] });
  sb.syncPetLevelExp(NOW);
  const lvAfter = sb.petLevelInfo(pets[0]).level;
  sb.syncPetLevelExp(NOW); sb.syncPetLevelExp(NOW);
  assert('同月内多次同步经验：等级只涨不清（月闸门不会误触）',
    sb.petLevelInfo(pets[0]).level >= lvAfter && lvAfter > 0,
    lvAfter + ' → ' + sb.petLevelInfo(pets[0]).level);
}

/* ============================================================
   [8] 旧档迁移：缺 level / exp / levelLedger 时优雅退化
   ============================================================ */
head('[8] 旧档迁移（旧存档缺字段 → 优雅退化）');
{
  const sb = makeSandbox(777);
  const old = mkPet(sb, 'waterdrop');           // 没有 level / exp
  delete old.level; delete old.exp;
  sb.store.set('pets', {
    version: 1, pets: [old], materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null       // **没有 levelLedger**
  });
  const d = sb.getPetStore();
  assert('旧档：levelLedger 自动补齐（不迁移、不补偿）',
    d.levelLedger && d.levelLedger.dayKey === null && d.levelLedger.dailyGranted === 0 &&
    Array.isArray(d.levelLedger.challengeKeys) && Array.isArray(d.levelLedger.log),
    JSON.stringify(d.levelLedger));
  const info = sb.petLevelInfo(d.pets[0]);
  assert('旧档宠物：按 lv0 / 0 经验读（不抛错、不写字段）',
    info.level === 0 && info.exp === 0 && info.need === 100 && info.bonusPct === 0, JSON.stringify(info));
  assert('旧档宠物：level / exp 字段**没有被迁移写回**（仍缺失）',
    d.pets[0].level === undefined && d.pets[0].exp === undefined,
    JSON.stringify({ lv: d.pets[0].level, exp: d.pets[0].exp }));
  const bd = sb.petStatBreakdown(d.pets[0]);
  assert('旧档宠物：属性拆解照常可用，等级加成为 0', bd.ok === true && bd.levelPct === 0 &&
    STAT_KEYS.every(k => (bd.levelBonus[k] || 0) === 0), JSON.stringify(bd.levelBonus));
  const units = sb.buildGroupBattlePets([d.pets[0].speciesId], 4);
  assert('旧档宠物：建场照常（lv0 → 一个字节都不加）', units.length === 1 && units[0].base.hp > 0,
    JSON.stringify(units[0] && units[0].base));
  const z = sb.petLevelLedger({});             // 脏入参也不能炸
  assert('脏入参（空对象）→ 返回默认账本', z.monthKey === null && z.dailyGranted === 0);
}

/* ============================================================
   [9] 等级加成**只加基础**（不进稀有度 / 宝珠 / 共鸣的池）
   ============================================================ */
head('[9] 等级加成只加基础值（不参与其它加成）');
{
  const sb = SB;
  const codex = sb.getPetCodex('waterdrop');
  const p = mkPet(sb, 'waterdrop');            // R：稀有度池 1200%
  resetStore(sb, [p]);
  const bd0 = sb.petStatBreakdown(p);
  p.exp = sb.petLevelCumExp(10);               // lv10 → +10%
  sb.petLevelSync(p);
  const bd10 = sb.petStatBreakdown(p);
  assert('① 基础不变（等级不写进 base）',
    STAT_KEYS.every(k => bd0.base[k] === bd10.base[k]), JSON.stringify({ a: bd0.base, b: bd10.base }));
  assert('加成%：lv10 → +10%', bd10.levelPct === 10, String(bd10.levelPct));
  const expectHp = Math.floor(codex.base.hp * 10 / 100);   // 100 × 10% = 10
  assert('等级提供的生命 = floor(基础 100 × 10%) = 10（**不是** ×1200% 后的 120）',
    bd10.levelBonus.hp === expectHp && expectHp === 10, JSON.stringify({ got: bd10.levelBonus.hp, want: expectHp }));
  assert('最终 = 池后值 ＋ 等级加成（加在池**之后**，只加一次）',
    bd10.final.hp === bd10.poolFinal.hp + 10, JSON.stringify({ pool: bd10.poolFinal.hp, final: bd10.final.hp }));
  assert('对照：池后的值仍是「(基础＋凝聚) × 池%」（等级没被放大）',
    bd10.poolFinal.hp === bd0.poolFinal.hp && bd10.final.hp - bd0.final.hp === 10,
    JSON.stringify({ p0: bd0.poolFinal.hp, p10: bd10.poolFinal.hp, d0: bd0.final.hp, d10: bd10.final.hp }));
  assert('反证：若把 +10% 塞进池再乘 1200%，生命会变成 +120 —— 实际不是',
    bd10.final.hp - bd0.final.hp !== Math.floor(codex.base.hp * 0.1 * 12),
    JSON.stringify({ delta: bd10.final.hp - bd0.final.hp }));
  /* 凝聚的基数不含等级加成（作者：等级加成「不计算加成」→ 也不进别人的基数） */
  const view0 = sb.petBaseBonusView();
  p.exp = sb.petLevelCumExp(50); sb.petLevelSync(p);
  const view50 = sb.petBaseBonusView();
  assert('凝聚基数（成熟期基础之和）**不受等级影响**',
    STAT_KEYS.every(k => view0.matureBaseSum[k] === view50.matureBaseSum[k]),
    JSON.stringify({ a: view0.matureBaseSum, b: view50.matureBaseSum }));
  const bd50 = sb.petStatBreakdown(p);
  assert('lv50：+50% 封顶（每个属性最多 +50% 基础值）',
    bd50.levelPct === 50 && bd50.levelBonus.hp === Math.floor(codex.base.hp * 0.5) &&
    STAT_KEYS.every(k => bd50.levelBonus[k] === Math.floor((codex.base[k] || 0) * 0.5)),
    JSON.stringify(bd50.levelBonus));
  /* 实战建场与面板同一口径 */
  const units = sb.buildGroupBattlePets([p.speciesId], 4);
  assert('实战建场：单位 hp = 池后值 ＋ 等级加成（与面板 final 完全一致）',
    units.length === 1 && units[0].base.hp === bd50.final.hp,
    JSON.stringify({ unit: units[0] && units[0].base.hp, panel: bd50.final.hp }));
  const before = JSON.stringify(units[0].base);
  sb.applyPetExpLevelBonuses(units); sb.applyPetExpLevelBonuses(units);
  assert('同一批单位连续应用 3 次：属性**完全不变**（幂等，不就地累加）',
    JSON.stringify(units[0].base) === before, before + ' vs ' + JSON.stringify(units[0].base));
  assert('等级加项写在非枚举字段上（不进快照/日志）',
    JSON.stringify(units[0]).indexOf('_petLevelBonus') < 0 && units[0]._petLevelPct === 50,
    String(units[0]._petLevelPct));
  /* 速度也吃等级（「每个属性」），但不进池 */
  assert('速度：等级加成照加、百分比池仍是 ×100%',
    bd50.levelBonus.spd === Math.floor((codex.base.spd || 0) * 0.5) && bd50.poolPct.spd === 0,
    JSON.stringify({ bonus: bd50.levelBonus.spd, pool: bd50.poolPct.spd }));
}

/* ============================================================
   [10] 连续调用不重复发放（两条来源各 10 次）
   ============================================================ */
head('[10] 连续调用不重复发放');
{
  const sb = SB;
  const pets = ['waterdrop', 'sparkle', 'pongpong', 'flamechick', 'rocksteady'].map(id => mkPet(sb, id));
  resetStore(sb, pets);
  sb.store.set('strength', { entries: [{ date: todayKey(sb), exercise: 'squat', weight: 200, actualReps: 10 }] }); // 2000kg → 10000
  let dailyTotal = 0;
  for (let i = 0; i < 10; i++) dailyTotal += sb.syncPetLevelExp(NOW).total;
  assert('每日来源连调 10 次：只发一次 10000（其余 9 次为 0）', dailyTotal === 10000, String(dailyTotal));
  const expSum = sb.getPetStore().pets.reduce((s, p) => s + (p.exp || 0), 0);
  assert('宠物经验总和 = 10000（没有多发一倍）', expSum === 10000, String(expSum));
  let chTotal = 0;
  for (let i = 0; i < 10; i++) chTotal += sb.grantPetLevelChallengeExp(50000, 'ch_same_run', NOW).total;
  assert('挑战来源连调 10 次（同一个 runId）：只发一次 500（伤害×1%）', chTotal === 500, String(chTotal));
  const expSum2 = sb.getPetStore().pets.reduce((s, p) => s + (p.exp || 0), 0);
  assert('两次来源合计后宠物经验总和 = 10500', expSum2 === 10500, String(expSum2));
  assert('账本 log 只多了两条（daily 1 + challenge 1）',
    sb.petLevelLedger().log.filter(e => e.source === 'daily' || e.source === 'challenge').length === 2,
    JSON.stringify(sb.petLevelLedger().log.map(e => e.source)));
}

/* ============================================================
   [11] 剩余经验如实丢弃并记账（不偷偷均摊）
   ============================================================ */
head('[11] 剩余经验如实丢弃并记账');
{
  const sb = SB;
  const one = mkPet(sb, 'waterdrop');
  resetStore(sb, [one]);
  const r = sb.syncPetLevelExp(NOW);      // 没有训练 → 0
  assert('无训练量：一笔不发', r.total === 0 && r.granted === 0, JSON.stringify(r));
  sb.store.set('strength', { entries: [{ date: todayKey(sb), exercise: 'squat', weight: 100, actualReps: 10 }] }); // 1000kg → 5000 经验
  const r2 = sb.syncPetLevelExp(NOW);
  assert('只有 1 只成熟宠：发 1000（20%），其余 4000 **丢弃**',
    r2.total === 5000 && r2.granted === 1000 && r2.dropped === 4000,
    JSON.stringify({ t: r2.total, g: r2.granted, d: r2.dropped }));
  const log = sb.petLevelLedger().log.filter(e => e.source === 'daily').pop();
  assert('账本 log 如实记下丢弃量（dropped=4000，不是 0）', log && log.dropped === 4000 && log.granted === 1000,
    JSON.stringify(log));
  assert('宠物只拿到 1000（没有把 4000 偷偷均摊给它）', one.exp === 1000, String(one.exp));
  assert('granted + dropped === total（经验守恒）', r2.granted + r2.dropped === r2.total);
}

/* ============================================================
   [12] 显示：等级 / 经验进度 / **等级提供的属性**
   ============================================================ */
head('[12] 显示（详情页：等级、经验进度、等级提供的属性）');
{
  const sb = SB;
  const p = mkPet(sb, 'dream', { exp: sb.petLevelCumExp(12) + 500 });
  sb.petLevelSync(p);
  resetStore(sb, [p]);
  const html = sb.petLevelHtml(p, sb.petStatBreakdown(p));
  assert('详情区块含「宠物等级」标题', html.indexOf('宠物等级') > -1 && html.indexOf('Lv 12') > -1, html.slice(0, 80));
  assert('详情区块含经验进度（本级 / 下一级所需）', html.indexOf('经验 ') > -1 && html.indexOf('升级所需经验') > -1);
  assert('详情区块含「等级提供的属性」逐属性数值', html.indexOf('等级提供的属性') > -1 && html.indexOf('❤️') > -1);
  assert('详情区块含完整链路（基础 → ＋等级 → ＋凝聚 → ×加成合计 → 最终）',
    html.indexOf('＋等级') > -1 && html.indexOf('×加成合计') > -1 && html.indexOf('最终') > -1);
  assert('进度条带 role=progressbar 且 aria-labelledby 指向存在的 id',
    html.indexOf('role="progressbar"') > -1 && html.indexOf('id="petLvTitle"') > -1 &&
    html.indexOf('aria-labelledby="petLvTitle"') > -1);
  assert('只用既有设计令牌字号（没有内联 rem/px 字号）',
    !/font-size:\s*\d/.test(html) && html.indexOf('font-size:var(--fs-') > -1);
  const bd = sb.petStatBreakdown(p);
  assert('bd.level 提供 level / exp / inLevel / need / bonusPct（UI 只读这里）',
    bd.level.level === 12 && bd.level.bonusPct === 12 && bd.level.need === 1300 && bd.level.inLevel === 500,
    JSON.stringify(bd.level));
  assert('petBonusRow 也带等级字段（levelPct / levelBonus）', (function () {
    const row = sb.petBonusRow(bd, 'hp');
    return row.levelPct === 12 && row.levelBonus === bd.levelBonus.hp;
  })(), JSON.stringify(sb.petBonusRow(bd, 'hp')));
  /* 详情渲染入口真的接上了这一段（源码级守卫） */
  const uiSrc = load('pet-ui.js');
  assert('pet-ui.js：renderPetDetail 调用了 petLevelHtml',
    /h \+= petLevelHtml\(pet, bd\)/.test(uiSrc));
  assert('pet-ui.js：列表卡片显示等级（🏅 Lv）', uiSrc.indexOf('🏅 Lv') > -1);
  /* 不写 pet：拆解面板不能把 level / exp 写回去 */
  const snap = JSON.stringify(p);
  sb.petStatBreakdown(p); sb.petStatBreakdown(p);
  assert('petStatBreakdown 连续调用**不修改宠物**（level/exp 不被写）', JSON.stringify(p) === snap);
}

console.log('\n' + '─'.repeat(60));
console.log((fail === 0 ? '✅ ' : '❌ ') + 'test-pet-level：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/* v2.14.13 宠物经验发放记录（作者：「宠物经验获得也要记录」）—— 逐条断言。

   需求口径：
     · 每次发放写一条**可查看的记录**：来源（力量容量 kg / 有氧 min / 挑战伤害 ×1%）、
       总量、实际发放、分配到哪些宠物各多少、丢弃量
     · 存档落在**既有** store（`pets` → `levelLedger.log`），不新建第二套 truth
     · 记录不得重复计数（同日重复保存 / 挑战重入都幂等，沿用既有水位机制）
     · 面板「今日宠物经验明细」：默认折叠、顶部「今日合计 +X EXP」

   本套件覆盖（任务书 5 条）：
     [1] 一次训练后记录含正确来源与总量
     [2] 分配明细之和 ＋ 丢弃量 = 总量
     [3] 同日重复保存不重复记账
     [4] 挑战加成来源单独标记
     [5] 跨日重置明细

   Run: node scripts/test-pet-exp-log.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 与 test-pet-level.js 完全同一套沙箱与加载顺序（口径同源） */
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

function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
const DAY1 = new Date(2026, 9, 20, 10, 0, 0);   // 2026-10-20
const DAY2 = new Date(2026, 9, 21, 9, 0, 0);    // 2026-10-21（同月不同日）
const SB = makeSandbox(20261020);

function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
/* 干净存档：pets + 账本（monthKey 对齐当月 → 不触发月度清空；dayKey 空 → 第一笔从头算） */
function resetStore(sb, pets, now) {
  sb.store.set('pets', {
    version: 1, pets: pets, materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null,
    levelLedger: { monthKey: sb.monthKey(now || DAY1), dayKey: null, dailyGranted: 0,
                   strGranted: null, carGranted: null, challengeKeys: [], log: [] }
  });
  sb.store.set('strength', { entries: [] });
  sb.store.set('cardio', { entries: [] });
}
function tk(sb, d) { return sb.dateKey(d || DAY1); }
function sumAlloc(e) { return (e.allocations || []).reduce((s, a) => s + (a.amount || 0), 0); }
function todayEntries(sb, d) { return (sb.petLevelLedger().log || []).filter(e => e.date === tk(sb, d || DAY1)); }

/* ============================================================
   [1] 一次训练后：记录含正确来源与总量
   ============================================================ */
head('[1] 一次训练后的记录：来源 + 总量');
const FIVE = ['waterdrop', 'sparkle', 'pongpong', 'flamechick', 'rocksteady'];
{
  const sb = SB;
  resetStore(sb, FIVE.map(id => mkPet(sb, id)));
  sb.store.set('strength', { entries: [{ date: tk(sb), exercise: 'squat', weight: 100, actualReps: 10 }] }); // 1000kg
  sb.store.set('cardio', { entries: [{ date: tk(sb), type: 'run', duration: 30, intensity: 2 }] });         // 30min
  const r = sb.syncPetLevelExp(DAY1, sb.Math.random);
  assert('发放总量 = 1000kg×5 + 30min×20 = 5600', r.total === 5600, String(r.total));
  const log = todayEntries(sb, DAY1);
  assert('当日只写 1 条记录（source=daily）', log.length === 1 && log[0].source === 'daily',
    JSON.stringify(log.map(e => e.source)));
  const e = log[0];
  assert('记录里的总量 / 实发 / 丢弃与返回值一致',
    e.total === 5600 && e.granted === r.granted && e.dropped === r.dropped,
    JSON.stringify({ t: e.total, g: e.granted, d: e.dropped }));
  const bd = e.breakdown || [];
  const str = bd.find(b => b.source === 'strength');
  const car = bd.find(b => b.source === 'cardio');
  assert('来源拆分①力量：1000kg → 5000 EXP', !!str && str.kg === 1000 && str.exp === 5000, JSON.stringify(str));
  assert('来源拆分②有氧：30min → 600 EXP', !!car && car.min === 30 && car.exp === 600, JSON.stringify(car));
  assert('来源拆分之和 = 总量（5600）', bd.reduce((s, b) => s + b.exp, 0) === 5600,
    JSON.stringify(bd));
  assert('记录带 cap（单只 20% 上限）= floor(5600×20%) = 1120', e.cap === 1120, String(e.cap));
}

/* ============================================================
   [2] 分配明细之和 ＋ 丢弃量 = 总量（经验守恒，不偷偷均摊）
   ============================================================ */
head('[2] 分配明细之和 ＋ 丢弃量 = 总量');
{
  const sb = SB;
  /* 5 只：容量 5×1120 = 5600 = 总量 → 全部发出 */
  resetStore(sb, FIVE.map(id => mkPet(sb, id)));
  sb.store.set('strength', { entries: [{ date: tk(sb), exercise: 'squat', weight: 100, actualReps: 10 }] });
  sb.store.set('cardio', { entries: [{ date: tk(sb), type: 'run', duration: 30, intensity: 2 }] });
  sb.syncPetLevelExp(DAY1, sb.Math.random);
  const e5 = todayEntries(sb, DAY1)[0];
  assert('5 只：每只明细都有 speciesId / name / amount / from→to',
    e5.allocations.length === 5 && e5.allocations.every(a =>
      typeof a.speciesId === 'string' && typeof a.name === 'string' &&
      typeof a.amount === 'number' && typeof a.from === 'number' && typeof a.to === 'number'),
    JSON.stringify(e5.allocations));
  assert('5 只：明细之和 5600 ＋ 丢弃 0 = 总量 5600',
    sumAlloc(e5) === 5600 && e5.dropped === 0 && sumAlloc(e5) + e5.dropped === e5.total,
    JSON.stringify({ sum: sumAlloc(e5), d: e5.dropped, t: e5.total }));
  assert('每只都不超过 cap（20%）', e5.allocations.every(a => a.amount <= e5.cap),
    JSON.stringify({ cap: e5.cap, amounts: e5.allocations.map(a => a.amount) }));

  /* 1 只：只能吃 1000，其余 4000 如实丢弃 —— 明细里必须写得出这 4000 */
  resetStore(sb, [mkPet(sb, 'waterdrop')]);
  sb.store.set('strength', { entries: [{ date: tk(sb), exercise: 'squat', weight: 100, actualReps: 10 }] }); // 1000kg → 5000
  sb.syncPetLevelExp(DAY1, sb.Math.random);
  const e1 = todayEntries(sb, DAY1)[0];
  assert('1 只：总量 5000 / 实发 1000 / 丢弃 4000',
    e1.total === 5000 && e1.granted === 1000 && e1.dropped === 4000,
    JSON.stringify({ t: e1.total, g: e1.granted, d: e1.dropped }));
  assert('1 只：明细之和 1000 ＋ 丢弃 4000 = 总量 5000',
    sumAlloc(e1) === 1000 && sumAlloc(e1) + e1.dropped === e1.total,
    JSON.stringify({ sum: sumAlloc(e1), d: e1.dropped, t: e1.total }));
  assert('丢弃量不是 0（没有为了账面好看去均摊）', e1.dropped > 0, String(e1.dropped));
}

/* ============================================================
   [3] 同日重复保存 / 面板重开：不重复记账
   ============================================================ */
head('[3] 同日重复保存不重复记账');
{
  const sb = SB;
  resetStore(sb, FIVE.map(id => mkPet(sb, id)));
  sb.store.set('strength', { entries: [{ date: tk(sb), exercise: 'squat', weight: 100, actualReps: 10 }] });
  const r1 = sb.syncPetLevelExp(DAY1, sb.Math.random);
  assert('第一次：发 5000', r1.total === 5000, String(r1.total));
  let n = 0;
  for (let i = 0; i < 5; i++) n += sb.syncPetLevelExp(DAY1, sb.Math.random).total;
  assert('再保存 5 次（面板重开 / 训练重复落盘）：总发放仍为 0', n === 0, String(n));
  assert('记录条数仍为 1（没有第二笔账）', todayEntries(sb, DAY1).length === 1,
    String(todayEntries(sb, DAY1).length));
  const expSum = sb.getPetStore().pets.reduce((s, p) => s + (p.exp || 0), 0);
  assert('宠物身上的经验总和仍 = 5000（没有多记一倍）', expSum === 5000, String(expSum));
  assert('今日合计 = 5000（petLevelExpLog 也按同一口径）', sb.petLevelExpLog(DAY1).granted === 5000,
    String(sb.petLevelExpLog(DAY1).granted));

  /* 追加训练 → 只补差额，且新记录只写增量与其来源 */
  const entries = sb.store.get('strength').entries.slice();
  entries.push({ date: tk(sb), exercise: 'squat', weight: 50, actualReps: 10 });  // +500kg → +2500
  sb.store.set('strength', { entries: entries });
  const r2 = sb.syncPetLevelExp(DAY1, sb.Math.random);
  assert('追加 500kg：只补 2500（不是重发整天）', r2.total === 2500, String(r2.total));
  const logs = todayEntries(sb, DAY1);
  assert('记录变成 2 条，最新一条在前（log.unshift）且是 2500',
    logs.length === 2 && logs[0].total === 2500 && logs[1].total === 5000,
    JSON.stringify(logs.map(e => e.total)));
  assert('最新一条来源只写力量增量（kg=1500 是当日累计容量，exp=2500 是本次增量）',
    (logs[0].breakdown || []).length === 1 && logs[0].breakdown[0].source === 'strength' &&
    logs[0].breakdown[0].exp === 2500,
    JSON.stringify(logs[0].breakdown));
  assert('两条记录合计 = 7500 = 宠物经验总和', sb.petLevelExpLog(DAY1).granted === 7500 &&
    sb.getPetStore().pets.reduce((s, p) => s + (p.exp || 0), 0) === 7500,
    JSON.stringify({ log: sb.petLevelExpLog(DAY1), pets: sb.getPetStore().pets.map(p => p.exp) }));
}

/* ============================================================
   [4] 挑战加成来源单独标记（+ runId 幂等）
   ============================================================ */
head('[4] 挑战加成来源单独标记');
{
  const sb = SB;
  resetStore(sb, FIVE.map(id => mkPet(sb, id)));
  sb.store.set('strength', { entries: [{ date: tk(sb), exercise: 'squat', weight: 100, actualReps: 10 }] });
  sb.syncPetLevelExp(DAY1, sb.Math.random);
  const r = sb.grantPetLevelChallengeExp(123456, 'ch_run_A', DAY1, sb.Math.random);
  assert('伤害 123456 × 1% = 1234 EXP', r.exp === 1234 && r.total === 1234, JSON.stringify({ e: r.exp, t: r.total }));
  const logs = todayEntries(sb, DAY1);
  const ch = logs.filter(e => e.source === 'challenge');
  assert('挑战记录单独一条（source=challenge）', ch.length === 1, JSON.stringify(logs.map(e => e.source)));
  assert('挑战记录的来源拆分带本次伤害与经验',
    ch[0].breakdown.length === 1 && ch[0].breakdown[0].source === 'challenge' &&
    ch[0].breakdown[0].dmg === 123456 && ch[0].breakdown[0].exp === 1234,
    JSON.stringify(ch[0].breakdown));
  assert('挑战记录同样满足「明细之和 ＋ 丢弃 = 总量」',
    sumAlloc(ch[0]) + ch[0].dropped === ch[0].total && ch[0].total === 1234,
    JSON.stringify({ sum: sumAlloc(ch[0]), d: ch[0].dropped, t: ch[0].total }));
  const again = sb.grantPetLevelChallengeExp(123456, 'ch_run_A', DAY1, sb.Math.random);
  assert('同一个结算键重入：不再发、也不再写记录',
    again.duplicate === true && again.total === 0 &&
    todayEntries(sb, DAY1).filter(e => e.source === 'challenge').length === 1,
    JSON.stringify({ dup: again.duplicate, n: todayEntries(sb, DAY1).length }));
  const t = sb.petLevelExpLog(DAY1);
  assert('今日合计把训练与挑战**分列两笔**（不混算成一条）',
    t.entries.length === 2 && t.entries[0].source === 'challenge' && t.entries[1].source === 'daily',
    JSON.stringify(t.entries.map(e => e.source)));
  assert('今日合计：总量 6234（训练 5000 + 挑战 1234）、实发 6230、丢弃 4（挑战那笔 5 只×20% 只装得下 1230）',
    t.total === 6234 && t.granted === 6230 && t.dropped === 4,
    JSON.stringify({ t: t.total, g: t.granted, d: t.dropped }));
}

/* ============================================================
   [5] 跨日重置明细
   ============================================================ */
head('[5] 跨日重置明细');
{
  const sb = SB;
  resetStore(sb, FIVE.map(id => mkPet(sb, id)));
  sb.store.set('strength', { entries: [{ date: tk(sb, DAY1), exercise: 'squat', weight: 100, actualReps: 10 }] });
  sb.syncPetLevelExp(DAY1, sb.Math.random);
  const d1 = sb.petLevelExpLog(DAY1);
  assert('第 1 天：明细 1 笔、合计 5000', d1.entries.length === 1 && d1.granted === 5000,
    JSON.stringify({ n: d1.entries.length, g: d1.granted }));

  /* 第 2 天：只留下第 2 天的训练记录，水位按新的一天重算 */
  sb.store.set('strength', { entries: [{ date: tk(sb, DAY2), exercise: 'squat', weight: 40, actualReps: 10 }] }); // 400kg → 2000
  const r2 = sb.syncPetLevelExp(DAY2, sb.Math.random);
  assert('第 2 天：按新一天重算并发放 2000（不被前一天水位挡住）', r2.total === 2000, String(r2.total));
  const d2 = sb.petLevelExpLog(DAY2);
  assert('第 2 天的明细只有第 2 天的 1 笔（跨日不吃旧记录）',
    d2.entries.length === 1 && d2.entries[0].date === tk(sb, DAY2) && d2.granted === 2000,
    JSON.stringify({ n: d2.entries.length, g: d2.granted }));
  assert('第 1 天的明细仍是 5000（历史记录不被改写）', sb.petLevelExpLog(DAY1).granted === 5000,
    String(sb.petLevelExpLog(DAY1).granted));
  assert('账本里两天各留一条（log 是追加，不覆盖）',
    (sb.petLevelLedger().log || []).filter(e => e.source === 'daily').length === 2,
    JSON.stringify((sb.petLevelLedger().log || []).map(e => [e.date, e.source])));
  assert('当日水位随日期重置（dayKey / dailyGranted 对齐第 2 天）',
    sb.petLevelLedger().dayKey === tk(sb, DAY2) && sb.petLevelLedger().dailyGranted === 2000,
    JSON.stringify({ k: sb.petLevelLedger().dayKey, g: sb.petLevelLedger().dailyGranted }));
  assert('跨日不会重复发：同一天再调一次仍是 0',
    sb.syncPetLevelExp(DAY2, sb.Math.random).total === 0 && sb.petLevelExpLog(DAY2).granted === 2000);
}

/* ============================================================
   [6] 存储落点 + 展示接线（不新建第二套 truth）
   ============================================================ */
head('[6] 存储落点与展示接线');
{
  const sb = SB;
  const keys = Object.keys(sb.store._mem).sort();
  assert('记录写在既有 pets store 的 levelLedger.log（没有新增 store key）',
    keys.indexOf('pets') > -1 && keys.filter(k => /exp|log|pet/i.test(k)).length === 1,
    JSON.stringify(keys));
  const L = sb.petLevelLedger();
  assert('账本字段齐备：dailyGranted / strGranted / carGranted / challengeKeys / log',
    typeof L.dailyGranted === 'number' && (L.strGranted === null || typeof L.strGranted === 'number') &&
    (L.carGranted === null || typeof L.carGranted === 'number') &&
    Array.isArray(L.challengeKeys) && Array.isArray(L.log),
    JSON.stringify(Object.keys(L)));
  const src = load('pet-ui.js');
  assert('pet-ui.js：面板里渲染了「宠物经验明细」区块',
    src.indexOf('petExpLogHtml()') > -1 && src.indexOf('📒 宠物经验明细') > -1 && src.indexOf('今日合计 +') > -1);
  assert('pet-ui.js：区块用原生 <details> 默认折叠',
    /'<details class="pet-exp-log">'/.test(src) && src.indexOf('<summary class="pet-exp-log-sum">') > -1);
  const css = load('index.css');
  assert('index.css：summary 热区 ≥ 44px（min-height:var(--touch-min)）',
    /\.pet-exp-log-sum\{[^}]*min-height:var\(--touch-min\)/.test(css));
  assert('index.css：折叠块 0 圆角 / 无阴影 / 无渐变',
    !/\.pet-exp-log[^{]*\{[^}]*(border-radius|box-shadow)[^}]*\}/.test(css) &&
    !/\.pet-exp-log[^{]*\{[^}]*gradient[^}]*\}/.test(css));
  /* 渲染出来的 HTML 能直接看到「今日合计 +X EXP」与来源文案 */
  const html = sb.petExpLogHtml(DAY1);
  assert('渲染：顶部一行有「今日合计 +X EXP」', html.indexOf('pet-exp-log-total') > -1 &&
    /今日合计 \+5000 EXP/.test(html), html.slice(0, 240));
  assert('渲染：展开体含来源拆分（力量 kg×5 / 挑战伤害）',
    html.indexOf('力量') > -1 && html.indexOf('kg × 5') > -1, html.slice(0, 400));
  assert('渲染：展开体含每只宠物分配明细与丢弃量',
    html.indexOf('总') > -1 && html.indexOf('丢弃') > -1 &&
    (html.indexOf('pet-exp-log-alloc') > -1), html.slice(0, 400));
}

console.log('\n' + '─'.repeat(60));
console.log((fail === 0 ? '✅ ' : '❌ ') + 'test-pet-exp-log：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);

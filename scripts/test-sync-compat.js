#!/usr/bin/env node
/* v2.15 云同步**载荷兼容 + 合并冲突语义**测试（与 test-sync-coverage 互补）
   ---------------------------------------------------------------------------
   test-sync-coverage   守住「有没有漏键」（注册表派生 / 往返 0 丢失）
   本文件               守住「合并规则对老载荷还成不成立、冲突时谁赢」：
     §1 老载荷（**没有 keys 段**，v2 / v4 形态）走扁平字段回退
     §2 新载荷（v5，有 keys 段）整键覆盖
     §3 合并冲突语义矩阵 —— **以现实现为准钉死**（不许擅自改用户数据的胜负规则）
     §4 存档 schema 版本适配 —— 复用 store **既有** migrate 链；`-bak` 约定不变
     §5 全量导出/导入（buildImportMap）两条路径
     §6 端到端：仓库根的老夹具 sync-data.json → 载荷 → 新客户端
   语义摘要（下面每条都有断言钉住）：
     · 载荷里**出现且有值**的键 → 云端赢（与 lastUpdated 谁新无关）
     · 载荷里**没有**的键 / 值为 null / 空数组 / 空 notes / 空 profile → 本地保留（不会被「删掉」）
     · `keys` 段与扁平段同时出现同一个键 → **keys 段赢**（先扁平后 keys）
     · `challenge` 有按月保护（云端月份更旧 → 保留本地）
     · 校验不过的值 → 跳过、本地不动；未来版本（value.version > schema.version）→ 原样保留不降级
   Run: node scripts/test-sync-compat.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'page');
const read = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}

/* ---------- 沙箱（store.js + sync.js，DOM 全打桩） ---------- */
function makeLS() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _raw: m,
  };
}
function makeSandbox() {
  const noop = () => {};
  const el = { className: '', textContent: '', innerHTML: '', style: {}, classList: { add: noop, remove: noop, contains: () => false }, addEventListener: noop, remove: noop, querySelectorAll: () => [], appendChild: noop };
  const sb = { console, JSON, Math, Date, Array, Object, String, Number, Boolean, parseInt, parseFloat, isNaN, isFinite, setTimeout };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = makeLS();
  sb.document = { getElementById: () => null, createElement: () => el, body: el, addEventListener: noop };
  sb.navigator = {};
  sb.openModal = () => el;
  sb.toast = noop; sb.confirm = () => false; sb.alert = noop;
  sb.Blob = function () {}; sb.URL = { createObjectURL: () => '', revokeObjectURL: noop };
  sb.FileReader = function () {};
  sb.XMLHttpRequest = function () { this.open = noop; this.send = noop; this.setRequestHeader = noop; };
  /* 与 app.js 的同名读取函数一致：**先读 store、再回落默认值**（写死默认值会让
     getAllData 的 profile / game 扁平字段永远看不到 store 里的真实内容） */
  sb.getProf = () => (sb.store.get('profile') || { height: 175, gender: '男', birthYear: 1995 });
  sb.getGame = () => (sb.store.get('game') || { cleared: [], current: '' });
  sb.updateGameBar = noop;
  vm.createContext(sb);
  vm.runInContext(read('store.js'), sb);
  vm.runInContext(read('sync.js'), sb);
  return sb;
}

/* ============================================================
   §1 老载荷（没有 keys 段）
   ============================================================ */
console.log('\n--- §1 老载荷：扁平字段回退 ---');

/* 1.1 仓库根的 v2 老夹具（真实数据：无 keys / 无 cardio / 无 attrLog…） */
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sync-data.json'), 'utf8'));
assert('老夹具确实是「无 keys 段」的 v2 载荷',
  FIXTURE.version === 2 && !('keys' in FIXTURE), 'version=' + FIXTURE.version + ' keys=' + ('keys' in FIXTURE));

const S1 = makeSandbox();
/* 本地先放一批「老载荷里完全没有」的新系统数据 */
S1.store.set('pets', { version: 1, pets: [{ speciesId: 'dream', stage: 'mature' }], materials: { nutrition: 3 }, battlePicks: ['dream'] });
S1.store.set('theme', 'light');
S1.store.set('groupProgress', { version: 1, cleared: ['g1-1'] });
S1.store.set('skills', { points: 40, levels: {}, loadout: [] });
S1.store.set('cardio', { entries: [{ date: '2026-06-30', min: 15 }] });

assert('§1.1 v2 老夹具可以被合并', S1.mergeServerData(FIXTURE) === true);
const str1 = S1.store.get('strength') || {};
assert('§1.1 扁平 entries → strength.entries',
  Array.isArray(str1.entries) && str1.entries.length === FIXTURE.entries.length,
  (str1.entries || []).length + ' vs ' + FIXTURE.entries.length);
assert('§1.1 扁平 plans → plans.plans',
  Array.isArray((S1.store.get('plans') || {}).plans) && S1.store.get('plans').plans.length === FIXTURE.plans.length);
assert('§1.1 扁平 missed（对象）→ missed.notes',
  (S1.store.get('missed') || {}).notes && Object.keys(S1.store.get('missed').notes).length === Object.keys(FIXTURE.missed).length);
assert('§1.1 扁平 weight → weight.records',
  Array.isArray((S1.store.get('weight') || {}).records) && S1.store.get('weight').records.length === 1);
assert('§1.1 扁平 profile / game 原样落地',
  S1.store.get('profile').height === 171 && S1.store.get('game').current === '3-3',
  JSON.stringify([S1.store.get('profile'), S1.store.get('game')]));
assert('§1.1 老载荷不会抹掉本地宠物（含 battlePicks）',
  (S1.store.get('pets') || {}).pets.length === 1 && S1.store.get('pets').battlePicks[0] === 'dream');
assert('§1.1 老载荷不会抹掉本地 theme / groupProgress / skills',
  S1.store.get('theme') === 'light' && (S1.store.get('groupProgress') || {}).cleared.length === 1 && S1.store.get('skills').points === 40);
assert('§1.1 老载荷里缺的扁平键（cardio）→ 本地保留',
  (S1.store.get('cardio') || {}).entries.length === 1, JSON.stringify(S1.store.get('cardio')));

/* 1.2 v4 形态：plans / missed / cardio / weight 的「双层包装」也要认（既有兼容分支） */
const S2 = makeSandbox();
const v4 = {
  version: 4,
  entries: [{ date: '2026-09-01', ex: 'sq', sets: 2 }],
  plans: { plans: [{ id: 'p-wrapped' }] },
  missed: { notes: { '2026-09-02': '出门' } },
  cardio: { entries: [{ date: '2026-09-01', min: 11 }] },
  weight: { records: [{ date: '2026-09-01', weight: 66 }] },
  profile: { height: 170 }, game: { cleared: [], current: '1-1' }
};
assert('§1.2 v4 老载荷可合并', S2.mergeServerData(v4) === true);
assert('§1.2 plans 双层包装被识别', (S2.store.get('plans') || {}).plans[0].id === 'p-wrapped');
/* ⚠️ **预存在怪相（本轮未改）**：`missed` 的首个分支 `hasKeys(d.missed)` 会吞掉任何非空对象，
   于是「双层包装」`{notes:{…}}` 走不到它自己的 `else if`（那是死分支），结果再包一层。
   本断言把**现实现**钉死；要改属于「改用户数据语义」，需要作者裁决（见报告 §风险）。 */
assert('§1.2 missed 双层包装：既有实现会再包一层（死分支，未改）',
  !!((S2.store.get('missed') || {}).notes || {}).notes && S2.store.get('missed').notes.notes['2026-09-02'] === '出门',
  JSON.stringify(S2.store.get('missed')));
assert('§1.2 cardio 双层包装被识别', (S2.store.get('cardio') || {}).entries[0].min === 11);
assert('§1.2 weight 双层包装被识别', (S2.store.get('weight') || {}).records[0].weight === 66);

/* 1.3 载荷有效性边界（既有判据：version>=2 或有任意一类数据） */
const S3 = makeSandbox();
assert('§1.3 只有 version:1 的空载荷 → 拒绝（返回 false）', S3.mergeServerData({ version: 1 }) === false);
assert('§1.3 完全陌生的对象 → 拒绝', S3.mergeServerData({ foo: 1 }) === false);
assert('§1.3 没有 version 但有 entries → 接受（老到没有版本号的备份）',
  S3.mergeServerData({ entries: [{ date: '2026-01-01', ex: 'x', sets: 1 }] }) === true);
assert('§1.3 null / undefined → 拒绝且不抛错', S3.mergeServerData(null) === false && S3.mergeServerData(undefined) === false);

/* ============================================================
   §2 新载荷（有 keys 段）
   ============================================================ */
console.log('\n--- §2 新载荷：keys 段整键合并 ---');

const S4 = makeSandbox();
const newPayload = {
  version: 5, lastUpdated: Date.now(),
  entries: [{ date: '2026-10-01', ex: 'bench', sets: 3 }],
  keys: {
    pets: { version: 1, pets: [{ speciesId: 'blaze', stage: 'mature' }], materials: { nutrition: 9 }, battlePicks: ['blaze'] },
    theme: 'dark',
    groupProgress: { version: 1, cleared: ['g1-1', 'g1-2', 'g1-3'] },
    skills: { points: 7, levels: { crit: 2 }, loadout: ['crit'] },
    level: { version: 1, quarterKey: '2026-Q4', lastLevel: 4, history: [] },
    battleHistory: { version: 1, battles: [] },
    challenge: { lastSeasonMonth: '2026-10', wins: 4 },
    brandNew: { a: 1 }
  }
};
assert('§2.1 新载荷可合并', S4.mergeServerData(newPayload) === true);
assert('§2.1 keys.pets 落地', (S4.store.get('pets') || {}).pets[0].speciesId === 'blaze');
assert('§2.1 keys.theme（标量）落地', S4.store.get('theme') === 'dark');
assert('§2.1 keys.groupProgress 落地', (S4.store.get('groupProgress') || {}).cleared.length === 3);
assert('§2.1 keys.level 落地', (S4.store.get('level') || {}).lastLevel === 4);
assert('§2.1 keys.battleHistory 落地（空数组也算有值）', Array.isArray((S4.store.get('battleHistory') || {}).battles));
assert('§2.1 keys 段里的陌生键也落地（不挑键）', (S4.store.get('brandNew') || {}).a === 1);
assert('§2.1 同一载荷的扁平段也落地', (S4.store.get('strength') || {}).entries.length === 1);

/* 2.2 keys 段「整键覆盖」：不是字段级深合并（既有语义，钉死） */
const S5 = makeSandbox();
S5.store.set('pets', { version: 1, pets: [{ speciesId: 'old' }], battlePicks: ['old'], materials: { nutrition: 1 } });
S5.mergeServerData({ version: 5, keys: { pets: { version: 1, pets: [] } } });
const pets5 = S5.store.get('pets');
assert('§2.2 云端整键覆盖本地（pets 变空）', Array.isArray(pets5.pets) && pets5.pets.length === 0, JSON.stringify(pets5));
assert('§2.2 整键覆盖 → 云端没有的字段不会与本地合并（battlePicks 随之消失）',
  pets5.battlePicks === undefined, JSON.stringify(pets5));

/* 2.3 keys 段里的 null 不删本地 */
const S6 = makeSandbox();
S6.store.set('pets', { version: 1, pets: [{ speciesId: 'keep' }] });
S6.mergeServerData({ version: 5, keys: { pets: null, skills: null, theme: null } });
assert('§2.3 keys 段里 null 不删除本地', (S6.store.get('pets') || {}).pets[0].speciesId === 'keep', JSON.stringify(S6.store.get('pets')));

/* 2.4 mod-time 永不同步 */
const S7 = makeSandbox();
S7.mergeServerData({ version: 5, keys: { 'mod-time': 123456 } });
assert('§2.4 keys 段里的 mod-time 被跳过（不作为 store 键写入）', S7.store.get('mod-time') == null);

/* 2.5 同一键既在扁平段又在 keys 段 → keys 段赢（先扁平后 keys，既有顺序） */
const S8 = makeSandbox();
S8.mergeServerData({ version: 5, prs: { squat: 111 }, keys: { prs: { squat: 222 } } });
assert('§2.5 扁平段与 keys 段冲突时 keys 段赢', (S8.store.get('prs') || {}).squat === 222, JSON.stringify(S8.store.get('prs')));

/* ============================================================
   §3 合并冲突语义矩阵（本地 / 云端谁赢）
   ============================================================ */
console.log('\n--- §3 冲突语义矩阵 ---');

/* 3.1 有值的扁平字段：云端赢，且与 lastUpdated 谁新无关 */
const S9 = makeSandbox();
S9.store.set('strength', { entries: [{ id: 'L1' }, { id: 'L2' }] });
S9.mergeServerData({ version: 5, lastUpdated: 1, entries: [{ id: 'C1' }] });     // 云端时间戳更旧
assert('§3.1 云端时间戳更旧 → 仍然云端赢（合并不看时间戳）',
  S9.store.get('strength').entries.length === 1 && S9.store.get('strength').entries[0].id === 'C1',
  JSON.stringify(S9.store.get('strength')));
const S9b = makeSandbox();
S9b.store.set('strength', { entries: [{ id: 'L1' }] });
S9b.mergeServerData({ version: 5, lastUpdated: Date.now() + 1e6, entries: [{ id: 'C1' }, { id: 'C2' }] });
assert('§3.1 云端时间戳更新 → 云端赢',
  S9b.store.get('strength').entries.length === 2, JSON.stringify(S9b.store.get('strength')));

/* 3.2 空值不覆盖本地（空数组 / 空 notes / 空 profile） */
const S10 = makeSandbox();
S10.store.set('strength', { entries: [{ id: 'L1' }] });
S10.store.set('plans', { plans: [{ id: 'LP' }] });
S10.store.set('missed', { notes: { '2026-09-01': '本地的' } });
S10.store.set('cardio', { entries: [{ id: 'LC' }] });
S10.store.set('weight', { records: [{ id: 'LW' }] });
S10.store.set('profile', { height: 180 });
S10.mergeServerData({ version: 5, entries: [], plans: [], missed: {}, cardio: [], weight: [], profile: {}, attrLog: [], exercises: [] });
assert('§3.2 空数组不覆盖本地 strength', S10.store.get('strength').entries.length === 1);
assert('§3.2 空数组不覆盖本地 plans', S10.store.get('plans').plans[0].id === 'LP');
assert('§3.2 空对象不覆盖本地 missed', !!(S10.store.get('missed').notes['2026-09-01']));
assert('§3.2 空数组不覆盖本地 cardio / weight',
  S10.store.get('cardio').entries.length === 1 && S10.store.get('weight').records.length === 1);
assert('§3.2 空 profile 不覆盖本地', S10.store.get('profile').height === 180);
assert('§3.2 载荷里没有的键一律保留本地（不删键）',
  S10.store.get('pets') == null && S10.store.get('strength') != null);   // 没有就是没有，本地有的一律不动

/* 3.3 challenge 按月保护（唯一带业务守卫的键） */
const S11 = makeSandbox();
S11.store.set('challenge', { lastSeasonMonth: '2026-09', wins: 1 });
S11.mergeServerData({ version: 5, challenge: { lastSeasonMonth: '2026-10', wins: 9 } });
assert('§3.3 challenge：云端月份更新 → 云端赢', S11.store.get('challenge').wins === 9);
const S11b = makeSandbox();
S11b.store.set('challenge', { lastSeasonMonth: '2026-09', wins: 1 });
S11b.mergeServerData({ version: 5, challenge: { lastSeasonMonth: '2026-09', wins: 5 } });
assert('§3.3 challenge：月份相同 → 云端赢', S11b.store.get('challenge').wins === 5);
const S11c = makeSandbox();
S11c.store.set('challenge', { lastSeasonMonth: '2026-09', wins: 1 });
S11c.mergeServerData({ version: 5, challenge: { lastSeasonMonth: '2026-08', wins: 9 } });
assert('§3.3 challenge：云端月份更旧 → **本地保留**（seasonBonus 按月重置保护）',
  S11c.store.get('challenge').wins === 1, JSON.stringify(S11c.store.get('challenge')));
const S11d = makeSandbox();
S11d.store.set('challenge', { lastSeasonMonth: '2026-09', wins: 1 });
S11d.mergeServerData({ version: 5, challenge: { wins: 9 } });          // 云端没有月份字段
assert('§3.3 challenge：云端缺 lastSeasonMonth → 本地保留（空串 < 2026-09）', S11d.store.get('challenge').wins === 1);
const S11e = makeSandbox();
S11e.mergeServerData({ version: 5, challenge: { lastSeasonMonth: '2026-07', wins: 3 } });
assert('§3.3 challenge：本地无存档 → 接受云端', S11e.store.get('challenge').wins === 3);

/* 3.4 校验不过的值 → 跳过、本地不动 */
const S12 = makeSandbox();
S12.store.set('weight', { records: [{ id: 'L1' }] });
S12.store.set('strength', { entries: [{ id: 'L1' }] });
S12.mergeServerData({ version: 5, keys: { weight: { records: 'not-an-array' } }, attrLog: 'not-an-array' });
assert('§3.4 keys 段里校验不过的值被跳过（本地保留）',
  S12.store.get('weight').records.length === 1 && S12.store.get('weight').records[0].id === 'L1',
  JSON.stringify(S12.store.get('weight')));
assert('§3.4 扁平段里形状不对的值被跳过', S12.store.get('attrLog') == null);

/* ============================================================
   §4 存档 schema 版本适配（复用 store 既有 migrate 链）
   ============================================================ */
console.log('\n--- §4 schema 版本适配 ---');

/* test schema：v2，带 1→2 迁移。
   ⚠️ validate **不**校验 version 字段 —— 与 store 的既有语义一致：
      未来版本（value.version > schema.version）走「不降级、原样服务」，
      服务前仍然要过 validate（见 page/store.js 的 get / loadMigrated）。 */
function registerV2(S, name, opts) {
  opts = opts || {};
  S.store.registerSchema(name, {
    version: 2,
    defaultValue: function () { return { version: 2, list: [], upgraded: true }; },
    validate: function (v) { return v && typeof v === 'object' && Array.isArray(v.list); },
    migrate: { 1: opts.migrate || function (d) { return { version: 2, list: (d && d.items) || [], upgraded: true }; } }
  });
}

/* 4.1 入站旧版本 → 走 migrate 链，落到**目标版本**物理键 */
const M = makeSandbox();
registerV2(M, 'syncMigKey');
M.mergeServerData({ version: 5, keys: { syncMigKey: { version: 1, items: ['a', 'b'] } } });
const mig = M.store.get('syncMigKey');
assert('§4.1 入站 v1 值被迁移成 v2 形状',
  mig && mig.version === 2 && Array.isArray(mig.list) && mig.list.length === 2 && mig.upgraded === true,
  JSON.stringify(mig));
assert('§4.1 迁移结果写在目标版本物理键 dh-syncMigKey-v2',
  M.localStorage.getItem('dh-syncMigKey-v2') != null && M.localStorage.getItem('dh-syncMigKey-v1') == null,
  JSON.stringify([M.localStorage.getItem('dh-syncMigKey-v2'), M.localStorage.getItem('dh-syncMigKey-v1')]));
assert('§4.1 store.migrations() 记下这次入站迁移（src=inbound）',
  M.store.migrations().some(m => m.key === 'syncMigKey' && m.from === 1 && m.to === 2 && m.ok === true && m.src === 'inbound'),
  JSON.stringify(M.store.migrations()));

/* 4.2 没有 version 字段的入站值 → 按 v1 处理（与读 -v1 物理键的回落一致） */
const M2 = makeSandbox();
registerV2(M2, 'syncMigKey');
M2.mergeServerData({ version: 5, keys: { syncMigKey: { items: ['c'] } } });
assert('§4.2 无 version 字段的入站值按 v1 迁移',
  (M2.store.get('syncMigKey') || {}).version === 2 && M2.store.get('syncMigKey').list[0] === 'c',
  JSON.stringify(M2.store.get('syncMigKey')));

/* 4.3 入站迁移**不写 / 不覆盖 -bak**（-bak 是本地回滚副本，既有约定） */
const M3 = makeSandbox();
registerV2(M3, 'syncMigKey');
registerV2(M3, 'syncMigKey2');
M3.localStorage.setItem('dh-syncMigKey-v2-bak', 'LOCAL-ROLLBACK-COPY');
M3.mergeServerData({ version: 5, keys: { syncMigKey: { version: 1, items: ['x'] }, syncMigKey2: { version: 1, items: ['y'] } } });
assert('§4.3 既有 -bak 不被入站迁移覆盖',
  M3.localStorage.getItem('dh-syncMigKey-v2-bak') === 'LOCAL-ROLLBACK-COPY',
  String(M3.localStorage.getItem('dh-syncMigKey-v2-bak')));
assert('§4.3 入站迁移不会凭空造出 -bak',
  M3.localStorage.getItem('dh-syncMigKey2-v2-bak') == null,
  String(M3.localStorage.getItem('dh-syncMigKey2-v2-bak')));

/* 4.4 迁移后校验不过 → 不落盘、本地保留 */
const M4 = makeSandbox();
registerV2(M4, 'syncMigBad', { migrate: function () { return { version: 2, list: 'nope' }; } });
M4.store.set('syncMigBad', { version: 2, list: ['local'] });
M4.mergeServerData({ version: 5, keys: { syncMigBad: { version: 1, items: ['remote'] } } });
assert('§4.4 迁移结果形状不合法 → 跳过、本地保留',
  (M4.store.get('syncMigBad') || {}).list[0] === 'local', JSON.stringify(M4.store.get('syncMigBad')));

/* 4.5 未来版本（value.version > schema.version）→ 原样保留、不降级（与读路径一致） */
const M5 = makeSandbox();
registerV2(M5, 'syncMigKey');
M5.mergeServerData({ version: 5, keys: { syncMigKey: { version: 9, list: [], future: true } } });
const fut = M5.store.get('syncMigKey');
assert('§4.5 未来版本原样保留（不跑迁移、不改写）',
  fut && fut.version === 9 && fut.future === true, JSON.stringify(fut));
assert('§4.5 未来版本不产生迁移日志',
  !M5.store.migrations().some(m => m.key === 'syncMigKey'), JSON.stringify(M5.store.migrations()));

/* 4.6 本地读路径的 -bak 回落行为**保持既有约定**（本轮未改读路径） */
const M6 = makeSandbox();
M6.localStorage.setItem('dh-cardio-v1', '{oops not json');
const badRead = M6.store.get('cardio');
assert('§4.6 本地坏值 → 读回 null（回落默认）', badRead === null, JSON.stringify(badRead));
assert('§4.6 本地坏值 → 原样备份到 -bak（既有约定不变）',
  M6.localStorage.getItem('dh-cardio-v1-bak') === '{oops not json',
  String(M6.localStorage.getItem('dh-cardio-v1-bak')));

/* 4.7 缺失键：注册了但载荷里没有 → 本地不动、也不补默认值 */
const M7 = makeSandbox();
M7.store.set('level', { version: 1, lastLevel: 3 });
M7.mergeServerData({ version: 5, keys: { pets: { version: 1, pets: [] } } });
assert('§4.7 载荷缺失的键保持本地值（不被默认值冲掉）',
  (M7.store.get('level') || {}).lastLevel === 3, JSON.stringify(M7.store.get('level')));

/* ============================================================
   §5 全量导出 / 导入（buildImportMap）
   ============================================================ */
console.log('\n--- §5 导出 / 导入映射 ---');
const I1 = makeSandbox();
const m1 = I1.buildImportMap(FIXTURE);            // 老载荷（无 keys）
assert('§5.1 老载荷导入映射：entries / plans / missed / weight / profile / game',
  m1.strength.entries.length === FIXTURE.entries.length && m1.plans.plans.length === FIXTURE.plans.length &&
  Object.keys(m1.missed.notes).length === Object.keys(FIXTURE.missed).length &&
  m1.weight.records.length === 1 && m1.profile.height === 171 && m1.game.current === '3-3');
assert('§5.1 老载荷没有 keys 段 → 映射里没有扩展键', !('pets' in m1));

const I2 = makeSandbox();
const m2 = I2.buildImportMap(newPayload);         // 新载荷
assert('§5.2 新载荷导入映射覆盖 keys 段（含陌生键）',
  !!m2.pets && !!m2.theme && !!m2.groupProgress && !!m2.brandNew, Object.keys(m2).join(','));
const I3 = makeSandbox();
const m3 = I3.buildImportMap({ version: 5, keys: { 'mod-time': 1, pets: null, theme: 'dark' } });
assert('§5.2 导入映射同样跳过 mod-time 与 null', !('mod-time' in m3) && !('pets' in m3) && m3.theme === 'dark');

/* ============================================================
   §6 端到端：老夹具 → 合并 → 重新导出（新格式）→ 另一台设备合并
   ============================================================ */
console.log('\n--- §6 端到端（老夹具 → 新载荷 → 另一台设备） ---');
const Dev1 = makeSandbox();
Dev1.mergeServerData(FIXTURE);
Dev1.store.set('pets', { version: 1, pets: [{ speciesId: 'dream' }], battlePicks: ['dream'], materials: { nutrition: 5 } });
Dev1.store.set('skills', { points: 12, levels: { crit: 1 }, loadout: ['crit'] });
const exported = JSON.parse(JSON.stringify(Dev1.getAllData()));
assert('§6.1 重新导出后是新格式（version 5 且带 keys 段）', exported.version === 5 && !!exported.keys);
assert('§6.2 老夹具的扁平数据仍在（entries / game）',
  exported.entries.length === FIXTURE.entries.length && exported.game.current === '3-3');
assert('§6.3 本地新系统数据进了 keys 段',
  !!exported.keys.pets && !!exported.keys.skills && exported.keys.pets.battlePicks[0] === 'dream');
const Dev2 = makeSandbox();
assert('§6.4 第二台设备合并成功', Dev2.mergeServerData(exported) === true);
assert('§6.5 第二台设备拿到宠物 / 参战选择 / 技能 / 强度记录',
  (Dev2.store.get('pets') || {}).battlePicks[0] === 'dream' &&
  (Dev2.store.get('skills') || {}).points === 12 &&
  (Dev2.store.get('strength') || {}).entries.length === FIXTURE.entries.length);
assert('§6.6 第二台设备没有丢任何「老夹具」字段',
  Dev2.store.get('profile').height === 171 && !!Dev2.store.get('missed').notes['2026-06-08']);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

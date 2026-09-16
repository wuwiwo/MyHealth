#!/usr/bin/env node
/* v2.1.20 测试：云同步的**键覆盖**守卫 + 往返不丢数据
   背景：getAllData() 曾经硬编码 14 个键，v2.x 新增的宠物 / 材料袋 / 宝珠 / 敌群进度 / 玩家技能 /
   主题 / 有氧计划全都没进载荷 —— 推送时留在本地、拉取时无处可写，等于「换设备就全丢」。
   实测当时 19 个在用的键里丢 5 个。

   本测试做三件事：
   1) 从 page/*.js 源码自动派生「应用真正在用的 store 短键」，逐个做 push→pull 往返，断言全部存活
      → 以后新增 store 键若忘了同步，这里会直接红
   2) 标量键（theme）必须能同步（mergeAll 曾经把非 object 值静默丢弃）
   3) 旧版云端快照（v4，没有 keys 字段）仍能正常合并，且不会把本地新数据抹掉
   Run: node scripts/test-sync-coverage.js
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

/* ---------- 沙箱：store.js + sync.js（DOM 全打桩） ---------- */
function makeLS() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
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
  sb.getProf = () => ({ height: 175, gender: '男', birthYear: 1995 });
  sb.getGame = () => ({ cleared: ['x'], current: 'y' });
  sb.updateGameBar = noop;
  vm.createContext(sb);
  vm.runInContext(read('store.js'), sb);
  vm.runInContext(read('sync.js'), sb);
  return sb;
}

/* ---------- 1. 从源码派生应用真正在用的 store 键 ---------- */
const usedKeys = new Set();
fs.readdirSync(PAGE).forEach(function (fn) {
  if (!fn.endsWith('.js')) return;
  const txt = read(fn);
  const re = /store\.(?:get|set|registerSchema)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(txt))) usedKeys.add(m[1]);
});
const keys = Array.from(usedKeys).sort();
assert('从源码派生出 store 键（应 >= 18 个）', keys.length >= 18, 'count=' + keys.length + ' → ' + keys.join(','));

/* ---------- 代表性样本（形状必须通过各键自己的 validate） ---------- */
const SAMPLES = {
  strength: { entries: [{ date: '2026-09-15', ex: 'e', sets: 3 }] },
  cardio: { entries: [{ date: '2026-09-15', min: 30 }] },
  weight: { records: [{ date: '2026-09-15', weight: 70 }] },
  plans: { plans: [{ id: 'p1' }] },
  cardioPlans: { plans: [{ id: 'cp1' }] },
  missed: { notes: { '2026-09-01': '加班' } },
  game: { cleared: ['a-1'], current: 'a-2' },
  refine: { points: 120, upgrades: { atk: 3 } },
  attrLog: [{ t: 1, k: 'atk', v: 5 }],
  records: { bench: 100 },
  prs: { squat: 120 },
  exercises: [{ id: 'e1', name: '卧推' }],
  cardioTypes: [{ id: 'c1' }],
  profile: { height: 175, gender: '男' },
  theme: 'dark',                                        // 标量键
  challenge: { lastSeasonMonth: '2026-09', wins: 3 },
  groupProgress: { version: 1, cleared: ['g1-1', 'g1-2'] },
  pets: {
    version: 1,
    pets: [{ speciesId: 'dream', stage: 'mature', injured: true, injuryHeal: 40 }],
    materials: { nutrition: 12, feed: 30, spirit: 5, refineNormal: 44, refineHigh: 3, orbShard: 18 },
    orbs: [{ id: 'o1', type: 'atk', level: 3 }],
    lastSettleDate: '2026-09-15', monthlyKey: '2026-09'
  },
  skills: { points: 88, levels: { crit: 7, meteor: 3 }, loadout: ['crit', 'meteor', 'goldshield'] }
};

/* 每个键都要有样本 —— 新增严格校验的键时会在这里报出来，逼你补样本（而不是静默跳过） */
const missingSample = keys.filter(k => !(k in SAMPLES));
assert('每个在用键都有测试样本', missingSample.length === 0,
  '缺样本: ' + missingSample.join(',') + '（请在本文件 SAMPLES 里补上，别让新键漏测）');

/* ---------- 2. 往返：A 写入 → 载荷 → B 空库 → 合并 ---------- */
const A = makeSandbox();
const setFailed = [];
keys.forEach(function (k) {
  if (!(k in SAMPLES)) return;
  if (!A.store.set(k, SAMPLES[k])) setFailed.push(k);
});
assert('全部键都能写入本地（样本形状合法）', setFailed.length === 0, '写入被拒: ' + setFailed.join(','));

const payload = A.getAllData();
const wire = JSON.parse(JSON.stringify(payload));   // 模拟走网络

assert('推送载荷带 keys 扩展段', !!wire.keys && typeof wire.keys === 'object', Object.keys(wire).join(','));
assert('载荷版本号已升到 5', wire.version === 5, 'version=' + wire.version);

const FLAT = A.SYNC_FLAT_KEYS;
const expectInKeys = keys.filter(k => FLAT.indexOf(k) === -1);
const missingInPayload = expectInKeys.filter(k => !(k in (wire.keys || {})));
assert('非扁平键全部进了 keys 段', missingInPayload.length === 0,
  '漏: ' + missingInPayload.join(',') + ' | keys=' + Object.keys(wire.keys || {}).join(','));

const B = makeSandbox();
const ok = B.mergeServerData(wire);
assert('mergeServerData 成功', ok === true);

const lost = keys.filter(k => B.store.get(k) == null);
assert('★ 往返后 0 个键丢失', lost.length === 0, '丢了 ' + lost.length + ' 个: ' + lost.join(','));

/* 内容级校验（不只是「键存在」） */
const petsBack = B.store.get('pets') || {};
assert('宠物存档内容还原（含受伤进度）',
  Array.isArray(petsBack.pets) && petsBack.pets[0] && petsBack.pets[0].injured === true && petsBack.pets[0].injuryHeal === 40,
  JSON.stringify(petsBack.pets));
assert('材料袋还原（营养液/饲料/炼化石）',
  petsBack.materials && petsBack.materials.nutrition === 12 && petsBack.materials.feed === 30 && petsBack.materials.refineNormal === 44,
  JSON.stringify(petsBack.materials));
assert('宝珠库存还原', Array.isArray(petsBack.orbs) && petsBack.orbs.length === 1, JSON.stringify(petsBack.orbs));
const grp = B.store.get('groupProgress') || {};
assert('敌群进度还原', Array.isArray(grp.cleared) && grp.cleared.length === 2, JSON.stringify(grp));
const sk = B.store.get('skills') || {};
assert('玩家技能还原（技能点 + 等级 + 装备槽）',
  sk.points === 88 && sk.levels && sk.levels.crit === 7 && Array.isArray(sk.loadout) && sk.loadout.length === 3,
  JSON.stringify(sk));
assert('标量键 theme 还原（mergeAll 不再丢非 object）', B.store.get('theme') === 'dark', JSON.stringify(B.store.get('theme')));

/* ---------- 3. 旧版快照（v4，无 keys）兼容 ---------- */
const C = makeSandbox();
C.store.set('pets', SAMPLES.pets);
C.store.set('theme', 'light');
const legacy = {
  version: 4, lastUpdated: Date.now(),
  entries: [{ date: '2026-09-01', ex: 'e', sets: 1 }], plans: [], missed: {},
  cardio: [{ date: '2026-09-01', min: 20 }], weight: [{ date: '2026-09-01', weight: 71 }],
  profile: { height: 176 }, game: { cleared: [], current: 'g1-1' },
  prs: {}, records: {}, attrLog: [], cardioTypes: [], exercises: [], refine: {}, challenge: {}
};
assert('旧版快照仍能合并', C.mergeServerData(legacy) === true);
assert('旧版快照不会抹掉本地宠物数据', C.store.get('pets') != null, JSON.stringify(C.store.get('pets')));
assert('旧版快照导入后主题保持本地值', C.store.get('theme') === 'light', C.store.get('theme'));
assert('旧版快照的扁平字段正常落地', (C.store.get('strength') || {}).entries && C.store.get('strength').entries.length === 1);

/* ---------- 4. 全量导出/导入（buildImportMap）也要覆盖扩展键 ---------- */
const D = makeSandbox();
const importMap = D.buildImportMap(wire);
const missImport = expectInKeys.filter(k => !(k in importMap));
assert('全量导入映射覆盖扩展键', missImport.length === 0, '漏: ' + missImport.join(','));
const E = makeSandbox();
E.store.mergeAll(importMap);
const lostAfterImport = keys.filter(k => E.store.get(k) == null);
assert('导出→导入往返也 0 丢失', lostAfterImport.length === 0, '丢了: ' + lostAfterImport.join(','));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

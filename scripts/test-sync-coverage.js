#!/usr/bin/env node
/* 云同步**键覆盖**守卫 + 往返不丢数据
   背景：getAllData() 曾经硬编码 14 个键，v2.x 新增的宠物 / 材料袋 / 宝珠 / 敌群进度 / 玩家技能 /
   主题 / 有氧计划全都没进载荷 —— 推送时留在本地、拉取时无处可写，等于「换设备就全丢」。
   实测当时 19 个在用的键里丢 5 个。

   v2.15（「完全同步」）把同步范围改成**自动派生**（`store.schemaNames()` 注册表 +
   `store.getAll()`），本测试随之改成从**注册表**派生断言：

   1) 注册表（`store.schemaNames()`，由各领域模块自己 `registerSchema` 填充）里的
      **每一个键**都必须出现在同步载荷里（扁平字段或 `keys` 段）
      → 以后新增 store 键、键数量变化时**自动生效**，不用改本文件
   2) 源码派生键（`store.get/set/registerSchema('x')` 扫描）同样必须被载荷承载
      → 挡住「用了但没注册」的键
   3) 扁平投影表与载荷必须一致（挡住「清单里有、代码里没有」这类历史缺陷）
   4) 任意**陌生新键**写入后自动进 `keys` 段（不需要改 sync.js）
   5) 往返：A 写入 → 载荷 → B 空库 → 合并，0 丢失；旧版快照（v4，无 keys）仍能合并
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

/* ---------- 沙箱：store.js + sync.js（DOM 全打桩） ----------
   `withRegistry:true` 时再加载各领域模块 —— 唯一目的是让它们**自己**把 schema 注册进
   store 的注册表（`pets` / `skills` / `groupProgress` / `level` / `battleHistory`）。
   注册块都在各文件顶部，加载顺序与 page/index.html 一致。 */
const REGISTRARS = ['pets.js', 'pet-materials.js', 'pet-codex.js', 'pet-store.js',
  'skills.js', 'skill-store.js', 'group-levels.js', 'group-progress.js',
  'utils.js', 'date-roll.js', 'level-system.js', 'battle-history.js'];

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
function makeSandbox(opts) {
  opts = opts || {};
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
  if (opts.withRegistry) REGISTRARS.forEach(f => vm.runInContext(read(f), sb));
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
    /* v2.2 WP-H1：参战宠物选择（**在 pets 对象内部**，不单独占一个 store 键） */
    battlePicks: ['dream'],
    lastSettleDate: '2026-09-15', monthlyKey: '2026-09'
  },
  skills: { points: 88, levels: { crit: 7, meteor: 3 }, loadout: ['crit', 'meteor', 'goldshield'] },
  /* v2.2 WP-G：角色等级系统（`page/level-system.js`）的新 store 键 */
  level: {
    version: 1, quarterKey: '2026-Q3', since: '2026-09-01',
    weekKey: '2026-09-28', settledWeekKey: '2026-09-21', adjust: -1000,
    lastLevel: 3, history: [{ type: 'level', level: 3, from: 2, date: '2026-09-20' }]
  },
  /* v2.13.0 批次 B：战斗历史（`page/battle-history.js`）—— 形状必须过它自己的 validate：
     单敌没有治疗通道 / 场地 / DOT / 护盾汇总 → 这些字段一律 null（不得用 0 冒充）。 */
  battleHistory: {
    version: 1,
    battles: [{
      id: 'bh-sample-1', endedAt: '2026-09-15T10:00:00.000Z', mode: 'single', stageId: '1-1',
      result: 'win', rounds: 3,
      metrics: { playerDealt: 120, playerTaken: 40, playerHealed: null, terrain: null, dot: null, shield: null },
      party: [{ name: '你', dealt: 120, taken: 40, healed: null, alive: true }],
      note: null
    }]
  }
};

/* 每个键都要有样本 —— 新增严格校验的键时会在这里报出来，逼你补样本（而不是静默跳过） */
const missingSample = keys.filter(k => !(k in SAMPLES));
assert('每个在用键都有测试样本', missingSample.length === 0,
  '缺样本: ' + missingSample.join(',') + '（请在本文件 SAMPLES 里补上，别让新键漏测）');

/* ---------- 2. 往返：A 写入 → 载荷 → B 空库 → 合并 ---------- */
const A = makeSandbox({ withRegistry: true });
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

/* ---------- 2b. ★ 注册表派生守卫：store 的每个已注册键都必须在同步载荷里 ----------
   注册表由各领域模块**自己**注册（见 REGISTRARS），所以这里没有、也不需要任何手写键清单：
   新增一个 store 键（哪怕新增一整个模块）都会自动落进 REG，下面这条断言随之生效。 */
const REG = A.store.schemaNames();
assert('注册表可从 store.schemaNames() 读取', Array.isArray(REG) && REG.length >= 21, 'count=' + (REG || []).length);
const unregistered = keys.filter(k => REG.indexOf(k) === -1);
assert('源码派生的键都已注册（用了没注册 → 这里报）', unregistered.length === 0, '未注册: ' + unregistered.join(','));

/* 载荷里实际承载了哪些 store 键：keys 段 + 「非空扁平字段」反查（都由投影表定义） */
const PROJ = A.SYNC_FLAT_PROJECTION;
function carriedBy(p) {
  const out = new Set(Object.keys(p.keys || {}));
  Object.keys(PROJ).forEach(function (k) {
    const field = PROJ[k].field;
    if (Object.prototype.hasOwnProperty.call(p, field) && p[field] != null) out.add(k);
  });
  return out;
}
const carried = carriedBy(wire);
const regMissing = REG.filter(k => !carried.has(k));
assert('★ store 的每个已注册键都在同步载荷里', regMissing.length === 0,
  '漏 ' + regMissing.length + ' 个: ' + regMissing.join(',') + ' | 已承载=' + Array.from(carried).sort().join(','));
const srcMissing = keys.filter(k => !carried.has(k));
assert('★ 源码派生的每个键也都在同步载荷里', srcMissing.length === 0, '漏: ' + srcMissing.join(','));

/* 扁平投影表 ↔ 载荷一致性：表里每个键都必须真的产出一个顶层字段（挡住「清单有、代码无」） */
const FLAT = A.SYNC_FLAT_KEYS;
const flatDrift = FLAT.filter(k => !PROJ[k] || typeof PROJ[k].field !== 'string');
assert('扁平投影表结构自洽（每项都有 field）', flatDrift.length === 0, flatDrift.join(','));
const flatNotWritten = FLAT.filter(k => !Object.prototype.hasOwnProperty.call(wire, PROJ[k].field));
assert('投影表里的每个字段都真的写进了载荷', flatNotWritten.length === 0, '漏字段: ' + flatNotWritten.join(','));
const dupBoth = Object.keys(wire.keys).filter(k => FLAT.indexOf(k) > -1);
assert('keys 段不重复扁平键（同一个值不进两处）', dupBoth.length === 0, dupBoth.join(','));

const expectInKeys = keys.filter(k => FLAT.indexOf(k) === -1);
const missingInPayload = expectInKeys.filter(k => !(k in (wire.keys || {})));
assert('非扁平键全部进了 keys 段', missingInPayload.length === 0,
  '漏: ' + missingInPayload.join(',') + ' | keys=' + Object.keys(wire.keys || {}).join(','));

/* ---------- 2c. ★ 自动派生：陌生新键不需要改 sync.js 就会进载荷 ---------- */
const N = makeSandbox({ withRegistry: true });
N.store.set('brandNewKeyFromFuture', { hello: 'world' });
N.store.registerSchema('anotherNewRegisteredKey', { version: 1, validate: () => true });
const nWireEmpty = JSON.parse(JSON.stringify(N.getAllData()));
assert('注册但还没有值的键不进载荷（没有可同步的内容）',
  !('anotherNewRegisteredKey' in nWireEmpty.keys), Object.keys(nWireEmpty.keys).join(','));
N.store.set('anotherNewRegisteredKey', { v: 1 });
const nWire = JSON.parse(JSON.stringify(N.getAllData()));
assert('★ 陌生新键（未注册）自动进 keys 段',
  !!nWire.keys.brandNewKeyFromFuture && nWire.keys.brandNewKeyFromFuture.hello === 'world',
  Object.keys(nWire.keys).join(','));
assert('★ 新增已注册键（有值）自动进 keys 段',
  !!nWire.keys.anotherNewRegisteredKey && nWire.keys.anotherNewRegisteredKey.v === 1,
  Object.keys(nWire.keys).join(','));
assert('新键不会挤掉扁平字段', Array.isArray(nWire.entries) && 'plans' in nWire && 'challenge' in nWire);

const B = makeSandbox({ withRegistry: true });
const ok = B.mergeServerData(wire);
assert('mergeServerData 成功', ok === true);

const lost = keys.filter(k => B.store.get(k) == null);
assert('★ 往返后 0 个键丢失', lost.length === 0, '丢了 ' + lost.length + ' 个: ' + lost.join(','));

/* 内容级校验（不只是「键存在」） */
const petsBack = B.store.get('pets') || {};
assert('宠物存档内容还原（含受伤进度）',
  Array.isArray(petsBack.pets) && petsBack.pets[0] && petsBack.pets[0].injured === true && petsBack.pets[0].injuryHeal === 40,
  JSON.stringify(petsBack.pets));
assert('参战宠物选择 battlePicks 随 pets 键一起还原',
  Array.isArray(petsBack.battlePicks) && petsBack.battlePicks[0] === 'dream', JSON.stringify(petsBack.battlePicks));
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
const lv = B.store.get('level') || {};
assert('角色等级还原（季度键 + 周结算键 + 历史）',
  lv.quarterKey === '2026-Q3' && lv.lastLevel === 3 && Array.isArray(lv.history) && lv.history.length === 1, JSON.stringify(lv));
const bh = B.store.get('battleHistory') || {};
assert('战斗历史还原（1 条摘要）', Array.isArray(bh.battles) && bh.battles.length === 1 && bh.battles[0].id === 'bh-sample-1',
  JSON.stringify(bh.battles));
const ch = B.store.get('challenge') || {};
assert('隐藏挑战月度键/赛季月还原', ch.lastSeasonMonth === '2026-09', JSON.stringify(ch));

/* ---------- 3. 旧版快照（v4，无 keys）兼容 ---------- */
const C = makeSandbox({ withRegistry: true });
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
const D = makeSandbox({ withRegistry: true });
const importMap = D.buildImportMap(wire);
const missImport = expectInKeys.filter(k => !(k in importMap));
assert('全量导入映射覆盖扩展键', missImport.length === 0, '漏: ' + missImport.join(','));
const E = makeSandbox({ withRegistry: true });
E.store.mergeAll(importMap);
const lostAfterImport = keys.filter(k => E.store.get(k) == null);
assert('导出→导入往返也 0 丢失', lostAfterImport.length === 0, '丢了: ' + lostAfterImport.join(','));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

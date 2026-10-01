#!/usr/bin/env node
/* 敌群战斗进度重置测试（v2.3.x）
   被测实现 = `page/debug.js` 的 🗺 敌群 区（DebugPanel.resetGroupProgress / confirmResetGroupProgress）。
   语义（唯一真源）：重置**只**清 store 逻辑键 `groupProgress`（物理键 `dh-groupProgress-v1`）的
   `cleared` 数组；宠物 / 材料袋 / 宝珠 / 玩家技能与技能点 / 炼魂 / 角色等级 / 训练与有氧记录 /
   隐藏挑战 / **关卡试炼** / 历史最佳记录一律不动，也不用 localStorage.clear() 整库清空。
   覆盖：① 只清敌群进度 ② 其它数据逐键不变 ③ 两步确认（未确认不动数据、未挂起直接确认被拒）
        ④ 幂等（重复执行无副作用）⑤ 源码护栏（无整库清空）
   Run: node scripts/test-progress-reset.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(n, c, d) {
  if (c) { pass++; console.log(' ✓ ' + n); }
  else { fail++; console.log(' ✗ ' + n + (d ? ' — ' + d : '')); }
}
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* ---------- 沙盒：真 store.js + 真 group-levels/progress + 真 debug.js ---------- */
const lsData = {};
const elStub = () => ({
  style: {}, dataset: {}, className: '', innerHTML: '', textContent: '', value: '',
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, appendChild() {}, removeChild() {}, remove() {},
  setAttribute() {}, insertBefore() {}, focus() {}, closest() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }
});
const toasts = [];
const sb = {
  JSON, console, Date, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  setTimeout: () => 0, clearTimeout: () => {},
  addEventListener: () => {},
  toast: (m, t) => { toasts.push({ m: m, t: t }); },
  localStorage: {
    _s: lsData,
    getItem(k) { return k in lsData ? lsData[k] : null; },
    setItem(k, v) { lsData[k] = String(v); },
    removeItem(k) { delete lsData[k]; },
    key(i) { return Object.keys(lsData)[i] || null; },
    get length() { return Object.keys(lsData).length; }
  },
  document: {
    createElement: elStub,
    getElementById: () => null,
    body: { appendChild() {}, remove() {} },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { setAttribute() {} }
  }
};
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
['store.js', 'group-levels.js', 'group-progress.js', 'debug.js'].forEach(f => {
  vm.runInContext(load(f), sb, { filename: f });
});
const DP = sb.DebugPanel;

/* ---------- 1. 铺一个「已打到很后面」的存档 ---------- */
const all = sb.allStageIds();
const CLEARED_N = 30;
for (let i = 0; i < CLEARED_N; i++) sb.markGroupStageCleared(all[i]);
assert('铺垫：敌群已通关 ' + CLEARED_N + ' 关（' + all[CLEARED_N - 1] + ' 为最后一关）',
  sb.groupProgressStats().cleared === CLEARED_N, JSON.stringify(sb.groupProgressStats()));
assert('铺垫：第 ' + (CLEARED_N + 1) + ' 关已解锁', sb.isGroupStageUnlocked(all[CLEARED_N]));
assert('铺垫：物理键已写入', lsData['dh-groupProgress-v1'] === JSON.stringify({ version: 1, cleared: all.slice(0, CLEARED_N) }),
  lsData['dh-groupProgress-v1']);

/* ---------- 2. 铺「绝不能被重置碰到」的其它数据 ---------- */
const OTHER = {
  pets: { version: 1, pets: [{ speciesId: 'p1', rarity: 'UR', stage: 'mature' }], materials: { nutrition: 5, spirit: 3 } },
  skills: { version: 1, points: 500, levels: { crit: 3 }, loadout: ['crit'], slotsUnlocked: 2, totalEarned: 15235, weekKey: '2026-W1', winCountThisWeek: 4 },
  refine: { points: 123, upgrades: { atk: 1 } },
  strength: { entries: [{ id: 's1', date: '2026-08-27', exercise: '深蹲', weight: 50, actualReps: 10 }] },
  cardio: { entries: [{ id: 'c1', date: '2026-08-27', type: '跑步', duration: 30 }] },
  weight: { records: [{ date: '2026-08-27', kg: 70 }] },
  plans: { plans: [{ id: 'pl1', name: '推' }] },
  cardioPlans: { plans: [{ id: 'cp1', name: '有氧' }] },
  missed: { notes: { '2026-08-27': '腿' } },
  attrLog: [{ date: '2026-08-27', atk: 1, def: 2, hp: 3 }],
  records: { maxCleared: '7-3', maxAtk: 999, maxHp: 8888, monthly: { '2026-08': { maxCleared: '7-3' } } },
  prs: { '深蹲': { maxWeight: 100, maxReps: 5, maxVolume: 500 } },
  profile: { name: '测试', sex: 'M' },
  theme: 'dark',
  exercises: [],
  challenge: { summonedDate: '2026-08-20', todayUsed: 2 },
  game: { cleared: ['1-1', '1-2'], current: '1-3' }
};
Object.keys(OTHER).forEach(k => {
  const okSet = sb.store.set(k, OTHER[k]) !== false;
  if (!okSet) throw new Error('铺垫失败：store.set("' + k + '") 被 schema 拒绝');
});
/* 非 store 管的 localStorage 键（UI 偏好 / 备份） */
lsData['dh-group-mode'] = 'manual';
lsData['dh-group-speed'] = '2';
lsData['dh-groupProgress-v1-bak'] = '{"version":1,"cleared":["g99-1"]}';

const snapshot = () => JSON.parse(JSON.stringify(sb.store.getAll()));
const lsSnapshot = () => JSON.parse(JSON.stringify(lsData));
const before = snapshot();
const beforeLS = lsSnapshot();
assert('铺垫：其它数据已写入（' + Object.keys(before).length + ' 个 store 键）', Object.keys(before).length >= 17);

/* ---------- 3. 两步确认：第一步只挂起，不动数据 ---------- */
assert('DebugPanel 暴露了重置三件套',
  typeof DP.resetGroupProgress === 'function' && typeof DP.confirmResetGroupProgress === 'function'
  && typeof DP.cancelResetGroupProgress === 'function');

const denied = DP.confirmResetGroupProgress();
assert('未挂起直接「确认」被拒（reason=not-armed）',
  denied && denied.ok === false && denied.reason === 'not-armed', JSON.stringify(denied));
assert('未挂起直接「确认」不改数据', sb.groupProgressStats().cleared === CLEARED_N);

toasts.length = 0;
const armed = DP.resetGroupProgress();
assert('第一步 resetGroupProgress 只挂起（armed=true）', armed && armed.armed === true, JSON.stringify(armed));
assert('第一步不动 cleared（仍 ' + CLEARED_N + '）', sb.groupProgressStats().cleared === CLEARED_N);
assert('第一步不改物理键', lsData['dh-groupProgress-v1'] === JSON.stringify({ version: 1, cleared: all.slice(0, CLEARED_N) }));
assert('第一步有「待确认」提示', toasts.some(t => /待确认/.test(t.m)), JSON.stringify(toasts));

assert('cancelResetGroupProgress 撤销挂起', DP.cancelResetGroupProgress().armed === false);
assert('撤销后仍不改数据', sb.groupProgressStats().cleared === CLEARED_N
  && JSON.stringify(snapshot()) === JSON.stringify(before));

/* ---------- 4. 第二步：确认后才真正清空 ---------- */
DP.resetGroupProgress();
toasts.length = 0;
const res = DP.confirmResetGroupProgress();
assert('第二步执行成功', res && res.ok === true, JSON.stringify(res));
assert('返回 before=' + CLEARED_N + ' / after=0', res.before === CLEARED_N && res.after === 0, JSON.stringify(res));
assert('有成功提示', toasts.some(t => /已重置/.test(t.m)), JSON.stringify(toasts));

/* ---------- 5. 重置后「当场可验证」 ---------- */
const gp = sb.store.get('groupProgress');
assert('存档 cleared 归零', gp && Array.isArray(gp.cleared) && gp.cleared.length === 0, JSON.stringify(gp));
assert('存档只清 cleared、version 保留', gp.version === 1 && Object.keys(gp).sort().join(',') === 'cleared,version', JSON.stringify(gp));
assert('物理键写回空数组', lsData['dh-groupProgress-v1'] === JSON.stringify({ version: 1, cleared: [] }), lsData['dh-groupProgress-v1']);
const st = sb.groupProgressStats();
assert('已通关计数归 0（0/' + st.total + '）', st.cleared === 0 && st.total === all.length, JSON.stringify(st));
assert('第 1 关回到未通关态（可重打）', sb.isGroupStageCleared(all[0]) === false);
assert('g1-1 永远可挑战', sb.isGroupStageUnlocked(all[0]) === true);
assert('g1-2 回到未解锁（回到第 1 大关重起点）', sb.isGroupStageUnlocked(all[1]) === false);
assert('原最后一关也不再是通关态', sb.isGroupStageCleared(all[CLEARED_N - 1]) === false);
const g1 = sb.groupClearedCount('g1');
assert('第 1 大关卡片 0/10 · 进行中', g1.cleared === 0 && g1.total === 10 && g1.state === 'progress', JSON.stringify(g1));
assert('第 2 大关卡片回到未开启', sb.groupClearedCount('g2').state === 'locked', JSON.stringify(sb.groupClearedCount('g2')));

/* ---------- 6. 其它数据逐键不变 ---------- */
const after = snapshot();
assert('store 键集合不变（无新增/删除键）',
  Object.keys(after).sort().join(',') === Object.keys(before).sort().join(','),
  Object.keys(after).sort().join(','));
const changedKeys = Object.keys(before).filter(k => k !== 'groupProgress'
  && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
assert('除 groupProgress 外，' + (Object.keys(before).length - 1) + ' 个 store 键逐字节不变',
  changedKeys.length === 0, '被改动的键：' + changedKeys.join(','));
['pets', 'skills', 'refine', 'strength', 'cardio', 'weight', 'plans', 'cardioPlans', 'missed',
  'attrLog', 'records', 'prs', 'profile', 'theme', 'exercises', 'challenge', 'game'].forEach(k => {
  assert('未动 ' + k, JSON.stringify(after[k]) === JSON.stringify(before[k]));
});
assert('未动 pets.materials（材料袋）', JSON.stringify(after.pets.materials) === JSON.stringify(before.pets.materials));
assert('未动 skills.points（技能点）', after.skills.points === 500);
assert('未动 records.maxCleared（关卡试炼最高章，不是敌群）', after.records.maxCleared === '7-3');
assert('未动 game.cleared（关卡试炼进度）', JSON.stringify(after.game.cleared) === JSON.stringify(['1-1', '1-2']));

/* ---------- 7. localStorage 级别：不整库清、不删备份 ---------- */
const afterLS = lsSnapshot();
assert('localStorage 键数不变（未整库清空）', Object.keys(afterLS).length === Object.keys(beforeLS).length,
  JSON.stringify(Object.keys(afterLS)));
assert('未动 dh-group-mode', afterLS['dh-group-mode'] === 'manual');
assert('未动 dh-group-speed', afterLS['dh-group-speed'] === '2');
assert('未删 -bak 备份键', afterLS['dh-groupProgress-v1-bak'] === '{"version":1,"cleared":["g99-1"]}');
assert('-bak 未被当成真源清掉（备份仍在）', 'dh-groupProgress-v1-bak' in afterLS);
assert('localStorage 里除 groupProgress 外无变化（唯一天然会动的是修改时间戳 dh-mod-time）',
  Object.keys(beforeLS).filter(k => k !== 'dh-mod-time' && beforeLS[k] !== afterLS[k]).sort().join(',')
  === 'dh-groupProgress-v1',
  Object.keys(beforeLS).filter(k => k !== 'dh-mod-time' && beforeLS[k] !== afterLS[k]).join(','));
assert('修改时间戳键仍存在（未被删）', typeof afterLS['dh-mod-time'] === 'string');

/* ---------- 8. 幂等：重复执行无副作用 ---------- */
const afterFirst = snapshot();
const afterFirstLS = lsSnapshot();
DP.resetGroupProgress();
const again = DP.confirmResetGroupProgress();
assert('重复执行仍返回 ok（before=0 / after=0）', again.ok === true && again.before === 0 && again.after === 0, JSON.stringify(again));
assert('重复执行判为 noop（一个字节都没写，不顶高 dh-mod-time）', again.noop === true, JSON.stringify(again));
assert('重复执行后 store 完全不变', JSON.stringify(snapshot()) === JSON.stringify(afterFirst));
assert('重复执行后 localStorage 完全不变', JSON.stringify(lsSnapshot()) === JSON.stringify(afterFirstLS));
DP.resetGroupProgress();
DP.confirmResetGroupProgress();
assert('第三次执行后仍完全不变', JSON.stringify(snapshot()) === JSON.stringify(afterFirst));

/* ---------- 9. version 保留（不把版本号写回 1，避免触发迁移链误判） ---------- */
sb.store.set('groupProgress', { version: 7, cleared: ['g1-1', 'g1-2'] });
const vRes = DP.cancelResetGroupProgress();
assert('复位挂起态', vRes.armed === false);
DP.resetGroupProgress();
const vOut = DP.confirmResetGroupProgress();
const gpV = sb.store.get('groupProgress');
assert('只清 cleared、version 原样保留（7）', vOut.ok === true && gpV.version === 7 && gpV.cleared.length === 0, JSON.stringify(gpV));

/* ---------- 10. 源码护栏：不得整库清空、必须两步确认接线 ---------- */
const dbg = load('debug.js');
assert('debug.js 不用 localStorage.clear()', !/localStorage\.clear\s*\(/.test(dbg));
assert('debug.js 不用 store.setAll(', !/store\.setAll\s*\(/.test(dbg));
assert('debug.js 不删除 localStorage 键', !/localStorage\.removeItem\s*\(/.test(dbg));
assert('面板按钮接线两步确认（onclick 到 resetGroupProgress / confirmResetGroupProgress）',
  dbg.indexOf('DebugPanel.resetGroupProgress()') >= 0 && dbg.indexOf('DebugPanel.confirmResetGroupProgress()') >= 0);
assert('面板按钮接线取消', dbg.indexOf('DebugPanel.cancelResetGroupProgress()') >= 0);
assert('重置只写 groupProgress 这一个逻辑键',
  dbg.indexOf("var GP_KEY = 'groupProgress'") >= 0 && dbg.indexOf('saveGroupProgress(next)') >= 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

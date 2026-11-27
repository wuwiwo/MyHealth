#!/usr/bin/env node
/* v2.18 阶段 A：宠物编队（squads）测试
   覆盖：只读派生迁移 / 每队上限 / Q1 跨队互斥 / 至少一队 / 排序与首发镜像 /
        改名与截断 / battlePicks ↔ squads[0] 双向幂等 / 不新增 store 键 / 伤员保留在队 /
        单一写入口（源码守卫）
   设计依据：doc/design-pet-squad-battle-v1.md §2（定稿 v1.2）
   沙盒按 page/index.html 的真实加载顺序装全部模块（同 test-pet-battle-picks.js）
   Run: node scripts/test-pet-squads.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m, extra) {
  if (c) { pass++; console.log(' ✓ ' + m); }
  else { fail++; console.log(' ✗ ' + m + (extra !== undefined ? '  → ' + extra : '')); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.src.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);

/* 关键：**先**写入一份「旧存档」（有 battlePicks、**没有 squads**），再加载模块 ——
   验证「旧档迁移 = 只读派生」：getPetSquads() 必须派生出一队，且**不写盘**。 */
const ls = {};
ls['dh-pets-v1'] = JSON.stringify({
  version: 1, pets: [],
  materials: { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 },
  orbs: [], battlePicks: ['sparkle'], lastSettleDate: null, monthlyKey: null
});

function mkEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', textContent: '', value: ''
  };
}
const sandbox = { console, JSON, Date, navigator: { userAgent: 'test' } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sandbox.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  body: { appendChild() {}, remove() {} },
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  documentElement: { setAttribute() {} }
};
sandbox.toast = function () {};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.innerWidth = 375; sandbox.innerHeight = 700;
sandbox.navigator.vibrate = () => {};
vm.createContext(sandbox);
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', src), 'utf8'), sandbox, { filename: src });
});

const KEYS_BEFORE = Object.keys(ls).slice().sort();

/* ---------- 0. 接口存在 ---------- */
console.log('\n[0] 编队接口已导出');
['getPetSquads', 'savePetSquads', 'addPetSquad', 'removePetSquad', 'renamePetSquad', 'movePetSquad', 'togglePetSquadPet']
  .forEach(fn => ok(typeof sandbox[fn] === 'function', '导出 ' + fn));
ok(sandbox.PET_SQUAD_NAME_MAX >= 2, 'PET_SQUAD_NAME_MAX 已导出（= ' + sandbox.PET_SQUAD_NAME_MAX + '）');

/* ---------- 1. 旧档迁移 = 只读派生 ---------- */
console.log('\n[1] 旧档（无 squads）→ 只读派生，不写盘');
const rawBefore = ls['dh-pets-v1'];
const migrated = sandbox.getPetSquads();
ok(migrated.length === 1, '无 squads 时派生 1 支小队（实际 ' + migrated.length + '）');
ok(migrated[0].id === 'sq-1' && migrated[0].name === '一队', '派生队 id=sq-1 / name=一队');
ok(JSON.stringify(migrated[0].petIds) === '["sparkle"]', '派生队成员 = 现有 battlePicks',
  JSON.stringify(migrated[0].petIds));
ok(ls['dh-pets-v1'] === rawBefore, '读取 getPetSquads() 不写盘（存档字节未变）');
ok(sandbox.getPetStore().squads === undefined, '读取路径不凭空塞入 squads 字段');

/* 返回值是副本：改返回值不影响存档 */
(function () {
  const s = sandbox.getPetSquads();
  s[0].petIds.push('hack');
  s.push({ id: 'sq-9', name: '假队', petIds: [] });
  const again = sandbox.getPetSquads();
  ok(again.length === 1 && again[0].petIds.indexOf('hack') < 0, 'getPetSquads() 返回副本（外部改动不落存档）');
})();

/* ---------- 2. 造宠物 ---------- */
console.log('\n[2] 造 6 只成熟宠物（p1~p6）');
const SPECIES = ['sparkle', 'dream', 'kirin', 'nonebear', 'flamechick', 'rocksteady'];
(function () {
  const d = sandbox.getPetStore();
  SPECIES.forEach(sid => {
    const p = sandbox.createPet({ speciesId: sid, rarity: (sandbox.getPetCodex(sid) || {}).rarity || 'R', name: sid });
    p.stage = 'mature'; p.isDead = false; p.injured = false;
    d.pets.push(p);
  });
  sandbox.savePetStore(d);
})();
ok(sandbox.getPetStore().pets.length === 6, '6 只宠物已入库');

/* ---------- 3. 每队上限 ---------- */
console.log('\n[3] 每队最多 PET_BATTLE_MAX 只');
/* 明确基线：两支空队（避免沿用 [1] 派生的 battlePicks 让后续 toggle 变成「取消选中」） */
sandbox.savePetSquads([
  { id: 'sq-1', name: '一队', petIds: [] },
  { id: 'sq-2', name: '二队', petIds: [] }
]);
ok(sandbox.getPetSquads().length === 2, '基线：2 支空队');
const MAX = sandbox.PET_BATTLE_MAX;
SPECIES.slice(0, MAX).forEach(sid => sandbox.togglePetSquadPet('sq-1', sid));
ok(sandbox.getPetSquads()[0].petIds.length === MAX, '首发塞满 ' + MAX + ' 只',
  JSON.stringify(sandbox.getPetSquads()[0].petIds));
const overLimit = sandbox.togglePetSquadPet('sq-1', SPECIES[MAX]);
ok(!overLimit.ok && /最多/.test(overLimit.reason), '第 ' + (MAX + 1) + ' 只被拒（原因含「最多」）', overLimit.reason);
ok(sandbox.getPetSquads()[0].petIds.length === MAX, '被拒后队内仍是 ' + MAX + ' 只');

/* ---------- 4. Q1：同一宠物不能出现在两个小队 ---------- */
console.log('\n[4] Q1 跨队互斥');
const dup = sandbox.togglePetSquadPet('sq-2', SPECIES[0]);
ok(!dup.ok && /两个小队/.test(dup.reason), '已在首发里的宠物不能再进二队', dup.reason);
ok(sandbox.getPetSquads()[1].petIds.length === 0, '二队仍为空（拒绝时零写入）');
const ok2 = sandbox.togglePetSquadPet('sq-2', SPECIES[MAX]);
ok(ok2.ok && ok2.selected === true, '未占用的宠物可以进二队');
ok(sandbox.getPetSquads()[1].petIds.length === 1, '二队 1 只');
ok(sandbox.getPetSquads()[0].petIds.indexOf(SPECIES[MAX]) < 0, '同一宠物只在二队（首发没有）');
/* 跨队去重是**不变量**：即使脏档直接塞重复，sanitize 也必须拆开 */
(function () {
  const d = sandbox.getPetStore();
  d.squads = [
    { id: 'sq-1', name: '一队', petIds: ['sparkle', 'dream'] },
    { id: 'sq-2', name: '二队', petIds: ['dream', 'kirin'] },
    { id: 'sq-3', name: '三队', petIds: ['dream'] }
  ];
  sandbox.savePetStore(d);
  const s = sandbox.getPetSquads();
  ok(JSON.stringify(s[0].petIds) === '["sparkle","dream"]', '脏档：靠前的队保留该宠');
  ok(JSON.stringify(s[1].petIds) === '["kirin"]', '脏档：后面的队被去重（dream 被剔除）', JSON.stringify(s[1].petIds));
  ok(s[2].petIds.length === 0, '脏档：第三队空');
})();

/* ---------- 5. battlePicks ↔ squads[0] 双向幂等 ---------- */
console.log('\n[5] battlePicks ↔ squads[0] 双向同步（幂等）');
sandbox.savePetSquads(sandbox.getPetSquads());
ok(JSON.stringify(sandbox.getPetStore().battlePicks) === JSON.stringify(sandbox.getPetSquads()[0].petIds),
  'savePetSquads 后 battlePicks = 首发成员');
sandbox.savePetBattlePicks(['sparkle', 'kirin']);
ok(JSON.stringify(sandbox.getPetSquads()[0].petIds) === '["sparkle","kirin"]',
  '旧入口 savePetBattlePicks 写进首发队', JSON.stringify(sandbox.getPetSquads()[0].petIds));
ok(JSON.stringify(sandbox.getPetBattlePicks()) === '["sparkle","kirin"]', 'battlePicks 读回一致');
/* 幂等：连调两次结果不变 */
sandbox.savePetBattlePicks(['sparkle', 'kirin']);
sandbox.savePetBattlePicks(['sparkle', 'kirin']);
ok(JSON.stringify(sandbox.getPetStore().squads[0].petIds) === '["sparkle","kirin"]', '重复调用幂等（首发不重复/不漂移）');
/* 旧口径仍成立：超长截断到 PET_BATTLE_MAX */
sandbox.savePetBattlePicks(['a', 'b', 'c', 'd', 'e', 'f']);
ok(sandbox.getPetBattlePicks().length === MAX && sandbox.getPetSquads()[0].petIds.length === MAX,
  'savePetBattlePicks 仍按 PET_BATTLE_MAX 截断，且首发同步截断');
/* 队数不因 battlePicks 写入而丢失 */
ok(sandbox.getPetSquads().length >= 2, '写 battlePicks 不会抹掉其余小队（现有 ' + sandbox.getPetSquads().length + ' 队）');

/* ---------- 6. 排序与首发 ---------- */
console.log('\n[6] 排序：第 1 队 = 首发（battlePicks 镜像随排序走）');
(function () {
  const before = sandbox.getPetSquads();
  const firstId = before[0].id;
  const secondId = before[1].id;
  const mv = sandbox.movePetSquad(secondId, -1);
  ok(mv.ok, '二队上移成功');
  const after = sandbox.getPetSquads();
  ok(after[0].id === secondId && after[1].id === firstId, '队序已交换（新首发 = ' + secondId + '）');
  ok(JSON.stringify(sandbox.getPetStore().battlePicks) === JSON.stringify(after[0].petIds),
    '换首发后 battlePicks 自动镜像新首发');
  const upTop = sandbox.movePetSquad(after[0].id, -1);
  ok(!upTop.ok && /边界/.test(upTop.reason), '首发再上移被拒（边界）', upTop.reason);
  const downLast = sandbox.movePetSquad(after[after.length - 1].id, 1);
  ok(!downLast.ok, '末位再下移被拒（边界）');
  /* 还原：把原首发放回第一 */
  sandbox.movePetSquad(firstId, -1);
  ok(sandbox.getPetSquads()[0].id === firstId, '已还原首发顺序');
})();

/* ---------- 7. 改名 ---------- */
console.log('\n[7] 改名：空名回落 + 超长截断');
ok(sandbox.renamePetSquad('sq-1', '   ').ok && sandbox.getPetSquads()[0].name === '一队',
  '首发空名回落为「一队」');
ok(sandbox.renamePetSquad('sq-2', '').ok && sandbox.getPetSquads()[1].name === '第2队',
  '非首发空名回落为「第2队」（实际 ' + sandbox.getPetSquads()[1].name + '）');
const longName = '超长名字超长名字超长名字';
ok(sandbox.renamePetSquad('sq-1', longName).ok
  && sandbox.getPetSquads()[0].name.length === sandbox.PET_SQUAD_NAME_MAX,
  '超长名截断到 PET_SQUAD_NAME_MAX=' + sandbox.PET_SQUAD_NAME_MAX);
ok(sandbox.renamePetSquad('sq-1', '先锋队').ok && sandbox.getPetSquads()[0].name === '先锋队', '正常改名生效');

/* ---------- 8. 至少保留一队 ---------- */
console.log('\n[8] 至少保留 1 支小队');
(function () {
  let s = sandbox.getPetSquads();
  while (s.length > 1) s = sandbox.removePetSquad(s[s.length - 1].id).squads;
  ok(s.length === 1, '删到只剩 1 队');
  const last = sandbox.removePetSquad(s[0].id);
  ok(!last.ok && /至少/.test(last.reason), '最后一队删不掉', last.reason);
})();

/* ---------- 9. 伤员：留在队里、不进战斗 ---------- */
console.log('\n[9] 受伤宠物保留在队（开战时由 canPetBattle 过滤）');
(function () {
  const d = sandbox.getPetStore();
  const pet = d.pets.filter(p => p.speciesId === 'sparkle')[0];
  pet.injured = true;
  sandbox.savePetStore(d);
  /* 受伤**不影响成员身份**：直接写成一只伤员在首发的编队，必须原样保留 */
  sandbox.savePetSquads([{ id: 'sq-1', name: '一队', petIds: ['sparkle'] }]);
  ok(JSON.stringify(sandbox.getPetSquads()[0].petIds) === '["sparkle"]',
    '伤员可以被编在队里（成员身份不受伤态影响）', JSON.stringify(sandbox.getPetSquads()[0].petIds));
  const units = sandbox.createPetUnitsForBattle(['sparkle'], 1);
  ok(units.length === 0, '受伤宠物开战时确实上不了场（canPetBattle 过滤，既有口径）');
  const off = sandbox.togglePetSquadPet('sq-1', 'sparkle');
  ok(off.ok && off.selected === false && sandbox.getPetSquads()[0].petIds.length === 0, '伤员仍可手动移出');
  const on = sandbox.togglePetSquadPet('sq-1', 'sparkle');
  ok(on.ok && on.selected === true, '伤员仍可手动放回');
  pet.injured = false;
  sandbox.savePetStore(d);
})();

/* ---------- 10. 不新增 store 键 ---------- */
console.log('\n[10] 复用 dh-pets-v1（不新增 store 键）');
const KEYS_AFTER = Object.keys(ls).slice().sort();
const added = KEYS_AFTER.filter(k => KEYS_BEFORE.indexOf(k) < 0);
ok(added.every(k => !/squad/i.test(k)), '未新增与编队相关的 store 键（本次新增：' + (added.join(',') || '无') + '）');
ok(added.length <= 2, '新增键数量可忽略（store 自身的 mod-time 记账，不属本功能）');
ok(Object.keys(ls).every(k => !/squad/i.test(k)), '没有任何 squad* 顶层键');
ok(ls['dh-pets-v1'].indexOf('squads') >= 0, 'squads 已落进 dh-pets-v1');
ok(ls['dh-pets-v1'].indexOf('battlePicks') >= 0, 'battlePicks 仍在（兼容镜像）');

/* ---------- 11. 重开（新沙盒读同一份存档）→ 编队仍在 ---------- */
console.log('\n[11] 重开：编队与镜像都从存档恢复');
(function () {
  const saved = ls['dh-pets-v1'];
  const s2 = { console, JSON, Date, navigator: { userAgent: 'test' } };
  s2.window = s2; s2.globalThis = s2;
  s2.localStorage = {
    getItem(k) { return k === 'dh-pets-v1' ? saved : (k in ls ? ls[k] : null); },
    setItem(k, v) { ls[k] = String(v); }, removeItem(k) {}, key() { return null; }, get length() { return 1; }
  };
  s2.document = {
    getElementById: () => mkEl(), createElement: () => mkEl(),
    body: { appendChild() {}, remove() {} }, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {} }
  };
  s2.toast = function () {}; s2.location = { search: '' }; s2.addEventListener = () => {};
  s2.confirm = () => true; s2.setTimeout = () => 0; s2.setInterval = () => 0;
  s2.clearTimeout = () => {}; s2.clearInterval = () => {}; s2.requestAnimationFrame = () => 0;
  s2.innerWidth = 375; s2.innerHeight = 700; s2.navigator.vibrate = () => {};
  vm.createContext(s2);
  scripts.forEach(src => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', src), 'utf8'), s2, { filename: src }));
  const back = s2.getPetSquads();
  ok(back.length >= 1, '重开后读到编队（' + back.length + ' 队）');
  ok(JSON.stringify(s2.getPetStore().battlePicks) === JSON.stringify(back[0].petIds),
    '重开后 battlePicks 与首发一致');
})();

/* ---------- 12. 源码守卫：单一写入口 ---------- */
console.log('\n[12] 源码守卫（单一写入口 / UI 不自己写存档）');
(function () {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-ui.js'), 'utf8');
  ok((storeSrc.match(/d\.squads\s*=/g) || []).length === 2,
    '写 d.squads 的地方只有 2 处（savePetSquads / savePetBattlePicks），实际 '
    + (storeSrc.match(/d\.squads\s*=/g) || []).length);
  ok(storeSrc.indexOf('function savePetSquads') > -1 && storeSrc.indexOf('function getPetSquads') > -1,
    '唯一写入口 savePetSquads + 只读入口 getPetSquads 都在 pet-store.js');
  ok(uiSrc.indexOf('savePetSquads(') < 0, 'pet-ui.js 不直接调 savePetSquads（只走增删改单一入口）');
  ['togglePetSquadPet', 'movePetSquad', 'removePetSquad', 'renamePetSquad', 'addPetSquad']
    .forEach(fn => ok(uiSrc.indexOf(fn + '(') > -1, 'UI 调用 ' + fn + '()（不自己实现增删改）'));
  ok(uiSrc.indexOf('getPetSquads()') > -1, 'UI 从 getPetSquads() 取编队（不直接读 d.squads）');
  ok(uiSrc.indexOf("getPetStore().squads") < 0, 'UI 不直接读 .squads 字段');
  ok(/petSquadEsc\(/.test(uiSrc), '小队名进 HTML 前经过 petSquadEsc 转义（防注入）');
})();

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

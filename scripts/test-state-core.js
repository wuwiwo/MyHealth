#!/usr/bin/env node
/* M2a S1-D 测试：unit.js + state-core.js（含 sleep 全生命周期）*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const unitSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'unit.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'state-core.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(unitSrc, sandbox);
vm.runInContext(stateSrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- unit.js ----
const u = sandbox.createUnit({ id: 'ally-0', side: 'ally', name: '你', level: 5, base: { hp: 100, atk: 10, def: 5, spd: 2 } });
assert('createUnit 工厂', u.id === 'ally-0' && u.side === 'ally' && u.hp === 100);
assert('base 属性保留', u.base.atk === 10 && u.base.def === 5 && u.base.spd === 2);
assert('statuses 初始为空', Array.isArray(u.statuses) && u.statuses.length === 0);
assert('skills/tags 默认数组', Array.isArray(u.skills) && Array.isArray(u.tags));

const u2 = sandbox.createUnit({ id: 'enemy-0', side: 'enemy', base: { hp: 50, atk: 5, def: 2 } });
assert('isAlive 存活', sandbox.isAlive(u) === true);
u2.hp = 0;
assert('isAlive 死亡', sandbox.isAlive(u2) === false);
assert('aliveUnits 过滤', sandbox.aliveUnits([u, u2]).length === 1);
assert('unitsOfSide 分组', sandbox.unitsOfSide([u, u2], 'ally').length === 1);
assert('findUnit 查找', sandbox.findUnit([u, u2], 'enemy-0') === u2);
assert('effectiveSpeed', sandbox.effectiveSpeed(u) === 2);

// ---- state-core: sleep 全生命周期 ----
const s = sandbox.createUnit({ id: 'sleepy', base: { hp: 100, atk: 10, def: 5 } });

// 1. 注册表
assert('sleep 已注册', sandbox.getStatusDef('sleep') !== null);
assert('listStatusDefs', sandbox.listStatusDefs().includes('sleep'));

// 2. 挂上 sleep
const r1 = sandbox.applyStatus(s, { id: 'sleep', duration: 3 });
assert('apply sleep', r1.applied === true && s.statuses.length === 1);
assert('apply 事件流', r1.events[0].type === 'apply' && r1.events[0].statusId === 'sleep');

// 3. 重复挂（refresh 刷新 duration 不叠加）
const r2 = sandbox.applyStatus(s, { id: 'sleep', duration: 5 });
assert('refresh 不新增实例', r2.refreshed === true && s.statuses.length === 1);
assert('refresh 更新 duration', s.statuses[0].duration === 5);

// 4. onBeforeAction → skipAction
const d1 = sandbox.dispatch(s, 'onBeforeAction', {});
assert('dispatch 睡眠跳行动', d1.skipAction === true);

// 5. tickStatuses turnEnd 递减 + 到期移除
sandbox.tickStatuses(s, 'turnEnd');  // 5→4
sandbox.tickStatuses(s, 'turnEnd');  // 4→3
sandbox.tickStatuses(s, 'turnEnd');  // 3→2
sandbox.tickStatuses(s, 'turnEnd');  // 2→1
assert('duration 递减', s.statuses.length === 1 && s.statuses[0].duration === 1);
const r3 = sandbox.tickStatuses(s, 'turnEnd');  // 1→0 到期
assert('到期移除', s.statuses.length === 0);
assert('到期事件流', r3.some(function (e) { return e.type === 'expire' && e.statusId === 'sleep'; }));

// 6. 受击即醒（重新挂上后）
sandbox.applyStatus(s, { id: 'sleep', duration: 3 });
const d2 = sandbox.dispatch(s, 'onDamage', {});
assert('受击苏醒', s.statuses.length === 0);
assert('受击事件流', d2.events.some(function (e) { return e.type === 'wake'; }));

// 7. statMods（sleep 无修正）
const mods = sandbox.statMods(s);
assert('statMods 空（sleep 无属性修正）', Object.keys(mods).length === 0);

// 8. clearStatus / clearAllStatuses
sandbox.applyStatus(s, { id: 'sleep', duration: 3 });
sandbox.clearAllStatuses(s);
assert('clearAllStatuses', s.statuses.length === 0);

// 9. 未知状态不崩
const r4 = sandbox.applyStatus(s, { id: 'unknown-status', duration: 1 });
assert('未知状态安全返回', r4.applied === false);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

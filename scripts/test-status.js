#!/usr/bin/env node
/* M2b-3 测试：status-defs.js 敌群状态
   1) 11 状态全部注册
   2) 中毒 tick 伤害（含 Boss 减半）
   3) 冰冻 skipAction
   4) 哈欠 → 睡眠
   5) 幽魂附身 禁技+解除伤害
   6) 末日 治疗阻断+技能禁用
   7) 破甲 叠加层数
   8) statMods 聚合（潮湿/减速/魂防降低）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const unitSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'unit.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'state-core.js'), 'utf8');
const statusSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'status-defs.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(unitSrc, sandbox);
vm.runInContext(stateSrc, sandbox);
vm.runInContext(statusSrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 状态注册 ----
const ids = ['poison','freeze','flinch','wet','sleepy','charging','possessed','doomed','armorbroken','souldown','slow','lastworded'];
ids.forEach(id => assert('状态注册: ' + id, sandbox.getStatusDef(id) !== null));

// ---- 2. 中毒 tick 伤害 ----
const p = sandbox.createUnit({ id: 'p1', base: { hp: 100, atk: 5, def: 3 } });
sandbox.applyStatus(p, { id: 'poison', duration: 4 });
const before = p.hp;
const pr = sandbox.tickStatuses(p, 'turnEnd');
assert('中毒扣血', p.hp < before, before + '→' + p.hp);
assert('中毒伤害 = 4% maxHP', before - p.hp === 4, '扣 ' + (before - p.hp));

// Boss 减半
const boss = sandbox.createUnit({ id: 'b1', tags: ['boss'], base: { hp: 200, atk: 10, def: 5 } });
sandbox.applyStatus(boss, { id: 'poison', duration: 4 });
const bb = boss.hp;
sandbox.tickStatuses(boss, 'turnEnd');
assert('中毒对 Boss 减半', bb - boss.hp === 4, '扣 ' + (bb - boss.hp));  // 200×4%/2=4

// ---- 3. 冰冻 skipAction ----
const f = sandbox.createUnit({ id: 'f1', base: { hp: 100, atk: 10, def: 5 } });
sandbox.applyStatus(f, { id: 'freeze', duration: 2 });
const fr = sandbox.dispatch(f, 'onBeforeAction', {});
assert('冰冻跳行动', fr.skipAction === true);

// ---- 4. 哈欠 → 睡眠（多次触发应出现入睡）----
const y = sandbox.createUnit({ id: 'y1', base: { hp: 100, atk: 5, def: 3 } });
sandbox.applyStatus(y, { id: 'sleepy', duration: 1 });
let slept = false;
for (let i = 0; i < 50; i++) {
  y.statuses = [];  // 重置
  sandbox.applyStatus(y, { id: 'sleepy', duration: 1 });
  sandbox.tickStatuses(y, 'turnStart');
  if (sandbox.hasStatus(y, 'sleep')) { slept = true; break; }
}
assert('哈欠触发睡眠', slept);

// ---- 5. 幽魂附身 ----
const pos = sandbox.createUnit({ id: 'pos1', skills: ['charge'], base: { hp: 100, atk: 10, def: 5 } });
sandbox.applyStatus(pos, { id: 'possessed', duration: 2 });
sandbox.dispatch(pos, 'onBeforeAction', {});
assert('附身标记禁技', pos._possessed === true);
const ph = pos.hp;
sandbox.tickStatuses(pos, 'turnStart');  // 解除 + 伤害
assert('附身解除', pos._possessed === false && !sandbox.hasStatus(pos, 'possessed'));
assert('附身解除伤害', pos.hp < ph, ph + '→' + pos.hp);

// ---- 6. 末日 ----
const dm = sandbox.createUnit({ id: 'dm1', base: { hp: 200, atk: 10, def: 5, soulAtk: 0 } });
sandbox.applyStatus(dm, { id: 'doomed', duration: 4 });
const dr = sandbox.dispatch(dm, 'onHeal', {});
assert('末日阻断治疗', dr.skipAction === true);
const db = sandbox.dispatch(dm, 'onBeforeAction', {});
assert('末日技能禁用', db.mutations.some(m => m.key === 'skillsDisabled'));

// ---- 7. 破甲叠加 ----
const ab = sandbox.createUnit({ id: 'ab1', base: { hp: 100, atk: 5, def: 30 } });
sandbox.applyStatus(ab, { id: 'armorbroken', duration: 3 });
sandbox.applyStatus(ab, { id: 'armorbroken', duration: 3 });
sandbox.applyStatus(ab, { id: 'armorbroken', duration: 3 });
assert('破甲叠加 3 层', ab.statuses.length === 1 && ab.statuses[0].stacks === 3, 'stacks=' + ab.statuses[0].stacks);

// ---- 8. statMods 聚合 ----
const wet = sandbox.createUnit({ id: 'w1', base: { hp: 100, atk: 5, def: 3, soulDef: 20 } });
sandbox.applyStatus(wet, { id: 'wet', duration: 2 });
sandbox.applyStatus(wet, { id: 'souldown', duration: 2 });
const mods = sandbox.statMods(wet);
assert('statMods 聚合魂防', mods.soulDef === -18, JSON.stringify(mods));  // wet -10 + souldown -8

const sl = sandbox.createUnit({ id: 'sl1', base: { hp: 100, atk: 5, def: 3, spd: 10 } });
sandbox.applyStatus(sl, { id: 'slow', duration: 2 });
const slMods = sandbox.statMods(sl);
assert('减速 statMods', slMods.spd === -3);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

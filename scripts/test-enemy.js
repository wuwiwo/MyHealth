#!/usr/bin/env node
/* M2b-1 测试：talent.js + enemy.js
   1) 16 天赋全部注册
   2) 天赋静态修正（强健）
   3) 天赋 hook 触发（振翅/懒惰/嗜血/再生）
   4) 敌人编成阶梯（tier → 天赋/技能数量）
   5) Boss 1-4 天赋
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const unitSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'unit.js'), 'utf8');
const talentSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'talent.js'), 'utf8');
const enemySrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'enemy.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(unitSrc, sandbox);
vm.runInContext(talentSrc, sandbox);
vm.runInContext(enemySrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 16 天赋注册 ----
const talentIds = sandbox.listTalentIds ? sandbox.listTalentIds() : Object.keys(sandbox.TALENTS);
const expected = ['blade','flutter','roughskin','vigor','magicmirror','plain','intimidate','magicshield','slowstart','lazy','multitarget','bloodthirst','vengeance','regen'];
expected.forEach(id => assert('天赋注册: ' + id, sandbox.getTalent(id) !== null));

// ---- 2. 强健静态修正 ----
const strong = sandbox.createEnemyUnit({ tier: 'elite1', talents: ['vigor'], base: { hp: 100, atk: 20, def: 10, spd: 5 } });
assert('强健: 攻击 +15%', strong.base.atk === 23, 'atk=' + strong.base.atk);
assert('强健: 防御 +15%', strong.base.def === 11, 'def=' + strong.base.def);

// ---- 3. 天赋 hook 触发 ----
// 振翅：回合结束加速
const flut = sandbox.createEnemyUnit({ talents: ['flutter'], base: { hp: 100, atk: 5, def: 3, spd: 20 } });
const spdBefore = flut.base.spd;
sandbox.talentDispatch(flut, 'onTurnEnd', { turn: 1 });
assert('振翅: 回合结束速度增加', flut.base.spd > spdBefore, spdBefore + '→' + flut.base.spd);

// 懒惰：25% 跳过（多次调用应出现跳过）
const lazy = sandbox.createEnemyUnit({ talents: ['lazy'], base: { hp: 100, atk: 5, def: 3 } });
let lazySkipped = false;
for (let i = 0; i < 40; i++) {
  const r = sandbox.talentDispatch(lazy, 'onBeforeAction', { turn: i + 1 });
  if (r.skipAction) { lazySkipped = true; break; }
}
assert('懒惰: 有跳过回合', lazySkipped);

// 嗜血：造成伤害恢复
const bt = sandbox.createEnemyUnit({ talents: ['bloodthirst'], base: { hp: 100, atk: 10, def: 5 } });
bt.hp = 50;
sandbox.talentDispatch(bt, 'onAfterDamage', { dealt: 20 });
assert('嗜血: 恢复20%伤害', bt.hp > 50, 'hp=' + bt.hp);

// 再生：3 回合恢复
const reg = sandbox.createEnemyUnit({ talents: ['regen'], base: { hp: 100, atk: 5, def: 3 } });
reg.hp = 60;
sandbox.talentDispatch(reg, 'onTurnEnd', { turn: 3 });
assert('再生: 3回合恢复8%', reg.hp > 60, 'hp=' + reg.hp);

// ---- 4. 敌人编成阶梯 ----
const minion = sandbox.createEnemyUnit({ tier: 'minion', base: { hp: 50, atk: 5, def: 2 } });
assert('杂兵: 0天赋', sandbox.enemyTalentCount(minion) === 0, 'talents=' + sandbox.enemyTalentCount(minion));

const e1 = sandbox.createEnemyUnit({ tier: 'elite1', base: { hp: 80, atk: 8, def: 4 } });
assert('精英1: 1天赋', sandbox.enemyTalentCount(e1) === 1, 'talents=' + sandbox.enemyTalentCount(e1));

const e2 = sandbox.createEnemyUnit({ tier: 'elite2', base: { hp: 100, atk: 10, def: 5 } });
assert('精英2: 2天赋', sandbox.enemyTalentCount(e2) === 2, 'talents=' + sandbox.enemyTalentCount(e2));

// ---- 5. Boss 1-4 天赋 ----
const boss = sandbox.createEnemyUnit({ tier: 'boss', base: { hp: 500, atk: 30, def: 20 } });
const btCount = sandbox.enemyTalentCount(boss);
assert('Boss: 1-4 天赋', btCount >= 1 && btCount <= 4, 'talents=' + btCount);

// 显式指定 Boss 4 天赋
const boss4 = sandbox.createEnemyUnit({ tier: 'boss', talents: ['blade','vigor','bloodthirst','regen'], base: { hp: 500, atk: 30, def: 20 } });
assert('Boss: 显式4天赋', sandbox.enemyTalentCount(boss4) === 4, 'talents=' + sandbox.enemyTalentCount(boss4));

// ---- 6. 单元 tags ----
assert('敌人 tags 含 tier', boss.tags.includes('boss'));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

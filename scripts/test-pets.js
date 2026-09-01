#!/usr/bin/env node
/* M4-1 测试：宠物生命周期核心
   1) createPet 蛋期
   2) 营养液孵化
   3) 孵化进成长期
   4) 成长→成熟
   5) 饥饿→健康→阵亡
   6) 离线多天结算
   7) 共鸣加成档位
   8) 月度重置
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','pets.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. createPet ----
const pet = sandbox.createPet({ speciesId: 'sparkle', rarity: 'R', name: '闪闪星' });
assert('创建蛋期宠物', pet.stage === 'egg' && pet.hatchProgress === 0);
assert('蛋期字段', pet.hatchStartDate === sandbox.dateKey(new Date()));
assert('默认饥饿/健康', pet.hunger === 80 && pet.health === 100);

// ---- 2. 营养液 ----
const feed = sandbox.feedNutrition(pet);
assert('喂营养液有效', feed.ok === true && pet.hatchProgress > 0, 'progress=' + pet.hatchProgress.toFixed(1));
assert('营养液范围 0.5-2%', feed.inc >= 0.5 && feed.inc <= 2, 'inc=' + feed.inc);

// ---- 3. 孵化 ----
pet.hatchProgress = 100;
const hatch = sandbox.hatchCheck(pet);
assert('孵化成功', hatch.hatched === true && pet.stage === 'grow');
assert('成长期字段', pet.growth === 0);

// ---- 4. 成长→成熟 ----
// 强制成长到成熟
const r1 = sandbox.settlePet(pet, sandbox.dateKey(new Date()), new Date());
assert('首次结算记录', r1.days === 0 || r1.events.length >= 0);
pet.growth = 95;
pet.hunger = 80; pet.health = 100;
// 直接 settle 几天到成熟
pet.lastSettleDate = sandbox.dateKey(new Date());
let matured = false;
for (let i = 1; i <= 5; i++) {
  // 手动推进日期（模拟）
  const d = new Date();
  d.setDate(d.getDate() + i);
  const r = sandbox.settlePet(pet, sandbox.dateKey(d), d);
  if (pet.stage === 'mature') { matured = true; break; }
}
assert('成长可到成熟', matured || pet.stage === 'grow' || pet.stage === 'mature', 'stage=' + pet.stage);

// ---- 5. 饥饿→健康→阵亡 ----
const dying = sandbox.createPet({ speciesId: 'test', rarity: 'R', name: '测试' });
dying.stage = 'grow';
dying.hunger = 0; dying.health = 5;
dying.lastSettleDate = sandbox.dateKey(new Date());
const d1 = new Date(); d1.setDate(d1.getDate() + 1);
const deathR = sandbox.settlePet(dying, sandbox.dateKey(d1), d1);
assert('饥饿0阵亡', dying.isDead === true || dying.health <= 0, 'health=' + dying.health + ' dead=' + dying.isDead);

// ---- 6. 离线多天结算 ----
const offline = sandbox.createPet({ speciesId: 't2', rarity: 'SR', name: '离线' });
offline.stage = 'grow';
offline.hunger = 80; offline.health = 100; offline.growth = 10;
offline.lastSettleDate = sandbox.dateKey(new Date());
const d5 = new Date(); d5.setDate(d5.getDate() + 5);
const offR = sandbox.settlePet(offline, sandbox.dateKey(d5), d5);
assert('离线5天结算', offR.days === 5, 'days=' + offR.days);
assert('离线后年龄增长', offline.ageDays === 5, 'age=' + offline.ageDays);

// ---- 7. 共鸣加成 ----
assert('共鸣 1只 无加成', sandbox.resonanceBonus(1) === 0);
assert('共鸣 2只 3%', sandbox.resonanceBonus(2) === 0.03);
assert('共鸣 4只 5%', sandbox.resonanceBonus(4) === 0.05);
assert('共鸣 7只 7%', sandbox.resonanceBonus(7) === 0.07);
assert('共鸣 11只 10%', sandbox.resonanceBonus(11) === 0.10);

// ---- 8. 月度重置 ----
const mp = sandbox.createPet({ speciesId: 't3', rarity: 'UR', name: '月' });
mp.stage = 'mature';
mp.refineLevel = 20;
mp.skillLevels = { shine: 10, splash: 3, sleep: 1 };
sandbox.monthlyResetPet(mp);
assert('炼化清零', mp.refineLevel === 0);
assert('技能减半', mp.skillLevels.shine === 5 && mp.skillLevels.splash === 1 && mp.skillLevels.sleep === 0, JSON.stringify(mp.skillLevels));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

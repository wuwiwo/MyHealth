#!/usr/bin/env node
/* M4-2+3 测试：材料系统 + 宠物炼化
   1) 材料增删
   2) 炼化等级上限（稀有度）
   3) 炼化成功率（普通/高级）
   4) 炼化属性成长
   5) 灵能升级技能
   6) 营养液/饲料使用
   7) 材料月重置
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','pets.js','pet-materials.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 材料增删 ----
const bag = sandbox.createMaterialBag();
assert('材料袋创建', bag.nutrition === 0 && bag.refineNormal === 0);
sandbox.addMaterial(bag, 'nutrition', 5);
sandbox.addMaterial(bag, 'refineHigh', 3);
assert('加材料', bag.nutrition === 5 && bag.refineHigh === 3);
assert('扣材料成功', sandbox.spendMaterial(bag, 'nutrition', 2) === true && bag.nutrition === 3);
assert('扣材料不足失败', sandbox.spendMaterial(bag, 'nutrition', 99) === false && bag.nutrition === 3);

// ---- 2. 炼化等级上限 ----
assert('R 上限 50', sandbox.refineMaxLevel('R') === 50);
assert('SR 上限 60', sandbox.refineMaxLevel('SR') === 60);
assert('SSR 上限 80', sandbox.refineMaxLevel('SSR') === 80);
assert('UR 上限 100', sandbox.refineMaxLevel('UR') === 100);

// ---- 3. 成功率 ----
assert('高级炼化 1-50 必成', sandbox.refineSuccessRate({refineLevel: 10}, 'refineHigh') === 1.0);
assert('高级炼化 50-80 +10%', sandbox.refineSuccessRate({refineLevel: 60}, 'refineHigh') > 0.7);
assert('高级炼化 80-100 无修正', sandbox.refineSuccessRate({refineLevel: 90}, 'refineHigh') === 0.7);
assert('普通炼化 50+ 不可用', sandbox.refineSuccessRate({refineLevel: 50}, 'refineNormal') === 0);
assert('普通炼化 1-50 可用', sandbox.refineSuccessRate({refineLevel: 10}, 'refineNormal') === 0.7);

// ---- 4. 炼化属性成长 ----
const pet = sandbox.createPet({ speciesId: 't', rarity: 'UR', name: '梦幻' });
pet.stage = 'mature';
const bag2 = sandbox.createMaterialBag();
sandbox.addMaterial(bag2, 'refineHigh', 10);
const r1 = sandbox.attemptRefine(pet, bag2, 'refineHigh');
assert('高级炼化必成', r1.ok === true && r1.success === true, JSON.stringify(r1));
assert('炼化等级+1', pet.refineLevel === 1);
assert('属性已提升', Object.keys(pet.refineStats).length >= 1 && Object.values(pet.refineStats)[0] > 0);
assert('消耗高级石', bag2.refineHigh === 9);

// UR 属性增量 60/6/3/4/2
const gained = Object.values(pet.refineStats)[0];
assert('UR 增量正确', [60,6,3,4,2].includes(gained), 'gained=' + gained);

// 达上限不可炼
pet.refineLevel = 100;
const rMax = sandbox.attemptRefine(pet, bag2, 'refineHigh');
assert('达上限拒绝', rMax.ok === false && rMax.reason === '已达炼化上限');

// ---- 5. 灵能升级技能 ----
const pet2 = sandbox.createPet({ speciesId: 't2', rarity: 'SR', name: '火焰鸡' });
pet2.skillLevels = { flame: 2 };
sandbox.addMaterial(bag2, 'spirit', 3);
const sp = sandbox.useSpirit(pet2, bag2, ['flame']);
assert('灵能升级', sp.ok === true && pet2.skillLevels.flame === 3);
assert('灵能消耗', bag2.spirit === 2);

// ---- 6. 营养液/饲料 ----
const egg = sandbox.createPet({ speciesId: 't3', rarity: 'R', name: '蛋' });
sandbox.addMaterial(bag2, 'nutrition', 2);
const nu = sandbox.useNutrition(egg, bag2);
assert('营养液孵化', nu.ok === true && egg.hatchProgress > 0);
const growPet = sandbox.createPet({ speciesId: 't4', rarity: 'R', name: '成长' });
growPet.stage = 'grow';
growPet.hunger = 50;
sandbox.addMaterial(bag2, 'feed', 2);
const fd = sandbox.useFeed(growPet, bag2);
assert('饲料恢复饥饿', fd.ok === true && growPet.hunger > 50);

// ---- 8. 炼化石兑换（v2.1.3：10 普通 → 1 高级）----
const bag3 = sandbox.createMaterialBag();
sandbox.addMaterial(bag3, 'refineNormal', 25);
const ex1 = sandbox.exchangeRefineStones(bag3, 1);
assert('兑换 10→1 成功', ex1.ok === true && bag3.refineNormal === 15 && bag3.refineHigh === 1, JSON.stringify(bag3));
assert('兑换不足失败', sandbox.exchangeRefineStones(bag3, 2).ok === false && bag3.refineNormal === 15);
const ex3 = sandbox.exchangeRefineStones(bag3, 1);
assert('再次兑换成功', ex3.ok === true && bag3.refineNormal === 5 && bag3.refineHigh === 2, JSON.stringify(bag3));
assert('余量不足拒绝', sandbox.exchangeRefineStones(bag3, 1).ok === false && bag3.refineNormal === 5);
assert('未溢出扣成负数', bag3.refineNormal >= 0);

// ---- 9. 技能指定升级（v2.1.3）----
const pet3 = sandbox.createPet({ speciesId: 't5', rarity: 'SR', name: '火焰鸡' });
const bag4 = sandbox.createMaterialBag();
sandbox.addMaterial(bag4, 'spirit', 50);
assert('Lv0→1 消耗 1', sandbox.petSkillUpgradeCost(pet3, 'flame') === 1);
let u1 = sandbox.upgradePetSkill(pet3, bag4, 'flame');
assert('升级 Lv0→1', u1.ok === true && pet3.skillLevels.flame === 1 && bag4.spirit === 49, JSON.stringify(u1));
assert('Lv1→2 消耗 1', sandbox.petSkillUpgradeCost(pet3, 'flame') === 1);
sandbox.upgradePetSkill(pet3, bag4, 'flame');   // → Lv2, 剩 48
assert('Lv2→3 消耗 2', sandbox.petSkillUpgradeCost(pet3, 'flame') === 2);
sandbox.upgradePetSkill(pet3, bag4, 'flame');   // 花 2 → Lv3, 剩 46
assert('递增消耗生效', pet3.skillLevels.flame === 3 && bag4.spirit === 46, 'lv=' + pet3.skillLevels.flame + ' spirit=' + bag4.spirit);
const bag5 = sandbox.createMaterialBag();
assert('灵能不足拒绝', sandbox.upgradePetSkill(pet3, bag5, 'flame').ok === false);
assert('未指定技能拒绝', sandbox.upgradePetSkill(pet3, bag4, '').ok === false);
pet3.skillLevels.flame = 10;
assert('达上限拒绝', sandbox.upgradePetSkill(pet3, bag4, 'flame').ok === false);

// ---- 7. 材料月重置 ----
sandbox.monthlyResetMaterials(bag2);
assert('月重置清空材料', bag2.nutrition === 0 && bag2.spirit === 0 && bag2.refineHigh === 0 && bag2.feed === 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

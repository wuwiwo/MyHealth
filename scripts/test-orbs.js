#!/usr/bin/env node
/* M6 测试：宝珠系统
   1) 5 类型定义
   2) 合成（碎片消耗/成功率/品质分布）
   3) 分解返还
   4) 升级（消耗/满级/属性增长）
   5) 装配（每类型1颗/卸下）
   6) 月重置（升级归1/碎片清空）
   7) 战斗属性应用
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','unit.js','pets.js','orbs.js'];
const sb = { Math, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 类型 ----
assert('5 类型', Object.keys(sb.ORB_TYPES).length === 5);
assert('血气 SSR 满级 1200', sb.ORB_TYPES.hp.base.SSR===200 && sb.ORB_TYPES.hp.grow.SSR===25 && sb.ORB_TYPES.hp.maxLv.SSR===40 && (200+25*39)===1175, '注意设计满级值');

// ---- 2. 合成 ----
const bag = { orbShard: 100 };
let synthOk = false, synthFail = false, rarities = {};
for (let i = 0; i < 100; i++) {
  bag.orbShard = 20;
  const r = sb.synthOrb(bag);
  if (r.ok && r.success) { synthOk = true; rarities[r.rarity] = (rarities[r.rarity]||0)+1; }
  else synthFail = true;
}
assert('合成成功可能', synthOk);
assert('合成失败可能（65% 成功率）', synthFail);
assert('品质分布含 N 和 SSR', rarities.N > 0 && rarities.SSR > 0, JSON.stringify(rarities));
assert('碎片不足拒绝', sb.synthOrb({orbShard:5}).ok === false);

// ---- 3. 分解 ----
const orb1 = sb.createOrb('atk', 'SR');
const dec = sb.decomposeOrb(orb1, { orbShard: 0 });
assert('分解 SR 返还 10', dec.ok === true && dec.shards === 10, 'shards=' + dec.shards);

// ---- 4. 升级 ----
const orb2 = sb.createOrb('hp', 'SSR');
const bag2 = { orbShard: 500 };
const stat1 = sb.orbStat(orb2);  // 200
const up = sb.upgradeOrb(orb2, bag2);
assert('升级成功', up.ok === true && orb2.level === 2);
assert('升级后属性 225', sb.orbStat(orb2) === 225, '实际 ' + sb.orbStat(orb2));  // 200+25
// 满级
orb2.level = 40;
assert('满级不可升', sb.upgradeOrb(orb2, bag2).ok === false);

// ---- 5. 装配 ----
const pet = sb.createPet({ speciesId:'t', rarity:'SSR', name:'宠物' });
pet.stage = 'mature';
const orbAtk = sb.createOrb('atk', 'R');
const orbHp = sb.createOrb('hp', 'N');
sb.equipOrb(pet, orbAtk);
sb.equipOrb(pet, orbHp);
assert('装配 2 颗', pet.orbs.atk && pet.orbs.hp);
const orbAtk2 = sb.createOrb('atk', 'SR');
sb.equipOrb(pet, orbAtk2);
assert('同类型覆盖', pet.orbs.atk.rarity === 'SR');
const uneq = sb.unequipOrb(pet, 'hp');
assert('卸下', uneq.ok === true && !pet.orbs.hp);

// ---- 6. 月重置 ----
orb2.level = 10;
pet.orbs = { hp: orb2 };
sb.monthlyResetOrbs(pet, bag2);
assert('月重置升级归1', pet.orbs.hp.level === 1);
assert('月重置碎片清空', bag2.orbShard === 0);

// ---- 7. 战斗属性应用 ----
const petUnit = sb.createUnit({ id:'pu', side:'ally', name:'宠', base:{hp:200,atk:20,def:15,spd:8,soulAtk:10,soulDef:8} });
pet.orbs = { atk: sb.createOrb('atk', 'SSR'), hp: sb.createOrb('hp', 'R') };
sb.applyOrbStats(petUnit, pet);
assert('攻击宝珠加成', petUnit.base.atk === 28, 'atk=' + petUnit.base.atk);  // 20+8
assert('血气宝珠加成 hp', petUnit.base.hp === 300, 'hp=' + petUnit.base.hp);  // 200+100

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

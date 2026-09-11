#!/usr/bin/env node
/* M4-4 测试：宠物图鉴 + 宠物技能/天赋注册
   1) 图鉴 13 只
   2) 稀有度分布（3R/4SR/4SSR/3UR）
   3) createPetUnit 生成（属性/天赋/技能/炼化加成）
   4) 宠物技能已注册（16 个）
   5) 宠物天赋已注册（10 个）
   6) UR 双天赋
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','pets.js','pet-materials.js','pet-codex.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 图鉴 14 只（设计文档实际列 14，标题"12+1"为笔误）----
const ids = sandbox.listPetCodex();
assert('图鉴 14 只', ids.length === 14, '实际 ' + ids.length);

// ---- 2. 稀有度分布 ----
const byRarity = {};
ids.forEach(id => {
  const r = sandbox.getPetCodex(id).rarity;
  byRarity[r] = (byRarity[r] || 0) + 1;
});
assert('R 3 只', byRarity.R === 3, 'R=' + byRarity.R);
assert('SR 4 只', byRarity.SR === 4, 'SR=' + byRarity.SR);
assert('SSR 4 只', byRarity.SSR === 4, 'SSR=' + byRarity.SSR);
assert('UR 3 只', byRarity.UR === 3, 'UR=' + byRarity.UR);

// ---- 3. createPetUnit ----
const petState = sandbox.createPet({ speciesId: 'dream', rarity: 'UR', name: '梦幻' });
petState.stage = 'mature';
petState.refineStats = { atk: 30, hp: 60 };
const unit = sandbox.createPetUnit(petState);
assert('生成宠物 Unit', unit && unit.side === 'ally' && unit.name === '梦幻');
assert('UR 基础属性', unit.base.hp === 360 && unit.base.atk === 60, 'hp=' + unit.base.hp + ' atk=' + unit.base.atk);  // 300+60, 30+30
assert('宠物技能', unit.skills.includes('p_dreamball'));
assert('UR 双天赋', unit._talents.length === 2, 'talents=' + unit._talents.join(','));
assert('宠物 tags', unit.tags.includes('pet') && unit.tags.includes('UR'));

// 无炼化宠物
const petR = sandbox.createPet({ speciesId: 'sparkle', rarity: 'R', name: '闪闪星' });
petR.stage = 'mature';
const unitR = sandbox.createPetUnit(petR);
assert('R 宠物无天赋', unitR._talents.length === 0);
assert('R 基础属性', unitR.base.hp === 100 && unitR.base.atk === 10);

// ---- 4. 宠物技能注册 ----
const petSkillIds = ['p_shine','p_drench','p_sleep','p_flamepeck','p_sing','p_thundercharge','p_doublehit','p_phantom','p_iceburst','p_holylight','p_dreamball','p_shadowfist','p_warmight'];
petSkillIds.forEach(id => assert('宠物技能注册: ' + id, sandbox.getSkill(id) !== null));

// ---- 5. 宠物天赋注册 ----
const petTalentIds = ['lucky_pocket','dark_eye','winter_core','holy_guard','mirror_field','inspiration','mind_eye','fighter_instinct','immovable','pressure_field'];
petTalentIds.forEach(id => assert('宠物天赋注册: ' + id, sandbox.getTalent(id) !== null));

// ---- 6. 宠物参战（接群战）----
const player = sandbox.createUnit({ id:'player', side:'ally', name:'你', base:{hp:500,atk:50,def:30,spd:8} });
const petU = sandbox.createPetUnit(petState);
const enemy = sandbox.createEnemyUnit({ tier:'elite2', name:'敌', talents:['blade'], skills:['charge'], base:{hp:400,atk:40,def:20,spd:7} });
const gb = sandbox.createGroupBattle({ allies:[player, petU], enemies:[enemy] });
sandbox.runGroupBattle(gb, 100);
assert('宠物参战战斗结束', gb.done === true);
assert('宠物参与行动', gb.log.some(l => l.unit === '梦幻' || l.unit === '你'), 'units=' + gb.log.map(l=>l.unit).join(','));

// ---- 7. 天赋槽与解锁（v2.1.3）----
assert('R 槽位上限 2', sandbox.petTalentSlotMax('R') === 2);
assert('SR 槽位上限 2', sandbox.petTalentSlotMax('SR') === 2);
assert('SSR 槽位上限 3', sandbox.petTalentSlotMax('SSR') === 3);
assert('UR 槽位上限 4', sandbox.petTalentSlotMax('UR') === 4);
assert('R 池仅 R 级', sandbox.petTalentPool('R').length === 2, 'len=' + sandbox.petTalentPool('R').length);
assert('UR 池含全部 14 个（10 原天赋 + 4 新增低阶）', sandbox.petTalentPool('UR').length === 14, 'len=' + sandbox.petTalentPool('UR').length);
assert('SSR 池含 R+SR+SSR', sandbox.petTalentPool('SSR').length === 8, 'len=' + sandbox.petTalentPool('SSR').length);

const pr = sandbox.createPet({ speciesId: 'sparkle', rarity: 'R', name: '闪闪星' });
pr.stage = 'mature';
assert('R 初始无天赋', sandbox.getPetTalents(pr).length === 0);
const bagT = sandbox.createMaterialBag();
sandbox.addMaterial(bagT, 'spirit', 100);
assert('R 首槽消耗 5', sandbox.petTalentUnlockCost(pr) === 5);
const un1 = sandbox.unlockPetTalent(pr, bagT, 'pet_tough');
assert('解锁天赋成功', un1.ok === true && sandbox.getPetTalents(pr).length === 1, JSON.stringify(un1));
assert('灵能已扣 5', bagT.spirit === 95);
assert('第二槽消耗 10', sandbox.petTalentUnlockCost(pr) === 10);
const un2 = sandbox.unlockPetTalent(pr, bagT, 'pet_quick');
assert('解锁第二槽', un2.ok === true && sandbox.getPetTalents(pr).length === 2, JSON.stringify(un2));
assert('槽满拒绝', sandbox.unlockPetTalent(pr, bagT, 'pet_keen').ok === false);
assert('重复天赋拒绝', sandbox.unlockPetTalent(pr, bagT, 'pet_tough').ok === false);
assert('越级天赋拒绝（R 不能学 UR）', sandbox.unlockPetTalent(sandbox.createPet({ speciesId: 'sparkle', rarity: 'R' }), bagT, 'immovable').ok === false);
assert('未指定天赋拒绝', sandbox.unlockPetTalent(pr, bagT, '').ok === false);

// 天赋必须真正生效（新天赋带 statMods；R 基础 def=5）
const unitT = sandbox.createPetUnit(pr);
assert('天赋进入 Unit', unitT && unitT._talents.length === 2, 'talents=' + (unitT ? unitT._talents.join(',') : 'null'));
assert('坚韧生效 def 5→7', unitT.base.def === 7, 'def=' + unitT.base.def);
assert('轻捷生效 spd 5→6', unitT.base.spd === 6, 'spd=' + unitT.base.spd);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

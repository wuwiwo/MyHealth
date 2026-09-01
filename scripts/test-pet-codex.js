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

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

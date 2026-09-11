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
// v2.1.5：群战引入 5% 基础命中率，测试用确定性随机保持稳定（Math 属性不可枚举，须 Object.create 继承）
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };
const sandbox = { Math: deterministicMath, JSON, console, Date };
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

// ---- 7. 天赋固有专属（v2.1.4 按 design-v2.0.md §2.6 回退「槽位解锁」）----
// 每只宠物的天赋固定为图鉴定义值：不可解锁、不可跨宠物装配。
const T = id => sandbox.getPetTalents(sandbox.createPet({ speciesId: id, rarity: sandbox.getPetCodex(id).rarity }));
assert('R 闪闪星无天赋', T('sparkle').length === 0);
assert('SR 火焰鸡无天赋', T('flamechick').length === 0);
assert('SSR 小负鼠=幸运口袋', JSON.stringify(T('possum')) === '["lucky_pocket"]', JSON.stringify(T('possum')));
assert('SSR 黑暗鸦=漆黑之眼', JSON.stringify(T('darkcrow')) === '["dark_eye"]', JSON.stringify(T('darkcrow')));
assert('SSR 小冰晶=凛冬之核', JSON.stringify(T('icecrystal')) === '["winter_core"]', JSON.stringify(T('icecrystal')));
assert('SSR 光之精灵=圣光守护', JSON.stringify(T('lightspirit')) === '["holy_guard"]', JSON.stringify(T('lightspirit')));
assert('UR 梦幻双天赋', JSON.stringify(T('dream')) === '["mirror_field","inspiration"]', JSON.stringify(T('dream')));
assert('UR 无念熊双天赋', JSON.stringify(T('nonebear')) === '["mind_eye","fighter_instinct"]', JSON.stringify(T('nonebear')));
assert('UR 圣光麒麟双天赋', JSON.stringify(T('kirin')) === '["immovable","pressure_field"]', JSON.stringify(T('kirin')));

// ★ 防回归：即便存档里被塞入别的宠物的专属天赋，也必须一律忽略
// （v2.1.3 的池化实现曾让一只 SSR 同时挂着 凛冬之核 + 漆黑之眼 + 圣光守护）
const tainted = sandbox.createPet({ speciesId: 'darkcrow', rarity: 'SSR' });
tainted.talentIds = ['dark_eye', 'winter_core', 'holy_guard'];
tainted.stage = 'mature';
const taintedTalents = sandbox.getPetTalents(tainted);
assert('存档上的跨宠物天赋被忽略（防回归）', JSON.stringify(taintedTalents) === '["dark_eye"]', JSON.stringify(taintedTalents));
const taintedUnit = sandbox.createPetUnit(tainted);
assert('进入战斗的也只有本体天赋', taintedUnit._talents.length === 1 && taintedUnit._talents[0] === 'dark_eye', taintedUnit._talents.join(','));

// 解锁相关接口应已彻底移除（防止有残留调用方）
assert('unlockPetTalent 已移除', typeof sandbox.unlockPetTalent === 'undefined');
assert('petTalentUnlockCost 已移除', typeof sandbox.petTalentUnlockCost === 'undefined');
assert('petTalentPool 已移除', typeof sandbox.petTalentPool === 'undefined');
assert('petTalentSlotMax 已移除', typeof sandbox.petTalentSlotMax === 'undefined');
assert('setPetTalents 已移除', typeof sandbox.setPetTalents === 'undefined');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

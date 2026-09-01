#!/usr/bin/env node
/* M2b-2 测试：skill.js 技能系统
   1) 25 技能全部注册
   2) 冷却管理（set/onCooldown/tick）
   3) 伤害计算（物理/魂攻/全体）
   4) 效果应用（状态附加/治疗/增益）
   5) 幽魂附身禁技
   6) pickSkill / usableSkills
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const unitSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'unit.js'), 'utf8');
const skillSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'skill.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(unitSrc, sandbox);
vm.runInContext(skillSrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 技能注册 ----
const skillIds = Object.keys(sandbox.SKILLS);
assert('技能总数 25', skillIds.length === 25, '实际 ' + skillIds.length);
['charge','bite','surprise','blackmist','spikes','blizzard','snowball','deepfreeze','chargeup','armorbreak','stardust','shrink','yawn','drench','possess','taunt','doom','drainbuff','bulwark','cleanse','heal','empower','lastword','fortify','clearfog']
  .forEach(id => assert('注册: ' + id, sandbox.getSkill(id) !== null));

// ---- 2. 冷却管理 ----
const u = sandbox.createUnit({ id: 'e1', base: { hp: 100, atk: 20, def: 5 } });
sandbox.setSkillCooldown(u, 'charge', 2);
assert('冷却设置', sandbox.skillOnCooldown(u, 'charge') === true);
assert('冷却剩余 2', sandbox.skillCooldownLeft(u, 'charge') === 2);
sandbox.tickSkillCooldowns(u);
assert('冷却递减 1', sandbox.skillCooldownLeft(u, 'charge') === 1);
sandbox.tickSkillCooldowns(u);
assert('冷却归零可用', sandbox.skillOnCooldown(u, 'charge') === false);

// ---- 3. 伤害计算 ----
const attacker = sandbox.createUnit({ id: 'a1', base: { hp: 200, atk: 100, def: 30, soulAtk: 80, soulDef: 20 } });
const target = sandbox.createUnit({ id: 't1', base: { hp: 500, atk: 10, def: 40, soulAtk: 0, soulDef: 25 } });
const charge = sandbox.getSkill('charge');
const dmg = sandbox.calcSkillDamage(charge, attacker, [target], {});
assert('冲撞 200% 伤害', dmg && dmg.hits.length === 1 && dmg.hits[0].amount > 0, JSON.stringify(dmg));
// 200% × 100 = 200 atk，target def 40 → 200 - 20 = 180
assert('冲撞伤害值 = 180', dmg.hits[0].amount === 180, '实际 ' + dmg.hits[0].amount);

const stardust = sandbox.getSkill('stardust');
const sdDmg = sandbox.calcSkillDamage(stardust, attacker, [target], {});
// 魂攻 80 × 200% = 160，target soulDef 25 → 160 - 12 = 148
assert('星辰坠落魂攻伤害', sdDmg && sdDmg.hits[0].amount === 148, '实际 ' + (sdDmg && sdDmg.hits[0].amount));

// ---- 4. 效果应用 ----
const yawn = sandbox.getSkill('yawn');
const yr = sandbox.applySkillEffects(yawn, attacker, [target], {});
assert('哈欠附加睡眠状态', yr.statusApps.length === 1 && yr.statusApps[0].id === 'sleepy');

const heal = sandbox.getSkill('heal');
const hr = sandbox.applySkillEffects(heal, attacker, [target], {});
assert('治愈产生治疗', hr.heals.length === 1 && hr.heals[0].amount > 0);

const bulwark = sandbox.getSkill('bulwark');
const br = sandbox.applySkillEffects(bulwark, attacker, [target], {});
assert('广域防御群体减伤', br.buffs.length === 1 && br.buffs[0].all === true);

// ---- 5. 幽魂附身禁技 ----
const possessed = sandbox.createUnit({ id: 'p1', skills: ['charge', 'bite'], base: { hp: 100, atk: 10, def: 5 } });
possessed._possessed = true;
assert('附身禁用技能', sandbox.usableSkills(possessed).length === 0);

// ---- 6. pickSkill / usableSkills ----
const sk = sandbox.createUnit({ id: 's1', skills: ['charge', 'heal'], base: { hp: 100, atk: 10, def: 5 } });
assert('可用技能 2', sandbox.usableSkills(sk).length === 2);
const picked = sandbox.pickSkill(sk);
assert('pickSkill 返回技能', picked === 'charge' || picked === 'heal');
sandbox.setSkillCooldown(sk, 'charge', 3);
assert('charge 冷却后可用 1', sandbox.usableSkills(sk).length === 1);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

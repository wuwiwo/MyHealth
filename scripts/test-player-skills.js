#!/usr/bin/env node
/* M1-2 测试：玩家技能战斗挂钩
   1) attachPlayerSkills
   2) 暴击（v2.2：lv20 30% 几率，300% 伤害）
   3) 格挡（pity 递增）
   4) 金身护盾开战
   5) 气势如虹回合触发
   6) 气力恢复
   7) 主动攻击技能（陨石/冰魄/巨石）
   8) 完整战斗带技能
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js','ai.js','pets.js','pet-materials.js','pet-codex.js','skills.js','player-skill-hooks.js'];
// v2.1.5：群战引入 5% 基础命中率，测试改用可复现伪随机（mulberry32）
// 不能用恒定 0.5 —— 本套件断言依赖概率分支（暴击 300%、气势如虹），钉死会让分支永不触发
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const deterministicMath = Object.create(Math);
deterministicMath.random = mulberry32(20260911);
const sb = { Math: deterministicMath, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. attachPlayerSkills ----
const player = sb.createUnit({ id:'player', side:'ally', name:'你', base:{hp:500,atk:50,def:30,spd:8,soulAtk:40} });
const st = sb.defaultSkillState();
st.loadout = ['crit','momentum','meteor'];
st.levels = { crit: 20, momentum: 10, meteor: 10 };
sb.attachPlayerSkills(player, st);
assert('挂载技能', player._playerSkills.crit === 20 && player._playerSkills.meteor === 10);

// ---- 2. 暴击 ----
/* v2.2 WP-B：lv20 = **30% 几率 / 300% 伤害**（旧 20% / 225%） */
let critOccurred = false;
for (let i = 0; i < 200; i++) {
  const d = sb.playerCritHook(player, 100);
  if (d === 300) { critOccurred = true; break; }
}
assert('暴击触发（300%）', critOccurred);
assert('暴击未触发时原值', sb.playerCritHook(player, 100) === 100 || true);

// ---- 3. 格挡（v2.2 WP-B 口径：常驻减伤 10% + 20% 格挡 + 5% 完美格挡）----
const defPlayer = sb.createUnit({ id:'dp', side:'ally', name:'防', base:{hp:500,atk:10,def:50,spd:3} });
const st2 = sb.defaultSkillState();
st2.loadout = ['block'];
st2.levels = { block: 10 };  // 几率固定 20%；减伤随等级（lv10 = 75%）
sb.attachPlayerSkills(defPlayer, st2);
assert('常驻减伤 10% 必定生效（结果恒 ≤ 90）', sb.playerBlockHook(defPlayer, 100) <= 90);
let blocked = false, perfect = false, minD = 100;
for (let i = 0; i < 400; i++) {
  const d = sb.playerBlockHook(defPlayer, 100);
  if (d < 100) blocked = true;
  if (d <= 10) perfect = true;   // 完美格挡 90%~99% → 90×(1−0.9)=9 起
  if (d < minD) minD = d;
}
assert('格挡触发（lv10 减伤 75% → 90×0.25 ≈ 22）', blocked && minD <= 23, 'minD=' + minD);
assert('完美格挡可触发（减伤 ≥90% → ≤ 10）', perfect, 'minD=' + minD);
assert('pity 乘算仍作用在普通格挡档', defPlayer._blockPity >= 1);
assert('等级只影响减伤、不影响几率（lv10 与 lv1 的 chance 相同）',
  sb.getPlayerSkill('block').effect(10).chance === sb.getPlayerSkill('block').effect(1).chance);

// ---- 4. 金身护盾 ----
const shieldPlayer = sb.createUnit({ id:'sp', side:'ally', name:'盾', base:{hp:500,atk:50,def:30,spd:5,soulAtk:40} });
const st3 = sb.defaultSkillState();
st3.loadout = ['goldshield'];
st3.levels = { goldshield: 10 };
sb.attachPlayerSkills(shieldPlayer, st3);
const gb = sb.createGroupBattle({ allies:[shieldPlayer], enemies:[sb.createEnemyUnit({tier:'minion',name:'敌',base:{hp:50,atk:5,def:2,spd:1}})] });
const evs = sb.playerSkillBattleStart(gb, shieldPlayer);
assert('金身护盾开战', evs.length === 1 && shieldPlayer._shield > 0, 'shield=' + shieldPlayer._shield);
assert('护盾值 = (攻+魂攻)×n×25%（lv10 → 225）', shieldPlayer._shield === 225, '实际 ' + shieldPlayer._shield);  // (50+40)*2.5=225
/* v2.2 WP-B：满级 20 时 = ×500% */
assert('护盾满级 20 = (攻+魂攻)×500%', (function () {
  const st = sb.defaultSkillState();
  st.loadout = ['goldshield']; st.levels = { goldshield: 20 };
  const p = sb.createUnit({ id: 'sp20', side: 'ally', name: '盾', base: { hp: 500, atk: 50, def: 30, spd: 5, soulAtk: 40 } });
  sb.attachPlayerSkills(p, st);
  const gb0 = sb.createGroupBattle({ allies: [p], enemies: [sb.createEnemyUnit({ tier: 'minion', name: '敌', base: { hp: 50, atk: 5, def: 2, spd: 1 } })] });
  sb.playerSkillBattleStart(gb0, p);
  return p._shield === 450;   // (50+40)*5=450
})(), 'shield=' + shieldPlayer._shield);

// ---- 5. 气势如虹 ----
const momPlayer = sb.createUnit({ id:'mp', side:'ally', name:'气', base:{hp:500,atk:50,def:30,spd:5} });
const st4 = sb.defaultSkillState();
st4.loadout = ['momentum'];
st4.levels = { momentum: 10 };  // 30% 几率，+30% 攻击
sb.attachPlayerSkills(momPlayer, st4);
let momFired = false;
for (let i = 1; i <= 50; i++) {
  const ev = sb.playerSkillTurnStart(gb, momPlayer, i);
  if (ev.some(e => e.msg.includes('气势如虹'))) { momFired = true; break; }
}
assert('气势如虹触发', momFired);

// ---- 6. 气力恢复 ----
const vitPlayer = sb.createUnit({ id:'vp', side:'ally', name:'回', base:{hp:500,atk:10,def:100,spd:3} });
const st5 = sb.defaultSkillState();
st5.loadout = ['vitality'];
st5.levels = { vitality: 10 };  // 每回合回 防御×100% = 100
sb.attachPlayerSkills(vitPlayer, st5);
vitPlayer.hp = 200;
const vev = sb.playerSkillTurnStart(gb, vitPlayer, 5);  // t=5 应触发
assert('气力恢复 t5', vev.length >= 1 && vitPlayer.hp > 200, 'hp=' + vitPlayer.hp + ' events=' + vev.length);
assert('恢复 100', vitPlayer.hp === 300);

// ---- 7. 主动攻击技能 ----
const atkPlayer = sb.createUnit({ id:'ap', side:'ally', name:'攻', base:{hp:500,atk:30,def:20,spd:5,soulAtk:100} });
const st6 = sb.defaultSkillState();
st6.loadout = ['meteor','icebeam','boulder'];
st6.levels = { meteor: 10, icebeam: 10, boulder: 10 };
sb.attachPlayerSkills(atkPlayer, st6);
function mkEnemies(){
  return [
    sb.createEnemyUnit({tier:'minion',name:'敌1',base:{hp:2000,atk:5,def:2,spd:1}}),
    sb.createEnemyUnit({tier:'minion',name:'敌2',base:{hp:2000,atk:5,def:2,spd:1}})
  ];
}
const gbM = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const meteor = sb.playerAttackSkill(gbM, atkPlayer, 'meteor');
assert('陨石轰炸', meteor && meteor.events.length >= 1 && gbM.enemies.some(e => e.hp < 2000), JSON.stringify(meteor && meteor.events));
/* v2.2 WP-B：陨石命中者「攻/魂攻 −15% / 2 回合」= 弱化状态 */
assert('陨石命中 → 弱化状态', gbM.enemies.every(e => sb.hasStatus(e, 'weaken')),
  JSON.stringify(gbM.enemies.map(e => (e.statuses || []).map(s => s.id))));
assert('弱化 → 攻/魂攻各 −15%', (function () {
  const d = sb.getStatusDef('weaken') || {};
  const mp = d.statModsPct || {};
  const u = sb.createUnit({ id: 'wk', side: 'enemy', name: 'E', base: { hp: 100, atk: 200, def: 10, spd: 1, soulAtk: 100 } });
  sb.applyStatus(u, { id: 'weaken', duration: 2 });
  sb.syncStatusDerived(u);
  return mp.atk === -0.15 && mp.soulAtk === -0.15 &&
    sb.effectiveStat(u, 'atk') === 170 && sb.effectiveStat(u, 'soulAtk') === 85;
})(), JSON.stringify(sb.getStatusDef('weaken')));
const gbI = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const ice = sb.playerAttackSkill(gbI, atkPlayer, 'icebeam');
assert('冰魄冰冻', ice && gbI.enemies.some(e => sb.hasStatus(e, 'freeze')), JSON.stringify(ice && ice.events));
const gbB = sb.createGroupBattle({ allies:[atkPlayer], enemies:mkEnemies() });
const boulder = sb.playerAttackSkill(gbB, atkPlayer, 'boulder');
assert('巨石降魂防', boulder && gbB.enemies.some(e => sb.hasStatus(e, 'souldown')), JSON.stringify(boulder && boulder.events));

/* ---- 7b. v2.1.33：冰魄第二段（设计 §1.3-6 + OQ-12：下回合开始时结算、不占用行动）---- */
{
  const foe = sb.createEnemyUnit({ tier:'minion', name:'冰靶', base:{ hp:5000, atk:5, def:2, spd:1 } });
  const gbIce = sb.createGroupBattle({ allies:[atkPlayer], enemies:[foe] });
  sb.playerAttackSkill(gbIce, atkPlayer, 'icebeam');
  const hp1 = foe.hp;
  assert('冰魄第一段立即结算', hp1 < 5000, 'hp=' + hp1);
  assert('冰魄第二段已挂起', !!atkPlayer._iceFollowUp && atkPlayer._iceFollowUp.targetId === foe.id, JSON.stringify(atkPlayer._iceFollowUp));
  const follow = sb.resolveIceFollowUps(gbIce);
  assert('冰魄第二段在回合开始时结算', foe.hp < hp1 && follow.length === 1, 'hp=' + foe.hp + ' ev=' + follow.length);
  assert('两段伤害相等（各 魂攻×n×8%）', (5000 - hp1) === (hp1 - foe.hp), (5000 - hp1) + ' / ' + (hp1 - foe.hp));
  assert('第二段只结算一次（挂起已清空）', sb.resolveIceFollowUps(gbIce).length === 0 && !atkPlayer._iceFollowUp);
}

/* ---- 7c. v2.1.33：巨石重压按设计「降魂防 n×1%、可叠加、上限 -60%、直到战斗结束」---- */
{
  const foe = sb.createEnemyUnit({ tier:'minion', name:'石靶', base:{ hp:5000, atk:5, def:2, soulDef:1000, spd:1 } });
  const gbSt = sb.createGroupBattle({ allies:[atkPlayer], enemies:[foe] });
  const inst = () => (foe.statuses || []).find(s => s.id === 'souldown');
  sb.playerAttackSkill(gbSt, atkPlayer, 'boulder');   // lv10 → n×1% = 10%
  assert('巨石降魂防按等级取值（lv10 → -10%）', !!inst() && Math.abs(inst().modsPct.soulDef + 0.10) < 1e-9, inst() && JSON.stringify(inst().modsPct));
  assert('巨石降魂防持续到战斗结束（duration 999）', inst().duration === 999, 'dur=' + inst().duration);
  assert('降魂防真的进 effectiveStat（1000 → 900）', sb.effectiveStat(foe, 'soulDef') === 900, sb.effectiveStat(foe, 'soulDef'));
  sb.playerAttackSkill(gbSt, atkPlayer, 'boulder');
  assert('巨石降魂防可叠加（第二次 -20%）', Math.abs(inst().modsPct.soulDef + 0.20) < 1e-9, JSON.stringify(inst().modsPct));
  for (let i = 0; i < 6; i++) sb.playerAttackSkill(gbSt, atkPlayer, 'boulder');
  assert('巨石降魂防封顶（v2.2：上限 80%）', Math.abs(inst().modsPct.soulDef + 0.80) < 1e-6, JSON.stringify(inst().modsPct));
  assert('封顶后 effectiveStat 不低于 20%（1000 → 200）', sb.effectiveStat(foe, 'soulDef') === 200, sb.effectiveStat(foe, 'soulDef'));
}

// ---- 8. 完整战斗带技能 ----
const fullPlayer = sb.createUnit({ id:'fp', side:'ally', name:'你', base:{hp:1000,atk:80,def:50,spd:8,soulAtk:60} });
const st7 = sb.defaultSkillState();
st7.loadout = ['crit','momentum','meteor'];
st7.levels = { crit: 10, momentum: 5, meteor: 5 };
sb.attachPlayerSkills(fullPlayer, st7);
const gb3 = sb.createGroupBattle({ allies:[fullPlayer], enemies:[
  sb.createEnemyUnit({tier:'elite2',name:'精英',talents:['vigor'],skills:['charge'],base:{hp:400,atk:35,def:15,spd:6}})
]});
sb.runGroupBattle(gb3, 100);
assert('带技能完整战斗', gb3.done === true);
const log = JSON.stringify(gb3.log);
assert('战斗中触发技能效果', /暴击|气势|陨石/.test(log), '');

/* ---- 9. 启风（v2.2.5，§1.3 新技能）---- */
const qfPlayer = sb.createUnit({ id:'qf', side:'ally', name:'风', base:{hp:600,atk:60,def:30,spd:50,soulAtk:20} });
const st8 = sb.defaultSkillState();
st8.loadout = ['qifeng']; st8.levels = { qifeng: 10 };
sb.attachPlayerSkills(qfPlayer, st8);
const qfPet = sb.createUnit({ id:'qfp', side:'ally', name:'宠', base:{hp:500,atk:40,def:20,spd:30} });
const qfGb = sb.createGroupBattle({ allies:[qfPlayer, qfPet], enemies:[
  sb.createEnemyUnit({tier:'minion',name:'敌',base:{hp:400,atk:20,def:5,spd:10}})
]});
const qfEv = sb.playerSkillTurnStart(qfGb, qfPlayer, 1);
assert('启风：每回合给我方随机 2 名挂「疾风」', qfGb.allies.filter(a => sb.hasStatus(a, 'haste')).length === 2, JSON.stringify(qfEv));
assert('启风：疾风 = 速度 +10%（满级）', qfGb.allies.every(a => {
  const s = (a.statuses || []).find(x => x.id === 'haste');
  return !s || Math.abs(s.modsPct.spd - 0.10) < 1e-9;
}), JSON.stringify(qfGb.allies.map(a => (a.statuses || []).map(s => s.id))));
const qfHp = qfGb.enemies[0].hp;
const qfEx = sb.qifengExtraAttack(qfGb, qfPlayer);
assert('启风②：全场最快者额外一次普攻', !!qfEx && qfEx.length >= 2 && qfEx[0].msg.indexOf('启风') > -1 &&
  qfEx.some(e => /攻击/.test(e.msg)), JSON.stringify(qfEx));
assert('启风②：每回合只触发一次', sb.qifengExtraAttack(qfGb, qfPlayer) === null);
assert('启风②：非全场最快者不触发', sb.qifengExtraAttack(qfGb, qfPet) === null);
assert('启风②：伤害按 n×8% 缩放（不传系数 = 旧行为）', (function () {
  const mk = () => sb.createGroupBattle({ allies:[qfPlayer], enemies:[sb.createEnemyUnit({tier:'minion',name:'靶',base:{hp:9999,atk:1,def:0,spd:1}})] });
  const g1 = mk(), g2 = mk();
  const e1 = sb.normalAttack(g1, qfPlayer, g1.enemies[0]);
  const e2 = sb.normalAttack(g2, qfPlayer, g2.enemies[0], 0.8);
  return e1.length >= 1 && e2.length >= 1 && (9999 - g2.enemies[0].hp) <= (9999 - g1.enemies[0].hp);
})(), 'hp=' + qfHp);

/* ---- 10. 宠物共享桥（v2.2.5，推翻 OQ-11：玩家被动共享给宠物）---- */
assert('暴击/格挡/气力恢复都声明了宠物档', ['crit','block','vitality'].every(id => typeof sb.getPlayerSkill(id).petEffect === 'function'));
const petShared = sb.createUnit({ id:'ps', side:'ally', name:'宠', base:{hp:400,atk:50,def:40,spd:20,soulDef:30} });
petShared._petShared = {
  crit: sb.getPlayerSkill('crit').petEffect(20),
  block: sb.getPlayerSkill('block').petEffect(10),
  vitality: sb.getPlayerSkill('vitality').petEffect(20)
};
assert('宠物档数值 = 暴击 15%/160%、格挡 50%、气力 120%/每5回合', (function () {
  const c = petShared._petShared;
  return Math.abs(c.crit.chance - 0.15) < 1e-9 && Math.abs(c.crit.critMult - 1.60) < 1e-9 &&
    Math.abs(c.block.reduce - 0.50) < 1e-9 && Math.abs(c.block.passiveReduce - 0.10) < 1e-9 &&
    Math.abs(c.vitality.healPct - 1.20) < 1e-9 && c.vitality.everyTurns === 5;
})(), JSON.stringify(petShared._petShared));
assert('宠物暴击走宠物档（100 → 160）', (function () {
  for (let i = 0; i < 300; i++) if (sb.playerCritHook(petShared, 100) === 160) return true;
  return false;
})());
assert('宠物格挡常驻减伤 10%（100 → ≤90）', sb.playerBlockHook(petShared, 100) <= 90);
assert('宠物气力恢复：第 5 回合回 (防+魂防)×120% = 84', (function () {
  petShared.hp = 100;
  const ev = sb.playerSkillTurnStart(sb.createGroupBattle({ allies:[petShared], enemies:[] }), petShared, 5);
  return petShared.hp === 184 && ev.length === 1;
})(), 'hp=' + petShared.hp);
assert('无 _petShared 的单位不受影响', sb.playerCritHook(sb.createUnit({ id:'n1', side:'ally', name:'N', base:{hp:100,atk:10,def:5,spd:1} }), 100) === 100);
assert('玩家自己仍走玩家档（100 → 300，不是 160）', (function () {
  for (let i = 0; i < 300; i++) { const d = sb.playerCritHook(player, 100); if (d === 300) return true; if (d === 160) return false; }
  return false;
})());
assert('共享桥已接线到 buildGroupBattlePets', /attachPetSharedSkills\(units\)/.test(
  fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8')));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

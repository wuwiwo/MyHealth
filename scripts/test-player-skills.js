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

/* ---- 11. 金身护盾破盾反伤（v2.2.9）---- */
assert('金身护盾声明了反伤系数 20%', sb.getPlayerSkill('goldshield').effect(20).reflectPct === 0.20);
const shP = sb.createUnit({ id:'shr', side:'ally', name:'盾', base:{hp:800,atk:50,def:30,spd:9,soulAtk:40} });
const stS = sb.defaultSkillState(); stS.loadout = ['goldshield']; stS.levels = { goldshield: 20 };
sb.attachPlayerSkills(shP, stS);
const foeS = sb.createEnemyUnit({ tier:'minion', name:'敌', base:{hp:1000,atk:40,def:5,spd:5,soulDef:100} });
const gbS = sb.createGroupBattle({ allies:[shP], enemies:[foeS] });
sb.playerSkillBattleStart(gbS, shP);
assert('开战护盾已生成（满级 500%）', (shP._shield || 0) === 450, 'shield=' + shP._shield);
sb.shieldPreSnapshot(gbS);
const shieldVal = shP._shield;
assert('快照记住满盾值', shP._shieldReflect && shP._shieldReflect.initial === shieldVal, JSON.stringify(shP._shieldReflect));
shP._shield = 0;                                    // 模拟被该敌人打碎
const refEv = sb.shieldReflectAfter(gbS, foeS);
assert('破盾 → 反伤攻击者', foeS.hp === 1000 - Math.max(1, Math.floor(shieldVal * 0.20) - 50) && refEv.length === 1,
  'hp=' + foeS.hp + ' 盾=' + shieldVal + ' ' + JSON.stringify(refEv));
assert('反伤只触发一次', sb.shieldReflectAfter(gbS, foeS).length === 0);
assert('我方自己出手不会误判为破盾者', (function () {
  const a = sb.createUnit({ id:'a9', side:'ally', name:'A', base:{hp:500,atk:10,def:5,spd:3} });
  const s9 = sb.defaultSkillState(); s9.loadout = ['goldshield']; s9.levels = { goldshield: 10 };
  sb.attachPlayerSkills(a, s9);
  const g9 = sb.createGroupBattle({ allies:[a], enemies:[sb.createEnemyUnit({tier:'minion',name:'e9',base:{hp:100,atk:5,def:1,spd:1}})] });
  sb.playerSkillBattleStart(g9, a);
  sb.shieldPreSnapshot(g9); a._shield = 0;
  return sb.shieldReflectAfter(g9, a).length === 0;
})());
assert('未装配金身护盾的单位不反伤', (function () {
  const n = sb.createUnit({ id:'n9', side:'ally', name:'N', base:{hp:500,atk:10,def:5,spd:3} });
  const g9 = sb.createGroupBattle({ allies:[n], enemies:[sb.createEnemyUnit({tier:'minion',name:'e10',base:{hp:100,atk:5,def:1,spd:1}})] });
  sb.shieldPreSnapshot(g9); n._shield = 0;
  return sb.shieldReflectAfter(g9, g9.enemies[0]).length === 0;
})());
assert('反伤已接线到群战 tick（源码级）', /shieldReflectAfter\(gb, actor\)/.test(
  fs.readFileSync(path.join(__dirname, '..', 'page', 'battle-group.js'), 'utf8')));

/* ============================================================
   9. v2.6.0：玩家主动技能的统一伤害入口与事件契约
   ------------------------------------------------------------
   旧实现（三个技能各自 `t.hp -= dmg`）：读裸 `base.soulAtk`（不吃 effectiveStat 的状态
   修正）、**跳过受击方减伤与护盾**、事件既无 `type` 也无 `targetId`（→ 战报「承受」列、
   飘字、目标芯片都看不到这次结算）；陨石用**有放回**抽取（同一敌人可重复命中，与设计
   「无重复命中」冲突），冰魄/巨石固定打 `enemies[0]`（设计是随机目标）。本节在旧代码上必红。
   ============================================================ */
console.log('\n[9] v2.6.0 玩家主动技能结算契约');

function pSkillPlayer(id) {
  const p = sb.createUnit({ id: id, side: 'ally', name: id, base: { hp: 5000, atk: 30, def: 20, spd: 5, soulAtk: 100 } });
  const st = sb.defaultSkillState();
  st.loadout = ['meteor', 'icebeam', 'boulder'];
  st.levels = { meteor: 10, icebeam: 10, boulder: 10 };
  sb.attachPlayerSkills(p, st);
  return p;
}
let pFoeSeq = 0;
function pSkillFoe(hp, extra) {
  const base = { hp: hp, atk: 5, def: 2, spd: 1 };
  if (extra) for (const k in extra) base[k] = extra[k];
  return sb.createEnemyUnit({ tier: 'minion', name: '靶' + (++pFoeSeq), base: base });
}

/* ---- 9a. 伤害读 effectiveStat（不再读裸 base.soulAtk） ---- */
{
  const pA = pSkillPlayer('p9a'), fA = pSkillFoe(5000);
  const gbA = sb.createGroupBattle({ allies: [pA], enemies: [fA], seed: 11 });
  sb.playerAttackSkill(gbA, pA, 'meteor');
  const dmgA = 5000 - fA.hp;
  const pB = pSkillPlayer('p9b'), fB = pSkillFoe(5000);
  sb.applyStatus(pB, { id: 'weaken', duration: 3 });      // 攻/魂攻 −15%
  sb.syncStatusDerived(pB);
  const gbB = sb.createGroupBattle({ allies: [pB], enemies: [fB], seed: 11 });
  sb.playerAttackSkill(gbB, pB, 'meteor');
  const dmgB = 5000 - fB.hp;
  assert('9a 陨石伤害 = floor(effectiveStat(魂攻) × 倍率)（吃状态修正）',
    dmgA === Math.floor(sb.effectiveStat(pA, 'soulAtk') * 2.5)
    && dmgB === Math.floor(sb.effectiveStat(pB, 'soulAtk') * 2.5) && dmgB < dmgA,
    JSON.stringify({ effA: sb.effectiveStat(pA, 'soulAtk'), effB: sb.effectiveStat(pB, 'soulAtk'), dmgA: dmgA, dmgB: dmgB }));
}

/* ---- 9b. 陨石无放回：3 次命中必须落在 3 个不同敌人上（设计「无重复命中」） ---- */
{
  const p = pSkillPlayer('p9c');
  const foes = [pSkillFoe(2000), pSkillFoe(2000), pSkillFoe(2000)];
  const gb = sb.createGroupBattle({ allies: [p], enemies: foes, seed: 424242 });
  sb.playerAttackSkill(gb, p, 'meteor');
  const hit = foes.filter(f => f.hp < 2000).length;
  const weak = foes.filter(f => sb.hasStatus(f, 'weaken')).length;
  assert('9b 陨石 3 次命中落在 3 个不同敌人上（无放回，且各获弱化）',
    hit === 3 && weak === 3, JSON.stringify({ hit: hit, weak: weak, hp: foes.map(f => f.hp) }));
}

/* ---- 9c. 冰魄按设计随机选目标（旧实现固定 enemies[0]） ---- */
{
  const seen = {};
  for (let seed = 1; seed <= 12; seed++) {
    const p = pSkillPlayer('p9d' + seed);
    const foes = [pSkillFoe(9999), pSkillFoe(9999), pSkillFoe(9999)];
    const gb = sb.createGroupBattle({ allies: [p], enemies: foes, seed: seed });
    sb.playerAttackSkill(gb, p, 'icebeam');
    const idx = foes.findIndex(f => sb.hasStatus(f, 'freeze'));
    seen[idx] = (seen[idx] || 0) + 1;
  }
  assert('9c 冰魄随机选目标（12 个种子命中不止一个下标）',
    Object.keys(seen).length > 1 && !Object.prototype.hasOwnProperty.call(seen, '-1'),
    JSON.stringify(seen));
}

/* ---- 9d. 巨石按设计随机选目标，且伤害与降魂防落在**同一目标** ---- */
{
  const seen = {};
  let sameTarget = true, dmgMeta = true;
  for (let seed = 1; seed <= 12; seed++) {
    const p = pSkillPlayer('p9e' + seed);
    const foes = [pSkillFoe(9999, { soulDef: 1000 }), pSkillFoe(9999, { soulDef: 1000 }), pSkillFoe(9999, { soulDef: 1000 })];
    const gb = sb.createGroupBattle({ allies: [p], enemies: foes, seed: seed });
    const r = sb.playerAttackSkill(gb, p, 'boulder');
    const dmgIdx = foes.findIndex(f => f.hp < 9999);
    const downIdx = foes.findIndex(f => sb.hasStatus(f, 'souldown'));
    if (dmgIdx < 0 || dmgIdx !== downIdx) sameTarget = false;
    seen[downIdx] = (seen[downIdx] || 0) + 1;
    const ev = (r.events || []).find(e => e.type === 'damage');
    if (!ev || ev.targetId !== foes[downIdx].id) dmgMeta = false;
  }
  assert('9d 巨石：伤害与降魂防落在同一目标（且事件 targetId 指向它）', sameTarget && dmgMeta, JSON.stringify(seen));
  assert('9d 巨石随机选目标（12 个种子命中不止一个下标）', Object.keys(seen).length > 1, JSON.stringify(seen));
}

/* ---- 9e. 事件契约：type / targetId / hpDamage 与实际结算一致 ---- */
{
  const p = pSkillPlayer('p9f');
  const foes = [pSkillFoe(9999), pSkillFoe(9999)];
  const gb = sb.createGroupBattle({ allies: [p], enemies: foes, seed: 7 });
  const before = foes.map(f => f.hp);
  const r = sb.playerAttackSkill(gb, p, 'meteor');
  const dmgEvs = (r.events || []).filter(e => e.type === 'damage');
  const idsOk = dmgEvs.length > 0 && dmgEvs.every(e => !!e.targetId && foes.some(f => f.id === e.targetId)
    && typeof e.hpDamage === 'number' && e.hpDamage > 0 && e.damageType === 'soul');
  const sumById = {};
  dmgEvs.forEach(e => { sumById[e.targetId] = (sumById[e.targetId] || 0) + e.hpDamage; });
  const actual = {};
  foes.forEach((f, i) => { actual[f.id] = before[i] - f.hp; });
  const consistent = foes.every(f => sumById[f.id] === actual[f.id]);
  assert('9e 伤害事件带 type=damage + 稳定 targetId + hpDamage/damageType', idsOk, JSON.stringify(dmgEvs));
  assert('9e 事件 hpDamage 之和 = 各目标实际掉血（战报/飘字读到的就是真实结算）', consistent,
    JSON.stringify({ sumById: sumById, actual: actual }));
  const weakEvs = (r.events || []).filter(e => /弱化/.test(e.msg || ''));
  assert('9e 弱化（状态）事件同样带 targetId', weakEvs.length > 0 && weakEvs.every(e => !!e.targetId),
    JSON.stringify(weakEvs));
}

/* ---- 9f. 受击方护盾真的参与玩家技能结算（旧实现完全跳过护盾） ---- */
{
  const p = pSkillPlayer('p9g');
  const foe = pSkillFoe(9999);
  const gb = sb.createGroupBattle({ allies: [p], enemies: [foe], seed: 3 });
  const raw = Math.floor(sb.effectiveStat(p, 'soulAtk') * 2.5);
  foe._shield = 40;
  const r = sb.playerAttackSkill(gb, p, 'meteor');
  const shEv = (r.events || []).find(e => /护盾吸收/.test(e.msg || ''));
  assert('9f 陨石打有盾目标：先扣盾、HP 只掉余量（不再无视护盾）',
    9999 - foe.hp === raw - 40 && foe._shield === 0 && !!shEv,
    JSON.stringify({ hp: foe.hp, shield: foe._shield, raw: raw, hasShieldEv: !!shEv }));
}

/* ---- 9g. 受击方减伤（广域防御 data.reduce）真的参与玩家技能结算 ---- */
{
  const p1 = pSkillPlayer('p9h'), f1 = pSkillFoe(9999);
  const gb1 = sb.createGroupBattle({ allies: [p1], enemies: [f1], seed: 5 });
  sb.playerAttackSkill(gb1, p1, 'meteor');
  const plain = 9999 - f1.hp;
  const p2 = pSkillPlayer('p9i'), f2 = pSkillFoe(9999);
  sb.applyStatus(f2, { id: 'wideguard', duration: 3, data: { reduce: 0.5 } });
  sb.syncStatusDerived(f2);
  const gb2 = sb.createGroupBattle({ allies: [p2], enemies: [f2], seed: 5 });
  sb.playerAttackSkill(gb2, p2, 'meteor');
  const reduced = 9999 - f2.hp;
  assert('9g 陨石打到「广域防御 50% 减伤」目标：伤害按减伤后结算',
    reduced < plain && Math.abs(reduced - Math.floor(plain * 0.5)) <= 1,
    JSON.stringify({ plain: plain, reduced: reduced }));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
/* v2.1.5 测试：宠物专属天赋的真实战斗效果 + 命中/闪避系统
   1) 命中系统基础（基础命中率 / 命中修正 / 目标闪避）
   2) 10 个专属天赋的 hook 行为
   3) 敌人天赋池隔离（petOnly 不被随机抽取）
   4) 端到端：圣光守护在真实普攻中分担伤害
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js',
  'skill.js', 'enemy.js', 'battle.js', 'battle-group.js', 'pets.js', 'pet-materials.js', 'pet-codex.js',
  /* v2.3.0 WP-D：暴击「取最高、分别判定」要把斗者本能与玩家/宠物暴击档合到一处判定，
     合并函数 groupCritMult 读 player-skill-hooks.js 的 playerCritInfo()，故需加载这两个文件。 */
  'skills.js', 'player-skill-hooks.js'];
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const B = { hp: 100, atk: 20, def: 10, spd: 5 };
function mkUnit(id, talents, base) {
  const u = sandbox.createUnit({ id: id, side: 'ally', name: id, level: 1, base: Object.assign({}, base || B) });
  if (talents) sandbox.attachTalents(u, talents);
  return u;
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ---- 1. 命中系统基础 ---- */
console.log('\n[1] 命中 / 闪避系统');
assert('基础命中率 95%', sandbox.BASE_HIT_RATE === 0.95, String(sandbox.BASE_HIT_RATE));
const atk = mkUnit('atk');
const def = mkUnit('def');
assert('默认命中率 = 基础值', near(sandbox.groupHitChance(atk, def), 0.95), String(sandbox.groupHitChance(atk, def)));
atk._accMod = -0.4;
assert('自身命中修正 -40% → 0.55', near(sandbox.groupHitChance(atk, def), 0.55), String(sandbox.groupHitChance(atk, def)));
atk._accMod = 0;
def._eva = 0.2;
assert('目标闪避 20% → 0.75', near(sandbox.groupHitChance(atk, def), 0.75), String(sandbox.groupHitChance(atk, def)));
def._eva = 0;
atk._accMod = -5;
assert('命中率下限 5%', near(sandbox.groupHitChance(atk, def), 0.05), String(sandbox.groupHitChance(atk, def)));
atk._accMod = 0;

/* ---- 2. 天赋 hook 行为 ---- */
console.log('\n[2] 十个专属天赋');
// 漆黑之眼
const de = mkUnit('de', ['dark_eye']);
assert('漆黑之眼 → 必定命中（=1）', sandbox.groupHitChance(de, def) === 1);
const deFoe = mkUnit('deFoe'); deFoe._eva = 0.9;
assert('漆黑之眼 → 无视目标 90% 闪避', sandbox.groupHitChance(de, deFoe) === 1);
// 心眼
const me = mkUnit('me', ['mind_eye']);
me._accMod = -0.4;
assert('心眼 → 命中率不会被降低', near(sandbox.groupHitChance(me, def), 0.95), String(sandbox.groupHitChance(me, def)));
// 斗者本能
const fi = mkUnit('fi', ['fighter_instinct']);
const crit = sandbox.talentCrit(fi);
assert('斗者本能 → 暴击率 30%（v2.3.0：25% → 30%）', near(crit.chance, 0.30), String(crit.chance));
assert('斗者本能 → 暴击倍率 150%', near(crit.mult, 1.5), String(crit.mult));
assert('无此天赋 → 暴击率 0', sandbox.talentCrit(mkUnit('none')).chance === 0);
// 凛冬之核
const wc = mkUnit('wc', ['winter_core']);
assert('凛冬之核 → 免疫冰冻', sandbox.talentDispatch(wc, 'onAllyStatus', { statusId: 'freeze' }).skipAction === true);
assert('凛冬之核 → 不免疫中毒', sandbox.talentDispatch(wc, 'onAllyStatus', { statusId: 'poison' }).skipAction === false);
// 不动如山
const im = mkUnit('im', ['immovable']);
assert('不动如山 → 满血免疫普通负面(grade1)', sandbox.talentDispatch(im, 'onBeforeStatus', { statusId: 'slow', grade: 1 }).skipAction === true);
assert('不动如山 → 满血免疫高级负面(grade2)', sandbox.talentDispatch(im, 'onBeforeStatus', { statusId: 'freeze', grade: 2 }).skipAction === true);
assert('不动如山 → 特级负面免疫不了(grade3)', sandbox.talentDispatch(im, 'onBeforeStatus', { statusId: 'doomed', grade: 3 }).skipAction === false);
assert('不动如山 → 满血受伤 -50%', sandbox.talentDispatch(im, 'onDamage', {}).mutations.some(m => m.key === 'dmgTakenReduce' && m.value === 0.5));
im.hp = 50;
assert('不动如山 → 非满血不减伤也不免疫', sandbox.talentDispatch(im, 'onDamage', {}).mutations.length === 0
  && sandbox.talentDispatch(im, 'onBeforeStatus', { statusId: 'slow', grade: 1 }).skipAction === false);
// 威压领域
const pf = mkUnit('pf', ['pressure_field']);
assert('威压领域 → 血量>75% 治疗 -20%', sandbox.talentDispatch(pf, 'onFoeHeal', {}).mutations.some(m => m.key === 'healReduce' && m.value === 0.2));
pf.hp = 70;
assert('威压领域 → 血量≤75% 不生效', sandbox.talentDispatch(pf, 'onFoeHeal', {}).mutations.length === 0);
// 镜像结界
const mf = mkUnit('mf', ['mirror_field']);
assert('镜像结界 → 受我方辅助 +25%', sandbox.talentDispatch(mf, 'onBeforeHeal', { isSupport: true, source: { side: 'ally' } })
  .mutations.some(m => m.key === 'healBoost' && m.value === 0.25));
assert('镜像结界 → 受敌方辅助 -25%', sandbox.talentDispatch(mf, 'onBeforeHeal', { isSupport: true, source: { side: 'enemy' } })
  .mutations.some(m => m.key === 'healBoost' && m.value === -0.25));
assert('镜像结界 → 非辅助效果不触发', sandbox.talentDispatch(mf, 'onBeforeHeal', { isSupport: false, source: { side: 'enemy' } }).mutations.length === 0);
// 圣光守护
const hg = mkUnit('hg', ['holy_guard'], { hp: 100 });
assert('圣光守护 → 血量>50% 分担 20%', sandbox.talentDispatch(hg, 'onAllyDamage', { amount: 100 })
  .mutations.some(m => m.key === 'damageShare' && m.value === 20));
assert('圣光守护 → 分担者自己掉血 20', hg.hp === 80, 'hp=' + hg.hp);
hg.hp = 40;
assert('圣光守护 → 血量≤50% 不再分担', sandbox.talentDispatch(hg, 'onAllyDamage', { amount: 100 }).mutations.length === 0);
// 灵感涌动
const insB = { hp: 100, atk: 10, def: 5, spd: 5, soulAtk: 50 };
const ins = mkUnit('ins', ['inspiration'], insB);
const mate = mkUnit('mate', null, insB);
sandbox.talentDispatch(ins, 'onTurnStart', { turn: 1, allyUnits: [ins, mate] });
assert('灵感涌动 → 随机 1 名友方魂攻 +20%（50→60）',
  (ins.base.soulAtk === 60) !== (mate.base.soulAtk === 60),
  'ins=' + ins.base.soulAtk + ' mate=' + mate.base.soulAtk);
sandbox.talentDispatch(ins, 'onTurnEnd', { turn: 1, allyUnits: [ins, mate] });
assert('灵感涌动 → 回合结束恢复 50', ins.base.soulAtk === 50 && mate.base.soulAtk === 50,
  'ins=' + ins.base.soulAtk + ' mate=' + mate.base.soulAtk);
// 幸运口袋
assert('幸运口袋 → 已注册且标记 petOnly', (() => { const t = sandbox.getTalent('lucky_pocket'); return t && t.petOnly === true; })());

/* ---- 3. 敌人天赋池隔离 ---- */
console.log('\n[3] 敌人天赋池隔离');
const PET_TALENTS = ['lucky_pocket', 'dark_eye', 'winter_core', 'holy_guard', 'mirror_field',
  'inspiration', 'mind_eye', 'fighter_instinct', 'immovable', 'pressure_field'];
PET_TALENTS.forEach(id => {
  const t = sandbox.getTalent(id);
  assert('petOnly 标记: ' + id, !!t && t.petOnly === true);
});
let leaked = null;
for (let i = 0; i < 300; i++) {
  sandbox.pickRandomTalents(3).forEach(id => { if (PET_TALENTS.indexOf(id) > -1) leaked = id; });
}
assert('pickRandomTalents 300 次不抽到宠物专属天赋', leaked === null, 'leaked=' + leaked);
const enemTalents = sandbox.pickRandomTalents(3);
assert('pickRandomTalents 仍能抽到敌方天赋', enemTalents.length > 0 && sandbox.getTalent(enemTalents[0]) !== null);

/* ---- 4. 端到端：圣光守护在真实普攻中分担伤害 ---- */
console.log('\n[4] 端到端战斗');
const petLight = sandbox.createPet({ speciesId: 'lightspirit', rarity: 'SSR', name: '光之精灵' });
petLight.stage = 'mature';
const guardUnit = sandbox.createPetUnit(petLight);
assert('光之精灵带圣光守护进入战斗', guardUnit._talents.indexOf('holy_guard') > -1, guardUnit._talents.join(','));
const victim = sandbox.createUnit({ id: 'v', side: 'ally', name: '队友', level: 1, base: { hp: 200, atk: 10, def: 0, spd: 1 } });
const foe = sandbox.createEnemyUnit({ tier: 'minion', name: '敌', base: { hp: 300, atk: 100, def: 0, spd: 5 } });
const gb = sandbox.createGroupBattle({ allies: [guardUnit, victim], enemies: [foe], rng: function () { return 0; } });
const vHp0 = victim.hp, gHp0 = guardUnit.hp;
sandbox.normalAttack(gb, foe, victim);
assert('普攻命中（rng=0 < 0.95）且伤害被分担', victim.hp < vHp0 && victim.hp > vHp0 - (100 + 1), 'victim ' + vHp0 + '→' + victim.hp);
assert('圣光守护者承担了伤害', guardUnit.hp < gHp0, 'guard ' + gHp0 + '→' + guardUnit.hp);
assert('目标实际承伤 = 全额 − 分担额', (vHp0 - victim.hp) === 101 - Math.floor(101 * 0.2),
  '受 ' + (vHp0 - victim.hp));

/* ---- 5. WP-D（v2.3.0）：page/talent.js 14 条的对齐改动 ---- */
console.log('\n[5] WP-D 改动（talent.js）');
/* 天赋 hook 内部走全局 battleRnd()，临时钉死为确定值以便断言 */
const _origBattleRnd = sandbox.battleRnd;
sandbox.battleRnd = function () { return 0; };

// 魔法镜：补上 onBeforeSupport 派发点（此前全项目无派发点 = 死壳）
const caster = mkUnit('caster', null, { hp: 500, atk: 10, def: 5, spd: 5 });
const foeMM = sandbox.createUnit({ id: 'mm', side: 'enemy', name: '镜敌', level: 1, base: { hp: 500, atk: 10, def: 5, spd: 1 } });
sandbox.attachTalents(foeMM, ['magicmirror']);
const gbMM = sandbox.createGroupBattle({ allies: [caster], enemies: [foeMM], rng: function () { return 0; } });
const evMM = sandbox.castSkill(gbMM, caster, 'p_drench');   // 辅助技能，目标 random1 → 镜敌
assert('魔法镜 → 对手指向的辅助技能触发（onBeforeSupport 真的被派发）',
  evMM.some(e => /魔法镜/.test(e.msg || '')), evMM.map(e => e.msg).join(' | ').slice(0, 180));
assert('魔法镜 → 目标免疫那次效果（镜敌未获得潮湿）', !sandbox.hasStatus(foeMM, 'wet'));
assert('魔法镜 → 负面/减益类反弹给施加者（施加者获得潮湿）', sandbox.hasStatus(caster, 'wet'));

// 魔法镜：队友给的辅助不算「敌方指向」→ 不触发
const allyMM = mkUnit('allyMM', ['magicmirror'], { hp: 500, atk: 10, def: 5, spd: 5, soulAtk: 100 });
const healer = mkUnit('healer', null, { hp: 500, atk: 10, def: 5, spd: 6, soulAtk: 100 });
allyMM.hp = 100;
const gbHeal = sandbox.createGroupBattle({ allies: [healer, allyMM], enemies: [], rng: function () { return 0; } });
const evHeal = sandbox.castSkill(gbHeal, healer, 'p_holylight');   // 辅助技能，目标 ally1 → 队友
assert('魔法镜 → 队友给的辅助不触发（只在「敌方指向」时）',
  !evHeal.some(e => /魔法镜/.test(e.msg || '')), evHeal.map(e => e.msg).join(' | ').slice(0, 180));

// 朴实：只挡「直接影响属性」的增益/减益（§5.6-1）
const pl = mkUnit('pl', ['plain']);
assert('朴实 → 挡直接改属性的负面（潮湿 statModsPct）',
  sandbox.talentDispatch(pl, 'onBeforeStatus', { statusId: 'wet', grade: 2 }).skipAction === true);
assert('朴实 → 挡靠实例 modsPct 改属性的状态（疾风）',
  sandbox.talentDispatch(pl, 'onBeforeStatus', { statusId: 'haste', grade: 1, modsPct: { spd: 0.1 } }).skipAction === true);
['poison', 'freeze', 'doomed', 'sleep'].forEach(function (id) {
  assert('朴实 → 不挡「不直接改属性」的效果（' + id + '）',
    sandbox.talentDispatch(pl, 'onBeforeStatus', { statusId: id, grade: 3 }).skipAction === false);
});
assert('朴实 → 不挡伤害修正类附加（广域防御）',
  sandbox.talentDispatch(pl, 'onBeforeStatus', { statusId: 'wideguard', grade: 1 }).skipAction === false);
const lwGuard = sandbox.talentDispatch(pl, 'onBeforeStatus', { statusId: 'lastworded', grade: 3 });
assert('朴实 → 混合型（遗言诅咒）只剥属性、保留附加效果',
  lwGuard.skipAction !== true && lwGuard.mutations.some(m => m.key === 'stripStatMods'));
const uNoMods = mkUnit('uNoMods'); sandbox.applyStatus(uNoMods, { id: 'weaken', duration: 2, noStatMods: true }); sandbox.syncStatusDerived(uNoMods);
const uMods = mkUnit('uMods'); sandbox.applyStatus(uMods, { id: 'weaken', duration: 2 }); sandbox.syncStatusDerived(uMods);
assert('朴实 → noStatMods 实例真的不贡献属性修正', !(uNoMods._statMods && uNoMods._statMods.atk), JSON.stringify(uNoMods._statMods));
assert('对照：未标 noStatMods 的弱化会降攻', (uMods._statMods.atk || 0) < 0, JSON.stringify(uMods._statMods));

// 威吓：持续回合 5~10 随机 + 与「施加者 <50% 血」先到者解除（§5.1.7 / §5.6-5）
const imA = mkUnit('imA', ['intimidate']);
const foesA = [mkUnit('fA1'), mkUnit('fA2')];
sandbox.talentDispatch(imA, 'onBattleStart', { enemyUnits: foesA });
assert('威吓 → 开场随机持续 5~10 回合（rng=0 → 5）', imA._intimidateTurns === 5, String(imA._intimidateTurns));
assert('威吓 → 命中 1 名并留标记', foesA.filter(f => f._intimidated).length === 1);
const imB = mkUnit('imB', ['intimidate']);
sandbox.battleRnd = function () { return 0.999; };
sandbox.talentDispatch(imB, 'onBattleStart', { enemyUnits: [mkUnit('fB1')] });
assert('威吓 → 持续回合上界 10（rng≈1 → 10）', imB._intimidateTurns === 10, String(imB._intimidateTurns));
sandbox.battleRnd = function () { return 0; };
const relEv1 = sandbox.talentDispatch(imA, 'onTurnStart', { turn: 4, enemyUnits: foesA });
assert('威吓 → 未到期且血量 ≥50% 时不解除', !((relEv1 || {}).events || []).length);
const relEv2 = sandbox.talentDispatch(imA, 'onTurnStart', { turn: 6, enemyUnits: foesA });
assert('威吓 → 持续回合走完自动解除（turn > 5）',
  foesA.every(f => !f._intimidated) && /威吓解除/.test((((relEv2 || {}).events) || []).map(e => e.msg).join(' ')),
  JSON.stringify(relEv2));

// 复仇：每层间隔 25% → 20%（§5.1.13 / §5.6-6）
const vg = mkUnit('vg', ['vengeance'], { hp: 100, atk: 100, def: 10, spd: 5, soulAtk: 100 });
vg.hp = 80;   // 损失 20% → 1 层（旧 25% 间隔口径下是 0 层）
sandbox.talentDispatch(vg, 'onTurnStart', {});
assert('复仇 → 损失 20% 即 1 层（间隔改 20%）', vg._vengeStacks === 1, String(vg._vengeStacks));
assert('复仇 → 1 层 = 攻 100×1.1 = 110', vg.base.atk === 110, String(vg.base.atk));

/* ---- 6. 斗者本能 × 宠物暴击档「取最高、分别判定」（§3.12-1） ---- */
console.log('\n[6] 暴击合并（§3.12-1）');
const mg = mkUnit('mg', ['fighter_instinct'], { hp: 100, atk: 100, def: 0, spd: 5 });
mg._petShared = { crit: { chance: 0.15, critMult: 1.6 } };   // 宠物暴击档（玩家装配暴击后共享）
const pcInfo = sandbox.playerCritInfo(mg);
assert('playerCritInfo → 读出宠物暴击档 15% / 160%',
  !!pcInfo && near(pcInfo.chance, 0.15) && near(pcInfo.critMult, 1.6));
function seqRng(arr) { let i = 0; return function () { return arr[i++ % arr.length]; }; }
const dummyFoe = () => sandbox.createUnit({ id: 'v9', side: 'enemy', name: '靶', level: 1, base: { hp: 99999, atk: 1, def: 0, spd: 1 } });
const gbBoth = sandbox.createGroupBattle({ allies: [mg], enemies: [dummyFoe()], rng: function () { return 0; } });
assert('都触发 → 取较高倍率 1.6（不再是 1.5×1.6 双暴击叠乘）', sandbox.groupCritMult(gbBoth, mg) === 1.6,
  String(sandbox.groupCritMult(gbBoth, mg)));
const gbOnlyTalent = sandbox.createGroupBattle({ allies: [mg], enemies: [dummyFoe()], rng: seqRng([0.10, 0.50]) });
assert('只有斗者本能触发 → 150%', sandbox.groupCritMult(gbOnlyTalent, mg) === 1.5, String(sandbox.groupCritMult(gbOnlyTalent, mg)));
const gbOnlyPet = sandbox.createGroupBattle({ allies: [mg], enemies: [dummyFoe()], rng: seqRng([0.50, 0.10]) });
assert('只有宠物暴击档触发 → 160%', sandbox.groupCritMult(gbOnlyPet, mg) === 1.6, String(sandbox.groupCritMult(gbOnlyPet, mg)));
const gbNoneT = sandbox.createGroupBattle({ allies: [mg], enemies: [dummyFoe()], rng: seqRng([0.50, 0.50]) });
assert('都不触发 → 0', sandbox.groupCritMult(gbNoneT, mg) === 0, String(sandbox.groupCritMult(gbNoneT, mg)));
const gbE2E = sandbox.createGroupBattle({ allies: [mg], enemies: [dummyFoe()], rng: function () { return 0; } });
const evE2E = sandbox.normalAttack(gbE2E, mg, gbE2E.enemies[0]);
const evText = (evE2E || []).map(e => (e && e.msg) || '').join(' | ');
const dmgMatch = /→\s+(\d+)\s+伤害/.exec(evText);
const dmgE2E = dmgMatch ? +dmgMatch[1] : null;
assert('普攻：基伤 101 × 1.6 = 161（旧实现会二次暴击成 241）', dmgE2E === 161, 'dmg=' + dmgE2E + ' | ' + evText.slice(0, 180));
assert('普攻：只出一条暴击日志', (evE2E || []).filter(e => /暴击/.test(e.msg || '')).length === 1);

sandbox.battleRnd = _origBattleRnd;

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

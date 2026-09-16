#!/usr/bin/env node
/* v2.1.15 测试：状态生命周期 + 属性修正 + 「写了没接线」的 9 处效果
   1) 状态 duration 真正递减、到期移除（含「跳过行动」分支也要递减）
   2) _statMods 真正写回 unit，effectiveStat / effectiveSpeed 被消费（减速影响出手顺序）
   3) 护盾吸收伤害 / 破盾撤免疫 / 护盾期免疫负面
   4) 伤害修正类：广域防御减伤、强攻单位级攻击加成、坚壁叠层
   5) 判定类：变小闪避、潮湿命中 +30%
   6) 叠层与概率类：雪球满层 300%、咬击 30% 概率 +25%
   7) 驱散类：净化（不解特级）、清除迷雾（含能力变化归零）、摄取（增益减半并转移）
   8) 玩家技能：气势如虹的全队攻击加成
   9) 顺修：粗糙皮肤不再让受击方吃双倍伤害、冰冻受击解除
   Run: node scripts/test-status-lifecycle.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
  'enemy.js', 'battle.js', 'battle-group.js', 'terrain.js', 'group-levels.js', 'ai.js',
  'pets.js', 'pet-materials.js', 'pet-codex.js', 'skills.js', 'player-skill-hooks.js'];
// 确定性随机（Math 属性不可枚举，须 Object.create 继承）
// RND 可调：伤害/命中类用例需要 0.5；概率类用例（气势如虹 30%）需要压低才可能触发
let RND = 0.5;
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return RND; };
const sb = { Math: deterministicMath, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
const msgs = evts => (evts || []).map(e => (e && e.msg) || '').join(' | ');
const dummy = (id, hp) => sb.createUnit({ id: id, side: 'enemy', name: '木桩', base: { hp: hp || 9999, atk: 1, def: 0, spd: 1 } });

/* ============ 1. 状态 duration 递减 / 到期（走战斗路径） ============ */
{
  const u = sb.createUnit({ id: 'u1', side: 'ally', name: '甲', base: { hp: 500, atk: 20, def: 30, spd: 5 } });
  sb.applyStatus(u, { id: 'slow', duration: 2 });
  const gb = sb.createGroupBattle({ allies: [u], enemies: [dummy('e1')] });
  gb.turn = 1;
  sb.groupUnitTurn(gb, u);
  assert('回合末状态 duration 递减', u.statuses.length === 1 && u.statuses[0].duration === 1,
    JSON.stringify(u.statuses));
  gb.turn = 2;
  sb.groupUnitTurn(gb, u);
  assert('duration 归零后状态被移除', u.statuses.length === 0, JSON.stringify(u.statuses));
}

/* 到期后不再产生效果（中毒不再每回合掉血） */
{
  const p = sb.createUnit({ id: 'p1', side: 'ally', name: '毒', base: { hp: 1000, atk: 10, def: 10, spd: 5 } });
  sb.applyStatus(p, { id: 'poison', duration: 1 });
  const e1 = sb.dispatch(p, 'onTurnEnd', {});
  const hpAfterFirst = p.hp;
  assert('中毒首回合掉血（4% 最大生命）', hpAfterFirst === 960 && e1.events.some(x => x.type === 'dot'), 'hp=' + hpAfterFirst);
  const aged = sb.ageStatuses(p);
  assert('中毒到期事件已产出', p.statuses.length === 0 && aged.some(x => x.type === 'expire'),
    JSON.stringify(aged.map(x => x.type)));
  const e2 = sb.dispatch(p, 'onTurnEnd', {});
  assert('中毒到期后不再掉血', p.hp === hpAfterFirst && !e2.events.some(x => x.type === 'dot'), 'hp=' + p.hp);
}

/* 跳过行动时也要递减 —— 否则冰冻/睡眠永久锁死单位 */
{
  const fz = sb.createUnit({ id: 'fz', side: 'ally', name: '冻', base: { hp: 300, atk: 20, def: 5, spd: 5 } });
  sb.applyStatus(fz, { id: 'freeze', duration: 2 });
  const gb = sb.createGroupBattle({ allies: [fz], enemies: [dummy('e2')] });
  gb.turn = 1;
  const ev1 = sb.groupUnitTurn(gb, fz);
  assert('冰冻期间无法行动', /无法行动（❄️ 冰冻）/.test(msgs(ev1)), msgs(ev1));
  assert('跳过行动的分支同样递减 duration', fz.statuses.length === 1 && fz.statuses[0].duration === 1,
    JSON.stringify(fz.statuses));
  gb.turn = 2;
  const ev2 = sb.groupUnitTurn(gb, fz);
  assert('冰冻到期后自动解冻（不再永久锁死）', fz.statuses.length === 0, JSON.stringify(fz.statuses));
  gb.turn = 3;
  const ev3 = sb.groupUnitTurn(gb, fz);
  assert('解冻后恢复行动', !/无法行动/.test(msgs(ev3)), msgs(ev3));
}

/* ============ 2. _statMods 写回 + effectiveStat / 出手顺序 ============ */
{
  const a = sb.createUnit({ id: 'a2', side: 'ally', name: '甲', base: { hp: 200, atk: 100, def: 50, spd: 10 } });
  sb.applyStatus(a, { id: 'armorbroken', duration: 3 });
  sb.syncStatusDerived(a);
  assert('_statMods 已写回单位（破甲 -10% 防御）', a._statMods && a._statMods.def === -5, JSON.stringify(a._statMods));
  assert('effectiveStat 反映破甲', sb.effectiveStat(a, 'def') === 45, sb.effectiveStat(a, 'def'));
  sb.applyStatus(a, { id: 'armorbroken', duration: 3 });
  sb.syncStatusDerived(a);
  assert('破甲按层数乘算（2 层 -20%）', sb.effectiveStat(a, 'def') === 40, sb.effectiveStat(a, 'def'));
}
{
  const fast = sb.createUnit({ id: 'fast', side: 'ally', name: '快', base: { hp: 300, atk: 30, def: 10, spd: 10 } });
  const foe = sb.createUnit({ id: 'foe', side: 'enemy', name: '敌', base: { hp: 300, atk: 30, def: 10, spd: 12 } });
  const gb = sb.createGroupBattle({ allies: [fast], enemies: [foe] });
  assert('减速前：速度 12 的敌人先手', sb.buildActionQueue(gb)[0].id === 'foe');
  sb.applyStatus(foe, { id: 'slow', duration: 2 });   // spd -3 → 9
  sb.refreshAllStatMods(gb.units);
  assert('减速后：速度 10 的玩家先手', sb.buildActionQueue(gb)[0].id === 'fast',
    sb.buildActionQueue(gb).map(u => u.id + '(' + sb.effectiveSpeed(u) + ')').join(','));
}

/* ============ 3. 护盾：吸收 / 破盾撤免疫 / 免疫负面 ============ */
{
  const sh = sb.createUnit({ id: 'sh', side: 'ally', name: '盾', base: { hp: 500, atk: 10, def: 0, spd: 1 } });
  sh._shield = 30; sh._shieldImmune = true;
  const atk = sb.createUnit({ id: 'ak', side: 'enemy', name: '攻', base: { hp: 300, atk: 100, def: 0, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [sh], enemies: [atk] });
  const ev = sb.normalAttack(gb, atk, sh);
  assert('护盾吸收伤害（30 点）', sh._shield === 0 && /护盾吸收 30/.test(msgs(ev)), msgs(ev));
  assert('护盾破后扣血（103 - 30 = 73）', sh.hp === 427, 'hp=' + sh.hp);
  assert('破盾后撤掉负面免疫', sh._shieldImmune === false);
}
{
  const victim = sb.createUnit({ id: 'v', side: 'enemy', name: '受', base: { hp: 300, atk: 10, def: 5, spd: 1 } });
  victim._shield = 50; victim._shieldImmune = true;
  const caster = sb.createUnit({ id: 'c', side: 'ally', name: '施', skills: ['blackmist'], base: { hp: 200, atk: 10, def: 5, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [caster], enemies: [victim] });
  gb.turn = 1;
  const ev = sb.castSkill(gb, caster, 'blackmist');
  assert('护盾存在期间免疫普通~高级负面', victim.statuses.length === 0 && /受护盾庇护/.test(msgs(ev)), msgs(ev));
}

/* ============ 4. 伤害修正类技能 ============ */
{
  const guard = sb.createUnit({ id: 'g', side: 'enemy', name: '守', base: { hp: 1000, atk: 10, def: 0, spd: 1 } });
  sb.applyStatus(guard, { id: 'wideguard', duration: 3 });
  const atk = sb.createUnit({ id: 'a', side: 'ally', name: '攻', base: { hp: 300, atk: 100, def: 0, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [guard] });
  sb.normalAttack(gb, atk, guard);
  assert('广域防御减伤 20%（103 → 82）', guard.hp === 918, 'hp=' + guard.hp);
}
{
  const teacher = sb.createUnit({ id: 'tc', side: 'ally', name: '教头', skills: ['empower'], base: { hp: 200, atk: 10, def: 5, spd: 9 } });
  const pupil = sb.createUnit({ id: 'pu', side: 'ally', name: '学员', base: { hp: 200, atk: 100, def: 5, spd: 5 } });
  const gb = sb.createGroupBattle({ allies: [teacher, pupil], enemies: [dummy('e3')] });
  gb.turn = 1;
  const ev = sb.castSkill(gb, teacher, 'empower');
  assert('强攻挂上「攻击提升」状态', pupil.statuses.some(s => s.id === 'atkup'), JSON.stringify(pupil.statuses));
  assert('强攻 +30% 攻击真正生效', sb.effectiveStat(pupil, 'atk') === 130, sb.effectiveStat(pupil, 'atk'));
  assert('强攻日志写明对象与幅度', /学员 攻击 \+30%/.test(msgs(ev)), msgs(ev));
}
{
  const wall = sb.createUnit({ id: 'w', side: 'ally', name: '墙', base: { hp: 200, atk: 10, def: 100, spd: 5 } });
  sb.applyStatus(wall, { id: 'guardup', duration: 999 });
  sb.applyStatus(wall, { id: 'guardup', duration: 999 });
  sb.syncStatusDerived(wall);
  assert('坚壁叠层（2/5）', wall.statuses[0].stacks === 2, JSON.stringify(wall.statuses[0]));
  assert('坚壁 2 层 = 防御 +20%', sb.effectiveStat(wall, 'def') === 120, sb.effectiveStat(wall, 'def'));
}

/* ============ 5. 判定类：变小闪避 / 潮湿命中 ============ */
{
  const atk = sb.createUnit({ id: 'hit', side: 'ally', name: '攻', base: { hp: 100, atk: 50, def: 5, spd: 5 } });
  const plain = sb.createUnit({ id: 'pl', side: 'enemy', name: '常', base: { hp: 200, atk: 10, def: 5, spd: 5 } });
  const base = sb.groupHitChance(atk, plain);
  sb.applySkillEffects(sb.getSkill('shrink'), plain, [plain], {});
  assert('变小降低被命中率 10%', Math.abs(sb.groupHitChance(atk, plain) - (base - 0.10)) < 1e-9,
    'base=' + base + ' now=' + sb.groupHitChance(atk, plain));
  assert('变小的闪避存在 _evaPerm（不会被限时修正清零）', Math.abs(plain._evaPerm - 0.10) < 1e-9);
  const wetT = sb.createUnit({ id: 'wt', side: 'enemy', name: '湿', base: { hp: 200, atk: 10, def: 5, spd: 5 } });
  sb.applyStatus(wetT, { id: 'wet', duration: 2 });
  assert('潮湿使目标必被命中（95% + 30% 封顶 100%）', sb.groupHitChance(atk, wetT) === 1, sb.groupHitChance(atk, wetT));
}

/* ============ 6. 叠层与概率：雪球 / 咬击 ============ */
{
  const snowman = sb.createUnit({ id: 'sn', side: 'enemy', name: '雪', base: { hp: 300, atk: 10, def: 5, spd: 5, soulAtk: 100, soulDef: 0 } });
  const target = sb.createUnit({ id: 'tg', side: 'ally', name: '靶', base: { hp: 9999, atk: 1, def: 0, spd: 1, soulDef: 0 } });
  const d0 = sb.calcSkillDamage(sb.getSkill('snowball'), snowman, [target], {}).hits[0].amount;
  snowman._snowStacks = 6;
  const d6 = sb.calcSkillDamage(sb.getSkill('snowball'), snowman, [target], {}).hits[0].amount;
  assert('雪球 0 层 = 魂攻×120%', d0 === 120, d0);
  assert('雪球满 6 层 = 魂攻×300%', d6 === 300, d6);
}
{
  const biter = sb.createUnit({ id: 'bt', side: 'enemy', name: '咬', base: { hp: 300, atk: 100, def: 5, spd: 5 } });
  const target = sb.createUnit({ id: 'tb', side: 'ally', name: '靶', base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
  const noProc = sb.calcSkillDamage(sb.getSkill('bite'), biter, [target], { rng: () => 0.9 });
  const proc = sb.calcSkillDamage(sb.getSkill('bite'), biter, [target], { rng: () => 0.1 });
  assert('咬击基准 攻击×180%', noProc.hits[0].amount === 180 && !noProc.proc, JSON.stringify(noProc));
  assert('咬击 30% 概率本次 +25%（180 → 225）', proc.hits[0].amount === 225 && proc.proc === true, JSON.stringify(proc));
}

/* ============ 7. 驱散类：净化 / 清除迷雾 / 摄取 ============ */
{
  const sick = sb.createUnit({ id: 'sk', side: 'ally', name: '患', base: { hp: 500, atk: 10, def: 5, spd: 5 } });
  sb.applyStatus(sick, { id: 'poison', duration: 3 });
  sb.applyStatus(sick, { id: 'doomed', duration: 3 });   // 特级，不该被解除
  const medic = sb.createUnit({ id: 'md', side: 'ally', name: '医', skills: ['cleanse'], base: { hp: 200, atk: 5, def: 5, spd: 9, soulAtk: 50 } });
  const gb = sb.createGroupBattle({ allies: [medic, sick], enemies: [dummy('e4')] });
  gb.turn = 1;
  const ev = sb.castSkill(gb, medic, 'cleanse');
  assert('净化解除普通~高级负面', !sb.hasStatus(sick, 'poison'), JSON.stringify(sick.statuses));
  assert('净化不解除特级负面（末日）', sb.hasStatus(sick, 'doomed'), JSON.stringify(sick.statuses));
  assert('净化日志写明解除项', /解除【中毒】/.test(msgs(ev)), msgs(ev));
}
{
  const mate = sb.createUnit({ id: 'm', side: 'ally', name: '甲', base: { hp: 300, atk: 100, def: 50, spd: 5 } });
  const foe = sb.createUnit({ id: 'f', side: 'enemy', name: '乙', base: { hp: 300, atk: 100, def: 50, spd: 5 } });
  foe._growAtkBase = 100; foe._growAtkStacks = 3; foe.base.atk = 160;   // 模拟「战意高涨」把 base 改高了
  sb.applyStatus(mate, { id: 'slow', duration: 3 });
  sb.applyStatus(foe, { id: 'wet', duration: 3 });
  const caster = sb.createUnit({ id: 'cf', side: 'ally', name: '术', skills: ['clearfog'], base: { hp: 200, atk: 5, def: 5, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [caster, mate], enemies: [foe] });
  gb.turn = 1;
  sb.castSkill(gb, caster, 'clearfog');
  assert('清除迷雾解除全场负面', mate.statuses.length === 0 && foe.statuses.length === 0,
    JSON.stringify([mate.statuses, foe.statuses]));
  assert('清除迷雾让能力变化归零（攻击回到 100）', foe.base.atk === 100, foe.base.atk);
}
{
  const victim = sb.createUnit({ id: 'dv', side: 'ally', name: '带', base: { hp: 500, atk: 200, def: 5, spd: 5 } });
  sb.applyStatus(victim, { id: 'atkup', duration: 4, modsPct: { atk: 0.3 } });
  const sip = sb.createUnit({ id: 'sp', side: 'enemy', name: '吸', skills: ['drainbuff'], base: { hp: 300, atk: 100, def: 5, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [victim], enemies: [sip] });
  gb.turn = 1;
  const ev = sb.castSkill(gb, sip, 'drainbuff');
  assert('摄取使目标增益时长减半（4 → 2）', victim.statuses[0].duration === 2, JSON.stringify(victim.statuses));
  assert('摄取把削掉的加成转给自身（+30%）', sb.effectiveStat(sip, 'atk') === 130, sb.effectiveStat(sip, 'atk'));
  assert('摄取日志写明得失', /增益时长减半/.test(msgs(ev)), msgs(ev));
}

/* ============ 8. 玩家技能：气势如虹 ============ */
{
  RND = 0.01;   // 让 30% 的触发率必定命中（确定性随机默认 0.5 会让它永不触发）
  const player = sb.createUnit({ id: 'pl', side: 'ally', name: '你', base: { hp: 500, atk: 200, def: 50, spd: 9 } });
  sb.attachPlayerSkills(player, { loadout: ['momentum'], levels: { momentum: 10 } });
  const mate = sb.createUnit({ id: 'mt', side: 'ally', name: '宠', base: { hp: 300, atk: 100, def: 20, spd: 5 } });
  const gb = sb.createGroupBattle({ allies: [player, mate], enemies: [dummy('e5')] });
  player._momLock = 0;
  const fired = sb.playerSkillTurnStart(gb, player, 1);
  assert('气势如虹可触发', fired.some(e => /气势如虹/.test(e.msg || '')), msgs(fired));
  assert('气势如虹挂上「攻击提升」', player.statuses.some(s => s.id === 'atkup') && mate.statuses.some(s => s.id === 'atkup'),
    JSON.stringify([player.statuses, mate.statuses]));
  assert('气势如虹让全队攻击真正变高', sb.effectiveStat(mate, 'atk') > 100, sb.effectiveStat(mate, 'atk'));
  RND = 0.5;
}

/* ============ 9. 顺修：粗糙皮肤不再双倍 / 冰冻受击解除 ============ */
{
  const rough = sb.createUnit({ id: 'ro', side: 'enemy', name: '糙', base: { hp: 1000, atk: 10, def: 0, spd: 1 } });
  rough._talents = ['roughskin'];
  const atk = sb.createUnit({ id: 'ah', side: 'ally', name: '攻', base: { hp: 1000, atk: 100, def: 0, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [rough] });
  sb.normalAttack(gb, atk, rough);
  assert('粗糙皮肤不再让受击方吃双倍伤害（只扣 103）', rough.hp === 897, 'hp=' + rough.hp);
  assert('粗糙皮肤反伤打在攻击者身上（103×15% = 15）', atk.hp === 985, 'hp=' + atk.hp);
}
{
  const frozen = sb.createUnit({ id: 'fz2', side: 'ally', name: '冻', base: { hp: 300, atk: 20, def: 5, spd: 5 } });
  sb.applyStatus(frozen, { id: 'freeze', duration: 3 });
  const hitter = sb.createUnit({ id: 'ht', side: 'enemy', name: '攻', base: { hp: 300, atk: 50, def: 5, spd: 9 } });
  const gb = sb.createGroupBattle({ allies: [frozen], enemies: [hitter] });
  sb.normalAttack(gb, hitter, frozen);
  assert('冰冻被攻击即解除（受击解除已接线）', !sb.hasStatus(frozen, 'freeze'), JSON.stringify(frozen.statuses));
}

/* ============ 10. 蓄力重击：结算时点对齐设计文档（v2.1.21） ============
   设计 doc/design-v2.0.md:101-105：本回合进入蓄力（承伤 +25%）→ **下回合**结算 400%。
   改前实现是「当回合就打 400%（技能自带 power:400）+ 下回合再追加一次」，时点不符。 */
{
  const ch = sb.createUnit({ id: 'cg', side: 'enemy', name: '蓄', skills: ['chargeup'], base: { hp: 400, atk: 100, def: 5, spd: 9 } });
  const target = sb.createUnit({ id: 'ct', side: 'ally', name: '靶', base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
  const gb = sb.createGroupBattle({ allies: [target], enemies: [ch] });
  gb.turn = 1;
  const ev1 = sb.castSkill(gb, ch, 'chargeup');
  assert('蓄力重击进入蓄力状态', sb.hasStatus(ch, 'charging'), JSON.stringify(ch.statuses));
  assert('施放当回合不造成任何伤害（只蓄力）', target.hp === 9999, 'hp=' + target.hp);
  const dmgMuts = sb.dispatch(ch, 'onDamage', {}).mutations;
  assert('蓄力期间承伤 +25%', dmgMuts.some(m => m.key === 'dmgTakenBoost'), JSON.stringify(dmgMuts));
  sb.ageStatuses(ch);   // 模拟回合末到期 → _chargeReady
  assert('蓄力完成置 _chargeReady', ch._chargeReady === true);
  const hpBefore = target.hp;
  const ev2 = sb.groupUnitTurn(gb, ch);
  assert('下回合开始自动结算 💥 重击', /💥 .* 蓄力重击 →/.test(msgs(ev2)), msgs(ev2));
  assert('重击伤害 = 攻击×400%（100×4）', target.hp === hpBefore - 400, hpBefore + '→' + target.hp);
  assert('结算占用该次行动（本回合只有这一击）', ev2.filter(e => e.type === 'damage').length === 1,
    ev2.filter(e => e.type === 'damage').map(e => e.msg).join(' | '));
  assert('_chargeReady 用后归零', ch._chargeReady === false);
}

/* ============ 11. 迷惑（幻影之瞳）三选一（v2.1.21） ============
   设计 doc/design-v2.0.md:229：迷惑 1 敌 1 回合，随机执行 ①丧失防备 ②不分敌我误击 ③牺牲自我。 */
{
  function mkUnit(id, side, hp) {
    return sb.createUnit({ id: id, side: side, name: id, base: { hp: hp || 500, atk: 100, def: 100, spd: 5 } });
  }
  // 用固定 rng 精确命中三个分支：floor(r*3) = 0 / 1 / 2
  function runConfused(r, allies, enemies) {
    const gb = sb.createGroupBattle({ allies: allies, enemies: enemies });
    gb.rng = function () { return r; };
    const actor = enemies[0];
    sb.applyStatus(actor, { id: 'confused', duration: 1 });
    return { gb: gb, actor: actor, ev: sb.groupUnitTurn(gb, actor) };
  }

  // ① 丧失防备（r=0.1 → floor(0.3)=0）
  const a1 = mkUnit('a1', 'ally'), e1 = mkUnit('e1', 'enemy');
  const r1 = runConfused(0.1, [a1], [e1]);
  assert('迷惑分支①：丧失防备', /丧失防备/.test(msgs(r1.ev)), msgs(r1.ev));
  assert('丧失防备真的降低防御（-45%）', sb.effectiveStat(e1, 'def') === 55, sb.effectiveStat(e1, 'def'));
  assert('分支①不造成伤害', a1.hp === 500 && e1.hp === 500, a1.hp + '/' + e1.hp);

  // ② 不分敌我误击（r=0.4 → floor(1.2)=1）
  const a2 = mkUnit('a2', 'ally'), e2 = mkUnit('e2', 'enemy');
  const r2 = runConfused(0.4, [a2], [e2]);
  assert('迷惑分支②：敌我不分误击', /敌我不分/.test(msgs(r2.ev)), msgs(r2.ev));
  assert('误击伤害落在「其他敌人」身上', a2.hp < 500 && e2.hp === 500, a2.hp + '/' + e2.hp);
  assert('误击伤害 = 攻击×75%（100×0.75 − 防100/2 = 25）', a2.hp === 475, 'a2.hp=' + a2.hp);

  // ③ 牺牲自我（r=0.9 → floor(2.7)=2）
  const a3 = mkUnit('a3', 'ally'), e3 = mkUnit('e3', 'enemy', 1000);
  const r3 = runConfused(0.9, [a3], [e3]);
  assert('迷惑分支③：牺牲自我', /牺牲自我/.test(msgs(r3.ev)), msgs(r3.ev));
  assert('牺牲自我耗自身最大生命 6%（1000×6%=60）', e3.hp === 940, 'e3.hp=' + e3.hp);
  assert('分支③不打别人', a3.hp === 500, 'a3.hp=' + a3.hp);

  // ② 无其他敌人时不触发 → 退到 ③（文档明写）。直接调 resolveConfusion 避免构造空阵营的整场战斗
  const solo = mkUnit('solo', 'enemy', 1000);
  const evSolo = sb.resolveConfusion({ allies: [], enemies: [solo], units: [solo], rng: function () { return 0.4; } }, solo);
  assert('无其他敌人时 ② 不触发，回退到 ③', /牺牲自我/.test(msgs(evSolo)), msgs(evSolo));
  assert('回退分支的自身伤害正确（1000×6%=60）', solo.hp === 940, 'solo.hp=' + solo.hp);

  // 迷惑会正常过期（不会永久锁死）
  const e5 = mkUnit('e5', 'enemy');
  sb.applyStatus(e5, { id: 'confused', duration: 1 });
  sb.ageStatuses(e5);
  assert('迷惑 1 回合后自动解除', !sb.hasStatus(e5, 'confused'), JSON.stringify(e5.statuses));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

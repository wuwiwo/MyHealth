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

  // ① 丧失防备（r=0.1 → floor(0.3)=0）。未带等级信息 → 按技能 Lv1 = 区间下限 15%
  const a1 = mkUnit('a1', 'ally'), e1 = mkUnit('e1', 'enemy');
  const r1 = runConfused(0.1, [a1], [e1]);
  assert('迷惑分支①：丧失防备', /丧失防备/.test(msgs(r1.ev)), msgs(r1.ev));
  assert('丧失防备按 Lv1 取下限（防御 -15%）', sb.effectiveStat(e1, 'def') === 85, sb.effectiveStat(e1, 'def'));
  assert('分支①不造成伤害', a1.hp === 500 && e1.hp === 500, a1.hp + '/' + e1.hp);

  // ② 不分敌我误击（r=0.4 → floor(1.2)=1）。Lv1 → ×50%
  const a2 = mkUnit('a2', 'ally'), e2 = mkUnit('e2', 'enemy');
  const r2 = runConfused(0.4, [a2], [e2]);
  assert('迷惑分支②：敌我不分误击', /敌我不分/.test(msgs(r2.ev)), msgs(r2.ev));
  assert('误击伤害落在「其他敌人」身上', a2.hp < 500 && e2.hp === 500, a2.hp + '/' + e2.hp);
  assert('误击按 Lv1 取下限（100×50% − 防100/2 → 保底 1）', a2.hp === 499, 'a2.hp=' + a2.hp);

  // ③ 牺牲自我（r=0.9 → floor(2.7)=2）。Lv1 → 1%
  const a3 = mkUnit('a3', 'ally'), e3 = mkUnit('e3', 'enemy', 1000);
  const r3 = runConfused(0.9, [a3], [e3]);
  assert('迷惑分支③：牺牲自我', /牺牲自我/.test(msgs(r3.ev)), msgs(r3.ev));
  assert('牺牲自我按 Lv1 取下限（1000×1%=10）', e3.hp === 990, 'e3.hp=' + e3.hp);
  assert('分支③不打别人', a3.hp === 500, 'a3.hp=' + a3.hp);

  // ② 无其他敌人时不触发 → 退到 ③（文档明写）。直接调 resolveConfusion 避免构造空阵营的整场战斗
  const solo = mkUnit('solo', 'enemy', 1000);
  const evSolo = sb.resolveConfusion({ allies: [], enemies: [solo], units: [solo], rng: function () { return 0.4; } }, solo);
  assert('无其他敌人时 ② 不触发，回退到 ③', /牺牲自我/.test(msgs(evSolo)), msgs(evSolo));
  assert('回退分支同样按等级取值（1000×1%=10）', solo.hp === 990, 'solo.hp=' + solo.hp);

  /* ★ v2.1.22 核心：技能等级必须真的影响数值。
     dundun 指出「宠物技能有等级」—— 而此前 skillLevels 只在 UI/升级逻辑里读，
     战斗结算一律用固定值（升级了技能却不增强）。下面的对照锁住这条链路。 */
  function runWithLevel(lv, r) {
    const a = mkUnit('lv-a', 'ally'), e = mkUnit('lv-e', 'enemy', 1000);
    sb.applyStatus(e, { id: 'confused', duration: 1, data: { skillId: 'p_phantom', level: lv } });
    const ev = sb.resolveConfusion({ allies: [a], enemies: [e], units: [a, e], rng: function () { return r; } }, e);
    return { ev: ev, e: e, a: a };
  }
  const selfLo = runWithLevel(1, 0.9), selfHi = runWithLevel(10, 0.9);
  assert('牺牲自我随等级（Lv1 1% → Lv10 10%，hp 990/900）',
    selfLo.e.hp === 990 && selfHi.e.hp === 900, selfLo.e.hp + '/' + selfHi.e.hp);
  const downLo = runWithLevel(1, 0.1), downHi = runWithLevel(10, 0.1);
  assert('丧失防备随等级（Lv1 -15% → Lv10 -75%，def 85/25）',
    sb.effectiveStat(downLo.e, 'def') === 85 && sb.effectiveStat(downHi.e, 'def') === 25,
    sb.effectiveStat(downLo.e, 'def') + '/' + sb.effectiveStat(downHi.e, 'def'));

  // 迷惑会正常过期（不会永久锁死）
  const e5 = mkUnit('e5', 'enemy');
  sb.applyStatus(e5, { id: 'confused', duration: 1 });
  sb.ageStatuses(e5);
  assert('迷惑 1 回合后自动解除', !sb.hasStatus(e5, 'confused'), JSON.stringify(e5.statuses));
}

/* ============ 12. 技能「区间」随基础属性（炼化）成长（v2.1.22） ============
   设计依据 design-v2.0.md:187：「数值区间 = 随**基础属性**成长的下限~上限；
   属性来源见 §2.9 初始属性倾向与 §2.8 宠物炼化」。宠物基础属性的成长线 = 炼化，
   上限按稀有度 R50/SR60/SSR80/UR100（§2.4）。OQ-8 标注曲线公式**待定**，现用线性占位。 */
{
  const tgt = sb.createUnit({ id: 'pt', side: 'enemy', name: '靶', base: { hp: 99999, atk: 1, def: 0, spd: 1 } });
  const skill = sb.getSkill('p_flamepeck');   // range.power = [150, 330]
  assert('宠物攻击技能带区间数据', !!(skill && skill.range && skill.range.power), JSON.stringify(skill && skill.range));

  function petAt(refine, rarity) {
    const u = sb.createUnit({ id: 'pc' + refine + (rarity || 'SR'), side: 'ally', name: '鸟', base: { hp: 200, atk: 100, def: 5, spd: 5 }, tags: ['pet', rarity || 'SR'] });
    u._refineLevel = refine;
    return u;
  }
  const dmgOf = u => sb.calcSkillDamage(skill, u, [tgt], {}).hits[0].amount;

  assert('SR（上限60）炼化 0 → 区间下限 150%', dmgOf(petAt(0)) === 150, dmgOf(petAt(0)));
  assert('SR 炼化 30 → 线性中点 240%', dmgOf(petAt(30)) === 240, dmgOf(petAt(30)));
  assert('SR 炼化 60（满）→ 区间上限 330%', dmgOf(petAt(60)) === 330, dmgOf(petAt(60)));
  assert('上限按稀有度 R50/UR100：UR 炼化 50 → 中点 240%', dmgOf(petAt(50, 'UR')) === 240, dmgOf(petAt(50, 'UR')));
  assert('超过上限不越界（SR 炼化 999 → 仍 330%）', dmgOf(petAt(999)) === 330, dmgOf(petAt(999)));

  // 敌人没有炼化 → 退回 unit.level（1~10，由 group-levels 按大关给定）
  const foe5 = sb.createUnit({ id: 'f5', side: 'enemy', name: '敌', level: 5, base: { hp: 200, atk: 100, def: 5, spd: 5 } });
  assert('敌人退回 unit.level（Lv5 → t=4/9 → 230%）', dmgOf(foe5) === 230, dmgOf(foe5));

  // 没有区间的技能不受影响（文档只给单一「默认：X%」的那些）
  assert('无区间技能保持固定威力（冲撞 200%）',
    sb.calcSkillDamage(sb.getSkill('charge'), foe5, [tgt], {}).hits[0].amount === 200,
    sb.calcSkillDamage(sb.getSkill('charge'), foe5, [tgt], {}).hits[0].amount);
}

/* ============ 13. 治疗 / 状态 / 增益 三类通道也要吃到区间（v2.1.22） ============ */
{
  function petAt(refine, soulAtk) {
    const u = sb.createUnit({ id: 'h' + refine, side: 'ally', name: '宠', base: { hp: 500, atk: 50, def: 40, soulAtk: soulAtk || 100, soulDef: 30, spd: 5 }, tags: ['pet', 'SR'] });
    u._refineLevel = refine;
    return u;
  }
  const mate = sb.createUnit({ id: 'mate', side: 'ally', name: '友', base: { hp: 500, atk: 10, def: 10, spd: 5 } });

  // 圣光治愈：治疗量 110%~200% × 魂攻
  const lo = sb.applySkillEffects(sb.getSkill('p_holylight'), petAt(0), [mate], {}).heals[0].amount;
  const hi = sb.applySkillEffects(sb.getSkill('p_holylight'), petAt(60), [mate], {}).heals[0].amount;
  assert('治疗量随基础属性（圣光治愈 炼化0=110% × 100魂攻 = 110 → 满炼化 200）', lo === 110 && hi === 200, lo + '/' + hi);

  // 战意灌注：增益幅度 3%~30%
  const bLo = sb.applySkillEffects(sb.getSkill('p_warmight'), petAt(0), [mate], {}).buffs[0].value;
  const bHi = sb.applySkillEffects(sb.getSkill('p_warmight'), petAt(60), [mate], {}).buffs[0].value;
  assert('增益幅度随基础属性（战意灌注 3% → 30%）', Math.abs(bLo - 0.03) < 1e-9 && Math.abs(bHi - 0.30) < 1e-9, bLo + '/' + bHi);

  // 闪耀：降命 0%~40%
  const t1 = sb.createUnit({ id: 's1', side: 'enemy', name: '敌1', base: { hp: 100, atk: 10, def: 5, spd: 5 } });
  const t2 = sb.createUnit({ id: 's2', side: 'enemy', name: '敌2', base: { hp: 100, atk: 10, def: 5, spd: 5 } });
  sb.applySkillEffects(sb.getSkill('p_shine'), petAt(0), [t1], {});
  sb.applySkillEffects(sb.getSkill('p_shine'), petAt(60), [t2], {});
  assert('降命幅度随基础属性（闪耀 0% → 40%）', t1._accMod === 0 && Math.abs(t2._accMod + 0.4) < 1e-9, t1._accMod + '/' + t2._accMod);

  // 打湿：魂防 0%~25%（实例 modsPct 覆盖定义值，不叠加）+ 被命中 0%~30%（塞进状态 data）
  // 注意：applySkillEffects 只**产出** statusApps，真正施加在 castSkill 里（要把 modsPct/data 透传下去）
  function castDrench(who, refine) {
    const res = sb.applySkillEffects(sb.getSkill('p_drench'), petAt(refine), [who], {});
    res.statusApps.forEach(function (sa) {
      sb.applyStatus(who, { id: sa.id, duration: sa.duration, modsPct: sa.modsPct, data: sa.data });
    });
    sb.syncStatusDerived(who);
  }
  const wLo = sb.createUnit({ id: 'w1', side: 'enemy', name: '湿1', base: { hp: 100, atk: 10, def: 100, soulDef: 100, spd: 5 } });
  const wHi = sb.createUnit({ id: 'w2', side: 'enemy', name: '湿2', base: { hp: 100, atk: 10, def: 100, soulDef: 100, spd: 5 } });
  castDrench(wLo, 0);
  castDrench(wHi, 60);
  assert('打湿的魂防降幅随基础属性且不叠加（炼化0 → -0%，满 → -25%）',
    sb.effectiveStat(wLo, 'soulDef') === 100 && sb.effectiveStat(wHi, 'soulDef') === 75,
    sb.effectiveStat(wLo, 'soulDef') + '/' + sb.effectiveStat(wHi, 'soulDef'));
  const wetHi = (wHi.statuses || []).filter(s => s.id === 'wet')[0];
  assert('打湿的被命中加成随基础属性（满炼化 → +30%）',
    !!wetHi && Math.abs(wetHi.data.hitBonus - 0.30) < 1e-9, wetHi && JSON.stringify(wetHi.data));
  const atk0 = sb.createUnit({ id: 'atk0', side: 'ally', name: '攻', base: { hp: 100, atk: 50, def: 5, spd: 5 } });
  assert('castSkill 必须把 modsPct/data 透传给 applyStatus（否则上面的接线会被静默丢弃）',
    sb.groupHitChance(atk0, wHi) === 1, sb.groupHitChance(atk0, wHi));
}

/* ============ 14. 多段攻击与睡眠时长（v2.1.24） ============ */
{
  // 无影拳：设计「总计 5 次攻击，目标随机可重复」（design-v2.0.md:249）
  const fist = sb.getSkill('p_shadowfist');
  assert('无影拳声明为 5 段攻击', !!(fist && fist.multiHit === 5), fist && fist.multiHit);
  const caster = sb.createUnit({ id: 'sf', side: 'ally', name: '熊', base: { hp: 300, atk: 100, def: 5, spd: 5 }, tags: ['pet', 'UR'] });
  caster._refineLevel = 0;
  const pool = [1, 2, 3].map(i => sb.createUnit({ id: 'fe' + i, side: 'enemy', name: '敌' + i, base: { hp: 99999, atk: 1, def: 0, spd: 1 } }));
  let seed = 7;
  const vrand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const res = sb.calcSkillDamage(fist, caster, [pool[0]], { rng: vrand, pool: pool });
  assert('无影拳真的打 5 次（此前只有 1 次）', res.hits.length === 5, res.hits.length);
  assert('5 次命中都落在随机池内（目标随机可重复）',
    res.hits.every(h => pool.some(f => f.id === h.targetId)),
    JSON.stringify(res.hits.map(h => h.targetId)));
  assert('没有 pool 时退回目标列表（不报错，仍 5 段）',
    sb.calcSkillDamage(fist, caster, [pool[0]], {}).hits.length === 5);
  assert('单段技能不受影响（冲撞单目标仍 1 段）',
    sb.calcSkillDamage(sb.getSkill('charge'), caster, [pool[0]], {}).hits.length === 1);

  // 睡觉：1~3 回合（作者指定；设计文档原写 3~4）。duration = 实际回合数 + 1
  const sleeper = sb.createUnit({ id: 'sl', side: 'ally', name: '猪', base: { hp: 500, atk: 10, def: 100, soulDef: 100, spd: 5 }, tags: ['pet', 'R'] });
  sleeper._refineLevel = 0;
  const durations = [];
  [0.01, 0.5, 0.99].forEach(function (v) {
    RND = v;
    const r2 = sb.applySkillEffects(sb.getSkill('p_sleep'), sleeper, [sleeper], {});
    r2.statusApps.forEach(sa => durations.push(sa.duration));
  });
  RND = 0.5;
  assert('睡觉时长为 1~3 回合（duration 已 +1 → 2/3/4）',
    durations.length === 3 && durations.join(',') === '2,3,4', durations.join(','));
  assert('睡觉把 healPct 带给状态实例', (() => {
    const r3 = sb.applySkillEffects(sb.getSkill('p_sleep'), sleeper, [sleeper], {});
    const sa = r3.statusApps[0];
    return sa && sa.data && typeof sa.data.healPct === 'number';
  })());

  // 睡眠期间每回合结束回复 (防御+魂防)×healPct
  const t1 = sb.createUnit({ id: 'sl2', side: 'ally', name: '猪', base: { hp: 400, atk: 10, def: 100, soulDef: 100, spd: 5 } });
  sb.applyStatus(t1, { id: 'sleep', duration: 5, data: { healPct: 1.0 } });
  t1.hp = 100;
  sb.dispatch(t1, 'onTurnEnd', {});
  assert('睡眠每回合结束回复 (防100+魂防100)×100% = 200', t1.hp === 300, t1.hp);

  // 哈欠 / 歌唱造成的睡眠没有 healPct → 不回血（行为不变）
  const t2 = sb.createUnit({ id: 'sl3', side: 'ally', name: '猪', base: { hp: 400, atk: 10, def: 100, soulDef: 100, spd: 5 } });
  sb.applyStatus(t2, { id: 'sleep', duration: 2 });
  t2.hp = 100;
  sb.dispatch(t2, 'onTurnEnd', {});
  assert('哈欠/歌唱造成的睡眠不回血（无 healPct）', t2.hp === 100, t2.hp);
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

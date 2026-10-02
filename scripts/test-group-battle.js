#!/usr/bin/env node
/* M2b-4 测试：group battle engine
   1) 创建战场 + 行动队列排序（速度）
   2) 普攻伤害
   3) 技能施放（冲撞/治疗/遗言）
   4) 天赋触发（利刃/嗜血/威吓）
   5) 状态生效（中毒/冰冻）
   6) 胜负判定
   7) 原 battleTick 零回归（单敌战斗不受影响）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js'];
// v2.1.5：群战引入 5% 基础命中率，测试须用确定性随机才稳定（否则偶发落空）
// 注意 Math 的属性不可枚举，必须用 Object.create 继承而非 Object.assign 拷贝
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };
const sandbox = { Math: deterministicMath, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 创建战场 + 行动队列 ----
const ally = sandbox.createUnit({ id: 'ally-0', side: 'ally', name: '你', base: { hp: 300, atk: 30, def: 20, spd: 5 } });
const enemy1 = sandbox.createUnit({ id: 'enemy-0', side: 'enemy', name: '敌1', base: { hp: 150, atk: 15, def: 10, spd: 8 } });
const enemy2 = sandbox.createUnit({ id: 'enemy-1', side: 'enemy', name: '敌2', base: { hp: 120, atk: 12, def: 8, spd: 3 } });
const gb = sandbox.createGroupBattle({ allies: [ally], enemies: [enemy1, enemy2] });
assert('创建战场', gb.units.length === 3 && !gb.done);

const queue = sandbox.buildActionQueue(gb);
assert('行动队列按速度降序', queue[0].id === 'enemy-0' && queue[2].id === 'enemy-1', queue.map(u => u.id + '(' + u.base.spd + ')').join(','));

// ---- 2. 普攻 ----
const beforeHP = enemy1.hp;
sandbox.normalAttack(gb, ally, enemy1);
assert('普攻造成伤害', enemy1.hp < beforeHP, beforeHP + '→' + enemy1.hp);

// ---- 3. 技能施放 ----
const healer = sandbox.createUnit({ id: 'heal-0', side: 'ally', name: '奶妈', skills: ['heal'], base: { hp: 100, atk: 5, def: 5, soulAtk: 50 } });
const gb2 = sandbox.createGroupBattle({ allies: [ally, healer], enemies: [enemy1.clone ? enemy1 : sandbox.createUnit({ id: 'e9', side: 'enemy', name: '敌', base: { hp: 100, atk: 10, def: 5, spd: 2 } })] });
ally.hp = 100;
const healEvents = sandbox.castSkill(gb2, healer, 'heal');
assert('治疗技能恢复', ally.hp > 100, 'hp=' + ally.hp);

// 遗言
const martyr = sandbox.createUnit({ id: 'martyr', side: 'enemy', name: '遗言者', skills: ['lastword'], base: { hp: 50, atk: 10, def: 5 } });
const gb3 = sandbox.createGroupBattle({ allies: [sandbox.createUnit({ id: 'a9', side: 'ally', name: '主', base: { hp: 200, atk: 20, def: 10, spd: 5 } })], enemies: [martyr] });
const lw = sandbox.castSkill(gb3, martyr, 'lastword');
assert('遗言牺牲自身', martyr.hp === 0, 'hp=' + martyr.hp);

/* v2.1.31：技能「起始冷却」（startCooldown）此前全项目无消费点 ——
   设计文档要求遗言「战斗开始进入冷却状态（起始冷却 7-13 回合）」，
   缺了这条保护，敌人会第 1 回合自爆把关卡送掉。 */
const lwGuard = sandbox.createUnit({ id: 'lwg', side: 'enemy', name: '遗言者2', skills: ['lastword'], base: { hp: 50, atk: 10, def: 5 } });
assert('遗言开场进入冷却（startCooldown 生效）',
  sandbox.skillOnCooldown(lwGuard, 'lastword') === true && sandbox.usableSkills(lwGuard).indexOf('lastword') < 0,
  'cd=' + sandbox.skillCooldownLeft(lwGuard, 'lastword'));
for (let ci = 0; ci < 10; ci++) sandbox.tickSkillCooldowns(lwGuard);
assert('冷却递减 10 回合后遗言恢复可用',
  sandbox.skillOnCooldown(lwGuard, 'lastword') === false && sandbox.usableSkills(lwGuard).indexOf('lastword') >= 0,
  'cd=' + sandbox.skillCooldownLeft(lwGuard, 'lastword'));
assert('未声明 startCooldown 的技能不受影响（冲撞开场即可用）',
  sandbox.usableSkills(sandbox.createUnit({ id: 'cg', side: 'enemy', name: '冲撞者', skills: ['charge'], base: { hp: 50, atk: 10, def: 5 } })).indexOf('charge') >= 0);

// ---- 4. 天赋触发 ----
const bladeEnemy = sandbox.createUnit({ id: 'be', side: 'enemy', name: '利刃敌', talents: ['blade'], base: { hp: 100, atk: 20, def: 5, spd: 2 } });
sandbox.attachTalents(bladeEnemy, ['blade']);
const target = sandbox.createUnit({ id: 'tg', side: 'ally', name: '靶', base: { hp: 500, atk: 1, def: 1, spd: 1 } });
const bhp = target.hp;
sandbox.normalAttack(gb3, bladeEnemy, target);
assert('利刃天赋伤害提升', target.hp < bhp - 19, '扣' + (bhp - target.hp));  // 基础≥19，利刃更高

// ---- 5. 状态生效 ----
const poisoner = sandbox.createUnit({ id: 'po', side: 'enemy', name: '毒师', skills: ['blackmist'], base: { hp: 100, atk: 5, def: 5 } });
const victim = sandbox.createUnit({ id: 'vi', side: 'ally', name: '受害者', base: { hp: 200, atk: 10, def: 5, spd: 2 } });
const gb4 = sandbox.createGroupBattle({ allies: [victim], enemies: [poisoner] });
// 强制命中：直接施加
sandbox.applyStatus(victim, { id: 'poison', duration: 4 });
const vhp = victim.hp;
sandbox.tickStatuses(victim, 'turnEnd');
assert('中毒在群战生效', victim.hp < vhp);

// ---- 6. 完整战斗（自动跑完）----
const gb5 = sandbox.createGroupBattle({
  allies: [sandbox.createUnit({ id: 'A', side: 'ally', name: '你', base: { hp: 300, atk: 35, def: 20, spd: 6 } })],
  enemies: [
    sandbox.createUnit({ id: 'E1', side: 'enemy', name: '精英', skills: ['charge', 'bite'], talents: ['blade'], base: { hp: 180, atk: 18, def: 10, spd: 7 } }),
    sandbox.createUnit({ id: 'E2', side: 'enemy', name: '杂兵', base: { hp: 60, atk: 8, def: 4, spd: 2 } })
  ]
});
sandbox.runGroupBattle(gb5, 100);
assert('群战正常结束', gb5.done === true);
assert('群战有胜负', gb5.winner === 'ally' || gb5.winner === 'enemy', 'winner=' + gb5.winner);
assert('群战有事件日志', gb5.log.length > 0);

// ---- 7. 原 battleTick 零回归 ----
const lv = sandbox.findLevel('1-1');
const sides = sandbox.buildBattleSides({ atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }, lv);
const affix = sandbox.rollBossAffixFor(lv);
const b = sandbox.createBattle(sides.player, sides.enemy, { npc: lv.npc, boss: lv.boss }, affix);
let g = 0;
while (!b.done && g++ < 200) sandbox.battleTick(b);
assert('原战斗引擎零回归', b.done === true && (b.winner === true || b.winner === false), 'winner=' + b.winner);


// ---- 8. v2.4.3 修复：选靶必须按**施法者阵营**（敌人辅助技能不得作用到我方）----
/* 为什么单独立一节并多次采样：`selectTargets` 的 ally1/ally2 此前写死 `gb.allies`（玩家方），
   导致敌方施放「治愈 / 强攻 / 净化」时目标 100% 落在我方（实测每个技能 40/40 次命中 ally 侧，
   等于敌方辅助技能长期在帮玩家）。单次采样会被随机掩盖，故每格抽 60 次统计阵营分布。
   设计口径见《2.0 敌群设计》第 160~171 行：这三个技能的「我方」= 施法者自己一方。 */
function sideDist(actorSide, skillId, n) {
  const s = { ally: 0, enemy: 0, self: 0, none: 0 };
  for (let k = 0; k < (n || 60); k++) {
    const mk = (id, side) => sandbox.createUnit({ id: id + '-' + k, side: side, name: id,
      base: { hp: 300, atk: 30, def: 10, spd: 5, soulAtk: 50, soulDef: 20 } });
    const a1 = mk('a1', 'ally'), a2 = mk('a2', 'ally'), a3 = mk('a3', 'ally');
    const e1 = mk('e1', 'enemy'), e2 = mk('e2', 'enemy'), e3 = mk('e3', 'enemy');
    const g = sandbox.createGroupBattle({ allies: [a1, a2, a3], enemies: [e1, e2, e3] });
    const actor = (actorSide === 'ally') ? a1 : e1;
    let ts;
    try { ts = sandbox.selectTargets(g, actor, sandbox.SKILLS[skillId]) || []; }
    catch (e) { s.none++; continue; }
    if (!ts.length) { s.none++; continue; }
    ts.forEach(u => { if (!u) s.none++; else if (u.id === actor.id) s.self++; else s[u.side]++; });
  }
  return s;
}
['heal', 'empower', 'cleanse'].forEach(function (sid) {
  const d = sideDist('enemy', sid);
  assert('敌方施放「' + sandbox.SKILLS[sid].name + '」（target=' + sandbox.SKILLS[sid].target +
    '）不得选到我方：' + JSON.stringify(d),
    d.ally === 0 && d.enemy > 0, JSON.stringify(d));
});
['heal', 'cleanse'].forEach(function (sid) {
  const d = sideDist('ally', sid);
  assert('我方施放「' + sandbox.SKILLS[sid].name + '」仍选我方（既有正确行为不得被修坏）：' + JSON.stringify(d),
    d.enemy === 0 && d.ally > 0, JSON.stringify(d));
});
[['blizzard', 'all'], ['charge', 'random1'], ['armorbreak', 'random1'], ['spikes', 'all']].forEach(function (p) {
  const d = sideDist('enemy', p[0]);
  assert('敌方伤害类「' + sandbox.SKILLS[p[0]].name + '」（target=' + p[1] + '）仍打我方：' + JSON.stringify(d),
    d.enemy === 0 && d.ally > 0, JSON.stringify(d));
});
{
  const d = sideDist('enemy', 'taunt');
  assert('target=self 的技能仍指向自身（不受本次修复影响）：' + JSON.stringify(d), d.self > 0, JSON.stringify(d));
}
{
  const src = load('battle-group.js');
  const body = src.slice(src.indexOf('function selectTargets'), src.indexOf('/* 普通攻击（无技能时） */'));
  assert('selectTargets 必须按阵营派生候选（含 mates / foes）',
    /\bvar mates\b/.test(body) && /\bvar foes\b/.test(body));
  assert('selectTargets 不得再把 allies/enemies 直接当候选池（旧 bug 形态）',
    body.indexOf('drawRandom(allies') < 0 && body.indexOf('drawRandom(enemies') < 0 &&
    body.indexOf('healTargets = allies') < 0 && !/var pool = actor\.side/.test(body));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
/* v2.1.14 测试：战斗日志可读性 + 两处「写了没接线」的引擎缺陷修复
   1) 威吓 onBattleStart 真正被派发（此前从未触发）
   2) 威吓的攻击削减真正生效（此前只标记、无人读取）
   3) 嘲讽会复位（此前 _taunting 永真 → 永久吸火 + 永久 2 倍速）
   4) 场地事件落进 gb.log（此前只进 gb.events，UI 读不到）
   5) 日志补出行动者与目标（普攻/魂攻/技能/状态）
   6) 「无法行动」带触发原因
   7) 状态日志不再外泄英文状态 id
   Run: node scripts/test-battle-log-audit.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'date-roll.js', 'levels.js', 'group-levels.js', 'unit.js', 'state-core.js',
  'status-defs.js', 'talent.js', 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js',
  'terrain.js', 'ai.js'];
// 确定性随机（Math 属性不可枚举，须 Object.create 继承而非拷贝）
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
const msgsOf = evts => (evts || []).map(e => (e && e.msg) || '').join(' | ');
function dmgIn(evts) { const m = /→\s+(\d+)\s+伤害/.exec(msgsOf(evts)); return m ? +m[1] : null; }

/* ---- 1. 威吓在开战时真正触发 ---- */
const hero = sandbox.createUnit({ id: 'hero', side: 'ally', name: '威吓者', base: { hp: 500, atk: 30, def: 20, spd: 9 } });
hero._talents = ['intimidate'];
const foeA = sandbox.createUnit({ id: 'e0', side: 'enemy', name: '敌甲', base: { hp: 300, atk: 20, def: 10, spd: 5 } });
const foeB = sandbox.createUnit({ id: 'e1', side: 'enemy', name: '敌乙', base: { hp: 300, atk: 20, def: 10, spd: 4 } });
const gb = sandbox.createGroupBattle({ allies: [hero], enemies: [foeA, foeB] });
sandbox.groupBattleStep(gb);
assert('威吓 onBattleStart 已被派发', !!(foeA._intimidated || foeB._intimidated));
const openingEntry = gb.log.filter(l => l.turn === 0);
assert('威吓事件写进 gb.log（回合 0 开场）', openingEntry.some(l => /威吓/.test(msgsOf(l.events))),
  JSON.stringify(gb.log.map(l => l.turn + ':' + msgsOf(l.events))).slice(0, 220));
assert('威吓日志写明「谁威吓了谁」', /😱 威吓：威吓者 → 敌[甲乙] 攻击 -40%/.test(msgsOf(openingEntry.reduce((a, l) => a.concat(l.events), []))),
  msgsOf(openingEntry.reduce((a, l) => a.concat(l.events), [])));
assert('威吓命中目标身上留下标记', !!(foeA._intimidated || foeB._intimidated));

/* ---- 2. 威吓的攻击削减真正生效 ---- */
const atk1 = sandbox.createUnit({ id: 'a1', side: 'ally', name: '正常', base: { hp: 300, atk: 60, def: 10, spd: 5 } });
const atk2 = sandbox.createUnit({ id: 'a2', side: 'ally', name: '被威吓', base: { hp: 300, atk: 60, def: 10, spd: 5 } });
atk2._intimidated = true;
const tgt1 = sandbox.createUnit({ id: 't1', side: 'enemy', name: '靶1', base: { hp: 999, atk: 5, def: 10, spd: 1 } });
const tgt2 = sandbox.createUnit({ id: 't2', side: 'enemy', name: '靶2', base: { hp: 999, atk: 5, def: 10, spd: 1 } });
const gb2 = sandbox.createGroupBattle({ allies: [atk1, atk2], enemies: [tgt1, tgt2] });
const dNormal = dmgIn(sandbox.normalAttack(gb2, atk1, tgt1));
const dNerfed = dmgIn(sandbox.normalAttack(gb2, atk2, tgt2));
assert('威吓使普攻伤害降低约 40%', dNerfed === Math.max(1, Math.floor(dNormal * 0.6)),
  'normal=' + dNormal + ' nerfed=' + dNerfed);

/* ---- 3. 嘲讽会复位 + 速度加成不会永久 ---- */
const tank = sandbox.createUnit({ id: 'tk', side: 'enemy', name: '嘲讽者', base: { hp: 400, atk: 20, def: 10, spd: 5 } });
const mate = sandbox.createUnit({ id: 'fo', side: 'ally', name: '我方', base: { hp: 400, atk: 20, def: 10, spd: 3 } });
const gb3 = sandbox.createGroupBattle({ allies: [mate], enemies: [tank] });
gb3.turn = 1;                                   // 本轮 turn = 2
tank._taunting = true; tank._tauntMark = 2;
const spdWhile = sandbox.unitInitiative(tank, null);
sandbox.groupUnitTurn(gb3, tank);
assert('施加当回合嘲讽仍生效', tank._taunting === true);
assert('嘲讽期间速度 ×2', spdWhile === tank.base.spd * 2, 'spd=' + spdWhile);
gb3.turn = 2;                                   // 次轮 turn = 3
sandbox.groupUnitTurn(gb3, tank);
assert('嘲讽在下一次行动开始时被清除', tank._taunting === false);
assert('嘲讽清除后速度恢复', sandbox.unitInitiative(tank, null) === tank.base.spd,
  'spd=' + sandbox.unitInitiative(tank, null));

/* ---- 4. 威吓解除（威吓者血量 <50%）有日志 + 清标记 ---- */
const heroW = sandbox.createUnit({ id: 'hw', side: 'ally', name: '威吓者', base: { hp: 100, atk: 10, def: 5, spd: 5 } });
heroW._talents = ['intimidate'];
const victimW = sandbox.createUnit({ id: 'vw', side: 'enemy', name: '被威吓', base: { hp: 100, atk: 10, def: 5, spd: 1 } });
victimW._intimidated = true;
heroW.hp = 40;                                  // < 50%
const gb4 = sandbox.createGroupBattle({ allies: [heroW], enemies: [victimW] });
gb4.turn = 1;
const ev4 = sandbox.groupUnitTurn(gb4, heroW);
assert('威吓解除写入日志', /威吓解除/.test(msgsOf(ev4)), msgsOf(ev4));
assert('威吓解除清掉标记', victimW._intimidated === false);

/* ---- 5. 场地事件落进 gb.log ---- */
const h5 = sandbox.createUnit({ id: 'h5', side: 'ally', name: '我方', base: { hp: 300, atk: 20, def: 10, spd: 6 } });
const m5 = sandbox.createUnit({ id: 'm5', side: 'enemy', name: '敌方', base: { hp: 300, atk: 20, def: 10, spd: 3 } });
const gb5 = sandbox.createGroupBattle({ allies: [h5], enemies: [m5], terrain: sandbox.getTerrain('heat') });
sandbox.groupBattleTick(gb5);
const te5 = gb5.log.filter(l => l.terrain === true);
assert('场地事件落进 gb.log', te5.length > 0, 'log turns=' + gb5.log.map(l => l.turn).join(','));
assert('场地日志标注场地名（场地·酷暑）', te5.length > 0 && /场地·酷暑/.test(te5[0].unit), te5[0] && te5[0].unit);

/* ---- 6. 日志补出行动者与目标 ---- */
const gb6 = sandbox.createGroupBattle({
  allies: [sandbox.createUnit({ id: 'p6', side: 'ally', name: '你', base: { hp: 300, atk: 40, def: 10, spd: 9, soulAtk: 25 } })],
  enemies: [sandbox.createUnit({ id: 'e6', side: 'enemy', name: '铁甲兵', base: { hp: 300, atk: 15, def: 10, spd: 2, soulAtk: 12 } })]
});
sandbox.groupBattleTick(gb6);
const all6 = gb6.log.reduce((a, l) => a.concat(l.events), []).map(e => e.msg).join('\n');
assert('普攻日志含行动者+目标：⚔️ 你 攻击 铁甲兵 → N 伤害', /⚔️ 你 攻击 铁甲兵 → \d+ 伤害/.test(all6), all6.split('\n').slice(0, 6).join(' / '));
assert('魂攻日志含行动者+目标', /👻 .+ 魂攻击 .+ → \d+ 魂伤害/.test(all6), all6.split('\n').slice(0, 8).join(' / '));
assert('普攻伤害事件带 targetId（动画定位用）',
  gb6.log.reduce((a, l) => a.concat(l.events), []).some(e => e.targetId && /攻击 .+ →/.test(e.msg || '')));

/* ---- 7. 「无法行动」带触发原因 ---- */
const frozen = sandbox.createUnit({ id: 'fz', side: 'ally', name: '被冻者', base: { hp: 200, atk: 10, def: 5, spd: 5 } });
sandbox.applyStatus(frozen, { id: 'freeze', duration: 2 });
const gb7 = sandbox.createGroupBattle({ allies: [frozen], enemies: [sandbox.createUnit({ id: 'x7', side: 'enemy', name: '敌', base: { hp: 100, atk: 10, def: 5, spd: 1 } })] });
gb7.turn = 1;
const ev7 = sandbox.groupUnitTurn(gb7, frozen);
assert('无法行动日志带触发原因', /🚫 被冻者 无法行动（❄️ 冰冻）/.test(msgsOf(ev7)), msgsOf(ev7));

/* ---- 8. 状态日志用中文名 + 施受双方，不外泄英文 id ---- */
const caster = sandbox.createUnit({ id: 'c8', side: 'ally', name: '施法', skills: ['blackmist'], base: { hp: 200, atk: 10, def: 5, spd: 8 } });
const victim = sandbox.createUnit({ id: 'v8', side: 'enemy', name: '受术', base: { hp: 200, atk: 10, def: 5, spd: 1 } });
const gb8 = sandbox.createGroupBattle({ allies: [caster], enemies: [victim] });
gb8.turn = 1;
const ev8 = sandbox.castSkill(gb8, caster, 'blackmist');
assert('状态日志写明「施法者 → 目标 施加【中毒】」', /🌀 施法 → 受术 施加【中毒】/.test(msgsOf(ev8)), msgsOf(ev8));
assert('状态日志不再外泄英文 id', !/\(poison\)/.test(msgsOf(ev8)), msgsOf(ev8));

/* ---- 9. 技能伤害日志含目标名 ---- */
const gb9 = sandbox.createGroupBattle({
  allies: [sandbox.createUnit({ id: 'c9', side: 'ally', name: '猛者', skills: ['charge'], base: { hp: 300, atk: 50, def: 10, spd: 9 } })],
  enemies: [sandbox.createUnit({ id: 'v9', side: 'enemy', name: '沙袋', base: { hp: 400, atk: 5, def: 10, spd: 1 } })]
});
gb9.turn = 1;
const ev9 = sandbox.castSkill(gb9, gb9.allies[0], 'charge');
assert('技能伤害日志含目标名：⚡ 猛者 冲撞 → 沙袋 N 伤害', /⚡ 猛者 冲撞 → 沙袋 \d+ 伤害/.test(msgsOf(ev9)), msgsOf(ev9));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

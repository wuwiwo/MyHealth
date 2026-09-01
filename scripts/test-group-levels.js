#!/usr/bin/env node
/* M2b-6 端到端测试：敌群关卡 → 生成敌人 → 群战引擎 → 完整战斗
   1) GROUP_LEVELS 5 关加载
   2) 生成敌人（按 tier 阶梯）
   3) 完整群战（打到底）
   4) Boss 群关卡（g5）战斗正常
   5) 场地+天赋+技能+状态全链路
   6) 多关遍历不崩
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js'];
const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. GROUP_LEVELS 加载 ----
const gl = sandbox.GROUP_LEVELS;
assert('GROUP_LEVELS 5 关', Object.keys(gl).length === 5, '实际 ' + Object.keys(gl).length);

// ---- 2. 从关卡配置生成敌人 ----
function spawnGroup(levelCfg) {
  return levelCfg.enemies.map(function (ec) {
    return sandbox.createEnemyUnit({
      tier: ec.tier,
      name: ec.name,
      talents: ec.talents,
      skills: ec.skills,
      base: ec.base
    });
  });
}
const g1Enemies = spawnGroup(gl.g1);
assert('g1 生成 3 敌人', g1Enemies.length === 3);
assert('g1 敌人是 enemy side', g1Enemies.every(u => u.side === 'enemy'));
assert('g1 杂兵 0 天赋', g1Enemies.every(u => sandbox.enemyTalentCount(u) === 0));
assert('g1 敌人属性正确', g1Enemies[0].base.atk === 8 && g1Enemies[0].base.hp === 80);

// ---- 3. 完整群战（玩家 vs g1）----
function fightGroup(levelCfg, playerBase) {
  const player = sandbox.createUnit({ id: 'player', side: 'ally', name: '你', base: playerBase });
  const enemies = spawnGroup(levelCfg);
  const gb = sandbox.createGroupBattle({ allies: [player], enemies: enemies });
  sandbox.runGroupBattle(gb, 200);
  return gb;
}
const r1 = fightGroup(gl.g1, { hp: 500, atk: 50, def: 30, spd: 8 });
assert('g1 战斗结束', r1.done === true);
assert('g1 有胜负', r1.winner === 'ally' || r1.winner === 'enemy');
assert('g1 事件日志', r1.log.length > 0);

// ---- 4. Boss 群关 ----
const r5 = fightGroup(gl.g5, { hp: 2000, atk: 120, def: 60, spd: 12, soulAtk: 50, soulDef: 30 });
assert('g5 Boss 群战斗结束', r5.done === true);
assert('g5 Boss 群有胜负', r5.winner === 'ally' || r5.winner === 'enemy', 'winner=' + r5.winner);

// ---- 5. 全链路：场地 + 技能 + 天赋 + 状态 ----
const player2 = sandbox.createUnit({ id: 'p2', side: 'ally', name: '你', base: { hp: 1500, atk: 100, def: 50, spd: 10 } });
const g3Enemies = spawnGroup(gl.g3);
const gb2 = sandbox.createGroupBattle({ allies: [player2], enemies: g3Enemies });
gb2.terrain = sandbox.getTerrain('sandstorm');
sandbox.runGroupBattle(gb2, 200);
assert('g3+沙暴战斗结束', gb2.done === true);
assert('g3 精英有天赋', g3Enemies.some(u => sandbox.enemyTalentCount(u) >= 2), 'talents=' + g3Enemies.map(u => sandbox.enemyTalentCount(u)).join(','));
assert('g3 精英有技能', g3Enemies.some(u => sandbox.enemySkillCount(u) >= 1), 'skills=' + g3Enemies.map(u => sandbox.enemySkillCount(u)).join(','));
// 检查战斗日志里出现过技能（中文名）
const allLog = JSON.stringify(gb2.log);
const skillUsed = /冲撞|咬击|黑气|地刺/.test(allLog);
assert('技能在战斗中施放', skillUsed, allLog.slice(0, 200));

// ---- 6. 全关遍历不崩 ----
let crash = 0;
Object.values(gl).forEach(function (lv) {
  try { fightGroup(lv, { hp: 3000, atk: 200, def: 100, spd: 15, soulAtk: 100, soulDef: 60 }); }
  catch (e) { crash++; console.log('  崩溃 ' + lv.id + ': ' + e.message); }
});
assert('5 关遍历无崩溃', crash === 0, crash + ' 崩溃');

// ---- 7. 原单敌战斗零回归 ----
const lv11 = sandbox.findLevel('1-1');
const sides = sandbox.buildBattleSides({ atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }, lv11);
const affix = sandbox.rollBossAffixFor(lv11);
const b = sandbox.createBattle(sides.player, sides.enemy, { npc: lv11.npc, boss: lv11.boss }, affix);
let g = 0;
while (!b.done && g++ < 200) sandbox.battleTick(b);
assert('原单敌战斗零回归', b.done === true);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

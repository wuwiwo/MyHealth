#!/usr/bin/env node
/* 敌群关卡重构测试：12 大关 × 10 小关 = 120 关
   1) 12 大关，每关 10 小关
   2) 第 5 小关精英、第 10 小关 Boss
   3) 大关 1-2 无魂攻防、最多 2 敌；大关 3-9 最多 3 敌（含魂攻/魂防）
   4) 难度递增
   5) 完整群战跑通
   6) desc 文案声明的敌数 == 该大关实际最多敌数（用户可见文案防回归）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js'];
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

// ---- 1. 12 大关 × 10 小关 ----
const gl = sandbox.GROUP_LEVELS;
const groupKeys = Object.keys(gl);
assert('12 大关', groupKeys.length === 12, '实际 ' + groupKeys.length);
groupKeys.forEach(k => assert('大关 ' + k + ' 有 10 小关', (gl[k].stages || []).length === 10, '实际 ' + (gl[k].stages||[]).length));

// ---- 2. 第 5 小关精英、第 10 小关 Boss ----
const g1 = gl.g1;
assert('g1-5 精英关', g1.stages[4].type === 'elite', g1.stages[4].type);
assert('g1-10 Boss 关', g1.stages[9].type === 'boss', g1.stages[9].type);
const g6 = gl.g6;
assert('g6-5 精英关', g6.stages[4].type === 'elite');
assert('g6-10 Boss 关', g6.stages[9].type === 'boss');
const g9 = gl.g9;
assert('g9-5 精英关', g9.stages[4].type === 'elite');
assert('g9-10 Boss 关', g9.stages[9].type === 'boss');

// ---- 3. 数量与魂攻防规则 ----
function maxEnemiesOf(lg) {
  var max = 0;
  gl['g'+lg].stages.forEach(s => { max = Math.max(max, s.enemies.length); });
  return max;
}
function hasSoulOf(lg) {
  return gl['g'+lg].stages.some(s => s.enemies.some(e => (e.base.soulAtk || 0) > 0));
}
assert('g1 最多 2 敌', maxEnemiesOf(1) <= 2, '实际 ' + maxEnemiesOf(1));
assert('g2 最多 2 敌', maxEnemiesOf(2) <= 2, '实际 ' + maxEnemiesOf(2));
assert('g3 最多 3 敌', maxEnemiesOf(3) <= 3, '实际 ' + maxEnemiesOf(3));
assert('g6 最多 3 敌', maxEnemiesOf(6) <= 3, '实际 ' + maxEnemiesOf(6));
assert('g9 最多 3 敌', maxEnemiesOf(9) <= 3, '实际 ' + maxEnemiesOf(9));
assert('g1 无魂攻防', !hasSoulOf(1));
assert('g2 无魂攻防', !hasSoulOf(2));
assert('g3 有魂攻防', hasSoulOf(3));
assert('g6 有魂攻防', hasSoulOf(6));

// ---- 3.5 desc 文案敌数 == 实际最多敌数（用户可见文案防回归）----
// desc 由 game-views.js:134/194 直接渲染到关卡选择界面，
// 曾出现「4 敌+魂攻防」而实际最多 3 敌的文案 bug，故加断言锁死。
function maxEnemiesOfKey(k) {
  var max = 0;
  gl[k].stages.forEach(function (s) { max = Math.max(max, s.enemies.length); });
  return max;
}
function claimedEnemiesOf(k) {
  var m = (gl[k].desc || '').match(/最多\s*(\d+)\s*敌|（(\d+)\s*敌/);
  return m ? parseInt(m[1] || m[2], 10) : NaN;
}
groupKeys.forEach(function (k) {
  var actual = maxEnemiesOfKey(k);
  var claimed = claimedEnemiesOf(k);
  assert('desc 敌数一致 ' + k, claimed === actual,
    'desc 声称 ' + claimed + ' 敌，实际最多 ' + actual + ' 敌 — 「' + gl[k].desc + '」');
});

// ---- 4. 难度递增 ----
const g1Atk = gl.g1.stages[0].enemies[0].base.atk;
const g6Atk = gl.g6.stages[9].enemies[0].base.atk;
const g9Atk = gl.g9.stages[9].enemies[0].base.atk;
assert('难度递增（g6 Boss 攻击 > g1 首关）', g6Atk > g1Atk, g1Atk + ' vs ' + g6Atk);
assert('难度递增（g9 Boss 攻击 > g6 Boss）', g9Atk > g6Atk, g6Atk + ' vs ' + g9Atk);

// ---- 5. 完整群战（g1-1 和 g6-10）----
function fightStage(stageId, playerBase) {
  const stage = sandbox.getGroupStage(stageId);
  const player = sandbox.createUnit({ id:'player', side:'ally', name:'你', base: playerBase });
  const enemies = stage.enemies.map(function(ec,i){
    return sandbox.createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base});
  });
  const gb = sandbox.createGroupBattle({ allies:[player], enemies: enemies });
  sandbox.runGroupBattle(gb, 200);
  return gb;
}
const r1 = fightStage('g1-1', { hp: 500, atk: 50, def: 30, spd: 8 });
assert('g1-1 战斗结束', r1.done === true);
const r6 = fightStage('g6-10', { hp: 5000, atk: 300, def: 150, spd: 12, soulAtk: 150, soulDef: 80 });
assert('g6-10 Boss 战斗结束', r6.done === true, 'winner=' + r6.winner);
const r9 = fightStage('g9-10', { hp: 8000, atk: 500, def: 250, spd: 14, soulAtk: 250, soulDef: 150 });
assert('g9-10 Boss 战斗结束', r9.done === true, 'winner=' + r9.winner);

// ---- 6. 全 120 关遍历不崩（大关数由数据派生，扩关后自动跟随）----
let crash = 0;
let stageCount = 0;
groupKeys.forEach(function (gk) {
  (gl[gk].stages || []).forEach(function (s) {
    stageCount++;
    try { fightStage(s.id, { hp: 4000, atk: 300, def: 160, spd: 12, soulAtk: 160, soulDef: 100 }); }
    catch (e) { crash++; console.log('  崩溃 ' + s.id + ': ' + e.message); }
  });
});
assert('120 关总数正确', stageCount === 120, '实际 ' + stageCount);
assert('120 关遍历无崩溃', crash === 0, crash + ' 崩溃');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

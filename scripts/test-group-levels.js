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
const files = ['utils.js', 'date-roll.js','levels.js','group-levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','terrain.js'];
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

// ---- 1. N 大关 × 10 小关 ----
const gl = sandbox.GROUP_LEVELS;
const groupKeys = Object.keys(gl);
/* v2.1.29：大关数由 GROUP_STAGE_NAMES 派生，不写死字面量。
   ⚠️ 此前写死 === 18，扩关必挂；同时「名字表加了、循环没改」的静默失败也靠这条兜住：
      断言的是 GROUP_LEVELS 实际生成数 == 名字表条目数 == GROUP_MAX。 */
const nameCount = Object.keys(sandbox.GROUP_STAGE_NAMES || {}).length;
assert('GROUP_STAGE_NAMES 非空', nameCount > 0, '实际 ' + nameCount);
assert('GROUP_MAX == 名字表条目数', sandbox.GROUP_MAX === nameCount, 'GROUP_MAX=' + sandbox.GROUP_MAX + ' 名字表=' + nameCount);
assert(groupKeys.length + ' 大关', groupKeys.length === nameCount, '实际 ' + groupKeys.length + '，名字表 ' + nameCount);
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
assert(stageCount + ' 关总数正确', stageCount === groupKeys.length * 10, '实际 ' + stageCount);
assert(stageCount + ' 关遍历无崩溃', crash === 0, crash + ' 崩溃');

// ---- 7. g13+ 超限试炼门槛（v2.1.11）----
// 目的：后续关卡必须是「当前属性打不过、需要继续锻炼」的门槛，而不是线性外推的送分关
function bossAtkOf(k) { return gl[k].stages[9].enemies[0].base.atk; }
const tailKeys = groupKeys.filter(function (k) { return parseInt(k.slice(1), 10) >= 13; });
/* v2.1.29：超限大关数由 GROUP_MAX / GROUP_TAIL_FROM 派生（此前写死 6，扩关必挂） */
const tailFrom = sandbox.GROUP_TAIL_FROM || 13;
const tailWant = nameCount - tailFrom + 1;
assert('g' + tailFrom + '~g' + nameCount + ' 共 ' + tailWant + ' 个超限大关存在',
  tailKeys.length === tailWant, '实际 ' + tailKeys.length + '：' + (tailKeys.join(',') || '无'));
assert('超限大关 desc 标注为超限试炼', tailKeys.every(function (k) { return gl[k].desc.indexOf('超限') >= 0; }));
assert('g13 门槛显著高于 g12（' + bossAtkOf('g12') + ' → ' + bossAtkOf('g13') + '）',
  bossAtkOf('g13') > bossAtkOf('g12') * 1.4);
// 注：档间倍率是恒定的（≈1.55 = TAIL_POW × 线性底），不是递增的 ——
// 这里要断言的是「跨进超限档的跳跃远大于普通档位步进」，而不是倍率递增。
assert('跨进超限档的跳跃 ≫ 普通档位步进（' + (bossAtkOf('g13') / bossAtkOf('g12')).toFixed(2) + '× vs '
  + (bossAtkOf('g12') / bossAtkOf('g11')).toFixed(2) + '×）',
  (bossAtkOf('g13') / bossAtkOf('g12')) > (bossAtkOf('g12') / bossAtkOf('g11')) * 1.3);
assert('基础曲线 g1~g12 仍为线性加压（每档倍率递减）', (function () {
  return (bossAtkOf('g12') / bossAtkOf('g11')) < (bossAtkOf('g3') / bossAtkOf('g2'));
})());
assert('超限大关敌人仍有魂攻魂防', tailKeys.every(function (k) {
  const b = gl[k].stages[9].enemies[0].base;
  return b.soulAtk > 0 && b.soulDef > 0;
}));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

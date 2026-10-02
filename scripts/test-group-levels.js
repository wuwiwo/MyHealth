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

// ---- 3.7 v2.2.16（§5.4E 天赋固化）----
// 🔴 此前 `cfg.talents` **从未被赋值**：genEnemyCfg 里 `var talents = []` 之后没有任何 push，
//    `if (talents.length)` 永不成立 → 实战落到 enemy.js 的兜底随机抽取（不在战斗种子体系内）
//    → 同一关每场重摇（实测 g12-10 的 Boss 抽到过 magicshield + slowstart + lazy）。
// 现在天赋与属性/词条/技能一样由 (大关,小关,槽位) 播种。
// v2.3.0（作者裁决「保留，给精英怪/普通怪」）：**Boss 仍只用 TALENTS_HIGH**，
//   精英 / 普通怪另有 `WEAK_TALENT_CHANCE` 的负面天赋注入（lazy / slowstart，替换掉最后一个天赋）。
const highT = sandbox.TALENTS_HIGH || [];
const lowT = sandbox.TALENTS_LOW || ['lazy', 'slowstart'];
const tCountRange = sandbox.GROUP_TALENT_COUNT || {};
let noTalent = [], badPoolBoss = [], badPoolLow = [], weakOn = [], weakOnBoss = [], badCount = [];
groupKeys.forEach(function (k) {
  (gl[k].stages || []).forEach(function (s) {
    (s.enemies || []).forEach(function (e, i) {
      const list = e.talents || [];
      if (e.tier !== 'minion' && list.length === 0) noTalent.push(s.id + '#' + i);
      if (e.tier === 'minion' && list.length) noTalent.push(s.id + '#' + i + '(杂兵不该有天赋)');
      const r = tCountRange[e.tier];
      if (r && (list.length < r[0] || list.length > r[1])) badCount.push(s.id + '#' + i + '=' + list.length);
      list.forEach(function (t) {
        if (e.tier === 'boss' && highT.indexOf(t) < 0) badPoolBoss.push(s.id + ':' + t);
        if (e.tier !== 'boss' && highT.concat(lowT).indexOf(t) < 0) badPoolLow.push(s.id + ':' + t);
        if (lowT.indexOf(t) >= 0) {
          weakOn.push(s.id + ':' + t);
          if (e.tier === 'boss') weakOnBoss.push(s.id + ':' + t);
        }
      });
    });
  });
});
assert('天赋已固化进关卡配置（非杂兵槽位都带 talents）', noTalent.length === 0, noTalent.slice(0, 5).join(','));
assert('天赋个数落在 GROUP_TALENT_COUNT[tier] 区间内', badCount.length === 0, badCount.slice(0, 5).join(','));
assert('Boss 天赋全部来自 TALENTS_HIGH', badPoolBoss.length === 0, badPoolBoss.slice(0, 5).join(','));
assert('非 Boss 天赋来自 TALENTS_HIGH ∪ TALENTS_LOW', badPoolLow.length === 0, badPoolLow.slice(0, 5).join(','));
assert('Boss 不抽 lazy / slowstart（全 ' + groupKeys.length + ' 个 Boss 关无例外）', weakOnBoss.length === 0, weakOnBoss.slice(0, 5).join(','));
assert('精英 / 普通怪的负面天赋恢复出场（' + weakOn.length + ' 处）', weakOn.length > 0, weakOn.slice(0, 5).join(','));
assert('天赋抽取是确定性的：同一关两次生成结果一致', (function () {
  for (let lg = 1; lg <= nameCount; lg++) {
    for (let st = 1; st <= 10; st++) {
      const a = JSON.stringify(sandbox.genEnemyCfg(lg, st, 0, false, true).talents || []);
      const b = JSON.stringify(sandbox.genEnemyCfg(lg, st, 0, false, true).talents || []);
      if (a !== b) return false;
    }
  }
  return true;
})());
assert('天赋池与注册表一致（id 全部存在、无宠物专属天赋）', (function () {
  let ok = true;
  groupKeys.forEach(function (k) {
    (gl[k].stages || []).forEach(function (s) {
      (s.enemies || []).forEach(function (e) {
        (e.talents || []).forEach(function (t) {
          const def = sandbox.TALENTS[t];
          if (!def || def.petOnly) ok = false;
        });
      });
    });
  });
  return ok;
})());

// ---- 3.9 v2.4.1：SKILLS_LOW 死池修复（可达性 / 确定性 / 概率区间）----
// 🔴 此前 group-levels.js 的技能派发只有 Boss 与 精英 两条分支：
//    `var sp = (… ? SKILLS_HIGH : SKILLS_LOW).slice()` 在杂兵身上把 SKILLS_LOW 赋给 sp 之后，
//    两个分支都进不去 → sp 从未被消费 → 这 6 条低级技能在 240 个关卡里一次都不会发动
//    （实测：杂兵 238 个技能槽位，携带技能 0 个）。
//    v2.4.1 补上杂兵分支：50% 概率带 1 个低级技能，仍走本小关的 rng()。
const lowSkillIds = sandbox.SKILLS_LOW || [];
assert('SKILLS_LOW 池可读且非空（' + lowSkillIds.length + ' 条：' + lowSkillIds.join('/') + '）', lowSkillIds.length > 0);
const lowHit = {};
lowSkillIds.forEach(function (id) { lowHit[id] = 0; });
let minionSlots = 0, minionWithSkill = 0, minionMulti = [], minionForeign = [];
groupKeys.forEach(function (k) {
  (gl[k].stages || []).forEach(function (s) {
    (s.enemies || []).forEach(function (e, i) {
      if (e.tier !== 'minion') return;
      minionSlots++;
      const sk = e.skills || [];
      if (sk.length) {
        minionWithSkill++;
        if (sk.length > 1) minionMulti.push(s.id + '#' + i + '=' + sk.length);
      }
      sk.forEach(function (id) {
        if (lowSkillIds.indexOf(id) >= 0) lowHit[id]++;
        else minionForeign.push(s.id + '#' + i + ':' + id);
      });
    });
  });
});
const lowMissed = lowSkillIds.filter(function (id) { return !lowHit[id]; });
assert('SKILLS_LOW 全员可达 ' + (lowSkillIds.length - lowMissed.length) + '/' + lowSkillIds.length + ' 命中'
  + '（逐条 ' + lowSkillIds.map(function (id) { return id + '=' + lowHit[id]; }).join(' ') + '）',
  lowSkillIds.length > 0 && lowMissed.length === 0, '未出场：' + (lowMissed.join('/') || '无'));
assert('杂兵携带技能数 ≤ 1（' + minionSlots + ' 个杂兵槽位）', minionMulti.length === 0, minionMulti.slice(0, 5).join(','));
assert('杂兵技能全部来自 SKILLS_LOW（不得出现 SKILLS_HIGH 成员）', minionForeign.length === 0, minionForeign.slice(0, 5).join(','));
/* 回归守卫：50% 是**概率**，不是「恒有」也不是「恒无」。
   把概率写成 0 / 1 时这条必须红 —— 否则「概率形同虚设」没人会发现。 */
const minionRate = minionSlots ? minionWithSkill / minionSlots : 0;
assert('杂兵带技能比例落在 20%~80%（实测 ' + (minionRate * 100).toFixed(1) + '% = ' + minionWithSkill + '/' + minionSlots + '）',
  minionRate > 0.2 && minionRate < 0.8);
console.log('   [v2.4.1] SKILLS_LOW 死池修复：命中 ' + (lowSkillIds.length - lowMissed.length) + '/' + lowSkillIds.length
  + '，杂兵带技能 ' + minionWithSkill + '/' + minionSlots + ' = ' + (minionRate * 100).toFixed(1) + '%');
assert('杂兵技能抽取是确定性的：同一 (大关,小关,槽位) 两次生成结果完全一致', (function () {
  for (let lg = 1; lg <= nameCount; lg++) {
    for (let st = 1; st <= 10; st++) {
      for (let slot = 0; slot < 3; slot++) {
        const a = JSON.stringify(sandbox.genEnemyCfg(lg, st, slot, false, false));
        const b = JSON.stringify(sandbox.genEnemyCfg(lg, st, slot, false, false));
        if (a !== b) return false;
      }
    }
  }
  return true;
})());
assert('关卡既有 rng 入口可复现：同一种子重建两次，序列逐位一致', (function () {
  for (let lg = 1; lg <= nameCount; lg++) {
    for (let st = 1; st <= 10; st++) {
      for (let slot = 0; slot < 3; slot++) {
        const seed = sandbox.groupHash(lg, st, slot) + 303;   // 303 = 杂兵分支的 tier 偏移
        const r1 = sandbox.groupRng(seed), r2 = sandbox.groupRng(seed);
        for (let n = 0; n < 4; n++) if (r1() !== r2()) return false;
      }
    }
  }
  return true;
})());

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

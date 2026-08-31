#!/usr/bin/env node
/* M2a S1-C 测试：battle.js rng 注缝 + 零回归验证
   1) 确定性：同种子战斗结果一致（可复现）
   2) API 冻结：buildBattleSides/rollBossAffixFor/createBattle/battleTick/findLevel 签名不变
   3) 语义保持：dualAffix Boss 双词条、敌方属性直接取自关卡
   4) 多关卡遍历不崩 + Boss 词条组合正常
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const battleSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'battle.js'), 'utf8');
const levelsSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'levels.js'), 'utf8');

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(levelsSrc, sandbox);
vm.runInContext(battleSrc, sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. API 冻结 ----
['buildBattleSides', 'rollBossAffixFor', 'createBattle', 'battleTick', 'findLevel', 'mulberry32']
  .forEach(fn => assert('API 存在: ' + fn, typeof sandbox[fn] === 'function'));

// ---- 2. findLevel 语义（嵌套 LEVELS）----
const lv11 = sandbox.findLevel('1-1');
assert('findLevel(1-1) 返回关卡', !!lv11 && lv11.id === '1-1');
assert('关卡敌方属性直接可用 (atk/def/hp)', lv11 && typeof lv11.atk === 'number' && typeof lv11.hp === 'number');
const lv166 = sandbox.findLevel('16-6');
assert('findLevel(16-6) Boss 存在', !!lv166 && lv166.boss);

// ---- 3. 确定性：同种子两次一致 ----
function runBattleSeed(seed, levelId) {
  const rng = sandbox.mulberry32(seed);
  sandbox._battleRng = rng;  // 先注入，覆盖 affix 抽取 + 战斗全程
  const lv = sandbox.findLevel(levelId);
  const sides = sandbox.buildBattleSides({ atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }, lv);
  const affix = sandbox.rollBossAffixFor(lv);
  const b = sandbox.createBattle(sides.player, sides.enemy, { npc: lv.npc, boss: lv.boss }, affix);
  let guard = 0;
  while (!b.done && guard++ < 300) sandbox.battleTick(b);
  return { winner: b.winner, turn: b.turn, pHP: b.player.hp, eHP: b.enemy.hp };
}
const r1 = runBattleSeed(42, '1-1');
const r2 = runBattleSeed(42, '1-1');
assert('同种子结果一致', JSON.stringify(r1) === JSON.stringify(r2), JSON.stringify(r1) + ' vs ' + JSON.stringify(r2));
assert('同种子 turn 一致', r1.turn === r2.turn);

// ---- 4. 不同种子不同 ----
const r3 = runBattleSeed(7, '1-1');
assert('不同种子结果不同', JSON.stringify(r1) !== JSON.stringify(r3) || r1.turn !== r3.turn);

// ---- 5. dualAffix Boss 双词条 ----
const affix166 = sandbox.rollBossAffixFor(lv166);
assert('16-6 dualAffix 双词条', !!affix166 && affix166.name && affix166.name.includes('·'), affix166 ? affix166.name : 'null');
const affix14 = sandbox.rollBossAffixFor(sandbox.findLevel('1-6'));
assert('1-6 普通 Boss 单词条', !affix14 || !affix14.name || !affix14.name.includes('·'));

// ---- 6. 多关卡遍历不崩（前 30 关）----
let crash = 0, wins = 0;
const allLevels = [];
Object.values(sandbox.LEVELS).forEach(ch => (ch.levels || []).forEach(l => allLevels.push(l)));
allLevels.slice(0, 30).forEach((lv, i) => {
  try {
    const r = runBattleSeed(100 + i, lv.id);
    if (r.winner === true) wins++;
  } catch (e) { crash++; console.log('  崩溃 ' + lv.id + ': ' + e.message); }
});
assert('前 30 关遍历无崩溃', crash === 0, crash + ' 崩溃');
assert('存在玩家胜利关卡（50/30/300 属性）', wins > 0, 'wins=' + wins);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

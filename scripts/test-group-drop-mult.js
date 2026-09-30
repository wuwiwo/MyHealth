#!/usr/bin/env node
/* v2.2 WP-H8 补线测试：敌群胜利掉落套用**同一份**掉落倍率常量
   ────────────────────────────────────────────────────────────────────────
   背景（doc/changelog-v2.2.md v2.2.21 的受阻登记）：
     掉落倍率（宝珠碎片 ×3 / 炼化石 ×2 / 灵能 ×2）的唯一常量 `DROP_MULT` 已挂在
     `page/challenge.js` 顶部，并在挑战结算路径（endChallenge）套用；但**敌群胜利掉落**
     （`page/game-render.js` 的 groupVictoryReward，产 refineNormal / spirit）当时在禁写名单里，
     未接 —— 本套件锁住「补线后」的行为。

   判据（照 test-challenge-monthly.js / test-lucky-pocket.js 的口径）：
     · 功能：基础掉落真的被放大（×2），且结果文案与实际发放一致
     · 唯一来源：倍率数字只在 challenge.js 定义一次，game-render.js 只调用 applyDropMults()
     · 边界：不产 refineNormal/spirit 的关卡不受影响；营养液/饲料不受影响（×1）
     · 有意不覆盖：宠物天赋「幸运口袋」那几笔（天赋独立产出，不随本次倍率放大）

   Run: node scripts/test-group-drop-mult.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 基础掉落仍走 Math.random（既有口径，不在本次改动范围）→ 钉死 0.5 使其确定：
     nutrition 1+floor(.5*2)=2 / feed 1+floor(.5*3)=2 / refineNormal 1 / spirit 1+floor(.5*2)=2 */
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };

const sandbox = { Math: deterministicMath, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
/* 加载顺序照抄 page/index.html：challenge.js(305) 先于 game-render.js(312)
   —— 消费端靠运行时全局查 applyDropMults()，不依赖加载顺序，这里如实复现 */
['utils.js', 'date-roll.js', 'levels.js', 'state-core.js', 'status-defs.js', 'unit.js', 'talent.js',
 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js', 'challenge.js', 'game-render.js',
 'pets.js', 'pet-materials.js', 'pet-codex.js'].forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---- 消费端脚手架 ---- */
let granted = {};
sandbox.grantMaterial = function (type, n) { granted[type] = (granted[type] || 0) + n; };
sandbox.getMaterialName = function (type) { return type; };
sandbox.recordSkillWin = function () { return 0; };
sandbox.awardSkillPoints = function () { return { gained: 4 }; };

/* 顺序 rng（幸运口袋用；越界复用末值并标记） */
function seqRng(arr) {
  let i = 0;
  const fn = function () { return i < arr.length ? arr[i++] : arr[arr.length - 1]; };
  return fn;
}

function runReward(enemyCount, rngFn, carriers) {
  granted = {};
  const allies = [];
  for (let i = 0; i < (carriers || 0); i++) allies.push({ id: 'c' + i, name: '小负鼠' + i, _talents: ['lucky_pocket'] });
  allies.push({ id: 'plain', name: '普通宠', _talents: ['dark_eye'] });
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) enemies.push({});
  const gb = { allies: allies, enemies: enemies, rng: rngFn };
  const r = sandbox.groupVictoryReward(gb);
  return { msg: r.msg, granted: Object.assign({}, granted), lines: String(r.msg).split(' · ') };
}

/* ================================================================
   [1] 唯一来源守卫
   ================================================================ */
console.log('\n[1] 唯一来源守卫（倍率只在 challenge.js 定义一次）');
const grSrc = load('game-render.js');
const challengeSrc = load('challenge.js');
const defCount = (challengeSrc.match(/var DROP_MULT\s*=/g) || []).length;
assert('倍率常量 DROP_MULT 只在 challenge.js 定义一次', defCount === 1, 'defCount=' + defCount);
assert('game-render.js 不自己定义/引用 DROP_MULT（只经 applyDropMults）',
  grSrc.indexOf('DROP_MULT') < 0, 'game-render.js 里出现了 DROP_MULT');
assert('game-render.js 的敌群掉落走 applyDropMults()', grSrc.indexOf('applyDropMults(') >= 0);
assert('套用发生在发放之前（grantMaterial 之前）—— 结果面板与实际发放一致',
  grSrc.indexOf('drops = applyDropMults(drops)') >= 0 &&
  grSrc.indexOf('drops = applyDropMults(drops)') < grSrc.indexOf('grantMaterial(d.type, d.n)'));
assert('套用点位于 groupVictoryReward 内（不是别的函数）',
  grSrc.indexOf('function groupVictoryReward') < grSrc.indexOf('drops = applyDropMults(drops)'));

/* ================================================================
   [2] 功能：基础掉落真的被放大
   ================================================================ */
console.log('\n[2] 敌群胜利基础掉落套倍率');
/* 4 敌：产 nutrition 2 / feed 2 / refineNormal 1 / spirit 2 */
const four = runReward(4, () => 0.5, 0);
assert('炼化石（refineNormal）1 → 2（×2）', four.granted.refineNormal === 2, String(four.granted.refineNormal));
assert('灵能（spirit）2 → 4（×2）', four.granted.spirit === 4, String(four.granted.spirit));
assert('营养液 / 饲料不受影响（×1）', four.granted.nutrition === 2 && four.granted.feed === 2,
  JSON.stringify({ n: four.granted.nutrition, f: four.granted.feed }));
assert('结果文案显示的是放大后的数量（与实际发放一致）',
  four.msg.indexOf('refineNormal +2') >= 0 && four.msg.indexOf('spirit +4') >= 0, four.msg);

/* 3 敌：只产 refineNormal（无 spirit） */
const three = runReward(3, () => 0.5, 0);
assert('3 敌：refineNormal 1 → 2（×2）', three.granted.refineNormal === 2 && three.granted.spirit === undefined,
  JSON.stringify(three.granted));

/* 2 敌（不产两类）：完全不受影响（负向对照） */
const two = runReward(2, () => 0.5, 0);
assert('2 敌：既不产 refineNormal 也不产 spirit（倍率无从作用）',
  two.granted.refineNormal === undefined && two.granted.spirit === undefined &&
  two.granted.nutrition === 2 && two.granted.feed === 2, JSON.stringify(two.granted));

/* ================================================================
   [3] 边界：幸运口袋（天赋独立产出）不参与本次倍率
   ================================================================ */
console.log('\n[3] 幸运口袋掉落不套倍率（有意为之）');
/* 同一段 rng（照 test-lucky-pocket.js 的 RICH_SEQ）→ 🍀 灵能 1 个 */
const RICH_SEQ = [0.3, 0, 0.7, 0.9, 0, 0.5, 0.5, 0.05, 0.3];
const withCarrier = runReward(4, seqRng(RICH_SEQ.slice()), 1);
const luckySpirit = withCarrier.lines.filter(l => l.indexOf('🍀') >= 0 && l.indexOf('spirit') >= 0);
assert('🍀 灵能仍是天赋自己掷出的数量（1），未被 ×2',
  luckySpirit.length === 1 && /spirit \+1/.test(luckySpirit[0]), luckySpirit.join('|'));
assert('基础灵能（2）仍被 ×2 → 4；两笔在结果里分开显示',
  withCarrier.granted.spirit === 5 && withCarrier.msg.indexOf('spirit +4') >= 0,
  JSON.stringify({ spirit: withCarrier.granted.spirit, msg: withCarrier.msg }));
assert('无携带者时没有 🍀 行（对照）',
  runReward(4, () => 0.5, 0).lines.every(l => l.indexOf('🍀') < 0));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

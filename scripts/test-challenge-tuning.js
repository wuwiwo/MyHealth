#!/usr/bin/env node
/* v2.4.10 隐藏挑战调参回归测试
 *
 * 本版两件事（作者要求「时间缩短为 6~8s，修改奖励阈值与 buff 效果」）：
 *   ① 倒计时 8~12s → 6~8s（唯一常量 CH_DUR_MIN / CH_DUR_MAX）
 *   ② 属性奖励阈值三档等比 ×0.7（唯一常量 CH_REWARD_DIV）
 *      —— 目的：点击量少约 30% 后，「同等手速拿到的属性奖励」保持不变
 *   ③ 热血 buff 'timeBonus' 同步缩放到新基线（保留原有「锁高档 70~100%」机制）
 *
 * 关键不变量（本测试的核心）：
 *     floor(0.7·D / 1575) ≈ floor(D / 2250)     即「伤害打七折，奖励基本不变」
 *   ⚠️ 是「≈」不是「==」：实数上两者相等，但浮点各自舍入，floor 边界上可能差 1 步。
 *      判据 = **≤1 步**（atk/def 1 点、hp 3 点）；对照的「阈值取整」会系统性漂移多步。
 *      采样用固定种子 PRNG（mulberry32）保证可复现 —— 本测试曾用 Math.random 而 flaky。
 *
 * Run: node scripts/test-challenge-tuning.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

/* 与 test-challenge-monthly.js 同款 headless 沙箱 */
function makeSandbox(challengeObj) {
  const data = { strength: { entries: [] } };
  if (challengeObj != null) data.challenge = challengeObj;
  const sandbox = { JSON, console, Date };
  sandbox.Math = Math;
  sandbox.window = sandbox;
  sandbox.store = {
    get(k) { return data[k] != null ? JSON.parse(JSON.stringify(data[k])) : null; },
    set(k, v) { data[k] = JSON.parse(JSON.stringify(v)); },
    _data: data
  };
  sandbox.getExerciseMap = function () { return {}; };
  sandbox.toast = function () {};
  sandbox.document = { getElementById: () => null, body: { appendChild: () => {} } };
  sandbox.openModal = function () { return { remove() {}, querySelector() { return null; }, addEventListener() {} }; };
  vm.createContext(sandbox);
  vm.runInContext(load('utils.js'), sandbox);
  vm.runInContext(load('date-roll.js'), sandbox);
  vm.runInContext(load('challenge.js'), sandbox);
  return sandbox;
}

const sb = makeSandbox({});
const SRC = load('challenge.js');

/* ================================================================
   ① 倒计时区间常量
   ================================================================ */
console.log('\n[1] 倒计时区间（唯一常量）');
assert('CH_DUR_MIN = 6', sb.CH_DUR_MIN === 6, String(sb.CH_DUR_MIN));
assert('CH_DUR_MAX = 8', sb.CH_DUR_MAX === 8, String(sb.CH_DUR_MAX));
assert('区间有效（min < max）', sb.CH_DUR_MIN < sb.CH_DUR_MAX);

/* ================================================================
   ② 属性奖励阈值常量
   ================================================================ */
console.log('\n[2] 属性奖励阈值（唯一常量）');
const D = sb.CH_REWARD_DIV;
assert('CH_REWARD_DIV.atk = 1575', D && D.atk === 1575, D && String(D.atk));
assert('CH_REWARD_DIV.def = 2362.5（小数是刻意的，见源码注释）', D && D.def === 2362.5, D && String(D.def));
assert('CH_REWARD_DIV.hp = 472.5（小数是刻意的，见源码注释）', D && D.hp === 472.5, D && String(D.hp));
assert('CH_REWARD_DIV.hpStep = 3', D && D.hpStep === 3, D && String(D.hpStep));

console.log('\n[2.1] 与历史值（v2.4.9 及以前 2250 / 3375 / 675）的比值 ≈ 0.7');
const OLD = { atk: 2250, def: 3375, hp: 675 };
for (const k of ['atk', 'def', 'hp']) {
  const r = D[k] / OLD[k];
  assert(`  ${k} 比值 ≈ 0.7（实际 ${r.toFixed(4)}）`, Math.abs(r - 0.7) < 0.002, r.toFixed(4));
}

/* ================================================================
   ③ ⭐ 核心不变量：伤害打七折，奖励不变
   ================================================================ */
console.log('\n[3] ⭐ 核心不变量：点击量 −30% 后同等手速奖励持平');
/* 阈值等比 ×0.7 的**唯一目的**：dmg 变成 0.7 倍时，floor(dmg/div) 不变。
   即 floor(0.7·D / 1575) == floor(D / 2250)。 */
/* 固定种子的 PRNG（mulberry32，与项目其它测试同源）。
   ⚠️ 必须确定性：本测试曾用 Math.random 采样 4000 点而 **flaky** ——
   随机点偶尔命中取整边界，让「偏差」从 0 跳到 1，同一份代码时红时绿。 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261005);
const DMGS = [50000, 100000, 200000, 300000, 500000, 800000, 1200000, 2000000];
for (let i = 0; i < 20000; i++) DMGS.push(1000 + Math.floor(rnd() * 3000000));
let worstAtk = 0, worstDef = 0, worstHp = 0;
for (const dmg of DMGS) {
  const aOld = Math.floor(dmg / OLD.atk), aNew = Math.floor(0.7 * dmg / D.atk);
  const dOld = Math.floor(dmg / OLD.def), dNew = Math.floor(0.7 * dmg / D.def);
  const hOld = Math.floor(dmg / OLD.hp) * 3, hNew = Math.floor(0.7 * dmg / D.hp) * 3;
  worstAtk = Math.max(worstAtk, Math.abs(aNew - aOld));
  worstDef = Math.max(worstDef, Math.abs(dNew - dOld));
  worstHp = Math.max(worstHp, Math.abs(hNew - hOld));
}
/* 判据说明（重要，别改回「严格 0」）：
   `0.7·D/div` 与 `D/旧div` 在实数上**完全相等**，但浮点运算各自舍入，
   在 `floor()` 的边界上可能差 1 步。这是任何 floor 的固有性质、**不是设计缺陷**。
   所以正确的判据是「**≤ 1 步**」，而要区分的两件事是：
     ① 边界效应  → 最多 1 步（atk/def 1 点，hp 3 点）
     ② 阈值取整  → **系统性漂移**，随伤害增大到多步（实测 hp 15 点 = 5 步）
   下面同时断言两者，并断言「① 明显小于 ②」。 */
assert(`攻击奖励偏差 ≤ 1 点（${DMGS.length} 个采样点，最大 ${worstAtk}）`, worstAtk <= 1, 'worst=' + worstAtk);
assert(`防御奖励偏差 ≤ 1 点（最大 ${worstDef}）`, worstDef <= 1, 'worst=' + worstDef);
assert(`生命奖励偏差 ≤ 1 步 = 3 血（最大 ${worstHp}）`, worstHp <= D.hpStep, 'worst=' + worstHp);

/* 反证 1：把 hp 阈值取整成 472 会产生**系统性漂移**（多步），远大于边界效应 */
const driftInt = Math.max(...[1200000, 2000000, 3000000].map(d => Math.abs(Math.floor(0.7 * d / 472) * 3 - Math.floor(d / 675) * 3)));
assert(`反证：hp 阈值取整为 472 会系统性漂移 ${driftInt} 血（>1 步，证明小数必要）`, driftInt > D.hpStep, 'drift=' + driftInt);

/* 反证 2：整数版漂移必须明显大于小数版 —— 两者不是同一量级 */
assert('小数版偏差严格小于整数版漂移（量级可区分）', worstHp < driftInt, `${worstHp} < ${driftInt}`);

/* 反例守卫：若阈值没跟着下调（仍用旧值），同一伤害下奖励会掉约 30% —— 确认这个反例真的会失败 */
const aOldDiv = Math.floor(0.7 * 500000 / OLD.atk);
const aNewDiv = Math.floor(0.7 * 500000 / D.atk);
assert('变异验证：若沿用旧阈值 2250，奖励会明显偏低（证明本测试有判别力）',
  aNewDiv > aOldDiv * 1.2, `新 ${aNewDiv} vs 旧阈值下 ${aOldDiv}`);

/* ================================================================
   ④ 时长分布（从**源码表达式**求值，不是复述一份拷贝）
   ================================================================ */
console.log('\n[4] 时长分布（对源码表达式求值）');
/* 从源码里抠出普通时长的表达式，用沙箱常量求值 —— 这样测的是「线上真正跑的那行」 */
const mNormal = SRC.match(/var baseDur=(CH_DUR_MIN\+Math\.floor\(Math\.random\(\)\*\(CH_DUR_MAX-CH_DUR_MIN\+1\)\))/);
assert('源码中普通时长由常量派生（未硬编码 8/12）', !!mNormal,
  mNormal ? '' : '未匹配到 var baseDur=CH_DUR_MIN+Math.floor(...)');

if (mNormal) {
  const expr = new Function('CH_DUR_MIN', 'CH_DUR_MAX', 'Math',
    'return ' + mNormal[1]);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(expr(sb.CH_DUR_MIN, sb.CH_DUR_MAX, Math));
  const arr = [...seen].sort((a, b) => a - b);
  assert('普通时长取值 = {6,7,8}', JSON.stringify(arr) === '[6,7,8]', JSON.stringify(arr));
  assert('普通时长最小 6 秒（不再出现 8 秒以下的旧下限之上…）', arr[0] === 6, String(arr[0]));
  assert('普通时长最大 8 秒', arr[arr.length - 1] === 8, String(arr[arr.length - 1]));
}

console.log('\n[4.1] 热血 buff timeBonus（保留「锁高档 70%~100%」再 ×1.4）');
const mBonus = SRC.match(/baseDur=(CH_DUR_MIN\+\(CH_DUR_MAX-CH_DUR_MIN\)\*\(0\.7\+Math\.random\(\)\*0\.3\))/);
const mMult = SRC.match(/duration=Math\.round\(baseDur\*1\.4\)/);
assert('源码中 timeBonus 基础时间由常量派生', !!mBonus, mBonus ? '' : '未匹配');
assert('源码中 timeBonus 仍为 ×1.4', !!mMult);

if (mBonus) {
  const exprB = new Function('CH_DUR_MIN', 'CH_DUR_MAX', 'Math', 'return ' + mBonus[1]);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(Math.round(exprB(sb.CH_DUR_MIN, sb.CH_DUR_MAX, Math) * 1.4));
  const arr = [...seen].sort((a, b) => a - b);
  assert('timeBonus 时长取值 = {10,11}', JSON.stringify(arr) === '[10,11]', JSON.stringify(arr));
  assert('timeBonus 仍严格长于普通上限 8s', arr[0] > sb.CH_DUR_MAX, arr[0] + ' > ' + sb.CH_DUR_MAX);
  assert('timeBonus 相对普通均值的倍率落在合理区间（1.3~1.6）', (() => {
    const r = (arr[0] + arr[arr.length - 1]) / 2 / ((sb.CH_DUR_MIN + sb.CH_DUR_MAX) / 2);
    return r > 1.3 && r < 1.6;
  })());
}

/* ================================================================
   ⑤ 反回归：源码里不得再出现旧硬编码
   ================================================================ */
console.log('\n[5] 反回归：旧硬编码不得复活');
const codeOnly = SRC.split('\n').filter(l => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');
assert('结算处不再出现 2250 / 3375 / 675 作为除数',
  !/Math\.floor\(dmg\/2250\)/.test(codeOnly) && !/Math\.floor\(dmg\/3375\)/.test(codeOnly) && !/Math\.floor\(dmg\/675\)/.test(codeOnly));
assert('结算处改走 CH_REWARD_DIV',
  /Math\.floor\(dmg\/CH_REWARD_DIV\.atk\)/.test(codeOnly) &&
  /Math\.floor\(dmg\/CH_REWARD_DIV\.def\)/.test(codeOnly) &&
  /Math\.floor\(dmg\/CH_REWARD_DIV\.hp\)\*CH_REWARD_DIV\.hpStep/.test(codeOnly));
assert('不再出现旧的 baseDur=8+Math.floor(Math.random()*5)',
  !/baseDur=8\+Math\.floor\(Math\.random\(\)\*5\)/.test(codeOnly));
assert('不再出现旧的 timeBonus 硬编码 8+4*',
  !/baseDur=8\+4\*/.test(codeOnly));

console.log('\n[5.1] 文案与常量同源（防止两处各写一个数）');
assert('挑战预览的「倒计时 X-Y 秒」由常量拼接',
  /倒计时 '\+CH_DUR_MIN\+'-'\+CH_DUR_MAX\+' 秒/.test(SRC));
assert('预览文案不再写死 8-12',
  !/倒计时 8-12 秒/.test(SRC));

/* ================================================================
   ⑥ 热血 buff 三项的定义未被误伤
   ================================================================ */
console.log('\n[6] 热血 buff 其余两项未被误伤');
assert('critRate 档仍为 暴击率 0.75 / 暴伤 1.85',
  /if\(hotBuff==='critRate'\)\{critRate=0\.75;critDmg=1\.85\}/.test(codeOnly));
assert('critDmg 档仍为 暴击率 0.35 / 暴伤 2.7',
  /if\(hotBuff==='critDmg'\)\{critRate=0\.35;critDmg=2\.7\}/.test(codeOnly));
assert('基础暴击仍为 20% / ×1.5', /var critRate=0\.20/.test(codeOnly) && /var critDmg=1\.5/.test(codeOnly));
assert('三项 buff 仍由 pickHotBuff 三选一',
  /var buffs=\['critRate','critDmg','timeBonus'\]/.test(codeOnly));

console.log('\n============================');
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);

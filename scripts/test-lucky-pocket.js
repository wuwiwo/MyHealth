#!/usr/bin/env node
/* v2.3.x 测试：幸运口袋（小负鼠 petOnly 天赋，doc/2.2-修改提案.md §3.1 + §3.11C 裁决）
   口径（已裁决「区间内均匀随机」）：
     · 三类材料**各自独立判定**（不是命中一类就结束）
     · 概率与数量都在 §3.1 区间内**均匀随机**取值：
         营养液 nutrition  10%~20% → 0~2 个
         宠物饲料 feed     20%~30% → 0~4 个
         宠物灵能 spirit    5%~10% → 0~5 个
     · 多个携带者**不叠加**（只判一轮）
     · 随机数走战斗 rng（gb.rng / 兜底 battleRnd），**不用 Math.random()**

   覆盖：
     [1] 区间表口径
     [2] 纯函数 luckyPocketDrops：概率/数量区间、独立性、不触碰 Math.random
     [3] 消费端 groupVictoryReward：端到端、多携带者不叠加、随机源 = gb.rng
     [4] 源码守卫（防回退成旧的 35% 单判定）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* groupVictoryReward 的**基础掉落**仍走 Math.random（本次未改，见报告「风险点」），
   钉死为 0.5 使其确定 → 「只有 🍀 幸运行随 gb.rng 变化」才可断言，
   也就顺带证明了幸运口袋里没有 Math.random。 */
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };

const sandbox = { Math: deterministicMath, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
/* 加载顺序照抄 page/index.html（关键：game-render.js:312 **先于** pet-codex.js:320 加载 ——
   消费端靠运行时全局查 luckyPocketDrops()，不依赖加载顺序；这里如实复现该顺序） */
['utils.js', 'date-roll.js', 'levels.js', 'state-core.js', 'status-defs.js', 'unit.js', 'talent.js',
 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js', 'game-render.js',
 'pets.js', 'pet-materials.js', 'pet-codex.js'].forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
/* 顺序 rng；越界时置 overflow 并复用末值（调用次数不符就是被测实现改了口径） */
function seqRng(arr) {
  let i = 0;
  const fn = function () {
    if (i >= arr.length) { fn.overflow = true; return arr[arr.length - 1]; }
    return arr[i++];
  };
  fn.overflow = false;
  return fn;
}

/* ---- 1. 区间表口径（§3.1 原文数值） ---- */
console.log('\n[1] 区间表口径（§3.1）');
const T = sandbox.LUCKY_POCKET_TABLE;
assert('区间表存在且为 3 类', Array.isArray(T) && T.length === 3, JSON.stringify(T));
if (Array.isArray(T) && T.length === 3) {
  const byType = {};
  T.forEach(k => { byType[k.type] = k; });
  assert('三类 = 营养液/饲料/灵能', !!byType.nutrition && !!byType.feed && !!byType.spirit, Object.keys(byType).join(','));
  assert('营养液 nutrition 概率 10%~20% → 0~2 个',
    byType.nutrition.pMin === 0.10 && byType.nutrition.pMax === 0.20 && byType.nutrition.nMax === 2, JSON.stringify(byType.nutrition));
  assert('宠物饲料 feed 概率 20%~30% → 0~4 个',
    byType.feed.pMin === 0.20 && byType.feed.pMax === 0.30 && byType.feed.nMax === 4, JSON.stringify(byType.feed));
  assert('宠物灵能 spirit 概率 5%~10% → 0~5 个',
    byType.spirit.pMin === 0.05 && byType.spirit.pMax === 0.10 && byType.spirit.nMax === 5, JSON.stringify(byType.spirit));
}

const L = rnd => sandbox.luckyPocketDrops(rnd);
const show = arr => arr.map(d => d.type + '×' + d.n).join(',');
/* 循环 rng：每类固定消耗「掷概率 → 掷命中 → 掷数量」 */
function cycRng(arr) { let i = 0; return function () { return arr[i++ % arr.length]; }; }
/* 三类都命中且数量取上界：概率掷 0（p=下限）→ 命中掷 0（0 < p）→ 数量掷 0.999 */
const MAX_ALL = () => cycRng([0, 0, 0.999]);

/* ---- 2. 纯函数 luckyPocketDrops ---- */
console.log('\n[2] 纯函数 luckyPocketDrops');
assert('已注册为全局函数', typeof sandbox.luckyPocketDrops === 'function');

// 三类**都**命中且数量取上界 → 三类独立判定（不是命中一类就结束）
const all = L(MAX_ALL());
assert('三类全部产出（各自独立判定，不是命中一类就结束）',
  all.length === 3 && show(all) === 'nutrition×2,feed×4,spirit×5', show(all));
assert('产出的掉落都带 lucky 标记（结算走 🍀 前缀）', all.length === 3 && all.every(d => d.lucky === true));

// 数量下界 0：三类都命中但数量掷到 0 → 不产出
const none = L(() => 0);
assert('数量掷到 0 → 无产出（数量区间含 0）', none.length === 0, show(none));

// 只让 feed 命中 → 其余两类不产出（独立性的反向：不误产）
const onlyFeed = seqRng([0, 0.5, /* feed */ 0, 0, 0.4, /* spirit */ 0, 0.5]);
const ofRes = L(onlyFeed);
assert('只有饲料命中 → 仅 feed×2（其余两类各自判定为不命中）',
  ofRes.length === 1 && show(ofRes) === 'feed×2', show(ofRes));
assert('「只命中一类」时 rng 调用次数正确（≤3×3，无多掷）', onlyFeed.overflow === false);

// 只让 spirit 命中 → 证明第三条也会被独立判到
const onlySpirit = seqRng([0, 0.5, /* feed */ 0, 0.5, /* spirit */ 0, 0, 0.9]);
const osRes = L(onlySpirit);
assert('只有灵能命中 → 仅 spirit×5（第三条独立判定，不会被前两类短路）',
  osRes.length === 1 && show(osRes) === 'spirit×5', show(osRes));

// 概率**是区间内随机取值**，不是固定取下限/上限
//   营养液 pMin=.10 pMax=.20；令 rnd=0.5 → p = 0.15
//   · 判定值 0.14 < 0.15 → 命中  ⇒ p > 0.14 ⇒ 排除「固定取下限 10%」
//   · 判定值 0.18 ≥ 0.15 → 不中  ⇒ p ≤ 0.18 ⇒ 排除「固定取上限 20%」
const pLow = seqRng([0.5, 0.14, 0.5, /* feed */ 0.5, 0.5, /* spirit */ 0.5, 0.5]);
const pLowRes = L(pLow);
assert('概率区间内随机：rnd=0.5 → p=0.15，判定 0.14 命中（排除「固定拿下限 10%」）',
  pLowRes.length === 1 && show(pLowRes) === 'nutrition×1', show(pLowRes));
const pHigh = seqRng([0.5, 0.18, 0.5, /* feed */ 0.5, 0.5, /* spirit */ 0.5, 0.5]);
const pHighRes = L(pHigh);
assert('概率区间内随机：判定 0.18 ≥ 0.15 不命中（排除「固定取上限 20%」）',
  pHighRes.length === 0, show(pHighRes));

// 注入 rnd 时绝不触碰 Math.random
const origRandom = sandbox.Math.random;
sandbox.Math.random = function () { throw new Error('luckyPocketDrops 不应调用 Math.random'); };
let mrOk = true, mrRes = null;
try { mrRes = sandbox.luckyPocketDrops(MAX_ALL()); }
catch (e) { mrOk = false; }
sandbox.Math.random = origRandom;
assert('注入 rnd 时不触碰 Math.random（确定性回放前提）', mrOk && mrRes && mrRes.length === 3,
  'ok=' + mrOk + ' n=' + (mrRes ? mrRes.length : 'null'));

/* ---- 3. 消费端 groupVictoryReward（唯一消费端） ---- */
console.log('\n[3] 消费端 groupVictoryReward');
let granted = {};
sandbox.grantMaterial = function (type, n) { granted[type] = (granted[type] || 0) + n; };
sandbox.getMaterialName = function (type) { return type; };
sandbox.recordSkillWin = function () { return 0; };
sandbox.awardSkillPoints = function () { return { gained: 4 }; };

function luckyLines(msg) {
  return String(msg).split(' · ').filter(s => s.indexOf('🍀') >= 0).map(s => s.replace(/^\s*🍀\s*/, ''));
}
function runReward(rngFn, carrierCount) {
  granted = {};
  const allies = [];
  for (let i = 0; i < carrierCount; i++) allies.push({ id: 'carrier' + i, name: '小负鼠' + i, _talents: ['lucky_pocket'] });
  allies.push({ id: 'plain', name: '非携带者', _talents: ['dark_eye'] });   // 对照：不带天赋
  const gb = { allies: allies, enemies: [{}, {}], rng: rngFn };
  const r = sandbox.groupVictoryReward(gb);
  return { msg: r.msg, granted: Object.assign({}, granted), lines: luckyLines(r.msg) };
}

// 一段确定的 rng 序列（每类「掷概率→掷命中→掷数量」），保证三类都产出且数量各异：
//   营养液 p=.13 命中 数量2 / 饲料 p=.29 命中 数量2 / 灵能 p=.075 命中 数量1
const RICH_SEQ = [0.3, 0, 0.7, 0.9, 0, 0.5, 0.5, 0.05, 0.3];
const richRng = () => seqRng(RICH_SEQ.slice());
const RICH_EXPECT = 'nutrition +2 | feed +2 | spirit +1';

// 无携带者 → 不产出幸运行
const noCarrier = runReward(MAX_ALL(), 0);
assert('队伍无携带者 → 无 🍀 掉落', noCarrier.lines.length === 0, noCarrier.lines.join(','));

// 三类各一笔（数量取上界）
const full = runReward(MAX_ALL(), 1);
assert('携带者 1 名 → 🍀 三类各一笔，数量取上界',
  full.lines.join(' | ') === 'nutrition +2 | feed +4 | spirit +5', full.lines.join(' | '));
assert('掉落真的发到材料袋（相对「无天赋」基线 +2/+4/+5）', (function () {
  return ['nutrition', 'feed', 'spirit'].every(t =>
    (full.granted[t] || 0) - (noCarrier.granted[t] || 0) === ({ nutrition: 2, feed: 4, spirit: 5 })[t]);
})(), JSON.stringify({ full: full.granted, noCarrier: noCarrier.granted }));

// 数量掷到 0 → 无幸运行
const lowEnd = runReward(cycRng([0]), 1);
assert('携带者 1 名 + 数量掷到 0 → 无 🍀 掉落', lowEnd.lines.length === 0, lowEnd.lines.join(','));

// 多携带者不叠加：1 名 vs 3 名，同一 rng 下幸运行必须**逐字一致**
const oneCarrier = runReward(richRng(), 1);
const threeCarrier = runReward(richRng(), 3);
assert('对照组 rng 确实产出了幸运行（前置）', oneCarrier.lines.join(' | ') === RICH_EXPECT, oneCarrier.lines.join(' | '));
assert('多携带者**不叠加**：3 名携带者与 1 名的 🍀 掉落逐字一致',
  threeCarrier.lines.join(' | ') === oneCarrier.lines.join(' | '),
  '1名=[' + oneCarrier.lines.join(' | ') + '] 3名=[' + threeCarrier.lines.join(' | ') + ']');

// 同种子 → 可复现（战斗 rng 通道支持确定性回放）
const s1 = runReward(sandbox.makeSeededRng(20260930), 1);
const s2 = runReward(sandbox.makeSeededRng(20260930), 1);
assert('同种子 rng → 幸运掉落可复现（确定性回放）',
  s1.lines.join(' | ') === s2.lines.join(' | '), s1.lines.join(' | ') + ' vs ' + s2.lines.join(' | '));

// 随机源 = gb.rng（不是 Math.random）：换 rng 只影响 🍀 行，非 🍀 行（基础掉落）保持不变
const a = runReward(richRng(), 1);
const b = runReward(cycRng([0]), 1);
const baseOf = msg => msg.split(' · ').filter(s => s.indexOf('🍀') < 0).join(' | ');
assert('随机源 = gb.rng：换 rng 后 🍀 行变化', a.lines.join(',') !== b.lines.join(','), a.lines.join(',') + ' vs ' + b.lines.join(','));
assert('随机源 = gb.rng：换 rng 后基础掉落（非 🍀 行）完全不变',
  baseOf(a.msg) === baseOf(b.msg), baseOf(a.msg) + ' vs ' + baseOf(b.msg));

// gb 无 rng → 走 battleRnd 兜底，不抛错
let fallbackOk = true, fallbackMsg = '';
try { fallbackMsg = sandbox.groupVictoryReward({ allies: [{ id: 'c', _talents: ['lucky_pocket'] }], enemies: [{}] }).msg; }
catch (e) { fallbackOk = false; fallbackMsg = e.message; }
assert('gb 无 rng → 兜底 battleRnd，不抛错', fallbackOk && typeof fallbackMsg === 'string', fallbackMsg);

/* ---- 4. 源码守卫（防回退成旧的「35% 单判定 ×2 个」） ---- */
console.log('\n[4] 源码守卫');
const grSrc = load('game-render.js');
const pcSrc = load('pet-codex.js');
assert('game-render.js 消费 luckyPocketDrops()', grSrc.indexOf('luckyPocketDrops(') >= 0);
assert('game-render.js 传本场战斗 rng（gb.rng）', grSrc.indexOf("(gb && typeof gb.rng === 'function')") >= 0);
assert('game-render.js 已删除旧的 35% 单判定', grSrc.indexOf('0.35') < 0 && grSrc.indexOf('bonusPool') < 0);
assert('pet-codex.js 定义 luckyPocketDrops 与区间表',
  pcSrc.indexOf('function luckyPocketDrops') >= 0 && pcSrc.indexOf('LUCKY_POCKET_TABLE') >= 0);
assert('pet-codex.js 欠账注释已收口（不再写「现状仍是单一 35%」）',
  pcSrc.indexOf('现状仍是') < 0 && pcSrc.indexOf('欠账已收口') >= 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
/* v2.2 WP-H 子批测试：
   ① WP-H4 挑战页「每月最高记录」—— 按月分桶归档 + 跨月重置/归档 + 幂等
   ② WP-H8 掉落产出倍率 —— 宝珠碎片 ×3 / 炼化石 ×2 / 灵能 ×2（唯一可调常量）
   文档来源：doc/2.2 修改-补充.md
     「挑战页面 - 增加每个月最高记录查看」
     「提升宝珠碎片的掉落数量（变为3倍）/ 提升炼化石产出（变为2倍）/ 提升灵能产出（变为2倍）」
   Run: node scripts/test-challenge-monthly.js */
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

/* 与 test-challenge-borrow.js 同款的 headless 沙箱 */
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

/* ================================================================
   ① WP-H8：掉落产出倍率
   ================================================================ */
console.log('\n[1] WP-H8 掉落产出倍率（唯一可调常量）');
const sb = makeSandbox({});

assert('DROP_MULT 宝珠碎片 ×3', sb.DROP_MULT.orbShard === 3, String(sb.DROP_MULT.orbShard));
assert('DROP_MULT 炼化石 ×2（普通 + 高级）', sb.DROP_MULT.refineNormal === 2 && sb.DROP_MULT.refineHigh === 2,
  JSON.stringify(sb.DROP_MULT));
assert('DROP_MULT 灵能 ×2', sb.DROP_MULT.spirit === 2, String(sb.DROP_MULT.spirit));
assert('倍率表只含这三类（其余材料不受影响）',
  Object.keys(sb.DROP_MULT).length === 4 && sb.dropMultFor('nutrition') === 1 && sb.dropMultFor('feed') === 1,
  JSON.stringify(sb.DROP_MULT));

// 单条倍率
assert('applyDropMult 碎片 4 → 12', sb.applyDropMult('orbShard', 4) === 12, String(sb.applyDropMult('orbShard', 4)));
assert('applyDropMult 普通炼化石 2 → 4', sb.applyDropMult('refineNormal', 2) === 4);
assert('applyDropMult 高级炼化石 1 → 2', sb.applyDropMult('refineHigh', 1) === 2);
assert('applyDropMult 灵能 3 → 6', sb.applyDropMult('spirit', 3) === 6);
assert('applyDropMult 营养液不变（×1）', sb.applyDropMult('nutrition', 5) === 5);
assert('applyDropMult 0 → 0', sb.applyDropMult('orbShard', 0) === 0);
assert('applyDropMult 非数字 → 0（不产生 NaN）', sb.applyDropMult('orbShard', undefined) === 0 && sb.applyDropMult('spirit', NaN) === 0);

// 批量（纯函数：不改入参）
const rawDrops = [
  { type: 'nutrition', n: 5 },
  { type: 'feed', n: 3 },
  { type: 'refineNormal', n: 3 },
  { type: 'refineHigh', n: 1 },
  { type: 'spirit', n: 2 },
  { type: 'orbShard', n: 5 }
];
const multed = sb.applyDropMults(rawDrops);
assert('applyDropMults：不修改入参数组', rawDrops[5].n === 5 && rawDrops[2].n === 3, JSON.stringify(rawDrops));
assert('applyDropMults：碎片 ×3 / 炼化石 ×2 / 灵能 ×2，其余原样',
  multed[5].n === 15 && multed[2].n === 6 && multed[3].n === 2 && multed[4].n === 4 &&
  multed[0].n === 5 && multed[1].n === 3, JSON.stringify(multed.map(d => d.type + ':' + d.n)));
assert('applyDropMults：保留 lucky 标记（幸运口袋掉落）',
  sb.applyDropMults([{ type: 'spirit', n: 2, lucky: true }])[0].lucky === true);

// 接线守卫：倍率常量唯一、掉落点统一走 applyDropMults
const challengeSrc = load('challenge.js');
const defCount = (challengeSrc.match(/var DROP_MULT\s*=/g) || []).length;
assert('倍率常量只在 challenge.js 定义一次（不散落硬编码）', defCount === 1, 'defCount=' + defCount);
assert('挑战掉落统一经 applyDropMults() 套倍率', challengeSrc.indexOf('matDrops = applyDropMults(matDrops)') >= 0);
assert('掉落倍率在发放前套用（grantMaterial 之前）',
  challengeSrc.indexOf('matDrops = applyDropMults(matDrops)') < challengeSrc.indexOf('matDrops.forEach(function (dd) { grantMaterial(dd.type, dd.n) })'));

/* ================================================================
   ② WP-H4：每月记录
   ================================================================ */
console.log('\n[2] WP-H4 每月记录（口径 + 归档）');
sb.today = () => '2026-09-15';
assert('chMonthOf 日期串 → 月键', sb.chMonthOf('2026-03-09') === '2026-03');
assert('chMonthOf Date → 月键', sb.chMonthOf(new Date(2026, 2, 9)) === '2026-03');
assert('chMonthOf 不传 → 今天所在月', sb.chMonthOf() === '2026-09');

let c = sb.getChallenge();
assert('旧存档读取：monthly / monthlyKey 字段已归一化',
  c.monthly && typeof c.monthly === 'object' && !Array.isArray(c.monthly) && c.monthlyKey === '', JSON.stringify({ m: c.monthly, k: c.monthlyKey }));

sb.recordChallengeMonth(c, { date: '2026-09-15', dmg: 1000, atk: 10, def: 5, hp: 30 });
sb.recordChallengeMonth(c, { date: '2026-09-20', dmg: 3000, atk: 20, def: 8, hp: 60 });
sb.recordChallengeMonth(c, { date: '2026-09-28', dmg: 500, atk: 2, def: 1, hp: 6 });
sb.saveChallenge(c);

c = sb.getChallenge();
const sep = c.monthly['2026-09'];
assert('本月桶：通关次数累计', sep.count === 3, 'count=' + sep.count);
assert('本月桶：累计伤害', sep.totalDmg === 4500, 'totalDmg=' + sep.totalDmg);
assert('本月桶：单次最高伤害 + 日期', sep.bestDmg === 3000 && sep.bestDate === '2026-09-20',
  sep.bestDmg + '@' + sep.bestDate);
assert('本月桶：属性奖励合计（累计）', sep.atk === 32 && sep.def === 14 && sep.hp === 96,
  JSON.stringify({ atk: sep.atk, def: sep.def, hp: sep.hp }));
assert('本月桶：最高那一场的奖励单独留存', sep.bestAtk === 20 && sep.bestDef === 8 && sep.bestHp === 60,
  JSON.stringify({ a: sep.bestAtk, d: sep.bestDef, h: sep.bestHp }));
assert('本月桶：首末日期', sep.firstDate === '2026-09-15' && sep.lastDate === '2026-09-28',
  sep.firstDate + '~' + sep.lastDate);
assert('本月桶：monthlyKey = 当前月', c.monthlyKey === '2026-09', c.monthlyKey);

assert('currentChallengeMonth() 返回本月桶', sb.currentChallengeMonth().count === 3);

/* ================================================================
   ③ 跨月：重置（新月从 0 开始）+ 归档（旧月保留）
   ================================================================ */
console.log('\n[3] 跨月归档 / 重置');
sb.today = () => '2026-10-01';
const roll = sb.challengeMonthlyRollover();
assert('跨月：rolled=true 且月键推进', roll.rolled === true && roll.monthKey === '2026-10' && roll.prevMonthKey === '2026-09',
  JSON.stringify(roll));
assert('跨月：旧月桶原样归档（未清零）',
  sb.listChallengeMonthly().length === 1 && sb.listChallengeMonthly()[0].month === '2026-09',
  JSON.stringify(sb.listChallengeMonthly().map(m => m.month)));
assert('跨月：新月暂无桶 → 本月显示为空骨架（0 次）',
  sb.currentChallengeMonth().month === '2026-10' && sb.currentChallengeMonth().count === 0,
  JSON.stringify(sb.currentChallengeMonth()));

// 同月内重复调用：幂等（不重复计入、不清旧月）
const roll2 = sb.challengeMonthlyRollover();
assert('跨月幂等：同月第二次 rolled=false', roll2.rolled === false && roll2.monthKey === '2026-10', JSON.stringify(roll2));
assert('跨月幂等：旧月数据仍在', sb.listChallengeMonthly().length === 1 && sb.listChallengeMonthly()[0].count === 3);

// 10 月玩一把 → 两个桶并存，新的在前
c = sb.getChallenge();
sb.recordChallengeMonth(c, { date: '2026-10-01', dmg: 700, atk: 1, def: 1, hp: 3 });
sb.saveChallenge(c);
const list = sb.listChallengeMonthly();
assert('归档：10 月在前、9 月保留', list.length === 2 && list[0].month === '2026-10' && list[1].month === '2026-09',
  JSON.stringify(list.map(m => m.month)));
assert('归档：9 月桶数据未被重置', list[1].count === 3 && list[1].bestDmg === 3000 && list[1].totalDmg === 4500);
assert('本月桶：10 月只含 10 月那一次', list[0].count === 1 && list[0].bestDmg === 700);

/* ================================================================
   ④ 旧存档回填（一次性 + 幂等）
   ================================================================ */
console.log('\n[4] 旧存档 history 回填');
const sb2 = makeSandbox({
  history: [
    { date: '2026-07-02', dmg: 100, atk: 1, def: 1, hp: 3 },
    { date: '2026-07-05', dmg: 400, atk: 2, def: 2, hp: 6 },
    { date: '2026-08-01', dmg: 50, atk: 0, def: 0, hp: 0 }
  ]
});
sb2.today = () => '2026-09-10';
const c2 = sb2.getChallenge();
sb2.ensureChallengeMonthly(c2);
assert('回填：7 月桶', c2.monthly['2026-07'] && c2.monthly['2026-07'].count === 2 && c2.monthly['2026-07'].bestDmg === 400 &&
  c2.monthly['2026-07'].totalDmg === 500 && c2.monthly['2026-07'].atk === 3, JSON.stringify(c2.monthly['2026-07']));
assert('回填：8 月桶', c2.monthly['2026-08'] && c2.monthly['2026-08'].count === 1, JSON.stringify(c2.monthly['2026-08']));
assert('回填：monthlyKey = 当前月', c2.monthlyKey === '2026-09', c2.monthlyKey);
sb2.ensureChallengeMonthly(c2);
sb2.ensureChallengeMonthly(c2);
assert('回填幂等：重复调用不重复计入', c2.monthly['2026-07'].count === 2 && c2.monthly['2026-08'].count === 1,
  JSON.stringify({ j: c2.monthly['2026-07'].count, a: c2.monthly['2026-08'].count }));

// 接线守卫：endChallenge 里回填必须早于 push（否则新成绩会被回填 + 合并各计一次）
assert('endChallenge 顺序守卫：ensureChallengeMonthly 在 history.push 之前',
  0 <= challengeSrc.indexOf('ensureChallengeMonthly(c)') &&
  challengeSrc.indexOf('ensureChallengeMonthly(c)') < challengeSrc.indexOf('c.history.push(_rec)'));
assert('endChallenge：结算后调用 recordChallengeMonth 归档', challengeSrc.indexOf('recordChallengeMonth(c,_rec)') >= 0);

/* ================================================================
   ⑤ 月重置入口接线（H9：技能重置挂在唯一月度触发点）
   ================================================================ */
console.log('\n[5] 月重置入口接线');
assert('resetChallengeSeason 内调用月度重置（app.js 唯一月度触发点）',
  /resetChallengeSeason[\s\S]*?monthlyResetSkillState\(\)/.test(challengeSrc));
const skillStoreSrc = load('skill-store.js');
assert('技能月重置：月度键幂等守卫存在', skillStoreSrc.indexOf("if (d.monthlyKey === cur) return") >= 0);
assert('技能月重置：未用点数清零', /d\.points = 0;/.test(skillStoreSrc));
assert('技能月重置：调用等级减半', skillStoreSrc.indexOf('monthlyResetSkills(d)') >= 0);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

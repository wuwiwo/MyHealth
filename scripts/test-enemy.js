#!/usr/bin/env node
/* M2b-1 测试：talent.js + enemy.js
   1) 14 天赋全部注册（词条已移到 affix.js）
   2) 天赋静态修正（强健）
   3) 天赋 hook 触发（振翅/懒惰/嗜血/再生）
   4) 敌人编成阶梯（tier → 天赋/技能数量）
   5) Boss 1-4 天赋
   6) 单元 tags
   7) v2.2.16（§5.4E）/ v2.3.0（作者裁决）：兜底抽取按 tier 剔除 lazy / slowstart ——
      **只剔 Boss**（精英 / 普通怪恢复可抽），且带负面特性时属性按补偿常量抬高
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
// v2.1.27：战斗随机统一走 battleRnd()，它定义在 utils.js（index.html 中最早加载）——
//          沙箱只挑部分文件时必须显式先加载，否则 ReferenceError: battleRnd is not defined。
// v2.1.25：词条（affix.js）从天赋（talent.js）里拆出，是两个独立维度，需分别加载。
// enemy.js 装配默认词条时会调用 pickExtraAffixes()（定义在 group-levels.js），
// 该函数在线上由 index.html 后加载、调用发生在运行时，沙箱里也要显式带上。
const files = ['utils.js', 'unit.js', 'talent.js', 'affix.js', 'group-levels.js', 'enemy.js'];

const sandbox = { Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 16 天赋注册 ----
const talentIds = sandbox.listTalentIds ? sandbox.listTalentIds() : Object.keys(sandbox.TALENTS);
const expected = ['blade','flutter','roughskin','vigor','magicmirror','plain','intimidate','magicshield','slowstart','lazy','multitarget','bloodthirst','vengeance','regen'];
expected.forEach(id => assert('天赋注册: ' + id, sandbox.getTalent(id) !== null));

// ---- 2. 强健静态修正 ----
const strong = sandbox.createEnemyUnit({ tier: 'elite1', talents: ['vigor'], base: { hp: 100, atk: 20, def: 10, spd: 5 } });
assert('强健: 攻击 +15%', strong.base.atk === 23, 'atk=' + strong.base.atk);
assert('强健: 防御 +15%', strong.base.def === 11, 'def=' + strong.base.def);

// ---- 3. 天赋 hook 触发 ----
// 振翅：回合结束加速
const flut = sandbox.createEnemyUnit({ talents: ['flutter'], base: { hp: 100, atk: 5, def: 3, spd: 20 } });
const spdBefore = flut.base.spd;
sandbox.talentDispatch(flut, 'onTurnEnd', { turn: 1 });
assert('振翅: 回合结束速度增加', flut.base.spd > spdBefore, spdBefore + '→' + flut.base.spd);

// 懒惰：25% 跳过（多次调用应出现跳过）
const lazy = sandbox.createEnemyUnit({ talents: ['lazy'], base: { hp: 100, atk: 5, def: 3 } });
let lazySkipped = false;
for (let i = 0; i < 40; i++) {
  const r = sandbox.talentDispatch(lazy, 'onBeforeAction', { turn: i + 1 });
  if (r.skipAction) { lazySkipped = true; break; }
}
assert('懒惰: 有跳过回合', lazySkipped);

// 嗜血：造成伤害恢复（WP-F 接成长：区间 10%~35%，等级 1 = 下限 10%）
const bt = sandbox.createEnemyUnit({ talents: ['bloodthirst'], level: 1, base: { hp: 100, atk: 10, def: 5 } });
bt.hp = 50;
sandbox.talentDispatch(bt, 'onAfterDamage', { dealt: 20 });
assert('嗜血: 恢复伤害的 10%（等级 1 = 区间下限；>0 表示真的回了血）', bt.hp === 52, 'hp=' + bt.hp);
const bt10 = sandbox.createEnemyUnit({ talents: ['bloodthirst'], level: 10, base: { hp: 100, atk: 10, def: 5 } });
bt10.hp = 50;
sandbox.talentDispatch(bt10, 'onAfterDamage', { dealt: 20 });
assert('嗜血: 等级 10 → 恢复 35%（= 区间上限）', bt10.hp === 57, 'hp=' + bt10.hp);

/* 再生：WP-F 接成长（周期 2~3 回合、回复 3%~8%）
   改前是固定「每 3 回合回 8%」；现在两项都按大关号在区间内取值：
   Lv1 = 每 2 回合 / 3%、Lv10 = 每 3 回合 / 8%。 */
const reg = sandbox.createEnemyUnit({ talents: ['regen'], level: 1, base: { hp: 100, atk: 5, def: 3 } });
reg.hp = 60;
sandbox.talentDispatch(reg, 'onTurnEnd', { turn: 2 });
assert('再生(等级1): 周期 2 回合 → 第 2 回合回 3%（60→63）', reg.hp === 63, 'hp=' + reg.hp);
sandbox.talentDispatch(reg, 'onTurnEnd', { turn: 3 });
assert('再生(等级1): 第 3 回合不触发（周期 2，奇数回合不恢复）', reg.hp === 63, 'hp=' + reg.hp);
const reg10 = sandbox.createEnemyUnit({ talents: ['regen'], level: 10, base: { hp: 100, atk: 5, def: 3 } });
reg10.hp = 60;
sandbox.talentDispatch(reg10, 'onTurnEnd', { turn: 2 });
assert('再生(等级10): 周期 3 回合 → 第 2 回合不触发', reg10.hp === 60, 'hp=' + reg10.hp);
sandbox.talentDispatch(reg10, 'onTurnEnd', { turn: 3 });
assert('再生(等级10): 第 3 回合回 8%（60→68，= 区间上限）', reg10.hp === 68, 'hp=' + reg10.hp);

// ---- 4. 敌人编成阶梯 ----
const minion = sandbox.createEnemyUnit({ tier: 'minion', base: { hp: 50, atk: 5, def: 2 } });
assert('杂兵: 0天赋', sandbox.enemyTalentCount(minion) === 0, 'talents=' + sandbox.enemyTalentCount(minion));

const e1 = sandbox.createEnemyUnit({ tier: 'elite1', base: { hp: 80, atk: 8, def: 4 } });
assert('精英1: 1天赋', sandbox.enemyTalentCount(e1) === 1, 'talents=' + sandbox.enemyTalentCount(e1));

const e2 = sandbox.createEnemyUnit({ tier: 'elite2', base: { hp: 100, atk: 10, def: 5 } });
assert('精英2: 2天赋', sandbox.enemyTalentCount(e2) === 2, 'talents=' + sandbox.enemyTalentCount(e2));

// ---- 5. Boss 1-4 天赋 ----
const boss = sandbox.createEnemyUnit({ tier: 'boss', base: { hp: 500, atk: 30, def: 20 } });
const btCount = sandbox.enemyTalentCount(boss);
assert('Boss: 1-4 天赋', btCount >= 1 && btCount <= 4, 'talents=' + btCount);

// 显式指定 Boss 4 天赋
const boss4 = sandbox.createEnemyUnit({ tier: 'boss', talents: ['blade','vigor','bloodthirst','regen'], base: { hp: 500, atk: 30, def: 20 } });
assert('Boss: 显式4天赋', sandbox.enemyTalentCount(boss4) === 4, 'talents=' + sandbox.enemyTalentCount(boss4));

/* ---- 5b. 天赋兜底抽取的 tier 规则（v2.2.16 固化 / v2.3.0 作者裁决）----
   敌群关卡（group-levels.js）现在**固化**了天赋，走 `talents` 显式分支、不进兜底；
   兜底路径（单敌战 / 工具 / 测试）同样遵守同一口径：
     · **Boss** 不抽 lazy / slowstart（评审原文「boss不会获得」）；
     · **精英 / 普通怪**（v2.3.0 作者裁决「保留，给精英怪/普通怪」）**恢复可抽**这两条。
   标记来源 = talent.js 天赋定义上的 `weak: true`（不是各文件再抄一份 id 清单）。 */
const WEAK_T = ['lazy', 'slowstart'];
assert('弱化天赋标记：lazy / slowstart = weak，其余天赋不标',
  WEAK_T.every(id => sandbox.isWeakTalent(id)) &&
  Object.keys(sandbox.TALENTS).filter(id => sandbox.isWeakTalent(id)).length === WEAK_T.length,
  Object.keys(sandbox.TALENTS).filter(id => sandbox.isWeakTalent(id)).join(','));
function weakHits(n, tier) {
  let hit = null;
  for (let i = 0; i < 200 && !hit; i++) {
    sandbox.pickRandomTalents(n, tier).forEach(id => { if (WEAK_T.indexOf(id) > -1) hit = id; });
  }
  return hit;
}
assert('兜底抽取(tier=boss) 200 轮不抽到 lazy / slowstart', weakHits(6, 'boss') === null, String(weakHits(6, 'boss')));
assert('兜底抽取(tier=elite1) **仍可能**抽到 lazy / slowstart（v2.3.0 恢复出场）', weakHits(6, 'elite1') !== null);
assert('兜底抽取(tier=minion) 仍可能抽到 lazy / slowstart（未从注册表删除）', weakHits(6, 'minion') !== null);
assert('createEnemyUnit 兜底（tier=boss，不传 talents）装配结果不含 lazy / slowstart', (function () {
  for (let i = 0; i < 200; i++) {
    const u = sandbox.createEnemyUnit({ tier: 'boss', base: { hp: 500, atk: 30, def: 20 } });
    if (u._talents.some(id => WEAK_T.indexOf(id) > -1)) return false;
  }
  return true;
})());
/* v2.3.0：负面特性补偿在**兜底路径**同样生效（口径与 group-levels 的 genEnemyCfg 一致）——
   兜底抽取（不传 talents）里如果抽到 lazy / slowstart，属性必须按补偿常量抬高、速度不变。
   用固定种子遍历，找到第一个抽到负面特性的单位来断言（避免 flaky）。 */
(function () {
  const bonus = sandbox.WEAK_TALENT_STAT_BONUS;
  const raw = { hp: 100, atk: 20, def: 10, spd: 7 };
  let checked = null;
  for (let seed = 1; seed <= 200 && !checked; seed++) {
    sandbox.setBattleRng(sandbox.makeSeededRng(seed));
    const u = sandbox.createEnemyUnit({ id: 'wc' + seed, tier: 'elite1', base: { hp: raw.hp, atk: raw.atk, def: raw.def, spd: raw.spd } });
    if (u._talents.some(id => WEAK_T.indexOf(id) > -1)) {
      checked = {
        seed: seed, talents: u._talents.slice(),
        expect: sandbox.weakTalentStatMul(u._talents),
        base: { hp: u.base.hp, atk: u.base.atk, def: u.base.def, spd: u.base.spd }, hp: u.hp
      };
    }
  }
  sandbox.setBattleRng(null);
  assert('兜底路径的负面特性补偿：属性 ×(1+' + bonus + '×负面个数)、速度不变【' +
    (checked ? 'seed=' + checked.seed + ' ' + checked.talents.join('+') : '未找到样本') + '】',
    !!checked &&
    checked.base.atk === Math.max(1, Math.floor(raw.atk * checked.expect)) &&
    checked.base.def === Math.max(1, Math.floor(raw.def * checked.expect)) &&
    checked.base.hp === Math.max(1, Math.floor(raw.hp * checked.expect)) &&
    checked.base.spd === raw.spd && checked.hp === checked.base.hp,
    JSON.stringify(checked));
})();

// ---- 6. 单元 tags ----
assert('敌人 tags 含 tier', boss.tags.includes('boss'));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

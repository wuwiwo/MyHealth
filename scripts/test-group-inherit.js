#!/usr/bin/env node
/* v2.1.10 测试：敌群独立属性空间
   1) 玩家按比例继承属性（GROUP_INHERIT）
   2) 宠物按稀有度放大到与玩家同量级（PET_GROUP_SCALE）
   3) 敌人配置按关卡 id 确定性生成（不再每次刷新重摇）
   4) Boss / 精英只用「高级」天赋 / 技能池
   5) 固定曲线抬高后，后续关卡属性继续递增
   6) 魂攻 / 魂防接入敌群战斗（此前 battle-group.js 零引用）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'affix.js', 'skill.js', 'enemy.js',
  'terrain.js', 'battle.js', 'group-levels.js', 'battle-group.js'];   // terrain 必须在 group-levels 之前

function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math);   // 必须继承，Object.assign 会丢掉 min/floor
  M.random = rnd;
  const sb = { Math: M, JSON, console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  files.forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox(20260913);

// ---- 1. 玩家比例继承 ----
const real = { atk: 2036, def: 678, hp: 14714, soulAtk: 385, soulDef: 69 };
const g = sb.inheritGroupStats(real);
const RI = sb.GROUP_INHERIT;                      // 断言由配置派生，改比例不会误报
const PCT = Math.round(RI * 100);
assert('玩家继承 ' + PCT + '%：攻 2036 → ' + g.atk, g.atk === Math.floor(2036 * RI), String(g.atk));
assert('玩家继承 ' + PCT + '%：防 678 → ' + g.def, g.def === Math.floor(678 * RI), String(g.def));
assert('玩家继承 ' + PCT + '%：血 14714 → ' + g.hp, g.hp === Math.floor(14714 * RI), String(g.hp));
assert('魂攻继承 385 → ' + g.soulAtk, g.soulAtk === Math.floor(385 * RI), String(g.soulAtk));
// 魂防下限 = 自身防御一半：炼魂普遍只堆魂攻（385 vs 69），没下限会被魂伤打穿
assert('魂防有下限（69→' + Math.floor(69 * RI) + ' 被抬到 ' + g.soulDef + '）',
  g.soulDef === Math.max(Math.floor(69 * RI), Math.floor(g.def * 0.5)), String(g.soulDef));
assert('继承比例可配置（100%）', sb.inheritGroupStats(real, 1).atk === 2036);
assert('属性太小也不退化到 0', sb.inheritGroupStats({ atk: 2, def: 0, hp: 0 }).atk >= 1);

// ---- 2. 宠物放大 ----
function petUnit(sb, rarity, base) {
  const u = sb.createUnit({ id: 'pet', side: 'ally', name: '宠', base: base, tags: ['pet', rarity] });
  return sb.boostPetForGroup(u);
}
const chirp = petUnit(sb, 'SR', { atk: 15, def: 10, hp: 150, spd: 6 });   // 清脆鸟
const ice = petUnit(sb, 'SSR', { atk: 20, def: 15, hp: 200, spd: 8 });    // 小冰晶
const gScale = (sb.PET_GROUP_SCALE || {}).SR || 16;
const iScale = (sb.PET_GROUP_SCALE || {}).SSR || 20;
assert('清脆鸟(SR) 攻 15 → ' + chirp.base.atk, chirp.base.atk === 15 * gScale, String(chirp.base.atk));
assert('小冰晶(SSR) 攻 20 → ' + ice.base.atk, ice.base.atk === 20 * iScale, String(ice.base.atk));
assert('宠物血量同步放大并回满', ice.base.hp === 200 * iScale && ice.hp === ice.base.hp);
assert('宠物也有魂防下限（不再被魂攻打全额）', chirp.base.soulDef === Math.floor(chirp.base.def * 0.5), String(chirp.base.soulDef));
// 存在感：两只宠物合计输出应达到玩家（继承后）的 40% 以上
// v2.1.18 放大倍数下调到约 2/3 后实测 43%，故阈值由 45% 调到 40%（仍是「非摆设」的量级）
assert('两只宠物合计攻 ' + (chirp.base.atk + ice.base.atk) + ' ≥ 玩家 ' + g.atk + ' 的 40%',
  (chirp.base.atk + ice.base.atk) >= g.atk * 0.40, (chirp.base.atk + ice.base.atk) + ' vs ' + g.atk);
assert('未知稀有度回退到 R 档', petUnit(sb, 'XX', { atk: 15, hp: 150 }).base.atk === 15 * ((sb.PET_GROUP_SCALE || {}).R || 12));

// ---- 3. 敌人配置确定性（不同 Math 种子下应完全一致）----
const sb2 = makeSandbox(987654321);
function snapshot(s, gk, st) {
  return JSON.stringify((s.GROUP_LEVELS[gk].stages[st - 1].enemies || []).map(function (e) {
    return { n: e.name, t: e.talents || [], s: e.skills || [], b: e.base };
  }));
}
let same = true, checked = 0;
for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
  for (let st = 1; st <= 10; st++) {
    if (snapshot(sb, 'g' + lg, st) !== snapshot(sb2, 'g' + lg, st)) { same = false; break; }
    checked++;
  }
}
assert(checked + ' 关配置与 Math 种子无关', same && checked === Object.keys(sb.GROUP_LEVELS).length * 10, '比对 ' + checked + ' 关');

// ---- 4. Boss / 精英只用高级池 ----
/* v2.1.25：天赋与词条分家 —— 天赋走 TALENTS_HIGH，词条走 affix.js 的 AFFIX_EXTRA + 固定减伤 */
const HIGH_T = sb.TALENTS_HIGH || [];
const HIGH_A = (sb.GROUP_AFFIX_EXTRA || []).concat(['cut_boss', 'cut_elite']);
const HIGH_S = sb.SKILLS_HIGH || [];
const LOW_T = ['lazy', 'slowstart'];
let bossBad = [], lowUsed = [];
for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
  const st = sb.GROUP_LEVELS['g' + lg].stages[9];   // 第 10 关 = Boss
  (st.enemies || []).forEach(function (e) {
    (e.talents || []).forEach(function (t) {
      if (HIGH_T.indexOf(t) < 0) bossBad.push('g' + lg + ':' + t);
      if (LOW_T.indexOf(t) >= 0) lowUsed.push('g' + lg + ':' + t);
    });
    (e.affixes || []).forEach(function (a) {
      if (HIGH_A.indexOf(a) < 0) bossBad.push('g' + lg + ':词条' + a);
    });
    (e.skills || []).forEach(function (s) {
      if (HIGH_S.indexOf(s) < 0) bossBad.push('g' + lg + ':技能' + s);
    });
  });
}
assert('Boss 天赋/词条/技能全部来自各自的高级池', bossBad.length === 0, bossBad.slice(0, 5).join(','));
assert('Boss 不再抽到 lazy / slowstart 自我削弱', lowUsed.length === 0, lowUsed.join(','));
const anyBoss = sb.GROUP_LEVELS.g12.stages[9].enemies[0];
assert('Boss 至少 2 词条 + 2 技能',
  (anyBoss.affixes || []).length >= 2 && (anyBoss.skills || []).length >= 2,
  JSON.stringify({ a: anyBoss.affixes, s: anyBoss.skills }));
assert('天赋/词条/技能 id 都真实存在', (function () {
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    for (let st = 1; st <= 10; st++) {
      (sb.GROUP_LEVELS['g' + lg].stages[st - 1].enemies || []).forEach(function (e) {
        (e.talents || []).forEach(function (t) { if (!sb.TALENTS[t]) throw new Error('天赋 ' + t); });
        (e.affixes || []).forEach(function (a) { if (!sb.AFFIXES[a]) throw new Error('词条 ' + a); });
        (e.skills || []).forEach(function (s) { if (!sb.SKILLS[s]) throw new Error('技能 ' + s); });
      });
    }
  }
  return true;
})());

// ---- 5. 后续关卡属性继续递增 ----
const g12 = sb.GROUP_LEVELS.g12.stages[9].enemies[0].base;
const g1 = sb.GROUP_LEVELS.g1.stages[9].enemies[0].base;
assert('g12 Boss 攻击高于 g1（' + g1.atk + ' → ' + g12.atk + '）', g12.atk > g1.atk * 3);
assert('曲线斜率已抬高（g12 Boss 攻 ≥ 500）', g12.atk >= 500, String(g12.atk));
assert('敌人属性仍随大关单调递增', (function () {
  let prev = 0;
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    const a = sb.GROUP_LEVELS['g' + lg].stages[9].enemies[0].base.atk;
    if (a <= prev) return false;
    prev = a;
  }
  return true;
})());

// ---- 6. 魂攻 / 魂防接入敌群战斗 ----
function hit(soulAtk, soulDef) {
  const atk = sb.createUnit({ id: 'a', side: 'ally', name: '攻', base: { hp: 999, atk: 100, def: 10, spd: 5, soulAtk: soulAtk } });
  const tgt = sb.createUnit({ id: 't', side: 'enemy', name: '靶', base: { hp: 9999, atk: 1, def: 20, spd: 1, soulDef: soulDef } });
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [tgt] });
  gb.rng = function () { return 0.5; };   // 固定随机：floor(0.5*4)=2
  sb.normalAttack(gb, atk, tgt);
  return 9999 - tgt.hp;
}
const noSoul = hit(0, 0);
const soulVsNone = hit(50, 0);
const soulVsDef = hit(50, 20);
assert('无魂攻时只吃物理伤害 ' + noSoul, noSoul === 93, String(noSoul));   // 100-10+2+1
assert('魂攻对无魂防目标打全额 +50', soulVsNone - noSoul === 50, '实增 ' + (soulVsNone - noSoul));
assert('魂防生效后伤害回落（+43）', soulVsDef - noSoul === 43, '实增 ' + (soulVsDef - noSoul));
assert('魂伤不低于 1（不会退化成无效）', soulVsDef > noSoul);

// ---- 7. 单一入口：实战与 debug 体检必须走同一个函数 ----
// v2.1.12 修过的分叉 bug：debug 面板漏改判断、仍无条件走锚定，
// 结果「模拟 g5~g12 全 0% 而实际已全通关」。这里钉死两者一致。
(function () {
  const allies = [sb.createUnit({ id: 'p', side: 'ally', name: '你', base: Object.assign({ spd: 10 }, g) })];
  const stage = sb.GROUP_LEVELS.g7.stages[9];
  const raw = JSON.stringify(stage.enemies);
  assert('锚定关闭时 groupStageEnemies 直接返回原关卡配置',
    JSON.stringify(sb.groupStageEnemies('g7', stage, allies)) === raw);
  sb.GROUP_ANCHOR.enabled = true;
  const anchored = JSON.stringify(sb.groupStageEnemies('g7', stage, allies));
  sb.GROUP_ANCHOR.enabled = false;   // 还原
  assert('锚定开启时改走 anchorStageEnemies（结果与原配置不同）', anchored !== raw, anchored.slice(0, 60));
  assert('还原后回到原配置', JSON.stringify(sb.groupStageEnemies('g7', stage, allies)) === raw);
})();

// ---- 8. v2.1.13 敌群词条与场地 ----
const bossT = sb.GROUP_LEVELS.g7.stages[9].enemies[0].affixes || [];   // Boss 关（词条）
const eliteT = sb.GROUP_LEVELS.g7.stages[4].enemies[0].affixes || [];  // 精英关（词条）
assert('Boss 固定带伤害减免·大', bossT.indexOf('cut_boss') >= 0, JSON.stringify(bossT));
assert('精英固定带伤害减免·中', eliteT.indexOf('cut_elite') >= 0, JSON.stringify(eliteT));
assert('Boss 词条 ≤ 3（含固定减伤）', bossT.length <= 3 && bossT.length >= 2, JSON.stringify(bossT));
assert('精英词条 ≤ 2（含固定减伤）', eliteT.length <= 2 && eliteT.length >= 1, JSON.stringify(eliteT));
assert('其他词条都来自 AFFIX_EXTRA 池', (function () {
  const ex = sb.GROUP_AFFIX_EXTRA || [];
  return bossT.concat(eliteT).every(function (t) { return t.indexOf('cut_') === 0 || ex.indexOf(t) >= 0; });
})());
assert('词条 id 全部存在', bossT.concat(eliteT).every(function (t) { return !!sb.AFFIXES[t]; }));

/* 减伤生效验证：同一目标，带 cut_boss 时受到的普攻伤害应为 ~60%
   v2.1.25：cut_boss / cut_elite / aoe_guard / skill_guard 等已由 TALENTS 迁到 AFFIXES（page/affix.js），
   故这里走 attachAffixes。若仍用 attachTalents 会静默找不到 → 减伤不生效而断言 misleading。 */
function hitWith(affixIds) {
  const atk = sb.createUnit({ id: 'a', side: 'ally', name: '攻', base: { hp: 999, atk: 1000, def: 10, spd: 5 } });
  const tgt = sb.createUnit({ id: 't', side: 'enemy', name: '靶', base: { hp: 99999, atk: 1, def: 0, spd: 1 } });
  if (affixIds && sb.attachAffixes) sb.attachAffixes(tgt, affixIds);
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [tgt] });
  gb.rng = function () { return 0.5; };
  sb.normalAttack(gb, atk, tgt);
  return 99999 - tgt.hp;
}
const plain = hitWith(null);
const withCut = hitWith(['cut_boss']);
assert('伤害减免·大 生效（' + plain + ' → ' + withCut + '，约 60%）',
  Math.abs(withCut / plain - 0.6) < 0.05, (withCut / plain).toFixed(3));
const withElite = hitWith(['cut_elite']);
assert('伤害减免·中 生效（约 75%）', Math.abs(withElite / plain - 0.75) < 0.05, (withElite / plain).toFixed(3));
// 抗扩散只对 AOE 生效：普攻不是 AOE，所以不该额外减伤（防误判）
const stacked = hitWith(['cut_boss', 'aoe_guard']);
assert('抗扩散不影响普攻（只对 AOE 生效）', stacked === withCut, stacked + ' vs ' + withCut);
// 直接派发验证 isAoe 分支
(function () {
  const tgt = sb.createUnit({ id: 'ta', side: 'enemy', name: '靶', base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
  sb.attachAffixes(tgt, ['aoe_guard']);
  const single = sb.AFFIXES.aoe_guard.hooks.onDamage(tgt, { isPlayerAttack: false, isAoe: false });
  const aoe = sb.AFFIXES.aoe_guard.hooks.onDamage(tgt, { isPlayerAttack: false, isAoe: true });
  assert('抗扩散：非 AOE 不减伤', !single);
  assert('抗扩散：AOE 减伤 30%', aoe && aoe.mutations[0].value === 0.30);
  // 抗技法：只对角色技能生效
  const sg1 = sb.AFFIXES.skill_guard.hooks.onDamage(tgt, { isPlayerAttack: false, isSkill: true, fromPlayer: true });
  const sg2 = sb.AFFIXES.skill_guard.hooks.onDamage(tgt, { isPlayerAttack: false, isSkill: true, fromPlayer: false });
  assert('抗技法：角色技能减伤 50%', sg1 && sg1.mutations[0].value === 0.50);
  assert('抗技法：敌方技能不减伤', !sg2);
})();

/* 场地：g3 起每个大关一个主题场地，且确定性 */
assert('g1/g2 无场地', !sb.groupTerrainFor(1) && !sb.groupTerrainFor(2));
assert('g3+ 有场地', !!sb.groupTerrainFor(3) && !!sb.groupTerrainFor(15));
assert('同一大关场地确定', (function () {
  for (let lg = 3; lg <= 15; lg++) {
    const a = sb.groupTerrainFor(lg), b = sb.groupTerrainFor(lg);
    if (!a || !b || a.id !== b.id) return false;
  }
  return true;
})());

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

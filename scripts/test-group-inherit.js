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
const files = ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'enemy.js',
  'battle.js', 'group-levels.js', 'battle-group.js'];

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
assert('玩家继承 60%：攻 2036 → ' + g.atk, g.atk === 1221, String(g.atk));
assert('玩家继承 60%：防 678 → ' + g.def, g.def === 406, String(g.def));
assert('玩家继承 60%：血 14714 → ' + g.hp, g.hp === 8828, String(g.hp));
assert('魂攻继承 385 → ' + g.soulAtk, g.soulAtk === 231, String(g.soulAtk));
// 魂防有下限 = 自身防御一半：炼魂普遍只堆魂攻（385 vs 69），没下限会被魂伤打穿
assert('魂防有下限（69→24 被抬到 ' + g.soulDef + '）', g.soulDef === 203, String(g.soulDef));
assert('继承比例可配置（50%）', sb.inheritGroupStats(real, 0.5).atk === 1018);
assert('属性太小也不退化到 0', sb.inheritGroupStats({ atk: 2, def: 0, hp: 0 }).atk >= 1);

// ---- 2. 宠物放大 ----
function petUnit(sb, rarity, base) {
  const u = sb.createUnit({ id: 'pet', side: 'ally', name: '宠', base: base, tags: ['pet', rarity] });
  return sb.boostPetForGroup(u);
}
const chirp = petUnit(sb, 'SR', { atk: 15, def: 10, hp: 150, spd: 6 });   // 清脆鸟
const ice = petUnit(sb, 'SSR', { atk: 20, def: 15, hp: 200, spd: 8 });    // 小冰晶
assert('清脆鸟(SR) 攻 15 → ' + chirp.base.atk, chirp.base.atk === 240, String(chirp.base.atk));
assert('小冰晶(SSR) 攻 20 → ' + ice.base.atk, ice.base.atk === 400, String(ice.base.atk));
assert('宠物血量同步放大并回满', ice.base.hp === 4000 && ice.hp === 4000, ice.base.hp + '/' + ice.hp);
assert('宠物也有魂防下限（不再被魂攻打全额）', chirp.base.soulDef === 80, String(chirp.base.soulDef));
// 存在感：两只宠物合计输出应达到玩家（继承后）的 45% 以上 —— 此前宠物 atk 15/20 只占 1%，纯摆设
assert('两只宠物合计攻 ' + (chirp.base.atk + ice.base.atk) + ' ≥ 玩家 ' + g.atk + ' 的 45%',
  (chirp.base.atk + ice.base.atk) >= g.atk * 0.45, (chirp.base.atk + ice.base.atk) + ' vs ' + g.atk);
assert('未知稀有度回退到 R 档', petUnit(sb, 'XX', { atk: 15, hp: 150 }).base.atk === 180);

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
const HIGH_T = sb.TALENTS_HIGH || [];
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
    (e.skills || []).forEach(function (s) {
      if (HIGH_S.indexOf(s) < 0) bossBad.push('g' + lg + ':技能' + s);
    });
  });
}
assert('Boss 天赋/技能全部来自高级池', bossBad.length === 0, bossBad.slice(0, 5).join(','));
assert('Boss 不再抽到 lazy / slowstart 自我削弱', lowUsed.length === 0, lowUsed.join(','));
const anyBoss = sb.GROUP_LEVELS.g12.stages[9].enemies[0];
assert('Boss 至少 2 天赋 + 2 技能',
  (anyBoss.talents || []).length >= 2 && (anyBoss.skills || []).length >= 2,
  JSON.stringify({ t: anyBoss.talents, s: anyBoss.skills }));
assert('天赋/技能 id 都真实存在', (function () {
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    for (let st = 1; st <= 10; st++) {
      (sb.GROUP_LEVELS['g' + lg].stages[st - 1].enemies || []).forEach(function (e) {
        (e.talents || []).forEach(function (t) { if (!sb.TALENTS[t]) throw new Error('天赋 ' + t); });
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

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

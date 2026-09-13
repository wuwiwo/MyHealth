#!/usr/bin/env node
/* v2.1.9 测试：敌群难度锚定（anchorStageEnemies）
   背景：敌人属性原本是写死的绝对曲线（atk 顶到 449），而玩家属性由
   「月训练容量 + 炼魂」驱动、无上界（炼魂满级 atk +3770 / def +1798 / hp +6920）。
   配合固定减法伤害 max(1, atk - floor(def/2))，玩家 def ≥ 898 后敌人每击恒定 1 点。
   锚定后：敌人属性由参战我方阵容反推，难度与玩家强弱解耦。
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

const sb = makeSandbox(20260911);

/* 造一支我方队伍（玩家 + n 只宠物） */
function makeAllies(sb, base, petCount) {
  const arr = [sb.createUnit({ id: 'p', side: 'ally', name: '你', base: Object.assign({ spd: 10 }, base) })];
  for (let i = 0; i < (petCount || 0); i++) {
    arr.push(sb.createUnit({
      id: 'pet' + i, side: 'ally', name: '宠' + i,
      base: { hp: Math.floor(base.hp * 0.5), atk: Math.floor(base.atk * 0.4), def: Math.floor(base.def * 0.8), spd: 8 }
    }));
  }
  return arr;
}
function totals(cfg) {
  return cfg.reduce(function (a, c) {
    a.atk += (c.base && c.base.atk) || 0;
    a.def += (c.base && c.base.def) || 0;
    a.hp += (c.base && c.base.hp) || 0;
    return a;
  }, { atk: 0, def: 0, hp: 0 });
}

// ---- 1. 关卡进度 t ----
assert('t(g1-1) = 0', sb.groupAnchorT('g1', 'g1-1') === 0, String(sb.groupAnchorT('g1', 'g1-1')));
var lastG = Object.keys(sb.GROUP_LEVELS).pop();
assert('t(末关 ' + lastG + ') = 1', Math.abs(sb.groupAnchorT(lastG, lastG + '-10') - 1) < 1e-9, String(sb.groupAnchorT(lastG, lastG + '-10')));
assert('t 随关卡单调递增', (function () {
  let prev = -1;
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    for (let st = 1; st <= 10; st++) {
      const t = sb.groupAnchorT('g' + lg, 'g' + lg + '-' + st);
      if (t <= prev) return false;
      prev = t;
    }
  }
  return true;
})());

// ---- 2. 不改原配置、不改敌人数 ----
const st6 = sb.GROUP_LEVELS.g6.stages[9];
const beforeAtk = st6.enemies[0].base.atk;
const beforeHp = st6.enemies[0].base.hp;
// ⚠️ 必须用「强队」：弱队会触发 hpFloor = min(fHp, allyDps×maxRounds) 兜底，
//    兜底一生效预期回合数 R 就被钉住，敌人血量/攻击不再随玩家线性变化（实测会跑出 2.2× / 1.6×）。
//    v2.1.10 抬高固定曲线后这个效应更明显，所以这里统一用强队测。
const alliesA = makeAllies(sb, { hp: 12000, atk: 4000, def: 1200 }, 2);
const cfg6 = sb.anchorStageEnemies('g6', st6, alliesA);
assert('不修改原关卡配置', st6.enemies[0].base.atk === beforeAtk && st6.enemies[0].base.hp === beforeHp,
  beforeAtk + '→' + st6.enemies[0].base.atk);
assert('敌人数不变', cfg6.length === st6.enemies.length, cfg6.length + ' vs ' + st6.enemies.length);
assert('保留天赋/技能/名字', cfg6[0].name === st6.enemies[0].name
  && JSON.stringify(cfg6[0].talents || []) === JSON.stringify(st6.enemies[0].talents || [])
  && JSON.stringify(cfg6[0].skills || []) === JSON.stringify(st6.enemies[0].skills || []));

// ---- 3. 我方为空时原样返回（不炸） ----
assert('无我方时原样返回', sb.anchorStageEnemies('g6', st6, []).length === st6.enemies.length);
assert('我方全 0 属性时原样返回', sb.anchorStageEnemies('g6', st6,
  [sb.createUnit({ id: 'z', side: 'ally', base: { hp: 0, atk: 0, def: 0 } })]).length === st6.enemies.length);

// ---- 4. 难度随关卡递增 ----
// 注意：难度爬升靠「战斗变长」（敌人总血），不是靠单次伤害变高 ——
// 敌人总攻在 g4 之后基本持平是有意为之：单次伤害已被我方防御/血量锚定，
// 越往后打越久、累计挨的伤害越多。所以难度指标用「总攻 × 总血」。
assert('敌人总血随大关递增', (function () {
  let prev = 0;
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    const t = totals(sb.anchorStageEnemies('g' + lg, sb.GROUP_LEVELS['g' + lg].stages[9], alliesA)).hp;
    if (t <= prev) return false;
    prev = t;
  }
  return true;
})());
assert('难度指标（总攻 × 总血）随大关递增', (function () {
  let prev = 0;
  for (let lg = 1; lg <= Object.keys(sb.GROUP_LEVELS).length; lg++) {
    const t = totals(sb.anchorStageEnemies('g' + lg, sb.GROUP_LEVELS['g' + lg].stages[9], alliesA));
    const d = t.atk * t.hp;
    if (d <= prev) return false;
    prev = d;
  }
  return true;
})());

// ---- 5. 核心：难度与玩家强弱解耦 ----
//      用两支「都不触发 maxRounds 血量兜底」的强队测：玩家属性翻倍，敌人属性也应翻倍
//      ⚠️ 弱队不能用于此项 —— hpFloor = min(fHp, allyDps×maxRounds) 会改变预期回合数 R，
//         R 一变，攻击就不是线性了（这是兜底机制的预期行为）
const strongA = alliesA;
const strongB = makeAllies(sb, { hp: 24000, atk: 8000, def: 2400 }, 2);
const ta = totals(sb.anchorStageEnemies('g12', sb.GROUP_LEVELS.g12.stages[9], strongA));
const tb = totals(sb.anchorStageEnemies('g12', sb.GROUP_LEVELS.g12.stages[9], strongB));
[['攻击', 'atk'], ['防御', 'def'], ['生命', 'hp']].forEach(function (p) {
  const ratio = tb[p[1]] / Math.max(1, ta[p[1]]);
  assert('玩家翻倍 → 敌人' + p[0] + '同步翻倍（' + ratio.toFixed(2) + '×）', ratio > 1.85 && ratio < 2.15,
    ta[p[1]] + ' → ' + tb[p[1]]);
});

// ---- 6. 关键回归：高防玩家不再出现「敌人每击 1 点」 ----
//      满炼魂 def 1798 + 基础 67 ≈ 1865，原固定曲线最高攻击 449 → max(1, 449-932) = 1
const whale = makeAllies(sb, { hp: 9490, atk: 4870, def: 1865 }, 2);
const tw = totals(sb.anchorStageEnemies('g12', sb.GROUP_LEVELS.g12.stages[9], whale));
const perHit = Math.floor(tw.atk / 3) - Math.floor(1865 / 2);
assert('满炼魂玩家：敌人单击伤害不再退化为 1（' + perHit + '）', perHit > 50, '单击 ' + perHit);
assert('敌人能撑住（总血 ' + tw.hp + ' > 玩家一回合输出）', tw.hp > 4870 * 2, '总血 ' + tw.hp);

// ---- 7. 固定曲线作下限：属性不会被缩到比原曲线更小 ----
assert('防御不缩水（≥ 固定曲线）', (function () {
  const st = sb.GROUP_LEVELS.g12.stages[9];
  const a = sb.anchorStageEnemies('g12', st, makeAllies(sb, { hp: 200, atk: 30, def: 12 }, 0));
  const fb = st.enemies.reduce((s, e) => s + e.base.def, 0);
  return totals(a).def >= fb - a.length;   // 允许 floor 取整误差
})());

// ---- 8. 弱玩家：战斗回合数被 maxRounds 兜住 ----
assert('弱玩家敌人血量不失控（≤ 我方输出 × 12）', (function () {
  const weak = makeAllies(sb, { hp: 800, atk: 300, def: 40 }, 2);
  const st = sb.GROUP_LEVELS.g12.stages[9];
  const t = totals(sb.anchorStageEnemies('g12', st, weak)).hp;
  const dps = 300 + 120 * 2;
  return t <= dps * 12;
})());

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/* 敌群平衡模拟器（开发工具，非测试，不参与 test-* 全量跑）
 *
 * 用途：玩家属性由「真实训练数据」驱动、无上界增长；敌人属性是写死的绝对曲线。
 *      本脚本用真实战斗公式跑扫描，量化「玩家多强之后敌人就没意义了」。
 *
 * 用法：
 *   node scripts/balance-sim.js                      # 默认扫描
 *   node scripts/balance-sim.js --atk 800 --def 60 --hp 1800 --pets 2
 *                                                    # 指定属性，逐关模拟
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'enemy.js',
  'battle.js', 'group-levels.js', 'battle-group.js'];

function makeSandbox(seed) {
  // mulberry32：确定性伪随机（不能用恒定值，否则依赖概率的分支永不触发）
  let a = seed >>> 0;
  const rnd = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math);   // 必须继承，Object.assign 会丢掉 min/floor
  M.random = rnd;
  const sb = { Math: M, JSON, console };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  files.forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

/* 跑一场：返回 {win, turns, hpLeftPct} */
function simulate(sb, playerBase, stage, petCount, maxTurns) {
  const player = sb.createUnit({ id: 'player', side: 'ally', name: '你', base: Object.assign({ spd: 10 }, playerBase) });
  const allies = [player];
  for (let i = 0; i < (petCount || 0); i++) {
    // 粗略的宠物替身：不引入 pets 模块依赖，用中等宠物量级
    allies.push(sb.createUnit({
      id: 'pet-' + i, side: 'ally', name: '宠' + i,
      base: { hp: Math.floor(playerBase.hp * 0.5), atk: Math.floor(playerBase.atk * 0.4), def: Math.floor(playerBase.def * 0.8), spd: 8 }
    }));
  }
  const enemies = (stage.enemies || []).map(function (ec, i) {
    return sb.createEnemyUnit({ id: 'enemy-' + i, tier: ec.tier, name: ec.name, talents: ec.talents, skills: ec.skills, base: ec.base });
  });
  const gb = sb.createGroupBattle({ allies: allies, enemies: enemies });
  let turns = 0;
  while (!gb.done && turns < (maxTurns || 200)) { sb.groupBattleStep(gb); turns++; }
  const totalHp = allies.reduce((s, u) => s + u.base.hp, 0);
  const leftHp = allies.reduce((s, u) => s + Math.max(0, u.hp), 0);
  return { win: gb.winner === 'ally', turns: turns, hpLeftPct: totalHp ? Math.round(leftHp / totalHp * 100) : 0 };
}

/* 对某关跑 N 次，返回统计 */
function evalStage(playerBase, stage, trials, petCount) {
  let wins = 0, turnSum = 0, hpSum = 0;
  for (let i = 0; i < trials; i++) {
    const sb = makeSandbox(20260911 + i);
    const r = simulate(sb, playerBase, stage, petCount);
    if (r.win) { wins++; turnSum += r.turns; hpSum += r.hpLeftPct; }
  }
  return {
    winRate: Math.round(wins / trials * 100),
    avgTurns: wins ? (turnSum / wins).toFixed(1) : '—',
    avgHpLeft: wins ? Math.round(hpSum / wins) : 0
  };
}

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
function arg(k, dflt) { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; }

const TRIALS = parseInt(arg('trials', '12'), 10);
const PETS = parseInt(arg('pets', '2'), 10);

if (argv.includes('--atk')) {
  /* 单属性模式：逐大关（取每大关第 10 关 Boss）报告 */
  const base = {
    atk: parseInt(arg('atk', '300'), 10),
    def: parseInt(arg('def', '40'), 10),
    hp: parseInt(arg('hp', '800'), 10),
    soulAtk: parseInt(arg('soulAtk', '0'), 10),
    soulDef: parseInt(arg('soulDef', '0'), 10)
  };
  const sb0 = makeSandbox(1);
  console.log('玩家 攻' + base.atk + ' 防' + base.def + ' 血' + base.hp + ' 魂攻' + base.soulAtk + ' 魂防' + base.soulDef + ' · 宠物' + PETS);
  console.log('大关  敌人(Boss关)                     胜率  回合  剩血%');
  Object.keys(sb0.GROUP_LEVELS).forEach(function (gk) {
    const g = sb0.GROUP_LEVELS[gk];
    const st = g.stages[9];
    const e = st.enemies[0].base;
    const r = evalStage(base, st, TRIALS, PETS);
    console.log(
      gk.padEnd(5) +
      ('atk' + e.atk + ' def' + e.def + ' hp' + e.hp + ' ×' + st.enemies.length).padEnd(32) +
      String(r.winRate + '%').padStart(5) +
      String(r.avgTurns).padStart(6) +
      String(r.avgHpLeft + '%').padStart(7)
    );
  });
} else {
  /* 扫描模式：玩家随训练量增长，看 g6-10 / g12-10 的胜率与回合数 */
  console.log('玩家成长扫描（ cardio 200min/月 固定；敌人为 g6-10 / g12-10 Boss 关 ）\n');
  console.log('月容量kg   攻    防    血      g6-10胜率/回合/剩血   g12-10胜率/回合/剩血');
  const sb0 = makeSandbox(1);
  const s610 = sb0.GROUP_LEVELS.g6.stages[9];
  const s1210 = sb0.GROUP_LEVELS.g12.stages[9];
  [500, 2000, 5000, 10000, 20000, 40000, 80000].forEach(function (vol) {
    const atk = 10 + Math.floor(vol / 20);
    const def = 10 + Math.floor(200 / 15);
    const hp = 100 + Math.floor(vol / 10) + Math.floor(200 / 3);
    const base = { atk: atk, def: def, hp: hp, soulAtk: 0, soulDef: 0 };
    const a = evalStage(base, s610, TRIALS, PETS);
    const b = evalStage(base, s1210, TRIALS, PETS);
    console.log(
      String(vol).padStart(8) + String(atk).padStart(6) + String(def).padStart(6) + String(hp).padStart(7) +
      ('   ' + a.winRate + '% / ' + a.avgTurns + ' / ' + a.avgHpLeft + '%').padEnd(24) +
      '  ' + b.winRate + '% / ' + b.avgTurns + ' / ' + b.avgHpLeft + '%'
    );
  });
  console.log('\n参考：敌人 g6-10 Boss atk ' + s610.enemies[0].base.atk + ' / hp ' + s610.enemies[0].base.hp +
    '；g12-10 Boss atk ' + s1210.enemies[0].base.atk + ' / hp ' + s1210.enemies[0].base.hp);
}

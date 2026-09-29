#!/usr/bin/env node
/* 敌群「宠物规则」A/B 复测器（开发工具，非测试，不参与 test-* 全量跑）
 *
 * 用途：回答「宠物侧改动把难度推动了没有」。做法是**同一套配置只换宠物规则**：
 *   A（旧）= 2 宠 + createPetUnit + boostPetForGroup（无团队凝聚 / 无共鸣）
 *   B（新）= 4 宠 + buildGroupBattlePets（含团队凝聚 + 共鸣）
 * 其余全同（玩家继承 50% / groupStageEnemies / groupTerrainFor / 同种子序列），
 * 所以差值只归因于宠物规则本身。
 *
 * 用法：
 *   node scripts/balance-pets-ab.js                     # 默认用「旧基准账号」，便于与历史阶梯对比
 *   node scripts/balance-pets-ab.js --account now       # 用 dundun 当前实际属性
 *   node scripts/balance-pets-ab.js --trials 24
 *
 * ⚠️ 实战口径要点（缺一个就会测偏，见 doc/HANDOFF.md §6.3 / §12 PITFALL-17）：
 *   · 必须加载 ai.js（否则敌人不放技能）与 terrain.js（否则场地不生效）
 *   · 宠物走真实管道（createPetUnit / buildGroupBattlePets），不要自己硬编码数值
 *   · 每关取「该大关第 10 小关」= Boss 关；用 createGroupBattle 的 seed 保证可复现
 *   · 先复现一个已知结论再采信新数据（例如 g6/g10/g13 应恒为 100%）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const FILES = ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'affix.js',
  'skill.js', 'enemy.js', 'ai.js', 'terrain.js', 'battle.js', 'orbs.js', 'pets.js', 'pet-materials.js',
  'pet-codex.js', 'pet-store.js', 'group-levels.js', 'battle-group.js'];
const src = {};
FILES.forEach(f => { src[f] = load(f); });

function arg(k, d) { const i = process.argv.indexOf('--' + k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const ACCOUNT = arg('account', 'old');
const TRIALS = parseInt(arg('trials', '12'), 10);
const ACCOUNTS = {
  old: { atk: 2883, def: 1145, hp: 24800, soulAtk: 532, soulDef: 99, label: '旧基准 2883/1145/24800/532/99' },
  now: { atk: 5686, def: 2756, hp: 60290, soulAtk: 770, soulDef: 177, label: 'dundun 当前 5686/2756/60290/770/177' }
};
const GROUPS = ['g6', 'g10', 'g13', 'g14', 'g15', 'g16', 'g17', 'g18', 'g19', 'g20', 'g21', 'g22', 'g23', 'g24'];

/* 4 只参战宠：R/SR/SSR/UR 各一只；refineLevel 0 = 裸图鉴（保守下限） */
const PETS = ['sparkle', 'chirpbird', 'icecrystal', 'dream'];

function makeSandbox(seed) {
  let a = seed >>> 0;
  const M = Object.create(Math);
  M.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mem = {};
  const sb = { Math: M, JSON, console, Date };
  sb.store = { get: k => mem[k], set: (k, v) => { mem[k] = v; }, register: () => {}, registerSchema: () => {} };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(src[f], sb));
  return sb;
}

function seedStore(sb) {
  sb.store.set('pets', {
    version: 1,
    pets: PETS.map(function (sid) {
      return { speciesId: sid, stage: 'mature', isDead: false, injured: false, hunger: 100, health: 100,
        ageDays: 30, refineLevel: 0, refineStats: {}, skillLevels: {} };
    }),
    materials: { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 },
    orbs: [], lastSettleDate: null, monthlyKey: null
  });
}

function runOne(sb, acc, groupKey, mode, seed) {
  const lv = ACCOUNTS[acc];
  const gs = sb.inheritGroupStats({ atk: lv.atk, def: lv.def, hp: lv.hp, soulAtk: lv.soulAtk, soulDef: lv.soulDef });
  const player = sb.createUnit({ id: 'player', side: 'ally', name: '你', base: Object.assign({ spd: 10 }, gs) });

  let pets;
  if (mode === 'old') {
    pets = PETS.slice(0, 2).map(function (sid) {
      return sb.boostPetForGroup(sb.createPetUnit({ speciesId: sid, stage: 'mature', refineStats: {}, skillLevels: {} }));
    });
  } else {
    seedStore(sb);
    pets = sb.buildGroupBattlePets(PETS);
  }
  const allies = [player].concat(pets);

  const st = sb.GROUP_LEVELS[groupKey].stages[9];
  const lg = parseInt(String(groupKey).replace(/[^0-9]/g, ''), 10) || 1;
  const enemies = sb.groupStageEnemies(groupKey, st, allies).map(function (ec, i) {
    return sb.createEnemyUnit({ id: 'enemy-' + i, tier: ec.tier, name: ec.name, talents: ec.talents, skills: ec.skills, base: ec.base, level: ec.level });
  });
  const gb = sb.createGroupBattle({ allies: allies, enemies: enemies, terrain: sb.groupTerrainFor(lg), seed: seed });
  let steps = 0;
  while (!gb.done && steps < 600) { sb.groupBattleStep(gb); steps++; }
  return gb.winner === 'ally';
}

function evalGroup(acc, groupKey, mode) {
  let wins = 0;
  for (let i = 0; i < TRIALS; i++) {
    if (runOne(makeSandbox(20260929 + i * 7919), acc, groupKey, mode, 1000 + i)) wins++;
  }
  return Math.round(wins / TRIALS * 100);
}

console.log('账号：' + ACCOUNTS[ACCOUNT].label + ' · trials=' + TRIALS + ' · 每关取 Boss 关（第 10 小关）');
console.log('大关      旧(2宠)   新(4宠+凝聚/共鸣)');
GROUPS.forEach(function (gk) {
  const a = evalGroup(ACCOUNT, gk, 'old');
  const b = evalGroup(ACCOUNT, gk, 'new');
  console.log(gk.padEnd(8) + String(a + '%').padStart(7) + String(b + '%').padStart(12)
    + (b > a ? '   ↑ +' + (b - a) : b < a ? '   ↓ ' + (b - a) : ''));
});

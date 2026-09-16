#!/usr/bin/env node
/* v2.1.27 测试：敌群战斗确定性（7c RNG 回放）与快照回滚（7d 时间旅行）
   判据照旧：**必须真的断言到效果**，不能只看「没抛异常」。
   —— 同种子跑两遍，winner / 回合 / 每个单位的 hp 必须逐字节一致；否则说明
      战斗代码里还有地方直接用 Math.random（不经过 gb.rng），回放就是假的。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

function makeSandbox() {
  const sb = { Math: Object.create(Math), JSON, console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'ai.js', 'terrain.js', 'orbs.js', 'pet-codex.js', 'battle.js',
    'group-levels.js', 'battle-group.js'].forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox();

/* 用真实关卡配置搭一场战斗（走 groupStageEnemies，与实战同口径） */
function buildBattle(seed) {
  /* v2.1.27：建场阶段也会消耗随机数，必须先把 _BATTLE_RNG 绑到本场种子 */
  const rng = sb.beginBattleRng(seed);
  const lg = 7;
  const stage = sb.GROUP_LEVELS['g' + lg].stages[9];
  const cfg = sb.groupStageEnemies('g' + lg, stage, []);
  const enemies = cfg.map(function (ec, i) {
    return sb.createEnemyUnit({ id: 'e' + i, tier: ec.tier, name: ec.name, talents: ec.talents, skills: ec.skills, base: ec.base });
  });
  const atk = sb.createUnit({ id: 'a', side: 'ally', name: '攻', level: 1, base: { hp: 4000, atk: 700, def: 300, soulAtk: 150, soulDef: 100, spd: 10 } });
  const pet = sb.createPetUnit({ speciesId: 'icecrystal', stage: 'mature', refineStats: {} });
  if (pet && typeof sb.boostPetForGroup === 'function') sb.boostPetForGroup(pet);
  const allies = [atk].concat(pet ? [pet] : []);
  return sb.createGroupBattle({ allies: allies, enemies: enemies, seed: seed, rng: rng });
}

function runToEnd(gb, cap) {
  let n = 0;
  while (!gb.done && n < (cap || 400)) { sb.groupBattleStep(gb); n++; }
  return { winner: gb.winner || null, turn: gb.turn, steps: n, hps: (gb.units || []).map(function (u) { return u.id + ':' + u.hp; }).join('|') };
}

// ---- 1. 同种子必须完全一致 ----
const SEED = 20260916;
const r1 = runToEnd(buildBattle(SEED));
const r2 = runToEnd(buildBattle(SEED));
assert('同种子：结果一致（' + r1.winner + ' / 第 ' + r1.turn + ' 回合 / ' + r1.steps + ' 步）',
  r1.winner === r2.winner && r1.turn === r2.turn && r1.steps === r2.steps,
  JSON.stringify(r1) + ' vs ' + JSON.stringify(r2));
assert('同种子：每个单位血量逐项一致', r1.hps === r2.hps, r1.hps + ' vs ' + r2.hps);

// ---- 2. 不同种子应有差异（否则说明种子没生效 / 战斗本身是确定的）----
const r3 = runToEnd(buildBattle(SEED + 7777));
const differs = (r3.winner !== r1.winner) || (r3.turn !== r1.turn) || (r3.hps !== r1.hps);
assert('不同种子：结果有差异（证明种子真的在起作用）', differs,
  'seed+' + 7777 + ' 得到 ' + JSON.stringify({ w: r3.winner, t: r3.turn }));

// ---- 3. 种子 RNG 可读写状态 ----
(function () {
  const rng = sb.makeSeededRng(12345);
  const a1 = rng(), a2 = rng();
  const st = rng.getState();
  const b1 = rng(), b2 = rng();
  rng.setState(st);
  assert('种子 RNG：setState 后可复现后续序列', rng() === b1 && rng() === b2);
  rng.setState(0); rng.setState(12345);
  assert('种子 RNG：回到初始状态后从头开始', rng() === a1 && rng() === a2);
})();

// ---- 4. 快照 / 回滚（7d）----
(function () {
  const gb = buildBattle(SEED);
  const init = sb.groupSnapshot(gb);
  assert('开局快照可生成', !!init && Array.isArray(init.units) && init.units.length > 0);

  // 走 5 步后拍快照，再走 5 步，然后回滚
  for (let i = 0; i < 5; i++) sb.groupBattleStep(gb);
  const mid = sb.groupSnapshot(gb);
  const midHps = (gb.units || []).map(u => u.hp).join(',');
  const midTurn = gb.turn;
  for (let i = 0; i < 5; i++) sb.groupBattleStep(gb);
  const afterHps = (gb.units || []).map(u => u.hp).join(',');
  assert('再走 5 步后状态确实变了（否则回滚测不出东西）', afterHps !== midHps, midHps + ' vs ' + afterHps);

  const rr = sb.groupRestore(gb, mid);
  assert('回滚成功', rr.ok === true, rr.reason);
  assert('回滚后血量还原', (gb.units || []).map(u => u.hp).join(',') === midHps);
  assert('回滚后回合数还原（' + gb.turn + '）', gb.turn === midTurn, String(gb.turn));
  assert('回滚后 _stepQueue 已重置', !gb._stepQueue);

  // 回滚后继续推进，应能走到与原来相同的终点
  const resumed = runToEnd(gb);
  assert('回滚后重跑到结束，终点与首次一致（' + resumed.winner + '/' + resumed.turn + '）',
    resumed.winner === r1.winner && resumed.turn === r1.turn,
    JSON.stringify(resumed) + ' vs ' + JSON.stringify(r1));
})();

// ---- 5. groupReplay 从初始快照重放 ----
(function () {
  const gb = buildBattle(SEED);
  const init = sb.groupSnapshot(gb);
  const res = sb.groupReplay(gb, init, 600);
  assert('groupReplay 成功', res.ok === true, res.reason);
  assert('重放结果与首次一致（' + res.winner + '/' + res.turn + '）',
    res.winner === r1.winner && res.turn === r1.turn,
    JSON.stringify(res) + ' vs ' + JSON.stringify(r1));
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

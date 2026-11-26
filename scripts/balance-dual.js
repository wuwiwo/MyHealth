#!/usr/bin/env node
/* 阶段 E：多队双场景 —— MULTI_SCENE_ENEMY_SCALE 平衡实测（纯本地工具，不进全量测试）
   口径：同一套 8 宠阵容 / 同一关 g18-5 / 同一批种子，只改缩放系数 → 看胜率与轮次。
   基线：g18-5 单场景（scale=1.0、winnerRule='all'、玩家可被打）—— 现有线上难度。
   Run: node scripts/balance-dual.js [seeds=40] */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'page');
const html = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);

const ls = {};
ls['dh-pets-v1'] = JSON.stringify({
  version: 1, pets: [],
  materials: { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 },
  orbs: [], battlePicks: [], squads: [], lastSettleDate: null, monthlyKey: null
});
function mkEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    innerHTML: '', textContent: '', value: ''
  };
}
const sb = { console, JSON, Date, navigator: { userAgent: 'test' } };
sb.window = sb; sb.globalThis = sb;
sb.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sb.document = {
  getElementById: () => mkEl(), createElement: () => mkEl(),
  body: { appendChild() {}, remove() {} }, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {} }
};
sb.toast = function () {}; sb.location = { search: '' }; sb.addEventListener = () => {};
sb.confirm = () => true; sb.setTimeout = () => 0; sb.setInterval = () => 0;
sb.clearTimeout = () => {}; sb.clearInterval = () => {}; sb.requestAnimationFrame = () => 0;
sb.innerWidth = 375; sb.innerHeight = 700; sb.navigator.vibrate = () => {};
vm.createContext(sb);
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(PAGE, src), 'utf8'), sb, { filename: src });
});

const SEEDS = Number(process.argv[2] || 40);
const STAGE_ID = 'g18-5';

/* ---------- 造存档：两套阵容 ---------- */
function codexIds() {
  const ids = Object.keys(sb.PET_CODEX || {});
  return ids;
}
function seedStore(ids, level) {
  const d = sb.getPetStore();
  d.pets = ids.map(id => {
    const p = sb.createPet({ speciesId: id, rarity: (sb.PET_CODEX[id] || {}).rarity || 'R', name: id });
    p.stage = 'mature';
    p.health = 100;
    p.level = level;
    p.exp = level * 100;
    return p;
  });
  sb.savePetStore(d);
  return d;
}
const CODEX = codexIds();
const byRarity = r => CODEX.filter(id => (sb.PET_CODEX[id] || {}).rarity === r);

/* 普通阵容（8 只，成熟 Lv20）：**按强度降序**排列 —— A 队 = 前 4（最强），B 队 = 后 4（较弱）。
   这是真实存量：第二队通常比第一队弱一档。 */
const ROSTER_MID = []
  .concat(byRarity('SSR').slice(0, 2))
  .concat(byRarity('SR').slice(0, 4))
  .concat(byRarity('R').slice(0, 2));
/* 强阵容（8 只，成熟 Lv20）：SSR/UR，再补 SR 凑满 8 */
const ROSTER_STRONG = []
  .concat(byRarity('UR'))
  .concat(byRarity('SSR'))
  .concat(byRarity('SR'))
  .slice(0, 8);

/* ---------- 玩家单位（与线上同量级：走玩家属性，不用宠物池） ---------- */
function makePlayer() {
  const u = sb.createUnit({
    id: 'player', side: 'ally', name: '你', level: 30,
    base: { hp: 420, atk: 26, def: 12, spd: 14, soulAtk: 0, soulDef: 0 }, skills: [], tags: ['player']
  });
  return u;
}

function buildEnemies(cfgs, prefix) {
  return (cfgs || []).map((c, i) => sb.createEnemyUnit({
    id: prefix + '-' + i, name: c.name, tier: c.tier, base: c.base,
    talents: c.talents, skills: c.skills, affixes: c.affixes
  }));
}

function hpPct(gb) {
  let cur = 0, max = 0;
  (gb.squadUnits || []).forEach(u => { cur += Math.max(0, u.hp); max += (u.base.hp || 1); });
  if (!max) return 0;
  return Math.round(cur / max * 100);
}

/* ---------- 双场景一场 ---------- */
function runDual(scale, roster, seed, stageId) {
  seedStore(roster, 20);
  const id = stageId || STAGE_ID;
  const stage = sb.getGroupStage(id);
  const base = sb.groupStageEnemies(id, stage);
  const cfgA = sb.applyMultiSceneScale(base, scale);
  const cfgB = sb.applyMultiSceneScale(base, scale);
  const rng = sb.makeSeededRng(seed);
  const alliesA = sb.buildGroupBattlePets(roster.slice(0, 4), 4);
  const alliesB = sb.buildGroupBattlePets(roster.slice(4, 8), 4);
  const gbA = sb.createGroupBattle({ allies: alliesA, enemies: buildEnemies(cfgA, 'eA'), rng: rng, winnerRule: 'pets' });
  const gbB = sb.createGroupBattle({ allies: alliesB, enemies: buildEnemies(cfgB, 'eB'), rng: rng, winnerRule: 'pets' });
  const dir = sb.createDualBattle({
    player: makePlayer(),
    scenes: {
      A: { gb: gbA, squadUnits: alliesA, squadName: '一队' },
      B: { gb: gbB, squadUnits: alliesB, squadName: '二队' }
    },
    pendingSquads: [],
    buildSquad: () => []
  });
  let steps = 0;
  while (!dir.done && steps < 4000) { sb.dualStep(dir); steps++; }
  return { win: dir.winner === 'ally', cycle: dir.cycle, steps, hpA: hpPct(gbA), hpB: hpPct(gbB) };
}

/* ---------- 单场景基线（现有线上口径：一次只能上 4 只，玩家可被打） ---------- */
function runSingle(roster, seed, best4, stageId) {
  seedStore(roster, 20);
  const id = stageId || STAGE_ID;
  const stage = sb.getGroupStage(id);
  const cfg = sb.groupStageEnemies(id, stage);
  const rng = sb.makeSeededRng(seed);
  const allies = sb.buildGroupBattlePets(best4 || roster.slice(0, 4), 4);
  const player = makePlayer();
  allies.unshift(player);
  const gb = sb.createGroupBattle({ allies: allies, enemies: buildEnemies(cfg, 'eS'), rng: rng });
  let steps = 0;
  while (!gb.done && steps < 4000) { sb.groupBattleStep(gb); steps++; }
  return { win: gb.winner === 'ally', turn: gb.turn, steps };
}

function summarize(rows) {
  const n = rows.length;
  const wins = rows.filter(r => r.win).length;
  const avgRounds = rows.reduce((s, r) => s + (r.cycle || r.turn || 0), 0) / n;
  const winRows = rows.filter(r => r.win);
  const avgHp = winRows.length ? winRows.reduce((s, r) => s + ((r.hpA + r.hpB) / 2 || 0), 0) / winRows.length : 0;
  return { n, winRate: Math.round(wins / n * 100), avgRounds: avgRounds.toFixed(1), avgHp: avgHp ? avgHp.toFixed(0) + '%' : '—' };
}

const SCALES = [1.00, 0.95, 0.90, 0.85, 0.80, 0.70];
function sweep(label, roster) {
  console.log(`\n【${label}】8 只成熟 Lv20 · 关 ${STAGE_ID}`);
  console.log('  单场景基线（4 只 + 玩家，scale 1.00，winnerRule=all）：');
  const single = [];
  for (let s = 1; s <= SEEDS; s++) single.push(runSingle(roster, s));
  const S = summarize(single);
  console.log(`    胜率 ${S.winRate}% · 平均 ${S.avgRounds} 回合（n=${S.n}）`);
  console.log('  scale | 双场景胜率 | 平均整场轮数 | 胜场剩余我方血量');
  SCALES.forEach(sc => {
    const rows = [];
    for (let s = 1; s <= SEEDS; s++) rows.push(runDual(sc, roster, s));
    const R = summarize(rows);
    console.log(`  ${sc.toFixed(2)}  |   ${String(R.winRate).padStart(3)}%      |    ${R.avgRounds}      |   ${R.avgHp}`);
  });
}

console.log(`阶段 E 平衡实测 · 种子 1..${SEEDS} · 双场景每场两场景各一份完整编成 × scale`);
/* ---------- 双场景 sweep（可在任意关卡跑，用于「同关同阵容」的纯系数对比） ---------- */
function sweepAt(stageId, roster, tag) {
  console.log(`\n【${tag}】关 ${stageId} · 8 只成熟 Lv20 · 种子 1..${SEEDS}`);
  const single = [];
  for (let s = 1; s <= SEEDS; s++) single.push(runSingle(roster, s, roster.slice(0, 4), stageId));
  const S = summarize(single);
  console.log(`  单场景基线（4 只 + 玩家，scale 1.00）：胜率 ${S.winRate}% · 平均 ${S.avgRounds} 回合`);
  console.log('  scale | 双场景胜率 | 平均整场轮数 | 胜场剩余我方血量');
  SCALES.forEach(sc => {
    const rows = [];
    for (let s = 1; s <= SEEDS; s++) rows.push(runDual(sc, roster, s, stageId));
    const R = summarize(rows);
    console.log(`  ${sc.toFixed(2)}  |   ${String(R.winRate).padStart(3)}%      |    ${R.avgRounds}      |   ${R.avgHp}`);
  });
}

function findCalibStage(roster) {
  const cands = [];
  ['g7', 'g8'].forEach(g => {
    const lv = sb.GROUP_LEVELS[g];
    if (!lv) return;
    lv.stages.forEach(st => cands.push(st.id));
  });
  let best = null;
  for (const id of cands) {
    const rows = [];
    for (let s = 1; s <= 6; s++) rows.push(runSingle(roster, s, roster.slice(0, 4), id));
    const r = summarize(rows).winRate;
    if (r >= 50 && r <= 85) { best = id; break; }
  }
  return best;
}

console.log(`阶段 E 平衡实测 · 种子 1..${SEEDS} · 双场景每场两场景各一份完整编成 × scale`);
console.log(`阵容：普通 ${ROSTER_MID.length} 只 [${ROSTER_MID.join(',')}]；强 ${ROSTER_STRONG.length} 只 [${ROSTER_STRONG.join(',')}]`);
stageStats(STAGE_ID);
const calib = findCalibStage(ROSTER_MID) || 'g7-10';
sweepAt(calib, ROSTER_MID, '校准关（单场景胜率落在 5~8 成）');
if (ROSTER_STRONG.length >= 8) sweepAt(calib, ROSTER_STRONG, '强阵容（SSR+UR）同关对比');
if (calib !== 'g18-5') sweepAt('g18-5', ROSTER_MID, '末段精英关（我方太弱，只作趋势参照）');
console.log('\n注：双场景＝8 只分两队 × 两场景；单场景基线只能上 4 只，是「不做多队时的现行难度」。');
function stageStats(stageId) {
  const stage = sb.getGroupStage(stageId);
  const cfg = sb.groupStageEnemies(stageId, stage) || [];
  console.log(`\n【敌人编成 ${stageId}】` + cfg.map(c => `${c.name}(hp${c.base.hp}/atk${c.base.atk}/def${c.base.def})`).join(' '));
  seedStore(ROSTER_MID, 20);
  const u = sb.buildGroupBattlePets(ROSTER_MID.slice(0, 4), 4) || [];
  console.log('【我方宠物】' + u.map(x => `${x.name}(hp${x.base.hp}/atk${x.base.atk}/def${x.base.def}/spd${x.base.spd})`).join(' '));
}

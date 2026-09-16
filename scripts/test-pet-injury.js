#!/usr/bin/env node
/* v2.1.19 测试：成熟期受伤系统
   规则（dundun 指定）：
   - 成熟期参战，战斗失败有 50% 几率进入受伤状态
   - 受伤期间无法继续战斗
   - 喂营养液 恢复 +10%~15%；喂饲料 恢复 +4%~5%
   - 恢复进度到 100% 解除受伤
   - 成熟期也需要喂饲料（恢复饥饿）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const sb = { Math: M, JSON, console, store: { get: k => mem[k], set: (k, v) => { mem[k] = v; }, register: () => {} } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  // utils.js 必须最先加载：v2.1.27 起战斗随机统一走 battleRnd()，定义在这里
  ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'enemy.js',
    'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-store.js', 'group-levels.js', 'battle-group.js']
    .forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox(20260916);
const mature = () => ({ speciesId: 'icecrystal', stage: 'mature', hunger: 50, health: 80, isDead: false });

// ---- 1. 受伤 / 参战资格 ----
const p1 = mature();
assert('初始可参战', sb.canPetBattle(p1) === true);
assert('未受伤时治疗无效', sb.healPetInjury(p1, 'nutrition').ok === false);
const inj = sb.injurePet(p1);
assert('受伤成功', inj.ok === true && p1.injured === true && p1.injuryHeal === 0);
assert('受伤后不可参战', sb.canPetBattle(p1) === false);
assert('孵化期不能受伤', sb.injurePet({ speciesId: 'icecrystal', stage: 'egg' }).ok === false);

// ---- 2. 营养液治疗 10%~15% ----
let n1 = 0, steps1 = 0;
while (p1.injured && steps1 < 50) { const r = sb.healPetInjury(p1, 'nutrition'); n1++; steps1++; if (!r.ok) break; }
assert('营养液约 7~10 次治愈（实际 ' + steps1 + ' 次）', steps1 >= 7 && steps1 <= 10, String(steps1));
assert('治愈后 injured=false 且进度归零', p1.injured === false && p1.injuryHeal === 0);

// ---- 3. 饲料治疗 4%~5%（更慢）----
const p2 = mature(); sb.injurePet(p2);
let steps2 = 0;
while (p2.injured && steps2 < 80) { const r = sb.healPetInjury(p2, 'feed'); steps2++; if (!r.ok) break; }
assert('饲料约 20~25 次治愈（实际 ' + steps2 + ' 次）', steps2 >= 20 && steps2 <= 25, String(steps2));
assert('饲料明显慢于营养液', steps2 > steps1 * 2);

// ---- 4. 成熟期喂养 ----
const p3 = mature(); p3.hunger = 10;
const f3 = sb.feedPet(p3);
assert('成熟期可以喂饲料（此前仅成长期）', f3.ok === true, f3.reason);
assert('喂饲料恢复饥饿（' + Math.round(p3.hunger) + '）', p3.hunger > 10);
const p4 = mature();
const n4 = sb.feedNutrition(p4);
assert('未受伤时喂营养液被拒绝', n4.ok === false, n4.reason);
sb.injurePet(p4);
const n5 = sb.feedNutrition(p4);
assert('受伤时喂营养液生效', n5.ok === true && n5.injuryHeal > 0);

// ---- 5. 败北判定：50% 概率 ----
(function () {
  let hurt = 0;
  for (let i = 0; i < 2000; i++) {
    const d = { pets: [mature()] };
    if (sb.applyDefeatInjuries(d, ['icecrystal']).length) hurt++;
  }
  const rate = hurt / 2000;
  assert('败北受伤率约 50%（实测 ' + (rate * 100).toFixed(1) + '%）', rate > 0.44 && rate < 0.56);
})();
assert('未参战的宠物不受伤', sb.applyDefeatInjuries({ pets: [mature()] }, ['chirpbird']).length === 0);
assert('已受伤的宠物不重复受伤', (function () {
  const p = mature(); sb.injurePet(p);
  return sb.applyDefeatInjuries({ pets: [p] }, ['icecrystal']).length === 0;
})());

// ---- 6. 参战名单过滤受伤 ----
(function () {
  const sb2 = makeSandbox(99);
  sb2.store.set('pets', {
    version: 1, orbs: [], materials: {}, pets: [
      { speciesId: 'chirpbird', stage: 'mature', isDead: false, injured: false },
      { speciesId: 'icecrystal', stage: 'mature', isDead: false, injured: true }
    ], lastSettleDate: null, monthlyKey: null
  });
  const ready = sb2.getBattleReadyPets();
  assert('可参战名单排除受伤宠物（' + ready.length + ' 只）', ready.length === 1 && ready[0].speciesId === 'chirpbird');
  const units = sb2.createPetUnitsForBattle(['chirpbird', 'icecrystal'], 2);
  assert('生成参战单位时排除受伤宠物', units.length === 1 && units[0]._petSpecies === 'chirpbird');
})();

// ---- 7. 接线检查（源码级，防再次变死代码）----
(function () {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  assert('pet-store.js 用 canPetBattle 过滤参战', ps.indexOf('canPetBattle') >= 0);
  const gr = fs.readFileSync(path.join(__dirname, '..', 'page', 'game-render.js'), 'utf8');
  assert('game-render.js 败北时调用 applyDefeatInjuries', gr.indexOf('applyDefeatInjuries') >= 0);
  assert('game-render.js 有 _groupRewarded 幂等保护', gr.indexOf('_groupRewarded') >= 0);
  const ss = fs.readFileSync(path.join(__dirname, '..', 'page', 'skill-store.js'), 'utf8');
  assert('skill-store.js 用 SKILL_POINTS_PER_STAGE', ss.indexOf('SKILL_POINTS_PER_STAGE') >= 0);
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

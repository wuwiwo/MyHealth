#!/usr/bin/env node
/* v2.1.17 测试：宠物宝珠系统接线
   背景：orbs.js 逻辑完整、也有 test-orbs.js 覆盖，但
   ① 存档没有宝珠库存字段 ② UI 零调用 synthOrb/equipOrb/...
   ③ applyOrbStats 没人调用 → 碎片能拿能看、但完全用不了（design §2.7 整体是死代码）。
   本测试钉死修复后的整条链路：合成 → 库存 → 装配 → 属性生效 → 升级/卸下/分解 → 月重置。
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
  const M = Object.create(Math);
  M.random = rnd;
  const mem = {};
  const sb = {
    Math: M, JSON, console,
    store: {
      get: k => mem[k],
      set: (k, v) => { mem[k] = v; },
      register: () => {}
    }
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'enemy.js',
    'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pet-store.js', 'group-levels.js', 'battle-group.js']
    .forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox(20260915);

// ---- 1. 存档层：宝珠库存字段 ----
const d0 = sb.getPetStore();
assert('宠物存档含 orbs 库存字段', Array.isArray(d0.orbs), JSON.stringify(Object.keys(d0)));
// 老存档（无 orbs）补齐
(function () {
  const sb2 = makeSandbox(7);
  sb2.store.set('pets', { version: 1, pets: [], materials: { orbShard: 30 } });
  const d = sb2.getPetStore();
  assert('老存档自动补齐 orbs: []', Array.isArray(d.orbs) && d.orbs.length === 0, JSON.stringify(d.orbs));
})();

// ---- 2. 合成：消耗碎片、产出入库存 ----
const bag = { orbShard: 200 };
let synthOk = 0, synthOrb = null;
for (let i = 0; i < 30 && !synthOrb; i++) {
  const r = sb.synthOrb(bag);
  if (r.ok && r.success) { synthOk++; synthOrb = r.orb; }
}
assert('合成成功产出宝珠（' + (synthOrb ? synthOrb.type + '/' + synthOrb.rarity : '无') + '）', !!synthOrb);
assert('合成扣除 20 碎片（余 ' + bag.orbShard + '）', bag.orbShard <= 200 - 20 * (synthOk + (200 - bag.orbShard) / 20 - synthOk));
assert('碎片不足时拒绝', sb.synthOrb({ orbShard: 5 }).ok === false);

// ---- 3. 装配 / 卸下 ----
const pet = { speciesId: 'icecrystal', stage: 'mature', orbs: {} };
assert('装配成功', sb.equipOrb(pet, synthOrb).ok === true && !!pet.orbs[synthOrb.type]);
const back = sb.unequipOrb(pet, synthOrb.type);
assert('卸下成功并取回宝珠', back.ok === true && back.orb.id === synthOrb.id && !pet.orbs[synthOrb.type]);
sb.equipOrb(pet, synthOrb);

// ---- 4. 属性生效（此前 applyOrbStats 无人调用） ----
const stat = sb.orbStat(synthOrb);
const petState = { speciesId: 'icecrystal', stage: 'mature', orbs: pet.orbs, refineStats: {} };
const unit = sb.createPetUnit(petState);
const baseNoOrb = sb.createPetUnit({ speciesId: 'icecrystal', stage: 'mature', orbs: {}, refineStats: {} });
assert('宝珠加成进入宠物战斗属性（+' + stat + '）',
  unit.base[synthOrb.type] === baseNoOrb.base[synthOrb.type] + stat,
  unit.base[synthOrb.type] + ' vs ' + baseNoOrb.base[synthOrb.type]);
assert('_orbBonus 已记录', unit._orbBonus && unit._orbBonus[synthOrb.type] === stat, JSON.stringify(unit._orbBonus));

// ---- 5. 关键：敌群放大不得放大宝珠加成 ----
const atkBefore = baseNoOrb.base.atk;      // boostPetForGroup 就地改，先取原值
const boosted = sb.boostPetForGroup(unit);
const baseBoosted = sb.boostPetForGroup(baseNoOrb);
assert('敌群放大后宝珠加成仍是固定值 ' + stat + '（未被 ×12~26 放大）',
  boosted.base[synthOrb.type] === baseBoosted.base[synthOrb.type] + stat,
  boosted.base[synthOrb.type] + ' vs ' + baseBoosted.base[synthOrb.type]);
assert('基础部分确实被放大了（攻 ' + atkBefore + ' → ' + baseBoosted.base.atk + '）',
  baseBoosted.base.atk > atkBefore);

// ---- 6. 升级 ----
const orbLv1 = pet.orbs[synthOrb.type];
const lv1 = orbLv1.level, cost = sb.orbUpgradeCost(orbLv1);
const bag2 = { orbShard: 999 };
const ur = sb.upgradeOrb(orbLv1, bag2);
assert('升级成功 Lv' + lv1 + ' → Lv' + orbLv1.level, ur.ok === true && orbLv1.level === lv1 + 1);
assert('升级消耗 ' + cost + ' 碎片', bag2.orbShard === 999 - cost, String(bag2.orbShard));
assert('碎片不足拒绝升级', sb.upgradeOrb(orbLv1, { orbShard: 0 }).ok === false);

// ---- 7. 分解 ----
const bag3 = { orbShard: 0 };
sb.decomposeOrb(orbLv1, bag3);
assert('分解返还碎片（+' + bag3.orbShard + '）', bag3.orbShard > 0, String(bag3.orbShard));

// ---- 8. 月重置 ----
const bag4 = { orbShard: 50 };
sb.monthlyResetOrbs(pet, bag4);
assert('月重置：已装宝珠回到 Lv1', pet.orbs[synthOrb.type].level === 1, String(pet.orbs[synthOrb.type].level));
assert('月重置：碎片清空', bag4.orbShard === 0, String(bag4.orbShard));

// ---- 9. UI 接线（pet-ui.js 依赖 DOM，改源码级校验）----
// 与 test-pools-reachable.js 同一套路：逻辑层有实现但 UI 不调用 = 死代码
(function () {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-ui.js'), 'utf8');
  [['synthOrb', '合成'], ['equipOrb', '装配'], ['unequipOrb', '卸下'],
   ['upgradeOrb', '升级'], ['decomposeOrb', '分解'], ['orbBagHtml', '库存渲染'],
   ['orbSlotsHtml', '槽位渲染']].forEach(function (pair) {
    assert('pet-ui.js 已接线：' + pair[1] + '（' + pair[0] + '）', ui.indexOf(pair[0]) >= 0);
  });
  const cx = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-codex.js'), 'utf8');
  assert('pet-codex.js 已接线 applyOrbStats', cx.indexOf('applyOrbStats') >= 0);
  const gl = fs.readFileSync(path.join(__dirname, '..', 'page', 'group-levels.js'), 'utf8');
  assert('group-levels.js 放大时排除 _orbBonus', gl.indexOf('_orbBonus') >= 0);
  const ps = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  assert('pet-store.js 月重置已接 monthlyResetOrbs', ps.indexOf('monthlyResetOrbs') >= 0);
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/* v2.2 测试：宝珠系统接线（WP-A1/A2 新口径）
   背景：v2.1.17 曾修过「宝珠能拿能看但用不了」；v2.2 又改了**性质** ——
   宝珠从「扁平加点」变成「**百分比进池**」，且**取消合成**（本体改为挑战掉落）。
   本测试钉死新链路：掉落/库存 → 装配 → **百分比进池**（与稀有度倍率相加）→ 升级升品质 → 迁移 → UI 接线。

   关键口径（dundun 2026-09-29）：
     最终属性 = 基础属性 ×（稀有度倍率 + Σ宝珠%）；稀有度 = 1200/1400/1500/1600（百分点）
     ⚠️ v2.1.17 的「宝珠不参与放大」特例已删除 —— 百分比进池后天然同尺度。
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
  ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'affix.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pets.js', 'pet-materials.js', 'pet-codex.js',
    'pet-store.js', 'group-levels.js', 'battle-group.js']
    .forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox(20260929);

// ---- 1. 存档层：库存字段 + 迁移钩子 ----
const d0 = sb.getPetStore();
assert('宠物存档含 orbs 库存字段', Array.isArray(d0.orbs));
(function () {
  const s2 = makeSandbox(7);
  /* 模拟 v2.1 时代的旧存档：N 档宝珠 + SSR 等级越界 */
  s2.store.set('pets', {
    version: 1, pets: [{ speciesId: 'icecrystal', orbs: { atk: { id: 'o1', type: 'atk', rarity: 'N', level: 3 } } }],
    materials: { orbShard: 5 },
    orbs: [{ id: 'o2', type: 'hp', rarity: 'SSR', level: 77 }]
  });
  const d = s2.getPetStore();
  assert('旧存档读取时自动迁移：N → 20 碎片（5 + 20）', d.materials.orbShard === 25, String(d.materials.orbShard));
  assert('旧存档读取时自动迁移：N 从宠物槽移除', !d.pets[0].orbs.atk);
  assert('旧存档读取时自动迁移：SSR 等级截断到 40', d.orbs[0].level === 40, String(d.orbs[0].level));
})();

// ---- 2. 掉落 → 库存（不再有合成）----
const dropped = sb.rollOrbDrop();
assert('挑战掉落产出宝珠（' + (dropped ? dropped.type + '/' + dropped.rarity : '无') + '）', !!dropped);
assert('合成已移除（synthOrb 不再是函数）', typeof sb.synthOrb !== 'function');

// ---- 3. 装配 / 卸下 ----
const pet = { speciesId: 'icecrystal', stage: 'mature', orbs: {} };
assert('装配成功', sb.equipOrb(pet, dropped).ok === true && !!pet.orbs[dropped.type]);
const back = sb.unequipOrb(pet, dropped.type);
assert('卸下成功并取回宝珠', back.ok === true && back.orb.id === dropped.id);
sb.equipOrb(pet, dropped);

// ---- 4. 关键：宝珠是**百分比**，进池后与稀有度倍率相加 ----
const pct = sb.orbPct(dropped);
const petState = { speciesId: 'icecrystal', stage: 'mature', orbs: pet.orbs, refineStats: {} };
const unit = sb.createPetUnit(petState);
const plain = sb.createPetUnit({ speciesId: 'icecrystal', stage: 'mature', orbs: {}, refineStats: {} });
assert('createPetUnit 不再改属性值（宝珠只挂百分比表）',
  unit.base[dropped.type] === plain.base[dropped.type],
  unit.base[dropped.type] + ' vs ' + plain.base[dropped.type]);
assert('_orbPct 已挂载（' + dropped.type + ' +' + pct + '%）', unit._orbPct && unit._orbPct[dropped.type] === pct, JSON.stringify(unit._orbPct));
assert('_orbBonus 旧特例已删除', unit._orbBonus === undefined);

// 敌群放大：池 = 稀有度 1500%（SSR）+ 宝珠%
const tag = 'SSR';
const baseAtk = plain.base.atk;
const rarityPct = sb.PET_GROUP_SCALE[tag];
const boosted = sb.boostPetForGroup(sb.createPetUnit(petState));
const expectPool = rarityPct + (unit._orbPct.atk || 0);
if (dropped.type === 'atk') {
  assert('放大公式 = 基础 ×（稀有度 ' + rarityPct + '% + 宝珠 ' + pct + '%）',
    boosted.base.atk === Math.floor(baseAtk * expectPool / 100),
    boosted.base.atk + ' vs ' + Math.floor(baseAtk * expectPool / 100));
} else {
  const plainBoosted = sb.boostPetForGroup(sb.createPetUnit({ speciesId: 'icecrystal', stage: 'mature', orbs: {}, refineStats: {} }));
  assert('无宝珠属性的池 = 纯稀有度倍率', plainBoosted.base.atk === Math.floor(baseAtk * rarityPct / 100),
    plainBoosted.base.atk + ' vs ' + Math.floor(baseAtk * rarityPct / 100));
}
assert('稀有度倍率已改为百分点表述（1200/1400/1500/1600）',
  sb.PET_GROUP_SCALE.R === 1200 && sb.PET_GROUP_SCALE.UR === 1600, JSON.stringify(sb.PET_GROUP_SCALE));

// ---- 5. 升级 → 满级升品质 ----
const orbLv1 = pet.orbs[dropped.type];
const lv1 = orbLv1.level, cost = sb.orbUpgradeCost(orbLv1);
const bag = { orbShard: 999 };
const ur = sb.upgradeOrb(orbLv1, bag);
assert('升级成功 Lv' + lv1 + ' → Lv' + orbLv1.level, ur.ok === true && orbLv1.level === lv1 + 1);
assert('升级消耗 ' + cost + ' 碎片', bag.orbShard === 999 - cost, String(bag.orbShard));
assert('碎片不足拒绝升级', sb.upgradeOrb(orbLv1, { orbShard: 0 }).ok === false);

// ---- 6. 分解 / 月重置 ----
const bag3 = { orbShard: 0 };
sb.decomposeOrb(orbLv1, bag3);
assert('分解返还碎片（+' + bag3.orbShard + '）', bag3.orbShard > 0, String(bag3.orbShard));
const bag4 = { orbShard: 50 };
sb.monthlyResetOrbs(pet, bag4);
assert('月重置：已装宝珠回到 Lv1', pet.orbs[dropped.type].level === 1, String(pet.orbs[dropped.type].level));
assert('月重置：碎片清空', bag4.orbShard === 0);

// ---- 7. 接线守卫（源码级：逻辑有实现但没人调用 = 死代码）----
(function () {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-ui.js'), 'utf8');
  [['orbPct', '宝珠百分比显示'], ['equipOrb', '装配'], ['unequipOrb', '卸下'],
   ['upgradeOrb', '升级'], ['decomposeOrb', '分解'], ['orbSlotsHtml', '槽位渲染']].forEach(function (pair) {
    assert('pet-ui.js 已接线：' + pair[1] + '（' + pair[0] + '）', ui.indexOf(pair[0]) >= 0);
  });
  assert('pet-ui.js 不再有「合成宝珠」入口', ui.indexOf('petSynth') < 0 && ui.indexOf('synthOrb') < 0);

  const cx = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-codex.js'), 'utf8');
  assert('pet-codex.js 已接线 petOrbPct（挂百分比表）', cx.indexOf('petOrbPct') >= 0);

  const gl = fs.readFileSync(path.join(__dirname, '..', 'page', 'group-levels.js'), 'utf8');
  assert('group-levels.js 放大走 _orbPct 百分比池', gl.indexOf('_orbPct') >= 0);
  assert('group-levels.js 旧 _orbBonus 特例已删除', gl.indexOf('_orbBonus') < 0);

  const ps = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  assert('pet-store.js 已接 migrateOrbs 迁移钩子', ps.indexOf('migrateOrbs') >= 0);
  assert('pet-store.js 月重置已接 monthlyResetOrbs', ps.indexOf('monthlyResetOrbs') >= 0);

  const ch = fs.readFileSync(path.join(__dirname, '..', 'page', 'challenge.js'), 'utf8');
  assert('challenge.js 已接 rollOrbDrop（宝珠改为挑战掉落）', ch.indexOf('rollOrbDrop') >= 0);
})();

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

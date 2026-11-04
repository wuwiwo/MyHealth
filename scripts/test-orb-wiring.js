#!/usr/bin/env node
/* v2.2 / v2.15 测试：宝珠系统接线（WP-A1/A2 口径 + v2.15 裁决）
   背景：v2.1.17 曾修过「宝珠能拿能看但用不了」；v2.2 改了**性质** ——
   宝珠从「扁平加点」变成「**百分比进池**」，本体改为挑战掉落（当时取消合成）。
   **v2.15 作者裁决**：分解返还改为「等价碎片」（= 加成百分点）、**恢复合成**
   （20 碎片 → 随机 R·Lv1，100% 成功，每日 5 次）、宝珠增加图标、培养页精简 + 阵容常驻。
   本测试钉死新链路：掉落/库存/合成 → 装配 → **百分比进池**（与稀有度倍率相加）
   → 升级升品质 → 分解/迁移 → UI 接线（含图标与培养页阵容）。

   关键口径（dundun 2026-09-29）：
     最终属性 = 基础属性 ×（稀有度倍率 + Σ宝珠%）；稀有度 = 1200/1400/1500/1600（百分点）
     ⚠️ v2.1.17 的「宝珠不参与放大」特例已删除 —— 百分比进池后天然同尺度。
   ⚠️ v2.15 之前本套件有一条反向断言「合成已移除（synthOrb 不再是函数）」，
      随恢复合成改为「合成已恢复」并补存档 / 每日计数 / 图标接线守卫。
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

// ---- 2. 掉落 → 库存（v2.15 恢复合成）----
const dropped = sb.rollOrbDrop();
assert('挑战掉落产出宝珠（' + (dropped ? dropped.type + '/' + dropped.rarity : '无') + '）', !!dropped);
assert('合成已恢复（synthOrb 是函数）', typeof sb.synthOrb === 'function');
assert('合成经济常量已暴露（20 / 5 / R）',
  sb.ORB_SYNTH_COST === 20 && sb.ORB_SYNTH_DAILY_LIMIT === 5 && sb.ORB_SYNTH_RARITY === 'R',
  JSON.stringify([sb.ORB_SYNTH_COST, sb.ORB_SYNTH_DAILY_LIMIT, sb.ORB_SYNTH_RARITY]));
assert('合成计数 / 状态函数已暴露',
  typeof sb.orbSynthState === 'function' && typeof sb.orbSynthStatus === 'function'
  && typeof sb.orbDecomposeShards === 'function' && typeof sb.randomOrbType === 'function');
/* 存档层：orbSynth 放在 pets 存档对象内部（不新增 store key → 云同步自动派生 keys 覆盖）。 */
assert('pets 默认存档含 orbSynth 计数对象',
  d0.orbSynth && d0.orbSynth.dayKey === null && d0.orbSynth.count === 0, JSON.stringify(d0.orbSynth));
(function () {
  const s3 = makeSandbox(11);
  /* 旧档没有 orbSynth → 优雅补空计数，不追溯补偿、不改其它字段 */
  s3.store.set('pets', { version: 1, pets: [], materials: { orbShard: 7 }, orbs: [], battlePicks: [] });
  const old = s3.getPetStore();
  assert('旧档缺 orbSynth → 优雅补 { dayKey:null, count:0 }（不补偿）',
    old.orbSynth && old.orbSynth.dayKey === null && old.orbSynth.count === 0 && old.materials.orbShard === 7,
    JSON.stringify(old.orbSynth));
  /* 合成写进 data 后随 pets 存档往返（savePetStore → getPetStore） */
  old.materials.orbShard = 20;
  const sr = s3.synthOrb(old, '2026-10-11');
  s3.savePetStore(old);
  const back2 = s3.getPetStore();
  assert('合成结果随 pets 存档往返（碎片 / 库存 / 每日计数）',
    sr.ok === true && back2.materials.orbShard === 0 && back2.orbs.length === 1
    && back2.orbSynth.dayKey === '2026-10-11' && back2.orbSynth.count === 1,
    JSON.stringify({ shards: back2.materials.orbShard, n: back2.orbs.length, st: back2.orbSynth }));
})();

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

// ---- 6. 分解（v2.15 等价碎片）/ 月重置 ----
const bag3 = { orbShard: 0 };
const expectDec = sb.orbPct(orbLv1);
const decR = sb.decomposeOrb(orbLv1, bag3);
assert('分解返还 = 加成百分点（等价碎片，+' + bag3.orbShard + '）',
  bag3.orbShard === expectDec && decR.shards === expectDec && decR.pct === expectDec,
  'got=' + bag3.orbShard + ' expect=' + expectDec);
assert('分解返还基准：R·Lv1 = 10 碎片',
  sb.decomposeOrb(sb.createOrb('hp', 'R'), { orbShard: 0 }).shards === 10);
const bag4 = { orbShard: 50 };
sb.monthlyResetOrbs(pet, bag4);
assert('月重置：已装宝珠回到 Lv1', pet.orbs[dropped.type].level === 1, String(pet.orbs[dropped.type].level));
assert('月重置：碎片清空', bag4.orbShard === 0);

// ---- 7. 接线守卫（源码级：逻辑有实现但没人调用 = 死代码）----
(function () {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-ui.js'), 'utf8');
  [['orbPct', '宝珠百分比显示'], ['equipOrb', '装配'], ['unequipOrb', '卸下'],
   ['upgradeOrb', '升级'], ['decomposeOrb', '分解'], ['orbSlotsHtml', '槽位渲染'],
   ['orbDecomposeShards', '等价碎片返还'], ['orbSynthStatus', '每日合成状态'],
   ['synthOrb', '合成落盘'], ['orbIconHtml', '宝珠图标']].forEach(function (pair) {
    assert('pet-ui.js 已接线：' + pair[1] + '（' + pair[0] + '）', ui.indexOf(pair[0]) >= 0);
  });
  /* v2.15：合成入口恢复 —— 旧断言「不再有合成」反转，并钉死按钮与禁用态。 */
  assert('pet-ui.js 已恢复「合成宝珠」入口（data-orb-synth）', ui.indexOf('data-orb-synth') >= 0);
  assert('pet-ui.js 无遗留 petSynth 旧符号', ui.indexOf('petSynth') < 0);
  /* v2.15：图标单一入口 + 5 枚 SVG 资源齐全（缺一枚会让某类型回退 emoji）。 */
  assert('pet-ui.js 宝珠图标路径指向 media/orbs/', ui.indexOf("ORB_ICON_DIR = 'media/orbs/'") >= 0);
  assert('pet-ui.js 分解按钮显示实际返还数（非硬编码）', ui.indexOf('orbDecomposeShards(o)') >= 0);
  /* 修复2：升级 toast 曾读 u8.stat（upgradeOrb 没有该字段）→ 显示「+undefined」。 */
  assert('修复2：升级提示改用 u8.pct（不再出现 u8.stat）',
    ui.indexOf('u8.stat') < 0 && ui.indexOf('u8.pct') >= 0);
  assert('修复2：升品质时补报新品质（u8.promoted / u8.rarity）',
    ui.indexOf('u8.promoted') >= 0 && ui.indexOf('u8.rarity') >= 0);
  (function () {
    /* 只取 orbBagHtml 函数体：文件其它地方（互兑禁用原因）仍合法使用 .pet-mat-hint。 */
    const a = ui.indexOf('function orbBagHtml'), b = ui.indexOf('function orbSlotsHtml');
    const bagSrc = a >= 0 && b > a ? ui.slice(a, b) : '';
    assert('合成原因行用独立 .orb-synth-hint（orbBagHtml 内不复用 .pet-mat-hint）',
      bagSrc.indexOf('class="orb-synth-hint"') >= 0 && bagSrc.indexOf('pet-mat-hint') < 0);
  })();

  const cx = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-codex.js'), 'utf8');
  assert('pet-codex.js 已接线 petOrbPct（挂百分比表）', cx.indexOf('petOrbPct') >= 0);

  const gl = fs.readFileSync(path.join(__dirname, '..', 'page', 'group-levels.js'), 'utf8');
  assert('group-levels.js 放大走 _orbPct 百分比池', gl.indexOf('_orbPct') >= 0);
  assert('group-levels.js 旧 _orbBonus 特例已删除', gl.indexOf('_orbBonus') < 0);

  const ps = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  assert('pet-store.js 已接 migrateOrbs 迁移钩子', ps.indexOf('migrateOrbs') >= 0);
  assert('pet-store.js 月重置已接 monthlyResetOrbs', ps.indexOf('monthlyResetOrbs') >= 0);
  assert('pet-store.js 已存 orbSynth 每日合成计数（pets 存档内，不新增 store key）',
    ps.indexOf('orbSynth') >= 0);
  assert('pet-store.js 材料来源已改为「分解宝珠返还（等价碎片）」',
    ps.indexOf('分解宝珠返还（等价碎片）') >= 0);

  const ch = fs.readFileSync(path.join(__dirname, '..', 'page', 'challenge.js'), 'utf8');
  assert('challenge.js 已接 rollOrbDrop（宝珠改为挑战掉落）', ch.indexOf('rollOrbDrop') >= 0);
  assert('challenge.js 结算面板已接宝珠图标 orbIconHtml', ch.indexOf('orbIconHtml(state.orbReward.type') >= 0);

  /* v2.15 培养页：出战阵容常驻 + 材料/获取记录默认折叠 + 就地切换 / 开战接线。 */
  const gv = fs.readFileSync(path.join(__dirname, '..', 'page', 'game-views.js'), 'utf8');
  assert('game-views.js 培养页有常驻 train-lineup 阵容卡', gv.indexOf('class="train-lineup"') >= 0);
  assert('game-views.js 阵容芯片用 data-train-pick 就地切换', gv.indexOf('data-train-pick') >= 0);
  assert('game-views.js 培养页有 #trainStartBattle 开战入口', gv.indexOf('trainStartBattle') >= 0);
  assert('game-views.js 开战走唯一入口 startGroupTrialWithPets', gv.indexOf('startGroupTrialWithPets(stage') >= 0);
  assert('game-views.js 材料区默认折叠（<details class="train-mat-fold">）',
    gv.indexOf('<details class="train-mat-fold">') >= 0);
  assert('game-views.js 阵容选择落盘 savePetBattlePicks（与 pet-ui 同源）',
    gv.indexOf('savePetBattlePicks(_petBattlePicks)') >= 0);

  const css = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.css'), 'utf8');
  ['.orb-ico', '.orb-bag', '.orb-stock', '.train-lineup', '.train-mat-fold', '.pet-rest'].forEach(function (c) {
    assert('index.css 已补 v2.15 样式：' + c, css.indexOf(c) >= 0);
  });
  /* 5 枚宝珠 SVG 与 ORB_TYPES 一一对应（文件名 = type + '.svg'）。 */
  Object.keys(sb.ORB_TYPES).forEach(function (t) {
    const f = path.join(__dirname, '..', 'page', 'media', 'orbs', t + '.svg');
    assert('宝珠图标资源存在：media/orbs/' + t + '.svg', fs.existsSync(f));
  });
  /* 图标与库存都只允许 32px（16 的倍数，crispEdges 格宽均匀）。 */
  assert('pet-ui.js 宝珠图标只用 32px（不用 24px 非 16 倍数）',
    ui.indexOf('orbIconHtml(t, 32)') >= 0 && ui.indexOf('orbIconHtml(t, 24)') < 0);
})();

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

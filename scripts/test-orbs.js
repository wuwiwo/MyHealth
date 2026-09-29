#!/usr/bin/env node
/* M6 测试：宝珠系统（**v2.2 WP-A2 新口径**）
   1) 5 类型 + 品质链 R/SR/SSR/UR（**N 档已删**）
   2) 单颗加成 = 起始 + (等级−1)×每级（百分点），封顶 +300%
   3) 升级消耗碎片；**满级自动升品质**（R→SR→SSR→UR）
   4) 分解返还碎片
   5) 装配 / 卸下 / petOrbPct 汇总
   6) 月重置（等级回 1、品质保留、碎片清空）
   7) 掉落（品质分布、无 N）
   8) 存量迁移（N → 20 碎片/颗；等级超上限截断；宠物槽同步）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js',
  'skill.js', 'enemy.js', 'pets.js', 'pet-materials.js', 'pet-codex.js', 'orbs.js'];
const sb = { Math, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 类型与品质链 ----
assert('5 类型', Object.keys(sb.ORB_TYPES).length === 5);
assert('品质链 R,SR,SSR,UR', sb.ORB_QUALITIES.join(',') === 'R,SR,SSR,UR', sb.ORB_QUALITIES.join(','));
assert('N 档已从规格删除', !sb.ORB_QUALITY_SPEC.N);
assert('单颗封顶 +300%', sb.ORB_PCT_CAP === 300);

// ---- 2. 单颗加成（百分点） ----
const r1 = sb.createOrb('hp', 'R');
assert('R Lv1 = +10%', sb.orbPct(r1) === 10, String(sb.orbPct(r1)));
r1.level = 10;
assert('R Lv10 = +19%（10 + 9×1）', sb.orbPct(r1) === 19, String(sb.orbPct(r1)));
const ur = sb.createOrb('atk', 'UR');
ur.level = 50;
assert('UR Lv50 = +297%（≈ +300%）', sb.orbPct(ur) === 297, String(sb.orbPct(ur)));
ur.level = 99;
assert('等级越界按本级上限截断', sb.orbPct(ur) === 297, String(sb.orbPct(ur)));
const ssr = sb.createOrb('def', 'SSR');
ssr.level = 40;
assert('SSR Lv40 = +148%（70 + 39×2）', sb.orbPct(ssr) === 148, String(sb.orbPct(ssr)));

// ---- 3. 升级 + 满级自动升品质 ----
const bag = { orbShard: 9999 };
const o2 = sb.createOrb('hp', 'R');
const cost1 = sb.orbUpgradeCost(o2);
const up1 = sb.upgradeOrb(o2, bag);
assert('升级消耗 =（等级+1）×2 = ' + cost1, up1.ok === true && bag.orbShard === 9999 - cost1, String(bag.orbShard));
o2.level = 10;
const up2 = sb.upgradeOrb(o2, bag);
assert('R 满 10 级再升 → 升品质 SR 且等级回 1',
  up2.promoted === true && o2.rarity === 'SR' && o2.level === 1, JSON.stringify({ r: o2.rarity, lv: o2.level }));
assert('升品质后加成连续（R 满 19% → SR Lv1 20%）', sb.orbPct(o2) === 20, String(sb.orbPct(o2)));
const urMax = sb.createOrb('atk', 'UR');
urMax.level = 50;
assert('UR 满级不可再升', sb.upgradeOrb(urMax, bag).ok === false);
assert('碎片不足拒绝升级', sb.upgradeOrb(sb.createOrb('hp', 'R'), { orbShard: 0 }).ok === false);

// ---- 4. 分解 ----
const dec = sb.decomposeOrb(sb.createOrb('atk', 'SR'), { orbShard: 0 });
assert('分解 SR 返还 10 碎片', dec.ok === true && dec.shards === 10, 'shards=' + dec.shards);

// ---- 5. 装配 / 卸下 / 汇总 ----
const pet = sb.createPet({ speciesId: 'icecrystal', rarity: 'SSR', name: '宠' });
sb.equipOrb(pet, sb.createOrb('atk', 'R'));
sb.equipOrb(pet, sb.createOrb('hp', 'SR'));
assert('装配 2 颗', !!(pet.orbs.atk && pet.orbs.hp));
sb.equipOrb(pet, sb.createOrb('atk', 'UR'));
assert('同类型覆盖', pet.orbs.atk.rarity === 'UR');
assert('卸下', sb.unequipOrb(pet, 'hp').ok === true && !pet.orbs.hp);
pet.orbs = { atk: sb.createOrb('atk', 'R'), hp: sb.createOrb('hp', 'SR') };
const map = sb.petOrbPct(pet.orbs);
assert('petOrbPct 按属性汇总（atk +10 / hp +20）', map.atk === 10 && map.hp === 20, JSON.stringify(map));

// ---- 6. 月重置 ----
const o6 = sb.createOrb('hp', 'SR');
o6.level = 12;
pet.orbs = { hp: o6 };
const bag6 = { orbShard: 50 };
sb.monthlyResetOrbs(pet, bag6);
assert('月重置：等级回 1（品质保留 SR）', pet.orbs.hp.level === 1 && pet.orbs.hp.rarity === 'SR');
assert('月重置：碎片清空', bag6.orbShard === 0);

// ---- 7. 掉落 ----
const seen = {};
for (let i = 0; i < 400; i++) {
  const o = sb.rollOrbDrop();
  seen[o.rarity] = (seen[o.rarity] || 0) + 1;
}
assert('掉落含 R 与 SR', seen.R > 0 && seen.SR > 0, JSON.stringify(seen));
assert('掉落绝不出 N 档', !seen.N, JSON.stringify(seen));
assert('稀有的 SSR/UR 也能出', (seen.SSR || 0) + (seen.UR || 0) > 0, JSON.stringify(seen));

// ---- 8. 存量迁移 ----
/* ⚠️ 用**字面量**构造旧存档宝珠：新模型下 createOrb 已造不出 N 档（会自动归一成 R） */
const data = {
  orbs: [
    { id: 'old-n', type: 'atk', rarity: 'N', level: 3 },        // N → 20 碎片
    { id: 'old-ssr', type: 'hp', rarity: 'SSR', level: 99 },    // 超上限 → 截断 40
    { id: 'old-sr', type: 'def', rarity: 'SR', level: 12 }      // 正常 → 等级保号
  ],
  materials: { orbShard: 0 },
  pets: [{ orbs: { atk: { id: 'old-n2', type: 'atk', rarity: 'N', level: 1 } } }]
};
const mig = sb.migrateOrbs(data);
assert('迁移：N 档 2 颗 → 40 碎片', mig.dropped === 2 && data.materials.orbShard === 40, JSON.stringify(mig));
assert('迁移：库存只剩 2 颗（N 已移除）', data.orbs.length === 2, 'len=' + data.orbs.length);
assert('迁移：SSR 等级 99 → 截断 40', mig.clamped === 1 && data.orbs[0].level === 40, 'lv=' + data.orbs[0].level);
assert('迁移：SR 等级保号 12', data.orbs[1].level === 12, 'lv=' + data.orbs[1].level);
assert('迁移：宠物槽里的 N 也被清掉', !data.pets[0].orbs.atk);
assert('迁移幂等（再跑一次无事发生）', (function () {
  const again = sb.migrateOrbs(data);
  return again.dropped === 0 && again.clamped === 0 && data.orbs.length === 2;
})());

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

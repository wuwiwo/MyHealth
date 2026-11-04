#!/usr/bin/env node
/* M6 测试：宝珠系统（**v2.2 WP-A2 口径 + v2.15 裁决**）
   1) 5 类型 + 品质链 R/SR/SSR/UR（**N 档已删**）
   2) 单颗加成 = 起始 + (等级−1)×每级（百分点），封顶 +300%
   3) 升级消耗碎片；**满级自动升品质**（R→SR→SSR→UR）
   4) **v2.15 分解：返还 = 该宝珠的加成百分点数（等价碎片）**，R·Lv1 = 10 基准
   5) 装配 / 卸下 / petOrbPct 汇总
   6) 月重置（等级回 1、品质保留、碎片清空）
   7) 掉落（品质分布、无 N）
   8) 存量迁移（N → 20 碎片/颗；等级超上限截断；宠物槽同步）
   9) **v2.15 合成**：20 碎片 → 随机 R·Lv1（100% 成功 / 每日 5 次 / 跨日重置 / 失败不扣）
   ⚠️ v2.15 之前 §4 断言「分解 SR 返还 10 碎片」是旧 ORB_DECOMPOSE 品质定额表
      （R8/SR10/SSR20/UR40、不看等级），该表已删除，本套件改为等价碎片口径。
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

// ---- 4. 分解（v2.15 等价碎片：返还 = 该宝珠加成百分点数 = orbPct） ----
/* 作者基准：R 品质·Lv1 → 10 碎片；更高品质 / 更高等级逐步提升，返还「等价碎片」。
   实现刻意不另建数值表，直接复用 orbPct() → ORB_QUALITY_SPEC 仍是唯一来源。 */
const decR1 = sb.decomposeOrb(sb.createOrb('atk', 'R'), { orbShard: 0 });
assert('基准：R·Lv1 分解 = 10 碎片', decR1.ok === true && decR1.shards === 10, 'shards=' + decR1.shards);
assert('分解结果同时回报 pct（与 shards 同源）', decR1.pct === 10 && decR1.rarity === 'R', JSON.stringify(decR1));
const oneR = sb.createOrb('hp', 'R');
assert('orbDecomposeShards === orbPct（等价碎片唯一来源）',
  sb.orbDecomposeShards(oneR) === sb.orbPct(oneR), String(sb.orbDecomposeShards(oneR)));
/* 品质 / 等级二维表：逐格核对「加成多少 % 就返还多少碎片」。 */
const DEC_CASES = [
  ['R', 1, 10], ['R', 10, 19],
  ['SR', 1, 20], ['SR', 25, 68],
  ['SSR', 1, 70], ['SSR', 40, 148],
  ['UR', 1, 150], ['UR', 50, 297]
];
DEC_CASES.forEach(function (c) {
  const o = sb.createOrb('hp', c[0]);
  o.level = c[1];
  const bag = { orbShard: 0 };
  const r = sb.decomposeOrb(o, bag);
  assert('分解 ' + c[0] + '·Lv' + c[1] + ' → ' + c[2] + ' 碎片（= +' + c[2] + '%）',
    r.ok === true && r.shards === c[2] && bag.orbShard === c[2] && r.pct === c[2],
    'shards=' + r.shards);
});
/* 单调性：同 Lv1 品质越高返还越多；同品质等级越高返还越多（不因封顶而回落）。 */
const qLv1 = sb.ORB_QUALITIES.map(function (q) { return sb.orbDecomposeShards(sb.createOrb('hp', q)); });
assert('单调：R<SR<SSR<UR（Lv1 品质链）',
  qLv1[0] < qLv1[1] && qLv1[1] < qLv1[2] && qLv1[2] < qLv1[3], qLv1.join(','));
(function () {
  const o = sb.createOrb('hp', 'UR');
  let prev = -1, mono = true;
  for (let lv = 1; lv <= 50; lv++) {
    o.level = lv;
    const n = sb.orbDecomposeShards(o);
    if (n <= prev) mono = false;
    prev = n;
  }
  assert('单调：UR Lv1→Lv50 返还严格递增（297 封顶不回落）', mono && prev === 297, 'last=' + prev);
})();
assert('分解封顶与 orbPct 一致（不会超过 +300%）',
  (function () { const o = sb.createOrb('hp', 'UR'); o.level = 99; return sb.orbDecomposeShards(o) === 297; })());

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

// ---- 9. v2.15 合成：20 碎片 → 随机 R·Lv1（100% 成功 / 每日 5 次） ----
assert('合成经济：消耗 20 碎片', sb.ORB_SYNTH_COST === 20, String(sb.ORB_SYNTH_COST));
assert('合成经济：每日上限 5 次', sb.ORB_SYNTH_DAILY_LIMIT === 5, String(sb.ORB_SYNTH_DAILY_LIMIT));
assert('合成经济：产出恒 R 品质', sb.ORB_SYNTH_RARITY === 'R', String(sb.ORB_SYNTH_RARITY));
/* todayKey 由 UI 注入，orbs.js 不碰 Date → 跨日靠 dayKey 读时归零，无定时任务。 */
assert('orbSynthState：空存档 / 无 orbSynth → count 0',
  sb.orbSynthState({}, '2026-10-11').count === 0);
assert('orbSynthState：旧 dayKey 读时归零（跨日重置）',
  sb.orbSynthState({ orbSynth: { dayKey: '2026-10-10', count: 4 } }, '2026-10-11').count === 0);
assert('orbSynthState：当日计数保留', sb.orbSynthState(
  { orbSynth: { dayKey: '2026-10-11', count: 3 } }, '2026-10-11').count === 3);
assert('orbSynthState：脏数据（负数 / 超上限 / 非整数）夹紧到 [0,5]',
  sb.orbSynthState({ orbSynth: { dayKey: '2026-10-11', count: -7 } }, '2026-10-11').count === 0
  && sb.orbSynthState({ orbSynth: { dayKey: '2026-10-11', count: 999 } }, '2026-10-11').count === 5
  && sb.orbSynthState({ orbSynth: { dayKey: '2026-10-11', count: 2.9 } }, '2026-10-11').count === 2);
assert('orbSynthStatus：碎片足够且未达上限 → canSynth',
  sb.orbSynthStatus({ materials: { orbShard: 20 }, orbSynth: { dayKey: '2026-10-11', count: 0 } }, '2026-10-11').canSynth === true);
assert('orbSynthStatus：碎片不足 → 明确原因且不扣次数', (function () {
  const s = sb.orbSynthStatus({ materials: { orbShard: 19 } }, '2026-10-11');
  return s.canSynth === false && s.remaining === 5 && s.count === 0 && s.reason.indexOf('碎片不足') >= 0;
})());
assert('orbSynthStatus：已达上限 → 明确原因且 remaining=0', (function () {
  const s = sb.orbSynthStatus({ materials: { orbShard: 100 }, orbSynth: { dayKey: '2026-10-11', count: 5 } }, '2026-10-11');
  return s.canSynth === false && s.remaining === 0 && s.count === 5 && s.reason.indexOf('上限') >= 0;
})());
assert('synthOrb：无存档 → 失败且不抛错', sb.synthOrb(null, '2026-10-11').ok === false);
/* 成功路径 + 100% 成功 + 每日上限 + 失败不扣碎片/不计数 + 跨日重置。 */
(function () {
  const DAY = '2026-10-11', NEXT = '2026-10-12';
  const d = { materials: { orbShard: 20 }, orbs: [] };
  const r1 = sb.synthOrb(d, DAY);
  assert('合成第 1 次：100% 成功，产出 R·Lv1', r1.ok === true && r1.rarity === 'R' && r1.level === 1,
    JSON.stringify(r1));
  assert('合成第 1 次：类型落在 5 种宝珠内', !!sb.ORB_TYPES[r1.orb.type], String(r1.orb.type));
  assert('合成第 1 次：扣 20 碎片、入库 1 颗、计数 1/5、remaining 4',
    d.materials.orbShard === 0 && d.orbs.length === 1 && r1.cost === 20
    && r1.count === 1 && r1.remaining === 4, JSON.stringify({ bag: d.materials, n: d.orbs.length, r: r1 }));
  assert('合成第 1 次：orbSynth 落盘到 data 内部（随 pets 云同步）',
    d.orbSynth && d.orbSynth.dayKey === DAY && d.orbSynth.count === 1, JSON.stringify(d.orbSynth));
  /* 碎片不足：失败不扣碎片、不计数、不入库 */
  const rFail = sb.synthOrb(d, DAY);
  assert('合成失败（碎片不足）：不扣碎片 / 不计数 / 不入库',
    rFail.ok === false && d.materials.orbShard === 0 && d.orbSynth.count === 1 && d.orbs.length === 1,
    JSON.stringify({ r: rFail, d: d }));
  /* 补足 4 次额度，全部成功（100% 成功，无随机失败分支） */
  d.materials.orbShard = sb.ORB_SYNTH_COST * 4;
  let allOk = true;
  for (let i = 0; i < 4; i++) {
    const r = sb.synthOrb(d, DAY);
    if (!r.ok) allOk = false;
  }
  assert('合成第 2~5 次：全部成功（100% 成功，无失败分支）', allOk);
  assert('合成第 5 次：计数 5/5、碎片扣光、库存 5 颗',
    d.orbSynth.count === 5 && d.materials.orbShard === 0 && d.orbs.length === 5,
    JSON.stringify({ c: d.orbSynth.count, bag: d.materials.orbShard, n: d.orbs.length }));
  /* 第 6 次即使碎片充足也拒绝，且不扣碎片 / 不计数 / 不入库 */
  d.materials.orbShard = 100;
  const r6 = sb.synthOrb(d, DAY);
  assert('第 6 次：今日上限拦截，不扣碎片 / 不计数 / 不入库',
    r6.ok === false && r6.count === 5 && r6.remaining === 0
    && d.materials.orbShard === 100 && d.orbs.length === 5,
    JSON.stringify({ r: r6, bag: d.materials.orbShard, n: d.orbs.length }));
  /* 跨日：dayKey 变化时读时归零，重新获得 5 次额度 */
  const rn = sb.synthOrb(d, NEXT);
  assert('跨日重置：新自然日可再合成，计数回到 1',
    rn.ok === true && rn.count === 1 && rn.remaining === 4
    && d.orbSynth.dayKey === NEXT && d.materials.orbShard === 80 && d.orbs.length === 6,
    JSON.stringify({ r: rn, d: d }));
  assert('跨日不追溯补偿：旧 dayKey 再次调用仍归零',
    sb.orbSynthState(d, DAY).count === 0);
})();
/* randomOrbType 与 rollOrbDrop 共用同一个随机类型入口（防两处漂移）。 */
(function () {
  const seen = {};
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const t = sb.randomOrbType();
    if (!sb.ORB_TYPES[t]) bad++;
    seen[t] = 1;
  }
  assert('randomOrbType 只返回已注册类型（400 次采样）', bad === 0, 'bad=' + bad);
  assert('randomOrbType 覆盖全部 5 种类型', Object.keys(seen).length === 5, Object.keys(seen).join(','));
})();

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

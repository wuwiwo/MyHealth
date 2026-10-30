#!/usr/bin/env node
/* v2.16 测试：宠物详情「② 属性加成」＋ 加成口径改造
   （作者裁决，**以第二段为准**：凝聚＝固定值、共鸣＝进池百分比，两者只统计【成熟期】）

   新口径（唯一真相，实现在 page/pet-store.js 的 petBonusAdditivePool ＋ page/group-levels.js 的
   boostPetForGroup）：
       凝聚 S凝聚[k] = 3% × Σ(所有【成熟期】宠物该属性 base)      （固定值，与基础相加）
       共鸣 S共鸣%   = Σ(每只【成熟期】宠物的稀有度档位)          UR 10 / SSR 8 / SR 7 / R 6（相加）
       加成合计%[k]  = 稀有度%(本宠) ＋ Σ宝珠%[k](本宠) ＋ S共鸣%
       最终[k]       = floor( (基础[k] ＋ S凝聚[k]) × 加成合计%[k] / 100 )
       速度 spd      = 基础（不参与凝聚、不参与百分比池）

   与 v2.15（凝聚/共鸣都折成「贡献值 ÷ 本宠基础」的百分比进池）的区别：
     ① 凝聚从「百分比」改回「**固定值**加在基础上」；
     ② 共鸣从「贡献值折算」改为「按稀有度**逐只相加**」；
     ③ 两者**只统计成熟期**（蛋期/成长期不计；受伤/阵亡不另外筛）。

   本套守六件事：
     1) **新口径黄金值**（写死在下面）＋ 真实引擎管道复核（建场 → 面板 → 纯函数 三链同值）；
     2) **公式自洽**：final = max(1, floor((基础＋凝聚) × 加成合计% ÷ 100)) 逐属性成立；
        速度不参与（凝聚 0、加成合计 = 100、final = 基础）；
     3) **全局常量**：S凝聚 / S共鸣% 对每只宠完全相同（含 UR vs SSR 的直接对照）；
     4) **② 段形态**：一排「凝聚固定值」＋一排「加成合计 ×N%」—— 数值 vs 百分比一眼可分；
     5) **口径单一来源 + 设计体系**：UI 只拼文本（不做乘除、不读 bd.base / bd.bench 自算、
        不引 PET_GROUP_SCALE、无新字号 / 新颜色 / 新热区）；
     6) [8] **改前（git HEAD = v2.15）× 改后**逐属性对照（真跑 HEAD 源码，不是估算）。

   Run: node scripts/test-pet-bonus-display.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'page', f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];
const BONUS_KEYS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];   // 速度不参与

/* ============================================================
   沙箱：与 test-pet-compare.js / test-pet-heal-display.js 同一套加载顺序
   （storeSrc / glSrc 可注入「改前的 pet-store.js / group-levels.js」，用于前后对照）
   ============================================================ */
function makeSandbox(opts) {
  opts = opts || {};
  let a = (opts.seed || 20261006) >>> 0;
  const rnd = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const sb = { Math: M, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => {
    const code = (f === 'pet-store.js' && opts.storeSrc) ? opts.storeSrc
      : (f === 'group-levels.js' && opts.glSrc) ? opts.glSrc : src(f);
    vm.runInContext(code, sb);
  });
  return sb;
}

/* ---- 夹具（与浏览器复验用的那份同形：14 只，含 UR 与 SSR 各一）----
   · dream（UR）：图鉴 300 ＋ 炼化 720 = **生命基础 1020** ← 作者截图里的那个基数
   · possum（SSR）：图鉴 **200** ← 作者截图里的那个基数
   · 其余 12 只做「成熟期」的一份子，各炼化 +150 生命
   · 14 只全部成熟期 → Σ共鸣 = 108%（UR 3 / SSR 4 / SR 4 / R 3 → 30+32+28+18） */
const BENCH = ['nonebear', 'kirin', 'darkcrow', 'icecrystal', 'lightspirit',
  'flamechick', 'rocksteady', 'chirpbird', 'thunderdog', 'sparkle', 'waterdrop', 'pongpong'];
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
function seedFixture(sb) {
  const pets = [
    mkPet(sb, 'dream', { refineLevel: 6, refineStats: { hp: 720, atk: 30, def: 20, soulAtk: 20, soulDef: 15 } }),
    mkPet(sb, 'possum', { refineLevel: 0, refineStats: {} })
  ].concat(BENCH.map(sid => mkPet(sb, sid, { refineLevel: 3, refineStats: { hp: 150 } })));
  sb.store.set('pets', {
    version: 1, pets: pets,
    materials: { nutrition: 3, feed: 6, spirit: 900, refineNormal: 5, refineHigh: 1, orbShard: 0 },
    orbs: [], battlePicks: [], lastSettleDate: null, monthlyKey: null
  });
  return pets;
}

const sb = makeSandbox();
const pets = seedFixture(sb);
const ur = pets.filter(p => p.speciesId === 'dream')[0];
const ssr = pets.filter(p => p.speciesId === 'possum')[0];
const bd = sb.petStatBreakdown(ur);
const bdSsr = sb.petStatBreakdown(ssr);

console.log('\n[0] fixture 与基础读数（作者截图那两只）');
assert('夹具 14 只（含 UR 梦幻 / SSR 小负鼠）', pets.length === 14 &&
  !!ur && ur.rarity === 'UR' && !!ssr && ssr.rarity === 'SSR');
assert('拆解可用', bd.ok === true && bdSsr.ok === true);
assert('UR 生命基础 = 1020（图鉴 300 ＋ 炼化 720）', bd.base.hp === 1020, String(bd.base.hp));
assert('SSR 生命基础 = 200', bdSsr.base.hp === 200, String(bdSsr.base.hp));
assert('「全部宠物」= 14 只 / 「成熟期」= 14 只', bd.allCount === 14 && bd.matureCount === 14 && bdSsr.allCount === 14,
  bd.allCount + ' / ' + bd.matureCount);
assert('凝聚档位 = 3%（常量唯一来源 TEAM_COHESION_PCT）', sb.TEAM_COHESION_PCT === 3 && bd.ratePct.cohesion === 3,
  sb.TEAM_COHESION_PCT + ' / ' + bd.ratePct.cohesion);
assert('Σ共鸣 = 108%（14 只成熟期：UR 3 / SSR 4 / SR 4 / R 3）',
  bd.ratePct.resonance === 108 && bd.resonancePct === 108 && bd.resonanceRate === 1.08,
  bd.ratePct.resonance + ' / ' + bd.resonanceRate);
assert('S凝聚（固定值，逐属性）= 成熟期之和 × 3%',
  BONUS_KEYS.every(k => Math.abs(bd.cohesion[k] - sb.petMatureBaseSum()[k] * 3 / 100) < 1e-9),
  JSON.stringify(bd.cohesion));

/* ============================================================
   1) 新口径黄金值（写死；由本文件 [8] 的 git HEAD 对照独立复算过）
   ============================================================ */
console.log('\n[1] 新口径黄金值（逐属性 final）');
const GOLDEN = {
  dream: {
    base: { hp: 1020, atk: 60, def: 40, spd: 9, soulAtk: 40, soulDef: 30 },
    final: { hp: 20045, atk: 1173, def: 783, spd: 9, soulAtk: 784, soulDef: 580 }
  },
  possum: {
    base: { hp: 200, atk: 20, def: 15, spd: 8, soulAtk: 15, soulDef: 10 },
    final: { hp: 5685, atk: 461, def: 335, spd: 8, soulAtk: 336, soulDef: 224 }
  }
};
[['dream', bd], ['possum', bdSsr]].forEach(function (t) {
  const name = t[0], b = t[1];
  STAT_KEYS.forEach(function (k) {
    assert(name + '·final[' + k + '] = ' + GOLDEN[name].final[k], b.final[k] === GOLDEN[name].final[k],
      b.final[k] + ' vs ' + GOLDEN[name].final[k]);
    assert(name + '·base[' + k + '] 仍是 createPetUnit 原值（凝聚不进基础）',
      b.base[k] === GOLDEN[name].base[k], b.base[k] + ' vs ' + GOLDEN[name].base[k]);
  });
});

/* ============================================================
   2) 三链同值：面板（petStatBreakdown）／实战（buildGroupBattlePets）／纯函数
   ============================================================ */
console.log('\n[2] 面板 / 实战 / 纯函数 三链同一组 final');
const built = sb.buildGroupBattlePets([ur.speciesId], sb.PET_BATTLE_MAX);
assert('建场只带本宠 → 1 个单位', built.length === 1);
STAT_KEYS.forEach(function (k) {
  assert('UR 实战[' + k + '] = 面板 bd.final[' + k + ']', built[0].base[k] === bd.final[k],
    built[0].base[k] + ' vs ' + bd.final[k]);
  assert('UR 纯函数 pureFinal[' + k + '] = 面板 final[' + k + ']', bd.pureFinal[k] === bd.final[k],
    bd.pureFinal[k] + ' vs ' + bd.final[k]);
});
/* S凝聚 / S共鸣% 是全局常量 → 参战阵容不同，同一只宠吃到的加成不变 */
const built3 = sb.buildGroupBattlePets([ur.speciesId, ssr.speciesId, 'chirpbird'], sb.PET_BATTLE_MAX);
assert('换一套参战阵容，UR 的 final 逐属性不变（口径不依赖「谁上场」）',
  STAT_KEYS.every(k => built3[0].base[k] === built[0].base[k]),
  JSON.stringify(built3[0].base) + ' vs ' + JSON.stringify(built[0].base));

/* ============================================================
   3) 公式自洽：(基础 ＋ 凝聚) × 加成合计% ÷ 100；速度不参与
   ============================================================ */
console.log('\n[3] 公式自洽（凝聚固定值 → 三项池 → floor）');
[['UR', bd], ['SSR', bdSsr]].forEach(function (t) {
  const tag = t[0], b = t[1];
  BONUS_KEYS.forEach(function (k) {
    const total = b.rarityPct + (b.orbPct[k] || 0) + b.resonancePct;
    assert(tag + '·[' + k + '] 加成合计 = 稀有度＋Σ宝珠＋Σ共鸣（' + total.toFixed(3) + '%）',
      Math.abs(b.totalPct[k] - total) < 1e-9, b.totalPct[k] + ' vs ' + total);
    const want = Math.max(1, Math.floor((b.base[k] + b.cohesion[k]) * b.totalPct[k] / 100));
    assert(tag + '·[' + k + '] final = floor((' + b.base[k] + ' ＋ ' + b.cohesion[k] + ') × '
      + b.totalPct[k].toFixed(3) + '% ÷ 100) = ' + want, b.final[k] === want, b.final[k] + ' vs ' + want);
  });
  assert(tag + '·速度不参与：凝聚 0、加成合计 = 100、final = 基础',
    b.totalPct.spd === 100 && b.final.spd === b.base.spd && b.cohesion.spd === 0 && b.bench.spd === b.base.spd);
  assert(tag + '·魂防下限规则仍在（final.soulDef ≥ ⌊final.def ÷ 2⌋）',
    b.final.soulDef >= Math.floor(b.final.def * 0.5), b.final.soulDef + ' vs ' + Math.floor(b.final.def * 0.5));
});
/* 全局常量：UR 与 SSR 的 S凝聚 / S共鸣% **完全相同** */
(() => {
  assert('UR 与 SSR 的 S凝聚完全相同（每只宠同一个固定值）',
    BONUS_KEYS.every(k => bd.cohesion[k] === bdSsr.cohesion[k]), JSON.stringify(bd.cohesion));
  assert('UR 与 SSR 的 S共鸣% 完全相同（同一个全局百分比）',
    bd.resonancePct === bdSsr.resonancePct, bd.resonancePct + ' vs ' + bdSsr.resonancePct);
  assert('差异只来自稀有度档位与基础：加成合计差正好 = 稀有度差（1600 − 1500）',
    BONUS_KEYS.every(k => Math.abs((bd.totalPct[k] - bdSsr.totalPct[k]) - 100) < 1e-9),
    bd.totalPct.hp + ' vs ' + bdSsr.totalPct.hp);
  console.log('   凝聚（固定值）UR = ' + JSON.stringify(bd.cohesion) + ' ／ SSR 相同');
  console.log('   Σ共鸣% = ' + bd.resonancePct + '%（两只完全相同）· 稀有度 1600% vs 1500%');
})();

/* ============================================================
   4) 纯函数：不修改入参 / 连续 N 次不变 / 除零安全
   ============================================================ */
console.log('\n[4] 纯函数契约（不写入参 / 幂等 / 除零）');
(() => {
  const matureSum = { hp: 5120, atk: 290, def: 195, spd: 98, soulAtk: 198, soulDef: 133 };
  const selfBase = { hp: 1020, atk: 60, def: 40, spd: 9, soulAtk: 40, soulDef: 30 };
  const orb = { atk: 10 };
  const snap = JSON.stringify({ matureSum, selfBase, orb });
  const r1 = sb.petBonusAdditivePool(matureSum, selfBase, 1600, orb, 108);
  const r2 = sb.petBonusAdditivePool(matureSum, selfBase, 1600, orb, 108);
  assert('**不修改入参**（matureBaseSum / selfBase / orbPct 一字不变）', JSON.stringify({ matureSum, selfBase, orb }) === snap);
  assert('连续两次调用结果逐字一致', JSON.stringify(r1) === JSON.stringify(r2));
  const runs = [];
  for (let i = 0; i < 20; i++) runs.push(JSON.stringify(sb.petBonusAdditivePool(matureSum, selfBase, 1600, orb, 108)));
  assert('连续 20 次调用逐字一致（无内部状态）', runs.every(s => s === runs[0]));
  assert('凝聚 = 5120 × 3% = 153.6（固定值，不是百分比）', r1.cohesion.hp === 153.6, String(r1.cohesion.hp));
  /* 除零 / 脏存档：基础全 0 时不产生 Infinity / NaN */
  const zeroBase = { hp: 0, atk: 0, def: 0, spd: 0, soulAtk: 0, soulDef: 0 };
  const rz = sb.petBonusAdditivePool(matureSum, zeroBase, 1600, orb, 108);
  assert('基础为 0 时不产生 NaN / Infinity',
    JSON.stringify(rz).indexOf('null') < 0 && !/NaN|Infinity/.test(JSON.stringify(rz)), JSON.stringify(rz).slice(0, 120));
  assert('基础为 0 时速度 final 仍为 0（不被 max(1) 抬成 1）', rz.final.spd === 0);
  /* 空池（未成熟期）时凝聚 / Σ共鸣 都是 0 → final 只剩稀有度层 */
  const re = sb.petBonusAdditivePool({}, selfBase, 1600, {}, 0);
  assert('没有成熟期宠物 → 凝聚 0、Σ共鸣 0、final = floor(基础 × 1600%)',
    re.cohesion.hp === 0 && re.resonancePct === 0 && re.final.hp === Math.floor(1020 * 1600 / 100));
})();

/* ============================================================
   5) HTML 形态：② 段「凝聚固定值 ＋ 加成合计 ×N%」；③ 仍是 bd.final
   ============================================================ */
console.log('\n[5] HTML 输出（真调 UI 生成函数）');
const html = sb.petStatSectionsHtml(bd, 'UR');
assert('① / ② / ③ 三个标题都在（三段契约不变）',
  html.indexOf('① 基础属性') >= 0 && html.indexOf('② 加成') >= 0 && html.indexOf('③ 最终属性') >= 0);
assert('② 段副标题写明「凝聚＝固定值（加在①上）」与「加成合计统一为 ×N%＝稀有度＋Σ宝珠＋Σ共鸣」',
  html.indexOf('凝聚＝<b>固定值</b>') >= 0 && html.indexOf('统一为 ×N%') >= 0 &&
  html.indexOf('凝聚/共鸣只作用于参战宠') >= 0);
/* 凝聚：**数值**形态（+153.6），速度显示「—」 */
assert('② 段给出 6 个凝聚固定值（数值形态 +X / 速度 —）', (function () {
  const seg = html.slice(html.indexOf('② 加成'), html.indexOf('pet-cell-mult'));
  const vals = (seg.match(/pet-cell-val">([+\-—−][\d.—]*|—)</g) || []);
  return vals.length === 6 && seg.indexOf('+' + sb.petValueTxt(bd.cohesion.hp)) >= 0 &&
    /速度<\/span><b class="pet-cell-val">—<\/b>/.test(seg);
})(), (html.slice(html.indexOf('② 加成'), html.indexOf('pet-cell-mult')).match(/pet-cell-val">[^<]*/g) || []).join('|'));
assert('② 段写明「凝聚是固定值 …… 直接加在①上（不是百分比、不进池）」',
  html.indexOf('凝聚是固定值') >= 0 && html.indexOf('直接加在①上') >= 0 && html.indexOf('不进池') >= 0);
assert('② 段写明「同一存档下每只宠拿到的凝聚完全相同」', html.indexOf('每只宠拿到的凝聚') >= 0 && html.indexOf('完全相同') >= 0);
/* 加成合计：**百分比**形态（6 个 ×N%），速度 = ×100% */
assert('② 段逐属性给**一个加成合计**（6 个 ×N%）',
  (html.match(/pet-cell-mult">×\d+%<\/b>/g) || []).length === 6,
  String((html.match(/pet-cell-mult">[^<]*/g) || []).length));
assert('② 段不再出现「＋加成 42（凝聚 30＋共鸣 12）」这类绝对加值写法', html.indexOf('＋加成') < 0);
assert('② 段写明最终公式＝(基础 ＋ 凝聚) × 加成合计%，且 Σ共鸣按成熟期只数逐只相加',
  html.indexOf('(基础 ＋ 凝聚)') >= 0 && html.indexOf('逐只相加') >= 0 && html.indexOf('UR 10 / SSR 8 / SR 7 / R 6') >= 0);
assert('② 段不再出现旧的合成倍数（×2846% / ×8505%）', html.indexOf('×2846%') < 0 && html.indexOf('×8505%') < 0);
/* 展示的大字与实战百分比同源（只做了显示取整：|display − totalPct| ≤ 0.5） */
(() => {
  const shown = (html.match(/pet-cell-mult">×(\d+)%<\/b>/g) || []).map(m => Number(/×(\d+)%/.exec(m)[1]));
  assert('6 个加成合计大字都能解析', shown.length === 6, String(shown.length));
  assert('大字 = round(实操百分比)（差 ≤ 0.5 个百分点）',
    STAT_KEYS.every((k, i) => Math.abs(shown[i] - (k === 'spd' ? 100 : bd.totalPct[k])) <= 0.5),
    STAT_KEYS.map((k, i) => k + ':' + shown[i] + '/' + (k === 'spd' ? 100 : bd.totalPct[k].toFixed(2))).join(' '));
})();
/* 可展开处：来源明细 —— 稀有度 / Σ宝珠（进池）＋ 凝聚（固定值）/ 共鸣（Σ%，进池） */
sb._petSrcOpen = true;
const htmlOpen = sb.petStatSectionsHtml(bd, 'UR');
sb._petSrcOpen = false;
assert('展开区逐属性列「稀有度 ＋ Σ宝珠 ＋ Σ共鸣 ＝ 加成合计」（逐属性 5 行）',
  (htmlOpen.match(/稀有度 <b>[\d.]+%<\/b> ＋ Σ宝珠 <b>[\d.]+%<\/b> ＋ Σ共鸣 <b>[\d.]+%<\/b> ＝ 加成合计 <b>×[\d.]+%<\/b>/g) || []).length === 5,
  String((htmlOpen.match(/稀有度 <b>/g) || []).length));
assert('展开区把「凝聚」单列成**固定值**并注明「已加在①上」',
  htmlOpen.indexOf('凝聚 <b>固定值</b>') >= 0 && htmlOpen.indexOf('已加在①上') >= 0 &&
  htmlOpen.indexOf('+' + sb.petValueTxt(bd.cohesion.hp)) >= 0);
assert('展开区写明 Σ共鸣 = 成熟期逐只稀有度相加（进池）', htmlOpen.indexOf('进池') >= 0 &&
  htmlOpen.indexOf('UR 10 / SSR 8 / SR 7 / R 6') >= 0);
assert('展开区写明「同一层相加」与「每只宠看到的这两个值完全相同」',
  htmlOpen.indexOf('同一层相加') >= 0 && htmlOpen.indexOf('每只宠看到的这两个值完全相同') >= 0);
assert('展开区写明成熟期只数 / 全部只数与未上场只数',
  /成熟期 14 只/.test(htmlOpen) && /全部 14 只/.test(htmlOpen) && /未上场 \d+ 只/.test(htmlOpen));
assert('展开区速度行明确「凝聚 — · 不参与百分比池」', /凝聚 — · 不参与百分比池/.test(htmlOpen));
assert('③ 段仍是 6 行、数字逐项等于 bd.final', STAT_KEYS.every(function (k) {
  const m = new RegExp('data-pet-stat="' + k + '[\\s\\S]{0,220}?pet-cell-val">(-?\\d+)<').exec(html);
  return !!m && Number(m[1]) === bd.final[k];
}), STAT_KEYS.map(k => {
  const m = new RegExp('data-pet-stat="' + k + '[\\s\\S]{0,220}?pet-cell-val">(-?\\d+)<').exec(html);
  return k + '=' + (m ? m[1] : '∅');
}).join(' '));
assert('展示值无 undefined / NaN / Infinity',
  !/undefined|NaN|Infinity/.test(html), (html.match(/undefined|NaN|Infinity/) || [])[0]);
assert('② 段正文没有可点元素（热区口径不变：没有新按钮/新热区）', (function () {
  const seg = html.slice(html.indexOf('<div class="pet-sec-title">② 加成'), html.indexOf('<button class="pet-src-toggle"'));
  return seg.length > 400 && seg.indexOf('<button') < 0 && seg.indexOf('data-') < 0;
})());
assert('只读：渲染不改存档、不改宠物本体', (function () {
  const before = JSON.stringify(sb.getPetStore());
  const petBefore = JSON.stringify(ur);
  sb.petStatSectionsHtml(sb.petStatBreakdown(ur), 'UR');
  return JSON.stringify(sb.getPetStore()) === before && JSON.stringify(ur) === petBefore;
})());
/* ③ 展开链路：基础 ＋ 凝聚 → 最终，含 ×倍率池 与三项明细 */
sb._petStatOpen = 'atk';
const htmlChain = sb.petStatSectionsHtml(bd, 'UR');
sb._petStatOpen = null;
assert('③ 展开给出「基础 ＋ 凝聚 → 最终」链路 ＋ ×倍率池 ＋ 三项明细',
  /基础 <b>\d+<\/b>[\s\S]{0,80}凝聚 [+\-−][\d.]+<\/b>[\s\S]{0,80}最终 <b>\d+<\/b>/.test(htmlChain) &&
  /×倍率池 ×\d+%/.test(htmlChain) && htmlChain.indexOf('稀有度') > 0 && htmlChain.indexOf('Σ共鸣') > 0);
/* 宠物图鉴缺失（拆解不可用）时不崩、不打印脏数 */
assert('bd 不可用 → ② 显示「暂不可用」而不是脏数',
  sb.petStatSectionsHtml({ ok: false }, 'UR').indexOf('属性拆解暂不可用') >= 0);

/* ============================================================
   6) 口径单一来源 + 设计体系（无新字号 / 新颜色）
   ============================================================ */
console.log('\n[6] 口径单一来源 / 设计体系');
const uiSrc = src('pet-ui.js');
function fnBody(source, name) {
  const i = source.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = source.indexOf('{', i), depth = 0, k = j;
  for (; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return source.slice(j, k);
}
const bodyHtml = fnBody(uiSrc, 'petBonusLinesHtml');
const bodySrc = fnBody(uiSrc, 'petBonusSrcHtml');
const bodyCohesion = fnBody(uiSrc, 'petCohesionHtml');
assert('UI 的 ② 渲染函数走 petBonusLines（唯一来源）', bodyHtml.indexOf('petBonusLines(') >= 0);
assert('UI 的凝聚行也走 petBonusLines（不自己算 3%）',
  bodyCohesion.indexOf('petBonusLines(') >= 0 && bodyCohesion.indexOf('TEAM_COHESION') < 0);
assert('UI 的四项明细也走 petBonusLines / petPctTxt / petValueTxt（不自己换算）',
  bodySrc.indexOf('petBonusLines(') >= 0 && bodySrc.indexOf('petPctTxt(') >= 0 && bodySrc.indexOf('petValueTxt(') >= 0);
[['petBonusLinesHtml', bodyHtml], ['petBonusSrcHtml', bodySrc], ['petCohesionHtml', bodyCohesion]].forEach(function (t) {
  assert(t[0] + ' 内不做乘除 / 不调 Math.floor（口径与取整都在 pet-store）',
    !/Math\.floor|\*\s*100|\/\s*100/.test(t[1]), (t[1].match(/Math\.floor|\*\s*100|\/\s*100/) || [])[0]);
  assert(t[0] + ' 内不读 bd.base / bd.bench 自算', t[1].indexOf('bd.base') < 0 && t[1].indexOf('bd.bench') < 0);
  assert(t[0] + ' 内没有新增字号（font-size:）', t[1].indexOf('font-size:') < 0);
  assert(t[0] + ' 内没有新增颜色（hex / rgba）', !/#[0-9a-fA-F]{3}\b|rgba?\(\s*\d/.test(t[1]));
});
assert('UI 仍不引用稀有度倍率常量 PET_GROUP_SCALE（口径留在 pet-store）', uiSrc.indexOf('PET_GROUP_SCALE') < 0);
assert('复用既有样式类（pet-grid / pet-cell / pet-cell-mult / pet-cell-val / pet-src-line / pet-src-tag / pet-src-note）',
  ['pet-grid', 'pet-cell', 'pet-cell-mult', 'pet-cell-val', 'pet-src-line', 'pet-src-tag', 'pet-src-note'].every(c => uiSrc.indexOf(c) >= 0));
const storeRowBody = fnBody(src('pet-store.js'), 'petBonusRow');
assert('pet-store 侧也不重造取整公式（petBonusRow 内无 Math.floor）',
  storeRowBody.length > 200 && storeRowBody.indexOf('Math.floor') < 0);
assert('速度语义常量仍是 PET_BONUS_ATTRS（速度不参与）',
  src('pet-store.js').indexOf("var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef']") >= 0);
assert('唯一公式实现 petBonusAdditivePool 定义在 pet-store.js',
  src('pet-store.js').indexOf('function petBonusAdditivePool') >= 0);
assert('池的唯一出口 boostPetForGroup 仍是三项相加（稀有度 ＋ Σ宝珠 ＋ Σ共鸣）',
  /var poolPct = rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ resPct/.test(src('group-levels.js')) &&
  /unit\.base\[s\] \+ \(cohMap\[s\] \|\| 0\)/.test(src('group-levels.js')));
assert('新口径的档位常量唯一来源（3% / UR10·SSR8·SR7·R6）',
  /var TEAM_COHESION_PCT = 3;/.test(src('pet-store.js')) &&
  /var PET_RESONANCE_SCALE = \{ UR: 10, SSR: 8, SR: 7, R: 6 \};/.test(src('pet-store.js')));

/* ============================================================
   7) 凝聚 vs 共鸣 的形态差异（数值 / 百分比）
   ============================================================ */
console.log('\n[7] 凝聚是「数值」、共鸣是「百分比」（作者要求一眼可分）');
assert('凝聚是**绝对值**：UR 与 SSR 拿到同一组固定值（' + JSON.stringify(bd.cohesion) + '）',
  BONUS_KEYS.every(k => bd.cohesion[k] === bdSsr.cohesion[k]));
assert('共鸣是**百分比**：两只宠同为 ' + bd.resonancePct + '%，且直接参与乘池',
  bdSsr.resonancePct === bd.resonancePct && bd.totalPct.hp === 1600 + bd.resonancePct);
assert('凝聚不被池「重复计一层」：final = floor((基础＋凝聚)×池%)，不是 floor(基础×池%)＋凝聚',
  bd.final.hp === Math.floor((bd.base.hp + bd.cohesion.hp) * bd.totalPct.hp / 100) &&
  bd.final.hp !== Math.floor(bd.base.hp * bd.totalPct.hp / 100) + Math.round(bd.cohesion.hp),
  bd.final.hp + ' / ' + (Math.floor(bd.base.hp * bd.totalPct.hp / 100) + Math.round(bd.cohesion.hp)));
assert('旧版 ×8505%（SSR）/ ×2846%（UR）这类合成倍数不再是展示口径（② 只给两项池）',
  (8505 / 2846) > 2.9 && html.indexOf('×8505%') < 0 && html.indexOf('×2846%') < 0);

/* ============================================================
   8) 改前（git HEAD = v2.15）× 改后对照
   ============================================================ */
console.log('\n[8] 改前 → 改后逐属性对照（git HEAD:page/pet-store.js ＋ page/group-levels.js）');
/* 改前（v2.15）实测值：凝聚/共鸣都折成「贡献值 ÷ 本宠基础」的百分比进池 */
const OLD_FINAL = {
  dream: { hp: 17344, atk: 1017, def: 679, spd: 9, soulAtk: 679, soulDef: 506 },
  possum: { hp: 4024, atk: 358, def: 264, spd: 8, soulAtk: 264, soulDef: 176 }
};
function headSrc(f) {
  return cp.execSync('git -C "' + ROOT.replace(/\\/g, '/') + '" show HEAD:page/' + f,
    { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
}
let oldStore = null, oldGl = null;
try { oldStore = headSrc('pet-store.js'); oldGl = headSrc('group-levels.js'); }
catch (e) { console.log(' · git 取不到改前文件（' + (e && e.message ? e.message.split('\n')[0] : 'unknown') + '）→ 改用写死的改前黄金值'); }
/* 判据：HEAD 是「v2.15（四项加算）」而不是本轮新口径（新口径才含 PET_RESONANCE_SCALE） */
const headIsOld = !!oldStore && oldStore.indexOf('PET_RESONANCE_SCALE') < 0;
if (oldStore && oldGl && headIsOld) {
  const sbOld = makeSandbox({ storeSrc: oldStore, glSrc: oldGl });
  const oldPets = seedFixture(sbOld);
  const oUr = sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'dream')[0]);
  const oSsr = sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'possum')[0]);
  const pct = (a, b) => ((b / a - 1) * 100).toFixed(1) + '%';
  STAT_KEYS.forEach(function (k) {
    console.log('   UR[' + k.padEnd(7) + '] ' + String(oUr.final[k]).padStart(7) + ' → ' + String(bd.final[k]).padStart(7)
      + '  (' + pct(oUr.final[k], bd.final[k]) + ')');
    assert('改前 UR[' + k + '] = 记录的旧值 ' + OLD_FINAL.dream[k], oUr.final[k] === OLD_FINAL.dream[k],
      oUr.final[k] + ' vs ' + OLD_FINAL.dream[k]);
  });
  STAT_KEYS.forEach(function (k) {
    console.log('   SSR[' + k.padEnd(6) + '] ' + String(oSsr.final[k]).padStart(7) + ' → ' + String(bdSsr.final[k]).padStart(7)
      + '  (' + pct(oSsr.final[k], bdSsr.final[k]) + ')');
    assert('改前 SSR[' + k + '] = 记录的旧值 ' + OLD_FINAL.possum[k], oSsr.final[k] === OLD_FINAL.possum[k],
      oSsr.final[k] + ' vs ' + OLD_FINAL.possum[k]);
  });
  const total = (bd2, keys) => BONUS_KEYS.reduce((s, k) => s + bd2.final[k], 0);
  console.log('   整体强度（5 项之和）UR  ' + total(oUr) + ' → ' + total(bd)
    + '  (' + pct(total(oUr), total(bd)) + ')');
  console.log('   整体强度（5 项之和）SSR ' + total(oSsr) + ' → ' + total(bdSsr)
    + '  (' + pct(total(oSsr), total(bdSsr)) + ')');
  assert('口径确实变了（UR 生命 ' + oUr.final.hp + ' → ' + bd.final.hp + '）',
    oUr.final.hp !== bd.final.hp);
  assert('改前版本没有 PET_RESONANCE_SCALE（新共鸣档位表是本轮新增）',
    typeof sbOld.PET_RESONANCE_SCALE === 'undefined' && !!sb.PET_RESONANCE_SCALE);
  assert('改前 base 也不含加成（旧口径写的是 bench，base 一直干净）',
    STAT_KEYS.every(k => oUr.base[k] === bd.base[k]));
} else {
  console.log(' · HEAD 已是新口径或 git 不可用 → 用写死的改前黄金值判定');
  STAT_KEYS.forEach(function (k) {
    console.log('   UR[' + k.padEnd(7) + '] ' + String(OLD_FINAL.dream[k]).padStart(7) + ' → ' + String(bd.final[k]).padStart(7));
  });
  STAT_KEYS.forEach(function (k) {
    console.log('   SSR[' + k.padEnd(6) + '] ' + String(OLD_FINAL.possum[k]).padStart(7) + ' → ' + String(bdSsr.final[k]).padStart(7));
  });
  assert('改后值不等于改前黄金值（口径确实变了）',
    STAT_KEYS.some(k => bd.final[k] !== OLD_FINAL.dream[k] || bdSsr.final[k] !== OLD_FINAL.possum[k]));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

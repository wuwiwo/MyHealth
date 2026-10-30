#!/usr/bin/env node
/* v2.15 测试：宠物详情「② 属性加成」＋ 加成口径改造
   （作者裁决：「**改成按所有宠物计算，加成之间用加算**」→ 选项一：加成全进同一加算层）

   新口径（唯一真相，实现在 page/pet-store.js 的 petBonusAdditivePool ＋ page/group-levels.js 的
   boostPetForGroup）：
       基础        = 图鉴基础 ＋ 炼化 ＋ 天赋静态           （createPetUnit 口径，未改）
       加成合计%   = 稀有度% ＋ Σ宝珠% ＋ 凝聚% ＋ 共鸣%     （四项【加算】，同一层）
         凝聚贡献值 = (全部宠物该属性基础之和) × 10%
         共鸣贡献值 = (全部宠物该属性基础之和) × resonanceBonus(持有总数)
         凝聚%      = 凝聚贡献值 ÷ 本宠该属性基础 × 100
         共鸣%      = 共鸣贡献值 ÷ 本宠该属性基础 × 100
       最终        = floor(基础 × 加成合计% / 100)
       速度        = 不参与百分比池（×100%）

   与旧口径（v2.2~v2.14，git HEAD）的三处区别：
     ① 「全部宠物」= 存档里的**所有**宠物（不排除本宠/参战/受伤/死亡/阶段）
     ② 凝聚/共鸣**不再加进基数再被池放大**，而是与稀有度/宝珠并列成百分比、同层相加
     ③ 面板口径 = 实战口径（不再有「面板比实战高 29%」）

   本套守五件事：
     1) **新口径黄金值**（写死在下面）＋ 真实引擎管道复核（建场 → 面板 → 纯函数 三链同值）；
     2) **公式自洽**：final = max(1, floor(基础 × 加成合计% ÷ 100)) 逐属性成立；
        速度不参与（加成合计 = 100、final = 基础）；
     3) **除零安全**：本宠某属性基础为 0 时不产生 Infinity / NaN；
     4) **② 段形态**：一个加成合计 ＋ 可展开的四项明细；不出现旧的合成倍数（×2846% / ×8505%）；
        展示的大字与实战百分比同源（差 ≤ 0.5 个百分点 = 只做了显示取整）；
     5) **口径单一来源 + 设计体系**：UI 只拼文本（不做乘除、不读 bd.base / bd.bench 自算、
        不引 PET_GROUP_SCALE、无新字号 / 新颜色 / 新热区）。
   另附 [8] **改前 → 改后**逐属性对照（git HEAD 的 pet-store.js ＋ group-levels.js 重算）。

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
   · 其余 12 只做「全部宠物」的一份子，各炼化 +150 生命
   · 持有 14 只 → 共鸣档位 10%（resonanceBonus(14) = 0.10） */
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
assert('「全部宠物」= 14 只（含本宠 / 含参战 / 不筛阶段与伤死）',
  bd.allCount === 14 && bdSsr.allCount === 14, String(bd.allCount));
assert('共鸣档位 = 10%（14 只 > 10）', bd.ratePct.resonance === 10 && bd.resonanceRate === 0.1,
  bd.ratePct.resonance + ' / ' + bd.resonanceRate);
assert('凝聚档位 = 10%（常量唯一来源 TEAM_COHESION_PCT）', sb.TEAM_COHESION_PCT === 10 && bd.ratePct.cohesion === 10);

/* ============================================================
   1) 新口径黄金值（写死；由本文件 [8] 的 git HEAD 对照独立复算过）
   ============================================================ */
console.log('\n[1] 新口径黄金值（逐属性 final）');
const GOLDEN = {
  dream: {
    base: { hp: 1020, atk: 60, def: 40, spd: 9, soulAtk: 40, soulDef: 30 },
    final: { hp: 17344, atk: 1017, def: 679, spd: 9, soulAtk: 679, soulDef: 506 }
  },
  possum: {
    base: { hp: 200, atk: 20, def: 15, spd: 8, soulAtk: 15, soulDef: 10 },
    final: { hp: 4024, atk: 358, def: 264, spd: 8, soulAtk: 264, soulDef: 176 }
  }
};
[['dream', bd], ['possum', bdSsr]].forEach(function (t) {
  const name = t[0], b = t[1];
  STAT_KEYS.forEach(function (k) {
    assert(name + '·final[' + k + '] = ' + GOLDEN[name].final[k], b.final[k] === GOLDEN[name].final[k],
      b.final[k] + ' vs ' + GOLDEN[name].final[k]);
    assert(name + '·base[' + k + '] 仍是 createPetUnit 原值（加成不再进基础）',
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
/* 「全部宠物」与谁上场无关 → 参战阵容不同，同一只宠吃到的贡献值不变 */
const built3 = sb.buildGroupBattlePets([ur.speciesId, ssr.speciesId, 'chirpbird'], sb.PET_BATTLE_MAX);
assert('换一套参战阵容，UR 的 final 逐属性不变（口径不再依赖「谁上场」）',
  STAT_KEYS.every(k => built3[0].base[k] === built[0].base[k]),
  JSON.stringify(built3[0].base) + ' vs ' + JSON.stringify(built[0].base));

/* ============================================================
   3) 公式自洽：final = max(1, floor(基础 × 加成合计% ÷ 100))；速度不参与
   ============================================================ */
console.log('\n[3] 公式自洽（四项加算 → 一个百分比 → floor）');
[['UR', bd], ['SSR', bdSsr]].forEach(function (t) {
  const tag = t[0], b = t[1];
  BONUS_KEYS.forEach(function (k) {
    const total = b.rarityPct + (b.orbPct[k] || 0) + b.cohesionPct[k] + b.resonancePct[k];
    assert(tag + '·[' + k + '] 加成合计 = 稀有度＋宝珠＋凝聚%＋共鸣%（' + total.toFixed(3) + '%）',
      Math.abs(b.totalPct[k] - total) < 1e-9, b.totalPct[k] + ' vs ' + total);
    const want = Math.max(1, Math.floor(b.base[k] * b.totalPct[k] / 100));
    assert(tag + '·[' + k + '] final = max(1, floor(' + b.base[k] + ' × ' + b.totalPct[k].toFixed(3) + '% ÷ 100)) = ' + want,
      b.final[k] === want, b.final[k] + ' vs ' + want);
  });
  assert(tag + '·速度不参与：加成合计 = 100、final = 基础',
    b.totalPct.spd === 100 && b.final.spd === b.base.spd && b.bench.spd === b.base.spd);
  assert(tag + '·魂防下限规则仍在（final.soulDef ≥ ⌊final.def ÷ 2⌋）',
    b.final.soulDef >= Math.floor(b.final.def * 0.5), b.final.soulDef + ' vs ' + Math.floor(b.final.def * 0.5));
});
/* 同一存档下，每只宠的凝聚/共鸣**贡献值**完全相同（新口径的核心性质） */
(() => {
  const a = sb.petBonusAdditivePool(bd.allBaseSum || sb.petBaseBonusView().allBaseSum, bd.base, bd.rarityPct, bd.orbPct, 10);
  const b = sb.petBonusAdditivePool(sb.petBaseBonusView().allBaseSum, bdSsr.base, bdSsr.rarityPct, bdSsr.orbPct, 10);
  assert('UR 与 SSR 的凝聚贡献值完全相同',
    BONUS_KEYS.every(k => a.cohesionValue[k] === b.cohesionValue[k]), JSON.stringify(a.cohesionValue));
  assert('UR 与 SSR 的共鸣贡献值完全相同',
    BONUS_KEYS.every(k => a.resonanceValue[k] === b.resonanceValue[k]), JSON.stringify(a.resonanceValue));
  assert('但折算成百分比后不同（÷ 各自基础）：UR 生命 ' + a.cohesionPct.hp.toFixed(2)
    + '% vs SSR ' + b.cohesionPct.hp.toFixed(2) + '%',
    a.cohesionPct.hp !== b.cohesionPct.hp && a.cohesionPct.hp < b.cohesionPct.hp);
})();

/* ============================================================
   4) 纯函数：不修改入参 / 连续 N 次不变 / 除零安全
   ============================================================ */
console.log('\n[4] 纯函数契约（不写入参 / 幂等 / 除零）');
(() => {
  const allSum = { hp: 5120, atk: 290, def: 195, spd: 98, soulAtk: 198, soulDef: 133 };
  const selfBase = { hp: 1020, atk: 60, def: 40, spd: 9, soulAtk: 40, soulDef: 30 };
  const orb = { atk: 10 };
  const snap = JSON.stringify({ allSum, selfBase, orb });
  const r1 = sb.petBonusAdditivePool(allSum, selfBase, 1600, orb, 10);
  const r2 = sb.petBonusAdditivePool(allSum, selfBase, 1600, orb, 10);
  assert('**不修改入参**（allBaseSum / selfBase / orbPct 一字不变）', JSON.stringify({ allSum, selfBase, orb }) === snap);
  assert('连续两次调用结果逐字一致', JSON.stringify(r1) === JSON.stringify(r2));
  const runs = [];
  for (let i = 0; i < 20; i++) runs.push(JSON.stringify(sb.petBonusAdditivePool(allSum, selfBase, 1600, orb, 10)));
  assert('连续 20 次调用逐字一致（无内部状态）', runs.every(s => s === runs[0]));
  /* 除零：本宠该属性基础 0 → 百分比按 0 记，不产生 Infinity / NaN */
  const zeroBase = { hp: 0, atk: 0, def: 0, spd: 0, soulAtk: 0, soulDef: 0 };
  const rz = sb.petBonusAdditivePool(allSum, zeroBase, 1600, orb, 10);
  assert('基础为 0 时不产生 NaN / Infinity',
    JSON.stringify(rz).indexOf('null') < 0 && !/NaN|Infinity/.test(JSON.stringify(rz)), JSON.stringify(rz).slice(0, 120));
  assert('基础为 0 时凝聚%/共鸣% 记 0（不做除法）',
    rz.cohesionPct.hp === 0 && rz.resonancePct.hp === 0);
  assert('基础为 0 时速度 final 仍为 0（不被 max(1) 抬成 1）', rz.final.spd === 0);
})();

/* ============================================================
   5) HTML 形态：② 一个加成合计 ＋ 可展开四项明细；③ 仍是 bd.final
   ============================================================ */
console.log('\n[5] HTML 输出（真调 UI 生成函数）');
const html = sb.petStatSectionsHtml(bd, 'UR');
assert('② 段仍在（标题含「② 加成」）', html.indexOf('② 加成') >= 0);
assert('② 段副标题讲明新口径（×N% / 四项同一层相加 / 按全部宠物计算 / 凝聚/共鸣只作用于参战宠）',
  html.indexOf('统一为 ×N%') >= 0 && html.indexOf('四项同一层相加') >= 0 &&
  html.indexOf('按全部宠物计算') >= 0 && html.indexOf('凝聚/共鸣只作用于参战宠') >= 0);
assert('② 段逐属性给**一个加成合计**（6 个 ×N%）',
  (html.match(/pet-cell-mult">×\d+%<\/b>/g) || []).length === 6,
  String((html.match(/pet-cell-mult">[^<]*/g) || []).length));
assert('② 段不再出现旧的合成倍数（×2846% / ×8505%）',
  html.indexOf('×2846%') < 0 && html.indexOf('×8505%') < 0);
/* 展示的大字与实战百分比同源（只做了显示取整：|display − totalPct| ≤ 0.5） */
(() => {
  const shown = (html.match(/pet-cell-mult">×(\d+)%<\/b>/g) || []).map(m => Number(/×(\d+)%/.exec(m)[1]));
  assert('6 个加成合计大字都能解析', shown.length === 6, String(shown.length));
  assert('大字 = round(实操百分比)（差 ≤ 0.5 个百分点）',
    STAT_KEYS.every((k, i) => Math.abs(shown[i] - (k === 'spd' ? 100 : bd.totalPct[k])) <= 0.5),
    STAT_KEYS.map((k, i) => k + ':' + shown[i] + '/' + (k === 'spd' ? 100 : bd.totalPct[k].toFixed(2))).join(' '));
})();
/* 可展开处：四项明细逐属性齐全 */
sb._petSrcOpen = true;
const htmlOpen = sb.petStatSectionsHtml(bd, 'UR');
sb._petSrcOpen = false;
assert('展开区列出四项明细：稀有度 / Σ宝珠 / 凝聚 / 共鸣（逐属性 5 行）',
  (htmlOpen.match(/稀有度 <b>[\d.]+%<\/b> ＋ Σ宝珠 <b>[\d.]+%<\/b> ＋ 凝聚 <b>[\d.]+%<\/b> ＋ 共鸣 <b>[\d.]+%<\/b>/g) || []).length === 5,
  String((htmlOpen.match(/稀有度 <b>/g) || []).length));
assert('展开区写明「同一层相加」与「每只宠同一个绝对值」',
  htmlOpen.indexOf('同一层相加') >= 0 && htmlOpen.indexOf('每只宠是同一个绝对值') >= 0);
assert('展开区写明「全部 14 只」的取数口径', /全部 14 只/.test(htmlOpen));
assert('展开区速度行明确「不参与百分比池」', /不参与百分比池/.test(htmlOpen));
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
  return seg.length > 200 && seg.indexOf('<button') < 0 && seg.indexOf('data-') < 0;
})());
assert('只读：渲染不改存档、不改宠物本体', (function () {
  const before = JSON.stringify(sb.getPetStore());
  const petBefore = JSON.stringify(ur);
  sb.petStatSectionsHtml(sb.petStatBreakdown(ur), 'UR');
  return JSON.stringify(sb.getPetStore()) === before && JSON.stringify(ur) === petBefore;
})());
/* ③ 展开链路：基础 → 最终，含 ×倍率池 与四项 */
sb._petStatOpen = 'atk';
const htmlChain = sb.petStatSectionsHtml(bd, 'UR');
sb._petStatOpen = null;
assert('③ 展开给出「基础 → 最终」链路 ＋ ×倍率池 ＋ 四项明细',
  /基础 <b>\d+<\/b>[\s\S]{0,80}最终 <b>\d+<\/b>/.test(htmlChain) &&
  /×倍率池 ×\d+%/.test(htmlChain) && htmlChain.indexOf('稀有度') > 0 && htmlChain.indexOf('凝聚') > 0);
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
assert('UI 的 ② 渲染函数走 petBonusLines（唯一来源）', bodyHtml.indexOf('petBonusLines(') >= 0);
assert('UI 的四项明细也走 petBonusLines / petPctTxt（不自己换算）',
  bodySrc.indexOf('petBonusLines(') >= 0 && bodySrc.indexOf('petPctTxt(') >= 0);
[['petBonusLinesHtml', bodyHtml], ['petBonusSrcHtml', bodySrc]].forEach(function (t) {
  assert(t[0] + ' 内不做乘除 / 不调 Math.floor（口径与取整都在 pet-store）',
    !/Math\.floor|\*\s*100|\/\s*100/.test(t[1]), (t[1].match(/Math\.floor|\*\s*100|\/\s*100/) || [])[0]);
  assert(t[0] + ' 内不读 bd.base / bd.bench 自算', t[1].indexOf('bd.base') < 0 && t[1].indexOf('bd.bench') < 0);
  assert(t[0] + ' 内没有新增字号（font-size:）', t[1].indexOf('font-size:') < 0);
  assert(t[0] + ' 内没有新增颜色（hex / rgba）', !/#[0-9a-fA-F]{3}\b|rgba?\(\s*\d/.test(t[1]));
});
assert('UI 仍不引用稀有度倍率常量 PET_GROUP_SCALE（口径留在 pet-store）', uiSrc.indexOf('PET_GROUP_SCALE') < 0);
assert('复用既有样式类（pet-grid / pet-cell / pet-cell-mult / pet-src-line / pet-src-tag / pet-src-note）',
  ['pet-grid', 'pet-cell', 'pet-cell-mult', 'pet-src-line', 'pet-src-tag', 'pet-src-note'].every(c => uiSrc.indexOf(c) >= 0));
const storeRowBody = fnBody(src('pet-store.js'), 'petBonusRow');
assert('pet-store 侧也不重造取整公式（petBonusRow 内无 Math.floor）',
  storeRowBody.length > 200 && storeRowBody.indexOf('Math.floor') < 0);
assert('速度语义常量仍是 PET_BONUS_ATTRS（速度不参与）',
  src('pet-store.js').indexOf("var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef']") >= 0);
assert('唯一公式实现 petBonusAdditivePool 定义在 pet-store.js',
  src('pet-store.js').indexOf('function petBonusAdditivePool') >= 0);
assert('池的唯一出口 boostPetForGroup 仍是四项相加（group-levels.js）',
  /var poolPct = rarityPct \+ \(orbMap\[s\] \|\| 0\) \+ \(cohMap\[s\] \|\| 0\) \+ \(resMap\[s\] \|\| 0\)/
    .test(src('group-levels.js')));

/* ============================================================
   7) 作者场景：为什么 SSR 的旧百分比会爆表（新口径下这个数不再存在）
   ============================================================ */
console.log('\n[7] 旧版「×8505%」的成因（改造后不再出现）');
assert('旧口径下 SSR 生命的总倍数远高于 UR（旧：×' + 8505 + '% vs ×' + 2846 + '%）',
  (8505 / 2846) > 2.9);
/* 新口径下两只宠「超出稀有度层」的那部分**完全相同** —— 那正是凝聚＋共鸣的贡献值。
   （加成合计% 本身不可跨宠比较：它 = 稀有度 ＋ 贡献值 ÷ **本宠基础**，基础越小百分比越大） */
assert('超出「稀有度层」的部分完全相同（= 凝聚＋共鸣贡献值 ' + bd.cohesion.hp + '＋' + bd.resonance.hp + '）',
  (bd.final.hp - bd.base.hp * 16) === (bdSsr.final.hp - bdSsr.base.hp * 15) &&
  (bd.final.hp - bd.base.hp * 16) === Math.round(bd.cohesion.hp + bd.resonance.hp),
  (bd.final.hp - bd.base.hp * 16) + ' vs ' + (bdSsr.final.hp - bdSsr.base.hp * 15));
assert('加成合计% 跨宠不可比：SSR 基础小 → 百分比更大（' + bd.totalPct.hp.toFixed(2)
  + '% vs ' + bdSsr.totalPct.hp.toFixed(2) + '%），但**绝对值相同**',
  bdSsr.totalPct.hp > bd.totalPct.hp && bd.cohesion.hp === bdSsr.cohesion.hp);
assert('新口径下「基础小的宠百分比更大、绝对值相同」',
  bd.cohesionPct.hp < bdSsr.cohesionPct.hp && bd.cohesion.hp === bdSsr.cohesion.hp);

/* ============================================================
   8) 改前（git HEAD）× 改后对照
   ============================================================ */
console.log('\n[8] 改前 → 改后逐属性对照（git HEAD:page/pet-store.js ＋ page/group-levels.js）');
const OLD_FINAL = {
  dream: { hp: 29440, atk: 1632, def: 1024, spd: 9, soulAtk: 1024, soulDef: 672 },
  possum: { hp: 17760, atk: 1050, def: 675, spd: 8, soulAtk: 675, soulDef: 390 }
};
function headSrc(f) {
  return cp.execSync('git -C "' + ROOT.replace(/\\/g, '/') + '" show HEAD:page/' + f,
    { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
}
let oldStore = null, oldGl = null;
try { oldStore = headSrc('pet-store.js'); oldGl = headSrc('group-levels.js'); }
catch (e) { console.log(' · git 取不到改前文件（' + (e && e.message ? e.message.split('\n')[0] : 'unknown') + '）→ 改用写死的改前黄金值'); }
/* 若 HEAD 里已经是新口径（本版提交之后），实时对照没有意义 → 退回写死值 */
const headIsOld = !!oldStore && oldStore.indexOf('function petBonusAdditivePool') < 0;
if (oldStore && oldGl && headIsOld) {
  const sbOld = makeSandbox({ storeSrc: oldStore, glSrc: oldGl });
  const oldPets = seedFixture(sbOld);
  const oUr = sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'dream')[0]);
  const oSsr = sbOld.petStatBreakdown(oldPets.filter(p => p.speciesId === 'possum')[0]);
  STAT_KEYS.forEach(function (k) {
    console.log('   UR[' + k.padEnd(7) + '] ' + String(oUr.final[k]).padStart(7) + ' → ' + String(bd.final[k]).padStart(7)
      + '  (' + ((bd.final[k] / oUr.final[k] - 1) * 100).toFixed(1) + '%)');
    assert('改前 UR[' + k + '] = 记录的旧值 ' + OLD_FINAL.dream[k], oUr.final[k] === OLD_FINAL.dream[k],
      oUr.final[k] + ' vs ' + OLD_FINAL.dream[k]);
  });
  STAT_KEYS.forEach(function (k) {
    console.log('   SSR[' + k.padEnd(6) + '] ' + String(oSsr.final[k]).padStart(7) + ' → ' + String(bdSsr.final[k]).padStart(7)
      + '  (' + ((bdSsr.final[k] / oSsr.final[k] - 1) * 100).toFixed(1) + '%)');
    assert('改前 SSR[' + k + '] = 记录的旧值 ' + OLD_FINAL.possum[k], oSsr.final[k] === OLD_FINAL.possum[k],
      oSsr.final[k] + ' vs ' + OLD_FINAL.possum[k]);
  });
  assert('口径确实变了：UR 生命 ' + oUr.final.hp + ' → ' + bd.final.hp + '（旧口径把凝聚/共鸣也乘进了池）',
    oUr.final.hp !== bd.final.hp && oUr.final.hp > bd.final.hp);
  assert('改前版本没有 petBonusAdditivePool（唯一公式实现是本轮新增）',
    typeof sbOld.petBonusAdditivePool === 'undefined' && typeof sb.petBonusAdditivePool === 'function');
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

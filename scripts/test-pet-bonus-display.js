#!/usr/bin/env node
/* v2.14.4 测试：宠物详情「② 属性加成」显示口径改造（作者：**一个合成倍数看不懂**）

   背景（作者实测反馈）：
     · 梦幻 UR：生命 基础 1020 → ② 只显示 **×2846%**
     · 小负鼠 SSR：生命 基础 200 → ② 只显示 **×8505%**
   核算结论：算术与口径都没错 —— 那个 `×N%` 是「基础 → 最终」的总倍数，把三件事揉成一个数：
     **稀有度倍率 / Σ宝珠% / 凝聚＋共鸣把基数抬高后的放大**。
   UR 基数大 → 比值低；SSR 基数小、又被凝聚/共鸣垫了一层固定值 → 比值爆表。

   本次只改**显示**：② 拆成逐属性两行（倍率池 ×N% ／ 凝聚·共鸣 基数加值），③ 最终值一行不动。
   本套守四件事：
     1) **改前 vs 改后逐属性完全相同** —— 黄金值（改前用 git HEAD 的 pet-store.js 实算出来的
        数字，写死在这里）＋ 真实引擎管道复核（createPetUnit → 加凝聚/共鸣 → boostPetForGroup）；
     2) **三段关系自洽** —— (基础 ＋ 凝聚共鸣) × (稀有度 ＋ Σ宝珠%) 能还原出 ③（取整沿用现状），
        并且用**HTML 里显示出来的**池/加值去还原，证明展示值与最终值不是两套数；
     3) **展示值都是有限数** —— 无 undefined / NaN / Infinity，逐属性两行齐全；
     4) **口径单一来源** —— UI 只拼文本（不做乘除、不读 bd.base / bd.bench 自算、不引 PET_GROUP_SCALE、
        无新字号 / 新颜色 / 新热区）。
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
   （storeSrc 可注入「改前的 pet-store.js」，用于改造前后对照）
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
    const code = (f === 'pet-store.js' && opts.storeSrc) ? opts.storeSrc : src(f);
    vm.runInContext(code, sb);
  });
  return sb;
}

/* ---- 夹具（与浏览器复验用的那份同形：15 只 → 14 只，含 UR 与 SSR 各一）----
   · dream（UR）：图鉴 300 ＋ 炼化 720 = **生命基础 1020** ← 作者截图里的那个基数
   · possum（SSR）：图鉴 **200** ← 作者截图里的那个基数
   · 其余 12 只做后备，各炼化 +150 生命 → 凝聚＋共鸣 在生命上垫出 +820 / +984
   · 持有 14 只 → 共鸣档位 10%（与作者「未上场 13 只 ×10% ＋ 共鸣 10%」一致） */
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

console.log('\n[0] fixture 与改造前的读数（作者截图那两只）');
assert('夹具 14 只（含 UR 梦幻 / SSR 小负鼠）', pets.length === 14 &&
  !!ur && ur.rarity === 'UR' && !!ssr && ssr.rarity === 'SSR');
assert('拆解可用', bd.ok === true && bdSsr.ok === true);
assert('UR 生命基础 = 1020（图鉴 300 ＋ 炼化 720）', bd.base.hp === 1020, String(bd.base.hp));
assert('SSR 生命基础 = 200', bdSsr.base.hp === 200, String(bdSsr.base.hp));
assert('后备 13 只、共鸣 10%', bd.benchCount === 13 && bd.resonanceRate === 0.1,
  bd.benchCount + ' / ' + bd.resonanceRate);

/* ============================================================
   1) 黄金值：**改前**逐属性 final（用 git HEAD 的 pet-store.js 实算出来的数字）
      —— 改造只允许改显示，这些数字一个都不许变。
   ============================================================ */
console.log('\n[1] 黄金值：改前 vs 改后，③ 最终值逐属性完全相同');
const GOLDEN = {
  dream: {
    base: { hp: 1020, atk: 60, def: 40, spd: 9, soulAtk: 40, soulDef: 30 },
    bench: { hp: 1840, atk: 102, def: 64, spd: 9, soulAtk: 64, soulDef: 42 },
    final: { hp: 29440, atk: 1632, def: 1024, spd: 9, soulAtk: 1024, soulDef: 672 },
    composite: { hp: 2886, atk: 2720, def: 2560, spd: 100, soulAtk: 2560, soulDef: 2240 }
  },
  possum: {
    base: { hp: 200, atk: 20, def: 15, spd: 8, soulAtk: 15, soulDef: 10 },
    bench: { hp: 1184, atk: 70, def: 45, spd: 8, soulAtk: 45, soulDef: 26 },
    final: { hp: 17760, atk: 1050, def: 675, spd: 8, soulAtk: 675, soulDef: 390 },
    composite: { hp: 8880, atk: 5250, def: 4500, spd: 100, soulAtk: 4500, soulDef: 3900 }
  }
};
[['dream', ur, bd], ['possum', ssr, bdSsr]].forEach(function (t) {
  const name = t[0], b = t[2];
  STAT_KEYS.forEach(function (k) {
    assert(name + '·最终[' + k + '] 与改前**逐值相同**（' + GOLDEN[name].final[k] + '）',
      b.final[k] === GOLDEN[name].final[k], b.final[k] + ' vs ' + GOLDEN[name].final[k]);
  });
  STAT_KEYS.forEach(function (k) {
    assert(name + '·基础[' + k + '] / 上场基础[' + k + '] 也没变',
      b.base[k] === GOLDEN[name].base[k] && b.bench[k] === GOLDEN[name].bench[k],
      b.base[k] + '/' + b.bench[k]);
  });
});

/* 2) 独立引擎管道复核（不经过 petStatBreakdown 的展示字段，直接走真实建场路径） */
console.log('\n[2] 真实引擎管道复核（createPetUnit → 加凝聚/共鸣 → boostPetForGroup）');
const pipe = sb.createPetUnit(ur);
sb.applyBattlePetBaseBonuses([pipe]);
sb.boostPetForGroup(pipe);
STAT_KEYS.forEach(function (k) {
  assert('UR 管道最终[' + k + '] 与展示的 bd.final 一致', bd.final[k] === (pipe.base[k] || 0),
    bd.final[k] + ' vs ' + pipe.base[k]);
});

/* ============================================================
   3) 三段关系自洽：(基础 ＋ 凝聚共鸣) × (稀有度 ＋ Σ宝珠%) 还原 ③
      取整规则沿用现状：Math.max(1, Math.floor(bench × pool / 100))；速度不进池
   ============================================================ */
console.log('\n[3] 三段关系（池 × 基数 ＝ 最终，含取整）');
[['UR', bd], ['SSR', bdSsr]].forEach(function (t) {
  const tag = t[0], b = t[1];
  BONUS_KEYS.forEach(function (k) {
    const want = Math.max(1, Math.floor((b.base[k] + b.cohesion[k] + b.resonance[k]) * b.poolPct[k] / 100));
    assert(tag + '·[' + k + '] (基础 ' + b.base[k] + ' ＋ 凝聚 ' + b.cohesion[k] + ' ＋ 共鸣 ' + b.resonance[k]
      + ') × ' + b.poolPct[k] + '% 取整 ＝ ' + b.final[k], want === b.final[k], want + ' vs ' + b.final[k]);
  });
  assert(tag + '·速度不进池：final.spd ＝ 基础（不吃凝聚/共鸣）',
    b.poolPct.spd === 0 && b.final.spd === b.base.spd && b.bench.spd === b.base.spd);
  assert(tag + '·魂防下限规则仍在（final.soulDef ≥ ⌊def÷2⌋）', b.final.soulDef >= Math.floor(b.final.def * 0.5),
    b.final.soulDef + ' vs ' + Math.floor(b.final.def * 0.5));
});

/* ============================================================
   4) 新出口 petBonusLines()：两行的每个数都是有限数、且能对上 bd
   ============================================================ */
console.log('\n[4] petBonusLines()：逐属性两行的数（有限数 / 与 bd 同源）');
assert('pet-store.js 导出了 petBonusRow / petBonusLines（window ＋ globalThis 两处）',
  src('pet-store.js').indexOf('function petBonusLines') >= 0 &&
  src('pet-store.js').indexOf('window.petBonusLines = petBonusLines') >= 0 &&
  src('pet-store.js').indexOf('globalThis.petBonusLines = petBonusLines') >= 0 &&
  src('pet-store.js').indexOf('window.petBonusRow = petBonusRow') >= 0);
const dig = sb.petBonusLines(bd, 'UR');
assert('返回结构：ok / benchCount / cohesionRate / resonanceRate / 整数百分比 / rows',
  dig.ok === true && Array.isArray(dig.rows) && dig.rows.length === 6 &&
  dig.benchCount === bd.benchCount && dig.cohesionRate === 0.1 && dig.resonanceRate === bd.resonanceRate &&
  dig.cohesionPct === 10 && dig.resonancePct === 10);
assert('速度行：participates=false、poolMultPct=100、baseAdd=0',
  dig.rows[3].key === 'spd' && dig.rows[3].participates === false &&
  dig.rows[3].poolMultPct === 100 && dig.rows[3].baseAdd === 0);
dig.rows.forEach(function (r) {
  const finite = ['base', 'cohesion', 'resonance', 'baseAdd', 'bench', 'rarityPct', 'orbPct', 'poolPct', 'poolMultPct', 'final']
    .every(k => typeof r[k] === 'number' && isFinite(r[k]));
  assert('[' + r.key + '] 十项数值都是有限数（无 NaN / Infinity / undefined）', finite, JSON.stringify(r));
  assert('[' + r.key + '] baseAdd ＝ bench − base（凝聚＋共鸣的绝对值）', r.baseAdd === r.bench - r.base);
  assert('[' + r.key + '] baseAddPct ＝ round(baseAdd ÷ base × 100)',
    r.baseAddPct === Math.round((r.bench - r.base) * 100 / r.base), String(r.baseAddPct));
  assert('[' + r.key + '] 池 ＝ 稀有度 ＋ Σ宝珠（两项相加）',
    r.participates ? r.poolMultPct === r.rarityPct + r.orbPct : r.poolMultPct === 100,
    r.poolMultPct + ' vs ' + (r.rarityPct + r.orbPct));
  assert('[' + r.key + '] final 取自 bd.final（不重算）', r.final === bd.final[r.key]);
});
assert('稀有度标签只在「对得上 PET_GROUP_SCALE」时才给（对得上 → UR）', dig.rows[0].rarity === 'UR');
assert('对不上就不编：传 RK 冒充稀有度 → rarity = null', sb.petBonusLines(bd, 'RK').rows[0].rarity === null);
assert('宠物能量为 0 / bd 不可用时不抛错、也不产出假数', (function () {
  const bad = sb.petBonusLines({ ok: false }, 'UR');
  return bad.ok === false && bad.rows.length === 6 &&
    bad.rows.every(r => r.baseAdd === 0 && isFinite(r.poolMultPct) && r.baseAddPct === null) &&
    bad.rows[3].poolMultPct === 100;
})(), 'bad bd');

/* ============================================================
   5) HTML 形态：② 逐属性两行；③ 仍是 bd.final；不出现合成倍数；无 undefined/NaN
   ============================================================ */
console.log('\n[5] HTML 输出（真调 UI 生成函数）');
const html = sb.petStatSectionsHtml(bd, 'UR');
assert('② 段仍在（标题含「② 加成」）', html.indexOf('② 加成') >= 0);
assert('② 段副标题仍讲明前提（统一为 ×N% · 凝聚/共鸣只作用于参战宠）',
  html.indexOf('统一为 ×N%') >= 0 && html.indexOf('凝聚/共鸣只作用于参战宠') >= 0);
assert('② 段逐属性都给两行：稀有度＋宝珠池 ×6',
  (html.match(/稀有度＋宝珠池 <b class="pet-cell-mult">×\d+%<\/b>/g) || []).length === 6,
  String((html.match(/稀有度＋宝珠池 <b class="pet-cell-mult">×\d+%<\/b>/g) || []).length));
assert('② 段逐属性都给两行：凝聚/共鸣（基数）×6',
  (html.match(/凝聚\/共鸣（基数） <b>[+\u2212]\d+<\/b>/g) || []).length === 6,
  String((html.match(/凝聚\/共鸣（基数） <b>[+\u2212]\d+<\/b>/g) || []).length));
assert('② 段的池值全是 ×N% 形态（6 个 pet-cell-mult）',
  (html.match(/pet-cell-mult">×\d+%/g) || []).length === 6,
  String((html.match(/pet-cell-mult">[^<]*/g) || []).length));
assert('② 段不再出现旧的绝对加值写法「＋加成」', html.indexOf('＋加成') < 0);
BONUS_KEYS.forEach(function (k) {
  const comp = '×' + GOLDEN.dream.composite[k] + '%';
  assert('② 段不再打印合成倍数 ' + comp + '（[' + k + ']）', html.indexOf(comp) < 0);
});
assert('展示值无 undefined / NaN / Infinity',
  !/undefined|NaN|Infinity/.test(html), (html.match(/undefined|NaN|Infinity/) || [])[0]);
assert('③ 段仍是 6 行、数字逐项等于 bd.final', STAT_KEYS.every(function (k) {
  const m = new RegExp('data-pet-stat="' + k + '[\\s\\S]{0,220}?pet-cell-val">(-?\\d+)<').exec(html);
  return !!m && Number(m[1]) === bd.final[k];
}), STAT_KEYS.map(k => {
  const m = new RegExp('data-pet-stat="' + k + '[\\s\\S]{0,220}?pet-cell-val">(-?\\d+)<').exec(html);
  return k + '=' + (m ? m[1] : '∅');
}).join(' '));
/* 用**HTML 里显示出来的**池/加值还原 ③ —— 证明展示值与最终值是同一套数 */
const shown = [];
const reShown = /稀有度＋宝珠池 <b class="pet-cell-mult">×(\d+)%<\/b>[\s\S]*?凝聚\/共鸣（基数） <b>(?:([+\u2212])(\d+))<\/b>/g;
let mmShow;
while ((mmShow = reShown.exec(html))) {
  shown.push({ pool: Number(mmShow[1]), add: mmShow[2] === '\u2212' ? -Number(mmShow[3]) : Number(mmShow[3]) });
}
assert('从 HTML 里解析出 6 组「池 / 基数加值」', shown.length === 6, String(shown.length));
assert('显示值能还原 ③：(基础 ＋ 显示的加值) × 显示的池% 取整 ＝ ③（5 属性）',
  STAT_KEYS.every(function (k, i) {
    if (k === 'spd') return true;
    return Math.max(1, Math.floor((bd.base[k] + shown[i].add) * shown[i].pool / 100)) === bd.final[k];
  }), STAT_KEYS.map((k, i) => k + ':' + (shown[i] ? shown[i].pool + '%/+' + shown[i].add : '∅')).join(' '));
assert('速度行明确写「不参与」（池固定 ×100%、加值 +0）',
  /速度[\s\S]{0,120}×100%[\s\S]{0,200}\+0/.test(html.slice(html.indexOf('💨 速度'))) &&
  html.indexOf('速度不参与百分比池') >= 0 && html.indexOf('固定 +0') >= 0);
assert('② 段正文没有可点元素（热区口径不变：没有新按钮/新热区）', (function () {
  /* 从 ② 的标题（不是 section 头里那个「① → ② → ③」）截到既有「加成来源」折叠按钮之前 */
  const seg = html.slice(html.indexOf('<div class="pet-sec-title">② 加成'), html.indexOf('<button class="pet-src-toggle"'));
  return seg.length > 200 && seg.indexOf('<button') < 0 && seg.indexOf('data-') < 0;
})());
assert('只读：渲染不改存档、不改宠物本体', (function () {
  const before = JSON.stringify(sb.getPetStore());
  const petBefore = JSON.stringify(ur);
  sb.petStatSectionsHtml(sb.petStatBreakdown(ur), 'UR');
  return JSON.stringify(sb.getPetStore()) === before && JSON.stringify(ur) === petBefore;
})());
assert('② 段给出可解释的算式说明（倍率池两项相加＋先并基数再乘）',
  html.indexOf('倍率池 ＝ 稀有度 ＋ Σ宝珠%') >= 0 && html.indexOf('两项<b>相加</b>') >= 0 &&
  html.indexOf('最终 ＝（基础 ＋ 凝聚/共鸣）× 倍率池%') >= 0);

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
assert('UI 的 ② 渲染函数走 petBonusLines（唯一来源）', bodyHtml.indexOf('petBonusLines(') >= 0);
assert('UI 不重算池（渲染函数内不做乘除 / 不调 Math.floor）',
  !/Math\.floor|\*\s*100|\/\s*100/.test(bodyHtml), (bodyHtml.match(/Math\.floor|\*\s*100|\/\s*100/) || [])[0]);
assert('UI 不读 bd.base / bd.bench 自算（只认 petBonusLines 的字段）',
  bodyHtml.indexOf('bd.base') < 0 && bodyHtml.indexOf('bd.bench') < 0);
assert('UI 仍不引用稀有度倍率常量 PET_GROUP_SCALE（口径留在 pet-store）', uiSrc.indexOf('PET_GROUP_SCALE') < 0);
assert('UI 没有新增字号（渲染函数内无 font-size:）', bodyHtml.indexOf('font-size:') < 0);
assert('UI 没有新增颜色（渲染函数内无 hex / rgba）', !/#[0-9a-fA-F]{3}\b|rgba?\(\s*\d/.test(bodyHtml));
assert('复用既有样式类（pet-src-line / pet-src-tag / pet-cell-mult / pet-sec-sub）',
  ['pet-src-line', 'pet-src-tag', 'pet-cell-mult', 'pet-sec-sub'].every(c => bodyHtml.indexOf(c) >= 0));
const storeRowBody = fnBody(src('pet-store.js'), 'petBonusRow');
assert('pet-store 侧也不重造取整公式（petBonusRow 内无 Math.floor）',
  storeRowBody.length > 200 && storeRowBody.indexOf('Math.floor') < 0);
assert('速度语义常量仍是 PET_BONUS_ATTRS（速度不参与）',
  src('pet-store.js').indexOf("var PET_BONUS_ATTRS = ['hp', 'atk', 'def', 'soulAtk', 'soulDef']") >= 0);

/* ============================================================
   7) 作者场景的解读：同一层凝聚/共鸣下，UR 与 SSR 的比值差不是算错
   ============================================================ */
console.log('\n[7] 作者场景：为什么 UR 的比值低、SSR 的比值高（同一份后备加成）');
const addUr = bd.bench.hp - bd.base.hp, addSsr = bdSsr.bench.hp - bdSsr.base.hp;
assert('两只宠吃到的凝聚＋共鸣几乎同量级（生命 ' + addUr + ' / ' + addSsr + '）',
  Math.abs(addUr - addSsr) < bd.base.hp, addUr + ' vs ' + addSsr);
assert('倍数池相近（UR 1600% / SSR 1500%）', bd.poolPct.hp === 1600 && bdSsr.poolPct.hp === 1500);
assert('差的是**基数**：UR 1020 被 +' + addUr + ' 抬高 → 占基数 80%；SSR 200 被 +' + addSsr + ' 抬高 → 占基数 492%',
  sb.petBonusLines(bd).rows[0].baseAddPct === 80 && sb.petBonusLines(bdSsr).rows[0].baseAddPct === 492,
  sb.petBonusLines(bd).rows[0].baseAddPct + '% / ' + sb.petBonusLines(bdSsr).rows[0].baseAddPct + '%');
assert('于是合成倍数差 3 倍以上（×' + GOLDEN.dream.composite.hp + '% vs ×' + GOLDEN.possum.composite.hp
  + '%）—— 但两行拆开后每行都自洽', GOLDEN.possum.composite.hp / GOLDEN.dream.composite.hp > 3);

/* ============================================================
   8) 改前代码对照（git HEAD 的 pet-store.js 在另一个沙箱里重算）
   ============================================================ */
console.log('\n[8] 与改前代码逐属性对照（git HEAD:page/pet-store.js）');
let oldSrc = null;
try {
  oldSrc = cp.execSync('git -C "' + ROOT.replace(/\\/g, '/') + '" show HEAD:page/pet-store.js',
    { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  console.log(' · git 取不到改前文件（' + (e && e.message ? e.message.split('\n')[0] : 'unknown') + '）→ 本条改用黄金值判定');
}
if (oldSrc && oldSrc.indexOf('function petStatBreakdown') >= 0) {
  const sbOld = makeSandbox({ storeSrc: oldSrc });
  const oldPets = seedFixture(sbOld);
  const oldUr = oldPets.filter(p => p.speciesId === 'dream')[0];
  const oldSsr = oldPets.filter(p => p.speciesId === 'possum')[0];
  const oUr = sbOld.petStatBreakdown(oldUr);
  const oSsr = sbOld.petStatBreakdown(oldSsr);
  STAT_KEYS.forEach(function (k) {
    assert('改前 vs 改后·UR 最终[' + k + '] 逐值相同（' + oUr.final[k] + '）',
      oUr.final[k] === bd.final[k], oUr.final[k] + ' vs ' + bd.final[k]);
  });
  STAT_KEYS.forEach(function (k) {
    assert('改前 vs 改后·SSR 最终[' + k + '] 逐值相同（' + oSsr.final[k] + '）',
      oSsr.final[k] === bdSsr.final[k], oSsr.final[k] + ' vs ' + bdSsr.final[k]);
  });
  assert('改前 vs 改后：base / cohesion / resonance / bench / poolPct / rarityPct 也全部一致',
    ['base', 'cohesion', 'resonance', 'bench', 'poolPct', 'final'].every(function (fld) {
      return STAT_KEYS.every(k => oUr[fld][k] === bd[fld][k] && oSsr[fld][k] === bdSsr[fld][k]);
    }) && oUr.rarityPct === bd.rarityPct && oUr.benchCount === bd.benchCount);
  assert('改前版本里没有 petBonusLines（说明新增的只是展示出口，不是数值改造）',
    typeof sbOld.petBonusLines === 'undefined' && typeof sb.petBonusLines === 'function');
} else {
  assert('改前最终值 ＝ 黄金值（git 不可用时以黄金值兜底判定）',
    STAT_KEYS.every(k => bd.final[k] === GOLDEN.dream.final[k] && bdSsr.final[k] === GOLDEN.possum.final[k]));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

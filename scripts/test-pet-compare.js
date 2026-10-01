#!/usr/bin/env node
/* v2.2 WP-I A-6 测试：宠物详情「属性区重组 + 对比宠物」
   作者原话：「属性部分将基础属性与加成分开，最后再显示最终属性，层次要分明；
             加成用 ×N% 显示，可以展开加成来源，属性同理；增加对比宠物的功能。」

   本套只验三件事：
   1) **×N% 展示口径与 petStatBreakdown 同源**（只读，不重算一套数值）
   2) **三段结构（① 基础属性 → ② 加成 → ③ 最终属性）+ 可展开** 的接线守卫
      （同时守住「不引用 PET_GROUP_SCALE」「不新增字号/颜色」「热区 ≥44px」「不新增路由」）
   3) **对比功能：两只宠同口径**（都按「此宠上场计算」）+ 差值 + 只列主要几项 + 可退出
   Run: node scripts/test-pet-compare.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 与 test-pet-heal-display.js 同一套沙箱与加载顺序（**口径同源**，别另起一套） */
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
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
function seedStore(sb, pets, materials) {
  sb.store.set('pets', {
    version: 1, pets: pets, materials: materials || emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null
  });
}
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'];

/* ============================================================
   fixture：5 只宠（成熟 3 / 受伤 1 / 阵亡 1）+ 炼化 + 1 颗宝珠
   ============================================================ */
const sb = makeSandbox(20261006);
const subj = mkPet(sb, 'icecrystal');                       // SSR · 被拆解 / 本宠
subj.refineLevel = 3;
subj.refineStats = { atk: 12, hp: 50 };
subj.orbs = { atk: { id: 'orb-cmp-1', type: 'atk', rarity: 'R', level: 1 } };   // 攻击 +10%
const mate = mkPet(sb, 'dream');                            // UR · 对比对象
const mate2 = mkPet(sb, 'chirpbird');                       // SR · 另一只后备
const hurt = mkPet(sb, 'sparkle'); sb.injurePet(hurt);      // 受伤（不算后备、不进选择列表）
const dead = mkPet(sb, 'nonebear', { isDead: true });       // 阵亡（同上）
seedStore(sb, [subj, mate, mate2, hurt, dead], emptyBag());
assert('fixture = 5 只宠', sb.getPetStore().pets.length === 5);

const bd = sb.petStatBreakdown(subj);
assert('拆解可用', bd.ok === true);

/* ============================================================
   1) ×N% 展示口径：只从 petStatBreakdown 的字段换算，与引擎结果同源
   ============================================================ */
console.log('\n[1] ×N% 展示口径（petStatMultPct / bench / pool / orb）');
STAT_KEYS.forEach(function (k) {
  const pool = (k === 'spd') ? 100 : bd.poolPct[k];
  const base = bd.base[k] || 0;
  const exp = base > 0 ? Math.round((bd.bench[k] || 0) * pool / base) : null;
  assert('×N% 总倍数[' + k + '] = 上场基础 × 倍率池 ÷ 基础（只算展示）',
    sb.petStatMultPct(bd, k) === exp, sb.petStatMultPct(bd, k) + ' vs ' + exp);
  const expBench = base > 0 ? Math.round((bd.bench[k] || 0) * 100 / base) : null;
  assert('凝聚＋共鸣 倍数[' + k + '] = 上场基础 ÷ 基础',
    sb.petBenchMultPct(bd, k) === expBench, sb.petBenchMultPct(bd, k) + ' vs ' + expBench);
});
STAT_KEYS.forEach(function (k) {
  const expPool = (k === 'spd') ? 100 : (bd.poolPct[k] || 0);
  assert('倍率池倍数[' + k + '] = 稀有度% ＋ Σ宝珠%（速度不参与 → 100）',
    sb.petPoolMultPct(bd, k) === expPool, sb.petPoolMultPct(bd, k) + ' vs ' + expPool);
});
assert('宝珠倍数 = 100 ＋ 该属性宝珠%（攻 +' + bd.orbPct.atk + '%）',
  sb.petOrbMultPct(bd, 'atk') === 100 + bd.orbPct.atk && sb.petOrbMultPct(bd, 'atk') > 100,
  String(sb.petOrbMultPct(bd, 'atk')));
assert('未装配宝珠的属性 = ×100%（未装配不虚增）', sb.petOrbMultPct(bd, 'def') === 100);

/* 关键：×N% 的乘积必须还原引擎结果（±1 为显示四舍五入，不是口径差异） */
STAT_KEYS.forEach(function (k) {
  const base = bd.base[k] || 0;
  const back = Math.round(base * sb.petStatMultPct(bd, k) / 100);
  assert('基础 × 总倍数 ≈ 引擎最终值[' + k + ']（|Δ|≤1）',
    Math.abs(back - (bd.final[k] || 0)) <= 1, back + ' vs ' + bd.final[k]);
});
/* 稀有度与宝珠是**相加**进池（作者举例的 ×1400% / ×110% 不可直接相乘） */
assert('倍率池 = 稀有度 ＋ 宝珠（相加，不是相乘）',
  sb.petPoolMultPct(bd, 'atk') === bd.rarityPct + bd.orbPct.atk &&
  sb.petPoolMultPct(bd, 'atk') !== Math.round(bd.rarityPct * (100 + bd.orbPct.atk) / 100),
  bd.rarityPct + ' + ' + bd.orbPct.atk);

/* ============================================================
   2) 对比功能：两只宠**同口径**（都按「此宠上场计算」）+ 差值
   ============================================================ */
console.log('\n[2] 对比宠物（petCompareFinal）');
const snapStore = JSON.stringify(sb.getPetStore());
const snapSubj = JSON.stringify(subj);
const snapMate = JSON.stringify(mate);

const cmp = sb.petCompareFinal(subj, mate);
assert('对比可用', cmp.ok === true);
assert('口径固定为「此宠上场计算」（baseline=fielded）', cmp.baseline === 'fielded', String(cmp.baseline));
assert('只列主要几项（5 项，不含速度）',
  cmp.rows.length === 5 && cmp.rows.every(r => r.key !== 'spd'),
  cmp.rows.map(r => r.key).join(','));

const bdA = sb.petStatBreakdown(subj);
const bdB = sb.petStatBreakdown(mate);
cmp.rows.forEach(function (r) {
  assert('本宠值[' + r.key + '] 与 petStatBreakdown(subj).final 同源', r.a === bdA.final[r.key], r.a + ' vs ' + bdA.final[r.key]);
  assert('对比值[' + r.key + '] 与 petStatBreakdown(mate).final 同源（**不是**基础值）',
    r.b === bdB.final[r.key] && r.b !== bdB.base[r.key], r.b + ' vs final=' + bdB.final[r.key] + ' base=' + bdB.base[r.key]);
  assert('差值[' + r.key + '] = 对比 − 本宠', r.diff === r.b - r.a, r.diff + ' vs ' + (r.b - r.a));
});
/* 口径落实点：两边都走同一条管道 —— 本宠值 ≠ 它的基础值（证明用的是「上场后」的数） */
assert('本宠列也不是基础值（口径不是「A 上场 vs B 基础」）',
  cmp.rows.some(r => r.a !== bdA.base[r.key]), JSON.stringify(cmp.rows.map(r => r.a)));

/* 只读：对比不改存档、不改宠物本体 */
sb.petCompareFinal(subj, mate);
sb.petCompareFinal(mate, subj);
assert('只读：对比不改存档', JSON.stringify(sb.getPetStore()) === snapStore);
assert('只读：对比不改宠物本体', JSON.stringify(subj) === snapSubj && JSON.stringify(mate) === snapMate);

/* ============================================================
   3) 源码接线守卫（UI 真的用上了这些入口 / 结构与口径写明）
   ============================================================ */
console.log('\n[3] 接线守卫（pet-ui.js / pet-store.js）');
const ui = src('pet-ui.js');
const ps = src('pet-store.js');

assert('三段标题齐全（① 基础属性 / ② 加成 / ③ 最终属性）',
  ui.indexOf('① 基础属性') >= 0 && ui.indexOf('② 加成') >= 0 && ui.indexOf('③ 最终属性') >= 0);
assert('加成统一写成 ×N%（× + N + %）',
  /function petMultTxt/.test(ui) && /'×'\s*\+\s*pct\s*\+\s*'%'/.test(ui), 'petMultTxt');
assert('② 加成来源可展开（aria-expanded + aria-controls 指向真实存在的 id）',
  ui.indexOf('petBonusSrcBtn') >= 0 && /aria-controls="petBonusSrc"/.test(ui) && ui.indexOf('id="petBonusSrc"') >= 0);
assert('③ 属性行可展开（data-pet-stat + 详情容器 petStatDetail）',
  /data-pet-stat="/.test(ui) && ui.indexOf('id="petStatDetail"') >= 0 && /aria-expanded/.test(ui));
assert('对比入口 + 可换对象 + 可退出',
  ui.indexOf('data-pet-cmp=') >= 0 && ui.indexOf('petCmpExit') >= 0 && /_petCompareSel\s*=\s*\(_petCompareSel\s*===\s*sid\)/.test(ui));
assert('对比区写明口径（「此宠上场计算」+ 不是「比基础值」）',
  ui.indexOf('此宠上场计算') >= 0 && ui.indexOf('基础值') >= 0);
assert('面板前提「按此宠上场计算」保留并讲清楚',
  ui.indexOf('按此宠上场计算') >= 0 && ui.indexOf('凝聚/共鸣只作用于参战宠') >= 0);
assert('UI 不重算口径（不引用 PET_GROUP_SCALE、不定义 petStatBreakdown）',
  ui.indexOf('PET_GROUP_SCALE') < 0 && ui.indexOf('function petStatBreakdown') < 0);
assert('UI 走 petStatBreakdown 展示', ui.indexOf('petStatBreakdown') >= 0);
assert('不新增页面 / 路由（无 pushState / location.hash）',
  ui.indexOf('pushState') < 0 && ui.indexOf('location.hash') < 0);
assert('对比与 ×N% 换算定义在 pet-store.js（展示层唯一来源）',
  ps.indexOf('function petStatMultPct') >= 0 && ps.indexOf('function petCompareFinal') >= 0 &&
  ps.indexOf('function petStatBreakdown') >= 0);
assert('对比两边都走 petStatBreakdown（源码级口径守卫）',
  /const a = [\s\S]*?petStatBreakdown\(petA\)[\s\S]*?const b = [\s\S]*?petStatBreakdown\(petB\)/.test(ps) ||
  /petStatBreakdown\(petA\)[\s\S]{0,200}petStatBreakdown\(petB\)/.test(ps));
assert('对比口径常量 baseline = fielded（不会被改成混口径）', /baseline:\s*'fielded'/.test(ps));

/* ============================================================
   4) 真跑一遍 HTML 生成（三段 / ×N% 形态 / 可展开 / 对比表）
   ============================================================ */
console.log('\n[4] HTML 输出形态（在沙箱里真调 UI 生成函数）');
const html = sb.petStatSectionsHtml(bd);
assert('① 段存在', html.indexOf('① 基础属性') >= 0);
assert('② 段存在且副标题讲明前提（×N% · 凝聚/共鸣只作用于参战宠）',
  html.indexOf('② 加成') >= 0 && html.indexOf('统一为 ×N%') >= 0 && html.indexOf('凝聚/共鸣只作用于参战宠') >= 0);
assert('③ 段存在', html.indexOf('③ 最终属性') >= 0);
assert('② 段 6 项全部是 ×N% 形态（无绝对加值混入）',
  (html.match(/pet-cell-mult">×\d+%/g) || []).length === 6,
  String((html.match(/pet-cell-mult">[^<]*/g) || []).length));
assert('② 段不再出现「＋加成 42（凝聚 30＋共鸣 12）」这类绝对加值写法',
  html.indexOf('＋加成') < 0);
assert('③ 段 6 行可展开', (html.match(/data-pet-stat="/g) || []).length === 6);
assert('「加成来源」按钮带 aria-expanded / aria-controls / data-label',
  /id="petBonusSrcBtn"[^>]*aria-expanded="false"[^>]*aria-controls="petBonusSrc"/.test(html));
assert('加成来源默认收起（hidden）', /id="petBonusSrc" hidden/.test(html));

/* 展开态：×N% 明细（稀有度 / 宝珠 / 凝聚＋共鸣） */
sb._petSrcOpen = true;
const htmlSrc = sb.petStatSectionsHtml(bd);
sb._petSrcOpen = false;
assert('加成来源明细含 稀有度 ×N%', /稀有度倍率<\/span><span>×\d+%/.test(htmlSrc));
assert('加成来源明细含 宝珠 ×N%（与稀有度相加的说明）', /宝珠<\/span>/s.test(htmlSrc) && htmlSrc.indexOf('相加') > 0);
assert('加成来源明细含 凝聚＋共鸣 ×N%（未上场只数）', htmlSrc.indexOf('凝聚＋共鸣') > 0 && /未上场 \d+ 只/.test(htmlSrc));

/* 属性行展开：基础 → 各来源 → 最终 */
sb._petStatOpen = 'atk';
const htmlOpen = sb.petStatSectionsHtml(bd);
sb._petStatOpen = null;
assert('属性行展开给出「基础 → 各来源 → 最终」链路',
  /基础 <b>\d+<\/b>/.test(htmlOpen) && /凝聚/.test(htmlOpen) && /最终 <b>\d+<\/b>/.test(htmlOpen) &&
  /×倍率池 ×\d+%/.test(htmlOpen));
assert('展开态的行标 active + aria-expanded=true',
  /data-pet-stat="atk" aria-expanded="true"/.test(htmlOpen));

/* 对比区：默认未选 → 出选择器；选中 → 出并排表 + 差值 + 退出 */
const cmpIdle = sb.petCompareHtml(subj);
assert('对比区有选择器（可参战的其它宠 = 2 只：梦幻 / 清脆鸟）',
  (cmpIdle.match(/data-pet-cmp="/g) || []).length === 2,
  String((cmpIdle.match(/data-pet-cmp="/g) || []).length));
assert('非参战宠不进选择列表（受伤的闪闪星 / 阵亡的无念熊）',
  cmpIdle.indexOf('data-pet-cmp="sparkle"') < 0 && cmpIdle.indexOf('data-pet-cmp="nonebear"') < 0);
assert('对比项热区走已有 .speed-btn（≥44px）', /class="speed-btn pet-cmp-chip/.test(cmpIdle));

sb._petCompareSel = 'dream';
const cmpOn = sb.petCompareHtml(subj);
sb._petCompareSel = null;
assert('选中后并排展示 + 差值 + 退出按钮',
  cmpOn.indexOf('pet-cmp-table') > 0 && cmpOn.indexOf('差值') > 0 && cmpOn.indexOf('id="petCmpExit"') > 0);
assert('对比表 5 行（只显示主要几项）', (cmpOn.match(/<th scope="row">/g) || []).length === 5);
assert('对比表口径行写明「都按此宠上场计算」', cmpOn.indexOf('都按「此宠上场计算」') > 0);

/* ============================================================
   5) 设计体系：无新字号 / 无新颜色 / 热区 ≥44px
   ============================================================ */
console.log('\n[5] 设计体系（令牌化 / 热区）');
const css = src('index.css');
const i0 = css.indexOf('WP-I A-6：宠物详情 · 属性区三段');
assert('新样式块存在', i0 > 0);
const i1 = css.indexOf('*/', i0);
const i2 = css.indexOf('/* ==========', i1 + 2);
const blk = (i1 > 0 && i2 > i1) ? css.slice(i1, i2) : '';
assert('新样式块已定位（' + blk.length + ' 字符）', blk.length > 200);
assert('新样式块无裸字号（一律 var(--fs-*)）', blk.length > 0 && !/font-size:\s*(?!var\(--fs-)/.test(blk));
assert('新样式块无裸颜色（无 hex / 无裸 rgba）', blk.length > 0 && !/#[0-9a-fA-F]{3}/.test(blk) && !/rgba?\(\s*\d/.test(blk));
assert('③ 属性行热区 ≥44px（min-height:var(--touch-min)）', /\.pet-final-cell\{[^}]*min-height:var\(--touch-min\)/.test(css));
assert('「加成来源」热区 ≥44px', /\.pet-src-toggle\{[^}]*min-height:var\(--touch-min\)/.test(css));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

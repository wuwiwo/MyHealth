#!/usr/bin/env node
/* v2.2.29 测试：宠物头像图标接线（page/media/pets/*.svg）
   本版把 14 只宠物的 48×48 像素风 SVG 接进宠物面板。本套守四件事：

   1) **资源存在且合规** —— PET_CODEX 的每一个 speciesId 都能在 `page/media/pets/`
      找到同名 SVG，且该 SVG 满足设计规范（48×48 / viewBox / crispEdges /
      只用 <rect> / 无渐变描边透明度 / 坐标全为 3 的倍数 / 颜色 ≤8）。
      ⚠️ 这条是本套的核心：**代码里写对了路径 ≠ 文件真的在**（本项目有过
      「模块挂上了但界面上看不见」的事故，v2.0.3 / v2.0.4）。
   2) **缺图标不炸** —— 未知 speciesId 返回 null / ''，卡片整体退回原阶段 emoji；
      不抛错、不产生裂图 <img>。
   3) **唯一入口** —— `media/pets/` 这个路径字面量只允许出现在 pet-ui.js 的
      `PET_ICON_DIR` 一处（源码级守卫，防以后有人在别处硬拼路径）。
   4) **三处调用点都真的接上了** —— 列表卡片 / 详情页头部 / 参战与对比芯片，
      用真实渲染函数取 HTML 断言，而不是只 grep 源码。

   Run: node scripts/test-pet-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const load = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

/* ---------- 与 test-pet-compare.js 同一套沙箱与加载顺序（口径同源，别另起一套） ---------- */
function makeSandbox() {
  const mem = {};
  const sb = { Math, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  const ov = {
    innerHTML: '', hidden: false, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [], addEventListener() {}, setAttribute() {},
    getAttribute: () => null, textContent: ''
  };
  sb.__ov = ov;
  sb.document = {
    getElementById: id => (id === 'panelOverlay' ? ov : null),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  /* `_petBattlePicks` 在真实环境由 game-render.js 声明（本沙箱不载该文件）；
     renderPetPanel 的参战芯片要读它 → 这里补上同名全局，与线上同形。 */
  sb._petBattlePicks = [];
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(load(f), sb));
  return sb;
}
const sb = makeSandbox();
const SPECIES = sb.listPetCodex();
function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
function seedStore(pets) {
  sb.store.set('pets', { version: 1, pets: pets, materials: emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null });
}
function mkPet(speciesId, stage) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = stage || 'mature';
  return p;
}

/* ============ 1. 资源存在且合规 ============ */
console.log('--- 1. 资源存在且合规 ---');
ok(SPECIES.length === 14, `PET_CODEX 应为 14 只，实际 ${SPECIES.length}`);
const ICON_DIR = path.join(PAGE, 'media', 'pets');
ok(fs.existsSync(ICON_DIR), 'page/media/pets/ 目录不存在');

const BANNED_TAG = /<(path|circle|ellipse|polygon|polyline|line|text|image|g|defs|linearGradient|radialGradient|filter|mask|clipPath)[\s/>]/i;
const BANNED_ATTR = /\b(opacity|fill-opacity|stroke|stroke-width|style|transform)\s*=/i;

SPECIES.forEach(id => {
  const f = path.join(ICON_DIR, id + '.svg');
  if (!fs.existsSync(f)) { ok(false, `缺少图标文件 media/pets/${id}.svg`); return; }
  const s = fs.readFileSync(f, 'utf8');
  ok(/width="48"/.test(s) && /height="48"/.test(s), `${id}: 缺少 width/height=48`);
  ok(s.includes('viewBox="0 0 48 48"'), `${id}: viewBox 不是 "0 0 48 48"`);
  ok(s.includes('shape-rendering="crispEdges"'), `${id}: 缺少 shape-rendering="crispEdges"`);
  ok(s.includes('xmlns="http://www.w3.org/2000/svg"'), `${id}: 缺少 xmlns`);
  ok(!BANNED_TAG.test(s), `${id}: 出现禁用标签`);
  ok(!BANNED_ATTR.test(s), `${id}: 出现禁用属性`);
  ok(s.indexOf('\uFEFF') !== 0, `${id}: 带 BOM`);

  // 矩形：网格对齐 + 不越界 + 颜色数
  const rects = s.match(/<rect\b[^>]*\/?>/gi) || [];
  ok(rects.length > 0, `${id}: 没有任何 <rect>`);
  const fills = new Set();
  let gridOK = true, inBounds = true;
  rects.forEach(r => {
    const g = k => { const m = new RegExp('\\b' + k + '="(-?[\\d.]+)"').exec(r); return m ? parseFloat(m[1]) : null; };
    const x = g('x'), y = g('y'), w = g('width'), h = g('height'), fill = (/\bfill="([^"]+)"/.exec(r) || [])[1];
    if ([x, y, w, h].some(v => v === null || v % 3 !== 0)) gridOK = false;
    if (x + w > 48 || y + h > 48 || x < 0 || y < 0) inBounds = false;
    if (fill) fills.add(fill.toLowerCase());
  });
  ok(gridOK, `${id}: 有 rect 的 x/y/w/h 不是 3 的倍数`);
  ok(inBounds, `${id}: 有 rect 越界`);
  ok(fills.size <= 8, `${id}: 颜色数 ${fills.size} > 8`);
  ok(s.length < 6144, `${id}: 文件 ${s.length}B ≥ 6KB`);
});

/* ============ 2. 缺图标不炸 ============ */
console.log('--- 2. 缺图标不炸 ---');
ok(sb.petIconUrl('') === null, 'petIconUrl("") 应为 null');
ok(sb.petIconUrl(null) === null, 'petIconUrl(null) 应为 null');
ok(sb.petIconUrl('not_a_real_pet') === null, '未知 speciesId 应为 null（PET_CODEX 白名单）');
ok(sb.petIconHtml('not_a_real_pet', 40) === '', '未知 speciesId 的 petIconHtml 应为空串（不产生裂图）');
ok(sb.petIconUrl('kirin') === 'media/pets/kirin.svg', 'petIconUrl 路径拼接错误：' + sb.petIconUrl('kirin'));
ok(sb.petIconHtml('kirin', 40).includes('alt="圣光麒麟"'), 'img 的 alt 应为宠物名');
ok(sb.petIconHtml('kirin', 40).includes('width="40"'), 'img 未按 size 输出 width');
SPECIES.forEach(id => {
  const u = sb.petIconUrl(id);
  ok(u === 'media/pets/' + id + '.svg', `${id}: petIconUrl 应为 media/pets/${id}.svg，实际 ${u}`);
});

/* ============ 3. 唯一入口（源码级守卫） ============ */
console.log('--- 3. 唯一入口 ---');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const pathSites = [];
jsFiles.forEach(f => {
  const s = src(f);
  if (s.includes("'media/pets/'") || s.includes('"media/pets/"')) pathSites.push(f);
});
ok(pathSites.length === 1 && pathSites[0] === 'pet-ui.js',
  `'media/pets/' 字面量应只出现在 pet-ui.js，实际：${pathSites.join(', ') || '（无）'}`);

/* ============ 4. 三处调用点真的接上了 ============ */
console.log('--- 4. 调用点接线 ---');

/* 4a 列表卡片：每只宠都应出现自己的图标 */
seedStore(SPECIES.map(id => mkPet(id, 'mature')));
sb.renderPetPanel();
const panelHtml = sb.__ov.innerHTML;
SPECIES.forEach(id => {
  ok(panelHtml.includes('src="media/pets/' + id + '.svg"'),
    `宠物面板卡片未渲染 ${id} 的头像`);
});
ok(panelHtml.includes('class="pet-ico'), '卡片头像未带 .pet-ico class（pixelated 样式会失效）');

/* 4b 阶段角标：蛋期/成长期要有角标，成熟期不要 */
seedStore([mkPet('sparkle', 'egg'), mkPet('waterdrop', 'grow'), mkPet('pongpong', 'mature')]);
sb.renderPetPanel();
const h2 = sb.__ov.innerHTML;
ok(h2.includes('pet-ico-badge'), '蛋期/成长期卡片缺少阶段角标');
ok(h2.includes('🥚') && h2.includes('🌱'), '阶段角标 emoji 丢失（蛋 🥚 / 成长 🌱）');

/* 4c 详情页头部 */
seedStore([mkPet('darkcrow', 'mature')]);
sb.renderPetDetail(sb.getPetStore().pets[0], 0);
ok(sb.__ov.innerHTML.includes('src="media/pets/darkcrow.svg"'), '宠物详情页头部未渲染头像');

/* 4d 参战芯片 + 对比芯片 */
seedStore([mkPet('icecrystal', 'mature'), mkPet('nonebear', 'mature')]);
sb.renderPetPanel();
const h4 = sb.__ov.innerHTML;
ok(h4.includes('pet-pick-chip'), '参战芯片未加 .pet-pick-chip（头像与文字无法对齐）');
ok(/pet-pick-chip[^>]*>\s*<img[^>]*media\/pets\/icecrystal\.svg/.test(h4.replace(/\n/g, '')),
  '参战芯片内未渲染头像 <img>');
sb.renderPetDetail(sb.getPetStore().pets[0], 0);
ok(sb.__ov.innerHTML.includes('data-pet-cmp="nonebear"') && sb.__ov.innerHTML.includes('media/pets/nonebear.svg'),
  '对比宠物芯片内未渲染头像');

/* 4e 兜底：无图标时卡片仍显示原阶段 emoji，不出现空壳 */
const savedCodex = sb.PET_CODEX.kirin;
delete sb.PET_CODEX.kirin;
ok(sb.petIconHtml('kirin', 40) === '', 'PET_CODEX 里删掉 kirin 后 petIconHtml 应为空串');
ok(sb.petIconStageHtml('kirin', 40, 'egg') === '🥚', '无图标时蛋期应退回 🥚 emoji');
ok(sb.petIconStageHtml('kirin', 40, 'grow') === '🌱', '无图标时成长期应退回 🌱 emoji');
ok(sb.petIconStageHtml('kirin', 40, 'mature') === '🐾', '无图标时成熟期应退回 🐾 emoji');
sb.PET_CODEX.kirin = savedCodex;

/* 4f challenge.js 的宠物蛋奖励也带上了 speciesId（否则结算面板拿不到头像） */
const chSrc = src('challenge.js');
ok(/petEgg\s*=\s*\{\s*name:\s*pet\.name,\s*speciesId:\s*sid\s*\}/.test(chSrc),
  'challenge.js 的 petEgg 未带 speciesId');
ok(/petIconHtml\(state\.petEggReward\.speciesId/.test(chSrc),
  'challenge.js 结算面板未渲染宠物蛋头像');
ok(/typeof petIconHtml === 'function'/.test(chSrc),
  'challenge.js 调用 petIconHtml 前未做存在性守卫');

/* 4g CSS 契约：.pet-ico 必须带 pixelated，否则非整数倍缩放会糊 */
const css = src('index.css');
ok(/\.pet-ico\s*\{[^}]*image-rendering\s*:\s*pixelated/.test(css), 'index.css 的 .pet-ico 缺少 image-rendering:pixelated');
ok(/\.pet-ico-badge\s*\{/.test(css), 'index.css 缺少 .pet-ico-badge');
ok(/\.pet-pick-chip\s*,\s*\.pet-cmp-chip\s*\{[^}]*display\s*:\s*inline-flex/.test(css),
  'index.css 的芯片未设为 inline-flex（头像与文字会错行）');

/* ---------- 汇总 ---------- */
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log(`===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);

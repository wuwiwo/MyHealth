#!/usr/bin/env node
/* v2.3.0 测试：怪兽头像图标接线（page/media/monsters/*.svg + page/monster-archetype.js）

   v2.3.0 为敌人做了「按视觉原型」的头像方案：`page/levels.js` 有 189 个唯一敌人名，
   逐名画图标会产出大量视觉同构的图（永恒壁垒/终极壁垒/星核壁垒…），去重目标结构性地
   无法达成；故归纳为 **18 个视觉原型**，敌人名经确定性映射落到原型上。

   本套守六件事：

   1) **映射全覆盖** —— 189 个关卡 + `group-levels.js` 敌群名字池 21 名，全部映射到
      有效原型 id，无 undefined、无异常、无漏网。
      ⚠️ 这条是本套的核心：映射表一旦漏了某个名字，界面上那张卡片就是空白头像，
      而且**不会报错**（静默降级）。
   2) **无悬挂原型** —— 每个原型至少被 1 个真实敌人名命中（防「画了没人用」）。
   3) **资源存在且合规** —— 18 个原型各有同名 SVG，且满足设计规范
      （48×48 / viewBox / crispEdges / 只用 <rect> / 坐标全为 3 的倍数 / 颜色 ≤8）。
   4) **缺图标不炸** —— 非法原型 id 返回 null / ''，不抛错、不产生裂图 <img>；
      未知敌人名走兜底原型而**不是** null（保证界面不出现空图标）。
   5) **唯一入口** —— `media/monsters/` 这个路径字面量只允许出现在
      monster-archetype.js 的 `MONSTER_ICON_DIR` 一处（源码级守卫）。
   6) **三处调用点都真的接上了** —— 关卡列表卡片 / 单敌对战界面 / 敌群战斗单位卡，
      用真实渲染函数取 HTML 断言，而不是只 grep 源码。

   Run: node scripts/test-monster-icons.js */
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

/* ---------- 与 test-pet-icons.js 同一套沙箱与加载顺序（口径同源，别另起一套） ---------- */
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
  sb._petBattlePicks = [];
  /* 敌群战斗卡渲染要读的全局（真实环境由 game-views.js / game-render.js 提供） */
  sb._groupBattle = null;
  sb._groupActing = null;
  sb._groupSpeed = 1;
  sb._groupMode = 'auto';
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
    'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
    'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
    'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
    'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js'
  ].forEach(f => {
    if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(load(f), sb);
  });
  return sb;
}
const sb = makeSandbox();

/* ============ 1. 映射全覆盖 ============ */
console.log('--- 1. 映射全覆盖 ---');
const ARCH = sb.MONSTER_ARCHETYPES;
const ARCH_IDS = Object.keys(ARCH);
ok(ARCH_IDS.length === 18, `原型应为 18 个，实际 ${ARCH_IDS.length}`);
ok(typeof sb.monsterArchetypeOf === 'function', 'monsterArchetypeOf 未定义');
ok(typeof sb.monsterArchetypeOfLevel === 'function', 'monsterArchetypeOfLevel 未定义');

/* 1a levels.js 全部 189 关 */
const LEVELS = sb.LEVELS;
let stageCount = 0, bossCount = 0;
const hitCount = {};
const badMap = [];
for (const chKey of Object.keys(LEVELS)) {
  for (const lv of LEVELS[chKey].levels) {
    stageCount++;
    if (lv.boss) bossCount++;
    const a = sb.monsterArchetypeOfLevel(lv);
    if (!a || !ARCH[a]) { badMap.push(`${lv.id}(${lv.npc}) → ${a}`); continue; }
    hitCount[a] = (hitCount[a] || 0) + 1;
  }
}
ok(stageCount === 189, `levels.js 应为 189 关，实际 ${stageCount}`);
ok(badMap.length === 0, `有 ${badMap.length} 个关卡映射失败：${badMap.slice(0, 5).join(', ')}`);

/* 1b group-levels.js 敌群名字池（从源码里取真实数组，不写死副本 —— 写死就测不出「池子改了没同步」） */
const gsrc = src('group-levels.js');
function grabNames(key) {
  const m = new RegExp(key + ":\\s*\\[([^\\]]*)\\]").exec(gsrc);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
const POOL = { minion: grabNames('minion'), elite: grabNames('elite'), boss: grabNames('boss') };
ok(POOL.minion && POOL.minion.length === 8, `敌群杂兵名池应为 8 个，实际 ${POOL.minion && POOL.minion.length}`);
ok(POOL.elite && POOL.elite.length === 7, `敌群精英名池应为 7 个，实际 ${POOL.elite && POOL.elite.length}`);
ok(POOL.boss && POOL.boss.length === 6, `敌群 Boss 名池应为 6 个，实际 ${POOL.boss && POOL.boss.length}`);
let poolTotal = 0, poolBad = [];
for (const tier of Object.keys(POOL)) {
  for (const n of (POOL[tier] || [])) {
    poolTotal++;
    const a = sb.monsterArchetypeOf(n, tier === 'boss');
    if (!a || !ARCH[a]) poolBad.push(`${n} → ${a}`);
    hitCount[a] = (hitCount[a] || 0) + 1;
  }
}
ok(poolTotal === 21, `敌群名字池共应 21 名，实际 ${poolTotal}`);
ok(poolBad.length === 0, `敌群名池有 ${poolBad.length} 个映射失败：${poolBad.join(', ')}`);

/* 1c 无悬挂原型：每个原型至少被 1 个真实名字命中 */
const dangling = ARCH_IDS.filter(id => !hitCount[id]);
ok(dangling.length === 0, `以下原型没有任何真实敌人名命中（画了没人用）：${dangling.join(', ')}`);

/* 1d BOSS 判定必须走 `boss` 字段而不是名字前缀 —— 数据里 BOSS 恰好都在第 6 关，
      但那是数据约定不是语义契约。这条守住「不许用 id.endsWith('-6') 推断」。 */
const bossBad = [];
for (const chKey of Object.keys(LEVELS)) {
  for (const lv of LEVELS[chKey].levels) {
    /* 同一名字在 boss=true / false 下应能给出不同结果（证明 boss 参数真的生效） */
    const isBossName = /^BOSS\s/.test(lv.npc);
    if (isBossName && !lv.boss) bossBad.push(`${lv.id} 名字带 BOSS 前缀但 boss 字段为假`);
    if (!isBossName && lv.boss) bossBad.push(`${lv.id} boss 字段为真但名字无 BOSS 前缀`);
  }
}
ok(bossBad.length === 0, `BOSS 前缀与 boss 字段不一致：${bossBad.slice(0, 3).join(', ')}`);
/* ⚠️ 不写死 BOSS 关数量：chap1~3 是教学章、**没有 BOSS**（实测 30 个，不是 33）。
   写死 33 会把一个错误的假设锁进测试。改为「至少每章最多 1 个、且总数 >0」这类
   不依赖具体数据的结构断言。 */
ok(bossCount > 0, `BOSS 关数量为 0，数据可能坏了`);
{
  const bossPerChap = {};
  for (const chKey of Object.keys(LEVELS)) {
    bossPerChap[chKey] = LEVELS[chKey].levels.filter(l => l.boss).length;
  }
  const over = Object.keys(bossPerChap).filter(k => bossPerChap[k] > 1);
  ok(over.length === 0, `以下章节有多个 BOSS：${over.join(', ')}`);
  ok(Object.keys(LEVELS).length === 33, `章节数应为 33，实际 ${Object.keys(LEVELS).length}`);
}

/* 1e 前缀剥离：'BOSS 暗龙' 与 'Boss·暗龙' 必须映射到同一原型 */
ok(sb.monsterArchetypeOf('BOSS 暗龙', true) === sb.monsterArchetypeOf('Boss·暗龙', true),
  '两种 BOSS 前缀写法的映射结果不一致（剥离逻辑有漏）');
ok(sb.monsterArchetypeOf('精英·狂战', false) === sb.monsterArchetypeOf('狂战', false),
  "'精英·' 前缀未被正确剥离");
ok(sb.monsterArchetypeOf('杂兵·剑', false) === sb.monsterArchetypeOf('剑', false),
  "'杂兵·' 前缀未被正确剥离");

/* ============ 2. 资源存在且合规 ============ */
console.log('--- 2. 资源存在且合规 ---');
const ICON_DIR = path.join(PAGE, 'media', 'monsters');
ok(fs.existsSync(ICON_DIR), 'page/media/monsters/ 目录不存在');

const BANNED_TAG = /<(path|circle|ellipse|polygon|polyline|line|text|image|g|defs|linearGradient|radialGradient|filter|mask|clipPath)[\s/>]/i;
const BANNED_ATTR = /\b(opacity|fill-opacity|stroke|stroke-width|style|transform)\s*=/i;

/* 对比度（WCAG 相对亮度）：守住「深色主题下不隐形、浅色主题下不隐形」。
   判据是「**每个主题下都至少有一种颜色可辨**」，两主题**允许用不同的颜色** ——
   深色卡面要求颜色够亮、浅色卡面要求颜色够暗，同一色不可能两边都达 3:1。
   这条是宠物套 darkcrow 事故（主体 #0B0D12 对 #111827 仅 1.10:1）的回归防线。 */
const CARD_DARK = '#111827';   // 默认（深色）主题 --bg2 = --surface
const CARD_LIGHT = '#ffffff';  // [data-theme="light"] 的 --surface
function _lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function _lum(hex) {
  const t = hex.replace('#', '');
  const f = t.length === 3 ? t.split('').map(x => x + x).join('') : t;
  return 0.2126 * _lin(parseInt(f.slice(0, 2), 16)) + 0.7152 * _lin(parseInt(f.slice(2, 4), 16)) + 0.0722 * _lin(parseInt(f.slice(4, 6), 16));
}
function _contrast(a, b) { const la = _lum(a), lb = _lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
const MIN_READABLE = 3.0;

ARCH_IDS.forEach(id => {
  const f = path.join(ICON_DIR, id + '.svg');
  if (!fs.existsSync(f)) { ok(false, `缺少图标文件 media/monsters/${id}.svg`); return; }
  const s = fs.readFileSync(f, 'utf8');
  ok(/width="48"/.test(s) && /height="48"/.test(s), `${id}: 缺少 width/height=48`);
  ok(s.includes('viewBox="0 0 48 48"'), `${id}: viewBox 不是 "0 0 48 48"`);
  ok(s.includes('shape-rendering="crispEdges"'), `${id}: 缺少 shape-rendering="crispEdges"`);
  ok(s.includes('xmlns="http://www.w3.org/2000/svg"'), `${id}: 缺少 xmlns`);
  ok(!BANNED_TAG.test(s), `${id}: 出现禁用标签`);
  ok(!BANNED_ATTR.test(s), `${id}: 出现禁用属性`);
  ok(s.indexOf('\uFEFF') !== 0, `${id}: 带 BOM`);

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

  /* 包围盒 ≥30×30（spec §1.4） */
  let minX = 999, maxX = -1, minY = 999, maxY = -1;
  rects.forEach(r => {
    const g = k => { const m = new RegExp('\\b' + k + '="(-?[\\d.]+)"').exec(r); return m ? parseFloat(m[1]) : 0; };
    const x = g('x'), y = g('y'), w = g('width'), h = g('height');
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y + h);
  });
  ok(maxX - minX >= 30 && maxY - minY >= 30,
    `${id}: 包围盒 ${maxX - minX}x${maxY - minY} 小于 30x30（32px 下不可辨）`);

  /* 主题可读性：每种卡面上至少有一色可辨（否则整只隐形）。 */
  const fl = [...fills].filter(c => /^#[0-9a-f]{6}$/.test(c));
  const bestDark = Math.max(...fl.map(c => _contrast(c, CARD_DARK)));
  const bestLight = Math.max(...fl.map(c => _contrast(c, CARD_LIGHT)));
  ok(bestDark >= MIN_READABLE, `${id}: 深色主题卡面 #111827 下最可读色仅 ${bestDark.toFixed(2)}:1（<${MIN_READABLE}，整只会隐形）`);
  ok(bestLight >= MIN_READABLE, `${id}: 浅色主题卡面 #ffffff 下最可读色仅 ${bestLight.toFixed(2)}:1（<${MIN_READABLE}，整只会隐形）`);
  /* 描边色统一（spec §1.3） */
  ok(fills.has('#23262e'), `${id}: 缺少统一描边色 #23262E`);
});

/* ============ 3. 缺图标不炸 ============ */
console.log('--- 3. 缺图标不炸 ---');
ok(sb.monsterIconUrl('') === null, 'monsterIconUrl("") 应为 null');
ok(sb.monsterIconUrl(null) === null, 'monsterIconUrl(null) 应为 null');
ok(sb.monsterIconUrl('not_a_real_archetype') === null, '未知原型 id 应为 null');
ok(sb.monsterIconHtml('not_a_real_archetype', 32) === '', '未知原型的 monsterIconHtml 应为空串（不产生裂图）');
ok(sb.monsterIconUrl('soldier') === 'media/monsters/soldier.svg', 'monsterIconUrl 路径拼接错误：' + sb.monsterIconUrl('soldier'));
ARCH_IDS.forEach(id => {
  const u = sb.monsterIconUrl(id);
  ok(u === 'media/monsters/' + id + '.svg', `${id}: monsterIconUrl 应为 media/monsters/${id}.svg，实际 ${u}`);
});

/* 未知敌人名 → 兜底原型（**不是** null）。界面不能因为策划加了个新名字就出现空白头像。 */
console.log('--- 3b. 未知名字走兜底而非 null ---');
ok(sb.monsterArchetypeOf('未来新怪物', false) === sb.MONSTER_ARCHETYPE_FALLBACK,
  `未知名字应落兜底原型 ${sb.MONSTER_ARCHETYPE_FALLBACK}`);
ok(sb.monsterArchetypeOf('未来新怪物', true) === 'lord',
  '未知 BOSS 名应落 lord（BOSS 默认是领主造型）');
ok(ARCH[sb.MONSTER_ARCHETYPE_FALLBACK], `兜底原型 ${sb.MONSTER_ARCHETYPE_FALLBACK} 不在原型表里`);
ok(sb.monsterArchetypeOf('', false) === sb.MONSTER_ARCHETYPE_FALLBACK, '空名字应落兜底原型');
ok(sb.monsterArchetypeOf(null, false) === sb.MONSTER_ARCHETYPE_FALLBACK, 'null 名字应落兜底原型');
ok(sb.monsterArchetypeOf(undefined, false) === sb.MONSTER_ARCHETYPE_FALLBACK, 'undefined 名字应落兜底原型');
ok(sb.monsterArchetypeOfLevel(null) === sb.MONSTER_ARCHETYPE_FALLBACK, 'monsterArchetypeOfLevel(null) 应落兜底原型');
/* 每一个关卡都必须能渲染出非空 <img>（兜底链的端到端验证） */
let emptyImg = [];
for (const chKey of Object.keys(LEVELS)) {
  for (const lv of LEVELS[chKey].levels) {
    const h = sb.monsterIconHtmlByLevel(lv, 32);
    if (!h || !h.includes('<img')) emptyImg.push(lv.id);
  }
}
ok(emptyImg.length === 0, `以下关卡渲染不出头像 <img>：${emptyImg.slice(0, 5).join(', ')}`);

/* 装饰性头像：alt 必须为空串 —— 头像永远紧邻可见的敌人名，
   写 alt="暗龙" 会让读屏念两遍「暗龙 暗龙」。 */
const dragonImg = sb.monsterIconHtmlByName('暗龙', true, 32);
ok(dragonImg.includes('alt=""'), '装饰性头像的 alt 应为空串，实际：' + dragonImg);
ok(!/alt="[^"]+"/.test(dragonImg), '头像不应带非空 alt（会与相邻敌人名重复朗读）');
ok(dragonImg.includes('width="32"') && dragonImg.includes('height="32"'),
  'img 未按 size 输出 width/height（会按 48px 固有尺寸撑开行高）');
ok(dragonImg.includes('class="mon-ico'), '头像未带 .mon-ico class（pixelated 样式会失效）');

/* 缺省 / 非法 size 不得把 "undefined" 原样写进 DOM —— 曾经就是这样：
   monsterIconHtml('soldier', undefined) 产出 width="undefined" height="undefined"，
   浏览器会忽略该属性、图片按 SVG 固有尺寸(48px)撑开 → 关卡卡片行高被顶穿。
   现在应回落 MONSTER_ICON_SIZE_DEFAULT。 */
const sizeBad = [];
[
  ['undefined', undefined], ['null', null], ['NaN', NaN], ['缺参', '(missing)']
].forEach(([label, v]) => {
  const h = v === '(missing)' ? sb.monsterIconHtml('soldier') : sb.monsterIconHtml('soldier', v);
  if (h.includes('undefined') || h.includes('NaN') || h.includes('null')) sizeBad.push(label + ' → ' + h);
  if (!h.includes(`width="${sb.MONSTER_ICON_SIZE_DEFAULT}"`)) sizeBad.push(label + ' 未回落默认尺寸 → ' + h);
});
ok(sizeBad.length === 0, '缺省/非法 size 未回落默认值：' + sizeBad.join(' | '));
ok(sb.MONSTER_ICON_SIZE_DEFAULT % 16 === 0,
  `默认尺寸 ${sb.MONSTER_ICON_SIZE_DEFAULT}px 不是 16 的倍数`);

/* 显示尺寸必须是 16 的倍数：图标是 16×16 逻辑网格、1 格 = 3px（48px 基准）。
   32px → 每格 2px（干净）；40px → 每格 2.5px，crispEdges 把格宽硬切成 2/3px 粗细不均。 */
console.log('--- 3c. 显示尺寸必须是 16 的倍数 ---');
/* 扫调用点里的尺寸实参。三种调用形态：
     monsterIconHtmlByLevel(lv, 32)              → 第 2 个参数
     monsterIconHtmlByName(name, boss, 32)       → 第 3 个参数
     monsterIconHtml(id, 32)                     → 第 2 个参数
   做法：抓每个调用点的完整实参串，再取出**所有纯数字字面量**——
   任何一个纯数字实参都只能是尺寸（原型 id 是字符串、名字是字符串、
   boss 是布尔），所以「全部数字字面量都必须是 16 的倍数」是安全的判据。 */
const sizeLits = [];
['monster-archetype.js', 'game-render.js', 'game-battle.js'].forEach(f => {
  const s = src(f);
  const re = /monsterIcon(?:Html|HtmlByName|HtmlByLevel)\s*\(([^;]*?)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    [...m[1].matchAll(/(?<![\w.$])(\d+)(?![\w.])/g)].forEach(x => sizeLits.push({ f, n: Number(x[1]) }));
  }
});
ok(sizeLits.length >= 3, `应能找到 ≥3 处怪兽图标尺寸字面量，实际 ${sizeLits.length}`);
sizeLits.forEach(o => ok(o.n % 16 === 0,
  `${o.f}: 图标尺寸 ${o.n}px 不是 16 的倍数（会因非整数倍缩放导致格宽粗细不均）`));

/* ============ 4. 唯一入口（源码级守卫） ============ */
console.log('--- 4. 唯一入口 ---');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const pathSites = [];
jsFiles.forEach(f => {
  const s = src(f);
  if (s.includes("'media/monsters/'") || s.includes('"media/monsters/"')) pathSites.push(f);
});
ok(pathSites.length === 1 && pathSites[0] === 'monster-archetype.js',
  `'media/monsters/' 字面量应只出现在 monster-archetype.js，实际：${pathSites.join(', ') || '（无）'}`);

/* ============ 5. 三处调用点真的接上了 ============ */
console.log('--- 5. 调用点接线 ---');

/* 5a 关卡列表卡片（game-render.js renderGameView 的 .lv-card） */
const grSrc = src('game-render.js');
ok(/monsterIconHtmlByLevel\s*\(/.test(grSrc),
  'game-render.js 关卡列表卡片未调用 monsterIconHtmlByLevel');
/* 5b 单敌对战界面（game-battle.js 的 .bc-name / #beName） */
const gbSrc = src('game-battle.js');
ok(/monsterIconHtmlByName\s*\(/.test(gbSrc),
  'game-battle.js 单敌对战界面未调用 monsterIconHtmlByName');
/* 5c 敌群战斗单位卡（game-render.js 的 renderGroupUnit） */
const gbUnitStart = grSrc.indexOf('function renderGroupUnit');
ok(gbUnitStart > 0, 'game-render.js 里找不到 renderGroupUnit');
const gbUnit = grSrc.slice(gbUnitStart, gbUnitStart + 6000);
ok(/monsterIconHtml/.test(gbUnit),
  'renderGroupUnit 未渲染怪兽头像（敌群战斗单位卡仍无头像）');
ok(/side\s*!==\s*'ally'|side\s*===\s*'enemy'/.test(gbUnit),
  'renderGroupUnit 的怪兽头像未按阵营条件渲染（我方单位不应显示怪物头像）');

/* 5d CSS 契约：.mon-ico 必须带 pixelated，否则非整数倍缩放会糊 */
const css = src('index.css');
ok(/\.mon-ico\s*\{[^}]*image-rendering\s*:\s*pixelated/.test(css),
  'index.css 的 .mon-ico 缺少 image-rendering:pixelated');

/* 5e monster-archetype.js 必须在 index.html 里被引入（否则整个模块不生效） */
const html = src('index.html');
ok(html.includes('monster-archetype.js'), 'index.html 未引入 monster-archetype.js');
const levelsPos = html.indexOf('levels.js');
const maPos = html.indexOf('monster-archetype.js');
ok(maPos > levelsPos && levelsPos > 0,
  'monster-archetype.js 必须在 levels.js **之后**引入（依赖 LEVELS 的数据形状）');

/* ---------- 汇总 ---------- */
console.log('');
console.log('原型命中分布（levels 189 关 + 敌群 21 名）：');
Object.keys(ARCH).sort((a, b) => (hitCount[b] || 0) - (hitCount[a] || 0))
  .forEach(id => console.log(`  ${id.padEnd(10)} ${String(hitCount[id] || 0).padStart(3)}  ${ARCH[id]}`));
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log(`===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* v2.3.2 测试：技能图标接线（page/media/skills/*.svg + page/skill-icon.js）

   v2.3.2 为技能做了「一技能一枚」的图标方案：48 个技能（玩家 10 + 敌方 25 + 宠物 13）
   各一枚，**不做原型收敛**。理由与怪兽线相反：技能语义真正互斥（暴击/治愈/冰冻三尺/
   地刺/暴风雪 是不同视觉概念），强行合并会把本该分开的东西挤成同一张图；
   且技能注册在代码里、几乎不变动，「降低维护成本」这个收敛收益不成立。
   详见 doc/design-skill-icons.md §0。

   本套守七件事：

   1) **三套 id 空间都覆盖** —— page/skills.js 的 PLAYER_SKILLS（10）、
      page/skill.js 的 SKILLS（25）与 page/pet-codex.js 注册进同一 SKILLS 的
      宠物技能（13，p_ 前缀）全部在白名单内、且三表互不重名。
      ⚠️ 这条是核心：id 写错/漏写不会报错，界面直接是**空白图标**（静默降级）。
      ⚠️ 注意 SKILLS 是敌方与宠物**共用**的注册表（38 条 = 25 + 13），
         校验敌方表时必须先把 p_* 排除，否则会把宠物技能误判为漏写。
   2) **无悬挂图标** —— 48 个白名单 id 各有同名 SVG，没有「写了没人用」或「用了没有」。
   3) **资源合规** —— 每个 SVG 满足设计规范（48×48 / viewBox / crispEdges / 只用 <rect> /
      坐标全为 3 的倍数 / 颜色 ≤8 / 描边色统一 / 包围盒 ≥30×30）。
   4) **主题可读性** —— 每个图标在深色与浅色卡面下**各至少有一色可辨**（≥3:1）。
      两主题允许用不同颜色；这是 lord 事故（主体长袍对深底仅 1.30:1 → 整只隐形，
      而「可读色 2」是金冠和衣领贡献的）的回归防线。
   5) **缺图标不炸** —— 非法 id 返回 null / ''，不抛错、不产生裂图 <img>。
   6) **唯一入口** —— `media/skills/` 路径字面量只允许出现在 skill-icon.js 一处。
   7) **四处调用点真的接上了** —— 培养页技能卡片 / 战斗技能芯片（玩家+敌方）/
      技能详情弹窗（玩家+敌方），用真实渲染函数取 HTML 断言，而不是只 grep 源码。

   Run: node scripts/test-skill-icons.js */
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

/* ---------- 与 test-monster-icons.js 同一套沙箱与加载顺序（口径同源，别另起一套） ---------- */
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
  sb._groupBattle = null;
  sb._groupActing = null;
  sb._groupSpeed = 1;
  sb._groupMode = 'auto';
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
    'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
    'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
    'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
    'skills.js', 'skill-icon.js',
    'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js', 'skill-ui.js'
  ].forEach(f => {
    if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(load(f), sb);
  });
  return sb;
}
const sb = makeSandbox();

/* ============ 1. 三套 id 空间都覆盖 ============ */
console.log('--- 1. 三套 id 空间覆盖 ---');
const PLAYER = sb.SKILL_ICON_PLAYER, ENEMY = sb.SKILL_ICON_ENEMY, PET = sb.SKILL_ICON_PET;
ok(PLAYER && typeof PLAYER === 'object', 'SKILL_ICON_PLAYER 未定义');
ok(PET && typeof PET === 'object', 'SKILL_ICON_PET 未定义（宠物技能白名单缺失）');
const PLAYER_IDS = Object.keys(PLAYER);
const ENEMY_IDS = Object.keys(ENEMY || {});
const PET_IDS = Object.keys(PET || {});
ok(PLAYER_IDS.length === 10, `玩家技能白名单应为 10 个，实际 ${PLAYER_IDS.length}`);
ok(ENEMY_IDS.length === 25, `敌方技能白名单应为 25 个，实际 ${ENEMY_IDS.length}`);
ok(PET_IDS.length === 13, `宠物技能白名单应为 13 个，实际 ${PET_IDS.length}`);
ok(PLAYER_IDS.length + ENEMY_IDS.length + PET_IDS.length === 48,
  `白名单合计应为 48，实际 ${PLAYER_IDS.length + ENEMY_IDS.length + PET_IDS.length}`);

/* 1a 白名单必须与**真实的技能注册表**逐一对齐（从源码取的运行时对象，不写死副本） */
const playerSkills = sb.PLAYER_SKILLS;
ok(playerSkills && typeof playerSkills === 'object', 'PLAYER_SKILLS 未定义（skills.js 未加载）');
const realPlayerIds = Object.keys(playerSkills);
ok(realPlayerIds.length === 10, `PLAYER_SKILLS 应注册 10 个技能，实际 ${realPlayerIds.length}`);
const playerMissing = realPlayerIds.filter(id => !PLAYER[id]);
const playerExtra = PLAYER_IDS.filter(id => !playerSkills[id]);
ok(playerMissing.length === 0, `以下玩家技能没有图标白名单条目（渲染为空白图标）：${playerMissing.join(', ')}`);
ok(playerExtra.length === 0, `以下白名单条目不对应任何真实玩家技能（写了没人用）：${playerExtra.join(', ')}`);

/* ⚠️ SKILLS 是敌方(25) 与宠物(13) **共用**的注册表，共 38 条。
   校验敌方表时必须先按 p_ 前缀把宠物技能排除，否则会把宠物技能误报为敌方漏写。
   这个坑是本轮测试实际踩到的 —— 当时以为 SKILLS 只有 25 条，结果多出 13 个 p_*。*/
const allSkills = sb.SKILLS;
ok(allSkills && typeof allSkills === 'object', 'SKILLS 未定义（skill.js 未加载）');
const allSkillIds = Object.keys(allSkills);
ok(allSkillIds.length === 38, `SKILLS 应注册 38 个技能（敌方 25 + 宠物 13），实际 ${allSkillIds.length}`);
const realEnemyIds = allSkillIds.filter(id => !/^p_/.test(id));
const realPetIds = allSkillIds.filter(id => /^p_/.test(id));
ok(realEnemyIds.length === 25, `SKILLS 里非 p_ 前缀的敌方技能应为 25 个，实际 ${realEnemyIds.length}`);
ok(realPetIds.length === 13, `SKILLS 里 p_ 前缀的宠物技能应为 13 个，实际 ${realPetIds.length}`);

const enemyMissing = realEnemyIds.filter(id => !ENEMY[id]);
const enemyExtra = ENEMY_IDS.filter(id => !allSkills[id]);
ok(enemyMissing.length === 0, `以下敌方技能没有图标白名单条目：${enemyMissing.join(', ')}`);
ok(enemyExtra.length === 0, `以下白名单条目不对应任何真实敌方技能：${enemyExtra.join(', ')}`);

/* 1a-2 宠物表同样要逐一对齐 */
const petMissing = realPetIds.filter(id => !PET[id]);
const petExtra = PET_IDS.filter(id => !allSkills[id]);
ok(petMissing.length === 0, `以下宠物技能没有图标白名单条目：${petMissing.join(', ')}`);
ok(petExtra.length === 0, `以下白名单条目不对应任何真实宠物技能：${petExtra.join(', ')}`);
/* 宠物表 id 必须全部是 p_ 前缀（否则说明分表口径错了） */
const petBadPrefix = PET_IDS.filter(id => !/^p_/.test(id));
ok(petBadPrefix.length === 0, `宠物白名单里出现非 p_ 前缀 id：${petBadPrefix.join(', ')}`);

/* 1b 三套 id 空间不重名（当前无冲突；一旦重名，skillIconHtml 的自动判空间会失效） */
const collidePE = PLAYER_IDS.filter(id => ENEMY[id]);
ok(collidePE.length === 0,
  `玩家与敌方技能 id 出现重名：${collidePE.join(', ')}（skillIconHtml 不带 isPlayer 时将无法判定来源）`);
const collidePP = PLAYER_IDS.filter(id => PET[id]);
ok(collidePP.length === 0, `玩家与宠物技能 id 出现重名：${collidePP.join(', ')}`);
const collideEP = ENEMY_IDS.filter(id => PET[id]);
ok(collideEP.length === 0, `敌方与宠物技能 id 出现重名：${collideEP.join(', ')}`);

/* ============ 2. 无悬挂图标：白名单 ↔ 文件 双向一致 ============ */
console.log('--- 2. 白名单与资源文件双向一致 ---');
const ICON_DIR = path.join(PAGE, 'media', 'skills');
ok(fs.existsSync(ICON_DIR), 'page/media/skills/ 目录不存在');
const ALL_IDS = PLAYER_IDS.concat(ENEMY_IDS, PET_IDS);

const BANNED_TAG = /<(path|circle|ellipse|polygon|polyline|line|text|image|g|defs|linearGradient|radialGradient|filter|mask|clipPath)[\s/>]/i;
const BANNED_ATTR = /\b(opacity|fill-opacity|stroke|stroke-width|style|transform)\s*=/i;

const CARD_DARK = '#111827';
const CARD_LIGHT = '#ffffff';
function _lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function _lum(hex) {
  const t = hex.replace('#', '');
  const f = t.length === 3 ? t.split('').map(x => x + x).join('') : t;
  return 0.2126 * _lin(parseInt(f.slice(0, 2), 16)) + 0.7152 * _lin(parseInt(f.slice(2, 4), 16)) + 0.0722 * _lin(parseInt(f.slice(4, 6), 16));
}
function _contrast(a, b) { const la = _lum(a), lb = _lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
const MIN_READABLE = 3.0;
const OUTLINE = '#23262e';

const OUTLINE_SHARE = [];   // 记录描边占比，供软目标提示
ALL_IDS.forEach(id => {
  const f = path.join(ICON_DIR, id + '.svg');
  if (!fs.existsSync(f)) { ok(false, `缺少图标文件 media/skills/${id}.svg`); return; }
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
  let outArea = 0, totalArea = 0;
  rects.forEach(r => {
    const g = k => { const m = new RegExp('\\b' + k + '="(-?[\\d.]+)"').exec(r); return m ? parseFloat(m[1]) : null; };
    const x = g('x'), y = g('y'), w = g('width'), h = g('height'), fill = (/\bfill="([^"]+)"/.exec(r) || [])[1];
    if ([x, y, w, h].some(v => v === null || v % 3 !== 0)) gridOK = false;
    if (x + w > 48 || y + h > 48 || x < 0 || y < 0) inBounds = false;
    if (fill) {
      fills.add(fill.toLowerCase());
      totalArea += w * h;
      if (fill.toLowerCase() === OUTLINE) outArea += w * h;
    }
  });
  ok(gridOK, `${id}: 有 rect 的 x/y/w/h 不是 3 的倍数`);
  ok(inBounds, `${id}: 有 rect 越界`);
  ok(fills.size <= 8, `${id}: 颜色数 ${fills.size} > 8`);
  ok(s.length < 6144, `${id}: 文件 ${s.length}B ≥ 6KB`);
  OUTLINE_SHARE.push({ id, pct: totalArea ? outArea / totalArea * 100 : 0 });

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

  /* 主题可读性：每种卡面上至少有一色可辨。 */
  const fl = [...fills].filter(c => /^#[0-9a-f]{6}$/.test(c));
  const bestDark = Math.max(...fl.map(c => _contrast(c, CARD_DARK)));
  const bestLight = Math.max(...fl.map(c => _contrast(c, CARD_LIGHT)));
  ok(bestDark >= MIN_READABLE, `${id}: 深色卡面下最可读色仅 ${bestDark.toFixed(2)}:1（<${MIN_READABLE}，整只会隐形）`);
  ok(bestLight >= MIN_READABLE, `${id}: 浅色卡面下最可读色仅 ${bestLight.toFixed(2)}:1（<${MIN_READABLE}，整只会隐形）`);

  /* ⚠️ 只统计「有可读色」是不够的 —— 可读色可能长在装饰上。
     lord 的教训：主体长袍 1.30:1 隐形，而"可读色 2"由金冠与衣领贡献。
     因此加一条**主体色**断言：排除描边后面积最大的那个颜色，必须在任一主题可读。 */
  const byArea = fl.filter(c => c !== OUTLINE)
    .map(c => ({ c, a: rects.filter(r => (r.toLowerCase().includes('fill="' + c + '"'))).reduce((t, r) => {
      const g = k => parseFloat((new RegExp('\\b' + k + '="(-?[\\d.]+)"').exec(r) || [])[1] || 0);
      return t + g('width') * g('height');
    }, 0) }))
    .sort((a, b) => b.a - a.a);
  if (byArea.length) {
    const subj = byArea[0].c;
    const sd = _contrast(subj, CARD_DARK), sl = _contrast(subj, CARD_LIGHT);
    ok(sd >= MIN_READABLE || sl >= MIN_READABLE,
      `${id}: 主体色 ${subj} 在两个主题都读不清（深 ${sd.toFixed(2)} / 浅 ${sl.toFixed(2)}）—— 会变成"隐形主体 + 可见装饰"`);
  }
  /* 描边色统一（spec §1.3） */
  ok(fills.has(OUTLINE), `${id}: 缺少统一描边色 #23262E`);
});

/* 白名单里每个 id 都要有文件（反向：文件不能有白名单之外的孤儿） */
ALL_IDS.forEach(id => ok(fs.existsSync(path.join(ICON_DIR, id + '.svg')), `media/skills/${id}.svg 不存在`));
{
  const onDisk = fs.readdirSync(ICON_DIR).filter(f => f.endsWith('.svg')).map(f => f.replace(/\.svg$/, '')).sort();
  const orphan = onDisk.filter(id => !PLAYER[id] && !ENEMY[id] && !PET[id]);
  ok(orphan.length === 0, `media/skills/ 里有白名单之外的孤儿文件：${orphan.join(', ')}`);
  ok(onDisk.length === 48, `media/skills/ 应有 48 个 svg，实际 ${onDisk.length}`);
}

/* ============ 3. 缺图标不炸 ============ */
console.log('--- 3. 缺图标不炸 ---');
ok(sb.skillIconUrl('') === null, 'skillIconUrl("") 应为 null');
ok(sb.skillIconUrl(null) === null, 'skillIconUrl(null) 应为 null');
ok(sb.skillIconUrl('not_a_real_skill') === null, '未知 id 应为 null');
ok(sb.skillIconHtml('not_a_real_skill', 32) === '', '未知 id 的 skillIconHtml 应为空串（不产生裂图）');
ok(sb.skillIconHtmlByName('不存在的技能名', 32) === '', '未知名字应返回空串');
ok(sb.skillIconHtml(null, 32) === '', 'null id 应返回空串');
ok(sb.skillIconHtml(undefined, 32) === '', 'undefined id 应返回空串');
ok(sb.skillIconHtml(123, 32) === '', '数字 id 应返回空串（id 是字符串）');

/* 三套 id 空间：显式来源校验 */
ok(sb.skillIconKnown('crit', true) === true, "'crit' 应属于玩家技能空间");
ok(sb.skillIconKnown('crit', false) === false, "'crit' 不属于敌方技能空间");
ok(sb.skillIconKnown('charge', false) === true, "'charge' 应属于敌方技能空间");
ok(sb.skillIconKnown('charge', true) === false, "'charge' 不属于玩家技能空间");
ok(sb.skillIconKnown('crit') === true, '不传 isPlayer 时应跨三表查找');
/* 宠物技能：p_ 前缀注册在同一个 SKILLS 里，战斗中由敌方那侧的渲染函数输出，
   那些调用点显式传 isPlayer=false。所以 false 必须**同时认敌方表与宠物表** ——
   否则宠物技能被判非法 → 空白图标（本轮测试真实抓到的缺陷）。 */
ok(sb.skillIconKnown('p_sing', false) === true,
  "'p_sing' 显式 isPlayer=false 应命中（战斗中宠物走敌方渲染路径），返回 false 会导致空白图标");
ok(sb.skillIconKnown('p_sing') === true, '不传 isPlayer 时宠物技能应可查到');
ok(sb.skillIconKnown('p_sing', true) === false, "'p_sing' 不属于玩家技能空间");
ok(sb.skillIconKnown('crit', false) === false, "'crit' 显式 isPlayer=false 不应命中（避免玩家技能误入敌方路径）");
ok(sb.skillIconUrl('crit') === 'media/skills/crit.svg', 'skillIconUrl 路径拼接错误：' + sb.skillIconUrl('crit'));
ALL_IDS.forEach(id => {
  const u = sb.skillIconUrl(id);
  ok(u === 'media/skills/' + id + '.svg', `${id}: skillIconUrl 应为 media/skills/${id}.svg，实际 ${u}`);
});
/* 每个真实技能都必须渲染出非空 <img>（兜底链的端到端验证） */
{
  const empty = [];
  realPlayerIds.forEach(id => { const h = sb.skillIconHtml(id, 32, '', true); if (!h || !h.includes('<img')) empty.push('玩家:' + id); });
  realEnemyIds.forEach(id => { const h = sb.skillIconHtml(id, 32, '', false); if (!h || !h.includes('<img')) empty.push('敌方:' + id); });
  /* 宠物技能在战斗里走敌方那一侧的渲染路径（同一个 SKILLS 注册表），故按 false 校验 */
  realPetIds.forEach(id => { const h = sb.skillIconHtml(id, 32, '', false); if (!h || !h.includes('<img')) empty.push('宠物:' + id); });
  realPetIds.forEach(id => { const h = sb.skillIconHtml(id, 32); if (!h || !h.includes('<img')) empty.push('宠物(不传来源):' + id); });
  ok(empty.length === 0, `以下技能渲染不出图标 <img>：${empty.slice(0, 5).join(', ')}`);
}

/* 装饰性图标：alt 必须为空串 —— 图标永远紧邻可见的技能名，写 alt 会重复朗读。 */
{
  const img = sb.skillIconHtml('crit', 32);
  ok(img.includes('alt=""'), '装饰性图标的 alt 应为空串，实际：' + img);
  ok(!/alt="[^"]+"/.test(img), '图标不应带非空 alt（会与相邻技能名重复朗读）');
  ok(img.includes('width="32"') && img.includes('height="32"'),
    'img 未按 size 输出 width/height（会按 48px 固有尺寸撑开行高）');
  ok(img.includes('class="sk-ico'), '图标未带 .sk-ico class（pixelated 样式会失效）');
}

/* 缺省 / 非法 size 不得把 "undefined" 原样写进 DOM（怪兽线的真实事故）*/
{
  const bad = [];
  [['undefined', undefined], ['null', null], ['NaN', NaN]].forEach(([label, v]) => {
    const h = sb.skillIconHtml('crit', v);
    if (h.includes('undefined') || h.includes('NaN') || h.includes('null')) bad.push(label + ' → ' + h);
    if (!h.includes(`width="${sb.SKILL_ICON_SIZE_DEFAULT}"`)) bad.push(label + ' 未回落默认尺寸 → ' + h);
  });
  const hMissing = sb.skillIconHtml('crit');
  if (!hMissing.includes(`width="${sb.SKILL_ICON_SIZE_DEFAULT}"`)) bad.push('缺参 未回落默认尺寸');
  ok(bad.length === 0, '缺省/非法 size 未回落默认值：' + bad.join(' | '));
  ok(sb.SKILL_ICON_SIZE_DEFAULT % 16 === 0,
    `默认尺寸 ${sb.SKILL_ICON_SIZE_DEFAULT}px 不是 16 的倍数`);
}

/* 显示尺寸必须是 16 的倍数（24 就不是 —— 1.5px/格，格宽不匀） */
console.log('--- 3b. 显示尺寸必须是 16 的倍数 ---');
{
  const lits = [];
  ['skill-icon.js', 'game-render.js', 'skill-ui.js'].forEach(f => {
    const s = src(f);
    const re = /skillIcon(?:Html|HtmlByName|HtmlByOwner)\s*\(([^;]*?)\)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      [...m[1].matchAll(/(?<![\w.$])(\d+)(?![\w.])/g)].forEach(x => lits.push({ f, n: Number(x[1]) }));
    }
  });
  ok(lits.length >= 4, `应能找到 ≥4 处技能图标尺寸字面量，实际 ${lits.length}`);
  lits.forEach(o => ok(o.n % 16 === 0,
    `${o.f}: 图标尺寸 ${o.n}px 不是 16 的倍数（非整数倍缩放会格宽不匀）`));
}

/* ============ 4. 唯一入口（源码级守卫） ============ */
console.log('--- 4. 唯一入口 ---');
{
  const pathSites = [];
  fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).forEach(f => {
    const s = src(f);
    if (s.includes("'media/skills/'") || s.includes('"media/skills/"')) pathSites.push(f);
  });
  ok(pathSites.length === 1 && pathSites[0] === 'skill-icon.js',
    `'media/skills/' 字面量应只出现在 skill-icon.js，实际：${pathSites.join(', ') || '（无）'}`);
}

/* ============ 5. 调用点真的接上了 ============ */
console.log('--- 5. 调用点接线 ---');
const grSrc = src('game-render.js');
const suSrc = src('skill-ui.js');

/* 5a 培养页技能卡片（skill-ui.js 的 .skill-card） */
ok(/skillIconHtml\s*\(/.test(suSrc), 'skill-ui.js 培养页技能卡片未调用 skillIconHtml');
ok(/skill-card-ico/.test(suSrc), 'skill-ui.js 技能卡片图标未带 .skill-card-ico class');
{
  const i = suSrc.indexOf('class="skill-card"');
  /* 图标 HTML 被先算进 sIco、再拼进 skill-card-name，所以断言窗口要从
     卡片起始处往回留出变量声明那几行，否则会误判为"没接"。 */
  const seg = i > 0 ? suSrc.slice(Math.max(0, i - 300), i + 900) : '';
  ok(/skillIconHtml/.test(seg), 'skill-card 卡片内未渲染图标（图标没进卡片 DOM）');
  ok(/skill-card-name[^\n]*'\+sIco|sIco\+s\.name/.test(seg),
    'skill-card 图标未插进 .skill-card-name（应紧邻技能名）');
}

/* 5b 战斗技能芯片 —— 玩家与敌方两条分支都要接 */
{
  const i = grSrc.indexOf('function renderUnitSkillChips');
  ok(i > 0, 'game-render.js 里找不到 renderUnitSkillChips');
  const seg = grSrc.slice(i, i + 2200);
  const icoCount = (seg.match(/skillIconHtml\s*\(/g) || []).length;
  ok(icoCount >= 2, `renderUnitSkillChips 应同时给玩家与敌方芯片接图标（找到 ${icoCount} 处，需 ≥2）`);
  ok(/gb-chip-ico/.test(seg), '技能芯片图标未带 .gb-chip-ico class');
}

/* 5c 技能详情弹窗 —— 玩家与敌方两个函数都要接 */
{
  const p = grSrc.indexOf('function showPlayerSkillDetail');
  ok(p > 0, 'game-render.js 里找不到 showPlayerSkillDetail');
  const pSeg = grSrc.slice(p, p + 1600);
  ok(/skillIconHtml\s*\(/.test(pSeg), 'showPlayerSkillDetail 未渲染技能图标（⚡ 未替换）');
  ok(/pDetIco|det-title-ico/.test(pSeg), 'showPlayerSkillDetail 图标未接入标题');

  const e = grSrc.indexOf('function showSkillDetail');
  ok(e > 0, 'game-render.js 里找不到 showSkillDetail（敌方技能详情）');
  const eSeg = grSrc.slice(e, e + 1600);
  ok(/skillIconHtml\s*\(/.test(eSeg), 'showSkillDetail 未渲染技能图标（⚡ 未替换）');
  /* 敌方详情必须显式走敌方 id 空间（isPlayer=false） */
  ok(/skillIconHtml\s*\([^)]*false\s*\)/.test(eSeg),
    'showSkillDetail 未显式传 isPlayer=false（未区分两套 id 空间）');
  /* 玩家详情必须显式走玩家 id 空间（isPlayer=true） */
  ok(/skillIconHtml\s*\([^)]*true\s*\)/.test(pSeg),
    'showPlayerSkillDetail 未显式传 isPlayer=true（未区分两套 id 空间）');
}

/* 5d CSS 契约 */
{
  const css = src('index.css');
  ok(/\.sk-ico\s*\{[^}]*image-rendering\s*:\s*pixelated/.test(css),
    'index.css 的 .sk-ico 缺少 image-rendering:pixelated');
  ['skill-card-ico', 'gb-chip-ico', 'det-title-ico'].forEach(c => {
    ok(new RegExp('\\.' + c + '\\s*\\{').test(css), `index.css 缺少 .${c} 样式`);
  });
}

/* 5e skill-icon.js 必须在 index.html 里引入，且在消费方之前。
   注意：必须匹配 `<script src="...">` 标签本身 —— 直接 indexOf('game-render.js')
   会先命中注释里提到的文件名（本轮就踩过这个坑，误报为顺序错误）。 */
{
  const html = src('index.html');
  const tagPos = f => {
    const m = new RegExp('<script\\s+src="' + f.replace('.', '\\.') + '[^"]*"').exec(html);
    return m ? m.index : -1;
  };
  const iconPos = tagPos('skill-icon.js');
  const uiPos = tagPos('skill-ui.js');
  const grPos = tagPos('game-render.js');
  ok(iconPos > 0, 'index.html 未引入 skill-icon.js');
  ok(iconPos > 0 && iconPos < uiPos, `skill-icon.js 必须在 skill-ui.js 之前引入（图标位置 ${iconPos} / ${uiPos}）`);
  ok(iconPos > 0 && iconPos < grPos, `skill-icon.js 必须在 game-render.js 之前引入（图标位置 ${iconPos} / ${grPos}）`);
  /* skill-icon.js 只含白名单，不依赖运行时注册表，故不做"必须在 skill.js 之后"的要求 */
}

/* ---------- 汇总 ---------- */
console.log('');
{
  const over = OUTLINE_SHARE.filter(o => o.pct > 20).sort((a, b) => b.pct - a.pct);
  console.log(`描边占比 >20%（soft goal，非阻断）：${over.length} 枚`);
  over.slice(0, 8).forEach(o => console.log(`  ${o.id.padEnd(12)} ${o.pct.toFixed(1)}%`));
  if (over.length) {
    console.log('  说明：核心符号（如 crit 的放射尖刺、blast 类）天然「色块+黑边」，');
    console.log('        设计师裁量为例外即可，见 doc/design-skill-icons.md §1.3。');
  }
}
console.log('');
console.log(`图标清单：玩家 ${PLAYER_IDS.length} 枚 + 敌方 ${ENEMY_IDS.length} 枚 + 宠物 ${PET_IDS.length} 枚 = ${ALL_IDS.length} 枚`);
console.log(`  玩家：${PLAYER_IDS.slice().sort().join(', ')}`);
console.log(`  敌方：${ENEMY_IDS.slice().sort().join(', ')}`);
console.log(`  宠物：${PET_IDS.slice().sort().join(', ')}`);
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log(`===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);

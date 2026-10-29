#!/usr/bin/env node
/* v2.14.3 图鉴（page/codex.js）回归护栏
   需求：「可以查看技能、天赋、宠物介绍」——三个分栏全部只读、数据全部来自既有定义。

   本套件守 7 组不变量（**数量一律现场派生，不写死任何数字**）：
     [1] 模块挂载：按 index.html 的真实 <script> 顺序加载（codex.js 允许尚未写进 index.html）
     [2] 条目数量与数据源一致：宠物 = listPetCodex()、技能 = 玩家 + 宠物 + 敌群、天赋 = TALENTS
     [3] 每条都有非空描述（技能 desc / 天赋 desc / 宠物技能一句话说明）
     [4] 渲染结果无 undefined / NaN / [object Object]（三分栏 × 全筛选 × 搜索词 × 空结果）
     [5] 名称无重复（同一来源内唯一；跨来源同名必须带来源徽标区分）
     [6] a11y token 合规（codex.js 无裸字号 / 裸色值 / 空 catch；index.css 的 .codex-* 区块只用令牌）
     [7] 只读性（渲染前后 localStorage 与宠物存档 JSON 逐字不变；源码无任何写接口）
   Run: node scripts/test-codex.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m, detail) {
  if (c) { pass++; console.log(' ✓ ' + m); }
  else { fail++; console.log(' ✗ ' + m + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const codexSrc = fs.readFileSync(path.join(PAGE, 'codex.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(PAGE, 'index.css'), 'utf8');

/* ---------- 沙箱：照抄 test-page-load.js 的加载方式（解析 index.html 的 script 顺序） ---------- */
const html = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);
/* codex.js 的挂载行由主控加进 index.html —— 本套件两种状态都要能跑：
   已在 html 里就跟 html；还没加就追加在 game-views.js 之后（= 报告里给的预演位置）。 */
const REPORTED_ORDER = 'codex.js';
if (scripts.indexOf(REPORTED_ORDER) < 0) {
  const at = scripts.indexOf('game-views.js');
  scripts.splice(at < 0 ? scripts.length : at + 1, 0, REPORTED_ORDER);
}

function makeEl(id) {
  const el = {
    id: id || '', style: {}, dataset: {}, _html: '', textContent: '', value: '', hidden: false,
    classList: {
      _s: {},
      add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
      toggle(c, on) { if (on === undefined) { if (this._s[c]) delete this._s[c]; else this._s[c] = 1; } else if (on) this._s[c] = 1; else delete this._s[c]; },
      contains(c) { return !!this._s[c]; }
    },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, remove() {},
    insertBefore() {}, setAttribute() {}, getAttribute() { return null; }, focus() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  return el;
}
const storageMap = {};
const els = {};
const sandbox = { JSON, console, Date, navigator: { userAgent: 'test', vibrate() {} } };
sandbox.Math = Object.create(Math);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.localStorage = {
  getItem(k) { return k in storageMap ? storageMap[k] : null; },
  setItem(k, v) { storageMap[k] = String(v); },
  removeItem(k) { delete storageMap[k]; },
  key(i) { return Object.keys(storageMap)[i] || null; },
  get length() { return Object.keys(storageMap).length; }
};
sandbox.document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement() { return makeEl(); },
  body: makeEl('body'),
  documentElement: makeEl('html'),
  addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }
};
sandbox.toast = function () {};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0;
sandbox.setInterval = () => 0;
sandbox.clearTimeout = () => {};
sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.innerWidth = 375; sandbox.innerHeight = 700;
vm.createContext(sandbox);

const loadErrors = [];
scripts.forEach(src => {
  const f = path.join(PAGE, src);
  if (!fs.existsSync(f)) { loadErrors.push(src + ' (文件不存在)'); return; }
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: src }); }
  catch (e) { loadErrors.push(src + ': ' + e.message); }
});

/* ---------- [1] 模块挂载 ---------- */
section('[1] 模块挂载（按 index.html 真实顺序 + codex.js）');
ok(loadErrors.length === 0, '全部 ' + scripts.length + ' 个模块加载零异常' + (loadErrors.length ? ' — ' + loadErrors.join(' | ') : ''));
ok(scripts.indexOf('codex.js') > -1, 'codex.js 在加载序列里（位置：' + scripts.indexOf('codex.js') + ' / ' + scripts.length + '）');
['renderCodexPanel', 'codexPetEntries', 'codexSkillEntries', 'codexTalentEntries', 'codexEntries', 'codexCounts']
  .forEach(fn => ok(typeof sandbox[fn] === 'function', '导出 ' + fn + '()'));

/* ---------- 数据源快照（全部现场派生，不写死数字） ---------- */
const petIds = sandbox.listPetCodex();
const playerIds = sandbox.listPlayerSkills();
const petSkillIds = (() => {
  const set = {};
  petIds.forEach(id => ((sandbox.getPetCodex(id) || {}).skills || []).forEach(s => { set[s] = 1; }));
  return Object.keys(set);
})();
const enemySkillIds = Object.keys(sandbox.SKILL_DOCS || {});
const talentIds = Object.keys(sandbox.TALENTS || {});
const petOnlyTalentIds = talentIds.filter(id => sandbox.TALENTS[id] && sandbox.TALENTS[id].petOnly);

const petEntries = sandbox.codexPetEntries();
const skillEntries = sandbox.codexSkillEntries();
const talentEntries = sandbox.codexTalentEntries();

/* ---------- [2] 条目数量与数据源一致 ---------- */
section('[2] 条目数量与数据源一致（自动派生）');
ok(petEntries.length === petIds.length, '宠物条目 ' + petEntries.length + ' = listPetCodex() ' + petIds.length);
ok(skillEntries.length === playerIds.length + petSkillIds.length + enemySkillIds.length,
  '技能条目 ' + skillEntries.length + ' = 玩家 ' + playerIds.length + ' + 宠物 ' + petSkillIds.length + ' + 敌群 ' + enemySkillIds.length);
const srcCount = { player: 0, pet: 0, enemy: 0 };
skillEntries.forEach(e => { srcCount[e.src] = (srcCount[e.src] || 0) + 1; });
ok(srcCount.player === playerIds.length, '玩家技能条数 ' + srcCount.player + ' = listPlayerSkills() ' + playerIds.length);
ok(srcCount.pet === petSkillIds.length, '宠物技能条数 ' + srcCount.pet + ' = 宠物图鉴引用数 ' + petSkillIds.length);
ok(srcCount.enemy === enemySkillIds.length, '敌群技能条数 ' + srcCount.enemy + ' = SKILL_DOCS 条数 ' + enemySkillIds.length);
/* 完整性：SKILLS 注册表里的每一条都必须至少被图鉴收录一次（防止新技能漏进图鉴） */
const covered = {};
skillEntries.forEach(e => { covered[e.id] = 1; });
const uncovered = Object.keys(sandbox.SKILLS || {}).filter(id => !covered[id]);
ok(uncovered.length === 0, 'SKILLS 注册表 ' + Object.keys(sandbox.SKILLS || {}).length + ' 条全部被图鉴覆盖' + (uncovered.length ? ' — 漏: ' + uncovered.join(',') : ''));
ok(talentEntries.length === talentIds.length, '天赋条目 ' + talentEntries.length + ' = TALENTS ' + talentIds.length);
const petTalentEntries = talentEntries.filter(e => e.src === 'pet');
const enemyTalentEntries = talentEntries.filter(e => e.src === 'enemy');
ok(petTalentEntries.length === petOnlyTalentIds.length, '宠物专属天赋 ' + petTalentEntries.length + ' = petOnly ' + petOnlyTalentIds.length);
ok(enemyTalentEntries.length === talentIds.length - petOnlyTalentIds.length,
  '敌群天赋 ' + enemyTalentEntries.length + ' = TALENTS − petOnly ' + (talentIds.length - petOnlyTalentIds.length));
/* 每只宠物的技能 / 天赋引用都必须解析出名字（引用断裂会显示成 id） */
const badPetRefs = [];
petEntries.forEach(p => {
  p.skills.forEach(s => { if (!s.name || s.name === s.id) badPetRefs.push(p.name + '→技能 ' + s.id); });
  p.talents.forEach(t => { if (!t.name || t.name === t.id) badPetRefs.push(p.name + '→天赋 ' + t.id); });
});
ok(badPetRefs.length === 0, '宠物→技能/天赋引用全部解析成功' + (badPetRefs.length ? ' — ' + badPetRefs.join(',') : ''));

/* ---------- [3] 每条都有非空描述 ---------- */
section('[3] 每条都有非空描述');
const noDescSkills = skillEntries.filter(e => !e.desc || String(e.desc).trim().length < 4).map(e => e.src + ':' + e.id);
ok(noDescSkills.length === 0, '技能 desc 全部非空（' + skillEntries.length + ' 条）' + (noDescSkills.length ? ' — 空: ' + noDescSkills.join(',') : ''));
const noNumSkills = skillEntries.filter(e => !e.nums || String(e.nums).trim().length < 4).map(e => e.src + ':' + e.id);
ok(noNumSkills.length === 0, '技能数值行全部非空（由定义推导）' + (noNumSkills.length ? ' — 空: ' + noNumSkills.join(',') : ''));
const noDescTalents = talentEntries.filter(e => !e.desc || String(e.desc).trim().length < 4).map(e => e.id);
ok(noDescTalents.length === 0, '天赋 desc 全部非空（' + talentEntries.length + ' 条）' + (noDescTalents.length ? ' — 空: ' + noDescTalents.join(',') : ''));
const noNamePets = petEntries.filter(p => !p.name || !p.rarity).map(p => p.id);
ok(noNamePets.length === 0, '宠物名称 / 稀有度全部非空' + (noNamePets.length ? ' — ' + noNamePets.join(',') : ''));
const petSkillNoLine = [];
petEntries.forEach(p => p.skills.forEach(s => { if (!s.line || s.line.trim().length < 4) petSkillNoLine.push(p.name + '→' + s.name); }));
ok(petSkillNoLine.length === 0, '宠物技能一句话说明全部非空' + (petSkillNoLine.length ? ' — ' + petSkillNoLine.join(',') : ''));
const petTalentNoDesc = [];
petEntries.forEach(p => p.talents.forEach(t => { if (!t.desc || t.desc.trim().length < 4) petTalentNoDesc.push(p.name + '→' + t.name); }));
ok(petTalentNoDesc.length === 0, '宠物天赋说明全部非空' + (petTalentNoDesc.length ? ' — ' + petTalentNoDesc.join(',') : ''));
ok(talentEntries.filter(e => e.src === 'pet').every(e => e.appliesTo && e.appliesTo.length > 0),
  '宠物专属天赋都有「适用对象」（反查图鉴得到）');
ok(talentEntries.every(e => e.appliesTo), '全部天赋都有「适用对象」说明');

/* ---------- [4] 渲染结果无 undefined / NaN ---------- */
section('[4] 渲染结果无 undefined / NaN');
const POLLUTION = /undefined|NaN|\[object Object\]/;
function dirty(htmlStr) {
  const m = POLLUTION.exec(htmlStr || '');
  return m ? m[0] : '';
}
const TAB_STATE = ['pets', 'skills', 'talents'];
const restore = { tab: sandbox._codexTab, q: sandbox._codexQuery, type: sandbox._codexSkillType, src: sandbox._codexSkillSrc, rarity: sandbox._codexPetRarity, tsrc: sandbox._codexTalentSrc };
function resetState() {
  sandbox._codexTab = restore.tab; sandbox._codexQuery = restore.q;
  sandbox._codexSkillType = restore.type; sandbox._codexSkillSrc = restore.src;
  sandbox._codexPetRarity = restore.rarity; sandbox._codexTalentSrc = restore.tsrc;
}
TAB_STATE.forEach(tab => {
  sandbox._codexTab = tab;
  const bad = dirty(sandbox.codexListHtml());
  ok(!bad, '分栏 ' + tab + ' 列表无污染' + (bad ? ' — 出现 ' + bad : ''));
  const badShell = dirty(sandbox.codexShellHtml());
  ok(!badShell, '分栏 ' + tab + ' 面板骨架无污染' + (badShell ? ' — 出现 ' + badShell : ''));
});
/* 全筛选组合 × 关键词（含一个必然空结果的关键词） */
const filterCases = [
  ['skills', '_codexSkillType', ['passive', 'support', 'attack']],
  ['skills', '_codexSkillSrc', ['player', 'pet', 'enemy']],
  ['pets', '_codexPetRarity', sandbox.codexRarityOptions().map(o => o[0]).filter(v => v !== 'all')],
  ['talents', '_codexTalentSrc', ['enemy', 'pet']]
];
const badCombos = [];
filterCases.forEach(([tab, varName, values]) => {
  values.forEach(v => {
    resetState(); sandbox._codexTab = tab; sandbox[varName] = v;
    const bad = dirty(sandbox.codexListHtml());
    if (bad) badCombos.push(tab + '/' + v + '→' + bad);
  });
});
ok(badCombos.length === 0, '全部筛选组合渲染无污染' + (badCombos.length ? ' — ' + badCombos.join(',') : ''));
resetState();
const kwCases = ['打湿', '坚壁', 'R', '天赋', 'zzz-不存在的关键词'];
const badKw = [];
kwCases.forEach(q => {
  TAB_STATE.forEach(tab => {
    resetState(); sandbox._codexTab = tab; sandbox._codexQuery = q;
    const bad = dirty(sandbox.codexListHtml());
    if (bad) badKw.push(tab + '/' + q + '→' + bad);
  });
});
ok(badKw.length === 0, '关键词搜索（含空结果）渲染无污染' + (badKw.length ? ' — ' + badKw.join(',') : ''));
/* 空结果必须渲染成既有空状态组件，而不是空白 */
resetState(); sandbox._codexQuery = 'zzz-不存在的关键词';
ok(/class="empty"/.test(sandbox.codexListHtml()), '空结果显示 .empty 空状态（不是空白）');
/* 宠物头像入口：必须是 petIconHtml 产出的 .pet-ico，且尺寸是 16 的倍数 */
resetState(); sandbox._codexTab = 'pets';
const petListHtml = sandbox.codexListHtml();
ok(/class="pet-ico codex-pet-ico"/.test(petListHtml), '宠物头像走 petIconHtml（.pet-ico 徽标存在）');
const iconSizes = [...petListHtml.matchAll(/width="(\d+)"/g)].map(m => Number(m[1]));
ok(iconSizes.length >= petEntries.length, '每只宠物都有头像（' + iconSizes.length + ' 个 <img> ≥ ' + petEntries.length + ' 只）');
ok(iconSizes.every(n => n % 16 === 0), '头像尺寸全部是 16 的倍数（' + [...new Set(iconSizes)].join('/') + '）');
resetState();

/* ---------- [5] 名称无重复 ---------- */
section('[5] 名称无重复');
['player', 'pet', 'enemy'].forEach(src => {
  const names = skillEntries.filter(e => e.src === src).map(e => e.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  ok(dup.length === 0, '技能·' + src + ' 来源内名称唯一（' + names.length + ' 条）' + (dup.length ? ' — 重名: ' + dup.join(',') : ''));
});
const talNames = talentEntries.map(e => e.name);
ok(talNames.filter((n, i) => talNames.indexOf(n) !== i).length === 0, '天赋名称唯一（' + talNames.length + ' 条）');
const petNames = petEntries.map(p => p.name);
ok(petNames.filter((n, i) => petNames.indexOf(n) !== i).length === 0, '宠物名称唯一（' + petNames.length + ' 只）');
/* 跨来源同名（如「打湿」宠物版 + 敌群版）：每条 key 唯一，且渲染出来的来源徽标能区分 */
const byName = {};
skillEntries.forEach(e => { (byName[e.name] = byName[e.name] || []).push(e); });
const crossDup = Object.keys(byName).filter(n => byName[n].length > 1);
const badCross = crossDup.filter(n => {
  const keys = byName[n].map(e => e.key);
  const srcs = byName[n].map(e => e.src);
  return new Set(keys).size !== keys.length || new Set(srcs).size !== keys.length;   // 同源同名 = 真重名
});
ok(badCross.length === 0, '跨来源同名条目 key/来源各不相同（同名 ' + crossDup.length + ' 组：' + (crossDup.join('、') || '无') + '）' + (badCross.length ? ' — ' + badCross.join(',') : ''));
resetState(); sandbox._codexTab = 'skills'; sandbox._codexQuery = crossDup.length ? crossDup[0] : '打湿';
const dupRender = sandbox.codexListHtml();
ok(crossDup.length === 0 || /codex-src-/.test(dupRender), '同名条目的卡片带来源徽标（codex-src-*）');
resetState();

/* ---------- [6] a11y token 合规 ---------- */
section('[6] a11y token 合规（无裸字号 / 裸色 / 空 catch）');
const rawFont = [...codexSrc.matchAll(/font-size:\s*([0-9.]+(?:rem|px|em))/g)].map(m => m[1]);
ok(rawFont.length === 0, 'codex.js 无裸字号（全部 var(--fs-*)）' + (rawFont.length ? ' — ' + rawFont.join(',') : ''));
const rawColor = [...codexSrc.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)].map(m => m[0]);
ok(rawColor.length === 0, 'codex.js 无裸色值（全部 var(--*)）' + (rawColor.length ? ' — ' + rawColor.join(',') : ''));
/* 空 catch：本文件应完全没有 catch（渲染是纯字符串拼接，没有可吞的异常） */
const catches = [...codexSrc.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g)].map(m => m[1]);
ok(catches.every(b => /console\.|toast\s*\(|notifyQuota\s*\(|忽略/.test(b)),
  'codex.js 无空 catch（catch 数 ' + catches.length + '）');
const refs = [...codexSrc.matchAll(/(?:aria-labelledby|for)="([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
const idsInFile = new Set([...codexSrc.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
const orphanRefs = refs.filter(r => !idsInFile.has(r));
ok(orphanRefs.length === 0, 'aria-labelledby / label for 无悬空引用' + (orphanRefs.length ? ' — ' + orphanRefs.join(',') : ''));
/* index.css 的 .codex-* 区块：字号必须令牌化 + var() 引用的令牌必须有定义
   切片方式：从区块标记到**下一个 `/* ==========` 区块标记**（或文件末尾）——
   不能用「LOADING / SKELETON」当结束锚点：本区块自己的注释里就写着这几个字。 */
const cssBlock = (() => {
  const start = cssSrc.indexOf('v2.14.3：图鉴');
  if (start < 0) return '';
  const end = cssSrc.indexOf('/* ==========', start + 10);
  return cssSrc.slice(start, end < 0 ? cssSrc.length : end);
})();
ok(cssBlock.length > 0, 'index.css 存在 .codex-* 样式区块（' + cssBlock.length + ' 字符）');
const cssRawFont = [...cssBlock.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^var\(--fs-/.test(v));
ok(cssRawFont.length === 0, 'codex 区块字号全部 var(--fs-*)' + (cssRawFont.length ? ' — ' + cssRawFont.join(',') : ''));
const ALL_DEFS = new Set([...cssSrc.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*[^;}]+/g)].map(m => m[1]));
const cssTokens = [...cssBlock.matchAll(/var\(\s*--([A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)/g)].map(m => m[1]);
const cssUndefined = [...new Set(cssTokens.filter(t => !ALL_DEFS.has(t)))];
ok(cssUndefined.length === 0, 'codex 区块引用的令牌均已定义' + (cssUndefined.length ? ' — 未定义: ' + cssUndefined.join(',') : ''));

/* ---------- [7] 只读性 ---------- */
section('[7] 只读性（渲染前后存档不变）');
const WRITE_CALLS = ['localStorage.setItem', 'store.set(', 'setPetStore(', 'savePets(', 'setGame(', 'store.remove('];
const hitWrites = WRITE_CALLS.filter(w => codexSrc.indexOf(w) > -1);
ok(hitWrites.length === 0, 'codex.js 源码无任何存档写接口' + (hitWrites.length ? ' — 命中: ' + hitWrites.join(',') : ''));
/* 先把存档「跑起来」（getPetStore 可能补默认值），再取快照 → 渲染 → 再取快照 */
const dumpStorage = () => JSON.stringify(Object.keys(storageMap).sort().map(k => [k, storageMap[k]]));
const petsBefore = JSON.stringify(sandbox.getPetStore());
const storageBefore = dumpStorage();
let renderErr = '';
try {
  TAB_STATE.forEach(tab => {
    sandbox._codexTab = tab; resetState(); sandbox._codexTab = tab;
    sandbox.renderCodexPanel();
  });
  resetState(); sandbox._codexTab = 'skills'; sandbox._codexQuery = '打湿';
  sandbox.renderCodexPanel();
  resetState(); sandbox.renderCodexPanel();
} catch (e) { renderErr = e.message; }
ok(renderErr === '', 'renderCodexPanel() 三次调用无异常' + (renderErr ? ' — ' + renderErr : ''));
ok(dumpStorage() === storageBefore, '渲染前后 localStorage 逐字不变（' + Object.keys(storageMap).length + ' 个键）');
ok(JSON.stringify(sandbox.getPetStore()) === petsBefore, '渲染前后宠物存档（pets JSON）逐字不变');
const panelHtml = els['panelOverlay'] ? els['panelOverlay'].innerHTML : '';
ok(panelHtml.length > 500, '面板确实渲染出了内容（' + panelHtml.length + ' 字符）');
ok(!dirty(panelHtml), '实际挂载的 #panelOverlay 内容无污染' + (dirty(panelHtml) ? ' — ' + dirty(panelHtml) : ''));
ok(els['panelOverlay'].classList.contains('open'), '#panelOverlay 被打开（classList.open）');
resetState();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);

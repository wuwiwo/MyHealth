#!/usr/bin/env node
/* UI/UX 评审用度量脚本（只读：不改源码、不改存档结构，只注入测试数据渲染一次）
   目的：给出审计框架需要的客观数字 —— 触摸高度 / 字号 / 对比度 / 焦点顺序 / 标签密度 / 重复控件。
   用法：node scripts/audit-squad-ui.js
   前置：静态服务把 page/ 暴露在 8099（与 verify-squad-ui.js 相同）。
   ⚠️ 不是 test-*.js：依赖真实 Chrome，不进全量回归。 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9335;
const OUT_DIR = path.join(__dirname, '..', '_tmp-audit');
const CHROME = process.env.MH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpJson = async url => (await fetch(url)).json();

function connect(wsUrl) {
  const WS = globalThis.WebSocket;
  const ws = new WS(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('WS 连接失败'))); });
  return {
    ready,
    send(method, params) { const mid = ++id; return new Promise((resolve, reject) => { pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); }); },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

/* 通用量测：注入一段「渲染视图」的代码后，跑 metrics */
const COMMON = `
window.__m = (function(){
  function px(v){ return Math.round(parseFloat(v)*10)/10; }
  function rgb(s){ var m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    var a=m[1].split(',').map(function(x){return parseFloat(x)});
    return {r:a[0],g:a[1],b:a[2],a:a.length>3?a[3]:1}; }
  function lum(c){ function ch(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
    return 0.2126*ch(c.r)+0.7152*ch(c.g)+0.0722*ch(c.b); }
  function bgOf(el){ var e=el; while(e && e.nodeType===1){ var c=rgb(getComputedStyle(e).backgroundColor); if(c && c.a===1) return c; e=e.parentElement; } return {r:255,g:255,b:255,a:1}; }
  function contrast(el){ var fg=rgb(getComputedStyle(el).color), bg=bgOf(el); if(!fg) return null;
    var l1=lum(fg), l2=lum(bg); var r=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); return Math.round(r*100)/100; }
  function box(el){ var r=el.getBoundingClientRect(); return {w:px(r.width),h:px(r.height)}; }
  return { px:px, rgb:rgb, contrast:contrast, box:box, bgOf:bgOf,
    sel:function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); },
    txt:function(el){ return (el.textContent||'').replace(/\\s+/g,' ').trim(); } };
})();
`;

/* ---------- A. 培养页 ---------- */
const INJECT_TRAIN = `
(function(){
  var d = getPetStore();
  d.pets = ['sparkle','dream','nonebear','kirin','flamechick'].map(function(sid){
    var c = getPetCodex(sid) || {};
    var p = createPet({speciesId:sid, rarity:c.rarity||'R', name:c.name||sid});
    p.stage='mature'; p.isDead=false; p.injured=false; return p;
  });
  d.battlePicks = ['sparkle','dream','nonebear','kirin'];
  d.squads = [{id:'sq-1',name:'一队',petIds:['sparkle','dream','nonebear','kirin']},
              {id:'sq-2',name:'二队',petIds:['flamechick']}];
  savePetStore(d);
  _petBattlePicks = ['sparkle','dream','nonebear','kirin'];
  switchTab('game');
  if (typeof renderGameViews === 'function') renderGameViews();
  var tv = document.getElementById('gameTrainView'); if (tv) tv.style.display='block';
  return document.querySelectorAll('.train-squad-row').length;
})()
`;

const M_TRAIN = COMMON + `
(function(){
  var out = {viewport:[innerWidth,innerHeight], rows:[], header:null, chips:[], focusables:[], tabOrder:[]};
  var card = document.querySelector('.train-lineup');
  if (!card) return out;
  var hd = card.querySelector('.train-lineup-hd') || card.firstElementChild;
  out.header = { text: __m.txt(hd), fontSize: getComputedStyle(card).fontSize };
  __m.sel('.train-squad-row').forEach(function(row){
    var b = __m.box(row);
    out.rows.push({ text: __m.txt(row.querySelector('.train-squad-badge')) + '|' + __m.txt(row.querySelector('.train-squad-name')),
      h: b.h, w: b.w, badge: __m.txt(row.querySelector('.train-squad-badge')),
      name: __m.txt(row.querySelector('.train-squad-name')),
      count: __m.txt(row.querySelector('.train-squad-count')),
      chips: row.querySelectorAll('.train-squad-chip').length,
      hasAffordance: !!(row.querySelector('.train-squad-caret') || /›|→|chevron/.test(row.innerHTML)) });
  });
  __m.sel('.train-squad-badge, .train-squad-count, .train-squad-chip, .train-squad-empty').forEach(function(el){
    var cs = getComputedStyle(el), b = __m.box(el);
    out.chips.push({ cls: el.className, text: __m.txt(el).slice(0,12), fs: cs.fontSize, h: b.h, contrast: __m.contrast(el) });
  });
  // 该区域可聚焦元素顺序（键盘/读屏实际走位）
  __m.sel('.train-lineup button, .train-lineup input, .train-lineup [tabindex]').forEach(function(el){
    out.focusables.push({ tag: el.tagName, label: (el.getAttribute('aria-label')||__m.txt(el)).slice(0,16),
      box: __m.box(el), disabled: !!el.disabled });
  });
  out.cardButtons = card.querySelectorAll('button').length;
  return out;
})()
`;

/* ---------- B. 关卡内页 ---------- */
const INJECT_STAGES = `
(function(){
  switchTab('game'); switchGameTab('battle'); showGroupStages('g3');
  return document.querySelectorAll('[data-stage]').length;
})()
`;
const M_STAGES = COMMON + `
(function(){
  var out = {cards:[], tagTexts:{}, tagCount:0, totalCards:0, tagFont:null, tagContrast:null, nameWrap:0, lockedWrap:0};
  var cards = __m.sel('[data-stage]');
  out.totalCards = cards.length;
  cards.forEach(function(c){
    var b = __m.box(c);
    var tags = __m.sel.apply(null, [])
    var tagEls = Array.prototype.slice.call(c.querySelectorAll('.lv-tag'));
    tagEls.forEach(function(t){ out.tagCount++; var s=__m.txt(t); out.tagTexts[s]=(out.tagTexts[s]||0)+1; });
    var nm = c.querySelector('.lv-stage-name');
    out.cards.push({ id: c.getAttribute('data-stage'), h:b.h, w:b.w, tags: tagEls.map(__m.txt),
      nameLines: nm ? Math.round(nm.getBoundingClientRect().height / parseFloat(getComputedStyle(nm).lineHeight)) : null,
      overflowX: c.scrollWidth > c.clientWidth + 1 });
  });
  var t = document.querySelector('.lv-tag');
  if (t) { out.tagFont = getComputedStyle(t).fontSize; out.tagContrast = __m.contrast(t); }
  // 「未解锁」是否在窄卡里折行
  __m.sel('[data-stage] .lv-lock, [data-stage] .lv-state').forEach(function(el){
    var lh = parseFloat(getComputedStyle(el).lineHeight) || 1;
    if (el.getBoundingClientRect().height > lh * 1.4) out.lockedWrap++;
  });
  out.heights = cards.map(function(c){ return __m.box(c).h; });
  return out;
})()
`;

/* ---------- C. 宠物面板 ---------- */
const INJECT_PET = `
(function(){
  var d = getPetStore();
  d.pets = [];
  ['sparkle','dream','nonebear','kirin','flamechick'].forEach(function(sid){
    var c = getPetCodex(sid) || {};
    var p = createPet({speciesId:sid, rarity:c.rarity||'R', name:c.name||sid});
    p.stage='mature'; p.isDead=false; p.injured=false; d.pets.push(p);
  });
  d.battlePicks = ['sparkle','dream'];
  d.squads = [{id:'sq-1',name:'一队',petIds:['sparkle','dream']},{id:'sq-2',name:'二队',petIds:['nonebear']}];
  savePetStore(d);
  _petBattlePicks = ['sparkle','dream']; _petSquadsOpen = true;
  renderPetPanel();
  return document.querySelectorAll('.pet-squad-card').length;
})()
`;
const M_PET = COMMON + `
(function(){
  var out = {pickChips:[], squadChips:[], ops:[], headings:[], dup:[], iconsNoLabel:[], panelScroll:null, focusables:[]};
  __m.sel('.pet-pick-chip').forEach(function(c){
    var cs=getComputedStyle(c), b=__m.box(c);
    out.pickChips.push({ name: __m.txt(c).slice(0,14), h:b.h, w:b.w, fs:cs.fontSize,
      selected: c.getAttribute('aria-pressed')==='true', disabled: !!c.disabled, contrast: __m.contrast(c),
      color: cs.color, bg: cs.backgroundColor, inlineStyle: (c.getAttribute('style')||'').slice(0,60),
      inlineColorWins: /on-brand/.test(c.getAttribute('style')||''),
      nameColor: (function(){ var s=c.querySelector('span'); return s? getComputedStyle(s).color : null; })(),
      nameContrast: (function(){ var s=c.querySelector('span'); return s? __m.contrast(s) : null; })() });
  });
  __m.sel('.pet-squad-chip').forEach(function(c){
    var cs=getComputedStyle(c), b=__m.box(c);
    out.squadChips.push({ name: __m.txt(c).slice(0,14), h:b.h, w:b.w, fs:cs.fontSize,
      selected: c.getAttribute('aria-pressed')==='true', taken: c.classList.contains('is-taken'),
      disabled: !!c.disabled, opacity: cs.opacity, contrast: __m.contrast(c), bg: cs.backgroundColor });
  });
  __m.sel('.pet-squad-op').forEach(function(b){ var bb=__m.box(b); out.ops.push({ label: b.getAttribute('aria-label'), h:bb.h, w:bb.w, text: __m.txt(b) }); });
  // 标题层级：面板内出现的所有标题字号（看层级是否只靠字号区分）
  __m.sel('.pet-lineup-hd, .pet-squads summary, .pet-squad-meta, .pet-squad-note').forEach(function(el){
    var cs=getComputedStyle(el);
    out.headings.push({ cls: el.className || el.tagName, fs: cs.fontSize, fw: cs.fontWeight, text: __m.txt(el).slice(0,28) });
  });
  // 重复信息：参战阵容与首发队是否展示同一组数据
  var pickNames = __m.sel('.pet-pick-chip[aria-pressed="true"]').map(function(c){ return __m.txt(c).slice(0,6); });
  var sq1 = document.querySelector('.pet-squad-card');
  var sq1Sel = sq1 ? Array.prototype.slice.call(sq1.querySelectorAll('.pet-squad-chip[aria-pressed="true"]')).map(function(c){ return __m.txt(c).slice(0,6); }) : [];
  out.dup = { pickNames: pickNames, squad1Selected: sq1Sel, sameSet: pickNames.join() === sq1Sel.join() };
  // 纯图标按钮缺 aria-label
  __m.sel('.pet-squad-ops button, .pet-panel button:not(.pet-pick-chip):not(.pet-squad-chip)').forEach(function(b){
    var t = __m.txt(b);
    if (t.length <= 2 && !b.getAttribute('aria-label') && !b.getAttribute('title')) out.iconsNoLabel.push(t);
  });
  __m.sel('#panelOverlay .panel, #panelOverlay [role="dialog"], #panelOverlay > div').forEach(function(p){
    out.panelScroll = out.panelScroll || { scrollH: p.scrollHeight, clientH: p.clientHeight };
  });
  __m.sel('.pet-squad-chip').slice(0,1).concat(__m.sel('.pet-squad-op').slice(0,1)).forEach(function(el){});
  return out;
})()
`;

(async () => {
  const result = {};
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-audit-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { const list = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/list'); target = list.find(t => t.type === 'page') || null; } catch (e) { /* 等 */ }
  }
  if (!target) { chrome.kill(); console.error('CDP 未就绪'); process.exit(2); }

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function load(vp, inject) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
    const ev = new Promise(res => { const h = ev2 => { if (ev2) { } }; res(); });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
    await sleep(1200);
    const r = await cdp.send('Runtime.evaluate', { expression: inject, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
    await sleep(350);
    return r.result.value;
  }
  async function measure(expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
    return r.result.value;
  }

  for (const vp of [{ w: 360, h: 640, tag: '360x640' }, { w: 390, h: 844, tag: '390x844' }]) {
    result[vp.tag] = {};
    result[vp.tag].train = await load(vp, INJECT_TRAIN).then(() => measure(M_TRAIN));
    result[vp.tag].stages = await load(vp, INJECT_STAGES).then(() => measure(M_STAGES));
    result[vp.tag].pet = await load(vp, INJECT_PET).then(() => measure(M_PET));
  }

  cdp.close();
  chrome.kill();
  const file = path.join(OUT_DIR, 'metrics.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 1), 'utf8');
  console.log('已写出 ' + file);
  const v = result['360x640'];
  console.log('--- 培养页 ---');
  console.log('行: ' + JSON.stringify(v.train.rows));
  console.log('--- 关卡 ---');
  console.log('标签分布: ' + JSON.stringify(v.stages.tagTexts) + ' 卡片数 ' + v.stages.totalCards + ' 标签字号 ' + v.stages.tagFont + ' 对比度 ' + v.stages.tagContrast);
  console.log('卡片高度: ' + JSON.stringify(v.stages.heights) + ' 名称折行 ' + v.stages.nameWrap + ' 未解锁折行 ' + v.stages.lockedWrap);
  console.log('--- 宠物面板 ---');
  console.log('参战芯片: ' + JSON.stringify(v.pet.pickChips));
  console.log('编队芯片: ' + JSON.stringify(v.pet.squadChips));
  console.log('操作按钮: ' + JSON.stringify(v.pet.ops));
  console.log('重复信息: ' + JSON.stringify(v.pet.dup));
  console.log('标题层级: ' + JSON.stringify(v.pet.headings));
  console.log('无标签图标按钮: ' + JSON.stringify(v.pet.iconsNoLabel));
  process.exit(0);
})().catch(e => { console.error('未捕获异常:', e); process.exit(2); });

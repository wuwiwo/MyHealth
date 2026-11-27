#!/usr/bin/env node
/* 全项目 UI/UX 审计量测（只读：不改源码，只导航/渲染后读数）
   依据 ui-skills 的 pbakaus/audit：无障碍 / 性能线索 / 主题化 / 响应式 / 实现一致性。
   逐视图测：横向溢出、触摸目标 <44、正文 <12px、对比度不足、圆角/阴影违规、强调色数量、可交互元素数量。
   用法：node scripts/audit-whole-ui.js [--views-only]
   前置：静态服务把 page/ 暴露在 8099。 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9336;
const OUT_DIR = path.join(__dirname, '..', '_tmp-whole-audit');
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

/* 每视图都要跑的通用量测（在页面内执行） */
const METRICS = `
(function(){
  function px(v){ return Math.round(parseFloat(v)*10)/10; }
  function rgb(s){ var m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    var a=m[1].split(',').map(parseFloat); return {r:a[0],g:a[1],b:a[2],a:a.length>3?a[3]:1}; }
  function lum(c){ function ch(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
    return 0.2126*ch(c.r)+0.7152*ch(c.g)+0.0722*ch(c.b); }
  function blend(fg,bg){ var a=fg.a==null?1:fg.a;
    return {r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1}; }
  function bgOf(el){
    var e=el, layers=[];
    while(e && e.nodeType===1){
      var c=rgb(getComputedStyle(e).backgroundColor);
      if(c && c.a>0){ layers.push(c); if(c.a===1) break; }
      e=e.parentElement;
    }
    var base={r:255,g:255,b:255,a:1};
    for(var i=layers.length-1;i>=0;i--) base=blend(layers[i], base);
    return base;
  }
  function contrastOf(el){
    var fg=rgb(getComputedStyle(el).color); if(!fg) return null;
    var bg=bgOf(el);
    var f=blend(fg,bg), l1=lum(f), l2=lum(bg);
    return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100;
  }
  var docEl=document.documentElement;
  var all=Array.prototype.slice.call(docEl.querySelectorAll('*'));
  function visible(el){
    if(!el.getClientRects || !el.getClientRects().length) return false;
    var cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) return false;
    var r=el.getBoundingClientRect(); return r.width>1 && r.height>1;
  }
  var interactive=all.filter(function(el){
    if(!visible(el)) return false;
    if(el.tagName==='BUTTON'||el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA') return true;
    if(el.getAttribute && (el.getAttribute('role')==='button'||el.hasAttribute('tabindex'))) return true;
    return false;
  });
  var small=interactive.filter(function(el){
    var r=el.getBoundingClientRect();
    return r.width<44 || r.height<44;
  });
  var texts=all.filter(function(el){
    if(!visible(el)) return false;
    var own=false;
    for(var i=0;i<el.childNodes.length;i++){ var n=el.childNodes[i]; if(n.nodeType===3 && n.nodeValue.trim()) own=true; }
    return own;
  });
  var tiny=texts.filter(function(el){ return parseFloat(getComputedStyle(el).fontSize) < 12; });
  var lowContrast=[], disabledCount=0;
  texts.forEach(function(el){
    if(el.closest && el.closest('[disabled], .gb-dead')){ disabledCount++; return; }
    var c=contrastOf(el); if(c==null) return;
    var fs=parseFloat(getComputedStyle(el).fontSize), bold=(getComputedStyle(el).fontWeight|0)>=700;
    var need=(fs>=24||(fs>=18.66&&bold))?3:4.5;
    if(c<need) lowContrast.push({ text:(el.textContent||'').trim().slice(0,18), c:c, fs:px(fs), cls:(el.className||'')+ '' });
  });
  var radiusViolation=[], shadowViolation=[];
  all.forEach(function(el){
    if(!visible(el)) return;
    var cs=getComputedStyle(el), br=cs.borderTopLeftRadius;
    if(br && br!=='0px' && br!=='50%' && parseFloat(br)>0) radiusViolation.push({ cls:(el.className||'')+'', br:br });
    if(cs.boxShadow && cs.boxShadow!=='none') shadowViolation.push({ cls:(el.className||'')+'', sh:cs.boxShadow.slice(0,40) });
  });
  /* 强调色统计：颜色里出现过的非灰阶值（用于「一屏一个强调色」审查） */
  var accents={};
  all.forEach(function(el){
    if(!visible(el)) return;
    var cs=getComputedStyle(el);
    ['color','backgroundColor','borderTopColor'].forEach(function(k){
      var c=rgb(cs[k]); if(!c) return;
      if(c.r===c.g && c.g===c.b) return;              /* 灰阶不算强调色 */
      if(c.a===0) return;
      var key=c.r+','+c.g+','+c.b; accents[key]=(accents[key]||0)+1;
    });
  });
  var emoji=0;
  Array.prototype.forEach.call((document.body.innerText||'').matchAll(/([\u{1F300}-\u{1FAFF}\u2600-\u27BF])/gu), function(){ emoji++; });
  return {
    viewport:[innerWidth,innerHeight],
    scrollW: docEl.scrollWidth, overflowX: docEl.scrollWidth > innerWidth + 1,
    interactive: interactive.length,
    smallTargets: small.length,
    smallSamples: small.slice(0,6).map(function(el){ var r=el.getBoundingClientRect();
      return { tag:el.tagName, label:((el.getAttribute('aria-label')||el.textContent||'').trim()).slice(0,12), w:px(r.width), h:px(r.height) }; }),
    textNodes: texts.length,
    tinyText: tiny.length,
    tinySamples: tiny.slice(0,6).map(function(el){ return { text:(el.textContent||'').trim().slice(0,14), fs:px(getComputedStyle(el).fontSize) }; }),
    contrastFailures: lowContrast.length,
    contrastSamples: lowContrast.slice(0,8),
    disabledSkipped: disabledCount,
    radiusViolations: radiusViolation.length,
    radiusSamples: radiusViolation.slice(0,4),
    shadowViolations: shadowViolation.length,
    accentColors: Object.keys(accents).length,
    accentTop: Object.keys(accents).sort(function(a,b){ return accents[b]-accents[a]; }).slice(0,6).map(function(k){ return k+' x'+accents[k]; }),
    emojiCount: emoji
  };
})()
`;

const VIEWS = [
  { id: 'train-strength', label: '训练·力量', inject: "switchTab('training'); switchSub('training','strength')" },
  { id: 'train-cardio', label: '训练·有氧', inject: "switchTab('training'); switchSub('training','cardio')" },
  { id: 'profile-personal', label: '个人·个人数据', inject: "switchTab('profile'); switchSub('profile','personal')" },
  { id: 'profile-training', label: '个人·训练数据', inject: "switchTab('profile'); switchSub('profile','training')" },
  { id: 'game-train', label: '挑战·培养', inject: "switchTab('game'); switchGameTab('train')" },
  { id: 'game-battle', label: '挑战·战斗', inject: "switchTab('game'); switchGameTab('battle')" },
  { id: 'game-record', label: '挑战·记录', inject: "switchTab('game'); switchGameTab('record')" },
  { id: 'set-library', label: '设置·动作库', inject: "switchTab('settings'); switchSub('settings','library')" },
  { id: 'set-plans', label: '设置·计划', inject: "switchTab('settings'); switchSub('settings','plans')" },
  { id: 'set-game', label: '设置·挑战', inject: "switchTab('settings'); switchSub('settings','game')" },
  { id: 'set-data', label: '设置·数据', inject: "switchTab('settings'); switchSub('settings','data')" },
  { id: 'panel-pet', label: '宠物面板（含编队）', inject: `
      (function(){
        var d=getPetStore();
        d.pets=['sparkle','dream','nonebear','kirin','flamechick'].map(function(sid){
          var c=getPetCodex(sid)||{}; var p=createPet({speciesId:sid,rarity:c.rarity||'R',name:c.name||sid});
          p.stage='mature'; p.isDead=false; p.injured=false; return p;});
        d.battlePicks=['sparkle','dream'];
        d.squads=[{id:'sq-1',name:'一队',petIds:['sparkle','dream']},{id:'sq-2',name:'二队',petIds:['nonebear']}];
        savePetStore(d); _petBattlePicks=['sparkle','dream']; _petSquadsOpen=true; renderPetPanel(); return 1;
      })()` },
  { id: 'panel-skill', label: '技能面板', inject: "renderSkillPanel(); 1" },
  { id: 'panel-codex', label: '图鉴面板', inject: "(typeof renderCodexPanel==='function'?renderCodexPanel():0); 1" }
];

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-whole-' + Date.now());
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

  const out = {};
  /* v2.14.34（复评收尾）：补上深色维度 —— 评审 §6 记的「深色 / 主题切换下的对比度只核了浅色」。
     两主题 × 两视口 × 14 视图 = 56 个采样，键形如 '360x640-light' / '390x844-dark'。 */
  const THEMES = [{ tag: 'light', v: 'light' }, { tag: 'dark', v: 'dark' }];
  for (const theme of THEMES) {
    for (const vp of [{ w: 360, h: 640, tag: '360x640' }, { w: 390, h: 844, tag: '390x844' }]) {
      const key = vp.tag + '-' + theme.tag;
      out[key] = {};
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      for (const view of VIEWS) {
        await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
        await sleep(900);
        /* 主题在导航后、注入前切换：setTheme 只改 data-theme 属性，不需要重新渲染 */
        await cdp.send('Runtime.evaluate', { expression: "setTheme('" + theme.v + "'); effTheme()", returnByValue: true });
        await sleep(120);
        const r = await cdp.send('Runtime.evaluate', { expression: view.inject, returnByValue: true });
        if (r.exceptionDetails) { out[key][view.id] = { error: r.exceptionDetails.text }; continue; }
        await sleep(350);
        const m = await cdp.send('Runtime.evaluate', { expression: METRICS, returnByValue: true });
        if (m.exceptionDetails) { out[key][view.id] = { error: m.exceptionDetails.text }; continue; }
        out[key][view.id] = { label: view.label, viewport: key, ...m.result.value };
        const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT_DIR, view.id + '-' + key + '.png'), Buffer.from(s.data, 'base64'));
        /* 兼容旧名（其它脚本/文档引用 xxx-360x640.png）：只对浅色写一份 */
        if (theme.tag === 'light') fs.writeFileSync(path.join(OUT_DIR, view.id + '-' + vp.tag + '.png'), Buffer.from(s.data, 'base64'));
      }
    }
  }

  cdp.close();
  chrome.kill();
  const file = path.join(OUT_DIR, 'metrics.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');

  const rows = Object.keys(out['360x640-light']).map(k => {
    const a = out['360x640-light'][k] || {}, b = out['390x844-light'][k] || {};
    const c = out['360x640-dark'][k] || {}, d = out['390x844-dark'][k] || {};
    return {
      view: a.label || k,
      overflow360: a.overflowX, small360: a.smallTargets, tiny360: a.tinyText,
      contrastLight: (a.contrastFailures || 0) + (b.contrastFailures || 0),
      contrastDark: (c.contrastFailures || 0) + (d.contrastFailures || 0),
      radius: a.radiusViolations, accents: a.accentColors
    };
  });
  console.log('已写出 ' + file + '（截图 ' + OUT_DIR + '）');
  console.table(rows);
  const darkFails = Object.keys(out).filter(k => k.endsWith('dark'))
    .flatMap(k => Object.keys(out[k]).map(v => ({ k, v, s: out[k][v].contrastSamples || [] })))
    .filter(x => x.s.length);
  if (darkFails.length) {
    console.log('\n深色主题对比失败样本：');
    darkFails.forEach(x => console.log('  ' + x.k + ' / ' + x.v + ' :: ' + JSON.stringify(x.s).slice(0, 400)));
  } else {
    console.log('\n深色主题：14 视图 × 2 视口 对比失败 = 0');
  }
  process.exit(0);
})().catch(e => { console.error('未捕获异常:', e); process.exit(2); });

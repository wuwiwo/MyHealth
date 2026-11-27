#!/usr/bin/env node
/* v2.14.24 编队 / 关卡标签的真机版式校验（无头 Chrome + CDP，无第三方依赖）
   检查三块并留截图：
   1) 培养页「⚔️ 出战编队」多队摘要卡：每队一行、触摸高度、无横向溢出；
   2) 大关内页的关卡形态标签：双场景 / 双 BOSS 只出现在该出现的关卡上，卡片不溢出；
   3) 宠物面板「🐾 编队管理」：选中态实心、跨队占用标「在 X」且禁用，卡片不溢出。
   用法：node scripts/verify-squad-ui.js
   前置：本地静态服务把 page/ 暴露在 8099（脚本会自检）。
   ⚠️ 不是 test-*.js：不进全量回归（依赖真实 Chrome），是实机复核工具。 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9334;
const OUT_DIR = path.join(__dirname, '..', '_tmp-squad-verify');
const CHROME = process.env.MH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function httpJson(url) { const res = await fetch(url); return res.json(); }

function connect(wsUrl) {
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('当前 Node 没有全局 WebSocket（需要 Node ≥22）');
  const ws = new WS(wsUrl);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) { const w = waiters.splice(i, 1)[0]; w.resolve(msg.params); return; }
      }
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
  });
  return {
    ready,
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => { pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    },
    waitEvent(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const w = { method, resolve }; waiters.push(w);
        setTimeout(() => { const i = waiters.indexOf(w); if (i > -1) { waiters.splice(i, 1); reject(new Error('等待事件超时: ' + method)); } }, timeoutMs || 15000);
      });
    },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

/* ---- 1) 培养页：种 5 只成熟宠物 + 2 支编队，渲染培养视图 ---- */
const INJECT_TRAIN = `
(function(){
  var d = getPetStore();
  d.pets = ['sparkle','dream','nonebear','kirin','flamechick'].map(function(sid){
    var c = getPetCodex(sid) || {};
    var p = createPet({speciesId:sid, rarity:c.rarity||'R', name:c.name||sid});
    p.stage = 'mature'; p.isDead = false; p.injured = false;
    return p;
  });
  d.battlePicks = ['sparkle','dream','nonebear','kirin'];
  d.squads = [{id:'sq-1',name:'一队',petIds:['sparkle','dream','nonebear','kirin']},
              {id:'sq-2',name:'二队',petIds:['flamechick']}];
  savePetStore(d);
  _petBattlePicks = ['sparkle','dream','nonebear','kirin'];
  switchTab('game');
  if (typeof renderGameViews === 'function') renderGameViews();
  var tv = document.getElementById('gameTrainView');
  if (tv) tv.style.display = 'block';
  return !!document.querySelector('.train-lineup') && document.querySelectorAll('.train-squad-row').length === 2;
})()
`;

const MEASURE_TRAIN = `
(function(){
  var out = { vp:[innerWidth,innerHeight], rows:[], card:null, scrollW:document.documentElement.scrollWidth, errors:[] };
  var card = document.querySelector('.train-lineup');
  if (!card) return out;
  var r = card.getBoundingClientRect();
  out.card = {x:+r.left.toFixed(1), w:+r.width.toFixed(1), right:+r.right.toFixed(1)};
  var rows = card.querySelectorAll('.train-squad-row');
  Array.prototype.forEach.call(rows, function(row){
    var rr = row.getBoundingClientRect();
    var chips = row.querySelector('.train-squad-chips');
    var txt = (row.querySelector('.train-squad-badge')||{}).textContent + '|' + (row.querySelector('.train-squad-name')||{}).textContent;
    out.rows.push({ h:+rr.height.toFixed(1), w:+rr.width.toFixed(1), right:+rr.right.toFixed(1), text:txt,
      chipOverflow: chips ? +(chips.scrollWidth - chips.clientWidth) : 0,
      chipCount: row.querySelectorAll('.train-squad-chip').length });
  });
  return out;
})()
`;

/* ---- 2) 关卡列表：g3 内页（g3-10 双 BOSS，g3-1 双场景） ---- */
const INJECT_STAGES = `
(function(){
  switchTab('game');
  switchGameTab('battle');
  showGroupStages('g3');
  return document.querySelectorAll('[data-stage]').length;
})()
`;

const MEASURE_STAGES = `
(function(){
  var out = { cards:[], scrollW:document.documentElement.scrollWidth, errors:[],
    modes: (document.querySelector('.gl-modes')||{}).textContent || '' };
  Array.prototype.forEach.call(document.querySelectorAll('[data-stage]'), function(c){
    var r = c.getBoundingClientRect();
    var tags = Array.prototype.map.call(c.querySelectorAll('.lv-tag'), function(t){ return t.textContent.trim(); });
    out.cards.push({ id:c.getAttribute('data-stage'), h:+r.height.toFixed(1), w:+r.width.toFixed(1),
      right:+r.right.toFixed(1), tags:tags,
      cls: c.className,
      overflowX: c.scrollWidth > c.clientWidth + 1 });
  });
  return out;
})()
`;

/* ---- 3) 宠物面板：两支编队 + 跨队占用的宠物 ---- */
const INJECT_PET = `
(function(){
  var d = getPetStore();
  d.pets = [];
  var picks = ['sparkle','dream','nonebear','kirin','flamechick'];
  picks.forEach(function(sid){
    var c = getPetCodex(sid) || {};
    var p = createPet({speciesId:sid, rarity:c.rarity||'R', name:c.name||sid});
    p.stage = 'mature'; p.isDead = false; p.injured = false;
    d.pets.push(p);
  });
  d.battlePicks = ['sparkle','dream'];
  d.squads = [{id:'sq-1',name:'一队',petIds:['sparkle','dream']},{id:'sq-2',name:'二队',petIds:['nonebear']}];
  savePetStore(d);
  _petBattlePicks = ['sparkle','dream'];
  _petSquadsOpen = true;
  renderPetPanel();
  return !!document.querySelector('.pet-squads');
})()
`;

const MEASURE_PET = `
(function(){
  var out = { cards:[], chips:{sel:[], taken:[]}, scrollW:document.documentElement.scrollWidth, errors:[],
    summary: { pickChips: document.querySelectorAll('.pet-pick-chip').length,
               clickableChips: document.querySelectorAll('[data-pet-pick]').length,
               jump: !! document.getElementById('petSquadEditJump'),
               count: (document.querySelector('.pet-lineup-count')||{}).textContent || '' },
    dbg: { squads: (typeof getPetSquads==='function') ? getPetSquads() : null,
           pets: (getPetStore().pets||[]).map(function(p){ return p.speciesId + ':' + p.stage + (p.isDead?'(dead)':'') }) } };
  Array.prototype.forEach.call(document.querySelectorAll('.pet-squad-card'), function(card){
    var r = card.getBoundingClientRect();
    var chips = card.querySelector('.pet-squad-chips');
    out.cards.push({ w:+r.width.toFixed(1), right:+r.right.toFixed(1), h:+r.height.toFixed(1),
      chipOverflow: chips ? +(chips.scrollWidth - chips.clientWidth) : 0,
      disabled: card.querySelectorAll('.pet-squad-chip[disabled]').length });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.pet-squad-chip'), function(c){
    var cs = getComputedStyle(c);
    var item = { name:(c.querySelector('.pet-squad-chip-name')||{}).textContent, bg:cs.backgroundColor, fg:cs.color,
      mark: !!c.querySelector('.pet-squad-chip-mark'), disabled: !!c.disabled,
      tag: (c.querySelector('.pet-squad-chip-tag')||{}).textContent || '' };
    if (c.getAttribute('aria-pressed') === 'true') out.chips.sel.push(item);
    if (c.classList.contains('is-taken')) out.chips.taken.push(item);
  });
  return out;
})()
`;

(function main() {
  let failed = 0;
  function check(name, cond, detail) {
    if (!cond) failed++;
    console.log((cond ? ' ✓ ' : ' ✗ ') + name + (detail !== undefined && !cond ? '  → ' + detail : ''));
  }

  (async () => {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
    catch (e) { console.error('静态服务未就绪（需要把 page/ 暴露在 ' + PORT + '）：' + e.message); process.exit(2); }
    if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const profile = path.join(os.tmpdir(), 'mh-squad-' + Date.now());
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/list');
        const page = list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) target = page;
      } catch (e) { /* 还没起来 */ }
    }
    if (!target) { chrome.kill(); console.error('Chrome CDP 未就绪（端口 ' + CDP_PORT + '）'); process.exit(2); }

    const cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    async function load(vp, inject) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      const loaded = cdp.waitEvent('Page.loadEventFired', 20000);
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
      await loaded;
      await sleep(600);
      const r = await cdp.send('Runtime.evaluate', { expression: inject, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
      await sleep(300);
      return r.result.value;
    }
    async function shot(vp, name) {
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT_DIR, name + '-' + vp.tag + '.png');
      fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
      console.log('    📷 ' + file);
    }

    for (const vp of [{ w: 360, h: 640, tag: '360x640' }, { w: 390, h: 844, tag: '390x844' }]) {
      console.log('\n===== 视口 ' + vp.tag + ' =====');

      /* 1) 培养页编队卡 */
      console.log('[1] 培养页「出战编队」');
      const inj1 = await load(vp, INJECT_TRAIN);
      check('培养页编队卡已渲染', inj1 === true, inj1);
      const m1 = (await cdp.send('Runtime.evaluate', { expression: MEASURE_TRAIN, returnByValue: true })).result.value;
      check('两支队各一行', m1.rows.length === 2, JSON.stringify(m1.rows.map(r => r.text)));
      check('每行触摸高度 ≥44px', m1.rows.every(r => r.h >= 44), JSON.stringify(m1.rows.map(r => r.h)));
      check('行内芯片不横向溢出', m1.rows.every(r => r.chipOverflow <= 1), JSON.stringify(m1.rows.map(r => r.chipOverflow)));
      check('页面无横向溢出', m1.scrollW <= vp.w + 1, 'scrollW=' + m1.scrollW);
      check('首发行徽标是「首发」', /首发/.test(m1.rows[0].text || ''), m1.rows[0].text);
      console.log('    行高 ' + m1.rows.map(r => r.h).join('/') + '，芯片 ' + m1.rows.map(r => r.chipCount).join('/') + ' 个');
      await shot(vp, 'train');

      /* 2) 关卡列表标签 */
      console.log('[2] 大关内页（g3）形态标签');
      const n2 = await load(vp, INJECT_STAGES);
      check('g3 有 10 个关卡卡片', n2 === 10, n2);
      const m2 = (await cdp.send('Runtime.evaluate', { expression: MEASURE_STAGES, returnByValue: true })).result.value;
      const by = id => m2.cards.filter(c => c.id === id)[0] || {};
      /* v2.14.25（评审 P2-3）：形态改「只标例外」—— 常规双场景不再逐卡打标，分布写在 .gl-modes */
      check('g3-1 不再逐卡打「双场景」', (by('g3-1').tags || []).length === 0, JSON.stringify(by('g3-1').tags));
      check('g3-5 精英关同样不打标', (by('g3-5').tags || []).length === 0, JSON.stringify(by('g3-5').tags));
      check('g3-10 标「双 BOSS」', /双 BOSS/.test((by('g3-10').tags || []).join()), JSON.stringify(by('g3-10').tags));
      check('g4-10 不标（单场景 Boss）', (by('g4-10').tags || []).length === 0, JSON.stringify(by('g4-10').tags));
      check('列表头写明形态分布（9 关双场景）', /9 关双场景/.test(m2.modes), m2.modes);
      check('列表头点出双 BOSS 数量', /1 关双 BOSS/.test(m2.modes), m2.modes);
      check('关卡卡状态走类（可挑战 = .is-open 或 .locked）',
        m2.cards.every(c => /is-open|locked|done/.test(c.cls)), JSON.stringify(m2.cards.map(c => c.cls)));
      check('所有卡片无横向溢出', m2.cards.every(c => !c.overflowX && c.right <= vp.w + 1), JSON.stringify(m2.cards.filter(c => c.overflowX)));
      check('页面无横向溢出', m2.scrollW <= vp.w + 1, 'scrollW=' + m2.scrollW);
      console.log('    g3-1 标签 ' + JSON.stringify(by('g3-1').tags) + ' · g3-10 标签 ' + JSON.stringify(by('g3-10').tags) + ' · 头 ' + m2.modes.trim());
      await shot(vp, 'stages');

      /* 3) 宠物面板编队管理 */
      console.log('[3] 宠物面板「编队管理」');
      const inj3 = await load(vp, INJECT_PET);
      check('编队区已展开渲染', inj3 === true, inj3);
      const m3 = (await cdp.send('Runtime.evaluate', { expression: MEASURE_PET, returnByValue: true })).result.value;
      check('两张队伍卡', m3.cards.length === 2, JSON.stringify(m3.cards));
      /* v2.14.25（评审 P1-1）：摘要只读 + 唯一编辑入口 */
      check('出战编队摘要 = 首发 2 只只读芯片', m3.summary.pickChips === 2, m3.summary.pickChips);
      check('摘要里没有可点芯片（data-pet-pick = 0）', m3.summary.clickableChips === 0, m3.summary.clickableChips);
      check('有「编队管理 ›」跳转入口', m3.summary.jump === true, m3.summary.jump);
      check('摘要容量显示 2/4', /2\/4/.test(m3.summary.count), m3.summary.count);
      /* 选中芯片 = 一队 2 只 + 二队 1 只（跨两张卡统计） */
      check('选中芯片实心填充（背景不透明）', m3.chips.sel.length === 3 && m3.chips.sel.every(c => !/rgba\(0, 0, 0, 0\)/.test(c.bg)),
        JSON.stringify(m3.chips.sel.map(c => c.name + ':' + c.bg)));
      check('选中芯片带 ✓', m3.chips.sel.every(c => c.mark), JSON.stringify(m3.chips.sel));
      check('跨队占用：标「在 一队」且禁用', m3.chips.taken.length >= 1 && m3.chips.taken.every(c => c.disabled && /在 /.test(c.tag)),
        JSON.stringify(m3.chips.taken));
      check('队伍卡无横向溢出', m3.cards.every(c => c.chipOverflow <= 1 && c.right <= vp.w + 1), JSON.stringify(m3.cards));
      check('页面无横向溢出', m3.scrollW <= vp.w + 1, 'scrollW=' + m3.scrollW);
      console.log('    选中 ' + m3.chips.sel.map(c => c.name + '(bg=' + c.bg + ')').join(' / ') + ' · 占用 ' + m3.chips.taken.map(c => c.name + c.tag).join(' / '));
      console.log('    dbg squads=' + JSON.stringify(m3.dbg.squads) + ' pets=' + JSON.stringify(m3.dbg.pets));
      await shot(vp, 'squads');
    }

    cdp.close();
    chrome.kill();
    console.log('\n' + (failed === 0 ? '✅ 编队 / 标签版式全部通过' : '❌ 失败 ' + failed + ' 项') + '（截图目录 ' + OUT_DIR + '）');
    process.exit(failed ? 1 : 0);
  })().catch(e => { console.error('未捕获异常:', e); try { chrome.kill(); } catch (_) { /* 忽略 */ } process.exit(2); });
})();

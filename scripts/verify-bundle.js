#!/usr/bin/env node
/* v2.14.30（评审 P3-3）打包产物等价性验证。
 *
 * 目的：证明「把 55 个脚本拼成 1 个」不改变任何一屏的渲染结果 ——
 *   逐个视图（14 个，与 audit-whole-ui.js 同一份清单）分别加载
 *     A) page/index.html         （56 个资源，源码路径）
 *     B) page/index.bundle.html  （2 个资源，产物路径）
 *   然后比对 `document.body.innerText` 的 sha256；同时记录 B 的 console 错误与资源条目数。
 *
 * 用法：node scripts/verify-bundle.js
 * 前置：node scripts/build-bundle.js 已跑过；静态服务把 page/ 暴露在 8099。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9341;
const OUT_DIR = path.join(__dirname, '..', '_tmp-bundle-verify');
const CHROME = process.env.MH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpJson = async url => (await fetch(url)).json();
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function connect(wsUrl) {
  const WS = globalThis.WebSocket;
  const ws = new WS(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method) { listeners.forEach(fn => fn(m)); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('WS 连接失败'))); });
  return {
    ready,
    on(fn) { listeners.push(fn); },
    send(method, params) { const mid = ++id; return new Promise((resolve, reject) => { pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); }); },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

/* 与 audit-whole-ui.js 的 VIEWS 保持同一份清单（新增视图时两边一起改） */
const VIEWS = [
  { id: 'train-strength', label: '训练·力量', inject: "switchTab('training'); switchSub('training','strength')" },
  { id: 'train-cardio', label: '训练·有氧', inject: "switchTab('training'); switchSub('training','cardio')" },
  { id: 'profile-personal', label: '个人·个人数据', inject: "switchTab('profile'); switchSub('profile','personal')" },
  { id: 'profile-stats', label: '个人·训练数据', inject: "switchTab('profile'); switchSub('profile','stats')" },
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

const TARGETS = [
  { tag: 'src', url: '/index.html', label: '源码（56 资源）' },
  { tag: 'bundle', url: '/index.bundle.html', label: '产物（2 资源）' }
];

(async () => {
  for (const u of TARGETS) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + u.url); if (!r.ok) throw new Error('HTTP ' + r.status); }
    catch (e) { console.error('静态服务未就绪或缺少 ' + u.url + '：' + e.message + '\n（先跑 node scripts/build-bundle.js）'); process.exit(2); }
  }
  if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-bundle-' + Date.now());
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

  const result = { src: {}, bundle: {} };
  const consoleErrors = [];
  cdp.on(m => {
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  for (const t of TARGETS) {
    for (const view of VIEWS) {
      consoleErrors.length = 0;
      /* 每次视图都从「空存档」开始 —— 两套加载同源（8099），localStorage 共用；
       * 血泪：先跑源码 14 视图（其中宠物面板会 savePetStore 写 5 只宠），再跑产物时
       * 「挑战·培养」读到这批宠 → 598 字 vs 611 字，误报「渲染不一致」。
       * 现在先在同一源下清空 storage，再重新导航到目标页，两侧状态严格对齐。 */
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
      await sleep(180);
      await cdp.send('Runtime.evaluate', { expression: 'try{localStorage.clear();sessionStorage.clear()}catch(e){}', returnByValue: true });
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + t.url });
      await sleep(900);
      const r = await cdp.send('Runtime.evaluate', { expression: view.inject, returnByValue: true });
      if (r.exceptionDetails) { result[t.tag][view.id] = { error: r.exceptionDetails.text }; continue; }
      await sleep(300);
      /* 稳定采样：同一视图反复读到**三次连续相同**才算落定。
       * 血泪：最初只用一次 300ms 采样，「挑战·培养」在**源码侧**（56 个请求、加载更慢）读出 598 字，
       * 产物侧 611 字 → 误报「渲染不一致」。加长到 1500ms 后两侧逐字相同，说明是采样过早、不是产物问题。
       * 所以这里用「连续三次一致」的收敛判据，最多等 3s。 */
      const readOnce = async () => cdp.send('Runtime.evaluate', {
        expression: `(function(){
          var res=performance.getEntriesByType('resource');
          var js=0; res.forEach(function(e){ if(/\\.js(\\?|$)/.test(e.name)) js++; });
          return { text: document.body.innerText, bytes: res.length, js: js,
                   ver: (document.getElementById('appVersion')||{}).textContent||'' };
        })()`, returnByValue: true
      });
      let read = await readOnce();
      if (!read.exceptionDetails) {
        let stable = 0, prev = read.result.value.text;
        for (let i = 0; i < 10 && stable < 2; i++) {
          await sleep(280);
          const next = await readOnce();
          if (next.exceptionDetails) break;
          if (next.result.value.text === prev) stable++; else { stable = 0; prev = next.result.value.text; }
          read = next;
        }
      }
      if (read.exceptionDetails) { result[t.tag][view.id] = { error: read.exceptionDetails.text }; continue; }
      const v = read.result.value;
      result[t.tag][view.id] = {
        hash: sha(v.text), chars: v.text.length, resources: v.bytes, jsFiles: v.js,
        ver: v.ver, errors: consoleErrors.slice()
      };
    }
  }

  cdp.close();
  chrome.kill();

  const fails = [];
  const rows = VIEWS.map(v => {
    const a = result.src[v.id] || {}, b = result.bundle[v.id] || {};
    const same = a.hash && b.hash && a.hash === b.hash;
    if (!a.hash) fails.push(v.label + '：源码加载失败 ' + (a.error || ''));
    if (!b.hash) fails.push(v.label + '：产物加载失败 ' + (b.error || ''));
    if (a.hash && b.hash && !same) fails.push(v.label + '：渲染不一致（' + a.hash + ' vs ' + b.hash + '，字符 ' + a.chars + ' vs ' + b.chars + '）');
    if (b.errors && b.errors.length) fails.push(v.label + '：产物有报错 ' + b.errors[0]);
    return { 视图: v.label, srcHash: a.hash, bundleHash: b.hash, 一致: same ? '✔' : '✗',
      源码资源: a.resources, 产物资源: b.resources, 产物js: b.jsFiles };
  });

  const sampleSrc = result.src[VIEWS[0].id] || {}, sampleBundle = result.bundle[VIEWS[0].id] || {};
  if (sampleSrc.resources && sampleBundle.resources && sampleBundle.resources >= sampleSrc.resources) {
    fails.push('产物资源数没有下降：' + sampleSrc.resources + ' → ' + sampleBundle.resources);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'bundle-metrics.json'), JSON.stringify(result, null, 1), 'utf8');
  console.table(rows);
  console.log('资源条目（训练·力量视图）：源码 ' + sampleSrc.resources + ' → 产物 ' + sampleBundle.resources +
    '（其中 JS ' + sampleSrc.jsFiles + ' → ' + sampleBundle.jsFiles + '）');
  if (fails.length) {
    console.error('\n✗ 失败 ' + fails.length + ' 项：\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('\n✔ 14 视图渲染逐字一致，产物无报错');
  process.exit(0);
})().catch(e => { console.error('未捕获异常:', e); process.exit(2); });

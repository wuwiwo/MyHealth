#!/usr/bin/env node
/* v2.14.36 真机复核：动作数据集懒加载。
 * 为什么必须真机跑：懒加载的收益全在「首屏到底请求了什么」上，静态断言证明不了请求时序。
 * 量法（打开线上同构的产物入口 page/index.html，360×640）：
 *   ① 首屏 1 秒内的请求清单（应当只有 app.js / index.css）
 *   ② 1.6 秒后数据集是否已自动拉取（空闲预取）
 *   ③ 拉取到位后 EXD.ready() / 条目数 / 训练页动作卡是否出图
 *   ④ 打开「动作百科」overlay 是否正常打开（数据已就绪路径）
 * 用法：node scripts/verify-lazy-dataset.js  （需 8099 静态服务；CDP 9348）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9348;
const OUT_DIR = path.join(__dirname, '..', '_tmp-whole-audit');
const CHROME = process.env.MH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new globalThis.WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws'))); });
  return {
    ready,
    send(method, params) { const mid = ++id; return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); }); },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-lazy-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); target = list.find(t => t.type === 'page') || null; } catch (e) { /* 等 */ }
  }
  if (!target) { chrome.kill(); console.error('CDP 未就绪'); process.exit(2); }

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });

  const t0 = Date.now();
  const reqs = [];
  const cdpWrap = cdp; /* requestWillBeSent 由下面的原始 socket 事件给不到，改用 getEntriesByType 读 Performance 时间线 */
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(1000);
  const early = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const es = performance.getEntriesByType('resource').map(e => ({ n: e.name.split('/index.html')[1] || e.name, t: Math.round(e.startTime) }));
      return { entries: es, ready: (typeof EXD !== 'undefined' && EXD.ready()) ? true : false };
    })()`, returnByValue: true
  });
  await sleep(1200);   /* 跨过 1200ms 空闲预取点 */
  const late = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const es = performance.getEntriesByType('resource').map(e => ({ n: e.name.split('/index.html')[1] || e.name, t: Math.round(e.startTime) }));
      const ds = performance.getEntriesByType('resource').filter(e => /exercises-dataset/.test(e.name));
      return {
        entries: es,
        datasetRequests: ds.length,
        datasetStart: ds.length ? Math.round(ds[0].startTime) : null,
        datasetBytes: ds.length ? ds[0].transferSize : 0,
        ready: (typeof EXD !== 'undefined' && EXD.ready()),
        count: (typeof EXD !== 'undefined' && EXD.ready()) ? EXD.count() : 0,
        cardImgs: document.querySelectorAll('img[src*="media/"], img[src*="gymvisual"]').length
      };
    })()`, returnByValue: true
  });
  const wiki = await cdp.send('Runtime.evaluate', {
    expression: `(async () => { switchTab('settings'); switchSub('settings','library'); await new Promise(r=>setTimeout(r,150)); const b=document.getElementById('exWikiBtn'); if(!b) return {noBtn:true}; b.click(); await new Promise(r=>setTimeout(r,300)); const ov=document.getElementById('dsPicker'); return { opened: !!ov, chips: ov ? ov.querySelectorAll('.car-type').length : 0, cards: ov ? ov.querySelectorAll('.ds-card, .dsrow, .exd-card').length : 0, text: ov ? (ov.innerText||'').slice(0,60) : '' }; })()`,
    returnByValue: true, awaitPromise: true
  });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, 'lazy-dataset-wiki-360x640.png'), Buffer.from(shot.data, 'base64'));

  cdp.close(); chrome.kill();
  const res = { early: early.result && early.result.value, late: late.result && late.result.value, wiki: wiki.result && wiki.result.value };
  fs.writeFileSync(path.join(OUT_DIR, 'lazy-dataset.json'), JSON.stringify(res, null, 1), 'utf8');
  console.log('首屏 1s 内资源：\n  ' + (res.early.entries || []).map(e => e.n + ' @' + e.t + 'ms').join('\n  '));
  console.log('1.6s 后：数据集请求 ' + res.late.datasetRequests + ' 次，开始于 ' + res.late.datasetStart + 'ms，传输 ' + Math.round(res.late.datasetBytes / 1024) + ' KB；ready=' + res.late.ready + '，条目=' + res.late.count + '，动作卡图 ' + res.late.cardImgs);
  console.log('动作百科：' + JSON.stringify(res.wiki));

  const appEntry = (res.late.entries || []).find(e => /_build\/app\.js/.test(e.n)) || {};
  const dsEntry = (res.late.entries || []).find(e => /exercises-dataset/.test(e.n)) || {};
  const checks = [
    [appEntry.t != null && dsEntry.t != null && dsEntry.t > appEntry.t + 100, '数据集排在入口包之后才拉（app.js @' + appEntry.t + 'ms → 数据集 @' + dsEntry.t + 'ms）'],
    [res.late.datasetRequests === 1, '空闲预取恰好拉 1 次数据集'],
    [res.late.datasetStart !== null && res.late.datasetStart >= 1000, '数据集在首屏之后才拉（startTime ' + res.late.datasetStart + 'ms ≥ 1000）'],
    [res.late.ready === true && res.late.count > 800, '数据到位：ready=true、条目 ' + res.late.count + ' 条'],
    [res.late.cardImgs > 0, '动作卡在数据到达后出图（' + res.late.cardImgs + ' 张）'],
    [res.wiki.opened === true, '动作百科 overlay 正常打开'],
    [res.wiki.chips > 10, '部位/器械筛选芯片已渲染（' + res.wiki.chips + ' 个）']
  ];
  let bad = 0;
  for (const [c, m] of checks) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; }
  console.log('\n===== 结果: ' + (checks.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();

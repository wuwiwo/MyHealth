#!/usr/bin/env node
/* v2.14.40 真机验证：挑战/宠物按需包（CDP 9355）
   为什么必须真机：静态断言只能证明「代码里写了 loadGamePack」，证明不了
   「首屏真的没拉 137KB 包、进挑战才拉、拉完挑战页真的画出来」。
   量法（直接打开**产物入口** page/index.html，与线上同一条路径）：
     ① 首屏（训练 tab）：资源里没有 pack-game.js；renderGameViews 未定义；训练页正常渲染
     ② 点「挑战」：出现 pack-game.js 请求 → 挑战页渲染出内容（按钮 / 视图容器）
     ③ 再点「挑战」：不重复请求（幂等）
     ④ 打开宠物面板：面板渲染出内容（pet-ui 也在这个包里）
   用法：node scripts/verify-game-pack.js （需 8099 静态服务）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9355;
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

  const profile = path.join(os.tmpdir(), 'mh-pack-' + Date.now());
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
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const evalJs = async expr => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const resources = () => evalJs("[performance.getEntriesByType('resource').map(r=>r.name.replace(/^.*\\//,'')).filter(n=>/pack-game|app\\.js|index\\.css/.test(n))]");

  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(3000);

  /* ① 首屏 */
  const resList = await resources();
  const firstScreen = await evalJs(`(() => {
    const btn = document.getElementById('addStrSet') || document.querySelector('#tabTraining button');
    return {
      hasViews: typeof renderGameViews === 'function',
      hasPetPanel: typeof renderPetPanel === 'function',
      trainRendered: !!btn,
      bodyText: (document.body.innerText || '').length
    };
  })()`);

  /* ② 进挑战 */
  await evalJs("document.getElementById('tabBtnGame').click();1");
  await sleep(2500);
  const afterGame = await evalJs(`(() => {
    const host = document.getElementById('tabGame');
    const btns = host ? host.querySelectorAll('button').length : 0;
    return {
      hasViews: typeof renderGameViews === 'function',
      hasPetPanel: typeof renderPetPanel === 'function',
      buttons: btns,
      textLen: host ? (host.innerText || '').length : 0,
      retryBtn: !!document.getElementById('gameRetryBtn')
    };
  })()`);
  const res2 = await resources();

  /* ③ 再进一次（离开再回来）→ 不重复请求 */
  await evalJs("document.getElementById('tabBtnTraining').click();1");
  await sleep(400);
  await evalJs("document.getElementById('tabBtnGame').click();1");
  await sleep(900);
  const res3 = await resources();

  /* ④ 宠物面板 */
  const petBtn = await evalJs("(()=>{const b=document.querySelector('[data-open-pet]');if(!b)return 'none';b.click();return 'clicked'})()");
  await sleep(900);
  const petPanel = await evalJs(`(() => {
    const ov = document.querySelector('.panel-overlay.open, .panel-overlay');
    const txt = document.body.innerText || '';
    return { overlayOpen: !!document.querySelector('.panel-overlay.open'), hasPanelTitle: txt.indexOf('宠物面板') >= 0, hasMaterials: txt.indexOf('营养液') >= 0 };
  })()`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, 'game-pack-390x844.png'), Buffer.from(shot.data, 'base64'));

  cdp.close(); chrome.kill();
  const res = { firstScreen, resList, afterGame, res2, res3, petBtn, petPanel };
  fs.writeFileSync(path.join(OUT_DIR, 'game-pack.json'), JSON.stringify(res, null, 1), 'utf8');
  console.log(JSON.stringify(res, null, 1));

  const countPack = l => l.filter(n => /pack-game/.test(n)).length;
  const checks = [
    [countPack(resList) === 0, '首屏资源里没有 pack-game.js（实测 ' + countPack(resList) + ' 个）'],
    [resList.some(n => /app\.js/.test(n)), '首屏资源里有主包 app.js'],
    [firstScreen.hasViews === false, '首屏 renderGameViews 未定义（真没加载）'],
    [firstScreen.trainRendered === true && firstScreen.bodyText > 100, '训练页正常渲染（body 文本 ' + firstScreen.bodyText + ' 字）'],
    [countPack(res2) === 1, '进挑战后 pack-game.js 被拉取 1 次（实测 ' + countPack(res2) + '）'],
    [afterGame.hasViews === true, 'pack 到位后 renderGameViews 已定义'],
    [afterGame.buttons > 3 && afterGame.textLen > 50, '挑战页渲染出内容（按钮 ' + afterGame.buttons + ' 个 / 文本 ' + afterGame.textLen + ' 字）'],
    [afterGame.retryBtn === false, '加载成功时没有出现「重试」按钮'],
    [countPack(res3) === 1, '再次进挑战不重复请求（实测 ' + countPack(res3) + ' 次）'],
    [petBtn !== 'none' && petPanel.overlayOpen === true, '宠物面板能打开（overlay open=' + petPanel.overlayOpen + '）'],
    [petPanel.hasMaterials === true, '宠物面板内容渲染（含「营养液」材料行）']
  ];
  let bad = 0;
  for (const [okc, msg] of checks) { console.log((okc ? '  ✓ ' : '  ✗ ') + msg); if (!okc) bad++; }
  console.log('\n===== 结果: ' + (checks.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();

#!/usr/bin/env node
/* v2.14.38：验证「系统主题实时跟随」（评审 §21.4 扣分项②）。
 * 为什么必须真机跑：跟随系统靠 matchMedia('(prefers-color-scheme: light)') 的 change 事件，
 * 静态断言只能证明代码里挂了监听，证明不了「系统切了、页面真的跟着变」。
 * 量法（CDP 9351 + Emulation.setEmulatedMedia 模拟系统主题）：
 *   ① 默认 theme=system，系统深色 → data-theme 为空（深）
 *   ② 系统切浅色 → 自动变 data-theme="light"，且按钮图标/aria-label 同步
 *   ③ 手动 setTheme('dark') 后系统再切 → **不跟随**（用户手动选择优先）
 *   ④ 改回 system → 再次跟随
 * 用法：node scripts/verify-theme-follow.js （需 8099 静态服务）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9351;
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

const STATE = `(() => {
  const btn = document.getElementById('themeToggle') || {};
  const ico = btn.querySelector ? btn.querySelector('.hb-ico') : null;
  return {
    theme: (typeof getTheme === 'function') ? getTheme() : null,
    eff: (typeof effTheme === 'function') ? effTheme() : null,
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    ico: ico ? ico.textContent : null,
    aria: btn.getAttribute ? btn.getAttribute('aria-label') : null
  };
})()`;

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-theme-' + Date.now());
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
  const media = scheme => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  const state = async () => (await cdp.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value;

  /* ① 系统深色启动 */
  await media('dark');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(2600);
  const a = await state();

  /* ② 系统切浅色（不刷新页面，只改系统偏好）→ 应自动跟随 */
  await media('light');
  await sleep(400);
  const b = await state();

  /* ③ 手动选深色，再把系统切回深/浅两次 → 不应跟随 */
  await cdp.send('Runtime.evaluate', { expression: "setTheme('dark')", returnByValue: true });
  await media('light');
  await sleep(400);
  const c = await state();

  /* ④ 改回跟随系统 → 应跟回系统当前（light） */
  await cdp.send('Runtime.evaluate', { expression: "setTheme('system')", returnByValue: true });
  await sleep(400);
  const d = await state();

  /* ⑤ 系统再切深色 → 跟随 */
  await media('dark');
  await sleep(400);
  const e = await state();

  cdp.close(); chrome.kill();
  const res = { bootDark: a, sysLight: b, manualDark: c, backToSystem: d, sysDark: e };
  fs.writeFileSync(path.join(OUT_DIR, 'theme-follow.json'), JSON.stringify(res, null, 1), 'utf8');
  console.log(JSON.stringify(res, null, 1));

  const checks = [
    [a.theme === 'system' && a.eff === 'dark' && !a.attr, '默认 system；系统深色 → data-theme 为空（深底 ' + a.bg + '）'],
    [a.ico === '🌙', '深色下按钮图标为 🌙（实测 ' + a.ico + '）'],
    [b.eff === 'light' && b.attr === 'light', '系统切浅色 → 页面自动跟随（data-theme=' + b.attr + '，底色 ' + b.bg + '）'],
    [b.ico === '☀️' && /浅色/.test(b.aria || ''), '图标与 aria-label 同步（' + b.ico + ' / ' + b.aria + '）'],
    [c.theme === 'dark' && !c.attr, '手动选深色后，系统切浅色**不跟随**（data-theme=' + c.attr + '）'],
    [d.theme === 'system' && d.attr === 'light', '改回「跟随系统」→ 立刻对齐系统当前（light）'],
    [e.eff === 'dark' && !e.attr, '系统再切深色 → 再次跟随']
  ];
  let bad = 0;
  for (const [okc, msg] of checks) { console.log((okc ? '  ✓ ' : '  ✗ ') + msg); if (!okc) bad++; }
  console.log('\n===== 结果: ' + (checks.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();

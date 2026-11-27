#!/usr/bin/env node
/* v2.14.35 真机复核：删除撤销条。
 * 为什么必须真机跑：撤销条是「删完才出现、点一下才恢复」的时序行为，
 * 静态断言只能证明代码写了，证明不了 DOM 真的出现、真的能恢复、真的 30 秒后消失。
 * 步骤：设置·动作库 → 桩掉 confirm → 删第一张动作卡 → 量撤销条（可见/文案/按钮尺寸）
 *       → 点「撤销」→ 量动作数回到原值 → 再删一次等超时 → 量撤销条自动消失。
 * 用法：node scripts/verify-undo.js   （需 8099 静态服务；CDP 9346）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9346;
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

const STEP_DEL = `(async () => {
  const before = getExercises().length;
  window.confirm = () => true;                       /* 桩掉确认框，直接执行删除 */
  const btn = document.querySelector('[data-a="exDel"]');
  if (!btn) return { error: 'no exDel button' };
  const name = btn.getAttribute('aria-label') || '';
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  const bar = document.querySelector('#undoC .undo-bar');
  if (!bar) return { before, afterClick: getExercises().length, barPresent: false };
  const rBtn = bar.querySelector('.undo-btn');
  const rBox = rBtn.getBoundingClientRect();
  const rBar = bar.getBoundingClientRect();
  const secEl = bar.querySelector('.undo-sec');
  const txtEl = bar.querySelector('.undo-txt');
  return {
    before,
    afterClick: getExercises().length,
    barPresent: true,
    text: txtEl.textContent,
    secText: secEl ? secEl.textContent : null,
    txtW: Math.round(txtEl.scrollWidth),
    txtAvail: Math.round(txtEl.clientWidth),
    secTruncated: txtEl.scrollWidth > txtEl.clientWidth + 1,
    role: bar.getAttribute('role'),
    undoBtnLabel: rBtn.textContent,
    undoBtnH: Math.round(rBox.height),
    undoBtnW: Math.round(rBox.width),
    closeLabel: bar.querySelector('.undo-x').getAttribute('aria-label'),
    barAboveTabbar: rBar.bottom <= window.innerHeight,
    deletedName: name,
    count1: document.querySelectorAll('#undoC .undo-bar').length
  };
})()`;

const STEP_UNDO = `(async () => {
  const hit = document.querySelector('#undoC .undo-btn');
  if (!hit) return { error: 'no undo btn' };
  hit.click();
  await new Promise(r => setTimeout(r, 200));
  return { afterUndo: getExercises().length, barGone: !document.querySelector('#undoC .undo-bar') };
})()`;

const STEP_TIMEOUT = `(async () => {
  window.confirm = () => true;
  const btn = document.querySelector('[data-a="exDel"]');
  if (!btn) return { error: 'no exDel button' };
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  const present = !!document.querySelector('#undoC .undo-bar');
  await new Promise(r => setTimeout(r, 31000));
  return { presentAtStart: present, presentAfter31s: !!document.querySelector('#undoC .undo-bar') };
})()`;

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-undo-' + Date.now());
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
  await sleep(900);
  await cdp.send('Runtime.evaluate', { expression: "setTheme('light');switchTab('settings');switchSub('settings','library');1", returnByValue: true });
  await sleep(400);

  const step = await cdp.send('Runtime.evaluate', { expression: STEP_DEL, returnByValue: true, awaitPromise: true });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, 'undo-bar-360x640.png'), Buffer.from(shot.data, 'base64'));

  const undo = await cdp.send('Runtime.evaluate', { expression: STEP_UNDO, returnByValue: true, awaitPromise: true });
  const timeoutStep = await cdp.send('Runtime.evaluate', { expression: STEP_TIMEOUT, returnByValue: true, awaitPromise: true, timeout: 60000 });

  cdp.close(); chrome.kill();
  const res = { step: step.result && step.result.value, undo: undo.result && undo.result.value, timeout: timeoutStep.result && timeoutStep.result.value };
  fs.writeFileSync(path.join(OUT_DIR, 'undo-verify.json'), JSON.stringify(res, null, 1), 'utf8');
  console.log(JSON.stringify(res, null, 1));

  const s = res.step || {}, u = res.undo || {}, t = res.timeout || {};
  const checks = [
    [s.barPresent === true, '删除后出现撤销条'],
    [typeof s.text === 'string' && s.text.indexOf('已删除动作') >= 0, '文案写明删了哪个动作'],
    [s.secText === '30s', '时限与常量一致（初始 30s）'],
    [typeof s.secText === 'string' && /^\d+s$/.test(s.secText), '倒计时标签格式正确（实测 ' + s.secText + '）'],
    [s.secTruncated === false, '正文与倒计时都没被截断（实测宽度 ' + s.txtW + ' / 可用 ' + s.txtAvail + '）'],
    [s.role === 'status', '撤销条 role=status（读屏可播报）'],
    [s.undoBtnH >= 44 && s.undoBtnW >= 44, '撤销按钮 ≥ 44×44（实测 ' + s.undoBtnH + '×' + s.undoBtnW + '）'],
    [s.closeLabel === '关闭撤销提示', '关闭按钮 aria-label 正确'],
    [s.count1 === 1, '一次只有一条撤销条'],
    [s.afterClick === s.before - 1, '删除真的生效（' + s.before + ' → ' + s.afterClick + '）'],
    [u.afterUndo === s.before, '撤销后动作数回到原值（' + u.afterUndo + '）'],
    [u.barGone === true, '撤销后撤销条消失'],
    [t.presentAtStart === true && t.presentAfter31s === false, '30 秒后撤销条自动消失（= 确认删除）']
  ];
  let bad = 0;
  for (const [c, m] of checks) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; }
  console.log('\n===== 结果: ' + (checks.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();

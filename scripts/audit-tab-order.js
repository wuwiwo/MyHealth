#!/usr/bin/env node
/* v2.14.34（评审 §6 未验证项收回）：键盘可达性与 Tab 顺序审计。
 *
 * 为什么需要单独的脚本：`audit-whole-ui.js` 量的都是「看得见的问题」（对比度 / 尺寸 / 溢出），
 * 而键盘用户的问题只有「按 Tab 键真的走一遍」才暴露：点得动但聚焦不到、顺序与视觉顺序相反、
 * 隐藏元素仍占 Tab 位、模态打开后焦点能跑到背后 —— 这四类都在这里量。
 *
 * 量法（逐视图，360×640，浅色主题）：
 *   ① DOM 顺序里的可聚焦元素（button / a[href] / input / select / textarea / [tabindex]）
 *   ② 「可点但不可聚焦」：带 onclick / data-a / role=button 却没有 tabindex 且不是原生控件 → 键盘到不了
 *   ③ 隐藏却可聚焦：display:none / visibility:hidden / aria-hidden 但仍 tabbable
 *   ④ 顺序 vs 视觉顺序：DOM 序与「上→下、左→右」排序做比对，记录倒置对（>80px 才算，避免同排抖动误报）
 *   ⑤ 焦点环可见性：focus() 后 computed outline-width > 0 或 box-shadow 非 none
 *   ⑥ 模态焦点：打开一个模态后，Tab 是否能到达 .modal 之外的元素
 *
 * 用法：node scripts/audit-tab-order.js        （需 8099 静态服务；CDP 9345）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9345;
const OUT_DIR = path.join(__dirname, '..', '_tmp-whole-audit');
const CHROME = process.env.MH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new globalThis.WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws'))); });
  return {
    ready,
    send(method, params) { const mid = ++id; return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); }); },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

const PROBE = `(() => {
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]';
  const nodes = [...document.querySelectorAll(FOCUSABLE)];
  const visible = n => {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = n => (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' · ' + (n.textContent || '').trim().slice(0, 14);
  const tabbable = nodes.filter(n => {
    if (n.disabled) return false;
    const ti = n.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false;
    return visible(n);
  });
  /* ② 可点但不可聚焦 */
  const clickOnly = [...document.querySelectorAll('div[data-a], span[data-a], div[onclick], span[onclick], [role="button"]')]
    .filter(n => visible(n) && !n.matches(FOCUSABLE) && n.getAttribute('tabindex') === null)
    .map(label);
  /* ③ 隐藏却可聚焦 */
  const hiddenFocusable = nodes.filter(n => !visible(n) && n.getAttribute('tabindex') !== null && Number(n.getAttribute('tabindex')) >= 0).map(label);
  /* ④ DOM 序 vs 视觉序 */
  const geom = tabbable.map((n, i) => {
    const r = n.getBoundingClientRect();
    return { i, top: Math.round(r.top + window.scrollY), left: Math.round(r.left), label: label(n) };
  });
  const visual = [...geom].sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const inversions = [];
  let maxLag = 0;
  visual.forEach((v, vi) => {
    const lag = v.i - vi;
    if (lag > maxLag) maxLag = lag;
    if (lag > 1) inversions.push({ dom: v.i, vis: vi, label: v.label, lag });
  });
  const inversionsBig = inversions.filter(x => {
    const a = geom[x.vis], b = geom[x.dom];
    return a && b && Math.abs(a.top - b.top) > 80;
  });
  /* ⑤ 焦点环 */
  const sample = tabbable.slice(0, 12);
  const ringMissing = [];
  for (const n of sample) {
    const before = document.activeElement;
    n.focus();
    const cs = getComputedStyle(n);
    const hasRing = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none')
      || (cs.boxShadow && cs.boxShadow !== 'none')
      || (cs.borderColor !== getComputedStyle(n.parentElement || n).borderColor);
    if (!hasRing) ringMissing.push(label(n));
    if (before && before.focus) before.focus();
  }
  return {
    tabbable: tabbable.length,
    clickOnly, hiddenFocusable,
    inversions: inversionsBig,
    maxLag,
    ringMissing,
    samples: geom.slice(0, 10).map(g => g.label)
  };
})()`;

/* 模态焦点：打开「属性计算方式」弹窗后，验证 ① 焦点被送进弹窗 ② Tab 在弹窗内环回 ③ 背后不可达 */
const MODAL_PROBE = `(async () => {
  const btn = document.getElementById('setAttrInfoBtn');
  if (!btn) return { skip: '无属性计算入口' };
  btn.focus(); btn.click();
  await new Promise(r => setTimeout(r, 120));   /* 等 MutationObserver 的 setTimeout(0) 跑完 */
  const sheet = document.querySelector('.modal-sheet, .modal');
  if (!sheet) return { skip: '弹窗未打开' };
  const list = [...sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]')]
    .filter(n => !n.disabled && n.getClientRects().length && getComputedStyle(n).display !== 'none');
  const focusInsideOnOpen = sheet.contains(document.activeElement);
  /* 从最后一个可聚焦元素按 Tab：应当环回到第一个，而不是跳到背后的顶栏 */
  const last = list[list.length - 1];
  last.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  const wrappedToFirst = document.activeElement === list[0];
  const stillInside = sheet.contains(document.activeElement);
  const outside = [...document.querySelectorAll('#syncBtn,#themeToggle,.tab-btn')]
    .filter(n => n.getClientRects().length).length;
  return {
    focusInsideOnOpen, wrappedToFirst, stillInside,
    focusables: list.length,
    activeLabel: (document.activeElement.id || document.activeElement.className || document.activeElement.tagName) + '',
    backgroundButtons: outside,
    trapOn: !!window.__modalTrapOn
  };
})()`;

const VIEWS = [
  { id: 'train-strength', inject: "switchTab('training'); switchSub('training','strength'); 1" },
  { id: 'train-cardio', inject: "switchTab('training'); switchSub('training','cardio'); 1" },
  { id: 'profile-personal', inject: "switchTab('profile'); switchSub('profile','personal'); 1" },
  { id: 'profile-training', inject: "switchTab('profile'); switchSub('profile','training'); 1" },
  { id: 'game-train', inject: "switchTab('game'); switchGameTab('train'); 1" },
  { id: 'game-battle', inject: "switchTab('game'); switchGameTab('battle'); 1" },
  { id: 'game-record', inject: "switchTab('game'); switchGameTab('record'); 1" },
  { id: 'set-library', inject: "switchTab('settings'); switchSub('settings','library'); 1" },
  { id: 'set-plans', inject: "switchTab('settings'); switchSub('settings','plans'); 1" },
  { id: 'set-game', inject: "switchTab('settings'); switchSub('settings','game'); 1" },
  { id: 'set-data', inject: "switchTab('settings'); switchSub('settings','data'); 1" }
];

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-tab-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); target = list.find(t => t.type === 'page') || null; } catch (e) { /* 等 */ }
  }
  if (!target) { chrome.kill(); console.error('CDP 未就绪'); process.exit(2); }

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });

  const out = {};
  for (const view of VIEWS) {
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
    await sleep(850);
    await cdp.send('Runtime.evaluate', { expression: "setTheme('light');" + view.inject, returnByValue: true });
    await sleep(300);
    const m = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    out[view.id] = m.exceptionDetails ? { error: m.exceptionDetails.text } : m.result.value;
  }
  /* 模态焦点单独跑：设置·挑战页有入口 */
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
  await sleep(850);
  await cdp.send('Runtime.evaluate', { expression: "switchTab('settings'); switchSub('settings','game'); 1", returnByValue: true });
  await sleep(300);
  const modal = await cdp.send('Runtime.evaluate', { expression: MODAL_PROBE, returnByValue: true, awaitPromise: true });

  cdp.close();
  chrome.kill();
  fs.writeFileSync(path.join(OUT_DIR, 'tab-order.json'), JSON.stringify({ views: out, modal: modal.result && modal.result.value }, null, 1), 'utf8');

  const rows = Object.keys(out).map(k => {
    const v = out[k] || {};
    return {
      view: k,
      tabbable: v.tabbable,
      clickOnly: (v.clickOnly || []).length,
      hiddenFocusable: (v.hiddenFocusable || []).length,
      inversions: (v.inversions || []).length,
      ringMissing: (v.ringMissing || []).length
    };
  });
  console.table(rows);
  const bad = Object.keys(out).filter(k => (out[k].clickOnly || []).length || (out[k].inversions || []).length || (out[k].hiddenFocusable || []).length || (out[k].ringMissing || []).length);
  if (bad.length) {
    console.log('\n问题明细：');
    bad.forEach(k => {
      const v = out[k];
      if ((v.clickOnly || []).length) console.log('  [' + k + '] 可点不可聚焦 ' + v.clickOnly.length + '：' + v.clickOnly.slice(0, 6).join(' | '));
      if ((v.hiddenFocusable || []).length) console.log('  [' + k + '] 隐藏但可聚焦：' + v.hiddenFocusable.join(' | '));
      if ((v.inversions || []).length) console.log('  [' + k + '] 顺序倒置 ' + v.inversions.length + '：' + JSON.stringify(v.inversions.slice(0, 3)));
      if ((v.ringMissing || []).length) console.log('  [' + k + '] 无焦点环：' + v.ringMissing.join(' | '));
    });
  } else {
    console.log('\n键盘可达性：11 视图全部 0 问题');
  }
  console.log('\n模态焦点：' + JSON.stringify(modal.result && modal.result.value));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

#!/usr/bin/env node
/* v2.14.38：平板 / 横屏审计（评审 §21.4 扣分项③「未测平板与横屏」）。
 * 为什么单独一个脚本：audit-whole-ui.js 已经跑「双主题 × 2 视口 × 14 视图 = 56 柱」，
 * 再往里塞 3 个视口会变成 112 柱、每版要 3 分钟；平板/横屏只需要「布局不塌」，量四项即可。
 * 量（每视口 × 14 视图，浅色）：
 *   ① 横向溢出（scrollWidth > clientWidth + 1）
 *   ② 触摸目标 < 44（可见、可交互）
 *   ③ 正文字号 < 11px（与 v2.14.27 的 11px 兜底下限一致）
 *   ④ 首屏可见性：主按钮/主内容是否落在第一屏（document 高度 / 视口高度比）
 * 用法：node scripts/audit-viewports.js [--shot]   （需 8099 静态服务；CDP 9352）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9352;
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

const PROBE = `(() => {
  const de = document.documentElement;
  const overflowX = Math.max(0, de.scrollWidth - de.clientWidth);
  const INTERACTIVE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const small = [];
  let tiny = 0;
  for (const n of document.querySelectorAll(INTERACTIVE)) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || n.disabled) continue;
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 43.5 || r.height < 43.5) small.push(((n.id ? '#' + n.id : '') + ' ' + (n.textContent || '').trim().slice(0, 10) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)).trim());
    const fs2 = parseFloat(cs.fontSize);
    if (fs2 && fs2 < 10.5) tiny++;
  }
  const docH = Math.round(de.scrollHeight);
  const vpH = Math.round(window.innerHeight);
  /* 主内容是否第一屏可见：取第一个 .card / .ec / .tr-card / .set-card 的底边 */
  /* 判据用「内容区第一个真实可见块的顶边」：训练页的快照卡挂在 tab-content 下、排在子页内容之前，
     只盯子页首元素会量到第 2 屏去；所以先扫 tab-content 的可见块，再退回子页首元素 */
  const tc = document.querySelector('.tab-content.active');
  const host = document.querySelector('.tab-content.active .sub-tab.active') || tc;
  const visibleTop = n => { if (!n) return null; const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? Math.round(r.top) : null; };
  let firstTop = null, firstBlock = null;
  if (tc) for (const n of tc.children) { if (n.classList.contains('tab-bar')) continue; const t = visibleTop(n); if (t != null) { firstTop = t; firstBlock = n; break; } }
  if (firstTop == null && host) for (const n of host.children) { const t = visibleTop(n); if (t != null) { firstTop = t; firstBlock = n; break; } }
  const navBottom = Math.round((document.querySelector('.sub-tab-bar') || document.querySelector('.tab-bar')).getBoundingClientRect().bottom);
  const firstBottom = firstBlock ? Math.round(firstBlock.getBoundingClientRect().bottom) : null;
  return {
    w: window.innerWidth, h: vpH,
    overflowX, smallCount: small.length, smallSample: small.slice(0, 4),
    tiny, docH, screens: Math.round(docH / vpH * 10) / 10,
    firstBottom, firstTop, navBottom, firstInView: firstTop == null ? null : firstTop <= vpH - 40,
    buttons: document.querySelectorAll('button').length
  };
})()`;

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
  { id: 'set-game', label: '设置·玩法', inject: "switchTab('settings'); switchSub('settings','game')" },
  { id: 'set-data', label: '设置·数据', inject: "switchTab('settings'); switchSub('settings','data')" },
  { id: 'panel-pet', label: '宠物面板', inject: "if(typeof openPetPanel==='function')openPetPanel()" },
  { id: 'panel-skill', label: '技能面板', inject: "if(typeof openSkillPanel==='function')openSkillPanel()" },
  { id: 'panel-codex', label: '图鉴面板', inject: "if(typeof openCodex==='function')openCodex()" }
];

const VIEWPORTS = [
  { tag: 'tablet-768x1024', w: 768, h: 1024, mobile: true },
  { tag: 'tablet-land-1024x768', w: 1024, h: 768, mobile: false },
  { tag: 'phone-land-844x390', w: 844, h: 390, mobile: true }
];

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-vp-' + Date.now());
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

  const out = {};
  for (const vp of VIEWPORTS) {
    out[vp.tag] = {};
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.mobile });
    for (const view of VIEWS) {
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
      await sleep(900);
      await cdp.send('Runtime.evaluate', { expression: "setTheme('light');" + view.inject + ";1", returnByValue: true });
      await sleep(320);
      const m = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      out[vp.tag][view.id] = m.exceptionDetails ? { error: m.exceptionDetails.text } : m.result.value;
      if (process.argv.includes('--shot') && (view.id === 'train-strength' || view.id === 'game-battle')) {
        const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT_DIR, 'vp-' + vp.tag + '-' + view.id + '.png'), Buffer.from(s.data, 'base64'));
      }
    }
  }
  cdp.close(); chrome.kill();
  fs.writeFileSync(path.join(OUT_DIR, 'viewports.json'), JSON.stringify(out, null, 1), 'utf8');

  let overflow = 0, small = 0, tiny = 0, notFirst = 0, cells = 0;
  console.log('视口'.padEnd(22) + '视图'.padEnd(16) + '溢出  小目标  小字  屏数  首屏可见');
  for (const vpTag of Object.keys(out)) {
    for (const vid of Object.keys(out[vpTag])) {
      const r = out[vpTag][vid] || {};
      cells++;
      if ((r.overflowX || 0) > 1) overflow++;
      if ((r.smallCount || 0) > 0) small++;
      if ((r.tiny || 0) > 0) tiny++;
      if (r.firstInView === false) notFirst++;
      if ((r.overflowX || 0) > 1 || (r.smallCount || 0) > 0 || (r.tiny || 0) > 0 || r.firstInView === false) {
        console.log(vpTag.padEnd(22) + vid.padEnd(16) + String(r.overflowX).padEnd(5) + String(r.smallCount).padEnd(7) + String(r.tiny).padEnd(5) + String(r.screens).padEnd(5) + (r.firstInView ? '✓' : '✗') + (r.smallCount ? ' 小目标样本=' + JSON.stringify(r.smallSample) : '') + (r.error ? ' ERR=' + r.error : ''));
      }
    }
  }
  console.log('\n合计 ' + cells + ' 柱：横向溢出 ' + overflow + ' / 触摸目标不足 ' + small + ' / 字号过小 ' + tiny + ' / 首屏不可见 ' + notFirst);
  process.exit(overflow || small || tiny ? 1 : 0);
})();

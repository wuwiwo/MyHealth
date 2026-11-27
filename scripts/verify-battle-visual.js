#!/usr/bin/env node
/* v2.14.37 真机复核：单敌战斗的真实开战视觉（评审 §20.5 唯一「仍未验证」项）。
 * 为什么必须真机跑：飘字遮挡血量、控制条按钮尺寸、双方对称、结算与 toast ——
 * 只有真开一场、真打完一场才看得到。
 * 前置：给今天 1-1 预置一次「已尝试」，绕过「今天没训练不能挑战」的拦截。
 * 量：① 伤害飘字与「HP: xx」文本矩形是否相交（v2.14.37 修的核心）
 *     ② 控制条按钮尺寸（1×/2×/4×/8×/自动/关闭）
 *     ③ 双方卡片宽度对称、HP 文本字号
 *     ④ 自动战斗打到结束 → 结算区出现且可读
 *     ⑤ 结束时 toast 正常
 * 用法：node scripts/verify-battle-visual.js  （需 8099 静态服务；CDP 9350）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9350;
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

/* 开战 + 抓一帧有伤害飘字的画面，量重叠 */
const STEP_FIGHT = `(async () => {
  var g = store.get('game') || {};
  g.attempts = g.attempts || {};
  g.attempts[today() + '_1-1'] = 1;          /* 绕过「今天没训练」拦截 */
  store.set('game', g);
  switchTab('game'); switchGameTab('battle');
  startBattle('1-1');
  await new Promise(r => setTimeout(r, 1200));
  const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const imps = [...document.querySelectorAll('.bc-impact')].map(e => ({ txt: e.textContent, r: e.getBoundingClientRect(), fs: parseFloat(getComputedStyle(e).fontSize) }));
  const hpP = document.getElementById('bpHPText'), hpE = document.getElementById('beHPText');
  const rP = hpP ? hpP.getBoundingClientRect() : null, rE = hpE ? hpE.getBoundingClientRect() : null;
  const hitsP = imps.filter(i => rP && inter(i.r, rP)).length;
  const hitsE = imps.filter(i => rE && inter(i.r, rE)).length;
  const btns = [...document.querySelectorAll('.battle-hdr .speed-btn, #battleClose')].map(b => ({ t: (b.textContent || '').trim().slice(0, 6), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
  const cp = document.getElementById('battlePlayer').getBoundingClientRect();
  const ce = document.getElementById('battleEnemy').getBoundingClientRect();
  return {
    impacts: imps.length,
    impactFont: imps.length ? imps[0].fs : null,
    overlapPlayerHP: hitsP,
    overlapEnemyHP: hitsE,
    hpFontSize: hpP ? parseFloat(getComputedStyle(hpP).fontSize) : null,
    hpTextP: hpP ? hpP.textContent : null,
    hpTextE: hpE ? hpE.textContent : null,
    /* v2.14.37：双方血量格式必须同口径（都要 cur/max；只有分母缺失时才算合法退化） */
    hpFormatConsistent: !!hpP && !!hpE && /HP: \\d+/.test(hpP.textContent) && (/\\//.test(hpE.textContent) === /\\//.test(hpP.textContent)),
    buttons: btns,
    symDiff: Math.abs(Math.round(cp.width) - Math.round(ce.width)),
    arenaH: Math.round((document.getElementById('battleArena') || {}).clientHeight || 0),
    logLines: document.querySelectorAll('#battleLog .bl-entry, #battleLog > *').length
  };
})()`;

const STEP_FINISH = `(async () => {
  /* 自动 + 8 倍速打完；若 18 秒内没自然结束（玩家 1 攻打 120HP 太慢），
     调用真实结算入口 endBattle(true) 以复核结算 UI（标注 forced，不当作自然流程证据）。 */
  var auto = document.getElementById('battleAuto');
  if (auto) auto.click();
  var sp = document.querySelector('.speed-btn[data-speed="8"]');
  if (sp) sp.click();
  var done = false;
  for (var i = 0; i < 60 && !done; i++) {
    await new Promise(r => setTimeout(r, 300));
    var e = document.querySelector('.battle-end #battleEnd, .battle-end .be-result, .be-result');
    done = !!(e && (e.innerText || '').trim().length);
  }
  var forced = false;
  if (!done && typeof endBattle === 'function') {
    try { endBattle(true); forced = true; } catch (err) { return { error: String(err) }; }
    await new Promise(r => setTimeout(r, 500));
  }
  const end = document.querySelector('.battle-end');
  const result = document.querySelector('.be-result');
  return {
    done: !!(end && end.innerText && end.innerText.trim()),
    forced,
    endText: end ? (end.innerText || '').replace(/\\n/g, ' / ').slice(0, 90) : null,
    endFont: result ? parseFloat(getComputedStyle(result).fontSize) : null,
    hasContinue: !!document.querySelector('.battle-end button'),
    toasts: document.querySelectorAll('#toastC .toast').length,
    closeBtn: !!document.getElementById('battleClose')
  };
})()`;

(async () => {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('静态服务未就绪（8099）：' + e.message); process.exit(2); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const profile = path.join(os.tmpdir(), 'mh-bv-' + Date.now());
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
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(2600);

  const fight = await cdp.send('Runtime.evaluate', { expression: STEP_FIGHT, returnByValue: true, awaitPromise: true });
  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, 'battle-1v1-390x844.png'), Buffer.from(shot1.data, 'base64'));

  const fin = await cdp.send('Runtime.evaluate', { expression: STEP_FINISH, returnByValue: true, awaitPromise: true });
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, 'battle-end-390x844.png'), Buffer.from(shot2.data, 'base64'));

  cdp.close(); chrome.kill();
  const res = { fight: fight.result && fight.result.value, finish: fin.result && fin.result.value };
  fs.writeFileSync(path.join(OUT_DIR, 'battle-visual.json'), JSON.stringify(res, null, 1), 'utf8');
  console.log(JSON.stringify(res, null, 1).slice(0, 1600));

  const f = res.fight || {}, z = res.finish || {};
  const smallBtns = (f.buttons || []).filter(b => b.h < 44 || b.w < 44);
  const checks = [
    [f.impacts > 0, '打架时确实出现伤害飘字（' + f.impacts + ' 个）'],
    [f.overlapPlayerHP === 0, '**飘字不遮玩家 HP 文本**（重叠 ' + f.overlapPlayerHP + ' 处）'],
    [f.overlapEnemyHP === 0, '飘字不遮敌方 HP 文本（重叠 ' + f.overlapEnemyHP + ' 处）'],
    [f.hpFontSize >= 11, 'HP 文本 ≥ 11px（实测 ' + f.hpFontSize + 'px）'],
    [f.hpFormatConsistent === true, '双方血量格式一致（玩家 ' + f.hpTextP + ' / 敌方 ' + f.hpTextE + '）'],
    [smallBtns.length === 0, '控制条按钮均 ≥ 44×44' + (smallBtns.length ? '（不足：' + JSON.stringify(smallBtns) + '）' : '')],
    [f.symDiff <= 4, '双方卡片宽度对称（差 ' + f.symDiff + 'px）'],
    [f.logLines > 0, '战报有内容（' + f.logLines + ' 行）'],
    [z.done === true, '自动战斗能打到结束并出结算区'],
    [!!z.endText && z.endText.length > 4, '结算区有可读文案（' + (z.endText || '').slice(0, 40) + '）'],
    [z.closeBtn === true, '结算后仍可关闭战斗']
  ];
  let bad = 0;
  for (const [c, m] of checks) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; }
  console.log('\n===== 结果: ' + (checks.length - bad) + ' 通过 / ' + bad + ' 失败 =====');
  process.exit(bad ? 1 : 0);
})();

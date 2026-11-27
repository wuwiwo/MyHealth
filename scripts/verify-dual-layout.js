#!/usr/bin/env node
/* 阶段 E 真机布局校验（无头 Chrome + CDP，无第三方依赖）
   目的：在 360×640 / 390×844 两个真视口里，检查「多队双场景」两栏战场
   · 两栏并排、栏宽不为 0
   · 每个芯片都完整落在它自己的 .gb-arena 里（不被 overflow:hidden 裁掉）
   · 页面没有横向溢出
   · 控制条 + 两栏放在同一屏内（不把页签/操作按钮顶出屏幕）
   用法：node scripts/verify-dual-layout.js [--keep]
   前置：本地静态服务已把 page/ 暴露在 8099（脚本会自检，失败提示）。
   ⚠️ 不是 test-*.js：不进全量回归（依赖真实 Chrome），是阶段 E 的实机复核工具。 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8099;
const CDP_PORT = 9333;
const OUT_DIR = path.join(__dirname, '..', '_tmp-dual-verify');
const CHROME = process.env.MH_CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpJson(url) {
  const res = await fetch(url);
  return res.json();
}

/* ---- 最小 CDP 客户端（Node 22 自带全局 WebSocket） ---- */
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
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) {
          const w = waiters.splice(i, 1)[0]; w.resolve(msg.params); return;
        }
      }
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', e => rej(new Error('WebSocket 连接失败')));
  });
  return {
    ready,
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
      });
    },
    waitEvent(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const w = { method, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i > -1) { waiters.splice(i, 1); reject(new Error('等待事件超时: ' + method)); }
        }, timeoutMs || 15000);
      });
    },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

/* ---- 页面内注入：三支编队（A/B 首发 + 1 替补）、真走多队分支（关卡 id 可传参，默认 g18-5） ---- */
const STAGE_ID = process.argv[2] || 'g18-5';
const INJECT = `
(function(){
  /* 战场 overlay 挂在「挑战」页签里：先切到挑战页，否则祖先 display:none → 量出来全是 0 宽 */
  switchTab('game');
  window.getPetSquads = function(){
    return [
      {name:'一队', petIds:['p1','p2','p3','p4']},
      {name:'二队', petIds:['p5','p6','p7','p8']},
      {name:'三队', petIds:['p9']}
    ];
  };
  window.buildGroupBattlePets = function(ids){
    return (ids||[]).map(function(id, i){
      var u = createUnit({id:'pet-'+id, side:'ally', name:'宠'+id, level:1,
        base:{hp:120, atk:22, def:12, spd:12, soulAtk:0, soulDef:0}});
      u._petSpecies = 'sp-' + id;
      return u;
    });
  };
  startGroupTrial(${JSON.stringify(STAGE_ID)});
  return !!(window.__groupDualState && window.__groupDualState());
})()
`;

/* ---- 页面内量测 ---- */
const MEASURE = `
(function(){
  function rect(el){ var r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height, b:r.bottom, r:r.right}; }
  var out = { vp:[window.innerWidth, window.innerHeight], hasDual:!!document.getElementById('gbDual'), panes:[], chips:[], page:{}, ctrl:null, tabs:null, errors:[] };
  var dual = document.getElementById('gbDual');
  if (dual) {
    out.page.scrollW = document.documentElement.scrollWidth;
    out.page.scrollH = document.documentElement.scrollHeight;
    out.panes = Array.prototype.map.call(dual.querySelectorAll('.gb-dual-pane'), function(p){
      var arena = p.querySelector('.gb-arena');
      var ar = arena ? rect(arena) : null;
      var chips = Array.prototype.map.call(p.querySelectorAll('.gb-arena-unit'), function(c){
        var cr = rect(c);
        return { uid: c.getAttribute('data-uid'), x:cr.x, y:cr.y, w:cr.w, h:cr.h, b:cr.b, r:cr.r,
          outBottom: ar ? +(cr.b - ar.b).toFixed(1) : null,
          outRight: ar ? +(cr.r - ar.r).toFixed(1) : null,
          outLeft: ar ? +(ar.x - cr.x).toFixed(1) : null };
      });
      var d = p.querySelector('.gb-dual-hd');
      return {
        cls: p.className,
        w: +rect(p).w.toFixed(1), h: +rect(p).h.toFixed(1),
        hdText: d ? d.textContent.trim() : '',
        arena: ar ? {x:ar.x, y:ar.y, w:+ar.w.toFixed(1), h:+ar.h.toFixed(1), b:+ar.b.toFixed(1), r:+ar.r.toFixed(1)} : null,
        arenaScrollH: arena ? arena.scrollHeight : null,
        arenaClientH: arena ? arena.clientHeight : null,
        dense: arena ? arena.classList.contains('gb-arena-dense') : null,
        chips: chips
      };
    });
    var ctrl = document.querySelector('.gb-ctrl');
    out.ctrl = ctrl ? { title: (ctrl.querySelector('.gb-ctrl-title')||{}).textContent, b: +rect(ctrl).b.toFixed(1) } : null;
    var tabs = document.querySelector('.gb-tabs');
    out.tabs = tabs ? { b: +rect(tabs).b.toFixed(1), visible: tabs.getBoundingClientRect().height > 0 } : null;
  }
  return out;
})()
`;

(function main() {
  const results = [];
  let failed = 0;
  function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail });
    if (!cond) failed++;
    console.log((cond ? ' ✓ ' : ' ✗ ') + name + (detail !== undefined && !cond ? '  → ' + detail : ''));
  }

  (async () => {
    /* 静态服务自检 */
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/index.src.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
    catch (e) { console.error('静态服务未就绪（需要把 page/ 暴露在 ' + PORT + '）：' + e.message); process.exit(2); }

    if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME + '（可用 MH_CHROME 指定）'); process.exit(2); }
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const profile = path.join(os.tmpdir(), 'mh-cdp-' + Date.now());
    const chrome = spawn(CHROME, [
      '--headless=new', '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', '--hide-scrollbars', 'about:blank'
    ], { stdio: 'ignore' });

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

    for (const vp of [{ w: 360, h: 640, tag: '360x640' }, { w: 390, h: 844, tag: '390x844' }]) {
      console.log('\n[视口 ' + vp.tag + ']');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      const loaded = cdp.waitEvent('Page.loadEventFired', 20000);
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.src.html' });
      await loaded;
      await sleep(600);   // 让 app.js 的首屏初始化跑完

      const injected = await cdp.send('Runtime.evaluate', { expression: INJECT, awaitPromise: true, returnByValue: true });
      if (injected.exceptionDetails) { check('开战注入成功', false, injected.exceptionDetails.text); continue; }
      check('开战成功、导演已建立', injected.result && injected.result.value === true, injected.result && injected.result.value);
      await sleep(400);

      const m = (await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result.value;
      check('双栏容器存在', m.hasDual, JSON.stringify(m.page));
      if (!m.hasDual) continue;
      check('两栏并排（各栏宽度 > 100px）', m.panes.length === 2 && m.panes.every(p => p.w > 100), JSON.stringify(m.panes.map(p => p.w)));
      check('两栏在同一行（top 相同）', Math.abs(m.panes[0].arena.y - m.panes[1].arena.y) <= 2, m.panes.map(p => p.arena && p.arena.y).join('/'));
      check('页面无横向溢出', m.page.scrollW <= vp.w + 1, 'scrollW=' + m.page.scrollW + ' vp=' + vp.w);

      m.panes.forEach((p, i) => {
        const key = '场景' + (i === 0 ? 'A' : 'B');
        check(key + ' 栏头有队名与状态', /场景/.test(p.hdText) && p.hdText.length > 3, p.hdText);
        const worst = p.chips.reduce((a, c) => Math.min(a, -(c.outBottom || 0), -(c.outRight || 0), -(c.outLeft || 0)), 0);
        check(key + ' 芯片都完整落在广场内（无裁切）', worst >= -1, '越界 ' + Math.round(-worst) + 'px · ' + p.chips.filter(c => c.outBottom > 1 || c.outRight > 1 || c.outLeft > 1).map(c => c.uid).join(','));
        check(key + ' 广场无纵向滚动残留', p.arenaScrollH === null || p.arenaScrollH <= p.arenaClientH + 1, p.arenaScrollH + '/' + p.arenaClientH);
        console.log('    ' + key + ' 芯片 ' + p.chips.length + ' 个，栏宽 ' + p.w + 'px，dense=' + p.dense);
      });

      check('两栏之后仍能看到页签', !!m.tabs && m.tabs.visible && m.tabs.b <= vp.h + 1, m.tabs && ('tabs.b=' + m.tabs.b + '/' + vp.h));

      /* 截图（真机证据） */
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT_DIR, 'dual-' + vp.tag + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log('    📷 ' + file);

      /* 推 12 拍，验证推进中两栏重绘不炸 */
      const steps = await cdp.send('Runtime.evaluate', {
        expression: '(function(){ var d=window.__groupDualState(); var n=0,err=""; try{ while(n<12 && !d.done){ _groupStep(); n++; } }catch(e){ err=String(e); } return {n:n, err:err, active:d.active, cycle:d.cycle, a:document.querySelectorAll(\'[data-uid]\').length}; })()',
        returnByValue: true
      });
      const s = steps.result.value;
      check('推 12 拍无异常', s.err === '', s.err);
      check('推进后场景键合法', s.active === 'A' || s.active === 'B', s.active);
      console.log('    steps=' + s.n + ' active=' + s.active + ' cycle=' + s.cycle + ' 芯片节点数=' + s.a);

      const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file2 = path.join(OUT_DIR, 'dual-' + vp.tag + '-midfight.png');
      fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
      console.log('    📷 ' + file2);
    }

    cdp.close();
    chrome.kill();
    console.log('\n' + (failed === 0 ? '✅ 布局校验全部通过' : '❌ 失败 ' + failed + ' 项') + '（' + results.length + ' 项检查，截图目录 ' + OUT_DIR + '）');
    process.exit(failed ? 1 : 0);
  })().catch(e => { console.error('未捕获异常:', e); try { chrome.kill(); } catch (_) { /* 忽略 */ } process.exit(2); });
})();

/* ============================================
   MyHealth — Debug 面板（v2.0.11）
   全局调试抽屉：所有 tab 可用的 🔍 FAB + 底部抽屉
   分区：概览 / 存储 / 属性·经济 / 挑战 / 错误
   挑战页内嵌诊断开关 → window.__debugChallenge
   （challenge.js chDebugBlock 读此标志）
   ============================================ */
(function () {
  if (window.DebugPanel) return;

  /* --- 错误捕获（模块加载即装，先于面板打开） --- */
  var errs = [];
  window.addEventListener('error', function (e) {
    errs.unshift((e.message || 'unknown') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '?'));
    if (errs.length > 30) errs.pop();
  });
  window.addEventListener('unhandledrejection', function (e) {
    errs.unshift('Promise: ' + ((e.reason && e.reason.message) || e.reason || 'unknown'));
    if (errs.length > 30) errs.pop();
  });

  var SECS = [['ov', '概览'], ['st', '存储'], ['at', '属性·经济'], ['ch', '挑战'], ['er', '错误' + (errs.length ? ' (' + errs.length + ')' : '')]];
  var state = { open: false, sec: 'ov', openKey: null };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function j(o) { try { return JSON.stringify(o, null, 1); } catch (e) { return String(o); } }
  function tryFn(f, dflt) { try { return f(); } catch (e) { return dflt != null ? dflt : '⚠ ' + e.message; } }
  function bytes(n) { return n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }

  /* --- 各分区 --- */
  function secOv() {
    var ls = window.localStorage || {};
    var total = 0, keys = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); keys.push(k); total += (k.length + String(ls.getItem(k)).length) * 2; }
    var dhKeys = keys.filter(function (k) { return k.indexOf('dh-') === 0; });
    var tab = tryFn(function () {
      var b = document.querySelector('.tab-btn.active[data-tab]');
      return b ? (b.textContent.trim() + ' (' + b.dataset.tab + ')') : '—';
    }, '—');
    var period = tryFn(function () { return typeof getCurrentPeriod === 'function' ? j(getCurrentPeriod(new Date())) : null; }, null);
    var L = [
      'APP_VERSION: ' + (window.APP_VERSION || tryFn(function () { return APP_VERSION; }, '?')),
      'today: ' + tryFn(function () { return today(); }, '?'),
      'monthKey: ' + tryFn(function () { return monthKey(new Date()); }, '?'),
      'weekKey: ' + tryFn(function () { return monthKey(new Date()) + '-W' + Math.ceil(new Date().getDate() / 7); }, '?'),
      '当前 tab: ' + tab,
      '存储: ' + keys.length + ' 键（dh- 业务键 ' + dhKeys.length + '）· 共 ' + bytes(total),
      'JS 错误: ' + errs.length + ' 条'
    ];
    if (period) L.push('旬: ' + period);
    return pre(L.join('\n'));
  }

  function lsKeys() {
    var ls = window.localStorage || {}, out = [];
    for (var i = 0; i < ls.length; i++) out.push(ls.key(i));
    return out.sort();
  }
  function secSt() {
    var ls = window.localStorage || {};
    var rows = lsKeys().map(function (k) {
      var v = String(ls.getItem(k) || '');
      var sz = (k.length + v.length) * 2;
      var open = state.openKey === k;
      var h = '<div style="margin:2px 0"><b style="color:#7dd3fc">' + esc(k) + '</b> <span style="color:#64748b">' + bytes(sz) + '</span> '
        + '<span style="color:#94a3b8;cursor:pointer;text-decoration:underline" onclick="DebugPanel.viewKey(\'' + esc(k) + '\')">' + (open ? '收起' : '展开') + '</span> '
        + '<span style="color:#94a3b8;cursor:pointer;text-decoration:underline" onclick="DebugPanel.copyKey(\'' + esc(k) + '\')">复制</span></div>';
      if (open) h += pre(j(tryFn(function () { return JSON.parse(v); }, v.slice(0, 2000))));
      return h;
    });
    return rows.join('') || '<i>localStorage 为空</i>';
  }

  function secAt() {
    var s = tryFn(function () { return getSkillState(); }, null);
    var L = [];
    L.push('今日容量: ' + tryFn(function () { return getTodayVolume(); }, '?') + ' kg');
    if (typeof sumEffectiveDuration === 'function') L.push('本周有效时长: ' + tryFn(function () { return sumEffectiveDuration(); }, '?'));
    if (s) {
      L.push('技能点: ' + s.points + '（历史 ' + s.totalEarned + '）· 本周胜局 ' + (s.winCountThisWeek || 0) + ' · 周键 ' + s.weekKey);
      L.push('槽位: ' + s.slotsUnlocked + ' · loadout ' + j(s.loadout));
      var lv = []; for (var k in s.levels) if (s.levels[k]) lv.push(k + '=' + s.levels[k]);
      L.push('等级: ' + (lv.join(' ') || '（无）'));
      if (typeof earnSkillPoints === 'function') {
        var sim = [];
        for (var w = 1; w <= 6; w++) sim.push('胜' + w + '→+' + earnSkillPoints(10, w));
        L.push('发点预演(敌群): ' + sim.join(' '));
      }
    } else { L.push('技能系统: 未初始化'); }
    return pre(L.join('\n'));
  }

  function secCh() {
    var on = !!window.__debugChallenge;
    var h = '<div style="margin-bottom:6px">挑战页内嵌诊断块: <b style="color:' + (on ? '#4ade80' : '#64748b') + ';cursor:pointer;text-decoration:underline" onclick="DebugPanel.toggleInline()">' + (on ? 'ON（召唤面板各分支显示红框明细）' : 'OFF') + '</b></div>';
    var L = [];
    L.push('challenge 存档: ' + pre(j(tryFn(function () { return getChallenge(); }, '未初始化'))));
    L.push('canSummon: ' + pre(j(tryFn(function () { return canSummon(); }, '未初始化'))));
    L.push('今日容量: ' + tryFn(function () { return getTodayVolume(); }, '?') + '（召唤门槛 100kg/次）');
    return h + L.join('');
  }

  function secEr() {
    if (!errs.length) return '<i>暂无捕获的 JS 错误 ✅</i>';
    return pre(errs.join('\n'));
  }

  function pre(t) { return '<pre style="margin:4px 0;padding:8px;background:#1a1a1a;border:1px dashed #475569;border-radius:8px;font-size:.62rem;color:#94a3b8;line-height:1.6;white-space:pre-wrap;word-break:break-all;font-family:inherit">' + esc(t) + '</pre>'; }

  /* --- 面板 DOM --- */
  var fab = null, drawer = null;
  function build() {
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'debugFab'; fab.className = 'debug-fab'; fab.title = 'debug'; fab.textContent = '🔍';
    fab.addEventListener('click', function () { state.open ? close() : open(); });
    document.body.appendChild(fab);
    drawer = document.createElement('div');
    drawer.id = 'debugDrawer';
    document.body.appendChild(drawer);
  }

  function render() {
    if (!drawer) return;
    if (!state.open) { drawer.style.display = 'none'; return; }
    var tabs = SECS.map(function (s) {
      var act = state.sec === s[0];
      return '<span data-dsec="' + s[0] + '" style="padding:4px 10px;border-radius:12px;font-size:.68rem;cursor:pointer;background:' + (act ? '#334155' : 'transparent') + ';color:' + (act ? '#f1f5f9' : '#94a3b8') + '">' + s[1] + '</span>';
    }).join('');
    var body = state.sec === 'ov' ? secOv() : state.sec === 'st' ? secSt() : state.sec === 'at' ? secAt() : state.sec === 'ch' ? secCh() : secEr();
    drawer.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99" data-dclose="1"></div>'
      + '<div style="position:fixed;left:0;right:0;bottom:0;z-index:100;max-height:70%;overflow-y:auto;background:var(--bg2,#111);border-top:1px solid var(--bd,#333);border-radius:16px 16px 0 0;padding:12px 12px calc(16px + env(safe-area-inset-bottom,0))">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<b style="font-size:.78rem;color:#f1f5f9">🐞 Debug 面板</b>'
      + '<span data-dclose="1" style="color:#94a3b8;cursor:pointer;font-size:1rem">✕</span></div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">' + tabs + '</div>'
      + '<div style="font-size:.7rem">' + body + '</div>'
      + '</div>';
    drawer.style.display = 'block';
    drawer.querySelectorAll('[data-dsec]').forEach(function (el) {
      el.addEventListener('click', function () { state.sec = el.dataset.dsec; render(); });
    });
    drawer.querySelectorAll('[data-dclose]').forEach(function (el) {
      el.addEventListener('click', close);
    });
  }

  function open() { build(); state.open = true; fab.classList.add('on'); render(); }
  function close() { state.open = false; if (fab) fab.classList.remove('on'); render(); }

  /* --- 对外 API --- */
  window.DebugPanel = {
    open: function (sec) { if (sec) state.sec = sec; open(); },
    close: close,
    refresh: function () { SECS[4][1] = '错误' + (errs.length ? ' (' + errs.length + ')' : ''); if (state.open) render(); },
    viewKey: function (k) { state.openKey = state.openKey === k ? null : k; render(); },
    copyKey: function (k) {
      var v = String((window.localStorage || {}).getItem(k) || '');
      var done = function () { if (window.toast) toast('已复制 ' + k + '（' + bytes(v.length * 2) + '）', 's'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { fallback(); });
      else fallback();
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = v; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { if (window.toast) toast('复制失败，请用展开+长按', 'e'); }
        document.body.removeChild(ta);
      }
    },
    toggleInline: function () {
      window.__debugChallenge = !window.__debugChallenge;
      tryFn(function () { renderSummonPanel(); }, null);
      render();
    },
    errors: errs
  };

  build();
})();

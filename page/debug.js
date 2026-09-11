/* ============================================
   MyHealth — Debug 面板（v2.1.1）
   全局调试抽屉：所有 tab 可用的 🔍 FAB + 底部抽屉
   分区：概览 / 存储 / 属性·经济 / 挑战 / 错误
   样式复用设计体系组件 .modal-overlay / .modal-sheet（主题+a11y 一致）
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

  var SECS = [['ov', '概览'], ['st', '存储'], ['at', '属性·经济'], ['ch', '挑战'], ['er', '错误']];
  var state = { open: false, sec: 'ov', openKey: null };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* 非 JSON 值原样打印即可，不是错误 */
  function j(o) { try { return JSON.stringify(o, null, 1); } catch (e) { return String(o); /* 忽略 */ } }
  /* 异常本身就是要展示的诊断信息，转成 ⚠ 文本返回 */
  function tryFn(f, dflt) { try { return f(); } catch (e) { return dflt != null ? dflt : '⚠ ' + e.message; /* 忽略：已作为返回值展示 */ } }
  function bytes(n) { return n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }

  /* --- 通用样式片段（全部走设计令牌，明暗主题自适应） --- */
  var PRE = 'margin:4px 0;padding:8px;background:var(--surface-2);border:1px dashed var(--bd);border-radius:var(--rad-sm);font-size:var(--fs-3xs);color:var(--text2);line-height:1.6;white-space:pre-wrap;word-break:break-all;font-family:inherit';
  var LINK = 'color:var(--text3);text-decoration:underline;cursor:pointer;padding:8px 6px;min-height:var(--touch-min);display:inline-flex;align-items:center';
  var TAB = 'min-height:var(--touch-min);padding:6px 12px;border-radius:var(--rad-full);font-size:var(--fs-2xs);cursor:pointer;border:1px solid transparent;font-family:inherit;background:transparent';
  function pre(t) { return '<pre style="' + PRE + '">' + esc(t) + '</pre>'; }

  /* --- 各分区 --- */
  function secOv() {
    var ls = window.localStorage || {};
    var total = 0, keys = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); keys.push(k); total += (k.length + String(ls.getItem(k)).length) * 2; }
    var dhKeys = keys.filter(function (kk) { return kk.indexOf('dh-') === 0; });
    var tab = tryFn(function () {
      var b = document.querySelector('.tab-btn.active[data-tab]');
      return b ? (b.textContent.trim() + ' (' + b.dataset.tab + ')') : '—';
    }, '—');
    var period = tryFn(function () { return j(getCurrentPeriod(new Date())); }, null);
    var L = [
      'APP_VERSION: ' + (window.APP_VERSION || tryFn(function () { return APP_VERSION; }, '?')),
      'today: ' + tryFn(function () { return today(); }, '?'),
      'monthKey: ' + tryFn(function () { return monthKey(new Date()); }, '?'),
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
      var h = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:2px 0">'
        + '<b style="color:var(--blue);font-size:var(--fs-2xs);flex:1;min-width:40%;word-break:break-all">' + esc(k) + '</b>'
        + '<span style="color:var(--text3);font-size:var(--fs-3xs)">' + bytes(sz) + '</span>'
        + '<span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.viewKey(\'' + esc(k) + '\')">' + (open ? '收起' : '展开') + '</span>'
        + '<span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.copyKey(\'' + esc(k) + '\')">复制</span></div>';
      if (open) h += pre(j(tryFn(function () { return JSON.parse(v); }, v.slice(0, 2000))));
      return h;
    });
    return '<div style="display:flex;justify-content:flex-end"><span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.copyAll()">复制全部键值</span></div>'
      + (rows.join('') || '<i>localStorage 为空</i>');
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
    var btn = 'role="button" tabindex="0" aria-pressed="' + (on ? 'true' : 'false') + '" style="color:' + (on ? 'var(--green)' : 'var(--text3)') + ';text-decoration:underline;cursor:pointer;min-height:var(--touch-min);display:inline-flex;align-items:center"';
    var h = '<div style="font-size:var(--fs-2xs);color:var(--text2);margin-bottom:4px">挑战页内嵌诊断块: <span ' + btn + ' onclick="DebugPanel.toggleInline()">' + (on ? 'ON（召唤面板各分支显示红框明细）' : 'OFF') + '</span></div>';
    h += 'challenge 存档: ' + pre(j(tryFn(function () { return getChallenge(); }, '未初始化')));
    h += 'canSummon: ' + pre(j(tryFn(function () { return canSummon(); }, '未初始化')));
    h += '今日容量: ' + pre(tryFn(function () { return getTodayVolume(); }, '?') + '（召唤门槛 100kg/次）');
    return h;
  }

  function secEr() {
    var head = errs.length
      ? '<div style="display:flex;justify-content:flex-end"><span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.clearErrors()">清空</span></div>'
      : '';
    return head + (errs.length ? pre(errs.join('\n')) : '<i style="color:var(--green)">暂无捕获的 JS 错误 ✅</i>');
  }

  /* --- 面板 DOM --- */
  var fab = null, drawer = null;
  function build() {
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'debugFab'; fab.className = 'debug-fab'; fab.type = 'button';
    fab.title = 'debug'; fab.textContent = '🔍';
    fab.setAttribute('aria-label', '调试面板'); fab.setAttribute('aria-expanded', 'false');
    fab.addEventListener('click', function () { state.open ? close() : open(); });
    document.body.appendChild(fab);
    drawer = document.createElement('div');
    drawer.id = 'debugDrawer'; drawer.className = 'modal-overlay';
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'debugTitle');
    document.body.appendChild(drawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) close();
    });
  }

  function render() {
    if (!drawer) return;
    if (!state.open) { drawer.className = 'modal-overlay'; return; }
    var tabs = SECS.map(function (s) {
      var act = state.sec === s[0];
      return '<span role="tab" tabindex="0" data-dsec="' + s[0] + '" aria-selected="' + (act ? 'true' : 'false') + '" style="' + TAB
        + (act ? ';background:var(--surface-3);color:var(--text);font-weight:700' : ';color:var(--text3)') + '">'
        + s[1] + (s[0] === 'er' && errs.length ? ' (' + errs.length + ')' : '') + '</span>';
    }).join('');
    var body = state.sec === 'ov' ? secOv() : state.sec === 'st' ? secSt() : state.sec === 'at' ? secAt() : state.sec === 'ch' ? secCh() : secEr();
    drawer.innerHTML =
      '<div class="modal-sheet">'
      + '<div class="modal-handle"></div>'
      + '<div class="modal-title" id="debugTitle">🐞 Debug 面板</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px" role="tablist" aria-label="调试分区">' + tabs + '</div>'
      + '<div style="font-size:var(--fs-2xs);color:var(--text2)">' + body + '</div>'
      + '<div class="modal-actions"><button type="button" onclick="DebugPanel.close()">关闭</button></div>'
      + '</div>';
    drawer.className = 'modal-overlay open';
    drawer.querySelectorAll('[data-dsec]').forEach(function (el) {
      el.addEventListener('click', function () { state.sec = el.dataset.dsec; render(); });
    });
    var overlay = drawer;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function open(sec) {
    build();
    if (sec) state.sec = sec;
    state.open = true;
    fab.setAttribute('aria-expanded', 'true');
    render();
    var btn = drawer.querySelector('.modal-actions button');
    if (btn) btn.focus();
  }
  function close() {
    state.open = false;
    if (fab) { fab.setAttribute('aria-expanded', 'false'); fab.focus(); }
    render();
  }

  /* --- 对外 API --- */
  window.DebugPanel = {
    open: open,
    close: close,
    refresh: function () { if (state.open) render(); },
    clearErrors: function () { errs.length = 0; render(); },
    viewKey: function (k) { state.openKey = state.openKey === k ? null : k; render(); },
    copyKey: function (k) {
      var v = String((window.localStorage || {}).getItem(k) || '');
      var done = function () { if (window.toast) toast('已复制 ' + k + '（' + bytes(v.length * 2) + '）', 's'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = v; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { console.warn('[debug] 复制失败', e); if (window.toast) toast('复制失败，请用展开+长按', 'e'); }
        document.body.removeChild(ta);
      }
    },
    copyAll: function () {
      var ls = window.localStorage || {}, out = {};
      for (var i = 0; i < ls.length; i++) out[ls.key(i)] = ls.getItem(ls.key(i));
      var txt = j(out);
      if (window.toast) toast('已复制 ' + ls.length + ' 个键（' + bytes(txt.length * 2) + '）', 's');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(function (e) { console.warn('[debug] 剪贴板不可用', e); });
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

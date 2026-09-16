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

  var SECS = [['ov', '概览'], ['st', '存储'], ['at', '属性·经济'], ['ba', '⚖️ 平衡'], ['ch', '挑战'], ['sy', '☁️ 同步'], ['pf', '⏱ 性能'], ['er', '错误']];
  var state = { open: false, sec: 'ov', openKey: null, bal: null };

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

  /* --- ⚖️ 战斗平衡体检（v2.1.8） ---
     玩家属性由真实训练数据驱动、无上界；敌人是写死的绝对曲线。
     本区把两者放到同一张表里：属性来源拆解 + 全 120 关敌人上限 + 逐大关实战模拟。 */
  function balPlayerStats() {
    return tryFn(function () { return getGameStats(); }, null);
  }
  function balEnemyCaps() {
    var max = { atk: 0, def: 0, hp: 0 };
    try {
      Object.keys(GROUP_LEVELS).forEach(function (gk) {
        (GROUP_LEVELS[gk].stages || []).forEach(function (st) {
          (st.enemies || []).forEach(function (e) {
            var b = e.base || {};
            if (b.atk > max.atk) max.atk = b.atk;
            if (b.def > max.def) max.def = b.def;
            if (b.hp > max.hp) max.hp = b.hp;
          });
        });
      });
    } catch (e) { /* 忽略：关卡模块未加载时上限保持 0，面板照样出 */ }
    return max;
  }
  function balSources(s) {
    var L = [];
    L.push(tryFn(function () {
      var now = new Date();
      var ms = toDate(new Date(now.getFullYear(), now.getMonth(), 1));
      var strE = ((store.get('strength') || { entries: [] }).entries || []).filter(function (e) { return e.date >= ms; });
      var carE = ((store.get('cardio') || { entries: [] }).entries || []).filter(function (e) { return e.date >= ms; });
      var v = sumVolume(strE, getExerciseMap()), d = sumDuration(carE), f = sumEffectiveDuration(carE, getCardioTypeMap());
      return '本月训练: 容量 ' + Math.round(v) + 'kg → 攻 +' + (10 + Math.floor(v / 20)) + '、血 +' + Math.floor(v / 10)
        + ' ｜ 有氧 ' + d + 'min → 防 +' + (10 + Math.floor(f / 15)) + '、血 +' + Math.floor(d / 3);
    }, '本月训练: ⚠ 读取失败'));
    L.push(tryFn(function () {
      var r = getRefine();
      if (!r || !r.unlocked) return '炼魂: 未解锁';
      var rb = calculateRefineBonus(r.upgrades);
      return '炼魂: 点数 ' + (r.points || 0) + ' → 攻 +' + Math.floor(rb.atk) + '、防 +' + Math.floor(rb.def)
        + '、血 +' + Math.floor(rb.hp) + '、魂攻 +' + Math.floor(rb.soulAtk) + '、魂防 +' + Math.floor(rb.soulDef);
    }, '炼魂: ⚠ 读取失败'));
    L.push(tryFn(function () {
      var p = (typeof getBattleReadyPets === 'function') ? getBattleReadyPets() : [];
      return '可战宠物: ' + p.length + ' 只' + (p.length ? '（' + p.slice(0, 3).map(function (x) { return x.name || x.speciesId; }).join('、') + '）' : '');
    }, '宠物: ⚠ 读取失败'));
    L.push(tryFn(function () {
      var st = groupProgressStats();
      return '敌群进度: ' + st.cleared + '/' + st.total + ' 已通关';
    }, '进度: ⚠ 读取失败'));
    if (s) {
      L.push('最终属性: 攻 ' + s.atk + ' · 防 ' + s.def + ' · 血 ' + s.hp + ' · 魂攻 ' + (s.soulAtk || 0) + ' · 魂防 ' + (s.soulDef || 0));
      L.push(tryFn(function () {
        var ig = inheritGroupStats(s);
        return '敌群参战属性（继承 ' + Math.round((typeof GROUP_INHERIT !== 'undefined' ? GROUP_INHERIT : 0) * 100) + '%）: '
          + '攻 ' + ig.atk + ' · 防 ' + ig.def + ' · 血 ' + ig.hp + ' · 魂攻 ' + ig.soulAtk + ' · 魂防 ' + ig.soulDef;
      }, '敌群参战属性: ⚠ 读取失败'));
    }
    return L.join('\n');
  }
  function balDiag(s) {
    if (!s) return '（属性未初始化）';
    var c = balEnemyCaps(), L = [];
    // v2.1.12：敌群是独立属性空间，诊断必须用「继承后」的属性，不能用裸属性
    // （此前用 s.atk/s.def/s.hp 算，与实战差 1/0.6 倍，结论完全失真）
    var gs = (typeof inheritGroupStats === 'function') ? inheritGroupStats(s) : s;
    L.push('全 ' + (Object.keys(GROUP_LEVELS).length * 10) + ' 关敌人上限: 攻 ' + c.atk + ' · 防 ' + c.def + ' · 血 ' + c.hp);
    var pDmg = Math.max(1, gs.atk - Math.floor(c.def / 2));
    L.push('你（敌群 ' + gs.atk + ' 攻）打最硬敌人: 单次 ≈ ' + pDmg + ' → 约 ' + Math.ceil(c.hp / pDmg) + ' 下');
    var eDmg = Math.max(1, c.atk - Math.floor(gs.def / 2));
    L.push('最硬敌人打你（敌群 ' + gs.def + ' 防）: 单次 ≈ ' + eDmg + ' → 约 ' + Math.ceil(gs.hp / eDmg) + ' 下才倒');
    if (eDmg <= 1) L.push('⚠️ 你敌群防御/2 = ' + Math.floor(gs.def / 2) + ' ≥ 敌人最高攻击 ' + c.atk + ' → 伤害被 max(1,…) 兜底，敌人永远只打 1 点');
    else if (gs.hp / eDmg > 40) L.push('⚠️ 敌人要 ' + Math.ceil(gs.hp / eDmg) + ' 下才能打倒你，战斗已无张力');
    // v2.1.10 已把魂攻/魂防接入敌群，这条警告不再适用
    if ((gs.soulAtk || 0) > 0) L.push('魂攻 ' + gs.soulAtk + ' / 魂防 ' + gs.soulDef + '（v2.1.10 起敌群已生效，每次攻击附带魂伤）');
    return L.join('\n');
  }
  /* 用真实战斗引擎模拟（纯逻辑，不碰存档） */
  function balSim(trials) {
    trials = trials || 5;
    var s = balPlayerStats();
    if (!s) return null;
    var base = { hp: s.hp, atk: s.atk, def: s.def, spd: 10, soulAtk: s.soulAtk || 0, soulDef: s.soulDef || 0 };
    var petUnits = [];
    try {
      var petIds = (typeof _petBattlePicks !== 'undefined' && _petBattlePicks && _petBattlePicks.length) ? _petBattlePicks
        : (typeof autoPickPets === 'function' ? autoPickPets(2) : []);
      if (typeof createPetUnitsForBattle === 'function') petUnits = createPetUnitsForBattle(petIds, 2) || [];
      // v2.1.10：宠物在敌群里会按稀有度放大，体检要一起算进去
      if (typeof boostPetForGroup === 'function') petUnits.forEach(boostPetForGroup);
    } catch (e) { petUnits = []; console.warn('[debug] 体检未能构建宠物，按 0 宠模拟', e); }
    // v2.1.10：玩家在敌群里只继承一定比例，用继承后的属性模拟
    var gBase = (typeof inheritGroupStats === 'function') ? inheritGroupStats(base) : base;
    var out = [];
    Object.keys(GROUP_LEVELS).forEach(function (gk) {
      var st = (GROUP_LEVELS[gk].stages || [])[9];   // 每大关第 10 关 = Boss 关
      if (!st) return;
      var w = 0, ts = 0, hpSum = 0, lastCfg = null;
      for (var i = 0; i < trials; i++) {
        try {
          var allies = [createUnit({ id: 'p', side: 'ally', name: '你', base: Object.assign({}, gBase) })]
            .concat(petUnits.map(function (u, k) { return u.clone ? u.clone() : u; }));
          // v2.1.12：与实战一致 —— 锚定默认关闭（GROUP_ANCHOR.enabled=false），
          // 此前这里无条件调用 anchorStageEnemies，导致体检结果比实战强 ~25%，
          // 出现「模拟 g5~g12 全 0% 但实际已全通关」的矛盾报告
          var cfg = (typeof groupStageEnemies === 'function') ? groupStageEnemies(gk, st, allies) : (st.enemies || []);
          lastCfg = cfg;
          var foes = cfg.map(function (ec, j) {
            return createEnemyUnit({ id: 'e' + j, tier: ec.tier, name: ec.name, talents: ec.talents, skills: ec.skills, base: ec.base, level: ec.level });
          });
          var gb = createGroupBattle({ allies: allies, enemies: foes });
          var t = 0;
          while (!gb.done && t < 300) { groupBattleStep(gb); t++; }
          var tot = allies.reduce(function (a, u) { return a + (u.base.hp || 0); }, 0);
          var lft = allies.reduce(function (a, u) { return a + Math.max(0, u.hp || 0); }, 0);
          if (gb.winner === 'ally') { w++; ts += t; hpSum += tot ? lft / tot * 100 : 0; }
        } catch (e) { /* 忽略：单场异常不阻断整体体检，该场按失败计 */ }
      }
      var n = (lastCfg || st.enemies || []).length;
      var totAtk = 0, totHp = 0;
      (lastCfg || []).forEach(function (c) { totAtk += (c.base && c.base.atk) || 0; totHp += (c.base && c.base.hp) || 0; });
      out.push({
        g: gk, n: n,
        atk: totAtk,
        hp: totHp,
        win: Math.round(w / trials * 100),
        turn: w ? (ts / w).toFixed(1) : '—',
        left: w ? Math.round(hpSum / w) : 0
      });
    });
    return { pets: petUnits.length, rows: out };
  }
  function secBa() {
    var s = balPlayerStats();
    var h = pre(balSources(s) + '\n\n' + balDiag(s));
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'
      + '<span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.runBalance()">▶ 跑体检（12 大关 Boss 各 5 场）</span>'
      + '<span role="button" tabindex="0" style="' + LINK + '" onclick="DebugPanel.copyBalance()">复制报告</span></div>';
    if (state.bal && state.bal.rows) {
      var rows = state.bal.rows.map(function (r) {
        var verdict = r.win === 100 && r.left >= 90 ? '碾压' : r.win >= 80 ? '偏易' : r.win >= 40 ? '有张力' : r.win > 0 ? '偏难' : '打不过';
        return r.g + ' 敌' + r.n + ' 总攻' + r.atk + ' 总血' + r.hp + '  胜' + r.win + '%  ' + r.turn + ' 步  剩血' + r.left + '%  ' + verdict;
      }).join('\n');
      h += '<div style="font-size:var(--fs-3xs);color:var(--text3);margin-top:2px">带 ' + state.bal.pets + ' 只宠物 · 敌群参战属性已按继承 ' + Math.round((typeof GROUP_INHERIT !== 'undefined' ? GROUP_INHERIT : 1) * 100) + '% 计算 · 宠物已按稀有度放大 · 锚定' + (typeof GROUP_ANCHOR !== 'undefined' && GROUP_ANCHOR.enabled ? '开' : '关') + '</div>';
      h += pre(rows);
    }
    return h;
  }
  /* 一键复制的纯文本报告（供开发/AI 分析） */
  function balReport() {
    var s = balPlayerStats(), L = [];
    L.push('APP_VERSION: ' + (window.APP_VERSION || '?'));
    L.push('[属性] ' + (s ? ('攻' + s.atk + ' 防' + s.def + ' 血' + s.hp + ' 魂攻' + (s.soulAtk || 0) + ' 魂防' + (s.soulDef || 0)) : '未初始化'));
    L.push('[来源]\n' + balSources(s));
    L.push('[诊断]\n' + balDiag(s));
    if (state.bal && state.bal.rows) {
      L.push('[模拟] 带' + state.bal.pets + '宠 · 每关5场');
      state.bal.rows.forEach(function (r) {
        L.push('  ' + r.g + ' 敌' + r.n + ' 攻' + r.atk + ' 血' + r.hp + ' → 胜' + r.win + '% ' + r.turn + '回合 剩血' + r.left + '%');
      });
    }
    return L.join('\n');
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


  /* ================= v2.1.26 [7a] ☁️ 同步日志 ================= */
  function fmtAgo(ts) {
    if (!ts) return '从未';
    var d = Date.now() - ts;
    if (d < 0) return '刚刚';
    var m = Math.floor(d / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    function q(n) { return (n < 10 ? '0' : '') + n; }
    return q(d.getHours()) + ':' + q(d.getMinutes()) + ':' + q(d.getSeconds());
  }
  function secSy() {
    var L = [];
    var last = 0;
    /* 设计护栏：catch 体必须带日志或用户反馈，不能静默吞掉 */
    try { last = (typeof _lastSyncTime !== 'undefined') ? _lastSyncTime : 0; } catch (e) { last = 0; console.warn('[debug] 读取上次同步时间失败，按「从未」显示', e); }
    L.push('☁️ 云同步');
    L.push('上次同步：<b>' + fmtAgo(last) + '</b>' + (last ? '（' + fmtTime(last) + '）' : ''));
    L.push('');
    var lg = [];
    try { lg = (typeof getSyncLog === 'function') ? getSyncLog() : []; } catch (e) { lg = []; console.warn('[debug] 读取同步日志失败，按空显示', e); }
    if (!lg.length) {
      L.push('本次会话尚无同步操作。去设置里推一次 / 拉一次，这里就会记录。');
    } else {
      L.push('最近 ' + lg.length + ' 条（倒序）：');
      lg.slice().reverse().forEach(function (e) {
        L.push((e.ok ? '✅' : '❌') + ' ' + fmtTime(e.t) + ' ' + (e.dir === 'push' ? '↑ 推送' : '↓ 拉取') + ' · ' + (e.msg || ''));
      });
    }
    return L.join('<br>');
  }

  /* ================= v2.1.26 [7b] ⏱ 性能 ================= */
  var _perf = { fps: null, frames: 0, t0: 0, on: false, renderMs: null, stepMs: [], stepMax: null };
  function perfNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function perfStart() {
    if (_perf.on || typeof requestAnimationFrame !== 'function') return;
    _perf.on = true; _perf.frames = 0; _perf.t0 = perfNow();
    (function loop() {
      _perf.frames++;
      var now = perfNow(), dt = now - _perf.t0;
      if (dt >= 1000) { _perf.fps = Math.round(_perf.frames / dt * 1000); _perf.frames = 0; _perf.t0 = now; }
      if (_perf.on) requestAnimationFrame(loop);
    })();
  }
  function perfStop() { _perf.on = false; }
  /* 暴露给 game-render 做群战单步埋点（避免 debug.js 与 game-render 互相依赖顺序） */
  if (typeof window !== 'undefined') window.__perfMarkStep = perfMarkStep;
  /* 供 game-render 的群战单步埋点调用 */
  function perfMarkStep(ms) {
    _perf.stepMs.push(ms);
    if (_perf.stepMs.length > 50) _perf.stepMs.shift();
    if (_perf.stepMax === null || ms > _perf.stepMax) _perf.stepMax = ms;
  }
  function secPf() {
    perfStart();
    var L = [];
    L.push('⏱ 性能');
    L.push('FPS：<b>' + (_perf.fps === null ? '采样中…' : _perf.fps) + '</b>');
    L.push('本面板渲染耗时：<b>' + (_perf.renderMs === null ? '—' : _perf.renderMs.toFixed(1) + ' ms') + '</b>');
    if (_perf.stepMs.length) {
      var avg = _perf.stepMs.reduce(function (a, b) { return a + b; }, 0) / _perf.stepMs.length;
      L.push('群战单步：均 ' + avg.toFixed(1) + ' ms · 峰 ' + _perf.stepMax.toFixed(1) + ' ms（近 ' + _perf.stepMs.length + ' 步）');
    } else {
      L.push('群战单步：本次会话尚无战斗');
    }
    try {
      if (typeof performance !== 'undefined' && performance.memory) {
        L.push('JS 堆：' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB');
      }
    } catch (e) { console.warn('[debug] 读取 performance.memory 失败（非 Chrome 内核属正常），已忽略', e); }
    L.push('');
    L.push('<span style="color:var(--text3)">FPS 每秒刷新一次；群战单步在 game-render 的 _groupStep 里埋点。</span>');
    return L.join('<br>');
  }

  function render() {
    if (!drawer) return;
    if (!state.open) { drawer.className = 'modal-overlay'; return; }
    var _rT0 = perfNow();   // v2.1.26 [7b]
    var tabs = SECS.map(function (s) {
      var act = state.sec === s[0];
      return '<span role="tab" tabindex="0" data-dsec="' + s[0] + '" aria-selected="' + (act ? 'true' : 'false') + '" style="' + TAB
        + (act ? ';background:var(--surface-3);color:var(--text);font-weight:700' : ';color:var(--text3)') + '">'
        + s[1] + (s[0] === 'er' && errs.length ? ' (' + errs.length + ')' : '') + '</span>';
    }).join('');
    var body = state.sec === 'ov' ? secOv()
      : state.sec === 'st' ? secSt()
      : state.sec === 'at' ? secAt()
      : state.sec === 'ba' ? secBa()
      : state.sec === 'ch' ? secCh()
      : state.sec === 'sy' ? secSy()
      : state.sec === 'pf' ? secPf()
      : secEr();
    drawer.innerHTML =
      '<div class="modal-sheet">'
      + '<div class="modal-handle"></div>'
      + '<div class="modal-title" id="debugTitle">🐞 Debug 面板</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px" role="tablist" aria-label="调试分区">' + tabs + '</div>'
      + '<div style="font-size:var(--fs-2xs);color:var(--text2)">' + body + '</div>'
      + '<div class="modal-actions"><button type="button" onclick="DebugPanel.close()">关闭</button></div>'
      + '</div>';
    _perf.renderMs = perfNow() - _rT0;   // v2.1.26 [7b]
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
    runBalance: function () {
      state.bal = balSim(5);
      render();
      if (window.toast) toast(state.bal ? '体检完成' : '体检失败：属性未初始化', state.bal ? 's' : 'e');
    },
    copyBalance: function () {
      var txt = balReport();
      if (window.toast) toast('已复制平衡报告（' + bytes(txt.length * 2) + '）', 's');
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

/* ============================================
   MyHealth — 战斗历史（v2.13.0 批次 B）
   ============================================
   职责：把单敌 / 敌群两种模式的**终局摘要**落成一条长期记录，并派生
   「分模式的长期统计」（场次 / 胜率 / 连胜 / 平均回合），供记录视图与结果层使用。

   边界（重要）：
     · 本模块**只记账**，不参与任何胜负判定 / 奖励 / 进度，也不做 DOM 操作。
     · 单敌引擎**没有玩家治疗通道**（唯一 heal 事件的 sourceSide 是 'enemy'）→
       单敌的 playerHealed / party[].healed 一律写 null（UI 显示「不适用」），
       不得用 0 冒充「没有治疗」。
     · 单敌引擎也没有场地 / DOT / 护盾汇总 → terrain / dot / shield 写 null；
       敌群取 groupBattleStats() 的同名汇总。
     · 100 条 FIFO：数组**末尾是最新**（append 到末尾），超出丢最旧。
     · 同一 id 幂等：重复 append 直接返回 {ok:true,duplicated:true}，不写第二条。
     · 写入失败必须可检测：store.set 在配额写入失败时只 notifyQuota() 仍返回 true
       （localStorage.setItem 抛错被吞），所以本模块**回读物理键**确认落盘，
       失败时 console.error 并返回 {ok:false,reason}，由调用方只提示、不回滚奖励。
   ============================================ */
(function () {
  'use strict';

  var KEY = 'battleHistory';
  var VERSION = 1;
  var LIMIT = 100;
  /* 物理键名规则与 page/store.js 的 physKey(name, ver) 完全一致：'dh-' + name + '-v' + version。
     本模块用它**回读**以确认真的落盘（理由见 battleHistoryAppend 内注释）。
     若将来 store.js 改了物理键规则，这里必须同步改（test-battle-history.js 会判红）。 */
  var PHYS_KEY = 'dh-' + KEY + '-v' + VERSION;

  var MODES = ['single', 'group'];
  var RESULTS = ['win', 'loss', 'aborted'];
  var METRIC_KEYS = ['playerDealt', 'playerTaken', 'playerHealed', 'terrain', 'dot', 'shield'];

  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isNumOrNull(v) { return v === null || (typeof v === 'number' && isFinite(v)); }
  function isStrOrNull(v) { return v === null || typeof v === 'string'; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------- 形状校验（注册进 store，读写两侧都走同一份） ---------- */
  function validMetrics(m) {
    if (!isPlainObject(m)) return false;
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      var k = METRIC_KEYS[i];
      if (!has(m, k) || !isNumOrNull(m[k])) return false;
    }
    return true;
  }
  function validPartyRow(p) {
    if (!isPlainObject(p)) return false;
    if (typeof p.name !== 'string' || !p.name) return false;
    if (!has(p, 'dealt') || !isNumOrNull(p.dealt)) return false;
    if (!has(p, 'taken') || !isNumOrNull(p.taken)) return false;
    if (!has(p, 'healed') || !isNumOrNull(p.healed)) return false;
    if (typeof p.alive !== 'boolean') return false;
    return true;
  }
  /* 条目：缺任何关键字段 / 类型不符一律拒绝（不做静默补齐 —— 补齐会把
     「取不到的字段」伪装成「真的没有」，正是本批次要避免的事）。 */
  function validRecord(e) {
    if (!isPlainObject(e)) return false;
    if (typeof e.id !== 'string' || !e.id) return false;
    if (typeof e.endedAt !== 'string' || !e.endedAt) return false;
    if (MODES.indexOf(e.mode) < 0) return false;
    if (typeof e.stageId !== 'string') return false;
    if (RESULTS.indexOf(e.result) < 0) return false;
    if (!has(e, 'rounds') || typeof e.rounds !== 'number' || !isFinite(e.rounds) || e.rounds < 0) return false;
    if (!has(e, 'metrics') || !validMetrics(e.metrics)) return false;
    if (!has(e, 'party') || !Array.isArray(e.party)) return false;
    for (var i = 0; i < e.party.length; i++) { if (!validPartyRow(e.party[i])) return false; }
    if (!has(e, 'note') || !isStrOrNull(e.note)) return false;
    return true;
  }
  function validData(d) {
    if (!isPlainObject(d)) return false;
    if (d.version !== VERSION) return false;
    if (!Array.isArray(d.battles)) return false;
    if (d.battles.length > LIMIT) return false;
    for (var i = 0; i < d.battles.length; i++) { if (!validRecord(d.battles[i])) return false; }
    return true;
  }
  function emptyData() { return { version: VERSION, battles: [] }; }

  /* 顶层注册：必须在任何 get/set 之前（index.html 里本文件紧跟 store.js 加载）。
     ⚠️ 这里与 battleHistoryAppend 里的 `store.set` 都**必须写字面量键名**（不能用 KEY 变量）：
        scripts/test-sync-coverage.js 用正则 `store\.(get|set|registerSchema)\(\s*['"]([^'"]+)['"]`
        扫源码派生「应用真正在用的 store 键」，并断言每个键都有同步样本 ——
        写成变量会让这个键从同步覆盖网里悄悄消失（换设备就丢战斗历史）。
     registerSchema 是幂等的（同名重复注册只覆盖定义），部分测试夹具用桩 store。 */
  if (typeof store !== 'undefined' && store && typeof store.registerSchema === 'function') {
    store.registerSchema('battleHistory', { version: VERSION, defaultValue: emptyData, validate: validData });
  }

  /* ---------- 读：以物理键为权威来源 ---------- */
  /* 为什么不用 store.get()：store.set() 在 localStorage.setItem 抛错（配额）时
     只调用 notifyQuota()，却仍把 _cache 写成新值并返回 true（见 page/store.js）。
     若读取走 store.get()，一次失败的 append 会立刻从内存缓存读回「已保存」的假象，
     与本模块「写入失败必须可检测」的契约冲突。物理键是唯一能区分「真落盘」的口径。
     兼容性：同步导入（sync.js 的 mergeAll / buildImportMap）写的就是 store.js 的
     fullKey() = dh-battleHistory-v1，与本键一致；store.js 的 initScan 启动时
     也会按同一规则把合法数据装进缓存。 */
  function readData() {
    var raw = null;
    try { raw = localStorage.getItem(PHYS_KEY); }
    catch (e) { console.warn('[battle-history] 读取存档失败，按空历史处理', e); raw = null; }
    if (raw == null) return emptyData();
    var parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (e2) { console.warn('[battle-history] 存档解析失败，按空历史处理', e2); return emptyData(); }
    return validData(parsed) ? parsed : emptyData();
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* ---------- id ---------- */
  var _seq = 0;
  /* 唯一 id：时间戳（36 进制）+ 会话内自增序号，同一毫秒内多次结算也不会撞 id */
  function battleHistoryNewId() {
    _seq++;
    return 'bh-' + Date.now().toString(36) + '-' + _seq.toString(36);
  }

  /* ---------- 写 ---------- */
  function canonRecord(rec) {
    var metrics = {};
    for (var i = 0; i < METRIC_KEYS.length; i++) { metrics[METRIC_KEYS[i]] = rec.metrics[METRIC_KEYS[i]]; }
    var party = rec.party.map(function (p) {
      return { name: p.name, dealt: p.dealt, taken: p.taken, healed: p.healed, alive: p.alive };
    });
    return {
      id: rec.id, endedAt: rec.endedAt, mode: rec.mode, stageId: rec.stageId,
      result: rec.result, rounds: rec.rounds, metrics: metrics, party: party, note: rec.note
    };
  }

  /**
   * 追加一条战斗记录（幂等 + 100 条 FIFO）。
   * @param {object} rec 冻结结构：见文件头；缺失的可选字段由调用方显式写 null
   * @returns {{ok:true,count:number,duplicated?:boolean}|{ok:false,reason:string,count?:number}}
   */
  function battleHistoryAppend(rec) {
    if (!validRecord(rec)) return { ok: false, reason: 'invalid-record' };
    if (typeof store === 'undefined' || !store || typeof store.set !== 'function') {
      console.error('[battle-history] 保存失败：store 不可用');
      return { ok: false, reason: 'no-store' };
    }
    var cur = readData();
    for (var i = 0; i < cur.battles.length; i++) {
      if (cur.battles[i].id === rec.id) return { ok: true, duplicated: true, count: cur.battles.length };
    }
    var battles = cur.battles.concat([canonRecord(rec)]);
    if (battles.length > LIMIT) battles = battles.slice(battles.length - LIMIT);   /* FIFO：丢最旧 */
    var next = { version: VERSION, battles: battles };
    if (!validData(next)) return { ok: false, reason: 'invalid-data' };

    var wrote = false;
    try {
      /* 键名字面量：同步覆盖网按字面量派生在用键（同上方 registerSchema 的注释） */
      wrote = (store.set('battleHistory', next) === true);
    } catch (e) {
      /* 不静默：store.set 自身有 try/catch，这里兜的是更外层的意外（例如 set 被替换） */
      console.error('[battle-history] 保存失败：store.set 抛异常', e);
      rollbackCache(cur);
      return { ok: false, reason: 'set-threw' };
    }
    /* 回读物理键确认落盘 —— store.set 的返回值不足以判断（配额失败仍返回 true） */
    var verify = readData();
    if (verify.battles.length !== next.battles.length ||
        !verify.battles.length ||
        verify.battles[verify.battles.length - 1].id !== next.battles[next.battles.length - 1].id) {
      console.error('[battle-history] 保存失败：回读 ' + PHYS_KEY + ' 校验不通过（store.set 返回 ' + wrote + '，磁盘未确认）',
        { expected: next.battles.length, actual: verify.battles.length });
      rollbackCache(cur);
      return { ok: false, reason: 'verify-failed', count: verify.battles.length };
    }
    return { ok: true, count: verify.battles.length };
  }
  /* 写失败时把 store 的内存缓存回滚到 append 之前的值。
     为什么必须回滚：store.set 在 localStorage.setItem 抛错时仍把 `_cache` 写成新值，
     而 sync.js 的 collectOtherKeys() 是从 `store.getAll()`（= 内存缓存）派生推送载荷的 ——
     不回滚的话，一条**根本没落盘**的记录会被下一次云推送带上云端（换设备后又冒出来）。
     ⚠️ 代价：配额场景下 store.set 会再触发一次 notifyQuota()（toast 重复一次）；
        既有 store API 没有「只改缓存」的入口，这是无法避免的取舍（见交付报告）。 */
  function rollbackCache(prev) {
    try { store.set('battleHistory', prev); }
    catch (e) { console.error('[battle-history] 缓存回滚失败（不影响已返回的 ok:false）', e); }
  }

  /* ---------- 查询 ---------- */
  /** 全部记录（存储顺序：数组末尾 = 最新）。返回深拷贝，调用方改不到存档。 */
  function battleHistoryList() { return clone(readData().battles) || []; }

  /* 按 endedAt 倒序（最新在前）。
     ⚠️ append 顺序与 endedAt 顺序可能不一致（补录 / 时钟回拨）→ 先 reverse（拿到
     「append 新→旧」），再做**稳定**排序（V8 的 Array#sort 稳定）按 endedAt 降序；
     同 endedAt 时保留 reverse 后的顺序 = 最新 append 在前。 */
  function sortNewestFirst(list) {
    var out = list.slice().reverse();
    out.sort(function (a, b) {
      if (a.endedAt === b.endedAt) return 0;
      return a.endedAt < b.endedAt ? 1 : -1;
    });
    return out;
  }

  /** 最近 n 条（最新在前） */
  function battleHistoryRecent(n) {
    var k = (typeof n === 'number' && n > 0) ? Math.floor(n) : 10;
    return sortNewestFirst(readData().battles).slice(0, k);
  }

  /**
   * 分模式长期统计（禁止跨模式合并）。
   * 口径（冻结）：
   *   count        = win + loss（**不含 aborted**）
   *   winRate      = wins / (wins + losses)，分母 0 → null（UI 显示「—」）
   *   currentStreak= 按 endedAt 倒序连续 win，遇 loss 停；aborted 跳过（不打断、不计入）
   *   bestStreak   = 全历史连续 win 段最大值；aborted 同样跳过
   *   avgRounds    = 已完成 win/loss 的 rounds 算术平均，保留 1 位小数；无 → null
   *   abortedCount = 异常中止条数（单独回传）
   * @param {'single'|'group'} mode
   */
  function battleHistoryStats(mode) {
    var m = (MODES.indexOf(mode) < 0) ? 'single' : mode;
    var all = (clone(readData().battles) || []).filter(function (r) { return r.mode === m; });
    var wins = 0, losses = 0, aborted = 0, roundsSum = 0, roundsN = 0;
    all.forEach(function (r) {
      if (r.result === 'aborted') { aborted++; return; }   /* 不计 count / 胜率 / 平均回合 */
      if (r.result === 'win') wins++;
      else if (r.result === 'loss') losses++;
      if (typeof r.rounds === 'number' && isFinite(r.rounds)) { roundsSum += r.rounds; roundsN++; }
    });
    var decided = wins + losses;
    var ordered = sortNewestFirst(all);
    var cur = 0, stopped = false;
    for (var i = 0; i < ordered.length; i++) {
      var r = ordered[i];
      if (r.result === 'aborted') continue;   /* aborted 跳过：不打断连胜 */
      if (stopped) continue;
      if (r.result === 'win') cur++;
      else stopped = true;
    }
    var best = 0, run = 0;
    for (var j = 0; j < ordered.length; j++) {
      var q = ordered[j];
      if (q.result === 'aborted') continue;
      if (q.result === 'win') { run++; if (run > best) best = run; }
      else run = 0;
    }
    return {
      mode: m, count: decided, wins: wins, losses: losses, total: all.length,
      winRate: decided ? (wins / decided) : null,
      currentStreak: cur, bestStreak: best,
      avgRounds: roundsN ? (Math.round(roundsSum / roundsN * 10) / 10) : null,
      abortedCount: aborted,
      /* 口径标记：连胜 / 最佳连胜里 aborted 被跳过；胜率分母也不含 aborted */
      abortedSkipped: true
    };
  }

  /* 测试/工具暴露（与仓库既有风格一致：模块级函数即全局） */
  if (typeof window !== 'undefined') {
    window.battleHistoryAppend = battleHistoryAppend;
    window.battleHistoryList = battleHistoryList;
    window.battleHistoryStats = battleHistoryStats;
    window.battleHistoryRecent = battleHistoryRecent;
    window.battleHistoryNewId = battleHistoryNewId;
  }
})();

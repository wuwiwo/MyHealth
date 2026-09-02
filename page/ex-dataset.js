/* ============================================
   MyHealth — Exercise Dataset Module
   只读动作百科数据层：基于 window.EX_DATASET（由 scripts/build-dataset.js 生成）
   纯逻辑，不碰 DOM/store。UI 在 tab-settings.js。
   数据格式（紧凑数组，键序 EX_DATASET.keys）:
   [id, name, zh, cat, eq, target, mg, sec[], img, gif, mid, ins, steps[]]
   ============================================ */

var EXD = (function() {
  'use strict';
  var D = window.EX_DATASET || {};
  var K = D.keys || ['id','name','zh','cat','eq','target','mg','sec','img','gif','mid','ins','steps'];
  var IDX = {id:0,name:1,zh:2,cat:3,eq:4,target:5,mg:6,sec:7,img:8,gif:9,mid:10,ins:11,steps:12};
  var ROWS = D.items || [];
  var _byId = null;
  var _catList = null;
  var _eqList = null;

  /* 部位/器械中英映射（筛选显示中文） */
  var CAT_LABELS = {
    back:'背部', cardio:'有氧', chest:'胸部', 'lower arms':'小臂', 'lower legs':'小腿',
    neck:'颈部', shoulders:'肩部', 'upper arms':'大臂', 'upper legs':'大腿', waist:'腰腹'
  };
  var EQ_LABELS = {
    assisted:'辅助', band:'弹力带', barbell:'杠铃', 'body weight':'自重', 'bosu ball':'波速球',
    cable:'绳索', dumbbell:'哑铃', 'elliptical machine':'椭圆机', 'ez barbell':'EZ杠',
    hammer:'锤式', kettlebell:'壶铃', 'leverage machine':'杠杆机', 'medicine ball':'药球',
    'olympic barbell':'奥林匹克杠铃', 'resistance band':'阻力带', roller:'泡沫轴', rope:'绳子',
    'skierg machine':'滑雪机', 'sled machine':'雪橇机', 'smith machine':'史密斯机',
    'stability ball':'稳定球', 'stationary bike':'动感单车', 'stepmill machine':'楼梯机',
    tire:'轮胎', 'trap bar':'陷阱杠', 'upper body ergometer':'上肢测力计', weighted:'负重', 'wheel roller':'健腹轮'
  };
  /* 肌群/部位(靶)中英映射 */
  var TARGET_LABELS = {
    abs:'腹肌', abductors:'外展肌', adductors:'内收肌', biceps:'肱二头肌', calves:'小腿肌',
    'cardiovascular system':'心血管', chest:'胸部', forearms:'前臂', glutes:'臀肌', hamstrings:'腘绳肌',
    hip: '髋部', hip_flexors:'髋屈肌', lats:'背阔肌', 'lower back':'下背', obliques:'腹斜肌',
    pectorals:'胸肌', quads:'股四头肌', 'upper back':'上背', triceps:'肱三头肌', spine:'脊柱',
    traps:'斜方肌', deltoids:'三角肌'
  };
  /* 通用翻译：优先英文，其他原样 */
  function toZh(val) {
    if (!val) return val;
    return CAT_LABELS[val] || EQ_LABELS[val] || TARGET_LABELS[val] || val;
  }

  function row(r) {
    return {
      id: r[IDX.id], name: r[IDX.name], zh: r[IDX.zh],
      cat: r[IDX.cat], eq: r[IDX.eq], target: r[IDX.target],
      mg: r[IDX.mg], sec: r[IDX.sec] || [],
      img: r[IDX.img], gif: r[IDX.gif], mid: r[IDX.mid],
      ins: r[IDX.ins], steps: r[IDX.steps] || []
    };
  }

  function ready() { return ROWS.length > 0; }
  function attribution() { return D.attribution || ''; }

  function byIdMap() {
    if (!_byId) {
      _byId = {};
      ROWS.forEach(function(r){ _byId[r[IDX.id]] = r; });
    }
    return _byId;
  }

  /* 按 dsId 取条目；不存在返回 null */
  function get(id) {
    var r = byIdMap()[id];
    return r ? row(r) : null;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[Ａ-Ｚａ-ｚ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s·—–_\-()（）【】\[\]"'’‘“”,，、。:：!！?？]/g, '');
  }

  function tokenOverlap(q, text) {
    // 中文单字 + 英文词元的重叠计数
    if (!q || !text) return 0;
    var t = norm(text);
    var enTokens = q.match(/[a-z0-9]{2,}/g) || [];
    var score = 0;
    enTokens.forEach(function(w){ if (t.indexOf(w) > -1) score += 20; });
    var cnChars = q.replace(/[a-z0-9]/g, '');
    for (var i = 0; i < cnChars.length; i++) {
      if (t.indexOf(cnChars[i]) > -1) score += 4;
    }
    return score;
  }

  /* 关联候选匹配。actionName: 应用内动作名；limit: 候选上限
     返回 [{item, s, reason}] 按分数降序 */
  function matchCandidates(actionName, limit) {
    limit = limit || 5;
    var q = norm(actionName);
    if (!q) return [];
    var aliasId = (D.aliases && (D.aliases[actionName] || D.aliases[q])) || null;
    var out = [];
    ROWS.forEach(function(r) {
      var it = row(r);
      var zhN = norm(it.zh), enN = norm(it.name);
      var s = 0, reason = '';
      if (aliasId && it.id === aliasId) { s = 100; reason = '别名'; }
      else if (zhN === q) { s = 95; reason = '中文精确'; }
      else if (enN === q) { s = 90; reason = '英文精确'; }
      else if (zhN.indexOf(q) > -1 || q.indexOf(zhN) > -1) { s = Math.max(62, 80 - Math.abs(zhN.length - q.length)); reason = '中文包含'; }
      else if (enN.indexOf(q) > -1 || q.indexOf(enN) > -1) { s = 70; reason = '英文包含'; }
      else {
        var ov = tokenOverlap(q, it.zh + ' ' + it.name);
        if (ov > 16) { s = Math.min(60, ov); reason = '词元'; }
      }
      if (s >= 60) out.push({ item: it, s: s, reason: reason });
    });
    out.sort(function(a, b){ return b.s - a.s; });
    return out.slice(0, limit);
  }

  /* 百科检索: 全文(中文名/英文名/目标肌群/器械) contains。
     filters: { cat:'', eq:'' } 空串=全部。返回原始行数组(分页用)。 */
  function search(kw, filters) {
    filters = filters || {};
    kw = norm(kw);
    var fc = filters.cat || '', fe = filters.eq || '';
    var res = [];
    ROWS.forEach(function(r) {
      if (fc && r[IDX.cat] !== fc) return;
      if (fe && r[IDX.eq] !== fe) return;
      if (kw) {
        var hay = norm(r[IDX.zh]) + '|' + norm(r[IDX.name]) + '|' + norm(r[IDX.target]) + '|' + norm(r[IDX.eq]);
        if (hay.indexOf(kw) === -1) return;
      }
      res.push(r);
    });
    return res;
  }

  function cats() {
    if (!_catList) {
      var m = {};
      ROWS.forEach(function(r){ m[r[IDX.cat]] = true; });
      _catList = Object.keys(m).sort();
    }
    return _catList;
  }
  /* 部位中文标签 */
  function getCatLabel(cat) { return CAT_LABELS[cat] || cat; }

  function eqs() {
    if (!_eqList) {
      var m = {};
      ROWS.forEach(function(r){ m[r[IDX.eq]] = true; });
      _eqList = Object.keys(m).sort();
    }
    return _eqList;
  }
  /* 器械中文标签 */
  function getEqLabel(eq) { return EQ_LABELS[eq] || eq; }

  /* 媒体 URL: 图床优先(MEDIA_BASE)，回退本地 page/media/
     rel 如 'images/0001-x.jpg' | 'videos/0001-x.gif' -> 返回 {primary, fallback} */
  function mediaUrls(rel) {
    var base = window.MEDIA_BASE || '';
    if (base) return { primary: base + rel, fallback: 'media/' + rel };
    return { primary: 'media/' + rel, fallback: null };
  }

  return {
    ready: ready,
    attribution: attribution,
    count: function(){ return ROWS.length; },
    get: get,
    row: row,
    norm: norm,
    matchCandidates: matchCandidates,
    search: search,
    cats: cats,
    eqs: eqs,
    getCatLabel: getCatLabel,
    getEqLabel: getEqLabel,
    toZh: toZh,
    mediaUrls: mediaUrls
  };
})();

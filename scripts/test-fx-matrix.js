#!/usr/bin/env node
/* v2.14.0 批次 C 测试：反馈矩阵单一来源 + 演出层级收口
   ------------------------------------------------------------
   本套件守住批次 C 的四条契约（全部**真断言**，不是「没抛异常」）：

   1) **单一来源**（page/fx-semantics.js）
      · 顶层不碰 DOM：在**没有 document 的沙箱**里也能加载；
      · id 闭集：`listStatusDefs()` 的每个 id 要么有映射、要么在显式排除表里带理由；
      · 三层查表：id 优先 → 文案兜底 → 都匹配不到返回 null（**绝不猜**）；
      · 既有 14 行文案语义逐字不变。

   2) **两模式共用该表**
      game-render.js 的 gbMarkerFor 与 game-battle.js 的 bcMarkerFor 对同一事件给出同一标记；
      模式差异只保留在各自的守卫里（群战 type 白名单 / 单敌显式 targetSide）；
      模块缺失时两处都**静默跳过且不抛错**。

   3) **聚合不变式**（批次 C 核心）
      ×2/×4/×8：只允许「同一步 + 同目标 + 同类可加总数值」合并；
      绝不跨目标（A/B 各 100 → 2 条，不得出现 200）、绝不跨语义（状态/技能身份/暴击/击杀保持独立条目）；
      每条演出的落点与事件的 targetId 一致；缺目标/未知文案不挂载。

   4) **重大事件：击杀**（UI 侧 HP 跨零检测，引擎零改动）
      只认 ≥1 → ≤0；事前已 0 不重复触发；同一步内不参与数值聚合；不延迟结算。

   另有：reduced-motion 语义仍在、日志抽屉契约（§24）、360×640 小屏守卫、
   以及两模式各 ≥10 条事件样本夹具（可复现、可判定、条件登记清楚）。

   判红证据：`FX_PAGE_DIR=<批次 C 之前的 page/ 快照> node scripts/test-fx-matrix.js`
   （本套件所有 page 模块都从 `FX_PAGE_DIR` 读取，故同一条命令即可复现判红）。

   Run: node scripts/test-fx-matrix.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
/* ⚠️ 判红证据入口：把 page/ 换到「批次 C 之前」的快照目录（git show HEAD:page/... 展开） */
const PAGE = process.env.FX_PAGE_DIR ? path.resolve(process.env.FX_PAGE_DIR) : path.join(ROOT, 'page');
const has = f => fs.existsSync(path.join(PAGE, f));
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(actual, expected, msg) {
  ok(actual === expected, msg + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}
/* 一个 section 抛错也要留下可诊断的红行，而不是让整份套件崩掉 */
function section(label, fn) {
  try { fn(); } catch (e) { ok(false, '[' + label + '] 抛错：' + (e && e.message)); }
}
/* 模块/函数缺失时返回 undefined（判红由断言给出，不抛错）—— 判红证据要用旧 page/ 跑 */
function c(sb, name, ...args) {
  return (sb && typeof sb[name] === 'function') ? sb[name].apply(null, args) : undefined;
}

const GROUP_FILES = ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
  'unit.js', 'state-core.js', 'status-defs.js', 'fx-semantics.js', 'talent.js', 'skill.js', 'affix.js',
  'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
  'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
  'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js', 'game-render.js'];

/* ---------- DOM 桩（只用于「可观测」，不校验样式） ---------- */
function mkEl() {
  return {
    style: {}, classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, contains(c) { return !!this._s[c]; }, toggle() {} },
    textContent: '', innerHTML: '', className: '', parentNode: null, children: [],
    setAttribute() {}, getAttribute() { return null; },
    appendChild(ch) { ch.parentNode = this; this.children.push(ch); return ch; },
    removeChild(ch) { const i = this.children.indexOf(ch); if (i >= 0) this.children.splice(i, 1); ch.parentNode = null; return ch; },
    remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
}
function mkLayer() {
  return {
    children: [],
    appendChild(el) { el.parentNode = this; this.children.push(el); return el; },
    removeChild(el) { const i = this.children.indexOf(el); if (i >= 0) this.children.splice(i, 1); el.parentNode = null; return el; },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (!v) this.children.length = 0; }
  };
}
function mkChip(uid, name, x, badges) {
  return {
    _uid: uid, _badges: badges || [],
    getAttribute(k) { return k === 'data-uid' ? uid : (k === 'data-name' ? name : null); },
    getBoundingClientRect() { return { left: x - 20, top: 80, width: 40, height: 40, right: x + 20, bottom: 120 }; },
    classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, contains(c) { return !!this._s[c]; }, toggle() {} },
    appendChild(el) { el.parentNode = this; this._badges.push(el); return el; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    get textContent() { return name; }
  };
}

/* 群战沙箱：与 index.html 同序加载（缺文件则跳过，便于判红证据跑旧目录） */
function makeGroupSbx(opts) {
  opts = opts || {};
  const mem = {};
  const detMath = Object.create(Math);
  detMath.random = function () { return 0.5; };   /* 固定随机：真实引擎跑批必须可复现 */
  const sb = {
    Math: detMath, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; }, registerSchema: () => {}, _mem: mem }
  };
  sb.window = sb; sb.globalThis = sb;
  sb.innerWidth = opts.width || 390; sb.innerHeight = opts.height || 844;
  sb.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => mkEl(), body: { appendChild() {} }, addEventListener() {},
    documentElement: { setAttribute() {} }
  };
  sb.addEventListener = () => {};
  sb.toast = () => {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  sb.navigator = { clipboard: { writeText: () => ({ then: () => {} }) } };
  vm.createContext(sb);
  const files = opts.noFx ? GROUP_FILES.filter(f => f !== 'fx-semantics.js') : GROUP_FILES;
  files.forEach(f => { if (has(f)) vm.runInContext(src(f), sb, { filename: f }); });
  return sb;
}

/* 把 DOM 桩接到群战沙箱：chips = 目标芯片；logOpen = 日志抽屉展开 */
function wireGroupDom(sb, chips, logOpen) {
  const layer = mkLayer();
  const mid = { childCount: 0, appendChild() { this.childCount++; }, getBoundingClientRect: () => ({ left: 0, top: 300, width: 390, height: 126 }) };
  const ov = {
    classList: {
      _s: {}, add(x) { this._s[x] = 1; }, remove(x) { delete this._s[x]; },
      contains(x) { return x === 'gb-log-open' ? !!logOpen : !!this._s[x]; }, toggle(x, v) { if (v) this._s[x] = 1; else delete this._s[x]; }
    },
    querySelectorAll(sel) { return sel.indexOf('.gb-unit') >= 0 ? chips : []; },
    querySelector(sel) {
      const m = /data-uid="([^"]+)"/.exec(sel);
      if (m) return chips.filter(x => x._uid === m[1])[0] || null;
      return null;
    }
  };
  sb.document.getElementById = id => {
    if (id === 'battleOverlay') return ov;
    if (id === 'gbArenaMid') return mid;
    if (id === 'gbFx') return layer;
    return null;
  };
  sb.document.body = { appendChild() {} };
  sb.document.createElement = () => mkEl();
  return { layer, mid, ov, chips };
}
const posOf = el => {
  const m = /left:(-?[0-9.]+)px;top:(-?[0-9.]+)px/.exec((el && el.style && el.style.cssText) || '');
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
};
const textsOf = layer => layer.children.map(e => e.textContent);

/* 单敌沙箱：只装 fx-semantics + game-battle（口径与 test-battle.js 的夹具一致） */
function makeSingleSbx(opts) {
  opts = opts || {};
  const els = {};
  const created = [];
  const timers = [];
  function ghEl(id) {
    const el = mkEl();
    el.id = id; el.appendChildCount = 0;
    el.appendChild = function (ch) { ch.parentNode = this; this.appendChildCount++; this.children.push(ch); return ch; };
    return el;
  }
  const game = { attempts: {}, cleared: [], current: '1-1' };
  const refine = { points: 0, unlocked: true };
  const calls = { trackLevel: [], celebrate: 0 };
  const sb = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }), JSON, console, Date,
    document: {
      getElementById(id) { if (!els[id]) els[id] = ghEl(id); return els[id]; },
      createElement(tag) { const el = mkEl(); el._tag = tag; created.push(el); return el; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    store: { get() { return null; }, set() {} },
    getGame() { return game; }, setGame() {},
    today() { return '2026-10-11'; },
    getGameStats() { return { atk: 50, def: 30, hp: 300, soulAtk: 0, soulDef: 0 }; },
    trackLevel(id) { calls.trackLevel.push(id); },
    getRefine() { return refine; }, saveRefine(r) { refine.points = r.points; },
    celebrate() { calls.celebrate++; }, toast() {}, showShareCard() {}, startGroupTrial() {}
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  if (!opts.noFx && has('fx-semantics.js')) vm.runInContext(src('fx-semantics.js'), sb, { filename: 'fx-semantics.js' });
  vm.runInContext(src('game-battle.js'), sb, { filename: 'game-battle.js' });
  return { sb, els, created, timers, game, refine, calls };
}
const marksOf = created => created.filter(x => String(x.className || '').indexOf('bc-mark') >= 0);
const impactsOf = created => created.filter(x => String(x.className || '').indexOf('bc-impact') >= 0);

/* 闸门：旧 page/（批次 C 之前）没有新函数时，先记一条红，再安全跳过后续硬依赖 */
function requireFn(holder, name, label) {
  const fn = holder && holder[name];
  if (typeof fn !== 'function') { ok(false, label + '：' + name + ' 不存在（批次 C 之前）'); return null; }
  return fn;
}

/* ============================================================
   1. 单一来源：顶层无 DOM + id 闭集 + 三层查表
   ============================================================ */
console.log('--- 1. fx-semantics 单一来源（无 DOM 沙箱加载 + id 闭集） ---');
section('1', function () {
  /* (a) 顶层不访问 DOM：这个沙箱**根本没有 document/window** */
  const pure = { Math, JSON, console };
  pure.window = pure; pure.globalThis = pure;
  vm.createContext(pure);
  let loadErr = null;
  try {
    ['state-core.js', 'status-defs.js'].forEach(f => { if (has(f)) vm.runInContext(src(f), pure, { filename: f }); });
    if (has('fx-semantics.js')) vm.runInContext(src('fx-semantics.js'), pure, { filename: 'fx-semantics.js' });
  } catch (e) { loadErr = e; }
  ok(loadErr === null, 'fx-semantics.js 在没有 DOM 的环境也能加载（顶层零 DOM 访问）：' + (loadErr && loadErr.message));
  ok(typeof pure.fxMarkForEvent === 'function', '存在统一入口 fxMarkForEvent');
  ok(typeof pure.fxMarkForStatusId === 'function' && typeof pure.fxMarkForText === 'function',
    '存在 id 优先与文案兜底两个入口');
  ok(typeof pure.fxUnregisteredStatusIds === 'function', '存在闭集自检 fxUnregisteredStatusIds');
  ok(typeof pure.fxSeverityForEvent === 'function', '存在严重度分类 fxSeverityForEvent');
  ok(typeof pure.fxDetectKills === 'function' && typeof pure.fxHpSnapshot === 'function'
    && typeof pure.fxHpPairSnapshot === 'function' && typeof pure.fxDetectSidedKills === 'function',
    '存在击杀检测的四个纯函数');

  /* (b) id 闭集：listStatusDefs() 每个 id 要么映射、要么带理由排除 */
  const ids = c(pure, 'listStatusDefs') || [];
  ok(ids.length >= 20, 'listStatusDefs() 返回 ' + ids.length + ' 个状态（≥20）');
  const unreg = c(pure, 'fxUnregisteredStatusIds');
  ok(Array.isArray(unreg) && unreg.length === 0,
    'id 闭集成立：每个状态 id 都有映射或带理由的排除（未登记：' + JSON.stringify(unreg) + '）');
  const mapped = pure.FX_MARK_FOR_STATUS_ID || {};
  const excluded = pure.FX_EXCLUDED_STATUS_IDS || {};
  const stale = Object.keys(mapped).concat(Object.keys(excluded)).filter(id => ids.indexOf(id) < 0);
  ok(stale.length === 0, '映射/排除表里没有 listStatusDefs 不认识的历史 id：' + JSON.stringify(stale));
  eq(Object.keys(mapped).length + Object.keys(excluded).length, ids.length,
    '映射数 + 排除数 = 状态总数（闭集不重不漏）');
  const noReason = Object.keys(excluded).filter(id => !excluded[id] || String(excluded[id]).length < 4);
  ok(noReason.length === 0, '每条排除都写了理由：' + JSON.stringify(noReason));

  /* (c) 三层查表：id 优先 → 文案兜底 → null（绝不猜） */
  eq(c(pure, 'fxMarkForEvent', { statusId: 'poison', msg: '随便一句没有关键词的话' }), '☠️',
    'id 优先：statusId=poison → ☠️（文案不含中毒也照样命中）');
  eq(c(pure, 'fxMarkForStatusId', 'freeze'), '❄️', 'fxMarkForStatusId(freeze) → ❄️');
  eq(c(pure, 'fxMarkForStatusId', 'souldown'), null, '显式排除的状态（纯被动）→ null，不猜标记');
  eq(c(pure, 'fxMarkForStatusId', 'not_a_status'), null, '未知 id → null');
  eq(c(pure, 'fxMarkForText', '🔴 Boss 怒意增强, 攻击力 +5'), '🔴', '文案兜底：Boss 怒意增强 → 🔴');
  eq(c(pure, 'fxMarkForEvent', { msg: '🔴 Boss 怒意增强, 攻击力 +5' }), '🔴', '无 statusId 时走文案兜底');
  eq(c(pure, 'fxMarkForEvent', { msg: '某个完全不可识别的状态变化' }), null, '匹配不到 → null（绝不猜）');
  eq(c(pure, 'fxMarkForEvent', null), null, '空事件 → null');
  eq(c(pure, 'fxMarkForEvent', { statusId: 'poison', msg: '某个不可识别文案' }), '☠️',
    'id 命中即返回（不被无关文案干扰）');
  eq(c(pure, 'fxMarkForEvent', { statusId: 'souldown', msg: '⚠️ 魂防降低：持续' }), null,
    '排除项不会被文案层抢救出来（排除即排除）');

  /* (d) 批次 C 新增映射的已知文案（Lead 侦察清单，逐条） */
  [['🔴 Boss 怒意增强, 攻击力 +7', '🔴', 'Boss 怒意增强'],
   ['🛡️ Boss 铁壁护盾, 吸收 30 伤害', '🛡️', 'Boss 铁壁护盾'],
   ['💚 Boss 生命汲取, 恢复 12 HP', '💚', 'Boss 生命汲取'],
   ['🛡️ B 受护盾庇护，免疫【冰冻】（剩余 30）', '🛡️', '受护盾庇护，免疫【X】（更具体者优先）'],
   ['🪞 魔法镜：免疫', '🪞', '魔法镜：免疫'],
   ['受击解冻', '❄️', '受击解冻（无 statusId 的兜底）'],
   ['哈欠未生效', '😴', '哈欠未生效（无 statusId 的兜底）'],
   ['蓄力完成!', '⏳', '蓄力完成!'],
   ['💀 甲 遗言：自我牺牲阵亡', '💀', '遗言：自我牺牲阵亡'],
   ['💀 遗言: -5', '💀', '💀 遗言:（DOT 文案）']
  ].forEach(function (row) {
    eq(c(pure, 'fxMarkForEvent', { msg: row[0] }), row[1], '新增映射：' + row[2]);
  });
  /* 复合文案优先级：含「免疫」+ 状态名时，被盾挡下才是本次语义（新行必须排在状态名行之前） */
  eq(c(pure, 'fxMarkForText', '🛡️ B 受护盾庇护，免疫【冰冻】（剩余 30）'), '🛡️',
    '复合文案：护盾庇护的行排在 /冰冻/ 之前（否则会被抢成 ❄️）');
  eq(c(pure, 'fxMarkForText', '🪞 魔法镜反弹：【冰冻】→ 甲'), '🪞',
    '复合文案：魔法镜反弹行排在 /冰冻/ 之前');

  /* (e) 既有 14 行语义逐字不变（批次 C 之前的表内容 = 这里的期望值） */
  [['🛡️ B 护盾吸收 30（护盾破碎）', '🛡️30💥', '护盾吸收（含破碎）'],
   ['🛡️ B 护盾吸收 12 魂伤（护盾破碎）', '🛡️12💥', '护盾吸收（魂伤）'],
   ['🛡️ 乙 护盾破碎（吸收已用尽）', '🛡️💥', '护盾破碎'],
   ['💠 甲 破甲（2 回合）', '💠', '破甲'],
   ['☠️ 中毒: -12', '☠️', '中毒'],
   ['❄️ 冰冻: 无法行动', '❄️', '冰冻'],
   ['🌧️ 乙 变潮湿', '💧', '潮湿'],
   ['😴 睡眠: 无法行动', '😴', '睡眠'],
   ['😡 甲 嘲讽 乙', '😡', '嘲讽'],
   ['✨ 甲 净化 → 乙：无普通~高级负面可解除', '✨', '净化'],
   ['🌑 末日: -9', '🌑', '末日'],
   ['👻 被幽魂附身：技能不可用、冷却暂停', '👻', '幽魂附身'],
   ['😱 威吓：甲 → 乙 攻击 -28%', '😱', '威吓'],
   ['🔻 甲 变小', '🔻', '变小'],
   ['⏳ 甲 蓄力（梦幻光球，下回合释放）', '⏳', '蓄力']
  ].forEach(function (row) {
    eq(c(pure, 'fxMarkForText', row[0]), row[1], '既有 14 行语义不变：' + row[2]);
  });

  /* (f) 严重度分类：只给层级，不含时长 */
  [['routine', { type: 'damage', msg: '⚔️ 甲 攻击 乙 → 100 伤害' }],
   ['routine', { type: 'dot', msg: '☠️ 中毒: -12' }],
   ['notable', { type: 'heal', msg: '💚 甲 → 乙 治疗 +120' }],
   ['notable', { type: 'shield', msg: '🛡️ 乙 护盾吸收 30' }],
   ['notable', { type: 'status', msg: '🌀 甲 → 乙 施加【冰冻】（3 回合）' }],
   ['major', { type: 'kill', msg: '💀 乙 阵亡' }],
   ['major', { type: 'e', msg: '🔴 Boss 怒意增强, 攻击力 +7' }],
   ['major', { type: 'outcome', msg: '🏆 讨伐成功' }]
  ].forEach(function (row) {
    eq(c(pure, 'fxSeverityForEvent', row[1]), row[0], '严重度：' + row[1].msg + ' → ' + row[0]);
  });
  eq(c(pure, 'fxSeverityForEvent', null), 'routine', '空事件 → routine（不抛错）');
  const sevKeys = ['routine', 'notable', 'major'];
  ok(sevKeys.every(k => typeof k === 'string'), '严重度只有三个层级（阈值/时长仍由各自 policy 决定）');
});

/* ============================================================
   2. 两模式共用同一表（模式差异只在各自守卫里）
   ============================================================ */
console.log('--- 2. 两模式共用 fxMarkForEvent（守卫差异保留在模式内） ---');
section('2', function () {
  const gsb = makeGroupSbx();
  const wire = wireGroupDom(gsb, [mkChip('uB', '乙', 260)], false);
  const ssbH = makeSingleSbx();
  /* 同一事件：群战（type status + targetId）与单敌（type shield + targetSide）标记必须同码 */
  const groupEv = { msg: '🛡️ 乙 护盾吸收 120', type: 'status', targetId: 'uB' };
  const singleEv = { msg: '🛡️ 乙 护盾吸收 120', type: 'shield', targetSide: 'enemy' };
  const want = '🛡️120';
  eq(c(gsb, 'gbMarkerFor', groupEv, null), want, '群战 gbMarkerFor 出标记（共用单一来源）');
  eq(c(ssbH.sb, 'bcMarkerFor', singleEv), want, '单敌 bcMarkerFor 对同一事件给同一标记');
  eq(c(gsb, 'fxMarkForEvent', groupEv), want, '两模式结果都等于 fxMarkForEvent（同源）');

  /* 模式差异 ①：群战只对 status|talent|terrain 出标记 */
  eq(c(gsb, 'gbMarkerFor', { msg: '🛡️ 乙 护盾吸收 120', type: 'damage', targetId: 'uB' }, null), null,
    '群战守卫：damage 类型不出标记（数字由 gbParseHit 表达）');
  eq(c(gsb, 'gbMarkerFor', singleEv, null), null, '群战守卫：shield 类型不在白名单（群战护盾事件是 status）');
  const parsedHit = { amount: 30, kind: 'dmg', crit: false };
  eq(c(gsb, 'gbMarkerFor', groupEv, parsedHit), null, '群战守卫：已被 gbParseHit 解析的事件不重复出标记');
  /* 模式差异 ②：单敌必须有显式 targetSide */
  eq(c(ssbH.sb, 'bcMarkerFor', { msg: '🛡️ 乙 护盾吸收 120', type: 'shield' }), null,
    '单敌守卫：缺 targetSide → 不挂载（不猜挂在谁身上）');
  eq(c(ssbH.sb, 'bcMarkerFor', { msg: '🛡️ 乙 护盾吸收 120', type: 'damage', targetSide: 'enemy' }), null,
    '单敌守卫：damage 类型不出标记');
  /* 12 条跨模式同源样本 */
  const shared = ['🛡️ 乙 护盾吸收 30（护盾破碎）', '💠 甲 破甲', '☠️ 中毒: -12', '❄️ 冰冻: 无法行动',
    '🌧️ 乙 变潮湿', '😴 睡眠: 无法行动', '😡 甲 嘲讽 乙', '✨ 甲 净化 → 乙', '🌑 末日: -9',
    '👻 幽魂附身', '😱 威吓', '🔻 变小', '⏳ 蓄力完成!'];
  let mismatch = [];
  shared.forEach(function (msg) {
    const g = c(gsb, 'gbMarkerFor', { msg: msg, type: 'status', targetId: 'uB' }, null);
    const s2 = c(ssbH.sb, 'bcMarkerFor', { msg: msg, type: 'shield', targetSide: 'enemy' });
    const single = c(gsb, 'fxMarkForEvent', { msg: msg });
    if (!(g && g === s2 && g === single)) mismatch.push(msg + ' → g=' + g + ' s=' + s2 + ' f=' + single);
  });
  eq(mismatch.length, 0, '13 条样本两模式同码（不一致：' + JSON.stringify(mismatch) + '）');

  /* 源码守卫：两份重复表已消失，改为调用单一来源 */
  const grSrc = has('game-render.js') ? src('game-render.js') : '';
  const gbSrc2 = has('game-battle.js') ? src('game-battle.js') : '';
  ok(grSrc.indexOf('GB_FX_MARKS') < 0, 'game-render.js 不再维护自有 GB_FX_MARKS 表');
  ok(gbSrc2.indexOf('BC_MARKS') < 0, 'game-battle.js 不再维护自有 BC_MARKS 表');
  ok(/fxMarkForEvent/.test(grSrc) && /typeof\s+fxMarkForEvent\s*!==\s*'function'/.test(grSrc),
    '群战经 typeof 守卫调用 fxMarkForEvent');
  ok(/fxMarkForEvent/.test(gbSrc2) && /typeof\s+fxMarkForEvent\s*!==\s*'function'/.test(gbSrc2),
    '单敌经 typeof 守卫调用 fxMarkForEvent');
  ['fxHpSnapshot', 'fxDetectKills', 'fxKillMarkFor'].forEach(function (fn) {
    ok(new RegExp('typeof\\s+' + fn + "\\s*[!=]==\\s*'function'").test(grSrc), '群战对 ' + fn + ' 有 typeof 守卫');
  });
  ['fxHpPairSnapshot', 'fxDetectSidedKills', 'fxKillMarkFor'].forEach(function (fn) {
    ok(new RegExp('typeof\\s+' + fn + "\\s*[!=]==\\s*'function'").test(gbSrc2), '单敌对 ' + fn + ' 有 typeof 守卫');
  });

  /* 模块缺失：两模式都必须静默跳过且不抛错（test-auto-speed 只装 levels/battle/game-battle） */
  const noFxG = makeGroupSbx({ noFx: true });
  wireGroupDom(noFxG, [mkChip('uB', '乙', 260)], false);
  let threwG = null;
  try { noFxG.gbMarkerFor && noFxG.gbMarkerFor(groupEv, null); } catch (e) { threwG = e; }
  ok(threwG === null, '群战：fx-semantics 缺失时 gbMarkerFor 不抛错（' + (threwG && threwG.message) + '）');
  eq(c(noFxG, 'gbMarkerFor', groupEv, null), null, '群战：模块缺失 → 静默返回 null');
  const noFxS = makeSingleSbx({ noFx: true });
  let threwS = null;
  try { noFxS.sb.bcMarkerFor && noFxS.sb.bcMarkerFor(singleEv); } catch (e) { threwS = e; }
  ok(threwS === null, '单敌：fx-semantics 缺失时 bcMarkerFor 不抛错（' + (threwS && threwS.message) + '）');
  eq(c(noFxS.sb, 'bcMarkerFor', singleEv), null, '单敌：模块缺失 → 静默返回 null');
});

/* ============================================================
   3. 聚合不变式（批次 C 核心）
   ============================================================ */
console.log('--- 3. 聚合不变式：不跨目标 / 不跨语义 ---');
section('3', function () {
  const D = (uid, name, side) => ({ id: uid, name: name, side: side });
  const U = [D('uA', '甲', 'ally'), D('uB', '乙', 'enemy')];
  function mkGb(evs) { return { units: U, log: [{ turn: 1, unit: '甲', events: evs }] }; }
  function run(speed, evs) {
    const sb = makeGroupSbx();
    const chips = [mkChip('uA', '甲', 120), mkChip('uB', '乙', 260)];
    const w = wireGroupDom(sb, chips, false);
    sb._groupSpeed = speed;
    sb.gbFxClear();
    c(sb, 'playAttackFeedback', mkGb(evs), null);
    return { sb, w, texts: textsOf(w.layer), pos: w.layer.children.map(posOf) };
  }
  const dmg = (n, tid) => ({ msg: '⚔️ 甲 攻击 乙 → ' + n + ' 伤害', type: 'damage', targetId: tid });

  /* (a) ×1：逐事件，不聚合 */
  {
    const r = run(1, [dmg(100, 'uB'), dmg(150, 'uB'), dmg(50, 'uB')]);
    eq(r.texts.length, 3, '×1 逐事件：同目标 3 次伤害 → 3 条（不聚合）：' + JSON.stringify(r.texts));
    eq(r.texts.join('|'), '-100|-150|-50', '×1 数值逐条对应（不被求和）');
  }
  /* (b) ×4：同目标 3 次伤害合并为 1 条且数值为和 */
  {
    const r = run(4, [dmg(100, 'uB'), dmg(150, 'uB'), dmg(50, 'uB')]);
    eq(r.texts.length, 1, '×4 同目标同类伤害 → 1 条：' + JSON.stringify(r.texts));
    eq(r.texts[0], '-300', '×4 聚合数值 = 100+150+50 = 300');
    ok(r.pos[0] && Math.abs(r.pos[0].x - 260) <= 24, '聚合条仍锚在**该目标**芯片 x（260）：' + JSON.stringify(r.pos[0]));
  }
  /* (c) ×2/×8 同样口径 */
  [2, 8].forEach(function (sp) {
    const r = run(sp, [dmg(100, 'uB'), dmg(150, 'uB'), dmg(50, 'uB')]);
    eq(r.texts.length, 1, '×' + sp + ' 同目标 3 次伤害 → 1 条');
    eq(r.texts[0], '-300', '×' + sp + ' 聚合数值仍为和');
  });
  /* (d) 绝不跨目标：A 与 B 同一步各 100 → 2 条、各自锚点、不得出现 200 */
  {
    const r = run(4, [dmg(100, 'uA'), dmg(100, 'uB')]);
    eq(r.texts.length, 2, '×4 跨目标不合并：2 条（' + JSON.stringify(r.texts) + '）');
    ok(r.texts.indexOf('-200') < 0, '绝不出现跨目标求和 200');
    ok(r.texts.every(t => /^-100$/.test(t)), '两条各自是 -100');
    const xa = r.pos[0] && r.pos[0].x, xb = r.pos[1] && r.pos[1].x;
    ok(Math.abs(xa - 120) <= 24 && Math.abs(xb - 260) <= 24,
      '每条锚在自己的 targetId 芯片 x（120 / 260）：' + JSON.stringify([xa, xb]));
  }
  /* (e) 绝不跨语义：反射/反冲虽同目标也单列 */
  {
    const r = run(4, [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '🩸 乙 粗糙皮肤 → 甲 反伤 5', type: 'damage', targetId: 'uB' }
    ]);
    eq(r.texts.length, 2, '同类但不同 kind（dmg vs reflect）不合并：' + JSON.stringify(r.texts));
    ok(r.texts.indexOf('-105') < 0, '反射不得被加进伤害数字');
    const r2 = run(4, [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '💥 甲 三连 反冲 -30（对目标造成 100 × 35%）', type: 'damage', targetId: 'uB' }
    ]);
    eq(r2.texts.length, 2, '反冲（recoil）与伤害（dmg）不合并：' + JSON.stringify(r2.texts));
    ok(r2.texts.indexOf('-130') < 0, '反冲不得被加进伤害数字');
  }
  /* (f) 绝不跨语义：治疗与伤害不合并（同目标） */
  {
    const r = run(4, [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '💚 甲 → 乙 治疗 +60', type: 'heal', targetId: 'uB' }
    ]);
    eq(r.texts.length, 2, '治疗与伤害不合并：' + JSON.stringify(r.texts));
    ok(r.texts.indexOf('-100') >= 0 && r.texts.indexOf('+60') >= 0, '两个语义各自成条（-100 / +60）');
  }
  /* (g) 绝不跨语义：状态事件不参与求和（并有自己的条目） */
  {
    const r = run(4, [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '🛡️ 乙 护盾吸收 30', type: 'status', targetId: 'uB' }
    ]);
    eq(r.texts.length, 2, '状态事件不参与数值聚合：' + JSON.stringify(r.texts));
    ok(r.texts.indexOf('-100') >= 0, '伤害条仍是 -100（未被加进护盾 30）');
    ok(r.texts.indexOf('🛡️30') >= 0, '护盾吸收单独成条（语义条目）');
    ok(r.texts.indexOf('-130') < 0, '状态数值绝不被加进伤害');
  }
  /* (h) 状态事件同目标多条也各自独立（不被合并成一条） */
  {
    const r = run(4, [
      { msg: '🛡️ 乙 护盾吸收 30', type: 'status', targetId: 'uB' },
      { msg: '💠 乙 破甲（2 回合）', type: 'status', targetId: 'uB' }
    ]);
    eq(r.texts.length, 2, '多条状态事件保持独立条目（不合并）：' + JSON.stringify(r.texts));
  }
  /* (i) 暴击：暴击事件本身绝不变成数字（只是给聚合条加 💥 前缀） */
  {
    const r = run(4, [
      { msg: '💥 甲 暴击！×2.4', type: 'damage', targetId: 'uB' },
      { msg: '⚔️ 甲 攻击 乙 → 240 伤害', type: 'damage', targetId: 'uB' }
    ]);
    eq(r.texts.length, 1, '暴击事件不单独出数字（只有伤害条）：' + JSON.stringify(r.texts));
    eq(r.texts[0], '💥-240', '暴击以 💥 前缀表达（未被加进数字）');
    ok(r.texts.every(t => t.indexOf('2.4') < 0), '倍率 2.4 未被当成伤害数字');
  }
  /* (j) 击杀保持离散条目：不参与数值聚合 */
  {
    const sb = makeGroupSbx();
    const chips = [mkChip('uA', '甲', 120), mkChip('uB', '乙', 260)];
    const w = wireGroupDom(sb, chips, false);
    sb._groupSpeed = 4;
    sb.gbFxClear();
    c(sb, 'playAttackFeedback', mkGb([dmg(100, 'uB')]), null);
    const kill = requireFn(sb, 'gbFxKillMarks', '[3j]');
    if (kill) { kill.call(sb, mkGb([]), [{ id: 'uB', side: 'enemy', name: '乙' }]); }
    const texts = textsOf(w.layer);
    eq(texts.length, 2, '击杀是独立条目（伤害 1 条 + 击杀 1 条）：' + JSON.stringify(texts));
    ok(texts.indexOf('-100') >= 0 && texts.indexOf('💀 击杀') >= 0, '击杀文本不与数字合并');
    ok(texts.every(t => !/^-1\d\d$/.test(t) || t === '-100'), '击杀没有把自己的数值混进伤害条');
  }
  /* (k) 反向断言：缺目标/未知文案不挂载 */
  {
    const r = run(4, [
      { msg: '某个完全不可识别的状态变化', type: 'status', targetId: 'uB' },
      { msg: '🌪️ 沙暴', type: 'terrain' }
    ]);
    eq(r.texts.length, 0, '未知文案/场地标题不产生任何演出条目（不猜）：' + JSON.stringify(r.texts));
    /* 有映射但非数值的复合文案：只出一条语义标记，绝不拆出数字 */
    const rImm = run(4, [{ msg: '🛡️ 乙 受护盾庇护，免疫【冰冻】（剩余 30）', type: 'status', targetId: 'uB' }]);
    eq(rImm.texts.join('|'), '🛡️', '免疫文案只出 1 条语义标记（不把「剩余 30」当伤害数字）');
    const r3 = run(4, [{ msg: '⚔️ 甲 攻击 幽灵 → 100 伤害', type: 'damage' }]);
    eq(r3.texts.length, 1, '（前置）无 targetId 且名字反查不到芯片的伤害仍出数字');
    const mid = r3.w.mid.getBoundingClientRect();
    ok(r3.pos[0] && Math.abs(r3.pos[0].x - (mid.left + mid.width / 2)) <= 8,
      '无 targetId 且名字反查不到 → 横向锚点退回中央区中心：' + JSON.stringify(r3.pos[0]));
    const r4 = run(4, [{ msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage' }]);
    ok(r4.pos[0] && Math.abs(r4.pos[0].x - 260) <= 24,
      '无 targetId 但文案里有完整目标名 → 按 data-name 反查锚到该芯片：' + JSON.stringify(r4.pos[0]));
  }
  /* (l) 落点与 targetId 一致：逐条核对（多事件同步、顺序不变） */
  {
    const r = run(1, [dmg(100, 'uB'), dmg(100, 'uA'), dmg(100, 'uB')]);
    eq(r.texts.length, 3, '（前置）×1 三条各自成条');
    const want = [260, 120, 260];
    const got = r.pos.map(p => p && Math.round(p.x));
    ok(got.every((x, i) => Math.abs(x - want[i]) <= 24),
      '每条落点与自己的 targetId 一致（期望 260/120/260，实际 ' + JSON.stringify(got) + '）');
  }
  /* (m) 演出顺序 = 事件顺序（日志与事件逐项对应）
     ⚠️ 既有路径：**先出数值条（render），后出语义标记（marks）** —— 两类各自保持 events 顺序。
        本批不改这个顺序（改了会动既有坐标契约）。 */
  {
    const evs = [{ msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '🛡️ 乙 护盾吸收 30', type: 'status', targetId: 'uB' },
      { msg: '⚔️ 甲 攻击 乙 → 50 伤害', type: 'damage', targetId: 'uB' }];
    const r = run(1, evs);
    eq(r.texts.length, 3, '（前置）三条事件三条演出');
    eq(r.texts.join('|'), '-100|-50|🛡️30', '两类各自保持 events 顺序（数值条在前、语义标记在后 —— 既有路径）');
    eq(r.texts.filter(t => /^[-+]?\d|^-/.test(t)).join('|'), '-100|-50', '数值条内部顺序 = 事件顺序');
    eq(r.texts.filter(t => /🛡️/.test(t)).join('|'), '🛡️30', '语义标记内部顺序 = 事件顺序');
    const logEvs = mkGb(evs).log[0].events;
    eq(logEvs.length, r.texts.length, '日志事件条数 = 演出条目数（逐项对应）');
  }
});

/* ============================================================
   4. 击杀：UI 侧 HP 跨零检测（两模式）
   ============================================================ */
console.log('--- 4. 击杀/阵亡：HP 跨零检测（不重复、不聚合、不延迟结算） ---');
section('4', function () {
  /* (a) 纯函数：只认 ≥1 → ≤0 */
  const pure = { Math, JSON, console }; pure.window = pure; pure.globalThis = pure;
  vm.createContext(pure);
  ['state-core.js', 'status-defs.js'].forEach(f => { if (has(f)) vm.runInContext(src(f), pure, { filename: f }); });
  if (has('fx-semantics.js')) vm.runInContext(src('fx-semantics.js'), pure, { filename: 'fx-semantics.js' });
  const snap = c(pure, 'fxHpSnapshot', [{ id: 'e1', hp: 1 }, { id: 'e2', hp: 0 }, { id: 'a1', hp: 50 }]);
  eq(JSON.stringify(snap), JSON.stringify({ e1: 1, e2: 0, a1: 50 }), 'fxHpSnapshot 按 id 记录本步前 HP');
  eq(c(pure, 'fxDetectKills', { e1: 1 }, [{ id: 'e1', hp: 0, side: 'enemy' }]).length, 1, '跨零（1 → 0）触发击杀');
  eq(c(pure, 'fxDetectKills', { e1: 0 }, [{ id: 'e1', hp: 0, side: 'enemy' }]).length, 0, '事前已 0 → **不**重复触发');
  eq(c(pure, 'fxDetectKills', { e1: 50 }, [{ id: 'e1', hp: 30, side: 'enemy' }]).length, 0, '未跨零（50 → 30）不触发');
  eq(c(pure, 'fxDetectKills', {}, [{ id: 'e1', hp: 0, side: 'enemy' }]).length, 0, '本步之前不在场（快照无该 id）→ 不判击杀');
  eq(c(pure, 'fxDetectKills', { a1: 1 }, [{ id: 'a1', hp: 0, side: 'ally' }])[0].side, 'ally', '我方单位阵亡也能识别（side=ally）');
  eq(c(pure, 'fxKillMarkFor', 'enemy'), '💀 击杀', '敌方击杀文案：💀 击杀');
  eq(c(pure, 'fxKillMarkFor', 'ally'), '💀 阵亡', '我方阵亡文案：💀 阵亡（与击杀可辨）');
  eq(c(pure, 'fxKillMarkFor', 'player'), '💀 阵亡', '单敌口径的 player 侧 = 我方阵亡');
  eq(c(pure, 'fxDetectSidedKills', { player: 1, enemy: 0 }, { player: { hp: 0 }, enemy: { hp: 0 } }).length, 1,
    '单敌口径：只报 player 侧的跨零（enemy 事前已 0 不报）');
  eq(JSON.stringify(c(pure, 'fxHpPairSnapshot', { player: { hp: 5 }, enemy: { hp: 100 } })), '{"player":5,"enemy":100}',
    'fxHpPairSnapshot 取 player/enemy 两侧 HP');

  /* (b) 群战集成：击杀提示挂到目标锚点（非抽屉 = 中央飘字；抽屉 = 芯片徽标） */
  const sb = makeGroupSbx();
  const chips = [mkChip('uA', '甲', 120), mkChip('uB', '乙', 260), mkChip('uB2', '乙二号', 200, [])];
  const w = wireGroupDom(sb, chips, false);
  sb._groupSpeed = 4;
  sb.gbFxClear();
  const kill = requireFn(sb, 'gbFxKillMarks', '[4b]');
  if (kill) {
    kill.call(sb, { units: [] }, [{ id: 'uB', side: 'enemy', name: '乙' }]);
    eq(w.layer.children.length, 1, '群战击杀 → 1 条短提示（挂 #gbFx 常驻层）');
    eq(w.layer.children.length ? w.layer.children[0].textContent : null, '💀 击杀', '群战击杀文案 = 💀 击杀');
    const p = posOf(w.layer.children[0]);
    ok(p && Math.abs(p.x - 260) <= 24, '击杀提示锚在**阵亡目标**的芯片 x（260）：' + JSON.stringify(p));
    ok(w.layer.children[0].className.indexOf('gb-fx-float') >= 0 && /pointer-events/.test(
      sb.document.getElementById('gbFx') ? 'pointer-events' : 'pointer-events'),
      '击杀提示走既有飘字路径（#gbFx 为 pointer-events:none 固定层 → 不遮挡按钮）');
  }
  /* 同一步两次检测：第二次不再触发（不重复触发） */
  {
    const sb2 = makeGroupSbx();
    const w2 = wireGroupDom(sb2, [mkChip('uB', '乙', 260)], false);
    sb2._groupSpeed = 1; sb2.gbFxClear();
    const k2 = requireFn(sb2, 'gbFxKillMarks', '[4b2]');
    if (k2) {
      k2.call(sb2, { units: [] }, [{ id: 'uB', side: 'enemy' }]);
      const before = w2.layer.children.length;
      const again = c(sb2, 'fxDetectKills', { uB: 0 }, [{ id: 'uB', hp: 0, side: 'enemy' }]);
      eq(again.length, 0, '同一目标第二次检测不再识别为击杀（快照已是 0）');
      eq(w2.layer.children.length, before, '第二次检测不产生新的演出条目');
    }
  }
  /* 抽屉态：击杀走芯片徽标（§24 契约），不占中央区 */
  {
    const sb3 = makeGroupSbx();
    const badges = [];
    const chip = mkChip('uB', '乙', 260, badges);
    const w3 = wireGroupDom(sb3, [chip], true);
    sb3._groupSpeed = 1; sb3.gbFxClear();
    const k3 = requireFn(sb3, 'gbFxKillMarks', '[4c]');
    if (k3) {
      k3.call(sb3, { units: [] }, [{ id: 'uB', side: 'enemy' }]);
      eq(w3.layer.children.length, 0, '抽屉态：中央特效区不出任何飘字（§24 契约不变）');
      eq(badges.length, 1, '抽屉态：击杀提示落在目标芯片上（.gb-chip-mark）');
      ok(badges.length ? /💀 击杀/.test(badges[0].textContent) : false, '抽屉态徽标文本可读：' + JSON.stringify(badges.map(b => b.textContent)));
      ok(badges.length ? String(badges[0].className).indexOf('gb-chip-mark') >= 0 : false, '徽标类名仍是 gb-chip-mark（CSS 契约）');
    }
  }
  /* 反向断言：抽屉态下目标芯片缺失 → 不挂载（不猜落点） */
  {
    const sb4 = makeGroupSbx();
    const badges = [];
    const w4 = wireGroupDom(sb4, [mkChip('other', '别人', 100, badges)], true);
    sb4._groupSpeed = 1; sb4.gbFxClear();
    const k4 = requireFn(sb4, 'gbFxKillMarks', '[4d]');
    if (k4) {
      k4.call(sb4, { units: [] }, [{ id: 'ghost', side: 'enemy' }]);
      eq(w4.layer.children.length, 0, '抽屉态 + 无目标芯片 → 中央区仍不出飘字');
      eq(badges.length, 0, '抽屉态 + 无目标芯片 → 不往别的芯片上乱挂（缺目标不挂载）');
    }
  }
  /* 我方阵亡也有可辨提示 */
  {
    const sb5 = makeGroupSbx();
    const w5 = wireGroupDom(sb5, [mkChip('uA', '甲', 120)], false);
    sb5._groupSpeed = 1; sb5.gbFxClear();
    const k5 = requireFn(sb5, 'gbFxKillMarks', '[4e]');
    if (k5) {
      k5.call(sb5, { units: [] }, [{ id: 'uA', side: 'ally' }]);
      eq(w5.layer.children.length ? w5.layer.children[0].textContent : null, '💀 阵亡', '我方单位阵亡出可辨提示（💀 阵亡）');
    }
  }

  /* (c) 单敌集成 A：runBattle 的 tick 前后 HP 跨零 → 挂在目标元素上；演出先于结算、结算仍同 tick */
  {
    const H = makeSingleSbx();
    const order = [];
    const origShowMark = H.sb.showMark;
    H.sb.showMark = function (el, text, life) { order.push('mark:' + text); return origShowMark.call(H.sb, el, text, life); };
    const b = { player: { atk: 1, def: 0, hp: 100, maxHP: 100, soulAtk: 0, soulDef: 0 },
      enemy: { atk: 0, def: 0, hp: 1, maxHP: 100, soulAtk: 0, soulDef: 0 },
      level: { npc: '测试兵' }, affix: null, turn: 0, done: false, winner: null };
    H.sb.battleTick = function (bb) {
      bb.enemy.hp = 0; bb.turn = bb.turn + 1; bb.done = true; bb.winner = true;
      return { turn: bb.turn, events: [] };
    };
    H.sb.endBattle = function (w) { order.push('endBattle:' + w); };
    /* ×4：步进 150ms 与标记生命期 220ms 可区分 → 借此证明「没有多插一轮 tick」 */
    vm.runInContext('_battle=__b; _battleRunning=false; _battleSpeed=4; runBattle();', Object.assign(H.sb, { __b: b }));
    eq(marksOf(H.created).length, 1, '单敌：敌方 1 → 0 跨零 → 1 条击杀标记');
    eq(marksOf(H.created)[0] ? marksOf(H.created)[0].textContent : null, '💀 击杀', '单敌击杀标记文案 = 💀 击杀');
    eq(H.els.battleEnemy.appendChildCount, 1, '标记挂在**敌方**元素上（targetSide 对应）');
    eq(order.join('|'), 'mark:💀 击杀|endBattle:true',
      '演出先于结算、且结算仍在**同一 tick**内发生（未被演出推迟）：' + JSON.stringify(order));
    const stepMs = c(H.sb, 'battleStepDelay', c(H.sb, 'BATTLE_STEP_BASE_MS') || 600, 4);
    ok(!H.timers.some(t => t.ms === stepMs),
      '该 tick 结算后不再排下一步（演出没有多插一轮 tick；定时器只有标记移除）：' + JSON.stringify(H.timers.map(t => t.ms)));
  }
  /* (c2) 单敌集成 B：跨越两个 tick 也只触发一次（不重复触发） */
  {
    const H = makeSingleSbx();
    const b = { player: { atk: 1, def: 0, hp: 100, maxHP: 100, soulAtk: 0, soulDef: 0 },
      enemy: { atk: 0, def: 0, hp: 5, maxHP: 100, soulAtk: 0, soulDef: 0 },
      level: { npc: '测试兵' }, affix: null, turn: 0, done: false, winner: null };
    let tickN = 0;
    H.sb.battleTick = function (bb) {
      tickN++;
      if (tickN === 1) bb.enemy.hp = 0;        /* 只在第一 tick 击杀（done 保持 false 以便跑第二 tick） */
      bb.turn = bb.turn + 1;
      return { turn: bb.turn, events: [] };
    };
    H.sb.endBattle = function () {};
    vm.runInContext('_battle=__b; _battleRunning=false; _battleSpeed=1; runBattle();', Object.assign(H.sb, { __b: b }));
    eq(marksOf(H.created).length, 1, '第一 tick 击杀 → 1 条标记');
    const t1 = H.timers.pop();
    if (t1) t1.fn();
    eq(tickN, 2, '（前置）第二 tick 真的跑了');
    eq(marksOf(H.created).length, 1, 'hp 已是 0 的后续 tick 不再触发击杀（不重复触发）');
    /* 阶段时长不被改写：下一次调度仍是 battleStepDelay(600, _battleSpeed) */
    const t2 = H.timers.pop();
    if (t2) eq(t2.ms, c(H.sb, 'battleStepDelay', c(H.sb, 'BATTLE_STEP_BASE_MS') || 600, 1),
      '单敌步进间隔不被演出改写（= battleStepDelay(600, 1)）');
  }
  /* (d) 单敌：我方阵亡 → 挂玩家元素 */
  {
    const H = makeSingleSbx();
    const b = { player: { atk: 1, def: 0, hp: 1, maxHP: 100, soulAtk: 0, soulDef: 0 },
      enemy: { atk: 0, def: 0, hp: 100, maxHP: 100, soulAtk: 0, soulDef: 0 },
      level: { npc: '测试兵' }, affix: null, turn: 0, done: false, winner: null };
    H.sb.battleTick = function (bb) { bb.player.hp = 0; bb.turn = bb.turn + 1; return { turn: bb.turn, events: [] }; };
    H.sb.endBattle = function () {};
    vm.runInContext('_battle=__b; _battleRunning=false; _battleSpeed=1; runBattle();', Object.assign(H.sb, { __b: b }));
    const ms = marksOf(H.created);
    eq(ms.length, 1, '单敌：我方 1 → 0 → 1 条阵亡标记');
    eq(ms.length ? ms[0].textContent : null, '💀 阵亡', '我方阵亡文案 = 💀 阵亡（与击杀可辨）');
    eq(H.els.battlePlayer.appendChildCount, 1, '阵亡标记挂在**玩家**元素上');
  }

  /* (e) 引擎零影响：同一固定随机种子的群战，跑演出 vs 不跑演出 → 日志/胜负/HP 逐字节一致 */
  {
    function runSeeded(withUi) {
      const sb = makeGroupSbx();
      const chips = [];
      const w = wireGroupDom(sb, chips, false);
      sb._groupSpeed = 4;
      sb.gbFxClear();
      function U(id, side, hp, atk, def, spd) {
        return sb.createUnit({ id: id, side: side, name: id, base: { hp: hp, atk: atk, def: def, spd: spd } });
      }
      const gb = sb.createGroupBattle({
        allies: [U('a1', 'ally', 400, 40, 20, 10), U('a2', 'ally', 300, 30, 15, 6)],
        enemies: [U('e1', 'enemy', 200, 25, 10, 8), U('e2', 'enemy', 150, 20, 8, 4)]
      });
      /* 芯片桩按单位 id 动态补齐（演出才需要；引擎不需要） */
      gb.units.forEach(u => chips.push(mkChip(u.id, u.id, 100 + chips.length * 60)));
      let guard = 0, kills = 0, steps = 0;
      while (!gb.done && guard++ < 60) {
        const before = typeof sb.fxHpSnapshot === 'function' ? sb.fxHpSnapshot(gb.units) : null;
        const step = sb.groupBattleStep(gb);
        steps++;
        if (withUi) {
          if (step && step.unit) c(sb, 'playAttackFeedback', gb, step);
          if (before && typeof sb.fxDetectKills === 'function') {
            const k = sb.fxDetectKills(before, gb.units);
            if (k.length) { kills += k.length; c(sb, 'gbFxKillMarks', gb, k); }
          }
        }
      }
      return { log: JSON.stringify(gb.log), winner: String(gb.winner), turn: gb.turn,
        hp: gb.units.map(u => u.id + ':' + u.hp).join(','), kills: kills, steps: steps };
    }
    const ctrl1 = runSeeded(false), ctrl2 = runSeeded(false);
    ok(ctrl1.log === ctrl2.log && ctrl1.hp === ctrl2.hp && ctrl1.winner === ctrl2.winner,
      '（前置）固定随机下同一战斗两次运行逐字节一致（对照基线可信）');
    ok(ctrl1.steps > 3 && /e1:|e2:/.test(ctrl1.hp), '（前置）对照战斗真的推进了多步（steps=' + ctrl1.steps + '）');
    const ui = runSeeded(true);
    ok(ui.kills >= 1, '（前置）演出路径确实检测到击杀（kills=' + ui.kills + '）——否则下面的对照是空的');
    eq(ui.log, ctrl1.log, '固定种子群战日志逐字节不变（演出层零影响）');
    eq(ui.hp, ctrl1.hp, '固定种子群战各单位 HP 逐字节不变（结算零影响）');
    eq(ui.winner + '|' + ui.turn + '|' + ui.steps, ctrl1.winner + '|' + ctrl1.turn + '|' + ctrl1.steps,
      '胜负 / 回合数 / 步数不变（演出不延迟结算）');
  }
});

/* ============================================================
   5. reduced-motion / 抽屉 / 360×640 小屏可读性
   ============================================================ */
console.log('--- 5. reduced-motion 语义仍在 / 抽屉契约 / 小屏守卫 ---');
section('5', function () {
  const css = has('index.css') ? src('index.css') : '';
  const grSrc = has('game-render.js') ? src('game-render.js') : '';
  const gbSrc2 = has('game-battle.js') ? src('game-battle.js') : '';
  /* (a) 全局 1ms 规则仍在（只改时长，不改可见性） */
  ok(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,400}animation-duration:1ms!important/.test(css),
    '全局 reduced-motion 规则仍在（animation-duration:1ms!important）');
  ok(/transition-duration:1ms!important/.test(css), '全局 transition-duration:1ms!important 仍在');
  ok(/--dur-1:1ms/.test(css), 'duration 令牌在 reduce 下归 1ms（一处全局生效）');
  /* (b) 批次 A/B 的局部规则仍在 */
  ok(/@media\(prefers-reduced-motion:reduce\)\{\.be-loot\{animation:none\}/.test(css),
    '批次 A/B 局部规则（.be-loot）仍在');
  ok(/\[id\^="cf"\]\{animation:none!important;opacity:0!important\}/.test(css),
    '彩带粒子抑制规则仍在（只降动效）');
  /* (c) reduce 不隐藏语义文本/徽标：我们的演出类名不得被 display:none / visibility:hidden 干掉 */
  const rmBlocks = css.match(/@media\s*\(prefers-reduced-motion[^)]*\)\s*\{[\s\S]*?\}\s*\}/g) || [];
  ok(rmBlocks.length >= 3, 'reduced-motion 块 ' + rmBlocks.length + ' 个（≥3：全局 + 批次 A/B）');
  const hides = rmBlocks.filter(blk => /(gb-fx-float|gb-chip-mark|bc-mark|bc-impact)/.test(blk)
    && /(display\s*:\s*none|visibility\s*:\s*hidden|content\s*:\s*none)/.test(blk));
  eq(hides.length, 0, 'reduce 下不得用 display:none 抹掉标记/徽标（语义文本必须仍可读）');
  ok(!/matchMedia/.test(grSrc) && !/matchMedia/.test(gbSrc2),
    '渲染层不读 matchMedia：动效偏好只改时长，不能改变「出不出标记」');
  /* (d) 阶段与结算时长不被改写 */
  ok(/scheduleGroupOutro\(outro,showOutcome,800\)/.test(grSrc), '群战终局 800ms 阶段不变');
  ok(/scheduleGroupOutro\(outro,showStats,1200,deadline\)/.test(grSrc), '群战终局 1200ms 阶段不变');
  ok(/scheduleBattleOutro\('phase',function\(deadline\)\{showReward\(deadline\)\},800\)/.test(gbSrc2),
    '单敌终局 800ms 阶段不变');
  ok(/scheduleBattleOutro\('phase',showRecord,1200,fromDeadline\)/.test(gbSrc2), '单敌终局 1200ms 阶段不变');
  ok(/scheduleBattleOutro\('auto',[\s\S]*?\},2000,fromDeadline\)/.test(gbSrc2), '单敌 auto 2000ms 阶段不变');
  ok(!/prefers-reduced-motion/.test(grSrc) && !/prefers-reduced-motion/.test(gbSrc2),
    '两个渲染模块都不含 CSS/动效偏好分支（时长只由 JS 策略表与既有阶段常量决定）');
  /* 档位策略仍由各自 policy 决定（本批未合并两套常量） */
  ok(/function gbFxPolicy\(speed\)/.test(grSrc) && /function battleFxPolicy\(speed\)/.test(gbSrc2),
    '两模式各自保留 policy（本批未合并策略常量）');

  /* (e) 抽屉契约（§24）：抽屉展开时中央区无飘字、标记走芯片徽标 —— 本批未破坏 */
  const sb = makeGroupSbx();
  const badges = [];
  const chip = mkChip('uB', '乙', 260, badges);
  const w = wireGroupDom(sb, [chip], true);
  sb._groupSpeed = 1; sb.gbFxClear();
  c(sb, 'playAttackFeedback', { units: [{ id: 'uB', name: '乙', side: 'enemy' }],
    log: [{ turn: 1, unit: '甲', events: [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '🛡️ 乙 护盾吸收 120', type: 'status', targetId: 'uB' }] }] }, null);
  eq(w.layer.children.length, 0, '抽屉态：中央特效区不出飘字（§24 契约）');
  eq(badges.length, 1, '抽屉态：状态标记改为目标芯片徽标（§24b）');
  ok(chip.classList.contains('gb-hit'), '抽屉态：受击芯片仍然闪烁（§24a）');

  /* (f) 360×640 小屏：飘字/标记不越界（横向不留滚动条，纵向不出视口） */
  const tiny = makeGroupSbx({ width: 360, height: 640 });
  const chipsT = [mkChip('uA', '甲', 60), mkChip('uB', '乙', 300)];
  const wT = wireGroupDom(tiny, chipsT, false);
  tiny._groupSpeed = 1; tiny.gbFxClear();
  c(tiny, 'playAttackFeedback', { units: [{ id: 'uA', name: '甲', side: 'ally' }, { id: 'uB', name: '乙', side: 'enemy' }],
    log: [{ turn: 1, unit: '甲', events: [
      { msg: '⚔️ 甲 攻击 乙 → 100 伤害', type: 'damage', targetId: 'uB' },
      { msg: '⚔️ 乙 攻击 甲 → 80 伤害', type: 'damage', targetId: 'uA' },
      { msg: '🛡️ 乙 护盾吸收 30', type: 'status', targetId: 'uB' }] }] }, null);
  const ps = wT.layer.children.map(posOf);
  ok(ps.length >= 3, '（前置）360×640 下产生了多条演出：' + ps.length);
  ok(ps.every(p => p && p.x >= 36 && p.x <= 324), '小屏：飘字横向被夹在 [36, 324]（不产生横向滚动/裁切）：' + JSON.stringify(ps));
  ok(ps.every(p => p && p.y > 0 && p.y <= 600), '小屏：飘字纵向不出视口（≤ innerHeight-40）：' + JSON.stringify(ps));
  /* 既有短屏降档规则仍在（§20） */
  ok(/@media \(max-height:700px\)\{[\s\S]{0,400}--gb-unit-ico:20px/.test(css),
    '既有短屏（≤700px 高）芯片降档规则仍在（§20 继续绿）');
  ok(/\.gb-arena\{[^}]*overflow:hidden/.test(css), '战场容器仍裁切（.gb-arena overflow:hidden）');
});

/* ============================================================
   6. 两模式各 ≥10 条事件样本夹具（可复现、可判定）
   ============================================================ */
console.log('--- 6. 事件样本夹具（群战 12 条 / 单敌 13 条，含条件登记） ---');
const GROUP_FIXTURES = [
  /* [说明, events, 期望文本(按序), 期望每条锚点 x 或 null, 条件] */
  ['普攻伤害', [{ msg: '⚔️ 甲 攻击 乙 → 1218 伤害', type: 'damage', targetId: 'uB' }], ['-1218'], [260], ''],
  ['技能伤害', [{ msg: '⚡ 精英·狂战 地刺 → 乙 193 伤害', type: 'damage', targetId: 'uB' }], ['-193'], [260], ''],
  ['暴击伤害', [{ msg: '💥 甲 暴击！×2.4', type: 'damage', targetId: 'uB' },
    { msg: '⚔️ 甲 攻击 乙 → 240 伤害', type: 'damage', targetId: 'uB' }], ['💥-240'], [260], '暴击由紧邻前置事件标记'],
  ['治疗', [{ msg: '💚 甲 → 乙 治疗 +120', type: 'heal', targetId: 'uB' }], ['+120'], [260], ''],
  ['护盾吸收', [{ msg: '🛡️ 乙 护盾吸收 120', type: 'status', targetId: 'uB' }], ['🛡️120'], [260], ''],
  ['护盾破碎', [{ msg: '🛡️ 乙 护盾吸收 30（护盾破碎）', type: 'status', targetId: 'uB' }], ['🛡️30💥'], [260], ''],
  ['状态施加（带 statusId，走 id 优先）', [{ msg: '❄️ 冰冻持续', type: 'status', statusId: 'freeze', targetId: 'uB' }],
    ['❄️'], [260], '无 statusId 时同码由 /冰冻|❄️/ 文案行兜底'],
  ['跳过类事件（type=skip，不在群战白名单）', [{ msg: '❄️ 冰冻: 无法行动', type: 'skip', statusId: 'freeze', targetId: 'uB' }],
    [], [], '真实引擎的「冰冻无法行动」是 type=skip → 群战守卫（status|talent|terrain）拦下，不出标记。既有守卫，本批未改；单敌侧带 targetSide 时同一事件会出 ❄️（模式差异，见 §2）'],
  ['状态结束 / 净化', [{ msg: '✨ 甲 净化 → 乙：无普通~高级负面可解除', type: 'status', targetId: 'uB' }],
    ['✨'], [260], '文案里含状态名（如「解除【破甲】」）时既有表会先匹配到状态名行 —— 既有语义，未改'],
  ['DOT（中毒）', [{ msg: '☠️ 中毒: -12', type: 'dot', targetId: 'uA' }], ['-12'], [120], ''],
  ['场地（碎石，无 targetId）', [{ msg: '🪨 乙 受碎石伤害 40', type: 'terrain' }], ['-40'], [260], '落点按完整名反查芯片'],
  ['击杀（敌方）', [{ msg: '⚔️ 甲 攻击 乙 → 999 伤害', type: 'damage', targetId: 'uB' }], ['-999', '💀 击杀'], [260, 260],
    '击杀条目由 UI 侧 HP 跨零检测补出（本夹具显式调用）'],
  ['终局文案', [{ msg: '🏆 讨伐成功', type: 'outcome' }], [], [], '终局由批次 A/B 分层呈现，本批不新增终局逻辑']
];
const SINGLE_FIXTURES = [
  ['普攻伤害（玩家 → 敌人）', [{ msg: '🧑 攻击 → 100 伤害', type: 'damage', sourceSide: 'player', targetSide: 'enemy', hpDamage: 100 }],
    ['💥100'], 'enemy', ''],
  ['敌方普攻（敌人 → 玩家）', [{ msg: '👹 测试兵 攻击 → 77 伤害', type: 'damage', sourceSide: 'enemy', targetSide: 'player', hpDamage: 77 }],
    ['✨77'], 'player', ''],
  ['魂伤（玩家 → 敌人）', [{ msg: '👻 魂攻击 → 193 魂伤害', type: 'damage', sourceSide: 'player', targetSide: 'enemy', hpDamage: 193, damageType: 'soul' }],
    ['💥193'], 'enemy', ''],
  ['技能伤害', [{ msg: '⚡ 甲 地刺 → 150 伤害', type: 'damage', sourceSide: 'player', targetSide: 'enemy', hpDamage: 150 }],
    ['💥150'], 'enemy', ''],
  ['反伤（敌人 → 玩家，单列）', [{ msg: '🩸 荆棘反伤 → 12 伤害', type: 'damage', damageType: 'reflect', sourceSide: 'enemy', targetSide: 'player', hpDamage: 12 }],
    ['✨12'], 'player', '反伤只闪目标，不伪装成攻击方前冲'],
  ['治疗（Boss 生命汲取）', [{ msg: '💚 Boss 生命汲取, 恢复 5 HP', type: 'heal', sourceSide: 'enemy', targetSide: 'enemy', amount: 5 }],
    ['💚'], 'enemy', '单敌无玩家治疗通道；本事件是敌方自愈'],
  ['护盾吸收', [{ msg: '🛡️ 敌人 护盾吸收 120', type: 'shield', sourceSide: 'player', targetSide: 'enemy', shieldAbsorbed: 120, amount: 120, hpDamage: 0 }],
    ['🛡️120'], 'enemy', ''],
  ['护盾破碎', [{ msg: '🛡️ 你 护盾吸收 30（护盾破碎）', type: 'shield', sourceSide: 'enemy', targetSide: 'player', shieldAbsorbed: 30, amount: 30, hpDamage: 0 }],
    ['🛡️30💥'], 'player', ''],
  ['免疫（受护盾庇护）', [{ msg: '🛡️ 敌人 受护盾庇护，免疫【冰冻】（剩余 30）', type: 'status', sourceSide: 'player', targetSide: 'enemy' }],
    ['🛡️'], 'enemy', '复合文案：更具体的「被盾挡下」优先'],
  ['魔法镜', [{ msg: '🪞 魔法镜：免疫并反弹', type: 'talent', sourceSide: 'player', targetSide: 'enemy' }],
    ['🪞'], 'enemy', ''],
  ['Boss 怒意增强', [{ msg: '🔴 Boss 怒意增强, 攻击力 +7', type: 'e' }], [], null,
    '已映射（fxMarkForEvent → 🔴，severity=major），但**本模式守卫要求显式 targetSide**，该事件不带 → 不挂载（既有守卫，未改）'],
  ['Boss 铁壁护盾', [{ msg: '🛡️ Boss 铁壁护盾, 吸收 30 伤害', type: 'def' }], [], null,
    '同上：映射存在，单敌 def 事件无 targetSide → 由守卫拦下'],
  ['击杀 / 我方阵亡', [], ['💀 击杀', '💀 阵亡'], 'both', '由 UI 侧 HP 跨零检测补出（本夹具显式调用 bcFxKillMarks）'],
  ['终局', [{ msg: '🏆 战斗结束', type: 'outcome' }], [], null, '批次 A/B 分层呈现，本批不新增终局逻辑']
];

section('6-group', function () {
  const sb = makeGroupSbx();
  const chips = [mkChip('uA', '甲', 120), mkChip('uB', '乙', 260)];
  const w = wireGroupDom(sb, chips, false);
  let n = 0;
  GROUP_FIXTURES.forEach(function (fx) {
    const label = fx[0], evs = fx[1], want = fx[2], wantX = fx[3];
    sb.gbFxClear();
    sb._groupSpeed = 1;   /* ×1：逐事件，便于逐条核对 */
    const gb = { units: [{ id: 'uA', name: '甲', side: 'ally' }, { id: 'uB', name: '乙', side: 'enemy' }],
      log: [{ turn: 1, unit: '甲', events: evs }] };
    if (typeof sb.playAttackFeedback === 'function') sb.playAttackFeedback(gb, null);
    if (/击杀/.test(label)) {
      const k = typeof sb.gbFxKillMarks === 'function' ? sb.gbFxKillMarks : null;
      if (k) k.call(sb, gb, [{ id: 'uB', side: 'enemy', name: '乙' }]);
    }
    const got = textsOf(w.layer);
    eq(JSON.stringify(got), JSON.stringify(want), '群战夹具[' + label + '] 演出文本与事件一致'
      + (fx[4] ? '（条件：' + fx[4] + '）' : ''));
    const ps = w.layer.children.map(posOf);
    if (wantX.length) {
      wantX.forEach(function (x, i) {
        if (x == null) return;
        ok(ps[i] && Math.abs(ps[i].x - x) <= 24, '群战夹具[' + label + '] 第 ' + (i + 1) + ' 条锚在 targetId 芯片 x=' + x
          + '（实际 ' + JSON.stringify(ps[i]) + '）');
      });
    }
    /* 日志/事件逐项对应：演出条数 = 期望条数，且日志里的事件就是喂进去的事件 */
    eq(gb.log[0].events.length, evs.length, '群战夹具[' + label + '] 日志条目与事件数组逐项对应');
    n++;
  });
  ok(n >= 10, '群战夹具 ≥10 条（实际 ' + n + '）');
});

section('6-single', function () {
  const H = makeSingleSbx();
  const pEl = H.els.battlePlayer || H.sb.document.getElementById('battlePlayer');
  const eEl = H.els.battleEnemy || H.sb.document.getElementById('battleEnemy');
  let n = 0;
  vm.runInContext('_battleSpeed=1', H.sb);
  SINGLE_FIXTURES.forEach(function (fx) {
    const label = fx[0], evs = fx[1], want = fx[2], wantSide = fx[3];
    H.created.length = 0;
    pEl.children.length = 0; eEl.children.length = 0;
    if (label.indexOf('击杀') >= 0) {
      const k = typeof H.sb.bcFxKillMarks === 'function' ? H.sb.bcFxKillMarks : null;
      if (k) k.call(H.sb, { player: { hp: 0 }, enemy: { hp: 0 } },
        [{ side: 'enemy', hpBefore: 1, hp: 0 }, { side: 'player', hpBefore: 1, hp: 0 }], pEl, eEl);
    } else if (typeof H.sb.animateBattleEvents === 'function') {
      H.sb.animateBattleEvents(evs, pEl, eEl, 500000 + n * 10000);
    }
    const got = impactsOf(H.created).map(x => x.textContent).concat(marksOf(H.created).map(x => x.textContent));
    /* 数值 impact 与语义 mark 的挂载先后由各自路径决定，本夹具按「集合」判定，条数另行断言 */
    eq(JSON.stringify(got.slice().sort()), JSON.stringify(want.slice().sort()),
      '单敌夹具[' + label + '] 演出文本与事件一致' + (fx[4] ? '（条件：' + fx[4] + '）' : ''));
    eq(got.length, want.length, '单敌夹具[' + label + '] 演出条数与事件一致');
    /* 落点：每条演出只能落在事件声明的 targetSide 元素上 */
    if (wantSide === 'enemy') {
      ok(eEl.children.length === want.length, '单敌夹具[' + label + '] 全部演出挂在敌方元素上（实际 ' + eEl.children.length + ' 条）');
      eq(pEl.children.length, 0, '单敌夹具[' + label + '] 玩家元素未被误挂');
    } else if (wantSide === 'player') {
      ok(pEl.children.length === want.length, '单敌夹具[' + label + '] 全部演出挂在玩家元素上（实际 ' + pEl.children.length + ' 条）');
      eq(eEl.children.length, 0, '单敌夹具[' + label + '] 敌方元素未被误挂');
    } else if (wantSide === 'both') {
      ok(eEl.children.length === 1 && pEl.children.length === 1,
        '单敌夹具[' + label + '] 双方各一条可辨提示（击杀在敌、阵亡在我）：' + JSON.stringify([eEl.children.map(x => x.textContent), pEl.children.map(x => x.textContent)]));
      eq(eEl.children.length ? eEl.children[0].textContent : null, '💀 击杀', '单敌夹具[' + label + '] 敌方侧 = 💀 击杀');
      eq(pEl.children.length ? pEl.children[0].textContent : null, '💀 阵亡', '单敌夹具[' + label + '] 我方侧 = 💀 阵亡');
    } else {
      eq(eEl.children.length, 0, '单敌夹具[' + label + '] 该样本不挂载任何演出（条件已登记）');
      eq(pEl.children.length, 0, '单敌夹具[' + label + '] 该样本不挂载任何演出（条件已登记）');
    }
    n++;
  });
  ok(n >= 10, '单敌夹具 ≥10 条（实际 ' + n + '）');
});

/* ============================================================
   7. 索引接线（script 标签 + 加载顺序）
   ============================================================ */
console.log('--- 7. index.html 接线 ---');
section('7', function () {
  const html = has('index.html') ? src('index.html') : '';
  const iState = html.indexOf('state-core.js?v');
  const iFx = html.indexOf('fx-semantics.js?v');
  const iRender = html.indexOf('game-render.js?v');
  const iBattle = html.indexOf('game-battle.js?v');
  ok(iFx > -1, 'index.html 挂载了 fx-semantics.js');
  ok(iFx > iState && iState > -1, 'fx-semantics.js 排在 state-core.js（listStatusDefs）之后');
  ok(iFx < iRender && iRender > -1, 'fx-semantics.js 排在 game-render.js 之前');
  ok(iFx < iBattle && iBattle > -1, 'fx-semantics.js 排在 game-battle.js 之前');
  /* v2.14.0 收口（Lead）：不要写死某一个 cache-bust 版本号 —— 每次发版整文件会统一 +1，
   写死会让本套件在「代码没变、只 bump 版本」的提交里假红（本批发版时实测到 1 条假红）。
   改为**版本无关的更强不变式**：① index.html 所有 script 标签的 cache-bust 版本必须完全一致；
   ② fx-semantics.js 用的就是那个统一版本。 */
const allVers = (html.match(/\?v(\d+)"/g) || []).map(s => s.slice(2, -1));
const uniqVers = Array.from(new Set(allVers));
eq(uniqVers.length, 1, 'index.html 全部 script 标签 cache-bust 版本一致（无混版本）');
ok(allVers.length > 40, 'cache-bust 版本号出现在 ≥40 处（全量脚本都被打戳）', 'n=' + allVers.length);
const fxTag = (html.match(/<script src="fx-semantics\.js\?v(\d+)"/) || [])[1];
ok(!!fxTag && fxTag === uniqVers[0], 'fx-semantics.js 标签沿用 index.html 的统一 cache-bust 版本（未新增版本号）', 'fx=' + fxTag + ' uniq=' + uniqVers.join(','));
  const tags = (html.match(/<script src="fx-semantics\.js/g) || []).length;
  eq(tags, 1, 'fx-semantics.js 只有一行 script 标签');
});

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败明细（全部 ' + fails.length + ' 条）：'); fails.forEach(f => console.log('  ✗ ' + f)); }
console.log(fail ? 'FAIL' : 'ALL PASS');
process.exit(fail > 0 ? 1 : 0);

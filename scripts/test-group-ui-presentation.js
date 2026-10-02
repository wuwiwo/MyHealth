#!/usr/bin/env node
/* v2.4.0 测试：群战 UI 表现层（布局 / 特效 / 统计 / 日志）

   对应任务书 §3 的六项改造与 §5 的验收，全部**真断言**（不是「没抛异常」）：

   1) 特效解析表 —— §2 速查表里**每一种文案**都要能提出正确的数字与类型：
      普攻 / 技能 / 蓄力 / 魂攻 / 冰魄余威、dot 四种、场地两种、反伤（两种写法）、
      反冲、牺牲自我、5 种治疗；护盾吸收**不算伤害**；气泡 / 免疫 / 场地标题不出数字。
   2) 暴击 —— 引擎把 `💥 … 暴击！×N` 写在伤害事件**前面**（伤害文案里没有「暴击」二字），
      故只能靠「同一 events 数组里紧邻的前一个事件」判定；这里正反两面都断言。
   3) 伤害色阶 —— 按**目标最大生命**百分比分三档（<5% 白 / 5~20% 黄 / >20% 红）。
   4) 统计纯函数 —— 构造 gb.log 直测：归因、MVP、并列 tie-break、同名映射、护盾吸收不计入、
      dot 单列不计 MVP、场地单列。
   5) 日志筛选 —— 过滤必须发生在「仅最近 8 条」**截断之前**（构造一条「heal 全在 8 条之外」
      的日志，若先截断就必然取不到）；空态文案；徽章语义 = 筛选后条数。
   6) 源码守卫 —— 禁 `!important` 压血条、禁 `transform:scale()` 放大行动者、
      `_groupStep` 内不得有 DOM 操作、新增字号必须走令牌、居中飘字必须自带
      `translateX(-50%)` 的专用关键帧（复用 floatUp 会把定位覆盖掉、数字跳左边缘）。

   Run: node scripts/test-group-ui-presentation.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const load = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(actual, expected, msg) {
  ok(actual === expected, msg + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}

/* ---------- 沙箱：与 test-battle-pet-icons.js 同一套加载顺序（口径同源） ---------- */
function makeSandbox() {
  const mem = {};
  const sb = { Math, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  const ov = { innerHTML: '', hidden: false, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, setAttribute() {},
    getAttribute: () => null, textContent: '' };
  sb.__ov = ov;
  sb.document = {
    getElementById: id => (id === 'panelOverlay' ? ov : null),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  sb.navigator = { clipboard: { writeText: () => ({ then: () => {} }) } };
  sb._petBattlePicks = []; sb._groupBattle = null;
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
    'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
    'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
    'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
    'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js',
    'game-render.js'
  ].forEach(f => { if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(load(f), sb); });
  return sb;
}
const sb = makeSandbox();
const grSrc = src('game-render.js');
const css = src('index.css');

/* 造一个轻量 gb（只带 groupBattleStats / renderGroupLogPane 真正用到的字段） */
function mkUnit(id, name, side, hp, maxHp) {
  return { id: id, name: name, side: side, hp: hp == null ? 100 : hp,
    base: { hp: maxHp == null ? 1000 : maxHp, atk: 10, def: 10, spd: 10 }, statuses: [], skills: [], _talents: [] };
}
function mkGb(allies, enemies, log, winner, turn) {
  return { units: allies.concat(enemies), allies: allies, enemies: enemies,
    log: log, winner: winner || null, turn: turn == null ? 1 : turn, done: true };
}
const E = (msg, type, targetId) => ({ msg: msg, type: type, targetId: targetId });
const L = (unit, events, extra) => Object.assign({ turn: 1, unit: unit, events: events }, extra || {});

/* ============ 1. 速查表：每种文案的数字提取 ============ */
console.log('--- 1. 引擎日志速查表：数字提取与类型 ---');
const PARSE_CASES = [
  /* 普攻 / 技能 / 蓄力 / 魂攻（数字在箭头前 vs 箭头后两种句式都要吃） */
  ['⚔️ 剑士 攻击 魔像 → 1218 伤害', 'damage', 1218, 'dmg', '普攻（目标在箭头前）'],
  ['👹 熔岩巨兽 攻击 🧑 你 → 77 伤害', 'damage', 77, 'dmg', '普攻（名字带 emoji 与空格）'],
  ['⚡ 精英·狂战 地刺 → 🧑 你 193 伤害', 'damage', 193, 'dmg', '技能（目标在箭头后）'],
  ['💥 A 蓄力重击 → B 800 伤害', 'damage', 800, 'dmg', '蓄力重击'],
  ['👻 A 魂攻击 B → 88 魂伤害', 'damage', 88, 'dmg', '魂攻'],
  ['❄️ A 冰魄余威 → B 120 魂伤害（无视魂防，不占用行动）', 'damage', 120, 'dmg', '冰魄余威'],
  ['🌀 A 迷惑 → 敌我不分，误击 B 66 伤害', 'damage', 66, 'dmg', '迷惑误击'],
  /* 反伤（两种写法：无名字 / 带名字） */
  ['🩸 B 粗糙皮肤 → A 反伤 5', 'damage', 5, 'reflect', '粗糙皮肤反伤'],
  ['🛡️ X 金身护盾被击破 → 反伤 A 12（初始护盾×20%）', 'damage', 12, 'reflect', '金身护盾破盾反伤'],
  /* 反冲 / 自伤 */
  ['💥 A 三连 反冲 -30（对目标造成 100 × 35%）', 'damage', 30, 'recoil', '雷霆冲撞反冲'],
  ['🌀 A 迷惑 → 牺牲自我 -12', 'damage', 12, 'recoil', '迷惑牺牲自我'],
  /* 持续伤害 4 种 */
  ['☠️ 中毒: -12', 'dot', 12, 'dot', '中毒'],
  ['👻 附身侵蚀: -7', 'dot', 7, 'dot', '附身侵蚀'],
  ['🌑 末日: -9', 'dot', 9, 'dot', '末日'],
  ['💀 遗言: -5', 'dot', 5, 'dot', '遗言'],
  /* 场地 2 种 */
  ['🪨 B 受碎石伤害 40', 'terrain', 40, 'terrain', '沙暴碎石'],
  ['⚡ B 被闪电击中 55', 'terrain', 55, 'terrain', '雨天闪电'],
  /* 治疗 5 种 */
  ['💚 A → B 治疗 +120', 'heal', 120, 'heal', '技能治疗'],
  ['🩸 A 技能吸血 +30', 'heal', 30, 'heal', '技能吸血'],
  ['💚 A 三连：剩余弹射未发动 → 自愈 +18', 'heal', 18, 'heal', '弹射自愈'],
  ['🩸 战意吸血: +9', 'heal', 9, 'heal', '战意吸血'],
  ['💤 睡眠回复 +20', 'heal', 20, 'heal', '睡眠回复']
];
PARSE_CASES.forEach(function (c) {
  const h = sb.gbParseHit(E(c[0], c[1], 'x'), null);
  ok(!!h, '解析不到数字：' + c[4] + ' → ' + c[0]);
  if (!h) return;
  ok(h.amount === c[2] && h.kind === c[3],
    c[4] + ' 应为 ' + c[2] + '/' + c[3] + '，实际 ' + h.amount + '/' + h.kind + ' → ' + c[0]);
  ok(!isNaN(h.amount), c[4] + ' 解析出 NaN（正则捕获组取错）→ ' + c[0]);
});

/* 不该出飘字的：护盾吸收 / 气泡 / 免疫 / 场地标题 / 状态施加 / 再生 / 威吓 */
const NOT_HIT = [
  ['🛡️ B 护盾吸收 30（护盾破碎）', 'status', '护盾吸收不计入造成伤害'],
  ['🛡️ B 护盾吸收 12 魂伤（护盾破碎）', 'status', '护盾吸收（魂伤）'],
  ['🌪️ 沙暴', 'terrain', '场地标题无数字'],
  ['⛈️ 雨天', 'terrain', '场地标题无数字'],
  ['🌧️ B 变潮湿', 'terrain', '场地施加状态无数字'],
  ['🛡️ B 受护盾庇护，免疫【冰冻】（剩余 30）', 'status', '免疫文案'],
  ['🌀 A → B 施加【冰冻】（3 回合）', 'status', '状态施加（不是伤害）'],
  ['🛡️ B 免疫【冰冻】', 'status', '免疫'],
  ['💚 A 再生: 恢复 87', 'talent', '恢复类无 + 号（不猜数字）'],
  ['😱 威吓：X → Y 攻击 -28%（持续 5~10 回合）', 'talent', '威吓文案'],
  ['🚫 A 无法行动（沉睡）', 'skip', '跳过文案']
];
NOT_HIT.forEach(function (c) {
  const h = sb.gbParseHit(E(c[0], c[1], null), null);
  ok(h === null, c[2] + ' 不应出飘字，实际 ' + JSON.stringify(h) + ' → ' + c[0]);
});
ok(sb.gbParseHit({ type: 'bubble', text: '⚡ A：冰冻三尺！' }, null) === null, '气泡事件（无 msg）不应出飘字');
ok(sb.gbParseHit({ msg: '⚡ A：冰冻三尺！', type: 'bubble' }, null) === null, '气泡事件不应出飘字');

/* ============ 2. 暴击判定（紧邻前置事件） ============ */
console.log('--- 2. 暴击：紧邻的前一个事件含「暴击」 ---');
const dmgEv = { msg: '⚔️ A 攻击 B → 240 伤害', type: 'damage' };
eq(sb.gbParseHit(dmgEv, { msg: '💥 A 暴击！×2.4', type: 'damage' }).crit, true, '暴击事件紧邻在前 → 标记暴击');
eq(sb.gbParseHit(dmgEv, { msg: '🛡️ B 护盾吸收 5', type: 'status' }).crit, false, '前置事件不含暴击 → 不标记');
eq(sb.gbParseHit(dmgEv, null).crit, false, '无前置事件 → 不标记');
eq(sb.gbParseHit({ msg: '💥 A 暴击！×2.4', type: 'damage' }, null), null, '暴击事件本身不是伤害（不出飘字）');
/* 反例：伤害文案里**没有**「暴击」二字，按文案匹配永远不触发（这正是必须用邻接事件的原因） */
ok(dmgEv.msg.indexOf('暴击') < 0, '伤害文案本身不含「暴击」二字（故不能按文案判定）');

/* ============ 3. 伤害色阶（按目标最大生命百分比） ============ */
console.log('--- 3. 伤害色阶 ---');
const gbColor = mkGb([mkUnit('a', 'A', 'ally', 1000, 1000)], [], [], null, 1);
eq(sb.gbHitColor(gbColor, { targetId: 'a' }, 49), 'var(--text)', '4.9% → 白');
eq(sb.gbHitColor(gbColor, { targetId: 'a' }, 50), 'var(--yellow)', '5% → 黄（边界含）');
eq(sb.gbHitColor(gbColor, { targetId: 'a' }, 200), 'var(--yellow)', '20% → 黄（边界含）');
eq(sb.gbHitColor(gbColor, { targetId: 'a' }, 201), 'var(--red)', '20.1% → 红');
eq(sb.gbHitColor(gbColor, { targetId: 'nope' }, 5), 'var(--red)', '目标查不到（场地事件无 targetId）→ 按重击红');

/* ============ 4. 统计纯函数 ============ */
console.log('--- 4. 结算统计（构造 gb.log） ---');
const A = mkUnit('a', '🧑 你', 'ally', 900, 1000);
const B = mkUnit('b', '🐾 星尘', 'ally', 0, 500);
const F = mkUnit('f', '👹 魔像', 'enemy', 200, 3000);
const log1 = [
  L('🧑 你', [E('⚔️ 🧑 你 攻击 👹 魔像 → 100 伤害', 'damage', 'f')]),
  L('🐾 星尘', [E('💚 🐾 星尘 → 🧑 你 治疗 +50', 'heal', 'a')]),
  L('🐾 星尘', [E('🌀 🐾 星尘 → 👹 魔像 施加【冰冻】（3 回合）', 'status', 'f')]),
  L('🐾 星尘', [E('🌀 🐾 星尘 → 👹 魔像 刷新【破甲】（2 回合）', 'status', 'f')]),
  L('🧑 你', [E('☠️ 中毒: -12', 'dot', 'a')]),
  L('场地·沙暴', [E('🪨 🧑 你 受碎石伤害 40', 'terrain', null)], { terrain: true }),
  L('🧑 你', [E('🛡️ 🧑 你 护盾吸收 30（护盾破碎）', 'status', 'a')]),
  L('🧑 你', [E('🩸 🧑 你 粗糙皮肤 → 👹 魔像 反伤 5', 'damage', 'a')]),
  L('🧑 你', [E('💥 🧑 你 三连 反冲 -30（对目标造成 100 × 35%）', 'damage', 'a')])
];
const gb1 = mkGb([A, B], [F], log1, 'ally', 3);
const st1 = sb.groupBattleStats(gb1);
const rowOf = (st, id) => st.rows.filter(r => r.id === id)[0];
eq(rowOf(st1, 'a').dealt, 100 + 5 + 30, '造成伤害 = 普攻 + 反伤 + 反冲（归行动者 l.unit）');
eq(rowOf(st1, 'a').taken, 12 + 40 + 30 + 5, '承受伤害 = dot + 场地（按名字兜底）+ 反冲 + 反伤（按 targetId）');
eq(rowOf(st1, 'b').healed, 50, '治疗量归施放者 l.unit');
eq(rowOf(st1, 'b').status, 2, '施加状态数：施加 + 刷新都算，免疫/护盾吸收不算');
eq(rowOf(st1, 'b').dealt, 0, '没造成伤害的单位 dealt 为 0');
eq(rowOf(st1, 'a').alive, true, '存活标记：hp>0');
eq(rowOf(st1, 'b').alive, false, '阵亡标记：hp<=0');
eq(st1.terrain, 40, '场地伤害单列（不并进任何单位造成伤害）');
eq(st1.dot, 12, '持续伤害单列（无攻击者，不计 MVP）');
eq(st1.shield, 30, '护盾吸收单列');
eq(rowOf(st1, 'a').dealt + rowOf(st1, 'b').dealt + st1.terrain + st1.dot, 100 + 5 + 30 + 40 + 12,
  '造成伤害四项互不重叠（护盾吸收 30 完全不计入）');
eq(st1.rows.length, 2, '只列我方单位（敌方不进表）');
ok(st1.mvp && st1.mvp.id === 'a', 'MVP = 伤害最高者');
eq(st1.rows.filter(r => r.mvp).length, 1, 'MVP 只标一个');

/* tie-break：伤害相同 → 比治疗 */
const log2 = [
  L('🧑 你', [E('⚔️ 🧑 你 攻击 👹 魔像 → 100 伤害', 'damage', 'f')]),
  L('🐾 星尘', [E('⚔️ 🐾 星尘 攻击 👹 魔像 → 100 伤害', 'damage', 'f')]),
  L('🐾 星尘', [E('💚 🐾 星尘 → 🧑 你 治疗 +80', 'heal', 'a')])
];
const st2 = sb.groupBattleStats(mkGb([A, B], [F], log2, 'ally', 2));
ok(st2.mvp && st2.mvp.id === 'b', '伤害并列 → 比治疗，治疗高者拿 MVP');

/* tie-break：伤害、治疗都并列 → 按 gb.units（gb.allies）顺序取先出现者 */
const log3 = [
  L('🧑 你', [E('⚔️ 🧑 你 攻击 👹 魔像 → 100 伤害', 'damage', 'f')]),
  L('🐾 星尘', [E('⚔️ 🐾 星尘 攻击 👹 魔像 → 100 伤害', 'damage', 'f')]),
  L('🧑 你', [E('💚 🧑 你 → 🐾 星尘 治疗 +80', 'heal', 'b')]),
  L('🐾 星尘', [E('💚 🐾 星尘 → 🧑 你 治疗 +80', 'heal', 'a')])
];
const st3 = sb.groupBattleStats(mkGb([A, B], [F], log3, 'ally', 2));
ok(st3.mvp && st3.mvp.id === 'a', '伤害与治疗都并列 → 按 gb.units 顺序取先出现者');

/* 全员 0 伤害（开场被秒）：不给 MVP（0 伤害的「最有价值」是误导） */
const st4 = sb.groupBattleStats(mkGb([A, B], [F], [L('🧑 你', [E('🚫 🧑 你 无法行动（沉睡）', 'skip', 'a')])], 'enemy', 1));
ok(st4.mvp === null, '全员 0 伤害时不给 MVP');
eq(st4.rows.filter(r => r.mvp).length, 0, '全员 0 伤害时没有人带 MVP 标记');

/* 同名映射：不得静默合并，按 gb.units 顺序加后缀 */
const P1 = mkUnit('p1', '🐾 宠物A', 'ally', 100, 100);
const P2 = mkUnit('p2', '🐾 宠物A', 'ally', 100, 100);
const st5 = sb.groupBattleStats(mkGb([P1, P2], [F], [], 'ally', 1));
const keys = st5.rows.map(r => r.key);
ok(keys[0] === '🐾 宠物A' && keys[1] === '🐾 宠物A#2', '同名单位如实加后缀（实际 ' + JSON.stringify(keys) + '）');
eq(st5.dup, true, '同名检测置位（面板会明说归因限制）');
eq(st5.rows.length, 2, '同名单位不合并、仍是两行');
const st6 = sb.groupBattleStats(mkGb([A, B], [F], [], 'ally', 1));
eq(st6.dup, false, '无同名时不置位');
/* 同名时日志按名字归到首个同名单位（引擎日志无 id，只能如此，面板已明说） */
const st7 = sb.groupBattleStats(mkGb([P1, P2], [F], [L('🐾 宠物A', [E('⚔️ 🐾 宠物A 攻击 👹 魔像 → 25 伤害', 'damage', 'f')])], 'ally', 1));
eq(rowOf(st7, 'p1').dealt, 25, '同名归因落到首个同名单位');
eq(rowOf(st7, 'p2').dealt, 0, '同名后位单位不得凭空得分');

/* ============ 5. 日志筛选（先过滤、后截断） ============ */
console.log('--- 5. 日志筛选：过滤 → 截断 ---');
function logEntry(i, name, msg, type) { return L(name, [E(msg, type, null)]); }
/* 12 条：第 1 条是治疗，其余 11 条全是伤害 → 「仅最近 8 条」里**一条治疗都没有**。
   若先截断再过滤，治疗筛选必然为空；先过滤才取得到那条治疗。 */
const logBig = [logEntry(1, '🧑 你', '💚 🧑 你 → 🐾 星尘 治疗 +99', 'heal')];
for (let i = 2; i <= 12; i++) logBig.push(logEntry(i, '🧑 你', '⚔️ 🧑 你 攻击 👹 魔像 → ' + i + ' 伤害', 'damage'));
const gbBig = mkGb([A, B], [F], logBig, 'ally', 5);
sb._gbLogFilter = 'all';
eq(sb.gbLogEntries(gbBig).length, 12, '「全部」= 12 条');
sb._gbLogFilter = 'heal';
eq(sb.gbLogEntries(gbBig).length, 1, '「治疗」筛出 1 条（在最近 8 条之外，证明是先过滤后截断）');
const healPane = sb.renderGroupLogPane(gbBig);
ok(healPane.indexOf('heal-num') > -1 && healPane.indexOf('>99<') > -1,
  '治疗筛选后日志页仍能看到那条治疗（先过滤后截断）');
ok(healPane.indexOf('攻击 ') < 0, '治疗筛选后不再出现伤害事件');
sb._gbLogFilter = 'talent';
const emptyPane = sb.renderGroupLogPane(gbBig);
ok(emptyPane.indexOf('该类型暂无事件') > -1, '空态给明确文案「该类型暂无事件」');
ok(emptyPane.indexOf('攻击 ') < 0, '空态下不残留被筛掉的事件');
sb._gbLogFilter = 'dmg';
eq(sb.gbLogEntries(gbBig).length, 11, '「伤害」筛出 11 条');
sb._gbLogFilter = 'all';
/* 徽标语义 = 筛选后条数 */
ok(/gbLogEntries\(gb\)\.length/.test(grSrc), '日志 Tab 徽标用筛选后条数（gbLogEntries(gb).length）');
/* 筛选按钮：5 个维度 + aria-pressed（可访问性表达选中态） */
eq(sb.GB_LOG_FILTERS.length, 5, '筛选按钮 5 个');
eq(sb.GB_LOG_FILTERS.map(f => f.k).join(','), 'all,dmg,heal,status,talent', '筛选维度顺序：全部/伤害/治疗/状态/天赋');
const allPane = sb.renderGroupLogPane(gbBig);
ok(/data-gblogfilter="heal"/.test(allPane) && /aria-pressed="(true|false)"/.test(allPane), '筛选按钮带 data 属性与 aria-pressed');
/* 日志「全部」态仍保留无事发生的回合（既有文案不回退） */
sb._gbLogFilter = 'all';
const quietPane = sb.renderGroupLogPane(mkGb([A, B], [F], [L('🧑 你', [])], 'ally', 1));
ok(quietPane.indexOf('（本回合无事发生）') > -1, '「全部」态保留「（本回合无事发生）」');
sb._gbLogFilter = 'all';

/* ============ 6. 行动者徽章 / 数字高亮 ============ */
console.log('--- 6. 徽章与数字高亮 ---');
const idx = sb.gbUnitIndex(mkGb([A], [mkUnit('e1', '👹 熔岩巨兽', 'enemy', 10, 10)], [], 'ally', 1));
const badge = sb.gbActorBadge({ unit: '👹 熔岩巨兽' }, idx);
ok(/tone-enemy/.test(badge), '敌方徽章用红色调');
ok(badge.indexOf('熔岩') > -1, '先剥前导 emoji 再取前 2 字（不能只剩一个 emoji）');
ok(badge.indexOf('👹') < 0, '徽章里不再出现前导 emoji');
ok(/tone-ally/.test(sb.gbActorBadge({ unit: '🧑 你' }, idx)), '我方徽章用绿色调');
ok(/tone-terrain/.test(sb.gbActorBadge({ unit: '场地·沙暴', terrain: true }, idx)), '场地徽章紫色调');
ok(/tone-opening/.test(sb.gbActorBadge({ unit: '开场', opening: true }, idx)), '开场徽章黄色调');
const hi = sb.gbLogEvHtml(E('⚔️ A 攻击 B → 1218 伤害', 'damage', 'e1'));
ok(hi.indexOf('<b class="dmg-num">1218</b>') > -1, '伤害数字包成 .dmg-num（在 escHtml 之后）');
const hiH = sb.gbLogEvHtml(E('💚 A → B 治疗 +120', 'heal', 'a'));
ok(hiH.indexOf('<b class="heal-num">120</b>') > -1, '治疗数字包成 .heal-num');
ok(sb.gbLogEvHtml(E('⚔️ <img src=x> 攻击 B → 5 伤害', 'damage', 'e1')).indexOf('<img') < 0, '高亮前先转义（不引入 XSS）');

/* ============ 7. 结算面板接线 ============ */
console.log('--- 7. 结算面板 ---');
sb.__ov.innerHTML = '';
sb.showGroupResultPanel(gb1, st1);
const panel = sb.__ov.innerHTML;
ok(panel.indexOf('id="detailClose"') > -1, '面板自带 #detailClose（_openDetailPanel 只绑这个 id）');
ok(panel.indexOf('🏆 胜利') > -1, '胜利标题');
ok(panel.indexOf('共 3 回合') > -1, '回合数');
ok(panel.indexOf('👑 MVP') > -1, 'MVP 标记');
ok(panel.indexOf('id="gbCopyReport"') > -1, '底部「📋 复制战报」按钮');
ok(panel.indexOf('gb-res-row') > -1, '我方每单位一行');
sb.showGroupResultPanel(mkGb([A], [F], [], 'enemy', 2), sb.groupBattleStats(mkGb([A], [F], [], 'enemy', 2)));
ok(sb.__ov.innerHTML.indexOf('💀 失败') > -1, '失败标题');
/* 战报文本单一来源：日志页「复制」与面板「复制战报」共用 groupLogText() */
ok(/function groupLogText\(gb\)/.test(grSrc), '存在 groupLogText(gb) 单一来源');
eq((grSrc.match(/groupLogText\(/g) || []).length >= 3, true, 'groupLogText 被复制按钮与面板共用（≥3 处：定义 + 两处调用）');
/* restore 只关战斗层，不得走 resumeGroupBattle（会二次进入 _groupDone） */
const panelFn = fnBody(grSrc, 'showGroupResultPanel');
ok(/battleOverlay/.test(panelFn) && /classList\.remove\('open'\)/.test(panelFn) || /classList\.remove\("open"\)/.test(panelFn),
  'restore 回调里关掉战斗 overlay');
ok(panelFn.indexOf('resumeGroupBattle') < 0, 'restore 回调不得走 resumeGroupBattle');

/* ============ 8. 源码守卫 ============ */
console.log('--- 8. 源码守卫（反模式清单） ---');
function fnBody(source, name) {
  const i = source.indexOf('function ' + name);
  if (i < 0) return '';
  const s = source.indexOf('{', i);
  let depth = 0, j = s;
  for (; j < source.length; j++) {
    const c = source[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < source.length && source[j] !== q) { if (source[j] === '\\') j++; j++; }
    }
  }
  return source.slice(s, j + 1);
}

/* 1) 禁 !important 压血条宽度（宽度是内联样式，压下去血条就死了） */
ok(grSrc.indexOf('!important') < 0, 'game-render.js 无 !important');
const hpFillRules = (css.match(/\.gb-hp-fill[^{]*\{[^}]*\}/g) || []);
ok(hpFillRules.length > 0, 'index.css 里能找到 .gb-hp-fill 规则');
ok(hpFillRules.every(r => r.indexOf('!important') < 0), '.gb-hp-fill 规则里没有 !important（血条宽度是内联样式）');
ok(hpFillRules.some(r => /transition\s*:/.test(r)), '.gb-hp-fill 只调 transition（不碰 width 权重）');

/* 2) 禁 transform:scale() 放大行动者（.gb-pane 是滚动裁剪容器）
   ⚠️ 判据要排掉 `filter:grayscale(1)` —— 它里面也有 "scale(" 字样，但它不是放大。 */
const SCALE_RX = /(^|[^A-Za-z-])scale\(/;
const unitRules = (css.match(/\.gb-unit[^{]*\{[^}]*\}/g) || []);
ok(unitRules.length > 0, 'index.css 里能找到 .gb-unit 规则');
ok(unitRules.every(r => !SCALE_RX.test(r)), '.gb-unit 相关规则无 transform:scale()（会溢出/出横向滚动条）');
ok(/\.gb-unit\.gb-acting\{[^}]*z-index:2/.test(css), '行动者 z-index:2');
ok(/box-shadow/.test((css.match(/\.gb-unit\.gb-acting\{[^}]*\}/) || [''])[0]), '行动者保留既有 box-shadow 光环');
ok(/\.gb-unit\.gb-acting::before\{/.test(css), '行动者保留 ::before 强调条');

/* 3) 行动焦点：上限 0.75，且只暗化非行动者 */
const focusRule = (css.match(/\.gb-focus[^{]*\{[^}]*\}/) || [''])[0];
ok(/opacity\s*:\s*\.75|opacity\s*:\s*0\.75/.test(focusRule), '行动焦点暗化上限 0.75（实际 ' + focusRule + '）');
ok(/:not\(\.gb-acting\)/.test(focusRule) && /:not\(\.gb-dead\)/.test(focusRule), '暗化排除行动者与阵亡单位');
ok(/\.gb-focus/.test(fnBody(grSrc, 'renderGroupOverlay')), 'renderGroupOverlay 里挂/去 .gb-focus');

/* 4) _groupStep 内不得有 DOM/CSS 操作（统一由 renderGroupOverlay 控制） */
const stepBody = fnBody(grSrc, '_groupStep');
ok(stepBody.length > 0, '找到 _groupStep 函数体');
['document.', 'innerHTML', 'classList', 'createElement', '.style'].forEach(function (bad) {
  ok(stepBody.indexOf(bad) < 0, '_groupStep 内不得出现 ' + bad + '（DOM 统一由 renderGroupOverlay 控制）');
});

/* 5) 居中飘字必须用自带 translateX(-50%) 的专用关键帧（复用 floatUp 会覆盖定位） */
ok(/@keyframes floatUpC\{/.test(css), '存在 @keyframes floatUpC');
const kfBody = (function () {
  const i = css.indexOf('@keyframes floatUpC{');
  let depth = 0, j = css.indexOf('{', i);
  for (; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) break; }
  }
  return css.slice(i, j + 1);
})();
const frames = (kfBody.match(/\{[^{}]*\}/g) || []);
ok(frames.length >= 3, 'floatUpC 至少 3 帧（实际 ' + frames.length + '）');
ok(frames.every(f => /translateX\(-50%\)/.test(f)), 'floatUpC **每一帧**都写 translateX(-50%)（否则数字跳到左边缘）');
ok(!/animation:[^;]*floatUp\b/.test(grSrc), '不得复用 floatUp 做居中飘字');

/* 6) 特效层 #gbFx：fixed 全屏、不吃事件、z-index 56 */
ok(/id\s*=\s*'gbFx'|el\.id='gbFx'/.test(grSrc), '存在 #gbFx 特效层');
ok(grSrc.indexOf('position:fixed;inset:0;pointer-events:none;z-index:56') > -1, '#gbFx = fixed/inset:0/pointer-events:none/z-index:56');
ok(/gbFxClear\(\)/.test(fnBody(grSrc, '_groupDone')), '_groupDone 里清空特效层');
ok(/gbFxClear\(\)/.test(fnBody(grSrc, 'renderGroupOverlay')), '#gbClose 处理器里清空特效层');
ok(/getBoundingClientRect/.test(fnBody(grSrc, 'gbFxFloat')), '飘字用 card.getBoundingClientRect() 定位');

/* 7) 新增字号全为令牌 */
ok(!/font-size:\s*[0-9]/.test(grSrc), 'game-render.js 内联字号全为令牌（无 font-size: 数字）');
['.gb-banner-text', '.dmg-num', '.heal-num', '.gb-log-filter', '.gb-res-name'].forEach(function (sel) {
  const rule = (css.match(new RegExp('\\' + sel + '\\{[^}]*\\}')) || [''])[0];
  ok(/font-size:var\(--fs-/.test(rule), sel + ' 的字号走令牌（实际 ' + rule + '）');
});

/* 8) 行动横幅：在吸顶区、不在 #gbPane 内、单行省略、≤44px、aria-hidden 且无 aria-live */
const overlayBody = fnBody(grSrc, 'renderGroupOverlay');
const iBanner = overlayBody.indexOf('renderGroupActionBanner(gb)');
const iTabs = overlayBody.indexOf('<div class="gb-tabs"');
ok(iBanner > -1 && iTabs > -1 && iBanner < iTabs, '横幅在 .gb-tabs 之前');
ok(overlayBody.indexOf('gb-ovw') < iBanner, '横幅在 .gb-ctrl（含血量总览）之后');
const bannerFn = fnBody(grSrc, 'renderGroupActionBanner');
ok(/id="gbActionBanner"/.test(bannerFn) && /class="gb-banner/.test(bannerFn), '横幅结构与 #gbActionBanner');
ok(/aria-hidden="true"/.test(bannerFn), '横幅 aria-hidden="true"（可读记录以日志 Tab 为准）');
ok(bannerFn.indexOf('aria-live') < 0, '横幅不得有 aria-live（自动模式会刷屏读屏）');
ok(bannerFn.indexOf('title="') > -1, '横幅 title 放全文');
const paneFn = fnBody(grSrc, 'renderGroupBattlePane');
ok(paneFn.indexOf('gbActionBanner') < 0, '横幅不得放进 #gbPane 内容（否则会滚走）');
const bannerRule = (css.match(/\.gb-banner\{[^}]*\}/) || [''])[0];
ok(/max-height:44px/.test(bannerRule), '横幅高度 ≤44px');
const bannerTextRule = (css.match(/\.gb-banner-text\{[^}]*\}/) || [''])[0];
ok(/white-space:nowrap/.test(bannerTextRule) && /text-overflow:ellipsis/.test(bannerTextRule), '横幅单行 nowrap + 省略号');
/* 横幅文案不得写死模板句：必须来自 gb.log 的事件 msg */
ok(/l\.events/.test(bannerFn) && /gbStripLeadEmoji\(e\.msg\)/.test(bannerFn), '横幅正文派生自日志事件 msg');
/* 「战斗结束」是无行动者时的兜底，不是写死的每步文案 */
ok(/⏸ 战斗结束/.test(bannerFn), '无行动者且已结束时显示「⏸ 战斗结束」');

/* 9) 布局收口：刘海安全区 + 无横向滚动 */
ok(/\.gb-ctrl\{[^}]*padding-top:calc\(6px \+ var\(--sat\)\)/.test(css), '.gb-ctrl 补刘海安全区 --sat');
ok(/\.gb-pane\{[^}]*overflow-x:hidden/.test(css), '.gb-pane 关掉横向溢出（受击抖动会越界 3px）');

/* 10) 版本筛选重置位置：必须在 startGroupTrial 的 syncLevel() 之后（test-level-system 900 字符窗口） */
const startBody = fnBody(grSrc, 'startGroupTrial');
const iSync = startBody.indexOf('syncLevel()');
const iFilter = startBody.indexOf("_gbLogFilter='all'");
ok(iSync > -1 && iFilter > iSync, "_gbLogFilter='all' 必须排在 syncLevel() 之后（900 字符窗口断言）");
ok(iFilter - iSync < 900, '重置点落在 syncLevel() 后 900 字符内');

/* ---------- 汇总 ---------- */
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) { console.log('\n失败项：'); fails.forEach(f => console.log(' ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);

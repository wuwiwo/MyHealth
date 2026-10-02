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
   6) 源码守卫 —— 禁 `!important` 压血条；**放大只允许出现在非滚动的对阵舞台里的行动芯片**
      （`.gb-arena-unit.gb-acting`，v2.4.x 舞台化后的新契约；滚动容器 `.gb-pane` 内的舞台单位
      仍禁放大）；`_groupStep` 内不得有 DOM 操作、新增字号必须走令牌、居中飘字必须自带
      `translateX(-50%)` 的专用关键帧（复用 floatUp 会把定位覆盖掉、数字跳左边缘）。
   7) v2.4.x 舞台化守卫 —— `renderGroupBattlePane` 返回的对阵舞台必须是
      敌方 → 中央 → 我方 三区；单位芯片的信息密度守卫（真渲染，不得回流旧三行卡片类名）。

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

/* 真宠物单位（走 pet-codex.js 的 createPetUnit，别手搓对象）——
   §12 的阵亡芯片必须验「仍带头像」，故这里要有真 _petSpecies */
function realPetUnit(speciesId) {
  const c = sb.getPetCodex(speciesId) || {};
  return sb.createPetUnit({ speciesId: speciesId, rarity: c.rarity, name: c.name,
    refineLevel: 0, refineStats: {}, skillLevels: {}, orbs: {} });
}
/* 某个 class 是否出现在某个 class 属性里（首类，或空白分隔；后接空白或结束引号）——
   与 scripts/test-battle-pet-icons.js 同一套判据（口径同源） */
function clsRx(c) { return new RegExp('class="(?:[^"]*\\s)?' + c + '(?=[\\s"])'); }
function hasClass(html, c) { return clsRx(c).test(html); }

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

/* 2) 放大只允许出现在**非滚动的对阵舞台**里的行动芯片上（.gb-pane 仍是滚动裁剪容器）
   ⚠️ 判据要排掉 `filter:grayscale(1)` —— 它里面也有 "scale(" 字样，但它不是放大。
   ⚠️ v2.4.x 舞台化改判：旧决策「.gb-unit 一律禁 transform:scale()」是**三行卡片时代**的结论
      （卡片在 .gb-pane 里滚动，放大就溢出/出横向滚动条）。新契约把卡片换成舞台芯片
      `.gb-arena-unit`，并把它放进**不滚动**的 `.gb-arena{overflow:hidden}`，行动芯片因此
      允许 `transform:scale(1.1)`（见 index.css 的 v2.4.2 注释）。判据随之改为三条：
        ① 舞台芯片规则必须存在；
        ② 只有 `.gb-arena-unit.gb-acting` 能放大（且必须带 transform-origin）；
        ③ 除它之外，任何 `.gb-arena-unit` 规则、以及滚动容器 `.gb-pane` 内的舞台单位都不得放大。
      ⚠️ 旧判据若照旧保留会与契约直接冲突；而旧 `unitRules` 只匹配 `.gb-unit`，
        新规则若换名就会**静默空转**（集合里根本没有要守的对象）——故下面把 `.gb-unit`
        这条也保留，作为「旧类名绕过」的兜底（放大仍只允许在 .gb-arena-unit.gb-acting 上）。
   注意：以下判据都先剥掉 CSS 注释再匹配 —— 契约注释里会写到 `.gb-arena-unit.gb-acting`，
   不剥注释会让「注释 + 下一条无关规则」拼成一条假规则。 */
const SCALE_RX = /(^|[^A-Za-z-])scale\(/;
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');
const arenaRules = (cssNC.match(/\.gb-arena-unit[^{]*\{[^}]*\}/g) || []);
ok(arenaRules.length > 0, 'index.css 里能找到 .gb-arena-unit 规则（舞台单位芯片）');
/* 行动芯片规则：兼容 `.gb-arena-unit.gb-acting` 与 `.gb-unit.gb-arena-unit.gb-acting` 两种命名，
   但**必须带** .gb-arena-unit（只有旧命名 .gb-unit.gb-acting 不算） */
const actingChipRules = (cssNC.match(/\.[^{}]*\{[^}]*\}/g) || []).filter(function (r) {
  const sel = r.slice(0, r.indexOf('{'));
  return /\.gb-arena-unit/.test(sel) && /\.gb-acting/.test(sel);
});
ok(actingChipRules.length > 0, 'index.css 里找不到带 .gb-arena-unit + .gb-acting 的规则（放大判据会静默空转）');
/* 契约把行动芯片的样式写在一条规则里；这里把命中的规则**合并**再判，
   以免实现把它拆成两条（放大一条、光环一条）时误判为缺失 */
const actingChip = actingChipRules.join('\n');
const actingChipBrief = actingChipRules[0] || '';
ok(/transform\s*:\s*scale\(1\.1\)/.test(actingChip),
  '行动芯片必须 transform:scale(1.1)（实际：' + actingChipBrief + '）');
ok(/transform-origin\s*:/.test(actingChip),
  '行动芯片必须带 transform-origin（默认按中心放大，不像「站到阵前」）：' + actingChipBrief);
/* ③-a 除 .gb-acting 那条之外，其它 .gb-arena-unit 规则不得含 scale( */
const otherArena = arenaRules.filter(function (r) { return !/\.gb-acting/.test(r.slice(0, r.indexOf('{'))); });
ok(otherArena.every(function (r) { return !SCALE_RX.test(r); }),
  '除行动芯片外，其它 .gb-arena-unit 规则不得放大：'
  + otherArena.filter(function (r) { return SCALE_RX.test(r); }).join(' | '));
/* ③-b 滚动容器 .gb-pane 内的舞台单位不得放大 */
ok(!/\.gb-pane[^{]*\.gb-arena-unit[^{]*\{[^}]*scale\(/.test(cssNC),
  '.gb-pane（滚动裁剪容器）内的 .gb-arena-unit 不得 scale()（会溢出 / 出横向滚动条）');
/* ③-c 旧类名兜底：任何 .gb-unit 规则里的放大同样只允许出现在行动芯片那条上 */
const unitRules = (cssNC.match(/\.gb-unit[^{]*\{[^}]*\}/g) || []);
ok(unitRules.length > 0, 'index.css 里能找到 .gb-unit 规则');
ok(unitRules.every(function (r) {
  return !SCALE_RX.test(r) || (/\.gb-arena-unit/.test(r) && /\.gb-acting/.test(r));
}), '.gb-unit 规则里的 scale() 只允许出现在 .gb-arena-unit.gb-acting 上：'
  + unitRules.filter(function (r) { return SCALE_RX.test(r); }).join(' | '));
/* 行动芯片的既有视觉语言（光环 / 强调条）随类名迁移后必须仍在 */
ok(/z-index:2/.test(actingChip), '行动芯片保留 z-index:2（压在相邻芯片之上，光环不被圆角切掉）');
ok(/box-shadow/.test(actingChip), '行动芯片保留既有 box-shadow 光环');
ok(/::before\s*\{/.test(actingChip), '行动芯片保留 ::before 强调条');

/* 3) 行动焦点：上限 0.5（v2.4.x 舞台化把契约值从旧卡片的 0.75 改为 0.5），且只暗化非行动者 */
const focusRule = (cssNC.match(/\.gb-focus[^{]*\{[^}]*\}/) || [''])[0];
ok(/opacity\s*:\s*(?:0?\.5)(?![0-9])/.test(focusRule), '行动焦点暗化上限 0.5（实际 ' + focusRule + '）');
ok(/:not\(\.gb-acting\)/.test(focusRule) && /:not\(\.gb-dead\)/.test(focusRule), '暗化排除行动者与阵亡单位');
/* 焦点态必须是 renderGroupOverlay 挂/去的（不能挪到别的函数里，否则换渲染路径就丢焦点）
   ⚠️ 判据写成 `\bgb-focus\b`（class 名令牌）而不是 `\.gb-focus`（选择器写法）：
   旧写法在 HEAD 上其实是靠 renderGroupOverlay 里的一句**注释**「…才挂 .gb-focus」命中的，
   舞台化重写注释后它就假红了 —— 真正要守的是「这个 class 由 renderGroupOverlay 切换」。 */
ok(/\bgb-focus\b/.test(fnBody(grSrc, 'renderGroupOverlay')), 'renderGroupOverlay 里挂/去 gb-focus');

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

/* ============ 11. v2.4.x 舞台化：上下对阵舞台（敌方 → 中央 → 我方） ============ */
console.log('--- 11. 对阵舞台三区顺序 ---');
{
  const stagePet = realPetUnit('sparkle');
  const stageFoe = sb.createEnemyUnit({ id: 'e-stage', tier: 'minion', name: '杂兵·弓',
    base: { hp: 100, atk: 10, def: 5, spd: 8 } });
  const stageGb = { allies: [mkUnit('s1', '🧑 你', 'ally', 100, 100), stagePet], enemies: [stageFoe],
    _stepQueue: [stagePet, stageFoe], _stepIdx: 0 };
  /* 真渲染（不是 grep 源码）：三区的顺序是布局契约本身，只能从返回的 HTML 上量 */
  const arenaHtml = sb.renderGroupBattlePane(stageGb);
  const iE = arenaHtml.indexOf('gb-arena-enemy');
  const iM = arenaHtml.indexOf('gb-arena-mid');
  const iA = arenaHtml.indexOf('gb-arena-ally');
  ok(iE > -1 && iM > -1 && iA > -1,
    '战场三区缺一（敌方 gb-arena-enemy / 中央 gb-arena-mid / 我方 gb-arena-ally）：' + arenaHtml.slice(0, 200));
  ok(iE > -1 && iE < iM && iM < iA,
    '战场三区顺序必须 敌方 → 中央 → 我方，实际下标 ' + iE + ' / ' + iM + ' / ' + iA);
  ok(/id="gbArena"/.test(arenaHtml), '战场容器缺 id="gbArena"（飘字/技能名锚点）');
  ok(arenaHtml.indexOf('gb-arena-row') > -1, '缺 .gb-arena-row（敌方行 / 我方行）');
  ok(/class="[^"]*\bgb-order\b/.test(arenaHtml), '行动顺序条 .gb-order 仍在战场里（不得被舞台化顺手删掉）');
  /* 中央特效锚点：飘字/技能名挂 #gbArenaMid */
  ok(/gbArenaMid|gb-arena-mid/.test(grSrc), 'game-render.js 里找不到中央特效区锚点（#gbArenaMid / .gb-arena-mid）');
}

/* ============ 12. 战场单位芯片：信息密度守卫（真渲染） ============ */
console.log('--- 12. 战场芯片信息密度 ---');
{
  /* 我方芯片用**真宠物单位**（带技能与天赋）：旧卡片会因此渲染出 .gb-chip / .gb-row4，
     信息密度守卫才能在四个类名上都真正咬住，而不是只咬到 gb-stats / gb-row1 */
  const chipAlly = sb.renderGroupUnit(realPetUnit('sparkle'), 'ally');
  const chipFoe = sb.renderGroupUnit(sb.createEnemyUnit({ id: 'c2', tier: 'minion', name: '杂兵·弓',
    base: { hp: 100, atk: 10, def: 5, spd: 8 } }), 'enemy');
  const chipDead = (function () {
    const d = realPetUnit('kirin');
    d.hp = 0;
    return sb.renderGroupUnit(d, 'ally');
  })();
  /* 「不再像表格」的自动化防线：旧三行卡片的类名一个都不许回流 */
  const OLD_CARD_CLASSES = ['gb-chip', 'gb-stats', 'gb-row1', 'gb-row4'];
  [['我方芯片', chipAlly], ['敌方芯片', chipFoe], ['阵亡芯片', chipDead]].forEach(function (c) {
    const nm = c[0], html = c[1];
    OLD_CARD_CLASSES.forEach(function (bad) {
      ok(!hasClass(html, bad), nm + ' 出现旧卡片类名 .' + bad + '（信息密度守卫：舞台芯片不得再像表格）');
    });
    ok(hasClass(html, 'gb-name'), nm + ' 缺 .gb-name');
    ok(hasClass(html, 'gb-hp-wrap'), nm + ' 缺 .gb-hp-wrap');
    ok(html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0, nm + ' HTML 里出现 undefined/NaN');
  });
  ok(hasClass(chipDead, 'gb-arena-ico') && /src="media\/pets\/kirin\.svg"/.test(chipDead),
    '阵亡芯片仍须在 .gb-arena-ico 里保留头像');
  ok(hasClass(chipDead, 'gb-dead'), '阵亡芯片带 .gb-dead（灰化 + 名字删除线），不再折叠成 gb-dead-line');
  ok(chipDead.indexOf('gb-dead-line') < 0, '阵亡单位不得再走 gb-dead-line 折叠行');
  ok(hasClass(chipAlly, 'gb-arena-unit') && hasClass(chipFoe, 'gb-arena-unit'),
    '敌方/我方单位都应是 .gb-arena-unit 芯片（renderGroupUnit 的两种 side 同构）');
}

/* ============ 13. v2.4.2 技能特效 + 中央飘字 + 场地事件命中（新增一节） ============

   本节补的是 v2.4.2「技能特效 + 中央特效区」的四件事，全部**真断言**：
     a) 场地事件（`受碎石伤害` / `被闪电击中`，日志里**没有 targetId**）必须能命中芯片 ——
        芯片名字已被截断成 ≤4 字，旧的 `textContent.indexOf(完整名)` 分支必然落空，
        故改用 `data-name="完整名"` 精确匹配（本节的桩芯片刻意用「显示文字不含完整名」的形态）。
     b) 飘字锚 **#gbArenaMid**（不是芯片旁），同一步多条按槽位错位、互不重叠。
     c) `gbShowSkillCast` 的 skillId → 图标 src 真的接上了（跑真 skill-icon.js，不靠名字猜），
        元素挂常驻层 `#gbFx` 而**不是** #gbArenaMid 的子节点，新施法先清上一条。
     d) `gbStepSummary` 纯函数：多目标 → 一句话，单目标 → 中性句，拿不到技能名 → 空串。

   为什么自建沙箱 + DOM 桩：沙箱的 document.getElementById 只认 panelOverlay，
   而本节要验的正是「锚 #gbArenaMid / 挂 #gbFx / 受击闪芯片」这些**真实定位与清理**行为 ——
   只能造一个可观测的桩，逐项量 left/top 与子节点数。 */
console.log('--- 13. v2.4.2 中央特效区：施法特效 / 飘字错位 / data-name 命中 ---');
{
  const sb2 = makeSandbox();
  /* 图标唯一入口：必须真加载 skill-icon.js，否则「skillId → src」会被 typeof 守卫降级成空串，
     断言变成「什么都没渲染」的假绿。 */
  vm.runInContext(load('skill-icon.js'), sb2);

  /* --- DOM 桩：只做两件事 —— 记录子节点、按 fixed 层坐标语义返回 rect --- */
  const layer = {
    children: [],
    appendChild(el) { el.parentNode = this; this.children.push(el); return el; },
    removeChild(el) { const i = this.children.indexOf(el); if (i >= 0) this.children.splice(i, 1); el.parentNode = null; return el; },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (!v) this.children.length = 0; }
  };
  const midEl = { childCount: 0, appendChild() { this.childCount++; },
    getBoundingClientRect: () => ({ left: 100, top: 500, width: 200, height: 100 }) };
  const hitLog = [];
  function chipStub(uid, name, display) {
    return {
      uid: uid, name: name, display: display, parentNode: null,
      classList: { add(c) { hitLog.push(uid + ':' + c); }, remove() {}, toggle() {} },
      getAttribute(k) { return k === 'data-uid' ? uid : (k === 'data-name' ? name : null); },
      querySelector(sel) { return sel === '.gb-name' ? { getAttribute: k => (k === 'title' ? name : null) } : null; },
      get textContent() { return display; }
    };
  }
  /* 桩芯片刻意用**截断后的显示文字**（`Boss·混沌魔` → `Boss`）：这正是旧分支落空的形态 */
  const chips = [chipStub('enemy-0', 'Boss·混沌魔', 'Boss'),
    chipStub('enemy-1', '精英·狂战', '精英·狂'), chipStub('player', '🧑 你', '你')];
  const ovStub = {
    querySelector(sel) {
      const m = /data-uid="([^"]+)"/.exec(sel);
      return m ? (chips.filter(c => c.uid === m[1])[0] || null) : null;
    },
    querySelectorAll(sel) { return sel === '.gb-unit' ? chips : []; }
  };
  let midMissing = false;
  const doc = sb2.document;
  doc.getElementById = id => {
    if (id === 'battleOverlay') return ovStub;
    if (id === 'gbArenaMid') return midMissing ? null : midEl;
    return id === 'gbFx' ? layer : null;
  };
  doc.createElement = () => ({ style: {}, classList: { add() {}, remove() {} },
    setAttribute() {}, innerHTML: '', textContent: '', className: '', parentNode: null });
  const posOf = el => ((/left:(-?\d+)px;top:(-?\d+)px/.exec(el.style.cssText) || [, '?', '?']).slice(1).join(','));

  /* --- (a) 场地事件（无 targetId）命中芯片 --- */
  eq((sb2.gbCardForEvent(ovStub, null, { msg: '🪨 精英·狂战 受碎石伤害 40', type: 'terrain' }) || {}).uid,
    'enemy-1', '场地事件（无 targetId）按完整名命中芯片');
  ok(chips[1].textContent.indexOf('精英·狂战') < 0,
    '前提：该芯片显示文字确实被截断（旧 textContent.indexOf 分支必然落空）—— 实际 "'
    + chips[1].textContent + '"');
  eq((sb2.gbCardForEvent(ovStub, null, { msg: '🪨 🧑 你 受碎石伤害 40', type: 'terrain' }) || {}).uid,
    'player', '场地事件抠出的名字不带前导 emoji，仍能命中带 emoji 的芯片（两边都剥）');
  eq(sb2.gbCardForEvent(ovStub, null, { msg: '🪨 查无此人 受碎石伤害 40', type: 'terrain' }),
    null, '查不到的单位返回 null（不得错配到别的芯片）');
  eq((sb2.gbCardForEvent(ovStub, null, { msg: '⚡ 剑士 攻击 Boss·混沌魔 → 77 伤害', type: 'damage' }) || {}).uid,
    'enemy-0', '普攻文案（名字在箭头前）同样按完整名命中');
  ok(fnBody(grSrc, 'gbCardForEvent').indexOf('textContent') < 0,
    'gbCardForEvent 不得再用截断后的显示文字（textContent）做匹配 —— 那是 v2.4.2 修掉的 bug');
  ok(/data-name="'\+full\+'"/.test(fnBody(grSrc, 'renderGroupUnit')),
    'renderGroupUnit 的芯片必须带 data-name="完整名"（场地事件反查的唯一依据）');
  /* 显示文字不得为「修匹配」而改回完整名（信息密度契约） */
  const chipReal = sb.renderGroupUnit(mkUnit('z1', '精英·狂战', 'enemy', 100, 100), 'enemy');
  ok(chipReal.indexOf('data-name="精英·狂战"') > -1, '真渲染的芯片带完整名 data-name');
  const shown = (/<span class="gb-name"[^>]*>([^<]*)<\/span>/.exec(chipReal) || [, ''])[1];
  ok(shown.length > 0 && shown.length <= 4 && shown !== '精英·狂战',
    '芯片显示文字仍 ≤4 字（不得为了修匹配把显示文字改回完整名）：' + shown);

  /* --- (b) 飘字锚中央区 + 槽位错位 --- */
  layer.children.length = 0;
  sb2.gbFxFloat(midEl, '-40', 'var(--red)', false);
  sb2.gbFxFloat(midEl, '-55', 'var(--red)', false, 1);
  sb2.gbFxFloat(midEl, '-7', 'var(--red)', false, 2);
  sb2.gbFxFloat(midEl, '+120', 'var(--green)', false, 3);
  eq(layer.children.length, 4, '四条飘字都挂到 #gbFx 常驻层');
  const pos = layer.children.map(posOf);
  /* 中央区 rect = (100,500,200,100)：施法特效占上部 0.28、飘字占下部 0.8（v2.4.2 收口，
     两者同区会互压）。默认飘字 Y = 500 + 100*0.8 = 580；槽位偏移见 GB_FX_SLOT_OFF */
  eq(pos.join(' | '), '200,580 | 154,562 | 246,562 | 200,544',
    '同一步 4 条飘字按槽位错位（不传 slot 的默认位与旧行为一致）');
  ok(pos.every(p => { const q = p.split(',').map(Number); return q[0] >= 100 && q[0] <= 300 && q[1] >= 500 && q[1] <= 600; }),
    '所有飘字都落在中央区 rect 内（不是跑到舞台/芯片上去）：' + pos.join(' | '));
  ok(fnBody(grSrc, 'gbFxFloat').indexOf('*0.8') > -1,
    '飘字锚点用中央区高度的 0.8（下部）—— 源码守卫，防悄悄改回中心与施法特效互压');
  ok(new Set(pos).size === pos.length, '4 条飘字位置互不相同（否则叠成一坨）');
  ok(layer.children.every(e => e.className.indexOf('gb-fx-float') > -1), '飘字仍用 .gb-fx-float 类名（既有契约）');
  eq(midEl.childCount, 0, '飘字不是 #gbArenaMid 的子节点（overlay 每步 innerHTML 重建会冲掉）');

  /* --- (b2) playAttackFeedback：受击仍闪芯片，数字锚中央区 --- */
  layer.children.length = 0; hitLog.length = 0;
  const gbTerrain = { units: [], log: [{ turn: 2, unit: '🪨 场地',
    events: [{ msg: '🪨 精英·狂战 受碎石伤害 40', type: 'terrain' }] }] };
  sb2.playAttackFeedback(gbTerrain, null);
  eq(layer.children.length, 1, '场地事件出一条飘字');
  eq(layer.children[0].textContent, '-40', '飘字文案 = 场地伤害数值');
  eq(hitLog.join(','), 'enemy-1:gb-hit', '受击闪烁仍落在正确 data-uid 上（「谁被打」不丢）');
  eq(posOf(layer.children[0]), '200,580', '飘字锚在 #gbArenaMid 的**下部**（0.8 高），而不是单位芯片旁');
  /* 兜底：中央区缺失 → 不抛错、不出飘字、如实告警、受击闪烁仍在 */
  const savedConsole = sb2.console;
  const warns = [];
  sb2.console = { warn: m => warns.push(String(m)), log() {}, error() {} };
  layer.children.length = 0; hitLog.length = 0; midMissing = true;
  let threw = false;
  try { sb2.playAttackFeedback(gbTerrain, null); } catch (e) { threw = true; }
  ok(!threw, '#gbArenaMid 缺失时 playAttackFeedback 不得抛错（自动推进会因此卡死）');
  eq(layer.children.length, 0, '#gbArenaMid 缺失时不出飘字（兜底）');
  ok(warns.join(' ').indexOf('gbArenaMid') > -1, '兜底路径必须 console.warn 如实告警');
  eq(hitLog.join(','), 'enemy-1:gb-hit', '兜底时受击闪烁仍保留');
  midMissing = false;
  sb2.console = savedConsole;

  /* --- (c) gbShowSkillCast：skillId → 图标 src（真跑 skillIconHtml） --- */
  eq(sb2.SKILLS['spikes'] && sb2.SKILLS['spikes'].name, '地刺', '前提：SKILLS.spikes 有中文名（名字行的唯一来源）');
  const castFoe = mkUnit('e-m', '👹 魔像', 'enemy', 100, 1000);
  const bubble = { type: 'bubble', unit: '👹 魔像', skillId: 'spikes' };
  const gbCast = { units: [castFoe], allies: [castFoe], enemies: [castFoe], log: [{ turn: 2, unit: '👹 魔像',
    events: [bubble, { msg: '⚡ 魔像 地刺 → 你 100 伤害', type: 'damage', targetId: 'player' }] }] };
  sb2._groupSpeed = 1;
  layer.children.length = 0; midEl.childCount = 0;
  sb2.gbShowSkillCast(gbCast, bubble);
  eq(layer.children.length, 1, '一次施法渲染一个特效元素');
  const castHtml = layer.children[0].innerHTML;
  ok(castHtml.indexOf('src="media/skills/spikes.svg"') > -1,
    'skillId → 图标 src 真的接上了（不是靠技能名猜）：' + castHtml.slice(0, 120));
  ok(/class="sk-ico gb-skill-cast-ico"/.test(castHtml), '图标走 skillIconHtml 的类名契约（sk-ico + gb-skill-cast-ico）');
  ok(castHtml.indexOf('gb-skill-cast-name') > -1 && castHtml.indexOf('地刺') > -1,
    '名字行来自 SKILLS[skillId].name（地刺）');
  ok(layer.children[0].className.indexOf('tone-enemy') > -1, '敌方施法 → 敌方红光环');
  eq(midEl.childCount, 0, '特效**不是** #gbArenaMid 的子节点（每步 innerHTML 重建会把它冲掉）');
  eq(posOf(layer.children[0]), '200,528', '施法特效锚在中央区**上部**（0.28 高），与飘字上下分层不互压');
  { const c = posOf(layer.children[0]).split(',').map(Number);
    ok(c[0] >= 100 && c[0] <= 300 && c[1] >= 500 && c[1] <= 600, '施法特效落在中央区 rect 内：' + c.join(','));
    ok(c[1] < 544, '施法特效在飘字最低位（544 = 0.8 高 + 最大负偏移 -36）之上 —— 两者几何上不重叠'); }
  ok(fnBody(grSrc, 'gbShowSkillCast').indexOf('*0.28') > -1,
    '施法特效锚点用中央区高度的 0.28（上部）—— 源码守卫');
  /* 新的施法必须先清掉上一条（#gbFx 是常驻层，不清就叠字） */
  sb2.gbShowSkillCast(gbCast, { type: 'bubble', unit: '👹 魔像', skillId: 'cleanse' });
  eq(layer.children.length, 1, '每次新施法先清掉上一条特效');
  ok(layer.children[0].innerHTML.indexOf('cleanse.svg') > -1, '留下的是新那一条（净化）');
  /* gbFxClear 必须同时清掉施法元素（#gbClose / _groupDone 的调用点靠它兜底） */
  sb2.gbFxClear();
  eq(layer.children.length, 0, 'gbFxClear() 同时清掉施法特效');
  ok(fnBody(grSrc, 'gbFxClear').indexOf('gbCastClear') > -1, 'gbFxClear 体内确实清施法元素（否则退出战斗后残留）');
  /* 未知 skillId：不拼 404、不留空壳 */
  layer.children.length = 0;
  sb2.gbShowSkillCast(gbCast, { type: 'bubble', unit: '👹 魔像', skillId: 'no_such_skill' });
  eq(layer.children.length, 0, '未知 skillId 不渲染（宁缺勿错，不拼必然 404 的路径）');
  /* isPlayer 决定查哪张图标表：goldshield 只在玩家表里 */
  layer.children.length = 0;
  const hero = mkUnit('hero', '🧑 你', 'ally', 100, 100);
  const gbHero = { units: [hero], allies: [hero], enemies: [], log: [] };
  sb2.gbShowSkillCast(gbHero, { type: 'bubble', unit: '🧑 你', skillId: 'goldshield' });
  eq(layer.children.length, 1, '我方非宠物施法 → isPlayer=true，走玩家图标表');
  ok(layer.children[0].innerHTML.indexOf('goldshield.svg') > -1, '玩家技能图标 src 正确');
  ok(layer.children[0].className.indexOf('tone-ally') > -1, '我方施法 → 友方绿光环');
  /* 宠物技能：isPlayer=false（走敌方/宠物合并表），但阵营是我方 → 仍是绿光环 */
  layer.children.length = 0;
  const petA = mkUnit('pet1', '🐾 星尘', 'ally', 100, 100);
  petA._petSpecies = 'sparkle';
  const gbPet = { units: [petA], allies: [petA], enemies: [], log: [] };
  sb2.gbShowSkillCast(gbPet, { type: 'bubble', unit: '🐾 星尘', skillId: 'p_shine' });
  eq(layer.children.length, 1, '宠物技能 isPlayer=false 也能出图标（false 分支同时吃敌方表与宠物表）');
  ok(layer.children[0].innerHTML.indexOf('p_shine.svg') > -1, '宠物技能图标 src 正确');
  ok(layer.children[0].className.indexOf('tone-ally') > -1,
    '宠物是我方 → 光环按**阵营**取绿（不得按 isPlayer 上色，否则自家宠物被标成敌方红）');
  /* 高倍速降级：≥×4 不渲染文字行（步进 87~112ms，字还没看清就被盖掉） */
  layer.children.length = 0;
  sb2._groupSpeed = 4;
  sb2.gbShowSkillCast(gbCast, bubble);
  eq(layer.children.length, 1, '×4 仍出特效（只降级文字，不降级图标）');
  ok(layer.children[0].innerHTML.indexOf('gb-skill-cast-name') < 0, '×4 及以上不渲染技能名文字行');
  ok(layer.children[0].innerHTML.indexOf('spikes.svg') > -1, '×4 仍渲染图标');
  sb2._groupSpeed = 1;
  sb2.gbFxClear();
  layer.children.length = 0;

  /* --- (d) gbStepSummary：纯函数 --- */
  const bubDmg = { type: 'bubble', unit: '👹 魔像', skillId: 'blizzard' };
  const bubHeal = { type: 'bubble', unit: '👹 魔像', skillId: 'heal' };
  eq(sb2.gbStepSummary(null, [{ type: 'damage', targetId: 'a' }, { type: 'damage', targetId: 'b' },
    { type: 'damage', targetId: 'c' }], bubDmg), '魔像 对 3 个目标使用了 暴风雪', '伤害类多目标 → 对 N 个目标使用了');
  eq(sb2.gbStepSummary(null, [{ type: 'heal', targetId: 'a' }, { type: 'heal', targetId: 'b' }], bubHeal),
    '魔像 对全队施加了 治愈', 'buff/status/heal 多目标 → 对全队施加了');
  eq(sb2.gbStepSummary(null, [{ type: 'damage', targetId: 'a' }], bubDmg), '魔像 使用了 暴风雪', '单目标 → 中性句');
  eq(sb2.gbStepSummary(null, [{ type: 'damage', targetId: 'a' }, { type: 'damage', targetId: 'a' }], bubDmg),
    '魔像 使用了 暴风雪', '同一目标被多段命中只算 1 个（按不同 targetId 计数）');
  eq(sb2.gbStepSummary(null, [{ type: 'status', targetId: 'a' }, { type: 'status', targetId: 'b' },
    { type: 'damage', targetId: 'c' }], bubDmg), '魔像 对 3 个目标使用了 暴风雪', '混合型走伤害分支（伤害是更硬的事实）');
  eq(sb2.gbStepSummary(null, [], { type: 'bubble', unit: '👹 魔像', skillId: 'no_such_skill' }), '',
    '拿不到技能名 → 返回空串（不得编造技能名）');
  eq(sb2.gbStepSummary(null, [{ type: 'damage', targetId: 'a' }, { type: 'damage', targetId: 'b' }], null), '',
    '没有 bubble 就没有句子（技能身份的唯一来源是 bubble）');
  ok(fnBody(grSrc, 'gbStepSummary').indexOf('document') < 0, 'gbStepSummary 是纯函数（不碰 DOM）');
  /* 句子里的技能名必须来自 SKILLS 表（换一个 id 名字要跟着换） */
  eq(sb2.gbStepSummary(null, [{ type: 'damage', targetId: 'a' }, { type: 'damage', targetId: 'b' }],
    { type: 'bubble', unit: '👹 魔像', skillId: 'spikes' }), '魔像 对 2 个目标使用了 地刺',
    '技能名随 skillId 变（来自 SKILLS，不是写死的模板）');
}

/* ============ 14. v2.4.2 收口：显示名剥档位前缀 / 开场刷屏一句话 / 技能名兜底 ============

   三件都是「主控收口」时补的行为，各有明确的失败形态：
     a) 名字上限 4 字 + 敌人名带档位前缀 → `Boss·混沌魔` 直接截断会变成 `Boss`，
        同档位多个单位**全部显示成同一个词**，芯片丧失辨识度 → 剥前缀再截断。
     b) 开战钩子（player-skill-hooks.js 的 onBattleStart 金身护盾）**给每个队友各推一条**，
        5 个我方单位 = 5 条同技能事件，且 `opening` 条目**没有 bubble**（中央区覆盖不到）
        → 由战斗页那一行文本压成一句（作者点名的「开场刷屏」）。
     c) 玩家技能注册在 PLAYER_SKILLS、不在 SKILLS → 技能名兜底再查一次，仍拿不到就返回空串。 */
console.log('--- 14. 收口：档位前缀 / 开场一句话 / 技能名兜底 ---');
{
  const sb3 = makeSandbox();
  /* (a) gbUnitShortName */
  eq(sb3.gbUnitShortName('Boss·混沌魔'), '混沌魔', 'Boss 前缀被剥掉（否则同档位多个单位都显示 Boss）');
  eq(sb3.gbUnitShortName('精英·狂战'), '狂战', '精英· 前缀被剥掉');
  eq(sb3.gbUnitShortName('杂兵·弓'), '弓', '杂兵· 前缀被剥掉');
  eq(sb3.gbUnitShortName('🧑 你'), '你', '玩家：剥前导 emoji 后显示「你」');
  eq(sb3.gbUnitShortName('熔岩巨兽'), '熔岩巨兽', '无前缀时按 4 字截断（不误伤正常名字）');
  eq(sb3.gbUnitShortName('万古长夜守望者'), '万古长夜', '超长名截断到前 4 字');
  /* 真渲染：芯片显示名不得再是 "Boss"，同时完整名仍留在 data-name / title */
  const foe = { id: 'e0', side: 'enemy', name: 'Boss·混沌魔', level: 1, hp: 100,
    base: { hp: 100, atk: 1, def: 1, spd: 1 }, statuses: [] };
  const chipHtml = sb3.renderGroupUnit(foe, 'enemy');
  const shownName = (/<span class="gb-name"[^>]*>([^<]*)<\/span>/.exec(chipHtml) || [, ''])[1];
  eq(shownName, '混沌魔', '真渲染：Boss·混沌魔 的芯片显示「混沌魔」而不是「Boss」');
  ok(chipHtml.indexOf('data-name="Boss·混沌魔"') > -1, '完整名仍进 data-name（场地事件反查的唯一依据）');
  ok(chipHtml.indexOf('title="Boss·混沌魔"') > -1, '完整名仍进 title（悬停/读屏）');

  /* (b) gbOpeningSummary：5 条同技能开场事件 → 一行 */
  const shield = n => ({ msg: '🛡️ ' + n + ' 金身护盾 +733（吸收伤害；盾存在期间免疫普通~高级负面）' });
  const openEntry = { turn: 0, unit: '开场', opening: true, events: [
    shield('🧑 你'), shield('闪闪星'), shield('冰晶'), shield('熔岩'), shield('疾风'),
    { msg: '💢 某单位 的 威吓 触发强化（本次伤害 +50%）' }] };
  const openGb = { units: [], allies: [{}, {}, {}, {}, {}], enemies: [{}], log: [openEntry] };
  const sum = sb3.gbOpeningSummary(openGb);
  ok(sum.indexOf('金身护盾') > -1, '开场一句话点出技能名：' + sum);
  ok(sum.indexOf('5 人') > -1, '人数取实测值（5 个我方单位）');
  ok(sum.indexOf('3665') > -1, '合计取实测值（733×5）');
  eq(sum.split('金身护盾').length - 1, 1, '技能名只出现一次（这就是「不刷屏」的判据）');
  eq(sb3.gbOpeningSummary({ units: [], log: [{ turn: 0, unit: '开场', opening: true, events: [shield('你')] }] }),
    '', '只有 1 条时不必压（返回空串）');
  eq(sb3.gbOpeningSummary({ units: [], log: [] }), '', '没有开场条目 → 空串（不渲染空壳）');
  ok(sb3.gbLineupHtml(openGb).indexOf('gb-lineup-open') > -1, '战斗页那一行渲染出开场一句话');
  ok(sb3.gbLineupHtml({ units: [], allies: [{}], enemies: [{}], log: [] }).indexOf('gb-lineup-open') < 0,
    '没有开场事件时不渲染那一行');
  ok(css.indexOf('.gb-lineup-open{') > -1, 'CSS 有 .gb-lineup-open 规则（否则是裸文本）');
  /* 纯函数：不得碰 DOM（否则会被 _groupStep 的重建节奏牵连） */
  ok(fnBody(grSrc, 'gbOpeningSummary').indexOf('document') < 0, 'gbOpeningSummary 是纯函数（不碰 DOM）');
  ok(fnBody(grSrc, 'gbUnitShortName').indexOf('document') < 0, 'gbUnitShortName 是纯函数（不碰 DOM）');

  /* (c) gbSkillName：SKILLS 优先，查不到 → 空串 */
  eq(sb3.gbSkillName('spikes'), '地刺', 'SKILLS 里的技能名优先');
  eq(sb3.gbSkillName('__no_such_skill__'), '', '两条表都查不到 → 空串（宁可只显示图标，不编造）');
  eq(sb3.gbSkillName(''), '', '空 id → 空串');
}

/* ---------- 汇总 ---------- */
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
if (fail) { console.log('\n失败项：'); fails.forEach(f => console.log(' ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);

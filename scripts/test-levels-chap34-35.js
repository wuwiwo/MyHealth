#!/usr/bin/env node
/* 关卡试炼（单敌，`page/levels.js` 的 `LEVELS`）扩章守卫 —— chap34 / chap35
   ============================================================
   ⚠️ 范围分界（本项目最容易搞混的一点，见 HANDOFF §6.7）：
      本套只守**关卡试炼 = `LEVELS`（单敌，手写常量）**。
      **敌群试炼**（`page/group-levels.js` 的 `GROUP_LEVELS`，多对多）是另一套系统，
      本套一行也不碰（它的守卫是 `scripts/test-group-*.js`）。

   为什么需要这一套：
     `LEVELS` 是**手写数据、没有任何斜率/章数断言**（v2.1.36 施工记录 §5 明确留了这个坑：
     「数值抄错也不会被拦」）。扩章时唯一的防线就是脚本 + 本套回归。

   本套守 6 组不变量（对应本轮需求）：
     1. **章数 35 / 关数 201**，章键 chap1..chap35 连续、章名唯一
     2. **结构**：chap4~35 每章 6 关（chap1~3 是 3 关教学章，历史约定，**不是异常**）、
        id = `x-1..x-6`、全局唯一、字段齐全
     3. **BOSS 约定**：x-6 是 BOSS、`boss:true`、名字带 `BOSS ` 前缀；
        **chap16 起 `dualAffix:true`**（chap4~15 保持单词条，反向对照）
     4. **斜率 ≈1.113×**：chap22~35 的相邻章 × 每槽位 × 5 字段，倍率须落在 1.113±1%；
        **另外逐格严格复算** `round(上章×1.113/5)*5` —— 这是本轮（及 v2.1.36）的生成口径
     5. **数值是 5 的倍数**（全表；早期 4-6/6-6/7-6/8-6 缺 soulAtk/soulDef，按 0 计）
     6. **解锁链能到 chap35**：跑真实的 `allPrevCleared()`（game-render.js），
        而不是复刻一份规则；另加「章数/遍历必须派生自 LEVELS」的源码守卫

   容差怎么定的：取整到 5 的倍数带来的相对误差上限是 2.5/最小数值（本段最小 780 → 0.32%），
   实测 chap22~35 的相邻倍率落在 1.1067~1.1194（偏离 1.113 最大 0.6%），
   故 ±1% 既能容纳取整噪声、又能抓住真实的数抄错（错一档就是 5% 量级）。

   Run: node scripts/test-levels-chap34-35.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}

/* ============================================================
   沙箱：levels.js + battle.js + game-render.js
   game-render.js 是为了跑**真实的** allPrevCleared()（解锁链），
   故须先备好它加载/取值时会碰到的全局（与 test-auto-speed.js 同风格，无 jsdom 依赖）。
   ============================================================ */
function makeEl(id) {
  return {
    id: id, dataset: {}, style: {}, className: '', textContent: '', innerHTML: '', value: '',
    scrollTop: 0, scrollHeight: 0, offsetWidth: 1, hidden: false, _kids: [],
    classList: {
      _s: Object.create(null),
      add(c) { this._s[c] = true; },
      remove(c) { delete this._s[c]; },
      contains(c) { return !!this._s[c]; },
      toggle(c, force) { const on = (force === undefined) ? !this._s[c] : !!force; if (on) this._s[c] = true; else delete this._s[c]; return on; }
    },
    appendChild(c) { this._kids.push(c); return c; },
    removeChild(c) { const i = this._kids.indexOf(c); if (i >= 0) this._kids.splice(i, 1); return c; },
    remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
  };
}

let game = { current: '1-1', cleared: [], attempts: {} };   // 解锁链夹具（由 setCleared 改写）
const sb = { Math, JSON, console, Date, RegExp, Object, Array, String, Number };
sb.window = sb; sb.globalThis = sb;
sb.document = {
  getElementById: id => makeEl(id), createElement: () => makeEl(''),
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {} }, documentElement: { setAttribute() {} }, addEventListener() {}
};
sb.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
sb.setTimeout = () => 0; sb.clearTimeout = () => {}; sb.setInterval = () => 0; sb.clearInterval = () => {};
sb.getGame = () => game;
sb.setGame = g => { game = g; };
sb.store = { get: () => ({}), set() {}, registerSchema() {} };

vm.createContext(sb);
['levels.js', 'battle.js', 'game-render.js'].forEach(f => vm.runInContext(src(f), sb, { filename: f }));

const LEVELS = vm.runInContext('LEVELS', sb);
const findLevel = id => vm.runInContext('findLevel(' + JSON.stringify(id) + ')', sb);
/* 直接调**真实实现**（game-render.js 的全局函数），不用测试侧复刻 */
const allPrevCleared = (chKey, lvId) =>
  vm.runInContext('allPrevCleared(' + JSON.stringify(chKey) + ',' + JSON.stringify(lvId) + ')', sb);

const FIELDS = ['atk', 'def', 'hp', 'soulAtk', 'soulDef'];
const R = 1.113;          // 每章斜率（五个字段一致）
const TOL = 0.01;         // ±1%（见文件头「容差怎么定的」）
const RATIO_FROM = 'chap22';   // 斜率自 chap22 起成文统一（v2.1.36 施工记录 §1）
const DUAL_FROM = 16;          // BOSS 双词条自 chap16 起

const keys = Object.keys(LEVELS);
const chNo = k => Number(String(k).replace('chap', ''));
const allLevels = [];
keys.forEach(k => LEVELS[k].levels.forEach(lv => allLevels.push(lv)));

/* ============================================================
   1. 章数与规模
   ============================================================ */
console.log('--- 1. 章数 / 关数 / 章名 ---');
const expectKeys = Array.from({ length: 35 }, (_, i) => 'chap' + (i + 1));
assert('LEVELS 共 35 章', keys.length === 35, '实际 ' + keys.length);
assert('章键为 chap1..chap35（顺序连续、无缺号）', keys.join(',') === expectKeys.join(','),
  '实际尾部 ' + keys.slice(-3).join(','));
assert('总关数 201（chap1~3 各 3 关 + chap4~35 各 6 关 = 9 + 192）',
  allLevels.length === 201, '实际 ' + allLevels.length);

const badLen = keys.filter(k => LEVELS[k].levels.length !== (chNo(k) <= 3 ? 3 : 6))
  .map(k => k + '=' + LEVELS[k].levels.length);
assert('chap4~chap35 每章 6 关（新增 chap34/35 也是 6 关）', badLen.length === 0, badLen.join(', '));
assert('chap1~3 仍是 3 关教学章（历史约定，不是异常）',
  ['chap1', 'chap2', 'chap3'].every(k => LEVELS[k].levels.length === 3),
  ['chap1', 'chap2', 'chap3'].map(k => LEVELS[k].levels.length).join('/'));

assert('chap34 存在', !!LEVELS.chap34 && Array.isArray(LEVELS.chap34.levels));
assert('chap35 存在', !!LEVELS.chap35 && Array.isArray(LEVELS.chap35.levels));
assert('chap34 章名 = 鸿蒙初辟', !!LEVELS.chap34 && LEVELS.chap34.name === '鸿蒙初辟',
  LEVELS.chap34 && LEVELS.chap34.name);
assert('chap35 章名 = 万道归墟', !!LEVELS.chap35 && LEVELS.chap35.name === '万道归墟',
  LEVELS.chap35 && LEVELS.chap35.name);
const names = keys.map(k => LEVELS[k].name);
assert('35 个章名非空且全局唯一', names.every(n => typeof n === 'string' && n.length > 0)
  && new Set(names).size === names.length, '唯一数 ' + new Set(names).size);

/* ============================================================
   2. 关卡结构 / 字段
   ============================================================ */
console.log('--- 2. 关卡结构 / 字段 ---');
const idBad = [];
keys.forEach(k => {
  LEVELS[k].levels.forEach((lv, i) => {
    const want = chNo(k) + '-' + (i + 1);
    if (lv.id !== want) idBad.push(lv.id + ' ≠ ' + want);
  });
});
assert('全部关卡的 id 与「章号-序号」一致（x-1..x-6 连续）', idBad.length === 0, idBad.slice(0, 5).join(', '));
assert('关卡 id 全局唯一', new Set(allLevels.map(l => l.id)).size === allLevels.length,
  '唯一 ' + new Set(allLevels.map(l => l.id)).size + ' / ' + allLevels.length);
assert('敌人名全局唯一（201 个不同 npc）',
  new Set(allLevels.map(l => l.npc)).size === allLevels.length,
  '唯一 ' + new Set(allLevels.map(l => l.npc)).size + ' / ' + allLevels.length);

const NEW = ['chap34', 'chap35'];
const missing = [];
NEW.forEach(k => LEVELS[k].levels.forEach(lv => {
  FIELDS.forEach(f => { if (typeof lv[f] !== 'number' || !isFinite(lv[f])) missing.push(lv.id + '.' + f); });
  if (typeof lv.npc !== 'string' || !lv.npc) missing.push(lv.id + '.npc');
}));
assert('chap34/35 每关 5 个数值字段齐全且为有限数（npc 非空）', missing.length === 0, missing.join(', '));

const not5 = [], notPos = [];
allLevels.forEach(lv => FIELDS.forEach(f => {
  const v = lv[f] || 0;                   // 早期 4-6/6-6/7-6/8-6 缺 soulAtk/soulDef → 按 0 计
  if (!Number.isInteger(v) || v % 5 !== 0) not5.push(lv.id + '.' + f + '=' + lv[f]);
}));
assert('全表数值都是整数且为 5 的倍数（缺省字段按 0 计）', not5.length === 0, not5.slice(0, 5).join(', '));
NEW.forEach(k => LEVELS[k].levels.forEach(lv => FIELDS.forEach(f => {
  if (!(lv[f] > 0)) notPos.push(lv.id + '.' + f);
})));
assert('chap34/35 数值全部为正（新章不允许出现 0 / 负数）', notPos.length === 0, notPos.join(', '));

/* ============================================================
   3. BOSS 约定（x-6 / boss:true / dualAffix）
   ============================================================ */
console.log('--- 3. BOSS 约定 ---');
const bossBad = [];
keys.forEach(k => {
  const lv = LEVELS[k].levels, bosses = lv.filter(x => x.boss);
  if (chNo(k) <= 3) { if (bosses.length) bossBad.push(k + ' 教学章不应有 BOSS'); return; }
  if (bosses.length !== 1) bossBad.push(k + ' BOSS 数=' + bosses.length);
  const last = lv[lv.length - 1];
  if (!last || !last.boss) bossBad.push(k + ' 末关不是 BOSS');
  if (!last || last.id !== chNo(k) + '-6') bossBad.push(k + ' BOSS 不在 x-6（' + (last && last.id) + '）');
});
assert('chap4~35：每章恰好 1 个 BOSS 且固定在 x-6（chap1~3 无 BOSS）', bossBad.length === 0, bossBad.join(', '));

const preBad = [];
allLevels.forEach(lv => {
  const prefixed = /^BOSS\s/.test(lv.npc);
  if (prefixed && !lv.boss) preBad.push(lv.id + ' 名字带 BOSS 前缀但 boss 为假');
  if (!prefixed && lv.boss) preBad.push(lv.id + ' boss 为真但名字无 BOSS 前缀');
});
assert('boss 字段与「BOSS 」名字前缀全表一致（不靠 id 猜）', preBad.length === 0, preBad.slice(0, 3).join(', '));

const dualBad = [];
keys.forEach(k => {
  const b = LEVELS[k].levels.find(x => x.boss);
  if (!b) return;
  const want = chNo(k) >= DUAL_FROM;
  if (!!b.dualAffix !== want) dualBad.push(b.id + ' dualAffix=' + !!b.dualAffix);
});
assert('chap16 起 BOSS 全部 dualAffix:true（chap4~15 仍单词条，反向对照）',
  dualBad.length === 0, dualBad.join(', '));
assert('34-6 / 35-6 是 boss:true + dualAffix:true',
  !!LEVELS.chap34.levels[5].boss && !!LEVELS.chap34.levels[5].dualAffix
  && !!LEVELS.chap35.levels[5].boss && !!LEVELS.chap35.levels[5].dualAffix);

/* 行为级：dualAffix 真的产出**两条**词条（否则等于漏字段、BOSS 少一条词条） */
sb._battleRng = sb.mulberry32(20261013);
const affix34 = sb.rollBossAffixFor(LEVELS.chap34.levels[5]);
const affix35 = sb.rollBossAffixFor(LEVELS.chap35.levels[5]);
const affix15 = sb.rollBossAffixFor(LEVELS.chap15.levels[5]);
assert('rollBossAffixFor(34-6) 产出双词条（名字含 · 分隔）',
  !!affix34 && String(affix34.name).split('·').length === 2, affix34 && affix34.name);
assert('rollBossAffixFor(35-6) 产出双词条（名字含 · 分隔）',
  !!affix35 && String(affix35.name).split('·').length === 2, affix35 && affix35.name);
assert('对照：rollBossAffixFor(15-6) 仍是单词条（dualAffix 未滥用）',
  !affix15 || String(affix15.name).split('·').length === 1, affix15 && affix15.name);

/* ============================================================
   4. 斜率 ≈1.113×
   ============================================================ */
console.log('--- 4. 斜率 1.113× ---');
const fromIdx = keys.indexOf(RATIO_FROM);
const ratioBad = [];
for (let i = Math.max(1, fromIdx); i < keys.length; i++) {
  const a = LEVELS[keys[i - 1]].levels, b = LEVELS[keys[i]].levels;
  a.forEach((lv, j) => FIELDS.forEach(f => {
    const r = b[j][f] / lv[f];
    if (!(Math.abs(r / R - 1) <= TOL)) {
      ratioBad.push(b[j].id + '.' + f + ' ' + r.toFixed(5));
    }
  }));
}
assert(RATIO_FROM + '~chap35：相邻章 × 6 槽位 × 5 字段倍率全在 1.113±1% 内',
  ratioBad.length === 0, ratioBad.slice(0, 6).join(', '));

/* 逐格严格复算：本轮与 v2.1.36 的生成口径 round(上章×1.113/5)*5（比 ±1% 更严，防手改漂移） */
const q5 = v => Math.round(v * R / 5) * 5;
const strictBad = [];
let prev = LEVELS.chap33.levels;
NEW.forEach(k => {
  LEVELS[k].levels.forEach((lv, j) => FIELDS.forEach(f => {
    const want = q5(prev[j][f]);
    if (want !== lv[f]) strictBad.push(lv.id + '.' + f + ' 实际 ' + lv[f] + ' ≠ 口径值 ' + want);
  }));
  prev = LEVELS[k].levels;
});
assert('chap34/35 逐格 === round(上章×1.113/5)*5（脚本口径，非手抄）',
  strictBad.length === 0, strictBad.slice(0, 6).join(', '));

const monoBad = [];
NEW.forEach(k => {
  const a = LEVELS[keys[keys.indexOf(k) - 1]].levels, b = LEVELS[k].levels;
  a.forEach((lv, j) => FIELDS.forEach(f => { if (!(b[j][f] > lv[f])) monoBad.push(b[j].id + '.' + f); }));
});
assert('chap34/35 每个槽位每个字段都严格强于上一章（不会出现「新章更弱」）',
  monoBad.length === 0, monoBad.join(', '));

/* BOSS 三连对照：33 → 34 → 35（作者最容易拿这三行核对） */
const bossOf = k => LEVELS[k].levels[5];
const bossDisc = [];
[['chap34', 'chap33'], ['chap35', 'chap34']].forEach(function (pair) {
  FIELDS.forEach(f => {
    const r = bossOf(pair[0])[f] / bossOf(pair[1])[f];
    if (!(Math.abs(r / R - 1) <= TOL)) bossDisc.push(pair[1] + '→' + pair[0] + '.' + f + ' ' + r.toFixed(5));
  });
});
assert('BOSS 单独核：33→34 与 34→35 的 5 字段倍率都在 1.113±1% 内', bossDisc.length === 0, bossDisc.join(', '));
assert('BOSS atk 在 34/35 仍低于同章 x-4（高攻槽位不退化）',
  bossOf('chap34').atk < LEVELS.chap34.levels[3].atk && bossOf('chap35').atk < LEVELS.chap35.levels[3].atk,
  bossOf('chap34').atk + '<' + LEVELS.chap34.levels[3].atk);
/* ⚠️ 实测事实（chap22~35 全部一致）：BOSS 是**同章 hp 最高**；但 **def 峰值属于 x-3（高防高血）**，
   BOSS 只是「def 高于 x-1/x-2/x-4/x-5 四个槽」。HANDOFF §6.7 那句「x-6 BOSS（atk 中上、def/hp 最高）」
   在 def 这一半上与数据不符（既有 chap22~33 就已如此），本套按**数据事实**断言，不按文案断言。 */
assert('BOSS hp 是同章最高（x-6 定位）',
  ['chap34', 'chap35'].every(k => LEVELS[k].levels.every(x => x.hp <= bossOf(k).hp)));
assert('BOSS def 高于 x-1/x-2/x-4/x-5 四槽（def 峰值归 x-3 高防槽，与既有 33 章一致）',
  ['chap34', 'chap35'].every(k => [0, 1, 3, 4].every(i => bossOf(k).def > LEVELS[k].levels[i].def)),
  ['chap34', 'chap35'].map(k => bossOf(k).def + ' vs ' + [0, 1, 3, 4].map(i => LEVELS[k].levels[i].def).join('/')).join(' | '));

/* ============================================================
   5. 解锁链能到 chap35（跑真实 allPrevCleared）
   ============================================================ */
console.log('--- 5. 解锁链 / 派生性 ---');
const IDS = allLevels.map(l => l.id);
const setCleared = ids => sb.setGame({ current: '', cleared: ids.slice(), attempts: {} });
const without = drop => IDS.filter(id => drop.indexOf(id) < 0);

const lv356 = findLevel('35-6');
assert('findLevel("35-6") 能取到关卡（派生查找，遍历 LEVELS）', !!lv356 && lv356.id === '35-6');
assert('findLevel 越界返回 null（35-7 不存在）', findLevel('35-7') === null);

setCleared(without(['35-6']));
assert('chap1~35-5 全清 → allPrevCleared("chap35","35-6") 为真（末章末关可解锁）',
  allPrevCleared('chap35', '35-6') === true);
setCleared(without(['35-5', '35-6']));
assert('少清一个 35-5 → 35-6 立刻锁上（同章内链条真的串着）',
  allPrevCleared('chap35', '35-6') === false);
const throughChap34 = IDS.filter(id => chNo(id.split('-')[0]) <= 34);
setCleared(throughChap34);
assert('清完 chap34 → allPrevCleared("chap35","35-1") 为真（跨章解锁）',
  allPrevCleared('chap35', '35-1') === true);
assert('清完 chap34 但 35-1 未过 → 35-2 仍锁着',
  allPrevCleared('chap35', '35-2') === false);
const throughChap33 = IDS.filter(id => chNo(id.split('-')[0]) <= 33);
setCleared(throughChap33);
assert('只清到 chap33 → chap35-1 锁着（新增章必须接在 chap34 之后，不是白送）',
  allPrevCleared('chap35', '35-1') === false);
setCleared(without(['34-1']));
assert('chap34 缺一关（34-1）→ chap35-1 锁着（前置章必须全清）',
  allPrevCleared('chap35', '35-1') === false);
setCleared([]);
assert('空进度 → allPrevCleared("chap1","1-1") 为真（教学章入口不受影响）',
  allPrevCleared('chap1', '1-1') === true);

/* 源码守卫：章数 / 遍历必须**派生自 LEVELS**，不许有人写死 35（或退回写死 33） */
const gameViews = src('game-views.js'), gameRender = src('game-render.js'), gameBattle = src('game-battle.js');
assert('章数徽标派生自 Object.keys(LEVELS).length（game-views.js）',
  /Object\.keys\(LEVELS\)\.length\+\s*['"]\s*章/.test(gameViews),
  '未匹配到派生表达式');
assert('关卡列表遍历派生自 Object.entries(LEVELS)（game-render.js）',
  /Object\.entries\(LEVELS\)/.test(gameRender));
assert('「下一关」推进派生自 Object.values(LEVELS)（game-battle.js）',
  /Object\.values\(LEVELS\)/.test(gameBattle));

/* ============================================================
   6. 信息段：chap33 / 34 / 35 的 BOSS 属性对照（不产生断言）
   ============================================================ */
console.log('--- 6. BOSS 属性对照（atk/def/hp/soulAtk/soulDef）---');
['chap33', 'chap34', 'chap35'].forEach(k => {
  const b = bossOf(k);
  console.log('  ' + b.id + ' ' + b.npc + '  ' + FIELDS.map(f => f + '=' + b[f]).join('  ')
    + (b.dualAffix ? '  [dualAffix]' : ''));
});
console.log('  倍率 33→34: ' + FIELDS.map(f => (bossOf('chap34')[f] / bossOf('chap33')[f]).toFixed(4)).join(' / '));
console.log('  倍率 34→35: ' + FIELDS.map(f => (bossOf('chap35')[f] / bossOf('chap34')[f]).toFixed(4)).join(' / '));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

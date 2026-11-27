#!/usr/bin/env node
/* v2.14.19 阶段 B → **v2.14.24 收窄**：「小队接力」只在双场景导演里使用
   （作者裁决：单场景关不保留接力）。
   覆盖：引擎 reinforce 能力（默认行为逐字不变 / gbReinforce 幂等与双池同步 /
        本队全灭先增援后判负 / D3 / winnerRule 'all' 与 'pets' / 增援只对新单位补跑 onBattleStart）+
        **单场景已不接线**（提供方与三个全局删除）
   设计依据：doc/design-pet-squad-battle-v1.md §3 / Q5 / Q7（定稿 v1.2）+ v2.14.24 裁决
   Run: node scripts/test-squad-relay.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m, extra) {
  if (c) { pass++; console.log(' ✓ ' + m); }
  else { fail++; console.log(' ✗ ' + m + (extra !== undefined ? '  → ' + extra : '')); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);

const ls = {};
ls['dh-pets-v1'] = JSON.stringify({
  version: 1, pets: [],
  materials: { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 },
  orbs: [], battlePicks: [], squads: [], lastSettleDate: null, monthlyKey: null
});

function mkEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', textContent: '', value: ''
  };
}
const sb = { console, JSON, Date, navigator: { userAgent: 'test' } };
sb.window = sb; sb.globalThis = sb;
sb.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sb.document = {
  getElementById: () => mkEl(), createElement: () => mkEl(),
  body: { appendChild() {}, remove() {} }, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {} }
};
sb.toast = function () {}; sb.location = { search: '' }; sb.addEventListener = () => {};
sb.confirm = () => true; sb.setTimeout = () => 0; sb.setInterval = () => 0;
sb.clearTimeout = () => {}; sb.clearInterval = () => {}; sb.requestAnimationFrame = () => 0;
sb.innerWidth = 375; sb.innerHeight = 700; sb.navigator.vibrate = () => {};
vm.createContext(sb);
scripts.forEach(src => vbRun(src));

function vbRun(src) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', src), 'utf8'), sb, { filename: src });
}

/* ---------- 造单位的小工具 ---------- */
let _uid = 0;
function mkUnit(name, side, hp) {
  const base = { hp: hp, atk: 10, def: 5, spd: 10, soulAtk: 0, soulDef: 0 };
  const u = {
    id: (side === 'ally' ? 'a' : 'e') + (_uid++), side: side, name: name,
    base: base, hp: hp, level: 1,
    counters: { cd: {} }, statuses: [], skills: [], _talents: []
  };
  return u;
}
function build(opts) { return sb.createGroupBattle(opts); }

/* ---------- 1. 默认行为：没有 relay 接线时与改前一致 ---------- */
console.log('\n[1] 默认字段与判负口径（' + '未接线 = 改前行为' + '）');
(function () {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('宠1', 'ally', 50);
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 1 });
  ok(gb.winnerRule === 'all', "默认 winnerRule = 'all'");
  ok(gb.squadUnits === null && gb.reinforce === null, '未接线时 squadUnits / reinforce 均为 null');
  /* 宠物死光、玩家仍在 → 'all' 口径下**不判负**（与改前完全相同） */
  a1.hp = 0; sb.checkGroupWin(gb);
  ok(!gb.done, '宠物全灭但玩家还活着 → 不判负（改前口径）');
  /* 玩家也倒 → 判负 */
  p.hp = 0; sb.checkGroupWin(gb);
  ok(gb.done && gb.winner === 'enemy', '我方全体倒下 → 判敌方胜（改前口径）');
})();

/* ---------- 2. gbReinforce：双池同步 + 幂等 ---------- */
console.log('\n[2] gbReinforce 把单位并入 allies 与 units（幂等）');
(function () {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('宠1', 'ally', 50);
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 2 });
  const n2 = mkUnit('宠2', 'ally', 40);
  const r1 = sb.gbReinforce(gb, [n2]);
  ok(r1.ok && r1.added === 1, '新增 1 个单位');
  ok(gb.allies.indexOf(n2) > -1 && gb.units.indexOf(n2) > -1, 'allies 与 units **同时**含新单位');
  ok(gb.squadUnits.length === 1 && gb.squadUnits[0] === n2, 'squadUnits 切到新小队');
  const r2 = sb.gbReinforce(gb, [n2]);
  ok(!r2.ok && r2.added === 0, '同一单位重复增援 → 不重复 push（幂等）');
  ok(gb.allies.filter(u => u === n2).length === 1, 'allies 里只有一份');
  const r3 = sb.gbReinforce(gb, []);
  ok(!r3.ok, '空数组增援是 no-op');
  /* 战斗已结束时不增援 */
  gb.done = true;
  const r4 = sb.gbReinforce(gb, [mkUnit('宠3', 'ally', 30)]);
  ok(!r4.ok, '战斗已结束 → 拒绝增援');
  gb.done = false;
})();

/* ---------- 3. 接力：先增援、后判负（顺序是硬要求） ---------- */
console.log('\n[3] 本队全灭 → 先换队，再判负');
(function () {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('一队宠', 'ally', 50);
  const e1 = mkUnit('敌', 'enemy', 60);
  const queue = [[mkUnit('二队宠', 'ally', 40)]];
  let asked = 0;
  const gb = build({
    allies: [p, a1], enemies: [e1], seed: 3,
    squadUnits: [a1],
    reinforce: function () { asked++; return queue.shift() || null; }
  });
  ok(gb.squadUnits.length === 1 && gb.reinforce, '接力接线已生效');
  a1.hp = 0;
  sb.checkGroupWin(gb);
  ok(asked === 1 && !gb.done, '一队全灭 → 问了 1 次增援，且**没有**当场判负', 'asked=' + asked + ' done=' + gb.done);
  ok(gb.squadUnits[0].name === '二队宠', '当前小队已切到二队');
  ok(gb.allies.length === 3, '二队单位已并入我方（allies = 玩家 + 2 队宠）');
  /* 二队也全灭、无后续 → 普通战斗（'all'）下**仍由玩家续战**，不判负（这是 Q5 定稿：维持现状） */
  gb.squadUnits.forEach(u => { u.hp = 0; });
  sb.checkGroupWin(gb);
  ok(asked === 2 && !gb.done, '替补用尽但玩家还活着 → 不判负（Q5：普通战斗玩家计入）', 'asked=' + asked + ' done=' + gb.done);
  ok(gb.squadUnits.every(u => u.hp <= 0), '二队确实是全灭状态（不是被增援掩盖）');
  p.hp = 0;
  sb.checkGroupWin(gb);
  ok(gb.done && gb.winner === 'enemy', '玩家也倒 → 判负（普通战斗的最终判据没被接力改动）');
})();

/* ---------- 4. 敌方全灭优先胜利，不因接力被拖住 ---------- */
console.log('\n[4] 敌方全灭 → 直接判我方胜（不触发增援）');
(function () {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('一队宠', 'ally', 0);
  const e1 = mkUnit('敌', 'enemy', 60);
  let asked = 0;
  const gb = build({
    allies: [p, a1], enemies: [e1], seed: 4,
    squadUnits: [a1], reinforce: function () { asked++; return [mkUnit('二队宠', 'ally', 40)]; }
  });
  e1.hp = 0;
  sb.checkGroupWin(gb);
  ok(gb.done && gb.winner === 'ally', '敌方全灭 → 我方胜');
  ok(asked === 0, '敌方已灭时不再问增援（不白白浪费小队）', 'asked=' + asked);
})();

/* ---------- 5. winnerRule：'all' 与 'pets' 的区别 ---------- */
console.log("\n[5] winnerRule 'pets' 只看宠物（玩家不计入判负）");
(function () {
  /* 'pets'：宠物全灭、玩家活着、没有替补 → 判负（多队口径，阶段 D 才上线） */
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('宠', 'ally', 0);
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 5, winnerRule: 'pets', squadUnits: [a1], reinforce: function () { return null; } });
  sb.checkGroupWin(gb);
  ok(gb.done && gb.winner === 'enemy', "'pets'：宠物全灭即败（玩家活着也救不了）");
})();
(function () {
  /* 同一局面在 'all' 下**不判负** → 证明两条口径真的不同 */
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('宠', 'ally', 0);
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 6, winnerRule: 'all', squadUnits: [a1], reinforce: function () { return null; } });
  sb.checkGroupWin(gb);
  ok(!gb.done, "'all'：宠物全灭但玩家活着 → 不判负（普通战斗口径不变）");
})();
(function () {
  /* 'pets' 但场上没有宠物单位（纯玩家）→ 回落 'all'，不凭空判胜 */
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p], enemies: [e1], seed: 7, winnerRule: 'pets' });
  sb.checkGroupWin(gb);
  ok(!gb.done, "'pets' 且无宠物单位 → 回落到 'all'，玩家活着就不判负");
})();

/* ---------- 6. 增援只对新单位补跑 onBattleStart（老单位不重放） ---------- */
console.log('\n[6] 增援时只对**新单位**补跑 onBattleStart');
(function () {
  let calls = 0;
  sb.registerTalent({
    id: '__relay_probe', name: '接力探针', desc: 'test only', petOnly: true,
    hooks: {
      onBattleStart: function (unit, ctx) {
        calls++;
        unit.__probeMates = ctx && ctx.allyUnits;
        return { events: [{ msg: '探针开场 ' + unit.name, targetId: unit.id, type: 'talent' }] };
      }
    }
  });
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('一队宠', 'ally', 50); a1._talents = ['__relay_probe'];
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 8 });
  gb.turn = 3;
  const n2 = mkUnit('二队宠', 'ally', 40); n2._talents = ['__relay_probe'];
  const r = sb.gbReinforce(gb, [n2]);
  ok(calls === 1, '只触发 1 次（新单位），老单位不重放', 'calls=' + calls);
  ok(n2.__probeMates === gb.allies, 'ctx.allyUnits 是**活引用**的 gb.allies（威压领域 _pfMates 同款）');
  ok(a1.__probeMates === undefined, '老单位没有被二次派发');
  ok(r.events.length === 1 && /探针开场/.test(r.events[0].msg), '事件回传给调用方（可落日志）');
  ok(gb.log.length > 0 && gb.log[gb.log.length - 1].unit === '增援', '增援开场事件落进战斗日志（unit=增援）');
})();

/* ---------- 7. v2.14.24 裁决：单场景**不再有**接力提供方 ---------- */
console.log('\n[7] 单场景接力提供方已删除（v2.14.24 作者裁决：只在双场景里用多队）');
(function () {
  ok(typeof sb.__groupRelayNext === 'undefined', '全局探针 __groupRelayNext 已移除');
  ok(typeof sb._groupRelaySquads === 'undefined', '开战快照 _groupRelaySquads 已移除');
  ok(typeof sb._groupSquadIdx === 'undefined', '接力游标 _groupSquadIdx 已移除');
  const src = fs.readFileSync(path.join(__dirname, '..', 'page', 'game-render.js'), 'utf8');
  ok(!/function _groupRelayNext/.test(src), '源码里不再有 _groupRelayNext 定义');
  ok(!/_groupBattle\.reinforce\s*=/.test(src), '单场景不再给引擎挂 reinforce（不接线 ⇒ 永不触发）');
  ok(!/_groupBattle\.squadUnits\s*=/.test(src), '单场景不再给引擎传 squadUnits');
})();

/* ---------- 9. 回滚（时间旅行）不把替补"带回过去" ---------- */
console.log('\n[9] 回滚到增援之前的快照 → 替补单位被摘除');
(function () {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const a1 = mkUnit('一队宠', 'ally', 50);
  const e1 = mkUnit('敌', 'enemy', 60);
  const gb = build({ allies: [p, a1], enemies: [e1], seed: 10 });
  const snap = sb.groupSnapshot(gb);
  const n2 = mkUnit('二队宠', 'ally', 40);
  sb.gbReinforce(gb, [n2]);
  ok(gb.allies.length === 3 && gb.units.length === 4, '增援后：我方 3 / 全场 4');
  const r = sb.groupRestore(gb, snap);
  ok(r.ok, '回滚成功');
  ok(gb.allies.indexOf(n2) < 0 && gb.units.indexOf(n2) < 0, '快照之后加入的替补被摘除（不在 allies / units）');
  ok(gb.allies.length === 2 && gb.units.length === 3, '单位池回到快照形状');
});

/* ---------- 10. game-render 接线源码守卫（v2.14.24：单场景不接线） ---------- */
console.log('\n[10] game-render 接线守卫');
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'page', 'game-render.js'), 'utf8');
  ok(src.indexOf('player._isPlayer=true') > -1, '玩家单位打了 _isPlayer 标记（pets 口径据此排除玩家）');
  ok(!/_groupRelaySquads/.test(src) && !/_groupSquadIdx/.test(src) && !/_groupRelayPending/.test(src),
    '单场景接力三个全局一律不存在（不残留半套）');
  ok(src.indexOf('reinforce') < 0 || !/_groupBattle\.reinforce\s*=/.test(src),
    '单场景不往引擎写 reinforce（唯一写入口在导演层）');
  const eng = fs.readFileSync(path.join(__dirname, '..', 'page', 'battle-group.js'), 'utf8');
  ok(/winnerRule: opts\.winnerRule \|\| 'all'/.test(eng), '引擎默认 winnerRule 仍是 all');
  ok(eng.indexOf('var res = gbReinforce(gb, more);') > -1, 'checkGroupWin 里先增援再判负');
  ok(eng.indexOf('while (guard++ < 16)') > -1, '增援循环有上限（防提供方恒给空队）');
  ok(/buildGroupBattlePets/.test(fs.readFileSync(path.join(__dirname, '..', 'page', 'group-dual.js'), 'utf8')),
    '双场景替补建单位仍走 buildGroupBattlePets 唯一入口');
})();

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

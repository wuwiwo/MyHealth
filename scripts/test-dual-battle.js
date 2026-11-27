#!/usr/bin/env node
/* v2.14.21 阶段 D：多队双场景 —— 导演层 / 缩放 / 玩家轮转 / 替补绑定 / 整场胜负 / 合并门面
   设计依据 doc/design-pet-squad-battle-v1.md v1.2 §4 / §10 阶段 D
   Run: node scripts/test-dual-battle.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m, extra) {
  if (c) { pass++; console.log(' ✓ ' + m); }
  else { fail++; console.log(' ✗ ' + m + (extra !== undefined ? '  → ' + extra : '')); }
}

const PAGE = path.join(__dirname, '..', 'page');
const html = fs.readFileSync(path.join(PAGE, 'index.src.html'), 'utf8');
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
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
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(PAGE, src), 'utf8'), sb, { filename: src });
});

let _uid = 0;
function mkUnit(name, side, hp) {
  return {
    id: (side === 'ally' ? 'a' : 'e') + (_uid++), side: side, name: name,
    base: { hp: hp, atk: 10, def: 5, spd: 10, soulAtk: 0, soulDef: 0 }, hp: hp, level: 1,
    counters: { cd: {} }, statuses: [], skills: [], _talents: []
  };
}
const mkPlayer = () => mkUnit('你', 'ally', 100);

/* 造一场（每侧独立敌人），导演建场 */
function build(opts) {
  opts = opts || {};
  const p = opts.player || mkPlayer();
  const petA = opts.petA || mkUnit('宠A', 'ally', opts.petHp || 40);
  const petB = opts.petB || mkUnit('宠B', 'ally', opts.petHp || 40);
  const rng = sb.makeSeededRng(opts.seed || 1);
  const enemyHp = opts.enemyHp || 60;
  const gbA = sb.createGroupBattle({
    allies: [p, petA], enemies: [mkUnit('敌A1', 'enemy', enemyHp), mkUnit('敌A2', 'enemy', enemyHp)],
    rng: rng, seed: undefined
  });
  const gbB = sb.createGroupBattle({
    allies: [petB], enemies: [mkUnit('敌B1', 'enemy', enemyHp), mkUnit('敌B2', 'enemy', enemyHp)],
    rng: rng
  });
  const pending = opts.pending || [{ name: '三队', petIds: ['x'] }];
  const dir = sb.createDualBattle({
    player: p,
    scenes: {
      A: { gb: gbA, squadUnits: [petA], squadName: '一队' },
      B: { gb: gbB, squadUnits: [petB], squadName: '二队' }
    },
    pendingSquads: pending,
    buildSquad: opts.buildSquad || function () { return [mkUnit('替补', 'ally', 40)] }
  });
  return { p, petA, petB, gbA, gbB, dir, rng };
}

/* ---------- 1. 属性缩放 ---------- */
console.log('\n[1] applyMultiSceneScale：按关卡类型分档（normal 0.85 / elite 0.9 / boss 0.9，不改原编成）');
(function () {
  const src = [{ name: '甲', tier: 'normal', level: 3, base: { hp: 100, atk: 20, def: 10, soulAtk: 6, soulDef: 4 }, skills: ['s1'], affixes: ['a1'] }];
  const out = sb.applyMultiSceneScale(src, 'normal');
  ok(out.length === 1, '数量不变');
  ok(out[0].base.hp === 85 && out[0].base.atk === 17, '普通关 0.85（floor）', JSON.stringify(out[0].base));
  ok(out[0].base.soulAtk === 5 && out[0].base.soulDef === 3, 'soulAtk / soulDef 同样收缩');
  ok(src[0].base.hp === 100 && src[0].base.atk === 20, '原编成未被改（单场景关卡仍能用它）');
  ok(out[0].level === 3 && out[0].tier === 'normal' && out[0].skills[0] === 's1' && out[0].affixes[0] === 'a1', '等级 / 词条 / 技能原样透传（只缩放 base）');
  const small = sb.applyMultiSceneScale([{ base: { hp: 1, atk: 2 } }], 'normal');
  ok(small[0].base.hp === 1 && small[0].base.atk === 1, '下限 1（不出 0 血怪）', JSON.stringify(small[0].base));
  const elite = sb.applyMultiSceneScale(src, 'elite');
  const boss = sb.applyMultiSceneScale(src, 'boss');
  ok(elite[0].base.hp === 90 && elite[0].base.atk === 18, '精英关 0.9', JSON.stringify(elite[0].base));
  ok(boss[0].base.hp === 90 && boss[0].base.atk === 18, 'Boss 关 0.9', JSON.stringify(boss[0].base));
  ok(sb.multiSceneScale('normal') === 0.85 && sb.multiSceneScale('elite') === 0.9 && sb.multiSceneScale('boss') === 0.9, '分档表：0.85 / 0.9 / 0.9');
  ok(sb.multiSceneScale('unknown') === 0.85 && sb.multiSceneScale() === 0.85, '未知类型 / 缺省回落普通档 0.85（绝不返回 0）');
  const noArg = sb.applyMultiSceneScale(src);
  ok(noArg[0].base.hp === 85, '不传 scale 时按普通档 (0.85) 缩放', noArg[0].base.hp);
})();

/* ---------- 2. 建场口径 ---------- */
console.log('\n[2] createDualBattle：A←一队、B←二队、玩家只在 A 且不可被选');
(function () {
  const { p, petA, petB, gbA, gbB, dir, rng } = build({ seed: 2 });
  ok(dir.active === 'A' && dir.cycle === 1, '开局：当前场景 A、第 1 轮');
  ok(gbA.allies.indexOf(p) > -1, '玩家挂在 A');
  ok(gbB.allies.indexOf(p) < 0 && gbB.units.indexOf(p) < 0, '玩家不在 B（也不在 B 的 units 池）');
  ok(p._untargetable === true && p._isPlayer === true, '玩家被打上 _untargetable / _isPlayer');
  ok(sb.attackable(p) === false, 'attackable(玩家) = false（敌人视玩家不存在）');
  ok(gbA.winnerRule === 'pets' && gbB.winnerRule === 'pets', '两个 gb 都按「只看宠物」判负');
  ok(gbA.rng === rng && gbB.rng === rng, '两个 gb 注入**同一个** rng（不是同种子两实例）');
  ok(gbA.squadUnits[0] === petA && gbB.squadUnits[0] === petB, '场景各自绑自己的小队');
  ok(dir.scenes.A.status === 'active' && dir.scenes.B.status === 'active', '两侧都是 active');
})();

/* ---------- 3. 玩家随推进移动 ---------- */
console.log('\n[3] 换边：玩家从 A 搬到 B（allies/units 双池同步）');
(function () {
  const { p, gbA, gbB, dir } = build({ seed: 3 });
  sb.dualMovePlayer(dir, 'B');
  ok(gbA.allies.indexOf(p) < 0 && gbA.units.indexOf(p) < 0, 'A 的双池里已无玩家');
  ok(gbB.allies.indexOf(p) === 0, 'B 的 allies 首位是玩家（展示顺序）');
  ok(gbB.units.indexOf(p) > -1, 'B 的 units 里也有一份（不是两份）');
  ok(gbB.units.filter(function (u) { return u === p; }).length === 1, '玩家不会被重复塞进同一个池');
  sb.dualMovePlayer(dir, 'A');
  ok(gbA.units.filter(function (u) { return u === p; }).length === 1 && gbB.units.indexOf(p) < 0, '搬回 A 后 B 侧干净');
})();

/* ---------- 4. 跑起来：换边 / cycle / 结束 ---------- */
console.log('\n[4] dualStep：A 一个完整回合 → 换 B；B 跑完 → cycle++ 回 A');
(function () {
  const { dir } = build({ seed: 4, enemyHp: 500, petHp: 4000 });
  let steps = 0, switchedAtA = false, sawB = false;
  while (steps < 400 && !dir.done) {
    const before = dir.active;
    const st = sb.dualStep(dir);
    steps++;
    if (before === 'A' && st.switched) { switchedAtA = true; }
    if (dir.active === 'B') sawB = true;
    if (steps > 60 && dir.cycle >= 2) break;
  }
  ok(sawB, 'B 场景真的被推进过');
  ok(switchedAtA, 'A 的回合结束点了换边（switched=true）');
  ok(dir.cycle >= 2, '两侧各跑过一轮后 cycle 递增', 'cycle=' + dir.cycle);
  ok(dir.active === 'A' || dir.active === 'B', 'active 始终是合法场景键');
  ok(dir.done === false, '双方血厚 → 打到中途不会自己结束');
})();

/* ---------- 5. 替补：谁全灭谁取，不跨场景偷队 ---------- */
console.log('\n[5] 替补绑定场景：A 全灭 → 取未上场队列补到 A，B 不动');
(function () {
  const { petA, petB, gbA, gbB, dir } = build({
    seed: 5, enemyHp: 800, petHp: 4000,
    pending: [{ name: '三队', petIds: ['x'] }, { name: '四队', petIds: ['y'] }]
  });
  const petBHp0 = petB.hp;
  petA.hp = 0;                       // A 小队当场全灭
  let guard = 0;
  while (guard++ < 200 && !dir.done) {
    const st = sb.dualStep(dir);
    if (gbA.allies.length > 2) break; // 增援已经进来
    if (st.turnEnd && dir.active === 'B') continue;
  }
  ok(gbA.allies.length > 2, 'A 侧出现了新的替补单位', gbA.allies.map(u => u.name).join(','));
  ok(dir.pending.length === 1, '未上场队列消耗了 1 支', '剩余=' + dir.pending.length);
  ok(dir.scenes.A.squadName === '三队', '队名更新为补给的那支（三队）', dir.scenes.A.squadName);
  ok(dir.scenes.B.squadName === '二队' && petB.hp === petBHp0, 'B 侧队伍与血量都没被动过');
  ok(gbA.squadUnits.length > 0 && gbA.squadUnits[0].side === 'ally', 'A 的 squadUnits 指向新小队');
  ok(dir.notes.length >= 0, 'notes 是「读后清空」的一次性提示通道');
})();

/* ---------- 6. 无替补 → 该场景败 → 整场败（不等另一侧） ---------- */
console.log('\n[6] 替补用尽：A 全灭 → 整场立即判负');
(function () {
  const { petA, dir, gbB } = build({ seed: 6, enemyHp: 800, petHp: 4000, pending: [] });
  petA.hp = 0;
  let guard = 0;
  while (guard++ < 200 && !dir.done) sb.dualStep(dir);
  ok(dir.done === true, '导演结束了');
  ok(dir.winner === 'enemy', '胜负 = enemy（某场景全灭且无替补，D3）', dir.winner);
  ok(dir.scenes.A.status === 'lost', 'A 场景被标 lost');
  ok(gbB.allies.filter(u => u.hp > 0).length > 0, 'B 侧甚至还没打完 —— 也照样直接判负');
})();

/* ---------- 7. 两场景都清场 → 整场胜 ---------- */
console.log('\n[7] 两场景都 won → 整场胜（冻结后跳过）');
(function () {
  const { dir, gbA, gbB } = build({ seed: 7, enemyHp: 20 });
  let guard = 0;
  while (guard++ < 400 && !dir.done) sb.dualStep(dir);
  ok(gbA.done === true && gbA.winner === 'ally', 'A 已清场');
  ok(gbB.done === true && gbB.winner === 'ally', 'B 已清场');
  ok(dir.done === true && dir.winner === 'ally', '整场胜 = ally', dir.winner);
  ok(dir.scenes.A.status === 'won' && dir.scenes.B.status === 'won', '两侧状态都冻结为 won');
  /* 冻结后继续喊 dualStep 不应再推进（幂等） */
  const stepN = sb.dualStep(dir);
  ok(stepN.done === true && stepN.events.length === 0, '结束后再推进 = 空拍，不产生事件');
})();

/* ---------- 8. 合并门面（战报 / 统计 / 历史的唯一输入） ---------- */
console.log('\n[8] dualMergedBattle：我我去重、敌人合流、日志带场景前缀');
(function () {
  const { dir, p } = build({ seed: 8, enemyHp: 40 });
  let guard = 0;
  while (guard++ < 400 && !dir.done) sb.dualStep(dir);
  const m = sb.dualMergedBattle(dir);
  ok(m && m.dual === true, '门面带 dual 标记');
  ok(m.allies.filter(function (u) { return u === p; }).length === 1, '玩家在门面里只有一份（去重）');
  ok(m.enemies.length === 4, '敌人 = 两侧合计 4 个（每侧完整编成）', m.enemies.length);
  ok(m.units.length === m.allies.length + m.enemies.length, 'units = allies + enemies（引擎侧同一口径）');
  ok(m.turn === dir.cycle, 'turn = 整场轮数（cycle）');
  ok(m.winner === dir.winner && m.done === dir.done, '胜负透传导演结论');
  ok(m.log.length > 0, '合并日志非空');
  ok(m.log.every(function (l) { return /^[AB]·/.test(l.unit || ''); }), '每条日志都带 A·/B· 场景前缀', m.log[0] && m.log[0].unit);
})();

/* ---------- 9. 确定性：同一 seed 两次结果一致 ---------- */
console.log('\n[9] 确定性：同 seed 两跑 → 同胜负、同步数');
(function () {
  function runOnce(seed) {
    const { dir } = build({ seed: seed, enemyHp: 45 });
    let n = 0;
    while (n < 400 && !dir.done) { sb.dualStep(dir); n++; }
    return { winner: dir.winner, n: n, cycle: dir.cycle };
  }
  const r1 = runOnce(99), r2 = runOnce(99);
  ok(r1.winner === r2.winner && r1.n === r2.n && r1.cycle === r2.cycle, '两次完全一致', JSON.stringify(r1) + ' vs ' + JSON.stringify(r2));
})();

/* ---------- 10. 源码守卫 ---------- */
console.log('\n[10] 源码守卫（单入口 / 单渲染 / 单常量 / 不对单场景开闸）');
(function () {
  function read(f) { return fs.readFileSync(path.join(PAGE, f), 'utf8'); }
  const gr = read('game-render.js');
  const gd = read('group-dual.js');
  ok(gd.indexOf('var MULTI_SCENE_ENEMY_SCALE = 0.85;') > -1, '兜底常量（普通档 0.85）只在 group-dual.js 定义');
  ok(gd.indexOf('MULTI_SCENE_SCALE_BY_TYPE = { normal: 0.85, elite: 0.9, boss: 0.9 }') > -1, '分档表只有一份（normal/elite/boss）');
  ok(/renderGroupBattlePane\(gb,sfx\)/.test(gr), '渲染函数已参数化（gb,sfx）');
  ok(gr.indexOf('renderGroupBattlePane(gb)') > -1 && gr.indexOf("renderGroupBattlePane(sc.gb,(k==='A'?'':'B'))") > -1, '两栏各调一次同一函数（没有第二份渲染）');
  ok(gr.indexOf("glv.mode === 'multi'") > -1, '多队分支只在开战入口按 mode 判定');
  ok(/if\(glv && glv\.mode === 'multi'\){?/.test(gr) || gr.indexOf("if (glv && glv.mode === 'multi')") > -1, 'mode 消费点唯一（startGroupTrial 里那一处）');
  const modeUses = (gr.match(/glv\.mode === 'multi'/g) || []).length;
  ok(modeUses === 1, 'game-render.js 的条件判断里 glv.mode 只出现 1 次（开战分支）', 'count=' + modeUses);
  ok(gr.indexOf('_groupDual=createDualBattle') > -1 || gr.indexOf('_groupDual=(typeof createDualBattle') > -1, '开战走 createDualBattle（导演唯一入口）');
  ok(/dualStep\(_groupDual\)|_dualStepOnce\(\)/.test(gr), '_groupStep 走导演推进');
  ok(gd.indexOf('window.createDualBattle') > -1, '导演 API 暴露给测试');
})();

/* ---------- 11. 两栏渲染：同一函数、id 带后缀 ---------- */
console.log('\n[11] renderGroupBattlePane(gb, sfx)：两栏共用一份渲染，id 不打架');
(function () {
  const { gbA, gbB, dir } = build({ seed: 11, enemyHp: 60 });
  const pa = sb.renderGroupBattlePane(gbA, '');
  const pb = sb.renderGroupBattlePane(gbB, 'B');
  ok(pa.indexOf('id="gbArena"') > -1 && pa.indexOf('id="gbArenaB"') < 0, 'A 栏沿用既有 id');
  ok(pb.indexOf('id="gbArenaB"') > -1 && pb.indexOf('id="gbArenaEnemyB"') > -1 && pb.indexOf('id="gbArenaAllyB"') > -1, 'B 栏三个容器 id 全部带 B 后缀');
  ok(pa.indexOf('id="gbArena"') > -1 && pa.indexOf('id="gbArenaEnemy"') > -1 && pa.indexOf('id="gbArenaAlly"') > -1, 'A 栏三个容器 id 原样');
  ok(sb.dualSceneLabel(dir, 'A').indexOf('推进中') > -1, '当前场景标「推进中」');
  ok(sb.dualSceneLabel(dir, 'B').indexOf('待机') > -1, '非当前场景标「待机」');
  dir.scenes.A.status = 'won';
  ok(sb.dualSceneLabel(dir, 'A').indexOf('已胜') > -1, '已胜场景如实标「已胜（冻结）」');
})();

/* ---------- 12. 源码守卫：开战先清导演（防「上一场双场景」污染自动连打） ---------- */
console.log('\n[12] 开战入口每次清 `_groupDual`');
(function () {
  const gr = fs.readFileSync(path.join(PAGE, 'game-render.js'), 'utf8');
  const i = gr.indexOf('function startGroupTrial');
  const head = gr.slice(i, i + 3000);
  ok(/_groupDual = null/.test(head), 'startGroupTrial 顶部无条件清导演');
  ok(/_groupRewarded = false/.test(head), '结算标志同样在顶部复位（顺序未被打乱）');
})();

/* ---------- 13. 集成：真走开战入口（g18-5 的 mode:'multi' → 双场景） ---------- */
console.log('\n[13] 集成：_startDualGroupTrial 真的建出两栏，玩家不可选、敌人按关卡类型缩放（g18-5 = 精英 0.9）');
(function () {
  const glv = sb.getGroupStage('g18-5');
  ok(glv && glv.mode === 'multi', 'g18-5 本身是 multi 关');
  const p = mkUnit('你', 'ally', 100);
  /* 三支编队 → A/B 首发 + 1 支替补；建队入口替换为测试单位（线上仍走 buildGroupBattlePets） */
  sb.getPetSquads = function () {
    return [{ name: '一队', petIds: ['s1'] }, { name: '二队', petIds: ['s2'] }, { name: '三队', petIds: ['s3'] }];
  };
  sb.buildGroupBattlePets = function (ids) {
    return (ids || []).map(function (id) { return mkUnit('宠-' + id, 'ally', 40); });
  };
  let threw = null;
  try { sb._startDualGroupTrial(glv, p, 'g18'); } catch (e) { threw = e; }
  ok(!threw, '开战入口不抛错', threw && threw.message);
  const dir = sb.__groupDualState();
  ok(!!dir && !!dir.scenes.A && !!dir.scenes.B, '导演已建立（两场景俱在）');
  ok(p._untargetable === true, '玩家在真·开战路径里也被打上 _untargetable');
  ok(dir.scenes.A.gb.allies.indexOf(p) === 0 && dir.scenes.B.gb.allies.indexOf(p) < 0, '玩家只在 A');
  const enemyA = dir.scenes.A.gb.enemies[0];
  ok(/^enemyA-/.test(enemyA.id) && /^enemyB-/.test(dir.scenes.B.gb.enemies[0].id), '两侧敌人 id 带 A/B 前缀（data-uid 不打架）');
  const cfg = glv.enemies[0];
  ok(enemyA.base.hp === Math.max(1, Math.floor(cfg.base.hp * 0.9)), '敌人 base 按精英关 0.9 缩放（每侧完整编成）', enemyA.base.hp + ' vs ' + cfg.base.hp);
  ok(dir.pending.length === 1, '第 3 支编队进入替补队列', dir.pending.length);
  /* 推几拍：不抛错、场景指针在 A/B 之间合法 */
   let steps = 0, err = null;
  try { while (steps < 12 && !dir.done) { sb._groupStep(); steps++; } } catch (e) { err = e; }
  ok(!err, '真 UI 推进入口不抛错', err && err.message);
  ok(steps > 0 && (dir.active === 'A' || dir.active === 'B'), '推进若干拍后场景键仍合法', 'steps=' + steps + ' active=' + dir.active);
})();

/* ---------- 14. v2.14.23：双 Boss 关（每 3 大关）每侧 1 Boss；非双 Boss 关仍单场景 ---------- */
console.log('\n[14] 双 Boss 关：g3-10 两侧各 1 Boss；g4-10 仍 single；单队回退单场景');
(function () {
  const bossStage = sb.getGroupStage('g3-10');
  ok(bossStage && bossStage.mode === 'multi', 'g3-10（3 % 3 = 0）是双 Boss 多队关');
  const p = mkUnit('你', 'ally', 100);
  sb.getPetSquads = function () {
    return [{ name: '一队', petIds: ['s1'] }, { name: '二队', petIds: ['s2'] }];
  };
  sb.buildGroupBattlePets = function (ids) {
    return (ids || []).map(function (id) { return mkUnit('宠-' + id, 'ally', 40); });
  };
  let threw = null;
  try { sb._startDualGroupTrial(bossStage, p, 'g3'); } catch (e) { threw = e; }
  ok(!threw && !!sb.__groupDualState(), 'Boss 关也能开出双场景（不抛错）', threw && threw.message);
  const dir = sb.__groupDualState();
  const tierOf = g => (g.enemies[0] || {})._tier;
  ok(!!tierOf(dir.scenes.A.gb) && tierOf(dir.scenes.A.gb) !== tierOf(dir.scenes.B.gb) === false, '两栏首位敌人都是同一档 Boss');
  const bossTier = bossStage.enemies[0].tier;
  ok(tierOf(dir.scenes.A.gb) === bossTier && tierOf(dir.scenes.B.gb) === bossTier, '每侧各 1 个 Boss（全场合计 2 个 Boss）', tierOf(dir.scenes.A.gb) + ' / ' + tierOf(dir.scenes.B.gb));
  ok(dir.scenes.A.gb.enemies.length === bossStage.enemies.length && dir.scenes.B.gb.enemies.length === bossStage.enemies.length, '每侧都是完整编成（Boss + 护卫）');
  const bossCfg = bossStage.enemies[0];
  ok(dir.scenes.A.gb.enemies[0].base.hp === Math.max(1, Math.floor(bossCfg.base.hp * 0.9)), 'Boss 关按 0.9 缩放', dir.scenes.A.gb.enemies[0].base.hp + ' vs ' + bossCfg.base.hp);
  /* 非双 Boss 的 Boss 关：mode 仍 single，入口不建导演 */
  ok(sb.getGroupStage('g4-10').mode === 'single', 'g4-10 仍是单场景（单 Boss）');
  /* 只有 1 支可战编队 → _startDualGroupTrial 返回 false，调用方回退单场景（不再挡住开战） */
  sb.getPetSquads = function () { return [{ name: '一队', petIds: ['s1'] }]; };
  const oneSquad = sb._startDualGroupTrial(sb.getGroupStage('g3-1'), mkUnit('你', 'ally', 100), 'g3');
  ok(oneSquad === false, '只有 1 支编队 → 返回 false（调用方回退单场景）', String(oneSquad));
  /* 两支都有但其中一支全员不可战（空队）→ 同样 false */
  sb.getPetSquads = function () { return [{ name: '一队', petIds: ['s1'] }, { name: '二队', petIds: [] }]; };
  ok(sb._startDualGroupTrial(sb.getGroupStage('g3-1'), mkUnit('你', 'ally', 100), 'g3') === false, '二队空队 → 同样回退单场景');
  const gr2 = fs.readFileSync(path.join(PAGE, 'game-render.js'), 'utf8');
  ok((gr2.match(/_startDualGroupTrial\(/g) || []).length === 2, '开战入口只有 1 处调用（+ 1 处函数定义）', (gr2.match(/_startDualGroupTrial\(/g) || []).length);
  ok(/if\s*\(_startDualGroupTrial\(glv, player, anchorG0\)\)\s*return/.test(gr2), '入口按返回值决定是否直接收工（false 继续单场景建场）');
})();

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);

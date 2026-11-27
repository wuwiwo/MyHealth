#!/usr/bin/env node
/* v2.14.20 阶段 C：**`attackable(u)` 单源目标过滤** + 关卡 `mode` 派生 测试
   覆盖：助手本身的三条判据 / 敌方 AI 选靶（单体·嘲讽·AOE·随机·强制声明）不碰玩家 /
        普攻通道 / 反噬 / 场地（沙暴·酷暑·雨天·毒气）/ 玩家照常出手 /
        关卡 mode：全期只有 g18-5 与 g24-5，Boss 与 1–3 关永不 multi / mode 未被任何生产代码消费
   设计依据：doc/design-pet-squad-battle-v1.md v1.2 §5（Q4）/ §6（Q6）/ §10 阶段 C
   Run: node scripts/test-attackable.js */
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
const html = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8');
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
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(PAGE, src), 'utf8'), sb, { filename: src });
});

let _uid = 0;
function mkUnit(name, side, hp) {
  const base = { hp: hp, atk: 10, def: 5, spd: 10, soulAtk: 0, soulDef: 0 };
  return {
    id: (side === 'ally' ? 'a' : 'e') + (_uid++), side: side, name: name,
    base: base, hp: hp, level: 1,
    counters: { cd: {} }, statuses: [], skills: [], _talents: []
  };
}
function team() {
  const p = mkUnit('你', 'ally', 100); p._isPlayer = true;
  const pet = mkUnit('宠1', 'ally', 50);
  const e1 = mkUnit('敌1', 'enemy', 60);
  const e2 = mkUnit('敌2', 'enemy', 60);
  return { p, pet, e1, e2 };
}

/* ---------- 1. 助手本身 ---------- */
console.log('\n[1] attackable(u)：存活 且 未被标记不可选');
(function () {
  const u = mkUnit('x', 'ally', 10);
  ok(sb.attackable(u) === true, 'hp>0 且无标记 → true');
  u.hp = 0;
  ok(sb.attackable(u) === false, 'hp=0 → false');
  u.hp = 10; u._untargetable = true;
  ok(sb.attackable(u) === false, '_untargetable → false');
  ok(sb.attackable(null) === false && sb.attackable(undefined) === false, 'null / undefined → false');
})();

/* ---------- 2. 敌方 AI 选靶：玩家在池外 ---------- */
console.log('\n[2] 玩家打好标记 → 敌方 AI 的单体 / 嘲讽 / 全体 / 随机都选不到他');
(function () {
  const { p, pet, e1, e2 } = team();
  p._untargetable = true; p._taunting = true;
  const gb = sb.createGroupBattle({ allies: [p, pet], enemies: [e1, e2], seed: 5 });
  ok(gb.allies[0] === p || gb.allies.indexOf(p) > -1, '对局里仍有玩家（只是不可选）');
  ok(sb.aliveOpponents(gb, e1).indexOf(p) < 0, 'aliveOpponents 不含玩家');
  ok(sb.aliveOpponents(gb, e1).indexOf(pet) > -1, 'aliveOpponents 仍含宠物');
  let everPicked = false;
  for (let i = 0; i < 30; i++) {
    const t = sb.aiPickTarget(gb, e1, null);
    if (t === p) everPicked = true;
  }
  ok(!everPicked, 'aiPickTarget 连掷 30 次从未选中玩家');
  const single = sb.aiPickTarget(gb, e1, null);
  ok(single === pet, '单体选靶落到宠物（唯一可选者）');
  /* 嘲讽：玩家挂着嘲讽也不能被拉过去 */
  const taunt = sb.selectTargets(gb, e1, { target: 'random1' });
  ok(taunt.indexOf(p) < 0, 'random1：玩家即使 _taunting 也不入池');
  const aoe = sb.selectTargets(gb, e1, { target: 'all' });
  ok(aoe.indexOf(p) < 0 && aoe.indexOf(pet) > -1, 'AOE(all)：不含玩家、含宠物');
  const rnd2 = sb.selectTargets(gb, e1, { target: 'enemy2' });
  ok(rnd2.indexOf(p) < 0, 'enemy2 随机 2 名：不含玩家');
  /* 强制声明目标（准备阶段预声明）：玩家不合法 → 落回重选，绝不返回玩家 */
  const forced = sb.selectTargets(gb, e1, { target: 'random1' }, p);
  ok(forced.indexOf(p) < 0, 'forcedTarget 指向玩家 → 声明作废、不返回玩家');
  /* 声明合法性判定同样按 attackable */
  e1._declared = { skillId: null, targetIds: [p.id] };
  e1._declaredTurn = gb.turn;
  e1._declaredUsed = null;
  ok(sb.declaredActionValid(gb, e1, e1._declared) === false, '声明目标是玩家 → 声明失效（会当场重选）');
})();

/* ---------- 3. 无标记时一切照旧（回归面） ---------- */
console.log('\n[3] 没有 _untargetable 的普通战斗：玩家照旧可被选中');
(function () {
  const { p, pet, e1 } = team();
  const gb = sb.createGroupBattle({ allies: [p], enemies: [e1], seed: 7 });
  ok(sb.aliveOpponents(gb, e1).indexOf(p) > -1, '普通战斗：玩家在敌方选靶池里');
  ok(sb.aiPickTarget(gb, e1, null) === p, '普通战斗：敌方单体选靶就是玩家');
  const aoe = sb.selectTargets(gb, e1, { target: 'all' });
  ok(aoe.indexOf(p) > -1, '普通战斗：AOE 照旧打玩家');
  const hp0 = p.hp;
  sb.normalAttack(gb, e1, p);
  ok(p.hp <= hp0, '普通战斗：普攻照旧能打到玩家');
  const petHp0 = pet.hp;
  for (let i = 0; i < 8; i++) sb.normalAttack(gb, e1, pet);   // 命中判定有掷骰，多打几次保证至少命中一次
  ok(pet.hp < petHp0, '普通战斗：普攻打到宠物正常结算');
})();

/* ---------- 4. 普攻 / 反噬：打不到标记单位 ---------- */
console.log('\n[4] 普攻与反噬通道对玩家零生效');
(function () {
  const { p, pet, e1 } = team();
  p._untargetable = true;
  const gb = sb.createGroupBattle({ allies: [p, pet], enemies: [e1], seed: 8 });
  const ev = sb.normalAttack(gb, e1, p);
  ok(ev.length === 0 && p.hp === 100, '敌方普攻直指玩家 → 0 事件、玩家不掉血');
  const refEv = [];
  p.hp = 100;
  sb.applyReflectMitigated(gb, p, 30, refEv, '测试反噬');
  ok(p.hp === 100 && refEv.length === 0, '反噬打到玩家 → 不掉血、不落日志');
  /* 对照：不带标记时反噬照旧生效（证明拦的是标记而不是整条通道） */
  const q = mkUnit('对照', 'ally', 100);
  const gb2 = sb.createGroupBattle({ allies: [q], enemies: [mkUnit('敌', 'enemy', 60)], seed: 9 });
  const ev2 = [];
  sb.applyReflectMitigated(gb2, q, 30, ev2, '测试反噬');
  ok(q.hp < 100 && ev2.length === 1, '对照（无标记）：反噬照旧扣血并落日志');
})();

/* ---------- 5. 场地：伤害与状态都不落到玩家 ---------- */
console.log('\n[5] 场地遍历（沙暴 / 酷暑 / 雨天 / 毒气）不碰玩家');
(function () {
  const { p, pet, e1 } = team();
  p._untargetable = true;
  const gb = sb.createGroupBattle({ allies: [p, pet], enemies: [e1], seed: 11 });
  gb.terrain = sb.getTerrain('heat');          // 酷暑：回合结束全体失 4% 最大生命
  sb.terrainTurnEnd(gb);
  ok(p.hp === 100, '酷暑：玩家不掉血（宠物与敌人照旧）');
  ok(pet.hp < 50, '酷暑：宠物照旧吃场地伤害');

  const gb2 = sb.createGroupBattle({ allies: [p, pet], enemies: [mkUnit('敌', 'enemy', 60)], seed: 12 });
  gb2.terrain = sb.getTerrain('sandstorm');
  p.hp = 100; pet.hp = 50;
  sb.terrainTurnEnd(gb2);
  ok(p.hp === 100, '沙暴：玩家不被随机抽中，也不掉血');

  const gb3 = sb.createGroupBattle({ allies: [p, pet], enemies: [mkUnit('敌', 'enemy', 60)], seed: 13 });
  gb3.terrain = sb.getTerrain('rain');
  p.hp = 100;
  for (let i = 0; i < 10; i++) sb.terrainTurnStart(gb3);
  const wet = (p.statuses || []).some(s => s.id === 'wet');
  ok(!wet && p.hp === 100, '雨天：玩家既不变潮湿也不被雷劈');

  const gb4 = sb.createGroupBattle({ allies: [p, pet], enemies: [mkUnit('敌', 'enemy', 60)], seed: 14 });
  gb4.terrain = sb.getTerrain('gas');
  gb4.turn = 6;
  for (let i = 0; i < 10; i++) sb.terrainTurnStart(gb4);
  ok(!(p.statuses || []).some(s => s.id === 'poison'), '毒气：玩家不会中毒');
  /* applyTerrainResult 的兜底闸：即便前面漏了，这里也不落地 */
  const gb5 = sb.createGroupBattle({ allies: [p], enemies: [mkUnit('敌', 'enemy', 60)], seed: 15 });
  const before = p.hp;
  sb.applyTerrainResult(gb5, { damage: [{ unitId: p.id, amount: 40 }], statusApps: [{ unitId: p.id, id: 'wet', duration: 1 }] });
  ok(p.hp === before && !(p.statuses || []).some(s => s.id === 'wet'), 'applyTerrainResult 闸门：伤害与状态都不落地');
})();

/* ---------- 6. 玩家照常出手（不可选 ≠ 不参战） ---------- */
console.log('\n[6] 行动队列仍含玩家（玩家是出手单位，只是不能被选为目标）');
(function () {
  const { p, pet, e1 } = team();
  p._untargetable = true;
  const gb = sb.createGroupBattle({ allies: [p, pet], enemies: [e1], seed: 16 });
  const q = sb.buildActionQueue(gb);
  ok(q.indexOf(p) > -1, 'buildActionQueue 含玩家');
  ok(sb.attackable(p) === false, '但玩家仍不可被敌方选为目标');
})();

/* ---------- 7. 关卡 mode 派生（v2.14.23 作者裁决：多队是常态，双 Boss 每 3 大关 1 次） ---------- */
console.log('\n[7] 关卡 mode：x1–x9 全 multi；Boss 关仅「双 Boss」关（每 3 大关）为 multi');
(function () {
  const multi = [], singles = [], bad = [];
  Object.keys(sb.GROUP_LEVELS).forEach(g => {
    const group = sb.GROUP_LEVELS[g];
    (group.stages || []).forEach(s => {
      if (s.mode === 'multi') multi.push(s.id);
      else if (s.mode === 'single') singles.push(s.id);
      else bad.push(s.id + '=' + s.mode);
    });
  });
  const groups = Object.keys(sb.GROUP_LEVELS).length;          // 24
  const perGroup = (sb.GROUP_LEVELS.g1.stages || []).length;   // 10
  ok(bad.length === 0, '每一关的 mode 都只有 single/multi 两种合法值', bad.join(','));
  /* x1–x9 共 9 关 × 24 大关；x10 里 lg%3==0 的 8 关 */
  const bossMulti = groups => Math.floor(groups / 3);
  ok(multi.length === groups * 9 + bossMulti(groups), 'multi 数 = 每大关 1–9 关 + 能整除 3 的 Boss 关', multi.length);
  ok(singles.length === groups - bossMulti(groups), 'single 只剩「非双 Boss」的 Boss 关', singles.join(','));
  ok(multi.indexOf('g18-5') > -1 && multi.indexOf('g24-5') > -1, '精英关仍全 multi（g18-5 / g24-5）');
  ok(multi.indexOf('g12-5') > -1 && multi.indexOf('g1-5') > -1, '早期精英关同样 multi（不再有 18 关门槛）');
  ok(multi.indexOf('g3-10') > -1 && multi.indexOf('g6-10') > -1 && multi.indexOf('g24-10') > -1, '双 Boss：g3-10 / g6-10 / … / g24-10');
  ok(singles.indexOf('g1-10') > -1 && singles.indexOf('g2-10') > -1 && singles.indexOf('g4-10') > -1, '其余 Boss 关仍 single（单场景单 Boss）');
  ok(sb.getGroupStage('g18-10').mode === 'multi', 'g18-10（18 % 3 = 0）是双 Boss 关');
  ok(sb.getGroupStage('g17-10').mode === 'single', 'g17-10（17 % 3 ≠ 0）是普通单场景 Boss');
  ok(sb.stageIsMulti(18, 5) && sb.stageIsMulti(1, 1) && sb.stageIsMulti(24, 9), 'stageIsMulti：x1–x9 任意大关为 true');
  ok(!sb.stageIsMulti(30, 5), '超过 GROUP_MAX 的 g30-5 不派生（防越界）');
  ok(!sb.stageIsMulti(1, 10) && sb.stageIsMulti(3, 10), 'x-10 只在 lg%3==0 时派生（g1-10 false / g3-10 true）');
  ok(sb.MULTI_BOSS_EVERY === 3, '双 Boss 节律常量 = 3（唯一来源 group-levels.js）');
  /* v2.14.24：关卡列表的形态标签也走同一判据（UI 只调用，不再自己判） */
  ok(sb.stageModeLabel(3, 1) === '双场景', 'stageModeLabel：普通关 = 双场景');
  ok(sb.stageModeLabel(3, 5) === '双场景', 'stageModeLabel：x5 精英关 = 双场景');
  ok(sb.stageModeLabel(3, 10) === '双 BOSS', 'stageModeLabel：g3-10 = 双 BOSS');
  ok(sb.stageModeLabel(4, 10) === '', 'stageModeLabel：非双 Boss 的 x-10 不显示标签（单场景）');
  ok(sb.stageModeLabel(30, 5) === '' && sb.stageModeLabel(1, 11) === '', 'stageModeLabel：越界一律空（不猜）');
  /* 双 Boss 编成：每侧一份完整编成（1 Boss + 2 护卫）⇒ 两场景合计 2 个 Boss，不需要新逻辑 */
  const bossStage = sb.getGroupStage('g3-10');
  const bossCfgs = sb.groupStageEnemies('g3-10', bossStage);
  ok(bossCfgs.length >= 2 && bossCfgs[0].tier !== bossCfgs[1].tier, 'Boss 编成 = 1 Boss + 护卫（每侧一份 ⇒ 全场双 Boss）', JSON.stringify(bossCfgs.map(c => c.tier)));
})();

/* ---------- 8. 源码守卫：唯一助手 + mode 单一消费方 ---------- */
console.log('\n[8] 源码守卫（单一入口、mode 只在开战入口消费）');
(function () {
  function read(f) { return fs.readFileSync(path.join(PAGE, f), 'utf8'); }
  const bg = read('battle-group.js');
  const ai = read('ai.js');
  const tr = read('terrain.js');
  const gl = read('group-levels.js');
  ok(/function attackable\(u\) \{/.test(bg), 'attackable 定义在 battle-group.js（引擎单一来源）');
  ok(bg.indexOf('!u._untargetable') > -1, '判据含 _untargetable');
  ok(/filter\(function\s*\(u\)\s*\{\s*return attackable\(u\);\s*\}\)/.test(ai), 'ai.js 的选靶池走 attackable');
  ok(ai.indexOf('u.hp > 0') < 0, 'ai.js 不再残留裸 hp>0 目标池');
  ok(tr.indexOf('function terrainAttackable(') > -1, 'terrain.js 有统一取靶判据');
  ok(tr.indexOf('return u.hp > 0;') < 0, 'terrain.js 不再残留裸 hp>0 过滤');
  ok(/mode: isMulti \? 'multi' : 'single'/.test(gl), 'mode 只在 group-levels.js 的生成循环里派生');
  /* 生产代码消费 `mode:"multi"` 的位置必须**唯一**且明确：开战入口（game-render.js）。
     导演层本身与 mode 解耦（它只认两个 gb）。 */
  const others = scripts.filter(s => s !== 'group-levels.js' && s !== 'design-doc.js');
  const consumers = [];
  others.forEach(f => {
    const src = read(f);
    if (/stage\.mode|\.mode === 'multi'|glv\.mode === 'multi'/.test(src)) consumers.push(f);
  });
  ok(consumers.length === 1 && consumers[0] === 'game-render.js', '👀 mode 只有一个消费方：开战入口', consumers.join(','));
  ok(read('group-dual.js').indexOf("mode === 'multi'") < 0, '导演层与 mode 解耦（它只认两个 gb，不自己判关卡类型）');
})();

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);

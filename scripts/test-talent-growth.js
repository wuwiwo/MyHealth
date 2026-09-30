#!/usr/bin/env node
/* WP-F 测试：敌群天赋「接成长」（doc/2.2-修改提案.md §5.4A 裁决「天赋是（接成长），词条不是」+ §5.1 逐条评审）
   ──────────────────────────────────────────────────────────────────────────────────
   判据（照 scripts/test-skill-range-channels.js 的口径）：**把进度 t 从 0 拉到 1，
   输出数值必须真的变化** —— 不能只看「没抛异常」（v2.1.25 的教训：断言照跑但什么都没验证）。

   本文件覆盖：
   [1] 驱动源 = 与敌群技能**同一套**（`talentRangeT` ≡ `skillRangeT`；大关号 → level → t 逐档一致）
   [2] 区间端点 = §5.1 设计原文的 X~Y（改区间会被这里挡下）
   [3] 逐条：t=0 / t=1 的 hook 输出真的不同，且等于区间端点
   [4] 实战通道（normalAttack / groupBattleStep）里的数值随等级变化
   [5] 负向对照：不接成长的 4 条（vigor / magicmirror / plain / vengeance）**逐条不变**
   [6] 受阻项登记：intimidate 的幅度（消费点在禁改的 battle-group.js，读全局常量）
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'affix.js',
  'skill.js', 'enemy.js', 'terrain.js', 'battle.js', 'group-levels.js', 'battle-group.js'];

const sb = { Math, JSON, console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BASE = { hp: 1000, atk: 100, def: 0, soulAtk: 50, soulDef: 0, spd: 100 };

/* 造一个「带某天赋、等级可控」的敌人（等级 = 大关号，1~10） */
function en(id, talents, level, base) {
  return sb.createEnemyUnit({ id: id, tier: 'minion', name: id, talents: talents, level: level,
    base: base || BASE });
}
/* 取某天赋在某个等级下的「取值」（走同一个数值出口 talentValue） */
function val(id, key, level) { return sb.talentValue(id, key, en('v-' + id + '-' + level, [id], level), null); }

/* ============================================================
   [1] 驱动源：与敌群技能同一套
   ============================================================ */
assert('TALENT_LEVEL_MAX 与 skill.js 的 SKILL_LEVEL_MAX 同口径（都是 10）',
  sb.TALENT_LEVEL_MAX === sb.SKILL_LEVEL_MAX && sb.SKILL_LEVEL_MAX === 10,
  sb.TALENT_LEVEL_MAX + ' vs ' + sb.SKILL_LEVEL_MAX);

(function () {
  let same = true, bad = null;
  for (let lv = 1; lv <= 10 && same; lv++) {
    const u = en('drv' + lv, ['blade'], lv);
    const a = sb.talentRangeT(u), b = sb.skillRangeT(u);
    if (Math.abs(a - b) > 1e-12 || Math.abs(a - (lv - 1) / 9) > 1e-12) { same = false; bad = lv + ': ' + a + ' vs ' + b; }
  }
  assert('talentRangeT ≡ skillRangeT（10 档逐档比对，且 = (level−1)/9）', same, String(bad));
})();

/* 大关号 → level → t：由 group-levels.js 的 genEnemyCfg 给定（**不另立一套**） */
(function () {
  const rows = [1, 5, 9, 10, 15, 24].map(function (lg) {
    const cfg = sb.genEnemyCfg(lg, 1, 0, false, false);
    const u = en('glv' + lg, ['blade'], cfg.level);
    return { lg: lg, level: cfg.level, t: sb.talentRangeT(u) };
  });
  assert('大关号 → level 由 group-levels 夹在 1..10（g1=1 / g9=9 / g10 及以上=10）',
    rows[0].level === 1 && rows[1].level === 5 && rows[2].level === 9 && rows[3].level === 10 &&
    rows[4].level === 10 && rows[5].level === 10,
    JSON.stringify(rows));
  assert('大关号 → t：g1 = 0、g10 及以上 = 1（§5.6-4 方案①）',
    rows[0].t === 0 && rows[3].t === 1 && rows[4].t === 1 && rows[5].t === 1, JSON.stringify(rows));
})();

/* 驱动源真的接到实战：所有把「关卡配置」转成敌人的调用点都要带 level
   （v2.2.20 起宠物区入口已并入 game-render.js 的 startGroupTrial，故这里按**全目录扫描**判定，
    不写死文件名 —— pet-ui.js 的对应代码已随另一条线抽走） */
(function () {
  const dir = path.join(__dirname, '..', 'page');
  const hits = [];
  fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(function (f) {
    const src = load(f);
    const re = /createEnemyUnit\(\{[^)]*\}\)/g;
    let m;
    while ((m = re.exec(src))) {
      if (/ec\./.test(m[0])) hits.push({ f: f, hasLevel: /level:\s*ec\.level/.test(m[0]) });
    }
  });
  assert('把关卡配置转成敌人的调用点（' + hits.length + ' 处）全部传 `level: ec.level`（驱动源真的接通）',
    hits.length >= 2 && hits.every(h => h.hasLevel), hits.map(h => h.f + ':' + h.hasLevel).join(','));
  assert('`level` 的来源就是关卡配置本身（group-levels 的 genEnemyCfg 写 level = clamp(大关号,1,10)）',
    /level: Math\.max\(1, Math\.min\(10, lg\)\)/.test(load('group-levels.js')));
  assert('兜底/锚定路径暂不影响：GROUP_ANCHOR.enabled = false（其 cfg 映射未带 level，属既有口径，未在本轮扩大）',
    sb.GROUP_ANCHOR.enabled === false, String(sb.GROUP_ANCHOR.enabled));
})();

/* ============================================================
   [2] 区间 = §5.1 设计原文的 X~Y
   ============================================================ */
const DESIGN_RANGES = {
  blade:       { boost: [0.10, 0.50] },                                  // §5.1.1「10%~50%」
  flutter:     { pct: [0.05, 0.20] },                                    // §5.1.2「5%~20%（至少+1）」
  roughskin:   { pct: [0.10, 0.50] },                                    // §5.1.3「10%~50%」
  magicshield: { reduce: [0.15, 0.45] },                                 // §5.1.8「15%~45%」
  slowstart:   { rounds: [2, 4] },                                       // §5.1.9「2~4 回合启动时间」
  lazy:        { dmgReduce: [0.20, 0.40] },                              // §5.1.10「降低 20%~40%」
  multitarget: { extra: [1, 2], penalty: [0.8, 0.7] },                   // §5.1.11「降低20%~30% + 额外 1~2 个」
  bloodthirst: { heal: [0.10, 0.35] },                                   // §5.1.12「10%~35%」
  regen:       { heal: [0.03, 0.08], interval: [2, 3] }                  // §5.1.14「每 2-3 回合 / 3%~8%」
};
Object.keys(DESIGN_RANGES).forEach(function (id) {
  assert(id + ' 的 range 逐键等于 §5.1 的设计区间', eq(sb.TALENTS[id].range, DESIGN_RANGES[id]),
    JSON.stringify(sb.TALENTS[id].range) + ' vs ' + JSON.stringify(DESIGN_RANGES[id]));
});

/* ============================================================
   [3] 逐条：t=0 / t=1 的 hook 输出真的不同
   ============================================================ */
/* 利刃：攻击伤害提升 */
(function () {
  function boost(level) {
    return sb.talentDispatch(en('bl' + level, ['blade'], level), 'onDamage', { isPlayerAttack: true })
      .mutations.find(m => m.key === 'dmgBoost').value;
  }
  assert('利刃：随成长变化（10% → 50%）', Math.abs(boost(1) - 0.10) < 1e-9 && Math.abs(boost(10) - 0.50) < 1e-9,
    boost(1) + ' → ' + boost(10));
  assert('利刃：中段是连续值（Lv5 = 10% + 40%×4/9 ≈ 27.8%）',
    Math.abs(boost(5) - (0.10 + 0.40 * (4 / 9))) < 1e-9, String(boost(5)));
})();

/* 振翅：每回合速度增量 */
(function () {
  function inc(level, spd) {
    const u = en('fl' + level + '-' + spd, ['flutter'], level, { hp: 100, atk: 5, def: 3, spd: spd });
    const before = u.base.spd;
    sb.talentDispatch(u, 'onTurnEnd', { turn: 1 });
    return u.base.spd - before;
  }
  assert('振翅：随成长变化（spd 100 → +5 / +20）', inc(1, 100) === 5 && inc(10, 100) === 20,
    inc(1, 100) + ' → ' + inc(10, 100));
  assert('振翅：低等级也满足「至少 +1」（spd 10 → 1）', inc(1, 10) === 1, String(inc(1, 10)));
})();

/* 粗糙皮肤：反伤 */
(function () {
  function reflect(level) {
    return sb.talentDispatch(en('rs' + level, ['roughskin'], level), 'onDamage', { attacker: { id: 'a' }, isPhysical: true, amount: 1000 })
      .mutations.find(m => m.key === 'reflectFlat').value;
  }
  assert('粗糙皮肤：随成长变化（1000 伤害 → 反 100 / 500）', reflect(1) === 100 && reflect(10) === 500,
    reflect(1) + ' → ' + reflect(10));
})();

/* 魔法盾：魂伤减免 */
(function () {
  function reduce(level) {
    return sb.talentDispatch(en('ms' + level, ['magicshield'], level), 'onDamage', { isSoul: true })
      .mutations.find(m => m.key === 'soulDmgReduce').value;
  }
  assert('魔法盾：随成长变化（15% → 45%）', Math.abs(reduce(1) - 0.15) < 1e-9 && Math.abs(reduce(10) - 0.45) < 1e-9,
    reduce(1) + ' → ' + reduce(10));
})();

/* 慢启动：启动回合数 */
(function () {
  function skip(level, actualTurn) {
    return !!sb.talentDispatch(en('ss' + level, ['slowstart'], level), 'onBeforeAction',
      { turn: actualTurn + 1, actualTurn: actualTurn }).skipAction;
  }
  assert('慢启动：随成长变化（Lv1 只在第 1~2 回合不能动）', skip(1, 2) && !skip(1, 3));
  assert('慢启动：Lv10 → 第 4 回合仍不能动、第 5 回合可以', skip(10, 4) && !skip(10, 5));
})();

/* 懒惰：放弃行动回合的减伤（25% 触发率不接成长） */
(function () {
  function red(level) {
    const u = en('lz' + level, ['lazy'], level);
    u._lazySkip = true;
    return sb.talentDispatch(u, 'onDamage', {}).mutations.find(m => m.key === 'dmgReduce').value;
  }
  assert('懒惰：减伤随成长变化（20% → 40%）', Math.abs(red(1) - 0.20) < 1e-9 && Math.abs(red(10) - 0.40) < 1e-9,
    red(1) + ' → ' + red(10));
  assert('懒惰：触发率仍是固定 25%（设计原文写死 25%，不接成长）', /battleRnd\(\) < 0\.25/.test(load('talent.js')));
})();

/* 多目标：额外目标数 + 降伤 */
(function () {
  function targets(level) {
    return sb.talentDispatch(en('mt' + level, ['multitarget'], level), 'onBeforeAction', {})
      .mutations.find(m => m.key === 'multiTarget').value;
  }
  function red(level) {
    return sb.talentDispatch(en('mtp' + level, ['multitarget'], level), 'onDamage', { isPlayerAttack: true })
      .mutations.find(m => m.key === 'dmgReduce').value;
  }
  assert('多目标：额外目标数随成长（总目标 2 → 3）', targets(1) === 2 && targets(10) === 3, targets(1) + ' → ' + targets(10));
  assert('多目标：降伤随成长（20% → 30%）', Math.abs(red(1) - 0.2) < 1e-9 && Math.abs(red(10) - 0.3) < 1e-9,
    red(1) + ' → ' + red(10));
})();

/* 嗜血：回复比例 */
(function () {
  function heal(level) {
    const u = en('bt' + level, ['bloodthirst'], level);
    u.hp = 10;
    sb.talentDispatch(u, 'onAfterDamage', { dealt: 100 });
    return u.hp - 10;
  }
  assert('嗜血：随成长变化（dealt 100 → 回 10 / 35）', heal(1) === 10 && heal(10) === 35, heal(1) + ' → ' + heal(10));
})();

/* 再生：周期 + 回复比例（§5.1.14「每经过 2-3 回合 / 3%~8%」） */
(function () {
  function healAt(level, turn) {
    const u = en('rg' + level, ['regen'], level, { hp: 1000, atk: 5, def: 3, spd: 5 });
    u.hp = 500;
    sb.talentDispatch(u, 'onTurnEnd', { turn: turn });
    return u.hp - 500;
  }
  assert('再生：周期随成长（Lv1 每 2 回合 → 第 2 回合就回、第 3 回合不回）',
    healAt(1, 2) === 30 && healAt(1, 3) === 0, healAt(1, 2) + ' / ' + healAt(1, 3));
  assert('再生：Lv10 周期 3 回合（第 2 回合不回、第 3 回合回 8% = 80）',
    healAt(10, 2) === 0 && healAt(10, 3) === 80, healAt(10, 2) + ' / ' + healAt(10, 3));
  assert('再生：回复比例随成长（3% → 8%）',
    Math.abs(val('regen', 'heal', 1) - 0.03) < 1e-9 && Math.abs(val('regen', 'heal', 10) - 0.08) < 1e-9,
    val('regen', 'heal', 1) + ' → ' + val('regen', 'heal', 10));
})();

/* ============================================================
   [4] 实战通道：真的随等级变化
   ============================================================ */
/* 4a. 利刃：真打一记普攻，伤害随等级变化 */
(function () {
  function dmg(level) {
    const foe = en('bl-e2e-' + level, ['blade'], level, { hp: 9999, atk: 100, def: 0, spd: 5 });
    const me = sb.createUnit({ id: 'bl-t-' + level, side: 'ally', name: '靶', level: 1, base: { hp: 9999, atk: 1, def: 0, spd: 1 } });
    const gb = sb.createGroupBattle({ allies: [me], enemies: [foe], rng: function () { return 0; } });
    const ev = sb.normalAttack(gb, foe, me);
    const m = /→ (\d+) 伤害/.exec((ev || []).map(e => e.msg || '').join(' | '));
    return m ? +m[1] : null;
  }
  const d1 = dmg(1), d10 = dmg(10);
  assert('利刃（实战普攻）：伤害随等级变化（基础 101 → 111 / 151）', d1 === 111 && d10 === 151, d1 + ' → ' + d10);
})();

/* 4b. 粗糙皮肤：真打一记普攻，反伤随等级变化 */
(function () {
  function reflect(level) {
    const foe = en('rs-e2e-' + level, ['roughskin'], level, { hp: 99999, atk: 1, def: 0, spd: 1 });
    const me = sb.createUnit({ id: 'rs-a-' + level, side: 'ally', name: '打手', level: 1, base: { hp: 9999, atk: 100, def: 0, spd: 9 } });
    const gb = sb.createGroupBattle({ allies: [me], enemies: [foe], rng: function () { return 0; } });
    sb.normalAttack(gb, me, foe);
    return 9999 - me.hp;
  }
  const r1 = reflect(1), r10 = reflect(10);
  assert('粗糙皮肤（实战普攻）：反伤随等级变化（101 伤害 → 反 10 / 50）', r1 === 10 && r10 === 50, r1 + ' → ' + r10);
})();

/* 4c. 再生：真跑回合，统计恢复次数（Lv1 每 2 回合 / Lv10 每 3 回合） */
(function () {
  function heals(level) {
    const foe = en('rg-e2e-' + level, ['regen'], level, { hp: 999999, atk: 1, def: 0, spd: 20 });
    const me = sb.createUnit({ id: 'rg-p-' + level, side: 'ally', name: '你', level: 1, base: { hp: 999999, atk: 1, def: 9999, spd: 1 } });
    const gb = sb.createGroupBattle({ allies: [me], enemies: [foe], seed: 4242 });
    let n = 0;
    for (let i = 0; i < 24 && !gb.done; i++) {
      const r = sb.groupBattleStep(gb);
      (r.events || []).forEach(e => { if (e.msg && e.msg.indexOf('再生') >= 0) n++; });
    }
    return n;
  }
  const h1 = heals(1), h10 = heals(10);
  assert('再生（实战回合）：Lv1 恢复次数 > Lv10（周期 2 vs 3）', h1 > h10 && h10 > 0, h1 + ' vs ' + h10);
})();

/* ============================================================
   [5] 负向对照：§5.1 未给区间的 4 条**不接成长**
   ============================================================ */
['vigor', 'magicmirror', 'plain', 'vengeance'].forEach(function (id) {
  assert('不接成长: ' + id + ' 未声明 range（无区间可接）', sb.TALENTS[id].range === undefined,
    JSON.stringify(sb.TALENTS[id].range));
});
(function () {
  /* 强健：Lv1 与 Lv10 的静态修正一致（+15%） */
  const a = en('vg1', ['vigor'], 1, { hp: 100, atk: 20, def: 10, spd: 5 });
  const b = en('vg10', ['vigor'], 10, { hp: 100, atk: 20, def: 10, spd: 5 });
  assert('强健：Lv1 与 Lv10 的加成相同（+15% → 23 / 11），不随成长',
    a.base.atk === 23 && b.base.atk === 23 && a.base.def === 11 && b.base.def === 11,
    JSON.stringify([a.base.atk, b.base.atk]));
  /* 复仇：每层 +10%，与等级无关 */
  function vengeAtk(level) {
    const u = en('vng' + level, ['vengeance'], level, { hp: 100, atk: 100, def: 10, spd: 5, soulAtk: 100 });
    u.hp = 60;   // 损失 40% → 2 层
    sb.talentDispatch(u, 'onTurnStart', {});
    return u.base.atk;
  }
  assert('复仇：Lv1 与 Lv10 同值（每层 +10% 维持现状，§5.6-6）', vengeAtk(1) === 120 && vengeAtk(10) === 120,
    vengeAtk(1) + ' / ' + vengeAtk(10));
  /* 魔法镜：几率仍是 30% */
  assert('魔法镜：触发几率仍是固定 30%（§5.1.5 未给区间）', /var chance = 0\.3;/.test(load('talent.js')));
  /* 朴实：作用面与等级无关（判据只看状态是否直接改属性） */
  assert('朴实：作用面判据与等级无关（hook 里不读 level / t）',
    !/onBeforeStatus[\s\S]{0,600}?talentRangeT/.test(load('talent.js')));
})();

/* ============================================================
   [6] 受阻项登记：威吓的幅度（10%~50%）
   ============================================================ */
(function () {
  const bg = load('battle-group.js');
  assert('威吓：幅度仍未接成长（INTIMIDATE_ATK_DOWN = 0.4 固定，且未声明 range）',
    sb.INTIMIDATE_ATK_DOWN === 0.4 && sb.TALENTS.intimidate.range === undefined,
    sb.INTIMIDATE_ATK_DOWN + ' / ' + JSON.stringify(sb.TALENTS.intimidate.range));
  assert('受阻原因（登记）：消费点在 battle-group.js，读**全局常量**而非单位级字段 —— 3 处消费点 + 无单位级入口',
    /function intimidateAtkDown\(\)/.test(bg) &&
    (bg.match(/intimidateAtkDown\(\)/g) || []).length >= 3 &&
    !/_intimidateDown/.test(bg),
    'intimidateAtkDown 调用次数=' + (bg.match(/intimidateAtkDown\(\)/g) || []).length);
  assert('对照（为什么魔法盾能接）：它的消费端读 mutation 的 m.value（单位级），不读全局常量',
    /soulDmgReduce'\)\s*dmg = Math\.floor\(dmg \* \(1 - m\.value\)\)/.test(bg));
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

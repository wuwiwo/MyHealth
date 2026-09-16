/* ============================================
   MyHealth — 敌群词条（Affixes）
   「词条」与「天赋」是**两个独立维度**：
     · 天赋 TALENTS（talent.js）：生物**固有**被动，跟着敌人种类走
     · 词条 AFFIXES（本文件）：Boss / 精英**额外附加**的强化，跟着难度走
   设计依据：
     · doc/2.0 敌群设计.md:248 「Boss = 高天赋组合 + **额外 Boss 词条**（沿用现有词条系统）」
     · doc/2.0 敌群设计.md:251 「Boss 在敌群基础上叠加现有 BOSS_AFFIXES 词条（**独立维度**）」
   在此之前这 8 个词条被注册进了 talent.js 的 TALENTS 里（v2.1.13 起的混装），
   与天赋共用一套池子与「天赋」标签 —— 本文件把注册表、池子、UI 标签拆开。

   ⚠️ 本次是**纯结构性拆分，不改数值**：Boss/精英拿到的那几个能力与改前完全一致，
      只是改从 AFFIXES 注册表取。平衡实测应与 v2.1.24 一致。

   钩子语义与 talent.js 完全一致（onTurnStart/onTurnEnd/onBeforeAction/onAfterAction/
   onDamage/onHeal/...），statMods 亦同。纯逻辑，无 DOM/store。
   ============================================ */

var AFFIXES = {};   // id → affix def

/* registerAffix({id, name, desc, hooks:{...}, statMods?}) */
function registerAffix(def) {
  if (!def || !def.id) throw new Error('registerAffix: id required');
  AFFIXES[def.id] = def;
  return def;
}

function getAffix(id) { return AFFIXES[id] || null; }
function listAffixes() { return Object.keys(AFFIXES); }

/* 静态属性修正（与 talentStatMods 同口径） */
function affixStatMods(affixIds, base) {
  var mods = {};
  (affixIds || []).forEach(function (id) {
    var a = AFFIXES[id];
    if (!a || !a.statMods) return;
    var result = (typeof a.statMods === 'function') ? a.statMods(base) : a.statMods;
    for (var k in result) mods[k] = (mods[k] || 0) + result[k];
  });
  return mods;
}

/* 把词条挂到 unit 上：写入 unit._affixes（id 列表）供 battle 调度 */
function attachAffixes(unit, affixIds) {
  if (!unit) return unit;
  unit._affixes = (affixIds || []).slice();
  unit._affixMods = affixStatMods(unit._affixes, unit.base);
  return unit;
}

/* 聚合某个单位所有词条的指定 hook（与 talentDispatch 同形） */
function affixDispatch(unit, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  if (!unit) return out;
  ctx = ctx || {};
  (unit._affixes || []).forEach(function (id) {
    var a = AFFIXES[id];
    if (!a || !a.hooks || !a.hooks[hook]) return;
    var r = a.hooks[hook](unit, ctx);
    if (!r) return;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  });
  return out;
}

/* 多单位版本（阵营光环类词条用；与 talentAura 同形） */
function affixAura(units, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  ctx = ctx || {};
  (units || []).forEach(function (u) {
    var r = affixDispatch(u, hook, ctx);
    if (r.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(r.mutations);
    out.events = out.events.concat(r.events);
  });
  return out;
}

/* 池子：Boss / 精英的固定减伤词条 + 可随机附加的「其他词条」 */
var AFFIX_BOSS_FIXED = 'cut_boss';    // 伤害减免·大（Boss 固定）
var AFFIX_ELITE_FIXED = 'cut_elite';  // 伤害减免·中（精英固定）
var AFFIX_EXTRA = ['aoe_guard', 'skill_guard', 'grow_atk', 'grow_def', 'doom_call', 'extra_act'];

/* ============================================================
   以下 8 条原样搬自 talent.js 末尾（v2.1.13 的「敌群专属词条」），
   钩子实现一字未改 —— 保证拆分前后行为一致。
   约定：ctx.isPlayerAttack === false 表示「本单位是受击方」，
   减伤类词条只在该分支返回 dmgTakenReduce；多个 dmgTakenReduce 在
   battle-group.js 里连乘，天然叠加。
   ============================================================ */

/* 伤害减免·大（Boss 固定）：受到的所有伤害 -40% */
registerAffix({
  id: 'cut_boss',
  name: '伤害减免·大',
  desc: '受到的所有伤害降低 40%',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) return;
      return { mutations: [{ key: 'dmgTakenReduce', value: 0.40 }] };
    }
  }
});

/* 伤害减免·中（精英固定）：受到的所有伤害 -25% */
registerAffix({
  id: 'cut_elite',
  name: '伤害减免·中',
  desc: '受到的所有伤害降低 25%',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) return;
      return { mutations: [{ key: 'dmgTakenReduce', value: 0.25 }] };
    }
  }
});

/* 抗扩散：受到 AOE 伤害 -30%（与伤害减免叠加） */
registerAffix({
  id: 'aoe_guard',
  name: '抗扩散',
  desc: '受到范围技能伤害降低 30%（与伤害减免叠加）',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack || !ctx.isAoe) return;
      return { mutations: [{ key: 'dmgTakenReduce', value: 0.30 }] };
    }
  }
});

/* 抗技法：受到角色技能伤害 -50%（与伤害减免叠加） */
registerAffix({
  id: 'skill_guard',
  name: '抗技法',
  desc: '受到角色技能伤害降低 50%（与伤害减免叠加）',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack || !ctx.isSkill || !ctx.fromPlayer) return;
      return { mutations: [{ key: 'dmgTakenReduce', value: 0.50 }] };
    }
  }
});

/* 战意高涨：每 2 回合 +3% 攻击，最多 20 层（+60%） */
registerAffix({
  id: 'grow_atk',
  name: '战意高涨',
  desc: '每 2 回合提升 3% 攻击，最多叠加 20 层',
  hooks: {
    onTurnEnd: function (unit) {
      unit._growAtkT = (unit._growAtkT || 0) + 1;
      if (unit._growAtkT < 2) return;
      unit._growAtkT = 0;
      var st = Math.min(20, (unit._growAtkStacks || 0) + 1);
      unit._growAtkStacks = st;
      if (unit._growAtkBase == null) unit._growAtkBase = unit.base.atk;
      unit.base.atk = Math.floor(unit._growAtkBase * (1 + st * 0.03));
      if (st % 5 === 0) return { events: [{ type: 'affix', affixId: 'grow_atk', unitId: unit.id, msg: '战意高涨: 攻击 +' + (st * 3) + '%（' + st + '/20）' }] };
    }
  }
});

/* 铁壁：每 2 回合 +5% 防御，最多 20 层（+100%） */
registerAffix({
  id: 'grow_def',
  name: '铁壁',
  desc: '每 2 回合提升 5% 防御，最多叠加 20 层',
  hooks: {
    onTurnEnd: function (unit) {
      unit._growDefT = (unit._growDefT || 0) + 1;
      if (unit._growDefT < 2) return;
      unit._growDefT = 0;
      var st = Math.min(20, (unit._growDefStacks || 0) + 1);
      unit._growDefStacks = st;
      if (unit._growDefBase == null) unit._growDefBase = unit.base.def;
      unit.base.def = Math.floor(unit._growDefBase * (1 + st * 0.05));
      if (st % 5 === 0) return { events: [{ type: 'affix', affixId: 'grow_def', unitId: unit.id, msg: '铁壁: 防御 +' + (st * 5) + '%（' + st + '/20）' }] };
    }
  }
});

/* 终末宣告：每 15 回合使敌方全体受到最大生命 25% 的纯粹伤害（初始处于冷却） */
registerAffix({
  id: 'doom_call',
  name: '终末宣告',
  desc: '每 15 回合使敌方全体受到最大生命 25% 的纯粹伤害（无视防御，初始冷却）',
  hooks: {
    onTurnEnd: function (unit, ctx) {
      unit._doomT = (unit._doomT || 0) + 1;
      if (unit._doomT < 15) return;
      unit._doomT = 0;
      var foes = (ctx && ctx.enemyUnits) || [];
      var events = [];
      foes.forEach(function (t) {
        if (!t || t.hp <= 0) return;
        var dmg = Math.max(1, Math.floor((t.base.hp || 0) * 0.25));
        t.hp = Math.max(0, t.hp - dmg);
        events.push({ type: 'affix', affixId: 'doom_call', unitId: unit.id, msg: '终末宣告: ' + (t.name || '敌方') + ' 受到 ' + dmg + ' 点纯粹伤害' });
      });
      return { events: events };
    }
  }
});

/* 疾影：本回合有 55% 几率额外行动 1 次，冷却 3 回合 */
registerAffix({
  id: 'extra_act',
  name: '疾影',
  desc: '本回合有 55% 几率额外行动 1 次（冷却 3 回合）',
  hooks: {
    onAfterAction: function (unit) {
      if ((unit._extraCd || 0) > 0) return;
      if (battleRnd() >= 0.55) return;
      unit._extraCd = 3;
      return {
        mutations: [{ key: 'extraAction', value: 1 }],
        events: [{ type: 'affix', affixId: 'extra_act', unitId: unit.id, msg: '疾影: ' + (unit.name || '单位') + ' 额外行动一次！' }]
      };
    },
    onTurnEnd: function (unit) {
      if (unit._extraCd > 0) unit._extraCd--;
    }
  }
});

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.AFFIXES = AFFIXES;
  window.registerAffix = registerAffix;
  window.getAffix = getAffix;
  window.listAffixes = listAffixes;
  window.attachAffixes = attachAffixes;
  window.affixDispatch = affixDispatch;
  window.affixAura = affixAura;
  window.AFFIX_EXTRA = AFFIX_EXTRA;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AFFIXES = AFFIXES;
  globalThis.registerAffix = registerAffix;
  globalThis.getAffix = getAffix;
  globalThis.listAffixes = listAffixes;
  globalThis.attachAffixes = attachAffixes;
  globalThis.affixDispatch = affixDispatch;
  globalThis.affixAura = affixAura;
  globalThis.AFFIX_EXTRA = AFFIX_EXTRA;
}

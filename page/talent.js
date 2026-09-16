/* ============================================
   MyHealth — Enemy Talents (M2b-1)
   天赋注册表（**词条不在这里**，见 affix.js）。数据驱动：每个天赋 = hooks 集（对接 state-core 机制）。
   纯逻辑，无 DOM/store。依赖 state-core.js（defineStatus 可选）、unit.js。
   ============================================ */

var TALENTS = {};   // id → talent def

/* registerTalent({id, name, desc, hooks:{...}, statMods?})
   hooks 与 state-core 一致：onTurnStart/onTurnEnd/onBeforeAction/onAfterAction/onDamage/onHeal/onApply/onExpire
   statMods: {atk?,def?,spd?,soulAtk?,soulDef?,...} 静态百分比修正（战斗开始计算一次） */
function registerTalent(def) {
  if (!def || !def.id) throw new Error('registerTalent: id required');
  TALENTS[def.id] = def;
  return def;
}

function getTalent(id) { return TALENTS[id] || null; }

/* 根据天赋 id 列表生成一个 unit 的静态属性修正（statMods）
   返回 {atk,def,spd,soulAtk,soulDef,...} 绝对数值（基于 base 计算） */
function talentStatMods(talentIds, base) {
  var mods = {};
  (talentIds || []).forEach(function (id) {
    var t = TALENTS[id];
    if (!t) return;
    var sm = t.statMods;
    if (!sm) return;
    var result = (typeof sm === 'function') ? sm(base) : sm;   // 先求值成对象
    for (var k in result) {
      mods[k] = (mods[k] || 0) + result[k];
    }
  });
  return mods;
}

/* 把天赋挂到 unit 上：写入 unit._talents（id 列表）供 battle 调度 */
function attachTalents(unit, talentIds) {
  unit._talents = (talentIds || []).slice();
  unit._talentMods = talentStatMods(unit._talents, unit.base);
  return unit;
}

/* battle 在时机点调用：聚合所有天赋的指定 hook */
function talentDispatch(unit, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  ctx = ctx || {};
  (unit._talents || []).forEach(function (id) {
    var t = TALENTS[id];
    if (!t || !t.hooks || !t.hooks[hook]) return;
    var r = t.hooks[hook](unit, ctx);
    if (!r) return;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  });
  /* v2.1.25：本函数派发的是「单位被动」，包含两个**独立注册表** ——
     天赋 TALENTS（固有）+ 词条 AFFIXES（Boss/精英附加，见 affix.js）。
     词条原先被误注册进 TALENTS，现在拆开；因为调度口在这里合并，**所有调用点无需改动**。
     （8 条词条只用 onDamage / onTurnEnd / onAfterAction，全部经由本函数派发，
       所以 talentAura 不必再合并一遍。） */
  if (typeof affixDispatch === 'function') {
    var ar = affixDispatch(unit, hook, ctx);
    if (ar.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(ar.mutations);
    out.events = out.events.concat(ar.events);
  }
  return out;
}

/* v2.1.15：能力变化归零（供「清除迷雾」使用）。
   grow_atk / grow_def / vengeance / flutter 这 4 个天赋是**直接改 unit.base** 的
   （每回合 +3% 攻击、+5% 防御、按损失血量提升攻击、每回合加一点速度），
   而设计文档的「清除迷雾：使全场能力变化变为 0」需要能把这些改动还原 ——
   所以这 4 个天赋都留了初始值快照。返回被还原的项名（供日志）。 */
function resetAbilityChanges(unit) {
  var back = [];
  if (!unit || !unit.base) return back;
  if (unit._growAtkBase != null) {
    unit.base.atk = unit._growAtkBase; unit._growAtkStacks = 0; unit._growAtkT = 0; back.push('攻击');
  }
  if (unit._growDefBase != null) {
    unit.base.def = unit._growDefBase; unit._growDefStacks = 0; unit._growDefT = 0; back.push('防御');
  }
  if (unit._vengeAtkBase != null) {
    unit.base.atk = unit._vengeAtkBase;
    unit.base.soulAtk = unit._vengeSoulBase || 0;
    unit._vengeStacks = 0; back.push('复仇加成');
  }
  if (unit._flutterBase != null) {
    unit.base.spd = unit._flutterBase; back.push('速度');
  }
  // 能力变化也包含命中/闪避修正（「变小」的常驻闪避、宠物「闪耀/打湿」的限时修正）
  if (unit._evaPerm || unit._eva || unit._accMod) {
    unit._evaPerm = 0; unit._eva = 0; unit._accMod = 0; unit._hitModTurns = 0;
    back.push('命中/闪避');
  }
  return back;
}

/* --- 16 天赋注册 --- */

/* 利刃：攻击造成伤害提升 10%-50%（按 level 取） */
registerTalent({
  id: 'blade',
  name: '利刃',
  desc: '攻击造成伤害提升（10%-50%）',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) {
        var boost = 0.10 + (unit.level || 1) * 0.005;  // 10% 起，随等级微增
        return { mutations: [{ key: 'dmgBoost', value: Math.min(0.5, boost) }] };
      }
    }
  }
});

/* 振翅：每回合结束，按速度初始值增加一定比例速度 */
registerTalent({
  id: 'flutter',
  name: '振翅',
  desc: '每回合结束，根据速度初始值增加一定比例的速度',
  hooks: {
    onTurnEnd: function (unit) {
      // v2.1.15：留下快照，供「清除迷雾」的能力变化归零还原
      if (unit._flutterBase == null) unit._flutterBase = unit.base.spd || 0;
      var baseSpd = unit._flutterBase;
      var inc = Math.max(1, Math.floor(baseSpd * 0.05));
      unit.base.spd += inc;
      return { events: [{ type: 'talent', talentId: 'flutter', unitId: unit.id, msg: '振翅: 速度 +' + inc }] };
    }
  }
});

/* 粗糙皮肤：受普通攻击时反伤（无视防御） */
registerTalent({
  id: 'roughskin',
  name: '粗糙皮肤',
  desc: '受到普通攻击时给予攻击者一定比例伤害（无视防御）',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.attacker && ctx.isPhysical) {
        var dmg = Math.max(1, Math.floor(ctx.amount * 0.15));
        return { mutations: [{ key: 'reflectFlat', value: dmg }] };
      }
    }
  }
});

/* 强健：攻击·防御·魂攻击·魂防御提升一定比例 */
registerTalent({
  id: 'vigor',
  name: '强健',
  desc: '自身攻击·防御·魂攻击·魂防御提升一定比例',
  statMods: function (base) {
    return {
      atk: Math.floor(base.atk * 0.15),
      def: Math.floor(base.def * 0.15),
      soulAtk: Math.floor((base.soulAtk || 0) * 0.15),
      soulDef: Math.floor((base.soulDef || 0) * 0.15)
    };
  }
});

/* 魔法镜：受指向性辅助技能时几率免疫并反弹 */
registerTalent({
  id: 'magicmirror',
  name: '魔法镜',
  desc: '受到指向性辅助类技能时，有几率免疫那次效果并反弹',
  hooks: {
    onBeforeSupport: function (unit, ctx) {
      if (ctx.targeted && ctx.support) {
        var chance = 0.3;
        if (battleRnd() < chance) {
          return {
            skipAction: true,
            mutations: [{ key: 'reflectSupport', value: ctx.sourceId || null }],
            events: [{ type: 'talent', talentId: 'magicmirror', unitId: unit.id, msg: '魔法镜: 免疫并反弹' }]
          };
        }
      }
    }
  }
});

/* 朴实：自身能力无法被任何效果影响（免疫所有状态） */
registerTalent({
  id: 'plain',
  name: '朴实',
  desc: '自身的能力无法被任何效果影响',
  hooks: {
    onBeforeStatus: function (unit, ctx) {
      return { skipAction: true, events: [{ type: 'talent', talentId: 'plain', unitId: unit.id, msg: '朴实: 免疫状态' }] };
    }
  }
});

/* 威吓：战斗开始时恐吓敌方随机 1 名，攻击力大幅降低，持续到自身血量<50%
   v2.1.14：本天赋唯一可读的削减幅度常量，battle-group.js 直接读取，避免两处各写一个魔法数。 */
var INTIMIDATE_ATK_DOWN = 0.4;
registerTalent({
  id: 'intimidate',
  name: '威吓',
  desc: '战斗开始时，恐吓敌方随机1名，攻击力大幅降低（持续到自身血量<50%）',
  hooks: {
    onBattleStart: function (unit, ctx) {
      var enemies = (ctx && ctx.enemyUnits) || [];
      if (!enemies.length) return;
      var target = enemies[Math.floor(battleRnd() * enemies.length)];
      target._intimidated = true;
      target._intimidateBy = unit.name || '威吓者';
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
        targetId: target.id,
        msg: '😱 威吓：' + (unit.name || '单位') + ' → ' + target.name + ' 攻击 -' + Math.round(INTIMIDATE_ATK_DOWN * 100) + '%（持续到威吓者血量 <50%）' }] };
    },
    onTurnStart: function (unit, ctx) {
      // 血量<50% 解除威吓（v2.1.14：解除时补一条日志，此前静默失效，玩家无从察觉）
      if (unit.hp < unit.base.hp * 0.5) {
        var freed = [];
        ((ctx && ctx.enemyUnits) || []).forEach(function (e) {
          if (e._intimidated) { e._intimidated = false; e._intimidateBy = ''; freed.push(e.name); }
        });
        if (freed.length) {
          return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
            msg: '😤 威吓解除：' + (unit.name || '单位') + ' 血量低于 50%，' + freed.join('、') + ' 攻击恢复' }] };
        }
      }
    }
  }
});

/* 魔法盾：受到魂攻击伤害降低 */
registerTalent({
  id: 'magicshield',
  name: '魔法盾',
  desc: '自身受到魂攻击伤害降低',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isSoul) {
        return { mutations: [{ key: 'soulDmgReduce', value: 0.3 }] };
      }
    }
  }
});

/* 慢启动：战斗开始前 x 回合无法行动 */
registerTalent({
  id: 'slowstart',
  name: '慢启动',
  desc: '战斗开始的前 x 回合，自身无法行动',
  config: { rounds: 2 },
  hooks: {
    onBeforeAction: function (unit, ctx) {
      if (ctx.turn <= (unit._slowRounds || 2)) {
        return { skipAction: true, events: [{ type: 'talent', talentId: 'slowstart', unitId: unit.id, msg: '慢启动: 无法行动' }] };
      }
    }
  }
});

/* 懒惰：每回合开始 25% 放弃行动，放弃回合受伤害降低 */
registerTalent({
  id: 'lazy',
  name: '懒惰',
  desc: '每回合开始有25%几率放弃行动，放弃行动回合自身受到伤害降低',
  hooks: {
    onBeforeAction: function (unit) {
      if (battleRnd() < 0.25) {
        unit._lazySkip = true;
        return { skipAction: true, events: [{ type: 'talent', talentId: 'lazy', unitId: unit.id, msg: '懒惰: 放弃行动' }] };
      }
      unit._lazySkip = false;
    },
    onDamage: function (unit, ctx) {
      if (unit._lazySkip) {
        return { mutations: [{ key: 'dmgReduce', value: 0.3 }] };
      }
    }
  }
});

/* 多目标：普通攻击伤害降低，可额外攻击 x 个敌人 */
registerTalent({
  id: 'multitarget',
  name: '多目标',
  desc: '普通攻击造成伤害降低，可额外攻击 x 个敌人',
  config: { extra: 1, penalty: 0.7 },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) {
        return { mutations: [{ key: 'dmgReduce', value: 0.3 }] };
      }
    },
    onBeforeAction: function (unit, ctx) {
      return { mutations: [{ key: 'multiTarget', value: (unit._multiExtra || 1) + 1 }] };
    }
  }
});

/* 嗜血：造成伤害时恢复本次伤害一定比例生命 */
registerTalent({
  id: 'bloodthirst',
  name: '嗜血',
  desc: '自身造成伤害时，恢复本次伤害一定比例的生命值',
  hooks: {
    onAfterDamage: function (unit, ctx) {
      if (ctx.dealt > 0) {
        var heal = Math.floor(ctx.dealt * 0.2);
        unit.hp = Math.min(unit.base.hp, unit.hp + heal);
        return { events: [{ type: 'talent', talentId: 'bloodthirst', unitId: unit.id, msg: '嗜血: 恢复 ' + heal }] };
      }
    }
  }
});

/* 复仇：生命值每降低一定比例，攻击与魂攻击提升 */
registerTalent({
  id: 'vengeance',
  name: '复仇',
  desc: '自身生命值每降低一定比例，攻击力与魂攻击提升',
  hooks: {
    onTurnStart: function (unit) {
      var lost = 1 - (unit.hp / unit.base.hp);
      var stacks = Math.floor(lost / 0.25);
      if (stacks > (unit._vengeStacks || 0)) {
        /* v2.1.15：改为「按快照重算」，而不是「在当前值上再叠一次」。
           原实现在已经提升过的 base 上再乘一次，随层数复利放大
           （1.1 × 1.2 × 1.3 = 1.716 倍，而设计意图是 1 + 0.1×3 = 1.3 倍）；
           顺带留下快照，让「清除迷雾」的能力变化归零能还原它。 */
        if (unit._vengeAtkBase == null) {
          unit._vengeAtkBase = unit.base.atk;
          unit._vengeSoulBase = unit.base.soulAtk || 0;
        }
        unit._vengeStacks = stacks;
        unit.base.atk = Math.floor(unit._vengeAtkBase * (1 + 0.1 * stacks));
        unit.base.soulAtk = Math.floor(unit._vengeSoulBase * (1 + 0.1 * stacks));
        return { events: [{ type: 'talent', talentId: 'vengeance', unitId: unit.id, msg: '复仇: 攻击提升 x' + stacks }] };
      }
    }
  }
});

/* 再生：每 2-3 回合恢复最大生命值一定比例 */
registerTalent({
  id: 'regen',
  name: '再生',
  desc: '每经过2-3回合，恢复自身最大生命值一定比例',
  hooks: {
    onTurnEnd: function (unit, ctx) {
      var turn = ctx.turn || 0;
      if (turn >= 2 && turn % 3 === 0) {
        var heal = Math.floor(unit.base.hp * 0.08);
        unit.hp = Math.min(unit.base.hp, unit.hp + heal);
        return { events: [{ type: 'talent', talentId: 'regen', unitId: unit.id, msg: '再生: 恢复 ' + heal }] };
      }
    }
  }
});

/* ============================================================
   v2.1.25：**词条已从本文件移出**。
   原先 cut_boss / cut_elite / aoe_guard / skill_guard / grow_atk / grow_def /
   doom_call / extra_act 这 8 条被注册进 TALENTS —— 但它们其实是「词条」（Affix）：
   天赋是生物**固有**被动，词条是 Boss/精英**额外附加**的强化维度。
   设计依据 doc/2.0 敌群设计.md:248/251（「额外 Boss 词条」「沿用现有词条系统」「独立维度」）。
   现全部迁到 **page/affix.js** 的 AFFIXES 注册表，钩子实现一字未改（纯结构性拆分，数值不变）。
   ============================================================ */

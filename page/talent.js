/* ============================================
   MyHealth — Enemy Talents (M2b-1)
   16 天赋注册表。数据驱动：每个天赋 = hooks 集（对接 state-core 机制）。
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
  return out;
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
      var baseSpd = unit.base.spd || 0;
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
        if (Math.random() < chance) {
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

/* 威吓：战斗开始时恐吓敌方随机 1 名，攻击力大幅降低，持续到自身血量<50% */
registerTalent({
  id: 'intimidate',
  name: '威吓',
  desc: '战斗开始时，恐吓敌方随机1名，攻击力大幅降低（持续到自身血量<50%）',
  hooks: {
    onBattleStart: function (unit, ctx) {
      var enemies = ctx.enemyUnits || [];
      if (!enemies.length) return;
      var target = enemies[Math.floor(Math.random() * enemies.length)];
      target._intimidated = true;
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id, msg: '威吓: ' + target.name + ' 攻击降低' }] };
    },
    onTurnStart: function (unit, ctx) {
      // 血量<50% 解除威吓
      if (unit.hp < unit.base.hp * 0.5) {
        (ctx.enemyUnits || []).forEach(function (e) { if (e._intimidated) e._intimidated = false; });
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
      if (Math.random() < 0.25) {
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
        unit._vengeStacks = stacks;
        unit.base.atk += Math.floor(unit.base.atk * 0.1 * stacks);
        unit.base.soulAtk = (unit.base.soulAtk || 0) + Math.floor((unit.base.soulAtk || 0) * 0.1 * stacks);
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

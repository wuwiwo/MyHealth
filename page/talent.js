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

/* 读取天赋注册时声明的配置项（`config`）—— 天赋数值的**唯一来源**。
   v2.2.16（§5.4F 死配置清理）：此前 `config: { rounds: 2 }`（慢启动）/ `{ extra: 1, penalty: 0.7 }`
   （多目标）**写了没人读**，hook 里另写一份等价字面量（`unit._slowRounds || 2`、`(_multiExtra||1)+1`、
   `dmgReduce: 0.3`）—— 同一个数值两处写死，改注册值不生效、改 hook 又绕过了配置。
   现在 hook 一律从这里取值：**改 `config` 立即生效**（守卫见 scripts/test-talent-fixation.js）。 */
function talentConfig(id, key, dflt) {
  var t = TALENTS[id];
  if (t && t.config && t.config[key] != null) return t.config[key];
  return dflt;
}

/* 是否「自我削弱」天赋（标记写在天赋定义上的 `weak: true`）。
   v2.2.16（§5.4E）：敌群装配的**两个入口**都要排除它们 ——
     · group-levels.js 的 `TALENTS_LOW` 池（固化进关卡配置时的池子选择）；
     · enemy.js 的 `pickRandomTalents()` 兜底抽取（没传 talents 的调用点）。
   标记写在定义上，避免各处再抄一份 id 清单；`TALENTS_LOW` 与本标记的一致性有守卫断言。 */
function isWeakTalent(id) {
  var t = TALENTS[id];
  return !!(t && t.weak);
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

/* ============================================================
   v2.3.0 WP-D 逐条对齐说明（对照 doc/2.2-修改提案.md §5.1 的逐条评审）

   §5.1 对这 14 条的评审绝大多数写的是「根据关卡与敌人级别，数值为 X~Y」——
   那是**随大关/等级成长**的口径，按施工计划 §1.1 属 **WP-F（敌群天赋接成长）** 的范畴，
   连同 §5.4F 的死配置清理一起留给 WP-F。
   WP-D（施工计划 §6.4）只做「数值直接给、不走 t 成长」的那几条 + 死壳修复：

   本轮**判定无改动**（成长化＝WP-F）：blade / flutter / roughskin / vigor /
   magicshield / slowstart / lazy / multitarget / bloodthirst / regen
   本轮**实际改动**：magicmirror（补 `onBeforeSupport` 派发点）/ plain（作用面边界）/
   intimidate（持续回合 5~10 随机 + 先到者解除）/ vengeance（每层间隔 25%→20%）
   ============================================================ */

/* --- 天赋注册（14 条） --- */

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

/* 魔法镜：受到**敌方指向的辅助类型技能**时，有几率免疫那次效果并反弹给施加者。
   ⚠️ v2.3.0（§5.1.5 / §5.6-3）：本天赋此前是**死壳** —— `onBeforeSupport` 全项目没有派发点、
   `reflectSupport` mutation 无消费者，「免疫」与「反弹」两项从未生效。
   现由 `battle-group.js` 的 `castSkill` 在辅助技能对**每个目标**生效前派发
   （见那里的 `mirrorBlocked` 计算），且**只在「对手指向本单位」的辅助技能**上触发 ——
   队友给的增益/治疗不算（评审：受到**敌人**的指向性辅助类型技能时触发）。
   反弹语义（§5.6-3）：**只反弹负面/减益类辅助**；治疗/增益类**仅免疫、不反弹**
   （否则等于反过来给敌方回血 / 加攻）。反射由 `castSkill` 消费 `reflectSupport` 时执行。 */
registerTalent({
  id: 'magicmirror',
  name: '魔法镜',
  desc: '受到敌方指向性辅助技能时有几率免疫；负面/减益类额外反弹给施加者',
  hooks: {
    onBeforeSupport: function (unit, ctx) {
      if (ctx.targeted && ctx.support) {
        var chance = 0.3;
        if (battleRnd() < chance) {
          return {
            skipAction: true,
            mutations: [{ key: 'reflectSupport', value: ctx.sourceId || null }],
            events: [{ type: 'talent', talentId: 'magicmirror', unitId: unit.id, msg: '🪞 魔法镜: ' + (unit.name || '单位') + ' 免疫并反弹' }]
          };
        }
      }
    }
  }
});

/* 朴实：自身的能力（攻击/防御/魂攻/魂防/速度…）无法被任何增益或减益影响。
   v2.3.0（§5.6-1 + 施工计划 §6.4）作用面边界裁决：
     · 只挡**直接影响属性**的增益/减益 —— 判据 = 状态定义里的 `statMods` / `statModsPct`，
       或本次施加实例自带的 `modsPct`；
     · **不**直接改属性的照常生效：中毒/灼烧这类只扣血的，冰冻/睡眠/末日这类控制与禁技，
       以及「造成伤害提升/降低」这类伤害修正，一律不受影响；
     · 同一效果**既有增减益又有附加效果**时，只挡能力部分、附加部分照常生效
       —— 由状态定义上的 `extraEffect` 标记识别（现仅 `lastworded`：降攻魂攻 + 每回合掉血），
       命中时返回 `stripStatMods`，由 castSkill 以 `noStatMods` 落库（属性部分被剥掉、状态照挂）。 */
registerTalent({
  id: 'plain',
  name: '朴实',
  desc: '自身的能力无法被任何增益/减益影响（不直接改属性的效果照常生效）',
  hooks: {
    onBeforeStatus: function (unit, ctx) {
      ctx = ctx || {};
      var def = (typeof getStatusDef === 'function') ? getStatusDef(ctx.statusId) : null;
      var direct = false;
      if (def) {
        if (def.statMods && Object.keys(def.statMods).length) direct = true;
        if (def.statModsPct && Object.keys(def.statModsPct).length) direct = true;
      }
      if (ctx.modsPct && Object.keys(ctx.modsPct).length) direct = true;
      if (!direct) return;   // 不直接改属性 → 照常生效
      if (def && def.extraEffect) {
        return {
          mutations: [{ key: 'stripStatMods', value: true }],
          events: [{ type: 'talent', talentId: 'plain', unitId: unit.id, msg: '朴实: 免疫能力变化（附加效果照常）' }]
        };
      }
      return { skipAction: true, events: [{ type: 'talent', talentId: 'plain', unitId: unit.id, msg: '朴实: 免疫能力变化' }] };
    }
  }
});

/* 威吓：战斗开始时恐吓敌方随机 1 名，攻击力大幅降低。
   v2.1.14：本天赋唯一可读的削减幅度常量，battle-group.js 直接读取，避免两处各写一个魔法数。
   v2.3.0（§5.1.7 评审 + §5.6-5）：解除条件由「仅施加者 <50% 血」扩为**先到者解除** ——
   ① 施加者血量 <50%，或 ② 持续回合数（**开场随机 5~10 回合**）走完。
   ⚠️ 削减幅度仍是 40%（评审的「10%~50% 随关卡成长」属 WP-F，本轮不接成长）。 */
var INTIMIDATE_ATK_DOWN = 0.4;
var INTIMIDATE_TURN_MIN = 5;    // §5.6-5：持续 5~10 回合**随机**
var INTIMIDATE_TURN_MAX = 10;
registerTalent({
  id: 'intimidate',
  name: '威吓',
  desc: '战斗开始时，恐吓敌方随机1名，攻击力大幅降低（持续 5~10 回合，或施加者血量<50%）',
  hooks: {
    onBattleStart: function (unit, ctx) {
      var enemies = (ctx && ctx.enemyUnits) || [];
      if (!enemies.length) return;
      var target = enemies[Math.floor(battleRnd() * enemies.length)];
      var turns = INTIMIDATE_TURN_MIN + Math.floor(battleRnd() * (INTIMIDATE_TURN_MAX - INTIMIDATE_TURN_MIN + 1));
      unit._intimidateTurns = turns;
      target._intimidated = true;
      target._intimidateBy = unit.name || '威吓者';
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
        targetId: target.id,
        msg: '😱 威吓：' + (unit.name || '单位') + ' → ' + target.name + ' 攻击 -' + Math.round(INTIMIDATE_ATK_DOWN * 100) + '%（持续 5~10 回合随机：本次 ' + turns + ' 回合，或施加者血量 <50%）' }] };
    },
    onTurnStart: function (unit, ctx) {
      var turn = (ctx && ctx.turn) || 0;
      var lowHp = unit.hp < unit.base.hp * 0.5;
      var expired = (unit._intimidateTurns != null) && turn > unit._intimidateTurns;
      if (!lowHp && !expired) return;
      // 解除（v2.1.14：解除时补一条日志，此前静默失效，玩家无从察觉；v2.3.0 补上解除原因）
      var freed = [];
      ((ctx && ctx.enemyUnits) || []).forEach(function (e) {
        if (e._intimidated) { e._intimidated = false; e._intimidateBy = ''; freed.push(e.name); }
      });
      if (!freed.length) return;
      var why = lowHp ? '血量低于 50%' : ('持续 ' + unit._intimidateTurns + ' 回合已到');
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
        msg: '😤 威吓解除：' + (unit.name || '单位') + ' ' + why + '，' + freed.join('、') + ' 攻击恢复' }] };
    }
  }
});

/* 魔法盾：受到魂攻击伤害降低
   ⚠️ v2.2.16（§5.4F 死配置清理的**第 3 项：本批未完成**）：数值的唯一来源在这里（0.3），
   但**消费端不读它** —— `battle-group.js:415` 硬编码 `dmg = Math.floor(dmg * 0.7)`（= 1 − 0.3，当前恰好一致）
   → 改这里的值**不会生效**（典型的「同一数值两处写死」）。
   正确修法是消费端改为 `dmg = Math.floor(dmg * (1 - m.value))`，只改这一行；
   但 `page/battle-group.js` **不在本批可写白名单内** → 按纪律停下上报主控，不在此硬塞。
   防漂移守卫：scripts/test-talent-fixation.js 断言「生产端数值 + 消费端硬编码 = 1」，两处一旦漂移即失败。 */
var MAGICSHIELD_SOUL_REDUCE = 0.3;
registerTalent({
  id: 'magicshield',
  name: '魔法盾',
  desc: '自身受到魂攻击伤害降低',
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isSoul) {
        return { mutations: [{ key: 'soulDmgReduce', value: MAGICSHIELD_SOUL_REDUCE }] };
      }
    }
  }
});

/* 慢启动：战斗开始前 x 回合无法行动
   v2.2.16（§5.4F 死配置清理）：`x` 的**唯一来源** = 本天赋的 `config.rounds`。
   此前 hook 写死 `ctx.turn <= (unit._slowRounds || 2)`，而 `_slowRounds` **全项目无写入点**、
   `config.rounds` 又没人读 —— 同一个 2 两处写死（写死的那处还是死字段）。现两处合一，改 config 即生效。
   ⚠️ **口径如实记录（本批不改行为）**：判据用的是 `ctx.turn`，而 `battle-group.js` 的 `groupUnitTurn`
     里 `ctx.turn = gb.turn + 1`（**实际回合号 + 1**，首回合 = 2）→ `rounds: 2` 实际是
     「第 1 回合不能行动」（实测 rounds=1/2/3/4 → 跳过 0/1/2/3 次）。
     即设计文案的「前 x 回合」与实现的「ctx.turn ≤ x」差 1。
     本批只做**单源化**，不动这个既有口径（改它会直接改变慢启动持有者的难度，需另行裁决）。 */
registerTalent({
  id: 'slowstart',
  name: '慢启动',
  desc: '战斗开始的前 x 回合，自身无法行动',
  config: { rounds: 2 },
  weak: true,   // §5.4E：自我削弱天赋 —— Boss / 精英不抽（group-levels.js 池子 + enemy.js 兜底抽取）
  hooks: {
    onBeforeAction: function (unit, ctx) {
      if (ctx.turn <= talentConfig('slowstart', 'rounds', 2)) {
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
  weak: true,   // §5.4E：自我削弱天赋 —— Boss / 精英不抽（同 slowstart）
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

/* 多目标：普通攻击伤害降低，可额外攻击 x 个敌人
   v2.2.16（§5.4F 死配置清理）：伤害惩罚与额外目标数的**唯一来源** = 本天赋的 `config`。
   此前 `config: { extra: 1, penalty: 0.7 }` **两项都没人读**，hook 里另写死 `dmgReduce: 0.3`
   与 `(_multiExtra || 1) + 1`（`_multiExtra` 全项目无写入点）—— 值恰好等价，但改配置不生效。 */
registerTalent({
  id: 'multitarget',
  name: '多目标',
  desc: '普通攻击造成伤害降低，可额外攻击 x 个敌人',
  config: { extra: 1, penalty: 0.7 },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) {
        /* 普攻伤害 = 原值 × config.penalty；消费端（battle-group.js）读到的 dmgReduce 语义是「乘 (1 − v)」 */
        return { mutations: [{ key: 'dmgReduce', value: 1 - talentConfig('multitarget', 'penalty', 0.7) }] };
      }
    },
    onBeforeAction: function (unit, ctx) {
      /* ⚠️ 消费端 `battle-group.js` 取 `targets.slice(0, value)` → 值必须是**总目标数**：
         = 额外目标数（config.extra）+ 1（原目标）。config.extra 即「额外攻击 x 个敌人」的 x。 */
      return { mutations: [{ key: 'multiTarget', value: talentConfig('multitarget', 'extra', 1) + 1 }] };
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

/* 复仇：生命值每降低一定比例，攻击与魂攻击提升
   v2.3.0（§5.1.13 评审 + §5.6-6）：**每层间隔由 25% 生命改为 20%**；每层 +10% 维持现状。 */
registerTalent({
  id: 'vengeance',
  name: '复仇',
  desc: '自身生命值每降低 20%，攻击力与魂攻击提升（每层 +10%）',
  hooks: {
    onTurnStart: function (unit) {
      var lost = 1 - (unit.hp / unit.base.hp);
      /* v2.3.0：间隔 20%（评审「每损失 20% 生命」）。+1e-9 抵消浮点误差
         （hp = 0.8×base.hp 时 lost 会算出 0.19999999999999996，直接 floor 会少一层）。 */
      var stacks = Math.floor(lost / 0.20 + 1e-9);
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

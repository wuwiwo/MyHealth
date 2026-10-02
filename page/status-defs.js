/* ============================================
   MyHealth — Status Definitions (M2b-3)
   敌群设计的负面/特殊状态注册。内容层，依赖 state-core.js 框架。
   等级：grade 1=普通 2=高级 3=特级
   纯逻辑，无 DOM/store。
   ============================================ */

/* 中毒：每回合结束受最大生命值一定比例伤害（对 Boss 减半） */
defineStatus({
  id: 'poison',
  name: '中毒',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onTurnEnd: function (unit, st) {
      var pct = 0.04;
      var dmg = Math.floor(unit.base.hp * pct);
      if (unit.tags && unit.tags.indexOf('boss') > -1) dmg = Math.floor(dmg / 2);  // 中毒对 boss 减半
      unit.hp = Math.max(0, unit.hp - dmg);
      return { events: [{ type: 'dot', statusId: 'poison', unitId: unit.id, amount: dmg, msg: '☠️ 中毒: -' + dmg }] };
    }
  }
});

/* 冰冻：无法行动（skipAction） */
defineStatus({
  id: 'freeze',
  name: '冰冻',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onBeforeAction: function (unit) {
      return { skipAction: true, events: [{ type: 'skip', statusId: 'freeze', unitId: unit.id, msg: '❄️ 冰冻: 无法行动' }] };
    },
    onDamage: function (unit, st, ctx) {
      /* v2.4.7：本钩子只对「本单位作为**受击方**」生效。
         攻击方通道（battle-group.js 的普攻，为末日 dmgDealtHalf 而加的**状态**派发）也会走
         onDamage —— 不设守卫的话，出手者会把自己的冰冻「被自己打解冻」。 */
      if (ctx && ctx.isPlayerAttack) return;
      // 冰冻被攻击有几率解除（简单处理：受击即解冻）
      clearStatus(unit, 'freeze');
      return { events: [{ type: 'wake', statusId: 'freeze', unitId: unit.id, msg: '受击解冻' }] };
    }
  }
});

/* 畏缩：跳过 1 回合行动（击掌奇袭，每场最多 1 次由技能层控制） */
defineStatus({
  id: 'flinch',
  name: '畏缩',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onBeforeAction: function (unit) {
      return { skipAction: true, events: [{ type: 'skip', statusId: 'flinch', unitId: unit.id, msg: '😵 畏缩: 无法行动' }] };
    }
  }
});

/* 潮湿：魂防御降低 25%，并提高对其命中率（配合雨天/打湿）
   v2.1.15：原为固定 -10 魂防（设计文档写的是「降低 0%~25%」）。
   在动辄几百上千的魂防面前，固定 -10 等于没写 → 改为按 base 比例 -25%；
   「提高对其命中率 +30%」在 battle-group.js 的 groupHitChance 里落地。 */
defineStatus({
  id: 'wet',
  name: '潮湿',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  statModsPct: { soulDef: -0.25 },
  hooks: {
    onTurnEnd: function () {
      return { events: [{ type: 'passive', statusId: 'wet', msg: '💧 潮湿持续' }] };
    }
  }
});

/* 哈欠：下回合开始 55% 几率进入睡眠 1 回合
   v2.4.5（作者裁定 §10-2）：**诅咒类** —— 本状态的 `onTurnStart` 归「准备阶段」结算
   （每回合一次、在行动队列建立之前统一派发），不再挂在该单位自己的行动开始。
   `phase:'prepare'` 是引擎侧 battle-group.js 的**逐条分类标记**（为什么不能整体搬，见那里的注释）；
   判定阶段的 duration 递减对「尚未在准备阶段触发过」的这类状态会跳过一回合 ——
   否则 duration:1 的哈欠会在「下回合准备阶段触发」之前就被判定阶段删掉，效果直接消失。 */
defineStatus({
  id: 'sleepy',
  name: '哈欠',
  grade: 1,
  phase: 'prepare',
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onTurnStart: function (unit, st) {
      if (battleRnd() < 0.55) {
        applyStatus(unit, { id: 'sleep', duration: 1 });
        return { events: [{ type: 'status', statusId: 'sleepy', unitId: unit.id, msg: '💤 哈欠: 入睡' }] };
      }
      return { events: [{ type: 'passive', statusId: 'sleepy', unitId: unit.id, msg: '哈欠未生效' }] };
    }
  }
});

/* 蓄力：蓄力重击状态，承伤增加，下回合结算高额伤害（技能层结算） */
defineStatus({
  id: 'charging',
  name: '蓄力',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onDamage: function (unit) {
      return { mutations: [{ key: 'dmgTakenBoost', value: 0.25 }] };   // 承伤 +25%
    },
    onExpire: function (unit, st) {
      unit._chargeReady = true;   // 蓄力完成，下回合技能层结算
      /* WP-C：通用蓄力的**载荷**（p_shine / p_thundercharge / p_dreamball）。
         带 `charge: true` 的技能在施放时把自身 skillId 写进蓄力实例，
         到期后交给 battle-group 的 groupUnitTurn 释放**技能本身**（而不是写死的 400% 重击）。
         敌群「蓄力重击」（chargeup）不带载荷 → 保持旧的 resolveChargeStrike 路径不变。 */
      if (st && st.data && st.data.skillId) unit._chargePayload = st.data.skillId;
      return { events: [{ type: 'expire', statusId: 'charging', unitId: unit.id, msg: '蓄力完成!' }] };
    }
  }
});

/* 幽魂附身：技能不可用 + 冷却暂停；回合开始受最大生命值比例伤害（无视防御）
   ⚠️ v2.1.33：**解除时点由「下回合开始」改为「本回合结束（duration 到期）」**。
   原实现在 onTurnStart 里 damage + `_possessed=false` + clearStatus，
   而 `_possessed` 是 onBeforeAction 才置位的 —— **解除永远早于置位**，
   于是「技能不可用」与「冷却暂停」两项从未生效（实测：被附身的单位照样放技能、冷照减）。
   现在状态贯穿该单位的行动窗口（恰好 1 个回合），回合末由 onExpire 复位标志。 */
defineStatus({
  id: 'possessed',
  name: '幽魂附身',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onBeforeAction: function (unit) {
      return { events: [{ type: 'passive', statusId: 'possessed', unitId: unit.id, msg: '👻 被幽魂附身：技能不可用、冷却暂停' }] };
    },
    onTurnStart: function (unit, st) {
      // 回合开始：受最大生命值比例伤害（无视防御）。状态本身留到本回合末自然到期。
      var dmg = Math.floor(unit.base.hp * 0.08);
      unit.hp = Math.max(0, unit.hp - dmg);
      return { events: [{ type: 'dot', statusId: 'possessed', unitId: unit.id, amount: dmg, msg: '👻 附身侵蚀: -' + dmg }] };
    }
  }
});

/* 末日：无法治疗·技能禁用·普攻减半·每回合开始受魂攻比例伤害（无视防御减伤）
   v2.4.5（作者裁定 §10-2 / §10-5）：**诅咒类** —— `onTurnStart`（每回合开始的那次伤害）
   归「准备阶段」统一结算；`onBeforeAction`（技能禁用）与 `onHeal`（治疗阻断）**不受影响**，
   仍留在行动阶段（分类只作用于 onTurnStart，见 battle-group.js 的 dispatchStatusesPhase）。
   ⚠️ 由此「本回合发动 → 下回合准备阶段才生效」，实测扣血次数见报告（与作者预判 3 次的差异同处说明）。
   v2.4.7（§8.5-13）：四项效果**全部落地** —— 其中「普攻减半」（`onDamage` → `dmgDealtHalf`）
   此前因消费点只在受击方通道而从未生效，现由普攻的**攻击方**状态派发消费（见下）。 */
defineStatus({
  id: 'doomed',
  name: '末日',
  grade: 3,
  phase: 'prepare',
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onTurnStart: function (unit, st) {
      var soulAtk = (st.source && st.source.base && st.source.base.soulAtk) || 0;
      var dmg = Math.floor(soulAtk * 0.5);
      unit.hp = Math.max(0, unit.hp - dmg);
      return { events: [{ type: 'dot', statusId: 'doomed', unitId: unit.id, amount: dmg, msg: '🌑 末日: -' + dmg }] };
    },
    onBeforeAction: function () {
      return { mutations: [{ key: 'skillsDisabled', value: true }] };   // 技能禁用
    },
    onDamage: function (unit) {
      /* 普攻减半。v2.4.7（§8.5-13）：消费点在 battle-group.js `normalAttack` 的**攻击方**状态派发
         （只取 `dmgDealtHalf`）—— 此前状态钩子只在受击方通道派发，这条 mutation 没有生产路径。 */
      return { mutations: [{ key: 'dmgDealtHalf', value: true }] };
    },
    onHeal: function () {
      return { skipAction: true, events: [{ type: 'block', statusId: 'doomed', msg: '🌑 末日: 无法治疗' }] };
    }
  }
});

/* 破甲：防御降低，最多 6 层
   v2.1.15：原为每层固定 -5 防御，设计文档写的是「降低防御 10%，最大叠加 6 层」
   → 改为每层 -10%（满 6 层 -60%）；并且 statMods() 现在会真的按层数乘算。 */
defineStatus({
  id: 'armorbroken',
  name: '破甲',
  grade: 1,
  maxStacks: 6,
  stacking: 'stack',
  statModsPct: { def: -0.10 },   // 每层 -10% 防御
  hooks: {
    onTurnStart: function () {
      return { events: [{ type: 'passive', statusId: 'armorbroken', msg: '破甲持续' }] };
    }
  }
});

/* 魂防降低（星辰坠落）—— v2.1.15：固定值改按 base 比例（-15%） */
defineStatus({
  id: 'souldown',
  name: '魂防降低',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  statModsPct: { soulDef: -0.15 },
  hooks: {}
});

/* 减速（地刺） */
defineStatus({
  id: 'slow',
  name: '减速',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  statMods: { spd: -3 },
  hooks: {}
});

/* ============ v2.2 WP-B 新增：弱化（陨石轰炸）/ 警戒（瞩目） ============ */

/* 弱化：攻击与魂攻 −15%（v2.2 裁决：陨石轰炸命中者接下来 2 回合攻/魂攻 −15%） */
defineStatus({
  id: 'weaken',
  name: '弱化',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  statModsPct: { atk: -0.15, soulAtk: -0.15 },
  hooks: {}
});

/* 警戒：受到伤害 −15%（v2.2 裁决：瞩目「嘲讽期间受到伤害 −15%」） */
defineStatus({
  id: 'vigil',
  name: '警戒',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onDamage: function (unit) {
      return { mutations: [{ key: 'dmgTakenReduce', value: 0.15 }] };
    }
  }
});

/* 疾风（启风 效果①）：速度 +n%，**值由实例 modsPct 传入**（与 souldown 同一种「动态数值」写法）。
   正面、可被驱散的状态 —— 按 §1.3 裁决「持续至战斗结束，或直到被驱散」，不直接改 base。 */
defineStatus({
  id: 'haste',
  name: '疾风',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {}
});

/* 遗言诅咒：攻击·魂攻大幅降低 + 每回合最大生命值伤害
   v2.1.15：固定 -15 改为按 base 比例 -25%（设计文档只说「大幅降低」，未给数值）
   v2.1.33：每回合伤害补上「**受到自身魂防御降低**」（设计文档原文）——
   此前是固定 5% 最大生命、完全不减。文档未给系数，按引擎既有的「减免 = 防御/2」口径取魂防半数。 */
defineStatus({
  id: 'lastworded',
  name: '遗言诅咒',
  grade: 3,
  phase: 'prepare',   // v2.4.5（§10-2 诅咒类）：每回合开始的那次伤害归**准备阶段**结算
  maxStacks: 1,
  stacking: 'refresh',
  /* v2.3.0（朴实作用面，§5.6-1）：本状态**既有能力增减（降攻/降魂攻）又有附加效果（每回合掉血）**，
     `extraEffect` 让「朴实」只剥掉其属性修正、保留掉血 —— 对应裁决「只生效附加效果」。 */
  extraEffect: true,
  statModsPct: { atk: -0.25, soulAtk: -0.25 },
  hooks: {
    onTurnStart: function (unit) {
      var sdef = (unit.base && unit.base.soulDef) || 0;
      var dmg = Math.max(1, Math.floor(unit.base.hp * 0.05) - Math.floor(sdef / 2));
      unit.hp = Math.max(0, unit.hp - dmg);
      return { events: [{ type: 'dot', statusId: 'lastworded', unitId: unit.id, amount: dmg, msg: '💀 遗言: -' + dmg }] };
    }
  }
});

/* ============ v2.1.15 新增：增益类状态 ============
   这三个原先都是「写了个字段没人读」的死标记（_momBoost / _fortify / _dmgReduce），
   现在统一走状态系统 —— 有 duration、能驱散、能进详情页、能随层数叠加。 */

/* 攻击提升（强攻 / 气势如虹 共用）：幅度由实例的 modsPct 决定，故这里不写固定值 */
defineStatus({
  id: 'atkup',
  name: '攻击提升',
  grade: 1,
  positive: true,
  maxStacks: 1,
  stacking: 'independent',
  hooks: {}
});

/* 坚壁：防御·魂防 +10%/层，最多 5 层（持续到战斗结束 = duration 极大） */
defineStatus({
  id: 'guardup',
  name: '坚壁',
  grade: 1,
  positive: true,
  maxStacks: 5,
  stacking: 'stack',
  statModsPct: { def: 0.10, soulDef: 0.10 },
  hooks: {}
});

/* 广域防御：受到的伤害降低 —— 幅度由技能实例携带，定义值仅作**兜底**
   v2.3.0 WP-E（死字段清理）：改前这里把减伤**硬编码 0.20**，而 skill.js 的 bulwark（广域防御）
   按成长推送 0.20~0.40 的 `b.value` —— 该值在 battle-group 的 buff 落地处被整个丢弃（死字段），
   结果减伤恒为 20%、且镜像结界没有可缩放的数值载体。现在：
     · 单源 = `SKILLS.bulwark.range.dmgReduce`（低值 0.20，与旧兜底一致），经实例 `data.reduce` 携带；
       ⚠️ v2.3.0（作者裁决）：该区间上限已由 0.40 收窄为 **0.30**，故实例携带的减伤上限 = 0.30
       （g10+ 精英/Boss 群体减伤 30%）。**本文件的兜底 0.20 不变** —— 无 `data` 的实例行为一字不动。
     · 无 `data` 的实例（直接 `applyStatus({id:'wideguard'})`、旧存档/快照）仍按 0.20 兜底 →
       旧行为与实例形状不变（test-status-lifecycle 的「103 → 82」不变）。 */
defineStatus({
  id: 'wideguard',
  name: '广域防御',
  grade: 1,
  positive: true,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onDamage: function (unit, st) {
      var reduce = (st && st.data && typeof st.data.reduce === 'number') ? st.data.reduce : 0.20;
      return {
        mutations: [{ key: 'dmgTakenReduce', value: reduce }],
        events: [{ type: 'passive', statusId: 'wideguard', unitId: unit.id, msg: '🛡️ 广域防御：伤害 -' + Math.round(reduce * 100) + '%' }]
      };
    }
  }
});

/* ============ v2.1.21 新增：迷惑（幻影之瞳） ============
   设计依据 doc/design-v2.0.md:229 —— 「迷惑 1 敌 1 回合，使其随机执行其一：
   ①丧失防备 / ②不分敌我攻击其他敌人 / ③牺牲自我」。
   结算放在 battle-group.js 的 resolveConfusion()：它是「替代行动」而不是 skipAction ——
   被迷惑的单位仍要动手，只是打错人 / 打自己 / 放弃防备。
   v2.4.5（作者裁定 §10-2）：幻影之瞳属**诅咒类** —— 三选一改在**下回合的准备阶段**统一触发
   （不再在目标自己的行动开始时），行动阶段只保留「本次行动已被迷惑占用」这一步。 */

defineStatus({
  id: 'confused',
  name: '迷惑',
  grade: 2,
  phase: 'prepare',   // v2.4.5（§10-2 诅咒类）：三选一改在**下回合准备阶段**触发（幻影之瞳）
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {}
});

/* 丧失防备（迷惑分支①）：防御与魂防降低。
   ⚠ duration 必须写 2：本状态是在目标**自己的回合内**被施加的，
   若 duration=1 会在同一回合末的 ageStatuses 立刻过期，一点效果都留不下。
   ⚠ v2.1.22：这里**不再写死 statModsPct** —— 幅度随技能等级变化（设计 15%~75%），
   由 battle-group.js 的 resolveConfusion() 用**实例 modsPct** 传进来；
   两处都写会叠加成「固定 + 等级」两份。 */
defineStatus({
  id: 'confused_down',
  name: '丧失防备',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {}
});

/* ============ WP-C 新增：§2.14 战意灌注（吸血 / 技能吸血）与 §2.8 双撞（窃取）============ */

/* 战意（战意灌注 p_warmight）：持续期间获得**吸血**与**技能吸血**。
   裁决依据 doc/plans/v2.2-施工计划.md §6.3：
     · 做成「**挂在持有者身上的增益**」—— 落在状态实例上，而不是攻击方天赋；
     · 与宠物天赋「嗜血」**叠加**（各自结算、相加）：嗜血走 talent 的 onAfterDamage，
       本状态走**状态** onAfterDamage（battle-group 的普攻路径两条都派发）；
     · 镜像结界 ±25% 可缩放它 —— 幅度在 castSkill 落 buff 时按阵营缩放后写入实例 data。
   两条吸血通道分开：
     · 吸血（data.ls）—— 普攻造成的伤害（与「嗜血」同一时点）；
     · 技能吸血（data.sls）—— 技能造成的伤害（battle-group 的 castSkill 伤害结算后读取）。 */
defineStatus({
  id: 'warmight',
  name: '战意',
  grade: 1,
  positive: true,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onAfterDamage: function (unit, st, ctx) {
      if (!ctx || !(ctx.dealt > 0)) return;
      var rate = (st && st.data && typeof st.data.ls === 'number') ? st.data.ls : 0;
      if (rate <= 0) return;
      var heal = Math.max(1, Math.floor(ctx.dealt * rate));
      unit.hp = Math.min(unit.base.hp, unit.hp + heal);
      return { events: [{ type: 'heal', statusId: 'warmight', unitId: unit.id, msg: '🩸 战意吸血: +' + heal }] };
    }
  }
});

/* 能力被窃（双撞 p_doublehit 的命中者）：攻击 / 防御降低。
   幅度由**实例 modsPct** 携带（0~10% 攻击 / 0~20% 防御，随基础属性成长），定义里不写死固定值
   —— 与「打湿 / 疾风」同一种「动态数值」写法（同键实例值覆盖定义值，不会叠成两份）。 */
defineStatus({
  id: 'pulled',
  name: '能力被窃',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {}
});

/* 窃取之力（双撞：把窃得的攻击 / 防御转给我方随机 1 名角色 2 回合）：正面，幅度同样由实例 modsPct 携带。 */
defineStatus({
  id: 'stolen',
  name: '窃取之力',
  grade: 1,
  positive: true,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {}
});

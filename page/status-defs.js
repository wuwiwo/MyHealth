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
    onDamage: function (unit, st) {
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

/* 潮湿：魂防御降低 0-25%，提高对其命中率（配合雨天/打湿） */
defineStatus({
  id: 'wet',
  name: '潮湿',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  statMods: { soulDef: -10 },   // 魂防降低（基准 -10，可按等级浮动）
  hooks: {
    onTurnEnd: function () {
      return { events: [{ type: 'passive', statusId: 'wet', msg: '💧 潮湿持续' }] };
    }
  }
});

/* 哈欠：下回合开始 55% 几率进入睡眠 1 回合 */
defineStatus({
  id: 'sleepy',
  name: '哈欠',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onTurnStart: function (unit, st) {
      if (Math.random() < 0.55) {
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
    onExpire: function (unit) {
      unit._chargeReady = true;   // 蓄力完成，下回合技能层结算 400%
      return { events: [{ type: 'expire', statusId: 'charging', unitId: unit.id, msg: '蓄力完成!' }] };
    }
  }
});

/* 幽魂附身：技能不可用 + 冷却暂停；下回合开始时解除并受最大生命值比例伤害（无视防御） */
defineStatus({
  id: 'possessed',
  name: '幽魂附身',
  grade: 2,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onBeforeAction: function (unit) {
      unit._possessed = true;   // skill.js 的 usableSkills 读这个标记
      return { events: [{ type: 'passive', statusId: 'possessed', unitId: unit.id, msg: '👻 被幽魂附身' }] };
    },
    onTurnStart: function (unit, st) {
      // 附身解除 + 受最大生命值比例伤害（无视防御）
      var dmg = Math.floor(unit.base.hp * 0.08);
      unit.hp = Math.max(0, unit.hp - dmg);
      unit._possessed = false;
      clearStatus(unit, 'possessed');
      return { events: [{ type: 'dot', statusId: 'possessed', unitId: unit.id, amount: dmg, msg: '👻 附身解除: -' + dmg }] };
    }
  }
});

/* 末日：无法治疗·技能禁用·普攻减半·每回合开始受魂攻比例伤害（无视防御减伤） */
defineStatus({
  id: 'doomed',
  name: '末日',
  grade: 3,
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
      return { mutations: [{ key: 'dmgDealtHalf', value: true }] };     // 普攻减半
    },
    onHeal: function () {
      return { skipAction: true, events: [{ type: 'block', statusId: 'doomed', msg: '🌑 末日: 无法治疗' }] };
    }
  }
});

/* 破甲：防御降低，最多 6 层 */
defineStatus({
  id: 'armorbroken',
  name: '破甲',
  grade: 1,
  maxStacks: 6,
  stacking: 'stack',
  statMods: { def: -5 },   // 每层 -5 防御（由 stacking 层数决定实际，此处基准）
  hooks: {
    onTurnStart: function () {
      return { events: [{ type: 'passive', statusId: 'armorbroken', msg: '破甲持续' }] };
    }
  }
});

/* 魂防降低（星辰坠落） */
defineStatus({
  id: 'souldown',
  name: '魂防降低',
  grade: 1,
  maxStacks: 1,
  stacking: 'refresh',
  statMods: { soulDef: -8 },
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

/* 遗言诅咒：攻击·魂攻大幅降低 + 每回合最大生命值伤害 */
defineStatus({
  id: 'lastworded',
  name: '遗言诅咒',
  grade: 3,
  maxStacks: 1,
  stacking: 'refresh',
  statMods: { atk: -15, soulAtk: -15 },
  hooks: {
    onTurnStart: function (unit) {
      var dmg = Math.floor(unit.base.hp * 0.05);
      unit.hp = Math.max(0, unit.hp - dmg);
      return { events: [{ type: 'dot', statusId: 'lastworded', unitId: unit.id, amount: dmg, msg: '💀 遗言: -' + dmg }] };
    }
  }
});

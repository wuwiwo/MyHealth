/* ============================================
   MyHealth — Player Skill Battle Hooks (M1-2)
   玩家技能效果接入群战引擎。
   玩家 Unit 携带 _playerSkills: {skillId: level}
   在群战各时机点调用：开战(金身)/普攻(暴击)/受击(格挡)/回合(气势/气力)
   主动技能（陨石/冰魄/巨石）作为玩家可选行动施放。
   依赖 skills.js / battle-group.js
   ============================================ */

/* 给玩家 Unit 挂上技能（装备列表 + 等级） */
function attachPlayerSkills(unit, skillState) {
  var loadout = (skillState && skillState.loadout) || [];
  var levels = (skillState && skillState.levels) || {};
  unit._playerSkills = {};
  loadout.forEach(function (sid) {
    if (sid) unit._playerSkills[sid] = levels[sid] || 0;
  });
  return unit;
}

/* 开战钩子：金身护盾（全队盾 + 免疫负面） */
function playerSkillBattleStart(gb, player) {
  var events = [];
  if (!player || !player._playerSkills) return events;
  var shieldLv = player._playerSkills['goldshield'] || 0;
  if (shieldLv >= 1) {
    var eff = getPlayerSkill('goldshield').effect(shieldLv);
    gb.allies.forEach(function (a) {
      var shield = Math.floor((a.base.atk + (a.base.soulAtk || 0)) * eff.shieldPct);
      a._shield = (a._shield || 0) + shield;
      /* v2.1.15：盾与免疫都真正生效了 ——
         _shield 由 absorbShield() 在伤害结算前吸收，吸收到 0 时自动撤掉 _shieldImmune。
         此前这两个字段只置位、全项目无消费方（盾不挡伤害、也不免负面）。 */
      a._shieldImmune = a._shield > 0;   // 护盾存在期间免疫普通+高级负面
      events.push({ msg: '🛡️ ' + a.name + ' 金身护盾 +' + shield + '（吸收伤害；盾存在期间免疫普通~高级负面）' });
    });
  }
  return events;
}

/* 普攻钩子：暴击（取高） */
function playerCritHook(player, dmg) {
  if (!player || !player._playerSkills) return dmg;
  var lv = player._playerSkills['crit'] || 0;
  if (lv < 1) return dmg;
  var eff = getPlayerSkill('crit').effect(lv);
  if (battleRnd() < eff.chance) {
    return Math.floor(dmg * eff.critMult);
  }
  return dmg;
}

/* 受击钩子：格挡（pity 机制） */
function playerBlockHook(player, dmg) {
  if (!player || !player._playerSkills) return dmg;
  var lv = player._playerSkills['block'] || 0;
  if (lv < 1) return dmg;
  var eff = getPlayerSkill('block').effect(lv);
  var chance = eff.chance * (player._blockPity || 1);
  if (battleRnd() < chance) {
    player._blockPity = 1;
    return Math.floor(dmg * (1 - eff.reduce));
  }
  player._blockPity = (player._blockPity || 1) * 1.2;
  return dmg;
}

/* 回合开始钩子：气势如虹（全队攻击+，触发锁3回合）/ 气力恢复（每4回合后2回合回血） */
function playerSkillTurnStart(gb, player, turn) {
  var events = [];
  if (!player || !player._playerSkills) return events;

  // 气势如虹
  var momLv = player._playerSkills['momentum'] || 0;
  if (momLv >= 1 && !player._momLock) {
    var meff = getPlayerSkill('momentum').effect(momLv);
    if (battleRnd() < meff.chance) {
      /* v2.1.15：改为按单位挂 atkup 状态。
         此前累加 a._momBoost，而全项目没有任何地方读它 → 「全队攻击 +n×3%」是空头承诺。
         duration 用设计文档的 2 回合，幅度 = 等级 × 3%（写进实例自带的 modsPct）。 */
      gb.allies.forEach(function (a) {
        applyStatus(a, { id: 'atkup', duration: meff.dur || 2, modsPct: { atk: meff.atkBoost } });
        if (typeof syncStatusDerived === 'function') syncStatusDerived(a);
      });
      player._momLock = meff.lock;   // 锁 N 回合
      events.push({ msg: '🔥 ' + player.name + ' 气势如虹：全队攻击 +' + Math.round(meff.atkBoost * 100) + '%（' + (meff.dur || 2) + ' 回合，触发锁 ' + meff.lock + ' 回合）' });
    }
  }
  if (player._momLock > 0) player._momLock--;

  // 气力恢复：t≥5 且 (t-5)%4∈{0,1}
  var vitLv = player._playerSkills['vitality'] || 0;
  if (vitLv >= 1 && turn >= 5 && ((turn - 5) % 4 === 0 || (turn - 5) % 4 === 1)) {
    var veff = getPlayerSkill('vitality').effect(vitLv);
    var heal = Math.floor(player.base.def * veff.healPct);
    player.hp = Math.min(player.base.hp, player.hp + heal);
    events.push({ msg: '💚 ' + player.name + ' 气力恢复 +' + heal });
  }

  // 瞩目：n×3% 几率进入嘲讽 1 回合（pity 乘算 + 触发锁2回合）
  var spotLv = player._playerSkills['spotlight'] || 0;
  if (spotLv >= 1 && !player._spotLock) {
    var seff = getPlayerSkill('spotlight').effect(spotLv);
    var spotChance = seff.chance * (player._spotPity || 1);
    if (battleRnd() < spotChance) {
      player._taunting = true;
      player._tauntMark = turn;   // v2.1.14：battle-group 用它在下一次行动开始时清除嘲讽
      player._spotPity = 1;
      player._spotLock = 2;
      player._spotTauntTurn = turn;
      player._spotHits = 0;   // 本回合受击计数
      events.push({ msg: '🎯 ' + player.name + ' 瞩目：吸引敌方全体攻击 1 回合' });
    } else {
      player._spotPity = (player._spotPity || 1) * 1.2;
    }
  }
  if (player._spotLock > 0) player._spotLock--;
  return events;
}

/* 瞩目回合结束：全体回复 (防+魂防)×受击次数 */
function playerSkillTurnEnd(gb, player, turn) {
  var events = [];
  if (!player || !player._playerSkills) return events;
  var spotLv = player._playerSkills['spotlight'] || 0;
  if (spotLv >= 1 && player._spotTauntTurn === turn && player._spotHits > 0) {
    var healPer = player.base.def + (player.base.soulDef || 0);
    var total = healPer * player._spotHits;
    // v2.1.14：原先在 forEach 里逐人 push，3 个队友就是 3 行完全相同的日志。
    // 回复照旧对全队生效，但只落一条汇总日志。
    gb.allies.forEach(function (a) {
      a.hp = Math.min(a.base.hp, a.hp + total);
    });
    events.push({ msg: '💖 瞩目结算：全体回复 ' + total + '（（防+魂防）' + healPer + ' × 受击 ' + player._spotHits + ' 次）' });
    player._spotHits = 0;
    player._spotTauntTurn = null;
  }
  return events;
}

/* 攻击技能施放（陨石/冰魄/巨石）：返回 {skillName, events} */
function playerAttackSkill(gb, player, skillId) {
  var lv = (player._playerSkills || {})[skillId] || 0;
  if (lv < 1) return null;
  var eff = getPlayerSkill(skillId).effect(lv);
  var events = [];
  var enemies = gb.enemies.filter(function (e) { return e.hp > 0; });
  if (!enemies.length) return { name: getPlayerSkill(skillId).name, events: events };

  if (skillId === 'meteor') {
    // 陨石：随机3敌各1次（敌人少则只命中1次）
    var hits = Math.min(eff.targets || 3, enemies.length);
    for (var i = 0; i < hits; i++) {
      var t = enemies[Math.floor(battleRnd() * enemies.length)];
      var dmg = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
      t.hp = Math.max(0, t.hp - dmg);
      events.push({ msg: '☄️ ' + player.name + ' 陨石轰炸 → ' + t.name + ' ' + dmg + ' 魂伤害' });
    }
    return { name: '陨石轰炸', events: events, cd: eff.cd };
  }
  if (skillId === 'icebeam') {
    // 冰魄：单敌冰冻 + 两段无视魂防伤害
    var target = enemies[0];
    var dmg = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    target.hp = Math.max(0, target.hp - dmg);
    applyStatus(target, { id: 'freeze', duration: 1 });
    events.push({ msg: '❄️ ' + player.name + ' 冰魄光束 → ' + target.name + ' ' + dmg + ' 魂伤害（冰冻 1 回合）' });
    return { name: '冰魄光束', events: events, cd: eff.cd };
  }
  if (skillId === 'boulder') {
    // 巨石：单敌魂攻伤害 + 降魂防
    var t2 = enemies[0];
    var dmg2 = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    t2.hp = Math.max(0, t2.hp - dmg2);
    applyStatus(t2, { id: 'souldown', duration: 3 });
    events.push({ msg: '🪨 ' + player.name + ' 巨石重压 → ' + t2.name + ' ' + dmg2 + ' 魂伤害（魂防 -' + Math.round((eff.soulDefDown || 0) * 100) + '%）' });
    return { name: '巨石重压', events: events, cd: eff.cd };
  }
  return null;
}

/* 辅助技能（气力恢复/气势如虹已有回合钩子，此处占位） */
function playerSupportSkill(gb, player, skillId) {
  return null;
}

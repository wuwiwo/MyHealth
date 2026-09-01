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
      a._shieldImmune = true;   // 护盾期免疫普通+高级负面
      events.push({ msg: '🛡️ ' + a.name + ' 金身护盾 +' + shield });
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
  if (Math.random() < eff.chance) {
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
  if (Math.random() < chance) {
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
    if (Math.random() < meff.chance) {
      gb.allies.forEach(function (a) {
        a._momBoost = (a._momBoost || 0) + meff.atkBoost;
      });
      player._momLock = meff.lock;   // 锁 N 回合
      events.push({ msg: '🔥 气势如虹: 全队攻击+' + Math.round(meff.atkBoost*100) + '%' });
    }
  }
  if (player._momLock > 0) player._momLock--;

  // 气力恢复：t≥5 且 (t-5)%4∈{0,1}
  var vitLv = player._playerSkills['vitality'] || 0;
  if (vitLv >= 1 && turn >= 5 && ((turn - 5) % 4 === 0 || (turn - 5) % 4 === 1)) {
    var veff = getPlayerSkill('vitality').effect(vitLv);
    var heal = Math.floor(player.base.def * veff.healPct);
    player.hp = Math.min(player.base.hp, player.hp + heal);
    events.push({ msg: '💚 气力恢复 +' + heal });
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
      var t = enemies[Math.floor(Math.random() * enemies.length)];
      var dmg = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
      t.hp = Math.max(0, t.hp - dmg);
      events.push({ msg: '☄️ 陨石轰炸 → ' + t.name + ' ' + dmg });
    }
    return { name: '陨石轰炸', events: events, cd: eff.cd };
  }
  if (skillId === 'icebeam') {
    // 冰魄：单敌冰冻 + 两段无视魂防伤害
    var target = enemies[0];
    var dmg = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    target.hp = Math.max(0, target.hp - dmg);
    applyStatus(target, { id: 'freeze', duration: 1 });
    events.push({ msg: '❄️ 冰魄光束 → ' + target.name + ' ' + dmg + '（冰冻）' });
    return { name: '冰魄光束', events: events, cd: eff.cd };
  }
  if (skillId === 'boulder') {
    // 巨石：单敌魂攻伤害 + 降魂防
    var t2 = enemies[0];
    var dmg2 = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    t2.hp = Math.max(0, t2.hp - dmg2);
    applyStatus(t2, { id: 'souldown', duration: 3 });
    events.push({ msg: '🪨 巨石重压 → ' + t2.name + ' ' + dmg2 });
    return { name: '巨石重压', events: events, cd: eff.cd };
  }
  return null;
}

/* 辅助技能（气力恢复/气势如虹已有回合钩子，此处占位） */
function playerSupportSkill(gb, player, skillId) {
  return null;
}

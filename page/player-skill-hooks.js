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

/* 普攻钩子：暴击（取高）
   v2.2.5（WP-B 共享桥，推翻 OQ-11）：玩家按**玩家档**、上场宠物按**宠物档**（15%/160%）同时受益。
   斗者本能（talent.js）的 25%/150% 在战斗里另行取高判定，见 §3.12-1「分别判定、取最高」。 */
function playerCritHook(unit, dmg) {
  if (!unit) return dmg;
  var eff = null;
  if (unit._playerSkills && (unit._playerSkills['crit'] || 0) >= 1) eff = getPlayerSkill('crit').effect(unit._playerSkills['crit']);
  else if (unit._petShared && unit._petShared.crit) eff = unit._petShared.crit;
  if (!eff) return dmg;
  if (battleRnd() < eff.chance) {
    return Math.floor(dmg * eff.critMult);
  }
  return dmg;
}

/* 受击钩子：格挡（**v2.2 WP-B 口径改造**）
   常驻减伤 10%（必定生效）→ 5% 完美格挡（减伤 90%~99%，**随机值**）→ 20% 普通格挡（减伤随等级，满级 75%）
   ⚠️ 几率**固定不随等级**；pity 仍作用在「普通格挡」那一档（失败几率 ×1.2） */
function playerBlockHook(unit, dmg) {
  if (!unit) return dmg;
  var eff = null, isPet = false;
  if (unit._playerSkills && (unit._playerSkills['block'] || 0) >= 1) eff = getPlayerSkill('block').effect(unit._playerSkills['block']);
  else if (unit._petShared && unit._petShared.block) { eff = unit._petShared.block; isPet = true; }
  if (!eff) return dmg;
  var out = Math.floor(dmg * (1 - (eff.passiveReduce || 0)));
  if (isPet) {   // 宠物档：常驻减伤 10% + 20% 格挡减伤 50%，无完美格挡
    if (battleRnd() < eff.chance) return Math.floor(out * (1 - eff.reduce));
    return out;
  }
  if (battleRnd() < eff.perfectChance) {
    var pr = eff.perfectMin + battleRnd() * (eff.perfectMax - eff.perfectMin);
    unit._blockPity = 1;
    return Math.floor(out * (1 - pr));
  }
  if (battleRnd() < eff.chance * (unit._blockPity || 1)) {
    unit._blockPity = 1;
    return Math.floor(out * (1 - eff.reduce));
  }
  unit._blockPity = (unit._blockPity || 1) * 1.2;
  return out;
}

/* v2.2.5（WP-B 共享桥，推翻 OQ-11）：把玩家**已装配**的暴击/格挡/气力恢复按**宠物档**换算后，
   挂到参战宠物身上（`pet._petShared[id]`）。由 pet-store 的 `buildGroupBattlePets()` 建场后调用；
   本模块未加载时静默跳过（测试只载必要文件时不会炸）。 */
function attachPetSharedSkills(pets, stateOverride) {
  if (!pets || !pets.length) return;
  /* v2.2.8：stateOverride 仅供**离线工具/测试**显式传入（沙箱没挂 skill-store.js 时用）；
     线上调用方（buildGroupBattlePets）不传 → 行为与以前完全一致。 */
  var st = stateOverride || ((typeof getSkillState === 'function') ? getSkillState() : null);
  if (!st || !st.levels) return;
  ['crit', 'block', 'vitality'].forEach(function (id) {
    var lv = st.levels[id] || 0;
    if (lv < 1) return;
    if ((st.loadout || []).indexOf(id) < 0) return;   // 只共享「已装配」的
    var def = getPlayerSkill(id);
    if (!def || typeof def.petEffect !== 'function') return;
    pets.forEach(function (p) {
      if (!p._petShared) p._petShared = {};
      p._petShared[id] = def.petEffect(lv);
    });
  });
}

/* 回合开始钩子：气势如虹（全队攻击+，触发锁3回合）/ 气力恢复（每4回合后2回合回血）/ 启风
   v2.2.5：**宠物档**只共享气力恢复（每 5 回合回 (防+魂防)×120%），在**宠物自己回合开始**结算。 */
function playerSkillTurnStart(gb, player, turn) {
  var events = [];
  if (!player) return events;
  if (!player._playerSkills) {
    if (player._petShared && player._petShared.vitality && (turn % (player._petShared.vitality.everyTurns || 5)) === 0) {
      var pv = player._petShared.vitality;
      var ph = Math.floor(((player.base.def || 0) + (player.base.soulDef || 0)) * pv.healPct);
      if (ph > 0 && player.hp > 0) {
        player.hp = Math.min(player.base.hp, player.hp + ph);
        events.push({ msg: '💚 ' + player.name + ' 气力恢复（共享）+' + ph });
      }
    }
    return events;
  }

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
    /* v2.2 WP-B：回复公式由「防御×n×10%」改为「**(防御+魂防)**×n×10%」（满级 200%） */
    var heal = Math.floor(((player.base.def || 0) + (player.base.soulDef || 0)) * veff.healPct);
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
      /* v2.2 WP-B：嘲讽期间受到伤害 −15% —— 用「警戒」状态承载（dmgTakenReduce 0.15）。
         duration 取 2：状态在**自己的回合末**递减，嘲讽窗口要跨过敌方这一轮攻击。 */
      applyStatus(player, { id: 'vigil', duration: 2 });
      if (typeof syncStatusDerived === 'function') syncStatusDerived(player);
      events.push({ msg: '🎯 ' + player.name + ' 瞩目：吸引敌方全体攻击 1 回合（受伤 −15%）' });
    } else {
      player._spotPity = (player._spotPity || 1) * 1.2;
    }
  }
  /* v2.2.5 启风（§1.3 效果①）：每回合开始，我方**随机 2 名**速度 +n×1%（满级 +10%）。
     用状态 `haste` 承载（可被驱散、持续至战斗结束），不直接改 base。 */
  var qfLv = player._playerSkills['qifeng'] || 0;
  if (qfLv >= 1) {
    var qeff = getPlayerSkill('qifeng').effect(qfLv);
    var pool = gb.allies.filter(function (a) { return a.hp > 0; });
    for (var qi = 0; qi < (qeff.targets || 2) && pool.length; qi++) {
      var pick = pool.splice(Math.floor(battleRnd() * pool.length), 1)[0];
      applyStatus(pick, { id: 'haste', duration: 999, modsPct: { spd: qeff.spdPct } });
      if (typeof syncStatusDerived === 'function') syncStatusDerived(pick);
      events.push({ msg: '💨 ' + pick.name + ' 启风：速度 +' + Math.round(qeff.spdPct * 100) + '%' });
    }
  }
  if (player._spotLock > 0) player._spotLock--;
  return events;
}

/* v2.2.9 金身护盾·**破盾反伤**（§1.1 裁决：护盾被击破时对攻击者造成 初始护盾×20% 伤害，受魂防减免）
   取位说明：**不动 `absorbShield`**（它被普攻/魂伤/AoE 三条链复用 5 处、且签名里没有攻击者，
   就地结算会重复触发）。改为在群战 tick 的**行动前后**夹一层：
     ① 行动前 `shieldPreSnapshot(gb)` —— 记下护盾现值，并把「满盾值」记进 `_shieldReflect.initial`；
     ② 行动后 `shieldReflectAfter(gb, actor)` —— 此刻的 `actor` 就是**刚刚出手的人**，
        若某带盾队友的盾「行动前 >0、行动后 =0」，则破盾者 = actor → 结算反伤（一击一次）。 */
function shieldPreSnapshot(gb) {
  (gb.allies || []).concat(gb.enemies || []).forEach(function (u) {
    if (!u._playerSkills || (u._playerSkills['goldshield'] || 0) < 1) return;
    var cur = u._shield || 0;
    u._shieldPre = cur;
    if (!u._shieldReflect) u._shieldReflect = { initial: 0, used: false };
    if (cur > u._shieldReflect.initial) u._shieldReflect.initial = cur;   // 记住开战满盾值
  });
}

function shieldReflectAfter(gb, actor) {
  var out = [];
  if (!gb || !actor || actor.hp <= 0) return out;
  (gb.allies || []).forEach(function (u) {
    if (!u._playerSkills || (u._playerSkills['goldshield'] || 0) < 1) return;
    if (u === actor || u.side === actor.side) return;        // 破盾者必须是对手
    var ref = u._shieldReflect;
    if (!ref || ref.used || !(u._shieldPre > 0)) return;      // 行动前就没盾 / 已反伤过
    if ((u._shield || 0) > 0) return;                          // 盾还在 → 没破
    var eff = getPlayerSkill('goldshield').effect(u._playerSkills['goldshield']);
    var base = Math.max(0, ref.initial);
    var dmg = Math.floor(base * (eff.reflectPct || 0.20));
    /* 受魂防减免：沿用引擎既有口径「减免 = 防御/2」，即魂伤取魂防半数 */
    var cut = Math.floor(effectiveStat(actor, 'soulDef') / 2);
    dmg = Math.max(1, dmg - cut);
    actor.hp = Math.max(0, actor.hp - dmg);
    ref.used = true;
    out.push({ msg: '🛡️ ' + u.name + ' 金身护盾被击破 → 反伤 ' + actor.name + ' ' + dmg +
      '（初始盾 ' + base + ' × ' + Math.round((eff.reflectPct || 0.20) * 100) + '% − 魂防/2 ' + cut + '）',
      targetId: actor.id, type: 'damage' });
  });
  return out;
}

/* v2.2.5 启风（§1.3 效果②）：我方持「全场速度最快者」时，该角色每回合额外进行一次普通攻击，
   伤害 ×n×8%（满级 80%）。由 battle-group 的群战 tick 在**每次行动之后**调用。
   判据：① 我方有人装配启风 ② actor 是「敌我双方合并」的速度最快者 ③ 本回合尚未触发过。
   目标复用引擎常规的 `aiPickTarget(gb, actor, null)`（普攻 = 无技能），不另立口径。 */
function qifengExtraAttack(gb, actor) {
  if (!gb || !actor || actor.side !== 'ally' || actor.hp <= 0) return null;
  if (gb._qifengTurn === gb.turn) return null;                 // 每个回合只触发一次
  var owner = null;
  (gb.allies || []).forEach(function (a) {
    if (a._playerSkills && (a._playerSkills['qifeng'] || 0) >= 1) owner = a;
  });
  if (!owner) return null;
  var eff = getPlayerSkill('qifeng').effect(owner._playerSkills['qifeng']);
  var all = (gb.allies || []).concat(gb.enemies || []).filter(function (u) { return u.hp > 0; });
  var fastest = null;
  all.forEach(function (u) {
    if (!fastest || effectiveStat(u, 'spd') > effectiveStat(fastest, 'spd')) fastest = u;
  });
  if (fastest !== actor) return null;                          // 只有全场最快者能双动
  var foes = (gb.enemies || []).filter(function (u) { return u.hp > 0; });
  if (!foes.length) return null;
  var target = (typeof aiPickTarget === 'function') ? aiPickTarget(gb, actor, null) : foes[0];
  if (!target || target.hp <= 0) target = foes[0];
  gb._qifengTurn = gb.turn;
  var evts = normalAttack(gb, actor, target, eff.extraMult);
  evts.unshift({ msg: '💨 ' + actor.name + ' 启风：全场最快者额外一击（伤害 ×' + Math.round(eff.extraMult * 100) + '%）' });
  return evts;
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
      /* v2.2 WP-B：受击敌人「接下来 2 回合 攻/魂攻 −15%」（同一目标只记一次） */
      var hasWeak = (t.statuses || []).some(function (s) { return s.id === 'weaken'; });
      applyStatus(t, { id: 'weaken', duration: 2 });
      if (typeof syncStatusDerived === 'function') syncStatusDerived(t);
      if (!hasWeak) events.push({ msg: '⬇️ ' + t.name + ' 弱化：攻/魂攻 −15%（2 回合）' });
    }
    return { name: '陨石轰炸', events: events, cd: eff.cd };
  }
  if (skillId === 'icebeam') {
    // 冰魄：单敌冰冻 + 两段无视魂防伤害
    var target = enemies[0];
    var dmg = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    target.hp = Math.max(0, target.hp - dmg);
    applyStatus(target, { id: 'freeze', duration: 1 });
    /* v2.1.33：第二段挂起，由 battle-group 的 resolveIceFollowUps 在**下回合开始时**结算
       （设计 §1.3-6 + OQ-12：下回合战斗开始时触发，不占用行动）。
       此前只打了当回合这一下、第二段从未存在 → 实际输出只有设计的一半。 */
    player._iceFollowUp = { targetId: target.id, dmg: dmg };
    events.push({ msg: '❄️ ' + player.name + ' 冰魄光束 → ' + target.name + ' ' + dmg + ' 魂伤害（冰冻 1 回合，下回合追加一段）' });
    return { name: '冰魄光束', events: events, cd: eff.cd };
  }
  if (skillId === 'boulder') {
    // 巨石：单敌魂攻伤害 + 降魂防
    var t2 = enemies[0];
    var dmg2 = Math.max(1, Math.floor((player.base.soulAtk || 0) * eff.power));
    t2.hp = Math.max(0, t2.hp - dmg2);
    /* v2.1.33：按设计「降魂防 n×1%、可叠加、上限 -60%、直到战斗结束」。
       此前是 applyStatus(..., {duration: 3}) 直接用 souldown 的**定义值**
       （固定 -15%、maxStacks 1 不可叠、3 回合）→ 降幅不随等级、不可叠、到期就没了，三项都不符。
       改法与「打湿」一致：走**状态实例**的 modsPct（同键实例值覆盖定义值，不会叠成两份），
       每次施放在已有值上继续下压，夹在 -60% 上限；duration 取极大值表示持续到战斗结束。 */
    var down = eff.soulDefDown || 0;
    var prev = null;
    (t2.statuses || []).forEach(function (s) { if (s.id === 'souldown') prev = s; });
    /* v2.2 WP-B：上限 60% → 80%。⚠️ 规整到 1e-6，避免 0.2 累加出 0.7999999999999999
       被 statMods 的 floor 少算 1 点属性（实测 1000 魂防会变成 201 而非 200）。 */
    var stacked = Math.min(0.80, ((prev && prev.modsPct && -prev.modsPct.soulDef) || 0) + down);
    stacked = Math.round(stacked * 1e6) / 1e6;
    applyStatus(t2, { id: 'souldown', duration: 999, modsPct: { soulDef: -stacked } });
    if (typeof syncStatusDerived === 'function') syncStatusDerived(t2);
    events.push({ msg: '🪨 ' + player.name + ' 巨石重压 → ' + t2.name + ' ' + dmg2 + ' 魂伤害（魂防 -' + Math.round(stacked * 100) + '%，持续到战斗结束）' });
    return { name: '巨石重压', events: events, cd: eff.cd };
  }
  return null;
}

/* 辅助技能（气力恢复/气势如虹已有回合钩子，此处占位） */
function playerSupportSkill(gb, player, skillId) {
  return null;
}

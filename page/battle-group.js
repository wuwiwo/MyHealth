/* ============================================
   MyHealth — Group Battle Engine (M2b-4)
   多 Unit 行动队列战斗。独立于原 battleTick（单敌零回归）。
   行动队列：按 effectiveSpeed 降序 + 稳定 tie-break（同速我方先手、同方按 id 稳定序）+ 先制度 priority。
   每单位回合：天赋 hook → 普攻或技能 → 状态 tick。
   纯逻辑，无 DOM/store。
   ============================================ */

/* 状态中文名（日志用） */
var STATUS_NAMES = { sleep:'睡眠', poison:'中毒', freeze:'冰冻', flinch:'畏缩', wet:'潮湿', charging:'蓄力', possessed:'幽魂附身', doomed:'末日', armorbroken:'破甲', slow:'减速', souldown:'魂防降低', lastworded:'遗言诅咒', sleepy:'哈欠' };
function getStatusName(id){ return STATUS_NAMES[id] || id; }

/* createGroupBattle({allies:[Unit], enemies:[Unit], rng?}) → group battle 状态
   allies/enemies 是 unit.js 的 Unit 数组 */
function createGroupBattle(opts) {
  opts = opts || {};
  var units = (opts.allies || []).concat(opts.enemies || []);
  return {
    units: units,
    allies: opts.allies || [],
    enemies: opts.enemies || [],
    turn: 0,
    done: false,
    winner: null,        // 'ally' | 'enemy'
    events: [],
    log: [],
    rng: opts.rng || Math.random,
    terrain: opts.terrain || null
  };
}

/* 计算单位有效速度（含先制度与状态修正） */
function unitInitiative(u, skill) {
  var spd = effectiveSpeed(u);
  if (skill && SKILLS[skill] && SKILLS[skill].priority) spd += SKILLS[skill].priority * 50;
  if (u._taunting) spd *= 2;   // 嘲讽：速度×200%
  return spd;
}

/* 构建行动队列：按 initiative 降序，稳定 tie-break（同速我方先手，同方按创建序） */
function buildActionQueue(gb) {
  var queue = gb.units.filter(function (u) { return u.hp > 0; });
  queue.sort(function (a, b) {
    var ia = unitInitiative(a, null);
    var ib = unitInitiative(b, null);
    if (ia !== ib) return ib - ia;
    if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;   // 同速我方先手
    return (gb.units.indexOf(a) < gb.units.indexOf(b)) ? -1 : 1; // 同方稳定序
  });
  return queue;
}

/* 目标选择：random1 / all / self / ally1 / enemy1（嘲讽优先） */
function selectTargets(gb, actor, skillDef) {
  var target = (skillDef && skillDef.target) || 'random1';
  var enemies = gb.enemies.filter(function (u) { return u.hp > 0; });
  var allies = gb.allies.filter(function (u) { return u.hp > 0; });

  if (target === 'self') return [actor];
  if (target === 'all') {
    // 嘲讽者被单独挑出，其余全体
    var taunter = (actor.side === 'ally' ? gb.enemies : gb.allies).find(function (u) { return u._taunting && u.hp > 0; });
    if (taunter && target === 'all') {
      // 全体技能仍打全体，但嘲讽者额外承伤由 battle 处理
    }
    return actor.side === 'ally' ? enemies : allies;
  }
  if (target === 'ally1') {
    var healTargets = allies.filter(function (u) { return u.id !== actor.id; });
    if (!healTargets.length) healTargets = allies;
    return [healTargets[Math.floor(gb.rng() * healTargets.length)]];
  }
  if (target === 'enemy1') {
    return [enemies[Math.floor(gb.rng() * enemies.length)]];
  }
  // random1：嘲讽优先
  var pool = actor.side === 'ally' ? enemies : allies;
  var t = pool.find(function (u) { return u._taunting && u.hp > 0; });
  if (t) return [t];
  if (!pool.length) return [];
  return [pool[Math.floor(gb.rng() * pool.length)]];
}

/* 普通攻击（无技能时） */
function normalAttack(gb, actor, target) {
  var events = [];
  if (!target || target.hp <= 0) return events;
  // 普攻伤害（同原公式）
  var dmg = Math.max(1, actor.base.atk - Math.floor(target.base.def / 2) + Math.floor(gb.rng() * 4) + 1);
  // 天赋 hook: 利刃加成 / 多目标惩罚 / 末日减半
  var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: dmg, isPhysical: true, attacker: actor, target: target });
  td.mutations.forEach(function (m) {
    if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
    if (m.key === 'dmgDealtHalf') dmg = Math.floor(dmg / 2);
  });
  var td2 = talentDispatch(target, 'onDamage', { attacker: actor, amount: dmg, isPhysical: true, isPlayerAttack: false });
  td2.mutations.forEach(function (m) {
    if (m.key === 'reflectFlat') { target.hp = Math.max(0, target.hp - dmg); actor.hp = Math.max(0, actor.hp - m.value); events.push({ msg: '🩸 粗糙皮肤反伤 ' + m.value }); }
    if (m.key === 'dmgTakenBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'soulDmgReduce') dmg = Math.floor(dmg * 0.7);
  });
  // 玩家暴击技能（取高）
  if (actor.side === 'ally' && typeof playerCritHook === 'function') {
    var critDmg = playerCritHook(actor, dmg);
    if (critDmg > dmg) { dmg = critDmg; events.push({ msg: '💥 暴击！' }); }
  }
  // 玩家受击：瞩目计数
  if (target.side === 'ally' && target._spotTauntTurn) {
    target._spotHits = (target._spotHits || 0) + 1;
  }
  // 玩家受击格挡（pity）
  if (target.side === 'ally' && typeof playerBlockHook === 'function') {
    var blockDmg = playerBlockHook(target, dmg);
    if (blockDmg < dmg) { dmg = blockDmg; events.push({ msg: '🛡️ ' + target.name + ' 格挡！' }); }
  }
  target.hp = Math.max(0, target.hp - dmg);
  events.push({ msg: (actor.name || '单位') + ' 攻击 → ' + dmg + ' 伤害' });
  // 嗜血：造成伤害恢复
  var bt = talentDispatch(actor, 'onAfterDamage', { dealt: dmg, target: target });
  bt.events.forEach(function (e) { events.push({ msg: e.msg }); });
  return events;
}

/* 施放技能 */
function castSkill(gb, actor, skillId) {
  var events = [];
  var def = SKILLS[skillId];
  if (!def) return events;
  var targets = selectTargets(gb, actor, def);

  // 伤害
  if (def.type === 'attack') {
    var dmgResult = calcSkillDamage(def, actor, targets, {});
    if (dmgResult) {
      dmgResult.hits.forEach(function (h) {
        var t = gb.units.find(function (u) { return u.id === h.targetId; });
        if (t && t.hp > 0) {
          // 天赋修正（利刃等）
          var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: h.amount, isPhysical: h.dmgType === 'physical', attacker: actor, target: t });
          var dmg = h.amount;
          td.mutations.forEach(function (m) { if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value)); });
          t.hp = Math.max(0, t.hp - dmg);
          events.push({ msg: '⚡ ' + (actor.name || '') + ' ' + def.name + ' → ' + dmg + ' 伤害' });
          // 蓄力重击：蓄力状态
          if (skillId === 'chargeup') {
            applyStatus(actor, { id: 'charging', duration: 1 });
            events.push({ msg: '🔋 ' + actor.name + ' 蓄力中' });
          }
          if (actor._charging) {
            actor._charging = false;
            var big = Math.floor(actor.base.atk * 4 - Math.floor(t.base.def / 2));
            t.hp = Math.max(0, t.hp - big);
            events.push({ msg: '💥 蓄力重击结算! ' + big + ' 伤害' });
          }
        }
      });
    }
  }

  // 效果（状态/治疗/增益）
  var fx = applySkillEffects(def, actor, targets, {});
  fx.events.forEach(function (e) { events.push({ msg: e.msg }); });
  fx.statusApps.forEach(function (sa) {
    var t = gb.units.find(function (u) { return u.id === sa.unitId; });
    if (t && t.hp > 0) {
      // 朴实：免疫状态
      var plain = talentDispatch(t, 'onBeforeStatus', {});
      if (!plain.skipAction) {
        applyStatus(t, { id: sa.id, duration: sa.duration, source: actor });
        events.push({ msg: '🌀 ' + actor.name + ' → ' + t.name + ' 施加 ' + getStatusName(sa.id) + '(' + sa.id + ')' });
      }
    }
  });
  fx.heals.forEach(function (h) {
    var t = gb.units.find(function (u) { return u.id === h.unitId; });
    if (t) {
      // 末日阻断治疗
      var doom = dispatch(t, 'onHeal', {});
      if (!doom.skipAction) {
        t.hp = Math.min(t.base.hp, t.hp + h.amount);
        events.push({ msg: '💚 ' + t.name + ' 治疗 +' + h.amount });
      } else events.push({ msg: '🌑 ' + t.name + ' 末日阻断治疗' });
    }
  });
  fx.buffs.forEach(function (b) {
    if (b.all) {
      (actor.side === 'ally' ? gb.allies : gb.enemies).forEach(function (t) {
        t._dmgReduce = (t._dmgReduce || 0) + b.value;
        events.push({ msg: '🛡️ ' + t.name + ' 减伤 +' + b.value });
      });
    }
  });

  // 遗言：自身阵亡
  if (skillId === 'lastword') {
    actor.hp = 0;
    events.push({ msg: '💀 ' + actor.name + ' 遗言牺牲' });
  }

  // 设置冷却
  setSkillCooldown(actor, skillId, def.cooldown || 1);
  return events;
}

/* 单单位回合 */
function groupUnitTurn(gb, actor) {
  var events = [];
  var turn = gb.turn + 1;

  // 玩家技能回合开始（气势如虹/气力恢复）
  if (actor.side === 'ally' && typeof playerSkillTurnStart === 'function') {
    var ps = playerSkillTurnStart(gb, actor, turn);
    ps.forEach(function (e) { events.push({ msg: e.msg }); });
  }
  // 天赋 onTurnStart
  var ts = talentDispatch(actor, 'onTurnStart', { turn: turn, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies });
  ts.events.forEach(function (e) { events.push({ msg: e.msg }); });

  // 状态 onTurnStart（哈欠→睡眠等）
  var ss = dispatch(actor, 'onTurnStart', { turn: turn });
  ss.events.forEach(function (e) { events.push({ msg: e.msg }); });

  // 慢启动/懒惰/冰冻/畏缩 → skipAction
  var before = dispatch(actor, 'onBeforeAction', { turn: turn });
  var tBefore = talentDispatch(actor, 'onBeforeAction', { turn: turn });
  if (before.skipAction || tBefore.skipAction) {
    events.push({ msg: (actor.name || '') + ' 无法行动' });
    return events;
  }

  // 选择行动：敌人用 AI 策略，玩家用随机/技能
  var skillId, actTarget;
  if (actor.side === 'enemy' && typeof aiDecide === 'function') {
    var ai = aiDecide(gb, actor);
    skillId = ai.skillId;
    actTarget = ai.target;
  } else {
    skillId = pickSkill(actor);
  }
  var acted = false;
  if (skillId) {
    var castEvents = castSkill(gb, actor, skillId);
    events = events.concat(castEvents);
    acted = true;
  }
  if (!acted) {
    // 普攻：目标选择（AI 用策略目标，否则随机）
    var targets;
    if (actTarget) targets = [actTarget];
    else targets = selectTargets(gb, actor, null);
    if (targets.length) {
      var ta = talentDispatch(actor, 'onBeforeAction', {});
      var multi = ta.mutations.find(function (m) { return m.key === 'multiTarget'; });
      var nTargets = multi ? multi.value : 1;
      targets.slice(0, nTargets).forEach(function (t) {
        events = events.concat(normalAttack(gb, actor, t));
      });
    }
  }

  // 玩家技能回合结束（瞩目回复）
  if (actor.side === 'ally' && typeof playerSkillTurnEnd === 'function') {
    var pe = playerSkillTurnEnd(gb, actor, turn);
    pe.forEach(function (e) { events.push({ msg: e.msg }); });
  }
  // 天赋 onAfterAction / onTurnEnd
  var ae = talentDispatch(actor, 'onAfterAction', {});
  ae.events.forEach(function (e) { events.push({ msg: e.msg }); });
  var te = talentDispatch(actor, 'onTurnEnd', { turn: turn });
  te.events.forEach(function (e) { events.push({ msg: e.msg }); });
  var se = dispatch(actor, 'onTurnEnd', { turn: turn });
  se.events.forEach(function (e) { events.push({ msg: e.msg }); });

  // 技能冷却递减
  tickSkillCooldowns(actor);

  return events;
}

/* 一个完整回合（所有存活单位按行动队列行动一次） */
function groupBattleTick(gb) {
  if (gb.done) return;
  if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
    var player = gb.allies.find(function(u){ return u._playerSkills; });
    if (player) {
      var evs = playerSkillBattleStart(gb, player);
      evs.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:player.name, events:[e]}); });
    }
  }
  gb.turn++;
  var queue = buildActionQueue(gb);
  queue.forEach(function (u) {
    if (gb.done) return;
    if (u.hp <= 0) return;
    var evts = groupUnitTurn(gb, u);
    gb.events = gb.events.concat(evts);
    gb.log.push({ turn: gb.turn, unit: u.name, events: evts });
    // 检查胜负
    var alliesAlive = gb.allies.some(function (a) { return a.hp > 0; });
    var enemiesAlive = gb.enemies.some(function (e) { return e.hp > 0; });
    if (!alliesAlive) { gb.done = true; gb.winner = 'enemy'; return; }
    if (!enemiesAlive) { gb.done = true; gb.winner = 'ally'; return; }
  });
  // 场地（M2b-5 接入）
  if (gb.terrain && gb.terrain.onTurnEnd) {
    var te = gb.terrain.onTurnEnd(gb);
    if (te && te.events) gb.events = gb.events.concat(te.events);
  }
}

/* 跑到结束（测试用） */
function runGroupBattle(gb, maxTurns) {
  var guard = 0;
  while (!gb.done && guard++ < (maxTurns || 200)) groupBattleTick(gb);
  return gb;
}

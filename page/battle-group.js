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

/* ============ 命中 / 闪避（v2.1.5 引入） ============
   设计文档本就要求命中率机制（技能「闪耀：敌方命中率 -0%~40%」「打湿：提高对其命中率 0%~30%」），
   此前只有文案没有判定，这里补上，并让天赋「漆黑之眼 / 心眼」落地。
   公式：命中率 = BASE_HIT_RATE + 自身命中修正(_accMod) − 目标闪避(_eva)，clamp 到 [5%, 100%]。
   现有单位默认 _accMod=0 / _eva=0，所以仅受那 5% 基础未命中影响。 */
var BASE_HIT_RATE = 0.95;

/* 计算实际命中率（含天赋 hook：guaranteedHit / noAccPenalty） */
function groupHitChance(actor, target) {
  var td = talentDispatch(actor, 'onBeforeHit', { target: target });
  var guaranteed = false, noPenalty = false;
  td.mutations.forEach(function (m) {
    if (m.key === 'guaranteedHit') guaranteed = true;
    if (m.key === 'noAccPenalty') noPenalty = true;
  });
  if (guaranteed) return 1;                       // 漆黑之眼：必定命中
  var acc = BASE_HIT_RATE + (actor._accMod || 0);
  if (noPenalty) acc = Math.max(BASE_HIT_RATE, acc);   // 心眼：命中率不会被降低
  acc -= (target._eva || 0);
  return Math.max(0.05, Math.min(1, acc));
}

/* 命中判定 */
function groupRollHit(gb, actor, target) {
  return gb.rng() < groupHitChance(actor, target);
}

/* 多单位天赋调度（光环类：凛冬之核/威压领域/圣光守护） */
function talentAura(units, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  (units || []).forEach(function (u) {
    if (!u || u.hp <= 0) return;
    var r = talentDispatch(u, hook, ctx);
    if (r.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(r.mutations);
    out.events = out.events.concat(r.events);
  });
  return out;
}

/* 天赋暴击判定（斗者本能）：返回 {chance, mult} */
function talentCrit(actor) {
  var td = talentDispatch(actor, 'onBeforeCrit', {});
  var chance = 0, mult = 1.5;
  td.mutations.forEach(function (m) {
    if (m.key === 'critChance') chance = Math.max(chance, m.value);
    if (m.key === 'critMult') mult = m.value;
  });
  return { chance: chance, mult: mult };
}

/* 伤害结算前的通用处理：目标阵营的「圣光守护」分担 + 天赋承伤修正
   返回 {dmg, events}，dmg 已扣掉被队友分担的部分 */
function applyAllyDamageShare(gb, target, dmg, events) {
  var mates = (target.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) {
    return u.hp > 0 && u.id !== target.id;
  });
  var res = talentAura(mates, 'onAllyDamage', { target: target, amount: dmg });
  var share = 0;
  res.mutations.forEach(function (m) { if (m.key === 'damageShare') share += m.value; });
  res.events.forEach(function (e) { events.push({ msg: e.msg }); });
  return share > 0 ? Math.max(1, dmg - share) : dmg;
}

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
  // 命中判定（v2.1.5）
  if (!groupRollHit(gb, actor, target)) {
    events.push({ msg: '💨 ' + (actor.name || '单位') + ' 的攻击落空（' + target.name + ' 闪避）', targetId: target.id });
    return events;
  }
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
    if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value));   // 不动如山：满血受伤 -50%
  });
  // 玩家暴击技能（取高）
  if (actor.side === 'ally' && typeof playerCritHook === 'function') {
    var critDmg = playerCritHook(actor, dmg);
    if (critDmg > dmg) { dmg = critDmg; events.push({ msg: '💥 暴击！' }); }
  }
  // 天赋暴击（斗者本能：普攻 25% 暴击 / 150% 伤害）
  var tc = talentCrit(actor);
  if (tc.chance > 0 && gb.rng() < tc.chance) {
    dmg = Math.floor(dmg * tc.mult);
    events.push({ msg: '💥 ' + (actor.name || '') + ' 暴击！×' + tc.mult });
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
  // 圣光守护：队友分担伤害（目标少受，分担者自己掉血）
  dmg = applyAllyDamageShare(gb, target, dmg, events);
  target.hp = Math.max(0, target.hp - dmg);
  events.push({ msg: (actor.name || '单位') + ' 攻击 → ' + dmg + ' 伤害', targetId: target.id });
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
  // 技能气泡（对话效果：角色施放技能时喊话）
  events.push({ type: 'bubble', unit: actor.name, text: '⚡ ' + (actor.name || '') + '：' + def.name + '！', skillId: skillId });

  // 伤害
  if (def.type === 'attack') {
    var dmgResult = calcSkillDamage(def, actor, targets, {});
    if (dmgResult) {
      dmgResult.hits.forEach(function (h) {
        var t = gb.units.find(function (u) { return u.id === h.targetId; });
        if (t && t.hp > 0) {
          // 命中判定（v2.1.5）
          if (!groupRollHit(gb, actor, t)) {
            events.push({ msg: '💨 ' + (actor.name || '') + ' 的 ' + def.name + ' 落空（' + t.name + ' 闪避）', targetId: t.id });
            return;
          }
          // 天赋修正（利刃等）
          var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: h.amount, isPhysical: h.dmgType === 'physical', attacker: actor, target: t });
          var dmg = h.amount;
          td.mutations.forEach(function (m) { if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value)); });
          // 天赋暴击（斗者本能）
          var tc2 = talentCrit(actor);
          if (tc2.chance > 0 && gb.rng() < tc2.chance) { dmg = Math.floor(dmg * tc2.mult); events.push({ msg: '💥 ' + (actor.name || '') + ' 暴击！×' + tc2.mult }); }
          // 圣光守护：队友分担
          dmg = applyAllyDamageShare(gb, t, dmg, events);
          t.hp = Math.max(0, t.hp - dmg);
          events.push({ msg: '⚡ ' + (actor.name || '') + ' ' + def.name + ' → ' + dmg + ' 伤害', targetId: t.id });
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
      var grade = sa.grade || 1;
      // 朴实：免疫状态；不动如山：满血免疫普通~高级
      var selfGuard = talentDispatch(t, 'onBeforeStatus', { statusId: sa.id, grade: grade });
      // 阵营光环守卫（凛冬之核：我方全体免疫冰冻）
      var mates = (t.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) { return u.hp > 0; });
      var auraGuard = talentAura(mates, 'onAllyStatus', { statusId: sa.id, grade: grade, target: t });
      if (!selfGuard.skipAction && !auraGuard.skipAction) {
        applyStatus(t, { id: sa.id, duration: sa.duration, source: actor });
        events.push({ msg: '🌀 ' + actor.name + ' → ' + t.name + ' 施加 ' + getStatusName(sa.id) + '(' + sa.id + ')' });
      } else {
        var blocked = selfGuard.events.concat(auraGuard.events);
        events.push({ msg: blocked.length ? blocked[0].msg : ('🛡️ ' + t.name + ' 免疫 ' + getStatusName(sa.id)) });
      }
    }
  });
  fx.heals.forEach(function (h) {
    var t = gb.units.find(function (u) { return u.id === h.unitId; });
    if (t) {
      // 末日阻断治疗
      var doom = dispatch(t, 'onHeal', {});
      if (!doom.skipAction) {
        var amount = h.amount;
        // 镜像结界：受我方辅助 +25% / 受敌方辅助 -25%（ctx.source 为施法者）
        var th = talentDispatch(t, 'onBeforeHeal', { amount: amount, source: actor, isSupport: true });
        th.mutations.forEach(function (m) {
          if (m.key === 'healBoost') amount = Math.floor(amount * (1 + m.value));
          if (m.key === 'healReduce') amount = Math.floor(amount * (1 - m.value));
        });
        // 威压领域：血量>75% 时敌方全体治疗效果 -20%
        var foes = (t.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; });
        var pf = talentAura(foes, 'onFoeHeal', { target: t, amount: amount });
        pf.mutations.forEach(function (m) { if (m.key === 'healReduce') amount = Math.floor(amount * (1 - m.value)); });
        pf.events.forEach(function (e) { events.push({ msg: e.msg }); });
        if (amount < 0) amount = 0;
        t.hp = Math.min(t.base.hp, t.hp + amount);
        events.push({ msg: '💚 ' + t.name + ' 治疗 +' + amount });
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

/* 玩家攻击技能选择：装备的攻击类玩家技能（陨石/冰魄/巨石），非冷却时随机施放 */
function playerAttackSkillPick(gb, actor) {
  if (!actor._playerSkills) return null;
  var atkSkills = Object.keys(actor._playerSkills).filter(function (sid) {
    var s = getPlayerSkill(sid);
    return s && s.type === 'attack' && (actor._playerSkills[sid] || 0) >= 1;
  });
  if (!atkSkills.length) return null;
  // 非冷却的
  var ready = atkSkills.filter(function (sid) { return !skillOnCooldown(actor, sid); });
  if (!ready.length) return null;
  // 30% 几率施放（不每回合放），让普攻也有存在感
  if (Math.random() < 0.3) return ready[Math.floor(Math.random() * ready.length)];
  return null;
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
  var ts = talentDispatch(actor, 'onTurnStart', { turn: turn, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies });
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
    // 玩家：优先施放装备的攻击类玩家技能（陨石/冰魄/巨石）
    var ps = playerAttackSkillPick(gb, actor)
    if (ps) { skillId = ps; }
    else skillId = pickSkill(actor);
  }
  var acted = false;
  if (skillId) {
    // 玩家技能用 playerAttackSkill，敌群技能用 castSkill
    if (actor.side === 'ally' && actor._playerSkills && actor._playerSkills[skillId] && typeof playerAttackSkill === 'function') {
      var pr = playerAttackSkill(gb, actor, skillId)
      if (pr) {
        events = events.concat(pr.events)
        if (pr.cd) setSkillCooldown(actor, skillId, pr.cd)
        acted = true
      }
    }
    if (!acted) {
      var castEvents = castSkill(gb, actor, skillId);
      events = events.concat(castEvents);
      acted = true;
    }
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
  var te = talentDispatch(actor, 'onTurnEnd', { turn: turn, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies });
  te.events.forEach(function (e) { events.push({ msg: e.msg }); });
  var se = dispatch(actor, 'onTurnEnd', { turn: turn });
  se.events.forEach(function (e) { events.push({ msg: e.msg }); });

  // 技能冷却递减
  tickSkillCooldowns(actor);

  // 命中/闪避修正倒计时（闪耀 / 打湿）
  if (actor._hitModTurns > 0) {
    actor._hitModTurns--;
    if (actor._hitModTurns === 0) { actor._accMod = 0; actor._eva = 0; }
  }

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

/* 单步执行：一次只行动一个单位（用于逐个行动动画，速度优先级可见）
   返回 { unit: 行动单位, events, done, winner, queueIndex, queue } */
function groupBattleStep(gb) {
  if (gb.done) return { done: true };
  // 初始化队列（跨步保存）
  if (!gb._stepQueue || gb._stepQueue.length === 0) {
    // 开战钩子（金身）
    if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
      var p0 = gb.allies.find(function(u){ return u._playerSkills; });
      if (p0) {
        var evs0 = playerSkillBattleStart(gb, p0);
        evs0.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:p0.name, events:[e]}); });
      }
    }
    gb.turn++;
    gb._stepQueue = buildActionQueue(gb);
    gb._stepIdx = 0;
  }
  // 跳过死亡单位
  while (gb._stepIdx < gb._stepQueue.length && gb._stepQueue[gb._stepIdx].hp <= 0) gb._stepIdx++;
  if (gb._stepIdx >= gb._stepQueue.length) {
    // 本回合结束：场地结算 + 重置队列
    if (gb.terrain && gb.terrain.onTurnEnd) {
      var te = gb.terrain.onTurnEnd(gb);
      if (te && te.events) gb.events = gb.events.concat(te.events);
    }
    gb._stepQueue = null; gb._stepIdx = 0;
    // 回合末检查
    var alliesAlive2 = gb.allies.some(function (a) { return a.hp > 0; });
    var enemiesAlive2 = gb.enemies.some(function (e) { return e.hp > 0; });
    if (!alliesAlive2) { gb.done = true; gb.winner = 'enemy'; }
    if (!enemiesAlive2) { gb.done = true; gb.winner = 'ally'; }
    return { done: gb.done, winner: gb.winner, turnEnd: true };
  }
  var actor = gb._stepQueue[gb._stepIdx];
  gb._stepIdx++;
  var evts = groupUnitTurn(gb, actor);
  gb.events = gb.events.concat(evts);
  gb.log.push({ turn: gb.turn, unit: actor.name, events: evts });
  // 胜负检查
  var alliesAlive = gb.allies.some(function (a) { return a.hp > 0; });
  var enemiesAlive = gb.enemies.some(function (e) { return e.hp > 0; });
  if (!alliesAlive) { gb.done = true; gb.winner = 'enemy'; }
  if (!enemiesAlive) { gb.done = true; gb.winner = 'ally'; }
  return { unit: actor, events: evts, done: gb.done, winner: gb.winner, queueIndex: gb._stepIdx, queue: gb._stepQueue };
}

/* 跑到结束（测试用） */
function runGroupBattle(gb, maxTurns) {
  var guard = 0;
  while (!gb.done && guard++ < (maxTurns || 200)) groupBattleTick(gb);
  return gb;
}

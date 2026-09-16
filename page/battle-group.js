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

/* v2.1.14 威吓削减幅度：唯一来源是 talent.js 的 INTIMIDATE_ATK_DOWN
   （talent.js 在本文件之前加载）。这里做一次兜底读取，避免加载顺序意外变化时静默失效。 */
function intimidateAtkDown() {
  return (typeof INTIMIDATE_ATK_DOWN === 'number') ? INTIMIDATE_ATK_DOWN : 0.4;
}

/* 日志里给技能/技能事件补「谁 → 谁」用的目标名 */
function joinUnitNames(list) {
  return (list || []).map(function (u) { return u && u.name ? u.name : '单位'; }).join('、');
}

/* 从 skipAction 事件里抽一句人话原因（供「无法行动」日志） */
function skipReasonText(evts) {
  var pool = evts || [];
  for (var i = 0; i < pool.length; i++) {
    var e = pool[i] || {};
    var txt = e.msg || e.reason || '';
    if (!txt) continue;
    return String(txt).split(/[:：]/)[0].trim();
  }
  return '';
}

/* v2.1.15：护盾吸收。
   「金身护盾」此前只把 _shield / _shieldImmune 写在单位上，全项目没有消费方 ——
   开战给的盾既挡不了伤害，也免疫不了负面。
   返回 {dmg, absorbed, broke}；护盾清零时同步撤掉免疫标记。 */
function absorbShield(target, dmg) {
  if (!target || !(target._shield > 0) || dmg <= 0) return { dmg: dmg, absorbed: 0, broke: false };
  var absorbed = Math.min(target._shield, dmg);
  target._shield -= absorbed;
  var broke = target._shield <= 0;
  if (broke) { target._shield = 0; target._shieldImmune = false; }
  return { dmg: Math.max(0, dmg - absorbed), absorbed: absorbed, broke: broke };
}

/* 状态增删后的统一收尾：重算 _statMods（unit.js 的 effectiveSpeed / effectiveStat 读它）。
   漏刷的后果是「减速不影响出手顺序、破甲不影响承伤」这类静默失效。 */
function syncStatusDerived(unit) {
  if (unit && typeof refreshStatMods === 'function') refreshStatMods(unit);
}

/* ============ v2.1.21：两种「替代本回合正常行动」的结算 ============ */

/* 蓄力重击（设计文档 doc/design-v2.0.md:101-105）：
   本回合进入蓄力（承伤 +25%），**下回合**对随机 1 名敌人造成 400% 攻击伤害。
   改造前实现是「本回合就打出 400%（技能自带 power:400）+ 下次施放再追加一次」，
   时点与文档不符。现在 charging 到期时置 _chargeReady，本单位下一次行动开始时
   自动结算 400% 重击并**占用该次行动**。 */
var CHARGE_STRIKE_POWER = 4;   // 400%

function resolveChargeStrike(gb, actor) {
  var events = [];
  var foes = (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; });
  if (!foes.length) return events;
  var t = foes[Math.floor(gb.rng() * foes.length)];
  var dmg = Math.max(1, Math.floor(effectiveStat(actor, 'atk') * CHARGE_STRIKE_POWER - Math.floor(effectiveStat(t, 'def') / 2)));
  var sh = absorbShield(t, dmg);
  if (sh.absorbed > 0) {
    dmg = sh.dmg;
    events.push({ msg: '🛡️ ' + t.name + ' 护盾吸收 ' + sh.absorbed + (sh.broke ? '（护盾破碎）' : ''), targetId: t.id, type: 'status' });
  }
  t.hp = Math.max(0, t.hp - dmg);
  events.push({ msg: '💥 ' + (actor.name || '单位') + ' 蓄力重击 → ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
  return events;
}

/* 迷惑（幻影之瞳）三选一 —— 设计依据 doc/design-v2.0.md:229：
   ①丧失防备（防御·魂防 降低 15%~75%）
   ②不分敌我误击其他敌人（伤害 50%~95%；无其他敌人则不触发）
   ③牺牲自我（消耗自身最大生命 1%~10%）
   **三个区间都随技能等级取值**（v2.1.22 接线）：等级与区间写在技能定义上
   （pet-codex.js 的 p_phantom.range），由施法时塞进「迷惑」状态实例的 data 带过来 ——
   所以这里要读 actor 身上的 confused 实例，而不是用固定常量。 */

/* 读出本次迷惑的等级与三个分支数值（读不到就按 Lv1 = 区间下限兜底） */
function _confuseParams(actor) {
  var st = null;
  (actor.statuses || []).forEach(function (s) { if (s.id === 'confused') st = s; });
  var data = (st && st.data) || {};
  var lv = Math.max(1, Math.min(SKILL_LEVEL_MAX, Math.floor(data.level || 1)));
  var sk = (typeof SKILLS !== 'undefined' && data.skillId) ? SKILLS[data.skillId] : null;
  var R = (sk && sk.range) || {};
  var t = (lv - 1) / (SKILL_LEVEL_MAX - 1);
  function pick(key, lo, hi) {
    var r = R[key];
    if (r && r.length === 2) { lo = r[0]; hi = r[1]; }
    return lo + (hi - lo) * t;
  }
  return {
    level: lv,
    down: pick('confuseDown', 0.15, 0.75),
    hit: pick('confuseHit', 0.50, 0.95),
    self: pick('confuseSelf', 0.01, 0.10)
  };
}

function resolveConfusion(gb, actor) {
  var events = [];
  var cf = _confuseParams(actor);
  var others = (actor.side === 'ally' ? gb.enemies : gb.allies)
    .filter(function (u) { return u.hp > 0 && u.id !== actor.id; });
  var branch = Math.floor(gb.rng() * 3);
  if (branch === 1 && !others.length) branch = 2;   // 文档：无其他敌人则不触发 ② → 退到 ③

  if (branch === 0) {
    /* 幅度按等级走**实例** modsPct（confused_down 定义里不再写死 statModsPct），
       否则会与定义里的固定值叠加、变成「固定 + 等级」两份。 */
    applyStatus(actor, { id: 'confused_down', duration: 2, modsPct: { def: -cf.down, soulDef: -cf.down } });
    syncStatusDerived(actor);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 丧失防备（防御·魂防 -' + Math.round(cf.down * 100) + '%）', targetId: actor.id, type: 'status' });
  } else if (branch === 1) {
    var t = others[Math.floor(gb.rng() * others.length)];
    var dmg = Math.max(1, Math.floor(effectiveStat(actor, 'atk') * cf.hit - Math.floor(effectiveStat(t, 'def') / 2)));
    var sh = absorbShield(t, dmg);
    if (sh.absorbed > 0) dmg = sh.dmg;
    t.hp = Math.max(0, t.hp - dmg);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 敌我不分，误击 ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
  } else {
    var self = Math.max(1, Math.floor((actor.base.hp || 0) * cf.self));
    actor.hp = Math.max(0, actor.hp - self);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 牺牲自我 -' + self, targetId: actor.id, type: 'damage' });
  }
  return events;
}

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
  /* v2.1.15：潮湿「提高对其命中率 +30%」—— 设计文档写明，此前只有状态、没有命中加成 */
  if (typeof hasStatus === 'function' && hasStatus(target, 'wet')) acc += 0.30;
  /* v2.1.15：闪避拆成两处 ——
     _eva（宠物「打湿」等限时修正，由 _hitModTurns 到期归零）
     _evaPerm（技能「变小」的常驻闪避，不该被限时修正的归零逻辑清掉） */
  acc -= ((target._eva || 0) + (target._evaPerm || 0));
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
  /* v2.1.15：改用 effectiveStat —— 破甲/减速/潮湿这类状态修正此前算出来了却没人用，
     伤害公式读的一直是裸属性 base（所以 _statMods 生效了也看不出差别）。 */
  var atkVal = effectiveStat(actor, 'atk');
  var defVal = effectiveStat(target, 'def');
  var dmg = Math.max(1, atkVal - Math.floor(defVal / 2) + Math.floor(gb.rng() * 4) + 1);
  /* v2.1.14 威吓落地：talent.js 的 onBattleStart 只写了 target._intimidated = true，
     全项目没有任何地方读这个标记（等于威吓从未真正生效）。这里在伤害结算前统一削减。 */
  if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown())));
  // 天赋 hook: 利刃加成 / 多目标惩罚 / 末日减半
  var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: dmg, isPhysical: true, attacker: actor, target: target });
  td.mutations.forEach(function (m) {
    if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
    if (m.key === 'dmgDealtHalf') dmg = Math.floor(dmg / 2);
  });
  var td2 = talentDispatch(target, 'onDamage', { attacker: actor, amount: dmg, isPhysical: true, isPlayerAttack: false, isSkill: false, isAoe: false, fromPlayer: actor.side === 'ally' });
  /* v2.1.15：受击方还要走一遍**状态**钩子（此前只派发天赋）——
     一是让「广域防御」的 dmgTakenReduce 真正生效，
     二是让冰冻/睡眠的「受击解除」（status-defs / state-core 里写了却从没人调）真正生效。 */
  var sd = dispatch(target, 'onDamage', { attacker: actor, amount: dmg, isPhysical: true, isSkill: false, isAoe: false, fromPlayer: actor.side === 'ally' });
  td2.mutations = td2.mutations.concat(sd.mutations);
  sd.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: target.id, type: e.type }); });
  td2.mutations.forEach(function (m) {
    /* 反伤只打攻击者。原实现在这里顺手把 target.hp 也扣了一次，
       而下方结算又会扣一遍 —— 等于「粗糙皮肤」让受击方吃双倍伤害（v2.1.15 修）。 */
    if (m.key === 'reflectFlat') { actor.hp = Math.max(0, actor.hp - m.value); events.push({ msg: '🩸 ' + target.name + ' 粗糙皮肤 → ' + (actor.name || '攻击者') + ' 反伤 ' + m.value, targetId: actor.id, type: 'damage' }); }
    if (m.key === 'dmgTakenBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'soulDmgReduce') dmg = Math.floor(dmg * 0.7);
    if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value));   // 不动如山 / 广域防御
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
  // v2.1.15：护盾先行吸收（金身护盾此前只写字段、无人消费）
  var sh = absorbShield(target, dmg);
  if (sh.absorbed > 0) {
    dmg = sh.dmg;
    events.push({ msg: '🛡️ ' + target.name + ' 护盾吸收 ' + sh.absorbed + (sh.broke ? '（护盾破碎）' : '（剩余 ' + target._shield + '）'), targetId: target.id, type: 'status' });
  }
  target.hp = Math.max(0, target.hp - dmg);
  events.push({ msg: '⚔️ ' + (actor.name || '单位') + ' 攻击 ' + target.name + ' → ' + dmg + ' 伤害', targetId: target.id, type: 'damage' });
  /* v2.1.10 魂攻/魂防接入敌群战斗。
     此前 battle-group.js 对 soulAtk / soulDef 是零引用 —— 只有单敌 battle.js 用了，
     导致炼魂一半投入（满级 魂攻 +3770 / 魂防 +1798）在 120 关敌群里完全是废属性。
     规则与单敌一致：目标有魂防则 rollDamage(soulAtk, soulDef, 4)，无魂防则吃全额。 */
  var sAtk = effectiveStat(actor, 'soulAtk');
  if (sAtk > 0 && target.hp > 0) {
    var sDef = effectiveStat(target, 'soulDef');
    var sDmg = sDef > 0 ? Math.max(1, sAtk - Math.floor(sDef / 2) + Math.floor(gb.rng() * 4) + 1) : sAtk;
    var sh2 = absorbShield(target, sDmg);
    if (sh2.absorbed > 0) {
      sDmg = sh2.dmg;
      events.push({ msg: '🛡️ ' + target.name + ' 护盾吸收 ' + sh2.absorbed + ' 魂伤' + (sh2.broke ? '（护盾破碎）' : ''), targetId: target.id, type: 'status' });
    }
    target.hp = Math.max(0, target.hp - sDmg);
    events.push({ msg: '👻 ' + (actor.name || '单位') + ' 魂攻击 ' + target.name + ' → ' + sDmg + ' 魂伤害', targetId: target.id, type: 'damage' });
  }
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
    /* v2.1.15：把 gb.rng 传下去 —— 技能自带的概率强化（咬击 30% 概率 +25%）需要它在
       calcSkillDamage 里掷骰，用 gb.rng 而不是 Math.random 才能让战斗可复现。 */
    var dmgResult = calcSkillDamage(def, actor, targets, { rng: gb.rng });
    if (dmgResult) {
      if (dmgResult.proc) events.push({ msg: '💢 ' + (actor.name || '单位') + ' 的 ' + def.name + ' 触发强化（本次伤害 +' + Math.round((dmgResult.procMult - 1) * 100) + '%）', targetId: targets.length ? targets[0].id : null, type: 'talent' });
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
          // v2.1.14 威吓：被威吓者的技能伤害同样削减（此前只标记不生效）
          if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown())));
          td.mutations.forEach(function (m) { if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value)); });
          // v2.1.13：目标侧减伤词条（伤害减免 / 抗扩散 / 抗技法）。
          // 此前技能伤害只派发攻击方，导致减伤类词条对技能完全无效。
          var tdg = talentDispatch(t, 'onDamage', { isPlayerAttack: false, amount: dmg, isPhysical: h.dmgType === 'physical', attacker: actor, target: t, isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          /* v2.1.15：受击方状态钩子（广域防御减伤 / 冰冻·睡眠的受击解除） */
          var sdg = dispatch(t, 'onDamage', { attacker: actor, amount: dmg, isPhysical: h.dmgType === 'physical', isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          tdg.mutations = tdg.mutations.concat(sdg.mutations);
          sdg.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: t.id, type: e.type }); });
          tdg.mutations.forEach(function (m) { if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value)); });
          // 天赋暴击（斗者本能）
          var tc2 = talentCrit(actor);
          if (tc2.chance > 0 && gb.rng() < tc2.chance) { dmg = Math.floor(dmg * tc2.mult); events.push({ msg: '💥 ' + (actor.name || '') + ' 暴击！×' + tc2.mult }); }
          // 圣光守护：队友分担
          dmg = applyAllyDamageShare(gb, t, dmg, events);
          // v2.1.15：护盾吸收
          var shk = absorbShield(t, dmg);
          if (shk.absorbed > 0) {
            dmg = shk.dmg;
            events.push({ msg: '🛡️ ' + t.name + ' 护盾吸收 ' + shk.absorbed + (shk.broke ? '（护盾破碎）' : '（剩余 ' + t._shield + '）'), targetId: t.id, type: 'status' });
          }
          t.hp = Math.max(0, t.hp - dmg);
          events.push({ msg: '⚡ ' + (actor.name || '') + ' ' + def.name + ' → ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
          // 蓄力重击：蓄力状态
          /* v2.1.21：蓄力重击的结算已移出 castSkill ——
             本技能现在只负责「进入蓄力」（由 skill.js 的 effects 施加 charging 状态），
             400% 重击改在 groupUnitTurn 的回合开始处结算（resolveChargeStrike），
             时点与设计文档 doc/design-v2.0.md:101-105 的「下回合结算」一致。 */
        }
      });
    }
  }

  // 效果（状态/治疗/增益）
  // v2.1.14：把当前回合喂给技能效果（skill.js 的「嘲讽」需要它记录失效时点）
  // v2.1.15：再带上 units —— 「清除迷雾」要作用全场，而 selectTargets('all') 只给对侧
  var fx = applySkillEffects(def, actor, targets, { turn: gb.turn + 1, units: gb.units, gb: gb });
  fx.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  fx.statusApps.forEach(function (sa) {
    var t = gb.units.find(function (u) { return u.id === sa.unitId; });
    if (t && t.hp > 0) {
      var grade = sa.grade || 1;
      /* v2.1.15：金身护盾的「护盾期免疫普通+高级负面」。
         此前 _shieldImmune 只置位、无消费方 → 开战护盾既不挡伤害也不免负面。 */
      if (t._shieldImmune && t._shield > 0 && grade <= 2) {
        events.push({ msg: '🛡️ ' + t.name + ' 受护盾庇护，免疫【' + getStatusName(sa.id) + '】（剩余 ' + t._shield + '）', targetId: t.id, type: 'status' });
        return;
      }
      // 朴实：免疫状态；不动如山：满血免疫普通~高级
      var selfGuard = talentDispatch(t, 'onBeforeStatus', { statusId: sa.id, grade: grade });
      // 阵营光环守卫（凛冬之核：我方全体免疫冰冻）
      var mates = (t.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) { return u.hp > 0; });
      var auraGuard = talentAura(mates, 'onAllyStatus', { statusId: sa.id, grade: grade, target: t });
      if (!selfGuard.skipAction && !auraGuard.skipAction) {
        // v2.1.14：区分「施加 / 刷新 / 叠层」，并去掉日志里外泄的英文状态 id（如 (poison)）
        var ar = applyStatus(t, { id: sa.id, duration: sa.duration, source: actor });
        syncStatusDerived(t);   // v2.1.15：状态变了就重算 _statMods，否则减速/破甲不生效
        var verb = ar.refreshed ? '刷新' : '施加';
        var extra = '';
        if (ar.refreshed && sa.duration) extra = '（延续 ≥' + sa.duration + ' 回合）';
        else if (sa.duration) extra = '（' + sa.duration + ' 回合）';
        if (Array.isArray(ar.events)) {
          for (var qi = 0; qi < ar.events.length; qi++) {
            if (ar.events[qi] && ar.events[qi].type === 'stack' && ar.events[qi].stacks) extra = '（叠至 ' + ar.events[qi].stacks + ' 层）';
          }
        }
        events.push({ msg: '🌀 ' + actor.name + ' → ' + t.name + ' ' + verb + '【' + getStatusName(sa.id) + '】' + extra, targetId: t.id, type: 'status' });
      } else {
        var blocked = selfGuard.events.concat(auraGuard.events);
        var bmsg = '';
        for (var bi = 0; bi < blocked.length; bi++) { if (blocked[bi] && blocked[bi].msg) { bmsg = blocked[bi].msg; break; } }
        events.push({ msg: bmsg || ('🛡️ ' + t.name + ' 免疫【' + getStatusName(sa.id) + '】'), targetId: t.id, type: 'status' });
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
        events.push({ msg: '💚 ' + actor.name + ' → ' + t.name + ' 治疗 +' + amount, targetId: t.id, type: 'heal' });
      } else events.push({ msg: '🌑 ' + t.name + ' 被末日阻断治疗', targetId: t.id, type: 'status' });
    }
  });
  /* v2.1.15：buff 真正落地。
     改前两处问题：① 只把 b.value 累加进 t._dmgReduce，而伤害结算从不读该字段（减伤不生效）；
     ② 只处理 b.all，按单位下发的 buff（「强攻」的 atkBoost）被直接丢弃。
     现在按 key 映射到状态：有 duration、可被驱散、能进详情页。 */
  fx.buffs.forEach(function (b) {
    var recv = b.all
      ? (actor.side === 'ally' ? gb.allies : gb.enemies)
      : gb.units.filter(function (u) { return u.id === b.unitId; });
    var dur = b.duration || 3;
    var applied = [];
    recv.forEach(function (t) {
      if (!t || t.hp <= 0) return;
      if (b.key === 'dmgReduce') applyStatus(t, { id: 'wideguard', duration: dur });
      else if (b.key === 'atkBoost') applyStatus(t, { id: 'atkup', duration: dur, modsPct: { atk: b.value } });
      else return;
      syncStatusDerived(t);
      applied.push(t.name);
    });
    if (!applied.length) return;
    var label = (b.key === 'dmgReduce') ? ('受到伤害 -' + Math.round(b.value * 100) + '%')
      : (b.key === 'atkBoost') ? ('攻击 +' + Math.round(b.value * 100) + '%')
        : ('增益 +' + Math.round(b.value * 100) + '%');
    events.push({ msg: '🛡️ ' + actor.name + ' ' + def.name + ' → ' + applied.join('、') + ' ' + label + '（' + dur + ' 回合）', type: 'buff' });
  });

  // 遗言：自身阵亡
  if (skillId === 'lastword') {
    actor.hp = 0;
    events.push({ msg: '💀 ' + actor.name + ' 遗言：自我牺牲阵亡', targetId: actor.id, type: 'status' });
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

  /* v2.1.14 嘲讽复位。此前 player-skill-hooks.js / skill.js 只把 _taunting 置 true，
     全项目没有一处置回 false —— 后果有两个：
       1) selectTargets 永远把敌方攻击吸到嘲讽者身上（永久嘲讽）；
       2) unitInitiative 里 `if (u._taunting) spd *= 2` 永久生效（永久 2 倍速）。
     语义修正：嘲讽从施加起持续到「本单位下一次行动开始」，
     刚好覆盖本轮剩余出手 + 到本单位下轮出手之前。 */
  if (actor._taunting && actor._tauntMark !== turn) {
    actor._taunting = false;
    actor._tauntMark = null;
  }

  // 玩家技能回合开始（气势如虹/气力恢复）
  if (actor.side === 'ally' && typeof playerSkillTurnStart === 'function') {
    var ps = playerSkillTurnStart(gb, actor, turn);
    ps.forEach(function (e) { events.push({ msg: e.msg }); });
  }
  // 天赋 onTurnStart
  var ts = talentDispatch(actor, 'onTurnStart', { turn: turn, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies });
  ts.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });

  // 状态 onTurnStart（哈欠→睡眠等）
  var ss = dispatch(actor, 'onTurnStart', { turn: turn });
  ss.events.forEach(function (e) { events.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });

  // 慢启动/懒惰/冰冻/畏缩 → skipAction
  var before = dispatch(actor, 'onBeforeAction', { turn: turn });
  var tBefore = talentDispatch(actor, 'onBeforeAction', { turn: turn });
  if (before.skipAction || tBefore.skipAction) {
    // v2.1.14：原日志只有「XX 无法行动」，玩家看不出到底是冰冻、畏缩还是慢启动。
    // 现在把触发源的文案（冰冻/畏缩/睡眠/慢启动/懒惰…）拼进括号。
    var why = skipReasonText((tBefore.events || []).concat(before.events || []));
    events.push({ msg: '🚫 ' + (actor.name || '单位') + ' 无法行动' + (why ? '（' + why + '）' : ''), targetId: actor.id, type: 'skip' });
    /* v2.1.15：即使这回合没行动，状态 duration 也必须递减 ——
       否则「跳过行动」这条早退分支永远走不到回合末的 ageStatuses，
       冰冻/睡眠会重新变成永久锁定（修好一个坑又掉进同一个坑）。 */
    var agedSkip = ageStatuses(actor);
    agedSkip.forEach(function (e) { events.push({ msg: e.msg, targetId: e.unitId, type: e.type }); });
    if (agedSkip.length) syncStatusDerived(actor);
    return events;
  }

  /* ---- v2.1.21：两种情况会「替代」本回合的正常行动 ---- */
  var acted = false;

  /* 蓄力重击结算：时点对齐设计文档（本回合蓄力 → 下回合结算 400%） */
  if (actor._chargeReady) {
    actor._chargeReady = false;
    events = events.concat(resolveChargeStrike(gb, actor));
    acted = true;
  }

  /* 迷惑（幻影之瞳）：随机执行三选一，而不是按自己的意志行动 */
  if (!acted && hasStatus(actor, 'confused')) {
    events = events.concat(resolveConfusion(gb, actor));
    acted = true;
  }

  // 选择行动：敌人用 AI 策略，玩家用随机/技能
  var skillId, actTarget;
  if (!acted) {
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
  }
  if (!acted && skillId) {
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
    pe.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  }
  // 天赋 onAfterAction / onTurnEnd
  var ae = talentDispatch(actor, 'onAfterAction', {});
  ae.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  var te = talentDispatch(actor, 'onTurnEnd', { turn: turn, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies });
  te.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  var se = dispatch(actor, 'onTurnEnd', { turn: turn });
  se.events.forEach(function (e) { events.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });

  /* v2.1.15：回合末状态递减 —— 状态生命周期的关键一步，此前完全缺失
     （ageStatuses 的角色原本由 tickStatuses 承担，而后者全项目零调用）。
     放在 onTurnEnd 钩子之后，duration=N 的持续伤害类状态刚好结算 N 次。
     修好之前：中毒/减速/破甲 挂上就是整场，冰冻/睡眠 更是因为「受击解除」也没接线
     导致该单位整场无法行动。 */
  var aged = ageStatuses(actor);
  aged.forEach(function (e) { events.push({ msg: e.msg, targetId: e.unitId, type: e.type, reason: e.reason }); });
  if (aged.length) syncStatusDerived(actor);

  // 技能冷却递减
  tickSkillCooldowns(actor);

  // 命中/闪避修正倒计时（闪耀 / 打湿）
  if (actor._hitModTurns > 0) {
    actor._hitModTurns--;
    if (actor._hitModTurns === 0) { actor._accMod = 0; actor._eva = 0; }
  }

  return events;
}

/* v2.1.14：场地事件此前只 push 进 gb.events，而 UI 只读 gb.log
   —— 导致 g3 起每个大关的主题场地（沙暴/雪天/酷暑/雨天/反转/毒气）
   造成的伤害与状态在战斗日志中完全不可见。统一由此函数落日志。 */
function logTerrainEvents(gb, evts) {
  if (!evts || !evts.length) return;
  var label = (gb.terrain && gb.terrain.name) ? ('场地·' + gb.terrain.name) : '场地';
  gb.log.push({
    turn: gb.turn,
    unit: label,
    terrain: true,
    events: evts.map(function (e) {
      return { msg: e.msg, targetId: e.targetId, type: e.type || 'terrain' };
    })
  });
}

/* v2.1.14：开战（回合 0）天赋钩子派发。
   此前 talent.js 的「威吓」注册在 onBattleStart 上，但全项目没有任何地方派发过这个 hook
   —— 结果不是「日志没写清威吓了谁」，而是威吓事件根本没发生过。
   这里对双方各派发一次，并把事件写进 gb.log（UI 只读 gb.log）。 */
function dispatchBattleStartTalents(gb) {
  var rA = talentAura(gb.allies, 'onBattleStart', { allyUnits: gb.allies, enemyUnits: gb.enemies });
  var rE = talentAura(gb.enemies, 'onBattleStart', { allyUnits: gb.enemies, enemyUnits: gb.allies });
  var evts = rA.events.concat(rE.events).filter(function (e) { return e && e.msg; });
  if (!evts.length) return evts;
  gb.events = gb.events.concat(evts);
  gb.log.push({
    turn: 0,
    unit: '开场',
    opening: true,
    events: evts.map(function (e) {
      return { msg: e.msg, targetId: e.targetId, type: e.type || 'talent', talentId: e.talentId };
    })
  });
  return evts;
}

/* 一个完整回合（所有存活单位按行动队列行动一次） */
function groupBattleTick(gb) {
  if (gb.done) return;
  if (gb.turn === 0) dispatchBattleStartTalents(gb);
  if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
    var player = gb.allies.find(function(u){ return u._playerSkills; });
    if (player) {
      var evs = playerSkillBattleStart(gb, player);
      evs.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:player.name, events:[e]}); });
    }
  }
  gb.turn++;
  // v2.1.13 场地：回合开始结算
  if (gb.terrain && gb.terrain.onTurnStart) {
    var ts3 = gb.terrain.onTurnStart(gb);
    if (ts3 && ts3.events) { gb.events = gb.events.concat(ts3.events); logTerrainEvents(gb, ts3.events); }
  }
  // v2.1.15：建队列前先统一重算属性修正，否则「减速」影响不到出手顺序
  refreshAllStatMods(gb.units);
  var queue = buildActionQueue(gb);
  queue.forEach(function (u) {
    if (gb.done) return;
    if (u.hp <= 0) return;
    var evts = groupUnitTurn(gb, u);
    // v2.1.13 天赋「疾影」：本回合额外行动 1 次
    var exRes2 = talentDispatch(u, 'onAfterAction', { turn: gb.turn });
    var wantExtra2 = false;
    exRes2.mutations.forEach(function (m) { if (m.key === 'extraAction') wantExtra2 = true; });
    exRes2.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
    if (wantExtra2 && !gb.done && u.hp > 0
        && (u.side === 'ally' ? gb.enemies : gb.allies).some(function (a) { return a.hp > 0; })) {
      evts = evts.concat(groupUnitTurn(gb, u));
    }
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
    if (te && te.events) { gb.events = gb.events.concat(te.events); logTerrainEvents(gb, te.events); }
  }
}

/* 单步执行：一次只行动一个单位（用于逐个行动动画，速度优先级可见）
   返回 { unit: 行动单位, events, done, winner, queueIndex, queue } */
function groupBattleStep(gb) {
  if (gb.done) return { done: true };
  // 初始化队列（跨步保存）
  if (!gb._stepQueue || gb._stepQueue.length === 0) {
    // 开战钩子（威吓等天赋）
    if (gb.turn === 0) dispatchBattleStartTalents(gb);
    // 开战钩子（金身）
    if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
      var p0 = gb.allies.find(function(u){ return u._playerSkills; });
      if (p0) {
        var evs0 = playerSkillBattleStart(gb, p0);
        evs0.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:p0.name, events:[e]}); });
      }
    }
    gb.turn++;
    // v2.1.15：建队列前先统一重算属性修正，否则「减速」影响不到出手顺序
    refreshAllStatMods(gb.units);
    gb._stepQueue = buildActionQueue(gb);
    gb._stepIdx = 0;
    // v2.1.13 场地：回合开始结算（此前只接线了 onTurnEnd，开场类场地不生效）
    if (gb.terrain && gb.terrain.onTurnStart) {
      var ts2 = gb.terrain.onTurnStart(gb);
      if (ts2 && ts2.events) { gb.events = gb.events.concat(ts2.events); logTerrainEvents(gb, ts2.events); }
    }
  }
  // 跳过死亡单位
  while (gb._stepIdx < gb._stepQueue.length && gb._stepQueue[gb._stepIdx].hp <= 0) gb._stepIdx++;
  if (gb._stepIdx >= gb._stepQueue.length) {
    // 本回合结束：场地结算 + 重置队列
    if (gb.terrain && gb.terrain.onTurnEnd) {
      var te = gb.terrain.onTurnEnd(gb);
      if (te && te.events) { gb.events = gb.events.concat(te.events); logTerrainEvents(gb, te.events); }
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
  // v2.1.13 天赋「疾影」：本回合额外行动 1 次
  var exRes = talentDispatch(actor, 'onAfterAction', { turn: gb.turn });
  var wantExtra = false;
  exRes.mutations.forEach(function (m) { if (m.key === 'extraAction') wantExtra = true; });
  exRes.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  if (wantExtra && !gb.done && actor.hp > 0
      && (actor.side === 'ally' ? gb.enemies : gb.allies).some(function (u) { return u.hp > 0; })) {
    evts = evts.concat(groupUnitTurn(gb, actor));
  }
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

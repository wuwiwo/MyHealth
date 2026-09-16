/* ============================================
   MyHealth — Enemy Skills (M2b-2)
   技能注册表。数据驱动：技能 = {type, target, power, dmgType, cooldown, priority, status?, effects}。
   纯逻辑，无 DOM/store。依赖 unit.js（counter 冷却）、state-core.js（状态附加）。
   施放效果以数据返回，由 battle 行动队列执行。
   ============================================ */

var SKILLS = {};   // id → skill def

/* registerSkill(def)
   def: { id, name, type:'attack'|'support',
          target:'random1'|'all'|'self'|'ally1'|'enemy1',
          power?, dmgType?('physical'|'soul'), cooldown, priority(先制度),
          status?{id,duration,chance,grade}, effects?[function(caster,targets,ctx)] } */
function registerSkill(def) {
  if (!def || !def.id) throw new Error('registerSkill: id required');
  SKILLS[def.id] = def;
  return def;
}

function getSkill(id) { return SKILLS[id] || null; }

/* 冷却管理（存 unit.counters.cd[skillId] = 剩余回合） */
function skillOnCooldown(unit, skillId) {
  return !!(unit.counters && unit.counters.cd && unit.counters.cd[skillId] > 0);
}
function skillCooldownLeft(unit, skillId) {
  return (unit.counters && unit.counters.cd && unit.counters.cd[skillId]) || 0;
}
function setSkillCooldown(unit, skillId, rounds) {
  unit.counters = unit.counters || {};
  unit.counters.cd = unit.counters.cd || {};
  unit.counters.cd[skillId] = rounds;
}
function tickSkillCooldowns(unit) {
  if (!unit.counters || !unit.counters.cd) return;
  for (var k in unit.counters.cd) {
    if (unit.counters.cd[k] > 0) unit.counters.cd[k]--;
  }
}

/* 可用技能：不在冷却且未附身（幽魂附身禁技） */
function usableSkills(unit) {
  if (unit._possessed) return [];   // 幽魂附身：技能不可用
  return (unit.skills || []).filter(function (id) {
    return SKILLS[id] && !skillOnCooldown(unit, id);
  });
}

/* 选择要施放的技能（battle 行动队列调用）：优先低冷却就绪，随机选 */
function pickSkill(unit) {
  var usable = usableSkills(unit);
  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

/* ============ v2.1.22：技能等级（此前完全没接进战斗） ============
   设计文档把「随等级成长」的数值写成 `A%~B%` 区间 —— 例如宠物技能
   「火焰啄击 攻击×150%~330%」「歌唱 魂攻×160%~250%」、敌群技能「蓄力承伤 +20%~35%」。
   **区间两端就是「等级低 → 满级」的取值。**

   等级来源：
     · 宠物：`pet.skillLevels[skillId]`（0~Lv10，灵能升级，见 pet-materials.js 的 PET_SKILL_MAX_LEVEL）
     · 敌人：`unit.level`（enemy.js 的 level 字段，由 group-levels 按大关给定）

   ⚠️ 修之前的状态：**技能等级对战斗数值零影响** ——
   宠物 `skillLevels` 只有 UI 与升级逻辑在读，`calcSkillDamage` 与各技能效果一律用固定值；
   敌人 `unit.level` 恒为 1（没有任何调用方传值）。

   ⚠️ 成长曲线：design-v2.0.md §2.6 说「数值区间 = 随基础属性成长的下限~上限」，
   且标注 `OQ-8（技能倍率随炼化等级的成长曲线公式仍待定）`。
   本版采用**按技能等级线性插值**（Lv1→下限，Lv10→上限）作为占位实现；
   OQ-8 定案后只需替换 skillValue 里的插值公式，数据结构不用动。 */
var SKILL_LEVEL_MAX = 10;
/* 宠物炼化等级上限（design-v2.0.md:163 §2.4）：稀有度 R50 / SR60 / SSR80 / UR100 */
var PET_REFINE_CAP = { R: 50, SR: 60, SSR: 80, UR: 100 };

/* 区间进度 t ∈ [0,1]：0 = 区间**下端**，1 = 区间**上端**。
   ⚠️ 驱动源是「基础属性成长」，**不是技能等级** —— design-v2.0.md:187 原文：
     「数值区间 = 随**基础属性**成长的下限~上限；属性来源见 §2.9 初始属性倾向与 §2.8 宠物炼化」
   宠物的基础属性成长线是**炼化**（§2.8，消耗普通/高级炼化石；上限按稀有度 R50/SR60/SSR80/UR100），
   所以 t = 当前炼化等级 / 该稀有度上限。
   敌人没有炼化 → 退回 unit.level（1~10，由 group-levels 按大关给定）。
   ⚠️ OQ-8（design-v2.0.md:383）标注「技能倍率随炼化等级的成长曲线公式**仍待定**」——
      本函数先用**线性**占位。曲线定案后**只需改这一个函数**，数据结构与所有调用点都不用动。 */
function skillRangeT(unit) {
  if (!unit) return 0;
  var cap = PET_REFINE_CAP[(unit.tags || [])[1]];
  if (cap) {
    var rl = unit._refineLevel || 0;
    return Math.max(0, Math.min(1, rl / cap));
  }
  var lv = Math.max(1, Math.min(SKILL_LEVEL_MAX, Math.floor(unit.level || 1)));
  return (lv - 1) / (SKILL_LEVEL_MAX - 1);
}

/* 技能等级（0~10）：**仅用于展示与说明，不再驱动区间**（区间看 skillRangeT）。
   保留它是为了以后 OQ-8 若决定「灵能与炼化共同影响」时有个现成的读数口。 */
function skillLevelOf(unit, skillId) {
  if (!unit) return 1;
  if (unit._skillLevels && skillId && unit._skillLevels[skillId]) {
    return Math.max(1, Math.min(SKILL_LEVEL_MAX, Math.floor(unit._skillLevels[skillId])));
  }
  var lv = unit.level || 1;
  return Math.max(1, Math.min(SKILL_LEVEL_MAX, Math.floor(lv)));
}

/* 按区间进度取技能数值：
   skill.range[key] = [低, 高] → 按 t 线性插值；没有区间的键（文档只给单一「默认：X%」）原样返回。
   @param t 区间进度 0~1（由 skillRangeT(unit) 算出） */
function skillValue(skill, key, t) {
  if (!skill) return undefined;
  var r = skill.range ? skill.range[key] : null;
  if (r && r.length === 2) {
    var k = Math.max(0, Math.min(1, t || 0));
    return r[0] + (r[1] - r[0]) * k;
  }
  return skill[key];
}

/* 计算技能伤害（返回给 battle 应用）：
   攻击类：power% × 攻击/魂攻
   v2.1.15 三处接线：
     · 属性改走 effectiveStat —— 破甲 / 潮湿 / 攻击提升 这些状态修正此前"算了没人用"
     · skill.stackPower：叠层加成（雪球：每层 +30%，6 层 = 300%，与设计文档一致）
     · skill.procBoost：概率强化（咬击：30% 概率本次伤害 +25%）
   返回 {type:'damage', hits:[], proc?, procMult?} */
function calcSkillDamage(skill, caster, targets, ctx) {
  if (!skill || skill.type !== 'attack') return null;
  ctx = ctx || {};
  var atk = skill.dmgType === 'soul' ? effectiveStat(caster, 'soulAtk') : effectiveStat(caster, 'atk');
  /* v2.1.22：威力按「基础属性成长进度」取区间值（驱动源见 skillRangeT 的注释） */
  var power = skillValue(skill, 'power', skillRangeT(caster)) || 1;
  /* 叠层加成按「百分点」累加，不是乘法：雪球设计写的是
     120% → 每层 +30% → 满层 300%（120 + 6×30），乘法会得到 120×1.3^6 ≈ 579%。
     caster[key] 是**本次施放前**已累计的层数，所以首次施放 n=0 → 保持 120%。 */
  if (skill.stackPower) {
    var n = Math.max(0, caster[skill.stackPower.key] || 0);
    power += n * (skill.stackPower.perPoints || 0);
  }
  var mult = 1;
  var proc = false;
  if (skill.procBoost) {
    var roll = (typeof ctx.rng === 'function') ? ctx.rng() : Math.random();
    if (roll < skill.procBoost.chance) { mult *= (1 + skill.procBoost.value); proc = true; }
  }
  var base = Math.floor(atk * power / 100 * mult);
  var out = [];
  function hitOne(t) {
    var def = effectiveStat(t, 'def');
    var sdef = effectiveStat(t, 'soulDef');
    var dmg;
    if (skill.dmgType === 'soul') {
      dmg = sdef > 0 ? Math.max(1, base - Math.floor(sdef / 2)) : base;
    } else {
      dmg = Math.max(1, base - Math.floor(def / 2));
    }
    if (skill.ignoreDef) dmg = base;
    out.push({ targetId: t.id, amount: dmg, dmgType: skill.dmgType || 'physical' });
  }
  /* v2.1.24：多段攻击。
     skill.multiHit = N（无影拳：总计 5 次）→ 打 N 次、**目标随机且可重复**
     （设计 design-v2.0.md:249「总计 5 次攻击，每次视为普通攻击，目标随机可重复」）。
     随机池由 castSkill 经 ctx.pool 传进来 —— selectTargets('random1') 只返回 1 个目标，
     拿不到「随机可重复」需要的整套候选。
     此前无影拳只有 1 次命中（power 单发），日志却写「×5」。 */
  if (skill.multiHit) {
    var pool = (ctx.pool && ctx.pool.length) ? ctx.pool : targets;
    for (var hi = 0; hi < skill.multiHit && pool.length; hi++) {
      var pk = (typeof ctx.rng === 'function') ? ctx.rng() : Math.random();
      hitOne(pool[Math.floor(pk * pool.length)]);
    }
  } else {
    targets.forEach(hitOne);
  }
  var res = { type: 'damage', hits: out };
  if (proc) { res.proc = true; res.procMult = 1 + skill.procBoost.value; }
  return res;
}

/* 技能施放后的效果数据（状态附加/增益/治疗等），battle 应用
   返回 {events:[], statusApps:[{unitId,id,duration,chance}], heals:[], buffs:[]} */
function applySkillEffects(skill, caster, targets, ctx) {
  var r = { events: [], statusApps: [], heals: [], buffs: [] };
  if (!skill || !skill.effects) return r;
  /* v2.1.22：把「区间取值」透传给效果层。
     治疗量 / 状态幅度 / 增益幅度这些走 heals / statusApps / buffs 通道的效果，
     以前在回调里拿不到任何成长信息，只能写死固定值（于是「区间」对它们形同不存在）。
     现在效果里可以直接 ctx.sv('power') 拿到按基础属性成长换算后的数值。 */
  ctx = ctx || {};
  ctx.t = skillRangeT(caster);
  ctx.sv = function (key) { return skillValue(skill, key, ctx.t); };
  skill.effects.forEach(function (fx) {
    fx(caster, targets, r, ctx);
  });
  return r;
}

/* --- 25 技能注册 --- */

/* 攻击类 */
registerSkill({ id: 'charge', name: '冲撞', type: 'attack', target: 'random1', power: 200, dmgType: 'physical', cooldown: 2 });
registerSkill({
  id: 'bite', name: '咬击', type: 'attack', target: 'random1', power: 180, dmgType: 'physical', cooldown: 2,
  /* v2.1.15：设计文档里的「30% 概率本次伤害 +25%」真正实装。
     此前写在 effects 里是行不通的 —— applySkillEffects 在伤害结算**之后**才执行，
     没法回改本次伤害，所以那句文案一直是空头承诺。
     现在改由 calcSkillDamage 在算伤害时掷骰（走 gb.rng，保证战斗可复现）。 */
  procBoost: { chance: 0.3, value: 0.25 }
});
registerSkill({
  id: 'surprise', name: '击掌奇袭', type: 'attack', target: 'random1', power: 190, dmgType: 'physical', cooldown: 4, priority: 1,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      if (!t._flinched) {  // 每场最多1次
        if (Math.random() < 0.5) {
          r.statusApps.push({ unitId: t.id, id: 'flinch', duration: 1, chance: 1, grade: 2 });
          t._flinched = true;
        }
      }
    });
  }]
});
registerSkill({
  id: 'blackmist', name: '黑气', type: 'support', target: 'random1', cooldown: 4,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      if (Math.random() < 0.65) {  // 命中 50-80%
        r.statusApps.push({ unitId: t.id, id: 'poison', duration: 4, chance: 1, grade: 2, bossHalf: true });
      }
    });
  }]
});
registerSkill({
  id: 'spikes', name: '地刺', type: 'attack', target: 'all', power: 120, dmgType: 'physical', cooldown: 3,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      if (Math.random() < 0.4) r.statusApps.push({ unitId: t.id, id: 'slow', duration: 2, chance: 1, grade: 1 });
    });
  }]
});
registerSkill({
  id: 'blizzard', name: '暴风雪', type: 'attack', target: 'all', power: 150, dmgType: 'soul', cooldown: 4,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      if (Math.random() < 0.4) r.statusApps.push({ unitId: t.id, id: 'freeze', duration: 1 + Math.floor(Math.random() * 2), chance: 1, grade: 2 });
    });
  }]
});
registerSkill({
  id: 'snowball', name: '雪球', type: 'attack', target: 'random1', power: 120, dmgType: 'soul', cooldown: 2,
  /* v2.1.15：层数真正加成伤害（此前只累计并打日志，伤害恒定 120%）。
     设计文档：初始 120%，每次发动 +30%，满 6 层 300%（= 120 + 6×30）。 */
  stackPower: { key: '_snowStacks', perPoints: 30 },
  effects: [function (c, ts, r) {
    // 每次发动下次提升 30%，最大叠加 6 次（300%）
    c._snowStacks = (c._snowStacks || 0) + 1;
    if (c._snowStacks > 6) c._snowStacks = 6;
    r.events.push({ msg: '❄️ ' + (c.name || '单位') + ' 雪球：蓄力层数 ' + c._snowStacks + '/6（下次威力 ' + (120 + c._snowStacks * 30) + '%）' });
  }]
});
registerSkill({
  id: 'deepfreeze', name: '冰冻三尺', type: 'support', target: 'random1', cooldown: 5, priority: 1,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'freeze', duration: 2, chance: 1, grade: 2 });
    });
  }]
});
registerSkill({
  /* v2.1.21：改为「辅助类 · 自身」—— 本技能只负责进入蓄力，
     400% 重击由 battle-group 在**本单位下回合开始时**结算（resolveChargeStrike）。
     改前是 attack/random1/power:400：当回合就先打 400%、下回合再追加一次，
     与设计文档 doc/design-v2.0.md:101-105 的「本回合蓄力 → 下回合结算 400%」不符。 */
  id: 'chargeup', name: '蓄力重击', type: 'support', target: 'self', cooldown: 3,
  effects: [function (c, ts, r) {
    applyStatus(c, { id: 'charging', duration: 1 });
    if (typeof syncStatusDerived === 'function') syncStatusDerived(c);
    r.events.push({ msg: '🔋 ' + (c.name || '单位') + ' 蓄力重击：进入蓄力（承伤 +25%，下回合结算 攻击×400%）' });
  }]
});
registerSkill({
  id: 'armorbreak', name: '破甲重击', type: 'attack', target: 'random1', power: 170, dmgType: 'physical', cooldown: 3,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'armorbroken', duration: 3, chance: 1, grade: 1, maxStacks: 6 });
    });
  }]
});
registerSkill({
  id: 'stardust', name: '星辰坠落', type: 'attack', target: 'all', power: 200, dmgType: 'soul', cooldown: 5,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      if (Math.random() < 0.2) r.statusApps.push({ unitId: t.id, id: 'souldown', duration: 2, chance: 1, grade: 1 });
    });
  }]
});

/* 辅助类 */
registerSkill({
  id: 'shrink', name: '变小', type: 'support', target: 'self', cooldown: 2,
  effects: [function (c, ts, r) {
    /* v2.1.15：闪避真正生效。此前累加的是 _dodge，而 groupHitChance 读的是 _eva —— 白写。
       这里用 _evaPerm（常驻闪避）而不是 _eva（限时闪避），
       否则会被 groupUnitTurn 里「_hitModTurns 到期 → _eva 归零」顺手清掉。 */
    c._evaPerm = Math.min(0.5, (c._evaPerm || 0) + 0.10);
    r.events.push({ msg: '💨 ' + (c.name || '单位') + ' 变小：闪避 +' + Math.round(c._evaPerm * 100) + '%（上限 50%）' });
  }]
});
registerSkill({
  id: 'yawn', name: '哈欠', type: 'support', target: 'random1', cooldown: 3,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'sleepy', duration: 1, chance: 0.55, grade: 1 });  // 下回合 55% 睡眠
    });
  }]
});
registerSkill({
  id: 'drench', name: '打湿', type: 'support', target: 'random1', cooldown: 4,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'wet', duration: 2, chance: 1, grade: 2 });
    });
  }]
});
registerSkill({
  id: 'possess', name: '幽魂附身', type: 'support', target: 'random1', cooldown: 4, priority: 1,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'possessed', duration: 1, chance: 1, grade: 2 });
    });
  }]
});
/* v2.1.14：嘲讽必须带「失效时点」。此前只置 _taunting=true 从不清除，
   导致该单位永久吸火、且 unitInitiative 里 spd×2 永久生效。
   _tauntMark 记录施加时所在回合，battle-group 在单位下一次行动开始时清除。 */
registerSkill({
  id: 'taunt', name: '嘲讽', type: 'support', target: 'self', cooldown: 2,
  effects: [function (c, ts, r, ctx) {
    c._taunting = true;
    c._tauntMark = (ctx && ctx.turn) || 0;
    r.events.push({ msg: '🎯 ' + (c.name || '单位') + ' 嘲讽：吸引敌方攻击 1 回合' });
  }]
});
registerSkill({
  id: 'doom', name: '末日', type: 'support', target: 'random1', cooldown: 7,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'doomed', duration: 4, chance: 1, grade: 3 });
    });
  }]
});
registerSkill({
  id: 'drainbuff', name: '摄取', type: 'support', target: 'random1', cooldown: 4,
  effects: [function (c, ts, r) {
    /* v2.1.15：真正窃取增益（此前只 push 一句文案，什么都没发生）。
       目标身上每个增益状态的时长减半，被削掉的攻击加成折算给自身（3 回合）。
       简化说明：设计文档的「自身提升降低的效果」按攻击加成口径折算，
       其他属性（防/魂防）的增益只做时长减半、不折算 —— 避免一个技能同时改四项属性。 */
    var t = ts && ts[0];
    if (!t) return;
    var drained = 0, names = [];
    (t.statuses || []).slice().forEach(function (st) {
      if (typeof isPositiveStatus !== 'function' || !isPositiveStatus(st.id)) return;
      var def = (typeof getStatusDef === 'function') ? getStatusDef(st.id) : null;
      st.duration = Math.max(1, Math.floor((st.duration || 1) / 2));
      names.push((def && def.name) || st.id);
      var n = Math.max(1, st.stacks || 1);
      if (def && def.statModsPct && def.statModsPct.atk) drained += def.statModsPct.atk * n;
      if (st.modsPct && st.modsPct.atk) drained += st.modsPct.atk * n;
    });
    if (typeof syncStatusDerived === 'function') syncStatusDerived(t);
    if (drained > 0) {
      applyStatus(c, { id: 'atkup', duration: 3, modsPct: { atk: drained } });
      if (typeof syncStatusDerived === 'function') syncStatusDerived(c);
    }
    r.events.push({ msg: '🩸 ' + (c.name || '单位') + ' 摄取 → ' + t.name + '：' +
      (names.length
        ? ('增益时长减半【' + names.join('、') + '】' + (drained > 0 ? ('，自身攻击 +' + Math.round(drained * 100) + '% 3 回合') : '（无可折算的攻击加成）'))
        : '目标身上没有增益') });
  }]
});
registerSkill({
  id: 'bulwark', name: '广域防御', type: 'support', target: 'all', cooldown: 6,
  effects: [function (c, ts, r) {
    r.buffs.push({ all: true, key: 'dmgReduce', value: 0.2, duration: 3 });
  }]
});
registerSkill({
  id: 'cleanse', name: '净化', type: 'support', target: 'ally1', cooldown: 3,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      /* v2.1.15：真正解除普通~高级负面（此前只 push 一句文案 + 治疗）。
         特级（grade 3：末日 / 遗言诅咒）按设计不解除。 */
      var freed = (typeof cleanseNegatives === 'function') ? cleanseNegatives(t, 2) : [];
      if (typeof syncStatusDerived === 'function') syncStatusDerived(t);
      var names = freed.map(function (d) { return d.name || d.id; }).join('、');
      r.events.push({ msg: '✨ ' + (c.name || '单位') + ' 净化 → ' + t.name + '：' + (freed.length ? ('解除【' + names + '】') : '无普通~高级负面可解除') });
      r.heals.push({ unitId: t.id, amount: Math.floor((c.base.soulAtk || 0) * 0.5) + 20 });
    });
  }]
});
registerSkill({
  id: 'heal', name: '治愈', type: 'support', target: 'ally1', cooldown: 2,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.heals.push({ unitId: t.id, amount: Math.floor((c.base.soulAtk || 0) * 0.8) + Math.floor(t.base.hp * 0.1) });
    });
  }]
});
registerSkill({
  id: 'empower', name: '强攻', type: 'support', target: 'ally1', cooldown: 3,
  effects: [function (c, ts, r) {
    ts.forEach(function (t) {
      r.buffs.push({ unitId: t.id, key: 'atkBoost', value: 0.3, duration: 2 });
    });
  }]
});
registerSkill({
  id: 'lastword', name: '遗言', type: 'support', target: 'random1', cooldown: 7, startCooldown: 10,
  effects: [function (c, ts, r) {
    // 自身阵亡，敌方随机1攻击魂攻大幅降低 + 每回合最大生命伤害
    r.events.push({ msg: '💀 ' + (c.name || '单位') + ' 遗言：自我牺牲（自身阵亡）' });
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'lastworded', duration: 7, chance: 1, grade: 3 });
    });
  }]
});
registerSkill({
  id: 'fortify', name: '坚壁', type: 'support', target: 'self', cooldown: 2,
  effects: [function (c, ts, r) {
    /* v2.1.15：改为真正的状态（此前写 _fortify，全项目没有任何结算读它 → 白写）。
       guardup = 每层 +10% 防/魂防、最多 5 层、duration 极大（持续到战斗结束）。 */
    applyStatus(c, { id: 'guardup', duration: 999 });
    if (typeof syncStatusDerived === 'function') syncStatusDerived(c);
    var inst = (c.statuses || []).filter(function (s) { return s.id === 'guardup'; })[0];
    var stacks = inst ? (inst.stacks || 1) : 1;
    r.events.push({ msg: '🧱 ' + (c.name || '单位') + ' 坚壁：防御·魂防 +' + (stacks * 10) + '%（' + stacks + '/5 层）' });
  }]
});
registerSkill({
  id: 'clearfog', name: '清除迷雾', type: 'support', target: 'all', cooldown: 8,
  effects: [function (c, ts, r, ctx) {
    /* v2.1.15：真的清场（此前只有一句文案）。
       ① 全场普通~高级负面状态解除
       ② 能力变化归零 —— grow_atk / grow_def / 复仇 / 振翅 是直接改 unit.base 的，
          按它们留下的快照还原（设计文档原文：「使全场能力变化变为 0」）
       「全场」需要 gb.units，故走 ctx.units（castSkill 会带下来）。 */
    var all = (ctx && ctx.units) || ts || [];
    var cleared = 0, reverted = [];
    all.forEach(function (t) {
      if (!t || t.hp <= 0) return;
      var freed = (typeof cleanseNegatives === 'function') ? cleanseNegatives(t, 2) : [];
      cleared += freed.length;
      if (typeof resetAbilityChanges === 'function') {
        var back = resetAbilityChanges(t);
        if (back.length) reverted.push(t.name + '（' + back.join('/') + '）');
      }
      if (typeof syncStatusDerived === 'function') syncStatusDerived(t);
    });
    r.events.push({ msg: '🌫️ ' + (c.name || '单位') + ' 清除迷雾：全场解除 ' + cleared + ' 个负面' +
      (reverted.length ? ('，能力变化归零 ' + reverted.join('、') ) : '') });
  }]
});

/* ============================================================
   v2.1.14 技能详情文案表 —— 供 UI「点技能看完整说明」使用。
   文案以本文件 registerSkill 的**实际实现**为准，不是照抄设计文档；
   设计里有、引擎里没有的效果用 wip 单独标出，避免详情页给出虚假信息。
   v2.1.15 实装了上一版披露的 9 处，v2.1.16 又实装剩余 11 处不可达效果，
   v2.1.21 修掉最后一条（chargeup 的结算时点）。
   → 现在**没有任何 wip 条目**，详情页不会再出现「⚠ 与设计文档不一致」。
   ============================================================ */
var SKILL_DOCS = {
  charge:     { desc: '对随机 1 名敌人造成 攻击×200% 的物理伤害。' },
  bite:       { desc: '对随机 1 名敌人造成 攻击×180% 的物理伤害，30% 概率本次伤害 +25%。' },
  surprise:   { desc: '对随机 1 名敌人造成 攻击×190% 的物理伤害；50% 概率使其畏缩 1 回合（每名敌人每场最多 1 次）。先制度 +1。' },
  blackmist:  { desc: '65% 概率使随机 1 名敌人中毒 4 回合；中毒每回合结束造成其最大生命 4% 的伤害，对 Boss 减半。' },
  spikes:     { desc: '对敌方全体造成 攻击×120% 的物理伤害；每名目标 40% 概率减速 2 回合（速度 -3）。' },
  blizzard:   { desc: '对敌方全体造成 魂攻×150% 的魂伤害；每名目标 40% 概率冰冻 1~2 回合。' },
  snowball:   { desc: '对随机 1 名敌人造成 魂攻×120% 的魂伤害，每次发动威力 +30%（满 6 层 300%）。' },
  deepfreeze: { desc: '使随机 1 名敌人冰冻 2 回合。先制度 +1。' },
  chargeup:   { desc: '本回合进入蓄力（承伤 +25%，持续 1 回合）；下回合开始时自动对随机 1 名敌人结算一次 攻击×400% 的重击，并占用该次行动。' },
  armorbreak: { desc: '对随机 1 名敌人造成 攻击×170% 的物理伤害，并叠 1 层破甲 3 回合（每层防御 -10%，最多 6 层）。' },
  stardust:   { desc: '对敌方全体造成 魂攻×200% 的魂伤害；每名目标 20% 概率降低魂防 15%，持续 2 回合。' },
  shrink:     { desc: '自身闪避 +10%（上限 50%），可重复施放叠加，持续到战斗结束。' },
  yawn:       { desc: '使随机 1 名敌人获得哈欠 1 回合；其下回合开始有 55% 概率进入睡眠 1 回合。' },
  drench:     { desc: '使随机 1 名敌人潮湿 2 回合：魂防 -25%，且对其命中率 +30%。' },
  possess:    { desc: '使随机 1 名敌人被幽魂附身 1 回合：技能不可用；下回合开始时解除并受到其最大生命 8% 的伤害（无视防御）。先制度 +1。' },
  taunt:      { desc: '自身进入嘲讽 1 回合：敌方单体攻击优先选中自身，且自身速度 ×2 参与出手排序。' },
  doom:       { desc: '使随机 1 名敌人末日 4 回合：无法被治疗、技能不可用、普攻伤害减半，且每回合开始受到施加者魂攻×50% 的伤害（无视防御与减伤）。' },
  drainbuff:  { desc: '随机 1 名敌人的增益状态时长减半，被削掉的攻击加成折算给自身（+N% 攻击，3 回合）。' },
  bulwark:    { desc: '我方全体受到的伤害降低 20%，持续 3 回合。' },
  cleanse:    { desc: '解除我方 1 名队友的普通~高级负面，并回复其 魂攻×50% + 20 点生命（特级负面不解除）。' },
  heal:       { desc: '使我方随机 1 名队友回复 魂攻×80% + 其最大生命 10% 的生命。' },
  empower:    { desc: '使我方 1 名角色攻击 +30%，持续 2 回合。' },
  lastword:   { desc: '施放后自身立即阵亡，使随机 1 名敌人中「遗言诅咒」7 回合：攻击与魂攻 -25%，且每回合开始受到其最大生命 5% 的伤害。开场即进入冷却。' },
  fortify:    { desc: '自身防御与魂防 +10%，可重复施放叠加（最多 5 层 → +50%），持续到战斗结束。' },
  clearfog:   { desc: '全场普通~高级负面状态全部解除，并使全场「能力变化」归零（攻击/防御/速度的成长与增减益一并还原）。' }
};

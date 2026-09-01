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

/* 计算技能伤害（返回给 battle 应用）：
   攻击类：power% × 攻击/魂攻
   返回 {type:'damage', targetIds:[], amount, dmgType, ignoreDef?} */
function calcSkillDamage(skill, caster, targets, ctx) {
  if (!skill || skill.type !== 'attack') return null;
  var atk = skill.dmgType === 'soul' ? (caster.base.soulAtk || 0) : caster.base.atk;
  var base = Math.floor(atk * (skill.power || 1) / 100);
  var out = [];
  targets.forEach(function (t) {
    var dmg;
    if (skill.dmgType === 'soul') {
      dmg = t.base.soulDef > 0 ? Math.max(1, base - Math.floor(t.base.soulDef / 2)) : base;
    } else {
      dmg = Math.max(1, base - Math.floor(t.base.def / 2));
    }
    if (skill.ignoreDef) dmg = base;
    out.push({ targetId: t.id, amount: dmg, dmgType: skill.dmgType || 'physical' });
  });
  return { type: 'damage', hits: out };
}

/* 技能施放后的效果数据（状态附加/增益/治疗等），battle 应用
   返回 {events:[], statusApps:[{unitId,id,duration,chance}], heals:[], buffs:[]} */
function applySkillEffects(skill, caster, targets, ctx) {
  var r = { events: [], statusApps: [], heals: [], buffs: [] };
  if (!skill || !skill.effects) return r;
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
  effects: [function (c, ts, r) {
    if (Math.random() < 0.3) { r.events.push({ msg: '咬击: 伤害提升25%' }); }
  }]
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
  effects: [function (c, ts, r) {
    // 每次发动下次提升 30%，最大叠加 6 次（300%）
    c._snowStacks = (c._snowStacks || 0) + 1;
    if (c._snowStacks > 6) c._snowStacks = 6;
    r.events.push({ msg: '雪球: 层数 ' + c._snowStacks });
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
  id: 'chargeup', name: '蓄力重击', type: 'attack', target: 'random1', power: 400, dmgType: 'physical', cooldown: 3,
  effects: [function (c, ts, r) {
    // 本回合进入蓄力（承伤+25%），下回合结算 400%
    c._charging = true;
    r.events.push({ msg: '蓄力重击: 进入蓄力' });
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
    c._dodge = Math.min(50, (c._dodge || 0) + 10);
    r.events.push({ msg: '变小: 闪避+' + c._dodge + '%' });
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
registerSkill({
  id: 'taunt', name: '嘲讽', type: 'support', target: 'self', cooldown: 2,
  effects: [function (c, ts, r) {
    c._taunting = true;
    r.events.push({ msg: '嘲讽: 吸引攻击' });
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
    ts.forEach(function (t) {
      r.events.push({ msg: '摄取: 目标增益减半' });
    });
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
      r.events.push({ msg: '净化: 解除负面+治疗' });
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
    r.events.push({ msg: '遗言: 自我牺牲' });
    ts.forEach(function (t) {
      r.statusApps.push({ unitId: t.id, id: 'lastworded', duration: 7, chance: 1, grade: 3 });
    });
    r.events.push({ msg: '遗言: 自身阵亡' });
  }]
});
registerSkill({
  id: 'fortify', name: '坚壁', type: 'support', target: 'self', cooldown: 2,
  effects: [function (c, ts, r) {
    c._fortify = Math.min(50, (c._fortify || 0) + 10);
    r.events.push({ msg: '坚壁: 防御+10%' });
  }]
});
registerSkill({
  id: 'clearfog', name: '清除迷雾', type: 'support', target: 'all', cooldown: 8,
  effects: [function (c, ts, r) {
    r.events.push({ msg: '清除迷雾: 全场负面解除' });
  }]
});

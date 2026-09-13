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
    /* v2.1.14：原文案「咬击: 伤害提升25%」在引擎里没有对应实现
       —— applySkillEffects 在伤害结算之后才执行，无法回改本次伤害。
       文案已改为不承诺未实装的数值；是否实装 +25% 留给设计决定（改动会影响平衡）。 */
    if (Math.random() < 0.3) { r.events.push({ msg: '🦷 ' + (c.name || '单位') + ' 咬击：狠狠咬下一口' }); }
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
    r.events.push({ msg: '❄️ ' + (c.name || '单位') + ' 雪球：蓄力层数 ' + c._snowStacks + '/6' });
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
    r.events.push({ msg: '🔋 ' + (c.name || '单位') + ' 蓄力重击：进入蓄力（承伤 +25%，下回合结算 400%）' });
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
    r.events.push({ msg: '💨 ' + (c.name || '单位') + ' 变小：闪避 +' + c._dodge + '%（上限 50%）' });
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
    ts.forEach(function (t) {
      r.events.push({ msg: '🩸 ' + (c.name || '单位') + ' 摄取 → ' + ts.map(function (t) { return t.name; }).join('、') + '：目标增益减半' });
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
      r.events.push({ msg: '✨ ' + (c.name || '单位') + ' 净化 → ' + t.name + '：解除负面并治疗' });
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
    c._fortify = Math.min(50, (c._fortify || 0) + 10);
    r.events.push({ msg: '🧱 ' + (c.name || '单位') + ' 坚壁：防御 +' + c._fortify + '%（上限 50%）' });
  }]
});
registerSkill({
  id: 'clearfog', name: '清除迷雾', type: 'support', target: 'all', cooldown: 8,
  effects: [function (c, ts, r) {
    r.events.push({ msg: '🌫️ ' + (c.name || '单位') + ' 清除迷雾：全场负面解除' });
  }]
});

/* ============================================================
   v2.1.14 技能详情文案表 —— 供 UI「点技能看完整说明」使用。
   文案以本文件 registerSkill 的**实际实现**为准，不是照抄设计文档；
   设计里有、引擎里没有的效果用 wip 单独标出，避免详情页给出虚假信息。
   ============================================================ */
var SKILL_DOCS = {
  charge:     { desc: '对随机 1 名敌人造成 攻击×200% 的物理伤害。' },
  bite:       { desc: '对随机 1 名敌人造成 攻击×180% 的物理伤害。',
                wip: '设计中的「30% 概率本次伤害 +25%」未实装（技能效果在伤害结算之后执行，无法回改本次伤害）' },
  surprise:   { desc: '对随机 1 名敌人造成 攻击×190% 的物理伤害；50% 概率使其畏缩 1 回合（每名敌人每场最多 1 次）。先制度 +1。' },
  blackmist:  { desc: '65% 概率使随机 1 名敌人中毒 4 回合；中毒每回合结束造成其最大生命 4% 的伤害，对 Boss 减半。' },
  spikes:     { desc: '对敌方全体造成 攻击×120% 的物理伤害；每名目标 40% 概率减速 2 回合。' },
  blizzard:   { desc: '对敌方全体造成 魂攻×150% 的魂伤害；每名目标 40% 概率冰冻 1~2 回合。' },
  snowball:   { desc: '对随机 1 名敌人造成 魂攻×120% 的魂伤害，并累计雪球层数（上限 6 层）。',
                wip: '设计中的「每层使后续伤害 +30%」未实装（只累计并记录了层数，伤害未被加成）' },
  deepfreeze: { desc: '使随机 1 名敌人冰冻 2 回合。先制度 +1。' },
  chargeup:   { desc: '对随机 1 名敌人造成 攻击×400% 的物理伤害，并进入蓄力状态（承伤 +25%，1 回合）；蓄力标记会在下一次施放该技能时追加一次 攻击×400% 的重击。',
                wip: '结算时点与设计文档不同（设计为「下回合自动结算」，实现为「下次施放时追加」）' },
  armorbreak: { desc: '对随机 1 名敌人造成 攻击×170% 的物理伤害，并叠 1 层破甲 3 回合（破甲最多 6 层）。' },
  stardust:   { desc: '对敌方全体造成 魂攻×200% 的魂伤害；每名目标 20% 概率降低魂防 2 回合。' },
  shrink:     { desc: '自身闪避 +10%（上限 50%），可重复施放叠加。',
                wip: '累计的 _dodge 没有被命中判定读取（判定读的是 _eva），闪避加成实际不生效' },
  yawn:       { desc: '使随机 1 名敌人获得哈欠 1 回合；其下回合开始有 55% 概率进入睡眠 1 回合。' },
  drench:     { desc: '使随机 1 名敌人潮湿 2 回合（魂防 -10，并更易被命中）。' },
  possess:    { desc: '使随机 1 名敌人被幽魂附身 1 回合：技能不可用；下回合开始时解除并受到其最大生命 8% 的伤害（无视防御）。先制度 +1。' },
  taunt:      { desc: '自身进入嘲讽 1 回合：敌方单体攻击优先选中自身，且自身速度 ×2 参与出手排序。' },
  doom:       { desc: '使随机 1 名敌人末日 4 回合：无法被治疗、技能不可用、普攻伤害减半，且每回合开始受到施加者魂攻×50% 的伤害（无视防御与减伤）。' },
  drainbuff:  { desc: '设计：随机 1 名敌人的当前增益减半，并把削减的效果转移给自身 3 回合。',
                wip: '仅记录了日志，增益窃取未实装' },
  bulwark:    { desc: '我方全体受到的伤害降低 20%，持续 3 回合。',
                wip: '减伤值写入了 _dmgReduce，但伤害结算从未读取该字段，减伤实际不生效' },
  cleanse:    { desc: '解除我方 1 名队友的普通~高级负面，并回复其 魂攻×50% + 20 点生命。',
                wip: '治疗已生效，但负面解除未实装（只记录了日志）' },
  heal:       { desc: '使我方随机 1 名队友回复 魂攻×80% + 其最大生命 10% 的生命。' },
  empower:    { desc: '使我方 1 名角色攻击 +30%，持续 2 回合。',
                wip: 'buff 是按单位下发的，而结算侧只消费「全体」类 buff，攻击加成实际不生效' },
  lastword:   { desc: '施放后自身立即阵亡，使随机 1 名敌人中「遗言诅咒」7 回合：攻击与魂攻降低，且每回合开始受到其最大生命 5% 的伤害。开场即进入冷却。' },
  fortify:    { desc: '自身防御 +10%（上限 50%），可重复施放叠加。',
                wip: '写入了 _fortify，但没有任何结算读取该字段，防御加成实际不生效' },
  clearfog:   { desc: '设计：使全场能力变化归零，并解除全场普通~高级负面状态。',
                wip: '仅记录了日志，实际驱散与能力回退均未实装' }
};

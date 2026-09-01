/* ============================================
   MyHealth — Enemy AI Strategy (M2b 打磨 B)
   敌人决策：选技能 + 选目标（替代纯随机）。
   策略：残血集火、治疗优先、Boss 保留大招、连招意识。
   纯逻辑，依赖 skill.js / battle-group.js。
   ============================================ */

/* 决策上下文辅助 */
function aliveOpponents(gb, actor) {
  return (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function(u){ return u.hp > 0; });
}
function aliveAllies(gb, actor) {
  return (actor.side === 'ally' ? gb.allies : gb.enemies).filter(function(u){ return u.hp > 0; });
}

/* 目标评分：残血优先、低防优先、治疗者优先 */
function scoreTarget(t) {
  var score = 0;
  var hpPct = t.hp / Math.max(1, t.base.hp);
  // 残血优先（可斩杀）
  if (hpPct < 0.25) score += 30;
  else if (hpPct < 0.5) score += 15;
  // 低防优先
  var def = t.base.def || 0;
  if (def < 10) score += 10;
  // 有治疗/增益技能的优先
  if (t.skills && t.skills.some(function(s){ var d = SKILLS[s]; return d && d.type === 'support'; })) score += 8;
  // 攻击高（威胁大）优先
  if (t.base.atk >= 50) score += 5;
  return score + Math.random() * 5;  // 少量随机避免完全确定
}

/* 选目标：评分最高（嘲讽者强制） */
function aiPickTarget(gb, actor, skillDef) {
  // 嘲讽强制
  var taunters = aliveOpponents(gb, actor).filter(function(u){ return u._taunting; });
  if (taunters.length) return taunters[0];

  var pool = aliveOpponents(gb, actor);
  if (!pool.length) return null;

  // 全体技能 → 返回全部（由调用方处理）
  if (skillDef && (skillDef.target === 'all')) return pool;

  // 辅助治疗类 → 我方残血
  if (skillDef && (skillDef.target === 'ally1' || skillDef.target === 'self')) {
    var allies = aliveAllies(gb, actor);
    if (!allies.length) return null;
    allies.sort(function(a, b){ return (a.hp / a.base.hp) - (b.hp / b.base.hp); });
    return allies[0];  // 最残血的我方
  }

  // 攻击类 → 评分最高
  pool.sort(function(a, b){ return scoreTarget(b) - scoreTarget(a); });
  return pool[0];
}

/* 选技能：策略化（不纯随机）
   优先级：能斩杀残血 → 治疗残血 → Boss 大招（低血触发）→ 冷却就绪的强技能 → 随机 */
function aiPickSkill(gb, actor) {
  var usable = usableSkills(actor);
  if (!usable.length) return null;
  var opponents = aliveOpponents(gb, actor);
  var myAllies = aliveAllies(gb, actor);
  var myHpPct = actor.hp / Math.max(1, actor.base.hp);

  // 1. 可斩杀残血敌人的攻击技能（优先）
  var killable = opponents.find(function(t){ return t.hp / t.base.hp < 0.3; });
  if (killable) {
    var atkSkills = usable.filter(function(sid){
      var d = SKILLS[sid];
      return d && d.type === 'attack';
    });
    if (atkSkills.length) return atkSkills[0];
  }

  // 2. 治疗残血队友（辅助治疗技能）
  var hurtAlly = myAllies.find(function(t){ return t.hp / t.base.hp < 0.4; });
  if (hurtAlly) {
    var healSkills = usable.filter(function(sid){
      var d = SKILLS[sid];
      return d && d.type === 'support' && (d.target === 'ally1');
    });
    if (healSkills.length) return healSkills[0];
  }

  // 3. Boss 低血时放大招（高伤害或特级负面）
  if (myHpPct < 0.35 && actor._tier === 'boss') {
    var ultSkills = usable.filter(function(sid){
      var d = SKILLS[sid];
      if (!d || d.type !== 'attack') return false;
      return (d.power || 0) >= 300;
    });
    if (ultSkills.length) return ultSkills[0];
    // 特级负面（末日）也算大招
    var doomSkill = usable.find(function(sid){ return sid === 'doom' || sid === 'lastword'; });
    if (doomSkill) return doomSkill;
  }

  // 4. 强技能优先（power 高/先制度高），否则随机
  var sorted = usable.slice().sort(function(a, b){
    var da = SKILLS[a], db = SKILLS[b];
    var pa = (da && da.power) || 0, pb = (db && db.power) || 0;
    var pra = (da && da.priority) || 0, prb = (db && db.priority) || 0;
    return (pb + prb * 20) - (pa + pra * 20);
  });
  // 70% 用最强，30% 随机（避免太机械）
  if (Math.random() < 0.7) return sorted[0];
  return sorted[Math.floor(Math.random() * sorted.length)];
}

/* 集成：替换 battle-group 里的 pickSkill/selectTargets 调用 */
function aiDecide(gb, actor) {
  var skillId = aiPickSkill(gb, actor);
  var skillDef = skillId ? (SKILLS[skillId] || null) : null;
  var target = aiPickTarget(gb, actor, skillDef);
  return { skillId: skillId, target: target, skillDef: skillDef };
}

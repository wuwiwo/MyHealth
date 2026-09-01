/* ============================================
   MyHealth — Player Skills System (M1-1)
   9 技能注册表 + 技能点经济 + 升级 + 槽位。
   纯逻辑，无 DOM/store。依赖 unit.js（战斗挂钩在 battle 层）。
   设计来源：design-v2.0.md §1
   ============================================ */

var PLAYER_SKILLS = {};   // id → skill def

/* registerPlayerSkill(def)
   def: { id, name, type:'passive'|'support'|'attack', maxLevel,
          costPerLevel: fn(lv)->cost | number,
          desc, effect: fn(lv)->数值描述 } */
function registerPlayerSkill(def) {
  if (!def || !def.id) throw new Error('registerPlayerSkill: id required');
  PLAYER_SKILLS[def.id] = def;
  return def;
}
function getPlayerSkill(id) { return PLAYER_SKILLS[id] || null; }
function listPlayerSkills() { return Object.keys(PLAYER_SKILLS); }

/* 升级消耗：等级×系数（lv 为当前等级，升到 lv+1 的花费） */
function skillUpgradeCost(skill, currentLevel) {
  if (!skill) return 0;
  if (typeof skill.costPerLevel === 'function') return skill.costPerLevel(currentLevel);
  return (currentLevel + 1) * (skill.costPerLevel || 10);
}

/* 满级总投入 */
function skillTotalCost(skill) {
  var total = 0;
  for (var lv = 0; lv < skill.maxLevel; lv++) total += skillUpgradeCost(skill, lv);
  return total;
}

/* --- 9 技能注册 --- */

/* 1. 暴击（被动 lv20）：几率 n×1%，暴伤 125%+n×5% */
registerPlayerSkill({
  id: 'crit', name: '暴击', type: 'passive', maxLevel: 20, costPerLevel: function(lv){ return (lv+1)*10; },
  desc: '攻击有 n×1% 几率暴击，造成 125%+n×5% 暴击伤害',
  effect: function(lv){ return { chance: lv*0.01, critMult: 1.25 + lv*0.05 }; }
});

/* 2. 气力恢复（辅助 lv10）：每4回合后2回合，每回合回 防御×n×10% */
registerPlayerSkill({
  id: 'vitality', name: '气力恢复', type: 'support', maxLevel: 10, costPerLevel: function(lv){ return (lv+1)*15; },
  desc: '每4回合后的2回合，每回合回复 防御×n×10% 血量',
  effect: function(lv){ return { healPct: lv*0.1 }; }
});

/* 3. 陨石轰炸（攻击 lv20）：随机3敌各1次，魂攻×n×20%，CD5 */
registerPlayerSkill({
  id: 'meteor', name: '陨石轰炸', type: 'attack', maxLevel: 20, costPerLevel: function(lv){ return (lv+1)*5; },
  desc: '随机3敌各1次轰炸，魂攻×n×20%，CD5',
  effect: function(lv){ return { power: lv*0.2, targets: 3, cd: 5 }; }
});

/* 4. 格挡（被动 lv10）：几率 n×2%，减伤 25%+n×5%，pity 乘算 */
registerPlayerSkill({
  id: 'block', name: '格挡', type: 'passive', maxLevel: 10, costPerLevel: function(lv){ return (lv+1)*15; },
  desc: '受到伤害有 n×2% 几率格挡，减伤 25%+n×5%，失败几率×1.2',
  effect: function(lv){ return { chance: lv*0.02, reduce: 0.25 + lv*0.05 }; }
});

/* 5. 气势如虹（辅助 lv20）：几率 10%+n×2%，全队攻击+n×3% ×2回合，触发锁3回合 */
registerPlayerSkill({
  id: 'momentum', name: '气势如虹', type: 'support', maxLevel: 20, costPerLevel: function(lv){ return (lv+1)*10; },
  desc: '每回合开始 10%+n×2% 几率进入气势：全队攻击+n×3% ×2回合，触发锁3回合',
  effect: function(lv){ return { chance: 0.10 + lv*0.02, atkBoost: lv*0.03, dur: 2, lock: 3 }; }
});

/* 6. 冰魄光束（攻击 lv20）：单敌冰冻1回合+两段无视魂防伤害 魂攻×n×8%，CD5 */
registerPlayerSkill({
  id: 'icebeam', name: '冰魄光束', type: 'attack', maxLevel: 20, costPerLevel: function(lv){ return (lv+1)*6; },
  desc: '单敌冰冻1回合+两段无视魂防伤害 魂攻×n×8%，CD5',
  effect: function(lv){ return { power: lv*0.08, freeze: 1, ignoreSoulDef: true, cd: 5 }; }
});

/* 7. 金身护盾（被动 lv10）：开战全队盾 (攻+魂攻)×n×30%，免疫普通+高级负面 */
registerPlayerSkill({
  id: 'goldshield', name: '金身护盾', type: 'passive', maxLevel: 10, costPerLevel: function(lv){ return (lv+1)*15; },
  desc: '开战全队护盾=(攻+魂攻)×n×30%，免疫普通+高级负面',
  effect: function(lv){ return { shieldPct: lv*0.3 }; }
});

/* 8. 瞩目（辅助 lv10）：几率 n×3% 嘲讽1回合；回合末全体回复 */
registerPlayerSkill({
  id: 'spotlight', name: '瞩目', type: 'support', maxLevel: 10, costPerLevel: function(lv){ return (lv+1)*10; },
  desc: '几率 n×3% 嘲讽1回合；回合末全体回复 (防+魂防)×受击次数',
  effect: function(lv){ return { chance: lv*0.03, tauntDur: 1 }; }
});

/* 9. 巨石重压（攻击 lv20）：单敌 魂攻×n×30%，降魂防 n×1%，CD3 */
registerPlayerSkill({
  id: 'boulder', name: '巨石重压', type: 'attack', maxLevel: 20, costPerLevel: function(lv){ return (lv+1)*5; },
  desc: '单敌 魂攻×n×30%，降魂防 n×1%（叠至60%），CD3',
  effect: function(lv){ return { power: lv*0.3, soulDefDown: lv*0.01, cd: 3 }; }
});

/* --- 技能点经济 --- */

/* 技能点：隐藏挑战成功 +100 点，周递增（首 0%，后续 +50%/次，最高 +250%） */
function weeklyBonusRate(winCountThisWeek) {
  // 第 1 次 0% 加成；之后每次 +50%，最高 +250%
  var n = Math.max(0, (winCountThisWeek || 0) - 1);
  return Math.min(2.5, n * 0.5);
}
function earnSkillPoints(base, winCountThisWeek) {
  var rate = weeklyBonusRate(winCountThisWeek);
  return Math.floor(base * (1 + rate));
}

/* 默认技能状态 */
function defaultSkillState() {
  return {
    points: 0,            // 可用技能点
    totalEarned: 0,       // 历史总获得（反作弊审计）
    weekKey: null,        // 本周键（周递增计数用）
    winCountThisWeek: 0,  // 本周胜局数
    levels: {},           // {skillId: level}
    loadout: [],          // [skillId|null, ...] 槽位
    slotsUnlocked: 1      // 初始 1 槽
  };
}

/* 槽位解锁里程碑（本月通关数） */
var SLOT_MILESTONES = [12, 20];

/* 升级技能：扣点数，等级+1 */
function upgradePlayerSkill(state, skillId) {
  var skill = getPlayerSkill(skillId);
  if (!skill) return { ok: false, reason: '技能不存在' };
  var cur = state.levels[skillId] || 0;
  if (cur >= skill.maxLevel) return { ok: false, reason: '已达最高级' };
  var cost = skillUpgradeCost(skill, cur);
  if (state.points < cost) return { ok: false, reason: '技能点不足（需 '+cost+'）' };
  state.points -= cost;
  state.levels[skillId] = cur + 1;
  return { ok: true, skillId: skillId, level: cur + 1, cost: cost };
}

/* 装备技能到槽位：同类型最多 1 个 */
function equipPlayerSkill(state, slotIdx, skillId) {
  if (slotIdx >= state.slotsUnlocked) return { ok: false, reason: '槽位未解锁' };
  var skill = getPlayerSkill(skillId);
  if (!skill) return { ok: false, reason: '技能不存在' };
  var lv = state.levels[skillId] || 0;
  if (lv < 1) return { ok: false, reason: '技能至少 lv1 才能装备' };
  // 同类型检查
  for (var i = 0; i < state.loadout.length; i++) {
    if (i !== slotIdx && state.loadout[i]) {
      var other = getPlayerSkill(state.loadout[i]);
      if (other && other.type === skill.type) return { ok: false, reason: '同类型技能最多带 1 个' };
    }
  }
  state.loadout[slotIdx] = skillId;
  return { ok: true, skillId: skillId, slot: slotIdx };
}

/* 卸下技能 */
function unequipPlayerSkill(state, slotIdx) {
  state.loadout[slotIdx] = null;
  return { ok: true };
}

/* 月底技能减半（向下取整） */
function monthlyResetSkills(state) {
  for (var k in state.levels) {
    state.levels[k] = Math.floor(state.levels[k] / 2);
  }
  return state;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.PLAYER_SKILLS = PLAYER_SKILLS;
  window.registerPlayerSkill = registerPlayerSkill;
  window.getPlayerSkill = getPlayerSkill;
  window.listPlayerSkills = listPlayerSkills;
  window.skillUpgradeCost = skillUpgradeCost;
  window.skillTotalCost = skillTotalCost;
  window.weeklyBonusRate = weeklyBonusRate;
  window.earnSkillPoints = earnSkillPoints;
  window.defaultSkillState = defaultSkillState;
  window.upgradePlayerSkill = upgradePlayerSkill;
  window.equipPlayerSkill = equipPlayerSkill;
  window.unequipPlayerSkill = unequipPlayerSkill;
  window.monthlyResetSkills = monthlyResetSkills;
  window.SLOT_MILESTONES = SLOT_MILESTONES;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PLAYER_SKILLS = PLAYER_SKILLS;
  globalThis.registerPlayerSkill = registerPlayerSkill;
  globalThis.getPlayerSkill = getPlayerSkill;
  globalThis.listPlayerSkills = listPlayerSkills;
  globalThis.skillUpgradeCost = skillUpgradeCost;
  globalThis.skillTotalCost = skillTotalCost;
  globalThis.weeklyBonusRate = weeklyBonusRate;
  globalThis.earnSkillPoints = earnSkillPoints;
  globalThis.defaultSkillState = defaultSkillState;
  globalThis.upgradePlayerSkill = upgradePlayerSkill;
  globalThis.equipPlayerSkill = equipPlayerSkill;
  globalThis.unequipPlayerSkill = unequipPlayerSkill;
  globalThis.monthlyResetSkills = monthlyResetSkills;
  globalThis.SLOT_MILESTONES = SLOT_MILESTONES;
}

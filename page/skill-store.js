/* ============================================
   MyHealth — Skill Store (M1-4)
   dh-skills-v1 持久化 + 技能点获取。
   依赖 store.js（注册表）、skills.js。
   ============================================ */

/* 注册 dh-skills-v1 schema */
if (typeof store !== 'undefined' && store.registerSchema) {
  store.registerSchema('skills', {
    version: 1,
    defaultValue: function () { return Object.assign({ version: 1 }, defaultSkillState()); },
    validate: function (v) { return v && typeof v === 'object' && typeof v.points === 'number'; },
    migrate: {}
  });
}

/* 读取技能状态（默认兜底） */
function getSkillState() {
  if (typeof store === 'undefined') return Object.assign({ version: 1 }, defaultSkillState());
  var d = store.get('skills');
  if (!d) { d = Object.assign({ version: 1 }, defaultSkillState()); store.set('skills', d); }
  return d;
}
function saveSkillState(d) {
  if (typeof store !== 'undefined') store.set('skills', d);
}

/* 隐藏挑战胜利结算：获得技能点（周递增） */
function awardSkillPoints(winCount) {
  var d = getSkillState();
  var gained = earnSkillPoints(100, winCount || 0);
  d.points += gained;
  d.totalEarned += gained;
  saveSkillState(d);
  return { ok: true, gained: gained, points: d.points };
}

/* 更新本周计数（challenge 胜利调用） */
function recordSkillWin(weekKey) {
  var d = getSkillState();
  if (d.weekKey !== weekKey) {
    d.weekKey = weekKey;
    d.winCountThisWeek = 1;
  } else {
    d.winCountThisWeek = (d.winCountThisWeek || 0) + 1;
  }
  saveSkillState(d);
  return d.winCountThisWeek;
}

/* 槽位解锁检查（本月通关数） */
function unlockSkillSlots(monthlyCleared) {
  var d = getSkillState();
  var unlocked = 1;
  SLOT_MILESTONES.forEach(function (m) {
    if ((monthlyCleared || 0) >= m) unlocked++;
  });
  d.slotsUnlocked = Math.min(3, Math.max(unlocked, d.slotsUnlocked || 1));
  saveSkillState(d);
  return d.slotsUnlocked;
}

/* 月度重置（技能减半） */
function monthlyResetSkillState() {
  var d = getSkillState();
  monthlyResetSkills(d);
  saveSkillState(d);
  return d;
}

/* 升级/装备（包装，自动保存） */
function skillUpgrade(skillId) {
  var d = getSkillState();
  var r = upgradePlayerSkill(d, skillId);
  if (r.ok) saveSkillState(d);
  return r;
}
function skillEquip(slot, skillId) {
  var d = getSkillState();
  var r = equipPlayerSkill(d, slot, skillId);
  if (r.ok) saveSkillState(d);
  return r;
}
function skillUnequip(slot) {
  var d = getSkillState();
  unequipPlayerSkill(d, slot);
  saveSkillState(d);
  return { ok: true };
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.getSkillState = getSkillState;
  window.saveSkillState = saveSkillState;
  window.awardSkillPoints = awardSkillPoints;
  window.recordSkillWin = recordSkillWin;
  window.unlockSkillSlots = unlockSkillSlots;
  window.monthlyResetSkillState = monthlyResetSkillState;
  window.skillUpgrade = skillUpgrade;
  window.skillEquip = skillEquip;
  window.skillUnequip = skillUnequip;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getSkillState = getSkillState;
  globalThis.saveSkillState = saveSkillState;
  globalThis.awardSkillPoints = awardSkillPoints;
  globalThis.recordSkillWin = recordSkillWin;
  globalThis.unlockSkillSlots = unlockSkillSlots;
  globalThis.monthlyResetSkillState = monthlyResetSkillState;
  globalThis.skillUpgrade = skillUpgrade;
  globalThis.skillEquip = skillEquip;
  globalThis.skillUnequip = skillUnequip;
}

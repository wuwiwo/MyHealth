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
  if (!d) { d = Object.assign({ version: 1 }, defaultSkillState()); store.set('skills', d); return d; }
  /* v2.2 WP-H10 存档迁移（文档未写机制；按裁决「立即开放后 2 个槽位」定案，幂等）：
     旧存档的 slotsUnlocked 恒为 1 —— 因为旧解锁入口 unlockSkillSlots() 全项目**没有调用点**
     （见 doc/mechanics-biopsy-v2.0.4.md 第 3 条），所以「立即开放」必须同时覆盖老账号，
     否则作者自己的存档仍是 9 选 1。这里在**读路径**上一次性抬到 SKILL_SLOT_TOTAL，只写一次。 */
  var want = (typeof SKILL_SLOT_TOTAL === 'number') ? SKILL_SLOT_TOTAL : 3;
  if (!(d.slotsUnlocked >= want)) { d.slotsUnlocked = want; store.set('skills', d); }
  return d;
}
function saveSkillState(d) {
  if (typeof store !== 'undefined') store.set('skills', d);
}

/* 隐藏挑战胜利结算：获得技能点（周递增） */
/* v2.1.19：每关敌群通关获得的技能点基数（原 10，偏高，下调到 4） */
var SKILL_POINTS_PER_STAGE = 4;

function awardSkillPoints(winCount) {
  var d = getSkillState();
  var gained = earnSkillPoints(SKILL_POINTS_PER_STAGE, winCount || 0);   // v2.1.19：10 → 4，周递增照旧
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

/* 槽位解锁检查
   v2.2 WP-H10：文档裁决「立即开放后 2 个槽位」→ 里程碑（12 / 20 关）作废，
   本函数只保证「槽位数 ≥ SKILL_SLOT_TOTAL」（只升不降，沿用旧的 Math.max 不回收语义）。
   `monthlyCleared` 参数为**签名兼容**保留（旧调用点/测试仍会传），已不参与判定。 */
function unlockSkillSlots(monthlyCleared) {
  var d = getSkillState();
  d.slotsUnlocked = Math.max(SKILL_SLOT_TOTAL, d.slotsUnlocked || 1);
  saveSkillState(d);
  return d.slotsUnlocked;
}

/* ============================================================
   月度重置（v2.2 WP-H9）
   文档原文（doc/2.2 修改-补充.md）：
     「玩家技能点（未用完，全部清空）」
     「玩家已学习技能（变为一半等级，不返还技能点）」
   即：**未使用的技能点清零** + **已学技能等级减半**，已投入的点数一律不返还。

   边界口径（文档未写，此处定案并写进 test-skill-store.js）：
   · 取整 = **向下取整**（沿用 skills.js 既有 monthlyResetSkills 的 Math.floor）；
     等级 1 → 0（技能条目保留在 levels 里，不会从「已学技能」里删掉）。
   · **不返还点数**：totalEarned（历史累计）不动，只清 points（可用点数）。
   · **已装配（loadout）保持不动**：装配关系不是「已学技能」的组成部分，
     本批次只按文档改「点数 + 等级」两项；等级掉到 0 的技能即使仍在槽位，
     战斗侧 effect(0) 恒为 0 值，不会产生额外收益（见 player-skill-hooks.attachPlayerSkills）。
   · 升级是**原子**的（upgradePlayerSkill 同时扣点+升级），不存在「升级中」的中间态，
     故不存在「正在升级中的点数」需要特殊处理。

   幂等：以**月度键 monthlyKey** 记账（写法与 pet-store.js 的 monthlyResetPets 同款）。
   同一自然月内重复调用只生效一次 —— 否则每次进 app 都会再减半一次。
   ============================================================ */
function monthlyResetSkillState(now) {
  var d = getSkillState();
  var cur = (typeof monthKey === 'function') ? monthKey(now || new Date())
          : (function () { var n = now || new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); })();
  if (d.monthlyKey === cur) return { ok: false, reason: '本月已重置', monthlyKey: cur, alreadyReset: true };
  d.points = 0;                 // 未使用的技能点全部清空（已投入的不返还）
  monthlyResetSkills(d);        // 已学技能等级减半（向下取整）
  d.monthlyKey = cur;
  saveSkillState(d);
  return { ok: true, monthlyKey: cur, points: d.points, levels: d.levels, loadout: d.loadout };
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

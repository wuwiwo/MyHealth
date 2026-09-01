/* ============================================
   MyHealth — Pet System Core (M4-1)
   宠物数据结构 + 生命周期（蛋→孵化→成长→成熟）。
   纯逻辑，无 DOM/store。依赖 date-roll.js（时间键/月窗口）。
   时间结算：复用 resolveDateRoll 处理离线多天。
   ============================================ */

/* 宠物常量 */
var PET_CONFIG = {
  hatchDays: 14,          // 孵化期 14 天
  nutritionPerFeed: [0.5, 2],   // 营养液每次 +0.5%~2%
  feedHunger: [10, 15],   // 饲料恢复饥饿 10%~15%
  healthLoss: {           // 饥饿度 → 健康度损失/天
    low: 5,               // < 30% 饥饿 → -5% 健康
    critical: 15,         // < 10% → -15%
    zero: 30              // = 0 → -30%
  },
  growthPerDay: [1, 7],   // 健康达标每天成长 +1%~7%
  matureHungerUse: [20, 35],  // 成熟后每天消耗饥饿 20%~35%
  maxRoster: 2            // 每场最多上 2 只
};

/* createPet({speciesId, rarity, name}) → 宠物状态对象（蛋期开始）
   存 store 的结构：dh-pets-v1 下的单个宠物 */
function createPet(spec) {
  spec = spec || {};
  return {
    speciesId: spec.speciesId || 'unknown',
    rarity: spec.rarity || 'R',        // R/SR/SSR/UR
    name: spec.name || '宠物',
    stage: 'egg',                      // 'egg' | 'grow' | 'mature'
    // 蛋期
    hatchProgress: spec.hatchProgress || 0,   // 0-100%
    hatchStartDate: spec.hatchStartDate || dateKey(new Date()),
    // 成长期
    hunger: spec.hunger || 80,         // 0-100 饥饿度（越高越饱）
    health: spec.health || 100,        // 健康度（不可恢复，0 阵亡）
    growth: spec.growth || 0,          // 成长度 0-100+（超100成熟）
    ageDays: spec.ageDays || 0,        // 已养天数
    // 炼化（M4-3）
    refineLevel: spec.refineLevel || 0,
    refineStats: spec.refineStats || {},   // {hp:0,atk:0,def:0,soulAtk:0,soulDef:0,spd:0}
    // 技能（M4-4）
    skillLevels: spec.skillLevels || {},   // {skillId: level}
    // 战斗（M4-5）
    foughtToday: spec.foughtToday || null, // dateKey 记录当天是否参战
    // 状态
    isDead: spec.isDead || false,
    deadAt: spec.deadAt || null,
    lastSettleDate: spec.lastSettleDate || null,  // 上次结算日
    monthlyKey: spec.monthlyKey || null   // 月度重置键（M4-3）
  };
}

/* 喂营养液（孵化期）：+0.5%~2%，返回进度 */
function feedNutrition(pet) {
  if (pet.stage !== 'egg') return { ok: false, reason: '非孵化期' };
  var inc = PET_CONFIG.nutritionPerFeed[0] + Math.random() * (PET_CONFIG.nutritionPerFeed[1] - PET_CONFIG.nutritionPerFeed[0]);
  pet.hatchProgress = Math.min(100, pet.hatchProgress + inc);
  return { ok: true, progress: pet.hatchProgress, inc: inc };
}

/* 喂饲料（成长期）：恢复饥饿 10%~15% */
function feedPet(pet) {
  if (pet.stage !== 'grow') return { ok: false, reason: '非成长期' };
  var inc = PET_CONFIG.feedHunger[0] + Math.random() * (PET_CONFIG.feedHunger[1] - PET_CONFIG.feedHunger[0]);
  pet.hunger = Math.min(100, pet.hunger + inc);
  return { ok: true, hunger: pet.hunger, inc: inc };
}

/* 健康度损失（按饥饿度） */
function healthLossRate(hunger) {
  if (hunger <= 0) return PET_CONFIG.healthLoss.zero;
  if (hunger < 10) return PET_CONFIG.healthLoss.critical;
  if (hunger < 30) return PET_CONFIG.healthLoss.low;
  return 0;
}

/* 单日结算（内部：一次养成的每日更新） */
function settleOneDay(pet, todayKey) {
  var events = [];
  if (pet.stage === 'egg') {
    // 孵化期：进度靠营养液，天数只是倒计时参考
    return { events: events, stage: pet.stage };
  }
  if (pet.stage === 'grow') {
    pet.ageDays++;
    // 饥饿消耗（成长期每天自然消耗？设计未明说，按健康挂钩处理）
    var loss = healthLossRate(pet.hunger);
    pet.health = Math.max(0, pet.health - loss);
    if (pet.health <= 0) {
      pet.isDead = true;
      pet.deadAt = todayKey;
      events.push({ type: 'death', msg: pet.name + ' 健康度归零，阵亡' });
      return { events: events, stage: 'dead' };
    }
    // 成长度：健康达标每天 +1%~7%（健康 > 50% 才算达标）
    if (pet.health > 50) {
      var g = PET_CONFIG.growthPerDay[0] + Math.random() * (PET_CONFIG.growthPerDay[1] - PET_CONFIG.growthPerDay[0]);
      pet.growth += g;
      events.push({ type: 'growth', msg: pet.name + ' 成长度 +' + g.toFixed(1) });
      if (pet.growth >= 100) {
        pet.stage = 'mature';
        events.push({ type: 'mature', msg: '🎉 ' + pet.name + ' 进入成熟期！' });
      }
    }
    return { events: events, stage: pet.stage };
  }
  if (pet.stage === 'mature') {
    pet.ageDays++;
    // 成熟后每天消耗饥饿 20%~35%
    var use = PET_CONFIG.matureHungerUse[0] + Math.random() * (PET_CONFIG.matureHungerUse[1] - PET_CONFIG.matureHungerUse[0]);
    pet.hunger = Math.max(0, pet.hunger - use);
    return { events: events, stage: 'mature' };
  }
  return { events: events, stage: pet.stage };
}

/* 离线多天结算：从 lastSettleDate 到 today，逐天 settle（上限防失控）
   返回 {events, days, stage} */
function settlePet(pet, todayKey, now) {
  if (!pet.lastSettleDate) {
    pet.lastSettleDate = todayKey;
    return { events: [{ type: 'first', msg: pet.name + ' 开始记录' }], days: 0, stage: pet.stage };
  }
  if (pet.isDead) return { events: [], days: 0, stage: 'dead' };

  // 用 date-roll 算天数差（DST 安全）
  var days = daysBetween(pet.lastSettleDate, todayKey);
  if (days <= 0) return { events: [], days: 0, stage: pet.stage };

  var cap = 30;   // 上限 30 天，防极端
  var actual = Math.min(days, cap);
  var events = [];
  var stage = pet.stage;
  for (var i = 0; i < actual; i++) {
    var r = settleOneDay(pet, todayKey);
    events = events.concat(r.events);
    stage = r.stage;
    if (stage === 'dead') break;
  }
  pet.lastSettleDate = todayKey;
  return { events: events, days: actual, stage: stage };
}

/* 孵化检查：蛋期且进度满 → 进入成长期 */
function hatchCheck(pet) {
  if (pet.stage === 'egg' && pet.hatchProgress >= 100) {
    pet.stage = 'grow';
    pet.growth = 0;
    return { hatched: true, msg: '🥚 ' + pet.name + ' 破壳而出！进入成长期' };
  }
  return { hatched: false };
}

/* 共鸣加成：按持有总数返回倍率档位 */
function resonanceBonus(totalCount) {
  if (totalCount > 10) return 0.10;
  if (totalCount > 6) return 0.07;
  if (totalCount > 3) return 0.05;
  if (totalCount > 1) return 0.03;
  return 0;
}

/* 月度重置（M4-3 详细实现，这里框架）：
   炼化等级清零、技能减半、材料清空 —— 按 monthly-reset 工具 */
function monthlyResetPet(pet) {
  pet.refineLevel = 0;
  pet.refineStats = {};
  // 技能等级向下取整减半
  for (var k in pet.skillLevels) {
    pet.skillLevels[k] = Math.floor(pet.skillLevels[k] / 2);
  }
  return pet;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.PET_CONFIG = PET_CONFIG;
  window.createPet = createPet;
  window.feedNutrition = feedNutrition;
  window.feedPet = feedPet;
  window.settlePet = settlePet;
  window.hatchCheck = hatchCheck;
  window.resonanceBonus = resonanceBonus;
  window.monthlyResetPet = monthlyResetPet;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_CONFIG = PET_CONFIG;
  globalThis.createPet = createPet;
  globalThis.feedNutrition = feedNutrition;
  globalThis.feedPet = feedPet;
  globalThis.settlePet = settlePet;
  globalThis.hatchCheck = hatchCheck;
  globalThis.resonanceBonus = resonanceBonus;
  globalThis.monthlyResetPet = monthlyResetPet;
}

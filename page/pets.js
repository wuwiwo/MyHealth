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
  maxRoster: 4,           // v2.2 WP-A3：每场最多上 4 只（真正的上限常量见 pet-store.js 的 PET_BATTLE_MAX）
  /* v2.1.19 受伤系统：成熟期参战失败 → 50% 几率受伤；受伤期间无法出战。
     恢复进度 injuryHeal 0→100，到 100 解除受伤。
     营养液 每次 +10%~15%（约 7~10 次）；饲料 每次 +4%~5%（约 20~25 次）。 */
  matureInjuryChance: 0.5,
  injuryHeal: { nutrition: [10, 15], feed: [4, 5] }
};

/* 受伤：成熟期战斗失败时调用（概率由调用方判定） */
function injurePet(pet) {
  if (!pet || pet.stage !== 'mature') return { ok: false, reason: '非成熟期' };
  pet.injured = true;
  pet.injuryHeal = 0;
  return { ok: true };
}

/* 治疗受伤：kind = 'nutrition'（营养液）| 'feed'（饲料）
   恢复进度累积到 100 → 解除受伤状态 */
function healPetInjury(pet, kind) {
  if (!pet || !pet.injured) return { ok: false, reason: '未受伤' };
  var cfg = (PET_CONFIG.injuryHeal && PET_CONFIG.injuryHeal[kind]) || PET_CONFIG.injuryHeal.feed;
  var inc = cfg[0] + Math.random() * (cfg[1] - cfg[0]);
  pet.injuryHeal = Math.min(100, (pet.injuryHeal || 0) + inc);
  var healed = false;
  if (pet.injuryHeal >= 100) { pet.injured = false; pet.injuryHeal = 0; healed = true; }
  return { ok: true, inc: inc, progress: pet.injuryHeal, healed: healed };
}

/* 是否可参战：成熟 + 未阵亡 + 未受伤 */
function canPetBattle(pet) {
  return !!pet && pet.stage === 'mature' && !pet.isDead && !pet.injured;
}

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
    monthlyKey: spec.monthlyKey || null,  // 月度重置键（M4-3）
    /* v2.17：**宠物等级（成熟期经验等级）** —— 旧存档没有这两个字段时
       `petLevelInfo()` 一律按 lv0 / 0 exp 读（优雅退化，不迁移、不补偿）。 */
    level: spec.level || 0,   // 0~PET_LEVEL_MAX（由 exp 推导，属派生缓存）
    exp: spec.exp || 0        // 累计经验（唯一真相；每月清空）
  };
}

/* ============================================================
   v2.17：宠物等级（成熟期经验等级）—— **纯逻辑**，无 DOM、无 store。
   作者规格（逐字）：
     · 「成熟期以上开始累计」；「所需经验 = 目标等级 × 100」
     · 「宠物每级提升 1% 基础属性，即每个属性最多提升 50% 基础值」→ 最高 50 级
     · 「每月清空等级」（幂等键在 pet-store.js 的 `petLevelLedger().monthKey`）
   ⚠️ 与 level-system.js 的**玩家等级**（`LEVEL_TIERS` 的 pet 档）是**两套东西**：
      那个是玩家的等级带来的宠物档加成，这里是宠物自己的经验等级。
   ⚠️ `level` 字段是 `exp` 的**派生缓存**：唯一真相是 `exp`，
      `petLevelSync()` 每次按 exp 重算并回写（因此旧档 / 脏档不会卡在错误等级）。
   ============================================================ */
var PET_LEVEL_MAX = 50;              // 「每只宠物最高 50 级」
var PET_LEVEL_EXP_MULT = 100;        // 「所需经验 = 目标等级 × 100」
var PET_LEVEL_BONUS_PCT = 1;         // 「每级提升 1% 基础属性」
var PET_LEVEL_BONUS_CAP_PCT = PET_LEVEL_MAX * PET_LEVEL_BONUS_PCT;   // 50% 基础值

/* 目标等级 `level` 本级所需经验 = level × 100（lv1=100 / lv2=200 … / lv50=5,000） */
function petLevelStepExp(level) {
  var n = Math.max(0, Math.min(PET_LEVEL_MAX, Math.floor(level || 0)));
  return n * PET_LEVEL_EXP_MULT;
}
/* 从 lv0 累计升到 `level` 所需经验 = Σ_{k=1..level} k×100 = 50·level·(level+1) */
function petLevelCumExp(level) {
  var n = Math.max(0, Math.min(PET_LEVEL_MAX, Math.floor(level || 0)));
  return PET_LEVEL_EXP_MULT * (n * (n + 1) / 2);
}
/* 经验 → 等级（lv0 起；封顶 PET_LEVEL_MAX）。纯函数，不写任何对象。 */
function petLevelFromExp(exp) {
  var e = (typeof exp === 'number' && isFinite(exp)) ? Math.floor(exp) : 0;
  if (e <= 0) return 0;
  var lv = 0;
  /* 上限 50 级 → 循环最多 50 次（用累计公式判定，不做逐级加法累加） */
  while (lv < PET_LEVEL_MAX && e >= petLevelCumExp(lv + 1)) lv++;
  return lv;
}
/* 等级 → 属性加成百分比（lv1 = +1% … lv50 = +50%，封顶） */
function petLevelBonusPct(level) {
  var n = Math.max(0, Math.min(PET_LEVEL_MAX, Math.floor(level || 0)));
  return Math.min(PET_LEVEL_BONUS_CAP_PCT, n * PET_LEVEL_BONUS_PCT);
}
/* 只读视图（**不写 pet**）：等级 / 经验进度 / 加成百分比。
   · `need` = 升到下一级还需的经验（＝ 目标等级 × 100；满级 = 0）
   · `inLevel` = 本级已攒经验（满级 = 0）
   旧存档（缺 level/exp）→ lv0 / 0 exp。 */
function petLevelInfo(pet) {
  var petExp = (pet && typeof pet.exp === 'number' && isFinite(pet.exp)) ? Math.floor(pet.exp) : 0;
  if (petExp < 0) petExp = 0;
  var lv = petLevelFromExp(petExp);
  var maxed = (lv >= PET_LEVEL_MAX);
  /* 满级：累计经验封顶在 lv50 的门槛上（多出来的不累计，等级不再变） */
  var exp = maxed ? petLevelCumExp(PET_LEVEL_MAX) : petExp;
  var base = petLevelCumExp(lv);
  var need = maxed ? 0 : petLevelStepExp(lv + 1);
  var inLevel = maxed ? 0 : Math.max(0, exp - base);
  return {
    level: lv, exp: exp, cumBase: base, inLevel: inLevel, need: need,
    maxed: maxed, maxLevel: PET_LEVEL_MAX,
    pct: (maxed || need <= 0) ? (maxed ? 100 : 0) : Math.min(100, Math.round(inLevel / need * 100)),
    bonusPct: petLevelBonusPct(lv)
  };
}
/* 等级加成（**基础值层**）：levelBonus[k] = floor(基础[k] × 等级%)。
   ⚠️ 只吃 `base`（图鉴＋炼化＋天赋静态，即 createPetUnit 的 base），
      **不参与**稀有度 / 宝珠 / 共鸣的百分比池 —— 由调用点「池算完之后再加」保证
      （见 pet-store.js 的 `applyPetExpLevelBonuses` / `petStatBreakdown`）。
   ⚠️ 纯函数：不写入参、不读存档。速度也在内（「每个属性」＝基础属性六项全含）。 */
function petLevelBonusOf(base, pct) {
  var out = {};
  var b = base || {};
  var p = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
  if (p < 0) p = 0;
  if (p > PET_LEVEL_BONUS_CAP_PCT) p = PET_LEVEL_BONUS_CAP_PCT;
  var keys = ['hp', 'atk', 'def', 'speed', 'spd', 'soulAtk', 'soulDef'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (b[k] == null) continue;
    out[k] = Math.floor((b[k] || 0) * p / 100);
  }
  return out;
}
/* 按 exp 重算并回写 `pet.level` / `pet.exp`（**唯一**的等级写入口）。
   满级时把 exp 截到 lv50 门槛（多出来的经验如实丢弃，等级不再变化）。 */
function petLevelSync(pet) {
  if (!pet || typeof pet !== 'object') return { level: 0, exp: 0, leveledUp: false };
  var prev = (typeof pet.level === 'number' && isFinite(pet.level)) ? pet.level : petLevelFromExp(pet.exp);
  var info = petLevelInfo(pet);
  pet.level = info.level;
  pet.exp = info.exp;
  return { level: info.level, exp: info.exp, from: prev, leveledUp: info.level > prev };
}
/* 每月清空（**单只**；幂等闸门在 pet-store.js 的 `petLevelLedger().monthKey`） */
function petLevelResetMonthly(pet) {
  if (!pet || typeof pet !== 'object') return pet;
  pet.level = 0;
  pet.exp = 0;
  return pet;
}

/* 喂营养液（孵化期）：+0.5%~2%，返回进度 */
function feedNutrition(pet) {
  /* v2.1.19：成熟期喂营养液 —— 治疗受伤（10%~15%），不涨孵化进度 */
  if (pet.stage === 'mature') {
    var nh = healPetInjury(pet, 'nutrition');
    if (!nh.ok) return { ok: false, reason: nh.reason };
    return { ok: true, mature: true, injuryHeal: Math.round(nh.progress), healed: nh.healed, inc: nh.inc };
  }
  if (pet.stage !== 'egg') return { ok: false, reason: '非孵化期' };
  var inc = PET_CONFIG.nutritionPerFeed[0] + Math.random() * (PET_CONFIG.nutritionPerFeed[1] - PET_CONFIG.nutritionPerFeed[0]);
  pet.hatchProgress = Math.min(100, pet.hatchProgress + inc);
  normalizePetStage(pet);  // 孵化满 → 立即成长期
  return { ok: true, progress: pet.hatchProgress, inc: inc, stage: pet.stage };
}

/* 喂饲料（成长期）：恢复饥饿 10%~15% */
function feedPet(pet) {
  /* v2.1.19：成熟期也需要喂饲料 —— 恢复饥饿 + 治疗受伤（4%~5%） */
  if (pet.stage === 'mature') {
    var mi = PET_CONFIG.feedHunger[0] + Math.random() * (PET_CONFIG.feedHunger[1] - PET_CONFIG.feedHunger[0]);
    pet.hunger = Math.min(100, pet.hunger + mi);
    var mh = healPetInjury(pet, 'feed');
    return { ok: true, hunger: pet.hunger, inc: mi, mature: true,
             injuryHeal: mh.ok ? Math.round(mh.progress) : null, healed: mh.ok ? mh.healed : false };
  }
  if (pet.stage !== 'grow') return { ok: false, reason: '非成长期' };
  var inc = PET_CONFIG.feedHunger[0] + Math.random() * (PET_CONFIG.feedHunger[1] - PET_CONFIG.feedHunger[0]);
  pet.hunger = Math.min(100, pet.hunger + inc);
  // 喂养加成长度（健康>50 时效果更好，符合"喂养→成长"直觉）
  var growInc = pet.health > 50 ? (2 + Math.random() * 3) : (1 + Math.random() * 2);
  pet.growth = Math.min(100, (pet.growth || 0) + growInc);
  // 成长满 100 → 成熟
  normalizePetStage(pet);  // 成长满 → 立即成熟
  if (pet.growth >= 100) { pet.stage = 'mature'; pet.isDead = false; return { ok: true, hunger: pet.hunger, inc: inc, matured: true, growth: pet.growth }; }
  return { ok: true, hunger: pet.hunger, inc: inc, growth: pet.growth };
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

/* 实时阶段校正（v2.0.9）：egg→grow（孵化满）/ grow→mature（成长满）
   解决 hatchProgress=100 但 stage 卡在 egg 的 bug（阶段转换原仅在每日结算触发） */
function normalizePetStage(pet) {
  if (pet.stage === 'egg' && pet.hatchProgress >= 100) {
    pet.stage = 'grow';
    if (pet.growth == null) pet.growth = 0;
  }
  if (pet.stage === 'grow' && pet.growth >= 100) {
    pet.stage = 'mature';
  }
  return pet;
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
  window.normalizePetStage = normalizePetStage;
  window.resonanceBonus = resonanceBonus;
  window.monthlyResetPet = monthlyResetPet;
  window.PET_LEVEL_MAX = PET_LEVEL_MAX;
  window.PET_LEVEL_EXP_MULT = PET_LEVEL_EXP_MULT;
  window.PET_LEVEL_BONUS_PCT = PET_LEVEL_BONUS_PCT;
  window.PET_LEVEL_BONUS_CAP_PCT = PET_LEVEL_BONUS_CAP_PCT;
  window.petLevelStepExp = petLevelStepExp;
  window.petLevelCumExp = petLevelCumExp;
  window.petLevelFromExp = petLevelFromExp;
  window.petLevelBonusPct = petLevelBonusPct;
  window.petLevelInfo = petLevelInfo;
  window.petLevelBonusOf = petLevelBonusOf;
  window.petLevelSync = petLevelSync;
  window.petLevelResetMonthly = petLevelResetMonthly;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_CONFIG = PET_CONFIG;
  globalThis.createPet = createPet;
  globalThis.feedNutrition = feedNutrition;
  globalThis.feedPet = feedPet;
  globalThis.settlePet = settlePet;
  globalThis.hatchCheck = hatchCheck;
  globalThis.normalizePetStage = normalizePetStage;
  globalThis.resonanceBonus = resonanceBonus;
  globalThis.monthlyResetPet = monthlyResetPet;
  globalThis.PET_LEVEL_MAX = PET_LEVEL_MAX;
  globalThis.PET_LEVEL_EXP_MULT = PET_LEVEL_EXP_MULT;
  globalThis.PET_LEVEL_BONUS_PCT = PET_LEVEL_BONUS_PCT;
  globalThis.PET_LEVEL_BONUS_CAP_PCT = PET_LEVEL_BONUS_CAP_PCT;
  globalThis.petLevelStepExp = petLevelStepExp;
  globalThis.petLevelCumExp = petLevelCumExp;
  globalThis.petLevelFromExp = petLevelFromExp;
  globalThis.petLevelBonusPct = petLevelBonusPct;
  globalThis.petLevelInfo = petLevelInfo;
  globalThis.petLevelBonusOf = petLevelBonusOf;
  globalThis.petLevelSync = petLevelSync;
  globalThis.petLevelResetMonthly = petLevelResetMonthly;
}

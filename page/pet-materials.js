/* ============================================
   MyHealth — Pet Materials & Refine (M4-2 + M4-3)
   材料系统：营养液/饲料/灵能/普通炼化石/高级炼化石/宝珠碎片。
   宠物炼化：属性成长（对标角色炼魂），等级上限按稀有度。
   纯逻辑，无 DOM/store。依赖 pets.js（createPet 结构）。
   ============================================ */

/* 材料库存结构 */
function createMaterialBag() {
  return {
    nutrition: 0,      // 营养液（孵化）
    feed: 0,           // 宠物饲料（饥饿）
    spirit: 0,         // 宠物灵能（技能升级）
    refineNormal: 0,   // 普通炼化石（炼化 1~50）
    refineHigh: 0,     // 高级炼化石（炼化 1~100）
    orbShard: 0        // 宝珠碎片（合成/升级）
  };
}

/* 材料增减（返回是否成功） */
function addMaterial(bag, type, n) {
  if (!bag || !(type in bag)) return false;
  bag[type] = (bag[type] || 0) + (n || 0);
  return true;
}
function spendMaterial(bag, type, n) {
  if (!bag || !(type in bag)) return false;
  if ((bag[type] || 0) < n) return false;
  bag[type] -= n;
  return true;
}

/* 炼化等级上限（按稀有度） */
function refineMaxLevel(rarity) {
  return { R: 50, SR: 60, SSR: 80, UR: 100 }[rarity] || 50;
}

/* 炼化成功率：
   - 普通炼化石：1~50 可用，无修正（基础成功率）
   - 高级炼化石：1~50 100% / 50~80 +10% / 80~100 无修正 */
function refineSuccessRate(pet, stoneType) {
  var lv = pet.refineLevel || 0;
  var base = 0.7;   // 基础成功率（无修正）
  if (stoneType === 'refineHigh') {
    if (lv < 50) return 1.0;      // 1~50 必成
    if (lv < 80) return base + 0.1;  // 50~80 +10%
    return base;                  // 80~100 无修正
  }
  // 普通炼化石：1~50 可用
  if (lv >= 50) return 0;         // 超 50 不可用
  return base;
}

/* 每级属性增量（按稀有度） */
function refineStatGain(rarity) {
  return {
    R:  { hp: 30, atk: 4, def: 2, soulAtk: 2, soulDef: 1 },
    SR: { hp: 40, atk: 5, def: 2, soulAtk: 3, soulDef: 1 },
    SSR:{ hp: 50, atk: 6, def: 3, soulAtk: 4, soulDef: 2 },
    UR: { hp: 60, atk: 6, def: 3, soulAtk: 4, soulDef: 2 }
  }[rarity] || { hp: 30, atk: 4, def: 2, soulAtk: 2, soulDef: 1 };
}

/* 执行一次炼化（消耗 1 炼化石）
   stoneType: 'refineNormal' | 'refineHigh'
   返回 {ok, level, stat, gained, success, reason?} */
function attemptRefine(pet, bag, stoneType) {
  stoneType = stoneType || 'refineNormal';
  var maxLv = refineMaxLevel(pet.rarity);
  if ((pet.refineLevel || 0) >= maxLv) return { ok: false, reason: '已达炼化上限' };
  if (!bag || !spendMaterial(bag, stoneType, 1)) return { ok: false, reason: '炼化石不足' };
  var rate = refineSuccessRate(pet, stoneType);
  if (Math.random() > rate) return { ok: false, success: false, reason: '炼化失败' };
  // 成功：随机提升 1 个属性 1 级
  var gains = refineStatGain(pet.rarity);
  var keys = Object.keys(gains);
  var stat = keys[Math.floor(Math.random() * keys.length)];
  pet.refineLevel = (pet.refineLevel || 0) + 1;
  pet.refineStats = pet.refineStats || {};
  pet.refineStats[stat] = (pet.refineStats[stat] || 0) + gains[stat];
  return { ok: true, success: true, level: pet.refineLevel, stat: stat, gained: gains[stat] };
}

/* 使用宠物灵能：随机提升一个宠物技能 1 级 */
function useSpirit(pet, bag, skillIds) {
  if (!bag || (bag.spirit || 0) < 1) return { ok: false, reason: '灵能不足' };
  var list = (skillIds && skillIds.length) ? skillIds : Object.keys(pet.skillLevels || {});
  if (!list.length) return { ok: false, reason: '无技能可升级' };
  bag.spirit--;
  var sid = list[Math.floor(Math.random() * list.length)];
  pet.skillLevels = pet.skillLevels || {};
  pet.skillLevels[sid] = (pet.skillLevels[sid] || 0) + 1;
  return { ok: true, skillId: sid, level: pet.skillLevels[sid] };
}

/* 使用营养液（孵化进度） */
function useNutrition(pet, bag) {
  if (!bag || (bag.nutrition || 0) < 1) return { ok: false, reason: '营养液不足' };
  if (pet.stage !== 'egg') return { ok: false, reason: '非孵化期' };
  bag.nutrition--;
  return feedNutrition(pet);
}

/* 使用饲料（恢复饥饿） */
function useFeed(pet, bag) {
  if (!bag || (bag.feed || 0) < 1) return { ok: false, reason: '饲料不足' };
  if (pet.stage !== 'grow' && pet.stage !== 'mature') return { ok: false, reason: '当前阶段不需要饲料' };
  bag.feed--;
  return feedPet(pet);
}

/* 月度重置：材料清空（炼化等级由 monthlyResetPet 处理） */
function monthlyResetMaterials(bag) {
  if (!bag) return bag;
  bag.nutrition = 0;
  bag.feed = 0;
  bag.spirit = 0;
  bag.refineNormal = 0;
  bag.refineHigh = 0;
  bag.orbShard = 0;
  return bag;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.createMaterialBag = createMaterialBag;
  window.addMaterial = addMaterial;
  window.spendMaterial = spendMaterial;
  window.refineMaxLevel = refineMaxLevel;
  window.refineSuccessRate = refineSuccessRate;
  window.attemptRefine = attemptRefine;
  window.useSpirit = useSpirit;
  window.useNutrition = useNutrition;
  window.useFeed = useFeed;
  window.monthlyResetMaterials = monthlyResetMaterials;
}
if (typeof globalThis !== 'undefined') {
  globalThis.createMaterialBag = createMaterialBag;
  globalThis.addMaterial = addMaterial;
  globalThis.spendMaterial = spendMaterial;
  globalThis.refineMaxLevel = refineMaxLevel;
  globalThis.refineSuccessRate = refineSuccessRate;
  globalThis.attemptRefine = attemptRefine;
  globalThis.useSpirit = useSpirit;
  globalThis.useNutrition = useNutrition;
  globalThis.useFeed = useFeed;
  globalThis.monthlyResetMaterials = monthlyResetMaterials;
}

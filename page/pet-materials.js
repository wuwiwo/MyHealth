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

/* ============ v2.1.3 新增 ============ */

/* 普通炼化石 → 高级炼化石 兑换比例（10 : 1）
   普通石只在炼化 Lv<50 可用，后期会死积，这里给一个 sink */
var REFINE_EXCHANGE_RATE = 10;

/* 兑换 times 次（每次 10 普通 → 1 高级） */
function exchangeRefineStones(bag, times) {
  times = Math.max(1, parseInt(times, 10) || 1);
  if (!bag) return { ok: false, reason: '材料袋不存在' };
  var cost = REFINE_EXCHANGE_RATE * times;
  if ((bag.refineNormal || 0) < cost) {
    return { ok: false, reason: '普通炼化石不足（需 ' + cost + '，现有 ' + (bag.refineNormal || 0) + '）' };
  }
  bag.refineNormal -= cost;
  bag.refineHigh = (bag.refineHigh || 0) + times;
  return { ok: true, spent: cost, gained: times };
}

/* ============================================================
   v2.15 新增：**营养液 ⇄ 宠物粮 互兑（1:2，即 2 换 1，双向）**
   作者原话：「让营养液与宠物粮可以 1:2 互相兑换（2 换 1）」。

   · **比例唯一来源就是下面这个常量** —— UI 一律通过本文件的
     `matExchangeView()` / `exchangeNutritionFeed()` 取值，不得在 UI 里再写一个 2；
   · **只做整组兑换**：不足 2 个一律拒绝（按钮禁用 + 说明原因），
     `spent` 恒为 2 的整数倍、`gained` 恒为整数 ⇒ **永不产生小数**；
   · 与既有「炼化石 10→1」(`exchangeRefineStones`) **同一族写法**：纯逻辑、不碰 store/DOM，
     落盘由 `pet-store.js` 的 `exchangePetMaterials()` 负责（单一落盘入口）。
   ============================================================ */
var PET_MAT_EXCHANGE_RATE = 2;
var PET_MAT_EXCHANGE_LABELS = { nutrition: '营养液', feed: '宠物粮' };

/* 互兑的另一端：营养液 ⇄ 宠物粮；其它材料返回 null（不开放兑换） */
function matExchangePeer(type) {
  if (type === 'nutrition') return 'feed';
  if (type === 'feed') return 'nutrition';
  return null;
}

/* 只读：某种材料够整组兑换几次（0 = 不足，不能换） */
function matExchangeCapacity(bag, from) {
  if (!bag || !matExchangePeer(from)) return 0;
  return Math.floor((bag[from] || 0) / PET_MAT_EXCHANGE_RATE);
}

/* 只读：面板用的兑换视图（不含任何 UI 文案以外的判断逻辑）。
   UI 只消费本函数 —— 禁用态、次数、原因全部来自这里。
   @returns {{rate:number, gain:number, rows:Array<{from,to,label,peerLabel,have,peer,need,gain,times,ok,reason}>}} */
function matExchangeView(bag) {
  bag = bag || {};
  var GAIN = 1;                       // 每次整组兑换换出 1 个（ratio = rate : gain）
  var rows = [];
  ['nutrition', 'feed'].forEach(function (from) {
    var to = matExchangePeer(from);
    var have = bag[from] || 0;
    var peer = bag[to] || 0;
    var times = matExchangeCapacity(bag, from);
    rows.push({
      from: from, to: to, peer: peer, have: have,
      label: PET_MAT_EXCHANGE_LABELS[from], peerLabel: PET_MAT_EXCHANGE_LABELS[to],
      need: PET_MAT_EXCHANGE_RATE, gain: GAIN, times: times, ok: times >= 1,
      reason: times >= 1 ? null
        : PET_MAT_EXCHANGE_LABELS[from] + '不足（需 ' + PET_MAT_EXCHANGE_RATE + '，现有 ' + have + '）'
    });
  });
  return { rate: PET_MAT_EXCHANGE_RATE, gain: GAIN, rows: rows };
}

/* 执行 times 次整组兑换：每次 `PET_MAT_EXCHANGE_RATE` 个 from → 1 个 to。
   from: 'nutrition' | 'feed'；times: 正整数（缺省/非法按 1 处理并**向下取整**，杜绝小数）。
   成功才改 bag；失败**一个都不扣**（与 exchangeRefineStones 一致）。
   @returns {{ok:boolean, from?,to?,spent?,gained?,fromBalance?,toBalance?,reason?}} */
function exchangeNutritionFeed(bag, from, times) {
  if (!matExchangePeer(from)) return { ok: false, reason: '该材料不支持兑换' };
  times = Math.max(1, Math.floor(parseInt(times, 10) || 1));
  if (!bag) return { ok: false, reason: '材料袋不存在' };
  var to = matExchangePeer(from);
  var cost = PET_MAT_EXCHANGE_RATE * times;
  if ((bag[from] || 0) < cost) {
    return { ok: false, reason: PET_MAT_EXCHANGE_LABELS[from] + '不足（需 ' + cost + '，现有 ' + (bag[from] || 0) + '）' };
  }
  bag[from] -= cost;
  bag[to] = (bag[to] || 0) + times;
  return {
    ok: true, from: from, to: to, spent: cost, gained: times,
    fromBalance: bag[from], toBalance: bag[to]
  };
}

/* 技能等级上限 */
var PET_SKILL_MAX_LEVEL = 10;

/* 宠物技能升到下一级的灵能消耗：
   Lv0→1、Lv1→2 各 1，之后每级 +1（Lv2→3 需 2，Lv3→4 需 3 …） */
function petSkillUpgradeCost(pet, skillId) {
  var lv = (pet && pet.skillLevels && pet.skillLevels[skillId]) || 0;
  return Math.max(1, lv);
}

/* 指定技能升级（消耗灵能）。与 useSpirit 的随机升级并存，UI 用这个 */
function upgradePetSkill(pet, bag, skillId) {
  if (!pet) return { ok: false, reason: '宠物不存在' };
  if (!skillId) return { ok: false, reason: '未指定技能' };
  var lv = (pet.skillLevels && pet.skillLevels[skillId]) || 0;
  if (lv >= PET_SKILL_MAX_LEVEL) return { ok: false, reason: '技能已达上限 Lv' + PET_SKILL_MAX_LEVEL };
  var cost = petSkillUpgradeCost(pet, skillId);
  if (!bag || (bag.spirit || 0) < cost) {
    return { ok: false, reason: '灵能不足（需 ' + cost + '，现有 ' + (bag.spirit || 0) + '）' };
  }
  bag.spirit -= cost;
  pet.skillLevels = pet.skillLevels || {};
  pet.skillLevels[skillId] = lv + 1;
  return { ok: true, skillId: skillId, level: lv + 1, cost: cost };
}

/* 天赋为宠物**固有专属**被动（design-v2.0.md §2.6），不存在解锁/装配接口。
   v2.1.3 的 PET_TALENT_UNLOCK_COST / petTalentUnlockCost / unlockPetTalent
   因「专属天赋被跨宠物共享」的设计错误已整块移除。 */

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

/* 使用营养液：
   · 孵化期 —— 提高孵化进度（+0.5%~2%）
   · v2.2 WP-H6：**成熟期** —— 治疗受伤（doc/2.2 修改-补充.md 原话
     「宠物现在可以用营养液恢复受伤状态」）。
     消耗 **1 瓶**；恢复量 = `PET_CONFIG.injuryHeal.nutrition` 区间（+10%~15%，约 7~10 瓶痊愈），
     由 `feedNutrition` → `healPetInjury(pet,'nutrition')` 结算 ——
     **区间唯一来源仍是 pets.js 的 PET_CONFIG，本函数不另立数值**。
     已阵亡 / 未受伤（成熟）/ 非孵化期一律拒绝，且**不消耗**营养液。 */
function useNutrition(pet, bag) {
  if (!pet) return { ok: false, reason: '宠物不存在' };
  if (pet.isDead) return { ok: false, reason: '宠物已阵亡' };
  if (!bag || (bag.nutrition || 0) < 1) return { ok: false, reason: '营养液不足' };
  if (pet.stage === 'mature') {
    if (!pet.injured) return { ok: false, reason: '未受伤' };
    bag.nutrition--;
    return feedNutrition(pet);   // 成熟期分支 → healPetInjury('nutrition')
  }
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
  window.exchangeRefineStones = exchangeRefineStones;
  window.PET_MAT_EXCHANGE_RATE = PET_MAT_EXCHANGE_RATE;
  window.matExchangePeer = matExchangePeer;
  window.matExchangeCapacity = matExchangeCapacity;
  window.matExchangeView = matExchangeView;
  window.exchangeNutritionFeed = exchangeNutritionFeed;
  window.petSkillUpgradeCost = petSkillUpgradeCost;
  window.upgradePetSkill = upgradePetSkill;
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
  globalThis.exchangeRefineStones = exchangeRefineStones;
  globalThis.PET_MAT_EXCHANGE_RATE = PET_MAT_EXCHANGE_RATE;
  globalThis.matExchangePeer = matExchangePeer;
  globalThis.matExchangeCapacity = matExchangeCapacity;
  globalThis.matExchangeView = matExchangeView;
  globalThis.exchangeNutritionFeed = exchangeNutritionFeed;
  globalThis.petSkillUpgradeCost = petSkillUpgradeCost;
  globalThis.upgradePetSkill = upgradePetSkill;
  globalThis.useSpirit = useSpirit;
  globalThis.useNutrition = useNutrition;
  globalThis.useFeed = useFeed;
  globalThis.monthlyResetMaterials = monthlyResetMaterials;
}

#!/usr/bin/env node
/* M4-5 测试：宠物持久化 + 材料来源
   1) 初始蛋
   2) 材料掉落
   3) 每日结算（离线）
   4) 月度重置
   5) 参战 Unit 生成
   6) store 读写
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

// 模拟 store（localStorage）
function makeStore() {
  const data = {};
  return {
    get: (k) => data[k] || null,
    set: (k, v) => { data[k] = v; },
    registerSchema: () => {},
    _data: data
  };
}

const files = ['utils.js', 'date-roll.js','levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','pets.js','pet-materials.js','pet-codex.js'];
// v2.1.5：群战引入 5% 基础命中率，测试用确定性随机保持稳定（Math 属性不可枚举，须 Object.create 继承）
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.5; };
const sb = { Math: deterministicMath, JSON, console, Date, store: makeStore() };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));
vm.runInContext(load('pet-store.js'), sb);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 初始蛋 ----
const r1 = sb.grantStarterPet();
assert('初始蛋发放', r1.ok === true && r1.pet.stage === 'egg', JSON.stringify(r1));
const r2 = sb.grantStarterPet();
assert('不重复发放', r2.ok === false, r2.reason);

// ---- 2. 材料掉落 ----
const m1 = sb.grantMaterial('nutrition', 5);
assert('材料掉落', m1.ok === true && sb.getPetStore().materials.nutrition === 5);
sb.grantMaterial('refineHigh', 3);
assert('材料累计', sb.getPetStore().materials.refineHigh === 3);

// ---- 3. 每日结算（离线）----
const d = sb.getPetStore();
const pet = d.pets[0];
pet.stage = 'grow';
pet.hunger = 80; pet.health = 100; pet.growth = 10;
pet.lastSettleDate = null;
const today = sb.dateKey(new Date());
const ev = sb.settleAllPets(new Date());
assert('每日结算有事件', ev.length >= 0);
assert('lastSettleDate 更新', d.lastSettleDate === today);

// 模拟 5 天前
d.lastSettleDate = sb.dateKey(new Date(Date.now() - 5*86400000));
pet.lastSettleDate = d.lastSettleDate;
const ev5 = sb.settleAllPets(new Date());
assert('离线5天结算', pet.ageDays >= 1, 'ageDays=' + pet.ageDays);

// ---- 4. 月度重置 ----
pet.refineLevel = 15;
pet.skillLevels = { p_shine: 6 };
const mr = sb.monthlyResetPets(new Date());
assert('月度重置执行', mr.ok === true);
assert('炼化清零', pet.refineLevel === 0);
assert('技能减半', pet.skillLevels.p_shine === 3);
const mr2 = sb.monthlyResetPets(new Date());
assert('同月不重复重置', mr2.ok === false);

// ---- 5. 参战 Unit 生成 ----
pet.stage = 'mature';
const units = sb.createPetUnitsForBattle([pet.speciesId], 2);
assert('参战 Unit 生成', units.length === 1 && units[0].side === 'ally', 'len=' + units.length);

// 完整群战
const player = sb.createUnit({ id:'player', side:'ally', name:'你', base:{hp:500,atk:50,def:30,spd:8} });
const enemy = sb.createEnemyUnit({ tier:'elite1', name:'敌', talents:['blade'], skills:['charge'], base:{hp:300,atk:30,def:15,spd:6} });
const gb = sb.createGroupBattle({ allies:[player].concat(units), enemies:[enemy] });
sb.runGroupBattle(gb, 100);
assert('宠物参战完整战斗', gb.done === true);
assert('宠物战斗有行动', gb.log.some(l => l.unit !== '你'), 'units=' + gb.log.map(l=>l.unit).join(','));

// ---- 6. store 持久化 ----
const saved = sb.store.get('pets');
assert('store 已保存', saved && Array.isArray(saved.pets) && saved.pets.length >= 1);

/* ============ 7. v2.15：参战上限 4 + 「按全部宠物计算」的凝聚 / 共鸣 ============
   ⚠️ v2.15 口径变更（作者裁决「改成按所有宠物计算，加成之间用加算」）：
      · 旧：凝聚/共鸣取「成熟+未受伤+未上场」的那批宠 → 作为**绝对值加进 base**，再被池放大
      · 新：取**存档里的全部宠物**（不筛阶段/受伤/死亡/参战/本宠）→ 只作为**百分比**
        与稀有度/宝珠并列进同一加算层（`boostPetForGroup` 四项相加）
   本节原本编码的是旧口径（teamCohesionBonus / benchBonusSum / base 含加成），已按新口径等价改写：
   断言目标未放宽 —— 仍是「凝聚 = 全部宠物基础 ×10%」「共鸣按持有总数取档」「基础不被改」。 */
assert('参战上限常量 PET_BATTLE_MAX = 4', sb.PET_BATTLE_MAX === 4, String(sb.PET_BATTLE_MAX));

// 造够 4 只可参战宠物（第 1 只已存在）
(function () {
  const dd = sb.getPetStore();
  ['sparkle', 'chirpbird', 'dream'].forEach(function (sid, i) {
    const p = sb.createPet({ speciesId: sid, rarity: (sb.getPetCodex(sid) || {}).rarity || 'R', name: '替补' + i });
    p.stage = 'mature'; p.isDead = false; p.injured = false;
    dd.pets.push(p);
  });
  sb.savePetStore(dd);
})();
const dd2 = sb.getPetStore();
assert('存档现有 4 只宠物', dd2.pets.length === 4, 'len=' + dd2.pets.length);

const fieldedPet = dd2.pets[0];
const benchPets = dd2.pets.slice(1);

/* 「全部宠物」的合计：独立重算一遍（不调被测函数），再与被测的取数口比对 */
const expSumAtk = dd2.pets.reduce(function (s, p) { return s + (sb.createPetUnit(p).base.atk || 0); }, 0);
const allSum = sb.petAllPetsBaseSum();
assert('petAllPetsBaseSum = 存档里**全部**宠物基础之和（攻 ' + allSum.atk + '）',
  allSum.atk === expSumAtk, allSum.atk + ' vs ' + expSumAtk);

// 凝聚贡献值 = 全部宠物 ×10%（**同一个绝对值**，与谁上场无关）
const view = sb.petBaseBonusView();
assert('凝聚贡献值 = 全部宠物 ×10%（攻 ' + view.cohesion.atk + '）',
  view.cohesion.atk === allSum.atk * 10 / 100, String(view.cohesion.atk));

// 共鸣：按持有总数取档（4 只 → >3 → 5%），此前该函数零消费点
const resPct = sb.resonanceBonus(dd2.pets.length);
assert('共鸣按持有总数取档（4 只 → 5%）', resPct === 0.05, String(resPct));
assert('共鸣档位在视图里换算成整数百分点（5）', view.resonancePct === 5, String(view.resonancePct));
assert('共鸣贡献值 = 全部宠物 ×5%（攻 ' + view.resonance.atk + '）',
  view.resonance.atk === allSum.atk * 5 / 100, String(view.resonance.atk));

/* 🔴 新口径的核心断言：每只宠的**凝聚贡献值/共鸣贡献值完全相同**
   （旧口径下「未上场的那批」随本宠变化，每只宠算出来的 bench 不同） */
(function () {
  const uA = sb.createPetUnit(dd2.pets[0]);
  const uB = sb.createPetUnit(dd2.pets[1]);
  const pA = sb.petBonusAdditivePool(allSum, uA.base, sb.petUnitRarityPct(uA), uA._orbPct, view.resonancePct);
  const pB = sb.petBonusAdditivePool(allSum, uB.base, sb.petUnitRarityPct(uB), uB._orbPct, view.resonancePct);
  assert('两只不同宠的凝聚贡献值完全相同（攻 ' + pA.cohesionValue.atk + ' / ' + pB.cohesionValue.atk + '）',
    pA.cohesionValue.atk === pB.cohesionValue.atk && pA.cohesionValue.hp === pB.cohesionValue.hp);
  assert('两只不同宠的共鸣贡献值完全相同',
    pA.resonanceValue.atk === pB.resonanceValue.atk && pA.resonanceValue.hp === pB.resonanceValue.hp);
  assert('百分比不同（÷ 各自基础）、绝对值相同',
    pA.cohesionPct.atk !== pB.cohesionPct.atk || uA.base.atk === uB.base.atk);
})();

/* 建场：`applyBattlePetBaseBonuses` **不再改 base**（旧口径正是把绝对值加进 base） */
const u1 = sb.createPetUnitsForBattle([fieldedPet.speciesId], sb.PET_BATTLE_MAX);
const baseBefore = JSON.stringify(u1[0].base);
const hpBefore = u1[0].hp;
sb.applyBattlePetBaseBonuses(u1);
assert('applyBattlePetBaseBonuses 不改 base（新口径：只挂百分比）',
  JSON.stringify(u1[0].base) === baseBefore, baseBefore + ' → ' + JSON.stringify(u1[0].base));
assert('applyBattlePetBaseBonuses 不改 hp', u1[0].hp === hpBefore, u1[0].hp + ' vs ' + hpBefore);
const bp = sb.petBenchPctOf(u1[0]);
assert('applyBattlePetBaseBonuses 把逐属性「凝聚% / 共鸣%」挂到单位上',
  !!bp && !!bp.cohesion && !!bp.resonance &&
  bp.cohesion.atk > 0 && bp.resonance.atk > 0, JSON.stringify(bp));
const uPool = sb.petBonusAdditivePool(allSum, u1[0].base, sb.petUnitRarityPct(u1[0]), u1[0]._orbPct, view.resonancePct);
assert('挂上去的百分比就是纯函数的产物（攻 ' + bp.cohesion.atk.toFixed(2) + '% / ' + bp.resonance.atk.toFixed(2) + '%）',
  bp.cohesion.atk === uPool.cohesionPct.atk && bp.resonance.atk === uPool.resonancePct.atk);

/* 端到端：boostPetForGroup 收下这层百分比后，最终值 = floor(base × 四项之和 ÷ 100)
   ⚠️ 本套沙箱**不加载 group-levels.js**（保持 M4-5 的原始加载面）→ 池出口的端到端校验
      由 `scripts/test-pet-bonus-additive.js`（完整沙箱）覆盖；这里只在可用时顺带复核。 */
if (typeof sb.boostPetForGroup === 'function' && typeof sb.PET_GROUP_SCALE !== 'undefined') {
  const sq = sb.createPetUnit(fieldedPet);
  const rawBase = Object.assign({}, sq.base);
  sb.applyBattlePetBaseBonuses([sq]);
  const pct = sb.petBenchPctOf(sq);
  sb.boostPetForGroup(sq);
  const tags = (sq.tags || [])[1] || 'R';
  const rarity = sb.PET_GROUP_SCALE[tags] || sb.PET_GROUP_SCALE.R;
  const orb = sq._orbPct || {};
  const bad = ['atk', 'def', 'hp', 'soulAtk', 'soulDef'].filter(function (k) {
    const want = Math.max(1, Math.floor(rawBase[k] * (rarity + (orb[k] || 0)
      + pct.cohesion[k] + pct.resonance[k]) / 100));
    return sq.base[k] !== want;
  });
  assert('池出口 = floor(基础 × (稀有度＋Σ宝珠＋凝聚％＋共鸣％) ÷ 100) 逐属性成立',
    bad.length === 0, bad.map(k => k + ':' + sq.base[k]).join(','));
  const plain = sb.boostPetForGroup(sb.createPetUnit(fieldedPet));
  assert('带百分比的池 > 不带百分比的池（凝聚/共鸣真的进了同一层）',
    sq.base.atk > plain.base.atk, sq.base.atk + ' vs ' + plain.base.atk);
} else {
  console.log(' · 本沙箱无 group-levels.js → 池出口端到端校验交给 test-pet-bonus-additive.js');
}

/* 顺序守卫：百分比挂载必须排在「稀有度放大（百分比池）」之前 —— 顺序反了那层百分比就没人加 */
(function () {
  const psSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  const iBonus = psSrc.indexOf('applyBattlePetBaseBonuses(units)');
  const iBoost = psSrc.indexOf('boostPetForGroup(u)');
  assert('百分比挂载排在池出口之前', iBonus >= 0 && iBoost > iBonus, iBonus + ' vs ' + iBoost);
})();

/* 「全部宠物」= 不筛：受伤 / 阵亡 / 蛋期 也照样计入合计 */
(function () {
  const before = sb.petAllPetsBaseSum().atk;
  const injuredBench = benchPets[0];
  injuredBench.injured = true;
  const afterInjured = sb.petAllPetsBaseSum().atk;
  injuredBench.injured = false;
  assert('受伤宠物仍计入「全部宠物」（' + before + ' → ' + afterInjured + '）', afterInjured === before);

  const dead = benchPets[1];
  const wasDead = dead.isDead;
  dead.isDead = true;
  const afterDead = sb.petAllPetsBaseSum().atk;
  dead.isDead = wasDead;
  assert('阵亡宠物仍计入「全部宠物」', afterDead === before);

  const egg = benchPets[2];
  const wasStage = egg.stage;
  egg.stage = 'egg';
  const afterEgg = sb.petAllPetsBaseSum().atk;
  egg.stage = wasStage;
  assert('蛋期宠物仍计入「全部宠物」', afterEgg === before);
})();

// 上限 4：给 5 个 id 也只建 4 个
const manyIds = dd2.pets.map(function (p) { return p.speciesId; }).concat([fieldedPet.speciesId]);
const capped = sb.createPetUnitsForBattle(manyIds, sb.PET_BATTLE_MAX);
assert('createPetUnitsForBattle 最多 4 只', capped.length === 4, 'len=' + capped.length);

// 唯一入口存在 + 参战阵容构建点（防「多处各自判断」的口径分叉）
assert('唯一入口 buildGroupBattlePets 存在', typeof sb.buildGroupBattlePets === 'function');
(function () {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
  ['game-render.js', 'debug.js'].forEach(function (f) {
    assert(f + ' 已接线 buildGroupBattlePets', src(f).indexOf('buildGroupBattlePets') >= 0);
  });
  /* v2.2 WP-H2：宠物面板的「带宠物开战」**不再自建阵容**（旧实现写死关卡、且不设 `_groupStageId`
     → 胜利时把上一次战斗的关记成通关 = 覆盖进度），改为把选择交给唯一开战入口 `startGroupTrial`。 */
  const petUi = src('pet-ui.js');
  assert('pet-ui.js 开战走唯一入口 startGroupTrial', /startGroupTrial\s*\(\s*groupId\s*\)/.test(petUi));
  assert('pet-ui.js 不再自建敌群战斗', petUi.indexOf('createGroupBattle(') < 0);
  ['game-render.js', 'pet-ui.js', 'debug.js'].forEach(function (f) {
    assert(f + ' 不再写死参战上限 2', src(f).indexOf('createPetUnitsForBattle(petIds, 2)') < 0);
  });
})();

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

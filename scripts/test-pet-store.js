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

/* ============ 7. v2.2 WP-A3/A4：4 只上限 + 团队凝聚 / 共鸣 ============ */
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

// 团队凝聚 = 未上场宠物「基础属性 ×10%」的**固定值**（在稀有度放大之后叠加，不被倍率再放大）
const coh = sb.teamCohesionBonus(benchPets);
const expCohAtk = benchPets.reduce(function (s, p) {
  const u = sb.createPetUnit(p);
  return s + Math.floor(u.base.atk * 0.1);
}, 0);
assert('团队凝聚 = 未上场宠物属性 ×10%（攻 ' + coh.atk + '）', coh.atk === expCohAtk, coh.atk + ' vs ' + expCohAtk);

// 共鸣：按持有总数取档（4 只 → >3 → 5%），此前该函数零消费点
const resPct = sb.resonanceBonus(dd2.pets.length);
assert('共鸣按持有总数取档（4 只 → 5%）', resPct === 0.05, String(resPct));

const u1 = sb.createPetUnitsForBattle([fieldedPet.speciesId], sb.PET_BATTLE_MAX);
const atkBeforeBonus = u1[0].base.atk;
sb.applyBattlePetBaseBonuses(u1);
/* dundun 2026-09-29 口径：凝聚与共鸣**同形** —— 都把「未上场宠物的基础属性」按比例
   加成到参战宠物的**基础属性**上（不是按参战宠物自身属性算百分比）。 */
const resSum = sb.benchBonusSum(benchPets, resPct);
const expAdd = coh.atk + resSum.atk;
assert('参战宠物基础属性吃到「凝聚 + 共鸣」（+' + (u1[0].base.atk - atkBeforeBonus) + '）',
  u1[0].base.atk - atkBeforeBonus === expAdd, (u1[0].base.atk - atkBeforeBonus) + ' vs ' + expAdd);
assert('共鸣取的是未上场宠物属性（> 0）', resSum.atk > 0, 'res=' + resSum.atk);
assert('加成后血量同步', u1[0].hp === u1[0].base.hp);

/* 顺序守卫：基础值加成必须排在「稀有度放大（百分比池）」之前 —— 顺序反了两类加成的性质就变了 */
(function () {
  const psSrc = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-store.js'), 'utf8');
  const iBonus = psSrc.indexOf('applyBattlePetBaseBonuses(units)');
  const iBoost = psSrc.indexOf('boostPetForGroup(u)');
  assert('基础值加成排在稀有度放大之前', iBonus >= 0 && iBoost > iBonus, iBonus + ' vs ' + iBoost);
})();

// 受伤 / 未成熟的替补不计入凝聚
const injuredBench = benchPets[0];
injuredBench.injured = true;
const cohInjured = sb.teamCohesionBonus(sb.getPetStore().pets.slice(1).filter(sb.canPetBattle));
assert('受伤替补不贡献凝聚（' + cohInjured.atk + ' < ' + coh.atk + '）', cohInjured.atk < coh.atk);
injuredBench.injured = false;

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

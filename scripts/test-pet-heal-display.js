#!/usr/bin/env node
/* v2.2 WP-H「宠物面板」子批测试（三件）：
   1) H6 —— 营养液治疗受伤的成熟宠物（`useNutrition`，此前被「非孵化期」挡住）
   2) H5 —— 一键修复受伤（`healAllInjuredPets`，自动消耗营养液；已阵亡/不可治疗的不参与）
   3) H5 —— 面板显示「基础 ＋ 加成（凝聚/共鸣/宝珠%）→ 最终属性」（`petStatBreakdown`，**只读**）
   另：源码级接线守卫（UI 真的调用这三个入口，且面板**不重写**数值口径）。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* 确定性随机（mulberry32 同型）—— 让治疗次数可复现 */
function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const sb = { Math: M, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js'].forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }

function seedStore(sb, pets, materials) {
  sb.store.set('pets', {
    version: 1, pets: pets, materials: materials || emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null
  });
}

/* 造一只成熟宠物（stage 可被 over 覆盖） */
function mkPet(sb, speciesId, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ============================================================
   1) H6 营养液治疗受伤的成熟宠物
   ============================================================ */
console.log('\n[1] H6 营养液治疗（useNutrition）');
const sb = makeSandbox(20261001);
const bag = sb.createMaterialBag();
sb.addMaterial(bag, 'nutrition', 50);

const pA = mkPet(sb, 'icecrystal');
sb.injurePet(pA);
const nBefore = bag.nutrition;
const r1 = sb.useNutrition(pA, bag);
assert('成熟受伤宠物可以喂营养液（此前被「非孵化期」拒绝）', r1.ok === true, JSON.stringify(r1));
assert('单次消耗 1 瓶营养液', bag.nutrition === nBefore - 1, bag.nutrition + ' vs ' + (nBefore - 1));
assert('单次恢复量落在 PET_CONFIG 区间 10%~15%', r1.inc >= 10 && r1.inc <= 15, 'inc=' + r1.inc);
assert('恢复量真的写进了受伤进度', pA.injuryHeal > 0 && pA.injured === true, 'heal=' + pA.injuryHeal);

let steps = 1;
while (pA.injured && steps < 60) { const r = sb.useNutrition(pA, bag); steps++; if (!r.ok) break; }
assert('约 7~10 瓶痊愈（实际 ' + steps + ' 瓶）', steps >= 7 && steps <= 10, String(steps));
assert('痊愈后 injured=false 且进度归零', pA.injured === false && pA.injuryHeal === 0);

const n0 = bag.nutrition;
const pB = mkPet(sb, 'sparkle');
const r2 = sb.useNutrition(pB, bag);
assert('未受伤的成熟宠物被拒且不消耗', r2.ok === false && /未受伤/.test(r2.reason) && bag.nutrition === n0, JSON.stringify(r2));

const pD = mkPet(sb, 'sparkle', { isDead: true });
const r3 = sb.useNutrition(pD, bag);
assert('已阵亡宠物被拒且不消耗', r3.ok === false && /阵亡/.test(r3.reason) && bag.nutrition === n0, JSON.stringify(r3));

const empty = sb.createMaterialBag();
const pE0 = mkPet(sb, 'chirpbird'); sb.injurePet(pE0);
const r4 = sb.useNutrition(pE0, empty);
assert('营养液为 0 时拒绝', r4.ok === false && /营养液不足/.test(r4.reason), JSON.stringify(r4));
assert('营养液为 0 时不改动受伤进度', pE0.injured === true && (pE0.injuryHeal || 0) === 0);

const egg = sb.createPet({ speciesId: 'waterdrop', rarity: 'R', name: '蛋' });
sb.addMaterial(bag, 'nutrition', 2);
const r5 = sb.useNutrition(egg, bag);
assert('回归：蛋期喂营养液仍涨孵化进度', r5.ok === true && egg.hatchProgress > 0, JSON.stringify(r5));
const growP = sb.createPet({ speciesId: 'waterdrop', rarity: 'R', name: '成长' });
growP.stage = 'grow';
const r6 = sb.useNutrition(growP, bag);
assert('回归：成长期仍拒绝（非孵化期）', r6.ok === false && /非孵化期/.test(r6.reason), JSON.stringify(r6));

assert('恢复区间唯一来源 = PET_CONFIG.injuryHeal.nutrition',
  JSON.stringify(sb.PET_CONFIG.injuryHeal.nutrition) === JSON.stringify([10, 15]),
  JSON.stringify(sb.PET_CONFIG.injuryHeal.nutrition));
assert('pet-materials.js 不另立恢复数值（复用 pets.js 的 feedNutrition）',
  /return feedNutrition\(pet\)/.test(src('pet-materials.js')) &&
  !/injuryHeal\s*:/.test(src('pet-materials.js')));

/* ============================================================
   2) H5 一键治疗（healAllInjuredPets）
   ============================================================ */
console.log('\n[2] H5 一键修复受伤（healAllInjuredPets）');
const sb2 = makeSandbox(20261002);
const P = [
  mkPet(sb2, 'sparkle'),                        // 0 成熟·健康
  mkPet(sb2, 'icecrystal'),                     // 1 成熟·受伤（小冰晶）
  mkPet(sb2, 'chirpbird'),                      // 2 成熟·受伤（清脆鸟）
  mkPet(sb2, 'dream', { isDead: true }),        // 3 已阵亡（顺手标成 injured）
  mkPet(sb2, 'nonebear')                        // 4 非成熟（手标 injured）
];
P[4].stage = 'egg';
sb2.injurePet(P[1]); sb2.injurePet(P[2]);
P[3].injured = true; P[3].injuryHeal = 0;       // 手工标记（injurePet 不允许阵亡宠物）
P[4].injured = true; P[4].injuryHeal = 0;       // 手工标记（injurePet 要求成熟期）
const matB = emptyBag(); matB.nutrition = 60;
seedStore(sb2, P, matB);

const res = sb2.healAllInjuredPets();
assert('两只受伤成熟宠物一次治好（healed=2）', res.ok === true && res.healed.length === 2 && res.partial.length === 0, JSON.stringify(res));
assert('痊愈名单只含受伤的成熟宠', res.healed.indexOf('小冰晶') >= 0 && res.healed.indexOf('清脆鸟') >= 0, JSON.stringify(res.healed));
assert('痊愈后 injured=false 且进度归零', P[1].injured === false && P[1].injuryHeal === 0 && P[2].injured === false && P[2].injuryHeal === 0);
assert('确实自动消耗了营养液（' + res.consumed + ' 瓶）', res.consumed > 0, 'consumed=' + res.consumed);
assert('消耗量 = 两只受伤宠痊愈所需（14~20 瓶，实际 ' + res.consumed + '）', res.consumed >= 14 && res.consumed <= 20, String(res.consumed));
assert('剩余营养液 = 60 - 消耗', sb2.getPetStore().materials.nutrition === 60 - res.consumed,
  sb2.getPetStore().materials.nutrition + ' vs ' + (60 - res.consumed));
assert('不误治已阵亡宠物', P[3].injured === true && res.healed.indexOf('梦幻') < 0 && res.partial.indexOf('梦幻') < 0, JSON.stringify(res.healed));
assert('不误治未成熟宠物', P[4].injured === true && res.healed.indexOf('无念熊') < 0 && res.partial.indexOf('无念熊') < 0);
assert('健康宠物不在名单里（不为其消耗）', res.healed.indexOf('闪闪星') < 0 && res.partial.indexOf('闪闪星') < 0);

// 营养液不足：只消耗现有瓶数，如实报「未愈」
const sb3 = makeSandbox(20261003);
const Q = [mkPet(sb3, 'icecrystal'), mkPet(sb3, 'chirpbird')];
sb3.injurePet(Q[0]); sb3.injurePet(Q[1]);
const matC = emptyBag(); matC.nutrition = 3;
seedStore(sb3, Q, matC);
const res2 = sb3.healAllInjuredPets();
assert('营养液不足时只消耗现有 3 瓶', res2.consumed === 3 && sb3.getPetStore().materials.nutrition === 0, JSON.stringify(res2));
assert('营养液耗尽后如实报「未愈」', res2.healed.length === 0 && res2.partial.length === 2, JSON.stringify(res2));
assert('未愈宠物仍保持受伤状态', Q[0].injured === true && Q[1].injured === true);
assert('未愈也算「已处理」（ok=true，不算失败）', res2.ok === true);

// 没有受伤宠物：不消耗、不写档
const sb4 = makeSandbox(20261004);
const matD = emptyBag(); matD.nutrition = 5;
seedStore(sb4, [mkPet(sb4, 'sparkle')], matD);
const res3 = sb4.healAllInjuredPets();
assert('无受伤宠物时 ok=false 且消耗 0', res3.ok === false && res3.consumed === 0, JSON.stringify(res3));
assert('无受伤宠物时给出原因', /没有需要治疗/.test(res3.reason || ''), res3.reason);
assert('无受伤宠物时营养液原封不动', sb4.getPetStore().materials.nutrition === 5);

/* ============================================================
   3) H5 面板显示 基础 / 加成 / 最终（petStatBreakdown，只读）
   ============================================================ */
console.log('\n[3] H5 面板属性拆解（petStatBreakdown）');
const sb5 = makeSandbox(20261005);
const subj = mkPet(sb5, 'icecrystal');                 // SSR
subj.refineLevel = 3;
subj.refineStats = { atk: 12, hp: 50 };
subj.skillLevels = { p_iceburst: 4 };
const orb = { id: 'orb-test', type: 'atk', rarity: 'R', level: 1 };   // 攻击 +10%
subj.orbs = {}; subj.orbs.atk = orb;
const bench1 = mkPet(sb5, 'dream');                     // UR 后备
const bench2 = mkPet(sb5, 'chirpbird');                 // SR 后备
const bench3 = mkPet(sb5, 'sparkle'); sb5.injurePet(bench3);   // 受伤后备（应被排除）
const deadP = mkPet(sb5, 'nonebear', { isDead: true });        // 阵亡（应被排除）
seedStore(sb5, [subj, bench1, bench2, bench3, deadP], emptyBag());

const bd = sb5.petStatBreakdown(subj);
assert('拆解可用', bd.ok === true);

// ① 基础 = createPetUnit（图鉴基础 + 炼化 + 天赋静态）
const u0 = sb5.createPetUnit(subj);
['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'].forEach(function (k) {
  assert('基础[' + k + '] = createPetUnit 的 base', bd.base[k] === (u0.base[k] || 0), bd.base[k] + ' vs ' + u0.base[k]);
});
assert('基础含炼化加成（图鉴 ' + sb5.getPetCodex('icecrystal').base.atk + ' + 炼化 12 = ' + bd.base.atk + '）',
  bd.base.atk === sb5.getPetCodex('icecrystal').base.atk + 12, String(bd.base.atk));

// ② 加成 = 团队凝聚 + 共鸣（同源函数）
const live = sb5.getPetStore().pets.filter(function (p) { return sb5.canPetBattle(p) && p.speciesId !== subj.speciesId; });
assert('后备名单排除受伤/阵亡（2 只）', bd.benchCount === 2 && live.length === 2, bd.benchCount + ' vs ' + live.length);
const coh = sb5.teamCohesionBonus(live);
const resS = sb5.benchBonusSum(live, sb5.resonanceBonus(sb5.getPetStore().pets.length));
assert('凝聚项与 teamCohesionBonus 同源', bd.cohesion.atk === coh.atk && bd.cohesion.hp === coh.hp, JSON.stringify(bd.cohesion));
assert('共鸣项与 benchBonusSum 同源', bd.resonance.atk === resS.atk, JSON.stringify(bd.resonance));
assert('共鸣档位按持有总数（5 只 → 5%）', bd.resonanceRate === 0.05, String(bd.resonanceRate));

// ③ 最终 = boostPetForGroup(applyBattlePetBaseBonuses([createPetUnit])) —— 数值口径单源守卫
const pipe = sb5.createPetUnit(subj);
sb5.applyBattlePetBaseBonuses([pipe]);
sb5.boostPetForGroup(pipe);
['hp', 'atk', 'def', 'spd', 'soulAtk', 'soulDef'].forEach(function (k) {
  assert('最终[' + k + '] 与实战管道逐值一致', bd.final[k] === (pipe.base[k] || 0), bd.final[k] + ' vs ' + pipe.base[k]);
});

// ④ 百分比池 = 稀有度倍率 + Σ宝珠%；速度不参与
assert('稀有度百分点取自 PET_GROUP_SCALE（SSR=1500）', bd.rarityPct === sb5.PET_GROUP_SCALE.SSR && bd.rarityPct === 1500, String(bd.rarityPct));
assert('宝珠百分点进池（攻 +' + bd.orbPct.atk + '%）', bd.orbPct.atk === sb5.orbPct(orb) && bd.orbPct.atk > 0);
assert('攻池 = 稀有度 + 宝珠', bd.poolPct.atk === 1500 + bd.orbPct.atk, String(bd.poolPct.atk));
assert('未装宝珠的属性只吃稀有度', bd.poolPct.hp === 1500, String(bd.poolPct.hp));
assert('速度不参与百分比（池 0，最终 = 基础+加成）', bd.poolPct.spd === 0 && bd.final.spd === bd.bench.spd, bd.final.spd + ' vs ' + bd.bench.spd);
assert('最终 = floor((基础+加成) × 池/100)（攻）',
  bd.final.atk === Math.floor(bd.bench.atk * bd.poolPct.atk / 100), bd.final.atk + ' vs ' + Math.floor(bd.bench.atk * bd.poolPct.atk / 100));

// ⑤ 只读：拆解不得改动存档（含被拆解的宠物本体）
const snap = JSON.stringify(sb5.getPetStore());
const subjSnap = JSON.stringify(subj);
sb5.petStatBreakdown(subj);
sb5.petStatBreakdown(bench1);
sb5.petStatBreakdown(deadP);
assert('只读：petStatBreakdown 不改存档', JSON.stringify(sb5.getPetStore()) === snap);
assert('只读：petStatBreakdown 不改宠物本体（数值口径不受影响）', JSON.stringify(subj) === subjSnap);

/* ============================================================
   4) 源码级接线守卫（防「写了没人调」）
   ============================================================ */
console.log('\n[4] 接线守卫');
const petUi = src('pet-ui.js');
const petStore = src('pet-store.js');
assert('UI 详情调用 petStatBreakdown 展示拆解', petUi.indexOf('petStatBreakdown') >= 0);
assert('UI 详情出现「基础 ＋ 加成 → 最终」标题', petUi.indexOf('基础 ＋ 加成') >= 0 && petUi.indexOf('最终') >= 0);
assert('UI 面板有一键治疗按钮 petHealAll', petUi.indexOf('petHealAll') >= 0);
assert('UI 一键治疗真的调 healAllInjuredPets', petUi.indexOf('healAllInjuredPets') >= 0);
assert('UI 单只营养按钮仍走 useNutrition（与一键同一治疗口径）', petUi.indexOf('useNutrition') >= 0);
assert('UI 不重写数值口径（不引用 PET_GROUP_SCALE / 不定义 petStatBreakdown）',
  petUi.indexOf('PET_GROUP_SCALE') < 0 && petUi.indexOf('function petStatBreakdown') < 0);
assert('petStatBreakdown 定义在 pet-store.js（展示层唯一来源）', petStore.indexOf('function petStatBreakdown') >= 0);
assert('healAllInjuredPets 定义在 pet-store.js', petStore.indexOf('function healAllInjuredPets') >= 0);
assert('一键治疗的判据 = 成熟 + 未阵亡 + 受伤（不误治）',
  /pet\.isDead\s*\|\|\s*pet\.stage\s*!==\s*'mature'\s*\|\|\s*!pet\.injured/.test(petStore));
assert('useNutrition 有成熟期分支（H6）', /pet\.stage\s*===\s*'mature'/.test(src('pet-materials.js')));

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

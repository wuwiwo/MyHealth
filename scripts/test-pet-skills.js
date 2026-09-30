#!/usr/bin/env node
/* WP-C 前半测试：宠物主动技能 §2.1~§2.7 对齐（对照 doc/2.2-修改提案.md §2.1~§2.7）
   只覆盖本批**真实落地**的改动 + 关键「判定无改动」项的防回归：
     §2.1 闪耀   — 命中削减区间 / 持续 2 回合（防回归；「蓄力」需引擎，未实装）
     §2.2 打湿   — 评审「不变」→ 区间与潮湿实例防回归
     §2.3 睡觉   — **先解除自身普通~高级负面**（新增）＋特级不解除＋随后进入睡眠
     §2.4 火焰啄击 — CD 4 → 3（新增）
     §2.5 坚壁   — 评审「不需要，二者统一」→ 仍复用敌群 fortify（防回归）
     §2.6 歌唱   — 睡眠几率 固定 20% → 随成长 0%~30%（新增）
     §2.7 雷霆冲撞 — 伤害区间 [220,400] → [260,440]（新增）
   ⚠️ §2.1「蓄力 1 回合、下回合释放」与 §2.7「蓄力 / 自身 35% 反冲 / 目标潮湿·冰冻 +25%」
      需要改 page/battle-group.js、page/status-defs.js、page/skill.js（本批禁止文件）→ 未实装，
      详见任务回执，故此处不为其写断言。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js','date-roll.js','levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','pets.js','pet-materials.js','pet-codex.js'];
/* 确定性随机 = 0.2（battleRnd 在沙箱里回退到 Math.random）。
   用于 §2.6：t=0 → 睡眠几率 0%（0.2 < 0 为假 → 不睡）；t=1 → 30%（0.2 < 0.3 为真 → 睡）。 */
const deterministicMath = Object.create(Math);
deterministicMath.random = function () { return 0.2; };
const sandbox = { Math: deterministicMath, JSON, console, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function skill(id) { return sandbox.getSkill(id); }
function petUnit(id, name, base, tags, skills, refineLevel) {
  const u = sandbox.createUnit({ id: id, side: 'ally', name: name, level: 1, base: base, skills: skills, tags: tags });
  u._refineLevel = refineLevel || 0;   // 区间驱动源 = 炼化等级（skillRangeT）
  return u;
}
const SR_BASE = { hp: 150, atk: 15, def: 10, soulAtk: 10, soulDef: 6, spd: 6 };
const R_BASE  = { hp: 100, atk: 10, def: 5, soulAtk: 6, soulDef: 3, spd: 5 };
function foe(id) { return sandbox.createUnit({ id: id, side: 'enemy', name: '木桩', level: 1, base: { hp: 1000, atk: 5, def: 2, spd: 5 } }); }
function runFx(id, caster, targets) { return sandbox.applySkillEffects(skill(id), caster, targets, {}); }

/* ===== §2.4 火焰啄击：CD 4 → 3 ===== */
assert('§2.4 火焰啄击冷却=3', skill('p_flamepeck').cooldown === 3);
assert('§2.4 火焰啄击伤害区间 150~330% 不变', JSON.stringify(skill('p_flamepeck').range.power) === '[150,330]');

/* ===== §2.6 歌唱：睡眠几率 固定 20% → 随成长 0%~30% ===== */
assert('§2.6 歌唱新增睡眠几率区间 [0,30]', JSON.stringify(skill('p_sing').range.sleepChance) === '[0,30]');
const singerLow = petUnit('p-sing-low', '清脆鸟', SR_BASE, ['pet', 'SR'], ['p_sing'], 0);
const rSingLow = runFx('p_sing', singerLow, [foe('e-sing-1')]);
assert('§2.6 t=0（未炼化）睡眠几率 0% → 不睡眠', rSingLow.statusApps.length === 0, 'n=' + rSingLow.statusApps.length);
const singerHigh = petUnit('p-sing-high', '清脆鸟', SR_BASE, ['pet', 'SR'], ['p_sing'], 60);
const rSingHigh = runFx('p_sing', singerHigh, [foe('e-sing-2')]);
assert('§2.6 t=1（炼化满）睡眠几率 30% → 命中', rSingHigh.statusApps.length === 1 && rSingHigh.statusApps[0].id === 'sleep', JSON.stringify(rSingHigh.statusApps));
assert('§2.6 睡眠仍为 1 回合', rSingHigh.statusApps.length === 1 && rSingHigh.statusApps[0].duration === 1);

/* ===== §2.3 睡觉：先解除自身普通~高级负面，再进入睡眠 ===== */
const pig = petUnit('p-pig', '彭彭猪', R_BASE, ['pet', 'R'], ['p_sleep'], 0);
sandbox.applyStatus(pig, { id: 'poison', duration: 3 });   // 高级(grade 2)负面
sandbox.applyStatus(pig, { id: 'flinch', duration: 3 });   // 高级(grade 2)负面
sandbox.applyStatus(pig, { id: 'doomed', duration: 3 });   // 特级(grade 3)负面
const rSleep = runFx('p_sleep', pig, [pig]);
assert('§2.3 解除普通~高级负面（poison/flinch 已移除）', !sandbox.hasStatus(pig, 'poison') && !sandbox.hasStatus(pig, 'flinch'));
assert('§2.3 特级负面（doomed）不被解除', sandbox.hasStatus(pig, 'doomed'));
assert('§2.3 顺序：effects 内已解除负面、睡眠尚未施加（睡眠走后续 statusApps）', !sandbox.hasStatus(pig, 'sleep'));
assert('§2.3 睡眠仍进入 statusApps', rSleep.statusApps.some(function (s) { return s.id === 'sleep'; }));
assert('§2.3 仍自愈一次（防回归）', rSleep.heals.length === 1, 'heals=' + rSleep.heals.length);
const cleanPig = petUnit('p-pig2', '彭彭猪', R_BASE, ['pet', 'R'], ['p_sleep'], 0);
const rClean = runFx('p_sleep', cleanPig, [cleanPig]);
assert('§2.3 无负面时不写「先解除」文案', rClean.events.length === 1 && rClean.events[0].msg.indexOf('先解除') === -1, JSON.stringify(rClean.events));

/* ===== §2.7 雷霆冲撞：伤害区间 220~400% → 260~440% ===== */
assert('§2.7 雷霆冲撞伤害区间 [260,440]', JSON.stringify(skill('p_thundercharge').range.power) === '[260,440]');
assert('§2.7 区间 t=0 → 260%', sandbox.skillValue(skill('p_thundercharge'), 'power', 0) === 260);
assert('§2.7 区间 t=1 → 440%', sandbox.skillValue(skill('p_thundercharge'), 'power', 1) === 440);
assert('§2.7 CD / 类型 / 目标不变（4 · soul · random1）', skill('p_thundercharge').cooldown === 4 && skill('p_thundercharge').dmgType === 'soul' && skill('p_thundercharge').target === 'random1');

/* ===== §2.1 闪耀：区间 / 持续 2 回合（防回归；蓄力未实装） ===== */
assert('§2.1 闪耀命中削减区间 [0,40] 不变', JSON.stringify(skill('p_shine').range.acc) === '[0,40]');
assert('§2.1 闪耀 CD / 目标不变（4 · all）', skill('p_shine').cooldown === 4 && skill('p_shine').target === 'all');
const shineFoe = foe('e-shine');
runFx('p_shine', singerHigh, [shineFoe]);
assert('§2.1 闪耀持续 2 回合（_hitModTurns=2）', shineFoe._hitModTurns === 2, 'turns=' + shineFoe._hitModTurns);

/* ===== §2.2 打湿：评审「不变」→ 区间与潮湿实例防回归 ===== */
const drench = skill('p_drench');
assert('§2.2 打湿区间 魂防[0,25] / 命中[0,30]', JSON.stringify(drench.range.soulDefDown) === '[0,25]' && JSON.stringify(drench.range.hit) === '[0,30]');
const rDrench = runFx('p_drench', singerLow, [foe('e-drench')]);
assert('§2.2 打湿施加潮湿 2 回合（高级）', rDrench.statusApps.length === 1 && rDrench.statusApps[0].id === 'wet' && rDrench.statusApps[0].duration === 2 && rDrench.statusApps[0].grade === 2, JSON.stringify(rDrench.statusApps));

/* ===== §2.5 坚壁：评审「不需要，二者统一」→ 仍复用敌群 fortify ===== */
assert('§2.5 坚强岩技能仍为敌群 fortify（无专属技能）', sandbox.getPetCodex('rocksteady').skills.length === 1 && sandbox.getPetCodex('rocksteady').skills[0] === 'fortify');
assert('§2.5 fortify 仍注册（自身 · CD2）', !!skill('fortify') && skill('fortify').target === 'self' && skill('fortify').cooldown === 2);
assert('§2.5 未新增 p_fortify 专属技能', skill('p_fortify') === null);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

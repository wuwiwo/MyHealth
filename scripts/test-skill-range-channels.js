#!/usr/bin/env node
/* v2.1.26 测试：技能区间是否真的接进了「非攻击」通道
   背景：v2.1.22 只把区间用在攻击威力上；治疗量 / 增益幅度 / 状态持续 / 睡眠时长仍是固定值。
   本测试逐个通道验证：**把成长进度 t 从 0 拉到 1，输出数值必须真的变化**。

   ⚠️ 判据不能只看「没抛异常」—— v2.1.25 的教训：按 id 取对象的调用点会静默失效，
      断言照跑但什么都没验证。所以这里每一条都比较 t=0 与 t=1 的实际输出。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

function makeSandbox() {
  const sb = { Math: Object.create(Math), JSON, console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js',
    'skill.js', 'pet-codex.js', 'orbs.js'].forEach(f => vm.runInContext(load(f), sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const sb = makeSandbox();

/* 造一只「炼化进度可控」的 SSR 宠物：skillRangeT 用 _refineLevel / PET_REFINE_CAP[rarity] */
const SSR_CAP = (sb.PET_REFINE_CAP && sb.PET_REFINE_CAP.SSR) || 80;
function casterAt(rl) {
  const u = sb.createUnit({
    id: 'c', side: 'ally', name: '施法', level: 1,
    base: { hp: 1000, atk: 100, def: 100, soulAtk: 200, soulDef: 50, spd: 5 },
    tags: ['pet', 'SSR']
  });
  u._refineLevel = rl;
  return u;
}
function target() {
  return sb.createUnit({
    id: 't', side: 'ally', name: '目标', level: 1,
    base: { hp: 2000, atk: 50, def: 60, soulAtk: 10, soulDef: 20, spd: 4 },
    tags: ['pet', 'SSR']
  });
}

assert('skillRangeT：炼化 0 → t=0', sb.skillRangeT(casterAt(0)) === 0, String(sb.skillRangeT(casterAt(0))));
assert('skillRangeT：炼化满 → t=1', Math.abs(sb.skillRangeT(casterAt(SSR_CAP)) - 1) < 1e-9);

/* 跑两次（t=0 / t=1），返回 [low, high] */
function both(skillId) {
  const sk = sb.SKILLS[skillId];
  if (!sk) return null;
  const a = sb.applySkillEffects(sk, casterAt(0), [target()], {});
  const b = sb.applySkillEffects(sk, casterAt(SSR_CAP), [target()], {});
  return [a, b];
}

// ---- 治疗量（heals）----
(function () {
  const r = both('heal');
  assert('治愈已注册', !!r);
  if (!r) return;
  const lo = r[0].heals[0] && r[0].heals[0].amount;
  const hi = r[1].heals[0] && r[1].heals[0].amount;
  assert('治愈：治疗量随成长变化（' + lo + ' → ' + hi + '）', typeof lo === 'number' && hi > lo, lo + ' / ' + hi);

  const sk = sb.SKILLS.p_sleep;
  const s0 = sb.applySkillEffects(sk, casterAt(0), [casterAt(0)], {});
  const s1 = sb.applySkillEffects(sk, casterAt(SSR_CAP), [casterAt(SSR_CAP)], {});
  assert('睡觉：治疗量随成长变化（' + (s0.heals[0].amount) + ' → ' + (s1.heals[0].amount + '）'),
    s1.heals[0].amount > s0.heals[0].amount);
})();

// ---- 增益幅度（buffs）----
(function () {
  const r = both('empower');
  assert('强攻已注册', !!r);
  if (!r) return;
  assert('强攻：增益幅度随成长（' + r[0].buffs[0].value + ' → ' + r[1].buffs[0].value + '）',
    r[1].buffs[0].value > r[0].buffs[0].value);
  assert('强攻：持续回合随成长（' + r[0].buffs[0].duration + ' → ' + r[1].buffs[0].duration + '）',
    r[1].buffs[0].duration > r[0].buffs[0].duration);

  const b = both('bulwark');
  assert('广域防御已注册', !!b);
  if (!b) return;
  assert('广域防御：减伤幅度随成长（' + b[0].buffs[0].value + ' → ' + b[1].buffs[0].value + '）',
    b[1].buffs[0].value > b[0].buffs[0].value);
  assert('广域防御：持续回合随成长（' + b[0].buffs[0].duration + ' → ' + b[1].buffs[0].duration + '）',
    b[1].buffs[0].duration > b[0].buffs[0].duration);
})();

// ---- 状态持续（statusApps）----
(function () {
  const r = both('drench');
  assert('打湿已注册', !!r);
  if (!r) return;
  assert('打湿：持续回合随成长（' + r[0].statusApps[0].duration + ' → ' + r[1].statusApps[0].duration + '）',
    r[1].statusApps[0].duration > r[0].statusApps[0].duration);

  const sk = sb.SKILLS.p_sleep;
  const s0 = sb.applySkillEffects(sk, casterAt(0), [casterAt(0)], {});
  const s1 = sb.applySkillEffects(sk, casterAt(SSR_CAP), [casterAt(SSR_CAP)], {});
  assert('睡觉：睡眠时长随成长（' + s0.statusApps[0].duration + ' → ' + s1.statusApps[0].duration + '，含 +1 修正）',
    s1.statusApps[0].duration > s0.statusApps[0].duration);
  assert('睡觉：duration 已做 +1 修正（不会写成 1 导致没睡）', s0.statusApps[0].duration >= 2,
    String(s0.statusApps[0].duration));
})();

/* 源码级守卫：这几个技能必须声明 range，否则区间形同不存在 */
(function () {
  const src = load('skill.js') + load('pet-codex.js');   // load() 已带 page/ 前缀
  [['heal', 'healSoul'], ['empower', 'atkBoost'], ['bulwark', 'dmgReduce']].forEach(function (pair) {
    assert('SKILLS.' + pair[0] + ' 声明了 range.' + pair[1], src.indexOf(pair[1]) >= 0);
  });
})();

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

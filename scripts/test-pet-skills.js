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
   v2.2.18：§2.7 的**「自身承受 35% 反冲」已实装**（作者裁决：基数 = 本次对目标造成的伤害 × 35%），
   原先的「未实装哨兵」断言 `sk.recoil === undefined` 已替换为**行为断言**
   （伤害 X → 施法者掉 floor(X*0.35)；蓄力当回合不结算；不过防御/减伤；打死自己走既有败北判定）。 */
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

/* ============================================================
   WP-C 后半：宠物主动技能 §2.8~§2.14 + §2.1/§2.7 的引擎项
   （对照 doc/2.2-修改提案.md §2.8~§2.14 的「设计原文 / 源码现状 / 评审批注」）
   ============================================================ */

/* ===== §2.1 闪耀：通用蓄力载荷（蓄力 1 回合、下回合释放） ===== */
{
  const caster = petUnit('p-shine-c', '闪闪星', R_BASE, ['pet', 'R'], ['p_shine'], 50);   // R cap=50 → t=1（降命 40%）
  /* 单看 castSkill：只进入蓄力（charging，承伤 +25%），不立即削减命中 */
  const probe = petUnit('p-shine-p', '闪闪星', R_BASE, ['pet', 'R'], ['p_shine'], 50);
  const eProbe = foe('e-ch0');
  const gbP = sandbox.createGroupBattle({ allies: [probe], enemies: [eProbe], seed: 1 });
  const evP = sandbox.castSkill(gbP, probe, 'p_shine');
  assert('§2.1 蓄力：首次施放不立即削减命中（改为下回合释放）', !eProbe._accMod, String(eProbe._accMod));
  assert('§2.1 蓄力：进入 charging 且承伤 +25%（引擎既有蓄力语义）',
    sandbox.hasStatus(probe, 'charging') &&
    sandbox.dispatch(probe, 'onDamage', {}).mutations.some(m => m.key === 'dmgTakenBoost'),
    JSON.stringify((probe.statuses || []).map(s => s.id)));
  assert('§2.1 蓄力：冷却在蓄力当回合起算', sandbox.skillCooldownLeft(probe, 'p_shine') === 4,
    String(sandbox.skillCooldownLeft(probe, 'p_shine')));
  assert('§2.1 蓄力：日志写明「蓄力…下回合释放」', evP.some(e => /蓄力/.test(e.msg || '')), JSON.stringify(evP.map(e => e.msg)));

  /* 端到端：蓄力当回合 → 到期置载荷 → 下回合释放（走真实回合流转） */
  const e1 = foe('e-ch1');
  const gb = sandbox.createGroupBattle({ allies: [caster], enemies: [e1], seed: 3 });
  gb.turn = 1;
  sandbox.groupUnitTurn(gb, caster);
  assert('§2.1 蓄力当回合：敌方未被削减', !e1._accMod, String(e1._accMod));
  assert('§2.1 蓄力到期：置 _chargeReady 且载荷记名 p_shine',
    caster._chargeReady === true && caster._chargePayload === 'p_shine',
    String(caster._chargeReady) + '/' + caster._chargePayload);
  sandbox.groupUnitTurn(gb, caster);                   // 下回合：释放
  assert('§2.1 下回合释放：命中削减落到敌全体（-40%、2 回合）',
    Math.abs(e1._accMod + 0.4) < 1e-9 && e1._hitModTurns === 2,
    String(e1._accMod) + '/' + e1._hitModTurns);
  assert('§2.1 释放后载荷清空、_chargeReady 归零', !caster._chargePayload && caster._chargeReady === false);
  /* 敌群「蓄力重击」不带 charge 标记 → 仍走旧的 400% 重击路径（防回归） */
  assert('§2.1 敌群 chargeup 未被改成通用蓄力（无 charge 字段）', skill('chargeup').charge !== true);
}

/* ===== §2.7 雷霆冲撞：蓄力 + 目标潮湿/冰冻时 +25% ===== */
{
  const sk = skill('p_thundercharge');
  assert('§2.7 声明通用蓄力', sk.charge === true);
  assert('§2.7 声明目标状态加成（潮湿/冰冻 +25%）',
    JSON.stringify(sk.condBonus) === '{"statuses":["wet","freeze"],"value":0.25}', JSON.stringify(sk.condBonus));
  const caster = petUnit('p-th-c', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);   // SR cap=60 → t=1
  const dry = foe('e-th-dry'), wetF = foe('e-th-wet'), frz = foe('e-th-frz');
  sandbox.applyStatus(wetF, { id: 'wet', duration: 2 });
  sandbox.applyStatus(frz, { id: 'freeze', duration: 2 });
  const dDry = sandbox.calcSkillDamage(sk, caster, [dry], {}).hits[0].amount;
  const dWet = sandbox.calcSkillDamage(sk, caster, [wetF], {}).hits[0].amount;
  const dFrz = sandbox.calcSkillDamage(sk, caster, [frz], {}).hits[0].amount;
  assert('§2.7 潮湿目标伤害 +25%', dWet === Math.floor(dDry * 1.25), dDry + ' → ' + dWet);
  assert('§2.7 冰冻目标伤害 +25%', dFrz === Math.floor(dDry * 1.25), dDry + ' → ' + dFrz);
  assert('§2.7 未处于潮湿/冰冻则不加成（= 魂攻×440%，t=1）',
    dDry === Math.floor(sandbox.effectiveStat(caster, 'soulAtk') * 440 / 100), String(dDry));

  /* ---- v2.2.18：作者裁决「反冲基数 = (a) 本次对目标造成的伤害」→ recoil = 0.35
     断言从「未实装哨兵」（sk.recoil === undefined）改为**行为断言**。 ---- */
  assert('§2.7 反冲系数 = 0.35（基数 = 本次对目标造成的伤害 × 35%）', sk.recoil === 0.35, JSON.stringify(sk.recoil));

  {
    const rc = petUnit('p-th-rc', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
    const eRc = foe('e-th-recoil');
    eRc.base.hp = eRc.hp = 100000;                       // 木桩够厚：伤害不会被「打死」截断
    const gbRc = sandbox.createGroupBattle({ allies: [rc], enemies: [eRc], seed: 71 });
    gbRc.rng = function () { return 0.1; };              // 确定性：必中、掷骰固定
    gbRc.turn = 1;
    const hpCharging = rc.hp;
    const evCharge = sandbox.groupUnitTurn(gbRc, rc);    // 第 1 回合：只进入蓄力
    assert('§2.7 反冲：蓄力当回合尚未结算伤害，故无反冲（不掉血、无日志）',
      rc.hp === hpCharging && !evCharge.some(e => /反冲/.test(e.msg || '')),
      JSON.stringify({ hp: rc.hp, ev: evCharge.map(e => e.msg) }));
    const hpBefore = rc.hp;
    const evRel = sandbox.groupUnitTurn(gbRc, rc);       // 第 2 回合：释放 → 伤害 + 反冲
    const hitEv = evRel.filter(e => /^⚡/.test(e.msg || ''))[0];
    const recEv = evRel.filter(e => /反冲/.test(e.msg || ''))[0];
    const dealt = hitEv ? +(/→ \S+ (\d+) 伤害/.exec(hitEv.msg)[1]) : -1;
    assert('§2.7 反冲行为：施法者掉血 = floor(本次对目标造成的伤害 × 35%)',
      !!recEv && dealt > 0 && (hpBefore - rc.hp) === Math.floor(dealt * 0.35),
      JSON.stringify({ dealt: dealt, lost: hpBefore - rc.hp, expect: Math.floor(dealt * 0.35), rec: recEv && recEv.msg }));
    assert('§2.7 反冲日志写明基数值与比例',
      !!recEv && recEv.msg.indexOf('' + dealt) >= 0 && recEv.msg.indexOf('35%') >= 0 && recEv.targetId === rc.id,
      recEv && recEv.msg);
    /* 反冲**不过自身防御/减伤**：同一场景下把施法者防御拉到极高，反冲数值不变 */
    const rcTank = petUnit('p-th-tank', '雷霆犬', { hp: 150, atk: 15, def: 9999, soulAtk: 10, soulDef: 9999, spd: 6 },
      ['pet', 'SR'], ['p_thundercharge'], 60);
    const eTank = foe('e-th-tank');
    eTank.base.hp = eTank.hp = 100000;
    const gbT = sandbox.createGroupBattle({ allies: [rcTank], enemies: [eTank], seed: 71 });
    gbT.rng = function () { return 0.1; };
    gbT.turn = 1;
    sandbox.groupUnitTurn(gbT, rcTank);
    const hpT = rcTank.hp;
    const evT = sandbox.groupUnitTurn(gbT, rcTank);
    const dealtT = +(/→ \S+ (\d+) 伤害/.exec(evT.filter(e => /^⚡/.test(e.msg || ''))[0].msg)[1]);
    assert('§2.7 反冲不过自身防御/减伤（直接扣血，与 def 无关）',
      (hpT - rcTank.hp) === Math.floor(dealtT * 0.35) && dealtT === dealt,
      JSON.stringify({ dealtT: dealtT, lostT: hpT - rcTank.hp }));
  }

  /* ---- 反冲可以打死自己 → 走既有的败北判定（不另造逻辑） ---- */
  {
    const rcD = petUnit('p-th-rc-die', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
    rcD.hp = 5;                                          // 远低于反冲伤害
    const eD = foe('e-th-die');
    eD.base.hp = eD.hp = 100000;
    const gbD = sandbox.createGroupBattle({ allies: [rcD], enemies: [eD], seed: 73 });
    gbD.rng = function () { return 0.1; };
    let guard = 0;
    while (!gbD.done && guard++ < 20) sandbox.groupBattleStep(gbD);
    assert('§2.7 反冲打死自己：自身 hp 归零',
      rcD.hp === 0, String(rcD.hp));
    assert('§2.7 反冲自死由**既有**败北判定收口（我方全灭 → winner=enemy）',
      gbD.done === true && gbD.winner === 'enemy', gbD.done + '/' + gbD.winner + ' turn=' + gbD.turn);
  }

  /* ---- v2.3.0 作者裁决：反冲的 **overkill 口径 = 按实际掉血** ----
     目标残血 10 而本次打 44 时，反冲 = floor(10 × 35%) = 3（不是 floor(44 × 35%) = 15）。 ---- */
  {
    const rcO = petUnit('p-th-ok', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
    const eO = foe('e-th-ok');
    eO.base.hp = eO.hp = 100000;
    const gbO = sandbox.createGroupBattle({ allies: [rcO], enemies: [eO], seed: 71 });
    gbO.rng = function () { return 0.1; };
    gbO.turn = 1;
    sandbox.groupUnitTurn(gbO, rcO);                     // 第 1 回合：蓄力
    eO.hp = 10;                                          // 释放前把目标打到残血 10
    const hpO = rcO.hp;
    const evO = sandbox.groupUnitTurn(gbO, rcO);          // 第 2 回合：释放
    const hitO = evO.filter(e => /^⚡/.test(e.msg || ''))[0];
    const recO = evO.filter(e => /反冲/.test(e.msg || ''))[0];
    const dealtO = hitO ? +(/→ \S+ (\d+) 伤害/.exec(hitO.msg)[1]) : -1;
    assert('§2.7 overkill 口径：反冲基数 = **实际掉血**（残血 10 → 10×35%=3，不是本次 44×35%=15）',
      dealtO > 10 && (hpO - rcO.hp) === Math.floor(10 * 0.35),
      JSON.stringify({ dmg: dealtO, lost: hpO - rcO.hp, want: Math.floor(10 * 0.35), oldWouldBe: Math.floor(dealtO * 0.35), rec: recO && recO.msg }));
    assert('§2.7 overkill：反冲日志里的基数写的是**实际掉血**（10），而 ⚡ 日志仍是本次伤害',
      !!recO && recO.msg.indexOf('10 × 35%') >= 0 && !!hitO && hitO.msg.indexOf('' + dealtO) >= 0,
      (recO && recO.msg) + ' || ' + (hitO && hitO.msg));
  }

  /* ---- v2.3.0 作者裁决：**落空 / 闪避不吃反冲** ---- */
  {
    const rcM = petUnit('p-th-miss', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
    const eM = foe('e-th-miss');
    eM.base.hp = eM.hp = 100000;
    const gbM = sandbox.createGroupBattle({ allies: [rcM], enemies: [eM], seed: 71 });
    gbM.rng = function () { return 0.1; };
    gbM.turn = 1;
    sandbox.groupUnitTurn(gbM, rcM);                     // 蓄力
    gbM.rng = function () { return 0.99; };              // 命中率 0.95 → 必落空
    const hpM = rcM.hp;
    const evM = sandbox.groupUnitTurn(gbM, rcM);         // 释放 → 落空
    const missed = evM.some(e => /落空/.test(e.msg || ''));
    const recM = evM.filter(e => /反冲/.test(e.msg || ''));
    assert('§2.7 落空 / 闪避**不吃**反冲（未命中 → 施法者不掉血、也不写反冲日志）',
      missed && rcM.hp === hpM && recM.length === 0,
      JSON.stringify({ missed: missed, hp: rcM.hp, rec: recM.map(e => e.msg) }));
  }

  /* ---- v2.3.0 作者裁决：反冲**不过**自身防御/减伤（再补一条状态减伤通道）---- */
  {
    const rcW = petUnit('p-th-wg', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
    const eW = foe('e-th-wg');
    eW.base.hp = eW.hp = 100000;
    const gbW = sandbox.createGroupBattle({ allies: [rcW], enemies: [eW], seed: 71 });
    gbW.rng = function () { return 0.1; };
    gbW.turn = 1;
    sandbox.groupUnitTurn(gbW, rcW);                     // 蓄力
    /* 给施法者挂「广域防御」（状态减伤 -40%）：若反冲走受击通道，这里就会被削 —— 必须不被削 */
    sandbox.applyStatus(rcW, { id: 'wideguard', duration: 3, data: { reduce: 0.4 } });
    sandbox.syncStatusDerived(rcW);
    const hpW = rcW.hp;
    const evW = sandbox.groupUnitTurn(gbW, rcW);
    const dealtW = +(/→ \S+ (\d+) 伤害/.exec(evW.filter(e => /^⚡/.test(e.msg || ''))[0].msg)[1]);
    assert('§2.7 反冲不过自身防御/减伤：状态减伤（广域防御 -40%）也不作用于反冲',
      (hpW - rcW.hp) === Math.floor(dealtW * 0.35),
      JSON.stringify({ dealt: dealtW, lost: hpW - rcW.hp, want: Math.floor(dealtW * 0.35) }));
    assert('§2.7 反冲不吃护盾（金身护盾只挡受击，不挡施法代价）',
      (function () {
        const rcS = petUnit('p-th-sh', '雷霆犬', SR_BASE, ['pet', 'SR'], ['p_thundercharge'], 60);
        const eS = foe('e-th-sh');
        eS.base.hp = eS.hp = 100000;
        const gbS = sandbox.createGroupBattle({ allies: [rcS], enemies: [eS], seed: 71 });
        gbS.rng = function () { return 0.1; };
        gbS.turn = 1;
        sandbox.groupUnitTurn(gbS, rcS);
        rcS._shield = 99999;                             // 开盾（若反冲走受击通道，盾会吃掉它）
        const hpS = rcS.hp;
        const evS = sandbox.groupUnitTurn(gbS, rcS);
        const dw = +(/→ \S+ (\d+) 伤害/.exec(evS.filter(e => /^⚡/.test(e.msg || ''))[0].msg)[1]);
        return (hpS - rcS.hp) === Math.floor(dw * 0.35) && rcS._shield === 99999;
      })());
  }
}

/* ===== §2.8 双撞：最多 2 敌各 1 次 / 180~270% / 降攻防 / 窃取转移 ===== */
{
  const sk = skill('p_doublehit');
  assert('§2.8 目标 → 最多 2 名敌人（enemy2）', sk.target === 'enemy2');
  assert('§2.8 伤害区间 150~240% → [180,270]', JSON.stringify(sk.range.power) === '[180,270]');
  assert('§2.8 降攻 / 降防区间 [0,10] / [0,20]',
    JSON.stringify(sk.range.atkDown) === '[0,10]' && JSON.stringify(sk.range.defDown) === '[0,20]');
  const caster = petUnit('p-dh', '小负鼠', { hp: 200, atk: 200, def: 15, soulAtk: 15, soulDef: 10, spd: 8 },
    ['pet', 'SSR'], ['p_doublehit'], 80);   // SSR cap=80 → t=1
  const mate = sandbox.createUnit({ id: 'dh-m', side: 'ally', name: '友', base: { hp: 500, atk: 10, def: 10, spd: 5 } });
  const gb = sandbox.createGroupBattle({ allies: [caster, mate], enemies: [foe('e-dh1'), foe('e-dh2'), foe('e-dh3')], seed: 11 });
  const tg = sandbox.selectTargets(gb, caster, sk);
  assert('§2.8 目标选择：恰好 2 名敌人', tg.length === 2, String(tg.length));
  gb.turn = 1;
  const ev = sandbox.castSkill(gb, caster, 'p_doublehit');
  assert('§2.8 实战：2 个目标各吃到 1 次伤害', ev.filter(e => /^⚡/.test(e.msg || '')).length === 2,
    ev.map(e => e.msg).join(' | ').slice(0, 200));
  const fx = sandbox.applySkillEffects(sk, caster, gb.enemies.slice(0, 2), { units: gb.units });
  assert('§2.8 降低攻击 10% / 防御 20%（pulled 实例，t=1）',
    fx.statusApps.length === 2 && fx.statusApps.every(s => s.id === 'pulled') &&
    Math.abs(fx.statusApps[0].modsPct.atk + 0.10) < 1e-9 && Math.abs(fx.statusApps[0].modsPct.def + 0.20) < 1e-9,
    JSON.stringify(fx.statusApps));
  assert('§2.8 窃取转移给我方 1 名（stolen，2 回合，攻/防同幅度）',
    fx.buffs.length === 1 && fx.buffs[0].key === 'stolen' && fx.buffs[0].duration === 2 &&
    Math.abs(fx.buffs[0].modsPct.atk - 0.10) < 1e-9 && Math.abs(fx.buffs[0].modsPct.def - 0.20) < 1e-9,
    JSON.stringify(fx.buffs));
}

/* ===== §2.9 幻影之瞳：评审「不改变」 ===== */
{
  const sk = skill('p_phantom');
  const eqRange = function (a, b) {
    return Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return Math.abs(v - b[i]) < 1e-9; });
  };
  assert('§2.9 判定不改（random1 · CD4 · 三个区间未动）',
    sk.target === 'random1' && sk.cooldown === 4 &&
    eqRange(sk.range.confuseDown, [0.15, 0.75]) &&
    eqRange(sk.range.confuseHit, [0.50, 0.95]) &&
    eqRange(sk.range.confuseSelf, [0.01, 0.10]), JSON.stringify(sk.range));
}

/* ===== §2.10 冰晶爆：随机 1~2 敌 / 160~250% / 冰冻 10%~55% ===== */
{
  const sk = skill('p_iceburst');
  assert('§2.10 目标 → 随机 1~2 敌（enemy12）', sk.target === 'enemy12');
  assert('§2.10 伤害区间 150~240% → [160,250]', JSON.stringify(sk.range.power) === '[160,250]');
  assert('§2.10 冰冻几率区间 [10,55]（原固定 30%）', JSON.stringify(sk.range.freezeChance) === '[10,55]');
  const cLow = petUnit('p-ib0', '小冰晶', { hp: 200, atk: 20, def: 15, soulAtk: 20, soulDef: 10, spd: 8 }, ['pet', 'SSR'], ['p_iceburst'], 0);
  const cHigh = petUnit('p-ib1', '小冰晶', { hp: 200, atk: 20, def: 15, soulAtk: 20, soulDef: 10, spd: 8 }, ['pet', 'SSR'], ['p_iceburst'], 80);
  /* battleRnd 在沙箱里回退到 Math.random = 0.2 */
  assert('§2.10 t=0 冰冻几率 10% → 0.2 不触发', runFx('p_iceburst', cLow, [foe('e-ib1')]).statusApps.length === 0);
  const rHigh = runFx('p_iceburst', cHigh, [foe('e-ib2')]);
  assert('§2.10 t=1 冰冻几率 55% → 0.2 触发', rHigh.statusApps.length === 1 && rHigh.statusApps[0].id === 'freeze',
    JSON.stringify(rHigh.statusApps));
  const gb2 = sandbox.createGroupBattle({ allies: [cHigh], enemies: [foe('e-ib-a'), foe('e-ib-b')], rng: function () { return 0.2; } });
  assert('§2.10 随机 1~2 敌：rng=0.2 → 2 名', sandbox.selectTargets(gb2, cHigh, sk).length === 2);
  const gb1 = sandbox.createGroupBattle({ allies: [cHigh], enemies: [foe('e-ib-c'), foe('e-ib-d')], rng: function () { return 0.7; } });
  assert('§2.10 随机 1~2 敌：rng=0.7 → 1 名', sandbox.selectTargets(gb1, cHigh, sk).length === 1);
}

/* ===== §2.11 圣光治愈：只挑未满血友方 ===== */
{
  const sk = skill('p_holylight');
  assert('§2.11 声明 wounded（只挑未满血友方）', sk.wounded === true);
  const caster = petUnit('p-hl', '光之精灵', { hp: 200, atk: 20, def: 15, soulAtk: 20, soulDef: 10, spd: 8 },
    ['pet', 'SSR'], ['p_holylight'], 0);
  const full = sandbox.createUnit({ id: 'hl-full', side: 'ally', name: '满血', base: { hp: 500, atk: 10, def: 10, spd: 5 } });
  const hurt = sandbox.createUnit({ id: 'hl-hurt', side: 'ally', name: '受伤', base: { hp: 500, atk: 10, def: 10, spd: 5 } });
  hurt.hp = 100;
  let onlyHurt = true;
  for (let i = 0; i < 12; i++) {
    const gb = sandbox.createGroupBattle({ allies: [caster, full, hurt], enemies: [foe('e-hl')], seed: i });
    const tg = sandbox.selectTargets(gb, caster, sk);
    if (!tg.length || tg[0].id !== 'hl-hurt') onlyHurt = false;
  }
  assert('§2.11 12 个种子下全部只命中受伤者（不再治疗满血队友）', onlyHurt);
  const gbAllFull = sandbox.createGroupBattle({ allies: [caster, full], enemies: [foe('e-hl2')], seed: 1 });
  assert('§2.11 全队满血时不空放（退回全体友方）', sandbox.selectTargets(gbAllFull, caster, sk).length === 1);
  /* 治疗区间：评审「魂攻×150%-240%」（原 110%~200%） */
  const eqPow = Array.isArray(sk.range.power) && sk.range.power.length === 2 &&
    Math.abs(sk.range.power[0] - 150) < 1e-9 && Math.abs(sk.range.power[1] - 240) < 1e-9;
  assert('§2.11 治疗区间 110~200% → [150,240]', eqPow, JSON.stringify(sk.range.power));
  const casterFull = petUnit('p-hl-max', '光之精灵', { hp: 200, atk: 20, def: 15, soulAtk: 20, soulDef: 10, spd: 8 },
    ['pet', 'SSR'], ['p_holylight'], 80);
  const t0 = runFx('p_holylight', caster, [sandbox.createUnit({ id: 'hl-h0', side: 'ally', name: '友', base: { hp: 500, atk: 1, def: 1, spd: 1 } })]);
  const t1 = runFx('p_holylight', casterFull, [sandbox.createUnit({ id: 'hl-h1', side: 'ally', name: '友', base: { hp: 500, atk: 1, def: 1, spd: 1 } })]);
  assert('§2.11 治疗量随成长：t=0 → 魂攻×150%（20→30）、t=1 → ×240%（20→48）',
    t0.heals.length === 1 && t0.heals[0].amount === 30 && t1.heals[0].amount === 48,
    JSON.stringify([t0.heals, t1.heals]));
}

/* ===== §2.12 梦幻光球：弹射 3 次 / 每单位 1 次 / 累计 +10% / 未发动回血 ===== */
{
  const sk = skill('p_dreamball');
  assert('§2.12 单次伤害 200~290% → [220,310]', JSON.stringify(sk.range.power) === '[220,310]');
  assert('§2.12 声明蓄力 1 回合', sk.charge === true);
  assert('§2.12 弹射参数（3 次 / 每次 +10% / 敌方 55%→82%，我方互补 45%→18%）',
    JSON.stringify(sk.bounce) === '{"times":3,"dmgUp":0.1,"foeChance":[0.55,0.82]}', JSON.stringify(sk.bounce));
  const caster = petUnit('p-db', '梦幻', { hp: 300, atk: 30, def: 20, soulAtk: 300, soulDef: 15, spd: 9 },
    ['pet', 'UR'], ['p_dreamball'], 0);
  const enemies = [1, 2, 3].map(function (i) { return foe('e-db' + i); });
  const mate = sandbox.createUnit({ id: 'db-m1', side: 'ally', name: '友', base: { hp: 500, atk: 5, def: 5, spd: 5 } });
  const gb = sandbox.createGroupBattle({ allies: [caster, mate], enemies: enemies, seed: 21 });
  const gr = sandbox.calcSkillDamage(sk, caster, [enemies[0]], { rng: gb.rng, pool: enemies, allPool: gb.units });
  assert('§2.12 弹射 3 次', gr.hits.length === 3, String(gr.hits.length));
  assert('§2.12 每单位最多受到 1 次弹射',
    new Set(gr.hits.map(function (h) { return h.targetId; })).size === 3,
    JSON.stringify(gr.hits.map(function (h) { return h.targetId; })));
  assert('§2.12 每次弹射伤害累计 +10%（本次施放内累加）',
    gr.hits[1].amount > gr.hits[0].amount && gr.hits[2].amount > gr.hits[1].amount,
    JSON.stringify(gr.hits.map(function (h) { return h.amount; })));
  /* 候选枯竭 → 未发动次数按单次伤害为自身回血 */
  const gbSolo = sandbox.createGroupBattle({ allies: [caster], enemies: [foe('e-db-solo')], seed: 5 });
  const grSolo = sandbox.calcSkillDamage(sk, caster, [gbSolo.enemies[0]], { rng: gbSolo.rng, pool: gbSolo.enemies, allPool: gbSolo.units });
  assert('§2.12 全场只有 2 单位 → 弹 2 次、1 次未发动折算回血',
    grSolo.hits.length === 2 && grSolo.selfHealAmount > 0, JSON.stringify({ n: grSolo.hits.length, heal: grSolo.selfHealAmount }));
}

/* ===== §2.13 无影拳：4 段 / 单次 55~100% / 视为普攻 ===== */
{
  const sk = skill('p_shadowfist');
  assert('§2.13 4 段攻击（原 5 段）', sk.multiHit === 4);
  assert('§2.13 单次伤害 50~95% → [55,100]', JSON.stringify(sk.range.power) === '[55,100]');
  assert('§2.13 视为普通攻击（触发普攻相关钩子）', sk.asNormalAttack === true);

  /* ---- v2.3.0（作者裁决「就按照普通攻击会如何触发就如何实现」）：**真正走普攻通道** ----
     可观测判据（两条都在技能通道里**不可能**出现）：
       · 每段出的是**普攻日志**「⚔️ X 攻击 Y → N 伤害」，而不是技能日志「⚡ X 无影拳 → N 伤害」；
       · 普攻通道特有的**魂攻附伤**「👻 … 魂攻击 …」会出现（技能通道从不产生它）。
     再加一条源码级守卫，钉住「asNormalAttack 分支调用的就是 normalAttack()」。 */
  const fistCaster = petUnit('sf-c', '无念熊', { hp: 300, atk: 100, def: 5, soulAtk: 50, soulDef: 5, spd: 9 },
    ['pet', 'UR'], ['p_shadowfist'], 0);
  const sfE = foe('sf-e1');
  sfE.base.hp = sfE.hp = 999999;
  const gbSf = sandbox.createGroupBattle({ allies: [fistCaster], enemies: [sfE], seed: 91 });
  gbSf.rng = function () { return 0.1; };              // 必中 / 伤害掷骰固定
  gbSf.turn = 1;
  const evSf = sandbox.castSkill(gbSf, fistCaster, 'p_shadowfist');
  const nAtk = evSf.filter(e => /^⚔️/.test(e.msg || '')).length;
  const nSkillDmg = evSf.filter(e => /^⚡.*伤害/.test(e.msg || '')).length;
  const nSoul = evSf.filter(e => /^👻/.test(e.msg || '')).length;
  assert('§2.13 改走普攻通道：4 段都是**普攻日志**、没有任何一段走技能伤害通道',
    nAtk === 4 && nSkillDmg === 0, JSON.stringify({ atk: nAtk, skillDmg: nSkillDmg, msgs: evSf.map(e => e.msg).slice(0, 10) }));
  assert('§2.13 普攻通道的**魂攻附伤**逐段生效（技能通道从不产生 👻）',
    nSoul === 4, JSON.stringify({ soul: nSoul }));
  const sfSrc = load('battle-group.js');
  assert('§2.13 源码级守卫：asNormalAttack 走 normalAttack()，且旧的「技能通道 + onAfterDamage 补丁」已删',
    /if \(dmgResult\.normalSlots\)/.test(sfSrc) && /normalAttack\(gb, actor, nt, naMul\)/.test(sfSrc) &&
    !/if \(def\.asNormalAttack\) \{/.test(sfSrc));
}

/* ===== §2.13 + §2.14 吸血**互斥**（v2.3.0 作者裁决）=====
   作者原话：「查看文档该技能是否视为普通攻击，如果视为普通攻击则不会触发技能吸血，
   反之不会触发攻击吸血」。文档 §2.13 写明无影拳「每次视为普通攻击」→ 只触发**普攻吸血**。 */
{
  function lifestealChannels(skillId) {
    const u = petUnit('mx-' + skillId, '测试宠', { hp: 300, atk: 100, def: 5, soulAtk: 50, soulDef: 5, spd: 9 },
      ['pet', 'UR'], [skillId], 0);
    /* 用与 castSkill 落库同形状的「战意」状态实例（data.ls = 普攻吸血 / data.sls = 技能吸血） */
    sandbox.applyStatus(u, { id: 'warmight', duration: 2, data: { ls: 0.5, sls: 0.325 } });
    const f = foe('mx-foe-' + skillId);
    f.base.hp = f.hp = 999999;
    const gb = sandbox.createGroupBattle({ allies: [u], enemies: [f], seed: 5 });
    gb.rng = function () { return 0.1; };
    gb.turn = 1;
    const ev = sandbox.castSkill(gb, u, skillId);
    return {
      hit: ev.filter(e => /^⚔️/.test(e.msg || '')).length,
      ls: ev.filter(e => /战意吸血/.test(e.msg || '')).length,     // 普攻通道吸血
      sls: ev.filter(e => /技能吸血/.test(e.msg || '')).length     // 技能通道吸血
    };
  }
  const fistCh = lifestealChannels('p_shadowfist');
  const peckCh = lifestealChannels('p_flamepeck');
  assert('§2.13+§2.14 互斥：无影拳（视为普攻）→ 只触发**普攻吸血**，技能吸血 0 次',
    fistCh.ls > 0 && fistCh.sls === 0, JSON.stringify(fistCh));
  assert('§2.13+§2.14 互斥：火焰啄击（不视为普攻）→ 只触发**技能吸血**，普攻吸血 0 次',
    peckCh.sls > 0 && peckCh.ls === 0 && peckCh.hit === 0, JSON.stringify(peckCh));
}

/* ===== §2.14 战意灌注：2 名友方 / 较高一项 / 吸血 + 技能吸血 ===== */
{
  const sk = skill('p_warmight');
  assert('§2.14 目标 → 随机 2 名友方（ally2）', sk.target === 'ally2');
  assert('§2.14 区间：升幅[3,30] / 吸血[5,50] / 技能吸血[7.5,32.5]',
    JSON.stringify(sk.range) === '{"atkBoost":[3,30],"lifesteal":[5,50],"skillLifesteal":[7.5,32.5]}', JSON.stringify(sk.range));

  const UR_BASE = { hp: 300, atk: 30, def: 20, soulAtk: 20, soulDef: 15, spd: 9 };
  const caster = petUnit('p-wm', '圣光麒麟', UR_BASE, ['pet', 'UR'], ['p_warmight'], 0);
  const casterFull = petUnit('p-wm-full', '圣光麒麟', UR_BASE, ['pet', 'UR'], ['p_warmight'], 100);
  const mkMate = function (id, atk, soul, skills) {
    return sandbox.createUnit({ id: id, side: 'ally', name: id, base: { hp: 500, atk: atk, def: 10, soulAtk: soul, spd: 5 }, skills: skills || [] });
  };
  const atkHi = mkMate('wm-atk', 100, 10);
  const soulHi = mkMate('wm-soul', 10, 100, ['p_flamepeck']);

  const fx = sandbox.applySkillEffects(sk, caster, [atkHi, soulHi], {});
  assert('§2.14 2 名友方各得 1 条战意 buff', fx.buffs.length === 2, String(fx.buffs.length));
  assert('§2.14 「较高一项」：攻击高 → 只加攻击（不加魂攻）',
    fx.buffs[0].modsPct.atk != null && fx.buffs[0].modsPct.soulAtk == null, JSON.stringify(fx.buffs[0].modsPct));
  assert('§2.14 「较高一项」：魂攻高 → 只加魂攻（不加攻击）',
    fx.buffs[1].modsPct.soulAtk != null && fx.buffs[1].modsPct.atk == null, JSON.stringify(fx.buffs[1].modsPct));
  assert('§2.14 t=0：升幅 3% / 吸血 5% / 技能吸血 7.5%',
    Math.abs(fx.buffs[0].value - 0.03) < 1e-9 && Math.abs(fx.buffs[0].lifesteal - 0.05) < 1e-9 &&
    Math.abs(fx.buffs[0].skillLifesteal - 0.075) < 1e-9, JSON.stringify(fx.buffs[0]));
  const fxFull = sandbox.applySkillEffects(sk, casterFull, [atkHi], {});
  assert('§2.14 t=1：升幅 30% / 吸血 50% / 技能吸血 32.5%',
    Math.abs(fxFull.buffs[0].value - 0.30) < 1e-9 && Math.abs(fxFull.buffs[0].lifesteal - 0.50) < 1e-9 &&
    Math.abs(fxFull.buffs[0].skillLifesteal - 0.325) < 1e-9, JSON.stringify(fxFull.buffs[0]));

  /* ---- 落地：castSkill 把 buff 变成状态（atkup 键由「较高一项」决定 + warmight 吸血） ---- */
  const gb = sandbox.createGroupBattle({ allies: [caster, atkHi, soulHi], enemies: [foe('e-wm')], seed: 31 });
  gb.turn = 1;
  sandbox.castSkill(gb, caster, 'p_warmight');
  assert('§2.14 实战：2 名友方获得「战意」状态',
    gb.allies.filter(function (u) { return sandbox.hasStatus(u, 'warmight'); }).length === 2,
    JSON.stringify(gb.allies.map(function (u) { return u.id + ':' + (u.statuses || []).map(function (s) { return s.id; }).join('+'); })));
  const wmAtk = gb.allies.filter(function (u) { return sandbox.hasStatus(u, 'warmight'); })[0];
  assert('§2.14 战意状态实例携带吸血 / 技能吸血数值',
    wmAtk.statuses.filter(function (s) { return s.id === 'warmight'; })[0].data.ls > 0,
    JSON.stringify(wmAtk.statuses.filter(function (s) { return s.id === 'warmight'; })[0].data));
  /* 「较高一项」真的落到属性上：攻击流持有者 → atk 提升、soulAtk 不动（t=0 → +3%，向下取整不丢 100 的 3%） */
  const wmSoul = gb.allies.filter(function (u) { return u.id === 'wm-soul'; })[0];
  assert('§2.14 「较高一项」落到属性：攻击流持有者 effectiveStat(atk) 提升、魂攻不动',
    sandbox.effectiveStat(atkHi, 'atk') === Math.floor(atkHi.base.atk * 1.03) &&
    sandbox.effectiveStat(atkHi, 'soulAtk') === atkHi.base.soulAtk &&
    sandbox.effectiveStat(wmSoul, 'soulAtk') === Math.floor(wmSoul.base.soulAtk * 1.03) &&
    sandbox.effectiveStat(wmSoul, 'atk') === wmSoul.base.atk,
    JSON.stringify({ aAtk: sandbox.effectiveStat(atkHi, 'atk'), sSoul: sandbox.effectiveStat(wmSoul, 'soulAtk') }));

  /* ---- 吸血（普攻通道）：与天赋「嗜血」叠加 ---- */
  const gb2 = sandbox.createGroupBattle({ allies: [caster, atkHi], enemies: [foe('e-wm2')], seed: 41 });
  gb2.turn = 1;
  sandbox.castSkill(gb2, caster, 'p_warmight');
  const holder = atkHi;
  holder._talents = ['bloodthirst'];
  holder.hp = 50;
  const ls = holder.statuses.filter(function (s) { return s.id === 'warmight'; })[0].data.ls;
  gb2.rng = function () { return 0.1; };                     // 保证命中且伤害无随机
  const evNA = sandbox.normalAttack(gb2, holder, gb2.enemies[0]);
  const dealt = +(/→ (\d+) 伤害/.exec(evNA.filter(function (e) { return /^⚔️/.test(e.msg || ''); })[0].msg)[1]);
  const healW = evNA.filter(function (e) { return /战意吸血/.test(e.msg || ''); })[0];
  const healB = evNA.filter(function (e) { return /嗜血/.test(e.msg || ''); })[0];
  assert('§2.14 吸血生效：回血 = 普攻伤害 × 吸血率',
    !!healW && +(/\+(\d+)/.exec(healW.msg)[1]) === Math.max(1, Math.floor(dealt * ls)),
    healW && healW.msg);
  assert('§2.14 与「嗜血」叠加：两条独立回血各自结算（不取最高）',
    !!healB && +(/恢复 (\d+)/.exec(healB.msg)[1]) === Math.floor(dealt * 0.2), healB && healB.msg);

  /* ---- 技能吸血（技能通道） ---- */
  const gb3 = sandbox.createGroupBattle({ allies: [caster, soulHi], enemies: [foe('e-wm3')], seed: 51 });
  gb3.turn = 1;
  sandbox.castSkill(gb3, caster, 'p_warmight');
  soulHi.hp = 20;
  const sls = soulHi.statuses.filter(function (s) { return s.id === 'warmight'; })[0].data.sls;
  gb3.rng = function () { return 0.1; };
  const evSk = sandbox.castSkill(gb3, soulHi, 'p_flamepeck');
  const dmgEv = evSk.filter(function (e) { return /^⚡/.test(e.msg || ''); })[0];
  const dealtS = +(/→ \S+ (\d+) 伤害/.exec(dmgEv.msg)[1]);
  const healS = evSk.filter(function (e) { return /技能吸血/.test(e.msg || ''); })[0];
  assert('§2.14 技能吸血生效：回血 = 技能伤害 × 技能吸血率',
    !!healS && +(/\+(\d+)/.exec(healS.msg)[1]) === Math.max(1, Math.floor(dealtS * sls)) && sls > 0,
    healS && healS.msg);

  /* ---- 镜像结界 ±25% 可缩放吸血（§6.3 裁决：属可缩放的辅助效果） ---- */
  const mirrorHolder = mkMate('wm-mirror', 100, 10);
  mirrorHolder._talents = ['mirror_field'];
  const gb4 = sandbox.createGroupBattle({ allies: [caster, mirrorHolder], enemies: [foe('e-wm4')], seed: 61 });
  gb4.turn = 1;
  sandbox.castSkill(gb4, caster, 'p_warmight');
  const mData = mirrorHolder.statuses.filter(function (s) { return s.id === 'warmight'; })[0].data;
  assert('§2.14 镜像结界放大吸血（我方来源 ×1.25：5% → 6.25%）',
    Math.abs(mData.ls - 0.0625) < 1e-9, JSON.stringify(mData));
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

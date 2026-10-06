#!/usr/bin/env node
/* 作者裁决落地测试（2026-10-06 裁决记录见 doc/plans/战斗系统-施工任务计划.md 附录）
   §1 裁决 1（v2.9.0）：吸血基数 = **目标实际掉血**（不含 overkill）
   §2 裁决 5（v2.9.0）：**普通技能不判命中、不暴击**；`asNormalAttack`（视为普攻）的照旧
   后续裁决（4 / 2 / 3 / 6）另开小节追加到本文件。

   ⚠️ 本套件用**单条可控种子流**（mulberry32），断言里出现的分布类判据都靠它复现。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['utils.js', 'date-roll.js', 'levels.js', 'group-levels.js', 'unit.js', 'state-core.js',
  'status-defs.js', 'talent.js', 'affix.js', 'skill.js', 'enemy.js', 'battle.js', 'battle-group.js',
  'terrain.js', 'ai.js', 'pets.js', 'pet-materials.js', 'pet-codex.js', 'skills.js',
  'player-skill-hooks.js', 'orbs.js'];
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const deterministicMath = Object.create(Math);
deterministicMath.random = mulberry32(20261006);
const sb = { Math: deterministicMath, JSON, console, Date };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const msgs = evs => (evs || []).map(e => (e && e.msg) || '').join(' | ');

function mkB(out) {
  const atk = sb.createUnit({ id: 'a', side: 'ally', name: '攻', base: { hp: 5000, atk: 600, def: 0, soulAtk: 0, spd: 9 } });
  const foe = sb.createEnemyUnit({ id: 'e', tier: 'minion', name: '靶', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [foe], seed: 4242, rng: sb.beginBattleRng(4242) });
  out.atk = out.atk || atk; out.foe = out.foe || foe;
  return gb;
}

/* ============ §1 裁决 1：吸血基数 = 目标实际掉血（不含 overkill） ============ */
console.log('[1] 裁决 1：吸血基数 = 实际掉血');
{
  /* (a) overkill：目标只剩 40 血，一击理论伤害远大于 40 → 回血必须按 40 算 */
  const h = {};
  const atk = sb.createUnit({ id: 'ov-a', side: 'ally', name: '攻', base: { hp: 5000, atk: 600, def: 0, soulAtk: 0, spd: 9 } });
  atk._talents = ['bloodthirst'];   /* ⚠️ talentDispatch 读的是 _talents，不是 talents */
  const foe = sb.createEnemyUnit({ id: 'ov-e', tier: 'minion', name: '靶', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  foe.hp = 40;
  const gb = sb.createGroupBattle({ allies: [atk], enemies: [foe], seed: 7, rng: sb.beginBattleRng(7) });
  const evs = sb.normalAttack(gb, atk, foe);
  const text = msgs(evs);
  const theoretical = (() => { const m = /攻击 靶 → (\d+) 伤害/.exec(text); return m ? +m[1] : null; })();
  const heal = (() => { const m = /嗜血: 恢复 (\d+)/.exec(text); return m ? +m[1] : null; })();
  const actualLost = 40;   /* 目标只剩 40 → 实际掉血最多 40 */
  assert('1a overkill 场景确实发生了（目标被打死且理论伤害 > 实际掉血）',
    foe.hp === 0 && theoretical > actualLost,
    JSON.stringify({ theoretical: theoretical, hp: foe.hp }));
  /* 嗜血比例随成长在 [10%,35%]，故上限判据 = 实际掉血 × 35%（旧实现按理论伤害 → 必然超） */
  assert('1a 嗜血回血按**实际掉血**封顶（不含 overkill）',
    heal !== null && heal > 0 && heal <= Math.floor(actualLost * 0.35),
    JSON.stringify({ heal: heal, limit: Math.floor(actualLost * 0.35), theoretical: theoretical }));
  assert('1a 同一攻击仍按理论伤害扣血（只改吸血基数，未改伤害）',
    theoretical >= 600 - 40,
    JSON.stringify({ theoretical: theoretical }));

  /* (b) 对照：非 overkill（目标血厚）→ 基数不变，回血仍落在 [10%,35%] 档内 */
  const atk2 = sb.createUnit({ id: 'nm-a', side: 'ally', name: '攻', base: { hp: 5000, atk: 600, def: 0, soulAtk: 0, spd: 9 } });
  atk2._talents = ['bloodthirst'];
  const foe2 = sb.createEnemyUnit({ id: 'nm-e', tier: 'minion', name: '厚', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  const gb2 = sb.createGroupBattle({ allies: [atk2], enemies: [foe2], seed: 11, rng: sb.beginBattleRng(11) });
  const evs2 = sb.normalAttack(gb2, atk2, foe2);
  const t2 = msgs(evs2);
  const dmg2 = (() => { const m = /攻击 厚 → (\d+) 伤害/.exec(t2); return m ? +m[1] : null; })();
  const heal2 = (() => { const m = /嗜血: 恢复 (\d+)/.exec(t2); return m ? +m[1] : null; })();
  assert('1b 非 overkill 时回血仍按本次伤害的比例（10%~35% 档，未被改坏）',
    heal2 !== null && dmg2 !== null && heal2 >= Math.floor(dmg2 * 0.10) - 1 && heal2 <= Math.floor(dmg2 * 0.35) + 1,
    JSON.stringify({ dmg: dmg2, heal: heal2 }));

  /* (c) 护盾吸收的部分不算「实际掉血」：给目标挂满护盾，回血应≈0 */
  const atk3 = sb.createUnit({ id: 'sh-a', side: 'ally', name: '攻', base: { hp: 5000, atk: 600, def: 0, soulAtk: 0, spd: 9 } });
  atk3._talents = ['bloodthirst'];
  const foe3 = sb.createEnemyUnit({ id: 'sh-e', tier: 'minion', name: '盾', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  foe3._shield = 100000;
  const gb3 = sb.createGroupBattle({ allies: [atk3], enemies: [foe3], seed: 13, rng: sb.beginBattleRng(13) });
  const evs3 = sb.normalAttack(gb3, atk3, foe3);
  const heal3 = (() => { const m = /嗜血: 恢复 (\d+)/.exec(msgs(evs3)); return m ? +m[1] : null; })();
  assert('1c 被护盾吸收的伤害不计入吸血基数（实际掉血 = 0）',
    foe3.hp === 100000 && (heal3 === null || heal3 === 0),
    JSON.stringify({ hp: foe3.hp, heal: heal3 }));
}

/* ============ §2 裁决 5：普通技能不判命中、不暴击 ============ */
console.log('[2] 裁决 5：技能不判命中/暴击');
{
  const hits = [];
  const foe = sb.createEnemyUnit({ id: 'sk-e', tier: 'minion', name: '法', base: { hp: 100000, atk: 500, def: 0, soulAtk: 0, spd: 9 } });
  foe.skills = ['bite'];
  foe._talents = ['fighter_instinct'];   /* 斗者本能：30% 暴击 / 150%（旧技能链路会吃它） */
  const ally = sb.createUnit({ id: 'sk-a', side: 'ally', name: '受', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  const gb = sb.createGroupBattle({ allies: [ally], enemies: [foe], seed: 99, rng: sb.beginBattleRng(99) });
  for (let i = 0; i < 200; i++) {
    ally.hp = 100000;
    const evs = sb.castSkill(gb, foe, 'bite');
    hits.push(msgs(evs));
  }
  const all = hits.join(' || ');
  const miss = (all.match(/落空/g) || []).length;
  const crit = (all.match(/暴击/g) || []).length;
  assert('2a 200 次技能施放：一次「落空」都没有（技能不做命中判定）', miss === 0, '落空 ' + miss + ' 次');
  assert('2b 200 次技能施放：一次「暴击」都没有（技能不触发暴击）', crit === 0, '暴击 ' + crit + ' 次');
  assert('2c 技能仍然造成伤害（不是因为报错而「没有落空/暴击」）',
    (all.match(/伤害/g) || []).length >= 200, '伤害事件 ' + (all.match(/伤害/g) || []).length + ' 条');

  /* 对照：普通攻击通道**必须仍然**会落空 —— 防止把命中判定从普攻里一起删掉 */
  const atk = sb.createUnit({ id: 'na-a', side: 'ally', name: '攻', base: { hp: 100000, atk: 300, def: 0, soulAtk: 0, spd: 9 } });
  const foe2 = sb.createEnemyUnit({ id: 'na-e', tier: 'minion', name: '靶', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  const gb2 = sb.createGroupBattle({ allies: [atk], enemies: [foe2], seed: 5, rng: sb.beginBattleRng(5) });
  let naMiss = 0;
  for (let i = 0; i < 200; i++) {
    if (/落空/.test(msgs(sb.normalAttack(gb2, atk, foe2)))) naMiss++;
  }
  assert('2d 对照：普通攻击仍然会落空（命中判定只从技能链路移除）', naMiss > 0, '普攻落空 ' + naMiss + ' 次');

  /* 对照：asNormalAttack（视为普攻）的技能**不属于**技能链路，仍走普攻通道（可有命中判定） */
  const sfUser = sb.createUnit({ id: 'sf-a', side: 'ally', name: '拳', base: { hp: 100000, atk: 300, def: 0, soulAtk: 0, spd: 9 } });
  const foe3 = sb.createEnemyUnit({ id: 'sf-e', tier: 'minion', name: '靶', base: { hp: 100000, atk: 1, def: 0, soulAtk: 0, spd: 1 } });
  const gb3 = sb.createGroupBattle({ allies: [sfUser], enemies: [foe3], seed: 17, rng: sb.beginBattleRng(17) });
  let sfMiss = 0;
  for (let i = 0; i < 200; i++) {
    if (/落空/.test(msgs(sb.castSkill(gb3, sfUser, 'p_shadowfist')))) sfMiss++;
  }
  assert('2e 对照：视为普攻的技能（无影拳 asNormalAttack）仍会走命中判定', sfMiss > 0, '无影拳落空 ' + sfMiss + ' 次');
}

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

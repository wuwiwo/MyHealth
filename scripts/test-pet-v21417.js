#!/usr/bin/env node
/* v2.14.17 宠物天赋补齐 + 数值调整专项测试（10 项）
   必须含 utils.js 第一位（battleRnd / makeSeededRng 定义处），且显式加载全部运行时依赖。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const FILES = ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js',
  'skill.js', 'enemy.js', 'battle.js', 'battle-group.js', 'pets.js', 'pet-materials.js', 'pet-codex.js',
  'affix.js', 'group-levels.js', 'orbs.js', 'pet-store.js', 'terrain.js',
  'skills.js', 'player-skill-hooks.js'];
const src = {};
FILES.forEach(f => { src[f] = load(f); });

function mkSandbox(seed) {
  let a = (seed >>> 0) || 1;
  const M = Object.create(Math);
  M.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mem = {};
  const sb = { Math:M, JSON, console, Date };
  sb.store = { get:k=>mem[k], set:(k,v)=>{mem[k]=v;}, register:()=>{}, registerSchema:()=>{} };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(src[f], sb));
  return sb;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function mkUnit(sb, id, side, talents, base) {
  const u = sb.createUnit({ id, side, name:id, level:1, base:Object.assign({hp:100,atk:20,def:10,soulAtk:10,soulDef:5,spd:5}, base||{}) });
  if (talents) sb.attachTalents(u, talents);
  return u;
}

const S = mkSandbox(20261126);

/* ---------- 1 不动如山每回合回 3% ---------- */
console.log('\n[1] 不动如山每回合恢复最大生命 3%');
{
  const u = mkUnit(S, 'kirin', 'ally', ['immovable']);
  u.hp = 50;
  const r = S.talentDispatch(u, 'onTurnEnd', {});
  const healed = r.events.some(e => e.type === 'heal');
  assert('触发回血事件', healed);
  assert('回血 = 3（100×3%）', u.hp === 53, String(u.hp));
  u.hp = 100;
  const r2 = S.talentDispatch(u, 'onTurnEnd', {});
  assert('满血不空放', u.hp === 100 && !r2.events.some(e => e.type === 'heal'));
}

/* ---------- 2 战意灌注吸血 10~100% ---------- */
console.log('\n[2] 战意灌注吸血区间');
{
  const d = S.SKILLS['p_warmight'];
  assert('lifesteal 区间 = [10,100]', d && d.range.lifesteal[0] === 10 && d.range.lifesteal[1] === 100, JSON.stringify(d && d.range.lifesteal));
  assert('skillLifesteal 保持 [7.5,32.5]', d.range.skillLifesteal[0] === 7.5 && d.range.skillLifesteal[1] === 32.5);
}

/* ---------- 3 梦幻光球治疗 -40% ---------- */
console.log('\n[3] 梦幻光球自愈 ×0.6');
{
  const d = S.SKILLS['p_dreamball'];
  assert('bounce.healScale = 0.6', d && d.bounce.healScale === 0.6, JSON.stringify(d && d.bounce));
  assert('源码 healScale 消费存在', /healScale\s*>\s*0\s*\?\s*b\.healScale\s*:\s*1/.test(src['skill.js']));
}

/* ---------- 4 战意灌注先制度 = 技能自身 ---------- */
console.log('\n[4] 战意灌注先制度改为技能本身');
{
  const d = S.SKILLS['p_warmight'];
  assert('p_warmight.priority = 1', d.priority === 1, String(d.priority));
  assert('effects 不再产出 priorityBonus', !/priorityBonus\s*:\s*1/.test(src['pet-codex.js']));
  assert('predeclareActions 我方先制分支存在', /u\.side\s*!==\s*'enemy'[\s\S]{0,400}hasPrio/.test(src['battle-group.js']));
  assert('takeDeclaredAction 我方回落 pickSkill', /actor\.side\s*!==\s*'enemy'[\s\S]{0,150}pickSkill/.test(src['battle-group.js']));
}

/* ---------- 5~10 新天赋注册与图鉴挂载 ---------- */
console.log('\n[5-10] 六个新天赋注册 + 图鉴挂载');
{
  const ids = ['rain_sprint','sparkle_guard','flame_spirit','stone_thorns','chirp_sustain','thunder_haste'];
  ids.forEach(id => assert('天赋已注册 ' + id, !!S.TALENTS[id], id));
  const map = { rain_sprint:'waterdrop', sparkle_guard:'sparkle', flame_spirit:'flamechick',
    stone_thorns:'rocksteady', chirp_sustain:'chirpbird', thunder_haste:'thunderdog' };
  Object.keys(map).forEach(tid => {
    const c = S.PET_CODEX[map[tid]];
    assert(map[tid] + ' 挂载 ' + tid, c && c.talents.indexOf(tid) >= 0, JSON.stringify(c && c.talents));
  });
  ids.forEach(id => assert('petOnly ' + id, S.TALENTS[id].petOnly === true));
}

/* ---------- 5 雨中疾行 ---------- */
console.log('\n[5] 雨中疾行：雨天 spd×2、回合末还原');
{
  const u = mkUnit(S, 'waterdrop', 'ally', ['rain_sprint']);
  const orig = u.base.spd;
  const r = S.talentDispatchPhase(u, 'onTurnStart', { terrain:{ id:'rain' } }, 'prepare');
  assert('雨天触发', r.events.some(e => /雨中疾行/.test(e.msg)));
  assert('速度翻倍 ' + orig + '→' + (orig*2), u.base.spd === orig*2, String(u.base.spd));
  S.talentDispatch(u, 'onTurnEnd', {});
  assert('回合末还原', u.base.spd === orig, String(u.base.spd));
  const r2 = S.talentDispatchPhase(u, 'onTurnStart', { terrain:{ id:'sandstorm' } }, 'prepare');
  assert('非雨天不触发', !r2.events.some(e => /雨中疾行/.test(e.msg)) && u.base.spd === orig);
}

/* ---------- 6 星芒庇护 ---------- */
console.log('\n[6] 星芒庇护：受击 40% 减伤 25%');
{
  // 用固定 random 序列确认至少一次触发、且不误触发攻击方通道
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    const sb = mkSandbox(1000 + i);
    const u = mkUnit(sb, 'sparkle', 'ally', ['sparkle_guard']);
    const r = sb.talentDispatch(u, 'onDamage', { isPlayerAttack:false, amount:10, attacker:{id:'e',hp:10} });
    if (r.mutations.some(m => m.key === 'dmgTakenReduce' && m.value === 0.25)) hit++;
  }
  assert('200 次中触发（约 40%）', hit > 50 && hit < 130, String(hit));
  const sb = mkSandbox(7);
  const u = mkUnit(sb, 'sparkle', 'ally', ['sparkle_guard']);
  const r = sb.talentDispatch(u, 'onDamage', { isPlayerAttack:true, amount:10 });
  assert('攻击方通道不触发', r.mutations.length === 0);
}

/* ---------- 7 斗志昂扬 ---------- */
console.log('\n[7] 斗志昂扬：攻/受击 25% 速度+1');
{
  let attackHits = 0, defendHits = 0;
  for (let i = 0; i < 200; i++) {
    const sb = mkSandbox(2000 + i);
    const u = mkUnit(sb, 'flamechick', 'ally', ['flame_spirit']);
    const base = u.base.spd;
    const r1 = sb.talentDispatch(u, 'onAfterDamage', { dealt:10 });
    if (u.base.spd === base + 1) attackHits++;
    const u2 = mkUnit(sb, 'flamechick2', 'ally', ['flame_spirit']);
    const b2 = u2.base.spd;
    sb.talentDispatch(u2, 'onDamage', { isPlayerAttack:false, amount:10 });
    if (u2.base.spd === b2 + 1) defendHits++;
  }
  assert('攻击侧触发约 25%', attackHits > 20 && attackHits < 80, String(attackHits));
  assert('受击侧触发约 25%', defendHits > 20 && defendHits < 80, String(defendHits));
}

/* ---------- 8 磐石反噬 ---------- */
console.log('\n[8] 磐石反噬：反弹 (def+soulDef)×10%，过减伤不过防御');
{
  const sb = mkSandbox(3000);
  const u = mkUnit(sb, 'rocksteady', 'ally', ['stone_thorns'], { def:10, soulDef:5 });
  const attacker = mkUnit(sb, 'enemy1', 'enemy', [], { def:999, soulDef:999, hp:100 });
  const r = sb.talentDispatch(u, 'onDamage', { isPlayerAttack:false, amount:50, attacker });
  const m = r.mutations.find(x => x.key === 'reflectMitigated');
  assert('产出 reflectMitigated', !!m);
  assert('反弹值 = (10+5)×10% = 1', m && m.value === 1, m && String(m.value));
  assert('不按敌人防御做减法', m && m.value < 999);
  // 消费端：攻击者带不动如山（>90% 血 → -50%）→ 反弹 1 下限截断为 1，故用大基数验证
  const sb2 = mkSandbox(3001);
  const u2 = mkUnit(sb2, 'rocksteady2', 'ally', ['stone_thorns'], { def:100, soulDef:100 });
  const atk2 = mkUnit(sb2, 'enemy2', 'enemy', ['immovable'], { hp:1000, def:0, soulDef:0 });
  const r2 = sb2.talentDispatch(u2, 'onDamage', { isPlayerAttack:false, amount:50, attacker:atk2 });
  const m2 = r2.mutations.find(x => x.key === 'reflectMitigated');
  assert('大基数反弹 = 20', m2 && m2.value === 20, m2 && String(m2.value));
  const ev = [];
  sb2.applyReflectMitigated(sb2, atk2, m2.value, ev, '磐石反噬');
  assert('过不动如山减伤 20→10', atk2.hp === 990, String(atk2.hp));
}

/* ---------- 9 共鸣之歌 ---------- */
console.log('\n[9] 共鸣之歌：我方施放技能时自回 2%');
{
  const sb = mkSandbox(4000);
  const u = mkUnit(sb, 'chirpbird', 'ally', ['chirp_sustain'], { hp:100 });
  u.hp = 50;
  const r = sb.talentDispatch(u, 'onAllyCastSkill', { caster:{id:'other'}, skillId:'x' });
  assert('回血事件', r.events.some(e => e.type === 'heal'));
  assert('回复 2（100×2%）', u.hp === 52, String(u.hp));
  assert('castSkill 有派发点', /talentAura\(gb\.allies,\s*'onAllyCastSkill'/.test(src['battle-group.js']));
}

/* ---------- 10 雷鸣加速 ---------- */
console.log('\n[10] 雷鸣加速：我方施放技能 20% 自身 CD-1');
{
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    const sb = mkSandbox(5000 + i);
    const u = mkUnit(sb, 'thunderdog', 'ally', ['thunder_haste']);
    u.counters = { cd:{ p_thundercharge:3 } };
    sb.talentDispatch(u, 'onAllyCastSkill', { caster:{id:'other'}, skillId:'x' });
    if (u.counters.cd.p_thundercharge === 2) hit++;
  }
  assert('200 次中触发约 20%', hit > 15 && hit < 75, String(hit));
  const sb = mkSandbox(6000);
  const u = mkUnit(sb, 'thunderdog2', 'ally', ['thunder_haste']);
  // 无冷却表时不报错
  sb.talentDispatch(u, 'onAllyCastSkill', { caster:{id:'other'}, skillId:'x' });
  assert('无冷却表安全', true);
  assert('不误改他人 CD', !/onAllyCastSkill[\s\S]{0,300}caster\.counters\.cd/.test(src['pet-codex.js']));
}

console.log('\n合计: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

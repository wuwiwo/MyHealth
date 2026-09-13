#!/usr/bin/env node
/* v2.1.16 测试：可达性守卫
   问题：技能 / 天赋写在 skill.js / talent.js 里、引擎也跑得通，
   但若不在任何一个池里，实战永远见不到 —— v2.1.15 披露过 8 个这样的技能，
   本版把它们接进池子，并加这条守卫防止再次出现。

   判定口径：id 必须在「skill.js / talent.js 之外」的任意 page/*.js 里
   以字符串字面量出现（即被某个池 / 宠物 / 玩家技能引用）。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const files = ['levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'enemy.js',
  'terrain.js', 'battle.js', 'group-levels.js', 'battle-group.js', 'pet-codex.js'];

const sandbox = { Math: Object.create(Math), JSON, console };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
files.forEach(f => vm.runInContext(load(f), sandbox));

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

/* 汇总除自身定义文件外的全部源码 */
function outside(defFile) {
  return fs.readdirSync(path.join(__dirname, '..', 'page'))
    .filter(f => f.endsWith('.js') && f !== defFile)
    .map(f => load(f)).join('\n');
}
const srcOutsideSkill = outside('skill.js');
const srcOutsideTalent = outside('talent.js');

const skillIds = Object.keys(sandbox.SKILLS || {});
const talentIds = Object.keys(sandbox.TALENTS || {});
assert('SKILLS / TALENTS 都能取到', skillIds.length > 0 && talentIds.length > 0,
  skillIds.length + ' / ' + talentIds.length);

const deadSkills = skillIds.filter(id => srcOutsideSkill.indexOf("'" + id + "'") < 0);
const deadTalents = talentIds.filter(id => srcOutsideTalent.indexOf("'" + id + "'") < 0);

assert('没有不可达的技能（' + skillIds.length + ' 个全部在池里）', deadSkills.length === 0,
  deadSkills.map(id => id + '(' + ((sandbox.SKILLS[id] || {}).name || id) + ')').join(', '));
assert('没有不可达的天赋（' + talentIds.length + ' 个全部在池里）', deadTalents.length === 0,
  deadTalents.map(id => id + '(' + ((sandbox.TALENTS[id] || {}).name || id) + ')').join(', '));

/* v2.1.15 披露、v2.1.16 修复的 8 个技能必须已可达 */
['surprise', 'stardust', 'taunt', 'drainbuff', 'bulwark', 'cleanse', 'empower', 'clearfog'].forEach(function (id) {
  assert('技能已入池：' + id + '（' + ((sandbox.SKILLS[id] || {}).name || id) + '）',
    srcOutsideSkill.indexOf("'" + id + "'") >= 0);
});
/* v2.1.16 新增入池的 3 个天赋 */
['flutter', 'plain', 'multitarget'].forEach(function (id) {
  assert('天赋已入池：' + id + '（' + ((sandbox.TALENTS[id] || {}).name || id) + '）',
    srcOutsideTalent.indexOf("'" + id + "'") >= 0);
});

/* 池子里的 id 必须真实存在（防拼写错误导致静默失效） */
const pools = {
  SKILLS_HIGH: sandbox.SKILLS_HIGH, SKILLS_LOW: sandbox.SKILLS_LOW,
  TALENTS_EXTRA: sandbox.TALENTS_EXTRA, TALENTS_HIGH: sandbox.TALENTS_HIGH
};
Object.keys(pools).forEach(function (name) {
  const bad = (pools[name] || []).filter(function (id) {
    return !(sandbox.SKILLS[id] || sandbox.TALENTS[id]);
  });
  assert(name + ' 里的 id 全部有效', bad.length === 0, bad.join(','));
});

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

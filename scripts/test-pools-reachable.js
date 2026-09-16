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
const srcOutsideTalent = outside('talent.js');

const skillIds = Object.keys(sandbox.SKILLS || {});
const talentIds = Object.keys(sandbox.TALENTS || {});
assert('SKILLS / TALENTS 都能取到', skillIds.length > 0 && talentIds.length > 0,
  skillIds.length + ' / ' + talentIds.length);

/* v2.1.21：技能可达性改为**按真实技能池判定**。
   原实现是「技能 id 的引号字符串是否出现在 skill.js 之外的源码里」—— 太松，会误判成可达：
     · 'doom' / 'lastword' 命中 ai.js:96 的优先目标逻辑（那是消费点，不是池子）
     · 'heal' 命中 battle-group.js / game-render.js 里的事件类型字符串 "type:'heal'"（纯巧合）
     · 'chargeup' 原本靠 battle-group.js 里一句 `if (skillId === 'chargeup')` 特判才算可达
   现在直接查「敌人技能池 ∪ 宠物专属技能」，余下的必须显式登记在 NOT_YET_PLACED 里 ——
   让「设计已实现但没入池」这件事**可见**，而不是被字符串巧合藏起来。 */
const isEnemyPoolSkill = id =>
  (sandbox.SKILLS_HIGH || []).indexOf(id) > -1 || (sandbox.SKILLS_LOW || []).indexOf(id) > -1;
const PET_SKILL_SRC = load('pet-codex.js');
/* 宠物技能有两种出现形式，都要算：
   ① 自带专属技能：registerSkill({ id:'p_shine', ... })
   ② 复用敌群技能给宠物：图鉴里 skills:['fortify']（注册仍在 skill.js） */
const isPetSkill = id => PET_SKILL_SRC.indexOf("'" + id + "'") > -1;

/* 设计已实现、但当前**不在任何技能池**里的技能（实战永远见不到）。
   这是一份「待设计决定」清单：要不要入池属于平衡决策，不要默默往池子里塞。
   清单变了就同步这里，测试会替你盯着。 */
const NOT_YET_PLACED = ['chargeup', 'doom', 'lastword', 'heal'];

const deadSkills = skillIds.filter(id =>
  !isEnemyPoolSkill(id) && !isPetSkill(id) && NOT_YET_PLACED.indexOf(id) === -1);
const deadTalents = talentIds.filter(id => srcOutsideTalent.indexOf("'" + id + "'") < 0);

assert('没有「既没入池也没登记」的技能（' + skillIds.length + ' 个）', deadSkills.length === 0,
  deadSkills.map(id => id + '(' + ((sandbox.SKILLS[id] || {}).name || id) + ')').join(', '));
assert('没有不可达的天赋（' + talentIds.length + ' 个全部在池里）', deadTalents.length === 0,
  deadTalents.map(id => id + '(' + ((sandbox.TALENTS[id] || {}).name || id) + ')').join(', '));

/* 未入池清单必须与预期完全一致（新增/减少都会在这里报出来） */
const actualNotPlaced = skillIds.filter(id => !isEnemyPoolSkill(id) && !isPetSkill(id)).sort();
assert('未入池技能清单 = ' + NOT_YET_PLACED.slice().sort().join('/'),
  actualNotPlaced.join(',') === NOT_YET_PLACED.slice().sort().join(','),
  '实际: ' + actualNotPlaced.join(','));

/* v2.1.15 披露、v2.1.16 修复的 8 个技能必须已真正入池 */
['surprise', 'stardust', 'taunt', 'drainbuff', 'bulwark', 'cleanse', 'empower', 'clearfog'].forEach(function (id) {
  assert('技能已入池：' + id + '（' + ((sandbox.SKILLS[id] || {}).name || id) + '）',
    isEnemyPoolSkill(id));
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

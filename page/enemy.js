/* ============================================
   MyHealth — Enemy Formation (M2b-1)
   敌人编成：createEnemyUnit 组合 天赋+技能+属性。
   难度阶梯：杂兵0/0 → 精英1/1 → 2/1 → 2/2 → Boss(1-4天赋+词条)。
   依赖 unit.js / talent.js / skill.js（skill 后续）。
   ============================================ */

/* 难度阶梯配置：{tier, talentMin, talentMax, skillMin, skillMax} */
var ENEMY_TIERS = {
  minion:  { talent: [0, 0], skill: [0, 0] },     // 杂兵：纯属性
  elite1:  { talent: [1, 1], skill: [1, 1] },     // 1天赋+1技能
  elite2:  { talent: [2, 2], skill: [1, 1] },     // 2天赋+1技能
  elite3:  { talent: [2, 2], skill: [2, 2] },     // 2天赋+2技能
  boss:    { talent: [1, 4], skill: [2, 3] }      // Boss：1-4天赋 + 额外词条
};

/* createEnemyUnit({tier, base:{atk,def,hp,spd,soulAtk?,soulDef?}, name?, talents?, skills?})
   - 不传 talents/skills 时按 tier 从注册表随机抽取
   - 返回带 _talents/_tier 的 Unit */
function createEnemyUnit(opts) {
  opts = opts || {};
  var tier = opts.tier || 'elite1';
  var cfg = ENEMY_TIERS[tier] || ENEMY_TIERS.elite1;

  // 天赋选择（显式传入优先，否则按 tier 随机）
  var talentIds;
  if (opts.talents) talentIds = opts.talents.slice();
  else {
    var tCount = cfg.talent[0] + Math.floor(Math.random() * (cfg.talent[1] - cfg.talent[0] + 1));
    talentIds = pickRandomTalents(tCount);
  }

  // 技能选择（占位，M2b-2 skill.js 后接入）
  var skillIds;
  if (opts.skills) skillIds = opts.skills.slice();
  else {
    var sCount = cfg.skill[0] + Math.floor(Math.random() * (cfg.skill[1] - cfg.skill[0] + 1));
    skillIds = pickRandomSkills(sCount);
  }

  // 构建 Unit
  var unit = createUnit({
    id: opts.id || ('enemy-' + Math.floor(Math.random() * 1e6)),
    side: 'enemy',
    name: opts.name || '敌人',
    level: opts.level || 1,
    base: opts.base || { hp: 100, atk: 10, def: 5, spd: 0 },
    skills: skillIds,
    tags: ['enemy', tier]
  });
  unit._tier = tier;

  // 挂天赋（含静态属性修正）
  attachTalents(unit, talentIds);

  // 应用天赋静态修正到 base（强健等 statMods）
  for (var k in (unit._talentMods || {})) {
    unit.base[k] = (unit.base[k] || 0) + unit._talentMods[k];
    if (k === 'hp') unit.hp = unit.base[k];
  }

  return unit;
}

/* 从注册表随机抽 N 个不重复天赋 */
function pickRandomTalents(n) {
  var ids = Object.keys(TALENTS);
  var picked = [];
  var pool = ids.slice();
  for (var i = 0; i < n && pool.length; i++) {
    var k = Math.floor(Math.random() * pool.length);
    picked.push(pool[k]);
    pool.splice(k, 1);
  }
  return picked;
}

/* 从技能注册表随机抽 N 个（M2b-2 实现 SKILLS 后生效；当前占位返回空） */
function pickRandomSkills(n) {
  if (typeof SKILLS === 'undefined') return [];
  var ids = Object.keys(SKILLS);
  var picked = [];
  var pool = ids.slice();
  for (var i = 0; i < n && pool.length; i++) {
    var k = Math.floor(Math.random() * pool.length);
    picked.push(pool[k]);
    pool.splice(k, 1);
  }
  return picked;
}

/* 便捷查询 */
function enemyTalentCount(u) { return (u._talents || []).length; }
function enemySkillCount(u) { return (u.skills || []).length; }

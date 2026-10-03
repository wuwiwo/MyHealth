/* ============================================
   MyHealth — Enemy Formation (M2b-1)
   敌人编成：createEnemyUnit 组合 天赋+技能+属性。
   难度阶梯：杂兵0/0 → 精英1/1 → 2/1 → 2/2 → Boss(1-4天赋+词条)。
   v2.2.16（§5.4E）：敌群关卡的天赋已由 group-levels.js **固化进关卡配置**并显式传入；
   本文件的兜底抽取（`talents` 缺省时）仍保留，但同样遵守「**Boss** 不抽 lazy / slowstart」
   （v2.3.0 作者裁决：精英 / 普通怪恢复可抽这两条负面特性，排除面只留 Boss）。
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

/* createEnemyUnit({tier, base:{atk,def,hp,spd,soulAtk?,soulDef?}, name?, talents?, skills?, affixes?, rng?})
   - 不传 talents/skills 时按 tier 从注册表随机抽取
   - 不传 affixes 时按 tier 兜底自动装配（Boss/精英）；传了就用传入的（**不会被清空**）
   - rng：可选，本函数所有随机都走它（缺省 = battleRnd()，即本场战斗 rng）
   - 返回带 _talents/_affixes/_tier 的 Unit */
function createEnemyUnit(opts) {
  opts = opts || {};
  var tier = opts.tier || 'elite1';
  var cfg = ENEMY_TIERS[tier] || ENEMY_TIERS.elite1;
  /* v2.4.8（§8.5 第 14 条修复的一部分）：**本函数内所有随机走同一个 rng**。
     修前：天赋/技能/id 走 battleRnd()（本场种子），而兜底的「随机额外词条」走 Math.random
     （**不在战斗种子体系内**）→ 同种子两次建场可能拿到不同词条，破坏「战斗可复现」。
     现在：显式 `opts.rng` 优先（建场方可以直接给一个种子 rng），否则 battleRnd()。
     ⚠️ 真实战斗路径（game-render.js）现在**显式传 affixes**（group-levels.js 的固化词条，
        唯一权威来源），所以那条路径连一次掷骰都不需要；`rng` 只服务兜底装配路径。 */
  var rng = (typeof opts.rng === 'function') ? opts.rng
    : ((typeof battleRnd === 'function') ? battleRnd : Math.random);

  // 天赋选择（显式传入优先，否则按 tier 随机）
  var talentIds;
  if (opts.talents) talentIds = opts.talents.slice();
  else {
    var tCount = cfg.talent[0] + Math.floor(rng() * (cfg.talent[1] - cfg.talent[0] + 1));
    talentIds = pickRandomTalents(tCount, tier, rng);
  }

  // 技能选择（占位，M2b-2 skill.js 后接入）
  var skillIds;
  if (opts.skills) skillIds = opts.skills.slice();
  else {
    var sCount = cfg.skill[0] + Math.floor(rng() * (cfg.skill[1] - cfg.skill[0] + 1));
    skillIds = pickRandomSkills(sCount, rng);
  }

  // 构建 Unit
  var unit = createUnit({
    id: opts.id || ('enemy-' + Math.floor(rng() * 1e6)),
    side: 'enemy',
    name: opts.name || '敌人',
    level: opts.level || 1,
    base: opts.base || { hp: 100, atk: 10, def: 5, spd: 0 },
    skills: skillIds,
    tags: ['enemy', tier]
  });
  unit._tier = tier;
  /* v2.2.16：敌群 BOSS/精英的「伤害减免」条**
     v2.4.8（§8.5 第 14 条，作者裁定「修敌人词条死接线」）：**词条只装配一次**。
       修前这里有两步互相打架：
         ① `if (!(opts.affixes && opts.affixes.length) ...) { 自动装配 cut_boss/cut_elite + 1 条随机 }`
         ② 紧接着 `var affixIds = opts.affixes || []; attachAffixes(unit, affixIds)`
       —— 第 ② 步把第 ① 步的成果**覆盖清空**；而真实建场（game-render.js）从不传 affixes，
       于是线上 Boss/精英**一件词条都没有**（实测 `createEnemyUnit({tier:'boss'})._affixes === []`）：
       伤害减免·大/中、抗扩散、抗技法、战意高涨、铁壁、终末宣告、疾影全部不生效。
     现在的口径：
       · 显式传入 `opts.affixes`（真实战斗走这条：`group-levels.js` 的固化词条是**唯一权威来源**）
         → 原样装配，**不再被任何东西清空**；
       · 未传 → 按 tier 兜底自动装配（仅 **Boss / 精英档**：固定减伤 + 1 条随机额外词条）。
         ⚠️ 兜底装配的 tier 面与设计一致（`GROUP_AFFIX_FIXED = {boss, elite}`）：
            杂兵不装配词条。修前这段兜底虽然写了，但结果总被清空，
            所以「杂兵也给 cut_elite」从来不是可观测行为，本版按设计收窄，不制造新的强度。
         ⚠️ 这条随机额外词条现在走上面的 `rng`（修前是 `Math.random`）。 */
  var affixIds;
  if (opts.affixes) affixIds = opts.affixes.slice();
  else {
    affixIds = [];
    var eliteLike = (tier === 'boss') || (String(tier).indexOf('elite') === 0);
    if (eliteLike) {
      var fixed = fixedAffixForTier(tier);
      if (fixed) affixIds.push(fixed);
      /* 额外词条池：优先用 group-levels.js 的 pickExtraAffixes（与固化池同一份清单），
         沙箱只加载到 affix.js 时用 AFFIX_EXTRA；两者都没有就不加（不造假数据）。 */
      if (typeof pickExtraAffixes === 'function') pickExtraAffixes(affixIds, 1, rng);
      else {
        var extraPool = (typeof AFFIX_EXTRA !== 'undefined') ? AFFIX_EXTRA
          : ((typeof GROUP_AFFIX_EXTRA !== 'undefined') ? GROUP_AFFIX_EXTRA : []);
        if (extraPool.length) affixIds.push(extraPool[Math.floor(rng() * extraPool.length)]);
      }
    }
  }

  // 挂天赋（含静态属性修正）
  /* v2.3.0（作者裁决）：「带负面特性的单位，属性数值更高」——**兜底路径**的补偿。
     ⚠️ 只在「未显式传 talents」时补：走固化配置的敌群槽位已在 `group-levels.js` 的 genEnemyCfg 里
        补过，这里再补一次会变成双倍。常量与口径来源同 group-levels.js
        （`weakTalentStatMul` / `WEAK_TALENT_STAT_BONUS`，报告里标为**待作者确认的首版取值**）。 */
  if (!opts.talents && typeof weakTalentStatMul === 'function') {
    var wmul = weakTalentStatMul(talentIds);
    if (wmul !== 1) {
      ['atk', 'def', 'hp', 'soulAtk', 'soulDef'].forEach(function (k) {
        if (unit.base[k] == null) return;
        unit.base[k] = Math.max(1, Math.floor(unit.base[k] * wmul));
      });
      unit.hp = unit.base.hp;
    }
  }
  attachTalents(unit, talentIds);
  /* v2.1.25：词条与天赋分开装配 —— 词条是 Boss/精英的额外维度（见 affix.js）
     v2.4.8：装配点**只有这一处**（上面算好的 affixIds），故不可能再被清空。 */
  if (typeof attachAffixes === 'function') attachAffixes(unit, affixIds);
  else unit._affixes = affixIds.slice();   // 未加载 affix.js（部分测试）时也不炸
  unit._affixIds = affixIds.slice();

  // 应用天赋静态修正到 base（强健等 statMods）
  for (var k in (unit._talentMods || {})) {
    unit.base[k] = (unit.base[k] || 0) + unit._talentMods[k];
    if (k === 'hp') unit.hp = unit.base[k];
  }

  return unit;
}

/* 兜底装配用的「固定减伤」词条 id —— 从**已加载的注册表**里取，不在本文件另写一份清单：
   affix.js（AFFIX_BOSS_FIXED / AFFIX_ELITE_FIXED）→ group-levels.js（GROUP_AFFIX_FIXED）→
   字面量兜底（值相同，仅在两个注册表都没加载的最小沙箱里才会走到）。
   为什么必须做 typeof 判断：有 6 个既有套件只加载到 group-levels.js / enemy.js，不加载 affix.js，
   直接引用未声明的标识符会 ReferenceError（实测 test-ai / test-pet-store 等曾因此整批炸掉）。 */
function fixedAffixForTier(tier) {
  var key = (tier === 'boss') ? 'boss' : 'elite';
  if (typeof AFFIX_BOSS_FIXED !== 'undefined' && typeof AFFIX_ELITE_FIXED !== 'undefined') {
    return (tier === 'boss') ? AFFIX_BOSS_FIXED : AFFIX_ELITE_FIXED;
  }
  if (typeof GROUP_AFFIX_FIXED !== 'undefined' && GROUP_AFFIX_FIXED && GROUP_AFFIX_FIXED[key]) return GROUP_AFFIX_FIXED[key];
  return (tier === 'boss') ? 'cut_boss' : 'cut_elite';
}

/* 从注册表随机抽 N 个不重复天赋（**兜底路径**）
   v2.2.16（§5.4E 天赋固化）：
     · 敌群关卡（`group-levels.js`）现在**固化**了天赋，走的是 `createEnemyUnit({talents})` 的显式分支，
       **不会**进这里 —— 线上的三个建场入口（`game-render.js` / `pet-ui.js` / `debug.js`）全都传
       `cfg.talents`，所以本函数目前只被测试/工具与「未来的新入口」用到。
     · 兜底抽取同样要遵守「**Boss** 不抽自我削弱天赋」：靠 `tier` 剔除 talent.js 里标了 `weak: true`
       的天赋（现为 lazy / slowstart）。此前无条件全池抽，是 §5.0 实测「g12-10 的 Boss 抽到
       magicshield+slowstart+lazy」的直接原因。
   v2.3.0（作者裁决「保留，给精英怪/普通怪」）：**排除面收到 Boss 一档** ——
     精英 / 普通怪恢复可抽 lazy / slowstart（此前 `eliteLike` 连精英一起挡掉了，
     与作者裁决相反；同时 group-levels.js 侧另有 `WEAK_TALENT_CHANCE` 的注入，两处口径一致）。
   @param n    抽取个数
   @param tier 可选。省略时 = 旧行为（全池，仅排除宠物专属）；'boss' 会额外排除 weak
   @param rng  可选。v2.4.8：与 createEnemyUnit 的 rng 口径统一（缺省走 battleRnd） */
function pickRandomTalents(n, tier, rng) {
  var rd = (typeof rng === 'function') ? rng : battleRnd;
  var bossLike = (tier === 'boss');
  // 排除宠物专属天赋（petOnly）——否则敌人会抽到「漆黑之眼」「圣光守护」这类宠物天赋
  var ids = Object.keys(TALENTS).filter(function (id) {
    var t = TALENTS[id];
    if (!t || t.petOnly) return false;
    if (bossLike && t.weak) return false;   // 自我削弱天赋不给 Boss
    return true;
  });
  var picked = [];
  var pool = ids.slice();
  for (var i = 0; i < n && pool.length; i++) {
    var k = Math.floor(rd() * pool.length);
    picked.push(pool[k]);
    pool.splice(k, 1);
  }
  return picked;
}

/* 从技能注册表随机抽 N 个（M2b-2 实现 SKILLS 后生效；当前占位返回空）
   @param rng 可选。v2.4.8：与 createEnemyUnit 的 rng 口径统一（缺省走 battleRnd） */
function pickRandomSkills(n, rng) {
  if (typeof SKILLS === 'undefined') return [];
  var rd = (typeof rng === 'function') ? rng : battleRnd;
  var ids = Object.keys(SKILLS);
  var picked = [];
  var pool = ids.slice();
  for (var i = 0; i < n && pool.length; i++) {
    var k = Math.floor(rd() * pool.length);
    picked.push(pool[k]);
    pool.splice(k, 1);
  }
  return picked;
}

/* 便捷查询 */
function enemyTalentCount(u) { return (u._talents || []).length; }
function enemySkillCount(u) { return (u.skills || []).length; }

/* ============================================
   MyHealth — Enemy Group Levels (M2b 重构)
   6 大关卡 × 10 小关 = 60 关（程序化生成，难度递进）
   - 每大关第 5 小关 = 精英关；第 10 小关 = Boss 关
   - 大关 1-2：敌人无魂攻/魂防，最多 2 只
   - 大关 3-6：敌人最多 4 只（含魂攻/魂防）
   - 属性随大关/小关递增
   纯数据生成。
   ============================================ */

/* 生成参数 */
var GROUP_STAGE_NAMES = {
  1: '试炼·森林', 2: '试炼·山丘', 3: '试炼·洞穴',
  4: '试炼·遗迹', 5: '试炼·深渊', 6: '试炼·王座'
};

/* 敌人名字池 */
var ENEMY_NAMES = {
  minion: ['杂兵·剑','杂兵·盾','杂兵·弓','杂兵·矛','野狼','蝙蝠','史莱姆','骷髅兵'],
  elite: ['精英·突袭者','精英·狂战','精英·毒师','精英·冰法师','精英·火枪手','暗影刺客','重装战士'],
  boss: ['Boss·战争领主','Boss·暗龙','Boss·深渊之主','Boss·火焰王','Boss·冰霜巨人','Boss·混沌魔']
};

/* 生成单个敌人配置 */
function genEnemyCfg(lg, st, slot, isElite, isBoss) {
  // 平衡曲线：g1 弱（新号可过），g6 对中后期玩家有挑战（攻 200-400 玩家可打）
  var lvScale = 1 + (lg - 1) * 0.8 + (st - 1) * 0.16;   // g6-10 Boss: 1+4+1.44=6.44
  var hasSoul = lg >= 3;
  var tier = isBoss ? 'boss' : isElite ? 'elite2' : (st % 3 === 0 ? 'elite1' : 'minion');

  // 属性基础（适中）
  var atk = Math.floor((isBoss ? 40 : isElite ? 26 : 14) * lvScale);
  var def = Math.floor((isBoss ? 28 : isElite ? 18 : 8) * lvScale * 0.85);
  var hp = Math.floor((isBoss ? 600 : isElite ? 320 : 160) * lvScale);
  var spd = 3 + Math.floor(lvScale * 1.8);

  var cfg = {
    name: isBoss ? ENEMY_NAMES.boss[lg % ENEMY_NAMES.boss.length] : (isElite || tier==='elite1' ? ENEMY_NAMES.elite[(lg+st) % ENEMY_NAMES.elite.length] : ENEMY_NAMES.minion[(lg+st+slot) % ENEMY_NAMES.minion.length]),
    tier: tier,
    base: { atk: atk, def: def, hp: hp, spd: Math.min(12, spd) }
  };
  if (hasSoul) {
    cfg.base.soulAtk = Math.floor((isBoss ? 28 : 14) * lvScale);
    cfg.base.soulDef = Math.floor((isBoss ? 18 : 9) * lvScale);
  }
  // 精英/Boss 带天赋
  var talents = [];
  if (isBoss) {
    var bossTalents = ['blade','vigor','bloodthirst','regen','roughskin','vengeance'];
    var n = 2 + (lg % 3);   // 2-4 天赋
    for (var i = 0; i < n && bossTalents.length; i++) {
      var idx = Math.floor(Math.random() * bossTalents.length);
      talents.push(bossTalents[idx]); bossTalents.splice(idx, 1);
    }
  } else if (isElite || tier === 'elite1') {
    var eTalents = ['blade','vigor','bloodthirst','regen','lazy','slowstart'];
    talents.push(eTalents[Math.floor(Math.random() * eTalents.length)]);
    if (isElite && Math.random() < 0.5) talents.push(eTalents[Math.floor(Math.random() * eTalents.length)]);
  }
  if (talents.length) cfg.talents = talents;
  // 技能（精英/Boss 带）
  var skills = [];
  if (isBoss) {
    var pool = ['charge','bite','spikes','blizzard','armorbreak','blackmist'];
    var sn = 2 + Math.floor(Math.random() * 2);   // 2-3 技能
    for (var j = 0; j < sn && pool.length; j++) {
      var si = Math.floor(Math.random() * pool.length);
      skills.push(pool[si]); pool.splice(si, 1);
    }
  } else if (isElite || tier === 'elite1') {
    skills.push(Math.random() < 0.5 ? 'charge' : 'bite');
    if (isElite && Math.random() < 0.5) skills.push('spikes');
  }
  if (skills.length) cfg.skills = skills;
  return cfg;
}

/* 生成一小关的敌人组 */
function genStageEnemies(lg, st) {
  var isElite = (st === 5);
  var isBoss = (st === 10);
  var maxEnemies = lg <= 2 ? 2 : 4;   // 大关 1-2 最多 2，3-6 最多 4
  var enemies = [];

  if (isBoss) {
    // Boss 关：1 Boss + 1-2 护卫
    enemies.push(genEnemyCfg(lg, st, 0, false, true));
    var guards = lg >= 3 ? 2 : 1;   // 稳定：大关3+ 恒 2 护卫
    for (var i = 0; i < guards; i++) enemies.push(genEnemyCfg(lg, st, i+1, true, false));
  } else if (isElite) {
    // 精英关：1 精英 + 1-2 杂兵
    enemies.push(genEnemyCfg(lg, st, 0, true, false));
    var adds = lg >= 3 ? 2 : 1;   // 稳定：大关3+ 恒 2 杂兵
    for (var j = 0; j < adds; j++) enemies.push(genEnemyCfg(lg, st, j+1, false, false));
  } else {
    // 普通关：稳定数量（小关 1-3 单敌，4-9 双敌）
    var count = st <= 3 ? 1 : (lg <= 2 ? 2 : (st === 9 ? 3 : 2));
    count = Math.min(count, maxEnemies);
    for (var k = 0; k < count; k++) enemies.push(genEnemyCfg(lg, st, k, false, false));
  }
  return enemies;
}

/* 生成全部 6 大关 × 10 小关 */
var GROUP_LEVELS = {};
(function () {
  for (var lg = 1; lg <= 6; lg++) {
    var stages = [];
    for (var st = 1; st <= 10; st++) {
      var isElite = st === 5, isBoss = st === 10;
      stages.push({
        id: 'g' + lg + '-' + st,
        name: (isBoss ? '👑 ' : isElite ? '⭐ ' : '') + '第' + st + '关',
        type: isBoss ? 'boss' : isElite ? 'elite' : 'normal',
        enemies: genStageEnemies(lg, st)
      });
    }
    GROUP_LEVELS['g' + lg] = {
      id: 'g' + lg,
      name: GROUP_STAGE_NAMES[lg],
      desc: lg <= 2 ? '基础试炼（最多 2 敌）' : (lg >= 5 ? '高阶试炼（4 敌+魂攻防）' : '进阶试炼（最多 4 敌）'),
      stages: stages
    };
  }
})();

/* 便捷：按小关 id 取配置 */
function getGroupStage(stageId) {
  for (var lg in GROUP_LEVELS) {
    var found = (GROUP_LEVELS[lg].stages || []).find(function (s) { return s.id === stageId; });
    if (found) return found;
  }
  return null;
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.GROUP_LEVELS = GROUP_LEVELS;
  window.getGroupStage = getGroupStage;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GROUP_LEVELS = GROUP_LEVELS;
  globalThis.getGroupStage = getGroupStage;
}

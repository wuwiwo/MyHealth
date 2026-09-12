/* ============================================
   MyHealth — Enemy Group Levels (M2b 重构)
   12 大关卡 × 10 小关 = 120 关（程序化生成，难度递进）
   - 每大关第 5 小关 = 精英关；第 10 小关 = Boss 关
   - 大关 1-2：敌人无魂攻/魂防，最多 2 只
   - 大关 3-12：敌人最多 3 只（含魂攻/魂防）
   - 属性随大关/小关递增
   纯数据生成。
   ============================================ */

/* 生成参数 */
var GROUP_STAGE_NAMES = {
  1: '试炼·森林', 2: '试炼·山丘', 3: '试炼·洞穴',
  4: '试炼·遗迹', 5: '试炼·深渊', 6: '试炼·王座',
  7: '试炼·天穹', 8: '试炼·冥府', 9: '试炼·神域',
  10: '试炼·混沌', 11: '试炼·虚无', 12: '试炼·终焉'
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
  var maxEnemies = lg <= 2 ? 2 : 3;   // 大关 1-2 最多 2，3-9 最多 3（实际生成：Boss/精英 3、普通关至多 3）
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

/* 生成全部 12 大关 × 10 小关（v2.1.7：由 9 大关扩展到 12） */
var GROUP_LEVELS = {};
(function () {
  for (var lg = 1; lg <= 12; lg++) {
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
      desc: lg <= 2 ? '基础试炼（最多 2 敌）'
        : lg >= 10 ? '终极试炼（最多 3 敌+魂攻防）'
        : lg >= 5 ? '高阶试炼（最多 3 敌+魂攻防）'
        : '进阶试炼（最多 3 敌+魂攻防）',
      stages: stages
    };
  }
})();

/* ============================================
   v2.1.9 难度锚定（difficulty anchoring）

   问题：上面那条写死的绝对曲线（atk 顶到 449）在玩家属性面前必然越顶 ——
   玩家属性由「月训练容量 + 炼魂」驱动、无上界（炼魂满级即 atk +3770 / def +1798 / hp +6920），
   而伤害是固定减法 `max(1, atk - floor(def/2))`：玩家 def ≥ 898 后，
   全部 120 关敌人每击恒定 1 点，战斗数学上已经结束，只剩播动画。

   改为：以**参战我方阵容**为标尺反推敌人属性，让战斗张力恒定。
   玩家变强的体现从「数值碾压」转为「能推到第几关」。
   固定曲线保留为下限（floor），所以后期关卡的数字依然更大。

   推导（自洽，注意回合数必须是「实际预期回合数」而非目标回合数）：
     ① 敌防 def = 固定曲线 × defScale，defScale 使人均防御 ≈ 我方人均攻击 × defRatio
        → 给我方伤害打折，又不至于打不动；固定曲线保留为下限
     ② 我方每回合有效输出 allyDps = Σ我方攻击 − n × 人均敌防/2
     ③ 敌血总量 = max(固定总量, allyDps × hpP)；据此得 hpScale，再得
        实际预期回合数 R = 敌血总量 / allyDps
        ⚠️ 早期用 hpP 当 R 会算错：弱玩家打固定血量的 Boss 可能要 30 回合，
           若按 1 回合配攻击力，敌人总输出会超标 30 倍 —— 这正是第一版踩的坑
     ④ 敌攻 = 固定曲线 × atkScale，atkScale 使
        R 回合 × (Σ敌攻 − n × 我方人均防御/2) = 我方总血 × atkP
   纯函数，无 DOM / store 依赖。
   ============================================ */
var GROUP_ANCHOR = {
  defRatio: 0.30,   // 敌人防御 = 我方人均攻击 × 30%
  atkStart: 0.05,   // 首关：全场我方掉血 5%
  atkEnd: 0.55,     // 末关：全场我方掉血 55%（实测落点 ~75%，余量留给技能/暴击/状态方差）
  hpStart: 0.50,    // 首关：敌人撑 0.5 回合
  hpEnd: 3.00,      // 末关普通关：撑 3 回合（Boss/精英另有倍率）
  maxRounds: 10,    // 弱玩家打固定血量 Boss 的回合上限，避免 30~90 回合的拉锯战
  skillAllowance: 1.80,  // 技能余量：实测敌人实际输出 ≈ 普攻模型的 1.75 倍
                         // （冲撞 200%、暴风雪 AoE 打全体+冰冻控场、暴击、破甲），
                         // 不打折会把末关做成必死 —— 第一版就栽在这
  bossMul: 1.50, eliteMul: 1.20,   // 血量倍率
  bossAtkMul: 1.15, eliteAtkMul: 1.08,
  soulRatio: 0.50,  // 魂攻防 = 对应物攻防 × 此比例
  atkScaleMin: 0.25 // 攻击缩放下限，避免早期关卡敌人攻击退化到 0
};

/* 关卡进度 t ∈ [0,1]：第一大关第 1 关 → 0，最后一大关第 10 关 → 1
   由 GROUP_LEVELS 派生，不硬编码大关数（扩关即自动跟随） */
function groupAnchorT(groupId, stageId) {
  var keys = Object.keys(GROUP_LEVELS || {});
  if (!keys.length) return 0;
  var gi = Math.max(0, keys.indexOf(groupId));
  var per = ((GROUP_LEVELS[keys[0]] || {}).stages || []).length || 10;
  var st = parseInt(String(stageId || '').split('-')[1], 10) || 1;
  var total = keys.length * per;
  return Math.max(0, Math.min(1, (gi * per + (st - 1)) / Math.max(1, total - 1)));
}

/* 按我方阵容反推这一关的敌人属性。返回新的配置数组，不改原对象。
   @param {string} groupId  如 'g6'
   @param {object} stage    GROUP_LEVELS[groupId].stages[i]
   @param {Unit[]} allies   已建好的我方单位（玩家 + 宠物）
*/
function anchorStageEnemies(groupId, stage, allies) {
  var list = (stage && stage.enemies) || [];
  if (!list.length) return list;
  var units = (allies || []).filter(function (u) { return u && u.base; });
  if (!units.length) return list;

  var hpSum = 0, atkSum = 0, defSum = 0;
  units.forEach(function (u) {
    hpSum += Math.max(0, u.base.hp || 0);
    atkSum += Math.max(0, u.base.atk || 0);
    defSum += Math.max(0, u.base.def || 0);
  });
  if (hpSum <= 0 || atkSum <= 0) return list;

  var t = groupAnchorT(groupId, stage.id);
  var n = list.length;
  var avgAtk = atkSum / units.length;
  var avgDef = defSum / units.length;

  var atkP = GROUP_ANCHOR.atkStart + (GROUP_ANCHOR.atkEnd - GROUP_ANCHOR.atkStart) * t;
  var hpP = Math.max(0.4, GROUP_ANCHOR.hpStart + (GROUP_ANCHOR.hpEnd - GROUP_ANCHOR.hpStart) * t);
  if (stage.type === 'boss') { atkP *= GROUP_ANCHOR.bossAtkMul; hpP *= GROUP_ANCHOR.bossMul; }
  else if (stage.type === 'elite') { atkP *= GROUP_ANCHOR.eliteAtkMul; hpP *= GROUP_ANCHOR.eliteMul; }

  /* 固定曲线的合计值（保持敌人之间的相对差距：Boss > 精英 > 杂兵） */
  var fAtk = 0, fDef = 0, fHp = 0;
  list.forEach(function (ec) {
    var b = ec.base || {};
    fAtk += Math.max(0, b.atk || 0); fDef += Math.max(0, b.def || 0); fHp += Math.max(0, b.hp || 0);
  });
  fAtk = Math.max(1, fAtk); fDef = Math.max(1, fDef); fHp = Math.max(1, fHp);
  var fDefAvg = fDef / n;

  /* ① 防御：以固定曲线为下限向上缩放 */
  var defScale = Math.max(1, (avgAtk * GROUP_ANCHOR.defRatio) / fDefAvg);
  var eDefAvg = fDefAvg * defScale;
  /* ② 我方每回合有效输出（已扣减防） */
  var allyDps = Math.max(1, atkSum - Math.floor(eDefAvg / 2) * units.length);
  /* ③ 血量：目标 hpP 回合；不低于固定曲线（后期数字更大），
        但上限 maxRounds 回合 —— 否则弱玩家打磨固定血量的 Boss 要几十回合 */
  var hpFloor = Math.min(fHp, allyDps * GROUP_ANCHOR.maxRounds);
  var hpTotal = Math.max(hpFloor, allyDps * hpP);
  var hpScale = hpTotal / fHp;
  var R = Math.max(0.5, hpTotal / allyDps);
  /* ④ 攻击：R 回合内让我方掉血 atkP。
        除以 skillAllowance —— 技能/暴击/状态会让实际输出远超普攻模型 */
  var wantPerRound = hpSum * atkP / (R * GROUP_ANCHOR.skillAllowance);
  var atkScale = Math.max(GROUP_ANCHOR.atkScaleMin, (wantPerRound + n * avgDef / 2) / fAtk);

  return list.map(function (ec) {
    var b = ec.base || {};
    var out = { name: ec.name, tier: ec.tier, talents: ec.talents, skills: ec.skills, base: {} };
    ['atk', 'def', 'hp', 'spd', 'soulAtk', 'soulDef'].forEach(function (k) {
      if (b[k] != null) out.base[k] = b[k];
    });
    out.base.def = Math.max(1, Math.floor((b.def || 0) * defScale));
    out.base.hp = Math.max(1, Math.floor((b.hp || 0) * hpScale));
    out.base.atk = Math.max(1, Math.floor((b.atk || 0) * atkScale));
    if (b.soulAtk != null) out.base.soulAtk = Math.max(1, Math.floor(out.base.atk * GROUP_ANCHOR.soulRatio));
    if (b.soulDef != null) out.base.soulDef = Math.max(1, Math.floor(out.base.def * GROUP_ANCHOR.soulRatio));
    return out;
  });
}

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
  window.GROUP_ANCHOR = GROUP_ANCHOR;
  window.groupAnchorT = groupAnchorT;
  window.anchorStageEnemies = anchorStageEnemies;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GROUP_LEVELS = GROUP_LEVELS;
  globalThis.getGroupStage = getGroupStage;
  globalThis.GROUP_ANCHOR = GROUP_ANCHOR;
  globalThis.groupAnchorT = groupAnchorT;
  globalThis.anchorStageEnemies = anchorStageEnemies;
}

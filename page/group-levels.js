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
  10: '试炼·混沌', 11: '试炼·虚无', 12: '试炼·终焉',
  13: '试炼·星陨', 14: '试炼·洪荒', 15: '试炼·永夜'
};

/* ============ g13+ 超限试炼：必须继续锻炼才能挑战 ============
   基础曲线是线性的（每大关 lvScale +0.9）。照此推算，实测号
   （攻 2036 / 防 678 / 血 14714，继承 60% 后 1221/406/8828）能推到 g13 左右 ——
   达不到「后续关卡当前属性打不过」的目标。
   所以对 g13+ 叠加超线性加压：tailMul = TAIL_POW^(lg − 12)。
   ⚠️ 这是 [PLACEHOLDER]：按「每档需再练约 +40% 属性」的假设标定，
      验证路径：balance-sim.js 扫玩家属性倍数，看 g13/14/15 的解锁门槛是否落在预期月份。
      改 TAIL_POW 即可整体缩放门槛，不需要动曲线主体。 */
var GROUP_TAIL_FROM = 13;
var GROUP_TAIL_POW = 1.45;
function groupTailMul(lg) {
  return lg < GROUP_TAIL_FROM ? 1 : Math.pow(GROUP_TAIL_POW, lg - GROUP_TAIL_FROM + 1);
}

/* 敌人名字池 */
var ENEMY_NAMES = {
  minion: ['杂兵·剑','杂兵·盾','杂兵·弓','杂兵·矛','野狼','蝙蝠','史莱姆','骷髅兵'],
  elite: ['精英·突袭者','精英·狂战','精英·毒师','精英·冰法师','精英·火枪手','暗影刺客','重装战士'],
  boss: ['Boss·战争领主','Boss·暗龙','Boss·深渊之主','Boss·火焰王','Boss·冰霜巨人','Boss·混沌魔']
};

/* ============ v2.1.10：敌群专属属性空间 ============
   玩家真实属性由「月容量 + 旬累积奖励×3 + 挑战血 + 炼魂」驱动、无上界，
   直接进敌群会把敌人压成 1 点伤害。改为：敌群战斗里玩家只继承一定比例。
   宠物同步放大（否则基础 atk 15~20 在玩家面前等于摆设）。 */
var GROUP_INHERIT = 0.50;                                  // 玩家在敌群中继承的属性比例
var PET_GROUP_SCALE = { R: 12, SR: 16, SSR: 20, UR: 26 };   // 宠物按稀有度放大到同量级
var PET_GROUP_REFINE = 1.5;                                // 宠物炼化加成在敌群中的额外权重

/* 按真实属性算出敌群战斗属性（玩家） */
function inheritGroupStats(stats, ratio) {
  var r = (ratio == null ? GROUP_INHERIT : ratio);
  var out = {
    atk: Math.max(1, Math.floor((stats.atk || 0) * r)),
    def: Math.max(1, Math.floor((stats.def || 0) * r)),
    hp: Math.max(1, Math.floor((stats.hp || 0) * r)),
    soulAtk: Math.floor((stats.soulAtk || 0) * r),
    soulDef: Math.floor((stats.soulDef || 0) * r)
  };
  // 魂防下限 = 自身防御的一半。炼魂普遍只堆魂攻不堆魂防（实测玩家魂攻 385 / 魂防 69），
  // 没有下限的话魂伤会把只堆魂攻的号打穿。
  out.soulDef = Math.max(out.soulDef, Math.floor(out.def * 0.5));
  return out;
}
/* 宠物放大到与玩家同量级（就地改 base，仅在敌群参战时调用） */
function boostPetForGroup(unit) {
  if (!unit || !unit.base) return unit;
  var tag = ((unit.tags || [])[1] || 'R');
  var k = PET_GROUP_SCALE[tag] || PET_GROUP_SCALE.R;
  // 只放大「非宝珠」部分：宝珠加成（_orbBonus）原样保留，否则会被 ×12~26 放大成天文数字
  var ob = unit._orbBonus || {};
  ['atk', 'def', 'hp', 'soulAtk', 'soulDef'].forEach(function (s) {
    if (unit.base[s] == null) return;
    var orbPart = ob[s] || 0;
    unit.base[s] = Math.max(1, Math.floor((unit.base[s] - orbPart) * k) + orbPart);
  });
  // 宠物同样给魂防下限，否则被敌人魂攻打全额
  unit.base.soulDef = Math.max(unit.base.soulDef || 0, Math.floor((unit.base.def || 0) * 0.5));
  unit.hp = unit.base.hp;
  return unit;
}

/* ============ 确定性随机 ============
   此前 genEnemyCfg 用 Math.random()，每次页面加载把 120 关的敌人天赋/技能全部重摇，
   同一关不同 session 难度天差地别（实测 g7-10 胜率 40% 而 g12-10 100%）。
   改为按 (大关, 小关, 槽位) 播种，同一关永远是同一套配置。 */
function groupHash(lg, st, slot) {
  var h = (lg * 7919 + st * 104729 + (slot || 0) * 31) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}
function groupRng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============ 天赋 / 技能分级池 ============
   Boss 与精英只从「高级」池抽取：lazy（懒惰）/ slowstart（慢启动）是自我削弱，
   bite（咬击）是最基础的技能 —— 抽到这些会让 Boss 名不副实。 */
var TALENTS_HIGH = ['blade', 'vigor', 'bloodthirst', 'regen', 'roughskin', 'vengeance', 'magicmirror', 'magicshield', 'intimidate'];
/* v2.1.13：Boss / 精英的「其他词条」池（伤害减免之外的可选词条） */
var TALENTS_EXTRA = ['extra_act', 'aoe_guard', 'skill_guard', 'grow_atk', 'grow_def', 'doom_call',
  // v2.1.16：这 3 个天赋代码完整、引擎可达，但此前不在任何池里 → 实战永远见不到
  'flutter',     // 振翅：每回合按初始速度提速
  'plain',       // 朴实
  'multitarget'  // 多目标：普攻额外打 1 个目标、伤害降低
];
var GROUP_EXTRA_COUNT = { boss: 2, elite: 1 };   // 其他词条个数上限（+ 固定减伤 = 3 / 2）
function pickExtraTalents(arr, n, rng) {
  var pool = TALENTS_EXTRA.slice();
  for (var i = 0; i < n && pool.length; i++) {
    var idx = Math.floor(rng() * pool.length);
    arr.push(pool[idx]); pool.splice(idx, 1);
  }
}
/* 场地：每个大关一个主题场地，g3 起生效（terrain.js 在本文件之前加载） */
var GROUP_TERRAIN_FROM = 3;
function groupTerrainFor(lg) {
  if (lg < GROUP_TERRAIN_FROM) return null;
  if (typeof getTerrain !== 'function' || typeof TERRAINS === 'undefined') return null;
  var ids = Object.keys(TERRAINS || {});
  if (!ids.length) return null;
  var r = groupRng(groupHash(lg, 0, 7) + 909)();
  return getTerrain(ids[Math.floor(r * ids.length)]);
}
var TALENTS_LOW = ['lazy', 'slowstart'];
var SKILLS_HIGH = ['charge', 'spikes', 'blizzard', 'armorbreak', 'blackmist', 'possess', 'deepfreeze',
  // v2.1.16：这 7 个技能代码完整但此前不在任何池里 → 实战永远见不到
  'taunt', 'empower', 'bulwark', 'cleanse', 'drainbuff', 'stardust', 'clearfog'
];
var SKILLS_LOW = ['bite', 'snowball', 'shrink', 'yawn', 'drench', 'surprise'];   // v2.1.16 击掌奇袭入池

/* 生成单个敌人配置 */
function genEnemyCfg(lg, st, slot, isElite, isBoss) {
  // v2.1.10：玩家在敌群里只继承 25%，固定曲线相应上调斜率（0.8→1.0 / 0.16→0.20），
  //          让后续关卡持续加压 —— 练得更多才能推更高关
  var lvScale = (1 + (lg - 1) * 0.9 + (st - 1) * 0.18) * groupTailMul(lg);
  var hasSoul = lg >= 3;
  var tier = isBoss ? 'boss' : isElite ? 'elite2' : (st % 3 === 0 ? 'elite1' : 'minion');
  // 确定性随机：同一关永远生成同一套配置（不再每次刷新重摇）
  var rng = groupRng(groupHash(lg, st, slot) + (isBoss ? 101 : isElite ? 202 : 303));

  // 属性基础（适中）
  var atk = Math.floor((isBoss ? 40 : isElite ? 26 : 14) * lvScale);
  var def = Math.floor((isBoss ? 24 : isElite ? 15 : 7) * lvScale * 0.85);
  var hp = Math.floor((isBoss ? 270 : isElite ? 180 : 120) * lvScale);   // v2.1.13：Boss 减伤40%/精英25% 等效血量 ×1.67/×1.33，血量反向补偿，避免已通关的关卡变成打不过
  var spd = 3 + Math.floor(lvScale * 1.8);

  var cfg = {
    name: isBoss ? ENEMY_NAMES.boss[lg % ENEMY_NAMES.boss.length] : (isElite || tier==='elite1' ? ENEMY_NAMES.elite[(lg+st) % ENEMY_NAMES.elite.length] : ENEMY_NAMES.minion[(lg+st+slot) % ENEMY_NAMES.minion.length]),
    tier: tier,
    base: { atk: atk, def: def, hp: hp, spd: Math.min(12, spd) }
  };
  if (hasSoul) {
    cfg.base.soulAtk = Math.floor((isBoss ? 16 : 8) * lvScale);
    cfg.base.soulDef = Math.floor((isBoss ? 12 : 6) * lvScale);
  }
  // 天赋：Boss / 精英一律从「高级」池抽（不含 lazy / slowstart 这类自我削弱）
  // v2.1.13：Boss = 伤害减免40% + 最多 2 个其他词条；精英 = 25% + 最多 1 个
  var talents = [];
  if (isBoss) {
    talents.push('cut_boss');
    pickExtraTalents(talents, GROUP_EXTRA_COUNT.boss, rng);
  } else if (isElite || tier === 'elite1') {
    talents.push('cut_elite');
    pickExtraTalents(talents, GROUP_EXTRA_COUNT.elite, rng);
  }
  if (talents.length) cfg.talents = talents;
  // 技能：Boss / 精英从「高级」池抽；杂兵才可能拿低级技能
  var skills = [];
  var sp = (isBoss || isElite || tier === 'elite1' ? SKILLS_HIGH : SKILLS_LOW).slice();
  if (isBoss) {
    var sn = 2;   // 固定 2 个高级技能（此前 2~3 个让关卡难度波动过大）
    for (var j = 0; j < sn && sp.length; j++) {
      var si = Math.floor(rng() * sp.length);
      skills.push(sp[si]); sp.splice(si, 1);
    }
  } else if (isElite || tier === 'elite1') {
    skills.push(sp[Math.floor(rng() * sp.length)]);
    if (isElite && rng() < 0.5) skills.push('spikes');
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

/* 生成全部 15 大关 × 10 小关（v2.1.10：由 12 大关扩展到 15，g13+ 为超限试炼） */
var GROUP_LEVELS = {};
(function () {
  for (var lg = 1; lg <= 15; lg++) {
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
        : lg >= 13 ? '超限试炼（最多 3 敌+魂攻防）'
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
  enabled: false,   // v2.1.10：改用「比例继承 + 固定曲线」，锚定与它冲突
                    // （锚定是尺度无关的，玩家缩小敌人也跟着缩小 → 净效果为零）。
                    // 保留实现与测试，需要时把这里改回 true 即可重新启用。
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

/* ★ 取「这一关实战真正使用的敌人配置」的唯一入口。
   v2.1.10 起改成比例继承后锚定默认关闭（GROUP_ANCHOR.enabled=false），
   但 debug 面板体检漏改、仍无条件走锚定 → 体检比实战强 ~25%，
   出现「模拟 g5~g12 全 0% 而实际已全通关」的矛盾报告（v2.1.12 修）。
   → 所有调用点（实战 2 处 + debug 体检 1 处）必须统一走这里，别再各自判断。 */
function groupStageEnemies(groupId, stage, allies) {
  if (GROUP_ANCHOR && GROUP_ANCHOR.enabled && typeof anchorStageEnemies === 'function') {
    return anchorStageEnemies(groupId, stage, allies);
  }
  return (stage && stage.enemies) || [];
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
  window.groupStageEnemies = groupStageEnemies;
  window.GROUP_INHERIT = GROUP_INHERIT;
  window.PET_GROUP_SCALE = PET_GROUP_SCALE;
  window.TALENTS_HIGH = TALENTS_HIGH;
  window.TALENTS_EXTRA = TALENTS_EXTRA;
  window.groupTerrainFor = groupTerrainFor;
  window.SKILLS_HIGH = SKILLS_HIGH;
  window.inheritGroupStats = inheritGroupStats;
  window.boostPetForGroup = boostPetForGroup;
  window.groupHash = groupHash;
  window.groupRng = groupRng;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GROUP_LEVELS = GROUP_LEVELS;
  globalThis.getGroupStage = getGroupStage;
  globalThis.GROUP_ANCHOR = GROUP_ANCHOR;
  globalThis.groupAnchorT = groupAnchorT;
  globalThis.anchorStageEnemies = anchorStageEnemies;
  globalThis.groupStageEnemies = groupStageEnemies;
  globalThis.GROUP_INHERIT = GROUP_INHERIT;
  globalThis.PET_GROUP_SCALE = PET_GROUP_SCALE;
  globalThis.TALENTS_HIGH = TALENTS_HIGH;
  globalThis.TALENTS_EXTRA = TALENTS_EXTRA;
  globalThis.groupTerrainFor = groupTerrainFor;
  globalThis.SKILLS_HIGH = SKILLS_HIGH;
  globalThis.inheritGroupStats = inheritGroupStats;
  globalThis.boostPetForGroup = boostPetForGroup;
  globalThis.groupHash = groupHash;
  globalThis.groupRng = groupRng;
}

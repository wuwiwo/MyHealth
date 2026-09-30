/* ============================================
   MyHealth — Pet Codex & Pet Skills (M4-4)
   宠物图鉴 13 只：属性/稀有度/被动天赋/技能。
   宠物技能注册进 SKILLS（复用 skill.js 机制），天赋注册进 TALENTS。
   依赖 skill.js / talent.js / pets.js。
   纯数据 + 注册。
   ============================================ */

/* 图鉴：speciesId → 宠物定义 */
var PET_CODEX = {
  /* ---- R 级 ---- */
  sparkle: { id:'sparkle', name:'闪闪星', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:[], skills:['p_shine'] },
  waterdrop:{ id:'waterdrop', name:'水水滴', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:[], skills:['p_drench'] },
  pongpong:{ id:'pongpong', name:'彭彭猪', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:[], skills:['p_sleep'] },
  /* ---- SR 级 ---- */
  flamechick:{ id:'flamechick', name:'火焰鸡', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:[], skills:['p_flamepeck'] },
  rocksteady:{ id:'rocksteady', name:'坚强岩', rarity:'SR', role:'辅助', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:[], skills:['fortify'] },
  chirpbird:{ id:'chirpbird', name:'清脆鸟', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:[], skills:['p_sing'] },
  thunderdog:{ id:'thunderdog', name:'雷霆犬', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:[], skills:['p_thundercharge'] },
  /* ---- SSR 级 ---- */
  possum:{ id:'possum', name:'小负鼠', rarity:'SSR', role:'攻击', base:{hp:200,atk:20,def:15,soulAtk:15,soulDef:10,spd:8}, talents:['lucky_pocket'], skills:['p_doublehit'] },
  darkcrow:{ id:'darkcrow', name:'黑暗鸦', rarity:'SSR', role:'攻击', base:{hp:200,atk:20,def:15,soulAtk:15,soulDef:10,spd:8}, talents:['dark_eye'], skills:['p_phantom'] },
  icecrystal:{ id:'icecrystal', name:'小冰晶', rarity:'SSR', role:'攻击', base:{hp:200,atk:20,def:15,soulAtk:15,soulDef:10,spd:8}, talents:['winter_core'], skills:['p_iceburst'] },
  lightspirit:{ id:'lightspirit', name:'光之精灵', rarity:'SSR', role:'辅助', base:{hp:200,atk:20,def:15,soulAtk:15,soulDef:10,spd:8}, talents:['holy_guard'], skills:['p_holylight'] },
  /* ---- UR 级（双天赋）---- */
  dream:{ id:'dream', name:'梦幻', rarity:'UR', role:'输出', base:{hp:300,atk:30,def:20,soulAtk:20,soulDef:15,spd:9}, talents:['mirror_field','inspiration'], skills:['p_dreamball'] },
  nonebear:{ id:'nonebear', name:'无念熊', rarity:'UR', role:'输出', base:{hp:300,atk:30,def:20,soulAtk:20,soulDef:15,spd:9}, talents:['mind_eye','fighter_instinct'], skills:['p_shadowfist'] },
  kirin:{ id:'kirin', name:'圣光麒麟', rarity:'UR', role:'辅助', base:{hp:300,atk:30,def:20,soulAtk:20,soulDef:15,spd:9}, talents:['immovable','pressure_field'], skills:['p_warmight'] }
};

/* ============ 宠物天赋（对照 design-v2.0.md §2.6） ============
   天赋是宠物**固有专属**被动，不可跨宠物解锁或装配：
     小负鼠=幸运口袋 / 黑暗鸦=漆黑之眼 / 小冰晶=凛冬之核 / 光之精灵=圣光守护
     梦幻=镜像结界+灵感涌动 / 无念熊=心眼+斗者本能 / 圣光麒麟=不动如山+威压领域
     R / SR 级无天赋。
   ⚠ 历史教训：v2.1.3 曾实现「按稀有度开池解锁天赋」，结果 SSR 宠物能同时装上
   凛冬之核 + 漆黑之眼 + 圣光守护（三只不同宠物的专属天赋挤在一只身上）。
   已按设计文档回退为固有天赋。 */

/* 宠物天赋列表：恒取图鉴定义值；存档上的 talentIds 一律忽略（防旧存档把错误天赋带回来） */
function getPetTalents(pet) {
  if (!pet) return [];
  var c = PET_CODEX[pet.speciesId];
  return (c && c.talents) ? c.talents.slice() : [];
}

/* 生成宠物 Unit（M4-5 用，这里先提供工厂）：
   成熟宠物 → createUnit + 挂天赋/技能，属性含炼化加成 */
function createPetUnit(petState) {
  var codex = PET_CODEX[petState.speciesId];
  if (!codex) return null;
  var base = {
    hp: codex.base.hp,
    atk: codex.base.atk,
    def: codex.base.def,
    spd: codex.base.spd,
    soulAtk: codex.base.soulAtk,
    soulDef: codex.base.soulDef
  };
  // 炼化加成
  var rs = petState.refineStats || {};
  base.hp += rs.hp || 0; base.atk += rs.atk || 0; base.def += rs.def || 0;
  base.soulAtk += rs.soulAtk || 0; base.soulDef += rs.soulDef || 0;
  var unit = createUnit({
    id: 'pet-' + petState.speciesId,
    side: 'ally',
    name: codex.name,
    level: 1,
    base: base,
    skills: codex.skills.slice(),
    tags: ['pet', codex.rarity]
  });
  unit._petSpecies = petState.speciesId;
  /* v2.1.22：把宠物技能等级带到战斗单位上。
     此前 skillLevels 只在 UI（pet-ui.js）与升级逻辑（pet-materials.js）里读，
     战斗结算完全读不到 —— 结果是「花灵能把技能升到 Lv10，打出来的伤害一点没变」。
     skill.js 的 skillLevelOf() 会优先读这个字段。 */
  unit._skillLevels = petState.skillLevels || {};
  /* v2.1.22：炼化等级 —— 技能「区间」的驱动源（design-v2.0.md:187「区间随基础属性成长」，
     而宠物基础属性的成长线就是炼化 §2.8，上限按稀有度 R50/SR60/SSR80/UR100）。
     skill.js 的 skillRangeT() 用它算区间进度 t = 炼化等级 / 上限。 */
  unit._refineLevel = petState.refineLevel || 0;
  attachTalents(unit, getPetTalents(petState));   // 天赋恒为图鉴固有值（见上方说明）
  // 应用天赋静态修正
  for (var k in (unit._talentMods || {})) {
    unit.base[k] = (unit.base[k] || 0) + unit._talentMods[k];
    if (k === 'hp') unit.hp = unit.base[k];
  }
  /* v2.2 WP-A1/A2 宝珠：改为**百分比**（进百分比池，与稀有度倍率**相加**），
     不再直接加属性值 —— 这里只挂一张百分比表，等 boostPetForGroup 统一结算。
     最终属性 =（图鉴 + 炼化 + 天赋静态 + 凝聚/共鸣）×（稀有度倍率 + Σ宝珠%）
     ⚠️ v2.1.17 那个「宝珠加成不参与放大」的 `_orbBonus` 特例随之**删除**。 */
  if (typeof petOrbPct === 'function') unit._orbPct = petOrbPct(petState.orbs);
  return unit;
}

/* 图鉴查询 */
function getPetCodex(id) { return PET_CODEX[id] || null; }
function listPetCodex() { return Object.keys(PET_CODEX); }

/* ============ 宠物专属技能注册（复用 SKILLS 机制） ============ */
if (typeof registerSkill === 'function') {

/* ============================================================
   WP-C 前半：宠物主动技能 §2.1~§2.7 逐条对齐
   （对照 doc/2.2-修改提案.md §2.1~§2.7 的「设计原文 / 源码现状 / 评审批注」）
   本轮**实际改动**（4 处技能定义）：
     · p_flamepeck    —— §2.4：CD 4 → 3
     · p_sing         —— §2.6：睡眠几率 固定 20% → 随成长 0%~30%
     · p_sleep        —— §2.3：施放时**先解除自身普通~高级负面**，再进入睡眠
     · p_thundercharge —— §2.7：伤害区间 220~400% → **260%~440%**
   本轮**判定无改动**（现实现已符合或评审未要求改）：
     · p_drench（§2.2 评审「不变」）
     · fortify（§2.5 评审「不需要，二者统一」—— 坚强岩复用敌群技能）
    ============================================================ */

/* ============================================================
   WP-C 后半：宠物主动技能 §2.8~§2.14 逐条对齐
   本轮**实际改动**：
     · p_shine（§2.1）     —— 补「蓄力 1 回合、下回合释放」（通用蓄力载荷，charge:true）
     · p_thundercharge（§2.7）—— 补蓄力 + 「目标潮湿/冰冻时 +25%」（condBonus）
       ⚠️ 「自身 35% 反冲」**未实装**：设计原文只写「自身承受 35% 反冲」，
          **未给「35% 的基数」口径**（是本次伤害？自身攻击？自身最大生命？）→ 按纪律**停下上报**，
          不自行发明基数（见任务回执）。
     · p_doublehit（§2.8） —— 最多 2 名敌人各 1 次（enemy2）+ 伤害 180%~270%
                              + 降攻 0%~10% / 降防 0%~20%（pulled 实例）+ 窃取转给我方随机 1 名（stolen）
     · p_iceburst（§2.10） —— 随机 1~2 敌（enemy12）+ 伤害 160%~250% + 冰冻几率 10%~55% 随成长
     · p_holylight（§2.11）—— 治疗区间 110%~200% → **150%~240%** + 只挑**未满血**友方（wounded）
     · p_dreamball（§2.12）—— 蓄力 + 全场随机弹射 3 次（每单位最多 1 次）、每次 +10% 累计、
                              敌方概率 55%→82%（我方 = 互补 45%→18%）、未发动次数为自身回血
     · p_shadowfist（§2.13）—— 4 段（原 5）+ 单次 55%~100% + 视为普攻（触发普攻相关钩子）
     · p_warmight（§2.14） —— 随机 2 名友方（ally2）+ 攻击/魂攻**较高一项** +3%~30%
                              + 吸血 5%~50% / 技能吸血 7.5%~32.5%（挂持有者的 warmight 状态）
   本轮**判定无改动**：
     · p_phantom（§2.9 评审「不改变」）
    ============================================================ */


/* R：闪耀（敌方全体命中率 -0~40%）—— v2.1.22 接区间；持续 2 回合（§2.16-2 裁决）。
   WP-C（§2.1 评审「蓄力 1 回合，下回合释放，持续 2 回合」）：
     · 「持续 2 回合」现实现已符合（`_hitModTurns = 2`，由 battle-group 按目标回合递减）；
     · 「蓄力 1 回合、下回合释放」**本轮实装** —— 走通用蓄力载荷（`charge: true`）：
       首次施放只挂 charging（承伤 +25%），下回合由 groupUnitTurn 释放**本技能自身**
       （battle-group 原先把蓄力写死成「攻击 ×400% 单体物理」，承载不了辅助/全体/命中削减）。 */
registerSkill({ id:'p_shine', name:'闪耀', type:'support', target:'all', cooldown:4, charge:true,
  range:{ acc:[0, 40] },
  effects:[function(c,ts,r,ctx){ var acc=ctx.sv('acc')/100; ts.forEach(function(t){ t._accMod = (t._accMod || 0) - acc; t._hitModTurns = 2; }); r.events.push({msg:'✨ ' + (c.name||'宠物') + ' 闪耀：' + ts.map(function(t){return t.name;}).join('、') + ' 命中率 -' + Math.round(acc*100) + '%（2 回合）'}); }] });

/* R：打湿（目标更易被命中 + 魂防降低）—— v2.1.22 接区间：魂防 0~25%、命中 +0~30% */
registerSkill({ id:'p_drench', name:'打湿', type:'support', target:'random1', cooldown:5,
  range:{ soulDefDown:[0, 25], hit:[0, 30] },
  /* v2.1.15：去掉这里手写的 t._eva -= 0.3（命中加成由「潮湿」统一提供，两边都写会互相抵消）。
     v2.1.22：幅度改为按基础属性成长换算后**传给状态实例** ——
     statMods() 对同键的实例 modsPct 优先于定义里的 statModsPct，所以不会叠加成两份。 */
  effects:[function(c,ts,r,ctx){
    var down=ctx.sv('soulDefDown')/100, hit=ctx.sv('hit')/100;
    ts.forEach(function(t){ r.statusApps.push({unitId:t.id,id:'wet',duration:2,chance:1,grade:2,
      modsPct:{ soulDef:-down }, data:{ hitBonus:hit }}); });
    r.events.push({msg:'💧 ' + (c.name||'宠物') + ' 打湿 → ' + ts.map(function(t){return t.name;}).join('、') + '：魂防 -' + Math.round(down*100) + '%、被命中 +' + Math.round(hit*100) + '%'});
  }] });

/* R：睡觉（自愈 + 睡眠）—— 治疗量接区间 (防御+魂防)×0~300%（v2.1.22）
   v2.1.24（作者指定）：睡眠时长 1~3 回合（设计文档原写 3~4）。
   ⚠️ duration 必须 = 实际回合数 **+1**：本状态是在**自己的回合内**被施加的，
      同一回合末的 ageStatuses 会先扣 1，所以 duration=N 只锁 N-1 个回合
      （写 1 等于完全没睡，这正是改前的状况）。
   睡眠期间**每回合结束**按 healPct 回复（由 sleep 状态的 onTurnEnd 实现）。 */
registerSkill({ id:'p_sleep', name:'睡觉', type:'support', target:'self', cooldown:4,
  /* v2.1.26：睡眠时长也接区间（原先是 1~3 随机，与成长无关）。
     低值 1 回合、高值 3 回合（v2.1.24 作者指定的上限）。
     ⚠️ duration 必须 = 实际回合数 **+1**（同回合末 ageStatuses 会先扣 1）。 */
  range:{ power:[0, 300], turns:[1, 3] },
  effects:[function(c,ts,r,ctx){
    var pct=ctx.sv('power')/100;
    var turns=Math.max(1, Math.round(ctx.sv('turns')));   // 1~3 回合，随成长
    ts.forEach(function(t){
      /* WP-C（§2.3 评审「1-3 回合，解除自身（普通-高级负面效果），
         先解除异常状态再进入睡眠状态」）：**先解除自身普通~高级负面**（grade ≤ 2），
         随后才把「睡眠」推入 statusApps（引擎在 effects 之后统一施加）—— 顺序即语义。
         特级（grade 3：末日 / 遗言诅咒）按设计不解除，与「净化」口径一致。
         `cleanseNegatives` 直接改 statuses、立即生效，不会与随后的睡眠互相干扰。 */
      var freed = (typeof cleanseNegatives === 'function') ? cleanseNegatives(t, 2) : [];
      if (freed.length && typeof syncStatusDerived === 'function') syncStatusDerived(t);
      r.heals.push({ unitId: t.id, amount: Math.floor(((t.base.def||0)+(t.base.soulDef||0)) * pct) });
      r.statusApps.push({ unitId: t.id, id: 'sleep', duration: turns + 1, chance: 1, grade: 1,
        data: { healPct: pct } });
      r.events.push({msg:'💤 ' + (c.name||'宠物') + ' 睡觉：自愈 ' + Math.round(pct*100) + '%（防+魂防），睡 ' + turns + ' 回合'
        + (freed.length ? '，先解除【' + freed.map(function(d){return d.name||d.id;}).join('、') + '】' : '')});
    });
  }] });

/* SR：火焰啄击 —— 设计 攻击×150%~330%（区间随基础属性成长，v2.1.22 接线）
   WP-C（§2.4 评审「cd 变为 3」）：冷却 4 → 3。 */
registerSkill({ id:'p_flamepeck', name:'火焰啄击', type:'attack', target:'random1', power:240, range:{power:[150,330]}, dmgType:'physical', cooldown:3 });

/* SR：歌唱（全体魂攻+几率睡眠）—— 设计 魂攻×160%~250%
   WP-C（§2.6 评审「0%-30%（随等级成长）」）：睡眠几率由**固定 20%** 改为
   随基础属性成长（skillRangeT）在 **0%~30%** 之间取值 —— t=0（未炼化）时完全不会睡眠，
   炼化满时 30%（与设计评审上限一致）。睡眠时长仍为 1 回合（设计原文）。 */
registerSkill({ id:'p_sing', name:'歌唱', type:'attack', target:'all', power:200, range:{power:[160,250], sleepChance:[0,30]}, dmgType:'soul', cooldown:5,
  effects:[function(c,ts,r,ctx){ var ch=ctx.sv('sleepChance')/100; ts.forEach(function(t){ if(battleRnd()<ch) r.statusApps.push({unitId:t.id,id:'sleep',duration:1,chance:1,grade:1}); }); }] });

/* SR：雷霆冲撞 —— 设计（§2.7 评审）「魂攻×260%-440%，蓄力 1 回合，蓄力反冲条件加成」
   WP-C：伤害区间 [220,400] → **[260,440]**（`power:350` 仅区间中点兜底，range 存在时不被使用）。
   WP-C 后半：补两项引擎能力 ——
     · 蓄力 1 回合、下回合释放 —— 通用蓄力载荷 `charge: true`（释放的是本技能自身：
       魂攻伤害 + 条件加成 + 占用下回合行动）；
     · 目标处于潮湿/冰冻时伤害 +25% —— `condBonus`（calcSkillDamage 新增「按目标状态加成」钩子）。
   ⚠️ **未实装：自身承受 35% 反冲** —— 设计原文（design-v2.0.md:214）只写「自身承受 35% 反冲」，
      **没有给「35% 的基数」**（本次伤害 / 自身攻击 / 自身最大生命？三者差别很大）。
      按任务纪律「需要裁决而文档没有的 → 停下上报」，本批**不发明基数**、不实装该项。 */
registerSkill({ id:'p_thundercharge', name:'雷霆冲撞', type:'attack', target:'random1', power:350, range:{power:[260,440]}, dmgType:'soul', cooldown:4,
  charge:true, condBonus:{ statuses:['wet','freeze'], value:0.25 } });

/* SSR：双撞（最多 2 名敌人各 1 次 + 降攻防 + 窃取转移）
   WP-C（§2.8 评审「最多场上 2 名敌人，各 1 次攻击，降低其 0%-10% 攻击与 0%-20% 的防御，
   窃取数值给予我方随机 1 名角色。伤害：180%-270%」）：
     · 目标 random1 → **enemy2**（随机最多 2 名敌人，各结算 1 次）；
     · 伤害区间 [150,240] → **[180,270]**；
     · 降攻 / 降防幅度接区间（0~10% / 0~20%，随基础属性成长），落在实例 `pulled.modsPct`；
     · 窃取：把**同一次**降幅作为正面加成（stolen）转给我方随机 1 名角色 2 回合。
   （旧实现只有 armorbroken 每层 -10% 防御，既无降攻、也无窃取转移。） */
registerSkill({ id:'p_doublehit', name:'双撞', type:'attack', target:'enemy2', power:200, range:{power:[180,270], atkDown:[0,10], defDown:[0,20]}, dmgType:'physical', cooldown:5,
  effects:[function(c,ts,r,ctx){
    var atkDown = ctx.sv('atkDown')/100, defDown = ctx.sv('defDown')/100;
    ts.forEach(function(t){
      r.statusApps.push({ unitId:t.id, id:'pulled', duration:2, chance:1, grade:1,
        modsPct:{ atk:-atkDown, def:-defDown } });
    });
    /* 窃取转移：从我方存活单位里随机 1 名（含施放者本人），加成 = 同一次窃取的降幅，持续 2 回合 */
    var mates = (ctx && ctx.units) ? ctx.units.filter(function(u){ return u && u.side === c.side && u.hp > 0; }) : [];
    if (mates.length) {
      var pick = mates[Math.floor(battleRnd() * mates.length)];
      r.buffs.push({ unitId: pick.id, key:'stolen', value: atkDown, modsPct:{ atk: atkDown, def: defDown }, duration:2 });
      r.events.push({ msg:'🫳 ' + (c.name||'宠物') + ' 双撞：窃取能力 → ' + pick.name + ' 攻击 +' + Math.round(atkDown*100) + '%、防御 +' + Math.round(defDown*100) + '%（2 回合）' });
    }
  }] });

/* SSR：幻影之瞳（迷惑）—— v2.1.21 实装。
   设计依据 doc/design-v2.0.md:229：迷惑 1 敌 1 回合，使其随机执行三选一
   （①丧失防备 ②不分敌我误击其他敌人 ③牺牲自我）。
   真正执行在 battle-group.js 的 resolveConfusion()；这里只负责挂上「迷惑」状态，
   并把**施法者与该技能等级**塞进状态实例（三个分支的数值按等级取，区间见 design-v2.0.md:229）。 */
registerSkill({ id:'p_phantom', name:'幻影之瞳', type:'support', target:'random1', cooldown:4,
  range:{ confuseDown:[0.15, 0.75], confuseHit:[0.50, 0.95], confuseSelf:[0.01, 0.10] },
  effects:[function(c,ts,r){
    var lv = (typeof skillLevelOf === 'function') ? skillLevelOf(c, 'p_phantom') : 1;
    ts.forEach(function(t){ r.statusApps.push({ unitId:t.id, id:'confused', duration:1, chance:1, grade:2, data:{ casterId:c.id, skillId:'p_phantom', level:lv } }); });
    r.events.push({ msg:'👁️ ' + (c.name||'宠物') + ' 幻影之瞳 → ' + ts.map(function(t){return t.name;}).join('、') + '：迷惑 1 回合（技能 Lv' + lv + '）' });
  }] });

/* SSR：冰晶爆（冰冻+伤害）
   WP-C（§2.10 评审「伤害：160%-250%，10%-55% 几率冰冻」）：
     · 目标 random1 → **enemy12**（设计原文「随机 1~2 敌」，50% 取 1、50% 取 2）；
     · 伤害区间 [150,240] → **[160,250]**；
     · 冰冻几率由**固定 30%** 改为随基础属性成长 **10%~55%**（range.freezeChance）。
   （异常等级仍是高级 grade 2，未变。） */
registerSkill({ id:'p_iceburst', name:'冰晶爆', type:'attack', target:'enemy12', power:200, range:{power:[160,250], freezeChance:[10,55]}, dmgType:'soul', cooldown:4,
  effects:[function(c,ts,r,ctx){ var ch=ctx.sv('freezeChance')/100; ts.forEach(function(t){ if(battleRnd()<ch) r.statusApps.push({unitId:t.id,id:'freeze',duration:1,chance:1,grade:2}); }); }] });

/* SSR：圣光治愈
   WP-C（§2.11 评审「治疗：魂攻×150%-240%，选择生命值不为 100% 的友方」）：
     · 治疗区间 [110,200] → **[150,240]**（设计原文口径，评审已上调）；
     · `wounded:true` —— selectTargets('ally1') 只挑**未满血**的友方；全队满血时退回全体（避免空放）。 */
registerSkill({ id:'p_holylight', name:'圣光治愈', type:'support', target:'ally1', wounded:true, cooldown:3,
  range:{ power:[150, 240] },
  effects:[function(c,ts,r,ctx){ var v=ctx.sv('power')/100; ts.forEach(function(t){ r.heals.push({unitId:t.id,amount:Math.floor((c.base.soulAtk||0)*v)}); }); }] });

/* UR：梦幻光球（全场弹射）
   WP-C（§2.12 评审「全场随机弹射 3 次，每个单位最多受到 1 次弹射，每次弹射伤害 +10%（固定），
   单次伤害：魂攻×220%-310%，需要蓄力 1 回合。对我方弹射几率 45%→18%（逐渐降低），对敌方 55%→82%，
   如果弹射次数剩余，按未发动次数为自身恢复血量」）：
     · 单次伤害 [200,290] → **[220,310]**；
     · `charge:true` —— 蓄力 1 回合、下回合释放；
     · `bounce` —— 全场随机弹射（引擎见 skill.js 的 calcSkillDamage + battle-group 的自愈结算）：
       每次先掷阵营（敌方概率 55%→82%，我方 = 互补 45%→18%），再在该阵营未命中池里随机取 1 名；
       每次弹射伤害累计 +10%（本次施放内累加，下次发动重置）；该阵营无可打单位时退另一边，
       两边都空则该次「未发动」→ 按未发动次数 × 单次伤害为自身回血。 */
registerSkill({ id:'p_dreamball', name:'梦幻光球', type:'attack', target:'random1', power:250, range:{power:[220,310]}, dmgType:'soul', cooldown:5,
  charge:true, bounce:{ times:3, dmgUp:0.10, foeChance:[0.55,0.82] } });

/* UR：无影拳
   WP-C（§2.13 评审「总计 4 次攻击，每次 55%-100%，视为普通攻击，会触发普通攻击相关效果与判定」）：
     · multiHit 5 → **4**；单次伤害区间 [50,95] → **[55,100]**；
     · `asNormalAttack:true` —— 技能伤害结算后额外派发 onAfterDamage（天赋「嗜血」/ 状态「战意」吸血），
       即「触发普通攻击相关效果与判定」（命中判定 / 利刃等原本已走 isPlayerAttack）。
   设计原文（design-v2.0.md:249）写「随机可重复」，故仍由 ctx.pool 随机取目标。 */
registerSkill({ id:'p_shadowfist', name:'无影拳', type:'attack', target:'random1', power:70, range:{power:[55,100]}, multiHit:4, dmgType:'physical', cooldown:4, asNormalAttack:true,
  effects:[function(c,ts,r){ r.events.push({msg:'👊 ' + (c.name||'宠物') + ' 无影拳：4 连击（目标随机可重复）'}); }] });

/* UR：战意灌注
   WP-C（§2.14 评审「随机 2 名友方提升 3%-30%（攻击或者魂攻，较高一项），
   同时期间获得 5%-50% 吸血与 7.5%-32.5% 的技能吸血」）：
     · 目标 ally1 → **ally2**（随机 2 名友方）；
     · 增益只加**攻击/魂攻中较高的一项**（按目标单位属性选定 modsPct 的键）；
     · 附带吸血 / 技能吸血 —— 按 §6.3 裁决做成「**挂在持有者身上的增益**」（状态 warmight），
       与天赋「嗜血」**叠加**，并可按镜像结界的阵营 ±25% 缩放（缩放发生在 castSkill 落 buff 时）。
   技能吸血区间取评审给的口径 **7.5%~32.5%**（设计原文写 2.5%~25%，§2.16-5 已确认改用评审值）。 */
registerSkill({ id:'p_warmight', name:'战意灌注', type:'support', target:'ally2', cooldown:4,
  range:{ atkBoost:[3, 30], lifesteal:[5, 50], skillLifesteal:[7.5, 32.5] },
  effects:[function(c,ts,r,ctx){
    var v = ctx.sv('atkBoost')/100, ls = ctx.sv('lifesteal')/100, sls = ctx.sv('skillLifesteal')/100;
    ts.forEach(function(t){
      var atk = (t.base && t.base.atk) || 0, soul = (t.base && t.base.soulAtk) || 0;
      var key = soul > atk ? 'soulAtk' : 'atk';       // 较高一项
      var mods = {}; mods[key] = v;
      r.buffs.push({ unitId:t.id, key:'warmight', value:v, modsPct:mods, lifesteal:ls, skillLifesteal:sls, duration:2 });
    });
    r.events.push({ msg:'🔥 ' + (c.name||'宠物') + ' 战意灌注 → ' + ts.map(function(t){return t.name;}).join('、')
      + '：攻击/魂攻较高项 +' + Math.round(v*100) + '%、吸血 ' + Math.round(ls*100) + '% / 技能吸血 ' + Math.round(sls*100) + '%（2 回合）' });
  }] });

}

/* ============ 宠物专属天赋注册（复用 TALENTS 机制） ============ */
if (typeof registerTalent === 'function') {

/* ---- 宠物专属天赋（v2.1.5 起真实生效）
   petOnly 标记 = 不会被 enemy.js 的 pickRandomTalents 抽给敌人 ----

   ============================================================
   v2.3.0 WP-D 逐条对齐（对照 doc/2.2-修改提案.md §3.1~§3.10）
   本轮**实际改动**（4 条）：
     · holy_guard   —— §3.4：新增「自身受到伤害 -10%」（全程无条件，见该条注释）
     · mirror_field —— §3.5 + §3.12-2：治疗以外的辅助通道（增益幅度 / 状态幅度）
                        也按来源阵营 ±25%（新增 onBeforeSupportEffect）
     · immovable    —— §3.9：触发阈值由「满血(100%)」改为「血量 > 95%」
     · pressure_field —— §3.10：改为「无条件 -10%，自身血量 > 70% 时翻倍为 -20%」
   本轮**判定无改动**（评审为「不变 / 保持 / 回合开始触发」）：
     lucky_pocket（§3.1 三类独立判定 **已于本版收口**，见该条注释）/ dark_eye / winter_core / inspiration / mind_eye
   v2.2.10 已收口（本版跳过）：fighter_instinct（§3.8 30% 触发 + §3.11A/§3.12-1 暴击取最高）
   §3.11B 裁决「天赋不需要升级」→ 本文件所有天赋**一律不接成长区间**，保持固定值。
   ============================================================ */

/* 小负鼠：幸运口袋 —— 战斗胜利结算期生效，消费端见 game-render.js 的 groupVictoryReward()
   ✅ §3.1 欠账已收口（对齐 §3.11C 裁决「三类材料各自独立判定」）：
     · **三类奖励各自独立判定** —— 三条互不影响，不是「命中一类就结束」
     · 概率与数量都在 §3.1 区间内**均匀随机**取值（不是取定值、也不是取区间中点）：
         营养液 nutrition  概率 10%~20% → 0~2 个   （0.10 + rnd×0.10）
         宠物饲料 feed     概率 20%~30% → 0~4 个   （0.20 + rnd×0.10）
         宠物灵能 spirit   概率  5%~10% → 0~5 个   （0.05 + rnd×0.05）
     · 数量区间含 0（§3.1 写「0~N 个」）：掷到 0 表示本次不产出（不发材料、不写日志）
     · **多个携带者不叠加**：只要队伍里有 ≥1 名携带者就**只判一轮**
       （消费端 filter 后只判「有没有」，不按携带者人数重复调用）
   随机数由消费端注入**本场战斗的 rng**（`gb.rng`，即 createGroupBattle 的种子 RNG），
   兜底才用全局 `battleRnd()` —— **不用 Math.random()**，保证确定性回放 / 可测。 */
var LUCKY_POCKET_TABLE = [
  { type:'nutrition', pMin:0.10, pMax:0.20, nMax:2 },
  { type:'feed',      pMin:0.20, pMax:0.30, nMax:4 },
  { type:'spirit',    pMin:0.05, pMax:0.10, nMax:5 }
];
/* 幸运口袋掉落判定（纯函数，rnd 注入以便回放/测试）→ [{type,n,lucky:true}]
   每类固定消耗：① 掷概率 ② 掷是否命中 ③（命中后）掷数量，顺序恒为 营养液→饲料→灵能 */
function luckyPocketDrops(rnd) {
  var r = (typeof rnd === 'function') ? rnd : battleRnd;
  var out = [];
  LUCKY_POCKET_TABLE.forEach(function (k) {
    var p = k.pMin + r() * (k.pMax - k.pMin);   // 概率：区间内均匀随机
    if (r() >= p) return;                       // 各自独立判定（不提前结束）
    var n = Math.floor(r() * (k.nMax + 1));     // 数量：0 ~ nMax 均匀
    if (n > 0) out.push({ type:k.type, n:n, lucky:true });
  });
  return out;
}
registerTalent({ id:'lucky_pocket', name:'幸运口袋', desc:'战斗胜利结算几率获得随机额外材料', petOnly:true });

/* 黑暗鸦：漆黑之眼 —— 必定命中 */
registerTalent({ id:'dark_eye', name:'漆黑之眼', desc:'自身攻击必定命中', petOnly:true,
  hooks: { onBeforeHit: function () { return { mutations: [{ key:'guaranteedHit', value:true }] }; } } });

/* 小冰晶：凛冬之核 —— 自身在场时我方全体免疫冰冻 */
registerTalent({ id:'winter_core', name:'凛冬之核', desc:'自身在场时我方全体免疫冰冻', petOnly:true,
  hooks: { onAllyStatus: function (unit, ctx) {
    if (ctx.statusId === 'freeze') {
      return { skipAction:true, events: [{ msg:'❄️ 凛冬之核: ' + (ctx.target ? ctx.target.name : '我方') + ' 免疫冰冻' }] };
    }
  } } });

/* 光之精灵：圣光守护 —— 血量>50% 时承担队友 20% 伤害；自身受到伤害 -10%（全程）
   v2.3.0 WP-D（§3.4 评审「增加：自身受到伤害 -10%（全程生效）」）：
     分担部分（>50% 血才生效）维持 v2.1.5 的实现不变；
     新增 `onDamage` → `dmgTakenReduce 0.1`，**无条件、全程生效**（不看过血线）。
     消费端是 battle-group.js 既有的两条伤害通道（普攻 line ~403 / 技能 line ~496，
     与「广域防御」「不动如山」同一条），无需新增派发点。 */
registerTalent({ id:'holy_guard', name:'圣光守护', desc:'血量>50%时承担队友20%伤害；自身受到伤害-10%', petOnly:true,
  hooks: {
    onAllyDamage: function (unit, ctx) {
      if (unit.hp > unit.base.hp * 0.5 && ctx.amount > 0) {
        var share = Math.max(1, Math.floor(ctx.amount * 0.2));
        unit.hp = Math.max(0, unit.hp - share);
        return { mutations: [{ key:'damageShare', value: share }], events: [{ msg:'✨ 圣光守护: ' + unit.name + ' 分担 ' + share }] };
      }
    },
    onDamage: function () {
      return { mutations: [{ key:'dmgTakenReduce', value:0.1 }] };
    }
  } });

/* 梦幻：镜像结界 —— 受我方辅助效果 +25%，受敌方辅助效果 -25%
   v2.3.0 WP-D（§3.5 评审「需要接入其他辅助效果」+ §3.12-2 裁决「全通道适用」）：
     · 治疗通道自 v2.1.5 起即生效（onBeforeHeal → healBoost ±0.25），**行为不变**；
     · 新增 `onBeforeSupportEffect` → `supportScale ±0.25`，供**非治疗**的辅助通道用。
       消费点（battle-group.js 的 castSkill）：`fx.buffs` 的增益幅度（atkup 的 modsPct.atk、
       wideguard 的 data.reduce）、`fx.statusApps` 的**实例 modsPct** 幅度
       （如敌方「打湿」落到本宠物身上时魂防削减 ×0.75）。
       判定与治疗一致：来源与自身同阵营 → +25%，异阵营 → -25%；非 support 类技能不派发。
   v2.3.0 WP-E（§3.12-2 剩余三通道的现状）：
     · 护盾量 —— **已接入**：唯一的给盾载体是玩家技能「金身护盾」（它是被动技能，不走
       castSkill），派发点放在 player-skill-hooks.js 的唯一写入点 playerSkillBattleStart，
       用 supportEffectMul() 按阵营缩放（本技能恒为我方来源 → 只会放大 ×1.25）；
     · 状态解除（净化）—— 二元语义（解/不解除），没有可乘的「幅度」→ 仍无载体；
     · **吸血 —— WP-C 已接入**：§6.3 裁决把 p_warmight 的吸血做成「挂在持有者身上的增益」
       （状态 warmight），于是它变成「作用在持有者上的辅助效果」，其吸血/技能吸血幅度
       在 castSkill 落 buff 时按阵营 ×1.25 / ×0.75 缩放（与增益幅度同一处）。
       （天赋「嗜血」仍是攻击方自身天赋、不经此通道。） */
registerTalent({ id:'mirror_field', name:'镜像结界', desc:'受我方辅助效果+25%，受敌方辅助效果-25%', petOnly:true,
  hooks: {
    onBeforeHeal: function (unit, ctx) {
      if (!ctx.isSupport) return;
      var fromAlly = ctx.source && ctx.source.side === unit.side;
      return { mutations: [{ key:'healBoost', value: fromAlly ? 0.25 : -0.25 }] };
    },
    onBeforeSupportEffect: function (unit, ctx) {
      if (!ctx || !ctx.support) return;
      var fromAlly = ctx.source && ctx.source.side === unit.side;
      return { mutations: [{ key:'supportScale', value: fromAlly ? 0.25 : -0.25 }] };
    }
  } });

/* 梦幻：灵感涌动 —— 每回合开始随机 1 名友方魂攻 +20%（持续到本回合结束） */
registerTalent({ id:'inspiration', name:'灵感涌动', desc:'每回合开始随机友方魂攻+20%', petOnly:true,
  hooks: {
    onTurnStart: function (unit, ctx) {
      var mates = (ctx.allyUnits || []).filter(function (u) { return u.hp > 0; });
      if (!mates.length) return;
      var t = mates[Math.floor(battleRnd() * mates.length)];
      if (!t._inspireBoost) t._inspireOrig = t.base.soulAtk || 0;
      t.base.soulAtk = Math.floor((t._inspireOrig || 0) * 1.2);
      t._inspireBoost = true;
      return { events: [{ msg:'✨ 灵感涌动: ' + t.name + ' 魂攻 +20%' }] };
    },
    onTurnEnd: function (unit, ctx) {
      (ctx.allyUnits || []).forEach(function (u) {
        if (u && u._inspireBoost) { u.base.soulAtk = u._inspireOrig; u._inspireBoost = false; }
      });
    }
  } });

/* 无念熊：心眼 —— 自身命中率不会被降低 */
registerTalent({ id:'mind_eye', name:'心眼', desc:'自身命中率不会被降低', petOnly:true,
  hooks: { onBeforeHit: function () { return { mutations: [{ key:'noAccPenalty', value:true }] }; } } });

/* 无念熊：斗者本能 —— 普攻/技能 30% 暴击，暴击 150% 伤害
   v2.3.0 WP-D（§3.8 评审 + §3.11A + §3.12-1）：触发率 25% → **30%**；
   与「宠物暴击档」（玩家装配暴击后共享给宠物，15% / 160%，见 skills.js 的 petEffect）的
   关系按 §3.12-1 裁决 = **取最高、分别判定** —— 两者各自掷骰，都触发时取较高倍率、只结算一次。
   合并落在 battle-group.js 的 `groupCritMult()`，不在本钩子里做。
   v2.3.0 收口：`castSkill` 的**技能伤害**此前直接走 `talentCrit()`（只吃本天赋、不吃宠物暴击档），
   现与普攻一样改走 `groupCritMult()` —— 本钩子对两条伤害路径同时生效。 */
registerTalent({ id:'fighter_instinct', name:'斗者本能', desc:'普攻/技能30%暴击，暴击150%伤害', petOnly:true,
  hooks: { onBeforeCrit: function () { return { mutations: [{ key:'critChance', value:0.30 }, { key:'critMult', value:1.5 }] }; } } });

/* 圣光麒麟：不动如山 —— 血量>95% 时免疫普通~高级负面，且受到伤害 -50%
   v2.3.0 WP-D（§3.9 评审「生命值高于95%触发这个天赋」）：
     触发阈值由原来的「满血（hp ≥ base.hp）」放宽为「**血量 > 95%**」（严格大于）。
     两个 hook（onBeforeStatus / onDamage）用同一个阈值，保持「免疫」与「减伤」同时开合。
     ⚠️ 该效果与「广域防御」「圣光守护自身 -10%」共用 battle-group 的 dmgTakenReduce 通道，
        多个来源会按 (1-v) 连乘，属既有口径。 */
registerTalent({ id:'immovable', name:'不动如山', desc:'血量>95%时免疫普通~高级负面，受伤-50%', petOnly:true,
  hooks: {
    onBeforeStatus: function (unit, ctx) {
      if (unit.hp > unit.base.hp * 0.95 && (!ctx.grade || ctx.grade <= 2)) {
        return { skipAction:true, events: [{ msg:'🛡️ 不动如山: ' + unit.name + ' 免疫' + (ctx.statusId || '负面') }] };
      }
    },
    onDamage: function (unit) {
      if (unit.hp > unit.base.hp * 0.95) return { mutations: [{ key:'dmgTakenReduce', value:0.5 }] };
    }
  } });

/* 圣光麒麟：威压领域 —— 敌方全体治疗效果 -10%；自身血量>70% 时翻倍为 -20%
   v2.3.0 WP-D（§3.10 评审「降低敌方全体受到的10%治疗效果，如果自身生命值高于70%则这个天赋
     效果变为2倍」）：原实现为「血量>75% 时 -20%，否则完全不生效」——
     现在改为**无条件 -10%**，仅在高血线（>70%）时翻倍。
     消费端仍是 battle-group.js 的 talentAura(foes, 'onFoeHeal') → healReduce。 */
registerTalent({ id:'pressure_field', name:'威压领域', desc:'敌方全体治疗-10%；自身血量>70%时翻倍为-20%', petOnly:true,
  hooks: { onFoeHeal: function (unit) {
    var doubled = unit.hp > unit.base.hp * 0.70;
    return { mutations: [{ key:'healReduce', value: doubled ? 0.2 : 0.1 }] };
  } } });

}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.PET_CODEX = PET_CODEX;
  window.createPetUnit = createPetUnit;
  window.getPetCodex = getPetCodex;
  window.listPetCodex = listPetCodex;
  window.getPetTalents = getPetTalents;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_CODEX = PET_CODEX;
  globalThis.createPetUnit = createPetUnit;
  globalThis.getPetCodex = getPetCodex;
  globalThis.listPetCodex = listPetCodex;
  globalThis.getPetTalents = getPetTalents;
}

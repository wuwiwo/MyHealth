/* MyHealth game pack · v204 · hash:4d7d29c6a3b6b94c · 按需包（挑战/宠物视图）· 由 scripts/build-bundle.js 生成，勿手改 */
/* ===== pet-codex.js ===== */
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
  sparkle: { id:'sparkle', name:'闪闪星', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:['sparkle_guard'], skills:['p_shine'] },
  waterdrop:{ id:'waterdrop', name:'水水滴', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:['rain_sprint'], skills:['p_drench'] },
  pongpong:{ id:'pongpong', name:'彭彭猪', rarity:'R', role:'辅助', base:{hp:100,atk:10,def:5,soulAtk:6,soulDef:3,spd:5}, talents:['pig_snore'], skills:['p_sleep'] },
  /* ---- SR 级 ---- */
  flamechick:{ id:'flamechick', name:'火焰鸡', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:['flame_spirit'], skills:['p_flamepeck'] },
  rocksteady:{ id:'rocksteady', name:'坚强岩', rarity:'SR', role:'辅助', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:['stone_thorns'], skills:['fortify'] },
  chirpbird:{ id:'chirpbird', name:'清脆鸟', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:['chirp_sustain'], skills:['p_sing'] },
  thunderdog:{ id:'thunderdog', name:'雷霆犬', rarity:'SR', role:'攻击', base:{hp:150,atk:15,def:10,soulAtk:10,soulDef:6,spd:6}, talents:['thunder_haste'], skills:['p_thundercharge'] },
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
     ⚠️ v2.14.8 起有 1 个例外：**彭彭猪（R）= 鼾睡 `pig_snore`**（作者平衡调整新增）。
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
       + **自身 35% 反冲**（`recoil:0.35`，v2.2.18 作者裁决：基数 = 本次对目标造成的伤害 × 35%）
     · p_doublehit（§2.8） —— 最多 2 名敌人各 1 次（enemy2）+ 伤害 180%~270%
                              + 降攻 0%~10% / 降防 0%~20%（pulled 实例）+ 窃取转给我方随机 1 名（stolen）
     · p_iceburst（§2.10） —— 随机 1~2 敌（enemy12）+ 伤害 160%~250% + 冰冻几率 10%~55% 随成长
     · p_holylight（§2.11）—— 治疗区间 110%~200% → **150%~240%** + 只挑**未满血**友方（wounded）
     · p_dreamball（§2.12）—— 蓄力 + 全场随机弹射 3 次（每单位最多 1 次）、每次 +10% 累计、
                              敌方概率 55%→82%（我方 = 互补 45%→18%）、未发动次数为自身回血
     · p_shadowfist（§2.13）—— 4 段（原 5）+ 单次 55%~100% + 视为普攻（**v2.3.0 起真正走普攻通道**，
                                      不再只是补一个 onAfterDamage 派发）
     · p_warmight（§2.14） —— 随机 2 名友方（ally2）+ 攻击/魂攻**较高一项** +3%~30%
                              + 吸血 5%~50% / 技能吸血 7.5%~32.5%（挂持有者的 warmight 状态）
   本轮**判定无改动**：
     · p_phantom（§2.9 评审「不改变」）
    ============================================================ */


/* R：闪耀（敌方全体命中率 **0%~50%**）—— v2.1.22 接区间；持续 2 回合（§2.16-2 裁决）。
   v2.14.8 作者平衡调整（数值照抄）：命中削减区间上限 40% → **50%**（区间下端 0 不变）。
   WP-C（§2.1 评审「蓄力 1 回合，下回合释放，持续 2 回合」）：
     · 「持续 2 回合」现实现已符合（`_hitModTurns = 2`，由 battle-group 按目标回合递减）；
     · 「蓄力 1 回合、下回合释放」**本轮实装** —— 走通用蓄力载荷（`charge: true`）：
       首次施放只挂 charging（承伤 +25%），下回合由 groupUnitTurn 释放**本技能自身**
       （battle-group 原先把蓄力写死成「攻击 ×400% 单体物理」，承载不了辅助/全体/命中削减）。 */
registerSkill({ id:'p_shine', name:'闪耀', type:'support', target:'all', cooldown:4, charge:true,
  range:{ acc:[0, 50] },
  effects:[function(c,ts,r,ctx){ var acc=ctx.sv('acc')/100; ts.forEach(function(t){ t._accMod = (t._accMod || 0) - acc; t._hitModTurns = 2; }); r.events.push({msg:'✨ ' + (c.name||'宠物') + ' 闪耀：' + ts.map(function(t){return t.name;}).join('、') + ' 命中率 -' + Math.round(acc*100) + '%（2 回合）'}); }] });

/* R：打湿（目标更易被命中 + 魂防降低）—— v2.1.22 接区间：魂防 0~25%、命中 +0~30%
   v2.14.8 作者平衡调整（数值照抄）：**冷却 5 → 3**（区间与持续 2 回合不变）。 */
registerSkill({ id:'p_drench', name:'打湿', type:'support', target:'random1', cooldown:3,
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
   v2.2.18：**「自身承受 35% 反冲」已按作者裁决实装** —— `recoil: 0.35`。
     裁决（作者原话，见 §2.16-3 的追问回执「是」+ 本批追加裁决）：
       **反冲基数 = (a)「本次对目标造成的伤害」** → 反冲伤害 = 本次对目标**实际**造成的伤害 × 35%。
     ⚠️ 单/多目标口径：本技能 `target:'random1'` → 本次施放**只有 1 次命中**，
        故「本次对目标造成的伤害」就是那一次命中；`recoil` 的消费端
        （battle-group.js 的 castSkill）按「**逐目标实际伤害求和**」再乘比率实现 ——
        将来若有**多目标**技能带 recoil，口径就是「各目标伤害分别计算后相加」，不做静默改写。
   ⚠️ 是否过自身防御/减伤：文档未给 → 取**最保守**的「直接扣血、不再过减伤」，
         详见 battle-group.js 消费端的注释。
   v2.14.8 作者平衡调整（数值照抄）：**冷却 4 → 3**（蓄力 / 反冲 / 区间均不变）。 */
registerSkill({ id:'p_thundercharge', name:'雷霆冲撞', type:'attack', target:'random1', power:350, range:{power:[260,440]}, dmgType:'soul', cooldown:3,
  charge:true, condBonus:{ statuses:['wet','freeze'], value:0.25 }, recoil:0.35 });

/* SSR：双撞（最多 2 名敌人各 1 次 + 降攻防 + 窃取转移）
   WP-C（§2.8 评审「最多场上 2 名敌人，各 1 次攻击，降低其 0%-10% 攻击与 0%-20% 的防御，
   窃取数值给予我方随机 1 名角色。伤害：180%-270%」）：
     · 目标 random1 → **enemy2**（随机最多 2 名敌人，各结算 1 次）；
     · 伤害区间 [150,240] → **[180,270]**；
     · 降攻 / 降防幅度接区间（0~10% / 0~20%，随基础属性成长），落在实例 `pulled.modsPct`；
     · 窃取：把**同一次**降幅作为正面加成（stolen）转给我方随机 1 名角色 2 回合。
   （旧实现只有 armorbroken 每层 -10% 防御，既无降攻、也无窃取转移。）
   v2.14.8 作者平衡调整（数值照抄）：**冷却 5 → 4**（区间与窃取转移不变）。 */
registerSkill({ id:'p_doublehit', name:'双撞', type:'attack', target:'enemy2', power:200, range:{power:[180,270], atkDown:[0,10], defDown:[0,20]}, dmgType:'physical', cooldown:4,
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
       每次先掷阵营（**v2.14.8 起敌方概率恒 1 = 不再攻击友方**，见下方本版说明），
       再在该阵营未命中池里随机取 1 名；
       每次弹射伤害累计 +10%（本次施放内累加，下次发动重置）；该阵营无可打单位时退另一边，
       两者都空则该次「未发动」→ 按未发动次数 × 单次伤害为自身回血。
   v2.14.8 作者平衡调整（数值照抄）：
     · **不再攻击友方** —— `foeChance` 由「随成长 55%~82%」改为**恒 1**（我方阵营概率归零）；
       旧的「对友方弹射几率随等级降低（45%→18%）」口径**已删除**，不再是成长区间。
       **引擎侧同步收口**（skill.js 的 bounce 分支）：`foeChance ≥ 1` 时**取消跨阵营回落** ——
       敌方候选枯竭（弹射次数 > 敌方存活数）的剩余次数按「未发动」处理，转为自身回血，
       不会像改前那样回落到友军身上。故「不攻击友方」在任意阵容下恒成立。
     · **每次弹射使下次弹射伤害 +10%** —— 既有实现（`dmgUp:0.10` 累加），本轮只钉不改；
     · **冷却 5 → 4**。 */
registerSkill({ id:'p_dreamball', name:'梦幻光球', type:'attack', target:'random1', power:250, range:{power:[220,310]}, dmgType:'soul', cooldown:4,
  /* v2.14.17：自愈量 ×0.6（治疗 -40%），引擎 skill.js bounce.healScale 消费。 */
  charge:true, bounce:{ times:3, dmgUp:0.10, foeChance:[1,1], healScale:0.6 } });

/* UR：无影拳
   WP-C（§2.13 评审「总计 4 次攻击，每次 55%-100%，视为普通攻击，会触发普通攻击相关效果与判定」）：
     · multiHit 5 → **4**；单次伤害区间 [50,95] → **[55,100]**；
     · `asNormalAttack:true`（v2.3.0 作者裁决「**就按照普通攻击会如何触发就如何实现**」）：
       **真正走普攻通道** —— calcSkillDamage 只做目标抽取（`normalSlots`，随机可重复），
       每次命中交给 battle-group 的 `normalAttack(gb, actor, t, 伤害系数)` 结算：
       命中判定 / 威吓 / 利刃·多目标 / 暴击 / 格挡 / 圣光守护分担 / 护盾吸收 / 受击方天赋与状态钩子 /
       魂攻附伤 / onAfterDamage（嗜血 · 战意吸血）—— 与真普攻**逐条一致**。
       （v2.2.17 的实现只是在技能通道上补一个 onAfterDamage 派发，其余判定仍是技能通道 → 不符裁决。）
     · 吸血去重（§2.14 互斥裁决）：文档写明「每次视为普通攻击」→ 它**只触发普攻吸血**
       （状态 warmight 的 data.ls），**不**触发技能吸血（data.sls）。
   设计原文（design-v2.0.md:249）写「随机可重复」，故仍由 ctx.pool 随机取目标。
   v2.14.8 作者平衡调整（数值照抄）：**冷却 4 → 3**（4 段 / 55%~100% / 视为普攻均不变）。 */
registerSkill({ id:'p_shadowfist', name:'无影拳', type:'attack', target:'random1', power:70, range:{power:[55,100]}, multiHit:4, dmgType:'physical', cooldown:3, asNormalAttack:true,
  effects:[function(c,ts,r){ r.events.push({msg:'👊 ' + (c.name||'宠物') + ' 无影拳：4 连击（目标随机可重复）'}); }] });

/* UR：战意灌注
   WP-C（§2.14 评审「随机 2 名友方提升 3%-30%（攻击或者魂攻，较高一项），
   同时期间获得 5%-50% 吸血与 7.5%-32.5% 的技能吸血」）：
     · 目标 ally1 → **ally2**（随机 2 名友方）；
     · 增益只加**攻击/魂攻中较高的一项**（按目标单位属性选定 modsPct 的键）；
     · 附带吸血 / 技能吸血 —— 按 §6.3 裁决做成「**挂在持有者身上的增益**」（状态 warmight），
       与天赋「嗜血」**叠加**，并可按镜像结界的阵营 ±25% 缩放（缩放发生在 castSkill 落 buff 时）。
   技能吸血区间取评审给的口径 **7.5%~32.5%**（设计原文写 2.5%~25%，§2.16-5 已确认改用评审值）。
   v2.14.8 作者平衡调整（数值照抄）：
     · 攻击提升区间 **3%~30% → 150%~300%**。口径判定 =「**在现攻击上再 +150%~300%**」
       （落在 `modsPct`，effectiveStat = base ×(1+1.5) ~ ×(1+3.0)），**不是**乘 1.5~3.0 倍
       —— 依据是既有实现的口径：`atkup` 状态一直按 `modsPct` 的「百分比加成」语义结算，
       乘 1.5~3.0 倍会让 t=0 的 150% 写成 modsPct=0.5、与文本「提升 150%」自相矛盾。
     · CD 维持 4（规格「CD 4」）。
     v2.14.17 作者裁决：先制度 +1 改为**技能本身**（圣光麒麟施放本技能时先手），不再给被灌注的 2 名友方加先制。
       实现 = `priority:1` + 删 `priorityBonus`；引擎 predeclareActions 已扩展为我方也预声明
       （否则技能级 priority 对我方恒 0）。 */
registerSkill({ id:'p_warmight', name:'战意灌注', type:'support', target:'ally2', cooldown:4, priority:1,
  /* v2.14.17：吸血区间 5%~50% → 10%~100%（技能吸血 7.5%~32.5% 不变）。 */
  range:{ atkBoost:[150, 300], lifesteal:[10, 100], skillLifesteal:[7.5, 32.5] },
  effects:[function(c,ts,r,ctx){
    var v = ctx.sv('atkBoost')/100, ls = ctx.sv('lifesteal')/100, sls = ctx.sv('skillLifesteal')/100;
    ts.forEach(function(t){
      var atk = (t.base && t.base.atk) || 0, soul = (t.base && t.base.soulAtk) || 0;
      var key = soul > atk ? 'soulAtk' : 'atk';       // 较高一项
      var mods = {}; mods[key] = v;
      r.buffs.push({ unitId:t.id, key:'warmight', value:v, modsPct:mods, lifesteal:ls, skillLifesteal:sls, duration:2 });
    });
    r.events.push({ msg:'🔥 ' + (c.name||'宠物') + ' 战意灌注 → ' + ts.map(function(t){return t.name;}).join('、')
      + '：攻击/魂攻较高项 +' + Math.round(v*100) + '%、吸血 ' + Math.round(ls*100) + '% / 技能吸血 ' + Math.round(sls*100) + '%、先制度 +1（2 回合）' });
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

   ============================================================
   v2.14.8 作者平衡调整（数值照抄，本轮 3 条天赋 + 1 条新增）：
     · holy_guard     —— 自身受伤 -10% → **-20%**；>50% 血分担 20% → **25%**；
                         新增「每回合结束 40% 几率回复 最大生命×5%」。
     · immovable      —— 单档（>95%：免普通~高级 + 受伤 -50%）改为**三档**：
                         >90% 免普通~高级负面 + 受伤 -50% / >50% 免普通负面 + 受伤 -30% /
                         >10% 受伤 -20%。**取当前血量对应的那一档，互不叠加**。
     · pressure_field —— 敌方全体治疗由「-10%，>70% 血翻倍 -20%」改为**恒 -20%**；
                         新增「我方每次受到伤害 50% 几率使随机 1 名受伤友方回复最大生命×4%，
                         每回合最多 2 次」。
     · **新增 pig_snore**（彭彭猪，R）——「睡眠期间受到其他异常状态效果 -25%」。
       ⚠️ 这是一条**新天赋**：`PET_CODEX.pongpong.talents` 由 `[]` 改为 `['pig_snore']`。
       「R / SR 级无天赋」的历史描述从本版起有 1 个例外（彭彭猪）。
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

/* 彭彭猪：鼾睡（v2.14.8 作者平衡调整新增）—— 睡眠期间受到**其他**异常状态效果 -25%
   语义判定（见 v2.14.8 报告）：取「**状态效果数值（强度）**」这一维度。
   「持续时间更短」与「施加几率更低」两种读法**不采纳**：
     · 时长在 `castSkill` 的 `sa.duration` 上、几率在 `sa.chance` 上，二者都不是「效果 -25%」的意思；
     · 玩家能看见的「效果」是状态实际改了多少属性/伤害，这就是强度。
   落点：`onBeforeStatus` 返回 `statusAmp` mutation（倍率 0.75），由 battle-group 的 statusApps
   循环消费 —— 它对**两条载体**同时生效（v2.14.8 在 battle-group 补的消费端）：
     · 实例幅度 `modsPct`（打湿的魂防削减 / 双撞的降攻防 / 战意灌注的升幅…）；
     · 定义驱动幅度 `statModsPct`（破甲 / 遗言诅咒 / 弱化…）→ 走 applyStatus 的 `defScale`。
   ⚠️ 边界（如实登记）：二元 / 无幅度类异常（冰冻、畏缩、迷惑、睡眠本身…）没有「效果数值」可缩，
      天然 0 变化；不免疫、不改层数、不改判定。 */
registerTalent({ id:'pig_snore', name:'鼾睡', desc:'睡眠期间受到其他异常状态效果-25%', petOnly:true,
  hooks: {
    onBeforeStatus: function (unit, ctx) {
      if (!unit || !ctx || !ctx.statusId) return;
      /* 「其他」：睡眠本身不算（否则会把自己身上的睡眠也削掉） */
      if (ctx.statusId === 'sleep') return;
      /* 只在**睡眠中**生效 */
      if (typeof hasStatus !== 'function' || !hasStatus(unit, 'sleep')) return;
      /* 只作用于异常（负面）状态：增益不削 */
      if (typeof isPositiveStatus === 'function' && isPositiveStatus(ctx.statusId)) return;
      return { mutations: [{ key:'statusAmp', value:0.75 }] };
    }
  } });

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
     与「广域防御」「不动如山」同一条），无需新增派发点。
   v2.14.8 作者平衡调整（数值照抄）：
     · 自身受到伤害 **-10% → -20%**（`dmgTakenReduce 0.2`，仍无条件全程）；
     · 血量 >50% 时承担队友 **20% → 25%** 伤害（分担额 `floor(ctx.amount × 0.25)`，下限 1）；
     · **新增**：自身每回合结束 **40% 几率**回复**最大生命 ×5%**。
       落点 = `onTurnEnd`（battle-group 判定阶段的 talentDispatch，每回合一次、只对存活单位派发）；
       恢复量 `Math.floor(base.hp × 0.05)`（下限 1），**不超过最大生命**。 */
registerTalent({ id:'holy_guard', name:'圣光守护', desc:'血量>50%时承担队友25%伤害；自身受到伤害-20%；每回合结束40%几率回复最大生命5%', petOnly:true,
  hooks: {
    onAllyDamage: function (unit, ctx) {
      /* v2.14.8：`isSelf` = 「被击者就是自己」（battle-group 的 applyAllyDamageShare 为
         「我方每次受到伤害」这类后置天赋补发的自派发）。分担是**替队友挨**，自己挨打不分担。 */
      if (ctx.isSelf) return;
      if (unit.hp > unit.base.hp * 0.5 && ctx.amount > 0) {
        var share = Math.max(1, Math.floor(ctx.amount * 0.25));
        unit.hp = Math.max(0, unit.hp - share);
        return { mutations: [{ key:'damageShare', value: share }], events: [{ msg:'✨ 圣光守护: ' + unit.name + ' 分担 ' + share }] };
      }
    },
    onDamage: function () {
      return { mutations: [{ key:'dmgTakenReduce', value:0.2 }] };
    },
    onTurnEnd: function (unit) {
      if (!unit || unit.hp <= 0) return;
      if (battleRnd() >= 0.4) return;                       // 40% 几率
      var heal = Math.max(1, Math.floor((unit.base.hp || 0) * 0.05));
      var real = Math.min(heal, Math.max(0, unit.base.hp - unit.hp));
      if (real <= 0) return;                                // 满血不空放、不写日志
      unit.hp = Math.min(unit.base.hp, unit.hp + real);
      return { events: [{ type:'heal', unitId: unit.id, msg:'✨ 圣光守护: ' + unit.name + ' 回复 ' + real }] };
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

/* 梦幻：灵感涌动 —— 每回合开始随机 1 名友方魂攻 +20%（持续到本回合结束）
   v2.4.5（作者裁定 §10-2 推论 + 任务书核心诉求）：`onTurnStart` 归**准备阶段**结算
   —— 每回合一次、且在行动队列建立**之前**落地，从而覆盖本回合**所有**队友的行动窗口
   （改前挂点在该单位自己的 `groupUnitTurn` 里，只有比梦幻先出手的队友吃得到）。
   `phase:'prepare'` 是引擎侧 battle-group.js 的逐条分类标记；`onTurnEnd`（收尾还原）随
   天赋 onTurnEnd 一起在**判定阶段**派发。 */
registerTalent({ id:'inspiration', name:'灵感涌动', desc:'每回合开始随机友方魂攻+20%', petOnly:true, phase:'prepare',
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
        多个来源会按 (1-v) 连乘，属既有口径。
   v2.14.8 作者平衡调整（数值照抄）—— **单档改三档，取当前血量对应的那一档、互不叠加**：
     ① 血量 > 90%：免疫**普通~高级**负面（grade ≤ 2）＋ 受伤 **-50%**
     ② 血量 > 50%：免疫**普通**负面（grade ≤ 1）＋ 受伤 **-30%**
     ③ 血量 > 10%：受伤 **-20%**（不免负面）
     ④ 血量 ≤ 10%：无任何档（原样承伤、可被施加任意异常）
   互斥实现 = 三个 `if` 依次 return **单条** mutation（不是三条相加）。
   边界口径：严格大于（正好 90% / 50% / 10% 落到下一档）—— 与 v2.3.0 的「>95% 严格大于」同口径。
   ⚠️ 命中口径：免疫判定看的是**受击方当前血量**（`unit.hp / unit.base.hp`），
      不看「承伤后血量」；减伤与免疫在同一个 `onDamage` / `onBeforeStatus` 时点各自读一次。 */
/* v2.14.17 作者补充：每回合结束恢复最大生命 ×3%（与三档减伤独立，满血不空放）。
   落点 = 判定阶段 onTurnEnd（与圣光守护的每回合自愈同一派发点），只对自己生效。 */
registerTalent({ id:'immovable', name:'不动如山', desc:'血量>90%免疫普通~高级负面且受伤-50%；>50%免疫普通负面且受伤-30%；>10%受伤-20%；每回合恢复最大生命3%', petOnly:true,
  hooks: {
    onTurnEnd: function (unit) {
      if (!unit || unit.hp <= 0) return;
      var heal = Math.max(1, Math.floor((unit.base && unit.base.hp || 0) * 0.03));
      var real = Math.min(heal, Math.max(0, (unit.base && unit.base.hp || 0) - unit.hp));
      if (real <= 0) return;
      unit.hp = Math.min(unit.base.hp, unit.hp + real);
      return { events: [{ type:'heal', unitId:unit.id, msg:'🛡️ 不动如山: ' + (unit.name||'单位') + ' 回复 ' + real }] };
    },
    onBeforeStatus: function (unit, ctx) {
      var ratio = (unit.base && unit.base.hp) ? (unit.hp / unit.base.hp) : 0;
      var grade = ctx.grade || 1;
      /* 规格写的是「免疫**负面**」：增益/中性状态不该被挡。
         （旧实现没这道闸 → 高血线的圣光麒麟连队友给的「攻击提升」都免疫了，
           属 v2.5 之前的实现缺口，本版一并按规格收口。） */
      if (typeof isPositiveStatus === 'function' && isPositiveStatus(ctx.statusId)) return;
      if (ratio > 0.90 && grade <= 2) {
        return { skipAction:true, events: [{ msg:'🛡️ 不动如山: ' + unit.name + ' 免疫' + (ctx.statusId || '负面') }] };
      }
      if (ratio > 0.50 && grade <= 1) {
        return { skipAction:true, events: [{ msg:'🛡️ 不动如山: ' + unit.name + ' 免疫' + (ctx.statusId || '负面') }] };
      }
    },
    onDamage: function (unit) {
      var ratio = (unit.base && unit.base.hp) ? (unit.hp / unit.base.hp) : 0;
      if (ratio > 0.90) return { mutations: [{ key:'dmgTakenReduce', value:0.5 }] };
      if (ratio > 0.50) return { mutations: [{ key:'dmgTakenReduce', value:0.3 }] };
      if (ratio > 0.10) return { mutations: [{ key:'dmgTakenReduce', value:0.2 }] };
    }
  } });

/* 圣光麒麟：威压领域 —— 敌方全体治疗效果 -20%；我方每次受到技能伤害 50% 几率回血
   v2.3.0 WP-D（§3.10 评审「降低敌方全体受到的10%治疗效果，如果自身生命值高于70%则这个天赋
     效果变为2倍」）：原实现为「血量>75% 时 -20%，否则完全不生效」——
     现在改为**无条件 -10%**，仅在高血线（>70%）时翻倍。
     消费端仍是 battle-group.js 的 talentAura(foes, 'onFoeHeal') → healReduce。
   v2.14.8 作者平衡调整（数值照抄）：
     ① 敌方全体治疗 **恒 -20%**（不再是 -10%/-20% 两档，血线条件删除）；
     ② **新增**：我方每次受到**技能伤害**，**50% 几率**使我方**随机 1 名受伤友方**
        回复**最大生命 ×4%**，**每回合最多触发 2 次**。
        落点 = `onAllyDamage`（battle-group 的 `applyAllyDamageShare` 派发 —— 普攻与技能两条通道
        都走这里；ctx 现在带 `isSkill` 与 `isSelf`，见该函数注释）。
        · 「技能伤害」口径：`ctx.isSkill === false`（普攻通道）直接返回 —— **只有技能伤害触发**；
        · 「我方」含持有者自己：引擎对**被击者本人**也会补发一次 `onAllyDamage`（`isSelf:true`），
          故持有者自己挨技能打同样会掷骰（旧实现只有 mates，少了自己这一份）。
        计数：`unit._pfHealCount`，每次成功回复 +1，`onTurnEnd` 清零（= 每回合最多 2 次）。
        随机池：`unit._pfMates`（`onBattleStart` 缓存的**同阵营单位表，活引用**），
        筛 `hp>0 && hp<base.hp`（受伤友方）。 */
registerTalent({ id:'pressure_field', name:'威压领域', desc:'敌方全体治疗-20%；我方每次受到技能伤害50%几率使随机1名受伤友方回复最大生命4%（每回合最多2次）', petOnly:true,
  hooks: {
    onFoeHeal: function () {
      return { mutations: [{ key:'healReduce', value: 0.2 }] };
    },
    onBattleStart: function (unit, ctx) {
      if (unit && ctx && ctx.allyUnits) unit._pfMates = ctx.allyUnits;   // 活引用：战中被创建/阵亡都能看到
    },
    onTurnEnd: function (unit) {
      if (unit) unit._pfHealCount = 0;
    },
    onAllyDamage: function (unit, ctx) {
      if (!unit || unit.hp <= 0) return;
      /* 「受到**技能**伤害」：普攻通道（isSkill:false）不触发 */
      if (ctx && ctx.isSkill === false) return;
      if (ctx && !(ctx.amount > 0)) return;                    // 0 伤害不掷骰
      if (typeof unit._pfHealCount !== 'number') unit._pfHealCount = 0;
      if (unit._pfHealCount >= 2) return;                     // 每回合最多 2 次
      var pool = (unit._pfMates || []).filter(function (u) {
        return u && u.hp > 0 && u.base && u.hp < u.base.hp;    // 受伤友方
      });
      if (!pool.length) return;
      if (battleRnd() >= 0.5) return;                          // 50% 几率
      var pick = pool[Math.floor(battleRnd() * pool.length)];
      var heal = Math.max(1, Math.floor((pick.base.hp || 0) * 0.04));
      var real = Math.min(heal, Math.max(0, pick.base.hp - pick.hp));
      if (real <= 0) return;
      pick.hp = Math.min(pick.base.hp, pick.hp + real);
      unit._pfHealCount++;
      return { events: [{ type:'heal', unitId: pick.id, msg:'🕊️ 威压领域: ' + pick.name + ' 回复 ' + real }] };
    }
  } });

/* ============================================================
   v2.14.17 新增 6 条宠物天赋（R/SR 补齐，作者规格逐字实现）
   ⚠️ 全部 petOnly:true（固有专属，不给敌人抽到）；数值一律走 talentConfig，
      hook 里不写死字面量（守卫 test-talent-fixation.js）。
   ============================================================ */

/* 水水滴：雨天疾行 —— 雨天（gb.terrain.id==='rain'）时速度 ×2。
   `phase:'prepare'` → onTurnStart 在准备阶段派发（ctx 由 runPhasePrepare 补 terrain 字段），
   onTurnEnd 还原 base.spd（灵感涌动同一口径），避免永久翻倍。 */
registerTalent({ id:'rain_sprint', name:'雨中疾行', desc:'雨天时速度×2', petOnly:true, phase:'prepare',
  config: { mult: 2 },
  hooks: {
    onTurnStart: function (unit, ctx) {
      if (!unit || !ctx || !ctx.terrain || ctx.terrain.id !== 'rain') return;
      if (unit._rainSprintOn) return;                          // 幂等：同回合重复派发不重复乘
      var mult = talentConfig('rain_sprint', 'mult', 2);
      unit._rainSprintOrig = unit.base.spd || 0;
      unit.base.spd = Math.floor(unit._rainSprintOrig * mult);
      unit._rainSprintOn = true;
      return { events: [{ msg:'🌧️ 雨中疾行: ' + (unit.name||'单位') + ' 速度 ×' + mult }] };
    },
    onTurnEnd: function (unit) {
      if (!unit || !unit._rainSprintOn) return;
      unit.base.spd = unit._rainSprintOrig || 0;
      unit._rainSprintOn = false;
    }
  } });

/* 闪闪星：星芒庇护 —— 受到伤害 40% 几率 -25%。
   落 onDamage（受击方通道）：mutation `dmgTakenReduce` 由 battle-group 消费（×(1-v)）。 */
registerTalent({ id:'sparkle_guard', name:'星芒庇护', desc:'受到伤害40%几率-25%', petOnly:true,
  config: { chance: 0.4, reduce: 0.25 },
  hooks: {
    onDamage: function (unit, ctx) {
      if (!ctx || ctx.isPlayerAttack) return;                  // 只在受击方派发时触发
      if (!(ctx.amount > 0)) return;
      var chance = talentConfig('sparkle_guard', 'chance', 0.4);
      if (battleRnd() >= chance) return;
      var reduce = talentConfig('sparkle_guard', 'reduce', 0.25);
      return { mutations: [{ key:'dmgTakenReduce', value:reduce }],
        events: [{ msg:'✨ 星芒庇护: ' + (unit.name||'单位') + ' 减伤 ' + Math.round(reduce*100) + '%' }] };
    }
  } });

/* 火焰鸡：斗志昂扬 —— 每次攻击 / 受到攻击 25% 几率 +1 速度，直到战斗结束（永久、不还原）。
   攻击侧走 onAfterDamage，受击侧走 onDamage（ctx.isPlayerAttack 真 = 攻击方派发，这里只取受击通道）。 */
registerTalent({ id:'flame_spirit', name:'斗志昂扬', desc:'攻击/受击25%几率速度+1（本场永久）', petOnly:true,
  config: { chance: 0.25, amount: 1 },
  hooks: {
    onAfterDamage: function (unit) {
      if (!unit || unit.hp <= 0) return;
      if (battleRnd() >= talentConfig('flame_spirit', 'chance', 0.25)) return;
      var n = talentConfig('flame_spirit', 'amount', 1);
      unit.base.spd = (unit.base.spd || 0) + n;
      return { events: [{ msg:'🔥 斗志昂扬: ' + (unit.name||'单位') + ' 速度 +' + n }] };
    },
    onDamage: function (unit, ctx) {
      if (!unit || unit.hp <= 0) return;
      if (!ctx || ctx.isPlayerAttack) return;
      if (!(ctx.amount > 0)) return;
      if (battleRnd() >= talentConfig('flame_spirit', 'chance', 0.25)) return;
      var n = talentConfig('flame_spirit', 'amount', 1);
      unit.base.spd = (unit.base.spd || 0) + n;
      return { events: [{ msg:'🔥 斗志昂扬: ' + (unit.name||'单位') + ' 速度 +' + n }] };
    }
  } });

/* 坚强岩：磐石反噬 —— 受到攻击给予攻击者 (自身def+自身soulDef)×10% 反弹伤害。
   ⚠️ 作者裁决：不按敌人防御/魂防做减法（定值），但敌人的减伤天赋/护盾/格挡仍生效。
   落新 mutation `reflectMitigated`，消费端见 battle-group.js 的普攻/技能两条受击通道。 */
registerTalent({ id:'stone_thorns', name:'磐石反噬', desc:'受击反弹(def+魂防合计)×10%，无视敌人防御但可被减免', petOnly:true,
  config: { pct: 0.10 },
  hooks: {
    onDamage: function (unit, ctx) {
      if (!unit || unit.hp <= 0) return;
      if (!ctx || ctx.isPlayerAttack) return;
      if (!(ctx.amount > 0)) return;
      if (!ctx.attacker || ctx.attacker.hp <= 0) return;
      var pct = talentConfig('stone_thorns', 'pct', 0.10);
      var val = Math.max(1, Math.floor(((unit.base && unit.base.def || 0) + (unit.base && unit.base.soulDef || 0)) * pct));
      return { mutations: [{ key:'reflectMitigated', value:val, attacker:ctx.attacker }],
        events: [{ msg:'🪨 磐石反噬: 反弹 ' + val + '  damage' }] };
    }
  } });

/* 清脆鸟：共鸣之歌 —— 我方任一单位施放技能时，自身恢复 2% 最大生命。
   落新 hook `onAllyCastSkill`（castSkill 成功施放后对我方全员派发）。 */
registerTalent({ id:'chirp_sustain', name:'共鸣之歌', desc:'我方任一单位发动技能时，自身恢复2%最大生命', petOnly:true,
  config: { pct: 0.02 },
  hooks: {
    onAllyCastSkill: function (unit) {
      if (!unit || unit.hp <= 0 || !unit.base) return;
      var heal = Math.max(1, Math.floor((unit.base.hp || 0) * talentConfig('chirp_sustain', 'pct', 0.02)));
      var real = Math.min(heal, Math.max(0, unit.base.hp - unit.hp));
      if (real <= 0) return;
      unit.hp = Math.min(unit.base.hp, unit.hp + real);
      return { events: [{ type:'heal', unitId:unit.id, msg:'🎵 共鸣之歌: ' + (unit.name||'单位') + ' 回复 ' + real }] };
    }
  } });

/* 雷霆犬：雷鸣加速 —— 我方任一单位施放技能时 20% 几率使**自身**技能冷却 -1 回合。
   ⚠️ 作者裁决：只对持有者自己的技能生效；直接改 unit.counters.cd（不通过 mutation 跨单位误伤）。 */
registerTalent({ id:'thunder_haste', name:'雷鸣加速', desc:'我方任一单位发动技能时20%几率自身技能冷却-1', petOnly:true,
  config: { chance: 0.20 },
  hooks: {
    onAllyCastSkill: function (unit) {
      if (!unit || unit.hp <= 0) return;
      if (battleRnd() >= talentConfig('thunder_haste', 'chance', 0.20)) return;
      var cd = unit.counters && unit.counters.cd;
      if (!cd) return;
      var hit = false;
      for (var k in cd) { if (cd[k] > 0) { cd[k]--; hit = true; } }
      if (!hit) return;
      return { events: [{ msg:'⚡ 雷鸣加速: ' + (unit.name||'单位') + ' 技能冷却 -1' }] };
    }
  } });

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

;
/* ===== pet-ui.js ===== */
/* ============================================
   MyHealth — Pet UI (M4-6)
   宠物面板：列表/喂食/炼化/参战选择。
   入口：挑战页（敌群试炼旁）。
   依赖 pet-store.js / pets.js / pet-materials.js / pet-codex.js。
   ============================================ */

/* ============ v2.2.29 宠物头像图标（page/media/pets/<speciesId>.svg） ============
   14 只宠物各有一枚 48×48 像素风 SVG（设计规格与逐只提示词见 doc/design-pet-icons.md）。
   本区块是**图标渲染的唯一入口** —— 任何需要显示宠物头像的地方都走 petIconHtml()，
   不要在别处硬拼 <img> 路径：换目录 / 换格式 / 换尺寸时只改这里。
   ⚠️ 路径相对 page/（与 utils.js 的 exMediaUrl `'media/' + rel` 同一约定）——
      index.html 就挂在 page/ 下，而 page/ 即 Vercel 部署根。
   ⚠️ **缺图标时返回空串**，由调用方各自兜底回原来的 emoji —— 不抛错、不显示裂图，
      也不会因为某个 speciesId 没有对应文件就把整张卡片搞崩。 */
var PET_ICON_DIR = 'media/pets/';
function petIconUrl(speciesId) {
  if (!speciesId) return null;
  if (typeof PET_CODEX === 'undefined' || !PET_CODEX[speciesId]) return null;
  return PET_ICON_DIR + speciesId + '.svg';
}
/* 头像 <img>；size = 显示边长(px)；缺图标返回 ''。
   ⚠️ `alt=""`（空）是**故意的**：所有接入点头像都紧邻可见的宠物名
      （卡片 `.pet-card-name` / 详情标题 / 芯片文字），属**装饰性图像**。
      若写成 alt="闪闪星"，读屏会念两遍「闪闪星 闪闪星 SSR」。
      将来若做「只有图标没有名字」的图鉴网格或分享卡，那里要单独给
      `role="img" aria-label="闪闪星"`，不要改这里。
   ⚠️ `size` **必须是 16 的倍数**（推荐 32 / 48）：图标是 16×16 逻辑网格、
      1 格 = 3px，48px 显示时 1 格 = 3px。取 32 → 每格 2px（干净）；
      取 40 → 每格 2.5px，crispEdges 会把格宽硬切成 2 或 3px **粗细不均**；
      取 24 → 每格 1.5px，跳动更明显。 */
function petIconHtml(speciesId, size, cls) {
  var url = petIconUrl(speciesId);
  if (!url) return '';
  return '<img class="pet-ico' + (cls ? ' ' + cls : '') + '" src="' + url + '"'
    + ' width="' + size + '" height="' + size + '" alt=""'
    + ' loading="lazy" decoding="async">';
}
/* 列表卡片头像：无图标时退回该阶段的 emoji（= 接入前的行为）。
   ⚠️ v2.2.30：**不再叠加阶段角标** —— 角标（🥚/🌱）会压住头像右下角
      （评审 7-4：`sparkle` 的星角被盖住），而阶段信息在卡片正文行
      （「孵化 40% / 成长 30% / 成熟」）与进度条里已经完整表达，角标属重复信息。
      「无图标 → 退回 emoji」这条降级语义保留。 */
function petIconStageHtml(speciesId, size, stage) {
  return petIconHtml(speciesId, size) || (stage === 'egg' ? '🥚' : stage === 'grow' ? '🌱' : '🐾');
}


/* ============ v2.15 宝珠 UI ============
   v2.1.17 首次接线（库存 / 分解 / 5 槽装配升级）；v2.2 取消合成、改挑战掉落；
   **v2.15 恢复合成并改口径**：分解返还 = 加成百分点数（R·Lv1 = 10 碎片），
   20 碎片可随机合成 1 颗 R·Lv1（100% 成功 / 每日 5 次），并给 5 种宝珠配像素图标。
   ⚠️ 数值一律来自 orbs.js（orbPct / orbDecomposeShards / orbSynthStatus），本文件不写死。 */

/* 宝珠图标唯一入口：page/media/orbs/<type>.svg（48×48 像素风，与宠物/技能图标同规格）。
   缺图标时回退 🔮 —— 不抛错、不显示裂图；调用方不必各自兜底。 */
var ORB_ICON_DIR = 'media/orbs/';
function orbIconUrl(type) {
  if (!type || typeof ORB_TYPES === 'undefined' || !ORB_TYPES[type]) return null;
  return ORB_ICON_DIR + type + '.svg';
}
function orbIconHtml(type, size) {
  var url = orbIconUrl(type);
  if (!url) return '🔮';
  return '<img class="orb-ico" src="' + url + '" width="' + size + '" height="' + size + '" alt=""'
    + ' loading="lazy" decoding="async">';
}

/* 主面板：合成（常显）+ 库存（默认折叠 —— 打多了挑战会有几十颗，是面板最长的区块） */
function orbBagHtml(d) {
  if (typeof ORB_TYPES === 'undefined') return '';
  var today = (typeof dateKey === 'function') ? dateKey(new Date()) : '';
  var st = (typeof orbSynthStatus === 'function')
    ? orbSynthStatus(d, today)
    : { count: 0, limit: 5, cost: 20, shards: 0, canSynth: false, reason: '宝珠模块未加载' };
  var sh = (d.materials || {}).orbShard || 0;
  var bag = d.orbs || [];
  var h = '<div class="orb-bag">'
    + '<div class="orb-bag-hd">💎 宝珠 <span class="orb-bag-meta">碎片 <b>' + sh + '</b> · 库存 '
    + bag.length + ' 颗 · 今日合成 ' + st.count + '/' + st.limit + '</span></div>'
    + '<button class="speed-btn orb-synth-btn" type="button" data-orb-synth="1"'
    + (st.canSynth ? '' : ' disabled aria-disabled="true"')
    + ' title="' + (st.reason || ('消耗 ' + st.cost + ' 碎片，随机合成 1 颗 R·Lv1 宝珠（100% 成功）')) + '">'
    + '🔨 合成 ' + st.cost + '💎 → R·Lv1 随机宝珠（' + st.count + '/' + st.limit + '）</button>'
    /* ⚠️ 用独立的合成原因样式类，不复用互兑原因行那个类：
       scripts/test-pet-exchange-list.js 有一条「两个方向都能换时不出原因行」的
       全局断言（按类名检索整个面板 HTML）—— 复用会把它误判成互兑的禁用原因。 */
    + (st.reason ? '<div class="orb-synth-hint" role="note">' + st.reason + '</div>' : '');
  if (!bag.length) {
    h += '<div class="orb-bag-empty">库存空 —— 通关隐藏挑战掉落，或用碎片合成</div>';
  } else {
    h += '<details class="orb-stock"><summary>📦 库存 ' + bag.length + ' 颗（点开分解）</summary><div class="orb-stock-body">';
    bag.forEach(function (o) {
      var ot = ORB_TYPES[o.type] || { name: o.type };
      var val = (typeof orbPct === 'function') ? orbPct(o) : 0;
      var back = (typeof orbDecomposeShards === 'function') ? orbDecomposeShards(o) : 0;
      h += '<div class="orb-bag-item">'
        + orbIconHtml(o.type, 32)
        + '<div class="orb-bag-info">' + ot.name + ' <span class="orb-q">' + o.rarity + '</span> Lv'
        + (o.level || 1) + ' <span class="orb-pct">+' + val + '%</span></div>'
        + '<button class="speed-btn tx-btn-sm" data-orb-bag="' + o.id + '">♻️ +' + back + '</button>'
        + '</div>';
    });
    h += '</div></details>';
  }
  h += '</div>';
  return h;
}

/* 宠物详情：5 个槽位（v2.15：每槽前置宝珠图标，空槽也显示 —— 类型一眼可辨） */
function orbSlotsHtml(pet, d) {
  if (typeof ORB_TYPES === 'undefined') return '';
  var sh = (d.materials || {}).orbShard || 0;
  var h = '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">';
  h += '<div style="font-weight:700;margin-bottom:4px">💎 宝珠 <span class="tx-dim-soft">（每类型 1 颗 · 碎片 <b>' + sh + '</b>）</span></div>';
  var eq = pet.orbs || {};
  /* WP-I A-5-5：5 槽全空、且库存也为空时，原来逐条渲染「（空）/ 无库存」共 5 行 ≈180px 零信息，
     折叠成一行文案即可；只要任一类已装配、或库存里有货，就仍逐条展开（装配/升级/卸下）。 */
  var orbTypes = Object.keys(ORB_TYPES);
  var anyEquipped = orbTypes.some(function (t) { return !!eq[t]; });
  if (!anyEquipped && !(d.orbs || []).length) {
    h += '<div class="tx-dim">' + orbTypes.length + ' 槽均空 · 通关隐藏挑战掉落宝珠，装配到宠物身上生效</div>';
  } else {
  orbTypes.forEach(function (t) {
    var ot = ORB_TYPES[t], o = eq[t];
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0">';
    /* 32px：图标是 16×16 网格 / 48px 基准，32 → 每格 2px 干净；
       24px 不是 16 的倍数（1.5px/格），crispEdges 会把格宽硬切成 1/2px 粗细不均。 */
    h += orbIconHtml(t, 32);
    if (o) {
      var val = (typeof orbPct === 'function') ? orbPct(o) : 0;
      /* v2.2：等级上限与「满级升品质」都看 ORB_QUALITY_SPEC（旧 ORB_TYPES.maxLv 已删） */
      var spec = ((typeof ORB_QUALITY_SPEC !== 'undefined' && ORB_QUALITY_SPEC[o.rarity]) || { maxLv: 10, next: null });
      var maxed = !spec.next && (o.level || 1) >= spec.maxLv;
      var cost = (typeof orbUpgradeCost === 'function') ? orbUpgradeCost(o) : 0;
      h += '<div style="flex:1">' + ot.name + ' <span style="color:var(--purple,#a855f7)">' + o.rarity + '</span> Lv' + (o.level || 1) + ' <span class="tx-ok">+' + val + '%</span>'
        + (spec.next ? ' <span class="tx-dim">（' + spec.maxLv + ' 级 → ' + spec.next + '）</span>' : '') + '</div>';
      h += maxed
        ? '<span style="color:var(--green);font-size:var(--fs-2xs)">满级</span>'
        : '<button class="speed-btn tx-btn-sm" data-orb-op="upgrade" data-orb-type="' + t + '" data-pet-idx="__IDX__">⬆' + cost + '💎</button>';
      h += '<button class="speed-btn tx-btn-sm" data-orb-op="unequip" data-orb-type="' + t + '" data-pet-idx="__IDX__">卸下</button>';
    } else {
      var stock = (d.orbs || []).filter(function (x) { return x.type === t; });
      h += '<div style="flex:1;color:var(--text3)">' + ot.name + '（空）</div>';
      h += stock.length
        ? '<button class="speed-btn" data-orb-op="equip" data-orb-id="' + stock[0].id + '" data-pet-idx="__IDX__" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm);border-color:var(--green);color:var(--green)">装配 ' + stock[0].rarity + '</button>'
        : '<span class="tx-sub">无库存</span>';
    }
    h += '</div>';
  });
  }
  h += '</div>';
  return h;
}

/* ============================================================
   v2.3 WP-I：宠物面板版式整改（作者原话：「一键治疗、选择参战宠物要重新布局，
   结算按钮没有用就隐藏，有用再显示」）

   改前：一键治疗挤在材料数字行里，与「🔄 兑换 10→1」抢同一行宽度；
         「选择参战宠物」贴在宠物列表**最底部**（真机 5 只宠要滚 2 屏才看得到，附录 A-3）。
   改后（面板自上而下的信息顺序）：
     ① 参战阵容（芯片 + 开战按钮）→ **顶部摘要**，打开面板即见当前阵容、就地切换；
     ② 材料区（数字独占一行）→ 按钮组另起一行，**一键治疗全宽独占一行**（大按钮）；
     ③ 💎 宝珠 → ④ 宠物卡列表（顺序不变）。

   ⚠️ 结算按钮：**条件渲染**，判据来自 pet-store.js 的 `petSettleStatus()`
      （逐条镜像 settlePet 的实际分支；不可用时整块不渲染，而不是灰掉——按钮没有
       disabled 语义就先别出现）。
   ⚠️ 只重排 + 改尺寸所在区块的骨架：所有数值/口径仍全部来自 pet-store.js，
      热区一律 ≥ --touch-min(44px)，不新字号、不新颜色（样式见 index.css 的 .pet-lineup/.pet-mat）。 */

/* v2.15：宠物行「⋯」展开状态（**模块级 UI 状态，不进存档**，与 _petSrcOpen 同类做法）。
   同一时刻只展开一行：8 只宠一起展开会让列表重新变长，与「缩短列表」的目标相反。 */
var _petRowOpen = null;

/* ============================================================
   v2.14.13：**今日宠物经验明细**（作者：「宠物经验获得也要记录」）

   数据只来自 pet-store.js 的 `petLevelExpLog()` —— 也就是 `pets.levelLedger.log`
   里 `date === 今天` 的发放记录。本函数**只读不写**，绝不参与发放判断：
   同一笔经验在发放那一刻就把「来源 / 总量 / 实发 / 丢弃 / 每只分到多少」写进账本，
   这里只是把它排版出来（所以不会出现「面板多开一次就多记一笔」）。
   形态：原生 <details>/<summary> —— 默认折叠、Tab 可达、Enter/Space 展开（不手写 aria-expanded）。
   ============================================================ */
function petExpEsc(s) {
  var v = (s == null) ? '' : String(s);
  if (typeof escHtml === 'function') return escHtml(v);
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 一条 breakdown 的来源文案（数字全部来自账本，不在这里另算） */
function petExpSrcLine(b) {
  if (!b || typeof b !== 'object') return '';
  var exp = (typeof b.exp === 'number') ? b.exp : 0;
  if (b.source === 'strength') return '💪 力量 ' + (b.kg || 0) + 'kg × 5 → ' + exp + ' EXP';
  if (b.source === 'cardio') return '🏃 有氧 ' + (b.min || 0) + 'min × 20 → ' + exp + ' EXP';
  if (b.source === 'challenge') return '⚔️ 挑战伤害 ' + (b.dmg || 0) + ' × 1% → ' + exp + ' EXP';
  return '🔖 其它（口径差额）→ ' + exp + ' EXP';
}

function petExpLogHtml(now) {
  var info = (typeof petLevelExpLog === 'function')
    ? petLevelExpLog(now)
    : { dayKey: '', entries: [], total: 0, granted: 0, dropped: 0 };
  var h = '<details class="pet-exp-log">'
    + '<summary class="pet-exp-log-sum">'
    +   '<span>📒 宠物经验明细</span>'
    +   '<b class="pet-exp-log-total">今日合计 +' + (info.granted || 0) + ' EXP</b>'
    +   '<span class="pet-exp-log-note">' + (info.entries.length ? (info.entries.length + ' 笔') : '今日暂无') + '</span>'
    + '</summary>'
    + '<div class="pet-exp-log-body">'
  if (!info.entries.length) {
    h += '<div class="pet-exp-log-empty">今天还没有发放记录 —— 力量训练（kg×5）、有氧训练（min×20）、'
      + '隐藏挑战（伤害×1%）任意一项产生增量后，这里会写一笔。</div>'
  } else {
    info.entries.forEach(function (e) {
      var src = e.source === 'challenge' ? '⚔️ 挑战加成' : (e.source === 'daily' ? '💪 今日训练' : '🔖 ' + (e.source || '未知来源'));
      h += '<div class="pet-exp-log-item">'
        + '<div class="pet-exp-log-hd"><b>' + src + '</b>'
        +   '<span class="pet-exp-log-num">总量 ' + (e.total || 0) + ' · 实发 ' + (e.granted || 0) + ' · 丢弃 ' + (e.dropped || 0) + '</span></div>'
      var bd = Array.isArray(e.breakdown) ? e.breakdown : [];
      if (bd.length) {
        h += '<div class="pet-exp-log-src">' + bd.map(function (b) { return petExpSrcLine(b); }).join(' · ') + '</div>';
      }
      var al = Array.isArray(e.allocations) ? e.allocations : [];
      h += '<div class="pet-exp-log-alloc">'
        + (al.length
            ? al.map(function (a) {
                var lv = (a.from != null && a.to != null && a.to !== a.from) ? ('（Lv' + a.from + '→' + a.to + '）') : '';
                return petExpEsc(a.name || a.speciesId) + ' +' + (a.amount || 0) + lv;
              }).join(' · ')
            : '<span class="pet-exp-log-none">没有可吃经验的成熟期宠物（满级 / 受伤 / 未成熟不计）</span>')
        + '</div>'
        + '</div>';
    })
    h += '<div class="pet-exp-log-foot">今日合计：总量 ' + (info.total || 0)
      + ' · 实发 ' + (info.granted || 0) + ' · 丢弃 ' + (info.dropped || 0) + ' EXP</div>';
  }
  h += '</div></details>';
  return h;
}

/* ============================================================
   v2.18（阶段 A）：**编队管理**区块（多小队）
   设计定稿：`doc/design-pet-squad-battle-v1.md` §2 / Q1–Q2（v1.2）
   · 本函数**只拼 HTML**：所有读写都走 pet-store.js 的
     `getPetSquads / addPetSquad / removePetSquad / renamePetSquad / movePetSquad /
      togglePetSquadPet`（唯一入口），这里不碰存档、不写任何常量数字。
   · 第 1 队 = **首发**（= 上方「参战阵容」芯片 = 开战阵容）；顺序即替补顺序。
   · Q1：同一宠物不能出现在两个小队（跨队互斥在 pet-store 的 toggle 里判，这里只显示原因）。
   · 伤员 / 阵亡者**留在队里**但不可出战（canPetBattle 在建单位时过滤），所以在队芯片上加 ⚠️ 与原因。
   · 展开状态是纯 UI 态（`_petSquadsOpen`），重渲染后保留；不进存档。
   ============================================================ */
var _petSquadsOpen = false;

function petSquadEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 面板里编队区块的 HTML（ready = 成熟 + 未阵亡的宠物列表，与上方芯片同源） */
function petSquadPanelHtml(ready) {
  if (typeof getPetSquads !== 'function') return '';
  var squads = getPetSquads();
  if (!squads.length) return '';
  var max = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4;
  var nameMax = (typeof PET_SQUAD_NAME_MAX === 'number') ? PET_SQUAD_NAME_MAX : 8;
  var injuredOf = function (sid) {
    var p = ready.filter(function (x) { return x.speciesId === sid; })[0];
    return !!(p && p.injured);
  };
  var h = '<details class="pet-squads" id="petSquadDetails"' + (_petSquadsOpen ? ' open' : '') + '>'
    + '<summary>🐾 编队管理 <span class="pet-squads-hint">'
    + squads.length + ' 队 · 首发在第一队 · 点开编辑</span></summary>'
    + '<div class="pet-squads-body">';
  squads.forEach(function (sq, i) {
    var injuredN = sq.petIds.filter(injuredOf).length;
    /* v2.14.24：**跨队占用标记** —— 本队之外的队伍里已经有的宠物，逐个标出「在·X队」并置灰，
       不用点了才报错（同一宠物只能出现在一支小队，pet-store 的 toggle 是唯一判据）。 */
    var taken = {};
    squads.forEach(function (other, j) {
      if (other.id === sq.id) return;
      other.petIds.forEach(function (pid) { taken[pid] = other.name || ('第' + (j + 1) + '队'); });
    });
    var freeN = 0;
    var chips = '';
    ready.forEach(function (p) {
      var sel = sq.petIds.indexOf(p.speciesId) > -1;
      var inj = !!p.injured;
      var host = (!sel && taken[p.speciesId]) ? taken[p.speciesId] : '';
      if (!sel && !host) freeN++;
      var nm = ((typeof getPetCodex === 'function' && (getPetCodex(p.speciesId) || {}).name) || p.name || p.speciesId);
      var tip = sel ? '再点一次＝移出本队'
        : host ? ('已编在「' + host + '」：同一宠物只能在一支小队，先从那队移出')
        : inj ? '受伤中：留在队里，但本场不会上场（先用营养液治疗）'
        : '点一下＝编入本队';
      chips += '<button class="speed-btn pet-squad-chip' + (sel ? ' is-sel' : '') + (host ? ' is-taken' : '') + '"'
        + ' type="button" data-squad-pick="' + sq.id + '|' + p.speciesId + '"'
        + ' aria-pressed="' + (sel ? 'true' : 'false') + '"'
        + (host ? ' disabled aria-disabled="true"' : '')
        + ' title="' + petSquadEsc(tip) + '">'
        + (sel ? '<span class="pet-squad-chip-mark" aria-hidden="true">✓</span>' : '')
        + ((typeof petIconHtml === 'function') ? petIconHtml(p.speciesId, 16) : '🐾')
        + '<span class="pet-squad-chip-name">' + petSquadEsc(nm) + (inj ? ' ⚠️' : '') + '</span>'
        + (host ? '<span class="pet-squad-chip-tag">在 ' + petSquadEsc(host) + '</span>' : '')
        + '</button>';
    });
    h += '<div class="pet-squad-card">'
      + '<div class="pet-squad-hd">'
      + '<span class="pet-squad-badge' + (i === 0 ? ' is-first' : '') + '">'
      + (i === 0 ? '首发' : '第 ' + (i + 1) + ' 队') + '</span>'
      + '<input class="pet-squad-name" type="text" data-squad-name="' + sq.id + '"'
      + ' value="' + petSquadEsc(sq.name) + '" maxlength="' + nameMax + '"'
      + ' aria-label="「' + petSquadEsc(sq.name) + '」名称（最多 ' + nameMax + ' 个字）">'
      + '<span class="pet-squad-count">' + sq.petIds.length + '/' + max + '</span>'
      + '</div>'
      + '<div class="pet-squad-ops">'
      + '<button class="speed-btn pet-squad-op" type="button" data-squad-move="' + sq.id + '|-1"'
      + ' aria-label="把「' + petSquadEsc(sq.name) + '」上移"' + (i === 0 ? ' disabled aria-disabled="true"' : '')
      + '>↑</button>'
      + '<button class="speed-btn pet-squad-op" type="button" data-squad-move="' + sq.id + '|1"'
      + ' aria-label="把「' + petSquadEsc(sq.name) + '」下移"' + (i === squads.length - 1 ? ' disabled aria-disabled="true"' : '')
      + '>↓</button>'
      + '<button class="speed-btn pet-squad-op pet-squad-del" type="button" data-squad-del="' + sq.id + '"'
      + ' aria-label="删除「' + petSquadEsc(sq.name) + '」"' + (squads.length <= 1 ? ' disabled aria-disabled="true"' : '')
      + '>🗑</button>'
      + '</div>'
      + '<div class="pet-squad-chips">' + chips + '</div>'
      + '<div class="pet-squad-meta">' + (i === 0 ? '首发＝开战时第一支上场的队伍' : '第 ' + (i + 1) + ' 队 · 首发之后依次上场')
      + ' · 未编队 ' + freeN + ' 只</div>';
    if (injuredN) {
      h += '<div class="pet-squad-warn" role="note">⚠️ 有 ' + injuredN
        + ' 只受伤中：仍保留在队里，但开战不会上场（先喂营养液）</div>';
    }
    h += '</div>';
  });
  h += '<button class="speed-btn pet-squad-add" id="petSquadAdd" type="button">＋ 新建小队</button>'
    + '<div class="pet-squad-note" role="note">✓ 实心 = 已在本队；标「在 X」并置灰 = 已编在别的小队'
    + '（同一宠物只能出现在一支小队，先从原队移出再编）。首发队就是开战第一队，其余按顺序接力 / 分场。</div>'
    + '</div></details>';
  return h;
}

/* 编队改动后：把「首发」同步回运行时缓存（开战读的是 `_petBattlePicks`，不刷新就会用旧阵容） */
function petSquadRefreshPicks() {
  if (typeof getPetSquads !== 'function') return;
  var sq = getPetSquads()[0];
  if (!sq) return;
  _petBattlePicks = sq.petIds.slice();
  if (typeof _petBattlePicksLoaded !== 'undefined') _petBattlePicksLoaded = true;
}

function renderPetPanel() {
  var ov = document.getElementById('panelOverlay')
  if (!ov) return
  /* v2.17：进面板先补发**今日**宠物经验（力量 kg×5 / 有氧 min×20，按增量水印 → 重复进面板恒发 0），
     并顺带跑一跑月度清空闸门（同月只清一次）。它不写任何 UI 数字，纯记账。 */
  if (typeof syncPetLevelExp === 'function') syncPetLevelExp()
  var d = getPetStore()
  /* v2.2 WP-H1：从存档恢复参战宠物选择（刷新/重开后保留） */
  if (typeof ensurePetBattlePicksLoaded === 'function') ensurePetBattlePicksLoaded()
  /* v2.3：结算按钮的可用判据（不写存档的纯函数） */
  var st = (typeof petSettleStatus === 'function') ? petSettleStatus(d) : { ready: false }
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<button class="speed-btn tx-tap" id="petClose">✕</button>'
    +'<span class="tx-h">🐾 宠物面板</span>'
    +'<span style="flex:1"></span>'
    /* v2.3：**有用才显示** —— 没有可结算内容（今天已结算过 / 只剩阵亡宠 / 没有宠物）时整块不渲染 */
    +(st.ready
      ? '<button class="speed-btn" id="petSettle" title="把离线天数补算到今天（待结算 '
          + (st.due + st.firstTimers) + ' 只宠物）" style="padding:10px 14px;min-height:44px;font-size:var(--fs-base);border-color:var(--green);color:var(--green)">离线补算</button>'
      : '')
    +'</div>'
  /* ⚔️ 出战编队（v2.14.25 收口，评审 P1-1）——
     · 本块**只读**：显示首发队成员 + 容量 + 两个动作（开战 / 进编队管理）；
     · **编辑只剩一处**：下方 `.pet-squads`（编队管理）的芯片。
     v2.14.24 时这里还是「一排可点芯片」，与编队管理里的首发队卡把同一组数据渲染了两遍，
     用户要自己推断两块的关系、两处还能各自改选中（评审实测：两块选中集合完全相同）。 */
  var ready = d.pets.filter(function(p){return p.stage==='mature'&&!p.isDead})
  if (ready.length) {
    var _petMaxLabel = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4
    var _picks = _petBattlePicks || []
    var _squadsN = (typeof getPetSquads === 'function') ? getPetSquads().length : 0
    var _byId = {}
    ready.forEach(function (p) { _byId[p.speciesId] = p })
    h += '<div class="pet-lineup">'
      +'<div class="pet-lineup-hd">⚔️ 出战编队'
      +'<span class="pet-lineup-count">'+_picks.length+'/'+_petMaxLabel+'</span>'
      +'<span class="pet-lineup-hint">'+(_squadsN > 1 ? '首发＝第一队 · 共 ' + _squadsN + ' 队' : '首发＝开战第一队')+'</span>'
      +'</div>'
      +'<div class="pet-lineup-sum"><span class="pet-lineup-slot">首发</span><div class="pet-pick-chips">'
    if (_picks.length) {
      _picks.forEach(function (sid) {
        var p = _byId[sid]
        var nm = (typeof getPetCodex === 'function' && (getPetCodex(sid) || {}).name) || (p && p.name) || sid
        h += '<span class="pet-pick-chip" title="' + petSquadEsc(nm) + (p && p.injured ? '：受伤中，本场不会上场' : '') + '">'
          + ((typeof petIconHtml === 'function') ? petIconHtml(sid, 16) : '🐾')
          + '<span>' + petSquadEsc(nm) + '</span>'
          + (p && p.injured ? '<span class="pet-lineup-warn" aria-hidden="true">⚠️</span>' : '')
          + '</span>'
      })
    } else {
      h += '<span class="pet-lineup-empty">还没编队 · 开战会自动带成熟宠物</span>'
    }
    h += '</div></div>'
      /* 动作区：开战（唯一动作）+ 进编队管理（唯一编辑入口）。两者都是 44px 命中区。 */
      +'<div class="pet-lineup-ops">'
      +'<button class="speed-btn pet-start-battle btn-primary" id="petStartBattle" type="button">⚔️ 开始敌群试炼（带宠物）</button>'
      +'<button class="speed-btn pet-squad-jump" id="petSquadEditJump" type="button"'
      +  ' aria-controls="petSquadDetails">🐾 编队管理<span class="pet-squad-jump-caret" aria-hidden="true">›</span></button>'
      +'</div>'
      +'</div>'
    /* v2.18（阶段 A）：编队管理（多小队）—— **唯一编辑入口**，紧跟在阵容摘摘要之后 */
    h += petSquadPanelHtml(ready)
  }
  // 材料（v2.3：数字独占一行，按钮组另起一行；一键治疗全宽独占一行）
  var m = d.materials || {}
  /* v2.2 WP-H5：一键治疗的候选 = 成熟 + 未阵亡 + 受伤（已死亡 / 未成熟不参与） */
  var injuredN = d.pets.filter(function(p){ return p.stage==='mature' && !p.isDead && p.injured }).length
  /* ===== v2.15：🧪 营养液 ⇄ 🍖 宠物粮 互兑（1:2，即 2 换 1，双向）=====
     作者原话：「让营养液与宠物粮可以 1:2 互相兑换（2 换 1）」。
     ⚠️ **比例只有一个来源**：pet-store.js 的 `petMatExchangeInfo()` → pet-materials.js 里的
        兑换常量。本处**不写任何比例数字**，按钮文案里的「2→1」也是从返回的 need/gain 拼出来的
        —— 以后改比例只改一个常量，UI 一行不用动。
     ⚠️ 与既有「炼化石 10→1」**同一族交互**：同一排按钮、点击即兑换、toast 报结果；
        区别只有一处（作者要求）：**不足整组时按钮禁用**（`disabled` + `aria-disabled`），
        并在按钮组下方出一行原因（`.pet-mat-hint`），不用「点了才报错」的方式。 */
  var exInfo = (typeof petMatExchangeInfo === 'function') ? petMatExchangeInfo() : { rate: 0, rows: [] }
  var exRows = exInfo.rows || []
  var exBlocked = exRows.filter(function(r){ return !r.ok })
  function exBtnHtml(row, icoFrom, icoTo) {
    var label = (row.need + '→' + row.gain)
    return '<button class="speed-btn pet-exch-btn" type="button" data-pet-exch="' + row.from + '"'
      + ' aria-label="用 ' + row.need + ' 个' + row.label + '兑换 ' + row.gain + ' 个' + row.peerLabel + '"'
      + ' title="' + (row.ok
          ? (row.need + ' 个' + row.label + ' → ' + row.gain + ' 个' + row.peerLabel + '（整组兑换，可兑 ' + row.times + ' 次）')
          : row.reason) + '"'
      + (row.ok ? '' : ' disabled aria-disabled="true"')
      + ' style="padding:8px 8px;min-height:44px;font-size:var(--fs-sm)">'
      + icoFrom + label + icoTo + '</button>'
  }
  h += '<div class="pet-mat">'
    +'<div class="pet-mat-row">'
    +'<span>🧪 营养液 <b class="tx-base">'+m.nutrition+'</b></span>'
    +'<span>🍖 饲料 <b class="tx-base">'+m.feed+'</b></span>'
    +'<span>✨ 灵能 <b class="tx-base">'+m.spirit+'</b></span>'
    +'<span>🪨 炼化石 <b class="tx-base">'+m.refineNormal+'</b>/<b style="color:var(--purple,#a855f7);font-size:var(--fs-base)">'+m.refineHigh+'</b></span>'
    +'<span>💎 宝珠碎片 <b class="tx-base">'+m.orbShard+'</b></span>'
    +'</div>'
    +'<div class="pet-mat-actions">'
    + exRows.map(function(row){
        return row.from === 'nutrition' ? exBtnHtml(row, '🧪', '🍖') : exBtnHtml(row, '🍖', '🧪')
      }).join('')
    +'<button class="speed-btn tx-btn-sm" id="petExchange" title="10 个普通炼化石兑换 1 个高级炼化石">🔄 兑换 10→1</button>'
    /* v2.3：一键治疗**全宽独占一行**（.pet-btn-wide 的 flex:1 1 100%），不再与兑换并列 */
    +'<button class="speed-btn pet-btn-wide" id="petHealAll" title="自动消耗营养液，把所有受伤宠物一次治好（已阵亡/未成熟的不参与）" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)'+(injuredN?';border-color:var(--red);color:var(--red)':'')+'">🧪 一键治疗'+(injuredN?'（'+injuredN+'）':'')+'</button>'
    +'</div>'
    /* 原因只在「有一个方向换不了」时出现 —— 正常态不占高度（作者要的是更短的列表） */
    +(exBlocked.length
      ? '<div class="pet-mat-hint" role="note">🔁 营养液 ⇄ 宠物粮 ' + exInfo.rate + ' 换 1（整组兑换，不产生小数）· '
          + exBlocked.map(function(r){ return r.reason }).join(' · ') + '</div>'
      : '')
    +'</div>'
  /* v2.14.13：今日宠物经验明细（默认折叠；数据 = pets.levelLedger.log 的今日发放记录） */
  h += petExpLogHtml()
  // v2.1.17 宝珠：合成 / 库存分解
  h += orbBagHtml(d)
  // 宠物列表
  if (!d.pets.length) {
    h += '<div style="text-align:center;padding:32px 20px;color:var(--text3);font-size:var(--fs-base);background:var(--bg2);border-radius:var(--r)">还没有宠物 🐾<br><span class="tx-xs">先领一颗蛋开始养成吧</span><br><button class="speed-btn" id="petGetEgg" style="margin-top:14px;padding:12px 20px;min-height:48px;font-size:var(--fs-md);border-color:var(--orange);color:var(--orange)">🥚 获取初始蛋</button></div>'
  } else {
    /* ===== v2.15：**列表缩短**（作者原话：「优化宠物列表，现在列表太长了」）=====
       改前：每只 141px（标题行 + 状态行 + 6px 进度条 + 独立 44px 按钮行）——
             390×844 下 8 只 = **2.20 屏**、5 只也要 1.6 屏才看得到底（附录 A-3 同源问题）。
       改后：每只 **~56px 一行** —— 头像 32 + 名称（nowrap）+ 稀有度 + 一行状态；
             操作收进右侧「⋯」（点 ⋯ 展开 → 再点动作 = **2 次点击**，热区各 44px）。
       · 排序 = 按可操作性分组：参战 → 可用 → 受伤 → 成长中 → 阵亡（行上带 `data-pet-group`）；
         **不加分组标题行**：每条标题至少 44px，8 只宠就是 +220px（＝0.26 屏），
         与「缩短列表」的目标直接冲突；分组信息由排序位置 + 每行状态文字承担。
       · 进度条（`.pet-card-bar`）去掉：它只是把状态行里已经写着的「孵化 42% / 成长 30%」
         再画一遍（成熟宠恒为 100%，零信息），去掉后每只省 10px。
       ⚠️ **不动**既有结构：结算按钮条件渲染 / 参战阵容上移 / 一键治疗全宽（`.pet-btn-wide`）。
       ⚠️ 名称仍 `white-space:nowrap`（附录 A-1 的老问题，绝不回退成竖排）；
          状态（成熟/孵化/成长 · 饥饿 · 健康 · 受伤/阵亡）仍逐只可见，只是从三行压成一行。 */
    var _pickSet = {}
    ;(_petBattlePicks || []).forEach(function(sid){ _pickSet[sid] = true })
    var _GROUP_RANK = { lineup: 0, ready: 1, injured: 2, growing: 3, dead: 4 }
    function _petGroupOf(p) {
      if (p.isDead) return 'dead'
      if (p.stage !== 'mature') return 'growing'
      if (p.injured) return 'injured'
      return _pickSet[p.speciesId] ? 'lineup' : 'ready'
    }
    var _rows = d.pets.map(function(p, i){ return { p: p, i: i, g: null } })
    _rows.forEach(function(r){
      normalizePetStage(r.p);   // v2.0.9: 实时校正阶段（防 hatchProgress=100 卡 egg）→ 先校正再判组
      r.g = _petGroupOf(r.p)
    })
    /* 组内保持存档原顺序（稳定排序），组间按 _GROUP_RANK */
    _rows.sort(function(a, b){
      return _GROUP_RANK[a.g] !== _GROUP_RANK[b.g] ? _GROUP_RANK[a.g] - _GROUP_RANK[b.g] : a.i - b.i
    })
    /* v2.15：**按组折叠** —— 参战 + 可用常显；受伤 / 成长中 / 阵亡收进
       <details> 默认折叠（v2.14.1 已把每行压到 ~56px，这里再削掉"暂时用不上"的行）。
       一组都没有可用宠时把折叠区默认展开，避免面板只剩一行 summary。 */
    function _petCardHtml(r) {
      var p = r.p, i = r.i
      var codex = getPetCodex(p.speciesId) || { name: p.name, rarity: p.rarity }
      /* v2.2.29：头像改用宠物专属图标（petIconStageHtml 内部兜底回原来的阶段 emoji） */
      var stageText = p.stage==='egg'?'孵化 '+Math.round(p.hatchProgress)+'%':p.stage==='grow'?'成长 '+Math.round(p.growth)+'%':'成熟'
      var dead = p.isDead ? '<span class="tx-err">💀 阵亡</span>' : ''
      // v2.1.19 受伤状态：无法参战，需喂养把恢复进度喂到 100
      var inj = (!p.isDead && p.injured) ? '<span class="tx-err">🤕 受伤 ' + Math.round(p.injuryHeal || 0) + '%</span>' : ''
      var petName = (codex.name||p.name)
      /* v2.17：列表里就看得到等级（成熟期才累计；未成熟 / 旧档一律 Lv0） */
      var lvInfo = (typeof petLevelInfo === 'function') ? petLevelInfo(p) : null
      var lvTxt = (lvInfo && p.stage === 'mature') ? ' · 🏅 Lv' + lvInfo.level : ''
      var open = (_petRowOpen === i)
      return '<div class="pet-card" data-pet-group="'+r.g+'">'
        +'<div class="pet-row">'
        +'<span class="pet-card-ico">'+petIconStageHtml(p.speciesId, 32, p.stage)+'</span>'
        +'<span class="pet-row-main">'
        +'<span class="pet-card-head">'
        +'<span class="pet-card-name">'+petName+'</span>'
        +'<span class="pet-card-rarity">'+p.rarity+'</span>'
        +'</span>'
        +'<span class="pet-card-status">'+stageText+' · 饥饿 '+Math.round(p.hunger)+' · 健康 '+Math.round(p.health)+lvTxt+(dead?' · '+dead:'')+(inj?' · '+inj:'')+'</span>'
        +'</span>'
        /* 操作折叠的开关：1 次点开 + 1 次点动作 = 2 次点击（热区 44×44，见 .pet-row-more） */
        +'<button class="speed-btn pet-row-more" type="button" data-pet-more="'+i+'" data-pet-name="'+petName+'"'
        +' aria-expanded="'+(open?'true':'false')+'" aria-controls="petActs'+i+'"'
        +' aria-label="'+(open?'收起':'展开')+petName+'的操作">'+(open?'▴':'⋯')+'</button>'
        +'</div>'
        // 操作按钮（大按钮 44px）—— 默认收起，展开后与改前完全一致
        +'<div class="pet-card-actions" id="petActs'+i+'"'+(open?'':' hidden')+'>'
        +'<button class="speed-btn tx-btn" data-pet-op="feed" data-pet-idx="'+i+'">🍖喂</button>'
        +((p.stage==='egg'||(p.stage==='mature'&&!p.isDead))?'<button class="speed-btn" data-pet-op="nutrition" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)'+(p.injured?';border-color:var(--red);color:var(--red)':'')+'">🧪营养</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="refine" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm);border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">✨炼化</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn tx-btn" data-pet-op="detail" data-pet-idx="'+i+'">📋</button>':'')
        +'</div>'
        +'</div>'
    }
    var _mainRows = _rows.filter(function(r){ return r.g === 'lineup' || r.g === 'ready' })
    var _restRows = _rows.filter(function(r){ return r.g !== 'lineup' && r.g !== 'ready' })
    _mainRows.forEach(function(r){ h += _petCardHtml(r) })
    if (_restRows.length) {
      h += '<details class="pet-rest"' + (_mainRows.length ? '' : ' open') + '>'
        + '<summary>其余 ' + _restRows.length + ' 只（受伤 / 成长中 / 阵亡）</summary>'
        + '<div class="pet-rest-body">'
      _restRows.forEach(function(r){ h += _petCardHtml(r) })
      h += '</div></details>'
    }
  }
  /* v2.3：重渲染前记下滚动位置并还原（与详情页同一处理）—— 面板是滚动容器，
     不还原的话在列表里点「🍖喂 / ✨炼化」会被弹回顶部，与「一键治疗」上移的初衷相反。 */
  var _st = ov.scrollTop
  ov.innerHTML = '<div class="panel-inner">' + h + '</div>'
  ov.classList.add('open')
  ov.scrollTop = _st

  // 事件
  var closeBtn = document.getElementById('petClose')
  if (closeBtn) closeBtn.addEventListener('click', function(){ ov.classList.remove('open') })
  var settleBtn = document.getElementById('petSettle')
  if (settleBtn) settleBtn.addEventListener('click', function(){
    var ev = settleAllPets(new Date())
    toast('✅ 宠物结算完成' + (ev.length ? '（'+ev.length+' 事件）' : ''), 's')
    renderPetPanel()
  })
  var getEgg = document.getElementById('petGetEgg')
  if (getEgg) getEgg.addEventListener('click', function(){
    var r = grantStarterPet()
    toast(r.msg || r.reason, r.ok ? 's' : 'e')
    renderPetPanel()
  })
  var exch = document.getElementById('petExchange')
  if (exch) exch.addEventListener('click', function(){
    var d5 = getPetStore()
    var rx = exchangeRefineStones(d5.materials, 1)
    if (rx.ok) { savePetStore(d5); toast('🔄 '+rx.spent+' 普通炼化石 → '+rx.gained+' 高级炼化石', 's') }
    else { toast(rx.reason || '兑换失败', 'e') }
    renderPetPanel()
  })
  /* v2.15：🧪 营养液 ⇄ 🍖 宠物粮 互兑 —— 逻辑与落盘**全在** pet-store.js 的
     `exchangePetMaterials()`（它再调 pet-materials.js 的唯一来源）；本处只负责提示与重渲染。
     按钮不足整组时已 `disabled`，正常点不到这里；仍保留失败分支（防 stale DOM 下的竞态）。 */
  ov.querySelectorAll('[data-pet-exch]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var from = btn.getAttribute('data-pet-exch')
      var rx = (typeof exchangePetMaterials === 'function')
        ? exchangePetMaterials(from, 1)
        : { ok: false, reason: '宠物模块未加载' }
      if (rx.ok) {
        var labels = (typeof PET_MAT_EXCHANGE_LABELS !== 'undefined') ? PET_MAT_EXCHANGE_LABELS : {}
        toast('🔁 ' + rx.spent + ' 个' + (labels[rx.from] || rx.from) + ' → ' + rx.gained + ' 个'
          + (labels[rx.to] || rx.to) + '（余 ' + rx.fromBalance + ' / ' + rx.toBalance + '）', 's')
      } else {
        toast(rx.reason || '兑换失败', 'e')
      }
      renderPetPanel()   // 立即刷新面板（落盘已在 exchangePetMaterials 内完成）
    })
  })
  /* v2.15：宠物行的「⋯」开关 —— **就地展开/收起**，不整页重渲染（保住滚动位置与焦点）。
     展开后按钮就是改前的同一批（data-pet-op 未变），事件由下面的通用绑定负责。 */
  ov.querySelectorAll('[data-pet-more]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var idx = parseInt(btn.getAttribute('data-pet-more'), 10)
      var nm = btn.getAttribute('data-pet-name') || '该宠物'
      _petRowOpen = (_petRowOpen === idx) ? null : idx
      var open = (_petRowOpen === idx)
      var box = document.getElementById('petActs' + idx)
      if (box) box.hidden = !open
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      btn.setAttribute('aria-label', (open ? '收起' : '展开') + nm + '的操作')
      btn.textContent = open ? '▴' : '⋯'
    })
  })
  /* v2.2 WP-H5：一键修复受伤（自动消耗营养液）—— 逻辑全在 pet-store.js 的 healAllInjuredPets()，
     这里只负责提示。已阵亡 / 未成熟 / 未受伤的宠物在那边就已被排除，不会误治、不会误耗。 */
  var healAll = document.getElementById('petHealAll')
  if (healAll) healAll.addEventListener('click', function(){
    var hr = (typeof healAllInjuredPets === 'function') ? healAllInjuredPets() : { ok:false, reason:'宠物模块未加载' }
    if (!hr.ok) { toast(hr.reason || '没有需要治疗的宠物', 'e') }
    else {
      var seg = []
      if (hr.healed.length) seg.push('✅ ' + hr.healed.join('、') + ' 已痊愈')
      if (hr.partial.length) seg.push('⚠️ ' + hr.partial.join('、') + ' 未愈（营养液不足）')
      seg.push('消耗 🧪' + hr.consumed)
      toast(seg.join(' · '), hr.partial.length ? 'e' : 's')
    }
    renderPetPanel()
  })
  /* v2.15：**恢复「合成宝珠」入口** —— 20 碎片 / 100% / 每日 5 次，
     规则与落盘全在 orbs.js 的 synthOrb() / orbSynthStatus()，UI 只负责提示与重渲染。 */
  ov.querySelectorAll('[data-orb-synth]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var d9 = getPetStore()
      var today = (typeof dateKey === 'function') ? dateKey(new Date()) : ''
      var r9 = (typeof synthOrb === 'function')
        ? synthOrb(d9, today)
        : { ok: false, reason: '宝珠模块未加载' }
      if (!r9.ok) { toast(r9.reason || '合成失败', 'e'); return }
      savePetStore(d9)
      toast('🔨 合成 ' + ((ORB_TYPES[r9.orb.type]||{}).name || r9.orb.type)
        + '（R·Lv1）· 今日 ' + r9.count + '/'
        + ((typeof ORB_SYNTH_DAILY_LIMIT === 'number') ? ORB_SYNTH_DAILY_LIMIT : 5), 's')
      renderPetPanel()
    })
  })
  /* 分解：返还 = 该宝珠的加成百分点数（v2.15 等价碎片口径），toast 报实际数值 */
  ov.querySelectorAll('[data-orb-bag]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var oid = btn.getAttribute('data-orb-bag')
      var d7 = getPetStore()
      var arr = d7.orbs || []
      var i7 = -1
      arr.forEach(function(o, k){ if (o.id === oid) i7 = k })
      if (i7 < 0) return
      var orb7 = arr.splice(i7, 1)[0]
      var dec7 = (typeof decomposeOrb === 'function') ? decomposeOrb(orb7, d7.materials) : { shards: 0 }
      savePetStore(d7)
      toast('♻️ 分解 ' + ((ORB_TYPES[orb7.type]||{}).name||orb7.type)
        + '（' + orb7.rarity + '）→ +' + dec7.shards + ' 碎片', 's')
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-pet-op]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var op = btn.getAttribute('data-pet-op')
      var idx = parseInt(btn.getAttribute('data-pet-idx'))
      var d2 = getPetStore()
      var pet = d2.pets[idx]
      if (!pet) return
      if (op === 'feed') {
        var r = useFeed(pet, d2.materials)
        var m = r.reason || (pet.stage === 'mature'
          ? ('🍖 饥饿+' + r.inc.toFixed(0) + (r.injuryHeal != null ? ' · 治疗 ' + r.injuryHeal + '%' + (r.healed ? ' ✅已痊愈' : '') : ''))
          : ('🍖 饥饿+' + r.inc.toFixed(0)))
        toast(m, r.ok?'s':'e')
      }
      if (op === 'nutrition') {
        var r2 = useNutrition(pet, d2.materials)
        var m2 = r2.reason || (pet.stage === 'mature'
          ? ('🧪 治疗 ' + (r2.injuryHeal != null ? r2.injuryHeal + '%' : '') + (r2.healed ? ' ✅已痊愈' : ''))
          : ('🧪 孵化+' + r2.inc.toFixed(1)+'%'))
        toast(m2, r2.ok?'s':'e')
      }
      if (op === 'refine') { var r3 = attemptRefine(pet, d2.materials, 'refineHigh'); toast(r3.reason || ('✨ 炼化 +' + r3.gained + ' ' + r3.stat + '（Lv'+r3.level+'）'), r3.ok?'s':'e') }
      if (op === 'detail') { renderPetDetail(pet, idx); return }
      savePetStore(d2)
      renderPetPanel()
    })
  })
  /* v2.14.25：`[data-pet-pick]` 就地切换**已删除**（评审 P1-1）——
     阵容编辑只有一条路：编队管理芯片 → `togglePetSquadPet` → `petSquadRefreshPicks`。
     这里只保留「进编队管理」的跳转；不再有第二处能改首发选中。 */
  var squadJump = document.getElementById('petSquadEditJump')
  if (squadJump) squadJump.addEventListener('click', function () {
    _petSquadsOpen = true
    renderPetPanel()
    var det = document.getElementById('petSquadDetails')
    if (det && typeof det.scrollIntoView === 'function') det.scrollIntoView({ block: 'nearest' })
  })
  /* ===== v2.18（阶段 A）：编队管理的事件 =====
     ⚠️ 一律「调 pet-store 入口 → 刷新首发缓存 → 重渲染」，不在本文件写存档、不自己判上限/互斥。 */
  var sqDetails = (typeof ov.querySelector === 'function') ? ov.querySelector('.pet-squads') : null
  if (sqDetails) sqDetails.addEventListener('toggle', function () { _petSquadsOpen = !!sqDetails.open })
  ov.querySelectorAll('[data-squad-pick]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var raw = btn.getAttribute('data-squad-pick') || ''
      var bar = raw.indexOf('|')
      if (bar < 0) return
      var r = (typeof togglePetSquadPet === 'function')
        ? togglePetSquadPet(raw.slice(0, bar), raw.slice(bar + 1))
        : { ok: false, reason: '编队模块未加载' }
      if (!r.ok) { toast(r.reason || '编队失败', 'e'); return }
      petSquadRefreshPicks()
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-squad-move]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var raw = btn.getAttribute('data-squad-move') || ''
      var bar = raw.indexOf('|')
      if (bar < 0) return
      var r = (typeof movePetSquad === 'function')
        ? movePetSquad(raw.slice(0, bar), parseInt(raw.slice(bar + 1), 10) === -1 ? -1 : 1)
        : { ok: false, reason: '编队模块未加载' }
      if (!r.ok) { toast(r.reason || '排序失败', 'e'); return }
      petSquadRefreshPicks()
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-squad-del]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-squad-del')
      if (!confirm('删除这支小队？（队伍里的宠物不会消失，只是不再编在这里）')) return
      var r = (typeof removePetSquad === 'function') ? removePetSquad(id) : { ok: false, reason: '编队模块未加载' }
      if (!r.ok) { toast(r.reason || '删除失败', 'e'); return }
      petSquadRefreshPicks()
      toast('已删除该小队', 's')
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-squad-name]').forEach(function (inp) {
    /* 用 change（失焦 / 回车）而不是 input：改名只落一次盘，也避免每次按键重渲染 */
    inp.addEventListener('change', function () {
      var id = inp.getAttribute('data-squad-name')
      var r = (typeof renamePetSquad === 'function') ? renamePetSquad(id, inp.value) : { ok: false, reason: '编队模块未加载' }
      if (!r.ok) { toast(r.reason || '改名失败', 'e'); return }
      renderPetPanel()
    })
  })
  var squadAdd = document.getElementById('petSquadAdd')
  if (squadAdd) squadAdd.addEventListener('click', function () {
    var r = (typeof addPetSquad === 'function') ? addPetSquad() : { ok: false, reason: '编队模块未加载' }
    if (!r.ok) { toast(r.reason || '新建失败', 'e'); return }
    _petSquadsOpen = true
    toast('🐾 已新建一支小队（点芯片给它配宠物）', 's')
    renderPetPanel()
  })
  var startBtn = document.getElementById('petStartBattle')
  if (startBtn) startBtn.addEventListener('click', function(){
    /* v2.2 WP-H2：从**当前进度关**开战（不再写死 'g5'）；无目标关时不关面板 */
    var stage = (typeof currentGroupStageId === 'function') ? currentGroupStageId() : null
    if (!stage) { toast('暂无可挑战的敌群关卡', 'e'); return }
    ov.classList.remove('open')
    startGroupTrialWithPets(stage, _petBattlePicks || [])
  })
}

/* ============================================================
   v2.2 WP-I A-6：宠物详情「属性区」重组 —— 作者原话：
     「修改宠物-详情页面，属性部分将基础属性与加成分开，最后再显示最终属性，
       层次要分明，现在太乱了。加成用：×N% 显示，可以展开加成来源，属性同理；
       增加对比宠物的功能。」
   三段固定结构：① 基础属性 → ② 加成（**凝聚固定值 ＋ 一个加成合计** ×N% ＋ 可展开的来源明细）→ ③ 最终属性。
   v2.16（作者裁决**以第二段为准**）后 ② 是**两种东西**，必须一眼可分：
       ② 凝聚（**固定值**）＝ 成熟期宠物该属性基础之和 ×3%，**加在①上**（速度 —）
       ③ 加成合计%（**进池百分比**）＝ 稀有度% ＋ Σ宝珠% ＋ Σ共鸣%
          其中 Σ共鸣% ＝ 成熟期宠物按稀有度逐只相加（UR 10 / SSR 8 / SR 7 / R 6）
       最终 ＝ (基础 ＋ 凝聚) × 加成合计% ÷ 100，向下取整
   所以 ② 段先给一排「+固定值」（用 `pet-cell-val`，不是 ×N%），再给一排「×N%」（`pet-cell-mult`）——
   数值 vs 百分比在视觉上就是两种形态，不会再看混。
   ⚠️ **只重组展示**：所有数字来自 pet-store.js 的 `petStatBreakdown()`；② 的行级摘要走
      `petBonusLines()`，百分比文本走 `petPctTxt()`、固定值文本走 `petValueTxt()` ——
      本文件**不重算**任何数值口径（不做乘除、不引用稀有度倍率常量、不写存档）。
   ⚠️ 面板前提仍写明「按此宠上场计算」；v2.16 起凝聚 / Σ共鸣是**全局常量**
      （只统计成熟期），与谁上场无关，所以"面板比实战高 29%"那类口径差已经不存在。
   ============================================================ */
var PET_STAT_ROWS = [
  { ico:'❤️', name:'生命', k:'hp' },
  { ico:'⚔️', name:'攻击', k:'atk' },
  { ico:'🛡️', name:'防御', k:'def' },
  { ico:'👻', name:'魂攻', k:'soulAtk' },
  { ico:'🌫️', name:'魂防', k:'soulDef' },
  { ico:'💨', name:'速度', k:'spd' }
];
function petStatMeta(k) {
  for (var i = 0; i < PET_STAT_ROWS.length; i++) if (PET_STAT_ROWS[i].k === k) return PET_STAT_ROWS[i];
  return { ico: '•', name: k, k: k };
}
/* ×N% 文本（null = 基础为 0，无法表达为倍数） */
function petMultTxt(pct) { return (pct == null) ? '×—' : '×' + pct + '%'; }

/* 展开状态：模块级 UI 状态（**不进存档**，重渲染后保留） */
var _petSrcOpen = false;      // ②「加成来源」
var _petStatOpen = null;      // ③ 当前展开的属性 k（null = 全收起）
var _petCompareSel = null;    // 对比对象 speciesId（null = 未对比）

/* ② 加成明细（**可展开处**）：先按「来源」总览，再逐属性列三项 ＋ 凝聚 ＋ 合计
   v2.16：凝聚是**固定值**（加在①上）、共鸣是**百分比**（进池）—— 两者不是同一层，
   所以总览里分两行讲清楚；逐属性那一行才是「稀有度 ＋ Σ宝珠 ＋ Σ共鸣 ＝ 加成合计」。
   所有文本都来自 `petBonusLines()` ＋ `petPctTxt()` / `petValueTxt()`
   （换算全在 pet-store.js），本函数只拼字符串：不做乘除、不调 Math.floor、不读 bd.base / bd.bench。 */
function petSrcList(rows, pick) {
  var out = [];
  rows.forEach(function (r) {
    if (!r.participates) return;
    out.push(petStatMeta(r.key).name + ' ' + pick(r));
  });
  return out.length ? out.join(' · ') : '无（×100%）';
}
function petBonusSrcHtml(bd) {
  var dig = (typeof petBonusLines === 'function') ? petBonusLines(bd) : null;
  if (!dig || !dig.ok || !dig.rows.length) return '<div class="pet-src-note">（加成明细暂不可用）</div>';
  var h = '';
  /* 总览：稀有度 / 宝珠（进池）＋ 凝聚（固定值）/ 共鸣（进池） */
  h += '<div class="pet-src-line"><span class="pet-src-tag">稀有度倍率</span><span>'
    + petMultTxt(petPctInt(dig.rows[0].rarityPct)) + '（全属性 · 进池的一项）</span></div>';
  h += '<div class="pet-src-line"><span class="pet-src-tag">宝珠</span><span>'
    + petSrcList(dig.rows, function (r) { return petMultTxt(petPctInt(100 + r.orbPct)); })
    + '（未装配 = ×100%；与稀有度<b>相加</b>进同一层）</span></div>';
  h += '<div class="pet-src-line"><span class="pet-src-tag">凝聚＋共鸣</span><span>'
    + '凝聚 <b>固定值</b>（成熟期 ' + dig.matureCount + ' 只 ×' + dig.cohesionRatePct + '%，<b>加在①上</b>）：'
    + petSrcList(dig.rows, function (r) { return petValueTxt(r.cohesion); })
    + '　·　共鸣 <b>Σ' + petPctTxt(dig.resonanceRatePct) + '</b>'
    + '（成熟期 ' + dig.matureCount + ' 只按稀有度<b>相加</b>：UR 10 / SSR 8 / SR 7 / R 6，<b>进池</b>）'
    + '（全部 ' + dig.allCount + ' 只里未上场 ' + dig.notFieldedCount + ' 只）</span></div>';
  /* 逐属性明细：三项相加 ＋ 合计（凝聚单独标注为「已加在①上」） */
  dig.rows.forEach(function (r) {
    var m = petStatMeta(r.key);
    if (!r.participates) {
      h += '<div class="pet-src-line"><span class="pet-src-tag">' + m.ico + ' ' + m.name + '</span><span>'
        + '凝聚 — · 不参与百分比池 <span class="pet-sec-sub">（速度只吃基础与等级，加成按 ×100% 计）</span></span></div>';
      return;
    }
    h += '<div class="pet-src-line"><span class="pet-src-tag">' + m.ico + ' ' + m.name + '</span><span>'
      + '稀有度 <b>' + petPctTxt(r.rarityPct) + '</b> ＋ Σ宝珠 <b>' + petPctTxt(r.orbPct) + '</b>'
      + ' ＋ Σ共鸣 <b>' + petPctTxt(r.resonancePct) + '</b>'
      + ' ＝ 加成合计 <b>×' + petPctTxt(r.totalPct) + '</b>'
      + '<span class="pet-sec-sub">（凝聚 +' + petValueTxt(r.cohesion) + ' 已加在①上）</span></span></div>';
  });
  h += '<div class="pet-src-note"><b>凝聚（固定值）</b>加在基础上、<b>共鸣（百分比）</b>进池 —— 两者不是同一层：'
    + '最终 ＝ <b>(基础 ＋ 凝聚)</b> × <b>(稀有度 ＋ Σ宝珠 ＋ Σ共鸣)</b> ÷ 100，向下取整；'
    + '后三项<b>同一层相加</b>（不是相乘）。'
    + '凝聚 ＝ 成熟期 ' + dig.matureCount + ' 只宠该属性基础之和 ×' + dig.cohesionRatePct + '%，'
    + 'Σ共鸣 ＝ 成熟期 ' + dig.matureCount + ' 只宠按稀有度相加（UR 10 / SSR 8 / SR 7 / R 6）——'
    + '同一存档下<b>每只宠看到的这两个值完全相同</b>。</div>';
  return h;
}

/* ③ 单属性链路：基础 → (＋凝聚) → ×池 → 最终 */
function petStatChainHtml(bd, k) {
  var m = petStatMeta(k);
  var row = (typeof petBonusRow === 'function') ? petBonusRow(bd, k) : null;
  var h = '<div class="pet-chain-hd">' + m.ico + ' ' + m.name + '</div>';
  if (!row || !row.participates) {
    h += '<div class="pet-chain-line">基础 <b>' + (bd.base[k] || 0) + '</b> → 最终 <b>' + (bd.final[k] || 0) + '</b>'
      + '<span class="pet-sec-sub"> （速度不参与凝聚、也不参与百分比池 · ×倍率池 ×100%）</span></div>';
    return h;
  }
  h += '<div class="pet-chain-line">基础 <b>' + (bd.base[k] || 0) + '</b>'
    + ' ＋ <b>凝聚 ' + petSignedValueTxt(row.cohesion) + '</b>'
    + ' → 最终 <b>' + (bd.final[k] || 0) + '</b>'
    + '<span class="pet-sec-sub"> （×倍率池 ' + petMultTxt(petStatMultPct(bd, k))
    + ' ＝ 稀有度＋Σ宝珠＋Σ共鸣 的等效倍数）</span></div>';
  h += '<div class="pet-chain-line"><span class="pet-sec-sub">稀有度 ' + petPctTxt(row.rarityPct)
    + ' ＋ Σ宝珠 ' + petPctTxt(row.orbPct) + ' ＋ Σ共鸣 ' + petPctTxt(row.resonancePct)
    + ' ＝ 加成合计 ×' + petPctTxt(row.totalPct)
    + '；凝聚 ' + petSignedValueTxt(row.cohesion) + ' 是加在基础①上的固定值，向下取整</span></div>';
  return h;
}

/* ② 凝聚（**固定值**）：S凝聚[k] ＝ 成熟期宠物该属性基础之和 × 3%，**加在①上**（速度 —）
   v2.16 作者裁决：凝聚是「数值」，与基础相加；共鸣才是「百分比」，进池。
   这里刻意用 `pet-cell-val`（数值）而不是 `pet-cell-mult`（×N%）—— 一眼区分两种东西。
   所有数字来自 `petBonusLines()` ＋ `petValueTxt()`（格式化在 pet-store.js），
   本函数只拼字符串：不做乘除、不调 Math.floor、不读 bd.base / bd.bench。 */
/* ② 凝聚的口径长文（默认折叠，见 petStatSectionsHtml 的 <details>）：
   文本只有这一份 —— 展开时由 petCohesionNoteHtml() 取，收起时不计高度。
   ⚠️ 与凝聚数值本身无关：所有数字仍来自 `petBonusLines()`，此处只拼句子。 */
function petCohesionNoteHtml(bd) {
  var dig = (typeof petBonusLines === 'function') ? petBonusLines(bd) : null;
  if (!dig || !dig.ok || !dig.rows.length) return '';
  return '<div class="pet-src-note"><b>凝聚是固定值</b>：成熟期 ' + dig.matureCount + ' 只宠该属性基础之和 ×'
    + dig.cohesionRatePct + '%，<b>直接加在①上</b>（不是百分比、不进池）；速度不参与（—）。'
    + '同一存档下每只宠拿到的凝聚<b>完全相同</b>。</div>';
}
function petCohesionHtml(bd, noNote) {
  var dig = (typeof petBonusLines === 'function') ? petBonusLines(bd) : null;
  if (!dig || !dig.ok || !dig.rows.length) return '';
  var h = '<div class="pet-grid">';
  dig.rows.forEach(function (r) {
    var m = petStatMeta(r.key);
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + m.ico + '</span><span class="pet-cell-name">' + m.name
      + '</span><b class="pet-cell-val">'
      + (r.participates ? ('+' + petValueTxt(r.cohesion)) : '—') + '</b></div>';
  });
  h += '</div>';
  /* noNote=true → 只出数值格（长文由调用方统一放进折叠区，主信息更短） */
  if (!noNote) h += petCohesionNoteHtml(bd);
  return h;
}

/* ② 加成合计（**进池百分比**）：×N% ＝ 稀有度 ＋ Σ宝珠 ＋ Σ共鸣
      ❤️ 生命  ×1660%
      💨 速度  ×100%   （不参与）
   ⚠️ 这里的 ×N% 四舍五入到整数（沿用全站 ×N% 的写法）；精确值在展开明细里，
      **③ 的最终值永远由精确百分比算出**，不受显示取整影响。
   ⚠️ 所有数字来自 pet-store.js 的 `petBonusLines()` / `petPctTxt()`（唯一来源），
      本文件**只拼文本、不重算任何口径**（不做乘除、不读 bd.base / bd.bench 自算）。 */
function petSignedTxt(n) {
  var v = (typeof n === 'number' && isFinite(n)) ? n : 0;
  return (v > 0) ? '+' + v : ((v < 0) ? '−' + Math.abs(v) : '+0');
}
/* ② 加成合计的口径长文（默认折叠，见 petStatSectionsHtml 的 <details>）：
   文本只有这一份。所有数字/百分比仍来自 `petBonusLines()`，本函数只拼句子。 */
function petBonusNoteHtml(bd, rarity) {
  var dig = (typeof petBonusLines === 'function') ? petBonusLines(bd, rarity) : null;
  if (!dig || !dig.ok || !dig.rows.length) return '';
  return '<div class="pet-src-note">加成合计 ＝ 稀有度 ＋ Σ宝珠 ＋ Σ共鸣（<b>进池百分比</b>，三项<b>加算同一层</b>）；'
    + '最终 ＝ <b>(基础 ＋ 凝聚)</b> × 加成合计%，向下取整。速度不参与（固定 ×100%）。'
    + 'Σ共鸣按<b>成熟期 ' + dig.matureCount + ' 只宠</b>的稀有度<b>逐只相加</b>'
    + '（UR 10 / SSR 8 / SR 7 / R 6），同一存档下每只宠相同。'
    + '大字四舍五入到整数 %，精确值见下方明细。</div>';
}
function petBonusLinesHtml(bd, rarity, noNote) {
  var dig = (typeof petBonusLines === 'function') ? petBonusLines(bd, rarity) : null;
  if (!dig || !dig.ok || !dig.rows.length) return '<div class="pet-sec-empty">（属性拆解暂不可用）</div>';
  var h = '<div class="pet-grid">';
  dig.rows.forEach(function (r) {
    var m = petStatMeta(r.key);
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + m.ico + '</span><span class="pet-cell-name">' + m.name
      + '</span><b class="pet-cell-mult">' + petMultTxt(r.participates ? petPctInt(r.totalPct) : 100) + '</b></div>';
  });
  h += '</div>';
  /* noNote=true → 只出 ×N% 数值格（长文由调用方统一放进折叠区） */
  if (!noNote) h += petBonusNoteHtml(bd, rarity);
  return h;
}

/* 属性区（① 基础 → ② 凝聚（固定值）＋ 加成合计（进池%）→ ③ 最终）
   v2.16 作者裁决后 ② 段必须一眼看出两件事：
     · **凝聚 = 固定值**，加在①上（`petCohesionHtml`，数值形如 +153.6，速度 —）
     · **共鸣 = 进池百分比**（在「加成合计 ×N%」的来源里，Σ共鸣 C%）
   编号沿用「① 基础属性 / ② 加成 / ③ 最终属性」三段（② 内部再分「凝聚」与「加成合计」两小节），
   这样既有的三段契约（test-pet-compare / test-pet-heal-display）与展开态手柄都不用改。 */
function petStatSectionsHtml(bd, rarity) {
  var h = '<div class="pet-sec">';
  h += '<div class="pet-sec-hd">📊 属性 <span class="pet-sec-sub">（① 基础 → ② 加成 → ③ 最终 · 按此宠上场计算）</span></div>';
  if (!bd || !bd.ok) {
    h += '<div class="pet-sec-empty">（属性拆解暂不可用）</div></div>';
    return h;
  }
  h += '<div class="pet-sec-title">① 基础属性 <span class="pet-sec-sub">图鉴＋炼化＋天赋静态</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-val">' + (bd.base[r.k] || 0) + '</b></div>';
  });
  h += '</div>';
  h += '<div class="pet-sec-title">② 加成 <span class="pet-sec-sub">凝聚＝<b>固定值</b>（成熟期宠物基础 ×3%，加在①上）· 加成合计统一为 ×N% ＝ 稀有度＋Σ宝珠＋<b>Σ共鸣</b>（进池百分比）· 凝聚/共鸣只作用于参战宠</span></div>';
  h += petCohesionHtml(bd, true);
  h += petBonusLinesHtml(bd, rarity, true);
  /* v2.16 阶段 2：② 的两段口径长文**默认折叠**（<details>），主信息只留两排数值格。
     折叠后「凝聚＝固定值 / 共鸣＝进池 %」这两件事仍写在 ② 标题行里（常显），
     长文（如何相加、UR/SSR/SR/R 的逐只数值、取整规则）点开才出现。
     ⚠️ 不新增任何按钮/热区以外的东西：summary 自带 44px 热区与原生 aria-expanded。 */
  h += '<details class="pet-det" id="petCalcDet">'
    + '<summary class="pet-det-sum">② 计算口径：凝聚＝固定值（加在①上）· 共鸣＝进池 %（点开看换算）</summary>'
    + '<div class="pet-det-body">' + petCohesionNoteHtml(bd) + petBonusNoteHtml(bd, rarity) + '</div>'
    + '</details>';
  var srcLabel = '加成明细（凝聚 / 稀有度 / Σ宝珠 / Σ共鸣 · 成熟期 ' + bd.matureCount + ' 只 / 全部 ' + bd.allCount + ' 只）';
  h += '<button class="pet-src-toggle" id="petBonusSrcBtn" aria-expanded="' + (_petSrcOpen ? 'true' : 'false') + '" aria-controls="petBonusSrc" data-label="' + srcLabel + '">'
    + (_petSrcOpen ? '▾ ' : '▸ ') + srcLabel + '</button>';
  h += '<div class="pet-src" id="petBonusSrc"' + (_petSrcOpen ? '' : ' hidden') + '>' + petBonusSrcHtml(bd) + '</div>';
  h += '<div class="pet-sec-title">③ 最终属性 <span class="pet-sec-sub">上场数值 · 点属性行看该属性的「基础 → 各来源 → 最终」</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    var on = (_petStatOpen === r.k);
    h += '<button class="pet-final-cell' + (on ? ' active' : '') + '" data-pet-stat="' + r.k + '" aria-expanded="' + (on ? 'true' : 'false') + '">'
      + '<span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-val">' + (bd.final[r.k] || 0) + '</b></button>';
  });
  h += '</div>';
  h += '<div class="pet-chain" id="petStatDetail"' + (_petStatOpen ? '' : ' hidden') + '>'
    + (_petStatOpen ? petStatChainHtml(bd, _petStatOpen) : '') + '</div>';
  h += '</div>';
  return h;
}

/* ============================================================
   对比宠物（作者要求：可选另一只宠对比、最终属性并排 + 差值、只显示主要几项、可退出）
   口径：**两只宠都按「此宠上场计算」**（与详情面板同一个 petStatBreakdown 口径）——
         UI 里明写这一行，避免「拿 A 的上场值比 B 的基础值」。
   交互：点宠物名开始对比 / 再点一次或点「退出对比」结束；换对象 = 直接点另一只。
   ⚠️ 不新增页面 / 路由，全部在宠物面板 overlay 内完成。
   ============================================================ */
function petCompareHtml(pet) {
  var d = getPetStore();
  var list = (d.pets || []).filter(function (p) { return p.speciesId !== pet.speciesId; });
  var ready = list.filter(function (p) { return canPetBattle(p); });
  if (ready.length) list = ready;     // 优先列可参战的（口径就是「上场计算」）
  var h = '<div class="pet-sec">';
  h += '<div class="pet-sec-hd">⚖️ 对比宠物 <span class="pet-sec-sub">（两只宠同口径：都按「此宠上场计算」）</span></div>';
  if (!list.length) {
    h += '<div class="pet-sec-empty">还没有其它宠物可以对比</div></div>';
    return h;
  }
  h += '<div class="pet-cmp-chips">';
  list.forEach(function (p) {
    var c = getPetCodex(p.speciesId) || {};
    var on = (_petCompareSel === p.speciesId);
    h += '<button class="speed-btn pet-cmp-chip' + (on ? ' active' : '') + '" data-pet-cmp="' + p.speciesId + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
      + petIconHtml(p.speciesId, 32) + '<span>' + (c.name || p.name || p.speciesId) + '</span></button>';
  });
  h += '</div>';
  var sel = null;
  list.forEach(function (p) { if (p.speciesId === _petCompareSel) sel = p; });
  if (!sel) h += '<div class="pet-sec-empty">点上面的宠物名开始对比（再点一次 = 结束对比）</div>';
  else h += petCompareResultHtml(pet, sel);
  h += '</div>';
  return h;
}

function petCompareResultHtml(petA, petB) {
  var na = (getPetCodex(petA.speciesId) || {}).name || petA.name;
  var nb = (getPetCodex(petB.speciesId) || {}).name || petB.name;
  var cmp = (typeof petCompareFinal === 'function') ? petCompareFinal(petA, petB) : null;
  var h = '<div class="pet-cmp-res">';
  h += '<div class="pet-cmp-note">口径：两只宠<b>都按「此宠上场计算」</b>（加成合计 ＝ 稀有度＋Σ宝珠＋凝聚＋共鸣% 同一层）'
    + '—— 不是「本宠的上场值比对比宠的基础值」。</div>';
  if (!cmp || !cmp.ok) { h += '<div class="pet-sec-empty">（对比暂不可用）</div></div>'; return h; }
  h += '<table class="pet-cmp-table"><thead><tr><th scope="col">属性</th><th scope="col">本宠·' + na
    + '</th><th scope="col">对比·' + nb + '</th><th scope="col">差值</th></tr></thead><tbody>';
  cmp.rows.forEach(function (row) {
    var m = petStatMeta(row.key), dd = row.diff;
    var txt = (dd == null) ? '—' : (dd > 0 ? '+' + dd : (dd < 0 ? '−' + Math.abs(dd) : '0'));
    var cls = (dd == null || dd === 0) ? '' : (dd > 0 ? ' pet-cmp-up' : ' pet-cmp-dn');
    h += '<tr><th scope="row">' + m.ico + ' ' + m.name + '</th><td>' + row.a + '</td><td>' + row.b + '</td>'
      + '<td class="pet-cmp-diff' + cls + '">' + txt + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<button class="speed-btn pet-cmp-exit" id="petCmpExit">✕ 退出对比</button>';
  h += '</div>';
  return h;
}

/* ============================================================
   v2.17：**宠物等级**区块（成熟期经验等级）—— 作者要求「需要额外显示等级获得的属性」。
   结构（与①基础/②加成/③最终 三段并列追加一段，不改既有编号）：
     🏅 等级 Lv N / 50 ＋ 经验进度条 ＋ 「等级加成 +N%」
     逐属性：基础 X → ＋等级 +Y（取值＝floor(基础×等级%)）→ ＋凝聚 +C → ×加成合计 T% → 最终 F
   ⚠️ **只重组展示**：数值全部来自 pet-store.js 的 `petLevelBonusView()`（等级/经验/加成数值）
      与 `petBonusLines()`（凝聚 / 加成合计 / 最终）；本文件**不做乘除、不写存档、不写 pet**。
   ⚠️ 字号/颜色一律走既有设计令牌（`--fs-*` / `--text*` / `--brand-fill` / `--surface-3`），
      不引入新字号/颜色；本段**没有可点元素**（纯展示），故不涉及 44px 热区。
   ============================================================ */
function petLevelHtml(pet, bd) {
  if (typeof petLevelBonusView !== 'function') return '';
  var v = petLevelBonusView(pet, (bd && bd.base) ? bd.base : null);
  var needMax = v.maxed ? 100 : (v.need > 0 ? v.need : 1);
  var nowVal = v.maxed ? 100 : v.inLevel;
  var h = '<div class="pet-sec">';
  h += '<div class="pet-sec-hd">🏅 宠物等级 <span class="pet-sec-sub">（成熟期起累计 · 每级 +' + v.ratePct
    + '% 基础属性 · 上限 +' + v.capPct + '%＝Lv' + v.maxLevel + ' · 每月清空）</span></div>';
  h += '<div style="display:flex;align-items:baseline;gap:6px;font-weight:700;margin-bottom:6px">'
    + '<span id="petLvTitle" class="tx-xs">🏅 Lv ' + v.level + '</span>'
    + '<span class="tx-note">/ ' + v.maxLevel + '</span>'
    + '<span style="flex:1"></span>'
    + '<span style="font-size:var(--fs-xs);color:var(--text2)">等级加成 +' + v.bonusPct + '%</span>'
    + '</div>';
  h += '<div style="height:8px;background:var(--surface-3);border-radius:var(--r);overflow:hidden"'
    + ' role="progressbar" aria-labelledby="petLvTitle" aria-valuenow="' + nowVal
    + '" aria-valuemin="0" aria-valuemax="' + needMax + '">'
    + '<div style="width:' + (v.maxed ? 100 : v.pct) + '%;height:100%;background:var(--brand-fill);border-radius:var(--r)"></div></div>';
  h += '<div style="font-size:var(--fs-xs);color:var(--text2);margin-top:6px">'
    + (v.maxed
        ? '已满级（+' + v.capPct + '% 封顶，不再累计经验）'
        : '经验 ' + v.inLevel + ' / ' + v.need + '（累计 ' + v.exp + ' · 升级所需经验＝目标等级×' + v.expMult + '）')
    + '</div>';
  /* 逐属性：等级**提供的属性**（基础值层，不进池） */
  h += '<div class="pet-sec-title">等级提供的属性 <span class="pet-sec-sub">＝ 基础 × ' + v.bonusPct
    + '%（只加基础值，<b>不吃</b>稀有度／宝珠／共鸣的放大）</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    var add = (v.bonus && typeof v.bonus[r.k] === 'number') ? v.bonus[r.k] : 0;
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-val">' + (add > 0 ? '+' + add : (v.level > 0 ? '+0' : '—')) + '</b></div>';
  });
  h += '</div>';
  /* 链路：基础 → ＋等级 → ＋凝聚 → ×加成合计 → 最终（数值全部来自 petBonusRow / bd）
     v2.16 阶段 2：这 6 行链路 + 结语属「详细说明」→ **默认折叠**（<details>），
     主信息保留 Lv／经验进度／「等级提供的属性」数值格。
     用原生 <details>/<summary>：Tab 可达、Enter/Space 展开、aria-expanded 由浏览器映射。 */
  if (bd && bd.ok && typeof petBonusRow === 'function') {
    h += '<details class="pet-det" id="petLvChainDet">'
      + '<summary class="pet-det-sum">逐属性等级加成链路（基础 → ＋等级 → ＋凝聚 → ×加成合计 → 最终）</summary>'
      + '<div class="pet-det-body">';
    PET_STAT_ROWS.forEach(function (r) {
      var k = r.k, row = petBonusRow(bd, k);
      var baseV = (bd.base && bd.base[k]) || 0;
      var add = (v.bonus && typeof v.bonus[k] === 'number') ? v.bonus[k] : 0;
      var poolV = (bd.poolFinal && bd.poolFinal[k]) || 0;
      var finalV = (bd.final && bd.final[k]) || 0;
      h += '<div class="pet-chain-line">' + r.ico + ' ' + r.name + '：基础 <b>' + baseV + '</b>'
        + ' → ＋等级 <b>' + (add > 0 ? '+' + add : '+0') + '</b>（' + v.bonusPct + '%）'
        + (row && row.participates
            ? ' → ＋凝聚 <b>' + (typeof petSignedValueTxt === 'function' ? petSignedValueTxt(row.cohesion) : row.cohesion) + '</b>'
              + ' → ×加成合计 <b>' + (typeof petPctTxt === 'function' ? petPctTxt(row.totalPct) : row.totalPct + '%') + '</b>'
              + ' → 池后 <b>' + poolV + '</b>'
            : ' → 速度不进池（×100%）')
        + ' → 最终 <b>' + finalV + '</b>'
        + '<span class="pet-sec-sub">（等级加成是最后的独立加项：池后值 ' + poolV + ' ＋ 等级 ' + add + ' ＝ ' + finalV + '）</span></div>';
    });
    h += '<div class="pet-src-note"><b>等级加成加在哪一层</b>：① 基础 → ＋凝聚 → ×（稀有度 ＋ Σ宝珠 ＋ Σ共鸣）'
      + ' → <b>＋等级加成</b> → 最终。等级% 的基数固定是「① 基础（图鉴＋炼化＋天赋静态）」，'
      + '加项 <b>不进百分比池</b>、也不进凝聚的基数 —— 所以每月清空等级时，'
      + '掉的是这 <b>+' + v.capPct + '%</b> 的基础加项，不会连带放大任何其它来源。</div>';
    h += '</div></details>';
  }
  h += '</div>';
  return h;
}

/* 宠物详情（属性/炼化/技能/天赋）
   v2.1.3：补炼化进度条、技能指定升级
   v2.1.4：天赋改为固有展示（按 design-v2.0.md §2.6 回退「槽位解锁」） */
function renderPetDetail(pet, idx) {
  var ov = document.getElementById('panelOverlay')
  if (!ov) return
  var d = getPetStore()
  var bag = d.materials || {}
  var codex = getPetCodex(pet.speciesId) || {}
  var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
    +'<button class="speed-btn tx-tap" id="petDBack">←</button>'
    /* v2.2.29：详情页头部也挂头像（与卡片同一个渲染入口） */
    +'<span class="pet-detail-ico">'+petIconHtml(pet.speciesId, 32)+'</span>'
    +'<span class="tx-h">'+(codex.name||pet.name)+' <span style="color:var(--purple);font-size:var(--fs-xs)">'+pet.rarity+'</span></span>'
    +'<span style="flex:1"></span>'
    +'<span style="font-size:var(--fs-sm);color:var(--text2)">✨ 灵能 <b>'+(bag.spirit||0)+'</b></span>'
    +'</div>'
  // 炼化进度（v2.1.3）
  var maxLv = refineMaxLevel(pet.rarity)
  var rl = pet.refineLevel || 0
  var pct = maxLv ? Math.min(100, Math.round(rl / maxLv * 100)) : 0
  var rateN = Math.round(refineSuccessRate(pet, 'refineNormal') * 100)
  var rateH = Math.round(refineSuccessRate(pet, 'refineHigh') * 100)
  h += '<div style="font-size:var(--fs-xs);line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:baseline;gap:6px;font-weight:700;margin-bottom:6px">'
    +'<span>✨ 炼化</span><span style="font-size:var(--fs-xl);color:var(--brand)">Lv'+rl+'</span>'
    +'<span class="tx-dim">/ '+maxLv+'</span><span style="flex:1"></span>'
    +'<span class="tx-dim-soft">'+pct+'%</span></div>'
    +'<div style="height:8px;background:var(--surface-3);border-radius:var(--r);overflow:hidden"><div style="width:'+pct+'%;height:100%;background:var(--brand-fill);border-radius:var(--r);transition:width var(--dur-2) var(--ease-out)"></div></div>'
    +'<div style="margin-top:6px;color:var(--text3)">成功率：普通石 '+(rateN ? rateN+'%' : '不可用（Lv≥50）')+'　·　高级石 '+rateH+'%</div>'
    +'</div>'
  /* v2.2 WP-I A-6：属性区重组 —— ① 基础属性 → ② 加成（凝聚固定值 ＋ 加成合计 ×N%）→ ③ 最终属性。
     ⚠️ **只重组展示与表达**：所有数字来自 pet-store.js 的 `petStatBreakdown()`
     （它又直接复用 createPetUnit / petTeamBaseScan / petBonusAdditivePool / boostPetForGroup
      这套数值口径，v2.16 起凝聚是「固定值加在基础上」、共鸣是「进池百分比」），
     本处**不另算一套**、不写存档、不引入新字号/颜色。 */
  var bd = (typeof petStatBreakdown === 'function') ? petStatBreakdown(pet) : null
  /* v2.17：🏅 宠物等级（成熟期经验等级）—— 等级 / 经验进度 / **等级提供的属性** */
  h += petLevelHtml(pet, bd)
  h += petStatSectionsHtml(bd, pet.rarity)
  // v2.2 WP-I A-6：对比宠物（同口径：两只宠都按「此宠上场计算」）
  h += petCompareHtml(pet)
  // v2.1.17 宝珠槽位
  h += orbSlotsHtml(pet, d).replace(/__IDX__/g, idx)
  // 技能（v2.1.3：指定技能升级，消耗灵能）
  h += '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">⚡ 技能 <span class="tx-dim-soft">（消耗 ✨ 升级，上限 Lv'+PET_SKILL_MAX_LEVEL+'）</span></div>'
  ;(codex.skills||[]).forEach(function(sid){
    var s = SKILLS[sid]
    if (!s) return
    var slv = pet.skillLevels ? pet.skillLevels[sid] || 0 : 0
    var cost = petSkillUpgradeCost(pet, sid)
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0">'
      +'<div style="flex:1">'+s.name+' <span class="tx-dim">· '+s.type+(s.power?' '+s.power+'%':'')+' · Lv'+slv+'</span></div>'
      +(slv >= PET_SKILL_MAX_LEVEL
        ? '<span style="color:var(--green);font-size:var(--fs-2xs)">已满级</span>'
        : '<button class="speed-btn tx-btn-sm" data-pet-skill="'+sid+'">⬆ '+cost+'✨</button>')
      +'</div>'
  })
  if (!(codex.skills||[]).length) h += '<div class="tx-dim">（无技能）</div>'
  h += '</div>'
  // 天赋（固有专属，design-v2.0.md §2.6：不可解锁、不可跨宠物装配）
  var curT = getPetTalents(pet)
  h += '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px">'
  h += '<div style="font-weight:700;margin-bottom:4px">✨ 天赋 <span class="tx-dim-soft">（固有 '+curT.length+' 个）</span></div>'
  if (!curT.length) h += '<div class="tx-dim">该稀有度暂无天赋</div>'
  curT.forEach(function(tid){
    var t = TALENTS[tid]
    h += '<div>'+(t?t.name:tid)+' <span class="tx-dim">· '+(t?t.desc:'')+'</span></div>'
  })
  h += '</div>'
  /* 重渲染前记下滚动位置，赋值后还原 —— 详情页比一屏高，
     「展开属性 / 换对比对象」都会重渲染，不还原就会弹回顶部。 */
  var _st = ov.scrollTop
  ov.innerHTML = '<div class="panel-inner">' + h + '</div>'
  ov.classList.add('open')   // 防御：直接调用详情时也能显示（原先依赖 panel 已打开）
  ov.scrollTop = _st
  var back = document.getElementById('petDBack')
  if (back) back.addEventListener('click', function(){ _petCompareSel = null; renderPetPanel() })
  /* v2.2 WP-I A-6：属性区交互（纯前端状态，不写存档、不开新页面）
     ③ 的属性行：点开看该属性的「基础 → 各来源 → 最终」（同一时刻只展开一行）
     ② 「加成来源」：展开各来源明细（每项都是 ×N%） */
  function paintPetStatDetail() {
    var box = document.getElementById('petStatDetail')
    var show = !!(bd && bd.ok && _petStatOpen)
    if (box) {
      box.innerHTML = show ? petStatChainHtml(bd, _petStatOpen) : ''
      box.hidden = !show
    }
    ov.querySelectorAll('[data-pet-stat]').forEach(function (b) {
      var on = b.getAttribute('data-pet-stat') === _petStatOpen
      b.setAttribute('aria-expanded', on ? 'true' : 'false')
      b.classList.toggle('active', on)
    })
  }
  ov.querySelectorAll('[data-pet-stat]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-pet-stat')
      _petStatOpen = (_petStatOpen === k) ? null : k
      paintPetStatDetail()
    })
  })
  var srcBtn = document.getElementById('petBonusSrcBtn')
  if (srcBtn) srcBtn.addEventListener('click', function () {
    _petSrcOpen = !_petSrcOpen
    srcBtn.setAttribute('aria-expanded', _petSrcOpen ? 'true' : 'false')
    srcBtn.textContent = (_petSrcOpen ? '▾ ' : '▸ ') + (srcBtn.getAttribute('data-label') || '加成来源')
    var box = document.getElementById('petBonusSrc')
    if (box) box.hidden = !_petSrcOpen
  })
  /* 对比宠物：点宠物名开始对比；再点同一只 = 结束（可换对象、可退出，无新页面/路由） */
  function petDetailRerender() {
    var p2 = getPetStore().pets[idx]
    if (p2) renderPetDetail(p2, idx)
  }
  ov.querySelectorAll('[data-pet-cmp]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sid = btn.getAttribute('data-pet-cmp')
      _petCompareSel = (_petCompareSel === sid) ? null : sid
      petDetailRerender()
    })
  })
  var cmpExit = document.getElementById('petCmpExit')
  if (cmpExit) cmpExit.addEventListener('click', function () {
    _petCompareSel = null
    petDetailRerender()
  })
  // 技能升级
  ov.querySelectorAll('[data-pet-skill]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sid = btn.getAttribute('data-pet-skill')
      var d3 = getPetStore()
      var p3 = d3.pets[idx]
      if (!p3) return
      var r = upgradePetSkill(p3, d3.materials, sid)
      if (r.ok) { savePetStore(d3); toast('⚡ '+((SKILLS[sid]||{}).name||sid)+' → Lv'+r.level+'（-'+r.cost+' ✨）','s') }
      else { toast(r.reason || '升级失败','e') }
      renderPetDetail(p3, idx)
    })
  })
  // v2.1.17 宝珠：装配 / 升级 / 卸下
  ov.querySelectorAll('[data-orb-op]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var op = btn.getAttribute('data-orb-op')
      var t = btn.getAttribute('data-orb-type')
      var oid = btn.getAttribute('data-orb-id')
      var d8 = getPetStore()
      var p8 = d8.pets[idx]
      if (!p8) return
      if (op === 'equip') {
        var arr8 = d8.orbs || [], i8 = -1
        arr8.forEach(function(o, k){ if (o.id === oid) i8 = k })
        if (i8 < 0) { toast('宝珠不存在','e'); return }
        var orb8 = arr8.splice(i8, 1)[0]
        var old8 = (p8.orbs || {})[orb8.type]
        equipOrb(p8, orb8)
        if (old8) arr8.push(old8)          // 被替换下来的回库存
        savePetStore(d8)
        toast('💎 装配 ' + ((ORB_TYPES[orb8.type]||{}).name||orb8.type) + '（' + orb8.rarity + '）','s')
      } else if (op === 'unequip') {
        var r8 = unequipOrb(p8, t)
        if (!r8.ok) { toast(r8.reason || '卸下失败','e'); return }
        d8.orbs = d8.orbs || []
        d8.orbs.push(r8.orb)
        savePetStore(d8)
        toast('📤 已卸下','s')
      } else if (op === 'upgrade') {
        var o8 = (p8.orbs || {})[t]
        if (!o8) return
        var u8 = upgradeOrb(o8, d8.materials)
        if (!u8.ok) { toast(u8.reason || '升级失败','e'); return }
        savePetStore(d8)
        /* v2.15：upgradeOrb() 返回 {level,rarity,promoted,pct}，**没有 stat 字段** ——
           旧代码读了不存在的字段会显示「（+undefined）」。改报加成百分点；升品质时补一句。 */
        toast('⬆ Lv' + u8.level + '（+' + u8.pct + '%）'
          + (u8.promoted ? ' · 升品质 ' + u8.rarity : ''), 's')
      }
      renderPetDetail(d8.pets[idx], idx)
    })
  })
}

/* 带宠物的敌群试炼 —— **回归唯一开战入口** `startGroupTrial()`
   v2.2 WP-H2（修「从固定小关开始 + 胜利覆盖进度」）：
   旧实现自己拼了一份开战逻辑（`GROUP_LEVELS['g5']` 写死大关 + 只取 `stages[0]`），
   并且**从不设置模块级的 `_groupStageId`** —— 于是：
     ① 战斗永远从写死的大关第 1 小关开始，而不是玩家当前进度；
     ② 胜利时 `_groupDone()` 读到的是**上一次 `startGroupTrial()` 留下的** `_groupStageId`，
        调 `markGroupStageCleared(旧关)` + 发奖励 → 把玩家真实进度覆盖成别人的通关记录。
   另外它还漏了 `_groupRewarded` 重置 / 随机种子 / `attachPlayerSkills` / 场地提示 / 已通关守卫。
   现在只把「参战选择」交给 `startGroupTrial`（它本就会读 `_petBattlePicks`），逻辑只有一份。 */
function startGroupTrialWithPets(groupId, petIds) {
  if (Array.isArray(petIds)) {
    _petBattlePicks = petIds.slice()
    if (typeof savePetBattlePicks === 'function') savePetBattlePicks(_petBattlePicks)
  }
  if (typeof startGroupTrial !== 'function') { toast('敌群模块未加载', 'e'); return }
  startGroupTrial(groupId)
}

;
/* ===== game-views.js ===== */
/* ============================================
   MyHealth — Game Tab Views (挑战页重构)
   三个选项卡：培养 / 战斗 / 记录
   排版规范：按钮大（min-height 48px）、呼吸感（间距 14-16px）、字号 12/14-16/18
   依赖 game-render.js（战斗逻辑复用）
   ============================================ */

var _gameTab = 'train'   // 'train' | 'battle' | 'record'

/* v2.14.26（评审 P2-4 / P2-7）：本文件的空态统一走 utils.js 的 emptyHtml（.empty 组件）。
   测试沙箱只加载本文件、不带 utils.js，故留一个同构的降级实现，保证两处渲染出的 DOM 完全一致。 */
function gvEmpty(emoji, title, sub) {
  if (typeof emptyHtml === 'function') return emptyHtml(emoji, title, sub, '')
  return '<div class="empty"><span class="empty-e">' + emoji + '</span>'
    + '<div class="empty-t">' + title + '</div>'
    + (sub ? '<div class="empty-s">' + sub + '</div>' : '') + '</div>'
}

/* 主入口：渲染挑战页（替代原 renderGame 的视图部分） */
function renderGameViews() {
  renderGameTabBar()
  renderTrainView()
  renderBattleView()
  renderRecordView()
  switchGameTab(_gameTab)
}

/* 选项卡栏事件（index.html 静态按钮） */
function renderGameTabBar() {
  document.querySelectorAll('[data-gtab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchGameTab(btn.getAttribute('data-gtab'))
    })
  })
}

function switchGameTab(tab) {
  _gameTab = tab
  document.querySelectorAll('[data-gtab]').forEach(function (b) {
    var on = b.getAttribute('data-gtab') === tab
    b.classList.toggle('active', on)
    b.style.borderColor = on ? 'var(--orange)' : ''
    b.style.color = on ? 'var(--orange)' : ''
  })
  var vTrain = document.getElementById('gameTrainView')
  var vBattle = document.getElementById('gameBattleView')
  var vRecord = document.getElementById('gameRecordView')
  if (!vTrain) return
  vTrain.style.display = tab === 'train' ? 'block' : 'none'
  vBattle.style.display = tab === 'battle' ? 'block' : 'none'
  vRecord.style.display = tab === 'record' ? 'block' : 'none'
  // 关卡列表只在战斗视图内展开时可见（防漏到培养/记录页）
  var gc = document.getElementById('gameContent')
  if (gc) gc.style.display = (tab === 'battle' && gc._levelViewOpen) ? 'block' : 'none'
}

/* ===== 培养视图：角色属性卡 + 宠物 + 技能 ===== */
function renderTrainView() {
  var v = document.getElementById('gameTrainView')
  if (!v) return
  var stats = getGameStats()
  /* WP-G：角色等级系统 —— 结算季度/周（幂等）并把等级加成并进展示属性
     （与单敌/敌群战斗同一口径：等级效果无任何倍率，敌群 ×2 已按作者裁决删除） */
  if (typeof syncLevel === 'function') syncLevel()
  if (typeof applyPlayerLevelBonus === 'function') applyPlayerLevelBonus(stats)
  var _lv = (typeof levelState === 'function') ? levelState() : null
  /* 称号：文案唯一来源 = page/level-titles.js（经 level-system.js 的 levelTitle() 取），
     展示层不写死任何称号文案；levelState 不可用时回落 lv1 档称号 */
  var _lvTitle = (typeof levelTitle === 'function') ? levelTitle(_lv ? _lv.level : 1) : ''
  var _lvInline = _lv
    ? ('Lv ' + _lv.level + ' · ' + _lvTitle + ' · 经验 ' + _lv.inLevel + '/' + _lv.need)
    : ('Lv ' + ((typeof LEVEL_START === 'number') ? LEVEL_START : 1) + ' · ' + _lvTitle)
  var st = getSkillState()
  var d = getPetStore()

  // 角色属性卡
  /* v2.14.13：这里原来是 `background:linear-gradient(135deg,var(--bg2),var(--bg2))`（两端同色的假渐变）。
     v2.14.9 的守卫 `[style*="gradient"]{background-image:none!important}` 抽掉渐变后，
     内联 background 简写只剩 background-color:transparent → 卡片**丢掉了表面底色**。
     反正两端同色，直接写实色底（扁平规范也禁渐变）。 */
  var h = '<div style="background:var(--bg2);border:var(--bw) solid var(--orange-g);border-radius:16px;padding:18px;margin-bottom:16px">'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    +'<div style="font-size:var(--fs-2xl);width:56px;height:56px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--orange)">🧑</div>'
    +'<div style="flex:1"><div class="tx-h">我的角色</div>'
    +'<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">'+_lvInline+'</div></div>'
    +'<div style="text-align:center;background:var(--bg2);border-radius:12px;padding:8px 16px"><div style="font-size:var(--fs-2xl);font-weight:700;color:var(--orange)">⚔️ '+stats.atk+'</div><div class="tx-note">攻击</div></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
    +statCell('❤️','生命',stats.hp)
    +statCell('🛡️','防御',stats.def)
    +statCell('👻','魂攻',stats.soulAtk||0)
    +statCell('🔮','魂防',stats.soulDef||0)
    +statCell('🏆','通关',getGame().cleared.length)
    +statCell('💠','技能点',st.points)
    +'</div>'
    +'</div>'
  /* ===== v2.15 出战阵容卡 → **v2.14.24 改为多队摘要**（作者裁决：
     「培养页 .train-lineup 用多队入口代替参战阵容模块」）=====
     · 只读摘要：按编队顺序列出每支小队（首发打头），点任一队 = 打开宠物面板的编队管理；
     · 不再在这里做「点宠物名切换」—— 选择入口收敛到编队管理（唯一编辑器），
       避免编排逻辑分散在两处（宠物面板的「参战阵容」是首队的只读镜像，两处恒等）。
     · 数据仍全部来自 pet-store 的 getPetSquads()（单一来源，不在这里推导上限/互斥）。 */
  var _readyPets = d.pets.filter(function(p){ return p.stage === 'mature' && !p.isDead })
  if (typeof ensurePetBattlePicksLoaded === 'function') ensurePetBattlePicksLoaded()
  var _petMax = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4
  var _squads = (typeof getPetSquads === 'function') ? getPetSquads() : []
  var _readyById = {}
  _readyPets.forEach(function (p) { _readyById[p.speciesId] = p })
  var _squadPets = 0
  _squads.forEach(function (sq) { _squadPets += (sq.petIds || []).length })
  h += '<div class="train-lineup">'
    + '<div class="train-lineup-hd">⚔️ 出战编队'
    +   '<span class="train-lineup-count">' + _squads.length + ' 队 · ' + _squadPets + ' 只</span>'
    +   '<span class="train-lineup-hint">' + (_squads.length > 1 ? '首发打头 · 其余按序接力 / 分场' : '单队 · 点开可加第二队') + '</span></div>'
    + '<div class="train-squads">'
  if (!_readyPets.length) {
    h += '<div class="train-lineup-empty">还没有可出战的成熟宠物 🐾<br>先在宠物面板里养成一只成熟宠物</div>'
  } else if (!_squads.length) {
    h += '<div class="train-lineup-empty">还没有编队 · 点下面「编队管理」建一支</div>'
  } else {
    _squads.forEach(function (sq, i) {
      var ids = (sq.petIds || []).slice()
      var chips = ''
      ids.forEach(function (sid) {
        var p = _readyById[sid]
        var nm = ((typeof getPetCodex === 'function' && (getPetCodex(sid) || {}).name) || (p && p.name) || sid)
        var off = !p   /* 未成熟 / 已阵亡：留在队里但本场不上场 */
        chips += '<span class="train-squad-chip' + (off ? ' is-off' : '') + '" title="'
          + (off ? '未成熟或已阵亡：留在队里，本场不会上场' : nm) + '">'
          + ((typeof petIconHtml === 'function') ? petIconHtml(sid, 16) : '🐾')
          + '<span>' + nm + '</span></span>'
      })
      if (!ids.length) chips = '<span class="train-squad-empty">空队 · 点开把宠物编进来</span>'
      /* v2.14.25（评审 P2-4）：整行是 button，但原来没有任何「可点」信号 —— 补一个 › 与 aria 提示，
         并把 hover/active 反馈交给 CSS（.train-squad-row:hover） */
      h += '<button class="speed-btn train-squad-row" type="button" data-train-squad="' + sq.id + '"'
        + ' aria-label="' + sq.name + '（' + (i === 0 ? '首发' : '第 ' + (i + 1) + ' 队') + '），'
        + ids.length + '/' + _petMax + ' 只，点开编队管理">'
        + '<span class="train-squad-top">'
        +   '<span class="train-squad-badge' + (i === 0 ? ' is-first' : '') + '">' + (i === 0 ? '首发' : '第 ' + (i + 1) + ' 队') + '</span>'
        +   '<span class="train-squad-name">' + sq.name + '</span>'
        +   '<span class="train-squad-count">' + ids.length + '/' + _petMax + '</span>'
        +   '<span class="train-squad-caret" aria-hidden="true">›</span>'
        + '</span>'
        + '<span class="train-squad-chips">' + chips + '</span>'
        + '</button>'
    })
  }
  h += '</div>'
    + '<button class="speed-btn btn-primary train-start-battle" id="trainStartBattle" type="button">'
    +   '⚔️ 开始敌群试炼（带宠物）</button>'
    + '<button class="speed-btn btn-entry" id="trainSquadEdit" type="button" data-open-squad>'
    +   '🐾 编队管理（多队 / 替补顺序）<span class="btn-caret" aria-hidden="true">›</span></button>'
    + '<button class="speed-btn btn-entry" id="trainMorePet" type="button" data-open-pet>'
    +   '🐾 更多养成（喂食 / 炼化 / 宝珠）<span class="btn-caret" aria-hidden="true">›</span></button>'
    + '</div>'
  // 技能区块
  h += '<div class="tx-sec">⚡ 技能 <span class="tx-note">'+(st.loadout||[]).filter(Boolean).length+'/'+st.slotsUnlocked+' 已装备</span></div>'
  h += '<button class="speed-btn btn-entry" data-open-skill>⚡ 技能培养面板<span class="btn-caret" aria-hidden="true">›</span></button>'
  /* v2.14.3：📖 图鉴（只读）—— 主入口。宠物面板 / 技能面板就在上面两行，
     图鉴要查的正是这三样东西（宠物 / 技能 / 天赋），放成一排最顺手。
     不新增 tab、不新增路由：点开复用 #panelOverlay，渲染在 page/codex.js。 */
  h += '<button class="speed-btn btn-entry" data-open-codex>📖 图鉴（宠物 / 技能 / 天赋）<span class="btn-caret" aria-hidden="true">›</span></button>'
  h += '<div class="tx-sec">🔮 炼魂 <span class="tx-note">角色属性强化</span></div>'
  h += '<button class="speed-btn btn-entry" data-open-refine>🔮 炼魂系统<span class="btn-caret" aria-hidden="true">›</span></button>'
  /* 材料区块：v2.15 精简 —— 「获取方式 + 最近获取」两张长卡合并进一个默认折叠的
     原生 <details>，培养页首屏只剩角色卡 / 出战阵容 / 技能 / 炼魂 / 图鉴五个主块。
     用原生 details 而非自定义 aria-expanded，键盘 / 读屏开箱可用。 */
  var log = d.materialLog || []
  h += '<details class="train-mat-fold">'
    + '<summary>📦 道具材料 <span class="train-fold-hint">获取与记录 · 点开查看</span></summary>'
    + '<div class="train-mat-body">'
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:12px">'
  h += '<div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:8px">💡 获取方式</div>'
  Object.keys(MATERIAL_NAMES).forEach(function(t){
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:var(--fs-sm);border-bottom:1px solid var(--bg2)">'
      +'<span style="width:110px;font-weight:600">'+getMaterialName(t)+'</span>'
      +'<span style="flex:1;color:var(--text3);font-size:var(--fs-xs)">'+MATERIAL_SOURCES[t]+'</span>'
      +'<span class="tx-b">×'+(d.materials[t]||0)+'</span>'
      +'</div>'
  })
  h += '</div>'
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px">'
  h += '<div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:8px">📜 最近获取</div>'
  if (!log.length) {
    h += '<div style="font-size:var(--fs-sm);color:var(--text3);text-align:center;padding:14px">暂无获取记录<br><span class="tx-xs">通关隐藏挑战可获得材料</span></div>'
  } else {
    log.slice(0, 10).forEach(function(l){
      h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:var(--fs-sm);border-bottom:1px solid var(--bg2)">'
        +'<span style="flex:1">'+getMaterialName(l.type)+'</span>'
        +'<span style="color:var(--green);font-weight:700;font-size:var(--fs-base)">+'+(l.n||1)+'</span>'
        +'<span class="tx-note">'+l.date+'</span>'
        +'</div>'
    })
  }
  h += '</div>'
  h += '</div></details>'
  v.innerHTML = h
  /* v2.14.24：培养页不再就地切换宠物 —— 点任一队（或「编队管理」按钮）都打开
     宠物面板的编队管理（唯一编辑器）；`_petSquadsOpen` 是 pet-ui.js 的纯 UI 态。 */
  function openSquadEditor() {
    if (typeof renderPetPanel !== 'function') { toast('宠物面板未加载', 'e'); return }
    if (typeof _petSquadsOpen !== 'undefined') _petSquadsOpen = true
    renderPetPanel()
  }
  v.querySelectorAll('[data-train-squad], [data-open-squad]').forEach(function (btn) {
    btn.addEventListener('click', openSquadEditor)
  })
  /* v2.15：培养页直接开战 —— 目标关取 currentGroupStageId()（唯一进度源），
     开战仍走 startGroupTrialWithPets() → startGroupTrial()，不另建战斗对象。 */
  var trainStartBtn = document.getElementById('trainStartBattle')
  if (trainStartBtn) trainStartBtn.addEventListener('click', function(){
    var stage = (typeof currentGroupStageId === 'function') ? currentGroupStageId() : null
    if (!stage) { toast('暂无可挑战的敌群关卡', 'e'); return }
    if (typeof startGroupTrialWithPets === 'function') startGroupTrialWithPets(stage, (_petBattlePicks || []).slice())
    else if (typeof startGroupTrial === 'function') startGroupTrial(stage)
    else toast('敌群模块未加载', 'e')
  })
  var petBtn = v.querySelector('[data-open-pet]')
  if (petBtn) petBtn.addEventListener('click', function () { renderPetPanel() })
  var skillBtn = v.querySelector('[data-open-skill]')
  if (skillBtn) skillBtn.addEventListener('click', function () { renderSkillPanel() })
  /* v2.14.3：📖 图鉴（只读面板，渲染在 page/codex.js）—— 模块未加载时提示，不留死按钮 */
  var codexBtn = v.querySelector('[data-open-codex]')
  if (codexBtn) codexBtn.addEventListener('click', function () {
    if (typeof renderCodexPanel === 'function') renderCodexPanel()
    else toast('图鉴模块未加载', 'e')
  })
  var refineBtn = v.querySelector('[data-open-refine]')
  if (refineBtn) refineBtn.addEventListener('click', function () { if (typeof showRefineDialog === 'function') showRefineDialog(); else toast('炼魂系统未解锁（需通关解锁）','e') })
}

function statCell(icon, label, val) {
  return '<div style="background:var(--bg2);border-radius:12px;padding:10px 6px"><div class="tx-h">'+icon+' '+val+'</div><div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">'+label+'</div></div>'
}

/* ===== 战斗视图：本旬目标 + 敌群 + 关卡 ===== */

/* v2.14.24：关卡形态标签 —— 开战前就能看出本关是「双场景 / 双 BOSS」。
   判定只在 group-levels.js 的 `stageModeLabel(lg, st)`（唯一来源）；模块缺失时不显示，不猜。 */
function groupStageModeTag(glv, st) {
  if (typeof stageModeLabel !== 'function' || !glv || !st) return ''
  var lgNum = parseInt(String(glv.id || '').replace(/[^0-9]/g, ''), 10)
  var stNum = parseInt(String(st.id || '').split('-').pop(), 10)
  if (!lgNum || !stNum) return ''
  var label = stageModeLabel(lgNum, stNum)
  /* v2.14.25（评审 P2-3）：**只标例外** —— 「双场景」已是常态（224/240 关），逐卡重复等于噪声；
     常规形态改由列表头一行说明（见 showGroupStages 的 .gl-modes）。 */
  if (label !== '双 BOSS') return ''
  return '<span class="lv-tag is-boss">' + label + '</span>'
}

/* 大关内 10 小关列表 */
function showGroupStages(groupId) {
  var glv = (GROUP_LEVELS || {})[groupId]
  if (!glv) return
  var v = document.getElementById('gameBattleView')
  if (!v) return
  // v2.1.7：大关内页也直接显示本大关进度（外侧看不到进度是历史痛点）
  var pg = groupClearedCount(groupId)
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
    +'<button class="speed-btn tx-tap" id="groupBack">←</button>'
    +'<span class="tx-h">'+glv.name+'</span>'
    +'<span class="gl-group-count">'+pg.cleared+'/'+pg.total+'</span>'
    +'</div>'
  h += '<div style="font-size:var(--fs-xs);color:var(--text3);margin-bottom:12px">'+glv.desc+'</div>'
  /* v2.14.25（评审 P2-3）：形态分布一次性说清（原来 10 张卡里 9 张重复「双场景」，把「双 BOSS」淹没） */
  var lgNum = parseInt(String(groupId).replace(/[^0-9]/g, ''), 10)
  if (typeof stageModeLabel === 'function' && lgNum) {
    var modes = { '双场景': 0, '双 BOSS': 0, '': 0 }
    glv.stages.forEach(function (st) {
      var lb = stageModeLabel(lgNum, parseInt(String(st.id || '').split('-').pop(), 10)) || ''
      modes[lb] = (modes[lb] || 0) + 1
    })
    var parts = []
    if (modes['双场景']) parts.push(modes['双场景'] + ' 关双场景')
    if (modes['双 BOSS']) parts.push('<b class="gl-modes-boss">' + modes['双 BOSS'] + ' 关双 BOSS</b>')
    if (modes['']) parts.push(modes[''] + ' 关单场景')
    h += '<div class="gl-modes">本大关 ' + glv.stages.length + ' 关：' + parts.join(' · ') + '</div>'
  }
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:8px">'
  glv.stages.forEach(function (st) {
    var cleared = isGroupStageCleared(st.id)
    var unlocked = isGroupStageUnlocked(st.id)
    var icon = st.type === 'boss' ? '👑' : st.type === 'elite' ? '⭐' : '⚔️'
    /* v2.14.25：状态与类型全部走类（.lv-card.is-open / .done / .locked / .is-boss / .is-elite）——
       原来这 4 种视觉写在内联 style 里，被「内联语义色收敛」那条 !important 规则统一收成中性，
       于是整屏 10 张卡长得一模一样，看不出哪关是 Boss / 哪关能打。 */
    var stateCls = cleared ? ' done' : (unlocked ? ' is-open' : ' locked')
    var typeCls = st.type === 'boss' ? ' is-boss' : st.type === 'elite' ? ' is-elite' : ''
    var statusHtml = cleared ? '<span class="lv-state">✅ 已通关</span>'
      : unlocked ? '<span class="lv-state">⚔️ 可挑战</span>'
      : '<span class="lv-state">🔒 未解锁</span>'
    h += '<button class="speed-btn gl-stage'+typeCls+stateCls+'" data-stage="'+st.id+'" '
      +(unlocked && !cleared ? '' : 'disabled')+'>'
      +'<span class="lv-card-ico">'+icon+'</span>'
      +'<span class="lv-stage-name">'+st.name.replace(/^[\s⭐👑\uFE0F\u200D]+/,'')+'</span>'
      + groupStageModeTag(glv, st)
      +statusHtml
      +'</button>'
  })
  h += '</div>'
  // 进度条
  var stats = groupProgressStats()
  h += '<div style="margin-top:12px;font-size:var(--fs-sm);color:var(--text3)">📈 敌群进度：'+stats.cleared+'/'+stats.total+' 关通关</div>'
  v.innerHTML = h
  var back = document.getElementById('groupBack')
  if (back) back.addEventListener('click', function () { renderBattleView() })
  v.querySelectorAll('[data-stage]').forEach(function (c) {
    c.addEventListener('click', function () { startGroupTrial(c.getAttribute('data-stage')) })
  })
}
function renderBattleView() {
  var v = document.getElementById('gameBattleView')
  if (!v) return
  var stats = getGameStats()
  var h = ''

  // 本旬目标卡
  var p = stats.period
  var wkDone = stats.periodDays >= 6
  /* v2.14.26（评审 P1-A / P2-6）：原来第三卡把 `'💪 0/6天'` 拼成一整串塞进三等分卡（360 下每卡约 100px），
     实机折成「0/6 / 天 / 状态」三行；而且它与第一卡的数值完全重复（同一组数据渲染两次）。
     现在：数字与单位拆成两个 span（单位小一号 + 整行 nowrap），第三卡只表达「本旬达标」状态，
     三卡数值统一中性色，只有达成时转绿。 */
  h += '<div class="period-card">'
    +'<div class="period-hdr-line">🗓️ 本旬目标 · '+p.name+'</div>'
    +'<div class="period-kpi-row">'
    +'<div class="period-kpi"><div class="period-kpi-v">'+stats.periodDays+'<span class="period-kpi-u">/6天</span></div><div class="period-kpi-l">训练天数</div></div>'
    /* v2.2 WP-H3：`sumVolume()` 返回浮点，直接内插会渲染出 2862.1000000000004kg 这类尾数。
       展示层取整（与 tab-strength.js:39 / game-render.js:36 的同名「旬容量」显示一致），不动数值本身。 */
    +'<div class="period-kpi"><div class="period-kpi-v">'+Math.round(stats.periodVol)+'<span class="period-kpi-u">kg</span></div><div class="period-kpi-l">旬容量</div></div>'
    +'<div class="period-kpi'+(wkDone?' is-done':'')+'"><div class="period-kpi-v">'+(wkDone?'已达标':'差 '+(6-stats.periodDays)+' 天')+'</div><div class="period-kpi-l">本旬状态</div></div>'
    +'</div></div>'

  // 敌群战斗（v2.1.7：12 大关 × 10 小关；文案与进度均由数据派生，不再写死）
  var gStats = groupProgressStats()
  var gKeys = Object.keys(GROUP_LEVELS || {})
  h += '<div class="tx-sec">👥 敌群试炼'
    +' <span class="tx-note">'+gKeys.length+' 大关 · 每关 10 小关 · 已通关 '+gStats.cleared+'/'+gStats.total+'</span></div>'
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">'
  gKeys.forEach(function (k) {
    var glv = GROUP_LEVELS[k]
    var pg = groupClearedCount(glv.id)
    var pct = pg.total ? Math.round(pg.cleared / pg.total * 100) : 0
    var stateText = pg.state === 'done' ? '✅ 已通关' : pg.state === 'progress' ? '⚔️ 进行中' : '🔒 未开启'
    h += '<button class="speed-btn gl-group-card state-'+pg.state+'" data-group="'+glv.id+'"'
      +' aria-label="'+glv.name+'，已通关 '+pg.cleared+' / '+pg.total+'，'+stateText+'">'
      +'<span class="gl-group-top">'
      +'<span class="gl-group-name">'+glv.name+'</span>'
      +'<span class="gl-group-count">'+pg.cleared+'/'+pg.total+'</span>'
      +'</span>'
      +'<span class="gl-group-desc">'+glv.desc+'</span>'
      +'<span class="gl-bar"><span class="gl-bar-fill'+(pg.state==='done'?' done':'')+'" style="width:'+pct+'%"></span></span>'
      +'<span class="gl-group-state">'+stateText+'</span>'
      +'</button>'
  })
  h += '</div>'

  // 关卡试炼（原关卡列表，简化为入口）
  h += '<div class="tx-sec">⚔️ 关卡试炼</div>'
  h += '<button class="speed-btn btn-entry" data-open-levels>🗺️ 挑战关卡（'+Object.keys(LEVELS).length+' 章）<span class="btn-caret" aria-hidden="true">›</span></button>'

  v.innerHTML = h
  v.querySelectorAll('[data-group]').forEach(function (c) {
    c.addEventListener('click', function () { showGroupStages(c.getAttribute('data-group')) })
  })
  var lvBtn = v.querySelector('[data-open-levels]')
  if (lvBtn) lvBtn.addEventListener('click', function () {
    // 展开关卡列表（复用 gameContent，标记打开状态）
    var gc = document.getElementById('gameContent')
    var vv = document.getElementById('gameBattleView')
    if (gc && vv) {
      gc._levelViewOpen = true
      gc.style.display = 'block'
      vv.style.display = 'none'
      renderGame()
    }
  })
}

/* ===== v2.13.0 批次 B：战斗记录（⚔️）辅助 ===== */
/* endedAt(ISO) → 本机可读时间。非法 / 缺失值原样回显（绝不渲染 "Invalid Date"）。 */
function bhTime(iso) {
  var d = new Date(iso)
  if (!d || isNaN(d.getTime())) return String(iso == null ? '' : iso)
  function p(n) { return (n < 10 ? '0' : '') + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
/* 存档里的名字 / 关卡名一律转义（escHtml 来自 game-render.js，缺模块时降级为原样但仍是字符串） */
function bhEsc(s) {
  var v = (s == null) ? '' : String(s)
  return (typeof escHtml === 'function') ? escHtml(v) : v
}
/* 胜率：分母 0（null）→ 「—」（不得把「无数据」显示成 0%） */
function bhRate(r) { return (typeof r === 'number') ? (Math.round(r * 1000) / 10) + '%' : '—' }
/* 可得性口径：null = 本模式不适用（如单敌无治疗通道）→「不适用」，不得以 0 冒充 */
function bhVal(v) { return (v == null) ? '不适用' : v }

/* 战斗记录区块（单敌 / 敌群**分列**，禁止跨模式合并排名）。
   数据源 = battle-history.js；缺模块时整块走空状态，不抛错。 */
function renderBattleHistoryBlock() {
  var BH_MODES = [['single', '⚔️ 单敌挑战'], ['group', '👥 敌群试炼']]
  var hist = (typeof battleHistoryList === 'function') ? (battleHistoryList() || []) : []
  var h = '<h2 class="section-hdr">⚔️ 战斗记录 '
    + '<span style="font-size:var(--fs-xs);color:var(--text3);font-weight:400">单敌 / 敌群分列 · 各计各的</span></h2>'
  if (!hist.length) {
    /* 空状态：明确「无记录」，与「0 场」区分开；v2.14.26 起与其它空态同壳（.empty） */
    return h + gvEmpty('⚔️', '暂无战斗记录', '完成一场挑战后自动记录')
  }
  BH_MODES.forEach(function (m) {
    var mk = m[0]
    var st = (typeof battleHistoryStats === 'function') ? battleHistoryStats(mk) : null
    h += '<div style="background:var(--bg2);border:var(--bw) solid var(--bd-l);border-radius:14px;padding:14px;margin-bottom:10px">'
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      + '<span class="tx-b">' + m[1] + '</span>'
      + '<span style="flex:1"></span>'
      + '<span class="tx-sub">' + (st ? ('共 ' + st.total + ' 场') : '—') + '</span>'
      + '</div>'
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
      + statCell('📊', '场次', st ? st.count : '—')
      + statCell('🎯', '胜率', st ? bhRate(st.winRate) : '—')
      + statCell('🔥', '当前连胜', st ? st.currentStreak : '—')
      + statCell('🏅', '最佳连胜', st ? st.bestStreak : '—')
      + statCell('⏱️', '平均回合', (st && st.avgRounds != null) ? st.avgRounds : '—')
      + '</div>'
    if (st && st.abortedCount > 0) {
      h += '<div style="font-size:var(--fs-2xs);color:var(--text3);margin-top:8px">⚠️ 异常中止 ' + st.abortedCount + ' 次（不计胜率、不打断连胜）</div>'
    }
    h += '</div>'
  })
  /* 最近战斗：最多 10 条、最新在前；两种模式混排但**逐条标出模式**，不做跨模式排名 */
  var recent = (typeof battleHistoryRecent === 'function') ? (battleHistoryRecent(10) || []) : hist.slice(-10).reverse()
  h += '<div style="font-size:var(--fs-sm);font-weight:700;margin:14px 0 8px">🕒 最近战斗 '
    + '<span class="tx-sub">最多 10 条</span></div>'
  if (!recent.length) {
    h += gvEmpty('🕒', '暂无战斗记录', '完成一场挑战后自动记录')
    return h
  }
  var labels = { single: '⚔️ 单敌', group: '👥 敌群' }
  recent.forEach(function (r) {
    var res = r.result === 'win' ? '<b class="tx-ok">胜</b>'
      : (r.result === 'loss' ? '<b class="tx-err">败</b>' : '<b class="tx-warn">异常中止</b>')
    var stageName = ''
    if (typeof findLevel === 'function') { var lv = findLevel(r.stageId); if (lv && lv.npc) stageName = lv.npc }
    if (!stageName && typeof getGroupStage === 'function') { var gs = getGroupStage(r.stageId); if (gs && gs.name) stageName = gs.name }
    h += '<div style="background:var(--bg2);border-radius:12px;padding:12px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm)">'
      + '<span class="tx-dim">' + bhEsc(bhTime(r.endedAt)) + '</span>'
      + '<span>' + bhEsc(labels[r.mode] || r.mode) + '</span>'
      + '<span style="flex:1"></span>' + res + '</div>'
      + '<div style="font-size:var(--fs-xs);color:var(--text2);margin-top:6px">🗺️ ' + bhEsc(r.stageId || '—')
      + (stageName ? ' · ' + bhEsc(stageName) : '') + ' · ⏱️ ' + (r.rounds || 0) + ' 回合</div>'
      + '<div style="font-size:var(--fs-xs);color:var(--text2);margin-top:4px">⚔️ 输出 ' + bhVal(r.metrics.playerDealt)
      + ' · 🛡️ 承伤 ' + bhVal(r.metrics.playerTaken) + ' · 💚 治疗 ' + bhVal(r.metrics.playerHealed) + '</div>'
      + (r.mode === 'group' ? '<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">🌍 场地 ' + bhVal(r.metrics.terrain)
        + ' · ☠️ DOT ' + bhVal(r.metrics.dot) + ' · 🛡️ 护盾 ' + bhVal(r.metrics.shield) + '</div>' : '')
      + (r.note ? '<div style="font-size:var(--fs-2xs);color:var(--text3);margin-top:4px">ℹ️ ' + bhEsc(r.note) + '</div>' : '')
      + '</div>'
  })
  return h
}

/* ===== 记录视图：本月最佳 + 历史最佳 ===== */
function renderRecordView() {
  var v = document.getElementById('gameRecordView')
  if (!v) return
  var prs = store.get('prs') || {}
  var stats = getGameStats()
  var h = ''

  h += '<h2 class="section-hdr">🏆 历史最佳</h2>'
  var keys = Object.keys(prs)
  if (!keys.length) {
    /* v2.14.26（评审 P2-4 / P2-7）：空态统一走 utils.js 的 emptyHtml（.empty 组件：2px 容器边 + 居中 + 可选 CTA），
       不再各页自造「无边框浅块 / 2px 巨框 / 奖杯大留白」三套壳。 */
    h += gvEmpty('🏆', '暂无最佳记录', '去训练并完成挑战吧', '')
  } else {
    /* v2.2 WP-H3 同口径：`pr.maxVolume` 由 `w×reps` 得出，可能是浮点（1.1×3 = 3.3000000000000003），
       展示层取整，不改存档里的 PR 值 */
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
    keys.slice(0, 8).forEach(function (k) {
      var pr = prs[k]
      h += '<div style="background:var(--bg2);border-radius:12px;padding:12px">'
        +'<div style="font-size:var(--fs-base);font-weight:600">'+k+'</div>'
        +'<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">'
        +(pr.maxWeight ? '最大重量 '+pr.maxWeight+'kg' : '')+(pr.maxReps ? ' · 最大次数 '+pr.maxReps : '')+(pr.maxVolume ? ' · 最大容量 '+Math.round(pr.maxVolume)+'kg' : '')
        +'</div></div>'
    })
    h += '</div>'
  }
  /* ===== v2.13.0 批次 B：⚔️ 战斗记录（单敌 / 敌群分列，禁止跨模式合并排名） ===== */
  h += renderBattleHistoryBlock()
  // 属性最佳
  h += '<h2 class="section-hdr">📊 属性记录</h2>'
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
  h += statCell('⚔️','最高攻击',stats.atk)
  h += statCell('🛡️','最高防御',stats.def)
  h += statCell('❤️','最高生命',stats.hp)
  h += '</div>'

  /* ===== v2.2 WP-H4：每月挑战记录（文档「挑战页面 - 增加每个月最高记录查看」） =====
     数据源 = challenge.js 的 listChallengeMonthly()：按自然月分桶归档（跨月自动开新桶，旧月保留）。
     口径：每次通关计 1 次；「单次最高伤害」= 该月伤害最高的一次；属性奖励为该月累计。 */
  h += '<h2 class="section-hdr">📅 每月挑战记录 <span style="font-size:var(--fs-xs);color:var(--text3);font-weight:400">隐藏挑战 · 跨月归档</span></h2>'
  var months = (typeof listChallengeMonthly === 'function') ? (listChallengeMonthly() || []) : []
  if (!months.length) {
    h += gvEmpty('📅', '本月暂无挑战记录', '完成隐藏挑战后按月归档，可回看每月最高记录', '')
  } else {
    var curMk = (typeof chMonthOf === 'function') ? chMonthOf() : ''
    h += '<div style="max-height:280px;overflow-y:auto">'
    months.forEach(function (m) {
      var isCur = m.month === curMk
      h += '<div style="background:var(--bg2);border:var(--bw) solid ' + (isCur ? 'var(--orange-g)' : 'var(--bd-l)') + ';border-radius:12px;padding:12px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        +   '<span class="tx-b">' + m.month + '</span>'
        +   (isCur ? '<span style="font-size:var(--fs-3xs);color:var(--orange);border:var(--bw) solid var(--orange-g);border-radius:var(--rad-full);padding:1px 6px">本月</span>' : '')
        +   '<span style="flex:1"></span>'
        +   '<span class="tx-note">' + (m.count || 0) + ' 次</span>'
        + '</div>'
        + '<div style="font-size:var(--fs-xs);color:var(--text2);line-height:1.8;margin-top:4px">'
        +   '🥇 单次最高伤害 <b class="tx-warn">' + (m.bestDmg || 0) + '</b>'
        +   (m.bestDate ? '<span class="tx-dim">（' + m.bestDate + '）</span>' : '')
        +   '<br>🎁 属性奖励合计 ⚔️+' + (m.atk || 0) + ' 🛡️+' + (m.def || 0) + ' ❤️+' + (m.hp || 0)
        +   '<br>💥 累计伤害 ' + (m.totalDmg || 0)
        + '</div>'
        + '</div>'
    })
    h += '</div>'
  }

  v.innerHTML = h
}

/* 初始化：挂载到 renderGame 之后（保留战斗逻辑） */
function initGameViews() {
  renderGameViews()
}

;

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

/* R：闪耀（敌方全体命中率 -0~40%）—— v2.1.22 接区间 */
registerSkill({ id:'p_shine', name:'闪耀', type:'support', target:'all', cooldown:4,
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
      r.heals.push({ unitId: t.id, amount: Math.floor(((t.base.def||0)+(t.base.soulDef||0)) * pct) });
      r.statusApps.push({ unitId: t.id, id: 'sleep', duration: turns + 1, chance: 1, grade: 1,
        data: { healPct: pct } });
      r.events.push({msg:'💤 ' + (c.name||'宠物') + ' 睡觉：自愈 ' + Math.round(pct*100) + '%（防+魂防），睡 ' + turns + ' 回合'});
    });
  }] });

/* SR：火焰啄击 —— 设计 攻击×150%~330%（区间随技能等级，v2.1.22 接线） */
registerSkill({ id:'p_flamepeck', name:'火焰啄击', type:'attack', target:'random1', power:240, range:{power:[150,330]}, dmgType:'physical', cooldown:4 });

/* SR：歌唱（全体魂攻+几率睡眠）—— 设计 魂攻×160%~250% */
registerSkill({ id:'p_sing', name:'歌唱', type:'attack', target:'all', power:200, range:{power:[160,250]}, dmgType:'soul', cooldown:5,
  effects:[function(c,ts,r){ ts.forEach(function(t){ if(battleRnd()<0.2) r.statusApps.push({unitId:t.id,id:'sleep',duration:1,chance:1,grade:1}); }); }] });

/* SR：雷霆冲撞（蓄力+反冲）—— 设计 魂攻×220%~400% */
registerSkill({ id:'p_thundercharge', name:'雷霆冲撞', type:'attack', target:'random1', power:300, range:{power:[220,400]}, dmgType:'soul', cooldown:4 });

/* SSR：双撞（2目标+降攻防）—— 设计 攻击×150%~240% */
registerSkill({ id:'p_doublehit', name:'双撞', type:'attack', target:'random1', power:200, range:{power:[150,240]}, dmgType:'physical', cooldown:5,
  effects:[function(c,ts,r){ ts.forEach(function(t){ r.statusApps.push({unitId:t.id,id:'armorbroken',duration:2,chance:1,grade:1}); }); }] });

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

/* SSR：冰晶爆（冰冻+伤害）—— 设计 魂攻×150%~240% */
registerSkill({ id:'p_iceburst', name:'冰晶爆', type:'attack', target:'random1', power:200, range:{power:[150,240]}, dmgType:'soul', cooldown:4,
  effects:[function(c,ts,r){ ts.forEach(function(t){ if(battleRnd()<0.3) r.statusApps.push({unitId:t.id,id:'freeze',duration:1,chance:1,grade:2}); }); }] });

/* SSR：圣光治愈 —— 设计 恢复 魂攻×110%~200%（v2.1.22 接区间） */
registerSkill({ id:'p_holylight', name:'圣光治愈', type:'support', target:'ally1', cooldown:3,
  range:{ power:[110, 200] },
  effects:[function(c,ts,r,ctx){ var v=ctx.sv('power')/100; ts.forEach(function(t){ r.heals.push({unitId:t.id,amount:Math.floor((c.base.soulAtk||0)*v)}); }); }] });

/* UR：梦幻光球（全场弹射）—— 设计 魂攻×200%~290% */
registerSkill({ id:'p_dreamball', name:'梦幻光球', type:'attack', target:'random1', power:250, range:{power:[200,290]}, dmgType:'soul', cooldown:5 });

/* UR：无影拳（5连击）—— 设计 design-v2.0.md:249：
   「总计 5 次攻击，每次视为普通攻击，目标随机可重复，单次 攻击×50%~95%」
   v2.1.24 修复：此前只有 1 次命中（power 单发、日志却写「×5」）。
   现在 multiHit:5 —— 真正打 5 次、目标随机可重复（随机池由 castSkill 传 ctx.pool）。 */
registerSkill({ id:'p_shadowfist', name:'无影拳', type:'attack', target:'random1', power:70, range:{power:[50,95]}, multiHit:5, dmgType:'physical', cooldown:4,
  effects:[function(c,ts,r){ r.events.push({msg:'👊 ' + (c.name||'宠物') + ' 无影拳：5 连击（目标随机可重复）'}); }] });

/* UR：战意灌注（2友方增益）—— 设计 +3%~30%（攻击/魂攻较高项，v2.1.22 接区间） */
registerSkill({ id:'p_warmight', name:'战意灌注', type:'support', target:'ally1', cooldown:4,
  range:{ atkBoost:[3, 30] },
  effects:[function(c,ts,r,ctx){ var v=ctx.sv('atkBoost')/100; ts.forEach(function(t){ r.buffs.push({unitId:t.id,key:'atkBoost',value:v,duration:2}); }); }] });

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
     · 状态解除（净化）—— 二元语义（解/不解），没有可乘的「幅度」→ 仍无载体；
     · 吸血 —— 群战技能层没有吸血类**辅助**技能：吸血目前只存在于 talent.js 的「嗜血」，
       它是**攻击方自身**的天赋（onAfterDamage 回血），不是施加到持有者身上的辅助效果
       （§2.14 给 p_warmight 规划的「吸血 5%~50% / 技能吸血 7.5%~32.5%」属 WP-C，尚未实装）。 */
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

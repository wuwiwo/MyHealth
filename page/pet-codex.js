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
  attachTalents(unit, codex.talents.slice());
  // 应用天赋静态修正
  for (var k in (unit._talentMods || {})) {
    unit.base[k] = (unit.base[k] || 0) + unit._talentMods[k];
    if (k === 'hp') unit.hp = unit.base[k];
  }
  return unit;
}

/* 图鉴查询 */
function getPetCodex(id) { return PET_CODEX[id] || null; }
function listPetCodex() { return Object.keys(PET_CODEX); }

/* ============ 宠物专属技能注册（复用 SKILLS 机制） ============ */
if (typeof registerSkill === 'function') {

/* R：闪耀（蓄力后全场降命中） */
registerSkill({ id:'p_shine', name:'闪耀', type:'support', target:'all', cooldown:4,
  effects:[function(c,ts,r){ r.events.push({msg:'✨ 闪耀: 敌方命中降低'}); }] });

/* R：打湿（复用状态） */
registerSkill({ id:'p_drench', name:'打湿', type:'support', target:'random1', cooldown:5,
  effects:[function(c,ts,r){ ts.forEach(function(t){ r.statusApps.push({unitId:t.id,id:'wet',duration:2,chance:1,grade:2}); }); }] });

/* R：睡觉（自愈+睡眠） */
registerSkill({ id:'p_sleep', name:'睡觉', type:'support', target:'self', cooldown:4,
  effects:[function(c,ts,r){ r.events.push({msg:'💤 彭彭猪 睡觉自愈'}); }] });

/* SR：火焰啄击 */
registerSkill({ id:'p_flamepeck', name:'火焰啄击', type:'attack', target:'random1', power:240, dmgType:'physical', cooldown:4 });

/* SR：歌唱（全体魂攻+几率睡眠） */
registerSkill({ id:'p_sing', name:'歌唱', type:'attack', target:'all', power:200, dmgType:'soul', cooldown:5,
  effects:[function(c,ts,r){ ts.forEach(function(t){ if(Math.random()<0.2) r.statusApps.push({unitId:t.id,id:'sleep',duration:1,chance:1,grade:1}); }); }] });

/* SR：雷霆冲撞（蓄力+反冲） */
registerSkill({ id:'p_thundercharge', name:'雷霆冲撞', type:'attack', target:'random1', power:300, dmgType:'soul', cooldown:4 });

/* SSR：双撞（2目标+降攻防） */
registerSkill({ id:'p_doublehit', name:'双撞', type:'attack', target:'random1', power:200, dmgType:'physical', cooldown:5,
  effects:[function(c,ts,r){ ts.forEach(function(t){ r.statusApps.push({unitId:t.id,id:'armorbroken',duration:2,chance:1,grade:1}); }); }] });

/* SSR：幻影之瞳（迷惑） */
registerSkill({ id:'p_phantom', name:'幻影之瞳', type:'support', target:'random1', cooldown:4,
  effects:[function(c,ts,r){ r.events.push({msg:'👁️ 黑暗鸦 幻影之瞳'}); }] });

/* SSR：冰晶爆（冰冻+伤害） */
registerSkill({ id:'p_iceburst', name:'冰晶爆', type:'attack', target:'random1', power:200, dmgType:'soul', cooldown:4,
  effects:[function(c,ts,r){ ts.forEach(function(t){ if(Math.random()<0.3) r.statusApps.push({unitId:t.id,id:'freeze',duration:1,chance:1,grade:2}); }); }] });

/* SSR：圣光治愈 */
registerSkill({ id:'p_holylight', name:'圣光治愈', type:'support', target:'ally1', cooldown:3,
  effects:[function(c,ts,r){ ts.forEach(function(t){ r.heals.push({unitId:t.id,amount:Math.floor((c.base.soulAtk||0)*1.5)}); }); }] });

/* UR：梦幻光球（全场弹射） */
registerSkill({ id:'p_dreamball', name:'梦幻光球', type:'attack', target:'random1', power:250, dmgType:'soul', cooldown:5 });

/* UR：无影拳（5连击） */
registerSkill({ id:'p_shadowfist', name:'无影拳', type:'attack', target:'random1', power:70, dmgType:'physical', cooldown:4,
  effects:[function(c,ts,r){ r.events.push({msg:'👊 无念熊 无影拳 ×5'}); }] });

/* UR：战意灌注（2友方增益） */
registerSkill({ id:'p_warmight', name:'战意灌注', type:'support', target:'ally1', cooldown:4,
  effects:[function(c,ts,r){ ts.forEach(function(t){ r.buffs.push({unitId:t.id,key:'atkBoost',value:0.2,duration:2}); }); }] });

}

/* ============ 宠物专属天赋注册（复用 TALENTS 机制） ============ */
if (typeof registerTalent === 'function') {

/* 小负鼠：幸运口袋（战斗结算额外材料） */
registerTalent({ id:'lucky_pocket', name:'幸运口袋', desc:'战斗胜利结算几率获得随机额外材料' });

/* 黑暗鸦：漆黑之眼（必定命中） */
registerTalent({ id:'dark_eye', name:'漆黑之眼', desc:'自身攻击必定命中' });

/* 小冰晶：凛冬之核（我方免疫冰冻） */
registerTalent({ id:'winter_core', name:'凛冬之核', desc:'自身在场时我方全体免疫冰冻' });

/* 光之精灵：圣光守护（分担伤害） */
registerTalent({ id:'holy_guard', name:'圣光守护', desc:'血量>50%时承担队友20%伤害' });

/* 梦幻：镜像结界 */
registerTalent({ id:'mirror_field', name:'镜像结界', desc:'受我方辅助+25%，受敌方辅助-25%' });

/* 梦幻：灵感涌动 */
registerTalent({ id:'inspiration', name:'灵感涌动', desc:'每回合开始随机友方魂攻+20%' });

/* 无念熊：心眼 */
registerTalent({ id:'mind_eye', name:'心眼', desc:'自身命中率不会被降低' });

/* 无念熊：斗者本能 */
registerTalent({ id:'fighter_instinct', name:'斗者本能', desc:'普攻25%暴击，暴击150%伤害' });

/* 圣光麒麟：不动如山 */
registerTalent({ id:'immovable', name:'不动如山', desc:'满血时免疫普通~高级负面，受伤-50%' });

/* 圣光麒麟：威压领域 */
registerTalent({ id:'pressure_field', name:'威压领域', desc:'血量>75%时敌方治疗-20%' });

}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.PET_CODEX = PET_CODEX;
  window.createPetUnit = createPetUnit;
  window.getPetCodex = getPetCodex;
  window.listPetCodex = listPetCodex;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PET_CODEX = PET_CODEX;
  globalThis.createPetUnit = createPetUnit;
  globalThis.getPetCodex = getPetCodex;
  globalThis.listPetCodex = listPetCodex;
}

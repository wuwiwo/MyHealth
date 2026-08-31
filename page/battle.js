/* ============================================
   MyHealth — Battle Engine (pure logic)
   ============================================ */

var BOSS_AFFIXES=[
  {name:'虚弱诅咒',desc:'你防御低于50时,伤害减少10~20%',
    apply:function(atk,def,isPlayer){
      if(isPlayer&&def<50){var r=0.8+Math.random()*0.1;return Math.floor(atk*r)}
      return atk
    }},
  {name:'荆棘之躯',desc:'攻击者受到50%反伤(可被防御减免)',
    reflect:function(dmg,atkDef){return Math.max(1,Math.floor(dmg*0.5)-Math.floor(atkDef/2))}},
  {name:'怒气勃发',desc:'每2~3回合攻击力+1~5(可叠加)',
    onTurn:function(turn,enemyAtk,baseAtk){
      if(turn>=2&&(turn%2===0||turn%3===0)&&Math.random()<0.6){
        var bonus=1+Math.floor(Math.random()*5);return enemyAtk+bonus}
      return enemyAtk
    }},
  {name:'生命汲取',desc:'每次攻击恢复伤害量25%的生命',
    onAttack:function(dmg,boss){if(boss&&dmg>0){boss._heal=(boss._heal||0)+Math.floor(dmg*0.25)}return dmg}},
  {name:'铁壁护盾',desc:'每3回合获得一个吸收伤害量30%的护盾',
    onTurn:function(turn,enemyAtk,baseAtk,boss){
      if(turn>=3&&turn%3===0&&Math.random()<0.5){boss._shield=(boss._shield||0)+Math.floor(baseAtk*0.3)*2;return enemyAtk+Math.floor(baseAtk*0.1)}
      return enemyAtk
    }}
]

/* 从词条池抽取 N 条不重复词条（默认 1 条）；dualAffix 关卡（16章起 BOSS）抽 2 条。
   返回按 index 升序的词条数组，组合顺序稳定（如含「虚弱诅咒」时其 index 必为组合最小值） */
function pickBossAffix(count){
  var n=count||1
  var pool=BOSS_AFFIXES.map(function(a,i){return i})
  var picked=[]
  while(picked.length<n&&pool.length){
    var k=Math.floor(Math.random()*pool.length)
    picked.push(pool[k])
    pool.splice(k,1)
  }
  return picked.sort(function(a,b){return a-b}).map(function(i){return{index:i,...BOSS_AFFIXES[i]}})
}

/* 钩子组合表：每种钩子的多实例串联语义
   （onTurn 的结果是新 atk → 回填第2槽；apply 的结果是新 atk → 回填第1槽；
   onAttack 是副作用钩子 → 用原始参数依次调用；reflect 求和） */
var AFFIX_HOOK_COMBINERS={
  apply:function(fns){return function(atk,def,isPlayer){
    for(var i=0;i<fns.length;i++)atk=fns[i](atk,def,isPlayer)
    return atk
  }},
  onTurn:function(fns){return function(turn,enemyAtk,baseAtk,boss){
    for(var i=0;i<fns.length;i++)enemyAtk=fns[i](turn,enemyAtk,baseAtk,boss)
    return enemyAtk
  }},
  onAttack:function(fns){return function(dmg,boss){
    for(var i=0;i<fns.length;i++)fns[i](dmg,boss)
    return dmg
  }},
  reflect:function(fns){return function(dmg,atkDef){
    var total=0
    for(var i=0;i<fns.length;i++)total+=fns[i](dmg,atkDef)
    return total
  }}
}

/* 把多条词条合成为单个复合词条供战斗引擎使用。
   单条直接透传原词条；多条按钩子组合表串联（结果回填对应参数槽位，其余参数透传） */
function combineAffixes(affixes){
  if(!affixes||!affixes.length)return null
  if(affixes.length===1)return affixes[0]
  var comp={
    index:Math.min.apply(null,affixes.map(function(a){return a.index})),
    name:affixes.map(function(a){return a.name}).join('·'),
    desc:affixes.map(function(a){return a.desc}).join('；')
  }
  for(var key in AFFIX_HOOK_COMBINERS){
    var fns=[]
    for(var i=0;i<affixes.length;i++)if(affixes[i][key])fns.push(affixes[i][key])
    if(fns.length===1)comp[key]=fns[0]
    else if(fns.length>1)comp[key]=AFFIX_HOOK_COMBINERS[key](fns)
  }
  return comp
}

/* 按关卡配置抽取词条（普通 Boss 单条，dualAffix Boss 复合双条） */
function rollBossAffixFor(level){
  return combineAffixes(pickBossAffix(level&&level.dualAffix?2:1))
}

/* 构造对战双方属性：玩家侧来自 getGameStats()，敌方侧来自关卡定义。
   供 startBattle 与关卡胜率模拟共用，消除两处构造漂移 */
function buildBattleSides(stats,lv){
  return{
    player:{atk:stats.atk,def:stats.def,hp:stats.hp,soulAtk:stats.soulAtk,soulDef:stats.soulDef},
    enemy:{atk:lv.atk,def:lv.def,hp:lv.hp,soulAtk:lv.soulAtk||0,soulDef:lv.soulDef||0}
  }
}

function findLevel(id){
  for(const ch of Object.values(LEVELS))
    for(const lv of ch.levels)
      if(lv.id===id)return lv
  return null
}

function rollDamage(atk,def,variance){
  return Math.max(1,atk-Math.floor(def/2)+Math.floor(Math.random()*variance)+1)
}

function createBattle(playerStats,enemyStats,levelInfo,affix){
  return{
    player:{atk:playerStats.atk,def:playerStats.def,hp:playerStats.hp,maxHP:playerStats.hp,soulAtk:playerStats.soulAtk||0,soulDef:playerStats.soulDef||0},
    enemy:{atk:enemyStats.atk,def:enemyStats.def,hp:enemyStats.hp,maxHP:enemyStats.hp,soulAtk:enemyStats.soulAtk||0,soulDef:enemyStats.soulDef||0},
    level:levelInfo||{},
    affix:affix||null,
    enemyBaseAtk:enemyStats.atk,
    turn:0,done:false,winner:null
  }
}

function battleTick(b){
  var turn=b.turn+1
  var events=[]

  // Rage / Shield affix (onTurn)
  if(b.affix&&b.affix.onTurn){
    var prevAtk=b.enemy.atk
    b.enemy.atk=b.affix.onTurn(turn,b.enemy.atk,b.enemyBaseAtk,b.enemy)
    if(b.enemy.atk>prevAtk){
      events.push({msg:'🔴 Boss 怒意增强, 攻击力 +'+(b.enemy.atk-prevAtk),type:'e'})
    }
    if(b.enemy._shield&&b.enemy._shield>0){
      events.push({msg:'🛡️ Boss 铁壁护盾, 吸收 '+b.enemy._shield+' 伤害',type:'def'})
    }
  }

  // Player attacks
  var pDmgBase=rollDamage(b.player.atk,b.enemy.def,4)
  var pDmg=b.affix&&b.affix.apply?b.affix.apply(pDmgBase,b.player.def,true):pDmgBase
  b.enemy.hp-=pDmg
  if(b.enemy._shield>0){b.enemy.hp+=Math.min(pDmg,b.enemy._shield);b.enemy._shield=Math.max(0,b.enemy._shield-pDmg);pDmg=Math.max(0,pDmg-(b.enemy._shield>0?pDmg:0))}
  if(pDmg!==pDmgBase){events.push({msg:'🧑 攻击 → '+pDmgBase+' (被诅咒减免至 '+pDmg+')',type:'dmg'})}
  else{events.push({msg:'🧑 攻击 → '+pDmg+' 伤害',type:'dmg'})}

  // Thorns reflect
  if(b.affix&&b.affix.reflect&&pDmg>0){
    var reflectDmg=b.affix.reflect(pDmg,b.player.def)
    if(reflectDmg>0){b.player.hp-=Math.min(b.player.hp,reflectDmg);events.push({msg:'🩸 荆棘反伤 → '+reflectDmg+' 伤害',type:'e'})}
  }

  // Enemy dead?
  if(b.enemy.hp<=0){b.enemy.hp=0;b.done=true;b.winner=true;return{turn:turn,events:events}}

  // Soul attack phase — player soul attacks enemy
  if(b.player.soulAtk>0){
    var pSoulDmg;
    if(b.enemy.soulDef>0){
      pSoulDmg=rollDamage(b.player.soulAtk,b.enemy.soulDef,4)
    }else{
      pSoulDmg=b.player.soulAtk // full damage when no soul def
    }
    b.enemy.hp-=pSoulDmg
    events.push({msg:'👻 魂攻击 → '+pSoulDmg+' 魂伤害',type:'dmg'})
    if(b.enemy.hp<=0){b.enemy.hp=0;b.done=true;b.winner=true;return{turn:turn,events:events}}
  }

  // Enemy attacks
  var eDmgBase=rollDamage(b.enemy.atk,b.player.def,3)
  var eDmg=b.affix&&b.affix.apply&&b.affix.index===0?b.affix.apply(eDmgBase,b.enemy.atk,false):eDmgBase
  b.player.hp-=eDmg
  events.push({msg:'👹 '+b.level.npc+' 攻击 → '+eDmg+' 伤害',type:'e'})

  // Enemy soul attack
  if(b.enemy.soulAtk>0){
    var eSoulDmg;
    if(b.player.soulDef>0){
      eSoulDmg=rollDamage(b.enemy.soulAtk,b.player.soulDef,3)
    }else{
      eSoulDmg=b.enemy.soulAtk
    }
    b.player.hp-=eSoulDmg
    events.push({msg:'👻 敌方魂攻击 → '+eSoulDmg+' 魂伤害',type:'e'})
  }

  // Life steal heal
  if(b.affix&&b.affix.onAttack){b.affix.onAttack(eDmg,b.enemy)}
  if(b.enemy._heal&&b.enemy._heal>0){b.enemy.hp+=Math.floor(b.enemy._heal*0.5);events.push({msg:'💚 Boss 生命汲取, 恢复 '+(b.enemy._heal||0)+' HP',type:'heal'});b.enemy._heal=0}

  // Player dead?
  if(b.player.hp<=0){b.player.hp=0;b.done=true;b.winner=false}

  return{turn:turn,events:events}
}

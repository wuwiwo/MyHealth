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
    }}
]

function pickBossAffix(){
  var idx=Math.floor(Math.random()*BOSS_AFFIXES.length)
  return{index:idx,...BOSS_AFFIXES[idx]}
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
    player:{atk:playerStats.atk,def:playerStats.def,hp:playerStats.hp},
    enemy:{atk:enemyStats.atk,def:enemyStats.def,hp:enemyStats.hp,maxHP:enemyStats.hp},
    level:levelInfo||{},
    affix:affix||null,
    enemyBaseAtk:enemyStats.atk,
    turn:0,done:false,winner:null
  }
}

function battleTick(b){
  var turn=b.turn+1
  var events=[]

  // Rage affix
  if(b.affix&&b.affix.onTurn&&b.affix.index===2){
    var prevAtk=b.enemy.atk
    b.enemy.atk=b.affix.onTurn(turn,b.enemy.atk,b.enemyBaseAtk)
    if(b.enemy.atk>prevAtk){
      events.push({msg:'🔴 Boss 怒气勃发, 攻击力 +'+(b.enemy.atk-prevAtk),type:'e'})
    }
  }

  // Player attacks
  var pDmgBase=rollDamage(b.player.atk,b.enemy.def,4)
  var pDmg=b.affix&&b.affix.apply?b.affix.apply(pDmgBase,b.player.def,true):pDmgBase
  b.enemy.hp-=pDmg
  if(pDmg!==pDmgBase){events.push({msg:'🧑 攻击 → '+pDmgBase+' (被诅咒减免至 '+pDmg+')',type:'dmg'})}
  else{events.push({msg:'🧑 攻击 → '+pDmg+' 伤害',type:'dmg'})}

  // Thorns reflect
  if(b.affix&&b.affix.reflect&&pDmg>0){
    var reflectDmg=b.affix.reflect(pDmg,b.player.def)
    if(reflectDmg>0){b.player.hp-=Math.min(b.player.hp,reflectDmg);events.push({msg:'🩸 荆棘反伤 → '+reflectDmg+' 伤害',type:'e'})}
  }

  // Enemy dead?
  if(b.enemy.hp<=0){b.enemy.hp=0;b.done=true;b.winner=true;return{turn:turn,events:events}}

  // Enemy attacks
  var eDmgBase=rollDamage(b.enemy.atk,b.player.def,3)
  var eDmg=b.affix&&b.affix.apply&&b.affix.index===0?b.affix.apply(eDmgBase,b.enemy.atk,false):eDmgBase
  b.player.hp-=eDmg
  events.push({msg:'👹 '+b.level.npc+' 攻击 → '+eDmg+' 伤害',type:'e'})

  // Player dead?
  if(b.player.hp<=0){b.player.hp=0;b.done=true;b.winner=false}

  return{turn:turn,events:events}
}

/* ============================================
   MyHealth — Tab: Game (Challenge, Battle, Share)
   ============================================ */

function renderGame(){
  const stats=getGameStats()
  const mNames=['','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  const n=new Date();const monthLabel=mNames[n.getMonth()+1]||''
  var thirty=toDate(new Date(Date.now()-30*86400000))
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var carE=((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var strVol=strE.reduce(function(s,e){return s+e.weight*e.actualReps},0)
  var carDur=carE.reduce(function(s,e){return s+e.duration},0)
  var baseAtk=10+Math.floor(strVol/20),baseDef=10+Math.floor(carDur/6)
  var baseHp=100+Math.floor(strVol/10)+Math.floor(carDur/3)
  var atkInfo='攻击 = 10 + floor('+strVol+'/20) = '+baseAtk+(stats.wkBonus>0?' + 周奖励 +'+stats.wkBonus:'')+(stats.permPenAtk>0?' - 永久惩罚 -'+stats.permPenAtk:'')+' = '+stats.atk
  var defInfo='防御 = 10 + floor('+carDur+'/6) = '+baseDef+(stats.wkBonus>0?' + 周奖励 +'+Math.floor(stats.wkBonus/2):'')+(stats.permPenDef>0?' - 永久惩罚 -'+stats.permPenDef:'')+' = '+stats.def
  var hpInfo='生命 = 100 + floor('+strVol+'/10) + floor('+carDur+'/3) = '+baseHp+(stats.wkBonus>0?' + 周奖励 ×3 +'+stats.wkBonus*3:'')+' = '+stats.hp

  var wkStatus='',wkColor='orange'
  if(stats.wkDays===0&&(new Date().getDay()>=5)){wkStatus='⚠️ 还没练，抓紧！';wkColor='red'}
  else if(stats.wkDays===0){wkStatus='😴 本周还没动，开始吧';wkColor='orange'}
  else if(stats.wkDays===1){wkStatus='💪 练了1天，继续！';wkColor='orange'}
  else if(stats.wkDays===2){wkStatus='🔥 还差1天免惩罚！';wkColor='yellow'}
  else if(stats.wkDays>=3&&stats.wkDays<5){wkStatus='✅ 已达标，本周安全';wkColor='green'}
  else if(stats.wkDays>=5){wkStatus='🎉 太强了！本周满勤在望';wkColor='green'}

  document.getElementById('gameStatsBar').innerHTML=
    '<div class="gs-item"><div class="gs-v orange">'+stats.atk+'</div><div class="gs-l">⚔️ 攻击</div></div>'+
    '<div class="gs-item"><div class="gs-v blue">'+stats.def+'</div><div class="gs-l">🛡️ 防御</div></div>'+
    '<div class="gs-item"><div class="gs-v green">'+stats.hp+'</div><div class="gs-l">❤️ 生命</div></div>'+
    '<div class="gs-item"><div class="gs-v">'+getGame().cleared.length+'</div><div class="gs-l">🏆 通关</div></div>'+
    '<div class="gs-item" style="min-width:100px"><div class="gs-v '+wkColor+'">'+stats.wkDays+'<span style="font-size:.6rem">/7</span>'+(stats.wkBonus>0?' <span style="font-size:.6rem;color:var(--green)">+'+stats.wkBonus+'</span>':'')+(stats.permPenAtk>0?' <span style="font-size:.6rem;color:var(--red)">-'+stats.permPenAtk+'</span>':'')+'</div><div class="gs-l" style="font-size:.6rem">'+wkStatus+'</div></div>'+
    '<div class="gs-item" style="min-width:80px"><div class="gs-v blue">'+stats.monthDays+'<span style="font-size:.6rem">天</span></div><div class="gs-l">'+monthLabel+'</div></div>'+
    '<div class="gs-item" style="flex:0;min-width:auto"><button class="header-btn" id="attrInfoBtn" title="属性计算方式">📖</button></div>'+
    '<div class="gs-item" style="flex:0;min-width:auto"><button class="header-btn" id="resetGameBtn" title="重置挑战进度" style="font-size:.75rem">↺</button></div>'

  _attrCalcInfo={atk:atkInfo,def:defInfo,hp:hpInfo,vol:strVol,dur:carDur,permPenAtk:stats.permPenAtk,permPenDef:stats.permPenDef,lastWkDays:stats.lastWkDays,thisWk:stats.wkDays}

  var warnKey='warn_'+toDate(new Date())+'_miss'
  var warnDismissed=localStorage.getItem(warnKey)
  if(stats.lastWkDays<3&&stats.lastWkDays>=0&&!warnDismissed){
    var gameContent=document.getElementById('gameContent')
    if(gameContent&&!document.getElementById('penaltyBanner')){
      var banner=document.createElement('div');banner.id='penaltyBanner'
      banner.style='background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--r);padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:.8rem'
      var missDays=3-stats.lastWkDays
      banner.innerHTML='<span style="font-size:1.2rem">⚠️</span><span style="flex:1;color:var(--red)">上周只练了 '+stats.lastWkDays+' 天，永久扣除攻击 -'+(missDays*2)+'，防御 -'+(missDays*1)+'。本周练满 3 天可避免下周惩罚。</span><button class="speed-btn" id="dismissPenalty" style="border-color:var(--red);color:var(--red);padding:4px 12px">知道了</button>'
      gameContent.parentNode.insertBefore(banner,gameContent)
      setTimeout(function(){
        var btn=document.getElementById('dismissPenalty')
        if(btn)btn.addEventListener('click',function(){localStorage.setItem(warnKey,'1');banner.remove()})
      },100)
    }
  }else{
    var existing=document.getElementById('penaltyBanner')
    if(existing)existing.remove()
  }

  const gc=document.getElementById('gameContent')
  let h=''
  Object.entries(LEVELS).forEach(([k,ch])=>{
    h+='<div class="chapter-hdr">📖 '+ch.name+'</div><div class="lv-grid">'
    ch.levels.forEach(lv=>{
      const cleared=getGame().cleared.includes(lv.id)
      const isCur=getGame().current===lv.id
      const allPrev=allPrevCleared(k,lv.id)
      const locked=!cleared&&!isCur&&!allPrev
      h+='<div class="lv-card'+(cleared?' done':'')+(isCur?' current':'')+(locked?' locked':'')+'" data-lv="'+lv.id+'"><div class="lv-num">'+lv.id+'</div><div class="lv-name">'+lv.npc+'</div><div class="lv-status '+(cleared?'done':isCur?'current':'locked')+'">'+(cleared?'✅ 已通关':isCur?'⚔️ 挑战中':locked?'🔒 未解锁':'⚔️ 可挑战')+'</div></div>'
    })
    h+='</div>'
  })
  gc.innerHTML=h
  gc.querySelectorAll('.lv-card:not(.locked)').forEach(c=>c.addEventListener('click',()=>{
    const id=c.dataset.lv;if(getGame().cleared.includes(id))return
    getGame().current=id;setGame(getGame());startBattle(id)
  }))
}

function allPrevCleared(chKey,lvId){
  const ch=LEVELS[chKey];if(!ch)return false
  var seen=false
  for(const[k,ch2]of Object.entries(LEVELS)){
    if(k===chKey)break
    for(const lv2 of ch2.levels){
      if(!getGame().cleared.includes(lv2.id))return false
    }
  }
  for(const lv of ch.levels){
    if(lv.id===lvId)return true
    if(!getGame().cleared.includes(lv.id))return false
  }
  return true
}

function getWeekDays(){
  const n=new Date(),d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d))
  const days=new Set()
  ;((store.get('strength')||{entries:[]}).entries||[]).filter(e=>e.date>=toDate(m)).forEach(e=>days.add(e.date))
  ;((store.get('cardio')||{entries:[]}).entries||[]).filter(e=>e.date>=toDate(m)).forEach(e=>days.add(e.date))
  return days.size
}
function getMonthDays(){
  const n=new Date();const ms=toDate(new Date(n.getFullYear(),n.getMonth(),1))
  const days=new Set()
  ;((store.get('strength')||{entries:[]}).entries||[]).filter(e=>e.date>=ms).forEach(e=>days.add(e.date))
  ;((store.get('cardio')||{entries:[]}).entries||[]).filter(e=>e.date>=ms).forEach(e=>days.add(e.date))
  return days.size
}

function getLastWeekDays(){
  var now=new Date();var dow=now.getDay()
  var lastMon=new Date(now);lastMon.setDate(now.getDate()-dow-6)
  var lastSun=new Date(now);lastSun.setDate(now.getDate()-dow)
  var days=new Set()
  ;((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=toDate(lastMon)&&e.date<=toDate(lastSun)}).forEach(function(e){days.add(e.date)})
  ;((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=toDate(lastMon)&&e.date<=toDate(lastSun)}).forEach(function(e){days.add(e.date)})
  return days.size
}

function getGameStats(){
  var thirty=toDate(new Date(Date.now()-30*86400000))
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var carE=((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var strVol=strE.reduce(function(s,e){return s+e.weight*e.actualReps},0)
  var carDur=carE.reduce(function(s,e){return s+e.duration},0)
  var wk=getWeekDays();var wkBonus=wk>=7?50:wk>=4?20:0
  var lastWk=getLastWeekDays()
  var lastMissed=Math.max(0,3-lastWk)
  var newAtkPen=lastMissed*2,newDefPen=lastMissed*1
  if(!getGame().permPen)getGame().permPen={atk:0,def:0}
  if(lastMissed>0&&!getGame().permPenLastWeek){
    getGame().permPen.atk+=newAtkPen;getGame().permPen.def+=newDefPen
    getGame().permPenLastWeek=true;setGame(getGame())
  }
  if(new Date().getDay()===1&&getGame().permPenLastWeek){
    getGame().permPenLastWeek=false;setGame(getGame())
  }
  var baseAtk=10+Math.floor(strVol/20)
  var baseDef=10+Math.floor(carDur/6)
  return{
    atk:Math.max(1,baseAtk+Math.floor(wkBonus/2)-(getGame().permPen.atk||0)),
    def:Math.max(1,baseDef+Math.floor(wkBonus/2)-(getGame().permPen.def||0)),
    hp:100+Math.floor(strVol/10)+Math.floor(carDur/3)+wkBonus*3,
    wkDays:wk,wkBonus:wkBonus,lastWkDays:lastWk,
    permPenAtk:getGame().permPen.atk||0,permPenDef:getGame().permPen.def||0,
    monthDays:getMonthDays()
  }
}

/* ========== BATTLE ========== */
let _battleRunning=false,_battleSpeed=1,_battleTimer=null
let _bPlayer=null,_bEnemy=null,_bLog=[],_bDone=false,_bBossAffix=null,_bTurn=0,_bRageCount=0
var _attrCalcInfo={}

function findLevel(id){
  for(const ch of Object.values(LEVELS))
    for(const lv of ch.levels)
      if(lv.id===id)return lv
  return null
}

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

function updateGameBar(){
  var bar=document.getElementById('gameStatsBar');if(!bar||!bar.isConnected)return
  if(!document.getElementById('tabGame')?.classList.contains('active'))return
  renderGame()
}

function startBattle(id){
  const lv=findLevel(id);if(!lv)return
  if(!getGame().attempts)getGame().attempts={}
  var todayKey=today()+'_'+id
  var attempts=getGame().attempts[todayKey]||0
  if(attempts>=3){toast('今天已失败 3 次，不能再挑战了 😅','e');return}
  var todayStr=today()
  var trainedToday=((store.get('strength')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})||((store.get('cardio')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})
  if(!trainedToday&&attempts===0){toast('⚠️ 今天还没训练，属性较低','e')}
  var stats=getGameStats()
  _bPlayer={...stats};_bEnemy={atk:lv.atk,def:lv.def,hp:lv.hp,maxHP:lv.hp}
  if(lv.boss){_bBossAffix=pickBossAffix()}else{_bBossAffix=null}
  _bLog=[];_bDone=false;_battleSpeed=1;_bTurn=0;_bRageCount=0
  document.getElementById('battleLevel').textContent=id+' '+lv.npc+(_bBossAffix?' 👑':'')+(_bBossAffix?' ['+_bBossAffix.name+']':'')
  document.getElementById('beName').textContent='👹 '+lv.npc+(_bBossAffix?' 👑':'')
  document.getElementById('bpHP').style.width='100%'
  document.getElementById('bpHPText').textContent='❤️ '+stats.hp
  document.getElementById('bpAtk').textContent='⚔️ '+stats.atk
  document.getElementById('bpDef').textContent='🛡️ '+stats.def
  document.getElementById('beHP').style.width='100%'
  document.getElementById('beHPText').textContent='❤️ '+lv.hp
  document.getElementById('beAtk').textContent='⚔️ '+lv.atk
  document.getElementById('beDef').textContent='🛡️ '+lv.def
  document.getElementById('battleLog').innerHTML=''
  document.getElementById('battleEnd').innerHTML=''
  document.getElementById('battleOverlay').classList.add('open')
  setTimeout(()=>runBattle(),500)
}

function runBattle(){
  if(_bDone||_battleRunning)return
  _battleRunning=true
  const lv=findLevel(getGame().current)
  const tick=()=>{
    if(_bDone){_battleRunning=false;return}
    _bTurn++
    var bossAtk=_bEnemy.atk
    if(_bBossAffix&&_bBossAffix.onTurn&&_bBossAffix.index===2){
      var newAtk=_bBossAffix.onTurn(_bTurn,_bEnemy.atk,lv.atk)
      if(newAtk>bossAtk){bossAtk=newAtk;_bEnemy.atk=newAtk;addBattleLog('🔴 Boss 怒气勃发, 攻击力 +'+(newAtk-lv.atk-_bRageCount),'e');_bRageCount+=newAtk-lv.atk-_bRageCount}
    }
    var pDmgBase=Math.max(1,_bPlayer.atk-Math.floor(_bEnemy.def/2)+Math.floor(Math.random()*4)+1)
    var pDmg=_bBossAffix&&_bBossAffix.apply?_bBossAffix.apply(pDmgBase,_bPlayer.def,true):pDmgBase
    _bEnemy.hp-=pDmg
    if(pDmg!==pDmgBase)addBattleLog('🧑 攻击 → '+pDmgBase+' (被诅咒减免至 '+pDmg+')','dmg')
    else addBattleLog('🧑 攻击 → '+pDmg+' 伤害','dmg')
    if(_bBossAffix&&_bBossAffix.reflect&&pDmg>0){
      var reflectDmg=_bBossAffix.reflect(pDmg,_bPlayer.def)
      if(reflectDmg>0){_bPlayer.hp-=Math.min(_bPlayer.hp,reflectDmg);addBattleLog('🩸 荆棘反伤 → '+reflectDmg+' 伤害','e')}
    }
    updateBattleHP()
    if(_bEnemy.hp<=0){_bEnemy.hp=0;endBattle(true);_battleRunning=false;return}
    var eDmgBase=Math.max(1,bossAtk-Math.floor(_bPlayer.def/2)+Math.floor(Math.random()*3)+1)
    var eDmg=_bBossAffix&&_bBossAffix.apply&&_bBossAffix.index===0?_bBossAffix.apply(eDmgBase,bossAtk,false):eDmgBase
    _bPlayer.hp-=eDmg
    addBattleLog('👹 '+lv.npc+' 攻击 → '+eDmg+' 伤害','e')
    updateBattleHP()
    if(_bPlayer.hp<=0){_bPlayer.hp=0;endBattle(false);_battleRunning=false;return}
    _battleTimer=setTimeout(tick,600/_battleSpeed)
  }
  tick()
}

function updateBattleHP(){
  document.getElementById('bpHP').style.width=Math.max(0,_bPlayer.hp/(_bPlayer.hp+_bEnemy.maxHP||1)*100)+'%'
  document.getElementById('bpHPText').textContent='HP: '+Math.max(0,_bPlayer.hp)
  document.getElementById('beHP').style.width=Math.max(0,_bEnemy.hp/_bEnemy.maxHP*100)+'%'
  document.getElementById('beHPText').textContent='HP: '+Math.max(0,_bEnemy.hp)+'/'+_bEnemy.maxHP
}

function addBattleLog(msg,type){
  const el=document.getElementById('battleLog')
  const div=document.createElement('div');div.className='bl-entry '+(type==='dmg'?'bl-dmg':type==='e'?'bl-def':'')
  div.textContent='▸ '+msg;el.appendChild(div);el.scrollTop=el.scrollHeight
}

function endBattle(won){
  _bDone=true;const el=document.getElementById('battleEnd')
  const lv=findLevel(getGame().current)
  var g=getGame()
  if(!won){
    if(!g.attempts)g.attempts={}
    var todayKey=today()+'_'+g.current
    g.attempts[todayKey]=(g.attempts[todayKey]||0)+1
    setGame(g)
  }
  if(won){
    if(!g.cleared.includes(g.current))g.cleared.push(g.current)
    let nextId='';let found=false
    for(const ch of Object.values(LEVELS)){
      for(const lv2 of ch.levels){
        if(found){nextId=lv2.id;found=false;break}
        if(lv2.id===g.current)found=true
      }
      if(nextId)break
    }
    if(nextId)g.current=nextId
    else g.current=''
    setGame(g)
    el.innerHTML='<div class="be-result be-win">🏆 胜利！</div><div class="be-replay"><button class="be-btn be-btn-next" id="battleNext">下一关 →</button><button class="be-btn be-btn-retry" id="battleShare">📤 分享卡片</button></div>'
    celebrate()
  } else {
    el.innerHTML='<div class="be-result be-lose">💀 战败</div><div class="be-replay"><button class="be-btn be-btn-retry" id="battleRetry">🔄 重新挑战</button></div>'
  }
  document.getElementById('battleNext')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');renderGame()})
  document.getElementById('battleRetry')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');setTimeout(()=>startBattle(getGame().current),100)})
  document.getElementById('battleShare')?.addEventListener('click',showShareCard)
}

/* ========== SHARE CARD ========== */
function showShareCard(){
  const lv=findLevel(getGame().current)||findLevel(getGame().cleared[getGame().cleared.length-1])
  if(!lv)return
  const stats=getGameStats()
  document.getElementById('shareLevel').textContent=getGame().current+' '+lv.npc
  document.getElementById('shareStats').innerHTML=
    '<div class="share-stat"><div class="ss-v">'+stats.atk+'</div><div class="ss-l">攻击</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.def+'</div><div class="ss-l">防御</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.hp+'</div><div class="ss-l">生命</div></div>'
  const clearedStr=getGame().cleared.length>0?'已通关 '+getGame().cleared.length+' 关':'刚刚开始征程'
  const strE=((store.get('strength')||{entries:[]}).entries||[]).length,carE=((store.get('cardio')||{entries:[]}).entries||[]).length
  document.getElementById('shareVS').innerHTML=
    '🧑 力量训练 '+strE+' 次 · 有氧 '+carE+' 次<br>💪 '+clearedStr
  document.getElementById('shareOverlay').classList.add('open')
}
function hideShare(){document.getElementById('shareOverlay').classList.remove('open')}

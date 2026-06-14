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
  var carDur=sumDuration(carE)
  var carEff=sumEffectiveDuration(carE,getCardioTypeMap())
  var baseAtk=10+Math.floor(strVol/20),baseDef=10+Math.floor(carEff/15)
  var baseHp=100+Math.floor(strVol/10)+Math.floor(carDur/3)
  var atkInfo='攻击 = 10 + floor('+strVol+'/20) = '+baseAtk+(stats.wkBonus>0?' + 周奖励 +'+stats.wkBonus:'')+(stats.permPenAtk>0?' - 永久惩罚 -'+stats.permPenAtk:'')+' = '+stats.atk
  var defInfo='防御 = 10 + floor('+carEff+'/15) = '+baseDef+(stats.wkBonus>0?' + 周奖励 +'+Math.floor(stats.wkBonus/2):'')+(stats.permPenDef>0?' - 永久惩罚 -'+stats.permPenDef:'')+' = '+stats.def
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
  var n=new Date(),d=n.getDay();var m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));
  return countActiveDays((store.get('strength')||{entries:[]}).entries,(store.get('cardio')||{entries:[]}).entries,toDate(m))
}
function getMonthDays(){
  var n=new Date();var ms=toDate(new Date(n.getFullYear(),n.getMonth(),1))
  return countActiveDays((store.get('strength')||{entries:[]}).entries,(store.get('cardio')||{entries:[]}).entries,ms)
}

function getLastWeekDays(){
  var now=new Date();var dow=now.getDay()
  var lastMon=new Date(now);lastMon.setDate(now.getDate()-dow-6)
  var lastSun=new Date(now);lastSun.setDate(now.getDate()-dow)
  return countActiveDaysInRange((store.get('strength')||{entries:[]}).entries,(store.get('cardio')||{entries:[]}).entries,toDate(lastMon),toDate(lastSun))
}

function getGameStats(){
  var thirty=toDate(new Date(Date.now()-30*86400000))
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var carE=((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=thirty})
  var strVol=sumVolume(strE)
  var carDur=sumDuration(carE)
  var carEff=sumEffectiveDuration(carE,getCardioTypeMap())
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
  var calc=calculateStats(strVol,carDur,carEff,wkBonus,getGame().permPen.atk||0,getGame().permPen.def||0)
  return{
    atk:calc.atk,def:calc.def,hp:calc.hp,
    wkDays:wk,wkBonus:wkBonus,lastWkDays:lastWk,
    permPenAtk:getGame().permPen.atk||0,permPenDef:getGame().permPen.def||0,
    monthDays:getMonthDays()
  }
}

/* ========== BATTLE ========== */
let _battleRunning=false,_battleSpeed=1,_battleTimer=null,_battle=null
var _attrCalcInfo={}

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
  var affix=lv.boss?pickBossAffix():null
  _battle=createBattle({atk:stats.atk,def:stats.def,hp:stats.hp},{atk:lv.atk,def:lv.def,hp:lv.hp},{npc:lv.npc,boss:lv.boss},affix)
  _battleRunning=false;_battleSpeed=1;_battleTimer=null
  document.getElementById('battleLevel').textContent=id+' '+lv.npc+(affix?' 👑':'')+(affix?' ['+affix.name+']':'')
  document.getElementById('beName').textContent='👹 '+lv.npc+(affix?' 👑':'')
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
  if(_battle.done||_battleRunning)return
  _battleRunning=true
  const tick=()=>{
    if(_battle.done){_battleRunning=false;return}
    var result=battleTick(_battle)
    _battle.turn=result.turn
    result.events.forEach(function(ev){addBattleLog(ev.msg,ev.type)})
    renderBattleHP()
    if(_battle.done){endBattle(_battle.winner);_battleRunning=false;return}
    _battleTimer=setTimeout(tick,600/_battleSpeed)
  }
  tick()
}

function renderBattleHP(){
  document.getElementById('bpHP').style.width=Math.max(0,_battle.player.hp/(_battle.player.maxHP||1)*100)+'%'
  document.getElementById('bpHPText').textContent='HP: '+Math.max(0,_battle.player.hp)
  document.getElementById('beHP').style.width=Math.max(0,_battle.enemy.hp/_battle.enemy.maxHP*100)+'%'
  document.getElementById('beHPText').textContent='HP: '+Math.max(0,_battle.enemy.hp)+'/'+_battle.enemy.maxHP
}

function addBattleLog(msg,type){
  const el=document.getElementById('battleLog')
  const div=document.createElement('div');div.className='bl-entry '+(type==='dmg'?'bl-dmg':type==='e'?'bl-def':'')
  div.textContent='▸ '+msg;el.appendChild(div);el.scrollTop=el.scrollHeight
}

function endBattle(won){
  _battle.done=true;const el=document.getElementById('battleEnd')
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

/* ========== GAME EVENT HANDLER ========== */
function onGameEvent(el,id,act){
  switch(id){
    case 'battleClose':_battle.done=true;if(_battleTimer)clearTimeout(_battleTimer);_battleRunning=false
      document.getElementById('battleOverlay').classList.remove('open');renderGame();return true;
    case 'shareClose':hideShare();return true;
    case 'shareSave':toast('长按或截图保存分享卡片 📸','s');return true;
    case 'resetGameBtn':
      if(confirm('确定重置所有挑战进度？此操作不可撤销')){
        var g=getGame();g.cleared=[];g.current='1-1';g.attempts={};setGame(g);renderGame()
        toast('挑战进度已重置','s')
      }
      return true;
    case 'attrInfoBtn':{
      var info=_attrCalcInfo||{atk:'暂无数据',def:'暂无数据',hp:'暂无数据'}
      var modal=document.createElement('div');modal.className='modal-overlay open'
      modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📖 属性计算方式</div>'
        +'<div style="font-size:.8rem;line-height:1.7;color:var(--text2);padding:4px 0">'
        +'<div style="color:var(--orange);font-weight:700;margin-bottom:4px">⚔️ '+info.atk+'</div>'
        +'<div style="color:var(--blue);font-weight:700;margin-bottom:4px">🛡️ '+info.def+'</div>'
        +'<div style="color:var(--green);font-weight:700;margin-bottom:4px">❤️ '+info.hp+'</div>'
        +'<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);font-size:.7rem;color:var(--text3)">'
        +'📊 近30天力量容量: '+info.vol+' kg<br>'
        +'🏃 近30天有氧时长: '+info.dur+' 分钟<br>'
        +'📅 每周4天→+20攻防, 7天→+50攻防<br>'
        +'💡 每200kg容量=+1攻击, 每60分钟=+1防御<br>'
        +((info.permPenAtk+info.permPenDef)>0?'⚠️ 上周训练不足, 永久惩罚 攻-'+info.permPenAtk+' 防-'+info.permPenDef+'<br>':'✅ 每周训练3天以上属性正常<br>')+'</div></div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>'
      document.body.appendChild(modal)
      document.getElementById('attrClose').addEventListener('click',function(){modal.remove()})
      modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
      return true}
  }
  return false
}

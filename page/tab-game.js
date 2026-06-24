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
  var strVol=sumVolume(strE,getExerciseMap())
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
    '<div class="gs-item" style="min-width:80px"><div class="gs-v blue">'+stats.monthDays+'<span style="font-size:.6rem">天</span></div><div class="gs-l">'+monthLabel+'</div></div>'
  _attrCalcInfo={atk:atkInfo,def:defInfo,hp:hpInfo,vol:strVol,dur:carDur,permPenAtk:stats.permPenAtk,permPenDef:stats.permPenDef,lastWkDays:stats.lastWkDays,thisWk:stats.wkDays}
  trackStats(stats,{strVol:strVol,carDur:carDur,carEff:carEff})
  renderRecords()

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
    showLevelPreview(c.dataset.lv)
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
  var strVol=sumVolume(strE,getExerciseMap())
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

function showLevelPreview(id){
  var lv=findLevel(id);if(!lv)return
  var stats=getGameStats()
  var cleared=getGame().cleared.includes(id)

  // Simulate 50 battles for accurate win rate
  var wins=0
  for(var s=0;s<50;s++){
    var batt=createBattle({atk:stats.atk,def:stats.def,hp:stats.hp},{atk:lv.atk,def:lv.def,hp:lv.hp},{npc:lv.npc,boss:lv.boss},lv.boss?pickBossAffix():null)
    for(var t=0;t<100&&!batt.done;t++){battleTick(batt)}
    if(batt.winner)wins++
  }
  var rate=Math.min(98,Math.max(2,Math.round(wins/50*100)))
  var rateColor=rate>=70?'var(--green)':rate>=40?'var(--yellow)':'var(--red)'

  var modal=document.createElement('div');modal.className='modal-overlay open'
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">'+lv.id+' '+lv.npc+(lv.boss?' 👑':'')+(cleared?' ✅':':')+'</div>'
    +'<div class="stats-grid" style="margin-bottom:12px">'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--orange)">⚔️ '+lv.atk+'</div><div class="sc-l">攻击</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--blue)">🛡️ '+lv.def+'</div><div class="sc-l">防御</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--green)">❤️ '+lv.hp+'</div><div class="sc-l">生命</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:'+rateColor+'">'+rate+'%</div><div class="sc-l">胜率(50次模拟)</div></div>'
    +'</div>'

  // Boss affix info
  if(lv.boss){
    var affixes=BOSS_AFFIXES.map(function(a){return a.name+': '+a.desc})
    h+='<div style="background:rgba(249,115,22,.08);border:1px solid var(--orange-g);border-radius:var(--rs);padding:10px 14px;margin-bottom:12px;font-size:.72rem;color:var(--text2)">'
      +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">👑 Boss 词缀 (随机1种)</div>'
      +affixes.map(function(a){return'<div style="padding:2px 0">• '+a+'</div>'}).join('')
      +'</div>'
  }

  // Player stats comparison
  h+='<div style="font-size:.72rem;color:var(--text3);text-align:center;margin-bottom:4px">你的属性: ⚔️'+stats.atk+' 🛡️'+stats.def+' ❤️'+stats.hp+'</div>'

  h+='<div class="modal-actions">'
    +'<button class="m-btn-cancel" id="lvCancel">关闭</button>'
  if(!cleared){
    h+='<button class="m-btn-save" style="background:linear-gradient(135deg,var(--red),#dc2626)" id="lvChallenge">⚔️ 挑战</button>'
  }
  h+='</div></div>'
  modal.innerHTML=h;document.body.appendChild(modal)

  document.getElementById('lvCancel').addEventListener('click',function(){modal.remove()})
  if(!cleared){
    document.getElementById('lvChallenge').addEventListener('click',function(){
      modal.remove();getGame().current=id;setGame(getGame());startBattle(id)
    })
  }
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
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
    // Hit animation
    var pEl=document.getElementById('battlePlayer'),eEl=document.getElementById('battleEnemy')
    result.events.forEach(function(ev){
      if(ev.type==='e'&&eEl){eEl.classList.remove('hit');void eEl.offsetWidth;eEl.classList.add('hit')}
      if(ev.type==='dmg'&&pEl){pEl.classList.remove('hit');void pEl.offsetWidth;pEl.classList.add('hit')}
    })
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
    trackLevel(g.current)
    el.innerHTML='<div class="be-result be-win">🏆 胜利！</div><div class="be-replay"><button class="be-btn be-btn-next" id="battleNext">下一关 →</button><button class="be-btn be-btn-retry" id="battleShare">📤 分享卡片</button></div>'
    celebrate()
  } else {
    el.innerHTML='<div class="be-result be-lose">💀 战败</div><div class="be-replay"><button class="be-btn be-btn-retry" id="battleRetry">🔄 重新挑战</button></div>'
  }
  document.getElementById('battleNext')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');renderGame()})
  document.getElementById('battleRetry')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');setTimeout(()=>startBattle(getGame().current),100)})
  document.getElementById('battleShare')?.addEventListener('click',showShareCard)
}

/* ========== RECORDS & ATTRIBUTE LOG ========== */
function compareLevel(a,b){var pa=a.split('-'),pb=b.split('-');if(pa[0]!==pb[0])return parseInt(pa[0])-parseInt(pb[0]);return parseInt(pa[1])-parseInt(pb[1])}

function trackLevel(id){
  var recs=store.get('records')||{}
  var monthKey=today().slice(0,7)
  if(!recs.monthly)recs.monthly={}
  if(!recs.monthly[monthKey])recs.monthly[monthKey]={}
  if(!recs.maxCleared||compareLevel(id,recs.maxCleared)>0){recs.maxCleared=id;recs.maxClearedDate=today()}
  var m=recs.monthly[monthKey]
  if(!m.maxCleared||compareLevel(id,m.maxCleared)>0)m.maxCleared=id
  store.set('records',recs)
}

function trackStats(stats,detail){
  var now=today()
  var monthKey=now.slice(0,7)
  var log=store.get('attrLog')||[]
  var last=log.length?log[log.length-1]:null
  var changed=!last||last.atk!==stats.atk||last.def!==stats.def||last.hp!==stats.hp
  if(changed&&(last?last.date!==now:true)){
    var atkDiff=last?stats.atk-last.atk:0
    var defDiff=last?stats.def-last.def:0
    var hpDiff=last?stats.hp-last.hp:0
    var strVolDiff=last.strVol?detail.strVol-last.strVol:detail.strVol
    var carEffDiff=last.carEff?detail.carEff-last.carEff:detail.carEff
    var reason=[]
    if(strVolDiff)reason.push('容量'+(strVolDiff>0?'+':'')+strVolDiff+'kg→攻'+(atkDiff>0?'+':'')+atkDiff)
    if(carEffDiff)reason.push('有效有氧'+(carEffDiff>0?'+':'')+carEffDiff+'min')
    if(stats.wkBonus)reason.push('周奖励+'+stats.wkBonus)
    if(stats.permPenAtk||stats.permPenDef)reason.push('惩罚攻-'+stats.permPenAtk+'防-'+stats.permPenDef)
    log.push({
      date:now,atk:stats.atk,def:stats.def,hp:stats.hp,
      atkDiff:atkDiff,defDiff:defDiff,hpDiff:hpDiff,
      reason:reason.join(' · ')||'属性变化',
      wkDays:stats.wkDays,
      strVol:detail.strVol,carEff:detail.carEff
    })
    if(log.length>60)log=log.slice(-60)
    store.set('attrLog',log)
  }
  var recs=store.get('records')||{}
  if(!recs.monthly)recs.monthly={}
  if(!recs.monthly[monthKey])recs.monthly[monthKey]={}
  var m=recs.monthly[monthKey]
  if(!recs.maxAtk||stats.atk>recs.maxAtk){recs.maxAtk=stats.atk;recs.maxAtkDate=now}
  if(!recs.maxDef||stats.def>recs.maxDef){recs.maxDef=stats.def;recs.maxDefDate=now}
  if(!recs.maxHp||stats.hp>recs.maxHp){recs.maxHp=stats.hp;recs.maxHpDate=now}
  if(!m.maxAtk||stats.atk>m.maxAtk)m.maxAtk=stats.atk
  if(!m.maxDef||stats.def>m.maxDef)m.maxDef=stats.def
  if(!m.maxHp||stats.hp>m.maxHp)m.maxHp=stats.hp
  store.set('records',recs)
}

function renderRecords(){
  var recs=store.get('records')||{}
  if(!recs.maxAtk&&!recs.maxCleared)return
  var h=''

  // Monthly best with navigation
  var mKey=_recMonth||today().slice(0,7)
  var m=recs.monthly&&recs.monthly[mKey]
  var mParts=mKey.split('-'),mLabel=mParts[1]+'月'
  h+='<div class="section-hdr" style="margin-bottom:4px">📅 '+mLabel+'最佳 <span style="font-size:.65rem;font-weight:400;margin-left:8px"><button class="hm-nav-btn" style="display:inline;width:auto;padding:1px 6px" onclick="_recMonth=prevMonth(_recMonth);renderRecords()">◀</button> <button class="hm-nav-btn" style="display:inline;width:auto;padding:1px 6px" id="recMonthNow">本月</button> <button class="hm-nav-btn" style="display:inline;width:auto;padding:1px 6px" onclick="_recMonth=nextMonth(_recMonth);renderRecords()">▶</button></span></div>'
  if(m&&(m.maxAtk||m.maxCleared)){
    h+='<div class="stats-grid">'
    if(m.maxCleared)h+='<div class="sc"><div class="sc-v" style="font-size:.9rem">📖 '+m.maxCleared+'</div><div class="sc-l">最高关卡</div></div>'
    if(m.maxAtk)h+='<div class="sc sc-rate"><div class="sc-v">⚔️ '+m.maxAtk+'</div><div class="sc-l">最高攻击</div></div>'
    if(m.maxDef)h+='<div class="sc sc-total"><div class="sc-v">🛡️ '+m.maxDef+'</div><div class="sc-l">最高防御</div></div>'
    if(m.maxHp)h+='<div class="sc sc-vol"><div class="sc-v">❤️ '+m.maxHp+'</div><div class="sc-l">最高生命</div></div>'
    h+='</div>'
  }else{h+='<div style="font-size:.7rem;color:var(--text3);padding:8px 0">暂无数据</div>'}

  // Historical best
  h+='<div class="section-hdr">🏆 历史最佳</div><div class="stats-grid">'
  if(recs.maxCleared)h+='<div class="sc"><div class="sc-v" style="font-size:.9rem">📖 '+recs.maxCleared+'</div><div class="sc-l">最高关卡</div></div>'
  if(recs.maxAtk)h+='<div class="sc sc-rate"><div class="sc-v">⚔️ '+recs.maxAtk+'</div><div class="sc-l">最高攻击</div></div>'
  if(recs.maxDef)h+='<div class="sc sc-total"><div class="sc-v">🛡️ '+recs.maxDef+'</div><div class="sc-l">最高防御</div></div>'
  if(recs.maxHp)h+='<div class="sc sc-vol"><div class="sc-v">❤️ '+recs.maxHp+'</div><div class="sc-l">最高生命</div></div>'
  h+='</div>'

  var el=document.getElementById('recordsCard')
  if(el)el.innerHTML=h
  var nowBtn=document.getElementById('recMonthNow')
  if(nowBtn)nowBtn.addEventListener('click',function(){_recMonth=null;renderRecords()})
}
var _recMonth=null
function prevMonth(key){var k=key||today().slice(0,7);var p=k.split('-');var y=parseInt(p[0]),m=parseInt(p[1])-1;if(m<1){m=12;y--}return y+'-'+String(m).padStart(2,'0')}
function nextMonth(key){var k=key||today().slice(0,7);var p=k.split('-');var y=parseInt(p[0]),m=parseInt(p[1])+1;if(m>12){m=1;y++};var now=new Date();if(y>now.getFullYear()||(y===now.getFullYear()&&m>now.getMonth()+1))return key;return y+'-'+String(m).padStart(2,'0')}

function showAttrLog(){
  var log=store.get('attrLog')||[]
  if(!log.length){toast('暂无变更记录','');return}
  var modal=document.createElement('div');modal.className='modal-overlay open'
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📜 属性变更日志</div><div style="max-height:60vh;overflow-y:auto;font-size:.75rem">'
  for(var i=log.length-1;i>=0;i--){
    var l=log[i]
    function dl(v){return v>0?'<span style="color:var(--green)">+'+v+'</span>':v<0?'<span style="color:var(--red)">'+v+'</span>':''}
    var dlAtk=dl(l.atkDiff),dlDef=dl(l.defDiff),dlHp=dl(l.hpDiff)
    var attrs='⚔️ <b>'+l.atk+'</b>'+dlAtk+' 🛡️ <b>'+l.def+'</b>'+dlDef+' ❤️ <b>'+l.hp+'</b>'+dlHp
    h+='<div style="padding:10px 0;border-bottom:1px solid var(--bd)">'
      +'<div style="font-weight:700;font-size:.8rem">'+l.date+'</div>'
      +'<div style="font-size:.85rem;margin:2px 0">'+attrs+'</div>'
      +'<div style="color:var(--text2);margin-bottom:2px">'+l.reason+'</div>'
      +'<div style="color:var(--text3);font-size:.65rem">周训练'+l.wkDays+'天</div>'
      +'</div>'
  }
  h+='</div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>'
  modal.innerHTML=h;document.body.appendChild(modal)
  document.getElementById('attrClose').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
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
  }
  return false
}

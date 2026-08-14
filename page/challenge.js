/* ============================================
   MyHealth — Hidden Challenge (隐藏挑战召唤)
   ============================================ */

/* ========== SUMMON LOGIC ========== */
function getChallenge(){
  return store.get('challenge')||{
    summonedDate:'',   // last successful summon date (YYYY-MM-DD)
    seasonBonus:{atk:0,def:0,hp:0},  // monthly-reset bonus from challenge
    todayUsed:0,       // summon attempts used today
    useDate:'',        // date of todayUsed (reset on new day)
    weekDays:[],       // this week's dates successfully played (for 热血 buff)
    weekKey:'',        // week key (Mon date) for 热血 buff
    hotBuffUsed:false  // whether 热血 buff already triggered this week
  }
}
function saveChallenge(c){store.set('challenge',c||{})}

/* Daily reset: new day resets todayUsed */
function checkChallengeDailyReset(){
  var c=getChallenge()
  var t=today()
  if(c.useDate!==t){
    c.useDate=t
    c.todayUsed=0
    saveChallenge(c)
  }
}

/* Week key = Monday's date of current week */
function getWeekKey(){
  var n=new Date(),d=n.getDay()
  var m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d))
  return toDate(m)
}

/* Today's volume from strength entries */
function getTodayVolume(){
  var strE=((store.get('strength')||{entries:[]}).entries)||[]
  var filtered=strE.filter(function(e){return e.date===today()})
  return sumVolume(filtered,getExerciseMap())
}

/* Can summon? Each 100kg grants 1 attempt; attempt i has rate 15%+10%*(i-1) */
function canSummon(){
  checkChallengeDailyReset()
  var c=getChallenge()
  if(c.summonedDate===today())return{can:false,reason:'今日已召唤成功，挑战完成'}
  var vol=getTodayVolume()
  var total=Math.floor(vol/100)
  if(total<1)return{can:false,reason:'今日训练容量 '+Math.round(vol)+'kg，每 100kg 获得 1 次召唤机会'}
  if(c.todayUsed>=total)return{can:false,reason:'今日召唤次数已用完（'+total+'次），明天再练更猛！'}
  var rate=Math.min(100,15+c.todayUsed*10)
  return{can:true,rate:rate,total:total,used:c.todayUsed,vol:vol}
}

/* Attempt summon */
function attemptSummon(){
  var info=canSummon()
  if(!info.can){toast(info.reason,'e');return}
  var c=getChallenge()
  var roll=Math.random()*100
  if(roll<info.rate){
    // Success! Mark summoned today, then show challenge preview
    c.summonedDate=today()
    c.todayUsed=info.used+1
    // Track week days for 热血 buff
    var wk=getWeekKey()
    if(c.weekKey!==wk){c.weekKey=wk;c.weekDays=[];c.hotBuffUsed=false}
    if(c.weekDays.indexOf(today())<0)c.weekDays.push(today())
    saveChallenge(c)
    toast('🔮 召唤成功！进入隐藏挑战！','s')
    showChallengePreview()
  }else{
    // Failure — attempt used, rate climbs for next try
    c.todayUsed=info.used+1
    saveChallenge(c)
    var newRate=Math.min(100,15+c.todayUsed*10)
    toast('❌ 召唤失败！下次成功率 '+newRate+'%（剩 '+(info.total-info.used-1)+' 次）','e')
    renderSummonPanel()
  }
}

/* ========== SUMMON PANEL UI ========== */
function renderSummonPanel(){
  var el=document.getElementById('summonPanel')
  if(!el)return
  var info=canSummon()
  var strVol=getTodayVolume()
  var triggers=Math.floor(strVol/100)
  // Hidden until 100kg reached today
  if(strVol<100){el.innerHTML='';return}
  
  var c=getChallenge()
  if(c.summonedDate===today()){
    // Already played today
    var bonus=c.seasonBonus||{atk:0,def:0,hp:0};
    el.innerHTML='<div class="summon-card done">'
      +'<div class="summon-title">⚡ 今日隐藏挑战已完成</div>'
      +'<div class="summon-info">明日继续，每月 1 号重置奖励</div>'
      +(bonus.atk+bonus.def+bonus.hp>0?'<div class="summon-bonus">本月已获得: ⚔️+'+bonus.atk+' 🛡️+'+bonus.def+' ❤️+'+bonus.hp+'</div>':'')
      +'</div>'
    return
  }
  
  var rate=info.rate||(15+0)
  var rateColor=rate>=80?'var(--green)':rate>=50?'var(--orange)':'var(--yellow)'
  var remain=info.total-info.used
  var hotHtml=renderHotBuffHint(c)
  el.innerHTML='<div class="summon-card">'
    +'<div class="summon-title">🔮 隐藏挑战</div>'
    +'<div class="summon-info">今日训练容量 <b>'+Math.round(strVol)+'kg</b> · 召唤机会 <b>'+remain+'/'+info.total+'</b> 次（每 100kg +1 次，几率逐次+10%）</div>'
    +'<div class="summon-rate-wrap">'
    +  '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">本次召唤成功率（第 '+(info.used+1)+' 次）</div>'
    +  '<div class="summon-rate-bar"><div class="summon-rate-fill" style="width:'+rate+'%;background:'+rateColor+'"></div></div>'
    +  '<div style="text-align:center;font-weight:700;color:'+rateColor+';font-size:1rem;margin-top:4px">'+rate+'%</div>'
    +'</div>'
    +hotHtml
    +'<button class="summon-btn" id="summonBtn">🔮 召唤</button>'
    +'<div style="font-size:.6rem;color:var(--text3);text-align:center;margin-top:6px">每天最多成功召唤1次 · 每 100kg 叠加次数与几率</div>'
    +'</div>'
  var btn=document.getElementById('summonBtn')
  if(btn)btn.addEventListener('click',attemptSummon)
}

/* 热血 buff hint — 本周连续 3 天开启后，第 4 次开启附加热血 buff */
function renderHotBuffHint(c){
  var wk=getWeekKey()
  if(c.weekKey!==wk){c.weekKey=wk;c.weekDays=[];c.hotBuffUsed=false}
  var days=c.weekDays?c.weekDays.length:0
  if(c.hotBuffUsed)return''
  if(days>=4){
    return'<div class="summon-hot ready">🔥 热血 buff 已就绪！本次挑战随机获得：暴击率+55%·暴伤+35% / 暴伤+120%·暴击率+15% / 倒计时+40%·基础时间70~100%</div>'
  }
  if(days>=1){
    return'<div class="summon-hot">🔥 本周已连续挑战 '+days+' 天，连续 4 天解锁热血 buff！</div>'
  }
  return''
}

/* ========== HIDDEN CHALLENGE MINIGAME ========== */

/* Pick a random 热血 buff (weekly, once per week after 4 consecutive days) */
function pickHotBuff(){
  var buffs=['critRate','critDmg','timeBonus']
  return buffs[Math.floor(Math.random()*buffs.length)]
}
function hotBuffLabel(kind){
  return kind==='critRate'?'🔥 暴击率+55% · 暴击伤害+35%':kind==='critDmg'?'🔥 暴击伤害+120% · 暴击率+15%':'🔥 倒计时+40% · 基础时间70~100%'
}

/* Step 1: summon success → show challenge preview, wait for user to press 开始挑战 */
function showChallengePreview(){
  var old=document.getElementById('challengeModal')
  if(old)old.remove()
  var stats=getGameStats()
  var c=getChallenge()
  // 热血 buff: week has >=4 played days (3 previous + today's 4th) and not used this week
  var hotBuff=null
  if(c.weekDays&&c.weekDays.length>=4&&!c.hotBuffUsed){
    hotBuff=pickHotBuff()
    c.hotBuffUsed=true
    saveChallenge(c)
  }
  var modal=openModal(null,'challengeModal')
  var h='<div class="modal-sheet">'
    +'<div class="modal-handle"></div>'
    +'<div class="modal-title">🔬 隐藏挑战</div>'
    +'<div class="ch-preview">'
    +  '<div class="ch-preview-title">召唤成功！</div>'
    +  '<div style="font-size:.72rem;color:var(--text3);margin-bottom:8px">倒计时 8-12 秒，疯狂点击攻击按钮造成伤害，伤害将转化为本月属性奖励。</div>'
    +  '<div class="ch-stats" style="grid-template-columns:1fr 1fr 1fr 1fr">'
    +    '<div class="ch-stat">⚔️ <b>'+stats.atk+'</b></div>'
    +    '<div class="ch-stat">👻 <b>'+(stats.soulAtk||0)+'</b></div>'
    +    '<div class="ch-stat">🛡️ <b>'+stats.def+'</b></div>'
    +    '<div class="ch-stat">🔮 <b>'+(stats.soulDef||0)+'</b></div>'
    +  '</div>'
    +(hotBuff?'<div class="ch-hotbuff">'+hotBuffLabel(hotBuff)+'</div>':'')
    +  '<div style="font-size:.68rem;color:var(--text3);text-align:center;margin:8px 0">伤害 = (攻击+魂攻)×10%×(随机0.5~1.5) · 20%暴击附加(防御+魂防)</div>'
    +'</div>'
    +'<div class="modal-actions">'
    +  '<button class="m-btn-cancel" id="chLater">稍后再说</button>'
    +  '<button class="m-btn-save" id="chStart" style="flex:2">⚔️ 开始挑战</button>'
    +'</div>'
    +'</div>'
  modal.innerHTML=h
  document.getElementById('chLater').addEventListener('click',function(){modal.remove();renderSummonPanel();renderGame()})
  document.getElementById('chStart').addEventListener('click',function(){modal.remove();startHiddenChallenge(hotBuff)})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

/* Step 2: actual minigame — countdown + tap attack */
function startHiddenChallenge(hotBuff){
  var stats=getGameStats()
  var baseDur=8+Math.floor(Math.random()*5) // 8-12 seconds
  var duration=baseDur
  var critRate=0.20
  var critDmg=1.5   // 暴击伤害倍率制：基础 150%
  if(hotBuff==='critRate'){critRate=0.75;critDmg=1.85}  // 暴击率+55% 且 暴击伤害+35%
  if(hotBuff==='critDmg'){critRate=0.35;critDmg=2.7}   // 暴击伤害+120% 且 暴击率+15%
  if(hotBuff==='timeBonus'){
    // 倒计时+40%：基础时间锁定 70%~100% 高值区间 (10.8~12s) 再 ×1.4
    baseDur=8+4*(0.7+Math.random()*0.3)
    duration=Math.round(baseDur*1.4)
  }
  var state={
    timeLeft:duration,
    duration:duration,
    totalDamage:0,
    hitCount:0,
    critCount:0,
    maxHit:0,
    timer:null,
    ticking:false,
    critRate:critRate,
    critDmg:critDmg,
    hotBuff:hotBuff,
    playerAtk:stats.atk,
    playerSoulAtk:stats.soulAtk||0,
    playerDef:stats.def,
    playerSoulDef:stats.soulDef||0
  }
  
  var modal=openModal(null,'challengeModal')
  var h='<div class="modal-sheet">'
    +'<div class="modal-handle"></div>'
    +'<div class="modal-title">🔬 隐藏挑战</div>'
    +(hotBuff?'<div class="ch-hotbuff">'+hotBuffLabel(hotBuff)+'</div>':'')
    +'<div class="ch-timer-wrap">'
    +  '<div class="ch-timer" id="chTimer">'+duration+'s</div>'
    +  '<div class="ch-timer-bar-wrap"><div class="ch-timer-bar" id="chTimerBar" style="width:100%"></div></div>'
    +'</div>'
    +'<div class="ch-stats" id="chStats">'
    +  '<div class="ch-stat">⚔️ 攻 <b>'+state.playerAtk+'</b></div>'
    +  '<div class="ch-stat">👻 魂攻 <b>'+state.playerSoulAtk+'</b></div>'
    +  '<div class="ch-stat">🛡️ 防 <b>'+state.playerDef+'</b></div>'
    +  '<div class="ch-stat">🔮 魂防 <b>'+state.playerSoulDef+'</b></div>'
    +'</div>'
    +'<div class="ch-damage-display" id="chDamage">0</div>'
    +'<div class="ch-info" id="chInfo">'+(hotBuff==='timeBonus'?'倒计时延长 40%，坚持就是胜利！':'点击攻击造成伤害！')+'</div>'
    +'<button class="ch-attack-btn" id="chAttackBtn">⚔️ 攻击</button>'
    +'<div class="ch-hits" id="chHits"></div>'
    +'</div>'
  modal.innerHTML=h;void modal
  
  var attackBtn=document.getElementById('chAttackBtn')
  var timerEl=document.getElementById('chTimer')
  var timerBar=document.getElementById('chTimerBar')
  var damageEl=document.getElementById('chDamage')
  var infoEl=document.getElementById('chInfo')
  var hitsEl=document.getElementById('chHits')
  
  function doAttack(){
    if(state.ticking===false)return // game ended
    state.hitCount++
    // 新公式: 基础伤害 = 攻×50% + 魂攻×150% + 防×100% + 魂防×100%，乘 random(0.5~1.5)
    var baseConst=state.playerAtk*0.5+state.playerSoulAtk*1.5+state.playerDef*1.0+state.playerSoulDef*1.0
    var rand=Math.random()*1+0.5 // 0.5~1.5
    var dmg=Math.round(baseConst*rand)
    var crit=false
    // 暴击倍率制: 基础率20%，暴击时伤害 × 暴击倍率
    if(Math.random()<state.critRate){
      crit=true
      state.critCount++
      dmg=Math.round(dmg*state.critDmg)
    }
    state.totalDamage+=dmg
    if(dmg>state.maxHit)state.maxHit=dmg
    
    // Visual feedback
    damageEl.textContent=state.totalDamage
    infoEl.innerHTML=(crit?'<span style="color:var(--yellow);font-weight:700">💥 暴击! +'+dmg+'</span>':'<span style="color:var(--orange)">+'+dmg+'</span>')
    // Hit log
    var hitDiv=document.createElement('div')
    hitDiv.className='ch-hit'+(crit?' crit':'')
    hitDiv.textContent=(crit?'💥':'⚔️')+' '+dmg+(crit?' (暴击)':'')
    hitsEl.insertBefore(hitDiv,hitsEl.firstChild)
    if(hitsEl.children.length>15)hitsEl.lastChild.remove()
    // Attack animation
    if(attackBtn){
      attackBtn.classList.remove('pulse')
      void attackBtn.offsetWidth
      attackBtn.classList.add('pulse')
    }
  }
  
  attackBtn.addEventListener('click',doAttack)
  
  // Touch-friendly: support rapid tapping
  attackBtn.addEventListener('touchstart',function(e){
    e.preventDefault()
    doAttack()
  })
  
  function endChallenge(){
    state.ticking=false
    if(state.timer){clearInterval(state.timer);state.timer=null}
    if(attackBtn)attackBtn.disabled=true
    // Calculate bonus: total damage → reward
    var dmg=state.totalDamage
    var bonusAtk=Math.floor(dmg/1500)
    var bonusDef=Math.floor(dmg/2250)
    var bonusHp=Math.floor(dmg/450)*3
    var c=getChallenge()
    c.seasonBonus.atk=(c.seasonBonus.atk||0)+bonusAtk
    c.seasonBonus.def=(c.seasonBonus.def||0)+bonusDef
    c.seasonBonus.hp=(c.seasonBonus.hp||0)+bonusHp
    saveChallenge(c)
    
    // Show result
    var h2='<div class="ch-result">'
      +'<div class="ch-result-title">🏆 挑战结束</div>'
      +'<div class="ch-result-stats">'
      +  '<div>⚔️ 总伤害: <b>'+dmg+'</b></div>'
      +  '<div>🎯 命中: <b>'+state.hitCount+'</b> 次</div>'
      +  '<div>💥 暴击: <b>'+state.critCount+'</b> 次</div>'
      +  '<div>🥇 最强一击: <b>'+state.maxHit+'</b></div>'
      +'</div>'
      +'<div class="ch-reward">'
      +  '<div style="font-weight:700;margin-bottom:6px">🎁 本月属性奖励（月度重置）</div>'
      +  '<div class="ch-reward-info">'
      +(bonusAtk>0?'  <span style="color:var(--orange)">⚔️ +'+bonusAtk+'</span>':'')
      +(bonusDef>0?'  <span style="color:var(--blue)">🛡️ +'+bonusDef+'</span>':'')
      +(bonusHp>0?'  <span style="color:var(--green)">❤️ +'+bonusHp+'</span>':'')
      +(bonusAtk+bonusDef+bonusHp===0?'  <span style="color:var(--text3)">伤害不足，未获得奖励</span>':'')
      +  '</div>'
      +'</div>'
      +'<div class="ch-cumulative" id="chCumulative"></div>'
      +'<div class="modal-actions"><button class="m-btn-cancel" id="chClose">关闭</button></div>'
      +'</div>'
    var sheet=modal.querySelector('.modal-sheet')
    if(sheet){
      sheet.innerHTML=h2
      var cumEl=document.getElementById('chCumulative')
      if(cumEl){
        var cum=c.seasonBonus
        cumEl.innerHTML='<div style="font-size:.68rem;color:var(--text3);margin-top:8px">本月累计: ⚔️+'+cum.atk+' 🛡️+'+cum.def+' ❤️+'+cum.hp+'</div>'
      }
      var closeBtn=document.getElementById('chClose')
      if(closeBtn)closeBtn.addEventListener('click',function(){modal.remove();renderSummonPanel();renderGame()})
    }
  }
  
  // Start countdown
  state.ticking=true
  state.timer=setInterval(function(){
    state.timeLeft--
    if(timerEl)timerEl.textContent=state.timeLeft+'s'
    if(timerBar)timerBar.style.width=(state.timeLeft/state.duration*100)+'%'
    if(timerBar&&state.timeLeft<=3)timerBar.classList.add('urgent')
    if(state.timeLeft<=0){
      endChallenge()
    }
  },1000)
  
  // Overlay click: no close during game (prevent accidental exit)
  modal.addEventListener('click',function(e){
    if(e.target===e.currentTarget&&state.ticking===false)modal.remove()
  })
}

/* ========== INTEGRATION ========== */
// Called from checkMonthlyReset to clear season bonus
function resetChallengeSeason(){
  var c=getChallenge()
  c.seasonBonus={atk:0,def:0,hp:0}
  saveChallenge(c)
  toast('🔬 隐藏挑战奖励已重置','s')
}

// Called from getGameStats to add challenge bonus to attributes
function getChallengeBonus(){
  var c=getChallenge()
  return c.seasonBonus||{atk:0,def:0,hp:0}
}
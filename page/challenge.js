/* ============================================
   MyHealth — Hidden Challenge (隐藏挑战召唤)
   ============================================ */

/* ========== SUMMON LOGIC ========== */
function getChallenge(){
  return store.get('challenge')||{
    summonedDate:'',   // last successful summon date (YYYY-MM-DD)
    seasonBonus:{atk:0,def:0,hp:0},  // monthly-reset bonus from challenge
    todayFailCount:0,  // today's summon failures since last success
    failDate:''        // date of todayFailCount (reset on new day)
  }
}
function saveChallenge(c){store.set('challenge',c||{})}

/* Daily reset: if it's a new day, reset fail count */
function checkChallengeDailyReset(){
  var c=getChallenge()
  var t=today()
  if(c.failDate!==t){
    c.failDate=t
    c.todayFailCount=0
    saveChallenge(c)
  }
}

/* Today's volume from strength entries */
function getTodayVolume(){
  var strE=((store.get('strength')||{entries:[]}).entries)||[]
  var filtered=strE.filter(function(e){return e.date===today()})
  return sumVolume(filtered,getExerciseMap())
}

/* Can summon? */
function canSummon(){
  checkChallengeDailyReset()
  var c=getChallenge()
  if(c.summonedDate===today())return{can:false,reason:'今日已召唤成功，等待结束结算'}
  var vol=getTodayVolume()
  if(vol<100)return{can:false,reason:'今日训练容量 '+Math.round(vol)+'kg，需 ≥100kg 才能召唤'}
  var fail=c.todayFailCount
  var rate=Math.min(100,15+fail*10)
  return{can:true,rate:rate,failCount:fail,vol:vol}
}

/* Attempt summon */
function attemptSummon(){
  var info=canSummon()
  if(!info.can){toast(info.reason,'e');return}
  var c=getChallenge()
  var roll=Math.random()*100
  if(roll<info.rate){
    // Success!
    c.summonedDate=today()
    c.todayFailCount=0
    saveChallenge(c)
    toast('🔮 召唤成功！进入隐藏挑战！','s')
    startHiddenChallenge()
  }else{
    // Failure
    c.todayFailCount++
    saveChallenge(c)
    var newRate=Math.min(100,15+c.todayFailCount*10)
    toast('❌ 召唤失败！下次成功率 '+newRate+'%','e')
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
  el.innerHTML='<div class="summon-card">'
    +'<div class="summon-title">🔮 隐藏挑战</div>'
    +'<div class="summon-info">今日训练容量 <b>'+Math.round(strVol)+'kg</b> · 召唤机会 '+triggers+'次</div>'
    +'<div class="summon-rate-wrap">'
    +  '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">召唤成功率</div>'
    +  '<div class="summon-rate-bar"><div class="summon-rate-fill" style="width:'+rate+'%;background:'+rateColor+'"></div></div>'
    +  '<div style="text-align:center;font-weight:700;color:'+rateColor+';font-size:1rem;margin-top:4px">'+rate+'%</div>'
    +'</div>'
    +'<button class="summon-btn" id="summonBtn">🔮 召唤</button>'
    +'<div style="font-size:.6rem;color:var(--text3);text-align:center;margin-top:6px">每天最多成功召唤1次 · 失败后概率+10%</div>'
    +'</div>'
  var btn=document.getElementById('summonBtn')
  if(btn)btn.addEventListener('click',attemptSummon)
}

/* ========== HIDDEN CHALLENGE MINIGAME ========== */
function startHiddenChallenge(){
  // Remove any stale challenge modal first
  var old=document.getElementById('challengeModal');
  if(old)old.remove()
  var stats=getGameStats()
  var duration=8+Math.floor(Math.random()*5) // 8-12 seconds
  var state={
    timeLeft:duration,
    duration:duration,
    totalDamage:0,
    hitCount:0,
    critCount:0,
    maxHit:0,
    timer:null,
    ticking:false,
    playerAtk:stats.atk,
    playerSoulAtk:stats.soulAtk||0,
    playerDef:stats.def,
    playerSoulDef:stats.soulDef||0
  }
  
  var modal=openModal(null,'challengeModal')
  var h='<div class="modal-sheet">'
    +'<div class="modal-handle"></div>'
    +'<div class="modal-title">🔬 隐藏挑战</div>'
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
    +'<div class="ch-info" id="chInfo">点击攻击造成伤害！</div>'
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
    // Damage = (atk + soulAtk) × random(0.5~1.5) × 10%
    var base=state.playerAtk+state.playerSoulAtk
    var rand=Math.random()*1+0.5 // 0.5~1.5
    var dmg=Math.round(base*0.10*rand)
    var crit=false
    // 20% crit chance, crit adds (def + soulDef) damage
    if(Math.random()<0.20){
      crit=true
      state.critCount++
      dmg+=state.playerDef+state.playerSoulDef
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
    // Reward formula: scale damage to stat bonus
    // Every 500 damage → +1 atk, +1 def, +3 hp
    var bonusAtk=Math.floor(dmg/500)
    var bonusDef=Math.floor(dmg/750)
    var bonusHp=Math.floor(dmg/150)*3
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
    if(state.timeLeft<=0){
      endChallenge()
    }
  },1000)
  
  // Overlay click: no close during game (prevent accidental exit)
  // After game ends, allow close
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
/* ============================================
   MyHealth — Hidden Challenge (隐藏挑战召唤)
   ============================================ */

/* ========== SUMMON LOGIC ========== */
function getChallenge(){
  var c=store.get('challenge')||{}
  // 字段归一化：兼容旧数据/缺字段/NaN污染，防止 undefined+1=NaN 传播
  var num=function(v,d){return(typeof v==='number'&&isFinite(v))?v:d}
  var str=function(v,d){return(typeof v==='string')?v:d}
  c.summonedDate=str(c.summonedDate,'')
  c.seasonBonus=(c.seasonBonus&&typeof c.seasonBonus==='object'&&!Array.isArray(c.seasonBonus))?c.seasonBonus:{atk:0,def:0,hp:0}
  c.seasonBonus.atk=num(c.seasonBonus.atk,0)
  c.seasonBonus.def=num(c.seasonBonus.def,0)
  c.seasonBonus.hp=num(c.seasonBonus.hp,0)
  c.todayUsed=num(c.todayUsed,0)
  c.useDate=str(c.useDate,'')
  c.weekDays=Array.isArray(c.weekDays)?c.weekDays:[]
  c.weekKey=str(c.weekKey,'')
  c.hotBuffUsed=!!c.hotBuffUsed
  c.pendingChallenge=!!c.pendingChallenge
  c.lastRewardDate=str(c.lastRewardDate,'')
  c.history=Array.isArray(c.history)?c.history:[]
  // 清理 v1.9.1 时代遗留字段（已无使用）
  if(c.todayFailCount!==undefined){delete c.todayFailCount}
  if(c.failDate!==undefined){delete c.failDate}
  return c
}
function saveChallenge(c){store.set('challenge',c||{})}

/* 召唤成功率阶梯：used=今日已失败次数。
   第1次10%，每失败一次+15%（10/25/40/55），第5次起保底80%，第6次起必成 */
function summonRate(used){
  var u=(typeof used==='number'&&isFinite(used))?Math.max(0,used):0
  if(u>=5)return 100
  if(u===4)return 80
  return Math.min(100,10+u*15)
}

/* Daily reset: new day resets todayUsed （同时兜底修复 NaN 污染） */
function checkChallengeDailyReset(){
  var c=getChallenge()
  var t=today()
  var dirty=false
  if(c.useDate!==t){c.useDate=t;c.todayUsed=0;dirty=true}
  // 结构修复：todayUsed 非有限数 → 0
  if(typeof c.todayUsed!=='number'||!isFinite(c.todayUsed)){c.todayUsed=0;dirty=true}
  if(typeof c.seasonBonus!=='object'||!c.seasonBonus){c.seasonBonus={atk:0,def:0,hp:0};dirty=true}
  // 清理 v1.9.1 遗留字段（todayFailCount/failDate）
  if(c.todayFailCount!==undefined){delete c.todayFailCount;dirty=true}
  if(c.failDate!==undefined){delete c.failDate;dirty=true}
  if(dirty)saveChallenge(c)
}

/* Week key = Monday's date of current week */
function getWeekKey(){
  var n=new Date(),d=n.getDay()
  var m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d))
  return toDate(m)
}

/* Today's volume from strength entries */
function getVolumeFor(dateStr){
  var strE=((store.get('strength')||{entries:[]}).entries)||[]
  var filtered=strE.filter(function(e){return e.date===dateStr})
  return sumVolume(filtered,getExerciseMap())
}
function getTodayVolume(){return getVolumeFor(today())}

/* Can summon? Each 100kg grants 1 attempt; ladder 10/25/40/55/80/100 via summonRate().
   容量实时对齐：训练记录被删除导致总次数缩水时，撤销未开始的召唤资格并封顶已用次数
   昨日顺延：昨天容量≥100 且昨天未成功召唤（history/weekDays 判定）→ 昨日未用资格并入今日 */
function canSummon(){
  checkChallengeDailyReset()
  var c=getChallenge()
  var vol=getTodayVolume()
  if(typeof vol!=='number'||!isFinite(vol))vol=0
  var yd=new Date();yd.setDate(yd.getDate()-1)
  var yKey=toDate(yd)
  var yVol=getVolumeFor(yKey)
  if(typeof yVol!=='number'||!isFinite(yVol))yVol=0
  var usedYesterday=(c.history||[]).some(function(h){return h&&h.date===yKey})||(c.weekDays||[]).indexOf(yKey)>=0
  var borrowed=usedYesterday?0:Math.floor(yVol/100)
  var total=Math.floor(vol/100)+borrowed
  // 容量回撤守卫：pending 资格所依赖的训练记录被删除（total < 已用数，含成功那一次）→ 同步撤销
  if(c.pendingChallenge&&c.summonedDate!==today()&&total<c.todayUsed){
    c.pendingChallenge=false
    c.todayUsed=Math.max(0,Math.min(c.todayUsed,total))
    saveChallenge(c)
    toast('⚠️ 检测到训练记录被删除，今日召唤资格已同步撤销','e')
  }
  // 已召唤成功但还没开始（稍后再说/刷新后恢复）
  if(c.pendingChallenge)return{can:true,pending:true,reason:'已召唤成功，等待开始挑战'}
  if(c.summonedDate===today())return{can:false,reason:'今日已召唤成功，挑战完成'}
  if(total<1)return{can:false,total:total,used:c.todayUsed,rate:summonRate(c.todayUsed),vol:vol,borrowed:0,yVol:yVol,reason:'今日训练容量 '+Math.round(vol)+'kg（昨日无可用补召资格），每 100kg 获得 1 次召唤机会'}
  if(c.todayUsed>=total)return{can:false,total:total,used:c.todayUsed,rate:summonRate(c.todayUsed),vol:vol,borrowed:borrowed,yVol:yVol,reason:'召唤次数已用完（'+total+'次'+(borrowed>0?'，含昨日补召':'')+'），明天再练更猛！'}
  // 新规则: 10% 起每次失败 +15%，第5次80%，第6次起100%
  var rate=summonRate(c.todayUsed)
  return{can:true,rate:rate,total:total,used:c.todayUsed,vol:vol,borrowed:borrowed,yVol:yVol}
}

/* Attempt summon */
function attemptSummon(){
  var info=canSummon()
  if(!info.can){toast(info.reason,'e');return}
  var c=getChallenge()
  var rate=isFinite(info.rate)?info.rate:10
  var roll=Math.random()*100
  if(roll<rate){
    // Success! Mark pending, show challenge preview (NOT started yet)
    c.pendingChallenge=true
    c.todayUsed=isFinite(info.used)?info.used+1:1
    saveChallenge(c)
    toast('🔮 召唤成功！点击开始挑战！','s')
    showChallengePreview()
  }else{
    // Failure — attempt used, rate climbs for next try
    c.todayUsed=isFinite(info.used)?info.used+1:1
    saveChallenge(c)
    var newRate=summonRate(c.todayUsed)
    var remain=isFinite(info.total)&&isFinite(info.used)?info.total-info.used-1:'?'
    toast('❌ 召唤失败！下次成功率 '+newRate+'%（剩 '+remain+' 次）','e')
    renderSummonPanel()
  }
}

/* ========== SUMMON PANEL UI ========== */
/* Debug: 屏幕诊断 — 悬浮 FAB 切换（不占版面，默认半透明可点） */
var _chDebugOn=false
function toggleChDebug(){_chDebugOn=!_chDebugOn;renderDebugFab();renderSummonPanel()}
function renderDebugFab(){
  var fab=document.getElementById('debugFab')
  if(!fab){
    fab=document.createElement('button');fab.id='debugFab';fab.className='debug-fab';fab.title='debug'
    fab.textContent='🔍'
    fab.addEventListener('click',toggleChDebug)
    document.body.appendChild(fab)
  }
  fab.classList.toggle('on',_chDebugOn)
}
/* 组装充足诊断数据 */
function chDebugBlock(info,strVol,c,branch){
  var out=''
  if(_chDebugOn){
    var entries=((store.get('strength')||{entries:[]}).entries)||[]
    var todayE=entries.filter(function(e){return e.date===today()})
    var exMap=getExerciseMap()
    var lines=['[branch: '+branch+']','today='+today()]
    lines.push('strVol='+strVol)
    lines.push('canSummon='+JSON.stringify(info))
    lines.push('total='+Math.floor(strVol/100)+' used='+(info&&isFinite(info.used)?info.used:'?')+' rate='+(info&&isFinite(info.rate)?info.rate:'?'))
    lines.push('todayEntries='+todayE.length)
    todayE.forEach(function(e,i){
      var ex=exMap[e.exercise]||{}
      var w=e.eqWeight!=null?e.eqWeight:(e.weight||0)
      var n=e.actualReps||(e.duration?e.duration:0)
      var r=(ex.ratio!=null?ex.ratio:100)
      var vol=Math.round(w*n*(r/100))
      lines.push('  ['+i+'] '+e.exercise+' w='+w+' eq='+(e.eqWeight!=null?e.eqWeight:'-')+' n='+n+' ratio='+r+' vol='+vol)
    })
    lines.push('challenge='+JSON.stringify(c))
    out+='<div style="margin-top:4px;padding:8px;background:#1a1a1a;border:1px dashed #ef4444;border-radius:8px;font-size:.6rem;color:#94a3b8;line-height:1.6;white-space:pre-wrap;word-break:break-all">'+lines.join('\n')+'</div>'
  }
  return out
}
/* 挂载调试块 + 绑定开关（每个分支统一调用） */
function mountSummonExtras(el,info,strVol,c,branch){
  renderDebugFab()
  var hb=document.getElementById('chHistoryBtn')
  if(hb)hb.addEventListener('click',function(){showChallengeHistory()})
}
function renderSummonPanel(){
  var el=document.getElementById('summonPanel')
  if(!el)return
  var info=canSummon()
  var strVol=getTodayVolume()
  var triggers=Math.floor(strVol/100)
  var c0=getChallenge()
  // pending 挑战不受当日容量限制（可能昨天召唤成功今天才打开）
  // 今日容量不足但可借用昨日未用资格（info.can=true）→ 落到下方正常召唤卡片
  if(strVol<100&&!info.can&&!c0.pendingChallenge){
    el.innerHTML=chDebugBlock(info,strVol,c0,'vol100')
    mountSummonExtras(el,info,strVol,c0,'vol100')
    return
  }
  
  var c=getChallenge()
  if(c.summonedDate===today()){
    // Already played today
    var bonus=c.seasonBonus||{atk:0,def:0,hp:0};
    var rewarded=c.lastRewardDate===today()
    el.innerHTML='<div class="summon-card done">'
      +'<div class="summon-title">⚡ 今日隐藏挑战已完成</div>'
      +'<div class="summon-info">明日继续，每月 1 号重置奖励</div>'
      +(bonus.atk+bonus.def+bonus.hp>0?'<div class="summon-bonus">本月已获得: ⚔️+'+bonus.atk+' 🛡️+'+bonus.def+' ❤️+'+bonus.hp+'</div>':'')
      +(!rewarded?'<button class="summon-btn" id="summonBtn" style="margin-top:8px;background:rgba(239,68,68,.1);border-color:var(--red);color:var(--red);padding:10px;font-size:.8rem">↩️ 今日未完成？恢复挑战</button>':'')
      +'<button class="summon-btn" id="chHistoryBtn" style="margin-top:8px;background:var(--bg3);color:var(--text2);border:1px solid var(--bd);padding:10px;font-size:.78rem">📜 历史召唤成绩</button>'
      +'</div>'
      +chDebugBlock(info,strVol,c,'done')
    mountSummonExtras(el,info,strVol,c,'done')
    var br=document.getElementById('summonBtn')
    if(br)br.addEventListener('click',function(){
      // 旧 bug 锁死恢复：今天被标记完成但从未结算奖励 → 解锁并回到召唤
      var c2=getChallenge()
      c2.summonedDate=''
      c2.pendingChallenge=false
      saveChallenge(c2)
      toast('已恢复今日挑战资格，重新召唤吧 🔮','s')
      renderSummonPanel()
    })
    return
  }
  // 已召唤成功但没开始（稍后再说/刷新后）→ 恢复预览
  if(c.pendingChallenge){
    el.innerHTML='<div class="summon-card">'
      +'<div class="summon-title">🔮 已召唤成功！</div>'
      +'<div class="summon-info">挑战尚未开始，随时可以继续</div>'
      +'<button class="summon-btn" id="summonBtn">⚔️ 开始挑战</button>'
      +'</div>'
      +chDebugBlock(info,strVol,c,'pending')
    mountSummonExtras(el,info,strVol,c,'pending')
    var b2=document.getElementById('summonBtn')
    if(b2)b2.addEventListener('click',function(){showChallengePreview()})
    return
  }
  // 不可召唤（次数用完/其他）→ 显示原因卡片而非可召唤面板
  if(!info.can){
    el.innerHTML='<div class="summon-card done">'
      +'<div class="summon-title">🔮 隐藏挑战</div>'
      +'<div class="summon-info">'+(info.reason||'今日不可召唤')+'</div>'
      +(isFinite(info.total)?'<div class="summon-info" style="font-size:.65rem;color:var(--text3)">今日容量 <b style="color:var(--orange)">'+Math.round(info.vol||0)+'kg</b> · 可用 '+Math.max(0,isFinite(info.used)?info.total-info.used:0)+'/'+info.total+' 次（已用 '+(isFinite(info.used)?info.used:0)+'）</div>':'')
      +'<button class="summon-btn" id="chHistoryBtn" style="margin-top:8px;background:var(--bg3);color:var(--text2);border:1px solid var(--bd);padding:10px;font-size:.78rem">📜 历史召唤成绩</button>'
      +'</div>'
      +chDebugBlock(info,strVol,c,'cannot')
    mountSummonExtras(el,info,strVol,c,'cannot')
    return
  }
  
  var rate=info.rate||10
  var rateColor=rate>=50?'var(--green)':rate>=30?'var(--orange)':'var(--yellow)'
  var totalN=isFinite(info.total)?info.total:'?'
  var usedN=isFinite(info.used)?info.used:0
  var remain=isFinite(info.total)&&isFinite(info.used)?info.total-info.used:'?'
  var hotHtml=renderHotBuffHint(c)
  el.innerHTML='<div class="summon-card">'
    +'<div class="summon-title">🔮 隐藏挑战</div>'
    +'<div class="summon-info">今日训练容量 <b>'+Math.round(strVol)+'kg</b> · 召唤机会 <b>'+remain+'/'+totalN+'</b> 次（每 100kg +1 次）</div>'
    +(info.borrowed>0?'<div class="summon-info" style="color:var(--green)">✨ 已并入昨日未用召唤资格 '+info.borrowed+' 次（昨日 '+Math.round(info.yVol||0)+'kg）</div>':'')
    +'<div class="summon-rate-wrap">'
    +  '<div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">本次召唤成功率（第 '+(usedN+1)+' 次'+(usedN>=5?' · 必成 100%':usedN===4?' · 保底 80%':' · 基础 10%')+'）</div>'
    +  '<div class="summon-rate-bar"><div class="summon-rate-fill" style="width:'+rate+'%;background:'+rateColor+'"></div></div>'
    +  '<div style="text-align:center;font-weight:700;color:'+rateColor+';font-size:1rem;margin-top:4px">'+rate+'%</div>'
    +'</div>'
    +hotHtml
    +'<button class="summon-btn" id="summonBtn">🔮 召唤</button>'
    +'<div style="font-size:.6rem;color:var(--text3);text-align:center;margin-top:6px">成功率阶梯 10/25/40/55/80/100% · 每天最多成功召唤1次</div>'
    +'</div>'
    +'<button class="summon-btn" id="chHistoryBtn" style="margin-top:8px;background:var(--bg3);color:var(--text2);border:1px solid var(--bd);padding:10px;font-size:.78rem">📜 历史召唤成绩</button>'
    +chDebugBlock(info,strVol,c,'normal')
  var btn=document.getElementById('summonBtn')
  if(btn)btn.addEventListener('click',attemptSummon)
  mountSummonExtras(el,info,strVol,c,'normal')
}

/* 热血 buff hint — 本周连续 3 天开启后，第 4 次开启附加热血 buff */
function renderHotBuffHint(c){
  var wk=getWeekKey()
  if(c.weekKey!==wk){c.weekKey=wk;c.weekDays=[];c.hotBuffUsed=false}
  var days=c.weekDays?c.weekDays.length:0
  if(c.hotBuffUsed)return''
  if(days>=5){
    return'<div class="summon-hot ready">🔥 热血 buff 已就绪！本次挑战随机获得：暴击率+55%·暴伤+35% / 暴伤+120%·暴击率+15% / 倒计时+40%·基础时间70~100%</div>'
  }
  if(days>=1){
    return'<div class="summon-hot">🔥 本周已挑战 '+days+' 次，累计 5 次解锁热血 buff！</div>'
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
  var modal=openModal(null,'challengeModal',{noBackdrop:true})
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
    +  '<div style="font-size:.68rem;color:var(--text3);text-align:center;margin:8px 0">基础伤害 = 攻×50% + 魂攻×150% + 防×100% + 魂防×100%，暴击 20%×1.5 倍</div>'
    +'</div>'
    +'<div class="modal-actions">'
    +  '<button class="m-btn-cancel" id="chLater">稍后再说</button>'
    +  '<button class="m-btn-save" id="chStart" style="flex:2">⚔️ 开始挑战</button>'
    +'</div>'
    +'</div>'
  modal.innerHTML=h
  document.getElementById('chLater').addEventListener('click',function(){modal.remove();renderSummonPanel();renderGame()})
  document.getElementById('chStart').addEventListener('click',function(){
    // 真正开始：保留 pending 资格（未结算前可重开），记录周天数，判定热血 buff
    var c=getChallenge()
    var wk=getWeekKey()
    if(c.weekKey!==wk){c.weekKey=wk;c.weekDays=[];c.hotBuffUsed=false}
    if(c.weekDays.indexOf(today())<0)c.weekDays.push(today())
    var hotBuff=null
    if(c.weekDays.length>=5&&!c.hotBuffUsed){
      hotBuff=pickHotBuff()
      c.hotBuffUsed=true
    }
    saveChallenge(c)
    modal.remove()
    startHiddenChallenge(hotBuff)
  })
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
  // 热血 buff 触发：全屏金色闪光（特殊惊艳标识）
  if(hotBuff){
    var flash=document.createElement('div')
    flash.style='position:fixed;inset:0;z-index:70;pointer-events:none;background:radial-gradient(circle,rgba(251,191,36,.35),transparent 70%);animation:hotFlash 1.2s ease-out forwards'
    document.body.appendChild(flash)
    setTimeout(function(){if(flash.parentNode)flash.remove()},1300)
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
    perSecHits:[],     // hits per second (for result chart)
    playerAtk:stats.atk,
    playerSoulAtk:stats.soulAtk||0,
    playerDef:stats.def,
    playerSoulDef:stats.soulDef||0
  }
  
  var modal=openModal(null,'challengeModal',{noBackdrop:true})
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
    // 记录当前秒点击数（用于结算曲线）
    var secIdx=state.duration-state.timeLeft
    if(secIdx>=0)state.perSecHits[secIdx]=(state.perSecHits[secIdx]||0)+1
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
    var bonusAtk=Math.floor(dmg/2250)
    var bonusDef=Math.floor(dmg/3375)
    var bonusHp=Math.floor(dmg/675)*3
    var c=getChallenge()
    c.seasonBonus.atk=(c.seasonBonus.atk||0)+bonusAtk
    c.seasonBonus.def=(c.seasonBonus.def||0)+bonusDef
    c.seasonBonus.hp=(c.seasonBonus.hp||0)+bonusHp
    // 结算成功：清除 pending 资格，标记今日已完成（中途退出/刷新则不会走到这里）
    c.pendingChallenge=false
    c.summonedDate=today()
    c.lastRewardDate=today()
    // 记录历史成绩（含 buff）
    c.history=c.history||[]
    c.history.push({
      date:today(),dmg:dmg,hits:state.hitCount,
      avgRate:state.duration>0?Math.round(state.hitCount/state.duration*10)/10:0,
      crits:state.critCount,maxHit:state.maxHit,
      atk:bonusAtk,def:bonusDef,hp:bonusHp,
      buff:state.hotBuff||null
    })
    if(c.history.length>50)c.history=c.history.slice(-50)
    saveChallenge(c)

    // 隐藏挑战材料掉落（基础掉落 + 每周次数额外奖励）
    try {
      if (typeof grantMaterial === 'function' && typeof getPetStore === 'function') {
        var matDrops = []      // 材料掉落
        var skillPoints = 0    // 技能点（额外奖励）
        var petEgg = null      // 宠物蛋（5次+奖励）

        // 基础掉落（任何伤害）：
        matDrops.push({ type: 'nutrition', n: 5 + Math.floor(Math.random() * 6) })        // 5-10
        matDrops.push({ type: 'feed', n: 3 + Math.floor(Math.random() * 5) })             // 3-7
        matDrops.push({ type: 'refineNormal', n: 2 + Math.floor(Math.random() * 3) })     // 2-4
        matDrops.push({ type: 'refineHigh', n: Math.floor(Math.random() * 3) })           // 0-2
        matDrops.push({ type: 'spirit', n: 1 + Math.floor(Math.random() * 4) })           // 1-4
        matDrops.push({ type: 'orbShard', n: 4 + Math.floor(Math.random() * 5) })         // 4-8
        skillPoints += 20   // 基础掉落：技能点 20/次

        // 每周挑战次数额外奖励
        var d = getPetStore()
        d.challengeWeek = d.challengeWeek || {}
        var wkKey = 'W' + Math.ceil(new Date().getDate() / 7)
        d.challengeWeek[wkKey] = (d.challengeWeek[wkKey] || 0) + 1
        var weekCount = d.challengeWeek[wkKey]

        if (weekCount >= 2 && weekCount <= 3) {
          // 2-3 次：营养液 3-5(100%)，技能点 6-10(100%)，普通炼化石 2-3(100%)，高级炼化石 1-2(40%)
          matDrops.push({ type: 'nutrition', n: 3 + Math.floor(Math.random() * 3) })
          skillPoints += 6 + Math.floor(Math.random() * 5)
          matDrops.push({ type: 'refineNormal', n: 2 + Math.floor(Math.random() * 2) })
          if (Math.random() < 0.4) matDrops.push({ type: 'refineHigh', n: 1 + Math.floor(Math.random() * 2) })
        } else if (weekCount === 4) {
          // 4 次：营养液 4-8，技能点 8-12，普通炼化石 3-4，高级炼化石 1-2，饲料 2-4（全 100%）
          matDrops.push({ type: 'nutrition', n: 4 + Math.floor(Math.random() * 5) })
          skillPoints += 8 + Math.floor(Math.random() * 5)
          matDrops.push({ type: 'refineNormal', n: 3 + Math.floor(Math.random() * 2) })
          matDrops.push({ type: 'refineHigh', n: 1 + Math.floor(Math.random() * 2) })
          matDrops.push({ type: 'feed', n: 2 + Math.floor(Math.random() * 3) })
        } else if (weekCount >= 5) {
          // 5 次+：营养液 6-10，技能点 50-75，普通炼化石 4-5，高级炼化石 2-3，灵能 5-10，随机宠物蛋
          matDrops.push({ type: 'nutrition', n: 6 + Math.floor(Math.random() * 5) })
          skillPoints += 50 + Math.floor(Math.random() * 26)   // 50-75
          matDrops.push({ type: 'refineNormal', n: 4 + Math.floor(Math.random() * 2) })
          matDrops.push({ type: 'refineHigh', n: 2 + Math.floor(Math.random() * 2) })
          matDrops.push({ type: 'spirit', n: 5 + Math.floor(Math.random() * 6) })
          // 随机宠物蛋（未拥有的）
          try {
            var owned = d.pets.map(function (p) { return p.speciesId })
            var codex = listPetCodex().filter(function (id) { return owned.indexOf(id) === -1 })
            if (codex.length) {
              var sid = codex[Math.floor(Math.random() * codex.length)]
              var pet = createPet({ speciesId: sid, rarity: getPetCodex(sid).rarity, name: getPetCodex(sid).name })
              d.pets.push(pet)
              petEgg = { name: pet.name }
            }
          } catch (e2) {}
        }
        savePetStore(d)

        // 发放材料
        matDrops.forEach(function (dd) { grantMaterial(dd.type, dd.n) })
        // 发放技能点
        if (skillPoints > 0 && typeof getSkillState === 'function') {
          var ss = getSkillState()
          ss.points += skillPoints
          ss.totalEarned += skillPoints
          saveSkillState(ss)
        }
        // 供结果面板显示
        state.matReward = matDrops
        state.skillPointReward = skillPoints
        state.petEggReward = petEgg
      }
    } catch (e) { /* 材料系统未启用时忽略 */ }
    
    // Show result (enhanced: reward detail + per-second tap chart)
    var avgRate=state.duration>0?(state.hitCount/state.duration).toFixed(1):'0'
    var h2='<div class="ch-result">'
      +'<div class="ch-result-title">🏆 挑战结束</div>'
      +'<div class="ch-result-stats">'
      +  '<div>⚔️ 总伤害: <b>'+dmg+'</b></div>'
      +  '<div>🎯 命中: <b>'+state.hitCount+'</b> 次 · 平均 <b>'+avgRate+'</b> 次/秒</div>'
      +  '<div>💥 暴击: <b>'+state.critCount+'</b> 次</div>'
      +  '<div>🥇 最强一击: <b>'+state.maxHit+'</b></div>'
      +'</div>'
      +'<div class="ch-reward">'
      +  '<div style="font-weight:700;margin-bottom:6px">🎁 本月属性奖励（月度重置）</div>'
      +  '<div class="ch-reward-info">'      +(bonusAtk>0?'  <span style="color:var(--orange)">⚔️ +'+bonusAtk+'</span>':'')
      +(bonusDef>0?'  <span style="color:var(--blue)">🛡️ +'+bonusDef+'</span>':'')
      +(bonusHp>0?'  <span style="color:var(--green)">❤️ +'+bonusHp+'</span>':'')
      +(bonusAtk+bonusDef+bonusHp===0?'  <span style="color:var(--text3)">伤害不足，未获得奖励</span>':'')
      +  '</div>'
      +'</div>'
      +'<div class="ch-reward">'
      +  '<div style="font-weight:700;margin-bottom:6px">📦 材料掉落</div>'
      +  '<div class="ch-reward-info">'
      +((state.matReward && state.matReward.length) ? state.matReward.map(function(d){
          var names={nutrition:'🧪 营养液',feed:'🍖 饲料',spirit:'✨ 灵能',refineNormal:'🪨 炼化石',refineHigh:'💎 高炼石',orbShard:'🔮 宝珠碎片'};
          return '<span style="margin-right:8px">'+(names[d.type]||d.type)+' <b style="color:var(--green)">+'+d.n+'</b></span>';
        }).join('') : '<span style="color:var(--text3)">—</span>')
      +(state.skillPointReward > 0 ? '<div style="margin-top:4px">💠 技能点 <b style="color:var(--blue)">+'+state.skillPointReward+'</b>（本周 '+weekCount+' 次额外奖励）</div>' : '')
      +(state.petEggReward ? '<div style="margin-top:4px">🥚 宠物蛋 <b style="color:var(--orange)">'+state.petEggReward.name+'</b></div>' : '')
      +  '</div>'
      +'</div>'
      +'<div class="ch-sec-chart" id="chSecChart"></div>'
      +'<div class="ch-cumulative" id="chCumulative"></div>'
      +'<div class="modal-actions"><button class="m-btn-cancel" id="chClose">关闭</button></div>'
      +'</div>'
    var sheet=modal.querySelector('.modal-sheet')
    if(sheet){
      sheet.innerHTML=h2
      // 每秒点击次数柱状图
      var chartEl=document.getElementById('chSecChart')
      if(chartEl)renderPerSecChart(chartEl,state.perSecHits,state.duration)
      var cumEl=document.getElementById('chCumulative')
      if(cumEl){
        var cum=c.seasonBonus
        cumEl.innerHTML='<div style="font-size:.68rem;color:var(--text3);margin-top:8px">本月累计: ⚔️+'+cum.atk+' 🛡️+'+cum.def+' ❤️+'+cum.hp+'</div>'
      }
      var closeBtn=document.getElementById('chClose')
      if(closeBtn)closeBtn.addEventListener('click',function(){modal.remove();renderSummonPanel();renderGame()})
      // 结算后可点背景关闭（游戏中 noBackdrop）
      modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
    }
  }

  /* 每秒点击次数柱状图（纯 div，移动端友好） */
  function renderPerSecChart(container,perSec,duration){
    var n=perSec&&perSec.length?perSec.length:duration
    var maxHits=1
    for(var i=0;i<n;i++){if((perSec[i]||0)>maxHits)maxHits=perSec[i]}
    var h='<div style="font-size:.68rem;color:var(--text3);margin:8px 0 4px">⏱️ 每秒点击次数</div><div style="display:flex;align-items:flex-end;gap:3px;height:64px;padding:0 2px">'
    for(var i=0;i<n;i++){
      var v=perSec[i]||0
      var bh=Math.max(2,Math.round(v/maxHits*56))
      var c=v>=maxHits&&maxHits>1?'var(--orange)':'var(--blue)'
      h+='<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px" title="第'+(i+1)+'秒: '+v+'次"><div style="height:'+bh+'px;background:'+c+';border-radius:3px 3px 0 0;width:100%;min-width:4px"></div><span style="font-size:.55rem;color:var(--text3)">'+(i+1)+'</span></div>'
    }
    h+='</div>'
    container.innerHTML=h
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

/* ========== CHALLENGE HISTORY ========== */
function showChallengeHistory(){
  var c=getChallenge()
  var h=c.history||[]
  var modal=openModal(null,'chHistoryModal')
  var html='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📜 历史召唤成绩</div>'
  if(!h.length){
    html+='<div class="empty"><span class="empty-e">📜</span><div class="empty-t">暂无挑战记录</div><div class="empty-s">完成隐藏挑战后自动记录</div></div>'
  }else{
    var rows=h.slice().reverse().map(function(r,i){
      var buffLabel=r.buff?hotBuffLabel(r.buff):'无 buff'
      return'<div class="ec" style="margin-bottom:6px"><div class="ec-hdr"><div class="ec-ex">'+r.date+'</div><div class="ec-actions"><span style="font-size:.65rem;color:var(--text3)">#'+(h.length-i)+'</span></div></div>'
        +'<div style="font-size:.7rem;color:var(--text2);line-height:1.7;padding:2px 0">'
        +'⚔️ '+r.dmg+' 伤害 · 🎯 '+r.hits+' 次 ('+r.avgRate+'/秒) · 💥 '+r.crits+' 暴击<br>'
        +'🥇 最强 '+r.maxHit+' · 🎁 ⚔️+'+r.atk+' 🛡️+'+r.def+' ❤️+'+r.hp
        +(r.buff?'<br><span style="color:#fbbf24">'+buffLabel+'</span>':'')
        +'</div></div>'
    }).join('')
    html+='<div style="max-height:55vh;overflow-y:auto">'+rows+'</div>'
  }
  html+='<div class="modal-actions"><button class="m-btn-cancel" id="chHistClose">关闭</button></div></div>'
  modal.innerHTML=html
  document.getElementById('chHistClose').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

/* ========== INTEGRATION ========== */
// Called from checkMonthlyReset to clear season bonus
function resetChallengeSeason(){
  var c=getChallenge()
  c.seasonBonus={atk:0,def:0,hp:0}
  c.lastSeasonMonth=today().slice(0,7)
  saveChallenge(c)
  toast('🔬 隐藏挑战奖励已重置','s')
}

// Called from getGameStats to add challenge bonus to attributes
function getChallengeBonus(){
  var c=getChallenge()
  return c.seasonBonus||{atk:0,def:0,hp:0}
}
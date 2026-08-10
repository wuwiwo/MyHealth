/* ============================================
   MyHealth — Tab: Game (Challenge, Battle, Share)
   ============================================ */

function renderGame(){
  const stats=getGameStats()
  const mNames=['','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  const n=new Date();const monthLabel=mNames[n.getMonth()+1]||''
  var monthStart=toDate(new Date(n.getFullYear(),n.getMonth(),1))
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=monthStart})
  var carE=((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=monthStart})
  var strVol=sumVolume(strE,getExerciseMap())
  var carDur=sumDuration(carE)
  var carEff=sumEffectiveDuration(carE,getCardioTypeMap())
  var baseAtk=10+Math.floor(strVol/20),baseDef=10+Math.floor(carEff/15)
  var baseHp=100+Math.floor(strVol/10)+Math.floor(carDur/3)
  var atkInfo='基础攻击 = 10 + floor('+strVol+'/20) = '+baseAtk+(stats.permBonusAtk>0?' + 累积奖励 +'+stats.permBonusAtk:'')+(stats.permPenAtk>0?' - 永久惩罚 -'+stats.permPenAtk:'')+' = '+stats.atk
  var defInfo='基础防御 = 10 + floor('+carEff+'/15) = '+baseDef+(stats.permBonusDef>0?' + 累积奖励 +'+stats.permBonusDef:'')+(stats.permPenDef>0?' - 永久惩罚 -'+stats.permPenDef:'')+' = '+stats.def
  var totalBonus=(stats.permBonusAtk+stats.permBonusDef)
  var hpInfo='基础生命 = 100 + floor('+strVol+'/10) + floor('+carDur+'/3) = '+baseHp+(totalBonus>0?' + 奖励×3 +'+totalBonus*3:'')+' = '+stats.hp

  var wkStatus='',wkColor='orange'
  var p=stats.period
  if(!stats.periodEnabled){
    wkStatus='🗓️ 7月启用旬奖励';wkColor='text3'
  }else if(stats.periodDays>=6&&stats.volMet){wkStatus='🎉 旬双达标！';wkColor='green'}
  else if(stats.periodDays>=6){wkStatus='✅ 天数达标，冲容量';wkColor='green'}
  else if(stats.volMet){wkStatus='📊 容量达标，冲天数';wkColor='green'}
  else if(stats.periodDays>=4){wkStatus='💪 还差'+(6-stats.periodDays)+'天达标';wkColor='yellow'}
  else if(stats.periodDays>=1){wkStatus='🔥 旬内仅'+stats.periodDays+'天';wkColor='orange'}
  else {wkStatus='😴 本旬还没动';wkColor='red'}

  var periodItemHtml;
  if(!stats.periodEnabled){
    periodItemHtml='<div class="gs-item" style="min-width:100px"><div class="gs-v" style="color:var(--text3);font-size:.72rem">7月启用</div><div class="gs-l" style="font-size:.6rem">旬奖励待启用</div></div>';
  }else{
    periodItemHtml='<div class="gs-item" style="min-width:100px"><div class="gs-v '+wkColor+'">'+stats.periodDays+'<span style="font-size:.6rem">/6天</span>'+(stats.permBonusAtk>0?' <span style="font-size:.6rem;color:var(--green)">+'+stats.permBonusAtk+'</span>':'')+(stats.permPenAtk>0?' <span style="font-size:.6rem;color:var(--red)">-'+stats.permPenAtk+'</span>':'')+'</div><div class="gs-l" style="font-size:.6rem">'+p.name+' · '+wkStatus+'</div></div>';
  }
  document.getElementById('gameStatsBar').innerHTML=
    '<div class="gs-item"><div class="gs-v orange">'+stats.atk+'</div><div class="gs-l">⚔️ 攻击</div></div>'+
    '<div class="gs-item"><div class="gs-v blue">'+stats.def+'</div><div class="gs-l">🛡️ 防御</div></div>'+
    '<div class="gs-item"><div class="gs-v green">'+stats.hp+'</div><div class="gs-l">❤️ 生命</div></div>'+
    '<div class="gs-item"><div class="gs-v" style="color:var(--purple)">'+stats.soulAtk+'</div><div class="gs-l">👻 魂攻</div></div>'+
    '<div class="gs-item"><div class="gs-v" style="color:var(--purple)">'+stats.soulDef+'</div><div class="gs-l">🔮 魂防</div></div>'+
    '<div class="gs-item"><div class="gs-v">'+getGame().cleared.length+'</div><div class="gs-l">🏆 通关</div></div>'+
    periodItemHtml+
    '<div class="gs-item" style="min-width:80px"><div class="gs-v blue">'+stats.monthDays+'<span style="font-size:.6rem">天</span></div><div class="gs-l">'+monthLabel+'</div></div>'+
    (stats.refineUnlocked?'<div class="gs-item" style="flex:0;min-width:auto"><button class="header-btn" id="refineBtn" title="炼魂系统" style="font-size:.75rem">🔮</button></div>':'')
  _attrCalcInfo={atk:atkInfo,def:defInfo,hp:hpInfo,vol:strVol,dur:carDur,permPenAtk:stats.permPenAtk,permPenDef:stats.permPenDef,permBonusAtk:stats.permBonusAtk,permBonusDef:stats.permBonusDef,lastPeriodDays:stats.lastPeriodDays,thisPeriodDays:stats.periodDays,period:p,soulAtk:stats.soulAtk,soulDef:stats.soulDef,refineUnlocked:stats.refineUnlocked,refinePoints:stats.refinePoints,refineBonus:stats.refineBonus}
  trackStats(stats,{strVol:strVol,carDur:carDur,carEff:carEff})
  renderRecords()

  var warnKey='warn_'+p.start+'_miss'
  var warnDismissed=localStorage.getItem(warnKey)
  if(stats.periodEnabled&&stats.lastPeriodDays<6&&stats.lastPeriodDays>=0&&!warnDismissed){
    var gameContent=document.getElementById('gameContent')
    if(gameContent&&!document.getElementById('penaltyBanner')){
      var banner=document.createElement('div');banner.id='penaltyBanner'
      banner.style='background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--r);padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:.8rem'
      var pen=calculatePeriodPenalty(stats.lastPeriodDays)
      banner.innerHTML='<span style="font-size:1.2rem">⚠️</span><span style="flex:1;color:var(--red)">上'+stats.lastPeriodName+'只练了 '+stats.lastPeriodDays+' 天，永久扣除攻击 -'+pen.atkPen+'，防御 -'+pen.defPen+'。本旬练满 6 天可避免下旬惩罚。</span><button class="speed-btn" id="dismissPenalty" style="border-color:var(--red);color:var(--red);padding:4px 12px">知道了</button>'
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

function getMonthDays(){
  var n=new Date();var ms=toDate(new Date(n.getFullYear(),n.getMonth(),1))
  return countActiveDays((store.get('strength')||{entries:[]}).entries,(store.get('cardio')||{entries:[]}).entries,ms)
}

/* ========== 旬周期 (10-day period) — 2026-07-01 生效 ========== */
var PERIOD_RULE_START='2026-07-01';

function getPeriodDays(period){
  return countActiveDaysInRange(
    (store.get('strength')||{entries:[]}).entries,
    (store.get('cardio')||{entries:[]}).entries,
    period.start, period.end
  );
}
function getPeriodVolume(period){
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=period.start&&e.date<=period.end});
  return sumVolume(strE,getExerciseMap());
}

function getGameStats(){
  // Base attributes use current month's training data (resets naturally on 1st)
  var now=new Date();
  var monthStart=toDate(new Date(now.getFullYear(),now.getMonth(),1));
  var strE=((store.get('strength')||{entries:[]}).entries||[]).filter(function(e){return e.date>=monthStart})
  var carE=((store.get('cardio')||{entries:[]}).entries||[]).filter(function(e){return e.date>=monthStart})
  var strVol=sumVolume(strE,getExerciseMap())
  var carDur=sumDuration(carE)
  var carEff=sumEffectiveDuration(carE,getCardioTypeMap())
  var periodEnabled=today()>=PERIOD_RULE_START;
  // Current period (旬) stats — for display only
  var curPeriod=getCurrentPeriod(now);
  var periodDays=getPeriodDays(curPeriod);
  var periodVol=getPeriodVolume(curPeriod);
  var bonus=calculatePeriodBonus(periodDays,periodVol,curPeriod.volThreshold);
  // Previous period — settle bonus and penalty into permanent stats
  var prevPeriod=getPreviousPeriod(now);
  var lastPeriodDays=periodEnabled?getPeriodDays(prevPeriod):-1;
  var prevVol=periodEnabled?getPeriodVolume(prevPeriod):0;
  var prevBonus=calculatePeriodBonus(lastPeriodDays,prevVol,prevPeriod.volThreshold);
  var pen=calculatePeriodPenalty(lastPeriodDays);
  // Init permanent bonus and penalty — persist once so later getGame() calls
  // see the same object (getGame() returns a fresh default when no data yet)
  var g=getGame();
  var dirty=false;
  if(!g.permPen){g.permPen={atk:0,def:0};dirty=true}
  if(!g.permBonus){g.permBonus={atk:0,def:0};dirty=true}
  if(dirty)setGame(g);
  // Apply permanent bonus once per period transition (only after rule start)
  var bonusKey='bonus_'+prevPeriod.start;
  if(periodEnabled&&prevBonus.atkBonus>0&&!g[bonusKey]){
    g.permBonus.atk+=prevBonus.atkBonus;g.permBonus.def+=prevBonus.defBonus;
    g[bonusKey]=true;setGame(g);
  }
  // Apply permanent penalty once per period transition
  var penKey='pen_'+prevPeriod.start;
  if(periodEnabled&&pen.missDays>0&&!g[penKey]){
    g.permPen.atk+=pen.atkPen;g.permPen.def+=pen.defPen;
    g[penKey]=true;setGame(g);
  }
  var permBonusAtk=g.permBonus.atk||0;
  var permBonusDef=g.permBonus.def||0;
  // Soul refinement — check unlock and calculate points
  var refine=getRefine();
  var cleared96=g.cleared.includes('9-6');
  if(cleared96&&!refine.unlocked){
    refine.unlocked=true;saveRefine(refine);
  }
  // Update refine points from monthly volume
  if(refine.unlocked){
    var earnedPoints=calculateRefinePoints(strVol);
    if(earnedPoints>(refine.totalEarned||0)){
      var diff=earnedPoints-(refine.totalEarned||0);
      refine.points=(refine.points||0)+diff;
      refine.totalEarned=earnedPoints;
      saveRefine(refine);
    }
  }
  var refineBonus=calculateRefineBonus(refine.upgrades);
  var calc=calculateStats(strVol,carDur,carEff,permBonusAtk,permBonusDef,g.permPen.atk||0,g.permPen.def||0,refineBonus)
  return{
    atk:calc.atk,def:calc.def,hp:calc.hp,soulAtk:calc.soulAtk,soulDef:calc.soulDef,
    period:curPeriod,periodDays:periodDays,periodVol:periodVol,volMet:bonus.volMet,
    periodEnabled:periodEnabled,
    permBonusAtk:permBonusAtk,permBonusDef:permBonusDef,
    lastPeriodDays:lastPeriodDays,lastPeriodName:prevPeriod.name,
    permPenAtk:g.permPen.atk||0,permPenDef:g.permPen.def||0,
    monthDays:getMonthDays(),
    refineUnlocked:refine.unlocked,refinePoints:refine.points||0,refineTotalEarned:refine.totalEarned||0,
    refineBonus:refineBonus
  }
}

function showLevelPreview(id){
  var lv=findLevel(id);if(!lv)return
  var stats=getGameStats()
  var cleared=getGame().cleared.includes(id)

  // Simulate 50 battles for accurate win rate
  var wins=0
  for(var s=0;s<50;s++){
    var batt=createBattle({atk:stats.atk,def:stats.def,hp:stats.hp,soulAtk:stats.soulAtk,soulDef:stats.soulDef},{atk:lv.atk,def:lv.def,hp:lv.hp,soulAtk:lv.soulAtk||0,soulDef:lv.soulDef||0},{npc:lv.npc,boss:lv.boss},lv.boss?pickBossAffix():null)
    for(var t=0;t<100&&!batt.done;t++){battleTick(batt)}
    if(batt.winner)wins++
  }
  var rate=Math.min(98,Math.max(2,Math.round(wins/50*100)))
  var rateColor=rate>=70?'var(--green)':rate>=40?'var(--yellow)':'var(--red)'

  var modal=openModal()
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">'+lv.id+' '+lv.npc+(lv.boss?' 👑':'')+(cleared?' ✅':':')+'</div>'
    +'<div class="stats-grid" style="margin-bottom:12px">'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--orange)">⚔️ '+lv.atk+'</div><div class="sc-l">攻击</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--blue)">🛡️ '+lv.def+'</div><div class="sc-l">防御</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:var(--green)">❤️ '+lv.hp+'</div><div class="sc-l">生命</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:1rem;color:'+rateColor+'">'+rate+'%</div><div class="sc-l">胜率(50次模拟)</div></div>'
    +'</div>'
  if((lv.soulAtk||0)>0||(lv.soulDef||0)>0){
    h+='<div class="stats-grid" style="margin-bottom:12px">'
      +'<div class="sc"><div class="sc-v" style="font-size:.9rem;color:var(--purple)">👻 '+(lv.soulAtk||0)+'</div><div class="sc-l">魂攻击</div></div>'
      +'<div class="sc"><div class="sc-v" style="font-size:.9rem;color:var(--purple)">🔮 '+(lv.soulDef||0)+'</div><div class="sc-l">魂防御</div></div>'
      +'</div>'
  }

  // Boss affix info
  if(lv.boss){
    var affixes=BOSS_AFFIXES.map(function(a){return a.name+': '+a.desc})
    h+='<div style="background:rgba(249,115,22,.08);border:1px solid var(--orange-g);border-radius:var(--rs);padding:10px 14px;margin-bottom:12px;font-size:.72rem;color:var(--text2)">'
      +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">👑 Boss 词缀 (随机1种)</div>'
      +affixes.map(function(a){return'<div style="padding:2px 0">• '+a+'</div>'}).join('')
      +'</div>'
  }

  // Player stats comparison
  var soulStr=(stats.soulAtk>0||stats.soulDef>0)?' 👻'+stats.soulAtk+' 🔮'+stats.soulDef:'';
  h+='<div style="font-size:.72rem;color:var(--text3);text-align:center;margin-bottom:4px">你的属性: ⚔️'+stats.atk+' 🛡️'+stats.def+' ❤️'+stats.hp+soulStr+'</div>'

  h+='<div class="modal-actions">'
    +'<button class="m-btn-cancel" id="lvCancel">关闭</button>'
  if(!cleared){
    h+='<button class="m-btn-save" style="background:linear-gradient(135deg,var(--red),#dc2626)" id="lvChallenge">⚔️ 挑战</button>'
  }
  h+='</div></div>'
  modal.innerHTML=h;void modal

  document.getElementById('lvCancel').addEventListener('click',function(){modal.remove()})
  if(!cleared){
    document.getElementById('lvChallenge').addEventListener('click',function(){
      modal.remove();getGame().current=id;setGame(getGame());startBattle(id)
    })
  }
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}
var _attrCalcInfo={}

function updateGameBar(){
  var bar=document.getElementById('gameStatsBar');if(!bar||!bar.isConnected)return
  if(!document.getElementById('tabGame')?.classList.contains('active'))return
  renderGame()
}

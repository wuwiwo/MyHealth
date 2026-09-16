/* ============================================
   MyHealth — Tab: Game (Challenge, Battle, Share)
   ============================================ */

/* ========== PERIOD GOAL CARD (旬目标进度条 + 结算预告) ========== */
function renderPeriodCard(stats,strVol,carDur,carEff){
  var card=document.getElementById('periodCard')
  if(!card)return
  if(!stats.periodEnabled){
    card.innerHTML=''
    return
  }
  var p=stats.period
  var dayPct=Math.min(100,Math.round(stats.periodDays/6*100))
  var volPct=Math.min(100,Math.round(stats.periodVol/p.volThreshold*100))
  var dayColor=stats.periodDays>=6?'var(--green)':stats.periodDays>=4?'var(--orange)':'var(--text3)'
  var volColor=volPct>=100?'var(--green)':volPct>=60?'var(--orange)':'var(--text3)'
  var daysLeft=Math.max(0,6-stats.periodDays)
  var volLeft=Math.max(0,Math.round(p.volThreshold-stats.periodVol))

  // Settlement preview (if period ended today)
  var curBonus=calculatePeriodBonus(stats.periodDays,stats.periodVol,p.volThreshold)
  var prevPen=calculatePeriodPenalty(6-stats.periodDays)
  var settle=''
  var parts=[]
  if(curBonus.daysMet)parts.push('天数达标 <b style="color:var(--green)">+30攻 +6防</b>')
  if(curBonus.volMet)parts.push('容量达标 <b style="color:var(--green)">+60攻 +12防</b>')
  if(!curBonus.daysMet)parts.push('天数还差'+daysLeft+'天 <b style="color:var(--red)">-'+prevPen.atkPen+'攻 -'+prevPen.defPen+'防</b>')
  if(!curBonus.volMet&&volLeft>0)parts.push('容量还差'+volLeft+'kg')
  if(parts.length)settle=parts.join(' · ')

  var dateRange=p.start.slice(5).replace('-','/')+' ~ '+p.end.slice(5).replace('-','/')+' ('+p.days+'天)'
  card.innerHTML='<div class="period-card">'
    +'<div class="period-hdr"><span>🗓️ 本旬目标 · '+p.name+' <span style="font-size:var(--fs-3xs);color:var(--text3)">'+dateRange+'</span></span><span class="period-stamp">结算预告</span></div>'
    +'<div class="period-row"><span class="period-lbl">训练天数</span><div class="snap-bar"><div class="snap-fill" style="width:'+dayPct+'%;background:'+dayColor+'"></div></div><span class="period-val" style="color:'+dayColor+'">'+stats.periodDays+'/6天</span></div>'
    +'<div class="period-row"><span class="period-lbl">训练容量</span><div class="snap-bar"><div class="snap-fill" style="width:'+volPct+'%;background:'+volColor+'"></div></div><span class="period-val" style="color:'+volColor+'">'+Math.round(stats.periodVol)+'/'+p.volThreshold+'kg</span></div>'
    +'<div class="period-settle">⚖️ '+settle+'</div>'
    +'</div>'
}

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
    periodItemHtml='<div class="gs-item" style="min-width:100px"><div class="gs-v" style="color:var(--text3);font-size:var(--fs-xs)">7月启用</div><div class="gs-l" style="font-size:var(--fs-3xs)">旬奖励待启用</div></div>';
  }else{
    periodItemHtml='<div class="gs-item" style="min-width:100px"><div class="gs-v '+wkColor+'">'+stats.periodDays+'<span style="font-size:var(--fs-3xs)">/6天</span>'+(stats.permBonusAtk>0?' <span style="font-size:var(--fs-3xs);color:var(--green)">+'+stats.permBonusAtk+'</span>':'')+(stats.permPenAtk>0?' <span style="font-size:var(--fs-3xs);color:var(--red)">-'+stats.permPenAtk+'</span>':'')+'</div><div class="gs-l" style="font-size:var(--fs-3xs)">'+p.name+' · '+wkStatus+'</div></div>';
  }
  // v2.0 三视图接管后旧属性条容器已移除（培养视图角色卡替代）；保留渲染逻辑以防回滚
  var _gsBar=document.getElementById('gameStatsBar')
  if(_gsBar)_gsBar.innerHTML=
    '<div class="gs-item"><div class="gs-v orange">'+stats.atk+'</div><div class="gs-l">⚔️ 攻击</div></div>'+
    '<div class="gs-item"><div class="gs-v blue">'+stats.def+'</div><div class="gs-l">🛡️ 防御</div></div>'+
    '<div class="gs-item"><div class="gs-v green">'+stats.hp+'</div><div class="gs-l">❤️ 生命</div></div>'+
    '<div class="gs-item"><div class="gs-v" style="color:var(--purple)">'+stats.soulAtk+'</div><div class="gs-l">👻 魂攻</div></div>'+
    '<div class="gs-item"><div class="gs-v" style="color:var(--purple)">'+stats.soulDef+'</div><div class="gs-l">🔮 魂防</div></div>'+
    '<div class="gs-item"><div class="gs-v">'+getGame().cleared.length+'</div><div class="gs-l">🏆 通关</div></div>'+
    periodItemHtml+
    '<div class="gs-item" style="min-width:80px"><div class="gs-v blue">'+stats.monthDays+'<span style="font-size:var(--fs-3xs)">天</span></div><div class="gs-l">'+monthLabel+'</div></div>'+
    (stats.refineUnlocked?'<div class="gs-item" style="flex:0;min-width:auto"><button class="header-btn" id="refineBtn" title="炼魂系统" style="font-size:var(--fs-xs)">🔮</button></div>':'')
  renderPeriodCard(stats,strVol,carDur,carEff)
  _attrCalcInfo={atk:atkInfo,def:defInfo,hp:hpInfo,vol:strVol,dur:carDur,carEff:carEff,permPenAtk:stats.permPenAtk,permPenDef:stats.permPenDef,permBonusAtk:stats.permBonusAtk,permBonusDef:stats.permBonusDef,lastPeriodDays:stats.lastPeriodDays,thisPeriodDays:stats.periodDays,period:p,soulAtk:stats.soulAtk,soulDef:stats.soulDef,refineUnlocked:stats.refineUnlocked,refinePoints:stats.refinePoints,refineBonus:stats.refineBonus}
  trackStats(stats,{strVol:strVol,carDur:carDur,carEff:carEff})
  renderRecords()

  var warnKey='warn_'+p.start+'_miss'
  var warnDismissed=localStorage.getItem(warnKey)
  if(stats.periodEnabled&&stats.lastPeriodDays<6&&stats.lastPeriodDays>=0&&!warnDismissed){
    var gameContent=document.getElementById('gameContent')
    if(gameContent&&!document.getElementById('penaltyBanner')){
      var banner=document.createElement('div');banner.id='penaltyBanner'
      banner.style='background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--r);padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:var(--fs-sm)'
      var pen=calculatePeriodPenalty(stats.lastPeriodDays)
      banner.innerHTML='<span style="font-size:var(--fs-xl)">⚠️</span><span style="flex:1;color:var(--red)">上'+stats.lastPeriodName+'只练了 '+stats.lastPeriodDays+' 天，永久扣除攻击 -'+pen.atkPen+'，防御 -'+pen.defPen+'。本旬练满 6 天可避免下旬惩罚。</span><button class="speed-btn" id="dismissPenalty" style="border-color:var(--red);color:var(--red);padding:4px 12px">知道了</button>'
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

  var gc=document.getElementById('gameContent')
  // First-time game guide (dismissible, remembered) — dedupe across re-renders
  var oldGuide=document.getElementById('gameGuide')
  if(oldGuide)oldGuide.remove()
  if(!localStorage.getItem('dh-game-guide-done')){
    var guide=document.createElement('div');guide.id='gameGuide'
    guide.style='background:var(--bg2);border:1px solid var(--orange-g);border-radius:var(--r);padding:12px 14px;margin-bottom:12px;font-size:var(--fs-xs);line-height:1.7'
    guide.innerHTML='<div style="font-weight:700;color:var(--orange);margin-bottom:6px">🎮 游戏规则</div>'
      +'<div>💪 力量训练 → <b>攻击/生命</b> ｜ 🏃 有氧训练 → <b>防御/生命</b></div>'
      +'<div>🗓️ 每旬（10天）练满 6 天且容量达标 → 永久属性奖励</div>'
      +'<div>⚠️ 上旬未达标 → 永久扣除属性（下旬生效）</div>'
      +'<div>⚔️ 挑战关卡击败 Boss 可推进章节，每日失败限 3 次</div>'
      +'<div>👑 16 章起 BOSS 同时携带 2 条词条，机制叠加</div>'
      +'<div style="margin-top:8px;text-align:right"><button class="speed-btn" id="guideOk" style="padding:4px 14px;border-color:var(--orange);color:var(--orange)">开始挑战</button></div>'
    gc.parentNode.insertBefore(guide,gc)
    setTimeout(function(){
      var btn=document.getElementById('guideOk')
      if(btn)btn.addEventListener('click',function(){localStorage.setItem('dh-game-guide-done','1');guide.remove()})
    },100)
  }
  let h=''
  // 关卡列表视图：返回按钮（从战斗视图进入时）
  if (gc._levelViewOpen) {
    h+='<div style="margin-bottom:10px"><button class="speed-btn" id="lvBack" style="padding:10px 16px;min-height:44px;font-size:var(--fs-base)">← 返回战斗</button></div>'
  }
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
  gc.querySelectorAll('.lv-card[data-group]').forEach(function(c){
    c.addEventListener('click', function(){ 
      var gid = c.getAttribute('data-group')
      if (typeof startGroupTrial === 'function') startGroupTrial(gid)
    })
  })
  // 返回战斗按钮
  var lvBack = document.getElementById('lvBack')
  if (lvBack) lvBack.addEventListener('click', function () {
    gc._levelViewOpen = false
    gc.style.display = 'none'
    var vv = document.getElementById('gameBattleView')
    if (vv) vv.style.display = 'block'
    switchGameTab('battle')
  })
  // v2.0 挑战页三视图（培养/战斗/记录）
  if (typeof renderGameViews === 'function' && document.getElementById('gameTrainView')) {
    renderGameViews()
    // 旧视图隐藏（由新选项卡控制）；关卡列表打开时保持显示
    var gc2 = document.getElementById('gameContent')
    if (gc2 && _gameTab === 'battle') {
      if (gc2._levelViewOpen) {
        gc2.style.display = 'block'
        var vv2 = document.getElementById('gameBattleView')
        if (vv2) vv2.style.display = 'none'
      } else {
        gc2.style.display = 'none'
      }
    }
  }
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
  var challengeBonus=getChallengeBonus();
  var calc=calculateStats(strVol,carDur,carEff,permBonusAtk+(challengeBonus.atk||0),permBonusDef+(challengeBonus.def||0),g.permPen.atk||0,g.permPen.def||0,refineBonus,challengeBonus.hp||0)
  return{
    atk:calc.atk,def:calc.def,hp:calc.hp,soulAtk:calc.soulAtk,soulDef:calc.soulDef,
    period:curPeriod,periodDays:periodDays,periodVol:periodVol,volMet:bonus.volMet,
    periodEnabled:periodEnabled,
    permBonusAtk:permBonusAtk,permBonusDef:permBonusDef,
    lastPeriodDays:lastPeriodDays,lastPeriodName:prevPeriod.name,
    permPenAtk:g.permPen.atk||0,permPenDef:g.permPen.def||0,
    monthDays:getMonthDays(),
    refineUnlocked:refine.unlocked,refinePoints:refine.points||0,refineTotalEarned:refine.totalEarned||0,
    refineBonus:refineBonus,
    challengeAtk:challengeBonus.atk||0,challengeDef:challengeBonus.def||0,challengeHp:challengeBonus.hp||0
  }
}

function showLevelPreview(id){
  var lv=findLevel(id);if(!lv)return
  var stats=getGameStats()
  var cleared=getGame().cleared.includes(id)

  // Simulate 50 battles for accurate win rate
  var wins=0
  var sides=buildBattleSides(stats,lv)
  for(var s=0;s<50;s++){
    var batt=createBattle(sides.player,sides.enemy,{npc:lv.npc,boss:lv.boss},lv.boss?rollBossAffixFor(lv):null)
    for(var t=0;t<100&&!batt.done;t++){battleTick(batt)}
    if(batt.winner)wins++
  }
  var rate=Math.min(98,Math.max(2,Math.round(wins/50*100)))
  var rateColor=rate>=70?'var(--green)':rate>=40?'var(--yellow)':'var(--red)'

  var modal=openModal()
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">'+lv.id+' '+lv.npc+(lv.boss?' 👑':'')+(cleared?' ✅':':')+'</div>'
    +'<div class="stats-grid" style="margin-bottom:12px">'
    +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-lg);color:var(--orange)">⚔️ '+lv.atk+'</div><div class="sc-l">攻击</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-lg);color:var(--blue)">🛡️ '+lv.def+'</div><div class="sc-l">防御</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-lg);color:var(--green)">❤️ '+lv.hp+'</div><div class="sc-l">生命</div></div>'
    +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-lg);color:'+rateColor+'">'+rate+'%</div><div class="sc-l">胜率(50次模拟)</div></div>'
    +'</div>'
  if((lv.soulAtk||0)>0||(lv.soulDef||0)>0){
    h+='<div class="stats-grid" style="margin-bottom:12px">'
      +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-base);color:var(--purple)">👻 '+(lv.soulAtk||0)+'</div><div class="sc-l">魂攻击</div></div>'
      +'<div class="sc"><div class="sc-v" style="font-size:var(--fs-base);color:var(--purple)">🔮 '+(lv.soulDef||0)+'</div><div class="sc-l">魂防御</div></div>'
      +'</div>'
  }

  // Boss affix info
  if(lv.boss){
    var affixes=BOSS_AFFIXES.map(function(a){return a.name+': '+a.desc})
    h+='<div style="background:rgba(249,115,22,.08);border:1px solid var(--orange-g);border-radius:var(--rs);padding:10px 14px;margin-bottom:12px;font-size:var(--fs-xs);color:var(--text2)">'
      +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">👑 Boss 词缀'+(lv.dualAffix?' (随机2种·机制叠加)':' (随机1种)')+'</div>'
      +affixes.map(function(a){return'<div style="padding:2px 0">• '+a+'</div>'}).join('')
      +(lv.dualAffix?'<div style="margin-top:4px;color:var(--yellow)">⚠️ 本 BOSS 同时携带 2 条词条，效果叠加</div>':'')
      +'</div>'
  }

  // Player stats comparison
  var soulStr=(stats.soulAtk>0||stats.soulDef>0)?' 👻'+stats.soulAtk+' 🔮'+stats.soulDef:'';
  h+='<div style="font-size:var(--fs-xs);color:var(--text3);text-align:center;margin-bottom:4px">你的属性: ⚔️'+stats.atk+' 🛡️'+stats.def+' ❤️'+stats.hp+soulStr+'</div>'

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

/* ========== 敌群试炼（M2b 多对多） ========== */
var _groupBattle=null,_groupTimer=null
var _groupStageId=null   // 当前敌群小关 id（通关记录用）
var _groupActing=null    // 当前行动中的单位 id（高亮）
var _petBattlePicks=[]   // 宠物参战选择（M4-6）
var _groupMode='auto'   // 'auto' | 'manual'（manual=点一下推进一回合）
var _groupSpeed=1        // 1/2/4
var _groupAnimEl=null    // 动画中的单位
var _groupDetail=null    // 详情面板中的单位 id
var _gbTab='battle'      // v2.1.14：战斗页 / 日志页双 Tab（'battle' | 'log'）
var _groupPaused=false   // v2.1.14：打开详情时暂停自动推进，避免详情被下一步渲染刷掉
var _groupRewarded=false // v2.1.19：本次战斗是否已结算过奖励（防手动模式重复领取）

/* v2.1.14：暂停 / 恢复群战推进（详情弹层打开期间挂起，关闭后按原模式续跑） */
function pauseGroupBattle(){
  _groupPaused=true
  if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
}
function resumeGroupBattle(){
  if(!_groupPaused)return
  _groupPaused=false
  if(_groupBattle&&!_groupBattle.done&&_groupMode==='auto'&&!_groupDetail)_groupStep()
}

/* 启动敌群试炼：生成玩家 Unit + 敌人，开群战 */
function startGroupTrial(groupId){
  // 支持：小关 id（g1-1）或大关 id（g1，取第 1 关）
  var stage = (typeof getGroupStage === 'function') ? getGroupStage(groupId) : null
  var glv
  if (stage) glv = stage
  else glv = (GROUP_LEVELS||{})[groupId] ? (GROUP_LEVELS[groupId].stages || [])[0] : null
  if(!glv){toast('敌群关卡不存在','e');return}
  // 记录当前小关 id（通关解锁用）
  _groupStageId = stage ? groupId : null
  _groupRewarded = false   // v2.1.19：新战斗重置结算标志
  // 通关的关卡不可重打
  if (_groupStageId && typeof isGroupStageCleared === 'function' && isGroupStageCleared(_groupStageId)) {
    toast('该关卡已通关 ✅','e'); return
  }
  var stats=getGameStats()
  // v2.1.10：敌群是独立属性空间 —— 玩家只继承一定比例，避免裸属性把敌人压成 1 点
  var gs=(typeof inheritGroupStats==='function')?inheritGroupStats(stats):stats
  var player=createUnit({id:'player',side:'ally',name:'🧑 你',level:1,base:{hp:gs.hp,atk:gs.atk,def:gs.def,spd:10,soulAtk:gs.soulAtk||0,soulDef:gs.soulDef||0}})
  // 挂载玩家技能（装备的技能生效）
  if (typeof attachPlayerSkills === 'function' && typeof getSkillState === 'function') {
    attachPlayerSkills(player, getSkillState())
  }
  // 默认带宠物：优先 _petBattlePicks，否则自动带成熟宠物
  var petIds = (_petBattlePicks && _petBattlePicks.length) ? _petBattlePicks : autoPickPets(2)
  // 宠物放大到与玩家同量级，否则基础 atk 15~20 等于摆设
  var petUnits = createPetUnitsForBattle(petIds, 2)
  if (typeof boostPetForGroup === 'function') petUnits.forEach(boostPetForGroup)
  var allies = [player].concat(petUnits)
  var anchorG = String(stage ? String(groupId).split('-')[0] : groupId)
  // 锚定默认关闭（见 GROUP_ANCHOR.enabled），开启时按我方阵容反推敌人属性
  var cfgList = (typeof groupStageEnemies === 'function') ? groupStageEnemies(anchorG, glv, allies) : glv.enemies
  var enemies=cfgList.map(function(ec,i){
    return createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base})
  })
  // v2.1.13 场地：每个大关一个主题场地（g3 起）
  var lgNum = parseInt(String(anchorG).replace(/[^0-9]/g, ''), 10) || 1
  var terrain = (typeof groupTerrainFor === 'function') ? groupTerrainFor(lgNum) : null
  if (terrain) toast('场地：' + terrain.name + ' — ' + (terrain.desc || ''), 's')
  _groupBattle=createGroupBattle({allies:allies,enemies:enemies,terrain:terrain})
  // 模式/速度持久化（记住上次选择）
  _groupMode=localStorage.getItem('dh-group-mode')||'auto'
  _groupSpeed=parseInt(localStorage.getItem('dh-group-speed')||'1',10)||1
  if(['auto','manual'].indexOf(_groupMode)<0)_groupMode='auto'
  if([1,2,4,8].indexOf(_groupSpeed)<0)_groupSpeed=1
  _groupDetail=null
  _gbTab='battle'        // v2.1.14：每次开战回到战斗页
  _groupPaused=false
  _groupActing=null
  renderGroupOverlay(true)
  toast('👥 '+glv.name+' 开始！'+(petUnits.length?'（带 '+petUnits.length+' 宠物）':''),'s')
  _groupStep()
}

/* 自动选参战宠物（最多 n 只成熟宠物） */
function autoPickPets(n){
  var ready=getBattleReadyPets()
  if(!ready.length)return []
  return ready.slice(0,n||2).map(function(p){return p.speciesId})
}

/* 群战推进（自动模式定时循环；手动模式点按钮触发） */
function _groupStep(){
  if(_groupPaused)return   // 详情弹层打开中：挂起，关闭后 resumeGroupBattle() 续跑
  if(!_groupBattle||_groupBattle.done){_groupDone();return}
  // 单步执行：一次一个单位行动（速度优先级可见）
  var step = groupBattleStep(_groupBattle)
  // 高亮当前行动单位
  if (step.unit) _groupActing = step.unit.id
  renderGroupOverlay(false)
  // 攻击反馈动画：解析本次行动的日志，高亮受击目标 + 伤害飘字
  if (step.unit) playAttackFeedback(_groupBattle, step)
  if(_groupBattle.done){_groupDone();return}
  // 技能气泡
  var lastLog = _groupBattle.log.length ? _groupBattle.log[_groupBattle.log.length-1] : null
  var bubble = lastLog ? lastLog.events.find(function(e){ return e.type==='bubble'; }) : null
  if (bubble) {
    showSkillBubble(bubble)
    if (_groupMode==='manual') return
    _groupTimer=setTimeout(_groupStep,900/_groupSpeed)   // 气泡停顿
    return
  }
  if(_groupMode==='manual')return   // 手动：等用户点下一回合
  // 每个单位行动间隔（看清速度顺序）
  _groupTimer=setTimeout(_groupStep,700/_groupSpeed)
}

/* 攻击反馈动画：解析本次行动日志，受击目标闪烁 + 伤害飘字 */
function playAttackFeedback(gb, step) {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  var lastLog = gb.log.length ? gb.log[gb.log.length-1] : null
  if (!lastLog) return
  // 找本次行动的伤害事件（v2.1.14 起日志统一为「… → [目标] N 伤害」）
  lastLog.events.forEach(function(e){
    // 用惰性 .*? 取伤害数字：单位名可能含空格（如「👹 熔岩巨兽」），不能按 \S+ 切
    var m = /→\s+.*?(\d+)\s+(?:魂)?伤害/.exec(e.msg)
    if (!m) {
      // 场地伤害（沙暴碎石 / 雨天闪电）也飘字，格式没有箭头
      var t2 = /(?:受碎石伤害|被闪电击中)\s+(\d+)/.exec(e.msg)
      if (t2) m = [t2[0], t2[1]]
    }
    if (!m) return
    var dmgNum = m[1]
    // 受击目标：优先用事件里的 targetId（引擎侧保证伤害事件都带）
    var targetCard = null
    if (e.targetId) {
      targetCard = ov.querySelector('.gb-unit[data-uid="'+e.targetId+'"]')
    }
    if (!targetCard) {
      // 兜底：从文案里抠目标名（「A 攻击 B →」「→ B N 伤害」两种句式，允许名字带空格）
      var nm = /攻击\s+(.+?)\s*→/.exec(e.msg) || /→\s+(.+?)\s+\d+\s+(?:魂)?伤害/.exec(e.msg)
      var name = nm ? nm[1] : null
      if (name) {
        var cards = ov.querySelectorAll('.gb-unit')
        for (var i=0;i<cards.length;i++){
          if (cards[i].textContent.indexOf(name) > -1){ targetCard = cards[i]; break }
        }
      }
    }
    // 受击闪烁 + 飘字（追加到卡片内部，绝对定位跟随卡片）
    if (targetCard) {
      targetCard.classList.add('gb-hit')
      setTimeout(function(){ targetCard.classList.remove('gb-hit') }, 500)
      var float = document.createElement('div')
      float.textContent = '-' + dmgNum
      float.style = 'position:absolute;top:4px;right:10px;color:var(--red);font-size:var(--fs-xl);font-weight:800;z-index:5;pointer-events:none;animation:floatUp 0.8s ease forwards;text-shadow:0 2px 4px rgba(0,0,0,.5)'
      // 卡片需相对定位
      targetCard.style.position = 'relative'
      targetCard.appendChild(float)
      setTimeout(function(){ float.remove() }, 900)
    }
  })
}

/* 技能对话气泡（停顿效果） */
function showSkillBubble(bubble) {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  var old = document.getElementById('skillBubble')
  if (old) old.remove()
  var el = document.createElement('div')
  el.id = 'skillBubble'
  el.style = 'position:absolute;left:50%;top:38%;transform:translateX(-50%);background:rgba(15,23,42,.92);border:2px solid var(--orange);border-radius:16px;padding:10px 18px;font-size:var(--fs-md);font-weight:600;color:#fff;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:bubblePop .3s ease;max-width:80%;text-align:center;pointer-events:none'
  el.innerHTML = bubble.text
  ov.appendChild(el)
  // 气泡自动消失（3 秒）
  setTimeout(function(){ if (el && el.parentNode) el.remove() }, 2600)
}

/* 群战结束 */
function _groupDone(){
  if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
  var w=_groupBattle&&_groupBattle.winner
  /* v2.1.19：手动模式下战斗结束后仍可继续点「下一步」→ _groupStep 会再次走到这里，
     导致 markGroupStageCleared / groupVictoryReward 被重复执行、奖励重复发放。
     这里保证每场战斗只结算一次。 */
  if(_groupRewarded){
    renderGroupOverlay(false)
    return
  }
  _groupRewarded=true
  _groupActing=null        // v2.1.14：战斗结束不再残留「行动中」高亮
  _groupPaused=false
  renderGroupOverlay(false)
  if(w==='ally'){
    // 记录敌群通关（解锁下一关）
    var stageId = _groupStageId || null
    var prog = null
    if (stageId && typeof markGroupStageCleared === 'function') {
      prog = markGroupStageCleared(stageId)
    }
    // 敌群胜利奖励：技能点（基数 4 点/胜，见 skill-store.js 的 SKILL_POINTS_PER_STAGE）+ 材料（随关卡难度递增）
    // 注：v2.1.19 把基数从 10 降到 4，此处注释同步（此前一直写着 10，与实际不符）
    var reward = groupVictoryReward(_groupBattle)
    var msg = '🎉 敌群讨伐成功！' + reward.msg
    if (prog && prog.firstClear) {
      msg += (prog.nextStage ? ' · 🔓 解锁 ' + prog.nextStage : ' · 🏆 全部通关！')
    }
    toast(msg, 's')
    // 立即重渲染小关列表（无需刷新）
    if (stageId && typeof showGroupStages === 'function') {
      var lg = stageId.split('-')[0]
      showGroupStages(lg)
    }
  }
  else {
    // v2.1.19：参战的成熟宠物 50% 几率受伤
    var msg0 = '💀 敌群讨伐失败…'
    try {
      var dInj = getPetStore()
      var sps = (_groupBattle && _groupBattle.allies ? _groupBattle.allies : [])
        .map(function (u) { return u._petSpecies; }).filter(Boolean)
      var hurt = (typeof applyDefeatInjuries === 'function') ? applyDefeatInjuries(dInj, sps) : []
      if (hurt.length) { savePetStore(dInj); msg0 += ' ' + hurt.join('、') + ' 受伤（喂养恢复）' }
    } catch (e) { console.warn('[group] 受伤判定失败', e); }
    toast(msg0, 'e')
  }
}

/* 敌群胜利奖励：技能点（基数 4 点/胜，与挑战数值独立）+ 材料掉落
   数值口径唯一来源是 skill-store.js 的 SKILL_POINTS_PER_STAGE，改那里即可，别在这里写死数字 */
function groupVictoryReward(gb) {
  var msgs = []
  // 技能点：基数 4 点 + 周内递增（weeklyBonusRate = min(2.5, 胜局数×0.5) → 4/6/8/10/12/14 封顶）
  var wk = monthKey(new Date()) + '-W' + Math.ceil((new Date().getDate()) / 7)
  var winCount = recordSkillWin(wk)
  var award = awardSkillPoints(winCount)
  msgs.push('💠 技能点 +' + award.gained)
  // 材料掉落：随敌群大关等级（用敌人数量/强度粗估）
  var enemyCount = (gb && gb.enemies) ? gb.enemies.length : 2
  var drops = [
    { type: 'nutrition', n: 1 + Math.floor(Math.random() * 2) },
    { type: 'feed', n: 1 + Math.floor(Math.random() * 3) }
  ]
  if (enemyCount >= 3) drops.push({ type: 'refineNormal', n: 1 })
  if (enemyCount >= 4) drops.push({ type: 'spirit', n: 1 + Math.floor(Math.random() * 2) })
  // 幸运口袋（小负鼠天赋）：队伍中带此天赋者，胜利结算 35% 几率追加一份材料
  var lucky = (gb && gb.allies ? gb.allies : []).filter(function (u) {
    return u._talents && u._talents.indexOf('lucky_pocket') > -1
  })
  if (lucky.length && Math.random() < 0.35) {
    var bonusPool = [{ type: 'nutrition', n: 1 }, { type: 'feed', n: 1 }, { type: 'spirit', n: 1 }]
    var bp = bonusPool[Math.floor(Math.random() * bonusPool.length)]
    drops.push({ type: bp.type, n: bp.n + 1, lucky: true })
  }
  drops.forEach(function (d) {
    grantMaterial(d.type, d.n)
    msgs.push((d.lucky ? '🍀 ' : '') + getMaterialName(d.type) + ' +' + d.n)
  })
  return { msg: msgs.join(' · ') }
}

/* 渲染群战 overlay：手动/自动 + 调速 + 单位 + 动画 + 详情 + 日志 */
function renderGroupOverlay(show){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  if(show)ov.classList.add('open')
  if(!_groupBattle){ov.classList.remove('open');return}
  var gb=_groupBattle
  // v2.1.14：控制条常驻（sticky），其下是「战斗 / 日志」双 Tab —— 两个页签各自独立滚动
  var h='<div class="gb-ctrl">'
    +'<button class="speed-btn" id="gbClose" aria-label="退出战斗">✕</button>'
    +'<span class="gb-ctrl-title">👥 '+gb.enemies.length+'敌 · 回合 '+gb.turn+'</span>'
    +'<span style="flex:1"></span>'
    // 手动/自动切换
    +'<button class="speed-btn'+(_groupMode==='manual'?' on-warn':'')+'" id="gbMode">'+(_groupMode==='manual'?'✋ 手动':'🤖 自动')+'</button>'
    // 调速（自动模式）
    +(_groupMode==='auto'?'<button class="speed-btn" id="gbSpeed">'+_groupSpeed+'×</button>':'')
    // 手动：推进一回合按钮
    +(_groupMode==='manual'?'<button class="speed-btn on-good" id="gbStep">⏭️ 下一回合</button>':'')
    +'</div>'
  // v2.1.14 双 Tab（战斗 / 日志）
  h+='<div class="gb-tabs" role="tablist" aria-label="战斗视图">'
    +'<button class="gb-tab'+(_gbTab==='battle'?' active':'')+'" data-gbtab="battle" role="tab" aria-selected="'+(_gbTab==='battle')+'">⚔️ 战斗</button>'
    +'<button class="gb-tab'+(_gbTab==='log'?' active':'')+'" data-gbtab="log" role="tab" aria-selected="'+(_gbTab==='log')+'">📜 日志<span class="gb-tab-n">'+((gb.log&&gb.log.length)||0)+'</span></button>'
    +'</div>'
  // 页签内容（各自独立滚动，日志页不再挤在 300px 里）
  h+='<div class="gb-pane" id="gbPane">'
    +(_gbTab==='log' ? renderGroupLogPane(gb) : renderGroupBattlePane(gb))
    +'</div>'
  ov.innerHTML=h
  // 事件绑定
  var closeBtn=document.getElementById('gbClose')
  if(closeBtn)closeBtn.addEventListener('click',function(){ov.classList.remove('open');_groupBattle=null;_groupPaused=false;if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}})
  // v2.1.14：战斗 / 日志双 Tab 切换
  ov.querySelectorAll('[data-gbtab]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var t=btn.getAttribute('data-gbtab')
      if(t===_gbTab)return
      _gbTab=t
      renderGroupOverlay(false)
    })
  })
  var modeBtn=document.getElementById('gbMode')
  if(modeBtn)modeBtn.addEventListener('click',function(){
    _groupMode=_groupMode==='auto'?'manual':'auto'
    localStorage.setItem('dh-group-mode',_groupMode)
    if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
    if(_groupMode==='auto')_groupStep()
    else renderGroupOverlay(false)
  })
  var speedBtn=document.getElementById('gbSpeed')
  if(speedBtn)speedBtn.addEventListener('click',function(){
    _groupSpeed=_groupSpeed===1?2:_groupSpeed===2?4:_groupSpeed===4?8:1
    localStorage.setItem('dh-group-speed',String(_groupSpeed))
    if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
    _groupStep()
  })
  var stepBtn=document.getElementById('gbStep')
  if(stepBtn)stepBtn.addEventListener('click',function(){_groupStep()})
  // 复制日志按钮
  var copyBtn=document.getElementById('gbCopyLog')
  // v2.1.14：滚动容器由 #gbLogBox 换成页签容器 #gbPane（日志页铺满整屏，不再挤在 300px 内）
  var pane = document.getElementById('gbPane')
  if (pane && _gbTab==='log') pane.scrollTop = pane.scrollHeight
  if(copyBtn)copyBtn.addEventListener('click',function(){
    var gb2=_groupBattle
    if(!gb2)return
    var text=gb2.log.map(function(l){
      // v2.1.14：带上行动者（l.unit）与开场/回合标题，气泡事件不入文本（已在战斗页弹过）
      var head='【'+(l.turn===0?'开场':'回合 '+l.turn)+'】'+(l.unit||'')
      var body=(l.events||[]).filter(function(e){return e&&e.msg&&e.type!=='bubble'}).map(function(e){return e.msg}).join('；')
      return head+': '+body
    }).join('\n')
    try{
      navigator.clipboard.writeText(text).then(function(){toast('📋 日志已复制','s')})
    }catch(e){
      var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('📋 日志已复制','s')
    }
  })
  // v2.1.7：日志展开/收起
  var logToggle=document.getElementById('gbLogToggle')
  if(logToggle)logToggle.addEventListener('click',function(){
    _gbLogAll=!_gbLogAll
    renderGroupOverlay(false)
    var p2=document.getElementById('gbPane')
    if(p2)p2.scrollTop=p2.scrollHeight
  })
  // 单位点击：看详情（v2.1.14：先暂停推进，否则自动模式会把详情页刷掉）
  ov.querySelectorAll('.gb-unit').forEach(function(el){
    el.addEventListener('click',function(){
      var uid=el.getAttribute('data-uid')
      var u=gb.units.find(function(x){return x.id===uid})
      if(!u)return
      _groupDetail=uid
      pauseGroupBattle()
      renderGroupDetail(u)
    })
  })
  // v2.1.14：技能 / 天赋标签点击 → 详情弹层（不触发单位卡详情，故阻止冒泡）
  ov.querySelectorAll('.gb-chip[data-skill]').forEach(function(el){
    el.addEventListener('click',function(ev){
      ev.stopPropagation()
      var u=gb.units.find(function(x){return x.id===el.getAttribute('data-uid')})
      pauseGroupBattle()
      showSkillDetail(el.getAttribute('data-skill'),u)
    })
  })
  ov.querySelectorAll('.gb-chip[data-pskill]').forEach(function(el){
    el.addEventListener('click',function(ev){
      ev.stopPropagation()
      var u=gb.units.find(function(x){return x.id===el.getAttribute('data-uid')})
      pauseGroupBattle()
      showPlayerSkillDetail(el.getAttribute('data-pskill'),u)
    })
  })
  ov.querySelectorAll('.gb-chip[data-talent]').forEach(function(el){
    el.addEventListener('click',function(ev){
      ev.stopPropagation()
      pauseGroupBattle()
      showTalentDetail(el.getAttribute('data-talent'),gb.units.find(function(x){return x.id===el.getAttribute('data-uid')}))
    })
  })
  // 攻击动画（高亮受伤单位）
  if(_groupAnimEl){
    var el=ov.querySelector('.gb-unit[data-uid="'+_groupAnimEl+'"]')
    if(el){el.classList.add('gb-hit');setTimeout(function(){el.classList.remove('gb-hit')},400)}
    _groupAnimEl=null
  }
}

/* ============================================================
   v2.1.14 战斗页 / 日志页（双 Tab）
   ============================================================ */

/* 极简 HTML 转义（引擎文案含 emoji 与中文，只需挡掉 < > & 以免破坏结构） */
function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

/* 日志行配色：按事件类型上色，一眼区分伤害/状态/治疗/场地/天赋 */
function logEventClass(e){
  var t=(e&&e.type)||''
  if(t==='terrain')return 'terrain'
  if(t==='status'||t==='dot')return 'status'
  if(t==='heal')return 'heal'
  if(t==='damage')return 'dmg'
  if(t==='talent')return 'talent'
  if(t==='skip')return 'warn'
  if(t==='buff')return 'buff'
  var m=(e&&e.msg)||''
  if(/治疗|恢复|回复/.test(m))return 'heal'
  if(/施加|刷新|免疫|中毒|冰冻|畏缩|潮湿|睡眠|诅咒|末日|破甲|减速|解冻|苏醒/.test(m))return 'status'
  if(/→ \d+ (魂)?伤害/.test(m))return 'dmg'
  return ''
}

/* 战斗页：行动顺序 + 我方 + 敌方 */
function renderGroupBattlePane(gb){
  var h=renderGroupOrder(gb)
  h+='<div class="gb-side-hdr ally"><span>🟢 我方</span>'
  gb.allies.forEach(function(u){
    if(u._petSpecies)h+='<span class="gb-tag pet">🐾 宠物</span>'
  })
  h+='</div>'
  gb.allies.forEach(function(u){h+=renderGroupUnit(u,'ally')})
  h+='<div class="gb-side-hdr enemy"><span>🔴 敌方</span></div>'
  gb.enemies.forEach(function(u){h+=renderGroupUnit(u,'enemy')})
  h+='<div class="gb-hint">👆 点单位卡看完整属性 · 点技能/天赋标签看详细说明</div>'
  return h
}

/* 日志页：分回合 + 每段标出行动者
   v2.1.14：此前日志只输出裸事件文案，看不出这段是谁的行动；
   场地事件还完全不在 gb.log 里（引擎侧已补）。 */
function renderGroupLogPane(gb){
  var allLogs=(gb&&gb.log)||[]
  var logs=_gbLogAll?allLogs:allLogs.slice(-8)
  var h='<div class="gb-log-hdr">'
    +'<span class="gb-log-title">📜 战斗日志</span>'
    +(_gbLogAll?'':'<span class="gb-log-note">仅最近 8 条 · 共 '+allLogs.length+' 条</span>')
    +'<span style="flex:1"></span>'
    +(allLogs.length>8?'<button class="speed-btn sm" id="gbLogToggle">'+(_gbLogAll?'🔼 收起':'🔽 展开全部('+allLogs.length+')')+'</button>':'')
    +'<button class="speed-btn sm" id="gbCopyLog">📋 复制</button>'
    +'</div>'
  h+='<div id="gbLogBox" class="gb-log-box">'
  if(!allLogs.length)h+='<div class="gb-log-note">战斗开始…</div>'
  logs.forEach(function(l){
    h+='<div class="gb-log-turn">—— '+(l.turn===0?'开场':'回合 '+l.turn)+' ——</div>'
    var mark=l.opening?'🎬':(l.terrain?'🌍':'▶')
    h+='<div class="gb-log-actor'+(l.terrain?' terrain':'')+(l.opening?' opening':'')+'">'+mark+' '+escHtml(l.unit||'单位')+'</div>'
    var lines=0
    ;(l.events||[]).forEach(function(e){
      if(!e||!e.msg)return
      if(e.type==='bubble')return   // 气泡已在战斗页弹过，日志里略去以免噪声
      lines++
      h+='<div class="gb-log-ev '+logEventClass(e)+'">'+escHtml(e.msg)+'</div>'
    })
    if(!lines)h+='<div class="gb-log-ev muted">（本回合无事发生）</div>'
  })
  h+='</div>'
  return h
}

/* 技能标签：敌群技能 u.skills（逐条冷却）+ 玩家技能 _playerSkills（等级 + 冷却）
   v2.1.14：此前单位卡只显示一个「⏳最小冷却」，玩家技能根本不显示，天赋只显示「✨×N」。 */
function renderUnitSkillChips(u){
  var out=''
  if(u.skills&&u.skills.length&&typeof skillCooldownLeft==='function'){
    u.skills.forEach(function(sid){
      var s=(typeof SKILLS!=='undefined')?SKILLS[sid]:null
      var nm=s?s.name:sid
      var cd=skillCooldownLeft(u,sid)
      out+='<button type="button" class="gb-chip sk '+(cd>0?'cd':'ready')+'" data-skill="'+sid+'" data-uid="'+u.id+'" title="'+escHtml(nm)+'（点看详情）">'
        +escHtml(nm)+(cd>0?(' ⏳'+cd):' ✓')+'</button>'
    })
  }
  if(u._playerSkills&&typeof getPlayerSkill==='function'){
    Object.keys(u._playerSkills).forEach(function(sid){
      var s=getPlayerSkill(sid)
      if(!s)return
      var lv=u._playerSkills[sid]||0
      var cd=(typeof skillCooldownLeft==='function')?skillCooldownLeft(u,sid):0
      var active=(s.type==='attack')   // 只有主动技能吃冷却
      var tail=active?(cd>0?(' ⏳'+cd):' ✓'):''
      out+='<button type="button" class="gb-chip sk '+((active&&cd>0)?'cd':'ready')+'" data-pskill="'+sid+'" data-uid="'+u.id+'" title="'+escHtml(s.name)+' Lv'+lv+'（点看详情）">'
        +escHtml(s.name)+'<span class="gb-chip-lv">Lv'+lv+'</span>'+tail+'</button>'
    })
  }
  return out
}

/* 天赋标签：✨ + 天赋名（可点开详情） */
function renderUnitTalentChips(u){
  if(!u._talents||!u._talents.length)return ''
  return u._talents.map(function(tid){
    var t=(typeof TALENTS!=='undefined')?TALENTS[tid]:null
    var nm=t?t.name:tid
    return '<button type="button" class="gb-chip tl" data-talent="'+tid+'" data-uid="'+u.id+'" title="'+escHtml(nm)+'（点看详情）">✨'+escHtml(nm)+'</button>'
  }).join('')
}

/* 行动顺序条：取当前行动队列，列出接下来最多 5 个出手单位（v2.1.7） */
var _gbLogAll=false
function renderGroupOrder(gb){
  var q = gb && gb._stepQueue
  if(!q || !q.length) return ''
  var idx = gb._stepIdx || 0
  var out='<div class="gb-order" role="list" aria-label="行动顺序">'
  var shown=0
  for(var i=idx;i<q.length&&shown<5;i++){
    var u=q[i]
    if(!u||u.hp<=0)continue
    out+='<span class="gb-order-chip '+u.side+(shown===0?' now':'')+'" role="listitem">'
      +(shown===0?'▶ ':'')+u.name+'</span>'
    shown++
  }
  out+='</div>'
  return out
}

/* 渲染单个群战单位（可点击：详情；触摸区 ≥44px）
   信息层次：名称/行动标记/血条/属性/状态/技能冷却/天赋
   v2.1.14 三处升级：
     1) 行动者标识由「内联边框色」升级为 gb-acting 类（左侧强调条 + 呼吸动画 + 文字标签）
     2) 技能从「一个 ⏳最小冷却」改为逐技能标签（敌人 u.skills + 玩家 _playerSkills，各带冷却）
     3) 天赋从「✨×N」改为显示天赋名，且可点击看详情 */
function renderGroupUnit(u,side){
  var hpPct=u.hp<=0?0:Math.round(u.hp/u.base.hp*100)
  var color=side==='ally'?'var(--green)':'var(--red)'
  var dead=u.hp<=0
  var low=!dead&&hpPct<=25
  var acting=(_groupActing===u.id)
  var cls='gb-unit'+(dead?' gb-dead':'')+(low?' gb-low':'')+(acting?' gb-acting':'')
  var barColor=dead?'var(--text3)':hpPct>50?'var(--green)':hpPct>25?'var(--orange)':'var(--red)'
  // 状态徽章（图标 + 剩余回合；title 用中文名而非英文 id）
  var statusHtml=(u.statuses||[]).map(function(s){
    var ic=statusIcon(s.id)
    if(!ic)return ''
    var d=(s.duration!=null&&s.duration>0)?s.duration:''
    var nm=(typeof getStatusName==='function')?getStatusName(s.id):s.id
    return '<span class="gb-badge st" title="'+escHtml(nm)+'">'+ic+(d?' '+d:'')+'</span>'
  }).join('')
  // 威吓标记（此前被威吓的单位在界面上完全看不出来）
  var scared=u._intimidated?'<span class="gb-badge scared" title="被威吓：攻击 -40%">😱 攻-40%</span>':''
  var skillChips=renderUnitSkillChips(u)
  var talentChips=renderUnitTalentChips(u)
  /* v2.1.15：属性显示改为「有效值 + 修正箭头」。
     状态修正（破甲/潮湿/减速/攻击提升）现在真的生效了，继续显示裸属性会让人
     看不出身上到底发生了什么 —— 破甲 6 层防御砍掉 60%，卡片上却还是原值。 */
  var effOf = function (key) {
    return (typeof effectiveStat === 'function') ? effectiveStat(u, key) : (u.base[key] || 0);
  };
  var statCell = function (icon, key, forced) {
    var base = u.base[key] || 0;
    var v = (forced == null) ? effOf(key) : forced;
    var mark = '';
    if (v !== base) {
      mark = '<span class="gb-mod ' + (v > base ? 'up' : 'down') + '" title="基础 ' + base + '">' + (v > base ? '▲' : '▼') + '</span>';
    }
    return '<span>' + icon + ' <b>' + v + '</b>' + mark + '</span>';
  };
  var effSoulAtk = effOf('soulAtk');
  var effSoulDef = effOf('soulDef');
  var soulTxt = (effSoulAtk > 0 || effSoulDef > 0)
    ? '<span class="gb-stat soul">👻' + effSoulAtk + ' 🔮' + effSoulDef + '</span>' : '';
  return '<div class="'+cls+'" data-uid="'+u.id+'" role="button" tabindex="0" aria-label="'+escHtml(u.name)+' 详情"'+(acting?' aria-current="true"':'')+'>'
    // 第一行：名称 + 行动标记 + 状态
    +'<div class="gb-row1">'
    +'<span class="gb-name" style="color:'+color+'">'+escHtml(u.name)+'</span>'
    +(acting?'<span class="gb-acting-tag">▶ 行动中</span>':'')
    +statusHtml+scared
    +'</div>'
    // 第二行：血条（大）+ 数值与百分比
    +'<div class="gb-hp-wrap">'
    +'<div class="gb-hp-fill" style="width:'+hpPct+'%;background:'+barColor+'"></div>'
    +'<span class="gb-hp-text">'+Math.max(0,u.hp)+'/'+u.base.hp+'　'+hpPct+'%</span>'
    +'</div>'
    // 第三行：属性直显（有效值 + 修正箭头）+ 提示
    +'<div class="gb-stats">'
    +statCell('⚔️', 'atk')
    +statCell('🛡️', 'def')
    +statCell('💨', 'spd', (typeof effectiveSpeed === 'function') ? effectiveSpeed(u) : (u.base.spd || 0))
    +soulTxt
    +'<span style="flex:1"></span>'
    +(dead?'<span class="gb-dim">💀 已阵亡</span>':'<span class="gb-dim">👆 详情</span>')
    +'</div>'
    // 第四行：技能冷却 + 天赋
    +((skillChips||talentChips)?'<div class="gb-row4">'+skillChips+talentChips+'</div>':'')
    +'</div>'
}

/* 详情面板：属性/技能/天赋/状态/冷却
   v2.1.14：技能行与天赋行改为可点按钮 —— 点开走 #panelOverlay 的完整说明弹层 */
function renderGroupDetail(u){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="gbDetailBack">← 返回</button>'
    +'<span class="det-title">'+escHtml(u.name||'单位')+'</span>'
    +'<span class="det-sub">'+(u.side==='ally'?'我方':'敌方')+' · Lv'+u.level+'</span>'
    +'</div>'
  // 属性
  h+='<div class="det-card">'
  h+='<div class="det-h">📊 属性</div>'
  // 属性（v2.1.15：显示有效值，被状态改动过时附上差额）
  var dEff = function (k) { return (typeof effectiveStat === 'function') ? effectiveStat(u, k) : (u.base[k] || 0); };
  var dCell = function (label, key, forced) {
    var base = u.base[key] || 0;
    var v = (forced == null) ? dEff(key) : forced;
    var mark = (v !== base)
      ? '<span class="gb-mod ' + (v > base ? 'up' : 'down') + '">(' + (v > base ? '+' : '') + (v - base) + ')</span>' : '';
    return label + ' <b>' + v + '</b>' + mark;
  };
  h+='<div class="det-line">❤️ HP <b>'+u.hp+'</b>/'+u.base.hp+'　'+dCell('⚔️ 攻','atk')+'　'+dCell('🛡️ 防','def')
  h+='　'+dCell('💨 速','spd',(typeof effectiveSpeed==='function')?effectiveSpeed(u):(u.base.spd||0))
    +(dEff('soulAtk')?'　'+dCell('👻 魂攻','soulAtk'):'')+(dEff('soulDef')?'　'+dCell('🔮 魂防','soulDef'):'')+'</div>'
  if (u._shield > 0)h+='<div class="det-line warn">🛡️ 护盾剩余 <b>'+u._shield+'</b>（吸收伤害；盾存在期间免疫普通~高级负面）</div>'
  if(u._intimidated)h+='<div class="det-line warn">😱 被威吓中：攻击 -40%（威吓者血量低于 50% 时解除）</div>'
  if(u._taunting)h+='<div class="det-line warn">🎯 嘲讽中：被优先选中，速度 ×2 参与出手排序（持续到本次行动结束）</div>'
  h+='</div>'
  // 技能（兼容：敌群技能 u.skills + 玩家技能 _playerSkills）
  h+='<div class="det-card">'
  h+='<div class="det-h">⚡ 技能</div>'
  var skillShown = false
  if(u.skills&&u.skills.length&&typeof SKILLS!=='undefined'){
    u.skills.forEach(function(sid){
      var s=SKILLS[sid]
      if(!s)return
      skillShown = true
      var cd=(typeof skillCooldownLeft==='function')?skillCooldownLeft(u,sid):0
      h+='<button type="button" class="det-item" data-dskill="'+sid+'">'
        +'<span class="det-item-name">'+escHtml(s.name)+'</span>'
        +'<span class="det-item-sub">'+(s.type==='attack'?'攻击类':'辅助类')+(s.power?(' · '+s.power+'%'):'')+' · CD'+s.cooldown+'</span>'
        +'<span class="det-item-tail">'+(cd>0?('⏳ '+cd):'✓ 就绪')+'</span>'
        +'</button>'
    })
  }
  // 玩家技能（_playerSkills：暴击/陨石等）
  if(u._playerSkills&&typeof getPlayerSkill==='function'){
    Object.keys(u._playerSkills).forEach(function(sid){
      var s=getPlayerSkill(sid)
      if(!s)return
      skillShown = true
      var lv=u._playerSkills[sid]||0
      var cd=(typeof skillCooldownLeft==='function')?skillCooldownLeft(u,sid):0
      h+='<button type="button" class="det-item" data-dpskill="'+sid+'">'
        +'<span class="det-item-name">'+escHtml(s.name)+'</span>'
        +'<span class="det-item-sub">'+(s.type==='passive'?'被动':(s.type==='attack'?'攻击':'辅助'))+' · Lv'+lv+'/'+s.maxLevel+'</span>'
        +'<span class="det-item-tail">'+(s.type==='attack'?(cd>0?('⏳ '+cd):'✓ 就绪'):'被动')+'</span>'
        +'</button>'
    })
  }
  if(!skillShown)h+='<div class="det-dim">（无技能，普通攻击）</div>'
  h+='</div>'
  // 天赋
  h+='<div class="det-card">'
  h+='<div class="det-h">✨ 天赋</div>'
  if(!u._talents||!u._talents.length){h+='<div class="det-dim">（无天赋）</div>'}
  else{
    u._talents.forEach(function(tid){
      var t=(typeof TALENTS!=='undefined')?TALENTS[tid]:null
      if(!t)return
      h+='<button type="button" class="det-item" data-dtalent="'+tid+'">'
        +'<span class="det-item-name">✨ '+escHtml(t.name)+'</span>'
        +'<span class="det-item-sub">'+escHtml(t.desc||'（无说明）')+'</span>'
        +'</button>'
    })
  }
  h+='</div>'
  // 状态
  h+='<div class="det-card">'
  h+='<div class="det-h">🌀 状态</div>'
  if(!u.statuses||!u.statuses.length){h+='<div class="det-dim">（无状态）</div>'}
  else{
    u.statuses.forEach(function(st){
      var def=(typeof getStatusDef==='function')?getStatusDef(st.id):null
      h+='<div class="det-line">'+statusIcon(st.id)+' '+getStatusName(st.id)+(def&&def.grade?' <span class="det-dim">[等级'+def.grade+']</span>':'')+' <span class="det-dim">剩余'+st.duration+'回合'+(st.stacks>1?' · '+st.stacks+'层':'')+'</span></div>'
    })
  }
  h+='</div>'
  h+='<div class="gb-hint">点技能行 / 天赋行可查看完整说明</div>'
  ov.innerHTML='<div class="gb-pane">'+h+'</div>'
  var back=document.getElementById('gbDetailBack')
  if(back)back.addEventListener('click',function(){_groupDetail=null;resumeGroupBattle();renderGroupOverlay(false)})
  // 技能 / 天赋行 → 完整说明弹层（复用 #panelOverlay）
  ov.querySelectorAll('[data-dskill]').forEach(function(el){
    el.addEventListener('click',function(){showSkillDetail(el.getAttribute('data-dskill'),u)})
  })
  ov.querySelectorAll('[data-dpskill]').forEach(function(el){
    el.addEventListener('click',function(){showPlayerSkillDetail(el.getAttribute('data-dpskill'),u)})
  })
  ov.querySelectorAll('[data-dtalent]').forEach(function(el){
    el.addEventListener('click',function(){showTalentDetail(el.getAttribute('data-dtalent'),u)})
  })
}

/* 状态图标映射（title 用中文名，避免英文 id 外露） */
function statusIcon(id){
  var map={sleep:'💤',poison:'☠️',freeze:'❄️',flinch:'😵',wet:'💧',charging:'🔋',possessed:'👻',doomed:'🌑',armorbroken:'💔',slow:'🐌',souldown:'🔮',lastworded:'💀',sleepy:'😪'}
  var nm=(typeof getStatusName==='function')?getStatusName(id):id
  return '<span title="'+escHtml(nm)+'">'+(map[id]||'')+'</span>'
}

/* ============================================================
   v2.1.14 详情弹层：技能 / 玩家技能 / 天赋
   复用 #panelOverlay（z-index = 52 > 战斗 overlay 的 50，且自身可滚动）。
   打开时暂停群战推进，关闭时恢复 —— 否则自动模式会在阅读期间把界面刷掉。
   ============================================================ */
var _detailRestore=null   // 关闭弹层后要恢复的界面（从技能培养面板打开时用）
function _openDetailPanel(html, restore){
  var ov=document.getElementById('panelOverlay')
  if(!ov)return
  _detailRestore=(typeof restore==='function')?restore:null
  ov.innerHTML='<div class="panel-inner">'+html+'</div>'
  ov.classList.add('open')
  var back=document.getElementById('detailClose')
  if(back)back.addEventListener('click',_closeDetailPanel)
}
function _closeDetailPanel(){
  var ov=document.getElementById('panelOverlay')
  if(ov){ov.classList.remove('open');ov.innerHTML=''}   // 清干净，避免留下失效的 #detailClose
  var r=_detailRestore
  _detailRestore=null
  if(r){r();return}   // 从技能培养面板进来的：回到面板
  resumeGroupBattle()
}
function detRow(k,v){
  return '<div class="det-kv"><span class="det-k">'+escHtml(k)+'</span><span class="det-v">'+escHtml(v)+'</span></div>'
}

/* 技能目标术语 */
var _SKILL_TARGET_NAMES={random1:'随机 1 名敌人',all:'敌方全体',self:'自身',ally1:'随机 1 名队友',enemy1:'指定 1 名敌人'}
/* 技能类别术语 */
var _SKILL_TYPE_NAMES={attack:'攻击类',support:'辅助类',passive:'被动'}
/* 玩家技能 effect() 返回值的展示标签 */
var _EFFECT_LABELS={chance:'触发几率',critMult:'暴击伤害倍率',healPct:'回复比例（基于防御）',power:'威力倍率（基于魂攻）',
  targets:'目标数',cd:'冷却回合',reduce:'减伤比例',atkBoost:'全队攻击加成',dur:'持续回合',lock:'触发后锁',
  shieldPct:'护盾比例（攻+魂攻）',tauntDur:'嘲讽回合',soulDefDown:'降低魂防比例',freeze:'冰冻回合',ignoreSoulDef:'无视魂防'}
/* 天赋 hook → 人话触发时机 */
var _HOOK_LABELS={onBattleStart:'战斗开始时（仅一次）',onTurnStart:'自己回合开始',onTurnEnd:'自己回合结束',
  onBeforeAction:'自己行动前（可跳过行动）',onAfterAction:'自己行动后',onDamage:'伤害结算时（攻防双方都会问）',
  onAfterDamage:'自己造成伤害后',onBeforeStatus:'自己将被施加状态时',onAllyStatus:'友方将被施加状态时',
  onAllyDamage:'友方受到伤害时（可分担）',onBeforeHeal:'自己将被治疗时',onFoeHeal:'敌方被治疗时',
  onBeforeHit:'命中判定时',onBeforeCrit:'暴击判定时'}

/* 比例类数值 → 百分数；倍率类 → 保留两位 */
function fmtEffectVal(k,v){
  if(v==null||v==='')return '—'
  if(typeof v!=='number')return String(v)
  if(k==='chance'||k==='healPct'||k==='reduce'||k==='atkBoost'||k==='shieldPct'||k==='soulDefDown')return Math.round(v*100)+'%'
  if(k==='power')return (Math.round(v*100)/100)+'×'
  if(k==='critMult')return v.toFixed(2)+'×'
  return String(v)
}
/* 玩家技能 desc 的 n 占位符填充（v2.1.14：此前 skill-ui.js 用 replace('n',lv)，只替换了第一个 n） */
function fillPlayerSkillDesc(s,lv){
  if(!s)return ''
  return String(s.desc||'').replace(/n/g,String(lv))
}

/* 敌群技能详情（SKILLS + SKILL_DOCS） */
function showSkillDetail(skillId, unit){
  var s=(typeof SKILLS!=='undefined')?SKILLS[skillId]:null
  if(!s){toast('技能不存在','e');return}
  pauseGroupBattle()
  var cd=(unit&&typeof skillCooldownLeft==='function')?skillCooldownLeft(unit,skillId):0
  var doc=(typeof SKILL_DOCS!=='undefined'&&SKILL_DOCS[skillId])?SKILL_DOCS[skillId]:null
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">⚡ '+escHtml(s.name)+'</span>'
    +(unit?('<span class="det-sub">'+escHtml(unit.name)+'</span>'):'')
    +'</div>'
  h+='<div class="det-card"><div class="det-h">📋 基本信息</div>'
  h+=detRow('类别', _SKILL_TYPE_NAMES[s.type]||s.type)
  h+=detRow('目标', _SKILL_TARGET_NAMES[s.target]||s.target||'随机 1 名敌人')
  if(s.type==='attack'){
    h+=detRow('威力', (s.power||0)+'% '+(s.dmgType==='soul'?'魂攻':'攻击'))
    h+=detRow('伤害类型', s.dmgType==='soul'?'魂攻（吃目标魂防）':'物理（吃目标防御）')
  }
  h+=detRow('冷却', (s.cooldown||0)+' 回合'+(s.startCooldown?('（开场即进入 '+s.startCooldown+' 回合冷却）'):''))
  if(s.priority)h+=detRow('先制度', '+'+s.priority+'（出手队列中优先行动）')
  if(unit)h+=detRow('当前状态', cd>0?('冷却中，还需 '+cd+' 回合'):'就绪')
  h+='</div>'
  h+='<div class="det-card"><div class="det-h">📖 效果说明</div>'
  h+='<div class="det-line">'+escHtml(doc?doc.desc:'（该技能暂无说明文案）')+'</div>'
  if(doc&&doc.wip)h+='<div class="det-wip">⚠ 与设计文档不一致：'+escHtml(doc.wip)+'</div>'
  h+='</div>'
  _openDetailPanel(h)
}

/* 玩家技能详情（PLAYER_SKILLS）：当前等级真实数值 + 满级预览 + 升级花费
   restore：可选。从「技能培养」面板打开时传 renderSkillPanel，关闭后回到面板。 */
function showPlayerSkillDetail(skillId, unit, restore){
  var s=(typeof getPlayerSkill==='function')?getPlayerSkill(skillId):null
  if(!s){toast('技能不存在','e');return}
  pauseGroupBattle()
  var lv=(unit&&unit._playerSkills&&unit._playerSkills[skillId])
    ||((typeof getSkillState==='function'&&getSkillState().levels[skillId])||0)
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">⚡ '+escHtml(s.name)+'</span>'
    +(unit?('<span class="det-sub">'+escHtml(unit.name)+'</span>'):'')
    +'</div>'
  h+='<div class="det-card"><div class="det-h">📋 基本信息</div>'
  h+=detRow('类别', _SKILL_TYPE_NAMES[s.type]||s.type)
  h+=detRow('当前等级', 'Lv'+lv+' / '+s.maxLevel)
  h+='</div>'
  h+='<div class="det-card"><div class="det-h">📖 效果说明</div>'
  h+='<div class="det-line">'+escHtml(fillPlayerSkillDesc(s,lv))+'</div>'
  h+='<div class="det-line dim">（说明中的 n = 当前等级 '+lv+'）</div>'
  h+='</div>'
  var cur=(s.effect&&lv>0)?s.effect(lv):null
  var max=s.effect?s.effect(s.maxLevel):null
  if(cur||max){
    h+='<div class="det-card"><div class="det-h">📊 数值对比</div>'
    h+='<div class="det-kv head"><span class="det-k">项目</span><span class="det-v">Lv'+lv+'</span><span class="det-v2">Lv'+s.maxLevel+' 满级</span></div>'
    Object.keys(max||cur||{}).forEach(function(k){
      var a=(cur&&cur[k]!=null)?cur[k]:'—'
      var b=(max&&max[k]!=null)?max[k]:'—'
      h+='<div class="det-kv"><span class="det-k">'+escHtml(_EFFECT_LABELS[k]||k)+'</span><span class="det-v">'+escHtml(fmtEffectVal(k,a))+'</span><span class="det-v2">'+escHtml(fmtEffectVal(k,b))+'</span></div>'
    })
    h+='</div>'
  }
  var cost=(lv>=s.maxLevel)?0:((typeof skillUpgradeCost==='function')?skillUpgradeCost(s,lv):0)
  h+='<div class="det-card"><div class="det-h">⬆️ 升级</div>'
  h+='<div class="det-line">'+(lv>=s.maxLevel?('已满级（Lv'+s.maxLevel+'）'):('升到 Lv'+(lv+1)+' 需 '+cost+' 技能点 · 满级共需 '+((typeof skillTotalCost==='function')?skillTotalCost(s):'—')+' 点'))+'</div>'
  h+='<div class="det-line dim">技能点来自「挑战 → 敌群讨伐」胜利（与挑战数值独立）；月底技能等级减半</div>'
  h+='</div>'
  _openDetailPanel(h, restore)
}

/* 天赋详情（TALENTS）：说明 + 触发时机 + 配置 + 静态属性修正 */
function showTalentDetail(talentId, unit){
  var t=(typeof TALENTS!=='undefined')?TALENTS[talentId]:null
  if(!t){toast('天赋不存在','e');return}
  pauseGroupBattle()
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">✨ '+escHtml(t.name)+'</span>'
    +(unit?('<span class="det-sub">'+escHtml(unit.name)+'</span>'):'')
    +'</div>'
  h+='<div class="det-card"><div class="det-h">📖 说明</div>'
  h+='<div class="det-line">'+escHtml(t.desc||'（无说明）')+'</div></div>'
  var hooks=(t.hooks&&Object.keys(t.hooks))||[]
  h+='<div class="det-card"><div class="det-h">⏱ 触发时机</div>'
  if(!hooks.length)h+='<div class="det-dim">（纯属性被动，无时机钩子）</div>'
  else hooks.forEach(function(k){
    h+='<div class="det-line">· '+escHtml(_HOOK_LABELS[k]||k)+' <span class="det-dim">'+escHtml(k)+'</span></div>'
  })
  h+='</div>'
  if(t.config){
    h+='<div class="det-card"><div class="det-h">⚙️ 配置</div>'
    Object.keys(t.config).forEach(function(k){
      var v=t.config[k]
      h+='<div class="det-kv"><span class="det-k">'+escHtml(k)+'</span><span class="det-v">'+escHtml(Array.isArray(v)?v.join(' ~ '):String(v))+'</span></div>'
    })
    h+='</div>'
  }
  if(t.statMods){
    h+='<div class="det-card"><div class="det-h">📊 静态属性修正</div>'
    var sm=(typeof t.statMods==='function')?(unit?t.statMods(unit.base):null):t.statMods
    if(!sm)h+='<div class="det-line">按单位基础属性百分比计算，战斗开始时结算一次</div>'
    else Object.keys(sm).forEach(function(k){
      h+='<div class="det-kv"><span class="det-k">'+escHtml(k)+'</span><span class="det-v">'+(sm[k]>=0?'+':'')+sm[k]+'</span></div>'
    })
    h+='</div>'
  }
  h+='<div class="det-card"><div class="det-h">🔎 标识</div><div class="det-line dim">'+escHtml(talentId)+'</div></div>'
  _openDetailPanel(h)
}

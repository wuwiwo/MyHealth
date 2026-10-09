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
      /* v2.3.1：头像按「视觉原型」取（敌人的 189 个名字归纳为 18 个原型，
         详见 doc/design-monster-icons.md）。**带存在性守卫**——本函数在
         monster-archetype.js 未加载时（部分测试只加载子集）必须照常工作，
         退化成原来的纯文字卡片，而不是抛错炸掉整个关卡列表。 */
      const monIco=(typeof monsterIconHtmlByLevel==='function')
        ? '<span class="lv-ico">'+monsterIconHtmlByLevel(lv,32)+'</span>' : ''
      h+='<div class="lv-card'+(cleared?' done':'')+(isCur?' current':'')+(locked?' locked':'')+'" data-lv="'+lv.id+'"><div class="lv-num">'+lv.id+'</div>'+monIco+'<div class="lv-name">'+lv.npc+'</div><div class="lv-status '+(cleared?'done':isCur?'current':'locked')+'">'+(cleared?'✅ 已通关':isCur?'⚔️ 挑战中':locked?'🔒 未解锁':'⚔️ 可挑战')+'</div></div>'
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
var _petBattlePicks=[]   // 宠物参战选择（M4-6）；v2.2 WP-H1 起以存档 `dh-pets-v1.battlePicks` 为准
var _petBattlePicksLoaded=false   // v2.2 WP-H1：是否已从存档恢复过参战选择
var _groupMode='auto'   // 'auto' | 'manual'（manual=点一下推进一回合）
var _groupSpeed=1        // 1/2/4
var _groupAnimEl=null    // 动画中的单位
var _groupDetail=null    // 详情面板中的单位 id
var _gbTab='battle'      // v2.1.14：战斗页 / 日志页双 Tab（'battle' | 'log'）
var _groupPaused=false   // v2.1.14：打开详情时暂停自动推进，避免详情被下一步渲染刷掉
var _groupRewarded=false // v2.1.19：本次战斗是否已结算过奖励（防手动模式重复领取）
var _groupSeed=null      // v2.1.27 [7c]：本场战斗的随机种子（用于复现）

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

/* v2.2 WP-H1：首次使用时从存档恢复「参战宠物选择」（刷新/重开后保留）。
   ⚠️ game-render.js 在 index.html 里**比 pet-store.js 先加载**，故不能在顶层读取，
   延迟到运行时（首次渲染宠物面板 / 首次开战时调用一次）。
   顺带剔除已不存在的 speciesId（存档演进后的陈旧选择），避免永远带不上宠。 */
function ensurePetBattlePicksLoaded(){
  if(_petBattlePicksLoaded)return _petBattlePicks
  _petBattlePicksLoaded=true
  try{
    if(typeof getPetBattlePicks==='function'){
      var ids=getPetBattlePicks()
      var exist={}
      if(typeof getPetStore==='function'){
        (getPetStore().pets||[]).forEach(function(p){exist[p.speciesId]=true})
        ids=ids.filter(function(sid){return exist[sid]})
      }
      _petBattlePicks=ids
    }
  }catch(e){console.warn('[pet] 参战宠物选择恢复失败',e)}
  return _petBattlePicks
}

/* v2.2 WP-H2：玩家当前应打的小关 = allStageIds 里**第一个未通关**的关（线性解锁，故必为已解锁）。
   「带宠物开战」用它作目标关 —— 旧实现写死关卡（'g5'）且从不设置 `_groupStageId`，
   会把玩家直接扔进固定小关，并在胜利时把**上一次战斗的 `_groupStageId`** 记为通关 → 覆盖进度。 */
function currentGroupStageId(){
  var all=(typeof allStageIds==='function')?allStageIds():[]
  for(var i=0;i<all.length;i++){
    if(typeof isGroupStageCleared!=='function'||!isGroupStageCleared(all[i]))return all[i]
  }
  return all.length?all[all.length-1]:null
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
  /* WP-G：角色等级系统 —— 开战前先结算季度/周（幂等），再取等级效果 */
  if (typeof syncLevel === 'function') syncLevel()
  /* v2.4.0 改造 5：日志类型筛选每次开战重置为「全部」。
     ⚠️ 插入位置必须在 syncLevel() **之后** —— scripts/test-level-system.js 有一条
        「startGroupTrial 900 字符窗口内必须出现 syncLevel()」的源码级断言。 */
  _gbLogFilter='all'
  // v2.1.10：敌群是独立属性空间 —— 玩家只继承一定比例，避免裸属性把敌人压成 1 点
  var gs=(typeof inheritGroupStats==='function')?inheritGroupStats(stats):stats
  /* WP-G 落点：等级效果属**基础属性**加成，加在敌群继承（GROUP_INHERIT）**之后** →
     等级效果不参与继承折扣。⚠️ 敌群与普通战斗**同一口径**：作者裁决已删除
     lv2000 的「敌群战斗效果为2倍」→ 这里取的就是 playerLevelBonus(level)，没有任何倍率。
     lv1 时全部为 0 → 对既有战斗零影响。 */
  var _lb=(typeof playerLevelBonus==='function'&&typeof levelState==='function')
    ?playerLevelBonus(levelState().level)
    :{hp:0,atk:0,def:0,soulAtk:0,soulDef:0,spd:0,dmgDealtPct:0,dmgTakenPct:0}
  gs.atk+=_lb.atk; gs.def+=_lb.def; gs.hp+=_lb.hp
  var player=createUnit({id:'player',side:'ally',name:'🧑 你',level:1,base:{hp:gs.hp,atk:gs.atk,def:gs.def,spd:10+_lb.spd,soulAtk:(gs.soulAtk||0)+_lb.soulAtk,soulDef:(gs.soulDef||0)+_lb.soulDef}})
  /* WP-G：lv1000/1100 的「造成伤害 +5% / 受到伤害 −5%」是百分比修正（非基础属性），
     挂成单位级字段，由 battle-group 的 levelDamageAdjust() 在伤害结算处消费。 */
  player._levelDmgDealtPct=_lb.dmgDealtPct||0
  player._levelDmgTakenPct=_lb.dmgTakenPct||0
  // 挂载玩家技能（装备的技能生效）
  if (typeof attachPlayerSkills === 'function' && typeof getSkillState === 'function') {
    attachPlayerSkills(player, getSkillState())
  }
  /* 默认带宠物：优先存档里的参战选择（v2.2 WP-H1），否则自动带成熟宠物 */
  /* v2.2 WP-A3/A4：上限 2 → 4，并统一走 pet-store.js 的**唯一入口**
     buildGroupBattlePets（建单位 → 稀有度放大 → 团队凝聚 / 共鸣）。 */
  ensurePetBattlePicksLoaded()
  var _petMax = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4
  var petIds = (_petBattlePicks && _petBattlePicks.length) ? _petBattlePicks : autoPickPets(_petMax)
  var petUnits = (typeof buildGroupBattlePets === 'function')
    ? buildGroupBattlePets(petIds, _petMax)
    : createPetUnitsForBattle(petIds, _petMax)
  var allies = [player].concat(petUnits)
  var anchorG = String(stage ? String(groupId).split('-')[0] : groupId)
  // 锚定默认关闭（见 GROUP_ANCHOR.enabled），开启时按我方阵容反推敌人属性
  var cfgList = (typeof groupStageEnemies === 'function') ? groupStageEnemies(anchorG, glv, allies) : glv.enemies
  var enemies=cfgList.map(function(ec,i){
    /* v2.4.8（§8.5 第 14 条，作者裁定「修敌人词条死接线」）：**把固化词条真正传进去**。
       为什么必须在这里传：真实建场是唯一入口，而 `ec.affixes` 是 `group-levels.js` 的
       genEnemyCfg 按本关种子固化的词条（Boss = cut_boss + 2 条，精英 = cut_elite + 1 条）——
       它是**唯一权威来源**，此处只做「传递」，不另造一套。
       修前这一行没有 `affixes` 字段 → createEnemyUnit 走兜底（又被覆盖清空）→
       线上 Boss/精英 **一件词条都没有**（伤害减免/抗扩散/抗技法/战意高涨/铁壁/终末宣告/疾影全失效）。 */
    return createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base,level:ec.level,affixes:ec.affixes})
  })
  // v2.1.13 场地：每个大关一个主题场地（g3 起）
  var lgNum = parseInt(String(anchorG).replace(/[^0-9]/g, ''), 10) || 1
  var terrain = (typeof groupTerrainFor === 'function') ? groupTerrainFor(lgNum) : null
  if (terrain) toast('🌍 场地：' + terrain.name + '（对敌我双方均有效，点界面上的 🌍 可随时查看）', 's')
  /* v2.1.27 [7c]：给本场一个种子，使战斗可复现 / 可回退 */
  _groupSeed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
  _groupBattle=createGroupBattle({allies:allies,enemies:enemies,terrain:terrain,seed:_groupSeed})
  /* v2.1.27 [7d]：初始快照（重放 / 时间旅行的起点） */
  try {
    window.__groupSnaps = []
    window.__groupInitSnap = (typeof groupSnapshot === 'function') ? groupSnapshot(_groupBattle) : null
  } catch (e) { console.warn('[group] 初始快照失败，时间旅行将不可用', e); }
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
  /* v2.1.27 [7d]：每步前存一份快照（环形，最多 30 份） */
  try {
    if (typeof groupSnapshot === 'function' && window.__groupSnaps) {
      window.__groupSnaps.push({ t: _groupBattle.turn, snap: groupSnapshot(_groupBattle) })
      if (window.__groupSnaps.length > 30) window.__groupSnaps.shift()
    }
  } catch (e) { console.warn('[group] 存快照失败', e); }
  var _perfT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  var step = groupBattleStep(_groupBattle)
  /* v2.1.26 [7b]：群战单步耗时埋点，供 Debug 面板「⏱ 性能」分区读取 */
  try { if (typeof window.__perfMarkStep === 'function') {
    window.__perfMarkStep(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _perfT0);
  } } catch (e) { console.warn('[perf] 埋点失败', e); }
  // 高亮当前行动单位
  if (step.unit) _groupActing = step.unit.id
  renderGroupOverlay(false)
  // 攻击反馈动画：解析本次行动的日志，高亮受击目标 + 伤害飘字
  if (step.unit) playAttackFeedback(_groupBattle, step)
  if(_groupBattle.done){_groupDone();return}
  // 技能气泡 → v2.4.2 起并入中央特效区的施法特效（图标 + 一句话），见 gbShowSkillCast
  var lastLog = _groupBattle.log.length ? _groupBattle.log[_groupBattle.log.length-1] : null
  var bubble = lastLog ? lastLog.events.find(function(e){ return e.type==='bubble'; }) : null
  if (bubble) {
    gbShowSkillCast(_groupBattle, bubble)
    if (_groupMode==='manual') return
    _groupTimer=setTimeout(_groupStep,900/_groupSpeed)   // 气泡停顿
    return
  }
  if(_groupMode==='manual')return   // 手动：等用户点下一回合
  // 每个单位行动间隔（看清速度顺序）
  _groupTimer=setTimeout(_groupStep,700/_groupSpeed)
}

/* ============================================================
   v2.4.0 改造 3：打击特效（#gbFx 特效层 + 飘字解析）

   为什么不把飘字挂在单位卡上（旧实现就是这么干的）：
   `renderGroupOverlay()` 每步 `innerHTML` 重建整个 overlay，而飘字生存期 900ms——
   ×1 步间隔 700ms 就已经会把它清掉，×4/×8 只有 175/87ms，**必然被清掉**。
   故特效只挂固定层 `#gbFx`（fixed + pointer-events:none），用卡片的
   `getBoundingClientRect()` 取屏幕坐标定位 —— 卡片重建不影响已生成的飘字。

   解析口径**唯一来源**是任务书第 2 节的「引擎日志速查表」（禁凭想象造句）：
     damage  → `→ N 伤害` / `→ N 魂伤害`（普攻/技能/蓄力/魂攻）、`反伤 N`、`反冲 -N`、`牺牲自我 -N`
     dot     → `-N`（中毒 / 附身侵蚀 / 末日 / 遗言）
     terrain → `受碎石伤害 N` / `被闪电击中 N`
     heal    → `+N`（治疗 / 技能吸血 / 自愈 / 战意吸血 / 睡眠回复）
     status  → 护盾吸收等一律**不出飘字**（吸收不是伤害）
   暴击判定：文案里没有「暴击」二字，故只能看**同一 events 数组里紧邻的前一个**事件
   （引擎写日志的顺序固定为「先 💥 暴击！×N，再写伤害事件」）。
   ============================================================ */
var GB_FX_LIFE=900   /* 飘字生存期（ms）——与 @keyframes floatUpC 的 .9s 对齐 */

/* 引擎日志正则（改引擎文案必须同步改这里；纯函数 gbParseHit 是唯一消费点）
   ⚠️ 伤害数字必须取**最后一组**：`dmg` 的 `(.+?)` 是目标名，数字在 `(\d+)`。
      两种句式都要吃 ——
        · 普攻/魂攻：目标在箭头**前**  `⚔️ 剑士 攻击 魔像 → 1218 伤害`（箭头后直接是数字）
        · 技能/蓄力：目标在箭头**后**  `⚡ Boss 暴风雪 → 🧑 你 189 伤害`
      只写任务书速查表那一条 `→\s+(.+?)\s+(\d+)\s+伤害` 会**漏掉全部普攻与魂攻**
      （实测：`攻击 魔像 → 1218 伤害` 与 `魂攻击 B → 88 魂伤害` 都不匹配）。 */
var GB_HIT_RX={
  dmgSkill:/→\s+(.+?)\s+(\d+)\s+(?:魂)?伤害/,        /* 技能/蓄力：数字在目标名之后（取 group 2） */
  dmgPlain:/→\s+(\d+)\s+(?:魂)?伤害/,                 /* 普攻/魂攻：数字紧跟箭头（取 group 1） */
  rock:/受碎石伤害\s+(\d+)/,                          /* 🪨 B 受碎石伤害 40 */
  bolt:/被闪电击中\s+(\d+)/,                          /* ⚡ B 被闪电击中 55 */
  reflect:/反伤\s+(\d+)/,                             /* 🩸 B 粗糙皮肤 → A 反伤 5 */
  reflectNamed:/反伤\s+\S+\s+(\d+)/,                  /* 🛡️ 金身护盾被击破 → 反伤 A 12（带名字的变体） */
  recoil:/反冲\s+-(\d+)/,                             /* 💥 A 三连 反冲 -30（…） */
  selfsac:/牺牲自我\s+-(\d+)/,                        /* 🌀 A 迷惑 → 牺牲自我 -12 */
  dot:/-(\d+)\s*$/,                                   /* ☠️ 中毒: -12 */
  heal:/\+\s*(\d+)/,                                  /* 💚 A → B 治疗 +120 / 🩸 技能吸血 +30 */
  shield:/护盾吸收\s+(\d+)/                           /* 🛡️ B 护盾吸收 30（不计伤害、不出飘字） */
}

/* 单条事件 → {amount, kind, crit}；不是可飘字事件返回 null。
   ⚠️ **按 e.type 分派**，不是只认 damage —— dot / terrain / heal 全在别的 type 上。 */
function gbParseHit(e, prevEvent){
  if(!e||!e.msg)return null
  var t=e.type||'', m=e.msg, r
  if(t==='heal'){
    r=GB_HIT_RX.heal.exec(m)
    return r?{amount:Number(r[1]),kind:'heal',crit:false}:null
  }
  if(t==='terrain'){
    r=GB_HIT_RX.rock.exec(m)||GB_HIT_RX.bolt.exec(m)
    return r?{amount:Number(r[1]),kind:'terrain',crit:false}:null
  }
  if(t==='dot'){
    r=GB_HIT_RX.dot.exec(m)
    return r?{amount:Number(r[1]),kind:'dot',crit:false}:null
  }
  if(t!=='damage')return null
  if(GB_HIT_RX.shield.test(m))return null      /* 护盾吸收：不是伤害 */
  var crit=!!(prevEvent&&prevEvent.msg&&/暴击/.test(prevEvent.msg))
  r=GB_HIT_RX.reflect.exec(m)||GB_HIT_RX.reflectNamed.exec(m)
  if(r)return {amount:Number(r[1]),kind:'reflect',crit:crit}
  r=GB_HIT_RX.recoil.exec(m)||GB_HIT_RX.selfsac.exec(m)
  if(r)return {amount:Number(r[1]),kind:'recoil',crit:crit}
  /* 技能/蓄力先试（数字在名字之后），再试普攻/魂攻（数字紧跟箭头） */
  r=GB_HIT_RX.dmgSkill.exec(m)
  if(r)return {amount:Number(r[2]),kind:'dmg',crit:crit}
  r=GB_HIT_RX.dmgPlain.exec(m)
  if(r)return {amount:Number(r[1]),kind:'dmg',crit:crit}
  return null
}

/* 特效层（懒建、挂 body；fixed + inset:0 → 子元素坐标即视口坐标） */
function gbFxLayer(){
  var el=(typeof document!=='undefined')?document.getElementById('gbFx'):null
  if(el)return el
  if(typeof document==='undefined'||!document.body||typeof document.createElement!=='function')return null
  el=document.createElement('div')
  el.id='gbFx'
  el.setAttribute('aria-hidden','true')
  el.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:56'
  document.body.appendChild(el)
  return el
}
/* 清空特效层（#gbClose 与 renderGroupOverlay 都调 —— 否则打完还飘着上一场的数字）
   v2.4.2：施法特效也挂在 #gbFx 上，只清 innerHTML 会漏掉对它的引用（见 gbCastClear）。
   v2.8.0：一并复位「飘字槽位序号」与「受击闪烁记忆」—— 两者都是**跨步**状态，不清会把上一场的
   槽位/闪烁带到下一场（表现为新战斗开局就带着旧闪光、飘字从第 N 槽开始）。 */
/* ============================================================
   v2.10.1（作者裁决 6「做」）：**跨步飘字占位登记**
   ------------------------------------------------------------
   v2.8.1 的槽位只保证「下一步不会立刻重用同一槽」，但整组下移/换槽仍可能落进**上一批仍在
   900ms 生存期内**的飘字带 —— 独立浏览器夹具实测最差 live 重叠 **1136px²**。
   做法：维护「仍在场的飘字」登记表 `_gbFxLive`（元素 + 步骤号 + 到期时间）；新飘字放置时与
   **前序步骤**的存活飘字求交，冲突就换位（先原列向下换行，再左右换列）。
   ⚠️ **同一步内不参与占位** —— 同一步的排布由 §13 的逐像素契约与 §19 的网格负责，
      跨步占位若也管同一步，会把「4 条槽位错位」的既有坐标改掉（那是明确的契约，不能动）。
   ⚠️ 占位用的是**整段动画轨迹**（上浮 34px + 盒高 30px），不是只比静态点 —— 数字在上浮过程中
      穿过别人的位置也算重叠（独立夹具量的就是 live 相交）。 */
var _gbFxLive = [];   /* [{el, step, until}] —— 仍在场（GB_FX_LIFE 内）的飘字 */
var _gbFxStep = 0;    /* 当前步骤号：只有**前序**步骤的飘字参与占位 */
function _gbFxPruneLive(now) {
  for (var i = _gbFxLive.length - 1; i >= 0; i--) {
    var e = _gbFxLive[i];
    if (!e || !e.el || e.until <= now || !e.el.parentNode) _gbFxLive.splice(i, 1);
  }
}
function _gbFxBoxOf(entry) {
  var el = (entry && entry.el) ? entry.el : entry;
  if (!el || !el.style) return null;
  var l = parseFloat(el.style.left), t = parseFloat(el.style.top);
  /* 真实 DOM 由 cssText 解析出 style.left/top；测试桩只写 cssText，故补一条兜底解析
     （纯读取，不改变任何行为 —— 也让这条逻辑在无 DOM 的桩里可验证）。 */
  if (isNaN(l) || isNaN(t)) {
    var m = /left:(-?[0-9.]+)px;top:(-?[0-9.]+)px/.exec((el.style && el.style.cssText) || '');
    if (m) { l = parseFloat(m[1]); t = parseFloat(m[2]); }
  }
  if (isNaN(l) || isNaN(t)) return null;
  /* 占用带 = [top − 上浮 34, top + 盒高]。盒尺寸**按条目存**（暴击飘字更大），
     默认 70×30 来自独立夹具实测；第一条量到 108px² 的残余重叠正是低估暴击盒高所致。 */
  var w = (entry && entry.w) ? entry.w : 70;
  var h = (entry && entry.h) ? entry.h : 30;
  return { l: l - w / 2, r: l + w / 2, t: t - 34, b: t + h };
}
function _gbFxCollides(box, step, now) {
  for (var i = 0; i < _gbFxLive.length; i++) {
    var e = _gbFxLive[i];
    if (!e || e.until <= now) continue;
    if (e.step === step) continue;          /* 同一步内不互斥（见上方说明） */
    var b = (e.el && e.el.parentNode) ? _gbFxBoxOf(e) : null;
    if (!b) continue;
    if (Math.min(box.r, b.r) - Math.max(box.l, b.l) > 0 && Math.min(box.b, b.b) - Math.max(box.t, b.t) > 0) return true;
  }
  return false;
}
/* 找落点：原列向下换行（行距 34）→ 左右换列（列距 92）→ 兜底回原位 */
function _gbFxFindFreeSpot(x0, y0, step, now, w, h) {
  w = w || 70; h = h || 30;
  var xs = [x0, x0 + 92, x0 - 92, x0 + 184, x0 - 184];
  var maxY = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight - 40 : 1e9;
  var maxX = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth - 36 : null;
  for (var xi = 0; xi < xs.length; xi++) {
    var x = Math.round(xs[xi]);
    if (maxX !== null) x = Math.max(36, Math.min(maxX, x));
    for (var r = 0; r < 8; r++) {
      var y = Math.round(y0 + r * 34);
      if (y > maxY) break;
      if (!_gbFxCollides({ l: x - w / 2, r: x + w / 2, t: y - 34, b: y + h }, step, now)) return { x: x, y: y };
    }
  }
  return { x: Math.round(x0), y: Math.round(y0) };   /* v2.11.2 回退：找不到空位就落回基准位（不驱逐） */
}

function gbFxClear(){
  var el=(typeof document!=='undefined')?document.getElementById('gbFx'):null
  gbCastClear()
  if(el)el.innerHTML=''
  _gbFxSlotSeq=0
  _gbHitUntil={}
  _gbHpSeen={}
  _gbFxLive=[]
  _gbFxStep=0
}

/* ============================================================
   v2.8.0：群战表现层的**跨步状态**（纯展示，引擎零影响）
   ------------------------------------------------------------
   ① HP 过渡：`renderGroupOverlay` 每步重建 `ov.innerHTML` → 每个 HP 条都是**新节点**，
      浏览器的 `transition:width` 没有「起始值」可比，于是**从不补间**（一直是跳变）。
      做法：重建后把每个 HP 条先写回**上一帧的百分比**，强制一次 reflow 让它成为起始状态，
      再在下一帧改成新值 → CSS 过渡正常补间。节点仍然每步重建，但**视觉上过渡始终可见**。
   ② 受击闪烁：`.gb-hit` 加在**本步的新节点**上，下一步重建就会把它连同节点一起丢掉 ——
      速度越高步进越密（×8 ≈ 87ms），闪烁在被看见之前就没了。做法：记住「谁被打了、闪到什么时候」，
      每次重建后按记忆**重新挂上**该类（时间窗随速度档位放大）。
   ③ 飘字槽位：原先每步把 slot 从 0 重排 → 连续两步的飘字会叠在同一槽。做法：槽位序号跨步累加，
      只在清场（gbFxClear）时归零。 */
var _gbFxSlotSeq=0;      /* ③ 飘字槽位：跨步累加，避免连续两步叠在同一槽 */
var _gbHitUntil={};      /* ② 受击闪烁：unitId → 到期时间戳（毫秒） */
var _gbHpSeen={};        /* ① HP 条上一帧百分比：unitId → pct */

/* 闪烁时间窗：至少 300ms，且不短于**当前速度档位下约 3 步**（×8 时约 261ms → 取 300ms；
   ×1 时 3 步 1800ms，但 300ms 足够看清，故用 max(300, 3×步长) 但上限 900ms）。 */
function gbHitFlashMs(){
  var step=(typeof battleStepDelay==='function')?battleStepDelay(600,_groupSpeed):600
  return Math.max(300,Math.min(900,step*3))
}
/* ①+②：一次后处理 —— 让 HP 条从上一帧补间到本帧，并把仍在窗口内的受击闪烁重新挂上 */
function gbApplyStepTransitions(ov,gb){
  if(!ov||!ov.querySelectorAll)return
  var now=(typeof Date!=='undefined'&&Date.now)?Date.now():0
  /* ① HP 补间（战场芯片 + 顶部总览条） */
  var fills=ov.querySelectorAll('.gb-unit[data-uid] > .gb-hp-wrap > .gb-hp-fill')
  for(var i=0;i<fills.length;i++){
    var fill=fills[i]
    var chip=fill.parentNode&&fill.parentNode.parentNode
    var uid=chip&&chip.getAttribute?chip.getAttribute('data-uid'):null
    if(!uid)continue
    var newPct=parseFloat(fill.style.width)
    if(isNaN(newPct))continue
    var prevPct=_gbHpSeen[uid]
    if(prevPct!=null&&prevPct!==newPct){
      fill.style.width=prevPct+'%'        /* 起始状态 = 上一帧 */
      void fill.offsetWidth               /* 强制 reflow，让浏览器记住这个起点 */
      var setTo=newPct
      var f2=fill
      var raf=(typeof requestAnimationFrame==='function')?requestAnimationFrame:function(cb){return setTimeout(cb,16)}
      raf(function(){ f2.style.width=setTo+'%' })
    }
    _gbHpSeen[uid]=newPct
  }
  var ovw=ov.querySelectorAll('.gb-ovw-bar > i')
  for(var k=0;k<ovw.length;k++){
    var bar=ovw[k]
    var key='__ovw'+k
    var np=parseFloat(bar.style.width)
    if(isNaN(np))continue
    if(_gbHpSeen[key]!=null&&_gbHpSeen[key]!==np){
      bar.style.width=_gbHpSeen[key]+'%'
      void bar.offsetWidth
      ;(function(b2,v){var raf=(typeof requestAnimationFrame==='function')?requestAnimationFrame:function(cb){return setTimeout(cb,16)};raf(function(){b2.style.width=v+'%'})})(bar,np)
    }
    _gbHpSeen[key]=np
  }
  /* ② 受击闪烁：仍在时间窗内 → 在新节点上重新挂类 */
  var chips=ov.querySelectorAll('.gb-unit[data-uid]')
  for(var j=0;j<chips.length;j++){
    var c=chips[j]
    var id=c.getAttribute?c.getAttribute('data-uid'):null
    if(!id)continue
    var until=_gbHitUntil[id]
    if(until&&until>now){
      c.classList.add('gb-hit')
      ;(function(el,left){setTimeout(function(){ if(left>0)return; el.classList.remove('gb-hit') },Math.max(0,until-now))})(c,0)
    }
  }
}

/* 伤害色阶：按**目标最大生命**百分比（目标取 e.targetId → gb.units）
   <5% 白 --text / 5%~20% 黄 --yellow / >20% 红 --red；字号 --fs-2xl，暴击再上一档 --fs-3xl */
function gbHitColor(gb, e, amount){
  var u=null
  if(e&&e.targetId&&gb&&gb.units){
    for(var i=0;i<gb.units.length;i++){ if(gb.units[i].id===e.targetId){u=gb.units[i];break} }
  }
  var maxHp=(u&&u.base&&u.base.hp)?u.base.hp:0
  if(!(maxHp>0))return 'var(--red)'      /* 目标查不到（场地事件无 targetId）→ 按重击处理 */
  var pct=Number(amount)/maxHp
  if(pct<0.05)return 'var(--text)'
  if(pct<=0.20)return 'var(--yellow)'
  return 'var(--red)'
}

/* 从事件文案里抠受击目标名（场地事件没有 targetId，只能从文案取） */
function gbEventTargetName(e){
  if(!e||!e.msg)return null
  var m=/攻击\s+(.+?)\s*→/.exec(e.msg)||/→\s+(.+?)\s+\d+\s+(?:魂)?伤害/.exec(e.msg)
  if(m)return m[1].trim()
  var t=/(?:受碎石伤害|被闪电击中)/.exec(e.msg)
  if(t){var pre=gbStripLeadEmoji(e.msg.slice(0,t.index));if(pre)return pre}
  return null
}

/* 事件 → 单位卡（优先 targetId；场地事件退回文案里的名字）

   v2.4.2 修复一个**已实际失效**的回退分支：
   旧实现用 `cards[i].textContent.indexOf(name)` 去匹配，而芯片名字现在最多显示 4 字
   （`精英·狂战` → 芯片文字 `精英·狂`、`Boss·暗龙` → `Boss`）→ 完整名永远 indexOf 不到，
   场地事件（`受碎石伤害` / `被闪电击中`，日志里**没有 targetId**）因此不再有受击高亮。
   现在按**完整名字**精确匹配：芯片在 renderGroupUnit 里带了 `data-name="完整名"`。
   ⚠️ 两个细节不能省：
     ① 两边都要 gbStripLeadEmoji —— 场地事件文案里抠出来的名字**不带**前导 emoji
        （`🪨 🧑 你 受碎石伤害 40` → 抠出 `你`），而 data-name 是 `🧑 你`；
        这与 gbUnitIndex 的 byShort 索引是同一套口径。
     ② 不要再退回「拿显示文字 indexOf」—— 显示文字是截断后的，判据本身就是错的。 */
function gbCardForEvent(ov, gb, e){
  if(!ov)return null
  if(e&&e.targetId){
    var c=ov.querySelector('.gb-unit[data-uid="'+e.targetId+'"]')
    if(c)return c
  }
  var name=gbEventTargetName(e)
  if(!name)return null
  var key=gbStripLeadEmoji(name)
  var cards=ov.querySelectorAll('.gb-unit')
  for(var i=0;i<cards.length;i++){
    var el=cards[i]
    var full=(el.getAttribute&&el.getAttribute('data-name'))||''
    if(full&&(full===name||full===key||gbStripLeadEmoji(full)===key))return el
    /* 兜底：万一将来有别的渲染路径产出不带 data-name 的 .gb-unit。
       ⚠️ 完整名的 title 在**子元素 .gb-name** 上（根节点只有 aria-label="<完整名> 详情"），
          读根节点的 title 会恒为空 —— 这里必须下钻一层。 */
    var nmEl=(el.querySelector?el.querySelector('.gb-name'):null)
    var tt=(nmEl&&nmEl.getAttribute&&nmEl.getAttribute('title'))||''
    if(tt&&(tt===name||tt===key||gbStripLeadEmoji(tt)===key))return el
  }
  return null
}

/* 飘字：居中定位（left/top 已含 translateX(-50%) 的对齐基准，见 .gb-fx-float 与 floatUpC）

   v2.4.2：第一个参数 el 的语义从「单位卡」变成「**中央特效区元素**」（#gbArenaMid）——
   ⚠️ 函数签名与「函数体内出现 getBoundingClientRect」都是既有断言，不得改名/不得换写法。
   第 5 参 slot 是**同一步内多条飘字的错位槽位**（0/1/2/3）：
   同一步的几条飘字锚在**同一个**中央区矩形上，不错位就会完全叠成一坨
   （×1 时步间隔 700ms、飘字生存期 900ms —— 上一条还没飞完，下一条就落下来了）。
   ⚠️ 不传 slot（或传 0）时行为与加槽位之前**逐像素一致**（测试只查签名，不受影响）。
   ⚠️ 错位只能用 left/top 表达：transform 已被 floatUpC 的每一帧占用（见 index.css 的说明），
      用 transform 错位会被关键帧覆盖掉。 */
/* v2.11.1（残留 A）：横向从 ±46 加宽到 **±78** —— 飘字盒宽 70px，±46 时相邻槽横向只差 46px、
   必然重叠（独立夹具实测相邻槽 288px²）。±78 > 70 后四槽两两不叠（纵向偏移保留，防同列叠字）。 */
var GB_FX_SLOT_OFF=[[0,0],[-78,-18],[78,-18],[0,-70]]   /* 中 / 左上 / 右上 / 正上 —— 加宽版（含上浮 34 的占用带要求同列 |Δy| ≥ 64） */
/* ============================================================
   v2.11.0（评审根因 1+2，见 doc/review-battle-fx-2026-10-07.md）
   ------------------------------------------------------------
   根因 1：演出生命周期固定（飘字/施法 900ms），而速度档位只压缩**事件间隔** →
   同时在场批次 = 900 / 步进 = ×1 1.29 / ×2 2.57 / ×4 5.14 / ×8 约 9~10 批（实测口径）。
   修法：把演出生命周期与**演出窗口**显式绑定，并按档位聚合——
     · ×1：逐事件、生命期仍接近 900ms（不牺牲慢速观感）；
     · ×2：开始**聚合同目标**同类事件（同一步多次打同一目标 → 一条数字，数值为和）；
     · ×4/×8：生命期收到约 1~2 个步进，受击闪烁也随之收窄到约 1 个窗口。
   ⚠️ 聚合只影响**表现**：引擎的日志/伤害/胜负一字不改（presentation-only，已由固定种子逐字节比对守住）。 */
/* v2.11.1（评审根因 3）：状态 / 护盾类事件**即时语义标记**。
   背景：`gbParseHit` 只认 damage/heal/terrain/dot，对 `type:'status'` 直接返回 null →
   护盾吸收、护盾破碎、破甲、中毒、冰冻、潮湿、睡眠、嘲讽、净化、末日、幽魂附身等**全都没有即时反馈**，
   玩家只能去战报里找（评审实测确认）。
   ⚠️ 用**显式小表**匹配已知文案，**匹配不到就什么都不出**（不猜、不造噪声）。
   标记同样走 gbFxFloat → 一起参与目标锚定、跨步占位与档位生命期。 */
var GB_FX_MARKS=[
  [/护盾吸收 (\d+)/, function(m,msg){ return '🛡️' + m[1] + (/护盾破碎/.test(msg) ? '💥' : '') }],
  [/护盾破碎/, function(){ return '🛡️💥' }],
  [/破甲/, function(){ return '💠' }],
  [/中毒|☠️/, function(){ return '☠️' }],
  [/冰冻|❄️/, function(){ return '❄️' }],
  [/潮湿|变潮湿/, function(){ return '💧' }],
  [/睡眠|哈欠|😴/, function(){ return '😴' }],
  [/嘲讽/, function(){ return '😡' }],
  [/净化|清除迷雾/, function(){ return '✨' }],
  [/末日|🌑/, function(){ return '🌑' }],
  [/幽魂附身|👻/, function(){ return '👻' }],
  [/威吓|😱/, function(){ return '😱' }],
  [/变小/, function(){ return '🔻' }],
  [/蓄力/, function(){ return '⏳' }]
];
/* 事件 → 标记文本（匹配不到返回 null；已被 gbParseHit 处理的伤害/治疗不再重复出标记） */
function gbMarkerFor(e, parsed){
  if (!e || parsed) return null;
  var msg = e.msg || '';
  if (!msg) return null;
  if (e.type && e.type !== 'status' && e.type !== 'talent' && e.type !== 'terrain') return null;
  for (var i = 0; i < GB_FX_MARKS.length; i++) {
    var m = GB_FX_MARKS[i][0].exec(msg);
    if (m) return GB_FX_MARKS[i][1](m, msg);
  }
  return null;
}

function gbFxPolicy(speed) {
  var sp = speed || _groupSpeed || 1;
  var step = (typeof battleStepDelay === 'function') ? battleStepDelay(700, sp) : Math.round(700 / sp);
  if (sp <= 1) return { speed: 1, stepMs: step, lifeMs: 900, aggregate: false, flashMs: 900, castText: true };
  if (sp <= 2) return { speed: 2, stepMs: step, lifeMs: 700, aggregate: true, flashMs: 600, castText: true };
  if (sp <= 4) return { speed: 4, stepMs: step, lifeMs: 340, aggregate: true, flashMs: 260, castText: false };
  return { speed: 8, stepMs: step, lifeMs: 210, aggregate: true, flashMs: 160, castText: false };
}

function gbFxFloat(card, text, color, big, slot, inStep, anchorX, lifeMs){
  var layer=gbFxLayer()
  if(!layer||!card||typeof card.getBoundingClientRect!=='function')return
  var r
  try{ r=card.getBoundingClientRect() }catch(e){ console.warn('[group] 飘字定位失败',e); return }
  if(!r||!r.width)return
  var i=(typeof slot==='number'&&slot>0)?slot:0
  var n=(typeof inStep==='number'&&inStep>0)?inStep:1
  /* v2.8.1（E + C）：**≤4 条且无施法特效时保持 v2.4.2 的原布局**（位置逐像素不变，
     见 test-group-ui-presentation §13 的坐标断言）；只有下面两种情形才启用新排布：
       · **本步 >4 条**（独立夹具实测真实引擎单步最多 10 条，而原实现只有 4 条道、
         `slot4 ≡ slot0` → 步内两两相交 371 对/max 1200px²）→ 改 4 列 × 多行网格：
         列距 92px > 飘字盒宽（≈70px）、行距 34px > 盒高（≈30px），行**向下**排（远离施法区）。
       · **有施法特效在场**（`_gbCastEl`）→ 整组下移到特效下方：原实现两者同在中央区
         （特效占 0.28、飘字占 0.80）而飘字动画还要上浮 34px，实测相交最大 1737px²。 */
  var off=GB_FX_SLOT_OFF[i%4]
  /* v2.11.0（根因 2）：有**显式横向锚点**（目标芯片中心 x）时用它当基线，且**不再叠加横向槽位偏移** ——
     横向位置从此是「谁挨打」的语义信息，不能再被槽位错位打乱（只保留纵向错位防同目标叠字）。 */
  var anchored=(typeof anchorX==='number'&&!isNaN(anchorX));
  var baseX=anchored?anchorX:(r.left+r.width/2);
  var x, y, minY
  if(n>4){
    var col=i%4, row=Math.floor(i/4)
    x=baseX+(col-1.5)*92
    y=r.top+r.height*0.8+row*34
    minY=0
  }else{
    x=anchored?baseX:(baseX+off[0])
    y=r.top+r.height*0.8+off[1]
    minY=-70   /* slot3 的纵向偏移（GB_FX_SLOT_OFF 里最靠上的一档） */
  }
  /* 施法特效在场：把**整组**下移（按组内最靠上的那一档算），而不是逐条 max —
     逐条 max 会让同 x 的 slot0/slot3 collapse 到同一 y 上再叠一次。上浮 34px + 6px 余量 = 40。 */
  if(_gbCastEl){
    var cb=null
    try{ cb=_gbCastEl.getBoundingClientRect() }catch(e2){ cb=null /* 忽略：取不到特效 rect 就按「无施法特效」排布，不阻断飘字 */ }
    if(cb&&cb.bottom){
      var need=cb.bottom+40
      var topMost=r.top+r.height*0.8+minY     /* 组内最靠上那条的 y（未移位前） */
      if(topMost<need) y+=(need-topMost)      /* 整组按同一量下移，保持组内相对错位 */
    }
  }
  var el=document.createElement('div')
  el.className='gb-fx-float'+(big?' big':'')
  el.textContent=text
  /* v2.4.2：飘字与施法特效同在中央区，会互压（--gb-mid-h 只有 15vh）→ 上下分层：
     施法特效占中央区**上 28%**、飘字占**下 80%**（都按中央区自身 rect 取比例，日志展开
     压成 8vh 时按比例一起缩，不会跑到区外）。留白硬约束见 gbShowSkillCast。 */
  /* v2.10.1（裁决 6）：与**前序步骤**仍在场的飘字求交，冲突就换位（同一步内不动） */
  var _fxNow=(typeof Date!=='undefined'&&Date.now)?Date.now():0;
  _gbFxPruneLive(_fxNow);
  /* 盒尺寸按**动画最大时刻**取：floatUpC 的 25% 帧有 scale(1.12)，live 盒比静态大 12% ——
     按静态尺寸占位会留下约 108px² 的瞬时残余（独立夹具实测到的那一档）。故统一放大 15%。 */
  var _bw=(big?96:70)*1.15, _bh=(big?40:30)*1.15;
  var _spot=_gbFxFindFreeSpot(x,y,_gbFxStep,_fxNow,_bw,_bh);
  /* v2.11.2：**回退 v2.11.1 的「空位兜底驱逐」** —— 它在真实浏览器里让跨步 live 重叠
     从 108px² 涨到 660px²（四种尝试里唯一让指标变差的）。这里恢复「找不到空位就落回基准位」，
     宁可重叠也不误删仍在阅读的旧数字。 */
  if (!_spot) _spot = { x: x, y: y };
  x=_spot.x; y=_spot.y;
  el.style.cssText='left:'+Math.round(x)+'px;top:'+Math.round(y)+'px'
    +';color:'+color+';font-size:'+(big?'var(--fs-3xl)':'var(--fs-2xl)')
  var life=(typeof lifeMs==='number'&&lifeMs>0)?lifeMs:GB_FX_LIFE;   /* v2.11.0：演出窗口驱动的生命期 */
  if (el.style) el.style.animationDuration = life + 'ms';            /* 动画与生命期同步，避免被截断 */
  layer.appendChild(el)
  _gbFxLive.push({ el: el, step: _gbFxStep, until: _fxNow + life, w: _bw, h: _bh })
  setTimeout(function(){ if(el&&el.parentNode&&el.parentNode.removeChild)el.parentNode.removeChild(el) },life)
}

/* 攻击反馈动画：解析本次行动的日志，受击目标闪烁 + 伤害/治疗飘字（全部挂 #gbFx）

   v2.4.2：飘字锚点从「单位芯片」改成**中央特效区** `#gbArenaMid`（数字不再贴在芯片旁边）；
   但「谁挨打了」不能丢 —— 受击目标**仍然闪芯片**（.gb-hit），只是不再在芯片旁出数字。
   中央区理论上必然存在（renderGroupBattlePane 固定产出）；真缺了就如实告警并**不出飘字**，
   绝不因此抛错中断战斗推进（这条路径在自动推进里，抛错会直接卡死整场）。 */
/* v2.11.5（作者裁决 B）：**抽屉态芯片徽标**。
   抽屉展开时中央特效区被压到 8vh，飘字不能再放；但状态/护盾这类关键结果仍要看得见 ——
   挂到**目标芯片自身**（`.gb-unit` 是 position:relative），因此落在广场条带里、不压日志正文。
   生命期沿用档位策略（与中央飘字同一口径），到点自行移除。 */
function showChipBadge(card, text, lifeMs) {
  if (!card || !text || typeof card.appendChild !== 'function') return
  var el = document.createElement('div')
  el.className = 'gb-chip-mark'
  el.textContent = text
  card.appendChild(el)
  var life = (typeof lifeMs === 'number' && lifeMs > 0) ? lifeMs : 900
  setTimeout(function(){ if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el) }, life)
}

function playAttackFeedback(gb, step) {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  /* 日志抽屉展开时不飘字（也不放施法特效，见 gbShowSkillCast）：
     两者都锚在中央特效区，而抽屉展开后中央区被压到 8vh，特效会直接画在日志正文上（实测截图）。
     打日志就是在复盘，不需要打击反馈；受击闪烁也一并跳过（它同样是为了「看战斗」）。
     ⚠️ 写成防御式：测试桩的 #battleOverlay 没有 classList（见 test-group-ui-presentation §13）。 */
  /* v2.11.5（作者裁决 **B**）：日志抽屉展开时**不再整体跳过反馈** ——
     ① **芯片锚定**的反馈照常：受击闪烁 + 状态徽标（`.gb-chip-mark` 挂在目标芯片上）；
     ② **中央特效区**的飘字与施法特效**仍然跳过**：中央区被压到 8vh，特效会直接画在日志正文上
        （v2.4.2 实测截图）；抽屉态的空间给了日志，不该再被特效占用。
     ⚠️ 防御式：测试桩的 #battleOverlay 没有 classList（见 test-group-ui-presentation §13）。 */
  var logOpen = !!(ov.classList && typeof ov.classList.contains === 'function' && ov.classList.contains('gb-log-open'))
  var mid = (typeof document!=='undefined') ? document.getElementById('gbArenaMid') : null
  if (!mid) console.warn('[group] 找不到中央特效区 #gbArenaMid —— 本步只闪芯片、不出飘字')
  var logs = (gb && gb.log) ? gb.log : []
  var lastLog = logs.length ? logs[logs.length-1] : null
  if (!lastLog) return
  var evs = lastLog.events || []
  /* v2.8.0：飘字槽位改用**跨步**序号（原先每步从 0 重排 → 连续两步的数字会叠在同一槽）；
     受击闪烁记进 `_gbHitUntil`，由 gbApplyStepTransitions 在每次重建后重新挂类
     （重建会把类和节点一起丢掉，高速档位下闪烁因此看不见）。
     v2.8.1：先过一遍把「本步会出几条飘字」数出来（保持原顺序），传给 gbFxFloat 的第 6 参 ——
     >4 条时它改用 4 列 × 多行网格（原先只有 4 条道，单步 10 条必然两两相交）。 */
  var hits = []
  evs.forEach(function(e, i){
    var h = gbParseHit(e, i > 0 ? evs[i-1] : null)
    if (h) hits.push({ e: e, hit: h })
  })
  _gbFxStep++;   /* v2.10.1（裁决 6）：本步的飘字共享同一 token，故同一步内不参与跨步占位 */
  /* v2.11.0（根因 1）：演出窗口策略 —— 生命期/聚合/闪烁都随速度档位收缩 */
  var pol = gbFxPolicy(_groupSpeed)
  var flashMs = Math.min(gbHitFlashMs(), pol.flashMs)
  var slot = _gbFxSlotSeq
  var nowMs = (typeof Date!=='undefined'&&Date.now)?Date.now():0
  /* v2.11.0（根因 1）：×2 起把**同一步内同一目标**的同类事件聚合成一条（数值为和）——
     这样一步打同一目标 3 次只出 1 个数字，而不是 3 条挤在同一位置。 */
  var render = []
  if (pol.aggregate) {
    var byKey = {}
    hits.forEach(function(rec){
      var k = (rec.hit.kind || 'damage') + '|' + (rec.e && rec.e.targetId ? rec.e.targetId : '')
      if (!byKey[k]) { byKey[k] = { e: rec.e, hit: { kind: rec.hit.kind, amount: 0, crit: false }, count: 0 }; render.push(byKey[k]); }
      byKey[k].hit.amount += rec.hit.amount
      if (rec.hit.crit) byKey[k].hit.crit = true
      byKey[k].count++
    })
  } else {
    hits.forEach(function(rec){ render.push({ e: rec.e, hit: rec.hit, count: 1 }) })
  }
  /* v2.11.1（根因 3）：状态/护盾类事件补**即时语义标记**（匹配不到就不出） */
  var marks = []
  evs.forEach(function(e, i){
    var parsed = gbParseHit(e, i > 0 ? evs[i-1] : null)
    var mk = gbMarkerFor(e, parsed)
    if (mk) marks.push({ e: e, text: mk })
  })
  render.forEach(function(rec){
    var e = rec.e, hit = rec.hit
    var card = gbCardForEvent(ov, gb, e)
    if (card) {
      card.classList.add('gb-hit')
      var cid = card.getAttribute ? card.getAttribute('data-uid') : null
      if (cid) _gbHitUntil[cid] = nowMs + flashMs
      setTimeout(function(){ card.classList.remove('gb-hit') }, flashMs)
    }
    if (logOpen) return   /* v2.11.5：抽屉态只闪芯片，中央飘字跳过 */
    if (!mid) return
    var color = (hit.kind === 'heal') ? 'var(--green)' : gbHitColor(gb, e, hit.amount)
    var text = (hit.kind === 'heal' ? '+' : '-') + hit.amount
    if (hit.crit) text = '💥' + text
    /* v2.11.0（根因 2）：横向锚到**目标芯片**中心（取不到就退回中央区中心） */
    var anchorX = null
    if (card && typeof card.getBoundingClientRect === 'function') {
      try { var cr = card.getBoundingClientRect(); if (cr && cr.width) anchorX = cr.left + cr.width / 2 } catch (er) { anchorX = null /* 忽略：取不到芯片 rect 就退回中央区锚点 */ }
    }
    gbFxFloat(mid, text, color, hit.crit, slot, render.length + marks.length, anchorX, pol.lifeMs)
    slot++
    _gbFxSlotSeq = slot
  })
  /* 标记：中性色 + 锚到目标芯片（参与同一套占位/生命期） */
  marks.forEach(function(rec){
    var e = rec.e
    var card2 = gbCardForEvent(ov, gb, e)
    /* v2.11.5（裁决 B）：抽屉态把标记改成**芯片徽标**（不占中央区、不压日志） */
    if (logOpen) { showChipBadge(card2, rec.text, pol.lifeMs); return }
    var ax2 = null
    if (card2 && typeof card2.getBoundingClientRect === 'function') {
      try { var cr2 = card2.getBoundingClientRect(); if (cr2 && cr2.width) ax2 = cr2.left + cr2.width / 2 } catch (er2) { ax2 = null /* 忽略：取不到芯片 rect 就退回中央区锚点 */ }
    }
    gbFxFloat(mid, rec.text, 'var(--text)', false, slot, render.length + marks.length, ax2, pol.lifeMs)
    slot++
    _gbFxSlotSeq = slot
  })
}

/* ============================================================
   v2.4.2 技能施法特效：中央区的「图标 + 一句话」

   为什么把旧的 showSkillBubble（把 #skillBubble 追加进 #battleOverlay 并写死 top:38%）
   整体并入这里：气泡本来就是「施法停顿」的视觉表达，而中央特效区 #gbArenaMid 正是
   舞台化布局留出来的落点 —— 两套并存会出现「气泡浮在广场上方 + 特效另有其一」的重复表达。

   技能身份**唯一权威来源**是 `bubble.skillId`（主控实测：每次施法都带、非 bubble 事件 0 条带），
   不解析文案、也不按技能名反查 —— 名字是展示层文案，id 才是稳定键。

   ⚠️ 元素必须挂**常驻层 #gbFx**（与飘字同一层），只用 #gbArenaMid 的 rect 取坐标：
      renderGroupOverlay 每步 innerHTML 重建整个 overlay，挂进 #gbArenaMid 当子节点会被直接冲掉。
   ============================================================ */
var _gbCastEl=null    /* 上一条施法特效元素：新施法必须先清掉（#gbFx 是常驻层，不清会叠字） */

/* 只摘掉施法特效（保留飘字）—— 供 gbShowSkillCast 的新旧交替与 gbFxClear 复用 */
function gbCastClear(){
  if(_gbCastEl&&_gbCastEl.parentNode&&_gbCastEl.parentNode.removeChild)_gbCastEl.parentNode.removeChild(_gbCastEl)
  _gbCastEl=null
}

/* 技能中文名：先查 SKILLS（含 p_ 前缀的宠物技能），查不到再兜底查玩家技能表。
   两条都拿不到就返回空串 —— 宁可只显示图标，也不编造名字
   （玩家技能注册在 PLAYER_SKILLS、不在 SKILLS；v2.4.0 的玩家攻击技能路径目前不产生
     bubble，故这条兜底当前不可达，属防御性写法）。 */
function gbSkillName(skillId){
  if(!skillId)return ''
  var d=(typeof SKILLS!=='undefined'&&SKILLS)?SKILLS[skillId]:null
  if(d&&d.name)return String(d.name)
  if(typeof getPlayerSkill==='function'){
    try{
      var p=getPlayerSkill(skillId)
      if(p&&p.name)return String(p.name)
    }catch(e){ console.warn('[group] 玩家技能名兜底查询失败（忽略，只显示图标）',e) }
  }
  return ''
}

/* 施法者单位：bubble 里只有行动者**名字**（引擎日志没给 id）→ 走 gbUnitIndex 的
   byName / byShort 反查（byShort 是剥掉前导 emoji 的索引，与场地事件同一套口径）。
   查不到返回 null —— 调用方按「非玩家技能 / 我方绿」处理，不猜。 */
function gbCastActor(gb, bubble){
  if(!gb||!bubble||!bubble.unit)return null
  var idx=gbUnitIndex(gb)
  return idx.byName[bubble.unit]||idx.byShort[gbStripLeadEmoji(bubble.unit)]||null
}

/* 本步的事件数组（bubble 与它的结算事件在**同一条日志条目**的同一个 events 里）。
   gbShowSkillCast 的外部调用方只传 (gb, bubble) → 由这里兜底取「最后一条日志」。 */
function gbStepEvents(gb){
  var logs=(gb&&gb.log)||[]
  var last=logs.length?logs[logs.length-1]:null
  return (last&&last.events)||[]
}

/* 一句话概括本步（纯函数，不碰 DOM；便于直测）

   ⚠️ 只用**数据派生**的句子，禁止编造动词/数值：
     多目标 + buff/status/heal  → 「<行动者> 对全队施加了 <技能名>」
     多目标 + 伤害类            → 「<行动者> 对 <N> 个目标使用了 <技能名>」
     单目标（或查不到目标）      → 「<行动者> 使用了 <技能名>」
   为什么单目标不返回空串（任务书允许二选一）：空串会让调用方退回「只有技能名」，
   把行动者上下文丢掉；而中央区的一句话正是用来交代「谁在做什么」的，
   且这句只用了「使用了」这类**不引入新事实**的表述，不比技能名多说什么。
   ⚠️ 目标数只数**不同 targetId**（同一目标被多段命中仍算 1 个）；
      bubble 事件本身没有 targetId，天然不参与计数。
   ⚠️ 混合型（既有 buff/status/heal 又有伤害）走伤害分支：伤害是更硬的事实。 */
function gbStepSummary(gb, evs, bubble){
  if(!bubble||!bubble.skillId)return ''
  var nm=gbSkillName(bubble.skillId)
  if(!nm)return ''      /* 拿不到技能名：宁可不说，也不编造 */
  var actor=gbStripLeadEmoji(bubble.unit||'')||String(bubble.unit||'')
  var seen={}, n=0, hasApply=false, hasDmg=false
  ;(evs||[]).forEach(function(e){
    if(!e||!e.targetId||e.type==='bubble')return
    if(!seen[e.targetId]){ seen[e.targetId]=1; n++ }
    var t=e.type||''
    if(t==='buff'||t==='status'||t==='heal')hasApply=true
    else if(t==='damage'||t==='dot'||t==='terrain')hasDmg=true
  })
  if(n<2)return actor+' 使用了 '+nm
  if(hasApply&&!hasDmg)return actor+' 对全队施加了 '+nm
  return actor+' 对 '+n+' 个目标使用了 '+nm
}

/* 渲染一次施法特效（图标 + 一句话）到中央特效区。
   evs 可选：不传则取最后一条日志的事件（见 gbStepEvents）。 */
/* v2.8.1（E）：施法特效是**后于**本步飘字创建的（`_groupStep`：playAttackFeedback → gbShowSkillCast），
   所以光靠「创建飘字时看 _gbCastEl」无法分层（第一次实测 E 仍相交 1648px²）。
   这里在特效落地后，把**所有活着的飘字**（含上一步仍在 900ms 生存期内的）整组下移到特效下方：
   动画上浮 34px + 6px 余量 = 特效底 + 40。**整组按同一量平移**（不逐条 max ——
   逐条 max 会把同 x 的 slot0/slot3 压到同一 y 上再叠一次）。 */
function gbFxSinkFloats(castEl, layer){
  if(!castEl||!layer||typeof layer.querySelectorAll!=='function')return
  var cb=null
  try{ cb=castEl.getBoundingClientRect() }catch(e){ cb=null /* 忽略：取不到 rect 就不调整，不阻断特效 */ }
  if(!cb||!cb.bottom)return
  var fl=layer.querySelectorAll('.gb-fx-float')
  if(!fl||!fl.length)return
  var tops=[]
  for(var i=0;i<fl.length;i++){ var t=parseFloat(fl[i].style.top); if(!isNaN(t))tops.push(t) }
  if(!tops.length)return
  var minTop=Math.min.apply(null,tops)
  var need=cb.bottom+40
  if(minTop>=need)return
  var d=need-minTop
  for(var j=0;j<fl.length;j++){
    var v=parseFloat(fl[j].style.top)
    if(!isNaN(v))fl[j].style.top=(v+d)+'px'
  }
  /* v2.10.1（裁决 6）补充：整组下移**也要**过一遍跨步占位 —— 下移只按施法特效算，
     若正好压到上一批仍在场的飘字上，就逐条再找落点（下移后的位置优先，找不到才换列）。 */
  if (typeof _gbFxFindFreeSpot === 'function' && typeof _gbFxLive !== 'undefined') {
    var n2 = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    _gbFxPruneLive(n2);
    for (var j2 = 0; j2 < fl.length; j2++) {
      var e2 = fl[j2];
      var t2 = parseFloat(e2.style.top), l2 = parseFloat(e2.style.left);
      if (isNaN(t2) || isNaN(l2)) continue;
      var entry = null;
      for (var q = 0; q < _gbFxLive.length; q++) { if (_gbFxLive[q].el === e2) { entry = _gbFxLive[q]; break; } }
      var bw2 = entry ? entry.w : 70, bh2 = entry ? entry.h : 30;
      if (!_gbFxCollides({ l: l2 - bw2 / 2, r: l2 + bw2 / 2, t: t2 - 34, b: t2 + bh2 }, entry ? entry.step : _gbFxStep, n2)) continue;
      var spot2 = _gbFxFindFreeSpot(l2, t2, entry ? entry.step : _gbFxStep, n2, bw2, bh2);
      e2.style.left = spot2.x + 'px';
      e2.style.top = spot2.y + 'px';
    }
  }
}

function gbShowSkillCast(gb, bubble, evs){
  if(!bubble)return
  var layer=gbFxLayer()
  var mid=(typeof document!=='undefined')?document.getElementById('gbArenaMid'):null
  /* 日志抽屉展开时不放施法特效：中央区被压到 8vh，48px 图标会骑在日志正文上（实测）。
     防御式写法：测试桩的 #battleOverlay 没有 classList。 */
  var ov=(typeof document!=='undefined')?document.getElementById('battleOverlay'):null
  if(ov&&ov.classList&&typeof ov.classList.contains==='function'&&ov.classList.contains('gb-log-open'))return
  if(!layer||!mid){ console.warn('[group] 施法特效缺少锚点（#gbFx / #gbArenaMid），本次跳过'); return }
  var r
  try{ r=mid.getBoundingClientRect() }catch(e){ console.warn('[group] 施法特效定位失败',e); return }
  if(!r||!r.width)return
  var id=bubble.skillId
  var actor=gbCastActor(gb,bubble)
  /* isPlayer 只决定**查哪张图标表**（skillIconKnown 的 false 分支同时吃敌方表与宠物表）：
     我方且非宠物 = 玩家技能通道；敌方与宠物都传 false；查不到单位也传 false。 */
  var isPlayer=!!(actor&&actor.side==='ally'&&!actor._petSpecies)
  var ico=(id&&typeof skillIconHtml==='function')?skillIconHtml(id,48,'gb-skill-cast-ico',isPlayer):''
  /* 未知 id（或图标模块未加载）→ 不拼 404、不留一个空壳光环，直接不渲染（宁缺勿错） */
  if(!ico)return
  gbCastClear()     /* 每次新施法先清上一条：不清就会在常驻层上叠字 */
  /* 光环色按**阵营**取（友方绿 / 敌方红），不按 isPlayer ——
     宠物技能 isPlayer=false，但宠物是我方单位，用 isPlayer 上色会把自家宠物标成敌方红。
     查不到单位时按我方（绿）渲染：绿是中性/己方，不会把自家单位误标成敌。 */
  var tone=(actor&&actor.side==='enemy')?'enemy':'ally'
  var el=document.createElement('div')
  el.className='gb-skill-cast tone-'+tone
  /* 文案行：数据派生的一句话（多目标时把逐条刷屏压成一句）优先，退回技能名。
     ×4 及以上不渲染文字：步进只有 87~112ms，字还没看清就被下一发盖掉，只会叠成一团。 */
  var line=''
  if(_groupSpeed<4)line=gbStepSummary(gb, evs||gbStepEvents(gb), bubble)||gbSkillName(id)
  el.innerHTML=ico+(line?'<span class="gb-skill-cast-name">'+escHtml(line)+'</span>':'')
  el.style.cssText='left:'+Math.round(r.left+r.width/2)+'px;top:'+Math.round(r.top+r.height*0.28)+'px'
  layer.appendChild(el)
  _gbCastEl=el
  gbFxSinkFloats(el,layer)   /* v2.8.1(E)：把本步/上一步仍在场上的飘字整组下移到特效下方 */
  setTimeout(function(){ if(el&&el.parentNode&&el.parentNode.removeChild)el.parentNode.removeChild(el) },GB_FX_LIFE)
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
  gbFxClear()              // v2.4.0：清掉本场残留飘字（否则结算面板后面还飘着旧数字）
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
  /* v2.4.0 改造 4：结算统计面板 —— 统计**只算一次**（在这里算好传进去），
     且必须排在既有副作用（通关标记 / 奖励 / 宠物受伤 / 小关列表）**之后**，顺序不动。
     面板走 #panelOverlay（z-index 52 > 战斗层 50），不新建 overlay。 */
  if(_groupBattle)showGroupResultPanel(_groupBattle, groupBattleStats(_groupBattle))
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
  /* v2.2 WP-H8 补线：敌群胜利掉落套用**同一份**掉落倍率常量
     （challenge.js 顶部的倍率表 / applyDropMults：宝珠碎片 ×3 / 炼化石（普通+高级）×2 / 灵能 ×2；
       challenge.js 在 index.html 里先于 game-render.js 加载，运行时全局可见）。
     ⚠️ 只套在**基础掉落**上（上面这几条）：幸运口袋那几笔是天赋的独立产出，
        与挑战路径「基础+每周奖励」同一口径，不随本次倍率放大。
     ⚠️ 别在这里写倍率数字 —— 数值的唯一来源是 challenge.js 顶部那张表。 */
  if (typeof applyDropMults === 'function') drops = applyDropMults(drops)
  /* 幸运口袋（小负鼠天赋 §3.1）：三类材料**各自独立判定**
     （营养液 10%~20%→0~2 / 宠物饲料 20%~30%→0~4 / 宠物灵能 5%~10%→0~5），
     概率与数量都在区间内均匀随机。规则本体在 pet-codex.js 的 luckyPocketDrops()（纯函数）。
     · 多个携带者**不叠加**：只要 ≥1 名携带者，就只判一轮（filter 只判「有没有」）。
     · 随机源 = 本场战斗 rng（gb.rng，可播种 / 可回放），不用 Math.random()。 */
  var lucky = (gb && gb.allies ? gb.allies : []).filter(function (u) {
    return u._talents && u._talents.indexOf('lucky_pocket') > -1
  })
  if (lucky.length && typeof luckyPocketDrops === 'function') {
    var luckyRng = (gb && typeof gb.rng === 'function') ? gb.rng : battleRnd
    luckyPocketDrops(luckyRng).forEach(function (d) { drops.push(d) })
  }
  drops.forEach(function (d) {
    grantMaterial(d.type, d.n)
    msgs.push((d.lucky ? '🍀 ' : '') + getMaterialName(d.type) + ' +' + d.n)
  })
  return { msg: msgs.join(' · ') }
}

/* v2.2.27 WP-I：一方的剩余总血量百分比（Σ当前HP ÷ Σ最大HP）。
   ⚠️ **纯展示、只读**：不写回任何单位、不参与结算，也不改任何战斗数值/平衡。 */
function gbSideHpPct(units){
  var cur=0,max=0
  ;(units||[]).forEach(function(u){
    max+=(u.base&&u.base.hp)||0
    cur+=Math.max(0,u.hp||0)
  })
  return max>0?Math.round(cur/max*100):0
}

/* ============================================================
   v2.4.0 改造 4：结算统计 + 战报文本（纯函数，只读 gb.log / gb.units / gb.winner / gb.turn）

   归因口径（任务书 §3 改造 4 的表，逐条落地）：
     · 造成伤害 ← `l.unit`（行动者）  damage 族（普攻/技能/蓄力/魂攻/反伤/反冲）
     · 治疗量   ← `l.unit`（施放者），目标取 `e.targetId`
     · 施加状态 ← `l.unit`，type=status 且文案匹配 /(施加|刷新)【/
     · 承受伤害 ← `e.targetId` → 单位（damage 族 + dot + terrain）
     · 场地伤害 ← 单列「🌍 场地」行（terrain）
   ⚠️ `gb.log` **没有 unitId**（只有 `l.unit` 名字）→ 必须建「名字 → 单位」映射；
      同名单位按 gb.units 顺序加后缀（`宠物A#2`）**如实显示、不静默合并**，
      但日志侧只能把该名字归到**首个**同名单位（引擎没给 id，这一点在面板里明说）。
   ⚠️ dot（中毒/附身/末日/遗言）**没有攻击者**：单列一行、不计入任何人造成伤害、不参与 MVP，
      但**计入承受伤害**（事件带 targetId）。
   ============================================================ */
function gbUnitIndex(gb){
  var seen={}, byName={}, byShort={}, list=[], dup=false
  ;((gb&&gb.units)||[]).forEach(function(u){
    var base=u.name||'单位'
    seen[base]=(seen[base]||0)+1
    if(seen[base]>1)dup=true
    var key=seen[base]>1?(base+'#'+seen[base]):base
    list.push({key:key,unit:u})
    if(!byName[base])byName[base]=u
    /* 场地事件的 targetId 缺失，只能从文案里抠名字，而文案里的名字**没有前导 emoji**
       （`🪨 🧑 你 受碎石伤害 40` → 抠出 `你`）→ 需要一份「剥 emoji 后」的索引。 */
    var short=gbStripLeadEmoji(base)
    if(short&&!byShort[short])byShort[short]=u
  })
  return {byName:byName,byShort:byShort,list:list,dup:dup}
}

function groupBattleStats(gb){
  var idx=gbUnitIndex(gb)
  var rows=[], byId={}
  ;((gb&&gb.allies)||[]).forEach(function(u){
    var r={id:u.id,name:u.name,key:u.name,dealt:0,taken:0,healed:0,status:0,alive:u.hp>0,mvp:false}
    byId[u.id]=r
    rows.push(r)
  })
  /* 同名单位在表内如实加后缀（只改显示 key，归因仍按首个个体的 id） */
  idx.list.forEach(function(e){ if(byId[e.unit.id])byId[e.unit.id].key=e.key })
  var terrain=0,dot=0,shield=0,unit=null
  ;((gb&&gb.log)||[]).forEach(function(l){
    if(!l||!l.events)return
    var actor=(l.unit&&idx.byName[l.unit])||null
    var actorRow=(actor&&byId[actor.id])||null
    var evs=l.events
    for(var i=0;i<evs.length;i++){
      var e=evs[i]
      if(!e||!e.msg||e.type==='bubble')continue
      var t=e.type||''
      /* 承受伤害落点：优先 e.targetId；场地事件没有 targetId → 退回文案里的名字 */
      var victimRow=null
      if(e.targetId&&byId[e.targetId])victimRow=byId[e.targetId]
      else if(t==='terrain'){
        var vn=gbEventTargetName(e)
        var vu=(vn&&(idx.byName[vn]||idx.byShort[vn]))||null
        if(vu&&byId[vu.id])victimRow=byId[vu.id]
      }
      if(t==='heal'){
        var hm=GB_HIT_RX.heal.exec(e.msg)
        if(hm&&actorRow)actorRow.healed+=Number(hm[1])
        continue
      }
      if(t==='status'){
        if(GB_HIT_RX.shield.test(e.msg)){
          var sm=GB_HIT_RX.shield.exec(e.msg)
          shield+=Number(sm[1])
        } else if(/(施加|刷新)【/.test(e.msg)&&actorRow){
          actorRow.status++
        }
        continue
      }
      var hit=gbParseHit(e,i>0?evs[i-1]:null)
      if(!hit)continue
      if(victimRow)victimRow.taken+=hit.amount
      if(t==='terrain'){ terrain+=hit.amount; continue }   /* 场地伤害单列 */
      if(hit.kind==='dot'){ dot+=hit.amount; continue }    /* 无攻击者：单列，不计 MVP */
      if(actorRow)actorRow.dealt+=hit.amount
    }
  })
  /* MVP：伤害最高 → 并列看治疗 → 再并列按 gb.units 顺序（rows 就是 gb.allies 顺序）。
     全员 0 伤害（例如开场被秒）时不给 MVP —— 给个 0 伤害的「最有价值」是误导。 */
  var mvp=null
  rows.forEach(function(r){
    if(!mvp){ mvp=r; return }
    if(r.dealt>mvp.dealt)mvp=r
    else if(r.dealt===mvp.dealt&&r.healed>mvp.healed)mvp=r
  })
  if(mvp&&mvp.dealt>0)mvp.mvp=true
  else mvp=null
  return {rows:rows,mvp:mvp,terrain:terrain,dot:dot,shield:shield,
    rounds:(gb&&gb.turn)||0,winner:gb?gb.winner:null,dup:idx.dup,
    logs:((gb&&gb.log)||[]).length}
}

/* v2.4.4：蓄力「进入」与其到期文案在**同一条目里自相矛盾**（读起来像蓄力当场消失）。
   机制其实是对的：伤害确实在下回合结算（实测 turn2 出「进入蓄力（下回合释放）」→ turn3 才打出 `💥 X 蓄力重击 → …`）。
   矛盾来自：蓄力状态在**进入的当回合**就被状态到期流程消费，而释放走的是另一条调度。
   条目实测形态：`🔋 梦幻 蓄力（梦幻光球，下回合释放）；蓄力完成!；⏳ 梦幻 的【蓄力】结束`
   → 同一条目里若已有「蓄力（…）」进入事件，就把紧随其后的「蓄力完成…」「【蓄力】结束」丢掉。
   ⚠️ **只影响显示**：不改引擎、不改机制；下回合那条伤害事件（`💥 … 蓄力重击 → …`）照常保留。
   ⚠️ 唯一实现：日志页（gbLogEntries）与战报文本（groupLogText）**共用本函数**，禁两处各写一套。 */
function gbDropChargeNoise(events){
  var evs=events||[]
  var hasEnter=false
  for(var i=0;i<evs.length;i++){
    if(evs[i]&&evs[i].msg&&evs[i].msg.indexOf('蓄力（')>-1){hasEnter=true;break}
  }
  if(!hasEnter)return evs
  return evs.filter(function(e){
    if(!e||!e.msg)return true
    if(e.msg.indexOf('蓄力完成')===0)return false          /* 蓄力完成! */
    if(e.msg.indexOf('【蓄力】结束')>-1)return false        /* ⏳ X 的【蓄力】结束 */
    return true
  })
}

/* ============================================================
   v2.4.5：四阶段显示（显示侧唯一实现，禁两处各写一套）

   冻结契约（引擎侧）：`window.GB_PHASES = ['准备','行动','判定','结束']`（顺序固定）；
   `gb.phase` = 当前阶段；**每条 `gb.log` 条目带 `phase: gb.phase`**。
   ⚠️ 引擎可能还没落地 / 旧日志可能整条缺 `phase` —— 本层一律**防御式兜底**：
      缺字段或非法值时 `gbPhaseCanon()` 返回 `''`，调用方走既有渲染（不分组、不出标题、
      不显示 `undefined`）。故这里**不声明**全局 `GB_PHASES`（那是引擎的变量，
      在同一个全局作用域里重复 `var` 会互相覆盖），只读它、读不到就用内置顺序。 */
var _GB_PHASE_FALLBACK=['准备','行动','判定','结束']

/* 契约顺序：优先读引擎的 window.GB_PHASES，读不到退回内置顺序（只用于排序与合法性校验） */
function gbPhaseOrder(){
  try{
    var ext=(typeof window!=='undefined')?window.GB_PHASES:null
    if(ext&&ext.length&&typeof ext.length==='number')return ext
  }catch(e){ console.warn('[group] 读取 GB_PHASES 失败，退回内置阶段顺序',e) }
  return _GB_PHASE_FALLBACK
}
/* 合法阶段名归一化：缺失 / 非字符串 / 未知值一律返回 ''（**绝不回显 undefined**）。
   容忍引擎写成带后缀的「准备阶段」（契约字面量是短名，长名也认）。 */
function gbPhaseCanon(v){
  if(typeof v!=='string')return ''
  var s=v.replace(/\s+/g,'')
  if(!s)return ''
  var order=gbPhaseOrder(),i
  for(i=0;i<order.length;i++){ if(order[i]===s)return order[i] }
  if(s.length>2&&s.slice(-2)==='阶段')s=s.slice(0,-2)
  for(i=0;i<order.length;i++){ if(order[i]===s)return order[i] }
  return ''
}
/* 日志条目 → 阶段名；没有就返回 ''（调用方据此走兜底渲染） */
function gbLogPhaseOf(l){ return l?gbPhaseCanon(l.phase):'' }
/* 阶段序号（用于 CSS 类 ph-0..ph-3，四阶段各自可区分）；非法值 -1 */
function gbPhaseIdx(p){
  var order=gbPhaseOrder()
  for(var i=0;i<order.length;i++){ if(order[i]===p)return i }
  return -1
}

/* 战报文本：**唯一来源** —— 日志页「📋 复制」与结算面板「📋 复制战报」共用（禁两处各写一套）
   v2.4.5：head 追加阶段 → `【回合 1·准备阶段】…`；缺 phase 时 head **逐字不变**
   （`【回合 1】…` / `【开场】…`），故旧日志与旧断言的输出等价。 */
function groupLogText(gb){
  if(!gb||!gb.log)return ''
  return gb.log.map(function(l){
    var ph=gbLogPhaseOf(l)
    var head='【'+(l.turn===0?'开场':'回合 '+l.turn)+(ph?('·'+ph+'阶段'):'')+'】'+(l.unit||'')
    var body=gbDropChargeNoise(l.events).filter(function(e){return e&&e.msg&&e.type!=='bubble'})
      .map(function(e){return e.msg}).join('；')
    return head+': '+body
  }).join('\n')
}

/* 复制文本（日志页与结算面板共用；剪贴板不可用时退回 execCommand，失败要如实告知） */
function gbCopyText(text){
  if(typeof text!=='string'||!text)return
  try{
    if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){toast('📋 战报已复制','s')},function(err){
        console.warn('[group] clipboard 被拒，走兜底',err); gbCopyFallback(text)
      })
      return
    }
  }catch(e){ console.warn('[group] clipboard 不可用，走兜底',e) }
  gbCopyFallback(text)
}
function gbCopyFallback(text){
  try{
    var ta=document.createElement('textarea')
    ta.value=text
    if(document.body&&document.body.appendChild)document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    if(ta.parentNode&&ta.parentNode.removeChild)ta.parentNode.removeChild(ta)
    toast('📋 战报已复制','s')
  }catch(e){ console.warn('[group] 复制失败',e); toast('复制失败，请手动选择文本','e') }
}

/* 结算面板：复用 #panelOverlay（z-index 52 > 战斗层 50），不新建 overlay。
   ⚠️ restore 里**只**关掉战斗 overlay，不能走 resumeGroupBattle()
      —— 那会再次进入 _groupDone（本函数正是从 _groupDone 里调起的）。 */
function showGroupResultPanel(gb, stats){
  if(!gb||!stats)return
  var win=gb.winner==='ally'
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">✕</button>'
    +'<span class="det-title">'+(win?'🏆 胜利':'💀 失败')+'</span>'
    +'<span class="det-sub">共 '+stats.rounds+' 回合</span>'
    +'</div>'
  h+='<div class="det-card">'
  h+='<div class="det-h">📊 我方战报</div>'
  stats.rows.forEach(function(r){
    h+='<div class="gb-res-row">'
      +'<span class="gb-res-name">'+escHtml(r.key||r.name||'单位')
      +(r.mvp?' <b class="gb-res-mvp">👑 MVP</b>':'')+'</span>'
      +'<span class="gb-res-cells">'
      +'<i>⚔️ '+r.dealt+'</i><i>🛡️ '+r.taken+'</i><i>💚 '+r.healed+'</i><i>🌀 '+r.status+'</i>'
      +'<i>'+(r.alive?'✅ 存活':'💀 阵亡')+'</i>'
      +'</span>'
      +'</div>'
  })
  if(!stats.rows.length)h+='<div class="det-dim">（本场没有我方单位数据）</div>'
  h+='</div>'
  h+='<div class="det-card">'
  h+='<div class="det-h">🌍 其他来源</div>'
  h+=detRow('🌍 场地伤害（单列）',String(stats.terrain))
  h+=detRow('☠️ 持续伤害（无攻击者，不计 MVP）',String(stats.dot))
  h+=detRow('🛡️ 护盾吸收（不计入造成伤害）',String(stats.shield))
  h+='</div>'
  if(stats.dup){
    h+='<div class="det-card"><div class="det-line dim">⚠️ 本场存在同名单位：表格按 gb.units 顺序加后缀区分（如「宠物A#2」）；'
      +'但 gb.log 只记行动者名字、没有 id，日志归因只能落到**首个**同名单位。</div></div>'
  }
  h+='<button class="speed-btn" id="gbCopyReport">📋 复制战报</button>'
  _openDetailPanel(h, function(){
    var bo=document.getElementById('battleOverlay')
    if(bo)bo.classList.remove('open')
  })
  var cb=document.getElementById('gbCopyReport')
  if(cb)cb.addEventListener('click',function(){ gbCopyText(groupLogText(gb)) })
}

/* ============================================================
   v2.4.0 改造 1：行动横幅（#gbActionBanner）

   位置：`.gb-ctrl` **之后**、`.gb-tabs` **之前**，同属**吸顶区**。
   ⚠️ 绝不能放进 `#gbPane` —— 那是唯一的滚动容器（`.gb-pane{overflow-y:auto}`），
      放进去横幅会随日志/单位卡一起滚走，等于白做。

   内容**全部从数据派生**（禁写死模板句）：
     · 左色块：行动者取 `_groupActing` → `gb.units` → side（绿 / 红）；
       该条日志是场地事件 → 紫；是开场事件 → `--yellow`。
     · 正文：行动者名字 + 该条日志（`gb.log` 末条）**首个非 bubble 事件**的 msg，
       两侧都先剥前导 emoji 与多余空格（见 gbStripLeadEmoji）。
     · 无 `_groupActing` 且战斗已结束 → `⏸ 战斗结束`；既无行动者又没结束（开战瞬间）
       → 整条隐藏，不占吸顶区高度。

   ⚠️ 只在 renderGroupOverlay() 里重绘：`_groupStep()` 不得新增任何 DOM 操作。
   a11y：`aria-hidden="true"`（可读记录以日志 Tab 为准），**不加 aria-live**
       —— 自动模式每秒重绘好几次，读屏会被刷屏。
   ============================================================ */
function renderGroupActionBanner(gb){
  if(!gb)return ''
  var logs=(gb.log&&gb.log.length)?gb.log:[]
  var l=logs.length?logs[logs.length-1]:null
  var unit=null
  if(_groupActing&&gb.units){
    for(var i=0;i<gb.units.length;i++){
      if(gb.units[i].id===_groupActing){unit=gb.units[i];break}
    }
  }
  if(!unit&&!gb.done)return ''      // 开战瞬间 / 无行动者：隐藏
  var tone
  if(!unit)tone='none'              // 战斗结束：中性色块
  else if(l&&l.terrain)tone='terrain'
  else if(l&&l.opening)tone='opening'
  else tone=(unit.side==='ally'?'ally':'enemy')
  var evText=''
  if(l&&l.events){
    for(var j=0;j<l.events.length;j++){
      var e=l.events[j]
      if(e&&e.type!=='bubble'&&e.msg){evText=gbStripLeadEmoji(e.msg);break}
    }
  }
  var text
  if(!unit)text='⏸ 战斗结束'
  else{
    var nm=gbStripLeadEmoji(unit.name)
    /* ⚠️ 引擎事件里**绝大多数**已经带了行动者名（`⚔️ 🧑 你 攻击 Boss·暗龙 → …`），
       直接拼会得到「你 你 攻击…」。故 msg 以行动者名开头时把它摘掉再拼 ——
       首行仍是「<名字> + 事件文案」，只是不会把一个名字印两遍（纯字符串派生，非模板句）。 */
    if(nm&&evText.indexOf(nm)===0){
      var rest=evText.slice(nm.length)
      if(rest===''||/^[\s·，,、:：]/.test(rest))evText=rest.replace(/^[\s·，,、:：]+/,'')
    }
    text=nm&&evText?(nm+' '+evText):(nm||evText)
  }
  if(!text)return ''
  /* v2.4.5 改造 2：阶段徽标 —— 数据取 `gb.phase`，放在「谁 + 做了什么」左侧。
     ⚠️ 缺字段 / 非法值 → `gbPhaseCanon()` 返回 '' → **不渲染徽标**（绝不显示 undefined）。
     ⚠️ 徽标高 ≈19px ＜ .gb-banner 的 min-height:32px → 横幅 44px 上限不变（CSS 走令牌字号）。 */
  var ph=gbPhaseCanon(gb.phase)
  var phBadge=ph?('<span class="gb-banner-phase ph-'+gbPhaseIdx(ph)+'" data-phase="'+escHtml(ph)+'">'+escHtml(ph)+'</span>'):''
  return '<div id="gbActionBanner" class="gb-banner tone-'+tone+'" aria-hidden="true" title="'+escHtml(text)+'">'
    +'<span class="gb-banner-chip"></span>'
    +phBadge
    +'<span class="gb-banner-text">'+escHtml(text)+'</span>'
    +'</div>'
}

/* 渲染群战 overlay：手动/自动 + 调速 + 单位 + 动画 + 详情 + 日志 */
function renderGroupOverlay(show){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  if(show)ov.classList.add('open')
  if(!_groupBattle){ov.classList.remove('open');return}
  var gb=_groupBattle
  var allyPct=gbSideHpPct(gb.allies), foePct=gbSideHpPct(gb.enemies)
  // v2.1.14：控制条常驻（sticky），其下是「战斗 / 日志」双 Tab —— 两个页签各自独立滚动
  var h='<div class="gb-ctrl">'
    +'<button class="speed-btn" id="gbClose" aria-label="退出战斗">✕</button>'
    +'<span class="gb-ctrl-title">👥 '+gb.enemies.length+'敌 · 回合 '+gb.turn+'</span>'
    /* v2.1.22：场地常驻胶囊（可点击看介绍）。
       此前场地只在开战时 toast 一次，几秒后就消失 —— 玩家打到一半根本记不住自己在什么场地里，
       更看不到「对敌我双方均有效」这类关键前提。现在控制条上常驻一个 🌍 胶囊，点开是完整说明。 */
    +(gb.terrain?'<button class="gb-terrain" id="gbTerrain" title="点击查看场地介绍">🌍 '+escHtml(gb.terrain.name)+'</button>':'')
    +'<span style="flex:1"></span>'
    // 手动/自动切换
    +'<button class="speed-btn'+(_groupMode==='manual'?' on-warn':'')+'" id="gbMode">'+(_groupMode==='manual'?'✋ 手动':'🤖 自动')+'</button>'
    // 调速（自动模式）
    +(_groupMode==='auto'?'<button class="speed-btn" id="gbSpeed">'+_groupSpeed+'×</button>':'')
    // 手动：推进一回合按钮
    +(_groupMode==='manual'?'<button class="speed-btn on-good" id="gbStep">⏭️ 下一回合</button>':'')
    /* v2.2.27 WP-I：双方血量总览（控制条常驻 → 不滚屏也能看清敌我剩余血量）。
       回合数已在上面的标题里；这里只补「我方 / 敌方」两条总量条。
       数据来自 gbSideHpPct(gb.allies / gb.enemies)，纯展示、不参与结算。 */
    +'<div class="gb-ovw">'
    +'<span class="gb-ovw-side ally">🟢 我方<span class="gb-ovw-bar"><i style="width:'+allyPct+'%"></i></span>'+allyPct+'%</span>'
    +'<span class="gb-ovw-side enemy">🔴 敌方<span class="gb-ovw-bar"><i style="width:'+foePct+'%"></i></span>'+foePct+'%</span>'
    +'</div>'
    +'</div>'
  /* v2.4.0 改造 1：行动横幅 —— 吸顶区（.gb-ctrl 之后、.gb-tabs 之前，绝不在 #gbPane 内） */
  h+=renderGroupActionBanner(gb)
  /* v2.4.2 战场化：广场（上下对阵舞台）常驻在 #gbPane **之外**。
     为什么必须在外：.gb-pane 是 overflow-y:auto 的滚动裁剪容器，行动者芯片的
     transform:scale(1.1) 一旦发生在里面就会横向溢出、顶出横向滚动条（v2.4.0 实测踩过）；
     广场自带 overflow:hidden，放大被它安静地裁掉。 */
  h+='<div class="gb-arena-wrap">'+renderGroupBattlePane(gb)+'</div>'
  // v2.1.14 双 Tab（战斗 / 日志）—— v2.4.2 起它同时是「日志抽屉」的把手
  h+='<div class="gb-tabs" role="tablist" aria-label="战斗视图">'
    +'<button class="gb-tab'+(_gbTab==='battle'?' active':'')+'" data-gbtab="battle" role="tab" aria-selected="'+(_gbTab==='battle')+'">⚔️ 战斗</button>'
    +'<button class="gb-tab'+(_gbTab==='log'?' active':'')+'" data-gbtab="log" role="tab" aria-selected="'+(_gbTab==='log')+'">📜 日志<span class="gb-tab-n">'+gbLogEntries(gb).length+'</span></button>'
    +'</div>'
  /* 页签内容（各自独立滚动）：战斗页只留「一行阵容速览 + 提示」——单位芯片已上移到广场；
     日志页铺满抽屉。⚠️ 战斗进行时**不自动**切到日志页（_gbTab 只由用户点击改变）。 */
  h+='<div class="gb-pane" id="gbPane">'
    +(_gbTab==='log' ? renderGroupLogPane(gb) : gbLineupHtml(gb))
    +'</div>'
  /* v2.4.2 日志抽屉：打开态挂在 overlay **根**上 —— CSS 用它把日志面板拉到 58vh、
     广场压到快照高度（--gb-arena-h-s / --gb-mid-h-s）；关掉时同步摘掉该类。 */
  if(ov.classList)ov.classList.toggle('gb-log-open', _gbTab==='log')
  ov.innerHTML=h
  /* v2.8.0：重建后的两件事（纯展示、不改任何战斗状态）——
     ① 让 HP 条从**上一帧的百分比**补间到本帧（否则新节点没有起始值，transition 永不触发）；
     ② 把仍在时间窗内的受击闪烁重新挂到新节点上（否则高速档位下闪烁在下一步就被丢掉）。 */
  gbApplyStepTransitions(ov,gb)
  // 事件绑定
  var closeBtn=document.getElementById('gbClose')
  if(closeBtn)closeBtn.addEventListener('click',function(){ov.classList.remove('open');_groupBattle=null;_groupPaused=false;if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}gbFxClear()})
  // v2.1.22：场地胶囊 → 场地介绍弹层
  var terrBtn=document.getElementById('gbTerrain')
  if(terrBtn)terrBtn.addEventListener('click',function(){showTerrainDetail(gb.terrain)})
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
  /* v2.4.2：行动焦点从 #gbPane 迁到 #gbArena —— 只有广场里的芯片参与暗化/放大，
     与下方的日志抽屉互不干扰（抽屉打开时广场被压缩，焦点仍只作用于广场）。
     放大（transform:scale）由 CSS 挂在 .gb-arena-unit.gb-acting 上，
     只在 .gb-arena 的 overflow:hidden 里生效 —— 见 index.css 的说明。 */
  var arena = document.getElementById('gbArena')
  if (arena && arena.classList) arena.classList.toggle('gb-focus', !!(_groupActing && !gb.done))
  if (pane && _gbTab==='log') pane.scrollTop = pane.scrollHeight
  if(copyBtn)copyBtn.addEventListener('click',function(){
    var gb2=_groupBattle
    if(!gb2)return
    /* v2.4.0：文本拼接抽成 groupLogText()（唯一来源）—— 结算面板的「📋 复制战报」共用同一函数 */
    gbCopyText(groupLogText(gb2))
  })
  // v2.1.7：日志展开/收起
  var logToggle=document.getElementById('gbLogToggle')
  if(logToggle)logToggle.addEventListener('click',function(){
    _gbLogAll=!_gbLogAll
    renderGroupOverlay(false)
    var p2=document.getElementById('gbPane')
    if(p2)p2.scrollTop=p2.scrollHeight
  })
  /* v2.4.0 改造 5：日志类型筛选按钮（统一由 renderGroupOverlay 绑定/重绘，_groupStep 不碰 DOM） */
  ov.querySelectorAll('[data-gblogfilter]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var f=btn.getAttribute('data-gblogfilter')
      if(f===_gbLogFilter)return
      _gbLogFilter=f
      renderGroupOverlay(false)
    })
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

/* ============================================================
   v2.4.0 共用：剥掉文案**前导** emoji / 符号与多余空格（行动横幅 + 日志徽章共用）

   为什么不能用 /^\p{Extended_Pictographic}/ 一把梭：本文件刻意保持 ES5 风格
   （var + function，无 ?. / no 解构 —— 见 renderGroupOverlay 之外的一贯写法），
   而 `\p{...}` 需要 u 标志；更稳的判据是「从头上一直剥到第一个**像文字**的字符为止」：
   汉字 / 拉丁字母 / 数字都算文字，其余（emoji、代理对半、箭头、空格、零宽连接符）一律算前导噪声。

   ⚠️ 引擎文案里 emoji 与名字之间有一个空格（`👹 熔岩巨兽`），代理对的两个 code unit
      都是非文字码点 → 循环会一路吃掉 emoji + 空格，落到「熔」上才停 —— 这正是徽章取
      前 2 字所依赖的前提（否则「👹 熔岩巨兽」只能取到一个 emoji）。
   ============================================================ */
function gbStripLeadEmoji(s){
  var t=String(s==null?'':s)
  var i=0
  while(i<t.length){
    var c=t.charCodeAt(i)
    var isWord=(c>=0x30&&c<=0x39)     // 0-9
      ||(c>=0x41&&c<=0x5A)            // A-Z
      ||(c>=0x61&&c<=0x7A)            // a-z
      ||(c>=0x4E00&&c<=0x9FFF)        // CJK 统一表意
      ||(c>=0x3400&&c<=0x4DBF)        // CJK 扩展 A
      ||(c>=0xF900&&c<=0xFAFF)        // CJK 兼容表意
    if(isWord)break
    i++
  }
  /* 中段多余空格压成一个：`⚔️ 剑士  攻击 魔像` → `剑士 攻击 魔像` */
  return t.slice(i).replace(/\s+/g,' ').trim()
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

/* ============================================================
   v2.4.2 战场化：广场（上下对阵舞台）+ 下方那一行速览

   为什么把单位从「垂直卡片列表」改成「上下对阵」：
     · 对阵关系（我方在下、敌方在上）用空间位置直接表达，不用读名字就知道谁打谁；
     · 旧卡片每张 ~125px，5 个敌人就把整屏填满，看不到战场全貌；
     · 卡片里嵌技能/天赋按钮 → axe 的 nested-interactive 违规（点卡片 vs 点标签）。
   广场**必须**待在 #gbPane 之外：.gb-pane 是 overflow-y:auto 的滚动裁剪容器，
   芯片的行动者放大 transform:scale(1.1) 放在里面会横向溢出并顶出横向滚动条
   （v2.4.0 实测过这个坑），而 .gb-arena 是 overflow:hidden → 放大被安静裁掉。
   ============================================================ */

/* 战斗页（广场）：行动顺序 + 三区（敌方 → 中央 → 我方），顺序固定不可调换。
   ⚠️ 本函数体内**不得**出现行动横幅（横幅归 renderGroupOverlay 的吸顶区），
      也**不得**再渲染 gb-hint 长提示（提示归下方 #gbPane）—— 有测试按源码断言。 */
function renderGroupBattlePane(gb){
  var petCount=0
  gb.allies.forEach(function(u){ if(u._petSpecies) petCount++ })
  /* v2.4.2 实测收口：芯片总数 ≥7（最坏 = 5 我 + 3 敌；实测 240 关敌人最多 3 个）时挂 gb-arena-dense，
     把芯片 72→56px、头像 32→24px —— 否则 360×640 上我方第二行会被 .gb-arena 的 overflow:hidden 裁掉
     （实测 inj3 芯片越界 37px）。判据是**数据总数**，纯展示、不影响任何战斗逻辑。 */
  var totalChips=((gb&&gb.allies)||[]).length+((gb&&gb.enemies)||[]).length
  var h='<div class="gb-arena'+(totalChips>=7?' gb-arena-dense':'')+'" id="gbArena">'
  /* 行动顺序条复用既有 renderGroupOrder(gb)（自带 overflow-x:auto，不参与放大） */
  h+=renderGroupOrder(gb)
  /* 敌方在上（对阵舞台的空间隐喻） */
  h+='<div class="gb-arena-row gb-arena-enemy" id="gbArenaEnemy">'
    +'<div class="gb-side-hdr enemy"><span>🔴 敌方</span></div>'
  gb.enemies.forEach(function(u){h+=renderGroupUnit(u,'enemy')})
  h+='</div>'
  /* 中央留空区：特效（飘字 / 技能名）的落点，纯占位、不放内容 */
  h+='<div class="gb-arena-mid" id="gbArenaMid"></div>'
  /* 我方在下；「🐾 宠物 ×N」沿用 v2.2.27 的合并口径（4 只宠不再印 4 个标签） */
  h+='<div class="gb-arena-row gb-arena-ally" id="gbArenaAlly">'
    +'<div class="gb-side-hdr ally"><span>🟢 我方</span>'
    +(petCount?'<span class="gb-tag pet">🐾 宠物 ×'+petCount+'</span>':'')
    +'</div>'
  gb.allies.forEach(function(u){h+=renderGroupUnit(u,'ally')})
  h+='</div>'
  h+='</div>'
  return h
}

/* 开场刷屏的「一句话」收口。
   起因（作者点名）：开战钩子（player-skill-hooks.js 的 onBattleStart，金身护盾）**给每个队友各推一条**
   `🛡️ <队友名> 金身护盾 +733（吸收伤害…）` → 5 个我方单位就是 5 条同技能事件，全在 `opening` 条目里。
   为什么走这里而不是中央区：`opening` 条目**没有 bubble 事件**，而中央区只在有施法的步渲染
   （gbShowSkillCast 由 bubble 驱动）→ 开头这段只能由战斗页那一行文本兜住；日志页保持逐条原样（复盘需要全量）。

   口径（纯数据派生，**不编造**）：
     · 只认 `🛡️ <名> <技能名> +<数字>` 这一族（开战护盾），按**技能名**归组；
     · 同一技能名出现 ≥2 次才输出（1 条就不必压）；
     · 输出 `🛡️ 开场：<技能名> → 我方 N 人（合计 +S）`，N 与 S 都是**实测值**；
     · **不写「你 对全队施加了 X」**：opening 条目的 `unit` 就是「开场」，日志里没有施法者身份，
       据实写成 `我方 N 人` 而不是猜一个施法者。 */
var GB_OPEN_SHIELD_RX=/^🛡️\s*(.+?)\s+(\S+?)\s*\+\s*(\d+)/
function gbOpeningSummary(gb){
  var logs=(gb&&gb.log)||[]
  var entry=null
  for(var i=0;i<logs.length;i++){ if(logs[i]&&logs[i].opening){ entry=logs[i]; break } }
  if(!entry)return ''
  var groups={}, order=[]
  ;(entry.events||[]).forEach(function(e){
    var m=(e&&e.msg)?GB_OPEN_SHIELD_RX.exec(e.msg):null
    if(!m)return
    var k=m[2]
    if(!groups[k]){ groups[k]={n:0,sum:0}; order.push(k) }
    groups[k].n++; groups[k].sum+=Number(m[3])||0
  })
  if(!order.length)return ''
  var k=order[0], g=groups[k]
  if(g.n<2)return ''
  return '🛡️ 开场：'+escHtml(k)+' → 我方 '+g.n+' 人（合计 +'+g.sum+'）'
}

/* 广场下方那一行：阵容速览 + 开场一句话 + 操作提示（单位芯片已上移，这里不重复渲染任何芯片）。
   为什么留这一行：广场是 overflow:hidden 的舞台，人数、开场情况与操作方式需要一个**可读的文本**出口。 */
function gbLineupHtml(gb){
  var allies=(gb&&gb.allies)||[]
  var foes=(gb&&gb.enemies)||[]
  var petCount=0
  allies.forEach(function(u){ if(u._petSpecies) petCount++ })
  var open=gbOpeningSummary(gb)
  return '<div class="gb-lineup">🟢 我方 '+allies.length+' 人'
    +(petCount?'（🐾 宠物 ×'+petCount+'）':'')
    +' · 🔴 敌方 '+foes.length+' 人</div>'
    +(open?'<div class="gb-lineup gb-lineup-open">'+open+'</div>':'')
    +'<div class="gb-hint">👆 点单位看完整属性 · 技能与天赋在详情里</div>'
}

/* ============================================================
   v2.4.0 改造 5：日志页升级（行动者徽章 / 数字高亮 / 类型筛选）
   ============================================================ */
/* 筛选维度（与 logEventClass 的类名对应；terrain 归「伤害」= 场地伤害也是伤害） */
var GB_LOG_FILTERS=[
  {k:'all',t:'全部'},{k:'dmg',t:'伤害'},{k:'heal',t:'治疗'},{k:'status',t:'状态'},{k:'talent',t:'天赋'}
]
/* 单条事件是否命中当前筛选 */
function gbLogEvMatch(e,filter){
  if(!filter||filter==='all')return true
  var c=logEventClass(e)
  if(filter==='dmg')return c==='dmg'||c==='terrain'
  if(filter==='heal')return c==='heal'
  if(filter==='status')return c==='status'||c==='buff'||c==='warn'
  if(filter==='talent')return c==='talent'
  return true
}
/* 过滤后的日志条目（**截断之前**先过滤 —— 见 renderGroupLogPane 的只用最近 8 条） */
function gbLogEntries(gb){
  var out=[]
  ;((gb&&gb.log)||[]).forEach(function(l){
    /* v2.4.4：先折叠「蓄力」那条自相矛盾的到期文案（与战报文本共用 gbDropChargeNoise，唯一实现） */
    var evs=gbDropChargeNoise((l&&l.events)||[]).filter(function(e){
      return e&&e.msg&&e.type!=='bubble'&&(_gbLogFilter==='all'||gbLogEvMatch(e,_gbLogFilter))
    })
    /* 「全部」保留无事发生的回合（既有「（本回合无事发生）」文案），筛选态则丢掉空条目 */
    if(_gbLogFilter==='all'||evs.length)out.push({l:l,events:evs})
  })
  return out
}
/* 行动者徽章：**先剥前导 emoji 再取前 2 字**（否则 `👹 熔岩巨兽` 只剩一个 emoji） */
function gbActorBadge(l,idx){
  var nm=gbStripLeadEmoji((l&&l.unit)||'单位')
  var short=nm.slice(0,2)
  var u=(l&&l.unit&&idx)?idx.byName[l.unit]:null
  var tone=(l&&l.terrain)?'terrain':((l&&l.opening)?'opening':(u?(u.side==='ally'?'ally':'enemy'):'none'))
  return '<span class="gb-log-actor-badge tone-'+tone+'" title="'+escHtml(nm)+'">'+escHtml(short)+'</span>'
}
/* 数字高亮：在 escHtml() **之后**做（先转义再插标签，否则标签会被转义掉） */
function gbLogEvHtml(e){
  var cls=logEventClass(e)
  var s=escHtml(e.msg)
  if(cls==='dmg')s=s.replace(/→\s*(\d+)\s*((?:魂)?伤害)/g,'→ <b class="dmg-num">$1</b> $2')
  if(cls==='heal')s=s.replace(/\+\s*(\d+)/g,'+<b class="heal-num">$1</b>')
  return '<div class="gb-log-ev '+cls+'">'+s+'</div>'
}

/* ============================================================
   v2.4.5：日志页阶段分组（改造 1）

   目标形态（每回合内部按契约顺序分组，只渲染**有事件**的阶段）：
     —— 回合 1 ——
     ▸ 准备阶段
       [行动者] 事件…
     ▸ 行动阶段
       …
   ⚠️ 兜底（契约明确要求）：整段没有任何条目带合法 `phase` 时，
      `gbLogPhaseGroups()` 返回 null → 调用方走**改造前的渲染**（每个条目一个
      `—— 回合 N ——` 头、无阶段标题），输出与改造前逐字等价。
      这样引擎还没落地 / 旧日志 / `opening` 条目缺字段时都不会崩、不会出现 undefined。
   ⚠️ 混合态（同一回合里部分条目带 phase、部分不带，例如引擎迁移到一半的 `opening`）：
      带的走分组，不带的作为「无阶段条目」跟在分组之后，**同样不出阶段标题**。
   ============================================================ */

/* 阶段标题：`▸ 准备阶段`，类名带 ph-N 供 CSS 上色（与 `—— 回合 N ——` 层级区分） */
function gbLogPhaseHeaderHtml(phase){
  var i=gbPhaseIdx(phase)
  return '<div class="gb-log-phase ph-'+(i<0?0:i)+'" data-phase="'+escHtml(phase)+'">▸ '+escHtml(phase)+'阶段</div>'
}
/* 回合头（既有文案，**逐字保留** —— 兜底路径要与之等价，故不「顺手美化」） */
function gbLogTurnLabel(l){
  var x=l||{}
  return '—— '+(x.turn===0?'开场':'回合 '+x.turn)+' ——'
}
/* 单个日志条目的正文（行动者徽章 + 事件行）—— 分组路径与兜底路径**共用**，禁两处各写一套 */
function gbLogEntryHtml(item,idx){
  var l=(item&&item.l)||{}
  var h='<div class="gb-log-actor'+(l.terrain?' terrain':'')+(l.opening?' opening':'')+'">'
    +gbActorBadge(l,idx)+escHtml(gbStripLeadEmoji(l.unit||'单位'))+'</div>'
  var lines=0
  ;((item&&item.events)||[]).forEach(function(e){
    lines++
    h+=gbLogEvHtml(e)
  })
  if(!lines)h+='<div class="gb-log-ev muted">（本回合无事发生）</div>'
  return h
}
/* 按回合切段：同一个 turn 的连续条目 = 一段（阶段分组只在段内做，不跨回合） */
function gbLogTurnChunks(items){
  var out=[],cur=null
  ;(items||[]).forEach(function(it){
    var t=((it&&it.l&&it.l.turn)||0)
    if(!cur||cur.turn!==t){cur={turn:t,items:[]};out.push(cur)}
    cur.items.push(it)
  })
  return out
}
/* 一段（一个回合）内的阶段分组。
   返回 null = 本段没有任何条目带合法 phase → **调用方必须走改造前的渲染**；
   返回 {groups,unphased} = 按契约顺序、只含有事件的阶段 + 无阶段条目（排在最后、不出标题）。 */
function gbLogPhaseGroups(items){
  var all=items||[],phased=0,i
  for(i=0;i<all.length;i++){ if(gbLogPhaseOf(all[i]&&all[i].l))phased++ }
  if(!phased)return null
  var order=gbPhaseOrder(),groups=[]
  for(i=0;i<order.length;i++){
    var grp=all.filter(function(it){ return gbLogPhaseOf(it&&it.l)===order[i] })
    if(grp.length)groups.push({phase:order[i],items:grp})   /* ⚠️ 空阶段不 push → 不出现空标题 */
  }
  var unphased=all.filter(function(it){ return !gbLogPhaseOf(it&&it.l) })
  return {groups:groups,unphased:unphased}
}

/* 日志页：分回合 + 每段标出行动者 + 类型筛选（筛选在「仅最近 8 条」**之前**执行）
   v2.1.14：此前日志只输出裸事件文案，看不出这段是谁的行动；
   场地事件还完全不在 gb.log 里（引擎侧已补）。 */
function renderGroupLogPane(gb){
  var filtered=gbLogEntries(gb)
  var logs=_gbLogAll?filtered:filtered.slice(-8)
  var idx=gbUnitIndex(gb)
  var h='<div class="gb-log-hdr">'
    +'<span class="gb-log-title">📜 战斗日志</span>'
    +(_gbLogAll?'':'<span class="gb-log-note">仅最近 8 条 · 共 '+filtered.length+' 条</span>')
    +'<span style="flex:1"></span>'
    +(filtered.length>8?'<button class="speed-btn sm" id="gbLogToggle">'+(_gbLogAll?'🔼 收起':'🔽 展开全部('+filtered.length+')')+'</button>':'')
    +'<button class="speed-btn sm" id="gbCopyLog">📋 复制</button>'
    +'</div>'
  /* 筛选按钮组：单行可横滑、热区 ≥ --touch-min(44px)、aria-pressed 表达选中态 */
  h+='<div class="gb-log-filters" role="group" aria-label="日志类型筛选">'
    +GB_LOG_FILTERS.map(function(f){
      return '<button type="button" class="gb-log-filter'+(f.k===_gbLogFilter?' on':'')+'" data-gblogfilter="'+f.k+'" aria-pressed="'+(_gbLogFilter===f.k)+'">'+f.t+'</button>'
    }).join('')
    +'</div>'
  h+='<div id="gbLogBox" class="gb-log-box">'
  if(!filtered.length)h+='<div class="gb-log-note">'+(_gbLogFilter==='all'?'战斗开始…':'该类型暂无事件')+'</div>'
  /* v2.4.5 改造 1：回合内按「准备 / 行动 / 判定 / 结束」分组（只渲染有事件的阶段；
     无 phase 的回合走 gbLogPhaseGroups()===null 的兜底分支 = 改造前的渲染，逐字等价） */
  gbLogTurnChunks(logs).forEach(function(chunk){
    var grouped=gbLogPhaseGroups(chunk.items)
    if(!grouped){
      /* 兜底：引擎未落地 / 旧日志整条缺 phase → 保持既有渲染（每个条目一个回合头） */
      chunk.items.forEach(function(item){
        h+='<div class="gb-log-turn">'+gbLogTurnLabel(item.l)+'</div>'+gbLogEntryHtml(item,idx)
      })
      return
    }
    /* 分组态：回合头一个回合只出一个，其后是各阶段标题 + 该阶段的条目 */
    h+='<div class="gb-log-turn">'+gbLogTurnLabel(chunk.items[0].l)+'</div>'
    grouped.groups.forEach(function(g){
      h+=gbLogPhaseHeaderHtml(g.phase)
      g.items.forEach(function(item){ h+=gbLogEntryHtml(item,idx) })
    })
    /* 混合态：无阶段的条目跟在后面，**不出阶段标题**（不猜它属于哪个阶段） */
    grouped.unphased.forEach(function(item){ h+=gbLogEntryHtml(item,idx) })
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
      /* v2.3.2：敌方技能芯片给图标（守卫式，模块缺失时退化为纯文字） */
      var eIco=(typeof skillIconHtml==='function')?skillIconHtml(sid,32,'gb-chip-ico'):''
      out+='<button type="button" class="gb-chip sk '+(cd>0?'cd':'ready')+'" data-skill="'+sid+'" data-uid="'+u.id+'" title="'+escHtml(nm)+'（点看详情）">'
        +eIco+escHtml(nm)+(cd>0?(' ⏳'+cd):' ✓')+'</button>'
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
      /* v2.3.2：玩家技能芯片给图标 */
      var pIco=(typeof skillIconHtml==='function')?skillIconHtml(sid,32,'gb-chip-ico'):''
      out+='<button type="button" class="gb-chip sk '+((active&&cd>0)?'cd':'ready')+'" data-pskill="'+sid+'" data-uid="'+u.id+'" title="'+escHtml(s.name)+' Lv'+lv+'（点看详情）">'
        +pIco+escHtml(s.name)+'<span class="gb-chip-lv">Lv'+lv+'</span>'+tail+'</button>'
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

/* ============================================================
   v2.3.3 WP-I：战斗页宠物头像（作者原话「战斗页面，宠物图标也要实装」）

   唯一入口 = pet-ui.js 的 **petIconStageHtml()**（内部即 petIconHtml()）——
   与宠物列表卡 / 详情页 / 参战芯片 / 对比芯片 / 挑战结算面板同一个入口，
   这里**不硬拼 <img> 路径**；缺 SVG 时它自己退回阶段 emoji（🐾），
   既不会出现裂图，也不会返回空串把卡片搞塌陷。

   ⚠️ 尺寸必须是 16 的倍数（图标 16×16 逻辑格、1 格 = 3px），且必须**落在既有行高内**：
      单位卡名字行实测 21px（`--fs-lg` 17px 的行盒）、血条行 22px、技能行 25px，
      16 的倍数里只有 **16** 能塞进名字行 → 取 16，整卡高度 0 变化（作者对该页的唯一硬要求：
      战斗页不得变密）。取 32 会把名字行顶到 32px → 整卡 96.4 → 107.4px（每只 +11.4px）。
   ⚠️ 只给**我方宠物**（`unit._petSpecies`，pet-codex.js 的 createPetUnit 挂的）：
      玩家（🧑 你）没有头像槽、敌方走怪物原型线（monster-archetype.js），都不套宠物头像。
   ============================================================ */
var GB_PET_ICO_SIZE = 16

/* 我方宠物单位的头像片段（<img> 或 emoji 兜底；非宠物返回 ''）。
   ⚠️ **不带容器**：单位卡与队伍条芯片的容器要求不同 ——
      单位卡用 .gb-ico（inline-flex，与怪兽头像同一套）；
      队伍条芯片用 .has-ico（flex + 定高 16px 的 <img> 直接作 flex item），
      因为 inline-flex 容器会把行盒按「基线对齐」撑高 3px，把 .gb-order 顶高。 */
function gbPetIconHtml(u){
  if(!u||!u._petSpecies)return ''
  if(typeof petIconStageHtml!=='function')return ''
  /* 参战前提是「成熟」（canPetBattle），故 stage 恒为 'mature' → 兜底 emoji 为 🐾 */
  return petIconStageHtml(u._petSpecies,GB_PET_ICO_SIZE,'mature')
}

/* 同上，但包一层 .gb-ico（单位卡名字行 / 阵亡折叠行用）。
   这两行都是 flex 行，inline-flex 的容器只会成为一个 16px 高的 flex item，
   **不参与行盒的基线计算** → 行高不变。 */
function gbPetIconBoxHtml(u){
  var s=gbPetIconHtml(u)
  return s?('<span class="gb-ico">'+s+'</span>'):''
}

/* 行动顺序条：取当前行动队列，列出接下来最多 5 个出手单位（v2.1.7） */
var _gbLogAll=false
/* v2.4.0 改造 5：日志类型筛选（与 _gbLogAll 同级；每次开战重置为 'all'，见 startGroupTrial） */
var _gbLogFilter='all'
function renderGroupOrder(gb){
  var q = gb && gb._stepQueue
  if(!q || !q.length) return ''
  var idx = gb._stepIdx || 0
  var out='<div class="gb-order" role="list" aria-label="行动顺序">'
  var shown=0
  for(var i=idx;i<q.length&&shown<5;i++){
    var u=q[i]
    if(!u||u.hp<=0)continue
    /* v2.3.3：队伍条小芯片也带宠物头像。芯片文字行盒 16px、原件高 24px；
       16px 头像作 flex item 后芯片 = 16+8+2 = 26px，与「当前行动」芯片（带 ▶，26px）等高
       → **.gb-order 容器高度 38px 不变**（取 32px 才会把整条抬到 54px）。
       头像放在芯片**最左**且不套 .gb-ico 容器：这样「▶ 名字」保持连续文本 → 只吃 1 个
       gap(4px)，头像净占 20px；若插在「▶」与名字之间则要 2 个 gap（净占 24px），
       360px 视口下会把 .gb-order 撑出横向滚动（实测 368 > 360）。
       只在真有 SVG 时加 .has-ico（emoji 兜底走原行内排版，芯片高度不变）。 */
    var pIco=gbPetIconHtml(u)
    /* 行内排版的 emoji 兜底要自己带空格（img 走 flex gap，不需要） */
    var icoPre=(pIco.indexOf('<img')===0)?pIco:(pIco?pIco+' ':'')
    out+='<span class="gb-order-chip '+u.side+(shown===0?' now':'')
      +(pIco.indexOf('<img')===0?' has-ico':'')+'" role="listitem">'
      +icoPre+(shown===0?'▶ ':'')+u.name+'</span>'
    shown++
  }
  out+='</div>'
  return out
}

/* 威吓幅度文案（v2.2.22）：不再写死「攻击 -40%」。
   取值优先单位级 `_intimidateDown`（talent.js onBattleStart 按 §5.1.7 区间 [10%,50%] 写入），
   缺失时回落到 talent.js 的兜底常量 INTIMIDATE_ATK_DOWN（旧口径 0.4）。 */
function intimidatePct(u){
  var d=(u&&typeof u._intimidateDown==='number')?u._intimidateDown
       :((typeof INTIMIDATE_ATK_DOWN==='number')?INTIMIDATE_ATK_DOWN:0.4)
  return Math.round(d*100)
}

/* 取名字的**前导 emoji**（`🧑 你` → `🧑`）。
   ⚠️ 与 gbStripLeadEmoji 是同一套「剥到第一个像文字的字符为止」判据，
   但那个函数被行动横幅 / 日志徽章共用（特效组的范围），故这里**另起一个**、
   不去改它 —— 两者口径要一起改时请同步，否则玩家头像会与横幅的取名口径分叉。 */
function gbLeadEmoji(s){
  var t=String(s==null?'':s)
  var i=0
  while(i<t.length){
    var c=t.charCodeAt(i)
    var isWord=(c>=0x30&&c<=0x39)     // 0-9
      ||(c>=0x41&&c<=0x5A)            // A-Z
      ||(c>=0x61&&c<=0x7A)            // a-z
      ||(c>=0x4E00&&c<=0x9FFF)        // CJK 统一表意
      ||(c>=0x3400&&c<=0x4DBF)        // CJK 扩展 A
      ||(c>=0xF900&&c<=0xFAFF)        // CJK 兼容表意
    if(isWord)break
    i++
  }
  return t.slice(0,i).trim()
}

/* 芯片上的显示名（≤4 字）：先剥前导 emoji、再剥**档位前缀**，最后截断。
   为什么必须剥前缀：名字上限 4 字，而引擎的敌人名带档位前缀（`Boss·混沌魔` / `精英·狂战` /
   `杂兵·弓`）→ 直接截断会把「Boss·混沌魔」显示成 `Boss`、把「精英·狂战」显示成 `精英·狂`，
   关键是**同一档位下多个单位会显示成同一个词**（全是 `Boss`），芯片就丧失了辨识度。
   剥掉前缀后：`混沌魔` / `狂战` / `弓` —— 前缀信息由**头像（怪物原型）与阵营色**承载。
   完整名字仍原样进 data-name / title / aria-label（场地事件反查与读屏都用它，见 gbCardForEvent）。 */
function gbUnitShortName(name){
  var s=gbStripLeadEmoji(name)
  s=s.replace(/^(?:BOSS|Boss|boss|BOSS·)\s*[·:：\-]\s*/,'')
     .replace(/^(?:精英|杂兵|护卫|首领|头目)\s*[·:：\-]\s*/,'')
  return s.slice(0,4)||String(name==null?'':name).slice(0,4)
}

/* 渲染单个群战单位 —— v2.4.2 起是**战场芯片**（不再是整张卡）。
   芯片里只留 4 件信息：头像 / 名字 / 血条 / 状态。
   攻防速魂、技能冷却、天赋名一律移入详情面板（点芯片打开）：
     · 旧卡片实测 ~125px 高，5 个敌人就能填满广场，看不出对阵关系；
     · 卡片里嵌技能/天赋 button 会被 axe 判 nested-interactive（role=button 里套 button），
       芯片内**不含任何可聚焦子元素**，该违规随之消失。
   ⚠️ 函数名与第二个参数 side 是既有契约（测试按函数名 + 字符窗口断言
      `side !== 'ally'` 与 monsterIconHtmlByName 调用），不得改名、不得换等价写法。 */
function renderGroupUnit(u,side){
  var hpPct=u.hp<=0?0:Math.round(u.hp/u.base.hp*100)
  var dead=u.hp<=0
  var low=!dead&&hpPct<=25
  var acting=(_groupActing===u.id)
  var cls='gb-unit gb-arena-unit'+(acting?' gb-acting':'')+(dead?' gb-dead':'')+(low?' gb-low':'')
  var barColor=dead?'var(--text3)':hpPct>50?'var(--green)':hpPct>25?'var(--orange)':'var(--red)'
  var full=escHtml(u.name==null?'':u.name)
  /* 头像优先级（三选一，一律包进 .gb-arena-ico）：
       敌方 → 怪物原型头像（32px，与 16 的倍数契约一致；名字匹配不上时映射内部兜底，
              不会出现空图标）
       我方宠物 → gbPetIconBoxHtml(u)（内部即 petIconHtml，带 .pet-ico 与 alt=""，
              无 SVG 时退回 🐾 —— 不套 <img> 就不会有裂图）
       玩家 → 名字的前导 emoji（🧑），没有 emoji 时退回首字
     `side !== 'ally'` 这个写法本身是测试断言的字符窗口契约。 */
  var ico=''
  if(side !== 'ally' && typeof monsterIconHtmlByName === 'function'){
    ico=monsterIconHtmlByName(u.name, u._tier === 'boss', 32)
  }
  if(!ico&&u._petSpecies)ico=gbPetIconBoxHtml(u)
  if(!ico){
    var raw=String(u.name==null?'':u.name)
    ico='<span class="gb-arena-ico-txt">'+escHtml(gbLeadEmoji(raw)||raw.slice(0,1))+'</span>'
  }
  /* 名字：只显示前 4 字（超出靠 CSS text-overflow:ellipsis 兜底），
     完整名字进 title 与 aria-label —— 截断只影响观感，不影响可读性与读屏。
     v2.4.2：完整名字**另存一份 data-name** —— 场地事件（受碎石伤害/被闪电击中）没有 targetId，
     只能靠文案里的名字反查芯片，而显示文字已截断成 ≤4 字、匹配不上（见 gbCardForEvent）。
     data-name 是那次反查的唯一依据，不得删。 */
  var short=gbUnitShortName(u.name)
  /* 状态：最多 3 个图标，多出的折成 +N；阵亡单位不渲染状态
     （血量恒 0，冷却/状态已无意义 —— 阵亡靠 .gb-dead 灰化 + 名字删除线表达）。 */
  var st=''
  if(!dead){
    var sts=u.statuses||[]
    var shown=0
    for(var i=0;i<sts.length&&shown<3;i++){
      var ic=statusIcon(sts[i].id)
      if(!ic)continue
      st+=ic
      shown++
    }
    if(sts.length>shown)st+='<span class="gb-arena-st-more">+'+(sts.length-shown)+'</span>'
    /* 威吓标记：芯片里只留一个 😱（幅度属「攻」数字，按契约移出芯片 ——
       具体 -N% 在详情面板里如实显示，见 renderGroupDetail 的威吓行） */
    if(u._intimidated)st+='<span class="gb-arena-st-i" title="被威吓中：攻击下降（点开看幅度）">😱</span>'
  }
  return '<div class="'+cls+'" data-uid="'+u.id+'" data-name="'+full+'" role="button" tabindex="0" aria-label="'+full+' 详情"'+(acting?' aria-current="true"':'')+'>'
    +'<span class="gb-arena-ico" aria-hidden="true">'+ico+'</span>'
    +'<span class="gb-name" title="'+full+'">'+escHtml(short)+'</span>'
    +'<div class="gb-hp-wrap"><div class="gb-hp-fill" style="width:'+hpPct+'%;background:'+barColor+'"></div></div>'
    +'<div class="gb-arena-st">'+st+'</div>'
    +'</div>'
}

/* 详情面板：属性/技能/天赋/状态/冷却
   v2.1.14：技能行与天赋行改为可点按钮 —— 点开走 #panelOverlay 的完整说明弹层 */
function renderGroupDetail(u){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  /* v2.4.2：详情是**整屏替换** overlay 内容，日志抽屉的 58vh 规则若还挂在根上，
     详情页会被压到 58vh —— 打开详情即摘掉该类（返回时 renderGroupOverlay 会按 _gbTab 重挂）。 */
  if(ov.classList)ov.classList.remove('gb-log-open')
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="gbDetailBack">← 返回</button>'
    +'<span class="det-title">'+escHtml(u.name||'单位')+'</span>'
    +'<span class="det-sub">'+(u.side==='ally'?'我方':'敌方')+' · Lv'+u.level+'</span>'
    +'</div>'
  // 属性
  h+='<div class="det-card">'
  h+='<div class="det-h">📊 属性</div>'
  /* v2.4.2：芯片只留「头像 / 名字 / 血条 / 状态」4 件信息，被移出的信息在这里补齐 ——
     头像（优先级与芯片完全一致：敌方怪物原型 → 我方宠物图标 → 玩家前导 emoji）
     + 血条 +「当前/上限」数字。攻/防/速/魂攻/魂防仍在下面那行（有效值 + ▲▼ 差额）。 */
  var dHpPct=(u.base&&u.base.hp>0)?Math.max(0,Math.round(u.hp/u.base.hp*100)):0
  var dBar=u.hp<=0?'var(--text3)':dHpPct>50?'var(--green)':dHpPct>25?'var(--orange)':'var(--red)'
  var dIco=''
  if(u.side!=='ally'&&typeof monsterIconHtmlByName==='function')dIco=monsterIconHtmlByName(u.name,u._tier==='boss',32)
  if(!dIco&&u._petSpecies)dIco=gbPetIconBoxHtml(u)
  if(!dIco){
    var dRaw=String(u.name==null?'':u.name)
    dIco='<span class="gb-arena-ico-txt">'+escHtml(gbLeadEmoji(dRaw)||dRaw.slice(0,1))+'</span>'
  }
  h+='<div class="det-unit">'
    +'<span class="gb-arena-ico" aria-hidden="true">'+dIco+'</span>'
    +'<div class="gb-hp-wrap"><div class="gb-hp-fill" style="width:'+dHpPct+'%;background:'+dBar+'"></div>'
    +'<span class="gb-hp-text">'+Math.max(0,u.hp)+'/'+u.base.hp+'</span></div>'
    +'</div>'
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
  if(u._intimidated)h+='<div class="det-line warn">😱 被威吓中：攻击 -'+intimidatePct(u)+'%（幅度随关卡/敌人级别 10%~50%；持续 5~10 回合，或威吓者血量低于 50% 时解除）</div>'
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
  var map={sleep:'💤',poison:'☠️',freeze:'❄️',flinch:'😵',wet:'💧',charging:'🔋',possessed:'👻',doomed:'🌑',armorbroken:'💔',slow:'🐌',souldown:'🔮',lastworded:'💀',sleepy:'😪',weaken:'⬇️',vigil:'🛡️',haste:'💨'}
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
  shieldPct:'护盾比例（攻+魂攻）',tauntDur:'嘲讽回合',soulDefDown:'降低魂防比例',freeze:'冰冻回合',ignoreSoulDef:'无视魂防',
  /* WP-I A-2：补齐此前未登记的 effect() 键 —— 漏一个就会把 camelCase 英文标识符直接印在
     「数值对比」表上（真机直证：`reflectPct 0.2 0.2`，应为「破盾反伤比例 20%」）。
     映射表之外的键一律隐藏（见 showPlayerSkillDetail），兜底而不是露英文。 */
  passiveReduce:'常驻减伤比例',perfectChance:'完美格挡几率',perfectMin:'完美格挡减伤下限',perfectMax:'完美格挡减伤上限',
  reflectPct:'破盾反伤比例',spdPct:'速度提升比例',extraMult:'额外攻击倍率',everyTurns:'触发间隔（回合）'}
/* 天赋 hook → 人话触发时机 */
var _HOOK_LABELS={onBattleStart:'战斗开始时（仅一次）',onTurnStart:'自己回合开始',onTurnEnd:'自己回合结束',
  onBeforeAction:'自己行动前（可跳过行动）',onAfterAction:'自己行动后',onDamage:'伤害结算时（攻防双方都会问）',
  onAfterDamage:'自己造成伤害后',onBeforeStatus:'自己将被施加状态时',onAllyStatus:'友方将被施加状态时',
  onAllyDamage:'友方受到伤害时（可分担）',onBeforeHeal:'自己将被治疗时',onFoeHeal:'敌方被治疗时',
  onBeforeHit:'命中判定时',onBeforeCrit:'暴击判定时',
  /* v2.3.0：镜像结界的 onBeforeSupportEffect（受我方/敌方辅助效果时的 ±25% 缩放）。
     此前漏登记 → 天赋详情弹层「触发时机」会把原始 hook id 打印两次（label 与 dim 都是 id）。 */
  onBeforeSupportEffect:'自己将受到辅助效果时'}

/* 比例类数值 → 百分数；倍率类 → 保留两位；布尔 → 是/否（A-2：原先 `true` 会当英文原样打印） */
var _EFFECT_PCT={chance:1,healPct:1,reduce:1,passiveReduce:1,perfectChance:1,perfectMin:1,perfectMax:1,
  atkBoost:1,shieldPct:1,reflectPct:1,soulDefDown:1,spdPct:1}
function fmtEffectVal(k,v){
  if(v==null||v==='')return '—'
  if(typeof v==='boolean')return v?'是':'否'
  if(typeof v!=='number')return String(v)
  if(_EFFECT_PCT[k])return Math.round(v*100)+'%'
  if(k==='power'||k==='extraMult')return (Math.round(v*100)/100)+'×'
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
  /* v2.3.2：⚡ 换成敌方技能图标（isPlayer=false 走敌方 id 空间） */
  var eDetIco=(typeof skillIconHtml==='function')?skillIconHtml(skillId,32,'det-title-ico',false):''
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">'+(eDetIco||'⚡ ')+escHtml(s.name)+'</span>'
    +(unit?('<span class="det-sub">'+escHtml(unit.name)+'</span>'):'')
    +'</div>'
  h+='<div class="det-card"><div class="det-h">📋 基本信息</div>'
  h+=detRow('类别', _SKILL_TYPE_NAMES[s.type]||s.type)
  h+=detRow('目标', _SKILL_TARGET_NAMES[s.target]||s.target||'随机 1 名敌人')
  if(s.type==='attack'){
    /* v2.1.22：带区间 [低,高] 的技能按施法者等级取值 —— 详情页要能看出「区间」与「我这级实际多少」 */
    var rp=(s.range&&s.range.power)?s.range.power:null
    h+=detRow('威力', rp?(rp[0]+'%~'+rp[1]+'%（随技能等级）'):((s.power||0)+'%'))
    if(rp&&unit&&typeof skillLevelOf==='function'&&typeof skillValue==='function'){
      var slv=skillLevelOf(unit,skillId)
      h+=detRow('当前等级', 'Lv'+slv+' → 实际威力 '+Math.round(skillValue(s,'power',slv))+'%')
    }
    h+=detRow('伤害类型', s.dmgType==='soul'?'魂攻（吃目标魂防）':'物理（吃目标防御）')
  }
  h+=detRow('冷却', (s.cooldown||0)+' 回合'+(s.startCooldown?('（开场即进入 '+s.startCooldown+' 回合冷却）'):''))
  /* v2.4.8（作者裁定「先制度 = 本回合真用了先制技能才先手」）：文案跟着新口径写准。
     修前那版写「出手队列中优先行动」，读起来像「只要持有这个技能就先手」——
     而现在的判据是「本回合**选了**这个技能才进先制档」（准备阶段预声明，见 battle-group.js）。 */
  if(s.priority)h+=detRow('先制度', '+'+s.priority+'（本回合使用该技能时，出手排在所有非先制单位之前）')
  if(unit)h+=detRow('当前状态', cd>0?('冷却中，还需 '+cd+' 回合'):'就绪')
  h+='</div>'
  h+='<div class="det-card"><div class="det-h">📖 效果说明</div>'
  h+='<div class="det-line">'+escHtml(doc?doc.desc:'（该技能暂无说明文案）')+'</div>'
  if(doc&&doc.wip)h+='<div class="det-wip">⚠ 与设计文档不一致：'+escHtml(doc.wip)+'</div>'
  h+='</div>'
  _openDetailPanel(h)
}

/* 场地详情弹层（v2.1.22）
   数据源是 terrain.js 的 desc（唯一来源），这里只做展示。
   设计依据 doc/2.0 敌群设计.md:207「## 场地 —— 对敌我双方均有效」。 */
function showTerrainDetail(terrain){
  if(!terrain){toast('本关没有场地效果','s');return}
  pauseGroupBattle()
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">🌍 '+escHtml(terrain.name)+'</span>'
    +'</div>'
  h+='<div class="det-card"><div class="det-h">🔎 作用范围</div>'
  h+='<div class="det-line">对<strong>敌我双方</strong>均有效 —— 场地不偏向任何一方：'
    +'加成与损伤同时作用于你和敌人（设计文档：<code>doc/2.0 敌群设计.md</code> §场地）。</div>'
  h+='</div>'
  h+='<div class="det-card"><div class="det-h">📖 效果</div>'
  var segs=String(terrain.desc||'').split('；')
  segs.forEach(function(seg){
    seg=seg.trim()
    if(seg)h+='<div class="det-line">· '+escHtml(seg)+'</div>'
  })
  if(!terrain.desc)h+='<div class="det-line">（该场地暂无说明文案）</div>'
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
  /* v2.3.2：⚡ 换成技能图标（守卫式，模块缺失时保留 ⚡ 降级） */
  var pDetIco=(typeof skillIconHtml==='function')?skillIconHtml(skillId,32,'det-title-ico',true):''
  var h='<div class="det-hdr">'
    +'<button class="speed-btn" id="detailClose">← 返回</button>'
    +'<span class="det-title">'+(pDetIco||'⚡ ')+escHtml(s.name)+'</span>'
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
      /* WP-I A-2：映射表未登记的键直接隐藏（兜底），绝不把英文标识符 `reflectPct` 之类露给用户 */
      if(!_EFFECT_LABELS[k])return
      var a=(cur&&cur[k]!=null)?cur[k]:'—'
      var b=(max&&max[k]!=null)?max[k]:'—'
      h+='<div class="det-kv"><span class="det-k">'+escHtml(_EFFECT_LABELS[k])+'</span><span class="det-v">'+escHtml(fmtEffectVal(k,a))+'</span><span class="det-v2">'+escHtml(fmtEffectVal(k,b))+'</span></div>'
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

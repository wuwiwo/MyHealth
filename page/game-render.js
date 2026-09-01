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
    +'<div class="period-hdr"><span>🗓️ 本旬目标 · '+p.name+' <span style="font-size:.6rem;color:var(--text3)">'+dateRange+'</span></span><span class="period-stamp">结算预告</span></div>'
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

  var gc=document.getElementById('gameContent')
  // First-time game guide (dismissible, remembered) — dedupe across re-renders
  var oldGuide=document.getElementById('gameGuide')
  if(oldGuide)oldGuide.remove()
  if(!localStorage.getItem('dh-game-guide-done')){
    var guide=document.createElement('div');guide.id='gameGuide'
    guide.style='background:var(--bg2);border:1px solid var(--orange-g);border-radius:var(--r);padding:12px 14px;margin-bottom:12px;font-size:.72rem;line-height:1.7'
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
  // 敌群试炼入口（M2b，v2.0 准备内容）
  h+='<div class="chapter-hdr" style="margin-top:4px">👥 敌群试炼 <span style="font-size:.65rem;color:var(--text3)">· M2b 多对多战场</span></div><div class="lv-grid">'
  Object.entries(GROUP_LEVELS||{}).forEach(([k,glv])=>{
    h+='<div class="lv-card" data-group="'+glv.id+'" style="border-color:var(--purple-g,#a855f733)"><div class="lv-num">👥</div><div class="lv-name">'+glv.name+'</div><div class="lv-status" style="color:var(--purple,#a855f7)">⚔️ '+glv.enemies.length+' 敌</div></div>'
  })
  h+='</div>'
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
  gc.querySelectorAll('.lv-card[data-group]').forEach(c=>c.addEventListener('click',()=>{
    startGroupTrial(c.dataset.group)
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
      +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">👑 Boss 词缀'+(lv.dualAffix?' (随机2种·机制叠加)':' (随机1种)')+'</div>'
      +affixes.map(function(a){return'<div style="padding:2px 0">• '+a+'</div>'}).join('')
      +(lv.dualAffix?'<div style="margin-top:4px;color:var(--yellow)">⚠️ 本 BOSS 同时携带 2 条词条，效果叠加</div>':'')
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

/* ========== 敌群试炼（M2b 多对多） ========== */
var _groupBattle=null,_groupTimer=null
var _groupMode='auto'   // 'auto' | 'manual'（manual=点一下推进一回合）
var _groupSpeed=1        // 1/2/4
var _groupAnimEl=null    // 动画中的单位
var _groupDetail=null    // 详情面板中的单位 id

/* 启动敌群试炼：生成玩家 Unit + 敌人，开群战 */
function startGroupTrial(groupId){
  var glv=(GROUP_LEVELS||{})[groupId]
  if(!glv){toast('敌群关卡不存在','e');return}
  var stats=getGameStats()
  var player=createUnit({id:'player',side:'ally',name:'🧑 你',level:1,base:{hp:stats.hp,atk:stats.atk,def:stats.def,spd:10,soulAtk:stats.soulAtk||0,soulDef:stats.soulDef||0}})
  var enemies=glv.enemies.map(function(ec,i){
    return createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base})
  })
  _groupBattle=createGroupBattle({allies:[player],enemies:enemies})
  _groupMode='auto';_groupSpeed=1;_groupDetail=null
  renderGroupOverlay(true)
  toast('👥 '+glv.name+' 开始！','s')
  _groupStep()
}

/* 群战推进（自动模式定时循环；手动模式点按钮触发） */
function _groupStep(){
  if(!_groupBattle||_groupBattle.done){_groupDone();return}
  groupBattleTick(_groupBattle)
  renderGroupOverlay(false)
  if(_groupBattle.done){_groupDone();return}
  if(_groupMode==='manual')return   // 手动：等用户点下一回合
  _groupTimer=setTimeout(_groupStep,600/_groupSpeed)
}

/* 群战结束 */
function _groupDone(){
  if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
  var w=_groupBattle&&_groupBattle.winner
  renderGroupOverlay(false)
  if(w==='ally')toast('🎉 敌群讨伐成功！','s')
  else toast('💀 敌群讨伐失败…','e')
}

/* 渲染群战 overlay：手动/自动 + 调速 + 单位 + 动画 + 详情 + 日志 */
function renderGroupOverlay(show){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  if(show)ov.classList.add('open')
  if(!_groupBattle){ov.classList.remove('open');return}
  var gb=_groupBattle
  var h='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="gbClose" style="padding:2px 8px">✕</button>'
    +'<span style="font-size:.85rem;font-weight:700">👥 '+gb.enemies.length+'敌 · 回合 '+gb.turn+'</span>'
    +'<span style="flex:1"></span>'
    // 手动/自动切换
    +'<button class="speed-btn" id="gbMode" style="padding:2px 8px;'+( _groupMode==='manual'?'border-color:var(--orange);color:var(--orange)':'')+'">'+(_groupMode==='manual'?'✋ 手动':'🤖 自动')+'</button>'
    // 调速（自动模式）
    +(_groupMode==='auto'?'<button class="speed-btn" id="gbSpeed" style="padding:2px 8px">'+_groupSpeed+'×</button>':'')
    // 手动：推进一回合按钮
    +(_groupMode==='manual'?'<button class="speed-btn" id="gbStep" style="padding:2px 12px;border-color:var(--green);color:var(--green)">⏭️ 下一回合</button>':'')
    +'</div>'
  // 我方
  h+='<div style="margin-bottom:4px;font-size:.72rem;color:var(--green)">🟢 我方</div>'
  gb.allies.forEach(function(u){h+=renderGroupUnit(u,'ally')})
  // 敌方
  h+='<div style="margin:8px 0 4px;font-size:.72rem;color:var(--red)">🔴 敌方</div>'
  gb.enemies.forEach(function(u){h+=renderGroupUnit(u,'enemy')})
  // 日志（最近 8 条）
  var recent=gb.log.slice(-8)
  h+='<div style="margin-top:10px;font-size:.68rem;line-height:1.6;color:var(--text3);max-height:110px;overflow-y:auto;border-top:1px solid var(--bg2);padding-top:6px">'
  recent.forEach(function(l){
    l.events.forEach(function(e){h+='<div>'+e.msg+'</div>'})
  })
  h+='</div>'
  ov.innerHTML=h
  // 事件绑定
  var closeBtn=document.getElementById('gbClose')
  if(closeBtn)closeBtn.addEventListener('click',function(){ov.classList.remove('open');_groupBattle=null;if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}})
  var modeBtn=document.getElementById('gbMode')
  if(modeBtn)modeBtn.addEventListener('click',function(){
    _groupMode=_groupMode==='auto'?'manual':'auto'
    if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
    if(_groupMode==='auto')_groupStep()
    else renderGroupOverlay(false)
  })
  var speedBtn=document.getElementById('gbSpeed')
  if(speedBtn)speedBtn.addEventListener('click',function(){
    _groupSpeed=_groupSpeed===1?2:_groupSpeed===2?4:1
    if(_groupTimer){clearTimeout(_groupTimer);_groupTimer=null}
    _groupStep()
  })
  var stepBtn=document.getElementById('gbStep')
  if(stepBtn)stepBtn.addEventListener('click',function(){_groupStep()})
  // 单位点击：看详情
  ov.querySelectorAll('.gb-unit').forEach(function(el){
    el.addEventListener('click',function(){
      var uid=el.getAttribute('data-uid')
      var u=gb.units.find(function(x){return x.id===uid})
      if(!u)return
      _groupDetail=uid
      renderGroupDetail(u)
    })
  })
  // 攻击动画（高亮受伤单位）
  if(_groupAnimEl){
    var el=ov.querySelector('.gb-unit[data-uid="'+_groupAnimEl+'"]')
    if(el){el.classList.add('gb-hit');setTimeout(function(){el.classList.remove('gb-hit')},400)}
    _groupAnimEl=null
  }
}

/* 渲染单个群战单位（可点击：详情/选目标） */
function renderGroupUnit(u,side){
  var hpPct=u.hp<=0?0:Math.round(u.hp/u.base.hp*100)
  var color=side==='ally'?'var(--green)':'var(--red)'
  var statusIcons=(u.statuses||[]).map(function(s){return statusIcon(s.id)}).join('')
  var talentTag=u._talents&&u._talents.length?'<span style="font-size:.58rem;color:var(--purple,#a855f7)">天赋×'+u._talents.length+'</span>':''
  var skillTag=u.skills&&u.skills.length?'<span style="font-size:.58rem;color:var(--blue)">技×'+u.skills.length+'</span>':''
  var anim=u.hp<=0?'opacity:.35':''
  return '<div class="gb-unit" data-uid="'+u.id+'" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bg2);cursor:pointer;'+anim+'">'
    +'<span style="width:74px;font-size:.75rem;color:'+color+'">'+u.name+'</span>'
    +'<div style="flex:1;height:10px;background:var(--bg2);border-radius:5px;overflow:hidden;position:relative">'
    +'<div style="width:'+hpPct+'%;height:100%;background:'+(hpPct>50?'var(--green)':hpPct>25?'var(--orange)':'var(--red)')+';transition:width .3s"></div>'
    +'</div>'
    +'<span style="width:52px;font-size:.62rem">'+u.hp+'/'+u.base.hp+'</span>'
    +statusIcons+talentTag+skillTag
    +'</div>'
}

/* 详情面板：属性/技能/天赋/状态/冷却 */
function renderGroupDetail(u){
  var ov=document.getElementById('battleOverlay')
  if(!ov)return
  var h='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    +'<button class="speed-btn" id="gbDetailBack" style="padding:2px 8px">← 返回</button>'
    +'<span style="font-size:.9rem;font-weight:700">'+(u.name||'单位')+'</span>'
    +'<span style="font-size:.65rem;color:var(--text3)">'+u.side+' · Lv'+u.level+'</span>'
    +'</div>'
  // 属性
  h+='<div style="font-size:.72rem;line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h+='<div style="font-weight:700;margin-bottom:4px">📊 属性</div>'
  h+='❤️ HP <b>'+u.hp+'</b>/'+u.base.hp+'　⚔️ 攻 <b>'+u.base.atk+'</b>　🛡️ 防 <b>'+u.base.def+'</b>'
  h+='　💨 速 <b>'+u.base.spd+'</b>'+(u.base.soulAtk?'　👻 魂攻 <b>'+u.base.soulAtk+'</b>':'')+(u.base.soulDef?'　🔮 魂防 <b>'+u.base.soulDef+'</b>':'')
  h+='</div>'
  // 技能
  h+='<div style="font-size:.72rem;line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h+='<div style="font-weight:700;margin-bottom:4px">⚡ 技能</div>'
  if(!u.skills||!u.skills.length){h+='<div style="color:var(--text3)">（无技能，普通攻击）</div>'}
  else{
    u.skills.forEach(function(sid){
      var s=SKILLS[sid]
      if(!s)return
      var cd=skillCooldownLeft(u,sid)
      h+='<div>'+s.name+' <span style="color:var(--text3)">· '+s.type+(s.power?' · '+s.power+'%':'')+(cd?' · 冷却'+cd:'')+'</span></div>'
    })
  }
  h+='</div>'
  // 天赋
  h+='<div style="font-size:.72rem;line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h+='<div style="font-weight:700;margin-bottom:4px">✨ 天赋</div>'
  if(!u._talents||!u._talents.length){h+='<div style="color:var(--text3)">（无天赋）</div>'}
  else{
    u._talents.forEach(function(tid){
      var t=TALENTS[tid]
      if(!t)return
      h+='<div>'+t.name+' <span style="color:var(--text3)">· '+t.desc+'</span></div>'
    })
  }
  h+='</div>'
  // 状态
  h+='<div style="font-size:.72rem;line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:8px 10px">'
  h+='<div style="font-weight:700;margin-bottom:4px">🌀 状态</div>'
  if(!u.statuses||!u.statuses.length){h+='<div style="color:var(--text3)">（无状态）</div>'}
  else{
    u.statuses.forEach(function(st){
      var def=getStatusDef(st.id)
      h+='<div>'+statusIcon(st.id)+' '+getStatusName(st.id)+(def&&def.grade?' <span style="color:var(--text3)">[等级'+def.grade+']</span>':'')+' <span style="color:var(--text3)">剩余'+st.duration+'回合'+(st.stacks>1?' · '+st.stacks+'层':'')+'</span></div>'
    })
  }
  h+='</div>'
  ov.innerHTML=h
  var back=document.getElementById('gbDetailBack')
  if(back)back.addEventListener('click',function(){_groupDetail=null;renderGroupOverlay(false)})
}

/* 状态图标映射 */
function statusIcon(id){
  var map={sleep:'💤',poison:'☠️',freeze:'❄️',flinch:'😵',wet:'💧',charging:'🔋',possessed:'👻',doomed:'🌑',armorbroken:'💔',slow:'🐌',souldown:'🔮',lastworded:'💀',sleepy:'😪'}
  return '<span title="'+id+'">'+(map[id]||'')+'</span>'
}

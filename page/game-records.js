/* ============================================
   MyHealth - Game Tab: Records & Attribute Log (from tab-game.js)
   Level tracking, stats history, monthly best
   ============================================ */
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
  // 完整记录：只要属性或来源变化就记（同一天多次变化也记，如训练后挑战又加属性）
  var changed=!last||last.atk!==stats.atk||last.def!==stats.def||last.hp!==stats.hp
  var srcChanged=last&&(last.challengeAtk!==(stats.challengeAtk||0)||last.challengeDef!==(stats.challengeDef||0))
  if(changed||srcChanged){
    var atkDiff=last?stats.atk-last.atk:0
    var defDiff=last?stats.def-last.def:0
    var hpDiff=last?stats.hp-last.hp:0
    var strVolDiff=last&&last.strVol?detail.strVol-last.strVol:detail.strVol
    var carEffDiff=last&&last.carEff?detail.carEff-last.carEff:detail.carEff
    var reason=[]
    if(strVolDiff)reason.push('容量'+(strVolDiff>0?'+':'')+strVolDiff+'kg')
    if(carEffDiff)reason.push('有效有氧'+(carEffDiff>0?'+':'')+carEffDiff+'min')
    if(stats.permBonusAtk>0)reason.push('旬奖励攻+'+stats.permBonusAtk+'防+'+stats.permBonusDef)
    if((stats.challengeAtk||0)>0||(stats.challengeDef||0)>0)reason.push('隐藏挑战⚔️+'+stats.challengeAtk+'🛡️+'+stats.challengeDef+'❤️+'+stats.challengeHp)
    if(stats.permPenAtk||stats.permPenDef)reason.push('惩罚攻-'+stats.permPenAtk+'防-'+stats.permPenDef)
    if(atkDiff||defDiff||hpDiff)reason.push('总变化攻'+(atkDiff>0?'+':'')+atkDiff+'防'+(defDiff>0?'+':'')+defDiff+'血'+(hpDiff>0?'+':'')+hpDiff)
    log.push({
      date:now,time:new Date().toTimeString().slice(0,5),atk:stats.atk,def:stats.def,hp:stats.hp,
      atkDiff:atkDiff,defDiff:defDiff,hpDiff:hpDiff,
      reason:reason.join(' · ')||'属性变化',
      wkDays:stats.periodDays,
      strVol:detail.strVol,carEff:detail.carEff,
      challengeAtk:stats.challengeAtk||0,challengeDef:stats.challengeDef||0
    })
    if(log.length>100)log=log.slice(-100)
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
  var modal=openModal()
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📜 属性变更日志</div><div style="max-height:60vh;overflow-y:auto;font-size:.75rem">'
  for(var i=log.length-1;i>=0;i--){
    var l=log[i]
    function dl(v){return v>0?'<span style="color:var(--green)">+'+v+'</span>':v<0?'<span style="color:var(--red)">'+v+'</span>':''}
    var dlAtk=dl(l.atkDiff),dlDef=dl(l.defDiff),dlHp=dl(l.hpDiff)
    var attrs='⚔️ <b>'+l.atk+'</b>'+dlAtk+' 🛡️ <b>'+l.def+'</b>'+dlDef+' ❤️ <b>'+l.hp+'</b>'+dlHp
    h+='<div style="padding:10px 0;border-bottom:1px solid var(--bd)">'
      +'<div style="font-weight:700;font-size:.8rem">'+l.date+(l.time?' <span style="font-weight:400;color:var(--text3);font-size:.65rem">'+l.time+'</span>':'')+'</div>'
      +'<div style="font-size:.85rem;margin:2px 0">'+attrs+'</div>'
      +'<div style="color:var(--text2);margin-bottom:2px">'+l.reason+'</div>'
      +'<div style="color:var(--text3);font-size:.65rem">训练'+l.wkDays+'天</div>'
      +'</div>'
  }
  h+='</div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>'
  modal.innerHTML=h;void modal
  document.getElementById('attrClose').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}


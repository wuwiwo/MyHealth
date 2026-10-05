/* ============================================
   MyHealth — Tab: Strength
   ============================================ */

let _strDate=today(),_strSelW=COMMON_W[4],_strForm=false;

/* ========== TODAY SNAPSHOT (weekly + period progress) ========== */
function renderTodaySnapshot(){
  var el=document.getElementById('todaySnapshot');if(!el)return
  var strE=((store.get('strength')||{entries:[]}).entries)||[]
  var carE=((store.get('cardio')||{entries:[]}).entries)||[]
  // Week: Mon-start active days
  var n=new Date(),d=n.getDay(),m=new Date(n)
  m.setDate(n.getDate()+(d===0?-6:1-d))
  var wkStart=toDate(m),wkDays=new Set()
  strE.forEach(function(e){if(e.date>=wkStart)wkDays.add(e.date)})
  carE.forEach(function(e){if(e.date>=wkStart)wkDays.add(e.date)})
  var weekCount=wkDays.size
  // 旬 period progress
  var period=getCurrentPeriod(n)
  var periodDays=countActiveDaysInRange(strE,carE,period.start,period.end)
  var periodVol=sumVolume(strE.filter(function(e){return e.date>=period.start&&e.date<=period.end}),getExerciseMap())
  var bonus=calculatePeriodBonus(periodDays,periodVol,period.volThreshold)
  var trainedToday=strE.some(function(e){return e.date===today()})||carE.some(function(e){return e.date===today()})

  var weekPct=Math.round(weekCount/7*100)
  var dayPct=Math.round(periodDays/6*100)
  var volPct=Math.min(100,Math.round(periodVol/period.volThreshold*100))
  var volColor=volPct>=100?'var(--green)':volPct>=60?'var(--orange)':'var(--text3)'
  var dayColor=periodDays>=6?'var(--green)':periodDays>=4?'var(--orange)':'var(--text3)'
  var statusHtml=trainedToday
    ?'<span style="color:var(--green)">✅ 今天已训练</span>'
    :'<span style="color:var(--text2)">💤 今天还没动</span>'
  var periodLabel=period.name+' ('+period.start.slice(5).replace('-','/')+'~'+period.end.slice(5).replace('-','/')+')'

  el.innerHTML='<div class="snap-card">'
    +'<div class="snap-row"><span class="snap-lbl">📅 本周</span><span class="snap-val">'+weekCount+'<span style="font-size:var(--fs-3xs)">/7天</span></span><div class="snap-bar"><div class="snap-fill wk" style="width:'+weekPct+'%"></div></div>'+(weekCount>=4?'<span style="color:var(--green);font-size:var(--fs-3xs)">🏅 达标</span>':'<span style="color:var(--text3);font-size:var(--fs-3xs)">还差'+(4-weekCount>0?4-weekCount:0)+'天</span>')+'</div>'
    +'<div class="snap-row"><span class="snap-lbl">🗓️ '+periodLabel+'</span><span class="snap-val" style="color:'+dayColor+'">'+periodDays+'<span style="font-size:var(--fs-3xs)">/6天</span></span><div class="snap-bar"><div class="snap-fill" style="width:'+dayPct+'%;background:'+dayColor+'"></div></div>'+(periodDays>=6?'<span style="color:var(--green);font-size:var(--fs-3xs)">🎯 达标</span>':'<span style="color:var(--text3);font-size:var(--fs-3xs)">还差'+(6-periodDays)+'天</span>')+'</div>'
    +'<div class="snap-row"><span class="snap-lbl">🏋️ 旬容量</span><span class="snap-val" style="color:'+volColor+'">'+Math.round(periodVol)+'<span style="font-size:var(--fs-3xs)">/'+period.volThreshold+'</span></span><div class="snap-bar"><div class="snap-fill" style="width:'+volPct+'%;background:'+volColor+'"></div></div>'+(volPct>=100?'<span style="color:var(--green);font-size:var(--fs-3xs)">💯 超额</span>':'<span style="color:var(--text3);font-size:var(--fs-3xs)">'+Math.max(0,Math.round(period.volThreshold-periodVol))+'kg</span>')+'</div>'
    +'<div class="snap-foot">'+statusHtml+' <span style="color:var(--text3);font-size:var(--fs-3xs)">· 满4天获周奖励，满6天获旬奖励</span></div>'
    +'</div>'
}

/* Adapt form based on selected exercise (eqWeight vs dumbbell) */
function adaptStrForm(exName){
  var exMap=getExerciseMap();
  var ex=exMap[exName];
  var wtFg=document.getElementById('strWeightFg');
  var eqInfo=document.getElementById('strEqWeightInfo');
  var eqDisp=document.getElementById('strEqWeightDisplay');
  var repsLabel=document.getElementById('strRepsLabel');
  if(!wtFg)return;
  if(ex&&ex.eqWeight!=null&&ex.type==='strength'){
    wtFg.style.display='none';
    eqInfo.style.display='';
    var unitLabel=ex.unit==='sec'?'秒':'次';
    eqDisp.textContent='⚖️ '+ex.eqWeight+'kg/'+unitLabel+'（ratio '+(ex.ratio||100)+'%）';
    if(repsLabel)repsLabel.textContent=ex.unit==='sec'?'秒数':'次数';
  }else{
    wtFg.style.display='';
    eqInfo.style.display='none';
    if(repsLabel)repsLabel.textContent='次数';
  }
}

/* 当日总容量（力量：等效容量合计 + 组数；有氧：时长合计） */
function renderStrDayVol(d){
  const el=document.getElementById('strDayVol');if(!el)return
  const entries=getStr(d)
  const vol=Math.round(sumVolume(entries,getExerciseMap()))
  const total=entries.reduce((s,e)=>s+e.actualReps,0)
  el.innerHTML='<span>🏋️ 当日力量：<b>'+vol+'</b> kg</span><span>· '+entries.length+' 组 / '+total+' 次</span>'
}
function renderCarDayVol(d){
  const el=document.getElementById('carDayVol');if(!el)return
  const entries=getCar(d)
  const mins=Math.round(sumDuration(entries))
  const eff=Math.round(sumEffectiveDuration(entries,getCardioTypeMap()))
  el.innerHTML='<span>🏃 当日有氧：<b>'+mins+'</b> 分钟</span><span>· 有效 '+eff+' 分</span>'
}

function renderStr(){
  const d=_strDate;const f=fmtDate(d)
  renderTodaySnapshot()
  renderSummonPanel()
  renderStrQuickPicks()   // v2.4.9：常用 / 不常用 动作 chips（每次渲染按最新记录重排）
  document.getElementById('strDateMain').textContent=f.main
  document.getElementById('strDateSub').textContent=f.sub
  renderStrDayVol(d)
  const entries=getStr(d)
  renderStrPlans()
  const el=document.getElementById('strList')
  if(!entries.length){
    el.innerHTML='<div class="empty"><span class="empty-e">💪</span><div class="empty-t">今天还没练</div><div class="empty-s">点击「新增一组」开始记录</div></div>'
  } else {
    el.innerHTML=entries.map(e=>{
      const r=e.targetReps>0?e.actualReps/e.targetReps:0;const p=Math.min(r,1)*100
      const d=r>=1,o=r>1;let sc='under',ac='under'
      if(o){sc='over';ac='over'}else if(r>=1){sc='done';ac='done'}
      const ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''
      var wtLabel;
      if(e.eqWeight!=null){wtLabel='⚖️ '+e.eqWeight+'kg/'+(e.unit==='sec'?'秒':'次')}
      else{wtLabel='● '+e.weight+' kg'}
      var unitSuffix=e.unit==='sec'?'秒':'次'
      // 等效容量与倍率：重量(或等效重量)×实际次数×ratio/100
      var exDef=getExerciseMap()[e.exercise]
      var ratio=(exDef&&exDef.ratio!=null)?exDef.ratio:100
      var effW=(e.eqWeight!=null?e.eqWeight:(e.weight||0))
      var effVol=Math.round(effW*e.actualReps*(ratio/100))
      var ratioTxt=ratio!==100?('<span style="color:var(--text3)">×'+ratio/100+'</span>'):''
      var volTag=effVol>0?'<div class="ec-vol">⚡ 等效 '+effVol+'kg '+ratioTxt+(ratio!==100?'（倍率 '+ratio+'%）':'')+'</div>':''
      /* v2.2.25：条目缺 targetReps（外部同步 / 老存档条目）时不再渲染「目标 undefined 次」；
         与上方 r 的 `e.targetReps>0` 判定同一口径 —— 没有目标就只显示实际值 */
      var tgtTag=e.targetReps>0?'<span class="ec-tgt">目标 '+e.targetReps+' '+unitSuffix+'</span>':''
      /* v2.4.9：条目上多一个 🔁「再来一组相同」（一键复制任意一组，字段与手输一致） */
      return '<div class="ec '+(d?'done':'')+'">'+volTag+'<div class="ec-hdr"><div class="ec-ex">'+e.exercise+'<span class="ec-wt">'+wtLabel+'</span></div><div class="ec-actions"><button class="ec-act" data-a="strRepeat" data-id="'+e.id+'" aria-label="再来一组相同" title="再来一组相同">🔁</button><button class="ec-act" data-a="strEdit" data-id="'+e.id+'" aria-label="编辑这条记录">✏️</button><button class="ec-act" data-a="strDel" data-id="'+e.id+'" aria-label="删除这条记录">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt">'+tgtTag+'<span class="ec-actual '+ac+'">'+e.actualReps+' '+unitSuffix+' '+(d?(o?'🔥':'✅'):'')+'</span></div><div class="ec-bar"><div class="ec-fill '+sc+'" style="width:'+p+'%"></div></div></div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')+strRepeatBarHtml(entries[entries.length-1])
  }
  renderStrStats()
  renderMissed()
}

function renderStrStats(){
  /* v2.2 WP-H3 同口径：`sumVolume()` 返回浮点（1.1×3 = 3.3000000000000003），
     只管展示层取整，不动数值本身。与 tab-strength.js 旬容量 / game-views.js 旬容量卡一致。 */
  const g=document.getElementById('strStats')
  const we=getWeekStr()
  const t=we.length,r=we.reduce((s,e)=>s+e.actualReps,0),v=sumVolume(we,getExerciseMap()),days=new Set(we.map(function(e){return e.date})).size
  const dn=we.filter(function(e){return e.actualReps>=e.targetReps}).length,rate=t>0?Math.round(dn/t*100):0
  const circ=2*Math.PI*31.5
  var exCount={}
  we.forEach(function(e){exCount[e.exercise]=(exCount[e.exercise]||0)+1})
  var fav=Object.keys(exCount).sort(function(a,b){return exCount[b]-exCount[a]})[0]||'—'
  g.innerHTML='<div class="sc sc-rate"><div class="sc-ring"><svg viewBox="0 0 70 70"><circle class="sc-ring__bg" cx="35" cy="35" r="31.5"/><circle class="sc-ring__fill" cx="35" cy="35" r="31.5" stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ-circ*rate/100)+'"/></svg><span class="sc-ring__text">'+rate+'%</span></div><div class="sc-l">完成率</div></div><div class="sc sc-total"><div class="sc-v">'+r+'<span style="font-size:var(--fs-3xs)"> 次</span></div><div class="sc-l">总次数</div></div><div class="sc sc-vol"><div class="sc-v">'+Math.round(v)+'<span style="font-size:var(--fs-3xs)"> kg</span></div><div class="sc-l">总容量</div></div><div class="sc sc-fav"><div class="sc-v" style="font-size:var(--fs-xs)">'+days+'天 · '+fav+'</div><div class="sc-l">本周训练</div></div>'
}
function getWeekStr(){const n=new Date();const d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(store.get('strength')||{entries:[]}).entries.filter(e=>e.date>=toDate(m))}

/* ========== MISSED DAYS ========== */
function renderMissed(){
  const c=document.getElementById('strMissedDays')
  const allDates=[];const d=new Date()
  for(let i=6;i>=0;i--){const t=new Date(d);t.setDate(t.getDate()-i);allDates.push(toDate(t))}
  const activeDays=new Set((store.get('strength')||{entries:[]}).entries.map(e=>e.date))
  const missed=allDates.filter(dd=>!activeDays.has(dd)&&dd<=today())
  if(!missed.length){c.innerHTML='<div style="font-size:var(--fs-xs);color:var(--text3);padding:8px 0">✅ 最近 7 天全勤！</div>';return}
  c.innerHTML=missed.map(dd=>{
    const note=getMissed()[dd]||''
    const isRest=note.indexOf('🛌')===0
    /* WP-I C-02：原来「日期 + ✏️说明原因 + 🛌休息日 + ➕补签」4 个元素挤在同一 flex 行，
       4 个全部折成 2 行。现在拆成「日期一行（.md-hdr）/ 操作一行（.md-actions）」，
       按钮仍各自 min-height:var(--touch-min)=44px（不缩热区）。 */
    return '<div class="md-item'+(isRest?' rest':'')+'"><div class="md-hdr"><span class="md-date">📅 '+dd+'</span></div><div class="md-actions"><button class="md-write" data-date="'+dd+'">'+(note?'✏️ 编辑':'✏️ 说明原因')+'</button>'+(isRest?'':'<button class="md-write" data-date="'+dd+'" data-rest="1" style="color:var(--green)">🛌 休息日</button>')+'<button class="md-write" data-date="'+dd+'" data-makeup="1" style="color:var(--green)">➕ 补签</button></div>'+(isRest?'<span class="md-rest-badge">🛌 休息日</span>':'')+'<div class="md-reason'+(note?' show':'')+'" id="mr_'+dd+'">'+(isRest?'':note)+'</div><div class="md-edit" id="me_'+dd+'" style="display:none"><textarea class="md-input" id="mi_'+dd+'" rows="2">'+(note||'')+'</textarea><button class="md-save" data-date="'+dd+'">保存</button></div></div>'
  }).join('')
  c.querySelectorAll('.md-write').forEach(b=>b.addEventListener('click',()=>{
    const dd=b.dataset.date
    if(b.dataset.makeup){_strDate=dd;openMakeupDialog(dd);return}
    if(b.dataset.rest){var ms=getMissed();ms[dd]='🛌 休息日';saveMissed(ms);renderMissed();toast('已标记休息日 🛌','s');return}
    const show=b.closest('.md-item').querySelector('.md-edit, #me_'+dd)
    if(show)show.style.display=show.style.display==='none'?'block':'none'
  }))
  c.querySelectorAll('.md-save').forEach(b=>b.addEventListener('click',()=>{
    const dd=b.dataset.date;const inp=document.getElementById('mi_'+dd);if(!inp)return
    const t=inp.value.trim();var missed=getMissed();if(t){missed[dd]=t}else{delete missed[dd]}
    saveMissed(missed);renderMissed();toast('已保存断签说明','s')
  }))
}

/* ========== MAKEUP DIALOG ========== */
function openMakeupDialog(dateStr){
  var plans=getPlans()
  if(!plans.length){toast('没有训练计划，请先创建','e');return}
  var modal=openModal()
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">📋 选择计划补签 '+dateStr+'</div>'
    +'<div style="margin-bottom:12px">'
  plans.forEach(function(p,i){
    var tags=p.exercises.map(function(e){return e.exercise}).slice(0,5).join('、')
    h+='<div class="ec" style="cursor:pointer;margin-bottom:8px" data-pick="'+p.id+'"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><span style="font-size:var(--fs-2xs);color:var(--text3)">'+p.exercises.length+' 组</span></div></div><div class="ec-prog"><div style="font-size:var(--fs-2xs);color:var(--text2)">'+tags+'</div></div></div>'
  })
  h+='</div><div class="modal-actions"><button class="m-btn-cancel" id="muCancel">取消</button></div></div>'
  modal.innerHTML=h;void modal
  modal.querySelectorAll('[data-pick]').forEach(function(el){
    el.addEventListener('click',function(){doMakeup(dateStr,el.dataset.pick);modal.remove()})
  })
  document.getElementById('muCancel').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

function doMakeup(dateStr,planId){
  var plan=getPlans().find(function(p){return p.id===planId})
  if(!plan||!plan.exercises.length){toast('计划无效','e');return}
  plan.exercises.forEach(function(ex){
    addStr({date:dateStr,exercise:ex.exercise,weight:ex.weight||7,targetReps:ex.targetReps||12,actualReps:0})
  })
  renderStr()
  toast('已补签 '+plan.exercises.length+' 组训练到 '+dateStr+' ✅','s')
}

/* ========== PLANS ========== */
let _woPlan=null,_woIdx=0,_woReps=12,_woDone=[],_woTimer=null,_woRest=0;

function renderStrPlans(){
  const c=document.getElementById('strPlansList')
  const plans=getPlans()
  if(!plans.length){
    c.innerHTML='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有训练计划</div><div class="empty-s">创建一个计划，快速按计划训练</div></div><button class="add-btn" id="strNewPlan" style="margin-top:8px">＋ 新建计划</button>'
    return
  }
  c.innerHTML=plans.map(p=>{
    const tags=p.exercises.map(e=>e.exercise).slice(0,6)
    return '<div class="ec"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="editPlan" data-pid="'+p.id+'">✏️</button><button class="ec-act" data-a="startPlan" data-pid="'+p.id+'">⚡</button><button class="ec-act" data-a="delPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="display:flex;gap:4px;flex-wrap:wrap">'+tags.map(n=>'<span style="font-size:var(--fs-2xs);background:var(--bg);color:var(--text2);padding:1px 8px;border-radius:var(--rp);border:1px solid var(--bd)">'+n+'</span>').join('')+'</div></div></div>'
  }).join('')
  c.innerHTML+='<button class="add-btn" id="strNewPlan" style="margin-top:8px">＋ 新建计划</button>'
}

/* Plan Editor */
var _peEditing=null,_peEditId=null,_peTempEx=null,_peTempIdx=null

function openPlanEditor(editId){
  _peEditId=editId
  var plan=editId?getPlans().find(function(p){return p.id===editId}):null
  _peEditing=plan?JSON.parse(JSON.stringify(plan)):{exercises:[]}
  var modal=openModal(null,'peModal')
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(editId?'✏️ 编辑计划':'📋 新建计划')+'</div><div class="fg"><label class="fl" for="peName">计划名称</label><input class="fi" id="peName" value="'+(plan?plan.name:'')+'" placeholder="计划名称"></div><div class="fg"><span class="fl" id="lbl-st-g1">动作列表</span><div id="peExList" role="group" aria-labelledby="lbl-st-g1"></div><button class="add-btn" id="peAddEx" style="margin-top:4px;padding:10px">＋ 添加动作</button></div><div class="modal-actions"><button class="m-btn-cancel" id="peCancel">取消</button><button class="m-btn-save" id="peSave">保存</button></div></div>'
  void modal
  renderPeList()
}

function renderPeList(){
  var el=document.getElementById('peExList');if(!el)return
  if(!_peEditing.exercises.length){
    el.innerHTML='<div style="font-size:var(--fs-sm);color:var(--text3);padding:12px 0;text-align:center">还没有动作，点击下方添加</div>'
    return
  }
  el.innerHTML=_peEditing.exercises.map(function(ex,i){
    return '<div class="ec" style="padding:10px;margin-bottom:6px"><div class="ec-hdr"><div class="ec-ex">'+(i+1)+'. '+ex.exercise+'</div><div class="ec-actions"><button class="ec-act" data-a="peExEdit" data-idx="'+i+'">✏️</button><button class="ec-act" data-a="peExDel" data-idx="'+i+'">🗑️</button></div></div><div style="font-size:var(--fs-xs);color:var(--text2);margin-top:4px">'+ex.weight+' kg × '+ex.targetReps+' 次 · 休息 '+ex.restSeconds+'s</div></div>'
  }).join('')
}

function showPeExForm(idx){
  _peTempIdx=idx
  var ex=idx!==null?_peEditing.exercises[idx]:{exercise:'',weight:7,targetReps:12,restSeconds:60}
  var form=document.getElementById('peExForm')
  if(!form){
    var el=document.getElementById('peExList').parentNode
    form=document.createElement('div');form.id='peExForm'
    form.style='background:var(--bg);border:1px solid var(--bd);border-radius:var(--rs);padding:12px;margin-bottom:8px'
    el.insertBefore(form,document.getElementById('peAddEx'))
  }
  form.innerHTML='<div class="fg"><label class="fl" for="peExName">动作</label><select class="fi" id="peExName">'
    +getStrengthExercises().map(function(s){return'<option value="'+s.name+'"'+(s.name===ex.exercise?' selected':'')+'>'+s.name+'</option>'}).join('')
    +'</select></div>'
    +'<div class="fg"><span class="fl" id="lbl-st-g2">重量 (kg)</span><div class="stepper" style="max-width:160px" role="group" aria-labelledby="lbl-st-g2"><button class="sp-btn" id="peExWDown">−</button><span class="sp-val" id="peExWeight">'+ex.weight+'</span><button class="sp-btn" id="peExWUp">+</button></div></div>'
    +'<div class="fg"><span class="fl" id="lbl-st-g3">目标次数</span><div class="stepper" style="max-width:160px" role="group" aria-labelledby="lbl-st-g3"><button class="sp-btn" id="peExRDown">−</button><span class="sp-val" id="peExReps">'+ex.targetReps+'</span><button class="sp-btn" id="peExRUp">+</button></div></div>'
    +'<div class="fg"><span class="fl" id="lbl-st-g4">休息 (秒)</span><div class="stepper" style="max-width:160px" role="group" aria-labelledby="lbl-st-g4"><button class="sp-btn" id="peExSDown">−</button><span class="sp-val" id="peExRest">'+ex.restSeconds+'</span><button class="sp-btn" id="peExSUp">+</button></div></div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="peExCancel">取消</button><button class="m-btn-save" id="peExConfirm">✅ 确定</button></div>'
  form.scrollIntoView({behavior:'smooth'})
}

function startStrPlan(pid){
  const plan=getPlans().find(p=>p.id===pid);if(!plan||!plan.exercises.length)return
  _woPlan=plan;_woIdx=0;_woDone=[]
  showWoExercise()
}

function showWoExercise(){
  const ex=_woPlan.exercises[_woIdx]
  _woReps=ex.targetReps
  var old=document.getElementById('woOverlay');if(old)old.remove()
  const overlay=document.createElement('div');overlay.id='woOverlay';overlay.className='battle-overlay open'
  overlay.innerHTML='<div class="battle-hdr"><div class="battle-level">'+_woPlan.name+'</div><div class="battle-level">'+( _woIdx+1)+'/'+_woPlan.exercises.length+'</div><button class="speed-btn" id="woClose">✕</button></div>'
    +'<div class="battle-arena" style="flex-direction:column;gap:12px"><div class="workout-exercise" style="text-align:center">'
    +'<div style="font-size:var(--fs-3xl);font-weight:800">'+ex.exercise+'</div>'
    +'<div style="font-size:var(--fs-base);color:var(--text2);margin:4px 0 16px">'+ex.weight+' kg · 目标 '+ex.targetReps+' 次</div>'
    +'<div style="font-family:var(--font);font-size:4rem;font-weight:900;color:var(--orange)" id="woRepsDisp">'+_woReps+'</div>'
    +'<div style="font-size:var(--fs-xs);color:var(--text3);letter-spacing:1px">实际次数</div>'
    +'<div style="display:flex;gap:24px;justify-content:center;margin:16px 0">'
    +'<button class="speed-btn" id="woRepsD" style="width:56px;height:56px;border-radius:50%;font-size:var(--fs-3xl)">−</button>'
    +'<button class="speed-btn" id="woRepsU" style="width:56px;height:56px;border-radius:50%;font-size:var(--fs-3xl)">+</button></div>'
    +'<button class="sb-btn" id="woDone" style="max-width:300px">✅ 完成</button></div></div>'
  document.body.appendChild(overlay)
  document.getElementById('woRepsD').addEventListener('click',()=>{_woReps=Math.max(0,_woReps-1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woRepsU').addEventListener('click',()=>{_woReps=Math.min(999,_woReps+1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woDone').addEventListener('click',()=>completeWoSet())
  document.getElementById('woClose').addEventListener('click',()=>{if(_woTimer){clearInterval(_woTimer);_woTimer=null}document.getElementById('woOverlay')?.remove()})
}

function completeWoSet(){
  const ex=_woPlan.exercises[_woIdx]
  _woDone.push({exercise:ex.exercise,weight:ex.weight,targetReps:ex.targetReps,actualReps:_woReps})
  if(_woIdx+1<_woPlan.exercises.length){
    _woIdx++
    if(ex.restSeconds>0){showWoRest(ex.restSeconds)}
    else{showWoExercise()}
  }else{showWoSummary()}
}

function showWoRest(sec){
  _woRest=sec
  const el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:var(--fs-sm);color:var(--text3);letter-spacing:1px;margin-bottom:8px">休息</div>'
    +'<div style="font-size:5rem;font-weight:900;color:var(--orange)" id="woRestDisp">'+sec+'s</div>'
    +'<div style="font-size:var(--fs-sm);color:var(--text2);margin:12px 0">下一组: '+_woPlan.exercises[_woIdx].exercise+'</div>'
    +'<button class="speed-btn" id="woSkipRest">跳过 →</button></div>'
  _woTimer=setInterval(()=>{_woRest--;if(_woRest<=0){clearInterval(_woTimer);_woTimer=null;showWoExercise();return}
    var rd=document.getElementById('woRestDisp');if(rd)rd.textContent=_woRest+'s'},1000)
  document.getElementById('woSkipRest')?.addEventListener('click',()=>{clearInterval(_woTimer);_woTimer=null;showWoExercise()})
}

function showWoSummary(){
  /* v2.2 WP-H3 同口径：`sumVolume()` 浮点 → 展示层取整（不改数值本身） */
  const total=_woDone.reduce((s,d)=>s+d.actualReps,0),vol=Math.round(sumVolume(_woDone,getExerciseMap()))
  const el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:var(--fs-hero);margin-bottom:4px">🎉</div><div style="font-size:var(--fs-2xl);font-weight:800;margin-bottom:12px">训练完成！</div>'
    +_woDone.map(d=>'<div style="font-size:var(--fs-sm);color:var(--text2)">'+d.exercise+' '+d.weight+'kg × '+d.actualReps+'/'+d.targetReps+(d.actualReps>=d.targetReps?' ✅':'')+'</div>').join('')
    +'<div style="display:flex;justify-content:center;gap:24px;margin:16px 0"><div><div style="font-size:var(--fs-2xl);font-weight:800;color:var(--orange)">'+total+'</div><div style="font-size:var(--fs-3xs);color:var(--text3)">总次数</div></div><div><div style="font-size:var(--fs-2xl);font-weight:800;color:var(--blue)">'+vol+'</div><div style="font-size:var(--fs-3xs);color:var(--text3)">总容量</div></div></div>'
    +'<button class="sb-btn" id="woFinish" style="max-width:300px">✅ 记录并完成</button></div>'
  document.getElementById('woFinish').addEventListener('click',()=>{
    _woDone.forEach(d=>{addStr({date:today(),exercise:d.exercise,weight:d.weight,targetReps:d.targetReps,actualReps:d.actualReps})})
    document.getElementById('woOverlay')?.remove()
    toast('训练已记录！','s');renderStr()
  })
}

/* ========== STRENGTH EDIT MODAL ========== */
function openStrEdit(entry){
  var exMap=getExerciseMap();
  var exDef=exMap[entry.exercise]||{};
  var isEq=entry.eqWeight!=null||(exDef.eqWeight!=null&&exDef.type==='strength');
  var unitLabel=(entry.unit||exDef.unit||'rep')==='sec'?'秒数':'次数';
  var unitSuffix=(entry.unit||exDef.unit||'rep')==='sec'?'秒':'次';
  const modal=openModal(null,'strEditModal')
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">✏️ 编辑记录</div><div class="fg"><label class="fl" for="seEx">动作</label><input class="fi" id="seEx" value="'+entry.exercise+'"></div>';
  if(isEq){
    var eqW=entry.eqWeight!=null?entry.eqWeight:exDef.eqWeight;
    h+='<div class="fg"><span class="fl" id="lbl-st-g5">等效重量</span><div style="font-size:var(--fs-base);color:var(--text2);padding:8px 0" role="group" aria-labelledby="lbl-st-g5">⚖️ '+eqW+'kg/'+unitSuffix+'</div></div>';
  }else{
    h+='<div class="fg"><span class="fl" id="lbl-st-g6">重量 (kg)</span><div class="weight-grid" id="seWeight" role="group" aria-labelledby="lbl-st-g6"></div></div>';
  }
  h+='<div class="fg"><span class="fl" id="lbl-st-g7">'+unitLabel+'</span><div class="reps-row" role="group" aria-labelledby="lbl-st-g7"><div class="rg"><div class="fl">目标</div><div class="stepper"><button class="sp-btn" id="seTD">−</button><span class="sp-val" id="seTV">'+entry.targetReps+'</span><button class="sp-btn" id="seTU">+</button></div></div><div class="rg"><div class="fl">实际</div><div class="stepper"><button class="sp-btn" id="seAD">−</button><span class="sp-val" id="seAV">'+entry.actualReps+'</span><button class="sp-btn" id="seAU">+</button></div></div></div></div><div class="modal-actions"><button class="m-btn-cancel" id="seCancel">取消</button><button class="m-btn-save" id="seSave">💾 保存</button></div></div>';
  modal.innerHTML=h;void modal
  var selW=entry.weight||0;
  if(!isEq){buildWtGrid(modal.querySelector('#seWeight'),selW,w=>selW=w,true)}
  document.getElementById('seTD').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seTU').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seAD').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seAU').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seCancel').addEventListener('click',()=>modal.remove())
  document.getElementById('seSave').addEventListener('click',()=>{
    const ex=document.getElementById('seEx').value.trim()
    if(!ex){toast('请输入动作名称','e');return}
    var data={exercise:ex,targetReps:parseInt(document.getElementById('seTV').textContent,10),actualReps:parseInt(document.getElementById('seAV').textContent,10)};
    if(isEq){data.weight=0;data.eqWeight=entry.eqWeight!=null?entry.eqWeight:exDef.eqWeight;data.unit=entry.unit||exDef.unit||'rep'}
    else{data.weight=selW}
    updateStr(entry.id,data)
    modal.remove();toast('已更新','s');renderStr()
  })
  modal.addEventListener('click',e=>{if(e.target===e.currentTarget)modal.remove()})
}

/* ========== STRENGTH EVENT HANDLER ========== */
function onStrengthEvent(el,id,act){
  switch(id){
    case 'strExercise':openStrExPicker();return true;
    case 'strPrevDay':{var d=parseDate(_strDate);d.setDate(d.getDate()-1);_strDate=toDate(d);renderStr();return true}
    case 'strNextDay':{var d=parseDate(_strDate);d.setDate(d.getDate()+1);_strDate=toDate(d);renderStr();return true}
    case 'strGoToday':_strDate=today();renderStr();return true;
    case 'strAddBtn':_strForm=!_strForm;el.textContent=_strForm?'✖ 收起':'＋ 新增一组'
      document.getElementById('strAddCard').classList.toggle('open',_strForm);
      if(_strForm){
        var sex=document.getElementById('strExercise');
        if(sex&&typeof sex.focus==='function')sex.focus();
        adaptStrForm(sex.value.trim());
        sex.setAttribute('readonly','readonly');   // 点选弹层选择，不手输
        /* v2.4.9：打开表单时若已有动作（刚练过的那条），默认带出它的重量/次数 */
        ensureStrLastHint();
        if(sex.value.trim())applyStrLastSet(sex.value.trim());
      }
      return true;
    case 'strSubmit':{
      var ex=document.getElementById('strExercise').value.trim()
      if(!ex){toast('请输入动作名称','e');return true}
      var exDef=getStrengthExercises().find(function(e){return e.name===ex})||getExerciseMap()[ex];
      var tgt=parseInt(document.getElementById('strTgtVal').textContent,10)
      var ac=parseInt(document.getElementById('strActVal').textContent,10)
      var entry={date:_strDate,exercise:ex,targetReps:tgt,actualReps:ac}
      if(exDef&&exDef.eqWeight!=null){
        entry.weight=0;entry.eqWeight=exDef.eqWeight;entry.unit=exDef.unit||'rep'
      }else{
        entry.weight=_strSelW
      }
      addStr(entry)
      // 保留动作/重量/目标，只重置实际次数回目标值，方便连记同动作
      document.getElementById('strActVal').textContent=String(tgt)
      toast('✅ 记录成功！继续下一组或 ✖ 收起','s')
      var te=getStr(_strDate);if(te.length&&te.every(function(e){return e.actualReps>=e.targetReps}))setTimeout(celebrate,300)
      renderStr();return true}
    case 'strNewPlan':openPlanEditor(null);return true;
    case 'peSave':{
      var pName=document.getElementById('peName').value.trim()
      if(!pName){toast('请输入计划名称','e');return true}
      if(!_peEditing||_peEditing.exercises.length===0){toast('请至少添加一个动作','e');return true}
      if(_peEditId){
        var existing=getPlans().find(function(x){return x.id===_peEditId})
        if(existing){existing.name=pName;existing.exercises=_peEditing.exercises;savePlans(getPlans());renderStr();toast('计划已更新','s')}
      }else{
        var pl=getPlans();pl.push({id:uid(),name:pName,exercises:_peEditing.exercises,createdAt:Date.now()});savePlans(pl);renderStr();toast('新计划已创建','s')
      }
      var f=document.getElementById('peExForm');if(f)f.remove()
      document.getElementById('peModal')?.remove();return true}
    case 'peCancel':case 'peClose':document.getElementById('peModal')?.remove();return true;
    case 'peAddEx':var f=document.getElementById('peExForm');if(f)f.remove();_peTempEx={exercise:'',weight:7,targetReps:12,restSeconds:60};showPeExForm(null);return true;
    case 'peExConfirm':{
      var exName=document.getElementById('peExName').value.trim()
      if(!exName){toast('请选择动作','e');return true}
      var exWeight=parseFloat(document.getElementById('peExWeight').textContent)
      var exReps=parseInt(document.getElementById('peExReps').textContent)
      var exRest=parseInt(document.getElementById('peExRest').textContent)
      if(_peTempIdx!==null){_peEditing.exercises[_peTempIdx]={exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest}}
      else{_peEditing.exercises.push({exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest})}
      var form=document.getElementById('peExForm');if(form)form.remove()
      renderPeList();return true}
    case 'peExCancel':var form=document.getElementById('peExForm');if(form)form.remove();return true;
    case 'peExWDown':{var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.max(1,v-1);return true}
    case 'peExWUp':{var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.min(50,v+1);return true}
    case 'peExRDown':{var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.max(1,v-1);return true}
    case 'peExRUp':{var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.min(999,v+1);return true}
    case 'peExSDown':{var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.max(0,v-15);return true}
    case 'peExSUp':{var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.min(300,v+15);return true}
  }
  if(act==='editPlan'){openPlanEditor(el.dataset.pid);return true}
  if(act==='startPlan'){startStrPlan(el.dataset.pid);return true}
  if(act==='delPlan'){
    if(confirm('确定删除这个计划？')){savePlans(getPlans().filter(function(p){return p.id!==el.dataset.pid}));renderStr()}
    return true}
  if(act==='peExEdit'){_peTempIdx=parseInt(el.dataset.idx);showPeExForm(_peTempIdx);return true}
  if(act==='peExDel'){_peEditing.exercises.splice(parseInt(el.dataset.idx),1);renderPeList();return true}
  if(act==='strEdit'){
    var entry=(store.get('strength')||{entries:[]}).entries.find(function(x){return x.id===el.dataset.id});if(!entry)return false
    openStrEdit(entry);return true}
  if(act==='strDel'){
    if(confirm('确定删除这条记录？')){delStr(el.dataset.id);renderStr();toast('已删除','s')};return true}
  /* ---- v2.4.9 新增：常用动作 chips / 分组开关 / 一键再来一组 ---- */
  if(act==='strPickEx'){pickStrExercise(el.dataset.ex||'');return true}
  if(act==='strMoreEx'){_strShowAllEx=!_strShowAllEx;renderStrQuickPicks();return true}
  if(act==='strRepeat'){strRepeatById(el.dataset.id);return true}
  if(act==='strRepeatLast'){strRepeatLast();return true}
  return false
}

/* ========== 训练页动作选择弹层（图片 + 中文名） ==========
   v2.4.9：按真实使用频次分成「⭐ 常用 / 其它动作」两段（`strExPickerHtml()`）。
   两组**都完整渲染**（不折叠），所以"点动作框 → 点动作"这条主路径步数不变。 */
function openStrExPicker(){
  var modal=openModal(null,'strExPicker');
  modal.innerHTML=strExPickerHtml(strCommonSet());
  modal.querySelectorAll('[data-pickex]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var name=btn.getAttribute('data-pickex');
      pickStrExercise(name);
      modal.remove();
    });
  });
}

/* ============================================================================
   v2.4.9 — 训练页两件功能（作者原话）
   ①「新训练时，将训练列表最常用的和不常用的进行区分」
      · 口径 = 该用户**真实训练记录**的组数频次（窗口 / 阈值见 STR_FREQ），
        **不写死**任何"常用动作"清单；换个人用就是另一份常用表。
      · 呈现 = 「⭐ 常用」单独分组置顶（零操作步数）+「其它动作」默认折叠
        （点开会话内记忆）+ 弹层里两组**都完整可见**（弹层路径一步未增）。
      · 兜底 = 无历史时**不谎报**常用，按数据集默认顺序列出全部动作（不空列表）。
   ②「可以方便将某次训练再次快速训练」（例：二头弯举 12 下·5kg 再来一组）
      · 条目上的 🔁「再来一组相同」= 一键复制**任意一组**（含重量/加减次数/目标）；
      · 列表末尾整行「🔁 再来一组相同」= 刚刚那条的一键复制（作者场景的默认落点）；
      · 表单默认**带出该动作上一次**的重量/次数（同动作连续组），并在表单里
        用一行灰色提示说明"带出来了什么"，不改变原有录入路径（无新增必填步骤）。
   ============================================================================ */

var _strShowAllEx=false;   // 「其它动作」是否已在 chips 区展开（会话内记忆）

/* ---------- ① 频次口径（纯函数，无 DOM / 无 store，可单测） ---------- */
var STR_FREQ={
  windowDays:30,        // 统计窗口：最近 30 天（含今天）
  minWindowSets:5,      // 窗口内不足 5 组 → 样本太薄，退化到「全历史最近 30 组」
  recentSets:30,        // 薄样本退化用的组数
  minSetsForCommon:2,   // 窗口内 ≥2 组才算「常用」（只练过一次还谈不上常用）
  maxCommon:6           // 「常用」最多 6 个（一屏可扫完，不必滚动）
};

function strShiftDate(dateStr,delta){
  var d=parseDate(dateStr||today());d.setDate(d.getDate()+delta);return toDate(d)
}
/* 一条记录的时序键：优先 createdAt，缺字段回落到日期（外部同步 / 老存档可能没有） */
function strEntryAt(e){
  if(e&&e.createdAt)return e.createdAt
  return e&&e.date?parseDate(e.date).getTime():0
}
/* 一组 = 一条 strength.entries（不用"动作去重"，次数就是组数） */
function strFreqStats(entries,todayStr,opt){
  var o=opt||{}
  var days=o.windowDays||STR_FREQ.windowDays
  var minSets=o.minWindowSets||STR_FREQ.minWindowSets
  var recent=o.recentSets||STR_FREQ.recentSets
  var t=todayStr||today()
  var list=(entries||[]).filter(function(e){return e&&e.exercise})
  var start=strShiftDate(t,-(days-1))
  var inWin=list.filter(function(e){return e.date>=start&&e.date<=t})
  var source='window',pool=inWin
  if(inWin.length<minSets){
    pool=list.slice().sort(function(a,b){return strEntryAt(a)-strEntryAt(b)}).slice(-recent)
    source=pool.length?'recent':'none'
  }
  var counts={},lastAt={},totalSets=0
  pool.forEach(function(e){
    counts[e.exercise]=(counts[e.exercise]||0)+1;totalSets++
    var at=strEntryAt(e)
    if(!(e.exercise in lastAt)||at>lastAt[e.exercise])lastAt[e.exercise]=at
  })
  return {source:source,counts:counts,lastAt:lastAt,totalSets:totalSets,windowStart:start,inWindow:inWin.length}
}
/* 排序：组数降序 → 最近使用降序 → 数据集顺序（同名并列时结果稳定可复现） */
function strRankExercises(names,stats){
  return (names||[]).map(function(n,i){
    return {name:n,idx:i,count:(stats&&stats.counts[n])||0,lastAt:(stats&&stats.lastAt[n])||0}
  }).sort(function(a,b){return (b.count-a.count)||(b.lastAt-a.lastAt)||(a.idx-b.idx)})
}
/* 分组：常用 = 窗口内 ≥2 组且排名前 6；其余进"其它动作"（同样按频次降序） */
function strSplitCommon(ranked,stats,opt){
  var o=opt||{}
  var minSets=o.minSetsForCommon||STR_FREQ.minSetsForCommon
  var maxCommon=o.maxCommon||STR_FREQ.maxCommon
  var total=(stats&&stats.totalSets)||0
  if(!total)return {hasHistory:false,common:[],others:(ranked||[]).slice()}
  var common=(ranked||[]).filter(function(r){return r.count>=minSets}).slice(0,maxCommon)
  var picked={};common.forEach(function(r){picked[r.name]=1})
  return {hasHistory:true,common:common,others:(ranked||[]).filter(function(r){return !picked[r.name]})}
}
/* 读库汇总（渲染与测试同一口径） */
function strCommonSet(todayStr){
  var t=todayStr||today()
  var entries=((store.get('strength')||{entries:[]}).entries)||[]
  var stats=strFreqStats(entries,t)
  var ranked=strRankExercises(getStrengthExercises().map(function(e){return e.name}),stats)
  var sp=strSplitCommon(ranked,stats)
  sp.stats=stats;sp.ranked=ranked
  return sp
}
function strAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
}
function strFreqNote(sp){
  var s=sp.stats||{}
  if(!s.totalSets)return '练几次后这里会自动按常用度排序'
  if(s.source==='recent')return '按最近 '+s.totalSets+' 组统计（近 30 天样本太少）'
  return '按近 30 天 '+s.totalSets+' 组统计'
}
function strExChipHtml(r,isCommon){
  return '<button type="button" class="ex-chip'+(isCommon?' common':'')+'" data-a="strPickEx" data-ex="'+strAttr(r.name)+'">'+strAttr(r.name)+'</button>'
}
/* chips 区（#strSuggest）HTML —— 空列表兜底也在这里 */
function strSuggestHtml(sp,expanded){
  var h=''
  if(!sp.hasHistory){
    h+='<div class="ex-grp">💪 全部动作<span class="ex-grp-note">'+strFreqNote(sp)+'</span></div>'
    return h+sp.others.map(function(r){return strExChipHtml(r)}).join('')
  }
  h+='<div class="ex-grp">⭐ 常用<span class="ex-grp-note">'+strFreqNote(sp)+'</span></div>'
  h+=sp.common.map(function(r){return strExChipHtml(r,true)}).join('')
  if(!sp.others.length)return h
  if(!expanded){
    h+='<button type="button" class="ex-more" data-a="strMoreEx">⋯ 其它动作（'+sp.others.length+'）</button>'
  }else{
    h+='<div class="ex-grp">其它动作<span class="ex-grp-note">用得较少</span></div>'
    h+=sp.others.map(function(r){return strExChipHtml(r)}).join('')
    h+='<button type="button" class="ex-more" data-a="strMoreEx">收起其它动作</button>'
  }
  return h
}
function renderStrQuickPicks(){
  var c=document.getElementById('strSuggest');if(!c)return
  c.innerHTML=strSuggestHtml(strCommonSet(),_strShowAllEx)
}
/* 动作选择弹层：常用置顶 + 其它动作（**都不折叠**，进弹层路径与原来一样是 1 次点击） */
function strExPickCardHtml(ex,isCommon){
  var linked=(typeof EXD!=='undefined'&&EXD.ready()&&ex.dsId)?EXD.get(ex.dsId):null;
  var m=linked?EXD.mediaUrls(linked.img):null;
  return '<button type="button" class="ec" data-pickex="'+strAttr(ex.name)+'" style="display:flex;width:100%;text-align:left;gap:12px;margin-top:8px;padding:10px;align-items:center;cursor:pointer;border:1px solid var(--bd);border-radius:12px;background:var(--bg2)">'
    +(m?'<img src="'+m.primary+'" loading="lazy" onerror="'+(m.fallback?"this.onerror=null;this.src='"+m.fallback+"'":"this.style.visibility='hidden'")+'" style="width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--bg);flex-shrink:0;border:1px solid var(--bd)">':'<div style="width:56px;height:56px;border-radius:10px;background:var(--bg);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:var(--fs-xl)">💪</div>')
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:var(--fs-base);font-weight:700;color:var(--text1)">'+strAttr(linked?linked.zh:ex.name)+(isCommon?'<span class="ex-common-tag">⭐ 常用</span>':'')+'</div>'
    +(linked?'<div style="margin-top:2px">'+tagHtml(linked.cat,'cat')+tagHtml(linked.eq,'eq')+tagHtml(linked.target,'cat')+'</div>':'')
    +'</div>'
    +'<span style="font-size:var(--fs-3xs);color:var(--text3)"></span>'
    +'</button>';
}
function strExPickerHtml(sp){
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">🎯 选择动作</div><div style="max-height:70vh;overflow-y:auto;margin-top:6px">';
  if(sp.hasHistory&&sp.common.length){
    h+='<div class="ex-grp">⭐ 常用<span class="ex-grp-note">'+strFreqNote(sp)+'</span></div>';
    sp.common.forEach(function(r){
      var ex=getStrengthExercises().find(function(x){return x.name===r.name})
      h+=strExPickCardHtml(ex||{name:r.name},true)
    })
  }
  h+='<div class="ex-grp">'+(sp.hasHistory&&sp.common.length?'其它动作':'全部动作')+'<span class="ex-grp-note">'+strFreqNote(sp)+'</span></div>';
  sp.others.forEach(function(r){
    var ex=getStrengthExercises().find(function(x){return x.name===r.name})
    h+=strExPickCardHtml(ex||{name:r.name},false)
  })
  h+='</div></div>';
  return h
}
/* 选中动作：写值 + 形态适配 + 带出该动作上一次的重量/次数 */
function pickStrExercise(name){
  var input=document.getElementById('strExercise');
  if(input)input.value=name;
  adaptStrForm(name);
  ensureStrLastHint();
  applyStrLastSet(name);
}

/* ---------- ② 快速复制上一组 ---------- */
function strSetLabel(e){
  if(!e)return ''
  var isSec=e.unit==='sec'
  var unit=isSec?'秒':'次'
  var w=e.eqWeight!=null?('⚖️'+e.eqWeight+'kg/'+unit):((e.weight!=null?e.weight:0)+'kg')
  return e.exercise+' '+w+' × '+e.actualReps+unit
}
/* 复制产出的字段**与手输记录完全一致**：
   手输普通动作 = {date,exercise,targetReps,actualReps,weight}
   手输等效重量 = {date,exercise,targetReps,actualReps,weight:0,eqWeight,unit}
   这里逐字段挑，绝不整条 Object.assign（否则会把 id/createdAt 等带进来） */
function strEntryPayload(src,date){
  if(!src)return null
  var p={date:date,exercise:src.exercise,targetReps:src.targetReps,actualReps:src.actualReps}
  if(src.eqWeight!=null){p.weight=0;p.eqWeight=src.eqWeight;p.unit=src.unit||'rep'}
  else{p.weight=src.weight!=null?src.weight:0}
  return p
}
function strRepeatById(id){
  var src=((store.get('strength')||{entries:[]}).entries).find(function(x){return x.id===id})
  if(!src){toast('这条记录已经不在了','e');return null}
  var p=strEntryPayload(src,_strDate)
  addStr(p)
  toast('🔁 已再来一组：'+strSetLabel(p),'s')
  renderStr()
  return p
}
/* 列表末尾的整行按钮：复制**当前查看日期**最后一条（作者场景：刚记完就再来一组） */
function strRepeatLast(){
  var list=getStr(_strDate)
  if(!list.length){toast('这一天还没有可复制的记录','e');return null}
  return strRepeatById(list[list.length-1].id)
}
function strRepeatBarHtml(last){
  if(!last)return ''
  return '<button class="add-btn repeat" data-a="strRepeatLast" aria-label="再来一组相同">🔁 再来一组相同 · '+strAttr(strSetLabel(last))+'</button>'
}
/* 该动作**上一次**的记录（跨日期，按时序取最近；缺 createdAt 用日期回落） */
function strLastEntryOf(name){
  var list=((store.get('strength')||{entries:[]}).entries)||[]
  var hit=null,at=-1
  list.forEach(function(e){
    if(!e||e.exercise!==name)return
    var a=strEntryAt(e)
    if(a>=at){at=a;hit=e}
  })
  return hit
}
/* 表单里的"已带出上次"提示行（动态插入 #strAddCard，页面骨架不动） */
function ensureStrLastHint(){
  var card=document.getElementById('strAddCard');if(!card)return null
  var el=document.getElementById('strLastHint')
  if(!el){
    var host=card.querySelector('#strSubmit')
    el=document.createElement('div')
    el.id='strLastHint';el.className='ex-grp-note'
    el.style.marginBottom='8px'
    if(host&&host.parentNode)host.parentNode.insertBefore(el,host)
    else card.appendChild(el)
  }
  return el
}
/* 提示行只在真有"上一次"时占位（空串 → 整行隐藏，不凭空多出 8px 空白） */
function setStrHint(text){
  var el=ensureStrLastHint();if(!el)return
  el.textContent=text||''
  el.style.display=text?'block':'none'
}
/* 同动作连续组：默认带出上一次的重量 / 目标次数 / 实际次数（等效重量动作只带次数） */
function applyStrLastSet(name){
  var hit=strLastEntryOf(name)
  if(!hit){setStrHint('');return null}
  var exDef=getStrengthExercises().find(function(e){return e.name===name})
  var isEq=!!(exDef&&exDef.eqWeight!=null)
  if(!isEq&&hit.weight!=null&&COMMON_W.indexOf(hit.weight)>=0){
    _strSelW=hit.weight
    var wg=document.getElementById('strWeight')
    if(wg)buildWtGrid(wg,_strSelW,function(w){_strSelW=w})
  }
  var tgt=hit.targetReps>0?hit.targetReps:0
  var act=hit.actualReps>0?hit.actualReps:tgt
  var tv=document.getElementById('strTgtVal'),av=document.getElementById('strActVal')
  if(tv&&tgt>0)tv.textContent=String(tgt)
  if(av&&act>0)av.textContent=String(act)
  setStrHint('↩️ 已带出上次：'+strSetLabel(hit)+'（可直接改）')
  return hit
}

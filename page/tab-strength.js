/* ============================================
   MyHealth — Tab: Strength
   ============================================ */

let _strDate=today(),_strSelW=COMMON_W[4],_strForm=false;

function renderStr(){
  const d=_strDate;const f=fmtDate(d)
  document.getElementById('strDateMain').textContent=f.main
  document.getElementById('strDateSub').textContent=f.sub
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
      return '<div class="ec '+(d?'done':'')+'" data-id="'+e.id+'"><div class="ec-hdr"><div class="ec-ex">'+e.exercise+'<span class="ec-wt">● '+e.weight+' kg</span></div><div class="ec-actions"><button class="ec-act" data-a="strEdit" data-id="'+e.id+'">✏️</button><button class="ec-act" data-a="strDel" data-id="'+e.id+'">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt"><span class="ec-tgt">目标 '+e.targetReps+' 次</span><span class="ec-actual '+ac+'">'+e.actualReps+' 次 '+(d?(o?'🔥':'✅'):'')+'</span></div><div class="ec-bar"><div class="ec-fill '+sc+'" style="width:'+p+'%"></div></div></div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')
  }
  renderHeatmap('strHeatmap','str',d)
  renderStrStats()
  renderMissed()
}

function renderStrStats(){
  const g=document.getElementById('strStats')
  const we=getWeekStr();const t=we.length,r=we.reduce((s,e)=>s+e.actualReps,0),v=we.reduce((s,e)=>s+e.weight*e.actualReps,0)
  const dn=we.filter(e=>e.actualReps>=e.targetReps).length,rate=t>0?Math.round(dn/t*100):0
  const circ=2*Math.PI*31.5
  g.innerHTML='<div class="sc sc-rate"><div class="sc-ring"><svg viewBox="0 0 70 70"><circle class="sc-ring__bg" cx="35" cy="35" r="31.5"/><circle class="sc-ring__fill" cx="35" cy="35" r="31.5" stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ-circ*rate/100)+'"/></svg><span class="sc-ring__text">'+rate+'%</span></div><div class="sc-l">完成率</div></div><div class="sc sc-total"><div class="sc-v">'+r+'</div><div class="sc-l">总次数</div></div><div class="sc sc-vol"><div class="sc-v">'+v+'</div><div class="sc-l">总容量</div></div><div class="sc sc-fav"><div class="sc-v">最爱</div><div class="sc-l">动作</div></div>'
}
function getWeekStr(){const n=new Date();const d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(store.get('strength')||{entries:[]}).entries.filter(e=>e.date>=toDate(m))}

/* ========== MISSED DAYS ========== */
function renderMissed(){
  const c=document.getElementById('strMissedDays')
  const allDates=[];const d=new Date()
  for(let i=6;i>=0;i--){const t=new Date(d);t.setDate(t.getDate()-i);allDates.push(toDate(t))}
  const activeDays=new Set((store.get('strength')||{entries:[]}).entries.map(e=>e.date))
  const missed=allDates.filter(dd=>!activeDays.has(dd)&&dd<=today())
  if(!missed.length){c.innerHTML='<div style="font-size:.75rem;color:var(--text3);padding:8px 0">✅ 最近 7 天全勤！</div>';return}
  c.innerHTML=missed.map(dd=>{
    const note=getMissed()[dd]||''
    return '<div class="md-item"><div class="md-hdr"><span class="md-date">📅 '+dd+'</span><button class="md-write" data-date="'+dd+'">'+(note?'✏️ 编辑':'✏️ 说明原因')+'</button><button class="md-write" data-date="'+dd+'" data-makeup="1" style="color:var(--green)">➕ 补签</button></div><div class="md-reason'+(note?' show':'')+'" id="mr_'+dd+'">'+(note||'')+'</div><div class="md-edit" id="me_'+dd+'" style="display:none"><textarea class="md-input" id="mi_'+dd+'" rows="2">'+(note||'')+'</textarea><button class="md-save" data-date="'+dd+'">保存</button></div></div>'
  }).join('')
  c.querySelectorAll('.md-write').forEach(b=>b.addEventListener('click',()=>{
    const dd=b.dataset.date
    if(b.dataset.makeup){_strDate=dd;openMakeupDialog(dd);return}
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
  var modal=document.createElement('div');modal.className='modal-overlay open'
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">📋 选择计划补签 '+dateStr+'</div>'
    +'<div style="margin-bottom:12px">'
  plans.forEach(function(p,i){
    var tags=p.exercises.map(function(e){return e.exercise}).slice(0,5).join('、')
    h+='<div class="ec" style="cursor:pointer;margin-bottom:8px" data-pick="'+p.id+'"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><span style="font-size:.7rem;color:var(--text3)">'+p.exercises.length+' 组</span></div></div><div class="ec-prog"><div style="font-size:.7rem;color:var(--text2)">'+tags+'</div></div></div>'
  })
  h+='</div><div class="modal-actions"><button class="m-btn-cancel" id="muCancel">取消</button></div></div>'
  modal.innerHTML=h;document.body.appendChild(modal)
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
    c.innerHTML='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有训练计划</div><div class="empty-s">点下方按钮创建</div></div>'
    return
  }
  c.innerHTML=plans.map(p=>{
    const tags=p.exercises.map(e=>e.exercise).slice(0,6)
    return '<div class="ec" style="cursor:pointer"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="startPlan" data-pid="'+p.id+'">⚡</button><button class="ec-act" data-a="delPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="display:flex;gap:4px;flex-wrap:wrap">'+tags.map(n=>'<span style="font-size:.7rem;background:var(--bg);color:var(--text2);padding:1px 8px;border-radius:var(--rp);border:1px solid var(--bd)">'+n+'</span>').join('')+'</div></div></div>'
  }).join('')
  c.innerHTML+='<button class="add-btn" id="strNewPlan" style="margin-top:8px">＋ 新建计划</button>'
}

/* Plan Editor */
var _peEditing=null,_peEditId=null,_peTempEx=null,_peTempIdx=null

function openPlanEditor(editId){
  _peEditId=editId
  var plan=editId?getPlans().find(function(p){return p.id===editId}):null
  _peEditing=plan?JSON.parse(JSON.stringify(plan)):{exercises:[]}
  var modal=document.createElement('div');modal.className='modal-overlay open';modal.id='peModal'
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(editId?'✏️ 编辑计划':'📋 新建计划')+'</div><div class="fg"><label class="fl">计划名称</label><input class="fi" id="peName" value="'+(plan?plan.name:'')+'" placeholder="计划名称"></div><div class="fg"><label class="fl">动作列表</label><div id="peExList"></div><button class="add-btn" id="peAddEx" style="margin-top:4px;padding:10px">＋ 添加动作</button></div><div class="modal-actions"><button class="m-btn-cancel" id="peCancel">取消</button><button class="m-btn-save" id="peSave">保存</button></div></div>'
  document.body.appendChild(modal)
  renderPeList()
}

function renderPeList(){
  var el=document.getElementById('peExList');if(!el)return
  if(!_peEditing.exercises.length){
    el.innerHTML='<div style="font-size:.78rem;color:var(--text3);padding:12px 0;text-align:center">还没有动作，点击下方添加</div>'
    return
  }
  el.innerHTML=_peEditing.exercises.map(function(ex,i){
    return '<div class="ec" style="padding:10px;margin-bottom:6px"><div class="ec-hdr"><div class="ec-ex">'+(i+1)+'. '+ex.exercise+'</div><div class="ec-actions"><button class="ec-act" data-a="peExEdit" data-idx="'+i+'">✏️</button><button class="ec-act" data-a="peExDel" data-idx="'+i+'">🗑️</button></div></div><div style="font-size:.72rem;color:var(--text2);margin-top:4px">'+ex.weight+' kg × '+ex.targetReps+' 次 · 休息 '+ex.restSeconds+'s</div></div>'
  }).join('')
}

function showPeExForm(idx){
  _peTempIdx=idx
  var ex=idx!==null?_peEditing.exercises[idx]:{exercise:'',weight:7,targetReps:12,restSeconds:60}
  var modal=document.createElement('div');modal.className='modal-overlay open';modal.id='peExModal'
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(idx!==null?'编辑动作':'添加动作')+'</div><div class="fg"><label class="fl">动作名称</label><input class="fi" id="peExName" value="'+ex.exercise+'" placeholder="如: 弯举"></div>'
    +'<div class="fg"><label class="fl">重量 (kg)</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="peExWDown">−</button><span class="sp-val" id="peExWeight">'+ex.weight+'</span><button class="sp-btn" id="peExWUp">+</button></div></div>'
    +'<div class="fg"><label class="fl">目标次数</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="peExRDown">−</button><span class="sp-val" id="peExReps">'+ex.targetReps+'</span><button class="sp-btn" id="peExRUp">+</button></div></div>'
    +'<div class="fg"><label class="fl">休息 (秒)</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="peExSDown">−</button><span class="sp-val" id="peExRest">'+ex.restSeconds+'</span><button class="sp-btn" id="peExSUp">+</button></div></div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="peExCancel">取消</button><button class="m-btn-save" id="peExConfirm">✅ 确定</button></div></div>'
  document.body.appendChild(modal)
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
    +'<div style="font-size:2.2rem;font-weight:800">'+ex.exercise+'</div>'
    +'<div style="font-size:.9rem;color:var(--text2);margin:4px 0 16px">'+ex.weight+' kg · 目标 '+ex.targetReps+' 次</div>'
    +'<div style="font-family:var(--font);font-size:4rem;font-weight:900;color:var(--orange)" id="woRepsDisp">'+_woReps+'</div>'
    +'<div style="font-size:.75rem;color:var(--text3);letter-spacing:1px">实际次数</div>'
    +'<div style="display:flex;gap:24px;justify-content:center;margin:16px 0">'
    +'<button class="speed-btn" id="woRepsD" style="width:56px;height:56px;border-radius:50%;font-size:2rem">−</button>'
    +'<button class="speed-btn" id="woRepsU" style="width:56px;height:56px;border-radius:50%;font-size:2rem">+</button></div>'
    +'<button class="sb-btn" id="woDone" style="max-width:300px">✅ 完成</button></div></div>'
  document.body.appendChild(overlay)
  document.getElementById('woRepsD').addEventListener('click',()=>{_woReps=Math.max(0,_woReps-1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woRepsU').addEventListener('click',()=>{_woReps=Math.min(999,_woReps+1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woDone').addEventListener('click',()=>completeWoSet())
  document.getElementById('woClose').addEventListener('click',()=>{document.getElementById('woOverlay')?.remove()})
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
  el.innerHTML='<div style="text-align:center"><div style="font-size:.8rem;color:var(--text3);letter-spacing:1px;margin-bottom:8px">休息</div>'
    +'<div style="font-size:5rem;font-weight:900;color:var(--orange)" id="woRestDisp">'+sec+'s</div>'
    +'<div style="font-size:.8rem;color:var(--text2);margin:12px 0">下一组: '+_woPlan.exercises[_woIdx].exercise+'</div>'
    +'<button class="speed-btn" id="woSkipRest">跳过 →</button></div>'
  _woTimer=setInterval(()=>{_woRest--;if(_woRest<=0){clearInterval(_woTimer);_woTimer=null;showWoExercise();return}
    var rd=document.getElementById('woRestDisp');if(rd)rd.textContent=_woRest+'s'},1000)
  document.getElementById('woSkipRest')?.addEventListener('click',()=>{clearInterval(_woTimer);_woTimer=null;showWoExercise()})
}

function showWoSummary(){
  const total=_woDone.reduce((s,d)=>s+d.actualReps,0),vol=_woDone.reduce((s,d)=>s+d.weight*d.actualReps,0)
  const el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:2.5rem;margin-bottom:4px">🎉</div><div style="font-size:1.5rem;font-weight:800;margin-bottom:12px">训练完成！</div>'
    +_woDone.map(d=>'<div style="font-size:.8rem;color:var(--text2)">'+d.exercise+' '+d.weight+'kg × '+d.actualReps+'/'+d.targetReps+(d.actualReps>=d.targetReps?' ✅':'')+'</div>').join('')
    +'<div style="display:flex;justify-content:center;gap:24px;margin:16px 0"><div><div style="font-size:1.5rem;font-weight:800;color:var(--orange)">'+total+'</div><div style="font-size:.65rem;color:var(--text3)">总次数</div></div><div><div style="font-size:1.5rem;font-weight:800;color:var(--blue)">'+vol+'</div><div style="font-size:.65rem;color:var(--text3)">总容量</div></div></div>'
    +'<button class="sb-btn" id="woFinish" style="max-width:300px">✅ 记录并完成</button></div>'
  document.getElementById('woFinish').addEventListener('click',()=>{
    _woDone.forEach(d=>{addStr({date:today(),exercise:d.exercise,weight:d.weight,targetReps:d.targetReps,actualReps:d.actualReps})})
    document.getElementById('woOverlay')?.remove()
    toast('训练已记录！','s');renderStr()
  })
}

/* ========== HEATMAP ========== */
let _hmY=new Date().getFullYear(),_hmM=new Date().getMonth()
function renderHeatmap(cid,prefix,curDate){
  const c=document.getElementById(cid);if(!c)return
  const n=new Date(_hmY,_hmM);const y=n.getFullYear(),m=n.getMonth()
  const dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay()
  const so=fd===0?6:fd-1,wd=['一','二','三','四','五','六','日']
  const mn=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  const dd={}
  for(let d=1;d<=dim;d++){const s=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')
    const entries=prefix==='str'?getStr(s):[];const reps=entries.reduce((a,e)=>a+e.actualReps,0);dd[d]={reps,date:s}}
  const max=Math.max(1,...Object.values(dd).map(d=>d.reps))
  function lv(r){if(r===0)return 0;const ra=r/max;if(ra<=.1)return 1;if(ra<=.3)return 2;if(ra<=.5)return 3;if(ra<=.75)return 4;return 5}
  let h='<div class="hm"><div class="hm-hdr"><div class="hm-label">'+y+'年 '+mn[m]+'</div><div class="hm-nav"><button class="hm-nav-btn" data-n="hmP">◀</button><button class="hm-nav-btn" data-n="hmT">📍</button><button class="hm-nav-btn" data-n="hmN">▶</button></div></div><div class="hm-grid">'
  wd.forEach(d=>{h+='<div class="hm-dh">'+d+'</div>'})
  for(let i=0;i<so;i++)h+='<div class="hm-cell"></div>'
  for(let d=1;d<=dim;d++){const da=dd[d];const l=lv(da.reps);const t=da.date===today();const hd=da.reps>0
    h+='<div class="hm-cell'+(t?' today':'')+'" data-l="'+l+'" data-date="'+da.date+'">'+d+'</div>'}
  h+='</div><div class="hm-leg">少 <div class="l0"></div><div class="l1"></div><div class="l3"></div><div class="l5"></div> 多</div></div>'
  c.innerHTML=h
  c.querySelectorAll('[data-n="hmP"]').forEach(b=>b.addEventListener('click',()=>{_hmM--;if(_hmM<0){_hmM=11;_hmY--}renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('[data-n="hmN"]').forEach(b=>b.addEventListener('click',()=>{_hmM++;if(_hmM>11){_hmM=0;_hmY++}renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('[data-n="hmT"]').forEach(b=>b.addEventListener('click',()=>{const n=new Date();_hmY=n.getFullYear();_hmM=n.getMonth();renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('.hm-cell[data-date]').forEach(b=>b.addEventListener('click',()=>{
    _strDate=b.dataset.date;renderStr()
  }))
}

/* ========== STRENGTH EDIT MODAL ========== */
function openStrEdit(entry){
  const modal=document.createElement('div');modal.className='modal-overlay open';modal.id='strEditModal'
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">✏️ 编辑记录</div><div class="fg"><label class="fl">动作</label><input class="fi" id="seEx" value="'+entry.exercise+'"></div><div class="fg"><label class="fl">重量 (kg)</label><div class="weight-grid" id="seWeight"></div></div><div class="fg"><label class="fl">次数</label><div class="reps-row"><div class="rg"><div class="fl">目标</div><div class="stepper"><button class="sp-btn" id="seTD">−</button><span class="sp-val" id="seTV">'+entry.targetReps+'</span><button class="sp-btn" id="seTU">+</button></div></div><div class="rg"><div class="fl">实际</div><div class="stepper"><button class="sp-btn" id="seAD">−</button><span class="sp-val" id="seAV">'+entry.actualReps+'</span><button class="sp-btn" id="seAU">+</button></div></div></div></div><div class="modal-actions"><button class="m-btn-cancel" id="seCancel">取消</button><button class="m-btn-save" id="seSave">💾 保存</button></div></div>'
  document.body.appendChild(modal)
  let selW=entry.weight
  buildWtGrid(modal.querySelector('#seWeight'),selW,w=>selW=w,true)
  document.getElementById('seTD').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seTU').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seAD').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seAU').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seCancel').addEventListener('click',()=>modal.remove())
  document.getElementById('seSave').addEventListener('click',()=>{
    const ex=document.getElementById('seEx').value.trim()
    if(!ex){toast('请输入动作名称','e');return}
    updateStr(entry.id,{exercise:ex,weight:selW,targetReps:parseInt(document.getElementById('seTV').textContent,10),actualReps:parseInt(document.getElementById('seAV').textContent,10)})
    modal.remove();toast('已更新','s');renderStr()
  })
  modal.addEventListener('click',e=>{if(e.target===e.currentTarget)modal.remove()})
}

/* ========== STRENGTH EVENT HANDLER ========== */
function onStrengthEvent(el,id,act){
  switch(id){
    case 'strPrevDay':{var d=parseDate(_strDate);d.setDate(d.getDate()-1);_strDate=toDate(d);renderStr();return true}
    case 'strNextDay':{var d=parseDate(_strDate);d.setDate(d.getDate()+1);_strDate=toDate(d);renderStr();return true}
    case 'strGoToday':_strDate=today();renderStr();return true;
    case 'strAddBtn':_strForm=!_strForm;el.textContent=_strForm?'✖ 收起':'＋ 新增一组'
      document.getElementById('strAddCard').classList.toggle('open',_strForm);if(_strForm)document.getElementById('strExercise').focus();return true;
    case 'strSubmit':{
      var ex=document.getElementById('strExercise').value.trim()
      if(!ex){toast('请输入动作名称','e');return true}
      var tgt=parseInt(document.getElementById('strTgtVal').textContent,10)
      var ac=parseInt(document.getElementById('strActVal').textContent,10)
      addStr({date:_strDate,exercise:ex,weight:_strSelW,targetReps:tgt,actualReps:ac})
      document.getElementById('strExercise').value='';document.getElementById('strTgtVal').textContent='12';document.getElementById('strActVal').textContent='12'
      _strSelW=COMMON_W[4];document.querySelectorAll('#strWeight .wt-btn').forEach(function(b){b.classList.toggle('selected',parseInt(b.dataset.w)===_strSelW)})
      document.getElementById('strAddCard').classList.remove('open');_strForm=false;document.getElementById('strAddBtn').textContent='＋ 新增一组'
      toast('记录成功！','s')
      var te=getStr(_strDate);if(te.length&&te.every(function(e){return e.actualReps>=e.targetReps}))setTimeout(celebrate,300)
      renderStr();return true}
    case 'strNewPlan':openPlanEditor(null);return true;
    case 'exportDataBtn':exportData();return true;
    case 'importDataBtn':importData();return true;
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
      document.getElementById('peModal')?.remove();return true}
    case 'peCancel':case 'peClose':document.getElementById('peModal')?.remove();return true;
    case 'peAddEx':_peTempEx={exercise:'',weight:7,targetReps:12,restSeconds:60};showPeExForm(null);return true;
    case 'peExConfirm':{
      var exName=document.getElementById('peExName').value.trim()
      if(!exName){toast('请输入动作名称','e');return true}
      var exWeight=parseFloat(document.getElementById('peExWeight').textContent)
      var exReps=parseInt(document.getElementById('peExReps').textContent)
      var exRest=parseInt(document.getElementById('peExRest').textContent)
      if(_peTempIdx!==null){_peEditing.exercises[_peTempIdx]={exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest}}
      else{_peEditing.exercises.push({exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest})}
      document.getElementById('peExModal')?.remove();renderPeList();return true}
    case 'peExCancel':document.getElementById('peExModal')?.remove();return true;
    case 'peExWDown':{var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.max(1,v-1);return true}
    case 'peExWUp':{var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.min(50,v+1);return true}
    case 'peExRDown':{var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.max(1,v-1);return true}
    case 'peExRUp':{var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.min(999,v+1);return true}
    case 'peExSDown':{var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.max(0,v-15);return true}
    case 'peExSUp':{var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.min(300,v+15);return true}
  }
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
  return false
}

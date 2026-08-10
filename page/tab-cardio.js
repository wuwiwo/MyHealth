/* ============================================
   MyHealth — Tab: Cardio
   ============================================ */

let _carDate=today(),_carForm=false;
let _carSelType='run',_carDur=30,_carDist=0,_carIntensity=2;

function renderCar(){
  const d=_carDate;const f=fmtDate(d)
  renderTodaySnapshot()
  document.getElementById('carDateMain').textContent=f.main
  document.getElementById('carDateSub').textContent=f.sub
  var entries=getCar(d)
  var el=document.getElementById('carList')
  if(!entries.length){
    el.innerHTML='<div class="empty"><span class="empty-e">🏃</span><div class="empty-t">今天还没有有氧记录</div><div class="empty-s">跑一跑、跳一跳，保持活力！</div></div>'
  } else {
    el.innerHTML=entries.map(function(e){
      var ct=getAllCardioTypes().find(function(x){return x.id===e.type})||{emoji:'🏃',name:'运动'}
      var ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''
      var intLabel=e.intensity?INTENSITY_LEVELS.find(function(x){return x.id===e.intensity})||{emoji:''}:{emoji:''}
      return '<div class="ec"><div class="ec-hdr"><div class="ec-ex">'+ct.emoji+' '+ct.name+' '+intLabel.emoji+'</div><div class="ec-actions"><button class="ec-act" data-a="carDel" data-id="'+e.id+'">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt"><span>⏱️ '+e.duration+' 分钟</span>'+(e.distance>0?'<span>📏 '+e.distance+' km</span>':'')+'</div></div>'+(e.note?'<div style="font-size:.7rem;color:var(--text2);margin-top:4px">💬 '+e.note+'</div>':'')+'</div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')
  }
  renderCarStats()
  renderCardioPlans()
}

function renderCarStats(){
  var g=document.getElementById('carStats')
  var we=getWeekCar()
  var total=we.length,dur=we.reduce(function(s,e){return s+e.duration},0),dist=we.reduce(function(s,e){return s+(e.distance||0)},0)
  g.innerHTML='<div class="sc sc-total"><div class="sc-v">'+total+'</div><div class="sc-l">本周次数</div></div><div class="sc sc-vol"><div class="sc-v">'+dur+'</div><div class="sc-l">总分钟</div></div><div class="sc sc-fav"><div class="sc-v">'+(dist>0?dist+'km':'—')+'</div><div class="sc-l">总距离</div></div><div class="sc sc-rate"><div class="sc-v">🔥</div><div class="sc-l">坚持有氧</div></div>'
}
function getWeekCar(){var n=new Date();var d=n.getDay();var m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(store.get('cardio')||{entries:[]}).entries.filter(function(e){return e.date>=toDate(m)})}

/* ========== CARDIO EVENT HANDLER ========== */
function onCardioEvent(el,id,act){
  switch(id){
    case 'carPrevDay':{var d=parseDate(_carDate);d.setDate(d.getDate()-1);_carDate=toDate(d);renderCar();return true}
    case 'carNextDay':{var d=parseDate(_carDate);d.setDate(d.getDate()+1);_carDate=toDate(d);renderCar();return true}
    case 'carGoToday':_carDate=today();renderCar();return true;
    case 'carAddBtn':_carForm=!_carForm;el.textContent=_carForm?'✖ 收起':'＋ 新增记录'
      document.getElementById('carAddCard').classList.toggle('open',_carForm);return true;
    case 'carDurDown':_carDur=Math.max(1,_carDur-5);document.getElementById('carDurVal').textContent=_carDur;return true;
    case 'carDurUp':_carDur=Math.min(999,_carDur+5);document.getElementById('carDurVal').textContent=_carDur;return true;
    case 'carDistDown':_carDist=Math.max(0,_carDist-0.5);document.getElementById('carDistVal').textContent=_carDist;return true;
    case 'carDistUp':_carDist=Math.min(999,_carDist+0.5);document.getElementById('carDistVal').textContent=_carDist;return true;
    case 'carSubmit':{
      var note=document.getElementById('carNote').value.trim()
      addCar({date:_carDate,type:_carSelType,duration:_carDur,distance:_carDist,note:note,intensity:_carIntensity})
      document.getElementById('carNote').value=''
      toast('✅ 有氧记录已保存！继续记录或 ✖ 收起','s')
      renderCar();return true}
    case 'carCustomType':{
      showCustomCardioDialog();return true}
  }
  if(act==='carDel'){
    if(confirm('确定删除？')){delCar(el.dataset.id);renderCar();toast('已删除','s')};return true}
  // Cardio plan events
  if(act==='startCardioPlan'){startCardioPlan(el.dataset.pid);return true}
  if(act==='delCardioPlan'){
    if(confirm('确定删除？')){saveCardioPlans(getCardioPlans().filter(function(p){return p.id!==el.dataset.pid}));renderCar()}
    return true}
  if(id==='carNewPlan'){openCardioPlanEditor(null);return true}
  if(id==='cpSave'){
    var pName=document.getElementById('cpName').value.trim()
    if(!pName){toast('请输入计划名称','e');return true}
    if(!_cpEditing||_cpEditing.segments.length===0){toast('请至少添加一个训练段','e');return true}
    if(_cpEditId){
      var existing=getCardioPlans().find(function(x){return x.id===_cpEditId})
      if(existing){existing.name=pName;existing.segments=_cpEditing.segments;saveCardioPlans(getCardioPlans());renderCar();toast('计划已更新','s')}
    }else{
      var pl=getCardioPlans();pl.push({id:uid(),name:pName,segments:_cpEditing.segments,createdAt:Date.now()});saveCardioPlans(pl);renderCar();toast('新计划已创建','s')
    }
    document.getElementById('cpModal')?.remove();return true}
  if(id==='cpCancel'){document.getElementById('cpModal')?.remove();return true}
  if(id==='cpAddSeg'){showCardioSegForm(null);return true}
  if(act==='cpSegEdit'){showCardioSegForm(parseInt(el.dataset.idx));return true}
  if(act==='cpSegDel'){_cpEditing.segments.splice(parseInt(el.dataset.idx),1);renderCpSegList();return true}
  // Intensity selection
  if(el.dataset.intensity){
    var iv=parseInt(el.dataset.intensity);_carIntensity=iv
    document.querySelectorAll('#carIntensity .car-type').forEach(function(b){b.classList.toggle('selected',parseInt(b.dataset.intensity)===iv)})
    // Update default intensity based on selected type
    var ct=getAllCardioTypes().find(function(x){return x.id===_carSelType})
    if(ct&&ct.intensity){_carIntensity=ct.intensity;refreshIntensityUI()}
    return true}
  // Type selection
  if(el.classList.contains('car-type')&&el.dataset.ct){
    document.querySelectorAll('#carTypes .car-type').forEach(function(x){x.classList.remove('selected')})
    el.classList.add('selected');_carSelType=el.dataset.ct
    var ct=getAllCardioTypes().find(function(x){return x.id===_carSelType})
    document.getElementById('carDistLabel').textContent=ct&&ct.hasDist?'km':'无'
    if(ct&&!ct.hasDist){_carDist=0;document.getElementById('carDistVal').textContent='0'}
    if(ct&&ct.intensity){_carIntensity=ct.intensity;refreshIntensityUI()}
    return true}
  return false
}

function refreshIntensityUI(){
  document.querySelectorAll('#carIntensity .car-type').forEach(function(b){
    b.classList.toggle('selected',parseInt(b.dataset.intensity)===_carIntensity)
  })
}

function initCardioTypes(){
  var ctEl=document.getElementById('carTypes');if(!ctEl)return
  ctEl.innerHTML=''
  getAllCardioTypes().forEach(function(t){
    var b=document.createElement('button');b.className='car-type'+(t.id===_carSelType?' selected':'')
    b.textContent=t.emoji+' '+t.name;b.dataset.ct=t.id
    b.addEventListener('click',function(){
      ctEl.querySelectorAll('.car-type').forEach(function(x){x.classList.remove('selected')})
      b.classList.add('selected');_carSelType=t.id
      document.getElementById('carDistLabel').textContent=t.hasDist?'km':'无'
      if(!t.hasDist){_carDist=0;document.getElementById('carDistVal').textContent='0'}
      if(t.intensity){_carIntensity=t.intensity;refreshIntensityUI()}
    });ctEl.appendChild(b)
  })
  // Intensity buttons
  var intEl=document.getElementById('carIntensity');if(!intEl)return
  intEl.innerHTML=''
  INTENSITY_LEVELS.forEach(function(lv){
    var b=document.createElement('button');b.className='car-type'+(lv.id===_carIntensity?' selected':'')
    b.textContent=lv.emoji+' '+lv.name;b.dataset.intensity=lv.id
    b.addEventListener('click',function(){
      _carIntensity=lv.id;refreshIntensityUI()
    });intEl.appendChild(b)
  })
}

function showCustomCardioDialog(){
  var modal=openModal()
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">＋ 自定义运动类型</div>'
    +'<div class="fg"><label class="fl">名称</label><input class="fi" id="ccName" placeholder="如: 瑜伽"></div>'
    +'<div class="fg"><label class="fl">图标</label><input class="fi" id="ccEmoji" placeholder="如: 🧘"></div>'
    +'<div class="fg"><label class="fl">默认强度</label><div class="car-types" id="ccIntensity"></div></div>'
    +'<div class="fg" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ccHasDist"><label class="fl" style="margin:0">有距离统计</label></div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="ccCancel">取消</button><button class="m-btn-save" id="ccSave">💾 保存</button></div></div>'
  void modal
  var ccInt=2
  var ccIntEl=document.getElementById('ccIntensity')
  INTENSITY_LEVELS.forEach(function(lv){
    var b=document.createElement('button');b.className='car-type'+(lv.id===ccInt?' selected':'')
    b.textContent=lv.emoji+' '+lv.name;b.dataset.ccint=lv.id
    b.addEventListener('click',function(){
      ccInt=parseInt(b.dataset.ccint)
      ccIntEl.querySelectorAll('.car-type').forEach(function(x){x.classList.toggle('selected',parseInt(x.dataset.ccint)===ccInt)})
    });ccIntEl.appendChild(b)
  })
  document.getElementById('ccCancel').addEventListener('click',function(){modal.remove()})
  document.getElementById('ccSave').addEventListener('click',function(){
    var name=document.getElementById('ccName').value.trim()
    var emoji=document.getElementById('ccEmoji').value.trim()||'🏃'
    if(!name){toast('请输入名称','e');return}
    var list=getExercises();
    var newId='custom'+Date.now().toString(36);
    list.push({id:newId,name:name,type:'cardio',ratio:null,intensity:ccInt,emoji:emoji,hasDist:document.getElementById('ccHasDist').checked});
    saveExercises(list);
    initCardioTypes()
    modal.remove()
    toast('已添加「'+name+'」','s')
  })
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

function showCardioSegForm(idx){
  var seg=idx!==null?_cpEditing.segments[idx]:{type:'run',duration:30,intensity:2,restSeconds:60}
  var modal=openModal(null,'cpSegModal')
  var ctOpts=getAllCardioTypes().map(function(t){return'<option value="'+t.id+'"'+(t.id===seg.type?' selected':'')+'>'+t.emoji+' '+t.name+'</option>'}).join('')
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(idx!==null?'编辑训练段':'添加训练段')+'</div>'
    +'<div class="fg"><label class="fl">运动类型</label><select class="fi" id="cpSegType">'+ctOpts+'</select></div>'
    +'<div class="fg"><label class="fl">时长 (分钟)</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="cpSegDDown">−</button><span class="sp-val" id="cpSegDur">'+seg.duration+'</span><button class="sp-btn" id="cpSegDUp">+</button></div></div>'
    +'<div class="fg"><label class="fl">强度</label><div class="car-types" id="cpSegInt"></div></div>'
    +'<div class="fg"><label class="fl">休息 (秒)</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="cpSegRDown">−</button><span class="sp-val" id="cpSegRest">'+seg.restSeconds+'</span><button class="sp-btn" id="cpSegRUp">+</button></div></div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="cpSegCancel">取消</button><button class="m-btn-save" id="cpSegConfirm">✅ 确定</button></div></div>'
  void modal
  var csInt=seg.intensity||2
  var csIntEl=document.getElementById('cpSegInt')
  INTENSITY_LEVELS.forEach(function(lv){
    var b=document.createElement('button');b.className='car-type'+(lv.id===csInt?' selected':'')
    b.textContent=lv.emoji+' '+lv.name;b.dataset.csint=lv.id
    b.addEventListener('click',function(){csInt=parseInt(b.dataset.csint);csIntEl.querySelectorAll('.car-type').forEach(function(x){x.classList.toggle('selected',parseInt(x.dataset.csint)===csInt)})})
    csIntEl.appendChild(b)
  })
  document.getElementById('cpSegDDown').addEventListener('click',function(){var v=parseInt(document.getElementById('cpSegDur').textContent);document.getElementById('cpSegDur').textContent=Math.max(1,v-5)})
  document.getElementById('cpSegDUp').addEventListener('click',function(){var v=parseInt(document.getElementById('cpSegDur').textContent);document.getElementById('cpSegDur').textContent=Math.min(300,v+5)})
  document.getElementById('cpSegRDown').addEventListener('click',function(){var v=parseInt(document.getElementById('cpSegRest').textContent);document.getElementById('cpSegRest').textContent=Math.max(0,v-15)})
  document.getElementById('cpSegRUp').addEventListener('click',function(){var v=parseInt(document.getElementById('cpSegRest').textContent);document.getElementById('cpSegRest').textContent=Math.min(300,v+15)})
  document.getElementById('cpSegCancel').addEventListener('click',function(){modal.remove()})
  document.getElementById('cpSegConfirm').addEventListener('click',function(){
    var type=document.getElementById('cpSegType').value
    var dur=parseInt(document.getElementById('cpSegDur').textContent)
    var rest=parseInt(document.getElementById('cpSegRest').textContent)
    if(idx!==null){_cpEditing.segments[idx]={type:type,duration:dur,intensity:csInt,restSeconds:rest}}
    else{_cpEditing.segments.push({type:type,duration:dur,intensity:csInt,restSeconds:rest})}
    modal.remove();renderCpSegList()
  })
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

var _cpEditing=null,_cpEditId=null
function renderCardioPlans(){
  var c=document.getElementById('carPlansList')
  var plans=getCardioPlans()
  if(!plans.length){
    c.innerHTML='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有有氧计划</div><div class="empty-s">创建一个计划，按计划跑步</div></div><button class="add-btn" id="carNewPlan" style="margin-top:8px">＋ 新建有氧计划</button>'
    return
  }
  c.innerHTML=plans.map(function(p){
    var tags=p.segments.map(function(s){
      var ct=getAllCardioTypes().find(function(x){return x.id===s.type})||{emoji:'🏃',name:s.type}
      return ct.emoji+s.duration+'min'
    }).slice(0,6)
    return '<div class="ec"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="startCardioPlan" data-pid="'+p.id+'">⚡</button><button class="ec-act" data-a="delCardioPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="display:flex;gap:4px;flex-wrap:wrap">'+tags.map(function(n){return '<span style="font-size:.7rem;background:var(--bg);color:var(--text2);padding:1px 8px;border-radius:var(--rp);border:1px solid var(--bd)">'+n+'</span>'}).join('')+'</div></div></div>'
  }).join('')
  c.innerHTML+='<button class="add-btn" id="carNewPlan" style="margin-top:8px">＋ 新建有氧计划</button>'
}

function openCardioPlanEditor(editId){
  _cpEditId=editId
  var plan=editId?getCardioPlans().find(function(p){return p.id===editId}):null
  _cpEditing=plan?JSON.parse(JSON.stringify(plan)):{segments:[]}
  var modal=openModal(null,'cpModal')
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(editId?'✏️ 编辑有氧计划':'📋 新建有氧计划')+'</div><div class="fg"><label class="fl">计划名称</label><input class="fi" id="cpName" value="'+(plan?plan.name:'')+'" placeholder="如: 晨跑"></div><div class="fg"><label class="fl">训练段</label><div id="cpSegList"></div><button class="add-btn" id="cpAddSeg" style="margin-top:4px;padding:10px">＋ 添加训练段</button></div><div class="modal-actions"><button class="m-btn-cancel" id="cpCancel">取消</button><button class="m-btn-save" id="cpSave">保存</button></div></div>'
  void modal
  renderCpSegList()
}

function renderCpSegList(){
  var el=document.getElementById('cpSegList');if(!el)return
  if(!_cpEditing.segments.length){
    el.innerHTML='<div style="font-size:.78rem;color:var(--text3);padding:12px 0;text-align:center">还没有训练段，点击下方添加</div>'
    return
  }
  el.innerHTML=_cpEditing.segments.map(function(seg,i){
    var ct=getAllCardioTypes().find(function(x){return x.id===seg.type})||{emoji:'🏃',name:seg.type}
    return '<div class="ec" style="padding:10px;margin-bottom:6px"><div class="ec-hdr"><div class="ec-ex">'+(i+1)+'. '+ct.emoji+' '+ct.name+'</div><div class="ec-actions"><button class="ec-act" data-a="cpSegEdit" data-idx="'+i+'">✏️</button><button class="ec-act" data-a="cpSegDel" data-idx="'+i+'">🗑️</button></div></div><div style="font-size:.72rem;color:var(--text2);margin-top:4px">'+seg.duration+' 分钟 · 强度×'+seg.intensity+' · 休息'+seg.restSeconds+'s</div></div>'
  }).join('')
}

function startCardioPlan(pid){
  var plan=getCardioPlans().find(function(p){return p.id===pid})
  if(!plan||!plan.segments.length)return
  _woPlan={name:plan.name,segments:plan.segments};_woIdx=0;_woDone=[]
  showCardioSegment()
}

function showCardioSegment(){
  var seg=_woPlan.segments[_woIdx]
  var ct=getAllCardioTypes().find(function(x){return x.id===seg.type})||{emoji:'🏃'}
  _carDur=seg.duration;_carSelType=seg.type;_carIntensity=seg.intensity||2
  var old=document.getElementById('woOverlay');if(old)old.remove()
  var overlay=document.createElement('div');overlay.id='woOverlay';overlay.className='battle-overlay open'
  overlay.innerHTML='<div class="battle-hdr"><div class="battle-level">'+_woPlan.name+'</div><div class="battle-level">'+( _woIdx+1)+'/'+_woPlan.segments.length+'</div><button class="speed-btn" id="woClose">✕</button></div>'
    +'<div class="battle-arena" style="flex-direction:column;gap:12px"><div style="text-align:center">'
    +'<div style="font-size:2.2rem;font-weight:800">'+ct.emoji+' '+ct.name+'</div>'
    +'<div style="font-size:.9rem;color:var(--text2);margin:4px 0 16px">'+seg.duration+' 分钟 · 强度×'+seg.intensity+'</div>'
    +'<div style="font-size:.75rem;color:var(--text3);margin-bottom:16px">完成此段训练后点击按钮</div>'
    +'<button class="sb-btn" id="woDone" style="max-width:300px">✅ 完成此段</button></div></div>'
  document.body.appendChild(overlay)
  document.getElementById('woDone').addEventListener('click',function(){completeCardioSegment()})
  document.getElementById('woClose').addEventListener('click',function(){if(_woTimer){clearInterval(_woTimer);_woTimer=null}document.getElementById('woOverlay')?.remove()})
}

function completeCardioSegment(){
  var seg=_woPlan.segments[_woIdx]
  _woDone.push({type:seg.type,duration:seg.duration,intensity:seg.intensity||2})
  if(_woIdx+1<_woPlan.segments.length){
    _woIdx++
    var rest=seg.restSeconds||0
    if(rest>0)showCardioRest(rest)
    else showCardioSegment()
  }else{showCardioSummary()}
}

function showCardioRest(sec){
  _woRest=sec
  var el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:.8rem;color:var(--text3);letter-spacing:1px;margin-bottom:8px">休息</div>'
    +'<div style="font-size:5rem;font-weight:900;color:var(--orange)" id="woRestDisp">'+sec+'s</div>'
    +'<div style="font-size:.8rem;color:var(--text2);margin:12px 0">下一段</div>'
    +'<button class="speed-btn" id="woSkipRest">跳过 →</button></div>'
  _woTimer=setInterval(function(){_woRest--;if(_woRest<=0){clearInterval(_woTimer);_woTimer=null;showCardioSegment();return}
    var rd=document.getElementById('woRestDisp');if(rd)rd.textContent=_woRest+'s'},1000)
  document.getElementById('woSkipRest')?.addEventListener('click',function(){clearInterval(_woTimer);_woTimer=null;showCardioSegment()})
}

function showCardioSummary(){
  var total=_woDone.reduce(function(s,d){return s+d.duration},0)
  var el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:2.5rem;margin-bottom:4px">🎉</div><div style="font-size:1.5rem;font-weight:800;margin-bottom:12px">有氧训练完成！</div>'
    +_woDone.map(function(d,i){
      var ct=getAllCardioTypes().find(function(x){return x.id===d.type})||{emoji:'🏃',name:d.type}
      return '<div style="font-size:.8rem;color:var(--text2)">'+ct.emoji+' '+ct.name+' '+d.duration+'分钟 · 强度×'+d.intensity+'</div>'
    }).join('')
    +'<div style="display:flex;justify-content:center;gap:24px;margin:16px 0"><div><div style="font-size:1.5rem;font-weight:800;color:var(--orange)">'+total+'</div><div style="font-size:.65rem;color:var(--text3)">总分钟</div></div></div>'
    +'<button class="sb-btn" id="woFinish" style="max-width:300px">✅ 记录并完成</button></div>'
  document.getElementById('woFinish').addEventListener('click',function(){
    _woDone.forEach(function(d){addCar({date:today(),type:d.type,duration:d.duration,intensity:d.intensity,distance:0,note:''})})
    document.getElementById('woOverlay')?.remove()
    toast('有氧训练已记录！','s');renderCar()
  })
}

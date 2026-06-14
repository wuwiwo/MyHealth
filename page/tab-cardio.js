/* ============================================
   MyHealth — Tab: Cardio
   ============================================ */

let _carDate=today(),_carForm=false;
let _carSelType='run',_carDur=30,_carDist=0,_carIntensity=2;

function renderCar(){
  const d=_carDate;const f=fmtDate(d)
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
      document.getElementById('carNote').value='';_carDur=30;_carDist=0
      document.getElementById('carDurVal').textContent='30';document.getElementById('carDistVal').textContent='0'
      document.getElementById('carAddCard').classList.remove('open');_carForm=false;document.getElementById('carAddBtn').textContent='＋ 新增记录'
      toast('有氧记录已保存 🏃','s');renderCar();return true}
    case 'carCustomType':{
      showCustomCardioDialog();return true}
  }
  if(act==='carDel'){
    if(confirm('确定删除？')){delCar(el.dataset.id);renderCar();toast('已删除','s')};return true}
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
  var modal=document.createElement('div');modal.className='modal-overlay open'
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">＋ 自定义运动类型</div>'
    +'<div class="fg"><label class="fl">名称</label><input class="fi" id="ccName" placeholder="如: 瑜伽"></div>'
    +'<div class="fg"><label class="fl">图标</label><input class="fi" id="ccEmoji" placeholder="如: 🧘"></div>'
    +'<div class="fg"><label class="fl">默认强度</label><div class="car-types" id="ccIntensity"></div></div>'
    +'<div class="fg" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ccHasDist"><label class="fl" style="margin:0">有距离统计</label></div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="ccCancel">取消</button><button class="m-btn-save" id="ccSave">💾 保存</button></div></div>'
  document.body.appendChild(modal)
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
    var custom=store.get('cardioTypes')||[]
    custom.push({id:'custom'+Date.now().toString(36),name:name,emoji:emoji,hasDist:document.getElementById('ccHasDist').checked,intensity:ccInt})
    store.set('cardioTypes',custom)
    initCardioTypes()
    modal.remove()
    toast('已添加「'+name+'」','s')
  })
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

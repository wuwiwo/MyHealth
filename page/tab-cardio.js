/* ============================================
   MyHealth — Tab: Cardio
   ============================================ */

let _carDate=today(),_carForm=false;
let _carSelType='run',_carDur=30,_carDist=0;

function renderCar(){
  const d=_carDate;const f=fmtDate(d)
  document.getElementById('carDateMain').textContent=f.main
  document.getElementById('carDateSub').textContent=f.sub
  const entries=getCar(d)
  const el=document.getElementById('carList')
  if(!entries.length){
    el.innerHTML='<div class="empty"><span class="empty-e">🏃</span><div class="empty-t">今天还没有有氧记录</div><div class="empty-s">跑一跑、跳一跳，保持活力！</div></div>'
  } else {
    el.innerHTML=entries.map(e=>{
      const ct=CARDIO_TYPES.find(x=>x.id===e.type)||{emoji:'🏃',name:'运动'}
      const ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''
      return '<div class="ec"><div class="ec-hdr"><div class="ec-ex">'+ct.emoji+' '+ct.name+'</div><div class="ec-actions"><button class="ec-act" data-a="carDel" data-id="'+e.id+'">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt"><span>⏱️ '+e.duration+' 分钟</span>'+(e.distance>0?'<span>📏 '+e.distance+' km</span>':'')+'</div></div>'+(e.note?'<div style="font-size:.7rem;color:var(--text2);margin-top:4px">💬 '+e.note+'</div>':'')+'</div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')
  }
  renderCarStats()
}

function renderCarStats(){
  const g=document.getElementById('carStats')
  const we=getWeekCar()
  const total=we.length,dur=we.reduce((s,e)=>s+e.duration,0),dist=we.reduce((s,e)=>s+(e.distance||0),0)
  g.innerHTML='<div class="sc sc-total"><div class="sc-v">'+total+'</div><div class="sc-l">本周次数</div></div><div class="sc sc-vol"><div class="sc-v">'+dur+'</div><div class="sc-l">总分钟</div></div><div class="sc sc-fav"><div class="sc-v">'+(dist>0?dist+'km':'—')+'</div><div class="sc-l">总距离</div></div><div class="sc sc-rate"><div class="sc-v">🔥</div><div class="sc-l">坚持有氧</div></div>'
}
function getWeekCar(){const n=new Date();const d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(store.get('cardio')||{entries:[]}).entries.filter(e=>e.date>=toDate(m))}

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
      addCar({date:_carDate,type:_carSelType,duration:_carDur,distance:_carDist,note:note})
      document.getElementById('carNote').value='';_carDur=30;_carDist=0
      document.getElementById('carDurVal').textContent='30';document.getElementById('carDistVal').textContent='0'
      document.getElementById('carAddCard').classList.remove('open');_carForm=false;document.getElementById('carAddBtn').textContent='＋ 新增记录'
      toast('有氧记录已保存 🏃','s');renderCar();return true}
  }
  if(act==='carDel'){
    if(confirm('确定删除？')){delCar(el.dataset.id);renderCar();toast('已删除','s')};return true}
  return false
}

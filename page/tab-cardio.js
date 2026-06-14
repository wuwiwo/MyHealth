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

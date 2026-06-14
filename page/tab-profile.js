/* ============================================
   MyHealth — Tab: Profile (Weight & Chart)
   ============================================ */

function renderProf(){
  const pc=document.getElementById('profileCard')
  var prof=getProf()
  pc.innerHTML='<div class="pf-row"><label>身高</label><input type="number" id="pfHeight" value="'+prof.height+'" step="1" min="100" max="250"></div><div class="pf-row"><label>性别</label><select id="pfGender"><option value="男"'+(prof.gender==='男'?' selected':'')+'>男</option><option value="女"'+(prof.gender==='女'?' selected':'')+'>女</option></select></div><div class="pf-row"><label>出生年</label><input type="number" id="pfBirth" value="'+prof.birthYear+'" step="1" min="1950" max="2010"></div><button class="sb-btn" id="pfSave" style="margin-top:4px">💾 保存资料</button>'
  document.getElementById('pfSave').addEventListener('click',()=>{
    prof.height=parseFloat(document.getElementById('pfHeight').value)||175
    prof.gender=document.getElementById('pfGender').value
    prof.birthYear=parseInt(document.getElementById('pfBirth').value)||1990
    setProf(prof);toast('资料已保存','s')
  })
  var recs=getWt();if(recs.length>0){var inp=document.getElementById('wtInput');if(inp)inp.value=recs[0].weight}
  renderWtList()
  renderChart()
}

function renderWtList(){
  const el=document.getElementById('weightList')
  const recs=getWt()
  if(!recs.length){el.innerHTML='<div class="empty"><span class="empty-e">⚖️</span><div class="empty-t">还没有体重记录</div><div class="empty-s">输入体重并点击记录</div></div>';return}
  el.innerHTML=recs.map(r=>'<div class="wt-entry"><div><span class="wt-val">'+r.weight+'</span> <span class="wt-date">kg · '+r.date+'</span>'+(r.note?'<br><span class="wt-note">💬 '+r.note+'</span>':'')+'</div><button class="ec-act" data-a="wtDel" data-id="'+r.id+'">🗑️</button></div>').join('')
  el.querySelectorAll('[data-a="wtDel"]').forEach(b=>b.addEventListener('click',()=>{
    var wt=store.get('weight')||{records:[]};wt.records=wt.records.filter(r=>r.id!==b.dataset.id);store.set('weight',wt);renderWtList();renderChart()
  }))
}

function renderChart(){
  const c=document.getElementById('weightCanvas');if(!c)return
  const rect=c.parentElement.getBoundingClientRect()
  c.width=rect.width*2;c.height=180*2;c.style.width=rect.width+'px';c.style.height='180px'
  const ctx=c.getContext('2d');ctx.scale(2,2)
  const W=rect.width,H=180,pad=40
  const recs=getWt().slice(0,30).reverse()
  if(recs.length<2){
    ctx.fillStyle='var(--text3)';ctx.font='12px sans-serif';ctx.textAlign='center'
    ctx.fillText('至少需要 2 条记录才能显示趋势',W/2,H/2);return
  }
  const vals=recs.map(r=>r.weight);const min=Math.floor(Math.min(...vals)-1),max=Math.ceil(Math.max(...vals)+1)
  const range=max-min;const xs=recs.map((_,i)=>pad+i*(W-pad*2)/(recs.length-1))
  const yv=v=>H-20-(v-min)/range*(H-40)
  ctx.strokeStyle='rgba(100,116,139,.15)';ctx.lineWidth=.5
  for(let v=min;v<=max;v++){const y=yv(v);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}
  ctx.fillStyle='var(--text3)';ctx.font='9px sans-serif';ctx.textAlign='center'
  recs.forEach((r,i)=>{ctx.fillText(r.date.slice(5),xs[i],H-5)})
  ctx.textAlign='right';ctx.fillText(min,W-3,yv(min)+3);ctx.fillText(max,W-3,yv(max)+3)
  ctx.beginPath();recs.forEach((r,i)=>{const x=xs[i],y=yv(r.weight);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)})
  ctx.strokeStyle='#F97316';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke()
  const grd=ctx.createLinearGradient(0,yv(min),0,yv(max));grd.addColorStop(0,'rgba(249,115,22,.15)');grd.addColorStop(1,'rgba(249,115,22,0)')
  ctx.beginPath();ctx.moveTo(xs[0],yv(vals[0]))
  recs.forEach((r,i)=>ctx.lineTo(xs[i],yv(r.weight)))
  ctx.lineTo(xs[xs.length-1],yv(min));ctx.lineTo(xs[0],yv(min));ctx.closePath()
  ctx.fillStyle=grd;ctx.fill()
  recs.forEach((r,i)=>{ctx.beginPath();ctx.arc(xs[i],yv(r.weight),3.5,0,Math.PI*2);ctx.fillStyle='#F97316';ctx.fill()
    ctx.beginPath();ctx.arc(xs[i],yv(r.weight),5,0,Math.PI*2);ctx.fillStyle='rgba(249,115,22,.2)';ctx.fill()})
  const last=recs[recs.length-1];ctx.fillStyle='#F97316';ctx.font='bold 12px sans-serif';ctx.textAlign='center'
  ctx.fillText(last.weight+'kg',xs[xs.length-1],yv(last.weight)-10)
}

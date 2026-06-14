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
  var c=document.getElementById('weightCanvas');if(!c)return
  var recs=getWt().slice(0,30).reverse()
  drawLineChart(c,{
    labels:recs.map(function(r){return r.date.slice(5)}),
    values:recs.map(function(r){return r.weight}),
    color:'#F97316',suffix:'kg'
  })
}

/* ========== PROFILE EVENT HANDLER ========== */
function onProfileEvent(el,id,act){
  if(id==='wtSubmit'){
    var w=parseFloat(document.getElementById('wtInput').value)
    if(isNaN(w)||w<=0||w>500){toast('请输入有效体重 (1-500 kg)','e');return true}
    var note=document.getElementById('wtNote').value.trim()
    addWt({date:today(),weight:w,note:note})
    document.getElementById('wtNote').value=''
    toast('体重已记录 ⚖️','s');renderWtList();renderChart();return true
  }
  return false
}

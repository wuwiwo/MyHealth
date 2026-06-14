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
  renderHeatmap()
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

/* ========== HEATMAP ========== */
let _hmY=new Date().getFullYear(),_hmM=new Date().getMonth()
function renderHeatmap(){
  var c=document.getElementById('profileHeatmap');if(!c)return
  var n=new Date(_hmY,_hmM);var y=n.getFullYear(),m=n.getMonth()
  var dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay()
  var so=fd===0?6:fd-1,wd=['一','二','三','四','五','六','日']
  var mn=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  var dd={}
  for(var d=1;d<=dim;d++){
    var s=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')
    var strEntries=getStr(s)||[]
    var carEntries=getCar(s)||[]
    var strReps=strEntries.reduce(function(a,e){return a+e.actualReps},0)
    var carMin=carEntries.reduce(function(a,e){return a+e.duration},0)
    var score=strReps+carMin
    dd[d]={score:score,date:s}
  }
  var max=Math.max(1);for(var k in dd){if(dd[k].score>max)max=dd[k].score}
  function lv(r){if(r===0)return 0;var ra=r/max;if(ra<=.1)return 1;if(ra<=.3)return 2;if(ra<=.5)return 3;if(ra<=.75)return 4;return 5}
  var h='<div class="hm"><div class="hm-hdr"><div class="hm-label">'+y+'年 '+mn[m]+'</div><div class="hm-nav"><button class="hm-nav-btn" data-n="hmP">◀</button><button class="hm-nav-btn" data-n="hmT">📍</button><button class="hm-nav-btn" data-n="hmN">▶</button></div></div><div class="hm-grid">'
  wd.forEach(function(d){h+='<div class="hm-dh">'+d+'</div>'})
  for(var i=0;i<so;i++)h+='<div class="hm-cell"></div>'
  for(var d=1;d<=dim;d++){
    var da=dd[d];var l=lv(da.score);var t=da.date===today()
    h+='<div class="hm-cell'+(t?' today':'')+'" data-l="'+l+'" data-date="'+da.date+'">'+d+'</div>'
  }
  h+='</div><div class="hm-leg">少 <div class="l0"></div><div class="l1"></div><div class="l3"></div><div class="l5"></div> 多</div></div>'
  c.innerHTML=h
  c.querySelectorAll('[data-n="hmP"]').forEach(function(b){b.addEventListener('click',function(){_hmM--;if(_hmM<0){_hmM=11;_hmY--;if(_hmY<2020){_hmY=2020;_hmM=0}}renderHeatmap()})})
  c.querySelectorAll('[data-n="hmN"]').forEach(function(b){b.addEventListener('click',function(){_hmM++;if(_hmM>11){_hmM=0;_hmY++;var maxY=new Date().getFullYear()+1;if(_hmY>maxY){_hmY=maxY;_hmM=11}}renderHeatmap()})})
  c.querySelectorAll('[data-n="hmT"]').forEach(function(b){b.addEventListener('click',function(){var n=new Date();_hmY=n.getFullYear();_hmM=n.getMonth();renderHeatmap()})})
  c.querySelectorAll('.hm-cell[data-date]').forEach(function(b){b.addEventListener('click',function(){
    _strDate=b.dataset.date;renderStr()
    switchTab('strength')
  })})
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

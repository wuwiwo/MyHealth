/* ============================================
   MyHealth — Tab: Profile (Personal + Training)
   ============================================ */

function renderProf(){
  var pc=document.getElementById('profileCard')
  var prof=getProf()
  pc.innerHTML='<div class="pf-row"><label>身高</label><input type="number" id="pfHeight" value="'+prof.height+'" step="1" min="100" max="250"></div><div class="pf-row"><label>性别</label><select id="pfGender"><option value="男"'+(prof.gender==='男'?' selected':'')+'>男</option><option value="女"'+(prof.gender==='女'?' selected':'')+'>女</option></select></div><div class="pf-row"><label>出生年</label><input type="number" id="pfBirth" value="'+prof.birthYear+'" step="1" min="1950" max="2010"></div><button class="sb-btn" id="pfSave" style="margin-top:4px">💾 保存资料</button>'
  document.getElementById('pfSave').addEventListener('click',function(){
    prof.height=parseFloat(document.getElementById('pfHeight').value)||175
    prof.gender=document.getElementById('pfGender').value
    prof.birthYear=parseInt(document.getElementById('pfBirth').value)||1990
    setProf(prof);toast('资料已保存','s')
  })
  var recs=getWt();if(recs.length>0){var inp=document.getElementById('wtInput');if(inp)inp.value=recs[0].weight}
  renderWtList()
  renderChart()
  renderPRs()
  renderStats()
  renderHeatmap()
}

function renderWtList(){
  var el=document.getElementById('weightList')
  var recs=getWt()
  if(!recs.length){el.innerHTML='<div class="empty"><span class="empty-e">⚖️</span><div class="empty-t">还没有体重记录</div><div class="empty-s">输入体重并点击记录</div></div>';return}
  el.innerHTML=recs.map(function(r){return'<div class="wt-entry"><div><span class="wt-val">'+r.weight+'</span> <span class="wt-date">kg · '+r.date+'</span>'+(r.note?'<br><span class="wt-note">💬 '+r.note+'</span>':'')+'</div><button class="ec-act" data-a="wtDel" data-id="'+r.id+'">🗑️</button></div>'}).join('')
  el.querySelectorAll('[data-a="wtDel"]').forEach(function(b){b.addEventListener('click',function(){
    var wt=store.get('weight')||{records:[]};wt.records=wt.records.filter(function(r){return r.id!==b.dataset.id});store.set('weight',wt);renderWtList();renderChart()
  })})
}

function renderChart(){
  var c=document.getElementById('weightCanvas');if(!c)return
  var recs=getWt().slice(0,30).reverse()
  drawLineChart(c,{labels:recs.map(function(r){return r.date.slice(5)}),values:recs.map(function(r){return r.weight}),color:'#F97316',suffix:'kg'})
}

/* ========== PERSONAL RECORDS ========== */
function renderPRs(){
  var prs=store.get('prs')||{}
  var keys=Object.keys(prs)
  var el=document.getElementById('prSection');if(!el)return
  if(!keys.length){el.innerHTML='';return}
  var h='<div class="section-hdr">🏆 个人最佳</div><div class="stats-grid">'
  keys.forEach(function(ex){var pr=prs[ex]
    h+='<div class="sc"><div class="sc-v" style="font-size:1rem">'+ex+'</div><div class="sc-l" style="font-size:.65rem;line-height:1.5">'
    if(pr.maxWeight)h+='🏋️ '+pr.maxWeight+'kg<br>'
    if(pr.maxReps)h+='🔢 '+pr.maxReps+'次<br>'
    if(pr.maxVolume)h+='📊 '+pr.maxVolume+'kg'
    h+='</div></div>'
  })
  h+='</div>'
  el.innerHTML=h
}

/* ========== TRAINING STATISTICS ========== */
function renderStats(){
  var strEntries=(store.get('strength')||{entries:[]}).entries||[]
  var carEntries=(store.get('cardio')||{entries:[]}).entries||[]
  var totalDays=new Set()
  strEntries.forEach(function(e){totalDays.add(e.date)})
  carEntries.forEach(function(e){totalDays.add(e.date)})

  // Monthly volume for last 6 months
  var now=new Date(),labels=[],volumes=[]
  for(var i=5;i>=0;i--){
    var y=now.getFullYear(),m=now.getMonth()-i
    if(m<0){m+=12;y--}
    var start=y+'-'+String(m+1).padStart(2,'0')+'-01'
    var end=y+'-'+String(m+1).padStart(2,'0')+'-31'
    var vol=strEntries.filter(function(e){return e.date>=start&&e.date<end}).reduce(function(s,e){return s+e.weight*e.actualReps},0)
    labels.push((m+1)+'月');volumes.push(vol)
  }

  // Favorite exercises TOP5
  var exCount={}
  strEntries.forEach(function(e){exCount[e.exercise]=(exCount[e.exercise]||0)+1})
  var top5=Object.keys(exCount).sort(function(a,b){return exCount[b]-exCount[a]}).slice(0,5)

  var h='<div class="section-hdr">📊 训练统计</div>'
  h+='<div class="stats-grid" style="margin-bottom:8px">'
  h+='<div class="sc sc-total"><div class="sc-v">'+totalDays.size+'</div><div class="sc-l">训练天数</div></div>'
  h+='<div class="sc sc-vol"><div class="sc-v">'+strEntries.length+'</div><div class="sc-l">力量组数</div></div>'
  h+='<div class="sc sc-rate"><div class="sc-v">'+carEntries.length+'</div><div class="sc-l">有氧次数</div></div>'
  var favText=top5.slice(0,3).join('<br>')
  h+='<div class="sc sc-fav"><div class="sc-v" style="font-size:.8rem">'+favText+'</div><div class="sc-l">最爱动作</div></div>'
  h+='</div>'
  if(volumes.some(function(v){return v>0})){
    h+='<div class="chart-wrap"><div style="font-size:.7rem;color:var(--text3);padding:4px 8px 0">月度总容量趋势 (kg)</div><canvas id="statsCanvas"></canvas></div>'
  }
  document.getElementById('statsSection').innerHTML=h

  var canvas=document.getElementById('statsCanvas')
  if(canvas){drawLineChart(canvas,{labels:labels,values:volumes,color:'#22C55E',suffix:'kg'})}
}

/* ========== HEATMAP ========== */
var _hmY=new Date().getFullYear(),_hmM=new Date().getMonth()
function renderHeatmap(){
  var c=document.getElementById('profileHeatmap');if(!c)return
  var n=new Date(_hmY,_hmM);var y=n.getFullYear(),m=n.getMonth()
  var dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay()
  var so=fd===0?6:fd-1,wd=['一','二','三','四','五','六','日']
  var mn=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  var dd={}
  for(var d=1;d<=dim;d++){
    var s=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')
    var strE=getStr(s)||[],carE=getCar(s)||[]
    var score=strE.reduce(function(a,e){return a+e.actualReps},0)+carE.reduce(function(a,e){return a+e.duration},0)
    dd[d]={score:score,date:s}
  }
  var max=1;for(var k in dd){if(dd[k].score>max)max=dd[k].score}
  function lv(r){if(r===0)return 0;var ra=r/max;if(ra<=.1)return 1;if(ra<=.3)return 2;if(ra<=.5)return 3;if(ra<=.75)return 4;return 5}
  var h='<div class="section-hdr">📅 训练热力图</div><div class="hm"><div class="hm-hdr"><div class="hm-label">'+y+'年 '+mn[m]+'</div><div class="hm-nav"><button class="hm-nav-btn" data-n="hmP">◀</button><button class="hm-nav-btn" data-n="hmT">📍</button><button class="hm-nav-btn" data-n="hmN">▶</button></div></div><div class="hm-grid">'
  wd.forEach(function(d){h+='<div class="hm-dh">'+d+'</div>'})
  for(var i=0;i<so;i++)h+='<div class="hm-cell"></div>'
  for(var d=1;d<=dim;d++){var da=dd[d],ll=lv(da.score),t=da.date===today();h+='<div class="hm-cell'+(t?' today':'')+'" data-l="'+ll+'" data-date="'+da.date+'">'+d+'</div>'}
  h+='</div><div class="hm-leg">少 <div class="l0"></div><div class="l1"></div><div class="l3"></div><div class="l5"></div> 多</div></div>'
  c.innerHTML=h
  c.querySelectorAll('[data-n="hmP"]').forEach(function(b){b.addEventListener('click',function(){_hmM--;if(_hmM<0){_hmM=11;_hmY--;if(_hmY<2020){_hmY=2020;_hmM=0}}renderHeatmap()})})
  c.querySelectorAll('[data-n="hmN"]').forEach(function(b){b.addEventListener('click',function(){_hmM++;if(_hmM>11){_hmM=0;_hmY++;var maxY=new Date().getFullYear()+1;if(_hmY>maxY){_hmY=maxY;_hmM=11}}renderHeatmap()})})
  c.querySelectorAll('[data-n="hmT"]').forEach(function(b){b.addEventListener('click',function(){var n=new Date();_hmY=n.getFullYear();_hmM=n.getMonth();renderHeatmap()})})
  c.querySelectorAll('.hm-cell[data-date]').forEach(function(b){b.addEventListener('click',function(){_strDate=b.dataset.date;renderStr();switchTab('strength')})})
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

/* ========== SUB-TAB SWITCHING ========== */
function switchProfileSub(name){
  document.querySelectorAll('#tabProfile .tab-btn').forEach(function(b){b.classList.toggle('active',b.dataset.sub===name)})
  document.querySelectorAll('#tabProfile .sub-tab').forEach(function(c){c.classList.toggle('active',c.id==='sub'+name.charAt(0).toUpperCase()+name.slice(1))})
  if(name==='training'){renderStats();renderHeatmap()}
}
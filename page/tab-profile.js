/* ============================================
   MyHealth — Tab: Profile (Personal + Training)
   ============================================ */

var _wtView='month'; // 'week' or 'month'

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
  renderWtNoteTags()
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
  var wrap=document.getElementById('weightChart');if(!wrap)return
  var toggleHtml='<div style="display:flex;gap:6px;margin-bottom:8px">'
    +'<button class="car-type'+(_wtView==='week'?' selected':'')+'" id="wtViewWeek" style="padding:5px 14px;font-size:.72rem">📅 周</button>'
    +'<button class="car-type'+(_wtView==='month'?' selected':'')+'" id="wtViewMonth" style="padding:5px 14px;font-size:.72rem">📅 月</button>'
    +'</div>';
  var c=document.getElementById('weightCanvas');if(!c)return
  var all=getWt().reverse(); // oldest first
  var cutoff;
  if(_wtView==='week'){
    var w=new Date();w.setDate(w.getDate()-7);
    cutoff=toDate(w);
  }else{
    var m=new Date();m.setDate(m.getDate()-30);
    cutoff=toDate(m);
  }
  var recs=all.filter(function(r){return r.date>=cutoff});
  // Ensure canvas re-renders by resetting size
  wrap.style.display='block';
  // Insert toggle before canvas if not present
  var existingToggle=wrap.querySelector('[data-wt-toggle]');
  if(!existingToggle){
    var div=document.createElement('div');div.setAttribute('data-wt-toggle','1');div.innerHTML=toggleHtml;
    wrap.insertBefore(div,wrap.querySelector('canvas'));
  }else{
    existingToggle.innerHTML=toggleHtml;
  }
  drawLineChart(c,{labels:recs.map(function(r){return r.date.slice(5)}),values:recs.map(function(r){return r.weight}),color:'#F97316',suffix:'kg'})
  var wBtn=document.getElementById('wtViewWeek'),mBtn=document.getElementById('wtViewMonth');
  if(wBtn)wBtn.addEventListener('click',function(){_wtView='week';renderChart()});
  if(mBtn)mBtn.addEventListener('click',function(){_wtView='month';renderChart()});
}

/* ========== WEIGHT NOTE TAGS (frequent notes from history) ========== */
function renderWtNoteTags(){
  var el=document.getElementById('wtNoteTags');if(!el)return
  var recs=getWt();
  var counts={};
  recs.forEach(function(r){if(r.note){counts[r.note]=(counts[r.note]||0)+1}});
  var top=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]}).slice(0,5);
  if(!top.length){el.innerHTML='';return}
  el.innerHTML='<div style="margin-bottom:4px;font-size:.62rem;color:var(--text3)">高频备注</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">'
    +top.map(function(n){return'<button class="car-type" data-wtnote="'+n.replace(/"/g,'&quot;')+'" style="padding:3px 10px;font-size:.68rem">'+n+'</button>'}).join('')
    +'</div>';
  el.querySelectorAll('[data-wtnote]').forEach(function(b){
    b.addEventListener('click',function(){
      var inp=document.getElementById('wtNote');if(inp)inp.value=b.dataset.wtnote;
    });
  });
}

/* ========== PERSONAL RECORDS ========== */
function renderPRs(){
  var prs=store.get('prs')||{}
  var keys=Object.keys(prs)
  var el=document.getElementById('prSection');if(!el)return
  if(!keys.length){el.innerHTML='';return}
  var exMap=getExerciseMap()
  var h='<div class="section-hdr">🏆 个人最佳</div><div class="stats-grid">'
  keys.forEach(function(ex){var pr=prs[ex]
    h+='<div class="sc"><div class="sc-v" style="font-size:1rem">'+ex+'</div><div class="sc-l" style="font-size:.65rem;line-height:1.5">'
    if(pr.maxWeight)h+='🏋️ '+pr.maxWeight+'kg<br>'
    if(pr.maxReps)h+='🔢 '+pr.maxReps+'次<br>'
    if(pr.maxVolume){
      var ratio=exMap[ex]&&exMap[ex].ratio!=null?exMap[ex].ratio:100
      if(ratio<100){
        var eff=Math.round(pr.maxVolume*ratio/100)
        h+='📊 '+pr.maxVolume+'kg <span style="font-size:.6rem;color:var(--text3)">→'+eff+'</span>'
      }else{
        h+='📊 '+pr.maxVolume+'kg'
      }
    }
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
    var vol=sumVolume(strEntries.filter(function(e){return e.date>=start&&e.date<end}),getExerciseMap())
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
  // Last 30 days: daily volume & cardio duration
  var d30=buildLast30Days()
  if(d30.days>0){
    h+='<div class="chart-wrap" style="margin-top:10px"><div style="font-size:.7rem;color:var(--text3);padding:4px 8px 0">最近 30 天每日容量 (kg)</div><canvas id="stats30Canvas"></canvas></div>'
    if(d30.carDays>0){
      h+='<div class="chart-wrap" style="margin-top:10px"><div style="font-size:.7rem;color:var(--text3);padding:4px 8px 0">最近 30 天有氧时长 (分钟)</div><canvas id="stats30CarCanvas"></canvas></div>'
    }
  }
  document.getElementById('statsSection').innerHTML=h

  var canvas=document.getElementById('statsCanvas')
  if(canvas){drawLineChart(canvas,{labels:labels,values:volumes,color:'#22C55E',suffix:'kg'})}
  var c30=document.getElementById('stats30Canvas')
  if(c30){drawLineChart(c30,{labels:d30.labels,values:d30.vols,color:'#F97316',suffix:'kg'})}
  var c30c=document.getElementById('stats30CarCanvas')
  if(c30c){drawLineChart(c30c,{labels:d30.labels,values:d30.carMins,color:'#3B82F6',suffix:'分'})}
}

/* Build last-30-day daily series: labels (M/D), daily volume, daily cardio minutes */
function buildLast30Days(){
  var strEntries=(store.get('strength')||{entries:[]}).entries||[]
  var carEntries=(store.get('cardio')||{entries:[]}).entries||[]
  var labels=[],vols=[],carMins=[]
  var todayD=new Date()
  for(var i=29;i>=0;i--){
    var d=new Date(todayD);d.setDate(d.getDate()-i)
    var ds=toDate(d)
    var vol=sumVolume(strEntries.filter(function(e){return e.date===ds}),getExerciseMap())
    var cm=sumDuration(carEntries.filter(function(e){return e.date===ds}))
    labels.push((d.getMonth()+1)+'/'+d.getDate())
    vols.push(Math.round(vol))
    carMins.push(Math.round(cm))
  }
  var days=vols.some(function(v){return v>0})?1:0
  if(!days)days=carMins.some(function(v){return v>0})?1:0
  return{labels:labels,vols:vols,carMins:carMins,days:days,carDays:carMins.some(function(v){return v>0})?1:0}
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
  c.querySelectorAll('.hm-cell[data-date]').forEach(function(b){b.addEventListener('click',function(){_strDate=b.dataset.date;renderStr();switchTab('training');switchSub('training','strength')})})
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

/* Sub-tab switching is now handled by the generic switchSub() in app.js */
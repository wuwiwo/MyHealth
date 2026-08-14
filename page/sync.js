/* ============================================
   MyHealth — Cloud Sync (Manual) & Export/Import
   ============================================ */

/* ========== SYNC ENGINE ========== */
var _lastSyncTime=parseInt(localStorage.getItem('dh-sync-time')||'0',10)

function saveSyncTime(){_lastSyncTime=Date.now();localStorage.setItem('dh-sync-time',String(_lastSyncTime))}

/* UI indicator */
function setSync(s){var e=document.getElementById('syncIndicator');if(!e)return
e.className='sync-dot';if(s==='synced'){e.classList.add('synced');e.textContent='✓'}
else if(s==='syncing'){e.classList.add('syncing');e.textContent='↻'}
else if(s==='error'){e.classList.add('error');e.textContent='⚠'}
else e.textContent='🔄'}

/* Network layer — with automatic retry (exponential backoff) */
var MAX_RETRY=2
function apiPut(data,cb,attempt){attempt=attempt||0
var x=new XMLHttpRequest()
x.open('PUT','/api/data',true)
x.setRequestHeader('Content-Type','application/json')
x.onload=function(){
  if(x.status===200){cb(true)}
  else if(attempt<MAX_RETRY){setTimeout(function(){apiPut(data,cb,attempt+1)},400*Math.pow(2,attempt))}
  else{cb(false)}
}
x.onerror=function(){
  if(attempt<MAX_RETRY){setTimeout(function(){apiPut(data,cb,attempt+1)},400*Math.pow(2,attempt))}
  else{cb(false)}
}
x.send(JSON.stringify(data))}

function apiGet(cb,attempt){attempt=attempt||0
var x=new XMLHttpRequest()
x.open('GET','/api/data',true)
x.onload=function(){
  if(x.status===200&&x.responseText){try{cb(null,JSON.parse(x.responseText));return}catch(e){}}
  if(attempt<MAX_RETRY){setTimeout(function(){apiGet(cb,attempt+1)},400*Math.pow(2,attempt))}
  else{cb(true,null)}
}
x.onerror=function(){
  if(attempt<MAX_RETRY){setTimeout(function(){apiGet(cb,attempt+1)},400*Math.pow(2,attempt))}
  else{cb(true,null)}
};x.send()}

/* Data summary for display */
function dataSummary(d){
  var strE=d.entries?d.entries.length:0
  var carE=d.cardio?d.cardio.length:0
  var wtE=d.weight?d.weight.length:0
  var plans=d.plans?d.plans.length:0
  var gameC=d.game&&d.game.cleared?d.game.cleared.length:0
  var prsC=d.prs?Object.keys(d.prs).length:0
  var recC=d.records?Object.keys(d.records).length:0
  var logC=d.attrLog?d.attrLog.length:0
  var ctC=d.cardioTypes?d.cardioTypes.length:0
  var exC=d.exercises?d.exercises.length:0
  var time=d.lastUpdated?new Date(d.lastUpdated).toLocaleString('zh-CN'):'未知'
  return{strE:strE,carE:carE,wtE:wtE,plans:plans,gameC:gameC,prsC:prsC,recC:recC,logC:logC,ctC:ctC,exC:exC,time:time}
}

/* Data assembler */
function getAllData(){
  var s=store.get('strength')||{entries:[]};
  var p=store.get('plans')||{plans:[]};
  var m=store.get('missed')||{notes:{}};
  var c=store.get('cardio')||{entries:[]};
  var w=store.get('weight')||{records:[]};
  return{
    version:4,lastUpdated:store.getLastModTime()||Date.now(),
    entries:s.entries,plans:p.plans,missed:m.notes,
    cardio:c.entries,weight:w.records,profile:getProf(),game:getGame(),
    prs:store.get('prs'),records:store.get('records'),
    attrLog:store.get('attrLog'),cardioTypes:store.get('cardioTypes'),
    exercises:store.get('exercises'),refine:store.get('refine'),challenge:store.get('challenge')
  }
}

/* Merge server response into local store */
function mergeServerData(d){
  function hasItems(v){return Array.isArray(v)?v.length>0:false}
  function hasKeys(v){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0}
  if(!d||!(d.version>=2||hasItems(d.entries)||hasItems(d.cardio)||hasItems(d.weight)))return false
  var merge={}
  if(hasItems(d.entries)){merge.strength={entries:d.entries}}
  if(hasItems(d.plans)){merge.plans={plans:d.plans}}
  else if(d.plans?.plans&&hasItems(d.plans.plans)){merge.plans={plans:d.plans.plans}}
  if(hasKeys(d.missed)){merge.missed={notes:d.missed}}
  else if(d.missed?.notes&&hasKeys(d.missed.notes)){merge.missed={notes:d.missed.notes}}
  if(hasItems(d.cardio)){merge.cardio={entries:d.cardio}}
  else if(d.cardio?.entries&&hasItems(d.cardio.entries)){merge.cardio={entries:d.cardio.entries}}
  if(hasItems(d.weight)){merge.weight={records:d.weight}}
  else if(d.weight?.records&&hasItems(d.weight.records)){merge.weight={records:d.weight.records}}
  if(d.profile&&hasKeys(d.profile)){merge.profile=d.profile}
  if(d.game&&typeof d.game==='object'){merge.game=d.game}
  if(d.prs&&typeof d.prs==='object'){merge.prs=d.prs}
  if(d.records&&typeof d.records==='object'){merge.records=d.records}
  if(d.attrLog&&Array.isArray(d.attrLog)){merge.attrLog=d.attrLog}
  if(d.cardioTypes&&Array.isArray(d.cardioTypes)){merge.cardioTypes=d.cardioTypes}
  if(d.exercises&&Array.isArray(d.exercises)){merge.exercises=d.exercises}
  if(d.refine&&typeof d.refine==='object'){merge.refine=d.refine}
  // challenge 同步保护：seasonBonus 按月重置，仅当本地无数据或云端月份不旧于本地时合并
  if(d.challenge&&typeof d.challenge==='object'){
    var localCh=store.get('challenge')
    var remoteMonth=(d.challenge.lastSeasonMonth||'')+'',localMonth=(localCh&&localCh.lastSeasonMonth)||''
    if(!localCh||remoteMonth>=localMonth)merge.challenge=d.challenge
  }
  store.mergeAll(merge)
  return true
}

/* ========== MANUAL SYNC DIALOG ========== */
function autoBackup(){
  try{
    var data=JSON.stringify(getAllData(),null,2)
    var blob=new Blob([data],{type:'application/json'})
    var url=URL.createObjectURL(blob)
    var a=document.createElement('a');a.href=url;a.download='myhealth-auto-'+today()+'-'+Date.now().toString(36)+'.json'
    a.click();URL.revokeObjectURL(url)
    return true
  }catch(e){return false}
}

function showSyncDialog(){
  setSync('syncing')
  var localData=getAllData()
  var localSummary=dataSummary(localData)
  apiGet(function(err,remoteData){
    if(err||!remoteData){
      setSync('error')
      toast('无法连接到云端','e')
      return
    }
    var remoteSummary=dataSummary(remoteData)
    var localModTime=store.getLastModTime()
    var isFirst=_lastSyncTime===0
    var hasLocal=localData.entries&&localData.entries.length>0
    // Judge freshness by actual data modification time, not sync action time
    var localNewer=isFirst?false:(localModTime>0&&(!remoteData.lastUpdated||remoteData.lastUpdated<=localModTime))
    var remoteNewer=isFirst?false:(remoteData.lastUpdated&&remoteData.lastUpdated>localModTime)
    // If both are empty, treat as equal
    if(!hasLocal&&(!remoteData.entries||!remoteData.entries.length)){localNewer=false;remoteNewer=false}
    var localAge=isFirst?' (未同步)':localNewer?' (较新)':remoteNewer?' (较旧)':''
    var remoteAge=isFirst?' (未同步)':remoteNewer?' (较新)':localNewer?' (较旧)':''

    var modal=openModal()
    var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">🔄 同步数据</div>'
    
    // Local card
    h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:10px">'
      +'<div style="font-weight:700;margin-bottom:6px;color:var(--orange)">📱 本地数据'+localAge+'</div>'
      +'<div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">'+localSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:.72rem;color:var(--text2)">'
      +'<div>🏋️ 力量: '+localSummary.strE+' 组</div><div>🏃 有氧: '+localSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+localSummary.wtE+' 条</div><div>📋 计划: '+localSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+localSummary.gameC+' 关</div>'
      +'<div>🏆 PR: '+localSummary.prsC+' 项</div>'
      +'<div>📜 日志: '+localSummary.logC+' 条</div><div>🏋️ 动作: '+localSummary.exC+' 个</div>'
      +'</div></div>'

    // Remote card
    h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:10px">'
      +'<div style="font-weight:700;margin-bottom:6px;color:var(--blue)">☁️ 云端数据'+remoteAge+'</div>'
      +'<div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">'+remoteSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:.72rem;color:var(--text2)">'
      +'<div>🏋️ 力量: '+remoteSummary.strE+' 组</div><div>🏃 有氧: '+remoteSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+remoteSummary.wtE+' 条</div><div>📋 计划: '+remoteSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+remoteSummary.gameC+' 关</div>'
      +'<div>🏆 PR: '+remoteSummary.prsC+' 项</div>'
      +'<div>📜 日志: '+remoteSummary.logC+' 条</div><div>🏋️ 动作: '+remoteSummary.exC+' 个</div>'
      +'</div></div>'

    // Suggestion
    var suggestion=''
    if(isFirst){
      suggestion='<div style="background:rgba(100,116,139,.08);border:2px solid var(--bd-l);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:.75rem;line-height:1.6">'
        +'<div style="font-weight:700;color:var(--text);margin-bottom:4px">🆕 首次同步</div>'
        +'<div style="color:var(--text2)">请选择：推送本地数据到云端，或从云端拉取数据覆盖本地。</div></div>'
    }else if(localNewer&&remoteData.entries){
      suggestion='<div style="background:rgba(249,115,22,.12);border:2px solid var(--orange);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:.75rem;line-height:1.6">'
        +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">💡 建议：推送本地数据到云端</div>'
        +'<div style="color:var(--text2)">本地数据更新 ('+localSummary.time+')，包含 '+localSummary.strE+' 组力量.'+localSummary.prsC+'项PR。云端数据较旧。</div></div>'
    }else if(remoteNewer&&remoteData.entries){
      suggestion='<div style="background:rgba(34,197,94,.08);border:2px solid var(--green);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:.75rem;line-height:1.6">'
        +'<div style="font-weight:700;color:var(--green);margin-bottom:4px">💡 建议：从云端拉取数据</div>'
        +'<div style="color:var(--text2)">云端数据更新 ('+remoteSummary.time+')，包含 '+remoteSummary.strE+' 组力量。本地数据较旧。</div></div>'
    }else if(hasLocal&&remoteData.entries&&localSummary.strE===remoteSummary.strE){
      suggestion='<div style="background:rgba(100,116,139,.08);border:1px solid var(--text3);border-radius:var(--rs);padding:10px 14px;margin-bottom:10px;font-size:.72rem;color:var(--text2);text-align:center">✅ 本地与云端数据一致，无需同步</div>'
    }else{
      suggestion='<div style="background:rgba(100,116,139,.08);border:1px solid var(--text3);border-radius:var(--rs);padding:10px 14px;margin-bottom:10px;font-size:.72rem;color:var(--text2);text-align:center">⚠️ 无法判断新旧关系，请手动选择</div>'
    }
    h+=suggestion

    // Warning
    if(localNewer&&remoteData.entries&&localSummary.strE>remoteSummary.strE){
      h+='<div style="background:rgba(234,179,8,.1);border:1px solid var(--yellow);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:.68rem;color:var(--yellow)">⚠️ 拉取云端会丢失 '+Math.max(0,localSummary.strE-remoteSummary.strE)+' 组力量记录</div>'
    }
    if(remoteNewer&&remoteData.entries&&remoteSummary.strE>localSummary.strE){
      h+='<div style="background:rgba(234,179,8,.1);border:1px solid var(--yellow);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:.68rem;color:var(--yellow)">⚠️ 推送本地会丢失云端 '+Math.max(0,remoteSummary.strE-localSummary.strE)+' 组力量记录</div>'
    }
    h+='<div class="modal-actions" style="flex-wrap:wrap">'
      +'<button class="m-btn-cancel" id="syncCancel" style="flex:1;min-width:80px">取消</button>'
      +'<button class="be-btn" id="syncPull" style="flex:1;min-width:80px;background:var(--blue);color:white">☁️ 拉取云端</button>'
      +'<button class="be-btn" id="syncPush" style="flex:1;min-width:80px;background:var(--orange);color:white">📤 推送本地</button>'
      +'</div></div>'
    modal.innerHTML=h;void modal

    document.getElementById('syncCancel').addEventListener('click',function(){modal.remove();setSync('synced')})
    document.getElementById('syncPull').addEventListener('click',function(){
      modal.remove()
      if(confirm('将用云端数据覆盖本地数据（会自动备份本地数据），确定？')){
        autoBackup()
        if(mergeServerData(remoteData)){
          saveSyncTime()
          toast('已从云端拉取','s')
          renderStr();renderCar();renderProf();renderGame();renderSettings();initCardioTypes()
          setSync('synced')
        }else{setSync('error');toast('云端数据无效','e')}
      }else{setSync('synced')}
    })
    document.getElementById('syncPush').addEventListener('click',function(){
      modal.remove()
      if(confirm('将用本地数据覆盖云端数据，确定？')){
        setSync('syncing')
        apiPut(localData,function(ok){
          if(ok){saveSyncTime();setSync('synced');toast('已推送到云端','s')}
          else{setSync('error');toast('推送失败','e')}
        })
      }else{setSync('synced')}
    })
    modal.addEventListener('click',function(e){if(e.target===e.currentTarget){modal.remove();setSync('synced')}})
  })
}

// Wire store changes to game bar only (no auto sync)
store.onChange(function(key){
  if(key==='strength'||key==='cardio'||key==='game')updateGameBar()
})

/* Shared: build import map from flat backup/cloud data */
function buildImportMap(data){
  function hasItems(v){return Array.isArray(v)&&v.length>0}
  function hasKeys(v){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0}
  var map={}
  if(hasItems(data.entries)){map.strength={entries:data.entries}}
  if(hasItems(data.plans)){map.plans={plans:Array.isArray(data.plans)?data.plans:data.plans.plans||[]}}
  if(hasItems(data.cardio)){map.cardio={entries:Array.isArray(data.cardio)?data.cardio:data.cardio.entries||[]}}
  if(hasItems(data.weight)){map.weight={records:Array.isArray(data.weight)?data.weight:data.weight.records||[]}}
  if(data.profile&&hasKeys(data.profile)){map.profile=data.profile}
  if(data.game&&typeof data.game==='object'){map.game=data.game}
  if(data.missed&&hasKeys(data.missed)){map.missed={notes:data.missed}}
  if(data.prs&&typeof data.prs==='object'){map.prs=data.prs}
  if(data.records&&typeof data.records==='object'){map.records=data.records}
  if(data.attrLog&&Array.isArray(data.attrLog)){map.attrLog=data.attrLog}
  if(data.cardioTypes&&Array.isArray(data.cardioTypes)){map.cardioTypes=data.cardioTypes}
  if(data.exercises&&Array.isArray(data.exercises)){map.exercises=data.exercises}
  if(data.refine&&typeof data.refine==='object'){map.refine=data.refine}
  if(data.challenge&&typeof data.challenge==='object'){map.challenge=data.challenge}
  return map
}

/* ========== EXPORT / IMPORT ========== */
function exportData(){
  var modal=openModal()
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📤 导出数据</div>'
    +'<div style="font-size:.78rem;color:var(--text2);margin-bottom:14px;line-height:1.6">选择导出范围：</div>'
    +'<button class="sb-btn" id="exportFull" style="margin-bottom:8px">📦 全量数据（完整备份）</button>'
    +'<button class="sb-btn" id="export7" style="background:var(--bg3);color:var(--text);border:1px solid var(--bd)">📅 最近7天（精简，适合发给AI）</button>'
    +'<button class="sb-btn" id="export5" style="background:var(--bg3);color:var(--text);border:1px solid var(--bd)">📅 最近5天</button>'
    +'<button class="sb-btn" id="export3" style="background:var(--bg3);color:var(--text);border:1px solid var(--bd)">📅 最近3天</button>'
    +'<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--bd)">'
    +'<button class="sb-btn" id="exportCopy" style="background:var(--bg3);color:var(--text);border:1px solid var(--bd)">📋 复制最近7天到剪贴板</button>'
    +'</div>'
    +'<div class="modal-actions"><button class="m-btn-cancel" id="exportCancel">取消</button></div></div>'
  void modal
  document.getElementById('exportFull').addEventListener('click',function(){
    modal.remove();autoBackup();toast('全量数据已导出 ✅','s')
  })
  document.getElementById('export7').addEventListener('click',function(){
    modal.remove();exportRecent(7)
  })
  document.getElementById('export5').addEventListener('click',function(){
    modal.remove();exportRecent(5)
  })
  document.getElementById('export3').addEventListener('click',function(){
    modal.remove();exportRecent(3)
  })
  document.getElementById('exportCopy').addEventListener('click',function(){
    modal.remove();copyRecentToClipboard()
  })
  document.getElementById('exportCancel').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

/* 导出最近 N 天：含基础信息、最近体重、断签理由、统计摘要 */
function buildRecentData(days){
  var data=getAllData();
  var cutoff=toDate(new Date(Date.now()-days*86400000));
  var filtered={
    version:data.version,lastUpdated:Date.now(),
    days:days,
    entries:(data.entries||[]).filter(function(e){return e.date>=cutoff}),
    cardio:(data.cardio||[]).filter(function(e){return e.date>=cutoff}),
    weight:(data.weight||[]).filter(function(e){return e.date>=cutoff}),
    profile:data.profile,exercises:data.exercises
  };
  // 个人基础信息
  var prof=data.profile||{};
  filtered.userInfo={
    height:prof.height||'—',gender:prof.gender||'—',birthYear:prof.birthYear||'—'
  };
  // 最近体重（最多5条）
  var wts=(data.weight||[]).slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,5);
  filtered.recentWeight=wts;
  // 断签理由（窗口内）
  var missed=data.missed||{};
  var missFiltered={};
  Object.keys(missed).forEach(function(k){if(k>=cutoff)missFiltered[k]=missed[k]});
  filtered.missed=missFiltered;
  // 挑战与属性
  filtered.game=data.game;
  filtered.challenge=data.challenge;
  // Stats summary for AI context
  var exMap=getExerciseMap();
  filtered.summary={
    days:days,
    strengthCount:filtered.entries.length,
    cardioCount:filtered.cardio.length,
    weightCount:filtered.weight.length,
    totalVolume:Math.round(sumVolume(filtered.entries,exMap)),
    totalCardioDuration:sumDuration(filtered.cardio),
    period:getCurrentPeriod(new Date())
  };
  return filtered;
}

function exportRecent(days){
  try{
    var filtered=buildRecentData(days);
    var json=JSON.stringify(filtered,null,2)
    var blob=new Blob([json],{type:'application/json'})
    var url=URL.createObjectURL(blob)
    var a=document.createElement('a');a.href=url;a.download='myhealth-'+days+'d-'+today()+'.json'
    a.click();URL.revokeObjectURL(url)
    toast('最近'+days+'天数据已导出 ✅','s')
  }catch(e){toast('导出失败: '+e.message,'e')}
}

/* 复制最近7天到剪贴板（含可读摘要） */
function copyRecentToClipboard(){
  try{
    var d=buildRecentData(7);
    var exMap=getExerciseMap();
    // 人类可读摘要
    var lines=[];
    lines.push('💪 MyHealth 最近7天训练报告 ('+today()+')');
    lines.push('个人: 身高'+d.userInfo.height+'cm · '+d.userInfo.gender+' · '+d.userInfo.birthYear+'年');
    lines.push('力量: '+d.entries.length+'组 / 容量 '+d.summary.totalVolume+'kg');
    lines.push('有氧: '+d.cardio.length+'次 / '+d.summary.totalCardioDuration+'分钟');
    if(d.recentWeight&&d.recentWeight.length){lines.push('体重: '+d.recentWeight.map(function(w){return w.date+' '+w.weight+'kg'}).join(' / '))}
    if(Object.keys(d.missed||{}).length){lines.push('断签说明: '+Object.keys(d.missed).map(function(k){return k+':'+d.missed[k]}).join('；'))}
    lines.push('');
    lines.push('JSON 明细:');
    lines.push(JSON.stringify(d,null,2));
    var text=lines.join('\n');
    var done=function(){toast('已复制到剪贴板 📋','s')};
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){fallbackCopy(text);done()});
    }else{
      fallbackCopy(text);done();
    }
  }catch(e){toast('复制失败: '+e.message,'e')}
}

function fallbackCopy(text){
  var ta=document.createElement('textarea');
  ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy')}catch(e){}
  document.body.removeChild(ta);
}

function importData(){
  var input=document.createElement('input');input.type='file';input.accept='.json'
  input.onchange=function(e){
    var file=e.target.files[0];if(!file)return
    var reader=new FileReader()
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result)
        store.mergeAll(buildImportMap(data))
        toast('数据导入成功 ✅','s')
        renderStr();renderCar();renderProf();renderGame();renderSettings();initCardioTypes()
      }catch(e){toast('文件格式错误: '+e.message,'e')}
    };reader.readAsText(file)
  };input.click()
}

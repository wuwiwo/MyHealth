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

/* Network layer */
function apiPut(data,cb){var x=new XMLHttpRequest()
x.open('PUT','/api/data',true)
x.setRequestHeader('Content-Type','application/json')
x.onload=function(){cb(x.status===200)}
x.onerror=function(){cb(false)}
x.send(JSON.stringify(data))}

function apiGet(cb){var x=new XMLHttpRequest()
x.open('GET','/api/data',true)
x.onload=function(){if(x.status===200&&x.responseText){try{cb(null,JSON.parse(x.responseText));return}catch(e){}}cb(true,null)}
x.onerror=function(){cb(true,null)};x.send()}

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
  var time=d.lastUpdated?new Date(d.lastUpdated).toLocaleString('zh-CN'):'未知'
  return{strE:strE,carE:carE,wtE:wtE,plans:plans,gameC:gameC,prsC:prsC,recC:recC,logC:logC,ctC:ctC,time:time}
}

/* Data assembler */
function getAllData(){
  var s=store.get('strength')||{entries:[]};
  var p=store.get('plans')||{plans:[]};
  var m=store.get('missed')||{notes:{}};
  var c=store.get('cardio')||{entries:[]};
  var w=store.get('weight')||{records:[]};
  return{
    version:3,lastUpdated:Date.now(),
    entries:s.entries,plans:p.plans,missed:m.notes,
    cardio:c.entries,weight:w.records,profile:getProf(),game:getGame(),
    prs:store.get('prs'),records:store.get('records'),
    attrLog:store.get('attrLog'),cardioTypes:store.get('cardioTypes')
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
    var isFirst=_lastSyncTime===0
    var hasLocal=localData.entries&&localData.entries.length>0
    var localNewer=isFirst?false:(_lastSyncTime>0&&(!remoteData.lastUpdated||remoteData.lastUpdated<=_lastSyncTime))
    var remoteNewer=isFirst?false:(remoteData.lastUpdated&&remoteData.lastUpdated>_lastSyncTime)
    var localAge=isFirst?' (未同步)':localNewer?' (较新)':remoteNewer?' (较旧)':''
    var remoteAge=isFirst?' (未同步)':remoteNewer?' (较新)':localNewer?' (较旧)':''

    var modal=document.createElement('div');modal.className='modal-overlay open'
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
      +'<div>📜 日志: '+localSummary.logC+' 条</div><div></div>'
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
      +'<div>📜 日志: '+remoteSummary.logC+' 条</div><div></div>'
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
    modal.innerHTML=h;document.body.appendChild(modal)

    document.getElementById('syncCancel').addEventListener('click',function(){modal.remove();setSync('synced')})
    document.getElementById('syncPull').addEventListener('click',function(){
      modal.remove()
      if(confirm('将用云端数据覆盖本地数据（会自动备份本地数据），确定？')){
        autoBackup()
        if(mergeServerData(remoteData)){
          saveSyncTime()
          toast('已从云端拉取','s')
          renderStr();renderCar();renderProf();renderGame()
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
  return map
}

/* ========== EXPORT / IMPORT ========== */
function exportData(){
  autoBackup()
  toast('数据已导出 ✅','s')
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
        renderStr();renderCar();renderProf();renderGame()
      }catch(e){toast('文件格式错误: '+e.message,'e')}
    };reader.readAsText(file)
  };input.click()
}

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
  var time=d.lastUpdated?new Date(d.lastUpdated).toLocaleString('zh-CN'):'未知'
  return{strE:strE,carE:carE,wtE:wtE,plans:plans,gameC:gameC,time:time}
}

/* Data assembler */
function getAllData(){
  var s=store.get('strength')||{entries:[]};
  var p=store.get('plans')||{plans:[]};
  var m=store.get('missed')||{notes:{}};
  var c=store.get('cardio')||{entries:[]};
  var w=store.get('weight')||{records:[]};
  return{
    version:2,lastUpdated:Date.now(),
    entries:s.entries,plans:p.plans,missed:m.notes,
    cardio:c.entries,weight:w.records,profile:getProf(),game:getGame()
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
  store.mergeAll(merge)
  return true
}

/* ========== MANUAL SYNC DIALOG ========== */
function autoBackup(){
  try{
    var data=JSON.stringify(getAllData(),null,2)
    var blob=new Blob([data],{type:'application/json'})
    var url=URL.createObjectURL(blob)
    var a=document.createElement('a');a.href=url;a.download='myhealth-auto-'+today()+'.json'
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
    var localNewer=_lastSyncTime>0&&(!remoteData.lastUpdated||remoteData.lastUpdated<=_lastSyncTime)
    var remoteNewer=remoteData.lastUpdated&&remoteData.lastUpdated>_lastSyncTime
    var localAge=localNewer?' (较新)':remoteNewer?' (较旧)':''
    var remoteAge=remoteNewer?' (较新)':localNewer?' (较旧)':''

    var modal=document.createElement('div');modal.className='modal-overlay open'
    var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">🔄 同步数据</div>'
    
    // Local card
    h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:10px">'
      +'<div style="font-weight:700;margin-bottom:6px;color:var(--orange)">📱 本地数据'+localAge+'</div>'
      +'<div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">'+localSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:.72rem;color:var(--text2)">'
      +'<div>🏋️ 力量: '+localSummary.strE+' 组</div><div>🏃 有氧: '+localSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+localSummary.wtE+' 条</div><div>📋 计划: '+localSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+localSummary.gameC+' 关</div><div></div>'
      +'</div></div>'

    // Remote card
    h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:10px">'
      +'<div style="font-weight:700;margin-bottom:6px;color:var(--blue)">☁️ 云端数据'+remoteAge+'</div>'
      +'<div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">'+remoteSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:.72rem;color:var(--text2)">'
      +'<div>🏋️ 力量: '+remoteSummary.strE+' 组</div><div>🏃 有氧: '+remoteSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+remoteSummary.wtE+' 条</div><div>📋 计划: '+remoteSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+remoteSummary.gameC+' 关</div><div></div>'
      +'</div></div>'

    // Warning / suggestion
    if(localNewer&&remoteData.entries&&localSummary.strE>remoteSummary.strE){
      h+='<div style="background:rgba(234,179,8,.1);border:1px solid var(--yellow);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:.68rem;color:var(--yellow)">⚠️ 本地数据较新，拉取会丢失部分记录</div>'
    }
    if(remoteNewer&&remoteData.entries&&remoteSummary.strE>localSummary.strE){
      h+='<div style="background:rgba(34,197,94,.08);border:1px solid var(--green);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:.68rem;color:var(--green)">💡 云端数据较新，拉取可同步手机端记录</div>'
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
        function hasItems(v){return Array.isArray(v)&&v.length>0}
        var importMap={}
        if(hasItems(data.entries)){importMap.strength={entries:data.entries}}
        if(hasItems(data.plans)){importMap.plans={plans:Array.isArray(data.plans)?data.plans:data.plans.plans||[]}}
        if(hasItems(data.cardio)){importMap.cardio={entries:Array.isArray(data.cardio)?data.cardio:data.cardio.entries||[]}}
        if(hasItems(data.weight)){importMap.weight={records:Array.isArray(data.weight)?data.weight:data.weight.records||[]}}
        if(data.profile&&typeof data.profile==='object'){importMap.profile=data.profile}
        if(data.game&&typeof data.game==='object'){importMap.game=data.game}
        if(data.missed&&typeof data.missed==='object'){importMap.missed={notes:data.missed}}
        store.mergeAll(importMap)
        toast('数据导入成功 ✅','s')
        renderStr();renderCar();renderProf();renderGame()
      }catch(e){toast('文件格式错误: '+e.message,'e')}
    };reader.readAsText(file)
  };input.click()
}

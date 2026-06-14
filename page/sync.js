/* ============================================
   MyHealth — Cloud Sync & Export/Import
   ============================================ */

/* ========== SYNC ENGINE ========== */
let _syncT=null;

/* UI indicator — DOM concern, not network */
function setSync(s){var e=document.getElementById('syncIndicator');if(!e)return
e.className='sync-dot';if(s==='synced'){e.classList.add('synced');e.textContent='✓'}
else if(s==='syncing'){e.classList.add('syncing');e.textContent='↻'}
else if(s==='error'){e.classList.add('error');e.textContent='⚠'}
else e.textContent='🔄'}

/* Network layer — pure I/O, no DOM */
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

/* Orchestrators — wire network + DOM + store */
function pushSync(cb){setSync('syncing')
apiPut(getAllData(),function(ok){setSync(ok?'synced':'error');if(cb)cb(ok)})}

function pullSync(){setSync('syncing')
apiGet(function(err,d){
  if(err||!d){setSync('error');return}
  if(!mergeServerData(d)){setSync('error');return}
  var activeTab=document.querySelector('.tab-btn.active')?.dataset.tab
  if(activeTab==='profile')renderProf()
  else if(activeTab==='cardio')renderCar()
  else if(activeTab==='game')renderGame()
  else renderStr()
  setSync('synced')
})}

function scheduleSync(){if(_syncT)clearTimeout(_syncT);_syncT=setTimeout(pushSync,800)}
store.onChange(function(key){
  scheduleSync();
  if(key==='strength'||key==='cardio'||key==='game')updateGameBar()
})
setInterval(function(){if(!document.getElementById('workoutOverlay')?.classList.contains('open'))pullSync()},120000)

/* ========== EXPORT / IMPORT ========== */
function exportData(){
  var data=JSON.stringify(getAllData(),null,2)
  var blob=new Blob([data],{type:'application/json'})
  var url=URL.createObjectURL(blob)
  var a=document.createElement('a');a.href=url;a.download='myhealth-backup-'+today()+'.json'
  a.click();URL.revokeObjectURL(url)
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

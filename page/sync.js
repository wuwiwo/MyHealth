/* ============================================
   MyHealth — Cloud Sync (Manual) & Export/Import
   ============================================ */

/* ========== SYNC ENGINE ========== */
var _lastSyncTime=parseInt(localStorage.getItem('dh-sync-time')||'0',10)
/* v2.1.26 [7a] 同步日志：环形缓冲，供 Debug 面板「☁️ 同步」分区展示。
   只记录最近 30 条，不落盘（避免又多一个 store 键）。 */
var _syncLog=[];
function pushSyncLog(dir,ok,msg,extra){try{
  _syncLog.push({t:Date.now(),dir:dir,ok:!!ok,msg:msg||'',extra:extra||null});
  if(_syncLog.length>30)_syncLog.shift();
}catch(e){console.warn('[sync] 写同步日志失败',e)}}
function getSyncLog(){return _syncLog.slice()}



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
  if(x.status===200){pushSyncLog('push',true,'推送成功');cb(true)}
  else if(attempt<MAX_RETRY){setTimeout(function(){apiPut(data,cb,attempt+1)},400*Math.pow(2,attempt))}
  else{pushSyncLog('push',false,'推送失败 HTTP '+x.status);cb(false)}
}
x.onerror=function(){
  if(attempt<MAX_RETRY){setTimeout(function(){apiPut(data,cb,attempt+1)},400*Math.pow(2,attempt))}
  else{pushSyncLog('push',false,'推送失败（网络错误）');cb(false)}
}
x.send(JSON.stringify(data))}

function apiGet(cb,attempt){attempt=attempt||0
var x=new XMLHttpRequest()
x.open('GET','/api/data',true)
x.onload=function(){
  if(x.status===200&&x.responseText){try{pushSyncLog('pull',true,'拉取成功');cb(null,JSON.parse(x.responseText));return}catch(e){console.warn('[sync] 云端数据解析失败，按错误处理',e)}}
  if(attempt<MAX_RETRY){setTimeout(function(){apiGet(cb,attempt+1)},400*Math.pow(2,attempt))}
  else{pushSyncLog('pull',false,'拉取失败 HTTP '+x.status);cb(true,null)}
}
x.onerror=function(){
  if(attempt<MAX_RETRY){setTimeout(function(){apiGet(cb,attempt+1)},400*Math.pow(2,attempt))}
  else{pushSyncLog('pull',false,'拉取失败（网络错误）');cb(true,null)}
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
  /* v2.1.20：同步弹窗里也要能看见新系统 —— 否则「同步包含宠物/进度吗」只能靠猜。
     兼容旧云端快照：没有 keys 字段时这些计数就是 0（弹窗显示「—」） */
  var kd=(d.keys&&typeof d.keys==='object')?d.keys:{}
  var petC=(kd.pets&&Array.isArray(kd.pets.pets))?kd.pets.pets.length:0
  var mm=(kd.pets&&kd.pets.materials)||{}
  var orbC=(kd.pets&&Array.isArray(kd.pets.orbs))?kd.pets.orbs.length:0
  var grpC=(kd.groupProgress&&Array.isArray(kd.groupProgress.cleared))?kd.groupProgress.cleared.length:0
  var skP=(kd.skills&&typeof kd.skills.points==='number')?kd.skills.points:0
  var time=d.lastUpdated?new Date(d.lastUpdated).toLocaleString('zh-CN'):'未知'
  return{strE:strE,carE:carE,wtE:wtE,plans:plans,gameC:gameC,prsC:prsC,recC:recC,logC:logC,ctC:ctC,exC:exC,time:time,
    petC:petC,orbC:orbC,grpC:grpC,skP:skP,
    nutrition:mm.nutrition||0,feed:mm.feed||0,refineNormal:mm.refineNormal||0,
    hasExtra:!!d.keys}
}

/* ========== 同步范围：全部从 store 派生，不维护键清单 ==========
   v2.15（「完全同步」）：改前有两处会**静默漏键**的设计：
     ① `getAllData()` 的 14 个扁平字段是手写的，而 `SYNC_FLAT_KEYS` 是**另一份**手写排除清单 ——
        两份一旦不同步（在排除清单里加了键、却没写对应的扁平投影），这个键既不在扁平字段里、
        又被排除在 `keys` 段之外 → 推送时留在本地、拉取时无处可写，就是「换设备全丢」；
     ② 「哪些键已由扁平字段承载」是**声明**的，不是**实测**的。
   现在：
     · `SYNC_FLAT_PROJECTION` 是扁平段（载荷顶层历史字段）的**唯一**声明点；
     · `buildFlatSection()` 边写扁平字段边登记「本次真的写了哪些键」（carried），
       `keys` 段的排除**只**依据这份运行期记录 —— 不存在第二份清单可以对不上；
     · 投影表里没有的键（包括以后新增的任何 store 键）**自动**进 `keys` 段；
     · 取键两路合并：`store.getAll()`（当前有值的键）+ `store.schemaNames()`（注册表），
       注册过但当前没进缓存的键也会补读一次。
   → 新增 store 键**不需要改本文件**；`scripts/test-sync-coverage.js` 从注册表派生地守着。 */
function syncHasItems(v) { return Array.isArray(v) ? v.length > 0 : false }
function syncHasKeys(v) { return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 }
/* ⚠️ 松判定：沿用既有实现（`typeof v === 'object'`），故意**不**收紧为「非数组」——
   收紧会改变对奇怪载荷的接受范围（＝改用户数据的胜负规则），不在本轮范围。 */
function syncLooseObj(v) { return !!v && typeof v === 'object' }

/* 扁平投影表：store 短键 → 载荷顶层字段名（v5 载荷的历史格式，仅为兼容旧客户端 / 旧快照）
   field  载荷顶层字段名
   pack   store 值 → 扁平字段值（缺省＝原样）
   unpack 载荷 → store 值（null ＝「载荷没给这个键」，本地保持不动）
   accept 额外的业务守卫（缺省＝都接受） */
var SYNC_FLAT_PROJECTION = {
  strength:   { field: 'entries',
                pack: function (v) { return (v || { entries: [] }).entries },
                unpack: function (d) { return syncHasItems(d.entries) ? { entries: d.entries } : null } },
  plans:      { field: 'plans',
                pack: function (v) { return (v || { plans: [] }).plans },
                unpack: function (d) {
                  if (syncHasItems(d.plans)) return { plans: d.plans }
                  if (d.plans && syncHasItems(d.plans.plans)) return { plans: d.plans.plans }
                  return null } },
  missed:     { field: 'missed',
                pack: function (v) { return (v || { notes: {} }).notes },
                unpack: function (d) {
                  if (syncHasKeys(d.missed)) return { notes: d.missed }
                  if (d.missed && syncHasKeys(d.missed.notes)) return { notes: d.missed.notes }
                  return null } },
  cardio:     { field: 'cardio',
                pack: function (v) { return (v || { entries: [] }).entries },
                unpack: function (d) {
                  if (syncHasItems(d.cardio)) return { entries: d.cardio }
                  if (d.cardio && syncHasItems(d.cardio.entries)) return { entries: d.cardio.entries }
                  return null } },
  weight:     { field: 'weight',
                pack: function (v) { return (v || { records: [] }).records },
                unpack: function (d) {
                  if (syncHasItems(d.weight)) return { records: d.weight }
                  if (d.weight && syncHasItems(d.weight.records)) return { records: d.weight.records }
                  return null } },
  /* profile / game 的 pack 走 getProf() / getGame()：这两个读取函数**自带默认值**，
     直接用 store.get() 会在空库里推空对象上去（改前就是带默认值，保持一致）。 */
  profile:    { field: 'profile', pack: function () { return getProf() },
                unpack: function (d) { return syncHasKeys(d.profile) ? d.profile : null } },
  game:       { field: 'game', pack: function () { return getGame() },
                unpack: function (d) { return syncLooseObj(d.game) ? d.game : null } },
  prs:        { field: 'prs', unpack: function (d) { return syncLooseObj(d.prs) ? d.prs : null } },
  records:    { field: 'records', unpack: function (d) { return syncLooseObj(d.records) ? d.records : null } },
  attrLog:    { field: 'attrLog', unpack: function (d) { return Array.isArray(d.attrLog) ? d.attrLog : null } },
  cardioTypes:{ field: 'cardioTypes', unpack: function (d) { return Array.isArray(d.cardioTypes) ? d.cardioTypes : null } },
  exercises:  { field: 'exercises', unpack: function (d) { return Array.isArray(d.exercises) ? d.exercises : null } },
  refine:     { field: 'refine', unpack: function (d) { return syncLooseObj(d.refine) ? d.refine : null } },
  challenge:  { field: 'challenge',
                unpack: function (d) { return syncLooseObj(d.challenge) ? d.challenge : null },
                accept: function (v) { return syncChallengeMayReplace(v) } }
};
/* 由投影表派生，只用于诊断 / 测试（**不是**排除清单 —— 排除看运行期的 carried） */
var SYNC_FLAT_KEYS = Object.keys(SYNC_FLAT_PROJECTION);

/* challenge 合并保护（**既有语义，勿改**）：seasonBonus 按月重置，
   仅当本地无存档、或云端月份不旧于本地时才接受云端整键；否则保留本地。
   比较的是 `lastSeasonMonth`（'YYYY-MM' 字符串，直接字典序比较）。 */
function syncChallengeMayReplace(remote) {
  var localCh = store.get('challenge')
  var remoteMonth = ((remote && remote.lastSeasonMonth) || '') + ''
  var localMonth = (localCh && localCh.lastSeasonMonth) || ''
  return !localCh || remoteMonth >= localMonth
}

/* v2.1.20：除扁平字段之外的**其余全部 store 键**。
   改前 getAllData 是硬编码的 14 个键，v2.x 新增的系统（宠物/材料/宝珠/敌群进度/技能/主题/
   有氧计划）一个都没进来 —— 推送时它们留在本地，拉取时又无处可写，等于「换设备就全丢」。
   实测：19 个在用的键里丢 5 个（groupProgress / pets / skills / cardioPlans / theme）。
   v2.15：`carried` 由 getAllData **运行期实测**传入（＝扁平段真的写了哪些键），
   不再有任何手写排除清单；注册表里的键即使没进缓存也会补读一次。 */
function collectOtherKeys(carried) {
  carried = carried || {};
  var out = {};
  function put(k, v) {
    if (carried[k]) return;                       // 已由扁平字段承载（运行期实测）
    if (k === 'mod-time') return;                 // 本地时间戳，不同步（防御性：它本不是 store 键）
    if (v == null) return;
    out[k] = v;
  }
  try {
    var all = (typeof store !== 'undefined' && store.getAll) ? store.getAll() : {};
    Object.keys(all).forEach(function (k) { put(k, all[k]); });
    /* 注册表兜底：注册过但当前不在内存缓存里的键，逐个读一次（get 会走既有迁移链） */
    var reg = (typeof store !== 'undefined' && store.schemaNames) ? store.schemaNames() : [];
    reg.forEach(function (k) {
      if (carried[k] || all.hasOwnProperty(k)) return;
      put(k, store.get(k));
    });
  } catch (e) { console.warn('[sync] 收集扩展键失败', e); }
  return out;
}

/* 扁平段：按投影表生成，并登记**本次实际写入**的键（keys 段排除的唯一依据） */
function buildFlatSection() {
  var flat = {}, carried = {};
  Object.keys(SYNC_FLAT_PROJECTION).forEach(function (name) {
    var p = SYNC_FLAT_PROJECTION[name];
    flat[p.field] = p.pack ? p.pack(store.get(name)) : store.get(name);
    carried[name] = true;
  });
  return { flat: flat, carried: carried };
}

/* Data assembler */
function getAllData(){
  var sec=buildFlatSection();
  var data={version:5,lastUpdated:store.getLastModTime()||Date.now()};
  Object.keys(sec.flat).forEach(function(f){data[f]=sec.flat[f]});
  data.keys=collectOtherKeys(sec.carried);
  return data;
}

/* 把「keys 段」并入目标映射 —— 拉取与文件导入共用，语义只在这里定义一次：
   · **云端整键覆盖本地**（不做字段级深合并）
   · null / undefined 跳过 → 不会把本地已有的值「删掉」
   · `mod-time` 是本地时间戳，永不同步
   · 形状校验交给 store.mergeAll 的 validValue（未注册键一律接受，注册键走各自 validate） */
function mergeKeySection(target, keysObj) {
  if (!keysObj || typeof keysObj !== 'object' || Array.isArray(keysObj)) return target;
  Object.keys(keysObj).forEach(function (k) {
    if (k === 'mod-time') return
    var v = keysObj[k]
    if (v == null) return
    target[k] = v
  })
  return target
}

/* Merge server response into local store */
function mergeServerData(d){
  if(!d||!(d.version>=2||syncHasItems(d.entries)||syncHasItems(d.cardio)||syncHasItems(d.weight)))return false
  var merge={}
  /* ① 扁平段：v2~v4 老载荷（**没有 keys 段**）的唯一载体；v5 新载荷也照旧带着它。
        逐键由投影表派生 —— 以后加扁平字段只改表，不会出现「清单里有、代码里没有」。 */
  Object.keys(SYNC_FLAT_PROJECTION).forEach(function(name){
    var p=SYNC_FLAT_PROJECTION[name]
    var v=p.unpack(d)
    if(v==null)return
    if(p.accept&&!p.accept(v))return      // challenge 的按月保护（既有语义）
    merge[name]=v
  })
  /* ② keys 段（v5+）：**整键覆盖**同名扁平值（云端为准）。旧载荷没有这一段 → 自然跳过，
        不会把本地的新系统数据（宠物 / 技能 / 敌群进度…）写成空值。 */
  mergeKeySection(merge,d.keys)
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
  }catch(e){console.warn('[sync] 自动备份导出失败',e);return false}
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
      +'<div style="font-size:var(--fs-2xs);color:var(--text3);margin-bottom:6px">'+localSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:var(--fs-xs);color:var(--text2)">'
      +'<div>🏋️ 力量: '+localSummary.strE+' 组</div><div>🏃 有氧: '+localSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+localSummary.wtE+' 条</div><div>📋 计划: '+localSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+localSummary.gameC+' 关</div>'
      +'<div>🏆 PR: '+localSummary.prsC+' 项</div>'
      +'<div>📜 日志: '+localSummary.logC+' 条</div><div>🏋️ 动作: '+localSummary.exC+' 个</div>'
      +'</div>'
      // v2.1.20：新系统摘要（本地）
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:var(--fs-xs);color:var(--text2);margin-top:8px;padding-top:8px;border-top:1px dashed var(--bd)">'
      +'<div>🐾 宠物: '+(localSummary.hasExtra?localSummary.petC+' 只':'—')+'</div>'
      +'<div>🔮 宝珠: '+(localSummary.hasExtra?localSummary.orbC+' 颗':'—')+'</div>'
      +'<div>🗺️ 敌群: '+(localSummary.hasExtra?localSummary.grpC+' 关':'—')+'</div>'
      +'<div>💠 技能点: '+(localSummary.hasExtra?localSummary.skP:'—')+'</div>'
      +'<div>🧪 营养液: '+(localSummary.hasExtra?localSummary.nutrition:'—')+'</div>'
      +'<div>🍖 饲料: '+(localSummary.hasExtra?localSummary.feed:'—')+'</div>'
      +'</div></div>'

    // Remote card
    h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:10px">'
      +'<div style="font-weight:700;margin-bottom:6px;color:var(--blue)">☁️ 云端数据'+remoteAge+'</div>'
      +'<div style="font-size:var(--fs-2xs);color:var(--text3);margin-bottom:6px">'+remoteSummary.time+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:var(--fs-xs);color:var(--text2)">'
      +'<div>🏋️ 力量: '+remoteSummary.strE+' 组</div><div>🏃 有氧: '+remoteSummary.carE+' 次</div>'
      +'<div>⚖️ 体重: '+remoteSummary.wtE+' 条</div><div>📋 计划: '+remoteSummary.plans+' 个</div>'
      +'<div>🎮 通关: '+remoteSummary.gameC+' 关</div>'
      +'<div>🏆 PR: '+remoteSummary.prsC+' 项</div>'
      +'<div>📜 日志: '+remoteSummary.logC+' 条</div><div>🏋️ 动作: '+remoteSummary.exC+' 个</div>'
      +'</div>'
      // v2.1.20：新系统摘要（云端）。旧快照没有 keys → 显示「—」，提示需要重新推送
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:var(--fs-xs);color:var(--text2);margin-top:8px;padding-top:8px;border-top:1px dashed var(--bd)">'
      +'<div>🐾 宠物: '+(remoteSummary.hasExtra?remoteSummary.petC+' 只':'—')+'</div>'
      +'<div>🔮 宝珠: '+(remoteSummary.hasExtra?remoteSummary.orbC+' 颗':'—')+'</div>'
      +'<div>🗺️ 敌群: '+(remoteSummary.hasExtra?remoteSummary.grpC+' 关':'—')+'</div>'
      +'<div>💠 技能点: '+(remoteSummary.hasExtra?remoteSummary.skP:'—')+'</div>'
      +'<div>🧪 营养液: '+(remoteSummary.hasExtra?remoteSummary.nutrition:'—')+'</div>'
      +'<div>🍖 饲料: '+(remoteSummary.hasExtra?remoteSummary.feed:'—')+'</div>'
      +'</div>'
      +(!remoteSummary.hasExtra?'<div style="margin-top:6px;font-size:var(--fs-2xs);color:var(--yellow)">⚠️ 云端是旧版快照（不含宠物/敌群进度等），推送本地一次即可补齐</div>':'')
      +'</div>'

    // Suggestion
    var suggestion=''
    if(isFirst){
      suggestion='<div style="background:rgba(100,116,139,.08);border:2px solid var(--bd-l);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:var(--fs-xs);line-height:1.6">'
        +'<div style="font-weight:700;color:var(--text);margin-bottom:4px">🆕 首次同步</div>'
        +'<div style="color:var(--text2)">请选择：推送本地数据到云端，或从云端拉取数据覆盖本地。</div></div>'
    }else if(localNewer&&remoteData.entries){
      suggestion='<div style="background:rgba(249,115,22,.12);border:2px solid var(--orange);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:var(--fs-xs);line-height:1.6">'
        +'<div style="font-weight:700;color:var(--orange);margin-bottom:4px">💡 建议：推送本地数据到云端</div>'
        +'<div style="color:var(--text2)">本地数据更新 ('+localSummary.time+')，包含 '+localSummary.strE+' 组力量.'+localSummary.prsC+'项PR。云端数据较旧。</div></div>'
    }else if(remoteNewer&&remoteData.entries){
      suggestion='<div style="background:rgba(34,197,94,.08);border:2px solid var(--green);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:var(--fs-xs);line-height:1.6">'
        +'<div style="font-weight:700;color:var(--green);margin-bottom:4px">💡 建议：从云端拉取数据</div>'
        +'<div style="color:var(--text2)">云端数据更新 ('+remoteSummary.time+')，包含 '+remoteSummary.strE+' 组力量。本地数据较旧。</div></div>'
    }else if(hasLocal&&remoteData.entries&&localSummary.strE===remoteSummary.strE){
      suggestion='<div style="background:rgba(100,116,139,.08);border:1px solid var(--text3);border-radius:var(--rs);padding:10px 14px;margin-bottom:10px;font-size:var(--fs-xs);color:var(--text2);text-align:center">✅ 本地与云端数据一致，无需同步</div>'
    }else{
      suggestion='<div style="background:rgba(100,116,139,.08);border:1px solid var(--text3);border-radius:var(--rs);padding:10px 14px;margin-bottom:10px;font-size:var(--fs-xs);color:var(--text2);text-align:center">⚠️ 无法判断新旧关系，请手动选择</div>'
    }
    h+=suggestion

    // Warning
    if(localNewer&&remoteData.entries&&localSummary.strE>remoteSummary.strE){
      h+='<div style="background:rgba(234,179,8,.1);border:1px solid var(--yellow);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:var(--fs-2xs);color:var(--yellow)">⚠️ 拉取云端会丢失 '+Math.max(0,localSummary.strE-remoteSummary.strE)+' 组力量记录</div>'
    }
    if(remoteNewer&&remoteData.entries&&remoteSummary.strE>localSummary.strE){
      h+='<div style="background:rgba(234,179,8,.1);border:1px solid var(--yellow);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px;font-size:var(--fs-2xs);color:var(--yellow)">⚠️ 推送本地会丢失云端 '+Math.max(0,remoteSummary.strE-localSummary.strE)+' 组力量记录</div>'
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
  /* v2.1.20：全量导出（autoBackup / 导出全量）里也带着扩展键，
     导入时必须一并还原 —— 否则「导出备份再导入」同样会丢宠物/材料/敌群进度。
     v2.15：与拉取共用 `mergeKeySection()`，语义只定义一次（跳过 null / mod-time，整键覆盖）。
     ⚠️ 上面的扁平分支**故意保持原样**（对第三方备份文件更宽松：`data.plans.plans` 形态、
        `data.cardio.entries` 形态都认）；新增 store 键不需要在这里加分支 —— 它们从 `keys` 段进来。 */
  mergeKeySection(map, data.keys)
  return map
}

/* ========== EXPORT / IMPORT ========== */
function exportData(){
  var modal=openModal()
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📤 导出数据</div>'
    +'<div style="font-size:var(--fs-sm);color:var(--text2);margin-bottom:14px;line-height:1.6">选择导出范围：</div>'
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
  try{document.execCommand('copy')}catch(e){console.warn('[sync] execCommand 复制失败',e)}
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

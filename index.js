/* ============================================
   MyHealth — Complete Application Logic
   ============================================ */

/* ========== DATA LAYER ========== */
const SK = {
  STR: 'dh-strength-v1', STR_PLANS: 'dh-plans-v1', MISS: 'dh-missed-v1',
  CAR: 'dh-cardio-v1', WT: 'dh-weight-v1', PROF: 'dh-profile-v1',
  GAME: 'dh-game-v1', THEME: 'dh-theme-v1'
};
const COMMON_W = [1,2,3,4,5,6,7,8,10,12,15,20,25];
const EXERCISES = ['二头弯举','肩推','深蹲','卧推','划船','硬拉','侧平举','前平举','锤式弯举','俯身飞鸟','颈后臂屈伸','俯身臂屈伸','直立划船','推举','阿诺德推举','哑铃飞鸟','哑铃耸肩','弓步蹲','保加利亚深蹲','站姿提踵'];
const CARDIO_TYPES = [
  {id:'run',name:'跑步',emoji:'🏃',hasDist:true},{id:'jump',name:'跳绳',emoji:'🪢',hasDist:false},
  {id:'cycle',name:'骑行',emoji:'🚴',hasDist:true},{id:'swim',name:'游泳',emoji:'🏊',hasDist:true},
  {id:'walk',name:'快走',emoji:'🚶',hasDist:true},{id:'hiit',name:'HIIT',emoji:'🔥',hasDist:false}
];
const LEVELS = {
  chap1:{name:'初出茅庐',levels:[
    {id:'1-1',npc:'见习战士',atk:20,def:10,hp:120},
    {id:'1-2',npc:'斥候兵',atk:30,def:20,hp:180},
    {id:'1-3',npc:'轻装剑士',atk:40,def:20,hp:240}
  ]},
  chap2:{name:'小试牛刀',levels:[
    {id:'2-1',npc:'重装步兵',atk:30,def:40,hp:300},
    {id:'2-2',npc:'弓弩手',atk:60,def:10,hp:220},
    {id:'2-3',npc:'骑兵',atk:70,def:30,hp:280}
  ]},
  chap3:{name:'锋芒初露',levels:[
    {id:'3-1',npc:'精英卫兵',atk:50,def:50,hp:400},
    {id:'3-2',npc:'暗影刺客',atk:90,def:20,hp:300},
    {id:'3-3',npc:'铁甲统领',atk:60,def:60,hp:500}
  ]},
  chap4:{name:'身经百战',levels:[
    {id:'4-1',npc:'狂战士',atk:80,def:30,hp:600},
    {id:'4-2',npc:'盾卫者',atk:40,def:80,hp:700},
    {id:'4-3',npc:'猎手',atk:100,def:20,hp:450},
    {id:'4-4',npc:'重骑兵',atk:90,def:50,hp:550},
    {id:'4-5',npc:'咒术师',atk:110,def:30,hp:500},
    {id:'4-6',npc:'BOSS 暗龙',atk:70,def:60,hp:900,boss:true}
  ]},
  chap5:{name:'浴血奋战',levels:[
    {id:'5-1',npc:'死士',atk:100,def:40,hp:650},
    {id:'5-2',npc:'铁卫',atk:60,def:90,hp:800},
    {id:'5-3',npc:'刺客大师',atk:130,def:30,hp:500},
    {id:'5-4',npc:'战争使徒',atk:110,def:60,hp:700},
    {id:'5-5',npc:'毁灭者',atk:140,def:40,hp:600},
    {id:'5-6',npc:'大魔导师',atk:120,def:70,hp:750}
  ]},
  chap6:{name:'终极试炼',levels:[
    {id:'6-1',npc:'深渊守卫',atk:120,def:60,hp:850},
    {id:'6-2',npc:'暗影领主',atk:150,def:40,hp:700},
    {id:'6-3',npc:'钢铁巨像',atk:80,def:100,hp:1000},
    {id:'6-4',npc:'混沌骑士',atk:140,def:70,hp:800},
    {id:'6-5',npc:'灭世者',atk:170,def:50,hp:750},
    {id:'6-6',npc:'BOSS 远古龙王',atk:100,def:80,hp:1200,boss:true}
  ]}
};

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function toDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseDate(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function fmtDate(s){const d=parseDate(s);const w=['周日','周一','周二','周三','周四','周五','周六'];const i=s===today();return{main:(d.getMonth()+1)+'月'+d.getDate()+'日',sub:i?w[d.getDay()]+' · 今天':w[d.getDay()]}}
function load(k){try{const r=localStorage.getItem(k);if(r){const d=JSON.parse(r);return d}}catch(e){}return null}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}

/* Strength */
let _str=load(SK.STR)||{entries:[]};let _plans=load(SK.STR_PLANS)||{plans:[]};let _missed=load(SK.MISS)||{notes:{}};
function saveStr(){save(SK.STR,_str);scheduleSync();updateGameBar()}
function savePlans(){save(SK.STR_PLANS,_plans);scheduleSync()}
function saveMissed(){save(SK.MISS,_missed);scheduleSync()}
function getStr(d){return(_str.entries||[]).filter(e=>e.date===d).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))}
function addStr(e){e.id=uid();e.createdAt=Date.now();_str.entries.push(e);saveStr()}
function updateStr(id,data){const i=_str.entries.findIndex(e=>e.id===id);if(i>-1){_str.entries[i]={..._str.entries[i],...data};saveStr()}}
function delStr(id){_str.entries=_str.entries.filter(e=>e.id!==id);saveStr()}

/* Cardio */
let _car=load(SK.CAR)||{entries:[]};
function saveCar(){save(SK.CAR,_car);scheduleSync();updateGameBar()}
function getCar(d){return(_car.entries||[]).filter(e=>e.date===d).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))}
function addCar(e){e.id=uid();e.createdAt=Date.now();_car.entries.push(e);saveCar()}
function delCar(id){_car.entries=_car.entries.filter(e=>e.id!==id);saveCar()}

/* Weight */
let _wt=load(SK.WT)||{records:[]};
function saveWt(){save(SK.WT,_wt);scheduleSync()}
function addWt(r){r.id=uid();r.createdAt=Date.now();_wt.records.push(r);saveWt()}
function getWt(){return(_wt.records||[]).sort((a,b)=>a.date<b.date?1:-1)}

/* Profile */
let _prof=load(SK.PROF)||{height:175,gender:'男',birthYear:1990};
function saveProf(){save(SK.PROF,_prof);scheduleSync()}

/* Game */
let _game=load(SK.GAME)||{cleared:[],current:''};
function saveGame(){save(SK.GAME,_game);scheduleSync()}

/* ========== SYNC ========== */
let _syncT=null;
function setSync(s,m){const e=document.getElementById('syncIndicator');if(!e)return
e.className='sync-dot';if(s==='synced'){e.classList.add('synced');e.textContent='✓'}
else if(s==='syncing'){e.classList.add('syncing');e.textContent='↻'}
else if(s==='error'){e.classList.add('error');e.textContent='⚠'}
else e.textContent='🔄'}
function getAllData(){return{
  version:2,lastUpdated:Date.now(),
  entries:_str.entries,plans:_plans.plans,missed:_missed.notes,
  cardio:_car.entries,weight:_wt.records,profile:_prof,game:_game
}}
function pushSync(cb){setSync('syncing')
var x=new XMLHttpRequest();x.open('PUT','/api/data',true)
x.setRequestHeader('Content-Type','application/json')
x.onload=function(){if(x.status===200){setSync('synced');if(cb)cb(true)}else{setSync('error');if(cb)cb(false)}}
x.onerror=function(){setSync('error');if(cb)cb(false)}
x.send(JSON.stringify(getAllData()))}
function pullSync(cb){setSync('syncing')
var x=new XMLHttpRequest();x.open('GET','/api/data',true)
x.onload=function(){if(x.status===200&&x.responseText){try{
  const d=JSON.parse(x.responseText)
  if(d&&(d.version>=2||(d.entries||d.cardio||d.weight))){
    // Support both v1 (old sync, entries at root) and v2+ (full data object)
    if(d.entries)_str.entries=d.entries
    if(d.plans||d.plans?.plans)_plans.plans=d.plans?.plans||d.plans
    if(d.missed||d.missed?.notes)_missed.notes=d.missed?.notes||d.missed
    if(d.cardio||d.cardio?.entries)_car.entries=d.cardio?.entries||d.cardio
    if(d.weight||d.weight?.records)_wt.records=d.weight?.records||d.weight
    if(d.profile)_prof=d.profile
    if(d.game)_game=d.game
    saveStr();savePlans();saveMissed();saveCar();saveWt();saveProf();saveGame()
    // Re-render active tab
    var activeTab=document.querySelector('.tab-btn.active')?.dataset.tab
    if(activeTab==='profile')renderProf()
    else if(activeTab==='cardio')renderCar()
    else if(activeTab==='game')renderGame()
    else renderStr()
    setSync('synced');if(cb)cb(true);return
  }}catch(e){}}
setSync('error');if(cb)cb(false)}
x.onerror=function(){setSync('');if(cb)cb(false)};x.send()}
function scheduleSync(){if(_syncT)clearTimeout(_syncT);_syncT=setTimeout(pushSync,800)}
setInterval(function(){if(!document.getElementById('workoutOverlay')?.classList.contains('open'))pullSync()},30000)

/* ========== TOAST ========== */
let _tt=null;function toast(m,t){const c=document.getElementById('toastC')
if(!c)return;const o=document.createElement('div');o.className='toast'+(t?' toast-'+t:'')
o.textContent=(t==='s'?'✅':t==='e'?'😅':'💪')+' '+m;c.appendChild(o)
clearTimeout(_tt);_tt=setTimeout(()=>c.innerHTML='',2200)}

/* ========== CELEBRATE ========== */
function celebrate(){const o=document.createElement('div');o.style='position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden'
const cs=['#F97316','#22C55E','#3B82F6','#A855F7','#EAB308','#EF4444']
for(let i=0;i<30;i++){const c=document.createElement('div')
c.style=`position:absolute;left:${Math.random()*100}%;top:-10px;width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;background:${cs[i%cs.length]};border-radius:${Math.random()>.5?'50%':'2px'};animation:cf${i} ${1.5+Math.random()*2}s linear forwards`
c.id='cf'+i
const s=document.createElement('style');s.textContent=`@keyframes cf${i}{0%{transform:translateY(0) rotate(0deg) scale(0);opacity:1}20%{transform:translateY(20vh) rotate(180deg) scale(1);opacity:1}100%{transform:translateY(100vh) rotate(720deg) scale(.5);opacity:0}}`
c.appendChild(s);o.appendChild(c)}
document.body.appendChild(o);setTimeout(()=>o.remove(),3500)}

/* ========== THEME ========== */
function getTheme(){return localStorage.getItem(SK.THEME)||'dark'}
function setTheme(t){const d=t==='dark';document.documentElement.setAttribute('data-theme',d?'':'light')
document.getElementById('themeToggle').textContent=d?'🌙':'☀️';localStorage.setItem(SK.THEME,t)}
function toggleTheme(){setTheme(getTheme()==='dark'?'light':'dark')}

/* ========== WEIGHT GRID BUILDER ========== */
function buildWtGrid(c,sel,onChg){c.innerHTML=''
COMMON_W.forEach(w=>{const b=document.createElement('button')
b.className='wt-btn'+(w===sel?' selected':'');b.textContent=w;b.dataset.w=w
b.addEventListener('click',()=>{c.querySelectorAll('.wt-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');if(onChg)onChg(w)})
c.appendChild(b)})}

/* ========== RENDER: STRENGTH ========== */
let _strDate=today(),_strSelW=COMMON_W[4],_strForm=false;

function renderStr(){
  const d=_strDate;const f=fmtDate(d)
  document.getElementById('strDateMain').textContent=f.main
  document.getElementById('strDateSub').textContent=f.sub
  const entries=getStr(d)
  // Plans
  renderStrPlans()
  // Entries list
  const el=document.getElementById('strList')
  if(!entries.length){
    el.innerHTML='<div class="empty"><span class="empty-e">💪</span><div class="empty-t">今天还没练</div><div class="empty-s">点击「新增一组」开始记录</div></div>'
  } else {
    el.innerHTML=entries.map(e=>{
      const r=e.targetReps>0?e.actualReps/e.targetReps:0;const p=Math.min(r,1)*100
      const d=r>=1,o=r>1;let sc='under',ac='under'
      if(o){sc='over';ac='over'}else if(r>=1){sc='done';ac='done'}
      const ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''
      return '<div class="ec '+(d?'done':'')+'" data-id="'+e.id+'"><div class="ec-hdr"><div class="ec-ex">'+e.exercise+'<span class="ec-wt">● '+e.weight+' kg</span></div><div class="ec-actions"><button class="ec-act" data-a="strEdit" data-id="'+e.id+'">✏️</button><button class="ec-act" data-a="strDel" data-id="'+e.id+'">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt"><span class="ec-tgt">目标 '+e.targetReps+' 次</span><span class="ec-actual '+ac+'">'+e.actualReps+' 次 '+(d?(o?'🔥':'✅'):'')+'</span></div><div class="ec-bar"><div class="ec-fill '+sc+'" style="width:'+p+'%"></div></div></div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')
  }
  // Heatmap
  renderHeatmap('strHeatmap','str',d)
  // Stats
  renderStrStats()
  // Missed days
  renderMissed()
}

function renderStrStats(){
  const g=document.getElementById('strStats')
  const we=getWeekStr();const t=we.length,r=we.reduce((s,e)=>s+e.actualReps,0),v=we.reduce((s,e)=>s+e.weight*e.actualReps,0)
  const dn=we.filter(e=>e.actualReps>=e.targetReps).length,rate=t>0?Math.round(dn/t*100):0
  const circ=2*Math.PI*31.5
  g.innerHTML='<div class="sc sc-rate"><div class="sc-ring"><svg viewBox="0 0 70 70"><circle class="sc-ring__bg" cx="35" cy="35" r="31.5"/><circle class="sc-ring__fill" cx="35" cy="35" r="31.5" stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ-circ*rate/100)+'"/></svg><span class="sc-ring__text">'+rate+'%</span></div><div class="sc-l">完成率</div></div><div class="sc sc-total"><div class="sc-v">'+r+'</div><div class="sc-l">总次数</div></div><div class="sc sc-vol"><div class="sc-v">'+v+'</div><div class="sc-l">总容量</div></div><div class="sc sc-fav"><div class="sc-v">最爱</div><div class="sc-l">动作</div></div>'
}
function getWeekStr(){const n=new Date();const d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(_str.entries||[]).filter(e=>e.date>=toDate(m))}

/* ========== MISSED DAYS ========== */
function renderMissed(){
  const c=document.getElementById('strMissedDays')
  const allDates=[];const d=new Date()
  for(let i=6;i>=0;i--){const t=new Date(d);t.setDate(t.getDate()-i);allDates.push(toDate(t))}
  const activeDays=new Set((_str.entries||[]).map(e=>e.date))
  const missed=allDates.filter(dd=>!activeDays.has(dd)&&dd<=today())
  if(!missed.length){c.innerHTML='<div style="font-size:.75rem;color:var(--text3);padding:8px 0">✅ 最近 7 天全勤！</div>';return}
  c.innerHTML=missed.map(dd=>{
    const note=_missed.notes[dd]||''
    return '<div class="md-item"><div class="md-hdr"><span class="md-date">📅 '+dd+'</span><button class="md-write" data-date="'+dd+'">'+(note?'✏️ 编辑':'✏️ 说明原因')+'</button><button class="md-write" data-date="'+dd+'" data-makeup="1" style="color:var(--green)">➕ 补签</button></div><div class="md-reason'+(note?' show':'')+'" id="mr_'+dd+'">'+(note||'')+'</div><div class="md-edit" id="me_'+dd+'" style="display:none"><textarea class="md-input" id="mi_'+dd+'" rows="2">'+(note||'')+'</textarea><button class="md-save" data-date="'+dd+'">保存</button></div></div>'
  }).join('')
  c.querySelectorAll('.md-write').forEach(b=>b.addEventListener('click',()=>{
    const dd=b.dataset.date
    // 补签 button
    if(b.dataset.makeup){_strDate=dd;openMakeupDialog(dd);return}
    // 说明原因 button
    const show=b.closest('.md-item').querySelector('.md-edit, #me_'+dd)
    if(show)show.style.display=show.style.display==='none'?'block':'none'
  }))
  c.querySelectorAll('.md-save').forEach(b=>b.addEventListener('click',()=>{
    const dd=b.dataset.date;const inp=document.getElementById('mi_'+dd);if(!inp)return
    const t=inp.value.trim();if(t){_missed.notes[dd]=t}else{delete _missed.notes[dd]}
    saveMissed();renderMissed();toast('已保存断签说明','s')
  }))
}

/* ========== MAKEUP DIALOG ========== */
function openMakeupDialog(dateStr){
  var plans=_plans.plans||[]
  if(!plans.length){toast('没有训练计划，请先创建','e');return}
  var modal=document.createElement('div');modal.className='modal-overlay open'
  var h='<div class="modal-sheet"><div class="modal-handle"></div>'
    +'<div class="modal-title">📋 选择计划补签 '+dateStr+'</div>'
    +'<div style="margin-bottom:12px">'
  plans.forEach(function(p,i){
    var tags=p.exercises.map(function(e){return e.exercise}).slice(0,5).join('、')
    h+='<div class="ec" style="cursor:pointer;margin-bottom:8px" data-pick="'+p.id+'"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><span style="font-size:.7rem;color:var(--text3)">'+p.exercises.length+' 组</span></div></div><div class="ec-prog"><div style="font-size:.7rem;color:var(--text2)">'+tags+'</div></div></div>'
  })
  h+='</div><div class="modal-actions"><button class="m-btn-cancel" id="muCancel">取消</button></div></div>'
  modal.innerHTML=h;document.body.appendChild(modal)
  // Plan pick
  modal.querySelectorAll('[data-pick]').forEach(function(el){
    el.addEventListener('click',function(){doMakeup(dateStr,el.dataset.pick);modal.remove()})
  })
  document.getElementById('muCancel').addEventListener('click',function(){modal.remove()})
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
}

function doMakeup(dateStr,planId){
  var plan=_plans.plans.find(function(p){return p.id===planId})
  if(!plan||!plan.exercises.length){toast('计划无效','e');return}
  plan.exercises.forEach(function(ex){
    addStr({date:dateStr,exercise:ex.exercise,weight:ex.weight||7,targetReps:ex.targetReps||12,actualReps:0})
  })
  renderStr()
  toast('已补签 '+plan.exercises.length+' 组训练到 '+dateStr+' ✅','s')
}

/* ========== PLANS ========== */
let _woPlan=null,_woIdx=0,_woReps=12,_woDone=[],_woTimer=null,_woRest=0;

function renderStrPlans(){
  const c=document.getElementById('strPlansList')
  const plans=_plans.plans||[]
  if(!plans.length){
    c.innerHTML='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有训练计划</div><div class="empty-s">点下方按钮创建</div></div>'
    return
  }
  c.innerHTML=plans.map(p=>{
    const tags=p.exercises.map(e=>e.exercise).slice(0,6)
    return '<div class="ec" style="cursor:pointer"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="startPlan" data-pid="'+p.id+'">⚡</button><button class="ec-act" data-a="delPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="display:flex;gap:4px;flex-wrap:wrap">'+tags.map(n=>'<span style="font-size:.7rem;background:var(--bg);color:var(--text2);padding:1px 8px;border-radius:var(--rp);border:1px solid var(--bd)">'+n+'</span>').join('')+'</div></div></div>'
  }).join('')
  // Add new plan button
  c.innerHTML+='<button class="add-btn" id="strNewPlan" style="margin-top:8px">＋ 新建计划</button>'
}

function startStrPlan(pid){
  const plan=_plans.plans.find(p=>p.id===pid);if(!plan||!plan.exercises.length)return
  _woPlan=plan;_woIdx=0;_woDone=[]
  showWoExercise()
}

function showWoExercise(){
  const ex=_woPlan.exercises[_woIdx]
  _woReps=ex.targetReps
  // Remove old overlay if exists
  var old=document.getElementById('woOverlay');if(old)old.remove()
  const overlay=document.createElement('div');overlay.id='woOverlay';overlay.className='battle-overlay open'
  overlay.innerHTML='<div class="battle-hdr"><div class="battle-level">'+_woPlan.name+'</div><div class="battle-level">'+( _woIdx+1)+'/'+_woPlan.exercises.length+'</div><button class="speed-btn" id="woClose">✕</button></div>'
    +'<div class="battle-arena" style="flex-direction:column;gap:12px"><div class="workout-exercise" style="text-align:center">'
    +'<div style="font-size:2.2rem;font-weight:800">'+ex.exercise+'</div>'
    +'<div style="font-size:.9rem;color:var(--text2);margin:4px 0 16px">'+ex.weight+' kg · 目标 '+ex.targetReps+' 次</div>'
    +'<div style="font-family:var(--font);font-size:4rem;font-weight:900;color:var(--orange)" id="woRepsDisp">'+_woReps+'</div>'
    +'<div style="font-size:.75rem;color:var(--text3);letter-spacing:1px">实际次数</div>'
    +'<div style="display:flex;gap:24px;justify-content:center;margin:16px 0">'
    +'<button class="speed-btn" id="woRepsD" style="width:56px;height:56px;border-radius:50%;font-size:2rem">−</button>'
    +'<button class="speed-btn" id="woRepsU" style="width:56px;height:56px;border-radius:50%;font-size:2rem">+</button></div>'
    +'<button class="sb-btn" id="woDone" style="max-width:300px">✅ 完成</button></div></div>'
  document.body.appendChild(overlay)
  document.getElementById('woRepsD').addEventListener('click',()=>{_woReps=Math.max(0,_woReps-1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woRepsU').addEventListener('click',()=>{_woReps=Math.min(999,_woReps+1);document.getElementById('woRepsDisp').textContent=_woReps})
  document.getElementById('woDone').addEventListener('click',()=>completeWoSet())
  document.getElementById('woClose').addEventListener('click',()=>{document.getElementById('woOverlay')?.remove()})
}

function completeWoSet(){
  const ex=_woPlan.exercises[_woIdx]
  _woDone.push({exercise:ex.exercise,weight:ex.weight,targetReps:ex.targetReps,actualReps:_woReps})
  if(_woIdx+1<_woPlan.exercises.length){
    _woIdx++
    if(ex.restSeconds>0){showWoRest(ex.restSeconds)}
    else{showWoExercise()}
  }else{showWoSummary()}
}

function showWoRest(sec){
  _woRest=sec
  const el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:.8rem;color:var(--text3);letter-spacing:1px;margin-bottom:8px">休息</div>'
    +'<div style="font-size:5rem;font-weight:900;color:var(--orange)" id="woRestDisp">'+sec+'s</div>'
    +'<div style="font-size:.8rem;color:var(--text2);margin:12px 0">下一组: '+_woPlan.exercises[_woIdx].exercise+'</div>'
    +'<button class="speed-btn" id="woSkipRest">跳过 →</button></div>'
  _woTimer=setInterval(()=>{_woRest--;if(_woRest<=0){clearInterval(_woTimer);_woTimer=null;showWoExercise();return}
    var rd=document.getElementById('woRestDisp');if(rd)rd.textContent=_woRest+'s'},1000)
  document.getElementById('woSkipRest')?.addEventListener('click',()=>{clearInterval(_woTimer);_woTimer=null;showWoExercise()})
}

function showWoSummary(){
  const total=_woDone.reduce((s,d)=>s+d.actualReps,0),vol=_woDone.reduce((s,d)=>s+d.weight*d.actualReps,0)
  const el=document.getElementById('woOverlay')?.querySelector('.battle-arena')
  if(!el)return
  el.innerHTML='<div style="text-align:center"><div style="font-size:2.5rem;margin-bottom:4px">🎉</div><div style="font-size:1.5rem;font-weight:800;margin-bottom:12px">训练完成！</div>'
    +_woDone.map(d=>'<div style="font-size:.8rem;color:var(--text2)">'+d.exercise+' '+d.weight+'kg × '+d.actualReps+'/'+d.targetReps+(d.actualReps>=d.targetReps?' ✅':'')+'</div>').join('')
    +'<div style="display:flex;justify-content:center;gap:24px;margin:16px 0"><div><div style="font-size:1.5rem;font-weight:800;color:var(--orange)">'+total+'</div><div style="font-size:.65rem;color:var(--text3)">总次数</div></div><div><div style="font-size:1.5rem;font-weight:800;color:var(--blue)">'+vol+'</div><div style="font-size:.65rem;color:var(--text3)">总容量</div></div></div>'
    +'<button class="sb-btn" id="woFinish" style="max-width:300px">✅ 记录并完成</button></div>'
  document.getElementById('woFinish').addEventListener('click',()=>{
    _woDone.forEach(d=>{addStr({date:today(),exercise:d.exercise,weight:d.weight,targetReps:d.targetReps,actualReps:d.actualReps})})
    document.getElementById('woOverlay')?.remove()
    toast('训练已记录！','s');renderStr()
  })
}

/* ========== HEATMAP ========== */
let _hmY=new Date().getFullYear(),_hmM=new Date().getMonth()
function renderHeatmap(cid,prefix,curDate){
  const c=document.getElementById(cid);if(!c)return
  const n=new Date(_hmY,_hmM);const y=n.getFullYear(),m=n.getMonth()
  const dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay()
  const so=fd===0?6:fd-1,wd=['一','二','三','四','五','六','日']
  const mn=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  const dd={}
  for(let d=1;d<=dim;d++){const s=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')
    const entries=prefix==='str'?getStr(s):[];const reps=entries.reduce((a,e)=>a+e.actualReps,0);dd[d]={reps,date:s}}
  const max=Math.max(1,...Object.values(dd).map(d=>d.reps))
  function lv(r){if(r===0)return 0;const ra=r/max;if(ra<=.1)return 1;if(ra<=.3)return 2;if(ra<=.5)return 3;if(ra<=.75)return 4;return 5}
  let h='<div class="hm"><div class="hm-hdr"><div class="hm-label">'+y+'年 '+mn[m]+'</div><div class="hm-nav"><button class="hm-nav-btn" data-n="hmP">◀</button><button class="hm-nav-btn" data-n="hmT">📍</button><button class="hm-nav-btn" data-n="hmN">▶</button></div></div><div class="hm-grid">'
  wd.forEach(d=>{h+='<div class="hm-dh">'+d+'</div>'})
  for(let i=0;i<so;i++)h+='<div class="hm-cell"></div>'
  for(let d=1;d<=dim;d++){const da=dd[d];const l=lv(da.reps);const t=da.date===today();const hd=da.reps>0
    h+='<div class="hm-cell'+(t?' today':'')+'" data-l="'+l+'" data-date="'+da.date+'">'+d+'</div>'}
  h+='</div><div class="hm-leg">少 <div class="l0"></div><div class="l1"></div><div class="l3"></div><div class="l5"></div> 多</div></div>'
  c.innerHTML=h
  c.querySelectorAll('[data-n="hmP"]').forEach(b=>b.addEventListener('click',()=>{_hmM--;if(_hmM<0){_hmM=11;_hmY--}renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('[data-n="hmN"]').forEach(b=>b.addEventListener('click',()=>{_hmM++;if(_hmM>11){_hmM=0;_hmY++}renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('[data-n="hmT"]').forEach(b=>b.addEventListener('click',()=>{const n=new Date();_hmY=n.getFullYear();_hmM=n.getMonth();renderHeatmap(cid,prefix,curDate)}))
  c.querySelectorAll('.hm-cell[data-date]').forEach(b=>b.addEventListener('click',()=>{
    _strDate=b.dataset.date;renderStr()
    // Switch to log tab
  }))
}

/* ========== RENDER: CARDIO ========== */
let _carDate=today(),_carForm=false;
let _carSelType='run',_carDur=30,_carDist=0;

function renderCar(){
  const d=_carDate;const f=fmtDate(d)
  document.getElementById('carDateMain').textContent=f.main
  document.getElementById('carDateSub').textContent=f.sub
  const entries=getCar(d)
  const el=document.getElementById('carList')
  if(!entries.length){
    el.innerHTML='<div class="empty"><span class="empty-e">🏃</span><div class="empty-t">今天还没有有氧记录</div><div class="empty-s">跑一跑、跳一跳，保持活力！</div></div>'
  } else {
    el.innerHTML=entries.map(e=>{
      const ct=CARDIO_TYPES.find(x=>x.id===e.type)||{emoji:'🏃',name:'运动'}
      const ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''
      return '<div class="ec"><div class="ec-hdr"><div class="ec-ex">'+ct.emoji+' '+ct.name+'</div><div class="ec-actions"><button class="ec-act" data-a="carDel" data-id="'+e.id+'">🗑️</button></div></div><div class="ec-prog"><div class="ec-pt"><span>⏱️ '+e.duration+' 分钟</span>'+(e.distance>0?'<span>📏 '+e.distance+' km</span>':'')+'</div></div>'+(e.note?'<div style="font-size:.7rem;color:var(--text2);margin-top:4px">💬 '+e.note+'</div>':'')+'</div>'+(ts?'<div class="ec-time">🕐 '+ts+'</div>':'')+'</div>'
    }).join('')
  }
  renderCarStats()
}

function renderCarStats(){
  const g=document.getElementById('carStats')
  const we=getWeekCar()
  const total=we.length,dur=we.reduce((s,e)=>s+e.duration,0),dist=we.reduce((s,e)=>s+(e.distance||0),0)
  g.innerHTML='<div class="sc sc-total"><div class="sc-v">'+total+'</div><div class="sc-l">本周次数</div></div><div class="sc sc-vol"><div class="sc-v">'+dur+'</div><div class="sc-l">总分钟</div></div><div class="sc sc-fav"><div class="sc-v">'+(dist>0?dist+'km':'—')+'</div><div class="sc-l">总距离</div></div><div class="sc sc-rate"><div class="sc-v">🔥</div><div class="sc-l">坚持有氧</div></div>'
}
function getWeekCar(){const n=new Date();const d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d));return(_car.entries||[]).filter(e=>e.date>=toDate(m))}

/* ========== RENDER: PROFILE ========== */
function renderProf(){
  const pc=document.getElementById('profileCard')
  pc.innerHTML='<div class="pf-row"><label>身高</label><input type="number" id="pfHeight" value="'+_prof.height+'" step="1" min="100" max="250"></div><div class="pf-row"><label>性别</label><select id="pfGender"><option value="男"'+(_prof.gender==='男'?' selected':'')+'>男</option><option value="女"'+(_prof.gender==='女'?' selected':'')+'>女</option></select></div><div class="pf-row"><label>出生年</label><input type="number" id="pfBirth" value="'+_prof.birthYear+'" step="1" min="1950" max="2010"></div><button class="sb-btn" id="pfSave" style="margin-top:4px">💾 保存资料</button>'
  document.getElementById('pfSave').addEventListener('click',()=>{
    _prof.height=parseFloat(document.getElementById('pfHeight').value)||175
    _prof.gender=document.getElementById('pfGender').value
    _prof.birthYear=parseInt(document.getElementById('pfBirth').value)||1990
    saveProf();toast('资料已保存','s')
  })
  // Pre-fill weight with last recorded value
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
    _wt.records=_wt.records.filter(r=>r.id!==b.dataset.id);saveWt();renderWtList();renderChart()
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
  // Grid
  ctx.strokeStyle='rgba(100,116,139,.15)';ctx.lineWidth=.5
  for(let v=min;v<=max;v++){const y=yv(v);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}
  // Labels
  ctx.fillStyle='var(--text3)';ctx.font='9px sans-serif';ctx.textAlign='center'
  recs.forEach((r,i)=>{ctx.fillText(r.date.slice(5),xs[i],H-5)})
  ctx.textAlign='right';ctx.fillText(min,W-3,yv(min)+3);ctx.fillText(max,W-3,yv(max)+3)
  // Line
  ctx.beginPath();recs.forEach((r,i)=>{const x=xs[i],y=yv(r.weight);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)})
  ctx.strokeStyle='#F97316';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke()
  // Gradient fill
  const grd=ctx.createLinearGradient(0,yv(min),0,yv(max));grd.addColorStop(0,'rgba(249,115,22,.15)');grd.addColorStop(1,'rgba(249,115,22,0)')
  ctx.beginPath();ctx.moveTo(xs[0],yv(vals[0]))
  recs.forEach((r,i)=>ctx.lineTo(xs[i],yv(r.weight)))
  ctx.lineTo(xs[xs.length-1],yv(min));ctx.lineTo(xs[0],yv(min));ctx.closePath()
  ctx.fillStyle=grd;ctx.fill()
  // Dots
  recs.forEach((r,i)=>{ctx.beginPath();ctx.arc(xs[i],yv(r.weight),3.5,0,Math.PI*2);ctx.fillStyle='#F97316';ctx.fill()
    ctx.beginPath();ctx.arc(xs[i],yv(r.weight),5,0,Math.PI*2);ctx.fillStyle='rgba(249,115,22,.2)';ctx.fill()})
  // Latest value
  const last=recs[recs.length-1];ctx.fillStyle='#F97316';ctx.font='bold 12px sans-serif';ctx.textAlign='center'
  ctx.fillText(last.weight+'kg',xs[xs.length-1],yv(last.weight)-10)
}

/* ========== RENDER: GAME ========== */
function renderGame(){
  const stats=getGameStats()
  const mNames=['','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
  const n=new Date();const monthLabel=mNames[n.getMonth()+1]||''
  // Calculate detail strings for attribute log
  var thirty=toDate(new Date(Date.now()-30*86400000))
  var strE=(_str.entries||[]).filter(function(e){return e.date>=thirty})
  var carE=(_car.entries||[]).filter(function(e){return e.date>=thirty})
  var strVol=strE.reduce(function(s,e){return s+e.weight*e.actualReps},0)
  var carDur=carE.reduce(function(s,e){return s+e.duration},0)
  var baseAtk=10+Math.floor(strVol/20),baseDef=10+Math.floor(carDur/6)
  var baseHp=100+Math.floor(strVol/10)+Math.floor(carDur/3)
  var atkInfo='攻击 = 10 + floor('+strVol+'/20) = '+baseAtk+(stats.wkBonus>0?' + 周奖励 +'+stats.wkBonus:'')+' = '+stats.atk
  var defInfo='防御 = 10 + floor('+carDur+'/6) = '+baseDef+(stats.wkBonus>0?' + 周奖励 +'+Math.floor(stats.wkBonus/2):'')+' = '+stats.def
  var hpInfo='生命 = 100 + floor('+strVol+'/10) + floor('+carDur+'/3) = '+baseHp+(stats.wkBonus>0?' + 周奖励 ×3 +'+stats.wkBonus*3:'')+' = '+stats.hp

  document.getElementById('gameStatsBar').innerHTML=
    '<div class="gs-item"><div class="gs-v orange">'+stats.atk+'</div><div class="gs-l">⚔️ 攻击</div></div>'+
    '<div class="gs-item"><div class="gs-v blue">'+stats.def+'</div><div class="gs-l">🛡️ 防御</div></div>'+
    '<div class="gs-item"><div class="gs-v green">'+stats.hp+'</div><div class="gs-l">❤️ 生命</div></div>'+
    '<div class="gs-item"><div class="gs-v">'+_game.cleared.length+'</div><div class="gs-l">🏆 通关</div></div>'+
    '<div class="gs-item" style="min-width:80px"><div class="gs-v orange">'+stats.wkDays+'<span style="font-size:.6rem">/7</span>'+(stats.wkBonus>0?' <span style="font-size:.6rem;color:var(--green)">+'+stats.wkBonus+'</span>':'')+'</div><div class="gs-l">📅 本周训练</div></div>'+
    '<div class="gs-item" style="min-width:80px"><div class="gs-v blue">'+stats.monthDays+'<span style="font-size:.6rem">天</span></div><div class="gs-l">'+monthLabel+'</div></div>'+
    '<div class="gs-item" style="flex:0;min-width:auto"><button class="header-btn" id="attrInfoBtn" title="属性计算方式">📖</button></div>'

  // Store calc info for the detail modal
  _attrCalcInfo={atk:atkInfo,def:defInfo,hp:hpInfo,vol:strVol,dur:carDur}

  const gc=document.getElementById('gameContent')
  let h=''
  Object.entries(LEVELS).forEach(([k,ch])=>{
    h+='<div class="chapter-hdr">📖 '+ch.name+'</div><div class="lv-grid">'
    ch.levels.forEach(lv=>{
      const cleared=_game.cleared.includes(lv.id)
      const isCur=_game.current===lv.id
      const allPrev=allPrevCleared(k,lv.id)
      const locked=!cleared&&!isCur&&!allPrev
      h+='<div class="lv-card'+(cleared?' done':'')+(isCur?' current':'')+(locked?' locked':'')+'" data-lv="'+lv.id+'"><div class="lv-num">'+lv.id+'</div><div class="lv-name">'+lv.npc+'</div><div class="lv-status '+(cleared?'done':isCur?'current':'locked')+'">'+(cleared?'✅ 已通关':isCur?'⚔️ 挑战中':locked?'🔒 未解锁':'⚔️ 可挑战')+'</div></div>'
    })
    h+='</div>'
  })
  gc.innerHTML=h
  gc.querySelectorAll('.lv-card:not(.locked)').forEach(c=>c.addEventListener('click',()=>{
    const id=c.dataset.lv;if(_game.cleared.includes(id))return
    _game.current=id;saveGame();startBattle(id)
  }))
}

function allPrevCleared(chKey,lvId){
  const ch=LEVELS[chKey];if(!ch)return false
  // Must clear all levels from all previous chapters first
  var seen=false
  for(const[k,ch2]of Object.entries(LEVELS)){
    if(k===chKey)break
    for(const lv2 of ch2.levels){
      if(!_game.cleared.includes(lv2.id))return false
    }
  }
  // Then check levels before this one in current chapter
  for(const lv of ch.levels){
    if(lv.id===lvId)return true
    if(!_game.cleared.includes(lv.id))return false
  }
  return true
}

function getWeekDays(){
  const n=new Date(),d=n.getDay();const m=new Date(n);m.setDate(n.getDate()+(d===0?-6:1-d))
  const days=new Set()
  ;(_str.entries||[]).filter(e=>e.date>=toDate(m)).forEach(e=>days.add(e.date))
  ;(_car.entries||[]).filter(e=>e.date>=toDate(m)).forEach(e=>days.add(e.date))
  return days.size
}
function getMonthDays(){
  const n=new Date();const ms=toDate(new Date(n.getFullYear(),n.getMonth(),1))
  const days=new Set()
  ;(_str.entries||[]).filter(e=>e.date>=ms).forEach(e=>days.add(e.date))
  ;(_car.entries||[]).filter(e=>e.date>=ms).forEach(e=>days.add(e.date))
  return days.size
}

function getGameStats(){
  const thirty=toDate(new Date(Date.now()-30*86400000))
  const strE=(_str.entries||[]).filter(e=>e.date>=thirty)
  const carE=(_car.entries||[]).filter(e=>e.date>=thirty)
  const strVol=strE.reduce((s,e)=>s+e.weight*e.actualReps,0)
  const carDur=carE.reduce((s,e)=>s+e.duration,0)
  // Weekly bonus: 4days→+2, 7days→+5 (scaled 10x: +20/+50)
  const wk=getWeekDays();const wkBonus=wk>=7?50:wk>=4?20:0
  const baseAtk=10+Math.floor(strVol/20)
  const baseDef=10+Math.floor(carDur/6)
  return{
    atk:baseAtk+Math.floor(wkBonus/2),
    def:baseDef+Math.floor(wkBonus/2),
    hp:100+Math.floor(strVol/10)+Math.floor(carDur/3)+wkBonus*3,
    wkDays:wk,wkBonus:wkBonus,
    monthDays:getMonthDays()
  }
}

/* ========== BATTLE ========== */
let _battleRunning=false,_battleSpeed=1,_battleTimer=null
let _bPlayer=null,_bEnemy=null,_bLog=[],_bDone=false,_attrCalcInfo={},_bBossAffix=null,_bTurn=0,_bRageCount=0

function findLevel(id){
  for(const ch of Object.values(LEVELS))
    for(const lv of ch.levels)
      if(lv.id===id)return lv
  return null
}

/* Boss affix system */
var BOSS_AFFIXES=[
  {name:'虚弱诅咒',desc:'你防御低于50时,伤害减少10~20%',
    apply:function(atk,def,isPlayer){
      // If player's defense < 50, reduce damage by 10-20%
      if(isPlayer&&def<50){var r=0.8+Math.random()*0.1;return Math.floor(atk*r)}
      return atk
    }},
  {name:'荆棘之躯',desc:'攻击者受到50%反伤(可被防御减免)',
    reflect:function(dmg,atkDef){return Math.max(1,Math.floor(dmg*0.5)-Math.floor(atkDef/2))}},
  {name:'怒气勃发',desc:'每2~3回合攻击力+1~5(可叠加)',
    onTurn:function(turn,enemyAtk,baseAtk){
      if(turn>=2&&(turn%2===0||turn%3===0)&&Math.random()<0.6){
        var bonus=1+Math.floor(Math.random()*5);return enemyAtk+bonus}
      return enemyAtk
    }}
]

function pickBossAffix(){
  var idx=Math.floor(Math.random()*BOSS_AFFIXES.length)
  return{index:idx,...BOSS_AFFIXES[idx]}
}

function updateGameBar(){
  // Update the game stats bar without re-rendering the whole game tab
  var bar=document.getElementById('gameStatsBar');if(!bar||!bar.isConnected)return
  // Only update if game tab is currently visible
  if(!document.getElementById('tabGame')?.classList.contains('active'))return
  renderGame()
}

function startBattle(id){
  const lv=findLevel(id);if(!lv)return
  // Check daily attempt limit
  if(!_game.attempts)_game.attempts={}
  var todayKey=today()+'_'+id
  var attempts=_game.attempts[todayKey]||0
  if(attempts>=3){toast('今天已失败 3 次，不能再挑战了 😅','e');return}
  // Check if trained today
  var todayStr=today()
  var trainedToday=(_str.entries||[]).some(function(e){return e.date===todayStr})||(_car.entries||[]).some(function(e){return e.date===todayStr})
  if(!trainedToday&&attempts===0){toast('⚠️ 今天还没训练，属性较低','e')}
  var stats=getGameStats()
  _bPlayer={...stats};_bEnemy={atk:lv.atk,def:lv.def,hp:lv.hp,maxHP:lv.hp}
  // Boss affix
  if(lv.boss){_bBossAffix=pickBossAffix()}else{_bBossAffix=null}
  _bLog=[];_bDone=false;_battleSpeed=1;_bTurn=0;_bRageCount=0
  document.getElementById('battleLevel').textContent=id+' '+lv.npc+(_bBossAffix?' 👑':'')+(_bBossAffix?' ['+_bBossAffix.name+']':'')
  document.getElementById('beName').textContent='👹 '+lv.npc+(_bBossAffix?' 👑':'')
  // Set stats display
  document.getElementById('bpHP').style.width='100%'
  document.getElementById('bpHPText').textContent='❤️ '+stats.hp
  document.getElementById('bpAtk').textContent='⚔️ '+stats.atk
  document.getElementById('bpDef').textContent='🛡️ '+stats.def
  document.getElementById('beHP').style.width='100%'
  document.getElementById('beHPText').textContent='❤️ '+lv.hp
  document.getElementById('beAtk').textContent='⚔️ '+lv.atk
  document.getElementById('beDef').textContent='🛡️ '+lv.def
  document.getElementById('battleLog').innerHTML=''
  document.getElementById('battleEnd').innerHTML=''
  document.getElementById('battleOverlay').classList.add('open')
  // Auto-start after a brief delay
  setTimeout(()=>runBattle(),500)
}

function runBattle(){
  if(_bDone||_battleRunning)return
  _battleRunning=true
  const lv=findLevel(_game.current)
  const tick=()=>{
    if(_bDone){_battleRunning=false;return}
    // Player attacks
    _bTurn++
    // Boss rage affix
    var bossAtk=_bEnemy.atk
    if(_bBossAffix&&_bBossAffix.onTurn&&_bBossAffix.index===2){
      var newAtk=_bBossAffix.onTurn(_bTurn,_bEnemy.atk,lv.atk)
      if(newAtk>bossAtk){bossAtk=newAtk;_bEnemy.atk=newAtk;addBattleLog('🔴 Boss 怒气勃发, 攻击力 +'+(newAtk-lv.atk-_bRageCount),'e');_bRageCount+=newAtk-lv.atk-_bRageCount}
    }
    // Player attacks
    var pDmgBase=Math.max(1,_bPlayer.atk-Math.floor(_bEnemy.def/2)+Math.floor(Math.random()*4)+1)
    // Boss:虚弱诅咒
    var pDmg=_bBossAffix&&_bBossAffix.apply?_bBossAffix.apply(pDmgBase,_bPlayer.def,true):pDmgBase
    _bEnemy.hp-=pDmg
    if(pDmg!==pDmgBase)addBattleLog('🧑 攻击 → '+pDmgBase+' (被诅咒减免至 '+pDmg+')','dmg')
    else addBattleLog('🧑 攻击 → '+pDmg+' 伤害','dmg')
    // Boss:荆棘反伤
    if(_bBossAffix&&_bBossAffix.reflect&&pDmg>0){
      var reflectDmg=_bBossAffix.reflect(pDmg,_bPlayer.def)
      if(reflectDmg>0){_bPlayer.hp-=Math.min(_bPlayer.hp,reflectDmg);addBattleLog('🩸 荆棘反伤 → '+reflectDmg+' 伤害','e')}
    }
    updateBattleHP()
    if(_bEnemy.hp<=0){_bEnemy.hp=0;endBattle(true);_battleRunning=false;return}
    // Enemy attacks
    var eDmgBase=Math.max(1,bossAtk-Math.floor(_bPlayer.def/2)+Math.floor(Math.random()*3)+1)
    var eDmg=_bBossAffix&&_bBossAffix.apply&&_bBossAffix.index===0?_bBossAffix.apply(eDmgBase,bossAtk,false):eDmgBase
    _bPlayer.hp-=eDmg
    addBattleLog('👹 '+lv.npc+' 攻击 → '+eDmg+' 伤害','e')
    updateBattleHP()
    if(_bPlayer.hp<=0){_bPlayer.hp=0;endBattle(false);_battleRunning=false;return}
    // Next tick
    _battleTimer=setTimeout(tick,600/_battleSpeed)
  }
  tick()
}

function updateBattleHP(){
  document.getElementById('bpHP').style.width=Math.max(0,_bPlayer.hp/(_bPlayer.hp+_bEnemy.maxHP||1)*100)+'%'
  document.getElementById('bpHPText').textContent='HP: '+Math.max(0,_bPlayer.hp)
  document.getElementById('beHP').style.width=Math.max(0,_bEnemy.hp/_bEnemy.maxHP*100)+'%'
  document.getElementById('beHPText').textContent='HP: '+Math.max(0,_bEnemy.hp)+'/'+_bEnemy.maxHP
}

function addBattleLog(msg,type){
  const el=document.getElementById('battleLog')
  const div=document.createElement('div');div.className='bl-entry '+(type==='dmg'?'bl-dmg':type==='e'?'bl-def':'')
  div.textContent='▸ '+msg;el.appendChild(div);el.scrollTop=el.scrollHeight
}

function endBattle(won){
  _bDone=true;const el=document.getElementById('battleEnd')
  const lv=findLevel(_game.current)
  // Track attempts on loss
  if(!won){
    if(!_game.attempts)_game.attempts={}
    var todayKey=today()+'_'+_game.current
    _game.attempts[todayKey]=(_game.attempts[todayKey]||0)+1
    saveGame()
  }
  if(won){
    if(!_game.cleared.includes(_game.current))_game.cleared.push(_game.current)
    // Unlock next
    let nextId='';let found=false
    for(const ch of Object.values(LEVELS)){
      for(const lv2 of ch.levels){
        if(found){nextId=lv2.id;found=false;break}
        if(lv2.id===_game.current)found=true
      }
      if(nextId)break
    }
    if(nextId)_game.current=nextId
    else _game.current=''
    saveGame()
    el.innerHTML='<div class="be-result be-win">🏆 胜利！</div><div class="be-replay"><button class="be-btn be-btn-next" id="battleNext">下一关 →</button><button class="be-btn be-btn-retry" id="battleShare">📤 分享卡片</button></div>'
    celebrate()
  } else {
    el.innerHTML='<div class="be-result be-lose">💀 战败</div><div class="be-replay"><button class="be-btn be-btn-retry" id="battleRetry">🔄 重新挑战</button></div>'
  }
  document.getElementById('battleNext')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');renderGame()})
  document.getElementById('battleRetry')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');setTimeout(()=>startBattle(_game.current),100)})
  document.getElementById('battleShare')?.addEventListener('click',showShareCard)
}

/* ========== SHARE CARD ========== */
function showShareCard(){
  const lv=findLevel(_game.current)||findLevel(_game.cleared[_game.cleared.length-1])
  if(!lv)return
  const stats=getGameStats()
  document.getElementById('shareLevel').textContent=_game.current+' '+lv.npc
  document.getElementById('shareStats').innerHTML=
    '<div class="share-stat"><div class="ss-v">'+stats.atk+'</div><div class="ss-l">攻击</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.def+'</div><div class="ss-l">防御</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.hp+'</div><div class="ss-l">生命</div></div>'
  const clearedStr=_game.cleared.length>0?'已通关 '+_game.cleared.length+' 关':'刚刚开始征程'
  const strE=(_str.entries||[]).length,carE=(_car.entries||[]).length
  document.getElementById('shareVS').innerHTML=
    '🧑 力量训练 '+strE+' 次 · 有氧 '+carE+' 次<br>💪 '+clearedStr
  document.getElementById('shareOverlay').classList.add('open')
}
function hideShare(){document.getElementById('shareOverlay').classList.remove('open')}

/* ========== INIT ========== */
function init(){
  document.documentElement.classList.add('no-transition')
  setTheme(getTheme())
  requestAnimationFrame(()=>document.documentElement.classList.remove('no-transition'))

  // Build weight grids
  buildWtGrid(document.getElementById('strWeight'),_strSelW,w=>_strSelW=w)
  // Exercise suggestions
  const sug=document.getElementById('strSuggest')
  EXERCISES.forEach(n=>{const b=document.createElement('button');b.textContent=n
    b.addEventListener('click',()=>document.getElementById('strExercise').value=n);sug.appendChild(b)})
  const dl=document.getElementById('strExList')
  EXERCISES.forEach(n=>{const o=document.createElement('option');o.value=n;dl.appendChild(o)})

  // Cardio type buttons
  const ct=document.getElementById('carTypes')
  CARDIO_TYPES.forEach(t=>{const b=document.createElement('button');b.className='car-type'+(t.id==='run'?' selected':'');b.textContent=t.emoji+' '+t.name;b.dataset.ct=t.id
    b.addEventListener('click',()=>{ct.querySelectorAll('.car-type').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');_carSelType=t.id
      document.getElementById('carDistLabel').textContent=t.hasDist?'km':'无'
      if(!t.hasDist){_carDist=0;document.getElementById('carDistVal').textContent='0'}
    });ct.appendChild(b)})

  // Migrate old localStorage data to new keys
  migrateOldData()

  renderStr();renderCar();renderProf();renderGame()

  // Pull sync on load
  setTimeout(pullSync,1500)
}

/* ========== EVENT DELEGATION ========== */
document.addEventListener('click',function(e){
  const el=e.target.closest('button,[id],[data-a],[data-s],[data-date]')
  if(!el)return
  const id=el.id,act=el.dataset.a,st=el.dataset.s

  // Tab switching
  if(el.classList.contains('tab-btn')){switchTab(el.dataset.tab);return}

  switch(id){
    case 'themeToggle':toggleTheme();return;
    // Strength date nav
    case 'strPrevDay':{const d=parseDate(_strDate);d.setDate(d.getDate()-1);_strDate=toDate(d);renderStr();return}
    case 'strNextDay':{const d=parseDate(_strDate);d.setDate(d.getDate()+1);_strDate=toDate(d);renderStr();return}
    case 'strGoToday':_strDate=today();renderStr();return;
    case 'strAddBtn':_strForm=!_strForm;el.textContent=_strForm?'✖ 收起':'＋ 新增一组'
      document.getElementById('strAddCard').classList.toggle('open',_strForm);if(_strForm)document.getElementById('strExercise').focus();return;
    case 'strSubmit':{
      const ex=document.getElementById('strExercise').value.trim()
      if(!ex){toast('请输入动作名称','e');return}
      const tgt=parseInt(document.getElementById('strTgtVal').textContent,10)
      const act2=parseInt(document.getElementById('strActVal').textContent,10)
      addStr({date:_strDate,exercise:ex,weight:_strSelW,targetReps:tgt,actualReps:act2})
      document.getElementById('strExercise').value='';document.getElementById('strTgtVal').textContent='12';document.getElementById('strActVal').textContent='12'
      _strSelW=COMMON_W[4];document.querySelectorAll('#strWeight .wt-btn').forEach(b=>b.classList.toggle('selected',parseInt(b.dataset.w)===_strSelW))
      document.getElementById('strAddCard').classList.remove('open');_strForm=false;document.getElementById('strAddBtn').textContent='＋ 新增一组'
      toast('记录成功！','s')
      const te=getStr(_strDate);if(te.length&&te.every(e=>e.actualReps>=e.targetReps))setTimeout(celebrate,300)
      renderStr();return}

    // Cardio
    case 'carPrevDay':{const d=parseDate(_carDate);d.setDate(d.getDate()-1);_carDate=toDate(d);renderCar();return}
    case 'carNextDay':{const d=parseDate(_carDate);d.setDate(d.getDate()+1);_carDate=toDate(d);renderCar();return}
    case 'carGoToday':_carDate=today();renderCar();return;
    case 'carAddBtn':_carForm=!_carForm;el.textContent=_carForm?'✖ 收起':'＋ 新增记录'
      document.getElementById('carAddCard').classList.toggle('open',_carForm);return;
    case 'carDurDown':_carDur=Math.max(1,_carDur-5);document.getElementById('carDurVal').textContent=_carDur;return;
    case 'carDurUp':_carDur=Math.min(999,_carDur+5);document.getElementById('carDurVal').textContent=_carDur;return;
    case 'carDistDown':_carDist=Math.max(0,_carDist-0.5);document.getElementById('carDistVal').textContent=_carDist;return;
    case 'carDistUp':_carDist=Math.min(999,_carDist+0.5);document.getElementById('carDistVal').textContent=_carDist;return;
    case 'carSubmit':{
      const note=document.getElementById('carNote').value.trim()
      addCar({date:_carDate,type:_carSelType,duration:_carDur,distance:_carDist,note})
      document.getElementById('carNote').value='';_carDur=30;_carDist=0
      document.getElementById('carDurVal').textContent='30';document.getElementById('carDistVal').textContent='0'
      document.getElementById('carAddCard').classList.remove('open');_carForm=false;document.getElementById('carAddBtn').textContent='＋ 新增记录'
      toast('有氧记录已保存 🏃','s');renderCar();return}

    // Weight
    case 'wtSubmit':{
      const w=parseFloat(document.getElementById('wtInput').value)
      const note=document.getElementById('wtNote').value.trim()
      addWt({date:today(),weight:w,note})
      document.getElementById('wtNote').value=''
      toast('体重已记录 ⚖️','s');renderWtList();renderChart();return}

    // Game/Level click
    case 'battleClose':_bDone=true;if(_battleTimer)clearTimeout(_battleTimer);_battleRunning=false
      document.getElementById('battleOverlay').classList.remove('open');renderGame();return;
    case 'shareClose':hideShare();return;
    case 'shareSave':{
      // Simple screenshot approach - alert user to screenshot
      toast('长按或截图保存分享卡片 📸','s');return}
  }

  // Speed buttons
  if(el.classList.contains('speed-btn')&&el.dataset.speed){
    document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'))
    el.classList.add('active');_battleSpeed=parseInt(el.dataset.speed);return
  }

  // Plans
  if(act==='startPlan'){startStrPlan(el.dataset.pid);return}
  if(act==='delPlan'){
    if(confirm('确定删除这个计划？')){_plans.plans=_plans.plans.filter(p=>p.id!==el.dataset.pid);savePlans();renderStr()}
    return}

  // New plan button
  if(id==='attrInfoBtn'){
    var info=_attrCalcInfo||{atk:'暂无数据',def:'暂无数据',hp:'暂无数据'}
    var modal=document.createElement('div');modal.className='modal-overlay open'
    modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📖 属性计算方式</div>'
      +'<div style="font-size:.8rem;line-height:1.7;color:var(--text2);padding:4px 0">'
      +'<div style="color:var(--orange);font-weight:700;margin-bottom:4px">⚔️ '+info.atk+'</div>'
      +'<div style="color:var(--blue);font-weight:700;margin-bottom:4px">🛡️ '+info.def+'</div>'
      +'<div style="color:var(--green);font-weight:700;margin-bottom:4px">❤️ '+info.hp+'</div>'
      +'<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);font-size:.7rem;color:var(--text3)">'
      +'📊 近30天力量容量: '+info.vol+' kg<br>'
      +'🏃 近30天有氧时长: '+info.dur+' 分钟<br>'
      +'📅 每周4天→+20攻防, 7天→+50攻防<br>'
      +'💡 每200kg容量=+1攻击, 每60分钟=+1防御'
      +'</div></div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>'
    document.body.appendChild(modal)
    document.getElementById('attrClose').addEventListener('click',function(){modal.remove()})
    modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
    return}

  if(id==='strNewPlan'){
    var name=prompt('计划名称:','我的训练计划')
    if(!name)return
    var p={id:uid(),name:name,exercises:[],createdAt:Date.now()}
    _plans.plans.push(p);savePlans();renderStr()
    toast('计划已创建，接下来的版本将支持添加动作','s')
    return}

  // Dynamic actions
  if(act==='strEdit'){
    const e=_str.entries.find(x=>x.id===el.dataset.id);if(!e)return
    openStrEdit(e);return}
  if(act==='strDel'){
    if(confirm('确定删除这条记录？')){delStr(el.dataset.id);renderStr();toast('已删除','s')};return}
  if(act==='carDel'){
    if(confirm('确定删除？')){delCar(el.dataset.id);renderCar();toast('已删除','s')};return}

  // Close modals on overlay
  if(el.classList.contains('modal-overlay')){el.classList.remove('open')}

  // Stepper
  if(st&&el.classList.contains('sp-btn')){
    const dir=el.dataset.d;const isTgt=st==='strTgt'
    const vid=isTgt?'strTgtVal':'strActVal'
    const v=document.getElementById(vid);let n=parseInt(v.textContent,10)
    n=dir==='+'?Math.min(n+1,999):Math.max(n-1,0);v.textContent=n;return
  }
})

/* ========== STRENGTH EDIT MODAL ========== */
function openStrEdit(entry){
  const modal=document.createElement('div');modal.className='modal-overlay open';modal.id='strEditModal'
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">✏️ 编辑记录</div><div class="fg"><label class="fl">动作</label><input class="fi" id="seEx" value="'+entry.exercise+'"></div><div class="fg"><label class="fl">重量 (kg)</label><div class="weight-grid" id="seWeight"></div></div><div class="fg"><label class="fl">次数</label><div class="reps-row"><div class="rg"><div class="fl">目标</div><div class="stepper"><button class="sp-btn" id="seTD">−</button><span class="sp-val" id="seTV">'+entry.targetReps+'</span><button class="sp-btn" id="seTU">+</button></div></div><div class="rg"><div class="fl">实际</div><div class="stepper"><button class="sp-btn" id="seAD">−</button><span class="sp-val" id="seAV">'+entry.actualReps+'</span><button class="sp-btn" id="seAU">+</button></div></div></div></div><div class="modal-actions"><button class="m-btn-cancel" id="seCancel">取消</button><button class="m-btn-save" id="seSave">💾 保存</button></div></div>'
  document.body.appendChild(modal)
  let selW=entry.weight
  buildWtGrid(modal.querySelector('#seWeight'),selW,w=>selW=w,true)
  document.getElementById('seTD').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seTU').addEventListener('click',()=>{const e=document.getElementById('seTV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seAD').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.max(0,v-1)})
  document.getElementById('seAU').addEventListener('click',()=>{const e=document.getElementById('seAV');let v=parseInt(e.textContent,10);e.textContent=Math.min(999,v+1)})
  document.getElementById('seCancel').addEventListener('click',()=>modal.remove())
  document.getElementById('seSave').addEventListener('click',()=>{
    const ex=document.getElementById('seEx').value.trim()
    if(!ex){toast('请输入动作名称','e');return}
    updateStr(entry.id,{exercise:ex,weight:selW,targetReps:parseInt(document.getElementById('seTV').textContent,10),actualReps:parseInt(document.getElementById('seAV').textContent,10)})
    modal.remove();toast('已更新','s');renderStr()
  })
  modal.addEventListener('click',e=>{if(e.target===e.currentTarget)modal.remove()})
}

/* ========== TAB SWITCHING ========== */
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name))
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id==='tab'+name.charAt(0).toUpperCase()+name.slice(1)))
  if(name==='strength')renderStr()
  if(name==='cardio')renderCar()
  if(name==='profile')renderProf()
  if(name==='game')renderGame()
}

/* ========== BOOT ========== */
// Add toast container
const tc=document.createElement('div');tc.className='toast-c';tc.id='toastC'
document.getElementById('app').appendChild(tc)

init()

/* ========== DATA MIGRATION ========== */
function migrateOldData(){
  // Migrate from old dumbbell-tracker keys
  try{
    var old=localStorage.getItem('dumbbell-tracker-v1')
    if(old){var d=JSON.parse(old);if(d&&d.entries&&d.entries.length>0&&(!_str.entries||_str.entries.length===0)){
      _str.entries=d.entries;saveStr();console.log('Migrated '+d.entries.length+' strength entries')
    }}
    var oldP=localStorage.getItem('dumbbell-tracker-plans-v1')
    if(oldP){var dp=JSON.parse(oldP);if(dp&&dp.plans&&dp.plans.length>0&&(!_plans.plans||_plans.plans.length===0)){
      _plans.plans=dp.plans;savePlans();console.log('Migrated '+dp.plans.length+' plans')
    }}
  }catch(e){console.log('Migration error:',e)}
}

// Export for inline onclick
window.toggleTheme=toggleTheme

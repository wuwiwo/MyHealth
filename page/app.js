/* ============================================
   MyHealth — App Core (Data Layer + Events + Init)
   ============================================ */

/* ========== DATA LAYER (via store.js) ========== */
function getStr(d){var s=store.get('strength')||{entries:[]};return(s.entries||[]).filter(function(e){return e.date===d}).sort(function(a,b){return(a.createdAt||0)-(b.createdAt||0)})}
function addStr(e){var s=store.get('strength')||{entries:[]};e.id=uid();e.createdAt=Date.now();s.entries.push(e);store.set('strength',s);checkPR(e)}
function updateStr(id,data){var s=store.get('strength')||{entries:[]};var i=s.entries.findIndex(function(e){return e.id===id});if(i>-1){s.entries[i]=Object.assign({},s.entries[i],data);store.set('strength',s)}}
function delStr(id){var s=store.get('strength')||{entries:[]};s.entries=s.entries.filter(function(e){return e.id!==id});store.set('strength',s)}
function checkPR(e){
  var prs=store.get('prs')||{}
  var ex=prs[e.exercise]||{}
  var broken=[]
  var vol=e.weight*e.actualReps
  if(!ex.maxWeight||e.weight>ex.maxWeight){ex.maxWeight=e.weight;ex.weightDate=e.date;broken.push('重量 '+e.weight+'kg')}
  if(!ex.maxReps||e.actualReps>ex.maxReps){ex.maxReps=e.actualReps;ex.repsDate=e.date;broken.push('次数 '+e.actualReps+'次')}
  if(!ex.maxVolume||vol>ex.maxVolume){ex.maxVolume=vol;ex.volDate=e.date;broken.push('容量 '+vol+'kg')}
  if(broken.length){prs[e.exercise]=ex;store.set('prs',prs);toast('🏆 '+e.exercise+' 新PR: '+broken.join(', '),'s')}
}

function getPlans(){var p=store.get('plans');return p?p.plans||[]:[]}
function savePlans(plans){store.set('plans',{plans:plans})}
function getMissed(){var m=store.get('missed');return m?m.notes||{}:{}}
function saveMissed(notes){store.set('missed',{notes:notes})}
function getCardioPlans(){var p=store.get('cardioPlans');return p?p.plans||[]:[]}
function saveCardioPlans(plans){store.set('cardioPlans',{plans:plans})}

function getCar(d){var c=store.get('cardio')||{entries:[]};return(c.entries||[]).filter(function(e){return e.date===d}).sort(function(a,b){return(a.createdAt||0)-(b.createdAt||0)})}
function addCar(e){var c=store.get('cardio')||{entries:[]};e.id=uid();e.createdAt=Date.now();c.entries.push(e);store.set('cardio',c)}
function delCar(id){var c=store.get('cardio')||{entries:[]};c.entries=c.entries.filter(function(e){return e.id!==id});store.set('cardio',c)}

function getWt(){var w=store.get('weight')||{records:[]};return(w.records||[]).sort(function(a,b){return a.date<b.date?1:-1})}
function addWt(r){var w=store.get('weight')||{records:[]};r.id=uid();r.createdAt=Date.now();w.records.push(r);store.set('weight',w)}

function getProf(){return store.get('profile')||{height:175,gender:'男',birthYear:1990}}
function setProf(p){store.set('profile',p)}

function getGame(){return store.get('game')||{cleared:[],current:''}}
function setGame(g){store.set('game',g)}

/* ========== EXERCISE LIBRARY ========== */
function getExercises(){return store.get('exercises')||[]}
function saveExercises(list){store.set('exercises',list||[])}
function getExerciseMap(){
  var map={};
  getExercises().forEach(function(ex){map[ex.id]=ex});
  return map;
}
function getStrengthExercises(){return getExercises().filter(function(ex){return ex.type==='strength'})}
function getCardioExercises(){return getExercises().filter(function(ex){return ex.type==='cardio'})}

/* ========== INIT ========== */
function init(){
  document.getElementById('appVersion').textContent='v'+APP_VERSION
  document.documentElement.classList.add('no-transition')
  setTheme(getTheme())
  requestAnimationFrame(()=>document.documentElement.classList.remove('no-transition'))

  buildWtGrid(document.getElementById('strWeight'),_strSelW,w=>_strSelW=w)

  var sug=document.getElementById('strSuggest')
  if(sug){
    sug.innerHTML='';
    getStrengthExercises().forEach(function(n){
      var b=document.createElement('button');b.textContent=n.name;
      b.addEventListener('click',function(){document.getElementById('strExercise').value=n.name});sug.appendChild(b);
    });
  }
  var dl=document.getElementById('strExList')
  if(dl){
    dl.innerHTML='';
    getStrengthExercises().forEach(function(n){var o=document.createElement('option');o.value=n.name;dl.appendChild(o)});
  }

  var ct=document.getElementById('carTypes')
  initCardioTypes()

  migrateExercises()
  migrateExercisesV17()
  migrateOldData()

  renderStr();renderCar();renderProf();renderGame();renderSettings()
}

/* ========== EVENT DELEGATION ========== */
document.addEventListener('click',function(e){
  const el=e.target.closest('button,[id],[data-a],[data-s],[data-date]')
  if(!el)return
  const id=el.id,act=el.dataset.a,st=el.dataset.s

  if(el.classList.contains('tab-btn')){
    if(el.dataset.tab)switchTab(el.dataset.tab)
    else if(el.dataset.sub)switchSub(el.closest('.tab-content').id.replace('tab','').toLowerCase(),el.dataset.sub)
    return
  }
  if(id==='themeToggle'){toggleTheme();return}
  if(id==='syncBtn'){showSyncDialog();return}

  if(el.classList.contains('speed-btn')&&el.dataset.speed){
    document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'))
    el.classList.add('active');_battleSpeed=parseInt(el.dataset.speed);return
  }
  if(el.classList.contains('modal-overlay')){el.classList.remove('open');return}

  if(st&&el.classList.contains('sp-btn')){
    const dir=el.dataset.d;const isTgt=st==='strTgt'
    const vid=isTgt?'strTgtVal':'strActVal'
    const v=document.getElementById(vid);let n=parseInt(v.textContent,10)
    n=dir==='+'?Math.min(n+1,999):Math.max(n-1,0);v.textContent=n;return
  }

  if(onStrengthEvent(el,id,act))return
  if(onCardioEvent(el,id,act))return
  if(onProfileEvent(el,id,act))return
  if(onGameEvent(el,id,act))return
  if(onSettingsEvent(el,id,act))return
})

/* ========== TAB SWITCHING ========== */
var _activeTab='training';
function switchTab(name){
  _activeTab=name;
  document.querySelectorAll('.tab-bar > .tab-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name))
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id==='tab'+name.charAt(0).toUpperCase()+name.slice(1)))
  if(name==='training'){renderStr();renderCar()}
  if(name==='profile')renderProf()
  if(name==='game')renderGame()
  if(name==='settings')renderSettings()
}

/* ========== GENERIC SUB-TAB SWITCHING ========== */
function switchSub(tabName,sub){
  tabName=tabName.toLowerCase();
  var container=document.getElementById('tab'+tabName.charAt(0).toUpperCase()+tabName.slice(1));
  if(!container)return;
  container.querySelectorAll('.sub-tab-bar .tab-btn[data-sub]').forEach(function(b){b.classList.toggle('active',b.dataset.sub===sub)});
  container.querySelectorAll('.sub-tab').forEach(function(c){c.classList.toggle('active',c.id==='sub'+sub.charAt(0).toUpperCase()+sub.slice(1))});
  if(tabName==='profile'&&sub==='training'){renderStats();renderHeatmap()}
  if(tabName==='settings'){
    if(sub==='library')renderExLibrary();
    if(sub==='plans')renderSettingsPlans();
    if(sub==='game')renderSettingsGame();
    if(sub==='data')renderSettingsData();
  }
  if(tabName==='training'){
    if(sub==='strength')renderStr();
    if(sub==='cardio')renderCar();
  }
}

/* ========== BOOT ========== */
const tc=document.createElement('div');tc.className='toast-c';tc.id='toastC'
document.getElementById('app').appendChild(tc)

/* ========== DATA MIGRATION ========== */
function migrateExercises(){
  if(store.get('exercises'))return;
  var list=[];
  var seen={};
  function add(ex){if(!ex||seen[ex.id])return;seen[ex.id]=true;if(ex.description==null)ex.description='';list.push(ex)}
  // Seed strength exercises (built-in defaults, ratio=100)
  var seedStrength=['二头弯举','肩推','深蹲','卧推','划船','硬拉','侧平举','前平举','锤式弯举','俯身飞鸟','颈后臂屈伸','俯身臂屈伸','直立划船','推举','阿诺德推举','哑铃飞鸟','哑铃耸肩','弓步蹲','保加利亚深蹲','站姿提踵'];
  seedStrength.forEach(function(name){add({id:name,name:name,type:'strength',ratio:100,intensity:null,emoji:null,hasDist:false})});
  // Seed cardio types (built-in defaults)
  var seedCardio=[
    {id:'run',name:'跑步',emoji:'🏃',hasDist:true,intensity:2},
    {id:'jump',name:'跳绳',emoji:'🪢',hasDist:false,intensity:3},
    {id:'cycle',name:'骑行',emoji:'🚴',hasDist:true,intensity:2},
    {id:'swim',name:'游泳',emoji:'🏊',hasDist:true,intensity:3},
    {id:'walk',name:'快走',emoji:'🚶',hasDist:true,intensity:1},
    {id:'hiit',name:'HIIT',emoji:'🔥',hasDist:false,intensity:3}
  ];
  seedCardio.forEach(function(t){add({id:t.id,name:t.name,type:'cardio',ratio:null,intensity:t.intensity,emoji:t.emoji,hasDist:!!t.hasDist})});
  // Merge custom cardio types from old store key
  var customCardio=store.get('cardioTypes')||[];
  customCardio.forEach(function(t){add({id:t.id,name:t.name,type:'cardio',ratio:null,intensity:t.intensity||2,emoji:t.emoji||'🏃',hasDist:!!t.hasDist})});
  // Add strength action names found in existing entries but not seeded
  var strEntries=((store.get('strength')||{entries:[]}).entries)||[];
  strEntries.forEach(function(e){if(e.exercise&&!seen[e.exercise])add({id:e.exercise,name:e.exercise,type:'strength',ratio:100,intensity:null,emoji:null,hasDist:false})});
  // Add cardio type ids found in existing entries but not seeded
  var carEntries=((store.get('cardio')||{entries:[]}).entries)||[];
  carEntries.forEach(function(e){if(e.type&&!seen[e.type])add({id:e.type,name:e.type,type:'cardio',ratio:null,intensity:2,emoji:'🏃',hasDist:false})});
  store.set('exercises',list);
  console.log('Migrated '+list.length+' exercises to library');
}

// v1.7: backfill description field for users who already migrated in v1.6
function migrateExercisesV17(){
  var list=store.get('exercises');
  if(!list||!list.length)return;
  var changed=false;
  for(var i=0;i<list.length;i++){
    if(list[i].description==null){list[i].description='';changed=true}
  }
  if(changed){store.set('exercises',list);console.log('Backfilled description on '+list.length+' exercises')}
}

function migrateOldData(){
  try{
    var old=localStorage.getItem('dumbbell-tracker-v1')
    if(old){var d=JSON.parse(old);var curStr=store.get('strength');if(d&&d.entries&&d.entries.length>0&&(!curStr||!curStr.entries||curStr.entries.length===0)){
      store.set('strength',{entries:d.entries});console.log('Migrated '+d.entries.length+' strength entries')
    }}
    var oldP=localStorage.getItem('dumbbell-tracker-plans-v1')
    if(oldP){var dp=JSON.parse(oldP);var curPl=getPlans();if(dp&&dp.plans&&dp.plans.length>0&&(!curPl||curPl.length===0)){
      savePlans(dp.plans);console.log('Migrated '+dp.plans.length+' plans')
    }}
  }catch(e){console.log('Migration error:',e)}
}

window.toggleTheme=toggleTheme

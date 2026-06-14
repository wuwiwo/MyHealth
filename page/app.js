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

function getCar(d){var c=store.get('cardio')||{entries:[]};return(c.entries||[]).filter(function(e){return e.date===d}).sort(function(a,b){return(a.createdAt||0)-(b.createdAt||0)})}
function addCar(e){var c=store.get('cardio')||{entries:[]};e.id=uid();e.createdAt=Date.now();c.entries.push(e);store.set('cardio',c)}
function delCar(id){var c=store.get('cardio')||{entries:[]};c.entries=c.entries.filter(function(e){return e.id!==id});store.set('cardio',c)}

function getWt(){var w=store.get('weight')||{records:[]};return(w.records||[]).sort(function(a,b){return a.date<b.date?1:-1})}
function addWt(r){var w=store.get('weight')||{records:[]};r.id=uid();r.createdAt=Date.now();w.records.push(r);store.set('weight',w)}

function getProf(){return store.get('profile')||{height:175,gender:'男',birthYear:1990}}
function setProf(p){store.set('profile',p)}

function getGame(){return store.get('game')||{cleared:[],current:''}}
function setGame(g){store.set('game',g)}

/* ========== INIT ========== */
function init(){
  document.getElementById('appVersion').textContent='v'+APP_VERSION
  document.documentElement.classList.add('no-transition')
  setTheme(getTheme())
  requestAnimationFrame(()=>document.documentElement.classList.remove('no-transition'))

  buildWtGrid(document.getElementById('strWeight'),_strSelW,w=>_strSelW=w)

  const sug=document.getElementById('strSuggest')
  EXERCISES.forEach(n=>{const b=document.createElement('button');b.textContent=n
    b.addEventListener('click',()=>document.getElementById('strExercise').value=n);sug.appendChild(b)})
  const dl=document.getElementById('strExList')
  EXERCISES.forEach(n=>{const o=document.createElement('option');o.value=n;dl.appendChild(o)})

  const ct=document.getElementById('carTypes')
  initCardioTypes()

  migrateOldData()

  renderStr();renderCar();renderProf();renderGame()

  setTimeout(pullSync,3000)
}

/* ========== EVENT DELEGATION ========== */
document.addEventListener('click',function(e){
  const el=e.target.closest('button,[id],[data-a],[data-s],[data-date]')
  if(!el)return
  const id=el.id,act=el.dataset.a,st=el.dataset.s

  if(el.classList.contains('tab-btn')){switchTab(el.dataset.tab);return}
  if(id==='themeToggle'){toggleTheme();return}

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
})

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
const tc=document.createElement('div');tc.className='toast-c';tc.id='toastC'
document.getElementById('app').appendChild(tc)

/* ========== DATA MIGRATION ========== */
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

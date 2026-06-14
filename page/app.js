/* ============================================
   MyHealth — App Core (Data Layer + Events + Init)
   ============================================ */

/* ========== DATA LAYER (via store.js) ========== */
function getStr(d){var s=store.get('strength')||{entries:[]};return(s.entries||[]).filter(function(e){return e.date===d}).sort(function(a,b){return(a.createdAt||0)-(b.createdAt||0)})}
function addStr(e){var s=store.get('strength')||{entries:[]};e.id=uid();e.createdAt=Date.now();s.entries.push(e);store.set('strength',s)}
function updateStr(id,data){var s=store.get('strength')||{entries:[]};var i=s.entries.findIndex(function(e){return e.id===id});if(i>-1){s.entries[i]=Object.assign({},s.entries[i],data);store.set('strength',s)}}
function delStr(id){var s=store.get('strength')||{entries:[]};s.entries=s.entries.filter(function(e){return e.id!==id});store.set('strength',s)}

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
  CARDIO_TYPES.forEach(t=>{const b=document.createElement('button');b.className='car-type'+(t.id==='run'?' selected':'');b.textContent=t.emoji+' '+t.name;b.dataset.ct=t.id
    b.addEventListener('click',()=>{ct.querySelectorAll('.car-type').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');_carSelType=t.id
      document.getElementById('carDistLabel').textContent=t.hasDist?'km':'无'
      if(!t.hasDist){_carDist=0;document.getElementById('carDistVal').textContent='0'}
    });ct.appendChild(b)})

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

  switch(id){
    case 'themeToggle':toggleTheme();return;
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
    case 'wtSubmit':{
      const w=parseFloat(document.getElementById('wtInput').value)
      const note=document.getElementById('wtNote').value.trim()
      addWt({date:today(),weight:w,note})
      document.getElementById('wtNote').value=''
      toast('体重已记录 ⚖️','s');renderWtList();renderChart();return}
    case 'battleClose':_battle.done=true;if(_battleTimer)clearTimeout(_battleTimer);_battleRunning=false
      document.getElementById('battleOverlay').classList.remove('open');renderGame();return;
    case 'shareClose':hideShare();return;
    case 'shareSave':toast('长按或截图保存分享卡片 📸','s');return;
  }

  if(el.classList.contains('speed-btn')&&el.dataset.speed){
    document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'))
    el.classList.add('active');_battleSpeed=parseInt(el.dataset.speed);return
  }

  if(act==='startPlan'){startStrPlan(el.dataset.pid);return}
  if(act==='delPlan'){
    if(confirm('确定删除这个计划？')){savePlans(getPlans().filter(p=>p.id!==el.dataset.pid));renderStr()}
    return}
  if(act==='peExEdit'){_peTempIdx=parseInt(el.dataset.idx);showPeExForm(_peTempIdx);return}

  if(id==='resetGameBtn'){
    if(confirm('确定重置所有挑战进度？此操作不可撤销')){
      var g=getGame();g.cleared=[];g.current='1-1';g.attempts={};setGame(g);renderGame()
      toast('挑战进度已重置','s')
    }
    return}

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
      +'💡 每200kg容量=+1攻击, 每60分钟=+1防御<br>'
      +(info.penalty>0?'⚠️ 本周训练不足3天, 属性降低 '+info.penalty+'%<br>':'✅ 每周训练3天以上属性正常<br>')+'</div></div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>'
    document.body.appendChild(modal)
    document.getElementById('attrClose').addEventListener('click',function(){modal.remove()})
    modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()})
    return}

  if(id==='exportDataBtn'){exportData();return}
  if(id==='importDataBtn'){importData();return}

  if(id==='strNewPlan'){openPlanEditor(null);return}

  if(id==='peSave'){
    var pName=document.getElementById('peName').value.trim()
    if(!pName){toast('请输入计划名称','e');return}
    if(!_peEditing||_peEditing.exercises.length===0){toast('请至少添加一个动作','e');return}
    if(_peEditId){
      var existing=getPlans().find(function(x){return x.id===_peEditId})
      if(existing){existing.name=pName;existing.exercises=_peEditing.exercises;savePlans(getPlans());renderStr();toast('计划已更新','s')}
    }else{
      var pl=getPlans();pl.push({id:uid(),name:pName,exercises:_peEditing.exercises,createdAt:Date.now()});savePlans(pl);renderStr();toast('新计划已创建','s')
    }
    document.getElementById('peModal')?.remove();return}
  if(id==='peCancel'||id==='peClose'){document.getElementById('peModal')?.remove();return}
  if(id==='peAddEx'){
    _peTempEx={exercise:'',weight:7,targetReps:12,restSeconds:60}
    showPeExForm(null);return}
  if(id==='peExConfirm'){
    var exName=document.getElementById('peExName').value.trim()
    if(!exName){toast('请输入动作名称','e');return}
    var exWeight=parseFloat(document.getElementById('peExWeight').textContent)
    var exReps=parseInt(document.getElementById('peExReps').textContent)
    var exRest=parseInt(document.getElementById('peExRest').textContent)
    if(_peTempIdx!==null){_peEditing.exercises[_peTempIdx]={exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest}}
    else{_peEditing.exercises.push({exercise:exName,weight:exWeight,targetReps:exReps,restSeconds:exRest})}
    document.getElementById('peExModal')?.remove();renderPeList()
    return}
  if(id==='peExCancel'){document.getElementById('peExModal')?.remove();return}
  if(id==='peExWDown'){var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.max(1,v-1);return}
  if(id==='peExWUp'){var v=parseFloat(document.getElementById('peExWeight').textContent);document.getElementById('peExWeight').textContent=Math.min(50,v+1);return}
  if(id==='peExRDown'){var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.max(1,v-1);return}
  if(id==='peExRUp'){var v=parseInt(document.getElementById('peExReps').textContent);document.getElementById('peExReps').textContent=Math.min(999,v+1);return}
  if(id==='peExSDown'){var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.max(0,v-15);return}
  if(id==='peExSUp'){var v=parseInt(document.getElementById('peExRest').textContent);document.getElementById('peExRest').textContent=Math.min(300,v+15);return}
  if(act==='peExDel'){
    _peEditing.exercises.splice(parseInt(el.dataset.idx),1);renderPeList();return}

  if(act==='strEdit'){
    const e=(store.get('strength')||{entries:[]}).entries.find(x=>x.id===el.dataset.id);if(!e)return
    openStrEdit(e);return}
  if(act==='strDel'){
    if(confirm('确定删除这条记录？')){delStr(el.dataset.id);renderStr();toast('已删除','s')};return}
  if(act==='carDel'){
    if(confirm('确定删除？')){delCar(el.dataset.id);renderCar();toast('已删除','s')};return}

  if(el.classList.contains('modal-overlay')){el.classList.remove('open')}

  if(st&&el.classList.contains('sp-btn')){
    const dir=el.dataset.d;const isTgt=st==='strTgt'
    const vid=isTgt?'strTgtVal':'strActVal'
    const v=document.getElementById(vid);let n=parseInt(v.textContent,10)
    n=dir==='+'?Math.min(n+1,999):Math.max(n-1,0);v.textContent=n;return
  }
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

  /* ============================================
     DATA LAYER
     ============================================ */
  const STORAGE_KEY  = 'dumbbell-tracker-v1';
  const PLANS_KEY    = 'dumbbell-tracker-plans-v1';
  const THEME_KEY    = 'dumbbell-tracker-theme';
  const COMMON_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25];
  const REST_OPTIONS = [0, 15, 30, 45, 60, 90, 120, 180];
  const SYNC_URL = '/api/data';
  let _syncTimer = null;

  const EXERCISE_SUGGESTIONS = [
    '二头弯举','肩推','深蹲','卧推','划船','硬拉','侧平举','前平举',
    '锤式弯举','俯身飞鸟','颈后臂屈伸','俯身臂屈伸','直立划船','推举',
    '阿诺德推举','哑铃飞鸟','哑铃耸肩','弓步蹲','保加利亚深蹲','站姿提踵'
  ];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  function todayStr() {
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function toDateStr(date) {
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  }
  function parseDate(str) {
    const [y,m,d]=str.split('-').map(Number);
    return new Date(y,m-1,d);
  }
  function formatDisplay(dateStr) {
    const d=parseDate(dateStr);
    const wd=['周日','周一','周二','周三','周四','周五','周六'];
    const isToday=dateStr===todayStr();
    return { main:(d.getMonth()+1)+'月'+d.getDate()+'日', sub:isToday ? wd[d.getDay()]+' · 今天' : wd[d.getDay()] };
  }

  // ---- Entries ----
  let _entries=loadEntries();
  function loadEntries() {
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){ const d=JSON.parse(raw); if(d&&Array.isArray(d.entries)) return d.entries; }
    }catch(_){}
    return [];
  }
  function saveEntries() {
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,entries:_entries}));
    scheduleSync();
  }
  function getEntries(dateStr) { return _entries.filter(e=>e.date===dateStr).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)); }
  function addEntry(entry) { entry.id=uid(); entry.createdAt=Date.now(); _entries.push(entry); saveEntries(); return entry; }
  function updateEntry(id,data) {
    const idx=_entries.findIndex(e=>e.id===id); if(idx===-1) return null;
    _entries[idx]={..._entries[idx],...data,updatedAt:Date.now()}; saveEntries(); return _entries[idx];
  }
  function deleteEntry(id) { _entries=_entries.filter(e=>e.id!==id); saveEntries(); }
  function getAllDates() { return [...new Set(_entries.map(e=>e.date))].sort(); }
  function getStreak() {
    const dates=getAllDates(); if(!dates.length) return 0;
    const set=new Set(dates); let count=0, d=new Date();
    while(true){
      const s=toDateStr(d);
      if(set.has(s)){ count++; d.setDate(d.getDate()-1); }
      else{ if(count===0){ d.setDate(d.getDate()-1); continue; } break; }
    }
    return count;
  }
  function getWeekEntries() {
    const now=new Date(), dow=now.getDay();
    const mon=new Date(now); mon.setDate(now.getDate()+(dow===0?-6:1-dow));
    return _entries.filter(e=>e.date>=toDateStr(mon));
  }

  // ---- Plans ----
  let _plans=loadPlans();
  function loadPlans() {
    try {
      const raw=localStorage.getItem(PLANS_KEY);
      if(raw){ const d=JSON.parse(raw); if(d&&Array.isArray(d.plans)) return d.plans; }
    }catch(_){}
    return [];
  }
  function savePlans() {
    localStorage.setItem(PLANS_KEY,JSON.stringify({version:1,plans:_plans}));
    scheduleSync();
  }
  function getPlan(id) { return _plans.find(p=>p.id===id); }
  function addPlan(plan) { plan.id=uid(); plan.createdAt=Date.now(); _plans.push(plan); savePlans(); return plan; }
  function updatePlan(id,data) {
    const idx=_plans.findIndex(p=>p.id===id); if(idx===-1) return null;
    _plans[idx]={..._plans[idx],...data}; savePlans(); return _plans[idx];
  }
  function deletePlan(id) { _plans=_plans.filter(p=>p.id!==id); savePlans(); }

  /* ============================================
     SYNC — timestamp-based conflict resolution
     ============================================ */
  var _syncState = '';

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')
      +' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  }

  function setSyncState(state, msg) {
    _syncState = state;
    var el = document.getElementById('syncIndicator');
    if (el) {
      el.className = 'sync-indicator';
      if (state === 'synced') { el.classList.add('synced'); el.textContent = '✓'; }
      else if (state === 'syncing') { el.classList.add('syncing'); el.textContent = '↻'; }
      else if (state === 'error') { el.classList.add('error'); el.textContent = '⚠'; }
      else { el.textContent = '🔄'; }
    }
    var st = document.getElementById('syncStatusText');
    if (st) st.textContent = msg || (state === 'synced' ? '✓ 已同步' : state === 'syncing' ? '↻ 同步中...' : state === 'error' ? '⚠ 同步失败' : '🔄 就绪');
  }

  function getSyncPayload() {
    return {
      version: 1,
      lastUpdated: Date.now(),
      entries: _entries,
      plans: _plans
    };
  }

  function pushToServer(callback) {
    setSyncState('syncing', '↻ 上传中...');
    var data = JSON.stringify(getSyncPayload());
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', SYNC_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        setSyncState('synced', '✓ 已上传');
        var tt = document.getElementById('syncTimeText');
        if (tt) tt.textContent = '上次同步: ' + formatTime(Date.now());
        if (callback) callback(true);
      } else {
        setSyncState('error', '⚠ 上传失败 (' + xhr.status + ')');
        if (callback) callback(false);
      }
    };
    xhr.onerror = function() {
      setSyncState('error', '⚠ 无法连接服务器');
      if (callback) callback(false);
    };
    xhr.send(data);
  }

  function loadFromServer(callback) {
    setSyncState('syncing', '↻ 下载中...');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SYNC_URL, true);
    xhr.onload = function() {
      if (xhr.status === 200 && xhr.responseText) {
        try {
          var serverData = JSON.parse(xhr.responseText);
          // Check if server has any data
          var hasServerEntries = serverData && Array.isArray(serverData.entries) && serverData.entries.length > 0;
          var hasServerPlans = serverData && Array.isArray(serverData.plans) && serverData.plans.length > 0;
          var serverTime = serverData && serverData.lastUpdated ? serverData.lastUpdated : 0;
          var localTime = Date.now();

          if (hasServerEntries || hasServerPlans) {
            // Conflict resolution: compare timestamps
            var localHasData = _entries.length > 0 || _plans.length > 0;
            if (localHasData && serverTime > 0) {
              // Both sides have data — use the newer one
              if (serverTime > localTime - 5000) {
                // Server was updated more recently (or within 5s) — load server
                applyServerData(serverData);
                setSyncState('synced', '✓ 已同步 (使用服务器数据)');
              } else {
                // Local is newer — push local
                pushToServer(function(ok) {
                  if (ok) setSyncState('synced', '✓ 已同步 (使用本地数据)');
                });
              }
            } else {
              // Only server has data, or local is empty
              applyServerData(serverData);
              setSyncState('synced', '✓ 已加载云端数据');
            }
          } else {
            // Server has no data — push local if we have any
            if (_entries.length > 0 || _plans.length > 0) {
              pushToServer();
            } else {
              setSyncState('', '🔄 就绪 (无数据)');
            }
          }
          var tt = document.getElementById('syncTimeText');
          if (tt) tt.textContent = serverTime ? '服务器: ' + formatTime(serverTime) : '';
          if (callback) callback(true);
          return;
        } catch(e) {
          setSyncState('error', '⚠ 数据解析失败');
        }
      } else if (xhr.status === 200) {
        // Empty response — server has no data yet
        if (_entries.length > 0 || _plans.length > 0) pushToServer();
        else setSyncState('', '🔄 就绪');
      } else {
        setSyncState('error', '⚠ 服务器错误 (' + xhr.status + ')');
      }
      if (callback) callback(false);
    };
    xhr.onerror = function() {
      setSyncState('error', '⚠ 无法连接服务器');
      if (callback) callback(false);
    };
    xhr.send();
  }

  function applyServerData(data) {
    var changed = false;
    if (data.entries && Array.isArray(data.entries)) {
      _entries = data.entries;
      saveEntries();
      changed = true;
    }
    if (data.plans && Array.isArray(data.plans)) {
      _plans = data.plans;
      savePlans();
      changed = true;
    }
    if (changed) {
      renderLogTab();
      renderPlans();
    }
  }

  function scheduleSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(pushToServer, 500);
  }

  // Manual sync handlers
  function manualPush() {
    pushToServer();
  }

  function manualPull() {
    loadFromServer();
  }

  // Periodic check: every 30s, pull from server and merge if newer
  var _periodicSyncTimer = null;
  function startPeriodicSync() {
    if (_periodicSyncTimer) clearInterval(_periodicSyncTimer);
    _periodicSyncTimer = setInterval(function() {
      // Don't pull if user is in workout
      var wo = document.getElementById('workoutOverlay');
      if (wo && wo.classList.contains('open')) return;
      loadFromServer();
    }, 30000);
  }

  /* ============================================
     THEME
     ============================================ */
  function getTheme() { return localStorage.getItem(THEME_KEY)||'dark'; }
  function setTheme(t) {
    const dark=t==='dark';
    document.documentElement.setAttribute('data-theme',dark?'':'light');
    document.getElementById('themeToggle').textContent=dark?'🌙':'☀️';
    localStorage.setItem(THEME_KEY,t);
  }
  function toggleTheme() { setTheme(getTheme()==='dark'?'light':'dark'); }

  /* ============================================
     TOAST & CELEBRATE
     ============================================ */
  let _toastTimer=null;
  function showToast(msg,type) {
    const c=document.getElementById('toastContainer');
    const t=document.createElement('div');
    t.className='toast'+(type?' toast--'+type:'');
    const icons={success:'✅',error:'😅',info:'💡',wo:'💪'};
    t.textContent=(icons[type]||'💪')+' '+msg;
    c.appendChild(t);
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(()=>{c.innerHTML='';},2200);
  }
  function celebrate() {
    const o=document.createElement('div'); o.className='celebrate-overlay';
    const cs=['#F97316','#22C55E','#3B82F6','#A855F7','#EAB308','#EF4444'];
    for(let i=0;i<40;i++){
      const c=document.createElement('div'); c.className='confetti';
      c.style.left=Math.random()*100+'%'; c.style.background=cs[Math.floor(Math.random()*cs.length)];
      c.style.width=(4+Math.random()*10)+'px'; c.style.height=(4+Math.random()*10)+'px';
      c.style.borderRadius=Math.random()>0.5?'50%':'2px';
      c.style.animationDuration=(1.5+Math.random()*2)+'s'; c.style.animationDelay=Math.random()*0.6+'s';
      o.appendChild(c);
    }
    document.body.appendChild(o); setTimeout(()=>o.remove(),3500);
  }

  /* ============================================
     RENDER HELPERS
     ============================================ */
  function buildWeightGrid(container,selected,onChange,compact) {
    container.innerHTML='';
    COMMON_WEIGHTS.forEach(w=>{
      const btn=document.createElement('button');
      btn.className='weight-btn'+(w===selected?' selected':'');
      if(compact) btn.style.minWidth='42px'; btn.style.height='40px'; btn.style.padding='0 12px';
      btn.textContent=w+' kg'; btn.dataset.weight=w;
      btn.dataset.selected=w===selected?'true':'false';
      container.appendChild(btn);
    });
  }

  function renderEntries(dateStr) {
    const list=document.getElementById('entriesList');
    const entries=getEntries(dateStr);
    if(!entries.length){
      list.innerHTML='<div class="empty-state"><span class="empty-state__graphic">💪</span><div class="empty-state__text">今天还没练</div><div class="empty-state__sub">点击「新增一组」或从计划开始训练</div></div>';
      return;
    }
    list.innerHTML=entries.map(e=>{
      const r=e.targetReps>0?e.actualReps/e.targetReps:0, pct=Math.min(r,1)*100;
      const done=r>=1, over=r>1;
      let sc='under',ac='under';
      if(over){sc='over';ac='over';}else if(r>=1){sc='done';ac='done';}
      const ts=e.createdAt?new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'';
      return '<div class="entry-card '+(done?'completed':'partial')+'" data-id="'+e.id+'">'
        +'<div class="entry-header"><div class="entry-exercise">'+e.exercise+'<span class="entry-weight-badge">● '+e.weight+' kg</span></div>'
        +'<div class="entry-actions"><button class="entry-action-btn entry-action-btn--edit" data-action="edit" data-id="'+e.id+'">✏️</button>'
        +'<button class="entry-action-btn entry-action-btn--delete" data-action="delete" data-id="'+e.id+'">🗑️</button></div></div>'
        +'<div class="entry-progress"><div class="entry-progress-text"><span class="entry-reps-target">目标 '+e.targetReps+' 次</span>'
        +'<span class="entry-reps-actual '+ac+'">'+e.actualReps+' 次 '+(done?(over?'🔥':'✅'):'')+'</span></div>'
        +'<div class="progress-bar"><div class="progress-fill '+sc+'" style="width:'+pct+'%"></div></div></div>'
        +(ts?'<div class="entry-time">🕐 '+ts+'</div>':'')+'</div>';
    }).join('');
  }
  let _pendingDelId=null;

  function renderHeaderStats(dateStr) {
    const entries=getEntries(dateStr);
    document.getElementById('todayDone').textContent=entries.filter(e=>e.actualReps>=e.targetReps).length;
    document.getElementById('todayTotal').textContent=entries.length;
    document.getElementById('todayReps').textContent=entries.reduce((s,e)=>s+e.actualReps,0);
    document.getElementById('todayVolume').textContent=entries.reduce((s,e)=>s+e.weight*e.actualReps,0);
    document.getElementById('streakCount').textContent=getStreak();
  }

  function renderWeekStats() {
    const grid=document.getElementById('statsGrid');
    const we=getWeekEntries();
    const total=we.length, reps=we.reduce((s,e)=>s+e.actualReps,0), vol=we.reduce((s,e)=>s+e.weight*e.actualReps,0);
    const done=we.filter(e=>e.actualReps>=e.targetReps).length, rate=total>0?Math.round(done/total*100):0;
    const ec={}; we.forEach(e=>{ec[e.exercise]=(ec[e.exercise]||0)+1;});
    const top=Object.entries(ec).sort((a,b)=>b[1]-a[1]);
    const circ=2*Math.PI*36;
    grid.innerHTML='<div class="stat-card stat-card--rate"><div class="stat-card__icon">🎯</div><div class="stat-ring">'
      +'<svg viewBox="0 0 80 80"><circle class="stat-ring__bg" cx="40" cy="40" r="36"/>'
      +'<circle class="stat-ring__fill" cx="40" cy="40" r="36" stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ-circ*rate/100)+'"/></svg>'
      +'<span class="stat-ring__text">'+rate+'%</span></div><div class="stat-card__label">完成率</div></div>'
      +'<div class="stat-card stat-card--total"><div class="stat-card__icon">💪</div><div class="stat-card__value">'+reps+'</div><div class="stat-card__label">总次数</div></div>'
      +'<div class="stat-card stat-card--volume"><div class="stat-card__icon">🏋️</div><div class="stat-card__value">'+vol+'</div><div class="stat-card__label">总容量 (kg)</div></div>'
      +'<div class="stat-card stat-card--streak"><div class="stat-card__icon">⭐</div><div class="stat-card__value">'+(top.length?top[0][0]:'—')+'</div><div class="stat-card__label">最常练</div></div>';
  }

  /* ============================================
     HEATMAP
     ============================================ */
  let _heatmapYear=new Date().getFullYear();
  let _heatmapMonth=new Date().getMonth();

  function renderHeatmap() {
    const container=document.getElementById('heatmapSection');
    if(!container) return;
    const now=new Date(_heatmapYear,_heatmapMonth);
    const year=now.getFullYear(), month=now.getMonth();
    const daysInMonth=new Date(year,month+1,0).getDate();
    const firstDay=new Date(year,month,1).getDay();
    const startOffset=(firstDay===0?6:firstDay-1);
    const today=todayStr();
    const weekDays=['一','二','三','四','五','六','日'];
    const monthNames=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    const dayData={};
    for(let d=1;d<=daysInMonth;d++){
      const dateStr=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const entries=getEntries(dateStr);
      const reps=entries.reduce((s,e)=>s+e.actualReps,0);
      dayData[d]={reps,dateStr};
    }
    const maxReps=Math.max(1,...Object.values(dayData).map(d=>d.reps));
    function getLevel(reps) {
      if(reps===0) return 0;
      const ratio=reps/maxReps;
      if(ratio<=0.1) return 1; if(ratio<=0.3) return 2; if(ratio<=0.5) return 3; if(ratio<=0.75) return 4;
      return 5;
    }
    let html='<div class="heatmap-header"><div class="heatmap-label">'+year+'年 '+monthNames[month]+'</div>'
      +'<div class="heatmap-nav">'
      +'<button class="heatmap-nav-btn" data-hmnav="prev">◀</button>'
      +'<button class="heatmap-nav-btn" data-hmnav="today">📍</button>'
      +'<button class="heatmap-nav-btn" data-hmnav="next">▶</button>'
      +'</div></div><div class="heatmap-grid">';
    weekDays.forEach(d=>{ html+='<div class="heatmap-day-header">'+d+'</div>'; });
    for(let i=0;i<startOffset;i++){ html+='<div class="heatmap-cell"></div>'; }
    for(let d=1;d<=daysInMonth;d++){
      const data=dayData[d];
      const level=getLevel(data.reps);
      const isToday=data.dateStr===today;
      const hasData=data.reps>0;
      html+='<div class="heatmap-cell'+(hasData?' has-data':'')+(isToday?' today':'')
        +'" data-level="'+level+'" data-date="'+data.dateStr+'" data-reps="'+data.reps+'">'+d+'</div>';
    }
    html+='</div><div class="heatmap-legend">'
      +'少 <div class="heatmap-legend__swatch l0"></div>'
      +'<div class="heatmap-legend__swatch l1"></div>'
      +'<div class="heatmap-legend__swatch l3"></div>'
      +'<div class="heatmap-legend__swatch l5"></div> 多</div>';
    container.innerHTML=html;
  }

  /* ============================================
     PLAN LIST RENDER
     ============================================ */
  function renderPlans() {
    const container=document.getElementById('planList');
    if(!_plans.length){
      container.innerHTML='<div class="empty-state"><span class="empty-state__graphic">📋</span><div class="empty-state__text">还没有训练计划</div><div class="empty-state__sub">点击下方「新建计划」创建第一个</div></div>';
      return;
    }
    container.innerHTML=_plans.map(p=>{
      const exTags=p.exercises.map(e=>e.exercise).slice(0,8);
      return '<div class="plan-card" data-id="'+p.id+'">'
        +'<div class="plan-card__header"><div><div class="plan-card__name">'+p.name+'</div><div class="plan-card__count">'+(p.exercises.length>1?p.exercises.length+' 组动作':'1 组动作')+'</div></div></div>'
        +'<div class="plan-card__exercises">'+exTags.map(n=>'<span class="plan-card__ex-tag">'+n+'</span>').join('')+(p.exercises.length>8?'<span class="plan-card__ex-tag">+'+ (p.exercises.length-8) +'</span>':'')+'</div>'
        +'<div class="plan-card__actions">'
        +'<button class="plan-card__btn plan-card__btn--start" data-action="start" data-id="'+p.id+'">⚡ 开始</button>'
        +'<button class="plan-card__btn plan-card__btn--edit" data-action="editplan" data-id="'+p.id+'">✏️ 编辑</button>'
        +'</div></div>';
    }).join('');
  }

  /* ============================================
     PLAN EDITOR
     ============================================ */
  let _editingPlanId=null;
  let _peExercises=[];

  function openPlanEditor(planId) {
    const plan=planId?getPlan(planId):null;
    _editingPlanId=planId||null;
    document.getElementById('pePlanName').value=plan?plan.name:'';
    _peExercises=plan?JSON.parse(JSON.stringify(plan.exercises)):[];
    renderPEList();
    document.getElementById('planEditorModal').classList.add('open');
  }

  function renderPEList() {
    const list=document.getElementById('peExList');
    if(!_peExercises.length){
      list.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem;">还没有动作，点下方添加</div>';
      return;
    }
    list.innerHTML=_peExercises.map((ex,i)=>{
      const restStr=ex.restSeconds>0?ex.restSeconds+'s 休息':'无休息';
      return '<div class="plan-ex-item"><div class="plan-ex-item__info">'
        +'<div class="plan-ex-item__name">'+(i+1)+'. '+ex.exercise+'</div>'
        +'<div class="plan-ex-item__meta">'+ex.weight+' kg x '+ex.targetReps+' 次 · '+restStr+'</div></div>'
        +'<button class="plan-ex-item__del" data-idx="'+i+'">✕</button></div>';
    }).join('');
  }

  let _peExWeight=COMMON_WEIGHTS[2], _peExReps=12, _peExRest=60;

  function openAddExModal() {
    _peExWeight=COMMON_WEIGHTS[2]; _peExReps=12; _peExRest=60;
    document.getElementById('peExName').value='';
    buildWeightGrid(document.getElementById('peExWeight'),_peExWeight,w=>_peExWeight=w,true);
    document.getElementById('peExRepsVal').textContent='12';
    const presets=document.getElementById('peExRestPresets');
    presets.innerHTML='';
    REST_OPTIONS.forEach(s=>{
      const btn=document.createElement('button');
      btn.className='rest-preset-btn'+(s===60?' selected':'');
      btn.textContent=s>0?s+'s':'无';
      presets.appendChild(btn);
    });
    document.getElementById('peExModal').classList.add('open');
  }

  /* ============================================
     WORKOUT SESSION
     ============================================ */
  let _woPlan=null;
  let _woIdx=0;
  let _woReps=12;
  let _woDone=[];
  let _woRestTimer=null;
  let _woRestRemaining=0;

  function startWorkout(planId) {
    const plan=getPlan(planId);
    if(!plan||!plan.exercises.length) return;
    _woPlan=plan; _woIdx=0; _woDone=[];
    document.getElementById('workoutOverlay').classList.add('open');
    renderWOTrack();
    showWOExercise();
  }

  function renderWOTrack() {
    const track=document.getElementById('woTrack');
    track.innerHTML=_woPlan.exercises.map((_,i)=>{
      let cls='workout-dot';
      if(i<_woIdx) cls+=' done';
      else if(i===_woIdx) cls+=' current';
      return '<div class="'+cls+'">'+(i<_woIdx?'✓':(i+1))+'</div>';
    }).join('');
  }

  function showWOExercise() {
    const ex=_woPlan.exercises[_woIdx];
    _woReps=ex.targetReps;
    document.getElementById('woTitle').textContent=_woPlan.name;
    document.getElementById('woProgress').textContent=(_woIdx+1)+'/'+_woPlan.exercises.length;
    renderWOTrack();
    const body=document.getElementById('woBody');
    body.innerHTML='<div class="workout-exercise">'
      +'<div class="workout-exercise__name">'+ex.exercise+'</div>'
      +'<div class="workout-exercise__detail"><span>'+ex.weight+' kg</span> · 目标 <span>'+ex.targetReps+'</span> 次</div>'
      +'<div class="workout-reps-display" id="woRepsDisplay">'+_woReps+'</div>'
      +'<div class="workout-reps-label">实际次数</div>'
      +'<div class="workout-stepper-wrap">'
      +'<button class="workout-stepper-btn" id="woRepsDown">−</button>'
      +'<button class="workout-stepper-btn" id="woRepsUp">+</button>'
      +'</div>'
      +'<button class="workout-done-btn" id="woCompleteBtn">✅ 完成</button>'
      +'</div>';
  }

  function woCompleteSet() {
    const ex=_woPlan.exercises[_woIdx];
    _woDone.push({
      exercise:ex.exercise, weight:ex.weight,
      targetReps:ex.targetReps, actualReps:_woReps,
      restSeconds:ex.restSeconds
    });
    if(_woIdx+1<_woPlan.exercises.length){ startRest(); }
    else { showWOSummary(); }
  }

  function startRest() {
    const ex=_woPlan.exercises[_woIdx+1];
    const rest=_woPlan.exercises[_woIdx].restSeconds||0;
    if(rest<=0){ _woIdx++; showWOExercise(); return; }
    _woRestRemaining=rest;
    const body=document.getElementById('woBody');
    body.innerHTML='<div class="workout-rest">'
      +'<div class="workout-rest__label">休息</div>'
      +'<div class="workout-rest__timer" id="woRestTimer">'+(rest<10?'0':'')+':'+(rest<10?'0'+rest:rest)+'</div>'
      +'<div class="workout-rest__next">下一组: '+ex.exercise+' · '+ex.weight+' kg · '+ex.targetReps+' 次</div>'
      +'<button class="workout-rest__skip" id="woSkipRest">跳过 →</button>'
      +'</div>';
    _woRestTimer=setInterval(()=>{
      _woRestRemaining--;
      if(_woRestRemaining<=0){
        clearInterval(_woRestTimer); _woRestTimer=null;
        _woIdx++; showWOExercise(); return;
      }
      const m=Math.floor(_woRestRemaining/60), s=_woRestRemaining%60;
      document.getElementById('woRestTimer').textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
    },1000);
  }

  function showWOSummary() {
    const body=document.getElementById('woBody');
    const totalReps=_woDone.reduce((s,d)=>s+d.actualReps,0);
    const totalVol=_woDone.reduce((s,d)=>s+d.weight*d.actualReps,0);
    const totalDone=_woDone.filter(d=>d.actualReps>=d.targetReps).length;
    body.innerHTML='<div class="workout-summary">'
      +'<div class="workout-summary__emojii">🎉</div>'
      +'<div class="workout-summary__title">训练完成！</div>'
      +'<div class="workout-summary__list">'
      +_woDone.map(d=>'<div class="workout-summary__item"><span class="workout-summary__item-name">'+d.exercise+'</span><span class="workout-summary__item-value">'+d.actualReps+' / '+d.targetReps+' 次 '+(d.actualReps>=d.targetReps?'✅':'')+'</span></div>').join('')
      +'</div>'
      +'<div class="workout-summary__total">'
      +'<div class="workout-summary__total-item"><div class="workout-summary__total-val">'+totalReps+'</div><div class="workout-summary__total-label">总次数</div></div>'
      +'<div class="workout-summary__total-item"><div class="workout-summary__total-val">'+totalVol+'</div><div class="workout-summary__total-label">总容量 (kg)</div></div>'
      +'<div class="workout-summary__total-item"><div class="workout-summary__total-val">'+totalDone+'/'+_woDone.length+'</div><div class="workout-summary__total-label">达标</div></div>'
      +'</div>'
      +'<button class="workout-done-btn" id="woFinishBtn" style="background:linear-gradient(135deg,var(--orange),var(--orange-dark))">✓ 完成并记录</button>'
      +'</div>';
    _woIdx=_woPlan.exercises.length;
    renderWOTrack();
    document.getElementById('woProgress').textContent=_woPlan.exercises.length+'/'+_woPlan.exercises.length;
  }

  /* ============================================
     EDIT MODAL (entries)
     ============================================ */
  let _editingEntry=null;
  function openEditModal(entry) {
    _editingEntry=entry;
    document.getElementById('editExercise').value=entry.exercise;
    document.getElementById('editTargetValue').textContent=entry.targetReps;
    document.getElementById('editActualValue').textContent=entry.actualReps;
    buildWeightGrid(document.getElementById('editWeightGrid'),entry.weight,w=>{_editingEntry._editWeight=w;});
    document.getElementById('editModal').classList.add('open');
  }
  function closeEditModal() { document.getElementById('editModal').classList.remove('open'); _editingEntry=null; }

  /* ============================================
     TAB SWITCHING
     ============================================ */
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id==='tab'+name.charAt(0).toUpperCase()+name.slice(1)));
    if(name==='plans') renderPlans();
    if(name==='log') renderLogTab();
  }

  function renderLogTab() {
    updateDateDisplay();
    renderEntries(currentDate);
    renderHeaderStats(currentDate);
    renderHeatmap();
    renderWeekStats();
  }

  /* ============================================
     DATE
     ============================================ */
  let currentDate=todayStr();
  function updateDateDisplay() {
    const f=formatDisplay(currentDate);
    document.getElementById('dateDisplayMain').textContent=f.main;
    document.getElementById('dateDisplaySub').textContent=f.sub;
  }

  /* ============================================
     IMPORT / EXPORT
     ============================================ */
  function exportData() {
    const data = JSON.stringify({version:2,exportedAt:new Date().toISOString(),entries:_entries,plans:_plans},null,2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dumbbell-data-' + todayStr() + '.json';
    a.click(); URL.revokeObjectURL(url);
    showToast('数据已导出 ✅','success');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data || !Array.isArray(data.entries) || !Array.isArray(data.plans)) {
            showToast('文件格式不正确','error'); return;
          }
          _entries = data.entries; _plans = data.plans;
          saveEntries(); savePlans();
          showToast('导入成功！共 ' + (data.entries.length+data.plans.length) + ' 条记录 📥','success');
          renderLogTab(); renderPlans();
          switchTab('plans');
        } catch(err) { showToast('文件解析失败: ' + err.message,'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ============================================
     GLOBAL ONCLICK HANDLERS
     ============================================ */
  function toggleAddForm() {
    const card=document.getElementById('addCard');
    addFormOpen=!addFormOpen;
    card.classList.toggle('open',addFormOpen);
    document.getElementById('addToggleBtn').textContent=addFormOpen?'✖ 收起':'＋ 新增一组';
    if(addFormOpen) document.getElementById('exerciseInput').focus();
  }

  function createNewPlan() { openPlanEditor(null); }
  function confirmDeleteEntry(id) {
    _pendingDelId=id;
    document.getElementById('delText').textContent='确定删除这条记录？';
    document.getElementById('delSub').textContent='删除后无法恢复';
    document.getElementById('deleteConfirm').classList.add('open');
  }

  /* ============================================
     STATE
     ============================================ */
  let addFormOpen=false;
  let selectedWeight=COMMON_WEIGHTS[2];

  /* ============================================
     INIT
     ============================================ */
  function init() {
    document.documentElement.classList.add('no-transition');
    setTheme(getTheme());
    requestAnimationFrame(()=>document.documentElement.classList.remove('no-transition'));

    currentDate=todayStr();

    const sugContainer=document.getElementById('suggestionBtns');
    if(sugContainer){
      EXERCISE_SUGGESTIONS.forEach(n=>{
        const btn=document.createElement('button'); btn.textContent=n;
        btn.dataset.suggestion='1';
        sugContainer.appendChild(btn);
      });
    }
    const datalist=document.getElementById('exerciseList');
    if(datalist){
      EXERCISE_SUGGESTIONS.forEach(n=>{ const o=document.createElement('option'); o.value=n; datalist.appendChild(o); });
    }

    const wg=document.getElementById('weightGrid');
    if(wg) buildWeightGrid(wg,selectedWeight,w=>selectedWeight=w);

    renderLogTab();
    renderPlans();

    // Initial sync + start periodic check
    setTimeout(loadFromServer, 1000);
    startPeriodicSync();
  }

  /* ============================================
     EVENT DELEGATION
     ============================================ */
  document.addEventListener('click',function(e){
    const el=e.target.closest('button,[id],[data-action],[data-stepper],[data-idx],[data-hmnav],[data-date],[data-suggestion]');
    if(!el) return;

    const id=el.id;
    const action=el.dataset.action;

    if(el.classList.contains('tab-btn')){ switchTab(el.dataset.tab); return; }

    switch(id){
      case 'themeToggle': toggleTheme(); return;
      case 'prevDay':{ const d=parseDate(currentDate); d.setDate(d.getDate()-1); currentDate=toDateStr(d); renderLogTab(); return; }
      case 'nextDay':{ const d=parseDate(currentDate); d.setDate(d.getDate()+1); currentDate=toDateStr(d); renderLogTab(); return; }
      case 'goToday': currentDate=todayStr(); renderLogTab(); return;
      case 'submitBtn': handleSubmitEntry(); return;
      case 'editSave': handleEditSave(); return;
      case 'editCancel': closeEditModal(); return;
      case 'deleteYes': handleDeleteConfirm(); return;
      case 'deleteNo': _pendingDelId=null; document.getElementById('deleteConfirm').classList.remove('open'); return;
      case 'peCancel': document.getElementById('planEditorModal').classList.remove('open'); return;
      case 'peAddEx': openAddExModal(); return;
      case 'peSave': handlePlanSave(); return;
      case 'peDelete': handlePlanDelete(); return;
      case 'peExCancel': document.getElementById('peExModal').classList.remove('open'); return;
      case 'peExConfirm': handleAddExConfirm(); return;
      case 'peExRepsDown': _peExReps=Math.max(0,_peExReps-1); document.getElementById('peExRepsVal').textContent=_peExReps; return;
      case 'peExRepsUp': _peExReps=Math.min(999,_peExReps+1); document.getElementById('peExRepsVal').textContent=_peExReps; return;
      case 'woClose': if(_woRestTimer){clearInterval(_woRestTimer);_woRestTimer=null;} document.getElementById('workoutOverlay').classList.remove('open'); return;
      case 'syncPushBtn': pushToServer(); return;
      case 'syncPullBtn': loadFromServer(); return;
    }

    // Plan exercise delete
    if(el.classList.contains('plan-ex-item__del')){
      _peExercises.splice(parseInt(el.dataset.idx),1);
      renderPEList(); return;
    }

    // Stepper buttons
    if(el.dataset.stepper){
      const type=el.dataset.stepper, dir=el.dataset.dir;
      const valId=type==='target'?'targetValue':type==='actual'?'actualValue':
                    type==='edit-target'?'editTargetValue':
                    type==='edit-actual'?'editActualValue':null;
      if(valId){
        const el2=document.getElementById(valId);
        let v=parseInt(el2.textContent,10);
        v=dir==='+'?Math.min(v+1,999):Math.max(v-1,0);
        el2.textContent=v;
      }
      return;
    }

    // Weight buttons
    if(el.classList.contains('weight-btn')){
      const parent=el.parentElement;
      parent.querySelectorAll('.weight-btn').forEach(b=>b.classList.remove('selected'));
      el.classList.add('selected');
      const weight=parseInt(el.dataset.weight,10);
      if(parent.id==='weightGrid') selectedWeight=weight;
      if(parent.id==='editWeightGrid'&&_editingEntry) _editingEntry._editWeight=weight;
      if(parent.id==='peExWeight') _peExWeight=weight;
      return;
    }

    // Exercise suggestion buttons
    if(el.dataset.suggestion){
      document.getElementById('exerciseInput').value=el.textContent; return;
    }

    // Rest preset buttons
    if(el.classList.contains('rest-preset-btn')){
      el.parentElement.querySelectorAll('.rest-preset-btn').forEach(b=>b.classList.remove('selected'));
      el.classList.add('selected');
      _peExRest=parseInt(el.textContent,10)||0;
      return;
    }

    // Heatmap navigation
    if(el.dataset.hmnav){
      const dir=el.dataset.hmnav;
      if(dir==='prev'){ _heatmapMonth--; if(_heatmapMonth<0){ _heatmapMonth=11; _heatmapYear--; } }
      else if(dir==='next'){ _heatmapMonth++; if(_heatmapMonth>11){ _heatmapMonth=0; _heatmapYear++; } }
      else { const n=new Date(); _heatmapYear=n.getFullYear(); _heatmapMonth=n.getMonth(); }
      renderHeatmap(); return;
    }

    // Heatmap cell click
    if(el.classList.contains('heatmap-cell')&&el.dataset.date){
      currentDate=el.dataset.date; switchTab('log'); return;
    }

    // Dynamic actions
    if(action==='edit'){
      const e=_entries.find(x=>x.id===el.dataset.id);
      if(e) openEditModal(e); return;
    }
    if(action==='delete'){
      _pendingDelId=el.dataset.id;
      document.getElementById('delText').textContent='确定删除这条记录？';
      document.getElementById('delSub').textContent='删除后无法恢复';
      document.getElementById('deleteConfirm').classList.add('open'); return;
    }
    if(action==='start'){ startWorkout(el.dataset.id); return; }
    if(action==='editplan'){ openPlanEditor(el.dataset.id); return; }

    // Workout
    if(id==='woRepsDown'){ _woReps=Math.max(0,_woReps-1); document.getElementById('woRepsDisplay').textContent=_woReps; return; }
    if(id==='woRepsUp'){ _woReps=Math.min(999,_woReps+1); document.getElementById('woRepsDisplay').textContent=_woReps; return; }
    if(id==='woCompleteBtn'){ woCompleteSet(); return; }
    if(id==='woSkipRest'){
      if(_woRestTimer){clearInterval(_woRestTimer);_woRestTimer=null;}
      _woIdx++; showWOExercise(); return;
    }
    if(id==='woFinishBtn'){ handleWoFinish(); return; }

    // Modal overlay close
    if(el.classList.contains('modal-overlay')||el.classList.contains('delete-confirm')){
      el.classList.remove('open');
      if(el.id==='editModal') _editingEntry=null; return;
    }
  });

  /* ===== Handlers ===== */
  function handleSubmitEntry(){
    const exercise=document.getElementById('exerciseInput').value.trim();
    if(!exercise){ showToast('请输入动作名称','error'); return; }
    const target=parseInt(document.getElementById('targetValue').textContent,10);
    const actual=parseInt(document.getElementById('actualValue').textContent,10);
    addEntry({ date:currentDate, exercise, weight:selectedWeight, targetReps:target, actualReps:actual });
    document.getElementById('exerciseInput').value='';
    document.getElementById('targetValue').textContent='12';
    document.getElementById('actualValue').textContent='12';
    selectedWeight=COMMON_WEIGHTS[2];
    document.querySelectorAll('#weightGrid .weight-btn').forEach(b=>b.classList.toggle('selected',parseInt(b.dataset.weight)===selectedWeight));
    document.getElementById('addCard').classList.remove('open');
    addFormOpen=false;
    document.getElementById('addToggleBtn').textContent='＋ 新增一组';
    showToast('记录成功！继续加油 💪','success');
    const te=getEntries(currentDate);
    if(te.length&&te.every(e=>e.actualReps>=e.targetReps)) setTimeout(celebrate,300);
    renderLogTab();
  }

  function handleEditSave(){
    if(!_editingEntry) return;
    const exercise=document.getElementById('editExercise').value.trim();
    if(!exercise){ showToast('请输入动作名称','error'); return; }
    const target=parseInt(document.getElementById('editTargetValue').textContent,10);
    const actual=parseInt(document.getElementById('editActualValue').textContent,10);
    const weight=_editingEntry._editWeight||_editingEntry.weight;
    updateEntry(_editingEntry.id,{exercise,weight,targetReps:target,actualReps:actual});
    closeEditModal(); showToast('已更新 ✨','success'); renderLogTab();
  }

  function handleDeleteConfirm(){
    if(!_pendingDelId) return;
    if(typeof _pendingDelId==='string'&&_pendingDelId.startsWith('__plan__')){
      const pid=_pendingDelId.slice(8);
      deletePlan(pid);
      document.getElementById('planEditorModal').classList.remove('open');
      renderPlans();
    } else {
      deleteEntry(_pendingDelId);
      renderLogTab();
    }
    _pendingDelId=null;
    document.getElementById('deleteConfirm').classList.remove('open');
    showToast('已删除','info');
  }

  function handlePlanSave(){
    const name=document.getElementById('pePlanName').value.trim();
    if(!name){ showToast('请输入计划名称','error'); return; }
    if(!_peExercises.length){ showToast('请至少添加一个动作','error'); return; }
    if(_editingPlanId){
      updatePlan(_editingPlanId,{name,exercises:_peExercises});
      showToast('计划已更新 ✨','success');
    } else {
      addPlan({name,exercises:_peExercises});
      showToast('新计划已创建 📋','success');
    }
    document.getElementById('planEditorModal').classList.remove('open');
    renderPlans();
  }

  function handlePlanDelete(){
    if(!_editingPlanId) return;
    document.getElementById('delText').textContent='确定删除这个计划？';
    document.getElementById('delSub').textContent='删除后无法恢复';
    _pendingDelId='__plan__'+_editingPlanId;
    document.getElementById('deleteConfirm').classList.add('open');
  }

  function handleAddExConfirm(){
    const name=document.getElementById('peExName').value.trim();
    if(!name){ showToast('请输入动作名称','error'); return; }
    _peExercises.push({ exercise:name, weight:_peExWeight, targetReps:_peExReps, restSeconds:_peExRest });
    document.getElementById('peExModal').classList.remove('open');
    renderPEList();
  }

  function handleWoFinish(){
    const today=todayStr();
    _woDone.forEach(d=>{
      addEntry({ date:today, exercise:d.exercise, weight:d.weight, targetReps:d.targetReps, actualReps:d.actualReps });
    });
    document.getElementById('workoutOverlay').classList.remove('open');
    showToast('训练记录已保存！💪','success');
    const te=getEntries(today);
    if(te.length&&te.every(e=>e.actualReps>=e.targetReps)) setTimeout(celebrate,300);
    renderLogTab(); renderPlans();
  }

  // Boot
  init();

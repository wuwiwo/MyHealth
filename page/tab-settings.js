/* ============================================
   MyHealth — Tab: Settings (Library/Plans/Game/Data)
   ============================================ */

var _settingsSub='library';

function renderSettings(){
  renderExLibrary();
  renderSettingsPlans();
  renderSettingsGame();
  renderSettingsData();
}

/* ========== SUB-TAB: EXERCISE LIBRARY ========== */
function renderExLibrary(){
  var el=document.getElementById('subLibrary');if(!el)return
  var list=getExercises();
  var strength=list.filter(function(ex){return ex.type==='strength'});
  var cardio=list.filter(function(ex){return ex.type==='cardio'});

  var h='<div class="section-hdr">🏋️ 力量动作 <span style="font-size:.65rem;color:var(--text3);font-weight:400">('+strength.length+')</span></div>';
  if(strength.length){
    h+='<div class="ex-lib-list">';
    strength.forEach(function(ex){
      var ratioLabel=ex.ratio!=null?ex.ratio+'%':'100%';
      h+=exCardHtml(ex,'💪 '+ratioLabel);
    });
    h+='</div>';
  }else{
    h+='<div class="empty"><span class="empty-e">🏋️</span><div class="empty-t">还没有力量动作</div></div>';
  }

  h+='<div class="section-hdr" style="margin-top:16px">🏃 有氧类型 <span style="font-size:.65rem;color:var(--text3);font-weight:400">('+cardio.length+')</span></div>';
  if(cardio.length){
    h+='<div class="ex-lib-list">';
    cardio.forEach(function(ex){
      var intLabel=INTENSITY_LEVELS.find(function(l){return l.id===ex.intensity})||{name:'中',emoji:'🟡'};
      var distLabel=ex.hasDist?'📏':'—';
      h+=exCardHtml(ex,intLabel.emoji+' '+distLabel,true);
    });
    h+='</div>';
  }else{
    h+='<div class="empty"><span class="empty-e">🏃</span><div class="empty-t">还没有有氧类型</div></div>';
  }

  h+='<button class="add-btn" id="exNewBtn" style="margin-top:12px">＋ 新建动作</button>';
  h+='<div style="text-align:center;margin-top:6px;font-size:.7rem;color:var(--text3)">力量 ratio 影响容量计算（100%=满容量）</div>';
  el.innerHTML=h;
  // Wire description toggle
  el.querySelectorAll('[data-a="exToggle"]').forEach(function(b){
    b.addEventListener('click',function(){
      var detail=this.parentNode.parentNode.querySelector('.ex-desc-full');
      if(detail){detail.style.display=detail.style.display==='none'?'block':'none'}
    });
  });
}

function exCardHtml(ex,badge,isCardio){
  var namePrefix=isCardio?(ex.emoji||'🏃')+' ':'';
  var h='<div class="ec"><div class="ec-hdr"><div class="ec-ex">'+namePrefix+ex.name+'<span class="ec-wt">'+badge+'</span></div><div class="ec-actions"><button class="ec-act" data-a="exEdit" data-id="'+ex.id+'">✏️</button><button class="ec-act" data-a="exDel" data-id="'+ex.id+'">🗑️</button></div></div>';
  if(ex.description){
    var first=mdFirstLine(ex.description);
    h+='<div style="margin-top:6px;font-size:.72rem;color:var(--text2);cursor:pointer" data-a="exToggle">'+first+'<span style="color:var(--text3);font-size:.65rem"> …展开</span></div>';
    h+='<div class="ex-desc-full" style="display:none;margin-top:6px;padding:8px 10px;background:var(--bg);border-radius:var(--rs);border:1px solid var(--bd)">'+renderMd(ex.description)+'</div>';
  }
  h+='</div>';
  return h;
}

function showExEditor(editId){
  var list=getExercises();
  var ex=editId?list.find(function(x){return x.id===editId}):null;
  var isEdit=!!ex;
  if(!ex)ex={id:'',name:'',type:'strength',ratio:100,intensity:2,emoji:'🏃',hasDist:false,description:''};

  var modal=document.createElement('div');modal.className='modal-overlay open';modal.id='exModal';
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(isEdit?'✏️ 编辑动作':'＋ 新建动作')+'</div>';
  h+='<div class="fg"><label class="fl">类型</label><div class="car-types" id="exTypeSel">';
  h+='<button class="car-type'+(ex.type==='strength'?' selected':'')+'" data-extype="strength">💪 力量</button>';
  h+='<button class="car-type'+(ex.type==='cardio'?' selected':'')+'" data-extype="cardio">🏃 有氧</button>';
  h+='</div></div>';
  h+='<div class="fg"><label class="fl">名称</label><input class="fi" id="exName" value="'+ex.name+'" placeholder="如: 弯举"></div>';
  h+='<div class="fg" id="exRatioFg"'+(ex.type==='strength'?'':' style="display:none"')+'><label class="fl">力量比值 (ratio %)</label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="exRatioD">−</button><span class="sp-val" id="exRatioVal">'+(ex.ratio!=null?ex.ratio:100)+'</span><button class="sp-btn" id="exRatioU">+</button></div></div>';
  h+='<div class="fg" id="exEmojiFg"'+(ex.type==='cardio'?'':' style="display:none"')+'><label class="fl">图标 emoji</label><input class="fi" id="exEmoji" value="'+(ex.emoji||'🏃')+'" placeholder="🏃"></div>';
  h+='<div class="fg" id="exIntensityFg"'+(ex.type==='cardio'?'':' style="display:none"')+'><label class="fl">默认强度</label><div class="car-types" id="exIntensitySel"></div></div>';
  h+='<div class="fg" id="exHasDistFg"'+(ex.type==='cardio'?'':' style="display:none"')+' style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="exHasDist"'+(ex.hasDist?' checked':'')+'><label class="fl" style="margin:0">有距离统计</label></div>';
  h+='<div class="fg"><label class="fl">动作描述 <span style="font-weight:400;text-transform:none">（支持 **加粗** #标题 `代码` -列表）</span></label><textarea class="fi" id="exDesc" rows="4" style="resize:vertical;font-size:.78rem;line-height:1.6" placeholder="可选：记录动作要领、注意事项...">'+(ex.description||'').replace(/</g,'&lt;')+'</textarea></div>';
  h+='<div class="modal-actions"><button class="m-btn-cancel" id="exCancel">取消</button><button class="m-btn-save" id="exSave">💾 保存</button></div></div>';
  modal.innerHTML=h;document.body.appendChild(modal);

  var curType=ex.type;
  var curIntensity=ex.intensity||2;
  modal.querySelectorAll('[data-extype]').forEach(function(b){
    b.addEventListener('click',function(){
      curType=b.dataset.extype;
      modal.querySelectorAll('#exTypeSel .car-type').forEach(function(x){x.classList.toggle('selected',x.dataset.extype===curType)});
      document.getElementById('exRatioFg').style.display=curType==='strength'?'':'none';
      document.getElementById('exEmojiFg').style.display=curType==='cardio'?'':'none';
      document.getElementById('exIntensityFg').style.display=curType==='cardio'?'':'none';
      document.getElementById('exHasDistFg').style.display=curType==='cardio'?'flex':'none';
    });
  });
  var intEl=document.getElementById('exIntensitySel');
  INTENSITY_LEVELS.forEach(function(lv){
    var b=document.createElement('button');b.className='car-type'+(lv.id===curIntensity?' selected':'');
    b.textContent=lv.emoji+' '+lv.name;b.dataset.exint=lv.id;
    b.addEventListener('click',function(){curIntensity=parseInt(b.dataset.exint);intEl.querySelectorAll('.car-type').forEach(function(x){x.classList.toggle('selected',parseInt(x.dataset.exint)===curIntensity)})});
    intEl.appendChild(b);
  });
  document.getElementById('exRatioD').addEventListener('click',function(){var v=parseInt(document.getElementById('exRatioVal').textContent);document.getElementById('exRatioVal').textContent=Math.max(1,v-5)});
  document.getElementById('exRatioU').addEventListener('click',function(){var v=parseInt(document.getElementById('exRatioVal').textContent);document.getElementById('exRatioVal').textContent=Math.min(100,v+5)});
  document.getElementById('exCancel').addEventListener('click',function(){modal.remove()});
  document.getElementById('exSave').addEventListener('click',function(){
    var name=document.getElementById('exName').value.trim();
    if(!name){toast('请输入名称','e');return}
    var desc=document.getElementById('exDesc').value.trim();
    var list=getExercises();
    if(curType==='strength'){
      var ratio=parseInt(document.getElementById('exRatioVal').textContent);
      var newEx={id:isEdit?editId:name,name:name,type:'strength',ratio:ratio,intensity:null,emoji:null,hasDist:false,description:desc};
    }else{
      var emoji=document.getElementById('exEmoji').value.trim()||'🏃';
      var hasDist=document.getElementById('exHasDist').checked;
      var newEx={id:isEdit?editId:(name),name:name,type:'cardio',ratio:null,intensity:curIntensity,emoji:emoji,hasDist:hasDist,description:desc};
    }
    if(isEdit){
      var idx=list.findIndex(function(x){return x.id===editId});
      if(idx>-1)list[idx]=newEx;
    }else{
      if(list.some(function(x){return x.id===newEx.id})){toast('已存在同名动作','e');return}
      list.push(newEx);
    }
    saveExercises(list);
    modal.remove();
    renderExLibrary();
    if(typeof initCardioTypes==='function')initCardioTypes();
    toast(isEdit?'已更新':'已添加「'+name+'」','s');
  });
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()});
}

function delExercise(id){
  var list=getExercises().filter(function(x){return x.id!==id});
  saveExercises(list);
  renderExLibrary();
  if(typeof initCardioTypes==='function')initCardioTypes();
  toast('已删除','s');
}

/* ========== SUB-TAB: PLANS ========== */
function renderSettingsPlans(){
  var el=document.getElementById('subPlans');if(!el)return
  var strPlans=getPlans();
  var carPlans=getCardioPlans();
  var h='<div class="section-hdr">🏋️ 力量计划 <span style="font-size:.65rem;color:var(--text3);font-weight:400">('+strPlans.length+')</span></div>';
  if(strPlans.length){
    strPlans.forEach(function(p){
      var tags=p.exercises.map(function(e){return e.exercise}).slice(0,5).join('、');
      h+='<div class="ec"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="setEditStrPlan" data-pid="'+p.id+'">✏️</button><button class="ec-act" data-a="setDelStrPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="font-size:.7rem;color:var(--text2)">'+tags+'</div></div></div>';
    });
  }else{
    h+='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有力量计划</div></div>';
  }
  h+='<div class="section-hdr" style="margin-top:16px">🏃 有氧计划 <span style="font-size:.65rem;color:var(--text3);font-weight:400">('+carPlans.length+')</span></div>';
  if(carPlans.length){
    carPlans.forEach(function(p){
      var tags=p.segments.map(function(s){
        var ct=getAllCardioTypes().find(function(x){return x.id===s.type})||{emoji:'🏃',name:s.type};
        return ct.emoji+s.duration+'min';
      }).slice(0,6);
      h+='<div class="ec"><div class="ec-hdr"><div class="ec-ex">📋 '+p.name+'</div><div class="ec-actions"><button class="ec-act" data-a="setEditCarPlan" data-pid="'+p.id+'">✏️</button><button class="ec-act" data-a="setDelCarPlan" data-pid="'+p.id+'">🗑️</button></div></div><div class="ec-prog"><div style="display:flex;gap:4px;flex-wrap:wrap">'+tags.map(function(n){return '<span style="font-size:.7rem;background:var(--bg);color:var(--text2);padding:1px 8px;border-radius:var(--rp);border:1px solid var(--bd)">'+n+'</span>'}).join('')+'</div></div></div>';
    });
  }else{
    h+='<div class="empty"><span class="empty-e">📋</span><div class="empty-t">还没有有氧计划</div></div>';
  }
  h+='<div style="text-align:center;margin-top:8px;font-size:.7rem;color:var(--text3)">计划在训练 Tab 中创建和执行</div>';
  el.innerHTML=h;
}

/* ========== SUB-TAB: GAME MANAGEMENT ========== */
function renderSettingsGame(){
  var el=document.getElementById('subGame');if(!el)return
  var g=getGame();
  var recs=store.get('records')||{};
  var h='<div class="section-hdr">📖 属性计算</div>';
  h+='<button class="sb-btn" id="setAttrInfoBtn" style="background:var(--bg);color:var(--text);border:1px solid var(--bd);margin-bottom:16px">📖 查看属性计算方式</button>';
  h+='<div class="section-hdr">📜 属性变更日志</div>';
  h+='<button class="sb-btn" id="setAttrLogBtn" style="background:var(--bg);color:var(--text);border:1px solid var(--bd)">📜 查看日志</button>';
  h+='<div class="section-hdr" style="margin-top:16px">🏆 历史最佳记录</div>';
  h+='<div class="stats-grid">';
  if(recs.maxCleared)h+='<div class="sc"><div class="sc-v" style="font-size:.9rem">📖 '+recs.maxCleared+'</div><div class="sc-l">最高关卡</div></div>';
  if(recs.maxAtk)h+='<div class="sc sc-rate"><div class="sc-v">⚔️ '+recs.maxAtk+'</div><div class="sc-l">最高攻击</div></div>';
  if(recs.maxDef)h+='<div class="sc sc-total"><div class="sc-v">🛡️ '+recs.maxDef+'</div><div class="sc-l">最高防御</div></div>';
  if(recs.maxHp)h+='<div class="sc sc-vol"><div class="sc-v">❤️ '+recs.maxHp+'</div><div class="sc-l">最高生命</div></div>';
  h+='</div>';
  h+='<div class="section-hdr" style="margin-top:16px">↺ 重置挑战进度</div>';
  h+='<button class="sb-btn" id="setResetGameBtn" style="background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.3)">↺ 重置挑战进度（已通关 '+g.cleared.length+' 关）</button>';
  el.innerHTML=h;
}

/* ========== SUB-TAB: DATA MANAGEMENT ========== */
function renderSettingsData(){
  var el=document.getElementById('subData');if(!el)return
  var h='<div class="section-hdr">📂 数据管理</div>';
  h+='<div style="display:flex;gap:8px;margin-bottom:12px">';
  h+='<button class="plan-card__btn plan-card__btn--edit" style="flex:1;padding:12px;" id="exportDataBtn">📤 导出数据</button>';
  h+='<button class="plan-card__btn plan-card__btn--edit" style="flex:1;padding:12px;" id="importDataBtn">📥 导入数据</button>';
  h+='</div>';
  h+='<button class="sb-btn" id="syncDataBtn" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--bd)">🔄 手动云同步</button>';
  h+='<div style="text-align:center;margin-top:6px;font-size:.7rem;color:var(--text3)">用于手动备份或跨设备转移数据</div>';
  el.innerHTML=h;
}

/* ========== SETTINGS EVENT HANDLER ========== */
function onSettingsEvent(el,id,act){
  if(id==='exNewBtn'){showExEditor(null);return true}
  if(act==='exEdit'){showExEditor(el.dataset.id);return true}
  if(act==='exDel'){
    if(confirm('确定删除这个动作？历史记录不受影响但不再出现在下拉列表')){delExercise(el.dataset.id)}
    return true}
  if(act==='setEditStrPlan'){openPlanEditor(el.dataset.pid);return true}
  if(act==='setDelStrPlan'){
    if(confirm('确定删除这个计划？')){savePlans(getPlans().filter(function(p){return p.id!==el.dataset.pid}));renderSettingsPlans();renderStr()}
    return true}
  if(act==='setEditCarPlan'){openCardioPlanEditor(el.dataset.pid);return true}
  if(act==='setDelCarPlan'){
    if(confirm('确定删除这个计划？')){saveCardioPlans(getCardioPlans().filter(function(p){return p.id!==el.dataset.pid}));renderSettingsPlans();renderCar()}
    return true}
  if(id==='setAttrLogBtn'){showAttrLog();return true}
  if(id==='setAttrInfoBtn'){showAttrInfo();return true}
  if(id==='setResetGameBtn'){
    if(confirm('确定重置所有挑战进度？此操作不可撤销')){
      var g=getGame();g.cleared=[];g.current='1-1';g.attempts={};setGame(g);renderSettingsGame();renderGame();
      toast('挑战进度已重置','s');
    }
    return true}
  if(id==='exportDataBtn'){exportData();return true}
  if(id==='importDataBtn'){importData();return true}
  if(id==='syncDataBtn'){showSyncDialog();return true}
  return false;
}

/* ========== ATTRIBUTE CALC INFO (moved from tab-game.js) ========== */
function showAttrInfo(){
  var info=_attrCalcInfo||{atk:'暂无数据',def:'暂无数据',hp:'暂无数据',vol:0,dur:0,permPenAtk:0,permPenDef:0,permBonusAtk:0,permBonusDef:0,period:{name:'—',volThreshold:2500}};
  var p=info.period||{name:'—',volThreshold:2500};
  var modal=document.createElement('div');modal.className='modal-overlay open';
  modal.innerHTML='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">📖 属性计算方式</div>'
    +'<div style="font-size:.8rem;line-height:1.7;color:var(--text2);padding:4px 0">'
    +'<div style="color:var(--orange);font-weight:700;margin-bottom:4px">⚔️ '+info.atk+'</div>'
    +'<div style="color:var(--blue);font-weight:700;margin-bottom:4px">🛡️ '+info.def+'</div>'
    +'<div style="color:var(--green);font-weight:700;margin-bottom:4px">❤️ '+info.hp+'</div>'
    +'<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);font-size:.7rem;color:var(--text3)">'
    +'📊 本月力量容量: '+info.vol+' kg (×动作ratio)<br>'
    +'🏃 本月有氧时长: '+info.dur+' 分钟<br>'
    +'📅 当前旬: '+p.name+' (容量目标 '+p.volThreshold+'kg)<br>'
    +'💡 旬内6天→攻防各+30；容量达标→攻防各+60（达标后永久保留）<br>'
    +'💡 基础属性每月1号归零，累积奖励/惩罚永久保留<br>'
    +((info.permBonusAtk+info.permBonusDef)>0?'🏆 累积奖励: 攻+'+info.permBonusAtk+' 防+'+info.permBonusDef+'<br>':'')
    +((info.permPenAtk+info.permPenDef)>0?'⚠️ 累积惩罚: 攻-'+info.permPenAtk+' 防-'+info.permPenDef+'<br>':'')+'</div></div><div class="modal-actions"><button class="m-btn-cancel" id="attrClose">关闭</button></div></div>';
  document.body.appendChild(modal);
  document.getElementById('attrClose').addEventListener('click',function(){modal.remove()});
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()});
}

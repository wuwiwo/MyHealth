/* ============================================
   MyHealth - Game Tab: Soul Refinement (from tab-game.js)
   Refine dialog, batch refinement
   ============================================ */
/* ========== SOUL REFINEMENT DIALOG ========== */
var _refineLog=[];

function showRefineDialog(){
  var refine=getRefine();
  var bonus=calculateRefineBonus(refine.upgrades);
  var curGrade=getCurrentRefineGrade(refine.upgrades);
  var modal=openModal(null,'refineModal')
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">🔮 炼魂系统</div>';
  // Points
  h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:10px 14px;margin-bottom:10px">';
  h+='<div style="font-size:.75rem;color:var(--text2)">炼化点数: <b style="color:var(--orange);font-size:1rem">'+(refine.points||0)+'</b> <span style="color:var(--text3);font-size:.65rem">（本月已获得 '+(refine.totalEarned||0)+'）</span></div>';
  h+='</div>';
  if(!curGrade){
    h+='<div style="text-align:center;padding:20px;color:var(--green);font-weight:700">🎉 所有等级已满！</div>';
    h+='<div class="modal-actions"><button class="m-btn-cancel" id="refineClose">关闭</button></div></div>';
    modal.innerHTML=h;void modal;
    document.getElementById('refineClose').addEventListener('click',function(){modal.remove();renderGame()});
    modal.addEventListener('click',function(e){if(e.target===e.currentTarget){modal.remove();renderGame()}});
    return;
  }
  // Current grade banner with progress
  var prog=getRefineGradeProgress(refine.upgrades,curGrade);
  var g=REFINE_GRADES[curGrade];
  var gradeColor={F:'var(--text3)',E:'var(--text2)',D:'var(--green)',C:'var(--blue)',B:'var(--purple)',A:'var(--orange)',R:'var(--red)',SR:'#fbbf24',SSR:'#f0f'}[curGrade]||'var(--text)';
  h+='<div style="background:var(--bg);border:2px solid '+gradeColor+';border-radius:var(--r);padding:12px 14px;margin-bottom:12px">';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
  h+='<span style="font-size:1.3rem;font-weight:900;color:'+gradeColor+'">'+curGrade+'</span>';
  h+='<span style="font-size:.72rem;color:var(--text3)">成功率 '+Math.round(g.successRate*100)+'%</span>';
  h+='</div>';
  h+='<div style="font-size:.7rem;color:var(--text2);margin-bottom:4px">进度: '+prog.total+'/'+prog.max+' ('+prog.percent+'%)</div>';
  h+='<div style="height:8px;background:var(--bg3);border-radius:var(--rp);overflow:hidden"><div style="height:100%;width:'+prog.percent+'%;background:'+gradeColor+';border-radius:var(--rp);transition:width .3s"></div></div>';
  h+='</div>';
  // Stats detail
  var u=(refine.upgrades&&refine.upgrades[curGrade])||{atk:0,def:0,hp:0,soulAtk:0,soulDef:0};
  var statIcons={atk:'⚔️',def:'🛡️',hp:'❤️',soulAtk:'👻',soulDef:'🔮'};
  h+='<div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">当前等级强化（'+curGrade+'级，满级'+g.maxLevel+'）：</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">';
  REFINE_STATS.forEach(function(stat){
    var lv=u[stat]||0;
    var maxed=lv>=g.maxLevel;
    var rawBonus=g[stat]*lv;
    var bonusVal='+'+(Math.round(rawBonus*100)/100);
    var perLevel=Math.round(g[stat]*100)/100;
    var unit=stat==='hp'?'Hp':'';
    h+='<div style="background:var(--bg);border:1px solid '+(maxed?'var(--green)':'var(--bd)')+';border-radius:var(--rs);padding:8px 10px">';
    h+='<div style="font-size:.7rem;color:var(--text2)">'+statIcons[stat]+' '+statName(stat)+'</div>';
    h+='<div style="font-size:.85rem;font-weight:700;color:'+(maxed?'var(--green)':'var(--text)')+'">Lv.'+lv+'/'+g.maxLevel+(maxed?' ✅':'')+'</div>';
    h+='<div style="font-size:.6rem;color:var(--text3)">'+bonusVal+unit+' (每级'+perLevel+unit+')</div>';
    h+='</div>';
  });
  h+='</div>';
  // Bonus summary
  h+='<div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:8px 12px;margin-bottom:12px;font-size:.68rem;color:var(--text2)">';
  h+='总加成: ⚔️+'+Math.floor(bonus.atk)+' 🛡️+'+Math.floor(bonus.def)+' ❤️+'+Math.floor(bonus.hp)+' 👻+'+Math.floor(bonus.soulAtk)+' 🔮+'+Math.floor(bonus.soulDef);
  h+='</div>';
  // Batch buttons
  var points=refine.points||0;
  function batchBtn(count,label){
    var dis=points<count;
    var style='flex:1;padding:12px;font-size:.85rem;'+(count>1?'background:var(--bg3);color:var(--text);border:1px solid var(--bd);':'')+(dis?';opacity:.4;pointer-events:none':'');
    return '<button class="sb-btn" data-a="refineBatch" data-count="'+count+'" style="'+style+'"'+(dis?' data-disabled="1"':'')+'>'+label+'</button>';
  }
  h+='<div style="display:flex;gap:8px;margin-bottom:12px">';
  h+=batchBtn(1,'炼化 1次');
  h+=batchBtn(10,'炼化 10次');
  h+=batchBtn(50,'炼化 50次');
  h+='</div>';
  // Results log
  if(_refineLog.length){
    h+='<div style="font-size:.65rem;color:var(--text3);margin-bottom:4px">炼化记录：</div>';
    h+='<div id="refineLog" style="max-height:120px;overflow-y:auto;font-size:.65rem;margin-bottom:12px">';
    _refineLog.slice(-30).forEach(function(entry){
      h+='<div style="padding:2px 0;color:'+(entry.success?'var(--green)':'var(--text3)')+'">'+entry.msg+'</div>';
    });
    h+='</div>';
  }
  h+='<div class="modal-actions"><button class="m-btn-cancel" id="refineClose">关闭</button></div></div>';
  modal.innerHTML=h;void modal;
  document.getElementById('refineClose').addEventListener('click',function(){_refineLog=[];modal.remove();renderGame()});
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget){_refineLog=[];modal.remove();renderGame()}});
  // Scroll log to bottom
  var logEl=document.getElementById('refineLog');
  if(logEl)logEl.scrollTop=logEl.scrollHeight;
}

function doRefineBatch(count){
  var refine=getRefine();
  var actualPoints=refine.points||0;
  if(actualPoints<=0){toast('炼化点数不足','e');var m1=document.getElementById('refineModal');if(m1)m1.remove();showRefineDialog();return}
  var actualCount=Math.min(count,actualPoints);
  if(actualCount<count){toast('点数不足，仅炼化'+actualCount+'次','');}
  if(actualCount<=0){var m2=document.getElementById('refineModal');if(m2)m2.remove();showRefineDialog();return}
  if(!refine.upgrades)refine.upgrades={};
  // Inline batch with per-iteration diagnostics
  var results=[],successes=0,fails=0;
  var grade=null,breakReason='none',stop=false;
  for(var i=0;i<actualCount && !stop;i++){
    grade=getCurrentRefineGrade(refine.upgrades);
    if(!grade){breakReason='getCurrentRefineGrade返回null';stop=true;break}
    var r=attemptRefine(refine.upgrades);
    results.push(r);
    if(r.success)successes++;else fails++;
    if(r.allDone){breakReason='allDone=true';stop=true;break}
  }
  var pointsUsed=results.length;
  refine.points=(refine.points||0)-pointsUsed;
  saveRefine(refine);
  results.forEach(function(r){
    if(r&&r.msg)_refineLog.push({msg:r.msg,success:r.success});
  });
  if(_refineLog.length>50)_refineLog=_refineLog.slice(-50);
  if(successes>0)toast('炼化'+pointsUsed+'次: ✅'+successes+' 成功 ❌'+fails+' 失败','s');
  else toast('炼化'+pointsUsed+'次全部失败','e');
  // Refresh dialog
  var modal=document.getElementById('refineModal');
  if(modal){modal.remove();showRefineDialog()}
  else{renderGame()}
}

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
  h+='<button class="add-btn" id="exWikiBtn" style="margin-top:8px;background:var(--bg);color:var(--text);border:1px solid var(--bd)">📖 动作百科'+(EXD.ready()?' ('+EXD.count()+')':'')+'</button>';
  h+='<div style="text-align:center;margin-top:6px;font-size:.7rem;color:var(--text3)">力量 ratio 影响容量计算（100%=满容量）</div>';
  el.innerHTML=h;
  var wikiBtn=document.getElementById('exWikiBtn');
  if(wikiBtn)wikiBtn.addEventListener('click',function(){openDsPicker(null)});
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
  var linked=ex.dsId&&EXD.ready()?EXD.get(ex.dsId):null;
  var h='<div class="ec"><div class="ec-hdr"><div class="ec-ex">'+namePrefix+ex.name+(linked?' <span title="已关联动作百科" style="font-size:.7rem">📖</span>':'')+'<span class="ec-wt">'+badge+'</span></div><div class="ec-actions"><button class="ec-act" data-a="exEdit" data-id="'+ex.id+'">✏️</button><button class="ec-act" data-a="exDel" data-id="'+ex.id+'">🗑️</button></div></div>';
  if(linked){
    var m=EXD.mediaUrls(linked.img);
    // 图片外侧大图 + 中文主/英文次
    h+='<div style="display:flex;gap:12px;margin-top:10px;align-items:center">'
      +'<img src="'+m.primary+'" loading="lazy" onerror="'+(m.fallback?"this.onerror=null;this.src='"+m.fallback+"'":"this.style.display='none'")+'" style="width:72px;height:72px;border-radius:12px;object-fit:cover;background:var(--bg2);border:1px solid var(--bd);flex-shrink:0">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:.92rem;font-weight:700;color:var(--text1)">'+linked.zh+'</div>'
      +'<div style="font-size:.68rem;color:var(--text3);margin-top:2px">'+linked.name+'</div>'
      +'<div style="margin-top:4px">'+tagHtml(linked.cat,'cat')+tagHtml(linked.eq,'eq')+'</div>'
      +'</div></div>';
  }
  if(ex.eqWeight){
    var unitLabel=ex.unit==='sec'?'秒':'次';
    h+='<div style="margin-top:6px;font-size:.78rem;color:var(--orange)">⚖️ 等效 '+ex.eqWeight+'kg/'+unitLabel+'（不计弯鿖重量）</div>';
  }
  if(ex.description){
    var first=mdFirstLine(ex.description);
    h+='<div style="margin-top:8px;font-size:.8rem;color:var(--text2);cursor:pointer" data-a="exToggle">'+first+'<span style="color:var(--text3);font-size:.72rem"> …展开</span></div>';
    h+='<div class="ex-desc-full" style="display:none;margin-top:6px;padding:10px 12px;background:var(--bg);border-radius:var(--rs);border:1px solid var(--bd)">'+renderMd(ex.description)+'</div>';
  }
  h+='</div>';
  return h;
}

function showExEditor(editId){
  var list=getExercises();
  var ex=editId?list.find(function(x){return x.id===editId}):null;
  var isEdit=!!ex;
  if(!ex)ex={id:'',name:'',type:'strength',ratio:100,intensity:2,emoji:'🏃',hasDist:false,description:'',eqWeight:null,unit:'rep'};

  var modal=openModal(null,'exModal')
  var h='<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">'+(isEdit?'✏️ 编辑动作':'＋ 新建动作')+'</div>';
  h+='<div class="fg"><label class="fl">类型</label><div class="car-types" id="exTypeSel">';
  h+='<button class="car-type'+(ex.type==='strength'?' selected':'')+'" data-extype="strength">💪 力量</button>';
  h+='<button class="car-type'+(ex.type==='cardio'?' selected':'')+'" data-extype="cardio">🏃 有氧</button>';
  h+='</div></div>';
  h+='<div class="fg"><label class="fl">名称</label><input class="fi" id="exName" value="'+ex.name+'" placeholder="如: 弯举"></div>';
  h+='<div class="fg" id="exRatioFg"'+(ex.type==='strength'?'':' style="display:none"')+'><label class="fl">力量比值 (ratio %) <span style="font-weight:400;text-transform:none">折算率10~100%</span></label><div class="stepper" style="max-width:160px"><button class="sp-btn" id="exRatioD">−</button><span class="sp-val" id="exRatioVal">'+(ex.ratio!=null?ex.ratio:100)+'</span><button class="sp-btn" id="exRatioU">+</button></div></div>';
  h+='<div class="fg" id="exEqWeightFg"'+(ex.type==='strength'?'':' style="display:none"')+'><label class="fl">等效重量 (kg/次) <span style="font-weight:400;text-transform:none">自重动作设此值，留空则用实际重量</span></label><input class="fi" id="exEqWeight" type="number" step="0.1" min="0" value="'+(ex.eqWeight!=null?ex.eqWeight:'')+'" placeholder="如: 0.5（留空=哑铃动作）"></div>';
  h+='<div class="fg" id="exUnitFg"'+(ex.type==='strength'?'':' style="display:none"')+'><label class="fl">计量单位</label><div class="car-types" id="exUnitSel">';
  h+='<button class="car-type'+(ex.unit!=='sec'?' selected':'')+'" data-exunit="rep">🔢 按次数</button>';
  h+='<button class="car-type'+(ex.unit==='sec'?' selected':'')+'" data-exunit="sec">⏱️ 按秒数</button>';
  h+='</div></div>';
  h+='<div class="fg" id="exEmojiFg"'+(ex.type==='cardio'?'':' style="display:none"')+'><label class="fl">图标 emoji</label><input class="fi" id="exEmoji" value="'+(ex.emoji||'🏃')+'" placeholder="🏃"></div>';
  h+='<div class="fg" id="exIntensityFg"'+(ex.type==='cardio'?'':' style="display:none"')+'><label class="fl">默认强度</label><div class="car-types" id="exIntensitySel"></div></div>';
  h+='<div class="fg" id="exHasDistFg"'+(ex.type==='cardio'?'':' style="display:none"')+' style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="exHasDist"'+(ex.hasDist?' checked':'')+'><label class="fl" style="margin:0">有距离统计</label></div>';
  h+='<div class="fg"><label class="fl">动作描述 <span style="font-weight:400;text-transform:none">（支持 **加粗** #标题 `代码` -列表）</span></label><textarea class="fi" id="exDesc" rows="4" style="resize:vertical;font-size:.78rem;line-height:1.6" placeholder="可选：记录动作要领、注意事项...">'+(ex.description||'').replace(/</g,'&lt;')+'</textarea></div>';
  h+='<div class="fg" id="exLinkFg"><label class="fl">📚 关联动作百科 <span style="font-weight:400;text-transform:none">（可选，提供说明与动图）</span></label><div id="exLinkArea"></div></div>';
  h+='<div class="modal-actions"><button class="m-btn-cancel" id="exCancel">取消</button><button class="m-btn-save" id="exSave">💾 保存</button></div></div>';
  modal.innerHTML=h;void modal;

  var curDsId=ex.dsId||null;

  function renderLinkArea(){
    var area=document.getElementById('exLinkArea');if(!area)return;
    if(curDsId){
      var it=EXD.get(curDsId);
      if(it){
        var m=EXD.mediaUrls(it.img);
        area.innerHTML='<div class="ec" style="margin-top:2px"><div style="display:flex;gap:12px;align-items:center">'
          +'<img src="'+m.primary+'" loading="lazy" onerror="'+(m.fallback?"this.onerror=null;this.src='"+m.fallback+"'":"this.style.display='none'")+'" style="width:64px;height:64px;border-radius:12px;object-fit:cover;background:var(--bg2);border:1px solid var(--bd);flex-shrink:0">'
          +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.92rem">'+it.zh+'</div>'
          +'<div style="font-size:.68rem;color:var(--text3)">'+it.name+'</div>'
          +'<div style="margin-top:4px">'+tagHtml(it.cat,'cat')+tagHtml(it.eq,'eq')+tagHtml(it.target,'cat')+'</div></div>'
          +'<button class="ec-act" id="exLinkClear" title="解除关联">✕</button></div></div>';
        document.getElementById('exLinkClear').addEventListener('click',function(){curDsId=null;renderLinkArea()});
        return;
      }
    }
    // 未关联: 候选建议 + 手动选择按钮
    var cands=EXD.ready()?EXD.matchCandidates(ex.name||document.getElementById('exName').value||'',4):[];
    var ch=cands.length?'<div style="margin-top:4px;font-size:.68rem;color:var(--text3)">按名称匹配的候选:</div>':'';
    cands.forEach(function(c){
      var m=EXD.mediaUrls(c.item.img);
      ch+='<button type="button" data-dsid="'+c.item.id+'" class="ec" style="display:flex;width:100%;text-align:left;gap:12px;margin-top:8px;padding:10px;align-items:center;cursor:pointer">'
        +'<img src="'+m.primary+'" loading="lazy" onerror="'+(m.fallback?"this.onerror=null;this.src='"+m.fallback+"'":"this.style.visibility='hidden'")+'" style="width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--bg2);border:1px solid var(--bd);flex-shrink:0">'
        +'<div style="flex:1;min-width:0"><div style="font-size:.88rem;font-weight:700;color:var(--text1)">'+c.item.zh+'</div>'
        +'<div style="font-size:.66rem;color:var(--text3);margin-top:2px">'+c.item.name+'</div></div>'
        +'<span style="font-size:.65rem;color:var(--purple);border:1px solid var(--purple);border-radius:var(--rp);padding:2px 7px">'+c.reason+' '+Math.round(c.s)+'</span></button>';
    });
    ch+='<button type="button" id="exLinkPick" class="add-btn" style="margin-top:8px;font-size:.78rem;padding:8px">🔍 从数据集选择'+(EXD.ready()?' ('+EXD.count()+')':'')+'</button>';
    area.innerHTML=ch;
    area.querySelectorAll('[data-dsid]').forEach(function(b){
      b.addEventListener('click',function(){curDsId=b.dataset.dsid;renderLinkArea()});
    });
    var pick=document.getElementById('exLinkPick');
    if(pick)pick.addEventListener('click',function(){openDsPicker(function(id){if(id){curDsId=id;renderLinkArea();}})});
  }
  renderLinkArea();

  var curType=ex.type;
  var curIntensity=ex.intensity||2;
  modal.querySelectorAll('[data-extype]').forEach(function(b){
    b.addEventListener('click',function(){
      curType=b.dataset.extype;
      modal.querySelectorAll('#exTypeSel .car-type').forEach(function(x){x.classList.toggle('selected',x.dataset.extype===curType)});
      document.getElementById('exRatioFg').style.display=curType==='strength'?'':'none';
      document.getElementById('exEqWeightFg').style.display=curType==='strength'?'':'none';
      document.getElementById('exUnitFg').style.display=curType==='strength'?'':'none';
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
  document.getElementById('exRatioD').addEventListener('click',function(){var v=parseInt(document.getElementById('exRatioVal').textContent);document.getElementById('exRatioVal').textContent=Math.max(10,v-5)});
  document.getElementById('exRatioU').addEventListener('click',function(){var v=parseInt(document.getElementById('exRatioVal').textContent);document.getElementById('exRatioVal').textContent=Math.min(100,v+5)});
  var curUnit=ex.unit||'rep';
  modal.querySelectorAll('[data-exunit]').forEach(function(b){
    b.addEventListener('click',function(){
      curUnit=b.dataset.exunit;
      modal.querySelectorAll('#exUnitSel .car-type').forEach(function(x){x.classList.toggle('selected',x.dataset.exunit===curUnit)});
    });
  });
  document.getElementById('exCancel').addEventListener('click',function(){modal.remove()});
  document.getElementById('exSave').addEventListener('click',function(){
    var name=document.getElementById('exName').value.trim();
    if(!name){toast('请输入名称','e');return}
    var desc=document.getElementById('exDesc').value.trim();
    var list=getExercises();
    if(curType==='strength'){
      var ratio=parseInt(document.getElementById('exRatioVal').textContent);
      var eqWeightRaw=document.getElementById('exEqWeight').value.trim();
      var eqWeight=eqWeightRaw?parseFloat(eqWeightRaw):null;
      var newEx={id:isEdit?editId:name,name:name,type:'strength',ratio:ratio,intensity:null,emoji:null,hasDist:false,description:desc,eqWeight:eqWeight,unit:curUnit};
    }else{
      var emoji=document.getElementById('exEmoji').value.trim()||'🏃';
      var hasDist=document.getElementById('exHasDist').checked;
      var newEx={id:isEdit?editId:(name),name:name,type:'cardio',ratio:null,intensity:curIntensity,emoji:emoji,hasDist:hasDist,description:desc,eqWeight:null,unit:'rep'};
    }
    if(curDsId)newEx.dsId=curDsId;
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

/* ========== DATASET PICKER / ENCYCLOPEDIA OVERLAY ==========
   全屏 overlay 动作百科（裁决 5）。mode='pick' 时点条目回调 dsId 并关闭；
   mode='browse' 纯浏览。分页 50 条 + 触底加载；GIF 点击才播放。 */
var _exdPage=50,_exdShown=50;

function openDsPicker(onPick){
  var ov=document.createElement('div');ov.className='modal-overlay open';ov.id='dsPicker';
  var h='<div class="modal-sheet" style="height:92vh;max-height:92vh;display:flex;flex-direction:column">'
    +'<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;gap:8px;padding:10px 14px 0"><div class="modal-title" style="flex:1">'+(onPick?'🔗 关联动作':'📖 动作百科')+'</div><button class="ec-act" id="dsClose">✕</button></div>'
    +'<div style="padding:8px 14px"><input class="fi" id="dsKw" placeholder="搜索：中文名 / 英文 / 肌群 / 器械" style="width:100%"></div>'
    +'<div class="car-types" id="dsCatRow" style="padding:6px 14px 0;overflow-x:auto;white-space:nowrap;display:flex;gap:4px;align-items:center"></div>'
    +'<div class="car-types" id="dsEqRow" style="padding:6px 14px 4px;overflow-x:auto;white-space:nowrap;display:flex;gap:4px;align-items:center"></div>'
    +'<div id="dsList" style="flex:1;overflow-y:auto;padding:8px 14px 20px;-webkit-overflow-scrolling:touch"></div>'
    +'<div id="dsDetail" style="display:none"></div>'
    +(EXD.ready()?'':'<div style="padding:20px;text-align:center;color:var(--text3);font-size:.75rem">数据集未加载</div>')
    +'</div>';
  ov.innerHTML=h;
  document.body.appendChild(ov);
  if(!(EXD&&EXD.ready()))return;

  var curCat='',curEq='',rows=[];
  function chipHtml(label,val,sel){ return '<button class="car-type'+(sel?' selected':'')+'" data-v="'+val+'">'+label+'</button>'; }

  function renderChips(){
    var cr=document.getElementById('dsCatRow'),er=document.getElementById('dsEqRow');
    cr.innerHTML=chipHtml('全部部位','',!curCat)+EXD.cats().map(function(c){return chipHtml(EXD.getCatLabel(c),c,c===curCat)}).join('');
    er.innerHTML=chipHtml('全部器械','',!curEq)+EXD.eqs().map(function(e2){return chipHtml(EXD.getEqLabel(e2),e2,e2===curEq)}).join('');
    cr.querySelectorAll('.car-type').forEach(function(b){b.addEventListener('click',function(){curCat=b.dataset.v;renderChips();renderList(true)})});
    er.querySelectorAll('.car-type').forEach(function(b){b.addEventListener('click',function(){curEq=b.dataset.v;renderChips();renderList(true)})});
  }

  function cardHtml(it){
    var m=EXD.mediaUrls(it.img);
    return '<button type="button" class="ec" data-id="'+it.id+'" style="display:flex;width:100%;text-align:left;gap:10px;padding:8px;margin-bottom:6px;align-items:center;cursor:pointer">'
      +'<img loading="lazy" src="'+m.primary+'" onerror="'+(m.fallback?"this.onerror=null;this.src='"+m.fallback+"'":"this.style.visibility='hidden'")+'" style="width:52px;height:52px;border-radius:10px;object-fit:cover;background:var(--bg2)">'
      +'<div style="flex:1;min-width:0"><div style="font-size:.78rem;font-weight:600">'+it.zh+'</div>'
      +'<div style="font-size:.62rem;color:var(--text3)">'+it.name+'</div>'
      +'<div style="margin-top:3px">'+tagHtml(it.cat,'cat')+tagHtml(it.eq,'eq')+tagHtml(it.target,'cat')+'</div></div></button>';
  }

  function renderList(reset){
    var box=document.getElementById('dsList');
    if(reset){rows=EXD.search(document.getElementById('dsKw').value.trim(),{cat:curCat,eq:curEq});_exdShown=_exdPage;box.innerHTML='';}
    var slice=rows.slice(_exdShown-_exdPage,_exdShown);
    var frag='';
    slice.forEach(function(r){frag+=cardHtml(EXD.row(r))});
    if(!rows.length&&!reset)frag='<div style="text-align:center;color:var(--text3);font-size:.72rem;padding:12px">没有更多了</div>';
    else if(!rows.length&&reset)frag='<div class="empty"><span class="empty-e">🔍</span><div class="empty-t">无匹配动作</div></div>';
    box.insertAdjacentHTML('beforeend',frag);
    box.querySelectorAll('[data-id]:not([data-wired])').forEach(function(b){
      b.dataset.wired='1';
      b.addEventListener('click',function(){
        if(onPick){onPick(b.dataset.id);ov.remove();}
        else showDsDetail(b.dataset.id);
      });
    });
    // 触底加载哨兵
    var oldSent=box.querySelector('#dsSentinel');if(oldSent)oldSent.remove();
    if(_exdShown<rows.length){
      var sent=document.createElement('div');sent.id='dsSentinel';sent.style.height='8px';box.appendChild(sent);
      _dsIo&&_dsIo.disconnect();
      _dsIo=new IntersectionObserver(function(es){
        if(es[0].isIntersecting){_exdShown+=_exdPage;renderList(false);}
      },{root:box,rootMargin:'120px'});
      _dsIo.observe(sent);
    }
  }
  var kwTimer=null;
  document.getElementById('dsKw').addEventListener('input',function(){clearTimeout(kwTimer);kwTimer=setTimeout(function(){renderList(true)},180)});
  document.getElementById('dsClose').addEventListener('click',function(){_dsIo&&_dsIo.disconnect();ov.remove()});
  ov.addEventListener('click',function(e){if(e.target===ov){_dsIo&&_dsIo.disconnect();ov.remove()}});
  renderChips();renderList(true);
}
var _dsIo=null;

/* 百科详情视图（browse 模式）：中文说明+分步+肌群+GIF 点击播放 */
function showDsDetail(id){
  var it=EXD.get(id);if(!it)return;
  var list=document.getElementById('dsList'),det=document.getElementById('dsDetail');
  var mi=EXD.mediaUrls(it.img),mg=EXD.mediaUrls(it.gif);
  var secTags=(it.sec||[]).map(function(s){return '<span style="font-size:.6rem;background:var(--bg);border:1px solid var(--bd);padding:1px 7px;border-radius:var(--rp)">'+s+'</span>'}).join(' ');
  var steps=(it.steps||[]).map(function(s,i){return '<li style="font-size:.74rem;line-height:1.65;margin-bottom:5px">'+s+'</li>'}).join('');
  det.innerHTML='<div style="position:absolute;inset:0;background:var(--bg);z-index:2;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column">'
    +'<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bd);position:sticky;top:0;background:var(--bg)"><button class="ec-act" id="dsBack">◀</button><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.9rem">'+it.zh+'</div><div style="font-size:.62rem;color:var(--text3)">'+it.name+'</div></div></div>'
    +'<div style="flex:1;padding:14px">'
    +'<div id="dsMediaWrap" style="position:relative;width:200px;height:200px;margin:0 auto 12px;background:var(--bg2);border-radius:14px;overflow:hidden;cursor:pointer">'
    +'<img id="dsImg" loading="lazy" src="'+mi.primary+'" onerror="'+(mi.fallback?"this.onerror=null;this.src='"+mi.fallback+"'":"this.style.visibility='hidden'")+'" style="width:100%;height:100%;object-fit:cover">'
    +(it.gif?'<div id="dsPlayOv" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25)"><span style="background:rgba(0,0,0,.55);color:#fff;font-size:.7rem;padding:6px 12px;border-radius:99px">▶ 播放动画</span></div>':'')
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"><span style="font-size:.64rem;background:var(--purple);color:#fff;padding:2px 9px;border-radius:var(--rp)">'+it.cat+'</span><span style="font-size:.64rem;background:var(--blue);color:#fff;padding:2px 9px;border-radius:var(--rp)">'+it.eq+'</span><span style="font-size:.64rem;background:var(--green);color:#fff;padding:2px 9px;border-radius:var(--rp)">🎯 '+it.target+'</span></div>'
    +(it.mg?'<div style="margin-bottom:10px"><div style="font-size:.68rem;color:var(--text3);margin-bottom:4px">协同肌群</div>'+secTags+'</div>':'')
    +(it.ins?'<div style="font-size:.78rem;line-height:1.7;color:var(--text1);white-space:normal;margin-bottom:12px">'+it.ins+'</div>':'')
    +(steps?'<div><div style="font-size:.68rem;color:var(--text3);margin-bottom:6px">分步说明</div><ol style="padding-left:18px;margin:0">'+steps+'</ol></div>':'')
    +'</div></div>';
  list.style.display='none';det.style.display='block';
  document.getElementById('dsBack').addEventListener('click',function(){det.style.display='none';list.style.display=''});
  var wrap=document.getElementById('dsMediaWrap');
  if(wrap&&it.gif){
    wrap.addEventListener('click',function playOnce(){
      var mi2=EXD.mediaUrls(it.gif);
      document.getElementById('dsImg').src=mg.primary;
      document.getElementById('dsImg').onerror=function(){if(mg.fallback)this.src=mg.fallback;};
      var ovEl=document.getElementById('dsPlayOv');if(ovEl)ovEl.remove();
      wrap.removeEventListener('click',playOnce);
    });
  }
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
  var modal=openModal();
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
  void modal;
  document.getElementById('attrClose').addEventListener('click',function(){modal.remove()});
  modal.addEventListener('click',function(e){if(e.target===e.currentTarget)modal.remove()});
}

/* ========== 动作标签：中英翻译 + 多彩 tag ========== */
function zhLabel(v){ return (typeof EXD!=='undefined'&&EXD.ready()&&EXD.toZh)?EXD.toZh(v):v; }
var TAG_COLORS = {
  cat: { back:'#3b82f6', cardio:'#ef4444', chest:'#f59e0b', 'lower arms':'#10b981', 'lower legs':'#8b5cf6', neck:'#ec4899', shoulders:'#06b6d4', 'upper arms':'#f97316', 'upper legs':'#84cc16', waist:'#6366f1' },
  eq: { dumbbell:'#f97316', barbell:'#3b82f6', 'body weight':'#10b981', cable:'#8b5cf6', band:'#f59e0b', kettlebells:'#ef4444' }
};
function tagHtml(label, kind){
  var colors = TAG_COLORS[kind] || {};
  var color = '#64748b';
  var c = zhLabel(label);   // 显示中文
  // 用原始英文匹配颜色
  for(var k in colors){ if(label===k){ color=colors[k]; break; } }
  return '<span style="display:inline-block;font-size:.62rem;font-weight:600;padding:2px 8px;border-radius:10px;color:#fff;background:'+color+';margin:2px 3px 0 0;opacity:.85;line-height:1.5">'+c+'</span>';
}

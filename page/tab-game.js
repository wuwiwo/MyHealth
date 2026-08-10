/* ============================================
   MyHealth - Game Tab: Event Entry (from tab-game.js)
   onGameEvent routes game-tab actions
   ============================================ */
/* ========== GAME EVENT HANDLER ========== */
function onGameEvent(el,id,act){
  switch(id){
    case 'battleClose':_battle.done=true;_battleAuto=false;if(_battleTimer)clearTimeout(_battleTimer);_battleRunning=false
      document.getElementById('battleOverlay').classList.remove('open');renderGame();return true;
    case 'battleAuto':{
      _battleAuto=!_battleAuto;
      el.classList.toggle('active',_battleAuto);
      el.textContent=_battleAuto?'🔄 自动✓':'🔄 自动';
      if(_battleAuto){toast('自动模式已开启：胜利后自动挑战下一关','s')}
      else{toast('自动模式已关闭','')}
      return true}
    case 'refineBtn':showRefineDialog();return true;
    case 'shareClose':hideShare();return true;
    case 'shareSave':toast('长按或截图保存分享卡片 📸','s');return true;
  }
  if(act==='refineBatch'){
    if(el.dataset.disabled){return true}
    var count=parseInt(el.dataset.count)||1;
    var ref=getRefine();
    if((ref.points||0)<count){toast('炼化点数不足（需要'+count+'点，仅有'+(ref.points||0)+'点）','e');var m=document.getElementById('refineModal');if(m)m.remove();showRefineDialog();return true}
    doRefineBatch(count);return true}
  return false
}

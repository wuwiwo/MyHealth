/* ============================================
   MyHealth - Game Tab: Battle UI (from tab-game.js)
   Battle overlay, animations, end-of-battle flow, share card
   ============================================ */
/* ========== BATTLE ========== */
let _battleRunning=false,_battleSpeed=1,_battleTimer=null,_battle=null,_battleAuto=false
function startBattle(id){
  const lv=findLevel(id);if(!lv)return
  if(!getGame().attempts)getGame().attempts={}
  var todayKey=today()+'_'+id
  var attempts=getGame().attempts[todayKey]||0
  if(attempts>=3){toast('今天已失败 3 次，不能再挑战了 😅','e');return}
  var todayStr=today()
  var trainedToday=((store.get('strength')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})||((store.get('cardio')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})
  if(!trainedToday&&attempts===0){toast('⚠️ 今天还没训练，属性较低','e')}
  var stats=getGameStats()
  var affix=lv.boss?pickBossAffix():null
  _battle=createBattle({atk:stats.atk,def:stats.def,hp:stats.hp,soulAtk:stats.soulAtk,soulDef:stats.soulDef},{atk:lv.atk,def:lv.def,hp:lv.hp,soulAtk:lv.soulAtk||0,soulDef:lv.soulDef||0},{npc:lv.npc,boss:lv.boss},affix)
  _battleRunning=false;_battleSpeed=1;_battleTimer=null
  var autoBtn=document.getElementById('battleAuto');
  if(autoBtn){autoBtn.classList.toggle('active',_battleAuto);autoBtn.textContent=_battleAuto?'🔄 自动✓':'🔄 自动'}
  document.getElementById('battleLevel').textContent=id+' '+lv.npc+(affix?' 👑':'')+(affix?' ['+affix.name+']':'')
  document.getElementById('beName').textContent='👹 '+lv.npc+(affix?' 👑':'')
  document.getElementById('bpHP').style.width='100%'
  document.getElementById('bpHPText').textContent='❤️ '+stats.hp
  document.getElementById('bpAtk').textContent='⚔️ '+stats.atk
  document.getElementById('bpDef').textContent='🛡️ '+stats.def
  document.getElementById('bpSoulAtk').textContent='👻 '+stats.soulAtk
  document.getElementById('bpSoulDef').textContent='🔮 '+stats.soulDef
  document.getElementById('beHP').style.width='100%'
  document.getElementById('beHPText').textContent='❤️ '+lv.hp
  document.getElementById('beAtk').textContent='⚔️ '+lv.atk
  document.getElementById('beDef').textContent='🛡️ '+lv.def
  document.getElementById('beSoulAtk').textContent='👻 '+(lv.soulAtk||0)
  document.getElementById('beSoulDef').textContent='🔮 '+(lv.soulDef||0)
  document.getElementById('battleLog').innerHTML=''
  document.getElementById('battleEnd').innerHTML=''
  document.getElementById('battleOverlay').classList.add('open')
  setTimeout(()=>runBattle(),500)
}

function runBattle(){
  if(_battle.done||_battleRunning)return
  _battleRunning=true
  const tick=()=>{
    if(_battle.done){_battleRunning=false;return}
    var result=battleTick(_battle)
    _battle.turn=result.turn
    result.events.forEach(function(ev){addBattleLog(ev.msg,ev.type)})
    renderBattleHP()
    // Attack & hit animations
    var pEl=document.getElementById('battlePlayer'),eEl=document.getElementById('battleEnemy')
    result.events.forEach(function(ev){
      if(ev.type==='dmg'){
        // Player takes damage — enemy attacks
        if(eEl){eEl.classList.remove('attacking-enemy');void eEl.offsetWidth;eEl.classList.add('attacking-enemy')}
        if(pEl){pEl.classList.remove('hit');void pEl.offsetWidth;pEl.classList.add('hit');showImpact(pEl,ev)}
      }
      if(ev.type==='e'){
        // Enemy takes damage — player attacks
        if(pEl){pEl.classList.remove('attacking');void pEl.offsetWidth;pEl.classList.add('attacking')}
        if(eEl){eEl.classList.remove('hit');void eEl.offsetWidth;eEl.classList.add('hit');showImpact(eEl,ev)}
      }
    })
    if(_battle.done){endBattle(_battle.winner);_battleRunning=false;return}
    _battleTimer=setTimeout(tick,600/_battleSpeed)
  }
  tick()
}

function renderBattleHP(){
  document.getElementById('bpHP').style.width=Math.max(0,_battle.player.hp/(_battle.player.maxHP||1)*100)+'%'
  document.getElementById('bpHPText').textContent='HP: '+Math.max(0,_battle.player.hp)
  document.getElementById('beHP').style.width=Math.max(0,_battle.enemy.hp/_battle.enemy.maxHP*100)+'%'
  document.getElementById('beHPText').textContent='HP: '+Math.max(0,_battle.enemy.hp)+'/'+_battle.enemy.maxHP
}

function addBattleLog(msg,type){
  const el=document.getElementById('battleLog')
  const div=document.createElement('div');div.className='bl-entry '+(type==='dmg'?'bl-dmg':type==='e'?'bl-def':'')
  div.textContent='▸ '+msg;el.appendChild(div);el.scrollTop=el.scrollHeight
}

function showImpact(targetEl,ev){
  if(!targetEl||!ev.msg)return;
  var num=ev.msg.replace(/[^0-9\-]/g,'');
  if(!num)return;
  var impact=document.createElement('div');impact.className='bc-impact';
  impact.textContent=(ev.type==='dmg'?'💥':'✨')+num;
  impact.style.left='50%';impact.style.top='30%';
  targetEl.appendChild(impact);
  setTimeout(function(){if(impact.parentNode)impact.remove()},600);
}

function endBattle(won){
  _battle.done=true;const el=document.getElementById('battleEnd')
  var g=getGame()
  if(!won){
    if(!g.attempts)g.attempts={}
    var todayKey=today()+'_'+g.current
    g.attempts[todayKey]=(g.attempts[todayKey]||0)+1
    setGame(g)
  }
  if(won){
    if(!g.cleared.includes(g.current))g.cleared.push(g.current)
    let nextId='';let found=false
    for(const ch of Object.values(LEVELS)){
      for(const lv2 of ch.levels){
        if(found){nextId=lv2.id;found=false;break}
        if(lv2.id===g.current)found=true
      }
      if(nextId)break
    }
    if(nextId)g.current=nextId
    else g.current=''
    setGame(g)
    trackLevel(g.current)
    el.innerHTML='<div class="be-result be-win">🏆 胜利！</div><div class="be-replay"><button class="be-btn be-btn-next" id="battleNext">下一关 →</button><button class="be-btn be-btn-retry" id="battleShare">📤 分享卡片</button></div>'
    celebrate()
    if(_battleAuto&&nextId){
      el.innerHTML+='<div style="font-size:.7rem;color:var(--text3);text-align:center;margin-top:6px">🔄 自动模式：2秒后进入下一关...</div>'
      setTimeout(function(){
        var ov=document.getElementById('battleOverlay');
        if(ov&&ov.classList.contains('open')&&_battleAuto){
          ov.classList.remove('open');
          setTimeout(function(){if(_battleAuto&&getGame().current)startBattle(getGame().current)},200);
        }
      },2000);
    }
  } else {
    _battleAuto=false;
    var autoBtn=document.getElementById('battleAuto');if(autoBtn){autoBtn.classList.remove('active');autoBtn.textContent='🔄 自动'}
    el.innerHTML='<div class="be-result be-lose">💀 战败</div><div class="be-replay"><button class="be-btn be-btn-retry" id="battleRetry">🔄 重新挑战</button></div>'
  }
  document.getElementById('battleNext')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');renderGame()})
  document.getElementById('battleRetry')?.addEventListener('click',()=>{document.getElementById('battleOverlay').classList.remove('open');setTimeout(()=>startBattle(getGame().current),100)})
  document.getElementById('battleShare')?.addEventListener('click',showShareCard)
}
/* ========== SHARE CARD ========== */
function showShareCard(){
  const lv=findLevel(getGame().current)||findLevel(getGame().cleared[getGame().cleared.length-1])
  if(!lv)return
  const stats=getGameStats()
  document.getElementById('shareLevel').textContent=getGame().current+' '+lv.npc
  document.getElementById('shareStats').innerHTML=
    '<div class="share-stat"><div class="ss-v">'+stats.atk+'</div><div class="ss-l">攻击</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.def+'</div><div class="ss-l">防御</div></div>'+
    '<div class="share-stat"><div class="ss-v">'+stats.hp+'</div><div class="ss-l">生命</div></div>'
  const clearedStr=getGame().cleared.length>0?'已通关 '+getGame().cleared.length+' 关':'刚刚开始征程'
  const strE=((store.get('strength')||{entries:[]}).entries||[]).length,carE=((store.get('cardio')||{entries:[]}).entries||[]).length
  document.getElementById('shareVS').innerHTML=
    '🧑 力量训练 '+strE+' 次 · 有氧 '+carE+' 次<br>💪 '+clearedStr
  document.getElementById('shareOverlay').classList.add('open')
}
function hideShare(){document.getElementById('shareOverlay').classList.remove('open')}

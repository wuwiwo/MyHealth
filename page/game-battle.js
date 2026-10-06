/* ============================================
   MyHealth - Game Tab: Battle UI (from tab-game.js)
   Battle overlay, animations, end-of-battle flow, share card
   ============================================ */
/* ========== BATTLE ========== */
let _battleRunning=false,_battleSpeed=1,_battleTimer=null,_battle=null,_battleAuto=false

/* ========== 战斗速度（关卡挑战 / 单敌） ==========
   与敌群侧**同口径**（game-render.js：`_groupSpeed` + localStorage `dh-group-speed`
   + 「选了就落盘、开战时恢复」）：档位 [1,2,4,8] · 持久化 · 开战恢复上次选择。

   ⚠️ 修复的 bug：`startBattle` 此前每次都无条件 `_battleSpeed=1`，而自动模式正是靠
   「胜利 → 2 秒后 startBattle(下一关)」推进的（见 endBattle）—— 于是玩家选了 ×8，
   第一关之后每一关都被重置回 ×1，而 8× 按钮仍高亮着（没人同步），表现为
   「开了自动 + 选 ×8，战斗速度还是 ×1」。
   现在「存」（点击档位落盘）与「读」（开战恢复，缺存档则沿用内存值）成对存在，
   自动模式逐关继承玩家选择，界面高亮也与真实速度一致。 */
var BATTLE_SPEEDS=[1,2,4,8]
var BATTLE_SPEED_KEY='dh-battle-speed'
var BATTLE_STEP_BASE_MS=600   // ×1 的回合间隔（沿用原值，不改战斗节奏基准）
function normalizeBattleSpeed(v){
  var n=parseInt(v,10)
  return BATTLE_SPEEDS.indexOf(n)<0?1:n
}
/* 纯函数：基准间隔 ÷ 速度档位 → ×1=600 / ×2=300 / ×4=150 / ×8=75（非法档位按 ×1） */
function battleStepDelay(baseMs,speed){
  var base=(typeof baseMs==='number'&&baseMs>0)?baseMs:BATTLE_STEP_BASE_MS
  return Math.round(base/normalizeBattleSpeed(speed))
}
/* 读：存档优先；没有存档则沿用 fallback（= 当前内存值），保证自动模式不退回 ×1 */
function loadBattleSpeed(fallback){
  var raw=null
  try{raw=localStorage.getItem(BATTLE_SPEED_KEY)}catch(e){ raw=null /* 忽略：localStorage 不可用（隐私模式/配额）时按默认速度 */ }
  return raw==null?normalizeBattleSpeed(fallback):normalizeBattleSpeed(raw)
}
/* 存：与敌群侧 `gbSpeed` 一样「玩家选了就落盘」 */
function saveBattleSpeed(v){
  try{localStorage.setItem(BATTLE_SPEED_KEY,String(normalizeBattleSpeed(v)))}catch(e){ /* 忽略：localStorage 不可用（隐私模式/配额）时，速度选择只在本次会话生效 */ }
}
/* 按钮高亮同步到真实速度：防「界面显示 8×、实际跑 ×1」 */
function syncBattleSpeedButtons(){
  if(typeof document==='undefined'||!document.querySelectorAll)return
  var btns=document.querySelectorAll('.battle-speed .speed-btn[data-speed]')
  if(!btns)return
  for(var i=0;i<btns.length;i++){
    var v=parseInt(btns[i].dataset&&btns[i].dataset.speed,10)
    if(btns[i].classList)btns[i].classList.toggle('active',v===_battleSpeed)
  }
}
/* 「存」的一环：document 级点击委托。app.js 的 `.speed-btn` 处理器只改内存里的
   `_battleSpeed`（不落盘），且单敌表头并不每次开战都重建（restoreSingleBattleOverlay
   在结构已存在时直接返回），故用一次性委托而不是按钮级绑定。
   `[data-speed]` 限定 1/2/4/8 四个档位按钮，自动 / 关闭 / 敌群调速按钮不受影响。 */
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',function(e){
    var btn=(e.target&&e.target.closest)?e.target.closest('.battle-speed .speed-btn[data-speed]'):null
    if(btn)saveBattleSpeed(btn.dataset.speed)
  })
}

/* 🎁 通关炼化点奖励：基础 1~2 点，普通关 ×2，BOSS 关 ×10 */
function rollLoot(levelInfo){
  var base=1+Math.floor(Math.random()*2)
  var mult=levelInfo&&levelInfo.boss?10:2
  return{points:base*mult,mult:mult,base:base}
}

/* 重建单敌战斗 overlay 结构（群战 renderGroupOverlay 会覆盖 innerHTML） */
function restoreSingleBattleOverlay() {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  // 只重建一次：若单敌结构还在（有 battleLevel），不重复
  if (document.getElementById('battleLevel')) return
  ov.innerHTML =
    '<div class="battle-hdr">'
    +'<div class="battle-level" id="battleLevel">1-1</div>'
    +'<div class="battle-speed">'
    +'<button class="speed-btn active" data-speed="1">1×</button>'
    +'<button class="speed-btn" data-speed="2">2×</button>'
    +'<button class="speed-btn" data-speed="4">4×</button>'
    +'<button class="speed-btn" data-speed="8">8×</button>'
    +'<button class="speed-btn" id="battleAuto" title="自动模式">🔄 自动</button>'
    +'</div>'
    +'<button class="speed-btn" id="battleClose">✕</button>'
    +'</div>'
    +'<div class="battle-arena" id="battleArena">'
    +'<div class="battle-char" id="battlePlayer"><div class="bc-name">🧑 你</div><div class="bc-hp-bar"><div class="bc-hp-fill" id="bpHP" style="width:100%"></div></div><div class="bc-hp-text" id="bpHPText">HP: 100</div><div class="bc-atk" id="bpAtk">⚔️ 1</div><div class="bc-def" id="bpDef">🛡️ 1</div><div class="bc-soul" id="bpSoulAtk">👻 0</div><div class="bc-soul" id="bpSoulDef">🔮 0</div></div>'
    +'<div class="battle-vs">⚔️</div>'
    +'<div class="battle-char" id="battleEnemy"><div class="bc-name" id="beName">👹 敌人</div><div class="bc-hp-bar"><div class="bc-hp-fill enemy" id="beHP" style="width:100%"></div></div><div class="bc-hp-text" id="beHPText">HP: 100</div><div class="bc-atk" id="beAtk">⚔️ 1</div><div class="bc-def" id="beDef">🛡️ 1</div><div class="bc-soul" id="beSoulAtk">👻 0</div><div class="bc-soul" id="beSoulDef">🔮 0</div></div>'
    +'</div>'
    +'<div class="battle-log" id="battleLog"></div>'
    +'<div class="battle-end" id="battleEnd"></div>'
}

function startBattle(id){
  const lv=findLevel(id);if(!lv)return
  // 重建单敌战斗 overlay 结构（群战可能覆盖过 innerHTML）
  restoreSingleBattleOverlay()
  if(!getGame().attempts)getGame().attempts={}
  var todayKey=today()+'_'+id
  var attempts=getGame().attempts[todayKey]||0
  if(attempts>=3){toast('今天已失败 3 次，不能再挑战了 😅','e');return}
  var todayStr=today()
  var trainedToday=((store.get('strength')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})||((store.get('cardio')||{entries:[]}).entries||[]).some(function(e){return e.date===todayStr})
  if(!trainedToday&&attempts===0){toast('⚠️ 今天还没训练，属性较低','e')}
  var stats=getGameStats()
  var sides=buildBattleSides(stats,lv)
  var affix=lv.boss?rollBossAffixFor(lv):null
  _battle=createBattle(sides.player,sides.enemy,{npc:lv.npc,boss:lv.boss},affix)
  _battleRunning=false;_battleTimer=null
  /* 继承玩家选择的速度：不再重置回 ×1（自动模式逐关继承；与敌群侧口径一致） */
  _battleSpeed=loadBattleSpeed(_battleSpeed)
  syncBattleSpeedButtons()
  var autoBtn=document.getElementById('battleAuto');
  if(autoBtn){autoBtn.classList.toggle('active',_battleAuto);autoBtn.textContent=_battleAuto?'🔄 自动✓':'🔄 自动'}
  document.getElementById('battleLevel').textContent=id+' '+lv.npc+(affix?' 👑':'')+(affix?' ['+affix.name+']':'')
  /* v2.3.1：单敌对战界面给出怪物头像。此前是「👹 名字」纯文字。
     ⚠️ 这里把 `textContent` 换成 `innerHTML` —— 必须对名字做 HTML 转义（`escHtml`），
        否则名字里一旦出现 `<` / `&` 会破坏结构。lv.npc 目前都是中文，但没有理由
        把「当前数据恰好安全」当成契约。
     ⚠️ 存在性守卫：monster-archetype.js 未加载时退回原来的 emoji 写法。 */
  ;(function(){
    var nameEl=document.getElementById('beName'); if(!nameEl)return
    var ico=(typeof monsterIconHtmlByName==='function')?monsterIconHtmlByName(lv.npc,!!lv.boss,32):''
    if(!ico){nameEl.textContent='👹 '+lv.npc+(affix?' 👑':'');return}
    var esc=(typeof escHtml==='function')?escHtml(lv.npc):lv.npc
    nameEl.innerHTML='<span class="be-ico">'+ico+'</span><span class="be-nm">'+esc+(affix?' 👑':'')+'</span>'
  })()
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

/* ========== v2.5.0：战斗引擎异常不得伪装成胜利 ==========
   旧实现（catch 内）：`_battle.enemy.hp=Math.min(hp,0)` + `_battle.winner=true` + `endBattle(true)`
   —— 引擎一旦抛异常，玩家会**凭空拿到胜利**：本关计入已通关、current 推进到下一关、
   发放炼化点战利品、播庆祝动画，而真正的原因只留在 console（无任何上下文，无法定位）。
   现在：不改 HP、不判胜、不发奖、不推进度、不计失败次数；
   改走 endBattleAborted()，并把 关卡 / 回合 / 双方 HP / 错误消息 / 堆栈 / 时点
   留在 `_battle.error` 与模块级 `_lastBattleError`（用 getLastBattleError() 读取）。 */

/* 构造可定位的错误上下文（纯函数，便于直接断言字段） */
function battleErrorContext(err,battle,extra){
  var b=battle||{}
  var g=(typeof getGame==='function')?getGame():null
  var ctx={
    stage:'battleTick',
    name:(err&&err.name)?String(err.name):'Error',
    message:(err&&err.message!=null)?String(err.message):String(err),
    stack:(err&&err.stack)?String(err.stack):'',
    level:(g&&g.current)||'',
    npc:(b.level&&b.level.npc)||'',
    boss:!!(b.level&&b.level.boss),
    affix:(b.affix&&b.affix.name)||null,
    turn:b.turn||0,
    playerHP:(b.player&&typeof b.player.hp==='number')?b.player.hp:null,
    enemyHP:(b.enemy&&typeof b.enemy.hp==='number')?b.enemy.hp:null,
    at:new Date().toISOString()
  }
  if(extra)for(var k in extra)ctx[k]=extra[k]
  return ctx
}
var _lastBattleError=null
/* 最近一次引擎异常的上下文（Debug / 报错反馈用；正常战斗保持 null） */
function getLastBattleError(){return _lastBattleError}

/* 异常中止：**既不是胜利也不是战败**。只把本场收尾（避免定时器/自动模式继续推进），
   不动 HP、不发奖、不写通关、不计失败次数，并在界面上如实说明。
   `extra` 用于校正上下文里的 `stage`（v2.5.2：守卫已覆盖渲染段，失败可能不发生在引擎调用里）。 */
function endBattleAborted(err,extra){
  var ctx=battleErrorContext(err,_battle,extra)
  _lastBattleError=ctx
  if(_battle){
    _battle.done=true
    _battle.winner=null      // 不判胜；敌方 HP 保留异常发生时的真实值（不伪造成击杀）
    _battle.aborted=true
    _battle.error=ctx
  }
  _battleAuto=false
  _battleRunning=false
  var autoBtn=document.getElementById('battleAuto')
  if(autoBtn){autoBtn.classList.remove('active');autoBtn.textContent='🔄 自动'}
  var el=document.getElementById('battleEnd')
  if(el){
    el.innerHTML='<div class="be-result be-abort">⚠️ 战斗异常中止</div>'
      +'<div style="font-size:var(--fs-2xs);color:var(--text3);text-align:center;margin-top:6px">本关不计胜负、不发奖励、不推进进度；异常上下文已记录（关卡 / 回合 / 堆栈）</div>'
      +'<div class="be-replay"><button class="be-btn be-btn-retry" id="battleAbort">关闭</button></div>'
  }
  var abortBtn=document.getElementById('battleAbort')
  if(abortBtn)abortBtn.addEventListener('click',function(){
    document.getElementById('battleOverlay').classList.remove('open')
    if(typeof renderGame==='function')renderGame()
  })
}

/* v2.5.1：单敌 damage event 显式携带 sourceSide / targetSide，UI 不再用旧的
   `dmg` / `e` 类型猜攻击方向。旧事件只保留最小兼容回退。 */
function battleEventSides(ev){
  if(!ev)return null
  if((ev.sourceSide==='player'||ev.sourceSide==='enemy')
      &&(ev.targetSide==='player'||ev.targetSide==='enemy')){
    return {sourceSide:ev.sourceSide,targetSide:ev.targetSide}
  }
  if(ev.type==='dmg')return {sourceSide:'player',targetSide:'enemy'}
  if(ev.type==='e'&&ev.msg&&(/荆棘反伤/.test(ev.msg)||/^👹/.test(ev.msg)||/^👻 敌方魂攻击/.test(ev.msg))){
    return {sourceSide:'enemy',targetSide:'player'}
  }
  return null
}
function animateBattleEvent(ev,pEl,eEl){
  if(!ev||ev.type!=='damage')return
  var sides=battleEventSides(ev)
  if(!sides)return
  /* 反伤是结算结果，不是攻击者发起的一次前冲；只闪目标，避免反伤动画伪装成普通攻击。 */
  if(ev.damageType==='reflect'){
    var reflectedTarget=(sides.targetSide==='player')?pEl:eEl
    if(reflectedTarget){reflectedTarget.classList.remove('hit');void reflectedTarget.offsetWidth;reflectedTarget.classList.add('hit');showImpact(reflectedTarget,ev)}
    return
  }
  if(sides.sourceSide==='player'&&sides.targetSide==='enemy'){
    if(pEl){pEl.classList.remove('attacking');void pEl.offsetWidth;pEl.classList.add('attacking')}
    if(eEl){eEl.classList.remove('hit');void eEl.offsetWidth;eEl.classList.add('hit');showImpact(eEl,ev)}
  }else if(sides.sourceSide==='enemy'&&sides.targetSide==='player'){
    if(eEl){eEl.classList.remove('attacking-enemy');void eEl.offsetWidth;eEl.classList.add('attacking-enemy')}
    if(pEl){pEl.classList.remove('hit');void pEl.offsetWidth;pEl.classList.add('hit');showImpact(pEl,ev)}
  }
}

function runBattle(){
  if(_battle.done||_battleRunning)return
  _battleRunning=true
  /* v2.5.2：新一场开始即清掉上一场的异常上下文 —— 与 battleErrorContext 上方注释承诺的
     「正常战斗保持 null」一致（此前只在 endBattleAborted 里赋值，异常后会整会话残留旧错误）。 */
  _lastBattleError=null
  const tick=()=>{
    if(_battle.done){_battleRunning=false;return}
    var result
    /* v2.5.2：守卫覆盖**整段 tick**（引擎调用 + 日志/血条/动画渲染）。
       旧实现的 try 只包 `battleTick` —— 渲染块一旦抛错（畸形返回、缺 DOM 节点）会逃逸出
       runBattle：`_battleRunning` 卡 true、`done` 仍 false、没有后续计时器、没有提示、
       也没有错误上下文 = 战斗永久冻结且不可定位。`stage` 记录真正失败在哪一段。 */
    var stage='battleTick'
    try{
      result=battleTick(_battle)
      stage='battleRender'
      _battle.turn=result.turn
      result.events.forEach(function(ev){addBattleLog(ev.msg,ev.type,ev.targetSide)})
      renderBattleHP()
      // Attack & hit animations are driven by explicit source/target sides, never by ambiguous type labels.
      var pEl=document.getElementById('battlePlayer'),eEl=document.getElementById('battleEnemy')
      result.events.forEach(function(ev){animateBattleEvent(ev,pEl,eEl)})
    }catch(err){
      /* v2.5.0：引擎异常 → 按「异常中止」收尾；不再改 HP、不再判胜、不再走 endBattle(true)
         发奖并推进关卡。console.error 留在 catch 现场（本项目禁止静默 catch）。 */
      console.error('single battle tick failed ('+stage+'):',err)
      endBattleAborted(err,{stage:stage})
      return
    }
    if(_battle.done){endBattle(_battle.winner);_battleRunning=false;return}
    /* 间隔 = 基准 ÷ 当前速度档位（每次调度都读 `_battleSpeed`，战斗中改档立即生效） */
    _battleTimer=setTimeout(tick,battleStepDelay(BATTLE_STEP_BASE_MS,_battleSpeed))
  }
  tick()
}

function renderBattleHP(){
  document.getElementById('bpHP').style.width=Math.max(0,_battle.player.hp/(_battle.player.maxHP||1)*100)+'%'
  document.getElementById('bpHPText').textContent='HP: '+Math.max(0,_battle.player.hp)
  document.getElementById('beHP').style.width=Math.max(0,_battle.enemy.hp/_battle.enemy.maxHP*100)+'%'
  document.getElementById('beHPText').textContent='HP: '+Math.max(0,_battle.enemy.hp)+'/'+_battle.enemy.maxHP
}

function addBattleLog(msg,type,targetSide){
  const el=document.getElementById('battleLog')
  const cls=type==='damage'?(targetSide==='player'?'bl-def':'bl-dmg'):(type==='dmg'?'bl-dmg':type==='e'?'bl-def':'')
  const div=document.createElement('div');div.className='bl-entry '+cls
  div.textContent='▸ '+msg;el.appendChild(div);el.scrollTop=el.scrollHeight
}

function showImpact(targetEl,ev){
  if(!targetEl||!ev.msg)return;
  var num=(typeof ev.hpDamage==='number')?String(ev.hpDamage):ev.msg.replace(/[^0-9\-]/g,'');
  if(!num||Number(num)<=0)return;
  var impact=document.createElement('div');impact.className='bc-impact';
  impact.textContent=(ev.sourceSide==='player'?'💥':'✨')+num;
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
    // 🎁 先取"被击败的关卡"再推进 current，否则战利品会错按下一关类型结算
    var beatenLv=findLevel(g.current)||{}
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
    // 🎁 Victory loot: refine points (banked, spendable once soul refinement unlocked)
    var loot=rollLoot(beatenLv)
    var ref=getRefine()
    ref.points=(ref.points||0)+loot.points
    saveRefine(ref)
    var lootLine='<div class="be-loot">🎁 战利品 +'+loot.points+' 炼化点'+(loot.mult>2?'（BOSS ×10）': '')+(ref.unlocked?'':'（通关 9-6 解锁炼魂后可用）')+'</div>'
    el.innerHTML='<div class="be-result be-win">🏆 胜利！</div>'+lootLine+'<div class="be-replay"><button class="be-btn be-btn-next" id="battleNext">下一关 →</button><button class="be-btn be-btn-retry" id="battleShare">📤 分享卡片</button></div>'
    celebrate()
    if(_battleAuto&&nextId){
      el.innerHTML+='<div style="font-size:var(--fs-2xs);color:var(--text3);text-align:center;margin-top:6px">🔄 自动模式：2秒后进入下一关...</div>'
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

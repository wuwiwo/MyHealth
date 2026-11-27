/* ============================================
   MyHealth — Constants & Utilities
   ============================================ */

const APP_VERSION = '2.14.37';

/* ========== CONSTANTS ========== */
const COMMON_W = [1,2,3,4,5,6,7,8,10,12,15,20,25];
const INTENSITY_LEVELS = [
  {id:1,name:'低强度',emoji:'🟢'},
  {id:2,name:'中强度',emoji:'🟡'},
  {id:3,name:'高强度',emoji:'🔴'}
];

/* ========== UTILITIES ========== */
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function toDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseDate(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function fmtDate(s){const d=parseDate(s);const w=['周日','周一','周二','周三','周四','周五','周六'];const i=s===today();return{main:(d.getMonth()+1)+'月'+d.getDate()+'日',sub:i?w[d.getDay()]+' · 今天':w[d.getDay()]}}

/* ========== MINI MARKDOWN RENDERER ========== */
function renderMd(src){
  if(!src)return'';
  var s=String(src);
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var lines=s.split(/\r?\n/);
  var html='',inList=false;
  function escInline(t){
    return t
      .replace(/`([^`]+)`/g,'<code style="background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:.85em">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  }
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(/^#\s+/.test(line)){
      if(inList){html+='</ul>';inList=false}
      html+='<div style="font-weight:700;font-size:var(--fs-base);margin:6px 0 4px">'+escInline(line.replace(/^#\s+/,''))+'</div>';
    }else if(/^-\s+/.test(line)){
      if(!inList){html+='<ul style="margin:4px 0;padding-left:18px;list-style:disc">';inList=true}
      html+='<li style="font-size:var(--fs-sm);line-height:1.6">'+escInline(line.replace(/^-\s+/,''))+'</li>';
    }else if(/^\s*$/.test(line)){
      if(inList){html+='</ul>';inList=false}
      html+='<div style="height:6px"></div>';
    }else{
      if(inList){html+='</ul>';inList=false}
      html+='<div style="font-size:var(--fs-sm);line-height:1.6;margin:2px 0">'+escInline(line)+'</div>';
    }
  }
  if(inList)html+='</ul>';
  return html;
}

function mdFirstLine(src){
  if(!src)return'';
  var line=String(src).split(/\r?\n/)[0]||'';
  return line.replace(/^#\s+/,'').replace(/^-\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1');
}

/* ========== TOAST ========== */
/* P0-9：每条独立计时（原来单例 timer + innerHTML='' 会让连发的两条互相截断），
   最多同屏 3 条，role=status 供读屏播报。 */
function toast(m,t){const c=document.getElementById('toastC')
if(!c)return;const o=document.createElement('div');o.className='toast'+(t?' toast-'+t:'')
o.setAttribute('role','status');o.setAttribute('aria-live','polite')
o.textContent=(t==='s'?'✅':t==='e'?'😅':'💪')+' '+m;c.appendChild(o)
while(c.children.length>3)c.removeChild(c.firstChild)
setTimeout(()=>{o.classList.add('out');setTimeout(()=>{if(o.parentNode)o.remove()},220)},2000)}

/* ========== MODAL ========== */
/* Create an overlay modal, append to body, return the element.
   P0-11 增强：role=dialog / aria-modal、ESC 关闭、焦点陷阱、body 滚动锁定、
   关闭后焦点归还触发元素。调用方零改动。
   opts.noBackdrop —— 调用方自行管理关闭（遮罩点击不关）。
   返回的 modal 上挂 _close()，供调用方主动关闭并正确解锁滚动。 */

/* 滚动锁定：引用计数支持嵌套模态。
   ★ v2.1.6 修复「页面永久无法滚动」：
   兜底 observer 原先是共享全局 `_mo`，导致 ① 嵌套时第二个模态拿不到兜底；
   ② A 的 close() 会无差别 disconnect 掉属于 B 的 observer。
   任一模态因此漏解锁 → _scrollLock 卡住 → body 永久 position:fixed。
   现改为**每个模态各自持有** observer，且 close() 幂等。 */
let _scrollLock=0,_scrollY=0
function _lockScroll(){
  if(_scrollLock++>0)return
  _scrollY=window.scrollY||document.documentElement.scrollTop||0
  document.body.style.position='fixed';document.body.style.top=(-_scrollY)+'px';document.body.style.width='100%'
}
function _unlockScroll(){
  if(_scrollLock===0)return
  if(--_scrollLock>0)return
  _scrollLock=0
  document.body.style.position='';document.body.style.top='';document.body.style.width=''
  window.scrollTo(0,_scrollY)
}
/* 仅供测试断言：模态全部关闭后必须回落到 0 */
function _scrollLockCount(){return _scrollLock}
function openModal(html,id,opts){
  const modal=document.createElement('div');modal.className='modal-overlay open'
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true')
  modal.dataset.modalManaged='1'   // 标记：由 openModal 托管，全局点击处理器才能代管关闭
  if(id)modal.id=id
  if(html!=null)modal.innerHTML=html
  document.body.appendChild(modal)

  const prevFocus=document.activeElement
  _lockScroll()
  let closed=false, mo=null

  function close(){
    if(closed)return   // 幂等：自身处理器与 app.js 全局兜底可能重复调用，避免重复解锁
    closed=true
    document.removeEventListener('keydown',onKey)
    if(mo){mo.disconnect();mo=null}   // 只断自己持有的 observer
    if(modal.parentNode)modal.remove()
    _unlockScroll()
    if(prevFocus&&prevFocus.focus&&document.contains(prevFocus))prevFocus.focus()
  }
  function onKey(e){
    if(e.key==='Escape'){close();return}
    if(e.key!=='Tab')return
    const f=modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
    if(!f.length)return
    const first=f[0],last=f[f.length-1]
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
  // 兜底：调用方若直接 modal.remove()（不经 _close），滚动锁必须照样解除
  if(window.MutationObserver){
    mo=new MutationObserver(function(){ if(!modal.isConnected)close() })
    mo.observe(document.body,{childList:true})
  }
  document.addEventListener('keydown',onKey)
  if(!(opts&&opts.noBackdrop)){
    modal.addEventListener('click',e=>{if(e.target===e.currentTarget)close()})
  }
  setTimeout(function(){const f=modal.querySelector('button,input,[tabindex]');if(f)f.focus()},50)
  modal._close=close
  return modal
}

/* ========== EMPTY STATE ========== */
/* 统一空态工厂，避免各页面 innerHTML='' 留白。
   v2.14.33（评审 P2-7 收尾）：第 5 参 cls 传入 'empty-compact' 得到紧凑态 ——
   图标与标题同行、CTA 撑满宽度，高度从 ≈190px 降到 ≈120px，
   用于「一屏里并列两个空态」的场景（设置·计划的力量 / 有氧两块）。 */
function emptyHtml(emoji,title,sub,cta,cls){
  return '<div class="empty'+(cls?' '+cls:'')+'"><span class="empty-e">'+(emoji||'📭')+'</span>'
    +'<div class="empty-t">'+title+'</div>'
    +(sub?'<div class="empty-s">'+sub+'</div>':'')
    +(cta||'')+'</div>'
}

/* ========== CELEBRATE ========== */
function celebrate(){const o=document.createElement('div');o.id='cfLayer';o.style='position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden'
const cs=['#F97316','#22C55E','#3B82F6','#A855F7','#EAB308','#EF4444']
for(let i=0;i<30;i++){const c=document.createElement('div')
c.style=`position:absolute;left:${Math.random()*100}%;top:-10px;width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;background:${cs[i%cs.length]};border-radius:${Math.random()>.5?'50%':'2px'};animation:cf${i} ${1.5+Math.random()*2}s linear forwards`
c.id='cf'+i
const s=document.createElement('style');s.textContent=`@keyframes cf${i}{0%{transform:translateY(0) rotate(0deg) scale(0);opacity:1}20%{transform:translateY(20vh) rotate(180deg) scale(1);opacity:1}100%{transform:translateY(100vh) rotate(720deg) scale(.5);opacity:0}}`
c.appendChild(s);o.appendChild(c)}
document.body.appendChild(o);setTimeout(()=>o.remove(),3500)}

/* ========== UNDO DELETE (v2.14.35) ==========
   评审 §18.4：Nielsen 第 3 项「用户控制与自由」唯一扣分是「删除不可撤销」。
   做法：删除后底部出一条 30 秒撤销条，点「撤销」把刚删的条目按**原下标**插回；
   超时或关闭 = 确认删除（数据早已落库，不靠撤销条存活）。
   一次只保留一条：新删除顶掉旧条（旧条目已落库，不再可撤销）。
   只管「本地列表可复原」的删除（动作 / 计划），不碰历史训练记录。 */
var UNDO_MS=30000,_undoTimer=null,_undoTick=null

/* 纯函数：把 item 插回 list 的 index（越界一律追加，不改入参） */
function insertAt(list,item,index){
  var arr=(list||[]).slice()
  var i=(typeof index==='number'&&index>=0&&index<=arr.length)?index:arr.length
  arr.splice(i,0,item)
  return arr
}

function _undoBarHost(){
  var c=document.getElementById('undoC')
  if(!c){c=document.createElement('div');c.id='undoC';c.className='undo-c'
    if(document.body)document.body.appendChild(c)}
  return c
}

function clearUndoBar(){
  if(_undoTimer){clearTimeout(_undoTimer);_undoTimer=null}
  if(_undoTick){clearInterval(_undoTick);_undoTick=null}
  var c=document.getElementById('undoC');if(c)c.innerHTML=''
}

function showUndoBar(text,onUndo){
  var c=_undoBarHost();if(!c)return null
  clearUndoBar()
  var bar=document.createElement('div');bar.className='undo-bar';bar.setAttribute('role','status')
  var t=document.createElement('span');t.className='undo-txt';t.textContent=text
  /* 时限用独立小标签 + 每秒倒数：写进正文会被 360px 截断（v2.14.35 真机踩到过）。
     aria-hidden —— 读屏只念一次正文，不每秒播报数字。 */
  var sec=document.createElement('span');sec.className='undo-sec';sec.setAttribute('aria-hidden','true')
  var left=Math.round(UNDO_MS/1000);sec.textContent=left+'s'
  var b=document.createElement('button');b.className='undo-btn';b.type='button';b.textContent='撤销'
  var x=document.createElement('button');x.className='undo-x';x.type='button';x.setAttribute('aria-label','关闭撤销提示');x.textContent='✕'
  b.addEventListener('click',function(){
    if(_undoTimer){clearTimeout(_undoTimer);_undoTimer=null}
    if(_undoTick){clearInterval(_undoTick);_undoTick=null}
    try{onUndo()}catch(e){toast('恢复失败','e')}
    c.innerHTML='';toast('已恢复','s')
  })
  x.addEventListener('click',clearUndoBar)
  bar.appendChild(t);bar.appendChild(sec);bar.appendChild(b);bar.appendChild(x);c.appendChild(bar)
  _undoTick=setInterval(function(){left--;if(left>0)sec.textContent=left+'s'},1000)
  _undoTimer=setTimeout(function(){_undoTimer=null;if(_undoTick){clearInterval(_undoTick);_undoTick=null}
    if(bar.parentNode)bar.parentNode.removeChild(bar)},UNDO_MS)
  return bar
}

/* ========== THEME ========== */
/* P0-10：三态 system / dark / light，默认跟随系统。
   旧存档里存的是 'dark' / 'light' 字符串，对新逻辑同样成立，无需迁移。 */
var _sysMq=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null
function getTheme(){return store.get('theme')||'system'}
function effTheme(){var t=getTheme();return t==='system'?(_sysMq&&_sysMq.matches?'light':'dark'):t}
function setTheme(t){store.set('theme',t)
const d=effTheme()==='dark';document.documentElement.setAttribute('data-theme',d?'':'light')
var btn=document.getElementById('themeToggle')
/* v2.14.29：按钮从「单个 emoji」变成「图标 + 文案」，所以只换 `.hb-ico`，不能整块 textContent（会把「主题」两个字冲掉） */
if(btn){var ico=btn.querySelector('.hb-ico');(ico||btn).textContent=d?'🌙':'☀️';btn.setAttribute('aria-label','切换主题，当前'+(d?'深色':'浅色'))}}
function toggleTheme(){setTheme(effTheme()==='dark'?'light':'dark')}
if(_sysMq&&_sysMq.addEventListener)_sysMq.addEventListener('change',function(){if(getTheme()==='system')setTheme('system')})

/* ========== EXERCISE LIBRARY (data layer in app.js) ========== */
/* getExercises/saveExercises/getExerciseMap/getStrengthExercises/getCardioExercises
   are defined in app.js (loaded after utils.js). */

/* ========== EXERCISE MEDIA URL HELPER ========== */
/* rel 如 'images/0001-x.jpg'；图床优先(MEDIA_BASE)，onerror 回退本地 */
function exMediaUrl(rel){ return EXD ? EXD.mediaUrls(rel) : { primary: 'media/' + rel, fallback: null }; }

/* ========== CARDIO TYPES (read from exercises library) ========== */
function getAllCardioTypes(){
  var fromLib=getCardioExercises();
  if(fromLib.length>0){
    return fromLib.map(function(ex){
      return {id:ex.id,name:ex.name,emoji:ex.emoji||'🏃',hasDist:ex.hasDist!==false,intensity:ex.intensity||2};
    });
  }
  // Fallback: legacy custom types (pre-v1.6 data before migration runs)
  var custom=store.get('cardioTypes')||[];
  return custom.length>0?custom:[];
}
function getCardioTypeMap(){
  var map={};
  getAllCardioTypes().forEach(function(t){map[t.id]=t});
  return map;
}

/* ========== WEIGHT GRID BUILDER ========== */
function buildWtGrid(c,sel,onChg){c.innerHTML=''
COMMON_W.forEach(w=>{const b=document.createElement('button')
b.className='wt-btn'+(w===sel?' selected':'');b.textContent=w;b.dataset.w=w
b.addEventListener('click',()=>{c.querySelectorAll('.wt-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');if(onChg)onChg(w)})
c.appendChild(b)})}


/* ================= v2.1.27 战斗随机作用域 =================
   ⚠️ 必须定义在 utils.js（index.html 里最早加载）：skill.js / talent.js / ai.js /
   terrain.js / affix.js / enemy.js / pet-codex.js 等都会调用 battleRnd()。
   若定义在后面才加载的模块里，只加载部分文件的测试沙箱会 ReferenceError。

   战斗进行中 → 用本场种子 RNG（可复现 / 可回退）；未开战 → 回退 Math.random（行为不变）。 */
var _BATTLE_RNG = null;
function battleRnd() { return _BATTLE_RNG ? _BATTLE_RNG() : Math.random(); }
function setBattleRng(fn) { _BATTLE_RNG = fn || null; }
function makeSeededRng(seed) {
  var a = (seed >>> 0) || 1;
  function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  rnd.getState = function () { return a; };
  rnd.setState = function (st) { a = (st >>> 0) || 1; };
  rnd.seed = (seed >>> 0) || 1;
  return rnd;
}
function beginBattleRng(seed) { var r = makeSeededRng(seed); _BATTLE_RNG = r; return r; }

/* ========== MODAL FOCUS TRAP（v2.14.34，评审 §6「键盘焦点顺序未验证」的收回） ========== */
/* 问题（实测）：弹窗打开后焦点仍留在背后的页面，键盘用户按 Tab 会走到被遮住的 #syncBtn /
   #themeToggle / 四个 tab 按钮上；关闭弹窗后焦点也不回到打开它的那个按钮。
   做法：**容器级**接管，不改 12 个调用点 —— 所有弹层最终都变成可见的 `.modal-sheet` / `.modal`，
   所以只需 ① 观察 DOM 变化 → 有弹层就把焦点送进去、没有就还给原来的元素；
   ② 捕获阶段拦 Tab → 在弹层内部首尾环回。Esc 关闭的既有行为不动（各弹层自己的按钮负责关）。 */
var MODAL_FOCUS_SEL = '.modal-sheet,.modal';
var _modalPrevFocus = null;

function modalTrapSheet() {
  var sheets = document.querySelectorAll(MODAL_FOCUS_SEL);
  for (var i = sheets.length - 1; i >= 0; i--) {
    var s = sheets[i];
    var cs = getComputedStyle(s);
    if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && s.getClientRects().length) return s;
  }
  return null;
}
function modalFocusables(sheet) {
  return Array.prototype.slice.call(sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]'))
    .filter(function (n) {
      if (n.disabled) return false;
      var ti = n.getAttribute('tabindex');
      if (ti !== null && Number(ti) < 0) return false;
      var cs = getComputedStyle(n);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && n.getClientRects().length > 0;
    });
}
function modalFocusSync() {
  var sheet = modalTrapSheet();
  if (!sheet) {
    /* 弹层已关闭：焦点还给打开它的元素（找不到就放弃，绝不抛错） */
    if (_modalPrevFocus && _modalPrevFocus.focus) { try { _modalPrevFocus.focus(); } catch (e) { /* 忽略：来源元素可能已被重新渲染销毁 */ } }
    _modalPrevFocus = null;
    return;
  }
  if (sheet.contains(document.activeElement)) return;   /* 已在弹层内：不抢焦点 */
  if (!_modalPrevFocus) _modalPrevFocus = document.activeElement;
  var list = modalFocusables(sheet);
  if (!list.length) return;
  try { list[0].focus(); } catch (e) { /* 忽略：元素不可聚焦（如 disabled 竞态） */ }
}
function modalTrapKeydown(e) {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  var sheet = modalTrapSheet();
  if (!sheet) return;
  var list = modalFocusables(sheet);
  if (!list.length) { e.preventDefault(); return; }
  var i = list.indexOf(document.activeElement);
  if (e.shiftKey) {
    if (i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
  } else if (i === -1 || i === list.length - 1) {
    e.preventDefault(); list[0].focus();
  }
}
function initModalFocusTrap() {
  if (window.__modalTrapOn) return;
  window.__modalTrapOn = true;
  document.addEventListener('keydown', modalTrapKeydown, true);
  if (typeof MutationObserver === 'function' && document.body) {
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; modalFocusSync(); }, 0);   /* 合并同一帧的连续变动 */
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  modalFocusSync();
}
/* 沙箱（vm 里只有最小 stub）不执行：缺 body / addEventListener / querySelectorAll 一律跳过，
   否则 test 沙箱那层假 document 会在加载时直接抛 TypeError（v2.14.34 实测踩到 4 套件）。 */
if (typeof document !== 'undefined' && document && document.body
  && typeof document.addEventListener === 'function'
  && typeof document.querySelectorAll === 'function') initModalFocusTrap();


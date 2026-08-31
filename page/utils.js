/* ============================================
   MyHealth — Constants & Utilities
   ============================================ */

const APP_VERSION = '1.10.5';

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
      html+='<div style="font-weight:700;font-size:.9rem;margin:6px 0 4px">'+escInline(line.replace(/^#\s+/,''))+'</div>';
    }else if(/^-\s+/.test(line)){
      if(!inList){html+='<ul style="margin:4px 0;padding-left:18px;list-style:disc">';inList=true}
      html+='<li style="font-size:.78rem;line-height:1.6">'+escInline(line.replace(/^-\s+/,''))+'</li>';
    }else if(/^\s*$/.test(line)){
      if(inList){html+='</ul>';inList=false}
      html+='<div style="height:6px"></div>';
    }else{
      if(inList){html+='</ul>';inList=false}
      html+='<div style="font-size:.78rem;line-height:1.6;margin:2px 0">'+escInline(line)+'</div>';
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
let _tt=null;function toast(m,t){const c=document.getElementById('toastC')
if(!c)return;const o=document.createElement('div');o.className='toast'+(t?' toast-'+t:'')
o.textContent=(t==='s'?'✅':t==='e'?'😅':'💪')+' '+m;c.appendChild(o)
clearTimeout(_tt);_tt=setTimeout(()=>c.innerHTML='',2200)}

/* ========== MODAL ========== */
/* Create an overlay modal, append to body, return the element.
   Overlay click (on the backdrop itself) dismisses it, unless
   opts.noBackdrop is set (caller manages closing manually). */
function openModal(html,id,opts){
  const modal=document.createElement('div');modal.className='modal-overlay open'
  if(id)modal.id=id
  if(html!=null)modal.innerHTML=html
  document.body.appendChild(modal)
  if(!(opts&&opts.noBackdrop)){
    modal.addEventListener('click',e=>{if(e.target===e.currentTarget)modal.remove()})
  }
  return modal
}

/* ========== CELEBRATE ========== */
function celebrate(){const o=document.createElement('div');o.style='position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden'
const cs=['#F97316','#22C55E','#3B82F6','#A855F7','#EAB308','#EF4444']
for(let i=0;i<30;i++){const c=document.createElement('div')
c.style=`position:absolute;left:${Math.random()*100}%;top:-10px;width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;background:${cs[i%cs.length]};border-radius:${Math.random()>.5?'50%':'2px'};animation:cf${i} ${1.5+Math.random()*2}s linear forwards`
c.id='cf'+i
const s=document.createElement('style');s.textContent=`@keyframes cf${i}{0%{transform:translateY(0) rotate(0deg) scale(0);opacity:1}20%{transform:translateY(20vh) rotate(180deg) scale(1);opacity:1}100%{transform:translateY(100vh) rotate(720deg) scale(.5);opacity:0}}`
c.appendChild(s);o.appendChild(c)}
document.body.appendChild(o);setTimeout(()=>o.remove(),3500)}

/* ========== THEME ========== */
function getTheme(){return store.get('theme')||'dark'}
function setTheme(t){const d=t==='dark';document.documentElement.setAttribute('data-theme',d?'':'light')
var btn=document.getElementById('themeToggle');if(btn)btn.textContent=d?'🌙':'☀️';store.set('theme',t)}
function toggleTheme(){setTheme(getTheme()==='dark'?'light':'dark')}

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

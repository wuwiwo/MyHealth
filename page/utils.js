/* ============================================
   MyHealth — Constants & Utilities
   ============================================ */

const APP_VERSION = '1.5.1';

/* ========== CONSTANTS ========== */
const COMMON_W = [1,2,3,4,5,6,7,8,10,12,15,20,25];
const EXERCISES = ['二头弯举','肩推','深蹲','卧推','划船','硬拉','侧平举','前平举','锤式弯举','俯身飞鸟','颈后臂屈伸','俯身臂屈伸','直立划船','推举','阿诺德推举','哑铃飞鸟','哑铃耸肩','弓步蹲','保加利亚深蹲','站姿提踵'];
const CARDIO_TYPES = [
  {id:'run',name:'跑步',emoji:'🏃',hasDist:true,intensity:2},
  {id:'jump',name:'跳绳',emoji:'🪢',hasDist:false,intensity:3},
  {id:'cycle',name:'骑行',emoji:'🚴',hasDist:true,intensity:2},
  {id:'swim',name:'游泳',emoji:'🏊',hasDist:true,intensity:3},
  {id:'walk',name:'快走',emoji:'🚶',hasDist:true,intensity:1},
  {id:'hiit',name:'HIIT',emoji:'🔥',hasDist:false,intensity:3}
];
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

/* ========== TOAST ========== */
let _tt=null;function toast(m,t){const c=document.getElementById('toastC')
if(!c)return;const o=document.createElement('div');o.className='toast'+(t?' toast-'+t:'')
o.textContent=(t==='s'?'✅':t==='e'?'😅':'💪')+' '+m;c.appendChild(o)
clearTimeout(_tt);_tt=setTimeout(()=>c.innerHTML='',2200)}

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

/* ========== WEIGHT GRID BUILDER ========== */
function getAllCardioTypes(){
  var custom=store.get('cardioTypes')||[];
  return CARDIO_TYPES.concat(custom);
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

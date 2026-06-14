/* ============================================
   MyHealth — Constants & Utilities
   ============================================ */

const APP_VERSION = '1.3';

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
const LEVELS = {
  chap1:{name:'初出茅庐',levels:[
    {id:'1-1',npc:'见习战士',atk:20,def:10,hp:120},
    {id:'1-2',npc:'斥候兵',atk:30,def:20,hp:180},
    {id:'1-3',npc:'轻装剑士',atk:40,def:20,hp:240}
  ]},
  chap2:{name:'小试牛刀',levels:[
    {id:'2-1',npc:'重装步兵',atk:30,def:40,hp:300},
    {id:'2-2',npc:'弓弩手',atk:60,def:10,hp:220},
    {id:'2-3',npc:'骑兵',atk:70,def:30,hp:280}
  ]},
  chap3:{name:'锋芒初露',levels:[
    {id:'3-1',npc:'精英卫兵',atk:50,def:50,hp:400},
    {id:'3-2',npc:'暗影刺客',atk:90,def:20,hp:300},
    {id:'3-3',npc:'铁甲统领',atk:60,def:60,hp:500}
  ]},
  chap4:{name:'身经百战',levels:[
    {id:'4-1',npc:'狂战士',atk:80,def:30,hp:600},
    {id:'4-2',npc:'盾卫者',atk:40,def:80,hp:700},
    {id:'4-3',npc:'猎手',atk:100,def:20,hp:450},
    {id:'4-4',npc:'重骑兵',atk:90,def:50,hp:550},
    {id:'4-5',npc:'咒术师',atk:110,def:30,hp:500},
    {id:'4-6',npc:'BOSS 暗龙',atk:70,def:60,hp:900,boss:true}
  ]},
  chap5:{name:'浴血奋战',levels:[
    {id:'5-1',npc:'死士',atk:100,def:40,hp:650},
    {id:'5-2',npc:'铁卫',atk:60,def:90,hp:800},
    {id:'5-3',npc:'刺客大师',atk:130,def:30,hp:500},
    {id:'5-4',npc:'战争使徒',atk:110,def:60,hp:700},
    {id:'5-5',npc:'毁灭者',atk:140,def:40,hp:600},
    {id:'5-6',npc:'大魔导师',atk:120,def:70,hp:750}
  ]},
  chap6:{name:'终极试炼',levels:[
    {id:'6-1',npc:'深渊守卫',atk:120,def:60,hp:850},
    {id:'6-2',npc:'暗影领主',atk:150,def:40,hp:700},
    {id:'6-3',npc:'钢铁巨像',atk:80,def:100,hp:1000},
    {id:'6-4',npc:'混沌骑士',atk:140,def:70,hp:800},
    {id:'6-5',npc:'灭世者',atk:170,def:50,hp:750},
    {id:'6-6',npc:'BOSS 远古龙王',atk:100,def:80,hp:1200,boss:true}
  ]}
};

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

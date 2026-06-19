/* ============================================
   MyHealth — Level Configuration
   ============================================ */

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
  ]},
  chap7:{name:'深渊试炼',levels:[
    {id:'7-1',npc:'深渊哨兵',atk:130,def:70,hp:900},
    {id:'7-2',npc:'暗影猎手',atk:150,def:50,hp:800},
    {id:'7-3',npc:'熔岩战士',atk:120,def:90,hp:1100},
    {id:'7-4',npc:'冰霜法师',atk:170,def:40,hp:850},
    {id:'7-5',npc:'雷霆骑士',atk:160,def:70,hp:1000},
    {id:'7-6',npc:'BOSS 深渊领主',atk:140,def:80,hp:1400,boss:true}
  ]},
  chap8:{name:'混沌领域',levels:[
    {id:'8-1',npc:'混沌步兵',atk:170,def:80,hp:1200},
    {id:'8-2',npc:'虚空行者',atk:190,def:60,hp:1000},
    {id:'8-3',npc:'烈焰巨兽',atk:150,def:110,hp:1500},
    {id:'8-4',npc:'风暴使者',atk:200,def:70,hp:1100},
    {id:'8-5',npc:'暗黑骑士',atk:180,def:90,hp:1300},
    {id:'8-6',npc:'BOSS 混沌之王',atk:170,def:100,hp:1800,boss:true}
  ]},
  chap9:{name:'终极巅峰',levels:[
    {id:'9-1',npc:'巅峰卫士',atk:200,def:100,hp:1600},
    {id:'9-2',npc:'毁灭之翼',atk:230,def:80,hp:1400},
    {id:'9-3',npc:'不朽者',atk:180,def:130,hp:2000},
    {id:'9-4',npc:'末日使者',atk:250,def:90,hp:1500},
    {id:'9-5',npc:'至高骑士',atk:220,def:110,hp:1800},
    {id:'9-6',npc:'BOSS 终焉之王',atk:200,def:120,hp:2500,boss:true}
  ]}
};

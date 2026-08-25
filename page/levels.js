/* ============================================
   MyHealth — Level Configuration
   ============================================ */

const LEVELS = {
  chap1:{name:'初出茅庐',levels:[
    {id:'1-1',npc:'见习战士',atk:20,def:10,hp:120,soulAtk:0,soulDef:0},
    {id:'1-2',npc:'斥候兵',atk:30,def:20,hp:180,soulAtk:0,soulDef:0},
    {id:'1-3',npc:'轻装剑士',atk:40,def:20,hp:240,soulAtk:0,soulDef:0}
  ]},
  chap2:{name:'小试牛刀',levels:[
    {id:'2-1',npc:'重装步兵',atk:30,def:40,hp:300,soulAtk:0,soulDef:0},
    {id:'2-2',npc:'弓弩手',atk:60,def:10,hp:220,soulAtk:0,soulDef:0},
    {id:'2-3',npc:'骑兵',atk:70,def:30,hp:280,soulAtk:0,soulDef:0}
  ]},
  chap3:{name:'锋芒初露',levels:[
    {id:'3-1',npc:'精英卫兵',atk:50,def:50,hp:400,soulAtk:0,soulDef:0},
    {id:'3-2',npc:'暗影刺客',atk:90,def:20,hp:300,soulAtk:0,soulDef:0},
    {id:'3-3',npc:'铁甲统领',atk:60,def:60,hp:500,soulAtk:0,soulDef:0}
  ]},
  chap4:{name:'身经百战',levels:[
    {id:'4-1',npc:'狂战士',atk:80,def:30,hp:600,soulAtk:0,soulDef:0},
    {id:'4-2',npc:'盾卫者',atk:40,def:80,hp:700,soulAtk:0,soulDef:0},
    {id:'4-3',npc:'猎手',atk:100,def:20,hp:450,soulAtk:0,soulDef:0},
    {id:'4-4',npc:'重骑兵',atk:90,def:50,hp:550,soulAtk:0,soulDef:0},
    {id:'4-5',npc:'咒术师',atk:110,def:30,hp:500,soulAtk:0,soulDef:0},
    {id:'4-6',npc:'BOSS 暗龙',atk:70,def:60,hp:900,boss:true}
  ]},
  chap5:{name:'浴血奋战',levels:[
    {id:'5-1',npc:'死士',atk:100,def:40,hp:650,soulAtk:0,soulDef:0},
    {id:'5-2',npc:'铁卫',atk:60,def:90,hp:800,soulAtk:0,soulDef:0},
    {id:'5-3',npc:'刺客大师',atk:130,def:30,hp:500,soulAtk:0,soulDef:0},
    {id:'5-4',npc:'战争使徒',atk:110,def:60,hp:700,soulAtk:0,soulDef:0},
    {id:'5-5',npc:'毁灭者',atk:140,def:40,hp:600,soulAtk:0,soulDef:0},
    {id:'5-6',npc:'大魔导师',atk:120,def:70,hp:750,soulAtk:0,soulDef:0}
  ]},
  chap6:{name:'终极试炼',levels:[
    {id:'6-1',npc:'深渊守卫',atk:120,def:60,hp:850,soulAtk:0,soulDef:0},
    {id:'6-2',npc:'暗影领主',atk:150,def:40,hp:700,soulAtk:0,soulDef:0},
    {id:'6-3',npc:'钢铁巨像',atk:80,def:100,hp:1000,soulAtk:0,soulDef:0},
    {id:'6-4',npc:'混沌骑士',atk:140,def:70,hp:800,soulAtk:0,soulDef:0},
    {id:'6-5',npc:'灭世者',atk:170,def:50,hp:750,soulAtk:0,soulDef:0},
    {id:'6-6',npc:'BOSS 远古龙王',atk:100,def:80,hp:1200,boss:true}
  ]},
  chap7:{name:'深渊试炼',levels:[
    {id:'7-1',npc:'深渊哨兵',atk:130,def:70,hp:900,soulAtk:0,soulDef:0},
    {id:'7-2',npc:'暗影猎手',atk:150,def:50,hp:800,soulAtk:0,soulDef:0},
    {id:'7-3',npc:'熔岩战士',atk:120,def:90,hp:1100,soulAtk:0,soulDef:0},
    {id:'7-4',npc:'冰霜法师',atk:170,def:40,hp:850,soulAtk:0,soulDef:0},
    {id:'7-5',npc:'雷霆骑士',atk:160,def:70,hp:1000,soulAtk:0,soulDef:0},
    {id:'7-6',npc:'BOSS 深渊领主',atk:140,def:80,hp:1400,boss:true}
  ]},
  chap8:{name:'混沌领域',levels:[
    {id:'8-1',npc:'混沌步兵',atk:170,def:80,hp:1200,soulAtk:0,soulDef:0},
    {id:'8-2',npc:'虚空行者',atk:190,def:60,hp:1000,soulAtk:0,soulDef:0},
    {id:'8-3',npc:'烈焰巨兽',atk:150,def:110,hp:1500,soulAtk:0,soulDef:0},
    {id:'8-4',npc:'风暴使者',atk:200,def:70,hp:1100,soulAtk:0,soulDef:0},
    {id:'8-5',npc:'暗黑骑士',atk:180,def:90,hp:1300,soulAtk:0,soulDef:0},
    {id:'8-6',npc:'BOSS 混沌之王',atk:170,def:100,hp:1800,boss:true}
  ]},
  chap9:{name:'终极巅峰',levels:[
    {id:'9-1',npc:'巅峰卫士',atk:200,def:100,hp:1600,soulAtk:0,soulDef:0},
    {id:'9-2',npc:'毁灭之翼',atk:230,def:80,hp:1400,soulAtk:0,soulDef:0},
    {id:'9-3',npc:'不朽者',atk:180,def:130,hp:2000,soulAtk:0,soulDef:0},
    {id:'9-4',npc:'末日使者',atk:250,def:90,hp:1500,soulAtk:0,soulDef:0},
    {id:'9-5',npc:'至高骑士',atk:220,def:110,hp:1800,soulAtk:0,soulDef:0},
    {id:'9-6',npc:'BOSS 终焉之王',atk:200,def:120,hp:2500,soulAtk:0,soulDef:0,boss:true}
  ]},
  chap10:{name:'灵魂觉醒',levels:[
    {id:'10-1',npc:'灵魂新手',atk:280,def:140,hp:2200,soulAtk:50,soulDef:30},
    {id:'10-2',npc:'灵魂战士',atk:320,def:160,hp:2400,soulAtk:80,soulDef:40},
    {id:'10-3',npc:'灵魂守护',atk:250,def:200,hp:3000,soulAtk:60,soulDef:80},
    {id:'10-4',npc:'灵魂刺客',atk:380,def:120,hp:2200,soulAtk:120,soulDef:30},
    {id:'10-5',npc:'灵魂法师',atk:350,def:150,hp:2600,soulAtk:150,soulDef:50},
    {id:'10-6',npc:'BOSS 灵魂之王',atk:300,def:180,hp:3500,soulAtk:100,soulDef:100,boss:true}
  ]},
  chap11:{name:'深渊炼狱',levels:[
    {id:'11-1',npc:'炼狱守门人',atk:400,def:180,hp:3200,soulAtk:120,soulDef:60},
    {id:'11-2',npc:'炼狱执行者',atk:450,def:160,hp:3000,soulAtk:160,soulDef:50},
    {id:'11-3',npc:'炼狱审判长',atk:380,def:220,hp:3800,soulAtk:100,soulDef:120},
    {id:'11-4',npc:'炼狱魔将',atk:480,def:200,hp:3400,soulAtk:180,soulDef:70},
    {id:'11-5',npc:'炼狱炎魔',atk:520,def:170,hp:3200,soulAtk:220,soulDef:60},
    {id:'11-6',npc:'BOSS 炼狱主宰',atk:420,def:220,hp:4500,soulAtk:160,soulDef:140,boss:true}
  ]},
  chap12:{name:'虚空裂缝',levels:[
    {id:'12-1',npc:'虚空游荡者',atk:500,def:220,hp:4000,soulAtk:180,soulDef:80},
    {id:'12-2',npc:'虚空撕裂者',atk:560,def:200,hp:3800,soulAtk:240,soulDef:70},
    {id:'12-3',npc:'虚空巨兽',atk:450,def:280,hp:4800,soulAtk:150,soulDef:160},
    {id:'12-4',npc:'虚空法师',atk:600,def:210,hp:3600,soulAtk:280,soulDef:80},
    {id:'12-5',npc:'虚空领主',atk:580,def:240,hp:4200,soulAtk:260,soulDef:100},
    {id:'12-6',npc:'BOSS 虚空之眼',atk:500,def:260,hp:5500,soulAtk:220,soulDef:180,boss:true}
  ]},
  chap13:{name:'神域之门',levels:[
    {id:'13-1',npc:'神域守卫',atk:600,def:280,hp:5000,soulAtk:240,soulDef:100},
    {id:'13-2',npc:'神域审判官',atk:680,def:250,hp:4800,soulAtk:320,soulDef:90},
    {id:'13-3',npc:'神域巨人',atk:550,def:350,hp:6000,soulAtk:200,soulDef:200},
    {id:'13-4',npc:'神域使者',atk:720,def:270,hp:4600,soulAtk:360,soulDef:110},
    {id:'13-5',npc:'神域裁决者',atk:700,def:300,hp:5200,soulAtk:340,soulDef:130},
    {id:'13-6',npc:'BOSS 神域之主',atk:620,def:320,hp:6500,soulAtk:280,soulDef:220,boss:true}
  ]},
  chap14:{name:'万物归一',levels:[
    {id:'14-1',npc:'归一行者',atk:750,def:350,hp:6000,soulAtk:320,soulDef:130},
    {id:'14-2',npc:'归一剑圣',atk:820,def:320,hp:5800,soulAtk:400,soulDef:120},
    {id:'14-3',npc:'归一巨神',atk:680,def:420,hp:7000,soulAtk:280,soulDef:250},
    {id:'14-4',npc:'归一魔导',atk:880,def:350,hp:5600,soulAtk:440,soulDef:140},
    {id:'14-5',npc:'归一天尊',atk:850,def:380,hp:6200,soulAtk:420,soulDef:160},
    {id:'14-6',npc:'BOSS 归一之灵',atk:780,def:400,hp:7800,soulAtk:360,soulDef:280,boss:true}
  ]},
  chap15:{name:'永恒之战',levels:[
    {id:'15-1',npc:'永恒战士',atk:900,def:420,hp:7000,soulAtk:400,soulDef:160},
    {id:'15-2',npc:'永恒法师',atk:980,def:390,hp:6800,soulAtk:480,soulDef:150},
    {id:'15-3',npc:'永恒巨像',atk:820,def:500,hp:8200,soulAtk:360,soulDef:300},
    {id:'15-4',npc:'永恒刺客',atk:1050,def:420,hp:6600,soulAtk:520,soulDef:170},
    {id:'15-5',npc:'永恒天神',atk:1020,def:450,hp:7200,soulAtk:500,soulDef:190},
    {id:'15-6',npc:'BOSS 永恒之主',atk:950,def:480,hp:9000,soulAtk:450,soulDef:350,boss:true}
  ]},
  chap16:{name:'破晓远征',levels:[
    {id:'16-1',npc:'破晓先锋',atk:1000,def:460,hp:7800,soulAtk:440,soulDef:180},
    {id:'16-2',npc:'破晓游侠',atk:1090,def:430,hp:7600,soulAtk:530,soulDef:170},
    {id:'16-3',npc:'破晓巨兽',atk:910,def:550,hp:9100,soulAtk:400,soulDef:330},
    {id:'16-4',npc:'破晓猎影',atk:1160,def:460,hp:7300,soulAtk:570,soulDef:190},
    {id:'16-5',npc:'破晓圣裁',atk:1130,def:500,hp:8000,soulAtk:550,soulDef:210},
    {id:'16-6',npc:'BOSS 破晓之神',atk:1050,def:530,hp:10000,soulAtk:500,soulDef:385,boss:true,dualAffix:true}
  ]},
  chap17:{name:'星陨之海',levels:[
    {id:'17-1',npc:'星陨水母',atk:1120,def:520,hp:8600,soulAtk:490,soulDef:200},
    {id:'17-2',npc:'潮汐领主',atk:1220,def:480,hp:8400,soulAtk:590,soulDef:185},
    {id:'17-3',npc:'深海古神',atk:1020,def:610,hp:10100,soulAtk:450,soulDef:370},
    {id:'17-4',npc:'星陨猎手',atk:1300,def:510,hp:8100,soulAtk:630,soulDef:210},
    {id:'17-5',npc:'涡流使者',atk:1270,def:560,hp:8900,soulAtk:610,soulDef:235},
    {id:'17-6',npc:'BOSS 星辰深渊之主',atk:1170,def:590,hp:11100,soulAtk:555,soulDef:430,boss:true,dualAffix:true}
  ]},
  chap18:{name:'时空回廊',levels:[
    {id:'18-1',npc:'时序守卫',atk:1240,def:580,hp:9500,soulAtk:545,soulDef:220},
    {id:'18-2',npc:'回廊行者',atk:1350,def:530,hp:9300,soulAtk:650,soulDef:205},
    {id:'18-3',npc:'光阴巨像',atk:1130,def:680,hp:11200,soulAtk:500,soulDef:410},
    {id:'18-4',npc:'岁月刺客',atk:1440,def:570,hp:9000,soulAtk:700,soulDef:230},
    {id:'18-5',npc:'轮回法师',atk:1400,def:620,hp:9900,soulAtk:675,soulDef:260},
    {id:'18-6',npc:'BOSS 时空主宰',atk:1290,def:650,hp:12300,soulAtk:615,soulDef:475,boss:true,dualAffix:true}
  ]},
  chap19:{name:'创世余烬',levels:[
    {id:'19-1',npc:'余烬守望者',atk:1370,def:640,hp:10500,soulAtk:600,soulDef:245},
    {id:'19-2',npc:'灰烬凤凰',atk:1490,def:590,hp:10300,soulAtk:720,soulDef:225},
    {id:'19-3',npc:'创世残响',atk:1250,def:750,hp:12400,soulAtk:550,soulDef:455},
    {id:'19-4',npc:'燎原魔灵',atk:1590,def:630,hp:10000,soulAtk:775,soulDef:255},
    {id:'19-5',npc:'焚天炎尊',atk:1550,def:685,hp:11000,soulAtk:745,soulDef:290},
    {id:'19-6',npc:'BOSS 创世火灵',atk:1430,def:720,hp:13600,soulAtk:680,soulDef:525,boss:true,dualAffix:true}
  ]},
  chap20:{name:'万象归无',levels:[
    {id:'20-1',npc:'归无行者',atk:1510,def:710,hp:11600,soulAtk:665,soulDef:270},
    {id:'20-2',npc:'寂灭之影',atk:1650,def:650,hp:11400,soulAtk:795,soulDef:250},
    {id:'20-3',npc:'虚无巨神',atk:1380,def:830,hp:13700,soulAtk:610,soulDef:505},
    {id:'20-4',npc:'归零魔导',atk:1750,def:700,hp:11100,soulAtk:855,soulDef:280},
    {id:'20-5',npc:'无相天灾',atk:1710,def:760,hp:12200,soulAtk:825,soulDef:320},
    {id:'20-6',npc:'BOSS 归无之渊',atk:1580,def:800,hp:15000,soulAtk:750,soulDef:580,boss:true,dualAffix:true}
  ]},
  chap21:{name:'超越极限',levels:[
    {id:'21-1',npc:'超越战士',atk:1680,def:790,hp:13000,soulAtk:740,soulDef:300},
    {id:'21-2',npc:'超越法皇',atk:1840,def:725,hp:12700,soulAtk:885,soulDef:280},
    {id:'21-3',npc:'极限壁垒',atk:1540,def:925,hp:15300,soulAtk:680,soulDef:560},
    {id:'21-4',npc:'无界剑圣',atk:1950,def:780,hp:12400,soulAtk:955,soulDef:315},
    {id:'21-5',npc:'究极形态',atk:1900,def:845,hp:13600,soulAtk:920,soulDef:355},
    {id:'21-6',npc:'BOSS 超越·无限',atk:1760,def:890,hp:16700,soulAtk:835,soulDef:645,boss:true,dualAffix:true}
  ]}
};

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
    {id:'5-6',npc:'BOSS 大魔导师',atk:120,def:70,hp:750,soulAtk:0,soulDef:0,boss:true}
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
  ]},
  /* v2.1.32：扩到 24 章（dundun 需求）。数值沿用既有的每章 ≈1.113× 斜率，
     关卡形态照抄 chap4 起的固定编排：x-1 均衡 / x-2 高攻低防 / x-3 高防高血 /
     x-4 最高攻 / x-5 次高攻 / x-6 BOSS（dualAffix 双词条，chap16 起惯例）。 */
  chap22:{name:'界限突破',levels:[
    {id:'22-1',npc:'破界哨兵',atk:1870,def:880,hp:14450,soulAtk:825,soulDef:335},
    {id:'22-2',npc:'极光游侠',atk:2050,def:810,hp:14150,soulAtk:985,soulDef:310},
    {id:'22-3',npc:'次元壁垒',atk:1715,def:1030,hp:17050,soulAtk:755,soulDef:625},
    {id:'22-4',npc:'苍穹剑主',atk:2170,def:870,hp:13800,soulAtk:1065,soulDef:350},
    {id:'22-5',npc:'星轨守望',atk:2115,def:940,hp:15150,soulAtk:1025,soulDef:395},
    {id:'22-6',npc:'BOSS 破界之王',atk:1960,def:990,hp:18600,soulAtk:930,soulDef:720,boss:true,dualAffix:true}
  ]},
  chap23:{name:'诸神黄昏',levels:[
    {id:'23-1',npc:'黄昏使者',atk:2080,def:980,hp:16100,soulAtk:920,soulDef:375},
    {id:'23-2',npc:'暮光刺客',atk:2280,def:900,hp:15750,soulAtk:1095,soulDef:345},
    {id:'23-3',npc:'神陨守卫',atk:1910,def:1145,hp:19000,soulAtk:840,soulDef:695},
    {id:'23-4',npc:'陨星魔导',atk:2415,def:970,hp:15350,soulAtk:1185,soulDef:390},
    {id:'23-5',npc:'终末骑士',atk:2355,def:1045,hp:16850,soulAtk:1140,soulDef:440},
    {id:'23-6',npc:'BOSS 黄昏神王',atk:2180,def:1100,hp:20700,soulAtk:1035,soulDef:800,boss:true,dualAffix:true}
  ]},
  chap24:{name:'万象终章',levels:[
    {id:'24-1',npc:'终章守卫',atk:2315,def:1090,hp:17900,soulAtk:1025,soulDef:415},
    {id:'24-2',npc:'万象游魂',atk:2540,def:1000,hp:17550,soulAtk:1220,soulDef:385},
    {id:'24-3',npc:'终焉壁垒',atk:2125,def:1275,hp:21150,soulAtk:935,soulDef:775},
    {id:'24-4',npc:'命运织者',atk:2690,def:1080,hp:17100,soulAtk:1320,soulDef:435},
    {id:'24-5',npc:'万象化身',atk:2620,def:1165,hp:18750,soulAtk:1270,soulDef:490},
    {id:'24-6',npc:'BOSS 万象终焉',atk:2425,def:1225,hp:23050,soulAtk:1150,soulDef:890,boss:true,dualAffix:true}
  ]},
  /* v2.1.34：扩到 27 章（dundun 报 24-6 已通关，要求继续加 3 章）。
     数值与编排沿用 chap22 起同一套规则：每章 ≈1.113×，x-1 均衡 / x-2 高攻低防 /
     x-3 高防高血 / x-4 最高攻 / x-5 次高攻 / x-6 BOSS（dualAffix 双词条）。 */
  chap25:{name:'彼岸之门',levels:[
    {id:'25-1',npc:'彼岸摆渡',atk:2575,def:1215,hp:19900,soulAtk:1140,soulDef:460},
    {id:'25-2',npc:'忘川刺客',atk:2825,def:1115,hp:19550,soulAtk:1360,soulDef:430},
    {id:'25-3',npc:'冥河壁垒',atk:2365,def:1420,hp:23540,soulAtk:1040,soulDef:865},
    {id:'25-4',npc:'黄泉剑主',atk:2995,def:1200,hp:19030,soulAtk:1470,soulDef:485},
    {id:'25-5',npc:'彼岸守望',atk:2915,def:1295,hp:20870,soulAtk:1415,soulDef:545},
    {id:'25-6',npc:'BOSS 彼岸之主',atk:2700,def:1365,hp:25650,soulAtk:1280,soulDef:990,boss:true,dualAffix:true}
  ]},
  chap26:{name:'神座之巅',levels:[
    {id:'26-1',npc:'神座侍者',atk:2865,def:1350,hp:22150,soulAtk:1270,soulDef:510},
    {id:'26-2',npc:'圣光猎手',atk:3145,def:1240,hp:21760,soulAtk:1515,soulDef:480},
    {id:'26-3',npc:'圣殿壁垒',atk:2630,def:1580,hp:26200,soulAtk:1160,soulDef:965},
    {id:'26-4',npc:'天启骑士',atk:3335,def:1335,hp:21180,soulAtk:1635,soulDef:540},
    {id:'26-5',npc:'神座近卫',atk:3245,def:1440,hp:23230,soulAtk:1575,soulDef:605},
    {id:'26-6',npc:'BOSS 神座之主',atk:3005,def:1520,hp:28550,soulAtk:1425,soulDef:1100,boss:true,dualAffix:true}
  ]},
  chap27:{name:'永恒尽头',levels:[
    {id:'27-1',npc:'尽头守望者',atk:3190,def:1500,hp:24650,soulAtk:1415,soulDef:565},
    {id:'27-2',npc:'时空游魂',atk:3500,def:1380,hp:24220,soulAtk:1685,soulDef:535},
    {id:'27-3',npc:'永恒壁垒',atk:2925,def:1760,hp:29160,soulAtk:1290,soulDef:1075},
    {id:'27-4',npc:'无极剑帝',atk:3710,def:1485,hp:23575,soulAtk:1820,soulDef:600},
    {id:'27-5',npc:'永恒神使',atk:3610,def:1600,hp:25855,soulAtk:1755,soulDef:675},
    {id:'27-6',npc:'BOSS 永恒终焉',atk:3345,def:1690,hp:31775,soulAtk:1585,soulDef:1225,boss:true,dualAffix:true}
  ]},
  /* v2.1.35：扩到 30 章（dundun 报 27-6 已通关，要求继续加 3 章）。
     数值与编排沿用 chap22 起同一套规则：每章 ≈1.113×，x-1 均衡 / x-2 高攻低防 /
     x-3 高防高血 / x-4 最高攻 / x-5 次高攻 / x-6 BOSS（dualAffix 双词条）。 */
  chap28:{name:'神话起源',levels:[
    {id:'28-1',npc:'神话守卫',atk:3550,def:1670,hp:27435,soulAtk:1575,soulDef:630},
    {id:'28-2',npc:'起源猎者',atk:3895,def:1535,hp:26955,soulAtk:1875,soulDef:595},
    {id:'28-3',npc:'太初壁垒',atk:3255,def:1960,hp:32455,soulAtk:1435,soulDef:1195},
    {id:'28-4',npc:'太古剑者',atk:4130,def:1655,hp:26240,soulAtk:2025,soulDef:670},
    {id:'28-5',npc:'神话祭司',atk:4020,def:1780,hp:28775,soulAtk:1955,soulDef:750},
    {id:'28-6',npc:'BOSS 神话之主',atk:3725,def:1880,hp:35365,soulAtk:1765,soulDef:1365,boss:true,dualAffix:true}
  ]},
  chap29:{name:'星海王座',levels:[
    {id:'29-1',npc:'星海哨卫',atk:3950,def:1860,hp:30535,soulAtk:1755,soulDef:700},
    {id:'29-2',npc:'彗星猎手',atk:4335,def:1710,hp:30000,soulAtk:2085,soulDef:660},
    {id:'29-3',npc:'星核壁垒',atk:3625,def:2180,hp:36120,soulAtk:1595,soulDef:1330},
    {id:'29-4',npc:'银河剑尊',atk:4595,def:1840,hp:29205,soulAtk:2255,soulDef:745},
    {id:'29-5',npc:'星海执事',atk:4475,def:1980,hp:32025,soulAtk:2175,soulDef:835},
    {id:'29-6',npc:'BOSS 星海之王',atk:4145,def:2090,hp:39360,soulAtk:1965,soulDef:1520,boss:true,dualAffix:true}
  ]},
  chap30:{name:'终极真理',levels:[
    {id:'30-1',npc:'真理守卫',atk:4395,def:2070,hp:33985,soulAtk:1955,soulDef:780},
    {id:'30-2',npc:'终律猎者',atk:4825,def:1905,hp:33390,soulAtk:2320,soulDef:735},
    {id:'30-3',npc:'终极壁垒',atk:4035,def:2425,hp:40200,soulAtk:1775,soulDef:1480},
    {id:'30-4',npc:'万法剑皇',atk:5115,def:2050,hp:32505,soulAtk:2510,soulDef:830},
    {id:'30-5',npc:'真理代言',atk:4980,def:2205,hp:35645,soulAtk:2420,soulDef:930},
    {id:'30-6',npc:'BOSS 终极真理',atk:4615,def:2325,hp:43810,soulAtk:2185,soulDef:1690,boss:true,dualAffix:true}
  ]},
  /* v2.1.36：扩到 33 章（dundun 要求继续加 3 章）。
     数值与编排沿用 chap22 起同一套规则：每章 ≈1.113×，x-1 均衡 / x-2 高攻低防 /
     x-3 高防高血 / x-4 最高攻 / x-5 次高攻 / x-6 BOSS（dualAffix 双词条）。
     ⚠️ LEVELS 是手写数据、没有斜率断言 —— 本版数值由 chap30 用脚本按 1.113× 外推后取 5 的倍数，
        不要手抄手算算错也不会被测试拦住。 */
  chap31:{name:'混沌纪元',levels:[
    {id:'31-1',npc:'混沌守卫',atk:4890,def:2305,hp:37825,soulAtk:2175,soulDef:870},
    {id:'31-2',npc:'纪元猎者',atk:5370,def:2120,hp:37165,soulAtk:2580,soulDef:820},
    {id:'31-3',npc:'混沌壁垒',atk:4490,def:2700,hp:44745,soulAtk:1975,soulDef:1645},
    {id:'31-4',npc:'纪元剑尊',atk:5695,def:2280,hp:36180,soulAtk:2795,soulDef:925},
    {id:'31-5',npc:'混沌先知',atk:5545,def:2455,hp:39675,soulAtk:2695,soulDef:1035},
    {id:'31-6',npc:'BOSS 混沌纪元',atk:5135,def:2590,hp:48760,soulAtk:2430,soulDef:1880,boss:true,dualAffix:true}
  ]},
  chap32:{name:'万古长夜',levels:[
    {id:'32-1',npc:'长夜哨卫',atk:5445,def:2565,hp:42100,soulAtk:2420,soulDef:970},
    {id:'32-2',npc:'万古刺客',atk:5975,def:2360,hp:41365,soulAtk:2870,soulDef:915},
    {id:'32-3',npc:'永夜壁垒',atk:4995,def:3005,hp:49800,soulAtk:2200,soulDef:1830},
    {id:'32-4',npc:'长夜剑帝',atk:6340,def:2540,hp:40270,soulAtk:3110,soulDef:1030},
    {id:'32-5',npc:'万古守望',atk:6170,def:2730,hp:44160,soulAtk:3000,soulDef:1150},
    {id:'32-6',npc:'BOSS 万古长夜',atk:5715,def:2885,hp:54270,soulAtk:2705,soulDef:2090,boss:true,dualAffix:true}
  ]},
  chap33:{name:'太虚无极',levels:[
    {id:'33-1',npc:'太虚守卫',atk:6060,def:2855,hp:46855,soulAtk:2695,soulDef:1080},
    {id:'33-2',npc:'无极猎者',atk:6650,def:2625,hp:46040,soulAtk:3195,soulDef:1020},
    {id:'33-3',npc:'虚源壁垒',atk:5560,def:3345,hp:55425,soulAtk:2450,soulDef:2035},
    {id:'33-4',npc:'无极剑神',atk:7055,def:2825,hp:44820,soulAtk:3460,soulDef:1145},
    {id:'33-5',npc:'太虚代言',atk:6865,def:3040,hp:49150,soulAtk:3340,soulDef:1280},
    {id:'33-6',npc:'BOSS 太虚无极',atk:6360,def:3210,hp:60405,soulAtk:3010,soulDef:2325,boss:true,dualAffix:true}
  ]}
};

/* 测试/工具暴露（生产环境同 window 全局，无副作用） */
if (typeof window !== 'undefined') window.LEVELS = LEVELS;
if (typeof globalThis !== 'undefined' && !globalThis.LEVELS) globalThis.LEVELS = LEVELS;

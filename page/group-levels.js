/* ============================================
   MyHealth — Enemy Group Levels (M2b-6)
   敌群关卡配置（难度阶梯：杂兵→精英→Boss）。
   可选：关卡带 enemies[] → 走群战引擎；不带 → 原单敌战斗（零回归）。
   每个敌人 = {name, tier, talents?, skills?, base:{atk,def,hp,spd,soulAtk?,soulDef?}}
   纯数据。
   ============================================ */

var GROUP_LEVELS = {
  g1: { id: 'g1', name: '试炼·杂兵群', desc: '3 个杂兵，教学向',
    enemies: [
      { name: '杂兵·剑', tier: 'minion', base: { atk: 8, def: 4, hp: 80, spd: 2 } },
      { name: '杂兵·盾', tier: 'minion', base: { atk: 6, def: 8, hp: 100, spd: 1 } },
      { name: '杂兵·弓', tier: 'minion', base: { atk: 10, def: 2, hp: 60, spd: 4 } }
    ]},
  g2: { id: 'g2', name: '试炼·精英双人组', desc: '1 精英（利刃+冲撞）+ 1 杂兵',
    enemies: [
      { name: '精英·突袭者', tier: 'elite1', talents: ['blade'], skills: ['charge'], base: { atk: 25, def: 12, hp: 200, spd: 6 } },
      { name: '杂兵·弩', tier: 'minion', base: { atk: 12, def: 4, hp: 80, spd: 3 } }
    ]},
  g3: { id: 'g3', name: '试炼·双天赋精英', desc: '2 精英（双天赋 + 技能）',
    enemies: [
      { name: '精英·狂战', tier: 'elite2', talents: ['blade', 'bloodthirst'], skills: ['charge', 'bite'], base: { atk: 35, def: 15, hp: 300, spd: 7 } },
      { name: '精英·毒师', tier: 'elite2', talents: ['regen'], skills: ['blackmist', 'spikes'], base: { atk: 20, def: 10, hp: 220, spd: 5 } }
    ]},
  g4: { id: 'g4', name: '试炼·精锐小队', desc: '2 精锐（双天赋+双技能）',
    enemies: [
      { name: '精锐·破阵者', tier: 'elite3', talents: ['vigor', 'vengeance'], skills: ['armorbreak', 'chargeup'], base: { atk: 45, def: 25, hp: 400, spd: 8 } },
      { name: '精锐·冰法师', tier: 'elite3', talents: ['magicshield'], skills: ['blizzard', 'deepfreeze'], base: { atk: 30, def: 12, hp: 280, spd: 6, soulAtk: 40, soulDef: 20 } }
    ]},
  g5: { id: 'g5', name: '试炼·Boss 群', desc: 'Boss（3天赋+2技能）+ 2 精英护卫',
    enemies: [
      { name: 'Boss·战争领主', tier: 'boss', talents: ['blade', 'vigor', 'bloodthirst'], skills: ['charge', 'doom'], base: { atk: 60, def: 35, hp: 800, spd: 10, soulAtk: 30, soulDef: 25 } },
      { name: '护卫·盾', tier: 'elite1', talents: ['roughskin'], skills: ['fortify'], base: { atk: 20, def: 40, hp: 350, spd: 3 } },
      { name: '护卫·法', tier: 'elite1', talents: ['magicshield'], skills: ['heal', 'stardust'], base: { atk: 15, def: 10, hp: 250, spd: 5, soulAtk: 45, soulDef: 15 } }
    ]}
};

/* 测试/工具暴露 */
if (typeof window !== 'undefined') window.GROUP_LEVELS = GROUP_LEVELS;
if (typeof globalThis !== 'undefined' && !globalThis.GROUP_LEVELS) globalThis.GROUP_LEVELS = GROUP_LEVELS;

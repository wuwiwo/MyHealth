/* ============================================
   MyHealth — Terrain System (M2b-5)
   场地：对敌我双方均有效的全局效果。挂在群战 gb.terrain。
   每回合由 battle-group 调用 onTurnStart / onTurnEnd / onAction。
   纯逻辑，无 DOM/store。
   ============================================ */

var TERRAINS = {};   // id → terrain def

/* registerTerrain(def)
   def: { id, name, desc, onTurnStart?(gb, ctx), onTurnEnd?(gb, ctx), onAction?(gb, ctx, actor) }
   返回 {events:[]} 或 {events:[], damage:[{unitId, amount, ignoreDef?}]} */
function registerTerrain(def) {
  if (!def || !def.id) throw new Error('registerTerrain: id required');
  TERRAINS[def.id] = def;
  return def;
}

function getTerrain(id) { return TERRAINS[id] || null; }

/* 回合开始（所有单位行动前） */
function terrainTurnStart(gb) {
  if (!gb.terrain || !gb.terrain.onTurnStart) return [];
  var r = gb.terrain.onTurnStart(gb) || {};
  applyTerrainResult(gb, r);
  return r.events || [];
}

/* 回合结束（所有单位行动后） */
function terrainTurnEnd(gb) {
  if (!gb.terrain || !gb.terrain.onTurnEnd) return [];
  var r = gb.terrain.onTurnEnd(gb) || {};
  applyTerrainResult(gb, r);
  return r.events || [];
}

/* 应用场地造成的伤害/状态 */
function applyTerrainResult(gb, r) {
  (r.damage || []).forEach(function (d) {
    var u = gb.units.find(function (x) { return x.id === d.unitId; });
    if (!u || u.hp <= 0) return;
    u.hp = Math.max(0, u.hp - d.amount);
  });
  (r.statusApps || []).forEach(function (sa) {
    var u = gb.units.find(function (x) { return x.id === sa.unitId; });
    if (u && u.hp > 0) applyStatus(u, { id: sa.id, duration: sa.duration, source: null });
  });
}

/* --- 6 场地注册 --- */

/* 沙暴：全场命中-20%；每回合结束随机2名受碎石伤害（maxHP×5%，防御×200% 减免） */
registerTerrain({
  id: 'sandstorm',
  name: '沙暴',
  desc: '全场命中率-20%；每回合结束随机2名角色受碎石伤害（最大生命值×5%）',
  onTurnEnd: function (gb) {
    var events = [{ msg: '🌪️ 沙暴' }];
    var alive = gb.units.filter(function (u) { return u.hp > 0; });
    var targets = [];
    while (targets.length < 2 && alive.length) {
      var pick = alive[Math.floor(Math.random() * alive.length)];
      if (!targets.includes(pick)) targets.push(pick);
      if (alive.length === 1) break;
    }
    var dmgArr = targets.map(function (t) {
      var dmg = Math.floor(t.base.hp * 0.05);
      events.push({ msg: '🪨 ' + t.name + ' 受碎石伤害 ' + dmg });
      return { unitId: t.id, amount: dmg };
    });
    return { events: events, damage: dmgArr };
  }
});

/* 雪天：潮湿/冰冻状态下治疗-50%；每5-7回合随机1名冰冻1回合 */
registerTerrain({
  id: 'snow',
  name: '雪天',
  desc: '潮湿/冰冻下治疗-50%；每5-7回合随机1名冰冻',
  config: { freezeEvery: [5, 7] },
  onTurnStart: function (gb) {
    var events = [];
    var turn = gb.turn || 0;
    // interval 固定（场地创建时确定），避免每回合重算
    if (!gb._snowInterval) gb._snowInterval = 5 + Math.floor(Math.random() * 3);
    var interval = gb._snowInterval;
    if (turn >= interval && turn % interval === 0) {
      var alive = gb.units.filter(function (u) { return u.hp > 0; });
      if (alive.length) {
        var t = alive[Math.floor(Math.random() * alive.length)];
        var plain = talentDispatch(t, 'onBeforeStatus', {});
        if (!plain.skipAction) {
          applyStatus(t, { id: 'freeze', duration: 1 });
          events.push({ msg: '❄️ 雪天: ' + t.name + ' 被冰冻' });
        }
      }
    }
    return { events: events };
  }
});

/* 酷暑：每回合结束全体失 maxHP×4%；每次普攻后失 maxHP×3% */
registerTerrain({
  id: 'heat',
  name: '酷暑',
  desc: '每回合结束全体失最大生命值×4%；每次普攻后失×3%',
  onTurnEnd: function (gb) {
    var events = [{ msg: '☀️ 酷暑' }];
    var dmgArr = gb.units.filter(function (u) { return u.hp > 0; }).map(function (u) {
      var dmg = Math.floor(u.base.hp * 0.04);
      return { unitId: u.id, amount: dmg };
    });
    return { events: events, damage: dmgArr };
  }
});

/* 雨天：潮湿状态回合结束被闪电劈（maxHP×7%，魂防×3 减免）；每回合开始15%进入潮湿 */
registerTerrain({
  id: 'rain',
  name: '雨天',
  desc: '潮湿时回合结束被闪电劈（maxHP×7%）；每回合开始15%进入潮湿',
  onTurnStart: function (gb) {
    var events = [];
    gb.units.forEach(function (u) {
      if (u.hp > 0 && Math.random() < 0.15) {
        applyStatus(u, { id: 'wet', duration: 1 });
        events.push({ msg: '🌧️ ' + u.name + ' 变潮湿' });
      }
    });
    return { events: events };
  },
  onTurnEnd: function (gb) {
    var events = [{ msg: '⛈️ 雨天' }];
    var dmgArr = [];
    gb.units.forEach(function (u) {
      if (u.hp > 0 && hasStatus(u, 'wet')) {
        var dmg = Math.floor(u.base.hp * 0.07);
        dmgArr.push({ unitId: u.id, amount: dmg });
        events.push({ msg: '⚡ ' + u.name + ' 被闪电击中 ' + dmg });
      }
    });
    return { events: events, damage: dmgArr };
  }
});

/* 反转场地：全场变为速度最低最先行动（先制度技能不受影响） */
registerTerrain({
  id: 'reverse',
  name: '反转场地',
  desc: '全场变为速度最低最先行动（先制度技能不受影响）',
  onTurnStart: function (gb) {
    // 修改行动队列逻辑由 battle-group 检测 terrain 类型处理
    return { events: [{ msg: '🌀 反转场地: 速度反转' }] };
  }
});

/* 毒气场地：5回合后全场治疗-75%；每回合开始35%中毒2回合；累计3次获得免疫 */
registerTerrain({
  id: 'gas',
  name: '毒气场地',
  desc: '5回合后全场治疗-75%；每回合35%中毒；3次后免疫',
  config: { startTurn: 5 },
  onTurnStart: function (gb) {
    var events = [];
    if ((gb.turn || 0) < 5) return { events: events };
    gb.units.forEach(function (u) {
      if (u.hp <= 0 || u._gasImmune) return;
      if (Math.random() < 0.35) {
        if (hasStatus(u, 'poison')) {
          u._gasPoisonCount = (u._gasPoisonCount || 0) + 1;
          if (u._gasPoisonCount >= 3) {
            u._gasImmune = true;
            clearStatus(u, 'poison');
            events.push({ msg: '🛡️ ' + u.name + ' 获得毒气免疫' });
            return;
          }
        }
        applyStatus(u, { id: 'poison', duration: 2 });
        events.push({ msg: '☠️ ' + u.name + ' 中毒' });
      }
    });
    return { events: events };
  }
});

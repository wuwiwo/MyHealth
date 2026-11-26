/* ============================================
   MyHealth — 多队双场景战斗（阶段 D：导演层）
   ============================================
   设计依据 doc/design-pet-squad-battle-v1.md v1.2 §4（结构 / 双场景编成 / 渲染）。
   本文件是**纯逻辑**：不碰 DOM、不碰存档、不建单位（单位由 game-render 经唯一入口
   `buildGroupBattlePets()` / `createEnemyUnit()` 建好后交进来），只为「两个 gb 怎么轮」负责。

   核心口径（与设计逐条对应）：
     · 场景固定 2 个（A/B）；初始派驻 squadOrder[0] → A、squadOrder[1] → B；
     · 推进（D1）：A 跑完一个完整回合（四阶段）→ 换 B；B 跑完 → cycle++ 回到 A；
       已 won/lost 的场景**冻结**并跳过，另一侧照常推进（cycle 仍递增，日志可读）；
     · RNG（Q12）：导演只持一个 `rng`，两个 gb **注入同一个函数引用**；
     · 玩家（Q4）：**单一 unit、随推进场景移动**、永远 `_untargetable`；
     · 替补（D4）：某场景宠物全灭且未胜利 → 从未上场队列按顺序取下一队，满血上场并**绑定该场景**；
     · 整场胜负（D3）：两场景都 won → 胜；某场景全灭且无替补 → 败（不等另一侧）。
   ============================================ */

/* Q10（v1.2 复核裁决 2）：每个场景各拿一份**完整编成**，base 属性乘该系数。
   v2.14.22（阶段 E 实测定值）：**0.85 → 0.95**。
   实测依据（scripts/balance-dual.js，同关同阵容、40 种子、单场景基线＝4 宠 + 玩家）：
     · 0.85 → 双场景胜率 97~98%（单场景基线 53~100%）→ 「双场景」反而比同关单场景**更容易**，
       与「多队精英关」的定位相反；
     · 0.95 → 83%（基线 100%）/ 57%（基线 53%）→ 与单场景持平或略难，符合定位；
     · 1.00 → 60%（基线 100%）→ 明显偏硬（B 队通常弱于 A 队，实测值还会更低）。
   只乘 base 属性（hp/atk/def/soulAtk/soulDef），不乘等级、不乘词条、不乘场地。 */
var MULTI_SCENE_ENEMY_SCALE = 0.95;

/* 只乘 base 属性（hp/atk/def/soulAtk/soulDef），不乘等级、不乘词条、不乘场地；
   返回**新对象**，不改原 cfgList（原编成仍要留给单场景关卡用）。 */
function applyMultiSceneScale(cfgList, scale) {
  var s = (typeof scale === 'number') ? scale : MULTI_SCENE_ENEMY_SCALE;
  var keys = ['hp', 'atk', 'def', 'soulAtk', 'soulDef'];
  return (cfgList || []).map(function (ec) {
    var out = {};
    for (var k in ec) { if (Object.prototype.hasOwnProperty.call(ec, k)) out[k] = ec[k]; }
    var b = ec.base || {};
    out.base = {};
    for (var k2 in b) { if (Object.prototype.hasOwnProperty.call(b, k2)) out.base[k2] = b[k2]; }
    keys.forEach(function (st) {
      if (typeof b[st] === 'number') out.base[st] = Math.max(1, Math.floor(b[st] * s));
    });
    return out;
  });
}

function dualOtherKey(k) { return k === 'A' ? 'B' : 'A'; }

/* 建导演。
   opts = {
     player:      玩家单位（导演会打 `_isPlayer` / `_untargetable` 并挂到 A）
     scenes:      { A:{gb, squadUnits, squadName}, B:{...} }   —— gb 由调用方按每侧完整编成建好
     pendingSquads: 未上场小队 [{name, petIds}]（A/B 两支之外的），按顺序补给
     buildSquad:  fn(squad) → units[]（满血现建，走 buildGroupBattlePets 唯一入口）
   } */
function createDualBattle(opts) {
  opts = opts || {};
  var buildSquad = (typeof opts.buildSquad === 'function') ? opts.buildSquad : function () { return []; };
  var dir = {
    player: opts.player || null,
    cycle: 1,
    active: 'A',
    done: false,
    winner: null,
    notes: [],          /* 给 UI 的一次性提示（增援 / 场景结束），读后清空 */
    pending: (opts.pendingSquads || []).slice(),
    /* 替补建队的唯一来源（dualReinforce 里读 dir.buildSquad，缺了就取不到队 → 直接判败） */
    buildSquad: buildSquad,
    scenes: {}
  };
  ['A', 'B'].forEach(function (k) {
    var sc = (opts.scenes || {})[k] || {};
    var gb = sc.gb;
    if (!gb) throw new Error('createDualBattle: 场景 ' + k + ' 缺少 gb');
    var squad = sc.squadUnits || [];
    /* 两个 gb 都按「只看宠物」判负（玩家不可被攻击，本就不该出现在判负判据里） */
    gb.winnerRule = 'pets';
    gb.squadUnits = squad;
    /* 引擎的增援入口按**场景**绑定：谁全灭谁去队列里取，绝不跨场景偷队伍 */
    gb.reinforce = function () { return dualReinforce(dir, k); };
    dir.scenes[k] = {
      key: k,
      gb: gb,
      squadUnits: squad,
      squadName: sc.squadName || (k === 'A' ? '一队' : '二队'),
      status: 'active'      /* active | won | lost */
    };
  });
  dualMarkPlayer(dir.player);
  dualMovePlayer(dir, 'A');
  return dir;
}

/* 玩家口径（Q4）：多队战斗里玩家永远不可被选为目标（`attackable` 唯一判据读它）。 */
function dualMarkPlayer(player) {
  if (!player) return player;
  player._isPlayer = true;
  player._untargetable = true;
  return player;
}

/* 把玩家搬到指定场景：**移出**其他场景（allies/units 双池），再**移入**目标场景。
   只在回合边界调用 —— 引擎的队列在准备阶段从 `gb.units` 重建，边界移动不会留下陈旧队列（R4）。 */
function dualMovePlayer(dir, toKey) {
  if (!dir || !dir.player) return false;
  var p = dir.player;
  ['A', 'B'].forEach(function (k) {
    if (k === toKey) return;
    var g = dir.scenes[k].gb;
    var ai = g.allies.indexOf(p);
    if (ai >= 0) g.allies.splice(ai, 1);
    var ui = g.units.indexOf(p);
    if (ui >= 0) g.units.splice(ui, 1);
  });
  var g = dir.scenes[toKey].gb;
  if (g.allies.indexOf(p) < 0) g.allies.unshift(p);   /* 我方展示顺序：玩家在最前 */
  if (g.units.indexOf(p) < 0) g.units.push(p);
  return true;
}

/* 该场景的替补提供方（引擎在 `checkGroupWin` 判负**之前**问它）：
   · 只从未上场队列按顺序取；
   · 满血现建（`buildSquad` 走 buildGroupBattlePets 唯一入口）；
   · 空队 / 全员不可战 → 跳过继续找；用尽 → null（引擎据此判该场景失败 → 整场失败 D3）。 */
function dualReinforce(dir, sceneKey) {
  var sc = dir.scenes[sceneKey];
  while (dir.pending.length) {
    var sq = dir.pending.shift();
    var units = [];
    try {
      units = (dir.buildSquad ? dir.buildSquad(sq) : []) || [];
    } catch (e) {
      console.warn('[dual] 替补建单位失败，跳过该小队', e);
      units = [];
    }
    if (!units.length) continue;
    sc.squadName = sq.name || ('替补' + (dir.cycle));
    sc.squadUnits = units;
    dir.notes.push({ type: 'reinforce', scene: sceneKey, name: sc.squadName });
    return units;
  }
  return null;
}

/* 推进一拍：只在**当前场景**上跑一个单位行动（与单场景 `groupBattleStep` 同一函数）。
   场景回合结束（`turnEnd`）→ 换边 / cycle++；场景结束 → 冻结 / 定整场胜负。 */
function dualStep(dir) {
  if (!dir) return { done: true, winner: null, events: [] };
  if (dir.done) return { done: true, winner: dir.winner, events: [] };
  var k = dir.active;
  var sc = dir.scenes[k];
  /* 当前场景已冻结（won/lost）：直接跳到还能打的另一侧 */
  if (sc.status !== 'active') {
    var other = dir.scenes[dualOtherKey(k)];
    if (other.status !== 'active') { dir.done = true; dir.winner = 'ally'; return { done: true, winner: 'ally', events: [], frozen: true }; }
    dualMovePlayer(dir, other.key);
    dir.active = other.key;
    k = dir.active; sc = dir.scenes[k];
  }
  var step = groupBattleStep(sc.gb);
  var out = {
    unit: step.unit || null,
    events: step.events || [],
    turnEnd: !!step.turnEnd,
    scene: k,
    done: false,
    winner: null
  };
  /* 场景结束（引擎已判胜负） */
  if (sc.gb.done) {
    if (sc.gb.winner === 'ally') {
      sc.status = 'won';
      dir.notes.push({ type: 'sceneWon', scene: k });
    } else {
      sc.status = 'lost';
      dir.done = true;
      dir.winner = 'enemy';
      dir.notes.push({ type: 'sceneLost', scene: k });
      out.done = true; out.winner = 'enemy';
      return out;
    }
  }
  if (out.turnEnd || sc.status !== 'active') dualEndTurn(dir, k, out);
  out.done = dir.done;
  out.winner = dir.winner;
  return out;
}

/* 一个场景的回合结束：换边（携带玩家）、或两侧都冻结 → 整场胜利。
   cycle 口径：**回到 A** 时 +1（= A、B 各跑完一轮）；另一侧已冻结时本侧连跑，cycle 仍 +1（D1 末条）。 */
function dualEndTurn(dir, k, out) {
  var bothWon = ['A', 'B'].every(function (x) { return dir.scenes[x].status === 'won'; });
  if (bothWon) {
    dir.done = true;
    dir.winner = 'ally';
    dir.notes.push({ type: 'allWon' });
    out.switched = false;
    return;
  }
  var other = dir.scenes[dualOtherKey(k)];
  if (other.status === 'active') {
    dualMovePlayer(dir, other.key);
    dir.active = other.key;
    if (other.key === 'A') dir.cycle++;
    out.switched = true;
    out.nextScene = other.key;
    return;
  }
  dir.cycle++;
  out.switched = false;
  out.nextScene = k;
}

/* 读走一次性提示（读后清空）。 */
function dualTakeNotes(dir) {
  if (!dir || !dir.notes || !dir.notes.length) return [];
  var n = dir.notes.slice();
  dir.notes = [];
  return n;
}

/* 整场视图（给战报 / 统计 / 历史用）：把两个场景拼成一个**只读门面**。
   · allies 去重（玩家只在当时所在场景，天然只有一份）；
   · log 合并，行动者前缀 `A·` / `B·` 标明来自哪个场景（回合号各自独立，不改写）；
   · turn = cycle（整场轮数），winner/done 取导演结论。 */
function dualMergedBattle(dir) {
  if (!dir) return null;
  var a = dir.scenes.A.gb, b = dir.scenes.B.gb;
  var allies = [], seen = {};
  (a.allies || []).concat(b.allies || []).forEach(function (u) {
    if (u && !seen[u.id]) { seen[u.id] = 1; allies.push(u); }
  });
  var log = [];
  [['A', a], ['B', b]].forEach(function (pair) {
    (pair[1].log || []).forEach(function (l) {
      log.push({
        turn: l.turn,
        unit: pair[0] + '·' + (l.unit || ''),
        phase: l.phase,
        terrain: l.terrain,
        opening: l.opening,
        events: l.events
      });
    });
  });
  return {
    dual: true,
    allies: allies,
    enemies: (a.enemies || []).concat(b.enemies || []),
    units: (a.units || []).concat(b.units || []),
    log: log,
    turn: dir.cycle,
    done: dir.done,
    winner: dir.winner,
    terrain: a.terrain || b.terrain || null,
    phase: a.phase,
    events: []
  };
}

/* 场景状态文案（控制条 / 分栏标题共用，禁两处各写一套）。 */
function dualSceneLabel(dir, key) {
  var sc = dir && dir.scenes && dir.scenes[key];
  if (!sc) return key;
  var st = sc.status === 'won' ? '已胜（冻结）' : sc.status === 'lost' ? '已败' : (dir.active === key ? '推进中' : '待机');
  return sc.squadName + ' · ' + st;
}

/* 剩余未上场小队数（控制条展示）。 */
function dualPendingCount(dir) { return dir && dir.pending ? dir.pending.length : 0; }

/* 测试 / 工具暴露（与 `window.__groupRelayNext` 同类，不参与线上逻辑）。 */
if (typeof window !== 'undefined') {
  window.MULTI_SCENE_ENEMY_SCALE = MULTI_SCENE_ENEMY_SCALE;
  window.applyMultiSceneScale = applyMultiSceneScale;
  window.createDualBattle = createDualBattle;
  window.dualStep = dualStep;
  window.dualMovePlayer = dualMovePlayer;
  window.dualMergedBattle = dualMergedBattle;
  window.dualSceneLabel = dualSceneLabel;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MULTI_SCENE_ENEMY_SCALE = MULTI_SCENE_ENEMY_SCALE;
  globalThis.applyMultiSceneScale = applyMultiSceneScale;
  globalThis.createDualBattle = createDualBattle;
  globalThis.dualStep = dualStep;
  globalThis.dualMovePlayer = dualMovePlayer;
  globalThis.dualMergedBattle = dualMergedBattle;
  globalThis.dualSceneLabel = dualSceneLabel;
}

/* ============================================
   MyHealth — Group Battle Engine (M2b-4)
   多 Unit 行动队列战斗。独立于原 battleTick（单敌零回归）。
   行动队列：按 effectiveSpeed 降序 + 稳定 tie-break（同速我方先手、同方按 id 稳定序）+ 先制度 priority。
   每单位回合：天赋 hook → 普攻或技能 → 状态 tick。
   纯逻辑，无 DOM/store。
   ============================================ */

/* 状态中文名（日志用） */
var STATUS_NAMES = { sleep:'睡眠', poison:'中毒', freeze:'冰冻', flinch:'畏缩', wet:'潮湿', charging:'蓄力', possessed:'幽魂附身', doomed:'末日', armorbroken:'破甲', slow:'减速', souldown:'魂防降低', lastworded:'遗言诅咒', sleepy:'哈欠', weaken:'弱化', vigil:'警戒', haste:'疾风' };
function getStatusName(id){ return STATUS_NAMES[id] || id; }

/* v2.1.14 威吓削减幅度：唯一来源是 talent.js 的 INTIMIDATE_ATK_DOWN
   （talent.js 在本文件之前加载）。这里做一次兜底读取，避免加载顺序意外变化时静默失效。 */
function intimidateAtkDown() {
  return (typeof INTIMIDATE_ATK_DOWN === 'number') ? INTIMIDATE_ATK_DOWN : 0.4;
}

/* 日志里给技能/技能事件补「谁 → 谁」用的目标名 */
function joinUnitNames(list) {
  return (list || []).map(function (u) { return u && u.name ? u.name : '单位'; }).join('、');
}

/* 从 skipAction 事件里抽一句人话原因（供「无法行动」日志） */
function skipReasonText(evts) {
  var pool = evts || [];
  for (var i = 0; i < pool.length; i++) {
    var e = pool[i] || {};
    var txt = e.msg || e.reason || '';
    if (!txt) continue;
    return String(txt).split(/[:：]/)[0].trim();
  }
  return '';
}

/* v2.1.15：护盾吸收。
   「金身护盾」此前只把 _shield / _shieldImmune 写在单位上，全项目没有消费方 ——
   开战给的盾既挡不了伤害，也免疫不了负面。
   返回 {dmg, absorbed, broke}；护盾清零时同步撤掉免疫标记。 */
function absorbShield(target, dmg) {
  if (!target || !(target._shield > 0) || dmg <= 0) return { dmg: dmg, absorbed: 0, broke: false };
  var absorbed = Math.min(target._shield, dmg);
  target._shield -= absorbed;
  var broke = target._shield <= 0;
  if (broke) { target._shield = 0; target._shieldImmune = false; }
  return { dmg: Math.max(0, dmg - absorbed), absorbed: absorbed, broke: broke };
}

/* 状态增删后的统一收尾：重算 _statMods（unit.js 的 effectiveSpeed / effectiveStat 读它）。
   漏刷的后果是「减速不影响出手顺序、破甲不影响承伤」这类静默失效。 */
function syncStatusDerived(unit) {
  if (unit && typeof refreshStatMods === 'function') refreshStatMods(unit);
}

/* ============ v2.1.21：两种「替代本回合正常行动」的结算 ============ */

/* 蓄力重击（设计文档 doc/design-v2.0.md:101-105）：
   本回合进入蓄力（承伤 +25%），**下回合**对随机 1 名敌人造成 400% 攻击伤害。
   改造前实现是「本回合就打出 400%（技能自带 power:400）+ 下次施放再追加一次」，
   时点与文档不符。现在 charging 到期时置 _chargeReady，本单位下一次行动开始时
   自动结算 400% 重击并**占用该次行动**。 */
var CHARGE_STRIKE_POWER = 4;   // 400%

function resolveChargeStrike(gb, actor) {
  var events = [];
  var foes = (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; });
  if (!foes.length) return events;
  var t = foes[Math.floor(gb.rng() * foes.length)];
  var dmg = Math.max(1, Math.floor(effectiveStat(actor, 'atk') * CHARGE_STRIKE_POWER - Math.floor(effectiveStat(t, 'def') / 2)));
  var sh = absorbShield(t, dmg);
  if (sh.absorbed > 0) {
    dmg = sh.dmg;
    events.push({ msg: '🛡️ ' + t.name + ' 护盾吸收 ' + sh.absorbed + (sh.broke ? '（护盾破碎）' : ''), targetId: t.id, type: 'status' });
  }
  t.hp = Math.max(0, t.hp - dmg);
  events.push({ msg: '💥 ' + (actor.name || '单位') + ' 蓄力重击 → ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
  return events;
}

/* 迷惑（幻影之瞳）三选一 —— 设计依据 doc/design-v2.0.md:229：
   ①丧失防备（防御·魂防 降低 15%~75%）
   ②不分敌我误击其他敌人（伤害 50%~95%；无其他敌人则不触发）
   ③牺牲自我（消耗自身最大生命 1%~10%）
   **三个区间都随技能等级取值**（v2.1.22 接线）：等级与区间写在技能定义上
   （pet-codex.js 的 p_phantom.range），由施法时塞进「迷惑」状态实例的 data 带过来 ——
   所以这里要读 actor 身上的 confused 实例，而不是用固定常量。 */

/* 读出本次迷惑的等级与三个分支数值（读不到就按 Lv1 = 区间下限兜底） */
function _confuseParams(actor) {
  var st = null;
  (actor.statuses || []).forEach(function (s) { if (s.id === 'confused') st = s; });
  var data = (st && st.data) || {};
  var lv = Math.max(1, Math.min(SKILL_LEVEL_MAX, Math.floor(data.level || 1)));
  var sk = (typeof SKILLS !== 'undefined' && data.skillId) ? SKILLS[data.skillId] : null;
  var R = (sk && sk.range) || {};
  var t = (lv - 1) / (SKILL_LEVEL_MAX - 1);
  function pick(key, lo, hi) {
    var r = R[key];
    if (r && r.length === 2) { lo = r[0]; hi = r[1]; }
    return lo + (hi - lo) * t;
  }
  return {
    level: lv,
    down: pick('confuseDown', 0.15, 0.75),
    hit: pick('confuseHit', 0.50, 0.95),
    self: pick('confuseSelf', 0.01, 0.10)
  };
}

function resolveConfusion(gb, actor) {
  var events = [];
  var cf = _confuseParams(actor);
  var others = (actor.side === 'ally' ? gb.enemies : gb.allies)
    .filter(function (u) { return u.hp > 0 && u.id !== actor.id; });
  var branch = Math.floor(gb.rng() * 3);
  if (branch === 1 && !others.length) branch = 2;   // 文档：无其他敌人则不触发 ② → 退到 ③

  if (branch === 0) {
    /* 幅度按等级走**实例** modsPct（confused_down 定义里不再写死 statModsPct），
       否则会与定义里的固定值叠加、变成「固定 + 等级」两份。 */
    applyStatus(actor, { id: 'confused_down', duration: 2, modsPct: { def: -cf.down, soulDef: -cf.down } });
    syncStatusDerived(actor);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 丧失防备（防御·魂防 -' + Math.round(cf.down * 100) + '%）', targetId: actor.id, type: 'status' });
  } else if (branch === 1) {
    var t = others[Math.floor(gb.rng() * others.length)];
    var dmg = Math.max(1, Math.floor(effectiveStat(actor, 'atk') * cf.hit - Math.floor(effectiveStat(t, 'def') / 2)));
    var sh = absorbShield(t, dmg);
    if (sh.absorbed > 0) dmg = sh.dmg;
    t.hp = Math.max(0, t.hp - dmg);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 敌我不分，误击 ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
  } else {
    var self = Math.max(1, Math.floor((actor.base.hp || 0) * cf.self));
    actor.hp = Math.max(0, actor.hp - self);
    events.push({ msg: '🌀 ' + actor.name + ' 迷惑 → 牺牲自我 -' + self, targetId: actor.id, type: 'damage' });
  }
  return events;
}

/* ============ 命中 / 闪避（v2.1.5 引入） ============
   设计文档本就要求命中率机制（技能「闪耀：敌方命中率 -0%~40%」「打湿：提高对其命中率 0%~30%」），
   此前只有文案没有判定，这里补上，并让天赋「漆黑之眼 / 心眼」落地。
   公式：命中率 = BASE_HIT_RATE + 自身命中修正(_accMod) − 目标闪避(_eva)，clamp 到 [5%, 100%]。
   现有单位默认 _accMod=0 / _eva=0，所以仅受那 5% 基础未命中影响。 */
var BASE_HIT_RATE = 0.95;

/* 计算实际命中率（含天赋 hook：guaranteedHit / noAccPenalty） */
function groupHitChance(actor, target) {
  var td = talentDispatch(actor, 'onBeforeHit', { target: target });
  var guaranteed = false, noPenalty = false;
  td.mutations.forEach(function (m) {
    if (m.key === 'guaranteedHit') guaranteed = true;
    if (m.key === 'noAccPenalty') noPenalty = true;
  });
  if (guaranteed) return 1;                       // 漆黑之眼：必定命中
  var acc = BASE_HIT_RATE + (actor._accMod || 0);
  if (noPenalty) acc = Math.max(BASE_HIT_RATE, acc);   // 心眼：命中率不会被降低
  /* v2.1.15：潮湿「提高对其命中率」—— 设计文档写明，此前只有状态、没有命中加成。
     v2.1.22：加成幅度改从**状态实例**读（打湿技能按基础属性成长换算后塞进 data.hitBonus，
     设计区间 0%~30%）；没带 data 的潮湿（如雨天场地给的）沿用 30% 的既有行为。 */
  if (typeof hasStatus === 'function' && hasStatus(target, 'wet')) {
    var wetInst = null;
    (target.statuses || []).forEach(function (s) { if (s.id === 'wet') wetInst = s; });
    var hitBonus = (wetInst && wetInst.data && typeof wetInst.data.hitBonus === 'number') ? wetInst.data.hitBonus : 0.30;
    acc += hitBonus;
  }
  /* v2.1.15：闪避拆成两处 ——
     _eva（宠物「打湿」等限时修正，由 _hitModTurns 到期归零）
     _evaPerm（技能「变小」的常驻闪避，不该被限时修正的归零逻辑清掉） */
  acc -= ((target._eva || 0) + (target._evaPerm || 0));
  return Math.max(0.05, Math.min(1, acc));
}

/* 命中判定 */
function groupRollHit(gb, actor, target) {
  return gb.rng() < groupHitChance(actor, target);
}

/* 多单位天赋调度（光环类：凛冬之核/威压领域/圣光守护） */
function talentAura(units, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  (units || []).forEach(function (u) {
    if (!u || u.hp <= 0) return;
    var r = talentDispatch(u, hook, ctx);
    if (r.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(r.mutations);
    out.events = out.events.concat(r.events);
  });
  return out;
}

/* 天赋暴击判定（斗者本能）：返回 {chance, mult} */
function talentCrit(actor) {
  var td = talentDispatch(actor, 'onBeforeCrit', {});
  var chance = 0, mult = 1.5;
  td.mutations.forEach(function (m) {
    if (m.key === 'critChance') chance = Math.max(chance, m.value);
    if (m.key === 'critMult') mult = m.value;
  });
  return { chance: chance, mult: mult };
}

/* v2.3.0（WP-D §3.12-1）：斗者本能（天赋 **30%** / 150%）×「宠物暴击档」（玩家装配暴击后共享，
   15% / 160%，见 skills.js 的 petEffect）按裁决「**取最高、分别判定**」合并。
   此前两处各自独立结算 —— 同一单位同时具备两者时会**连续两次暴击**叠乘（×1.5×1.6），
   与「都触发则取最高、只有一个触发按触发的那一项」不符。
   现在：两边**各自掷骰**，取触发项里**较高的倍率**，只结算一次；都没触发返回 0。 */
function groupCritMult(gb, actor) {
  var best = 0;
  var tc = talentCrit(actor);
  if (tc.chance > 0 && gb.rng() < tc.chance) best = Math.max(best, tc.mult);
  if (typeof playerCritInfo === 'function') {
    var pc = playerCritInfo(actor);
    if (pc && pc.chance > 0 && gb.rng() < pc.chance) best = Math.max(best, pc.critMult);
  }
  return best;
}

/* v2.3.0 WP-D（§3.5 评审 + §3.12-2 裁决「全通道适用」）：**镜像结界**对辅助型技能效果的缩放。
   持有者（梦幻）收到**我方来源**的辅助效果 ×1.25、**敌方来源**的 ×0.75。
   治疗通道仍走 `onBeforeHeal` 的 `healBoost`（v2.1.5 起的历史口径，行为不变），
   本函数只服务**非治疗**通道（增益幅度 / 状态实例幅度），由 castSkill 消费。
   返回倍率；未持有该天赋（或非辅助效果）= 1。 */
function supportEffectMul(unit, source) {
  if (!unit) return 1;
  var td = talentDispatch(unit, 'onBeforeSupportEffect', { support: true, source: source, sourceId: source ? source.id : null, target: unit });
  var v = 0;
  td.mutations.forEach(function (m) { if (m.key === 'supportScale') v += m.value; });
  return v === 0 ? 1 : Math.max(0, 1 + v);
}

/* 伤害结算前的通用处理：目标阵营的「圣光守护」分担 + 天赋承伤修正
   返回 {dmg, events}，dmg 已扣掉被队友分担的部分 */
function applyAllyDamageShare(gb, target, dmg, events) {
  var mates = (target.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) {
    return u.hp > 0 && u.id !== target.id;
  });
  var res = talentAura(mates, 'onAllyDamage', { target: target, amount: dmg });
  var share = 0;
  res.mutations.forEach(function (m) { if (m.key === 'damageShare') share += m.value; });
  res.events.forEach(function (e) { events.push({ msg: e.msg }); });
  return share > 0 ? Math.max(1, dmg - share) : dmg;
}

/* ================= v2.1.27 [7c/7d] 种子随机 & 快照 =================
   游戏侧此前把 gb.rng 直接设为 Math.random，不可播种 → 无法复现、无法回退。 */

/* v2.1.27：战斗随机作用域。
   battleRnd / makeSeededRng / beginBattleRng 全部定义在 **utils.js**（最早加载），
   这里只保留把本场 rng 挂上去的辅助函数。
   ⚠️ 切勿在本文件再声明 battleRnd —— 批量替换曾把定义体里的 Math.random() 也换掉，
      造成 self-recursion（栈溢出）。 */
function _setBattleRng(gb) { _BATTLE_RNG = (gb && gb.rng) ? gb.rng : null; }

/* 只拷可 JSON 序列化的自有属性（跳过函数，如 hook / rng） */
function _cloneUnit(u) {
  var o = {};
  for (var k in u) {
    if (typeof u[k] === 'function') continue;
    try { o[k] = JSON.parse(JSON.stringify(u[k])); } catch (e) { console.warn('[group] 快照跳过不可序列化的键 ' + k, e); }
  }
  return o;
}

/* 快照：回合 / 胜负 / **rng 计数器** / 每个单位的可序列化状态 */
function groupSnapshot(gb) {
  if (!gb) return null;
  try {
    return {
      turn: gb.turn, done: !!gb.done, winner: gb.winner || null,
      rngState: (gb.rng && gb.rng.getState) ? gb.rng.getState() : null,
      units: (gb.units || []).map(_cloneUnit)
    };
  } catch (e) { console.warn('[group] 生成快照失败', e); return null; }
}

/* 回滚到快照。⚠️ _stepQueue / _stepIdx 必须重置，否则行动队列错乱 */
function groupRestore(gb, snap) {
  if (!gb || !snap || !Array.isArray(snap.units)) return { ok: false, reason: '快照无效' };
  try {
    gb.turn = snap.turn; gb.done = !!snap.done; gb.winner = snap.winner || null;
    if (gb.rng && gb.rng.setState && snap.rngState != null) gb.rng.setState(snap.rngState);
    snap.units.forEach(function (su) {
      var u = null;
      (gb.units || []).forEach(function (x) { if (x.id === su.id) u = x; });
      if (!u) return;
      /* WP-C（引擎遗留收口）：回滚必须**完全**回到快照形状。
         原实现只把快照里有的键覆盖回去，快照**之后**才新产生的字段留在单位上、带着「未来」
         继续跑 —— 典型受害者是 charging 到期置的 `_chargeReady`（快照时该键还不存在，
         于是回滚后单位提前一回合释放蓄力重击），使「回滚后重跑 == 首次结果」不再成立。
         这里删掉快照里没有的自有**数据**键（函数不入快照，保留不删）。 */
      Object.keys(u).forEach(function (k) {
        if (typeof u[k] === 'function') return;
        if (Object.prototype.hasOwnProperty.call(su, k)) return;
        delete u[k];
      });
      Object.keys(su).forEach(function (k) { u[k] = su[k]; });
    });
    gb._stepQueue = null; gb._stepIdx = 0;
    if (typeof syncStatusDerived === 'function') (gb.units || []).forEach(syncStatusDerived);
    return { ok: true, turn: gb.turn };
  } catch (e) { console.warn('[group] 回滚失败', e); return { ok: false, reason: String(e && e.message) }; }
}

/* 从初始快照无头重跑到结束，用于验证「同种子结果一致」 */
function groupReplay(gb, initSnap, maxSteps) {
  var r0 = groupRestore(gb, initSnap);
  if (!r0.ok) return { ok: false, reason: r0.reason };
  var n = 0, cap = maxSteps || 600;
  while (!gb.done && n < cap) { groupBattleStep(gb); n++; }
  return { ok: true, winner: gb.winner || null, turn: gb.turn, steps: n, hitCap: n >= cap };
}

/* createGroupBattle({allies:[Unit], enemies:[Unit], rng?, seed?}) → group battle 状态
   allies/enemies 是 unit.js 的 Unit 数组 */
function createGroupBattle(opts) {
  opts = opts || {};
  var units = (opts.allies || []).concat(opts.enemies || []);
  return {
    units: units,
    allies: opts.allies || [],
    enemies: opts.enemies || [],
    turn: 0,
    done: false,
    winner: null,        // 'ally' | 'enemy'
    events: [],
    log: [],
    /* v2.1.27：给了 seed 就用可播种 RNG（可复现 / 可回退）；都没给才退回 Math.random */
    rng: opts.rng || (opts.seed != null ? makeSeededRng(opts.seed) : Math.random),
    terrain: opts.terrain || null
  };
}

/* 计算单位有效速度（含先制度与状态修正） */
function unitInitiative(u, skill) {
  var spd = effectiveSpeed(u);
  if (skill && SKILLS[skill] && SKILLS[skill].priority) spd += SKILLS[skill].priority * 50;
  if (u._taunting) spd *= 2;   // 嘲讽：速度×200%
  return spd;
}

/* 构建行动队列：按 initiative 降序，稳定 tie-break（同速我方先手，同方按创建序） */
function buildActionQueue(gb) {
  var queue = gb.units.filter(function (u) { return u.hp > 0; });
  queue.sort(function (a, b) {
    var ia = unitInitiative(a, null);
    var ib = unitInitiative(b, null);
    if (ia !== ib) return ib - ia;
    if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;   // 同速我方先手
    return (gb.units.indexOf(a) < gb.units.indexOf(b)) ? -1 : 1; // 同方稳定序
  });
  return queue;
}

/* 目标选择：random1 / all / self / ally1 / ally2 / enemy1 / enemy2 / enemy12（嘲讽优先）
   WP-C 新增：
     · ally2   —— 随机 2 名友方（§2.14 战意灌注）
     · enemy2  —— 随机最多 2 名敌人各 1 次（§2.8 双撞）
     · enemy12 —— 随机 1~2 名敌人（§2.10 冰晶爆；1 或 2 均匀取）
     · skillDef.wounded —— ally1 只挑**未满血**的友方（§2.11 圣光治愈） */
function selectTargets(gb, actor, skillDef) {
  var target = (skillDef && skillDef.target) || 'random1';
  var enemies = gb.enemies.filter(function (u) { return u.hp > 0; });
  var allies = gb.allies.filter(function (u) { return u.hp > 0; });

  if (target === 'self') return [actor];
  if (target === 'all') {
    // 嘲讽者被单独挑出，其余全体
    var taunter = (actor.side === 'ally' ? gb.enemies : gb.allies).find(function (u) { return u._taunting && u.hp > 0; });
    if (taunter && target === 'all') {
      // 全体技能仍打全体，但嘲讽者额外承伤由 battle 处理
    }
    return actor.side === 'ally' ? enemies : allies;
  }
  /* 从候选里无放回地随机抽 n 个（顺序即抽取顺序，走本场种子 gb.rng） */
  function drawRandom(list, n) {
    var bag = list.slice(), picks = [];
    while (picks.length < n && bag.length) {
      picks.push(bag.splice(Math.floor(gb.rng() * bag.length), 1)[0]);
    }
    return picks;
  }
  if (target === 'ally1') {
    var healTargets = allies.filter(function (u) { return u.id !== actor.id; });
    if (!healTargets.length) healTargets = allies;
    /* WP-C（§2.11 圣光治愈「随机 1 名受伤队友」）：只挑未满血者；
       全队满血时退回全体（否则技能无目标 = 空放）。 */
    if (skillDef && skillDef.wounded) {
      var wounded = healTargets.filter(function (u) { return u.hp < u.base.hp; });
      if (wounded.length) healTargets = wounded;
    }
    return [healTargets[Math.floor(gb.rng() * healTargets.length)]];
  }
  if (target === 'ally2') {
    /* WP-C（§2.14 战意灌注「随机 2 名友方」）：沿用 ally1 的口径（优先排除自身），
       不足 2 名旁观者时退回含自身的全体友方。 */
    var pool2 = allies.filter(function (u) { return u.id !== actor.id; });
    if (pool2.length < 2) pool2 = allies;
    return drawRandom(pool2, 2);
  }
  if (target === 'enemy2' || target === 'enemy12') {
    var n = (target === 'enemy2') ? 2 : (1 + (gb.rng() < 0.5 ? 1 : 0));
    return drawRandom(enemies, n);
  }
  if (target === 'enemy1') {
    return [enemies[Math.floor(gb.rng() * enemies.length)]];
  }
  // random1：嘲讽优先
  var pool = actor.side === 'ally' ? enemies : allies;
  var t = pool.find(function (u) { return u._taunting && u.hp > 0; });
  if (t) return [t];
  if (!pool.length) return [];
  return [pool[Math.floor(gb.rng() * pool.length)]];
}

/* 普通攻击（无技能时） */
function normalAttack(gb, actor, target, dmgMult) {
  var events = [];
  if (!target || target.hp <= 0) return events;
  // 命中判定（v2.1.5）
  if (!groupRollHit(gb, actor, target)) {
    events.push({ msg: '💨 ' + (actor.name || '单位') + ' 的攻击落空（' + target.name + ' 闪避）', targetId: target.id });
    return events;
  }
  // 普攻伤害（同原公式）
  /* v2.1.15：改用 effectiveStat —— 破甲/减速/潮湿这类状态修正此前算出来了却没人用，
     伤害公式读的一直是裸属性 base（所以 _statMods 生效了也看不出差别）。 */
  var atkVal = effectiveStat(actor, 'atk');
  var defVal = effectiveStat(target, 'def');
  var dmg = Math.max(1, atkVal - Math.floor(defVal / 2) + Math.floor(gb.rng() * 4) + 1);
  /* v2.2.5 启风：额外普通攻击按系数缩放（**只作用在 base 上**，其后利刃/暴击/格挡等
     常规修正照旧生效 —— 语义就是「一次 80% 伤害的普通攻击」）。不传 = 1，行为与旧版完全一致。 */
  if (dmgMult && dmgMult !== 1) dmg = Math.max(1, Math.floor(dmg * dmgMult));
  /* v2.1.14 威吓落地：talent.js 的 onBattleStart 只写了 target._intimidated = true，
     全项目没有任何地方读这个标记（等于威吓从未真正生效）。这里在伤害结算前统一削减。 */
  if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown())));
  // 天赋 hook: 利刃加成 / 多目标惩罚 / 末日减半
  var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: dmg, isPhysical: true, attacker: actor, target: target });
  td.mutations.forEach(function (m) {
    if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
    if (m.key === 'dmgDealtHalf') dmg = Math.floor(dmg / 2);
  });
  var td2 = talentDispatch(target, 'onDamage', { attacker: actor, amount: dmg, isPhysical: true, isPlayerAttack: false, isSkill: false, isAoe: false, fromPlayer: actor.side === 'ally' });
  /* v2.1.15：受击方还要走一遍**状态**钩子（此前只派发天赋）——
     一是让「广域防御」的 dmgTakenReduce 真正生效，
     二是让冰冻/睡眠的「受击解除」（status-defs / state-core 里写了却从没人调）真正生效。 */
  var sd = dispatch(target, 'onDamage', { attacker: actor, amount: dmg, isPhysical: true, isSkill: false, isAoe: false, fromPlayer: actor.side === 'ally' });
  td2.mutations = td2.mutations.concat(sd.mutations);
  sd.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: target.id, type: e.type }); });
  td2.mutations.forEach(function (m) {
    /* 反伤只打攻击者。原实现在这里顺手把 target.hp 也扣了一次，
       而下方结算又会扣一遍 —— 等于「粗糙皮肤」让受击方吃双倍伤害（v2.1.15 修）。 */
    if (m.key === 'reflectFlat') { actor.hp = Math.max(0, actor.hp - m.value); events.push({ msg: '🩸 ' + target.name + ' 粗糙皮肤 → ' + (actor.name || '攻击者') + ' 反伤 ' + m.value, targetId: actor.id, type: 'damage' }); }
    if (m.key === 'dmgTakenBoost') dmg = Math.floor(dmg * (1 + m.value));
    /* WP-C（单源化）：魔法盾 magicshield 的 soulDmgReduce 此前**只读生产端以外的硬编码 ×0.7**
       （生产端 talent.js 给 0.3，恰好等价，但改生产端不生效、且镜像/裁决调整会静默漂移）。
       现改为读 `m.value`（= 减伤比例，消费端语义「×(1 − v)」），与 dmgTakenReduce 同一口径。 */
    if (m.key === 'soulDmgReduce') dmg = Math.floor(dmg * (1 - m.value));
    if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value));   // 不动如山 / 广域防御
  });
  /* v2.3.0（WP-D §3.12-1）：暴击统一走 groupCritMult —— 天赋暴击（斗者本能 30%/150%）与
     玩家/宠物暴击档（玩家 30%/300%、宠物 15%/160%）**分别判定、都触发取最高、只结算一次**。
     此前是「playerCritHook 先乘一次 → talentCrit 再乘一次」= 可能双重暴击叠乘。 */
  var critMult = groupCritMult(gb, actor);
  if (critMult > 1) {
    dmg = Math.floor(dmg * critMult);
    events.push({ msg: '💥 ' + (actor.name || '') + ' 暴击！×' + critMult });
  }
  // 玩家受击：瞩目计数
  if (target.side === 'ally' && target._spotTauntTurn) {
    target._spotHits = (target._spotHits || 0) + 1;
  }
  // 玩家受击格挡（pity）
  if (target.side === 'ally' && typeof playerBlockHook === 'function') {
    var blockDmg = playerBlockHook(target, dmg);
    if (blockDmg < dmg) { dmg = blockDmg; events.push({ msg: '🛡️ ' + target.name + ' 格挡！' }); }
  }
  // 圣光守护：队友分担伤害（目标少受，分担者自己掉血）
  dmg = applyAllyDamageShare(gb, target, dmg, events);
  // v2.1.15：护盾先行吸收（金身护盾此前只写字段、无人消费）
  var sh = absorbShield(target, dmg);
  if (sh.absorbed > 0) {
    dmg = sh.dmg;
    events.push({ msg: '🛡️ ' + target.name + ' 护盾吸收 ' + sh.absorbed + (sh.broke ? '（护盾破碎）' : '（剩余 ' + target._shield + '）'), targetId: target.id, type: 'status' });
  }
  target.hp = Math.max(0, target.hp - dmg);
  events.push({ msg: '⚔️ ' + (actor.name || '单位') + ' 攻击 ' + target.name + ' → ' + dmg + ' 伤害', targetId: target.id, type: 'damage' });
  /* v2.1.10 魂攻/魂防接入敌群战斗。
     此前 battle-group.js 对 soulAtk / soulDef 是零引用 —— 只有单敌 battle.js 用了，
     导致炼魂一半投入（满级 魂攻 +3770 / 魂防 +1798）在 120 关敌群里完全是废属性。
     规则与单敌一致：目标有魂防则 rollDamage(soulAtk, soulDef, 4)，无魂防则吃全额。 */
  var sAtk = effectiveStat(actor, 'soulAtk');
  if (sAtk > 0 && target.hp > 0) {
    var sDef = effectiveStat(target, 'soulDef');
    var sDmg = sDef > 0 ? Math.max(1, sAtk - Math.floor(sDef / 2) + Math.floor(gb.rng() * 4) + 1) : sAtk;
    /* WP-C（单源化，第 2 半）：**魔法盾**（`soulDmgReduce`）的正道。
       天赋 magicshield 的判据是 `ctx.isSoul`，旧实现却只在**物理**分支读它（既不传 isSoul、
       还把值硬编码成 ×0.7）→ 该天赋实际上一次都没生效（死字段）。
       现在在魂攻伤害结算前按 `isSoul` 派发一次受击方天赋，**只取 soulDmgReduce**（避免与
       物理分支那次派发重复触发反伤/减伤等同名 mutation），并统一按 `m.value`（= 减伤比例）缩放。 */
    var soulTd = talentDispatch(target, 'onDamage', {
      attacker: actor, amount: sDmg, isSoul: true, isPhysical: false,
      isPlayerAttack: false, isSkill: false, isAoe: false, fromPlayer: actor.side === 'ally'
    });
    soulTd.mutations.forEach(function (m) { if (m.key === 'soulDmgReduce') sDmg = Math.floor(sDmg * (1 - m.value)); });
    var sh2 = absorbShield(target, sDmg);
    if (sh2.absorbed > 0) {
      sDmg = sh2.dmg;
      events.push({ msg: '🛡️ ' + target.name + ' 护盾吸收 ' + sh2.absorbed + ' 魂伤' + (sh2.broke ? '（护盾破碎）' : ''), targetId: target.id, type: 'status' });
    }
    target.hp = Math.max(0, target.hp - sDmg);
    events.push({ msg: '👻 ' + (actor.name || '单位') + ' 魂攻击 ' + target.name + ' → ' + sDmg + ' 魂伤害', targetId: target.id, type: 'damage' });
  }
  // 嗜血：造成伤害恢复
  var bt = talentDispatch(actor, 'onAfterDamage', { dealt: dmg, target: target });
  bt.events.forEach(function (e) { events.push({ msg: e.msg }); });
  /* WP-C（§2.14）：**状态**侧的同名钩子 —— 「战意」提供的吸血（普攻通道）在这里结算。
     与上面的天赋「嗜血」**叠加**（裁决 §6.3：各自结算、相加，不取最高）。
     此前 onAfterDamage 只派发天赋，状态侧的吸血增益无处落地。 */
  var sbt = dispatch(actor, 'onAfterDamage', { dealt: dmg, target: target });
  sbt.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: actor.id, type: e.type }); });
  return events;
}

/* WP-C（§2.14）：战意灌注的**技能吸血** —— 读持有者身上「战意」状态实例的 data.sls（多实例相加）。
   与「吸血」（普攻通道，见状态 warmight.onAfterDamage）分属两条通道。 */
function warmightSkillLifesteal(unit) {
  var sum = 0;
  if (!unit || !unit.statuses) return 0;
  unit.statuses.forEach(function (s) {
    if (s.id === 'warmight' && s.data && typeof s.data.sls === 'number') sum += s.data.sls;
  });
  return sum;
}

/* 施放技能
   WP-C：新增第 4 参数 opts。`opts.releasing = true` 表示这是**蓄力载荷的释放**（见 groupUnitTurn）——
   此时不再进入蓄力、也不再重设冷却（冷却在蓄力当回合已起算）。 */
function castSkill(gb, actor, skillId, opts) {
  opts = opts || {};
  var events = [];
  var def = SKILLS[skillId];
  if (!def) return events;
  /* WP-C（§2.1 / §2.7 / §2.12）：通用「蓄力 1 回合、下回合释放」。
     带 `charge: true` 的技能**首次施放只进入蓄力**（charging 状态，承伤 +25%），
     并把自身 skillId 写进蓄力实例；到期后由 groupUnitTurn 释放**技能自身**。
     敌群「蓄力重击」（chargeup）不带该标记 → 仍走 resolveChargeStrike 的 400% 单体物理，旧行为不变。 */
  if (def.charge && !opts.releasing) {
    events.push({ type: 'bubble', unit: actor.name, text: '⚡ ' + (actor.name || '') + '：' + def.name + '！', skillId: skillId });
    applyStatus(actor, { id: 'charging', duration: 1, data: { skillId: skillId } });
    syncStatusDerived(actor);
    events.push({ msg: '⏳ ' + (actor.name || '单位') + ' 蓄力（' + def.name + '，下回合释放）', targetId: actor.id, type: 'status' });
    setSkillCooldown(actor, skillId, def.cooldown || 1);
    return events;
  }
  var targets = selectTargets(gb, actor, def);
  // 技能气泡（对话效果：角色施放技能时喊话）
  events.push({ type: 'bubble', unit: actor.name, text: '⚡ ' + (actor.name || '') + '：' + def.name + '！', skillId: skillId });

  // 伤害
  if (def.type === 'attack') {
    /* v2.1.15：把 gb.rng 传下去 —— 技能自带的概率强化（咬击 30% 概率 +25%）需要它在
       calcSkillDamage 里掷骰，用 gb.rng 而不是 Math.random 才能让战斗可复现。 */
    /* v2.1.24：把「敌方全体存活单位」当随机池一并传下去 ——
       无影拳的 5 连击要求「目标随机可重复」，而 selectTargets('random1') 只给 1 个目标。 */
    var dmgResult = calcSkillDamage(def, actor, targets, {
      rng: gb.rng,
      pool: (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; }),
      /* WP-C（§2.12 梦幻光球「全场随机弹射」）：需要**全场**候选（含同阵营），故另给一份 allPool。 */
      allPool: gb.units.filter(function (u) { return u.hp > 0; })
    });
    if (dmgResult) {
      /* v2.2.18（§2.7 雷霆冲撞「自身承受 35% 反冲」）：本次施放**实际打在目标身上**的伤害合计。
         只在「真正扣了目标血」的分支里累加（下面 `t.hp = Math.max(0, t.hp - dmg)` 的同一个 dmg）；
         闪避落空、护盾吃掉的份额都不计入（那些都不是「对目标造成的伤害」）。
         v2.3.0（**overkill 口径裁决：按实际掉血**）：目标残血 10 而本次打 100 时，计入的是 **10**
         （反冲 = 10 × 35%，不是 100 × 35%）—— 即按 `Math.min(dmg, 扣除前血量)` 累加。
         ⚠️ 因此它与 ⚡ 伤害日志、技能吸血**不再是同一个数**：后两者仍是本次伤害值 `dmg`
            （吸血口径本次未裁，保持原样，避免顺手改未裁事项）。 */
      var dealtTotal = 0;
      /* v2.3.0（§2.13 作者裁决「就按照普通攻击会如何触发就如何实现」）：
         `asNormalAttack` 的技能**真正走普攻通道** —— calcSkillDamage 只为它做**目标抽取**
         （`normalSlots`，多段随机可重复），每一次命中交给 `normalAttack()` 结算：
         命中判定 / 威吓 / 利刃·多目标等攻击方天赋 / 暴击 / 格挡 / 圣光守护分担 / 护盾吸收 /
         受击方天赋与状态钩子 / 魂攻附伤 / onAfterDamage（嗜血·战意吸血）—— 与真普攻**逐条一致**。
         此前只补了一个 onAfterDamage 派发（其余判定仍是技能通道），与裁决不符。
         伤害系数 = 该技能区间取值（无影拳 55%~100%），语义与「启风额外普攻」的 `dmgMult` 相同
         （只乘在 base 上，其后常规修正照旧生效）。
         ⚠️ 因此这类技能**不经过**下面的技能伤害通道 —— 技能吸血（§2.14）也不作用于它，
            见 §2.13/§2.14 的**互斥裁决**（视为普攻 → 只触发普攻吸血）。 */
      if (dmgResult.normalSlots) {
        var naMul = (dmgResult.normalPower || 100) / 100;
        dmgResult.normalSlots.forEach(function (tid) {
          var nt = gb.units.find(function (u) { return u.id === tid; });
          if (!nt || nt.hp <= 0) return;
          events = events.concat(normalAttack(gb, actor, nt, naMul));
        });
      }
      if (dmgResult.proc) events.push({ msg: '💢 ' + (actor.name || '单位') + ' 的 ' + def.name + ' 触发强化（本次伤害 +' + Math.round((dmgResult.procMult - 1) * 100) + '%）', targetId: targets.length ? targets[0].id : null, type: 'talent' });
      dmgResult.hits.forEach(function (h) {
        var t = gb.units.find(function (u) { return u.id === h.targetId; });
        if (t && t.hp > 0) {
          // 命中判定（v2.1.5）
          if (!groupRollHit(gb, actor, t)) {
            events.push({ msg: '💨 ' + (actor.name || '') + ' 的 ' + def.name + ' 落空（' + t.name + ' 闪避）', targetId: t.id });
            return;
          }
          // 天赋修正（利刃等）
          var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: h.amount, isPhysical: h.dmgType === 'physical', attacker: actor, target: t });
          var dmg = h.amount;
          // v2.1.14 威吓：被威吓者的技能伤害同样削减（此前只标记不生效）
          if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown())));
          td.mutations.forEach(function (m) { if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value)); });
          // v2.1.13：目标侧减伤词条（伤害减免 / 抗扩散 / 抗技法）。
          // 此前技能伤害只派发攻击方，导致减伤类词条对技能完全无效。
          var tdg = talentDispatch(t, 'onDamage', { isPlayerAttack: false, amount: dmg, isPhysical: h.dmgType === 'physical', attacker: actor, target: t, isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          /* v2.1.15：受击方状态钩子（广域防御减伤 / 冰冻·睡眠的受击解除） */
          var sdg = dispatch(t, 'onDamage', { attacker: actor, amount: dmg, isPhysical: h.dmgType === 'physical', isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          tdg.mutations = tdg.mutations.concat(sdg.mutations);
          sdg.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: t.id, type: e.type }); });
          tdg.mutations.forEach(function (m) { if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value)); });
          /* v2.3.0（WP-D §3.12-1 收口）：技能暴击与普攻**同一套判据** —— 走 groupCritMult()
             （天赋「斗者本能」30%/150% × 玩家/宠物暴击档 30%/300%、15%/160%），
             两边各自掷骰、都触发取较高倍率、**只结算一次**。
             此前技能路径直接走 talentCrit(actor)：宠物带技能出手时**宠物暴击档不生效**
             （只出天赋的 ×1.5），与普攻路径分叉 —— 同一单位普攻/技能两套暴击口径。
             ⚠️ 这一步与普攻路径一样会多掷一次 gb.rng()（见 groupCritMult 注释），
                故技能链路的随机序列随之改变。 */
          var critMult = groupCritMult(gb, actor);
          if (critMult > 1) {
            dmg = Math.floor(dmg * critMult);
            events.push({ msg: '💥 ' + (actor.name || '') + ' 暴击！×' + critMult });
          }
          // 圣光守护：队友分担
          dmg = applyAllyDamageShare(gb, t, dmg, events);
          // v2.1.15：护盾吸收
          var shk = absorbShield(t, dmg);
          if (shk.absorbed > 0) {
            dmg = shk.dmg;
            events.push({ msg: '🛡️ ' + t.name + ' 护盾吸收 ' + shk.absorbed + (shk.broke ? '（护盾破碎）' : '（剩余 ' + t._shield + '）'), targetId: t.id, type: 'status' });
          }
          var applied = Math.min(dmg, t.hp);   // v2.3.0：**实际扣除的血量**（目标残血时截断 overkill）
          t.hp = Math.max(0, t.hp - dmg);
          dealtTotal += applied;   // v2.2.18 反冲基数 / v2.3.0 overkill 口径（见 dealtTotal 声明处）
          events.push({ msg: '⚡ ' + (actor.name || '') + ' ' + def.name + ' → ' + t.name + ' ' + dmg + ' 伤害', targetId: t.id, type: 'damage' });
          /* WP-C（§2.14 技能吸血）：持有「战意」者用**技能**造成伤害时按 data.sls 回血
             （与普攻通道的「吸血」/天赋「嗜血」分开；三者可叠加，各自结算）。
             v2.3.0（§2.13 + §2.14 互斥裁决，作者原话：「查看文档该技能是否视为普通攻击，
             如果视为普通攻击则不会触发技能吸血，反之不会触发攻击吸血」）：
               · §2.13 文档写明无影拳「**每次视为普通攻击**」→ 它只触发**普攻吸血**（data.ls，
                 走普攻通道的 onAfterDamage），**不**触发技能吸血；
               · 反之，非 asNormalAttack 的技能只触发技能吸血，不触发攻击吸血。
             两条通道按「该技能是否视为普通攻击」**互斥** —— 这里的守卫是显式落点
             （结构上 asNormalAttack 已改走 normalAttack，命中不会流到此处；守卫防未来加回技能通道时静默破例）。 */
          if (dmg > 0 && !def.asNormalAttack) {
            var sls = warmightSkillLifesteal(actor);
            if (sls > 0) {
              var slHeal = Math.max(1, Math.floor(dmg * sls));
              actor.hp = Math.min(actor.base.hp, actor.hp + slHeal);
              events.push({ msg: '🩸 ' + (actor.name || '') + ' 技能吸血 +' + slHeal, targetId: actor.id, type: 'heal' });
            }
          }
          /* WP-C（§2.13 无影拳）旧落点说明：此前这里只为 `asNormalAttack` 的技能补一个
             **攻击后钩子**（天赋「嗜血」/ 状态「战意」吸血）。v2.3.0 起该技能**整条**改走
             `normalAttack()`（见上方 normalSlots 分支）—— 这些钩子由普攻通道自己派发，
             不再需要在这里重建。 */
          // 蓄力重击：蓄力状态
          /* v2.1.21：蓄力重击的结算已移出 castSkill ——
             本技能现在只负责「进入蓄力」（由 skill.js 的 effects 施加 charging 状态），
             400% 重击改在 groupUnitTurn 的回合开始处结算（resolveChargeStrike），
             时点与设计文档 doc/design-v2.0.md:101-105 的「下回合结算」一致。 */
        }
      });
      /* v2.2.18（§2.7 雷霆冲撞「自身承受 35% 反冲」，作者裁决）——
         反冲伤害 = **本次对目标实际造成的伤害 × def.recoil**（裁决基数取 (a)「本次对目标造成的伤害」）。
         · 单/多目标：本技能 `target:'random1'` → 本次施放只有 **1 次命中**，`dealtTotal` 就是那一次；
           带 recoil 的技能若为**多目标**，本行的口径是「**按每个目标的实际伤害分别计算后相加**」
           （即 Σ 实际伤害 × recoil，向下取整一次），不做静默改写。
         · **overkill 按实际掉血**（v2.3.0 作者裁决）：目标残血 10、本次打 100 → 计入 **10**
           （反冲 = 10×35%），由 `dealtTotal += Math.min(dmg, 扣血前血量)` 实现。
         · **落空 / 闪避不吃反冲**（v2.3.0 作者裁决「不吃」）：那次命中在命中判定处就 return，
           不进 `dealtTotal`；护盾吃掉的那部分同样不计（也不是「对目标造成的伤害」）。
         · 是否过自身防御/减伤：**不过**（v2.3.0 作者裁决「不过」）—— 设计文档未给口径，
           取最保守的「直接扣血」：不读 effectiveStat(def) / 不派发天赋·状态的 onDamage / 不走护盾吸收。
           反冲是**施法代价**（与「迷惑·牺牲自我」同一性质），不是一次受击。
         · 向下取整：`dealtTotal` 很小时（1~2 点）反冲为 0；此时**仍写日志**，避免「为什么没掉血」不可见。
         · 可以把自己打死：`Math.max(0, ...)` 归零即可 —— 胜负判定由既有的 groupBattleStep
           回合后检查（alliesAlive / enemiesAlive）收口，**不另造逻辑**（与「遗言」自我牺牲同一路径）。
         行为守卫：scripts/test-pet-skills.js §2.7 六条断言（基数 / overkill 截断 / 落空不吃 /
         不过减伤 / 自死）。 */
      if (def.recoil > 0 && dealtTotal > 0) {
        var recoilDmg = Math.floor(dealtTotal * def.recoil);
        actor.hp = Math.max(0, actor.hp - recoilDmg);
        events.push({ msg: '💥 ' + (actor.name || '单位') + ' ' + def.name + ' 反冲 -' + recoilDmg
          + '（对目标造成 ' + dealtTotal + ' × ' + Math.round(def.recoil * 100) + '%）', targetId: actor.id, type: 'damage' });
      }
      /* WP-C（§2.12）：梦幻光球「如果弹射次数剩余，按未发动次数为自身恢复血量」——
         自愈量由 calcSkillDamage 按「未发动次数 × 单次伤害」算出（selfHealAmount）。 */
      if (dmgResult.selfHealAmount > 0) {
        var bh = Math.max(1, Math.floor(dmgResult.selfHealAmount));
        actor.hp = Math.min(actor.base.hp, actor.hp + bh);
        events.push({ msg: '💚 ' + (actor.name || '单位') + ' ' + def.name + '：剩余弹射未发动 → 自愈 +' + bh, targetId: actor.id, type: 'heal' });
      }
    }
  }

  // 效果（状态/治疗/增益）
  // v2.1.14：把当前回合喂给技能效果（skill.js 的「嘲讽」需要它记录失效时点）
  // v2.1.15：再带上 units —— 「清除迷雾」要作用全场，而 selectTargets('all') 只给对侧
  var fx = applySkillEffects(def, actor, targets, { turn: gb.turn + 1, units: gb.units, gb: gb });
  /* v2.3.0（WP-D §5.1.5 / §5.6-3）：魔法镜的**派发点**。
     此前 `onBeforeSupport` 全项目没有任何调用点、`reflectSupport` 也无消费者 → 该天赋的
     「免疫」与「反弹」两项从未生效（死壳）。这里在辅助技能的每个目标生效前派发，且**只在
     「对手指向本单位」的辅助技能**上触发（队友给的增益/治疗不算）。
     `mirrorBlocked[targetId]` = 是否可反弹（负面/减益才反弹；治疗/增益**仅免疫**）。
     注：`fx.events` 是「技能自身的文案」，不属于施加到目标的辅助效果，故不拦截。 */
  var mirrorBlocked = {};
  if (def.type === 'support') {
    targets.forEach(function (t) {
      if (!t || t.hp <= 0 || t.id === actor.id || t.side === actor.side) return;
      var mr = talentDispatch(t, 'onBeforeSupport', { targeted: true, support: true, sourceId: actor.id, source: actor, target: t });
      if (!mr.skipAction) return;
      var reflect = false;
      mr.mutations.forEach(function (m) { if (m.key === 'reflectSupport') reflect = true; });
      mirrorBlocked[t.id] = reflect;
      var mmsg = '';
      for (var mi = 0; mi < mr.events.length; mi++) {
        if (mr.events[mi] && mr.events[mi].msg) { mmsg = mr.events[mi].msg; break; }
      }
      events.push({ msg: mmsg || ('🪞 ' + t.name + ' 魔法镜：免疫'), targetId: t.id, type: 'talent' });
    });
  }
  /* v2.3.0 WP-D（§3.5 + §3.12-2）：本次施放是否为辅助型技能；是则目标侧的辅助效果
     要过一遍「镜像结界」的阵营缩放（仅非治疗通道；治疗走 onBeforeHeal 的 healBoost）。 */
  var isSupportCast = def.type === 'support';
  function supportMulFor(t) { return isSupportCast ? supportEffectMul(t, actor) : 1; }

  fx.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  fx.statusApps.forEach(function (sa) {
    var t = gb.units.find(function (u) { return u.id === sa.unitId; });
    if (t && t.hp > 0) {
      var grade = sa.grade || 1;
      /* v2.3.0 WP-D（§3.12-2 全通道）：镜像结界 —— 敌方辅助技能加到持有者身上的状态，
         其幅度按阵营缩放（我方 ×1.25 / 敌方 ×0.75）。两条载体都要照顾：
           · **实例 amplitude**（sa.modsPct，如打湿按成长传入的魂防削减）→ 就地乘到实例值上；
           · **定义驱动幅度**（status-defs.js 的 statModsPct，如遗言诅咒 atk/soulAtk -25%）
             —— 定义是全局共享的，改不得；改走 applyStatus 的 `defScale`（按实例缩放定义值）。 */
      var applyModsPct = sa.modsPct;
      var supMul = supportMulFor(t);
      if (supMul !== 1 && applyModsPct) {
        applyModsPct = {};
        for (var mk in sa.modsPct) applyModsPct[mk] = sa.modsPct[mk] * supMul;
      }
      var defScale = (supMul !== 1) ? supMul : null;   // null = 不写字段（保持旧实例形状）
      /* v2.1.15：金身护盾的「护盾期免疫普通+高级负面」。
         此前 _shieldImmune 只置位、无消费方 → 开战护盾既不挡伤害也不免负面。 */
      if (t._shieldImmune && t._shield > 0 && grade <= 2) {
        events.push({ msg: '🛡️ ' + t.name + ' 受护盾庇护，免疫【' + getStatusName(sa.id) + '】（剩余 ' + t._shield + '）', targetId: t.id, type: 'status' });
        return;
      }
      /* v2.3.0 魔法镜：被免疫；**负面/减益类**反射给施加者，治疗/增益类仅免疫（§5.6-3） */
      if (Object.prototype.hasOwnProperty.call(mirrorBlocked, t.id)) {
        var isPos = (typeof isPositiveStatus === 'function') && isPositiveStatus(sa.id);
        if (mirrorBlocked[t.id] && !isPos && actor && actor.hp > 0 && actor.id !== t.id) {
          applyStatus(actor, { id: sa.id, duration: sa.duration, source: t, modsPct: sa.modsPct, data: sa.data });
          syncStatusDerived(actor);
          events.push({ msg: '🪞 魔法镜反弹：【' + getStatusName(sa.id) + '】→ ' + actor.name, targetId: actor.id, type: 'status' });
        }
        return;
      }
      /* 朴实：只挡「直接影响属性」的增益/减益（§5.6-1）；不动如山：血量>95% 免疫普通~高级（§3.9）。
         `modsPct` 一并下传，供朴实判断「本次实例是否直接改属性」（用**缩放后**的幅度）。 */
      var selfGuard = talentDispatch(t, 'onBeforeStatus', { statusId: sa.id, grade: grade, modsPct: applyModsPct });
      /* v2.3.0：朴实对「既有增减益又有附加效果」的状态只剥属性部分（stripStatMods → noStatMods） */
      var stripMods = false;
      selfGuard.mutations.forEach(function (m) { if (m.key === 'stripStatMods') stripMods = true; });
      // 阵营光环守卫（凛冬之核：我方全体免疫冰冻）
      var mates = (t.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) { return u.hp > 0; });
      var auraGuard = talentAura(mates, 'onAllyStatus', { statusId: sa.id, grade: grade, target: t });
      if (!selfGuard.skipAction && !auraGuard.skipAction) {
        // v2.1.14：区分「施加 / 刷新 / 叠层」，并去掉日志里外泄的英文状态 id（如 (poison)）
        var ar = applyStatus(t, { id: sa.id, duration: sa.duration, source: actor, modsPct: applyModsPct, defScale: defScale, data: sa.data, noStatMods: stripMods });
        syncStatusDerived(t);   // v2.1.15：状态变了就重算 _statMods，否则减速/破甲不生效
        var verb = ar.refreshed ? '刷新' : '施加';
        var extra = '';
        if (ar.refreshed && sa.duration) extra = '（延续 ≥' + sa.duration + ' 回合）';
        else if (sa.duration) extra = '（' + sa.duration + ' 回合）';
        if (Array.isArray(ar.events)) {
          for (var qi = 0; qi < ar.events.length; qi++) {
            if (ar.events[qi] && ar.events[qi].type === 'stack' && ar.events[qi].stacks) extra = '（叠至 ' + ar.events[qi].stacks + ' 层）';
          }
        }
        events.push({ msg: '🌀 ' + actor.name + ' → ' + t.name + ' ' + verb + '【' + getStatusName(sa.id) + '】' + extra, targetId: t.id, type: 'status' });
      } else {
        var blocked = selfGuard.events.concat(auraGuard.events);
        var bmsg = '';
        for (var bi = 0; bi < blocked.length; bi++) { if (blocked[bi] && blocked[bi].msg) { bmsg = blocked[bi].msg; break; } }
        events.push({ msg: bmsg || ('🛡️ ' + t.name + ' 免疫【' + getStatusName(sa.id) + '】'), targetId: t.id, type: 'status' });
      }
    }
  });
  fx.heals.forEach(function (h) {
    var t = gb.units.find(function (u) { return u.id === h.unitId; });
    /* v2.3.0 魔法镜：治疗属「增益类」→ **仅免疫、不反弹**（§5.6-3） */
    if (t && Object.prototype.hasOwnProperty.call(mirrorBlocked, t.id)) {
      events.push({ msg: '🪞 ' + t.name + ' 魔法镜：免疫治疗', targetId: t.id, type: 'talent' });
      return;
    }
    if (t) {
      // 末日阻断治疗
      var doom = dispatch(t, 'onHeal', {});
      if (!doom.skipAction) {
        var amount = h.amount;
        // 镜像结界：受我方辅助 +25% / 受敌方辅助 -25%（ctx.source 为施法者）
        var th = talentDispatch(t, 'onBeforeHeal', { amount: amount, source: actor, isSupport: true });
        th.mutations.forEach(function (m) {
          if (m.key === 'healBoost') amount = Math.floor(amount * (1 + m.value));
          if (m.key === 'healReduce') amount = Math.floor(amount * (1 - m.value));
        });
        // 威压领域：敌方治疗 -10%；持有者血量>70% 时翻倍为 -20%（§3.10）
        var foes = (t.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; });
        var pf = talentAura(foes, 'onFoeHeal', { target: t, amount: amount });
        pf.mutations.forEach(function (m) { if (m.key === 'healReduce') amount = Math.floor(amount * (1 - m.value)); });
        pf.events.forEach(function (e) { events.push({ msg: e.msg }); });
        if (amount < 0) amount = 0;
        t.hp = Math.min(t.base.hp, t.hp + amount);
        events.push({ msg: '💚 ' + actor.name + ' → ' + t.name + ' 治疗 +' + amount, targetId: t.id, type: 'heal' });
      } else events.push({ msg: '🌑 ' + t.name + ' 被末日阻断治疗', targetId: t.id, type: 'status' });
    }
  });
  /* v2.1.15：buff 真正落地。
     改前两处问题：① 只把 b.value 累加进 t._dmgReduce，而伤害结算从不读该字段（减伤不生效）；
     ② 只处理 b.all，按单位下发的 buff（「强攻」的 atkBoost）被直接丢弃。
     现在按 key 映射到状态：有 duration、可被驱散、能进详情页。 */
  fx.buffs.forEach(function (b) {
    var recv = b.all
      ? (actor.side === 'ally' ? gb.allies : gb.enemies)
      : gb.units.filter(function (u) { return u.id === b.unitId; });
    var dur = b.duration || 3;
    var applied = [];
    var mirrorNote = '';
    recv.forEach(function (t) {
      if (!t || t.hp <= 0) return;
      /* v2.3.0 魔法镜：增益属「增益类」→ **仅免疫、不反弹**（§5.6-3） */
      if (Object.prototype.hasOwnProperty.call(mirrorBlocked, t.id)) return;
      /* v2.3.0 WP-D（§3.12-2 全通道）：镜像结界 —— 增益**幅度**按来源阵营缩放
         （我方来源 ×1.25 / 敌方来源 ×0.75）。
         v2.3.0 WP-E：`dmgReduce`（广域防御）此前**没有可缩放的载体** —— 状态定义 wideguard 里
           的减伤是硬编码 0.20，而这里又丢弃了 bulwark 按成长推送的 `b.value`（0.20~0.40；
           v2.3.0 作者裁决后上限收窄为 **0.30** —— 本行只是透传 `b.value`，无需改动），
           两个数字互相打架且推送值无人消费（死字段）。现在减伤幅度**单源**取 `b.value`
           （= SKILLS.bulwark.range.dmgReduce，随等级/炼化成长），经实例 `data.reduce` 携带、
           由 status-defs 的 wideguard.onDamage 消费；镜像缩放随 `mul` 一并写进去。 */
      var mul = supportMulFor(t);
      if (mul !== 1) mirrorNote = '（镜像结界 ×' + mul + '）';
      if (b.key === 'dmgReduce') applyStatus(t, { id: 'wideguard', duration: dur, data: (b.value != null) ? { reduce: b.value * mul } : undefined });
      else if (b.key === 'atkBoost') applyStatus(t, { id: 'atkup', duration: dur, modsPct: { atk: b.value * mul } });
      /* WP-C（§2.14 战意灌注）：一条 buff 同时携带
           · 攻击/魂攻中**较高一项**的 +val（`modsPct`，键由技能效果按目标属性选定）
           · 吸血（`lifesteal`）+ 技能吸血（`skillLifesteal`）
         三项都按镜像结界的阵营倍率缩放（mul）—— 裁决 §6.3 明确「吸血增益」属可缩放的辅助效果。
         属性落 `atkup`（沿用既有载体），两个吸血落 `warmight` 状态实例的 data。 */
      else if (b.key === 'warmight') {
        var srcPct = b.modsPct || { atk: b.value };
        var scaled = {};
        for (var pk in srcPct) scaled[pk] = srcPct[pk] * mul;
        applyStatus(t, { id: 'atkup', duration: dur, modsPct: scaled });
        applyStatus(t, { id: 'warmight', duration: dur, data: { ls: (b.lifesteal || 0) * mul, sls: (b.skillLifesteal || 0) * mul } });
      }
      /* WP-C（§2.8 双撞）：把窃得的攻击/防御转给我方随机 1 名角色（正面，幅度同样可被镜像缩放）。 */
      else if (b.key === 'stolen') {
        var stp = {};
        for (var sk2 in (b.modsPct || {})) stp[sk2] = b.modsPct[sk2] * mul;
        applyStatus(t, { id: 'stolen', duration: dur, modsPct: stp });
      }
      else return;
      syncStatusDerived(t);
      applied.push(t.name);
    });
    if (!applied.length) return;
    var label = (b.key === 'dmgReduce') ? ('受到伤害 -' + Math.round(b.value * 100) + '%')
      : (b.key === 'atkBoost') ? ('攻击 +' + Math.round(b.value * 100) + '%')
        : (b.key === 'warmight') ? ('战意：攻击/魂攻 +' + Math.round(b.value * 100) + '%，吸血 ' + Math.round((b.lifesteal || 0) * 100) + '% / 技能吸血 ' + Math.round((b.skillLifesteal || 0) * 100) + '%')
          : (b.key === 'stolen') ? ('窃取之力 攻击 +' + Math.round((b.modsPct && b.modsPct.atk || 0) * 100) + '%、防御 +' + Math.round((b.modsPct && b.modsPct.def || 0) * 100) + '%')
            : ('增益 +' + Math.round(b.value * 100) + '%');
    events.push({ msg: '🛡️ ' + actor.name + ' ' + def.name + ' → ' + applied.join('、') + ' ' + label + mirrorNote + '（' + dur + ' 回合）', type: 'buff' });
  });

  // 遗言：自身阵亡
  if (skillId === 'lastword') {
    actor.hp = 0;
    events.push({ msg: '💀 ' + actor.name + ' 遗言：自我牺牲阵亡', targetId: actor.id, type: 'status' });
  }

  // 设置冷却（WP-C：蓄力载荷的释放当回合**不再重设** —— 冷却已在蓄力当回合起算）
  if (!opts.releasing) setSkillCooldown(actor, skillId, def.cooldown || 1);
  return events;
}

/* 玩家攻击技能选择：装备的攻击类玩家技能（陨石/冰魄/巨石），非冷却时随机施放 */
function playerAttackSkillPick(gb, actor) {
  if (!actor._playerSkills) return null;
  var atkSkills = Object.keys(actor._playerSkills).filter(function (sid) {
    var s = getPlayerSkill(sid);
    return s && s.type === 'attack' && (actor._playerSkills[sid] || 0) >= 1;
  });
  if (!atkSkills.length) return null;
  // 非冷却的
  var ready = atkSkills.filter(function (sid) { return !skillOnCooldown(actor, sid); });
  if (!ready.length) return null;
  // 30% 几率施放（不每回合放），让普攻也有存在感
  if (battleRnd() < 0.3) return ready[Math.floor(battleRnd() * ready.length)];
  return null;
}

/* 单单位回合 */
function groupUnitTurn(gb, actor) {
  var events = [];
  var turn = gb.turn + 1;

  /* v2.1.14 嘲讽复位。此前 player-skill-hooks.js / skill.js 只把 _taunting 置 true，
     全项目没有一处置回 false —— 后果有两个：
       1) selectTargets 永远把敌方攻击吸到嘲讽者身上（永久嘲讽）；
       2) unitInitiative 里 `if (u._taunting) spd *= 2` 永久生效（永久 2 倍速）。
     语义修正：嘲讽从施加起持续到「本单位下一次行动开始」，
     刚好覆盖本轮剩余出手 + 到本单位下轮出手之前。 */
  if (actor._taunting && actor._tauntMark !== turn) {
    actor._taunting = false;
    actor._tauntMark = null;
  }

  // 玩家技能回合开始（气势如虹/气力恢复）
  if (actor.side === 'ally' && typeof playerSkillTurnStart === 'function') {
    var ps = playerSkillTurnStart(gb, actor, turn);
    ps.forEach(function (e) { events.push({ msg: e.msg }); });
  }
  // 天赋 onTurnStart
  var ts = talentDispatch(actor, 'onTurnStart', { turn: turn, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies });
  ts.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });

  // 状态 onTurnStart（哈欠→睡眠等）
  var ss = dispatch(actor, 'onTurnStart', { turn: turn });
  ss.events.forEach(function (e) { events.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });

  // 慢启动/懒惰/冰冻/畏缩 → skipAction
  /* v2.3.0（作者裁决）：另传 `actualTurn` = **实际回合号**（= gb.turn）。
     `turn` 这个局部值仍是 `gb.turn + 1`（既有约定，regen / 词条 / 玩家技能回合钩子都在用它，
     不动）；慢启动需要「设定 x 回合就真的 x 回合」，故单独给出真实回合号，见 talent.js 的 slowstart。 */
  var turnCtx = { turn: turn, actualTurn: gb.turn };
  var before = dispatch(actor, 'onBeforeAction', turnCtx);
  var tBefore = talentDispatch(actor, 'onBeforeAction', turnCtx);
  if (before.skipAction || tBefore.skipAction) {
    // v2.1.14：原日志只有「XX 无法行动」，玩家看不出到底是冰冻、畏缩还是慢启动。
    // 现在把触发源的文案（冰冻/畏缩/睡眠/慢启动/懒惰…）拼进括号。
    var why = skipReasonText((tBefore.events || []).concat(before.events || []));
    events.push({ msg: '🚫 ' + (actor.name || '单位') + ' 无法行动' + (why ? '（' + why + '）' : ''), targetId: actor.id, type: 'skip' });
    /* v2.1.15：即使这回合没行动，状态 duration 也必须递减 ——
       否则「跳过行动」这条早退分支永远走不到回合末的 ageStatuses，
       冰冻/睡眠会重新变成永久锁定（修好一个坑又掉进同一个坑）。 */
    var agedSkip = ageStatuses(actor);
    agedSkip.forEach(function (e) { events.push({ msg: e.msg, targetId: e.unitId, type: e.type }); });
    if (agedSkip.length) syncStatusDerived(actor);
    return events;
  }

  /* ---- v2.1.21：两种情况会「替代」本回合的正常行动 ---- */
  var acted = false;

  /* v2.1.33：附身判定必须在**本回合内**快照 —— 回合末的 ageStatuses 会先把附身状态掉光，
     等到下面「冷却递减」那一步再判就永远是 false（所以「冷却暂停」此前怎么测都没效果）。 */
  var possessedThisTurn = isPossessed(actor);

  /* 蓄力重击结算：时点对齐设计文档（本回合蓄力 → 下回合结算）
     WP-C：带**载荷**的通用蓄力（p_shine / p_thundercharge / p_dreamball）释放技能自身；
     无载荷（敌群「蓄力重击」chargeup）仍走 resolveChargeStrike 的 400% 单体物理，旧行为不变。 */
  if (actor._chargeReady) {
    actor._chargeReady = false;
    if (actor._chargePayload) {
      var chargePayload = actor._chargePayload;
      actor._chargePayload = null;
      events = events.concat(castSkill(gb, actor, chargePayload, { releasing: true }));
    } else {
      events = events.concat(resolveChargeStrike(gb, actor));
    }
    acted = true;
  }

  /* 迷惑（幻影之瞳）：随机执行三选一，而不是按自己的意志行动 */
  if (!acted && hasStatus(actor, 'confused')) {
    events = events.concat(resolveConfusion(gb, actor));
    acted = true;
  }

  /* v2.1.32：末日等「技能不可用」的负面。
     状态经 onBeforeAction 产出 skillsDisabled mutation，但此前**没有任何消费者** ——
     详情页（SKILL_DOCS.doom）写着「技能不可用」，实战里却照样放技能（PITFALL-12 同类缺陷）。
     ⚠️ test-status.js 只断言了 mutation「被生产」，所以一直没暴露：判据要盯真实行为，不是中间结构。 */
  var skillsBlocked = (before.mutations || []).some(function (m) {
    return m.key === 'skillsDisabled' && m.value;
  });

  // 选择行动：敌人用 AI 策略，玩家用随机/技能
  var skillId, actTarget;
  if (!acted && skillsBlocked) {
    events.push({ msg: '🌑 ' + (actor.name || '单位') + ' 受末日影响，本回合无法使用技能', targetId: actor.id, type: 'status' });
  }
  if (!acted && !skillsBlocked) {
    if (actor.side === 'enemy' && typeof aiDecide === 'function') {
      var ai = aiDecide(gb, actor);
      skillId = ai.skillId;
      actTarget = ai.target;
    } else {
      // 玩家：优先施放装备的攻击类玩家技能（陨石/冰魄/巨石）
      var ps = playerAttackSkillPick(gb, actor)
      if (ps) { skillId = ps; }
      else skillId = pickSkill(actor);
    }
  }
  if (!acted && skillId) {
    // 玩家技能用 playerAttackSkill，敌群技能用 castSkill
    if (actor.side === 'ally' && actor._playerSkills && actor._playerSkills[skillId] && typeof playerAttackSkill === 'function') {
      var pr = playerAttackSkill(gb, actor, skillId)
      if (pr) {
        events = events.concat(pr.events)
        if (pr.cd) setSkillCooldown(actor, skillId, pr.cd)
        acted = true
      }
    }
    if (!acted) {
      var castEvents = castSkill(gb, actor, skillId);
      events = events.concat(castEvents);
      acted = true;
    }
  }
  if (!acted) {
    // 普攻：目标选择（AI 用策略目标，否则随机）
    var targets;
    if (actTarget) targets = [actTarget];
    else targets = selectTargets(gb, actor, null);
    if (targets.length) {
      var ta = talentDispatch(actor, 'onBeforeAction', { turn: turn, actualTurn: gb.turn });
      var multi = ta.mutations.find(function (m) { return m.key === 'multiTarget'; });
      var nTargets = multi ? multi.value : 1;
      /* WP-C（多目标天赋「可额外攻击 x 个敌人」此前**不可达**）：
         `selectTargets(gb, actor, null)` 恒返回 1 个目标，原来的 `targets.slice(0, nTargets)`
         永远只打得到那 1 个 → 额外目标形同不存在。
         现在按需要的总数从对侧补充（无放回、走本场种子），再把前 nTargets 个依次普攻。 */
      if (nTargets > targets.length) {
        var extraPool = (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) {
          return u.hp > 0 && targets.indexOf(u) < 0;
        });
        while (targets.length < nTargets && extraPool.length) {
          targets.push(extraPool.splice(Math.floor(gb.rng() * extraPool.length), 1)[0]);
        }
      }
      targets.slice(0, nTargets).forEach(function (t) {
        events = events.concat(normalAttack(gb, actor, t));
      });
    }
  }

  // 玩家技能回合结束（瞩目回复）
  if (actor.side === 'ally' && typeof playerSkillTurnEnd === 'function') {
    var pe = playerSkillTurnEnd(gb, actor, turn);
    pe.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  }
  // 天赋 onAfterAction / onTurnEnd
  var ae = talentDispatch(actor, 'onAfterAction', {});
  ae.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  var te = talentDispatch(actor, 'onTurnEnd', { turn: turn, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies });
  te.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  var se = dispatch(actor, 'onTurnEnd', { turn: turn });
  se.events.forEach(function (e) { events.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });

  /* v2.1.15：回合末状态递减 —— 状态生命周期的关键一步，此前完全缺失
     （ageStatuses 的角色原本由 tickStatuses 承担，而后者全项目零调用）。
     放在 onTurnEnd 钩子之后，duration=N 的持续伤害类状态刚好结算 N 次。
     修好之前：中毒/减速/破甲 挂上就是整场，冰冻/睡眠 更是因为「受击解除」也没接线
     导致该单位整场无法行动。 */
  var aged = ageStatuses(actor);
  aged.forEach(function (e) { events.push({ msg: e.msg, targetId: e.unitId, type: e.type, reason: e.reason }); });
  if (aged.length) syncStatusDerived(actor);

  // 技能冷却递减（v2.1.33：幽魂附身期间暂停 —— 设计文档「附身状态下技能不可用，且冷却暂停」）
  if (!possessedThisTurn) tickSkillCooldowns(actor);

  // 命中/闪避修正倒计时（闪耀 / 打湿）
  if (actor._hitModTurns > 0) {
    actor._hitModTurns--;
    if (actor._hitModTurns === 0) { actor._accMod = 0; actor._eva = 0; }
  }

  return events;
}

/* v2.1.14：场地事件此前只 push 进 gb.events，而 UI 只读 gb.log
   —— 导致 g3 起每个大关的主题场地（沙暴/雪天/酷暑/雨天/反转/毒气）
   造成的伤害与状态在战斗日志中完全不可见。统一由此函数落日志。 */
function logTerrainEvents(gb, evts) {
  if (!evts || !evts.length) return;
  var label = (gb.terrain && gb.terrain.name) ? ('场地·' + gb.terrain.name) : '场地';
  gb.log.push({
    turn: gb.turn,
    unit: label,
    terrain: true,
    events: evts.map(function (e) {
      return { msg: e.msg, targetId: e.targetId, type: e.type || 'terrain' };
    })
  });
}

/* v2.1.14：开战（回合 0）天赋钩子派发。
   此前 talent.js 的「威吓」注册在 onBattleStart 上，但全项目没有任何地方派发过这个 hook
   —— 结果不是「日志没写清威吓了谁」，而是威吓事件根本没发生过。
   这里对双方各派发一次，并把事件写进 gb.log（UI 只读 gb.log）。 */
function dispatchBattleStartTalents(gb) {
  var rA = talentAura(gb.allies, 'onBattleStart', { allyUnits: gb.allies, enemyUnits: gb.enemies });
  var rE = talentAura(gb.enemies, 'onBattleStart', { allyUnits: gb.enemies, enemyUnits: gb.allies });
  var evts = rA.events.concat(rE.events).filter(function (e) { return e && e.msg; });
  if (!evts.length) return evts;
  gb.events = gb.events.concat(evts);
  gb.log.push({
    turn: 0,
    unit: '开场',
    opening: true,
    events: evts.map(function (e) {
      return { msg: e.msg, targetId: e.targetId, type: e.type || 'talent', talentId: e.talentId };
    })
  });
  return evts;
}

/* 一个完整回合（所有存活单位按行动队列行动一次） */
function groupBattleTick(gb) {
  if (gb.done) return;
  _setBattleRng(gb);   // v2.1.27
  if (gb.turn === 0) dispatchBattleStartTalents(gb);
  if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
    var player = gb.allies.find(function(u){ return u._playerSkills; });
    if (player) {
      var evs = playerSkillBattleStart(gb, player);
      evs.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:player.name, events:[e]}); });
    }
  }
  gb.turn++;
  // v2.1.13 场地：回合开始结算
  if (gb.terrain && gb.terrain.onTurnStart) {
    var ts3 = gb.terrain.onTurnStart(gb);
    if (ts3 && ts3.events) { gb.events = gb.events.concat(ts3.events); logTerrainEvents(gb, ts3.events); }
  }
  // v2.1.15：建队列前先统一重算属性修正，否则「减速」影响不到出手顺序
  refreshAllStatMods(gb.units);
  var queue = buildActionQueue(gb);
  queue.forEach(function (u) {
    if (gb.done) return;
    if (u.hp <= 0) return;
    var evts = groupUnitTurn(gb, u);
    // v2.1.13 天赋「疾影」：本回合额外行动 1 次
    var exRes2 = talentDispatch(u, 'onAfterAction', { turn: gb.turn });
    var wantExtra2 = false;
    exRes2.mutations.forEach(function (m) { if (m.key === 'extraAction') wantExtra2 = true; });
    exRes2.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
    if (wantExtra2 && !gb.done && u.hp > 0
        && (u.side === 'ally' ? gb.enemies : gb.allies).some(function (a) { return a.hp > 0; })) {
      evts = evts.concat(groupUnitTurn(gb, u));
    }
    gb.events = gb.events.concat(evts);
    gb.log.push({ turn: gb.turn, unit: u.name, events: evts });
    // 检查胜负
    var alliesAlive = gb.allies.some(function (a) { return a.hp > 0; });
    var enemiesAlive = gb.enemies.some(function (e) { return e.hp > 0; });
    if (!alliesAlive) { gb.done = true; gb.winner = 'enemy'; return; }
    if (!enemiesAlive) { gb.done = true; gb.winner = 'ally'; return; }
  });
  // 场地（M2b-5 接入）
  if (gb.terrain && gb.terrain.onTurnEnd) {
    var te = gb.terrain.onTurnEnd(gb);
    if (te && te.events) { gb.events = gb.events.concat(te.events); logTerrainEvents(gb, te.events); }
  }
}

/* v2.1.33：冰魄光束的「下回合第二段」（OQ-12：回合开始时触发，不占用行动）。
   由 player-skill-hooks.js 施放时把 { targetId, dmg } 挂到施放者身上，
   本函数在回合切换处统一结算并清空。目标已阵亡则该段不再生效。 */
function resolveIceFollowUps(gb) {
  var events = [];
  (gb.units || []).forEach(function (u) {
    var pend = u._iceFollowUp;
    if (!pend) return;
    u._iceFollowUp = null;
    var t = gb.units.find(function (x) { return x.id === pend.targetId; });
    if (!t || t.hp <= 0) return;
    var dmg = Math.max(1, pend.dmg);
    t.hp = Math.max(0, t.hp - dmg);
    var ev = { msg: '❄️ ' + u.name + ' 冰魄余威 → ' + t.name + ' ' + dmg + ' 魂伤害（无视魂防，不占用行动）', targetId: t.id, type: 'damage' };
    events.push(ev);
    gb.events.push(ev);
    gb.log.push({ turn: gb.turn, unit: u.name, events: [ev] });
  });
  return events;
}

/* 单步执行：一次只行动一个单位（用于逐个行动动画，速度优先级可见）
   返回 { unit: 行动单位, events, done, winner, queueIndex, queue } */
function groupBattleStep(gb) {
  if (gb.done) return { done: true };
  _setBattleRng(gb);   // v2.1.27：让技能/AI/场地里的随机也走本场种子
  // 初始化队列（跨步保存）
  if (!gb._stepQueue || gb._stepQueue.length === 0) {
    // 开战钩子（威吓等天赋）
    if (gb.turn === 0) dispatchBattleStartTalents(gb);
    // 开战钩子（金身）
    if (gb.turn === 0 && typeof playerSkillBattleStart === 'function') {
      var p0 = gb.allies.find(function(u){ return u._playerSkills; });
      if (p0) {
        var evs0 = playerSkillBattleStart(gb, p0);
        evs0.forEach(function(e){ gb.events.push(e); gb.log.push({turn:0, unit:p0.name, events:[e]}); });
      }
    }
    gb.turn++;
    // v2.1.15：建队列前先统一重算属性修正，否则「减速」影响不到出手顺序
    refreshAllStatMods(gb.units);
    gb._stepQueue = buildActionQueue(gb);
    gb._stepIdx = 0;
    /* v2.1.33：冰魄光束第二段 —— 设计 §1.3-6 与 OQ-12 裁决「下回合**战斗开始时**触发，不占用行动」。
       此前只结算了施放当回合那一段（实际输出只有设计的一半，
       与 v2.1.24 修的「无影拳 5 连击只打 1 次」同类）。放在回合切换处，故不占任何单位的行动。 */
    resolveIceFollowUps(gb);
    // v2.1.13 场地：回合开始结算（此前只接线了 onTurnEnd，开场类场地不生效）
    if (gb.terrain && gb.terrain.onTurnStart) {
      var ts2 = gb.terrain.onTurnStart(gb);
      if (ts2 && ts2.events) { gb.events = gb.events.concat(ts2.events); logTerrainEvents(gb, ts2.events); }
    }
  }
  // 跳过死亡单位
  while (gb._stepIdx < gb._stepQueue.length && gb._stepQueue[gb._stepIdx].hp <= 0) gb._stepIdx++;
  if (gb._stepIdx >= gb._stepQueue.length) {
    // 本回合结束：场地结算 + 重置队列
    if (gb.terrain && gb.terrain.onTurnEnd) {
      var te = gb.terrain.onTurnEnd(gb);
      if (te && te.events) { gb.events = gb.events.concat(te.events); logTerrainEvents(gb, te.events); }
    }
    gb._stepQueue = null; gb._stepIdx = 0;
    // 回合末检查
    var alliesAlive2 = gb.allies.some(function (a) { return a.hp > 0; });
    var enemiesAlive2 = gb.enemies.some(function (e) { return e.hp > 0; });
    if (!alliesAlive2) { gb.done = true; gb.winner = 'enemy'; }
    if (!enemiesAlive2) { gb.done = true; gb.winner = 'ally'; }
    return { done: gb.done, winner: gb.winner, turnEnd: true };
  }
  var actor = gb._stepQueue[gb._stepIdx];
  gb._stepIdx++;
  /* v2.2.9 金身护盾破盾反伤：行动前记一次护盾现值（行动后对比即可判定「谁把谁的盾打碎了」） */
  if (typeof shieldPreSnapshot === 'function') shieldPreSnapshot(gb);
  var evts = groupUnitTurn(gb, actor);
  if (gb.done) _BATTLE_RNG = null;   // v2.1.27：本场结束，别污染下一场的建场阶段
  // v2.1.13 天赋「疾影」：本回合额外行动 1 次
  var exRes = talentDispatch(actor, 'onAfterAction', { turn: gb.turn });
  var wantExtra = false;
  exRes.mutations.forEach(function (m) { if (m.key === 'extraAction') wantExtra = true; });
  exRes.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  if (wantExtra && !gb.done && actor.hp > 0
      && (actor.side === 'ally' ? gb.enemies : gb.allies).some(function (u) { return u.hp > 0; })) {
    evts = evts.concat(groupUnitTurn(gb, actor));
  }
  /* v2.2.9 金身护盾破盾反伤：本次行动是否打碎了带盾队友的护盾（此刻 actor = 破盾者）。
     放在启风之前：反伤可能直接打死敌人，后续钩子自然跳过。 */
  if (!gb.done && typeof shieldReflectAfter === 'function') {
    var sr = shieldReflectAfter(gb, actor);
    if (sr && sr.length) evts = evts.concat(sr);
  }
  /* v2.2.5 启风（§1.3 效果②）：我方持「全场最快者」时，该角色每回合额外一次普通攻击。
     挂在行动之后、与疾影的 extraAction 同一位置；每个**回合**只触发一次（gb._qifengTurn 守卫）。 */
  if (!gb.done && actor.hp > 0 && typeof qifengExtraAttack === 'function') {
    var qe = qifengExtraAttack(gb, actor);
    if (qe && qe.length) evts = evts.concat(qe);
  }
  gb.events = gb.events.concat(evts);
  gb.log.push({ turn: gb.turn, unit: actor.name, events: evts });
  // 胜负检查
  var alliesAlive = gb.allies.some(function (a) { return a.hp > 0; });
  var enemiesAlive = gb.enemies.some(function (e) { return e.hp > 0; });
  if (!alliesAlive) { gb.done = true; gb.winner = 'enemy'; }
  if (!enemiesAlive) { gb.done = true; gb.winner = 'ally'; }
  return { unit: actor, events: evts, done: gb.done, winner: gb.winner, queueIndex: gb._stepIdx, queue: gb._stepQueue };
}

/* 跑到结束（测试用） */
function runGroupBattle(gb, maxTurns) {
  var guard = 0;
  while (!gb.done && guard++ < (maxTurns || 200)) groupBattleTick(gb);
  return gb;
}

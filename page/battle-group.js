/* ============================================
   MyHealth — Group Battle Engine (M2b-4)
   多 Unit 行动队列战斗。独立于原 battleTick（单敌零回归）。
   行动队列：先按**先制度 priority 分档**降序（v2.4.7 起；v2.4.8 起判据 =「本回合**声明**要用
   先制技能」—— 预声明在准备阶段完成，见 predeclareActions），
   同档内按 effectiveSpeed 降序 + 稳定 tie-break（同速我方先手、同方按创建序）。
   v2.4.5：**每回合拆成四阶段**（准备 → 行动 → 判定 → 结束），见下方「四阶段」小节；
       两条推进路径（groupBattleTick / groupBattleStep）共用同一组阶段 helper。
   行动阶段（每单位）：天赋/状态 hook → 普攻或技能 → 状态施加；回合末结算统一归判定阶段。
   纯逻辑，无 DOM/store。
   ============================================ */

/* 状态中文名（日志用） */
var STATUS_NAMES = { sleep:'睡眠', poison:'中毒', freeze:'冰冻', flinch:'畏缩', wet:'潮湿', charging:'蓄力', possessed:'幽魂附身', doomed:'末日', armorbroken:'破甲', slow:'减速', souldown:'魂防降低', lastworded:'遗言诅咒', sleepy:'哈欠', weaken:'弱化', vigil:'警戒', haste:'疾风' };
function getStatusName(id){ return STATUS_NAMES[id] || id; }

/* 威吓削减幅度（v2.1.14 落地；v2.2.22 §5.1.7 改为**单位级**）：
   talent.js 在 `onBattleStart` 把区间取值（[10%, 50%]，随关卡/敌人级别）写进**被威吓单位**的
   `_intimidateDown` —— 本文件所有消费点传的就是那个被威吓的 `actor`，故直接读它。
   只有该字段缺失时（旧存档形状 / 未接线的第三入口）才回落到 talent.js 的全局兜底常量
   `INTIMIDATE_ATK_DOWN`（talent.js 在本文件之前加载；`typeof` 守卫防加载顺序意外变化）。 */
function intimidateAtkDown(actor) {
  if (actor && typeof actor._intimidateDown === 'number') return actor._intimidateDown;
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
      /* v2.4.8：把「本回合走到哪了」也存进快照 —— 队列（**按单位 id**，单位对象本身不可序列化）
         + 已推进到的下标 + 编排标记 + 回合级守卫。用途见 groupRestore / groupBattleStep 的 `_resume`：
         回滚到「回合进行中」的快照后，**续跑本回合剩余的队列**，而不是从头重跑准备阶段。 */
      queueIds: (gb._stepQueue || []).map(function (u) { return u && u.id; }),
      queueIdx: gb._stepIdx || 0,
      roundOpen: !!gb._roundOpen,
      declaredTurn: (gb._declaredTurn == null) ? null : gb._declaredTurn,
      qifengTurn: (gb._qifengTurn == null) ? null : gb._qifengTurn,
      units: (gb.units || []).map(_cloneUnit)
    };
  } catch (e) { console.warn('[group] 生成快照失败', e); return null; }
}

/* 回滚到快照。⚠️ _stepQueue / _stepIdx 必须重置，否则行动队列错乱
   v2.4.8：若快照是在「回合进行中」（_roundOpen 为真）拍的，重置之后把队列位置交给
   `gb._resume`（**单位 id + 下标**，不是活的单位引用），由下一次 groupBattleStep 还原。
   为什么要这样：不还原就会**从头重跑本回合的准备阶段**，丢掉「本回合已经行动过谁 / 各单位
   准备阶段声明的行动 / 回合级守卫」，于是「回滚后重跑 == 首次结果」在多数种子上并不成立
   （scripts/test-group-determinism 的终点一致性断言会红）。 */
function groupRestore(gb, snap) {
  if (!gb || !snap || !Array.isArray(snap.units)) return { ok: false, reason: '快照无效' };
  try {
    gb.turn = snap.turn; gb.done = !!snap.done; gb.winner = snap.winner || null;
    /* v2.4.5：快照不含 phase，回滚后按「已分胜负」重建阶段，维持 checkGroupWin 的同一契约
       （done ⟹ 结束；未分胜负则回到准备，下一步 step/tick 会正常从准备阶段重开本回合）。 */
    gb.phase = gb.done ? GB_PHASES[3] : GB_PHASES[0];
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
    /* v2.4.5：_roundOpen 必须一起重置 —— 它与 _stepQueue 是同一件事的两个面
       （队列为空 = 准备阶段待跑），否则回滚后下一次 step 会跳过准备阶段、直接按旧队列跑。 */
    gb._roundOpen = false;
    /* v2.4.8：回合级守卫与「本回合的位置」一并还原。`_stepQueue` 仍然留空
       （快照/回滚的既有契约：回滚后不得残留队列引用），位置信息走 `_resume`。 */
    gb._declaredTurn = (snap.declaredTurn == null) ? null : snap.declaredTurn;
    gb._qifengTurn = (snap.qifengTurn == null) ? null : snap.qifengTurn;
    gb._resume = (snap.roundOpen && snap.queueIds && snap.queueIds.length)
      ? { ids: snap.queueIds.slice(), idx: snap.queueIdx || 0 }
      : null;
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
    /* v2.4.5：当前阶段（GB_PHASES 之一）。建场时先落在「准备」——
       runPhasePrepare 每次进入阶段都会重写它，两条推进路径共用。 */
    phase: GB_PHASES[0],
    _roundOpen: false,   // v2.4.5：本回合的准备阶段是否已跑过（step 路径跨调用保存）
    events: [],
    log: [],
    /* v2.1.27：给了 seed 就用可播种 RNG（可复现 / 可回退）；都没给才退回 Math.random */
    rng: opts.rng || (opts.seed != null ? makeSeededRng(opts.seed) : Math.random),
    terrain: opts.terrain || null
  };
}

/* 计算单位有效速度（含状态修正）。
   ⚠️ v2.4.7：`skill` 这个先制度参数**已不再是出手队列的排序依据** ——
   先制度改由 unitPriorityRank 作为**独立分档**参与排序（见下，依据「先制度技能不受速度反转影响」）。
   本参数保留只为不破坏既有调用点/测试的签名（现全部传 null），`priority × 50` 分支实际不可达。 */
function unitInitiative(u, skill) {
  var spd = effectiveSpeed(u);
  if (skill && SKILLS[skill] && SKILLS[skill].priority) spd += SKILLS[skill].priority * 50;
  if (u._taunting) spd *= 2;   // 嘲讽：速度×200%
  return spd;
}

/* v2.4.7（§8.5-1）：先制度（priority）真正进出手队列。
   修前事实：`buildActionQueue` 调 `unitInitiative(u, null)` —— 第二个实参恒为 null，
   于是 `unitInitiative` 里 `priority × 50` 的分支永不命中；priority 只被 AI 选技评分读到
   （ai.js），而技能详情 UI 写「出手队列中优先行动」（game-render.js）→「写了不生效」。

   依据 doc/2.0 敌群设计.md：
     · 先制度写在**技能**上（击掌奇袭 / 冰冻三尺 / 幽魂附身 = 「先制度 +1」）；
     · 场地「反转场地」写「全场变为速度最低最先行动（**先制度技能不受影响**）」
       —— 说明先制是与速度**正交**的一档，不是速度加成（故不再沿用 `+priority×50` 的写法）。

   不变式（本实现的口径）：
     ① 先制度高的单位**先于所有先制度更低的单位**出手（含全部非先制单位）；
     ② 同一先制度档内仍按 `unitInitiative` 降序（有效速度 + 嘲讽 ×2），
        既有 tie-break 一字未动（同速我方先手、同方按 gb.units 创建序）；
     ③ 判据 = 「该单位本回合**可用**的先制技能」（`usableSkills` 口径：未冷却、未附身）。
        队列在准备阶段建立、选技在行动阶段，静态队列无法预知当回合选技，
        故用「持有可用的先制技能」近似「本回合会先制出手」；冷却中的技能不算可用 ——
        否则等于给一个根本放不出来的技能先手权。
     ④ 本函数**不掷骰**（不消耗 gb.rng），同种子结果必须可复现（test-group-determinism）。
     ⚠️ 玩家技能表（skills.js）目前没有 `priority` 字段，故这里只扫 `unit.skills`（敌群技能）；
        将来给玩家技能加先制度时，此处要一并接上。 */
/* 先制度分档（v2.4.8 起有**两种口径**，见下）—— 本函数不掷骰、不消耗 gb.rng。
   v2.4.7 口径（held，兜底）：持有**可用**的先制技能即进先制档。
   v2.4.8 口径（declared，真实战斗）：**本回合真的声明了先制技能**才进先制档。
   为什么保留两种：出手队列在**准备阶段**建立、选技在**行动阶段**，
   「声明」是在 v2.4.8 才加进来的（见 predeclareActions）；而 scripts/test-engine-gaps.js
   等既有断言直接 `buildActionQueue(gb)`（不做准备阶段、没有声明）——
   那些调用点天然拿不到声明，只能按 v2.4.7 的 held 口径解释，故保留为**兜底**。
   判据：`gb._declaredTurn === gb.turn`（本回合做过预声明）→ 只看声明；
   否则回落到 held。真实战斗两条推进路径都在准备阶段做了预声明，故线上恒走 declared。 */
function priorityRankOfSkill(skillId) {
  if (typeof SKILLS === 'undefined' || !skillId) return 0;
  var d = SKILLS[skillId];
  return (d && d.priority) ? d.priority : 0;
}
function unitPriorityRank(u, gb) {
  if (!u || typeof SKILLS === 'undefined') return 0;   // 未加载技能表的最小沙箱：无先制可言
  /* ① v2.4.8：本回合已预声明 → 只有「声明要用的技能」算先制。
      声明失效（技能进了冷却 / 声明者被禁技）时这里返回 0：
      队列已经建好，它这一档的先手权本来就该在「声明那一刻」定 ——
      行动阶段发现失效会当场重选（见 takeDeclaredAction），重选**不重排队列**（口径见函数注释）。 */
  if (gb && gb._declaredTurn === gb.turn) {
    var dec = (u._declaredTurn === gb.turn) ? u._declared : null;
    return dec ? priorityRankOfSkill(dec.skillId) : 0;
  }
  /* ② 兜底（v2.4.7 held 口径）：未做预声明的直接调用方（单测 / 调试脚本自建队列） */
  var ids = (typeof usableSkills === 'function') ? usableSkills(u) : (u.skills || []);
  var rank = 0;
  for (var i = 0; i < ids.length; i++) {
    var d = SKILLS[ids[i]];
    if (d && d.priority > rank) rank = d.priority;
  }
  return rank;
}

/* ============================================================
   v2.4.8（作者裁定）：先制度 = 「**本回合真用了先制技能**才先手」（架构级）

   修前（v2.4.7）：按「**持有可用先制技能**即进先制档」实现 —— 因为出手队列在准备阶段建立、
   选技在行动阶段，静态队列预知不了当回合选什么技能。
   本版把「本回合要用什么」**提前到准备阶段预声明**：只有真的声明了先制技能的单位才进先制档。

   · **复用同一个 AI 选技函数**：声明直接调 `aiDecide()`（= aiPickSkill + aiPickTarget），
     **没有另写一套评分**。改动只是「何时决定」从行动阶段提前到准备阶段。
   · 只对**敌方**单位声明：先制度目前只写在敌群技能上（`page/skills.js` 玩家技能表没有
     `priority` 字段），且我方行动走 `playerAttackSkillPick` / `pickSkill` 而不是 AI ——
     给我方也声明会改变我方的行动选择（越权改动），故不做。
   · 只对**持有可用先制技能**的单位声明：没有先制技能的单位分档恒为 0，声明对队列毫无影响，
     跳过它才能把 `gb.rng` 的消耗面收窄到「本来就会被先制度影响的那批单位」。
   · **失效回退**：声明的技能/目标在行动阶段可能已经不可用（技能进冷却、目标阵亡、
     声明者被禁技等）→ 当场用同一个 `aiDecide` 重选并继续（见 takeDeclaredAction），
     不卡死、不跳过整回合。
   · **不额外消耗随机数**：声明把「本来在行动阶段会掷的那几次」提前到准备阶段掷，
     总次数在「声明有效」时与修前**相同**；只有声明失效时会多掷一次（多出来的那一次 = 回退的代价）。
     声明不改变出手顺序以外的任何公式；`gb.rng` 的实际消耗次数在报告里逐条给出。
   ============================================================ */

/* 准备阶段：为「持有可用先制技能」的敌方单位预声明本回合的行动。
   必须在**准备阶段的回合开始类效果之后**、`refreshAllStatMods` + `buildActionQueue` **之前**调用
   （声明的技能要参与分档排序）。 */
function predeclareActions(gb) {
  if (!gb) return;
  /* 没有 AI 选择器（最小沙箱）→ 不做声明，`gb._declaredTurn` 保持为空，
     全队列自动回落到 v2.4.7 的 held 口径（行为与修前一致）。 */
  if (typeof aiDecide !== 'function') return;
  var turn = gb.turn;
  (gb.units || []).forEach(function (u) {
    if (!u) return;
    /* 幂等：本回合已经声明过就不再声明（否则同回合重复调用准备阶段会多掷一次骰）。 */
    if (u._declaredTurn === turn) return;
    /* 清掉**上一回合**的残留声明：单位阵亡 / 被跳过行动时，旧声明不该一直挂着。 */
    u._declared = null; u._declaredTurn = null; u._declaredUsed = null; u._declUnused = false;
    if (u.hp <= 0) return;
    if (u.side !== 'enemy') return;               // 我方不声明（见上文）
    if (unitPriorityRank(u, gb) <= 0) return;     // 没有可用先制技能 → 分档无关，不掷骰
    var d = aiDecide(gb, u);
    if (!d) return;
    /* ⚠️ 声明里**只存技能 id 与目标 id**，不存活的单位引用 ——
       单位上的字段会进 groupSnapshot 的 JSON 克隆，存引用会在回滚后变成「脱离战斗的副本」
       （AI 会去打一个影子单位），也会破坏「回滚后重跑 == 首次」这条不变式。 */
    u._declared = { skillId: d.skillId || null, targetIds: declaredTargetIds(d.target) };
    u._declaredTurn = turn;
    u._declaredUsed = null;
    /* `_declUnused` 只服务「声明了但一次都没用上」的统计（例如单位在行动前阵亡），
       便于报告如实给出「准备阶段看到的状态」与「行动阶段实际状态」的差。 */
    u._declUnused = true;
  });
  gb._declaredTurn = turn;
}

/* 声明的目标 → id 列表（'all' 类技能的目标是单位数组，单体是单个单位，可能为 null） */
function declaredTargetIds(t) {
  if (!t) return [];
  if (Object.prototype.toString.call(t) === '[object Array]') {
    return t.filter(function (x) { return x && x.id; }).map(function (x) { return x.id; });
  }
  return t.id ? [t.id] : [];
}
/* id 列表 → 当前还挂在场上（不管死活）的单位，顺序与 id 列表一致 */
function declaredTargets(gb, ids) {
  var out = [];
  (ids || []).forEach(function (id) {
    var u = (gb.units || []).find(function (x) { return x.id === id; });
    if (u) out.push(u);
  });
  return out;
}

/* 行动阶段：取出本回合的有效声明。
   失效判据（任一命中 → 返回 null，调用方当场用 aiDecide 重选）：
     ① 没有本回合的声明；
     ② 声明要用的技能已不在 `usableSkills`（冷却中 / 被幽魂附身禁技 / 已被吞掉）；
     ③ 声明的目标已阵亡（目标 id 全部解析不到存活单位 —— `all` 类目标要求至少一个还活着）；
     ④ 本回合已经消费过一次声明（疾影的额外行动**不重复使用**同一声明 ——
        否则第二次会绕过技能冷却，等于凭空多放一次技能）。
   注意：声明者已阵亡的情形不会走到这里 —— 行动阶段根本不会给它行动机会
   （runPhaseAction / groupBattleStep 都先跳过 hp<=0 的单位）。 */
function declaredActionValid(gb, actor, d) {
  if (!d) return false;
  var usable = (typeof usableSkills === 'function') ? usableSkills(actor) : (actor.skills || []);
  if (d.skillId && usable.indexOf(d.skillId) < 0) return false;
  var ids = d.targetIds || [];
  if (ids.length) {
    var alive = declaredTargets(gb, ids).filter(function (u) { return u.hp > 0; });
    if (!alive.length) return false;
  }
  return true;
}
function takeDeclaredAction(gb, actor) {
  var d = null;
  if (actor && actor._declaredTurn === gb.turn && actor._declared) d = actor._declared;
  if (d && actor._declaredUsed !== gb.turn && declaredActionValid(gb, actor, d)) {
    actor._declaredUsed = gb.turn;   // 一次行动消费一次（额外行动会重选）
    actor._declUnused = false;
    var alive = declaredTargets(gb, d.targetIds).filter(function (u) { return u.hp > 0; });
    return {
      skillId: d.skillId,
      target: alive.length > 1 ? alive : (alive.length === 1 ? alive[0] : null),
      skillDef: d.skillId ? ((typeof SKILLS !== 'undefined' && SKILLS[d.skillId]) || null) : null
    };
  }
  return aiDecide(gb, actor);        // 失效 / 二次行动 → 当场重选（复用同一个 AI 函数）
}

/* 构建行动队列：先按**先制度分档**降序（v2.4.7），再按 initiative 降序，
   稳定 tie-break（同速我方先手，同方按创建序） */
function buildActionQueue(gb) {
  var queue = gb.units.filter(function (u) { return u.hp > 0; });
  queue.sort(function (a, b) {
    var pa = unitPriorityRank(a, gb), pb = unitPriorityRank(b, gb);
    if (pa !== pb) return pb - pa;   // v2.4.7：先制档优先于速度（不变式 ①）
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
  /* 🔴 v2.4.3 修复（真 bug，非设计）：候选名单必须按**施法者阵营**取，不能写死 gb.allies。
     此前 `ally1` / `ally2` 两个分支直接用「玩家方」→ 敌方施放「治愈 / 强攻 / 净化」时
     目标 100% 落到我方（实测每个技能 40/40 次全部命中 ally 侧），等于**敌方辅助技能长期在帮玩家**
     （敌人从没给自己奶过一口）。设计文档《2.0 敌群设计》第 160~171 行明确写这三个技能作用于
     「我方」＝**施法者自己一方**：「解除我方场上 1 名……负面状态」/「使我方随机 1 名角色恢复生命值」/
     「使我方除自身外一名角色攻击提升」。
     ⚠️ 本文件另外 27 处阵营判断本来就是正确的 `actor.side === 'ally' ? gb.enemies : gb.allies` 写法
        （见 70 / 117 / 238 / 372 / 578 / 791 / 834 / 850 / 951 / 1062 / 1083 / 1130 / 1131 / 1152 /
         1177 / 1183 / 1184 / 1227 / 1258 / 1259 / 1276 / 1294 / 1295 行）—— 修的是**单点缺失**，
        不要顺手改写别处。 */
  var mates = (actor.side === 'ally' ? gb.allies : gb.enemies).filter(function (u) { return u.hp > 0; });
  var foes = (actor.side === 'ally' ? gb.enemies : gb.allies).filter(function (u) { return u.hp > 0; });

  if (target === 'self') return [actor];
  if (target === 'all') {
    // 嘲讽者被单独挑出，其余全体
    var taunter = foes.find(function (u) { return u._taunting && u.hp > 0; });
    if (taunter && target === 'all') {
      // 全体技能仍打全体，但嘲讽者额外承伤由 battle 处理
    }
    return foes;
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
    var healTargets = mates.filter(function (u) { return u.id !== actor.id; });
    if (!healTargets.length) healTargets = mates;
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
       不足 2 名旁观者时退回含自身的全体友方。v2.4.3：候选改为 `mates`（施法者自己一方）。 */
    var pool2 = mates.filter(function (u) { return u.id !== actor.id; });
    if (pool2.length < 2) pool2 = mates;
    return drawRandom(pool2, 2);
  }
  if (target === 'enemy2' || target === 'enemy12') {
    var n = (target === 'enemy2') ? 2 : (1 + (gb.rng() < 0.5 ? 1 : 0));
    return drawRandom(foes, n);
  }
  if (target === 'enemy1') {
    return [foes[Math.floor(gb.rng() * foes.length)]];
  }
  // random1：嘲讽优先
  var pool = foes;
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
  /* WP-G 角色等级：lv1000/1100（玩家）· lv1200/1300（宠物）的「造成伤害 +5% / 受到伤害 −5%」，
     是**百分比战斗修正**（非基础属性），与普攻/技能同一入口结算。无字段 = 原值。
     ⚠️ 口径（作者裁决）：等级效果「全部是基础属性」=「属性增加类效果都加在基础属性上」，
        **不排斥**这 4 档百分比效果 → 都实装是对的，勿删（详见 level-system.js 的口径澄清）。 */
  if (typeof levelDamageAdjust === 'function') dmg = levelDamageAdjust(actor, target, dmg);
  /* v2.2.5 启风：额外普通攻击按系数缩放（**只作用在 base 上**，其后利刃/暴击/格挡等
     常规修正照旧生效 —— 语义就是「一次 80% 伤害的普通攻击」）。不传 = 1，行为与旧版完全一致。 */
  if (dmgMult && dmgMult !== 1) dmg = Math.max(1, Math.floor(dmg * dmgMult));
  /* v2.1.14 威吓落地：talent.js 的 onBattleStart 只写了 target._intimidated = true，
     全项目没有任何地方读这个标记（等于威吓从未真正生效）。这里在伤害结算前统一削减。
     v2.2.22：幅度读**单位级** `_intimidateDown`（见 intimidateAtkDown 的说明），兜底才是全局常量。 */
  if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown(actor))));
  // 天赋 hook: 利刃加成 / 多目标惩罚
  var td = talentDispatch(actor, 'onDamage', { isPlayerAttack: true, amount: dmg, isPhysical: true, attacker: actor, target: target });
  td.mutations.forEach(function (m) {
    if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value));
    if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
    if (m.key === 'dmgDealtHalf') dmg = Math.floor(dmg / 2);
  });
  /* v2.4.7（§8.5-13 / §8.6「末日普攻减半口径」）：**攻击方**侧的状态钩子派发。
     末日「普通攻击造成伤害减半」的产出端是**状态**钩子（status-defs.js 的 doomed.onDamage），
     而状态钩子此前只在「该单位作为**受击方**」的通道被派发（下面的 td2 / sd 与技能通道）——
     攻击方通道只派发天赋/词条，于是这条 mutation **没有任何生产路径**（写了不生效）。
     这里补上攻击方派发，并且**只消费 `dmgDealtHalf`**：
       · 其余同名 mutation（charging 的 dmgTakenBoost、wideguard/vigil 的 dmgTakenReduce…）
         语义都属于**受击方**，在攻击方通道消费会把「我受到的修正」错当成「我造成的修正」；
       · 事件一律丢弃 —— 这是「我方出手」，不是「我方受击」。
     ⚠️ 副作用边界：status-defs 里唯一带**状态变更**副作用的 onDamage 是 freeze（受击解冻）。
        冻结单位在行动阶段必然 skip（onBeforeAction → skipAction），走不到普攻；
        即便如此仍在 freeze 的钩子处加了 `isPlayerAttack` 守卫，杜绝「自己把自己解冻」。 */
  var asd = dispatch(actor, 'onDamage', { isPlayerAttack: true, amount: dmg, isPhysical: true, isSkill: false, attacker: actor, target: target });
  asd.mutations.forEach(function (m) { if (m.key === 'dmgDealtHalf') dmg = Math.floor(dmg / 2); });
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
    /* v2.4.7（§8.5-2）：**懒惰**的受击减伤 —— 放弃行动的回合自身受到伤害降低。
       生产端 talent.js 的 lazy.onDamage（仅在受击方产出），此前受击方通道不消费该键 → 从未生效。
       与 dmgTakenReduce 同一口径（×(1 − v)），多种来源叠加时各自连乘。 */
    if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
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
    soulTd.mutations.forEach(function (m) {
      if (m.key === 'soulDmgReduce') sDmg = Math.floor(sDmg * (1 - m.value));
      /* v2.4.7（§8.5-2）：懒惰的受击减伤对**普攻附带的魂伤**这一分量同样生效 ——
         一次普攻的物理分量与魂伤分量是同一击的两个结算点，减伤口径必须一致。 */
      if (m.key === 'dmgReduce') sDmg = Math.floor(sDmg * (1 - m.value));
    });
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
          /* WP-G 角色等级：与普攻同源的百分比修正（见 normalAttack 处注释） */
          if (typeof levelDamageAdjust === 'function') dmg = levelDamageAdjust(actor, t, dmg);
          // v2.1.14 威吓：被威吓者的技能伤害同样削减（此前只标记不生效）
          // v2.2.22：与普攻同一口径 —— 读单位级 `_intimidateDown`
          if (actor._intimidated) dmg = Math.max(1, Math.floor(dmg * (1 - intimidateAtkDown(actor))));
          td.mutations.forEach(function (m) { if (m.key === 'dmgBoost') dmg = Math.floor(dmg * (1 + m.value)); });
          // v2.1.13：目标侧减伤词条（伤害减免 / 抗扩散 / 抗技法）。
          // 此前技能伤害只派发攻击方，导致减伤类词条对技能完全无效。
          var tdg = talentDispatch(t, 'onDamage', { isPlayerAttack: false, amount: dmg, isPhysical: h.dmgType === 'physical', attacker: actor, target: t, isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          /* v2.1.15：受击方状态钩子（广域防御减伤 / 冰冻·睡眠的受击解除） */
          var sdg = dispatch(t, 'onDamage', { attacker: actor, amount: dmg, isPhysical: h.dmgType === 'physical', isSkill: true, isAoe: targets.length > 1, fromPlayer: actor.side === 'ally' });
          tdg.mutations = tdg.mutations.concat(sdg.mutations);
          sdg.events.forEach(function (e) { if (e && e.msg) events.push({ msg: e.msg, targetId: t.id, type: e.type }); });
          tdg.mutations.forEach(function (m) {
            if (m.key === 'dmgTakenReduce') dmg = Math.floor(dmg * (1 - m.value));
            /* v2.4.7（§8.5-2）：懒惰「放弃行动回合自身受到伤害降低」对**技能伤害**同样生效 ——
               生产端 lazy.onDamage 只看「本单位是否受击 / 本回合是否放弃行动」，不区分伤害通道。 */
            if (m.key === 'dmgReduce') dmg = Math.floor(dmg * (1 - m.value));
          });
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

/* ============================================================
   v2.4.5：每回合拆成四阶段（实现依据：doc/plans/战斗阶段化-技能与天赋清单.md §10 作者裁定记录）

   **冻结契约**（另一子代理的显示层依赖，改名即破坏）：
     · window.GB_PHASES = ['准备','行动','判定','结束']（顺序固定）
     · gb.phase = 当前阶段（上面四个中文字面量之一）
     · **每一次 gb.log.push({...}) 的条目都带 `phase: gb.phase`** —— 统一走 logPhase()，
       禁止在别处裸 push（契约要求「每个条目」都带，漏一条显示层就退化成不分组的兜底渲染）。
     · **gb.done 为真 ⟹ gb.phase = '结束'**（详见 checkGroupWin）——
       step 路径的驱动方在 done 之后就不会再调 groupBattleStep，没有这一步就会停在「行动」。
   其余字段（_roundOpen / _stepQueue / _prepareQueue …）可自由新增。

   职责划分（只在**时序**上搬运，数值/概率/公式一字未改）：
     ① 准备（每回合一次，在行动队列建立之前）：开战钩子 / 冰魄余威 / 场地 onTurnStart /
        每回合一次的回合开始类效果（灵感涌动 + 玩家气力恢复·气势如虹·瞩目①·启风①）/
        诅咒类状态的目标结算（哈欠·末日·遗言·幻影之瞳）/ 慢启动·懒惰的「本回合能否行动」/
        **v2.4.8：敌方「本回合用什么」的预声明（predeclareActions —— 先制度分档的依据）**，
       最后才 refreshAllStatMods + buildActionQueue。
     ② 行动（按队列逐个单位）：onBeforeAction（非准备类）、技能/普攻、伤害/治疗/护盾、状态施加、
        onAfterAction、疾影额外行动、破盾反伤、启风②、蓄力释放（裁定 §10-1：留在行动阶段）；
        技能选择优先取准备阶段的声明，**声明失效则当场重选**（takeDeclaredAction）。
     ③ 判定（每回合一次，队列跑完之后）：状态 onTurnEnd（中毒·潮湿·睡眠回复）、
        天赋+词条 onTurnEnd（振翅·再生·灵感涌动收尾·战意高涨·铁壁·终末宣告）、
        玩家技能回合末（瞩目回复）、duration 递减与到期。
     ④ 结束（每回合一次）：场地 onTurnEnd、回合级守卫清理、胜负判定。

   v2.4.6：`groupUnitTurn` 恢复**单一语义** —— 它只是「行动阶段的单单位实现」，
   回合开始类效果归准备阶段、回合末结算归判定阶段。v2.4.5 曾以 `gb._roundOpen` 为判据留了一个
   「独立调用」兼容分支（单测/调试脚本直接把一次调用当作该单位的整个回合），同一函数因此有两种含义；
   该分支已删除，调用方改为**驱动同一套四阶段编排**（见各套件里的 unitActionTurn / unitFullTurn）。
   ============================================================ */
var GB_PHASES = ['准备', '行动', '判定', '结束'];
if (typeof window !== 'undefined') window.GB_PHASES = GB_PHASES;
if (typeof globalThis !== 'undefined') globalThis.GB_PHASES = GB_PHASES;

/* 天赋「准备阶段」分类表 —— **为什么必须逐条分类，不能把 onTurnStart / onBeforeAction 整体搬**：
   ① 天赋 onTurnStart 上除了 inspiration（灵感涌动：每回合一次的全局增益，必须在出手队列之前
      落地才影响得到本回合更慢出手的队友），还挂着：
        · vengeance（复仇）—— 读的是**该单位自己行动时**的血量快照来叠层，搬到准备阶段读到的
          血量不同，强度直接变（清单 §8.1-3）；
        · intimidate 的解除分支 —— 按**施加者自己行动时**的血量与回合计数判定（清单 §8.1-4）。
      两者都与「自己何时行动」绑定 → 留在原来的自然触发点（作者裁定 §10-3「纯被动随触发事件结算」）。
   ② 天赋 onBeforeAction 上除了 slowstart / lazy（真正的「回合开始」判定：前者只读回合号、
      后者是每回合一次的 25% 掷骰），还挂着冻结 / 畏缩 / 睡眠 / 附身等**反应式**控制：
      它们是本回合中途被施加、当场就该生效的（暴风雪 / 冰冻三尺 / 歌唱都在行动阶段落状态），
      若提前到准备阶段预判，「同一回合内新挂上的控制」会全部失效。
   故只有下面这张显式表里的条目进准备阶段，其余一律留在原来的自然触发点：
     · 状态侧的分类标记写在 status-defs.js 的 `phase:'prepare'`（sleepy / doomed / lastworded / confused）；
     · 天赋侧：inspiration 的标记写在 pet-codex.js 的 `phase:'prepare'`；
       slowstart / lazy 定义在 talent.js（不在本版写域，无法在定义上加标记）→ 只能在此用集中常量。
   ⚠️ 判定阶段对 `def.phase === 'prepare'` 的状态有一条 duration 例外，见 ageStatusesInJudge()。 */
var PREPARE_BEFORE_ACTION_TALENTS = ['slowstart', 'lazy'];

/* 进入某阶段 —— **唯一**写 gb.phase 的地方 */
function enterPhase(gb, phase) { gb.phase = phase; return phase; }

/* 落日志 —— **唯一**的 gb.log.push 入口（契约：每个条目都带 phase: gb.phase） */
function logPhase(gb, entry) {
  entry.phase = gb.phase || GB_PHASES[0];
  gb.log.push(entry);
  return entry;
}

/* 状态「阶段分类」派发：hook === 'onTurnStart' 时按 def.phase 分流，其余 hook 不分类
   （例如 doomed 的 onBeforeAction「技能禁用」必须留在行动阶段，只搬它的回合开始伤害）。
   phase='prepare' → 只派发带标记的；phase='action' → 只派发没带标记的。
   准备阶段的这次派发同时给实例打 `_prepFired`，供判定阶段的 duration 例外使用。 */
function dispatchStatusesPhase(unit, hook, ctx, phase) {
  var out = { skipAction: false, mutations: [], events: [] };
  var list = (unit && unit.statuses) || [];
  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    if (!st) continue;
    var def = (typeof STATUS_DEFS !== 'undefined') ? STATUS_DEFS[st.id] : null;
    if (!def || !def.hooks || !def.hooks[hook]) continue;
    var isPrepare = (def.phase === 'prepare');
    if (phase === 'prepare' ? !isPrepare : isPrepare) continue;
    /* 只在准备阶段打标记：意思是「本实例已经在准备阶段触发过」——
       只有触发过，判定阶段才会开始扣它的 duration（见 ageStatusesInJudge）。 */
    if (phase === 'prepare') st._prepFired = true;
    var r = def.hooks[hook](unit, st, ctx);
    if (!r) continue;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  }
  return out;
}

/* 天赋「阶段分类」派发（与 talentDispatch 同形，但只派发属于本阶段的天赋）。
   为什么需要它：talent.js 不在本次写域，无法在定义上加过滤参数；
   而整体搬运 onTurnStart / onBeforeAction 会改变多类效果（见上方分类表注释）。
   · 词条（affix.js 的 8 条）只用 onDamage / onTurnEnd / onAfterAction，与 onTurnStart /
     onBeforeAction 无关；为不改既有语义，仍原样并入**行动阶段**那一次派发。 */
function talentInPhase(id, hook, phase) {
  var t = (typeof TALENTS !== 'undefined') ? TALENTS[id] : null;
  var marked = !!(t && t.phase === 'prepare');
  if (hook === 'onBeforeAction') marked = PREPARE_BEFORE_ACTION_TALENTS.indexOf(id) >= 0;
  return (phase === 'prepare') ? marked : !marked;
}
function talentDispatchPhase(unit, hook, ctx, phase) {
  var out = { skipAction: false, mutations: [], events: [] };
  ((unit && unit._talents) || []).forEach(function (id) {
    var t = (typeof TALENTS !== 'undefined') ? TALENTS[id] : null;
    if (!t || !t.hooks || !t.hooks[hook]) return;
    if (!talentInPhase(id, hook, phase)) return;
    var r = t.hooks[hook](unit, ctx);
    if (!r) return;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  });
  if (phase !== 'prepare' && typeof affixDispatch === 'function') {
    var ar = affixDispatch(unit, hook, ctx);
    if (ar.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(ar.mutations);
    out.events = out.events.concat(ar.events);
  }
  return out;
}

/* 判定阶段的 duration 递减 —— ageStatuses 的**带阶段例外**版本。
   例外规则：`def.phase === 'prepare'` 的状态**在首次于准备阶段触发之前不递减**。
   为什么：这类状态是在**行动阶段**被挂上的（挂上时本回合的准备阶段已经过去），
   若在当回合的判定阶段就扣 1：
     · duration:1 的哈欠（sleepy）/ 迷惑（confused）会在「下回合准备阶段触发」之前被删掉，
       效果直接消失 —— 而作者裁定恰恰要求它们「下回合准备阶段触发」；
     · 末日 / 遗言的扣血次数也会随之变化（这正是实测 4 / 7 与作者预判 3 / 6 的差别来源，
       见报告：作者预判假设「duration 含发动当回合」，与本裁定对 duration:1 状态的要求互斥）。
   其余状态走的分支与 state-core.js 的 ageStatuses **逐字一致**（同样的到期文案与 onExpire），
   之所以在此保留一份带例外的实现：state-core.js 不在本版写域。 */
function ageStatusesInJudge(unit) {
  var events = [];
  if (!unit || !unit.statuses) return events;
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    var st = unit.statuses[i];
    if (!st) continue;
    var def = ((typeof STATUS_DEFS !== 'undefined') ? STATUS_DEFS[st.id] : null) || {};
    if (def.phase === 'prepare' && !st._prepFired) continue;
    st.duration = (st.duration == null ? 1 : st.duration) - 1;
    if (st.duration > 0) continue;
    if (def.hooks && def.hooks.onExpire) {
      var r = def.hooks.onExpire(unit, st);
      if (r && r.events) events = events.concat(r.events);
    }
    unit.statuses.splice(i, 1);
    events.push({
      type: 'expire', statusId: st.id, unitId: unit.id,
      msg: '⏳ ' + (unit.name || '单位') + ' 的【' + (def.name || st.id) + '】结束'
    });
  }
  return events;
}

/* 胜负判定（群战口径：每个单位行动后即时判）。与旧 step 路径一致：两边同时团灭时后者生效。
   v2.4.5：胜负一分出就顺手把阶段推进到「结束」——
   契约要求收尾时 gb.phase 停在最后一个合法阶段，而 step 路径在 gb.done 之后会**直接退出驱动循环**
   （调用方看到 done 就不再调 groupBattleStep），不会再有 finishRound 帮它补「结束」；
   不补这一句就会停在「行动」，UI/日志拿到一个与 gb.done 自相矛盾的阶段。
   ⚠️ 调用点必须仍在**落日志之后**（runPhaseAction / groupBattleStep 都是先 logPhase 再判胜负），
   否则本回合最后一条日志会被误标成「结束」。 */
function checkGroupWin(gb) {
  var alliesAlive = gb.allies.some(function (a) { return a.hp > 0; });
  var enemiesAlive = gb.enemies.some(function (e) { return e.hp > 0; });
  if (!alliesAlive) { gb.done = true; gb.winner = 'enemy'; }
  if (!enemiesAlive) { gb.done = true; gb.winner = 'ally'; }
  if (gb.done) enterPhase(gb, GB_PHASES[3]);
  return !!gb.done;
}

/* ---------- 阶段①：准备（每回合一次，在行动队列建立之前） ----------
   顺序即「先把本回合开始的效果落地，再算属性与队列」。
   ⚠️ refreshAllStatMods / buildActionQueue 必须放在最后：本节落下的加速/减速
      （启风①的疾风、气势如虹的攻击加成）要能影响本回合的出手顺序，否则等于没生效。 */
function runPhasePrepare(gb) {
  enterPhase(gb, '准备');
  /* v2.4.5：本回合的**四阶段编排**从这一刻开始、到 finishRound 收尾为止。
     v2.4.6：`gb._roundOpen` 现在只剩**编排标记**这一个用途 —— 它记录「本回合的准备阶段已经跑过」，
     供 groupBattleStep 区分「新回合的第一步（要先建队列）」与「同一回合的后续单步」。
     故两条推进路径都必须在这里把它打开。 */
  gb._roundOpen = true;
  /* 开战钩子：本函数每回合只跑一次，故 gb.turn === 0 等价于「每场一次」 */
  if (gb.turn === 0) {
    dispatchBattleStartTalents(gb);
    if (typeof playerSkillBattleStart === 'function') {
      var p0 = gb.allies.find(function (u) { return u._playerSkills; });
      if (p0) {
        var evs0 = playerSkillBattleStart(gb, p0);
        evs0.forEach(function (e) { gb.events.push(e); logPhase(gb, { turn: 0, unit: p0.name, events: [e] }); });
      }
    }
  }
  gb.turn++;
  var turn = gb.turn + 1;   // 既有约定：传给钩子的 turn = 实际回合号 + 1（首回合传入 2）

  /* 冰魄余威：设计上就是「回合开始触发、不占用行动」（OQ-12），故落在准备阶段 */
  resolveIceFollowUps(gb);
  /* 场地：回合开始结算（放在冰魄之后 —— 与 v2.4.5 之前 step 路径的顺序一致）。
     v2.5.0：改走 terrain.js 的 **terrainTurnStart** —— 它除返回事件之外，还会用
     applyTerrainResult 真正落地 callback 返回的 `damage` / `statusApps`。
     旧实现直接调 `gb.terrain.onTurnStart(gb)` 且只吞 `events` →
     天气/场地的开场伤害与状态**被整包丢弃**（对谁都不生效，只剩日志）。
     因此天气被动从**开战第一个准备阶段**起就对敌我双方生效（钩子本身遍历 gb.units）；
     而每个钩子只在**本回合自己的时点**跑一次，不会把未来回合的伤害提前到开战瞬间结算。 */
  if (gb.terrain && gb.terrain.onTurnStart) {
    var ts3 = terrainTurnStart(gb);
    if (ts3 && ts3.length) { gb.events = gb.events.concat(ts3); logTerrainEvents(gb, ts3); }
  }

  (gb.units || []).forEach(function (u) {
    if (!u || u.hp <= 0) return;
    /* ① 每回合一次的「回合开始」类天赋效果（灵感涌动） */
    var evts = [];
    var auraCtx = {
      turn: turn,
      allyUnits: u.side === 'ally' ? gb.allies : gb.enemies,
      enemyUnits: u.side === 'ally' ? gb.enemies : gb.allies
    };
    var ts = talentDispatchPhase(u, 'onTurnStart', auraCtx, 'prepare');
    ts.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
    /* ② 玩家技能的「回合开始」部分（气力恢复 / 气势如虹 / 瞩目① / 启风①；宠物档气力恢复同此） */
    if (u.side === 'ally' && typeof playerSkillTurnStart === 'function') {
      var ps = playerSkillTurnStart(gb, u, turn);
      ps.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
    }
    if (evts.length) logPhase(gb, { turn: gb.turn, unit: u.name, events: evts });

    /* ③ 诅咒类状态的目标结算：哈欠(入睡判定) / 末日 / 遗言 + 迷惑三选一（幻影之瞳） */
    var cursed = [];
    var ss = dispatchStatusesPhase(u, 'onTurnStart', { turn: turn }, 'prepare');
    ss.events.forEach(function (e) { cursed.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });
    if (u.hp > 0 && hasStatus(u, 'confused')) {
      var cfEv = resolveConfusion(gb, u);
      u._confuseTurn = gb.turn;   // 行动阶段据此跳过「按自己的意志行动」
      /* 迷惑是一次性的：本回合即算「已触发」，好让判定阶段能正常把它清掉（否则会永久滞留） */
      (u.statuses || []).forEach(function (s) { if (s.id === 'confused') s._prepFired = true; });
      cfEv.forEach(function (e) { cursed.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
    }
    if (cursed.length) logPhase(gb, { turn: gb.turn, unit: u.name, events: cursed });

    /* ④ 慢启动 / 懒惰：「本回合能否行动」在准备阶段判定一次，行动阶段只消费结论 */
    var tb = talentDispatchPhase(u, 'onBeforeAction', { turn: turn, actualTurn: gb.turn }, 'prepare');
    u._prepSkipTurn = gb.turn;
    u._prepSkipReason = tb.skipAction ? skipReasonText(tb.events) : '';
  });

  /* v2.5.0（作者裁决）：**准备阶段结束时若任一方已全灭，立即结束本回合** ——
     不再建立行动队列，也不让残存方进入行动阶段。
     准备阶段能打死人的通道到这一行为止都跑完了：场地 onTurnStart / 诅咒类状态
     （末日·遗言）/ 开战钩子 / 玩家技能的回合开始部分。判据复用 checkGroupWin
     （与行动、结束阶段同一个函数）—— 双方**同时**灭队时它的既有次序
     （先「我方全灭 → enemy」、再「敌方全灭 → ally」）给出 winner='ally'，与本次裁决一致。 */
  if (checkGroupWin(gb)) return [];

  /* v2.4.8：**先制度 = 本回合真用了先制技能才先手** —— 在排队之前做「本回合用什么」的预声明。
     位置必须在 refreshAllStatMods / buildActionQueue **之前**（声明的技能要参与分档），
     且在回合开始类效果**之后**（声明要看到本回合已落地的属性/状态，决策质量才不退步）。 */
  predeclareActions(gb);

  /* 属性修正重算 + 行动队列（顺序说明见函数头注释） */
  refreshAllStatMods(gb.units);
  return buildActionQueue(gb);
}

/* ---------- 阶段②：行动（按行动队列逐个单位） ---------- */
/* 行动阶段：单个单位的「行动 + 行动后钩子」。
   两条推进路径（groupBattleTick / groupBattleStep）**共用本函数** —— v2.4.5 之前
   shieldPreSnapshot / shieldReflectAfter / qifengExtraAttack 三处钩子只有 step 路径有，
   tick 完全没有，同一场战斗走哪条路径结果不同（清单 §8.5-6）。 */
function runUnitActionStep(gb, actor) {
  /* v2.2.9 金身护盾破盾反伤：行动前记一次护盾现值（行动后对比即可判定「谁把谁的盾打碎了」） */
  if (typeof shieldPreSnapshot === 'function') shieldPreSnapshot(gb);
  var evts = groupUnitTurn(gb, actor);
  if (gb.done) _BATTLE_RNG = null;   // v2.1.27：本场结束，别污染下一场的建场阶段
  /* v2.1.13 词条「疾影」：本回合额外行动 1 次。
     v2.4.7：这是 onAfterAction 的**唯一**派发点（groupUnitTurn 里那次「只取 events」的内层派发已删除，
     它把 extra_act 的 `_extraCd = 3` 提前置上、导致外层必然冷却早退 → 实测只有 24.75%）。
     现在掷骰、置冷却、消费 mutation 都在这里一次完成；额外行动**不再**触发第二次派发（不连环叠加）。 */
  var exRes = talentDispatch(actor, 'onAfterAction', { turn: gb.turn });
  var wantExtra = false;
  exRes.mutations.forEach(function (m) { if (m.key === 'extraAction') wantExtra = true; });
  exRes.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  if (wantExtra && !gb.done && actor.hp > 0
      && (actor.side === 'ally' ? gb.enemies : gb.allies).some(function (u) { return u.hp > 0; })) {
    evts = evts.concat(groupUnitTurn(gb, actor));
  }
  /* v2.2.9 金身护盾破盾反伤：此刻的 actor 就是**刚刚出手的人** → 破盾者即他。放在启风之前。 */
  if (!gb.done && typeof shieldReflectAfter === 'function') {
    var sr = shieldReflectAfter(gb, actor);
    if (sr && sr.length) evts = evts.concat(sr);
  }
  /* v2.2.5 启风（§1.3 效果②）：我方持「全场最快者」时，该角色每回合额外一次普通攻击。
     每个**回合**只触发一次（gb._qifengTurn 守卫，由结束阶段清理）。 */
  if (!gb.done && actor.hp > 0 && typeof qifengExtraAttack === 'function') {
    var qe = qifengExtraAttack(gb, actor);
    if (qe && qe.length) evts = evts.concat(qe);
  }
  return evts;
}

function runPhaseAction(gb, queue) {
  enterPhase(gb, '行动');
  (queue || []).forEach(function (u) {
    if (gb.done) return;
    if (!u || u.hp <= 0) return;
    var evts = runUnitActionStep(gb, u);
    gb.events = gb.events.concat(evts);
    logPhase(gb, { turn: gb.turn, unit: u.name, events: evts });
    checkGroupWin(gb);
  });
}

/* ---------- 阶段③：判定（每回合一次，队列跑完之后） ----------
   搬过来的（v2.4.5 之前分散在**每个单位自己**的 onTurnEnd 里，battle-group.js:1093-1105）：
     · 玩家技能回合末（瞩目回复，旧顺序在天赋 onTurnEnd 之前）
     · 天赋 + 词条 onTurnEnd（振翅 / 再生 / 灵感涌动收尾 / 战意高涨 / 铁壁 / 终末宣告）
     · 状态 onTurnEnd（中毒 / 潮湿 / 睡眠回复）
     · duration 递减与到期（ageStatusesInJudge）
   逐条确认过的「依赖该单位自身状态」的效果（本阶段**逐单位**跑，上下文与旧实现逐字相同）：
     poison（unit.base.hp）/ wet（纯文案）/ sleep（st.data.healPct + unit.base）/ flutter（unit.base.spd）/
     regen（ctx.turn + unit.base.hp）/ inspiration 收尾（ctx.allyUnits）/ grow_atk·grow_def（unit.base）/
     doom_call（ctx.enemyUnits）/ spotlight（player._spotTauntTurn·_spotHits）/
     到期事件（onExpire：charging → _chargeReady 等）。
     （v2.4.8：extra_act 已**没有** onTurnEnd 钩子 —— 疾影口径改为「每回合 55%」，
       跨回合冷却连同它的递减点一并删除，故它不再出现在本阶段的依赖清单里。）
   刻意**不搬**的两项（仍在行动阶段 groupUnitTurn 末尾，因为它们与「该单位本回合是否真的行动了」绑定）：
     · tickSkillCooldowns —— 历史上「跳过行动」的单位不减冷却，附身暂停的判据也在那里；
     · _hitModTurns 倒计时（闪耀 / 打湿）。
   ⚠️ 胜负已分（gb.done）时不跑本阶段：避免在已定胜负的残局上继续掉血、改动结算面板的血量。 */

/* 单位级「回合末结算」—— 判定阶段的**唯一**实现（v2.4.5 之前它只存在于 groupUnitTurn 尾部；
   v2.4.6 起 groupUnitTurn 不再有「独立调用」分支，故本函数只有 runPhaseJudge 一个调用方）。
   duration 递减固定走 ageStatusesInJudge：它带「准备阶段状态尚未触发过就不递减」的例外，
   而准备阶段那一次派发一定在判定阶段之前跑过（同一回合、同一次编排），`_prepFired` 的语义成立。 */
function runUnitJudgeTail(gb, u, turn) {
  var evts = [];
  if (u.side === 'ally' && typeof playerSkillTurnEnd === 'function') {
    var pe = playerSkillTurnEnd(gb, u, turn);
    pe.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  }
  var te = talentDispatch(u, 'onTurnEnd', {
    turn: turn,
    allyUnits: u.side === 'ally' ? gb.allies : gb.enemies,
    enemyUnits: u.side === 'ally' ? gb.enemies : gb.allies
  });
  te.events.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });
  var se = dispatch(u, 'onTurnEnd', { turn: turn });
  se.events.forEach(function (e) { evts.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });
  var aged = ageStatusesInJudge(u);
  aged.forEach(function (e) { evts.push({ msg: e.msg, targetId: e.unitId, type: e.type, reason: e.reason }); });
  if (aged.length) syncStatusDerived(u);
  return evts;
}

function runPhaseJudge(gb) {
  var all = [];
  if (gb.done) return all;
  enterPhase(gb, '判定');
  var turn = gb.turn + 1;
  (gb.units || []).forEach(function (u) {
    if (!u || u.hp <= 0) return;   // 与旧行为一致：阵亡单位不参与回合末结算
    var evts = runUnitJudgeTail(gb, u, turn);
    evts.forEach(function (e) { all.push(e); });
    if (evts.length) logPhase(gb, { turn: gb.turn, unit: u.name, events: evts });
  });
  return all;
}

/* ---------- 阶段④：结束（每回合一次） ---------- */
function runPhaseEnd(gb) {
  enterPhase(gb, '结束');
  var evts = [];
  /* v2.5.0：改走 terrain.js 的 **terrainTurnEnd** —— 它先 applyTerrainResult
     （真正扣血 / 落 statusApps）再返回事件。旧实现直接调 `gb.terrain.onTurnEnd(gb)`
     并且只 log 事件：沙暴碎石 / 酷暑失血 / 雨天闪电**对任何人都不生效**，只有一行日志
     （与 test-terrain.js 直接调 helper 拿到的结论长期不一致）。
     ⚠️ 事件文案已由各场地 callback 自己带出（`受碎石伤害 N` 等），故只补「应用」这一步；
     顺序上先应用、再判胜负（见本函数末尾的 checkGroupWin），避免场地在回合末击杀
     最后一名敌人后仍停留在「未分胜负」。
     ⚠️ 每个回合只在这里调用一次（tick 走 finishRound、step 走队列跑完后的 finishRound），
     不存在 tick/step 双份应用。 */
  if (gb.terrain && gb.terrain.onTurnEnd) {
    var te = terrainTurnEnd(gb);
    if (te && te.length) {
      gb.events = gb.events.concat(te);
      logTerrainEvents(gb, te);
      evts = evts.concat(te);
    }
  }
  /* 回合级「每回合一次」守卫清理。
     ⚠️ _qifengTurn 必须在**行动阶段之后**才清（它管的就是行动阶段的启风②只触发一次）。 */
  gb._qifengTurn = null;
  (gb.units || []).forEach(function (u) {
    if (!u) return;
    u._prepSkipTurn = null; u._prepSkipReason = '';
    if (u._confuseTurn != null && u._confuseTurn <= gb.turn) u._confuseTurn = null;
  });
  /* 胜负判定：已经分出胜负时**不重算**（判定阶段虽已跳过，仍避免任何后续改动翻盘） */
  if (!gb.done) checkGroupWin(gb);
  return evts;
}

/* 回合收尾（判定 + 结束），两条路径共用。
   返回本回合「判定 + 结束」两个阶段产出的全部事件 —— step 路径的调用方（动画/单测）
   原本只能从各单位的行动步里拿事件，回合末（dot / 到期 / 天赋 onTurnEnd / 场地）
   产出的事件此前拿不到，只能去读 gb.log。 */
function finishRound(gb) {
  var judgeEvts = runPhaseJudge(gb) || [];
  var endEvts = runPhaseEnd(gb) || [];
  gb._roundOpen = false;
  gb._stepQueue = null;
  gb._stepIdx = 0;
  gb._resume = null;
  return { done: !!gb.done, winner: gb.winner || null, phase: gb.phase, events: judgeEvts.concat(endEvts) };
}

/* 单单位「行动阶段」实现（v2.4.6：**只有这一种语义**）。
   ⚠️ 本函数**只跑行动阶段**：回合开始类效果归准备阶段（runPhasePrepare）、
      回合末结算归判定阶段（runPhaseJudge）。v2.4.5 遗留的以 `gb._roundOpen` 为判据的兼容分支
      （把一次调用当作「一整个单位回合」）已删除 —— 它让同一个函数有两种含义，且会把 dot / duration
      递减按单位散落回行动阶段，与作者裁定 §10（状态结算统一在判定阶段）直接冲突。
   调用方：runUnitActionStep（groupBattleTick / groupBattleStep 两条编排路径共用）。
   单测/调试脚本要驱动「一个单位的一整个回合」时，请驱动同一套四阶段编排，不要再指望本函数兜底：
     · 只需行动 + 回合末结算 → runUnitActionStep(gb, actor) + runPhaseJudge(gb)
     · 还需要回合开始类效果 → 先 runPhasePrepare(gb)（或直接用 groupBattleStep 逐步推进） */
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

  /* 回合开始三处派发里，属于**准备阶段**的那几项已由 runPhasePrepare 落地（玩家技能的回合开始部分、
     带 phase:'prepare' 的诅咒类状态与天赋），这里只派发**留在行动阶段**的那些：
       · 天赋 onTurnStart（威吓解除 / 复仇 / 威压领域…；灵感涌动带 phase:'prepare' 已在准备阶段派发）；
       · 状态 onTurnStart（幽魂附身侵蚀 / 破甲提示…；哈欠·末日·遗言·幻影之瞳带 phase:'prepare'）。
     判据是「是否与该单位**何时行动**绑定」——威吓解除按施加者行动时的血量、附身侵蚀按目标自己
     的行动开始，搬去准备阶段都会读到不同的血量快照（作者裁定 §10-3「纯被动随触发事件结算」）。 */
  var ts = talentDispatchPhase(actor, 'onTurnStart', { turn: turn, enemyUnits: actor.side === 'ally' ? gb.enemies : gb.allies, allyUnits: actor.side === 'ally' ? gb.allies : gb.enemies }, 'action');
  ts.events.forEach(function (e) { events.push({ msg: e.msg, targetId: e.targetId, type: e.type }); });

  // 状态 onTurnStart（幽魂附身侵蚀 / 破甲提示 —— 诅咒类已上移准备阶段）
  var ss = dispatchStatusesPhase(actor, 'onTurnStart', { turn: turn }, 'action');
  ss.events.forEach(function (e) { events.push({ msg: e.msg, reason: e.reason, targetId: e.unitId, type: e.type }); });

  // 冰冻/畏缩/睡眠 → skipAction；慢启动/懒惰已在准备阶段判定（见 runPhasePrepare ④）
  /* v2.3.0（作者裁决）：另传 `actualTurn` = **实际回合号**（= gb.turn）。
     `turn` 这个局部值仍是 `gb.turn + 1`（既有约定，regen / 词条 / 玩家技能回合钩子都在用它，
     不动）；慢启动需要「设定 x 回合就真的 x 回合」，故单独给出真实回合号，见 talent.js 的 slowstart。 */
  var turnCtx = { turn: turn, actualTurn: gb.turn };
  var before = dispatch(actor, 'onBeforeAction', turnCtx);
  /* 慢启动/懒惰（天赋 onBeforeAction）的唯一派发点在**准备阶段**，结论存在 _prepSkipTurn；
     这里只消费结论，**不能**再派发一次（否则每回合同一个 25% 掷骰会被掷第二遍）。 */
  var prepSkip = (actor._prepSkipTurn === gb.turn) ? (actor._prepSkipReason || '') : '';
  if (prepSkip || before.skipAction) {
    // v2.1.14：原日志只有「XX 无法行动」，玩家看不出到底是冰冻、畏缩还是慢启动。
    // 现在把触发源的文案（冰冻/畏缩/睡眠/慢启动/懒惰…）拼进括号。准备阶段的结论优先（与旧口径一致：
    // 旧实现把天赋事件排在状态事件之前，故两者同时命中时展示的是天赋那边的原因）。
    var why = prepSkip || skipReasonText(before.events || []);
    events.push({ msg: '🚫 ' + (actor.name || '单位') + ' 无法行动' + (why ? '（' + why + '）' : ''), targetId: actor.id, type: 'skip' });
    /* v2.1.15：即使这回合没行动，状态 duration 也必须递减，否则冰冻/睡眠会永久锁死单位。
       v2.4.5：递减统一归**判定阶段**（runPhaseJudge → ageStatusesInJudge），
       判定阶段逐单位跑、不区分是否跳过行动，故这里的早退不会漏掉递减；
       v2.4.6：本函数不再有「就地补一次递减」的兼容分支 —— 回合末结算只有判定阶段一个出口。 */
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

  /* 迷惑（幻影之瞳）：三选一在**准备阶段**统一结算（作者裁定 §10-2 诅咒类），这里只负责
     「本次行动已被迷惑占用」—— 被迷惑的单位不能再按自己的意志行动
     （三选一的事件、`confused_down` / 牺牲自我等后果都已在准备阶段落地）。 */
  if (!acted && actor._confuseTurn === gb.turn) {
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
      /* v2.4.8：优先使用**准备阶段的预声明**（本回合要用什么在准备阶段就定了）；
         声明失效（技能进冷却 / 目标阵亡 / 本回合已消费过一次）→ takeDeclaredAction
         内部当场用同一个 aiDecide 重选，不卡死也不跳过整回合。 */
      var ai = takeDeclaredAction(gb, actor);
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

  /* v2.4.5：以下四步已搬到**判定阶段**（runPhaseJudge），那里逐单位跑、上下文逐字相同：
       · playerSkillTurnEnd（瞩目回复，旧顺序在天赋 onTurnEnd 之前）
       · 天赋 + 词条 onTurnEnd（振翅 / 再生 / 灵感涌动收尾 / 战意高涨 / 铁壁 / 终末宣告）
       · 状态 onTurnEnd（中毒 / 潮湿 / 睡眠回复）
       · duration 递减 + 到期 onExpire（判定阶段用 ageStatusesInJudge：带「准备阶段状态未触发
         前不递减」的例外，理由见其注释）
     旧注释保留在此备查：duration=N 的持续伤害类状态刚好结算 N 次（递减必须晚于 onTurnEnd 钩子）。 */
  /* v2.4.7（§8.6「onAfterAction 双重派发」一行）：**内层派发已删除**（原为 talentDispatch
     + 只取 events、丢弃 mutations）。它是历史遗留，而且是「疾影」词条只有 24.75% 的直接原因：
       · onAfterAction 的唯一生产者 = 词条「疾影」extra_act（affix.js），**v2.4.7 及以前**它
         在返回 `extraAction` mutation 的**同时**就把 `unit._extraCd` 置 3（v2.4.8 起改为
         「每回合 55%」的回合守卫 `_extraActTurn`，不再有跨回合冷却）；
       · 内层先跑：掷中 → 冷却被置上而 mutation 被丢弃 → 外层（runUnitActionStep）必然冷却早退；
         掷空（45%）→ 外层才有机会再掷 55% → 实际额外行动率 = 0.45 × 0.55 ≈ 24.75%（定义 55%）；
       · 内层还额外产出「疾影: 额外行动一次！」文案（假播报：掷空的那次也会播）。
     现在 onAfterAction **只有 runUnitActionStep 一处派发**（mutations 被消费、events 落日志）：
     即「每个单位每次行动后派发一次」，额外行动本身不再触发第二次。
     ⚠️ 事件顺序不变：外层派发的事件仍在同一条 gb.log 里（runPhaseAction / groupBattleStep 都是
        runUnitActionStep 返回之后才落日志），只是不再有「掷空也播报」的假文案。 */

  /* v2.4.6：回合末收尾（playerSkillTurnEnd / 天赋+词条 onTurnEnd / 状态 onTurnEnd / duration 递减）
     一律归**判定阶段**（runPhaseJudge → runUnitJudgeTail），本函数不再就地补跑一份 ——
     位置与语义仍与 v2.4.5 的编排内路径逐字一致（在 onAfterAction 之后、冷却递减之前由判定阶段接手）。 */

  // 技能冷却递减（v2.1.33：幽魂附身期间暂停 —— 设计文档「附身状态下技能不可用，且冷却暂停」）
  // v2.4.5：**留在行动阶段**。跳过行动的单位历史上不减冷却（本函数在 skip 分支就早退了），
  // 且「附身期间暂停」的判据来自本函数开头的 possessedThisTurn 快照 —— 搬到判定阶段两者都会走样。
  if (!possessedThisTurn) tickSkillCooldowns(actor);

  // 命中/闪避修正倒计时（闪耀 / 打湿）—— 同口径留在行动阶段
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
  logPhase(gb, {
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
  logPhase(gb, {
    turn: 0,
    unit: '开场',
    opening: true,
    events: evts.map(function (e) {
      return { msg: e.msg, targetId: e.targetId, type: e.type || 'talent', talentId: e.talentId };
    })
  });
  return evts;
}

/* 一个完整回合（四阶段依次跑完：准备 → 行动 → 判定 → 结束）。
   ⚠️ 本函数与 groupBattleStep 是**同一个编排**的两条驱动方式（整回合 / 单单位一步），
      两者共用 runPhasePrepare / runUnitActionStep / runPhaseJudge / runPhaseEnd，
      故同一场战斗走哪条路径结果一致（v2.4.5 之前不是：tick 缺 shieldPreSnapshot /
      shieldReflectAfter / qifengExtraAttack / resolveIceFollowUps 四处 step 专属钩子）。 */
function groupBattleTick(gb) {
  if (gb.done) return;
  _setBattleRng(gb);   // v2.1.27
  /* v2.4.8：tick 是「整回合」驱动器，不吃 `_resume`（回合中途的位置对整回合推进无意义）——
     清掉它，避免一次中途回滚留下的位置被后面某次 step 误用。 */
  gb._resume = null;
  var queue = runPhasePrepare(gb);
  runPhaseAction(gb, queue);
  finishRound(gb);
}

/* v2.1.33：冰魄光束的「下回合第二段」（OQ-12：回合开始时触发，不占用行动）。
   由 player-skill-hooks.js 施放时把 { targetId, dmg } 挂到施放者身上，
   本函数在回合切换处统一结算并清空。目标已阵亡则该段不再生效。
   v2.4.5：由**准备阶段**调用（runPhasePrepare），两条推进路径因此都吃得到
   （v2.4.5 之前只有 step 路径调它，tick 路径完全没有）。 */
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
    logPhase(gb, { turn: gb.turn, unit: u.name, events: [ev] });
  });
  return events;
}

/* 单步执行：一次只行动一个单位（用于逐个行动动画，速度优先级可见）
   返回 { unit: 行动单位, events, done, winner, queueIndex, queue, phase, turnEnd? }
   阶段编排与 groupBattleTick **共用同一组 helper**；本函数只是把同一个回合拆成多次调用：
     · 队列空时先跑「准备阶段」（并把本回合的队列放进 gb._stepQueue，供行动顺序条读取）；
     · 队列跑完后在**同一次调用**里跑「判定 + 结束」两个阶段，返回 { turnEnd: true }。
   v2.4.5：收尾那一步的返回值也带上 `events`（判定 + 结束两个阶段产出的事件）——
   这些事件（dot / duration 到期 / 天赋 onTurnEnd / 场地）以前落在最后一个单位的行动返回值里，
   现在归判定阶段，若不从这里取就只能去翻 gb.log。 */
function groupBattleStep(gb) {
  /* 胜负已分：本回合若还没收尾，先把「结束阶段」跑掉 ——
     契约要求 gb.phase 在跑完后停在最后一个阶段（判定阶段在 gb.done 时内部直接返回，
     不在已定胜负的残局上继续掉血）。 */
  if (gb.done) {
    if (!gb._roundOpen) return { done: true, winner: gb.winner || null, phase: gb.phase, events: [] };
    var fr0 = finishRound(gb);
    return { done: true, winner: gb.winner, turnEnd: true, phase: gb.phase, events: fr0.events };
  }
  _setBattleRng(gb);   // v2.1.27：让技能/AI/场地里的随机也走本场种子
  /* v2.4.8：从「回合进行中」的快照回滚后，先**还原本回合剩余的队列位置**
     （groupRestore 把位置存在 `_resume`，此时 `_stepQueue` 仍是空的）。
     `_resume` 存的是单位 id，这里按 id 重新解析成活的单位引用。 */
  if (gb._resume) {
    var rq = [];
    (gb._resume.ids || []).forEach(function (id) {
      var ru = (gb.units || []).find(function (x) { return x.id === id; });
      if (ru) rq.push(ru);
    });
    gb._stepQueue = rq;
    gb._stepIdx = Math.min(gb._resume.idx || 0, rq.length);
    gb._roundOpen = true;
    gb._resume = null;
  }
  /* ① 准备阶段（每回合一次，在行动队列建立之前） */
  if (!gb._roundOpen) {
    gb._stepQueue = runPhasePrepare(gb);
    gb._stepIdx = 0;
    gb._roundOpen = true;
  }
  // 跳过死亡单位
  while (gb._stepIdx < gb._stepQueue.length && gb._stepQueue[gb._stepIdx].hp <= 0) gb._stepIdx++;
  if (gb._stepIdx >= gb._stepQueue.length) {
    /* ③ 判定 + ④ 结束（本回合收尾） */
    var fr = finishRound(gb);
    return { done: gb.done, winner: gb.winner, turnEnd: true, phase: gb.phase, events: fr.events };
  }
  /* ② 行动阶段：本次调用只推进一个单位（行动后钩子与 tick 路径共用 runUnitActionStep） */
  var actor = gb._stepQueue[gb._stepIdx];
  gb._stepIdx++;
  enterPhase(gb, '行动');
  var evts = runUnitActionStep(gb, actor);
  gb.events = gb.events.concat(evts);
  logPhase(gb, { turn: gb.turn, unit: actor.name, events: evts });
  checkGroupWin(gb);
  return { unit: actor, events: evts, done: gb.done, winner: gb.winner, queueIndex: gb._stepIdx, queue: gb._stepQueue, phase: gb.phase };
}

/* 跑到结束（测试用） */
function runGroupBattle(gb, maxTurns) {
  var guard = 0;
  while (!gb.done && guard++ < (maxTurns || 200)) groupBattleTick(gb);
  return gb;
}

/* ============================================
   MyHealth — State Core (M2a S1-D)
   状态注册表 + 生命周期 hook 调度。纯逻辑，无 DOM/store。
   battle.js 在时机点调用 dispatch()，只负责「何时触发」；
   本模块负责「如何生效」（状态以数据返回效果，不改流程）。
   ============================================ */

/* --- 状态注册表 --- */
var STATUS_DEFS = {};   // id → def

/* defineStatus(def)
   def: { id, name, priority, maxStacks, stacking:'refresh'|'independent'|'stack',
          hooks:{ onApply,onExpire,onTurnStart,onTurnEnd,onBeforeAction,onAfterAction,onDamage,onHeal },
          statMods?: {atk?,def?,spd?,...} } */
function defineStatus(def) {
  if (!def || !def.id) throw new Error('defineStatus: id required');
  STATUS_DEFS[def.id] = def;
  return def;
}

function getStatusDef(id) { return STATUS_DEFS[id] || null; }
function listStatusDefs() { return Object.keys(STATUS_DEFS); }

/* --- 实例操作 --- */

/* applyStatus(unit, {id, duration, stacks?, source?, data?, modsPct?}) → {applied, refreshed, events[]}
   叠加规则由 def.stacking 决定
   v2.1.15 新增 modsPct：本次实例专属的百分比属性修正（按 unit.base 乘算），
   与 def.statMods / def.statModsPct 一起在 statMods() 里汇总。
   用途：「强攻」+30% 攻击、「气势如虹」+n×3%、「摄取」按窃取量加成 —— 这类
   幅度随等级/情境变化的效果没法写成状态定义里的固定值。 */
function applyStatus(unit, opts) {
  opts = opts || {};
  var def = STATUS_DEFS[opts.id];
  var events = [];
  if (!def) return { applied: false, refreshed: false, events: events };
  var stacks = opts.stacks || 1;

  var existing = null;
  for (var i = 0; i < unit.statuses.length; i++) {
    if (unit.statuses[i].id === opts.id) { existing = unit.statuses[i]; break; }
  }

  if (existing) {
    // 已存在：按 stacking 规则处理
    if (def.stacking === 'refresh') {
      existing.duration = Math.max(existing.duration, opts.duration || 1);
      if (opts.modsPct) existing.modsPct = opts.modsPct;
      events.push({ type: 'refresh', statusId: opts.id, unitId: unit.id });
      return { applied: false, refreshed: true, events: events };
    } else if (def.stacking === 'stack') {
      existing.stacks = Math.min(def.maxStacks || 3, existing.stacks + stacks);
      existing.duration = Math.max(existing.duration, opts.duration || 1);
      events.push({ type: 'stack', statusId: opts.id, unitId: unit.id, stacks: existing.stacks });
      return { applied: false, refreshed: true, events: events };
    }
    // independent：允许重复实例
  }

  var inst = {
    id: opts.id,
    duration: opts.duration || 1,
    stacks: Math.min(def.maxStacks || 1, stacks),
    source: opts.source || null,
    data: opts.data || {},
    modsPct: opts.modsPct || null
  };
  unit.statuses.push(inst);
  events.push({ type: 'apply', statusId: opts.id, unitId: unit.id, stacks: inst.stacks });
  if (def.hooks && def.hooks.onApply) {
    var r = def.hooks.onApply(unit, inst);
    if (r && r.events) events = events.concat(r.events);
  }
  return { applied: true, refreshed: false, events: events };
}

/* tickStatuses(unit, phase) → events[]
   phase: 'turnStart'|'turnEnd'；duration 递减，到期触发 onExpire
   ⚠ v2.1.15 说明：**战斗流程不要用这个**。它把「递减」和「派发 onTurnStart/onTurnEnd」揉在一起，
   而 battle-group 已经在自己的时机点用 dispatch() 派发过钩子了，直接调用会把中毒/末日这类
   每回合伤害算两遍。战斗路径请用下面的 ageStatuses()。
   本函数保留给「单独验证状态钩子」的用例（test-state-core / test-status）。 */
function tickStatuses(unit, phase) {
  var events = [];
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    var st = unit.statuses[i];
    var def = STATUS_DEFS[st.id];
    if (phase === 'turnStart' && def.hooks && def.hooks.onTurnStart) {
      var r = def.hooks.onTurnStart(unit, st);
      if (r && r.events) events = events.concat(r.events);
    }
    if (phase === 'turnEnd') {
      st.duration--;
      if (def.hooks && def.hooks.onTurnEnd) {
        var r2 = def.hooks.onTurnEnd(unit, st);
        if (r2 && r2.events) events = events.concat(r2.events);
      }
      if (st.duration <= 0) {
        if (def.hooks && def.hooks.onExpire) {
          var r3 = def.hooks.onExpire(unit, st);
          if (r3 && r3.events) events = events.concat(r3.events);
        }
        unit.statuses.splice(i, 1);
        events.push({ type: 'expire', statusId: st.id, unitId: unit.id });
      }
    }
  }
  return events;
}

/* ageStatuses(unit) → events[]
   v2.1.15 新增。回合末**只**做「duration 递减 + 到期移除 + onExpire」，不派发钩子。
   为什么不能直接用 tickStatuses：它把「递减」和「派发 onTurnStart/onTurnEnd」揉在一起，
   而 battle-group 已经在自己的时机点用 dispatch() 派发过钩子了 ——
   直接调用会把中毒/末日这类每回合伤害算两遍。
   此前 ageStatuses 的角色完全缺失（tickStatuses 全项目零调用），
   后果是**状态永不递减、永不结束**：
     · 中毒/减速/破甲/潮湿 一旦挂上就是整场
     · 冰冻/睡眠/畏缩 因为「受击解除」也没接线 → 该单位整场无法行动
   调用时机：单位自己的回合结束（放在 onTurnEnd 钩子之后），
   这样 duration=N 的持续伤害类状态刚好结算 N 次。 */
function ageStatuses(unit) {
  var events = [];
  if (!unit || !unit.statuses) return events;
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    var st = unit.statuses[i];
    if (!st) continue;
    var def = STATUS_DEFS[st.id] || {};
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

/* 是否增益状态（用于「驱散负面」与「摄取增益」的判定）。默认 false = 负面或中性。 */
function isPositiveStatus(id) {
  var d = STATUS_DEFS[id];
  return !!(d && d.positive);
}

/* purgeStatuses(unit, filter) → 被移除的状态定义数组（供日志）
   filter(def, inst) 返回 true 表示移除 */
function purgeStatuses(unit, filter) {
  var removed = [];
  if (!unit || !unit.statuses || typeof filter !== 'function') return removed;
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    var st = unit.statuses[i];
    var def = STATUS_DEFS[st.id];
    if (!def) continue;
    if (filter(def, st)) {
      removed.push(def);
      unit.statuses.splice(i, 1);
    }
  }
  return removed;
}

/* 解除负面：非增益 且 grade ≤ maxGrade（默认 2 = 普通~高级，不含特级 3）
   对应设计文档里「普通-高级负面状态」的措辞。 */
function cleanseNegatives(unit, maxGrade) {
  var cap = (maxGrade == null ? 2 : maxGrade);
  return purgeStatuses(unit, function (def) {
    return !def.positive && (def.grade || 0) <= cap;
  });
}

/* hasStatus(unit, id) */
function hasStatus(unit, id) {
  return unit.statuses.some(function (s) { return s.id === id; });
}

/* clearStatus(unit, id) */
function clearStatus(unit, id) {
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    if (unit.statuses[i].id === id) unit.statuses.splice(i, 1);
  }
}

/* clearAllStatuses(unit, filter?) */
function clearAllStatuses(unit, filter) {
  if (!filter) { unit.statuses = []; return; }
  for (var i = unit.statuses.length - 1; i >= 0; i--) {
    if (filter(unit.statuses[i])) unit.statuses.splice(i, 1);
  }
}

/* dispatch(unit, hook, ctx) → {skipAction?, mutations[], events[]}
   battle 在生命周期点调用；状态以数据返回效果，不改流程 */
function dispatch(unit, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  ctx = ctx || {};
  for (var i = 0; i < unit.statuses.length; i++) {
    var st = unit.statuses[i];
    var def = STATUS_DEFS[st.id];
    if (!def || !def.hooks || !def.hooks[hook]) continue;
    var r = def.hooks[hook](unit, st, ctx);
    if (!r) continue;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  }
  return out;
}

/* statMods(unit) → {atk?, def?, spd?...} 修正聚合，battle 结算有效属性用
   v2.1.15 三处升级（此前只是个「算了没人用」的摆设 —— 结果从未写回 unit._statMods，
   而 unit.js 的 effectiveSpeed / effectiveStat 读的正是 _statMods）：
     ① 按 st.stacks 乘算（破甲 6 层要真的 -60%，而不是永远 -10）
     ② 支持 def.statModsPct —— 按 unit.base 比例修正（潮湿「魂防 -25%」这类随属性缩放的效果，
        写固定值在几千点属性面前毫无意义）
     ③ 支持实例自带的 st.modsPct（「强攻」+30% 攻击、「气势如虹」+n×3% 这类按等级取值） */
function statMods(unit) {
  var flat = {}, pct = {};
  var list = (unit && unit.statuses) || [];
  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    var def = STATUS_DEFS[st.id];
    if (!def) continue;
    var n = Math.max(1, st.stacks || 1);
    var k;
    if (def.statMods) for (k in def.statMods) flat[k] = (flat[k] || 0) + def.statMods[k] * n;
    if (def.statModsPct) for (k in def.statModsPct) pct[k] = (pct[k] || 0) + def.statModsPct[k] * n;
    if (st.modsPct) for (k in st.modsPct) pct[k] = (pct[k] || 0) + st.modsPct[k] * n;
  }
  var out = {}, key;
  for (key in flat) out[key] = flat[key];
  for (key in pct) {
    var raw = (unit.base ? (unit.base[key] || 0) : 0) * pct[key];
    // 朝零取整：-6.25 → -6（用 Math.floor 会变成 -7，削减过头）
    out[key] = (out[key] || 0) + (raw < 0 ? Math.ceil(raw) : Math.floor(raw));
  }
  return out;
}

/* 把聚合结果写进 unit._statMods —— unit.js 的 effectiveSpeed / effectiveStat 读它。
   状态发生任何增删后都该刷一次。 */
function refreshStatMods(unit) {
  if (!unit) return {};
  unit._statMods = statMods(unit);
  return unit._statMods;
}
function refreshAllStatMods(units) {
  (units || []).forEach(function (u) { if (u) refreshStatMods(u); });
}

/* --- 内置状态：sleep（M2a 最小闭环）---
   onBeforeAction → skipAction（跳过行动）
   onDamage → 清除自身（受伤即醒）
   到期自然醒（duration 减到 0） */
defineStatus({
  id: 'sleep',
  name: '睡眠',
  priority: 100,
  maxStacks: 1,
  stacking: 'refresh',
  hooks: {
    onBeforeAction: function (unit, st) {
      return { skipAction: true, events: [{ type: 'skip', statusId: 'sleep', unitId: unit.id, reason: '睡眠中跳过行动' }] };
    },
    onDamage: function (unit, st) {
      // 受伤即醒
      clearStatus(unit, 'sleep');
      return { events: [{ type: 'wake', statusId: 'sleep', unitId: unit.id, reason: '受击苏醒' }] };
    }
  }
});

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

/* applyStatus(unit, {id, duration, stacks?, source?, data?}) → {applied, refreshed, events[]}
   叠加规则由 def.stacking 决定 */
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
    data: opts.data || {}
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
   phase: 'turnStart'|'turnEnd'；duration 递减，到期触发 onExpire */
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

/* statMods(unit) → {atk?, def?, spd?...} 修正聚合，battle 结算有效属性用 */
function statMods(unit) {
  var mods = {};
  for (var i = 0; i < unit.statuses.length; i++) {
    var def = STATUS_DEFS[unit.statuses[i].id];
    if (def && def.statMods) {
      for (var k in def.statMods) {
        mods[k] = (mods[k] || 0) + def.statMods[k];
      }
    }
  }
  return mods;
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

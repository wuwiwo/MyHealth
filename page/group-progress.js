/* ============================================
   MyHealth — Enemy Group Progress (敌群解锁)
   敌群试炼线性解锁：g1-1 → g1-2 → ... → g12-10（大关数由 group-levels.js 决定）
   通关的关卡锁定（不可重打），胜利解锁下一关。
   进度存 dh-group-progress（store 注册表）。
   纯逻辑 + store。
   ============================================ */

/* 注册 dh-group-progress schema */
if (typeof store !== 'undefined' && store.registerSchema) {
  store.registerSchema('groupProgress', {
    version: 1,
    defaultValue: function () {
      return { version: 1, cleared: [] };   // cleared: 已通关的小关 id 数组
    },
    validate: function (v) { return v && typeof v === 'object' && Array.isArray(v.cleared); },
    migrate: {}
  });
}

/* 读取进度 */
function getGroupProgress() {
  if (typeof store === 'undefined') return { version: 1, cleared: [] };
  var d = store.get('groupProgress');
  if (!d) { d = { version: 1, cleared: [] }; store.set('groupProgress', d); }
  return d;
}
function saveGroupProgress(d) {
  if (typeof store !== 'undefined') store.set('groupProgress', d);
}

/* 小关排序键：g1-1 → g1-10 → g2-1 ...（用于找下一关） */
function stageOrderKey(stageId) {
  var m = /^g(\d+)-(\d+)$/.exec(stageId || '');
  if (!m) return 0;
  return parseInt(m[1]) * 100 + parseInt(m[2]);
}

/* 全部小关 id（按顺序） */
function allStageIds() {
  // v2.1.7：由 GROUP_LEVELS 派生，不再硬编码大关数（此前写死 9，扩关后会漏）
  var ids = [];
  Object.keys(GROUP_LEVELS || {}).forEach(function (gk) {
    (GROUP_LEVELS[gk].stages || []).forEach(function (s) { ids.push(s.id) });
  });
  return ids;
}

/* 关卡是否已通关 */
function isGroupStageCleared(stageId) {
  var d = getGroupProgress();
  return d.cleared.indexOf(stageId) > -1;
}

/* 关卡是否解锁：
   第 1 关（g1-1）永远解锁；
   后续关：前一关已通关则解锁 */
function isGroupStageUnlocked(stageId) {
  if (stageId === 'g1-1') return true;
  var d = getGroupProgress();
  var order = stageOrderKey(stageId);
  var all = allStageIds();
  var idx = all.indexOf(stageId);
  if (idx <= 0) return false;
  // 前一关必须已通关
  return d.cleared.indexOf(all[idx - 1]) > -1;
}

/* 敌群胜利：记录通关（若未通关过），返回 {firstClear, nextStage} */
function markGroupStageCleared(stageId) {
  var d = getGroupProgress();
  var firstClear = d.cleared.indexOf(stageId) === -1;
  if (firstClear) {
    d.cleared.push(stageId);
    saveGroupProgress(d);
  }
  // 下一关
  var all = allStageIds();
  var idx = all.indexOf(stageId);
  var next = (idx > -1 && idx < all.length - 1) ? all[idx + 1] : null;
  return { ok: true, firstClear: firstClear, nextStage: next, clearedCount: d.cleared.length };
}

/* 进度统计 */
function groupProgressStats() {
  var d = getGroupProgress();
  // v2.1.7：total 由 allStageIds 派生（此前写死 90，扩到 12 大关后会算错）
  return { cleared: d.cleared.length, total: allStageIds().length, clearedStages: d.cleared };
}

/* 单个大关的通关情况（v2.1.7：供关卡选择界面外侧展示进度）
   返回 { cleared, total, unlocked, state }  state: 'locked' | 'progress' | 'done' */
function groupClearedCount(groupId) {
  var glv = (typeof GROUP_LEVELS !== 'undefined') ? GROUP_LEVELS[groupId] : null;
  var stages = (glv && glv.stages) || [];
  var cleared = stages.filter(function (s) { return isGroupStageCleared(s.id) }).length;
  var total = stages.length;
  var unlocked = total ? isGroupStageUnlocked(stages[0].id) : false;
  var state = cleared >= total && total ? 'done' : (unlocked ? 'progress' : 'locked');
  return { cleared: cleared, total: total, unlocked: unlocked, state: state };
}

/* 测试/工具暴露 */
if (typeof window !== 'undefined') {
  window.getGroupProgress = getGroupProgress;
  window.saveGroupProgress = saveGroupProgress;
  window.isGroupStageCleared = isGroupStageCleared;
  window.isGroupStageUnlocked = isGroupStageUnlocked;
  window.markGroupStageCleared = markGroupStageCleared;
  window.groupProgressStats = groupProgressStats;
  window.groupClearedCount = groupClearedCount;
  window.allStageIds = allStageIds;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getGroupProgress = getGroupProgress;
  globalThis.saveGroupProgress = saveGroupProgress;
  globalThis.isGroupStageCleared = isGroupStageCleared;
  globalThis.isGroupStageUnlocked = isGroupStageUnlocked;
  globalThis.markGroupStageCleared = markGroupStageCleared;
  globalThis.groupProgressStats = groupProgressStats;
  globalThis.groupClearedCount = groupClearedCount;
  globalThis.allStageIds = allStageIds;
}

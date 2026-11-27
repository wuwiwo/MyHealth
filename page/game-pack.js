/* ============================================
   MyHealth · 挑战/宠物视图按需包加载器（v2.14.40）
   ============================================
   为什么要有它：game-views.js(28KB) + pet-ui.js(68KB) + pet-codex.js(41KB) 共 137KB 源码，
   只有进「挑战」tab 或打开宠物面板才用得到（scripts/audit-module-deps.js 给的数据）。
   首屏（训练/个人/设置）不需要它们，于是合成 page/_build/pack-game.js 按需注入。

   与本项目 ex-dataset.js 的懒加载同一套纪律：
     · 幂等：已 ready 同步回调 true 立即返回；
     · 排队：加载中再次请求的 cb 入队，不重复发请求；
     · 失败回调 false，**不抛异常、不自动重试**（重试交给用户动作，避免弱网死循环）；
     · 全部用经典脚本注入，与原 55 个 <script> 共享全局作用域，注入后即可直接调用其函数。

   调用点：app.js 的 switchTab('game') —— 先画骨架（game-render 对缺失函数都有 typeof 守卫），
   pack 到位后再重画一次；失败只 toast，页面保持可用（用户可重试）。
   ============================================ */
var GAMEPACK_STATE = 'idle';   // idle | loading | ready | failed
var _gamePackQueue = [];

function gamePackUrl() {
  /* 与 ex-dataset 同口径：用 APP_VERSION 去点做缓存戳（每版必换 URL，不吃旧缓存） */
  var v = (typeof APP_VERSION === 'string' ? APP_VERSION : '0').replace(/\./g, '');
  return '_build/pack-game.js?v' + v;
}

function loadGamePack(cb) {
  if (GAMEPACK_STATE === 'ready') { if (typeof cb === 'function') cb(true); return; }
  if (GAMEPACK_STATE === 'failed') { if (typeof cb === 'function') cb(false); return; }
  if (typeof cb === 'function') _gamePackQueue.push(cb);
  if (GAMEPACK_STATE === 'loading') return;
  GAMEPACK_STATE = 'loading';
  var s = document.createElement('script');
  s.src = gamePackUrl();
  s.async = false;
  s.onload = function () { GAMEPACK_STATE = 'ready'; _flushGamePack(true); };
  s.onerror = function () { GAMEPACK_STATE = 'failed'; _flushGamePack(false); };
  (document.head || document.body).appendChild(s);
}

function _flushGamePack(ok) {
  var q = _gamePackQueue.slice();
  _gamePackQueue.length = 0;
  q.forEach(function (fn) { try { fn(ok); } catch (e) { /* 忽略：单个回调异常不影响其它等待者 */ } });
}

/* 失败后重试：把状态复位再拉一次（用户点「重试」或再次切到挑战 tab 时调用） */
function retryGamePack(cb) {
  if (GAMEPACK_STATE === 'ready') { if (typeof cb === 'function') cb(true); return; }
  GAMEPACK_STATE = 'idle';
  loadGamePack(cb);
}

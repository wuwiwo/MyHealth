#!/usr/bin/env node
/* v2.1.6 回归测试：模态滚动锁必须能回落到 0
   背景：线上曾出现「页面有时无法滚动」——openModal 用 body{position:fixed} 锁滚动，
   某些关闭路径没解锁，body 就永久 fixed。
   根因 1：兜底 MutationObserver 是共享全局 _mo，嵌套模态拿不到兜底、
   且 close() 会掐断别人的 observer。
   根因 2：app.js 全局点击处理器只 classList.remove('open')，不移除元素也不解锁。
   本测试用最小 DOM 桩在 Node 里直接验证引用计数，锁死后 _scrollLockCount() 不会归 0。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

/* ---------- 最小 DOM 桩 ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag || 'div', className: '', id: '', innerHTML: '',
    dataset: {}, style: {}, _attrs: {},
    parentNode: null, isConnected: true, _kids: [],
    setAttribute(k, v) { el._attrs[k] = v },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null },
    addEventListener() {}, removeEventListener() {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c) },
      remove(c) { this._s.delete(c) },
      contains(c) { return this._s.has(c) },
      toggle(c, f) { if (f) this._s.add(c); else this._s.delete(c) }
    },
    appendChild(c) { el._kids.push(c); c.parentNode = el; return c },
    remove() {
      if (el.parentNode) {
        const i = el.parentNode._kids.indexOf(el)
        if (i > -1) el.parentNode._kids.splice(i, 1)
        el.parentNode = null
      }
      el.isConnected = false
    },
    querySelector() { return null },
    querySelectorAll() { return [] },
    focus() {}
  };
  return el;
}

const observers = [];
const sandbox = { Math, JSON, console, Date, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.scrollY = 0;
sandbox.scrollTo = function () { /* 桩：记录即可 */ };
sandbox.matchMedia = undefined;
sandbox.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} };
sandbox.MutationObserver = function (cb) {
  this.cb = cb; this.active = true; observers.push(this);
  this.observe = function () { /* 桩：不做真实监听，靠 flush 手动触发 */ };
  this.disconnect = function () {
    this.active = false;
    const i = observers.indexOf(this); if (i > -1) observers.splice(i, 1);
  };
};
sandbox.document = {
  createElement: makeEl,
  documentElement: makeEl('html'),
  body: makeEl('body'),
  activeElement: null,
  getElementById() { return null },
  querySelector() { return null },
  querySelectorAll() { return [] },
  addEventListener() {}, removeEventListener() {},
  contains() { return true }
};
/* 手动触发所有活跃 observer（模拟浏览器微任务里的 MutationObserver 回调） */
function flushObservers() { observers.slice().forEach(o => { if (o.active) o.cb([]) }) }

vm.createContext(sandbox);
vm.runInContext(load('utils.js'), sandbox);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function bodyLocked() { return sandbox.document.body.style.position === 'fixed' }

// ---- 1. 基线 ----
assert('初始未锁滚动', sandbox._scrollLockCount() === 0, 'count=' + sandbox._scrollLockCount());

// ---- 2. 开→关 必须归零 ----
const m1 = sandbox.openModal(null, 'm1');
assert('开模态后计数 1', sandbox._scrollLockCount() === 1, 'count=' + sandbox._scrollLockCount());
assert('开模态后 body 被锁', bodyLocked());
assert('模态带 modalManaged 标记', m1.dataset.modalManaged === '1');
m1._close();
assert('关闭后计数归零', sandbox._scrollLockCount() === 0, 'count=' + sandbox._scrollLockCount());
assert('关闭后 body 解锁', !bodyLocked(), 'position=' + sandbox.document.body.style.position);

// ---- 3. ★ 回归：嵌套模态，内层被外部直接 remove 也必须解锁 ----
const A = sandbox.openModal(null, 'A');
const B = sandbox.openModal(null, 'B');
assert('嵌套两模态计数 2', sandbox._scrollLockCount() === 2, 'count=' + sandbox._scrollLockCount());
B.remove();            // 模拟调用方绕过 _close 直接 remove（challenge.js 就这么干）
flushObservers();      // 浏览器里 MutationObserver 回调在此触发
assert('★ 内层直接 remove 后计数回落 1', sandbox._scrollLockCount() === 1,
  'count=' + sandbox._scrollLockCount() + '（修复前为 2：内层拿不到兜底 observer）');
A._close();
assert('外层关闭后计数归零', sandbox._scrollLockCount() === 0, 'count=' + sandbox._scrollLockCount());
assert('嵌套全部关闭后 body 解锁', !bodyLocked());

// ---- 4. 幂等：重复 _close 不会把计数扣成负数 ----
const m2 = sandbox.openModal(null, 'm2');
m2._close();
m2._close();
m2._close();
assert('重复关闭不产生负计数', sandbox._scrollLockCount() === 0, 'count=' + sandbox._scrollLockCount());

// ---- 5. 嵌套时内层正常 _close，外层 observer 不被误伤 ----
const C = sandbox.openModal(null, 'C');
const D = sandbox.openModal(null, 'D');
D._close();
assert('内层正常关闭后计数 1', sandbox._scrollLockCount() === 1, 'count=' + sandbox._scrollLockCount());
C.remove();
flushObservers();
assert('★ 外层 remove 后计数归零', sandbox._scrollLockCount() === 0,
  'count=' + sandbox._scrollLockCount() + '（修复前 D 的 close 会掐断 C 的 observer → 卡在 1）');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

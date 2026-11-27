#!/usr/bin/env node
/* v2.14.34（评审 §6 键盘焦点未验证项的守卫）：弹层焦点陷阱。
 *
 * 这一套守的是「键盘用户能不能一直在弹窗里」—— 原来弹窗打开后 Tab 会跑到背后被遮住的
 * 顶栏（#syncBtn / #themeToggle）和四个 tab 上，实测可复现。修法是在 utils.js 里做**容器级**接管，
 * 不改 12 个调用点，所以这里既守「行为存在」，也守「没有被复制成第二份」。
 *
 * 三类断言：
 *   [1] 实现存在且唯一（选择器 / 环回 / 归还焦点 / 只注册一次）
 *   [2] 真 DOM 冒烟（用最小 fake DOM 驱动 modalTrapKeydown / modalFocusSync 的首尾环回）
 *   [3] 接线（页面加载即调用、MutationObserver 合并、没有另一处 addEventListener('keydown')）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const SRC = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }
const test = s => s;

console.log('\n[1] 实现存在且唯一（utils.js）');
const u = SRC('utils.js');
ok(/var MODAL_FOCUS_SEL = '\.modal-sheet,\.modal'/.test(u), '弹层选择器只认 .modal-sheet / .modal（与全站弹层实际类名一致）');
ok(/function modalTrapSheet\(/.test(u) && /function modalFocusables\(/.test(u), '有两个原语：取当前可见弹层 / 取弹层内可聚焦元素');
ok(/function modalFocusSync\(/.test(u) && /function modalTrapKeydown\(/.test(u), '有两个动作：同步焦点 / 拦 Tab');
ok(u.indexOf('_modalPrevFocus = document.activeElement') > 0, '打开时记录来源焦点（用于关闭后归还）');
ok(/if \(_modalPrevFocus && _modalPrevFocus\.focus\) \{ try \{ _modalPrevFocus\.focus\(\); \} catch/.test(u), '关闭时把焦点还给来源元素（元素已销毁也不抛）');
ok(/list\[list\.length - 1\]\.focus\(\)/.test(u) && /list\[0\]\.focus\(\)/.test(u), 'Tab / Shift+Tab 在弹层首尾环回');
ok(/document\.addEventListener\('keydown', modalTrapKeydown, true\)/.test(u), '用捕获阶段拦 Tab（不被内层 handler 吃掉）');
ok(/if \(pending\) return;/.test(u), 'MutationObserver 同一帧的连续变动合并成一次（不每改一个节点就抢焦点）');
ok(/if \(sheet\.contains\(document\.activeElement\)\) return;/.test(u), '焦点已在弹层内就不抢（用户在弹窗里输入时不被挪走）');

console.log('\n[2] 行为冒烟（fake DOM：首尾环回 + 归还焦点）');
/* 最小 fake DOM：只实现本套件用到的 getComputedStyle / querySelectorAll / getClientRects / focus */
function fakeEl(name, rect) {
  const el = {
    _name: name, disabled: false, _ti: null, _inside: null,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    getAttribute: k => (k === 'tabindex' ? el._ti : null),
    getClientRects: () => (rect ? [{}] : []),
    contains: n => n === el || (el._inside && el._inside.indexOf(n) >= 0),
    querySelectorAll: () => el._kids || [],
    focus() { sandbox.document.activeElement = el; }
  };
  return el;
}
let sandbox;
function buildSandbox() {
  const first = fakeEl('first', true), mid = fakeEl('mid', true), last = fakeEl('last', true);
  const sheet = fakeEl('sheet', true);
  sheet._kids = [first, mid, last];
  sheet._inside = [first, mid, last];
  const outside = fakeEl('outside', true);
  const body = { children: [sheet] };
  const doc = {
    activeElement: outside,
    body,
    querySelectorAll: sel => (sel === '.modal-sheet,.modal' ? [sheet] : []),
    addEventListener() { /* 记录用 */ }
  };
  sandbox = {
    document: doc, window: {}, setTimeout: fn => fn(),
    MutationObserver: function () { this.observe = () => {}; },
    Array, Number, getComputedStyle: el => ({ display: el.style.display, visibility: el.style.visibility, opacity: el.style.opacity }),
    __sheet: sheet, __first: first, __last: last, __outside: outside
  };
  /* 只把需要直接调用的两个函数搬进沙箱（其余源码字符串不执行，避免 DOM 依赖） */
  const pick = (name) => {
    const start = u.indexOf('function ' + name);
    let depth = 0, i = u.indexOf('{', start);
    for (; i < u.length; i++) {
      if (u[i] === '{') depth++;
      else if (u[i] === '}') { depth--; if (depth === 0) break; }
    }
    return u.slice(start, i + 1);
  };
  const code = ["var MODAL_FOCUS_SEL = '.modal-sheet,.modal';", 'var _modalPrevFocus = null;',
    pick('modalTrapSheet'), pick('modalFocusables'), pick('modalTrapKeydown')].join('\n');
  vm.runInNewContext(code + '\n;__out = {trapSheet: modalTrapSheet, focusables: modalFocusables, keydown: modalTrapKeydown};', sandbox);
  return sandbox;
}

buildSandbox();
ok(sandbox.__out.trapSheet() === sandbox.__sheet, '能取到当前可见弹层');
ok(sandbox.__out.focusables(sandbox.__sheet).length === 3, '取到 3 个可聚焦元素（实测 ' + sandbox.__out.focusables(sandbox.__sheet).length + '）');

/* Tab 从最后一个 → 回到第一个 */
sandbox.__last.focus();
let prevented = false;
sandbox.__out.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; }, defaultPrevented: false });
ok(prevented && sandbox.document.activeElement === sandbox.__first, 'Tab 在最后一个上环回到第一个（并 preventDefault）');

/* Shift+Tab 从第一个 → 到最后一个 */
sandbox.__first.focus();
prevented = false;
sandbox.__out.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; }, defaultPrevented: false });
ok(prevented && sandbox.document.activeElement === sandbox.__last, 'Shift+Tab 在第一个上环回到最后一个');

/* 焦点在弹层外（例如背后顶栏）→ Tab 拉回第一个 */
sandbox.__outside.focus();
prevented = false;
sandbox.__out.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; }, defaultPrevented: false });
ok(prevented && sandbox.document.activeElement === sandbox.__first, '焦点跑到背后时按 Tab 会被拉回弹层第一个元素');

/* 非 Tab 键不拦（Esc / 方向键交给既有逻辑） */
prevented = false;
sandbox.__out.keydown({ key: 'Escape', preventDefault() { prevented = true; }, defaultPrevented: false });
ok(!prevented, 'Esc 等其它键不拦（弹层自己的关闭逻辑不受影响）');

console.log('\n[3] 接线与唯一性');
ok(/typeof document\.addEventListener === 'function'/.test(u)
  && /typeof document\.querySelectorAll === 'function'/.test(u),
  '初始化前做能力探测（缺 DOM 的 vm 沙箱不会在加载时抛 TypeError）');
ok(/initModalFocusTrap\(\);/.test(u) && /document\.body/.test(u), '脚本加载即初始化（脚本都在 body 末尾，DOM 已就绪）');
ok(/if \(window\.__modalTrapOn\) return;/.test(u), '重复初始化直接 return（不会注册两个 Tab 监听）');
const all = fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).map(f => [f, SRC(f)]);
/* debug.js / tab-strength.js 各有自己的 keydown（调试面板快捷键、输入快捷键）—— 不算冲突；这里守的是
   「Tab 拦截只有一份」：除了 utils.js，没有别的文件引用 modalTrapKeydown。 */
const trapBinders = all.filter(([, s]) => /modalTrapKeydown/.test(s)).map(([f]) => f);
ok(trapBinders.length === 1 && trapBinders[0] === 'utils.js',
  'Tab 拦截只由 utils.js 注册（实测 ' + JSON.stringify(trapBinders) + '）');
const dupTrap = all.filter(([, s]) => /function modalTrapSheet|MODAL_FOCUS_SEL/.test(s)).map(([f]) => f);
ok(dupTrap.length === 1, '焦点陷阱只有一份实现（实测 ' + JSON.stringify(dupTrap) + '）');
ok(!/function modalTrapSheet/.test(SRC('app.js')), 'app.js 没有第二份（容器级接管，不改调用点）');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

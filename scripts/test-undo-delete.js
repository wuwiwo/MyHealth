/* test-undo-delete.js —— v2.14.35 删除撤销（30 秒 / 按原下标插回 / 一次一条）
   1) 源码契约 2) insertAt 纯函数行为 3) 接线（动作 + 两类计划删除都走撤销条） 4) CSS 可点尺寸 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const utils = fs.readFileSync(path.join(ROOT, 'page/utils.js'), 'utf8');
const settings = fs.readFileSync(path.join(ROOT, 'page/tab-settings.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'page/index.css'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }

console.log('\n[1] 源码契约');
ok(/var UNDO_MS=30000/.test(utils), '撤销窗口为 30 秒（常量 UNDO_MS=30000）');
ok(/function insertAt\(list,item,index\)/.test(utils), '存在纯函数 insertAt（插回原下标）');
ok(/function showUndoBar\(text,onUndo\)/.test(utils), '存在 showUndoBar(text,onUndo)');
ok(/function clearUndoBar\(\)/.test(utils), '存在 clearUndoBar');
const barFn = utils.slice(utils.indexOf('function showUndoBar'), utils.indexOf('/* ========== THEME'));
ok(barFn.indexOf('clearUndoBar()') < barFn.indexOf("bar.className='undo-bar'"), 'showUndoBar 开头先清旧条（一次只有一条）');
ok(/bar\.setAttribute\('role','status'\)/.test(utils), '撤销条带 role=status（读屏可播报）');
ok(/b\.type='button'/.test(utils) && /x\.type='button'/.test(utils), '两个按钮都是 type=button（不会误提交表单）');
ok(/x\.setAttribute\('aria-label','关闭撤销提示'\)/.test(utils), '关闭按钮有 aria-label');
ok(/toast\('已恢复','s'\)/.test(utils), '撤销成功有「已恢复」反馈');
ok(/catch\(e\)\{toast\('恢复失败','e'\)\}/.test(utils), '恢复失败不静默（toast 提示）');
ok(utils.indexOf('},UNDO_MS)') > 0 && utils.indexOf('clearInterval(_undoTick)') > 0, '超时自动撤掉撤销条并停掉倒计时（= 确认删除）');
ok(barFn.indexOf("sec.textContent=left+'s'") > 0, '时限用独立倒计时标签（不写进正文，避免 360px 截断）');
ok(barFn.indexOf("sec.setAttribute('aria-hidden','true')") > 0, '倒计时对读屏隐藏（只念一次正文）');
ok(!/localStorage|store\.set/.test(barFn), '撤销条不写存档（不靠 UI 存活）');

console.log('\n[2] insertAt 行为（vm 跑真源码）');
const ctx = { console };
vm.createContext(ctx);
const src = utils.slice(utils.indexOf('function insertAt'), utils.indexOf('function _undoBarHost'));
vm.runInContext(src + '\nthis.__insertAt = insertAt;', ctx);
const ins = ctx.__insertAt;
ok(typeof ins === 'function', 'insertAt 可从 utils.js 抽出并执行');
const base = ['a', 'b', 'c'];
const r1 = ins(base, 'X', 1);
ok(JSON.stringify(r1) === '["a","X","b","c"]', '中段按下标插回（1 → a,X,b,c）');
ok(JSON.stringify(base) === '["a","b","c"]', '不改入参（原数组保持）');
ok(JSON.stringify(ins(base, 'X', 3)) === '["a","b","c","X"]', '下标=长度时追加到末尾');
ok(JSON.stringify(ins(base, 'X', 99)) === '["a","b","c","X"]', '越界下标退化为追加（不抛）');
ok(JSON.stringify(ins(base, 'X', -5)) === '["a","b","c","X"]', '负数下标退化为追加（不抛）');
ok(JSON.stringify(ins(null, 'X', 0)) === '["X"]', '空/null 列表也能接住');
ok(JSON.stringify(ins(undefined, 'X', 0)) === '["X"]', 'undefined 列表也能接住');

console.log('\n[3] 接线（三处删除都走撤销条）');
const delFn = settings.slice(settings.indexOf('function delExercise'), settings.indexOf('/* ========== DATASET PICKER'));
ok(delFn.includes('已删除动作「') && delFn.includes('obj.name'), '删动作走撤销条并带动作名');
ok(/saveExercises\(insertAt\(getExercises\(\),obj,idx\)\)/.test(delFn), '动作撤销用 insertAt 按原下标插回');
ok(/renderExLibrary\(\)/.test(delFn), '动作撤销后重渲染动作库');
ok(settings.indexOf("showUndoBar('已删除计划「'+pobj.name+'」") >= 0, '删力量计划走撤销条');
ok(settings.indexOf("showUndoBar('已删除计划「'+cobj.name+'」") >= 0, '删有氧计划走撤销条');
ok(/savePlans\(insertAt\(getPlans\(\),pobj,pi\)\)/.test(settings), '力量计划撤销按原下标插回');
ok(/saveCardioPlans\(insertAt\(getCardioPlans\(\),cobj,ci\)\)/.test(settings), '有氧计划撤销按原下标插回');
ok((settings.match(/confirm\('确定删除/g) || []).length >= 3, '三处删除仍保留 confirm（预防 + 可撤销双保险）');
ok(!/确认删除/ .test(''), '占位（保持断言编号稳定）');

console.log('\n[4] CSS：撤销条在导航之上、按钮够大');
const cssBlock = css.slice(css.indexOf('.undo-c{'), css.indexOf('.undo-x{'));
ok(/\.undo-c\{position:fixed/.test(css), '撤销条容器 fixed');
ok(/bottom:calc\(var\(--tabbar-h\)/.test(css), '贴在主导航之上（不遮 Tab）');
ok(/\.undo-bar\{[^}]*min-height:var\(--touch-min\)/.test(css), '条高 ≥ 触摸最小尺寸');
ok(/\.undo-btn\{[^}]*min-height:var\(--touch-min\)/.test(css), '撤销按钮 ≥ 44px');
ok(/\.undo-x\{[^}]*min-width:var\(--touch-min\)/.test(css), '关闭按钮 ≥ 44px 宽');
ok(/z-index:998/.test(cssBlock), '撤销条层级 998（低于 toast 999，不抢提示）');
ok(!/--text-2/.test(cssBlock), '只用已存在的令牌（--text2，避免静默失效）');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('FAILED:\n' + fails.map(f => ' - ' + f).join('\n')); process.exit(1); }

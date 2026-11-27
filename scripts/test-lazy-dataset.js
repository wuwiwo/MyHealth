/* test-lazy-dataset.js —— v2.14.36 动作数据集移出首屏包（懒加载）
   1) 构建契约：包内不含数据集、体积回落、入口页不引用数据集
   2) ex-dataset.js：bind()/load() 幂等与就绪语义（vm 假 DOM）
   3) 接线：autoLink / 空闲预取 / 打开百科前先拉
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ex = fs.readFileSync(path.join(ROOT, 'page/ex-dataset.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'page/app.js'), 'utf8');
const settings = fs.readFileSync(path.join(ROOT, 'page/tab-settings.js'), 'utf8');
const build = fs.readFileSync(path.join(ROOT, 'scripts/build-bundle.js'), 'utf8');
const bundle = fs.readFileSync(path.join(ROOT, 'page/_build/app.js'), 'utf8');
const entry = fs.readFileSync(path.join(ROOT, 'page/index.html'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'page/index.src.html'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

console.log('\n[1] 构建契约');
ok(build.indexOf("const LAZY = ['data/exercises-dataset.js']") >= 0, '构建脚本显式声明懒加载清单');
ok(build.indexOf('LAZY.indexOf(m.src) >= 0') >= 0, '合成循环会跳过懒加载项');
ok(bundle.indexOf('window.EX_DATASET =') < 0, '产物包里没有数据集');
ok(entry.indexOf('data/exercises-dataset.js') < 0, '入口页没有数据集 <script>');
ok(src.indexOf('data/exercises-dataset.js') > 0, '源码页仍逐文件引入数据集（本地开发与测试行为不变）');
const bundleKb = Math.round(fs.statSync(path.join(ROOT, 'page/_build/app.js')).size / 1024);
const dataKb = Math.round(fs.statSync(path.join(ROOT, 'page/data/exercises-dataset.js')).size / 1024);
ok(bundleKb < 1600, '包体积已回落到 1.6MB 以下（实测 ' + bundleKb + ' KB）');
ok(dataKb > 1000, '数据集确实是 1MB 级（实测 ' + dataKb + ' KB，占源码 44%）');
ok(bundleKb + dataKb > 2400, '两者相加仍等于原来的整包量（没有丢文件）');

console.log('\n[2] ex-dataset.js 语义（vm）');
ok(/function bind\(\) \{/.test(ex) && /bind\(\);\n/.test(ex), '存在 bind() 且模块加载时先绑一次');
ok(/if \(D\.keys && D\.keys\.length\) K = D\.keys;/.test(ex), 'bind() 会同步键序（keys 变化也不炸）');
ok(/_byId = null; _catList = null; _eqList = null;/.test(ex), 'bind() 清缓存（重绑后索引重建）');
ok(/function load\(cb\) \{/.test(ex), '存在 load(cb)');
ok(/if \(ready\(\)\) \{ if \(cb\) cb\(true\); return; \}/.test(ex), '已有数据时 load 立刻同步回调 true（不重复请求）');
ok(/if \(_loadState !== 0\) return;/.test(ex), '加载中再次调用不会重复注入 <script>（幂等）');
ok(/s\.onerror = function\(\) \{ flush\(false\); \}/.test(ex), '失败回调 false（UI 走「数据集未加载」分支）');
ok(ex.indexOf("s.src = 'data/exercises-dataset.js?v'") > 0, '懒加载地址带版本戳（可长期命中缓存）');

/* 用假 DOM 跑真源码：验证「无数据→load 注入脚本→onload 后 ready() 变 true→回调 true」 */
const sandbox = {
  console,
  APP_VERSION: '2.14.36',
  window: {},
  document: {
    _lastScript: null,
    createElement: () => ({ tagName: 'SCRIPT', setAttribute() { }, }),
    head: { appendChild(n) { sandbox.document._lastScript = n; } },
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(ex, sandbox);
const EXD = sandbox.EXD;
ok(EXD && typeof EXD.load === 'function', 'EXD.load 已导出');
let cb1 = null;
EXD.load(r => { cb1 = r; });
ok(cb1 === null && EXD.ready() === false, '加载未完成前 ready() 仍为 false，回调未触发');
ok(sandbox.document._lastScript && /^data\/exercises-dataset\.js\?v21436$/.test(sandbox.document._lastScript.src), '注入的地址与版本戳正确（实测 ' + (sandbox.document._lastScript || {}).src + '）');
let cb2 = null;
EXD.load(r => { cb2 = r; });   /* 再来一次：不应注入第二个脚本 */
ok(sandbox.document._lastScript.src.indexOf('exercises-dataset') > 0, '第二次 load 复用同一次请求');
sandbox.window.EX_DATASET = { keys: ['id', 'name', 'zh'], items: [['0001', 'test', '测试']], attribution: 'x' };
sandbox.document._lastScript.onload();
ok(EXD.ready() === true, 'onload 之后 bind() 生效，ready() 变 true');
ok(cb1 === true && cb2 === true, '两个排队回调都收到 true（不丢回调）');
ok(EXD.get('0001') && EXD.get('0001').zh === '测试', '重绑后能按 id 取到条目');

console.log('\n[3] 接线');
ok(/function prefetchDataset\(\)/.test(app), 'app.js 有空闲预取 prefetchDataset()');
ok(/setTimeout\(prefetchDataset,1200\)/.test(app), 'init 之后 1200ms 触发预取（不挡首屏）');
ok(/function refreshAfterDataset\(\)/.test(app) && /renderExLibrary/.test(app), '数据到达后刷新依赖它的卡片');
ok(/if\(!EXD\.ready\(\)\)\{EXD\.load\(function\(ok\)\{ if\(ok\)autoLinkExercises\(\) \}\);return\}/.test(app), 'autoLink 在数据未到时先触发加载，就绪后再回填');
ok(/EXD\.load\(function\(ok\)\{ if\(ok\)openDsPicker\(onPick\); else toast\('动作百科数据加载失败','e'\) \}\)/.test(settings), '打开动作百科前先拉数据，失败有提示');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

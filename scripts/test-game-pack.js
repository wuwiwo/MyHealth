/* test-game-pack.js —— v2.14.40 挑战/宠物视图按需包
   1) 构建契约：三个文件真的移出主包、按需包体积合理、入口页不引用它
   2) game-pack.js：幂等 / 排队 / 失败语义 / 重试（vm 跑真源码）
   3) 接线：switchTab('game') 先画骨架再注入，失败给 toast + 重试按钮
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const P = f => fs.readFileSync(path.join(ROOT, 'page', f), 'utf8');
const pack = P('game-pack.js');
const app = P('app.js');
const build = fs.readFileSync(path.join(ROOT, 'scripts/build-bundle.js'), 'utf8');
const bundle = fs.readFileSync(path.join(ROOT, 'page/_build/app.js'), 'utf8');
const entry = fs.readFileSync(path.join(ROOT, 'page/index.html'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'page/index.src.html'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

console.log('\n[1] 构建契约');
ok(build.indexOf("const PACK_GAME = ['game-views.js', 'pet-ui.js']") >= 0, '构建脚本显式声明按需包清单（2 个文件）');
ok(build.indexOf('pack-game.js') > 0, '构建会生成 page/_build/pack-game.js');
ok(bundle.indexOf('function renderGameViews') < 0 && bundle.indexOf('function renderPetPanel') < 0 && bundle.indexOf('function petIconStageHtml') < 0, '主包已不含按需包的核心函数（renderGameViews / renderPetPanel / petIconStageHtml）');
ok(bundle.indexOf('function listPetCodex') > 0, '数据层 listPetCodex 仍在主包（pet-codex.js 故意不移出，避免散落兜底）');
ok(entry.indexOf('pack-game.js') < 0, '入口页不直接引用按需包（运行时注入）');
ok(src.indexOf('game-pack.js') > 0, '源码页引入 game-pack.js（本地/测试走逐文件加载）');
const packKB = Math.round(fs.statSync(path.join(ROOT, 'page/_build/pack-game.js')).size / 1024);
const appKB = Math.round(fs.statSync(path.join(ROOT, 'page/_build/app.js')).size / 1024);
ok(packKB > 60 && packKB < 130, '按需包 60–130KB（实测 ' + packKB + ' KB）');
ok(appKB < 1420, '主包回落到 1.42MB 以下（实测 ' + appKB + ' KB，移出前 1469KB）');

console.log('\n[2] game-pack.js 语义（vm 跑真源码）');
const sandbox = {
  console,
  APP_VERSION: '2.14.40',
  window: {},
  document: {
    _scripts: [],
    createElement: () => ({ tagName: 'SCRIPT' }),
    head: { appendChild(n) { sandbox.document._scripts.push(n); } },
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(pack, sandbox);

let a = null, b = null, c = null;
sandbox.loadGamePack(r => { a = r; });
ok(sandbox.document._scripts.length === 1, '首次 loadGamePack 注入 1 个 <script>');
ok(/^_build\/pack-game\.js\?v21440$/.test(sandbox.document._scripts[0].src), '注入地址带 APP_VERSION 去点戳（实测 ' + sandbox.document._scripts[0].src + '）');
ok(a === null, '加载未完成前回调不触发');
sandbox.loadGamePack(r => { b = r; });
ok(sandbox.document._scripts.length === 1, '加载中再次调用不重复注入（幂等）');
sandbox.document._scripts[0].onload();
ok(a === true && b === true, '两个排队回调都收到 true');
sandbox.loadGamePack(r => { c = r; });
ok(c === true && sandbox.document._scripts.length === 1, 'ready 后同步回调 true，不再请求');

/* 失败路径：独立沙箱，保证状态干净 */
const sb2 = {
  console,
  APP_VERSION: '2.14.40',
  window: {},
  document: { _scripts: [], createElement: () => ({ tagName: 'SCRIPT' }), head: { appendChild(n) { sb2.document._scripts.push(n); } } },
};
sb2.window = sb2; sb2.global = sb2;
vm.createContext(sb2);
vm.runInContext(pack, sb2);
let f1 = 'unset', f2 = 'unset';
sb2.loadGamePack(r => { f1 = r; });
sb2.document._scripts[0].onerror();
ok(f1 === false, '失败回调 false');
sb2.loadGamePack(r => { f2 = r; });
ok(f2 === false && sb2.document._scripts.length === 1, '失败后不自动重试（避免弱网死循环）');
sb2.retryGamePack(r => { ok(r === null || r === true || r === false, 'retryGamePack 复位后重新注入'); });
ok(sb2.document._scripts.length === 2, 'retryGamePack 会再拉一次（实测 ' + sb2.document._scripts.length + ' 次）');
sb2.document._scripts[1].onload();
ok(sb2.GAMEPACK_STATE === 'ready', '重试成功后状态回到 ready');

/* 单个回调异常不影响其它等待者 */
const sb3 = { console, APP_VERSION: '2.14.40', window: {}, document: { _scripts: [], createElement: () => ({ tagName: 'SCRIPT' }), head: { appendChild(n) { sb3.document._scripts.push(n); } } } };
sb3.window = sb3; sb3.global = sb3;
vm.createContext(sb3);
vm.runInContext(pack, sb3);
let got = null;
sb3.loadGamePack(() => { throw new Error('boom'); });
sb3.loadGamePack(r => { got = r; });
sb3.document._scripts[0].onload();
ok(got === true, '一个回调抛异常不影响后面的回调');

console.log('\n[3] 接线（switchTab 的 game 分支）');
ok(/if\(typeof renderGameViews!=='function'&&typeof loadGamePack==='function'\)/.test(app), '只有「视图函数缺失」时才触发注入（已加载则零开销）');
ok(/loadGamePack\(function\(ok\)\{\s*if\(ok\)\{renderGame\(\)\}/.test(app), '注入成功后重画挑战页');
ok(/挑战模块加载失败/.test(app) && /toast\(/.test(app), '失败有 toast 提示');
ok(/id='gameRetryBtn'/.test(app) && /retryGamePack/.test(app), '失败后给一个 ≥44px 的「重试」按钮（用户可自救）');
ok(/bar\.className='speed-btn tx-btn'/.test(app), '重试按钮复用 .tx-btn（44px 触摸下限，不另写内联样式）');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

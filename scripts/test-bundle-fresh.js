#!/usr/bin/env node
/* v2.14.30（评审 P3-3）打包生成器守卫。
 * 只验证「生成器本身」的不变量，不验证产物是否已入库（产物按 .gitignore 不入库，发布前现跑）：
 *   1. build-bundle.js 能跑通；
 *   2. index.bundle.html 里外部脚本**恰好 1 个**，且用的是当前缓存戳；
 *   3. bundle.js 顶部版本戳与 index.html 一致（防止拿旧戳的产物上线）；
 *   4. bundle.js 里含 index.html 全部 55 个脚本的标记，且**顺序一致**（漏文件/乱序会直接红）；
 *   5. index.html 本身仍是逐文件加载（源码路径不被产物替换）；
 *   6. .gitignore 忽略两个产物。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const read = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }

console.log('\n[1] 生成器可跑通');
let built = true;
try { execFileSync(process.execPath, [path.join(__dirname, 'build-bundle.js'), '--quiet'], { stdio: 'pipe' }); }
catch (e) { built = false; console.log('  build-bundle.js 退出码非 0：' + (e.stderr ? e.stderr.toString() : e.message)); }
ok(built, 'node scripts/build-bundle.js 执行成功');

const html = read('index.html');
const SRC_RE = /<script src="([^"]+)\?v(\d+)"><\/script>/g;
const srcs = [...html.matchAll(SRC_RE)].map(m => ({ src: m[1], stamp: m[2] }));
const stamp = srcs.length ? srcs[0].stamp : null;

console.log('\n[2] 源码路径保持逐文件加载');
ok(srcs.length > 0, 'index.html 里仍有带戳的外部脚本（' + srcs.length + ' 个）');
ok(!/bundle\.js/.test(html), 'index.html 未被替换成 bundle（源码仍是唯一真源）');

console.log('\n[3] 产物结构与版本戳');
const bhtml = read('index.bundle.html');
const bScripts = [...bhtml.matchAll(/<script src="([^"]+)"\s*>/g)].map(m => m[1]);
ok(bScripts.length === 1, 'index.bundle.html 外部脚本 = 1（实测 ' + bScripts.length + '）');
ok(bScripts[0] === '_build/app.js?v' + stamp, '产物脚本用的是当前缓存戳 ' + stamp);
const bundle = fs.readFileSync(path.join(PAGE, '_build', 'app.js'), 'utf8');
ok(bundle.indexOf('v' + stamp + ' · 由 scripts/build-bundle.js 生成') > 0, 'app.js 顶部版本戳 = ' + stamp);
ok(fs.statSync(path.join(PAGE, '_build', 'app.js')).size > 2 * 1024 * 1024, 'app.js 体积 > 2MB（真的合进去了）');
function walkJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '_build' ? [] : walkJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}
const srcJs = walkJs(PAGE);
ok(srcJs.length === 55, 'page/（不含 _build）仍是 55 个源码 JS（实测 ' + srcJs.length + '）');
ok(!fs.existsSync(path.join(PAGE, 'bundle.js')), 'page/ 根没有遗留 bundle.js（产物只在 _build/）');

console.log('\n[4] 文件清单与顺序');
const marks = [...bundle.matchAll(/\/\* ===== ([^ ]+) ===== \*\//g)].map(m => m[1]);
ok(marks.length === srcs.length, '标记数 = 脚本数（' + marks.length + ' / ' + srcs.length + '）');
ok(marks.join(',') === srcs.map(s => s.src).join(','), '标记顺序与 index.html 逐项一致');
srcs.forEach(s => {
  if (marks.indexOf(s.src) < 0) ok(false, '缺文件：' + s.src);
});

console.log('\n[5] 产物不入库');
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok(/\/page\/_build\//.test(gi), '.gitignore 忽略 page/_build/');
ok(/\/page\/index\.bundle\.html/.test(gi), '.gitignore 忽略 page/index.bundle.html');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

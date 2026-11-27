#!/usr/bin/env node
/* 打包产物守卫（v2.14.30 建立，v2.14.31 起产物**入库并作为线上入口**）。
 *
 * 本套件的核心不是「生成器能跑」，而是**产物没有过期**：
 *   · 用源码按 build-bundle.js 的同一规则重算内容指纹，与 `page/_build/app.js` 头部 hash 比对 ——
 *     只改源码忘了重建（版本号往往也一起忘）会在这里直接红，避免线上跑旧代码。
 *   · 其余：产物的戳、脚本数量、文件顺序、源码仍是唯一真源、部署 rewrite 指向产物页。
 *
 * 注意：本套件**不重建**产物（重建会让「过期」永远测不出来）。重建请跑 node scripts/build-bundle.js。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const BUNDLE = path.join(PAGE, '_build', 'app.js');
const read = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; fails.push(msg); console.log('  ✗ ' + msg); } }

console.log('\n[1] 产物存在且与源码同步（过期守卫）');
ok(fs.existsSync(BUNDLE), 'page/_build/app.js 存在（发布前须 node scripts/build-bundle.js）');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

const html = read('index.html');
const SRC_RE = /<script src="([^"]+)\?v(\d+)"><\/script>/g;
const srcs = [...html.matchAll(SRC_RE)].map(m => ({ src: m[1], stamp: m[2] }));
const stamp = srcs.length ? srcs[0].stamp : null;

/* 与 build-bundle.js 逐字一致的合成规则，用来重算指纹 */
function recompute() {
  let out = '';
  for (const m of srcs) {
    const body = fs.readFileSync(path.join(PAGE, m.src), 'utf8')
      .replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    out += '/* ===== ' + m.src + ' ===== */\n' + body + '\n;\n';
  }
  return { out, hash: crypto.createHash('sha256').update(out).digest('hex').slice(0, 16) };
}
const fresh = recompute();
const headHash = (bundle.match(/hash:([0-9a-f]{16})/) || [])[1];
ok(!!headHash, 'app.js 头部有内容指纹（hash:…）');
ok(headHash === fresh.hash, '产物指纹与源码重算一致（' + (headHash || '-') + ' vs ' + fresh.hash + '）');
ok(bundle.indexOf(fresh.out) > 0, '产物正文与源码拼接结果逐字节包含（不是半成品）');

console.log('\n[2] 结构与版本戳');
ok(bundle.indexOf('v' + stamp + ' ·') > 0, 'app.js 顶部版本戳 = ' + stamp);
const bhtml = read('index.bundle.html');
const bScripts = [...bhtml.matchAll(/<script src="([^"]+)"\s*>/g)].map(m => m[1]);
ok(bScripts.length === 1, 'index.bundle.html 外部脚本 = 1（实测 ' + bScripts.length + '）');
ok(bScripts[0] === '_build/app.js?v' + stamp, '产物脚本用的是当前缓存戳 ' + stamp);
ok(fs.existsSync(BUNDLE) && fs.statSync(BUNDLE).size > 2 * 1024 * 1024, 'app.js 体积 > 2MB（真的合进去了）');
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

console.log('\n[3] 文件清单与顺序');
const marks = [...bundle.matchAll(/\/\* ===== ([^ ]+) ===== \*\//g)].map(m => m[1]);
ok(marks.length === srcs.length, '标记数 = 脚本数（' + marks.length + ' / ' + srcs.length + '）');
ok(marks.join(',') === srcs.map(s => s.src).join(','), '标记顺序与 index.html 逐项一致');

console.log('\n[4] 源码仍是唯一真源');
ok(srcs.length === 55, 'index.html 仍是 55 个带戳的逐文件脚本');
ok(!/_build\/app\.js/.test(html), 'index.html 未指向产物（本地/测试继续走源码）');

console.log('\n[5] 线上入口 = 产物页（v2.14.31 起）');
const vj = path.join(PAGE, 'vercel.json');
ok(fs.existsSync(vj), 'page/vercel.json 存在');
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(vj, 'utf8')); } catch (e) { ok(false, 'vercel.json 不是合法 JSON：' + e.message); }
if (cfg) {
  const rw = (cfg.rewrites || []).find(r => r && r.source === '/');
  ok(!!rw, 'rewrites 里有 source "/" 规则');
  ok(rw && /index\.bundle\.html$/.test(rw.destination || ''), '首页 rewrite 指向 index.bundle.html（实测 ' + (rw && rw.destination) + '）');
}

console.log('\n[6] 产物入库');
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok(!/\/page\/_build\//.test(gi), '.gitignore 不再忽略 page/_build/（产物需随仓库走）');
ok(!/\/page\/index\.bundle\.html/.test(gi), '.gitignore 不再忽略 page/index.bundle.html');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

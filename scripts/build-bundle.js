#!/usr/bin/env node
/* v2.14.30（评审 P3-3）：把 page/ 下 55 个脚本合成为一个产物 —— 首屏请求从 56 降到 3。
 *
 * 为什么「直接拼接」是安全的（不是想当然）：
 *   · index.html 里的 55 个 <script src> 全是**经典脚本**（非 module），它们本来共享同一个全局作用域：
 *     函数声明与 var 落到 window，顶层 const/let 进入全局词法环境 —— 与拼接成一个文件后的语义一致。
 *   · 全仓无 `document.currentScript`（已核 0 处），无「靠 script 边界做作用域隔离」的写法。
 *   · 没有文件以 `"use strict"` 作为**首条语句**（已核 0 处），所以拼接后不会丢掉指令序言；
 *     反过来，我们给每个文件**末尾**补 `\n;\n`，把「脚本边界处的自动分号插入」显式化 ——
 *     避免上一条语句少了分号、下一条以 `(` 或 `[` 开头时被合并解析。
 *   · 唯一的内联脚本是末尾 `<script>init()</script>`，位置原样保留在 bundle 之后。
 *
 * 产物：
 *   · page/_build/app.js        —— 合成脚本（不入库，见 .gitignore；放子目录是为了不被「扫 page/*.js」的守卫误伤）
 *   · page/index.bundle.html    —— 与 index.html 同构，仅把 55 个 <script> 换成 1 个
 *   · page/index.html 本身**保持原样**（源码加载路径 / 全部测试 / 本地调试都用它；
 *     是否把生产入口切到 index.bundle.html 由作者决定，见 README「部署」）
 *
 * 用法：node scripts/build-bundle.js [--quiet]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'page');
/* 产物放 page/_build/（而不是 page/ 根）：page/*.js 是「源码清单」，多个套件会
   fs.readdirSync(page).filter(.js) 扫描它们（唯一入口守卫、speed 键归属守卫等），
   根目录多一个 26k 行的合成文件会让这些守卫直接误报（v2.14.30 实测 6 套件变红）。 */
const OUT = path.join(PAGE, '_build');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8');

/* 只匹配真正带版本戳的外部脚本：<script src="xxx.js?v193"></script> */
const SCRIPT_RE = /<script src="([^"]+)\?v(\d+)"><\/script>/g;
const matches = [...html.matchAll(SCRIPT_RE)].map(m => ({ full: m[0], src: m[1], stamp: m[2] }));
if (!matches.length) { console.error('未在 index.html 里找到外部脚本标签'); process.exit(2); }

const stamp = matches[0].stamp;
let out = '';
const parts = [];
for (const m of matches) {
  const file = path.join(PAGE, m.src);
  if (!fs.existsSync(file)) { console.error('缺文件：' + m.src); process.exit(2); }
  const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  parts.push({ src: m.src, bytes: body.length });
  out += '/* ===== ' + m.src + ' ===== */\n' + body + '\n;\n';
}

/* 顶部一行说明 + 版本戳 + **内容指纹**。指纹的作用：v2.14.31 起产物入库，
   若只改了源码忘了重建（版本号往往也不变），线上的 app.js 就会是旧的 ——
   指纹可由 test-bundle-fresh.js 用源码重算比对，直接抓住「过期产物」。 */
const FINGERPRINT = require('crypto').createHash('sha256').update(out).digest('hex').slice(0, 16);
const head = '/* MyHealth bundle · v' + stamp + ' · hash:' + FINGERPRINT + ' · 由 scripts/build-bundle.js 生成，勿手改 */\n';
fs.writeFileSync(path.join(OUT, 'app.js'), head + out, 'utf8');

/* 生成 index.bundle.html：整段脚本标签替换成一条 */
const firstIdx = html.indexOf(matches[0].full);
const lastIdx = html.indexOf(matches[matches.length - 1].full) + matches[matches.length - 1].full.length;
const before = html.slice(0, firstIdx);
const between = html.slice(firstIdx, lastIdx);
const after = html.slice(lastIdx);
/* 只允许脚本标签与注释/空白夹在中间，防止误吞别的东西 */
const residue = between.replace(SCRIPT_RE, '').replace(/<!--[\s\S]*?-->/g, '').trim();
if (residue) { console.error('脚本块之间夹了非脚本内容，拒绝生成：\n' + residue.slice(0, 200)); process.exit(2); }

const oneTag = '<script src="_build/app.js?v' + stamp + '"></script>';
fs.writeFileSync(path.join(PAGE, 'index.bundle.html'), before + oneTag + after, 'utf8');

const bundleKb = Math.round(fs.statSync(path.join(OUT, 'app.js')).size / 1024);
const quiet = process.argv.includes('--quiet');
if (!quiet) {
  console.log('✔ 合成 ' + matches.length + ' 个脚本 → page/_build/app.js（' + bundleKb + ' KB）');
  console.log('✔ 生成 page/index.bundle.html（1 个 <script> + 1 个 <link>）');
  console.log('  首屏请求：' + (matches.length + 1) + ' → 2（html 本身不计入资源条目）');
  console.log('  最大单文件：' + parts.sort((a, b) => b.bytes - a.bytes).slice(0, 3).map(p => p.src + ' ' + Math.round(p.bytes / 1024) + 'KB').join(' / '));
}

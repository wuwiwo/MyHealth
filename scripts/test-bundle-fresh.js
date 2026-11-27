#!/usr/bin/env node
/* 打包产物守卫（v2.14.30 建立；v2.14.31 产物入库；v2.14.32 起产物**就是**线上入口 index.html）。
 *
 * 本套件的核心不是「生成器能跑」，而是**产物没有过期**：
 *   · 用源码按 build-bundle.js 的同一规则重算内容指纹，与 `page/_build/app.js` 头部 hash 比对 ——
 *     只改源码忘了重建（版本号往往也一起忘）会在这里直接红，避免线上跑旧代码。
 *   · 再按同一规则重算「期望的 index.html」，与磁盘上的 page/index.html 逐字节比对 ——
 *     手改产物页、或只改 index.src.html 忘了重建，同样直接红。
 *   · 其余：戳、脚本数量、文件顺序、源码仍是唯一真源、vercel.json 不再依赖失效的 rewrite。
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

const srcHtml = read('index.src.html');
const SCRIPT_RE = /<script src="([^"]+)\?v(\d+)"><\/script>/g;
const srcs = [...srcHtml.matchAll(SCRIPT_RE)].map(m => ({ src: m[1], stamp: m[2], full: m[0] }));
const stamp = srcs.length ? srcs[0].stamp : null;

/* 与 build-bundle.js 逐字一致的合成规则，用来重算指纹与期望入口页
   v2.14.36：动作数据集不进包（运行时懒加载），重算时必须同样跳过，否则指纹必然对不上 */
const LAZY_SRC = ['data/exercises-dataset.js'];
/* v2.14.40：挑战/宠物视图三个大文件移入按需包 _build/pack-game.js，主包重算时必须同样跳过 */
const PACK_SRC = ['game-views.js', 'pet-ui.js'];
function recompute() {
  let out = '';
  for (const m of srcs) {
    if (LAZY_SRC.indexOf(m.src) >= 0) continue;
    if (PACK_SRC.indexOf(m.src) >= 0) continue;
    const body = fs.readFileSync(path.join(PAGE, m.src), 'utf8')
      .replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    out += '/* ===== ' + m.src + ' ===== */\n' + body + '\n;\n';
  }
  return { out, hash: crypto.createHash('sha256').update(out).digest('hex').slice(0, 16) };
}
/* 按需包同样重算，防止只改源码忘了重建 pack */
function recomputePack() {
  let out = '';
  for (const m of srcs) {
    if (PACK_SRC.indexOf(m.src) < 0) continue;
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

console.log('\n[2] 入口 = 产物页（v2.14.32 起 page/index.html 由构建生成）');
const entry = read('index.html');
const entryScripts = [...entry.matchAll(/<script src="([^"]+)"\s*>/g)].map(m => m[1]);
ok(entryScripts.length === 1, 'index.html 外部脚本 = 1（实测 ' + entryScripts.length + '）');
ok(entryScripts[0] === '_build/app.js?v' + stamp, '入口脚本用的是当前缓存戳 ' + stamp + '（实测 ' + entryScripts[0] + '）');
/* 期望入口页：把源码页的整段脚本标签换成一条 */
const firstIdx = srcHtml.indexOf(srcs[0] ? srcs[0].full : '');
const lastIdx = srcHtml.indexOf(srcs[srcs.length - 1].full) + srcs[srcs.length - 1].full.length;
const expectEntry = srcHtml.slice(0, firstIdx) + '<script src="_build/app.js?v' + stamp + '"></script>' + srcHtml.slice(lastIdx);
ok(entry === expectEntry, 'index.html 与「源码页 + 单脚本替换」重算结果逐字节一致（未被手改）');
ok(/index\.css\?v(\d+)"/.test(entry), '入口页仍引用 index.css 且带戳');
ok(fs.existsSync(BUNDLE) && fs.statSync(BUNDLE).size > 1.2 * 1024 * 1024, 'app.js 体积 > 1.2MB（真的合进去了）');
/* v2.14.36：1161KB 数据集移出包 —— 断言体积回落且包里不含数据集内容 */
ok(fs.statSync(BUNDLE).size < 1.6 * 1024 * 1024, 'app.js < 1.6MB（数据集已移出包）');
ok(bundle.indexOf('window.EX_DATASET =') < 0, '包内不含动作数据集（懒加载）');
ok(entry.indexOf('data/exercises-dataset.js') < 0, '入口页不直接引用数据集脚本');
ok(!fs.existsSync(path.join(PAGE, 'index.bundle.html')), '旧的 page/index.bundle.html 已移除（入口只剩 index.html 一条路径）');

console.log('\n[2b] 挑战/宠物按需包（v2.14.40）');
const PACK = path.join(PAGE, '_build', 'pack-game.js');
ok(fs.existsSync(PACK), 'page/_build/pack-game.js 存在');
const packSrc = fs.existsSync(PACK) ? fs.readFileSync(PACK, 'utf8') : '';
const packFresh = recomputePack();
ok((packSrc.match(/hash:([0-9a-f]{16})/) || [])[1] === packFresh.hash, '按需包指纹与源码重算一致');
ok(packSrc.indexOf(packFresh.out) > 0, '按需包正文与三文件拼接结果逐字节包含');
ok(packSrc.indexOf('/* ===== game-views.js ===== */') > 0 && packSrc.indexOf('/* ===== pet-ui.js ===== */') > 0 && packSrc.indexOf('/* ===== pet-codex.js ===== */') < 0, '按需包含 game-views / pet-ui 两段（pet-codex 留在主包）');
ok(packSrc.indexOf('function renderGameViews') > 0, '按需包含 renderGameViews 定义');
ok(bundle.indexOf('function renderGameViews') < 0, '主包已不含 renderGameViews（真的移出了）');
ok(bundle.indexOf('function renderPetPanel') < 0, '主包已不含 renderPetPanel');
ok(fs.statSync(PACK).size > 60 * 1024 && fs.statSync(PACK).size < 130 * 1024, '按需包体积 60–130KB（实测 ' + Math.round(fs.statSync(PACK).size / 1024) + 'KB）');
ok(entry.indexOf('pack-game.js') < 0, '入口页不直接引用按需包（运行时由 game-pack.js 注入）');
ok(read('game-pack.js').indexOf('_build/pack-game.js') > 0, 'game-pack.js 的注入地址指向 _build/pack-game.js');

function walkJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '_build' ? [] : walkJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}
const srcJs = walkJs(PAGE);
ok(srcJs.length === 56, 'page/（不含 _build）仍是 56 个源码 JS（实测 ' + srcJs.length + '）');
ok(!fs.existsSync(path.join(PAGE, 'bundle.js')), 'page/ 根没有遗留 bundle.js（产物只在 _build/）');

console.log('\n[3] 文件清单与顺序');
const marks = [...bundle.matchAll(/\/\* ===== ([^ ]+) ===== \*\//g)].map(m => m[1]);
ok(marks.length === srcs.length - LAZY_SRC.length - PACK_SRC.length, '标记数 = 打包脚本数（' + marks.length + ' / ' + (srcs.length - LAZY_SRC.length - PACK_SRC.length) + '）');
ok(marks.join(',') === srcs.filter(s => LAZY_SRC.indexOf(s.src) < 0 && PACK_SRC.indexOf(s.src) < 0).map(s => s.src).join(','), '标记顺序与 index.src.html 逐项一致（已去掉懒加载项与按需包文件）');

console.log('\n[4] 源码页仍是唯一真源');
ok(srcs.length === 56, 'index.src.html 仍是 56 个带戳的逐文件脚本（实测 ' + srcs.length + '）');
const uniq = [...new Set(srcs.map(s => s.stamp))];
ok(uniq.length === 1, 'index.src.html 全部标签用同一戳（实测 ' + uniq.join(',') + '）');
ok(!/_build\/app\.js/.test(srcHtml), 'index.src.html 未指向产物（本地/测试继续走源码）');

console.log('\n[5] 部署配置');
const vj = path.join(PAGE, 'vercel.json');
ok(fs.existsSync(vj), 'page/vercel.json 存在');
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(vj, 'utf8')); } catch (e) { ok(false, 'vercel.json 不是合法 JSON：' + e.message); }
if (cfg) {
  ok(!cfg.rewrites || !cfg.rewrites.some(r => r && r.source === '/'),
    '不再声明 source "/" 的 rewrite（Vercel 静态站点实测不生效，v2.14.31 已证伪）');
  ok(cfg.outputDirectory === '.', 'outputDirectory 仍为 "."');
}

console.log('\n[6] 产物入库');
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok(!/\/page\/_build\//.test(gi), '.gitignore 不忽略 page/_build/（产物需随仓库走）');
ok(!/(^|\n)\/page\/index\.html\b/.test(gi), '.gitignore 不忽略 page/index.html（它现在是线上入口）');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }

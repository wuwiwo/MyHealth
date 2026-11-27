#!/usr/bin/env node
/* 模块依赖审计（只读）：回答「还能不能再切一批懒加载」。
   为什么需要它：v2.14.36 把动作数据集（1161KB）移出首包后，评审 §23.4 记了唯一未决项
   「冷启动仍 491KB 整包，下一刀需模块依赖分析」。本脚本把这件事量出来，结论固化，避免每次复评重猜。
   量法：提取 page/*.js 的顶层函数 → 统计每个函数在「其它文件」里的引用 → 分清
   ① 只被挑战/战斗/宠物路径引用（可随包懒加载）；② 被首屏路径（app/sync/训练/个人/设置）引用（必须首屏在）。
   用法：node scripts/audit-module-deps.js [--json] */
'use strict';
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'page');
const GAME_ISH = /^(game-|battle-|pet-|skill-|codex|level-|challenge|orb-|trial|summon)/;
const files = fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).sort();
const src = {}; for (const f of files) src[f] = fs.readFileSync(path.join(PAGE, f), 'utf8');
const isGame = f => GAME_ISH.test(f.replace(/\.js$/, ''));

const exportsOf = {};
for (const f of files) {
  const names = new Set();
  for (const m of src[f].matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(m[1]);
  for (const m of src[f].matchAll(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*function/gm)) names.add(m[1]);
  exportsOf[f] = names;
}

/* 引用矩阵：函数名 → { 调用方文件: 次数 }（只算名字长度 ≥6，避免 p/has/dl 之类误伤） */
const refs = {};
for (const caller of files) {
  for (const [owner, names] of Object.entries(exportsOf)) {
    if (owner === caller) continue;
    for (const n of names) {
      if (n.length < 6) continue;
      const c = (src[caller].match(new RegExp('\\b' + n + '\\b', 'g')) || []).length;
      if (!c) continue;
      (refs[n] = refs[n] || { owner, callers: {} }).callers[caller] = c;
    }
  }
}

const KB = f => Math.round(src[f].length / 1024);
let gameKB = 0, allKB = 0;
for (const f of files) { allKB += src[f].length / 1024; if (isGame(f)) gameKB += src[f].length / 1024; }

const rows = [];
for (const f of files.filter(isGame)) {
  const names = [...exportsOf[f]].filter(n => n.length >= 6);
  const leaked = names.filter(n => { const r = refs[n]; return r && Object.keys(r.callers).some(c => !isGame(c)); });
  const clean = names.filter(n => !refs[n] || !Object.keys(refs[n].callers).some(c => !isGame(c)));
  const leakCallers = {};
  for (const n of leaked) for (const [c, k] of Object.entries(refs[n].callers)) if (!isGame(c)) leakCallers[c] = (leakCallers[c] || 0) + k;
  rows.push({ file: f, kb: KB(f), fns: names.length, leaked: leaked.length, clean: clean.length, leakCallers, leakNames: leaked.slice(0, 8) });
}
rows.sort((a, b) => b.kb - a.kb);

/* 判定：一个大文件能不能整体懒加载，看它有没有「首屏路径」的调用方 */
const FIRST_SCREEN = new Set(['app.js', 'sync.js', 'tab-strength.js', 'tab-profile.js', 'tab-settings.js', 'tab-cardio.js', 'tab-game.js', 'utils.js', 'state-core.js']);
const verdict = rows.map(r => {
  const fs9 = Object.keys(r.leakCallers).filter(c => FIRST_SCREEN.has(c));
  return { file: r.file, kb: r.kb, firstScreenCallers: fs9, otherCallers: Object.keys(r.leakCallers).filter(c => !FIRST_SCREEN.has(c)), lazyable: fs9.length === 0 };
});
const lazyable = verdict.filter(v => v.lazyable && v.kb >= 20);
const blocked = verdict.filter(v => !v.lazyable && v.kb >= 20);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ gameKB: Math.round(gameKB), allKB: Math.round(allKB), lazyable, blocked }, null, 1));
} else {
  console.log('game 系体量：' + Math.round(gameKB) + ' KB / 全部 ' + Math.round(allKB) + ' KB（' + Math.round(gameKB / allKB * 100) + '%）\n');
  console.log('| 文件 | 体积 | 首屏路径调用方 | 判定 |');
  console.log('|---|---|---|---|');
  for (const v of verdict.slice(0, 12)) {
    console.log('| ' + v.file + ' | ' + v.kb + ' KB | ' + (v.firstScreenCallers.length ? v.firstScreenCallers.join(' / ') : '—（无）') + ' | ' + (v.lazyable ? '可整体懒加载' : '**被首屏挡住**') + ' |');
  }
  console.log('\n可整体懒加载且 ≥20KB：' + (lazyable.length ? lazyable.map(v => v.file + '(' + v.kb + 'KB)').join(', ') : '无'));
  console.log('被首屏路径挡住的 ≥20KB：' + (blocked.length ? blocked.map(v => v.file + '(' + v.kb + 'KB)').join(', ') : '无'));
}

/* 断言：结论要能自动守住，避免「以为能切其实不能」 */
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('\n判定断言：');
ok(rows.length >= 15, 'game 系文件 ≥15 个（实际 ' + rows.length + '）');
ok(blocked.some(v => v.file === 'game-render.js'), 'game-render.js 被首屏路径挡住（renderGame / updateGameBar 在 app/sync）');
ok(blocked.some(v => v.file === 'battle-group.js'), 'battle-group.js 被战斗核心（skill/status/ai/terrain）双向耦合');
const lazyKB = lazyable.reduce((s, v) => s + v.kb, 0);
ok(lazyKB / allKB < 0.15, '可干净懒加载的体量 < 15% 源码（实际 ' + Math.round(lazyKB) + 'KB / ' + Math.round(lazyKB / allKB * 100) + '%）');
process.exit(fail ? 1 : 0);

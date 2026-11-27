#!/usr/bin/env node
/* v2.14.39：内联样式纪律（评审 §22.4 ④ 第一刀的守门断言）
   ① 已抽成 .tx-* 的 22 种重复串，不得再以 style="" 的形式回到 page/*.js；
   ② index.css 必须真的定义了这 22 个类，且属性与约定一致；
   ③ 内联 var() 的总处数设上限（只能降不能涨），防止抽完又慢慢长回来。
   用法：node scripts/test-inline-style-discipline.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(' ✗ ' + msg); } };

/* 约定：归一化（按 ; 拆分排序）后的属性串 → 类名，与 _tmp 里的抽类脚本、index.css 同源 */
const MAP = {
  'color:var(--text3);font-size:var(--fs-3xs)': 'tx-hint',
  'color:var(--text3)': 'tx-dim',
  'color:var(--green)': 'tx-ok',
  'color:var(--text3);font-size:var(--fs-xs)': 'tx-note',
  'font-size:var(--fs-3xs)': 'tx-3xs',
  'font-size:var(--fs-xs)': 'tx-xs',
  'font-size:var(--fs-base)': 'tx-base',
  'font-size:var(--fs-lg);font-weight:700': 'tx-h',
  'font-size:var(--fs-base);font-weight:700': 'tx-b',
  'font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px': 'tx-sec',
  'color:var(--orange)': 'tx-warn',
  'color:var(--red)': 'tx-err',
  'color:var(--text3);font-size:var(--fs-2xs)': 'tx-sub',
  'color:var(--text3);font-size:var(--fs-2xs);margin-bottom:6px': 'tx-sub-mb',
  'color:var(--text3);font-size:var(--fs-3xs);font-weight:400': 'tx-hint-soft',
  'color:var(--text3);font-weight:400': 'tx-dim-soft',
  'color:var(--text2);font-size:var(--fs-2xs)': 'tx-muted',
  'color:var(--text2)': 'tx-muted-only',
  'color:var(--green);font-size:var(--fs-3xs)': 'tx-ok-3xs',
  'font-size:var(--fs-sm);min-height:44px;padding:10px 12px': 'tx-btn',
  'font-size:var(--fs-sm);min-height:44px;padding:8px 10px': 'tx-btn-sm',
  'font-size:var(--fs-base);min-height:44px;min-width:44px;padding:10px 12px': 'tx-tap'
};
const norm = s => s.replace(/;+$/, '').split(';').map(x => x.trim()).filter(Boolean).sort().join(';');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const css = fs.readFileSync(path.join(PAGE, 'index.css'), 'utf8');

/* ① 回潮检查 */
let reappear = [];
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(PAGE, f), 'utf8');
  const re = /style\s*=\s*("(?:[^"\\]|\\.)*")/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = norm(m[1].slice(1, -1));
    if (MAP[key]) reappear.push(f + ' :: ' + key);
  }
}
ok(reappear.length === 0, '22 种已抽类串不得再以内联 style 回到 .js（实际 ' + reappear.length + ' 处' + (reappear.length ? '：' + reappear.slice(0, 3).join(' | ') : '') + '）');

/* ② CSS 定义检查 */
for (const [key, cls] of Object.entries(MAP)) {
  const body = '.' + cls + '{';
  const idx = css.indexOf(body);
  if (idx < 0) { ok(false, 'index.css 缺少 .' + cls); continue; }
  const decl = css.slice(idx + body.length, css.indexOf('}', idx));
  const declNorm = norm(decl);
  const keyNorm = key;
  /* 属性集合与顺序无关：按 ; 拆分排序比较，允许 CSS 里多写 var 的默认值等 */
  const same = declNorm === keyNorm;
  ok(same, '.' + cls + ' 的定义与约定一致（期望 ' + key + '，实际 ' + decl + '）');
}

/* ③ 内联 var() 上限：抽类前 441 处 → 抽后应 ≤ 300，防止反弹 */
let inlineVar = 0;
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(PAGE, f), 'utf8');
  const re = /style\s*=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let m;
  while ((m = re.exec(src)) !== null) if (m[0].indexOf('var(--') >= 0) inlineVar++;
}
ok(inlineVar <= 300, '内联 var() 处数 ≤ 300（实际 ' + inlineVar + '，抽类前 441）');

/* ④ 工具类前缀不与组件类撞名 */
const declared = [...css.matchAll(/^\.tx-[\w-]+\{/gm)].map(m => m[0].slice(1, -1));
ok(declared.length === Object.keys(MAP).length, 'index.css 里 .tx-* 类数量 = 22（实际 ' + declared.length + '）');
ok(new Set(declared).size === declared.length, '.tx-* 类无重复定义');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);

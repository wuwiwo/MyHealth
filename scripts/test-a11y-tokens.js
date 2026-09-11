#!/usr/bin/env node
/* 设计令牌 / 无障碍 回归护栏（v2.1.0）
   纯文本解析，不需要 DOM。防三类事故复发：
     1. CSS 自定义属性循环引用（v2.1.0 出过 --blue:var(--blue)，深色主题下整个 --blue 失效）
     2. 主题色对比度跌破 WCAG 2.1 AA
     3. 内联字号回潮、触控目标缩水、aria 引用悬空
   Run: node scripts/test-a11y-tokens.js */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }

const ROOT = path.join(__dirname, '..', 'page');
const css = fs.readFileSync(path.join(ROOT, 'index.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- 工具：解析 CSS 自定义属性 ---------- */
function blockBody(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const s = css.indexOf('{', i), e = css.indexOf('}', s);
  return css.slice(s + 1, e);
}
/** 解析一个声明块内所有 --token: value（先剥掉注释，否则首个声明会被前缀注释带偏） */
function decls(body) {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = {};
  for (const d of clean.split(';')) {
    const mm = /^\s*--([A-Za-z0-9_-]+)\s*:\s*([^;]+)$/.exec(d.trim());
    if (mm) m[mm[1]] = mm[2].trim();
  }
  return m;
}
/** 收集全文所有 --token 定义（跨块合并，用于「是否定义过」判定） */
const ALL_DEFS = (() => {
  const m = {};
  for (const mm of css.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g)) {
    if (!(mm[1] in m)) m[mm[1]] = mm[2].trim();
  }
  return m;
})();
/** 解析 var() 链，返回 {val, cycle} */
function resolve(name, defs, seen) {
  seen = seen || {};
  if (seen[name]) return { val: null, cycle: true };
  seen[name] = 1;
  const raw = defs[name];
  if (raw == null) return { val: null, cycle: false };
  const v = /^var\(\s*--([A-Za-z0-9_-]+)\s*\)$/.exec(raw.trim());
  if (v) return resolve(v[1], defs, seen);
  return { val: raw, cycle: false };
}

/* ---------- 1. 循环 / 未定义引用 ---------- */
console.log('\n[1] CSS 自定义属性：循环与未定义引用');
const cycles = [];
for (const d of css.split(/[;{}]/)) {
  const m = /^\s*--([A-Za-z0-9_-]+)\s*:\s*var\(\s*--([A-Za-z0-9_-]+)\s*\)\s*$/.exec(d.trim());
  if (m && m[1] === m[2]) cycles.push('--' + m[1]);
}
ok(cycles.length === 0, '无自引用循环' + (cycles.length ? ' → ' + cycles.join(', ') : '（曾出 --blue:var(--blue)）'));

const dangling = new Set();
for (const mm of css.matchAll(/var\(\s*--([A-Za-z0-9_-]+)\s*(?:,)?/g)) {
  if (!(mm[1] in ALL_DEFS) && !/^fs-|sp-/.test(mm[1])) dangling.add('--' + mm[1]);
}
// 只校验本文件内可能拼写错的（排除外部注入）
const danglingReal = [...dangling].filter(t => css.split(t).length > 1);
ok(danglingReal.length === 0, 'var() 引用的令牌均有定义' + (danglingReal.length ? ' → ' + danglingReal.join(', ') : ''));

/* ---------- 2. 令牌完整性 ---------- */
console.log('\n[2] 设计令牌完整性');
const rootDefs = decls(blockBody(':root'));
const REQUIRED = [
  '--surface', '--surface-2', '--surface-3', '--bd', '--bd-l',
  '--text', '--text2', '--text3', '--brand-fill', '--on-brand',
  '--on-dark-text', '--on-dark-text2', '--on-dark-text3',
  '--sat', '--sab', '--sal', '--sar',
  '--sp-1', '--sp-4', '--sp-6', '--sp-12',
  '--fs-3xs', '--fs-2xs', '--fs-xs', '--fs-sm', '--fs-base', '--fs-md',
  '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl', '--fs-hero',
  '--rad-sm', '--rad-lg', '--rad-full', '--sh-1', '--sh-3',
  '--z-decor', '--z-sticky', '--z-modal', '--z-toast',
  '--dur-1', '--dur-3', '--ease-std', '--ease-out',
  '--mw', '--tabbar-h', '--touch-min', '--pad-screen',
  '--brand-rgb', '--danger-rgb', '--chip-a'
];
const missing = REQUIRED.filter(t => !(t.slice(2) in rootDefs));
ok(missing.length === 0, '必需令牌 ' + REQUIRED.length + ' 个全部定义' + (missing.length ? ' 缺: ' + missing.join(', ') : ''));

ok(resolve('touch-min', rootDefs).val === '44px', '--touch-min = 44px（实测 ' + resolve('touch-min', rootDefs).val + '）');
ok(resolve('tabbar-h', rootDefs).val === '48px', '--tabbar-h = 48px');
ok(resolve('bg2', rootDefs, {}).val === resolve('surface', rootDefs, {}).val && rootDefs.bg2 === 'var(--surface)',
  '--bg2 仍别名到 --surface（旧代码零改动，实测 ' + resolve('bg2', rootDefs, {}).val + '）');

/* ---------- 3. 对比度 WCAG 2.1 AA ---------- */
console.log('\n[3] 对比度（WCAG 2.1 AA：正文 4.5:1，大字 3:1）');
function toRgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lum(rgb) {
  const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(fg, bg) {
  const l1 = lum(toRgb(fg)), l2 = lum(toRgb(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const lightDefs = Object.assign({}, rootDefs, decls(blockBody('[data-theme="light"]')));
const onDarkBg = '#0b1120';

// [前景, 背景, 阈值, 说明]
const CASES = [
  ['text', 'surface', 4.5, '主文字 / 表面'],
  ['text2', 'surface', 4.5, '次要文字 / 表面'],
  ['text3', 'surface', 4.5, '弱化文字 / 表面（12px，不适用大字豁免）'],
  ['text3', 'surface-2', 4.5, '弱化文字 / 次级表面'],
  ['on-brand', 'brand-fill', 4.5, '实心按钮前景 / 橙底（曾为 white → 2.80:1）'],
  ['blue', 'surface', 4.5, '--blue 深色主题（曾为自引用循环 → 失效）'],
  ['green', 'surface', 4.5, '成功色 / 表面'],
  ['red', 'surface', 4.5, '危险色 / 表面']
];
for (const [name, defs, label] of [['深色', rootDefs, 'dark'], ['浅色', lightDefs, 'light']]) {
  let worst = 99, worstName = '';
  for (const [fg, bg, min, desc] of CASES) {
    let f = resolve(fg, defs).val, b = resolve(bg, defs).val;
    if (!f || !b || !/^#[0-9a-f]{3,8}$/i.test(f) || !/^#[0-9a-f]{3,8}$/i.test(b)) {
      ok(false, label + ' ' + desc + ' 无法解析（--' + fg + '=' + f + ' / --' + bg + '=' + b + '）');
      continue;
    }
    const r = ratio(f, b);
    if (r < worst) { worst = r; worstName = desc; }
    ok(r >= min, label + ' ' + desc + ' = ' + r.toFixed(2) + ':1（≥' + min + '）');
  }
  // 固定深底容器（分享卡）
  const sc1 = ratio(resolve('on-dark-text', defs).val || '#f1f5f9', onDarkBg);
  const sc3 = ratio(resolve('on-dark-text3', defs).val || '#94a3b8', onDarkBg);
  ok(sc1 >= 4.5, label + ' 分享卡主文字 / 深底 = ' + sc1.toFixed(2) + ':1（曾 2.07:1）');
  ok(sc3 >= 4.5, label + ' 分享卡弱化文字 / 深底 = ' + sc3.toFixed(2) + ':1');
  console.log('   ' + label + '最弱项: ' + worstName + ' ' + worst.toFixed(2) + ':1');
}

/* ---------- 4. 触控目标 ---------- */
console.log('\n[4] 触控目标');
const touchRules = (css.match(/min-height:var\(--touch-min\)/g) || []).length;
ok(touchRules >= 6, '使用 --touch-min 的规则 ' + touchRules + ' 处（≥6）');
ok(/#dsCatRow\s+\.car-type[^{]*\{[^}]*min-height:36px/.test(css),
  '密集筛选条 #dsCatRow .car-type 显式降级 36px（有意为之，非遗漏）');

/* ---------- 5. 字号令牌化 ---------- */
console.log('\n[5] 字号令牌化');
const ALLOW = new Set(['4rem', '5rem', '.85em']); // 装饰大数字 + 相对值
const relapses = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const mm of src.matchAll(/font-size:\s*([0-9.]+(?:rem|px|em))/g)) {
    if (!ALLOW.has(mm[1])) relapses.push(f + ' → ' + mm[1]);
  }
}
ok(relapses.length === 0, 'JS 内联字号全部令牌化' + (relapses.length ? '（残留 ' + relapses.length + ' 处: ' + relapses.slice(0, 5).join(', ') + '）' : ''));
const tokenUses = (fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/var\(--fs-/g) || []).length, 0));
ok(tokenUses > 250, '字阶令牌引用 ' + tokenUses + ' 处（>250）');

/* ---------- 6. aria 引用 ---------- */
console.log('\n[6] aria 引用完整性');
const orphan = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ids = new Set([...src.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
  for (const mm of src.matchAll(/aria-labelledby="([A-Za-z0-9_-]+)"/g)) {
    if (!ids.has(mm[1])) orphan.push(f + ' → #' + mm[1]);
  }
}
ok(orphan.length === 0, 'aria-labelledby 均有对应 id' + (orphan.length ? '（悬空: ' + orphan.join(', ') + '）' : ''));

// label for → 同文件存在该 id
const orphanFor = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ids = new Set([...src.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
  for (const mm of src.matchAll(/<label[^>]*\sfor="([A-Za-z0-9_-]+)"/g)) {
    if (!ids.has(mm[1])) orphanFor.push(f + ' → #' + mm[1]);
  }
}
ok(orphanFor.length === 0, '<label for> 均有对应 id' + (orphanFor.length ? '（悬空: ' + orphanFor.join(', ') + '）' : ''));

/* ---------- 7. 视口与语义 ---------- */
console.log('\n[7] 视口与语义层');
const vp = /<meta name="viewport" content="([^"]+)"/.exec(html);
ok(vp && /width=device-width/.test(vp[1]), 'viewport width=device-width');
ok(vp && !/user-scalable\s*=\s*no/.test(vp[1]) && !/maximum-scale/.test(vp[1]),
  '未禁用缩放（WCAG 1.4.4）');
ok(vp && /viewport-fit=cover/.test(vp[1]), 'viewport-fit=cover（安全区生效前提）');
const tabs = (html.match(/role="tab"/g) || []).length;
const tablists = (html.match(/role="tablist"/g) || []).length;
ok(tabs >= 10, 'role="tab" ' + tabs + ' 个（≥10）');
ok(tablists >= 4, 'role="tablist" ' + tablists + ' 个（≥4：5 个导航区）');
ok(/role="tablist"/.test(html), '存在 role="tablist"');
ok(/aria-live="polite"/.test(html), '存在 aria-live 区域');

/* ---------- 8. 空 catch ---------- */
console.log('\n[8] 静默异常');
// 允许三种「非静默」形态：打了 console.* 日志、有用户可见反馈（toast），
// 或写了「忽略」说明。catch 体用花括号配对扫描，避免 [^{}]* 在嵌套块上误判。
function catchBodies(src) {
  const out = [];
  const re = /catch\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === "'" || c === '`') { // 跳过字符串里的花括号
        const q = c; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      }
      i++;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, body: src.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}
const silent = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const cb of catchBodies(src)) {
    const b = cb.body;
    if (!/console\./.test(b) && !/toast\s*\(/.test(b) && !/notifyQuota\s*\(/.test(b) && !/忽略/.test(b)) {
      silent.push(f + ':' + cb.line + ' → ' + b.replace(/\s+/g, ' ').trim().slice(0, 40));
    }
  }
}
ok(silent.length === 0, '无静默 catch（均带日志/用户反馈/「忽略」说明）'
  + (silent.length ? '\n     ' + silent.join('\n     ') : ''));

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail === 0 ? 0 : 1);

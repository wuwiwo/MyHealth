'use strict';
/* 按需包调用守卫检查（v2.14.41 入库为正式测试）
   规则（design-tokens §23.1 第 2 条）：首包文件调用按需包（game-views / pet-ui）里的函数，
   必须能证明「包未到位时不会炸」——三种可接受形态：
     1) 同一行有 typeof 守卫；
     2) 上文 8 行（同一函数体内）出现过 typeof 该函数 的判断；
     3) 该调用位于注释文本里（行首为 * / /* / // ，或整行是中文说明）。
   其余一律判缺守卫。 */
const fs = require('fs');
const path = require('path');
const PAGE = 'page';
const PACK = ['game-views.js', 'pet-ui.js'];

const files = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const src = {};
for (const f of files) src[f] = fs.readFileSync(path.join(PAGE, f), 'utf8');

const names = new Set();
for (const f of PACK) {
  for (const m of src[f].matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) if (m[1].length >= 5) names.add(m[1]);
  for (const m of src[f].matchAll(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*function/gm)) if (m[1].length >= 5) names.add(m[1]);
}

const CJK = /[\u4e00-\u9fff]/;
const isComment = line => /^\s*(\*|\/\/|<\/?!--)/.test(line) && CJK.test(line);
const bad = [];
let checked = 0;

for (const f of files) {
  if (PACK.indexOf(f) >= 0) continue;
  const lines = src[f].split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const n of names) {
      if (new RegExp('^\\s*(function|var|const|let)\\s+' + n).test(line)) continue;
      if (!new RegExp('\\b' + n + '\\s*\\(').test(line)) continue;
      checked++;
      /* 1) 同行 typeof */
      if (new RegExp('typeof\\s+' + n).test(line)) continue;
      /* 3) 注释行 */
      const t = line.trim();
      if (isComment(line) || (/^\s*\*/).test(line)) continue;
      if (CJK.test(t) && !/typeof|function|return|if|var/i.test(t.split(CJK.exec(t)[0])[0] || '')) continue;
      /* 2) 上文 8 行 typeof */
      let guarded = false;
      for (let k = Math.max(0, i - 8); k < i; k++) if (new RegExp('typeof\\s+' + n).test(lines[k])) { guarded = true; break; }
      if (guarded) continue;
      bad.push(f + ':' + (i + 1) + '  ' + t.slice(0, 110));
    }
  });
}

console.log('按需包（' + PACK.join(' / ') + '）导出函数 ' + names.size + ' 个，首包内疑似调用点 ' + checked + ' 处');
if (!bad.length) { console.log('✓ 全部可证明安全（同行 typeof / 上文守卫 / 注释文本）'); process.exit(0); }
console.log('✗ 缺守卫 ' + bad.length + ' 处：');
bad.forEach(b => console.log('  ' + b));
process.exit(1);

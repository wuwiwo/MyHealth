#!/usr/bin/env node
/* v2.4.10 附：pre-commit 版本校验钩子（scripts/check-release.js）回归测试
 *
 * 背景（2026-10-05 实测发现）：
 *   旧实现在**沙箱环境**里会**静默跳过**版本校验 ——
 *   部分沙箱禁止 node spawn 子进程（execSync / execFileSync 均抛 EBUSY、stdout 为空），
 *   而旧代码的 catch 把失败压成空字符串，导致：
 *       staged 恒为空 → utilsChanged=false → 打印「utils.js 未变更，跳过版本校验」
 *   **输出看起来像通过，实际校验从未执行**。
 *
 * 本测试锁住三件事：
 *   ① `lines()` 能正确切分并去掉 \r（core.autocrlf=true 时的 CRLF 残留）
 *   ② `sh()` 必须**区分**「命令跑了」与「命令没跑起来」（返回 {ok} 而非裸字符串）
 *   ③ 源码里不得再出现「把 spawn 失败压成空串」的写法，且必须有显式告警分支
 *
 * Run: node scripts/test-release-hook.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(ROOT, 'scripts', 'check-release.js');
const SRC = fs.readFileSync(HOOK, 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const hook = require(HOOK);

/* ================================================================
   ① lines() —— 切分 + 去 \r
   ================================================================ */
console.log('\n[1] lines() 切分与 \\r 处理');
assert('导出 lines / sh / probeGit', typeof hook.lines === 'function' && typeof hook.sh === 'function' && typeof hook.probeGit === 'function');

assert('LF 正常切分', JSON.stringify(hook.lines({ out: 'a\nb\nc' })) === '["a","b","c"]',
  JSON.stringify(hook.lines({ out: 'a\nb\nc' })));
/* ⭐ 关键：core.autocrlf=true 时 git 输出可能带 \r，旧实现会把 "page/utils.js\r" 当成文件名 */
const crlf = hook.lines({ out: 'README.md\r\npage/utils.js\r\nscripts/x.js' });
assert('CRLF 去掉行尾 \\r（否则 page/utils.js 匹配不上）', JSON.stringify(crlf) === '["README.md","page/utils.js","scripts/x.js"]',
  JSON.stringify(crlf));
assert('CRLF 结果里确实包含裸的 page/utils.js', crlf.includes('page/utils.js'));
assert('CRLF 结果里不含带 \\r 的条目', crlf.every(s => !s.endsWith('\r')));
assert('末尾换行不产生空条目', JSON.stringify(hook.lines({ out: 'a\nb\n' })) === '["a","b"]');
assert('空输出 → 空数组', JSON.stringify(hook.lines({ out: '' })) === '[]');
assert('中间空行被过滤', JSON.stringify(hook.lines({ out: 'a\r\n\r\nb' })) === '["a","b"]',
  JSON.stringify(hook.lines({ out: 'a\r\n\r\nb' })));

/* ================================================================
   ② sh() —— 必须区分「跑了」与「没跑起来」
   ================================================================ */
console.log('\n[2] sh() 返回结构（关键：失败不得被压成空串）');
const r = hook.sh('git --version');
assert('sh() 返回对象且含 ok 字段（不再返回裸字符串）',
  r !== null && typeof r === 'object' && typeof r.ok === 'boolean', JSON.stringify(r));
assert('sh() 返回对象且含 out 字段（字符串）', typeof r.out === 'string', typeof r.out);

/* 本机是否为「node 不能 spawn 子进程」的沙箱环境 —— 实测两种都覆盖到 */
const spawnBlocked = !r.ok;
console.log('    （本环境 node spawn 子进程：' + (spawnBlocked ? '被禁止 → ok=false' : '可用 → ok=true') + '）');
if (spawnBlocked) {
  assert('spawn 失败时 ok=false（而非 ok=true + 空串）', r.ok === false, JSON.stringify(r));
  assert('spawn 失败时 out 为空串', r.out === '', JSON.stringify(r.out));
} else {
  assert('spawn 可用时 ok=true 且 out 含版本号', r.ok === true && /git version/i.test(r.out), JSON.stringify(r));
}

/* ================================================================
   ③ probeGit() 与 sh() 一致
   ================================================================ */
console.log('\n[3] probeGit()');
assert('probeGit() 返回 boolean', typeof hook.probeGit() === 'boolean');
assert('probeGit() 与 sh("git --version").ok 一致',
  hook.probeGit() === (r.ok && /^git version/i.test(r.out)));

/* ================================================================
   ④ 源码守卫：反「静默跳过」
   ================================================================ */
console.log('\n[4] 源码守卫（反静默跳过）');
assert('旧写法「catch 里 return (e.stdout || "").trim()」已不存在',
  !/return \(e\.stdout \|\| ''\)\.trim\(\)/.test(SRC));
assert('sh() 显式返回 {ok, out} 结构', /return \{ ok: true, out:/.test(SRC) && /return \{ ok: false, out:/.test(SRC));
assert('存在 git 可用性探测 probeGit', /function probeGit\(\)/.test(SRC));
assert('存在「未执行 ≠ 通过」的显式告警文案', /未执行/.test(SRC) && /≠ 通过/.test(SRC));
assert('告警分支明确说明「不阻断提交」', /不阻断提交/.test(SRC));
assert('暂存列表解析走 lines()（统一去 \\r）', /lines\(sh\('git diff --cached --name-only'\)\)/.test(SRC));
assert('main() 被 require.main 守卫（便于单测且不误执行）', /require\.main === module/.test(SRC));
assert('导出了 sh / lines / probeGit', /module\.exports = \{ sh, lines, probeGit \}/.test(SRC));

console.log('\n[4.1] 反静默跳过（第二处：读不到 HEAD 版本号）');
assert('读不到 oldVer 时单独分支告警，不与「版本未变化」合并',
  /if \(!oldVer\) \{/.test(SRC) && !/if \(!oldVer \|\| oldVer === newVer\)/.test(SRC));
assert('该分支明说「未执行 ≠ 通过」', /无法比较版本变化[\s\S]{0,120}未执行/.test(SRC));

console.log('\n============================');
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);

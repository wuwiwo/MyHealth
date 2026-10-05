#!/usr/bin/env node
/**
 * MyHealth — pre-commit release check
 * 
 * 版本纪律校验（AGENTS.md Version discipline）：
 * 每次修改 page/utils.js 中的 APP_VERSION 时，必须同步更新：
 *   1. doc/changelog-vX.X.md（新增版本章节 + 架构演化表）
 *   2. README.md（顶部副标题版本号 + 版本历史表格 + 当前版本指向）
 * 
 * 若版本号变更但文档未同步 → 阻止提交（exit 1）。
 * 跳过场景：--no-verify / 未改版本号 / 初始提交。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* 执行 shell 命令，**显式区分「命令跑了」与「命令根本没跑起来」**。
   返回 { ok, out }：
     ok=true  → 命令正常执行（退出码 0），out 为其输出
     ok=false → spawn 失败（如沙箱禁止 spawn cmd.exe → EBUSY），out 通常为空
   ⚠️ 不能把两者都简化成「空字符串」—— 那会让后续判定把「无法查询」
      误当成「没有暂存内容」，从而**静默跳过**版本校验（见 gitOk 探测）。 */
function sh(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
    return { ok: true, out: String(out).trim() };
  } catch (e) {
    const s = (e && e.stdout != null) ? String(e.stdout).trim() : '';
    return { ok: false, out: s };
  }
}

/* 把多行输出切成数组，并去掉 Windows 下可能残留的 \r（core.autocrlf=true 时） */
function lines(res) {
  return res.out.split('\n').map(s => s.replace(/\r$/, '')).filter(Boolean);
}

/* 🚨 git 可用性探测（2026-10-05 实测补入）
   本仓库有多个 AI 在**沙箱环境**里提交。部分沙箱禁止 node spawn 任何子进程
   （execSync / execFileSync 均抛 EBUSY、stdout 为空）→ 旧实现的 catch 返回 '' →
   staged 恒为空 → 每次都打印「utils.js 未变更，跳过版本校验」，
   **版本纪律校验从未真正执行，而输出看起来像通过**。
   这里把「git 不可用」单独识别出来，改为**显式告警**，杜绝静默跳过。 */
function probeGit() {
  const p = sh('git --version');
  return p.ok && /^git version/i.test(p.out);
}

function main() {
  if (!probeGit()) {
    console.log('');
    console.log('⚠️  pre-commit: 无法调用 git（沙箱/环境限制，execSync 失败）');
    console.log('   → 暂存内容无法判定，本次版本纪律校验**未执行**（注意：未执行 ≠ 通过）。');
    console.log('   若本次改动了 page/utils.js 的 APP_VERSION，请人工确认已同步：');
    console.log('     1. README.md（副标题版本号 / 版本历史表格 / 当前版本指针）');
    console.log('     2. doc/changelog-vX.X.md（新增 "## vX.X.X" 章节 + 架构演化表）');
    console.log('   不阻断提交（环境问题不应阻塞开发），但请勿把它当成「已校验」。');
    console.log('');
    process.exit(0);
  }

  // 本次暂存的文件列表
  const staged = lines(sh('git diff --cached --name-only'));
  const utilsChanged = staged.includes('page/utils.js');
  if (!utilsChanged) {
    console.log('✓ pre-commit: utils.js 未变更，跳过版本校验');
    process.exit(0);
  }

  // 对比 HEAD 与工作区的 APP_VERSION
  let oldVer = '';
  try {
    const oldContent = sh('git show HEAD:page/utils.js').out;
    const m = oldContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
    oldVer = m ? m[1] : '';
  } catch (e) { oldVer = ''; }

  const newContent = fs.readFileSync(path.join(ROOT, 'page/utils.js'), 'utf8');
  const m = newContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
  const newVer = m ? m[1] : '';

  /* ⚠️ 读不到 HEAD 的版本号（首次提交 / 路径异常）时**不得**当成「版本没变」静默跳过
     —— 那会把「无法比较」伪装成「通过」，与上面 probeGit 的坑同类。 */
  if (!oldVer) {
    console.log('');
    console.log('⚠️  pre-commit: 读不到 HEAD 的 APP_VERSION（可能是首次提交或路径异常）');
    console.log(`   → 无法比较版本变化，本次文档同步校验**未执行**（未执行 ≠ 通过）。`);
    console.log(`   当前工作区 APP_VERSION = ${newVer}；若确实改了版本号，请人工确认：`);
    console.log('     1. README.md（副标题版本号 / 版本历史表格 / 当前版本指针）');
    console.log('     2. doc/changelog-vX.X.md（新增 "## vX.X.X" 章节 + 架构演化表）');
    console.log('');
    process.exit(0);
  }

  if (oldVer === newVer) {
    console.log(`✓ pre-commit: 版本号未变化（${newVer}），跳过文档校验`);
    process.exit(0);
  }

  console.log(`🔍 检测到版本号变更: ${oldVer} → ${newVer}`);

  // 校验 1: changelog 是否更新（含版本章节）
  const mainVer = newVer.split('.').slice(0, 2).join('.');
  const changelogPath = path.join(ROOT, `doc/changelog-v${mainVer}.md`);
  const changelogStaged = staged.some(f => f.startsWith('doc/changelog-v'));
  let changelogHasSection = false;
  if (fs.existsSync(changelogPath)) {
    changelogHasSection = fs.readFileSync(changelogPath, 'utf8').includes(`## v${newVer}`);
  }

  // 校验 2: README 是否更新（含新版本行 + 当前版本指针）
  const readmePath = path.join(ROOT, 'README.md');
  const readmeStaged = staged.includes('README.md');
  let readmeHasRow = false;
  if (fs.existsSync(readmePath)) {
    const rc = fs.readFileSync(readmePath, 'utf8');
    readmeHasRow = rc.includes(`v${newVer}`) && rc.includes(`**v${newVer}**`);
  }

  const errors = [];
  if (!changelogStaged || !changelogHasSection) {
    errors.push(`- doc/changelog-v${mainVer}.md 未更新或缺少 "## v${newVer}" 章节（含架构演化表）`);
  }
  if (!readmeStaged || !readmeHasRow) {
    errors.push('- README.md 未更新或缺少 v' + newVer + ' 版本行（副标题/版本表/当前版本指针）');
  }

  if (errors.length) {
    console.log('\n❌ pre-commit 拦截：版本号变更但文档未同步！');
    console.log('   AGENTS.md 版本纪律要求每次 bump APP_VERSION 必须同步完成：');
    console.log('   1. README.md（副标题版本号 / 版本历史表格 / 当前版本指向）');
    console.log('   2. doc/changelog-vX.X.md（新增版本章节 + 架构演化表）');
    errors.forEach(e => console.log('   ' + e));
    console.log('\n   请补齐文档后重新提交，或使用 git commit --no-verify 强制跳过（不推荐）。');
    process.exit(1);
  }

  console.log('✓ pre-commit: 版本文档已同步（changelog + README）');
  process.exit(0);
}

/* 仅在直接执行时跑 main —— 被 require 时只导出纯函数，便于单测 */
if (require.main === module) main();

module.exports = { sh, lines, probeGit };

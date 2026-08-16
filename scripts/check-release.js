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

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    return (e.stdout || '').trim();
  }
}

function main() {
  // 本次暂存的文件列表
  const staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
  const utilsChanged = staged.includes('page/utils.js');
  if (!utilsChanged) {
    console.log('✓ pre-commit: utils.js 未变更，跳过版本校验');
    process.exit(0);
  }

  // 对比 HEAD 与工作区的 APP_VERSION
  let oldVer = '';
  try {
    const oldContent = sh('git show HEAD:page/utils.js');
    const m = oldContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
    oldVer = m ? m[1] : '';
  } catch (e) { oldVer = ''; }

  const newContent = fs.readFileSync(path.join(ROOT, 'page/utils.js'), 'utf8');
  const m = newContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
  const newVer = m ? m[1] : '';

  if (!oldVer || oldVer === newVer) {
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

main();

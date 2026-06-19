## Agent skills

### Version discipline

每次版本更新（修改 `page/utils.js` 中的 `APP_VERSION`）时，必须同步：
1. 更新 `README.md` 中的版本号引用
2. 创建或更新 `doc/changelog-vX.X.md` 变更文档，记录本次修改的功能、修复、改进
3. 更新 `doc/changelog-vX.X.md` 中的架构演化表（文件数、最大文件行数）

### Issue tracker

GitHub Issues — `gh issue` CLI 操作 `wuwiwo/MyHealth` 仓库。详见 `docs/agents/issue-tracker.md`。

### Triage labels

中文标签映射表。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文 — 根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

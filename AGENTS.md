## Agent skills

### Version discipline

每次版本更新（修改 `page/utils.js` 中的 `APP_VERSION`）时，必须同步完成以下三项：

**1. 更新 `README.md`**

- 顶部副标题版本号：`v1.5.1`
- 「版本」章节的版本历史表格：新增当前版本行（版本号、日期、摘要、文档路径）
- 若新增/删除文件，更新目录结构树
- 更新当前版本指向最新 changelog

**2. 创建或更新 `doc/changelog-vX.X.md`**

- 文件名取主版本号，如 `doc/changelog-v1.5.md`（含 v1.5.0 和 v1.5.1）
- 每个小版本用 `## vX.X.X` 标题分隔
- 内容三分类：「新增功能」「修复」「UI 调整」
- **不得**写入其他版本的内容，每个 changelog 只写当前版本
- 列出本次新增/删除的文件

**3. 更新架构演化表**

位于 changelog 底部，格式：

```
| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| ...  | ...      | ...      | ...  |
```

- 必须包含 v1.0 至今**全部版本**的历史行
- 文件数 = `page/` 下 `*.js` 文件数量
- 最大文件 = 行数最多的 `page/*.js` 文件名 + 行数

### Issue tracker

GitHub Issues — `gh issue` CLI 操作 `wuwiwo/MyHealth` 仓库。详见 `docs/agents/issue-tracker.md`。

### Triage labels

中文标签映射表。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文 — 根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

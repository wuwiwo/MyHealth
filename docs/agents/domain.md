# Domain Docs

## Layout

**单上下文（single-context）**

- 领域语言：根目录 `CONTEXT.md`
- 架构决策：`docs/adr/`

## Consumer Rules

- `improve-codebase-architecture`：读取 `CONTEXT.md` 了解领域术语，读取 `docs/adr/` 了解历史决策
- `diagnose`：读取 `CONTEXT.md` 理解模块命名和职责
- `tdd`：读取 `CONTEXT.md` 确保测试命名与领域语言一致

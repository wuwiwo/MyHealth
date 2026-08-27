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

### Commit discipline

每次修改**都必须提交**（不能留 pending 改动），但按阶段区分处理：

| 阶段 | 判定 | 提交要求 | 版本发布三项同步 |
|------|------|----------|------------------|
| **施工阶段** | 改动 `page/*.js` 代码、动 `APP_VERSION` 或影响线上功能 | 每次修改提交，提交信息按功能/修复描述 | **触发**（bump 版本 + README/changelog/架构表） |
| **设计阶段** | 仅改动设计文档（如 `doc/design-v2.0.md`、README/CONTEXT 的文档性说明） | 每次修改提交，`docs:` 前缀 | **不触发**（不 bump 版本、不生成 changelog） |

- 设计阶段只动文档、不碰代码/版本号 → 提交，但**不**更新「版本」章节与架构演化表
- 施工阶段任何代码改动 → 提交，并**必须**同步完成上述版本发布三项
- 设计→施工切换：只有真正落代码（`APP_VERSION` ≥ 上版本）才开始走版本纪律
- 提交信息约定：施工用 fix:/feat: 等，设计用 `docs:` 前缀

### Issue tracker

GitHub Issues — `gh issue` CLI 操作 `wuwiwo/MyHealth` 仓库。详见 `docs/agents/issue-tracker.md`。

### Triage labels

中文标签映射表。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文 — 根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

### Sub-agent 调用约定（lead-planner / 总指挥）

调用 `lead-planner` 子代理（.commandcode/agents/lead-planner.md）时：

- **边界**：prompt 给任务目标 + 相关文件路径；**可附少量关键上下文补充**（已拍板的决策要点、背景一句话），但**大段文档内容**（设计文档全文、代码边界描述）由 agent 自己 `read_file` / `grep` 读取，以文件原文为唯一事实来源。
- **理由**：大段 prompt 导致 token 膨胀 → 响应慢 → 流式传输断连（本项目已多次因此卡死，如 2026-08-27 动作数据集规划 286K tokens 断连事件）。
- 例：`让 lead-planner 读 doc/design-v2.0.md 与 doc/plans/plan-20260827-m2a-kickoff.md，规划 XXX（补充：已拍板路线B/仅中文瘦身）`，而非粘贴文档全文。

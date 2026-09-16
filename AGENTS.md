## Agent skills

本项目的文档职责分离如下：

- `AGENTS.md`：规定 Agent **怎么工作**，包括工作模式、权限边界、修改纪律与协作安全。
- `CONTEXT.md`：描述项目是什么，包括领域模型、数据模型、模块边界与依赖关系。
- `doc/HANDOFF.md`：描述项目当前进行到哪里，以及环境差异、实时状态确认方法和已知坑。

不要把 HANDOFF 中的实时状态数字、环境假设或历史事故复制成 AGENTS 的永久规则。

### Agent role selection

本文件不规定当前必须由哪个 AI 执行任务。

- 若用户指定 Codex 为主指挥，Codex 按 Lead Agent 模式工作，代码由指定 Executor 实施。
- 若用户直接指定 WorkBuddy 或其他 coding agent 开发，该 Agent 可自行完成分析、规划、实现、测试与提交。
- 不得因为本文件提到 Codex / WorkBuddy 就擅自改变用户指定的工作流。

### Version discipline

每次版本更新（修改 `page/utils.js` 中的 `APP_VERSION`）时，必须同步完成以下三项：

**1. 更新 `README.md`**

- 顶部副标题版本号（形如 `v2.1.5`）
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
| **施工阶段** | 修改线上运行代码、`page/*.js`、`page/index.html`、`page/index.css`、部署/运行配置，或修改 `APP_VERSION` | 每次修改提交，提交信息按功能/修复描述 | **触发**（bump 版本 + README/changelog/架构表） |
| **设计阶段** | 仅改动设计文档（如 `doc/design-v2.0.md`、README/CONTEXT 的文档性说明） | 每次修改提交，`docs:` 前缀 | **不触发**（不 bump 版本、不生成 changelog） |

- 设计阶段只动文档、不碰代码/版本号 → 提交，但**不**更新「版本」章节与架构演化表
- 施工阶段任何代码改动 → 提交，并**必须**同步完成上述版本发布三项
- 设计阶段结束、首次修改线上运行代码时，即进入施工阶段；施工阶段的代码修改必须同时执行版本纪律，不得先落代码、后决定是否 bump
- 提交信息约定：施工用 fix:/feat: 等，设计用 `docs:` 前缀

### Git environment

Git 的环境差异和远端状态确认方法以 `doc/HANDOFF.md` 为准，不在本文件中写死某一种 Git 工具或沙箱行为。

执行 Git 操作前：

1. 阅读 `doc/HANDOFF.md §0.2`，先判断当前是否为 Android SAF 环境。
2. 仅当 Android SAF 挂载目录存在且 `myhealth-git` 已安装时，使用 `myhealth-git`。
3. 普通 Windows / Linux 环境直接使用原生 `git`，不要因为其他环境的交接指令而寻找或强行使用 wrapper。
4. 判断提交是否已经推送到 `main` 时，遵循 `doc/HANDOFF.md §0.2.1` 的实时验证方法；不要盲信本地远端引用、`git status` 的 ahead/behind 数字或旧文档结论。

不要把某个环境中的 Git 命令、路径、wrapper 或沙箱限制直接套用到另一个环境。

### Parallel session safety

本项目可能同时存在多个 AI 或人类开发会话。开始任何代码任务前必须：

1. 检查当前工作树，确认是否存在未提交或他人刚产生的修改。
2. 检查 `git log --oneline -5`，确认最近提交。
3. 确认当前 HEAD，并结合源码实时状态判断版本，不依据旧文档数字推断当前版本。
4. 阅读 `doc/HANDOFF.md` 中与当前任务相关的环境和已知问题。

除非用户明确要求，不得回退、覆盖或删除其他会话已经完成的修改。若发现工作树存在不属于当前任务的修改：

- 不得覆盖或回滚这些修改；
- 不得将其加入当前 commit；
- 应尽量只提交当前任务涉及的文件；
- 发现范围重叠时，应保留现有修改并先缩小自己的变更范围。

### Issue tracker

GitHub Issues，仓库 `wuwiwo/MyHealth`。详见 `docs/agents/issue-tracker.md`。

> ⚠️ **本机开发环境未安装 `gh` CLI**（`command -v gh` 无输出）。需要操作 Issue 时用网页端，或先装：`winget install GitHub.cli`。
> Git 工具和远端状态验证遵循上方 Git environment 规则及 `doc/HANDOFF.md`，不要把单一环境的命令当作通用规则。

### Triage labels

中文标签映射表。详见 `docs/agents/triage-labels.md`。

### Domain docs

项目架构与领域模型见根目录 `CONTEXT.md`；当前状态、环境差异和已知坑见 `doc/HANDOFF.md`。

> 注：`docs/adr/` 目录**尚未创建**。历史设计决策目前散落在 `doc/design-v2.0.md`、`doc/design-tokens-v2.1.md` 与各版本 changelog 中。

### Sub-agent 调用约定

> ⚠️ **本节原先引用的 `.commandcode/agents/lead-planner.md` 在当前工作区已不存在**（`.commandcode/` 整个目录都没有）。以下原则作为通用约定保留，重新引入规划类子代理时可直接复用。

调用规划类子代理时：

- **边界**：prompt 只给任务目标 + 相关文件路径；**可附少量关键上下文补充**（已拍板的决策要点、背景一句话），但**大段文档内容**（设计文档全文、代码边界描述）由 agent 自己 `read_file` / `grep` 读取，以文件原文为唯一事实来源。
- **理由**：大段 prompt 导致 token 膨胀 → 响应慢 → 流式传输断连（本项目已多次因此卡死，如 2026-08-27 动作数据集规划 286K tokens 断连事件）。
- 例：`让子代理读 doc/design-v2.0.md 与 doc/HANDOFF.md，规划 XXX（补充：已拍板路线B/仅中文瘦身）`，而非粘贴文档全文。

# MyHealth 领域上下文（入口摘要）

> **本文是导航页，不再维护数值表。**
> 完整、以代码为唯一事实源的系统文档见 [doc/wiki/00 系统总览.md](doc/wiki/00%20系统总览.md)：12 个大类各一页，用 `[[wikilinks]]` 链接成总索引，另有 `01 Glossary/` 术语真源。
> 核对基线：`APP_VERSION = 2.14.16`（`page/utils.js`）、`page/*.js` 53 个、`scripts/test-*.js` 79 套件、缓存戳 `?v180`。
> ⚠️ 本文旧版的领域词汇表 / 数据模型 / 模块边界含大量过时数字（`21 章 117 关`、`玩家属性=容量/20`、`65% 宝珠合成率`、`宠物最多 2 只`、`9 选 1` 技能等），已全部移入 wiki 并按现行代码重写；旧值对照见 [doc/wiki/12 术语表与过时文档对照.md](doc/wiki/12%20术语表与过时文档对照.md)。

## 项目定位

个人健身健康管理单页应用（原生 JS + HTML + CSS，无框架 / 无构建）。训练记录折算成 RPG 角色属性，驱动**两套互相独立**的战斗系统；数据存 localStorage，经 Vercel Serverless `/api/data` 做 Blob 云同步。部署根目录 `page/`，站点绑定 GitHub `wuwiwo/MyHealth` 的 `main` 分支。

## 两套关卡（最容易混淆）

| | 关卡试炼（单敌） | 敌群试炼（多对多） |
|---|---|---|
| 代码 | `page/levels.js` + `page/battle.js` | `page/group-levels.js` + `page/battle-group.js` |
| 规模 | **35 章 201 关**（静态字面量） | **24 大关 × 10 = 240 关**（程序化生成） |
| ID | `1-1` ~ `35-6` | `g1-1` ~ `g24-10` |
| 进度键 | `game` | `groupProgress` |
| 详情 | [02 关卡试炼与单敌战斗](doc/wiki/02%20关卡试炼与单敌战斗.md) | [04 敌群多对多战斗](doc/wiki/04%20敌群多对多战斗.md) |

## 文档地图

- **总索引**：[00 系统总览](doc/wiki/00%20系统总览.md)
- **大类页**：[01 训练与属性统计](doc/wiki/01%20训练与属性统计.md) · [02 关卡试炼与单敌战斗](doc/wiki/02%20关卡试炼与单敌战斗.md) · [03 隐藏挑战](doc/wiki/03%20隐藏挑战.md) · [04 敌群多对多战斗](doc/wiki/04%20敌群多对多战斗.md) · [05 宠物系统](doc/wiki/05%20宠物系统.md) · [06 宝珠系统](doc/wiki/06%20宝珠系统.md) · [07 玩家技能与媒体资源](doc/wiki/07%20玩家技能与媒体资源.md) · [08 数据持久化与云同步](doc/wiki/08%20数据持久化与云同步.md) · [09 UI 设计体系与无障碍](doc/wiki/09%20UI%20设计体系与无障碍.md) · [10 测试与版本纪律](doc/wiki/10%20测试与版本纪律.md) · [11 部署与运维](doc/wiki/11%20部署与运维.md) · [12 术语表与过时文档对照](doc/wiki/12%20术语表与过时文档对照.md)
- **术语真源**：`doc/wiki/01 Glossary/`（6 个 `type: game-term` 规范词条）
- **流程与环境**：`AGENTS.md`（怎么工作：版本纪律、提交纪律、并行会话安全）、`doc/HANDOFF.md`（当前状态、环境差异、踩坑经验）
- **现行规范**：`doc/design-tokens-v2.1.md`（写任何样式前必读）
- **变更与发号**：`doc/changelog-v*.md`、`doc/VERSION-LEDGER.md`

## 数据模型速览

- 物理键规则：`dh-` + 逻辑名 + `-v<version>`（`page/store.js` 的 `physKey()`）；**21 个已注册逻辑键全部 v1**，`schemaNames()` 是同步 / 备份的唯一键名真源。
- 同步顶层对象 `version: 5` + `keys`（由 `store.getAll()` / `schemaNames()` 派生）；近 7 天导出另有精简字段。
- ⚠️ `/api/data` 目前 GET / PUT **无鉴权**、CORS `*`，任何人可读可覆写云端存档；`cleanupOldBlobs()` 只留最新 20 个快照。属待修的独立任务。
- 详见 [08 数据持久化与云同步](doc/wiki/08%20数据持久化与云同步.md)。

## 模块边界（要点）

- `page/store.js` 是唯一写 localStorage 的模块；`page/app.js` 是对外数据 API 的唯一入口。
- `stats.js` / `battle.js` / `date-roll.js` / `monthly-reset.js` / `ex-dataset.js` / `orbs.js` 不操作 DOM 与 store（纯逻辑）。
- 53 个 `page/*.js` 的完整加载顺序以 `page/index.html` 底部脚本为**唯一事实源**（当前 `?v180`）；`store.js` 最先，`debug.js` 之后还有 `codex.js` 与 `init()`。
- `game-views.js` / `game-render.js` / `debug.js` 属 UI 层，末尾加载。
- 详见 [00 系统总览](doc/wiki/00%20系统总览.md) 与各大类页的「事实源」段。

## 架构决策

`docs/adr/` 目录**尚未创建**。现行设计决策的权威位置：

| 主题 | 权威位置 |
|------|----------|
| 全部系统现行事实 | `doc/wiki/00 系统总览.md` + 各大类页 |
| 样式 / 令牌 / 无障碍 | `doc/design-tokens-v2.1.md` |
| 版本纪律 / 提交纪律 | `AGENTS.md` |
| 环境差异 / 实时状态 / 踩坑 | `doc/HANDOFF.md` |
| 各版本变更明细 | `doc/changelog-v*.md` |

> `doc/design-v2.0.md`、`doc/2.0 敌群设计.md` 等为**历史设计稿**，不作现行规则；状态清单见 [12 术语表与过时文档对照](doc/wiki/12%20术语表与过时文档对照.md)。

# MyHealth

> Personal Health Manager — 个人健身健康管理应用 v1.7.1

一个**纯前端单页应用**，帮助记录和追踪个人健身数据，通过**游戏化 RPG 挑战系统**将训练量转化为角色属性进行对战。

---

## 功能

| 模块 | 功能 |
|------|------|
| 🏋️ 训练 | 力量（记录/计划/断签/周统计）+ 有氧（记录/计划/统计）子 Tab |
| 📊 个人 | 基本信息、体重记录与趋势图、PR 个人最佳、训练统计与热力图 |
| 🎮 挑战 | 9 章 45 关 RPG 战斗、关卡预览与胜率模拟、属性变更日志、历史最佳记录 |
| ⚙️ 设置 | 动作库管理（CRUD + ratio）、计划管理、挑战管理、数据管理（导出/导入/同步） |

---

## 技术架构

```
浏览器 (localStorage) ←→ Vercel 静态站点 ←→ Vercel Blob 云存储
```

- **前端**: 原生 JS + HTML + CSS（CSS Variables 深/浅主题切换）
- **后端**: Vercel Serverless Function（`api/data.mjs`）
- **云存储**: Vercel Blob Storage
- **图表**: Canvas 2D API 自绘平滑曲线图

---

## 目录结构

```
page/
├── store.js           数据 Store（K-V 接口 + onChange 通知）
├── utils.js           常量、工具函数、toast、主题
├── levels.js          关卡配置（9章45关）
├── stats.js           纯函数统计计算（含 ratio 加权容量）
├── battle.js          战斗引擎（纯逻辑）
├── linechart.js       Canvas 折线图（可复用）
├── sync.js            云同步 + 导出/导入
├── app.js             数据层 + 事件委托 + 初始化 + 迁移 + Tab切换
├── tab-strength.js    力量训练子 Tab
├── tab-cardio.js      有氧运动子 Tab
├── tab-profile.js     个人 Tab（2 个子 Tab）
├── tab-game.js        挑战 Tab
├── tab-settings.js    设置 Tab（动作库/计划/挑战/数据 4 个子 Tab）
├── index.html         页面骨架
├── index.css          样式表
├── api/
│   └── data.mjs       Vercel Serverless 同步接口
├── package.json
└── vercel.json
doc/
├── README-v1.0.md
├── project-analysis-v1.0.md
├── code-review-v1.0.md
├── roadmap-v1.1.md
├── roadmap-v1.1.md
├── changelog-v1.3.md
├── changelog-v1.4.md
├── changelog-v1.5.md
├── changelog-v1.6.md
├── changelog-v1.7.md
└── roadmap-v1.6.md
```

---

## 安装与运行

```bash
cd page
npx serve .
# 或
python -m http.server 8080
```

---

## 部署

```bash
cd page
vercel --prod
```

需要 `BLOB_READ_WRITE_TOKEN` 环境变量。

---

## 版本

| 版本 | 日期 | 摘要 | 文档 |
|------|------|------|------|
| v1.0 | 2026-06 | 初始版本：4 Tab + RPG战斗 + Vercel Blob同步 | `doc/README-v1.0.md` |
| v1.1 | 2026-06-14 | Store模块提取、文件拆分（1→10文件）、架构重构 | — |
| v1.2 | 2026-06-14 | PR追踪、属性日志、关卡记录、训练统计、有氧计划 | — |
| v1.3 | 2026-06-14 | 有氧强度、自定义运动类型、关卡预览、Profile子Tab | `doc/changelog-v1.3.md` |
| v1.4 | 2026-06-16 | 属性日志增量显示、UI全局美化、平滑曲线图 | `doc/changelog-v1.4.md` |
| v1.5.0 | 2026-06-19 | 7-9章关卡、5种Boss词缀、手动同步、计划编辑 | `doc/changelog-v1.5.md` |
| v1.5.1 | 2026-06-19 | 全量数据同步修复、关卡配置独立、同步建议增强 | `doc/changelog-v1.5.md` |
| v1.6 | 2026-06-24 | 页面重构（训练+设置Tab）、动作库驱动、ratio容量加权、子Tab泛化 | `doc/changelog-v1.6.md` |
| v1.6.1 | 2026-06-28 | PR 显示 ratio 有效容量 tag（口径提示） | `doc/changelog-v1.6.md` |
| v1.7 | 2026-06-30 | 动作描述markdown、计划动作选择、体重图周/月、旬周期奖励、同步修复、导出7天 | `doc/changelog-v1.7.md` |
| v1.7.1 | 2026-07-01 | 每月1号自动重置挑战关卡（保留永久惩罚/历史最佳/属性日志） | `doc/changelog-v1.7.md` |

> 当前版本：**v1.7.1**

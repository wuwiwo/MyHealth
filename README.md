# MyHealth

> Personal Health Manager — 个人健身健康管理应用 v1.9.3

🟢 **线上体验**：<https://my-health-six.vercel.app/>
📦 **源码仓库**：<https://github.com/wuwiwo/MyHealth>

一个**纯前端单页应用**，帮助记录和追踪个人健身数据，通过**游戏化 RPG 挑战系统**将训练量转化为角色属性进行对战。手机 / 电脑跨设备云同步，深 / 浅主题切换，移动端优先响应式设计。

---

## 功能

| 模块 | 功能 |
|------|------|
| 🏋️ 训练 | 力量（记录/计划/断签/周统计 + **当日总容量**）+ 有氧（记录/计划/统计）子 Tab，顶部「今日速览」概览本周与本旬进度，**常用动作按频次排序，记录显示等效容量与倍率**；容量每 100kg 叠加 🔮 隐藏挑战召唤次数与几率 |
| 📊 个人 | 基本信息、体重记录与趋势图、PR 个人最佳、训练统计、30 天每日趋势、**热力图（次数/容量可切换，点击图表显示数值）** |
| 🎮 挑战 | 15 章 90 关 RPG 战斗、关卡预览与胜率模拟、**旬目标进度条 + 结算预告**、战利品掉落、炼魂系统（9 级品质）、属性变更日志、历史最佳、分享卡片、首次规则引导、**隐藏挑战小游戏（预览确认后开始，8-12s 倒计时点击攻击，伤害兑月奖励，周 4 天连续解锁热血 buff）** |
| ⚙️ 设置 | 动作库管理（CRUD + ratio + 等效重量）、计划管理、挑战管理、数据管理（导出 / 导入 / 云同步） |

---

## 技术架构

```
浏览器 (localStorage)
    ↑↓  事件委托 + onChange 通知
纯前端 SPA (原生 JS, 无框架)
    ↑↓  手动同步 / API FETCH
Vercel 静态站点
    ↑↓  Blob 写入 / 列取 / 旧文件清理
Vercel Blob Storage (public)
```

- **前端**: 原生 JS + HTML + CSS（CSS Variables 深/浅主题切换，移动优先）
- **数据层**: `store.js` v1.2 — K-V 接口 + schema 校验白名单 + localStorage 配额守护
- **后端**: Vercel Serverless Function（`api/data.mjs`），Blob 旧文件自动清理（保留最新 20 份）
- **云同步**: `sync.js` 手动推送/拉取，网络层自动重试（指数退避）
- **图表**: Canvas 2D API 自绘平滑曲线图（linechart.js，可复用）
- **事件路由**: `app.js` 注册表 + try/catch 隔离 — 单模块异常不阻断其他模块
- **Modal**: `utils.js` 通用 `openModal()` helper，统一 backdrop 点击关闭

---

## 目录结构

```
page/
├── store.js            数据 Store v1.2（K-V 接口 + schema 校验 + onChange 通知 + 配额守护）
├── utils.js            常量、工具函数、toast、主题、openModal helper
├── levels.js           关卡配置（15 章 90 关）
├── stats.js            纯函数统计计算（容量加权 / 旬周期 / 炼魂升级概率）
├── battle.js           战斗引擎（纯逻辑 + 魂攻击阶段 + Boss 词缀）
├── challenge.js        隐藏挑战召唤 + 小游戏 + 伤害兑月奖励
├── linechart.js        Canvas 折线图（可复用）
├── sync.js             云同步 + 导出 / 导入（网络重试 + 时间戳冲突比对）
├── app.js              数据层 + 事件委托注册表 + 初始化 + 迁移 + Tab 切换
├── tab-strength.js     力量训练子 Tab + 今日速览卡片
├── tab-cardio.js       有氧运动子 Tab
├── tab-profile.js      个人 Tab（个人数据 / 训练数据 子 Tab，30 天趋势图）
├── game-render.js      挑战 Tab 渲染（关卡 + 属性条 + 旬目标卡 + 引导）
├── game-battle.js      挑战 Tab 战斗 UI + 战利品 + 分享卡片
├── game-records.js     挑战 Tab 历史记录 + 属性变更日志
├── game-refine.js      挑战 Tab 炼魂系统弹窗 + 批量炼化
├── tab-game.js         挑战 Tab 事件入口（onGameEvent）
├── tab-settings.js     设置 Tab（动作库 / 计划 / 挑战 / 数据 4 个子 Tab）
├── index.html          页面骨架
├── index.css           样式表
├── api/
│   └── data.mjs        Vercel Serverless 同步接口 + Blob 清理
├── package.json
└── vercel.json
doc/
├── README-v1.0.md       版本说明 v1.0
├── project-analysis-v1.0.md
├── code-review-v1.0.md
├── code-review-v1.5.md
├── roadmap-v1.1.md
├── roadmap-v1.6.md
├── changelog-v1.3.md
├── changelog-v1.4.md
├── changelog-v1.5.md
├── changelog-v1.6.md
├── changelog-v1.7.md
├── changelog-v1.8.md
└── changelog-v1.9.md  ← 最新版本日志
```

---

## 安装与运行

```bash
cd page
npx serve .
# 或
python -m http.server 8080
```

本地运行无需后端，训练数据自动存入浏览器 `localStorage`。云同步功能只在 Vercel 部署时可用（依赖 Blob 环境变量）。

---

## 部署

### Vercel（推荐）

```bash
cd page
vercel --prod
```

Vercel 项目设置：
- **Root Directory**: `page/`
- **Environment Variables**:
  - `BLOB_READ_WRITE_TOKEN` — Vercel Blob 读写令牌
  - `BLOB_STORE_ID` — Blob Store ID

### GitHub 自动部署

仓库 `wuwiwo/MyHealth` 接入 Vercel 自动部署，`git push origin main` 会触发重新构建。
部署后访问：<https://my-health-six.vercel.app/>

---

## 数据同步

同步是**手动**触发（右上角 🔄 按钮），避免自动写入覆盖用户数据：

1. **推送**：本地数据 → Vercel Blob（新建一份带时间戳的快照）
2. **拉取**：Vercel 取最新快照 → 本地（拉取前自动全量备份本地数据为 JSON 文件）
3. **冲突检测**：本地修改时间 vs 云端 `lastUpdated`，给出明确建议

新数据只追加 Blob 快照，旧快照由 API 异步清理（保留最近 20 份），避免免费额度被历史快照吃光。

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
| v1.7.2 | 2026-07-01 | 基础属性改为本月窗口（每月1号自然归零，保留奖励/惩罚） | `doc/changelog-v1.7.md` |
| v1.7.3 | 2026-07-01 | 旬奖励改为永久累积（permBonus），月初不再归零到10/10/100 | `doc/changelog-v1.7.md` |
| v1.7.4 | 2026-07-01 | 补发6月旬奖励（中下旬双达标+180攻防） | `doc/changelog-v1.7.md` |
| v1.7.5 | 2026-07-01 | 防御奖励1/5、挑战自动模式、攻击打击动画 | `doc/changelog-v1.7.md` |
| v1.7.6 | 2026-07-01 | 等效重量（自重/计时动作）、折算率10~100% | `doc/changelog-v1.7.md` |
| v1.8 | 2026-07-09 | 10-15章新关卡、炼魂系统（魂攻防+9级炼化）、秒数bug修复 | `doc/changelog-v1.8.md` |
| v1.8.1 | 2026-07-09 | 炼化改为顺序升级（F→SSR）、批量1/10/50次 | `doc/changelog-v1.8.md` |
| v1.8.2 | 2026-07-09 | 修复浮点精度显示、修复批量按钮disabled失效 | `doc/changelog-v1.8.md` |
| v1.8.3 | 2026-08-09 | 炼化批次三重防御、cache-busting v2 | `doc/changelog-v1.8.md` |
| v1.8.4 | 2026-08-09 | 恢复 index.html UTF-8 编码 | `doc/changelog-v1.8.md` |
| v1.8.5 | 2026-08-09 | doRefineBatch 内联循环 + 详细诊断 | `doc/changelog-v1.8.md` |
| v1.8.6 | 2026-08-09 | 逐次诊断 getCurrentRefineGrade 返回值 + 中断原因 | `doc/changelog-v1.8.md` |
| v1.8.7 | 2026-08-10 | allDone 判断修复（allMaxed && !nextGrade） | `doc/changelog-v1.8.md` |
| **v1.9.0** | **2026-08-12** | **架构重构（store v1.2/sync重试/Blob清理/tab-game拆5模块/事件路由注册表/openModal）+ 产品功能（今日速览/旬目标卡+结算预告/战利品/游戏引导/30天趋势图）+ UX动线优化** | `doc/changelog-v1.9.md` |
| **v1.9.1** | **2026-08-14** | **隐藏挑战召唤系统（15%起每次失败+10%/日限1次）+ 8-12s倒计时点击小游戏（伤害兑月度属性奖励）+ 常用动作频次排序 + 等效重量突出** | `doc/changelog-v1.9.md` |
| **v1.9.2** | **2026-08-14** | **召唤改版（每100kg叠加次数与几率）+ 预览确认界面 + 热血buff（周连续4天解锁：暴击率+50%·暴伤+20% / 暴伤+200%·暴击率+10% / 倒计时+100%·每5s伤害+10%叠加）+ 训练记录等效容量与倍率** | `doc/changelog-v1.9.md` |
| **v1.9.3** | **2026-08-14** | **当日总容量显示 + 导出增强（3/5天+剪贴板+基础信息/体重/断签理由）+ 图表点击显示数值 + 移动端适配 + 热力图次数/容量切换 + 属性日志完善 + 同步按月保护** | `doc/changelog-v1.9.md` |

> 当前版本：**v1.9.3**
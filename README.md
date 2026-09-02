# MyHealth

> Personal Health Manager — 个人健身健康管理应用 v2.0.0

🟢 **线上体验**：<https://my-health-six.vercel.app/>
📦 **源码仓库**：<https://github.com/wuwiwo/MyHealth>

一个**纯前端单页应用**，帮助记录和追踪个人健身数据，通过**游戏化 RPG 挑战系统**将训练量转化为角色属性进行对战。手机 / 电脑跨设备云同步，深 / 浅主题切换，移动端优先响应式设计。

---

## 功能

| 模块 | 功能 |
|------|------|
| 🏋️ 训练 | 力量（记录/计划/断签/周统计 + **当日总容量**）+ 有氧（记录/计划/统计）子 Tab，顶部「今日速览」概览本周与本旬进度，**常用动作按频次排序，记录显示等效容量与倍率**；容量每 100kg 叠加 🔮 隐藏挑战召唤次数与几率 |
| 📊 个人 | 基本信息、体重记录与趋势图、PR 个人最佳、训练统计、30 天每日趋势、**热力图（次数/容量可切换，点击图表显示数值）** |
| 🎮 挑战 | 21 章 117 关 RPG 战斗（16章起 BOSS 双词条）、关卡预览与胜率模拟、**旬目标进度条 + 结算预告**、战利品掉落、炼魂系统（9 级品质）、属性变更日志、历史最佳、分享卡片、首次规则引导、**隐藏挑战小游戏（预览确认后开始，8-12s 倒计时点击攻击，伤害兑月奖励，周 4 天连续解锁热血 buff）** |
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
├── store.js            数据 Store v1.3（schema 注册表 + 版本迁移 + -bak 备份 + onChange）
├── ex-dataset.js       动作百科数据层（1324 动作检索/关联匹配/tagHtml）
├── config.js           运行时配置（MEDIA_BASE 图床覆盖）
├── utils.js            常量、工具函数、toast、主题、openModal helper
├── levels.js           关卡配置（21 章 117 关，单敌）
├── date-roll.js        本地日历日/月键纯函数（DST 安全）
├── monthly-reset.js    自然月窗口判定（resolveMonthWindow）
├── stats.js            纯函数统计计算（容量加权 / 旬周期 / 炼魂升级概率）
├── state-core.js       状态框架（defineStatus/applyStatus/tick/dispatch）
├── status-defs.js      状态注册表（中毒/冰冻/潮湿/蓄力/诅咒等 12+）
├── unit.js             Unit 战斗单位模型（阵营/速度/属性修正）
├── talent.js           敌群天赋（16 种：利刃/嗜血/再生/复仇…）
├── skill.js            敌群技能（25 种，含冷却/先制度）
├── enemy.js            敌人编成（tier 阶梯 minion/elite/boss）
├── battle.js           单敌战斗引擎（rng 注缝 + 五段式 hook + Boss 词条）
├── battle-group.js     多对多群战引擎（速度行动队列 + 单步执行）
├── terrain.js          战斗场地（6 种）
├── group-levels.js     敌群关卡（6 大关 × 10 小关程序化生成）
├── group-progress.js   敌群线性解锁进度
├── ai.js               敌人 AI（斩杀/治疗/集火/Boss 大招）
├── challenge.js        隐藏挑战召唤 + 小游戏 + 伤害兑月奖励 + 技能点
├── linechart.js        Canvas 折线图（可复用）
├── app.js              数据层 + 事件委托注册表 + 初始化 + 迁移 + Tab 切换
├── sync.js             云同步 + 导出 / 导入（网络重试 + 时间戳冲突比对）
├── tab-strength.js     力量训练子 Tab + 今日速览卡片 + 动作选择弹层
├── tab-cardio.js       有氧运动子 Tab
├── tab-profile.js      个人 Tab（个人数据 / 训练数据，热力图长按/月分组）
├── game-render.js      挑战 Tab 渲染（群战 UI/调速/飘字/技能气泡/引导）
├── game-battle.js      挑战 Tab 战斗 UI + 战利品 + 分享卡片
├── game-records.js     挑战 Tab 历史记录 + 属性变更日志
├── game-refine.js      挑战 Tab 炼魂系统弹窗 + 批量炼化
├── game-views.js       挑战页三视图（培养/战斗/记录）
├── tab-game.js         挑战 Tab 事件入口（onGameEvent）
├── tab-settings.js     设置 Tab（动作库 / 计划 / 挑战 / 数据 + 动作百科）
├── pets.js             宠物生命周期（蛋→孵化→成长→成熟→阵亡+离线结算）
├── pet-materials.js    培育材料（6 种）+ 宠物炼化（R50/SR60/SSR80/UR100）
├── pet-codex.js        14 只宠物图鉴 + 技能/天赋注册 + createPetUnit
├── pet-store.js        dh-pets-v1 持久化 + 材料掉落 + 每日结算
├── pet-ui.js           宠物面板 UI（喂食/营养/炼化/参战）
├── skills.js           玩家技能注册表（9 技能）+ 技能点经济 + 槽位
├── player-skill-hooks.js 玩家技能战斗挂钩（暴击/格挡/护盾/陨石…）
├── skill-store.js      dh-skills-v1 持久化
├── skill-ui.js         技能面板 UI
├── orbs.js             宝珠系统（5 类型×4 品质 合成/分解/装配/月重置）
├── index.html          页面骨架
├── index.css           样式表
├── media/              动作媒体（images/ + videos/，已关联动作）
├── data/
│   └── exercises-dataset.js  动作数据集（window.EX_DATASET，仅中文瘦身）
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
├── changelog-v1.9.md
├── changelog-v2.0.md  ← 最新版本日志
├── design-v2.0.md       v2.0 设计文档（技能/宠物/宝珠）
├── design-uiux-adjustments.md  v2.0 UI/UX 调整设计
├── plan-v2.0-implementation.md v2.0 实施计划
├── v2.0问题回答与补充.md      v2.0 设计问答与裁决记录
└── plans/
    ├── plan-20260827-m2a-kickoff.md     M2a 起步计划（权威版）
    └── plan-20260827-action-dataset.md  动作数据集接入计划
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
| **v1.9.4** | **2026-08-16** | **修复：稍后再说吞次数（pendingChallenge 状态机）+ 结算页误关（noBackdrop）+ 结算页每秒点击曲线柱状图** | `doc/changelog-v1.9.md` |
| **v1.9.5** | **2026-08-16** | **修复：挑战中途退出锁死当天（结算时才写状态）+ 旧 bug 恢复入口（lastRewardDate）** | `doc/changelog-v1.9.md` |
| **v1.9.6** | **2026-08-16** | **平衡：奖励阈值 +50%（2250/3375/675）+ 热血 buff 改本周累计 5 次 + 全屏金色闪光特效** | `doc/changelog-v1.9.md` |
| **v1.9.7** | **2026-08-22** | **修复：召唤 NaN 污染导致永远失败（getChallenge 字段归一化 + isFinite 防护，含自重动作场景）** | `doc/changelog-v1.9.md` |
| **v1.9.8** | **2026-08-22** | **修复：召唤面板 ?/? 显示（次数用尽时 canSummon 补字段 + 面板 can 检查）+ 临时屏幕 debug 面板** | `doc/changelog-v1.9.md` |
| **v1.9.9** | **2026-08-22** | **历史召唤成绩查看（含 buff）+ debug 面板全分支常驻开关 + 召唤率新规则（前4次15%，第5次起25%）** | `doc/changelog-v1.9.md` |
| **v1.9.10** | **2026-08-25** | **召唤概率阶梯重做：10% 起每次失败 +15%（10/25/40/55），第5次 80%、第6次起必成** | `doc/changelog-v1.9.md` |
| **v1.9.11** | **2026-08-25** | **防作弊：删除训练记录同步撤销召唤资格（容量回撤守卫）** | `doc/changelog-v1.9.md` |
| **v1.10.0** | **2026-08-25** | **内容扩展：16~21 章新关卡（+36关，总数 81→117，此前 README 的 90 为误记）+ 双词条 BOSS（16章起，机制叠加）** | `doc/changelog-v1.10.md` |
| **v1.10.1** | **2026-08-25** | **战利品倍率重做（普通×2 / BOSS×10）+ 修复 5-6 缺失的 Boss 标记** | `doc/changelog-v1.10.md` |
| **v1.10.2** | **2026-08-25** | **修复双词条组合器参数丢失导致的弹窗崩溃/战斗卡死/胜率失真** | `doc/changelog-v1.10.md` |
| **v1.10.3** | **2026-08-25** | **修复战利品按"下一关"类型结算（Boss 胜利此前只发×2）** | `doc/changelog-v1.10.md` |
| **v1.10.4** | **2026-08-27** | **修复召唤面板概率文案与阶梯不一致（误导决策）+ 补齐引导弹窗双词条说明（v1.10.0 遗漏项）** | `doc/changelog-v1.10.md` |
| **v1.10.5** | **2026-08-27** | **架构重构（零行为变化）：词条组合器钩子表化去重 + pickBossAffix 数组化 + buildBattleSides 抽取共用** | `doc/changelog-v1.10.md` |
| **v1.11.0** | **2026-09-01** | **动作百科（1324 动作）+ 动作关联机制 + MEDIA_BASE 图床覆盖 + store schema 注册表 + 时间工具（M2a S0/S1-B）+ 训练/个人/挑战/设置 UI 优化** | `doc/changelog-v1.11.md` |
| **v2.0.0** | **2026-09-02** | **v2.0 大版本：玩家技能系统（9 技能）+ 多对多敌群战场（60 关/天赋/AI/场地）+ 宠物养成（14 只/炼化/共鸣）+ 宠物战斗 + 宝珠系统 + 挑战页三视图** | `doc/changelog-v2.0.md` |
| **v2.0.1** | **2026-09-02** | **隐藏挑战「昨日未用资格顺延」：漏录补训后可借用昨日召唤资格（1 天，召过不顺延）** | `doc/changelog-v2.0.md` |
| **v2.0.2** | **2026-09-02** | **补召双池重构：补召成功不占今日名额，每周成功次数不少；今日已召仍可补召昨日** | `doc/changelog-v2.0.md` |
| **v2.0.3** | **2026-09-02** | **🔴 修复发布事故：index.html 漏挂 24 个 v2.0 模块（宠物/技能/敌群/宝珠线上不可见）+ 页面加载链冒烟测试** | `doc/changelog-v2.0.md` |
| **v2.0.4** | **2026-09-02** | **🔴 二号接线事故：补挑战页三视图 HTML 骨架（培养/战斗/记录选项卡+容器）** | `doc/changelog-v2.0.md` |
| **v2.0.5** | **2026-09-02** | **挑战页旧部件移除（属性条/旬卡/记录卡），消除新旧 UI 叠放** | `doc/changelog-v2.0.md` |
| **v2.0.6** | **2026-09-02** | **动作改名/合并四库联动迁移（修正不规范命名如「抬举」→「肩推」）+ 关卡列表跨视图漏显修复** | `doc/changelog-v2.0.md` |
| **v2.0.7** | **2026-09-02** | **补召结算不锁今日名额：补召打完当天仍可正常召唤（applyChallengeSettle 分型记账）** | `doc/changelog-v2.0.md` |

> 当前版本：**v2.0.7**
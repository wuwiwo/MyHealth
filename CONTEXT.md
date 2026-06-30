# MyHealth 领域上下文

## 项目定位

个人健身健康管理应用，纯前端单页（原生 JS + HTML + CSS），通过 RPG 挑战系统将训练量转化为角色属性进行对战。部署于 Vercel，后端 Blob 存储。

## 领域词汇表

| 术语 | 含义 | 代码映射 |
|------|------|----------|
| **力量训练** | 记录动作/重量/次数的无氧训练 | store key: `strength`，`app.js:6-9`，条目字段见数据模型 |
| **有氧运动** | 跑步/跳绳/骑行等心肺训练 | store key: `cardio`，`app.js:28-30`，6 种默认类型 + 自定义，`utils.js:10-17` |
| **PR**（个人最佳） | 某动作的历史最高重量/次数/容量 | store key: `prs`，`app.js:10-19` 自动检测并弹 toast |
| **容量**（Volume） | 单组训练量 = weight × actualReps | `stats.js:8-10` sumVolume() |
| **有效时长** | 有氧时长 × 强度系数（低/中/高=1/2/3） | `stats.js:27-32` sumEffectiveDuration() |
| **训练计划** | 预设动作/组数/次数模板 | store key: `plans`（力量）、`cardioPlans`（有氧），`app.js:21-26` |
| **补签** | 对历史日期补充完成标记 | store key: `missed`，`app.js:23-24` |
| **体重记录** | 用户体重时间序列 | store key: `weight`，`app.js:32-33` |
| **个人资料** | 身高/性别/出生年份 | store key: `profile`，`app.js:35-36` |
| **关卡** | 9 章 45 关 RPG 战斗，每关有 NPC（atk/def/hp），Boss 关带词缀 | `levels.js`，store key: `game`（cleared + current） |
| **玩家属性** | 由 30 天训练量计算：atk=容量/20，def=有效时长/15，hp=容量/10+时长/3+周奖励 | `stats.js:66-74` calculateStats() |
| **动作库** | 力量动作 + 有氧类型的统一管理，含 ratio/intensity/emoji/hasDist/description | store key: `exercises`，`app.js` getExercises/saveExercises |
| **ratio** | 力量动作的容量比值(0~100%)，容量=weight×reps×(ratio/100) | `stats.js:13` sumVolume()，PR 不乘 ratio |
| **动作描述** | 支持简易 markdown（加粗/标题/代码/列表），列表展开渲染 | `utils.js` renderMd()，`tab-settings.js` exCardHtml() |
| **旬周期** | 每月分3旬(上旬1-10/中旬11-20/下旬21-末)，6天→+30攻防，容量达标→+60攻防 | `stats.js` getCurrentPeriod/calculatePeriodBonus |
| **活跃天数** | 统计周期内有训练记录的天数 | `stats.js` countActiveDays() |
| **Boss 词缀** | Boss 关随机附加的 5 种战斗机制（虚弱/荆棘/怒气/汲取/护盾） | `battle.js:5-26` BOSS_AFFIXES |
| **永久惩罚** | 挑战失败累积的属性减益 | `stats.js:66` permPenAtk/permPenDef 参数 |
| **云同步** | 手动推送到 Vercel Blob / 导出 JSON / 导入 JSON | `sync.js`，API 端 `api/data.mjs` |
| **主题** | 深色/浅色切换，CSS Variables 实现 | `utils.js:48-51`，store key: `theme` |
| **热量图** | 日历形式展示训练分布 | 各 tab 文件中渲染 |

### 动作列表（EXERCISES，`utils.js:9`）

二头弯举、肩推、深蹲、卧推、划船、硬拉、侧平举、前平举、锤式弯举、俯身飞鸟、颈后臂屈伸、俯身臂屈伸、直立划船、推举、阿诺德推举、哑铃飞鸟、哑铃耸肩、弓步蹲、保加利亚深蹲、站姿提踵

### 有氧类型（CARDIO_TYPES，`utils.js:10-17`）

| ID | 名称 | 有距离 | 默认强度 |
|----|------|--------|----------|
| run | 跑步 | 是 | 2 |
| jump | 跳绳 | 否 | 3 |
| cycle | 骑行 | 是 | 2 |
| swim | 游泳 | 是 | 3 |
| walk | 快走 | 是 | 1 |
| hiit | HIIT | 否 | 3 |

## 数据模型

### Store Key 一览

所有 Key 通过 `store.get()` / `store.set()` 读写，前缀 `dh-`、后缀 `-v1` 由 `store.js` 自动添加。

| Key | 类型 | 结构 |
|-----|------|------|
| `strength` | Object | `{ entries: [{ id, date, exercise, weight, actualReps, targetReps?, createdAt }] }` |
| `cardio` | Object | `{ entries: [{ id, date, type, duration, distance?, intensity?, createdAt }] }` |
| `weight` | Object | `{ records: [{ id, date, weight, createdAt }] }` |
| `profile` | Object | `{ height: number, gender: '男'\|'女', birthYear: number }` |
| `game` | Object | `{ cleared: string[], current: string }` — cleared 为已通关关卡 ID 数组，current 为当前选中关卡 |
| `prs` | Object | `{ [exercise]: { maxWeight, weightDate, maxReps, repsDate, maxVolume, volDate } }` |
| `plans` | Object | `{ plans: [{ id, name, exercises: [{ exercise, sets, reps }] }] }` |
| `cardioPlans` | Object | `{ plans: [{ id, name, items: [{ type, duration, distance? }] }] }` |
| `missed` | Object | `{ notes: { [date]: string } }` — date 为 "YYYY-MM-DD"，值为备注 |
| `theme` | String | `'dark'` 或 `'light'` |
| `cardioTypes` | Object | 旧版自定义有氧类型（v1.6 后只读兼容，已迁移到 exercises） |
| `exercises` | Array | 动作库：`[{ id, name, type:'strength'\|'cardio', ratio, intensity, emoji, hasDist, description }]` |

### 同步数据格式（`sync.js:46-50`）

导出的顶层对象：`{ version: 4, lastUpdated(=store.getLastModTime()), entries, plans, missed, cardio, weight, cardioPlans, cardioTypes, game, exercises }`
近7天导出额外含 `summary` 字段（统计摘要），不含 plans/game/prs/records/attrLog

## 模块边界

```
page/
├── store.js        → 数据层：localStorage 封装，K-V 读写 + onChange 通知 + getLastModTime
├── utils.js        → 常量定义（强度等级）、工具函数、toast、主题、getAllCardioTypes、renderMd
├── app.js          → 数据 API（getStr/addStr/...）+ 事件委托 + 初始化 + Tab切换 + switchSub + 数据迁移
├── stats.js        → 纯函数统计计算（ratio 加权容量/时长/活跃天数/玩家属性/旬周期奖励）
├── levels.js       → 关卡配置数据（9 章 45 关 NPC 属性）
├── battle.js       → 战斗引擎（纯逻辑，回合制 + Boss 词缀）
├── linechart.js    → Canvas 折线图组件
├── sync.js         → 云同步 + JSON 导出/导入（含 exercises 字段）
├── tab-strength.js → 力量训练子 Tab UI 渲染
├── tab-cardio.js   → 有氧运动子 Tab UI 渲染
├── tab-profile.js  → 个人数据 Tab UI 渲染（含体重图）
├── tab-game.js     → 挑战模式 Tab UI 渲染
├── tab-settings.js → 设置 Tab UI 渲染（动作库/计划/挑战/数据）
├── index.html      → 页面骨架
├── index.css       → 样式表（CSS Variables 主题）
└── api/data.mjs    → Vercel Serverless 同步接口
```

### 依赖方向

```
utils.js → store.js
app.js → utils.js, store.js
stats.js → (无依赖，纯函数)
levels.js → (无依赖，纯数据)
battle.js → levels.js
tab-*.js → app.js, stats.js, levels.js, battle.js, linechart.js
sync.js → store.js, app.js
```

- `store.js` 是唯一写入 localStorage 的模块
- `app.js` 是对外暴露数据 API 的唯一入口（含 getExercises/saveExercises/migrateExercises）
- `stats.js` / `battle.js` 不操作 DOM 和 store
- 各 `tab-*.js` 负责 UI 渲染，调用 app.js 的 API 读写数据
- `utils.js` 的 `getAllCardioTypes()` 从 exercises 库读取，回退到旧 cardioTypes store

## 架构决策

`docs/adr/` 目录尚未创建。历史架构决策参考：
- `doc/project-analysis-v1.0.md` — 初始架构分析
- `doc/code-review-v1.0.md` — 代码审查记录
- `doc/changelog-v*.md` — 各版本变更记录

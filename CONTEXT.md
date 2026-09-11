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
| **关卡** | 21 章 117 关 RPG 战斗，每关有 NPC（atk/def/hp），Boss 关带词缀（16 章起 Boss 为双词缀） | `levels.js`，store key: `game`（cleared + current） |
| **玩家属性** | 由 30 天训练量计算：atk=容量/20，def=有效时长/15，hp=容量/10+时长/3+周奖励 | `stats.js:66-74` calculateStats() |
| **动作库** | 力量动作 + 有氧类型的统一管理，含 ratio/intensity/emoji/hasDist/description | store key: `exercises`，`app.js` getExercises/saveExercises |
| **ratio** | 力量动作的容量比值(0~100%)，容量=weight×reps×(ratio/100) | `stats.js:13` sumVolume()，PR 不乘 ratio |
| **动作描述** | 支持简易 markdown（加粗/标题/代码/列表），列表展开渲染 | `utils.js` renderMd()，`tab-settings.js` exCardHtml() |
| **旬周期** | 每月分3旬(上旬1-10/中旬11-20/下旬21-末)，6天→+30攻防，容量达标→+60攻防 | `stats.js` getCurrentPeriod/calculatePeriodBonus |
| **活跃天数** | 统计周期内有训练记录的天数 | `stats.js` countActiveDays() |
| **Boss 词缀** | Boss 关随机附加的 5 种战斗机制（虚弱/荆棘/怒气/汲取/护盾） | `battle.js:5-26` BOSS_AFFIXES |
| **永久惩罚** | 挑战失败累积的属性减益 | `stats.js` calculatePeriodPenalty，game.permPen |
| **炼魂系统** | 通关9-6后解锁，训练容量转为炼化点数，9级品质随机强化属性 | store key: `refine`，`stats.js` REFINE_GRADES |
| **魂攻击/魂防御** | 独立于攻防的新属性，10章起敌方拥有，无魂防时魂攻全额伤害 | `battle.js` battleTick 魂攻击阶段 |
| **云同步** | 手动推送到 Vercel Blob / 导出 JSON / 导入 JSON | `sync.js`，API 端 `api/data.mjs` |
| **主题** | 深色/浅色切换，CSS Variables 实现 | `utils.js:48-51`，store key: `theme` |
| **热力图** | 日历形式展示训练分布 | 各 tab 文件中渲染 |

### v2.0 / v2.1 新增词汇

| 术语 | 含义 | 代码映射 |
|------|------|----------|
| **敌群** | 多对多战斗模式，9 大关 × 10 小关 = 90 关（每大关第 5 关精英 / 第 10 关 Boss，最多 3 敌） | `group-levels.js` 生成，`battle-group.js` 引擎，`group-progress.js` 解锁 |
| **宠物** | 14 只，蛋 → 成长 → 成熟三阶段；可上场最多 2 只；参战走群战引擎 | `pets.js`（生命周期）/ `pet-codex.js`（图鉴）/ `pet-store.js`（持久化）/ `pet-ui.js`（面板） |
| **宠物天赋** | 宠物**固有专属**被动，**不可跨宠物装配**。SSR 单天赋、UR 双天赋、R/SR 无 | `pet-codex.js` 的 `registerTalent` + `getPetTalents()`（恒取图鉴值，忽略存档 `talentIds`） |
| **炼化** | 宠物属性强化，等级上限 R50 / SR60 / SSR80 / UR100，按稀有度成功率递减 | `pet-materials.js` 的 `attemptRefine` / `refineMaxLevel` / `refineSuccessRate` |
| **玩家技能** | 9 个可升级技能，消耗技能点；装备位最多 3（`unlockSkillSlots` 未接线，**实际 9 选 1**） | `skills.js` / `player-skill-hooks.js` / `skill-store.js` |
| **宝珠** | 5 类型 × 4 品质，65% 合成率，每 20 碎片/次 | `orbs.js` |
| **命中 / 闪避** | v2.1.5 引入。基础命中 95%，命中率 = 基础 + `_accMod` − 目标 `_eva`，clamp `[5%, 100%]` | `battle-group.js` 的 `BASE_HIT_RATE` / `groupHitChance()` / `groupRollHit()` |
| **天赋 hook** | 天赋与战斗引擎的对接点。群战引擎调度：`onTurnStart/End`、`onBefore/AfterAction`、`onDamage`、`onAfterDamage`、`onBeforeStatus`、`onBeforeHit`、`onBeforeCrit`、`onAllyStatus`、`onAllyDamage`、`onBeforeHeal`、`onFoeHeal` | `talent.js` 的 `talentDispatch()` / `talentAura()`，在 `battle-group.js` 被调用 |
| **场地** | 6 种战斗场地（沙暴/雪天/酷暑/雨天/反转/毒气） | `terrain.js` |
| **状态** | 敌群负面/特殊状态；`grade` 1=普通 2=高级 3=特级 | `status-defs.js` 定义，`state-core.js` 框架 |
| **瞩目** | 玩家技能「瞩目」的嘲讽机制，受影响单位速度 ×2 | `player-skill-hooks.js` / `battle-group.js` 的 `_taunting` |

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
| `exercises` | Array | 动作库：`[{ id, name, type, ratio, intensity, emoji, hasDist, description, eqWeight, unit }]`。eqWeight=自重动作等效重量(null=哑铃动作)，unit='rep'|'sec' |
| `refine` | Object | 炼魂系统：`{ points, totalEarned, unlocked, upgrades: { F:{atk,def,hp,soulAtk,soulDef}, ... } }`。每月重置 |

> **架构升级（已合入 main，v2.0.0 起）**：`store.js` 已升级 schema 注册表（`registerSchema`/`migrate`/`validate`），见「模块边界」的 store.js 说明。动作数据集新增 `data/exercises-dataset.js`（全局 `window.EX_DATASET`，1324 条只读百科）+ `page/ex-dataset.js` 查询层 + 动作对象 `dsId` 字段（可选关联，老存档免迁移）。

### 同步数据格式（`sync.js:46-50`）

导出的顶层对象：`{ version: 4, lastUpdated(=store.getLastModTime()), entries, plans, missed, cardio, weight, cardioPlans, cardioTypes, game, exercises }`
近7天导出额外含 `summary` 字段（统计摘要），不含 plans/game/prs/records/attrLog
> sync version 仍为 4（动作数据集关联用 `dsId` 单字段，向后兼容，无需 bump）。

## 模块边界

```
page/
├── store.js        → 数据层：localStorage 封装 + **schema 注册表**（registerSchema({key,version,defaultValue,validate,migrate})，读时逐级 migrate→validate，失败保留 raw+corrupted 标记不丢进度）；K-V 读写 + onChange + getLastModTime
├── utils.js        → 常量定义（强度等级）、工具函数、toast、主题、getAllCardioTypes、renderMd
├── app.js          → 数据 API（getStr/addStr/...）+ 事件委托 + 初始化 + Tab切换 + switchSub + 数据迁移
├── stats.js        → 纯函数统计计算（ratio 加权容量/时长/活跃天数/玩家属性/旬周期奖励）
├── levels.js       → 关卡配置数据（21 章 117 关 NPC 属性）
├── battle.js       → 战斗引擎（纯逻辑，回合制 + Boss 词缀）
├── linechart.js    → Canvas 折线图组件
├── sync.js         → 云同步 + JSON 导出/导入（含 exercises 字段）
├── date-roll.js    → 【M2a 新增】本地日历日/月键纯函数（dateKey/monthKey/daysBetween/monthKeyDiff/isClockRolledBack），无依赖不碰 DOM/store
├── monthly-reset.js→ 【M2a 新增】自然月窗口判定（resolveMonthWindow/freshMonthStamp），依赖 date-roll，策略无关
├── config.js       → 【动作数据集新增】MEDIA_BASE 常量（图床覆盖，空=本地相对路径）
├── ex-dataset.js   → 【动作数据集新增】只读动作百科数据层（检索/模糊匹配/媒体URL），读 window.EX_DATASET
├── tab-strength.js → 力量训练子 Tab UI 渲染
├── tab-cardio.js   → 有氧运动子 Tab UI 渲染
├── tab-profile.js  → 个人数据 Tab UI 渲染（含体重图）
├── tab-game.js     → 挑战模式 Tab UI 渲染
├── tab-settings.js → 设置 Tab UI 渲染（动作库/计划/挑战/数据，含动作百科入口 + 编辑关联区块）
├── index.html      → 页面骨架
├── index.css       → 样式表（CSS Variables 主题）
└── api/data.mjs    → Vercel Serverless 同步接口
```

### v2.0 新增模块（M1-M6，已合入 main）

```
├── date-roll.js      → 日期键纯函数（dateKey/monthKey/daysBetween）
├── monthly-reset.js  → 自然月窗口判定（resolveMonthWindow）
├── unit.js           → Unit 模型（createUnit/查询/速度/属性修正）
├── state-core.js     → 状态框架（defineStatus/applyStatus/tickStatuses/dispatch）
├── status-defs.js    → 敌群状态定义（中毒/冰冻/畏缩/末日等）
├── talent.js         → 16 敌群天赋注册表
├── skill.js          → 25 敌群技能注册表（含冷却/先制度）
├── enemy.js          → 敌群敌人工厂（createEnemyUnit + tier 阶梯）
├── battle.js         → 单敌战斗引擎（含 rng 注缝 mulberry32）
├── battle-group.js   → 多对多群战引擎（行动队列/单步/天赋技能状态场地）
├── terrain.js        → 6 场地（沙暴/雪天/酷暑/雨天/反转/毒气）
├── group-levels.js   → 敌群 9 大关×10 小关（90 关程序化生成，第 5 关精英/第 10 关 Boss，最多 3 敌）
├── group-progress.js → 敌群线性解锁（通关解锁下一关）
├── ai.js             → 敌人 AI 策略
├── pets.js           → 宠物生命周期（蛋→成熟）
├── pet-materials.js  → 材料系统 + 宠物炼化
├── pet-codex.js      → 14 只宠物图鉴 + 宠物技能/天赋 + createPetUnit
├── pet-store.js      → dh-pets-v1 持久化 + 材料掉落
├── pet-ui.js         → 宠物面板 UI
├── skills.js         → 玩家 9 技能注册表 + 技能点经济
├── player-skill-hooks.js → 玩家技能战斗挂钩
├── skill-store.js    → dh-skills-v1 持久化
├── skill-ui.js       → 技能面板 UI
├── orbs.js           → 宝珠系统（5类型×4品质 合成/升级/装配）
├── game-views.js     → 挑战页三视图（培养/战斗/记录）
└── debug.js          → 全局 Debug 面板（FAB+抽屉五分区，错误捕获）
```

### v2.0 store keys

> 物理键名 = `dh-` + 逻辑名 + `-v<schema 版本>`（`store.js` 的 `physKey`）。

| Key（物理） | 逻辑名 | 用途 |
|-----|-----|------|
| dh-pets-v1 | `pets` | 宠物（pets/materials/materialLog/challengeWeek）|
| dh-skills-v1 | `skills` | 玩家技能（points/levels/loadout/slotsUnlocked）|
| dh-groupProgress-v1 | `groupProgress` | 敌群通关进度（cleared）|
| dh-challenge-v1 | `challenge` | 隐藏挑战存档 |

详细键表见 `doc/HANDOFF.md` §7。

### 依赖方向

```
—— v1.x 基础层 ——
utils.js → store.js
app.js → utils.js, store.js
stats.js → (无依赖，纯函数)
levels.js → (无依赖，纯数据)
battle.js → levels.js
date-roll.js → (无依赖)
monthly-reset.js → date-roll.js
ex-dataset.js → (读全局 EX_DATASET，无模块依赖)
config.js → (无依赖，纯常量)
tab-*.js → app.js, stats.js, levels.js, battle.js, linechart.js, ex-dataset.js, config.js
sync.js → store.js, app.js

—— v2.0 战斗内容层 ——
unit.js → (无依赖)
state-core.js → (无依赖)
status-defs.js → state-core.js
talent.js → (无依赖，读写 unit.base)
skill.js → (无依赖)
enemy.js → unit.js, talent.js, skill.js
terrain.js → (无依赖)
battle-group.js → unit.js, talent.js, skill.js, status-defs.js, state-core.js, terrain.js
ai.js → unit.js, skill.js
group-levels.js → unit.js, enemy.js
group-progress.js → store.js

—— v2.0 养成层 ——
pets.js → (无依赖)
pet-codex.js → unit.js, talent.js, skill.js
pet-materials.js → pet-codex.js
pet-store.js → store.js
pet-ui.js → pet-store.js, pet-codex.js, pet-materials.js, pets.js
skills.js → (无依赖)
player-skill-hooks.js → unit.js, state-core.js
skill-store.js → store.js
skill-ui.js → skills.js, skill-store.js
orbs.js → store.js
game-views.js / game-render.js / debug.js → UI 层，末尾加载
```

- `store.js` 是唯一写入 localStorage 的模块
- `app.js` 是对外暴露数据 API 的唯一入口（含 getExercises/saveExercises/migrateExercises）
- `stats.js` / `battle.js` / `date-roll.js` / `monthly-reset.js` / `ex-dataset.js` 不操作 DOM 和 store
- 各 `tab-*.js` 负责 UI 渲染，调用 app.js 的 API 读写数据
- `utils.js` 的 `getAllCardioTypes()` 从 exercises 库读取，回退到旧 cardioTypes store
- **加载顺序（index.html）**：以 `page/index.html` 底部脚本顺序为唯一事实来源，完整列表见 `doc/HANDOFF.md` §3。关键点：`store.js` 最先（其余模块要用它），`utils.js` 早于所有依赖 `APP_VERSION`/日期工具的模块，`debug.js` 最后（挂在 `init()` 前）。新模块必须按其依赖关系插在合适位置。

## 架构决策

`docs/adr/` 目录**尚未创建**，设计决策目前散落在下列文档中（按主题查）：

| 主题 | 权威文档 |
|------|----------|
| 样式 / 令牌 / 无障碍（**写样式前必读**） | `doc/design-tokens-v2.1.md` |
| v2.0 玩法设计：玩家技能 / 宠物 / 多对多敌群 | `doc/design-v2.0.md`（含 OQ 裁决表） |
| v2.0 实施路线、模块边界、数据结构 | `doc/archive/plan-v2.0-implementation.md`（已归档） |
| 敌群内容层：天赋 / 技能 / 编成梯度 | `doc/2.0 敌群设计.md` |
| 机制结构性结论：战斗层决策数、经济通胀、防御轴失效 | `doc/mechanics-biopsy-v2.0.4.md` |
| 各版本变更明细 | `doc/changelog-v*.md` |
| 接手开发必读（环境/纪律/清单/踩坑） | `doc/HANDOFF.md` |

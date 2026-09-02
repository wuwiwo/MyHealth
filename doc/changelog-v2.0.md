# MyHealth v2.0 更新日志

**Date:** 2026-09-02

v2.0 是里程碑大版本：上线玩家技能系统、多对多敌群战场、宠物养成与战斗、宝珠系统四大板块，挑战页重构为三视图。单敌 117 关战斗保留共存。

---

## v2.0.0

**Date:** 2026-09-02

### 新增功能

- ⚔️ **多对多敌群战场**（M2/M2b）
  - 新增群战引擎 `battle-group.js`：按速度排序的行动队列 + 单步执行（`groupBattleStep` 一次行动一个单位，调速 1×/2×/4×/8×）
  - 我方 1 主角色 + 上场宠物 vs 敌方 1~4 单位；大关 1-2 最多 2 敌（无魂攻防），大关 3-6 最多 4 敌（含魂攻防）
  - 状态框架 `state-core.js` + `status-defs.js`：中毒/冰冻/畏缩/潮湿/哈欠/蓄力/附身/末日/破甲/魂防降/减速/遗言诅咒
  - 敌群天赋 16 种（利刃/振翅/粗糙皮肤/强健/魔法镜/朴实/威吓/魔法盾/慢启动/懒惰/多目标/嗜血/复仇/再生）
  - 敌群技能 25 种（冲撞/咬击/地刺/暴风雪/末日/遗言/诅咒/冰魄/巨石等，含冷却与先制度）
  - 敌人 AI（`ai.js`）：斩杀残血/治疗队友/Boss 大招/嘲讽强制/集火评分
  - 战斗场地 6 种（`terrain.js`）
  - 群战 UI：单位详情/战斗日志分回合/复制/伤害飘字（按 targetId 定位）/技能气泡

- 🗺️ **敌群关卡**（M2b）
  - `group-levels.js`：6 大关 × 10 小关 = 60 关程序化生成；第 5 小关精英 ⭐、第 10 小关 Boss 👑
  - `group-progress.js`：线性解锁（g1-1 起，通关解锁下一关，通关锁定不可重打）
  - 敌人 tier 阶梯（minion/elite1/elite2/boss），难度随大关/小关递进

- ✨ **玩家技能系统**（M1/M3）
  - 9 技能全部实装：暴击 / 气力恢复 / 陨石轰炸 / 格挡 / 气势如虹 / 冰魄光束 / 金身护盾 / 瞩目 / 巨石重压
  - 技能点经济：隐藏挑战胜利 +100 点，周递增（首 0%，后续 +50%/次，最高 +250%）
  - 槽位：初始 1，本月通关 12/20 关各 +1，同类型限带 1
  - 战斗挂钩 `player-skill-hooks.js`：被动（暴击/格挡/金身）、辅助（气势/气力/瞩目）、攻击技能 30% 几率施放（陨石/冰魄/巨石）

- 🐣 **宠物养成系统**（M4）
  - 生命周期：蛋 → 14 天孵化 → 成长期 → 成熟期 → 阵亡；离线按天结算（饥饿/健康/成长）
  - 14 只图鉴（3R + 4SR + 4SSR + 3UR），UR 双天赋
  - 宠物炼化：普通/高级炼化石，属性成长按稀有度上限 R50/SR60/SSR80/UR100；突破属性永久保留
  - 共鸣加成：未上场成熟宠物按持有总数档位加成上场宠物
  - 月度重置：炼化等级重置 / 宠物技能向下取整减半 / 材料清空 / 突破保留
  - 6 种材料：营养液/宠物饲料/宠物灵能/普通炼化石/高级炼化石/宝珠碎片

- 🐾 **宠物战斗**（M5）
  - 成熟宠物可进群战（`createPetUnitsForBattle`），独立行动（技能/天赋/共鸣加成）
  - 每只每天限参战 1 次

- 🔮 **宝珠系统**（M6）
  - 5 类型（血气/攻击/魂攻/防御/魂防）× 4 品质（N/R/SR/SSR）
  - 合成（65% 成功率）/分解返还/升级/装配/月度重置 + 战斗属性应用

- 🎮 **挑战页三视图**（`game-views.js`）
  - 培养（角色卡+宠物+技能+材料）/ 战斗（本旬目标+敌群+关卡）/ 记录（PR+属性）

- 🧱 **基础设施**
  - store.js v1.3 schema 注册表：`registerSchema`（version/validate/migrate）、-bak 备份、未来版本拒绝降级
  - 新 store key：`dh-pets-v1` / `dh-skills-v1` / `dh-groupProgress`
  - 时间工具：`date-roll.js`（本地日历日/月键，DST 安全）+ `monthly-reset.js`（自然月窗口）
  - 单敌引擎 rng 注缝（mulberry32），群战确定性可测

### 测试

- 新增 21 套测试套件（`scripts/test-*.js`，366+ 断言）全部 0 失败：群战引擎/60 关生成/解锁链/AI/天赋/敌群技能/状态/场地/宠物×4/技能×4/宝珠/时间工具/store 注册表

### 修改文件

- 新增 26 个 `page/*.js` 模块（完整清单见 README 目录树）
- 新增 `page/media/`（38 个动作媒体）与 `page/data/exercises-dataset.js`
- 新增 21 个 `scripts/test-*.js` 测试套件
- `page/utils.js`（APP_VERSION 1.11.0 → 2.0.0）
- `page/index.html`（新增模块 script 链 + cache-busting v45）
- `README.md`（副标题 / 目录树 / 版本表）
- `CONTEXT.md`（v2.0 模块与 store key 映射）

### 架构演化

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| v1.1 | 10 | 308 行 tab-strength.js | Store模块 + 文件拆分 |
| v1.2 | 13 | 388 行 tab-game.js | PR/统计/有氧计划/记录 |
| v1.3 | 13 | 442 行 tab-game.js | 关卡预览/强度系统/子Tab |
| v1.4 | 14 | 460 行 tab-game.js | 属性日志增量/UI美化 |
| v1.5.0 | 15 | 434 行 tab-game.js | 新关卡/手动同步 |
| v1.5.1 | 15 | 434 行 tab-game.js | 全量同步/关卡配置独立 |
| v1.6 | 13 | 406 行 tab-game.js | 动作库驱动/页面重构/设置Tab |
| v1.6.1 | 13 | 406 行 tab-game.js | PR显示ratio有效值tag |
| v1.7 ~ v1.9.9 | — | — | 未存档 |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 词条组合器参数修复+tick兜底 |
| v1.10.3 | 18 | 574 行 challenge.js | 战利品按被击败关卡结算 |
| v1.10.4~v1.10.5 | 18 | 574 行 challenge.js | 文案修复/词条钩子表化重构 |
| v1.11.0 | 22 | 583 行 challenge.js | 动作百科+关联机制+store注册表+时间工具+UI优化 |
| v2.0.0 | 44 | 761 行 game-render.js | 技能/敌群群战/宠物/宝珠 + 挑战页三视图 |
| v2.0.1 | 44 | 761 行 game-render.js | 隐藏挑战昨日未用资格顺延 + borrow 测试套件 |
| v2.0.2 | 44 | 761 行 game-render.js | 顺延重构为双池设计：补召成功不占今日名额（每周次数不少） |
| v2.0.3 | 44 | 761 行 game-render.js | 🔴 修复发布事故：index.html 漏挂 24 个 v2.0 模块 + 页面加载链冒烟测试 |
| v2.0.4 | 44 | 761 行 game-render.js | 🔴 二号接线事故：补挑战页三视图 HTML 骨架（选项卡+容器）+ 骨架接线检查 |

---

## v2.0.4

**Date:** 2026-09-02

### 修复

- 🔴 **二号接线事故：挑战页三视图 HTML 骨架缺失**（v2.0.3 只修了 script 漏挂，用户验证后功能入口仍不可见）
  - 症状：v2.0.3 加载后版本号正确、JS 全就位，但挑战页没有「培养/战斗/记录」三视图与宠物/技能/敌群入口
  - 根因：`game-views.js` 依赖 index.html 提供 `[data-gtab]` 静态选项卡按钮与 `#gameTrainView`/`#gameBattleView`/`#gameRecordView` 三个容器——**rest 分支的 index.html 从未包含这些骨架**（与 script 漏挂同源的接线缺失）
  - 修复：tabGame 内补三视图选项卡栏（🐾培养/⚔️战斗/📊记录）+ 三个视图容器 + 注释标注；`gameContent`（关卡列表）保留为 battle 视图内展开形态

### 测试

- `test-page-load.js` 扩至 **27 项断言**：新增 HTML 骨架接线检查（9 个必需容器 id + 3 个 data-gtab 按钮），静态资源→模块→骨架三层全链验证

### 修改文件

- `page/index.html`（tabGame 三视图骨架 + cache-busting v48 → v49）
- `page/utils.js`（APP_VERSION 2.0.3 → 2.0.4）
- `scripts/test-page-load.js`（扩断言）
- `doc/changelog-v2.0.md` / `README.md`（版本表）

---

## v2.0.3

**Date:** 2026-09-02

### 修复

- 🔴 **发布事故修复：index.html 漏挂 24 个 v2.0 模块 script 标签**
  - 症状：补召的隐藏挑战结算面板「📦 材料掉落 —」；更严重的是宠物/技能/敌群 60 关/宝珠/挑战页三视图在**线上全部不可见**（模块文件在仓库但从未被浏览器加载），v2.0.0~v2.0.2 均受影响
  - 根因：v2.0.0 合并发布时 index.html 的 script 链未同步 HANDOFF §3 的加载顺序，`grantMaterial`/`getPetStore` 等全局不存在 → 材料掉落块 `typeof` 守卫静默跳过
  - 修复：补全全部 24 个缺失标签（date-roll/monthly-reset/state-core/status-defs/unit/talent/skill/enemy/battle-group/terrain/group-levels/group-progress/ai/pets/pet-materials/pet-codex/pet-store/pet-ui/skills/player-skill-hooks/skill-store/skill-ui/orbs/game-views），顺序严格按依赖关系

### 测试

- 新增 `scripts/test-page-load.js`（17 项断言，**防复发**）：解析 index.html 实际 script 顺序 → vm 沙盒按序加载全部模块 → 断言 0 加载异常 + 各系统代表性全局存在（材料/宠物/技能/群战/敌群/宝珠/三视图/状态/时间工具/召唤）

### 修改文件

- `page/index.html`（补 24 个 script 标签 + cache-busting v47 → v48）
- `page/utils.js`（APP_VERSION 2.0.2 → 2.0.3）
- `scripts/test-page-load.js`（新增）
- `doc/changelog-v2.0.md` / `README.md`（版本表）

---

## v2.0.2

**Date:** 2026-09-02

### 修复

- 🔧 **补召重构为双池设计**（修正 v2.0.1 缺陷：顺延资格并入今日池后，补召成功会占用当日"每日一次"名额，导致每周成功次数少一次）
  - 资格拆分为**今日池**（floor(今日容量/100)，成功锁 `summonedDate`）与**补召池**（floor(昨日容量/100)，仅昨日漏召时存在，当日过期）
  - 补召成功 → 记 `madeUpDate`/`madeUpUsed`，**不设置** `summonedDate`，今日正常召唤照常可用
  - 尝试优先消耗补召池（先过期先消耗）；失败按消耗池分别记账，阶梯概率按今日总尝试次数
  - 今日已召 + 昨日漏召 → 面板 done 卡出现「🔁 补召昨日挑战」按钮；挑战页三视图文案同步
  - `getChallenge` 归一化新字段 `madeUpDate`/`madeUpUsed`；dailyReset 每日重置 `madeUpUsed`

### 测试

- `test-challenge-borrow.js` 重写为双池语义 18 项断言（全绿）：补召成功不占今日名额/今日已召仍可补召/失败分池记账/剩余补召作废/history+weekDays 双路径

### 修改文件

- `page/challenge.js`（双池 canSummon + attemptSummon 分池记账 + 面板 done 卡补召按钮）
- `page/utils.js`（APP_VERSION 2.0.1 → 2.0.2）
- `page/index.html`（cache-busting v46 → v47）
- `scripts/test-challenge-borrow.js`（重写）
- `README.md`（版本表新增行）

---

## v2.0.1

**Date:** 2026-09-02

### 新增功能

- 🔮 **隐藏挑战「昨日未用资格顺延」**：解决漏录训练后补录仍无法触发隐藏挑战的问题
  - 判定：昨日（仅 1 天）容量 ≥100kg 且昨天未成功召唤（`history[]` 为主 / `weekDays` 兜底，防周一跨周重置误判）→ 昨日 `floor(容量/100)` 次召唤资格并入今日
  - 昨日召过不顺延（不双计）；今日成功限 1 次守卫不变；训练记录删除的回撤守卫兼容合并后总额
  - 召唤面板：借用时显示绿色提示「✨ 已并入昨日未用召唤资格 N 次（昨日 Xkg）」；不可召唤文案注明「昨日无可用补召资格」
  - 新增 `getVolumeFor(date)`（`getTodayVolume` 委托重构）

### 测试

- 新增 `scripts/test-challenge-borrow.js`（10 项断言）：顺延/已召不双计（history+weekDays 双路径）/今日昨日合并/门槛不足/限 1 次守卫/回撤兼容

### 修改文件

- `page/challenge.js`（canSummon 顺延逻辑 + 面板提示）
- `page/utils.js`（APP_VERSION 2.0.0 → 2.0.1）
- `page/index.html`（cache-busting v45 → v46）
- `scripts/test-challenge-borrow.js`（新增）
- `README.md`（版本表新增行）

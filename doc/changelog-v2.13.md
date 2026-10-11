# v2.13 变更日志

> 本文件只记录 **v2.13.x** 的变更。v2.12 及更早见 `doc/changelog-v2.12.md`。
> `2.12.1` 未领用：批次 B 开启新代码大类，按策略领取 `2.13.0`（台账已登记并推进指针到 `2.13.1`），该 patch 槽保留空缺。

---

## v2.13.0

Date: 2026-10-12

**批次 B：持久单场战斗摘要与分模式长期统计**（施工计划 `doc/plans/战斗体验施工计划.md` §2/§4；实施为 DeepSeek Flash v4.1 子代理，Lead 独立验收）

只新增「记账 + 展示」层：**不动引擎、数值、RNG、胜负与奖励口径**——结算与引擎输出在固定种子 A/B 上**逐字节不变**
（且与 v2.12.0 的对照哈希完全相同，见下）。

### 新增功能

- **单场战斗摘要落库**（新模块 `page/battle-history.js`）：store key `battleHistory`（物理键 `dh-battleHistory-v1`，schema v1）
  保存 `{id, endedAt, mode, stageId, result, rounds, metrics, party, note}`；单敌与敌群**合计 100 条 FIFO**（超出丢最旧，数组末尾为最新）；
  按 `id` **幂等**（同一场重复调用结算入口不会写第二条）。
- **记录视图新增「⚔️ 战斗记录」**：单敌 / 敌群**分列**展示场次、胜率、当前连胜、最佳连胜、平均回合，
  另列**最近 10 场**单场摘要（时间 / 模式 / 关卡 / 结果 / 回合 / 玩家输出·承伤·治疗；敌群另有场地·DOT·护盾）。
- **异常中止单独统计**：单敌既有 tick/render 异常路径记 `result:'aborted'`，**不计胜率分母、不打断连胜**，并在统计卡上明示次数。
- **写入失败可检测**（本版关键加固）：`store.set` 在 `localStorage.setItem` 抛错（配额）时**仍返回 true**，
  故记账层**写后回读物理键**确认落盘；失败即 `console.error` 明确暴露 + **把 store 内存缓存回滚到 append 之前**
  （否则 `sync.js` 的 `collectOtherKeys()` 会把一条**没落盘**的记录推上云端）+ 结果层显示「⚠️ 本场战绩未保存」。
  **奖励、通关标记、失败次数、炼化点一律不受影响、不回滚**。
- **同步 / 导出 / 导入自动纳入**：走 `sync.js` 既有通用键机制，**未改 `sync.js`**（`collectOtherKeys()` 自动派生）；
  导入经 `store.mergeAll(buildImportMap(...))` 后记录视图立即可见。

### 修复

- **口径不造假**：单敌**没有玩家治疗通道**（引擎唯一 heal 事件的 `sourceSide` 是 `enemy`）→
  单敌 `playerHealed` / `party[].healed` 一律写 `null`，UI 显示「不适用」，**不以 0 冒充**；
  单敌也没有场地 / DOT / 护盾汇总 → 同三个字段为 `null`。敌群玩家行若不存在（无法归因）同样写 `null`。
- **胜率空档不显示 0%**：分母为 0（无 win/loss 记录）时 `winRate` 返回 `null`，UI 显示「—」；
  「暂无战斗记录」空状态与「0 场」明确区分。
- **不静默失败**：写入失败路径全部带 `console.error`，符合本仓「禁止空 catch」约定。

### UI 调整

- 记录视图新增战斗记录区块（分模式卡 + 最近战斗列表 + 异常中止披露行 + 空状态）。
- 单敌战绩层 / 敌群结果面板在历史写失败时各补一行「⚠️ 本场战绩未保存」（成功时不显示）。

### 测试与验证（全部为本机实跑结果）

| 套件 | 结果 | 说明 |
|---|---|---|
| `scripts/test-battle-history.js`（新增） | **215 / 0** | schema 6 类非法形状 + 正向对照、空档、105→100 FIFO、幂等、写失败（配额）与缓存回滚、统计口径逐项、UI 渲染、真实 `endBattle`/`endBattleAborted`/`_groupDone` 接入 |
| `scripts/test-sync-coverage.js` | **20 / 0** | 仅补 `SAMPLES.battleHistory`（新键必须进同步覆盖网） |
| `scripts/test-page-load.js` | **27 / 0** | 新模块按 `index.html` 顺序加载零异常 |
| 其余既有套件 | 全部 0 失败 | 含 `test-battle` **141/0**、`test-group-ui-presentation` **493/493**、`test-auto-speed` **49**（只加载子集模块的代表性夹具） |

**项目全量**：**65 套件 / 4,918 断言 / 0 失败 / 0 UNKNOWN**（v2.12.0 基线 4,704 → +214 = 新套件 215 − `test-release-hook` 环境分支差 1）。
口径：本机 hook 走 23 条分支；spawn 被禁环境为 24 条 → 4,919，两种口径均 0 失败。

**先红后绿**：把本批新测试跑在**批次 B 之前**的 `page/` 上（该目录无 `battle-history.js`，以同签名空实现桩替代以免 ENOENT 崩溃）→
**13 条断言判红**（6 类 schema 拒绝全部恒真、记账/统计/UI 断言不成立），`rc=1`。

**固定种子 A/B（基线 = 本批之前的工作树，两侧同一夹具）**

| 对照 | 规模 | 结果 |
|---|---|---|
| **集成版**单敌 UI 链（真实加载 `store.js` + `battle-history.js`，确有历史写入） | 1-1 / 3-2 / 7-3 / 12-3 | sha256 `045A8DF8…` **一致**（结算与引擎日志逐字节不变），当前侧写入 4 条摘要、基线 0 条 |
| 单敌纯引擎 | 40 种子 × 4 关卡 = **160 场** | sha256 `BB257309…` **一致** |
| 敌群真实大关 | g3–g14 × 3 小关 × 3 种子 = **36 场** | sha256 `BAE86A1A…` **一致** |

> 三个哈希与 v2.12.0 批次 A 的对照值**完全相同** —— 两个版本都未触碰结算与引擎。

**真实 Chromium（自建 CDP 夹具，Chrome headless=new）：26 / 26 通过**

| 场景 | 实测 |
|---|---|
| 旧档零历史 | 物理键不存在；记录视图出现「⚔️ 战斗记录」+ 空状态文案，不抛错 |
| 单敌胜 / 败 / 异常中止 | 分别写入 `win` / `loss` / `aborted` 三条；失败仍关闭 auto；异常不改奖励与进度 |
| 敌群胜利 | 写入 `group/win`，含 `terrain/dot/shield` 与 `party[]` |
| 刷新后 | 4 条摘要仍在；记录视图显示「单敌：共 3 场 / 场次 2 / 胜率 50% / 异常中止 1 次（不计胜率）」「敌群：共 1 场 / 胜率 100%」 |
| 口径展示 | 单敌「💚 治疗 **不适用**」（不是 0）；敌群为真实 0 |
| 100 条 FIFO | 105 次 append 后 = 100 条，最旧被淘汰、顺序单调 |
| 配额写入失败 | 历史长度不变（未假装成功）、**结算照常**（current 推进、通关、炼化点 +4）、界面出现「⚠️ 本场战绩未保存」、`console.error` 明确 |
| 视口 / 主题 | 390×844 与 360×640 均无横向溢出；深 / 浅主题可用 |
| 控制台 | 0 意外 `console.error`、0 未捕获异常（唯一两条是刻意注入的引擎异常与配额失败日志） |

### 本次新增 / 修改文件

| 文件 | 变化 |
|---|---|
| `page/battle-history.js` | **新增（268 行）**：schema 注册、append（幂等 + FIFO 100 + 回读校验 + 缓存回滚）、list/recent/stats、稳定排序 |
| `page/game-battle.js` | 本场 `dealt/taken` 累计（只读 `result.events`，`hpDamage` 不含 overkill）、胜败与异常中止写历史、战绩层未保存提示 |
| `page/game-render.js` | 敌群胜败写历史（取 `groupBattleStats()`）、结果面板未保存提示 |
| `page/game-views.js` | `renderBattleHistoryBlock()`（分模式统计 + 最近战斗 + 空状态）接入 `renderRecordView()` |
| `page/index.html` | 新增 `<script src="battle-history.js">`（紧跟 `store.js`）；cache-busting `?v162` → **`?v163`** |
| `page/utils.js` | `APP_VERSION` 2.12.0 → **2.13.0** |
| `scripts/test-battle-history.js` | **新增（916 行 / 215 断言）** |
| `scripts/test-sync-coverage.js` | 补 `SAMPLES.battleHistory` |
| `README.md` / `CONTEXT.md` | 版本三项、文件树、模块边界（新模块 + 新 store 键） |
| `doc/VERSION-LEDGER.md` / `doc/HANDOFF.md` | 领号与发布登记、版本沿革、§8 断言口径 |
| `doc/changelog-v2.13.md` | 新增本版变更日志 + 完整架构演化表 |

### 本版未做 / 已知取舍（如实登记）

- **auto 单敌胜利不经过战绩层** → 该路径下历史写失败**没有 UI 提示**（记录确实未保存，只是没提示；战败/异常/手动路径均可见）。
- **配额失败会多弹一次存储不足 toast**：缓存回滚复用 `store.set`，其 `notifyQuota()` 再触发一次。既有 store 没有「只改缓存」入口，
  未改 `store.js`（本批禁改范围）；如需去重需另开版本给 store 加入口。
- **`localStorage` 整体不可用**（隐私模式）：读取按空历史、每次 append 返回 `ok:false` 并 `console.error`；除空状态外无额外降级提示。
- **多标签页并发结算未验证**：append 是「读磁盘 → 合并 → 写」，无跨标签页锁；100 条上限内不会损坏，但可能丢一条。
- **超 100 条的外来载荷**（手改导出文件 / 未来版本）会被 schema **整键拒绝**，`store.mergeAll` 跳过该键 → 本地历史**不被清空**（已验证），但该次导入的历史不会生效。
- 100 条记录的 localStorage 占用未实测（字段很小，估计 < 50KB）。
- 异常中止记录**不保存异常原因**（`note` 恒 `null`）；异常上下文仍在既有 `_lastBattleError`。

### 架构演化

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| v1.1 | 10 | 308 行 tab-strength.js | Store 模块提取、文件拆分 |
| v1.2 | 13 | 388 行 tab-game.js | PR/统计/有氧计划/记录 |
| v1.3 | 13 | 397 行 tab-game.js | 有氧强度/自定义/关卡预览/Profile 子 Tab |
| v1.4 | 13 | 397 行 tab-game.js | 属性日志增量/UI 美化/平滑曲线 |
| v1.5 | 14 | 508 行 tab-game.js | 里程碑/日周月/导出导入 |
| v1.6 | 15 | 508 行 tab-game.js | 云同步/跨设备 |
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
| v2.0.2 | 44 | 761 行 game-render.js | 顺延重构为双池设计：补召成功不占今日名额 |
| v2.0.3 | 44 | 761 行 game-render.js | 修复发布事故：index.html 漏挂 24 个 v2.0 模块 |
| v2.0.4 | 44 | 761 行 game-render.js | 二号接线事故：补挑战页三视图 HTML 骨架 |
| v2.0.5 | 44 | 761 行 game-render.js | 版本线早期修复 |
| v2.0.6 | 44 | 761 行 game-render.js | 动作改名/合并四库联动 |
| v2.0.7 | 44 | 761 行 game-render.js | 早期小版本 |
| v2.0.8 | 44 | 761 行 game-render.js | 早期小版本 |
| v2.0.9 | 44 | 761 行 game-render.js | 敌群扩关、难度曲线与宠物阶段归一 |
| v2.0.10 | 44 | 761 行 game-render.js | 敌群技能点奖励调整 |
| v2.0.11 | 44 | 761 行 game-render.js | Debug 面板首版 |
| v2.1.0 | 44 | 763 行 game-render.js | 设计令牌、移动端触控与无障碍 |
| v2.1.1 | 45 | 763 行 game-render.js | Debug 面板合入设计体系 |
| v2.1.2 | 45 | 763 行 game-render.js | 敌群关卡数量文案修正 |
| v2.1.3 | 45 | 763 行 game-render.js | 宠物养成面板及技能升级 |
| v2.1.4 | 45 | 763 行 game-render.js | 宠物面板布局与主题可读性 |
| v2.1.5 | 45 | 763 行 game-render.js | 命中/闪避系统与宠物天赋 |
| v2.1.6 | 45 | 763 行 game-render.js | 模态滚动锁泄漏修复 |
| v2.1.7 | 45 | 772 行 game-render.js | 敌群扩关与战斗 UI 优化 |
| v2.1.8 | 45 | 825 行 game-render.js | Debug 平衡诊断与模拟器 |
| v2.1.9 | 45 | 827 行 game-render.js | 敌群难度锚定 |
| v2.1.10 | 45 | 831 行 game-render.js | 敌群独立属性空间 |
| v2.1.11 | 45 | 831 行 game-render.js | 新增 g13~g15 超限试炼 |
| v2.1.12 | 45 | 831 行 game-render.js | 群战属性诊断单一入口 |
| v2.1.13 | 45 | 835 行 game-render.js | 宠物继承与场地效果 |
| v2.1.14 | 45 | 1179 行 game-render.js | 群战战斗/日志双 Tab 与详情层 |
| v2.1.15 | 45 | 1208 行 game-render.js | 接通多类宠物技能与状态效果 |
| v2.1.16 | 45 | 1208 行 game-render.js | 接通剩余可达技能/天赋效果 |
| v2.1.17 | 45 | 1207 行 game-render.js | 宠物宝珠系统 |
| v2.1.18 | 45 | 1207 行 game-render.js | 宠物放大倍率调整 |
| v2.1.19 | 45 | 1228 行 game-render.js | 重复奖励修复、宠物受伤与敌群扩关 |
| v2.1.20 | 45 | 1228 行 game-render.js | 云同步键自动派生 |
| v2.1.21 | 45 | 1231 行 game-render.js | 迷惑技能、蓄力时序与注释修复 |
| v2.1.22 | 45 | 1269 行 game-render.js | 技能区间接入战斗 |
| v2.1.23 | 45 | 1269 行 game-render.js | 技能区间驱动源与非攻击通道 |
| v2.1.24 | 45 | 1269 行 game-render.js | 睡眠回复与无影拳连击 |
| v2.1.25 | 46 | 1268 行 game-render.js | AFFIXES 词条注册表拆分 |
| v2.1.26 | 46 | 1268 行 game-render.js | 技能区间接入更多通道 |
| v2.1.27 | 46 | 1288 行 game-render.js | RNG 回放与时间旅行 |
| v2.1.28 | 46 | 1288 行 game-render.js | 技能成长曲线与场地固定值 |
| v2.1.29 | 46 | 1288 行 game-render.js | 敌群扩至 21 大关并派生上限 |
| v2.1.30 | 46 | 1288 行 game-render.js | 敌群扩至 24 大关 |
| v2.1.31 | 46 | 1288 行 game-render.js | startCooldown 接线与难度修复 |
| v2.1.32 | 46 | 1288 行 game-render.js | 单敌扩章与技能可用状态修复 |
| v2.1.33 | 46 | 1288 行 game-render.js | 技能差异修复与状态时序修正 |
| v2.1.34 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 27 章 |
| v2.1.35 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 30 章 |
| v2.1.36 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 33 章 |
| v2.2.0 | 46 | 1291 行 game-render.js | 上场宠物 2→4 + 团队凝聚/共鸣 |
| v2.2.1 | 46 | 1291 行 game-render.js | 宠物属性模型口径修正 |
| v2.2.2 | 46 | 1291 行 game-render.js | 属性公式与宝珠重构 |
| v2.2.3 | 46 | 1291 行 game-render.js | 玩家主动技能数值/口径 |
| v2.2.4 | 46 | 1291 行 game-render.js | 新增 weaken/vigil 状态 |
| v2.2.5 | 46 | 1291 行 game-render.js | 启风技能与疾风状态 |
| v2.2.6 | 46 | 1291 行 game-render.js | 玩家技能共享桥 |
| v2.2.7 | 46 | 1291 行 game-render.js | 修平衡脚本加载/装配不全 |
| v2.2.8 | 46 | 1291 行 game-render.js | 平衡脚本补宠物共享装配口径 |
| v2.2.9 | 46 | 1291 行 game-render.js | 金身护盾破盾反伤 |
| v2.2.10~v2.2.20 | 46 | 1292 行 game-render.js | WP-F/WP-G 与一批零散修复 |
| v2.2.21 | 46 | 1292 行 game-render.js | 宠物治疗/属性拆解、挑战月记/重置 |
| v2.2.22 | 47 | 1348 行 game-render.js | 技能槽开放到3、敌群掉落、威吓区间化 |
| v2.2.23 | 47 | 1348 行 game-render.js | 角色等级系统 |
| v2.2.24 | 48 | 1348 行 game-render.js | 等级称号表与倍率裁决 |
| v2.2.25 | 48 | 1348 行 game-render.js | 真实浏览器复盘与浮点/UI修复 |
| v2.2.26 | 48 | 1348 行 game-render.js | WP-I 第一批布局修复 |
| v2.2.27 | 48 | 1348 行 game-render.js | WP-I 第二批战斗页信息密度 |
| v2.2.28 | 48 | 1348 行 game-render.js | WP-I 第三批敌群重置与宠物属性对比 |
| v2.2.29 | 48 | 1409 行 game-render.js | 宠物头像 14 枚与 UI 接入 |
| v2.2.30 | 48 | 1409 行 game-render.js | 宠物头像评审修复（深色可见/alt/32px/角标） |
| v2.3.0 | 49 | 1409 行 game-render.js | 宠物面板布局整理 |
| v2.3.1 | 50 | 1422 行 game-render.js | 怪兽头像原型与接入 |
| v2.3.2 | 51 | 1430 行 game-render.js | 技能图标资源与接入 |
| v2.3.3 | 50 | 1348 行 game-render.js | 战斗页宠物头像 |
| v2.4.0 | 51 | 1949 行 game-render.js | 群战 UI 重构 |
| v2.4.1 | 51 | 1949 行 game-render.js | 敌人技能池补齐 |
| v2.4.2 | 51 | 2207 行 game-render.js | 群战战场化与日志抽屉 |
| v2.4.3 | 51 | 2207 行 game-render.js | 敌方辅助技能改为作用己方 |
| v2.4.4 | 51 | 2230 行 game-render.js | 蓄力日志噪声过滤 |
| v2.4.5 | 51 | 2353 行 game-render.js | 战斗分阶段引擎与日志结构 |
| v2.4.6 | 51 | 2353 行 game-render.js | groupUnitTurn 编排收敛 |
| v2.4.7 | 51 | 2353 行 game-render.js | 4 条群战技能/天赋死接线 |
| v2.4.8 | 51 | 2362 行 game-render.js | 敌人词条装配与疾影/先制度 |
| v2.4.9 | 51 | 2362 行 game-render.js | 训练页快捷记录与动作分组 |
| v2.4.10 | 51 | 2362 行 game-render.js | 隐藏挑战计时/奖励阈值调整 |
| v2.5.0 | 51 | 2362 行 game-render.js | 结算完整性（异常中止/场地结算/双 KO） |
| v2.5.1 | 51 | 2362 行 game-render.js | 单敌伤害事件与护盾口径 |
| v2.5.2 | 51 | 2362 行 game-render.js | 结束回合防重复判定 + 错误上下文 |
| v2.6.0 | 51 | 2362 行 game-render.js | 玩家技能唯一结算入口与目标选择 |
| v2.7.0 | 51 | 2362 行 game-render.js | AI 指定目标真正影响技能选靶 |
| v2.8.0 | 51 | 2362 行 game-render.js | 群战 FX/HP 补间与受击闪烁 |
| v2.8.1 | 51 | 2362 行 game-render.js | 施法/飘字分离与步内分道 |
| v2.8.2 | 51 | 2362 行 game-render.js | 短屏抽屉态裁切修复 |
| v2.9.0 | 51 | 2362 行 game-render.js | 吸血按目标实际掉血 + 技能必中无暴击 |
| v2.9.1 | 51 | 2362 行 game-render.js | 随机技能拒绝 AI 指定目标 |
| v2.10.0 | 51 | 2362 行 game-render.js | 场地 DOT 分档减免 + 酷暑攻击后灼伤 |
| v2.10.1 | 51 | 2362 行 game-render.js | 跨步飘字占位登记（纯表现） |
| v2.11.0 | 51 | 2656 行 game-render.js | 演出吞吐与数字目标锚定 |
| v2.11.1 | 51 | 2734 行 game-render.js | 状态标记/受击高亮；默认飘字重叠收口 |
| v2.11.2 | 51 | 2716 行 game-render.js | 回退驱逐 + 引擎插桩证实探针伪影 |
| v2.11.3 | 51 | 2716 行 game-render.js | 单敌演出按窗口聚合 |
| v2.11.4 | 51 | 2716 行 game-render.js | 单敌状态反馈；修护盾碎裂语义 |
| v2.11.5 | 51 | 2738 行 game-render.js | 抽屉态反馈（保留芯片锚定，隐藏中央 FX） |
| v2.12.0 | 51 | 2861 行 game-render.js | 单敌/敌群终局 800ms → 1200ms → 战绩分层；auto 胜利战果 ≥2s；纯 UI 流程（引擎逐字节不变） |
| v2.13.0 | 52 | 2924 行 game-render.js | 战斗历史（100 条 FIFO）+ 分模式长期统计；纯记账/展示，引擎逐字节不变 |

> **「JS文件数」** = `page/` 下 `*.js` 文件数量（**含子目录**，如 `page/data/exercises-dataset.js`）→ 本版实测 **52**
> （v2.12.0 的 51 + 本版新增 `page/battle-history.js`）。
> **「最大文件」** = `page/*.js` 中 `\n` 计数（即 `wc -l`）最大者 → 本版实测 `game-render.js` **2924 行**（次席 `battle-group.js` 2056 行）。
> ⚠️ 本表 v2.11.0–v2.11.5 六行的「最大文件」在 **v2.12.0** 已按各版本发布提交勘误（2362 → 2656/2734/2716/2716/2716/2738）；
> `doc/changelog-v2.11.md` 内同一张表的对应行未回改，以本表为准。更早的历史行沿用各自版本的原始记录，未逐版重测。

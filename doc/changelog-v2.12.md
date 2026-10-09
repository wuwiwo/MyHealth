# v2.12 变更日志

> 本文件只记录 **v2.12.x** 的变更。v2.11 及更早见 `doc/changelog-v2.11.md`。
> `2.11.6` 未领用：本次依仓库策略开启新代码大类，领用 `2.12.0`。

---

## v2.12.0

Date: 2026-10-10

**批次 A：战斗终局分阶段呈现**（施工计划 `doc/plans/战斗体验施工计划.md` §1/§3；实施为 DeepSeek Flash v4.1 子代理，Lead 独立验收）

只改演出/流程层，**引擎、数值、RNG、胜负与奖励口径一行未改**：固定种子 A/B（基线 HEAD `a67fdd2` 对
本批工作区）三组对照**逐字节一致**（见下）。

### 新增功能

- **单敌与敌群统一「胜负 → 战果 → 战绩/继续」分层**：普通流程胜负 **800ms**、战果 **1,200ms**，之后自动进入
  战绩层；阶段推进由 timer + **绝对 deadline**（`Date.now()`）驱动，**不依赖 `animationend`**（后台标签页节流
  不会卡住流程）。
- **显式「继续」**：胜负层与普通战果层都提供 `#battleOutroContinue`「继续」，可提前推进到下一展示层；
  不支持点背景隐式跳过；每次推进先取消当前阶段 timer，**单向、幂等**。
- **单敌自动连战**：胜利路径先展示胜负 800ms，再展示**已入账**战果**至少 2,000ms**；到期时仅当 auto 仍开、
  overlay 仍开且用户未中止才进入下一关。auto 胜利的战果层提供 `#battleViewRecord`「查看战绩」（无「继续」），
  点击后**取消自动推进**并进入战绩层。
- **群战胜败同序**：胜负 800ms → 战果 1,200ms → 详细统计；本轮**不给敌群增加自动连战**。
- **本场快照**：结算时快照本场 `levelId`/NPC、奖励文案与真实失败副作用；终局页与分享卡片按**本场快照**渲染。
- **`prefers-reduced-motion`**：抑制胜利彩带并减弱过渡，**阶段时长不变**。

### 修复

- **F1 群战详情面板崩溃**（暖路径）：`_openDetailPanel` 在 `invalidateGroupOutro()` 把 `_gbOutroActive` 置 null
  **之后**仍写 `_gbOutroActive.phase='detail'` → `TypeError: Cannot set properties of null`。改为先保存引用、
  标记 `phase`，再作废 outro（语义不变：外来详情面板打开即作废过期阶段，防其覆盖玩家操作）。
- **单敌跨后台多阶段追赶**：旧实现恢复时只重排一次 timer → 页面隐藏期间跨过 800ms + 1200ms 两个 deadline 后
  只前进一层、并把下一层**重新计满**。现改为循环消费所有已过期阶段（一次收敛到战绩层），剩余时间按
  `Math.max(0, deadline - Date.now())` 重排，token/session/overlay 守卫拒绝过期 callback。
- **分享卡片显示错关**：胜利结算已把 `getGame().current` 推进到下一关，旧 `showShareCard()` 反查 current →
  分享的是**下一关**。现改为 `startBattle(id)` 记录本场 `_battleLevelId`，结算与分享都用本场快照。
- **群战无本场战斗时的假结算**：`_groupBattle === null` 时旧 `_groupDone()` 仍走失败分支（结算宠物受伤 +
  打开一份「💀 失败」面板）→ 顶部加 `if(!_groupBattle)return`。
- **单敌重复结算**：`endBattle` 加 `_settled` 守卫 + session token，重复调用不再二次发奖/推进/计失败。
- **奖励 toast 与统计并发抢读**：群战胜/败路径的 `toast(msg)` 改为写入 `_groupOutcomeMessage`，并入战果层。
- **单敌 phase timer 在离开本场流程时未清除**：关闭、重试、下一关、分享、新战斗、异常中止现在都取消阶段/
  auto/开场 timer（`cancelSingleBattleTimers()`），旧 callback 不得影响新场。
- **彩带遮挡结果卡片**：`celebrate()` 原在结算瞬间触发（全屏 3.5s），会盖住 800/1200ms 阶段；现移到**进入
  战绩层时恰好一次**，并把彩带容器（`celebrate()` 新建的 `#cfLayer`）裁到 **70vh**，使粒子不进入结果卡片区域。
- **`page/index.html` / `page/tab-game.js` 的 UTF-8 BOM 恢复**：工作区丢 BOM 造成与主线无关的整行 diff 噪声，
  按字节写回（`git diff` 只剩 cache-busting 与本批功能行）。

### UI 调整

- 结果层按阶段重建 DOM：胜负层只有结论 + 「继续」；战果层只有已入账奖励/通关变化或真实失败副作用
  （失败为「未获得奖励 · 本次失败已记录」）+ 「继续」；战绩层才出现「下一关 / 分享卡片 / 重新挑战」。
- auto 胜利战果层新增 `.be-auto-note` 提示；新增 reduced-motion 两条规则
  （`.be-loot`/`.be-btn` 弱化 + `[id^="cf"]` 抑制彩带）。
- 群战结果面板加 `data-group-outro="outcome|reward|stats"` 标记，用于阶段自校验（防过期阶段重绘）。

### 测试与验证（全部为本机实跑结果）

**相关套件（改动后实跑）**

| 套件 | 结果 | 变化 |
|---|---|---|
| `scripts/test-battle.js` | **141 / 0** | 105 → 141（新增 §11 十条 + §12 二十六条） |
| `scripts/test-group-ui-presentation.js` | **493 / 493** | 470 → 493（新增 §28 九条 / §29 五条 / §30 九条） |
| `scripts/test-auto-speed.js` | **49 通过** | 夹具改为假时钟（fire 时把时钟推进到该 timer 的到期时刻） |
| `scripts/test-a11y-tokens.js` | **40 / 40** | — |
| `scripts/test-group-determinism.js` | **14 / 14** | — |
| `scripts/test-group-battle.js` | **35 / 0** | — |

**项目全量**：`scripts/test-*.js` 逐套件扫描 **64 套件 / 4,704 断言 / 0 失败 / 0 UNKNOWN**（v2.11.5 基线
4,609 → +95）。口径说明：本机 `test-release-hook` 走 24 条分支；node spawn 被禁的沙箱为 23 条 → 4,703，
两种口径均 0 失败（差异不是回归）。

**先红后绿（把本批测试跑在基线 HEAD `a67fdd2` 的 `page/` 上，均为 rc=1）**

- `test-battle`：新断言判红，含「重复 `endBattle` 结算幂等」实测 **炼化点 4 → 8、cleared 1 → 2 关**（双发奖励）。
- `test-group-ui-presentation`：§25a 判红（结算后**仍发**奖励 toast、直接并发统计面板）、§30a/§30d 判红
  （重复 `_groupDone` 重开结果面板）。
- `test-auto-speed`：判红「胜负阶段先等待 800ms — 实际 2000」「自动胜利战果阶段至少显示 2000ms — 实际 200」。

**固定种子 A/B（基线 = `git archive HEAD` 副本，两侧同一夹具，输出 sha256 逐字节比对）**

| 对照 | 规模 | 结果 |
|---|---|---|
| 单敌纯引擎 | 40 种子 × 4 关卡 = **160 场** | sha256 `BB257309…` **一致** |
| 单敌 UI + 结算链（含引擎日志渲染） | 1-1 / 3-2 / 7-3 / 12-3 **4 场** | sha256 `045A8DF8…` **一致** |
| 敌群真实大关 | g3–g14 × 3 小关 × 3 种子 = **36 场**（含场地/各单位 HP/日志条数） | sha256 `BAE86A1A…` **一致** |

**真实 Chromium（自建 CDP 夹具；Chrome `--headless=new`，先 `switchTab('game')` + `switchGameTab('battle')`
让战斗 overlay 真正可见；**47 / 47 检查通过**）

| 路径 | 实测 |
|---|---|
| 单敌胜（手动） | 胜负→战果 **814ms** → 战绩 **2013ms**；彩带仅出现在战绩层；奖励与战果文案对账一致（+2 炼化点，进度只推进一次） |
| 单敌败（auto 曾开） | 808 → 2005ms；auto 已关闭、不自动重试、attempt 只 +1、战果为「未获得奖励」 |
| 单敌异常中止 | 显示异常面板；无胜负/战果文案；奖励/进度/失败次数**零变化**；关闭后 `renderGame()` 不抛错 |
| 单敌 auto 胜 | 战果层 **810ms** 出现（含「查看战绩」，无「继续」）；点「查看战绩」取消自动进关并进战绩层；不打断时 **2808ms** 自动进入下一关（1-1 → 1-2 已在战斗） |
| 敌群胜 / 败 | 胜负→战果 **816/824ms** → 统计 **2010/2044ms**；战果为真实奖励文案（败方为「无奖励」）；全程**零并发奖励 toast** |
| 360×640 / 390×844 | 无横向溢出（`scrollWidth == clientWidth`）；「下一关/重新挑战」在视口内且 `elementFromPoint` 命中 |
| 深色 / 浅色 | 结果层均可见可操作 |
| `prefers-reduced-motion: reduce` | 彩带 `animation-name: none` + `opacity: 0`；阶段时长**不变**（805 → 2010ms） |
| 遮挡（像素级） | 彩带容器被裁到 **70vh（591px）**，结果卡片自 y=719 起；战绩层彩带窗口内 **13 次卡片区域像素采样零变化**（同内容两次截图字节一致，自检有效） |
| 控制台 | **0** 意外 `console.error` / **0** 未捕获异常（唯一一条是本夹具刻意注入的引擎异常，用于验证异常路径） |

### 本次新增 / 修改文件

| 文件 | 变化 |
|---|---|
| `page/game-battle.js` | 终局分层与绝对 deadline 计时、`_battleLevelId` 本场快照、`showShareCard` 用快照、`celebrate()` 移到战绩层、离开本场流程取消 timer |
| `page/game-render.js` | 群战阶段状态机（state/generation/token）、`_groupDone` 空 battle 守卫、移除并发奖励 toast、`_openDetailPanel` 空引用崩溃修复、真实战绩面板接入阶段标记 |
| `page/utils.js` | `APP_VERSION` 2.11.5 → **2.12.0**；`celebrate()` 容器加 `#cfLayer`（供裁剪） |
| `page/index.css` | reduced-motion 规则、`.be-auto-note`、`#cfLayer{height:70vh}` |
| `page/tab-game.js` | overlay 关闭 / 关 auto 时取消挂起 timer（+ 恢复原有 UTF-8 BOM） |
| `page/index.html` | cache-busting `?v161` → **`?v162`**（+ 恢复原有 UTF-8 BOM，消除整行噪声） |
| `scripts/test-battle.js` | 沙箱升级（可控时钟、`innerHTML` 重建 id 节点、document/window 监听）+ §11/§12 共 36 条 |
| `scripts/test-group-ui-presentation.js` | §25–§27（分批呈现/显式推进/跨 deadline 追赶）+ §28–§30（F1 崩溃、空 battle、真实面板不 mock） |
| `scripts/test-auto-speed.js` | 夹具改假时钟（不再提前触发 timer）；删掉为迁就夹具而加的生产代码上界夹取 |
| `README.md` | 版本副标题 / 版本历史行 / 当前版本指针 |
| `doc/VERSION-LEDGER.md` | 2.12.0 领号与发布登记；指针 2.11.6 → **2.12.1**（`2.11.6` 保留空缺） |
| `doc/HANDOFF.md` | v2.12.0 交付状态、测试与浏览器实跑口径 |
| `doc/changelog-v2.12.md` | 新增本版变更日志 + 完整架构演化表（含 v2.11.x 行勘误） |

### 本版未做 / 已知取舍（如实登记）

- **auto 胜利直接进下一关时不放彩带**（不经过战绩层）——已用断言固定该行为，避免彩带跨到下一场。
- 真实浏览器未覆盖横屏/超短视口；`#cfLayer` 的 70vh 裁剪在「结果卡片顶部高于 70vh」的极端矮屏上可能
  允许粒子掠过卡片边缘（此时 `pointer-events:none` 仍保证按钮可点）。
- 群战引擎异常（abort）路径**未新增**，仅沿用既有行为；本批只把单敌既有 tick/render 异常作为第三结局保留。
- 单场历史摘要与长期统计属于**批次 B**，本版未启动。

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

> **「JS文件数」** = `page/` 下 `*.js` 文件数量（**含子目录**，如 `page/data/exercises-dataset.js`）→ 本版实测 **51**。
> **「最大文件」** = `page/*.js` 中 `\n` 计数（即 `wc -l`）最大者 → 本版实测 `game-render.js` **2861 行**（次席 `battle-group.js` 2056 行）。
> ⚠️ **勘误（2026-10-10，v2.12.0）**：本表 v2.11.0–v2.11.5 六行的「最大文件」此前沿用了 v2.4.8 时代的 **2362**（未随版本更新）。
> 按各版本发布提交实测更正为 v2.11.0 **2656** / v2.11.1 **2734** / v2.11.2 **2716** / v2.11.3 **2716** / v2.11.4 **2716** / v2.11.5 **2738**
> （与 `doc/changelog-v2.11.md` 正文「2656 → 2734」「2734 → 2716」等记述一致；`doc/changelog-v2.11.md` 内同一张表的对应行**未回改**，
> 以本文件为准）。更早的历史行沿用各自版本的原始记录，本轮未逐版重测；如需精确值按
> `git show <commit>:page/game-render.js` 计数复核。

# MyHealth v1.9 Release Notes / 变更日志

**Date:** 2026-08-12

本版本是 v1.8 后的第一次 minor 升级。涵盖三大维度的投入：

1. **架构加固** — store 数据安全、网络重试、Blob 无限膨胀修复、tab-game 模块拆分
2. **产品功能** — 今日速览卡片、旬目标进度条+结算预告、战斗胜利战利品、游戏规则引导、30 天趋势图
3. **UX 体验** — 力量/有氧记录动线简化（提交后保留上下文支持连记）、空状态直达按钮

---

## v1.9.0

### 新增功能

- 📅 **今日速览卡片**（训练 tab 顶部）
  - 本周训练天数 X/7 天 + 进度条 + "还差 N 天达标"
  - 本旬训练天数 X/6 天 + 进度条
  - 旬容量 已练/目标 kg + 进度条
  - 今日训练状态指示（✅ 已训练 / 💤 还没动）
  - 底部说明：满 4 天周奖励，满 6 天旬奖励
  - 数据变化自动刷新（力量 / 有氧任一记录触发渲染）

- 🗓️ **旬目标进度条 + 结算预告**（挑战 tab 属性栏下方）
  - 双进度条：训练天数 0/6、训练容量 0/N kg
  - 颜色分级：达标绿色 / 进展中橙色 / 零状态灰色
  - 结算预告文字：实时显示当前进度下的得失
    > ⚖️ 天数还差 6 天 **-18 攻 -9 防** · 容量还差 2500kg
    > （达标后变成）天数达标 **+30 攻 +6 防** · 容量达标 **+60 攻 +12 防**

- 🎁 **战斗胜利战利品**
  - 每关胜利随机获得 +1~3 炼化点（存入 refine.points 银行）
  - 胜利面板显示 `🎁 战利品 +N 炼化点`，带弹出动画（`@keyframes lootPop`）
  - 未通关 9-6 时点数先存储，解锁炼魂系统后可用

- 🎮 **游戏规则首次引导**
  - 首次进入挑战 tab 弹出"🎮 游戏规则"卡片
  - 说明：训练→属性映射、旬奖励/惩罚、Boss 挑战规则、每日失败上限
  - "开始挑战"按钮关闭，localStorage 标记 `dh-game-guide-done` 不再打扰

- 📊 **最近 30 天趋势图**（个人 → 训练数据）
  - 每日力量容量曲线（kg，橙色）
  - 每日有氧时长曲线（分钟，蓝色，有数据才显示）
  - 复用现有 linechart.js，与 6 月份趋势共存
  - 无数据时不渲染，避免空卡片视觉污染

### UI 调整

- ⚡ **力量记录动线简化**（UX 核心改进）
  - 提交后保留动作名 / 重量 / 目标次数不变
  - 实际次数自动重置回目标值
  - 表单不被收起，按钮保持 "✖ 收起"
  - Toast 引导："✅ 记录成功！继续下一组或 ✖ 收起"
  - 同动作连记 4 组 = 4 次点击"⚡ 记录"（中间只需调实际次数）

- ⚡ **有氧记录动线简化**
  - 提交后保留运动类型 / 时长 / 强度 / 距离
  - 只清空备注
  - 表单不收起，支持连记

- 📭 **空状态直达按钮**
  - 力量训练计划空状态新增 "+ 新建计划" 按钮（原本只有文字提示）
  - 有氧训练计划同理
  - 一级触达创建计划编辑器，减少视觉断层

- 🎨 **CSS 版本号统一**
  - `index.css` 从 `?v1` 一路跟随 JS 升到 `?v5`（之前 CSS 一直停在 v1，从未 bump）
  - 全部 JS / CSS 统一 `?v5` → `?v6`（随 v1.9 发布）

### 架构重构

- 🔐 **store.js v1.2 — 数据安全读取**
  - 为 16 个已知 key 定义 SHAPES schema 白名单
    （strength `{entries:[]}`、game `{cleared:[],current:''}` 等）
  - `get` 时校验数据结构，损坏数据返回 null，不再让一条坏数据崩溃全 app
  - `mergeAll` / `setAll`（云同步 / 导入）过滤非法结构，云端脏数据进不来
  - localStorage 配额保护：`setItem` 抛错时 `toast` 提示导出备份

- 🔄 **sync.js — 网络层自动重试**
  - `apiPut` / `apiGet` 失败后自动重试 2 次，指数退避（400ms → 800ms）
  - 弱网环境不再一抖就报"同步失败"

- 🗑️ **api/data.mjs — Blob 旧文件清理**
  - 发现原逻辑：每次 PUT 新建一个 blob 文件，永不删除 → 免费额度被历史快照吃光
  - 新增 `cleanupOldBlobs()`：PUT 后异步清理，只保留最近 20 份快照
  - 使用 `del` SDK 函数批量删除

- ✂️ **tab-game.js 模块拆分**（675 行上帝模块 → 5 个文件）
  - `game-render.js`（263 行）— 关卡渲染、属性计算、预览、updateGameBar
  - `game-battle.js`（151 行）— 战斗 UI、动画、结束流程、分享卡片
  - `game-records.js`（113 行）— 历史记录、属性变更日志
  - `game-refine.js`（119 行）— 炼魂系统弹窗、批量炼化
  - `tab-game.js`（24 行）— onGameEvent 事件入口

- 🧩 **app.js — 事件路由注册表化**
  - 5 个 tab handler 改为注册表数组 `getTabHandlers()`
  - Dispatch 用 `try/catch` 包裹每个 handler，单模块异常不再阻断其他模块

- 🛠️ **utils.js — openModal 公共 helper**
  - 新增 `openModal(html, id)` 统一 modal 创建：创建 overlay + class + append + backdrop 点击关闭
  - 替换原有 13 处重复的 `document.createElement + className + appendChild` 模式
  - 保留兼容：重复 `appendChild(modal)` 无副作用（同节点重复添加为移动操作）

### 修复

- 🩹 **修复 `getGameStats` 空数据崩溃**（潜伏 bug）
  - 原代码：`if(!getGame().permPen)getGame().permPen={atk:0,def:0}` — 当 `store.get('game')` 返回 null 时，每次 `getGame()` 都返回新对象，`permPen` 被设置到临时对象上，下次 `getGame()` 又丢失
  - 修复：一次性持久化 `setGame(g)`，后续 `getGame()` 拿到同一对象
  - 全新安装 / 清空 game 数据后不再白屏

- 🩹 **修复 `trackStats` null 读取崩溃**（潜伏 bug）
  - 原代码：`var strVolDiff=last.strVol?...` — 当 `last=null`（attrLog 为空的第一条记录）时抛 `Cannot read properties of null`
  - 修复：加判空 `last&&last.strVol?...`
  - 新用户首次训练时不再崩溃

### 数据层变更

- `store.js`：新增 `SHAPES` 校验白名单、`isShape()` 递归校验、`validValue()` 入口、`notifyQuota()` 配额提示
- `sync.js`：`apiPut` / `apiGet` 加 `attempt` 参数支持重试
- `api/data.mjs`：新增 `cleanupOldBlobs()` 函数，`del` 函数引入
- `app.js`：删除 5 个 `if(onXxxEvent(el,id,act))return` 串行调用，改为 `getTabHandlers()` + 循环
- `utils.js`：新增 `openModal()` 函数
- `game-render.js`：`getGameStats` 使用局部 `var g=getGame()` 复用对象
- `game-records.js`：`trackStats` 的 `last.strVol` / `last.carEff` 加判空
- `game-battle.js`：`endBattle` 胜利分支加战利品逻辑

### 新增文件

- `page/game-render.js`（263 行）— 从 tab-game.js 拆出
- `page/game-battle.js`（151 行）— 从 tab-game.js 拆出
- `page/game-records.js`（113 行）— 从 tab-game.js 拆出
- `page/game-refine.js`（119 行）— 从 tab-game.js 拆出

### 修改文件

- `page/store.js`（v1.1 → v1.2，3.3KB → 5.9KB）
- `page/sync.js`（16.9KB → 17.3KB）
- `page/api/data.mjs`（2.0KB → 2.3KB）
- `page/app.js`（14.5KB → 14.9KB）
- `page/utils.js`（5.5KB → 5.9KB）
- `page/tab-game.js`（38.9KB → 1.4KB，仅保留 onGameEvent）
- `page/tab-strength.js`（+ renderTodaySnapshot / 动线优化 / 空状态按钮）
- `page/tab-cardio.js`（动线优化 / 空状态按钮）
- `page/tab-profile.js`（+ 30 天趋势图 buildLast30Days）
- `page/game-render.js`（+ renderPeriodCard / 引导卡片 / getGameStats 空数据修复）
- `page/game-records.js`（trackStats 判空修复）
- `page/game-battle.js`（+ 战利品逻辑）
- `page/index.html`（新增 #todaySnapshot / #periodCard 容器，script 版本号 v2 → v6）
- `page/index.css`（+ snap-card / period-card / be-loot 样式，版本号 v1 → v6）

---

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
| v1.7 | 13 | 421 行 tab-game.js | 动作描述/旬周期/体重图/同步修复 |
| v1.7.1 | 13 | 421 行 tab-game.js | 每月自动重置关卡/旬规则7月生效 |
| v1.7.2 | 13 | 421 行 tab-game.js | 基础属性改为本月窗口 |
| v1.7.3 | 13 | 421 行 tab-game.js | 旬奖励永久累积(permBonus) |
| v1.7.4 | 13 | 421 行 tab-game.js | 补发6月旬奖励+180攻防 |
| v1.7.5 | 13 | 500 行 tab-game.js | 防御奖励1/5/自动模式/打击动画 |
| v1.7.6 | 13 | 480 行 tab-game.js | 等效重量/计时动作/折算率10~100% |
| v1.8 | 13 | 575 行 tab-game.js | 10-15章/炼魂系统/魂攻防/秒数bug修复 |
| v1.8.1 | 13 | 575 行 tab-game.js | 炼化顺序升级/批量1-10-50次 |
| v1.8.2 | 13 | 575 行 tab-game.js | 浮点显示修复/batch按钮disabled修复 |
| v1.8.3 | 13 | 575 行 tab-game.js | 炼化三重防御/编码修复/cache-busting v2 |
| v1.8.4 | 13 | 575 行 tab-game.js | index.html UTF-8 编码修复 |
| v1.8.5 | 13 | 575 行 tab-game.js | doRefineBatch 内联循环+诊断 |
| v1.8.6 | 13 | 575 行 tab-game.js | 循环诊断+中断原因输出 |
| v1.8.7 | 13 | 575 行 tab-game.js | allDone 判断修复(allMaxed && !nextGrade) |
| v1.9.0 | 17 | 397 行 tab-strength.js | tab-game拆5模块/store v1.2校验/sync重试/Blob清理/今日速览/旬目标卡/战利品/引导/30天图/UX动线/openModal/事件路由注册表 |
| v1.9.1 | 18 | 397 行 tab-strength.js | 隐藏挑战召唤+小游戏/伤害转月度属性奖励/常用动作频次排序/等效重量突出 |
| v1.9.2 | 18 | 397 行 tab-strength.js | 召唤每100kg叠加次数与几率/预览确认界面/热血buff(周4天解锁)/训练记录等效容量与倍率 |

---

## v1.9.1

**Date:** 2026-08-14

本版本聚焦**游戏化"隐藏挑战"召唤系统** + **训练动效与动作排序**优化，用以对抗近期锻炼兴趣下降的趋势。

### 新增功能

- 🔮 **隐藏挑战召唤系统**（全部新增）
  - **解锁条件**：当天训练容量 ≥ 100kg 自动解锁召唤面板（训练 tab 顶部）
  - **召唤概率**：初始成功率 15%，每次失败累计 +10%，直到成功为止（15→25→35...→100%）
  - **每天最多成功召唤 1 次**：成功后当天进入"已完成"状态，不可再召唤
  - **跨天重置**：失败次数每天 0 点清零，重新从 15% 开始
  - **召唤机会次数** = 训练容量 / 100（仅展示，实际每天可多次尝试直到成功）

- 🎮 **隐藏挑战小游戏**（召唤成功后触发）
  - **倒计时 8-12 秒**（随机），紧迫感拉满
  - **点击攻击按钮造伤害**，每次伤害 = `(攻击 + 魂攻击) × 10% × random(0.5~1.5)`
  - **20% 暴击概率**，暴击时附加 `(防御 + 魂防御)` 额外伤害
  - 实时展示：总伤害计数 / 命中次数 / 暴击次数 / 最强一击 / 命中日志
  - 视觉强化：大字体伤害显示、攻击按钮 pulse 动画、暴击黄色高亮

- 🎁 **伤害 → 月度属性奖励转化**
  - 每 500 伤害 → +1 攻击
  - 每 750 伤害 → +1 防御
  - 每 150 伤害 → +3 生命
  - **每月 1 号自动重置**（与关卡月重置同步，不进 permBonus）
  - 游戏页属性栏自动加载 challenge bonus

### UI 调整

- ⚡ **常用动作按频次排序**
  - 训练 tab 的动作推荐按钮，按历史使用频次排序（最常用的排在最前）
  - 新增一组时常用动作触手可及，快速点击

- ⚖️ **等效重量突出显示**
  - 动作库：等效重量信息色升级为橙色，加注"不计哑铃重量"提示
  - 更直观区分哑铃动作 vs 自重动作

### 数据层变更

- 新增 store key `challenge`：
  ```
  {
    summonedDate: '',   // last successful summon date
    seasonBonus: {atk:0, def:0, hp:0},  // monthly-reset bonus
    todayFailCount: 0,  // today's summon failures
    failDate: ''        // date of todayFailCount (for daily reset)
  }
  ```
- `store.js`：新增 `challenge: 'object'` schema 校验
- `stats.js`：`calculateStats` 新增第 9 参数 `challengeHp`
- `game-render.js`：`getGameStats` 读取 `getChallengeBonus()` 并加到属性
- `app.js`：`init` 调用 `renderSummonPanel`，`checkMonthlyReset` 调用 `resetChallengeSeason`
- `sync.js`：`getAllData` / `mergeServerData` / `buildImportMap` 加 `challenge` 字段同步

### 新增文件

- `page/challenge.js`（约 280 行）— 召唤逻辑 + 面板 UI + 小游戏 + 奖励结算

### 修改文件

- `page/app.js`（init 刷新 + 月重置 + strSuggest 频次排序）
- `page/stats.js`（calculateStats 加 challengeHp 参数）
- `page/game-render.js`（getGameStats 集成 challengeBonus）
- `page/tab-strength.js`（renderStr 调用 renderSummonPanel）
- `page/tab-cardio.js`（renderCar 调用 renderSummonPanel）
- `page/tab-settings.js`（exCardHtml 等效重量提示优化）
- `page/sync.js`（challenge 同步字段）
- `page/store.js`（challenge schema）
- `page/index.html`（#summonPanel 容器 + challenge.js script + cache-busting v6→v7）
- `page/index.css`（summon-card / 挑战小游戏样式）

---

## v1.9.2

**Date:** 2026-08-14

### 改版（隐藏挑战）

- ⚡ **召唤规则改为每 100kg 叠加**
  - 召唤次数 = ⌊当日容量 / 100⌋（每 100kg +1 次）
  - 第 i 次尝试成功率 = 15% + 10%×(i-1)（第 1 次 15%，第 2 次 25%，第 3 次 35%...）
  - 替代旧的"固定 15% + 失败 +10%"规则
  - 面板显示：剩余次数 X/N、本次成功率（第 i 次）、逐次+10% 提示

- 🔘 **召唤成功后需要按"开始挑战"才正式倒计时**
  - 新增加预览确认界面：显示召唤成功、倒计时说明、当前属性四维、伤害公式提示
  - 「⚔️ 开始挑战」按钮才开始 8-12s 倒计时，「稍后再说」可退出（当日仍标记已完成）
  - 避免误触直接进入紧张的倒计时游戏

- 🔥 **热血 buff（每周）**
  - 本周内成功开启挑战累计 4 天（连续 3 天 + 今天的第 4 次）时触发
  - 随机三选一（复合 buff）：
    - 🔥 暴击率 +50% 且 暴击伤害 +20%
    - 🔥 暴击伤害 +200% 且 暴击率 +10%
    - 🔥 倒计时 +100%（基础时间锁定 80%~100% 高值区间 11.2~12s），且每经过 5s 本次伤害 +10%（可叠加）
  - 每周最多触发 1 次（hotBuffUsed 标记，每周一重置）
  - 触发时预览界面和游戏界面都会显示 buff 高亮横幅
  - 设计意图：暴击附加伤害 = (防御+魂防)，让防御属性在挑战中直接转化为输出；暴击率 buff 让该转化高频发挥

- ⚡ **训练记录显示等效容量与倍率**
  - 每条力量记录新增 `⚡ 等效 Xkg` 标签（重量×实际次数×ratio/100）
  - ratio ≠ 100% 时显示倍率（如 ×0.5 与倍率 50%）
  - 等效重量动作（eqWeight）与普通哑铃动作都适用

- 🧮 **伤害公式重构（防御直接进基础伤害）**
  - 基础伤害 = 攻击×50% + 魂攻击×150% + 防御×100% + 魂防御×100%，再乘随机(0.5~1.5)
  - 防御/魂防直接贡献基础伤害 → 防御属性在挑战中彻底翻身，不再只挨打
  - 暴击改为倍率制：基础率 20%，暴击时伤害 ×1.5（不再附加固定值）

- 🔥 **热血 buff 数值迭代（最终版）**
  - 暴击率：+55% 且 暴击伤害 +35%（倍率 150%→185%）
  - 暴击伤害：+120% 且 暴击率 +15%（倍率 150%→270%）
  - 倒计时：+40%（基础时间锁定 70%~100% 高值区间 10.8~12s）
  - 模拟验证（真实属性 100000 场）：三 buff 绝对伤害差距 ≤11.1%，达到设计目标

- 🎁 **奖励阈值提高 200%**
  - 每 1500 伤害 → +1 攻击（原 500）
  - 每 2250 伤害 → +1 防御（原 750）
  - 每 450 伤害 → +3 生命（原 150）
  - 防止隐藏挑战成为属性成长主导引擎，回归"补充奖励"定位

### 数据层变更

- store key `challenge` 字段更新：
  - `todayFailCount`/`failDate` → `todayUsed`/`useDate`（当日已用召唤次数）
  - 新增 `weekDays`（本周成功开启日期数组）、`weekKey`（周一起始日期）、`hotBuffUsed`（本周热血 buff 是否已用）

### 修改文件

- `page/challenge.js`（召唤规则/预览确认/热血 buff）
- `page/tab-strength.js`（训练条目等效容量与倍率标签）
- `page/index.css`（summon-hot / ch-hotbuff / ch-preview 样式）
- `page/utils.js`（APP_VERSION 1.9.1 → 1.9.2）
- `page/index.html`（cache-busting v7 → v8）
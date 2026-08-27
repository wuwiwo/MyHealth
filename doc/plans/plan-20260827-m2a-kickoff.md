# plan-20260827：v2.0 开工规划 —— 首切片「时间基座 + 战场骨架」+ 并行「存储注册表」

**状态**：已定稿，待执行
**上游文档**：`doc/design-v2.0.md`（设计权威）、`doc/plan-v2.0-implementation.md`（路线/模块/架构已定，本文细化执行层）、`AGENTS.md`（版本/提交纪律）、`CONTEXT.md`（已实现映射）

**结论先行**：第一个动代码的切片是 **S1「时间基座 + 战场骨架（单敌等价护栏）」**，即 M2a 的第一刀；同时并行开工 **S0「store.js schema 注册表改造」**。S1 全程零用户可见变化（仅 `test:`/`refactor:` 提交），APP_VERSION 不动；S0 与 S1 文件集互斥，天然可双代理并行。二者完成后，M1-经济、M4-离线两条并行线即可解锁。

---

## 一、首切片界定与理由（Q1）

### 为什么是这一刀

1. **路线已解锁**：M2a 是所有战斗相关里程碑（M2b/M1挂钩/M3/M5/M6）的地基，无前置依赖；M1-战斗挂钩明确等它。
2. **风险结构最优**：等价护栏模式（golden 快照 + 公共 API 冻结）让"最大架构风险（Unit 层/行动队列/状态框架替换 battle.js 内部）"与"最小用户风险（零可见变化、可整提交回滚）"同时成立。
3. **一次激活整个并行窗口**：时间基座（date-roll/monthly-reset）是 M1-经济与 M4-离线的共同前置；store 注册表是所有新持久化键的前置。首切片把它们一并落地，S1 收尾时两条并行线同时解锁。
4. **符合依赖方向**：unit → state-core → battle 的依赖序在最小扇出点先行验证，任何返工都被锁在纯函数域内。

### (a) 文件清单

| 文件 | 动作 | 职责定位 |
|---|---|---|
| `page/date-roll.js` | 新增 | 本地日历日/月纯函数（无任何依赖） |
| `page/monthly-reset.js` | 新增 | 自然月窗口与重置判定（依赖 date-roll） |
| `page/unit.js` | 新增 | Unit 结构、工厂、查询（纯数据，无依赖） |
| `page/state-core.js` | 新增 | 状态注册表 + 生命周期 hook 调度（无依赖） |
| `page/battle.js` | 修改（仅内部） | 战场编排：公共 API 冻结，内部骨架化 |
| `page/stats.js` | 点状修改 | 仅月度重置委托（Commit B2，见待裁决 #3） |
| `index.html` | 点状修改 | 插入 4 个 script 标签（load 顺序见下） |
| `tests.html`（根目录）+ `page/_tests/*` | 新增 | 无构建测试载体，**不被 index.html 引用** |
| `page/store.js` | 仅 S0 代理 | schema 注册表改造（见第二节） |

**index.html 插入位**：date-roll.js、monthly-reset.js 置于 stats.js 之前；unit.js、state-core.js 置于 battle.js 之前。index.html 编辑权归 S1 代理独占（S0 无新文件），避免并行冲突。

### (b) 每文件功能点

**`page/date-roll.js`** —— 全部函数接受可选 `now`（默认 `new Date()`），模块内禁止直接读时钟/DOM/store；一律本地日历日，禁止 UTC 比较与毫秒差算天数。

| 函数签名 | 说明 |
|---|---|
| `todayParts(now) -> {y, m, d, dow}` | 本地日历分解，m 从 1 计 |
| `dateKey(now) -> 'YYYY-MM-DD'` | 日键；**开工第一步核对 challenge.js 现有 lastDate 键格式并对齐**（以生产格式为准） |
| `monthKey(now) -> 'YYYY-MM'` | 月键 |
| `daysBetween(keyA, keyB) -> int` | 日历日差（DST 安全） |
| `monthKeyAdd(key, n) -> key` / `monthKeyDiff(a, b) -> int` | 月算术/跨月数（长离线补结用） |
| `daysInMonth(y, m) -> int` / `isLeapYear(y) -> bool` | 基础 |
| `isClockRolledBack(lastKey, nowKey) -> bool` | 时钟回拨判定（字符串序比较） |

**`page/monthly-reset.js`** —— 策略无关：util 只判"是否/跨了几个月"，领域模块定"重置什么"。

| 函数签名 | 说明 |
|---|---|
| `resolveMonthWindow({lastMonthKey, now}) -> {rolled, months, currentMonthKey, clockRolledBack}` | 核心判定；回拨时 rolled=false、months=0、维持 last（不奖励不倒扣） |
| `freshMonthStamp(now) -> {monthKey, dateKey, grantedAt}` | 业务状态统一落戳格式 |
| 幂等保证 | 同月内重复调用恒 rolled=false |

**`page/unit.js`**

| 函数签名 | 说明 |
|---|---|
| `createUnit({id, side, name, level, base, skills?, tags?}) -> Unit` | 工厂：hp 初始化为 base.hp，statuses 为空 |
| `isAlive(u)` / `aliveUnits(units)` / `unitsOfSide(units, side)` / `findUnit(units, id)` | 纯查询 |

Unit 字段草案见第四节。battle.js 内私有适配器负责把现有输入（玩家快照/敌方配置）转成 Unit spec——**调用方输入形状不变**。

**`page/state-core.js`**

| 函数签名 | 说明 |
|---|---|
| `defineStatus(def)` / `getStatusDef(id)` / `listStatusDefs()` | 注册表 |
| `applyStatus(unit, {id, duration, stacks?, source?, data?}) -> {applied, refreshed, events[]}` | 叠加规则由 def.stacking 决定 |
| `tickStatuses(unit, phase) -> events[]` | duration 递减与到期触发 onExpire |
| `hasStatus(unit, id)` / `clearStatus(unit, id)` / `clearAllStatuses(unit, filter?)` | 实例操作 |
| `dispatch(unit, hook, ctx) -> {skipAction?, mutations[], events[]}` | battle 在生命周期点调用；状态以**数据**返回效果，不改流程 |
| `statMods(unit) -> {atk?, def?, spd?...}` | 修正聚合，battle 结算有效属性用 |

状态定义形状：`{id, name, priority, maxStacks, stacking: 'refresh'|'independent'|'stack', hooks: {onApply, onExpire, onTurnStart, onTurnEnd, onBeforeAction, onAfterAction, onDamage, onHeal}, statMods?}`。**M2a 只注册 `sleep`**（onBeforeAction 返回 skipAction；onDamage 清除自身=受伤即醒；到期自然醒；stacking='refresh'），但 hook 全集与事件流（每次状态转移 push `{type, statusId, unitId, turn}`）全部就位。无任何关卡/词条引用它 → 零回归下端到端证明框架。

**`page/battle.js`**（公共 API 冻结，内部骨架化）：

1. Commit C 先产出「API 冻结清单」：现有全部导出、参数、返回形状、调用方（tab-battle.js/app.js 调用点），附导出形状测试。
2. 唯一签名变化：入口函数加可选 `rng` 参数（默认 `Math.random`，行为不变）——测试注缝。
3. 内部五段式 tick：`onTurnStart →（睡眠可 skip）→ 行动结算（沿用现有伤害/数值路径，数值不动）→ onAfterAction → onTurnEnd（状态 tick）`；行动队列 M2a 保持与现行先手规则逐 tick 等价，速度排序只留结构位（M2b 启用）。
4. Boss 词条（BOSS_AFFIXES/combineAffixes/rollBossAffixFor）**行为不迁移、只换宿主**：效果继续以现有分支实现，但作用于 Unit 对象而非散变量。词条迁移是 M2b 的事。
5. 返回值：现有字段全保留 + **追加** `units[]`（终局快照）与 `events[]`（结构化事件流）。消费方不读新字段即零感知。
6. 红线：不改伤害公式、不改先手、不改掉落判定输入。

**`page/stats.js`**（Commit B2，点状）：月度重置内部计算改调 `resolveMonthWindow`，对外签名与返回不变，等价测试覆盖第三节用例矩阵。

**测试载体**：`tests.html` + `page/_tests/`：极简断言（`assert/eq/deepEq/runSuite`/DOM+console 汇总）+ 种子随机 `mulberry32(seed)`（整数运算，跨引擎确定）。`battle.equivalence.test.js` 双模式：`?capture=1` 在**重构前**录制 golden 落 `page/_tests/golden/battle-golden.json`；默认模式 diff。golden 语料：117 关 × 3 档玩家属性 × 5 种子 + Boss 词条滚动 + 隐藏挑战战斗采样（levels.js/challenge.js 作为只读夹具加载）。

### (c) S1 验收标准

1. `tests.html` 全绿：时间边界矩阵、unit/state-core 单测（睡眠全生命周期：挂上→跳行动→受击醒→到期醒→事件流断言）、battle 等价。
2. **等价护栏**：golden diff = 0（伤害序列、胜负、tick 数、事件顺序逐字段一致）。
3. **生产零回归**：`git diff` 中 app.js / levels.js / challenge.js / sync.js / tab-*.js 均为 0；手动冒烟：普通关 1 场、Boss 关 1 场、隐藏挑战 1 次、改系统时间验证 1 个月界重置。
4. **纯函数红线**：新增文件 grep 无 `document`/`localStorage`/`Math.random`（注入的 mulberry32 除外）。
5. APP_VERSION 与 sync version=4 不变。

### S1 提交序列

| 提交 | 内容 | 前缀 |
|---|---|---|
| B | date-roll + monthly-reset + 边界矩阵测试 | `test:` |
| B2 | stats.js 月度重置委托（等价测试，可独立回滚） | `refactor:` |
| C | battle.js API 冻结清单 + rng 注缝 + golden 基线录制 | `test:` |
| D | unit.js + state-core.js（含 sleep）+ 单测 | `test:` |
| E | battle.js 骨架化，golden diff 归零 + index.html 标签 | `refactor:` |

（S0 的提交与上并行：store.js 注册表改造 + 等价快照测试，`refactor:`。）

---

## 二、store.js schema 注册表（Q2，并行切片 S0）

**结论：需要，且必须先于"任何新持久化键的首次写入"**——即 M1-经济/M4-离线开工之前。放在 M2a 前面与 S1 并行（文件集互斥）；不能延后到并行线开始写键之后，否则首批 ad-hoc 键将来要二次迁移、sync version 反复 bump。

**API 形状**（注册表实现于 store.js 内部，不加新文件；领域模块加载后各自调 registerSchema）：

```
store.registerSchema({ key, version, defaultValue(), validate(data) -> {ok, reason?}, migrate(data, fromVersion) -> data })
store.get(key)      // 命中 dh-<key>-v<n> → 逐级 migrate → validate → 返回；失败走 defaultValue 并保留原始备份键
store.set(key, data) // 写前校验，不过则拒写并 console.error
store.migrations()  // 本次会话迁移记录 [{key, from, to}]
```

**责任边界**：store = 键内机械迁移与校验；**app.js = 键间/全局一次性迁移编排**（现行职责不变，boot 时在 Tab 渲染前跑全局 pass）。

**与现有键名衔接**：物理键仍为 `dh-<key>-v<version>`；现有全部键按 version=1 注册（validate=现行校验、migrate=恒等）；未来升版时写新键成功后删除旧键（前滚策略，见待裁决 #2）。

**S0 验收**：同一份种子数据迁移前后所有 `store.get` 结果 deepEqual；未注册键读写报错；现有功能冒烟零变化；对外公共 API 签名不变。

---

## 三、时间基座为第一提交（Q3）

**是——Commit B 就是本切片第一个代码提交**：零依赖、纯函数、测试面最便宜，且是 M1-经济与 M4-离线的共同前置；B2 的 stats.js 委托用生产消费者验证 util 语义正确性。函数签名见第一节。

**必测边界用例矩阵**（date-roll/monthly-reset 测试全覆盖，stats 委托复用同矩阵）：

| # | 用例 | 期望 |
|---|---|---|
| 1 | 2026-01-31 → 2026-02-01 | months=1 |
| 2 | 2025-12-31 → 2026-01-01 | months=1（跨年） |
| 3 | 闰年 2024-02-28→29→03-01；非闰 2026-02-28→03-01 | 月键切换点正确 |
| 4 | lastMonthKey=2024-01, now=2026-03 | months=26（补结策略归调用方） |
| 5 | 月末 23:59:59 vs 次日 00:00:00 | 归属月份正确（本地日历日） |
| 6 | now 月键 < lastMonthKey | clockRolledBack=true，不奖励不倒扣 |
| 7 | 本地 23:30 构造的日期取 dateKey | 按本地日历日，不串到 UTC |
| 8 | DST 切换日 daysBetween | 按日历日计，不多算不少算 |
| 9 | 同月内重复调用 | 幂等 rolled=false |
| 10 | 回拨后又前滚（last=2026-03→拨到 01→回到 03） | 不奖励途中"经过"的月份 |

---

## 四、unit.js 与 state-core.js 分工（Q4）

**分工原则**：unit.js 管"Unit 是什么/怎么造/怎么查"（静态身份与结构）；state-core 管"状态怎么注册/挂解/在回合生命周期生效/聚合属性修正"（动态战斗态）；battle.js 是唯一同时调用两者的编排者。

**Unit 数据结构草案**：

```
Unit {
  id: string              // 场内唯一，'ally-0' / 'enemy-0'
  side: 'ally' | 'enemy'
  name: string
  level: int
  base: { hp, atk, def, spd, ... }   // 基础属性（玩家快照或关卡配置）
  hp: int                 // 战斗内可变
  statuses: StatusInstance[]          // state-core 挂载点
  skills: string[]        // 技能 ID（M1 挂钩后才有内容）
  tags: string[]          // boss/elite/词条 id 等标签
  counters: {}            // 战斗内计数器（连击/蓄力，M2b+ 扩展）
}
StatusInstance { id, duration, stacks, source: string|null, data: {} }
```

**state-core 注册表分阶段铺法**（原则：框架先于内容，但每阶段只注册**当阶段被引用**的状态，禁止一次铺满）：

| 阶段 | 注册状态 | 触发内容 |
|---|---|---|
| M2a/S1 | `sleep`（框架 hook 全量就位） | 无（仅单测） |
| M2b | 现行 Boss 词条的等价状态 + 速度类（减速等） | 词条迁移、速度落地 |
| M1-战斗挂钩 | 5 技能关联状态 | 技能挂上 Unit |
| M3 | 负面三级全铺（灼烧/冰冻/眩晕/中毒等，按 design-v2.0 技能表数值区间） | 大招 |

不在 M2a 直接铺负面三级的理由：M3 数值尚未过 OQ 裁决，提前铺必返工；sleep 一个状态即可端到端打通"注册→叠加→跳行动→受击醒→到期→事件流"全链路，足以证明框架完备性。

---

## 五、后续推进路径（Q5）——直至"技能面板可见反馈"

```
S0 注册表 ∥ S1 时间基座+战场骨架
     ↓              ↓
S2 经济/面板静态版   S3 多敌+目标选择
（需 S0+S1-B）      （需 S1 完成）
     ↓              ↓
     │         S4 词条迁移+速度
     │              ↓
     └────→  S5 战斗挂钩+可见反馈（需 S2+S4）
```

| 切片 | 内容 | 验收目标 |
|---|---|---|
| **S2**（M1-经济，与 S3 可并行） | 技能点账本/槽位/装备持久化（走 store 注册表新键）、技能面板 UI 静态版（可读可操作）、月度重置挂 monthly-reset | 加点/装备→刷新页面状态保持；月界重置过用例矩阵；战斗路径 git diff=0；**首个 feat: 提交，APP_VERSION 触发点** |
| **S3**（M2b 前半） | battle 支持多 Unit（单测直喂多敌输入）；levels.js 新增**可选** enemies 数组（旧关不动）；目标选择最小策略；dev-only 调试关 | 多敌单测绿；单敌 golden 仍 0 diff |
| **S4**（M2b 后半） | Boss 词条逐个迁入 state-core；速度进行动队列排序 | 逐词条等价测试矩阵全绿；速度排序单测；golden 维持 |
| **S5**（M1-战斗挂钩） | 5 技能挂上 Unit/状态；`events[]` 渲染进战斗 UI（技能名/状态图标/跳过提示）；面板显示技能实战回执 | **端到端**：面板加点装备→打一场→界面可见技能触发与状态效果→战报完整。此为"技能面板可见反馈"完成线 |

之后按既定路线 M3 → M5 → M6。

---

## 六、执行代理交接纪律（Q6）

1. **阶段区分**：每个切片先 `docs:` 提交（计划勾状态、OQ 裁决回写设计文档），再进施工提交；**docs 与代码严禁混提**；每个施工提交独立可回滚。
2. **提交前缀**：`docs:` / `test:` / `refactor:` / `feat:`。S0、S1 全部为 `test:` 或 `refactor:`（零用户可见变化）；首个 `feat:` 出现在 S2。
3. **版本纪律**：APP_VERSION 与 sync version 仅在 S2 由主会话既定流程 bump，执行代理任何提交不得触碰。
4. **三项同步**：切片完成时同步——①计划文档勾选状态；②CONTEXT.md 增**已实现**条目（S1 后新增 unit/state-core/date-roll/monthly-reset/store注册表 API 映射，设计期内容不写）；③changelog（仅用户可见变化，S1 不记）。
5. **本切片禁区文件**：app.js、levels.js、challenge.js、sync.js、全部 tab-*.js、APP_VERSION、sync 协议；stats.js 仅限 B2 点状修改；store.js 仅限 S0 代理。
6. **提交门槛**：tests.html 全绿才可提交；golden 基线一经生成，只允许 capture 模式重生成且提交信息必须说明理由。
7. **冲突协调**：index.html 编辑权归 S1 代理；S0 代理不动任何加载顺序。

---

## 七、初始 todo 列表（供执行代理接手）

1. [S0] store.js schema 注册表改造 + 等价快照测试（可与 2 并行）
2. [S1-B] date-roll.js + monthly-reset.js + 边界矩阵测试（本切片首个代码提交）
3. [S1-B2] stats.js 月度重置委托 + 等价测试（依待裁决 #3 确认去留）
4. [S1-C] battle.js API 冻结清单 + rng 注入缝 + golden 基线录制
5. [S1-D] unit.js + state-core.js（含 sleep）+ 单测（依赖 4 完成）
6. [S1-E] battle.js 骨架化，golden diff 归零 + index.html 标签（依赖 5）
7. [S1-F] 手动冒烟 + CONTEXT/changelog 同步 + 切片收尾（依赖 6）
8. [S2] 经济底座 + 技能面板静态版（依赖 1、2）
9. [S3] 多敌 + 目标选择（依赖 6）
10. [S4] 词条迁移 + 速度落地（依赖 9）
11. [S5] 战斗挂钩 + 技能面板可见反馈（依赖 8、10）

---

## 八、待裁决

**待裁决：**

1. **跨设备/跨时区的日/月键权威**：dateKey/monthKey 目前定为本机本地日历。云同步（sync.js 未来 version=5）下，跨时区双设备可能出现"一天两次/漏掉重置"。选项：A) 维持本机本地（简单，接受轻微不一致）；B) 以云端统一时区为权威（需 sync 协议带时间戳语义，改动更大）。建议 A 先行、B 留给 sync 升版时再议，但需现在定原则。
2. **键升版后旧键删除 vs 保留**：建议**迁移成功写新键后删除旧键**（前滚安全，云同步有兜底）；保留旧键则旧版本代码回滚更安全但存在双源脏读风险。
3. **stats.js 月度重置委托是否纳入 S1**（Commit B2）：建议纳入（用生产消费者验证 util）；若主会话求最小爆炸半径，可整体顺延至 S2/M4 首个消费方提交，不影响其他提交。
4. **S0 与 S1 是否双代理并行**：建议并行（文件集互斥，仅 index.html 由 S1 独占）；单人执行则顺序 S0 → S1。

# MyHealth v2.0 实施计划（合并版）

> **状态**：实施规划 · 由两份子代理规划复核合并而成
> **来源**：`doc/design-v2.0.md`（已定稿设计）+ 两份独立规划报告综合收敛
> **约定**：本文件聚焦路线、模块边界、数据结构与决策，不写实现代码

---

## 1. 路线决策（收敛版）

**决策：M2 拆为 M2a 前置 + 并行窗口，最终主线：**

```
M2a（战场骨架 + 最小状态框架，单敌等价护栏，零回归）
   ├─ 并行：M1-经济/槽位/技能点（不碰战斗钩子）
   ├─ 并行：M4-宠物纯离线（蛋/材料/生命周期/月重置）
M2b（多敌 + 目标选择 + 词条迁移 + 速度落地）
M1-战斗挂钩（5 技能挂上 Unit/状态）→ M3（陨石/冰魄/巨石/瞩目）
M5（宠物部署/共鸣/独立行动）→ M6（宝珠）
```

**核心判断（两份一致）**：

- M2 是唯一同时解锁「技能战斗」与「宠物战斗」的咽喉，必须**拆开并前置**，不能排在 M1 之后。
- **M1 真正可并行的只有「经济/槽位/store/UI」**。M1 的 5 个技能（暴击/格挡/气势如虹/气力恢复/金身护盾）都是结算时机钩子或持续状态，必须在「单位模型 + 状态框架 + 行动队列」上落地，否则 M2 一到就重写——纯返工。故 M1 被精确切成「经济可并行、战斗等 M2a」。
- 否决「宠物优先 M4→M2→M5」：M4 纯离线并行安全，但排前不解锁任何咽喉，反而推迟最有杠杆的重构。
- **并行窗口**：`M2a ∥ M1-经济 ∥ M4-离线`；`M1-战斗挂钩` 必须等 M2a。

**MVP 说明**：首个「零回归」工程切片是 **M2a 战场双轨迁移**（对玩家不可见）；紧随其后的首个「用户可见」切片是 **M1-战斗挂钩的暴击被动**。

---

## 2. 模块加载顺序与新增模块

无 bundler，需在 `index.html` 按依赖顺序显式加载：

```
store → stats → unit → state-core → battle → skills → pets → orbs → challenge → app → tab-*
```

| 模块 | 职责 | 类型 |
|------|------|------|
| `unit.js` | Unit 模型 + 速度合成 + 阵营 + 共鸣计算 | 新增纯逻辑 |
| `state-core.js` | 状态框架（负面三级/异常/蓄力/冷却/免疫/驱散/叠加/Pity） | 新增纯逻辑 |
| `skills.js` | 技能定义、点数经济、槽位、周递增查表 | 新增纯逻辑 |
| `pets.js` | 宠物生命周期 + 炼化 + 天赋/技能倍率 | 新增纯逻辑 |
| `orbs.js` | 宝珠合成/升级/分解/装配 | 新增纯逻辑 |
| `date-roll.js` / `monthly-reset.js` | 日/周/月时间口径 + 月重置共享工具 | 新增纯逻辑 |
| `tab-skills.js` / `tab-pets.js` / `tab-orbs.js` | 各子系统 UI | 新增 UI |

---

## 3. 分里程碑实施步骤

| 里程碑 | 改动/新增 | store key | 云同步 version |
|--------|-----------|-----------|----------------|
| **M2a** 骨架 | 新增 `unit.js`、`state-core.js`；改 `battle.js`（队列双轨 shadow）、`app.js`（debug flag） | 无（战斗 transient） | 不 bump（保持 4） |
| **M1-经济**（并行） | 新增 `skills.js`、`tab-skills.js`；改 `app.js`/`challenge.js`/`store.js` | `dh-skills-v1` | **bump 4→5** |
| **M1-战斗挂钩**（M2a 后） | 改 `battle.js`/`skills.js`/`state-core.js` | 沿用 | 不 bump |
| **M2b** 多敌 | 改 `battle.js`/`unit.js`/`levels.js`；词条钩子迁 Unit | 无 | 不 bump |
| **M3** 技能完整 | 改 `skills.js`/`state-core.js`/`battle.js` | value.version 2 | 不 bump |
| **M4** 宠物养成 | 新增 `pets.js`/`date-roll.js`/`monthly-reset.js`/`tab-pets.js`；改 `store.js`/`app.js`/`sync.js` | `dh-pets-v1` | **bump 5→6** |
| **M5** 宠物战斗 | 改 `battle.js`/`unit.js`/`pets.js` | 沿用 | 不 bump |
| **M6** 宝珠 | 新增 `orbs.js`/`tab-orbs.js`；改 `store.js`/`app.js`/`sync.js` | `dh-orbs-v1` | **bump 6→7** |

### 三层版本解耦

1. **sync schema version**（sync.js）：导出/导入文件结构，仅在文件结构变化时 bump。
2. **store key version**（key 名 `-v1` 后缀）：key 存储命名空间版本。
3. **value.version**（value 内字段）：单 key 字段级 schema，读时按 migrator 链升到当前。

> 原则：新增持久化 schema（新 key 或旧 key 加必填字段）→ bump sync version；纯逻辑重构（M2a）→ 不 bump。

---

## 4. 关键架构决策

### 4.1 多对多行动队列 + 单方 tick 平滑迁移
1. **Unit 抽象**：`unit.js` 定义纯数据 Unit + 工厂 `buildPlayerUnit/buildPetUnit/buildEnemyUnit`；速度合成、阵营、共鸣归类此模块。
2. **队列替换（单敌特例）**：battle.js 保留 `runBattle(player, enemy)` 入口，内部包装为两 Unit，走「按速度降序 + 稳定 tie-break」行动队列（队列长度恒 2）。**tie-break 显式固定**（同速玩家先手，同方按 id 稳定序）并写死 + 测试钉住，防先手漂移。
3. **双轨 shadow**：dev flag 下新旧引擎同输入逐回合比对（胜负/剩余血量/回合数），117 关全量回归。
4. **多敌入口**：新增 `runMultiBattle(playerUnit, petUnits[], enemyUnits[])`，旧单敌入口委托给它，最后删旧路径。

> **M2a 验收标准 = 行为不变（零回归）**，不是新功能上线。只有证明重构零漂移，后续技能/宠物才能安心叠加。

### 4.2 状态框架：独立纯模块
- 状态会被 **skills / pets / battle** 三方复用，独立成 `state-core.js`，避免 battle.js 变 God module。
- 责任划分：
  - `state-core.js`：状态定义表（效果/等级/能否叠加/免疫/驱散/持续回合/触发时机）、`apply/tick/expire/cleanse/isImmune`、叠加合并规则、Pity 乘算。数据结构 `unit.statuses = [{ id, grade:1|2|3, stacks, duration, sourceUnitId, startedTick }]`。
  - `battle.js`：在时机点（onTurnStart/onBeforeAction/onAfterDamage/onTurnEnd）调用 state-core 钩子，只负责「何时触发」，不负责「如何生效」。
  - `unit.js`：提供状态宿主结构，不实现语义。

### 4.3 技能点经济与反作弊衔接
- 技能点入账**只允许在 challenge.js 的通关结算点**发生，UI 与 battle 永不直接写 skills。
- challenge.js 在容量守卫校验通过 + dailyReset 判定「今日有效胜局」后，调 app.js 暴露的 `earnSkillPoints(n)`。
- skills.js 负责周递增查表（首 0%、每次 +50%、上限 +250%），倍率依据 `winCountThisWeek` 而非客户端时钟。
- 反作弊：`totalEarned` 与 `winCountThisWeek` 必须单调一致，异常（winCount 回退）触发已有防线。

### 4.4 宠物时间驱动：统一时间工具
- 把 dailyReset + lastDate 抽象为共享纯工具 `date-roll.js`：`resolveDateRoll(storedLast, today, granularity:'day'|'week'|'month') → { advanced, daysElapsed, newPeriodKey, crossesMonth }`。
- 宠物在 app.js 初始化/进入宠物 Tab 时一次性结算离线天数（孵化倒计时/年龄/每日上场次数重置/死亡判定），支持离线多天一次结算。
- **跨月需同时触发宠物月重置与角色炼魂月重置**，口径统一为自然月。
- challenge 的 dailyReset 与 stats 的月度炼魂重置迁到同一工具，杜绝时间口径串味。

### 4.5 store.js：schema 注册表
```
store.registerSchema(key, { currentVersion, validate, migrate: [v1->v2, v2->v3, ...] })
```
- 读时：value.version < currentVersion → 依次执行 migrator → validate。
- 校验失败：**不丢用户进度**，保留 raw 副本 + 标记 `corrupted`，用默认值继续运行，上报 app.js 决策。
- 迁移分工：store.js 管「key 内字段迁移」，app.js 管「跨 key 语义迁移」，sync.js 管「云端文件级迁移」。

### 4.6 月度重置：抽公共工具
- `monthly-reset.js`：自然月周期判定 + `applyMonthlyReset(state, { resetFields, keepFields })`；突破永久保留 = `keepFields`。
- 数值逻辑分离：`stats.js` 保留角色炼魂 REFINE_GRADES；`pets.js` 保留宠物炼化表 + 突破阈值。两者只复用「月重置工具」，不复用数值表，避免两套月度规则漂移。

---

## 5. 三个新 store key schema 草案

```
dh-skills-v1  value:
{
  version: 1,
  totalEarned, points, weekKey, winCountThisWeek,
  levels: { skillId: number },
  loadout: [skillId|null, ...],
  slotsUnlocked,
  unlockedSlotMilestones: [12, 20]
}

dh-pets-v1  value:
{
  version: 1,
  pets: { petId: { speciesId, rarity:'R'|'SR'|'SSR'|'UR', stage:'egg'|'grow'|'mature',
                   ageDays, hatchRemaining, nutrition, hunger, health,
                   refineLevel, refineStoneCount, breakthroughs, talent,
                   isDead, deathAt, lastSettlementDate, monthlyResetKey } },
  materials: { normal, advanced, spirit },
  fragments: {},                    // OQ-14 预留
  resonanceBonus,
  lastSettlementDate
}

dh-orbs-v1  value:
{
  version: 1,
  orbs: { orbId: { type, rarity, level, exp, equippedTo:'none'|petId } }
}
```

---

## 6. OQ 未知项分级与默认值

| 编号 | 议题 | 影响 | 分级 | 建议默认值 |
|------|------|------|------|-----------|
| **OQ-10** | 技能槽位"本月通关 12/20"月度口径 | M1 | **必须现在定** | 自然月口径；统计"本月通关关卡数（去重）"；**槽位永久解锁**（达成即永久 +1，记 `unlockedSlotMilestones`），因技能不月重置故槽位不回收 |
| **OQ-9** | 孵化材料产出量级 | M4 | M4 前定基调 | 普通材料日 1~2、高级周 1；材料最多压缩孵化 30%；集中为 `pets.js` 顶部 config 常量 |
| **OQ-14** | 图鉴集齐后新蛋规则 | M4 后期 | 留到 M4 中后期，**schema 现在预留** | 重复蛋转「宠物碎片」，碎片用于突破/炼化或兑换 UR 蛋；`fragments` 已预留 |
| **OQ-8** | 宠物技能倍率成长曲线 | M5 | 留到 M5（M4 不受阻） | 占位：`倍率 = base × (1+f(炼化级,等级))`，炼化每级 +15%、等级每 10 级 +5%，区间 [1.0,3.0] 封顶；M5 实测调参 |

> 全部遵循「默认值集中为可调 config 常量」原则，避免早期写死。

---

## 7. 风险清单（前 3 高优先）

1. **战场引擎迁移的隐性行为漂移（最高）**：单 tick → 队列 + 目标选择 + 状态时机，易在先手顺序、暴击/格挡判定顺序、Boss 词条触发时机、结算清理上产生不可见差异。
   **加固**：先 Unit 抽象、双轨 shadow、确定性种子 117 关全量回归、tie-break 显式写死测试。
2. **云同步 schema 与 store key 版本混淆损坏旧存档**。
   **加固**：确立三层单向迁移链；M1 上线前做 v4 旧档 → 新引擎 → 导出 → 再导入 round-trip 测试；配额守护先于 M1 落地。
3. **日/周/月时间口径不一致导致经济与重置串味**（跨月不回档、周递增错位、离线只结算一天、槽位口径矛盾）。
   **加固**：先抽 `date-roll.js` + `monthly-reset.js` 纯工具并单测（覆盖跨月/闰年/时区/长时间离线/自然月边界），再让 challenge/stats/pets 统一迁移；OQ-10「槽位永久解锁」同时消除一处口径矛盾。

**次风险**：技能点经济被刷取——只在 challenge 结算点入账 + winCount 单调审计收口，M1 需把 totalEarned 与 winCountThisWeek 单调一致性纳入现有防线。

---

## 8. 首个可落地迭代（MVP）

### 切片 A（工程闸门，先行）：M2a 战场双轨迁移
- 验收：确定性种子下 117 关全量结果（胜负/剩余血/回合数/词条触发数）与迁移前 100% 一致；3 单位用例行动顺序严格按速度+稳定 tie-break；最小状态闭环（睡眠跳过回合 → 到期移除）可用 dev flag 验证；**零落库零 sync 变更**（旧 v4 存档不受影响）。

### 切片 B（紧随其后的用户可见项）：暴击被动在新骨架上端到端
- 验收：隐藏挑战胜利技能点增加且符合周递增倍率，刷被容量守卫拦截；技能面板正确显示点数/槽位/升级且 lv0 不生效 lv≥1 生效；装备暴击被动后现有战斗暴击判定可见差异且卸载即回退；刷新/重启经 `dh-skills-v1` 持久化，sync 上下行一致，v4→v5 旧档迁入不丢。
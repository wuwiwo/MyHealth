# 宠物编队与多队双场景战斗设计 v1（仅文档 · 未施工）

> **状态**：设计提案。本文**只写文档**，不改 `page/*.js`、不改测试、不 bump 版本、不生成 changelog。
> **基线**：2026-11-26，HEAD `4ff0beb`，`APP_VERSION=2.14.17`。
> **事实源**：`page/pet-store.js`（编队存档）、`page/game-render.js`（开战与渲染）、`page/battle-group.js`（战斗引擎）、`page/group-levels.js`（关卡）、`page/ai.js`（目标选择）。
> 凡本文中的 `文件:行号` 均以基线为准；施工前须重新核对。

---

## 0. 需求原文与作者裁决

### 0.1 需求原文（作者，2026-11-26）

> 宠物增加编队功能，每个小队最多4个宠物，小队数量不限；
> 当前战斗下，如果第一个小队宠物全部阵亡，则会派下一个小队上场继续战斗，直到全部小队用尽；
> 现在战斗增加多队战斗，多队战斗下，会同时出现2个场景，每次会派2个小队分别前往1个场景同时战斗，其中1个小队全部阵亡，未上场的小队会替补该小队出场；
> 需要同时在两边赢得胜利才算数，已经上场的小队无法前往另一个场景（即使胜利）；
> 多队战斗会在当前的后期关卡间隔出现；
> 现在玩家角色不会被敌人攻击·不会阵亡·如果是多队战斗，则每回合轮流在不同场景进行战斗；
> 现在玩家不参与战败的结算（我方宠物全部阵亡即算失败）；
> 先写文档。

### 0.2 四项裁决（作者同日确认）

| # | 议题 | 裁决 |
|---|---|---|
| D1 | 双场景推进方式 | **轮流结算**：两场景同时显示，但每回合只推进一个场景（A1→B1→A2→B2…），共用回合计数、单套随机数 |
| D2 | 玩家不受攻击的适用范围 | **仅多队战斗**：普通战斗维持现状（玩家可被攻击），多队战斗中玩家不可被选为目标 |
| D3 | 一边赢一边输的判定 | **赢的一边结束，输的一边看是否有替补队伍；最后也没有替补则算失败**（不是「任一边失败立即整场失败」） |
| D4 | 小队跨场景复用 | **本场锁定**：小队一旦上场即绑定该场景，即使清空敌人也不转场、不再参与本场任何替补；下场战斗可重新编队 |

---

## 1. 现状事实（施工前必读）

### 1.1 编队

| 事实 | 依据 |
|---|---|
| 存档 `dh-pets-v1.battlePicks` 是**扁平的 speciesId 数组**，只有一份 | `pet-store.js:20`，schema `:9-33` |
| `PET_BATTLE_MAX = 4`（唯一来源） | `pet-store.js:303`（`pets.js:20` 的 `maxRoster:4` 只是镜像） |
| 读 `getPetBattlePicks()` / 存 `savePetBattlePicks(ids)`（按 `slice(0,4)` 截断） | `pet-store.js:266-269` / `:270-275` |
| 运行时 `_petBattlePicks` 缓存 + `ensurePetBattlePicksLoaded()`（剔除已不存在物种） | `game-render.js:459-460` / `:755-770` |
| UI 选择逻辑三处同源（培养页卡、列表点击、就地切换） | `game-views.js:88-101` / `:173-185`，`pet-ui.js:568-582` |
| **目前不能建多个小队**：无 `squads` 字段、无多队 UI、一次开战只生成一个 `allies` | `game-render.js:830-836` |

### 1.2 宠物参战、阵亡与换人

- 链路：`battlePicks` → `getPetBattlePicks()` → `_petBattlePicks` → `buildGroupBattlePets(petIds, 4)` → `createPetUnitsForBattle` → `createPetUnit` → `allies = [player].concat(petUnits)`（`game-render.js:830-836`，`pet-store.js:1273-1274` → `:306-318`，`pet-codex.js:50-89`）。
- 战斗中阵亡判据 = `hp <= 0`（`battle-group.js:1645-1646`）；`allies` 在 `createGroupBattle()` 建场时**一次性固定**（`:390-394`），**没有任何战斗中替换/增援路径**。
- 战后 `applyDefeatInjuries()` 对参战成熟宠物按 `matureInjuryChance`（默认 0.5）掷骰致伤（`pet-store.js:182-193`，调用点 `game-render.js:1748-1757`）。
- 「后备」目前只用于凝聚/共鸣属性加成，**不是战斗换人**（`pet-store.js:1278`，`doc/changelog-v2.2.md:1491`）。

### 1.3 玩家角色

- 玩家 unit 由 `game-render.js:818` 创建（`id:'player', side:'ally'`），置于 `allies[0]`（`:836`）。
- **当前会被敌人选为目标**：`aiPickTarget()` 用 `aliveOpponents()` 取全部 `gb.allies`（`ai.js:9-11,34-56`），`selectTargets()` 对敌方的 `foes = gb.allies`（`battle-group.js:642-643`），两处都无排除玩家的分支。
- 当前判负 = **全体 ally（玩家+宠物）皆 hp<=0**（`battle-group.js:1644-1650`）；玩家单人阵亡但宠物存活不判负。
- **没有**任何「不可被攻击 / untargetable」开关（全库检索无匹配）。

### 1.4 关卡组织

- `GROUP_LEVELS` = `g1..g24`，每大关 10 小关；小关字段 `id / name / type('normal'|'elite'|'boss') / enemies`（`group-levels.js:419-443`），`type` 是现成的特殊战斗标记位。
- `GROUP_MAX` 由 `GROUP_STAGE_NAMES` 派生（`:14-23,29`）；`allStageIds()` 线性收集全部关卡 id（`group-progress.js:42-49`）。
- `groupStageEnemies(groupId, stage, allies)` 是取敌人配置的唯一入口（`group-levels.js:579-584`），实战调用点 `game-render.js:839`。

### 1.5 战斗对象与渲染

- `createGroupBattle(opts)` 参数 `{allies, enemies, rng?, seed?, terrain?}`；gb 字段 `units / allies / enemies / turn / done / winner / phase / events / log / rng / terrain`（`battle-group.js:388-408`）。
- 全局只有**一个** `#battleOverlay`（`index.html:210`）、**一个** `#gbArena`（`game-render.js:2513`）、**一个** `_groupBattle`（`:855`）。
- `renderGroupBattlePane(gb)` 只渲染单个场景的三块固定区：`#gbArenaEnemy` / `#gbArenaMid` / `#gbArenaAlly`（`:2506-2532`）。
- **当前无法容纳两个独立战场**；全库无「多场景 / 分路 / 双线」战斗实现。

---

## 2. 数据模型（提案）

### 2.1 存档结构

在 `dh-pets-v1` 增加 `squads` 字段，**保留 `battlePicks` 作为兼容镜像**（指向当前选中的首发小队）：

```
squads: [
  { id: 'sq-1', name: '一队', petIds: ['sparkle', 'dream', 'kirin', 'nonebear'] },  // ≤4
  { id: 'sq-2', name: '二队', petIds: ['flamechick', 'rocksteady'] },
  ...
]
battlePicks: ['sparkle', 'dream', 'kirin', 'nonebear']   // = squads[0].petIds，兼容旧代码
```

- **数量不限**：`squads.length` 无上限；每个 `petIds.length ≤ 4`（`PET_BATTLE_MAX` 仍是唯一来源）。
- **同一宠物不得重复出现在两个小队**（待裁决 Q1）；建队 UI 需校验。
- **旧档迁移**：无 `squads` 时，用现有 `battlePicks` 生成 `squads = [{id:'sq-1', name:'一队', petIds: battlePicks}]`；不丢数据、不补偿（对齐既有 `pet-store.js` 的优雅退化惯例）。
- `battlePicks` 与 `squads[0]` 的**双向同步**必须有单一写入口，避免两份真相漂移（建议：`savePetBattlePicks()` 内部同时更新两者）。

### 2.2 战斗编制对象

新增「编制」概念（运行时，不落盘）：

```
squadOrder: [sq-1, sq-2, ...]   // 本场按此顺序替补
deployed:   Set<squadId>        // 已上场（本场锁定，D4）
sceneBind:  { A: sq-1, B: sq-2 } // 多队战斗的初始派驻
```

---

## 3. 单队接力（普通战斗）

**规则**：从 `squadOrder` 第 1 队开始上场；该队**全部宠物 hp<=0** 时，派下一队满血上场；直到全部小队用尽。

| 项 | 设计 |
|---|---|
| 触发时机 | 本回合判定阶段后检测 `当前队全部宠物 hp<=0` 且 `还有未上场小队` → 下一回合开始前换队 |
| 换队方式 | 新建 `petUnits` 并 `gb.allies.push(...)`（**不能再走 `createGroupBattle` 重建**，否则敌人/进度/RNG 全变） |
| 属性链路 | 新单位必须走既有管道 `createPetUnit → applyBattlePetBaseBonuses → boostPetForGroup`，与 `buildGroupBattlePets` 同源（禁止另写一份数值） |
| 队长/caching | 已阵亡宠物 unit 保留在 `gb.allies`（hp=0，行动循环自然跳过），不删除——保住日志/战报归因 |
| 敌人缩放 | 不随换队重算（`GROUP_ANCHOR.enabled` 默认 false，现状） |
| 替补顺序 | `squadOrder` 定义顺序（UI 可拖动调整，待裁决 Q2） |
| 结束条件 | 全部小队用尽且场上宠物全灭 → 判负（玩家是否计入见 §5） |

---

## 4. 多队双场景战斗

### 4.1 总体结构

| 项 | 设计 |
|---|---|
| 场景数 | 固定 **2**（A / B），各自有 `enemies`（由关卡配置决定）、各自绑定 1 个小队 |
| 初始派驻 | 从 `squadOrder` 取前 2 队，分别进 A / B（顺序：第 1 队→A，第 2 队→B） |
| 推进 | **轮流结算**（D1）：全局 `turn` 计数，奇数回合推进 A、偶数回合推进 B；单套 RNG（`gb.rng`），保证可复现 |
| 场景结束 | 该场景敌人全灭 → 该场景**胜利并冻结**（保留展示，不再推进）；胜利小队**本场锁定**（D4），不转场、不替补 |
| 替补 | 某场景宠物全灭且该场景未胜利 → 从**未上场小队**按 `squadOrder` 取下一队，满血上场（该队即绑定此场景，D4） |
| 整场胜利 | **A、B 两场景都胜利**（D3） |
| 整场失败 | 某场景失败且**没有未上场小队可替补**（D3）——不等另一场景 |
| 替补耗尽顺序 | 两个场景同时需要替补时，按 A→B 顺序分配（待裁决 Q3） |

### 4.2 双场景引擎载体

**推荐方案：一个「战斗导演」对象 + 两个独立 `gb`**：

```
battleDirector = {
  scenes: [ { key:'A', gb: gbA, squadId, status:'active'|'won'|'lost' },
            { key:'B', gb: gbB, squadId, status:... } ],
  squadOrder, nextSquadIndex, turn
}
```

- 两个 `gb` 各自持有 `allies / enemies / units / done / winner / terrain`，**各自调用 `groupBattleStep()` 的等价单步**；但为符合 D1，**每回合只推进其中一个 gb**。
- 共用一套 RNG：导演持有 `rng`，两个 gb 创建时传同一个种子派生的随机源（或共享 `gb.rng` 引用）——需在实现时验证确定性回放仍成立。
- 玩家 unit：按 D2，**多队战斗中玩家不可被攻击**。推荐做法：玩家 unit 不放入任一场景的 `allies`（即场景里只有宠物），玩家技能/属性加成通过既有 `attachPlayerSkills` 通道挂到宠物或在导演层统一施加（具体接线待裁决 Q4）。

### 4.3 渲染

- `#battleOverlay` 内改双栏：两个 `.gbArena`（A/B），各调一次 `renderGroupBattlePane(gb)`（需把该函数改为接受 gb 参数并使用局部 DOM id，避免全局 `#gbArena` 冲突）。
- 顶部控制条显示：当前回合、正在推进的场景（A/B）、两侧状态（active/won/lost）、剩余未上场小队数。
- 胜负/战报：两侧分别结算，整场结果在导演层判定后统一走既有结算面板（复用 `_groupDone` 的发奖/进度/历史逻辑，避免第二份奖励代码）。

---

## 5. 玩家角色与结算口径

| 项 | 普通战斗 | 多队战斗 |
|---|---|---|
| 玩家在场上 | 维持现状（`allies[0]`） | 不进入任一场景的 `allies`（D2 引申） |
| 玩家被敌人攻击 | 维持现状（可被选为目标） | **不可**（D2） |
| 玩家阵亡 | 维持现状 | 不适用（不在场） |
| 判负条件 | **待裁决 Q5**：本文按需求原文「我方宠物全部阵亡即算失败」→ 只看宠物，玩家不计入 | 同左（每场景只看该场景宠物；全局看替补是否耗尽） |
| 战后受伤结算 | 维持现状（`applyDefeatInjuries` 只作用于宠物，玩家本就不参与） | 同左：宠物按既有逻辑致伤，玩家不参与 |

> ⚠️ **需求原文「现在玩家角色不会被敌人攻击·不会阵亡」与裁决 D2（仅多队战斗）存在张力**。
> 本文以 D2 为准（普通战斗维持现状），并把「玩家是否从判负条件中移除」列为 Q5 待裁决。

---

## 6. 关卡出现规则

- **位置**：后期关卡（`g16+` 为候选，因 g13+ 已启用 `groupTailMul`、g16+ 有 1.24 斜率）。
- **间隔**：作者只说「间隔出现」，未给具体周期。提案：`g16` 起每 3 个大关的**第 5 小关（精英关）**为多队战斗（如 g18-5、g21-5、g24-5）——复用现成的 `type:'elite'` 标记位扩展。
- **标记方式**：给小关增加 `mode: 'single' | 'multi'` 字段（默认 single），由 `group-levels.js` 的生成循环按规则写入；`groupStageEnemies()` 不改（敌人照常取）。
- ⚠️ 具体大关起点与间隔待裁决 Q6。

---

## 7. 引擎 / UI 改动面（评估用，非施工清单）

| 模块 | 改动 | 风险 |
|---|---|---|
| `pet-store.js` | 新增 `squads` schema + 迁移 + 单写入口同步 `battlePicks` | 中（存档兼容） |
| `pet-ui.js` / `game-views.js` | 多小队管理 UI（增删/改名/拖拽排序/去重校验） | 中（现有三处同源选择逻辑要收口） |
| `game-render.js` | 开战按 `mode` 分支；普通战斗换队注入；多队导演与双栏渲染 | **高**（现有单 gb 假设根深蒂固） |
| `battle-group.js` | 支持运行时向 `gb.allies` 增援；判负条件参数化（是否含玩家） | **高**（引擎核心） |
| `group-levels.js` | 小关 `mode` 字段 | 低 |
| `ai.js` | 多队战斗中排除玩家为目标（若玩家在场）或无需改（玩家不在场） | 低 |
| `index.css` | 双栏场景布局（仍需遵循极简扁平令牌） | 中 |
| 测试 | 编队 CRUD / 接力 / 双场景轮流 / 替补锁定 / 胜负 / 存档迁移 / 确定性 | 高 |

---

## 8. 测试计划（施工时）

1. **编队**：CRUD、≤4 校验、跨队去重、旧档迁移、与 `battlePicks` 双向同步幂等。
2. **单队接力**：全队阵亡触发换队、新队属性与既有管道一致、敌人不缩放、全部用尽判负、日志归因不丢。
3. **多队推进**：轮流序列 A1→B1→A2→B2、单套 RNG 确定性、一边胜利冻结、另一边失败触发替补、替补锁定本场景、两边都胜才算胜、替补耗尽判负。
4. **玩家口径**：普通战斗玩家仍可被攻击（回归）、多队战斗玩家不可被攻击/不纳入判负。
5. **关卡**：`mode:'multi'` 只出现在指定后期关卡、派生链不破坏、`allStageIds()` 不变。
6. **回归**：全量 `test-*.js` 必须全绿；重点 `test-group-battle` / `test-pet-store` / `test-pet-battle-picks` / `test-group-progress` / `test-ai`。

---

## 9. 待裁决清单

| # | 议题 | 提案默认值 |
|---|---|---|
| Q1 | 同一宠物能否出现在多个小队 | **不能**（避免替补时出现重复单位） |
| Q2 | 小队替补顺序是否允许玩家调整 | **允许拖拽排序**（否则固定按创建顺序） |
| Q3 | 两场景同时需要替补时的分配顺序 | **A 优先** |
| Q4 | 多队战斗中玩家的技能/属性加成如何施加 | 挂到当前场景宠物（复用 `attachPlayerSkills`），**待细化** |
| Q5 | 普通战斗判负是否也改为「只看宠物」 | **是**（按需求原文），但与 D2 的交互需作者确认 |
| Q6 | 多队战斗的具体大关起点与间隔 | g16 起每 3 大关的第 5 小关（如 g18-5 / g21-5 / g24-5） |
| Q7 | 替补上场的宠物是否为满血、是否保留上一场受伤状态 | **满血、不继承战斗中伤势**；战后 `applyDefeatInjuries` 照常结算 |
| Q8 | 多队战斗的奖励倍率是否高于普通战斗 | **不额外加成**（先按同关卡同奖励，避免过度设计） |
| Q9 | 已胜利场景中冻结的小队，战斗结束后是否照常参与战后结算 | **照常**（只是本场锁定，不改存档状态） |

---

## 10. 施工分期建议（待作者点头后再排）

1. **阶段 A**：编队数据模型 + UI（可建多队、≤4、去重、旧档迁移、与 `battlePicks` 同步）。**不动战斗**。
2. **阶段 B**：普通战斗单队接力（换队注入 + 判负参数化）。**不动多场景**。
3. **阶段 C**：玩家口径调整（普通维持、多队排除）与关卡 `mode` 字段。
4. **阶段 D**：多队导演 + 双场景渲染 + 轮流结算 + 替补/胜负。
5. **阶段 E**：真机 390/360 双栏布局复核 + 全量回归 + 平衡复测。

> 每阶段独立提交、独立 bump（按 `AGENTS.md` 版本纪律）；本设计文档不触发版本。

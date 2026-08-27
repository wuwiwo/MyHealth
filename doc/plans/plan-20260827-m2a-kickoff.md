# plan-20260827：v2.0 开工规划 —— 首切片「时间基座 + 战场骨架」+ 并行「存储注册表」

> **状态**：已定稿，待执行
> **日期**：2026-08-27
> **上游文档**：`doc/design-v2.0.md`（设计权威）、`doc/plan-v2.0-implementation.md`（路线/模块/架构已定，本文细化执行层）、`AGENTS.md`（版本/提交纪律）、`CONTEXT.md`（已实现映射）

---

## 结论先行

第一个动代码的切片是 **S1「时间基座 + 战场骨架（单敌等价护栏）」**，即 M2a 的第一刀；同时并行开工 **S0「store.js schema 注册表改造」**。S1 全程零用户可见变化（仅 `test:`/`refactor:` 提交），APP_VERSION 不动；S0 与 S1 文件集互斥，天然可双代理并行。二者完成后，M1-经济、M4-离线两条并行线即可解锁。

---

## 一、目标与阶段判定

- **目标（一句话）**：以「零回归」为闸门，完成战场从单 tick 到「Unit 模型 + 行动队列 + 状态框架」的骨架迁移，并把 store 升级为 schema 注册表 —— 为 M1-经济 / M4-离线并行线铺路。
- **阶段判定**：**施工阶段（重构切片）**，但按 M2a 约定走 `refactor:`/`test:` 提交、**不 bump APP_VERSION、不触发版本发布三项同步**（零用户可见变化，implementation-plan §3 已定：M2a 不 bump sync version）。S0/S1 完成后实际动业务代码时，再按 AGENTS.md 施工纪律走。

---

## 二、切片总览

| 切片 | 内容 | 涉及文件 | 提交前缀 | APP_VERSION | 并行性 |
|------|------|----------|----------|-------------|--------|
| **S0** | store.js schema 注册表改造（纯重构，不改任何 key 的存储格式） | `page/store.js` | `refactor:` | 不动 | 与 S1 文件集互斥 |
| **S1** | 时间基座（date-roll/monthly-reset 纯工具）+ 战场骨架（unit/state-core/battle 双轨 shadow） | 新增 `page/unit.js`、`page/state-core.js`、`page/date-roll.js`、`page/monthly-reset.js`；改 `page/battle.js`、`page/app.js`（debug flag） | `refactor:` + `test:` | 不动 | 与 S0 文件集互斥 |

> S0 只碰 `page/store.js`；S1 不碰 `page/store.js`（battle 战斗态为 transient，不落库）。文件集互斥是双代理并行的前提。

---

## 三、任务拆解（文件级 + 函数签名）

### S0：store.js schema 注册表

1. **注册表 API**（新增，不动现有 get/set 语义）：
   ```
   store.registerSchema(key, { currentVersion, validate, migrate: [v1->v2, v2->v3, ...] })
   ```
   - 读时：`value.version < currentVersion` → 依次执行 migrator → validate。
   - 校验失败：**不丢用户进度**，保留 raw 副本 + 标记 `corrupted`，用默认值继续运行，上报 app.js 决策。
2. **迁移分工确认**：store.js 管「key 内字段迁移」；app.js 管「跨 key 语义迁移」；sync.js 管「云端文件级迁移」。
3. 为现有 key 逐个登记 schema（v4 存档结构不变，`currentVersion` 对齐现状），全部走注册表读路径。
4. 单测：migrator 链升、validate 失败降级（corrupted 标记）、旧档 round-trip。

### S1a：时间基座（新增纯工具）

5. **`page/date-roll.js`**：
   ```
   resolveDateRoll(storedLast, today, granularity:'day'|'week'|'month')
     → { advanced, daysElapsed, newPeriodKey, crossesMonth }
   ```
   - 覆盖跨月/闰年/时区/长时间离线/自然月边界，先出纯工具单测。
6. **`page/monthly-reset.js`**：
   ```
   applyMonthlyReset(state, { resetFields, keepFields })
   ```
   - 突破永久保留 = `keepFields`；数值表留在 stats.js（炼魂）/pets.js（炼化），本模块只提供周期判定 + 重置工具。
   - 现有 challenge dailyReset / stats 月度炼魂重置迁到同一工具（**本次先迁工具、业务调用点后续随各自里程碑迁**，避免 S1 范围膨胀）。

### S1b：战场骨架（Unit + 状态 + 双轨 shadow）

7. **`page/unit.js`**（新增纯逻辑）：
   ```
   buildPlayerUnit(playerState) / buildPetUnit(petState) / buildEnemyUnit(enemyState)
   ```
   - Unit 数据结构：atk/def/hp/speed + `statuses: []`（状态宿主，不实现语义）。
   - 速度合成、阵营归属此模块。
8. **`page/state-core.js`**（新增纯逻辑）：
   - 状态定义表（效果/等级/能否叠加/免疫/驱散/持续回合/触发时机）+ `apply/tick/expire/cleanse/isImmune` + 叠加合并 + Pity 乘算。
   - 数据结构：`unit.statuses = [{ id, grade:1|2|3, stacks, duration, sourceUnitId, startedTick }]`。
   - battle.js 只在时机点（onTurnStart/onBeforeAction/onAfterDamage/onTurnEnd）调用，只负责「何时触发」，不负责「如何生效」。
9. **`page/battle.js` 双轨 shadow**：
   - 保留 `runBattle(player, enemy)` 入口，内部包装为两 Unit，走「按速度降序 + 稳定 tie-break」行动队列（队列长度恒 2）。
   - **tie-break 显式固定**：同速玩家先手，同方按 id 稳定序 —— 写死 + 测试钉住，防先手漂移。
   - dev flag（`page/app.js` 加 debug flag）下新旧引擎同输入逐回合比对（胜负/剩余血/回合数/词条触发数），117 关全量回归。
   - 多敌入口 `runMultiBattle(playerUnit, petUnits[], enemyUnits[])` **本次只留签名占位，不实现**（M2b 再做）。
10. **回归测试**：确定性种子下 117 关全量结果与迁移前 100% 一致。

---

## 四、关键决策（执行层）

| 决策点 | 选定值 | 理由 | 替代 |
|--------|--------|------|------|
| S0/S1 并行 | 文件集互斥，双代理并行 | S0 只动 store.js、S1 不碰 store.js；battle 战斗态 transient 不落库 | 串行（慢一倍，无收益） |
| 双轨 shadow 而非直接替换 | 新旧引擎逐回合比对，全量回归 | 行为漂移是最高风险（implementation-plan §7），只有证明零漂移后续才能叠加 | 直接替换（风险不可控） |
| tie-break 写死 | 同速玩家先手 + 同方按 id 稳定序 | 防先手漂移，测试钉住 | 随机/未定义（不可复现） |
| 时间工具先抽、调用点后迁 | S1 只落地 date-roll/monthly-reset 工具本体 + 单测 | 避免 S1 范围膨胀；challenge/stats 迁移随各自里程碑 | 本次全量迁移（范围失控） |
| `runMultiBattle` 只留签名 | M2b 再实现 | 保持 M2a 零回归闸门纯粹 | 提前实现（引入未验证路径） |

## 五、验收标准（逐任务）

- **S0**：现有全部 store key 走注册表读路径，读写结果与改造前逐 key 一致；migrator 链单测通过；validate 失败时保留 raw + `corrupted` 标记 + 默认值继续（不丢进度）。
- **S1a**：`resolveDateRoll` 单测覆盖跨月/闰年/时区/长时间离线/自然月边界全部通过；`applyMonthlyReset` 的 keepFields/resetFields 行为单测通过。
- **S1b**：
  1. 确定性种子下 **117 关全量结果（胜负/剩余血/回合数/词条触发数）与迁移前 100% 一致**；
  2. 3 单位用例行动顺序严格按速度 + 稳定 tie-break；
  3. 最小状态闭环（睡眠跳过回合 → 到期移除）可用 dev flag 验证；
  4. **零落库零 sync 变更**（旧 v4 存档不受影响）。
- **全局**：APP_VERSION 不变；无 changelog/README/架构表变更；全部提交为 `refactor:`/`test:` 前缀。

## 六、禁止文件与边界

- **禁止触碰**：`page/challenge.js` 通关结算逻辑、`page/sync.js` 云端 schema、现有 store key 的存储格式与 value 结构、`page/utils.js` 的 `APP_VERSION`、README.md / doc/changelog-* / 架构演化表。
- **禁止行为**：不 bump 版本、不生成 changelog、不改任何用户可见 UI。
- 若 S1 过程中发现 battle 旧引擎存在已知 bug（如 v1.10.2 的 NaN 事故类），**只记录、不顺手修** —— 修复单独提切片，避免污染零回归对比基线。

## 七、风险与护栏（执行层）

1. **行为漂移**（最高）→ 双轨 shadow 逐回合比对 + 确定性种子 + 117 关全量回归 + tie-break 测试钉住。
2. **store 改造破坏旧档** → 注册表读路径保持原 get/set 语义；migrator 链单向；validate 失败降级不丢进度；round-trip 测试。
3. **时间口径串味** → 工具先抽 + 单测覆盖边界，调用点迁移留到各自里程碑，S1 不混改。

## 八、初始 todo 列表

- [ ] S0-1 实现 `store.registerSchema` + 现有 key 登记 + 单测
- [ ] S1a-1 实现 `date-roll.js` + 边界单测
- [ ] S1a-2 实现 `monthly-reset.js` + 单测
- [ ] S1b-1 实现 `unit.js`（三工厂 + 速度合成 + statuses 宿主）
- [ ] S1b-2 实现 `state-core.js`（状态表 + apply/tick/expire/cleanse + 叠加/Pity）
- [ ] S1b-3 battle.js 双轨 shadow（runBattle 包装双 Unit 队列 + dev flag 比对）
- [ ] S1b-4 117 关全量回归（确定性种子，与迁移前 100% 一致）
- [ ] S1b-5 tie-break 测试 + 最小状态闭环 dev flag 验证
- [ ] 全部完成：确认零落库零 sync、APP_VERSION 未动、git 状态干净

---

## 待裁决：

- **OQ-10 前提确认**：技能槽位「本月通关 12/20」采用自然月口径、达成即永久解锁 —— 涉及 M1-经济，不影响 S0/S1，但请确认按 implementation-plan §6 默认值执行。
- **S1 是否顺带迁移 challenge dailyReset 的时间口径**（工具已就绪）：默认**不迁移**（留到 M1），如需本次一并处理请指出。
- **执行代理分工**：S0/S1 双代理并行，还是单代理顺序执行？（默认双代理，文件集互斥已验证）

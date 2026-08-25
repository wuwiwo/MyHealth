# MyHealth v1.10 Release Notes / 变更日志

**Date:** 2026-08-25

v1.10 是内容大版本：关卡世界从「永恒之战」延伸至「超越极限」，同时 BOSS 战机制升级为双词条叠加。

---

## v1.10.0

**Date:** 2026-08-25

### 新增功能

- 🗺️ **新章节 16~21 章（+36 关；修正历史计数：实际总关卡数 81 → 117（此前文档的 90 为误记））**
  - 第16章 破晓远征 / 第17章 星陨之海 / 第18章 时空回廊
  - 第19章 创世余烬 / 第20章 万象归无 / 第21章 超越极限
  - 数值延续既有成长曲线（每章整体约 +11%），魂攻/魂防自第 10 章引入后继续参与全部战斗
  - 终局 BOSS「超越·无限」（21-6）：atk 1760 / def 890 / hp 16700 / 魂攻 835 / 魂防 645
  - 每章第 6 关为 BOSS 关，与既有章节结构一致

- ⚔️ **双词条 BOSS（仅 16 章起，1~15 章 BOSS 保持单词条不变）**
  - `levels.js` 新增关卡字段 `dualAffix:true`（16-6 / 17-6 / 18-6 / 19-6 / 20-6 / 21-6）
  - 战斗开始时从 5 种词条池抽取 **2 条不重复词条**，机制完全叠加：
    - 怒气勃发 + 铁壁护盾：攻击力滚雪球的同时周期性套盾
    - 荆棘之躯 + 生命汲取：反伤与回血双续航
    - 其余任意组合均按钩子链式执行
  - 实现为通用多词条架构：`pickBossAffix(count)` 支持抽 N 条、`combineAffixes()` 把多条词条合成为复合词条（apply/onTurn/onAttack/reflect 同名钩子链式依次调用）、`rollBossAffixFor(level)` 按关卡配置决定单/双词条
  - 战斗标题栏显示组合词条名（如 `👑 [怒气勃发·铁壁护盾]`）
  - 关卡预览胜率模拟同步采用双词条口径，模拟结果与实战一致

### UI 调整

- 📖 「游戏规则」引导弹窗的 Boss 词缀说明补充双词条规则说明（16 章起）

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
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |

### 修改文件

- `page/levels.js`（新增 chap16~21 共 36 关，dualAffix 标记）
- `page/battle.js`（pickBossAffix 支持 N 条 / combineAffixes 复合词条 / rollBossAffixFor）
- `page/game-battle.js`（战斗入口接入 rollBossAffixFor）
- `page/game-render.js`（胜率模拟接入 rollBossAffixFor / 规则引导文案）
- `page/utils.js`（APP_VERSION 1.9.11 → 1.10.0）
- `page/index.html`（cache-busting v17 → v18）
- `README.md`（副标题版本号 / 功能表与目录树关卡数 / 版本表新增行）
- `CONTEXT.md`(领域词汇表关卡条目更新)

---

## v1.10.1

**Date:** 2026-08-25

### 平衡调整

- 🎁 **通关炼化点奖励倍率重做**
  - 普通关：基础 1~2 点 × **2** = 2~4 点（原固定 1~3 点）
  - BOSS 关：基础 1~2 点 × **10** = 10~20 点（原与普通关相同，仅靠词缀难度区分收益）
  - 结算面板显示倍率标注（`🎁 战利品 +N 炼化点（BOSS ×10）`）
  - 计算抽取为 `rollLoot(levelInfo)` 纯函数，便于测试与后续调参

### 修复

- 🩹 **补上 5-6「大魔导师」缺失的 Boss 标记**（v1.5 起的历史遗留）
  - 该关从未标 `boss:true`：不吃词条、不显示 👑、战利品按普通关计算
  - 本次修复后：正常获得单词条 + 👑 显示 + BOSS 倍率奖励；NPC 名同步改为「BOSS 大魔导师」与其他 Boss 关格式一致
  - 已通关玩家不受影响（cleared 状态不变），重复挑战可体验词条机制

### 架构演化

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |

### 修改文件

- `page/game-battle.js`（rollLoot 倍率函数 / endBattle 接入 / 结算文案带倍率标注）
- `page/levels.js`（5-6 补 boss:true 与命名规范）
- `page/utils.js`（APP_VERSION 1.10.0 → 1.10.1）
- `page/index.html`（cache-busting v18 → v19）
- `README.md`（副标题版本号 / 版本表新增行）

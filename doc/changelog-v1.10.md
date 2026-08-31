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
    - 其余任意组合均按各钩子语义串联执行
  - 实现为通用多词条架构：`pickBossAffix(count)` 支持抽 N 条、`combineAffixes()` 把多条词条合成为复合词条（apply/onTurn/onAttack/reflect 同类钩子按各自语义串联：结果回填对应参数槽位，其余参数透传；参数丢失问题见 v1.10.2）、`rollBossAffixFor(level)` 按关卡配置决定单/双词条
  - 战斗标题栏显示组合词条名（如 `👑 [怒气勃发·铁壁护盾]`）
  - 关卡预览胜率模拟同步采用双词条口径，模拟结果与实战一致

### UI 调整

- 📖 「游戏规则」引导弹窗的 Boss 词缀说明补充双词条规则说明（16 章起；原计划随本版上线，实际遗漏，已由 v1.10.4 补齐）

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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |

### 修改文件

- `page/levels.js`（新增 chap16~21 共 36 关，dualAffix 标记）
- `page/battle.js`（pickBossAffix 支持 N 条 / combineAffixes 复合词条 / rollBossAffixFor）
- `page/game-battle.js`（战斗入口接入 rollBossAffixFor）
- `page/game-render.js`（胜率模拟接入 rollBossAffixFor；规则引导文案见 v1.10.4）
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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |

### 修改文件

- `page/game-battle.js`（rollLoot 倍率函数 / endBattle 接入 / 结算文案带倍率标注）
- `page/levels.js`（5-6 补 boss:true 与命名规范）
- `page/utils.js`（APP_VERSION 1.10.0 → 1.10.1）
- `page/index.html`（cache-busting v18 → v19）
- `README.md`（副标题版本号 / 版本表新增行）

---

## v1.10.2

**Date:** 2026-08-25

### 修复

- 🩹 **修复双词条组合器（combineAffixes）参数丢失引发的三连故障**
  - 根因：v1.10.0 的通用链式组合器把上一个钩子的**返回值**当成下一个钩子的**全部参数表**，导致：
    - 「怒气勃发·铁壁护盾」组合：护盾钩子拿到 undefined 的 boss 参数 → 抛 TypeError
    - 部分组合 enemy.atk 被写成 undefined → 伤害 NaN → 战斗永远打不死
  - 症状①：点击 Boss 关卡大概率不弹预览窗 —— 弹窗前的 50 次胜率模拟在坏引擎上抛异常，整个渲染中断（约 20% 概率抽到毒组合）
  - 症状②：Boss 战进行中卡死无日志 —— tick 循环抛异常后 `_battleRunning` 永久为 true
  - 症状③：胜率预测失真 —— 模拟与实战共用坏引擎；v1.10.1 测得的「21-6 约5%胜率」实为 NaN 污染的假数据
  - 修复：按钩子语义分别实现参数保持的串联 —— onTurn 结果回填 atk 槽位、apply 结果回填 atk、onAttack 用原始参数依次调用、reflect 求和；其余参数全程透传
  - 加固：战斗循环增加异常兜底（battleTick 抛错时判玩家胜并正常结算，不再可能永久卡死）
  - 回归验证：10 种词条组合 ×200 场全流程战斗零异常零卡死；难度曲线重测 —— 16~21 章 Boss 在每章 +25% 成长递推下全部可通（16章对刚通关15章的玩家全程高胜率），终局压力集中在后期章节

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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 双词条组合器钩子参数修复+战斗异常兜底 |

### 修改文件

- `page/battle.js`（combineAffixes 四类钩子分别正确串联 / 移除错误的通用 chain）
- `page/game-battle.js`（tick 循环 try/catch 兜底 + 异常时正常走 endBattle 结算）
- `page/utils.js`（APP_VERSION 1.10.1 → 1.10.2）
- `page/index.html`（cache-busting v19 → v20）
- `README.md`（副标题版本号 / 版本表新增行）

---

## v1.10.3

**Date:** 2026-08-25

### 修复

- 🩹 **修复战利品按"下一关"类型结算**
  - 根因：`endBattle()` 先把 `g.current` 推进到下一关，再查 `g.current` 的关卡类型计算战利品 —— 实际结算的是**下一关**的类型
  - 症状：打赢 17-5（普通）显示「+20 炼化点（BOSS ×10）」（下一关 17-6 是 Boss）；反向更严重 —— **打赢任何章节 BOSS 都只发了 ×2 普通奖励**（下一关是新章普通关），每次少拿 8~18 点
  - 修复：推进 current 之前先捕获被打败的关卡对象，战利品严格按被击败关卡结算
  - 回归验证：17-5/17-6/16-6/21-6 四种边界全部按正确类型结算；项目暂无自动化测试，旧顺序的 bug 行为以本边界清单作为回归要点人工复核
- 说明：普通关奖励「有的 2 点有的 4 点」为正常设计（基础 1~2 随机 ×2 倍率）

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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 双词条组合器钩子参数修复+战斗异常兜底 |
| v1.10.3 | 18 | 574 行 challenge.js | 战利品按被击败关卡结算 |

### 修改文件

- `page/game-battle.js`（endBattle 先取 beatenLv 再推进 current）
- `page/utils.js`（APP_VERSION 1.10.2 → 1.10.3）
- `page/index.html`（cache-busting v20 → v21）
- `README.md`（副标题版本号 / 版本表新增行）

---

## v1.10.4

**Date:** 2026-08-27

### 修复

- 🩹 **召唤面板概率文案与新阶梯对齐（v1.9.10 起的遗留）**
  - 根因：`challenge.js` 面板文案停留在旧阶梯「基础 15% / 保底 25% / 第 5 次起成功率 25%」，与实际 `summonRate()` 阶梯（10/25/40/55/80/100）不一致，用户会被错误概率误导
  - 修复：成功率标签随已用次数动态显示「基础 10% / 保底 80% / 必成 100%」，页脚改为「成功率阶梯 10/25/40/55/80/100%」；面板回退默认率 15 → 10 与新阶梯一致
- 🩹 **补齐「游戏规则」引导弹窗的双词条说明（v1.10.0 遗漏项）**
  - v1.10.0 变更日志声称引导弹窗已补充双词条规则说明，实际未落地；本版在引导卡片补上「16 章起 BOSS 同时携带 2 条词条，机制叠加」

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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 双词条组合器钩子参数修复+战斗异常兜底 |
| v1.10.3 | 18 | 574 行 challenge.js | 战利品按被击败关卡结算 |
| v1.10.4 | 18 | 574 行 challenge.js | 召唤面板文案对齐+引导弹窗双词条说明补齐 |

### 修改文件

- `page/challenge.js`（召唤面板成功率标签/页脚文案对齐 summonRate 阶梯，回退默认 15→10）
- `page/game-render.js`（引导卡片补双词条说明）
- `page/utils.js`（APP_VERSION 1.10.3 → 1.10.4）
- `page/index.html`（cache-busting v21 → v22）
- `README.md`（副标题版本号 / 目录树补 changelog-v1.10.md 与 v2.0 文档 / 版本表新增行）
- `doc/changelog-v1.10.md`（新增本小节）

---

## v1.10.5

**Date:** 2026-08-27

### 架构重构（行为零变化）

- 🧹 **词条组合器去重（combineAffixes 钩子组合表化）**
  - 四段重复的单/多分发（apply/onTurn/onAttack/reflect）收敛为钩子组合表 `AFFIX_HOOK_COMBINERS` + 单一循环；每种钩子的串联语义保持不变（结果回填对应参数槽位、onAttack 副作用依次调用、reflect 求和、单条直接透传原词条）
  - `pickBossAffix` 统一返回按 index 升序的词条数组，抽取层不再拼接名称；合成层只负责组合（冗余的 `multi/parts` 标志移除）
- 🧹 **`rollLoot(beatenLv)` 直接传关卡对象**（不再为读取一个 `boss` 布尔而构造临时对象）
- 🧹 **新增 `buildBattleSides(stats, lv)`**：`startBattle` 与关卡胜率模拟（`showLevelPreview`）共用同一对战双方构造，消除两处潜在漂移
- 回归验证：10 种双词条组合 × 全钩子逐项断言 + 50 次单/双抽取 + 组合词条完整战斗局，零异常零断言失败

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
| v1.9.3 | 18 | 397 行 tab-strength.js | 当日总容量显示/导出3-5天+剪贴板/图表tooltip+移动端/热力图双模式/属性日志完善/同步保护 |
| v1.9.4 | 18 | 443 行 challenge.js | pendingChallenge状态机(稍后再说不吞次数)/noBackdrop防误关/结算页每秒点击柱状图 |
| v1.9.5 | 18 | 443 行 challenge.js | 结算时才写summonedDate(中途退出不锁死)/lastRewardDate/旧锁恢复入口 |
| v1.9.6 | 18 | 443 行 challenge.js | 奖励阈值+50%(2250/3375/675)/热血buff改周累计5次/全屏金色闪光特效 |
| v1.9.7 | 18 | 455 行 challenge.js | 修复召唤NaN污染永远失败/getChallenge字段归一化/数值运算isFinite防护 |
| v1.9.8 | 18 | 488 行 challenge.js | 修复?/?显示(次数用完时canSummon补字段+面板can检查)/临时屏幕debug面板 |
| v1.9.9 | 18 | 552 行 challenge.js | 历史召唤成绩(含buff)/debug面板全分支常驻开关/召唤率新规则(前4次15%第5次起25%) |
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（battle.js 多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 双词条组合器钩子参数修复+战斗异常兜底 |
| v1.10.3 | 18 | 574 行 challenge.js | 战利品按被击败关卡结算 |
| v1.10.4 | 18 | 574 行 challenge.js | 召唤面板文案对齐+引导弹窗双词条说明补齐 |
| v1.10.5 | 18 | 574 行 challenge.js | 词条钩子组合表化+pickBossAffix 数组化+buildBattleSides |

### 修改文件

- `page/battle.js`（AFFIX_HOOK_COMBINERS 钩子组合表 / pickBossAffix 返回数组 / combineAffixes 单一循环 / buildBattleSides）
- `page/game-battle.js`（startBattle 使用 buildBattleSides / rollLoot 直传 beatenLv）
- `page/game-render.js`（胜率模拟使用 buildBattleSides）
- `page/utils.js`（APP_VERSION 1.10.4 → 1.10.5）
- `page/index.html`（cache-busting v22 → v23）
- `README.md`（副标题版本号 / 版本表新增行）
- `doc/changelog-v1.10.md`（新增本小节）

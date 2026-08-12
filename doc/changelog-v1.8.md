# MyHealth v1.8 Release Notes / 变更日志

**Date:** 2026-07-09

---

## v1.8.2

### 修复
- 🩹 防御等小数属性显示浮点精度问题（0.6000000000000001 → 0.6）
- 🩹 批量按钮 disabled 属性 HTML 畸形（双 style 属性）导致点数不足时仍可点击，Math.min 截断为1次

## v1.8.1

### UI 调整
- 🔮 炼化改为顺序升级：从F级开始，5项全满后自动升至下一等级（F→E→D→...→SSR）
- 炼化界面显示当前等级、进度条、5项属性等级详情
- 支持批量炼化：1次/10次/50次
- 炼化只选未满级的属性，不再浪费在已满级项上
- 炼化记录显示在弹窗内（最近30条）

## v1.8

### 新增功能
- 🏔️ 新增10-15章关卡（灵魂觉醒/深渊炼狱/虚空裂缝/神域之门/万物归一/永恒之战），共36关
- 👻 魂攻击与魂防御：独立于攻击/防御的新属性，从10-1起敌方拥有魂属性
  - 魂攻击伤害公式与普通攻击相同（atk - def/2 + 随机）
  - 如果对方没有魂防御，魂攻击造成全额伤害
- 🔮 炼魂系统：本月挑战成功9-6后解锁
  - 训练容量转化为炼化点数：每100kg → 10次炼化机会
  - 9级品质：F/E/D/C/B/A/R/SR/SSR，成功率95%~10%
  - 每次炼化随机提升攻击/防御/生命/魂攻击/魂防御1项
  - 各等级有最大强化等级限制（F=10, SSR=100）
  - 炼魂系统每月重置（包括带来的属性加成）
- ⚖️ 炼化等级数值表
  - F: 攻+1 防+0.2 命+4 魂攻+1 魂防+0.2 (满级10, 95%)
  - E: 攻+2 防+0.3 命+6 魂攻+2 魂防+0.3 (满级15, 80%)
  - D: 攻+3 防+0.5 命+8 魂攻+3 魂防+0.5 (满级20, 75%)
  - C: 攻+4 防+0.7 命+10 魂攻+4 魂防+0.7 (满级30, 60%)
  - B: 攻+5 防+1 命+12 魂攻+5 魂防+1 (满级40, 50%)
  - A: 攻+7 防+2 命+15 魂攻+7 魂防+2 (满级50, 40%)
  - R: 攻+9 防+4 命+20 魂攻+9 魂防+4 (满级60, 30%)
  - SR: 攻+12 防+6 命+30 魂攻+12 魂防+6 (满级80, 20%)
  - SSR: 攻+15 防+9 命+15 魂攻+15 魂防+9 (满级100, 10%)

### 修复
- 🩹 修复按秒数计量单位的动作不生效问题（strAddBtn 开表单时不调 adaptStrForm + openStrEdit 不适配 eqWeight）

### UI 调整
- 战斗界面显示魂攻击/魂防御
- 挑战 Tab 属性栏新增魂攻/魂防显示
- 关卡预览显示敌方魂属性（10章起）
- 通关9-6后属性栏出现炼魂入口按钮（🔮）

### 数据层变更
- 新 store key `refine`：`{ points, totalEarned, unlocked, upgrades: { F:{atk,def,hp,soulAtk,soulDef}, ... } }`
- `calculateStats` 新增第8参数 `refineBonus`，返回值加 `soulAtk`/`soulDef`
- `createBattle` player/enemy 加 `soulAtk`/`soulDef`
- `battleTick` 加魂攻击阶段（普通攻击后、敌方攻击前后）
- sync.js 3函数加 refine 字段
- 每月重置时清空 refine（包括 unlocked）
- 1-8章关卡补 soulAtk:0, soulDef:0

### 新增文件
- 无（全部改动在现有文件内）

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
## v1.8.3

### 修复
- 🩹 炼化批次调试增强：doRefineBatch 添加三重防御（删除重复 batchRefine 调用、points 显式检查、pointer-events + data-disabled）
- 🩹 恢复 index.html UTF-8 编码（PowerShell Set-Content 损坏文件后修复）
- 🩹 cache-busting 验证：所有 `<script>` 标签统一添加 `?v2` 参数

## v1.8.4

### 修复
- 🩹 恢复 index.html UTF-8 编码（上一轮 PowerShell Set-Content 用错误编码导致 emoji 乱码）

## v1.8.5

### 修复
- 🩹 doRefineBatch 内联循环替代 batchRefine 调用，添加逐次诊断输出

## v1.8.6

### 修复
- 🩹 doRefineBatch 逐次记录 getCurrentRefineGrade 返回值与中断原因，控制循环次数输出

## v1.8.7

### 修复
- 🩹 修复 `allDone` 判断：只有当 `allMaxed && !nextGrade` 才算全满，原逻辑 `!nextGrade` 会误判最后一关完成

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

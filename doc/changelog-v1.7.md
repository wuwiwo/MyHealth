# MyHealth v1.7 Release Notes / 变更日志

**Date:** 2026-06-30

---

## v1.7.4

### 修复
- 🩹 补发6月旬奖励：回溯6月三个旬的达标情况，中下旬双达标各+90攻防，共补发 permBonus +180攻 +180防
- 一次性迁移（`backfillJunePermBonus`），用 `dh-june-bonus-backfilled` 标记防重复

## v1.7.3

### 修复
- 🩹 旬奖励改为永久累积（permBonus）：旬达标后奖励加到 game.permBonus，永久保留
- 月初基础属性归零（10/10/100），但累积奖励/惩罚保留（如 10+60奖励-0惩罚=70）
- 属性计算说明显示分项：基础 + 累积奖励 - 永久惩罚

## v1.7.2

### 修复
- 🩹 基础属性计算窗口从「近30天滚动」改为「本月」：每月1号自然归零（10/10/100）
- 保留 periodBonus（旬奖励）和 permPen（永久惩罚）的累积
- 属性计算说明文案"近30天"改为"本月"

## v1.7.1

### 新增功能
- 📅 每月1号自动重置挑战关卡：清空 cleared/current/attempts，保留 permPen/pen_*/records/attrLog
- 首次访问不触发重置（避免新用户被清空）

### 修复
- 🩹 旬周期奖励/惩罚门控到 2026-07-01 生效（6月30日及之前不应用）

## v1.7

### 新增功能
- 📝 动作库支持动作描述，简易 markdown 渲染（`**加粗**`、`# 标题`、`` `代码` ``、`- 列表`）
  - 列表默认显示第一行，点击展开完整渲染
  - 编辑器加描述 textarea
- 📅 体重趋势图增加周/月切换视图（最近7天/30天）
- 🏷️ 体重备注提供高频备注快捷选择（从历史 notes 统计 TOP5）
- 📤 数据管理新增「导出最近7天」功能（精简格式，含统计摘要，适合发给 AI）
- 📊 旬周期属性奖励系统替代原周奖励
  - 每月分3旬：上旬(1-10)、中旬(11-20)、下旬(21-月末)
  - 旬内6天→攻防各+30；旬内容量达标(2500kg按天数比例)→攻防各+60（可叠加）
  - 下旬容量阈值按天数缩放（28天月→2000kg，31天月→2750kg）

### 修复
- 🩹 力量计划编辑器动作输入改为从动作库下拉选择（原为自由文本输入）
- 🩹 体重图移动端显示拥挤修复（`rect.width=0` 时 fallback 到 clientWidth）
- 🩹 同步新旧数据判断修复：改用 `store.getLastModTime()`（数据最后修改时间）替代 `_lastSyncTime`（同步操作时间），解决"拉取后未改数据却判为较新"的误判
- 🩹 惩罚数值更新为 1.5 倍：missDays×3 atk + missDays×1.5 def（原 ×2 和 ×1）

### UI 调整
- 挑战 Tab 属性栏显示当前旬名称和天数进度（如"上旬 · 💪 还差2天达标"）
- 属性计算说明弹窗更新为旬周期规则
- 属性变更日志显示"训练X天"（原"周训练X天"）

### 数据层变更
- `exercises` schema 新增 `description` 字段（migrateExercisesV17 自动补全）
- `store.js` 新增 `_lastModTime` 追踪：`set()`/`mergeAll()`/`setAll()` 时更新 `dh-mod-time`
- `store.js` 暴露 `getLastModTime()` 函数
- `sync.js` `getAllData().lastUpdated` 改用 `store.getLastModTime()`
- `stats.js` 新增 `getCurrentPeriod`/`getPreviousPeriod`/`calculatePeriodBonus`/`calculatePeriodPenalty`
- `stats.js` `calculateStats` 签名变更：`wkBonus` → `periodAtkBonus`/`periodDefBonus`
- 废弃 `getWeekDays`/`getLastWeekDays`/`wkBonus`/`permPenLastWeek`

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

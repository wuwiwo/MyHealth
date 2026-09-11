# MyHealth v1.5.1 — Code Review Report / 代码审核报告

**Date:** 2026-06-19 · **Files:** 15 · **Review Scope:** v1.5.0 + v1.5.1

---

## Summary / 总览

| Severity | Count | Fixed |
|----------|-------|-------|
| 🔴 Critical | 2 | 1/2 |
| 🟠 High | 2 | 2/2 |
| 🟡 Medium | 2 | 2/2 |
| 🔵 Low | 1 | 0/1 |

---

## ✅ 已修复 / Fixed

### C2 — 战斗动画误报
审核报告声称 hitShake 动画未实现，实际 `index.css:275-276` 和 `tab-game.js:248-249` 早已存在。误报，已验证。

### H1 — 首次同步逻辑
`sync.js:105-106` 首次同步时 `_lastSyncTime=0` 导致 `localNewer=false`、`remoteNewer=true`，自动建议拉取云端可能覆盖本地数据。
**修复**：`isFirst = _lastSyncTime===0` 时显示"🆕 首次同步"中性建议，无自动方向引导。

### H2 — dataSummary 缺字段
`dataSummary()` 只显示 entries/cardio/weight/plans/game，缺少 PR/records/attrLog/cardioTypes 统计。
**修复**：新增 `prsC`/`recC`/`logC`/`ctC` 计数，同步对话框中显示 PR项数和日志条数。

### M1 — autoBackup 同名覆盖
自动备份文件名 `'myhealth-auto-'+today()+'.json'` 同一天多次同步被静默覆盖。
**修复**：文件名加时间戳 `'myhealth-auto-'+today()+'-'+Date.now().toString(36)+'.json'`。

### M2 — importData/mergeServerData 重复字段解析
`importData` 中有完整的字段 → StoreKey 映射逻辑，与 `mergeServerData` 重复。
**修复**：提取 `function buildImportMap(data)` 共用，importData 和使用 `store.mergeAll(buildImportMap(data))`。

---

## ❌ 未修复 / Not Fixed

### C1 — 5 XSS Injection Points

个人项目无需修复。注入点在：

| File | Line | Field |
|------|------|-------|
| `tab-strength.js` | 149 | `ex.exercise` — 计划编辑器动作名称 |
| `tab-strength.js` | 168 | `_woPlan.name` — 训练浮层计划名 |
| `tab-strength.js` | 226 | `entry.exercise` — 编辑记录动作名称 |
| `tab-cardio.js` | 256 | `_woPlan.name` — 有氧浮层计划名 |
| `tab-profile.js` | 27 | `r.note` — 体重备注文本 |

### L1 — CONTEXT.md 缺数据模型

`tab-game.js` 使用的 `records` / `attrLog` 两个 Store Key 未在 `CONTEXT.md` 中说明。

| Key | Type | 说明 |
|-----|------|------|
| `records` | `{ monthly, maxCleared, maxAtk, maxDef, maxHp, … }` | 历史/月度最佳属性+关卡 |
| `attrLog` | `[{ date, atk, def, hp, atkDiff, reason, … }]` | 属性变更日志（最多60条） |

---

## 修复后变更

| 文件 | 变更 |
|------|------|
| `page/sync.js` | dataSummary 扩字段；首次同步中性提示；备用文件名加时间戳；提取 buildImportMap  |<｜end▁of▁thinking｜>
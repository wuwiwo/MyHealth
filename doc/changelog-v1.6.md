# MyHealth v1.6 Release Notes / 变更日志

**Date:** 2026-06-24

---

## v1.6.1

### UI 调整
- 🏷️ PR 显示对 ratio<100% 的动作附加有效容量 tag（如 `📊 224kg →112`），提示属性计算口径
- PR 数据本身不变（保持 weight×reps 原始值，与历史可比）

## v1.6

### 新增功能
- ⚙️ 新增「设置」Tab，含 4 个子页：动作库 / 计划管理 / 挑战管理 / 数据管理
- 🏋️「力量」+「有氧」合并为「训练」Tab，通过子 Tab 切换
- 📚 动作库驱动系统：新 store key `exercises`，统一管理力量动作和有氧类型
  - 力量动作支持 ratio（比值百分比），影响容量计算
  - 有氧类型从 `CARDIO_TYPES` 常量 + `cardioTypes` store 迁移到统一动作库
  - 设置/动作库支持新建/编辑/删除动作（CRUD）
- ⚖️ 力量容量公式改为 `weight × reps × (ratio/100)`，ratio 从动作库实时查询
- 🔀 子 Tab 切换机制泛化：`switchSub(tab, sub)` 支持训练/个人/设置 Tab
- 📊 数据管理（导出/导入/同步）从个人 Tab 移至设置 Tab
- 🎮 挑战管理（重置进度/属性日志/属性计算/历史最佳）从挑战 Tab 移至设置 Tab

### 修复
- 🩹 修复数据管理 HTML（在 profile）与事件处理（在 strength）的跨 Tab 残留
- 🩹 同步数据格式版本 3→4，包含 exercises 字段，避免跨设备动作库丢失
- 🩹 sync.js 4 个函数（getAllData/mergeServerData/buildImportMap/dataSummary）全部支持 exercises

### UI 调整
- 顶部 Tab 栏从 4 个（力量/有氧/个人/挑战）变为 4 个（训练/个人/挑战/设置）
- 挑战 Tab 属性栏移除重置/日志/计算三个按钮（移至设置 Tab）
- 同步对话框显示动作库数量
- 热力图点击日期跳转到训练 Tab 的力量子页

### 新增文件
- `page/tab-settings.js` — 设置 Tab 全部逻辑（225 行）

### 删除内容
- `utils.js` — `EXERCISES` 常量（20 个动作名）、`CARDIO_TYPES` 常量（6 种有氧类型）
- `index.html` — profile 中数据管理区域（6 行 HTML）
- `tab-profile.js` — `switchProfileSub()` 函数（由通用 `switchSub` 替代）
- `tab-strength.js` — `exportDataBtn`/`importDataBtn` 事件处理（移至 tab-settings.js）
- `tab-game.js` — `resetGameBtn`/`attrLogBtn`/`attrInfoBtn` 事件处理（移至 tab-settings.js）

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

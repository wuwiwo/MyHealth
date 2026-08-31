# MyHealth v1.11 更新日志

## v1.11.0（2026-09-01）

### 新增功能

- **📖 动作百科**：设置→动作库新增「📖 动作百科」入口，内置 1324 个健身动作（中文名/英文名/部位/器械/目标肌群），支持按部位、器械筛选 + 分页浏览 + 详情页 GIF 点击播放
- **动作关联机制**：现有动作可关联数据集动作（编辑 modal 新增关联区块），支持别名匹配/模糊搜索/手动选择/解除；关联后动作卡片显示 📖 标记 + 缩略图
- **MEDIA_BASE 图床覆盖**：新增 `config.js` 全局常量，媒体引用支持本地路径 ↔ 图床 URL 一键切换（onerror 自动回退本地）
- **数据管线**：`build-dataset.js` 瘦身打包脚本（raw 1324 条 → `window.EX_DATASET`，gzip 约 175KB）+ `fetch-media.js` 媒体下载脚本（38 个媒体文件，180×180 规格）
- **store.js schema 注册表**（M2a S0）：新增 `registerSchema`/`migrate`/`validate` 机制，为后续新持久化键（技能/宠物/宝珠）做版本迁移地基
- **时间工具**（M2a S1-B）：新增 `date-roll.js`（本地日历日/月键纯函数）+ `monthly-reset.js`（自然月窗口判定），23 项边界测试全绿

### UI 调整

- **训练页**：debug 按钮悬浮化（可隐藏/展开）；本周进度卡片与顶部间距加大、阴影轻盈化（去"脏重"感）；断签面板新增明显标注的「休息日」选项
- **个人页**：体重记录按月分组（默认展开最近一月）；体重数值统一保留最多 2 位小数
- **挑战页**：个人属性面板 UI 优化（更贴近游戏面板语言）；热力图「容量/次数」切换改为纯图标 + toast 提示；长按热力图直接查看当日数据（不再跳转）
- **设置页**：力量/有氧动作分页展示

### 架构

- battle.js：词条钩子组合表化 + buildBattleSides 抽取（v1.10.5，随本版合并）
- 新增文件：`page/date-roll.js`、`page/monthly-reset.js`、`page/ex-dataset.js`、`page/config.js`、`scripts/build-dataset.js`、`scripts/fetch-media.js`、`data/`（raw 原料 + exercises-dataset.js + action-map.json）、`page/media/`（38 个媒体文件）

### 修改文件

- `page/utils.js`（APP_VERSION）
- `page/index.html`（script 链 + cache-busting v24）
- `page/index.css`、`page/tab-settings.js`、`page/tab-profile.js`、`page/tab-strength.js`、`page/challenge.js`、`page/store.js`
- `README.md`、`CONTEXT.md`

---

## 架构演化表

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| ... | ... | ... | ... |
| v1.10.5 | 18 | 574 行 challenge.js | 词条钩子组合表化+pickBossAffix 数组化+buildBattleSides |
| v1.11.0 | 22 | 583 行 challenge.js | 动作百科+关联机制+store注册表+时间工具+UI优化 |

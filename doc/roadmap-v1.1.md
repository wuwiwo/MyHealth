# MyHealth v1.1+ Roadmap / 功能路线图

**Created:** 2026-06-14 · **Current:** v1.0

---

## 一、当前功能覆盖评估 / Current Feature Coverage

| 维度 / Dimension | 已有 / Existing | 缺失 / Missing |
|---|---|---|
| 训练记录 Training Log | 力量 + 有氧 Strength + Cardio | 无长期趋势分析 No long-term trend analysis |
| 训练计划 Plans | 创建/执行 Create/Execute | 无法复制/导入模板 No copy/import |
| 身体数据 Body Data | 体重 Weight | 无围度、体脂等 Other metrics |
| 激励系统 Motivation | RPG 游戏 Game | 无成就/里程碑 No achievements |
| 数据管理 Data Mgmt | 云同步+导出 Sync+Export | 无历史对比统计 No comparison stats |
| 目标设定 Goals | 无 None | 用户无法设定和追踪目标 |
| PR 记录 PR Tracking | 无 None | 无法自动追踪个人最佳 |

---

## 二、建议功能 / Proposed Features

### 1. PR 个人最佳 / Personal Record Tracking

**优先级：P1 · 工作量：小 · 预计行数：~80**

- 自动追踪每个动作的历史最佳：最大重量、最多次数、最大容量（weight × reps）
- 记录新 PR 时 toast 提示并在条目上标记 🏆
- 在 Strength Tab 底部新增 PR 展示区
- 存储位置：`store.set('pr', { ... })`

**数据结构：**
```
{ "二头弯举": { maxWeight: 10, maxReps: 15, maxVolume: 120, date: "2026-06-14" } }
```

---

### 2. 成就系统 / Achievement System

**优先级：P2 · 工作量：中 · 预计行数：~150**

- 里程碑弹窗，触发条件：
  - 🎖️ 初出茅庐 — 完成第 1 次训练
  - 🔥 持之以恒 — 连续训练 7 天
  - 💪 百次勇士 — 累计 100 次训练
  - 🏋️ 千磅俱乐部 — 单日总容量 ≥ 1000kg
  - 🏃 马拉松 — 累计有氧 42.2km
  - 👑 征服者 — 通关全部 6 章
- 成就弹出动画 + 存入 `store.set('achievements', [...])`
- Game Tab 中新增「🏆 成就」入口

---

### 3. 周/月目标 / Weekly/Monthly Goals

**优先级：P2 · 工作量：小 · 预计行数：~40**

- 用户可设定每周训练天数目标（默认 3）
- Game Tab 属性栏显示进度条：`■■■□□□□ 3/5 天`
- 达成目标时 toast 祝贺

---

### 4. 训练统计面板 / Training Statistics Dashboard

**优先级：P3 · 工作量：中 · 预计行数：~120**

- 在 Profile Tab 中新增统计卡片：
  - 月度总容量趋势图（复用 `drawLineChart`）
  - 累计训练天数
  - 最常做的动作 TOP5
  - 本年度训练日历总览
- 复用已有的 `linechart.js` 和 `stats.js`

---

### 5. 快速复制 / Quick Copy

**优先级：P3 · 工作量：小 · 预计行数：~30**

- Strength Tab 点击「📋 复制上次训练」
- 自动填充最近一次训练日的所有动作到当前日期
- 支持选择复制上周同星期几的训练

---

### 6. 身体维度记录 / Body Measurements

**优先级：P4 · 工作量：中 · 预计行数：~100**

- Profile Tab 新增维度输入：胸围/腰围/臀围/臂围/腿围
- 每项独立趋势图（复用 `drawLineChart`）
- 存储：`store.set('measurements', { records: [...] })`

---

### 7. 休息日提醒 / Rest Day Reminder

**优先级：P4 · 工作量：小 · 预计行数：~30**

- 检测连续训练天数 ≥ 5 时，toast 提示「连续训练 5 天，注意休息 🛌」
- 可在 Settings 中关闭提醒

---

### 8. 训练笔记 / Training Journal

**优先级：P4 · 工作量：小 · 预计行数：~40**

- 每日一段自由文本日记
- Strength Tab 日期导航旁增加「📝 笔记」按钮
- 存储：`store.set('journal', { "2026-06-14": "今天状态很好..." })`

---

## 三、版本号嵌入方案 / Version Badge

**位置：** 页面 Header 中 `header-subtitle` 下方，或页脚固定

**实现步骤：**

1. `utils.js` 顶部定义：
```js
const APP_VERSION = '1.1';
```

2. `index.html` Header 区域添加：
```html
<span id="appVersion" style="font-size:.55rem;color:var(--text3);letter-spacing:1px"></span>
```

3. `app.js` 的 `init()` 中：
```js
document.getElementById('appVersion').textContent = 'v' + APP_VERSION;
```

4. 每次发布更新时，只修改 `APP_VERSION` 常量为新版本号。

---

## 四、版本迭代路线 / Release Roadmap

| 版本 | 功能 | 预计提交 |
|------|------|----------|
| `v1.0` | 已完成：4 Tab + RPG + 同步 | ✅ |
| `v1.1` | 版本号 + PR 最佳 + 快速复制 | 待开发 |
| `v1.2` | 成就系统 + 周月目标 | 待开发 |
| `v1.3` | 训练统计面板 + 休息日提醒 | 待开发 |
| `v1.4` | 身体维度 + 训练笔记 | 待开发 |

---

## 五、技术债务清单 / Technical Debt (from code review)

| 优先级 | 项目 | 说明 |
|--------|------|------|
| P1 | 输入验证层 | 统一验证入口（NaN/空值/越界） |
| P2 | 代码重复消除 | 7 处重复模式合并 |
| P3 | 编码风格统一 | var → let/const 标准化 |

---

## 六、备注 / Notes

- 每个版本功能独立可测，不依赖后续版本
- 所有新数据通过 `store.js` K-V 接口存储，保持架构一致性
- 新 Tab 或子页面可通过 `switchTab` 模式扩展
- UI 复用已有的 CSS 变量系统和组件样式

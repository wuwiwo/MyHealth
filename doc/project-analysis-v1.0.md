# MyHealth v1.0 项目分析文档

---

## 一、项目概览

| 属性 | 描述 |
|------|------|
| **项目名称** | MyHealth |
| **版本** | v1.0 |
| **类型** | 单页 Web 应用（SPA） |
| **用途** | 个人健身记录 + 游戏化训练激励 |
| **语言** | 简体中文 UI |
| **作者** | 个人项目 |
| **仓库** | `E:\dd\Documents\hanako\Health` |
| **分支** | `main`（与 `origin/main` 同步） |

---

## 二、技术栈详解

### 2.1 前端

```
index.html (220 lines)
    ↓ <script src="index.js?v24">
index.js (1152 lines)
    ↓ <link rel="stylesheet" href="index.css?v1">
index.css (325 lines)
```

- **纯原生 JavaScript**，无任何框架（React/Vue/Svelte 等）
- **无模块化**：所有代码在全局作用域，通过事件委托统一处理交互
- **CSS 变量主题系统**：定义 `:root`（深色）和 `[data-theme="light"]` 两套变量
- **Canvas 2D API**：用于绘制体重趋势折线图
- **响应式**：最大宽度 500px，移动端优先，支持 380px 以下小屏

### 2.2 后端

```
api/data.mjs (50 lines)
├── GET  /api/data  → list() Vercel Blob → 返回最新 JSON
└── PUT  /api/data  → parseBody() → put() 上传 Blob
```

- **Vercel Serverless Function**（Node.js runtime）
- 使用 `@vercel/blob` SDK v0.27.0
- CORS 全开放（`Access-Control-Allow-Origin: *`）
- **无鉴权**：数据安全性依赖 Blob URL 的不可猜测性
- Blob 命名：`myhealth-sync-{timestamp}.json`，访问设为 `public`

### 2.3 数据存储

```
┌──────────────┐     PUT/GET      ┌──────────────────┐
│  localStorage │ ←─────────────→ │  Vercel Blob      │
│  (主存储)      │   800ms debounce │  (云备份+多端同步)  │
└──────────────┘                  └──────────────────┘
```

7 个 localStorage Key（`dh-*-v1` 前缀），对应 7 个数据域。

---

## 三、代码结构分析

### 3.1 `index.js` 模块划分（1152 行）

| 行号范围 | 模块 | 说明 |
|----------|------|------|
| 1-98 | **数据层** | localStorage 读写、CRUD 函数、常量定义（20 个动作、6 种有氧、6 章 31 关） |
| 99-149 | **云同步** | `pushSync()`/`pullSync()`/`scheduleSync()`、2 分钟定时拉取 |
| 151-183 | **导出/导入** | JSON 文件导出下载、导入合并（`exportData()`/`importData()`） |
| 185-199 | **UI 工具** | Toast 提示、庆祝动画（30 个粒子）、主题切换 |
| 207-212 | **重量选择网格** | `buildWtGrid()` 动态生成重量选择按钮 |
| 214-279 | **力量训练渲染** | 日期导航、记录列表、周统计（环形完成率）、月热力图、断签管理 |
| 282-311 | **补签系统** | `openMakeupDialog()` + `doMakeup()` |
| 313-432 | **训练计划系统** | 计划创建/编辑/执行，含休息倒计时和完成摘要 |
| 434-461 | **热力图** | 月历网格，5 级颜色深度，支持前后翻月 |
| 463-491 | **有氧运动渲染** | 日期导航、记录列表、周统计 |
| 493-555 | **个人资料渲染** | 资料表单、体重列表、Canvas 折线图 |
| 557-713 | **游戏属性计算** | `getGameStats()` 含 30 天统计、周奖励、永久惩罚、属性详情弹窗 |
| 715-877 | **战斗系统** | `startBattle()`/`runBattle()`/`endBattle()` 含 Boss 词缀、速度控制 |
| 879-895 | **分享卡片** | 胜利后展示属性与统计数据的分享卡片 |
| 897-1134 | **初始化与事件委托** | `init()` 构建 UI、120+ 行事件委托统一处理所有交互 |
| 1137-1149 | **数据迁移** | 从旧 key `dumbbell-tracker-v1` 迁移数据 |

### 3.2 关键设计模式

#### 事件委托（Event Delegation）
所有 DOM 事件通过 `document.addEventListener('click', ...)` 统一处理（第 930 行），利用 `data-a`、`data-s`、`data-tab` 等属性分发。避免了大量独立事件监听器。

#### 数据驱动渲染
每次数据变更后调用对应的 `render*()` 函数完整重绘相关 DOM 区域，简单直接，无虚拟 DOM。

#### 全局状态变量
使用模块级 `let` 变量管理 UI 状态（如 `_strDate`、`_carForm`、`_battleSpeed` 等），函数间通过闭包共享。

---

## 四、数据模型

### 4.1 力量训练记录

```javascript
{
  entries: [{
    id: "唯一标识（36进制时间戳+随机）",
    date: "2026-06-14",
    exercise: "二头弯举",
    weight: 7,
    targetReps: 12,
    actualReps: 10,
    createdAt: 1718366400000  // 毫秒时间戳
  }]
}
```

### 4.2 训练计划

```javascript
{
  plans: [{
    id: "唯一标识",
    name: "上肢训练日",
    exercises: [{
      exercise: "二头弯举",
      weight: 7,
      targetReps: 12,
      restSeconds: 60
    }],
    createdAt: 1718366400000
  }]
}
```

### 4.3 游戏进度

```javascript
{
  cleared: ["1-1", "1-2", "1-3", "2-1", ...],
  current: "3-3",
  attempts: {
    "2026-06-14_3-3": 2  // 今天该关卡已失败次数
  },
  permPen: { atk: 4, def: 2 },  // 累积永久惩罚
  permPenLastWeek: false         // 上周惩罚已应用标记
}
```

---

## 五、游戏化系统详解

### 5.1 属性计算流程图

```
30天力量训练数据 ──→ 总容量(kg×次数) ──→ 基础攻击 = 10 + ⌊容量/20⌋
                                                           ↓
30天有氧训练数据 ──→ 总时长(分钟)    ──→ 基础防御 = 10 + ⌊时长/6⌋
                                                           ↓
本周训练天数 ──→ 周奖励 = 4天:20 / 7天:50               相加
                                                           ↓
上周训练天数 ──→ 永久惩罚 = 缺勤天数×攻2/防1             扣除
                                                           ↓
                                                    最终攻击/防御/生命
```

### 5.2 战斗系统流程

```
startBattle()
  ├── 检查每日挑战次数（≤3）
  ├── 检查今日是否训练（提示）
  ├── 计算玩家属性
  ├── Boss 关卡随机词缀
  └── 自动战斗 runBattle()
        ├── 回合循环 (600ms/倍速)
        │   ├── Boss 词缀触发
        │   ├── 玩家攻击 = max(1, ATK - DEF/2 + random(0-4))
        │   ├── 反伤判定
        │   ├── 敌人攻击 = max(1, ATK - DEF/2 + random(0-3))
        │   └── HP 更新 + 日志追加
        └── endBattle()
            ├── 胜利 → 解锁下一关 + 庆祝动画 + 分享卡片
            └── 失败 → 记录挑战次数 + 重试按钮
```

### 5.3 惩罚机制设计意图

- **周奖励**：鼓励每周至少训练 4 天，满勤 7 天给予最高奖励
- **永久惩罚**：上周训练不足 3 天时，永久扣除属性（模拟训练退化）
- **惩罚递增**：每周叠加，激励持续训练
- **惩罚提示**：Game Tab 显示可关闭的警告横幅

---

## 六、架构优缺点分析

### 6.1 优点

1. **零依赖部署**：纯静态文件，Vercel 一键部署，包体积 < 50KB
2. **离线可用**：localStorage 为主存储，网络断开不影响正常使用
3. **快速迭代**：单文件架构修改方便，无构建步骤
4. **游戏化设计**：创新的训练激励系统，将健身数据转化为有意义的游戏进度
5. **跨设备同步**：Vercel Blob 提供免费额度内的云同步能力
6. **手动备份**：JSON 导出/导入确保数据可迁移

### 6.2 缺点与风险

1. **单文件架构**：1152 行 JS 在一个文件中，随着功能增长维护难度增大
2. **无模块化**：全局作用域变量多，函数间耦合度高
3. **无 TypeScript**：缺少类型检查，重构风险较高
4. **无鉴权**：API 完全开放（CORS `*`），数据安全性低
5. **无测试**：没有任何自动化测试
6. **渲染策略粗糙**：每次数据变更完整重绘，数据量大时可能有性能问题
7. **同步冲突**：pull 直接覆盖本地数据，无冲突解决策略
8. **Canvas 图表简陋**：自绘折线图功能有限，无交互、无标注

### 6.3 改进建议

| 优先级 | 改进方向 | 具体方案 |
|--------|----------|----------|
| 高 | 模块化拆分 | 将 `index.js` 拆分为多个模块（data/strength/cardio/profile/game） |
| 高 | 添加鉴权 | API 层增加简单的 Token 或密码验证 |
| 中 | DOM 渲染优化 | 对列表采用增量更新（仅更新变化的条目） |
| 中 | 冲突解决 | 基于 `lastUpdated` 时间戳判断覆盖策略 |
| 中 | 图表增强 | 引入轻量图表库（如 Chart.js）替换 Canvas 自绘 |
| 低 | TypeScript 迁移 | 渐进式引入类型定义 |
| 低 | 自动化测试 | 为核心计算逻辑添加单元测试 |

---

## 七、Git 历史简析

最近 20 次提交主要集中在 **Vercel Blob 同步调试**（约 15 次提交在 public/private 访问权限、Token 显式传递、SDK vs REST API 间反复调整），之后新增了**永久惩罚系统**和**计划编辑器**两个功能。

```
8af3237  feat: last-week penalty system + weekly status
0ff086d  feat: complete plan editor modal
68cbd09  clean: sort by time, remove debug logs
f6c63a1  debug: verbose error logging + env check + explicit token
... (15 commits of blob access fixes)
935a7fe  fix: direct blob REST API with store-specific URL
```

---

## 八、部署配置

### `vercel.json`

```json
{
  "installCommand": "npm install",
  "buildCommand": "echo ok",
  "outputDirectory": ".",
  "framework": null,
  "cleanUrls": true
}
```

- **无框架**（`framework: null`），Vercel 不注入任何框架运行时
- **无构建**（`buildCommand: echo ok`），因为不需要编译
- **`cleanUrls: true`**：自动将 `.html` 后缀从 URL 中移除
- Serverless Function 位于 `api/` 目录（Vercel 自动识别）

### 环境变量

- `BLOB_READ_WRITE_TOKEN`：Vercel Blob Storage 读写 Token

---

## 九、版本总结

v1.0 是一个功能完整的个人健身追踪应用，具备以下核心能力：

- ✅ 力量训练记录（动作、重量、次数、完成率）
- ✅ 有氧运动记录（6 种类型、时长、距离）
- ✅ 体重记录与趋势图
- ✅ 训练计划创建与跟随执行
- ✅ 月热力图与周统计
- ✅ RPG 游戏化挑战系统（6 章 31 关）
- ✅ Boss 词缀与永久惩罚机制
- ✅ Vercel Blob 云同步
- ✅ 深色/浅色主题切换
- ✅ JSON 数据导出/导入
- ✅ 响应式移动端设计

当前版本的架构适合个人使用和快速迭代，后续可考虑模块化重构以支持更复杂的功能扩展。

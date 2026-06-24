# MyHealth v1.6 — 架构重构执行计划

**Date:** 2026-06-19 · **Current:** v1.5.1 · **Revised:** 2026-06-24

> **修订说明**（2026-06-24）：本版修正了 5 处与 v1.5.1 实际代码的偏差，
> 补全了 exercises 数据模型字段，明确了 ratio 语义与 PR 边界，
> 调整了执行顺序（先迁移后删常量）。修订细节见文末「修订记录」。

---

## 一、页面结构变更

### 当前（v1.5.1）

```
4 个顶级 Tab:
┌─ 🏋️ 力量
│  ├─ 训练记录、计划、热力图、断签、周统计
│  ├─ 数据管理逻辑（exportDataBtn/importDataBtn 处理在 tab-strength.js:265-266）
├─ 🏃 有氧
│  ├─ 类型选择、记录、计划
├─ 📊 个人
│  ├─ 👤 个人数据（基本信息、体重、PR）
│  ├─ 📂 数据管理（HTML 在 index.html:166-171，位于 subPersonal 子页）
│  └─ 📊 训练数据（统计、热力图）
├─ 🎮 挑战
   ├─ 属性板、关卡网格、战斗浮层、分享卡片
```

> **注意**：数据管理（导出/导入）的 HTML 在「个人」Tab 的 subPersonal 子页（`index.html:166-171`），
> 但两个按钮的事件处理函数挂在 `tab-strength.js:265-266`。
> 这是 v1.5.0 搬迁 HTML 时未同步搬迁逻辑的残留。v1.6 将统一移至设置 Tab。

### 目标（v1.6）

```
4 个顶级 Tab:
┌─ 🏋️ 训练
│  ├─ 💪 力量（训练记录、断签、周统计）
│  └─ 🏃 有氧（记录、周统计）
├─ 📊 个人
│  ├─ 👤 个人数据（基本信息、体重、PR）
│  └─ 📊 训练数据（统计、热力图）
├─ 🎮 挑战
│  ├─ 属性板、关卡网格、战斗浮层、分享卡片
├─ ⚙️ 设置
   ├─ 🏋️ 动作库（新建/编辑/删除动作）
   ├─ 📋 计划管理（力量计划+有氧计划）
   ├─ 🎮 挑战管理（重置进度、最佳记录）
   └─ 📂 数据管理（导出/导入/手动同步）
```

### 子 Tab 机制泛化

当前仅「个人」Tab 有子 Tab，靠硬编码 `switchProfileSub(name)` 实现
（`app.js:72` 调用，`tab-profile.js:141` 定义），`data-sub` 属性只能切 profile 子页。

v1.6 需泛化为通用机制：

```js
// app.js 事件委托改为：
if (el.dataset.tab) switchTab(el.dataset.tab)
else if (el.dataset.sub) switchSub(activeTab, el.dataset.sub)

// 新增通用函数（替代 switchProfileSub）
function switchSub(tab, sub) {
  // 在 tab 对应的 tab-content 内切换 .sub-tab.active
  // 语义：找到 #tab{Tab} 内的 .sub-tab，按 data-sub 匹配切换
}
```

涉及修改：
- `app.js:72` — 调用改为 `switchSub`
- `tab-profile.js:141` — 删除 `switchProfileSub`，改用通用 `switchSub`
- `index.html` — 训练 Tab 和设置 Tab 的子 Tab 按钮统一用 `data-sub` 属性

---

## 二、核心逻辑变更

### 旧逻辑（v1.5）：自由输入

```
训练 Tab → 输入框输入"弯举" → 立即记录
动作名称为自由文本，无校验
有氧类型 = CARDIO_TYPES 常量 + cardioTypes store（自定义）
```

### 新逻辑（v1.6）：动作库驱动

```
设置 → 动作库 → 新建动作 {id,name,type,ratio,intensity,emoji,hasDist}
                                            ↓
训练 Tab → 下拉选择"弯举" → weight表现场输入 → 记录
有氧 Tab → 类型按钮从动作库读取（type==='cardio' 的项）
```

### 动作库数据模型（新 Store key `exercises`）

```json
[
  {
    "id": "弯举",
    "name": "弯举",
    "type": "strength",
    "ratio": 100,
    "intensity": null,
    "emoji": null,
    "hasDist": false
  },
  {
    "id": "run",
    "name": "跑步",
    "type": "cardio",
    "ratio": null,
    "intensity": 2,
    "emoji": "🏃",
    "hasDist": true
  }
]
```

> **字段说明**
>
> | 字段 | 类型 | 力量项 | 有氧项 | 说明 |
> |------|------|--------|--------|------|
> | `id` | string | 动作名（中文） | 类型ID（英文，如 `run`） | 唯一标识；力量 id=name，有氧 id≠name |
> | `name` | string | 显示名 | 显示名 | 力量与 id 相同；有氧为中文名 |
> | `type` | string | `"strength"` | `"cardio"` | 决定训练记录归属 |
> | `ratio` | number\|null | 0~100 | null | 力量比值百分比；有氧为 null |
> | `intensity` | number\|null | null | 1/2/3 | 有氧默认强度；力量为 null |
> | `emoji` | string\|null | null | emoji 字符 | 有氧显示图标；力量为 null |
> | `hasDist` | boolean | false | true/false | 有氧是否有距离统计；力量固定 false |
>
> **合并原因**：roadmap 原版只有 4 字段（id/type/ratio/intensity），
> 但有氧类型需要 emoji 和 hasDist（`getAllCardioTypes()` 返回项含这些字段，
> tab-cardio.js 共 8 处调用依赖）。合并后统一管理，schema 补全为 7 字段。

### ratio 语义与边界

**决策**（2026-06-24 确认）：

1. **迁移种子全部 ratio=100** — 历史动作从 EXERCISES 常量和 cardio entries 提取后，ratio 一律 100%
2. **ratio 存在动作库，不在 entry 里** — stats.js 计算时实时查动作库当前 ratio
3. **新建动作可设非 100% ratio** — 用户在设置/动作库创建时指定
4. **编辑 ratio 即时影响全部历史** — 因为 ratio 是动作属性，改了之后该动作所有历史记录的容量都按新 ratio 算
5. **PR 不乘 ratio** — `checkPR()` 的 maxVolume 保持 `weight × actualReps`（`app.js:14-17`），不引入 ratio

**影响范围**：

| 计算项 | 是否乘 ratio | 说明 |
|--------|-------------|------|
| stats.js `sumVolume()` | ✅ 乘 | 玩家属性 atk/hp 的基础值 |
| stats.js `calculateStats()` | 间接（通过 sumVolume） | atk = 10 + floor(strVol/20) |
| app.js `checkPR()` maxVolume | ❌ 不乘 | 保持 weight×reps，与旧 PR 一致可比 |
| 周统计容量显示 | ✅ 乘 | 与属性计算口径一致 |
| 月度容量趋势图 | ✅ 乘 | 同上 |

> **风险提示**：若用户将某动作 ratio 从 100% 改为 80%，该动作历史容量缩水 20%，
> 玩家 atk 下降；但 PR maxVolume 不变（仍是 weight×reps）。
> 新记录的容量（weight×reps×0.8）可能永远低于旧 PR（weight×reps），
> 导致该动作的容量 PR 无法刷新。这是「保留旧 PR」决策的已知代价。

### 有氧类型合并

v1.5.1 有氧类型来源：`CARDIO_TYPES` 常量（6 种）+ `cardioTypes` store（自定义），
通过 `getAllCardioTypes()`（`utils.js:54-57`）合并。

v1.6 统一到 exercises 库，`getAllCardioTypes()` 改为从 exercises 过滤 `type==='cardio'` 的项。

**受影响调用点（13 处）**：

| 文件 | 行号 | 调用 |
|------|------|------|
| `utils.js` | 54-62 | `getAllCardioTypes` / `getCardioTypeMap` 定义（改实现） |
| `tab-cardio.js` | 18, 86, 93, 110, 170, 213, 238, 252, 297 | 9 处 `getAllCardioTypes()` 调用（接口不变，无需改） |
| `tab-game.js` | 14, 121 | 2 处 `getCardioTypeMap()` 调用（接口不变，无需改） |
| `app.js` | 57 | `initCardioTypes()` 调用（适配新数据源） |

> 只要 `getAllCardioTypes()` 和 `getCardioTypeMap()` 的**返回值结构不变**
> （仍返回 `{id,name,emoji,hasDist,intensity}` 对象），
> 13 处调用点中仅 utils.js 定义处和 app.js 初始化需改，其余无需动。

---

## 三、文件变更清单

### 新建文件

| 文件 | 说明 | 预计行数 |
|------|------|----------|
| `page/tab-settings.js` | 设置 Tab 全部逻辑（动作库/计划/挑战/数据 4 个子 Tab） | ~400 |

### 修改文件

| 文件 | 变更 | 预计行数 |
|------|------|----------|
| `index.html` | Tab 结构重构：训练(力量+有氧子Tab) + 设置(4子Tab)；删除 profile 中数据管理 HTML 6 行 | +50 -6 |
| `app.js` | 新增 `getExercises()`/`saveExercises()` + `migrateExercises()`；泛化 `switchSub()`；删除 `switchProfileSub` 调用；init 中 EXERCISES 按钮改为从 exercises 读取 | +50 -10 |
| `utils.js` | `getAllCardioTypes()`/`getCardioTypeMap()` 改为从 exercises 读取；新增 `getExerciseMap()` 辅助函数 | +15 -5 |
| `stats.js` | `sumVolume()` 接受 `exerciseMap` 参数并乘 ratio | +8 |
| `tab-strength.js` | 动作输入框改为下拉选择（从 exercises 读 strength 项）；移除 `exportDataBtn`/`importDataBtn` 事件处理（移至 tab-settings.js） | +20 -5 |
| `tab-cardio.js` | `initCardioTypes()` 适配新数据源（从 exercises 读 cardio 项）；计划执行无变化 | +5 |
| `tab-profile.js` | 删除 `switchProfileSub()` 函数（改用通用 `switchSub`） | -8 |
| `tab-game.js` | 移除重置进度按钮、导出按钮（移至设置 Tab）；`sumVolume` 调用处补传 exerciseMap | -10 +3 |
| `sync.js` | `getAllData()`/`mergeServerData()`/`buildImportMap()`/`dataSummary()` 4 个函数加 exercises 字段 | +12 |
| `CONTEXT.md` | 更新数据模型（新增 exercises key）、模块边界（新增 tab-settings.js） | +10 |

### 删除内容（迁移完成后）

| 位置 | 内容 | 时机 |
|------|------|------|
| `utils.js:9` | `const EXERCISES` 数组 | 步骤 9（迁移完成后） |
| `utils.js:10-17` | `const CARDIO_TYPES` 数组 | 步骤 9（迁移完成后） |
| `index.html:166-171` | profile 中数据管理区域 6 行 HTML | 步骤 4 |
| `app.js:50-54` | init 中 EXERCISES 按钮和 datalist 生成 | 步骤 5 |

> **重要**：EXERCISES 和 CARDIO_TYPES 常量在 `migrateExercises()` 中作为种子数据使用，
> 必须等迁移执行完毕后才能删除。执行顺序见第五节。

---

## 四、数据迁移计划

首次打开 v1.6 时执行 `migrateExercises()`：

```
migrateExercises() {
  1. 如果 store 中已有 exercises 数据 → 跳过（已迁移）
  2. 初始化空数组 exercises = []
  3. 从 EXERCISES 常量提取 20 个力量动作
     → 每个生成 {id:name, name:name, type:'strength', ratio:100, intensity:null, emoji:null, hasDist:false}
  4. 从 CARDIO_TYPES 常量提取 6 个有氧类型
     → 每个生成 {id, name, type:'cardio', ratio:null, intensity, emoji, hasDist}
  5. 从 store.get('cardioTypes')（自定义有氧）提取
     → 同上格式，加入 exercises
  6. 从所有现存 strength entries 提取已使用但不在 EXERCISES 中的动作名
     → 生成 strength 项，ratio=100（保证历史动作不丢失）
  7. 从所有现存 cardio entries 提取已使用但不在上述列表中的 type
     → 生成 cardio 项，intensity=2（默认中强度）
  8. 写入 store.set('exercises', exercises)
  9. 迁移完成后，旧 cardioTypes store key 保留（兼容旧同步数据），但不再读取
}
```

> **幂等性**：步骤 1 保证重复执行不会覆盖用户已编辑的 exercises。
> **降级**：若迁移失败，exercises 为空时 getAllCardioTypes() 应回退到 CARDIO_TYPES 常量
> （步骤 9 删除常量前，utils.js 应保留容错逻辑）。

---

## 五、执行顺序

| 步骤 | 文件 | 内容 | 依赖 |
|------|------|------|------|
| 1 | `app.js` + `utils.js` | 数据层：`getExercises()`/`saveExercises()` + `migrateExercises()` + `getExerciseMap()`；init 中调用迁移。**暂不删** EXERCISES/CARDIO_TYPES 常量 | — |
| 2 | `stats.js` | `sumVolume()` 接受 `exerciseMap`，乘 `(ratio/100)`；ratio 缺失时默认 100 | 1 |
| 3 | `tab-settings.js` | 新建设置 Tab：动作库 CRUD + 计划管理 + 挑战管理 + 数据管理（含 exportData/importData 移入） | 1 |
| 4 | `app.js` + `index.html` | 泛化 `switchSub(tab, sub)`；Tab 结构重构（训练含力量/有氧子 Tab，新增设置 Tab）；删除 profile 中数据管理 HTML | 1,3 |
| 5 | `tab-strength.js` | 动作输入改下拉（从 exercises 读 strength 项）；移除 exportDataBtn/importDataBtn 处理；app.js init 中 EXERCISES 按钮改从 exercises 读 | 1,4 |
| 6 | `tab-cardio.js` | `initCardioTypes()` 适配 exercises 数据源；`getAllCardioTypes()` 实现改读 exercises | 1,4 |
| 7 | `tab-profile.js` + `tab-game.js` | profile 删 `switchProfileSub`；game 移除重置/导出按钮；`sumVolume` 调用补传 exerciseMap | 2,4 |
| 8 | `sync.js` | `getAllData()`/`mergeServerData()`/`buildImportMap()`/`dataSummary()` 加 exercises 字段 | 1 |
| 9 | `utils.js` + `app.js` | **迁移确认无误后**删除 EXERCISES、CARDIO_TYPES 常量；删除 app.js init 中旧 EXERCISES 按钮代码（若步骤5未删） | 1-8 |
| 10 | 全局 | 语法检查、功能测试、版本收尾（README + changelog-v1.6.md + 架构演化表） | 1-9 |

> **与原版 roadmap 的差异**：原版步骤 1 即删除 EXERCISES，但迁移函数需要它当种子。
> 修订后改为步骤 1 迁移、步骤 9 才删常量，避免种子丢失。

---

## 六、UI 草图

### 设置 / 动作库

```
╔══════════════════════════════╗
║  ⚙️ 设置                     ║
║  [动作库] [计划] [挑战] [数据] ║   ← 子 Tab 导航
╠══════════════════════════════╣
║  🏋️ 动作库                    ║
║                               ║
║  ┌──────────────────────────┐ ║
║  │ 弯举  💪 100%        ✏️🗑️│ ║
║  │ 跳绳  🏃 强度高      ✏️🗑️│ ║
║  │ 深蹲  💪 100%        ✏️🗑️│ ║
║  └──────────────────────────┘ ║
║                               ║
║  [＋ 新建动作]                 ║
╚══════════════════════════════╝
```

### 设置 / 挑战管理

```
╔══════════════════════════════╗
║  🎮 挑战管理                   ║
║  📜 属性变更日志                ║
║  [查看日志]                    ║
║                               ║
║  🐃 重置挑战进度                ║
║  [重置]                        ║
╚══════════════════════════════╝
```

### 训练 / 力量（动作选择改为下拉）

```
╔══════════════════════════════╗
║  🏋️ 训练                      ║
║  [💪 力量] [🏃 有氧]           ║   ← 子 Tab 导航
╠══════════════════════════════╣
║  动作: [弯举         ▼]       ║   ← 下拉选择（非自由输入）
║  重量: [7] kg                 ║
║  次数: 目标[12]  实际[12]      ║
║  [⚡ 记录]                     ║
╚══════════════════════════════╝
```

---

## 七、版本号

```
v1.5.1 → v1.6
```

> 按版本纪律（AGENTS.md），需同步更新：
> - `page/utils.js` APP_VERSION → `'1.6'`
> - `README.md` 副标题 + 版本历史表 + 目录结构树
> - `doc/changelog-v1.6.md`（新建，三分类 + 架构演化表）
> - 架构演化表新增 v1.6 行（JS 文件数 = 16，最大文件待统计）

---

## 八、风险与注意

1. **迁移完整性** — 旧 strength entries 中使用的动作名必须全部迁移到 exercises，否则下拉选择里找不到，历史记录显示异常
2. **迁移后输入约束** — 训练表单需阻止手动输入不在库中的名称（改为 select 下拉，或 input + 校验）
3. **有氧计划段引用** — cardioPlans 中段的 `type` 字段引用的是有氧类型 id（如 `run`），迁移后需确保 exercises 中有对应 id 的 cardio 项
4. **数据同步** — `getAllData()` 必须包含 exercises 字段，否则跨设备同步后动作库丢失
5. **ratio 修改影响历史** — ratio 是动作属性（非 entry 属性），修改后影响该动作全部历史容量计算；PR 不受影响（不乘 ratio）
6. **子 Tab 状态保持** — 切换顶级 Tab 后再切回，子 Tab 应记住上次选中的子页（或重置为第一个）
7. **旧 cardioTypes key 兼容** — 迁移后旧 `cardioTypes` store key 不再读取，但 `mergeServerData` 拉取旧版云端数据时仍需容错（老数据无 exercises 字段）

---

## 修订记录

### 2026-06-24 修订（5 处偏差修正）

| # | 原版说法 | 实际代码 | 修订内容 |
|---|----------|----------|----------|
| 1 | 「数据管理在力量 Tab」 | HTML 在 `index.html:166-171`（profile 的 subPersonal），逻辑在 `tab-strength.js:265-266` | 修正第一节现状描述 + 第三节删除位置 |
| 2 | 「tab-profile.js 无变化 0 行」 | profile 的 subPersonal 含数据管理 HTML 需删除 | 修正第三节：tab-profile.js 需删 `switchProfileSub` 函数 |
| 3 | 子 Tab 机制未提及 | `switchProfileSub` 硬编码（`app.js:72`），仅支持 profile | 新增第一节「子 Tab 机制泛化」小节 |
| 4 | ratio 「stats.js +10 行」 | ratio 改变历史容量，连锁影响 atk/PR/统计图 | 新增第二节「ratio 语义与边界」小节；明确 PR 不乘 ratio |
| 5 | sync.js 「+2 行」 | 4 个函数都要改（getAllData/mergeServerData/buildImportMap/dataSummary） | 修正第三节：sync.js 改为 +12 行 |

### 其他补充

- **exercises schema 补全**：原版 4 字段（id/type/ratio/intensity），补全为 7 字段（加 name/emoji/hasDist），因为有氧类型需要 emoji 和 hasDist
- **有氧类型合并影响范围**：列出 13 处 `getAllCardioTypes`/`getCardioTypeMap` 调用点，明确接口不变则无需改
- **执行顺序调整**：原版步骤 1 删 EXERCISES 常量，但迁移需要它当种子 → 改为步骤 1 迁移、步骤 9 才删
- **CONTEXT.md 更新**：原版未提及，补入文件变更清单

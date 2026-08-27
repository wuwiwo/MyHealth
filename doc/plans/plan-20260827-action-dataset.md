# plan-20260827：动作数据集整合 —— 只读动作百科 + 动作关联

> **状态**：规划阶段（设计定稿，待施工）
> **日期**：2026-08-27
> **性质**：**v2.0 准备开发内容** · 设计/计划阶段，未动任何代码与版本号
> **上游文档**：`doc/design-v2.0.md`（v2.0 设计权威）、`doc/plans/plan-20260827-m2a-kickoff.md`（M2a 开工规划）、`AGENTS.md`（版本纪律）
> **数据源**：[wangmuerxiao/exercises-dataset-zh](https://github.com/wangmuerxiao/exercises-dataset-zh)（master 分支，1324 条动作，1,319 个中文名映射，媒体 © Gym visual / 数据 MIT）

---

## 一、作者已拍板的设计决策

| # | 决策 | 内容 |
|---|------|------|
| D1 | 路线 B | 数据集是**只读百科补充**，不改变现有容量/ratio 计算 |
| D2 | 数据范围 | 仅 `exercises.json` + `name_zh.json`；**仅中文瘦身**（保留 id/英文名/中文名/中文说明/中文分步/部位/器械/肌群/媒体路径，去其余 9 语言） |
| D3 | 媒体策略 | 媒体文件**下载入库**本地静态目录；后续上**图床**后「本地入库 + 图床 URL」并存（`MEDIA_BASE` 全局常量覆盖，onerror 回退本地）；个人项目版权自行处置 |
| D4 | 关联机制 | **手动选择 + 模糊匹配结合**：编辑表单加「从数据集选择」入口 + 按中英文名模糊匹配候选 |
| D5 | 百科入口 | 设置 Tab →「动作库」子 Tab 内新增「📖 动作百科」按钮展开（**不新增顶层 Tab**） |

---

## 二、分期划分

| Phase | 内容 | 交付物 | 依赖 | 提交类型 | 版本纪律 |
|---|---|---|---|---|---|
| **P0** | 本计划落盘 + CONTEXT 标注 | 本文档 | 无 | `docs:` | 不动版本 |
| **P1** | 数据瘦身打包 + 媒体下载脚本 | `scripts/build-dataset.js`、`scripts/fetch-media.js`、`data/exercises-dataset.js`、`data/action-map.json`、`page/media/**` | P0 | `chore:` | **不动版本**（新增文件未被 index.html 引用，运行时零影响） |
| **P2** | 关联机制：数据集加载 + 匹配算法 + `dsId` 字段 + 编辑 modal 关联区块 | `page/config.js`(新)、`page/ex-dataset.js`(新)、`page/utils.js`、`page/tab-settings.js`、`page/app.js`、`index.html` | P1 | `feat:` | bump（随 v2.0 节奏，见 §十一）+ 三项同步 |
| **P3** | 动作百科 UI：入口 + 面板 + 搜索/筛选/分页/详情/GIF | `page/tab-settings.js`、`page/ex-dataset.js`、`index.html` | P2 | `feat:` | bump（同上）|

**版本纪律判定理由**：P1 只新增 `scripts/`、`data/`、`page/media/` 文件，不改 `page/*.js` 与 index.html → 纯资产/工具产出不动版本；P2/P3 改 page/*.js 触发施工纪律——但本功能属 **v2.0 准备开发内容**，版本号不单独走 v1.11.x，随 v2.0 发布节奏统一递增（§十一 裁决 1）。

---

## 三、瘦身打包方案（D2 细化）

### 输出形态：JSON 转 JS 全局变量（方案 B）

落 `data/exercises-dataset.js`：

```js
window.EX_DATASET = {
  attribution: "<全局声明字符串>",      // 1324 条去重为 1 条
  updated: "YYYY-MM-DD",
  aliases: { "二头弯举": "0012", "深蹲": "0198" /* ...21 条人工校准 */ },
  items: [
    { id:"0001", name:"...", zh:"...", cat:"上臂", eq:"哑铃",
      target:"...", mg:"...", sec:[], img:"images/0001-x.jpg",
      gif:"videos/0001-x.gif", mid:"0001", ins:"...", steps:[...] },
    // × 1324
  ]
};
```

**字段映射表**

| 输出 key | 来源字段 | 说明 |
|---|---|---|
| id | id | 数据集 id（"0001"） |
| name | name | 英文名 |
| zh | name_zh[name]，缺省回退 name | 中文名（1319/1324 有翻译，5 条回退英文） |
| cat | category | 部位 |
| eq | equipment | 器械 |
| target | target | 目标肌群 |
| mg | muscle_group | 协同肌群 |
| sec | secondary_muscles | 次要肌群（数组，详情页有价值） |
| img/gif/mid | image/gif_url/media_id | 媒体相对路径 + id |
| ins | instructions.zh | 中文说明 |
| steps | instruction_steps.zh | 中文分步数组 |

**去掉**：body_part（cat 已覆盖）、created_at、其余 9 语言说明、每条重复的 attribution（收敛为全局 1 条）。`name_zh.js` 不再单独需要（中文名已内嵌）。

### 体积预估
中文说明+分步为主体，预估 **300–450KB**（Vercel gzip 后传输再减半）。阈值 **≤500KB**，脚本打印实际字节数，超阈值再评估拆分。

### 打包脚本 `scripts/build-dataset.js`（Node，无依赖）
- CLI：`node scripts/build-dataset.js [rawDir] [outFile]`
- 输入：`data/raw/exercises.json` + `data/raw/name_zh.json` + `data/action-map.json`
- 输出：`data/exercises-dataset.js`
- 验收：幂等可重跑；输出合法 JS；`items.length===1324`；aliases 含 21 项且 dsId 均存在于 items；打印体积 ≤500KB

### 目录约定
```
data/
├── raw/                     # 原始下载副本（exercises.json ~1.4MB + name_zh.json）
├── exercises-dataset.js     # 瘦身产物（window.EX_DATASET）
└── action-map.json          # 人工校准的「现有21动作名→dsId」映射（source of truth）
```

---

## 四、动作对象扩展（D4 细化）

- **字段名敲定：`dsId`**（camelCase 与 hasDist/eqWeight 一致；语义=数据集条目 id）
- **只存 dsId，不落快照**：中文名/缩略图等一律运行时经 dsId 查 `EX_DATASET` 实时取——避免 sync 体积膨胀与陈旧数据
- **老存档兼容**：`exercise.dsId` 缺省=未关联，语义自洽，**无需 migrateExercises 补丁**，读时统一 `exercise.dsId || null`
- **store.js SHAPES**：exercises 已是 `'array'` 宽松校验，**不动**
- **云同步**：加 dsId 是向后兼容增量可选字段，旧端忽略未知字段、新端视缺失为未关联——**无需 bump sync version、无需迁移函数**；changelog 标注「exercises 新增可选字段 dsId，向后兼容」

---

## 五、关联匹配算法（D4 细化）

归一化：转小写、全角半角、去空格与标点 `·—–_-()（）【】[]`。

```
matchCandidates(actionName, limit=5):
  q = norm(actionName)
  aliasDsId = ALIASES[actionName] || ALIASES[norm(actionName)]   // 别名最高优先
  scored = []
  for it in items:
    zh = norm(it.zh); en = norm(it.name)
    if aliasDsId && it.id==aliasDsId:      s=100, reason='别名'
    elif zh==q:                            s=95,  '中文精确'
    elif en==q:                            s=90,  '英文精确'
    elif zh.includes(q)||q.includes(zh):   s=80-|len差|, '中文包含'
    elif en.includes(q)||q.includes(en):   s=70,  '英文包含'
    else:                                  s=tokenOverlap(q, zh+' '+en), '词元重叠'
    if s>=60: scored.push({it, s, reason})
  sort desc; return top(limit)
```

- 阈值 `s>=60` 才自动出候选；低于阈值不推荐，保持未关联 + 手动搜兜底
- 候选上限 5 条；列表项 = 中文名(英文名) + 部位/器械 chip + 匹配原因标签
- ALIASES = `data/action-map.json` 内嵌的 21 条人工校准映射（解决「二头弯举」vs「站姿杠铃弯举」字面命不中的情况）
- 配不上：显示「未关联」，手动搜索兜底（全文检索 zh/name/target/eq）

---

## 六、UI 细化（D5 细化）

### A. 编辑 modal 关联区块（tab-settings.js exModal）
描述 textarea 之后新增区块「📚 关联动作百科（可选）」：
- **未关联**：按钮「从数据集选择」→ 搜索选择 sheet（modal-sheet 样式复用，含搜索框+部位/器械 chips，点选回填）
- **已关联**：预览卡 = 缩略图(静态jpg) + 中文名 + 部位chip + 器械chip + 目标肌群，右侧「解除关联」（delete exercise.dsId）
- 保存走现有 saveExercises，dsId 随对象整体写回

### B. 百科面板
- **入口**：subLibrary 顶部「📖 动作百科」按钮 + 每个动作卡片右上角关联标记徽标（✓）
- **视图切换**：点击按钮 → **overlay 全屏 sheet 盖在动作库上，关闭即返回**（✅裁决 5，否决替换式；复用现有 modal-overlay 样式做全屏变体）
- **分页**：首屏渲染 50 条，底部哨兵 + IntersectionObserver 触底追加 50；**不做虚拟滚动**（过度设计）；JS 内 filter/search 全量无压力，瓶颈只在 DOM 数量
- **筛选**：部位 chips（10 类）+ 器械 chips（12 类），单选+「全部」，横向滚动条样式复用 car-types/chip

### C. GIF 策略（内存友好）
- 列表页一律**静态 jpg 缩略图** + `loading="lazy"`
- 详情页默认静态 jpg，**GIF 点击才播放**：jpg 上盖「▶ 播放动画」浮层，点按换 `<img src=gif>`
- 避免 1324 条场景内存峰值

### 详情页内容
中文说明（renderMd）+ 中文分步列表（steps 逐条）+ 目标/次要肌群 + 媒体区（点击播放 GIF）

---

## 七、媒体管理（D3 细化）

### 下载脚本 `scripts/fetch-media.js`（Node 原生 https，无依赖）
- 输入：`data/action-map.json`（21 dsId）+ `data/raw/exercises.json`
- 输出：`page/media/images/<原名>.jpg` + `page/media/videos/<原名>.gif`（沿用数据集原文件名如 `0001-2gPfomN.jpg`，稳定天然去重）
- 基址：`https://raw.githubusercontent.com/wangmuerxiao/exercises-dataset-zh/master/`
- 支持 `--dry-run` 只打印清单；404 记日志跳过

### 图床覆盖机制
新增 `page/config.js`（utils.js 之前加载）：
```js
window.MEDIA_BASE = '';   // 空=本地相对路径；上图床后改 'https://cdn.xxx.com/ex/'（尾斜杠）
```
`page/utils.js` 增加：
```js
function exMediaUrl(rel){ return (window.MEDIA_BASE||'') + rel; }
```
所有媒体 `<img>` 统一走 `exMediaUrl()`；`MEDIA_BASE` 非空时 `onerror` 回退本地相对路径（图床优先、本地兜底）。上图床只改 config.js 一行全站生效。

### cache-busting
数据文件靠 index.html 的 `?v22`（P2/P3 各+1）；媒体用稳定原文件名不做逐文件 bust。

---

## 八、风险清单

1. **低端安卓渲染/内存**：分页 50/批 + lazy loading + GIF 点击播放 + 仅建一次 Map 索引；解析后约 2–4MB 可接受
2. **v2.0 冲突评估**：本功能是设置→动作库的只读叠加 + dsId 增量字段，不碰 ratio/容量闭环（D1），与 design-v2.0 M0–M6 无重叠
3. **sync 膨胀**：dsId ~6B×27 <1KB 忽略不计
4. **i18n**：仅中文已由 D2 接受
5. **5 条缺中文名**：zh 回退英文名
6. **媒体版权**：MIT+Gym visual 条款，个人项目作者自行处置（D3）
7. **alias 覆盖不全**：自动候选空 → 手动搜兜底，不阻塞

---

## 九、端到端验收清单（Android Chrome 真机）

1. 设置→动作库→「📖 动作百科」→ 列表首屏 50 条，触底加载流畅
2. 中/英文关键词即时过滤；部位 chip + 器械 chip 组合筛选正确
3. 点条目看详情：中文说明(md)、分步、肌群、缩略图；点「▶」GIF 播放
4. 返回动作库：卡片 ✓ 关联标记区分已绑/未绑
5. 编辑动作 →「从数据集选择」→ 搜「弯举」→ 候选带匹配原因 → 选中显示预览
6. 保存→重进编辑关联仍在；解除关联保存后恢复未关联
7. 老存档无 dsId 正常显示未关联
8. 断网/假 CDN 时图片 onerror 回退本地不白屏
9. 云同步换设备后关联保持一致
10. 提交前 APP_VERSION/README 版本表/changelog/架构演化表同步到位

---

## 十、初始 todo 草稿（施工时转录 todo_write）

```
P0:
1. 落盘本计划 ✓（本次）
2. CONTEXT.md 标注待扩展项
P1(依赖P0):
3. 下载原始数据 data/raw/
4. 人工校准 data/action-map.json（21 动作名→dsId）
5. 编写 scripts/build-dataset.js 生成 data/exercises-dataset.js
6. 编写 scripts/fetch-media.js 下载媒体 page/media/
P2(依赖P1):
7. 新建 page/config.js(MEDIA_BASE) + utils.js 增 exMediaUrl()
8. 新建 page/ex-dataset.js(get/search/matchCandidates/normalize)
9. index.html 加 script 标签 + cache-busting
10. app.js/tab-settings.js: dsId 读写 + 编辑 modal 关联区块
11. bump v1.11.0 + 三项同步
P3(依赖P2):
12. 百科入口按钮 + 卡片关联标记
13. 百科面板: 分页+搜索+筛选
14. 百科详情: 说明/分步/肌群+缩略图+GIF 点击播放
15. bump v1.11.1 + 三项同步
16. 端到端验收 + CONTEXT.md 正式同步
```

---

## 十一、裁决记录（2026-08-27 作者拍板）

| # | 议题 | 裁决 |
|---|------|------|
| 1 | **版本节奏** | **本功能不单独发 v1.11.x**——属 v2.0 准备开发内容，与 M2a 等其他 v2.0 项目**并列**，版本号随 v2.0 发布节奏统一走（施工提交仍每次 bump，具体版本号在开工时按当时的 APP_VERSION 基线递增） |
| 2 | data/raw/ 原始数据 | **入库 git**（保打包管线可复现，仓库 +~1.4MB 可接受） |
| 3 | 详情页 GIF | **点击播放**（静态 jpg 盖 ▶ 浮层，点按才加载 GIF） |
| 4 | MEDIA_BASE | 本地先留空（用 page/media/ 相对路径），作者上图床后一行配置切换 |
| 5 | 百科面板形态 | **overlay 全屏 sheet**（否决了 leader 推荐的替换式——采用全屏覆盖，关闭即返回动作库） |

> 裁决 1 影响原分期表的版本纪律列：P2/P3 的「bump v1.11.0/v1.11.1」改为「随 v2.0 统一发布节奏，施工时按当时基线 bump」，其余（三项同步、docs:/chore:/feat: 判定）不变。
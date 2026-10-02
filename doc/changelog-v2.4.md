# v2.4 变更日志

> 本文件只记录 **v2.4.x** 的变更。v2.3 及更早见 `doc/changelog-v2.3.md`。
> 设计规格：`doc/design-tokens-v2.1.md`（令牌 / 对比度 / 触控 / 无障碍）

---

## v2.4.0

Date: 2026-10-02

**MyHealth 群战 UI 战斗表现重构（布局 / 特效 / 统计）** —— **纯展示层，一行战斗数值都没有改**。

改动全部落在渲染与样式两个面：`page/game-render.js`（1392 → **1813 行**）、`page/index.css`（**+74 行**）、
`page/index.html`（**仅缓存戳** `?v132` → `?v133`，52 处）、`page/utils.js`（**仅** `APP_VERSION` `2.3.3` → `2.4.0`）。

引擎文件 `battle-group.js` / `unit.js` / `talent.js` / `skill.js` / `status-defs.js` / `affix.js` /
`battle.js` / `terrain.js` / `ai.js` / `group-levels.js` / `group-progress.js` **零改动**。

数据只从 `gb.log`（唯一权威事件源）与 `gb.units` / `gb.allies` / `gb.enemies` / `gb.turn` / `gb.winner` / `gb.terrain` 读，
**不新增任何存档字段、不新增任何全局状态**。

### 新增功能

**① 行动横幅 `renderGroupActionBanner(gb)`：一眼看清「谁 + 正在做什么」**

- 位置在吸顶区**第二行**（`.gb-ctrl` 之后、`.gb-tabs` 之前）—— **绝不能放进 `#gbPane`**：
  那是唯一的滚动容器（`.gb-pane{overflow-y:auto}`），放进去横幅会随单位卡/日志一起滚走。
- 内容**全部从数据派生**（禁写死模板句）：行动者取 `_groupActing` → `gb.units`，文案取 `gb.log` 末条日志里
  **首个非 `bubble` 事件**的 `msg`，两侧都先剥前导 emoji 与多余空格（`gbStripLeadEmoji()`）。
- 按阵营配色：**友方绿 / 敌方红 / 场地紫 / 开场黄**（场地事件 `l.terrain` 优先、其次开场 `l.opening`）；
  战斗结束时给中性色块（`tone-none`）；开战瞬间既无行动者又未结束 → 整条不渲染、不占吸顶区高度。
- **剔除引擎消息里重复的施法者名**：引擎事件文案本身已带行动者（`⚔️ 🧑 你 攻击 Boss·暗龙 → …`），
  直接拼会得到「你 你 攻击…」；现先把消息开头的行动者名摘掉再拼（见「修复 ②」）。
- 硬性约束：单行 `nowrap` + 省略号、整条高度 ≤44px（否则 360px 首屏只剩 1 张单位卡）。
  **实测横幅高度 32px ≤ 44px 上限**。
- a11y：`aria-hidden="true"`（可读记录以日志 Tab 为准），**不加 `aria-live`** —— 自动模式每秒重绘数次，
  读屏会被刷屏。

**② 行动焦点 `gb-focus`：当前行动者凸显、其余单位压暗**

- `#gbPane` 挂 `.gb-focus` 类，CSS 只暗化**非行动者**：`.gb-focus .gb-unit:not(.gb-acting):not(.gb-dead){opacity:.75}`；
  行动者本身靠既有的 `box-shadow` 光环 + `::before` 左侧强调条 + `z-index:2` 表达，**不做放大**（见「UI 调整」）。
- `_groupStep()` 内**不得有 DOM 操作**（有测试守卫）：横幅与焦点**只由 `renderGroupOverlay()` 渲染**
  （`pane.classList.toggle('gb-focus', !!(_groupActing && !gb.done))`）。
  日志筛选按钮的点击处理也统一由 `renderGroupOverlay()` 绑定/重绘，`_groupStep()` 一行未碰。

**③ 打击特效（含飘字）：从引擎日志像素级解析**

- 新增引擎日志正则表 **`GB_HIT_RX`** + **纯函数 `gbParseHit(e, prevEvent)`**（唯一消费点）：
  覆盖技能伤害 / 普攻 / 魂攻 / 蓄力 / 冰魄余威 / dot 四类 / 场地两类 / 反冲（两种写法）/ 牺牲自我 / 三种治疗；
  **护盾吸收不算伤害**（`shield.test()` 先短路返回 `null`），气泡 / 免疫 / 场地标题不出数字。
- **暴击判定靠同一 `events` 数组里紧邻的上一条事件**：引擎把 `💥 暴击！×N` 写在伤害事件**之前**
  （伤害文本本身不含「暴击」二字），故只能看 `evs[i-1]`，正反两面都有断言。
- 特效层 **`#gbFx` 由 JS 懒创建**（挂 `body`），样式 `position:fixed;inset:0;pointer-events:none;z-index:56`
  —— fixed + `inset:0` 使子元素坐标即视口坐标。
- 飘字按 **`card.getBoundingClientRect()`** 定位到对应单位卡上方（受击目标闪烁 + 伤害/治疗飘字）。
- 新增 `@keyframes floatUpC`：**每一帧都重复 `translateX(-50%)`** —— 若复用 `floatUp`，
  它每帧只写 `translateY`，会把定位用的 `translateX(-50%)` 覆盖掉（数字从卡片中心跳到左边缘）。
- 伤害 / 治疗 / 护盾吸收分别着色；伤害色阶按目标最大生命百分比分三档（<5% 白 / 5~20% 黄 / >20% 红）。
- 特效层在 **`#gbClose`** 与 **`_groupDone()`** 中清理（否则结算面板后面还飘着上一场的旧数字）。

**④ 结算统计面板：纯函数 `groupBattleStats(gb)`**

- 口径（全部来自 `gb.log`，不猜不补）：
  - **造成伤害** ← 日志 `l.unit`（行动者名字 → `gbUnitIndex()` 建立「名字 → 单位」映射）；
  - **承受伤害** ← 事件 `e.targetId`；**地形伤害没有 `targetId`** → 用去 emoji 的名字经 `byShort` 索引回落；
  - **治疗 / 状态计数**（`施加|刷新【…】`）逐单位统计；
  - **dot（中毒/附身/末日/遗言）无攻击者** → 单列一行，不计入任何人造成伤害、不参与 MVP，但计入承受伤害；
  - **护盾吸收单独列出、不计入造成伤害**；场地伤害同样单列。
- **MVP 需造成伤害 > 0**（全员 0 伤害时不给 MVP —— 给一个 0 伤害的「最有价值」是误导）；
  平局按 **造成 → 治疗 → `gb.units` 顺序**破平。
- **重名单位加 `#2` 后缀**（只改显示 key，如实显示、不静默合并），并附注
  「`gb.log` 只记行动者名字、没有 id，**日志归属会落到同名的第一个单位**」。
- 面板**复用既有 `_openDetailPanel(html, restore)`**（`#panelOverlay` z-index 52 > 战斗层 50，不新建 overlay）；
  恢复回调**只摘掉 `#battleOverlay` 的 `open`**，**不能**调 `resumeGroupBattle()` —— 那会再次进入
  `_groupDone()`，而本面板正是从 `_groupDone()` 里调起的。
- 含 **`#gbCopyReport` 一键复制战报**；战报文本由 `groupLogText()` 产出，与日志页「📋 复制」**共用唯一来源**
  （禁两处各写一套）。

**⑤ 日志页升级：五档类型筛选**

- `[全部][伤害][治疗][状态][天赋]` 五档筛选按钮（`aria-pressed` 表达选中态，热区 ≥ `--touch-min` 44px，单行可横滑）。
- **先筛选、再做「最近 8 条」截断** —— 顺序反了就会「筛选后明明有 8 条以上，却只看到更少的条目」；
  筛选态丢掉无事发生的空回合，`全部` 态保留既有「（本回合无事发生）」文案。
- 空态文案「该类型暂无事件」（`全部` 档仍是「战斗开始…」）。
- 页签徽标显示**筛选后的条数**（`gbLogEntries(gb).length`）。
- 单位名徽标（`.gb-log-actor-badge`）按类型着色（友方 / 敌方 / 场地 / 开场），**先剥前导 emoji 再取前 2 字**
  （否则 `👹 熔岩巨兽` 只剩一个 emoji）。
- 伤害 / 治疗数字分别用 `.dmg-num` / `.heal-num` 高亮；插标签在 `escHtml()` **之后**做（先转义再插标签，
  否则标签会被转义掉）。

**⑥ 布局收口（含刘海安全区）**

- `.gb-ctrl` 加 `padding-top:calc(6px + var(--sat))` —— `.battle-overlay` 是 `position:fixed;inset:0`，
  内容从屏幕最顶端开始，不补 `--sat` 时 ✕ / 标题 / 场地胶囊会被刘海与状态栏压住（口径与 `.panel-inner` 一致）。
- `.gb-pane` 加 `overflow-x:hidden` —— 消除既有的 `gbHit` 抖动导致的横向溢出（见「修复 ④」）。
- `.gb-unit.gb-acting` 加 `z-index:2` —— 行动卡压在相邻卡之上，光环不被邻居圆角切掉。
- 尺寸**全部走令牌**，**无 `!important`**、**无 `transform:scale()`**（测试含源码级反模式守卫）。

**⑦ 新增回归测试 `scripts/test-group-ui-presentation.js`（193 断言）**

全部是**真断言**（不是「没抛异常」）：① 引擎日志速查表**每一种文案**都能提出正确的数字与类型；
② 暴击紧跟前一事件的正反两面；③ 伤害色阶三档；④ 统计纯函数用构造的 `gb.log` 实测（归因 / MVP / 并列破平 /
同名映射 / 护盾吸收不计入 / dot 单列不计 MVP / 场地单列）；⑤ 筛选必须发生在「仅最近 8 条」**截断之前**
（构造一条「heal 全在 8 条之外」的日志，若先截断就必然取不到）；⑥ 徽章与数字高亮的源码守卫；
⑦ 结算面板的恢复回调与 `#gbCopyReport` 接线；⑧ 源码级反模式清单（禁 `!important` 压盖、
禁 `transform:scale()` 放大行动者、`_groupStep` 内不得有 DOM 操作、新增字号必须走令牌、
居中飘字必须自带 `translateX(-50%)` 的专用关键帧）。**运行结果：ALL PASS（193/193）。**

### 修复

**① 飘字显示字面量 `NaN`（本版最典型的缺陷）**

- 伤害正则的捕获组有**两组**（名字、数字），代码读了**第 1 组（名字）** → `Number("🧑 你")` = `NaN`，飘字打出字符串 `NaN`。
- 且普攻 / 魂攻消息是 `攻击 魔像 → 1218 伤害`（数字紧跟箭头、**没有目标名**），与规格里的单条正则不匹配。
- 修法：拆成两条 —— **`dmgSkill`**（`/→\s+(.+?)\s+(\d+)\s+(?:魂)?伤害/`，技能/蓄力，数字在目标名之后，**取第 2 组**）
  与 **`dmgPlain`**（`/→\s+(\d+)\s+(?:魂)?伤害/`，普攻/魂攻，**取第 1 组**），并按此顺序依次尝试。

**② 横幅出现重复施法者名「你 你 攻击…」**

- 引擎事件的 `msg` **绝大多数已经带了行动者名**，横幅又拼了一次 → 名字印两遍。
- 修法：`msg` 以行动者名开头时（`indexOf(nm)===0`）且其后紧跟空白 / `·` / `，` / `,` / `、` / `:` / `：` 时才剥离该前缀，
  再拼「名字 + 事件文案」—— 纯字符串派生、非模板句，改引擎文案不会被静默吞掉（测试有正反断言）。

**③ 地形伤害没有算到承受伤害里**

- 场地伤害日志行**缺 `targetId`**（与其余事件不同），承受伤害只剩 `e.targetId` 一条取值路径 → 场地伤害全部漏计。
- 修法：只在 `e.type==='terrain'` 且无 `targetId` 时启用**去 emoji 的 `byShort` 索引回落** —— 场地文案里的名字
  **没有前导 emoji**（`🪨 🧑 你 受碎石伤害 40` → 抠出 `你`），故 `gbUnitIndex()` 额外建一份
  `byShort[gbStripLeadEmoji(name)]` 索引；其余事件仍严格按 `targetId`，不扩大回落面。

**④ 单位卡 `gbHit` 抖动造成 `#gbPane` 瞬时横向溢出**

- 受击抖动动画 `gbHit` 会把单位卡左右各推 5px，卡片右边界随即越过容器右边界 3px
  （**实测 360px：pane `sw=340` > `cw=336`**）；`overflow-y:auto` 会把 `overflow-x` 一并算成 `auto`
  → 战斗中冒出横向滚动条。
- 修法：`.gb-pane` 补 `overflow-x:hidden`（容器自身不需要横向滚动；行动顺序条 `.gb-order` 自带
  `overflow-x:auto`，不受影响）。

### UI 调整

**新增样式（`page/index.css`，+74 行）**

| 选择器 / 关键帧 | 用途 |
|---|---|
| `@keyframes floatUpC` | **居中**飘字专用关键帧：每一帧都重复 `translateX(-50%)`（复用 `floatUp` 会覆盖居中位移） |
| `.gb-fx-float`（+ `.big`） | 飘字本体：`position:absolute` + `translateX(-50%)` + tabular-nums + 文字阴影 + `floatUpC .9s` |
| `.gb-banner` / `.gb-banner-chip` / `.gb-banner-text` / `.tone-*` | 行动横幅：单行 `nowrap` + 省略号、`min-height:32px` / `max-height:44px`、左色块按阵营配色 |
| `.gb-focus` | 行动焦点：只对非行动者生效的 `opacity:.75` |
| `.gb-log-filters` / `.gb-log-filter`（+ `.on`） | 日志五档筛选：单行可横滑、热区 ≥ `--touch-min`、选中态 `aria-pressed` 同步 |
| `.gb-log-actor` / `.gb-log-actor-badge` + `.tone-ally/.tone-enemy/.tone-terrain/.tone-opening` | 日志行动者徽章：固定 40×20px 色块、按类型着色、超长省略 |
| `.dmg-num` / `.heal-num` | 日志伤害红 / 治疗绿数字高亮 |
| `.gb-res-row` / `.gb-res-name` / `.gb-res-cells` / `.gb-res-mvp` | 结算面板「我方战报」行：窄屏也能一行放下 5 个数字（数字组可换行） |

**§6 布局收口**

- `.gb-ctrl{padding-top:calc(6px + var(--sat))}` —— 让出刘海安全区（`--sat` 在 `:root` 定义；
  `.battle-overlay` 是 `position:fixed;inset:0`，内容从屏幕最顶端开始，居中的 `.gb-pane` 不受影响）。
- `.gb-pane{overflow-x:hidden}` —— 消除 `gbHit` 抖动引起的瞬时横向溢出。
- `.gb-unit.gb-acting{z-index:2}` —— 行动卡压在相邻卡之上（光环不被邻居圆角切掉）。
- **尺寸全部走令牌**；**无 `!important`**；**无 `transform:scale()`**（放大行动者在滚动裁剪容器里必然溢出）。

### 测试与版本三项

- 新增 `scripts/test-group-ui-presentation.js`：**193 断言 / ALL PASS**。
- 全量 **57 套件全绿**；固定种子 `gb.log` 与改前**逐字节一致（6644 字节）** —— 进一步佐证「一行战斗数值都没改」。
- 浏览器实测：**360 / 390 两宽度 × 快慢两档均无横向溢出**、`console` **0 error**（`✅` 见下方「已知取舍」中未达成的一项）。
- `APP_VERSION` 2.3.3 → **2.4.0**；`page/index.html` 缓存戳 **`?v132` → `?v133`**（52 处）；`page/` 文件数 **51**（本版只新增 `scripts/` 下的测试脚本，不影响该计数）。

### 已知取舍（如实记录，未达成项）

- **对比度取舍**：`gb-focus` 把非行动单位压暗到 **`opacity:.75`** 后，axe 实测的对比度告警节点由 **5 增至 18**。
  基线（未改前）全页 axe 本来就有 **3 项告警**：`color-contrast` / `nested-interactive` / `region`，
  其中 `nested-interactive` 是 `renderGroupUnit` 既有的 `role="button"` 卡片内嵌 `.gb-chip` 按钮，**属既有问题、不在本版范围**。
  → 因此**「axe 违规 0」在本版未达成**：按规格要求的压暗强度保留 `.75`（更低的透明度会让 12px 弱化文字跌破 WCAG AA），
  如需归零只需把该值提到约 **`.88`（一行 CSS）**。
- 特效层 `#gbFx` 的飘字位置在**渲染时刻**取 `getBoundingClientRect()`：若飘字生存期内用户滚动 `#gbPane`，
  已生成的飘字不会跟随卡片移动（飘字生存期 900ms，代价可接受；未做 rAF 跟随）。
- ✅ **`page/index.html` 的 UTF-8 BOM：本版提交前专门核过，结论是「BOM 未变动」**（该文件的编码在本项目出过事故，
  历史参照 v1.8.4 曾专门发版「恢复 index.html UTF-8 编码」）：
  HEAD 版本与工作树版本**都以 `EF BB BF` 开头**、同为 **17909 字节**；`git diff --numstat` 对 `page/index.html` 记
  **52+/52−**，`git diff -U0` 的**第一个 hunk 是 `@@ -8 +8 @@`（缓存戳行）**，首行 `<!DOCTYPE html>` **没有任何 hunk**
  → 本版对该文件**确实只改了 52 处缓存戳**。（`git diff --stat` 显示的两文件合计 53+/53− 是叠加了 `page/utils.js` 的 1+/1−，
  不是 `index.html` 有第 53 处改动。）
- ⚠️ **工具链坑（供后续会话参考，非本版缺陷）**：`edit` / `write` 工具落盘会**丢掉 `page/index.html` 的 BOM** ——
  本版执行缓存戳替换时先丢过一次（表现为 `<!DOCTYPE html>` 那行多出一对增删），已用**字节级写回**恢复。
  用这两个工具改 `page/index.html` 的会话，**务必复核首三字节为 `EF BB BF`**。

### 本次新增 / 修改文件

**新增**

| 文件 | 说明 |
|---|---|
| `doc/changelog-v2.4.md` | 本文件（v2.4 线变更日志 + 架构演化表） |
| `scripts/test-group-ui-presentation.js` | 群战 UI 表现层回归测试（**193 断言**，纯函数/正则/统计/筛选/源码守卫） |

**修改**

| 文件 | 变化 |
|---|---|
| `page/game-render.js` | 1392 → **1813 行**（六项重构的渲染实现） |
| `page/index.css` | **+74 行**（上表新增样式 + §6 布局收口） |
| `page/index.html` | **仅缓存戳** `?v132` → `?v133`（**52 处**；`git diff --numstat` 实测 **52+/52−**，首行 BOM 未变动） |
| `page/utils.js` | **仅** `APP_VERSION` `2.3.3` → `2.4.0` |
| `README.md` | 副标题版本号 / 版本历史表新增 v2.4.0 行 / 当前版本指针 |

**删除**：无

> ✅ **本版未改动任何引擎文件，读写契约满足** —— `battle-group.js` / `unit.js` / `talent.js` / `skill.js` /
> `status-defs.js` / `affix.js` / `battle.js` / `terrain.js` / `ai.js` / `group-levels.js` / `group-progress.js`
> 逐字节未变，且本版**没有读取任何引擎未暴露的私有状态**：所有展示数据都来自 `gb.log` 与 `gb` 上的公开字段。

---

## 架构演化表

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| v1.1 | 10 | 308 行 tab-strength.js | Store 模块提取、文件拆分 |
| v1.2 | 13 | 388 行 tab-game.js | PR/统计/有氧计划/记录 |
| v1.3 | 13 | 397 行 tab-game.js | 有氧强度/自定义/关卡预览/Profile 子 Tab |
| v1.4 | 13 | 397 行 tab-game.js | 属性日志增量/UI 美化/平滑曲线 |
| v1.5 | 14 | 508 行 tab-game.js | 里程碑/日周月/导出导入 |
| v1.6 | 15 | 508 行 tab-game.js | 云同步/跨设备 |
| v1.7 ~ v1.9.9 | — | — | 未存档 |
| v1.10 | 22 | 583 行 challenge.js | 炼魂/战斗重构 |
| v1.11.0 | 22 | 583 行 challenge.js | 成就/装备/自动战斗 |
| v2.0.0 | 44 | 761 行 game-render.js | 技能/敌群群战/宠物/宝珠 + 挑战页三视图 |
| v2.1.0 | 44 | 763 行 game-render.js | 🎨 设计令牌体系 + 移动端/无障碍/WCAG AA 全面改造 |
| v2.1.34 | 46 | 1288 行 game-render.js | 关卡试炼 24 → 27 章（共 153 关） |
| v2.1.36 | 46 | 1288 行 game-render.js | 关卡试炼 30 → 33 章（共 189 关） |
| v2.2.0 | 46 | 1291 行 game-render.js | 上场宠物 2 → 4 + 团队凝聚/共鸣接线 |
| v2.2.22 | 47 | 1348 行 game-render.js | 技能槽位开放到 3 + 敌群掉落倍率补线 + 威吓区间化 |
| v2.2.23 | 47 | 1348 行 game-render.js | 角色等级系统（`page/level-system.js`） |
| v2.2.24 | 48 | 1348 行 game-render.js | 26 档称号（`page/level-titles.js`）+ 去掉 lv2000 ×2 |
| v2.2.27 | 48 | 1348 行 game-render.js | WP-I 第二批：战斗页信息密度优化 |
| v2.2.28 | 48 | 1348 行 game-render.js | WP-I 第三批：敌群进度重置 + 宠物详情三段式 |
| v2.2.29 | 48 | 1409 行 game-render.js | 🐾 宠物头像 14 只（`page/media/pets/*.svg`）+ 接入 UI |
| v2.2.30 | 48 | 1409 行 game-render.js | 🔍 宠物头像第三方评审收口（darkcrow 对比度 / alt / 32px / 去角标） |
| v2.3.0 | 48 | 1409 行 game-render.js | 🐾 宠物面板布局整改（参战阵容上移 / 一键治疗全宽 / 结算按钮条件显示）—— **并行会话，记录见 `doc/changelog-v2.2.md`** |
| v2.3.1 | 50 | 1422 行 game-render.js | 🐉 **怪兽头像 18 原型**（`page/media/monsters/*.svg`）+ `monster-archetype.js` + 接入关卡列表卡片·单敌对战界面·敌群战斗单位卡 |
| v2.3.2 | **51** | **1430 行 game-render.js** | 🎯 **技能图标 48 枚**（`page/media/skills/*.svg`）+ `skill-icon.js` + 接入培养页卡片·战斗芯片·详情弹窗；修 `.gitignore` 的 `skills/` 未锚定地雷 |
| v2.3.3 | 50 | 1348 行 game-render.js | **战斗页实装宠物头像**（作者：「战斗页面，宠物图标也要实装」）：战斗 overlay 新增 `gbPetIconHtml(u)`，**走既有唯一入口 `petIconStageHtml()`**（未另写口径），尺寸走单一常量 `GB_PET_ICO_SIZE`；落在**单位卡**与**行动/队伍条**两处；尺寸遵守头像评审结论**只用 16 的倍数**（逻辑格 3px → 16/32/48 描边才落整数像素；24/40 会 1·2px、2·3px 混排）；玩家与敌方**不给头像**（敌方属另一条线的怪物图，玩家无现成槽，未发明）；**缺图回退 emoji**、卡片不塌陷。新增 `test-battle-pet-icons`，全量 **56 套件 / 3682 断言**。⚠️ 待处理：本版记录写入 `doc/changelog-v2.3.md`，而 **v2.3.0/v2.3.1 两节仍在 `changelog-v2.2.md`** → 需迁移；另**版本号出现重复**（本线 v2.3.1 与另一线 `3dcf671` 的 v2.3.1 撞车）→ 建议后续由主控统一发号 |
| v2.4.0 | 51 | 1813 行 game-render.js | 群战 UI 战斗表现重构（行动横幅 / 行动焦点 / 打击飘字 / 结算统计 / 日志筛选 / 布局收口），纯展示层，引擎零改动 |

> 「JS文件数」= `page/` 下 `*.js` 文件数量（**含子目录**，如 `page/data/exercises-dataset.js`）。
>
> ⚠️ **v2.3.1 行的数字已勘误**：原记 `49`，实测为 **50** —— 旧行漏计了子目录里的
> `page/data/exercises-dataset.js`（`ls page/*.js` 不展开子目录）。v2.3.2 由 50 → **51**
> （新增 `skill-icon.js`）。
>
> 「最大文件」v2.3.2 按 `wc -l` 对**本版提交内容**实测为 `game-render.js` **1430 行**。
> ⚠️ 注意：工作树里同时存在**并行会话未提交的 v2.3.3 WP-I 战斗页宠物头像**改动
> （`gbPetIconHtml` / `GB_PET_ICO_SIZE`，净增约 +51 行），
> 直接 `wc -l page/game-render.js` 会得到 1486 行 —— **那 56 行不属于本版**。
> 本表只记本版自己的变化：1422 + 8（本版 4 处接入共 4×+2/−1）= **1430**。
>
> 「最大文件」v2.3.1 按 `wc -l` 实测为 `game-render.js` **1422 行**
> （v2.2.29 / v2.2.30 两行记的 1409 行是**改前**的值；v2.3.1 在 `game-render.js` 内新增了两处接入代码：
> 关卡列表卡片的头像注入 + `renderGroupUnit` 的敌方头像）。
>
> ⚠️ **历史行口径说明**：v1.0 ~ v2.2.28 的行**逐字取自 `doc/changelog-v2.2.md` 的架构演化表**，
> 未做任何改写 —— 该表是历史数字的唯一来源，本版不重新推算历史值。
> 沿用其原始体例：早期版本号混用（`v1.11.0` / `v2.0.0` / `v2.1.0`）与 `v1.7 ~ v1.9.9` 的「未存档」缺口
> 都照原样保留；跨度较小的版本（如 v1.2 ~ v1.6）只保留代表行，避免本表无限膨胀。
> 其中 `v2.2.27` / `v2.2.28` 两行的 1348 行是旧值，v2.2.29 已按 `wc -l` 复核为 1409 行（原表已勘误）。
>
> 「最大文件」v2.4.0 **本版按 `wc -l` 复核：`page/` 下 `*.js` 共 51 个文件、`page/game-render.js` 1813 行**
> （v2.3.3 行记的 50 / 1348 是改前值，本版不改写历史行）。
> **本版只新增 `scripts/test-group-ui-presentation.js`，它不在 `page/` 内**，
> 故「JS文件数」51 与上一行的计数一致，未发生增减。
> 说明：`page/game-render.js` 由 1392 行增至 1813 行，**净增 421 行全部是渲染/解析/样式注入代码**，
> 不含任何战斗数值或引擎逻辑（引擎文件本版零改动，见上）。

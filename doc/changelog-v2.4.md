# v2.4 变更日志

> 本文件只记录 **v2.4.x** 的变更。v2.3 及更早见 `doc/changelog-v2.3.md`。
> 设计规格：`doc/design-tokens-v2.1.md`（令牌 / 对比度 / 触控 / 无障碍）

---

## v2.4.0

Date: 2026-10-02

**MyHealth 群战 UI 战斗表现重构（布局 / 特效 / 统计）** —— **纯展示层，一行战斗数值都没有改**。

改动全部落在渲染与样式两个面：`page/game-render.js`（1486 → **1949 行**）、`page/index.css`（**+74 行**）、
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
| `page/game-render.js` | 1486 → **1949 行**（六项重构的渲染实现） |
| `page/index.css` | **+74 行**（上表新增样式 + §6 布局收口） |
| `page/index.html` | **仅缓存戳** `?v132` → `?v133`（**52 处**；`git diff --numstat` 实测 **52+/52−**，首行 BOM 未变动） |
| `page/utils.js` | **仅** `APP_VERSION` `2.3.3` → `2.4.0` |
| `README.md` | 副标题版本号 / 版本历史表新增 v2.4.0 行 / 当前版本指针 |

**删除**：无

> ✅ **本版未改动任何引擎文件，读写契约满足** —— `battle-group.js` / `unit.js` / `talent.js` / `skill.js` /
> `status-defs.js` / `affix.js` / `battle.js` / `terrain.js` / `ai.js` / `group-levels.js` / `group-progress.js`
> 逐字节未变，且本版**没有读取任何引擎未暴露的私有状态**：所有展示数据都来自 `gb.log` 与 `gb` 上的公开字段。

---

## v2.4.1

Date: 2026-10-02

**修复「6 条低级技能永不发动」的死池缺陷** —— **本版唯一的引擎侧改动，会改变游戏内容 / 难度**。
其余排队中的工作（含 `page/game-render.js` 的纯表现层重构）留待 **v2.4.2**；本版 `page/game-render.js` **一行未动**。

改动落在三个文件：`page/group-levels.js`（628 → **641 行**，+13）、
`scripts/test-group-levels.js`（217 → **283 行**，+66，新增回归断言）、
`scripts/test-talent-fixation.js`（539 → **546 行**，+9/−2，杂兵技能的种子流哨兵重采基线），
外加版本三项（`page/utils.js` 的 `APP_VERSION`、`page/index.html` 缓存戳 52 处、`README.md` / 本文件）。

### 新增功能

无（本版只修缺陷，不新增任何玩法 / 数值 / 界面）。

### 修复

**① `SKILLS_LOW` 是死池：6 条低级技能在 240 个关卡里永不发动（本版核心修复）**

- **现象**：`bite 咬击 / snowball 雪球 / shrink 变小 / yawn 哈欠 / drench 打湿 / surprise 击掌奇袭`
  这 6 条技能代码与结算都完整，但**实战永远见不到**。
- **根因（`page/group-levels.js` 的 `genEnemyCfg`）**：
  `var sp = (isBoss || isElite || tier === 'elite1' ? SKILLS_HIGH : SKILLS_LOW).slice();` 之后只有两条分支 ——
  `if (isBoss) {…抽 2 个高级…}` 与 `else if (isElite || tier === 'elite1') {…抽 1 个高级…}`，
  **杂兵没有分支**：`sp`（对杂兵即 `SKILLS_LOW`）只被赋给局部变量就再无下文 → **从未被消费**。
  再叠加 `page/enemy.js:13` 的 `minion: { talent: [0,0], skill: [0,0] }`，
  杂兵技能槽位恒为 0 → 这 6 条技能**在 240 个关卡里一次都不会发动**。
- **改前实测**（24 大关 × 10 小关全量扫描，即线上 `GROUP_LEVELS` 的实际内容）：
  **杂兵 238 个技能槽位，携带技能 0 个**；同一次扫描中 `elite1` 142 / `elite2` 70 / `boss` 24 个槽位**都正常带技能**
  → 只有杂兵这一条路断了。
- **修法**：在既有两条分支之后补**杂兵分支** —— **50% 概率带 1 个低级技能**，
  仍取本小关既有的 `rng()`（`groupRng(groupHash(lg, st, slot) + 303)`）
  → **种子确定性与「同一关永远同一套配置」的性质不变**。
  该 `else` **经核对恰好只覆盖 `tier === 'minion'`**：`tier` 在同一函数内派生为
  `isBoss ? 'boss' : isElite ? 'elite2' : (st % 3 === 0 ? 'elite1' : 'minion')`，
  而 `'elite1'` 已被上一分支（`isElite || tier === 'elite1'`）接住 —— 故**不需要**写成 `else if (tier === 'minion')`。
  池为空时不 push、也不消耗 `rng`。
- **未改 `page/enemy.js`（刻意）**：它对 `opts.skills` 是**逐字使用**
  （`if (opts.skills) skillIds = opts.skills.slice()`），**不经 `ENEMY_TIERS[tier].skill` 槽位裁剪**，
  所以只要 `cfg.skills` 有值就会生效 —— 修 `group-levels.js` 一处即可，不必碰引擎。
- **改动面（逐槽位「改前 vs 改后」比对，共 474 个槽位）**：**只有 119 个杂兵的 `skills` 字段变化**，
  其余字段（`base` 属性 / `talents` / `affixes` / `name` / `tier` / `level`）与其余 tier
  （`elite1` / `elite2` / `boss`）**零变化** —— 即**没有任何数值、概率、属性公式被改动**。
  原因：杂兵分支是杂兵路径上**唯一**的 `rng()` 消费者（杂兵 `GROUP_TALENT_COUNT.minion = [0,0]`，
  后面的天赋抽取一步都不执行），故新增这次抽样**不会扰动**任何其它随机流。
- **注释已就地写明**「这是 v2.4.1 的死池修复 + 为什么以前不生效」，ES5 风格与文件一致。

**② 顺带说明：这个死池此前为什么没被测试抓住**

- 既有断言只覆盖两类：天赋是否固化、**技能池里的 id 是否有效**
  （`scripts/test-pools-reachable.js` 判的是「池子存在性」——`SKILLS_LOW` 的 id 有没有注册过），
  **没有一条断言检查 `GROUP_LEVELS` 里杂兵的 `skills` 实际取值**
  → **池子存在 ≠ 池子被消费**。本版补的正是这条「被消费（可达）」断言，并逐条打印命中数。

### UI 调整

无。

### 测试与版本三项

- `scripts/test-group-levels.js` 新增 **7 条**回归断言（新一节「3.9 v2.4.1：SKILLS_LOW 死池修复」）：
  ① `SKILLS_LOW` 池可读且非空；② **6/6 全员可达**（逐条命中数写进断言名）；
  ③ 杂兵携带技能数 ≤ 1；④ 杂兵技能全部来自 `SKILLS_LOW`（不得出现 `SKILLS_HIGH` 成员）；
  ⑤ **概率区间守卫**：出现率必须落在 20%~80%（防「50% 被改成恒有 / 恒无」）；
  ⑥ 同一 (大关, 小关, 槽位) 两次生成的配置**完全一致**；
  ⑦ 关卡既有 `rng` 入口同种子重建两次、**序列逐位一致**。
- **实测（本版）**：**6/6 命中** —— `bite` 16 / `snowball` 21 / `shrink` 22 / `yawn` 21 / `drench` 18 / `surprise` 21（合计 119）；
  **杂兵带技能 119/238 = 50.0%**；杂兵技能数恒 ≤ 1；来源全部为 `SKILLS_LOW`。
- **变异验证（证明新断言确实能红）**：把概率临时改成 `rng() < 0` → **2 条红**
  （可达性 0/6 + 出现率 0.0%）；改成 `rng() < 1` → **1 条红**（出现率 100.0%）；还原后 **94 通过 / 0 失败**。
- **运行结果（本版改动相关套件全部绿）**：`test-group-levels` **94 断言 / 0 失败**（原 87 + 新 7）；
  `test-talent-fixation` **78/78**；`test-group-battle`（14/0）、`test-group-determinism`（14/14 ALL PASS）、
  `test-enemy`（36/0）、`test-pools-reachable`（21/21）、`test-level-system`（100/100）、
  `test-group-inherit`（45/45）**均无回归**。
- **`scripts/test-talent-fixation.js` 的种子流哨兵已按新实现重采基线**（+9/−2）：
  该文件的 SENTINEL 采的是「天赋固化**之前**」的词条 / 技能取值，用来证明天赋抽取不扰动词条 / 技能的随机流。
  补杂兵分支后，含杂兵的 `g3-4` / `g7-5` 两个哨兵里**杂兵的 `skills` 从「恒空」变成了有意为之的取值**
  （`['shrink']`）→ 已重采这两个字段，并在注释里写明原因。
  ⚠️ **非杂兵槽位的 skills 与全部 `affixes` 逐字保留旧值** —— 它们仍是这条哨兵的回归面：
  若杂兵这次抽样真的污染了后续随机流，`affixes` / `elite2` / `boss` 的取值会立刻对不上。
- ✅ **全量 57 套件全绿（57/57，0 失败）** —— 时点：v2.4.2「战场化」的并行施工代码已在工作树（**尚未提交**），
  故这次是「v2.4.1 引擎修复 + v2.4.2 布局」的合成树；本版自身改动相关的套件见上一条。
  （施工中途曾扫到 2 个红 —— `test-battle-pet-icons` / `test-group-ui-presentation`：它们断言的是**并行 v2.4.2 布局**的
  类名与令牌，在本版提交时已随 v2.4.2 的落地转绿。本版对那两个套件涉及的 `page/game-render.js` / `page/index.css`
  **零改动**，故与本次红→绿无因果关系。）
- ✅ **主控独立复核（不采信执行者自述）**：① 上述 6 个套件由主控亲自复跑，全绿；
  ② `startGroupTrial` → `syncLevel()` 实测 **702 / 900** 字符（余量 198，`test-level-system` 的源码守卫安全）；
  ③ 哨兵重采的正当性由主控用**旧引擎快照对拍**独立验证 —— 旧引擎 minion `skills` 全空、新引擎与新期望逐字一致、
  `affixes` 与非杂兵槽位新旧**逐字相同**；④ 固定种子对拍实测 `g2-1` 的 `minionSkills` **0 → 1**（修复确实生效）。
- `APP_VERSION` `2.4.0` → **`2.4.1`**；`page/index.html` 缓存戳 **`?v133` → `?v134`（52 处）**；
  版本三项（`page/utils.js` / `page/index.html` / `README.md` / 本 changelog + 架构演化表）已同步。

### 如实说明（克制口径）

- 本版**不是纯展示层**：它**改变了游戏内容**（杂兵从此有 50% 概率携带 1 个低级技能），
  **会实际影响敌群战斗难度**（杂兵变强一点点）—— 与 v2.4.0「一行战斗数值都没改」的口径**恰好相反**，特此写明。
- 影响幅度：每个杂兵 50% 概率多 1 个**最基础**的技能（`SKILLS_LOW` 这 6 条），
  `elite1` / `elite2` / `boss` 三类**完全未受影响**；除这一次抽样外**没有改动任何数值或概率参数**。
- **未做真机（浏览器）战斗实测**：本版只做配置层可达性 / 确定性 / 区间断言与既有引擎套件回归；
  「杂兵多带一个低级技能后胜率变化多少」**没有量化**，属未覆盖项（需要的话可用既有胜率模拟脚本补测）。
- 概率 `50%` 与「最多 1 个」是**首版取值**；作者若要调整，只需改 `group-levels.js` 里那一个 `0.5`（一行）。

### 本次新增 / 修改文件

**新增**：无

**修改**

| 文件 | 变化 |
|---|---|
| `page/group-levels.js` | 628 → **641 行**（+13）：`genEnemyCfg` 补杂兵分支（50% 概率带 1 个 `SKILLS_LOW` 技能，走既有 `rng()`）+ 就地说明注释 |
| `scripts/test-group-levels.js` | 217 → **283 行**（+66）：新增 7 条回归断言（可达性 6/6 / 杂兵 ≤1 技能 / 池来源 / 概率区间 / 两次生成一致 / rng 同种子可复现） |
| `scripts/test-talent-fixation.js` | 539 → **546 行**（+9/−2）：种子流哨兵里含杂兵的 `g3-4` / `g7-5` 按新实现重采 `skills` 基线（`affixes` 与其余槽位逐字保留，仍是回归面） |
| `page/utils.js` | **仅** `APP_VERSION` `2.4.0` → `2.4.1` |
| `page/index.html` | **仅缓存戳** `?v133` → `?v134`（**52 处**；`git diff --numstat` 实测 **52+/52−**，首三字节仍为 `EF BB BF`） |
| `README.md` | 副标题版本号 / 版本历史表新增 v2.4.1 行 / 当前版本指针 |

**删除**：无

> ✅ **未改 `page/game-render.js`**（0 行改动）—— 该文件的 `startGroupTrial` → `syncLevel()` 窗口
> 受 `scripts/test-level-system.js:367` 的源码守卫约束（`/startGroupTrial[\s\S]{0,900}syncLevel\(\)/`），
> 本版刻意不碰（实测当前距离 **702 字符 / 上限 900**）。
> ✅ **未改 `page/enemy.js`**（0 行改动），理由见「修复 ①」。

---

## v2.4.2

Date: 2026-10-02

**群战战场化重构：从「垂直卡片列表」到「上下对阵舞台」+ 技能专属特效。纯展示层 —— 引擎文件零改动。**

作者核心诊断（原文）：「这本质上还是一个"垂直铺开的卡片列表"，而不是一个"战斗舞台"……技能和天赋标签直接铺在卡片上，
信息密度太高，导致它看起来依然像"带游戏皮肤的表格"」。本版把**战斗舞台**与**信息面板**彻底分开。

### 新增功能

**① 对阵舞台（三区）** —— `renderGroupBattlePane` 重写：`#gbArena` = `#gbArenaEnemy` → `#gbArenaMid` → `#gbArenaAlly`，
顺序固定不可换（敌方在上，空间上就是「对阵」）。行动顺序条从 `#gbPane` 内移到舞台顶部。
舞台**放在 `#gbPane` 之外**、且 `.gb-arena{overflow:hidden}` —— 这是「行动者放大不会撑出横向滚动条」的前提：
v2.4.0 已实测，把放大放进 `overflow-y:auto` 的滚动裁剪容器必然溢出。

**② 战场芯片只留 4 件信息** —— `renderGroupUnit` 改为 `.gb-unit.gb-arena-unit`：**头像 / 名字 / 血条 / 状态**。
技能名、天赋名、攻防速魂数字**全部移出战场**；芯片内 `.gb-chip` / `.gb-stats` / `.gb-row1` / `.gb-row4` **零出现**
（真渲染断言 + 源码守卫双重把关）。头像优先级：敌方 → 怪物原型 SVG（32px）；我方宠物 → `petIconStageHtml`；玩家 → 名字前导 emoji。
名字 ≤4 字、超出省略，**完整名留在 `data-name` / `title` / `aria-label`**（`data-name` 同时是场地事件反查的唯一依据）。
状态最多 3 个图标 + `+N`；阵亡 = 同一芯片加 `.gb-dead`（灰化 + 名字删除线，**仍保留头像**，不再折叠成 `gb-dead-line`）。

**③ 行动焦点** —— 行动者 `transform:scale(1.1)` + `transform-origin:50% 100%` + 光环 + `::before` 左侧强调条 + `z-index:2`；
其余单位 `opacity:.5`。`.gb-focus` 由 `#gbPane` 迁到 `#gbArena`（芯片都在舞台里）。

**④ 技能专属特效（复用既有 48 枚图标）** —— 技能身份**不用猜**：引擎每次施法都有一条 `type=bubble` 事件、**带精确 `skillId`**
（实测：本场 10/10 条带 id；8 大关 × 末关 × 3 种子共 94/94 条带 id；**非 bubble 事件 0 条带 id**）。
`gbShowSkillCast` 直接 `skillIconHtml(skillId, 48, …)` 出图标 + 技能名 + 阵营色光环，锚在中央特效区。
玩家攻击技能当前不产生 bubble（`castSkill` 才是唯一产生点），故 `isPlayer=true` 目前不可达 —— 按契约实现、按防御处理。

**⑤ 中央特效区** —— 伤害/治疗飘字与技能名一律锚 `#gbArenaMid`，并**上下分层**：施法特效取 0.28 高、飘字取 0.80 高
（两者同锚中心会互压 —— 中央区只有 15vh，放不下「48px 图标 + 上升 34px 数字」）。同一步多条飘字按 4 个槽位错开。
`gbFxFloat(card,text,color,big,slot)` 的签名与函数体内的 `getBoundingClientRect()` 原样保留（有测试守卫）。
**×4/×8 降级**：只留图标闪现、不渲染文字行（步进只有 87~112ms，文字必被下一发盖掉、只会叠成一团）。

**⑥ 单位详情面板补齐** —— 从战场移出的信息进 `renderGroupDetail`：头像（同芯片优先级）+ 血条 + `当前/上限` +
攻/防/速/魂攻/魂防（沿用 `effectiveStat` / `effectiveSpeed` 与既有 ▲▼ 修正标记）。点芯片 → 详情；返回后回到战场。

**⑦ 日志抽屉** —— 默认收起（**战斗进行时不展示日志**），展开占 **52vh**（战斗 Tab 的面板只有约 25vh → 仍是「更大占比」）；
战场常驻可见。日志页本身的筛选 / 分色 / 复制逻辑**一行未动**。

**⑧ 开场刷屏收口（作者点名）** —— 开战钩子（`player-skill-hooks.js` 的 `onBattleStart` 金身护盾）**给每个队友各推一条**
`🛡️ <队友名> 金身护盾 +733（…）` → 5 个我方单位就是 5 条同技能事件，且 `opening` 条目**没有 bubble**（中央区覆盖不到）→
由战斗页那一行文本压成一句：`🛡️ 开场：金身护盾 → 我方 5 人（合计 +3665）`。
**口径**：只认 `🛡️ <名> <技能名> +<数字>` 这一族、按技能名归组、≥2 条才压；人数与合计都是实测值；
**不写「你 对全队施加了 X」** —— `opening` 条目的 `unit` 就是「开场」，日志里没有施法者身份，据实写「我方 N 人」而不猜。

### 修复

**① 场地事件「反查失联」（P0）** —— `gbCardForEvent` 的文案回退分支用 `textContent.indexOf(完整名)` 匹配，
而芯片名已截断成 ≤4 字 → 实测 `精英·狂战`（显示「精英·狂」）与 `Boss·混沌魔`（显示「Boss」）**双双落空**；
后果是场地伤害（`受碎石伤害` / `被闪电击中`，日志**没有 `targetId`**）不再有受击高亮与飘字。
改为按 **`data-name` 完整名**精确匹配（两侧都先剥前导 emoji —— 场地文案抠出的名字不带 emoji）。

**② 飘字与施法特效互压** —— 两者都锚中央区中心（分别由两个任务指定），而中央区只有 15vh → 数字压在图标上。
改为上下分层（0.28 / 0.80），并加 `.gb-fx-float{z-index:2}` 兜底可读性。

**③ 极密阵裁切（真机实测 37px）** —— 5 我 + 3 敌 = 8 芯片时，360×640 下**我方第二行被 `.gb-arena` 的 `overflow:hidden` 裁掉 37px**。
根因：行高写成 `min-height:var(--gb-arena-h)`（20vh），矮屏上把 3 行硬撑到 384px，而舞台只有约 450px。
修法：行高改 **`max-height`**（以内容高度为基准、有空间才长到 20vh）+ 芯片总数 ≥7 时挂 **`.gb-arena-dense`**（芯片 72→56px、头像 32→24px）。

**④ 日志抽屉展开时裁切 + 特效骑在日志上** —— 抽屉 58vh 时舞台只剩 185px，而「顺序条 + 敌行 + 我一行」需要约 194px →
**我方芯片被裁 30px**；同时飘字/施法特效画在日志正文上。修法：抽屉 **58 → 52vh** + 抽屉态复用极密阵尺寸 + 收紧行内边距 +
**抽屉展开时主动跳过飘字与施法特效**（防御式判断：测试桩无 `classList` 时不误伤）。

**⑤ 芯片名字被档位前缀吞掉** —— 名字上限 4 字，而引擎敌人名带档位前缀：`Boss·混沌魔` → 显示 `Boss`、`精英·狂战` → `精英·狂`，
**同档位多个单位会显示成同一个词**（全是 `Boss`），芯片丧失辨识度。修法：`gbUnitShortName()` 先剥前导 emoji、再剥
`Boss·` / `精英·` / `杂兵·` / `护卫·` / `首领·` 前缀，最后截 4 字（前缀信息由**怪物头像与阵营色**承载）；
完整名仍原样进 `data-name` / `title` / `aria-label`。

### UI 调整

- 新增 `:root` 令牌：`--gb-arena-h:20vh` / `--gb-mid-h:15vh` / `--gb-arena-h-s:14vh` / `--gb-mid-h-s:8vh` / `--gb-unit-w:72px` / `--gb-unit-ico:32px`。
- **移除卡片外壳语汇**：`.gb-unit` 的 border / border-radius / background / padding，以及 `.gb-dead-line` / `.gb-dead-name` /
  `.gb-dead-tag` / `.gb-acting-tag` / `.gb-row1` / `.gb-hp-row` / `.gb-row4` / `.gb-stats` / `.gb-stat.soul` 全部删除或改写为芯片语汇。
- 新增：`.gb-arena-wrap` / `.gb-arena` / `.gb-arena-row` / `.gb-arena-mid` / `.gb-arena-dense` / `.gb-arena-unit` / `.gb-arena-ico` /
  `.gb-arena-st(-more/-i)` / `.gb-skill-cast*`（`@keyframes gbCastFade` 只动 opacity）/ `.gb-lineup-open` / `.det-unit`；
  血条合成 5px 细条（`.gb-hp-wrap` / `.gb-hp-fill` 的 transition 保留）。
- **保留**（有测试依赖）：`.gb-ico`（无 height）、`.gb-chip`、`.gb-chip-ico`、`.gb-order-chip.has-ico`、`.gb-banner*`（max-height 44px / nowrap+ellipsis）、
  `.gb-ctrl{padding-top:calc(6px + var(--sat))}`、`.gb-pane{overflow-x:hidden}`、`.gb-fx-float` / `@keyframes floatUpC`、
  日志页 `.gb-log-*`、结算面板 `.gb-res-*`。`@keyframes bubblePop` 已无消费者但按边界保留（+注释说明）。

### 测试与验证（主控亲自执行，不采信执行者自述）

- **全量 57 套件全绿**；`test-group-ui-presentation` 从 283 增到 **311 断言**（新增第 13/14 节：中央特效区 / `data-name` 命中 /
  档位前缀 / 开场一句话 / 技能名兜底；另外把「禁止一切 scale」的旧守卫**改判**为「只允许 `.gb-arena-unit.gb-acting` 放大」——
  旧守卫按字面 `.gb-unit` 匹配，换类名后会**静默空转**，比报红更危险）。
- **确定性硬证据**：与 **v2.4.1 提交（`d5a7ec0`）导出的 `page/` 基线**逐字节对拍，三个关卡全部一致 ——
  `g7-10` 6644 字节 / `g2-1` 104 字节 / `g12-10` 7562 字节，sha256 分别 `60e4aef1…` / `f3790b51…` / `7374f6fd…`。
  本版 `git diff` 里**一个引擎文件都没有** —— 这就是「战斗逻辑完全没动」的可验证形式。
- **浏览器实测**（自建 CDP 驱动：Node 24 内置 `fetch` + `WebSocket` 直连 Chrome DevTools Protocol；headless Chrome +
  独立 `--user-data-dir`，**不碰用户自己的 Chrome**；`agent-browser` 本轮会话卡死已弃用）：
  - 三区顺序 `["enemy","mid","ally"]`；行动者 `scaleX=1.1`、其余 `opacity=0.5`；`.gb-focus` 挂在 `#gbArena` 而**不在** `#gbPane`；
  - 芯片禁类名（`.gb-chip` / `.gb-stats` / `.gb-row1` / `.gb-row4`）**0 命中**；芯片含头像 / 名字 / 血条 / 状态 4 件；
  - **最坏阵型 5 我 + 3 敌 = 8 芯片**：360×640 与 390×844 **均 `clipped=[]`**、`docH=false`（无横向滚动条）；
  - **日志抽屉展开态**：`clipped=[]`（修完抽屉高度后）；
  - **`skillId → 图标` 逐步对照**：`blizzard → media/skills/blizzard.svg`、`spikes → spikes.svg`、`stardust → stardust.svg`、
    `cleanse → cleanse.svg`，与一句话（「Boss·混沌魔 使用了 暴风雪」等）逐步一致；×4/×8 只剩图标、无文字行；
  - 详情面板：点芯片 → `hasBack` / `hasIco` / `hasHp` 全真，正文含 `敌方 · Lv5`、`1679/1679`、`⚔️ 攻 248`、`🛡️ 防 126`、
    `💨 速 12`、`👻 魂攻 99`、`🔮 魂防 74`；返回后战场恢复；
  - 开场一句话真渲染：`🛡️ 开场：金身护盾 → 我方 5 人（合计 +3665）`。
- ⚠️ **对比度实测（`.5` 压暗的代价，如实披露）**：按祖先链取真实底色做 alpha 合成后计算 WCAG 比值 ——
  **非行动者名字 2.50:1**（浅色主题红字 / 深色主题红字**都是 2.50:1**；AA 正文需 4.5:1）；
  行动者名 4.80:1（浅）/ 10.81:1（深）✓；非行动者状态 3.32:1（浅）/ 4.95:1（深）；未压暗的阵容速览 7.30:1 / 12.68:1 ✓。
  `.5` 是**作者规格明确指定**的值，故本版**保留**；要合规只需把它提到 **`.75`（约 4.8:1，一行 CSS）**。

### 已知取舍（如实记录）

- **`.5` 压暗的可读性代价**：见上（2.50:1）。改动点唯一：`index.css` 的
  `.gb-focus .gb-arena-unit:not(.gb-acting):not(.gb-dead){opacity:.5}`。
- **日志抽屉展开时中央区高度让位为 0**：舞台空间全部让给日志（52vh 仍是日志优先），此时飘字与施法特效**主动跳过**
  （否则会骑在日志正文上）。
- **`isPlayer=true` 当前不可达**：bubble 只由 `castSkill` 产生，玩家单位没有 `.skills`（玩家技能走 `playerAttackSkill` 且不产生 bubble），
  故技能图标一律走 `isPlayer=false`；实施上按契约写好分支，并对未知 id 选择「整条不渲染」（宁缺勿错，不留空壳）。
- **同名单位只能命中第一个**：日志没有 `unitId`，场地事件反查按名字匹配 —— 与 `gbUnitIndex` 既有口径一致
  （旧分支同样只能命中第一个，且对截断名恒落空；不是本版引入的回归）。
- **开场一句话的前提**：它只压「同一开战护盾技能 ≥2 条」这一族；若将来有其它族也在开场逐条刷屏，需要按同样方式扩展正则族。

### 本次新增 / 修改文件

**新增**：无（`scripts/test-group-ui-presentation.js` 是 v2.4.0 新增的，本版在其内追加第 13/14 节）。

| 文件 | 变化 |
|---|---|
| `page/game-render.js` | 1949 → **2207 行**（战场三区 / 芯片化 / 中央特效区 / 技能特效 / 开场一句话 / 详情补齐 / 4 处缺陷修复） |
| `page/index.css` | 战场与芯片样式、去卡片外壳、`.gb-arena-dense`、抽屉态（52vh） |
| `scripts/test-battle-pet-icons.js` | 按新契约改写（三行卡 → 芯片；触控 44px、头像必须在 `.gb-arena-ico` 槽内等断言保留） |
| `scripts/test-group-ui-presentation.js` | 追加第 13/14 节 + 尺度守卫改判（只允许 `.gb-arena-unit.gb-acting` 放大） |

> ✅ **本版未改动任何引擎文件**：`battle-group.js` / `unit.js` / `talent.js` / `skill.js` / `status-defs.js` / `affix.js` /
> `battle.js` / `terrain.js` / `ai.js` / `group-levels.js` / `group-progress.js` / `enemy.js` 逐字节未变；
> 展示数据仍只来自 `gb.log` / `gb.units` / `gb.allies` / `gb.enemies` / `gb.turn` / `gb.winner` / `gb.terrain`。
>
> 📌 **方法学留档**：本轮的浏览器验证放弃 `agent-browser`（其 CLI 在会话中途卡在等一个不会来的握手），改为
> **自建 CDP 驱动**（`fetch` + `WebSocket` + `Page.captureScreenshot`）—— 只有 eval / 截图 / 视口三件事，CDP 全覆盖，
> 且能保证「绝不动用户自己的 Chrome」。

## v2.4.3

Date: 2026-10-02

**🔴 修一个真 bug：敌人的辅助技能（治愈 / 强攻 / 净化）此前作用到了**我方**。本版是引擎改动，会改变难度。**

### 修复

**① 根因（单点）** —— `page/battle-group.js` 的 `selectTargets(gb, actor, skillDef)` 里：

```js
var enemies = gb.enemies.filter(...);   // 玩家对面
var allies  = gb.allies.filter(...);    // ← 恒等于「玩家方」，与 actor.side 无关
if (target === 'ally1') { ... healTargets = allies ... }   // 敌方施法也走这里
if (target === 'ally2') { ... pool2 = allies ... }
```

`ally1` / `ally2` 两个分支**直接用写死的「玩家方」当候选池**，没有按施法者阵营取 —— 于是敌方施放
「治愈 / 强攻 / 净化」时，目标 100% 落到我方。**这不是设计**：设计文档 `doc/2.0 敌群设计.md` 第 160~171 行
（这三个技能的定义处）写的是「解除**我方**场上 1 名普通-高级的负面状态」「使**我方**随机 1 名角色恢复生命值」
「使**我方**除自身外一名角色攻击提升」——这里的「我方」是**施法者自己一方**。

**② 证据** —— 直接调引擎 `selectTargets`，对每个敌方技能用**敌方施法者**采样：

| 技能 | `target` | 修前 | 修后 |
|---|---|---|---|
| `heal` 治愈 | ally1 | **ally ×40** ✗ | enemy ×40 ✓ |
| `empower` 强攻 | ally1 | **ally ×40** ✗ | enemy ×40 ✓ |
| `cleanse` 净化 | ally1 | **ally ×40** ✗ | enemy ×40 ✓ |
| 伤害类（`all` / `random1` / `enemy*`） | — | ally ✓ | ally ✓（未变） |
| `taunt` / `chargeup` / `shrink` | self | self ✓ | self ✓（未变） |
| 宠物 `p_holylight` / `p_warmight` | ally1 / ally2 | ally ✓ | ally ✓（未变 —— 宠物本就在我方） |

真实战报旁证（作者提供）：`【回合 1】精英·火枪手: 💚 精英·火枪手 → 闪闪星 治疗 +178`（敌人给我方宠物回血）；
以及本会话早先日志里的 `🛡️ 精英·冰法师 强攻 → 🧑 你 攻击 +50%`（敌人给我方加攻）。

**③ 影响面** —— `SKILLS_HIGH` 17 个技能里占 3 个；精英抽 1~2 个、Boss 抽 2~3 个 → 大多数关卡至少一个敌人带这类技能。
抽样 96 个小关（每 3 个取 1）实测：**18 个关卡（19%）**出现过敌方发动的治疗/增益，共 **47 次**事件；
修前这些事件全部落在我方（等于**敌方的奶/增益/净化长期在给玩家打工**，难度被系统性低估），修后 30 次落到敌方、0 次落我方。

**④ 修法（一处根因，不扩散）** —— 在 `selectTargets` 顶部按阵营派生两份候选：

```js
var mates = (actor.side === 'ally' ? gb.allies : gb.enemies).filter(u => u.hp > 0);
var foes  = (actor.side === 'ally' ? gb.enemies : gb.allies).filter(u => u.hp > 0);
```

`ally1` / `ally2` 用 `mates`；`all` / `enemy1` / `enemy2` / `enemy12` / `random1` 用 `foes`（语义不变、只是把已有的正确写法复用到这两支）。
**同类问题扫描结论**：本文件另外 **27 处**阵营判断（70 / 117 / 238 / 372 / 578 / 791 / 834 / 850 / 951 / 1062 / 1083 /
1130 / 1131 / 1152 / 1177 / 1183 / 1184 / 1227 / 1258 / 1259 / 1276 / 1294 / 1295 行）**本来就写对了**
（`actor.side === 'ally' ? gb.enemies : gb.allies`）→ 这是一处**单点缺失**，不是系统性缺陷，故只改这一处。

### 难度影响（如实说明，未做数值补偿）

- 敌方辅助技能开始真正帮敌方：敌方的治疗/增益/净化不再落到我方 → **部分关卡变难**（尤其带「治愈 / 强攻」的精英与 Boss）。
- 本版**没有**同时调整任何数值、概率、成长公式来「补偿」这次修复 —— 难度变化是修复的**直接后果**，
  要不要回调（例如降低精英携带辅助技能的概率）应由作者看过实际体感后再决定。
- 抽样里 19% 的关卡会立刻感受到变化，其余关卡的行为**逐事件不变**。

### 测试与版本三项

- `scripts/test-group-battle.js` 新增第 8 节 **12 条断言**（14 → **26 断言**）：对敌我两种施法者分别采样 60 次统计选靶阵营，
  覆盖 `heal` / `empower` / `cleanse`（敌方不得选到我方）、`heal` / `cleanse`（我方仍选我方，防修坏）、
  4 个伤害类技能（敌方仍打我方）、`taunt`（仍指向自身），外加两条源码守卫（必须含 `mates`/`foes` 派生、
  不得再出现 `drawRandom(allies` / `healTargets = allies` 这类旧 bug 形态）。
- **变异验证**：把 `mates` 改回 `gb.allies`（复现旧 bug）→ **3 条红**（`{"ally":60,"enemy":0}`），
  逐字节还原后复跑 **26/26 绿**。
- `scripts/test-pet-talents.js` **口径更新**：它的 §3.10「威压领域 E2E」此前**在注释里明写依赖这个 bug**
  （「⚠️ 口径说明：`selectTargets('ally1')` 恒从 **gb.allies** 取目标，故要让『敌方治疗』落到 aura 的判定面内……」）
  → 修后敌方治愈治的是敌方自己，故把施法者换为**我方治疗者**。这**不改变该用例要验的东西**：
  `onFoeHeal` 的派发看的是**被治疗者**阵营（`battle-group.js` 的 `foes = (t.side === 'ally' ? gb.enemies : gb.allies)`），
  被治疗者仍是我方 vict，参与判定的仍是**敌方**的威压领域持有者；期望值（×0.8 / ×0.9）逐字未改。全量 **57 套件全绿**。
- `APP_VERSION` `2.4.2` → **`2.4.3`**；`page/index.html` 缓存戳 **`?v135` → `?v136`（52 处，BOM 保持 `EF BB BF`）**；
  版本三项（`page/utils.js` / `page/index.html` / `README.md` / 本 changelog + 架构演化表）已同步。

### 本次新增 / 修改文件

**新增**：无。

| 文件 | 变化 |
|---|---|
| `page/battle-group.js` | `selectTargets` 按施法者阵营派生 `mates` / `foes`（1306 → 1316 行，含说明注释） |
| `scripts/test-group-battle.js` | 新增第 8 节 12 条断言（14 → 26） |
| `scripts/test-pet-talents.js` | §3.10 用例口径更新（不再依赖旧 bug 的构造，期望值不变） |

> ⚠️ **这是 v2.4.0~v2.4.2 之后的第一个引擎侧改动**（那三版都是纯展示层）：固定种子 `gb.log` 会**变**，
> 这是内容/行为修复的必然结果，不再声称逐字节一致。

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
| v2.4.0 | 51 | 1949 行 game-render.js | 群战 UI 战斗表现重构（行动横幅 / 行动焦点 / 打击飘字 / 结算统计 / 日志筛选 / 布局收口），纯展示层，引擎零改动 |
| v2.4.1 | 51 | 1949 行 game-render.js | 🔧 修 `group-levels.js` 的 `SKILLS_LOW` **死池**（补杂兵分支：50% 概率带 1 个低级技能，走关卡既有 `rng`，种子确定性不变）；**本版未改 `game-render.js` / `enemy.js`** —— 该行行数按**本版实测**复核为 **1949**（同表 v2.4.0 行记的 1813 是当时的记录值，历史行不改写，差异见下方说明） |
| v2.4.2 | 51 | 2207 行 game-render.js | ⚔️ **群战战场化重构**（垂直卡片列表 → 上下对阵舞台）+ 技能专属特效（`bubble.skillId` → 既有 48 枚图标）+ 中央特效区（飘字与技能名上下分层）+ 日志抽屉（52vh、可隐藏）+ 开场刷屏一句话；**纯展示层，引擎零改动**，固定种子 `gb.log` 与 v2.4.1 基线逐字节一致 |
| v2.4.3 | 51 | 2207 行 game-render.js | 🔴 **修敌人辅助技能作用到我方**的真 bug（`selectTargets` 的 `ally1`/`ally2` 写死了玩家方 → 敌方「治愈/强攻/净化」100% 落我方；实测 40/40，19% 关卡受影响）→ 按施法者阵营派生 `mates`/`foes`；新增 12 条选靶断言 + 变异验证；`test-pet-talents` §3.10 口径更新（不再依赖该 bug）。**引擎改动，未做难度补偿**；`battle-group.js` 1306 → 1316 行（最大文件仍是 game-render.js 2207） |

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
> 「最大文件」v2.4.0 **按逐字节核算复核（Node 读 git blob，避开 PowerShell 文本层）：`page/` 下 `*.js` 共 51 个文件、`page/game-render.js` 1949 行**
> （v2.3.3 行记的 50 / 1348 是改前值，本版不改写历史行）。
> **本版只新增 `scripts/test-group-ui-presentation.js`，它不在 `page/` 内**，
> 故「JS文件数」51 与上一行的计数一致，未发生增减。
> 说明：`page/game-render.js` 由 1486 行增至 1949 行，**净增 463 行全部是渲染/解析/样式注入代码**，
> 不含任何战斗数值或引擎逻辑（引擎文件本版零改动，见上）。

> 「最大文件」v2.4.1 **本版按逐文件实测复核：`page/` 下 `*.js` 共 51 个文件、最大为 `page/game-render.js` 1949 行**
> （本版**未改 `game-render.js`**，也未新增 / 删除 `page/` 下的任何文件，故文件数 51 与相邻行一致）。
> ✅ **v2.4.0 行数已勘误（本版就地修正 1813 → 1949）**：v2.4.0 行原记「1813 行」是一次**测量错误** ——
> 当时用 PowerShell `Get-Content` 取行数，读数偏低（同一次里改前基线被读成 1392，真值 **1486**）。
> 本版改用 **Node 逐字节核算**（`git show <rev>:page/game-render.js` 取 Buffer 后按 `\n` 切分）复核全部相关 rev：
> `1faca02`（v2.4.0 前）**1486** 行 → `a45756b`（v2.4.0）**1949** 行 → 本版 HEAD 仍 **1949** 行
> （v2.4.1 **未改** `game-render.js`，故与 v2.4.0 相同），净增 **463** 行。
> 属**事实勘误**而非重写历史结论（沿用本表 v2.2.29 把 1348 更正为 1409 的先例）。
> 教训：**本项目的行数/字节数一律不要用 PowerShell 文本层读**，用 Node 读 Buffer（同一次会话里它把 1486 读成 1392、把 1949 读成 1813）。
> v2.4.1 自身的改动只有 `page/group-levels.js`（+13 行）与 `scripts/test-group-levels.js`（+66 行），
> 两者都不是 `page/` 下的最大文件。

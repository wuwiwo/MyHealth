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

## v2.4.4

Date: 2026-10-02

**🧹 折叠「蓄力」那条自相矛盾的文案（战报与日志页）。纯展示层 —— 引擎零改动。**

### 修复

**① 问题（作者在战报里发现）** —— 「📋 复制」出来的战报（`groupLogText`，作者贴的那份 `【回合 N】行动者: …` 格式）
在同一条目里出现：

```
【回合 1】梦幻: ✨ 灵感涌动: 黑暗鸦 魂攻 +20%；⏳ 梦幻 蓄力（梦幻光球，下回合释放）；蓄力完成!；⏳ 梦幻 的【蓄力】结束
```

同一秒既说「**下回合释放**」又说「**蓄力完成!**」「**【蓄力】结束**」—— 读起来像蓄力当场消失。

**② 但机制是对的（实测）** —— 用真战斗核过：`【回合 2】Boss·暗龙: 🔋 … 进入蓄力（承伤 +25%，下回合结算 攻击×400%）`，
紧接着 `【回合 3】Boss·暗龙: 💥 Boss·暗龙 蓄力重击 → 🧑 你 1280 伤害` —— **伤害确实在下回合打出**。
矛盾来自实现：蓄力状态在**进入的当回合**就被状态到期流程消费（于是同一 `events` 数组里立刻出现「完成/结束」），
而释放走的是另一条调度。

**③ 修法（只改显示，唯一实现）** —— 新增纯函数 `gbDropChargeNoise(events)`：
同一条目里**若已有**「蓄力（…）」这个进入事件，就把紧随其后的 `蓄力完成…` 与 `…【蓄力】结束` 过滤掉；
**没有进入事件的条目逐字不动**（不误伤普通的 `expire`，例如「⏳ X 的【攻击提升】结束」）；
下回合那条 `💥 … 蓄力重击 → … 伤害` **照常保留**。
**日志页（`gbLogEntries`）与战报文本（`groupLogText`）共用本函数**（源码守卫：该函数全仓只有一个实现，
且两处都必须调用它）—— 避免「日志页折叠了、战报没折叠」这类分叉。

### 测试与验证

- `scripts/test-group-ui-presentation.js` 新增第 15 节 **17 条断言**（311 → **328**）：
  折叠正确性（2 条到期文案被丢）+ **不误伤**（无进入事件的条目逐字不动、普通 expire 保留、null 输入安全）
  + 机制见证（下回合释放伤害保留）+ 战报文本真输出（`【开场】/【回合 N】` 格式不变、`蓄力（` 保留、
  `蓄力完成` / `【蓄力】结束` 不再出现、开场条目逐字不变）+ 日志页与战报共用同一过滤器（3 条源码守卫）。
- **真浏览器验证**（自建 CDP 驱动跑 `g7-10` 真战斗到结束，再读 `groupLogText(_groupBattle)`）：
  `hasEnter=true, hasDone=false, hasEnd=false`，战报里保留
  `【回合 2】… 进入蓄力（承伤 +25%，下回合结算 攻击×400%）` 与 `【回合 3】… 蓄力重击 → 🧑 你 1280 伤害`。
- 全量 **57 套件全绿**。

### 本次新增 / 修改文件

**新增**：无。

| 文件 | 变化 |
|---|---|
| `page/game-render.js` | 新增 `gbDropChargeNoise`（纯函数）+ `groupLogText` / `gbLogEntries` 接入（2207 → **2230 行**） |
| `scripts/test-group-ui-presentation.js` | 新增第 15 节 17 条断言（311 → 328） |

> ✅ **本版未改动任何引擎文件**（与 v2.4.3 不同：那版是引擎修复、会改难度；本版只折叠显示）：
> `battle-group.js` / `unit.js` / `talent.js` / `skill.js` / `status-defs.js` / `affix.js` / `battle.js` /
> `terrain.js` / `ai.js` / `group-levels.js` / `group-progress.js` / `enemy.js` 在本版提交里逐字节未变。

---

## v2.4.5

Date: 2026-10-03

**🔄 战斗阶段化：把每回合拆成「准备阶段 / 行动阶段 / 判定阶段 / 结束阶段」。引擎改动（时序重构）—— 会改变部分可观测行为。**

作者原话：「战斗生效阶段修改 —— 每个回合拆分为准备阶段、行动阶段、判定阶段、结束阶段，例如梦幻: ✨ 灵感涌动
是在准备阶段触发的，这样会影响行动阶段的角色」。逐条裁定见 `doc/plans/战斗阶段化-技能与天赋清单.md` 的 **§10**。

### 新增功能

**① 四阶段模型与冻结契约** —— `battle-group.js` 新增小节（`GB_PHASES` / `enterPhase` / `logPhase`）：
- `GB_PHASES = ['准备','行动','判定','结束']`（顺序固定，导出到 `window` / `globalThis`）；
- `gb.phase` = 当前阶段，**唯一写入口 `enterPhase()`**；
- **每条 `gb.log` 条目都带 `phase`**，且全文件**唯一**的落日志入口是 `logPhase()`（已无裸 `gb.log.push`）。

**② 四个阶段的职责**
| 阶段 | 频率 | 内容 |
|---|---|---|
| 准备 | 每回合一次（队列建立前） | 场地 `onTurnStart`、冰魄余威、**回合开始类效果**（`inspiration` 灵感涌动 / 玩家 `vitality`·`momentum`·`spotlight`①·`qifeng`①）、**诅咒类**（哈欠 / 末日 / 遗言 / 幻影之瞳）、`slowstart`/`lazy` 的「本回合能否行动」判定；**最后**才 `refreshAllStatMods` + `buildActionQueue`（否则加成/减速影响不到出手顺序） |
| 行动 | 按队列逐个单位 | `onBeforeAction`、技能/普攻、目标选择、伤害/治疗/护盾、状态**施加**、`onAfterAction`（疾影额外行动）、破盾反伤、启风②、**蓄力释放** |
| 判定 | 每回合一次（队列之后） | 状态 `onTurnEnd`（中毒 / 潮湿 / 睡眠回复）、天赋与词条 `onTurnEnd`（振翅 / 再生 / 灵感收尾 / 生长词条）、玩家 `playerSkillTurnEnd`（瞩目回复）、**duration 递减与到期** |
| 结束 | 每回合一次 | 场地 `onTurnEnd`、回合级守卫清理、**胜负判定**（分出胜负时把 `gb.phase` 推到「结束」） |

**③ 逐条分类（**不整体搬 hook**）** —— 关键实现决定：`onTurnStart` **不能整体搬**，因为「纯被动」的 `vengeance` 复仇、
`intimidate` 的解除分支也挂在它上面（裁定 §10-3）。故改为**逐条分类**：
`status-defs.js` 给 `sleepy`/`doomed`/`lastworded`/`confused` 打 `phase:'prepare'`；
`pet-codex.js` 给 `inspiration` 打 `phase:'prepare'`；其余留在自然触发点。
**留在行动阶段**的还有：`possessed` 附身侵蚀（裁定 §10-2 附身类）、全部状态 `onBeforeAction`（反应式控制：
冰冻/畏缩/睡眠/禁技 —— 预判到准备阶段会让**同回合新挂的控制全部失效**）、`tickSkillCooldowns` / `_hitModTurns`（刻意不搬）。

**④ 显示侧**（`game-render.js` / `index.css`）
- 日志页按**四阶段分组**（只渲染有事件的阶段，空阶段不出标题）；
- 行动横幅新增**阶段徽标**（`ph-0..3` 四档色，横幅仍 ≤44px）；
- 战报文本（「📋 复制」/「📋 复制战报」的**唯一来源** `groupLogText`）输出 `【回合 1·准备阶段】…`；
- **兜底**：`phase` 缺失/非法时退回改造前的渲染（已用 SHA256 证明「无 phase 日志」的输出**字节等价**：`9F0FE75E…`）。

**⑤ 两条推进路径统一** —— `groupBattleTick`（测试用）与 `groupBattleStep`（线上）改为**共用同一组 helper**
（`runPhasePrepare` / `runUnitActionStep` / `runPhaseAction` / `runPhaseJudge` / `runPhaseEnd` / `finishRound`）；
同种子下两条路径的**完整日志逐字节一致**（测试 §8 断言）。

### 修复

**① 两条推进路径行为不一致** —— `groupBattleTick` 此前**没有**启风②、冰魄余威、金身护盾破盾反伤
（实测 v2.4.4：tick 路径 0 次 → v2.4.5：各 1 次）。现已同源。
**② 跳过行动的单位的回合末结算被早退吞掉** —— 旧实现在 `skipAction` 分支直接早退，导致
**被冰冻单位身上的中毒 dot 完全不结算**（实测 0 次）。判定阶段改为「每回合一次、逐存活单位」后，
dot 正常结算（实测 0 → 1 次）。
**③ 战斗结束时 `gb.phase` 停在「行动」** —— 分出胜负时现在会推到「结束」，UI/日志拿到自洽的收尾阶段。

### 行为变化（如实说明，**会影响强弱**）

1. **跳过行动的回合也会结算 dot/duration**（见上，0 → 1 次；该单位当回合掉血 1 → 401）。
   这是「dot 在判定阶段结算」裁定的直接推论 —— 若作者要保留旧口径，最小改法是让判定阶段跳过
   `_prepSkipTurn === gb.turn` 的单位。
2. **回合开始类效果覆盖整回合** —— 作者的原始诉求成立：更慢出手的我方单位在**行动阶段**也能吃到
   `灵感涌动` 的加成（主控独立实测：慢受益人 魂攻 **100 → 120**；对照组无梦幻保持 100）。
3. **诅咒类在准备阶段结算、附身仍在目标自己的行动阶段开始时**（裁定 §10-2）。
4. **末日 / 遗言的结算次数 = 4 次 / 7 次**（= 各自 duration），**与 v2.4.4 完全一致 → 零强度变化**。
   作者原预判「≤3 / ≤6」经实测**不成立**，已裁定**保持实测值**（§10-5）；
   取 3/6 会让它们比 v2.4.4 弱 25% / 14%，且会与「duration:1 的哈欠/幻影之瞳 要活到下回合准备阶段」**互斥**。
5. **`slowstart` / `lazy` 的 25% 掷骰从「每次行动」变为「每回合 1 次」**（旧实现下疾影的额外行动会让它一回合掷两次）。
6. **`gb.done` 后不再跑判定阶段**（已定胜负的残局不再掉血），但**结束阶段照跑**。
7. **日志条数显著变多**（每回合不再是「每单位 1 条」，而是 准备×k + 行动×N + 判定×k + 结束×k）→
   日志页「仅最近 8 条」的可见窗口相应缩短（属显示层取舍，需要时另行调整）。

### 技术债（如实记录）

`groupUnitTurn` 保留了一个**独立调用兼容分支**（判据 `gb._roundOpen`）：编排内（真实战斗）只跑行动阶段；
**编排外**（单测/调试脚本直接把 `groupUnitTurn` 当「一整个单位回合」用）保持 v2.4.5 之前的语义。
保留它的原因：有 3 个**原生套件**（`test-status-lifecycle` / `test-pet-skills` / `test-talent-growth`）
以「一次调用完成整个单位回合」为前提，改它们超出本次写域。**替代方案**：删掉该分支，把那 3 个套件改为手动补一次判定阶段。

### 测试与验证

- **全量 58 套件 0 红**（57 既有 + 新增 `scripts/test-battle-phases.js`；该套件 **64 条断言全绿**）。
- 新套件覆盖：契约（顺序/导出/每条日志带 phase/建场初值）、四阶段序列与回合内单调、灵感涌动（慢受益人 100→120 +
  快受益人 + 每回合只派发 1 次）、诅咒类→准备、附身→行动、判定阶段 dot/到期/振翅/睡眠回复、蓄力释放→行动、
  末日/遗言次数（4/7 + duration 未改 + 发动当回合不递减）、两条路径日志逐字节一致、`groupBattleStep` 返回的 phase 合法。
- **变异验证**（引擎 4 条 + 显示 3 条，均逐字节还原后复跑全绿）：M1 灵感涌动改回每单位 → 慢宠断言红；
  M2 取消状态准备阶段分类 → 14 条红；M3 dot 留每单位 → 判定阶段断言红；M4 去掉 duration 例外 → 得到 3/6 但哈欠/迷惑红；
  显示侧：空阶段也渲染 / 删兜底早退 / 完全无兜底 → 分别 4 / 1 / 5 条红。
- **主控独立验证**（不采信执行者自述）：阶段契约实测「日志条目全带合法 phase」、阶段序列**严格递增**、
  灵感涌动慢受益人 100→120、末日/遗言真实日志 4 / 7 次、蓄力释放仍在行动阶段。
- **真机回归**（自建 CDP 驱动 + headless Chrome）：日志页四阶段标题齐全、行动横幅 32px（≤44）且徽标落在内部、
  战报首行 `【开场·准备阶段】`、抹掉全部 `phase` 后回到旧渲染且无 `undefined`、无横向溢出。

### 本次新增 / 修改文件

**新增**：`scripts/test-battle-phases.js`（560 行 / 64 断言）。

| 文件 | 变化 |
|---|---|
| `page/battle-group.js` | 1316 → **1660 行**（四阶段编排 + 两条路径统一 + 三处行为修复） |
| `page/game-render.js` | 2230 → **2353 行**（阶段分组 / 阶段徽标 / 战报带阶段 / 兜底） |
| `page/status-defs.js` | +4 个状态打 `phase:'prepare'`（sleepy / doomed / lastworded / confused） |
| `page/pet-codex.js` | 仅 `inspiration` 打 `phase:'prepare'`（未动其它数值） |
| `page/player-skill-hooks.js` | **仅注释**（函数体一字未改） |
| `page/index.css` | 阶段徽标与阶段标题样式（全令牌、无 `!important`） |
| `scripts/test-group-ui-presentation.js` | 追加第 16 节（328 → **386** 断言） |

> ⚠️ **这是引擎改动**（继 v2.4.3 之后再次动引擎）：固定种子 `gb.log` **会变**（阶段化 + 上述行为修复的必然结果），
> 不再声称与上一版逐字节一致；本版没有改任何**数值/概率/公式**，`duration` 也一字未改。

---

## v2.4.6

Date: 2026-10-03

**🧹 还技术债：`groupUnitTurn` 恢复单一语义（纯重构，线上行为零变化）。**

### 修复 / 重构

**① 删掉「同一函数两种含义」的兼容分支** —— v2.4.5 把回合末结算（dot / duration 递减 / 到期）搬进**判定阶段**后，
`groupUnitTurn(gb, actor)` 保留了一个隐藏开关（判据 `gb._roundOpen`）：编排内只跑行动阶段，**编排外**
（单测/调试脚本把它当「一整个单位回合」用）就多跑一遍回合末收尾。本版**删除该分支的全部 7 处**：
玩家技能回合开始派发、天赋/状态 `onTurnStart` 的三元分流、`tBefore` 慢启动二掷、skip 分支内的就地 `ageStatuses`、
迷惑三选一、末尾的 `runUnitJudgeTail`。现在它**只有一种含义：只跑行动阶段**，回合末结算一律归判定阶段。
`runUnitJudgeTail` 同步去掉 `ageFn` 参数（固定走 `ageStatusesInJudge`，只剩 `runPhaseJudge` 一个调用方）。
`gb._roundOpen` 保留，但用途收敛为**纯粹的编排标记**（`groupBattleStep` 用它区分「新回合第一步」与「同回合后续单步」），已在注释里写明。

**② 两个套件改用正确用法**（第三个本就不需要）——
- `scripts/test-pet-skills.js`：新增 `unitTurn(gb, actor)` = `runUnitActionStep` + `runPhaseJudge`，14 处调用替换；
- `scripts/test-status-lifecycle.js`：新增 `unitActionTurn`（行动+判定）与 `unitFullTurn`（准备+行动+判定，
  只给迷惑三选一用，因为三选一已归准备阶段），15 处调用替换；
- `scripts/test-talent-growth.js`：**未改** —— 它一直用 `groupBattleStep`（早就是四阶段编排），不存在需要迁移的调用点。

### 验证（决定性证据：线上行为零变化）

本版是**纯重构**，因此验收标准不是「测试过」，而是**「固定种子日志与 v2.4.5 逐字节一致」**：

| 关卡 | worktree bytes | sha256（worktree 与 v2.4.5 基线**相同**） |
|---|---|---|
| `g7-10` | 7175 | `ff13e435fe236157f2b9e0ce2cdca2f844921e366a8dcc85dac9f67165a78c91` |
| `g2-1` | 117 | `08e47692e4dce78f63541b0d12e2e1dd37ad18b745a9dbcc43cb6aa8ddb595fa` |
| `g12-10` | 7954 | `f0780eda9532955d9c635d9c8795cb0c0e71eb692e33f87adace2e6bd1ba7987` |

- 全量 **58 套件 0 红**；`test-battle-phases` 64/64、`test-group-ui-presentation` 386/386。
- **断言未弱化**：两个被迁移套件的**断言名集合逐条比对，diff = NONE**（105 → 105、99 → 99），全绿。
- **变异验证 4 条**（均逐字节还原后复跑全绿）：M1 判定阶段不再递减 duration → status-lifecycle 98/7 红、pet-skills 红；
  M2 把兼容分支恢复回去 → status-lifecycle 104/1 红（duration 被扣两次）；M3 去掉判定阶段的天赋 `onTurnEnd` 派发 →
  talent-growth 53/54、battle-phases 63/1 红；M4 判定阶段整体跳过 → 四个套件全红。
- 源码守卫：`groupUnitTurn` 定义**只有 1 处**，`standalone` **残留 0**。

### 本次修改文件

**新增 / 删除**：无。

| 文件 | 变化 |
|---|---|
| `page/battle-group.js` | 1660 → **1638 行**（删除 7 处兼容分支，恢复单一语义） |
| `scripts/test-pet-skills.js` | 575 → 586 行（新增 `unitTurn` helper，14 处调用迁移） |
| `scripts/test-status-lifecycle.js` | 584 → 616 行（新增两个 helper，15 处调用迁移） |

> ✅ **技术债结清**：v2.4.5 记录的那条「同一函数两种含义」技术债，本版已还清。
> 另注：`test-battle-log-audit`（21/21）与 `test-talent-fixation`（78/78）也直接调用 `groupUnitTurn`，
> 删分支后仍全绿 —— 已核实它们的用例只依赖行动阶段内的派发（嘲讽复位 / 天赋 `onTurnStart` 的非 prepare 分支 /
> `onBeforeAction` 的 `multiTarget`），可作为「新语义兼容既有调用点」的旁证。

---

## v2.4.7

Date: 2026-10-03

**🔧 修 4 条「写了但没生效」的引擎缺陷**（来自 `doc/plans/战斗阶段化-技能与天赋清单.md` §8.5 第 1 / 2 / 10 / 13 条）。
本版**会改强弱**：四条全部让敌方变强（见下方 A/B 数字）。

### 修复

**① 先制度 `priority` 根本不进出手队列**（§8.5-1）—— `buildActionQueue` 排序只调 `unitInitiative(u, null)`，
而 `unitInitiative` 里的 `priority × 50` 分支因第二实参恒为 `null` **永不命中**；`priority` 只被 `ai.js` 的选技评分读到，
**而技能详情 UI 一直写着「出手队列中优先行动」**。
改法：新增 `unitPriorityRank(u)`（= 该单位**可用**先制技能的最大 `priority`，走 `usableSkills` 口径：未冷却、未被附身禁技；**不掷骰**），
`buildActionQueue` **先比先制档、同档再走原有「有效速度降序 + 既有 tie-break」**。
依据 `doc/2.0 敌群设计.md`：先制度写在**技能**上（击掌奇袭 / 冰冻三尺 / 幽魂附身 各 +1），且「反转场地」注明
「先制度技能不受影响」→ 先制与速度**正交**，故未沿用 `+priority×50` 的旧写法。
不变式：档高者先于所有低档；同档规则**一字未动**；冷却中的先制技能不算；**不消耗 `gb.rng`**（同种子可复现，有断言）。
UI 文案在实现后已正确 → **未改**；`ai.js` 也**未改**。

**② 懒惰 `lazy` 的减伤不生效**（§8.5-2）—— `talent.js` 无条件产出 `dmgReduce`，而该键唯一消费点在普攻**攻击方**循环；
受击方三个通道（物理 / 普攻附带魂伤 / 技能）都不消费 → 恒等于「没有减伤」。
改法：生产端加受击方守卫（与 `affix.js` 减伤词条同一约定），受击方三处按 `×（1−v）` 消费。
顺带锁死「攻击方带 `_lazySkip` 标记时不会削自己造成的伤害」。

**③ 末日「普攻伤害减半」不生效**（§8.5-13）—— `doomed` 产出 `dmgDealtHalf`，但状态钩子只在**该单位是受击方**时派发，
而唯一的消费点位于**攻击方**的天赋循环内 → 没有生产路径。
改法：普攻攻击方侧补一次**状态**派发，且**只消费 `dmgDealtHalf`**（避免把受击方语义的 `dmgTakenBoost/Reduce` 错当攻击方修正）；
同时给 `freeze` 的 `onDamage` 加 `isPlayerAttack` 守卫，杜绝「出手者把自己解冻」。
技能通道**不消费**（末日自带禁技，普攻才是它的出手方式；蓄力释放属技能，按设计不减半）。末日其余三项（禁技 / 治疗阻断 / 回合开始伤害）**未动**。

**④ 词条「疾影」的额外行动实际 ≈24.75%**（§8.5-10 + §8.6 的「`onAfterAction` 双重派发」历史遗留）——
`onAfterAction` 被**派发两次**：内层只取 events、丢弃 mutations，但 `extra_act` 在返回 mutation 的同时就置 `_extraCd = 3`
→ 外层即使掷中也必被冷却早退；只有「内层掷空(45%) × 外层掷中(55%)」才真触发 = **24.75%**，且内层还会播报一句假文案。
改法：**删除内层派发**，`onAfterAction` 只保留 `runUnitActionStep` 一处，掷骰 / 置冷 / 消费一次完成；额外行动本身不再触发第二次（不连环）。

### 修前 / 修后实测（主控要求逐条量化）

| 条目 | 修前 | 修后 |
|---|---|---|
| 疾影·额外行动率（每次机会，n ≥ 4600） | **24.84%**（n=4621；文档机制值 0.45×0.55 = 24.75%） | **55.06%**（n=5712，95%CI ±1.29pp） |
| 疾影·额外行动率（每回合，12000 回合） | 9.57% | 26.21% |
| 懒惰·同一击掉血（seed 4242，Lv1 减伤 0.20） | 放弃行动 **102** / 无天赋 102 / 未放弃 102 | **81**（= floor(102×0.8)）/ 102 / 102 |
| 懒惰·技能通道（冲撞，同 seed） | 未放弃 200 / 放弃 **200** | 200 / **160** |
| 末日·中末日者**自己普攻** vs 对照（seed 5150） | **203 vs 203**（比值 1.0000） | **101 vs 203**（= floor(203/2)） |
| 先制度·真实 `g8-10` Boss 关队列 | `e0 > e1 > e2(possess) > 玩家` | **`e2(possess) > e0 > e1 > 玩家`** |
| 先制度·覆盖面 | 240 关中 **47 关（19.6%）** 有先制技能敌人（deepfreeze×14 / surprise×21 / possess×15） | 同（实现后才真正生效） |

合成例（否掉「+50 速度」的读法）：非先制玩家 spd**500** vs 先制敌人 spd**1**（possess）→ 修前玩家先手，修后**先制敌人先手**。

### 难度净影响（如实说明）

四条**全部让敌方变强 / 玩家变弱**：末日只由敌方技能 `doom` 施加、懒惰是敌方天赋、疾影是 Boss/精英词条、先制技能也全在敌群技能表。
端到端 A/B（真实建场 + AI + 场地，40 次/关；玩家 atk300 / def40 / hp800 + 2 宠）：

| 大关 | 修前 胜率 / 剩血 | 修后 胜率 / 剩血 |
|---|---|---|
| g1–g5 | 100% / 99→52% | 完全一致 |
| **g6** | **100% / 40%** | **85% / 34%** |
| g7 | 5% / 3% | 5% / 3% |
| **g8** | **15% / 11%** | **10% / 14%** |
| g9–g24 | 0% | 0% |

逐条消融：**末日 −13pp（最明显）> 懒惰 −3pp > 先制度（g8 点名效应，就是那个带 possess 的 Boss）> 疾影 0pp**（疾影当前生产不可见，见下）。
**结论**：难度整体上移，`g6` 一带最明显。是否补偿由作者裁定（补偿需与下面第 5 条一起算）。

### ⚠️ 本版发现但**未修**的第 5 条（比上面四条更重，待作者裁定）

**敌人词条（affix）在真实战斗里一件都没装配** —— `enemy.js` 在未传 `opts.affixes` 时会自动装配
（固定 `cut_boss`/`cut_elite` + 1 条随机额外词条），但紧接着又用 `opts.affixes || []` **覆盖清空**；
而真实建场（`game-render.js`）**没有**把 `group-levels.js` 已生成的固化 affixes 传进去。实测 `createEnemyUnit({tier:'boss'})._affixes === []`。
后果：**伤害减免·大/中、抗扩散、抗技法、战意高涨、铁壁、终末宣告、疾影** 全部不生效（第 4 条「疾影」修得对，但当前生产环境看不见）。
量化：在「词条真装配」的前提下跑同一 A/B，疾影 24.75% → 55% 会让 **g6 胜率从 40% 掉到 5%**（g5 100%→98%，g4 剩血 52%→44%）。
另：`enemy.js` 那条随机额外词条用的是 `Math.random`（**不在战斗种子体系内**），与「战斗可复现」的口径也不一致。
**本版未动它**（`enemy.js` 不在授权写域，且这条一修难度会再上一个大台阶 → 需要作者先决定难度补偿的总体口径）。

### ⚠️ 另一处待裁定：先制度的语义

设计文档只写了「（该）技能先制度 +1」与「先制度技能不受速度反转影响」，**没写清**是「按技能声明」还是「按单位持有」。
出手队列在**准备阶段**建立、而选技发生在**行动阶段**，静态队列无法预知当回合会选哪个技能 →
本版按「**持有可用先制技能即进先制档**」实现（UI/README 口径不变）。
若作者要的是「**本回合真的用了先制技能才先手**」，需要在准备阶段预声明行动（架构级改动）。
另：`page/skills.js`（玩家技能表）目前**没有** `priority` 字段，故先制度当前只覆盖敌群技能。

### 测试与验证

- 新增 `scripts/test-engine-gaps.js`（299 行 / **27 条真断言**）：先制度 7 条（含「spd500 的非先制仍排在先制单位之后」这条否掉旧读法、
  以及「不掷骰」不变式）、懒惰 7 条（含攻击方不自我削伤、技能通道）、末日 7 条（含其余三项回归）、
  疾影 6 条（含「`onAfterAction` 每次单位行动只派发一次」：修前 2 / 修后 1）。
- **全量 59 套件 0 红**（58 既有 + 新套件）；受影响面逐一确认全绿。
- **没有出现「既有断言把旧 bug 当成正确行为」的情况 → 未放宽任何断言、未改任何既有测试文件。**
- **变异验证 4 条**（撤销修复 → 对应断言必红，最后逐字节还原）：M1 撤销先制度分档 → 4 条红；
  M2 撤销懒惰消费 → 2 条红；M3 撤销末日派发 → 2 条红；M4 还原双重派发 → 3 条红（额外行动率回到 **24.84%**）。
  还原后三个引擎文件与修复后快照**逐字节一致**。

### 本次新增 / 修改文件

**新增**：`scripts/test-engine-gaps.js`。

| 文件 | 变化 |
|---|---|
| `page/battle-group.js` | 1638 → **1713 行**（先制度分档 + 懒惰受击方消费 + 末日攻击方派发 + 删除 `onAfterAction` 内层派发） |
| `page/status-defs.js` | 末日的 `dmgDealtHalf` 接线 + `freeze` 的 `isPlayerAttack` 守卫 |
| `page/talent.js` | 懒惰 `dmgReduce` 的受击方守卫 |

> ⚠️ 这是引擎改动：固定种子 `gb.log` 会变（四条修复的必然结果）。本版**没有**改四阶段语义、
> **没有**把 `groupUnitTurn` 的兼容分支塞回去、**没有**动作者裁定（清单 §10）。

---

## v2.4.8

Date: 2026-10-03

**🔌 敌人词条真装配 + 先制度改「真用了才先手」+ 疾影改「每回合 55%」。引擎改动，难度大幅上移。**

作者三条裁定（本次一并落地）：
1. **修敌人词条死接线**（Boss/精英的词条此前在真实战斗里**一件都没装配**）；
2. **先制度改为「本回合真用了先制技能才先手」**（v2.4.7 是「持有可用先制技能即先制」，作者要求按「真用」）；
3. **疾影改为「每回合 55%」**（v2.4.7 是「每次机会 55%」，被 3 回合冷却摊薄成每回合 ≈26%）。
作者对难度的裁定：**不补偿，直接接受**（补偿旋钮已量化留档，见下）。

### 修复 / 重构

**① 敌人词条（affix）真装配（本版难度上移的主因）**
根因：`enemy.js` 的兜底装配（固定 `cut_boss`/`cut_elite` + 1 条随机额外词条）**紧接着被 `opts.affixes || []` 覆盖清空**，
而真实建场（`game-render.js`）**从不传** `affixes` → 线上 Boss/精英 **0 词条**，
伤害减免·大/中、抗扩散、抗技法、战意高涨、铁壁、终末宣告、**疾影** 全部不生效。
改法：
- `createEnemyUnit` **只装配一次** —— 显式 `opts.affixes`（**唯一权威来源仍是 `group-levels.js` 的固化配置**）优先；
  未传则按 tier 兜底（**仅 Boss/精英**，杂兵不装，与 `GROUP_AFFIX_FIXED` 设计一致）；**两条路径都不再被清空**；
- 真实建场把 `group-levels` 已生成的 `ec.affixes` **真传进去**；
- 函数内所有随机统一走 `opts.rng`（缺省 `battleRnd()`）→ **兜底额外词条不再用 `Math.random`**（原实现破坏「同种子可复现」）；
- `group-levels.js` 的锚定路径搬运配置时把 `affixes` 一起搬（消灭分叉）。
**实测**：`g6-10` Boss = `["cut_boss","extra_act","aoe_guard"]`、精英 = `["cut_elite","skill_guard"]` / `["cut_elite","extra_act"]`
（与 v2.4.1 哨兵记录的固化配置**逐项一致**）；同种子两次建场一致；**无词条敌人 0/3**；
**真实建场期间 `Math.random` 调用 = 0 次**（修前同关 3 次且 `_affixes` 全空）。

**② 先制度 = 「本回合真用了先制技能才先手」（架构级）**
根因：出手队列在**准备阶段**建立、而选技在**行动阶段** → 静态队列无法预知选技；v2.4.7 只能按「持有」分档。
改法：**准备阶段预声明本回合行动**（`predeclareActions`）—— **复用同一个 `aiDecide()`**（未另写评分），
只对**敌方**且**持有可用先制技能**的单位声明（无先制技能者分档恒 0，不白掷骰）；声明只存 **技能 id + 目标 id**
（不存活单位引用，否则会进快照的 JSON 克隆变成影子单位）；分档**只看声明**；行动阶段若声明失效
（技能不在 `usableSkills` / 目标全阵亡 / 本回合已消费）→ **当场用同一个 `aiDecide` 重选并继续**（不卡死、不跳过整回合）。
**实测**：`g8-10` 修前「`e2` 每回合都先手」→ 修后「**只在该回合真的声明了 `possess`（先制 1）时才先手**」
（回合 1 它声明 `spikes`（先制 0）→ 排在 `e0/e1` 之后；回合 2 声明 `possess` → 跳到最前）。
240 小关同种子扫描：只开本项 → **2/240 关**（2/622 回合）队列变化，全部落在「带先制技能敌人的 47 关」内。
**失效回退率 0 / 3180 次声明（0.00%）**；埋点自证：强制让失效判据恒为 false 后回退率 98.4%（证明 0% 不是埋点失效）。
AI 决策质量的代价：声明用「准备阶段末端」的盘面，比修前少看**本回合更早出手单位的行动结果** →
实测边际 **0.0pp**（40×24 场，逐关完全相同），`gb.rng` 消耗 79.37 → 79.41 次/场（+0.05%，只是**消耗时点前移**）。
**连带必修**：`groupSnapshot`/`groupRestore` 增加队列位置与声明（`queueIds/queueIdx/roundOpen/declaredTurn/qifengTurn` + `gb._resume`）——
预声明把 rng 消耗前移后，`test-group-determinism` 的「回滚后重跑到结束、终点一致」暴露该断言原本**靠运气**
（修前实测：首次剩血 3673/902 vs 回滚重跑 3609/993，本就不是同一结局）。现在回滚**续跑本回合剩余队列** →
「回滚重跑」与首次**血量逐项相同**，断言由「碰巧绿」变成「结构性绿」。

**③ 疾影 = 每回合 55%**
根因：触发后 `_extraCd = 3` 且每回合末递减 → 触发一次锁 3 回合，把「每次机会 55%」摊薄成每回合 ≈26.21%。
改法：取消跨回合冷却，改用「本回合已判定过」守卫（`_extraActTurn`，取 `ctx.turn`）防重复派发抬概率 / 防连环；
删掉自己的 `onTurnEnd` 递减；描述改为「每回合有 55% 几率额外行动 1 次」。
**隔离核实**：`_extraCd` / `extraAction` 全项目**只有本词条**写/读（启风走 `_qifengTurn`/`qifengExtraAttack`），
已加源码扫描断言守卫；`affix.js` 里 `_extraCd` 只剩注释 2 处、**无写入**。
**实测：12000 回合触发 6601 次 = 55.01%**（95%CI ±0.89pp；修前 26.21%）；连续两回合都触发 3645 次（修前**恒为 0**）。

### 难度影响（作者已裁定：**不补偿，直接接受**）

口径：真实建场 + AI + 场地；玩家 atk300/def40/hp800 + 2 宠（SR 清脆鸟 + SSR 小冰晶）；每大关取第 10 小关（Boss 关）；各变体同组固定种子。
⚠️ **与 v2.4.7 changelog 的表不可直接相减**：v2.4.7 的台架**没有传场地**、宠物是裸 `createUnit`（无技能/天赋），
故修前基线在 v2.4.7 表里是「g6 85% / g7 5% / g8 10%」，在本表里是「g6 98% / g7 27% / g8 39%」。

**逐条消融（40 次/关）**：
| 变体 | 平均胜率 | 平均剩血 | g6 胜率/剩血 | g7 | g8 |
|---|---|---|---|---|---|
| 修前 | 28.3% | 18.4% | 100% / 36% | 45% / 9% | 35% / 4% |
| 只开 ①词条 | **21.5%** | 14.6% | **15% / 1%** | 0% | 0% |
| 只开 ②先制度 | 28.5% | 18.4% | 100% / 36% | 45% / 9% | 40% / 4% |
| 只开 ③疾影 | 28.3% | 18.4% | 100% / 36% | 45% / 9% | 35% / 4% |
| **三者合并** | **21.0%** | 14.2% | **3% / 0%** | 0% | 0% |

**读法**：难度上移**几乎全部来自 ①词条接线**；②先制度边际 **0.0pp**；③疾影只有在「词条已装配」的世界才可见，
其边际 = g6 15% → 3%（−12pp）、平均 21.5% → 21.0%（**修前世界里疾影 0pp**，与 v2.4.7 的判断同源）。
**240 小关全量（9600 场）**：修前 51.8% / 45.8% → 修后 50.4% / 44.2%（非 Boss 关几乎不变，难点集中在 g6–g9）。

**补偿旋钮（本版未应用，供日后决定）**：
| 候选 | 平均胜率 | g6 | g7 | g8 |
|---|---|---|---|---|
| 无补偿（现状） | 20.9% | 2% | 0% | 0% |
| 敌方属性 ×0.95 | 21.0% | 3% | 1% | 0% |
| 敌方属性 ×0.90 | 21.3% | 6% | 4% | 0% |
| **词条数值 ×0.5** | 22.6% | **38%** | 4% | 1% |
| **词条数值 ×0.25** | 24.7% | **74%** | 11% | 8% |
- **属性缩放对胜率几乎无效**（g6 2%→3%/6%），但明显改善 g3–g5 剩血（g4 46%→58%、g5 32%→46%）；
- **词条系数才是把 g6 拉回来的旋钮**，且要 ×0.25 才接近修前（74% vs 98%）；**g7/g8 即使 ×0.25 也只回到 11%/8%**（修前 27%/39%）→ 这两关若日后要救，得另想办法（例如按大关缩放词条强度）。
- 实现位置（若日后要拧）：词条 → `page/affix.js` 建议引入统一常量 `AFFIX_VALUE_MUL`；属性 → `page/group-levels.js` 的 `genEnemyCfg`。

### 已知残留（如实记录）

1. **真实建场里「杂兵」的兜底天赋/技能抽取仍走 `Math.random`**（实测 g6-1 = 2 次、g6-4 = 3 次）——
   因为建场早于 `createGroupBattle`（`_BATTLE_RNG` 还是 null）。本版给的出口是 `opts.rng`；
   要「整场建场可复现」需在建场前就 `beginBattleRng(seed)`，或给杂兵固化 talents/skills（**超出本版授权**）。
   Boss/精英路径已 **0 次** Math.random。
2. **我方（玩家/宠物）不参与预声明** → 我方持有的先制技能不会进先制档；当前全表只有 3 个**敌群**技能带 `priority`
   （已加守卫断言），无可观测差异；将来给我方技能加先制度时必须一并接上。
3. **疾影的判定点是「本回合行动结束」**：被冰冻/睡眠/慢启动**跳过行动**的单位也会走 55% 判定
   （额外行动什么都不做，只多一条「无法行动」日志）。这是修前口径，本版未动。

### 测试与验证

- 新增 `scripts/test-engine-wiring.js`（358 行 / **42 条断言**，其中 **17 条修前必红**）：
  词条 18 条（兜底不再被清空 / 精英 cut_elite / 建场真传 affixes 的源码级断言 / 同种子 `_affixes` 一致且非空 /
  Math.random 调用 = 0 / 未传 rng 走 battleRnd / 与 `GROUP_AFFIX_FIXED` 同源）、先制度 14 条
  （声明非先制技能 → 不进先制档 / 准备阶段即完成声明 / 失效时 `aiDecide` 第二次调用 / 同档 tie-break / 声明 id 化 等）、
  疾影 9 条（每回合 55.01% / 防回退 / 允许连续两回合 / 无跨回合冷却 / `_extraCd` 不再写 / `onTurnEnd` 钩子已删）。
- **既有 `scripts/test-engine-gaps.js` 27 条一字未改**（未放宽任何断言；其中「冷却期内不额外行动」在取消冷却后变为恒真，
  已如实记录并在新文件用新口径覆盖）。
- **全量 60 套件 0 红**（59 既有 + 新套件）。
- **变异验证 4 条**（每次逐字节还原 + SHA256 校验）：M1 撤销词条接线 → 5 红；M2 分档回退到 held 口径 → 1 红；
  M3 跳过失效校验 → 2 红（含「打出已失效技能」的气泡证据）；M4 还原 `_extraCd=3` 冷却 → 6 红（每回合触发率回落到 **26.21%**）。
- **主控独立复核**：真实建场路径下 g6-10 词条与固化配置逐项一致、同种子一致、无词条敌人 0/3、
  建场期间 Math.random = 0；出手队列按声明变化；5 个文件**纯 LF**（子代理误写 CRLF 已还原）；全量 60/60。

### 本次新增 / 修改文件

**新增**：`scripts/test-engine-wiring.js`。

| 文件 | 变化 |
|---|---|
| `page/battle-group.js` | 1713 → **1897 行**（准备阶段预声明 + 失效回退 + 快照/回滚带队列位置） |
| `page/enemy.js` | 词条只装配一次（不再被清空）+ 全部随机走 `opts.rng`/`battleRnd()` |
| `page/affix.js` | 疾影取消跨回合冷却 → 每回合 55% |
| `page/game-render.js` | 真实建场真传 `affixes`；技能详情文案跟随新先制口径（2362 行） |
| `page/group-levels.js` | 锚定路径搬运配置时带上 `affixes` |

> ⚠️ 这是引擎改动：固定种子 `gb.log` 会变。本版**未**改四阶段语义、**未**把 `groupUnitTurn` 兼容分支塞回去、
> **未**动作者在清单 §10 的其它裁定。

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
| v2.4.4 | 51 | 2230 行 game-render.js | 🧹 折叠「蓄力」自相矛盾文案（`gbDropChargeNoise` 纯函数，日志页与战报**共用唯一实现**；不误伤普通 expire、保留下回合释放伤害）；新增 17 条断言（311 → 328）+ 真浏览器验证。**纯展示层，本版提交未改任何引擎文件** |
| v2.4.5 | 51 | 2353 行 game-render.js | 🔄 **战斗阶段化**（每回合 = 准备 / 行动 / 判定 / 结束）+ 冻结契约（`GB_PHASES` / `gb.phase` / 每条日志带 `phase`）+ 两条推进路径统一（tick 路径补上启风②/冰魄余威/破盾反伤）+ 显示侧阶段分组与徽标 + 战报带阶段。行为变化：跳过行动的回合也结算 dot、回合开始类覆盖整回合（慢受益人 100→120）、末日/遗言 4/7 次（与上一版一致）。`battle-group.js` 1316 → **1660 行**、`game-render.js` 2230 → **2353 行**；新增 `test-battle-phases.js`（64 断言），全量 58 套件 0 红 |
| v2.4.6 | 51 | 2353 行 game-render.js | 🧹 **还技术债**：删掉 `groupUnitTurn` 的「编排外兼容分支」（7 处），恢复单一语义（只跑行动阶段）；两个套件迁移到四阶段编排（`unitTurn` / `unitActionTurn`·`unitFullTurn`）。**纯重构、线上行为零变化**：固定种子 `gb.log` 与 v2.4.5 逐字节一致（3 关 sha256 相同）、断言集合 diff=NONE、变异验证 4 条。`battle-group.js` 1660 → **1638 行** |
| v2.4.7 | 51 | 2353 行 game-render.js | 🔧 修 4 条「写了但没生效」：先制度进出手队列（新增 `unitPriorityRank`，同档仍按速度+tie-break）、懒惰减伤在受击方三通道生效、末日普攻伤害减半生效、删除 `onAfterAction` 内层派发让疾影回到 **55.06%**（原 24.84%）。**会改强弱**：A/B 实测 g6 100%→85%、g8 15%→10%。新增 `test-engine-gaps.js`（27 断言），全量 **59 套件 0 红**；`battle-group.js` 1638 → **1713 行**。⚠️ 另发现「敌人词条在真实战斗里未装配」（未修，待裁定） |
| v2.4.8 | 51 | 2362 行 game-render.js | 🔌 **敌人词条真装配**（修掉「兜底装配后被清空 + 建场不传 affixes」的死接线；Boss/精英从 0 词条变为带固化词条，随即将随机词条种子化）+ **先制度改「本回合真用了才先手」**（准备阶段预声明、复用同一 `aiDecide`、失效当场回退；回退率 0/3180）+ **疾影改「每回合 55%」**（取消 3 回合冷却，实测 55.01%）。**难度大幅上移**（消融：只①g6 100%→15%、三者合并→3%；②③边际 0.0pp / g6 −12pp），作者裁定**不补偿**（补偿旋钮已量化留档）。新增 `test-engine-wiring.js`（42 断言），全量 **60 套件 0 红**；`battle-group.js` 1713 → **1897 行** |

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

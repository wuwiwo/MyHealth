# v2.14 变更日志

> 本文件只记录 **v2.14.x** 的变更。v2.13 及更早见 `doc/changelog-v2.13.md`。
> `2.13.1` 未领用：批次 C 开启新代码大类，按策略领取 `2.14.0`（台账已登记并推进指针到 `2.14.1`），该 patch 槽保留空缺。

---

## v2.14.29

Date: 2026-11-27

**全项目评审批次 F：层级与顶栏收尾（P3-1 / P3-2 / P3-5）**

> 上两版处理字阶与表单/文案。本版把评审剩下三条「观感与识别」收掉：两级页签同时实心填充、顶栏三枚纯 emoji 按钮、360 宽连版本号一起隐藏。

### UI 调整

1. **两级页签不再同时实心填充**（`page/index.css`，P3-1）
   - 原来顶栏页签（一级）与子页签（二级）同时填满品牌蓝，看不出层级；区块标题的引导线也是同色 1px，一屏并排出现三条同宽蓝条。
   - 现在：一级页签保持实心 `--brand-fill`；**二级只保留 `border-bottom:2px` 品牌下划线 + 品牌字**，底色退回透明（`.tab-btn` 本就带 2px 透明下划线，只需撤掉填充）；hover/focus 只加 8% 品牌淡底，不再整块变色。
   - 配套：`.section-hdr::after` 引导线由 `--orange-g` 改中性 `--bd` —— **蓝只表示「状态 / 主操作」，分隔一律中性**。
2. **顶栏三枚按钮从「纯 emoji」改「图标 + 文案」**（`page/index.html` + `index.css` + `utils.js` / `sync.js`，P3-2）
   - 旧状态：44px 方框里只摆一个 emoji（🔄 / 🌙 / 🔄），偏小且没有任何可见文案，用户只能靠 hover title 猜（手机上没有 hover）。
   - 现在：竖排「图标 16px + 文案 11px」= 同步 / 主题 / 状态，44×44 不变；`aria-label` 与 `title` 保留。
   - 同步状态灯的空闲图标由 🔄 改 **○**（与「同步」按钮的 🔄/↻ 区分开），synced ✓ / syncing ↻ / error ⚠ 不变。
   - **实现注意**：`setTheme()` 与 `setSync()` 原来整块 `textContent=…`，会把新加的文案一起冲掉 → 改为只更新 `.hb-ico`（找不到时回退到原节点）。
3. **小屏保留版本号**（P3-5）
   - 旧：`@media(max-width:380px)` 把整行 `.header-subtitle{display:none}`，`Personal Health Manager v2.14.xx` 一起消失 —— 小屏再也看不到当前版本。
   - 现在：副标题拆成 `.hs-brand`（英文词）+ `.hs-ver`（版本号，内联样式改为类）；**≤430px 只藏英文词、版本号留在标题下**（一行 12px，不给头部加高）。
   - 390 宽实测：英文词会折成「Personal Health / Manager」两行（比藏掉更难看），故阈值取 430 而不是 380；≥431 仍显示完整副标题。

### 验证

- `scripts/audit-whole-ui.js` 14 视图 × 360×640 / 390×844：**横向溢出 0、对比失败 0**；截图确认顶栏三钮带文案、360/390 都能看到版本号、子页签只余下划线。
- 每个视图 <12px 文本计数 **+3**（新增的三个顶栏文案，11px）—— 属本版预期增量，其余不变。
- 全量 **86 套件 / 0 失败**；`test-ui-consistency` 61 → **70 断言**（新增 9 条：图标+文案、`.hb-lbl` 字号、`setTheme`/`setSync` 只换图标、`.hs-brand` 拆分与 ≤430 规则、子页签不填充、引导线中性）。
- 缓存戳 `?v192` → **`?v193`**（56 处）。

### 仍未做（后续批次）

- **打包 / 首屏 56 请求**（`page/` 55 个 JS 逐文件加载）→ 下一版（v2.14.30）。

---

## v2.14.28

Date: 2026-11-27

**全项目评审批次 E：个人表单降层 + 导入语义写明（P2-5 续 / P3-4）**

> 上一版 `v2.14.27` 只动字阶。本版处理评审批次清单里剩下的两件「观感与语义」：个人资料卡的**三层盒子**，以及设置·数据页**没写明导入是「合并还是覆盖」**。

### UI 调整

1. **个人资料卡：三层盒子 → 一层卡 + 三条下划线**（`page/index.css` 的 `.pf-row` 系列）
   - 原来的层级是「卡片 2px 外框 → 每行 label → 每行 input/select 的 2px 外框」，一张卡里叠 3 个等宽方框，看不出哪个是容器（评审 P2-5 的剩余部分）。
   - 现在输入项 `border:0` + **只留一条 2px 下划线**（`border-bottom`）、底色改 `transparent`：控件不再自成盒子，从属关系靠下划线表达。
   - **尺寸零变化**：`min-height:44px` 的 `.pf-row input` 触控约束原样保留，获焦时只把下划线换 `--brand`，不加/减边框宽度（避免 1px 跳动）。
   - label 仍侧置 60px（纵向最省），未改浮动标签。

### 修复

1. **设置·数据没有一句话说明「导入会覆盖」**（`page/tab-settings.js` + `page/sync.js`，评审 P3-4）
   - 旧提示只有一行「用于手动备份或跨设备转移数据」—— 完全没说清导入的真实行为。
   - 真实语义（`store.mergeAll`）：**按键合并** —— 文件里包含的键**整块替换**本地同名数据（不是逐条追加、也不先清空），文件里没有的键原样保留。
   - 现在：说明行改为左对齐多行 `.data-hint`，分三句写清「导出 = 存一份到文件；导入 = 按键合并；云同步 = 与云端双向对齐」；并且**导入前弹一次确认**，把「N 项数据会整块覆盖、文件里没有的保留、不会清空也不会逐条追加」写进对话框，避免无备份覆盖当月记录。

### 验证

- `scripts/audit-whole-ui.js` 14 视图 × 2 视口：**横向溢出 0、对比失败 0**；个人数据页截图确认卡内只剩三条下划线，数据页说明行两行内读完。
- 全量 **86 套件 / 0 失败**；`test-ui-consistency` 51 → **61 断言**（新增 5 条：下划线替代外框、获焦换色不改尺寸、`.data-hint` 样式、导入语义与确认）。
- 缓存戳 `?v191` → **`?v192`**（56 处）。

### 仍未做（后续批次）

- **打包 / 首屏 56 请求**（`page/` 55 个 JS 逐文件加载）→ v2.14.29。
- 其他 P3：双行实心蓝（顶栏 + 子页签双层填充）、顶栏三枚图标按钮（💾/☀️/↻）在 44px 方框内 emoji 偏小且无可见文案、360 宽隐藏副标题（版本号在 ≤380 时整行不可见）。

---

## v2.14.27

Date: 2026-11-27

**全项目评审批次 D：字号阶梯（评审 P2-10）**

> 上一版（v2.14.26）把 P2-10 记为「未做」：14 视图实测中 <12px 文本承担真实信息 —— 战斗 48 处（试炼卡副标题/状态）、动作库 95 处（中文标签 + 英文名 + 计数）、图鉴 43 处（稀有度芯片/数值脚注）。本版只动字阶，不动任何结构。

### UI 调整

1. **10px 这一档整体下线**（`page/index.css` 令牌段）
   - `--fs-3xs` 由 `.625rem`（10px）提到 **`.6875rem`（11px）**，与 `--fs-2xs` 同值；保留 token 名字，因此 **49 处 JS 内联 + CSS 引用一次抬升**，无需逐处替换。
   - 理由：360 宽实机里 10px 中文字形只有 ~5px 高，而它承载的是「还差 4 天 / 单敌·敌群 / 标签」这类要读的内容，不是装饰。
   - 复测：`audit-whole-ui.js` 抽样字阶由 `[10]` 变为 **`[11]`**，全 14 视图 **10px 文本计数 = 0**。
2. **试炼卡副标题 / 状态行 11px → 12px**（`.gl-group-desc` / `.gl-group-state`）
   - 这两行要区分「基础 / 进阶 / 高阶」与「进行中 / 未开启」，是单屏最密的 11px 文本区；提到 `--fs-xs` 后战斗页 <12px 文本 **48 → 0**。
   - 风险评估：试炼卡 2 列、每列约 156px，「进阶试炼（最多 3 敌+魂攻防）」在 11px 已折 2 行 —— 12px 实测仍为 **2 行**，卡片高度与改前一致，未出现 3 行或横向溢出。

### 验证

- `scripts/audit-whole-ui.js` 14 视图 × 360×640 / 390×844：**横向溢出 0、对比失败 0**，与 v2.14.26 持平。
- 全量 **86 套件 / 0 失败**；`test-a11y-tokens` 40/40。
- 缓存戳 `?v190` → **`?v191`**（56 处）。

### 仍未做（后续批次）

- **个人表单三层盒子**（卡 → label → 输入框）→ v2.14.28。
- **打包 / 首屏 56 请求**（`page/` 55 个 JS 逐文件加载）→ v2.14.29。
- 其他 P3：双行实心蓝、顶栏三枚图标按钮（💾/☀️/↻）尺寸与无可见文案、设置·数据未写明「合并」语义、360 宽隐藏副标题。

---

## v2.14.26

Date: 2026-11-27

**全项目 UI/UX 评审落地（14 视图 × 2 视口；批次 A + B + C）**

> 评审口径：ui-skills.com 的 `pbakaus/audit`（5 维技术审计 0–4 分 /20）+ `pbakaus/critique`（Nielsen 10 项 0–4 分 /40）。
> 客观数据：新增 `scripts/audit-whole-ui.js`（无头 Chrome + CDP，逐视图量横向溢出 / <44px 触摸目标 / <12px 正文 / 对比度 / 圆角阴影违规 / 非灰阶强调色数；对比度算法带合成自检，防假阴性）。
> 完整报告：`doc/ui-ux-review-whole-2026-11-27.md`（结论 **技术审计 10/20、Nielsen 21/40**；上一轮局部评审 `doc/ui-ux-review-2026-11-27.md` 21/40、13/20）。
> 作者裁决（本轮）：**「并入 v2.14.26，并且按照批次开始修复」**。

### 新增功能

1. **`.btn-quiet`：全站按钮收敛为三档**（`page/index.css`，评审 P2-3）
   - `.btn-primary` = 唯一主操作（实心品牌色）、`.btn-entry` = 列表式入口（带 `›`）、`.btn-quiet` = 次级中性描边。
   - 此前同为主/次级操作却有实心与描边两套语言：`保存资料` 是描边、数据页的 `导出/导入` 用 plan-card 按钮、`手动云同步` 用品牌描边。

### 修复

1. **本旬目标三卡换行错版 + 同组数值渲染两次**（`page/game-views.js` + `index.css`，评审 P1-A）
   - 旧实现把 `'💪 N/6天'` 拼成一整串塞进三等分卡（360 宽下每卡约 100px）→ 实机折成「0/6 / 天 / 状态」三行；且第三卡数值与第一卡完全重复。
   - 现在：数字与单位拆成 `数字 + .period-kpi-u` span、整行 `white-space:nowrap`；第三卡只表达「本旬状态：已达标 / 差 N 天」；达标时才转绿。
2. **调试 FAB 常驻遮挡可点目标**（`page/debug.js`，评审 P1-B）
   - 它是 `position:fixed` 右下 44px 圆钮（`opacity:.55`），360 宽下正好压在右列内容：动作库每行的 🗑️/✏️ 被整个盖住、挑战页末张关卡卡右半被盖 —— 全站唯一「点不准」来源。
   - 现在：默认**不建 DOM**，只有 `?debug=1`（或 `localStorage.mh_debug='1'`）才挂；`DebugPanel.open()` 内部仍会补建，控制台用法不变。
3. **图鉴激活页签计数不可读（1.3:1）**（`page/index.css`，评审 P1-C）
   - `.codex-tab.active .codex-tab-n` 原为 `--orange` 压品牌蓝底 → 实测量得 **1.3:1**（"14" 几乎看不见），改 `--on-brand`。
4. **个人最佳空态 CTA 是死按钮**（`page/tab-profile.js`，评审过程顺带发现）
   - 原写 `switchTab("strength")` —— 不存在的 tab 名，点了之后所有 `.tab-content` 取消 active、页面变全空且不触发任何 render。
   - 改 `switchTab('training')` + `switchSub('training','strength')`。
5. **全站零标题语义**（`page/index.html` 静态 12 处 + `tab-settings/tab-profile/game-views/game-records` 渲染 8 处，评审 P2-1）
   - h1/h2/h3 计数恒为 **0**，区块标题全是 `div/strong`，读屏无法按标题导航；现统一为 `<h2 class="section-hdr">`（视觉样式不变，`.section-hdr` 规则本就与标签无关）。
6. **动作库 26 个纯图标按钮无可访问名称**（`page/tab-settings.js`，评审 P2-2）
   - 读屏只会念「铅笔 / 垃圾桶」；现补 `aria-label="编辑 {动作名}" / "删除 {动作名}"`，动作名做 `& < > "` 转义。
7. **空态三套壳 + 空态无动作**（`page/index.html`/`utils.js`/`game-views.js`/`tab-settings.js`/`index.css`，评审 P2-4 / P2-7）
   - 记录页用无边框浅块、计划页用 2px 巨框、个人最佳用居中奖杯大留白 → 全部改走 `emptyHtml`（`.empty` 组件）。
   - 后置密度覆盖 `.empty{padding:var(--sp-12)}`（≈48px）曾让单个空态吃掉 300–500px 屏高 → 收到 26px、图标 `--fs-2xl`。
   - 计划页两个空态各补一个**真动作**「去训练 ›」，接 `gotoTraining / gotoCardio`，落到「训练 → 力量 / 有氧」子页签。
8. **设置子页签与「挑战·战斗」撞名**（`page/index.html`，评审 P2-8）：`🎮 挑战` → `🎮 玩法`（`data-sub="game"` 不变）。

### UI 调整

1. **编队队卡降层**（`page/index.css`，评审 P2-5）：队卡原本自带 2px 外框，与编队卡/面板卡叠成「四层盒子」；改为上分隔线，层级只剩「卡 → 行」。
2. **统计卡数值统一中性色**（`page/index.css`，评审 P2-6）：`.sc-total` 蓝 / `.sc-vol` 紫 / `.sc-rate` 橙 / `.sc-fav` 绿 —— 四张卡分四色但颜色不表达任何含义；现统一 `--text`，颜色只留给「达成(绿) / 危险(红) / 主操作(蓝)」。同理「最爱动作」为空时显示「暂无」而不是留白。
3. **动作库权重徽标**（`page/tab-settings.js`，评审 P2-9）：`🥇 100%` → `权重 100%`（原名会被读成金牌/评分，实际是折算率 ratio）。
4. **热力图导航**（`page/tab-profile.js`，评审 P2-9）：`📍` → `今天`（并补 `aria-label`；`◀ / ▶` 同步补「上个月 / 下个月」）。
5. **图鉴筛选芯片触摸宽度**（`page/index.css`，评审 P2-11）：`.codex-chip` 补 `min-width:var(--touch-min)` —— `R` 实测原本只有 36.4px 宽。

### 测试

| 套件 | 变化 | 断言 |
|---|---|---|
| `test-ui-consistency.js`（新增） | P1-A…P2-11 逐条契约守卫（源码 / CSS / index.html） | **51** |
| `test-display-float.js` | 同步 `period-kpi-u` 新 markup，补「单位独立 span 防折行」「第三卡=本旬状态」两条 | **32** |
| `test-battle-history.js` | 记录页空态改 `.empty` 后仍加载（`gvEmpty` 在无 utils 的沙箱内降级） | **215** |
| `test-a11y-tokens.js` | 新增 `catch` 注释带「忽略」说明（静默异常守卫） | **40/40** |

- 全量 **86 套件 / 0 失败**。
- 真机（`scripts/audit-whole-ui.js`，360×640 / 390×844）：14 视图 × 2 视口 **横向溢出 0、对比失败 0**（改前图鉴 1 处）、强调色数普遍降 1–2 档；`verify-squad-ui.js` 两视口全绿。
- 交互验证（CDP）：默认无 `#debugFab`、`?debug=1` 有；个人最佳与计划页的空态 CTA 点击后均正确落到「训练 → 力量 / 有氧」。

### 版本文件

`page/utils.js`（`APP_VERSION` → `2.14.26`）、`page/index.html`（`?v189` → `?v190`，56 处）、`README.md`、`doc/changelog-v2.14.md`、`doc/VERSION-LEDGER.md`（指针 → `2.14.27`）。

### 未完成（记账）

- **P2-10 字号阶梯**：10–11px 中文元信息仍承担信息（战斗 48 处 / 动作库 95 处 / 图鉴 43 处），需一次整体字阶调整，不混在本轮。
- **个人表单三层盒子**（卡 → label → 输入框）保留：label 侧置更省纵向空间，改浮动标签属独立改版。
- **P3-3 打包**：`page/` 55 个 JS 逐文件加载、冷启动 56 请求 / 约 2.8MB（本地 180–670ms 无感，移动网络会明显），建议发布侧合并或延迟加载。

## v2.14.25

Date: 2026-11-27

**UI/UX 评审后的 P1 + P2 收口（编队 / 出战场 / 关卡列表）**

> 评审口径：ui-skills.com 的 `pbakaus/audit`（5 维技术审计）+ `pbakaus/critique`（Nielsen 10 项 / P0–P3）；客观数字来自新增 `scripts/audit-squad-ui.js`（无头 Chrome + CDP 量测，非目测）。完整报告见 `doc/ui-ux-review-2026-11-27.md`。
> 作者裁决（本轮）：**「P1 和 P2 全部一起做」**、平衡性不再测试（实机为准）。

### 新增功能

1. **宠物面板「⚔️ 出战编队」改为只读摘要 + 单一编辑入口**（`page/pet-ui.js` + `page/index.css`，评审 P1-1）
   - 摘要行：`首发` 标签 + 首发成员芯片（**无边框、非按钮**，带 ⚠️ 受伤标记）+ 容量 `N/4`；空态给一句「还没编队 · 开战会自动带成熟宠物」。
   - 动作区只剩两个：`⚔️ 开始敌群试炼`（唯一主 CTA，`.btn-primary`）与 `🐾 编队管理 ›`（`#petSquadEditJump`，`aria-controls` 指向 `<details id="petSquadDetails">`，点开自动展开并滚到编队区）。
   - **删除** `[data-pet-pick]` 就地切换及其 `savePetBattlePicks` 调用 —— 首发阵容只由 `togglePetSquadPet → petSquadRefreshPicks` 维护，一个面板里不再有两处能改同一组数据。
   - 标题统一「出战编队」（不再叫「参战阵容（首发队）」）。
2. **动作层级：一屏一个主 CTA**（`page/game-views.js` + `index.css`，评审 P3-9 / P1-2）
   - 新增 `.btn-primary`（实心 `--brand-fill`，仅开战按钮用）与 `.btn-entry`（中性描边 + 右对齐 `›`，用于技能培养 / 图鉴 / 炼魂 / 挑战关卡 / 编队管理 / 更多养成）。
   - 培养页 4 个入口与 2 个入口按钮**去掉内联语义色**（原来写 `border-color/color/border-radius` 内联，其中 `border-radius:12px` 早已被 `[style*="border-radius"]` 守卫吃掉，属死代码）。

### 修复

1. **大关内页关卡卡「十张长得一模一样」**（`game-views.js` + `index.css`，评审 P1-2）
   - 根因：4 种状态（已通关 / 可挑战 / 未解锁 + Boss/精英配色）全部写在内联 `btnStyle` 里，被 `index.css` 的「内联语义色收敛」规则 `.speed-btn[style*="border-color"]{…!important}` 统一收成中性。
   - 改为类驱动 `.gl-stage.is-open / .is-elite / .is-boss / .done / .locked`（**不复用 `.lv-card`**，那是「挑战关卡」章节卡的既有样式）；状态文字抽成 `.lv-state` 并由状态类着色。
   - 守卫收窄为 `:not(.btn-entry):not(.btn-primary):not(.gl-stage):not(.train-start-battle)`，只留给尚未收口的历史内联。
2. **「🔒 未解锁」在 130px 窄卡里折成两行**：`.lv-state{white-space:nowrap}`；锁定卡不透明度 `.6 → .7`（原来整卡连同文字一起发灰、对比不足）。

### UI 调整

- **形态标签只标例外**（评审 P2-3）：`groupStageModeTag` 对「双场景」直接返回 `''`，只有「双 BOSS」打 `.lv-tag.is-boss`；列表头新增 `.gl-modes` 一行「本大关 10 关：9 关双场景 · 1 关双 BOSS」（原来 10 张卡里 9 张重复同一标签，把唯一的例外淹掉）。
- **培养页编队行补可点提示**（评审 P2-4）：行尾 `›` + `.train-squad-row:hover/:active` 底色反馈（量测原为 `hasAffordance=false`，整行是按钮却毫无提示）。
- **徽标文案统一**（评审 P2-5）：「首发 / 作战」→「首发 / 第 N 队」，与培养页、编队摘要一致。
- **跨队占用可读性**（评审 P2-6）：`.pet-squad-chip.is-taken` 不透明度 `.45 → .6`；「在 X队」标签由 `currentColor` 半透明改为不透明 `--text2`（原有效对比 ≈2.1:1，而这正是要传达的信息）。
- **更正**（评审报告）：`[data-squad-del]` 本就有原生 `confirm('删除这支小队？…')`，「无二次确认」系评审误判，已在报告与台账标注；本轮未改该逻辑，仅保留红色专用于破坏性操作。

### 测试

| 套件 | 变化 |
|---|---|
| `scripts/test-squad-ui.js` | §2 重写为「只读摘要」契约（2 只只读芯片 / `data-pet-pick` = 0 / 跳转入口 / 标题与徽标文案）；§3 补「只标例外」「`.gl-modes`」「关卡卡不再内联 btnStyle」守卫；CSS 契约列表换 `.gl-stage` / `.btn-primary` / `.btn-entry` / `.train-squad-caret` / `.pet-lineup-sum` / `.pet-squad-jump` → **41 断言** |
| `scripts/test-pet-panel-layout.js` | 「5 个可点芯片 + aria-pressed」改为「4 只只读摘要芯片 + 摘要区 0 个可点芯片」；`<details>` 断言改正则（新增 id）→ **90 通过** |
| `scripts/test-pet-icons.js` | 4d 改为先注入首发再渲染（摘要只列首发成员），头像契约不变 → **263 通过** |
| `scripts/verify-squad-ui.js`（真机） | 断言改为 g3-1 / g3-5 **不打标**、g3-10 打「双 BOSS」、`.gl-modes` 文案、关卡卡走类、摘要只读 2 只 + 无 `data-pet-pick` + 跳转入口；360×640 / 390×844 **全绿** |
| `scripts/audit-squad-ui.js`（新增，评审工具） | 5 类客观量测：触摸高度 / 字号 / 对比度 / 焦点可达 / 标签密度 / 重复数据，输出 `_tmp-audit/metrics.json` |

全量 **85 套件 / 0 失败**。

### 版本文件

- `page/utils.js`：`APP_VERSION` `2.14.24` → **`2.14.25`**
- `page/index.html`：缓存戳 `?v188` → **`?v189`**（56 处）
- `README.md`：副标题、目录树台账指针（`2.14.26`）、`2.14.25` 版本表行、当前版本行
- `doc/VERSION-LEDGER.md`：`2.14.25` 领号 + 已发布行
- 新增文件：`scripts/audit-squad-ui.js`（评审量测，不进全量回归）、`doc/ui-ux-review-2026-11-27.md`（评审报告）
- `page/` JS 数 **55**，最大文件 `game-render.js` **3508 行**

### 未完成

- 普通档 `normal:0.85` 按作者裁决**保持不动**，等实机体感。
- 其余 **8 处**历史内联语义色未收口（宠物列表「🧪营养 / ✨炼化」、技能「装备中」、宝珠「装配」、惩罚横幅「知道了」、引导「开始挑战」、空态「获取初始蛋」），属后续批次（守卫已收窄，不影响新类）。
- 评审报告里的 P3 项（11px 元信息、同权重全宽按钮的进一步收敛）未做。

---

## v2.14.24

Date: 2026-11-27

**多队收口 + 编队 / 关卡 UI（作者 7 项裁决）**

> 作者原话：① 单场景 Boss 关是否保留「小队接力」→「不可以」；② 关卡列表无「双场景 / 双 Boss」标记 →「增加 tag 标记」；③ 培养页 `.train-lineup` →「用多队入口代替参战阵容模块」；④ 普通档 0.85 →「等待实际测试」；⑤ 未跟踪文件 →「没用的都删除」；⑥ 阵容配置 →「选中样式更明显，已设置在其他队伍的宠物要标记出来」；⑦ 「参照接入 ui-skill（ui-skills.com）进行项目优化」。

### 新增功能

1. **关卡列表形态标签**（`group-levels.js` + `game-views.js` + `index.css`）
   - `group-levels.js` 新增 `stageModeLabel(lg, st)` → `''` / `'双场景'` / `'双 BOSS'`，判据仍是 `stageIsMulti`（单一来源）；`window` / `globalThis` 同步导出。
   - `game-views.js` 的 `groupStageModeTag(glv, st)` 只负责把标签套进 `.lv-tag`（普通档蓝 / 双 Boss 档红，沿用既有 token，不新增颜色）。
   - 大关内页每关卡片在名字下显示标签；顺带修掉窄卡里「第10关」折行与 Boss 名重复王冠（`st.name` 前缀剥离扩到 `U+FE0F/U+200D`，名字改 `--fs-2xs` + nowrap）。
2. **培养页「⚔️ 出战编队」改为多队摘要**（`game-views.js` + `index.css`）
   - 按编队顺序每队一行：首发徽标 + 队名 + `N/4` + 宠物芯片（未成熟/阵亡芯片置灰、空队给提示）。
   - 整行 / 「🐾 编队管理」按钮 → 打开宠物面板并自动展开编队区（`_petSquadsOpen = true`）。
   - **删除** 原来的 `data-train-pick` 就地切换与 `savePetBattlePicks` 调用：选择入口收敛到编队管理（唯一编辑器）。
3. **编队管理 / 阵容配置 UI 优化**（`pet-ui.js` + `index.css`；参照 ui-skills `ibelick/baseline-ui` 的可迁移原则）
   - 选中态 = **实心填充 + ✓**（不再只改边框色），视觉与 `aria-pressed` 同源。
   - **跨队占用标记**：每队芯片上，已被别队占用的宠物标「在 X队」+ 置灰 + `disabled` + 原因 `title`；参战阵容（= 首发队）同样标注并禁用（防点一下把宠物从别队悄悄搬走）。
   - 队卡头部拆成「徽标 + 队名 + 计数」与单独一行右对齐的 `↑ ↓ 🗑`（原来在 360px 上与队名抢宽度、折行且顺序错乱）。
   - 每队补 `pet-squad-meta`（首发说明 / 未编队 N 只）；名字省略号、计数 `tabular-nums`。

### 修复

1. **单场景不再有「小队接力」**（`page/game-render.js`，作者裁决）
   - 拆掉 v2.14.19 的单场景接线：删除 `_groupRelayNext` 提供方、`_groupRelaySquads` / `_groupSquadIdx` / `_groupRelayPending` 三个全局、`_groupBattle.squadUnits/reinforce` 写入、上场 toast 与 `window.__groupRelayNext` 探针。
   - 多队只在双场景导演里生效；单场景（非双 Boss 的 16 个 x-10 + 队不足回退）就是首发队一场打到底。
   - 引擎侧 `gb.reinforce` / `gbReinforce()` **保留未改**（后续若恢复接力也不必重写引擎）。
2. 关卡名前缀剥离的正则原来只认 `[⭐👑] ` 单字符，Boss 名带变体选择符时会残留第二个王冠 → 改为剥 `[\s⭐👑\uFE0F\u200D]+`。

### UI 调整

- `.lv-tag` / `.lv-stage-name` / `.train-squad-*` / `.pet-squad-ops` / `.pet-squad-chip.is-taken` / `.pet-squad-chip-tag` / `.pet-squad-meta` / `.pet-pick-chip.is-taken` 新增；`.pet-squad-chip[aria-pressed="true"]` 由「绿框绿字」改为实心填充。
- 编队区提示文案改为「✓ 实心 = 已在本队；标『在 X』并置灰 = 已编在别的小队」。
- 参战阵容标题改为「⚔️ 参战阵容（首发队）」。

### 测试

- 新增 `scripts/test-squad-ui.js`（**28 断言**）：选中 `is-sel`+✓、跨队 `is-taken`+`disabled`+「在一队」、参战芯片同源标注、培养页源码守卫（不再自改阵容）、CSS 契约。
- `scripts/test-attackable.js` §7 补 `stageModeLabel` 5 条 → **58 断言**。
- `scripts/test-squad-relay.js` 收窄为「引擎能力 + 单场景不接线」（§7 改守已删除、§10 改守不写 `squadUnits/reinforce`）→ **41 断言**。
- `scripts/test-orb-wiring.js` 培养页断言改为多队摘要（`data-train-squad` / `data-open-squad`）+ 反向断言「不再自改参战阵容」。
- 新增 `scripts/verify-squad-ui.js`（无头 Chrome + CDP，360×640 / 390×844）：编队卡行高/溢出、g3 内页标签正确性（g3-1/g3-5 双场景、g3-10 双 BOSS、g4-10 不标）、编队芯片实心/占用/禁用 —— 两视口全部通过。
- 全量回归 **85 套件 / 0 失败**（新增 1 套件）。

### 版本 / 文件

- `APP_VERSION` **2.14.23 → 2.14.24**；缓存戳 `?v187` → **`?v188`**（56 处）。
- `page/` JS 数 **55**（未增删 page 文件）；最大文件 `game-render.js` **3508 行**（删掉接力实现后从 3550 降下来）。
- 新增 `scripts/test-squad-ui.js`、`scripts/verify-squad-ui.js`。

### 未完成（按作者裁决暂不动）

- 普通档 `normal: 0.85` 保持不动 —— 作者要求「等待实际测试」再调。
- 双 Boss 关的专项平衡模拟仍未做（`balance-dual.js` 用通用单位，不覆盖 Boss 天赋/遗言）。

---

## v2.14.23

Date: 2026-11-26

**多队双场景改为常态 + 系数按关卡类型分档 + Boss 关双 Boss**（作者新规格，**推翻 v1.2 的 Q6「只有 g18-5 / g24-5」**）

> 作者原话口径：普通关卡 0.85、精英关卡 0.9、Boss 关卡（双 Boss）0.9，双 Boss 每 3 大关出现 1 次。
> 复核后的三条落地裁决：① 多队适用范围 = **所有关卡的 x1–x9 + 双 Boss 关**；② 双 Boss = **两场景各 1 Boss**；③ 双 Boss 节律 **lg % 3 == 0**（g3 / g6 / … / g24）；④ **其余 Boss 关（lg%3≠0）保持单场景单 Boss**。

### 新增功能

1. **关卡 `mode` 派生重写**（`page/group-levels.js`，唯一派生点）
   - `stageIsMulti(lg, st)`：`st 1–9` → `multi`（普通关与 x5 精英关全开）；`st === 10` → 仅 `lg % MULTI_BOSS_EVERY === 0` 为 `multi`，其余 `single`；越界（lg<1 / lg>GROUP_MAX / st 越界）→ `single`。
   - 新常量 `MULTI_BOSS_EVERY = 3`（原 `MULTI_SCENE_FIRST_LEVEL` / `MULTI_SCENE_STEP` 随旧节律作废，导出同步删除）。
   - 派生结果：**240 关里 224 关 multi**（24 大关 × 9 关 + 8 个双 Boss 关），只剩 16 个「非双 Boss」的 x-10 是 single。
   - **双 Boss 不需要新编成逻辑**：Boss 关每侧拿一份完整编成（既有 `genStageEnemies` 的「1 Boss + 2 护卫」），两场景各一份 ⇒ 全场正好 2 个 Boss。
2. **系数改成按关卡类型取值**（`page/group-dual.js`，唯一来源）
   - `MULTI_SCENE_SCALE_BY_TYPE = { normal: 0.85, elite: 0.9, boss: 0.9 }`；`multiSceneScale(type)` 未知/缺省回落 0.85（绝不返回 0）。
   - `applyMultiSceneScale(cfgList, scale)` 的 `scale` 可以是**数字**或**关卡 type 字符串**；不传 → 普通档。语义仍是「只乘 base 五项、floor、下限 1、不改原编成」。
   - `MULTI_SCENE_ENEMY_SCALE` 降级为**兜底默认 0.85**（v2.14.22 的实测单一常量 0.95 已被本规格替换）。
3. **开战入口改为「能开就开，开不了回退」**（`page/game-render.js`）
   - `_startDualGroupTrial()` 现在**返回布尔**：`true` = 已开双场景；`false` = 编队不足/空队/导演缺失。
   - `startGroupTrial` 里 `if (glv.mode === 'multi')` 分支改成 `if (_startDualGroupTrial(...)) return`；返回 `false` 时**给一次说明 toast 后继续走单场景建场** —— 新玩家与「只有 1 支满员队」的存档**不再被挡住开战**（阶段 D 的「两支任一不可战即不可开战」已废止）。
   - 每侧敌人缩放改为 `multiSceneScale(glv.type)`（不再用单一常量）。

### 修复

1. **新档会被卡住的隐患**：多队改成常态后，若沿用阶段 D「队不足即不可开战」，任何只有 1 支编队的存档都会在 x1–x9 全线无法开战 → 已按上条改为回退单场景 + 提示。

### UI 调整

1. 回退时的提示文案：「ℹ️ 本场按**单场景**开战：需要两支都有可战宠物的编队（宠物面板 → 🐾 编队管理）」。
2. 双栏渲染与芯片尺寸**一字未改**（阶段 E 的紧凑芯片直接复用，实测三个关卡类型均通过）。

### 测试

1. `scripts/test-attackable.js` §7 全量重写（multi 数量 = 每大关 1–9 关 + 能整除 3 的 Boss 关、`single` 只剩非双 Boss 的 x-10、g1-5 也 multi、g18-10 是双 Boss、`MULTI_BOSS_EVERY === 3`、Boss 编成含 Boss + 护卫）→ **53 断言**。
2. `scripts/test-dual-battle.js`：§1 改成分档断言（0.85 / 0.9 / 0.9 + 未知回落 + 数字/字符串两种入参 + 下限 1）、§10 常量守卫、§13 集成按精英 0.9、新增 §14（双 Boss 关两侧各 1 Boss / 非双 Boss 关仍 single / 单队与空队回退 false / 入口按返回值收工）→ **93 断言**。
3. 全量 **84 套件 / 0 失败**；`test-a11y-tokens` **40/40**。
4. `scripts/verify-dual-layout.js` 增加**关卡 id 参数**（默认 `g18-5`），并实测 **g3-1（普通关）/ g3-10（双 Boss）/ g18-5（精英关）** 三种关卡类型各 **28/28 全绿**（截图含双 Boss 关两栏各 1 Boss + 2 护卫）。

### 版本

1. 缓存戳 `?v186` → **`?v187`**（56 处）；`page/` JS 数 **55**（未新增模块）；最大文件 `game-render.js` **3550 行**。
2. ⚠️ **平衡影响如实披露**：多队从「全期 2 关」变成「240 关里 224 关」，而普通关系数是 0.85 —— 按 v2.14.22 的实测（同关同阵容、40 种子），双场景在 0.85 时比同关单场景**容易 4~40pp**（双倍宠物池摊薄失败风险），因此**整体难度会明显下移、单场耗时约翻倍**。若体感偏易，只需改 `MULTI_SCENE_SCALE_BY_TYPE` 这一张表（普通档可上调到 0.9~1.0）。

---

## v2.14.22

Date: 2026-11-26

**阶段 E：真机双栏复核 + 平衡实测定值**（设计 `doc/design-pet-squad-battle-v1.md` v1.2 §10.1 阶段 E）

> 两件事：① 用**自建真机量测工具**（无头 Chrome + CDP）在 360×640 / 390×844 复核双栏，**抓到一个真实缺陷并修掉**；② 用**引擎直跑模拟**做 `MULTI_SCENE_ENEMY_SCALE` 的平衡实测，**定值 0.85 → 0.95**。

### 新增功能

1. **`scripts/verify-dual-layout.js`（真机双栏校验工具，非测试套件）**
   - 无头 Chrome（`--headless=new --remote-debugging-port=9333`）+ Node 22 自带全局 `WebSocket` **自建 CDP 客户端**（本机无 Python、无 Playwright MCP，`bu` 平面无 JS eval）。
   - 两个视口（360×640、390×844，`dsf=2`、`isMobile`）各跑一遍：`switchTab('game')` → 覆写 `getPetSquads` / `buildGroupBattlePets` 造 3 队（一队 4 宠、二队 4 宠、三队 1 宠）→ `startGroupTrial('g18-5')` → 量测 → 推 12 拍 → 截图落 `_tmp-dual-verify/`。
   - **28 项断言**：两栏并排且同高、页面无横向溢出、栏头文案、每枚芯片相对其广场的四向越界、广场 `scrollHeight/clientHeight`、页签仍可见、推进后场景键合法。
   - 工具自身的**假阳性修复**：战场 overlay 挂在「挑战」页签里，不先 `switchTab('game')` 会量到全 0 宽（首轮 4 项假红）。
2. **`scripts/balance-dual.js`（平衡实测工具，非测试套件）**
   - 同关同阵容、固定种子、直接驱动 `createDualBattle` + `dualStep`：**双场景＝8 宠分两队 + 每侧完整编成 × scale**；**基线＝同关单场景（4 宠 + 玩家、`winnerRule='all'`、scale 1.00）**。
   - 两档阵容（普通：SSR×2 + SR×4 + R×2，按强度降序 ⇒ A 队强、B 队弱；强：UR×3 + SSR×4 + SR×1），按单场景胜率自动校准到 `g7-10`，再扫 `1.00 / 0.95 / 0.90 / 0.85 / 0.80 / 0.70`。

### 修复

1. **双栏芯片溢出广场下沿（360×640 实测 A 栏越界 153px、B 栏 81px；390×844 为 126px / 54px）**
   根因：双栏只有 156px（390 视口 183px）宽，标准芯片 `--gb-unit-w:56px` / `min-width:52px` 一行只放 2 枚 ⇒ 5 宠折成 3 行，被 `.gb-arena{overflow:hidden}` 裁掉末行。
   修法见下节「UI 调整」，复测 **28/28 全绿**。

### UI 调整

1. **双栏专用紧凑芯片**（全部落在 `.gb-dual` 作用域，单场景完全不受影响）
   - `.gb-dual .gb-arena`：`--gb-unit-w:44px` / `--gb-unit-ico:18px`、`gap:2px`。
   - `.gb-dual .gb-arena-unit`：`min-width:44px` / `min-height:44px` —— **仍等于 `--touch-min`，触摸目标未缩水**；`padding:2px 1px`、`gap:0`。
   - 名字 `--fs-2xs` + 单行省略号、血条 4px、状态区 `min-height:12px` ⇒ 156px 一行放 3 枚：**5 宠 2 行 + 3 敌 1 行**，两视口均无裁切。
2. **双栏广场纵向不再裁切**：`.gb-dual .gb-arena-row` 取消 `max-height`（原 `13vh` 裁掉换行后的末行）；中央区在双栏压到 `2px`（特效落点仍走 `gbFx` 绝对定位层，不依赖它）。
3. **控制条标题压缩**：`双场景 · 回合 1 · 当前 A · 替补 1` → `双场景·回合1·A·替补1`（360 上原标题会折成两行、挤掉战场高度）。

### 平衡定值（`MULTI_SCENE_ENEMY_SCALE` 0.85 → 0.95）

实测（40 种子，校准关 `g7-10`，单场景基线胜率 53% / 100% 两档阵容）：

| scale | 双场景胜率 | 平均整场轮数 | 胜场剩余我方血量 |
|-------|-----------|-------------|-----------------|
| 1.00 | 17% ~ 60% | 14.1 | 44~49% |
| 0.95 | 57% ~ 83% | 12~14 | 50~51% |
| 0.90 | 80% ~ 93% | 10.6 | 55~57% |
| 0.85 | 97% ~ 98% | 9.4~11.7 | 58~64% |
| 0.80 | 100% | 8.4~9.8 | 66~70% |
| 0.70 | 100% | 7.1~8.0 | 76~78% |

- 结论：**0.85 会让「双场景」比同关单场景更容易 4~40pp**（双倍宠物池把失败风险摊薄），与「多队精英关」的定位相反；**0.95 与单场景持平或略难**，1.00 偏硬（B 队通常弱于 A 队、实测还会更低）。
- 因此把常量定为 **0.95**，注释里写明实测依据；`applyMultiSceneScale` 的语义一字未改（只乘 base 五项、floor、下限 1、不改原编成）。
- ⚠️ 若作者要求「精英关明显更硬」，只需把这一个常量上调到 `1.00`。

### 测试 / 版本

1. `scripts/test-dual-battle.js` 5 条系数相关断言同步改为 0.95（缩放样本 100→95、20→19；常量守卫；集成段敌人 base 期望）——**78 断言全绿**。
2. 全量 **84 套件 / 0 失败**；`test-a11y-tokens` **40/40**。
3. 缓存戳 `?v185` → **`?v186`**（56 处）；`page/` JS 数 **55**（本版未新增 page 模块）。

---

## v2.14.21

Date: 2026-11-26

**多队双场景 —— 阶段 D：导演层 + 双栏战场 + 玩家轮转 + 替补绑定场景**（设计 `doc/design-pet-squad-battle-v1.md` v1.2 §4 / §10）

> ⚠️ 本版是**首次对线上开放多队战斗**：`g18-5` / `g24-5`（阶段 C 派生出的两个 multi 关）现在真的会开双场景。

### 新增功能

1. **新模块 `page/group-dual.js`（导演层，纯逻辑 / 无 DOM）**
   - `MULTI_SCENE_ENEMY_SCALE = 0.85` + `applyMultiSceneScale(cfgList)`：只乘 `base` 五项（hp/atk/def/soulAtk/soulDef，floor、下限 1），**返回新对象不改原编成**（单场景关卡仍用原编成）。
   - `createDualBattle({player, scenes:{A,B}, pendingSquads, buildSquad})`：两个 gb 都被置 `winnerRule:'pets'`（玩家不计判负）、各自绑 `squadUnits` 与**场景化** `reinforce`（谁全灭谁去队列取，绝不跨场景偷队）；玩家打 `_isPlayer` + `_untargetable` 并挂到 A。
   - `dualStep(dir)`：每拍只推进**当前场景**一个单位行动（复用 `groupBattleStep`，零复制）；场景回合结束（`turnEnd`）或场景已冻结 → 换边；A 一个完整回合 → B，B 跑完 → `cycle++` 回 A；已 won/lost 的场景冻结并跳过（另一侧照常推进、cycle 仍递增）。
   - `dualMovePlayer(dir,to)`：**只在回合边界**搬玩家（`allies` / `units` 双池同步、去重）——引擎队列在准备阶段从 `gb.units` 重建，故不会留下陈旧队列（R4）。
   - `dualReinforce(dir,sceneKey)`：从**未上场队列**按顺序取，满血现建（走 `buildGroupBattlePets` 唯一入口），空队/全员不可战跳过继续；用尽 → null → 该场景判败 → 整场立即判负（D3，不等另一侧）。
   - `dualEndTurn`：两侧都 won → 整场胜；否则换边。
   - `dualMergedBattle(dir)`：把两侧拼成**只读门面**（allies 去重、敌人合流、日志带 `A·`/`B·` 前缀、turn = cycle），供战报/统计/历史/发奖统一消费。
   - `dualSceneLabel` / `dualTakeNotes` / `dualPendingCount`：场景状态文案、一次性提示、剩余替补数（都只有一份实现）。
2. **`page/game-render.js`（接线 + 渲染）**
   - `startGroupTrial` 里新增**唯一** multi 分支：`glv.mode==='multi'` → `_startDualGroupTrial()`。单场景关卡根本不进这里，既有路径逐字不变。
     - 初始派驻：编队顺序第 1 支 → A、第 2 支 → B；**两支任一建不出可战单位 → 提示不可开战**（不静默降级成单队）。
     - 敌人：每侧各调一次 `groupStageEnemies`（每侧**完整编成**）→ `applyMultiSceneScale` → id 前缀 `enemyA-` / `enemyB-`（两栏 `data-uid` 不打架）。
     - RNG：**一个 `makeSeededRng(_groupSeed)` 注入两个 gb**（Q12：不用「同种子两实例」，否则两侧掷同一序列）。
     - 双场景**不做时间旅行**（两个 gb 的联合快照未定义）：`__groupSnaps` / `__groupInitSnap` 清空，`_groupStep` 跳过存快照。
   - `_groupStep` 改为「先取当前场景 → `_dualStepOnce()` 推进 → 活指针跟随新场景」；`_groupBattle` 从「唯一战斗对象」降级为「当前推进场景的指针」，日志/特效/过渡继续按它工作（双栏渲染代码因此只有一份）。
   - 导演 `notes` → toast：`🔄 场景 X：某队上场（满血接力）` / `🏆 场景 X 已清场（冻结）` / `💀 场景 X 全灭，已无替补`。
   - `renderGroupBattlePane(gb, sfx)`：**容器 id 参数化**（A 栏沿用 `gbArena*`，B 栏 `gbArenaB*`）；双场景每栏 dense 阈值从 7 降到 **5**（两栏更窄）。
   - `renderGroupOverlay`：双栏 `.gb-dual` 两 pane + 栏头「场景 A/B + 队名 + 状态（推进中/待机/已胜（冻结）/已败）」；控制条改「双场景 · 回合 cycle · 当前 A/B · 替补 N」；顶部血量条用**两侧合计**；焦点只落在当前推进那一栏。
   - `_gbFindUnit(uid)`：两个场景都查（单位详情 / 技能 / 玩家技能 / 天赋弹层共用）。
   - 关闭战斗 / 每次开战入口都清 `_groupDual`；导出只读探针 `window.__groupDualState()`（与 `__groupRelayNext` 同类）。
3. **结算仍单入口**：`_groupDone` 在双场景下把 `dualMergedBattle` 门面当 `battle` 传下去 —— 奖励 / 通关解锁 / 受伤判定 / 统计 / 历史 / 结果面板**全部复用既有那一份代码**，没有第二套奖励链。
4. **样式**（`page/index.css`）：`.gb-dual` / `.gb-dual-pane(.active/.frozen)` / `.gb-dual-hd` / `.gb-dual-st(.st-won/.st-lost)` / 两栏内 `.gb-arena-row` 与 `.gb-arena-mid` 收紧；新增 `--gb-dual-arena-h:13vh` / `--gb-dual-mid-h:4vh` 两个令牌；全部走既有令牌（圆角 `--rad-sm`=0）。
5. `page/index.html` 插入 `<script src="group-dual.js?v185">`。

### 修复

1. **替补队列空转**（开发期自查发现）：`createDualBattle` 起初没有把 `buildSquad` 放进 `dir`，`dualReinforce` 读 `dir.buildSquad` 得到 undefined → 队列被一轮轮空转耗尽 → 明明还有替补却当场判败。已修为构造 `dir` 时显式带上 `buildSquad`。
2. **陈旧导演接管下一场**（同上）：`_groupDual` 原先只在关闭战斗时清空，若「打完双场景关 → 自动连打单场景关」，`_groupStep` 会继续推进早该结束的双场景。已在 `startGroupTrial` 顶部无条件 `_groupDual = null`。

### UI 调整

双栏战场（每栏独立广场 + 栏头状态）；控制条文案改双场景口径；两栏焦点高亮互斥。

### 已知限制 / 待阶段 E

1. 双场景不做时间旅行（`↩` 回退只看得到两侧各自最近一次快照之外的状态）；未上场替补在回滚中不可恢复。
2. 合并战报里 `A·` / `B·` 前缀已标明来源，但**回合号各场景独立**（不改写引擎日志）；统计把两侧场地伤害 / 持续伤害**求和** —— 两侧同一场地时数值会翻倍，属如实统计。
3. `MULTI_SCENE_ENEMY_SCALE = 0.85` 仍是设计初值，真机平衡后在阶段 E 定值。
4. 玩家不可被选为目标但仍**照常出手**（Q4）：双场景下玩家在两侧各出手一次，这是设计意图，不是 bug。
5. 360×640 双栏的密集阵（5 我 + 3 敌）尚未真机复核 —— 阶段 E 第一件事。

### 测试

1. 新增 `scripts/test-dual-battle.js` **78 断言**：缩放（含不改原编成 / 下限 1）；建场（A←一队、B←二队、玩家只在 A 且 `attackable=false`、两 gb 同一 rng 引用、都 `'pets'`）；玩家搬移（双池同步、不重复、搬回干净）；推进（换边、cycle 递增、不自己结束）；替补（A 全灭 → 取队列补到 A、B 不被偷、队名更新）；替补用尽 → 整场立即判负（B 甚至没打完）；两侧清场 → 整场胜且结束后再推进为空拍；合并门面（玩家去重、敌人 = 两侧合计、日志前缀、turn=cycle）；确定性（同 seed 两跑同胜负同步数）；两栏渲染（id 后缀、dense 阈值、状态文案）；源码守卫（系数唯一、渲染函数参数化且只调同一份、`glv.mode` 条件判断唯一）；集成段（真调 `_startDualGroupTrial` 开 g18-5：两场景俱在、玩家 `_untargetable`、敌人 id 前缀、base = 0.85、第 3 队进替补队列、真 UI 推 12 拍不抛错）。
2. `scripts/test-attackable.js` 的阶段 C 门禁按阶段 D **同步改写**：从「没有任何生产代码消费 `mode:'multi'`」改为「唯一消费方 = 开战入口，且导演层与 `mode` 解耦」。
3. 全量 **84 套件 / 0 失败**；`test-a11y-tokens` **40/40**。
4. 缓存戳 `?v184` → **`?v185`**（56 处，含新增脚本）。

---

## v2.14.20

Date: 2026-11-26

**玩家口径 —— 阶段 C：`attackable(u)` 单源目标过滤 + 关卡 `mode` 字段（仍不启用多队）**（设计定稿 `doc/design-pet-squad-battle-v1.md` v1.2 §5 / §6 / §10）

### 新增功能

1. **唯一目标过滤助手 `attackable(u)`**（`page/battle-group.js`）：`!!u && u.hp > 0 && !u._untargetable`。
   - 语义来自 Q4 复核裁决 1：**玩家作唯一单位轮流在场，敌人视玩家不存在** —— 敌方一切「敌方→我方」目标集合（单体选靶 / AOE / 随机 / 反噬 / 场地遍历）都排除玩家，且玩家**不吃任何来源伤害与状态**。
   - 单一判据：以后新增取目标的地方一律走它，禁止再各写一份 `hp > 0`。
   - **普通战斗零变化**：没有任何单位带 `_untargetable` ⇒ 函数严格等价于旧的 `hp > 0`。
2. **接入点（逐个目标池，不含「存活检查」类判断）**：
   - `page/ai.js`：`aliveOpponents` / `aliveAllies`（敌人 AI 选靶唯一入口，单点覆盖 `aiPickTarget` 的残血评分、嘲讽强制、全体技能、治疗目标）。
   - `page/battle-group.js`：`selectTargets` 的 `mates` / `foes` 双池（含 `random1` / `all` / `ally1` / `ally2` / `enemy1` / `enemy2` / `enemy12`）、嘲讽查找（两处）、**声明目标合法性**（`declaredActionValid` 与 `takeDeclaredAction`，玩家被声明为目标 ⇒ 声明作废当场重选）、强制目标 `forcedOne`、`calcSkillDamage` 的 `pool` / `allPool`（梦幻光球弹射）、蓄力重击随机目标、迷惑「误击其他敌人」池、伤害分担 `mates`、状态光环 `mates`、`onFoeHeal` 池、额外行动目标补充池；`normalAttack` 入口加**第一道闸**（打不到的单位连「落空 / 酷暑惩罚」都不触发），`groupUnitTurn` 普攻落点再加**最后一道闸**（声明/随机路径带出的陈旧目标一并过滤）。
   - 反噬：`applyReflectMitigated` 与 `reflectFlat` 按 `attackable(attacker)` 判定（玩家作为攻击者不吃反弹）；魔法镜把负面状态反射给施加者时同样跳过。
   - `page/terrain.js`：新增 `terrainAttackable`（`attackable` 的场地侧别名，单独加载时回落等价判断），统一用于沙暴抽靶 / 沙暴·雨天分档排名 / 雪天冰冻 / 酷暑全体 / 雨天潮湿 / 雨天闪电 / 毒气中毒；`applyTerrainResult` 再加一道兜底闸（伤害与 `statusApps` 都不落地）。
3. **关卡 `mode` 字段**（`page/group-levels.js`）：新增唯一派生点 `stageIsMulti(lg, st)` + 常量 `MULTI_SCENE_FIRST_LEVEL=18` / `MULTI_SCENE_STEP=6`，每关生成时写 `mode: 'multi' | 'single'`。
   - 规则（Q6 复核裁决 3「双场景敌人遇到次数比较少」）：**g18 起、每 6 大关的 x-5（精英关）** ⇒ 全期只有 **`g18-5` / `g24-5`**；**Boss（x-10）与 1–3 关永不 multi**，超出 `GROUP_MAX` 不派生。
   - `stageIsMulti` / 两个常量一并挂上 `window` 与 `globalThis`（测试与工具可读）。
4. **玩家照常出手**：`_untargetable` 只影响「能否被选为目标」，`buildActionQueue` 仍按 `hp > 0` 收人 —— 不可选 ≠ 不参战。

### 修复

无行为修复。本阶段刻意保持**既有战斗逐字节不变**：`_untargetable` 在本阶段**没有任何生产代码注入**（门禁见下），所有接入点对普通战斗等价于原判断。

### UI 调整

无。

### 阶段门禁（重要）

1. **仍不启用多队**：`mode` 本阶段**只派生、不消费**。若此刻让 `startGroupTrial` 读 `mode` 直接给玩家打 `_untargetable`，`g18-5` / `g24-5` 会变成「玩家无敌但没有第二个场景」的畸形半成品。真正的接线（导演对象 + 双场景渲染 + 轮流结算）在阶段 D。
2. 源码守卫已钉住这一条：`scripts/test-attackable.js` §8 断言「除 `group-levels.js` 外没有任何生产代码出现 `stage.mode` / `mode === 'multi'`」—— 阶段 D 开闸时这条守卫要同步改写（改成「只有导演模块可以消费」）。

### 测试

1. 新增 `scripts/test-attackable.js` **48 断言**：助手三条判据；敌方 AI 单体/嘲讽/AOE/随机/强制声明均选不到玩家；声明合法性失效；**无标记时全部照旧**（回归面：玩家仍可被选、普攻仍打到玩家与宠物）；普攻与反噬对标记单位零生效（含对照组）；四类场地（沙暴/酷暑/雨天/毒气）不伤玩家且 `applyTerrainResult` 兜底闸生效；行动队列仍含玩家；关卡 `mode` 全期恰 2 个 multi 且就是 `g18-5`/`g24-5`（Boss、g1-5、越界档均 single）；源码守卫（`attackable` 单一来源、`ai.js`/`terrain.js` 无残留裸 `hp > 0` 池、`mode` 无消费方）。
2. 全量 **83 套件 / 0 失败**（新增 1 套件）；`test-a11y-tokens` **40/40**。
3. 缓存戳 `?v183` → **`?v184`**（55 处）。

### 待裁决 / 已知限制

1. `MULTI_SCENE_ENEMY_SCALE = 0.85` 仍只是设计定值，实测定值留到阶段 E。
2. 时间旅行回滚与接力的「下一队指针不回退」（阶段 B 遗留）未在本版处理。
3. 场地分档排名（`terrainDefenceTiers`）现在也把玩家排除在外 —— 多队战斗里这是正确的（玩家不在场），但如果将来需要「玩家属性影响场地排名」，要显式给参数，别悄悄放宽这条判据。

---

## v2.14.19

Date: 2026-11-26

**小队接力 —— 阶段 B：普通战斗单队接力（单队路径与改前逐字节一致）**（设计定稿 `doc/design-pet-squad-battle-v1.md` v1.2 §3）

### 新增功能

1. **唯一增援入口 `gbReinforce(gb, units)`**（`page/battle-group.js`）：
   - `gb.allies` 与 `gb.units` **同池同步**（引擎内队列 / 属性刷新 / 天赋与场地钩子 / 日志归因全部遍历 `units`，只改一边必然漏一半）；
   - **不重建战斗对象**：敌人、固化词条、场地、RNG 种子、关卡进度全部原样，只往我方池里加人；
   - **本回合行动队列不重排**，新单位从**下一回合准备阶段**起进入队列（设计 §3「换队发生在回合之间」）；
   - 已加入过的单位**幂等不重复 push**；战斗已结束（`gb.done`）时拒绝增援；
   - 只对**新单位**补跑一次 `onBattleStart`（`talentAura(added, …)`，`ctx.allyUnits` 是 `gb.allies` **活引用**）—— 圣光麒麟·威压领域的 `_pfMates` 缓存靠这个，不补就是静默失效；老单位与敌方**不重放**。
2. **判负口径参数化 `winnerRule`**：`createGroupBattle` 新增 `opts.winnerRule`，**默认 `'all'`（含玩家，与改前逐字一致）**；`'pets'`（多队战斗用，阶段 D 才启用）只数非玩家单位（`_isPlayer`），场上没有宠物单位时**回落 `'all'`**，不会凭空判我方胜。
3. **接力接线**（`page/game-render.js`）：
   - `startGroupTrial` 只在 **≥2 支有可战宠物的小队**时挂 `gb.squadUnits`（首发宠物单位）与 `gb.reinforce=_groupRelayNext`；单队 / 旧存档派生的一队**走改前路径**（引擎里那段增援代码根本不执行）；
   - 提供方 `_groupRelayNext`：按 `getPetSquads()` 顺序接力，**现建单位 → 满血**、不继承上一队伤势，仍走 `buildGroupBattlePets()` 唯一入口（凝聚 / 共鸣 / 等级 / 共享技能与首发同一口径）；空队、全员不可战（受伤 / 阵亡已被 `canPetBattle` 过滤）→ 跳过继续找；用尽 → `null`（引擎据此判「没有替补就算失败」，即 D3 的落点）；
   - **不掷骰**：提供方不碰 `gb.rng`，同种子可复现性不受影响；
   - 上场时一次性 toast「🔄 X 上场（满血接力）」，提示即清。
4. **玩家标记**：玩家单位打 `_isPlayer=true`（普通战斗的 `'all'` 口径不看它，多队的 `'pets'` 口径据此排除玩家）。

### 修复

1. **增援/判负的时序**（实现过程中发现并固化的硬约束）：`runPhaseAction` 与 `groupBattleStep` **每行动一个单位就调一次** `checkGroupWin`，若先判负，本队全灭会当场 `done`，下一队永远上不了场。故 `checkGroupWin` 现在**先问增援、后判负**，且只在「敌方还有活口 + 本队全灭 + 提供方还给了队」三件同时成立时增援；`guard<16` 防「提供方恒给空队」。
2. **回滚不把替补带回过去**（`groupRestore`）：时间旅行回滚到增援之前的快照时，快照之后才加入的单位会残留在 `units/allies/enemies/squadUnits` 里。现在按快照 id 集合**就地 splice 摘除**（保留数组引用，避免别处持有引用失联）。

### UI 调整

1. 群战控制台之外的**画面未改**：新单位直接出现在既有 `gb.allies` 芯片列表里（渲染走同一份数据），只多了上场的一次性 toast。
2. 编队管理（阶段 A 的「🐾 编队管理」）**未改**；该区块的排序即本阶段的接力顺序。

### 测试

- 新增 `scripts/test-squad-relay.js`：**41 断言 / 0 失败**。覆盖：默认字段与 `'all'` 判负口径不变 / `gbReinforce` 双池同步与幂等 / 空数组与已结束战斗的拒绝 / **先增援后判负**（队灭不判负、用尽后普通战斗仍由玩家续战）/ 敌方先灭则不浪费小队 / `'all'` vs `'pets'` 的阈值差异 / `'pets'` 无宠物单位回落 / 增援只对新单位补 `onBattleStart`（探针天赋计数 = 1、老单位无二次派发、事件落日志 `unit=增援`）/ 提供方跳过空队与全员受伤队、拿到的是满血单位 / 回滚摘除替补 / game-render 与 battle-group 源码守卫。
- 全量 **82 套件 / 0 失败**（`test-group-determinism`、`test-group-battle`、`test-ai`、`test-group-auto*` 等既有确定性/推进套件全绿 ⇒ 未接线路径逐字节未变）；`test-a11y-tokens` 40/40。
- 版本：`APP_VERSION` → **2.14.19**；缓存戳 `page/index.html` 全部 `?v182` → **`?v183`**（55 处）。

### 文件

- **新增**：`scripts/test-squad-relay.js`。
- **修改**：`page/battle-group.js`、`page/game-render.js`、`page/utils.js`、`page/index.html`、`README.md`、`doc/changelog-v2.14.md`、`doc/VERSION-LEDGER.md`。
- **删除**：无。**未新增 `page/*.js`**（架构演化表 JS 文件数仍 **53**）。

### ⚠️ 待裁决 / 未覆盖

1. **多队双场景未上线**：`winnerRule:'pets'` 已实现但**没有生产调用点**（阶段 D 才接线）；玩家不受攻击（`_untargetable` / `attackable`）仍属阶段 C。
2. **接力发生在行动中途时的观感**：本队全灭的那一拍，若队列里还有未行动的敌人，它们本回合仍会对玩家出手；替补从下一回合开始行动。设计如此，但真机手感待复核。
3. **时间旅行的「下一队指针」不回退**：`groupRestore` 会摘掉替补单位，但 `game-render` 的 `_groupSquadIdx` 不回退 → 回滚后再灭队可能跳过一支小队（调试向功能的已知限制，非正常玩法路径）。
4. **真机未复核**：接力 toast / 新单位芯片出现时机未做 CDP 目视（阶段 E 统一复核）。
5. **队伍全灭但玩家单挑胜利仍可能**：普通战斗 `'all'` 口径下宠物全灭后玩家可继续打完并取胜（这与改前一致，是 `Q5` 的定稿结果，不是新漏洞）。

---

## v2.14.18

Date: 2026-11-26

**宠物编队 —— 阶段 A：编队数据模型 + 管理 UI（战斗逻辑零改动）**（设计定稿 `doc/design-pet-squad-battle-v1.md` v1.2）

### 新增功能

1. **多小队编队存档**（`page/pet-store.js`）：`dh-pets-v1.squads = [{id,name,petIds}]`，**不新增 store 键**（`sync.js` 与云同步零改动）。`battlePicks` 保留为**首发镜像**（恒等于 `squads[0].petIds`），旧调用点（培养页芯片 / 宠物面板芯片 / `ensurePetBattlePicksLoaded`）行为不变。
2. **唯一写入口与只读入口**：`getPetSquads()` 只读（无 `squads` 时按 `battlePicks` **派生**，不写盘）；`savePetSquads()` 唯一写（同步 `battlePicks`）；管理动作只经 `addPetSquad / removePetSquad / renamePetSquad / movePetSquad / togglePetSquadPet`，每个都返回 `{ok, reason?}`。
3. **不变量（设计 Q1）**：每队 ≤ `PET_BATTLE_MAX`(4，唯一常量来源)；**同一宠物不得同时出现在两个小队**（先到先得，靠前的队保留）；至少保留 1 支小队；队名 ≤ `PET_SQUAD_NAME_MAX`(8)、空名回落「一队 / 第N队」。
   - 写入只做「截断 / 去重 / 形状规整」，**不按物种存在性或存活状态过滤**（与既有 `battlePicks` 口径一致：写入不管，读取时由 `ensurePetBattlePicksLoaded()` / `canPetBattle()` 过滤）。
4. **旧档迁移 = 只读派生**：老存档没有 `squads` 时派生一支「一队」（成员 = 现有 `battlePicks`），**读取路径不写盘** —— 避免云同步整键覆盖后凭空写出一份空编队；首次写编队时才落盘。
5. **编队管理 UI**（`page/pet-ui.js` + `page/index.css`）：宠物面板「🐾 编队管理」原生 `<details>` 折叠区（默认收起、展开态在重渲染后保留）。
   - 每支队一张卡：首发/作战徽标、**队名内联输入**（`change` 才落盘，8 字上限）、`N/4` 计数、`↑`/`↓` 排序（**顺序即替补顺序**，第 1 队 = 首发）、`🗑` 删除（仅剩 1 队时禁用）、`＋ 新建小队`。
   - 每队宠物**芯片切换**（`aria-pressed`），受伤宠物带 ⚠️ 与 `title` 原因、队内另有「有 N 只受伤中……开战不会上场」`role=note` 提示 —— **成员身份保留，不静默剔除**。
   - 队名进 HTML 前统一 `petSquadEsc()` 转义（防注入）；样式全用既有令牌（`.speed-btn` 底座 = 44px 热区 / 2px 边 / 圆角 0 / 75ms 过渡），未新增颜色、无渐变无阴影。
6. **首发缓存同步**：编队任何改动后 `petSquadRefreshPicks()` 把 `getPetSquads()[0].petIds` 写回 `_petBattlePicks`，否则开战会读旧阵容。

### 修复

1. **`aria-pressed` 计数断言收紧（测试侧，未弱化）**：`scripts/test-pet-panel-layout.js` 原先把**整面板**的 `aria-pressed` 计数钉成 4/1，加入编队芯片后必然失真 → 改为**只在阵容区块**（`.pet-lineup` 到 `.pet-squads` 之间）计数，语义仍是「阵容芯片带切换语义」，要求不变。
2. **沙盒兼容**：`ov.querySelector` 在部分测试 mock 里不存在 → 用 `typeof ov.querySelector === 'function'` 守卫（行为与原来一致，未放宽任何断言）。

### UI 调整

1. 宠物面板在「⚔️ 参战阵容」卡之后、材料区之前插入「🐾 编队管理」折叠区；参战阵容区块本身**一个字符都未改**（仍是首发小队的选择，仍是开战入口）。
2. 新增 CSS 段 `.pet-squads / .pet-squad-card / .pet-squad-hd / .pet-squad-name / .pet-squads-body / .pet-squad-chips / .pet-squad-chip / .pet-squad-op / .pet-squad-del / .pet-squad-add / .pet-squad-warn / .pet-squad-note`（全部走既有令牌）。

### 测试

- 新增 `scripts/test-pet-squads.js`：**67 断言 / 0 失败**。覆盖：接口导出 / 旧档只读派生不写盘（比对存档字节）/ 返回值是副本 / 每队上限与拒绝原因 / **Q1 跨队互斥 + 脏档去重** / `battlePicks ↔ squads[0]` 双向幂等 / 排序与首发镜像 / 空名回落与超长截断 / 至少一队 / **伤员留在队但开战被 `canPetBattle` 过滤** / 不新增 store 键 / 重开恢复 / 单一写入口源码守卫（`d.squads =` 恰好 2 处、UI 不调 `savePetSquads`、不直接读 `.squads`、有 `petSquadEsc`）。
- 全量 **81 套件 / 0 失败**；`test-a11y-tokens` 未变（40/40）。
- `scripts/test-pet-panel-layout.js`：两条 `aria-pressed` 计数**收紧到阵容区块内**（语义未弱化）＋ 新增 **6 条编队区块 UI 契约**（位置在阵容后/材料前、默认折叠、`＋新建` 按钮、默认 1 队 × 5 只 = 5 个编队芯片、队名输入、首发徽标），**88 通过 / 0 失败**。
- 版本：`APP_VERSION` → **2.14.18**；缓存戳 `page/index.html` 全部 `?v181` → **`?v182`**（55 处）。

### 文件

- **新增**：`scripts/test-pet-squads.js`。
- **修改**：`page/pet-store.js`、`page/pet-ui.js`、`page/index.css`、`page/utils.js`、`page/index.html`、`scripts/test-pet-panel-layout.js`、`README.md`、`doc/changelog-v2.14.md`、`doc/VERSION-LEDGER.md`。
- **删除**：无。**未新增 `page/*.js`**（架构演化表 JS 文件数仍 **53**）。

### ⚠️ 待裁决 / 未覆盖

1. **战斗侧未接**：本阶段**不改变任何战斗行为** —— 多队接力 / 双场景 / 玩家不受攻击 / 关卡 `mode:'multi'` 全部未施工（阶段 B–E）。
2. **真机未复核**：编队 UI 的 390/360 目视、折叠区滚动位置未做 CDP 校验（阶段 E 统一复核）。
3. **培养页（`game-views.js`）未接入编队入口**：那里仍只编辑首发（`battlePicks`），管理多队需进宠物面板 —— 是否在培养页加二级入口待作者定。
4. **改名交互**：用 `change`（失焦/回车）落盘，改名后会重渲染面板（焦点丢失）；若要"边打边看"的即时输入需改防抖方案。
5. **删除小队无二次确认以外的保护**：删除后其成员回到"未编队"状态（宠物本身不受影响），但**不自动补进首发**。

---

## v2.14.17

Date: 2026-11-26

**宠物天赋补齐（R/SR 6 只新增）+ 战意/梦幻/不动如山数值调整**（作者规格 10 项，施工记录见 `doc/plans/v2.14.17-施工记录.md`）。三项口径经作者裁决：① 先制度改引擎让我方生效；② 磐石反噬**过减伤但不过防御**；③ 雷鸣加速 CD-1 **只对持有者自己的技能**。

### 新增功能

1. **6 条 R/SR 宠物专属天赋**（`page/pet-codex.js`，全部 `petOnly:true`、固有、忽略存档）：
   - **水水滴 · 雨中疾行**：雨天（`gb.terrain.id === 'rain'`）时 `base.spd ×2`，回合末还原（`phase:'prepare'` + `onTurnStart`/`onTurnEnd`，灵感涌动同口径）。
   - **闪闪星 · 星芒庇护**：受击 **40%** 几率 `dmgTakenReduce 0.25`。
   - **火焰鸡 · 斗志昂扬**：攻击（`onAfterDamage`）/ 受击（`onDamage`）各 **25%** 几率 `base.spd +1`，**本场永久累积**。
   - **坚强岩 · 磐石反噬**：受击反弹 `(自身def + 自身soulDef) ×10%`，**不按敌人防御做减法**，但敌人的减伤天赋 / 护盾 / 格挡仍生效。
   - **清脆鸟 · 共鸣之歌**：我方任一单位真正施放技能后，自身回 **2%** 最大生命。
   - **雷霆犬 · 雷鸣加速**：我方任一单位真正施放技能后 **20%** 几率使**自身**技能冷却全部 **-1**（只改持有者自己的 `counters.cd`）。
2. **新引擎钩子**（`page/battle-group.js`）：
   - `onAllyCastSkill`：`castSkill` 成功施放后对我方全体派发（蓄力首次施放的早退路径不触发），清脆鸟 / 雷霆犬共用。
   - `reflectMitigated` mutation：定值反弹，新增通用消费函数 `applyReflectMitigated()`，覆盖普攻 / 技能 / 玩家主动技能三条受击通道。
   - 准备阶段 `onTurnStart` 的 ctx 补 `terrain: gb.terrain`（雨中疾行判定用）。
   - `predeclareActions` 扩展为**我方先制技能持有者也预声明**（走同一个 `pickSkill`，不额外掷骰），行动阶段由 `takeDeclaredAction` 消费；否则技能级 `priority` 对我方恒 1/0 —— 这是让战意灌注先制度真正生效的前提。

### 修复 / 数值调整

1. **不动如山每回合恢复 3% 最大生命**（`immovable.onTurnEnd`，满血不空放、带事件）。
2. **战意灌注吸血 5%~50% → 10%~100%**（`range.lifesteal`；技能吸血 7.5%~32.5% 不变）。
3. **梦幻光球治疗 -40%**：`skill.js` bounce 分支 `selfHealAmount = missed × base × healScale`，`p_dreamball` 传 `healScale:0.6`（默认 1，不影响其他 bounce 技能）。
4. **战意灌注先制度语义反转**：技能自身 `priority:1`，删除给被灌注友方的 `priorityBonus:1` 与 `warmight.data.priority` 写入。

### 测试

- 新增 `scripts/test-pet-v21417.js` **48 断言 / 0 失败**：逐项验证 10 项改动（含 200 次采样触发率、雨天/非雨天、CD 只改自己、反弹过减伤不过防御）。
- 更新 4 个既有套件的旧口径断言（**未弱化**）：`test-engine-wiring`（我方唯一先制技能 = `p_warmight`）、`test-pet-codex`（R/SR 天赋挂载）、`test-pet-skills`（吸血区间 / 先制度改技能自身 / 镜像缩放）、以及随之修正的 t=0/t=1 数值。
- 全量 **80 套件 / 3405 断言 / 0 失败**（`test-ai.js` 本次未 flaky）。
- 缓存戳 `page/index.html` 全部 `?v180` → **`?v181`**（55 处）；`APP_VERSION` → **2.14.17**。

### 文件

- **新增**：`scripts/test-pet-v21417.js`、`doc/plans/v2.14.17-施工记录.md`。
- **修改**：`page/pet-codex.js`、`page/battle-group.js`、`page/skill.js`、`page/utils.js`、`page/index.html`、`scripts/test-engine-wiring.js`、`scripts/test-pet-codex.js`、`scripts/test-pet-skills.js`、`README.md`、`doc/changelog-v2.14.md`、`doc/VERSION-LEDGER.md`。
- **删除**：无。**未新增 `page/*.js`**（架构演化表 JS 文件数仍 **53**）。

### ⚠️ 待裁决 / 未覆盖

1. **真机浏览器未复核**：新天赋的执行链路均为源码 + Node 测试验证，未做 CDP 390/360 目视。
2. **雨中疾行的只在准备阶段判定天气**：若回合中天气变化（当前引擎无此机制），本回合速度不跟随。
3. **斗志昂扬的永久加速**每回合可叠，长期战斗速度无上限（按作者字面「直到战斗结束」实现）。
4. **磐石反噬**对玩家攻击者的格挡走 `playerBlockHook`，对敌方无格挡（引擎现状）；反弹下限 1。
5. **我方预声明**目前只对「拥有先制技能的我方单位」启用，非先制单位维持行动阶段随机选（保持 RNG 序列与旧行为一致）；若未来我方新增多个先制技能，声明窗口需复核。

---

## v2.14.16

Date: 2026-11-04

**宝珠系统四项施工 + 培养页精简 / 出战阵容常驻**（作者远程需求）。口径两处经作者裁决：分解返还按「**等同加成 %**」；「培养页太冗长」与「出战宠物太不明显」**两处都改且合并**。本版只动宝珠经济、图标与 UI 折叠/接线，**未改任何战斗数值、未改引擎、未改掉落概率**。

### 新增功能

1. **分解等价碎片**（`page/orbs.js`）：删除旧 `ORB_DECOMPOSE = { R:8, SR:10, SSR:20, UR:40 }` 品质定额表（它不看等级），改为 **`orbDecomposeShards(orb) = orbPct(orb)`** —— 加成多少个百分点就返还多少碎片。**R·Lv1 = 10 碎片**（基准），随品质 / 等级连续单调递增：`R·Lv10 = 19`、`SR·Lv25 = 68`、`SSR·Lv40 = 148`、**`UR·Lv50 = 297`**；仍以 `ORB_QUALITY_SPEC` 为唯一数值源，不另建表。`decomposeOrb()` 改用该函数，UI 分解 toast 同步改报**实际返还数**。
2. **恢复宝珠合成**（`page/orbs.js`）：`ORB_SYNTH_COST = 20` 碎片 → `randomOrbType()` 随机类型 + **R·Lv1** 宝珠，**100% 成功**，每日最多 `ORB_SYNTH_DAILY_LIMIT = 5` 次（作者裁决，非旧文档的 65% 成功率）。新增 `orbSynthState(data, todayKey)`（跨日读时归零、脏数据夹紧）、`orbSynthStatus(data, todayKey)`（可合成 / 碎片不足 / 已达上限三种状态与原因）、`synthOrb(data, todayKey)`（**失败不扣碎片、不计数、不入库**）。`rollOrbDrop()` 与合成共用 `randomOrbType()`。
   - **每日计数存 `data.orbSynth = { dayKey, count }`，放在 `pets` 存档对象内部**：不新增 store key，随 `sync.js` 从 schema 注册表自动派生的 `keys` 一起云同步；`page/pet-store.js` 的 `defaultValue()` / 无 store 回退默认对象 / 新建默认对象三处补齐，旧档缺字段时优雅退化为空计数（**不迁移、不追溯补偿**）。`MATERIAL_SOURCES.orbShard` 文案改为「隐藏挑战胜利掉落 / 分解宝珠返还（等价碎片）」。
   - `todayKey` 由 UI 经 `dateKey(new Date())` 注入：`orbs.js` 保持**纯逻辑**，不依赖 `Date` / `date-roll.js` / DOM / store。
3. **宝珠图标**：新增 `page/media/orbs/{hp,atk,soulAtk,def,soulDef}.svg` ×5（48×48、`viewBox="0 0 48 48"`、`shape-rendering="crispEdges"`、16×16 像素网格，与 `pets/` `skills/` 现有图标同风格）；`page/pet-ui.js` 新增唯一入口 `orbIconUrl(type)` / `orbIconHtml(type, size)`，接入库存行与 **5 个槽位（含空槽）**，显示尺寸统一 **32px**（16 的整数倍；24px 不是 16 的倍数，格宽不匀）。`page/challenge.js` 隐藏挑战结算面板同步接入，用 `typeof orbIconHtml === 'function'` 守卫 + `🔮` 兜底（该文件比 `pet-ui.js` 先加载，但结算面板是运行时渲染，届时全局函数已挂载）。

### 修复

1. **「修复 2」升级提示显示 `+undefined`**：`page/pet-ui.js` 升级 toast 读 `u8.stat`，而 `upgradeOrb()` 返回 `{ ok, level, rarity, promoted, pct }`，**没有 stat 字段**。改为报 `u8.pct`（加成百分点），并在 `u8.promoted` 时追加「升品质 `<rarity>`」。`scripts/test-orb-wiring.js` 新增源码守卫，禁止该字面量回归。
2. **旧档兼容**：`getPetStore()` 读到无 `orbSynth` 的旧存档时补 `{ dayKey: null, count: 0 }`，不会因 `undefined` 导致合成状态计算异常。
3. **分解 toast**：由固定文案改为显示 `decomposeOrb()` 返回的 `shards`，与新返还口径一致。

### UI 调整

- **宝珠库存**（`pet-ui.js`）：`orbBagHtml()` 常显合成按钮 `data-orb-synth="1"` + 今日 `N/5` 计数 + 禁用态与原因行；库存列表改原生 `<details class="orb-stock">` **默认折叠**；每行加 32px 图标、分解按钮显示实际返还碎片数。合成原因行用独立 `.orb-synth-hint`（**不复用 `.pet-mat-hint`** —— 后者被 `test-pet-exchange-list.js` 的全面板类名断言占用，复用会误判为互兑禁用原因）。
- **宠物列表精简**：把原 `_rows.forEach(...)` 抽成 `_petCardHtml(r)`，`参战 / 可用` 常显，`受伤 / 成长中 / 阵亡` 收进默认折叠的 `<details class="pet-rest">`（无可用宠时默认展开其余组）。
- **培养页出战阵容常驻**（`page/game-views.js` `renderTrainView()`）：替换原「一行标题 + `data-open-pet` 大按钮」，新增 `.train-lineup` 卡 —— `⚔️ 出战阵容` 标题 + `N/4` 计数 + 成熟宠芯片按钮 `data-train-pick` + `#trainStartBattle` 开战按钮 + 次级「🐾 更多养成」入口。选中态**只由 `aria-pressed` 表达**、CSS `[aria-pressed="true"]:not(:hover)` 上色，不写内联 style（避免视觉态与无障碍态漂移）。
  - 切换逻辑与 `pet-ui.js` **同源**：`ensurePetBattlePicksLoaded()` → `_petBattlePicks` → `savePetBattlePicks()`；就地更新 `aria-pressed` / 计数 / 提示语，**不整块重绘**，保住 `<details>` 展开态。
  - 开战仍走唯一入口：`currentGroupStageId()` 取当前进度关 → `startGroupTrialWithPets(stage, picks)`（缺模块时兜底 `startGroupTrial(stage)`），**不另建战斗对象**。
- **培养页材料 / 获取记录**：两张长卡合并进默认折叠的 `<details class="train-mat-fold">`。
- **样式**（`page/index.css` 末尾追加 v2.15 块）：`.orb-ico`（`image-rendering:pixelated/crisp-edges`）、`.orb-bag*`、`.orb-synth-btn`、`.orb-synth-hint`、`.orb-stock*`、`.orb-bag-item*`、`.pet-rest`、`.train-lineup*`、`.train-pick-chip`、`.train-start-battle`、`.train-more-pet`、`.train-mat-fold*`、`.train-fold-hint`、`.train-mat-body`。全部只用既有令牌；**0 圆角 / 无阴影 / 无渐变 / 无半透明 / 触控 ≥ `var(--touch-min)` / 原生 `<details>` 键盘可达**；禁用态用中性描边 + `--text3` 而非 `opacity`，并带 `:hover` 覆盖 `.speed-btn:hover` 反色规则。
- **缓存戳**：`page/index.html` 全部 `?v179` → **`?v180`**（55 处），CSS link 与脚本顺序不变（`pet-ui.js` → `orbs.js` → `game-views.js`）。`page/utils.js` `APP_VERSION` → **2.14.16**。

### 测试

- `scripts/test-orbs.js`：**66/0**。分解断言由「SR 返还 10」改为等价碎片（`DEC_CASES` 逐格核对 R/SR/SSR/UR × 等级 / 满级 + 单调递增 + 越界仍 297）；新增 v2.15 合成段（常量、跨日归零、脏数据夹紧、三种状态、100% 成功、扣碎片 / 入库 / 计数 / 落盘、失败不扣、每日上限、跨日重置、跨日不追溯补偿、`randomOrbType()` 400 次采样覆盖 5 类型）。
- `scripts/test-orb-wiring.js`：**69/0**。旧反向断言「合成已移除（`synthOrb` 不再是函数）」**反转**为「合成已恢复」；新增常量 / 函数暴露、`orbSynth` 默认存档与旧档补齐、合成→落盘→回读往返、分解等价碎片与 R·Lv1=10、图标资源与 `orbIconHtml(t, 32)`（且无 `orbIconHtml(t, 24)`）、培养页阵容 / 折叠接线、`challenge.js` 结算图标、修复 2 守卫、`.orb-synth-hint`（只扫 `orbBagHtml()` 函数体，避免误判文件其它处合法的互兑原因行）。
- `scripts/test-sync-coverage.js`：**36/0**。`SAMPLES.pets` 加 `orbSynth: { dayKey:'2026-09-15', count:3 }` 并新增往返断言（换设备不重置次数）。
- 回归确认：`test-pet-exchange-list.js` **109/0**、`test-page-load.js` **ALL PASS (27)**、`test-a11y-tokens.js` **40/40**（断言未弱化）。全量 **79 套件 / 0 失败**。
- 5 枚 SVG 用 Python `xml.etree.ElementTree` 校验：全部可解析、规格正确、`<title>` 存在；`atk/def/hp/soulAtk` 各 52 个 `rect`，`soulDef` 56 个，输出 `ALL SVG OK`。

### 文件

- **新增**：`page/media/orbs/atk.svg`、`def.svg`、`hp.svg`、`soulAtk.svg`、`soulDef.svg`（5 个）。
- **修改**：`page/orbs.js`、`page/pet-store.js`、`page/pet-ui.js`、`page/game-views.js`、`page/challenge.js`、`page/index.css`、`page/index.html`、`page/utils.js`、`scripts/test-orbs.js`、`scripts/test-orb-wiring.js`、`scripts/test-sync-coverage.js`、`README.md`、`doc/changelog-v2.14.md`、`doc/VERSION-LEDGER.md`。
- **删除**：无。**未新增 `page/*.js`**（架构演化表 JS 文件数仍 **53**）。

### ⚠️ 待裁决 / 未覆盖

1. **合成是碎片汇**：20 碎片换 1 颗 R·Lv1，而分解该颗只返 10 —— 按作者明确规格实现，未做闭环补偿。
2. **月重置覆盖不全**：`d.orbs` 里未装配宝珠的等级不回 1（初始介绍已登记，本轮未要求修，未处理）。
3. **空槽装配固定取 `stock[0]`**（未改）。
4. **旧文档仍滞后**：`CONTEXT.md:44` 仍写「65% 合成率」、`doc/design-v2.0.md §2.7` 仍是旧 `N/R/SR/SSR` 扁平数值表；本轮以 `page/orbs.js` 与 `doc/HANDOFF.md §6.6` 为准，**未同步旧设计文档**（属设计阶段改动，按 `AGENTS.md` 不 bump 版本）。
5. **真机浏览器视觉未复核**：折叠态、32px 图标、`.train-lineup` 在 390/360 双宽度的实际表现未做 CDP 量测；本轮验证均为静态源码守卫 + Node 测试。

---

## v2.14.15

Date: 2026-10-01

**敌群「自动战斗」升级为「自动连打下一关」**（作者澄清：「我说的自动战斗是指可以自动下一关……直到失败/手动关闭」）。v2.14.14 只做到自动出手，本版补上自动进关。

### 连打链路（全在 `page/game-render.js`，无第二份推进/建场逻辑）

`_groupDone()`（结算+发奖+记通关+写历史之后）→ `_armGroupAutoNext()` → `groupNextStageId()`（用 `allStageIds()` 的线性顺序，与 `markGroupStageCleared` 同一份表）→ `scheduleGroupChain()`（`GROUP_AUTO_NEXT_MS = 1400ms`）→ `_groupChainEnter()`（复核 `_groupAuto` / `_groupPaused` / `groupAutoViewActive()`）→ `closeGroupSettlementPanel()` → **`startGroupTrial(next)`（唯一开战入口，与关卡列表点击同一个全局符号）** → 安全阀校验 → `_groupAuto = true` → `renderGroupOverlay()` + `_groupStep()`（唯一出手入口）。

**自动状态跨关**：`_groupDone` 开头先置 `false`（结算期间不出手），胜利分支在**全部副作用之后**重新置 `true` 并排队；`startGroupTrial` 内部会把开关清成 false，故 `_groupChainEnter` 在开战**之后**再恢复 true —— UI 不会中途闪回「关」。

### 四条停止路径

| 路径 | 行为 |
|---|---|
| **胜** | 排队下一关（`_groupChainNext`），1.4s 后进入并继续自动 |
| **负** | 清队列 + 清定时器 + 关自动，**不重试同一关**，记原因 |
| **无下一关** | 停 + `toast(「🏁 已是最后一关，自动连打结束」)` + 战果面板文案 + 开关 `title` |
| **手动 ⏸** | 立即停，**并取消「已排队但未开始」的下一关**（`_groupChainNext=null` + 清两个定时器） |

切 tab / `document.hidden` / ✕ 关闭 走同一条 `stopGroupAuto` 链（`app.js` 既有接线天然覆盖），落地前再复核 `groupAutoViewActive()`。

### 安全阀（防死循环）

`_groupChainEnter` 必须同时满足「无异常 + 战斗对象已换新 + 未结束 + `_groupStageId === next`」，否则**立即停**：清队列、不重排定时器、`toast(「⚠️ 自动连打已停：…」)`、`console.warn` 留痕，并把 `_groupStageId/_groupRewarded` 回滚到「上一关已结算」状态（仅当战斗对象未被换掉），堵住「旧战斗 + 新 stageId → 奖励记到没打过的关」。

### 幂等证据

连打 3 关 → `reward` 与 `cleared` 记录均为 `g1-1, g1-2, g1-3` 各一次，再跑 40 拍仍各 1 次，`reward.length === cleared.length`；真机：技能点 10→18→28、`winCountThisWeek` 2→3→4、`battleHistoryList()` 5 条 = 5 场结算、`progress = g1-1…g1-5` 各一次。

### 测试

- 新增 `scripts/test-group-auto-next.js` **154 断言**：源码守卫（只出现 `startGroupTrial(next)`、无 `createGroupBattle`/`groupBattleStep`、两定时器各只有 1 处 `clearTimeout`、`GROUP_AUTO_NEXT_MS ≤ 1500`）、胜利进关与状态跨关、逐关奖励各 1 次、失败不排队不重试、最后一关三处提示、⏸ 取消已排队、四类离开路径整链停且定时器清零、两种安全阀、手动模式不受影响。
- `test-group-auto.js` 135 → **172 断言**，只改 3 条（作者澄清使「胜利不再等于停止」）：胜利后 `_groupAuto===true`/`aria-pressed="true"`/「⏳ 连打中」，失败分支逐字保留原语义；§5 另**新增** 4 条按关计数断言。其余 132 条一字未改。
- 全量 **79 套件 / 0 失败**（6465 断言）；`test-a11y-tokens` **40/40**。
- 真机连打：g1-1 →（1.39s）g1-2 →（1.40s）g1-3，全程 `auto=true`；⏸ 队列窗口内点 → 4s 后仍未跳关；切 tab → 立即停且不跳关。

### UI

按钮三态：**「▶ 自动连打」/「⏸ 自动中」/「⏳ 连打中」**（排队态绿色虚线描边，只用既有令牌）；控制条保持「👥 第 N/240 关 · 敌数 · 回合」。

### ⚠️ 待裁决

1. **自动模式下战报的 stats 层被跳过**：`GROUP_AUTO_NEXT_MS=1400 < 2000ms`，自动连打时只看到「胜负 → 战果（含奖励）」约 1.4s 就进下一关。若希望每关读完整战报，需放宽停留时间（或改成"只自动出手、手动点进下一关"）。
2. 「已是最后一关」提示在 toast / 战果文案 / 开关 title 三处，**没有常驻横幅**（避免新增字号/颜色）。要常驻需允许加一条令牌级样式。
3. 自动连打状态**仍不持久化**（刷新回「关」），沿用 v2.14.14 的约束。
4. 以「大关 id」开战（`_groupStageId=null`）时连打会停并提示「当前关卡未知，无法连打」（保守，不会写错关）。

---

## v2.14.14

Date: 2026-10-01

**敌群战斗增加「自动战斗」**（作者远程需求：「敌群战斗增加自动战斗」）。

### 开关与节奏

- 敌群战斗控制条新增 **「▶ 自动 / ⏸ 自动中」**（`#gbAuto`，`aria-pressed` 表达状态），**默认关**，每次开战重置为关，**不持久化**。
- 速度档 **×1 / ×2 / ×4**（默认 **×2**）：一拍间隔 = 基准（700ms，气泡停顿 900ms）÷ 档位 → **700 / 350 / 175ms**。
- 持久化键 **`dh-group-auto-speed`**（与关卡挑战 `dh-battle-speed`、敌群旧键 `dh-group-speed` 都不同）；旧键只作**读兜底 + 写镜像**（旧值 `8` 归一到 `4`，设置不丢）。

### 推进方式：复用同一个入口（关键）

自动**没有第二份推进逻辑**：`_groupAutoStep()` 里只有一句 `_groupStep()`；`#gbAuto` 与手动 `#gbStep` 处理器调用的也是 `_groupStep()`（零参数、同一签名）。
`_groupStep()` 入口有重入守卫（`_groupAutoStepBusy` + `try/finally`），上一拍未完不进下一拍；**无 `setInterval`**，全部 `setTimeout`。

### 四个停止条件

| 条件 | 实现 |
|---|---|
| ① 战斗结束（胜/负、奖励已结算） | `_groupDone()` → `cancelGroupAutoTimer()` + `_groupAuto=false` |
| ② 用户点「⏸」 | `stopGroupAuto()` + 重绘 |
| ③ 离开视图 / 切 tab / 页面隐藏 / 关闭 | `#gbClose`、`app.js switchTab()`、`onBattleVisibilityChange()`（`document.hidden`）、以及**每拍复核** `groupAutoViewActive()` |
| ④ 需要用户决策（详情/技能/天赋弹层） | `pauseGroupBattle()` → **降级为暂停**（关开关 + 清定时器），关弹层**不会**自动续跑 |

**定时器唯一清理点**：`cancelGroupAutoTimer()`，`_groupDone` / `stopGroupAuto` / `#gbClose` / 改速度 / 开新战 全部经过它。

### 幂等

沿用既有 `_groupRewarded`：自动、手动、连点、尾拍都走 `_groupDone`，**奖励只发一次**。实测自动跑完再额外推进 100 次，`groupVictoryReward` / `markGroupStageCleared` 仍各 1 次。

### 测试与验证

- 新增 `scripts/test-group-auto.js`（**135 断言**）：同一入口（源码守卫 + 运行期 spy）、**同 seed 下自动 10 拍 ≡ 手动 10 次**（回合/日志/HP/状态/rng 全等）、结束自动停且定时器为 null、`visibilitychange`/切 tab/关闭 全部冻结、**奖励幂等**（再推 100 次仍 1）、速度三档与键隔离、默认关、⏸ 后仍可手动、重入守卫、样式契约。
- 全量 **78 个套件 / 0 失败**；`test-a11y-tokens` **40/40**。
- 真浏览器（agent-browser + 静态服务）：默认关 → 点 ▶ 自己推进 → 打完自动停 → 奖励落 1 次 → `switchTab` 立即停 → `document.hidden` 立即停 → 点 ×4 落盘 `dh-group-auto-speed=4`（`dh-battle-speed` 保持 null）→ **刷新后速度继承 ×4、自动仍为关**；axe overlay 作用域 **0 violations**。
- **顺带修掉一个真实对比度问题**：按下态在 `.speed-btn:hover`（前景/背景反色）下变成「近黑底 + 绿字」= **3.49:1**（axe serious）→ 规则加 `:not(:hover)`，hover 完全沿用既有反色。

### ⚠️ 行为变更（有意为之，需知会）

1. 旧的 `_groupMode`（默认 `auto`、持久化到 `dh-group-mode`）被 `_groupAuto`（默认关、不持久化）取代 → **开战不再自动走第一拍**、不再写 `dh-group-mode`；旧「循环 ×1→2→4→8」改为三档按钮，`8` 归一到 `4`；打开详情后**不再自动续跑**。
2. 结算面板的 800/1200ms 展示推进（`scheduleGroupOutro`）**未停** —— 它是展示层而非战斗决策，`⏸` 不打断它。
3. `_groupSpeed` 现在由 `applyGroupAutoSpeed()` 单一赋值：**节奏档位 = 特效档位**（×4 时特效寿命 220ms、×1 时 600ms），不再存在「节奏 ×2 / 特效 ×1」的分离组合。
4. 若希望「记住上次是否开自动」，需要新裁决（可改为持久化）。

---

## v2.14.13

Date: 2026-10-01

**作者远程三项反馈：挑战主按钮样式回归（P0）/ 炼化点数来源说明 / 宠物经验明细记录**。

### ① 关卡挑战主按钮样式丢失（P0 回归）

**现象**：关卡预览弹层的「⚔️ 挑战」按钮几乎不可见。
**根因**：v2.14.9（`9821842`）扁平化新增的守卫 `index.css:126 [style*="gradient"]{background-image:none!important}` 把该按钮**唯一**的底色（内联 `background:linear-gradient(135deg,var(--red),#dc2626)`）清空，只剩 `background-color:transparent` + `.m-btn-save` 的白字 → **白字透明底，对比度 1.00:1**。
**叠加隐患**：`.modal-actions button`（0,1,1）声明 `border:none`，压过 `.m-btn-save`（0,1,0）的 2px 边框 —— **所有弹层确认按钮的边框其实从未渲染**。

| 项 | 修复前 | 修复后 |
|---|---|---|
| background-color | `rgba(0,0,0,0)` | `rgb(37,99,235)` = `--brand-fill` |
| border | `0px none` | `2px solid #2563EB` |
| min-height / 实测高 | `auto` / 48px | `44px` / 49px |
| 对比度 | **1.00:1**（不可见） | **5.17:1** |
| 宽度（390/360） | 166 / 151（比「关闭」还窄） | 214 / 194（明显更宽） |

**修法**：按钮改用 `.m-btn-save`（实心主 CTA），去掉内联渐变；新增 `.modal-actions .m-btn-save`（0,2,0）定死 `--brand-fill` 底 + `--on-brand` 字 + 2px 同色边 + `--touch-min`，**一次性修好所有弹层确认按钮**（`#exSave/#ccSave/#cpSegConfirm/#peExConfirm/#chStart` 实测同为 2px + 44px + 5.17:1）。

**同类连带修复**（同一守卫抽掉的渐变）：
- `game-views.js:72` 培养页「我的角色」卡：两端同色的**假渐变**被抽掉 → 卡面丢底，改为实色 `var(--bg2)`；
- `challenge.js:448` 热血 buff 全屏闪光 `radial-gradient` → 平铺 `rgba(251,191,36,.18)`（扁平规范禁渐变，保留反馈）。

### ② 炼化点数怎么来（作者问：700kg 训练为什么没有）

**真实规则**（读码 + 浏览器实测）：

| 途径 | 数量 | 条件 |
|---|---|---|
| **本月力量容量兑换** | `floor(本月容量kg ÷ 100) × 10` → **700kg = 70 点** | 需**通关 9-6 解锁炼魂**；**结算时机 = 打开挑战页/刷新**（训练保存不触发）；按本月已兑换额只补差额 |
| **关卡首通战利品** | 普通关 **+2 或 +4**，BOSS **+10 或 +20** | 通关即发 |
| 不给炼化点 | —— | 隐藏挑战（给属性奖励/材料/技能点/宠物经验）、敌群试炼（给炼化石材料）、有氧训练 |

**700kg 没有炼化的三个原因**（按出现概率）：① **没通关 9-6** → 容量点不结算（实测 `cleared` 无 9-6 时 700kg → **0 点**）；② **没打开挑战页**（懒结算）；③ 训练直接产出的是**宠物经验**（kg×5 = 3500 EXP）与容量，而 🪨「炼化石」是宠物材料、与「炼化点」不是同一种东西。

**实测**：容量 700kg → 首次 `renderGame()` 后 **0 → 70**，再次渲染仍 **70**（幂等）；未解锁场景恒 0。**逻辑无漏发，未改数值**；只修文案（`（本月已获得 X）` → `（本月容量兑换 X）`，原文案会低估）并新增面板说明：常显一句 + `<details>` 折叠「🔮 获取途径」。

### ③ 宠物经验明细记录

- **存储**：`pets.levelLedger.log`（既有账本，**未新建 store key**），与发放水位 `dailyGranted`、挑战幂等键 `challengeKeys` 同一把账本 → 发放与记账原子完成。
- **每条字段**：`date / source(daily|challenge) / total / granted / dropped / cap / pets / breakdown[] / allocations[]`；`breakdown` = 力量`{kg,exp}` / 有氧`{min,exp}` / 挑战`{dmg,exp}` / other；`allocations` = 每只 `{name,amount,from,to,leveledUp}`。
- **展示**：宠物面板材料区下、宝珠上，`<details>` 默认折叠，summary 一行「📒 宠物经验明细　今日合计 +N EXP　M 笔」，展开看来源拆分与每只分配（含 Lv 变化）；summary 44px、键盘可达、纯 CSS 类、两主题可读。
- **幂等**：沿用既有水位 —— 同日重复保存恒发 0，挑战按 `runId` 去重，记录只在真正发放时写一条。

### 测试

- 新增 `scripts/test-pet-exp-log.js`：**45 断言**（来源与总量、分配和+丢弃=总量、同日重复不记账、挑战来源单独标记与 runId 去重、跨日重置、store 唯一落点 + `<details>` 契约）。
- 全量 **77 个套件 / 0 失败**；`test-a11y-tokens` **40/40**。

### ⚠️ 待裁决

1. **宠物经验日志保留上限 20 条**（既有 `PET_LEVEL_LOG_MAX`）：当日超过 20 笔时最早的当日记录会被裁掉，面板「今日合计」只统计保留部分（**实际发放不受影响**）。建议改「保留当日全部 + 历史 20 条」。
2. **炼化点结算时机**：目前只在打开挑战页/刷新时补发。若期望「训练落盘即到账」或「未通关 9-6 也先攒点数」属设计变更，未擅自改。
3. 弹层确认按钮现在都有 2px 边框 + ≥44px（原为无边框纯色块）—— 修 bug 的必然结果。
4. 热血 buff 闪光改为平铺色（径向渐变被禁），强弱只影响 alpha。

---

## v2.14.12

Date: 2026-10-01

**自定义重量（±0.5kg 精度）**（作者远程需求：「当前没有 9.5kg 选项，希望增加自定义重量功能（可 +−0.5kg）」）。

### 重量网格新增「✏️ 自定义」格

- 预设 13 档不变 → **末尾追加一格「✏️ 自定义」**（`grid-column:span 2`，13 档 + 2 列正好填满末行，无孤立行）。
- 点它展开**内联自定义条**：`−` / 数字输入 / `kg` / `+`；**± 每次 0.5kg**，也可直接输入（`step=0.5 inputmode=decimal`，**失焦与回车双入口**）。
- 范围 **0.5~200kg**，非半档值就近吸附到 0.5；**非法输入回退上次有效值 + toast**，越界夹紧 + toast。
- 值落在预设档位时**预设高亮照旧、自定义格不高亮**；非预设值该格显示「✏️ 自定义 9.5kg」并写回选择值。

### 计划编辑步进：1kg → 0.5kg

- `peExWUp/Down` 改为 **±0.5**，限幅 **0.5~200**（原 **1~50**），显示整数不带 `.0`。

### 展示统一 `fmtKg()`

记录行、计划行、计划表单、训练中页、完成汇总、快速复训标签全部改用 `fmtKg`：`9.5 → "9.5"`、`10 → "10"`、`0.5 → "0.5"`、`9.5000000001 → "9.5"`，**永不出现浮点尾巴**；老存档里的非半档值（如 9.7）**保留一位小数**，不谎报成 9.5（存储不变）。

### 实现位置

`page/tab-strength.js` 内新增 `buildWtGrid` 覆盖 `utils.js` 的同名函数（`utils.js` 本轮不可写，且该文件加载更早）。**回调协议一字未改**（`buildWtGrid(el, sel, onChg, isEdit)`，`onChg(数字 kg)`），因此 `#seWeight`（编辑弹层）与 `#strWeight`（新增一组）**两处网格同时获得自定义格，调用点零改动**；依赖的 script 顺序已用测试钉住（顺序若被调换会红，不会静默失效）。

### 样式与可访问性

- 复用既有令牌：**2px 边框、圆角 0（仅圆形 50%）、无阴影/渐变、未新增过渡**；`+`/`−` 与数值 **min-height 44px**（`--touch-min`），focus 用 2px 描边。
- `aria-label`（「减少/增加 0.5 公斤」）、`role=group`、`aria-controls` 指向本网格自定义条、`aria-live="polite"`。

### 测试

- **新增 `scripts/test-custom-weight.js`（113 断言 / 8 组）**：步进与夹紧（含连按 400 次无浮点尾巴）、直接输入（失焦/回车/逗号/非法回退/越界）、档位不被强改（含 sel=0 不高亮）、`fmtKg`、回调协议与 4 处真实调用点、**端到端**（输入 9.5 → `_strSelW=9.5` → 落库 `weight===9.5` → 记录行「● 9.5 kg」→ 训练中页 → 汇总）、计划步进、a11y/扁平风（24 条，含无空 catch、script 顺序、`utils.js` 未被改）。
- 全量 **76 个套件 / 0 失败**；`test-a11y-tokens` **40/40**。**既有测试无一条变红、无一条被弱化**。

### ⚠️ 待裁决 / 已知边界

1. **快速复训暂不带出非预设重量**：`applyStrLastSet` 仍只在命中预设档位时带出（既有测试 6.8 守着）。现在自定义格已存在，可放宽为「非预设值也带出到自定义格」，但那属**规格变更**，需作者点头。
2. `fmtKg` 对**已存在的非半档值**（如 9.7）保留一位小数而非吸附成 9.5 —— 保守解释，避免谎报数据。
3. **真机视觉未复核**：静态估算 5 列 × 44px + gap = 244px（< 390 可容纳），自定义条约 180px；建议真机看一次「✏️ 自定义 9.5kg」在 320~390 宽的省略表现。
4. 白名单外的重量展示点未动（`sync.js:524` 导出文本、`tab-profile.js` 体重），新值均为半档、`String(9.5)` 无尾数，风险为零。

---

## v2.14.11

Date: 2026-10-01

**UI 收尾三项（作者裁决）+ 逐行核验**。

### 1. 群战非行动单位：`opacity:.5` → 灰字 + 中性描边

- 之前：`.gb-focus .gb-arena-unit:not(.gb-acting)` 用 `opacity:.5` 压暗，文字实测 **2.50:1**（不可读）。
- 现在：**去掉 opacity**，`outline: 2px solid var(--bd)`（`offset:-2px`，**不占布局**）+ 名字 `--text3`。
- **实测对比度**（CDP + WCAG 公式，8 组合 = 390×844/360×640 × 浅/深 × 战斗/日志抽屉）：**深色 7.34:1、浅色 5.25:1**，全部 ≥4.5。
- **可区分性**（三重形制差，不只靠颜色）：行动者 = **品牌色 2px 环 + `scale(1.1)`（61.6×74.8 vs 56×68）+ 左侧 3px 脉冲条**；非行动者 = 中性 `--bd` 环 + scale 1 + 无脉冲条；阵亡 = 无描边 + `grayscale(1)`。
- **几何零影响**：`.gb-focus` 开/关两态，广场与 8 枚芯片的 `rect` 逐项完全一致（`geomIdentical: true`，8/8 组合）。
- 键盘：`Tab` 后 `:focus-visible` 为品牌色 2px 环（未被吞）。

### 2. 内联样式收编（62 处文本替换）

口径：**55 行 / 13 个文件 / 60 个独立声明**；62 = **51× `border:1px` → `border:var(--bw)`** + **11× 硬编码 `rgba()` → `rgba(var(--*-rgb),α)`**（2 条声明内同时含两段）。

**零风险的机制证明**（不是抽样）：
- **逻辑零改动**：把每个 `+` 行的 `var(--bw)`→`1px`、`var(--*-rgb)`→原硬编码 RGB 反向归一后，**55 行全部与 `-` 行逐字节相等**；不等的 70 行全在 `index.css`/`scripts`（属第 1、3 项）。
- **尺寸零变化**：`index.css:124` 早有守卫 `[style*="border:1px"]{border-width:var(--bw)!important}`（`--bw:2px`），内联 `border:1px` 的 computed 本来就是 **2px**；实测 `border:1px → 2px`、`border:var(--bw) → 2px`、`border-top:1px → 1px`（**9 条 `border-<side>:1px` 分隔线一条未被碰**，行号集合交叉验证不重叠）。
- **语义零变化**：红→`--danger`、绿→`--success`、黄→`--warning`、橙→`--brand`，**alpha 一字未动**。

**难度分布**：易 36 / 中 24 / 难 0。类型：结构边框 37（容器/按钮 27、模板内标签 4、缩略图 4、`--text3` 灰 2）+ 语义色描边 10 + 装饰虚线 1 + 隐形占位 1 + 叠色底 11。

### 3. `test-a11y-tokens` 标签文案

「橙底」等旧主题说法改为品牌/蓝色表述，**断言一行未改**（已复核）。同批 `test-group-ui-presentation.js` 的群战契约改为**更严**：禁止任何 `opacity<1`、钉死 `2px var(--bw)+var(--bd)`、钉死 `.gb-name→--text3`、要求两主题令牌对比度 ≥4.5，并加 `focusRules.length>0` 防空转 —— **无弱化**。

### 仍未收编（下一批）

| # | 位置 | 片段 | 难度 | 原因 |
|---|---|---|---|---|
| U1 | `challenge.js:248` | `background:#1a1a1a;border:1px dashed #ef4444` | 难 | 整块硬编码深色，需 bg+前景一起令牌化 |
| U2 | `sync.js:334/346/348` | `rgba(100,116,139,.08)` ×3 | 中 | 缺 `--neutral-rgb` 令牌 |
| U3 | `tab-settings.js:327` | `rgba(0,0,0,.25/.55)` 遮罩 | 中 | 需裁决是否并入 `--overlay` 档位 |
| U4 | `challenge.js:445` | `radial-gradient(…rgba(251,191,36,.35)…)` | 难 | 一次性特效色，收益低 |
| U5 | `linechart.js:10` | `'rgba(0,0,0,'+alpha+')'` | 难 | canvas 绘制链需改读 `getComputedStyle` |

### ⚠️ 待裁决

1. **浅色主题三处 AA 回归**（**改前已 <4.5，本轮推得更低**，非新引入）：`challenge.js:285` 绿字 **4.25→4.04:1**；`sync.js:354/357` 黄字（11px）**4.26→3.98:1**。根因：浅色 `--success-rgb/--warning-rgb` 取 700 档，同 alpha 下比旧 500 档更暗。修法二选一：**alpha .1→.07** 或 **文字色换 `--text`/`--yellow-d`**。
2. `index.css:792` 与 `test-group-ui-presentation.js:418` 注释写「**v2.18** 作者裁决」，应为 2.14.x（纯注释）。
3. U2 是否新增 `--neutral-rgb`；U3 遮罩是否并入 `--overlay`。

### 附带发现（既有缺陷，本轮未动）

- `index.css:665` 阵亡单位名字色被 `:837` 同特异性更靠后的规则覆盖（实际仍是阵营绿，灰感来自 `grayscale(1)`）；
- `360×640` 日志抽屉展开时底部裁切 **1.8px**（与 `.gb-focus` 无关，几何双态一致）；
- 全站 `[style*="var(--bw)"]` 36/36（炼化弹层 45/45）computed 全为 2px，横向滚动 0，console 0。

### 测试

`test-a11y-tokens` **40/40**；全量 **75/75 套件、0 失败**。

---

## v2.14.10

Date: 2026-10-01

**主题色改「科技蓝」+ 宠物视图扁平风验收**（作者反馈原橙色"不好看且刺眼"）。

### 主题色：橙 → 科技蓝（只换品牌强调色）

**令牌映射**：新增语义名 `--brand*`，旧名 `--orange*` 全部 `var()` 转接（`--orange:var(--brand)`）。理由：`--orange*` 全站被引用 ~110 处（含 `page/*.js` 内联 style），"同名换值"才能一次覆盖零遗漏；新代码一律用 `--brand*`。

| 用途 | 浅色 | 深色 | 实测对比度 |
|---|---|---|---|
| `--brand`（文字/边框/focus） | **#1D4ED8** | **#60A5FA** | 浅 白底 **6.70:1**、`--bg` 6.42；深 `--surface` **6.98:1**、`--bg` 7.41、`--surface-2` 5.72 |
| `--brand-fill`（只配白字） | **#2563EB** | **#2563EB** | `--on-brand #fff` 上 **5.17:1** |
| `--brand-fill-d` / `--brand-d`（hover） | **#1D4ED8** / **#1E3A8A** | **#1D4ED8** | 6.70 / 10.32:1 |

**降刺眼（大面积饱和填充 → 边框 + 文字）**

| 位置 | 改动 |
|---|---|
| `.sb-btn`（全站最多的大面积按钮：设置/同步/导出/训练完成） | 满块 `--brand-fill` → `transparent` + 2px 蓝边 + 蓝字 |
| `#syncPush`（`sync.js:362` 内联 `background:var(--orange);color:white`，旧橙 2.26:1） | 同上（CSS 属性选择器收回，未改 JS） |
| `.empty-cta` / `#petCalcDet` / `#petCellMult` / `#petFinalCellActive` | `--brand-fill` 当文字/边框色 → `--brand` |
| 旧橙叠底 `rgba(249,115,22,…)`（Boss 词缀卡、同步建议卡） | → `rgba(var(--brand-rgb),.10)` |

**保留实心**：弹层确认、战斗结算主按钮、header logo、热力图 Lv5、全部 `.active/.selected/.on` 激活态、细进度条。CDP 全文档扫描：宠物视图内 >1500px² 品牌填充只剩两个激活页签（合规）。

**未动**：状态色（红/绿/黄）、**稀有度色**（UR/SSR/SR/R）、动作库中性 chip。

### 宠物视图扁平风验收（重出审计表）

| # | 元素 | 违规 | 修前实测 | 修法 |
|---|---|---|---|---|
| 1 | `b.pet-cell-mult`「×1437%」 | 对比度 | **3.43:1** @12px/700（换蓝后 `--brand-fill` 被当文字色） | 文字改 `--brand` → **6.98/6.70** |
| 2 | `.empty-cta` | 对比度 | 3.43:1 @14px/700 | 文字与 2px 边改 `--brand` |
| 3 | `.pet-final-cell.active` | 非文字边框(1.4.11 ≥3:1) | **2.42:1** | 边框改 `--brand` → 5.72 |
| 4 | 详情「✨炼化 Lv12」(`pet-ui.js:850`) | 对比度 | 3.43:1 @20px/700（大字豁免仅余 0.43） | 内联色改 `var(--brand)` → 6.98 |
| 5 | `.hm-cell[data-l="4"]`（热力图，被 `--on-brand` 翻白波及） | 对比度 | 深色 **3.60:1** | alpha `.80→.55` + 文字 `--text` → 5.38/6.70 |

`3325ff7` 半成品检查**全部正确**：`#petCalcDet`/`#petLvChainDet` 闭合平衡、无嵌套；`summary` 实测 **322×44**（44px 热区）、原生可聚焦、`:focus-visible` 2px 描边、Enter/Space 走 UA 原生；**未误折叠主数值**（details 内 `.pet-grid/.pet-final-cell/.pet-cell-val` = 0）；折叠真生效（外框 45px，详情 1644px ≈1.95 屏）。

### 深色主题（首次复跑）

390×844 与 360×640 各跑一遍：`box-shadow / 中间圆角 / background-image / transition-duration / opacity / backdrop-filter / 四边 border-width / 对比度 / 触控 / 横向溢出` **全 0**，`console error` **0**；最弱对比 5.17:1（白字 on `#2563EB`）。浅色同样 0 违规（最弱 5.02:1）。四组共审计 **列表 86 / 详情 279 / 对比 315** 个可见元素。

### 测试

- `test-a11y-tokens` **40/40**，断言**一行未改**（其用例标签仍写「橙底」，属文案陈旧，按白名单未动）。
- 全量 **75 套件 / 0 失败**。

### 遗留

1. `test-a11y-tokens` 里的**用例标签仍写「橙底」**，与新主题不符（文案漂移，建议下一批顺手改）。
2. 群战非行动单位 `opacity:.5` → 对比 **2.50:1**，仍待作者裁决。
3. 52 处内联 `border:1px` + `rgba()` 半透明仍靠 CSS 守卫压制（未真正收编进类名）。
4. 训练页「隐藏挑战」卡仍占约 40% 屏（`challenge.js`）。

---

## v2.14.9

Date: 2026-10-01

**极简扁平风：阶段 1 验收 + 阶段 2 第一视图（训练）**（作者下发 Minimalist Flat 风格规则，作用于全局页面）。

### 阶段 1 验收（13 视图 × 390/360，CDP 读计算样式逐元素比对）

**发现并修掉 8 类违规**，其中一条是**真可访问性缺陷**（非风格问题）：

| # | 视图 / 元素 | 违规 | 修前实测 | 修法 |
|---|---|---|---|---|
| V1 | 挑战页 **激活子页签** | 对比度 | **1.00:1**（`color` 与 `background` 同色，hover 1.41:1）→ 几乎不可见 | `.tab-btn.active[style]` 用 `--on-brand !important` 收回 |
| V2 | 设置·动作库 **46 个语义标签** | 对比度 + 多色相 | **1.98 / 2.15 / 2.43 / 2.54 / 2.80 / 3.68 / 3.76 / 4.23:1** + `opacity:.85` | 统一为中性实心 chip（`--bg3` 底 + `--text` 字 + opacity 1） |
| V3 / V5 | 训练「今日速览」绿字 / 隐藏挑战黄字（叠色底） | 对比度 | 4.29 / 4.14:1 | 改实心底，品牌色改由 **2px 边条**承担 |
| V4 | 个人数据三个输入 / 有氧历史按钮 | 触控 | **38 / 40 / 38 / 39px** | 补到 `--touch-min`（44px），不新增字号 |
| V6 | 技能卡「升级」等禁用态 | opacity | `0.4` / `0.5` | 改中性 2px 描边 + `--text3`，`opacity:1` |
| V7 | 7 处内联 `border:1px` 结构边框 | 边框宽度 | 1px | 守卫 `[style*="border:1px"]{border-width:var(--bw)}`（分隔线不受影响） |
| V8 | 阶段 1 的圆角守卫**误杀圆形**（头像/FAB） | 圆角 | 圆形被压成 0 | 追加 `[style*="border-radius:50%"]{border-radius:50%}` 例外（规范允许） |

**复测全 0**：阴影 / 中间圆角 / 渐变 / 过渡>75ms / opacity<0.5 / 模糊 / 1px 结构边框 / 对比<4.5 / 触控<44px / 横向溢出 / console error。
**令牌对照表**写入 `doc/design-tokens-v2.1.md` **§14**（颜色/边框/圆角/过渡/间距/字号/阴影 旧→新 + 可机检硬规则）。

### 阶段 2 第一刀：训练视图文案折叠（`page/tab-strength.js`，仅展示层）

- 每条训练记录改为**原生 `<details>`**：摘要 = **动作 · 重量 · 实际次数**（高 **44px**、可 Tab、Enter 展开、原生 `aria-expanded`）；**目标次数 / 进度条 / 等效容量 / 倍率 / 时间戳** 默认折叠。
- 操作按钮（🔁/✏️/🗑️）留在 `details` **之外**，不会点一下就折叠；`data-a`/`data-id` 协议未变。
- 量效：训练屏文档高 **4185 → 3368px（−19.5%）**（360 下 4167 → 3373）。

### 测试

- `test-a11y-tokens` **40/40**（**未修改该测试**）；全量 **75 个套件 / 0 失败**（**未修改任何测试文件**）。
- 真浏览器：13 视图 × 2 宽度计算样式审计全 0，无横向溢出、console/page error 0。

### ⚠️ 未覆盖 / 待裁决（下一批按视图切）

1. **群战 `.gb-focus .gb-arena-unit:not(.gb-acting)` 的 `opacity:.5`** → 非行动单位文字对比 **2.50:1**；被 `test-group-ui-presentation.js` 的既定视觉契约钉住 → **需作者裁决**（建议改「灰字 + 中性边框」）。
2. **训练页「隐藏挑战」卡占约 40% 屏**（`challenge.js` 渲染）→ 要"一屏看清主信息"必须折叠它。
3. **内联样式未收编**：`page/*.js` 仍有 **52 处 `border:1px`**、3 处 `border-radius:50%`、大量 `background:rgba()` 半透明叠色 —— 本轮靠 CSS 守卫压住，建议专做一批"内联样式收编"。
4. **宠物面板/详情未抓到**（两次超时）+ **深色主题未单独复跑**（令牌深/浅两列已源码核对）。

---

## v2.14.8

Date: 2026-10-01

**平衡调整 12 条**（作者规格）：宠物侧 9 条 + 敌群侧 3 条。实现与测试在 `wip/balance-audit` 完成、squash 合入。

### 宠物侧（`page/pet-codex.js`）

| 宠物 / 技能 | 调整 |
|---|---|
| 闪闪星 · 闪耀 | 降低命中 **0%~50%**（原上限 40%） |
| 水水滴 · 打湿 | CD **3** |
| 彭彭猪 | **睡眠期间受到其他异常状态效果 -25%**（新增） |
| 雷霆犬 | 技能 CD **3** |
| 小负鼠 | 技能 CD **4** |
| 光之精灵 · 圣光守护 | **自身受伤 -20%**；**血量>50% 承担队友 25% 伤害**；**每回合结束 40% 回复最大生命×5%** |
| 梦幻 · 梦幻光球 | **不再攻击友方**；**每次弹射使下次弹射 +10%**；CD **4** |
| 无念熊 · 无影拳 | CD **3** |
| 圣光麒麟 | **不动如山**三档（>90% 免疫普通~高级负面+受伤-50%；>50% 免疫普通负面+受伤-30%；>10% 受伤-20%，**按血量取对应档、不叠加**）；**威压领域**（敌方治疗恒 -20%；**我方每次受技能伤害 50% 使随机 1 名受伤友方回复最大生命×4%，每回合 ≤2 次**）；**战意灌注**（随机 **2 名**、**先制度 +1**、攻击 **150%~300%**、吸血 5%~50%、技能吸血 7.5%~32.5%、**CD 4**） |

### 敌群侧（`page/skill.js` + `page/ai.js` + `page/battle-group.js`）

| 技能 | 调整 |
|---|---|
| 遗言 | **Boss 不发动**（在技能选择处排除，技能池未删，精英仍可用） |
| 广域防御 | 持续 **2~3 回合**、CD **7**（文案同步） |
| 治愈 | **蓄力 1 回合**；随机 1 名队友回复 **魂攻×80%~160% ＋ 目标最大生命×5%~10%**；**同目标 5 回合内再次受治愈 -40%，最多叠 -80%** |

### 收口过程（值得记录）

- 前两轮子代理分别被「工具权限被拒」与「100 轮上限」打断，半成品两次保存到 `wip/balance-audit`（`63c40ac` / `c578e31`）——**未验证的工作绝不进 main**。
- 末轮**只做收口**（范围压到"修 2 个红套件 + 补治愈抗性测试"）才跑完（60 轮）：两个套件的失败**全部是断言侧问题**（用当前血量当最大生命基数、`-80%` 期望写成 ×0.8 符号反了、用例自相矛盾），**未改任何生产代码**；治愈抗性实现本已接线（`HEAL_FATIGUE_STEP/CAP/TURNS` + `unit._healFatigue{stacks,until}`，作用于 `fx.heals` 通道且以 `def.id === 'heal'` 收窄）。
- 全量 **75 套件 / 0 失败**（`test-group-battle` 47/0、`test-pet-talents` 127/0、`test-a11y-tokens` 绿）。

### ⚠️ 待作者确认（收口代理逐条列出）

1. **治愈抗性作用面只覆盖 `heal` 技能**：宠物治疗（`p_heal`/`p_sleep`）与「净化」附带回血**既不施加也不读取** —— 若原意是"任何一次受治愈"，则属**部分实现**。
2. **战意灌注「150%~300%」的口径**：实现按「在现攻击上**再 +**150%~300%」（即 ×2.5~4.0）；若原意是「最终攻击 = ×1.5~3.0」，数值会**砍半**。
3. **治愈抗性不是状态**：无图标、不可被净化驱散、未登记 `fx-semantics`；也没有"跨战斗重置"的显式钩子（当前靠单位每场重建）。
4. **注释/文档漂移**：`battle-group.js` 与 `pet-codex.js` 头部仍写旧的「-10% / >70% 翻倍」两档，与已实现的**恒 -20%** 矛盾（**行为对、注释错**）。
5. 组合口径无测试：治愈抗性 × 镜像结界(+25%) × 威压领域(-20%) 的乘法顺序只有注释声明。
6. 治愈蓄力载荷未覆盖快照回滚、释放前目标阵亡/施法者被控等路径。
7. **数值两处硬编码**：`skill.js` 描述写死「-40%…-80%」，与 `battle-group.js` 的 `HEAL_FATIGUE_*` 常量无单一来源，调参易漂。

---

## v2.14.7

Date: 2026-10-01

**新增「宠物等级」系统**（作者需求）。

### 规格（作者原文要点）

- **成熟期以上开始累计**；**所需经验 = 目标等级 × 100**；
- 经验来源：**今日力量训练(kg) × 5** ＋ **今日有氧(min) × 20**；**挑战额外 = 本次伤害 × 1%**；
- 经验**随机分配给最多 10 只成熟期宠物，每只最多 20%**；**满级（lv50）跳过**；
- **每级 +1% 基础属性**，每属性**上限 +50% 基础值**（= lv50）；**每月清空等级**；
- 加成是**基础值（不计算加成）**，且**需额外显示等级获得的属性**。

### 实现要点

- **数据**：`pet.level` / `pet.exp`（**exp 为唯一真相**，level 由 exp 推导回写 → 脏档不会卡在错级）；新增 `levelLedger = { monthKey, dayKey, dailyGranted, challengeKeys[], log[] }`；**不迁移不补偿**（旧档按 lv0/0 读，且不回写宠物字段，schema 版本仍是 1）。
- **每日经验用"增量补发"**：`delta = 今日应得总量 − dailyGranted`，≤0 一笔不发 → **同日重复调用恒发 0**，先练 100kg 再练 50kg 与一次 150kg 等价；水印**只升不降**。
- **分配**：候选 = 成熟 + 未阵亡 + 未受伤 + `level < 50`；随机抽最多 10 只，按随机权重分到「每只 ≤ total×20%」，再逐点随机补齐取整损耗；**发不出去的余量如实丢弃并记入 `log.dropped`**（`granted + dropped === total`，经验守恒）。
- **等级加成插在百分比池之后**：`最终 = 池后值 + floor(纯基础 × 等级%)`。**不吃稀有度/宝珠/共鸣的放大**（否则 lv50 的 +50% 会变成 +800%，且每月清空会成属性断崖），**也不进凝聚基数**。
- **显示**：列表卡片加 `🏅 Lv`，详情页新增「等级 / 经验进度 / 等级提供的属性 / 完整链路（基础 → ＋等级 → ＋凝聚 → ×合计 → 最终）」。

### 需作者确认的 4 条判定（实现方已定，附理由）

1. **"今日"经验 = 按增量补发**（不是每天一次性）；防重复靠 `dayKey + dailyGranted` 水印。
2. **20%×10 只消化不完的余量 = 丢弃**（记账 `dropped`），**不留到明天**；成熟宠不足 5 只时必然发生。
3. **凝聚基数不含等级加成**（"不计算加成"双向理解：既不被放大，也不当别人的基数）。
4. **成熟期判定排除阵亡/受伤**（复用 `canPetBattle`）—— 与凝聚/共鸣"只筛 stage"**刻意不同**：不能打的宠不该吃经验。

### 已知限制 / 待办

- **有氧记录当下不发经验**（`tab-cardio.js` 不在白名单）→ 由「打开面板 / 下次力量保存 / 挑战结算」的**增量水印补齐**（不漏发、不重复）；要即时需下一批加一行。
- **总量 < 5 时整批丢弃**（20% 取整为 0，已记账有断言）；要"至少 1 点"需改常量语义。
- **小基数属性在低等级取整为 0**（如 R 宠 def=5，早期看不到 +1%）；属"整数属性＋1%/级"的固有现象。
- **速度也吃 +1%/级**（"每个属性"），但不进百分比池；若只要五项，删一处即可。

### 测试

- 新增 `scripts/test-pet-level.js`（**79 断言 / 12 节**）：升级曲线、两条来源、20% 上限、10 只上限、满级跳过、月度清空幂等、旧档迁移、等级只加基础（**反证**：+10% 生命是 +10 而非 +120）、凝聚基数不受等级影响、幂等。
- 全量 **75 套件 / 0 失败**；`test-a11y-tokens` 40/40（未引入新字号/颜色）。
- 过程中曾把经验补发挂在 `settleAllPets()` 里导致 `test-pet-panel-layout` 红 3 条（破坏"按钮 ready ⇔ 结算有可观察变化"契约）→ **撤掉该挂点**，旧断言一条未改，恢复全绿。

---

## v2.14.6

Date: 2026-10-01

**宠物「凝聚/共鸣」按作者最新裁决重写**（数值口径变更，替代 v2.14.5 的"全部进同一加算层"口径）。

### 作者裁决（第二段为准，逐字）

> **凝聚**：所有获得的**成熟期**宠物对应属性的 **3%** 计算为凝聚值（**数值，与基础值相加，不包含速度**）
> **共鸣**：所有获得的**成熟期**宠物按稀有度提供共鸣加成（**百分比**，**UR 10% / SSR 8% / SR 7% / R 6%**，**相加**）
> **最终**：`稀有度 ＋ Σ宝珠 ＋ Σ共鸣`；**`最终 ＝ (基础 ＋ Σ凝聚) × 加成合计%`**
> **所有宠物的 Σ共鸣、Σ凝聚 应相同**

### 新公式

```
S凝聚[k]  = 0.03 × Σ(成熟期宠物该属性 base)        k = hp/atk/def/soulAtk/soulDef（速度不参与）
S共鸣%    = Σ(每只成熟期宠物的稀有度档位)          UR 10 / SSR 8 / SR 7 / R 6（相加）
加成合计% = 稀有度%(本宠) ＋ Σ宝珠%(本宠) ＋ S共鸣%
最终[k]   = floor( (base[k] ＋ S凝聚[k]) × 加成合计%[k] / 100 )
速度      = base.spd（不参与凝聚、不参与百分比池）
```

**与上一版的区别**：凝聚从"进池的百分比"改回**加在基础上的固定值**（并会再被池放大）；共鸣从"阈值 3/5/7/10%"改成**按每只宠稀有度档位累加**；两者都**只统计成熟期**；且**天然是全局常量**（每只宠看到的 Σ凝聚/Σ共鸣相同）。
⚠️ 作者同一条消息里还有更早的一段（凝聚 3%、共鸣 UR3%/2.5%/2%、未提成熟期）→ **本版按第二段实现**，第一段未采用（已报备）。

### ⚠️ 本版为「未验证提交（缺专用测试）」

执行子代理**第八次撞 100 轮上限**，停在"要写新专用测试套件"处。
- 它临停前的结论：**实现 + 既有测试全绿（5808 断言）**；
- **缺失**：新专用套件 `scripts/test-pet-bonus-cohesion-resonance.js`（本版提交时存在性见下方运行日志）、以及**逐属性改前/改后对照与强度变化%**、既有测试更新清单。
- 主控以**全量测试全绿**作为提交门槛（绿才提交），并在此如实登记。

### 待补 / 待确认

1. **平衡**：本口径下凝聚会再被池放大（3% 但含参战宠、且乘 15~16 倍池），与 v2.14.5 的"净削弱"方向相反 → **g15~g20 需重测**。
2. **"成熟期"是否还要排除阵亡/受伤**：现按字面**只筛阶段**，伤病/死亡仍计入（若你要排除，改一处）。
3. 面板/实战 390×360 目视；以及"每只宠 Σ凝聚/Σ共鸣 相同"的可视化验证。

---

## v2.14.5

Date: 2026-10-01

**宠物加成改为「同一加算层」**（作者裁决：「改成按所有宠物计算，加成之间用加算」→ 选项一）。这是**数值口径变更**。

### 新公式（唯一口径）

```
基础       = 图鉴基础 ＋ 炼化 ＋ 天赋静态            （口径不变）
加成合计%  = 稀有度% ＋ Σ宝珠% ＋ 凝聚% ＋ 共鸣%      （四项【加算】、同一层）
  凝聚贡献值 = (全部宠物该属性基础之和) × 10%
  共鸣贡献值 = (全部宠物该属性基础之和) × resonanceBonus(持有总数)
  凝聚%/共鸣% = 贡献值 ÷ 本宠该属性基础 × 100
最终       = floor( 基础 × 加成合计% / 100 )         （速度不参与百分比池）
```

### 三处关键变化

1. **"全部宠物"** = 存档里所有宠物（**不排除本宠/参战/阶段/受伤/死亡**）→ 于是**每只宠的凝聚贡献值、共鸣贡献值是同一个绝对值**（旧口径下每只宠算出不同的 bench，是被排除/纳入的那只宠造成的）。
2. **凝聚/共鸣不再加进"基数"再被池放大**，而是与稀有度/宝珠**并列成百分比、同层相加** → **面板不会再出现 ×8505% 这类数值**。
3. **面板口径 = 实战口径**（都用全部宠物之和）→ 修掉"面板比实战高约 29%"的错位。

### ⚠️ 平衡影响（重要）

这是**净削弱**：旧口径下凝聚/共鸣会被稀有度/宝珠池放大（小基数宠更夸张），新口径下它们只是"相加的一个百分比"。
按作者真实存档（14 只宠）实测对照（生命，含 UR/SSR 各一）：**小负鼠 17,010 → 约 4,014**；**梦幻 29,033 → 约 17,554**（详见下方代理报告/施工记录）。
→ **g15~g20 的通过率需要重测**（本版未做，属已知待办）。

### ⚠️ 本版为「未验证提交」

执行子代理**撞 100 轮上限**（近期第七次），停在"即将跑全量测试"处 → **无报告**（落点/逐属性对照/既有测试更新清单缺失）。
主控接手：以**全量测试是否全绿**作为提交前置门槛（绿才提交），并在本段如实登记。**待补**：① 面板/实战的 390×360 目视验收；② g15~g20 平衡复测；③ "全部宠物"是否应排除蛋期/受伤/死亡（现按字面取全部，若要筛只需改一处）。

### 测试与版本三项

- 新增 `scripts/test-pet-bonus-additive.js`（公式恒等式 / 每只宠凝聚贡献相同 / 面板与实战同值 / 纯函数不写入参 / 连续调用不变）。
- 全量：以提交前实跑结果为准（绿才提交）。
- `APP_VERSION` -> **2.14.5**；`page/index.html` 缓存戳递增；台账登记已发布、指针推进到 **2.14.6**。

---

## v2.14.4

Date: 2026-10-01

两件：① **关卡试炼新增 chap34 / chap35** ② **宠物详情 ② 段加成显示拆解**（池 / 凝聚共鸣 分行）。

### 1. 关卡试炼 34 ~ 35 章（`page/levels.js`，单敌 `LEVELS`）

- **chap34 鸿蒙初辟** / **chap35 万道归墟**，各 6 关（5 普通 + BOSS 在 `x-6`，BOSS 带 `dualAffix`）；敌人名 12 个全新且**全部命中既有 18 原型**（无需新图标）。
- **数值用脚本按 ≈1.113×/章 链式外推、取 5 的倍数**（非手抄）；口径**自证**：用同一函数从 chap30 复算 chap31~33，与既有数据**逐字相等**。
- BOSS 对照（atk/def/hp/soulAtk/soulDef）：chap33 **6360/3210/60405/3010/2325** → chap34 **7080/3575/67230/3350/2590** → chap35 **7880/3980/74825/3730/2885**（相邻倍率 1.113 量级）。
- **派生链零改动**（章数徽标/列表/下一关推进/解锁/`findLevel` 全部自动派生，已用真实实现验证）；**敌群试炼未动**。
- 新套件 `test-levels-chap34-35.js`（**42 断言**）：35 章 / 每章 6 关 / BOSS 在 x-6 / 相邻倍率≈1.113 / 5 的倍数 / dualAffix / 解锁链可达。
- ⚠️ 难度：按 v2.1.34 基准属性只读探针实测，**chap34/35 目前 0%**（与 chap33 现状同性质，是留给后续成长的终局内容）；**未做难度补偿**（未授权）。

### 2. 宠物详情：② 加成拆成两行（可解释）

- 原来 ② 只有一个**合成倍数**（例：梦幻 UR `×2846%`、小负鼠 SSR `×8505%`），把三件事揉在一起：**稀有度倍率 / Σ宝珠% / 凝聚＋共鸣对基数的放大** → 作者直觉"不对"（其实算术无误）。
- 现在拆为：**稀有度＋宝珠池**（`×N%`）与 **凝聚/共鸣（基数）**（`+X`，并注明"= 基数的 N%，未上场 M 只 ×10% ＋ 共鸣 R%"）；速度仍标注不参与百分比池。
- **数值一个都没变**：③ 最终值逐属性与改前**完全相同**（新套件 `test-pet-bonus-display.js` 锁死"池×基数＝最终"与 final 不变）。
- ⚠️ 该子代理**撞 100 轮上限**、停在"修测试里两处脆断言"处 → 方案说明/浏览器截图缺失；主控实测其测试与全量均绿。**待补**：390/360 目视验收。

### 3. 顺带修：既有测试里写死的旧章数

`scripts/test-monster-icons.js` 有两处**字面量**跟着数据增长而过期：`stageCount === 189 → 201`、`Object.keys(LEVELS).length === 33 → 35`。
⚠️ 这不是"为了变绿弱化断言" —— 数据合法增长（+2 章 = +12 关），**断言强度不变**。**建议后续改成从数据派生**（本轮未做）。

### 测试与版本三项

- 全量：**72 套件 / 5673 断言 / 0 失败**（含新增 `test-levels-chap34-35` 42 条 与 `test-pet-bonus-display`）。
- `APP_VERSION` -> **2.14.4**；`page/index.html` 缓存戳递增；台账：登记「已发布」并把指针推进到 **2.14.5**。

---

## v2.14.3

Date: 2026-10-01

两件（作者要求）：① **云端数据完全同步与适配** ② **新增图鉴（技能 / 天赋 / 宠物介绍）**。两条线并行产出、主控统一验收发版。

### 1. 云同步：从"硬编码清单"改为"自动派生 + 兼容旧载荷"

- 同步范围改为**从 store 的 schema 注册表 / `getAll()` 派生**（不再依赖硬编码清单）→ **以后新增的存档键自动被带上**，不会漏。
- **旧载荷适配**：对**没有 `keys` 段的老载荷**（v2 夹具形态）走扁平字段回退合并；新载荷按 `keys` 段合并；两条路径都有测试。
- **schema 版本**：老版本载荷走 `store` 既有 migrate 链（未另写一套）；缺失键与 `-bak` 回落保持既有约定。
- 守卫：`test-sync-coverage` 扩展为「**store 的每个已注册键都必须在同步载荷里**」（从注册表派生，键数量变化自动生效）；新增 `test-sync-compat` 覆盖兼容路径。

### 2. 图鉴（新模块 `page/codex.js`）

- **三个分栏**：**🐾 宠物**（头像 + 名字 + 稀有度 + 基础属性 + 天赋 + 技能）、**⚡ 技能**（玩家 / 宠物 / 敌群，含类型、满级或区间、描述）、**✨ 天赋**（敌群 + 宠物专属，含描述与适用对象）。
- **只读**：数字全部来自既有数据源，**不新增/不修改任何数值**；若发现"描述与实现不一致"，只登记不改。
- 头像沿用 `petIconHtml`，尺寸遵守评审结论（**16 的倍数**）。

### ⚠️ 两条线的收尾状态（如实记录）

- **云同步线**：跑到 42 轮时**某个工具权限被拒**而中断 → 无正式报告（键对照表/逐条结论缺失）；主控实测其改动文件与测试均在、全量绿。
- **图鉴线**：**撞 100 轮上限**，停在"即将浏览器复验"处 → 方案说明与截图缺失；主控已核查 `page/codex.js` + `test-codex.js` 存在且全量绿，并在本版**补挂 `codex.js` 的 `<script>` 行**（缺它模块不会加载）。
- **待补**：390×844 / 360×640 的图鉴复验（三分栏、长描述不溢出、头像清楚）与云同步的"真实两端往返"验证。

### 测试与版本三项

- 全量 **70 套件 / 5434 断言 / 0 失败**（含新增 `test-codex`、`test-sync-compat`，以及 `test-sync-coverage` 的扩展）。
- `APP_VERSION` -> **2.14.3**；`page/index.html` 缓存戳 -> **167**（并补挂 `codex.js`）。
- 台账：已登记「已发布」，指针 **2.14.3 → 2.14.4**。

---

## v2.14.2

Date: 2026-10-01

**修复：宠物加成"就地累加"（不纯函数）** —— 作者同步后发现"宠物面板加成一直增加"。

### 根因（已核实，含对主控初判的纠正）

- `page/pet-store.js` 的 **`applyBattlePetBaseBonuses()`** 里是 **`u.base[k] = (u.base[k] || 0) + add`** → **就地累加**。
  实测（同一批 units 连调 10 次）：**hp 317 → 434 → 551 → …**，每次 +117 hp / +13 atk / +5 def，**永不收敛**。
- `petStatBreakdown()` 里同样把凝聚/共鸣**写回 `u.base`**，再由 `boostPetForGroup(u)` 就地乘掉 → **一旦入参不是克隆，每渲染一次多叠一层**。
- ⚠️ **纠正主控初判**：在**宠物面板**这条路径上，修前实测**并没有涨**（`createPetUnit()` 每次返回新克隆，旧代码只是**靠这个偶然前提**才没炸）；但**函数本身是不纯的**，且 `applyBattlePetBaseBonuses` 在 units 路径上 **100% 复现复利**。所以这是**必须修的真 bug**，只是发作条件依赖调用方是否克隆。

### 修法

1. 新增**纯计算核心 `petBaseBonusView(units)`**：只返回 `{cohesion, resonance, total, resonanceRate, benchCount}`，**一行都不写入参**（有断言守）；面板与实战加成共用它 → 单源。
2. **`applyBattlePetBaseBonuses()` 改为幂等**：删掉 `+=`，改成「**当前 base − 上次那层 + 本次那层**」；"上次那层"记在 **`WeakMap`**（不在单位上留可枚举字段 → 不进快照/日志/JSON）。选反算而非基线快照，是为了**保住两次调用之间别人加的合法 base**（如等级增益）。
3. **`petStatBreakdown(pet)` 改为完全纯函数**：删掉写回 `u.base` 与 `u.hp` 的两行；带加成的基础值只算进局部 `withBonus`，经 `out.baseWithBonus`（= `out.bench`）**显式返回**；`boostPetForGroup` 只作用于浅副本 → **原单位零写入**。
4. 两个函数注释均写明「**本函数不得修改入参**」。
- ⚠️ **一处刻意保留**：`applyBattlePetBaseBonuses` 仍写 `u.base` 一次 —— `buildGroupBattlePets` 管道与两套**禁改**的既有断言（`test-pet-store.js` / `test-pet-heal-display.js` 读 `u.base` / `pipe.base`）依赖该契约，改成"返回克隆"必红。折中=**保留写入但幂等**（第 2..10 次连 JSON 都不变），"纯"的能力由 `petBaseBonusView` 提供。

### 存档与云同步的结论

- **已有存档不需要处理**：落盘结构中**没有派生属性**（`pets` 只有状态与材料/宝珠等），单位只活在内存 → "被叠过"的数值**不可能进过存档**，也无法安全区分"被叠过"与"本来就这么大" → **不瞎改数据**。
- **宠物确实参与云同步**（`sync.js` 的 `keys` 段，`collectOtherKeys()` 从 `store.getAll()` 派生；`test-sync-coverage` 有往返断言），但同步的只是**宠物状态**（无派生属性）→ **作者的异常不是云端传入的**，是本地重复渲染/重复施加。
- 仓库根 `sync-data.json` 是 **v2 时代夹具**（`version: 2`、无 `keys` 段），当前载荷已是 `version: 5` + `keys` → 不能拿它当"云端数据"看。

### 测试与复验

- 新增 `scripts/test-pet-bonus-stability.js`（**39 断言**）：`petStatBreakdown` ×10 **逐字节不变** + 存档不变；`petBaseBonusView` ×10 不变 + units JSON 一字不改；`applyBattlePetBaseBonuses` ×10 不变（含**"旧算法会翻倍"的反证**、保住等级增益的正证、单位无可枚举新增字段）；`buildGroupBattlePets` ×3 一致；4 条源码守卫（无 `+=`、breakdown 零写 `u.base`、`boostPetForGroup(pb)`、顺序契约）。
- 全量 **68 套件 / 5359 断言 / 0 失败**（同运行器对 HEAD 实测基线 67 / 5320；差值 +39 = 恰好新套件）。
- **真实 Chrome 复验**：面板 5 次开关 + 切 tab 4 轮数值**恒定且等于修前正确基线**（5445/600/345/330/180/8）；`applyBattlePetBaseBonuses` 修前 `317→434→551`、修后 **317 恒定**；`buildGroupBattlePets` ×3 一致。

---

## v2.14.1

Date: 2026-10-01

**宠物面板两项**（作者要求）：① **营养液 ↔ 宠物粮 1:2 双向兑换（2 换 1）** ② **宠物列表缩短**。

### 1. 营养液 ↔ 宠物粮 互兑（2 换 1）

- **双向**：2 营养液 → 1 宠物粮；2 宠物粮 → 1 营养液。
- 落在宠物面板材料区（与既有「炼化石 兑换 10→1」同一族交互）；**不足 2 个时不可换**（禁用/隐藏 + 说明），**只做整组、不产生小数**，兑换后立即落盘并刷新面板。
- 规则**单一来源**在 `pet-materials.js`/`pet-store.js`，UI 只调用（不复制一份数字到视图层）。

### 2. 宠物列表缩短

- 目标：打开面板尽量一屏看完「我的宠物 + 参战阵容」，同时**不牺牲可读性与热区**（热区 ≥44px、名称不竖排、状态仍可见、操作仍 ≤2 次点击）。
- 已完成的结构（结算按钮条件显示、参战阵容上移、一键治疗全宽）保持语义不变。

### ⚠️ 本版为「未验证提交」

执行子代理**撞 100 轮上限**（这已是近期第六次），停在"要写新测试套件"处 → **无报告**（屏数前后对比、改前/改后截图、方案说明缺失）。
主控接手实测：改动落在 **`page/pet-materials.js` / `page/pet-store.js` / `page/pet-ui.js` / `page/index.css`**，新增 **`scripts/test-pet-exchange-list.js`（337 行）**；全量 **67 套件 / 5252 断言 / 0 失败**（基线 66 / 5143）。
**待补**：390×360 双宽度的浏览器复验（兑换双向与不足提示、列表**屏数**降幅、名称不竖排、无横向溢出）。截图残留于未跟踪目录 `_tmp-pet-list-ui/`（未提交，供作者查看后删除）。

### 版本三项与台账

- `APP_VERSION` -> **2.14.1**；`page/index.html` 缓存戳递增（本脚本自动 +1）。
- 台账：已登记「已发布」并把**指针推进到 2.14.2**；changelog 按 minor 线自动落 `doc/changelog-v2.14.md`（修正 v2.4.9 误写 `v2.3` 的同类风险）。

---

## v2.14.0

Date: 2026-10-12

**批次 C：战斗反馈矩阵与演出层级收口**（施工计划 `doc/plans/战斗体验施工计划.md` §2/§5；实施为 DeepSeek Flash v4.1 子代理，Lead 独立验收）

**纯表现层**：不改引擎、不改结算语义 —— 固定种子 A/B 三组（集成版单敌 UI 链 4 场含历史写入 / 单敌纯引擎 160 场 / 敌群 36 场）
与基线**逐字节一致**，且三组哈希与 v2.12.0、v2.13.0 的对照值**完全相同**。

### 新增功能

- **「事件 → 演出语义」单一来源**（新模块 `page/fx-semantics.js`）：批次 C 之前群战 `GB_FX_MARKS` 与单敌 `BC_MARKS`
  **各存一份 14 行、内容几乎相同的文案匹配表**，独立演化必然漂移；现两份表都不存在，两模式都走
  `fxMarkForEvent(ev)`，**id 优先、文案兜底、匹配不到返回 null**。
  - **id 闭集**：`FX_MARK_FOR_STATUS_ID`（13 个 id）∪ `FX_EXCLUDED_STATUS_IDS`（11 个**带理由**的排除项）
    必须覆盖 `listStatusDefs()` 的全部状态；`fxUnregisteredStatusIds()` 自检，新增状态忘了登记会立刻判红。
  - **文案表**：既有 14 行语义逐字保持，新增 9 行（护盾庇护的免疫 / 魔法镜 / Boss 铁壁护盾 / 怒意增强 / 生命汲取 /
    受击解冻 / 哈欠未生效 / 遗言自牺牲 / `💀 遗言:`）。⚠️ 复合限定行**必须排在状态名行之前**：
    `受护盾庇护，免疫【冰冻】` 现在给出 🛡️（该次事件的语义是「被盾挡下」），不再被 `/冰冻/` 抢成 ❄️。
- **重大事件：击杀/阵亡的即时提示（两模式）**：引擎**不落**「单位阵亡」日志（`hp<=0` 只是被跳过），故在 **UI 侧按 HP
  跨零检测**（`fxDetectKills` / `fxDetectSidedKills`，只认 `≥1 → ≤0`，事前已 0 不重复触发、快照无该 id 不触发）→
  群战锚到目标芯片、单敌锚到作战单位元素，文案按阵营区分 `💀 击杀` / `💀 阵亡`。
- **严重度分类** `fxSeverityForEvent()`：`routine / notable / major`（规格 §5 的「常规/重要/重大」表落码），
  **只给层级、不含任何时长/阈值** —— 生命期与聚合仍分别由 `gbFxPolicy` / `battleFxPolicy` 决定（两套常量**未合并**）。

### 修复

- **两模式演出语义漂移风险**（结构问题）：删掉两份重复表，改为单一来源 + 两模式各自保留**模式守卫**
  （群战只对 `status|talent|terrain` 出标记、单敌要求显式 `targetSide`）。
- **Boss 机制与遗言此前完全没有即时反馈**：`Boss 怒意增强` / `Boss 铁壁护盾` / `魔法镜`（单敌）/ `受击解冻` /
  `哈欠未生效` / `遗言：自我牺牲阵亡` 等文案此前匹配不到任何标记 → 现按上表出码（`Boss 铁壁护盾, 吸收 N`
  只出 🛡️ 标记，**不把 N 当伤害**）。

### UI 调整

- 击杀/阵亡提示复用既有锚定与生命期路径（群战 `gbFxFloat` / 抽屉态 `showChipBadge`，单敌 `showMark`），
  **不新增样式**，`pointer-events:none` 不挡按钮、不延迟结算、**不参与数值聚合**（离散语义）。
- 无新增/删除任何 CSS 类；两模式政策常量与坐标契约保持原样（既有 §13/§22/§23/§24 断言全绿）。

### 测试与验证（全部为本机实跑结果）

| 套件 | 结果 | 说明 |
|---|---|---|
| `scripts/test-fx-matrix.js`（新增） | **293 / 0** | 单一来源闭集、两模式共用、聚合不变式、击杀跨零、reduce/抽屉/小屏、两模式样本夹具、index.html 接线 |
| `scripts/test-group-ui-presentation.js` | **493 / 493** | 既有断言**一字未改**（仅夹具装配加载 `fx-semantics.js`） |
| `scripts/test-battle.js` | **141 / 0** | 既有断言**一字未改**（仅夹具装配加载 `fx-semantics.js`） |
| 其余既有套件 | 全部 0 失败 | 含 `test-page-load` 27、`test-a11y-tokens` 40、`test-group-battle` 35、`test-battle-phases` 104、`test-auto-speed` 49 |

**项目全量**：**66 套件 / 5,211 断言 / 0 失败 / 0 UNKNOWN**（v2.13.0 基线 4,918 → +293 = 新套件）。
口径：本机 `test-release-hook` 走 23 条分支；spawn 被禁环境 24 条 → 5,212，均 0 失败。

**先红后绿**：把 `test-fx-matrix.js` 跑在**批次 C 之前**的 `page/`（该目录无 `fx-semantics.js`、`GB_FX_MARKS`/`BC_MARKS` 仍在）
→ `rc=1`、**163 通过 / 91 失败**；代表性判红：`GB_FX_MARKS 不再存在`、`BC_MARKS 不再存在`、
`两模式结果都等于 fxMarkForEvent`、`gbFxKillMarks 不存在`、`index.html 挂载了 fx-semantics.js`。

**Lead 独立复核（不用实施者的测试文件）**：`verify-fx-c.mjs` **48/48**
- 闭集独立复算（`registry − (映射 ∪ 排除) = ∅`，且映射/排除表**无死键**、排除项必须写理由）；
- **旧表 vs 新表在 554 条真实引擎事件上的语义等价**（旧表从 git HEAD 提取）：群战 314 条 / 单敌 240 条，
  差异 **5 条且全部可解释**（`受击解冻` 由「无标记」变为 ✅ ❄️，纯新增命中）；
- 击杀跨零纯函数边界（`1→0` 触发、`0→0` 不触发、`-5` 触发、快照缺 id 不触发、玩家阵亡也可辨）；
- 严重度只返回三个层级之一、两模式 policy 未被合并、两处旧表确已删除。

**固定种子 A/B（基线 = 批次 C 之前的 HEAD）**

| 对照 | 规模 | 结果 |
|---|---|---|
| 集成版单敌 UI 链（含历史写入 + FX 演出） | 4 场 | sha256 `045A8DF8…` **一致** |
| 单敌纯引擎 | 160 场 | sha256 `BB257309…` **一致** |
| 敌群真实大关 | 36 场 | sha256 `BAE86A1A…` **一致** |

**真实 Chromium（自建 CDP 夹具）：67 / 67 通过**

| 场景 | 实测 |
|---|---|
| **受控多事件步（群战）×1/×2/×4/×8** | ×1：`-100/-150/-50/-200/+60/🛡️30`（逐事件、护盾走语义标记）；×2/×4/×8：`-300/-200/+60/🛡️30` —— 同目标同类合并为和，**未出现跨目标 `-500`**、**未出现伤害与治疗混加 `-360`**、护盾**未并进数值** |
| **受控多事件步（单敌）×1/×2/×4/×8** | ×1 逐条（100/150/50）；×2 起同侧合并为 `300`；**未出现跨侧 500/600**；护盾走 🛡️ 标记 |
| 真实战斗（两模式） | 全程无「非法求和」数值（对每步事件做同目标同类求和集合比对，群战 45 步 / 单敌 15 步） |
| 击杀提示 | 两模式均出现并锚定到阵亡单位（群战芯片 / 单敌 `#battleEnemy`） |
| `prefers-reduced-motion` | 数值/标记仍在（语义不依赖动效），动画时长被全局 1ms 规则压到 ≤0.01s，**结算与阶段不变** |
| 日志抽屉（群战） | 抽屉打开时与日志面板**零相交**、与按钮零相交 |
| 遮挡/视口 | 390×844 与 360×640：FX 与按钮零相交、无横向溢出 |
| **可读性样本** | 群战 **10/10**、单敌 **10/10**（条件登记：群战 45 步 / 30 条演出；单敌 15 步 / 30 条演出；逐条核对目标锚点 + 数值/语义 + 引擎日志一致） |
| 控制台 | 0 意外 `console.error`、0 未捕获异常 |

### 本次新增 / 修改文件

| 文件 | 变化 |
|---|---|
| `page/fx-semantics.js` | **新增（220 行）**：id 映射 + 排除清单 + 文案兜底 + 统一入口 + 严重度 + 击杀跨零纯函数 |
| `page/game-render.js` | 删除 `GB_FX_MARKS`，`gbMarkerFor` 改走统一入口；`_groupStep` 加 HP 快照 + 击杀提示 `gbFxKillMarks` |
| `page/game-battle.js` | 删除 `BC_MARKS`，`bcMarkerFor` 改走统一入口；tick 内 HP 快照 + `bcFxKillMarks` |
| `page/index.html` | 新增 `<script src="fx-semantics.js">`（`state-core.js` 之后、`game-render.js` 之前）；cache-busting `?v163` → **`?v164`** |
| `page/utils.js` | `APP_VERSION` 2.13.0 → **2.14.0** |
| `scripts/test-fx-matrix.js` | **新增（992 行 / 293 断言）** |
| `scripts/test-battle.js` / `scripts/test-group-ui-presentation.js` | **仅夹具装配**加载 `fx-semantics.js`（既有断言未改） |
| `README.md` / `CONTEXT.md` | 版本三项、文件树、模块边界（新增语义层模块） |
| `doc/VERSION-LEDGER.md` / `doc/HANDOFF.md` | 领号与发布登记、版本沿革、§8 断言口径 |
| `doc/changelog-v2.14.md` | 新增本版变更日志 + 完整架构演化表 |

### 本版未做 / 已知取舍（如实登记）

- **「濒死」未实现**：本作全仓没有「濒死」状态，也没有裁决过血量阈值 → 按「不发明规则」原则**不实现**，
  仅登记（severity 只给层级，不引入阈值）。
- **群战「终局那一击」的击杀提示不可见**：`_groupDone()` 的 `gbFxClear()` 会立即清场（v2.4.0 既有契约
  「结算面板之后不留残影」，且有源码守卫）→ 中途击杀可见、最后击杀不可见；单敌侧没有等价清场，故两模式
  此点**不对称**。Lead 裁定：**保留既有清场契约**（终局语义由批次 A/B 的分层承担），仅登记不对称。
- **`fxSeverityForEvent` 目前无时长消费点**：仅「规格表落码 + 测试消费」，生命期仍由两模式 policy 决定；
  若日后要按严重度放大字号/延长生命期，需另开版本并同步坐标/时长契约。
- **群战 `type:'skip'` 的「❄️ 冰冻: 无法行动」不出标记**（群战 type 白名单是 `status|talent|terrain` 的**既有**守卫），
  单敌带 `targetSide` 时同一事件会出 ❄️ —— 属**既有模式差异**，本批按规格保留、未合并，已在夹具中条件登记。
- 未覆盖横屏/超矮视口；未做动画观感（观感类判断）验收。

### 架构演化

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
| v1.9.10 | 18 | 566 行 challenge.js | 召唤率阶梯函数化 |
| v1.9.11 | 18 | 574 行 challenge.js | 召唤资格随容量实时回撤 |
| v1.10.0 | 18 | 574 行 challenge.js | 21章117关+双词条BOSS（多词条架构） |
| v1.10.1 | 18 | 574 行 challenge.js | 战利品倍率函数化+5-6 boss标记修复 |
| v1.10.2 | 18 | 574 行 challenge.js | 词条组合器参数修复+tick兜底 |
| v1.10.3 | 18 | 574 行 challenge.js | 战利品按被击败关卡结算 |
| v1.10.4~v1.10.5 | 18 | 574 行 challenge.js | 文案修复/词条钩子表化重构 |
| v1.11.0 | 22 | 583 行 challenge.js | 动作百科+关联机制+store注册表+时间工具+UI优化 |
| v2.0.0 | 44 | 761 行 game-render.js | 技能/敌群群战/宠物/宝珠 + 挑战页三视图 |
| v2.0.1 | 44 | 761 行 game-render.js | 隐藏挑战昨日未用资格顺延 + borrow 测试套件 |
| v2.0.2 | 44 | 761 行 game-render.js | 顺延重构为双池设计：补召成功不占今日名额 |
| v2.0.3 | 44 | 761 行 game-render.js | 修复发布事故：index.html 漏挂 24 个 v2.0 模块 |
| v2.0.4 | 44 | 761 行 game-render.js | 二号接线事故：补挑战页三视图 HTML 骨架 |
| v2.0.5 | 44 | 761 行 game-render.js | 版本线早期修复 |
| v2.0.6 | 44 | 761 行 game-render.js | 动作改名/合并四库联动 |
| v2.0.7 | 44 | 761 行 game-render.js | 早期小版本 |
| v2.0.8 | 44 | 761 行 game-render.js | 早期小版本 |
| v2.0.9 | 44 | 761 行 game-render.js | 敌群扩关、难度曲线与宠物阶段归一 |
| v2.0.10 | 44 | 761 行 game-render.js | 敌群技能点奖励调整 |
| v2.0.11 | 44 | 761 行 game-render.js | Debug 面板首版 |
| v2.1.0 | 44 | 763 行 game-render.js | 设计令牌、移动端触控与无障碍 |
| v2.1.1 | 45 | 763 行 game-render.js | Debug 面板合入设计体系 |
| v2.1.2 | 45 | 763 行 game-render.js | 敌群关卡数量文案修正 |
| v2.1.3 | 45 | 763 行 game-render.js | 宠物养成面板及技能升级 |
| v2.1.4 | 45 | 763 行 game-render.js | 宠物面板布局与主题可读性 |
| v2.1.5 | 45 | 763 行 game-render.js | 命中/闪避系统与宠物天赋 |
| v2.1.6 | 45 | 763 行 game-render.js | 模态滚动锁泄漏修复 |
| v2.1.7 | 45 | 772 行 game-render.js | 敌群扩关与战斗 UI 优化 |
| v2.1.8 | 45 | 825 行 game-render.js | Debug 平衡诊断与模拟器 |
| v2.1.9 | 45 | 827 行 game-render.js | 敌群难度锚定 |
| v2.1.10 | 45 | 831 行 game-render.js | 敌群独立属性空间 |
| v2.1.11 | 45 | 831 行 game-render.js | 新增 g13~g15 超限试炼 |
| v2.1.12 | 45 | 831 行 game-render.js | 群战属性诊断单一入口 |
| v2.1.13 | 45 | 835 行 game-render.js | 宠物继承与场地效果 |
| v2.1.14 | 45 | 1179 行 game-render.js | 群战战斗/日志双 Tab 与详情层 |
| v2.1.15 | 45 | 1208 行 game-render.js | 接通多类宠物技能与状态效果 |
| v2.1.16 | 45 | 1208 行 game-render.js | 接通剩余可达技能/天赋效果 |
| v2.1.17 | 45 | 1207 行 game-render.js | 宠物宝珠系统 |
| v2.1.18 | 45 | 1207 行 game-render.js | 宠物放大倍率调整 |
| v2.1.19 | 45 | 1228 行 game-render.js | 重复奖励修复、宠物受伤与敌群扩关 |
| v2.1.20 | 45 | 1228 行 game-render.js | 云同步键自动派生 |
| v2.1.21 | 45 | 1231 行 game-render.js | 迷惑技能、蓄力时序与注释修复 |
| v2.1.22 | 45 | 1269 行 game-render.js | 技能区间接入战斗 |
| v2.1.23 | 45 | 1269 行 game-render.js | 技能区间驱动源与非攻击通道 |
| v2.1.24 | 45 | 1269 行 game-render.js | 睡眠回复与无影拳连击 |
| v2.1.25 | 46 | 1268 行 game-render.js | AFFIXES 词条注册表拆分 |
| v2.1.26 | 46 | 1268 行 game-render.js | 技能区间接入更多通道 |
| v2.1.27 | 46 | 1288 行 game-render.js | RNG 回放与时间旅行 |
| v2.1.28 | 46 | 1288 行 game-render.js | 技能成长曲线与场地固定值 |
| v2.1.29 | 46 | 1288 行 game-render.js | 敌群扩至 21 大关并派生上限 |
| v2.1.30 | 46 | 1288 行 game-render.js | 敌群扩至 24 大关 |
| v2.1.31 | 46 | 1288 行 game-render.js | startCooldown 接线与难度修复 |
| v2.1.32 | 46 | 1288 行 game-render.js | 单敌扩章与技能可用状态修复 |
| v2.1.33 | 46 | 1288 行 game-render.js | 技能差异修复与状态时序修正 |
| v2.1.34 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 27 章 |
| v2.1.35 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 30 章 |
| v2.1.36 | 46 | 1288 行 game-render.js | 单敌关卡试炼扩至 33 章 |
| v2.2.0 | 46 | 1291 行 game-render.js | 上场宠物 2→4 + 团队凝聚/共鸣 |
| v2.2.1 | 46 | 1291 行 game-render.js | 宠物属性模型口径修正 |
| v2.2.2 | 46 | 1291 行 game-render.js | 属性公式与宝珠重构 |
| v2.2.3 | 46 | 1291 行 game-render.js | 玩家主动技能数值/口径 |
| v2.2.4 | 46 | 1291 行 game-render.js | 新增 weaken/vigil 状态 |
| v2.2.5 | 46 | 1291 行 game-render.js | 启风技能与疾风状态 |
| v2.2.6 | 46 | 1291 行 game-render.js | 玩家技能共享桥 |
| v2.2.7 | 46 | 1291 行 game-render.js | 修平衡脚本加载/装配不全 |
| v2.2.8 | 46 | 1291 行 game-render.js | 平衡脚本补宠物共享装配口径 |
| v2.2.9 | 46 | 1291 行 game-render.js | 金身护盾破盾反伤 |
| v2.2.10~v2.2.20 | 46 | 1292 行 game-render.js | WP-F/WP-G 与一批零散修复 |
| v2.2.21 | 46 | 1292 行 game-render.js | 宠物治疗/属性拆解、挑战月记/重置 |
| v2.2.22 | 47 | 1348 行 game-render.js | 技能槽开放到3、敌群掉落、威吓区间化 |
| v2.2.23 | 47 | 1348 行 game-render.js | 角色等级系统 |
| v2.2.24 | 48 | 1348 行 game-render.js | 等级称号表与倍率裁决 |
| v2.2.25 | 48 | 1348 行 game-render.js | 真实浏览器复盘与浮点/UI修复 |
| v2.2.26 | 48 | 1348 行 game-render.js | WP-I 第一批布局修复 |
| v2.2.27 | 48 | 1348 行 game-render.js | WP-I 第二批战斗页信息密度 |
| v2.2.28 | 48 | 1348 行 game-render.js | WP-I 第三批敌群重置与宠物属性对比 |
| v2.2.29 | 48 | 1409 行 game-render.js | 宠物头像 14 枚与 UI 接入 |
| v2.2.30 | 48 | 1409 行 game-render.js | 宠物头像评审修复（深色可见/alt/32px/角标） |
| v2.3.0 | 49 | 1409 行 game-render.js | 宠物面板布局整理 |
| v2.3.1 | 50 | 1422 行 game-render.js | 怪兽头像原型与接入 |
| v2.3.2 | 51 | 1430 行 game-render.js | 技能图标资源与接入 |
| v2.3.3 | 50 | 1348 行 game-render.js | 战斗页宠物头像 |
| v2.4.0 | 51 | 1949 行 game-render.js | 群战 UI 重构 |
| v2.4.1 | 51 | 1949 行 game-render.js | 敌人技能池补齐 |
| v2.4.2 | 51 | 2207 行 game-render.js | 群战战场化与日志抽屉 |
| v2.4.3 | 51 | 2207 行 game-render.js | 敌方辅助技能改为作用己方 |
| v2.4.4 | 51 | 2230 行 game-render.js | 蓄力日志噪声过滤 |
| v2.4.5 | 51 | 2353 行 game-render.js | 战斗分阶段引擎与日志结构 |
| v2.4.6 | 51 | 2353 行 game-render.js | groupUnitTurn 编排收敛 |
| v2.4.7 | 51 | 2353 行 game-render.js | 4 条群战技能/天赋死接线 |
| v2.4.8 | 51 | 2362 行 game-render.js | 敌人词条装配与疾影/先制度 |
| v2.4.9 | 51 | 2362 行 game-render.js | 训练页快捷记录与动作分组 |
| v2.4.10 | 51 | 2362 行 game-render.js | 隐藏挑战计时/奖励阈值调整 |
| v2.5.0 | 51 | 2362 行 game-render.js | 结算完整性（异常中止/场地结算/双 KO） |
| v2.5.1 | 51 | 2362 行 game-render.js | 单敌伤害事件与护盾口径 |
| v2.5.2 | 51 | 2362 行 game-render.js | 结束回合防重复判定 + 错误上下文 |
| v2.6.0 | 51 | 2362 行 game-render.js | 玩家技能唯一结算入口与目标选择 |
| v2.7.0 | 51 | 2362 行 game-render.js | AI 指定目标真正影响技能选靶 |
| v2.8.0 | 51 | 2362 行 game-render.js | 群战 FX/HP 补间与受击闪烁 |
| v2.8.1 | 51 | 2362 行 game-render.js | 施法/飘字分离与步内分道 |
| v2.8.2 | 51 | 2362 行 game-render.js | 短屏抽屉态裁切修复 |
| v2.9.0 | 51 | 2362 行 game-render.js | 吸血按目标实际掉血 + 技能必中无暴击 |
| v2.9.1 | 51 | 2362 行 game-render.js | 随机技能拒绝 AI 指定目标 |
| v2.10.0 | 51 | 2362 行 game-render.js | 场地 DOT 分档减免 + 酷暑攻击后灼伤 |
| v2.10.1 | 51 | 2362 行 game-render.js | 跨步飘字占位登记（纯表现） |
| v2.11.0 | 51 | 2656 行 game-render.js | 演出吞吐与数字目标锚定 |
| v2.11.1 | 51 | 2734 行 game-render.js | 状态标记/受击高亮；默认飘字重叠收口 |
| v2.11.2 | 51 | 2716 行 game-render.js | 回退驱逐 + 引擎插桩证实探针伪影 |
| v2.11.3 | 51 | 2716 行 game-render.js | 单敌演出按窗口聚合 |
| v2.11.4 | 51 | 2716 行 game-render.js | 单敌状态反馈；修护盾碎裂语义 |
| v2.11.5 | 51 | 2738 行 game-render.js | 抽屉态反馈（保留芯片锚定，隐藏中央 FX） |
| v2.12.0 | 51 | 2861 行 game-render.js | 单敌/敌群终局 800ms → 1200ms → 战绩分层；auto 胜利战果 ≥2s；纯 UI 流程（引擎逐字节不变） |
| v2.13.0 | 52 | 2924 行 game-render.js | 战斗历史（100 条 FIFO）+ 分模式长期统计；纯记账/展示，引擎逐字节不变 |
| v2.14.0 | 53 | 2963 行 game-render.js | 反馈矩阵单一来源（fx-semantics.js）+ 击杀即时提示；纯表现层，引擎逐字节不变 |
| v2.14.1 | 52 | （见 changelog） | **宠物面板两项**：① **营养液 ↔ 宠物粮 1:2 双向互兑（2 换 1）** —— 规则单一来源在 `pet-materials.js`/`pet-store.js`，UI 只调用；不足 2 个不可换、只整组、无小数、兑换即落盘。② **宠物列表缩短** —— 目标"一屏看完宠物 + 参战阵容"，同时守住热区 ≥44px、名称不竖排、状态可见、操作 ≤2 次点击；既有结构（结算条件显示/阵容上移/一键治疗全宽）语义不变。⚠️ **未验证提交**：子代理撞 100 轮上限、停在写测试前，**无报告**；主控实测改动 4 个 page 文件 + 新增 `test-pet-exchange-list`（337 行），全量 **67 套件 / 5252 断言 / 0 失败**（基线 66/5143）→ **待补双宽度浏览器复验**（兑换与列表屏数降幅）。台账按指针取 2.14.1、推进到 2.14.2 |
| v2.14.2 | 52 | （见 changelog） | **修复：宠物加成"就地累加"**（作者：同步后加成一直增加）。根因：`pet-store.js` 的 `applyBattlePetBaseBonuses()` 用 `u.base[k] += add` **就地累加**（同批 units 连调 10 次 hp 317→434→551…永不收敛）；`petStatBreakdown()` 同样写回 `u.base` 再被 `boostPetForGroup` 就地乘掉。⚠️ **纠正主控初判**：面板路径修前实测**没涨**（`createPetUnit()` 每次新克隆，旧码靠这个偶然前提才没炸），但函数本身**不纯**、units 路径 **100% 复利** → 真 bug。修法：① 新增**纯核心 `petBaseBonusView()`**（零写入参、面板与实战单源）② `applyBattlePetBaseBonuses` 改**幂等**（当前 base − 上次那层 + 本次那层，上次记 `WeakMap`，不留在可枚举字段）③ `petStatBreakdown` **完全纯**（删写回，带加成值经 `out.baseWithBonus` 显式返回，`boostPetForGroup` 只作用浅副本）。⚠️ 刻意保留：`applyBattlePetBaseBonuses` 仍写 `u.base` 一次（两套禁改断言与建场管道依赖该契约）→ 折中为**幂等**。**存档无需处理**（派生属性从不落盘）；**宠物确实参与云同步**（`keys` 段）但只同步状态 → 异常非云端传入。新增 `test-pet-bonus-stability`（39 断言，含"旧算法翻倍"反证），全量 **68 套件 / 5359 断言**；真实 Chrome 复验数值恒定且等于修前正确基线 |
| v2.14.3 | 53 | （见 changelog） | **云同步完全化 + 图鉴**。① **同步范围改为自动派生**（从 store schema 注册表 / `getAll()` 派生，不再依赖硬编码清单 → **新增键自动带上**）；**旧载荷适配**（无 `keys` 段的 v2 形态走扁平字段回退、新载荷走 `keys` 段，两条路径都有测试）；老 schema 走既有 migrate 链；守卫扩展为「**每个已注册键都必须在同步载荷里**」。② **图鉴 `page/codex.js`**（新模块，主控补挂 `<script>`）：三分栏 —— 宠物（头像+稀有度+基础属性+天赋+技能）、技能（玩家/宠物/敌群，含类型/满级/描述）、天赋（敌群+宠物专属，含描述与适用对象），**只读不造数值**。⚠️ 两线收尾不完整（同步线工具权限被拒@42 轮、图鉴线撞 100 轮上限@浏览器复验前）→ **键对照表/截图/真实往返验证待补**。全量 **70 套件 / 5434 断言** |
| v2.14.4 | 53 | （见 changelog） | 两件：① **关卡试炼 chap34 鸿蒙初辟 / chap35 万道归墟**（各 6 关、BOSS 在 x-6 带 dualAffix；数值**脚本按 ≈1.113×/章 链式外推取 5 的倍数**，口径自证"从 chap30 复算 chap31~33 逐字相等"；12 个新敌名全命中既有 18 原型；**派生链零改动**、敌群未动；BOSS 33→34→35：atk 6360→7080→7880 / hp 60405→67230→74825；新套件 42 断言；⚠️ 按现基准属性 chap34/35 目前 0%，属"留给成长"的终局内容，未做补偿）② **宠物详情 ② 加成拆两行**（稀有度＋宝珠池 `×N%` ／ 凝聚共鸣 `+X`（= 基数的 N%）），**数值一个没变**（final 逐属性与改前相同，测试锁死"池×基数＝最终"；⚠️ 该线代理撞 100 轮上限，浏览器验收待补）。顺带修既有 `test-monster-icons.js` 两处**过期字面量**（189→201、33→35；断言强度不变，建议后续改派生）。全量 **72 套件 / 5673 断言** |
| v2.14.5 | 53 | （见 changelog） | **宠物加成改为同一加算层**（作者裁决）：`基础 = 图鉴+炼化+天赋静态`；`加成合计% = 稀有度% + Σ宝珠% + 凝聚% + 共鸣%`（**四项加算、同一层**）；`凝聚/共鸣贡献值 = 全部宠物该属性基础之和 × 10% / resonanceBonus`，折成本宠基础百分比；`最终 = floor(基础 × 合计% / 100)`（速度不参与）。三处变化：① **"全部宠物"= 所有宠物**（不排除本宠/参战/阶段/受伤/死亡）→ 每只宠的贡献值是**同一绝对值**（旧口径下每只不同，是"排除当前主角"造成的）；② 凝聚/共鸣**不再加进基数被池放大** → 面板不再出现 ×8505%；③ **面板口径 = 实战口径**（修掉面板比实战高 29%）。⚠️ **净削弱**（实测：小负鼠 17,010→约 4,014、梦幻 29,033→约 17,554）→ **g15~g20 需重测**。⚠️ **未验证提交**：子代理撞 100 轮上限（第七次）、停在跑全量前，**无报告**；主控以"全量绿"为提交门槛。新增 `test-pet-bonus-additive`。待补：双宽度目视、平衡复测、"全部宠物"是否排除蛋期/受伤/死亡 |
| v2.14.6 | 53 | （见 changelog） | **宠物凝聚/共鸣按作者最新裁决重写**（替代 v2.14.5）：`S凝聚[k] = 3% × Σ(成熟期宠物该属性 base)`（**数值、加进基础、不含速度**）；`S共鸣% = Σ(每只成熟期宠物的稀有度档位)`（**UR10/SSR8/SR7/R6 相加**）；`加成合计% = 稀有度% + Σ宝珠% + S共鸣%`；`最终 = floor((基础 + S凝聚) × 合计% / 100)`；速度不参与。与上版区别：凝聚**回到"加在基数上、再被池放大"**、共鸣**按档位累加而非阈值**、两者**只统计成熟期**、且**天然全局常量（每只宠相同）**。⚠️ **缺专用测试**：子代理第八次撞 100 轮上限、停在"写新套件"处（临停前自报"实现+既有测试全绿 5808"）；主控以全量绿为提交门槛；**逐属性对照与强度变化%缺失**。⚠️ 平衡：凝聚会被池放大 → **g15~g20 需重测**。待确认：成熟期是否再排除阵亡/受伤 |
| v2.14.7 | 53 | （见 changelog） | **新增宠物等级系统**：成熟期起累计；升到下一级 `目标等级×100`；经验 = 今日力量(kg)×5 ＋ 有氧(min)×20（**增量补发**，`dayKey+dailyGranted` 水印防重复）＋ 挑战额外 `本次伤害×1%`（`challengeKeys` 幂等），随机分给**最多 10 只**成熟宠、**每只 ≤20%**、**lv50 跳过**、**余量如实丢弃并记账**；`每级 +1% 基础值、上限 +50%`（lv50），**加成插在百分比池之后**（`最终 = 池后值 + floor(纯基础×等级%)`）→ **不吃稀有度/宝珠/共鸣放大、也不进凝聚基数**；**每月清空**（`monthlyKey` 幂等）；`pet.level/exp` 以 exp 为唯一真相、旧档按 lv0 优雅退化（不迁移不补偿）；列表/详情显示等级、经验进度与「等级提供的属性」。新增 `test-pet-level`（79 断言，含"等级只加基础"的反证），全量 **75 套件**；a11y 40/40。限制：有氧当下不发（靠水印补齐）、总量<5 整批丢弃、小基数属性低等级取整为 0、速度也吃 1%/级 |
| v2.14.8 | 53 | （见 changelog） | **平衡调整 12 条**（宠物 9 + 敌群 3）。宠物侧：闪耀命中 **0~50%**、打湿 CD3、**彭彭猪鼾睡期异常 -25%**、雷霆犬 CD3、小负鼠 CD4、圣光守护（自身 -20% / >50% 血承担 25% / 回合末 40% 回 5%）、梦幻光球（不打友方 / 弹射 +10% / CD4）、无影拳 CD3、圣光麒麟（不动如山三档 / 威压领域恒 -20% + 受技能伤 50% 回 4% 每回合 ≤2 / 战意灌注 2 目标·先制+1·攻 150~300%·CD4）。敌群侧：**Boss 不发动遗言**、广域防御 dur **2~3**·CD **7**、治愈**蓄力 1 回合**+魂攻 80~160%+目标最大生命 5~10%+**5 回合内重复治愈 -40% 叠至 -80%**。收口：两个红套件的失败**全在断言侧**（基数取错 / -80% 符号反了 / 用例自相矛盾），**未改生产代码**；治愈抗性实现本已接线（`HEAL_FATIGUE_*` + `unit._healFatigue`，仅 `def.id==='heal'`）。全量 **75 套件 / 0 失败**。⚠️ 待确认 7 条（治愈抗性作用面仅 heal / 战意灌注 150~300% 是"再加"还是"乘" / 抗性非状态 / 注释漂移 / 组合口径无测试 / 蓄力载荷边界 / 数值两处硬编码） |
| v2.14.9 | 53 | （见 changelog） | **极简扁平风：阶段 1 验收 + 阶段 2（训练视图折叠）**。验收 13 视图 × 390/360 用 CDP 读计算样式，**发现并修掉 8 类违规**，其中 **V1 是真可访问性缺陷**：挑战页**激活子页签**文字与底色同色 → 对比度 **1.00:1**（hover 1.41:1）；另有 46 个语义标签 **1.98~4.23:1** + `opacity .85`、两处叠色底 4.29/4.14:1、触控 **38~40px**、禁用态 `opacity .4/.5`、7 处 1px 结构边框、以及阶段 1 守卫**误杀圆形**（头像/FAB）。复测全 0（阴影/中间圆角/渐变/过渡/半透明/模糊/1px 边框/对比/触控/横向溢出/console）。**令牌对照表**入 `doc/design-tokens-v2.1.md §14`。**阶段 2 第一刀**：训练记录改**原生 `<details>`**（摘要=动作·重量·实际次数，44px、Tab/Enter、原生 aria-expanded），详情默认折叠 → 训练屏 **4185→3368px（−19.5%）**；操作按钮留在 details 外。`test-a11y-tokens` 40/40、全量 **75 套件 / 0 失败**（测试文件未改）。⚠️ 待裁决：群战非行动单位 `opacity .5` → 对比 2.50:1（被既有视觉契约钉住）；待做：隐藏挑战卡折叠（`challenge.js`）、52 处内联 `border:1px` + rgba 收编、宠物面板复验、深色主题复跑 |
| v2.14.10 | 53 | （见 changelog） | **主题色改「科技蓝」+ 宠物视图扁平风验收**。**换色**：新增 `--brand*`、旧 `--orange*` 全部 `var()` 转接（全站 ~110 处引用，含 JS 内联，同名换值是零遗漏做法）；浅色 `--brand` **#1D4ED8**（白底 **6.70:1**）、实心填充 **#2563EB**（白字 **5.17:1**）、hover `#1E3A8A`（10.32:1）；深色 `#60A5FA`（`--surface` 6.98:1）。**降刺眼**：大面积满块填充改「透明底 + 2px 蓝边 + 蓝字」——`.sb-btn`（全站最多的大面积按钮）、`#syncPush`（`sync.js:362` 内联橙底，旧对比 2.26:1）、`.empty-cta`、`#petCalcDet`、`#petCellMult`、`#petFinalCellActive`；旧橙叠底 `rgba(249,115,22,…)` → `rgba(var(--brand-rgb),.10)`。**保留实心**仅：弹层确认、战斗结算主按钮、header logo、热力图 Lv5、全部激活态、细进度条；CDP 扫描证实宠物视图 >1500px² 品牌填充只剩两个激活页签。状态色 / 稀有度色 / 中性 chip **未动**。**宠物视图重出审计表**（换色后新暴露 5 条）：`pet-cell-mult` 文字 **3.43:1**（蓝填充被当文字色）→ 改 `--brand` 6.98；`.empty-cta` 3.43 → 6.98；`.pet-final-cell.active` 边框 **2.42:1**（1.4.11 需 ≥3:1）→ 5.72；详情「炼化 Lv12」3.43 @20px → 6.98；热力图 `.hm-cell[data-l=4]` 深色 **3.60:1** → 5.38/6.70。上一轮 `3325ff7` 折叠半成品经检查**全对**：summary **322×44**、原生可聚焦 + `:focus-visible` 2px、**未误折叠主数值**、详情 **1644px≈1.95 屏**。**深色主题首次复跑**：四组（390/360 × 浅/深）审计 列表 86 / 详情 279 / 对比 315 元素，全 0 违规、console 0、最弱对比 5.17:1。测试 40/40（断言未改，标签仍写「橙底」属文案漂移）+ 全量 **75 套件 0 失败**。遗留：群战 `opacity .5` → 2.50:1 待裁决；52 处内联 1px 边框与 rgba 未收编；隐藏挑战卡占 40% 屏 |
| v2.14.11 | 53 | （见 changelog） | **UI 收尾三项 + 逐行核验**。**①群战非行动单位**：去 `opacity:.5`（文字仅 **2.50:1**）→ `outline:2px solid var(--bd)`（`offset:-2px`，**不占布局**）+ 名字 `--text3`；实测 **深 7.34:1 / 浅 5.25:1**（8 组合：390×844/360×640 × 浅/深 × 战斗/日志抽屉）全部 ≥4.5；可区分性靠**三重形制差**（行动者=品牌 2px 环 + `scale(1.1)` 61.6×74.8 vs 56×68 + 左侧 3px 脉冲条；非行动者=中性环 + scale 1 + 无脉冲条；阵亡=无描边 + grayscale）；`geomIdentical:true`（8/8 组合 `.gb-focus` 开/关 rect 逐项一致）；`Tab` 后 `:focus-visible` 仍是品牌环。**②内联样式收编 62 处**（55 行/13 文件/60 声明 = 51×`border:1px→var(--bw)` + 11×硬编码 `rgba()`→`rgba(var(--*-rgb),α)`）。**零风险机制证明**：每行反向归一后与原文**逐字节相等**（逻辑零改动）；`index.css:124` 守卫早已把内联 `border:1px` 算成 2px（实测 1px→2px、`var(--bw)`→2px、`border-top:1px`→1px），**9 条分隔线一条未碰**（行号集合不重叠）；语义色红→danger/绿→success/黄→warning/橙→brand，**alpha 一字未动**。难度 易 36/中 24/难 0。**③**`test-a11y-tokens` 标签文案改（断言未动）；`test-group-ui-presentation` 契约改**更严**（禁任何 `opacity<1`、钉死 2px+`--bd`、钉死 `--text3`、两主题 ≥4.5、`focusRules.length>0` 防空转）。**仍未收编**：U1 `challenge.js:248` 整块硬编码深色（难）、U2 `sync.js` slate ×3（中，缺 `--neutral-rgb`）、U3 `tab-settings.js:327` 遮罩（中，需并入 `--overlay`）、U4 `challenge.js:445` 一次性渐变特效（难）、U5 `linechart.js` canvas 取色（难）。**⚠️ 待裁决**：浅色三处 AA 回归（`challenge.js:285` 绿 4.25→**4.04**；`sync.js:354/357` 黄 11px 4.26→**3.98**，**改前已 <4.5**，修法 alpha .1→.07 或换文字色）；注释「v2.18」应为 2.14.x。**附带**：阵亡名字色被同特异性覆盖（既有）、360×640 日志抽屉底部裁切 1.8px（既有）。测试 40/40 + **75/75 套件 0 失败** |
| v2.14.12 | 53 | （见 changelog） | **自定义重量（±0.5kg）**。重量网格（`#seWeight` 编辑弹层 与 `#strWeight` 新增一组，两处同时生效）在 13 个预设档后**追加「✏️ 自定义」格**（`span 2`，末行正好填满不留孤行）：点开**内联条** `−`/数字输入/`kg`/`+`，**±0.5kg**，也支持直接输入（`step=0.5 inputmode=decimal`，**失焦+回车双入口**）；范围 **0.5~200**，非半档就近吸附；**非法回退上次有效值+toast**、越界夹紧+toast；命中预设档时**预设高亮照旧、自定义格不高亮**，非预设值显示「✏️ 自定义 9.5kg」并写回。**计划编辑步进 1kg→0.5kg**，限幅 **1~50 → 0.5~200**。**展示统一 `fmtKg()`**（记录行/计划行/表单/训练中/汇总/快速复训）：`9.5→"9.5"`、`10→"10"`、`9.5000000001→"9.5"`，**无浮点尾巴**；老存档非半档值（9.7）**保留一位小数不谎报**（存储不变）。实现为 `tab-strength.js` 内**同名覆盖** `utils.js` 的 `buildWtGrid`（`utils.js` 本轮不可写且加载更早），**回调协议一字未改**（`onChg(数字kg)`），故两处调用点零改动；script 顺序已由测试钉住（调换会红而非静默失效）。样式只用既有令牌（2px 边、圆角 0、无阴影/渐变、未新增过渡），按钮与数值 **min-height 44px**，focus 2px 描边，`aria-label/role=group/aria-controls/aria-live` 齐全。**新增 `test-custom-weight.js` 113 断言 8 组**（含连按 400 次无浮点尾巴、`sel=0` 不高亮、端到端 9.5 落库到记录行、脚本顺序、`utils.js` 未被改）；全量 **76 套件 0 失败**、a11y **40/40**，既有测试无变红无弱化。⚠️ 待裁决：快速复训仍不带出非预设重量（`applyStrLastSet` 命中预设才带出，既有测试 6.8 守着；放宽属规格变更）；`fmtKg` 对老数据非半档值保留一位小数；真机视觉未复核 |
| v2.14.13 | 53 | （见 changelog） | **作者远程三项**。**① 挑战主按钮回归（P0）**：`#lvChallenge`「⚔️ 挑战」几乎不可见 —— v2.14.9 扁平守卫 `[style*="gradient"]{background-image:none!important}` 把它**唯一**的底色（内联 `linear-gradient(135deg,var(--red),#dc2626)`）清空，只剩 `background-color:transparent` + `.m-btn-save` 白字 → **白字透明底 = 1.00:1**；叠加 `.modal-actions button`(0,1,1) 的 `border:none` 压过 `.m-btn-save`(0,1,0)，**所有弹层确认按钮的 2px 边框其实从未渲染**。修法：按钮走 `.m-btn-save` 实心 CTA + 新增 `.modal-actions .m-btn-save`(0,2,0) 定死 `--brand-fill` 底/`--on-brand` 字/**2px 同色边**/`--touch-min` → 四组实测（浅/深 × 390/360 数值一致）：`rgba(0,0,0,0)→rgb(37,99,235)`、`0px none→2px solid`、`auto/48→44/49`、**1.00:1→5.17:1**、宽度 166/151→**214/194**（明显宽于「关闭」）；`#exSave/#ccSave/#cpSegConfirm/#peExConfirm/#chStart` 一并修好。**同类连带**：培养页「我的角色」卡两端同色**假渐变**被抽掉丢底 → 改实色 `--bg2`；热血 buff 全屏 `radial-gradient` → 平铺 `rgba(251,191,36,.18)`（保留反馈）。**② 炼化点数来源**（作者问 700kg 为何没有）：真实规则 = **本月力量容量 `floor(kg/100)×10`**（700kg → **70 点**）+ **关卡首通战利品**（普通 +2/+4，BOSS +10/+20）；前置**通关 9-6 解锁炼魂**、**结算在打开挑战页/刷新时**（训练保存不触发、懒结算、按已兑换额补差）；隐藏挑战/敌群试炼/有氧**不给**炼化点。700kg 无炼化的三个原因：未通关 9-6（实测恒 0）、未打开挑战页、以及训练直接产出的是**宠物经验**（kg×5=3500 EXP）与容量（🪨炼化石是宠物材料，≠炼化点）。**逻辑无漏发、未改数值**；改文案（`本月已获得`→`本月容量兑换`，原会低估）+ 面板新增常显一句与 `<details>`「🔮 获取途径」。实测 700kg：首次渲染 0→**70**，再渲染仍 70（幂等）。**③ 宠物经验明细**：写入既有 `pets.levelLedger.log`（**未新建 store key**），每条含 `date/source(daily\|challenge)/total/granted/dropped/cap/pets/breakdown[]/allocations[]`（来源拆分 力量{kg,exp}/有氧{min,exp}/挑战{dmg,exp}，分配含每只 `amount/from/to/leveledUp`）；宠物面板材料区下、宝珠上 `<details>` 默认折叠，summary「📒 宠物经验明细　今日合计 +N EXP　M 笔」（44px、键盘可达、两主题可读）；幂等沿用 `dailyGranted` 水位 + 挑战 `runId` 键，只在真发时写一条。新增 `test-pet-exp-log.js` **45 断言**；全量 **77 套件 0 失败** + a11y **40/40**。⚠️ 待裁决：日志上限 20 条会裁掉当日超出部分（建议「当日全留 + 历史 20」）；炼化点结算时机是否改即时；弹层确认按钮现统一 2px 边 + ≥44px；热血闪光改平铺色 |
| v2.14.14 | 53 | （见 changelog） | **敌群战斗自动战斗**。控制条新增「▶ 自动 / ⏸ 自动中」（`#gbAuto`，`aria-pressed`），**默认关**、开战重置、**不持久化**；速度档 **×1/×2/×4（默认 ×2）**，间隔 = 基准 700ms（气泡 900ms）÷ 档位 = **700/350/175ms**，键 **`dh-group-auto-speed`**（与 `dh-battle-speed`、旧 `dh-group-speed` 均不同，旧键读兜底+写镜像、`8→4` 归一）。**推进复用同一个入口**：`_groupAutoStep()` 只有一句 `_groupStep()`，`#gbAuto` 与手动 `#gbStep` 同签名调用 `_groupStep()`（**无第二份逻辑**），入口有 `_groupAutoStepBusy` + `try/finally` 重入守卫，**无 setInterval**。**四个停止条件**：① `_groupDone()` 结束停 ② 点 ⏸ 停 ③ `#gbClose`/`switchTab`/`onBattleVisibilityChange(document.hidden)`/每拍 `groupAutoViewActive()` 复核 → 停并清定时器 ④ 详情/技能/天赋弹层 `pauseGroupBattle()` **降级为暂停**且关弹层不自动续跑。**定时器唯一清理点 `cancelGroupAutoTimer()`**（结束/暂停/关闭/改档/开新战全经过）。**幂等**沿用 `_groupRewarded`（再推进 100 次奖励仍 1 次）。新增 `test-group-auto.js` **135 断言**（同 seed 下自动 10 拍 ≡ 手动 10 次；结束/切 tab/visibility 定时器为 null 且冻结；奖励幂等；三档与键隔离；默认关；重入守卫；样式契约）；全量 **78 套件 0 失败** + a11y **40/40**；真浏览器验证通过（刷新后速度继承 ×4、自动仍关），axe **0 violations**。**顺带修**：按下态在 `.speed-btn:hover` 反色下 **3.49:1**（axe serious）→ 加 `:not(:hover)`。⚠️ 行为变更：旧 `_groupMode`（默认 auto、持久化）被取代 → 开战不再自动走第一拍、不再写 `dh-group-mode`、旧 ×8 归一为 ×4、开详情后不再自动续跑；结算面板展示推进未停；`_groupSpeed` 收敛为单一赋值（节奏=特效档位） |
| 2.14.15 | 53 | （见 changelog） | **敌群「自动连打下一关」**。v2.14.14 只做自动出手，本版补自动进关：`_groupDone()`（结算+发奖+记通关+写历史之后）→ `_armGroupAutoNext()` → `groupNextStageId()`（`allStageIds()` 线性顺序，与 `markGroupStageCleared` 同一份表）→ `scheduleGroupChain()`（**`GROUP_AUTO_NEXT_MS=1400ms`**）→ `_groupChainEnter()`（复核 `_groupAuto`/`_groupPaused`/`groupAutoViewActive()`）→ `closeGroupSettlementPanel()` → **`startGroupTrial(next)`（唯一开战入口，与关卡列表点击同一全局符号）** → 安全阀 → `_groupAuto=true` → `renderGroupOverlay()` + `_groupStep()`。**状态跨关**：`_groupDone` 开头置 false（结算期间不出手），胜利分支在全部副作用后重新置 true 并排队；`startGroupTrial` 内部会清开关，故 `_groupChainEnter` 在开战后再恢复 true，UI 不闪回。**四停**：胜→排队 1.4s 进下一关；负→清队列+清定时器+关自动、**不重试同关**、记原因；无下一关→停 + toast「🏁 已是最后一关」+ 战果文案 + 开关 title；手动 ⏸→立即停**并取消已排队的下一关**（`_groupChainNext=null` + 清两定时器）。切 tab/`document.hidden`/✕ 走同一 `stopGroupAuto` 链，落地前再复核视图。**安全阀**：必须「无异常 + 战斗对象换新 + 未结束 + `_groupStageId===next`」否则立即停（清队列、不重排、toast + console.warn 留痕）并回滚 `_groupStageId/_groupRewarded` 到上一关已结算状态，堵住「旧战斗 + 新 id → 奖励记到没打过的关」。**幂等**：连打 3 关 reward/cleared 各 1 次，再跑 40 拍仍 1；真机技能点 10→18→28、`winCountThisWeek` 2→3→4、history 5 条、progress g1-1…g1-5 各一次。**测试**：新增 `test-group-auto-next.js` **154 断言**（源码守卫、进关与跨关状态、逐关奖励、失败不排队、最后一关三处提示、⏸ 取消排队、四类离开路径整链停+定时器清零、两种安全阀、手动不受影响）；`test-group-auto.js` 135→**172**，仅 3 条随语义更新（胜利后 auto=true / aria-pressed=true /「⏳ 连打中」），失败分支原语义逐字保留，另新增 4 条按关计数。全量 **79 套件 0 失败**（6465 断言）+ a11y **40/40**。真机 g1-1→1.39s→g1-2→1.40s→g1-3 全程 auto；⏸ 窗口内取消后 4s 仍不跳关；切 tab 立即停。UI 三态「▶ 自动连打 / ⏸ 自动中 / ⏳ 连打中」（排队态绿虚线，仅既有令牌）。⚠️ 待裁决：自动下战报 stats 层被跳过（1400 < 2000ms）；最后一关提示无常驻横幅；连打状态不持久化；大关 id（`_groupStageId=null`）保守停止 |
| 2.14.16 | 53 | 3314 行 game-render.js | **宝珠系统四项施工 + 培养页精简 / 出战阵容常驻**：分解等价碎片（`orbDecomposeShards = orbPct`，R·Lv1=10 / UR·Lv50=297）、恢复合成（20 碎片→R·Lv1、100%、每日 5 次、`orbSynth` 随 `pets` 同步）、5 枚宝珠图标 SVG + `orbIconHtml` 唯一入口、修复 2（`u8.stat` → `u8.pct`）、库存 / 宠物列表 / 培养材料默认折叠、`.train-lineup` 常驻阵容（就地切换 + 开战走 `startGroupTrialWithPets` 唯一入口）；全量 **79 套件 / 0 失败**、a11y **40/40**；新增 5 个 SVG、**无新增 `page/*.js`**、无删除文件；缓存戳 `?v179` → `?v180` |
| 2.14.17 | 53 | 3314 行 game-render.js | **宠物天赋补齐 6 条（R/SR）+ 战意/梦幻/不动如山数值调整**：不动如山每回合回血 3%、战意吸血 10~100%、梦幻光球自愈 -40%、战意先制度改技能自身 priority:1（引擎 predeclareActions 扩展我方）、雨中疾行（雨天 spd×2）、星芒庇护（受击 40% 减伤 25%）、斗志昂扬（攻/受击 25% spd+1）、磐石反噬（(def+soulDef)×10% 定值反弹过减伤不过防御，新 mutation reflectMitigated）、共鸣之歌（我方施技自回 2%）、雷鸣加速（我方施技 20% 自身 CD-1，新 hook onAllyCastSkill）；新增 test-pet-v21417（48 断言），全量 80 套件 / 3405 断言 0 失败；缓存戳 ?v181 |
| 2.14.18 | 53 | 3314 行 game-render.js | **宠物编队阶段 A（战斗零改动）**：`dh-pets-v1.squads`（不新增 store 键，`battlePicks` = 首发镜像）；旧档**只读派生**迁移（读取不写盘）；不变量 = 每队 ≤4 + **同宠不得跨队** + 至少 1 队 + 队名 ≤8；唯一写入口 `savePetSquads()` 与 5 个管理动作；UI = 宠物面板「🐾 编队管理」原生 `<details>`（改名/↑↓排序/删除/新建/芯片切换/伤员 ⚠️ 保留在队）；新增 `test-pet-squads`（67 断言，含源码守卫）；`test-pet-panel-layout` 两条 `aria-pressed` 计数收紧到阵容区块；全量 **81 套件 / 0 失败**；缓存戳 `?v181` → **`?v182`** |
| 2.14.19 | 53 | 3314 行 game-render.js | **小队接力阶段 B（普通战斗单队接力）**：新增唯一增援入口 `gbReinforce()`（allies/units 同池同步、不重建战斗对象、本回合不重排队列、幂等、只对新单位补跑 `onBattleStart`）；判负参数化 `winnerRule`（默认 `'all'` 与改前逐字一致，`'pets'` 只数非玩家单位并回落）；`checkGroupWin` **先增援后判负**（否则队灭当场结束）；`startGroupTrial` 只在 ≥2 支有宠小队时接线，提供方按 `getPetSquads()` 满血现建、跳空队/全员不可战、用尽返回 null；`groupRestore` 摘除快照后新增单位；新增 `test-squad-relay`（41 断言）；全量 **82 套件 / 0 失败**；缓存戳 `?v182` → **`?v183`** |
| 2.14.20 | 54 | 3371 行 game-render.js | **玩家口径阶段 C（`attackable` 单源目标过滤 + 关卡 mode，仍不启用多队）**：`attackable(u)` = 存活且未打 `_untargetable` 标记，接入 `ai.js` 选靶双入口、`battle-group.js` 的 `selectTargets` 双池/嘲讽/声明合法性/强制目标/技能 `pool`+`allPool`/蓄力/迷惑/伤害分担/光环/`onFoeHeal`/额外目标池、`normalAttack` 与 `groupUnitTurn` 两道闸、反噬与魔法镜、`terrain.js` 全部取靶循环 + `applyTerrainResult` 兜底闸；`group-levels.js` 每关派生 `mode:'multi'\|'single'`（`stageIsMulti`，g18 起每 6 大关的 x-5 ⇒ 全期只有 `g18-5`/`g24-5`，Boss 与 1–3 关永不 multi，越界不派生）；**mode 只派生不消费**（源码守卫钉死），普通战斗逐字节等价；新增 `test-attackable`（48 断言）；全量 **83 套件 / 0 失败** + a11y 40/40；缓存戳 `?v183` → **`?v184`** |
| 2.14.21 | 55 | 3542 行 game-render.js | **多队双场景阶段 D（导演 + 双栏 + 玩家轮转 + 替补绑定，首次开放多队）**：新模块 `group-dual.js`（`MULTI_SCENE_ENEMY_SCALE=0.85` 缩放 / `createDualBattle` / `dualStep` 换边与冻结跳过 / `dualMovePlayer` 回合边界双池搬移 / `dualReinforce` 未上场队列按序满血补给并绑定场景 / `dualMergedBattle` 门面 / 场景文案）；`game-render.js` 唯一 `glv.mode==='multi'` 分支 → `_startDualGroupTrial`（A←一队、B←二队、两队任一不可战即不开战、每侧各调一次 `groupStageEnemies` 完整编成 ×0.85、敌人 id `enemyA-`/`enemyB-`、**一个共享 rng 注入两个 gb**、双场景不做时间旅行），`_groupStep` 改走 `_dualStepOnce` 且 `_groupBattle` 降级为当前场景活指针，导演 notes → toast，`renderGroupBattlePane(gb,sfx)` id 参数化 + 双栏 dense 阈值 5，`renderGroupOverlay` 双栏 `.gb-dual` + 栏头状态 + 两侧合计血量 + 控制条「回合 / 当前 / 替补」，`_gbFindUnit` 跨两场景查单位，结算仍单入口（`dualMergedBattle` 门面喂既有奖励/受伤/统计/历史）；修两处开发期缺陷（替补队列 `buildSquad` 未入 `dir` 导致空转判败、`_groupDual` 未在开战入口复位导致陈旧导演接管下一场）；新增 `test-dual-battle`（78 断言，含真走 g18-5 开战入口的集成段）；全量 **84 套件 / 0 失败** + a11y 40/40；缓存戳 `?v184` → **`?v185`** |
| 2.14.22 | 55 | 3543 行 game-render.js | **阶段 E（真机双栏复核 + 平衡实测定值）**：新增 `scripts/verify-dual-layout.js`（无头 Chrome + 自建 CDP 客户端，Node 22 自带 WebSocket）在 360×640 / 390×844 真开 g18-5 量测 **28 项**，抓到**双栏芯片溢出广场下沿**（A 越界 153px / B 81px）并修复 —— 双栏改紧凑芯片 `--gb-unit-w:44px` / `--gb-unit-ico:18px`（`min-width`/`min-height` 仍 **44px = 触摸下限**）、中央区压到 2px、`.gb-dual .gb-arena-row` 取消 `max-height` 裁切、控制条标题压成无空格；新增 `scripts/balance-dual.js`（同关同阵容、40 种子、单场景用户基线）实测把 `MULTI_SCENE_ENEMY_SCALE` **0.85 → 0.95**（0.85 时双场景比同关单场景**容易 4~40pp**，与精英关定位相反；0.95 持平或略难）。全量 **84 套件 / 0 失败** + a11y **40/40**，缓存戳 `?v186` |
| 2.14.23 | 55 | 3550 行 game-render.js | **多队双场景改为常态 + 按关卡类型分档 + 双 Boss**（作者新规格，推翻 v1.2 Q6）：`stageIsMulti` 重写为「x1–x9 全 multi；x10 仅 `lg % MULTI_BOSS_EVERY(3) == 0` 为 multi」，240 关里 **224 关 multi**、16 个非双 Boss 关仍 single；`MULTI_SCENE_SCALE_BY_TYPE = {normal:0.85, elite:0.9, boss:0.9}` 取代单一常量（`multiSceneScale(type)`，未知回落 0.85）；`applyMultiSceneScale` 接受数字或 type 字符串；**双 Boss = 两场景各 1 Boss**（每侧完整编成，天然 2 Boss，无新编成逻辑）；开战入口 `_startDualGroupTrial` 改返回布尔，**队不足回退单场景**（不再挡住新档开战）；`test-attackable` §7 重写（53 断言）、`test-dual-battle` 分档 + 新增 §14（93 断言）；`verify-dual-layout` 支持传关卡 id，g3-1 / g3-10 / g18-5 三种类型各 28/28。全量 **84 套件 / 0 失败**，缓存戳 `?v187` |
| 2.14.24 | 55 | 3508 行 game-render.js | **多队收口 + 编队/关卡 UI**：① **单场景不再有接力** —— 删 `_groupRelayNext` 提供方与 `_groupRelaySquads`/`_groupSquadIdx`/`_groupRelayPending` 三全局、删 `squadUnits`/`reinforce` 写入与上场 toast（引擎 `gbReinforce` 保留，`test-squad-relay` 收窄为「引擎能力 + 不接线」41 断言）；② 关卡列表加形态标签 `stageModeLabel(lg, st)`（'' / 双场景 / 双 BOSS，判据仍 `stageIsMulti`）+ `.lv-tag`，顺带修 60px 窄卡「第10关」折行与 Boss 名重复王冠；③ 培养页 `.train-lineup` 改**多队摘要**（每队一行 → 打开编队管理），删除 `data-train-pick` 就地切换；④ 编队 UI：选中态实心 + ✓、跨队占用标「在 X」+ disabled（参战阵容同源）、队卡 `↑↓🗑` 独立一行、元信息「未编队 N 只」；新增 `test-squad-ui.js`（28 断言）+ `verify-squad-ui.js`（无头 Chrome 两视口）；全量 **85 套件 / 0 失败**，缓存戳 `?v188`。⚠️ 普通档 0.85 按作者裁决保持不动，等实测 |
| 2.14.25 | 55 | 3508 行 game-render.js | **评审后 P1+P2 收口**（ui-skills `pbakaus/audit` + `critique` 两套标准，客观数据来自新增 `scripts/audit-squad-ui.js`）：① **P1-1 去重** —— 宠物面板「出战编队」改只读摘要（非按钮芯片）+ 唯一主 CTA + 「编队管理 ›」单一编辑入口，删 `[data-pet-pick]` 就地切换与它的 `savePetBattlePicks`，`_petBattlePicks` 只经 `togglePetSquadPet → petSquadRefreshPicks` 维护；② **P1-2 样式单轨** —— 培养页 4 入口 + 开战 + 编队管理改 `.btn-entry` / `.btn-primary`，大关关卡卡从内联 `btnStyle` 改 `.gl-stage.is-open/.is-elite/.is-boss/.done/.locked`（原来被 `[style*="border-color"]` 的 `!important` 收成中性 → 10 张卡一样），守卫收窄为四类白名单；③ **P2-3 标签只标例外**（双场景不再逐卡）+ `.gl-modes` 列表头分布行 + `.lv-state{nowrap}` 修窄卡折行；④ P2-4 编队行补 `›` 与 hover/active；P2-5 徽标「作战」→「第 N 队」；P2-6 占用态 `.45→.6` 且标签改不透明 `--text2`（原 ≈2.1:1）；P2-7 核实删除**本就有** `confirm()`（评审误判，已更正）；`test-squad-ui` 41 断言、`test-pet-panel-layout` 90、`test-pet-icons` 263、`verify-squad-ui` 两视口全绿；全量 **85 套件 / 0 失败**，缓存戳 `?v189` |
| 2.14.26 | 55 | 3508 行 game-render.js | **全项目 UI/UX 评审落地（批次 A+B+C）** —— 评审 14 视图 × 2 视口（技术审计 10/20、Nielsen 21/40），客观数据来新增 `scripts/audit-whole-ui.js`：① P1-A 本旬目标三卡拆值/单位 span + nowrap + 第三卡改「本旬状态」（原来「0/6 / 天 / 状态」三行且数值重复）；② P1-B 调试 FAB 默认不建 DOM（`?debug=1` 才挂，此前压住动作库 🗑️ 与关卡卡）；③ P1-C 图鉴激活页签计数 1.3:1 → `--on-brand`；④ P1-D 个人最佳空态 CTA 由死按钮 `switchTab("strength")` 改为训练/力量；⑤ 全站标题 `div.section-hdr` → `<h2>`（此前 h 标签 = 0）；⑥ 动作库 26 个图标按钮补 `aria-label`；⑦ 主按钮三档 + 新增 `.btn-quiet`；⑧ 空态统一 `.empty`（padding 48px→26px）且计划页补真动作；⑨ 设置子页签「挑战」→「玩法」；⑩ 队卡降层、统计卡数值中性色、权重徽标、热力图「今天」、图鉴芯片 44px；`test-ui-consistency` **51 断言**、`test-display-float` 32，全量 **86 套件 / 0 失败**，缓存戳 `?v190` |
| 2.14.27 | 55 | 3508 行 game-render.js | **全项目评审批次 D：字号阶梯（P2-10）** —— `--fs-3xs` 由 10px 提到 **11px**（保留 token 名，49 处 JS 内联引用一次抬升），**10px 这一档下线**：360 宽实机里 10px 中文字形仅 ~5px 高，却承载「还差 4 天 / 单敌·敌群 / 标签」要读的信息；试炼卡副标题与状态行 `.gl-group-desc`/`.gl-group-state` 11px → **12px**（要区分「基础/进阶/高阶」与「进行中/未开启」，是单屏最密的 11px 区），战斗页 <12px 文本 **48 → 0**，12px 下仍折 2 行、卡高不变。14 视图 × 2 视口横向溢出 0、对比失败 0；全量 **86 套件 / 0 失败**；缓存戳 `?v190` → `?v191` |
| 2.14.28 | 55 | 3508 行 game-render.js | **全项目评审批次 E：个人表单降层 + 导入语义写明**（P2-5 续 / P3-4）—— ① 个人资料卡原为「卡 2px 框 → label → 每行 input 2px 框」三层盒子，一张卡叠 3 个等宽方框；改输入项 `border:0` + **只留一条 2px 下划线**、底色 `transparent`，获焦只换 `--brand` 色不改宽度（`min-height:44` 触控约束原样保留）；② 设置·数据旧提示只写「用于备份」、没答最关键的一句 —— 真实语义（`store.mergeAll`）是**按键合并**：文件里有的键整块替换、没有的键保留，故说明行改左对齐多行 `.data-hint` 三句写清，并在**导入前弹确认**写明「N 项整块覆盖 / 不会清空 / 不会逐条追加」；`test-ui-consistency` 51 → **61 断言**；14 视图 × 2 视口溢出 0、对比 0；全量 **86 套件 / 0 失败**；缓存戳 `?v191` → `?v192` |
| 2.14.29 | 55 | 3508 行 game-render.js | **全项目评审批次 F：层级与顶栏收尾**（P3-1 / P3-2 / P3-5）—— ① 两级页签原来同时实心填充、与区块标题引导线同色，一屏三条同宽蓝条；改**一级实心、二级只留 2px 品牌下划线 + 品牌字**（hover 仅 8% 淡底），`.section-hdr::after` 引导线 `--orange-g` → 中性 `--bd`（蓝只表示状态/主操作）；② 顶栏三枚 44px 按钮从纯 emoji（🔄/🌙/🔄，无可见文案）改**图标 16px + 文案 11px 竖排**（同步 / 主题 / 状态），状态灯空闲图标 🔄 → ○；`setTheme`/`setSync` 从整块 `textContent` 改为只换 `.hb-ico`，否则会把新文案冲掉；③ 小屏版本号回归 —— 副标题拆 `.hs-brand` + `.hs-ver`，**≤430 只藏英文词**（390 宽英文会折两行，故阈值取 430），版本号在 360/390 均可见；`test-ui-consistency` 61 → **70 断言**；14 视图 × 2 视口溢出 0、对比 0（每视图 <12px +3 来自三枚顶栏文案，预期内）；全量 **86 套件 / 0 失败**；缓存戳 `?v192` → `?v193` |

> **「JS文件数」** = `page/` 下 `*.js` 文件数量（**含子目录**，如 `page/data/exercises-dataset.js`）→ 本版（2.14.21）实测 **55**
> （2.14.20 的 54 + 本版新增 `page/group-dual.js`）。
> **「最大文件」** = `page/*.js` 中 `\n` 计数（即 `wc -l`）最大者 → 本版实测 `game-render.js` **3542 行**（次席 `battle-group.js` 2370 行）。
> ⚠️ 本表 v2.11.0–v2.11.5 六行的「最大文件」已在 **v2.12.0** 按各版本发布提交勘误（2362 → 2656/2734/2716/2716/2716/2738）；
> `doc/changelog-v2.11.md` 内同一张表的对应行未回改，以本表为准。更早的历史行沿用各自版本的原始记录，未逐版重测。
> **v2.14.16 现场复核**：`page/*.js` **53** 个、`game-render.js` **3314 行**（次席 `battle-group.js` 2190 行），故本版行按实测填写；v2.14.1–v2.14.15 的「最大文件」列沿用「（见 changelog）」历史写法，未逐版回改。

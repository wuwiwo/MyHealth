# WP-I 宠物头像评审（14 只 SVG · 第三方交付）

> 评审对象：另一条线交付、当前工作树内**未提交**的 `page/media/pets/*.svg`（14 只）与 `doc/design-pet-icons.md`。
> 本文是**唯一写入仓库**的文件；所有图片落在工作区临时目录 `_tmp-pet-icons-review/`（未 `git add`、未删除，供主控复核后自行清理）。
> 本轮**没有修改任何代码 / SVG / 配置**，**没有执行任何 git 写操作**，未运行 `scripts/test-*.js`。

> ### ⚠️ 评审期间工作树发生了外部变化（重要）
> 评审开始时（`git status --short`）：`page/media/pets/` 与 `doc/design-pet-icons.md` 为 `??`（未跟踪），代码里**零引用**。
> 评审进行中，**另一条线/主控把「接入」也做了并 `git add` 了**，当前 `git status --short` 为：
> `M .gitignore / M README.md / M doc/changelog-v2.2.md / A doc/design-pet-icons.md / M page/challenge.js / M page/index.css / M page/index.html / A page/media/pets/*（14 svg + 2 png + preview.html）/ M page/pet-ui.js / M page/utils.js / A scripts/test-pet-icons.js`。
> 具体落地内容（本文已据此复核）：
> - `page/pet-ui.js` 新增 **`petIconUrl/petIconHtml/petIconStageHtml`**（图标渲染唯一入口，缺图标返回 `''` 由调用方兜底回 emoji）；`<img class="pet-ico" width/height="size" alt="<中文名>" loading="lazy" decoding="async">`。
> - `page/index.css` 新增 `.pet-ico{display:block;image-rendering:pixelated;image-rendering:crisp-edges}`、`.pet-ico-wrap`、`.pet-ico-wrap>.pet-ico{width/height:100%}`、`.pet-ico-badge`、`.pet-detail-ico`、`.pet-pick-chip/.pet-cmp-chip`。
> - 调用点：列表卡 `petIconStageHtml(id, **40**, stage)`（含 🥚/🌱 角标）、详情页头部 `**40**`、参战芯片 `**24**`、对比芯片 `**24**`、`page/challenge.js` 结算面板 `**32**`。
> - `page/utils.js` `APP_VERSION 2.2.28 → **2.2.29**`；`README.md` / `doc/changelog-v2.2.md` / `index.html?v126` 缓存串同步；新增仓库级校验脚本 `scripts/test-pet-icons.js`（210 行，**按任务约束未运行**）。
>
> **因此「实际显示尺寸」不是 24px，而是 40px（列表/详情）+ 24px（芯片）+ 32px（结算）**。本文 ③④⑤ 已按真实接入版本重算，并新增证据 `real-sizes-dpr1/dpr4.png`、`card-390-real-dark/light*.png`。
> **对 14 个 SVG 文件本身的数据（② 表）无影响**：中途重跑分析器，字节数 / rect 数 / 颜色 / 边距与首轮完全一致；抽查 MD5：`sparkle.svg a77ecd917082c8983b43180da20f588f`、`darkcrow.svg 97ffe068ed91e539424844c3aedb6e2e`。

---

## ① 评审范围与方法

### 1.1 渲染尺寸的确定（先在代码里查出真实尺寸）

**（a）接入前的槽位**（评审开始时，SVG 零引用）：

| 情境 | 代码位置 | 现状 | 头像槽尺寸（实测推算） |
|---|---|---|---|
| 宠物列表面板 | `page/pet-ui.js` `renderPetPanel()`：`<span class="pet-card-ico">${stageIcon}</span>`；`page/index.css:730` `.pet-card-ico{font-size:var(--fs-2xl)}` | 放阶段 emoji（🥚/🌱/🐾） | 24px（`--fs-2xl`=1.5rem；`body` 未设 line-height，行盒 ≈28–29px） |
| 宠物详情页标题行 | `renderPetDetail()` 头部：`←` + 名称(`--fs-lg`=17px) + 稀有度 | 无头像槽 | — |
| 参战选择 chip | `.speed-btn`（`padding:3px 10px`） | 纯文字按钮 | 无槽 |
| 战斗单位卡 / 队伍条 | `page/game-render.js` `renderGroupOverlay()`（`.gb-unit`/`.gb-order-chip`） | 纯文字 + 血条 | 无槽 |

**（b）评审中途接入后的真实尺寸（最终结论按这一版）**：

| 情境 | 值 | 代码 |
|---|---|---|
| 列表卡头像 | **40px**（外包 `.pet-ico-wrap` 40×40 + 阶段角标 🥚/🌱 绝对定位） | `pet-ui.js` `petIconStageHtml(p.speciesId, 40, p.stage)` |
| 详情页头部头像 | **40px** | `pet-ui.js` `pet-icon…petIconHtml(pet.speciesId, 40)`（`.pet-detail-ico`） |
| 参战 / 对比芯片头像 | **24px** | `pet-ui.js` `petIconHtml(p.speciesId, 24)` |
| 挑战结算面板「宠物蛋」 | **32px** | `challenge.js` `petIconHtml(state.petEggReward.speciesId, 32)` |

**尺寸与 3px 网格的整除关系（本轮最关键的一条）**：SVG 的逻辑格是 **3px**（16×16 网格 = 48px 画布）。显示尺寸必须是 **16 的倍数**才能让每格落成整数像素：

| 显示尺寸 | 每格 = 3×size/48 | 是否整数 | 现状 |
|---|---|---|---|
| **40px** | **2.5px** | ❌ | **列表卡 + 详情页（主要头像位置）** |
| **24px** | **1.5px** | ❌ | 参战/对比芯片 |
| **32px** | 2px | ✅ | 结算面板（唯一干净的非 48px 位置） |
| 16 / 48 / 64 / 96 / 192px | 1 / 3 / 4 / 6 / 12px | ✅ | 未使用 |

> 实测（`real-sizes-dpr1.png` 逐像素游程，同一条扫描线上连续同色像素长度）：48px → 最小游程 **3px**（=1 格，均匀）；**40px → 同一行内出现 2px 与 3px 混排**（`kirin`：2px×1 + 3px×2；`darkcrow`：2px×1 + 3px×2）→ **描边粗细在同一条边上就跳动 ±50%**；32px → 全为 **2px**，均匀；24px → **1px 与 2px 混排**（最差）。
> 另测：`image-rendering:auto` 与 `pixelated` 输出**逐像素完全相同**（色数 5–6、游程一致）——因为 SVG 自带 `shape-rendering="crispEdges"`，浏览器已按硬边渲染；**当前接入的 `image-rendering:pixelated` 实际是空操作**（无害，但不解决 40/24px 的不均）。

### 1.2 渲染方法与覆盖的三种情境

两层渲染，互为交叉验证：

1. **自建栅格化器**（纯 Node + zlib，脚本在 scratchpad，不入仓库）：按 `<rect>` 精确填充，在 **48 / 96 / 512px** 出图。
   - 这些尺度下所有矩形边界都落在整数像素（坐标全是 3 的倍数，512px 时每格正好 32px）→ **像素精确、零抗锯齿**，用于查「细碎路径 / 白边 / 透明边 / 意外空洞」。
   - 另出 **24 / 32 / 48 / 96px** 无标注「盲测条」（乱序、铺在真实卡面色上），用于「小尺寸能否认出是什么」。
2. **headless Chrome**（静态服务器 `python -m http.server 8765`，根=工作区，**未用 `file://`**，用后已停止；DPR=1 与 DPR=4 各一次）：
   - 真实浏览器的 SVG 渲染（含抗锯齿/半格处理），页面里的 CSS **令牌与组件规则逐字摘录自 `page/index.css`**。

| 情境 | 产物 |
|---|---|
| 实尺寸 24px（芯片槽） | `sheet-actual-24.png`、`strip-blind-24-dark-card.png`、`strip-blind-24-light-card.png`、`card-390-dark-part1-列表卡-2x.png` |
| **实尺寸 40px / 32px（接入后的列表与详情槽）** | `real-sizes-dpr1.png`、`real-sizes-dpr4.png`、`card-390-real-dark.png`（+ `-p1/-p2/-p3` 分段）、`card-390-real-light.png`（+ `-p1/-p2/-p3`）、`sheet-actual-32.png`、`strip-blind-32-dark-card.png` |
| 放大 48 / 96 / 512px | `sheet-48.png`、`sheet-96.png`、`single-<id>-512.png`（×14） |
| 真实卡片背景（390 宽，深/浅双主题 + 圆角裁切 + 尺寸对照） | `card-390-dark.png`、`card-390-light.png` 及其 3 段 2× 裁切 |
| 内联同页（id/clipPath 污染实测） | `inline-all-14.png`（页面内含实测报告文本） |
| 尺寸 × 网格对照（16/20/24/32/36/48/64/96 + auto/pixelated） | `sizemap-sparkle-16-32-48-64-96.png`、`scalecmp.png`、`scalecmp-dpr4.png` |

### 1.3 图片清单（全部在 `E:\dd\Documents\hanako\Health\_tmp-pet-icons-review\`）

| 文件 | 说明 |
|---|---|
| `sheet-96.png` | 96px 总览，按稀有度分组 + 名称/稀有度/speciesId/角色标注（首屏证据图） |
| `sheet-48.png` | 48px（原生）同版式总览 |
| `sheet-actual-24.png` / `sheet-actual-24-dpr4.png` / `sheet-actual-32.png` | **实尺寸**24px（DPR1 / DPR4 手机观感）、32px 同版式总览 |
| `strip-blind-24/32/48/96-dark-card.png` | 24/32/48/96px **无标注乱序条**，铺真实深色卡面 `#111827`（盲测可辨识度） |
| `strip-blind-24-light-card.png`、`strip-blind-48-light-card.png` | 同上，浅色卡面 `#ffffff`（浅色主题对比度） |
| `single-<id>-512.png`（×14） | 单只 512px 精确几何 + 棋盘底（查白边/透明边/空洞/细节密度） |
| `single-<id>-48-alpha.png`（×14） | 单只 48px 保留 alpha（查画布边界与透明区） |
| `sizemap-sparkle-16-32-48-64-96.png` | 同一只在 16/32/48/64/96 的整数格对照 |
| `scalecmp.png` / `scalecmp-dpr4.png` | 16/20/24/32/36/48/64/96px 一排 + `image-rendering:auto vs pixelated`（DPR1 严苛版 / DPR4 手机版） |
| `card-390-dark.png` / `card-390-light.png` | **390 宽仿真实卡片**（真实令牌 + `.pet-card`/`.gb-unit` 规则；24px 槽、详情行、战斗卡、圆角裁切、尺寸对照 5 段） |
| `card-390-{dark,light}-part1-列表卡-2x.png` | 列表卡段（2× 放大，可读） |
| `card-390-{dark,light}-part2-详情与战斗-2x.png` | 详情标题行 + `.gb-unit` 段（2×） |
| `card-390-{dark,light}-part3-圆角与尺寸-2x.png` | 圆角裁切 + 24/32/48/96 同图对照段（2×） |
| `inline-all-14.png` | 14 只 `<svg>` 内联同页（24px + 96px）+ **浏览器实测报告**（含重复 id 计数） |
| `real-sizes-dpr1.png` / `real-sizes-dpr4.png` | **接入后真实尺寸**对照：同一只 × 48 auto / 48 px / 40 auto / 40 px / 32 auto / 32 px / 24 auto / 24 px（DPR1 逐像素可量 / DPR4 手机观感） |
| `card-390-real-dark.png` / `card-390-real-light.png` | **接入后真实 DOM + 真实 CSS** 的 390 宽卡片（40px 列表槽 + 角标、40px 详情、24px 芯片、14 只 40px 网格、40px 三种写法、圆角裁切） |
| `card-390-real-{dark,light}-p1/p2/p3.png` | 上述两图的 1:1 分段（每段 390×~700，可直接看清像素） |
| `emoji-vs-svg.png` | 现状 emoji 槽 vs SVG 头像并排（接入前后对照） |
| `_harness/*.html` | 上述截图的生成页（含 `real-sizes.html` / `real-card-dark.html` / `real-card-light.html` / `idcheck.html`；与图片同目录，非仓库源文件） |

---

## ② 客观数据表

14/14 全部满足硬规格：`<svg xmlns width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges">`、纯 `<rect>`+`<title>`、坐标全为 3 的倍数、无越界、无渐变/滤镜/`opacity`/`stroke`/`transform`、无 `<path>/<circle>/<ellipse>/<polygon>/<text>/<image>/<g>/<defs>`、无 XML 声明、无 BOM、UTF-8、单只 2.8–4.9KB（限 6KB）、色数 3–7（限 8）、**无 `id`/`clipPath`/`url(#)`**。合计 53,521B。

| id | 稀有度 | 字节 | W×H | viewBox | 宽高比 | 固定 W/H | rect | 色数 | bbox(l,t,r,b) | 四周边距(l,t,r,b) | 覆盖% | 描边占比% | 左右非对称% | 封闭透明洞(px) | 主色(面积占比) | 主色 vs 深卡 / vs 浅卡 | `<title>` | aria/role | id 数 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sparkle | R | 3723 | 48×48 | 0 0 48 48 | 1:1 | 是 | 53 | 4 | 3,3,42,45 | 3,3,6,3 | 32.8 | 38.1 | 21.4 | 0 | #FFC531 (52%) | 11.22 / **1.58** | 闪闪星 | 无 | 0 |
| waterdrop | R | 3815 | 48×48 | 0 0 48 48 | 1:1 | 是 | 56 | 3 | 6,6,39,42 | 6,6,9,6 | 38.3 | 30.6 | 12.2 | 0 | #3FA9F5 (60%) | 6.93 / 2.56 | 水水滴 | 无 | 0 |
| pongpong | R | 4326 | 48×48 | 0 0 48 48 | 1:1 | 是 | 65 | 3 | 6,6,42,48 | 6,6,6,**0** | 47.7 | 34.4 | 14.8 | 0 | #F79BC0 (47%) | 8.79 / 2.02 | 彭彭猪 | 无 | 0 |
| flamechick | SR | 3759 | 48×48 | 0 0 48 48 | 1:1 | 是 | 55 | 6 | 6,3,42,48 | 6,3,6,**0** | 48.4 | **16.1** | 6.5 | 0 | #FF7A2F (39%) | 6.82 / 2.60 | 火焰鸡 | 无 | 0 |
| rocksteady | SR | 3985 | 48×48 | 0 0 48 48 | 1:1 | 是 | 59 | 4 | 3,3,45,48 | 3,3,3,**0** | **56.3** | 30.6 | 2.8 | 0 | #7C848F (59%) | 4.69 / 3.78 | 坚强岩 | 无 | 0 |
| chirpbird | SR | 4220 | 48×48 | 0 0 48 48 | 1:1 | 是 | 63 | 7 | 9,3,45,48 | 9,3,3,**0** | 37.1 | 28.4 | **47.4** | 0 | #4FC3D9 (43%) | 8.57 / 2.07 | 清脆鸟 | 无 | 0 |
| thunderdog | SR | 4930 | 48×48 | 0 0 48 48 | 1:1 | 是 | **74** | 4 | 6,3,45,48 | 6,3,3,**0** | 53.9 | 33.3 | 18.8 | 0 | #FFD23F (49%) | 12.28 / **1.44** | 雷霆犬 | 无 | 0 |
| possum | SSR | 3449 | 48×48 | 0 0 48 48 | 1:1 | 是 | 49 | 4 | 3,9,45,42 | 3,9,3,6 | 36.7 | **47.9** | 34.0 | 0 | **#23262E (48%)** | **1.17** / 15.13 | 小负鼠 | 无 | 0 |
| darkcrow | SSR | **2826** | 48×48 | 0 0 48 48 | 1:1 | 是 | **38** | 5 | 3,3,42,48 | 3,3,6,**0** | 41.4 | 45.3 | 26.4 | 0 | **#2A3550 (51%)** | **1.46** / 12.18 | 黑暗鸦 | 无 | 0 |
| icecrystal | SSR | 3573 | 48×48 | 0 0 48 48 | 1:1 | 是 | 51 | 5 | 6,6,42,42 | 6,6,6,6 | **29.3** | 30.7 | 14.7 | 0 | #7FE3F0 (49%) | 11.95 / **1.48** | 小冰晶 | 无 | 0 |
| lightspirit | SSR | 3633 | 48×48 | 0 0 48 48 | 1:1 | 是 | 52 | 5 | 6,3,39,48 | 6,3,9,**0** | 31.3 | **20.0** | 15.0 | **36** | **#FFFFFF (35%)** | 17.74 / **1.00** | 光之精灵 | 无 | 0 |
| dream | UR | 3808 | 48×48 | 0 0 48 48 | 1:1 | 是 | 55 | 7 | 3,9,45,45 | 3,9,3,3 | 39.1 | 41.0 | 28.0 | **9** | **#23262E (41%)** | **1.17** / 15.13 | 梦幻 | 无 | 0 |
| nonebear | UR | 3499 | 48×48 | 0 0 48 48 | 1:1 | 是 | 50 | 5 | 3,3,45,45 | 3,3,3,3 | **59.4** | 44.7 | 3.9 | 0 | **#23262E (45%)** | **1.17** / 15.13 | 无念熊 | 无 | 0 |
| kirin | UR | 3975 | 48×48 | 0 0 48 48 | 1:1 | 是 | 58 | 4 | 3,3,45,48 | 3,3,3,**0** | 47.7 | 36.1 | 19.7 | 0 | **#FFFDF5 (39%)** | 17.42 / **1.02** | 圣光麒麟 | 无 | 0 |

**表内派生结论（后面维度直接引用）**

- **颜色全部硬编码**（SVG 内无法解析宿主 CSS 变量，属必然；但 14 只共出现 30 个不同 hex，其中 8 只含 `#FFFFFF`，**只有 `#23262E`/`#0B0D12`/`#FFFFFF` 三个值与项目令牌同名**）。`#F2C14E / #F79BC0 / #4FC3D9` 等**不与任何令牌冲突**（也没有复用 `--brand-fill #F97316`、`--purple #C084FC` 等品牌色），因此**不存在「图标色与 UI 令牌抢语义」的问题**；反之**也没有跟随主题**（见维度 5/6）。
- **主色对比度**（对比透明底之外的实测卡面色）：**深卡 `#111827` 下 4 只 < 1.6:1**（possum/dream/nonebear 1.17、darkcrow 1.46）；**浅卡 `#ffffff` 下 5 只 < 1.6:1**（sparkle 1.58、thunderdog 1.44、icecrystal 1.48、lightspirit 1.00、kirin 1.02）。
- **四周边距**：8 只**底边距 = 0**（贴住 48px 画布下沿）。
- **描边（深色）面积占比** 16.1%–47.9%，均值 32.9% —— 波动 3 倍。
- **视觉分量（不透明覆盖率）** 29.3%–59.4%，均值 41.9%。

---

## ③ 逐维度结论

> 严重度：**A**=阻断接入必须处理 / **B**=应修 / **C**=建议 / **D**=无需处理或仅记录。

### 3.1 与设计说明一致

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 1-1 | **硬规格 14/14 全达标**（画布/网格/标签白名单/色彩禁令/编码/体积），§4.2 验收清单里除「48px 可辨识」外的项目我逐条复算通过 | ② 表（数据由 `<rect>` 静态解析 + 48px 栅格化复算得出） | D | 无需动作 |
| 1-2 | **§1.4「主体须在 x∈[3,45]、y∈[3,45] 内（四周至少留 1 格）」被 8 只违反**：底边距=0（pongpong/flamechick/rocksteady/chirpbird/thunderdog/darkcrow/lightspirit/kirin）。**且规格自身矛盾**：§3 各只的「构图草图指引」直接写到 `腿 y 13~15`、`尾 y 10~13`（=到底边），作者是按 §3 画的 | `sheet-96.png`、`sheet-48.png`（下沿齐平）、`card-390-dark-part3-圆角与尺寸-2x.png` | C（若接入圆角槽 → B） | 要么改 §1.4 承认「允许贴底（脚/尾）」，要么把这 8 只整体上移 1 格；**接入圆角头像槽前必须二选一** |
| 1-3 | **`chirpbird` 的「八分音符」不可辨**：48px 起就读作黄色方块/方括号，「张口歌唱」也读不出（§3.6 主特征 + §5.2 曾判 P0 已修） | `sheet-96.png`（清脆鸟 96px）、`card-390-dark-part3-圆角与尺寸-2x.png` ⑤ 96px | B | 音符放大到 ≥3 格宽并留出符尾斜向 1 格；或换成「两道声波弧」更抗缩 |
| 1-4 | **`flamechick` 三簇火焰仍平顶、整体读作「王冠」**（§3.4 要求「高矮错落 + 顶端收尖 + 橙黄双层」，§5.2 判定已修） | `sheet-96.png`（火焰鸡 96px）、`single-flamechick-512.png` | B | 中间一簇再高 1 格并让外两层退 1 格，顶端各收成 1 格 |
| 1-5 | **`dream` 512px 精确几何下读作「黑框方头 + 黄十字 + 紫色块」**，猫耳/长尾/怀中光球三要素都弱；光球是十字/棱形而非 §3.12 要求的「4×4 取圆角」圆球 | `single-dream-512.png` | B | 光球改为 3×3 中心 + 四角各 1 格（得圆角方块），并给球加 1 圈描边与主体分离 |
| 1-6 | **`darkcrow` 主特征「黑不糊」实际失败**：主体 `#0B0D12`，在默认（深色）主题卡面 `#111827` 上对比 **1.46:1**，48px 以下基本消失，只剩紫瞳一个小亮点 | `card-390-dark-part1-列表卡-2x.png`、`sheet-actual-32.png`、`strip-blind-24-dark-card.png`、`single-darkcrow-512.png` | **A** | 见 3.5-1：深色主题下要么给头像槽加底垫，要么把黑暗鸦整体提亮（`#2A3550` 为主体、`#0B0D12` 仅作内阴影），牺牲一点 §3.9「通体黑」 |
| 1-7 | `icecrystal`/`kirin`/`lightspirit` 的「近白 / 淡青」主色在**浅色主题**卡面 `#ffffff` 上对比 1.00–1.48:1，形体消失只剩金/蓝局部与描边 | `card-390-light-part1-列表卡-2x.png`、`strip-blind-24-light-card.png`、`strip-blind-48-light-card.png` | B | 同上：槽位加底垫（推荐）或给这 3 只补一条中调描边色（如 `#5B6B7C`）替代纯 `#23262E`+白底 |
| 1-8 | 16×16 ASCII 草图注释按 §1.2 保留（抽查 `darkcrow.svg` 与 rect 逐格一致） | `page/media/pets/*.svg` 头部注释 | D | 无需动作 |

### 3.2 14 只之间的风格统一性（离群项）

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 2-1 | **描边粗细观感差 3 倍**：描边面积占比 16.1%(flamechick) → 47.9%(possum)。虽然都遵守「1 格 = 3px」，但主体越小、脸越窄的图标描边占比越高 → 24–32px 下 possum/dream/nonebear/darkcrow 糊成「黑块+白缝」，flamechick/lightspirit 则几乎没有轮廓 | ② 表；`sheet-96.png`；`strip-blind-32-dark-card.png` | B | 统一目标带 **28–36%**：过重的 4 只把内层描边换成主体暗色（如 possum 用 `#8B9099`）、过轻的 2 只给外轮廓补一圈 |
| 2-2 | **覆盖率（视觉分量）极差 30 个百分点**：nonebear 59.4% / rocksteady 56.3% vs icecrystal 29.3% / lightspirit 31.3% | ② 表；`sheet-96.png` SSR 组 | B | 稀疏的 2 只放大主体到 ≥ 12×12 格（§1.4 的下限），实心 2 只可略缩，向 40–50% 收敛 |
| 2-3 | **视角不统一**：R/SR 组基本正面像（sparkle/waterdrop/pongpong/flamechick/rocksteady/thunderdog/nonebear），`chirpbird`（左右非对称 47.4%）、`possum`（34%）、`dream`（28%）、`darkcrow`（26.4%）为侧视/斜视。侧面像没有「两眼等高」，§1.4「眼睛统一落在第 6~10 行」对它们不成立 | ② 表（非对称%）；`sheet-96.png`；`sheet-48.png` | C | 若要保留侧视，就在 §1.4 里写明「侧视允许单眼」，并把「视线高度」改成「头部中心线高度一致」 |
| 2-4 | **剪影重合度高**：48px 同画布两两 IoU 平均 0.596，最高 **rocksteady–nonebear 0.827**、pongpong–flamechick 0.770、pongpong–thunderdog 0.769、thunderdog–nonebear 0.768、waterdrop–pongpong 0.760 | ②（IoU 由 48px 不透明掩码计算）；`strip-blind-24-dark-card.png` 中 rocksteady/nonebear/pongpong/thunderdog 相邻时基本无法互辨 | B | 「方块岩 vs 方头熊」「圆胖猪 vs 矮胖鸡/犬」是主要撞车对；建议给 nonebear 加肩线/胸前月牙面积、给 rocksteady 加至少 2 条明显斜裂纹打断方形轮廓 |
| 2-5 | 复杂度离群：`thunderdog` rect 74 / 4930B（最重）vs `darkcrow` rect 38 / 2826B（最轻）；色数 3（waterdrop/pongpong）到 7（chirpbird/dream） | ② 表 | C | 文件体积都 <6KB 达标，仅作记录；若要统一，把 chirpbird/dream 的碎点合并 |

### 3.3 稀有度匹配（R→SR→SSR→UR 视觉分量是否递进）

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 3-1 | **不递进**。覆盖率均值：R 39.6% / SR 48.9% / **SSR 34.8%** / UR 48.7%；细节量（rect 均值）：R 58 / SR 62.8 / **SSR 47.5** / UR 54.3；色数均值：R 3.3 / SR 5.25 / SSR 4.75 / UR 5.33。**SSR 组是最「轻」的一档**（icecrystal 29.3%、lightspirit 31.3% 覆盖，是全 14 只的最小两只），观感上 SSR 比 SR 还低一档 | `sheet-96.png`（SSR 组整体明显小于/淡于 SR 组）、`sheet-actual-32.png` | B | SSR 四只各补一层「稀有度层」（如统一 1 格外发光/底座/晶体碎光），目标：覆盖率 R<SR<SSR<UR 单调递增（建议 ≥40/45/50/55%），或明确写进设计说明「稀有度不通过视觉分量表达」 |
| 3-2 | UR 内部的**梦幻（UR）覆盖 39.1% 低于 SR 的火焰鸡/雷鸣犬**，UR 三只彼此也不齐（39.1/59.4/47.7） | ② 表；`sheet-96.png` UR 组 | C | 同上，与 3-1 一并处理 |

### 3.4 小尺寸可读性（**重点；以实际尺寸图判断，未用放大图**）

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 4-1 | **24px（参战/对比芯片槽）下大面积不可辨**。盲测（无标签）结论：**能一眼读出**：`sparkle`（黄四角星）、`waterdrop`（蓝色水滴）；**勉强**：`rocksteady`/`nonebear`（「方块 + 一张脸」，但两者互不可分）、`pongpong`（粉块）、`flamechick`（橙块 + 尖冠）、`icecrystal`（淡青晶体）、`thunderdog`（黄块 + 立耳）；**认不出**：`darkcrow`（几乎不可见）、`possum`（白灰细条）、`lightspirit`（白团 + 环）、`dream`（一簇小色块）、`chirpbird`（青 + 黄色方块，音符读成方块） | `strip-blind-24-dark-card.png`（盲测条）、`sheet-actual-24.png`、`card-390-dark-part1-列表卡-2x.png` | B（芯片旁始终有文字，可容忍） | 芯片保持「图标仅作提示」的定位即可；若要真正「扫一眼认出」，需 32px 起 + 重画对比度 |
| 4-2 | **40px（列表卡/详情主槽，接入后）改善但仍有 2 只读不出**：`darkcrow` 在深色卡上仍是「一坨暗紫黑 + 一点紫瞳」；`lightspirit`/`icecrystal` 是淡色团；`kirin` 在白金相间下读作「塔/船」而非兽。可读的：`sparkle`/`waterdrop`/`pongpong`/`flamechick`/`rocksteady`/`nonebear`/`dream`（勉强）/`possum`（描边主导） | `card-390-real-dark-p1.png`、`card-390-real-dark-p2.png`、`card-390-real-light-p1.png`、`sheet-actual-32.png` | **A**（列表卡是最常被看到的位置） | ① 把 40px 改成 **32px 或 48px**（见 4-5，纯 CSS/参数改动即可干净）；② 同时按 1-6/1-7 处理对比度 |
| 4-3 | **48px（原生）下 14 只可辨**（与作者验收清单一致），但 48px 在应用中**没有被使用**；即「按 48px 验收通过」不等于「接到应用里能看」 | `sheet-48.png`、`strip-blind-48-dark-card.png` vs `strip-blind-24-dark-card.png`、`card-390-real-dark-p1.png` | A（同 4-2） | 验收清单把 48px 改成「**接入尺寸 40px / 24px** 可辨」 |
| 4-4 | **非整数倍尺寸的真实后果（实测游程）**：48px 最小游程 3px（均匀）；**40px 同一行混排 2px 与 3px**；32px 全为 2px（均匀）；24px 混排 1px 与 2px | `real-sizes-dpr1.png`（逐像素量）、`real-sizes-dpr4.png` | **B**（观感「脏」，但不影响辨识结论） | 尺寸令牌化并强制 16 的倍数，见 ⑤.1 |
| 4-5 | `image-rendering` 实测：`auto` 与 `pixelated` **逐像素完全相同**（色数 5–6、游程一致）；且**没有任何抗锯齿模糊**（整数定位下无中间色） | `real-sizes-dpr1.png`、`scalecmp.png`、`sizemap-sparkle-16-32-48-64-96.png` | D（现状 `pixelated` 无害，只是空操作） | 可保留（防未来换浏览器/换尺寸），但别指望它解决 40/24px 的不均 |

### 3.5 技术质量

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 5-1 | 透明边/白边：**无污染**。512px 精确渲染 + 棋盘底下逐像素检查，14/14 画布完全透明、无半透明像素、无灰/白边；唯一白色是设计内的 `#FFFFFF` 高光（符合 §1.3） | `single-<id>-512.png`（×14，棋盘底）、`single-<id>-48-alpha.png` | D | 无需动作（但见 5-6：浅色主题下白**主体**仍会消失） |
| 5-2 | **封闭透明洞**：`lightspirit` 36px（= 光环中心 4 格镂空，符合 §3.11「中心必须透明」✔）；`dream` **9px（恰好 1 个 3×3 单元）** 位于光球与身体相接处，疑非故意 | `single-lightspirit-512.png`、`single-dream-512.png` | C | 确认 dream 那 1 格是「有意留缝」还是漏画；若是漏画，补 1 格 `#23262E` 或 `#FFE48A` |
| 5-3 | 居中/基线：四周边距不一（sparkle 3,3,6,3 vs 水水滴 6,6,9,6 vs chirpbird 9,3,3,0），且 8 只贴底 → 并排时**下坠感/视觉重心不齐** | `sheet-96.png`、`sheet-48.png`（分组行内基线明显不齐） | C | 统一到「主体外接框居中 + 至少 3px 边距」，或按 §3 各只指引统一「脚底 = y45」形成一致的落地线 |
| 5-4 | 裁切风险：若头像槽用 `border-radius + overflow:hidden`，**星尖/独角/耳尖会被切**（radius 10px 已可切掉 sparkle 星尖；radius 50% 把 kirin 独角、sparkle 星角切平） | `card-390-dark-part3-圆角与尺寸-2x.png`、`card-390-light-part3-圆角与尺寸-2x.png` | B | 槽位用 44px 或 8px 小圆角（或槽不裁切，只裁底垫）；**不要用 `border-radius:50%`** |
| 5-5 | 路径冗余：无 `<path>`（纯 rect 是规格要求 ✔），但同色相邻 rect 未完全合并（如 darkcrow 相邻同色多次 3px），14 只合计 773 个 rect | ② 表；`page/media/pets/darkcrow.svg` 等 | C | 体积已达标，可选优化 |
| 5-6 | `id`/`clipPath` 冲突：**零风险**。浏览器实测把 14 只内联进同一 DOM（元素 1658 个）：重复 id **0**、`clipPath`/`gradient`/`filter`/`mask` 全 0、真实 `url(#)` 引用 0、`<svg>` 14/14 渲染宽度 24px（CSS 覆盖生效） | `inline-all-14.png`（页面内自带的实测报告文本） | D | 无需动作（内联也不会污染；实测报告里「url(#) 引用 2」是页面自身文案/脚本措辞的自匹配，非 SVG 引用） |
| 5-7 | `xmlns` 缺失：无（14/14 都有 `xmlns`）。`width/height="48"` 固定值 14/14 都有 —— 在 `<img>` 场景下若宿主未显式给尺寸，会按 **48px 固有尺寸**渲染，把 `.pet-card-head` 行高从 ~29px 撑到 48px。**接入版本已正确处理**：`petIconHtml()` 输出 `width/height="size"` 属性 + `.pet-ico-wrap>.pet-ico{width/height:100%}` 双重约束 → 实测渲染宽度 = 请求尺寸（14/14） | `inline-all-14.png`（报告行「仍带 width/height 属性的 svg: 14 / 14」）、`card-390-real-dark-p1.png` | D（已被接入代码吸收） | 保持；若将来换用 `background-image` / sprite，必须重新保证显式尺寸 |
| 5-8 | **阶段角标遮挡图形**：`.pet-ico-badge{right:-5px;bottom:-5px;font-size:var(--fs-2xs)}`（🥚/🌱，仅在蛋/成长期出现）压在 40px 头像的右下角上 —— 右下角有内容的 `sparkle`（右下星角）实测被角标盖住 | `card-390-real-dark-p1.png`（第 4 张卡「闪闪星 🌱」）、`pet-ui.js:162`、`index.css:737` | B | 角标改为完全落在槽外（`right:-8px` 且槽加 `padding`），或角标移到左上角，或仅用 opacity/描边角标 |
| 5-9 | 抗锯齿：`crispEdges` + 非整数倍尺寸 = 硬切（不糊但粗细跳动）；96/192px 放大与 48px 原生完全干净 | `sizemap-sparkle-16-32-48-64-96.png`、`scalecmp.png`、`real-sizes-dpr1.png` | C（同 4-4） | 同 4-4 |

### 3.6 可访问性

| # | 结论 | 证据 | 严重度 | 建议 |
|---|---|---|---|---|
| 6-1 | 14/14 带 `<title>`（中文名），**无 `aria-*` / `role`**。`<title>` 只在「内联 `<svg>`」时成为可访问名；用 `<img src>` 引入时**完全无效**，必须靠 `alt` | `inline-all-14.png`（报告行「`<title>` 子元素数: 14」「svg 上 role 属性数: 0 · aria-hidden 数: 0」）、② 表 | C | 接入时按引入方式二选一（见 6-2/6-3） |
| 6-2 | **接入版本把 `alt` 写成了宠物名 → 读屏会把名字念两遍**。`petIconHtml()` 输出 `alt="<codex.name>"`，而列表卡/详情/芯片里名字文本就在旁边（`.pet-card-name`、芯片 `<span>名字</span>`），读屏会播成「黑暗鸦 黑暗鸦 SSR」。头像在这些位置是**装饰性**的，按 §7.1「图标（装饰性）→ `aria-hidden="true"`」应为 `alt=""` | `page/pet-ui.js` `petIconHtml`（`alt="' + (c.name \|\| speciesId) + '"`）、`page/index.css:731` 区块注释、`card-390-real-dark-p2.png`（图标 + 名字并排） | C（a11y 退化，不阻断） | 装饰性调用点改 `alt=""`；仅「头像单独出现」的位置（未来图鉴网格 / 分享卡 / 结算蛋）保留名字 `alt`。可给 `petIconHtml` 加第 4 个参数 `decorative` |
| 6-3 | 反向说明：若将来做**图鉴网格**（只有图标 + 稀有度，无名字）或分享卡，则头像变「信息性」，必须有替代文本 —— 届时 `<img alt="梦幻">` 最省事；内联 `<svg>` 场景则要显式 `role="img"` + `aria-label`（现状两者都没有） | ① 1.1 表（接入点清单） | D | 后续任务再定 |

### 3.7 落地风险（**只列需要改什么，本轮不改**）

> 接入代码**已经落地**（v2.2.29，见开头警示块）。下表左列是「已做对的部分」，右列是「仍需处理」——本轮不代改。

**已做对（评审确认，无需回退）**

| 项 | 事实 | 证据 |
|---|---|---|
| 单一渲染入口 | `petIconHtml/petIconUrl/petIconStageHtml` 集中在 `pet-ui.js`，路径相对 `page/`，缺图标返回 `''` 由调用方兜底回 emoji（不裂图、不炸卡片） | `page/pet-ui.js` 顶部注释 + 实现 |
| 显式尺寸 | `<img>` 同时带 `width/height` 属性与 `.pet-ico-wrap>.pet-ico{width/height:100%}` → 不会被 48px 固有尺寸撑破布局（实测渲染宽度 = 请求尺寸） | `card-390-real-dark-p1.png`（行高正常）、`inline-all-14.png` 报告行 |
| 尺寸纪律入口 | 所有调用点都走 `petIconHtml(id, size)`，改尺寸只需改 4 处常量（40/40/24/24/32） | `pet-ui.js:162,189,445,491`、`challenge.js` |
| 版本纪律 | `APP_VERSION 2.2.28→2.2.29`；`README.md`、`doc/changelog-v2.2.md`、`index.html?v126` 全部同步；`.gitignore` 补 `.workbuddy-ai/` | `git diff --cached` |
| 自带校验脚本 | 新增 `scripts/test-pet-icons.js`（210 行，仓库级）；**本轮按任务约束未运行**，但建议主控把它纳入 CI 门 | `git status`（`A scripts/test-pet-icons.js`） |
| 无资源清单要改 | 无 service worker / manifest / precache | 全仓库 grep |

**仍需处理（按优先级）**

| # | 文件 | 需要改什么 | 风险 |
|---|---|---|---|
| 7-1 | `page/pet-ui.js`（**最高优先级**） | 把列表卡/详情的 **40px 改成 32px 或 48px**（`petIconStageHtml(id, 40, stage)` → 32/48；详情 `petIconHtml(id, 40)` 同改）。40px ⇒ 每格 2.5px，实测同行 2px/3px 混排（4-4）；32px 实测全为 2px、且是 ASCII 网格的整数倍 | 中：改 4 个常量即可；若不同步改 `.pet-ico-wrap` 内联宽高会错位（该宽高由 `petIconStageHtml` 里 `size` 统一注入，改一处即同步） |
| 7-2 | `page/pet-ui.js` | 装饰性位置 `alt=""`（见 6-2）；或给 `petIconHtml` 增加 `decorative` 参数 | 低 |
| 7-3 | `page/index.css` | 若采纳「深浅主题都要可读」：给 `.pet-ico-wrap`/`.pet-detail-ico` 加一层令牌化底垫（`background:var(--surface-2);border-radius:8px`，新增 `--pet-ico-plate`）。**不加则 9/14 只在一个主题下近乎不可见**（1-6/1-7） | 高：默认深色主题下 `darkcrow` 1.46:1、`possum`/`dream`/`nonebear` 1.17:1 |
| 7-4 | `page/index.css` | `.pet-ico-badge` 遮挡图形（5-8）；槽位**不要**加 `border-radius:50%`（5-4，会切星角/独角） | 中 |
| 7-5 | `page/pet-ui.js` / `page/game-render.js` | 队伍/战斗单位卡（`.gb-unit`、`.gb-order-chip`）**仍未接头像**。若要接，改 `renderGroupOverlay()`，用 `unit._petSpecies`（`pet-codex.js:73` 已挂）判定宠物，非宠物不显示 | 中：容易只改 `pet-ui.js` 而漏这里 |
| 7-6 | 交付目录卫生 | `page/media/pets/preview.html`（13.6KB）、`overview.png`（1472×432）、`overview-48px.png`（464×144）是开发产物，会随 `page/` 部署并被抓取 | 低：移出运行时目录或加 `noindex` |
| 7-7 | 文档口径 | `doc/design-pet-icons.md §4.2` 的「48px 实际尺寸下可辨识」应改为「**接入尺寸 32–40px 可辨**」；§1.4 与 §3 的边距矛盾（1-2）需择一 | 低 |
| 7-8 | 布局稳定 | 14 个 `<img>` = 14 次请求（53.5KB），`loading="lazy"` 在 overlay 里首次打开可能闪空；已有显式宽高 → 无 CLS | 低：可给列表首屏的 `petIconHtml` 去掉 lazy 或加 `fetchpriority` |

---

## ④ 14 只逐个一句话（含离群标记）

> 判定基于多尺度实测：24 / 32 / **40（接入后的主槽）** / 48 / 512px + 深/浅双主题。

- **sparkle 闪闪星（R）** — 四角星形体清晰、24px 也能认出是「星」，但描边占比偏高（38.1%）、**浅色主题压到 1.58:1**，且接入后 **🌱/🥚 阶段角标会盖住右下星角**。〔离群：被角标遮挡〕
- **waterdrop 水水滴（R）** — 全 14 只里最成功的一只：单一主色 + 干净剪影，24px 仍可辨，两个主题都稳（6.93 / 2.56）。〔标杆〕
- **pongpong 彭彭猪（R）** — 粉块 + 猪鼻读得出「猪」，但**与 flamechick/thunderdog 剪影 IoU 0.77+**，24px 下与其他圆胖兽互不可分。〔离群：剪影＞0.75〕
- **flamechick 火焰鸡（SR）** — **描边占比最低（16.1%）→ 24px 下退化成橙色色块、无轮廓**；三簇火焰仍平顶、读作王冠（§5.2 判已修）。〔离群：描边最轻 / 特征未达标〕
- **rocksteady 坚强岩（SR）** — 覆盖 56.3%、左右最对称（2.8%），作为「方块岩」成立，但**与 nonebear IoU 0.827（全体最高）**，24px 下两者无法互辨。〔离群：与 nonebear 撞形〕
- **chirpbird 清脆鸟（SR）** — 左右非对称度最高（47.4%，侧视 + 尾部 + 音符）；**音符 48px 起读作黄色方块**，「张口歌唱」不可辨（§5.2 P0 判定已修，实际未收敛）。〔离群：非对称最高 / 主特征失败〕
- **thunderdog 雷霆犬（SR）** — 结构最重（74 rect / 4.9KB），24px 下是「黄块 + 竖耳」，闪电标记完全看不到（§5.2 记录过「脸颊闪电靠 dump 才查出来」）。〔离群：最复杂〕
- **possum 小负鼠（SSR）** — **描边占比最高 47.9%**，主色就是描边色（深色占 48%），深色主题下 1.17:1 宛如黑线稿；24px 下是「白灰细条」，育儿袋/尖吻皆不可辨。〔离群：描边最重 / 深色主题最差之一〕
- **darkcrow 黑暗鸦（SSR）** — **最严重**：主色 `#2A3550`(51%) + `#0B0D12`，深色卡面 1.46:1，48px 以下几乎消失；rect 最少（38）也让它形体最简。〔离群：可见性〕
- **icecrystal 小冰晶（SSR）** — 覆盖最低（29.3%）、形体最疏；浅色主题 1.48:1 近乎隐形；碎冰是分离小点，24px 下像噪点。〔离群：覆盖率最低 / 浅色主题最差之一〕
- **lightspirit 光之精灵（SSR）** — 主体 `#FFFFFF` 在浅色主题 1.00:1（完全消失）；3 缕飘尾在 32px 以下仍易读作「小脚」；光环镂空 36px 符合设计。描边占比仅 20%。〔离群：浅色主题不可见 / 描边过轻〕
- **dream 梦幻（UR）** — 512px 精确几何下是「黑框方头 + 黄十字 + 紫块」，猫耳/长尾/圆光球三要素都弱；描边占比 41%、非对称 28%；**存在 1 个非预期封闭透明洞（9px）**。〔离群：UR 里分量最轻 / 特征还原不足〕
- **nonebear 无念熊（UR）** — 覆盖率最高（59.4%）、最对称（3.9%），「闭眼方头熊」在 32px 立得住；但它**是 rocksteady 的撞形对象**（IoU 0.827），且 24px 下像「棕色箱子」。〔离群：覆盖率最高 / 与 rocksteady 撞形〕
- **kirin 圣光麒麟（UR）** — 底边距 0（角/尾/腿都贴边）→ **圆角槽会切角**；浅色主题 1.02:1 身体消失；48px 下读作「白金四足兽」，麒麟特征（独角/鬃毛/鳞纹）需要看 96px。〔离群：贴边 + 浅色主题不可见〕

---

## ⑤ 落地清单（接入要改哪些文件 / 风险）

> 接入已由另一条线完成（v2.2.29）。以下是**基于实际接入代码**的清单：✅ = 已做对，⏳ = 仍需处理。

1. ⏳ **尺寸（最高优先级、改动最小、收益最大）**：把列表卡/详情的 `40px` 改成 **32px**（或 48px）。40px ⇒ 每格 2.5px，实测同一行 2px/3px 混排；32px ⇒ 每格 2px，实测均匀（`real-sizes-dpr1.png`）。改动点：`pet-ui.js` 的 `petIconStageHtml(p.speciesId, 40, p.stage)`（162 行）与 `petIconHtml(pet.speciesId, 40)`（491 行）；`petIconStageHtml` 会把 `size` 同步注入 `.pet-ico-wrap` 的内联宽高，所以只改这一个数即可。芯片的 24px（1.5px/格）若也要干净，只能升到 32px（会明显加宽芯片，需权衡）。
2. ✅ **显式尺寸**：`petIconHtml()` 已带 `width/height` 属性 + `.pet-ico-wrap>.pet-ico{width/height:100%}` → 不会出现「48px 固有尺寸撑破 `.pet-card-head`」的问题（实测行高正常）。
3. ⏳ **主题对比（第二优先级）**：深色主题 4 只 / 浅色主题 5 只主色对比 <1.6:1（`darkcrow` 深色 1.46:1 最严重）。推荐在槽位加一层令牌化底垫（`.pet-ico-wrap`/`.pet-detail-ico` → `background:var(--surface-2)`，不违反「SVG 内部透明」）；退路是重画这 9 只的明度。
4. ⏳ **角标与圆角**：`.pet-ico-badge` 现在压住 40px 头像右下角（`sparkle` 星角被盖，`card-390-real-dark-p1.png`）；头像槽不要用 `border-radius:50%`（`card-390-dark-part3-圆角与尺寸-2x.png` 实测切星角/独角）。
5. ⏳ **可访问性**：装饰性位置改 `alt=""`（现为宠物名，与旁边名字文本重复播报）。
6. ⏳ **队伍/战斗单位卡仍未接头像**：若要接，改 `page/game-render.js` 的 `renderGroupOverlay()`（`.gb-unit`/`.gb-order-chip`），用 `unit._petSpecies`（`pet-codex.js:73`）判定宠物 —— 别只在 `pet-ui.js` 找。
7. ✅ **`page/index.html`**：无需为头像改（用 `<img src>` 即可；本次 `index.html` 的改动只是 `?v126` 缓存串）。**不建议**改成内联 14 段 `<svg>`（+53.5KB DOM 且丢缓存）。
8. ✅ **版本纪律**：`APP_VERSION 2.2.28→2.2.29` + `README.md` + `doc/changelog-v2.2.md` + 架构演化表已随本次改动同步；`scripts/test-pet-icons.js` 已入库（本轮按约束未运行）。
9. ⏳ **验收口径修正**：`doc/design-pet-icons.md §4.2` 的「48px 实际尺寸下可辨识」应改为「**接入尺寸 32–40px / 芯片 24px** 可辨」；`§1.4` 与 `§3` 的边距矛盾需择一（本条 1-2）。另建议把 `colorArea/描边占比` 这类量（② 表口径）纳入 `scripts/test-pet-icons.js`，让「描边占比 28–36%、覆盖率 R<SR<SSR<UR」可回归。
10. ⏳ **卫生**：`page/media/pets/` 下的 `preview.html` / `overview.png` / `overview-48px.png`（开发产物）建议移出运行时目录或加 `noindex`。
11. ✅ **无 service worker / manifest / precache**，接入不需要登记资源；`<img>` 14 请求 / 53.5KB 可接受（已显式宽高 → 无 CLS）。

---

## ⑥ 没有问题的部分（明说）

- **硬规格 100% 达标**：14/14 的 `48×48 / viewBox 0 0 48 48 / shape-rendering=crispEdges`、纯 `<rect>`（+`<title>`）、**所有坐标与尺寸均为 3 的倍数**、无越界、无 `<path>/<circle>/<ellipse>/<polygon>/<text>/<image>`、无渐变/滤镜/`opacity`/`fill-opacity`/`stroke`、色数 3–7（≤8）、UTF-8 无 BOM、无 XML 声明、单文件 2.8–4.9KB（<6KB）。**§4.2 验收清单里除「48px 可辨识」（口径问题）外的每一条，我都独立复算通过。**
- **画布纯净，且无「糊」**：14 只背景完全透明，512px 精确渲染无半透明像素、无意外白边/灰边；浏览器在整数倍尺寸下渲染 5–6 色、无中间色（`real-sizes-dpr1.png` 实测）→ `crispEdges` 真的做到了硬边，不存在抗锯齿糊化；`lightspirit` 光环镂空是设计要求的「中心透明」。
- **零 id 污染**：全 14 只无 `id`/`clipPath`/`defs`/`url(#)` 引用；浏览器把 14 只内联进同一 DOM 实测重复 id = 0、引用 = 0 → **无论 `<img>` 还是内联都不会互相污染**。
- **`xmlns` 完整**（14/14），`<img>` 引用不会白屏。
- **接入代码的基本功做对了**（评审确认，无需回退）：单一渲染入口 `petIconHtml()`；显式 `width/height` 属性 + `.pet-ico-wrap{width/height:100%}` 双保险（不会被 48px 固有尺寸撑破布局）；缺图标返回 `''` 并兜底回 emoji（不会裂图/炸卡片）；`APP_VERSION` 2.2.28→2.2.29 与 README/changelog/`?v126` 同步（版本纪律执行到位）；并新增仓库级校验脚本 `scripts/test-pet-icons.js`。
- **「芯片里出现白色底垫」经数值复核为否**：对 `card-390-real-dark.png` 芯片区做颜色直方图，接近纯白像素占比 **0.00%**（前两位是卡面 `#111827` 与页底 `#0b1120`，其余中间色来自中文文字抗锯齿）→ 我此前在压缩截图上的「白框」印象是误读，**不作为问题上报**。
- **去重矩阵基本成立**：三只发光体（星/棱晶/圆团+环）、三只鸟（颜色+体态+音符）、四足兽（猪鼻/立耳/尖吻/独角）在 **48px 及以上**都能区分；IoU 最高的一对（rocksteady–nonebear 0.827）并排看仍可分，问题只在 ≤40px。
- **色彩不抢品牌语义**：14 只共 30 个 hex，未复用 `--brand-fill #F97316` / `--purple #C084FC` / `--green` 等语义令牌，不会与 UI 状态色混淆。
- **体积与请求量可接受**：合计 53.5KB / 14 请求，无打包步骤下也无需引入 sprite 或雪碧图。
- **无 service worker / manifest / precache 资源清单需要登记**，接入不涉及缓存清单改动。

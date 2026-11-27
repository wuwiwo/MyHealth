# MyHealth 设计规范 v2.1 — 移动端优先 / WCAG 2.1 AA

> **这是唯一权威。** 新增样式前先读本文件；与代码冲突时以本文件为准并回改代码。
> 令牌源码：`page/index.css` 顶部 `DESIGN TOKENS v2.1` 段（`:root` = 深色，`[data-theme="light"]` = 浅色）。
> 回归护栏：`scripts/test-a11y-tokens.js`（40 项断言，`node scripts/test-a11y-tokens.js`）。

---

## 0. 三条硬规则

1. **不写裸值。** 颜色、字号、间距、圆角、阴影、层级、时长一律用令牌。唯一例外：`4rem`/`5rem` 装饰大数字与 `.85em` 相对值。
2. **不写 `white` / `#fff` 当前景。** 实心底用 `--on-brand`；固定深底容器用 `--on-dark-*`。
3. **canvas 里不写 `var(--x)`。** canvas 2D **不解析** CSS 变量，`ctx.fillStyle='var(--bg2)'` 会静默失效并沿用上一个填充色。必须 `getComputedStyle(document.documentElement).getPropertyValue('--surface')`。

---

## 1. 设计原则

| 原则 | 含义 |
|---|---|
| **移动端优先** | 所有交互按拇指可达 + 44px 触控设计；桌面是 500px 居中卡片的副产物，不单独设计 |
| **令牌单一来源** | 视觉调整改 `:root` 一处，不逐组件改 |
| **可访问不是附加项** | 对比度、焦点可见、语义标签、读屏播报与视觉同等优先级 |
| **静默失败是 bug** | 任何 `catch` 必须有日志、用户反馈或「忽略」说明 |
| **无构建步骤** | 全靠原生 CSS 自定义属性实现主题化（RGB 通道令牌是关键技巧） |

---

## 2. 颜色

### 2.1 表面分层

| 令牌 | 深色 | 浅色 | 用途 |
|---|---|---|---|
| `--bg` | `#0b1120` | `#fafaf9` | 页面底 |
| `--surface` | `#111827` | `#ffffff` | 卡片 / 弹窗 / 输入框 |
| `--surface-2` | `#1e293b` | `#f5f5f4` | 次级块、chip 底 |
| `--surface-3` | `#334155` | `#e7e5e4` | 分隔、骨架 |
| `--bd` / `--bd-l` | `#1e293b` / `#334155` | `#e7e5e4` / `#d6d3d1` | 边框 / 强调边框 |

> `--bg2` / `--bg3` 保留为 `--surface` / `--surface-2` 的别名，旧代码零改动即可跟随新分层。

### 2.2 文字

| 令牌 | 深色 | 浅色 | 最低对比度 |
|---|---|---|---|
| `--text` | `#f1f5f9` | `#1c1917` | 16.19 / 17.49 |
| `--text2` | `#cbd5e1` | `#44403c` | 11.95 / 10.27 |
| `--text3` | `#94a3b8` | `#6f6862` | 5.71 / 5.02（次级表面上） |

**`--text3` 是弱化文字的下限**，不得再自行调暗。它用于 12px 元信息，不适用「大字 3:1」豁免。

### 2.3 品牌与语义

| 令牌 | 深色 | 浅色 |
|---|---|---|
| `--orange` | `#FB923C` | `#C2410C` |
| `--brand-fill` / `--brand-fill-d` | `#F97316` / `#EA580C` | — |
| `--on-brand` | `#1c1917` | `#1c1917` |
| `--green` | `#4ADE80` | `#15803D` |
| `--blue` | `#60A5FA` | `#1D4ED8` |
| `--purple` | `#C084FC` | `#7E22CE` |
| `--red` | `#F87171` | `#B91C1C` |
| `--yellow` | `#FACC15` | `#A16207` |

### 2.4 ★ 实心按钮配色（最容易踩的坑）

```
background: var(--brand-fill)      /* 亮橙 #F97316，保留视觉冲击 */
color:      var(--on-brand)        /* 近黑 #1c1917 → 6.24:1 */
```

**历史教训**：白字配 `#F97316` 只有 **2.80:1**，连 3:1 大字豁免都不到，而 `.sb-btn` 是 15.2px 粗体（需 4.5:1）。
曾评估过「压暗填充 + 白字」（5.18:1），但那样填充与深色背景只剩 3.64:1，CTA 会发闷——**故采用亮填充 + 近黑字**。

### 2.5 RGB 通道令牌（主题化的关键机制）

```css
--brand-rgb:251,146,60;       /* 不是颜色，是通道值 */
--chip-a:.14;                 /* chip 底透明度，按主题调 */

/* 用法 */
background: rgba(var(--brand-rgb), var(--chip-a));
border: 1px solid rgba(var(--info-rgb), .15);
```

这是**不用构建工具也能主题化 60+ 处半透明色**的原因：透明度要随主题变（`--chip-a`），而通道值让同一个 `rgba()` 表达式在明暗下自动换色。

### 2.6 固定深底容器

分享卡等**永远深色、不随主题切换**的容器，用 `--on-dark-*` 而非 `--text*`：

```
--on-dark-text / --on-dark-text2 / --on-dark-text3 / --on-dark-brand
```

否则浅色主题下深底容器上的 `--text3` 只有 2.07:1。

---

## 3. 排版

### 3.1 字阶（10 阶）

| 令牌 | 值 | px | 用途 |
|---|---|---|---|
| `--fs-3xs` | `.625rem` | 10 | **仅**密集元信息（历史债，见 §3.2） |
| `--fs-2xs` | `.6875rem` | 11 | **仅**密集元信息 |
| `--fs-xs` | `.75rem` | 12 | 标签、说明、单位 |
| `--fs-sm` | `.8125rem` | 13 | Tab、次要正文 |
| `--fs-base` | `.875rem` | 14 | 正文、输入、按钮 |
| `--fs-md` | `.9375rem` | 15 | 小标题、强调按钮 |
| `--fs-lg` | `1.0625rem` | 17 | 卡片数值 |
| `--fs-xl` | `1.25rem` | 20 | 区块标题 |
| `--fs-2xl` | `1.5rem` | 24 | 大标题 |
| `--fs-3xl` | `2rem` | 32 | 计时器、Hero 数 |
| `--fs-hero` | `2.5rem` | 40 | 空态图标、Hero |

行高：`--lh-tight:1.2` / `--lh-base:1.5` / `--lh-loose:1.7`。
字体：`--font:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif`。

### 3.2 ★ 微字号使用约束

`--fs-3xs`(10px) / `--fs-2xs`(11px) 低于 12px 舒适线，**是历史债不是标准**：

- ✅ 允许：网格内的辅助元信息（单位、时间戳、序号、badge）
- ❌ 禁止：任何需要阅读的句子、表单标签、按钮文案、错误提示

**P1 待办**：真机验证密集网格（战斗卡片、宠物列表）不会撑破布局后，把这两档抬到 12px 并合并进 `--fs-xs`。

### 3.3 令牌化映射原则

v2.1 把 312 处内联字面量映射到字阶，规则是**就近档位、单处视觉变化 ≤2px**——避免把密集战斗网格撑破。这是保守策略：先做到「单一来源」，再择机统一数值。

---

## 4. 间距与布局

4px 基准：`--sp-1:4` `--sp-2:8` `--sp-3:12` `--sp-4:16` `--sp-5:20` `--sp-6:24` `--sp-8:32` `--sp-10:40` `--sp-12:48`
语义别名：`--gap-sm`(=8) `--gap`(=12) `--gap-lg`(=16)

| 布局令牌 | 值 | 说明 |
|---|---|---|
| `--mw` | `500px` | 内容最大宽，桌面居中 |
| `--tabbar-h` | `48px` | 底部 Tab 栏高（吸顶元素的 `top` 基准） |
| `--pad-screen` | `16px` | 屏幕左右安全边距 |
| `--touch-min` | `44px` | **最小触控目标** |

圆角：`--rad-sm:8` `--rad-md:10` `--rad-lg:14` `--rad-xl:20` `--rad-full:999`（别名 `--r` / `--rs` / `--rp`）
阴影：`--sh-1`（浮起）`--sh-2`（弹出）`--sh-3`（底部 sheet）`--sh-brand`（品牌发光）

---

## 5. 层级与动效

```
--z-decor:1    --z-content:5   --z-sticky:10
--z-battle:50  --z-fab:55      --z-modal:80
--z-share:100  --z-toast:999
```

新增浮层必须从表里取值，不得手写 `z-index:9999`。子 Tab 吸顶用 `top:var(--tabbar-h); z-index:calc(var(--z-sticky) - 1)`。

时长 `--dur-1:120ms` `--dur-2:200ms` `--dur-3:300ms` `--dur-4:600ms`
缓动 `--ease-std` `--ease-out:cubic-bezier(.22,.61,.36,1)` `--ease-spring:cubic-bezier(.34,1.56,.64,1)`

**必须尊重系统减弱动效偏好**：全局已有 `@media (prefers-reduced-motion: reduce)` 兜底，新增动画不要绕过它。

---

## 6. 移动端

### 6.1 触控

- 最小 **44×44**（`--touch-min`）。已覆盖 `.ex-suggest button`、`.car-type`、`.speed-btn`、`.md-save`、`.empty-cta` 等。
- **唯一例外**：`#dsCatRow .car-type` / `#dsEqRow .car-type` 密集筛选条显式降为 **36px**（横向滚动条，44px 会让一屏可见项过少）。这是设计决策，不是遗漏。
- 图标按钮必须给 `aria-label`（没有可见文字时）。

### 6.2 安全区

```css
--sat:env(safe-area-inset-top,0px);     --sab:env(safe-area-inset-bottom,0px);
--sal:env(safe-area-inset-left,0px);    --sar:env(safe-area-inset-right,0px);
```

- 前提：`<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">`
- 底部：`.modal-sheet` 用 `padding-bottom:calc(var(--sp-6) + var(--sab))`，`#app` 同理
- **已移除 `maximum-scale=1.0, user-scalable=no`**（违反 WCAG 1.4.4）

---

## 7. 无障碍

### 7.1 结构语义

| 场景 | 要求 |
|---|---|
| 导航 Tab 栏 | `role="tablist"` + 每项 `role="tab"` `aria-selected` `aria-controls` |
| 模态 / 浮层 | `role="dialog"` `aria-modal="true"` `aria-labelledby` |
| 状态提示（同步点等） | `role="status"` `aria-live="polite"` |
| Toast | `role="status"` `aria-live`，最多堆叠 3 条 |
| 图标按钮 | `aria-label` |
| 图标（装饰性） | `aria-hidden="true"` |

### 7.2 表单关联

- 有对应控件的：`<label class="fl" for="id">`
- **自定义控件组**（`.car-types` 按钮组、`.stepper` 步进器）没有可关联的原生控件 →
  标签降级为 `<span class="fl" id="lbl-xxx">` + 容器加 `role="group" aria-labelledby="lbl-xxx"`
- **id 必须带文件前缀**（`lbl-s-g1` / `lbl-st-g1` / `lbl-c-g1`）：多个弹窗可能同时挂载，重名会让 `aria-labelledby` 指错元素

### 7.3 焦点

- 全局 `:focus-visible{outline:2px solid var(--orange);outline-offset:2px}`
- 模态必须：ESC 关闭 + Tab 焦点陷阱 + 打开时锁 body 滚动 + 关闭后焦点归还触发元素
- 焦点归还与滚动锁都做了**引用计数**与 `MutationObserver` 兜底，外部直接 `modal.remove()` 也能解锁

### 7.4 空态

统一用 `emptyHtml(emoji, title, sub, cta)`（`page/utils.js`），配 `.empty-cta` 按钮（44px）。

**什么时候不该显空态**：辅助性快捷区（如「高频备注」）无数据时应**整块隐藏**——它不该占位，也不该制造噪音。整块内容区才需要空态。

---

## 8. 主题

三态：`system`（默认）/ `dark` / `light`

- `getTheme()` 返回用户选择，`effTheme()` 返回**实际生效**主题（system 时解析 `matchMedia`）
- 默认值由 `dark` 改为 `system`，并用 `matchMedia` 监听系统切换
- 旧存档里的 `'dark'` / `'light'` 字符串保持兼容

```js
document.documentElement.setAttribute('data-theme', effTheme())
```

---

## 9. 组件清单

| 组件 | 类 | 要点 |
|---|---|---|
| 卡片 | `.ec` `.sc` `.card` | `--surface` + `--sh-1` |
| 按钮 | `.m-btn-save` `.m-btn-cancel` `.sb-btn` | 实心用 `--brand-fill` + `--on-brand` |
| Chip | `.car-type` | `min-height:var(--touch-min)`，密集场景 36px |
| 空态 | `.empty` `.empty-e/-t/-s` `.empty-cta` | 用 `emptyHtml()` 生成 |
| 弹层 | `.modal-overlay` `.modal-sheet` | 满屏小游戏加 `.wide` |
| Toast | `.toast` | 独立计时、最多 3 条 |
| 图表 | `linechart.js` | 见 §10 |
| 加载 | `.spinner` `.skeleton` `.loading-mask` | 新增长任务占位 |

> **`.modal-sheet.wide`**：普通弹层受 `--mw:500px` 约束；隐藏挑战小游戏这类全屏交互才加 `.wide`。
> 历史上写过裸 `.modal-sheet{max-width:100%}`——因为写在小游戏章节下却同优先级后置，**泄漏到全部弹窗**，切勿重蹈。

---

## 10. 图表（canvas 专项）

`page/linechart.js` v3：

- `lcVar()` / `lcTheme()` 从 `getComputedStyle` 解析 `--bd` `--text3` `--text` `--surface` `--brand-fill`
- **不再写 `canvas.style.width/height`**（与 CSS `width:100%` 冲突），改读 `getBoundingClientRect()`
- DPR 取 `devicePixelRatio`
- `_lcCharts` 注册表 + `resize`/`orientationchange` 防抖重绘
- tooltip 节点用 `canvas._lcTip` 复用，监听用 `canvas._lcBound` 只绑一次（**曾每次重绘都重新绑定 → 监听器泄漏**）

---

## 11. 反模式（禁止清单）

| ❌ | ✅ |
|---|---|
| `color:white` / `#fff` | `var(--on-brand)` / `var(--on-dark-text)` |
| `ctx.fillStyle='var(--bg2)'` | `getComputedStyle(...).getPropertyValue('--surface')` |
| `font-size:.65rem` | `var(--fs-3xs)` |
| `padding:18px` | `var(--sp-5)`（或最近的 `--sp-*`） |
| `z-index:9999` | `var(--z-toast)` |
| `catch(e){}` | `catch(e){console.warn(...)}` 或 `/* 忽略：原因 */` |
| 裸 `.modal-sheet{max-width:100%}` | `.modal-sheet.wide` |
| `<label class="fl">` 悬空 | 加 `for` 或转 `role="group" aria-labelledby` |
| `rgba(251,146,60,.14)` | `rgba(var(--brand-rgb), var(--chip-a))` |
| 自引用 `--x:var(--x)` | 直接给值（**曾出 `--blue:var(--blue)`，深色主题整个失效**） |

---

## 12. 验收

```bash
node scripts/test-a11y-tokens.js     # 40 项：循环引用/令牌完整性/对比度/触控/字号/aria/视口/静默异常
```

其余 25 个业务测试保持全绿。新增视觉改动后**两个都要跑**。

### 人工验收清单（真机）

- [ ] iOS Safari 刘海屏：底部 Tab / 弹窗不被 Home 指示条遮挡
- [ ] 深色 ↔ 浅色 ↔ 跟随系统来回切，图表与 canvas 同步换色
- [ ] 屏幕阅读器（VoiceOver / TalkBack）能读出 Tab 选中态与弹窗标题
- [ ] 键盘 Tab 能在弹窗内循环、ESC 能关、关闭后焦点回到触发按钮
- [ ] 系统开启「减弱动态效果」后动画被抑制
- [ ] 密集战斗网格在 10px/11px 微字号下不溢出（决定 §3.2 的 P1 能否推进）

---

## 13. 未处理（P1）

1. 微字号抬到 12px（见 §3.2）
2. 11 处原生 `confirm()` → 自定义模态（无法主题化 / 国际化，读屏体验差）
3. 路由 / deep-link（刷新丢失当前 Tab）
4. 长列表虚拟化
5. 滑动手势（如卡片左滑删除）
6. 骨架屏全面替代 loading 文案

---

## 14. v2.16 极简扁平风（Minimalist Flat）——落地规则 + 令牌对照表（旧 → 新）

> 作者下发的硬性规范。**本节优先于上文所有视觉条款**：§2.1 里 `--bd` / `--bd-l` 的旧值
> （`#1e293b` / `#334155` / `#e7e5e4` / `#d6d3d1`）已被本节新版覆盖，其余冲突以本节为准。
> 源码位置：`page/index.css` 顶部 `:root`（令牌）+ 文件末尾「阶段 1 / 验收修复」两层（组件落地）。

### 14.1 硬规则（验收基准，逐条可机检）

| 类别 | 禁止 | 必须 |
|---|---|---|
| 阴影 | 任何 `box-shadow`（`--sh-*` 全部 `none`） | 分层靠 2px 实线边框 |
| 渐变 | 任何 `gradient` / 图案背景 | 纯色填充 |
| 半透明 | `opacity < 0.5`（禁用态也不例外） | 用「中性描边 + `--text3` 文字」表达禁用 |
| 模糊 | `backdrop-filter` / `filter: blur()` | — |
| 圆角 | **任何中间圆角**（4/8/10/12/16px 一律禁止） | `0`；仅头像 / FAB / 徽章这类**本就是圆形**的容器允许 `50%` |
| 边框 | 结构用 1px（`--bw-thin` 只留给分隔线） | 结构一律 `--bw: 2px` 实线 |
| 配色 | 灰字、多色相装饰 | 黑白 + **一个强调色**（`--brand-fill`），语义色仅用于文字/边框 |
| 动效 | hover 用 `translate` / `scale`；过渡 `> 300ms` 的柔和过渡 | 过渡 `0~75ms`（`--dur-1:0ms` / `--dur-2..4:75ms`）、`prefers-reduced-motion` 下 `1ms` |
| hover | 变淡/发光 | **高对比反色**（前景/背景互换，或反色到 `--brand-fill`） |
| focus | 阴影环 | **2px 描边**（`outline: var(--bw) solid var(--orange)`） |
| 触控 | `< 44px` | `≥ --touch-min (44px)` |
| 对比 | `< 4.5:1`（大字 `< 3:1`） | 正文 ≥ 4.5:1，大字 ≥ 3:1 |
| 留白 | 密排 | 区块纵向 `--sec-y`（移动 32px / 桌面 56px）、卡片内 `--card-pad`（20 / 32px） |

### 14.2 令牌对照表（旧 → 新）

| 令牌 | 旧值（v2.1 原规范） | 新值（v2.16 扁平） | 说明 |
|---|---|---|---|
| `--rad-sm` | `8px` | `0` | 全部圆角归零 |
| `--rad-md` | `10px` | `0` | |
| `--rad-lg` | `14px` | `0` | |
| `--rad-xl` | `20px` | `0` | |
| `--rad-full` | `999px` | `0` | 胶囊 → 直角 |
| `--r` / `--rs` / `--rp` | 指向上面四档 | 同左（仍是指针） | 旧名保留，值自动跟随 |
| `--rad-circle` | 不存在 | `50%` | **唯一允许的圆角**（头像 / FAB / 徽章 / 加载环） |
| `--sh-1` | `0 1px 2px rgba(0,0,0,.14)` | `none` | 全站无阴影 |
| `--sh-2` | `0 4px 14px rgba(0,0,0,.2)` | `none` | |
| `--sh-3` | `0 -4px 20px rgba(0,0,0,.30)` | `none` | |
| `--sh-brand` | `0 2px 8px var(--orange-g)` | `none` | |
| `--shadow` / `--shadow-lg` | `var(--sh-1)` / `var(--sh-2)` | `none` | |
| `--bd` | `#1e293b` / `#e7e5e4` | `#475569` / `#a8a29e` | 无阴影分层后提亮一档，2px 实线才看得见 |
| `--bd-l` | `#334155` / `#d6d3d1` | `#64748b` / `#78716c` | 同上（强调边框） |
| `--bw` | 不存在 | `2px` | 结构边框唯一宽度 |
| `--bw-thin` | 不存在 | `1px` | **只用于分隔线**（`border-top/bottom:1px`），不用于结构 |
| `--dur-1` | `120ms` | `0ms` | 状态切换不缓动 |
| `--dur-2` | `200ms` | `75ms` | |
| `--dur-3` | `300ms` | `75ms` | |
| `--dur-4` | `600ms` | `75ms` | **消灭 >300ms 柔和过渡** |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)`（回弹） | `ease-out` | 回弹 = 位移感，hover 禁用位移 |
| `--orange-g` | `rgba(var(--brand-rgb),.35)`（光晕） | `var(--orange)`（实色） | 半透明光晕不允许 |
| `--green-g` / `--blue-g` | `rgba(...,.30)` | `var(--green)` / `var(--blue)` | 同上 |
| 间距 `--sp-*` | 4px 基准 10 档（不变） | 同左 | 新增 `--sec-y`（32/56px）、`--card-pad`（20/32px）两个**用途型**令牌，不改原有档位 |
| 字号 `--fs-*` | 10 阶（不变） | 同左 | 本轮**未改字号**（见 14.4） |

### 14.3 组件层落地（阶段 1 + 验收修复）

1. **内联样式守卫**（`page/index.css` 顶部令牌段之后）—— `page/*.js` 里写死的旧视觉用属性选择器统一收回：
   `[style*="border-radius"]→0`（`border-radius:50%` 例外保留）、`[style*="box-shadow"]→none`、
   `[style*="text-shadow"]→none`、`[style*="gradient"]→none`、`[style*="border:1px"*]→2px`。
2. **hover / focus / 结构层**（文件末尾「交互与留白层」）：反色 hover、2px 描边 focus、卡片补结构线。
3. **验收修复层（flat-verify）**：V1 激活页签文字对比 1.00:1 → `--on-brand`；V2 动作库 8 色白字标签
   （1.98~4.23:1）→ 中性；V3/V5 半透明叠色底（4.29 / 4.14:1）→ 实心底；V4 触控 38/39/40px → 44px；
   V6 禁用态 `opacity:.4/.5` → 中性描边；V7 训练（力量）记录条目详情折叠。

### 14.4 本轮明确**没有**改的

- **字号**：`--fs-*` 十阶与全部组件字号一行未动（原 10px 微字号仍在，属 §13 P1 未处理项）。
- **业务数值 / 逻辑**：`page/*.js` 除 `tab-strength.js` 的展示层（折叠结构）外零改动。
- **主题色**：品牌强调色沿用 `#FB923C / #F97316`（深）与 `#C2410C`（浅），未换色。

### 14.5 复验口径

```bash
node scripts/test-a11y-tokens.js                 # 40/40 ALL PASS
node scripts/test-group-ui-presentation.js       # 群战表现层不受影响
# 全量 75 个 scripts/test-*.js：0 失败
# 真浏览器（Chrome CDP）390×844 + 360×640：13 个视图各一次计算样式审计
#   → box-shadow / 中间圆角 / gradient / transition>75ms / opacity<0.5 / blur / 1px 结构边框 /
#     对比度<4.5 / 触控<44 / 横向溢出 = 全部 0
```

---

## 15. v2.17 科技蓝主题（Tech Blue）+ 宠物视图验收

> 作者反馈「当前主题色不好看且刺眼」。本节**只换品牌强调色**，并把大面积饱和填充降级为
> 「浅底 + 2px 蓝边 + 蓝字」。**§14.4 里「主题色沿用 #FB923C / #F97316 / #C2410C」一句已被本节取代**，
> 其余 §14 条款（无阴影 / 无渐变 / 圆角归零 / 2px 结构边 / 0~75ms 过渡）全部继续有效。

### 15.1 令牌映射方式（为什么保留 `--orange*` 这个名字）

采用「**新增语义名 `--brand*`，旧名 `--orange*` 用 `var()` 转接**」：

```css
:root{                     /* 深色（默认主题） */
  --brand:#60A5FA; --brand-l:#93C5FD; --brand-d:#1D4ED8;
  --orange:var(--brand); --orange-l:var(--brand-l); --orange-d:var(--brand-d);
  --orange-g:var(--brand);
  --brand-rgb:96,165,250;
  --brand-fill:#2563EB; --brand-fill-d:#1D4ED8; --on-brand:#ffffff;
}
[data-theme="light"]{
  --brand:#1D4ED8; --brand-l:#2563EB; --brand-d:#1E3A8A;
  --orange:var(--brand); …（同上转接）
  --brand-rgb:29,78,216;
  --brand-fill:#2563EB; --brand-fill-d:#1D4ED8; --on-brand:#ffffff;
}
```

理由（三选一里选它的原因）：

1. `--orange*` 在全站被引用 ~110 处，其中 **`page/*.js` 的内联 `style`** 里也有；本轮白名单禁止改 JS，
   只有「同名换值（值改成 `var(--brand)`）」这一条路能一次覆盖全部引用，零遗漏。
2. 旧名保留是**零风险**问题，不是命名偏好：新代码一律用 `--brand*`，旧名只作别名。
3. 反方案（只改 `--orange` 的值、不建 `--brand*`）会让「科技蓝」永远叫 `orange` —— 下一个人不敢动它。
4. `--brand-fill` / `--brand-rgb` / `--on-brand` 本来就是中性名，直接换值即可。

### 15.2 最终色值 + 对比度实测

| 用途 | 浅色主题 | 深色主题 | 实测对比度 |
|---|---|---|---|
| 主色（文字 / 边框 / focus 环），`--brand`（= `--orange`） | `#1D4ED8` | `#60A5FA` | 浅 白底 **6.70:1**、`--bg #fafaf9` 6.42:1；深 `--surface #111827` **6.98:1**、`--bg` 7.41:1、`--surface-2` 5.72:1 |
| 实心填充底，`--brand-fill`（**只配白字**） | `#2563EB` | `#2563EB` | `--on-brand #ffffff` 上 **5.17:1**（两套主题同值） |
| 实心填充 hover，`--brand-fill-d` | `#1D4ED8` | `#1D4ED8` | 白字 6.70:1 |
| 激活态 hover 底，`--brand-d`（= `--orange-d`） | `#1E3A8A` | `#1D4ED8` | 白字 10.32:1 / 6.70:1 |
| 浅色变体，`--brand-l`（= `--orange-l`，当前无引用） | `#2563EB` | `#93C5FD` | — |
| 固定深底容器，`--on-dark-brand` | `#60A5FA` | `#60A5FA` | — |

> 口径：`node scripts/test-a11y-tokens.js` 的三段式 WCAG 2.1 计算 + Chrome CDP `getComputedStyle` 实测双跑，
> 两边数字一致。深色主题最弱项 = 实心按钮白字 **5.17:1**；浅色主题最弱项 = 成功色/表面 5.02:1。

### 15.3 实心填充收敛（降刺眼）

**规则**：`--brand-fill` 实心底**只留给主 CTA 与激活态**，其余大面积动作一律「浅底 + 2px 蓝边 + 蓝字」。

| 位置 | 改前 | 改后 |
|---|---|---|
| `.sb-btn`（**全站用得最多的大面积按钮**：设置 / 同步 / 导出 / 训练完成，宽 100% + 16px 内边距） | 满块 `--brand-fill` + 白字 | `transparent` + 2px `--brand` 边 + `--brand` 字（hover/active 仍高对比反色） |
| `#syncPush`（`page/sync.js:362` 内联 `background:var(--orange);color:white`） | 满块橙底白字（旧橙 2.26:1，本就不达标） | `transparent` + 2px `--brand` 边 + `--brand` 字（CSS 属性选择器收回，未改 JS） |
| `.empty-cta`（空态主按钮） | `--brand-fill` 当文字色（3.43:1） | 文字与 2px 边框都改 `--brand` |
| `.pet-cell-mult`（宠物详情 ×N%） | `--brand-fill` 当文字色（3.43:1） | `--brand`（6.98 / 6.70:1） |
| `.pet-final-cell.active`（③ 最终属性选中格） | 1…2px `--brand-fill` 边框（2.42:1） | 2px `--brand` 边框（5.72:1） |
| 旧橙色叠底 `rgba(249,115,22,…)`（`game-render.js:336` Boss 词缀卡 / `sync.js:338` 同步建议卡） | 橙色相叠底 | `rgba(var(--brand-rgb),.10)`（只换色相，透明度取中间值） |

**保留实心（有意为之）**：`.m-btn-save` / `.md-save`（弹层确认）、`.be-btn-next`（战斗结算主按钮）、
`.header-logo`（38px 品牌标记）、`.hm-cell[data-l="5"]`（热力图最高档的一端）、
以及全部 `.active` / `.selected` / `.on` 激活态（`.tab-btn.active` / `.gb-tab.active` / `.speed-btn.active` /
`.wt-btn.selected` / `.car-type.selected` / `.gb-log-filter.on`）。进度条填充（`.ec-fill` / `.gl-bar-fill` /
`.snap-fill` / `.ch-timer-bar`）属数据可视化的细条，保持品牌色。

### 15.4 明确**没有**动的（作者红线）

- **状态色**：受伤 / 阵亡红（`--red`）、治疗绿（`--green`）、警告黄（`--yellow`）—— 两套主题逐字节未改。
- **稀有度色**：宠物稀有度仍走 `--purple`（`.pet-card-rarity` / `.codex-badge-rarity`），
  浅色 `#7E22CE` / 深色 `#C084FC` 未动。本次蓝与稀有度**不冲突**（稀有度是紫，不是蓝）；
  但 `--brand` 与语义 `--blue`（info）在浅色下同值 `#1D4ED8`、深色下同值 `#60A5FA` —— 这是**刻意**的：
  二者同属蓝，语义上不需要区分，且 info 蓝本来就取自同一色阶。若日后要拉开，改 `--brand` 一侧，别动稀有度。
- **多色相语义标签**：动作库 8 色标签已在 v2.16 统一为中性 chip，本轮未回退。
- 字号 / 间距 / 圆角 / 阴影 / 过渡：一行未动。

### 15.5 宠物视图验收（v2.16 阶段 2 半成品补完）

**`3325ff7` 半成品的接线检查（全部通过）**

| 检查项 | 实测 | 结论 |
|---|---|---|
| `#petCalcDet`（② 计算口径）/ `#petLvChainDet`（逐属性等级链路）是否在 `.pet-sec` 内闭合平衡 | `<details>` 开合配平、无嵌套 details、两条 summary 都在 | ✅ 已正确接线 |
| `<summary>` 44px 热区 | `322×44`（`min-height:var(--touch-min)`） | ✅ |
| 键盘可达 | `summary` 原生可聚焦（`document.activeElement===summary`）、Enter/Space 由 UA 原生切换、`:focus-visible` 2px `--brand` 描边、未写 `tabindex="-1"` | ✅ |
| 是否误折叠主数值 | `<details>` 内 `.pet-grid / .pet-final-cell / .pet-cell-val` = **0 个**；①②③ 三排数值格、Lv/经验条、「等级提供的属性」数值格全部常显 | ✅ 未误折叠 |
| 折叠是否真生效 | `.pet-det` 外框高度 **45px**（44px summary + 1px `--bw-thin` 分隔线）；详情总高 1644px / 1.95 屏 | ✅ |

**重出的违规表（修前 → 修后）**

| # | 元素 | 违规项 | 实测值（修前） | 修法 | 修后 |
|---|---|---|---|---|---|
| 1 | `b.pet-cell-mult`「×1437% / ×1413% / ×100%」 | 文字对比度 | **3.43:1** @12px/700 —— 换蓝后 `--brand-fill #2563EB` 被当作**文字色**压在 `--surface #111827` 上 | 文字改用**文字/边框档** `--brand`，`--brand-fill` 只留作实心底 | 6.98:1（深）/ 6.70:1（浅） |
| 2 | `.empty-cta`（空态主按钮，宠物空态走这条） | 文字 + 边框对比度 | 3.43:1 @14px/700（同因） | 文字与 2px 边框都改 `--brand` | 深 6.98 / 浅 6.70 |
| 3 | `.pet-final-cell.active`（③ 最终属性选中格） | 非文字边框对比度（WCAG 1.4.11 ≥3:1） | #2563EB on #1e293b = **2.42:1** | 边框改 `--brand` | 5.72:1 |
| 4 | 详情「✨ 炼化 Lv12」（`page/pet-ui.js:850` 内联） | 文字对比度（大字贴边） | 3.43:1 @20px/700 —— 走大字 3:1 豁免但余量只有 0.43 | 内联色改 `var(--brand)` | 6.98:1 |
| 5 | `.hm-cell[data-l="4"]`（热力图，非宠物视图，被 `--on-brand` 翻转波及） | 文字对比度 | 深色 **3.60:1** —— 深色 `--on-brand` 由近黑 `#1c1917` 翻成白 | 底色 alpha `.80→.55` + 文字改 `--text` | 深 5.38 / 浅 6.70 |

**修后复测**：390×844 与 360×640 × 深/浅共 4 组，每组 3 个视图（宠物列表 86 元素 / 详情 279 元素 /
⚖️ 对比 315 元素）→ `box-shadow / 中间圆角 / background-image / transition-duration / opacity /
backdrop-filter / 四边 border-width / 文字对比度 / 触控尺寸 / 横向溢出` **全部 0**，`console error` **0 条**。

### 15.6 复验口径

```bash
node scripts/test-a11y-tokens.js                 # 40/40 ALL PASS（本轮未改断言）
# 全量 75 个 scripts/test-*.js：0 失败
# 真浏览器（agent-browser + CDP Runtime.evaluate，静态服务根=page/，不用 file://）
#   390×844 / 360×640 × 深色 / 浅色 共 4 组；宠物列表 + 详情 + ⚖️ 对比 各一次计算样式审计
#   → 阴影 / 中间圆角 / 渐变 / 过渡>75ms / opacity<0.5 / 模糊 / 1px 结构边 / 对比度<4.5 / 触控<44 / 横向溢出 = 全部 0
```

## 16. 结构与色彩纪律（v2.14.33 定稿，评审 P2-4 / P2-6）

> §2.3 的颜色表（橙色系）已被 **§15 科技蓝** 取代；以本节 + §15 为准。
> 本节不新增令牌，只把「什么情况用哪一档」写死，避免同一个项目里出现三套边框、四种强调色。

### 16.1 边框：只有两档，按分工挑，不按好看挑

| 角色 | 规格 | 用在 |
|---|---|---|
| **容器** | `var(--bw)` = 2px solid `var(--bd)` | 卡片、区块、空态、折叠块、日志块、宝珠袋、休息块 |
| **分隔** | `var(--bw-thin)` = 1px solid `var(--surface-3)`，**只用单边**（`border-top` / `border-bottom`） | 内嵌行之间、区块之间 |
| **强调边** | `var(--bw)` = 2px（左侧状态色） | 日志块的品牌色左缘 |

**禁止**：四周环绕的 1px 边框。扁平风没有阴影可分层，「细边框容器」在同屏会被读成表格线，与 2px 卡片并列时读成两种组件。守卫：`test-ui-consistency.js [17]`（四周 1px 容器必须 = 0，实测 0）。

### 16.2 颜色：三种语义 + 两种数据色

| 色 | 语义 | 允许出现在 |
|---|---|---|
| 蓝 `--brand*` | 主操作 / 进度 / 选中 | 主按钮实心、进度条、激活页签下划线、链接式文字 |
| 红 `--red` | 危险 / 破坏 / 敌方 / BOSS | 删除按钮、敌方血条与名字、BOSS 标签、失败结果 |
| 绿 `--green` | 达成 / 可用 / 友方 / 治疗 | 完成态、友方、治疗飘字、离线补算 |
| 紫 `--purple` | **只表示数据属性** | 稀有度、品质、地形、天赋标签 |
| 黄 `--yellow` | **只表示瞬时提示** | 暴击、警告、阶段标记 |

**禁止**：按钮与空态使用紫色（守卫：`test-ui-consistency.js [17]`）；用「说不清属于哪一类」的色做区块装饰 —— 应退成 `--text2` / `--text3` 或交给 emoji。

### 16.3 强调色计数为什么仍偏高（口径说明，不是缺陷）

`audit-whole-ui.js` 数的是「非灰阶色值个数」。深/浅主题各有「文本蓝 + 实心蓝」「文本绿 + 实心绿」这类成对值（为同时满足对比度与实心按钮），天然计成 2 个，所以一屏 7–12 是**口径产物**。真要压低只能删掉语义色（例如把「达成绿」并入中性灰），会直接伤可用性 → 定为**不做**。判断色彩是否自律看 16.2 的归属规则，不看这个数字。

### 16.4 空态的两档密度

| 档 | 类 | 高度（360 宽实测） | 用在 |
|---|---|---|---|
| 标准 | `.empty` | ≈188px（图标块级居中 + 标题 + 副标题 + CTA） | 独占一屏空态（记录页等） |
| 紧凑 | `.empty.empty-compact` | ≈125px（图标与标题同行、CTA 撑满宽度） | **同屏并列多个空态**（设置·计划的力量 + 有氧） |

工厂：`emptyHtml(emoji, title, sub, cta, cls)` —— 第 5 参传 `'empty-compact'` 即紧凑档，不新增函数、不改调用方结构。

## 17. 弹层焦点与会话无障碍（v2.14.34）

### 17.1 弹层焦点生命周期
任何 `<div class="modal">` / `.modal-sheet` 打开时，焦点必须落在层内；关闭时必须回到打开它的那个元素。

| 时机 | 行为 | 实现 |
|------|------|------|
| 打开 | 记录来源焦点 `_modalPrevFocus`，焦点送进层内第一个可聚焦元素 | `modalFocusSync()` + `MutationObserver` |
| 层内 Tab | 首尾环回（末 → 首，首 → 末） | `modalTrapKeydown()` 捕获阶段 |
| 焦点逃到背后 | 下一次 `focusin` 拉回层内 | `modalTrapKeydown` 前置守卫 |
| 关闭 | 焦点还给来源元素 | `modalFocusSync()` |
| 已在层内 | 不抢焦点（避免每次重渲都重置） | `modalFocusSync()` 早退 |

**约定**：只接管 `document` 捕获阶段，**不改任何调用点**；新增弹层只要用 `.modal` / `.modal-sheet` 两个类名之一就自动获得行为。非 Tab 键（含 Esc）一律放行。

### 17.2 可聚焦与可点必须一致
- 可点必须可聚焦（`clickOnly = 0`）：`div`/`span` 加 `onclick` 时必须同步 `tabindex`、`role`、`Enter/Space` 处理，否则请改用 `<button>`。
- 隐藏必须不可聚焦（`hiddenFocusable = 0`）：`display:none` 之外，`visibility:hidden` / `aria-hidden="true"` 的元素不得留在 Tab 链里。
- 焦点环不得缺失（`ringMissing = 0`）：`:focus-visible` 必须可见，禁止全局 `outline:none` 无替代。
- DOM 序应与视觉序一致（倒置阈值 80px）：网格/双栏布局若视觉上「左先右后」而 DOM 相反，键盘用户会跳序。

### 17.3 量测口径
`scripts/audit-tab-order.js`（CDP 9345）对 11 个主视图逐项量测六项指标并落 `_tmp-whole-audit/tab-order.json`；`scripts/audit-whole-ui.js` 对 **2 主题 × 2 视口 × 14 视图** 量对比度、溢出、触摸目标与圆角，浅色/深色分别出表。

## 18. 删除与撤销（v2.14.35）

### 18.1 双保险原则
破坏性操作的防线是**两道**，缺一不可：删前 `confirm`（预防）+ 删后 30 秒撤销（挽回）。不允许出现「反正能撤销就不确认」的写法。

| 操作 | 预防 | 挽回 | 落库时机 |
|------|------|------|----------|
| 删动作 | `confirm` | 撤销条 30s | 立即（撤销条只恢复 UI 与数据，不依赖条存活） |
| 删力量计划 | `confirm` | 撤销条 30s | 立即 |
| 删有氧计划 | `confirm` | 撤销条 30s | 立即 |
| 导入存档 | `confirm`（写明「按键合并」） | 无（有覆盖语义提示） | 立即 |

### 18.2 撤销条规格
- **正文**只说「删了什么」（`已删除动作「名字」`），**时限**放独立标签 `30s`：正文里写时限在 360px 下会被 ellipsis 吃掉（真机实测）。
- 倒计时标签 `aria-hidden="true"`：读屏只念一次正文，不每秒播报。
- 按钮：「撤销」≥ 44×44、文字色用 `--blue`（主操作）；`✕` 只用 `min-width/min-height` 撑尺寸、`border:none`（四周 1px 违反 §16.1）。
- 容器：贴主导航上方（`bottom:calc(var(--tabbar-h) + var(--sat) + var(--sp-2))`），`max-width:var(--mw)`，层级 **998**（低于 toast 999）。
- **一次一条**：新删除顶掉旧条；旧的已落库，不再可撤销。

### 18.3 恢复语义
`insertAt(list,item,index)` 是唯一恢复入口：按**原下标**插回（列表顺序对用户有意义，不是追加），下标越界（负数 / 超长）退化为追加，且**不改入参**（返回新数组），调用方负责 `save*` 与重渲。

## 19. 大块数据的加载策略（v2.14.36）

### 19.1 判定顺序：先量传输，再谈拆分
| 量什么 | 工具 | 结论依据 |
|---|---|---|
| 线上真实传输（压缩后） | CDP `Network.loadingFinished.encodedDataLength` | 715KB / 3 资源（app.js 662KB，源码 2631KB，压缩比 ≈ 4:1） |
| 源码体积分布 | 加载顺序逐文件累计 | `data/exercises-dataset.js` 1161KB = **43.8%**，其余单文件 ≤ 208KB |
| 缓存能否复用 | 入口 URL 是否带版本戳 | 带戳 → 每次发版整包换 URL，**同版本内不重复下载**，跨版本必重下 |

**推论**：把整包按体积切三段，既不省同版本流量，又让冷启动变成 3 个不可复用请求 → **不做**。要做的是把「首屏不需要的大块」挪出去。

### 19.2 「首屏不需要」的判定与懒加载契约
- 判定：只被**用户主动打开的界面**（动作百科 overlay、配图、关联建议）使用的数据，不进首屏包。
- 契约（`EXD.load(cb)`）：
  1. **幂等**：数据已在 → 同步 `cb(true)`；加载中 → 只排队，不重复注入 `<script>`。
  2. **可重绑**：`bind()` 重设数据源并清空派生缓存（`_byId` / `_catList` / `_eqList`）。
  3. **失败可见**：`cb(false)` + 调用方 toast / 既有「未加载」空态，不静默。
  4. **戳跟版本**：`?v<版本去点>` —— 数据很少变，可长期命中缓存。
- 触发点三处：空闲预取（不挡首屏，最终一定加载）、功能入口先拉、依赖它的初始化逻辑先拉后回填。

### 19.3 验收口径
- 首屏资源清单里**不得**出现被挪出的数据脚本（真机用 `performance.getEntriesByType('resource')` 核对时序）。
- 产物等价：`verify-bundle` 的 14 视图 innerText 逐字一致（挪出数据不得改变渲染结果）。
- 数据到位后必须**主动刷新**依赖它的卡片，否则用户看到「没图」的空壳。

## 20. 战斗演出层的浮层纪律（v2.14.37）

### 20.1 浮层不得压住读数
战斗页的可读信息只有四类：角色名、HP 文本、攻/防/魂数值、战报。**飘字（伤害/状态/阵亡）一律锚到角色上方，不得落在读数区**。

| 浮层 | 类名 | 锚点 | 字号 |
|---|---|---|---|
| 伤害飘字 | `.bc-impact` | 角色上方（`left:50%; bottom:100%`） | `--fs-xl`（原 `--fs-2xl`，覆盖面积过大） |
| 状态/阵亡短提示 | `.bc-mark` | 同上 | `--fs-lg` |

判定口径（可自动化）：飘字矩形与 `bc-hp-text` 矩形**不得相交**（`verify-battle-visual.js` 每次发版真机量）。

### 20.2 同类数据同一种格式
同一屏里表达同一语义的数字必须同口径。血量统一 `HP: cur/max`（分母缺失才允许退化为 `cur`）；不允许一侧写 `cur`、另一侧写 `cur/max`（v2.14.37 实测踩到：玩家 `HP: 56` / 敌方 `HP: 118/120`，用户无法判断 56 是当前值还是上限）。

### 20.3 结算层
结算区（`.battle-end`）固定在战报之下、不覆盖战斗区；结果文案（`.be-result`）字号 ≥ `--fs-xl`；必须有唯一「继续」按钮，且关闭按钮 `✕` 始终可用（≥ 44×44）。

## 21. 视口矩阵与短高横屏纪律（v2.14.38）

### 21.1 认证视口（发版必跑）
| 视口 | 尺寸 | 用途 | 脚本 |
|---|---|---|---|
| 手机竖（小） | 360×640 | 最小可用宽度 | `audit-whole-ui.js`（双主题） |
| 手机竖（主流） | 390×844 | 主用姿势 | `audit-whole-ui.js`（双主题） |
| 平板竖 | 768×1024 | 平板/折叠屏展开 | `audit-viewports.js` |
| 平板横 | 1024×768 | 平板横置 | `audit-viewports.js` |
| 手机横 | 844×390 | 短高极端（横放手机） | `audit-viewports.js` |

判定四项：横向溢出 = 0、可见可交互元素 ≥ 44×44、正文 ≥ 11px、**第一个内容块顶边 ≤ 视口高 − 40**（首屏必须看到内容，不能只剩导航）。

### 21.2 短高横屏（`max-height:520px` + `landscape`）
- 只压「非交互装饰」：logo 38 → 28、标题降一档、段间距 `--sec-y` 56 → 32。
- **页签 `--tabbar-h` 48 → 44，仍守在触摸下限**，不得为了省高度降到 40。
- 副标题**只藏英文品牌词、保留版本号**（与 ≤430 同口径；`test-ui-consistency` 有断言守着）。
- 不许为横屏另造信息架构（双栏/嵌套）：横屏目标是「打开就能看到今天练了没有」。

### 21.3 媒体查询必须放在文件末尾
`--tabbar-h`（105 行）与 `--sec-y`（1531 行）都被后置 `:root` 定值；把覆盖块插在文件中部会被后置规则压掉（v2.14.38 实测：`firstContentTop` 停在 206px 不动）。**任何改自定义属性的媒体查询一律追加到文件末尾。**

### 21.4 平板（`min-width:700px`）
只收段间距（56 → 40），不动字号、卡片宽、圆角：平板是「更宽的同一套 UI」，改尺寸类 token 会回冲 360/390 的既有基线。

## 22. 工具类与内联样式的边界（v2.14.39）

### 22.1 什么时候允许 `style=""`
- **一次性、动态**（值随数据变）：如进度条宽度、按数值变色的文字，允许内联，但**颜色走 `var(--*)` 令牌**，不许写死色值。
- **结构性定位**（骨架位置、`display:none` 切换）：允许内联。
- **重复 ≥4 次的样式组合**：**必须**抽成工具类（当前 152 处已清零，`test-inline-style-discipline` 守着）。

### 22.2 `.tx-*` 工具类清单（文本/触摸）
| 分组 | 类 | 等价写法 |
|---|---|---|
| 弱提示 | `.tx-hint` | `color:var(--text3);font-size:var(--fs-3xs)` |
| 弱提示（柔和） | `.tx-hint-soft` | 上者 + `font-weight:400` |
| 纯色 | `.tx-dim` / `.tx-ok` / `.tx-warn` / `.tx-err` / `.tx-muted-only` | text3 / green / orange / red / text2 |
| 正文+色 | `.tx-note` / `.tx-sub` / `.tx-sub-mb` | text3 + fs-xs / fs-2xs / fs-2xs + mb6 |
| 纯字阶 | `.tx-3xs` / `.tx-xs` / `.tx-base` / `.tx-h` / `.tx-b` / `.tx-sec` | fs-3xs / fs-xs / fs-base / fs-lg+700 / fs-base+700 / fs-lg+700+margin 18/0/10 |
| 触摸基样式 | `.tx-tap` / `.tx-btn` / `.tx-btn-sm` | 44×44+12 / fs-sm+44+12 / fs-sm+44+8/10 |

### 22.3 命名纪律
- 工具类统一 `tx-` 前缀；组件类继续用领域前缀（`ec-`、`gb-`、`det-`、`pet-`、`orb-`…）。两者不得互相借名。
- 新增工具类必须同时：① 写进本节表格；② 写进 `test-inline-style-discipline.js` 的 `MAP`；③ 保证断言 3 的上限不上调。

### 22.4 断言口径的迁移规则
抽类会让「JS 内联里的令牌引用数」下降——这是**搬家**不是**回退**。原断言若盯的是「某文件里出现多少次令牌」，必须改成「页面合计出现多少次」；断言盯的应该是「有没有人还在写硬编码」，不是「某个文件里写了多少次」。

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

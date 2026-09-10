# MyHealth v2.1 更新日志

**Date:** 2026-09-10

v2.1 是**设计体系版本**：不新增玩法，把散落在 31 档字号、60+ 处硬编码 rgba、8 处白字橙底里的视觉与交互债一次性收敛为可复用的设计令牌，并把移动端触控、键盘/读屏可达性、明暗双主题对比度修到 WCAG 2.1 AA。

完整规范见 `doc/design-tokens-v2.1.md`。

---

## v2.1.0

**Date:** 2026-09-10

### 新增功能

- 🎨 **设计令牌体系**（`page/index.css` 顶层 `:root`）
  - 表面分层 `--surface / --surface-2 / --surface-3`（`--bg2/--bg3` 保留为别名，旧代码零改动）
  - **10 阶字阶** `--fs-3xs(.625rem) / --fs-2xs(.6875rem) / --fs-xs(.75rem) / --fs-sm / --fs-base / --fs-md / --fs-lg / --fs-xl / --fs-2xl / --fs-3xl / --fs-hero`
  - 间距 `--sp-1..--sp-12`、圆角、阴影、**z-index 层级** `--z-decor/--z-sticky/--z-overlay/--z-modal/--z-toast`
  - 动效 `--dur-1..--dur-4` + `--ease-std/--ease-out/--ease-spring`，并接入 `prefers-reduced-motion`
  - 安全区 `--sat/--sab/--sal/--sar`（`viewport-fit=cover` + `env(safe-area-inset-*)`）
- 🧩 **RGB 通道令牌** `--brand-rgb / --danger-rgb ...`：无构建步骤也能主题化 60+ 处硬编码 `rgba(...)`，统一走 `rgba(var(--brand-rgb), var(--chip-a))`
- ♿ **a11y 语义层**：5 个导航栏改为 `role="tablist"` + `role="tab"` + `aria-selected/aria-controls`；9 个 `label for`；图标按钮补 `aria-label`；`#syncIndicator` 改 `role="status" aria-live="polite"`；战斗/分享浮层改 `role="dialog" aria-modal="true"`
- 🌗 **三态主题**（跟随系统 / 深色 / 浅色）：`getTheme()` 默认值由 `'dark'` 改为 `'system'`，新增 `effTheme()` 与 `matchMedia` 监听；旧存档的 `'dark'/'light'` 字符串保持兼容
- 🫙 **统一空态工厂** `emptyHtml(emoji, title, sub, cta)` + `.empty-cta` 组件（44px 触控），替代各页面裸 `innerHTML=''`
- 📈 **图表主题化**（`page/linechart.js` v2 → v3）：新增 `lcVar()`/`lcTheme()` 从 CSS 变量解析配色，`_lcCharts` 注册表 + `resize`/`orientationchange` 防抖重绘
- 🧪 **`scripts/test-a11y-tokens.js`**：令牌完整性、触控目标尺寸、对比度、aria 引用的回归护栏

### 修复

- 🔴 **白字橙底只有 2.80:1**：`.sb-btn` 等 8 个选择器的白字配 `#F97316` 连 3:1 大字豁免都不到（而 `.sb-btn` 是 15.2px 粗体，需 4.5:1）
  - 采用**方案 A**：保留亮橙填充，文字改近黑 `#1c1917`（**6.24:1**）。放弃方案 B（压暗填充 + 白字 5.18:1）——那样填充与深色背景只有 3.64:1，CTA 会发闷
- 🔴 **分享卡在浅色主题不可读**（2.07:1）：改用 `--on-dark-*` 令牌
- 🔴 **canvas 静默失效**：`ctx.fillStyle = 'var(--bg2)'` 在 canvas 2D 里不解析 CSS 变量，被忽略后沿用上一个填充色。改为 `getComputedStyle` 取 `--surface`
- 🔴 **图表监听器泄漏**：每次重绘都给 canvas 重新绑定 `mousemove`，且 tooltip 节点反复创建。改为 `canvas._lcBound` 只绑一次、`canvas._lcTip` 复用节点
- 🔴 **`.modal-sheet{max-width:100%}` 泄漏**：该规则写在「HIDDEN CHALLENGE MINIGAME」章节下，却因同优先级后置而作用于**全部弹窗**，使 `--mw:500px` 形同虚设。收敛为 `.modal-sheet.wide`，并给小游戏补 `wide`
- 🩹 **toast 互相截断**：单例 `_tt` 计时器 + `c.innerHTML=''` 会让连发的两条 toast 互相清掉。改为每条独立计时、最多堆叠 3 条、`role="status" aria-live`、`.out` 淡出
- 🩹 **模态框无 ESC / 无焦点陷阱 / 无滚动锁**：`openModal()` 补 `role="dialog" aria-modal`、ESC 关闭、Tab 焦点循环、`_lockScroll/_unlockScroll` 引用计数锁 body、关闭后焦点归还；再加 `MutationObserver` 兜底（外部 `modal.remove()` 也能解锁）
- 🩹 **视口禁止缩放**：移除 `maximum-scale=1.0, user-scalable=no`（WCAG 1.4.4），补 `viewport-fit=cover`
- 🩹 **3 处静默 `catch(e){}`** 补 `console.warn`：`app.js:164`、`sync.js:38`、`sync.js:380`
- 🔴 **`--blue` 自引用循环**（C7 回归自查发现）：C1 把 `--blue:#3B82F6` 误写成 `--blue:var(--blue)`，自定义属性在计算值阶段即失效。因 `:root` 就是深色主题（无 `[data-theme="dark"]` 块），深色下全部 `var(--blue)` 取不到值，波及 8 个 CSS 类与约 15 处 JS 用法（关卡卡片普通/Boss 色、防御数值、技能点等）
  - 修正为 `#60A5FA`（与 `--info-rgb` 一致，4.82 → **6.98:1**）
  - `scripts/test-a11y-tokens.js` 新增「自引用循环 / 未定义引用」检测，防复发
- 🩹 **对比度不达标的次要文字**（实测值）：
  | token | 深色（旧 → 新） | 浅色（旧 → 新） |
  |---|---|---|
  | `--text2` | 6.92 → **11.95** | 7.63 → **10.27** |
  | `--text3` on surface | 3.73 → **6.92** | 2.52 → **5.48** |
  | `--text3` on surface-2 | 3.07 → **5.71** | 2.31 → **5.02** |
  | `--blue` | 4.82 → **6.98** | — |
- 🩹 **8 处新增静默 catch 收口**（`store.js` 7 处 + `challenge.js` 1 处 + `sync.js` 1 处）：备份写入失败、迁移写失败却上报成功、启动加载异常、宠物蛋发放失败、自动备份导出失败 —— 这些都会让用户「以为成功了」。改为 `console.warn`；真正无害的 `removeItem` 清理则补「忽略」注释说明
  - 此前漏查是因为只 grep 了 `catch(e){}`，而 `store.js` 用的是 `catch (_e) {}` 变体

### UI 调整

- 📏 **字号 31 档 → 10 阶**：312 处内联 `font-size` 字面量按就近档位映射到令牌，**单处视觉变化 ≤2px**，避免撑破战斗网格；仅保留 `4rem`/`5rem` 装饰大数字与 `.85em` 相对值
  - 新增 `--fs-3xs`/`--fs-2xs` 两档微字号，仅用于密集元信息（这是历史债，见下）
- 📱 **触控目标 44×44**：10 个高频类补齐 `min-height:44px`；`#dsCatRow .car-type` 作为密集筛选条**显式降级为 36px**（设计决策，非遗漏）
- 📱 **底部安全区**：`#app` 的 `padding-bottom:120px` → `calc(var(--sp-6) + var(--sab))`，刘海屏不再被 Tab 栏遮挡
- 📱 **子 Tab 栏吸顶**：`.sub-tab-bar` 改 `position:sticky; top:var(--tabbar-h)`
- 🏷️ **29 处 `<label>` 建立关联**：16 处加 `for=`；13 处自定义控件组（`car-types`/`stepper`）改为 `span + role="group" aria-labelledby`，id 带文件前缀（`lbl-s-g1`…）避免跨弹窗重名
- 🫙 **个人最佳空区**补空态 + CTA；「高频备注」快捷区无数据时**保持整块隐藏**（辅助区不应占位或显示空态）
- ⌨️ **全局 `:focus-visible`**：`outline:2px solid var(--orange); outline-offset:2px`
- 🎞️ **新增 spinner / skeleton / loading-mask** 组件

### 已知债（P1，未处理）

- 微字号 `--fs-3xs`(10px) / `--fs-2xs`(11px) 仍低于 12px 舒适线，仅用于密集元信息。真机上验证不会撑破布局后，可再抬高到 12px
- 11 处原生 `confirm()` 未替换为自定义模态（无法主题化、无法国际化、读屏体验差）
- 未做路由/deep-link（刷新丢失当前 Tab）、长列表虚拟化、滑动手势

### 修改文件

- `page/index.css`（令牌层 + 组件层改造，455 → 530 行）
- `page/index.html`（viewport / a11y 语义 / cache-busting `?v53 → ?v60`）
- `page/utils.js`（`APP_VERSION` 2.0.9 → **2.1.0**；`toast()` / `openModal()` / 主题 / `emptyHtml()`）
- `page/linechart.js`（v2 → v3，主题化 + 重绘 + 修泄漏）
- `page/tab-profile.js`、`tab-settings.js`、`tab-strength.js`、`tab-cardio.js`（字号令牌化 / 空态 / label 关联）
- `page/game-render.js`、`game-views.js`、`pet-ui.js`、`skill-ui.js`、`game-refine.js`、`game-records.js`、`game-battle.js`、`ex-dataset.js`（字号令牌化）
- `page/challenge.js`（小游戏弹窗 `.wide` + 字号令牌化）
- `page/app.js`、`page/sync.js`（空 catch 补日志）
- 新增 `doc/design-tokens-v2.1.md`、`scripts/test-a11y-tokens.js`

### 架构演化

| 版本 | JS文件数 | 最大文件 | 备注 |
|------|----------|----------|------|
| v1.0 | 1 | 1155 行 index.js | 单文件巨石 |
| v1.1 | 10 | 308 行 tab-strength.js | Store模块 + 文件拆分 |
| v1.2 | 13 | 388 行 tab-game.js | PR/统计/有氧计划/记录 |
| v1.3 | 13 | 442 行 tab-game.js | 关卡预览/强度系统/子Tab |
| v1.4 | 14 | 460 行 tab-game.js | 属性日志增量/UI美化 |
| v1.5.0 | 15 | 434 行 tab-game.js | 新关卡/手动同步 |
| v1.5.1 | 15 | 434 行 tab-game.js | 全量同步/关卡配置独立 |
| v1.6 | 13 | 406 行 tab-game.js | 动作库驱动/页面重构/设置Tab |
| v1.6.1 | 13 | 406 行 tab-game.js | PR显示ratio有效值tag |
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
| v2.0.3 | 44 | 761 行 game-render.js | 🔴 修复发布事故：index.html 漏挂 24 个 v2.0 模块 |
| v2.0.4 | 44 | 761 行 game-render.js | 🔴 二号接线事故：补挑战页三视图 HTML 骨架 |
| v2.0.5 | 44 | 761 行 game-render.js | 移除挑战页旧部件——消除新旧 UI 叠放 |
| v2.0.6 | 44 | 761 行 game-render.js | 动作改名/合并四库联动迁移 + 关卡列表跨视图漏显修复 |
| v2.0.7 | 44 | 761 行 game-render.js | 补召结算不锁今日名额（applyChallengeSettle 分型记账） |
| v2.0.8 | 44 | 761 行 game-render.js | 补召误锁存档恢复入口（done 卡恢复按钮条件放宽） |
| v2.0.9 | 44 | 763 行 game-render.js | 敌群 6→9 大关（90 关）+ 宠物阶段归一化 + hook 路径修复 |
| v2.1.0 | 44 | 763 行 game-render.js | 🎨 设计令牌体系 + 移动端/无障碍/WCAG AA 全面改造 |

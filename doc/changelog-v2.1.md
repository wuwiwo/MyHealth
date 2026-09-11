# MyHealth v2.1 更新日志

**Date:** 2026-09-10

v2.1 是**设计体系版本**：不新增玩法，把散落在 31 档字号、60+ 处硬编码 rgba、8 处白字橙底里的视觉与交互债一次性收敛为可复用的设计令牌，并把移动端触控、键盘/读屏可达性、明暗双主题对比度修到 WCAG 2.1 AA。

完整规范见 `doc/design-tokens-v2.1.md`。

---

## v2.1.5

**Date:** 2026-09-11

### 新增功能

- ⚔️ **命中 / 闪避系统**（设计文档本就要求，此前只有文案没有判定）：战斗不再是无条件命中
  - `BASE_HIT_RATE = 0.95` 基础命中率；命中率 = 基础 + 自身命中修正(`_accMod`) − 目标闪避(`_eva`)，clamp 到 `[5%, 100%]`
  - 未命中在战斗日志显示「💨 XX 的攻击落空（YY 闪避）」
  - 修正来源：宠物技能「闪耀」敌方命中 −40%、「打湿」使目标更易被命中 +30%，均持续 2 回合
  - 影响范围：**仅群战引擎**（`battle-group.js`）。单敌 `battle.js`（主线 117 关）**未改动**，行为不变
- 🐾 **10 个宠物专属天赋全部接入实际战斗效果**（v2.1.3 遗留的空壳，对照 `design-v2.0.md` §2.6 实现）

| 天赋 | 宠物 | 效果 | 落地机制 |
|------|------|------|----------|
| 漆黑之眼 | 黑暗鸦 | 攻击必定命中 | `onBeforeHit` → `guaranteedHit` |
| 心眼 | 无念熊 | 命中率不会被降低 | `onBeforeHit` → `noAccPenalty` |
| 斗者本能 | 无念熊 | 普攻 25% 暴击 / 150% 伤害 | `onBeforeCrit` → 通用暴击 |
| 凛冬之核 | 小冰晶 | 自身在场时我方全体免疫冰冻 | `onAllyStatus` → 阵营光环守卫 |
| 圣光守护 | 光之精灵 | 血量>50% 时承担队友 20% 伤害 | `onAllyDamage` → `damageShare` |
| 镜像结界 | 梦幻 | 受我方辅助 +25% / 受敌方辅助 −25% | `onBeforeHeal` → `healBoost` |
| 灵感涌动 | 梦幻 | 每回合开始随机 1 名友方魂攻 +20%（本回合内） | `onTurnStart` / `onTurnEnd` 临时改 `base.soulAtk` |
| 不动如山 | 圣光麒麟 | 满血免疫普通~高级负面（grade ≤ 2）+ 受伤 −50% | `onBeforeStatus` / `onDamage` → `dmgTakenReduce` |
| 威压领域 | 圣光麒麟 | 血量>75% 时敌方全体治疗 −20% | `onFoeHeal` → `healReduce` |
| 幸运口袋 | 小负鼠 | 胜利结算 35% 几率追加一份材料 | `game-render.js` 的 `groupVictoryReward()` |

### 修复

- 🔒 **敌人会随机抽到宠物专属天赋**：`enemy.js` 的 `pickRandomTalents()` 用 `Object.keys(TALENTS)` 抽取，而宠物天赋注册在同一张表里 —— 敌人可能被装上「圣光守护」「幸运口袋」。现给 10 个宠物天赋加 `petOnly` 标记并在抽取时过滤
- 🔧 **「闪耀」「打湿」此前只有文案**：`p_shine` 只 push 一条日志、`p_drench` 的「提高对其命中率」从未实现，现改为真实写入命中修正

### 修改文件

- `page/battle-group.js`（命中/闪避判定 + 通用暴击 + `talentAura` 光环调度 + 圣光守护分担 + 治疗修正 + 命中修正倒计时）
- `page/pet-codex.js`（10 个天赋接入 hooks + `petOnly` 标记；闪耀/打湿改真实效果）
- `page/enemy.js`（`pickRandomTalents` 过滤 petOnly）
- `page/game-render.js`（幸运口袋接入结算掉落）
- `page/utils.js`（`APP_VERSION` 2.1.4 → 2.1.5）
- `page/index.html`（cache-busting `?v64` → `?v65`，47 处）
- 新增 `scripts/test-pet-talents.js`（45 条断言）
- `scripts/test-group-battle.js` / `test-group-levels.js` / `test-pet-codex.js` / `test-pet-store.js` / `test-player-skills.js` / `test-spotlight.js` / `test-terrain.js`（注入确定性随机，消除 5% 命中率带来的 flaky）
- `README.md` / `doc/changelog-v2.1.md` / `doc/HANDOFF.md`

### 测试

- **27 个测试套件全绿**（新增 `test-pet-talents.js`），含设计体系护栏 40/40
- 新增 45 条断言：命中率计算（基础/修正/闪避/下限）、10 个天赋的 hook 行为、petOnly 隔离（连抽 300 次不泄漏）、端到端普攻伤害分担
- ★ **测试稳定性改造**：引入 5% 基础命中率后，所有跑群战的测试改用**确定性随机**。注意 `Math` 的属性**不可枚举**，必须用 `Object.create(Math)` + 覆盖 `random`，`Object.assign({}, Math)` 会丢掉 `min`/`floor` 等全部方法
- ★ `test-player-skills` 与 `test-terrain` 需用 **mulberry32 伪随机**而非恒定 0.5：前者断言依赖概率分支（暴击 225%、气势如虹）会永不触发；后者恒定值会让场地战斗**不收敛**（实测 45s 超时）

### ⚠️ 影响与遗留

- **战斗数值影响**：基础命中率 95% 使群战双方期望伤害均降约 5%、回合数略增。当前所有单位 `_eva` / `_accMod` 默认 0；如需调平衡改 `battle-group.js` 的 `BASE_HIT_RATE` 一处即可
- 单敌引擎（`battle.js`，主线 21 章 117 关）**不含命中判定**，与群战行为不同；要不要统一是独立议题

---

## v2.1.4

**Date:** 2026-09-11

### 修复

- 🐾 **宠物天赋被跨宠物共享（设计错误，对照 `doc/design-v2.0.md` §2.6 回退）**：v2.1.3 引入的「按稀有度开池解锁天赋」允许宠物从同级池里挑天赋，结果**一只 SSR 宠物能同时装上凛冬之核 + 漆黑之眼 + 圣光守护**——这三个分别是小冰晶 / 黑暗鸦 / 光之精灵的**专属天赋**。设计文档明确天赋是宠物固有被动，不可跨宠物装配。现已整块回退：
  - `getPetTalents()` 恒取图鉴定义值；**存档上的 `talentIds` 一律忽略**（旧存档里被塞入的错误天赋自动失效，无需数据迁移）
  - 移除 `PET_TALENT_SLOTS` / `PET_TALENT_POOL` / `PET_RARITY_ORDER` / `petTalentPool` / `petTalentSlotMax` / `petBaseTalentCount` / `setPetTalents`（`pet-codex.js`）与 `PET_TALENT_UNLOCK_COST` / `petTalentUnlockCost` / `unlockPetTalent`（`pet-materials.js`）
  - 详情面板天赋区改为**只读展示**（「固有 N 个」），不再有「🔓 解锁新槽位」按钮与候选天赋
  - 同步移除 v2.1.3 新增的 4 个通用天赋（坚韧 / 轻捷 / 敏锐 / 活力）——它们只为池化机制而设，机制回退后成为死代码
  - 现在的天赋分布：R/SR 无天赋，SSR 单天赋（小负鼠=幸运口袋 / 黑暗鸦=漆黑之眼 / 小冰晶=凛冬之核 / 光之精灵=圣光守护），UR 双天赋
- 📱 **宠物 / 技能面板内容超出后无法滚动**：两处面板复用了战斗专用的 `.battle-overlay`（`position:fixed;inset:0` + flex 列布局，**无 `overflow-y`**）。v2.1.3 给宠物详情塞入炼化进度 / 技能升级 / 天赋区后内容远超一屏，**超出部分既看不到也滚不到**。现新增独立容器 `#panelOverlay`（`.panel-overlay`：`overflow-y:auto` + `-webkit-overflow-scrolling:touch` + `overscroll-behavior:contain`）供宠物与技能面板使用；战斗 overlay 保持原样，零影响
- 📐 **顶部横向溢出 38px**：`.app-header::before` 的装饰光晕（`right:-10%` + 280px 宽）撑大了文档 `scrollWidth`——390 视口下实测 **413**。配合 `body{overflow-x:hidden}` 会被裁切，在 iOS 上还可能引起页面横向拖动。给 `.app-header` 加 `overflow:hidden` 后 `scrollWidth` 回到 390
- 🎨 **浅色主题整体偏暗 + 实心按钮「橙底黑字」不好看**：
  - 浅色 `--text2` 由 `#44403c` 回调至 `#57534e`（v2.0.9 取值；对比度 7.62:1，仍远超 AA 的 4.5:1）
  - 浅色实心按钮改为**深橙底 + 白字**：`--brand-fill:#C2410C` / `--brand-fill-d:#9A3412` / `--on-brand:#ffffff`（**5.18:1** 达 AA），替代原先的亮橙 `#F97316` + 近黑 `#1c1917`
  - 深色主题令牌**未改动**
  - 注：`--text3`（浅色 `#6f6862`）是 AA 边界值（对 `--surface-2` 仅 5.02:1），**无法再调亮**，因此未动；如需恢复 v2.0.9 的轻盈观感须放宽对比度标准

### 修改文件

- `page/pet-codex.js`（移除槽位/池机制；`getPetTalents` 改为恒定固有值；删除 4 个通用天赋与 `window`/`globalThis` 暴露项）
- `page/pet-materials.js`（移除天赋解锁三件套及其暴露项）
- `page/pet-ui.js`（改用 `#panelOverlay` + `.panel-inner`；天赋区改为只读展示；删除天赋解锁事件）
- `page/skill-ui.js`（改用 `#panelOverlay` + `.panel-inner`）
- `page/index.html`（新增 `#panelOverlay` 容器；cache-busting `?v63` → `?v64`，47 处含 `index.css?v64`）
- `page/index.css`（新增 `.panel-overlay` / `.panel-inner` / `--z-panel`；`.app-header` 加 `overflow:hidden`；浅色 `--text2` 与品牌实心色覆盖）
- `page/utils.js`（`APP_VERSION` 2.1.3 → 2.1.4）
- `scripts/test-pet-codex.js`（第 7 节由「天赋槽与解锁」改写为「天赋固有专属 + 防回归 + 接口已移除」）
- `README.md` / `doc/changelog-v2.1.md`

### 测试

- 26 个测试套件全绿，含设计体系护栏 `test-a11y-tokens.js` **40/40**；断言合计 **580**
- 新增 **防回归断言**：给黑暗鸦的存档强行塞入 `['dark_eye','winter_core','holy_guard']`，断言 `getPetTalents()` 只返回 `["dark_eye"]`、且 `createPetUnit()` 得到的 `_talents` 也只有 1 个
- 新增 9 条「天赋归属」断言，逐只核对 SSR/UR 的天赋与设计文档一致
- 新增 5 条「接口已移除」断言（`unlockPetTalent` / `petTalentUnlockCost` / `petTalentPool` / `petTalentSlotMax` / `setPetTalents` 均为 `undefined`），防止有残留调用方
- 浏览器实测：390×844 视口下 `document.scrollWidth` 由 **413 → 390**（横向溢出消除）；`#panelOverlay` 注入 2000px 内容后 `overflowY=auto`、`scrollTop` 可达 1541（确认可滚动）

### ⚠️ 遗留（未处理，需单独排期）

- 原有 10 个专属天赋仍是「空壳」（只有 `name`/`desc`，无 hooks/statMods，战斗内不生效）。补效果会改变战斗数值，并需同步 `test-pet-codex.js` 的 UR 基准断言（`hp===360 / atk===60`）

---

## v2.1.2

**Date:** 2026-09-11

### 修复

- 📝 **敌群关卡文案与实际数据不一致（用户可见文案 bug）**：`page/group-levels.js` 里各大关 `desc` 声称「进阶试炼（最多 **4** 敌）」「高阶试炼（**4 敌**+魂攻防）」，但实际生成结果 **g3–g9 每关最多只有 3 敌**——Boss 关 = 1 Boss + 2 护卫、精英关 = 1 精英 + 2 杂兵、普通关至多 3。该文案由 `game-views.js` 直接渲染到关卡选择界面，属用户可见错误。现已全部改为「最多 3 敌」；g1–g2 的「最多 2 敌」经核对无误，保持不变
- 🧹 **同步修正同源过期注释**（v2.0.9 把敌群从 6 大关扩到 9 大关时漏改）：
  - 文件头「大关 3-6：敌人最多 4 只」→「大关 3-9：敌人最多 3 只」
  - `genStageEnemies` 内 `maxEnemies` 常量 `4` → `3`，注释同步（该常量仅用于普通关数量上限，实际生成上限本就是 3，**无行为变化**）
  - 「生成全部 6 大关 × 10 小关」→「9 大关」

### 修改文件

- `page/group-levels.js`（`desc` 三元表达式 + 3 处注释 + `maxEnemies` 常量）
- `page/utils.js`（`APP_VERSION` 2.1.1 → 2.1.2）
- `page/index.html`（cache-busting `?v61` → `?v62`，47 处）
- `scripts/test-group-levels.js`（新增 `desc` 敌数一致性断言；敌数上限断言由 `<= 4` 收紧为 `<= 3`）
- `README.md` / `doc/changelog-v2.1.md` / `doc/HANDOFF.md`

### 测试

- 26 个测试套件全绿，含设计体系护栏 `test-a11y-tokens.js` 40/40
- 新增 9 条断言：逐大关比对 `desc` 中声明的敌数与该大关实际最多敌数，防止文案与数据再次脱节

---

## v2.1.3

**Date:** 2026-09-11

### 新增功能

- 📊 **宠物属性面板补炼化进度**：详情面板新增炼化进度区，显示 `Lv X / 上限`（上限按稀有度 R50 / SR60 / SSR80 / UR100）、百分比进度条，以及**当前普通石 / 高级石的成功率**（普通石在 Lv≥50 显示「不可用」）。此前 `refineLevel` / `refineStats` 一直有数据，但面板从未渲染，玩家看不到养成进度
- 🔄 **普通炼化石 10:1 兑换高级炼化石**：`exchangeRefineStones(bag, times)`，材料栏新增「🔄 兑换 10→1」按钮。普通石只在炼化 Lv<50 可用、后期必然死积，兑换给它们一个 sink；余额不足时提示还差多少，不会扣成负数
- ⚡ **宠物技能可指定升级**：`upgradePetSkill(pet, bag, skillId)`，详情面板每个技能一个升级按钮。消耗 ✨ 灵能，递增（Lv0→1 与 Lv1→2 各 1，之后每级 +1），上限 Lv10。原有的 `useSpirit`（随机升级）保留，UI 改用确定性版本
- ✨ **宠物天赋槽解锁**：天赋「升级」= 解锁新槽位并从可解锁池挑一个装上，消耗 ✨ 灵能（与技能共用，需取舍），递增（第 1 个额外槽 5，之后 +5）
  - 槽位上限按稀有度：R2 / SR2 / SSR3 / UR4
  - 可解锁池 = 本稀有度及以下（R 只能学 R，UR 可学全部 14 个）
  - 新增 **4 个低阶通用天赋**（坚韧 / 轻捷 / 敏锐 / 活力），供原本 0 天赋的 R/SR 宠物解锁

### 修复

- 天赋加成改用**固定值**而非百分比：R 宠物基础 `def` 只有 5，8% 经四舍五入会变成 0，等于没效果

### 修改文件

- `page/pet-materials.js`（`exchangeRefineStones` / `petSkillUpgradeCost` / `upgradePetSkill` / `petTalentUnlockCost` / `unlockPetTalent`）
- `page/pet-codex.js`（`PET_TALENT_SLOTS` / `PET_TALENT_POOL` / `petTalentSlotMax` / `petTalentPool` / `petBaseTalentCount` / `getPetTalents` / `setPetTalents` + 4 个新天赋；`createPetUnit` 改读存档天赋）
- `page/pet-ui.js`（详情面板炼化进度/技能升级/天赋解锁；材料栏兑换按钮）
- `page/utils.js`（`APP_VERSION` 2.1.2 → 2.1.3）
- `page/index.html`（cache-busting `?v62` → `?v63`，47 处）
- `scripts/test-pet-materials.js` / `scripts/test-pet-codex.js`（新增 33 条断言）
- `README.md` / `doc/changelog-v2.1.md` / `doc/HANDOFF.md`

### 测试

- 26 个测试套件全绿，含设计体系护栏 `test-a11y-tokens.js` 40/40
- 断言总数 551 → **584**（新增 33 条：兑换比例/余额不足/不扣负数、技能消耗递增与上限、天赋槽位/池范围/越级拒绝/重复拒绝、天赋实际生效）

### ⚠️ 遗留（未处理，需单独排期）

- **原有 10 个宠物天赋仍是「空壳」**：`pet-codex.js` 里 `lucky_pocket` / `dark_eye` / `winter_core` / `holy_guard` / `mirror_field` / `inspiration` / `mind_eye` / `fighter_instinct` / `immovable` / `pressure_field` 只有 `name` + `desc`，**没有 hooks 也没有 statMods，战斗内不生效**。本次按决策「天赋本身不变」未改动它们；新增的 4 个低阶天赋则带 statMods、真正生效
- 若后续要给这 10 个补效果，会改变战斗数值，并需同步更新 `test-pet-codex.js:49` 的 UR 宠物基准断言（`hp===360 / atk===60`）

---

## v2.1.1

**Date:** 2026-09-11

### 新增功能

- 🐞 **合入全局 Debug 面板**（`page/debug.js`，v2.0.11 线的功能）：原挑战页专属的 🔍 诊断 FAB 提升为全局（所有 tab 可见），点击展开底部抽屉，五分区：
  - 概览：版本号 / 日期 / 周期键（monthKey/旬）/ 当前 tab / 存储用量 / JS 错误数
  - 存储：全部 localStorage 键列表 + 单键 JSON 展开 + 单键/全部复制
  - 属性·经济：技能点全状态 + 敌群发点预演（胜1→10 … 胜6→35）+ 今日容量
  - 挑战：challenge 存档 + canSummon JSON + 挑战页内嵌诊断块开关（`window.__debugChallenge`）
  - 错误：`error` + `unhandledrejection` 全局捕获（最近 30 条，可清空）

### 修复 / 对齐

- 🎨 **抽屉改为复用 `.modal-overlay` / `.modal-sheet` 组件**：v2.0.11 首版的内联硬编码色值（`#1a1a1a`/`#94a3b8`）在浅色主题下不协调，现全部走设计令牌（`--surface-2`/`--text2`/`--bd`/`--rad-*`/`--fs-*`）
- ♿ **a11y 补齐**：`role="dialog"` + `aria-modal` + `aria-labelledby`、分区 `role="tablist"/tab` + `aria-selected`、FAB `aria-expanded`、Esc 关闭、打开聚焦关闭按钮 / 关闭回焦 FAB、复制入口 `role="button"` + 最小触控 44px
- 📏 **FAB 触控目标 40px → `var(--touch-min)`（44px）**，符合 v2.1.0 移动端规范
- 🔀 **合并 v2.1.0 设计体系线**：解决 README / changelog / index.html / utils.js 四处分叉冲突；`page/challenge.js` 自动合并（FAB 所有权移交 debug.js，诊断开关改 `window.__debugChallenge`）

### 修改文件

- `page/debug.js`（新增，218 行）
- `page/challenge.js`（移除 FAB/`_chDebugOn`，改读全局开关）
- `page/index.html`（挂载 debug.js；cache-busting v60 → v61）
- `page/index.css`（`.debug-fab` 改用 `--touch-min`）
- `page/utils.js`（APP_VERSION 2.1.0 → 2.1.1）
- `README.md` / `CONTEXT.md` / `doc/changelog-v2.0.md` / `doc/changelog-v2.1.md`

### 测试

- 26 个测试套件全绿（含新增护栏 `test-a11y-tokens.js` 40/40：令牌完整性 / 对比度 / 字号令牌化 / 静默 catch / aria 引用）
- 浏览器实测：抽屉五分区渲染、分区切换、键展开/复制、Esc 关闭、内嵌诊断开关联动

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
| v2.1.1 | 45 | 763 行 game-render.js | 🐞 合入全局 Debug 面板（debug.js）+ 抽屉令牌化/A11y 对齐 |
| v2.1.2 | 45 | 763 行 game-render.js | 📝 敌群 desc 敌数文案与实际对齐（4 敌→3 敌）+ 修正同源过期注释 |
| v2.1.3 | 45 | 763 行 game-render.js | 🐾 宠物面板补炼化进度 + 炼化石 10:1 兑换 + 技能指定升级 + 天赋槽解锁 |
| v2.1.4 | 45 | 763 行 game-render.js | 🐾 天赋回退为固有专属（修跨宠物共享）+ 宠物/技能面板补可滚动容器 + 修顶部横向溢出 + 浅色按钮改深橙白字 |
| v2.1.5 | 45 | 763 行 game-render.js | ⚔️ 命中/闪避系统 + 10 个宠物专属天赋接入实战 + 修敌人可抽到宠物天赋 |

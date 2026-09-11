# MyHealth 交接文档 (HANDOFF)

> **用途**：供其他 AI / 开发者直接接手维护，无需阅读全部历史文档
> **生成**：2026-09-02 · **最后更新：2026-09-11（对应 v2.1.2）**
> **分支**：`main`（本地 `37894e8`，领先远端 1 个提交，待推送）
> **当前版本**：`APP_VERSION` = `2.1.2` · cache-busting `?v62` · 45 个 `page/*.js` 模块
> **测试**：26 套件 / 551 断言，全部通过（含 a11y 护栏 40/40）

---

## 0. 立即上手

### 0.1 跑起来

```bash
cd page && python3 -m http.server 8801
# 浏览器打开 http://localhost:8801/index.html
```

`page/` 就是 Vercel 的部署根目录。也可直接访问线上：<https://my-health-six.vercel.app/>

### 0.2 ⚠️ 本项目的 git 有特殊封装（重要，先读这段）

本仓库的工作树位于 **Android SAF 挂载目录**（`/var/minis/mounts/_ai/MyHealth`）。SAF 桥接层有缺陷：git 写 loose object 时先建临时文件再 rename，跨层 rename 会失败，报
`unable to write file .git/objects/...: No such file or directory`。

**解决办法**：git 元数据已迁到本地文件系统，工作树仍在挂载目录。

```bash
# 一律用 wrapper（已设 GIT_DIR / GIT_WORK_TREE）
myhealth-git status -sb
myhealth-git add -A
myhealth-git commit -m "feat: ..."
myhealth-git push origin main
myhealth-git log --oneline -5

# wrapper 内容（/usr/local/bin/myhealth-git）：
#   export GIT_DIR=/var/minis/workspace/myhealth-git
#   export GIT_WORK_TREE=/var/minis/mounts/_ai/MyHealth
#   exec git "$@"
```

- 挂载目录里的 `.git` 已改名 `.git-disabled`（备份，已加 .gitignore）——**不要删除**
- **在普通 Linux / Windows 机器上直接用 `git` 即可**，上面的封装只是本机 Android 环境的适配
- 提交身份：`wuio-pc <wangdunhao@foxmail.com>`；远端 `git@github.com:wuwiwo/MyHealth.git`（SSH）
- 偶发推送失败 `Could not read from remote repository`——SSH 本身正常（`ssh -T git@github.com` 可验证），**重试即可**，属网络抖动，不要折腾 key

### 0.3 三条必守纪律

1. **改 `page/*.js` → 必须 bump** `APP_VERSION`（`page/utils.js`）+ **三项同步**（见 §9）
2. **改 JS/CSS → 必须递增** `page/index.html` 里的 `?vNN` cache-busting，否则浏览器吃缓存，改动"看不见"
3. **每次修改必须提交**，施工用 `feat:`/`fix:`，纯文档用 `docs:`，不留 pending 改动

### 0.4 改完必跑

```bash
for t in scripts/test-*.js; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done   # 全绿才算完
node scripts/test-a11y-tokens.js      # 设计体系护栏，改任何 UI 都要过
```

---

## 1. 项目概览

**MyHealth** — 个人健身健康管理 App。原生 JS + HTML + CSS，**无构建步骤**，Vercel 部署，后端用 Vercel Blob 做跨设备云同步。

**核心闭环**：力量/有氧训练记录 → 折算角色属性（攻击/防御/生命/魂攻/魂防）→ 挑战关卡 / 敌群 / Boss → 掉落材料 + 技能点 + 宝珠 → 养成强化 → 打更高的关卡。

**用户可见模块**：训练（力量/有氧）、个人（体重/统计/PR）、挑战（培养/战斗/记录 三视图）、设置（动作库/动作百科/外观/云同步）。

---

## 2. 版本状态与分支

| 项 | 值 |
|---|---|
| 当前版本 | **v2.1.2**（2026-09-11） |
| HEAD | `37894e8`（敌群 desc 文案修复 + 版本三项同步） |
| 远端 | `origin/main` = `190c96b`，本地领先 1 个提交（待推送） |
| cache-busting | `?v62`（`page/index.html` 内全部 47 处） |
| 模块数 | 45 个 `page/*.js`（+ 1 个 `page/data/exercises-dataset.js`） |
| 最大文件 | `page/game-render.js` 763 行，其次 `page/challenge.js` 709 行 |

**其他分支**（远端存在，均落后于 main）：`feat/action-dataset`、`feat/uiux-batch1`、`feat/v2-m2a`、`feat/v2-m2a-rest`、`fix/version-sync`。

**版本沿革（近期）**：
- **v2.0.9** — 敌群 6→9 大关（90 关）+ 难度曲线重平衡 + 宠物阶段归一化
- **v2.0.10** — 敌群通关技能点 100→10（1/10）
- **v2.0.11** — Debug 面板首版（debug 线分支产物）
- **v2.1.0** — 🎨 **设计体系版本**（设计令牌 + 移动端触控 + WCAG AA + 护栏测试）
- **v2.1.1** — 🐞 Debug 面板合入设计体系线（令牌化 + a11y + 冲突合并）
- **v2.1.2** — 📝 敌群关卡 `desc` 敌数文案与实际对齐（g3–g9 的「4 敌」→「最多 3 敌」）+ 修正同源过期注释 + 加防回归断言

> ⚠️ **v2.0.10/2.0.11 与 v2.1.0 曾分叉**（两条线都改 `index.html`/`utils.js`/`README`/`changelog`），已于 `dd46332` 合并解决。若再见到两条线并行，合并前先看 §8 的冲突回避经验。

---

## 3. 完整模块清单（= 页面加载顺序）

顺序在 `page/index.html` 底部，**顺序敏感，不可随意调换**（后加载的模块依赖前者的全局函数）。

```
store.js → data/exercises-dataset.js → ex-dataset.js → config.js → utils.js → levels.js
→ date-roll.js → monthly-reset.js → stats.js → state-core.js → status-defs.js → unit.js
→ talent.js → skill.js → enemy.js → battle.js → battle-group.js → terrain.js
→ group-levels.js → group-progress.js → ai.js → challenge.js → linechart.js → app.js
→ sync.js → tab-strength.js → tab-cardio.js → tab-profile.js → game-render.js
→ game-battle.js → game-records.js → game-refine.js → tab-game.js → tab-settings.js
→ pets.js → pet-materials.js → pet-codex.js → pet-store.js → pet-ui.js → skills.js
→ player-skill-hooks.js → skill-store.js → skill-ui.js → orbs.js → game-views.js
→ debug.js → [inline] init()
```

**分层理解**：
- **基础层**：`store` `utils` `date-roll` `monthly-reset` `stats` `config` `levels`
- **战斗引擎层**：`state-core` `status-defs` `unit` `talent` `skill` `enemy` `battle` `battle-group` `terrain` `ai`
- **内容数据层**：`group-levels` `group-progress` `ex-dataset` `data/exercises-dataset`
- **玩法层**：`challenge`（隐藏挑战）`pets*`（宠物）`skills*`（玩家技能）`orbs`（宝珠）
- **UI 层**：`app` `sync` `tab-*` `game-*` `*-ui` `linechart` `game-views` `debug`

---

## 4. 🎨 v2.1 设计体系（v2.1.0 引入，**所有 UI 改动必读**）

> 唯一权威规范：**`doc/design-tokens-v2.1.md`**（令牌表 / 对比度 / 触控 / 无障碍）

### 4.1 令牌速查（`page/index.css` 的 `:root`）

| 类别 | 令牌 |
|---|---|
| 表面 | `--surface` `--surface-2` `--surface-3`（`--bg2` 是 `--surface` 的旧别名，兼容保留） |
| 文字 | `--text`（主）/ `--text2`（次）/ `--text3`（弱） |
| 边框 | `--bd` `--bd-l` |
| 语义色 | `--brand-fill` `--on-brand` `--green` `--red` `--blue` `--yellow` `--purple`；透明变体用 `rgba(var(--brand-rgb),.35)` 这类 **RGB 通道令牌** |
| 字阶（10 档） | `--fs-3xs`(.625rem) `--fs-2xs`(.6875) `--fs-xs`(.75) `--fs-sm`(.8125) `--fs-base`(.875) `--fs-md`(.9375) `--fs-lg`(1.0625) `--fs-xl`(1.25) `--fs-2xl`(1.5) `--fs-3xl`(2) `--fs-hero`(2.5) |
| 间距 | `--sp-1`(4px) … `--sp-12`；`--gap` `--gap-lg` |
| 圆角 | `--rad-sm`(8) `--rad-md`(10) `--rad-lg`(14) `--rad-xl`(20) `--rad-full`(999)；简写 `--r` `--rs` `--rp` |
| 阴影 | `--sh-1` `--sh-2` `--sh-3` `--sh-brand`；简写 `--shadow` `--shadow-lg` |
| 层级 | `--z-fab`(55) `--z-modal`(80) `--z-share`(100) `--z-toast`(999) |
| 动画 | `--dur-1..4` `--ease-std` `--ease-out` `--ease-spring` |
| 布局 | `--mw`（最大宽度）`--tabbar-h`(48px) `--touch-min`(**44px**) `--pad-screen` |
| 安全区 | `--sat` `--sab` `--sal` `--sar`（配合 `viewport-fit=cover`） |
| 遮罩 | `--overlay` |
| 主题 | `[data-theme="light"]` 覆盖同名令牌；`prefers-reduced-motion` 自动把时长压到 1ms |

### 4.2 现成组件（**别重造**）

`page/index.css` 已有成套组件，直接复用即获得主题适配 + 动画 + a11y：

- `.modal-overlay` / `.modal-sheet` / `.modal-handle` / `.modal-title` / `.modal-actions`
  → **底部抽屉类 UI 用它**（Debug 面板就是这么做的）
- `.share-overlay` / `.share-card`（分享卡，固定深底，用 `--on-dark-text*`）
- `.section-hdr` / `.dn-btn` / `.add-btn` / `.debug-fab` 等

### 4.3 🚨 护栏测试 `scripts/test-a11y-tokens.js`（40 断言）

**改任何 UI 后必跑**，否则 CI/提交会挂。它只做纯文本解析（不需要 DOM），8 组规则：

| # | 规则 | 踩雷写法 → 正确写法 |
|---|---|---|
| 1 | 无 CSS 令牌自引用循环 | `--blue: var(--blue)` ❌（曾致深色主题整个 `--blue` 失效） |
| 2 | `var()` 引用的令牌必须已定义 | 拼错 `var(--bd-1)` ❌ |
| 3 | 必需令牌齐全 + `--touch-min`=44px + `--tabbar-h`=48px | 删/改这些值 ❌ |
| 4 | 对比度 WCAG AA（正文 4.5:1，大字 3:1），深/浅两套主题各测 8 组 | 白字配橙底（2.80:1）❌ → 用 `--on-brand` 深色字 |
| 5 | **JS 内联字号必须令牌化** | `style="font-size:.7rem"` ❌ → `var(--fs-xs)` ✅（仅放行 `4rem`/`5rem`/`.85em` 三个装饰值） |
| 6 | `--touch-min` 规则数 ≥6；密集筛选条 `#dsCatRow .car-type` 显式降级 36px | 触控目标缩水 ❌ |
| 7 | `aria-labelledby` / `<label for>` 的引用 id 必须存在；viewport 未禁用缩放；`role="tab"/"tablist"` 数量下限 | 悬空 aria 引用 ❌ |
| 8 | **无静默 catch** | `catch(e){}` ❌；`catch(e){ /* 解释 */ }`（注释在外面）❌ —— **规则扫的是 catch 花括号体内的文本**。必须在体内写 `console.*` / `toast(` / `notifyQuota(` / 字面「忽略」 |

> 规则 5 与 8 最容易踩。JS 里动态拼 HTML 时字号一律用 `var(--fs-*)`；catch 体里补一句 `/* 忽略 */` 即可（写在体内！）。

---

## 5. 🐞 Debug 面板（v2.1.1）

**`page/debug.js`** — 第 45 个模块，全局诊断工具。所有 tab 右下角都有 🔍 FAB（`--touch-min` 44px 触控目标，半透明，点击展开底部抽屉）。

### 五个分区

| 分区 | 内容 |
|---|---|
| **概览** | APP_VERSION / today / monthKey / 当前 tab / localStorage 键数与体积 / JS 错误数 / **旬周期状态**（`getCurrentPeriod` 完整 JSON：起止日期、名称、天数、容量阈值） |
| **存储** | 全部 localStorage 键（含非 `dh-` 前缀），逐键显示体积，可**单键展开 JSON** + 单键复制 + **复制全部键值** |
| **属性·经济** | 今日容量 / 本周有效时长 / 技能点全状态（点数、历史累计、本周胜局、周键、槽位、loadout、各技能等级）/ **敌群发点预演**（胜1→+10 … 胜6→+35，直接验证数值改动的效果） |
| **挑战** | `challenge` 存档完整 JSON + `canSummon()` 判定 JSON + 今日容量 vs 召唤门槛（100kg/次）+ **挑战页内嵌诊断块开关** |
| **错误** | `error` + `unhandledrejection` 全局捕获，保留最近 30 条，可清空；标签页显示计数 |

### 设计要点

- 样式**全部走设计令牌**，并复用 `.modal-overlay`/`.modal-sheet` 组件（主题切换免费、动画免费）
- a11y：`role="dialog"` + `aria-modal` + `aria-labelledby`，分区 `role="tablist"/role="tab"/aria-selected`，FAB `aria-expanded`，**Esc 关闭，打开时聚焦关闭按钮、关闭后焦点回到 FAB**，交互元素 `role="button"` + tabindex + `:focus-visible`
- 对外 API：`DebugPanel.open(sec?)` / `.close()` / `.refresh()` / `.viewKey(k)` / `.copyKey(k)` / `.copyAll()` / `.clearErrors()` / `.toggleInline()` / `.errors`
- 错误捕获在**模块加载时立即挂载**（早于面板打开），所以能抓到启动期异常

### 挑战页内嵌诊断块（历史功能，保留）

挑战页召唤面板有红框虚线诊断块，覆盖召唤面板的**全部 4 种状态分支**（`vol100` 容量不足 / `done` 已打过 / `pending` 待结算 / `cannot` 不可召唤 / `normal` 正常），显示：
`branch`（当前分支，排查"为什么显示这个状态"）、`today`/`strVol`、`canSummon()` JSON、次数判定（total/used/rate）、**今日力量明细逐条**（动作、重量、等效重量、次数、ratio、单条容量）、`challenge` JSON。

开关由 `window.__debugChallenge` 控制（Debug 面板「挑战」分区里切换）。`challenge.js` 里 `chDebugBlock()` / `mountSummonExtras()` 每个分支统一挂载。

### 尚未做的调试维度（可继续）

- 战斗过程单步调试 / RNG 回放（引擎已有 `mulberry32` rng 注缝，可播种复现）
- 时间旅行模拟（临时改日期，验证周/旬/月结算与离线结算）
- 云同步请求日志（`sync.js` 的请求/响应时间线）
- 性能面板（各 tab 渲染耗时、localStorage 写入次数）

---

## 6. 玩法系统清单

### 6.1 角色属性与训练

- **力量训练**：动作 / 重量 / 次数 → 容量（volume）。动作库在 `data/exercises-dataset.js` + `ex-dataset.js`（含 `tagHtml`/`zhLabel` 全局），支持改名/合并（`renameOrMergeExercise` 四库联动）
- **有氧**：时长 × 强度 → 有效时长
- **属性折算**：`stats.js` → 攻击/防御/生命/魂攻/魂防；周期目标按旬（`getCurrentPeriod`，每月上/中/下旬，各有容量阈值）
- **date-roll**：`dateKey`/`monthKey`/`daysBetween`/`monthKeyDiff`/`isClockRolledBack`（本地日历日，DST 安全）

### 6.2 隐藏挑战（`challenge.js`，709 行）

- **召唤门槛**：每 100kg 今日容量 = 1 次召唤机会（`todayPool = floor(今日容量/100)`）
- **召唤成功率阶梯**（`summonRate(used)`，`used` = 今日已失败次数）：

| 已失败次数 | 0 | 1 | 2 | 3 | 4 | ≥5 |
|---|---|---|---|---|---|---|
| 成功率 | 10% | 25% | 40% | 55% | 80% | **100% 必成** |

> 注：v1.9.9 的「前 4 次 15% / 第 5 次起 25%」是**旧规则**，已废弃，别抄错。

- **双池设计**（`v2.0.1`/`v2.0.2`）：
  - **今日池** `floor(今日容量/100)` —— 成功则写 `summonedDate=今日`（每日 1 次守卫）
  - **补召池** `floor(昨日容量/100)` —— 昨日漏召（仅顺延 1 天）且未补过时顺延至今日；补召成功写 `madeUpDate=昨日`（`madeUpUsed` 单独计数）。**补召结算不占今日名额**（`applyChallengeSettle` 分型记账）
- **误锁自助恢复**：`v2.0.7` 修复前完成补召的存档可能被锁，done 卡有恢复按钮（`v2.0.8` 放宽条件精确命中 `madeUpDate===昨日`）
- **热血 buff**：周内 4 天连续解锁
- **奖励**：材料 + 技能点（基础 20/次 + 周次数档位奖励 2/4/5+）——**与敌群发点是两条独立代码路径**（此处 `challenge.js` 直加 `ss.points`，敌群走 `awardSkillPoints`），改数值时注意区分
- **历史成绩查看**（含 buff）；战斗形式为 8-12s 倒计时点击攻击小游戏（预览确认后开始）

### 6.3 敌群多对多战斗

**`group-levels.js`** —— **9 大关 × 10 小关 = 90 关**，程序化生成（`GROUP_LEVELS` 是 `{g1..g9}` 对象，每大关含 `stages[10]`）。实测数据：

| 大关 | 名称 | 最多敌数 | 魂攻防 | 最高 atk |
|---|---|---|---|---|
| g1 / g2 | 森林 / 山丘 | 2 | 无 | — |
| g3–g9 | 洞穴 / 遗迹 / 深渊 / 王座 / 天穹 / 冥府 / 神域 | 3 | 有 | g9-10 = **353** |

- 首关 g1-1 的 atk = **14**，末关 g9-10 的 atk = **353**
- **每大关第 5 小关为精英（`type: "elite"`）**、**第 10 小关为 Boss（`type: "boss"`）**（如 g1-5 elite、g1-10 boss）
- ✅ **v2.1.2 已修**：`desc` 由三元表达式生成，g3–g4 曾写「进阶试炼（最多 4 敌）」、g5–g9 曾写「高阶试炼（4 敌+魂攻防）」，而实际生成上限是 3 敌（Boss 关 = 1 Boss + 2 护卫、精英关 = 1 精英 + 2 杂兵、普通关至多 3）。现文案与数据一致，并由 `test-group-levels.js` 的「`desc` 敌数一致」断言（逐大关比对）锁死防回归

**其他战斗模块**：

- **`group-progress.js`**：线性解锁，通关解锁下一关，**通关后锁定不可重打**
- **`battle-group.js`**：群战引擎，行动队列按速度排序 + 单步执行（`groupBattleStep`，一次一单位；`groupBattleTick` 兼容整回合）
- **`talent.js`** 16 天赋 · **`skill.js`** 25 敌群技能（含冷却/先制度）· **`status-defs.js`** 12 状态（中毒/冰冻/畏缩/潮湿/哈欠/蓄力/附身/末日/破甲/魂防降/减速/遗言诅咒；哈欠会衍生「睡眠」子状态）
- **`ai.js`** AI 策略：斩杀残血 / 治疗队友 / Boss 大招 / 嘲讽强制 / 集火评分
- **`terrain.js`** 6 场地
- **UI**：`game-render.js` 手动/自动模式 + 1×2×4×8× 调速 + 单位详情 + 分回合战斗日志 + 复制 + 伤害飘字 + 技能气泡

### 6.4 玩家技能（`skills.js` 等）

- 9 技能（被动/辅助/攻击各 3）：暴击 / 气力恢复 / 陨石轰炸 / 格挡 / 气势如虹 / 冰魄光束 / 金身护盾 / 瞩目 / 巨石重压
- 技能点经济：敌群通关 **+10/胜**（周内递增 +50%：10→15→20→25→30→**35 封顶**）
- 槽位：初始 1，12/20 关解锁；同类型限 1
- **关键**：`startGroupTrial` 里必须 `attachPlayerSkills(player, getSkillState())`，玩家技能才生效

### 6.5 宠物系统

- 生命周期：蛋 → 孵化 → 成长期 → 成熟期 → 阵亡；离线结算；共鸣加成；月重置
- 6 材料（营养液/饲料/灵能/普通炼化石/高级炼化石/宝珠碎片）；炼化上限按稀有度 R50/SR60/SSR80/UR100
- 图鉴 14 只（3R+4SR+4SSR+3UR）；成熟宠物可参战（独立行动）
- 阶段值读取时实时归一化（防旧存档越界值）

### 6.6 宝珠

5 类型（血气/攻击/魂攻/防御/魂防）× 4 品质（N/R/SR/SSR），合成 65% 成功率，可分解/升级/装配，月重置，战斗属性自动应用。

---

## 7. 数据持久化

**物理键名规则**（`store.js`）：`dh-` + `<逻辑名>` + `-v<schema 版本>`，即 `physKey()`。
例如 `store.get('challenge')` → localStorage 键 **`dh-challenge-v1`**。读坏值时 store 会备份成 `*-bak` 再回落默认值；`store.js` 还提供 `mergeAll`/`setAll`（云同步用）与 `-v<n>` 迁移链。

| 逻辑名 / 物理键 | 用途 |
|---|---|
| `pets` → `dh-pets-v1` | 宠物（pets / materials / materialLog / challengeWeek） |
| `skills` → `dh-skills-v1` | 玩家技能（points / levels / loadout / slotsUnlocked / totalEarned / weekKey / winCountThisWeek） |
| `groupProgress` → `dh-groupProgress-v1` | 敌群通关进度（cleared 数组） |
| `challenge` → `dh-challenge-v1` | 隐藏挑战存档（summonedDate / seasonBonus / todayUsed / useDate / weekDays / weekKey / hotBuffUsed / pendingChallenge / lastRewardDate / madeUp* / history） |
| `attrLog` → `dh-attrLog-v1` | 属性变动日志 |
| `game` → `dh-game-v1` | 关卡试炼进度（cleared / current） |
| `exercises` → `dh-exercises-v1` | 动作库（4KB+，最大的键） |
| `records` / `prs` / `profile` / `theme` | 训练记录 / 个人最佳 / 个人资料 / 主题 |
| `strength` `cardio` `weight` `plans` `cardioPlans` `cardioTypes` `refine` `missed` | 训练与养成数据 |
| 无版本后缀（直接写 localStorage，非 store 管） | `dh-mod-time`（修改时间戳）`dh-last-reset-month` `dh-def-bonus-fixed` `dh-june-bonus-backfilled` `dh-game-guide-done` `dh-group-mode` `dh-group-speed` `dh-sync-time` |

> 排查存档问题：直接用 **Debug 面板 → 存储分区**，展开/复制任意键，不需要连电脑。
>
> ⚠️ **已知的过期注释**：`page/group-progress.js:5` 的注释写的是「进度存 `dh-group-progress`」，但实际物理键是 `dh-groupProgress-v1`（`store.get('groupProgress')` + `physKey` 规则）。以本表为准，下次改该文件时顺手修掉注释。

---

## 8. 测试（26 套件 / 551 断言，全绿）

```bash
for t in scripts/test-*.js; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done
```

| 套件 | 断言 | 覆盖 |
|---|---|---|
| `test-a11y-tokens` | 40 | 🛡️ **设计体系护栏**（见 §4.3） |
| `test-page-load` | 27 | 页面加载链冒烟（校验 index.html 挂载了全部模块 + 骨架容器）——**接线事故防线** |
| `test-challenge-borrow` | 27 | 隐藏挑战顺延/补召/误锁恢复 |
| `test-skill` | 40 | 25 敌群技能 |
| `test-pet-codex` | 37 | 图鉴 + 参战 Unit 生成 |
| `test-group-levels` | 40 | 90 关生成 / 精英 Boss / 数量魂攻防规则 / 难度递增 / **`desc` 敌数与实际一致** |
| `test-skills` | 29 | 玩家技能 |
| `test-enemy` | 26 | 16 天赋 + 编成阶梯 |
| `test-state-core` | 25 | 状态框架 |
| `test-status` | 25 | 状态定义 |
| `test-pet-materials` | 24 | 材料 + 炼化 |
| `test-date-roll` | 23 | 时间工具 |
| `test-exercise-rename` | 21 | 动作改名/合并四库联动 |
| `test-store` | 20 | store 注册表/读写/坏值回落 |
| `test-pets` | 19 | 宠物生命周期 |
| `test-orbs` | 17 | 宝珠 |
| `test-battle` | 16 | 单敌战斗 + rng |
| `test-pet-store` | 15 | 宠物持久化 |
| `test-player-skills` | 15 | 玩家技能挂钩 |
| `test-terrain` | 13 | 6 场地 |
| `test-group-battle` | 11 | 群战引擎 |
| `test-group-progress` | 10 | 敌群解锁链 |
| `test-pet-stage` | 10 | 宠物阶段归一化 |
| `test-skill-store` | 10 | 技能点经济数值 |
| `test-ai` | 7 | AI 策略 |
| `test-spotlight` | 4 | 瞩目 |

> 历史 flaky `test-ai.js` 已由 `36301eb`（确定性 rng + 多轮试验取并集）修复，实测**连续 30 次全过**。群战栈内部仍直接用 `Math.random`，若要进一步稳定可改走 `battle.js` 的 `mulberry32` rng 注缝。

---

## 9. 版本纪律（AGENTS.md 有原文）

每次改 `APP_VERSION`（`page/utils.js`）必须**三项同步**，否则 `scripts/check-release.js`（pre-commit hook）会拦：

1. **`page/index.html`**：全部 `?vNN` cache-busting 递增（当前 v61）
2. **`doc/changelog-v<主版本>.md`**：新增版本章节 + **底部架构演化表加行**（版本 | JS 文件数 | 最大文件行数 | 摘要）
3. **`README.md`**：顶部副标题版本号 + 版本历史表格加行 + 「当前版本」指向

补充：
- `CONTEXT.md` 的模块目录树若新增/删除模块也要同步
- 纯文档改动 = `docs:` 前缀，**不 bump 版本**
- 提交信息施工用 `feat:`/`fix:`，不留 pending

---

## 10. 待办 / 已知问题

- [ ] **真机验收**：本地测试全绿，但手机端手感/性能（群战 8 倍速、飘字动画、长时间挂机）未全面验证
- [ ] **敌群数值平衡**：90 关全通需要非常强的角色，曲线可能仍偏陡
- [x] **🐛 用户可见文案过期**：`page/group-levels.js` 的 `desc` 写「4 敌」，实际每关最多 3 敌 —— **v2.1.2 已修**（连同三处同源过期注释），并加防回归断言
- [ ] **动作百科媒体**：媒体接线已完成（本地 `page/media/` + `MEDIA_BASE` 可配，见 `config.js`），**待确认 Vercel 部署后可访问**
- [ ] **云同步健壮性**：Blob 存储的冲突合并策略较简单，多设备并发写入未压测
- [ ] **Debug 面板扩展**：RNG 回放 / 时间旅行 / 同步日志 / 性能面板（见 §5 末尾）
- [ ] 远端遗留分支（`feat/action-dataset` 等 5 个）可评估后清理

---

## 11. 关键文件速查

| 文件 | 作用 |
|---|---|
| `page/index.html` | 唯一入口 + 全部模块加载顺序 + cache-busting |
| `page/index.css` | 全部样式 + **设计令牌 `:root`** + 组件（modal/share/card） |
| `page/store.js` | localStorage 封装（`dh-` 前缀、坏值回落 .bak） |
| `page/utils.js` | **`APP_VERSION` 在这里** + 通用工具 + 日期 |
| `page/stats.js` | 训练量 → 属性折算 |
| `page/date-roll.js` / `monthly-reset.js` | 时间/周期工具 |
| `page/challenge.js` | 隐藏挑战（含内嵌诊断块） |
| `page/group-levels.js` / `group-progress.js` | 敌群 9×10 生成 / 解锁链 |
| `page/battle-group.js` | 群战引擎（核心） |
| `page/ai.js` / `talent.js` / `skill.js` / `status-defs.js` / `terrain.js` | 战斗内容层 |
| `page/game-render.js` | 群战 UI（最大文件） |
| `page/game-views.js` | 挑战页三视图骨架 |
| `page/skills.js` / `player-skill-hooks.js` / `skill-store.js` / `skill-ui.js` | 玩家技能 |
| `page/pets.js` / `pet-*.js` | 宠物系统 |
| `page/orbs.js` | 宝珠 |
| `page/debug.js` | 🐞 Debug 面板 |
| `scripts/test-*.js` | 26 套测试 |
| `scripts/test-a11y-tokens.js` | 🛡️ 设计体系护栏 |
| `scripts/check-release.js` | 版本三项校验（pre-commit hook） |
| `doc/design-tokens-v2.1.md` | 🎨 设计规范（唯一权威） |
| `doc/changelog-v2.0.md` / `doc/changelog-v2.1.md` | 版本日志 + 架构演化表 |
| `AGENTS.md` | 版本纪律原文 |

---

## 12. 踩坑经验（血泪，别再踩）

1. **接线事故两次**（v2.0.3 / v2.0.4）：新增模块忘挂 `index.html`、新 UI 忘写 HTML 骨架 → 线上功能整个不可见。**`test-page-load.js` 就是为此设的防线**，加模块必跑。
2. **cache-busting 忘记递增** → 浏览器吃旧缓存，改了像没改。改 JS/CSS 必升 `?vNN`。
3. **CSS 令牌自引用**（v2.1.0 事故）：`--blue: var(--blue)` 导致深色主题整个 `--blue` 失效，且不报错。护栏 §4.3 规则 1 已防。
4. **静默 catch**：护栏规则 8 扫的是 catch **体内**文本，注释写在括号外面不算，必须写在体内。
5. **JS 内联硬编码字号**：护栏规则 5 会拦，一律 `var(--fs-*)`。硬编码 hex 颜色虽不报错，但浅色主题下会不协调 —— **用令牌**。
6. **SAF 挂载 git 写失败** → 用 `myhealth-git` wrapper（见 §0.2）。
7. **群战与隐藏挑战的技能点是两条独立代码路径**，调数值时别只改一处。
8. **两条线并行开发易分叉**（v2.0.10/11 vs v2.1.0）：都改 `index.html`/`utils.js`/`README`/`changelog` 必冲突。解决经验：`index.html` 用 `git checkout --theirs` 取远端结构，再用 sed/脚本**重放自己的增量改动**（比手抠冲突块快且不会丢远端的改造）；changelog 用脚本按「远端行 + 本地行 + 本地章节 + 远端章节」重组。

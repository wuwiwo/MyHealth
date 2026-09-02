# MyHealth v2.0 交接文档 (HANDOFF)

> **用途**：供其他 AI / 开发者直接接手 v2.0 开发
> **生成**：2026-09-02
> **分支**：`feat/v2-m2a-rest`（所有 v2.0 代码在这里，**main 未动**）
> **说明**：本文件汇总 v2.0 全部已实现系统、模块、测试、进度与待办

---

## 0. 立即上手

```bash
# 切换分支
git checkout feat/v2-m2a-rest

# 本地测试（page/ 是 Vercel 根目录）
cd page && python3 -m http.server 8801
# 浏览器打开 http://localhost:8801/index.html
```

**开发者注意**：
- 改 `page/*.js` 后**必须 bump** `page/index.html` 里的 `?vXX` cache-busting 版本号（否则浏览器缓存旧代码，改动看不到）—— 这是本项目的关键坑
- 运行测试：`node scripts/test-*.js`（全部应 0 失败）

---

## 1. 项目概览

MyHealth — 个人健身健康管理 App（原生 JS + HTML + CSS，无构建，Vercel 部署）。

**核心玩法**：力量/有氧训练 → 转换角色属性（攻击/防御/生命/魂攻/魂防）→ 挑战关卡/Boss → 隐藏挑战（掉落材料+技能点）。

**v2.0 目标**：技能系统（玩家）+ 敌群多对多战斗 + 宠物养成系统 + 宝珠。

---

## 2. v2.0 已完成系统（M0-M6 全完成）

### M1 玩家技能系统
- **`page/skills.js`**：9 技能注册表（被动/辅助/攻击各 3）+ 技能点经济（隐藏挑战 +100，周递增）+ 槽位系统（初始 1，12/20 关解锁，同类型限 1）
- **`page/player-skill-hooks.js`**：技能战斗挂钩（暴击/格挡/金身护盾/气势如虹/气力恢复/瞩目/陨石/冰魄/巨石）
- **`page/skill-store.js`**：dh-skills-v1 持久化 + 技能点获取
- **`page/skill-ui.js`**：技能面板 UI（培养视图）
- 9 技能：暴击/气力恢复/陨石轰炸/格挡/气势如虹/冰魄光束/金身护盾/瞩目/巨石重压

### M2 战场升级（多对多）
- **`page/unit.js`**：Unit 模型（createUnit/查询/速度/属性修正）
- **`page/state-core.js`**：状态框架（defineStatus/applyStatus/tickStatuses/dispatch/statMods）
- **`page/status-defs.js`**：敌群状态（中毒/冰冻/畏缩/潮湿/哈欠/蓄力/附身/末日/破甲/魂防降/减速/遗言诅咒）
- **`page/battle.js`**：单敌战斗引擎（含 rng 注缝 mulberry32，五段式 hook）
- **`page/battle-group.js`**：**多对多群战引擎**（行动队列按速度排序 + 单步执行 + 天赋/技能/状态/场地 + 玩家技能挂钩）
- **`page/talent.js`**：16 敌群天赋（利刃/振翅/粗糙皮肤/强健/魔法镜/朴实/威吓/魔法盾/慢启动/懒惰/多目标/嗜血/复仇/再生）
- **`page/skill.js`**：25 敌群技能（冲撞/咬击/地刺/暴风雪/末日/遗言/诅咒/冰魄/巨石等，含冷却/先制度）
- **`page/ai.js`**：敌人 AI 策略（斩杀残血/治疗队友/Boss 大招/嘲讽强制/集火评分）

### M3 技能完整版
- 陨石/冰魄/巨石/瞩目全部实装（见 M1 hooks）

### M4 宠物系统
- **`page/pets.js`**：宠物生命周期（蛋→孵化→成长期→成熟期→阵亡）+ 离线结算 + 共鸣加成 + 月重置
- **`page/pet-materials.js`**：6 种材料（营养液/饲料/灵能/普通炼化石/高级炼化石/宝珠碎片）+ 宠物炼化（属性成长，按稀有度上限 R50/SR60/SSR80/UR100）
- **`page/pet-codex.js`**：14 只宠物图鉴（3R+4SR+4SSR+3UR）+ 宠物技能/天赋注册 + createPetUnit（生成战斗 Unit）
- **`page/pet-store.js`**：dh-pets-v1 持久化 + 材料掉落 + 每日结算 + 参战生成
- **`page/pet-ui.js`**：宠物面板 UI（喂食/营养/炼化/参战选择）

### M5 宠物战斗
- 成熟宠物可进群战（createPetUnitsForBattle），独立行动（技能/天赋/共鸣）

### M6 宝珠系统
- **`page/orbs.js`**：5 类型（血气/攻击/魂攻/防御/魂防）× 4 品质（N/R/SR/SSR）+ 合成（65% 成功率）/分解/升级/装配/月重置 + 战斗属性应用

### 敌群系统（M2b 重构）
- **`page/group-levels.js`**：6 大关 × 10 小关 = 60 关（程序化生成）：
  - 第 5 小关精英（⭐）、第 10 小关 Boss（👑）
  - 大关 1-2 无魂攻防、最多 2 敌；大关 3-6 最多 4 敌（含魂攻防）
  - 难度随大关/小关递进
- **`page/group-progress.js`**：敌群线性解锁（g1-1 开始，通关解锁下一关，通关锁定不可重打）
- **`page/group-levels.js`** 生成敌人（tier 阶梯：minion/elite1/elite2/boss）

### 挑战页三视图
- **`page/game-views.js`**：培养（角色卡+宠物+技能+材料）/ 战斗（本旬目标+敌群+关卡）/ 记录（PR+属性）
- **`page/game-render.js`**：群战 UI（手动/自动模式 + 1×2×4×8× 调速 + 单位详情 + 战斗日志分回合 + 复制 + 伤害飘字动画 + 技能气泡）

---

## 3. 新增模块清单（页面加载顺序）

```
store.js → ex-dataset.js → config.js → utils.js → levels.js → date-roll.js → monthly-reset.js
→ stats.js → state-core.js → status-defs.js → unit.js → talent.js → skill.js → enemy.js
→ battle.js → battle-group.js → terrain.js → group-levels.js → group-progress.js → ai.js
→ challenge.js → linechart.js → app.js → sync.js → tab-strength.js → tab-cardio.js
→ tab-profile.js → game-render.js → game-battle.js → game-records.js → game-refine.js
→ tab-game.js → tab-settings.js → pets.js → pet-materials.js → pet-codex.js → pet-store.js
→ pet-ui.js → skills.js → player-skill-hooks.js → skill-store.js → skill-ui.js → orbs.js
→ game-views.js
```

---

## 4. 时间/日期工具

- **`page/date-roll.js`**：dateKey/monthKey/daysBetween/monthKeyDiff/isClockRolledBack（本地日历日，DST 安全）
- **`page/monthly-reset.js`**：resolveMonthWindow/freshMonthStamp（自然月窗口判定）

---

## 5. 数据持久化（store keys）

| Key | 用途 |
|-----|------|
| `dh-pets-v1` | 宠物（pets/materials/materialLog/challengeWeek）|
| `dh-skills-v1` | 玩家技能（points/levels/loadout/slotsUnlocked）|
| `dh-groupProgress` | 敌群通关进度（cleared 数组）|
| 现有 | strength/cardio/weight/profile/game/prs/plans/exercises/refine/theme 等 |

---

## 6. 测试（`scripts/test-*.js`，共 366+ 项，全部 0 失败）

| 测试 | 覆盖 |
|------|------|
| test-battle | 单敌战斗 + rng |
| test-group-battle | 群战引擎 |
| test-group-levels | 60 关生成/精英Boss/数量魂攻防规则 |
| test-group-progress | 敌群解锁链 |
| test-ai | AI 策略 |
| test-enemy | 16 天赋 + 编成阶梯 |
| test-skill | 25 敌群技能 |
| test-status | 状态定义 |
| test-terrain | 6 场地 |
| test-pets | 宠物生命周期 |
| test-pet-materials | 材料+炼化 |
| test-pet-codex | 图鉴+参战 |
| test-pet-store | 持久化 |
| test-skills | 玩家技能 |
| test-player-skills | 技能挂钩 |
| test-skill-store | 技能持久化 |
| test-spotlight | 瞩目 |
| test-state-core | 状态框架 |
| test-date-roll | 时间工具 |
| test-store | store 注册表 |
| test-orbs | 宝珠 |

运行：`for t in scripts/test-*.js; do node $t; done`

---

## 7. 关键机制说明

### 伤害飘字/目标定位
- 引擎伤害事件带 `targetId`，playAttackFeedback 用 targetId 定位受击卡片（不用名字匹配）

### 技能生效
- `startGroupTrial` 里必须 `attachPlayerSkills(player, getSkillState())` 玩家技能才生效

### 群战单步
- `groupBattleStep(gb)` 一次行动一个单位（速度优先级可见），`groupBattleTick` 兼容整回合

### 玩家攻击技能
- `playerAttackSkillPick` 30% 几率施放装备的攻击类技能（陨石/冰魄/巨石）

---

## 8. 未完成/待办

- [ ] **M2b 更多内容**：敌群关卡数值平衡（当前属性曲线可能偏强，60 关全通需强角色）
- [ ] **动作百科**：媒体文件在 `page/media/`（部署时需确认 Vercel 能访问），图床 `MEDIA_BASE` 可配置
- [ ] **真机验收**：本地测试 OK，但真机（手机）手感/性能未全面验证
- [ ] **合并 main**：所有 v2.0 在 feat/v2-m2a-rest，**未合 main**（main 停留在 v1.11.0/x.x 老版本）
- [ ] **版本发布**：v2.0 系统开发完但未 bump 到 2.x（当前 APP_VERSION 仍 1.x）
- [ ] **关卡挑战**：117 关战斗（单敌）与群战共存，需确认 UX 不冲突

---

## 9. 关键文件速查

| 文件 | 作用 |
|------|------|
| `page/group-levels.js` | 敌群 6×10 生成 |
| `page/battle-group.js` | 群战引擎（核心）|
| `page/ex-dataset.js` | 动作百科数据层（含 tagHtml/zhLabel 全局）|
| `page/game-views.js` | 挑战页三视图 |
| `page/game-render.js` | 群战 UI |
| `page/tab-settings.js` | 设置页（动作库/关联/动作百科）|
| `page/tab-strength.js` | 训练页（动作选择弹层）|

---

## 10. 版本纪律提醒

- 施工阶段改 `page/*.js` → bump APP_VERSION + README/changelog/架构表 三项同步
- **但 v2.0 开发中未发布**，所以现在只做代码提交，不 bump 版本
- 所有提交用 `feat:`/`fix:` 前缀，文档用 `docs:`

/* ============================================
   MyHealth — WP-G 等级称号表（唯一来源；纯数据，JSON 形状）
   ============================================
   ⚠️ 本文件是**称号文案的唯一来源**：`page/level-system.js` 的 `levelTitle(level)` 只查这张表，
     其它模块（game-views / tab-profile / levelCardHtml）一律读 `levelTitle()`，
     **不得在任何调用点写死称号文案**（同 LEVEL_TIERS / SKILL_POINTS_PER_STAGE 的教训）。

   为什么落成「JSON 形状的 .js」而不是 `data/level-titles.json`：
     · 本应用运行时是**纯 `<script>` 挂载**（`page/index.html` 逐条 `<script src>`，无打包器）；
     · `page/*.js` 里唯一的网络代码是 `sync.js` 的 XMLHttpRequest（GitHub 同步），
       全项目**没有任何 fetch/XHR 加载 JSON 资源的链路**（grep 过：无 fetch(...) 读 data/）；
     · `data/` 下唯一被运行时消费的先例是 **`data/exercises-dataset.js`**（同样是 .js 模块，
       导出 `window.EX_DATASET`，由 index.html 的 `<script src="data/exercises-dataset.js">` 挂载）；
       `data/action-map.json` 只被 **构建期** Node 脚本读（`scripts/build-dataset.js`、`scripts/fetch-media.js`），
       运行时零引用。且本应用以 file:// 打开，fetch 本地 JSON 也会被浏览器拦掉。
     → 结论：JSON 放在 `data/` 运行时读不到，所以称号表落成 **JSON 形状的模块**，
       运行时零改造即可被 level-system.js 读取，且仍然只有这一份数据（单一来源）。

   ⚠️ 新模块挂载（由主控在 `page/index.html` 加，本任务不改 index.html）：
     在 `<script src="level-system.js?vNN"></script>` **之前**加一行
     `<script src="level-titles.js?vNN"></script>`（未挂载时 `levelTitle()` 会落兜底文案，不会抛错/返回 undefined）。

   结构：等级键 → 称号。键 = **lv1 基线档 + `LEVEL_TIERS` 的 26 档等级**（10/30/50/80/120/160/200/
     300/400/500/600/700/800/900/1000/1100/1200/1300/1400/1500/1600/1700/1800/1900/2000/2100），
     与档位等级**一一对应**（26 档全覆盖，lv1 额外一条基线）。
   语义：**达到即切换** —— `levelTitle(lv)` 取「不大于 lv 的最大键」的称号
     （与 LEVEL_TIERS「达到即激活、效果叠加」同语义）；lv1~lv9 = lv1 档，lv2100 以上沿用最大档。
   （把本注释块与文件最后一行去掉，剩下的 `var LEVEL_TITLES = {...};` 右侧即为合法 JSON。）
   ============================================ */

var LEVEL_TITLES = {
  "1": "健身勇士",
  "10": "训练新秀",
  "30": "铁骨新锐",
  "50": "力量行者",
  "80": "筋骨卫士",
  "120": "疾风健将",
  "160": "铁臂猛士",
  "200": "魂力斗士",
  "300": "淬体高手",
  "400": "气血高手",
  "500": "疾影游侠",
  "600": "钢铁猛将",
  "700": "不动堡垒",
  "800": "力魂先锋",
  "900": "磐岩守卫",
  "1000": "破势强者",
  "1100": "铁壁强者",
  "1200": "烈焰斗者",
  "1300": "磐石斗者",
  "1400": "疾影宗师",
  "1500": "风翼宗师",
  "1600": "巨力宗师",
  "1700": "玄铁宗师",
  "1800": "力魂至尊",
  "1900": "玄魂至尊",
  "2000": "健身传说",
  "2100": "健身神话"
};

if (typeof window !== 'undefined') window.LEVEL_TITLES = LEVEL_TITLES;

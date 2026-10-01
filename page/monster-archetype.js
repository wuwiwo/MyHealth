/* ============================================
   MyHealth — Monster Archetype (v2.3.0)
   怪兽头像：把**敌人名**确定性地映射到**视觉原型**，并渲染头像 <img>。
   设计规格与逐原型提示词见 doc/design-monster-icons.md。

   为什么是原型而不是逐名：
     · page/levels.js 有 33 章 × 6 关 = 189 个唯一敌人名；page/group-levels.js
       另有敌群名字池 21 名。逐名绘制会产出大量视觉同构的图标
       （永恒壁垒 / 终极壁垒 / 星核壁垒 / 冥河壁垒 … 在 16×16 下必然长得一样），
       去重目标**结构性地无法达成**，且每次扩章都要新画图标。
     · 归纳为 18 个视觉原型后：189/189 关卡 + 21/21 敌群名全覆盖，
       新增关卡自动复用就近原型，**零维护成本**。

   ⚠️ 本文件是**怪兽图标渲染的唯一入口** —— 任何需要显示敌人头像的地方都走
      monsterIconHtml() / monsterIconHtmlByName()，不要在别处硬拼 <img> 路径。
   ⚠️ 依赖：无（纯数据 + 纯函数）。放在 levels.js 之后、group-levels.js 之后的
      加载位置即可，不依赖 ENEMY_NAMES 是否已定义（名字池映射是纯字符串判定）。
   ============================================ */

/* ============ 18 个视觉原型 ============
   id → 中文名。id 同时是图标文件名（page/media/monsters/<id>.svg）。
   ⚠️ 新增原型必须同时：① 在 page/media/monsters/ 放同名 SVG；
      ② 在 scripts/test-monster-icons.js 的期望表里加一行（否则测试守卫会漏检）。 */
var MONSTER_ARCHETYPES = {
  soldier:   '步兵',
  guard:     '守卫',
  berserker: '狂战',
  sentinel:  '哨卫',
  bow:       '弓手',
  ranger:    '游侠',
  assassin:  '刺客',
  knight:    '剑士',
  rider:     '骑兵',
  mage:      '术士',
  golem:     '石像',
  titan:     '巨神',
  beast:     '凶兽',
  undead:    '亡灵',
  dragon:    '龙',
  eyeboss:   '巨眼',
  lord:      '领主',
  avatar:    '化身'
};

/* 兜底原型：名字一条规则都没命中时用它（**不返回 null**，保证界面上不出现空图标）。
   选 sentinel 是因为它是「斜持长兵器的人形」，作为泛用敌兵剪影最不违和。 */
var MONSTER_ARCHETYPE_FALLBACK = 'sentinel';

/* 正则在模块顶层编译一次（每次调用重新 new RegExp 会在渲染循环里产生大量临时对象；
   关卡列表一次要渲染 189 张卡片，这个开销值得省）。 */
var _MA_RE = {
  bossEyeboss: /眼|之渊/,
  bossDragon:  /龙/,
  bossAvatar:  /灵|化身|形态|无限|终焉|虚无|归零|无相/,
  dragon:      /龙/,
  beast:       /凤凰|水母|巨兽|狼|蝙蝠|史莱姆|熊|猪|蛇|蛛/,
  undead:      /死士|亡灵|游魂|摆渡|黄泉|忘川|轮回|骷髅/,
  assassin:    /刺客|猎影|寂灭之影|岁月|暮光/,
  bow:         /弓|弩/,
  golem:       /巨像|壁垒/,
  titan:       /巨神|巨人|巨灵/,
  mage:        /法师|魔导|咒术|术师|祭司|先知|法皇|残响|毒师/,
  rider:       /骑兵|骑士|统领/,
  knight:      /剑圣|剑帝|剑神|剑尊|剑主|剑者|剑士|剑/,
  guard:       /盾|铁卫/,
  berserker:   /狂|毁灭|灭世|天灾|末日/,
  lord:        /领主|主宰|之主|天尊|炎尊|神王|天神|之神|之王/,
  ranger:      /哨|守望|游侠|猎手|猎者/,
  guard2:      /守卫|卫兵|卫士|近卫|守门人/,
  soldier:     /战士|步兵|先锋|行者|使徒|使者|代言|执事|织者|见习|斥候|侍者|执行|审判|裁决/
};

/* 剥掉名字里的前缀：
   · levels.js 的 npc 字段形如 `'BOSS 暗龙'`
   · group-levels.js 的名字池形如 `'Boss·暗龙'` / `'精英·狂战'` / `'杂兵·剑'`
   ⚠️ 顺序必须先剥离 `·` 前缀再剥离 `BOSS `（两类不会同时出现，但保持幂等更稳）。 */
function monsterStripPrefix(name) {
  if (!name) return '';
  var n = String(name);
  n = n.replace(/^(Boss|BOSS|精英|杂兵|头目|小怪)·/, '');
  n = n.replace(/^BOSS\s+/, '');
  return n.trim();
}

/* 名字 → 原型 id。
   @param name 敌人名（可带前缀，内部会剥离）
   @param boss 可选。**是否 BOSS**。⚠️ 判定依据只能是 levels.js 的 `boss:true` 字段
               或 group-levels.js 的 tier==='boss'，**不得靠名字前缀猜** ——
               `'BOSS 万古长夜'` 与同章的 `'万古守望'` 相邻，前缀会有歧义。
   判定顺序严格自上而下，首个命中即返回。**顺序本身是规格的一部分**
   （见 doc/design-monster-icons.md §2.2），调整会改变大量关卡的图标，勿随手重排。 */
function monsterArchetypeOf(name, boss) {
  var n = monsterStripPrefix(name);
  if (!n) return MONSTER_ARCHETYPE_FALLBACK;
  var R = _MA_RE;

  if (boss) {
    if (R.bossEyeboss.test(n)) return 'eyeboss';
    if (R.bossDragon.test(n)) return 'dragon';
    if (R.bossAvatar.test(n)) return 'avatar';
    return 'lord';
  }

  if (R.dragon.test(n)) return 'dragon';
  if (R.beast.test(n)) return 'beast';
  if (R.undead.test(n)) return 'undead';
  if (R.assassin.test(n)) return 'assassin';
  if (R.bow.test(n)) return 'bow';
  if (R.golem.test(n)) return 'golem';
  if (R.titan.test(n)) return 'titan';
  if (R.mage.test(n)) return 'mage';
  if (R.rider.test(n)) return 'rider';
  if (R.knight.test(n)) return 'knight';
  if (R.guard.test(n)) return 'guard';
  if (R.berserker.test(n)) return 'berserker';
  if (R.lord.test(n)) return 'lord';
  if (R.ranger.test(n)) return 'ranger';
  if (R.guard2.test(n)) return 'guard';
  if (R.soldier.test(n)) return 'soldier';
  return MONSTER_ARCHETYPE_FALLBACK;
}

/* 便捷入口：直接从 levels.js 的关卡对象取（自动读 `npc` 与 `boss` 字段）。
   ⚠️ `boss` 必须取 `lv.boss` 布尔字段，不要用 `lv.id.endsWith('-6')` 推断 ——
      虽然当前数据里 BOSS 恰好都在第 6 关，但那是**数据约定**不是**语义契约**。 */
function monsterArchetypeOfLevel(lv) {
  if (!lv) return MONSTER_ARCHETYPE_FALLBACK;
  return monsterArchetypeOf(lv.npc || lv.name, !!lv.boss);
}

/* ============ 图标渲染 ============ */
var MONSTER_ICON_DIR = 'media/monsters/';

/* 原型 id → 图标 URL；id 非法返回 null。 */
function monsterIconUrl(archetypeId) {
  if (!archetypeId || !MONSTER_ARCHETYPES[archetypeId]) return null;
  return MONSTER_ICON_DIR + archetypeId + '.svg';
}

/* 头像 <img>；archetypeId = 原型 id；size = 显示边长(px)；非法 id 返回 ''。
   ⚠️ `alt=""`（空）是**故意的**：所有接入点头像都紧邻可见的敌人名
      （关卡卡片 `.lv-name` / 对战界面 `.bc-name` / 敌群单位卡 `.gb-name`），
      属**装饰性图像**。若写 alt="暗龙"，读屏会念两遍「暗龙 暗龙」。
   ⚠️ `size` **必须是 16 的倍数**（16 / 32 / 48）：图标是 16×16 逻辑网格、1 格 = 3px，
      48px 显示时 1 格 = 3px。取 32 → 每格 2px（干净）；40 → 每格 2.5px，
      crispEdges 会把格宽硬切成 2 或 3px **粗细不均**。
      ⚠️ **24 不是 16 的倍数**（每格 1.5px）—— 曾经在这里写错过，别再填 24。
      同 petIconHtml 的口径。缺省 / 非法值回落 32（本项目实际接入尺寸）。 */
var MONSTER_ICON_SIZE_DEFAULT = 32;

function monsterIconHtml(archetypeId, size, cls) {
  var url = monsterIconUrl(archetypeId);
  if (!url) return '';
  /* 未传 / null / NaN → 回落默认值；否则 width="undefined" 会原样进 DOM。 */
  var px = (size == null || isNaN(size)) ? MONSTER_ICON_SIZE_DEFAULT : size;
  return '<img class="mon-ico' + (cls ? ' ' + cls : '') + '" src="' + url + '"'
    + ' width="' + px + '" height="' + px + '" alt=""'
    + ' loading="lazy" decoding="async">';
}

/* 一步到位：敌人名 → 头像 <img>。
   @param name 敌人名（可带前缀）
   @param boss 是否 BOSS
   @param size 显示边长（16 的倍数）
   @param cls  可选附加 class */
function monsterIconHtmlByName(name, boss, size, cls) {
  return monsterIconHtml(monsterArchetypeOf(name, boss), size, cls);
}

/* 一步到位：关卡对象 → 头像 <img>。 */
function monsterIconHtmlByLevel(lv, size, cls) {
  return monsterIconHtml(monsterArchetypeOfLevel(lv), size, cls);
}

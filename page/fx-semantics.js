/* ============================================================
   MyHealth — FX Semantics（v2.14.0 批次 C）
   「事件 → 演出语义」的**单一来源**。纯语义层：顶层不访问 DOM、不读 store、
   不依赖任何渲染函数；只需要 state-core.js 提供的 `listStatusDefs()`（**惰性**调用，
   故本文件可在 state-core.js 之后任意位置加载）。

   为什么需要它：
     批次 C 之前，群战（game-render.js 的 GB_FX_MARKS）与单敌（game-battle.js 的 BC_MARKS）
     **各自维护一份 14 行、内容几乎相同**的文案匹配表 —— 两份表独立演化必然漂移
     （改一处忘另一处 → 同一事件在两种模式里演出不一致）。现在两份表都不再存在，
     两模式只保留**各自的模式守卫**（群战只对 status|talent|terrain 出标记；单敌要求显式 targetSide）。

   三层查表（**绝不猜**）：
     ① `fxMarkForStatusId(statusId)` —— 引擎事件自带 statusId 时按 **id** 命中（稳定键，不随文案改动漂移）；
     ② `fxMarkForText(msg)`          —— 无 id 的技能/天赋/场地/Boss 文案兜底；
     ③ `fxMarkForEvent(ev)`          —— 统一入口：先 id 后文案，都匹配不到返回 null。

   id 闭集契约：`listStatusDefs()` 返回的**每个** id 要么在 `FX_MARK_FOR_STATUS_ID` 里有映射，
   要么在 `FX_EXCLUDED_STATUS_IDS` 里带理由排除 —— 由 `fxUnregisteredStatusIds()` 自检，
   scripts/test-fx-matrix.js 断言其恒为空（新增状态而忘了登记会立刻判红）。

   严重度分类 `fxSeverityForEvent()` 只给**层级**（routine / notable / major），
   **不含**任何时长/阈值 —— 生命期与聚合口径仍分别由 gbFxPolicy / battleFxPolicy 决定。
   ============================================================ */

/* ---------- ① id → 标记（闭集的一半） ----------
   取值口径与批次 C 之前的 14 行文案表**逐字一致**（同一状态在两种模式下必须同码）。
   ⚠️ 不在这里发明「濒死/血怒」之类本作不存在的状态：本作全仓没有「濒死」状态或阈值。 */
var FX_MARK_FOR_STATUS_ID = {
  poison: '☠️',        /* 中毒：每回合 DOT，文案 `☠️ 中毒: -N` */
  freeze: '❄️',        /* 冰冻：无法行动 + 受击解冻（wake 事件同码，语义仍是同一个状态） */
  flinch: '😵',        /* 畏缩：跳过 1 回合行动（`😵 畏缩: 无法行动`） */
  wet: '💧',           /* 潮湿：魂防降低 + 提高被命中率 */
  sleepy: '😴',        /* 哈欠：入睡判定（未生效同样出码，供玩家判断「这回合白哈了」） */
  charging: '⏳',      /* 蓄力：承伤增加 + 下回合高额伤害（含 `蓄力完成!`） */
  possessed: '👻',     /* 幽魂附身：技能不可用 + 每回合侵蚀 */
  doomed: '🌑',        /* 末日：无法治疗 / 技能禁用 / 每回合魂伤 */
  armorbroken: '💠',   /* 破甲：每层 -10% 防御 */
  lastworded: '💀',    /* 遗言诅咒：降攻 + 每回合掉血（`💀 遗言: -N`） */
  wideguard: '🛡️',    /* 广域防御：受到的伤害降低（与护盾同族，共用盾码） */
  warmight: '🩸',      /* 战意：吸血 / 技能吸血（与「技能吸血」文案同码） */
  sleep: '😴'          /* 睡眠：跳过行动 + 可能的睡眠回复（state-core.js 的内置状态） */
};

/* ---------- ① 的补集：显式排除清单（闭集的另一半） ----------
   **每条都必须写理由**。排除 = 「引擎不产生瞬时事件」或「已有更准确的载体」，
   而不是「懒得映射」：排除项永远返回 null（宁缺勿错，不造噪声）。 */
var FX_EXCLUDED_STATUS_IDS = {
  souldown: '纯属性修正（soulDef -15%），hooks 为空 → 引擎无瞬时事件；持续态由芯片常驻状态标记承担',
  slow: '纯属性修正（spd -3），hooks 为空 → 无瞬时事件；持续态由芯片常驻状态标记承担',
  weaken: '纯属性修正（atk/soulAtk -15%），hooks 为空 → 无瞬时事件；持续态由芯片常驻状态标记承担',
  vigil: '纯减伤修正（dmgTakenReduce），除修正外无事件 → 常驻状态标记承担',
  haste: '纯属性修正（spd，幅度由实例携带），hooks 为空 → 无瞬时事件；常驻状态标记承担',
  atkup: '纯增益（幅度由实例携带），hooks 为空 → 无瞬时事件；常驻状态标记承担',
  guardup: '纯增益（def/soulDef +10%/层），hooks 为空 → 无瞬时事件；常驻状态标记承担',
  confused: '行动替代类：结果由结算事件（误击 / 牺牲自我 / 丧失防备）各自带数值或文案表达，再单独出标记会与伤害飘字重复',
  confused_down: '纯属性修正（幅度由实例携带），hooks 为空 → 无瞬时事件；常驻状态标记承担',
  pulled: '纯属性修正（幅度由实例携带），hooks 为空 → 无瞬时事件；常驻状态标记承担',
  stolen: '纯增益（幅度由实例携带），hooks 为空 → 无瞬时事件；常驻状态标记承担'
};

/* ---------- ② 文案 → 标记（无 statusId 时的兜底） ----------
   前 14 行是批次 C 之前的**既有语义**，逐字保持（顺序也保持：先护盾类，再状态名类）；
   新增行分两处插入，理由见每行注释：
     · 「复合限定」行（护盾庇护的免疫 / 魔法镜）**必须排在状态名行之前** ——
       文案同时含「免疫」与状态名（如 `受护盾庇护，免疫【冰冻】`）时，更具体的「被盾挡下」
       才是这次事件的语义；放到后面会被 `/冰冻/` 抢先匹配成 ❄️。
     · Boss 机制行（怒意/铁壁/汲取）与遗言自牺牲行，均为无 statusId 的文案。 */
var FX_TEXT_MARKS = [
  /* —— 既有 14 行（批次 C 之前的两份表内容，逐字迁移，语义不变）—— */
  [/护盾吸收 (\d+)/, function (m, msg) { return '🛡️' + m[1] + (/护盾破碎/.test(msg) ? '💥' : '') }],
  [/护盾破碎/, function () { return '🛡️💥' }],
  /* —— 新增：复合限定（必须在状态名行之前，见上方说明）—— */
  [/受护盾庇护/, function () { return '🛡️' }],            /* `🛡️ B 受护盾庇护，免疫【冰冻】（剩余 30）` */
  [/魔法镜/, function () { return '🪞' }],                  /* `🪞 魔法镜：免疫` / `🪞 X 魔法镜反弹：【冰冻】→ A` */
  [/Boss 铁壁护盾/, function () { return '🛡️' }],           /* `🛡️ Boss 铁壁护盾, 吸收 N 伤害`（单敌 def 事件） */
  [/怒意增强/, function () { return '🔴' }],                /* `🔴 Boss 怒意增强, 攻击力 +N` */
  [/生命汲取/, function () { return '💚' }],                /* `💚 Boss 生命汲取, 恢复 N HP` */
  /* —— 既有 14 行续（状态名类）—— */
  [/破甲/, function () { return '💠' }],
  [/中毒|☠️/, function () { return '☠️' }],
  [/冰冻|❄️/, function () { return '❄️' }],
  [/受击解冻/, function () { return '❄️' }],                /* 无 statusId 的兜底（带 id 时走 ① freeze → ❄️，同码） */
  [/潮湿|变潮湿/, function () { return '💧' }],
  [/睡眠|哈欠|😴/, function () { return '😴' }],
  [/哈欠未生效/, function () { return '😴' }],              /* 无 statusId 的兜底（带 id 时走 ① sleepy → 😴，同码） */
  [/嘲讽/, function () { return '😡' }],
  [/净化|清除迷雾/, function () { return '✨' }],
  [/末日|🌑/, function () { return '🌑' }],
  [/幽魂附身|👻/, function () { return '👻' }],
  [/威吓|😱/, function () { return '😱' }],
  [/变小/, function () { return '🔻' }],
  [/蓄力/, function () { return '⏳' }],                    /* 同时覆盖 `蓄力完成!`（语义相同：蓄力态收尾） */
  /* —— 新增：遗言自牺牲（与 ① lastworded 的 💀 同码）—— */
  [/遗言：自我牺牲|自我牺牲阵亡/, function () { return '💀' }],
  [/💀 遗言:/, function () { return '💀' }]
];

/* 按 id 取标记；无映射（含显式排除项）返回 null —— **不猜、不回退文案** */
function fxMarkForStatusId(statusId) {
  if (!statusId) return null;
  var t = FX_MARK_FOR_STATUS_ID[String(statusId)];
  return t || null;
}

/* 按文案取标记；匹配不到返回 null */
function fxMarkForText(msg) {
  if (!msg) return null;
  var s = String(msg);
  for (var i = 0; i < FX_TEXT_MARKS.length; i++) {
    var m = FX_TEXT_MARKS[i][0].exec(s);
    if (m) return FX_TEXT_MARKS[i][1](m, s);
  }
  return null;
}

/* 统一入口：**先 id、后文案**；都匹配不到 → null（绝不按 type 或关键词猜） */
function fxMarkForEvent(ev) {
  if (!ev) return null;
  var byId = fxMarkForStatusId(ev.statusId);
  if (byId) return byId;
  return fxMarkForText(ev.msg);
}

/* 闭集自检：返回「既没映射、也没排除理由」的 status id 列表（应为空数组）。
   state-core.js 未加载（部分测试夹具只装子集）→ 返回 null（调用方按「无法判定」处理）。 */
function fxUnregisteredStatusIds() {
  if (typeof listStatusDefs !== 'function') return null;
  var ids = listStatusDefs();
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!FX_MARK_FOR_STATUS_ID[id] && !FX_EXCLUDED_STATUS_IDS[id]) out.push(id);
  }
  return out;
}

/* ---------- 严重度分类（只给层级，不含时长/阈值） ----------
   层级口径（冻结）：
     major   —— 击杀/阵亡、Boss 机制、战斗终局（不可逆或决定局势的结果）
     notable —— 治疗、护盾吸收/破碎、状态施加/刷新/净化/抵抗/结束（可读的关键结果）
     routine —— 普攻/技能伤害、小额 DOT、场地、跳过等常态事件
   ⚠️ 两模式**读取**它做演出取舍；生命期/聚合仍由各自的 policy 决定，不从这里取任何数字。 */
var FX_MAJOR_BOSS_RX = /Boss 怒意增强|Boss 铁壁护盾|Boss 生命汲取|怒意增强|铁壁护盾|生命汲取/;
var FX_MAJOR_END_RX = /战斗结束|讨伐成功|讨伐失败|🏆 胜利|💀 失败|异常中止/;
var FX_NOTABLE_RX = /治疗|恢复|吸血|护盾吸收|护盾破碎|受护盾庇护|免疫|魔法镜|施加|刷新|净化|抵抗|驱散|解冻|入睡|威吓|蓄力完成/;
var FX_MAJOR_KILL_RX = /击杀|阵亡|遗言：自我牺牲|自我牺牲阵亡/;

function fxSeverityForEvent(ev) {
  if (!ev) return 'routine';
  var t = String(ev.type || '');
  var m = String(ev.msg || '');
  if (t === 'kill' || ev.kill === true || ev.dead === true || FX_MAJOR_KILL_RX.test(m)) return 'major';
  if (FX_MAJOR_BOSS_RX.test(m)) return 'major';
  if (t === 'outcome' || t === 'final' || ev.final === true || FX_MAJOR_END_RX.test(m)) return 'major';
  if (t === 'heal' || t === 'shield' || t === 'buff' || t === 'wake' || t === 'expire' || t === 'block') return 'notable';
  if (t === 'status' || t === 'talent' || t === 'affix') return 'notable';
  if (FX_NOTABLE_RX.test(m)) return 'notable';
  return 'routine';
}

/* ---------- 击杀/阵亡的语义文本（两模式共用；模式各自决定挂到哪） ----------
   `ally` / `player` = 我方单位阵亡；其余（enemy / 敌群） = 敌方被击杀。
   两侧都必须**可辨**（不只是同一个 💀）：玩家要能一眼看出「谁没了」。 */
function fxKillMarkFor(side) {
  return (side === 'ally' || side === 'player') ? '💀 阵亡' : '💀 击杀';
}

/* ---------- HP 跨零检测（纯函数；引擎零改动） ----------
   群战：units 数组带 id → 按 id 记快照、按 id 比对。
   单敌：battle.player / battle.enemy 没有 id → 按 side 键比对（fxHpPairSnapshot / fxDetectSidedKills）。
   **只认 ≥1 → ≤0**（跨零），且要求「本步之前就在场」——
     · 事前已是 0（已阵亡）→ 不重复触发；
     · 快照里没有该 id（新召唤/未登记）→ 不判击杀（不凭结果猜）。 */
function fxHpSnapshot(units) {
  var out = {};
  if (!units || typeof units.length !== 'number') return out;
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (u && u.id != null && typeof u.hp === 'number') out[u.id] = u.hp;
  }
  return out;
}

function fxDetectKills(before, units) {
  var kills = [];
  if (!before || !units || typeof units.length !== 'number') return kills;
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (!u || u.id == null) continue;
    var b = before[u.id];
    if (typeof b !== 'number') continue;
    if (b >= 1 && typeof u.hp === 'number' && u.hp <= 0) {
      kills.push({ id: u.id, side: u.side || null, name: u.name || null, hpBefore: b, hp: u.hp });
    }
  }
  return kills;
}

function fxHpPairSnapshot(battle) {
  var out = {};
  if (!battle) return out;
  if (battle.player && typeof battle.player.hp === 'number') out.player = battle.player.hp;
  if (battle.enemy && typeof battle.enemy.hp === 'number') out.enemy = battle.enemy.hp;
  return out;
}

function fxDetectSidedKills(before, battle) {
  var out = [];
  if (!before || !battle) return out;
  var sides = ['player', 'enemy'];
  for (var i = 0; i < sides.length; i++) {
    var k = sides[i];
    var b = before[k];
    var u = battle[k];
    if (typeof b !== 'number' || !u || typeof u.hp !== 'number') continue;
    if (b >= 1 && u.hp <= 0) out.push({ side: k, hpBefore: b, hp: u.hp });
  }
  return out;
}

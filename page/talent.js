/* ============================================
   MyHealth — Enemy Talents (M2b-1)
   天赋注册表（**词条不在这里**，见 affix.js）。数据驱动：每个天赋 = hooks 集（对接 state-core 机制）。
   纯逻辑，无 DOM/store。依赖 state-core.js（defineStatus 可选）、unit.js。
   ============================================ */

var TALENTS = {};   // id → talent def

/* registerTalent({id, name, desc, hooks:{...}, statMods?})
   hooks 与 state-core 一致：onTurnStart/onTurnEnd/onBeforeAction/onAfterAction/onDamage/onHeal/onApply/onExpire
   statMods: {atk?,def?,spd?,soulAtk?,soulDef?,...} 静态百分比修正（战斗开始计算一次） */
function registerTalent(def) {
  if (!def || !def.id) throw new Error('registerTalent: id required');
  TALENTS[def.id] = def;
  return def;
}

function getTalent(id) { return TALENTS[id] || null; }

/* 根据天赋 id 列表生成一个 unit 的静态属性修正（statMods）
   返回 {atk,def,spd,soulAtk,soulDef,...} 绝对数值（基于 base 计算） */
function talentStatMods(talentIds, base) {
  var mods = {};
  (talentIds || []).forEach(function (id) {
    var t = TALENTS[id];
    if (!t) return;
    var sm = t.statMods;
    if (!sm) return;
    var result = (typeof sm === 'function') ? sm(base) : sm;   // 先求值成对象
    for (var k in result) {
      mods[k] = (mods[k] || 0) + result[k];
    }
  });
  return mods;
}

/* 把天赋挂到 unit 上：写入 unit._talents（id 列表）供 battle 调度 */
function attachTalents(unit, talentIds) {
  unit._talents = (talentIds || []).slice();
  unit._talentMods = talentStatMods(unit._talents, unit.base);
  return unit;
}

/* 读取天赋注册时声明的配置项（`config`）—— 天赋**固定数值**的唯一来源。
   v2.2.16（§5.4F 死配置清理）：此前 `config: { rounds: 2 }`（慢启动）/ `{ extra: 1, penalty: 0.7 }`
   （多目标）**写了没人读**，hook 里另写一份等价字面量（`unit._slowRounds || 2`、`(_multiExtra||1)+1`、
   `dmgReduce: 0.3`）—— 同一个数值两处写死，改注册值不生效、改 hook 又绕过了配置。
   现在 hook 一律从这里取值：**改 `config` 立即生效**（守卫见 scripts/test-talent-fixation.js）。
   WP-F 补充：**声明了 `range` 的键走成长（`talentValue` 优先区间）**，`config` 只服务无区间的固定值；
   `talentValue` 的兜底分支就是调用本函数，所以配置只有一个读口。 */
function talentConfig(id, key, dflt) {
  var t = TALENTS[id];
  if (t && t.config && t.config[key] != null) return t.config[key];
  return dflt;
}

/* 是否「自我削弱」天赋（标记写在天赋定义上的 `weak: true`）。
   v2.2.16（§5.4E）：敌群装配的**两个入口**都要排除它们 ——
     · group-levels.js 的 `TALENTS_LOW` 池（固化进关卡配置时的池子选择）；
     · enemy.js 的 `pickRandomTalents()` 兜底抽取（没传 talents 的调用点）。
   标记写在定义上，避免各处再抄一份 id 清单；`TALENTS_LOW` 与本标记的一致性有守卫断言。 */
function isWeakTalent(id) {
  var t = TALENTS[id];
  return !!(t && t.weak);
}

/* ============================================================
   WP-F（§5.4A 裁决「天赋接成长」）

   §5.1 对 14 条天赋的评审里，凡写了「**根据关卡与敌人级别**，数值为 X~Y」的，
   之前一律是固定值（只有利刃读 `unit.level`，且 50% 上限不可达）——
   本段把它们改成**按进度 t 在设计原文给定的区间内取值**。

   驱动源**不是另立一套**：与敌群技能（`page/skill.js` 的 `skillRangeT`）**同一套** ——
     · 敌群单位：t = (unit.level − 1) / 9，`unit.level` = **大关号**
       （`group-levels.js` 的 genEnemyCfg 给定：`level = clamp(lg, 1, 10)`）
       → g1 = t 0、g10 及以上 = t 1（§5.6-4 方案①「先暂定如此」）。
     · 宠物（若将来越界挂这些天赋）：仍走 skillRangeT 的**炼化**口径（稀有度上限 R50/SR60/SSR80/UR100），
       这里不重复实现。
   ⚠️ 加载顺序：本文件在 `page/index.html` 中**先于 `skill.js`**，且 `scripts/test-enemy.js` 的沙箱
      干脆不加载 skill.js → `skillRangeT` 缺席时按**同一公式**兜底。两者一致由
      `scripts/test-talent-growth.js` 断言守卫（同一 level 下两个函数必须给出同一个 t）。

   取值口径（与 `skill.js` 的 `skillValue` 一致）：`range: { key: [低, 高] }`，t=0 取下端、t=1 取上端，
   线性插值；百分比直接插值，**个数 / 回合数**这类整数按 `Math.round` 取整（同 skill.js 对 dur 的处理）。

   没有区间的（§5.1 未给 X~Y）**不接成长**，保持固定值：
     · `vigor` 强健（评审只写「加成无法被清除迷雾还原」= §5.6-2 的裁定，无 X~Y）
     · `magicmirror` 魔法镜（评审只写「受到敌人的指向性辅助类型技能时触发」）
     · `plain` 朴实（评审只写「包含双方」）
     · `vengeance` 复仇（§5.6-6 裁定「每层维持现状」+10%）
   ⚠️ `intimidate` 威吓的幅度（10%~50%）**本轮未接**：见该天赋定义处的受阻说明。
   ============================================================ */
var TALENT_LEVEL_MAX = 10;   // 与 skill.js 的 SKILL_LEVEL_MAX 同口径（两份一致有守卫断言）
function talentRangeT(unit) {
  if (typeof skillRangeT === 'function') return skillRangeT(unit);   // 唯一驱动源（敌群技能同款）
  /* 兜底（未加载 skill.js 的最小沙箱 / 加载顺序变化）：**同一公式**，不引入第二套映射 */
  var lv = Math.max(1, Math.min(TALENT_LEVEL_MAX, Math.floor((unit && unit.level) || 1)));
  return (lv - 1) / (TALENT_LEVEL_MAX - 1);
}
/* 按区间进度取天赋数值：range 优先（成长），其次 config（固定值），最后 dflt。
   ⚠️ 与 `talentConfig` 一样是「数值的唯一来源」出口 —— hook 里不许再写死字面量
   （守卫见 scripts/test-talent-fixation.js / scripts/test-talent-growth.js）。 */
function talentValue(id, key, unit, dflt) {
  var t = TALENTS[id];
  var r = (t && t.range) ? t.range[key] : null;
  if (r && r.length === 2) {
    var k = Math.max(0, Math.min(1, talentRangeT(unit)));
    return r[0] + (r[1] - r[0]) * k;
  }
  return talentConfig(id, key, dflt);   // 未声明区间 → 走固定值（配置的唯一读口仍是 talentConfig）
}

/* battle 在时机点调用：聚合所有天赋的指定 hook */
function talentDispatch(unit, hook, ctx) {
  var out = { skipAction: false, mutations: [], events: [] };
  ctx = ctx || {};
  (unit._talents || []).forEach(function (id) {
    var t = TALENTS[id];
    if (!t || !t.hooks || !t.hooks[hook]) return;
    var r = t.hooks[hook](unit, ctx);
    if (!r) return;
    if (r.skipAction) out.skipAction = true;
    if (r.mutations) out.mutations = out.mutations.concat(r.mutations);
    if (r.events) out.events = out.events.concat(r.events);
  });
  /* v2.1.25：本函数派发的是「单位被动」，包含两个**独立注册表** ——
     天赋 TALENTS（固有）+ 词条 AFFIXES（Boss/精英附加，见 affix.js）。
     词条原先被误注册进 TALENTS，现在拆开；因为调度口在这里合并，**所有调用点无需改动**。
     （8 条词条只用 onDamage / onTurnEnd / onAfterAction，全部经由本函数派发，
       所以 talentAura 不必再合并一遍。） */
  if (typeof affixDispatch === 'function') {
    var ar = affixDispatch(unit, hook, ctx);
    if (ar.skipAction) out.skipAction = true;
    out.mutations = out.mutations.concat(ar.mutations);
    out.events = out.events.concat(ar.events);
  }
  return out;
}

/* v2.1.15：能力变化归零（供「清除迷雾」使用）。
   grow_atk / grow_def / vengeance / flutter 这 4 个天赋是**直接改 unit.base** 的
   （每回合 +3% 攻击、+5% 防御、按损失血量提升攻击、每回合加一点速度），
   而设计文档的「清除迷雾：使全场能力变化变为 0」需要能把这些改动还原 ——
   所以这 4 个天赋都留了初始值快照。返回被还原的项名（供日志）。 */
function resetAbilityChanges(unit) {
  var back = [];
  if (!unit || !unit.base) return back;
  if (unit._growAtkBase != null) {
    unit.base.atk = unit._growAtkBase; unit._growAtkStacks = 0; unit._growAtkT = 0; back.push('攻击');
  }
  if (unit._growDefBase != null) {
    unit.base.def = unit._growDefBase; unit._growDefStacks = 0; unit._growDefT = 0; back.push('防御');
  }
  if (unit._vengeAtkBase != null) {
    unit.base.atk = unit._vengeAtkBase;
    unit.base.soulAtk = unit._vengeSoulBase || 0;
    unit._vengeStacks = 0; back.push('复仇加成');
  }
  if (unit._flutterBase != null) {
    unit.base.spd = unit._flutterBase; back.push('速度');
  }
  // 能力变化也包含命中/闪避修正（「变小」的常驻闪避、宠物「闪耀/打湿」的限时修正）
  if (unit._evaPerm || unit._eva || unit._accMod) {
    unit._evaPerm = 0; unit._eva = 0; unit._accMod = 0; unit._hitModTurns = 0;
    back.push('命中/闪避');
  }
  return back;
}

/* ============================================================
   v2.3.0 WP-D 逐条对齐说明（对照 doc/2.2-修改提案.md §5.1 的逐条评审）

   §5.1 对这 14 条的评审绝大多数写的是「根据关卡与敌人级别，数值为 X~Y」——
   那是**随大关/等级成长**的口径，按施工计划 §1.1 属 **WP-F（敌群天赋接成长）** 的范畴，
   连同 §5.4F 的死配置清理一起留给 WP-F。
   WP-D（施工计划 §6.4）只做「数值直接给、不走 t 成长」的那几条 + 死壳修复：

   WP-D 当时判定无改动（成长化留 WP-F）：blade / flutter / roughskin / vigor /
   magicshield / slowstart / lazy / multitarget / bloodthirst / regen
   WP-D 实际改动：magicmirror（补 `onBeforeSupport` 派发点）/ plain（作用面边界）/
   intimidate（持续回合 5~10 随机 + 先到者解除）/ vengeance（每层间隔 25%→20%）

   ===== WP-F（§5.4A「天赋接成长」）落地状态（本段收口）=====
   ✅ **已接成长**（区间见各定义上的 `range`，t 由 `talentRangeT` 给出）：
     blade（10%~50%）· flutter（5%~20%）· roughskin（10%~50%）· magicshield（15%~45%）·
     slowstart（2~4 回合）· lazy（减伤 20%~40%）· multitarget（降伤 20%~30% + 额外 1~2 个）·
     bloodthirst（10%~35%）· regen（每 2~3 回合 + 回复 3%~8%）·
     **intimidate（幅度 10%~50%，v2.2.22 解封 —— 见该定义处的单位级落地说明）**
   ⏸ **判定不接成长**（§5.1 未给区间，不发明数值）：
     vigor（评审只重申「加成无法被清除迷雾还原」）· magicmirror / plain（评审只说作用面）·
     vengeance（§5.6-6：每层维持现状 +10%）
   ============================================================ */

/* --- 天赋注册（14 条） --- */

/* 利刃：攻击造成伤害提升 10%-50%
   WP-F（§5.1.1 评审「根据关卡与敌人级别，数值为10%~50%」+ §5.4D「根据最新文档处理」）：
   改前是 `0.10 + level×0.005`（lv1 = 10.5% … lv10 = 15%），§5.1.1 的 🔴「50% 上限不可达」。
   现按 t 在 **[10%, 50%]** 内取值：g1 = 10% … g10 及以上 = 50%。 */
registerTalent({
  id: 'blade',
  name: '利刃',
  desc: '攻击造成伤害提升（10%-50%，随关卡与敌人级别成长）',
  range: { boost: [0.10, 0.50] },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) {
        return { mutations: [{ key: 'dmgBoost', value: talentValue('blade', 'boost', unit, 0.10) }] };
      }
    }
  }
});

/* 振翅：每回合结束，按速度初始值增加一定比例速度
   WP-F（§5.1.2 评审「根据关卡与敌人级别，每回合速度提升5%~20%（至少+1）」）：
   改前固定 5%（§5.1.2 标注「比例 5% 与不设上限均为源码自定，设计未给比例」）。
   现按 t 在 [5%, 20%] 内取值；「至少 +1」与「无上限」两条既有口径不动（`_flutterBase` 快照供清除迷雾还原）。 */
registerTalent({
  id: 'flutter',
  name: '振翅',
  desc: '每回合结束，根据速度初始值增加一定比例的速度（5%-20%，随关卡与敌人级别成长）',
  range: { pct: [0.05, 0.20] },
  hooks: {
    onTurnEnd: function (unit) {
      // v2.1.15：留下快照，供「清除迷雾」的能力变化归零还原
      if (unit._flutterBase == null) unit._flutterBase = unit.base.spd || 0;
      var baseSpd = unit._flutterBase;
      var inc = Math.max(1, Math.floor(baseSpd * talentValue('flutter', 'pct', unit, 0.05)));
      unit.base.spd += inc;
      return { events: [{ type: 'talent', talentId: 'flutter', unitId: unit.id, msg: '振翅: 速度 +' + inc }] };
    }
  }
});

/* 粗糙皮肤：受普通攻击时反伤（无视防御）
   WP-F（§5.1.3 评审「根据关卡与敌人级别，反伤比例为10%~50%」）：改前固定 15%（源码自定）。
   现按 t 在 [10%, 50%] 内取值；「下限 1」「无视防御」两条既有口径不动
   （v2.1.15 修过「受击方吃双倍伤害」的同源缺陷，行为正确，别改）。 */
registerTalent({
  id: 'roughskin',
  name: '粗糙皮肤',
  desc: '受到普通攻击时给予攻击者一定比例伤害（无视防御；10%-50%，随关卡与敌人级别成长）',
  range: { pct: [0.10, 0.50] },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.attacker && ctx.isPhysical) {
        var dmg = Math.max(1, Math.floor(ctx.amount * talentValue('roughskin', 'pct', unit, 0.15)));
        return { mutations: [{ key: 'reflectFlat', value: dmg }] };
      }
    }
  }
});

/* 强健：攻击·防御·魂攻击·魂防御提升一定比例
   ⏸ WP-F 判定**不接成长**：§5.1.4 的评审栏只写了「强健的加成无法被清除迷雾还原」
   （那是 §5.6-2 的裁定，与成长无关），**设计原文未给 X~Y 区间** → 按任务口径**不发明数值**，
   维持 +15%（「比例 15% 为源码自定，设计未给比例」仍成立，属未决项）。 */
registerTalent({
  id: 'vigor',
  name: '强健',
  desc: '自身攻击·防御·魂攻击·魂防御提升一定比例',
  statMods: function (base) {
    return {
      atk: Math.floor(base.atk * 0.15),
      def: Math.floor(base.def * 0.15),
      soulAtk: Math.floor((base.soulAtk || 0) * 0.15),
      soulDef: Math.floor((base.soulDef || 0) * 0.15)
    };
  }
});

/* 魔法镜：受到**敌方指向的辅助类型技能**时，有几率免疫那次效果并反弹给施加者。
   ⚠️ v2.3.0（§5.1.5 / §5.6-3）：本天赋此前是**死壳** —— `onBeforeSupport` 全项目没有派发点、
   `reflectSupport` mutation 无消费者，「免疫」与「反弹」两项从未生效。
   现由 `battle-group.js` 的 `castSkill` 在辅助技能对**每个目标**生效前派发
   （见那里的 `mirrorBlocked` 计算），且**只在「对手指向本单位」的辅助技能**上触发 ——
   队友给的增益/治疗不算（评审：受到**敌人**的指向性辅助类型技能时触发）。
   反弹语义（§5.6-3）：**只反弹负面/减益类辅助**；治疗/增益类**仅免疫、不反弹**
      （否则等于反过来给敌方回血 / 加攻）。反射由 `castSkill` 消费 `reflectSupport` 时执行。
   ⏸ WP-F 判定**不接成长**：§5.1.5 的评审只写作用面（「受到敌人的指向性辅助类型技能时触发」），
     未给几率区间 → 30% 固定不发明。 */
registerTalent({
  id: 'magicmirror',
  name: '魔法镜',
  desc: '受到敌方指向性辅助技能时有几率免疫；负面/减益类额外反弹给施加者',
  hooks: {
    onBeforeSupport: function (unit, ctx) {
      if (ctx.targeted && ctx.support) {
        var chance = 0.3;
        if (battleRnd() < chance) {
          return {
            skipAction: true,
            mutations: [{ key: 'reflectSupport', value: ctx.sourceId || null }],
            events: [{ type: 'talent', talentId: 'magicmirror', unitId: unit.id, msg: '🪞 魔法镜: ' + (unit.name || '单位') + ' 免疫并反弹' }]
          };
        }
      }
    }
  }
});

/* 朴实：自身的能力（攻击/防御/魂攻/魂防/速度…）无法被任何增益或减益影响。
   v2.3.0（§5.6-1 + 施工计划 §6.4）作用面边界裁决：
     · 只挡**直接影响属性**的增益/减益 —— 判据 = 状态定义里的 `statMods` / `statModsPct`，
       或本次施加实例自带的 `modsPct`；
     · **不**直接改属性的照常生效：中毒/灼烧这类只扣血的，冰冻/睡眠/末日这类控制与禁技，
       以及「造成伤害提升/降低」这类伤害修正，一律不受影响；
     · 同一效果**既有增减益又有附加效果**时，只挡能力部分、附加部分照常生效
       —— 由状态定义上的 `extraEffect` 标记识别（现仅 `lastworded`：降攻魂攻 + 每回合掉血），
       命中时返回 `stripStatMods`，由 castSkill 以 `noStatMods` 落库（属性部分被剥掉、状态照挂）。
   ⏸ WP-F 判定**不接成长**：§5.1.6 的评审只写作用面（「包含双方」，后经 §5.5-1 / §5.6-1 收边界），
      本条无论值可调 → 无区间可接。 */
registerTalent({
  id: 'plain',
  name: '朴实',
  desc: '自身的能力无法被任何增益/减益影响（不直接改属性的效果照常生效）',
  hooks: {
    onBeforeStatus: function (unit, ctx) {
      ctx = ctx || {};
      var def = (typeof getStatusDef === 'function') ? getStatusDef(ctx.statusId) : null;
      var direct = false;
      if (def) {
        if (def.statMods && Object.keys(def.statMods).length) direct = true;
        if (def.statModsPct && Object.keys(def.statModsPct).length) direct = true;
      }
      if (ctx.modsPct && Object.keys(ctx.modsPct).length) direct = true;
      if (!direct) return;   // 不直接改属性 → 照常生效
      if (def && def.extraEffect) {
        return {
          mutations: [{ key: 'stripStatMods', value: true }],
          events: [{ type: 'talent', talentId: 'plain', unitId: unit.id, msg: '朴实: 免疫能力变化（附加效果照常）' }]
        };
      }
      return { skipAction: true, events: [{ type: 'talent', talentId: 'plain', unitId: unit.id, msg: '朴实: 免疫能力变化' }] };
    }
  }
});

/* 威吓：战斗开始时恐吓敌方随机 1 名，攻击力大幅降低。
   v2.1.14：削减幅度常量在此，battle-group.js 直接读，避免两处各写一个魔法数。
   v2.3.0（§5.1.7 评审 + §5.6-5）：解除条件由「仅施加者 <50% 血」扩为**先到者解除** ——
   ① 施加者血量 <50%，或 ② 持续回合数（**开场随机 5~10 回合**）走完。
   v2.2.22（§5.1.7 评审「根据关卡与敌人级别，降低10%~50%」—— 上批受阻项解封）：
   幅度改为**单位级**：本 hook 按区间 `range.atkDown [0.10, 0.50]` 取值（t 随大关号，同其余 9 条
   接成长的天赋口径），写进**被威吓单位**的 `_intimidateDown`；`battle-group.js` 的两个消费点
   （普攻 normalAttack / 技能 castSkill 伤害通道）改读该字段，缺失时才回落到本文件的全局兜底
   常量 `INTIMIDATE_ATK_DOWN`（0.4 —— 旧口径，保留作向后兼容）。
   · UI 文案（`game-render.js` 的单位卡徽标与详情行）同步改为读 `_intimidateDown`，不再写死「攻-40%」。 */
var INTIMIDATE_ATK_DOWN = 0.4;  // 兜底默认值：单位级 `_intimidateDown` 缺失时才使用（旧口径）
var INTIMIDATE_TURN_MIN = 5;    // §5.6-5：持续 5~10 回合**随机**
var INTIMIDATE_TURN_MAX = 10;
registerTalent({
  id: 'intimidate',
  name: '威吓',
  desc: '战斗开始时，恐吓敌方随机1名，攻击力大幅降低（10%~50%，随关卡与敌人级别；持续 5~10 回合，或施加者血量<50%）',
  range: { atkDown: [0.10, 0.50] },   // §5.1.7「降低10%~50%」
  hooks: {
    onBattleStart: function (unit, ctx) {
      var enemies = (ctx && ctx.enemyUnits) || [];
      if (!enemies.length) return;
      var target = enemies[Math.floor(battleRnd() * enemies.length)];
      var turns = INTIMIDATE_TURN_MIN + Math.floor(battleRnd() * (INTIMIDATE_TURN_MAX - INTIMIDATE_TURN_MIN + 1));
      // 幅度唯一出口：区间 → config → 兜底常量（hook 里不写死字面量）
      var down = talentValue('intimidate', 'atkDown', unit, INTIMIDATE_ATK_DOWN);
      unit._intimidateTurns = turns;
      target._intimidated = true;
      target._intimidateBy = unit.name || '威吓者';
      target._intimidateDown = down;   // 单位级：被威吓者身上携带本次幅度（battle-group 消费）
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
        targetId: target.id,
        msg: '😱 威吓：' + (unit.name || '单位') + ' → ' + target.name + ' 攻击 -' + Math.round(down * 100) + '%（持续 5~10 回合随机：本次 ' + turns + ' 回合，或施加者血量 <50%）' }] };
    },
    onTurnStart: function (unit, ctx) {
      var turn = (ctx && ctx.turn) || 0;
      var lowHp = unit.hp < unit.base.hp * 0.5;
      var expired = (unit._intimidateTurns != null) && turn > unit._intimidateTurns;
      if (!lowHp && !expired) return;
      // 解除（v2.1.14：解除时补一条日志，此前静默失效，玩家无从察觉；v2.3.0 补上解除原因）
      var freed = [];
      ((ctx && ctx.enemyUnits) || []).forEach(function (e) {
        // v2.2.22：解除时一并清掉单位级幅度，避免残留字段被后续路径误读
        if (e._intimidated) { e._intimidated = false; e._intimidateBy = ''; e._intimidateDown = undefined; freed.push(e.name); }
      });
      if (!freed.length) return;
      var why = lowHp ? '血量低于 50%' : ('持续 ' + unit._intimidateTurns + ' 回合已到');
      return { events: [{ type: 'talent', talentId: 'intimidate', unitId: unit.id,
        msg: '😤 威吓解除：' + (unit.name || '单位') + ' ' + why + '，' + freed.join('、') + ' 攻击恢复' }] };
    }
  }
});

/* 魔法盾：受到魂攻击伤害降低
   WP-C（§5.4F 死配置清理的最后一项，本批收口）：数值的唯一来源仍在这里，
   消费端已改读 `m.value`（`dmg = Math.floor(dmg * (1 - m.value))`，不再硬编码 ×0.7）；
   同时补上**真正的消费通道** —— 本 hook 的判据是 `ctx.isSoul`，而旧实现只在普攻的
   **物理**分支读该 mutation（既不传 isSoul、值是硬编码）→ 该天赋此前一次都没生效。
   现在 battle-group 的**魂攻伤害**结算前按 `isSoul` 派发受击方天赋并只取 soulDmgReduce。

   WP-F（§5.1.8 评审「根据关卡与敌人级别，降低15%~45%」）：改前固定 30%（生产端常量）。
   现按 t 在 **[15%, 45%]** 内取值 —— 因为消费端读的是 mutation 的 `m.value`（单一来源），
   这里换区间即可生效，**无需动 battle-group.js**（对比威吓：那边读全局常量，故受阻）。
   行为守卫：scripts/test-talent-growth.js 断言「同一场战斗里 level 1 与 level 10 的盾兵挨同一记魂攻，掉血不同」。 */
registerTalent({
  id: 'magicshield',
  name: '魔法盾',
  desc: '自身受到魂攻击伤害降低（15%-45%，随关卡与敌人级别成长）',
  range: { reduce: [0.15, 0.45] },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isSoul) {
        return { mutations: [{ key: 'soulDmgReduce', value: talentValue('magicshield', 'reduce', unit, 0.3) }] };
      }
    }
  }
});

/* 慢启动：战斗开始前 x 回合无法行动
   v2.2.16（§5.4F 死配置清理）：`x` 的**唯一来源** = 本天赋的定义（当时是 `config.rounds`）。
   此前 hook 写死 `ctx.turn <= (unit._slowRounds || 2)`，而 `_slowRounds` **全项目无写入点**、
   `config.rounds` 又没人读 —— 同一个 2 两处写死（写死的那处还是死字段）。现两处合一。

   v2.3.0 **作者裁决：以设计原文为准 —— 设定 x 回合就真的 x 回合**（修一处「差 1」）。
   根因：`battle-group.js` 的 `groupUnitTurn` 传的是 `ctx.turn = gb.turn + 1`（**实际回合号 + 1**，
   首回合 = 2），而旧实现拿这个值直接比 `rounds` → `rounds: N` 实际只跳过 **N−1** 个回合
   （实测 rounds=1/2/3/4 → 跳过 0/1/2/3 次），与设计文案「前 x 回合无法行动」差 1。
   修法：按**实际回合号**判定 —— 群战链路由 `groupUnitTurn` 另传 `ctx.actualTurn = gb.turn`；
   直接派发（测试 / 工具 / 未来新入口）时按既有约定反推 `ctx.turn − 1`。
   ⚠️ 只改本天赋，**不动 `ctx.turn` 本身** —— 它同时被 regen / grow_atk / grow_def / doom_call /
      玩家技能回合钩子消费，改全局口径会一次改动多条无关数值。

   WP-F（§5.1.9 评审「根据关卡与敌人级别，需要2~4回合启动时间，boss不会获得」）：
   `x` 从固定 2 改为按 t 在 **[2, 4]** 内取整（`Math.round`）→ g1~g3 = 2、g4~g7 = 3、g8 起 = 4。
   数值仍只来自本定义（`range.rounds`），hook 不写死 —— 单源性质由 test-talent-fixation.js 守住。
   行为守卫：scripts/test-talent-fixation.js（hook 层 + 端到端「真打一场数跳过回合」）。 */
registerTalent({
  id: 'slowstart',
  name: '慢启动',
  desc: '战斗开始的前 x 回合（2~4，随关卡与敌人级别成长），自身无法行动',
  range: { rounds: [2, 4] },
  weak: true,   // §5.4E：自我削弱天赋 —— **Boss** 不抽（group-levels.js 池子 + enemy.js 兜底抽取）；v2.3.0：精英/普通怪恢复可抽
  hooks: {
    onBeforeAction: function (unit, ctx) {
      var rounds = Math.round(talentValue('slowstart', 'rounds', unit, 2));
      /* ctx.actualTurn = 实际回合号（群战链路显式传入）；
         没有时退回「ctx.turn − 1」（既有约定：ctx.turn = 实际回合号 + 1）。 */
      var actualTurn = (ctx.actualTurn != null) ? ctx.actualTurn : ((ctx.turn || 0) - 1);
      if (actualTurn <= rounds) {
        return { skipAction: true, events: [{ type: 'talent', talentId: 'slowstart', unitId: unit.id, msg: '慢启动: 无法行动' }] };
      }
    }
  }
});

/* 懒惰：每回合开始 25% 放弃行动，放弃回合受伤害降低
   WP-F（§5.1.10 评审「根据关卡与敌人级别，每回合开始有 25% 几率放弃行动；
   放弃行动回合自身受到伤害降低 20%~40%」）：**25% 是固定值**（设计原文写死 25%），
   只有减伤幅度接成长 → 按 t 在 [20%, 40%] 内取值（改前固定 30%）。 */
registerTalent({
  id: 'lazy',
  name: '懒惰',
  desc: '每回合开始有25%几率放弃行动，放弃行动回合自身受到伤害降低（20%-40%，随关卡与敌人级别成长）',
  range: { dmgReduce: [0.20, 0.40] },
  weak: true,   // §5.4E：自我削弱天赋 —— Boss / 精英不抽（同 slowstart）
  hooks: {
    onBeforeAction: function (unit) {
      if (battleRnd() < 0.25) {
        unit._lazySkip = true;
        return { skipAction: true, events: [{ type: 'talent', talentId: 'lazy', unitId: unit.id, msg: '懒惰: 放弃行动' }] };
      }
      unit._lazySkip = false;
    },
    onDamage: function (unit, ctx) {
      if (unit._lazySkip) {
        return { mutations: [{ key: 'dmgReduce', value: talentValue('lazy', 'dmgReduce', unit, 0.30) }] };
      }
    }
  }
});

/* 多目标：普通攻击伤害降低，可额外攻击 x 个敌人
   v2.2.16（§5.4F 死配置清理）：伤害惩罚与额外目标数的**唯一来源** = 本天赋的定义。
   此前 `config: { extra: 1, penalty: 0.7 }` **两项都没人读**，hook 里另写死 `dmgReduce: 0.3`
   与 `(_multiExtra || 1) + 1`（`_multiExtra` 全项目无写入点）—— 值恰好等价，但改配置不生效。

   WP-F（§5.1.11 评审「自身普通攻击造成伤害降低20%~30%，普通攻击可以额外攻击 1~2 个敌人」）：
   两项都接成长 → 改前固定「降 30% + 额外 1 个」现在是区间：
     · `penalty`（= 伤害**乘数**，消费端语义 `伤害 × penalty`）= 降幅 20%~30% 的补数 → **[0.8, 0.7]**
     · `extra`（= **额外**目标数，消费端 `targets.slice(0, value)` 要的是**总目标数**，故 +1）
       → **[1, 2]**，按 `Math.round` 取整（g6 起 = 额外 2 个）。 */
registerTalent({
  id: 'multitarget',
  name: '多目标',
  desc: '普通攻击造成伤害降低（20%~30%，随关卡与敌人级别成长），可额外攻击（1~2 个，同样成长）个敌人',
  range: { extra: [1, 2], penalty: [0.8, 0.7] },
  hooks: {
    onDamage: function (unit, ctx) {
      if (ctx.isPlayerAttack) {
        /* 普攻伤害 = 原值 × range.penalty；消费端（battle-group.js）读到的 dmgReduce 语义是「乘 (1 − v)」 */
        return { mutations: [{ key: 'dmgReduce', value: 1 - talentValue('multitarget', 'penalty', unit, 0.7) }] };
      }
    },
    onBeforeAction: function (unit, ctx) {
      /* ⚠️ 消费端 `battle-group.js` 取 `targets.slice(0, value)` → 值必须是**总目标数**：
         = 额外目标数（range.extra）+ 1（原目标）。 */
      return { mutations: [{ key: 'multiTarget', value: Math.round(talentValue('multitarget', 'extra', unit, 1)) + 1 }] };
    }
  }
});

/* 嗜血：造成伤害时恢复本次伤害一定比例生命
   WP-F（§5.1.12 评审「根据关卡与敌人级别，自身造成伤害时，恢复本次伤害10%~35%的生命值」）：
   改前固定 20%（源码自定）→ 现按 t 在 [10%, 35%] 内取值；上限仍为自身 maxHP（既有口径不动）。 */
registerTalent({
  id: 'bloodthirst',
  name: '嗜血',
  desc: '自身造成伤害时，恢复本次伤害一定比例的生命值（10%-35%，随关卡与敌人级别成长）',
  range: { heal: [0.10, 0.35] },
  hooks: {
    onAfterDamage: function (unit, ctx) {
      if (ctx.dealt > 0) {
        var heal = Math.floor(ctx.dealt * talentValue('bloodthirst', 'heal', unit, 0.2));
        unit.hp = Math.min(unit.base.hp, unit.hp + heal);
        return { events: [{ type: 'talent', talentId: 'bloodthirst', unitId: unit.id, msg: '嗜血: 恢复 ' + heal }] };
      }
    }
  }
});

/* 复仇：生命值每降低一定比例，攻击与魂攻击提升
   v2.3.0（§5.1.13 评审 + §5.6-6）：**每层间隔由 25% 生命改为 20%**；每层 +10% 维持现状。
   ⏸ WP-F 判定**不接成长**：§5.6-6 已明确「每层维持现状」（+10%），且 §5.1.13 的评审只改了间隔
   （「每损失 20% 生命」）—— **未给幅度区间** → 不发明数值。 */
registerTalent({
  id: 'vengeance',
  name: '复仇',
  desc: '自身生命值每降低 20%，攻击力与魂攻击提升（每层 +10%）',
  hooks: {
    onTurnStart: function (unit) {
      var lost = 1 - (unit.hp / unit.base.hp);
      /* v2.3.0：间隔 20%（评审「每损失 20% 生命」）。+1e-9 抵消浮点误差
         （hp = 0.8×base.hp 时 lost 会算出 0.19999999999999996，直接 floor 会少一层）。 */
      var stacks = Math.floor(lost / 0.20 + 1e-9);
      if (stacks > (unit._vengeStacks || 0)) {
        /* v2.1.15：改为「按快照重算」，而不是「在当前值上再叠一次」。
           原实现在已经提升过的 base 上再乘一次，随层数复利放大
           （1.1 × 1.2 × 1.3 = 1.716 倍，而设计意图是 1 + 0.1×3 = 1.3 倍）；
           顺带留下快照，让「清除迷雾」的能力变化归零能还原它。 */
        if (unit._vengeAtkBase == null) {
          unit._vengeAtkBase = unit.base.atk;
          unit._vengeSoulBase = unit.base.soulAtk || 0;
        }
        unit._vengeStacks = stacks;
        unit.base.atk = Math.floor(unit._vengeAtkBase * (1 + 0.1 * stacks));
        unit.base.soulAtk = Math.floor(unit._vengeSoulBase * (1 + 0.1 * stacks));
        return { events: [{ type: 'talent', talentId: 'vengeance', unitId: unit.id, msg: '复仇: 攻击提升 x' + stacks }] };
      }
    }
  }
});

/* 再生：每 2-3 回合恢复最大生命值一定比例
   WP-F（§5.1.14 评审「根据关卡与敌人级别，每经过 2-3 回合，恢复自身最大生命值3%~8%的生命值」）：
   两项都接成长（改前固定「每 3 回合回 8%」）：
     · 回复比例 `heal` **[3%, 8%]**（百分比直接插值）
     · **周期 `interval` [2, 3]** —— 设计只写「每经过2-3回合」（此前被列为「口径不明确」），
       这里按**同一套成长口径**明确化（区间两端 = 低等级 → 满级，同 skill.js 对 dur 的取整方式）：
       g1~g5 = 每 2 回合、g6 起 = 每 3 回合（`Math.round(2 + t)`）。
       ⚠️ 方向说明：周期变长本身是「更弱」，但比例同时从 3% 升到 8% —— 折算成**每回合**回复量是
          3%/2 = 1.5% → 8%/3 ≈ 2.67%，**净效果仍随成长变强**（故与「区间下限=低级」的读法自洽）。
       ⚠️ **备选口径（未采用，留待裁决）**：周期「每次随机 2~3 回合」——与 §5.6-5 威吓 5~10 的
          「随机」同型；若作者要这个，本处改 1 行（`2 + (battleRnd() < 0.5 ? 0 : 1)`）即可，
          且周期就不再随成长。两条读法的差别只在**触发节奏**，回复比例都是 3%~8% 接成长。
   回合口径沿用既有 `ctx.turn`（= 实际回合号 + 1，见 battle-group 的 groupUnitTurn 说明）——
   slowstart 用 `ctx.actualTurn` 是为了修「差 1」的旧账，regen 历史上没有该问题，不跟着动。 */
registerTalent({
  id: 'regen',
  name: '再生',
  desc: '每经过2-3回合（随关卡与敌人级别成长），恢复自身最大生命值3%-8%（同样成长）',
  range: { heal: [0.03, 0.08], interval: [2, 3] },
  hooks: {
    onTurnEnd: function (unit, ctx) {
      var turn = ctx.turn || 0;
      var interval = Math.round(talentValue('regen', 'interval', unit, 3));
      if (turn >= interval && turn % interval === 0) {
        var heal = Math.floor(unit.base.hp * talentValue('regen', 'heal', unit, 0.08));
        unit.hp = Math.min(unit.base.hp, unit.hp + heal);
        return { events: [{ type: 'talent', talentId: 'regen', unitId: unit.id, msg: '再生: 恢复 ' + heal }] };
      }
    }
  }
});

/* ============================================================
   v2.1.25：**词条已从本文件移出**。
   原先 cut_boss / cut_elite / aoe_guard / skill_guard / grow_atk / grow_def /
   doom_call / extra_act 这 8 条被注册进 TALENTS —— 但它们其实是「词条」（Affix）：
   天赋是生物**固有**被动，词条是 Boss/精英**额外附加**的强化维度。
   设计依据 doc/2.0 敌群设计.md:248/251（「额外 Boss 词条」「沿用现有词条系统」「独立维度」）。
   现全部迁到 **page/affix.js** 的 AFFIXES 注册表，钩子实现一字未改（纯结构性拆分，数值不变）。
   ============================================================ */

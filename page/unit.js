/* ============================================
   MyHealth — Unit Model (M2a S1-D)
   纯数据 Unit 结构 + 工厂 + 查询。无 DOM/store 依赖。
   battle.js 的私有适配器负责把现有输入（玩家快照/敌方配置）转成 Unit spec。
   ============================================ */

/* createUnit({id, side, name, level, base, skills?, tags?}) → Unit
   - base: {hp, atk, def, spd, soulAtk?, soulDef?} 基础属性
   - hp 初始化为 base.hp；statuses 空数组
   - speed 合成：base.spd（默认 0，速度属性 M2b 启用） */
function createUnit(spec) {
  spec = spec || {};
  var base = spec.base || {};
  return {
    id: spec.id || ('unit-' + Math.floor(Math.random() * 1e6)),
    side: spec.side || 'ally',           // 'ally' | 'enemy'
    name: spec.name || 'Unit',
    level: spec.level || 1,
    base: {
      hp: base.hp || 100,
      atk: base.atk || 1,
      def: base.def || 1,
      spd: base.spd || 0,                // 速度（M2b 行动队列排序用）
      soulAtk: base.soulAtk || 0,
      soulDef: base.soulDef || 0
    },
    hp: (base.hp || 100),                // 战斗内可变
    statuses: [],                        // state-core 挂载点
    skills: spec.skills || [],           // 技能 ID（M1 挂钩后才有内容）
    tags: spec.tags || [],               // boss/elite/词条 id 等标签
    counters: {}                         // 战斗内计数器（连击/蓄力，M2b+ 扩展）
  };
}

/* 纯查询 */
function isAlive(u) { return !!u && u.hp > 0; }

function aliveUnits(units) {
  return (units || []).filter(function (u) { return isAlive(u); });
}

function unitsOfSide(units, side) {
  return (units || []).filter(function (u) { return u.side === side; });
}

function findUnit(units, id) {
  for (var i = 0; i < (units || []).length; i++) {
    if (units[i].id === id) return units[i];
  }
  return null;
}

/* 有效速度（含状态修正聚合；state-core 的 statMods 挂进来） */
function effectiveSpeed(u) {
  if (!u) return 0;
  var spd = u.base.spd || 0;
  if (u._statMods && u._statMods.spd) spd += u._statMods.spd;
  return spd;
}

/* 有效属性（state-core 修正聚合后，battle 结算用） */
function effectiveStat(u, key) {
  if (!u) return 0;
  var v = u.base[key] || 0;
  if (u._statMods && u._statMods[key]) v += u._statMods[key];
  return Math.max(0, v);
}

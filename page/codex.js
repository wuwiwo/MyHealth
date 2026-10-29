/* ============================================
   MyHealth — Codex（图鉴）v2.14.3
   作者需求：「可以查看技能、天赋、宠物介绍」。

   三个分栏（全部只读，数据一律来自既有定义，本文件**不新增、不修改任何数值**）：
     🐾 宠物 —— 头像(pet-ui.js 的 petIconHtml) / 名字 / 稀有度 / 基础属性 / 天赋 / 技能
     ⚡ 技能 —— 玩家技能(skills.js) + 宠物技能(pet-codex.js) + 敌群技能(skill.js · SKILL_DOCS)
     ✨ 天赋 —— 敌群天赋(talent.js) + 宠物专属天赋(pet-codex.js 的 petOnly)

   ⚠️ 数据来源是**唯一事实来源**，本文件只做三件事：读定义 → 拼文案 → 渲染 HTML 串。
      · 数量不写死：分栏条目数一律由 listPetCodex() / listPlayerSkills() / SKILL_DOCS /
        getSkill() / TALENTS 的键**现场派生**（守卫见 scripts/test-codex.js）。
      · 数值不写死也不抄文案：技能/天赋的「数值行」由定义字段（range / power / cooldown /
        flags / effect(maxLevel)）**自动推导**；区间按「下限~上限」原样展示。
        「效果说明」才使用既有文案（SKILL_DOCS.desc / 玩家技能 desc / 天赋 desc）。
        两者若不一致，以**数值行（定义）**为准 —— 已知差异登记在提交报告里，未擅自改数。
      · 一律 typeof 守卫：缺模块（如最小测试沙箱）时降级为可选内容，不抛错、不留裂图。

   ⚠️ 只读：本文件**不碰** store / pet-store / localStorage / sync。
      图鉴只讲「定义」，不读也不写任何存档。

   ⚠️ UI 约定（doc/HANDOFF.md §4.3 / doc/design-tokens-v2.1.md）：
      · 字号只许 var(--fs-*)；颜色只许 var(--*)，不写裸字号 / 裸色值。
      · 触控目标用既有 .speed-btn / .car-type（min-height:var(--touch-min) = 44px）。
      · 宠物头像**只用 16 的倍数**（评审结论）：卡片头部 48、技能图标 32。
      · 复用 index.css 既有组件（.panel-inner / .car-type / .empty / .fi / .section-hdr），
        新增样式集中为 index.css 末尾的 .codex-* 区块。
   ============================================ */

/* ============ UI 状态（模块级，**不进存档**；与 _gameTab / _petRowOpen 同类做法） ============ */
var _codexTab = 'pets';          // 'pets' | 'skills' | 'talents'
var _codexQuery = '';            // 搜索词（原样保存，输入框回显）
var _codexSkillType = 'all';     // all | passive | support | attack
var _codexSkillSrc = 'all';      // all | player | pet | enemy
var _codexPetRarity = 'all';     // all | R | SR | SSR | UR（选项由数据派生）
var _codexTalentSrc = 'all';     // all | enemy | pet
var _codexSearchTimer = null;

/* ============ 展示文案表（只放中文标签，不放数值） ============ */
var CODEX_SRC_LABELS = { player: '玩家', pet: '宠物', enemy: '敌群' };
var CODEX_TYPE_LABELS = { passive: '被动', support: '辅助', attack: '攻击' };

/* 技能目标：优先复用 game-render.js 的 _SKILL_TARGET_NAMES（同源，避免两套文案），
   它没覆盖的 ally2 / enemy2 / enemy12 由本表补齐。 */
var CODEX_TARGET_LABELS = {
  random1: '随机 1 名敌人', all: '全体', self: '自身', ally1: '1 名友方', ally2: '随机 2 名友方',
  enemy1: '1 名敌人', enemy2: '最多 2 名敌人', enemy12: '随机 1~2 名敌人'
};

/* 技能 range 参数：label + 单位换算方式
   kind: 'pct'  = 数值本来就是百分数（25 → 25%）
         'frac' = 数值是小数（0.25 → 25%）
         'turn' = 回合 / 次数这类整数 */
var CODEX_SKILL_PARAMS = {
  power:         { label: '威力',        kind: 'pct' },
  acc:           { label: '命中率降低',  kind: 'pct' },
  hit:           { label: '被命中提升',  kind: 'pct' },
  soulDefDown:   { label: '魂防降低',    kind: 'pct' },
  atkDown:       { label: '攻击降低',    kind: 'pct' },
  defDown:       { label: '防御降低',    kind: 'pct' },
  sleepChance:   { label: '睡眠几率',    kind: 'pct' },
  freezeChance:  { label: '冰冻几率',    kind: 'pct' },
  lifesteal:     { label: '吸血',        kind: 'pct' },
  skillLifesteal:{ label: '技能吸血',    kind: 'pct' },
  atkBoost:      { label: '攻击提升',    kind: 'frac' },
  dmgReduce:     { label: '受到伤害降低', kind: 'frac' },
  healSoul:      { label: '治疗（魂攻倍率）', kind: 'frac' },
  healHp:        { label: '治疗（目标生命）', kind: 'frac' },
  dur:           { label: '持续',        kind: 'turn' },
  turns:         { label: '回合数',      kind: 'turn' },
  confuseDown:   { label: '丧失防备',    kind: 'frac' },
  confuseHit:    { label: '误击同伴',    kind: 'frac' },
  confuseSelf:   { label: '牺牲自我',    kind: 'frac' }
};

/* 天赋 range 参数：天赋侧一律用小数（见 talent.js 的 range 定义），
   与技能侧「atkDown 用百分数」的单位口径不同 —— 故**分表**，不共用一张。 */
var CODEX_TALENT_PARAMS = {
  boost:      { label: '增伤',        kind: 'frac' },
  pct:        { label: '比例',        kind: 'frac' },
  reduce:     { label: '减伤',        kind: 'frac' },
  heal:       { label: '回复',        kind: 'frac' },
  atkDown:    { label: '攻击降低',    kind: 'frac' },
  dmgReduce:  { label: '受到伤害降低', kind: 'frac' },
  penalty:    { label: '普攻伤害乘数', kind: 'mul' },
  extra:      { label: '额外目标',    kind: 'count' },
  rounds:     { label: '回合数',      kind: 'turn' },
  interval:   { label: '触发间隔',    kind: 'turn' }
};

/* 玩家技能 effect(maxLevel) 的键 → 中文标签（只放标签，数值仍来自 effect()） */
var CODEX_EFFECT_LABELS = {
  chance: '几率', critMult: '暴击倍率', healPct: '回复', power: '威力', targets: '目标数',
  cd: '冷却', reduce: '格挡减伤', passiveReduce: '常驻减伤', perfectChance: '完美格挡几率',
  perfectMin: '完美格挡减伤下限', perfectMax: '完美格挡减伤上限', atkBoost: '攻击提升',
  dur: '持续', lock: '触发锁', freeze: '冰冻', ignoreSoulDef: '无视魂防',
  shieldPct: '护盾', reflectPct: '破盾反伤', tauntDur: '嘲讽', soulDefDown: '魂防降低',
  spdPct: '速度提升', extraMult: '额外一击伤害', everyTurns: '间隔回合'
};
/* 这些键的值是「比例」→ 展示成百分数 */
var CODEX_EFFECT_PCT = {
  chance: 1, healPct: 1, reduce: 1, passiveReduce: 1, perfectChance: 1, perfectMin: 1,
  perfectMax: 1, atkBoost: 1, shieldPct: 1, reflectPct: 1, soulDefDown: 1, spdPct: 1,
  power: 1, extraMult: 1
};

/* ============ 通用小工具 ============ */
function codexEsc(s) {
  var v = (s == null) ? '' : String(s);
  if (typeof escHtml === 'function') return escHtml(v);   // 同源转义（只挡 & < >）
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* 属性值（含双引号）转义 —— 搜索框回显等写进 attribute 的地方用它 */
function codexAttr(s) {
  return codexEsc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* 数字去掉浮点尾巴：0.30000000000000004 → 0.3；2 → 2 */
function codexTrimNum(v) {
  var n = Number(v);
  if (!isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100);
}
/* 小数 → 百分数（0.075 → 7.5%） */
function codexFmtFrac(v) {
  var n = Number(v);
  if (!isFinite(n)) return '—';
  return codexTrimNum(n * 100) + '%';
}
/* 百分数原值（25 → 25%） */
function codexFmtPct(v) { return codexTrimNum(v) + '%'; }

function codexRangeText(lo, hi, kind) {
  var a = lo, b = hi, tail = '';
  if (kind === 'frac') { a = codexFmtFrac(lo); b = codexFmtFrac(hi); }
  else if (kind === 'mul') { a = '×' + codexFmtFrac(lo); b = '×' + codexFmtFrac(hi); }
  else if (kind === 'turn') { a = codexTrimNum(lo); b = codexTrimNum(hi); tail = ' 回合'; }
  else if (kind === 'count') { a = codexTrimNum(lo); b = codexTrimNum(hi); tail = ' 个'; }
  else { a = codexFmtPct(lo); b = codexFmtPct(hi); }
  return a + '~' + b + tail;
}
function codexStatusName(id) {
  if (typeof getStatusDef === 'function') {
    var d = getStatusDef(id);
    if (d && d.name) return d.name;
  }
  return String(id);
}
/* 类型短标签：任务口径是「被动 / 辅助 / 攻击」，与筛选 chip 的文案保持同一套；
   未收录的类型退回 game-render.js 的 _SKILL_TYPE_NAMES，再退回原值。 */
function codexTypeLabel(t) {
  if (CODEX_TYPE_LABELS[t]) return CODEX_TYPE_LABELS[t];
  if (typeof _SKILL_TYPE_NAMES !== 'undefined' && _SKILL_TYPE_NAMES && _SKILL_TYPE_NAMES[t]) {
    return _SKILL_TYPE_NAMES[t];
  }
  return String(t || '—');
}
function codexTargetLabel(t) {
  if (typeof _SKILL_TARGET_NAMES !== 'undefined' && _SKILL_TARGET_NAMES && _SKILL_TARGET_NAMES[t]) {
    return _SKILL_TARGET_NAMES[t];
  }
  return CODEX_TARGET_LABELS[t] || String(t || '—');
}

/* ============ 数据派生（纯函数，无 DOM / 无存档） ============ */
function codexPetIds() {
  if (typeof listPetCodex === 'function') return listPetCodex();
  return (typeof PET_CODEX !== 'undefined' && PET_CODEX) ? Object.keys(PET_CODEX) : [];
}
function codexPetIdsOrdered() {
  var out = [];
  codexPetIds().forEach(function (id) { if (id) out.push(id); });
  return out;
}
/* 宠物技能 id 集合（含「坚强岩复用敌群技能 fortify」这类共用技能） */
function codexPetSkillIds() {
  var seen = {};
  codexPetIdsOrdered().forEach(function (id) {
    var c = (typeof getPetCodex === 'function') ? getPetCodex(id) : null;
    ((c && c.skills) || []).forEach(function (s) { seen[s] = 1; });
  });
  return Object.keys(seen);
}
/* 敌群技能 id 集合：SKILL_DOCS 的键就是「有完整文案的敌群技能」全表（skill.js 共 25 条）。
   它同时包含与宠物共用的 fortify —— 共用技能在两边各显示一条（来源徽标不同）。 */
function codexEnemySkillIds() {
  if (typeof SKILL_DOCS !== 'undefined' && SKILL_DOCS) return Object.keys(SKILL_DOCS);
  var pet = {};
  codexPetSkillIds().forEach(function (id) { pet[id] = 1; });
  if (typeof SKILLS === 'undefined' || !SKILLS) return [];
  return Object.keys(SKILLS).filter(function (id) { return !pet[id]; });
}
/* 敌群技能的既有文案（skill.js 的 SKILL_DOCS）；缺模块时返回空串，调用方自行降级 */
function codexSkillDoc(id) {
  if (typeof SKILL_DOCS === 'undefined' || !SKILL_DOCS || !SKILL_DOCS[id]) return '';
  return SKILL_DOCS[id].desc || '';
}
/* 宠物/敌群技能定义的「数值行」—— 全部字段来自定义本身 */
function codexSkillParamLine(def) {
  if (!def) return '';
  var parts = [codexTargetLabel(def.target)];
  var r = def.range || {};
  if (def.type === 'attack') {
    var rp = r.power || null;
    var pw = rp ? (codexFmtPct(rp[0]) + '~' + codexFmtPct(rp[1])) : codexFmtPct(def.power || 0);
    parts.push((def.dmgType === 'soul' ? '魂攻' : '攻击') + '×' + pw);
  } else {
    parts.push('无直接伤害');
  }
  for (var k in r) {
    var v = r[k];
    if (!v || v.length !== 2) continue;
    var meta = CODEX_SKILL_PARAMS[k];
    var label = meta ? meta.label : k;
    var kind = meta ? meta.kind : 'pct';
    if (k === 'power') {
      if (def.type === 'attack') continue;      // 攻击类威力已在前一段展示
      label = '效果倍率';                        // 辅助类的 power = 治疗/效果倍率
    }
    parts.push(label + ' ' + codexRangeText(v[0], v[1], kind));
  }
  var flags = [];
  if (def.multiHit) flags.push(def.multiHit + ' 段（目标随机可重复）');
  if (def.bounce) {
    var fc = def.bounce.foeChance || [];
    flags.push('全场弹射 ' + (def.bounce.times || 3) + ' 次（每次 +' + codexFmtFrac(def.bounce.dmgUp || 0)
      + '，敌方概率 ' + codexFmtFrac(fc[0] || 0) + '→' + codexFmtFrac(fc[1] || 0) + '）；未发动次数转为自身回血');
  }
  if (def.charge) flags.push('蓄力 1 回合、下回合释放');
  if (def.condBonus) {
    var sts = (def.condBonus.statuses || []).map(codexStatusName).join('/');
    flags.push('目标处于' + sts + '时伤害 +' + codexFmtFrac(def.condBonus.value || 0));
  }
  if (def.recoil) flags.push('自身反冲 ' + codexFmtFrac(def.recoil) + '（按本次实际造成的伤害）');
  if (def.wounded) flags.push('只挑未满血的友方');
  if (def.asNormalAttack) flags.push('视为普通攻击（命中/暴击/格挡走普攻通道）');
  if (def.stackPower) flags.push('叠层：每次发动 +' + codexTrimNum(def.stackPower.perPoints) + ' 点威力');
  if (def.procBoost) {
    flags.push(codexFmtFrac(def.procBoost.chance) + ' 几率本次伤害 +' + codexFmtFrac(def.procBoost.value));
  }
  if (def.ignoreDef) flags.push('无视防御');
  if (def.ignoreSoulDef) flags.push('无视魂防');
  var tail = 'CD ' + codexTrimNum(def.cooldown || 0);
  if (def.startCooldown) tail += '（开场即进入 ' + def.startCooldown + ' 回合冷却）';
  if (def.priority) tail += ' · 先制度 +' + codexTrimNum(def.priority);
  parts.push(tail);
  if (flags.length) parts.push(flags.join('；'));
  return parts.join(' · ');
}
/* 玩家技能满级数值：直接调 effect(maxLevel)，不抄 desc 里的数字 */
function codexPlayerEffectValue(k, v) {
  if (v === true) return '是';
  if (v === false) return '否';
  if (typeof v === 'number') {
    if (k === 'critMult') return codexTrimNum(v) + '×';
    if (k === 'dur' || k === 'tauntDur' || k === 'lock' || k === 'freeze') return codexTrimNum(v) + ' 回合';
    if (CODEX_EFFECT_PCT[k]) return codexFmtFrac(v);
    return codexTrimNum(v);
  }
  return String(v);
}
function codexPlayerEffectLine(s) {
  if (!s || typeof s.effect !== 'function') return '';
  var eff = s.effect(s.maxLevel) || {};
  var parts = [];
  for (var k in eff) {
    parts.push((CODEX_EFFECT_LABELS[k] || k) + ' ' + codexPlayerEffectValue(k, eff[k]));
  }
  return parts.join(' · ');
}
function codexPlayerDesc(s) {
  if (!s) return '';
  if (typeof fillPlayerSkillDesc === 'function') return fillPlayerSkillDesc(s, s.maxLevel);
  return String(s.desc || '').replace(/n/g, String(s.maxLevel));
}
/* 天赋的「数值行」：区间 / 固定属性修正 / 结算时点，全部由定义字段推导 */
function codexTalentValueLine(t) {
  if (!t) return '';
  var parts = [];
  if (t.range) {
    for (var k in t.range) {
      var v = t.range[k];
      if (!v || v.length !== 2) continue;
      var meta = CODEX_TALENT_PARAMS[k] || { label: k, kind: 'frac' };
      parts.push(meta.label + ' ' + codexRangeText(v[0], v[1], meta.kind));
    }
    if (parts.length) parts.push('区间按大关号 1~10 线性取值（t=0 下端 / t=1 上端）');
  }
  if (!parts.length && t.statMods) parts.push('固定属性修正（不接成长）');
  if (t.phase) parts.push('在「' + (t.phase === 'prepare' ? '准备' : t.phase) + '」阶段结算');
  return parts.join(' · ');
}
/* 宠物专属天赋的适用对象：反查哪些宠物带着它 */
function codexPetsWithTalent(talentId) {
  var out = [];
  codexPetIdsOrdered().forEach(function (id) {
    var c = (typeof getPetCodex === 'function') ? getPetCodex(id) : null;
    if (c && (c.talents || []).indexOf(talentId) > -1) out.push(c.name || id);
  });
  return out;
}
function codexSkillRef(id) {
  var def = (typeof getSkill === 'function') ? getSkill(id) : null;
  return {
    id: id,
    name: (def && def.name) || String(id),
    line: def ? codexSkillParamLine(def) : ''
  };
}
function codexTalentRef(id) {
  var t = (typeof getTalent === 'function') ? getTalent(id) : null;
  return { id: id, name: (t && t.name) || String(id), desc: (t && t.desc) || '' };
}

/* ---- 分栏 1：宠物 ---- */
function codexPetEntries() {
  var out = [];
  codexPetIdsOrdered().forEach(function (id) {
    var c = (typeof getPetCodex === 'function') ? getPetCodex(id) : null;
    if (!c) return;
    out.push({
      kind: 'pet',
      id: id,
      name: c.name || id,
      rarity: c.rarity || '—',
      role: c.role || '',
      base: c.base || {},
      talents: (c.talents || []).map(codexTalentRef),
      skills: (c.skills || []).map(codexSkillRef),
      /* 头像尺寸：只用 16 的倍数（评审结论）。48 = 每格 3px，最清晰。
         缺图标时 petIconHtml 返回 ''，卡片退回 🐾 —— 不裂图。 */
      icon: (typeof petIconHtml === 'function') ? petIconHtml(id, 48, 'codex-pet-ico') : ''
    });
  });
  return out;
}

/* ---- 分栏 2：技能（玩家 + 宠物 + 敌群） ---- */
function codexSkillEntries() {
  var out = [];
  var i, s, def;
  var playerIds = (typeof listPlayerSkills === 'function') ? listPlayerSkills()
    : ((typeof PLAYER_SKILLS !== 'undefined' && PLAYER_SKILLS) ? Object.keys(PLAYER_SKILLS) : []);
  for (i = 0; i < playerIds.length; i++) {
    s = (typeof getPlayerSkill === 'function') ? getPlayerSkill(playerIds[i]) : null;
    if (!s) continue;
    out.push({
      kind: 'skill', key: 'player:' + s.id, id: s.id, src: 'player', name: s.name,
      type: s.type, typeLabel: codexTypeLabel(s.type),
      levelLabel: '满级 Lv' + s.maxLevel,
      nums: codexPlayerEffectLine(s),
      desc: codexPlayerDesc(s),
      extra: (typeof s.petEffect === 'function') ? ('宠物档（装配后上场宠物共享）：' + (function () {
        var pe = s.petEffect(s.maxLevel) || {}, ps = [];
        for (var k in pe) ps.push((CODEX_EFFECT_LABELS[k] || k) + ' ' + codexPlayerEffectValue(k, pe[k]));
        return ps.join(' · ');
      })()) : '',
      icon: (typeof skillIconHtml === 'function') ? skillIconHtml(s.id, 32, 'codex-skill-ico', true) : ''
    });
  }
  var petIds = codexPetSkillIds();
  for (i = 0; i < petIds.length; i++) {
    def = (typeof getSkill === 'function') ? getSkill(petIds[i]) : null;
    if (!def) continue;
    var petLine = codexSkillParamLine(def);
    out.push({
      kind: 'skill', key: 'pet:' + def.id, id: def.id, src: 'pet', name: def.name,
      type: def.type, typeLabel: codexTypeLabel(def.type),
      levelLabel: (def.range && Object.keys(def.range).length) ? '区间随炼化等级成长（R50 / SR60 / SSR80 / UR100）' : '固定值',
      nums: petLine,
      desc: codexSkillDoc(def.id) || petLine,
      extra: '',
      icon: (typeof skillIconHtml === 'function') ? skillIconHtml(def.id, 32, 'codex-skill-ico', false) : ''
    });
  }
  var enemyIds = codexEnemySkillIds();
  for (i = 0; i < enemyIds.length; i++) {
    def = (typeof getSkill === 'function') ? getSkill(enemyIds[i]) : null;
    if (!def) continue;
    var enemyLine = codexSkillParamLine(def);
    out.push({
      kind: 'skill', key: 'enemy:' + def.id, id: def.id, src: 'enemy', name: def.name,
      type: def.type, typeLabel: codexTypeLabel(def.type),
      levelLabel: (def.range && Object.keys(def.range).length) ? '区间随大关号成长（1~10）' : '固定值',
      nums: enemyLine,
      desc: codexSkillDoc(def.id) || enemyLine,
      extra: '',
      icon: (typeof skillIconHtml === 'function') ? skillIconHtml(def.id, 32, 'codex-skill-ico', false) : ''
    });
  }
  return out;
}

/* ---- 分栏 3：天赋（敌群 + 宠物专属） ---- */
function codexTalentEntries() {
  var out = [];
  if (typeof TALENTS === 'undefined' || !TALENTS) return out;
  var ids = Object.keys(TALENTS);
  ids.forEach(function (id) {
    var t = TALENTS[id];
    if (!t) return;
    var isPet = !!t.petOnly;
    var owners = isPet ? codexPetsWithTalent(id) : [];
    var appliesTo = isPet
      ? (owners.length ? (owners.join('、') + '（固有专属，不可跨宠物解锁）') : '宠物专属（当前无宠物携带）')
      : ('敌群单位 · 普通 / 精英 / Boss 均可抽取' + (t.weak ? '；但「Boss 不抽」（自我削弱型）' : ''));
    out.push({
      kind: 'talent',
      key: (isPet ? 'pet:' : 'enemy:') + id,
      id: id,
      src: isPet ? 'pet' : 'enemy',
      name: t.name || id,
      desc: t.desc || '',
      nums: codexTalentValueLine(t),
      appliesTo: appliesTo,
      weak: !!t.weak
    });
  });
  /* 敌群在前、宠物专属在后（与分栏标题的顺序一致），各自保持定义顺序 */
  out.sort(function (a, b) {
    if (a.src === b.src) return 0;
    return a.src === 'enemy' ? -1 : 1;
  });
  return out;
}

/* ---- 分栏总量（派生，不写死） ---- */
function codexCounts() {
  return {
    pets: codexPetIdsOrdered().length,
    skills: codexSkillEntries().length,
    talents: (typeof TALENTS !== 'undefined' && TALENTS) ? Object.keys(TALENTS).length : 0
  };
}

/* ---- 过滤 + 搜索 ---- */
function codexMatchText(e, q) {
  var hay = [e.name, e.desc, e.nums, e.typeLabel, e.levelLabel, e.extra, e.appliesTo,
    e.rarity, e.role, (e.skills || []).map(function (s) { return s.name + ' ' + s.line; }).join(' '),
    (e.talents || []).map(function (t) { return t.name + ' ' + t.desc; }).join(' ')
  ].join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}
function codexEntries(tab) {
  tab = tab || _codexTab;
  var q = String(_codexQuery || '').trim().toLowerCase();
  var list;
  if (tab === 'skills') {
    list = codexSkillEntries().filter(function (e) {
      if (_codexSkillType !== 'all' && e.type !== _codexSkillType) return false;
      if (_codexSkillSrc !== 'all' && e.src !== _codexSkillSrc) return false;
      return true;
    });
  } else if (tab === 'talents') {
    list = codexTalentEntries().filter(function (e) {
      if (_codexTalentSrc !== 'all' && e.src !== _codexTalentSrc) return false;
      return true;
    });
  } else {
    list = codexPetEntries().filter(function (e) {
      if (_codexPetRarity !== 'all' && e.rarity !== _codexPetRarity) return false;
      return true;
    });
  }
  if (q) list = list.filter(function (e) { return codexMatchText(e, q); });
  return list;
}

/* ---- 筛选选项（稀有度由数据派生，不写死 R/SR/SSR/UR 顺序） ---- */
function codexRarityOptions() {
  var seen = {}, out = [['all', '全部稀有度']];
  codexPetIdsOrdered().forEach(function (id) {
    var c = (typeof getPetCodex === 'function') ? getPetCodex(id) : null;
    var r = c && c.rarity;
    if (r && !seen[r]) { seen[r] = 1; out.push([r, r]); }
  });
  return out;
}
function codexChipRow(label, opts, attr, cur) {
  var h = '<div class="codex-filter" role="group" aria-label="' + codexAttr(label) + '">'
    + '<span class="codex-filter-lbl">' + codexEsc(label) + '</span>';
  opts.forEach(function (o) {
    var sel = (o[0] === cur);
    h += '<button type="button" class="car-type codex-chip' + (sel ? ' selected' : '') + '" '
      + attr + '="' + codexAttr(o[0]) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">'
      + codexEsc(o[1]) + '</button>';
  });
  return h + '</div>';
}
function codexFiltersHtml() {
  if (_codexTab === 'skills') {
    return codexChipRow('类型', [['all', '全部类型'], ['passive', '被动'], ['support', '辅助'], ['attack', '攻击']],
      'data-codex-type', _codexSkillType)
      + codexChipRow('来源', [['all', '全部来源'], ['player', '玩家'], ['pet', '宠物'], ['enemy', '敌群']],
        'data-codex-src', _codexSkillSrc);
  }
  if (_codexTab === 'talents') {
    return codexChipRow('来源', [['all', '全部来源'], ['enemy', '敌群天赋'], ['pet', '宠物专属']],
      'data-codex-tsrc', _codexTalentSrc);
  }
  return codexChipRow('稀有度', codexRarityOptions(), 'data-codex-rarity', _codexPetRarity);
}

/* ---- 计数行 ---- */
function codexCountText() {
  var total = codexCounts();
  var totalKey = _codexTab === 'skills' ? 'skills' : (_codexTab === 'talents' ? 'talents' : 'pets');
  var list = codexEntries(_codexTab);
  var unit = _codexTab === 'skills' ? '条' : (_codexTab === 'talents' ? '条' : '只');
  var h = '筛选后 <b>' + list.length + '</b> / 共 ' + total[totalKey] + ' ' + unit;
  if (_codexTab === 'skills') {
    var bySrc = { player: 0, pet: 0, enemy: 0 };
    list.forEach(function (e) { bySrc[e.src] = (bySrc[e.src] || 0) + 1; });
    var bits = [];
    ['player', 'pet', 'enemy'].forEach(function (k) {
      if (bySrc[k]) bits.push(CODEX_SRC_LABELS[k] + ' ' + bySrc[k]);
    });
    if (bits.length) h += ' · ' + bits.join(' · ');
  }
  return h;
}

/* ---- 卡片渲染 ---- */
var CODEX_STAT_ROWS = [
  ['hp', '生命'], ['atk', '攻击'], ['def', '防御'],
  ['soulAtk', '魂攻'], ['soulDef', '魂防'], ['spd', '速度']
];
function codexPetCardHtml(p) {
  var h = '<div class="codex-card">'
    + '<div class="codex-card-hd">'
    + (p.icon || '<span class="codex-pet-ico-fallback" aria-hidden="true">🐾</span>')
    + '<span class="codex-name">' + codexEsc(p.name) + '</span>'
    + '<span class="codex-badge codex-badge-rarity">' + codexEsc(p.rarity) + '</span>'
    + (p.role ? '<span class="codex-badge">' + codexEsc(p.role) + '</span>' : '')
    + '</div>';
  h += '<div class="codex-stats">';
  CODEX_STAT_ROWS.forEach(function (r) {
    var v = p.base[r[0]];
    h += '<span class="codex-stat"><span class="codex-k">' + codexEsc(r[1]) + '</span> '
      + codexEsc(v == null ? '—' : codexTrimNum(v)) + '</span>';
  });
  h += '</div>';
  h += '<div class="codex-line"><span class="codex-k">✨ 天赋</span> ';
  if (p.talents.length) {
    h += p.talents.map(function (t) {
      return '<b>' + codexEsc(t.name) + '</b>' + (t.desc ? '（' + codexEsc(t.desc) + '）' : '');
    }).join('、');
  } else {
    h += '<span class="codex-dim">无（R / SR 级宠物不带专属天赋）</span>';
  }
  h += '</div>';
  h += '<div class="codex-line"><span class="codex-k">⚡ 技能</span>';
  p.skills.forEach(function (s) {
    h += '<div class="codex-skill-row"><b>' + codexEsc(s.name) + '</b>'
      + (s.line ? ' — ' + codexEsc(s.line) : '') + '</div>';
  });
  h += '</div>';
  return h + '</div>';
}
function codexSkillCardHtml(e) {
  var h = '<div class="codex-card">'
    + '<div class="codex-card-hd">'
    + (e.icon || '')
    + '<span class="codex-name">' + codexEsc(e.name) + '</span>'
    + '<span class="codex-badge">' + codexEsc(e.typeLabel) + '</span>'
    + '<span class="codex-badge codex-src-' + codexEsc(e.src) + '">' + codexEsc(CODEX_SRC_LABELS[e.src] || e.src) + '</span>'
    + '</div>';
  if (e.nums) h += '<div class="codex-num">📐 ' + codexEsc(e.nums) + '</div>';
  if (e.levelLabel) h += '<div class="codex-sub">🎚️ ' + codexEsc(e.levelLabel) + '</div>';
  /* 宠物技能没有 SKILL_DOCS 文案 → desc 就是数值行本身，不重复渲染两遍 */
  if (e.desc && e.desc !== e.nums) h += '<div class="codex-desc">' + codexEsc(e.desc) + '</div>';
  if (e.extra) h += '<div class="codex-sub">🐾 ' + codexEsc(e.extra) + '</div>';
  return h + '</div>';
}
function codexTalentCardHtml(e) {
  var h = '<div class="codex-card">'
    + '<div class="codex-card-hd">'
    + '<span class="codex-name">' + codexEsc(e.name) + '</span>'
    + '<span class="codex-badge codex-src-' + codexEsc(e.src) + '">'
    + (e.src === 'pet' ? '宠物专属' : '敌群') + '</span>'
    + '</div>';
  if (e.desc) h += '<div class="codex-desc">' + codexEsc(e.desc) + '</div>';
  if (e.nums) h += '<div class="codex-num">📐 ' + codexEsc(e.nums) + '</div>';
  if (e.appliesTo) h += '<div class="codex-sub">🎯 适用对象：' + codexEsc(e.appliesTo) + '</div>';
  return h + '</div>';
}
function codexNoteHtml() {
  if (_codexTab === 'skills') {
    return '<div class="codex-note">📌 数值行（📐）由技能定义自动推导：区间 = 下限~上限（宠物按炼化等级、敌群按大关号成长）；'
      + '「效果说明」为既有文案。两者若不一致，以数值行为准。</div>';
  }
  if (_codexTab === 'talents') {
    return '<div class="codex-note">📌 数值行（📐）由天赋定义自动推导：区间按大关号 1~10 线性取值（t=0 取下端、t=1 取上端）。'
      + '宠物专属天赋为固有天赋，不可跨宠物解锁或装配。</div>';
  }
  return '<div class="codex-note">📌 头像与名称来自宠物图鉴（page/pet-codex.js）；技能/天赋说明与战斗实现同源，本页只读。</div>';
}
function codexListHtml() {
  var list = codexEntries(_codexTab);
  var h = codexNoteHtml();
  if (!list.length) {
    return h + '<div class="empty"><span class="empty-e">🔍</span><div class="empty-t">没有匹配的条目</div></div>';
  }
  list.forEach(function (e) {
    if (e.kind === 'pet') h += codexPetCardHtml(e);
    else if (e.kind === 'talent') h += codexTalentCardHtml(e);
    else h += codexSkillCardHtml(e);
  });
  return h;
}

/* ---- 面板骨架 ---- */
function codexTabBtnHtml(tab, label, count) {
  var on = (_codexTab === tab);
  return '<button type="button" class="tab-btn codex-tab' + (on ? ' active' : '') + '" role="tab"'
    + ' data-codex-tab="' + tab + '" aria-selected="' + (on ? 'true' : 'false') + '">'
    + label + ' <span class="codex-tab-n">' + count + '</span></button>';
}
function codexShellHtml() {
  var c = codexCounts();
  var h = '<div class="panel-inner">';
  h += '<div class="codex-hdr">'
    + '<button class="speed-btn" id="codexClose" aria-label="关闭图鉴" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:var(--fs-base)">✕</button>'
    + '<span class="codex-title">📖 图鉴</span>'
    + '<span class="codex-hint">只读 · 内容来自既有定义</span>'
    + '</div>';
  h += '<nav class="codex-tabs" role="tablist" aria-label="图鉴分类">'
    + codexTabBtnHtml('pets', '🐾 宠物', c.pets)
    + codexTabBtnHtml('skills', '⚡ 技能', c.skills)
    + codexTabBtnHtml('talents', '✨ 天赋', c.talents)
    + '</nav>';
  h += '<input class="fi codex-search" id="codexSearch" type="search" autocomplete="off"'
    + ' aria-label="按名称搜索图鉴" placeholder="🔍 搜索名称 / 关键词" value="' + codexAttr(_codexQuery) + '">';
  h += '<div class="codex-filters" id="codexFilters">' + codexFiltersHtml() + '</div>';
  h += '<div class="codex-count" id="codexCount">' + codexCountText() + '</div>';
  h += '<div id="codexList">' + codexListHtml() + '</div>';
  return h + '</div>';
}

/* ---- 局部刷新（搜索/筛选走这里：不重建输入框，焦点与光标不丢） ---- */
function codexRefreshList() {
  var f = document.getElementById('codexFilters');
  if (f) f.innerHTML = codexFiltersHtml();
  var cnt = document.getElementById('codexCount');
  if (cnt) cnt.innerHTML = codexCountText();
  var box = document.getElementById('codexList');
  if (box) box.innerHTML = codexListHtml();
}

/* ---- 挂载到 #panelOverlay（与宠物 / 技能面板同一容器与做法） ---- */
function renderCodexPanel() {
  var ov = document.getElementById('panelOverlay');
  if (!ov) return;
  ov.innerHTML = codexShellHtml();
  ov.classList.add('open');
  codexBindPanel(ov);
}
function codexBindPanel(ov) {
  var close = document.getElementById('codexClose');
  if (close) close.addEventListener('click', function () { ov.classList.remove('open'); });
  /* 分栏切换：整体重渲染（骨架不同），状态保留 */
  ov.querySelectorAll('[data-codex-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = btn.getAttribute('data-codex-tab');
      if (!t || t === _codexTab) return;
      _codexTab = t;
      renderCodexPanel();
      var s = document.getElementById('codexSearch');
      if (s && s.focus) s.focus();
    });
  });
  /* 搜索：防抖 160ms（同 tab-settings 的动作百科做法） */
  var input = document.getElementById('codexSearch');
  if (input) {
    input.addEventListener('input', function () {
      _codexQuery = input.value || '';
      if (_codexSearchTimer) clearTimeout(_codexSearchTimer);
      _codexSearchTimer = setTimeout(function () {
        _codexSearchTimer = null;
        codexRefreshList();
      }, 160);
    });
  }
  /* 筛选：在容器上做事件委托 —— 局部重渲染后无需重新绑定 */
  var filters = document.getElementById('codexFilters');
  if (filters) {
    filters.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-codex-type')) { _codexSkillType = t.getAttribute('data-codex-type'); }
      else if (t.getAttribute('data-codex-src')) { _codexSkillSrc = t.getAttribute('data-codex-src'); }
      else if (t.getAttribute('data-codex-tsrc')) { _codexTalentSrc = t.getAttribute('data-codex-tsrc'); }
      else if (t.getAttribute('data-codex-rarity')) { _codexPetRarity = t.getAttribute('data-codex-rarity'); }
      else return;
      codexRefreshList();
    });
  }
}

/* ---- 测试/工具口（与其它模块同一约定） ---- */
if (typeof window !== 'undefined') {
  window.renderCodexPanel = renderCodexPanel;
  window.codexCounts = codexCounts;
  window.codexPetEntries = codexPetEntries;
  window.codexSkillEntries = codexSkillEntries;
  window.codexTalentEntries = codexTalentEntries;
  window.codexEntries = codexEntries;
  window.codexShellHtml = codexShellHtml;
  window.codexListHtml = codexListHtml;
  window.codexRarityOptions = codexRarityOptions;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderCodexPanel = renderCodexPanel;
  globalThis.codexCounts = codexCounts;
  globalThis.codexPetEntries = codexPetEntries;
  globalThis.codexSkillEntries = codexSkillEntries;
  globalThis.codexTalentEntries = codexTalentEntries;
  globalThis.codexEntries = codexEntries;
  globalThis.codexShellHtml = codexShellHtml;
  globalThis.codexListHtml = codexListHtml;
  globalThis.codexRarityOptions = codexRarityOptions;
}

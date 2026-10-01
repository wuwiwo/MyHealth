/* ==========================================================================
 * skill-icon.js —— 技能图标渲染唯一入口（v2.3.2）
 * --------------------------------------------------------------------------
 * 与 monster-archetype.js 同构：所有技能图标都只能从这里取，禁止在业务代码里
 * 手拼 'media/skills/xxx.svg'。
 *
 * 为什么技能图标不按「原型」收敛，而是一技能一枚：
 *   怪兽 189 个名字里大量是同形不同名的改词（永恒壁垒/终极壁垒/星核壁垒 = 同一面方正盾），
 *   收敛成原型不丢辨识度；
 *   而技能 35 个语义**真正互斥**（暴击/治愈/冰冻三尺/地刺/暴风雪 是不同的视觉概念），
 *   强行收敛会把「地刺 vs 暴风雪」这种本该分开的东西挤成同一张图。
 *   且技能注册在代码里，几乎不变动，「降低维护成本」这个收敛收益也不成立。
 *   详见 doc/design-skill-icons.md §0。
 *
 * ⚠️ 三套 id 空间（共 48 枚）：
 *   - 玩家技能：page/skills.js 的 PLAYER_SKILLS，             10 个（crit/vitality/...）
 *   - 敌方技能：page/skill.js  的 SKILLS，                    25 个（charge/bite/...）
 *   - 宠物技能：page/pet-codex.js 注册进**同一个** SKILLS，   13 个（p_* 前缀）
 *   三套无重名。宠物技能虽与敌方技能同处一个注册表，但语义来源是宠物，
 *   故在此单独建表，便于按来源校验与调试。
 *   因此本模块同时提供只吃 id 的 skillIconHtml() 与显式声明来源的
 *   skillIconHtmlByOwner(id, isPlayer)，需要区分来源时用后者。
 * ========================================================================== */
(function (global) {
  'use strict';

  var SKILL_ICON_DIR = 'media/skills/';

  /* 玩家技能 10 个（来源：page/skills.js PLAYER_SKILLS） */
  var SKILL_ICON_PLAYER = {
    crit: true,        /* 暴击 */
    vitality: true,    /* 气力恢复 */
    meteor: true,      /* 陨石轰炸 */
    block: true,       /* 格挡 */
    momentum: true,    /* 气势如虹 */
    icebeam: true,     /* 冰魄光束 */
    goldshield: true,  /* 金身护盾 */
    spotlight: true,   /* 瞩目 */
    boulder: true,     /* 巨石重压 */
    qifeng: true       /* 启风 */
  };

  /* 敌方技能 25 个（来源：page/skill.js SKILLS，排除 p_* 宠物技能） */
  var SKILL_ICON_ENEMY = {
    charge: true,      /* 冲撞 */
    bite: true,        /* 咬击 */
    surprise: true,    /* 击掌奇袭 */
    blackmist: true,   /* 黑气 */
    spikes: true,      /* 地刺 */
    blizzard: true,    /* 暴风雪 */
    snowball: true,    /* 雪球 */
    deepfreeze: true,  /* 冰冻三尺 */
    chargeup: true,    /* 蓄力重击 */
    armorbreak: true,  /* 破甲重击 */
    stardust: true,    /* 星辰坠落 */
    shrink: true,      /* 变小 */
    yawn: true,        /* 哈欠 */
    drench: true,      /* 打湿 */
    possess: true,     /* 幽魂附身 */
    taunt: true,       /* 嘲讽 */
    doom: true,        /* 末日 */
    drainbuff: true,   /* 摄取 */
    bulwark: true,     /* 广域防御 */
    cleanse: true,     /* 净化 */
    heal: true,        /* 治愈 */
    empower: true,     /* 强攻 */
    lastword: true,    /* 遗言 */
    fortify: true,     /* 坚壁 */
    clearfog: true     /* 清除迷雾 */
  };

  /* 宠物技能 13 个（来源：page/pet-codex.js 注册进 SKILLS，全部 p_ 前缀） */
  var SKILL_ICON_PET = {
    p_shine: true,         /* 闪耀 */
    p_drench: true,        /* 打湿 */
    p_sleep: true,         /* 睡觉 */
    p_flamepeck: true,     /* 火焰啄击 */
    p_sing: true,          /* 歌唱 */
    p_thundercharge: true, /* 雷霆冲撞 */
    p_doublehit: true,     /* 双撞 */
    p_phantom: true,       /* 幻影之瞳 */
    p_iceburst: true,      /* 冰晶爆 */
    p_holylight: true,     /* 圣光治愈 */
    p_dreamball: true,     /* 梦幻光球 */
    p_shadowfist: true,    /* 无影拳 */
    p_warmight: true       /* 战意灌注 */
  };

  var SKILL_ICON_SIZE_DEFAULT = 32;

  /* id 合法性：三套 id 空间任一命中即可。
     isPlayer 显式传入时按指定空间校验（true=玩家表，false=敌方/宠物侧），
     可用来兜住「未来两边真的重名」的场景。

     ⚠️ isPlayer === false 必须同时接受**敌方表与宠物表**：
     宠物技能注册在 page/skill.js 的同一个 SKILLS 里，战斗中由同一段
     renderUnitSkillChips / showSkillDetail 渲染，那些调用点会显式传 false。
     若这里只认敌方表，宠物技能会被判为非法 → 界面**空白图标**（静默降级）。
     这是本轮测试实际抓到的缺陷，勿回退。 */
  function skillIconKnown(id, isPlayer) {
    if (!id || typeof id !== 'string') return false;
    if (isPlayer === true) return SKILL_ICON_PLAYER[id] === true;
    if (isPlayer === false) return SKILL_ICON_ENEMY[id] === true || SKILL_ICON_PET[id] === true;
    return SKILL_ICON_PLAYER[id] === true
      || SKILL_ICON_ENEMY[id] === true
      || SKILL_ICON_PET[id] === true;
  }

  /* 非法 id 返回 null —— 由调用方决定降级，不要拼出一个必然 404 的路径 */
  function skillIconUrl(id, isPlayer) {
    if (!skillIconKnown(id, isPlayer)) return null;
    return SKILL_ICON_DIR + id + '.svg';
  }

  /* size 缺省回落 32；必须是 16 的倍数（48→3px/格、32→2px/格、16→1px/格），
     24 不是 16 的倍数会得到 1.5px/格，像素格不匀，禁止传入。 */
  function skillIconHtml(id, size, cls, isPlayer) {
    var url = skillIconUrl(id, isPlayer);
    if (!url) return '';
    var px = (size == null || isNaN(size)) ? SKILL_ICON_SIZE_DEFAULT : size;
    return '<img class="sk-ico' + (cls ? ' ' + cls : '') + '" src="' + url + '"'
      + ' width="' + px + '" height="' + px + '" alt=""'
      + ' loading="lazy" decoding="async">';
  }

  /* 显式带来源：isPlayer 为 true 走玩家表，false 走敌方表 */
  function skillIconHtmlByOwner(id, isPlayer, size, cls) {
    return skillIconHtml(id, size, cls, isPlayer === true);
  }

  /* 按技能名取图：名字 → id 的反查。
     名字是不稳定的展示层文案（可能改字），id 才是稳定键；
     这里只作为便利方法，查不到就返回 ''（不裂图、不抛错）。 */
  var _nameToId = null;
  function _buildNameMap() {
    if (_nameToId) return _nameToId;
    _nameToId = {};
    /* 玩家技能名 */
    if (global.PLAYER_SKILLS) {
      for (var pid in global.PLAYER_SKILLS) {
        var ps = global.PLAYER_SKILLS[pid];
        if (ps && ps.name) _nameToId[ps.name] = pid;
      }
    }
    /* 敌方技能名 */
    if (global.SKILLS) {
      for (var eid in global.SKILLS) {
        var es = global.SKILLS[eid];
        if (es && es.name && !_nameToId[es.name]) _nameToId[es.name] = eid;
      }
    }
    return _nameToId;
  }

  function skillIconHtmlByName(name, size, cls, isPlayer) {
    if (!name) return '';
    var id = _buildNameMap()[name];
    if (!id) return '';
    return skillIconHtml(id, size, cls, isPlayer);
  }

  /* 供测试与调试：列出全部合法 id（按来源） */
  function skillIconIds() {
    var out = { player: [], enemy: [], pet: [] };
    for (var p in SKILL_ICON_PLAYER) out.player.push(p);
    for (var e in SKILL_ICON_ENEMY) out.enemy.push(e);
    for (var t in SKILL_ICON_PET) out.pet.push(t);
    out.player.sort();
    out.enemy.sort();
    out.pet.sort();
    return out;
  }

  global.SKILL_ICON_DIR = SKILL_ICON_DIR;
  global.SKILL_ICON_PLAYER = SKILL_ICON_PLAYER;
  global.SKILL_ICON_ENEMY = SKILL_ICON_ENEMY;
  global.SKILL_ICON_PET = SKILL_ICON_PET;
  global.SKILL_ICON_SIZE_DEFAULT = SKILL_ICON_SIZE_DEFAULT;
  global.skillIconKnown = skillIconKnown;
  global.skillIconUrl = skillIconUrl;
  global.skillIconHtml = skillIconHtml;
  global.skillIconHtmlByOwner = skillIconHtmlByOwner;
  global.skillIconHtmlByName = skillIconHtmlByName;
  global.skillIconIds = skillIconIds;
})(typeof window !== 'undefined' ? window : this);

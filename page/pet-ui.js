/* ============================================
   MyHealth — Pet UI (M4-6)
   宠物面板：列表/喂食/炼化/参战选择。
   入口：挑战页（敌群试炼旁）。
   依赖 pet-store.js / pets.js / pet-materials.js / pet-codex.js。
   ============================================ */

/* ============ v2.2.29 宠物头像图标（page/media/pets/<speciesId>.svg） ============
   14 只宠物各有一枚 48×48 像素风 SVG（设计规格与逐只提示词见 doc/design-pet-icons.md）。
   本区块是**图标渲染的唯一入口** —— 任何需要显示宠物头像的地方都走 petIconHtml()，
   不要在别处硬拼 <img> 路径：换目录 / 换格式 / 换尺寸时只改这里。
   ⚠️ 路径相对 page/（与 utils.js 的 exMediaUrl `'media/' + rel` 同一约定）——
      index.html 就挂在 page/ 下，而 page/ 即 Vercel 部署根。
   ⚠️ **缺图标时返回空串**，由调用方各自兜底回原来的 emoji —— 不抛错、不显示裂图，
      也不会因为某个 speciesId 没有对应文件就把整张卡片搞崩。 */
var PET_ICON_DIR = 'media/pets/';
function petIconUrl(speciesId) {
  if (!speciesId) return null;
  if (typeof PET_CODEX === 'undefined' || !PET_CODEX[speciesId]) return null;
  return PET_ICON_DIR + speciesId + '.svg';
}
/* 头像 <img>；size = 显示边长(px)；缺图标返回 ''。
   ⚠️ `alt=""`（空）是**故意的**：所有接入点头像都紧邻可见的宠物名
      （卡片 `.pet-card-name` / 详情标题 / 芯片文字），属**装饰性图像**。
      若写成 alt="闪闪星"，读屏会念两遍「闪闪星 闪闪星 SSR」。
      将来若做「只有图标没有名字」的图鉴网格或分享卡，那里要单独给
      `role="img" aria-label="闪闪星"`，不要改这里。
   ⚠️ `size` **必须是 16 的倍数**（推荐 32 / 48）：图标是 16×16 逻辑网格、
      1 格 = 3px，48px 显示时 1 格 = 3px。取 32 → 每格 2px（干净）；
      取 40 → 每格 2.5px，crispEdges 会把格宽硬切成 2 或 3px **粗细不均**；
      取 24 → 每格 1.5px，跳动更明显。 */
function petIconHtml(speciesId, size, cls) {
  var url = petIconUrl(speciesId);
  if (!url) return '';
  return '<img class="pet-ico' + (cls ? ' ' + cls : '') + '" src="' + url + '"'
    + ' width="' + size + '" height="' + size + '" alt=""'
    + ' loading="lazy" decoding="async">';
}
/* 列表卡片头像：无图标时退回该阶段的 emoji（= 接入前的行为）。
   ⚠️ v2.2.30：**不再叠加阶段角标** —— 角标（🥚/🌱）会压住头像右下角
      （评审 7-4：`sparkle` 的星角被盖住），而阶段信息在卡片正文行
      （「孵化 40% / 成长 30% / 成熟」）与进度条里已经完整表达，角标属重复信息。
      「无图标 → 退回 emoji」这条降级语义保留。 */
function petIconStageHtml(speciesId, size, stage) {
  return petIconHtml(speciesId, size) || (stage === 'egg' ? '🥚' : stage === 'grow' ? '🌱' : '🐾');
}


/* ============ v2.1.17 宝珠 UI（design-v2.0.md §2.7） ============
   此前 orbs.js 逻辑完整但 UI 零调用、存档也没有库存字段 —— 碎片只能用不能花。
   这里补上：主面板合成/分解，宠物详情装配/升级/卸下。 */

/* 主面板：合成按钮 + 库存列表 */
function orbBagHtml(d) {
  if (typeof ORB_TYPES === 'undefined') return '';
  var sh = (d.materials || {}).orbShard || 0;
  var h = '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:14px">';
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  h += '<div style="flex:1;font-weight:700">💎 宝珠 <span style="color:var(--text3);font-weight:400">（碎片 <b>' + sh + '</b> · 仅用于升级）</span></div>';
  h += '</div>';
  var bag = d.orbs || [];
  if (!bag.length) {
    h += '<div style="color:var(--text3);margin-top:6px">库存空 —— 通关隐藏挑战掉落宝珠，装配在宠物详情里</div>';
  } else {
    bag.forEach(function (o) {
      var ot = ORB_TYPES[o.type] || { name: o.type };
      var val = (typeof orbPct === 'function') ? orbPct(o) : 0;
      h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--surface-3)">';
      h += '<div style="flex:1">' + ot.name + ' <span style="color:var(--purple,#a855f7)">' + o.rarity + '</span> Lv' + (o.level || 1) + ' <span style="color:var(--green)">+' + val + '%</span></div>';
      h += '<button class="speed-btn" data-orb-bag="' + o.id + '" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">♻️ 分解 +' + ((typeof ORB_DECOMPOSE !== 'undefined' && ORB_DECOMPOSE[o.rarity]) || 0) + '</button>';
      h += '</div>';
    });
  }
  h += '</div>';
  return h;
}

/* 宠物详情：5 个槽位 */
function orbSlotsHtml(pet, d) {
  if (typeof ORB_TYPES === 'undefined') return '';
  var sh = (d.materials || {}).orbShard || 0;
  var h = '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">';
  h += '<div style="font-weight:700;margin-bottom:4px">💎 宝珠 <span style="color:var(--text3);font-weight:400">（每类型 1 颗 · 碎片 <b>' + sh + '</b>）</span></div>';
  var eq = pet.orbs || {};
  /* WP-I A-5-5：5 槽全空、且库存也为空时，原来逐条渲染「（空）/ 无库存」共 5 行 ≈180px 零信息，
     折叠成一行文案即可；只要任一类已装配、或库存里有货，就仍逐条展开（装配/升级/卸下）。 */
  var orbTypes = Object.keys(ORB_TYPES);
  var anyEquipped = orbTypes.some(function (t) { return !!eq[t]; });
  if (!anyEquipped && !(d.orbs || []).length) {
    h += '<div style="color:var(--text3)">' + orbTypes.length + ' 槽均空 · 通关隐藏挑战掉落宝珠，装配到宠物身上生效</div>';
  } else {
  orbTypes.forEach(function (t) {
    var ot = ORB_TYPES[t], o = eq[t];
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0">';
    if (o) {
      var val = (typeof orbPct === 'function') ? orbPct(o) : 0;
      /* v2.2：等级上限与「满级升品质」都看 ORB_QUALITY_SPEC（旧 ORB_TYPES.maxLv 已删） */
      var spec = ((typeof ORB_QUALITY_SPEC !== 'undefined' && ORB_QUALITY_SPEC[o.rarity]) || { maxLv: 10, next: null });
      var maxed = !spec.next && (o.level || 1) >= spec.maxLv;
      var cost = (typeof orbUpgradeCost === 'function') ? orbUpgradeCost(o) : 0;
      h += '<div style="flex:1">' + ot.name + ' <span style="color:var(--purple,#a855f7)">' + o.rarity + '</span> Lv' + (o.level || 1) + ' <span style="color:var(--green)">+' + val + '%</span>'
        + (spec.next ? ' <span style="color:var(--text3)">（' + spec.maxLv + ' 级 → ' + spec.next + '）</span>' : '') + '</div>';
      h += maxed
        ? '<span style="color:var(--green);font-size:var(--fs-2xs)">满级</span>'
        : '<button class="speed-btn" data-orb-op="upgrade" data-orb-type="' + t + '" data-pet-idx="__IDX__" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">⬆' + cost + '💎</button>';
      h += '<button class="speed-btn" data-orb-op="unequip" data-orb-type="' + t + '" data-pet-idx="__IDX__" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">卸下</button>';
    } else {
      var stock = (d.orbs || []).filter(function (x) { return x.type === t; });
      h += '<div style="flex:1;color:var(--text3)">' + ot.name + '（空）</div>';
      h += stock.length
        ? '<button class="speed-btn" data-orb-op="equip" data-orb-id="' + stock[0].id + '" data-pet-idx="__IDX__" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm);border-color:var(--green);color:var(--green)">装配 ' + stock[0].rarity + '</button>'
        : '<span style="color:var(--text3);font-size:var(--fs-2xs)">无库存</span>';
    }
    h += '</div>';
  });
  }
  h += '</div>';
  return h;
}

/* 宠物面板 overlay（新版式：卡片/大按钮/12px+） */
function renderPetPanel() {
  var ov = document.getElementById('panelOverlay')
  if (!ov) return
  var d = getPetStore()
  /* v2.2 WP-H1：从存档恢复参战宠物选择（刷新/重开后保留） */
  if (typeof ensurePetBattlePicksLoaded === 'function') ensurePetBattlePicksLoaded()
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="petClose" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:var(--fs-base)">✕</button>'
    +'<span style="font-size:var(--fs-lg);font-weight:700">🐾 宠物面板</span>'
    +'<span style="flex:1"></span>'
    +'<button class="speed-btn" id="petSettle" style="padding:10px 14px;min-height:44px;font-size:var(--fs-base);border-color:var(--green);color:var(--green)">结算</button>'
    +'</div>'
  // 材料
  var m = d.materials || {}
  /* v2.2 WP-H5：一键治疗的候选 = 成熟 + 未阵亡 + 受伤（已死亡 / 未成熟不参与） */
  var injuredN = d.pets.filter(function(p){ return p.stage==='mature' && !p.isDead && p.injured }).length
  h += '<div style="font-size:var(--fs-sm);background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;gap:12px;flex-wrap:wrap;line-height:1.6">'
    +'<span>🧪 营养液 <b style="font-size:var(--fs-base)">'+m.nutrition+'</b></span>'
    +'<span>🍖 饲料 <b style="font-size:var(--fs-base)">'+m.feed+'</b></span>'
    +'<span>✨ 灵能 <b style="font-size:var(--fs-base)">'+m.spirit+'</b></span>'
    +'<span>🪨 炼化石 <b style="font-size:var(--fs-base)">'+m.refineNormal+'</b>/<b style="color:var(--purple,#a855f7);font-size:var(--fs-base)">'+m.refineHigh+'</b></span>'
    +'<span>💎 宝珠碎片 <b style="font-size:var(--fs-base)">'+m.orbShard+'</b></span>'
    +'<button class="speed-btn" id="petExchange" title="10 个普通炼化石兑换 1 个高级炼化石" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">🔄 兑换 10→1</button>'
    +'<button class="speed-btn" id="petHealAll" title="自动消耗营养液，把所有受伤宠物一次治好（已阵亡/未成熟的不参与）" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)'+(injuredN?';border-color:var(--red);color:var(--red)':'')+'">🧪 一键治疗'+(injuredN?'（'+injuredN+'）':'')+'</button>'
    +'</div>'
  // v2.1.17 宝珠：合成 / 库存分解
  h += orbBagHtml(d)
  // 宠物列表
  if (!d.pets.length) {
    h += '<div style="text-align:center;padding:32px 20px;color:var(--text3);font-size:var(--fs-base);background:var(--bg2);border-radius:16px">还没有宠物 🐾<br><span style="font-size:var(--fs-xs)">先领一颗蛋开始养成吧</span><br><button class="speed-btn" id="petGetEgg" style="margin-top:14px;padding:12px 20px;min-height:48px;font-size:var(--fs-md);border-color:var(--orange);color:var(--orange)">🥚 获取初始蛋</button></div>'
  } else {
    d.pets.forEach(function(p, i) {
      normalizePetStage(p);   // v2.0.9: 实时校正阶段（防 hatchProgress=100 卡 egg）
      var codex = getPetCodex(p.speciesId) || { name: p.name, rarity: p.rarity }
      /* v2.2.29：头像改用宠物专属图标（petIconStageHtml 内部兜底回原来的阶段 emoji） */
      var stageText = p.stage==='egg'?'孵化 '+Math.round(p.hatchProgress)+'%':p.stage==='grow'?'成长 '+Math.round(p.growth)+'%':'成熟'
      var dead = p.isDead ? '<span style="color:var(--red)">💀 阵亡</span>' : ''
      // v2.1.19 受伤状态：无法参战，需喂养把恢复进度喂到 100
      var inj = (!p.isDead && p.injured) ? '<span style="color:var(--red)">🤕 受伤 ' + Math.round(p.injuryHeal || 0) + '%</span>' : ''
      // 进度条（孵化/成长）
      var prog = p.stage==='egg' ? p.hatchProgress : p.stage==='grow' ? p.growth : 100
      /* WP-I A-1：拆成「标题行（头像+名称+稀有度）/ 正文行（状态+进度）/ 操作行（按钮组）」。
         原来单行 flex 时右侧按钮把中文名压到 ~21px 宽 →「清脆鸟」竖排三行。现在名称
         独占标题行且 nowrap+省略号，任何宽度都不会竖排；按钮组独立一行，仍各 44px 热区。 */
      h += '<div class="pet-card">'
        +'<div class="pet-card-head">'
        +'<span class="pet-card-ico">'+petIconStageHtml(p.speciesId, 32, p.stage)+'</span>'
        +'<span class="pet-card-name">'+(codex.name||p.name)+'</span>'
        +'<span class="pet-card-rarity">'+p.rarity+'</span>'
        +'</div>'
        +'<div class="pet-card-status">'+stageText+' · 饥饿 '+Math.round(p.hunger)+' · 健康 '+Math.round(p.health)+(dead?' · '+dead:'')+(inj?' · '+inj:'')+'</div>'
        // 进度条
        +'<div class="pet-card-bar"><i style="width:'+Math.min(100,prog)+'%"></i></div>'
        // 操作按钮（大按钮 44px）
        +'<div class="pet-card-actions">'
        +'<button class="speed-btn" data-pet-op="feed" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)">🍖喂</button>'
        +((p.stage==='egg'||(p.stage==='mature'&&!p.isDead))?'<button class="speed-btn" data-pet-op="nutrition" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)'+(p.injured?';border-color:var(--red);color:var(--red)':'')+'">🧪营养</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="refine" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm);border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">✨炼化</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="detail" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)">📋</button>':'')
        +'</div>'
        +'</div>'
    })
  }
  // 参战选择（成熟宠物）
  var ready = d.pets.filter(function(p){return p.stage==='mature'&&!p.isDead})
  if (ready.length) {
    var _petMaxLabel = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4
    h += '<div style="margin-top:10px;font-size:var(--fs-xs)">⚔️ 选择参战宠物（最多 '+_petMaxLabel+' 只）</div>'
    h += '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'
    ready.forEach(function(p, ri) {
      var sel = (_petBattlePicks||[]).includes(p.speciesId)
      /* v2.2.29：参战芯片加 24px 头像，扫一眼就能认出是哪只（原来只有文字） */
      h += '<button class="speed-btn pet-pick-chip" data-pet-pick="'+p.speciesId+'" style="padding:3px 10px;'+(sel?'border-color:var(--green);color:var(--green)':'')+'">'
        + petIconHtml(p.speciesId, 32) + '<span>'+(getPetCodex(p.speciesId)||{}).name+'</span></button>'
    })
    h += '</div>'
    h += '<div style="margin-top:8px"><button class="speed-btn" id="petStartBattle" style="padding:4px 16px;border-color:var(--orange);color:var(--orange)">⚔️ 开始敌群试炼（带宠物）</button></div>'
  }
  ov.innerHTML = '<div class="panel-inner">' + h + '</div>'
  ov.classList.add('open')

  // 事件
  var closeBtn = document.getElementById('petClose')
  if (closeBtn) closeBtn.addEventListener('click', function(){ ov.classList.remove('open') })
  var settleBtn = document.getElementById('petSettle')
  if (settleBtn) settleBtn.addEventListener('click', function(){
    var ev = settleAllPets(new Date())
    toast('✅ 宠物结算完成' + (ev.length ? '（'+ev.length+' 事件）' : ''), 's')
    renderPetPanel()
  })
  var getEgg = document.getElementById('petGetEgg')
  if (getEgg) getEgg.addEventListener('click', function(){
    var r = grantStarterPet()
    toast(r.msg || r.reason, r.ok ? 's' : 'e')
    renderPetPanel()
  })
  var exch = document.getElementById('petExchange')
  if (exch) exch.addEventListener('click', function(){
    var d5 = getPetStore()
    var rx = exchangeRefineStones(d5.materials, 1)
    if (rx.ok) { savePetStore(d5); toast('🔄 '+rx.spent+' 普通炼化石 → '+rx.gained+' 高级炼化石', 's') }
    else { toast(rx.reason || '兑换失败', 'e') }
    renderPetPanel()
  })
  /* v2.2 WP-H5：一键修复受伤（自动消耗营养液）—— 逻辑全在 pet-store.js 的 healAllInjuredPets()，
     这里只负责提示。已阵亡 / 未成熟 / 未受伤的宠物在那边就已被排除，不会误治、不会误耗。 */
  var healAll = document.getElementById('petHealAll')
  if (healAll) healAll.addEventListener('click', function(){
    var hr = (typeof healAllInjuredPets === 'function') ? healAllInjuredPets() : { ok:false, reason:'宠物模块未加载' }
    if (!hr.ok) { toast(hr.reason || '没有需要治疗的宠物', 'e') }
    else {
      var seg = []
      if (hr.healed.length) seg.push('✅ ' + hr.healed.join('、') + ' 已痊愈')
      if (hr.partial.length) seg.push('⚠️ ' + hr.partial.join('、') + ' 未愈（营养液不足）')
      seg.push('消耗 🧪' + hr.consumed)
      toast(seg.join(' · '), hr.partial.length ? 'e' : 's')
    }
    renderPetPanel()
  })
  /* v2.2 WP-A2：**删除「合成宝珠」入口** —— 宝珠本体改为隐藏挑战掉落，
     碎片只用于升级（口径见 doc/changelog-v2.2.md）。 */
  ov.querySelectorAll('[data-orb-bag]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var oid = btn.getAttribute('data-orb-bag')
      var d7 = getPetStore()
      var arr = d7.orbs || []
      var i7 = -1
      arr.forEach(function(o, k){ if (o.id === oid) i7 = k })
      if (i7 < 0) return
      var orb7 = arr.splice(i7, 1)[0]
      if (typeof decomposeOrb === 'function') decomposeOrb(orb7, d7.materials)
      savePetStore(d7)
      toast('♻️ 分解 ' + ((ORB_TYPES[orb7.type]||{}).name||orb7.type) + '（' + orb7.rarity + '）', 's')
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-pet-op]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var op = btn.getAttribute('data-pet-op')
      var idx = parseInt(btn.getAttribute('data-pet-idx'))
      var d2 = getPetStore()
      var pet = d2.pets[idx]
      if (!pet) return
      if (op === 'feed') {
        var r = useFeed(pet, d2.materials)
        var m = r.reason || (pet.stage === 'mature'
          ? ('🍖 饥饿+' + r.inc.toFixed(0) + (r.injuryHeal != null ? ' · 治疗 ' + r.injuryHeal + '%' + (r.healed ? ' ✅已痊愈' : '') : ''))
          : ('🍖 饥饿+' + r.inc.toFixed(0)))
        toast(m, r.ok?'s':'e')
      }
      if (op === 'nutrition') {
        var r2 = useNutrition(pet, d2.materials)
        var m2 = r2.reason || (pet.stage === 'mature'
          ? ('🧪 治疗 ' + (r2.injuryHeal != null ? r2.injuryHeal + '%' : '') + (r2.healed ? ' ✅已痊愈' : ''))
          : ('🧪 孵化+' + r2.inc.toFixed(1)+'%'))
        toast(m2, r2.ok?'s':'e')
      }
      if (op === 'refine') { var r3 = attemptRefine(pet, d2.materials, 'refineHigh'); toast(r3.reason || ('✨ 炼化 +' + r3.gained + ' ' + r3.stat + '（Lv'+r3.level+'）'), r3.ok?'s':'e') }
      if (op === 'detail') { renderPetDetail(pet, idx); return }
      savePetStore(d2)
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-pet-pick]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sid = btn.getAttribute('data-pet-pick')
      /* v2.2 WP-H1：先确保已从存档恢复，再改选择 */
      if (typeof ensurePetBattlePicksLoaded === 'function') ensurePetBattlePicksLoaded()
      _petBattlePicks = _petBattlePicks || []
      var i = _petBattlePicks.indexOf(sid)
      var _petMax = (typeof PET_BATTLE_MAX === 'number') ? PET_BATTLE_MAX : 4
      if (i > -1) _petBattlePicks.splice(i, 1)
      else if (_petBattlePicks.length < _petMax) _petBattlePicks.push(sid)
      else { toast('最多携带 ' + _petMax + ' 只宠物 ⚔️', 'e'); return }
      /* v2.2 WP-H1：选择落盘（刷新 / 重开后保留） */
      if (typeof savePetBattlePicks === 'function') savePetBattlePicks(_petBattlePicks)
      renderPetPanel()
    })
  })
  var startBtn = document.getElementById('petStartBattle')
  if (startBtn) startBtn.addEventListener('click', function(){
    /* v2.2 WP-H2：从**当前进度关**开战（不再写死 'g5'）；无目标关时不关面板 */
    var stage = (typeof currentGroupStageId === 'function') ? currentGroupStageId() : null
    if (!stage) { toast('暂无可挑战的敌群关卡', 'e'); return }
    ov.classList.remove('open')
    startGroupTrialWithPets(stage, _petBattlePicks || [])
  })
}

/* ============================================================
   v2.2 WP-I A-6：宠物详情「属性区」重组 —— 作者原话：
     「修改宠物-详情页面，属性部分将基础属性与加成分开，最后再显示最终属性，
       层次要分明，现在太乱了。加成用：×N% 显示，可以展开加成来源，属性同理；
       增加对比宠物的功能。」
   三段固定结构：① 基础属性 → ② 加成（统一 ×N%）→ ③ 最终属性。
   ⚠️ **只重组展示**：所有数字来自 pet-store.js 的 `petStatBreakdown()`
      （本文件**不重算**任何数值口径、不引用稀有度倍率常量、不写存档）；
      `×N%` 只是把 bd 的既有字段换算成倍数文本（换算见 petStatMultPct / petBenchMultPct /
      petPoolMultPct / petOrbMultPct，全在 pet-store.js）。
   ⚠️ 面板前提「按此宠上场计算」**保留并讲清楚**：团队凝聚 / 共鸣只作用于参战宠，
      故 ② 的副标题、③ 的副标题、对比区口径行都写明这一前提。
   ============================================================ */
var PET_STAT_ROWS = [
  { ico:'❤️', name:'生命', k:'hp' },
  { ico:'⚔️', name:'攻击', k:'atk' },
  { ico:'🛡️', name:'防御', k:'def' },
  { ico:'👻', name:'魂攻', k:'soulAtk' },
  { ico:'🌫️', name:'魂防', k:'soulDef' },
  { ico:'💨', name:'速度', k:'spd' }
];
function petStatMeta(k) {
  for (var i = 0; i < PET_STAT_ROWS.length; i++) if (PET_STAT_ROWS[i].k === k) return PET_STAT_ROWS[i];
  return { ico: '•', name: k, k: k };
}
/* ×N% 文本（null = 基础为 0，无法表达为倍数） */
function petMultTxt(pct) { return (pct == null) ? '×—' : '×' + pct + '%'; }

/* 展开状态：模块级 UI 状态（**不进存档**，重渲染后保留） */
var _petSrcOpen = false;      // ②「加成来源」
var _petStatOpen = null;      // ③ 当前展开的属性 k（null = 全收起）
var _petCompareSel = null;    // 对比对象 speciesId（null = 未对比）

/* ② 加成来源：每一项都写成 ×N% */
function petBonusSrcHtml(bd) {
  var h = '';
  h += '<div class="pet-src-line"><span class="pet-src-tag">稀有度倍率</span><span>' + petMultTxt(bd.rarityPct || 0) + '（全属性）</span></div>';
  var orb = [];
  PET_STAT_ROWS.forEach(function (r) {
    if (r.k === 'spd') return;
    var p = petOrbMultPct(bd, r.k);
    if (p != null && p !== 100) orb.push(r.name + ' ' + petMultTxt(p));
  });
  h += '<div class="pet-src-line"><span class="pet-src-tag">宝珠</span><span>'
    + (orb.length ? orb.join(' · ') + '（与稀有度<b>相加</b>进倍率池）' : '未装配（×100%）')
    + '</span></div>';
  var bench = [];
  PET_STAT_ROWS.forEach(function (r) {
    var p = petBenchMultPct(bd, r.k);
    if (p != null && p !== 100) bench.push(r.name + ' ' + petMultTxt(p));
  });
  h += '<div class="pet-src-line"><span class="pet-src-tag">凝聚＋共鸣</span><span>'
    + (bench.length
        ? bench.join(' · ') + '（未上场 ' + bd.benchCount + ' 只：凝聚 10% ＋ 共鸣 ' + Math.round((bd.resonanceRate || 0) * 100) + '%）'
        : '无后备宠（×100%）')
    + '</span></div>';
  h += '<div class="pet-src-note">倍率池 ＝ 稀有度 ＋ Σ宝珠%（两项<b>相加</b>，不是相乘）；'
    + '凝聚/共鸣是<b>直接加属性值</b>，先并入基础、再整块乘倍率池。</div>';
  return h;
}

/* ③ 单属性链路：基础 → 各来源 → 最终 */
function petStatChainHtml(bd, k) {
  var m = petStatMeta(k);
  var ch = bd.cohesion[k] || 0, rr = bd.resonance[k] || 0;
  var h = '<div class="pet-chain-hd">' + m.ico + ' ' + m.name + '</div>';
  h += '<div class="pet-chain-line">基础 <b>' + (bd.base[k] || 0) + '</b>';
  if (ch) h += ' ＋凝聚 <b>' + ch + '</b>';
  if (rr) h += ' ＋共鸣 <b>' + rr + '</b>';
  if (ch || rr) h += ' ＝ 上场 <b>' + (bd.bench[k] || 0) + '</b>';
  h += ' → 最终 <b>' + (bd.final[k] || 0) + '</b>';
  h += '<span class="pet-sec-sub"> （×倍率池 ' + petMultTxt(petPoolMultPct(bd, k)) + '，含稀有度' + (k === 'spd' ? '不参与' : '与宝珠相加') + '）</span>';
  h += '</div>';
  return h;
}

/* 属性区三段（① 基础 → ② 加成 → ③ 最终） */
function petStatSectionsHtml(bd) {
  var h = '<div class="pet-sec">';
  h += '<div class="pet-sec-hd">📊 属性 <span class="pet-sec-sub">（① 基础 → ② 加成 → ③ 最终 · 按此宠上场计算）</span></div>';
  if (!bd || !bd.ok) {
    h += '<div class="pet-sec-empty">（属性拆解暂不可用）</div></div>';
    return h;
  }
  h += '<div class="pet-sec-title">① 基础属性 <span class="pet-sec-sub">图鉴＋炼化＋天赋静态</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-val">' + (bd.base[r.k] || 0) + '</b></div>';
  });
  h += '</div>';
  h += '<div class="pet-sec-title">② 加成 <span class="pet-sec-sub">统一为 ×N% · 凝聚/共鸣只作用于参战宠</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    h += '<div class="pet-cell"><span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-mult">' + petMultTxt(petStatMultPct(bd, r.k)) + '</b></div>';
  });
  h += '</div>';
  var srcLabel = '加成来源（未上场 ' + bd.benchCount + ' 只）';
  h += '<button class="pet-src-toggle" id="petBonusSrcBtn" aria-expanded="' + (_petSrcOpen ? 'true' : 'false') + '" aria-controls="petBonusSrc" data-label="' + srcLabel + '">'
    + (_petSrcOpen ? '▾ ' : '▸ ') + srcLabel + '</button>';
  h += '<div class="pet-src" id="petBonusSrc"' + (_petSrcOpen ? '' : ' hidden') + '>' + petBonusSrcHtml(bd) + '</div>';
  h += '<div class="pet-sec-title">③ 最终属性 <span class="pet-sec-sub">上场数值 · 点属性行看该属性的「基础 → 各来源 → 最终」</span></div>';
  h += '<div class="pet-grid">';
  PET_STAT_ROWS.forEach(function (r) {
    var on = (_petStatOpen === r.k);
    h += '<button class="pet-final-cell' + (on ? ' active' : '') + '" data-pet-stat="' + r.k + '" aria-expanded="' + (on ? 'true' : 'false') + '">'
      + '<span class="pet-cell-ico">' + r.ico + '</span><span class="pet-cell-name">' + r.name
      + '</span><b class="pet-cell-val">' + (bd.final[r.k] || 0) + '</b></button>';
  });
  h += '</div>';
  h += '<div class="pet-chain" id="petStatDetail"' + (_petStatOpen ? '' : ' hidden') + '>'
    + (_petStatOpen ? petStatChainHtml(bd, _petStatOpen) : '') + '</div>';
  h += '</div>';
  return h;
}

/* ============================================================
   对比宠物（作者要求：可选另一只宠对比、最终属性并排 + 差值、只显示主要几项、可退出）
   口径：**两只宠都按「此宠上场计算」**（与详情面板同一个 petStatBreakdown 口径）——
         UI 里明写这一行，避免「拿 A 的上场值比 B 的基础值」。
   交互：点宠物名开始对比 / 再点一次或点「退出对比」结束；换对象 = 直接点另一只。
   ⚠️ 不新增页面 / 路由，全部在宠物面板 overlay 内完成。
   ============================================================ */
function petCompareHtml(pet) {
  var d = getPetStore();
  var list = (d.pets || []).filter(function (p) { return p.speciesId !== pet.speciesId; });
  var ready = list.filter(function (p) { return canPetBattle(p); });
  if (ready.length) list = ready;     // 优先列可参战的（口径就是「上场计算」）
  var h = '<div class="pet-sec">';
  h += '<div class="pet-sec-hd">⚖️ 对比宠物 <span class="pet-sec-sub">（两只宠同口径：都按「此宠上场计算」）</span></div>';
  if (!list.length) {
    h += '<div class="pet-sec-empty">还没有其它宠物可以对比</div></div>';
    return h;
  }
  h += '<div class="pet-cmp-chips">';
  list.forEach(function (p) {
    var c = getPetCodex(p.speciesId) || {};
    var on = (_petCompareSel === p.speciesId);
    h += '<button class="speed-btn pet-cmp-chip' + (on ? ' active' : '') + '" data-pet-cmp="' + p.speciesId + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
      + petIconHtml(p.speciesId, 32) + '<span>' + (c.name || p.name || p.speciesId) + '</span></button>';
  });
  h += '</div>';
  var sel = null;
  list.forEach(function (p) { if (p.speciesId === _petCompareSel) sel = p; });
  if (!sel) h += '<div class="pet-sec-empty">点上面的宠物名开始对比（再点一次 = 结束对比）</div>';
  else h += petCompareResultHtml(pet, sel);
  h += '</div>';
  return h;
}

function petCompareResultHtml(petA, petB) {
  var na = (getPetCodex(petA.speciesId) || {}).name || petA.name;
  var nb = (getPetCodex(petB.speciesId) || {}).name || petB.name;
  var cmp = (typeof petCompareFinal === 'function') ? petCompareFinal(petA, petB) : null;
  var h = '<div class="pet-cmp-res">';
  h += '<div class="pet-cmp-note">口径：两只宠<b>都按「此宠上场计算」</b>（含凝聚/共鸣 ＋ 稀有度/宝珠倍率池）'
    + '—— 不是「本宠的上场值比对比宠的基础值」。</div>';
  if (!cmp || !cmp.ok) { h += '<div class="pet-sec-empty">（对比暂不可用）</div></div>'; return h; }
  h += '<table class="pet-cmp-table"><thead><tr><th scope="col">属性</th><th scope="col">本宠·' + na
    + '</th><th scope="col">对比·' + nb + '</th><th scope="col">差值</th></tr></thead><tbody>';
  cmp.rows.forEach(function (row) {
    var m = petStatMeta(row.key), dd = row.diff;
    var txt = (dd == null) ? '—' : (dd > 0 ? '+' + dd : (dd < 0 ? '−' + Math.abs(dd) : '0'));
    var cls = (dd == null || dd === 0) ? '' : (dd > 0 ? ' pet-cmp-up' : ' pet-cmp-dn');
    h += '<tr><th scope="row">' + m.ico + ' ' + m.name + '</th><td>' + row.a + '</td><td>' + row.b + '</td>'
      + '<td class="pet-cmp-diff' + cls + '">' + txt + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<button class="speed-btn pet-cmp-exit" id="petCmpExit">✕ 退出对比</button>';
  h += '</div>';
  return h;
}

/* 宠物详情（属性/炼化/技能/天赋）
   v2.1.3：补炼化进度条、技能指定升级
   v2.1.4：天赋改为固有展示（按 design-v2.0.md §2.6 回退「槽位解锁」） */
function renderPetDetail(pet, idx) {
  var ov = document.getElementById('panelOverlay')
  if (!ov) return
  var d = getPetStore()
  var bag = d.materials || {}
  var codex = getPetCodex(pet.speciesId) || {}
  var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="petDBack" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:var(--fs-base)">←</button>'
    /* v2.2.29：详情页头部也挂头像（与卡片同一个渲染入口） */
    +'<span class="pet-detail-ico">'+petIconHtml(pet.speciesId, 32)+'</span>'
    +'<span style="font-size:var(--fs-lg);font-weight:700">'+(codex.name||pet.name)+' <span style="color:var(--purple);font-size:var(--fs-xs)">'+pet.rarity+'</span></span>'
    +'<span style="flex:1"></span>'
    +'<span style="font-size:var(--fs-sm);color:var(--text2)">✨ 灵能 <b>'+(bag.spirit||0)+'</b></span>'
    +'</div>'
  // 炼化进度（v2.1.3）
  var maxLv = refineMaxLevel(pet.rarity)
  var rl = pet.refineLevel || 0
  var pct = maxLv ? Math.min(100, Math.round(rl / maxLv * 100)) : 0
  var rateN = Math.round(refineSuccessRate(pet, 'refineNormal') * 100)
  var rateH = Math.round(refineSuccessRate(pet, 'refineHigh') * 100)
  h += '<div style="font-size:var(--fs-xs);line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:baseline;gap:6px;font-weight:700;margin-bottom:6px">'
    +'<span>✨ 炼化</span><span style="font-size:var(--fs-xl);color:var(--brand-fill)">Lv'+rl+'</span>'
    +'<span style="color:var(--text3)">/ '+maxLv+'</span><span style="flex:1"></span>'
    +'<span style="color:var(--text3);font-weight:400">'+pct+'%</span></div>'
    +'<div style="height:8px;background:var(--surface-3);border-radius:4px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:var(--brand-fill);border-radius:4px;transition:width .3s"></div></div>'
    +'<div style="margin-top:6px;color:var(--text3)">成功率：普通石 '+(rateN ? rateN+'%' : '不可用（Lv≥50）')+'　·　高级石 '+rateH+'%</div>'
    +'</div>'
  /* v2.2 WP-I A-6：属性区重组 —— ① 基础属性 → ② 加成（统一 ×N%）→ ③ 最终属性。
     ⚠️ **只重组展示与表达**：所有数字来自 pet-store.js 的 `petStatBreakdown()`
     （它又直接复用 createPetUnit / benchBonusSum / resonanceBonus / boostPetForGroup
     这套数值口径），本处**不另算一套**、不写存档、不引入新字号/颜色。 */
  var bd = (typeof petStatBreakdown === 'function') ? petStatBreakdown(pet) : null
  h += petStatSectionsHtml(bd)
  // v2.2 WP-I A-6：对比宠物（同口径：两只宠都按「此宠上场计算」）
  h += petCompareHtml(pet)
  // v2.1.17 宝珠槽位
  h += orbSlotsHtml(pet, d).replace(/__IDX__/g, idx)
  // 技能（v2.1.3：指定技能升级，消耗灵能）
  h += '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">⚡ 技能 <span style="color:var(--text3);font-weight:400">（消耗 ✨ 升级，上限 Lv'+PET_SKILL_MAX_LEVEL+'）</span></div>'
  ;(codex.skills||[]).forEach(function(sid){
    var s = SKILLS[sid]
    if (!s) return
    var slv = pet.skillLevels ? pet.skillLevels[sid] || 0 : 0
    var cost = petSkillUpgradeCost(pet, sid)
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0">'
      +'<div style="flex:1">'+s.name+' <span style="color:var(--text3)">· '+s.type+(s.power?' '+s.power+'%':'')+' · Lv'+slv+'</span></div>'
      +(slv >= PET_SKILL_MAX_LEVEL
        ? '<span style="color:var(--green);font-size:var(--fs-2xs)">已满级</span>'
        : '<button class="speed-btn" data-pet-skill="'+sid+'" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">⬆ '+cost+'✨</button>')
      +'</div>'
  })
  if (!(codex.skills||[]).length) h += '<div style="color:var(--text3)">（无技能）</div>'
  h += '</div>'
  // 天赋（固有专属，design-v2.0.md §2.6：不可解锁、不可跨宠物装配）
  var curT = getPetTalents(pet)
  h += '<div style="font-size:var(--fs-xs);line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:10px 12px">'
  h += '<div style="font-weight:700;margin-bottom:4px">✨ 天赋 <span style="color:var(--text3);font-weight:400">（固有 '+curT.length+' 个）</span></div>'
  if (!curT.length) h += '<div style="color:var(--text3)">该稀有度暂无天赋</div>'
  curT.forEach(function(tid){
    var t = TALENTS[tid]
    h += '<div>'+(t?t.name:tid)+' <span style="color:var(--text3)">· '+(t?t.desc:'')+'</span></div>'
  })
  h += '</div>'
  /* 重渲染前记下滚动位置，赋值后还原 —— 详情页比一屏高，
     「展开属性 / 换对比对象」都会重渲染，不还原就会弹回顶部。 */
  var _st = ov.scrollTop
  ov.innerHTML = '<div class="panel-inner">' + h + '</div>'
  ov.classList.add('open')   // 防御：直接调用详情时也能显示（原先依赖 panel 已打开）
  ov.scrollTop = _st
  var back = document.getElementById('petDBack')
  if (back) back.addEventListener('click', function(){ _petCompareSel = null; renderPetPanel() })
  /* v2.2 WP-I A-6：属性区交互（纯前端状态，不写存档、不开新页面）
     ③ 的属性行：点开看该属性的「基础 → 各来源 → 最终」（同一时刻只展开一行）
     ② 「加成来源」：展开各来源明细（每项都是 ×N%） */
  function paintPetStatDetail() {
    var box = document.getElementById('petStatDetail')
    var show = !!(bd && bd.ok && _petStatOpen)
    if (box) {
      box.innerHTML = show ? petStatChainHtml(bd, _petStatOpen) : ''
      box.hidden = !show
    }
    ov.querySelectorAll('[data-pet-stat]').forEach(function (b) {
      var on = b.getAttribute('data-pet-stat') === _petStatOpen
      b.setAttribute('aria-expanded', on ? 'true' : 'false')
      b.classList.toggle('active', on)
    })
  }
  ov.querySelectorAll('[data-pet-stat]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-pet-stat')
      _petStatOpen = (_petStatOpen === k) ? null : k
      paintPetStatDetail()
    })
  })
  var srcBtn = document.getElementById('petBonusSrcBtn')
  if (srcBtn) srcBtn.addEventListener('click', function () {
    _petSrcOpen = !_petSrcOpen
    srcBtn.setAttribute('aria-expanded', _petSrcOpen ? 'true' : 'false')
    srcBtn.textContent = (_petSrcOpen ? '▾ ' : '▸ ') + (srcBtn.getAttribute('data-label') || '加成来源')
    var box = document.getElementById('petBonusSrc')
    if (box) box.hidden = !_petSrcOpen
  })
  /* 对比宠物：点宠物名开始对比；再点同一只 = 结束（可换对象、可退出，无新页面/路由） */
  function petDetailRerender() {
    var p2 = getPetStore().pets[idx]
    if (p2) renderPetDetail(p2, idx)
  }
  ov.querySelectorAll('[data-pet-cmp]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sid = btn.getAttribute('data-pet-cmp')
      _petCompareSel = (_petCompareSel === sid) ? null : sid
      petDetailRerender()
    })
  })
  var cmpExit = document.getElementById('petCmpExit')
  if (cmpExit) cmpExit.addEventListener('click', function () {
    _petCompareSel = null
    petDetailRerender()
  })
  // 技能升级
  ov.querySelectorAll('[data-pet-skill]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sid = btn.getAttribute('data-pet-skill')
      var d3 = getPetStore()
      var p3 = d3.pets[idx]
      if (!p3) return
      var r = upgradePetSkill(p3, d3.materials, sid)
      if (r.ok) { savePetStore(d3); toast('⚡ '+((SKILLS[sid]||{}).name||sid)+' → Lv'+r.level+'（-'+r.cost+' ✨）','s') }
      else { toast(r.reason || '升级失败','e') }
      renderPetDetail(p3, idx)
    })
  })
  // v2.1.17 宝珠：装配 / 升级 / 卸下
  ov.querySelectorAll('[data-orb-op]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var op = btn.getAttribute('data-orb-op')
      var t = btn.getAttribute('data-orb-type')
      var oid = btn.getAttribute('data-orb-id')
      var d8 = getPetStore()
      var p8 = d8.pets[idx]
      if (!p8) return
      if (op === 'equip') {
        var arr8 = d8.orbs || [], i8 = -1
        arr8.forEach(function(o, k){ if (o.id === oid) i8 = k })
        if (i8 < 0) { toast('宝珠不存在','e'); return }
        var orb8 = arr8.splice(i8, 1)[0]
        var old8 = (p8.orbs || {})[orb8.type]
        equipOrb(p8, orb8)
        if (old8) arr8.push(old8)          // 被替换下来的回库存
        savePetStore(d8)
        toast('💎 装配 ' + ((ORB_TYPES[orb8.type]||{}).name||orb8.type) + '（' + orb8.rarity + '）','s')
      } else if (op === 'unequip') {
        var r8 = unequipOrb(p8, t)
        if (!r8.ok) { toast(r8.reason || '卸下失败','e'); return }
        d8.orbs = d8.orbs || []
        d8.orbs.push(r8.orb)
        savePetStore(d8)
        toast('📤 已卸下','s')
      } else if (op === 'upgrade') {
        var o8 = (p8.orbs || {})[t]
        if (!o8) return
        var u8 = upgradeOrb(o8, d8.materials)
        if (!u8.ok) { toast(u8.reason || '升级失败','e'); return }
        savePetStore(d8)
        toast('⬆ Lv' + u8.level + '（+' + u8.stat + '）','s')
      }
      renderPetDetail(d8.pets[idx], idx)
    })
  })
}

/* 带宠物的敌群试炼 —— **回归唯一开战入口** `startGroupTrial()`
   v2.2 WP-H2（修「从固定小关开始 + 胜利覆盖进度」）：
   旧实现自己拼了一份开战逻辑（`GROUP_LEVELS['g5']` 写死大关 + 只取 `stages[0]`），
   并且**从不设置模块级的 `_groupStageId`** —— 于是：
     ① 战斗永远从写死的大关第 1 小关开始，而不是玩家当前进度；
     ② 胜利时 `_groupDone()` 读到的是**上一次 `startGroupTrial()` 留下的** `_groupStageId`，
        调 `markGroupStageCleared(旧关)` + 发奖励 → 把玩家真实进度覆盖成别人的通关记录。
   另外它还漏了 `_groupRewarded` 重置 / 随机种子 / `attachPlayerSkills` / 场地提示 / 已通关守卫。
   现在只把「参战选择」交给 `startGroupTrial`（它本就会读 `_petBattlePicks`），逻辑只有一份。 */
function startGroupTrialWithPets(groupId, petIds) {
  if (Array.isArray(petIds)) {
    _petBattlePicks = petIds.slice()
    if (typeof savePetBattlePicks === 'function') savePetBattlePicks(_petBattlePicks)
  }
  if (typeof startGroupTrial !== 'function') { toast('敌群模块未加载', 'e'); return }
  startGroupTrial(groupId)
}

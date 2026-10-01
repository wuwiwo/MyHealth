/* ============================================
   MyHealth — Pet UI (M4-6)
   宠物面板：列表/喂食/炼化/参战选择。
   入口：挑战页（敌群试炼旁）。
   依赖 pet-store.js / pets.js / pet-materials.js / pet-codex.js。
   ============================================ */


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
      var stageIcon = p.stage==='egg'?'🥚':p.stage==='grow'?'🌱':'🐾'
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
        +'<span class="pet-card-ico">'+stageIcon+'</span>'
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
      h += '<button class="speed-btn" data-pet-pick="'+p.speciesId+'" style="padding:3px 10px;'+(sel?'border-color:var(--green);color:var(--green)':'')+'">'+(getPetCodex(p.speciesId)||{}).name+'</button>'
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
  /* v2.2 WP-H5：属性拆解 —— 基础 ＋ 加成（凝聚 / 共鸣 / 宝珠%）→ 最终属性。
     ⚠️ **只改展示**：四个数全部来自 pet-store.js 的 `petStatBreakdown()`（它又直接复用
     createPetUnit / benchBonusSum / resonanceBonus / boostPetForGroup 这套数值口径），
     本处**不另算一套**、不写存档。 */
  var bd = (typeof petStatBreakdown === 'function') ? petStatBreakdown(pet) : null
  h += '<div style="font-size:var(--fs-xs);line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">📊 属性 <span style="color:var(--text3);font-weight:400">（基础 ＋ 加成 → 最终）</span></div>'
  if (!bd || !bd.ok) {
    h += '<div style="color:var(--text3)">（属性拆解暂不可用）</div>'
  } else {
    h += '<div style="color:var(--text3)">百分比池（逐属性）＝ 稀有度 <b style="color:var(--text2)">' + bd.rarityPct + '%</b> ＋ Σ宝珠%（速度不参与）</div>'
    h += '<div style="color:var(--text3)">加成来源＝团队凝聚（未上场 ' + bd.benchCount + ' 只 ×10%）＋共鸣 ' + Math.round((bd.resonanceRate || 0) * 100) + '%　·　按此宠上场计算</div>'
    ;[['❤️','HP','hp'],['⚔️','攻','atk'],['🛡️','防','def'],['👻','魂攻','soulAtk'],['🌫️','魂防','soulDef'],['💨','速','spd']].forEach(function(r){
      var k = r[2]
      var bv = bd.base[k] || 0
      var ch = bd.cohesion[k] || 0, rr = bd.resonance[k] || 0
      var add = ch + rr
      var src = []
      if (ch) src.push('凝聚 ' + ch)
      if (rr) src.push('共鸣 ' + rr)
      h += '<div>' + r[0] + ' ' + r[1] + ' <b style="color:var(--brand-fill)">' + (bd.final[k] || 0) + '</b>'
        + '<span style="color:var(--text3)"> ＝ 基础 ' + bv
        + (add ? ' ＋加成 <span style="color:var(--green)">' + add + '</span>（' + src.join('＋') + '）' : '')
        + (k === 'spd' ? '（不参与百分比）' : ' ×' + (bd.poolPct[k] || 0) + '%')
        + '</span></div>'
    })
  }
  h += '</div>'
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
  ov.innerHTML = '<div class="panel-inner">' + h + '</div>'
  ov.classList.add('open')   // 防御：直接调用详情时也能显示（原先依赖 panel 已打开）
  var back = document.getElementById('petDBack')
  if (back) back.addEventListener('click', function(){ renderPetPanel() })
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

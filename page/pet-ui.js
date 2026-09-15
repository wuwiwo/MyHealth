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
  h += '<div style="flex:1;font-weight:700">💎 宝珠 <span style="color:var(--text3);font-weight:400">（碎片 <b>' + sh + '</b>）</span></div>';
  h += '<button class="speed-btn" id="petSynth" style="padding:8px 12px;min-height:44px;font-size:var(--fs-sm);border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">🔮 合成 20💎（65%）</button>';
  h += '</div>';
  var bag = d.orbs || [];
  if (!bag.length) {
    h += '<div style="color:var(--text3);margin-top:6px">库存空 —— 合成后在宠物详情里装配</div>';
  } else {
    bag.forEach(function (o) {
      var ot = ORB_TYPES[o.type] || { name: o.type };
      var val = (typeof orbStat === 'function') ? orbStat(o) : 0;
      h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--surface-3)">';
      h += '<div style="flex:1">' + ot.name + ' <span style="color:var(--purple,#a855f7)">' + o.rarity + '</span> Lv' + (o.level || 1) + ' <span style="color:var(--green)">+' + val + '</span></div>';
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
  Object.keys(ORB_TYPES).forEach(function (t) {
    var ot = ORB_TYPES[t], o = eq[t];
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0">';
    if (o) {
      var val = (typeof orbStat === 'function') ? orbStat(o) : 0;
      var maxLv = (ot.maxLv && ot.maxLv[o.rarity]) || 10;
      var maxed = (o.level || 1) >= maxLv;
      var cost = (typeof orbUpgradeCost === 'function') ? orbUpgradeCost(o) : 0;
      h += '<div style="flex:1">' + ot.name + ' <span style="color:var(--purple,#a855f7)">' + o.rarity + '</span> Lv' + (o.level || 1) + ' <span style="color:var(--green)">+' + val + '</span></div>';
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
  h += '</div>';
  return h;
}

/* 宠物面板 overlay（新版式：卡片/大按钮/12px+） */
function renderPetPanel() {
  var ov = document.getElementById('panelOverlay')
  if (!ov) return
  var d = getPetStore()
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="petClose" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:var(--fs-base)">✕</button>'
    +'<span style="font-size:var(--fs-lg);font-weight:700">🐾 宠物面板</span>'
    +'<span style="flex:1"></span>'
    +'<button class="speed-btn" id="petSettle" style="padding:10px 14px;min-height:44px;font-size:var(--fs-base);border-color:var(--green);color:var(--green)">结算</button>'
    +'</div>'
  // 材料
  var m = d.materials || {}
  h += '<div style="font-size:var(--fs-sm);background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;gap:12px;flex-wrap:wrap;line-height:1.6">'
    +'<span>🧪 营养液 <b style="font-size:var(--fs-base)">'+m.nutrition+'</b></span>'
    +'<span>🍖 饲料 <b style="font-size:var(--fs-base)">'+m.feed+'</b></span>'
    +'<span>✨ 灵能 <b style="font-size:var(--fs-base)">'+m.spirit+'</b></span>'
    +'<span>🪨 炼化石 <b style="font-size:var(--fs-base)">'+m.refineNormal+'</b>/<b style="color:var(--purple,#a855f7);font-size:var(--fs-base)">'+m.refineHigh+'</b></span>'
    +'<span>💎 宝珠碎片 <b style="font-size:var(--fs-base)">'+m.orbShard+'</b></span>'
    +'<button class="speed-btn" id="petExchange" title="10 个普通炼化石兑换 1 个高级炼化石" style="padding:8px 10px;min-height:44px;font-size:var(--fs-sm)">🔄 兑换 10→1</button>'
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
      // 进度条（孵化/成长）
      var prog = p.stage==='egg' ? p.hatchProgress : p.stage==='grow' ? p.growth : 100
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg2);border-radius:14px;margin-bottom:10px">'
        +'<span style="font-size:var(--fs-2xl)">'+stageIcon+'</span>'
        +'<div style="flex:1">'
        +'<div style="font-size:var(--fs-lg);font-weight:600">'+(codex.name||p.name)+' <span style="color:var(--purple,#a855f7);font-size:var(--fs-xs)">'+p.rarity+'</span></div>'
        +'<div style="font-size:var(--fs-xs);color:var(--text3);margin:3px 0">'+stageText+' · 饥饿 '+Math.round(p.hunger)+' · 健康 '+Math.round(p.health)+(dead?' · '+dead:'')+'</div>'
        // 进度条
        +'<div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;border:1px solid var(--bg2)"><div style="width:'+Math.min(100,prog)+'%;height:100%;background:var(--orange);border-radius:3px;transition:width .3s"></div></div>'
        +'</div>'
        // 操作按钮（大按钮 44px）
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'
        +'<button class="speed-btn" data-pet-op="feed" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)">🍖喂</button>'
        +(p.stage==='egg'?'<button class="speed-btn" data-pet-op="nutrition" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)">🧪营养</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="refine" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm);border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">✨炼化</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="detail" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:var(--fs-sm)">📋</button>':'')
        +'</div>'
        +'</div>'
    })
  }
  // 参战选择（成熟宠物）
  var ready = d.pets.filter(function(p){return p.stage==='mature'&&!p.isDead})
  if (ready.length) {
    h += '<div style="margin-top:10px;font-size:var(--fs-xs)">⚔️ 选择参战宠物（最多 2 只）</div>'
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
  var synthBtn = document.getElementById('petSynth')
  if (synthBtn) synthBtn.addEventListener('click', function(){
    var d6 = getPetStore()
    if (typeof synthOrb !== 'function') { toast('宝珠模块未加载', 'e'); return }
    var r6 = synthOrb(d6.materials || (d6.materials = {}))
    if (r6.ok && r6.success) {
      d6.orbs = d6.orbs || []
      d6.orbs.push(r6.orb)
      savePetStore(d6)
      toast('🔮 合成 ' + ((ORB_TYPES[r6.type]||{}).name||r6.type) + '（' + r6.rarity + '）', 's')
    } else { savePetStore(d6); toast(r6.reason || '合成失败', 'e') }
    renderPetPanel()
  })
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
      if (op === 'feed') { var r = useFeed(pet, d2.materials); toast(r.reason || ('🍖 饥饿+' + r.inc.toFixed(0)), r.ok?'s':'e') }
      if (op === 'nutrition') { var r2 = useNutrition(pet, d2.materials); toast(r2.reason || ('🧪 孵化+' + r2.inc.toFixed(1)+'%'), r2.ok?'s':'e') }
      if (op === 'refine') { var r3 = attemptRefine(pet, d2.materials, 'refineHigh'); toast(r3.reason || ('✨ 炼化 +' + r3.gained + ' ' + r3.stat + '（Lv'+r3.level+'）'), r3.ok?'s':'e') }
      if (op === 'detail') { renderPetDetail(pet, idx); return }
      savePetStore(d2)
      renderPetPanel()
    })
  })
  ov.querySelectorAll('[data-pet-pick]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sid = btn.getAttribute('data-pet-pick')
      _petBattlePicks = _petBattlePicks || []
      var i = _petBattlePicks.indexOf(sid)
      if (i > -1) _petBattlePicks.splice(i, 1)
      else if (_petBattlePicks.length < 2) _petBattlePicks.push(sid)
      else { toast('最多携带 2 只宠物 ⚔️', 'e'); return }
      renderPetPanel()
    })
  })
  var startBtn = document.getElementById('petStartBattle')
  if (startBtn) startBtn.addEventListener('click', function(){
    ov.classList.remove('open')
    startGroupTrialWithPets('g5', _petBattlePicks || [])
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
  // 基础属性（codex + 炼化）
  var b = codex.base || {}
  var rs = pet.refineStats || {}
  h += '<div style="font-size:var(--fs-xs);line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">📊 属性（基础+炼化）</div>'
  h += '❤️ HP <b>'+(b.hp||0)+(rs.hp?'<span style="color:var(--green)">+'+rs.hp+'</span>':'')+'</b>'
  h += '　⚔️ 攻 <b>'+(b.atk||0)+(rs.atk?'<span style="color:var(--green)">+'+rs.atk+'</span>':'')+'</b>'
  h += '　🛡️ 防 <b>'+(b.def||0)+(rs.def?'<span style="color:var(--green)">+'+rs.def+'</span>':'')+'</b>'
  h += '　💨 速 <b>'+(b.spd||0)+'</b>'
  h += '　👻 魂攻 <b>'+(b.soulAtk||0)+(rs.soulAtk?'<span style="color:var(--green)">+'+rs.soulAtk+'</span>':'')+'</b>'
  // v2.1.17 已装配宝珠加成
  var _ob = (typeof orbStat === 'function' && pet.orbs) ? pet.orbs : null
  if (_ob) {
    var _add = {}
    Object.keys(_ob).forEach(function(t){ _add[t] = orbStat(_ob[t]) })
    if (_add.hp) h += '<span style="color:var(--purple,#a855f7)">+'+_add.hp+'</span>'
    if (_add.soulAtk) h += '<span style="color:var(--purple,#a855f7)">+'+_add.soulAtk+'</span>'
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

/* 带宠物的敌群试炼 */
function startGroupTrialWithPets(groupId, petIds) {
  var glv = (GROUP_LEVELS||{})[groupId]
  if (!glv) { toast('敌群关卡不存在','e'); return }
  var stats = getGameStats()
  // v2.1.10：敌群是独立属性空间，玩家只继承一定比例
  var gs = (typeof inheritGroupStats === 'function') ? inheritGroupStats(stats) : stats
  var player = createUnit({id:'player',side:'ally',name:'🧑 你',level:1,base:{hp:gs.hp,atk:gs.atk,def:gs.def,spd:10,soulAtk:gs.soulAtk||0,soulDef:gs.soulDef||0}})
  var petUnits = createPetUnitsForBattle(petIds, 2)
  if (typeof boostPetForGroup === 'function') petUnits.forEach(boostPetForGroup)
  var allies = [player].concat(petUnits)
  var gStage = (glv.stages || [])[0]
  var cfgList = (typeof groupStageEnemies === 'function' && gStage) ? groupStageEnemies(groupId, gStage, allies) : glv.enemies
  var enemies = cfgList.map(function(ec,i){
    return createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base})
  })
  var lgNum2 = parseInt(String(groupId).replace(/[^0-9]/g, ''), 10) || 1
  var terrain2 = (typeof groupTerrainFor === 'function') ? groupTerrainFor(lgNum2) : null
  _groupBattle = createGroupBattle({ allies:allies, enemies:enemies, terrain:terrain2 })
  _groupMode='auto';_groupSpeed=1;_groupDetail=null
  renderGroupOverlay(true)
  toast('👥 '+glv.name+' 开始！'+(petUnits.length?'（带 '+petUnits.length+' 宠物）':''),'s')
  _groupStep()
}

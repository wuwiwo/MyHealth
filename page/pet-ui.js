/* ============================================
   MyHealth — Pet UI (M4-6)
   宠物面板：列表/喂食/炼化/参战选择。
   入口：挑战页（敌群试炼旁）。
   依赖 pet-store.js / pets.js / pet-materials.js / pet-codex.js。
   ============================================ */

/* 宠物面板 overlay（新版式：卡片/大按钮/12px+） */
function renderPetPanel() {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  var d = getPetStore()
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="petClose" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:14px">✕</button>'
    +'<span style="font-size:18px;font-weight:700">🐾 宠物面板</span>'
    +'<span style="flex:1"></span>'
    +'<button class="speed-btn" id="petSettle" style="padding:10px 14px;min-height:44px;font-size:14px;border-color:var(--green);color:var(--green)">结算</button>'
    +'</div>'
  // 材料
  var m = d.materials || {}
  h += '<div style="font-size:13px;background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;gap:12px;flex-wrap:wrap;line-height:1.6">'
    +'<span>🧪 营养液 <b style="font-size:14px">'+m.nutrition+'</b></span>'
    +'<span>🍖 饲料 <b style="font-size:14px">'+m.feed+'</b></span>'
    +'<span>✨ 灵能 <b style="font-size:14px">'+m.spirit+'</b></span>'
    +'<span>🪨 炼化石 <b style="font-size:14px">'+m.refineNormal+'</b>/<b style="color:var(--purple,#a855f7);font-size:14px">'+m.refineHigh+'</b></span>'
    +'<span>💎 宝珠碎片 <b style="font-size:14px">'+m.orbShard+'</b></span>'
    +'</div>'
  // 宠物列表
  if (!d.pets.length) {
    h += '<div style="text-align:center;padding:32px 20px;color:var(--text3);font-size:14px;background:var(--bg2);border-radius:16px">还没有宠物 🐾<br><span style="font-size:12px">先领一颗蛋开始养成吧</span><br><button class="speed-btn" id="petGetEgg" style="margin-top:14px;padding:12px 20px;min-height:48px;font-size:15px;border-color:var(--orange);color:var(--orange)">🥚 获取初始蛋</button></div>'
  } else {
    d.pets.forEach(function(p, i) {
      var codex = getPetCodex(p.speciesId) || { name: p.name, rarity: p.rarity }
      var stageIcon = p.stage==='egg'?'🥚':p.stage==='grow'?'🌱':'🐾'
      var stageText = p.stage==='egg'?'孵化 '+Math.round(p.hatchProgress)+'%':p.stage==='grow'?'成长 '+Math.round(p.growth)+'%':'成熟'
      var dead = p.isDead ? '<span style="color:var(--red)">💀 阵亡</span>' : ''
      // 进度条（孵化/成长）
      var prog = p.stage==='egg' ? p.hatchProgress : p.stage==='grow' ? p.growth : 100
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg2);border-radius:14px;margin-bottom:10px">'
        +'<span style="font-size:26px">'+stageIcon+'</span>'
        +'<div style="flex:1">'
        +'<div style="font-size:16px;font-weight:600">'+(codex.name||p.name)+' <span style="color:var(--purple,#a855f7);font-size:12px">'+p.rarity+'</span></div>'
        +'<div style="font-size:12px;color:var(--text3);margin:3px 0">'+stageText+' · 饥饿 '+Math.round(p.hunger)+' · 健康 '+Math.round(p.health)+(dead?' · '+dead:'')+'</div>'
        // 进度条
        +'<div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;border:1px solid var(--bg2)"><div style="width:'+Math.min(100,prog)+'%;height:100%;background:var(--orange);border-radius:3px;transition:width .3s"></div></div>'
        +'</div>'
        // 操作按钮（大按钮 44px）
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'
        +'<button class="speed-btn" data-pet-op="feed" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:13px">🍖喂</button>'
        +(p.stage==='egg'?'<button class="speed-btn" data-pet-op="nutrition" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:13px">🧪营养</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="refine" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:13px;border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">✨炼化</button>':'')
        +(p.stage==='mature'&&!p.isDead?'<button class="speed-btn" data-pet-op="detail" data-pet-idx="'+i+'" style="padding:10px 12px;min-height:44px;font-size:13px">📋</button>':'')
        +'</div>'
        +'</div>'
    })
  }
  // 参战选择（成熟宠物）
  var ready = d.pets.filter(function(p){return p.stage==='mature'&&!p.isDead})
  if (ready.length) {
    h += '<div style="margin-top:10px;font-size:.75rem">⚔️ 选择参战宠物（最多 2 只）</div>'
    h += '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'
    ready.forEach(function(p, ri) {
      var sel = (_petBattlePicks||[]).includes(p.speciesId)
      h += '<button class="speed-btn" data-pet-pick="'+p.speciesId+'" style="padding:3px 10px;'+(sel?'border-color:var(--green);color:var(--green)':'')+'">'+(getPetCodex(p.speciesId)||{}).name+'</button>'
    })
    h += '</div>'
    h += '<div style="margin-top:8px"><button class="speed-btn" id="petStartBattle" style="padding:4px 16px;border-color:var(--orange);color:var(--orange)">⚔️ 开始敌群试炼（带宠物）</button></div>'
  }
  ov.innerHTML = h
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
      if (op === 'detail') { renderPetDetail(pet); return }
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

/* 宠物详情（属性/技能/天赋/炼化） */
function renderPetDetail(pet) {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  var codex = getPetCodex(pet.speciesId) || {}
  var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    +'<button class="speed-btn" id="petDBack" style="padding:2px 8px">← 返回</button>'
    +'<span style="font-size:.9rem;font-weight:700">'+(codex.name||pet.name)+' <span style="color:var(--purple,#a855f7);font-size:.7rem">'+pet.rarity+'</span></span>'
    +'</div>'
  // 基础属性（codex + 炼化）
  var b = codex.base || {}
  var rs = pet.refineStats || {}
  h += '<div style="font-size:.72rem;line-height:1.8;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">📊 属性（基础+炼化）</div>'
  h += '❤️ HP <b>'+(b.hp||0)+(rs.hp?'<span style="color:var(--green)">+'+rs.hp+'</span>':'')+'</b>'
  h += '　⚔️ 攻 <b>'+(b.atk||0)+(rs.atk?'<span style="color:var(--green)">+'+rs.atk+'</span>':'')+'</b>'
  h += '　🛡️ 防 <b>'+(b.def||0)+(rs.def?'<span style="color:var(--green)">+'+rs.def+'</span>':'')+'</b>'
  h += '　💨 速 <b>'+(b.spd||0)+'</b>'
  h += '　👻 魂攻 <b>'+(b.soulAtk||0)+(rs.soulAtk?'<span style="color:var(--green)">+'+rs.soulAtk+'</span>':'')+'</b>'
  h += '</div>'
  // 技能
  h += '<div style="font-size:.72rem;line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
  h += '<div style="font-weight:700;margin-bottom:4px">⚡ 技能</div>'
  ;(codex.skills||[]).forEach(function(sid){
    var s = SKILLS[sid]
    if (!s) return
    var lv = pet.skillLevels ? pet.skillLevels[sid] || 0 : 0
    h += '<div>'+s.name+' <span style="color:var(--text3)">· '+s.type+(s.power?' '+s.power+'%':'')+' · Lv'+lv+'</span></div>'
  })
  h += '</div>'
  // 天赋
  h += '<div style="font-size:.72rem;line-height:1.7;background:var(--bg2);border-radius:var(--r);padding:8px 10px">'
  h += '<div style="font-weight:700;margin-bottom:4px">✨ 天赋</div>'
  ;(codex.talents||[]).forEach(function(tid){
    var t = TALENTS[tid]
    if (!t) return
    h += '<div>'+t.name+' <span style="color:var(--text3)">· '+t.desc+'</span></div>'
  })
  if (!(codex.talents||[]).length) h += '<div style="color:var(--text3)">（无天赋）</div>'
  h += '</div>'
  ov.innerHTML = h
  var back = document.getElementById('petDBack')
  if (back) back.addEventListener('click', function(){ renderPetPanel() })
}

/* 带宠物的敌群试炼 */
function startGroupTrialWithPets(groupId, petIds) {
  var glv = (GROUP_LEVELS||{})[groupId]
  if (!glv) { toast('敌群关卡不存在','e'); return }
  var stats = getGameStats()
  var player = createUnit({id:'player',side:'ally',name:'🧑 你',level:1,base:{hp:stats.hp,atk:stats.atk,def:stats.def,spd:10,soulAtk:stats.soulAtk||0,soulDef:stats.soulDef||0}})
  var petUnits = createPetUnitsForBattle(petIds, 2)
  var enemies = glv.enemies.map(function(ec,i){
    return createEnemyUnit({id:'enemy-'+i,tier:ec.tier,name:ec.name,talents:ec.talents,skills:ec.skills,base:ec.base})
  })
  _groupBattle = createGroupBattle({ allies:[player].concat(petUnits), enemies:enemies })
  _groupMode='auto';_groupSpeed=1;_groupDetail=null
  renderGroupOverlay(true)
  toast('👥 '+glv.name+' 开始！'+(petUnits.length?'（带 '+petUnits.length+' 宠物）':''),'s')
  _groupStep()
}

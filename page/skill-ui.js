/* ============================================
   MyHealth — Skill Panel UI (M1-3)
   个人培养页：技能列表 + 升级 + 装备槽位 + 技能点。
   入口：挑战页（宠物面板旁）。
   依赖 skills.js / skill-store.js。
   ============================================ */

/* 挑战页渲染时调用：插入技能入口 */
function renderSkillEntry() {
  var gc = document.getElementById('gameContent')
  if (!gc) return
  var old = document.getElementById('skillEntryWrap')
  if (old) old.remove()
  var wrap = document.createElement('div')
  wrap.id = 'skillEntryWrap'
  wrap.style = 'margin-top:10px'
  var st = getSkillState()
  var equipped = (st.loadout || []).filter(Boolean).length
  wrap.innerHTML = '<div class="chapter-hdr" style="margin-top:4px">⚡ 技能培养 <span style="font-size:.65rem;color:var(--text3)">· M1 '+equipped+'/'+st.slotsUnlocked+' 已装备</span></div>'
    +'<div class="lv-grid">'
    +'<div class="lv-card" data-skill-panel style="border-color:var(--blue-g,#3b82f633)"><div class="lv-num">⚡</div><div class="lv-name">技能面板</div><div class="lv-status" style="color:var(--blue,#3b82f6)">'+st.points+' 点</div></div>'
    +'</div>'
  gc.parentNode.insertBefore(wrap, gc.nextSibling)
  var btn = wrap.querySelector('[data-skill-panel]')
  if (btn) btn.addEventListener('click', function(){ renderSkillPanel() })
}

/* 技能面板 overlay */
function renderSkillPanel() {
  var ov = document.getElementById('battleOverlay')
  if (!ov) return
  var st = getSkillState()
  var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="skillClose" style="padding:8px 10px;min-height:44px;min-width:44px">✕</button>'
    +'<span style="font-size:.9rem;font-weight:700">⚡ 技能培养</span>'
    +'<span style="flex:1"></span>'
    +'<span style="font-size:.8rem;font-weight:700;color:var(--blue,#3b82f6)">💠 '+st.points+' 点</span>'
    +'</div>'
  // 槽位
  h += '<div style="font-size:.72rem;background:var(--bg2);border-radius:var(--r);padding:8px 10px;margin-bottom:8px">'
    +'<div style="font-weight:700;margin-bottom:4px">🎯 装备槽位（'+st.slotsUnlocked+'/3，同类型限1）</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
  for (var i = 0; i < 3; i++) {
    var sid = (st.loadout || [])[i] || null
    var s = sid ? getPlayerSkill(sid) : null
    h += '<div style="flex:1;min-width:90px;border:1px solid '+(i < st.slotsUnlocked ? 'var(--bg2)' : 'var(--bg2)')+';border-radius:8px;padding:6px;text-align:center;'+(i>=st.slotsUnlocked?'opacity:.35':'')+'">'
      +(sid ? '<div style="font-size:.7rem;font-weight:600">'+s.name+'</div><div style="font-size:.6rem;color:var(--text3)">Lv'+(st.levels[sid]||0)+' · '+s.type+'</div>'
            +'<button class="speed-btn" data-skill-uneq="'+i+'" style="padding:2px 8px;margin-top:4px;font-size:.6rem">卸下</button>'
            :'<div style="font-size:.65rem;color:var(--text3)">空槽'+(i<st.slotsUnlocked?'':' 🔒')+'</div>')
      +'</div>'
  }
  h += '</div></div>'
  // 技能列表
  listPlayerSkills().forEach(function(id){
    var s = getPlayerSkill(id)
    var lv = st.levels[id] || 0
    var cost = lv >= s.maxLevel ? 0 : skillUpgradeCost(s, lv)
    var equippedSlot = (st.loadout||[]).indexOf(id)
    h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bg2)">'
      +'<div style="flex:1">'
      +'<div style="font-size:.8rem;font-weight:600">'+s.name+' <span style="color:var(--text3);font-size:.62rem">'+s.type+'</span>'+(equippedSlot>-1?' <span style="color:var(--green);font-size:.62rem">● 已装备槽'+equippedSlot+'</span>':'')+'</div>'
      +'<div style="font-size:.62rem;color:var(--text3)">'+s.desc.replace('n', lv)+'</div>'
      +'<div style="font-size:.6rem;color:var(--text3)">Lv '+lv+'/'+s.maxLevel+(lv>=s.maxLevel?' · 已满级':' · 升级需 '+cost+' 点')+'</div>'
      +'</div>'
      // 操作
      +(equippedSlot>-1
        ? '<button class="speed-btn" data-skill-equip="'+id+'" data-slot="'+equippedSlot+'" style="padding:4px 8px;font-size:.65rem;border-color:var(--green);color:var(--green)">装备中</button>'
        : '<button class="speed-btn" data-skill-equip="'+id+'" style="padding:4px 8px;font-size:.65rem">装备</button>')
      +'<button class="speed-btn" data-skill-up="'+id+'" style="padding:4px 8px;font-size:.65rem;'+(lv>=s.maxLevel||st.points<cost?'opacity:.4':'')+'" '+(lv>=s.maxLevel||st.points<cost?'disabled':'')+'>↑ 升级'+(cost?'('+cost+')':'')+'</button>'
      +'</div>'
  })
  ov.innerHTML = h
  ov.classList.add('open')

  var closeBtn = document.getElementById('skillClose')
  if (closeBtn) closeBtn.addEventListener('click', function(){ ov.classList.remove('open') })
  // 升级
  ov.querySelectorAll('[data-skill-up]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-skill-up')
      var r = skillUpgrade(id)
      toast(r.ok ? ('⚡ '+getPlayerSkill(id).name+' → Lv'+r.level) : r.reason, r.ok?'s':'e')
      renderSkillPanel()
    })
  })
  // 装备（循环槽位：找到第一个可用槽）
  ov.querySelectorAll('[data-skill-equip]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-skill-equip')
      var curSlot = btn.getAttribute('data-slot')
      var st2 = getSkillState()
      // 找空槽
      var slot = -1
      for (var i = 0; i < st2.slotsUnlocked; i++) {
        if (!st2.loadout[i] || st2.loadout[i] === id) { slot = i; break }
      }
      if (slot < 0) { toast('没有空槽位 🎯', 'e'); return }
      var r = skillEquip(slot, id)
      toast(r.ok ? ('🎯 已装备 '+getPlayerSkill(id).name+' → 槽'+slot) : r.reason, r.ok?'s':'e')
      renderSkillPanel()
    })
  })
  // 卸下
  ov.querySelectorAll('[data-skill-uneq]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var slot = parseInt(btn.getAttribute('data-skill-uneq'))
      skillUnequip(slot)
      toast('已卸下','s')
      renderSkillPanel()
    })
  })
}

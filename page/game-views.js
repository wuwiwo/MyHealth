/* ============================================
   MyHealth — Game Tab Views (挑战页重构)
   三个选项卡：培养 / 战斗 / 记录
   排版规范：按钮大（min-height 48px）、呼吸感（间距 14-16px）、字号 12/14-16/18
   依赖 game-render.js（战斗逻辑复用）
   ============================================ */

var _gameTab = 'train'   // 'train' | 'battle' | 'record'

/* 主入口：渲染挑战页（替代原 renderGame 的视图部分） */
function renderGameViews() {
  renderGameTabBar()
  renderTrainView()
  renderBattleView()
  renderRecordView()
  switchGameTab(_gameTab)
}

/* 选项卡栏事件（index.html 静态按钮） */
function renderGameTabBar() {
  document.querySelectorAll('[data-gtab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchGameTab(btn.getAttribute('data-gtab'))
    })
  })
}

function switchGameTab(tab) {
  _gameTab = tab
  document.querySelectorAll('[data-gtab]').forEach(function (b) {
    var on = b.getAttribute('data-gtab') === tab
    b.classList.toggle('active', on)
    b.style.borderColor = on ? 'var(--orange)' : ''
    b.style.color = on ? 'var(--orange)' : ''
  })
  var vTrain = document.getElementById('gameTrainView')
  var vBattle = document.getElementById('gameBattleView')
  var vRecord = document.getElementById('gameRecordView')
  if (!vTrain) return
  vTrain.style.display = tab === 'train' ? 'block' : 'none'
  vBattle.style.display = tab === 'battle' ? 'block' : 'none'
  vRecord.style.display = tab === 'record' ? 'block' : 'none'
}

/* ===== 培养视图：角色属性卡 + 宠物 + 技能 ===== */
function renderTrainView() {
  var v = document.getElementById('gameTrainView')
  if (!v) return
  var stats = getGameStats()
  var st = getSkillState()
  var d = getPetStore()

  // 角色属性卡
  var h = '<div style="background:linear-gradient(135deg,var(--bg2),var(--bg2));border:1px solid var(--orange-g);border-radius:16px;padding:18px;margin-bottom:16px">'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    +'<div style="font-size:28px;width:56px;height:56px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--orange)">🧑</div>'
    +'<div style="flex:1"><div style="font-size:18px;font-weight:700">我的角色</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-top:2px">Lv 1 · 健身勇士</div></div>'
    +'<div style="text-align:center;background:var(--bg2);border-radius:12px;padding:8px 16px"><div style="font-size:22px;font-weight:700;color:var(--orange)">⚔️ '+stats.atk+'</div><div style="font-size:12px;color:var(--text3)">攻击</div></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
    +statCell('❤️','生命',stats.hp)
    +statCell('🛡️','防御',stats.def)
    +statCell('👻','魂攻',stats.soulAtk||0)
    +statCell('🔮','魂防',stats.soulDef||0)
    +statCell('🏆','通关',getGame().cleared.length)
    +statCell('💠','技能点',st.points)
    +'</div>'
    +'</div>'
  // 宠物区块
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">🐾 宠物 <span style="font-size:12px;color:var(--text3)">'+d.pets.length+' 只 · 成熟 '+d.pets.filter(p=>p.stage==="mature"&&!p.isDead).length+'</span></div>'
  h += '<button class="speed-btn" data-open-pet style="width:100%;padding:14px;font-size:15px;min-height:48px;border-radius:12px;border-color:var(--green);color:var(--green);margin-bottom:16px">🐾 宠物面板（养成/参战/宝珠）</button>'
  // 技能区块
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">⚡ 技能 <span style="font-size:12px;color:var(--text3)">'+(st.loadout||[]).filter(Boolean).length+'/'+st.slotsUnlocked+' 已装备</span></div>'
  h += '<button class="speed-btn" data-open-skill style="width:100%;padding:14px;font-size:15px;min-height:48px;border-radius:12px;border-color:var(--blue);color:var(--blue)">⚡ 技能培养面板</button>'
  // 材料区块：获取说明 + 获取记录
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">📦 道具材料 <span style="font-size:12px;color:var(--text3)">获取与记录</span></div>'
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:12px">'
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">💡 获取方式</div>'
  Object.keys(MATERIAL_NAMES).forEach(function(t){
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;border-bottom:1px solid var(--bg2)">'
      +'<span style="width:110px;font-weight:600">'+getMaterialName(t)+'</span>'
      +'<span style="flex:1;color:var(--text3);font-size:12px">'+MATERIAL_SOURCES[t]+'</span>'
      +'<span style="font-weight:700;font-size:14px">×'+(d.materials[t]||0)+'</span>'
      +'</div>'
  })
  h += '</div>'
  // 获取记录
  var log = d.materialLog || []
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px">'
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">📜 最近获取</div>'
  if (!log.length) {
    h += '<div style="font-size:13px;color:var(--text3);text-align:center;padding:14px">暂无获取记录<br><span style="font-size:12px">通关隐藏挑战可获得材料</span></div>'
  } else {
    log.slice(0, 10).forEach(function(l){
      h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid var(--bg2)">'
        +'<span style="flex:1">'+getMaterialName(l.type)+'</span>'
        +'<span style="color:var(--green);font-weight:700;font-size:14px">+'+(l.n||1)+'</span>'
        +'<span style="color:var(--text3);font-size:12px">'+l.date+'</span>'
        +'</div>'
    })
  }
  h += '</div>'
  v.innerHTML = h
  var petBtn = v.querySelector('[data-open-pet]')
  if (petBtn) petBtn.addEventListener('click', function () { renderPetPanel() })
  var skillBtn = v.querySelector('[data-open-skill]')
  if (skillBtn) skillBtn.addEventListener('click', function () { renderSkillPanel() })
}

function statCell(icon, label, val) {
  return '<div style="background:var(--bg2);border-radius:12px;padding:10px 6px"><div style="font-size:16px;font-weight:700">'+icon+' '+val+'</div><div style="font-size:12px;color:var(--text3);margin-top:2px">'+label+'</div></div>'
}

/* ===== 战斗视图：本旬目标 + 敌群 + 关卡 ===== */

/* 大关内 10 小关列表 */
function showGroupStages(groupId) {
  var glv = (GROUP_LEVELS || {})[groupId]
  if (!glv) return
  var v = document.getElementById('gameBattleView')
  if (!v) return
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<button class="speed-btn" id="groupBack" style="padding:10px 12px;min-height:44px;font-size:14px">← 返回</button>'
    +'<span style="font-size:18px;font-weight:700">'+glv.name+'</span>'
    +'<span style="flex:1"></span>'
    +'<span style="font-size:12px;color:var(--text3)">'+glv.desc+'</span>'
    +'</div>'
  h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">'
  glv.stages.forEach(function (st) {
    var cleared = isGroupStageCleared(st.id)
    var unlocked = isGroupStageUnlocked(st.id)
    var icon = st.type === 'boss' ? '👑' : st.type === 'elite' ? '⭐' : '⚔️'
    var color = st.type === 'boss' ? 'var(--red)' : st.type === 'elite' ? 'var(--orange)' : 'var(--blue)'
    // 状态：已通关（锁定灰）/ 可挑战 / 未解锁
    var statusHtml, btnStyle
    if (cleared) {
      statusHtml = '<span style="font-size:11px;color:var(--green)">✅ 已通关</span>'
      btnStyle = 'opacity:.5;border-color:var(--green);color:var(--green)'
    } else if (unlocked) {
      statusHtml = '<span style="font-size:11px">⚔️ 可挑战</span>'
      btnStyle = 'border-color:' + color + ';color:' + color
    } else {
      statusHtml = '<span style="font-size:11px">🔒 未解锁</span>'
      btnStyle = 'opacity:.35'
    }
    h += '<button class="speed-btn" data-stage="'+st.id+'" '+(unlocked && !cleared ? '' : 'disabled')+' style="padding:12px 4px;min-height:56px;font-size:13px;border-radius:10px;'+btnStyle+';display:flex;flex-direction:column;align-items:center">'
      +'<span style="font-size:16px">'+icon+'</span>'
      +'<span style="font-size:12px;margin-top:2px">'+st.name.replace(/^[⭐👑] /,'')+'</span>'
      +statusHtml
      +'</button>'
  })
  h += '</div>'
  // 进度条
  var stats = groupProgressStats()
  h += '<div style="margin-top:12px;font-size:13px;color:var(--text3)">📈 敌群进度：'+stats.cleared+'/'+stats.total+' 关通关</div>'
  v.innerHTML = h
  var back = document.getElementById('groupBack')
  if (back) back.addEventListener('click', function () { renderBattleView() })
  v.querySelectorAll('[data-stage]').forEach(function (c) {
    c.addEventListener('click', function () { startGroupTrial(c.getAttribute('data-stage')) })
  })
}
function renderBattleView() {
  var v = document.getElementById('gameBattleView')
  if (!v) return
  var stats = getGameStats()
  var h = ''

  // 本旬目标卡
  var p = stats.period
  var wkStatus = stats.periodDays >= 6 ? '🎉 旬达标！' : ('💪 ' + stats.periodDays + '/6天')
  h += '<div style="background:var(--bg2);border-radius:16px;padding:16px;margin-bottom:16px">'
    +'<div style="font-size:16px;font-weight:700;margin-bottom:10px">🗓️ 本旬目标 · '+p.name+'</div>'
    +'<div style="display:flex;gap:10px">'
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--orange-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:700;color:var(--orange)">'+stats.periodDays+'<span style="font-size:12px">/6天</span></div><div style="font-size:12px;color:var(--text3)">训练天数</div></div>'
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--blue-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:700;color:var(--blue)">'+stats.periodVol+'<span style="font-size:12px">kg</span></div><div style="font-size:12px;color:var(--text3)">旬容量</div></div>'
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--green-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:700;color:var(--green)">'+wkStatus+'</div><div style="font-size:12px;color:var(--text3)">状态</div></div>'
    +'</div></div>'

  // 敌群战斗（6 大关 × 10 小关）
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">👥 敌群试炼 <span style="font-size:12px;color:var(--text3)">6 大关 · 每关 10 小关</span></div>'
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">'
  Object.entries(GROUP_LEVELS || {}).forEach(function ([k, glv]) {
    h += '<button class="speed-btn" data-group="'+glv.id+'" style="padding:14px 10px;font-size:14px;min-height:56px;border-radius:12px;text-align:left;display:flex;flex-direction:column">'
      +'<span style="font-size:15px;font-weight:600">'+glv.name+'</span>'
      +'<span style="font-size:12px;color:var(--text3);margin-top:2px">'+glv.desc+'</span>'
      +'</button>'
  })
  h += '</div>'

  // 关卡试炼（原关卡列表，简化为入口）
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">⚔️ 关卡试炼</div>'
  h += '<button class="speed-btn" data-open-levels style="width:100%;padding:14px;font-size:15px;min-height:48px;border-radius:12px;border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">🗺️ 挑战关卡（'+Object.keys(LEVELS).length+' 章）</button>'

  v.innerHTML = h
  v.querySelectorAll('[data-group]').forEach(function (c) {
    c.addEventListener('click', function () { showGroupStages(c.getAttribute('data-group')) })
  })
  var lvBtn = v.querySelector('[data-open-levels]')
  if (lvBtn) lvBtn.addEventListener('click', function () {
    // 展开关卡列表（复用 gameContent，标记打开状态）
    var gc = document.getElementById('gameContent')
    var vv = document.getElementById('gameBattleView')
    if (gc && vv) {
      gc._levelViewOpen = true
      gc.style.display = 'block'
      vv.style.display = 'none'
      renderGame()
    }
  })
}

/* ===== 记录视图：本月最佳 + 历史最佳 ===== */
function renderRecordView() {
  var v = document.getElementById('gameRecordView')
  if (!v) return
  var prs = store.get('prs') || {}
  var stats = getGameStats()
  var h = ''

  h += '<div style="font-size:16px;font-weight:700;margin-bottom:10px">🏆 历史最佳</div>'
  var keys = Object.keys(prs)
  if (!keys.length) {
    h += '<div style="background:var(--bg2);border-radius:12px;padding:20px;text-align:center;font-size:14px;color:var(--text3)">暂无最佳记录<br><span style="font-size:12px">去训练并完成挑战吧</span></div>'
  } else {
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
    keys.slice(0, 8).forEach(function (k) {
      var pr = prs[k]
      h += '<div style="background:var(--bg2);border-radius:12px;padding:12px">'
        +'<div style="font-size:14px;font-weight:600">'+k+'</div>'
        +'<div style="font-size:12px;color:var(--text3);margin-top:4px">'
        +(pr.maxWeight ? '最大重量 '+pr.maxWeight+'kg' : '')+(pr.maxReps ? ' · 最大次数 '+pr.maxReps : '')+(pr.maxVolume ? ' · 最大容量 '+pr.maxVolume : '')
        +'</div></div>'
    })
    h += '</div>'
  }
  // 属性最佳
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">📊 属性记录</div>'
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
  h += statCell('⚔️','最高攻击',stats.atk)
  h += statCell('🛡️','最高防御',stats.def)
  h += statCell('❤️','最高生命',stats.hp)
  h += '</div>'
  v.innerHTML = h
}

/* 初始化：挂载到 renderGame 之后（保留战斗逻辑） */
function initGameViews() {
  renderGameViews()
}

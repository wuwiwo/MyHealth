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
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    +'<div style="font-size:28px;width:52px;height:52px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--orange)">🧑</div>'
    +'<div style="flex:1"><div style="font-size:18px;font-weight:700">我的角色</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-top:2px">力量训练 → 攻击/生命 ｜ 有氧 → 防御/生命</div></div>'
    +'<div style="text-align:right"><div style="font-size:18px;font-weight:700;color:var(--orange)">'+stats.atk+'</div><div style="font-size:12px;color:var(--text3)">攻击</div></div>'
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

  // 敌群战斗
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">👥 敌群试炼</div>'
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">'
  Object.entries(GROUP_LEVELS || {}).forEach(function ([k, glv]) {
    h += '<button class="speed-btn" data-group="'+glv.id+'" style="padding:14px 10px;font-size:14px;min-height:56px;border-radius:12px;text-align:left;display:flex;flex-direction:column">'
      +'<span style="font-size:15px;font-weight:600">'+glv.name+'</span>'
      +'<span style="font-size:12px;color:var(--text3);margin-top:2px">'+glv.enemies.length+' 敌 · '+glv.desc+'</span>'
      +'</button>'
  })
  h += '</div>'

  // 关卡试炼（原关卡列表，简化为入口）
  h += '<div style="font-size:16px;font-weight:700;margin:18px 0 10px">⚔️ 关卡试炼</div>'
  h += '<button class="speed-btn" data-open-levels style="width:100%;padding:14px;font-size:15px;min-height:48px;border-radius:12px;border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">🗺️ 挑战关卡（'+Object.keys(LEVELS).length+' 章）</button>'

  v.innerHTML = h
  v.querySelectorAll('[data-group]').forEach(function (c) {
    c.addEventListener('click', function () { startGroupTrial(c.getAttribute('data-group')) })
  })
  var lvBtn = v.querySelector('[data-open-levels]')
  if (lvBtn) lvBtn.addEventListener('click', function () {
    // 展开关卡列表（复用 gameContent）
    var gc = document.getElementById('gameContent')
    var vv = document.getElementById('gameBattleView')
    if (gc && vv) { gc.style.display = 'block'; vv.style.display = 'none'; renderGame() }
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

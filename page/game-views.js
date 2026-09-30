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
  // 关卡列表只在战斗视图内展开时可见（防漏到培养/记录页）
  var gc = document.getElementById('gameContent')
  if (gc) gc.style.display = (tab === 'battle' && gc._levelViewOpen) ? 'block' : 'none'
}

/* ===== 培养视图：角色属性卡 + 宠物 + 技能 ===== */
function renderTrainView() {
  var v = document.getElementById('gameTrainView')
  if (!v) return
  var stats = getGameStats()
  /* WP-G：角色等级系统 —— 结算季度/周（幂等）并把等级加成并进展示属性
     （与单敌/敌群战斗同一口径：等级效果无任何倍率，敌群 ×2 已按作者裁决删除） */
  if (typeof syncLevel === 'function') syncLevel()
  if (typeof applyPlayerLevelBonus === 'function') applyPlayerLevelBonus(stats)
  var _lv = (typeof levelState === 'function') ? levelState() : null
  /* 称号：文案唯一来源 = page/level-titles.js（经 level-system.js 的 levelTitle() 取），
     展示层不写死任何称号文案；levelState 不可用时回落 lv1 档称号 */
  var _lvTitle = (typeof levelTitle === 'function') ? levelTitle(_lv ? _lv.level : 1) : ''
  var _lvInline = _lv
    ? ('Lv ' + _lv.level + ' · ' + _lvTitle + ' · 经验 ' + _lv.inLevel + '/' + _lv.need)
    : ('Lv ' + ((typeof LEVEL_START === 'number') ? LEVEL_START : 1) + ' · ' + _lvTitle)
  var st = getSkillState()
  var d = getPetStore()

  // 角色属性卡
  var h = '<div style="background:linear-gradient(135deg,var(--bg2),var(--bg2));border:1px solid var(--orange-g);border-radius:16px;padding:18px;margin-bottom:16px">'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    +'<div style="font-size:var(--fs-2xl);width:56px;height:56px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--orange)">🧑</div>'
    +'<div style="flex:1"><div style="font-size:var(--fs-lg);font-weight:700">我的角色</div>'
    +'<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">'+_lvInline+'</div></div>'
    +'<div style="text-align:center;background:var(--bg2);border-radius:12px;padding:8px 16px"><div style="font-size:var(--fs-2xl);font-weight:700;color:var(--orange)">⚔️ '+stats.atk+'</div><div style="font-size:var(--fs-xs);color:var(--text3)">攻击</div></div>'
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
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">🐾 宠物 <span style="font-size:var(--fs-xs);color:var(--text3)">'+d.pets.length+' 只 · 成熟 '+d.pets.filter(p=>p.stage==="mature"&&!p.isDead).length+'</span></div>'
  h += '<button class="speed-btn" data-open-pet style="width:100%;padding:14px;font-size:var(--fs-md);min-height:48px;border-radius:12px;border-color:var(--green);color:var(--green);margin-bottom:16px">🐾 宠物面板（养成/参战/宝珠）</button>'
  // 技能区块
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">⚡ 技能 <span style="font-size:var(--fs-xs);color:var(--text3)">'+(st.loadout||[]).filter(Boolean).length+'/'+st.slotsUnlocked+' 已装备</span></div>'
  h += '<button class="speed-btn" data-open-skill style="width:100%;padding:14px;font-size:var(--fs-md);min-height:48px;border-radius:12px;border-color:var(--blue);color:var(--blue)">⚡ 技能培养面板</button>'
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">🔮 炼魂 <span style="font-size:var(--fs-xs);color:var(--text3)">角色属性强化</span></div>'
  h += '<button class="speed-btn" data-open-refine style="width:100%;padding:14px;font-size:var(--fs-md);min-height:48px;border-radius:12px;border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">🔮 炼魂系统</button>'
  // 材料区块：获取说明 + 获取记录
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">📦 道具材料 <span style="font-size:var(--fs-xs);color:var(--text3)">获取与记录</span></div>'
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:12px">'
  h += '<div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:8px">💡 获取方式</div>'
  Object.keys(MATERIAL_NAMES).forEach(function(t){
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:var(--fs-sm);border-bottom:1px solid var(--bg2)">'
      +'<span style="width:110px;font-weight:600">'+getMaterialName(t)+'</span>'
      +'<span style="flex:1;color:var(--text3);font-size:var(--fs-xs)">'+MATERIAL_SOURCES[t]+'</span>'
      +'<span style="font-weight:700;font-size:var(--fs-base)">×'+(d.materials[t]||0)+'</span>'
      +'</div>'
  })
  h += '</div>'
  // 获取记录
  var log = d.materialLog || []
  h += '<div style="background:var(--bg2);border-radius:14px;padding:14px">'
  h += '<div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:8px">📜 最近获取</div>'
  if (!log.length) {
    h += '<div style="font-size:var(--fs-sm);color:var(--text3);text-align:center;padding:14px">暂无获取记录<br><span style="font-size:var(--fs-xs)">通关隐藏挑战可获得材料</span></div>'
  } else {
    log.slice(0, 10).forEach(function(l){
      h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:var(--fs-sm);border-bottom:1px solid var(--bg2)">'
        +'<span style="flex:1">'+getMaterialName(l.type)+'</span>'
        +'<span style="color:var(--green);font-weight:700;font-size:var(--fs-base)">+'+(l.n||1)+'</span>'
        +'<span style="color:var(--text3);font-size:var(--fs-xs)">'+l.date+'</span>'
        +'</div>'
    })
  }
  h += '</div>'
  v.innerHTML = h
  var petBtn = v.querySelector('[data-open-pet]')
  if (petBtn) petBtn.addEventListener('click', function () { renderPetPanel() })
  var skillBtn = v.querySelector('[data-open-skill]')
  if (skillBtn) skillBtn.addEventListener('click', function () { renderSkillPanel() })
  var refineBtn = v.querySelector('[data-open-refine]')
  if (refineBtn) refineBtn.addEventListener('click', function () { if (typeof showRefineDialog === 'function') showRefineDialog(); else toast('炼魂系统未解锁（需通关解锁）','e') })
}

function statCell(icon, label, val) {
  return '<div style="background:var(--bg2);border-radius:12px;padding:10px 6px"><div style="font-size:var(--fs-lg);font-weight:700">'+icon+' '+val+'</div><div style="font-size:var(--fs-xs);color:var(--text3);margin-top:2px">'+label+'</div></div>'
}

/* ===== 战斗视图：本旬目标 + 敌群 + 关卡 ===== */

/* 大关内 10 小关列表 */
function showGroupStages(groupId) {
  var glv = (GROUP_LEVELS || {})[groupId]
  if (!glv) return
  var v = document.getElementById('gameBattleView')
  if (!v) return
  // v2.1.7：大关内页也直接显示本大关进度（外侧看不到进度是历史痛点）
  var pg = groupClearedCount(groupId)
  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
    +'<button class="speed-btn" id="groupBack" style="padding:10px 12px;min-height:44px;min-width:44px;font-size:var(--fs-base)">←</button>'
    +'<span style="font-size:var(--fs-lg);font-weight:700">'+glv.name+'</span>'
    +'<span class="gl-group-count">'+pg.cleared+'/'+pg.total+'</span>'
    +'</div>'
  h += '<div style="font-size:var(--fs-xs);color:var(--text3);margin-bottom:12px">'+glv.desc+'</div>'
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:8px">'
  glv.stages.forEach(function (st) {
    var cleared = isGroupStageCleared(st.id)
    var unlocked = isGroupStageUnlocked(st.id)
    var icon = st.type === 'boss' ? '👑' : st.type === 'elite' ? '⭐' : '⚔️'
    var color = st.type === 'boss' ? 'var(--red)' : st.type === 'elite' ? 'var(--orange)' : 'var(--blue)'
    // 状态：已通关（锁定灰）/ 可挑战 / 未解锁
    var statusHtml, btnStyle
    if (cleared) {
      statusHtml = '<span style="font-size:var(--fs-2xs);color:var(--green)">✅ 已通关</span>'
      btnStyle = 'opacity:.5;border-color:var(--green);color:var(--green)'
    } else if (unlocked) {
      statusHtml = '<span style="font-size:var(--fs-2xs)">⚔️ 可挑战</span>'
      btnStyle = 'border-color:' + color + ';color:' + color
    } else {
      statusHtml = '<span style="font-size:var(--fs-2xs)">🔒 未解锁</span>'
      // v2.1.7：原 opacity:.35 让"未解锁"文字几乎不可读，放宽到 .6 并弱化文字色
      btnStyle = 'opacity:.6;color:var(--text3)'
    }
    h += '<button class="speed-btn" data-stage="'+st.id+'" '+(unlocked && !cleared ? '' : 'disabled')+' style="padding:12px 4px;min-height:56px;font-size:var(--fs-sm);border-radius:10px;'+btnStyle+';display:flex;flex-direction:column;align-items:center">'
      +'<span style="font-size:var(--fs-lg)">'+icon+'</span>'
      +'<span style="font-size:var(--fs-xs);margin-top:2px">'+st.name.replace(/^[⭐👑] /,'')+'</span>'
      +statusHtml
      +'</button>'
  })
  h += '</div>'
  // 进度条
  var stats = groupProgressStats()
  h += '<div style="margin-top:12px;font-size:var(--fs-sm);color:var(--text3)">📈 敌群进度：'+stats.cleared+'/'+stats.total+' 关通关</div>'
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
    +'<div style="font-size:var(--fs-lg);font-weight:700;margin-bottom:10px">🗓️ 本旬目标 · '+p.name+'</div>'
    +'<div style="display:flex;gap:10px">'
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--orange-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:var(--fs-lg);font-weight:700;color:var(--orange)">'+stats.periodDays+'<span style="font-size:var(--fs-xs)">/6天</span></div><div style="font-size:var(--fs-xs);color:var(--text3)">训练天数</div></div>'
    /* v2.2 WP-H3：`sumVolume()` 返回浮点，直接内插会渲染出 2862.1000000000004kg 这类尾数。
       展示层取整（与 tab-strength.js:39 / game-render.js:36 的同名「旬容量」显示一致），不动数值本身。 */
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--blue-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:var(--fs-lg);font-weight:700;color:var(--blue)">'+Math.round(stats.periodVol)+'<span style="font-size:var(--fs-xs)">kg</span></div><div style="font-size:var(--fs-xs);color:var(--text3)">旬容量</div></div>'
    +'<div style="flex:1;background:var(--bg2);border:1px solid var(--green-g);border-radius:12px;padding:12px;text-align:center"><div style="font-size:var(--fs-lg);font-weight:700;color:var(--green)">'+wkStatus+'</div><div style="font-size:var(--fs-xs);color:var(--text3)">状态</div></div>'
    +'</div></div>'

  // 敌群战斗（v2.1.7：12 大关 × 10 小关；文案与进度均由数据派生，不再写死）
  var gStats = groupProgressStats()
  var gKeys = Object.keys(GROUP_LEVELS || {})
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">👥 敌群试炼'
    +' <span style="font-size:var(--fs-xs);color:var(--text3)">'+gKeys.length+' 大关 · 每关 10 小关 · 已通关 '+gStats.cleared+'/'+gStats.total+'</span></div>'
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">'
  gKeys.forEach(function (k) {
    var glv = GROUP_LEVELS[k]
    var pg = groupClearedCount(glv.id)
    var pct = pg.total ? Math.round(pg.cleared / pg.total * 100) : 0
    var stateText = pg.state === 'done' ? '✅ 已通关' : pg.state === 'progress' ? '⚔️ 进行中' : '🔒 未开启'
    h += '<button class="speed-btn gl-group-card state-'+pg.state+'" data-group="'+glv.id+'"'
      +' aria-label="'+glv.name+'，已通关 '+pg.cleared+' / '+pg.total+'，'+stateText+'">'
      +'<span class="gl-group-top">'
      +'<span class="gl-group-name">'+glv.name+'</span>'
      +'<span class="gl-group-count">'+pg.cleared+'/'+pg.total+'</span>'
      +'</span>'
      +'<span class="gl-group-desc">'+glv.desc+'</span>'
      +'<span class="gl-bar"><span class="gl-bar-fill'+(pg.state==='done'?' done':'')+'" style="width:'+pct+'%"></span></span>'
      +'<span class="gl-group-state">'+stateText+'</span>'
      +'</button>'
  })
  h += '</div>'

  // 关卡试炼（原关卡列表，简化为入口）
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">⚔️ 关卡试炼</div>'
  h += '<button class="speed-btn" data-open-levels style="width:100%;padding:14px;font-size:var(--fs-md);min-height:48px;border-radius:12px;border-color:var(--purple,#a855f7);color:var(--purple,#a855f7)">🗺️ 挑战关卡（'+Object.keys(LEVELS).length+' 章）</button>'

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

  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin-bottom:10px">🏆 历史最佳</div>'
  var keys = Object.keys(prs)
  if (!keys.length) {
    h += '<div style="background:var(--bg2);border-radius:12px;padding:20px;text-align:center;font-size:var(--fs-base);color:var(--text3)">暂无最佳记录<br><span style="font-size:var(--fs-xs)">去训练并完成挑战吧</span></div>'
  } else {
    /* v2.2 WP-H3 同口径：`pr.maxVolume` 由 `w×reps` 得出，可能是浮点（1.1×3 = 3.3000000000000003），
       展示层取整，不改存档里的 PR 值 */
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
    keys.slice(0, 8).forEach(function (k) {
      var pr = prs[k]
      h += '<div style="background:var(--bg2);border-radius:12px;padding:12px">'
        +'<div style="font-size:var(--fs-base);font-weight:600">'+k+'</div>'
        +'<div style="font-size:var(--fs-xs);color:var(--text3);margin-top:4px">'
        +(pr.maxWeight ? '最大重量 '+pr.maxWeight+'kg' : '')+(pr.maxReps ? ' · 最大次数 '+pr.maxReps : '')+(pr.maxVolume ? ' · 最大容量 '+Math.round(pr.maxVolume)+'kg' : '')
        +'</div></div>'
    })
    h += '</div>'
  }
  // 属性最佳
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">📊 属性记录</div>'
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'
  h += statCell('⚔️','最高攻击',stats.atk)
  h += statCell('🛡️','最高防御',stats.def)
  h += statCell('❤️','最高生命',stats.hp)
  h += '</div>'

  /* ===== v2.2 WP-H4：每月挑战记录（文档「挑战页面 - 增加每个月最高记录查看」） =====
     数据源 = challenge.js 的 listChallengeMonthly()：按自然月分桶归档（跨月自动开新桶，旧月保留）。
     口径：每次通关计 1 次；「单次最高伤害」= 该月伤害最高的一次；属性奖励为该月累计。 */
  h += '<div style="font-size:var(--fs-lg);font-weight:700;margin:18px 0 10px">📅 每月挑战记录 <span style="font-size:var(--fs-xs);color:var(--text3)">隐藏挑战 · 跨月归档</span></div>'
  var months = (typeof listChallengeMonthly === 'function') ? (listChallengeMonthly() || []) : []
  if (!months.length) {
    h += '<div style="background:var(--bg2);border-radius:12px;padding:20px;text-align:center;font-size:var(--fs-base);color:var(--text3)">本月暂无挑战记录<br><span style="font-size:var(--fs-xs)">完成隐藏挑战后按月归档，可回看每月最高记录</span></div>'
  } else {
    var curMk = (typeof chMonthOf === 'function') ? chMonthOf() : ''
    h += '<div style="max-height:280px;overflow-y:auto">'
    months.forEach(function (m) {
      var isCur = m.month === curMk
      h += '<div style="background:var(--bg2);border:1px solid ' + (isCur ? 'var(--orange-g)' : 'var(--bd-l)') + ';border-radius:12px;padding:12px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        +   '<span style="font-size:var(--fs-base);font-weight:700">' + m.month + '</span>'
        +   (isCur ? '<span style="font-size:var(--fs-3xs);color:var(--orange);border:1px solid var(--orange-g);border-radius:var(--rad-full);padding:1px 6px">本月</span>' : '')
        +   '<span style="flex:1"></span>'
        +   '<span style="font-size:var(--fs-xs);color:var(--text3)">' + (m.count || 0) + ' 次</span>'
        + '</div>'
        + '<div style="font-size:var(--fs-xs);color:var(--text2);line-height:1.8;margin-top:4px">'
        +   '🥇 单次最高伤害 <b style="color:var(--orange)">' + (m.bestDmg || 0) + '</b>'
        +   (m.bestDate ? '<span style="color:var(--text3)">（' + m.bestDate + '）</span>' : '')
        +   '<br>🎁 属性奖励合计 ⚔️+' + (m.atk || 0) + ' 🛡️+' + (m.def || 0) + ' ❤️+' + (m.hp || 0)
        +   '<br>💥 累计伤害 ' + (m.totalDmg || 0)
        + '</div>'
        + '</div>'
    })
    h += '</div>'
  }

  v.innerHTML = h
}

/* 初始化：挂载到 renderGame 之后（保留战斗逻辑） */
function initGameViews() {
  renderGameViews()
}

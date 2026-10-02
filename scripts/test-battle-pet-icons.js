#!/usr/bin/env node
/* v2.3.3 测试：战斗页宠物头像接线（page/game-render.js 的 renderGroupUnit / renderGroupOrder）

   作者原话：「**战斗页面，宠物图标也要实装**」。接入前 14 只宠物头像已进列表卡 / 详情页 /
   参战芯片 / 对比芯片 / 挑战结算面板，**唯独战斗 overlay（单位卡 + 队伍条）没有头像槽**。

   本套守七件事（每条都对应一个已经踩过或极易踩的坑）：

   1) **唯一入口** —— 战斗页不许硬拼 `media/pets/` 路径，只走 pet-ui.js 的
      `petIconStageHtml()`（内部即 petIconHtml）。源码级守卫：`media/pets/` 字面量
      全仓库只允许出现在 pet-ui.js。
   2) **尺寸必须是 16 的倍数** —— 图标是 16×16 逻辑网格、1 格 = 3px：
      16px → 每格 1px（干净）；32px 会把单位卡名字行顶高（见 4）。
   3) **只给我方宠物** —— 玩家（无 `_petSpecies`）与敌方单位（走怪物原型线）不许出现 `.pet-ico`。
   4) **单位卡高度不增（结构级）** —— 这是作者对战斗页的唯一硬要求（战斗页不得变密）：
      · 头像必须落在**既有** `.gb-row1` 内，不得新增任何行容器；
      · `GB_PET_ICO_SIZE`(16) ≤ 名字行行盒（`--fs-lg` = 17px，实测行高 21px）；
      · `.gb-ico` 容器不得声明 height/min-height（只做 inline-flex 对齐）；
      · 队伍条 `.gb-order-chip.has-ico` **必须是 display:flex** —— 曾经的写法 `inline-flex`
        会按基线把行盒撑高 3px，实测把 .gb-order 从 38px 顶到 41px（真实浏览器量到）。
      浏览器实测（390×844 与 360×640，同场战斗状态内 A/B 摘除头像对比）：
      宠物单位卡 96.39px **前后一致**、玩家卡 70px、敌群卡 124/80px、队伍条 38px 全部不变。
   5) **缺图标兜底** —— 物种没有 SVG 时退回阶段 emoji（🐾，沿用 petIconStageHtml 的既有约定），
      不出现裂图 <img>、不塌陷（行容器仍在）。
   6) **队伍条芯片同口径** —— 宠物芯片带头像且高度 ≤ 26px（= 既有「当前行动」芯片高度，
      故 .gb-order 容器不变）；emoji 兜底时**不加** `.has-ico`（走原行内排版）。
   7) **无静默 catch** —— 本项目硬护栏（catch 必须带日志 / 用户反馈 / 「忽略」说明）。

   Run: node scripts/test-battle-pet-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const load = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

/* ---------- 与 test-monster-icons.js 同一套沙箱与加载顺序（口径同源，别另起一套），
              额外多载一个 game-render.js —— 本套要真渲染单位卡与队伍条，不只是 grep 源码 ---------- */
function makeSandbox() {
  const mem = {};
  const sb = { Math, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]), set: (k, v) => { mem[k] = v; },
             registerSchema: () => {}, _mem: mem } };
  sb.window = sb; sb.globalThis = sb;
  const ov = {
    innerHTML: '', hidden: false, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [], addEventListener() {}, setAttribute() {},
    getAttribute: () => null, textContent: ''
  };
  sb.__ov = ov;
  sb.document = {
    getElementById: id => (id === 'panelOverlay' ? ov : null),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    body: { appendChild() {} }, addEventListener() {}, documentElement: { setAttribute() {} }
  };
  sb.toast = function () {};
  sb.setTimeout = () => 0; sb.clearTimeout = () => {};
  sb._petBattlePicks = [];
  sb._groupBattle = null;
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'monster-archetype.js',
    'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js', 'affix.js',
    'enemy.js', 'terrain.js', 'battle.js', 'battle-group.js', 'orbs.js',
    'pet-codex.js', 'pets.js', 'pet-materials.js', 'pet-store.js',
    'group-levels.js', 'group-progress.js', 'ai.js', 'pet-ui.js',
    /* ⚠️ 战斗 overlay 的渲染在这里（index.html 里它排在 pet-ui.js **之前**：
       战斗页对 petIconStageHtml 的调用发生在**运行时**，与加载顺序无关，本套照线上顺序载入） */
    'game-render.js'
  ].forEach(f => {
    if (fs.existsSync(path.join(PAGE, f))) vm.runInContext(load(f), sb);
  });
  return sb;
}
const sb = makeSandbox();

/* 造一个真实宠物战斗单位（走 pet-codex.js 的 createPetUnit，别手搓对象） */
function petUnit(speciesId) {
  const c = sb.getPetCodex(speciesId) || {};
  return sb.createPetUnit({ speciesId: speciesId, rarity: c.rarity, name: c.name,
    refineLevel: 0, refineStats: {}, skillLevels: {}, orbs: {} });
}
/* 行容器序列（只取三种既有行，用于「有没有新增行」的结构断言） */
function rowContainers(html) {
  const out = [];
  const re = /<div class="(gb-row1|gb-hp-row|gb-row4)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
function countPetIco(html) { return (html.match(/class="pet-ico/g) || []).length; }

/* ============ 1. 唯一入口（源码级） ============ */
console.log('--- 1. 唯一入口 / 真的被调用 ---');
const grSrc = src('game-render.js');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const pathSites = jsFiles.filter(f => {
  const s = src(f);
  return s.includes("'media/pets/'") || s.includes('"media/pets/"');
});
ok(pathSites.length === 1 && pathSites[0] === 'pet-ui.js',
  `'media/pets/' 字面量应只出现在 pet-ui.js（唯一入口），实际：${pathSites.join(', ') || '（无）'}`);
ok(!grSrc.includes('media/pets/'), 'game-render.js 硬拼了 media/pets/ 路径（应走 petIconStageHtml）');
ok(/petIconStageHtml\s*\(/.test(grSrc), 'game-render.js 未调用 petIconStageHtml（战斗页头像没接上）');
const orderStart = grSrc.indexOf('function renderGroupOrder');
const unitStart = grSrc.indexOf('function renderGroupUnit');
ok(orderStart > 0, 'game-render.js 里找不到 renderGroupOrder（队伍条渲染）');
ok(unitStart > 0, 'game-render.js 里找不到 renderGroupUnit（单位卡渲染）');
ok(/gbPetIcon(Html|BoxHtml)?\s*\(/.test(grSrc.slice(orderStart, unitStart)),
  'renderGroupOrder 未渲染宠物头像（队伍条仍无头像槽）');
ok(/gbPetIcon/.test(grSrc.slice(unitStart, unitStart + 8000)),
  'renderGroupUnit 未渲染宠物头像（单位卡仍无头像槽）');

/* ============ 2. 尺寸必须是 16 的倍数 ============ */
console.log('--- 2. 显示尺寸必须是 16 的倍数 ---');
ok(sb.GB_PET_ICO_SIZE === 16,
  `战斗页宠物头像尺寸应为 16（16 的倍数里唯一能塞进 21px 名字行的一个），实际 ${sb.GB_PET_ICO_SIZE}`);
ok(sb.GB_PET_ICO_SIZE % 16 === 0, `GB_PET_ICO_SIZE=${sb.GB_PET_ICO_SIZE} 不是 16 的倍数`);

/* 调用点扫尺寸实参：字面量直接判，常量名回沙箱取实际值 */
const sizeArgs = [];
[...grSrc.matchAll(/petIcon(?:Stage)?Html\(\s*[^,)]+,\s*([^,)]+)/g)].forEach(m => {
  const a = m[1].trim();
  sizeArgs.push({ raw: a, val: /^\d+$/.test(a) ? Number(a) : sb[a] });
});
ok(sizeArgs.length >= 1,
  `game-render.js 里应能找到 ≥1 处宠物头像尺寸实参（唯一入口 gbPetIconHtml），实际 ${sizeArgs.length}`);
sizeArgs.forEach(o => ok(typeof o.val === 'number' && o.val % 16 === 0,
  `尺寸实参 ${o.raw}（=${o.val}）不是 16 的倍数（非整数倍缩放会让格宽粗细不均）`));

/* 名字行行盒：--fs-lg 17px（index.css 令牌）→ 16px 头像塞得进，32px 塞不进 */
const css = src('index.css');
const fsLg = /--fs-lg:\s*([\d.]+)rem/.exec(css);
ok(!!fsLg, 'index.css 里找不到 --fs-lg 令牌');
{
  const px = fsLg ? Number(fsLg[1]) * 16 : 0;
  ok(sb.GB_PET_ICO_SIZE <= px,
    `头像 ${sb.GB_PET_ICO_SIZE}px 超过名字行字号 ${px}px —— 会顶高单位卡名字行（战斗页变密）`);
}

/* ============ 3. 单位卡：只给我方宠物，且落在既有行里 ============ */
console.log('--- 3. 单位卡接线（我方宠物 / 玩家 / 敌方） ---');
const pet = petUnit('sparkle');
const petHtml = sb.renderGroupUnit(pet, 'ally');
ok(petHtml.includes('src="media/pets/sparkle.svg"'), '宠物单位卡未渲染该宠的头像：' + petHtml.slice(0, 120));
ok(countPetIco(petHtml) === 1, `宠物单位卡应恰好 1 枚 .pet-ico，实际 ${countPetIco(petHtml)}`);
ok(petHtml.includes('width="16"') && petHtml.includes('height="16"'),
  '头像未带 16px 的 width/height 属性（会被 SVG 固有尺寸 48px 撑破行高）');
ok(petHtml.includes('alt=""') && !/alt="[^"]+"/.test(petHtml),
  '装饰性头像的 alt 应为空串（旁边就是宠物名，写名字会让读屏念两遍）');
ok(petHtml.includes('class="pet-ico') && !/class="pet-ico[^"]*pet-ico/.test(petHtml),
  '头像未带 .pet-ico class（pixelated 样式会失效）');
ok(!/undefined|NaN/.test(petHtml), '单位卡 HTML 里出现 undefined/NaN');

/* 结构级「高度不增」：头像必须在既有 gb-row1 内，不得另起一行 */
{
  const r1 = petHtml.indexOf('<div class="gb-row1">');
  const hp = petHtml.indexOf('<div class="gb-hp-row">');
  const ico = petHtml.indexOf('class="pet-ico');
  ok(r1 > -1 && hp > r1, '单位卡缺少 gb-row1 / gb-hp-row 结构');
  ok(ico > r1 && ico < hp, '头像不在 gb-row1 内（新增了行容器 → 单位卡会变高）');
  const rows = rowContainers(petHtml);
  ok(rows[0] === 'gb-row1' && rows[1] === 'gb-hp-row',
    '单位卡行容器顺序被改动：' + rows.join(' > '));
  const unknown = rows.filter(r => !/^gb-(row1|hp-row|row4)$/.test(r));
  ok(unknown.length === 0, '单位卡出现了新的行容器：' + unknown.join(', '));
}

/* 玩家（无 _petSpecies）：不给头像（没有现成头像槽，不发明） */
const playerUnit = sb.createUnit({ id: 'player', side: 'ally', name: '🧑 你', level: 1,
  base: { hp: 100, atk: 10, def: 10, spd: 10 } });
const playerHtml = sb.renderGroupUnit(playerUnit, 'ally');
ok(countPetIco(playerHtml) === 0, '玩家单位卡不应有宠物头像（没有现成槽位）');
ok(!playerHtml.includes('media/pets/'), '玩家单位卡不应引用宠物头像');
ok(JSON.stringify(rowContainers(playerHtml)) === JSON.stringify(['gb-row1', 'gb-hp-row']),
  '玩家单位卡的行结构变了：' + rowContainers(playerHtml).join(' > '));
ok(JSON.stringify(rowContainers(petHtml).slice(0, 2)) === JSON.stringify(rowContainers(playerHtml)),
  '宠物卡与玩家卡的前两行结构必须一致（头像只是往 row1 里加了一个 16px 容器）');

/* 敌方：走怪物原型线，不许被套上宠物头像 */
const foe = sb.createEnemyUnit({ id: 'enemy-0', tier: 'minion', name: '杂兵·弓',
  base: { hp: 100, atk: 10, def: 5, spd: 8 } });
const foeHtml = sb.renderGroupUnit(foe, 'enemy');
ok(countPetIco(foeHtml) === 0, '敌方单位卡不应有宠物头像（敌人走 monster-archetype 线）');
ok(!foeHtml.includes('media/pets/'), '敌方单位卡不应引用宠物头像');
ok(foeHtml.includes('media/monsters/'), '敌方单位卡的怪兽头像被误删（另一条线的既有接线）');

/* 阵亡折叠行：宠物仍带头像，且行高由 CSS 的 min-height 兜住 */
{
  const dead = petUnit('kirin');
  dead.hp = 0;
  const deadHtml = sb.renderGroupUnit(dead, 'ally');
  ok(deadHtml.includes('gb-dead-line'), '阵亡宠物未走折叠行');
  ok(deadHtml.includes('src="media/pets/kirin.svg"'), '阵亡宠物的折叠行未保留头像');
  ok(deadHtml.includes('width="16"'), '阵亡行头像未带 16px 尺寸');
  ok(!/undefined|NaN/.test(deadHtml), '阵亡行 HTML 里出现 undefined/NaN');
}
ok(/\.gb-dead-line\{[^}]*min-height\s*:\s*var\(--touch-min\)/.test(css),
  '.gb-dead-line 不再锁 --touch-min(44px) → 16px 头像可能顶高折叠行');
ok(/\.gb-ico\{[^}]*\}/.test(css) && !/\.gb-ico\{[^}]*(\bheight|\bmin-height)\s*:/.test(css),
  '.gb-ico 容器声明了 height/min-height（会把名字行钉高，破坏「高度不增」）');

/* ============ 4. 队伍条（行动顺序芯片） ============ */
console.log('--- 4. 队伍条芯片 ---');
const gb = { _stepQueue: [petUnit('kirin'), foe, petUnit('darkcrow')], _stepIdx: 0 };
const orderHtml = sb.renderGroupOrder(gb);
ok(orderHtml.includes('gb-order-chip'), '队伍条未渲染出芯片');
ok(orderHtml.includes('src="media/pets/kirin.svg"'), '队伍条「当前行动」芯片未渲染宠物头像');
ok(orderHtml.includes('src="media/pets/darkcrow.svg"'), '队伍条后排芯片未渲染宠物头像');
ok(!orderHtml.includes('media/pets/undefined'), '队伍条渲染出了 undefined 头像路径');
ok((orderHtml.match(/class="pet-ico/g) || []).length === 2,
  '队伍条应恰好 2 枚头像（2 只宠物；敌人不套宠物头像）');
ok(!orderHtml.includes('class="mon-ico'), '队伍条不应给敌人套宠物头像（那是怪物线的活）');
ok(/gb-order-chip ally now has-ico/.test(orderHtml),
  '「当前行动」的宠物芯片未挂 .has-ico（flex 对齐会失效）：' + orderHtml.slice(0, 160));
ok(/gb-order-chip enemy(?! has-ico)/.test(orderHtml), '敌人芯片不应挂 .has-ico');
/* 头像在名字之前（芯片最左），保证「▶ 名字」保持连续文本、只吃 1 个 gap */
ok(orderHtml.indexOf('class="pet-ico') < orderHtml.indexOf('圣光麒麟'),
  '队伍条头像应在名字之前');
/* CSS 契约：has-ico 必须 flex —— inline-flex 会按基线把行盒撑高 3px（实测 38 → 41px） */
{
  const rule = /\.gb-order-chip\.has-ico\{([^}]*)\}/.exec(css);
  ok(!!rule, 'index.css 缺少 .gb-order-chip.has-ico 规则');
  ok(rule && /display\s*:\s*flex/.test(rule[1]),
    '.gb-order-chip.has-ico 必须 display:flex，实际：' + (rule ? rule[1] : '（无规则）'));
  ok(rule && !/inline-flex/.test(rule[1]),
    '.gb-order-chip.has-ico 用了 inline-flex（会把 .gb-order 行盒撑高 3px → 38 → 41px）');
  ok(rule && !/(\bheight|\bmin-height)\s*:/.test(rule[1]),
    '.gb-order-chip.has-ico 声明了 height/min-height（芯片高度应交给 16px 头像 + 既有 padding 决定）');
}

/* ============ 5. 缺图标兜底（emoji，不塌陷） ============ */
console.log('--- 5. 缺图标兜底 ---');
ok(sb.petIconStageHtml('no_such_species', 16, 'mature') === '🐾',
  '未知物种的兜底应为 🐾（沿用 petIconStageHtml 的既有约定）');
{
  const saved = sb.PET_CODEX.sparkle;
  delete sb.PET_CODEX.sparkle;
  const noIcoPet = petUnit('sparkle');   // getPetCodex 已删 → createPetUnit 返回 null，故手工兜底成原 pet
  const u = noIcoPet || Object.assign({}, pet);
  const h = sb.renderGroupUnit(u, 'ally');
  ok(!h.includes('media/pets/sparkle.svg'), '物种被删后不应再渲染该图标（会裂图）');
  ok(!/class="pet-ico/.test(h), '物种被删后不应再出现 .pet-ico 头像 <img>');
  ok(h.includes('🐾'), '无图标时应退回 🐾 emoji（不能留空槽）');
  ok(JSON.stringify(rowContainers(h).slice(0, 2)) === JSON.stringify(['gb-row1', 'gb-hp-row']),
    '无图标时单位卡结构塌陷了：' + rowContainers(h).join(' > '));

  const h2 = sb.renderGroupOrder({ _stepQueue: [u], _stepIdx: 0 });
  ok(h2.includes('🐾'), '无图标时队伍条芯片应退回 🐾 emoji');
  ok(!h2.includes('has-ico'), '无图标（emoji 兜底）时芯片不应挂 .has-ico（走原行内排版，高度不变）');
  ok(!/class="pet-ico/.test(h2), '无图标时队伍条不应出现头像 <img>');
  ok(!/undefined/.test(h2), '无图标时队伍条 HTML 里出现 undefined');
  sb.PET_CODEX.sparkle = saved;
}

/* ============ 6. 无静默 catch（项目硬护栏） ============ */
console.log('--- 6. 静默异常 ---');
function catchBodies(s) {
  const out = [];
  const re = /catch\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\))?\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    let i = re.lastIndex, depth = 1;
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
      }
      i++;
    }
    out.push({ line: s.slice(0, m.index).split('\n').length, body: s.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}
['game-render.js', 'pet-ui.js'].forEach(f => {
  const silent = [];
  catchBodies(src(f)).forEach(cb => {
    const b = cb.body;
    if (!/console\./.test(b) && !/toast\s*\(/.test(b) && !/忽略/.test(b)) {
      silent.push(f + ':' + cb.line + ' → ' + b.replace(/\s+/g, ' ').trim().slice(0, 40));
    }
  });
  ok(silent.length === 0, `${f} 出现静默 catch（须带日志/用户反馈/「忽略」说明）：` + silent.join(' | '));
});

/* ---------- 汇总 ---------- */
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log(`===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* v2.4.x 测试：战斗页宠物头像接线（page/game-render.js 的 renderGroupUnit / renderGroupOrder）

   作者原话：「**战斗页面，宠物图标也要实装**」。接入前 14 只宠物头像已进列表卡 / 详情页 /
   参战芯片 / 对比芯片 / 挑战结算面板，**唯独战斗 overlay（单位卡 + 队伍条）没有头像槽**。

   ⚠️ v2.4.x 舞台化改写：战场由「垂直三行卡片列表」改为「上下对阵舞台」，
   单位从**三行卡片**（.gb-row1 / .gb-hp-row / .gb-row4）变成**单枚战场芯片**：

     <div class="gb-unit gb-arena-unit" data-uid=… role="button" tabindex="0" aria-label=…>
       <span class="gb-arena-ico">…</span>   ← 头像（宠物 petIconStageHtml / 敌方怪物 / 玩家首字）
       <span class="gb-name">名字</span>     ← ≤4 字，超出省略
       <div class="gb-hp-wrap"><div class="gb-hp-fill" style="width:N%"></div></div>
       <div class="gb-arena-st">…</div>      ← 状态图标 ≤3 个 + 「+N」
     </div>

   芯片内**禁止**再出现 .gb-chip / .gb-stats / .gb-row1 / .gb-hp-row / .gb-row4 /
   .gb-acting-tag（那套是三行卡片的信息密度，舞台芯片要「不再像表格」）。
   阵亡单位**不再折叠成 gb-dead-line 行**，而是同一枚芯片加 .gb-dead（灰化 + 名字删除线），
   并且**仍须保留头像**。renderGroupUnit / renderGroupOrder 的函数名与调用口径不变。

   本套守七件事（每条都对应一个已经踩过或极易踩的坑）：

   1) **唯一入口** —— 战斗页不许硬拼 `media/pets/` 路径，只走 pet-ui.js 的
      `petIconStageHtml()`（内部即 petIconHtml）。源码级守卫：`media/pets/` 字面量
      全仓库只允许出现在 pet-ui.js。
   2) **尺寸必须是 16 的倍数** —— 图标是 16×16 逻辑网格、1 格 = 3px：
      16px → 每格 1px（干净）；32px 会把芯片顶高（战斗页变密，见 4）。
   3) **只给我方宠物** —— 玩家（无 `_petSpecies`）与敌方单位（走怪物原型线）不许出现 `.pet-ico`。
   4) **芯片高度不增（结构级）** —— 这是作者对战斗页的唯一硬要求（战斗页不得变密）：
      · 头像必须落在芯片**既有**的 `.gb-arena-ico` 槽里，不得新增行容器；
      · 芯片头像尺寸（`GB_PET_ICO_SIZE` = 16）不得超过芯片自身的图标槽 / 名字行盒；
      · `.gb-arena-unit` 自身锁 `min-height:var(--touch-min)`(44px)，触控热区不缩水；
      · `.gb-ico` 容器不得声明 height/min-height（只做 inline-flex 对齐）；
      · 行动顺序条 `.gb-order-chip.has-ico` **必须是 display:flex** —— 曾经的写法
        `inline-flex` 会按基线把行盒撑高 3px，实测把 .gb-order 从 38px 顶到 41px（真实浏览器量到）。
   5) **缺图标兜底** —— 物种没有 SVG 时退回阶段 emoji（🐾，沿用 petIconStageHtml 的既有约定），
      不出现裂图 <img>、不塌陷（芯片信息件仍在）。
   6) **行动顺序条芯片同口径** —— 宠物芯片带头像且高度 ≤ 26px（= 既有「当前行动」芯片高度，
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
              额外多载一个 game-render.js —— 本套要真渲染战场芯片与队伍条，不只是 grep 源码 ---------- */
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
/* 取函数体（不依赖函数在源码里的相邻关系 —— v2.4.x 舞台化会重排 game-render.js，
   原先用「renderGroupOrder 与 renderGroupUnit 之间的 gap」这种位置判据太脆） */
function fnBody(source, name) {
  const i = source.indexOf('function ' + name);
  if (i < 0) return '';
  const s = source.indexOf('{', i);
  let depth = 0, j = s;
  for (; j < source.length; j++) {
    const c = source[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < source.length && source[j] !== q) { if (source[j] === '\\') j++; j++; }
    }
  }
  return source.slice(s, j + 1);
}

/* ============ 战场芯片的判据（与 _tmp-group-ui/chip-contract/fixture.js 逐字同源） ============ */
/* 某个 class 是否出现在某个 class 属性里（首类，或空白分隔；后接空白或结束引号） */
function clsRx(c) { return new RegExp('class="(?:[^"]*\\s)?' + c + '(?=[\\s"])'); }
function hasClass(html, c) { return clsRx(c).test(html); }
/* 取「命中某 class 的那个 class 属性」起算的片段 —— 够覆盖该信息件的内部 */
function sliceAfterClass(html, cls, len) {
  const m = clsRx(cls).exec(html);
  return m ? html.slice(m.index, m.index + (len || 240)) : '';
}
/* 芯片信息件（新契约：头像槽 / 名字 / 血条），按文档顺序返回 —— 取代旧的 rowContainers()
   （旧 helper 找的是 gb-row1|gb-hp-row|gb-row4 三个行容器，三行卡已废弃；
    若继续用它，新结构下它会**恒返回空数组**，断言静默空转） */
function chipParts(html) {
  return ['gb-arena-ico', 'gb-name', 'gb-hp-wrap']
    .map(function (c) { const m = clsRx(c).exec(html); return { c: c, i: m ? m.index : -1 }; })
    .filter(function (o) { return o.i > -1; })
    .sort(function (a, b) { return a.i - b.i; })
    .map(function (o) { return o.c; });
}
/* 旧三行卡片 / 折叠行专属类名 —— 舞台芯片里出现任何一个都算「信息密度回流」 */
const GB_OLD_CARD_CLASSES = ['gb-chip', 'gb-stats', 'gb-row1', 'gb-hp-row', 'gb-row4', 'gb-acting-tag'];
function forbiddenHits(html) {
  return GB_OLD_CARD_CLASSES.filter(function (c) { return hasClass(html, c); });
}
function countPetIco(html) { return (html.match(/class="pet-ico/g) || []).length; }

/* ============ 1. 唯一入口（源码级） ============ */
console.log('--- 1. 唯一入口 / 真的被调用 ---');
const grSrc = src('game-render.js');
const css = src('index.css');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const pathSites = jsFiles.filter(f => {
  const s = src(f);
  return s.includes("'media/pets/'") || s.includes('"media/pets/"');
});
ok(pathSites.length === 1 && pathSites[0] === 'pet-ui.js',
  `'media/pets/' 字面量应只出现在 pet-ui.js（唯一入口），实际：${pathSites.join(', ') || '（无）'}`);
ok(!grSrc.includes('media/pets/'), 'game-render.js 硬拼了 media/pets/ 路径（应走 petIconStageHtml）');
ok(/petIconStageHtml\s*\(/.test(grSrc), 'game-render.js 未调用 petIconStageHtml（战斗页头像没接上）');
const orderBody = fnBody(grSrc, 'renderGroupOrder');
const unitBody = fnBody(grSrc, 'renderGroupUnit');
ok(orderBody.length > 0, 'game-render.js 里找不到 renderGroupOrder（行动顺序条渲染）');
ok(unitBody.length > 0, 'game-render.js 里找不到 renderGroupUnit（战场芯片渲染）');
/* 两条**不依赖函数相邻**的判据（v2.4.x 改写：旧写法用「两函数之间的 1847 字符 gap」
   与「renderGroupUnit 后 8000 字符窗口」定位 —— 舞台化会重排/新增代码，窗口判据会误伤） */
ok(/gbPetIcon(Html|BoxHtml)?\s*\(/.test(orderBody),
  'renderGroupOrder 未渲染宠物头像（行动顺序条仍无头像槽）');
ok(/gbPetIcon(Html|BoxHtml)?\s*\(/.test(unitBody),
  'renderGroupUnit 未渲染宠物头像（战场芯片仍无头像槽）');

/* ============ 2. 尺寸必须是 16 的倍数 ============ */
console.log('--- 2. 显示尺寸必须是 16 的倍数 ---');
ok(sb.GB_PET_ICO_SIZE === 16,
  `战斗页宠物头像尺寸应为 16（16 的倍数里唯一能塞进紧凑芯片的一个），实际 ${sb.GB_PET_ICO_SIZE}`);
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

/* 芯片头像的尺寸上限（v2.4.x 改写）：
   旧判据是「≤ 单位卡名字行 --fs-lg(17px)，否则顶高名字行」—— 三行卡片已废弃，
   那条理由链随之失效（芯片的名字行与旧卡片名字行不等价）。
   对**芯片**成立的表述是：头像高度不得超过芯片自身声明的图标槽 `--gb-unit-ico`；
   实现未声明该令牌时，退回芯片名字行的字号行盒 `--fs-lg`。两种口径都在真实约束
   「芯片不得被头像顶高」，**不是恒真断言**：把 16 换成 32 必红
   （证据见 _tmp-group-ui/chip-contract/fixture.js 的 H 行）。 */
function chipIcoBoundPx(cssText) {
  const tok = /--gb-unit-ico:\s*([\d.]+)(rem|px)/.exec(cssText);
  if (tok) return { px: Number(tok[1]) * (tok[2] === 'rem' ? 16 : 1), from: '--gb-unit-ico' };
  const fsLg = /--fs-lg:\s*([\d.]+)rem/.exec(cssText);
  if (fsLg) return { px: Number(fsLg[1]) * 16, from: '--fs-lg（芯片名字行盒）' };
  return null;
}
{
  const bound = chipIcoBoundPx(css);
  ok(!!bound, 'index.css 里既找不到 --gb-unit-ico 也找不到 --fs-lg —— 芯片头像尺寸没有上限依据');
  ok(!!bound && sb.GB_PET_ICO_SIZE <= bound.px,
    `芯片头像 ${sb.GB_PET_ICO_SIZE}px 超过尺寸上限 ${bound ? bound.px : '?'}px（${bound ? bound.from : '无令牌'}）`
    + ' —— 会顶高战场芯片（战斗页变密）');
}

/* ============ 3. 战场芯片：只给我方宠物，且头像落在芯片既有的 ico 槽里 ============ */
console.log('--- 3. 战场芯片接线（我方宠物 / 玩家 / 敌方） ---');
const pet = petUnit('sparkle');
const petHtml = sb.renderGroupUnit(pet, 'ally');
ok(/class="[^"]*\bgb-unit\b[^"]*\bgb-arena-unit\b/.test(petHtml),
  '战场单位根节点应为 .gb-unit.gb-arena-unit（renderGroupUnit 函数名不变）：' + petHtml.slice(0, 160));
ok(petHtml.includes('src="media/pets/sparkle.svg"'), '宠物芯片未渲染该宠的头像：' + petHtml.slice(0, 160));
ok(countPetIco(petHtml) === 1, `宠物芯片应恰好 1 枚 .pet-ico，实际 ${countPetIco(petHtml)}`);
ok(sliceAfterClass(petHtml, 'gb-arena-ico').indexOf('media/pets/sparkle.svg') > -1,
  '宠物头像不在芯片的 .gb-arena-ico 槽里（该槽是舞台芯片唯一的头像位）');
ok(petHtml.includes('width="16"') && petHtml.includes('height="16"'),
  '头像未带 16px 的 width/height 属性（会被 SVG 固有尺寸 48px 撑破芯片行高）');
ok(petHtml.includes('alt=""') && !/alt="[^"]+"/.test(petHtml),
  '装饰性头像的 alt 应为空串（旁边就是宠物名，写名字会让读屏念两遍）');
ok(petHtml.includes('class="pet-ico') && !/class="pet-ico[^"]*pet-ico/.test(petHtml),
  '头像未带 .pet-ico class（pixelated 样式会失效）');
ok(!/undefined|NaN/.test(petHtml), '战场芯片 HTML 里出现 undefined/NaN');

/* 结构级「不再像表格」：信息件只有 头像 → 名字 → 血条，且不得回流旧卡片类名
   （旧判据：rowContainers() === ['gb-row1','gb-hp-row'] + 头像夹在 row1 与 hp-row 之间） */
{
  ok(JSON.stringify(chipParts(petHtml)) === JSON.stringify(['gb-arena-ico', 'gb-name', 'gb-hp-wrap']),
    '芯片信息件应为 头像 → 名字 → 血条，实际：' + chipParts(petHtml).join(' > '));
  const bad = forbiddenHits(petHtml);
  ok(bad.length === 0, '战场芯片里出现被禁的旧卡片类名（信息密度回流）：' + bad.join(', '));
  ok(petHtml.indexOf('data-skill=') < 0 && petHtml.indexOf('data-talent=') < 0,
    '战场芯片里出现技能/天赋标签（data-skill / data-talent）—— 舞台芯片不放技能天赋');
}

/* 玩家（无 _petSpecies）：不给宠物头像（ico 槽是玩家首字），信息件与宠物芯片同构 */
const playerUnit = sb.createUnit({ id: 'player', side: 'ally', name: '🧑 你', level: 1,
  base: { hp: 100, atk: 10, def: 10, spd: 10 } });
const playerHtml = sb.renderGroupUnit(playerUnit, 'ally');
ok(countPetIco(playerHtml) === 0, '玩家芯片不应有宠物头像（ico 槽是玩家首字）');
ok(!playerHtml.includes('media/pets/'), '玩家芯片不应引用宠物头像');
ok(JSON.stringify(chipParts(playerHtml)) === JSON.stringify(['gb-arena-ico', 'gb-name', 'gb-hp-wrap']),
  '玩家芯片仍须含 头像槽 / 名字 / 血条，实际：' + chipParts(playerHtml).join(' > '));
ok(forbiddenHits(playerHtml).length === 0,
  '玩家芯片里出现旧卡片类名：' + forbiddenHits(playerHtml).join(', '));
ok(JSON.stringify(chipParts(petHtml)) === JSON.stringify(chipParts(playerHtml)),
  '宠物芯片与玩家芯片的信息件结构必须一致（只有 ico 槽的内容不同）');

/* 敌方：走怪物原型线，不许被套上宠物头像 */
const foe = sb.createEnemyUnit({ id: 'enemy-0', tier: 'minion', name: '杂兵·弓',
  base: { hp: 100, atk: 10, def: 5, spd: 8 } });
const foeHtml = sb.renderGroupUnit(foe, 'enemy');
ok(countPetIco(foeHtml) === 0, '敌方芯片不应有宠物头像（敌人走 monster-archetype 线）');
ok(!foeHtml.includes('media/pets/'), '敌方芯片不应引用宠物头像');
ok(foeHtml.includes('media/monsters/'), '敌方芯片的怪兽头像被误删（另一条线的既有接线）');
ok(sliceAfterClass(foeHtml, 'gb-arena-ico').indexOf('media/monsters/') > -1,
  '敌方怪物头像应在 .gb-arena-ico 槽里（与宠物同一个槽位）');
ok(forbiddenHits(foeHtml).length === 0,
  '敌方芯片里出现旧卡片类名：' + forbiddenHits(foeHtml).join(', '));

/* 阵亡：不再是折叠行，而是同一枚芯片加 .gb-dead（灰化 + 名字删除线），且**仍须保留头像** */
{
  const dead = petUnit('kirin');
  dead.hp = 0;
  const deadHtml = sb.renderGroupUnit(dead, 'ally');
  ok(hasClass(deadHtml, 'gb-dead'), '阵亡宠物芯片应带 .gb-dead（同一枚芯片灰化，不再折叠成 gb-dead-line 行）');
  ok(deadHtml.indexOf('gb-dead-line') < 0,
    '阵亡单位不得再走 gb-dead-line 折叠行（v2.4.x 舞台化已废弃该结构）');
  ok(hasClass(deadHtml, 'gb-arena-unit'), '阵亡芯片仍是 .gb-arena-unit（不得另起一种节点）');
  ok(deadHtml.includes('src="media/pets/kirin.svg"'), '阵亡芯片仍须保留头像（否则只能靠读名字认哪只没了）');
  ok(sliceAfterClass(deadHtml, 'gb-arena-ico').indexOf('media/pets/kirin.svg') > -1,
    '阵亡芯片的头像须在 .gb-arena-ico 槽里');
  ok(JSON.stringify(chipParts(deadHtml)) === JSON.stringify(['gb-arena-ico', 'gb-name', 'gb-hp-wrap']),
    '阵亡芯片仍须有 头像 / 名字 / 血条，实际：' + chipParts(deadHtml).join(' > '));
  ok(!/undefined|NaN/.test(deadHtml), '阵亡芯片 HTML 里出现 undefined/NaN');
}
/* 阵亡的视觉表达在 CSS 里（灰化 + 名字删除线），不是靠 JS 内联样式 */
ok(/\.gb-unit\.gb-dead\s+\.gb-name\{[^}]*text-decoration\s*:\s*line-through/.test(css),
  '阵亡芯片名字缺删除线（CSS .gb-unit.gb-dead .gb-name）');
ok(/\.gb-unit\.gb-dead\{[^}]*grayscale/.test(css),
  '阵亡芯片缺灰化（CSS .gb-unit.gb-dead 的 filter:grayscale）');
/* v2.4.x：折叠行 .gb-dead-line 已废弃，触控 44px 热区改由芯片自身兜住（a11y 硬要求） */
ok(/\.gb-arena-unit[^{]*\{[^}]*min-height\s*:\s*var\(--touch-min\)/.test(css),
  '.gb-arena-unit 未锁 min-height:var(--touch-min)(44px) —— 触控热区不可丢');
ok(/\.gb-ico\{[^}]*\}/.test(css) && !/\.gb-ico\{[^}]*(\bheight|\bmin-height)\s*:/.test(css),
  '.gb-ico 容器声明了 height/min-height（会把名字行钉高，破坏「高度不增」）');

/* ============ 4. 行动顺序条（行动顺序芯片） ============ */
console.log('--- 4. 行动顺序条芯片 ---');
const gb = { _stepQueue: [petUnit('kirin'), foe, petUnit('darkcrow')], _stepIdx: 0 };
const orderHtml = sb.renderGroupOrder(gb);
ok(orderHtml.includes('gb-order-chip'), '行动顺序条未渲染出芯片');
ok(orderHtml.includes('src="media/pets/kirin.svg"'), '行动顺序条「当前行动」芯片未渲染宠物头像');
ok(orderHtml.includes('src="media/pets/darkcrow.svg"'), '行动顺序条后排芯片未渲染宠物头像');
ok(!orderHtml.includes('media/pets/undefined'), '行动顺序条渲染出了 undefined 头像路径');
ok((orderHtml.match(/class="pet-ico/g) || []).length === 2,
  '行动顺序条应恰好 2 枚头像（2 只宠物；敌人不套宠物头像）');
ok(!orderHtml.includes('class="mon-ico'), '行动顺序条不应给敌人套宠物头像（那是怪物线的活）');
ok(/gb-order-chip ally now has-ico/.test(orderHtml),
  '「当前行动」的宠物芯片未挂 .has-ico（flex 对齐会失效）：' + orderHtml.slice(0, 160));
ok(/gb-order-chip enemy(?! has-ico)/.test(orderHtml), '敌人芯片不应挂 .has-ico');
/* 头像在名字之前（芯片最左），保证「▶ 名字」保持连续文本、只吃 1 个 gap */
ok(orderHtml.indexOf('class="pet-ico') < orderHtml.indexOf('圣光麒麟'),
  '行动顺序条头像应在名字之前');
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
  ok(JSON.stringify(chipParts(h)) === JSON.stringify(['gb-arena-ico', 'gb-name', 'gb-hp-wrap']),
    '无图标时芯片结构塌陷了：' + chipParts(h).join(' > '));

  const h2 = sb.renderGroupOrder({ _stepQueue: [u], _stepIdx: 0 });
  ok(h2.includes('🐾'), '无图标时行动顺序条芯片应退回 🐾 emoji');
  ok(!h2.includes('has-ico'), '无图标（emoji 兜底）时芯片不应挂 .has-ico（走原行内排版，高度不变）');
  ok(!/class="pet-ico/.test(h2), '无图标时行动顺序条不应出现头像 <img>');
  ok(!/undefined/.test(h2), '无图标时行动顺序条 HTML 里出现 undefined');
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

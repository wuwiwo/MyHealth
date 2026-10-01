#!/usr/bin/env node
/* v2.3 WP-I 测试：宠物面板版式整改（作者原话：「一键治疗、选择参战宠物要重新布局，
   结算按钮没有用就隐藏，有用再显示」）

   本套守三件事（与任务的三件一一对应）：
   1) **「结算」按钮的条件显示判据** —— `pet-store.js` 的 `petSettleStatus()`。
      断言方式是「判据 vs 真实结算行为一致」：对一组 fixture 逐一比对
      「`petSettleStatus().ready`」与「`settleAllPets()` 是否真的产生了可观察变化
      （事件数 > 0 或宠物数组被改写）」—— 两条链路必须逐例同真同假，
      否则就是发明了条件（多显示）或漏了内容（少显示）。
   2) **版式重排**（用真实 `renderPetPanel()` 的 HTML）：
      · ⚔️ 参战阵容（芯片 + 开战）在**面板顶部**、在宠物列表之前（原来贴在列表最底部）；
      · 🧪 一键治疗在材料区里**全宽独占一行**（`.pet-btn-wide`），不再与「🔄 兑换 10→1」并列；
      · 材料数字行里**不再有按钮**（数字不被按钮挤窄）。
   3) **头像尺寸网格对齐**（评审结论：逻辑格 3px → 显示尺寸须为 16 的倍数）：
      列表/详情/芯片全是 32px，无 40px / 24px 残留。

   另有 CSS 契约 + 接线守卫（防「改回单行」与「写了没人调」）。

   Run: node scripts/test-pet-panel-layout.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

/* ---------- 与 test-pet-icons.js 同一套沙箱与加载顺序（口径同源，别另起一套） ---------- */
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
  /* `_petBattlePicks` 真实环境由 game-render.js 声明（本沙箱不载该文件），这里补同名全局 */
  sb._petBattlePicks = [];
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(src(f), sb));
  return sb;
}

function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
function mkPet(sb, speciesId, stage, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = stage || 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}

/* 固定「今天」：2026-10-02（所有离线天数都相对它算，测试不依赖真实日期） */
const TODAY = '2026-10-02';
const YEST = '2026-10-01';
const OLD3 = '2026-09-29';
const NOW = new Date(2026, 9, 2, 12, 0, 0);

/* ============================================================
   1) 「结算」按钮的可用判据（petSettleStatus）
   ============================================================ */
console.log('\n[1] 结算按钮判据 petSettleStatus（语义取自 settlePet 的实际分支）');
const sb = makeSandbox();
function seed(pets, opt) {
  const o = opt || {};
  sb.store.set('pets', {
    version: 1, pets: pets, materials: o.materials || emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: o.storeSettle || null, monthlyKey: null
  });
}
ok(sb.dateKey(NOW) === TODAY, '沙箱「今天」= ' + TODAY + '（实测 ' + sb.dateKey(NOW) + '）');

seed([]);
let s0 = sb.petSettleStatus(null, NOW);
ok(s0.ready === false && s0.total === 0, '没有宠物 → 隐藏（ready=false）', JSON.stringify(s0));

seed([mkPet(sb, 'sparkle', 'mature')]);
let s1 = sb.petSettleStatus(null, NOW);
ok(s1.ready === true && s1.firstTimers === 1 && s1.due === 0,
  '未建档（lastSettleDate=null）→ 显示：settlePet 会写首日并产出「开始记录」事件', JSON.stringify(s1));

seed([mkPet(sb, 'sparkle', 'mature', { lastSettleDate: TODAY })]);
let s2 = sb.petSettleStatus(null, NOW);
ok(s2.ready === false && s2.due === 0 && s2.firstTimers === 0,
  '今天已结算过 → 隐藏（点了没有任何变化）', JSON.stringify(s2));

seed([mkPet(sb, 'sparkle', 'mature', { lastSettleDate: YEST })]);
let s3 = sb.petSettleStatus(null, NOW);
ok(s3.ready === true && s3.due === 1, '有 1 天离线 → 显示（会逐日推进）', JSON.stringify(s3));

seed([mkPet(sb, 'nonebear', 'mature', { lastSettleDate: OLD3, isDead: true })]);
let s4 = sb.petSettleStatus(null, NOW);
ok(s4.ready === false && s4.dead === 1,
  '只剩已阵亡且日期陈旧的宠物 → 隐藏（settlePet 对 isDead 直接早退）', JSON.stringify(s4));

seed([mkPet(sb, 'nonebear', 'mature', { isDead: true })]);
let s5 = sb.petSettleStatus(null, NOW);
ok(s5.ready === true && s5.firstTimers === 1,
  '已阵亡但未建档 → 显示（settlePet 的首日分支在 isDead 之前，会写 lastSettleDate）', JSON.stringify(s5));

seed([mkPet(sb, 'sparkle', 'mature', { lastSettleDate: '2026-10-05' })]);
let s6 = sb.petSettleStatus(null, NOW);
ok(s6.ready === false, '日期在未来（时钟回拨）→ 隐藏（daysBetween ≤ 0）', JSON.stringify(s6));

/* 只读：判据不得写存档 */
seed([mkPet(sb, 'sparkle', 'mature', { lastSettleDate: YEST })]);
const snapRead = JSON.stringify(sb.getPetStore());
sb.petSettleStatus(null, NOW);
sb.petSettleStatus(sb.getPetStore(), NOW);
ok(JSON.stringify(sb.getPetStore()) === snapRead, '只读：petSettleStatus 不改存档');

/* 判据 vs 真实结算行为：逐 fixture 同真同假 */
console.log('   --- 与 settleAllPets 行为逐例比对 ---');
const FIXTURES = [
  ['没有宠物', []],
  ['昨天结算过（成熟）', [mkPet(sb, 'sparkle', 'mature', { lastSettleDate: YEST })]],
  ['今天结算过（成熟）', [mkPet(sb, 'sparkle', 'mature', { lastSettleDate: TODAY })]],
  ['3 天没结算（成熟）', [mkPet(sb, 'dream', 'mature', { lastSettleDate: OLD3 })]],
  ['蛋期 3 天没结算', [mkPet(sb, 'chirpbird', 'egg', { hatchProgress: 42, lastSettleDate: OLD3 })]],
  ['成长期 3 天没结算', [mkPet(sb, 'waterdrop', 'grow', { growth: 30, lastSettleDate: OLD3 })]],
  ['阵亡 + 陈旧日期（只剩它）', [mkPet(sb, 'nonebear', 'mature', { lastSettleDate: OLD3, isDead: true })]],
  ['阵亡 + 未建档', [mkPet(sb, 'nonebear', 'mature', { isDead: true })]],
  ['混合 5 只（受伤 / 蛋期 / 阵亡 / 已结算 / 未结算）', [
    mkPet(sb, 'sparkle', 'mature', { lastSettleDate: TODAY }),
    mkPet(sb, 'icecrystal', 'mature', { lastSettleDate: YEST, injured: true }),
    mkPet(sb, 'chirpbird', 'egg', { hatchProgress: 30, lastSettleDate: OLD3 }),
    mkPet(sb, 'dream', 'mature', { lastSettleDate: OLD3 }),
    mkPet(sb, 'kirin', 'mature', { lastSettleDate: OLD3, isDead: true })
  ]]
];
FIXTURES.forEach(function (fx) {
  const label = fx[0];
  seed(fx[1], { storeSettle: TODAY });   // 存档级 lastSettleDate 预置为今天：去掉纯记账写字的噪声
  const st = sb.petSettleStatus(null, NOW);
  const before = JSON.stringify(sb.getPetStore());
  const ev = sb.settleAllPets(NOW);
  const after = JSON.stringify(sb.getPetStore());
  const changed = (ev.length > 0) || (before !== after);
  ok(st.ready === changed,
    '「' + label + '」判据(' + st.ready + ') 与真实结算是否产生变化(' + changed + ') 一致',
    'ready=' + st.ready + ' events=' + ev.length + ' due=' + st.due + ' first=' + st.firstTimers);
  const st2 = sb.petSettleStatus(null, NOW);
  ok(st2.ready === false, '「' + label + '」结算后判据立即转为隐藏（按钮自洽消失）', JSON.stringify(st2));
});

/* ============================================================
   2) 版式重排（真实 renderPetPanel 的 HTML）
   ============================================================ */
console.log('\n[2] 面板版式：参战阵容置顶 + 一键治疗独立成行');
const sb2 = makeSandbox();
const PETS = [
  mkPet(sb2, 'sparkle', 'mature'),
  mkPet(sb2, 'icecrystal', 'mature', { injured: true, injuryHeal: 35 }),
  mkPet(sb2, 'chirpbird', 'egg', { hatchProgress: 42 }),
  mkPet(sb2, 'dream', 'mature'),
  mkPet(sb2, 'nonebear', 'mature'),
  mkPet(sb2, 'kirin', 'mature'),
  mkPet(sb2, 'darkcrow', 'mature', { isDead: true })
];
const BAG = emptyBag();
BAG.nutrition = 12; BAG.feed = 8; BAG.spirit = 3; BAG.refineNormal = 21; BAG.refineHigh = 1; BAG.orbShard = 5;
/* ⚠️ `renderPetPanel()` 内部用的是**真实当天**（按钮判据不注入日期），
   所以这一节必须相对系统时钟取「今天 / 昨天」，不能复用上面固定的 TODAY/YEST。 */
const REAL_TODAY = sb2.dateKey(new Date());
const REAL_YEST = sb2.dateKey(new Date(Date.now() - 86400000));
function seedPanel(settleDate) {
  PETS.forEach(function (p) { p.lastSettleDate = settleDate; });
  sb2.store.set('pets', { version: 1, pets: PETS, materials: BAG, orbs: [], battlePicks: [],
    lastSettleDate: settleDate, monthlyKey: null });
}
/* 已选 4 只参战（含受伤那只仍然是「已选」——是既有语义：开战时由 canPetBattle 过滤） */
sb2._petBattlePicks = ['sparkle', 'dream', 'nonebear', 'kirin'];

seedPanel(REAL_TODAY);            // 今天已结算过 → 结算按钮应当隐藏
sb2.renderPetPanel();
const H = sb2.__ov.innerHTML;

ok(H.includes('class="pet-lineup"'), '参战阵容区（.pet-lineup）存在');
const iLineup = H.indexOf('pet-lineup');
const iMat = H.indexOf('pet-mat"');
const iCard = H.indexOf('class="pet-card"');
ok(iLineup >= 0 && iMat > iLineup, '参战阵容在材料区之前', iLineup + ' vs ' + iMat);
ok(iCard > iLineup, '参战阵容在宠物列表之前（改前它贴在列表最底部）', iLineup + ' vs ' + iCard);
ok(iCard > iMat, '材料区仍在宠物列表之前（顺序未被打乱）', iMat + ' vs ' + iCard);
ok(H.indexOf('petStartBattle') > iLineup && H.indexOf('petStartBattle') < iMat,
  '「开始敌群试炼」跟着参战选择一起上移（它是这份选择的动作）');

const nPicks = (H.match(/data-pet-pick="/g) || []).length;
ok(nPicks === 5, '参战芯片 = 成熟且未阵亡的 5 只（排除蛋期 1 只 + 阵亡 1 只），实际 ' + nPicks);
ok(H.indexOf('data-pet-pick="chirpbird"') < 0, '蛋期宠物不进参战芯片');
ok(H.indexOf('data-pet-pick="darkcrow"') < 0, '已阵亡宠物不进参战芯片');
ok(H.indexOf('class="pet-lineup-count">4/4<') >= 0, '阵容摘要显示已选数量 4/4');
ok((H.match(/aria-pressed="true"/g) || []).length === 4, '4 个已选芯片带 aria-pressed="true"（切换语义）');
ok((H.match(/aria-pressed="false"/g) || []).length === 1, '1 个未选芯片带 aria-pressed="false"');
ok(H.indexOf('src="media/pets/sparkle.svg"') > 0, '芯片内仍是头像 + 名称（头像渲染入口未变）');

/* 材料区：数字行无按钮，按钮组独立、一键治疗全宽独占一行 */
const rowM = /<div class="pet-mat-row">([\s\S]*?)<\/div>/.exec(H);
ok(!!rowM, '材料数字行 .pet-mat-row 存在');
ok(rowM && !/<button/.test(rowM[1]), '材料数字行里**不再有按钮**（数字不再被按钮挤窄）');
ok(rowM && ['营养液', '饲料', '灵能', '炼化石', '宝珠碎片'].every(t => rowM[1].includes(t)),
  '5 项材料数字仍在（营养液/饲料/灵能/炼化石/宝珠碎片）');
const actM = /<div class="pet-mat-actions">([\s\S]*?)<\/div>/.exec(H);
ok(!!actM, '材料按钮组 .pet-mat-actions 存在');
const healBtn = /<button[^>]*id="petHealAll"[^>]*>/.exec(actM ? actM[1] : '');
const exchBtn = /<button[^>]*id="petExchange"[^>]*>/.exec(actM ? actM[1] : '');
ok(!!healBtn && !!exchBtn, '一键治疗与兑换都在按钮组内');
ok(healBtn && healBtn[0].includes('pet-btn-wide'),
  '一键治疗带 .pet-btn-wide（flex-basis 100% → 全宽独占一行，不再与兑换并列）', healBtn ? healBtn[0] : '');
ok(healBtn && /min-height:44px/.test(healBtn[0]), '一键治疗热区 ≥44px', healBtn ? healBtn[0] : '');
ok(exchBtn && /min-height:44px/.test(exchBtn[0]), '兑换按钮热区 ≥44px');
ok(H.indexOf('一键治疗（1）') >= 0, '一键治疗显示受伤数量（本 fixture 1 只受伤）');

/* 结算按钮：无可结算内容 → 整块不渲染 */
ok(H.indexOf('id="petSettle"') < 0, '今天已结算过 → 「结算」按钮不渲染（作者：没有用就隐藏）');
ok(H.includes('id="petClose"') && H.includes('🐾 宠物面板'), '头部其它元素不受影响');
ok((H.match(/class="pet-card"/g) || []).length === 7, '7 只宠物的卡片全部照旧渲染');

/* 结算按钮：构造「有内容」→ 出现，且点一次后消失 */
seedPanel(REAL_YEST);
sb2.renderPetPanel();
const H2 = sb2.__ov.innerHTML;
ok(H2.indexOf('id="petSettle"') >= 0, '有 1 天离线 → 「结算」按钮出现');
ok(/id="petSettle"[^>]*>结算</.test(H2), '按钮文案仍是「结算」');
ok(/id="petSettle"[^>]*title="[^"]*\d+ 只宠物/.test(H2), '按钮 title 说明待结算只数',
  (/id="petSettle"[^>]*title="([^"]*)"/.exec(H2) || [])[1] || '');
ok(H2.indexOf('id="petSettle"') < H2.indexOf('id="petClose"') + 400,
  '结算按钮仍在头部一行内（未因条件渲染跑到别处）');

/* ============================================================
   3) 头像尺寸网格对齐（评审：显示尺寸须为 16 的倍数）
   ============================================================ */
console.log('\n[3] 头像显示尺寸（16 的倍数）');
const uiSrc = src('pet-ui.js');
const sizeLits = [...uiSrc.matchAll(/petIcon(?:Stage)?Html\(\s*[^,)]+,\s*(\d+)/g)].map(m => Number(m[1]));
ok(sizeLits.length >= 4, 'pet-ui.js 里仍有 ≥4 处图标尺寸字面量，实际 ' + sizeLits.length);
ok(sizeLits.every(n => n % 16 === 0), '图标尺寸全是 16 的倍数：' + sizeLits.join(', '));
ok(!sizeLits.includes(40) && !sizeLits.includes(24), '无 40px / 24px 残留（评审 4-4 的 2.5px / 1.5px 格宽）');
ok(/petIconStageHtml\(p\.speciesId, 32, p\.stage\)/.test(uiSrc), '列表卡头像 = 32px');
ok(/petIconHtml\(pet\.speciesId, 32\)/.test(uiSrc), '详情页头部头像 = 32px');
ok(/petIconHtml\(p\.speciesId, 32\)/.test(uiSrc), '参战芯片头像 = 32px（未借机改尺寸）');
ok(/petIconHtml\(p\.speciesId, 32\)[\s\S]{0,120}pet-cmp-chip/.test(uiSrc) ||
   /pet-cmp-chip[\s\S]{0,200}petIconHtml\(p\.speciesId, 32\)/.test(uiSrc), '对比芯片头像 = 32px');
const chSrc = src('challenge.js');
ok([...chSrc.matchAll(/petIconHtml\(\s*[^,)]+,\s*(\d+)/g)].every(m => Number(m[1]) % 16 === 0),
  '结算面板（challenge.js）头像尺寸仍是 16 的倍数（32px，本批不动）');

/* ============================================================
   4) CSS 契约 + 接线守卫
   ============================================================ */
console.log('\n[4] CSS 契约与接线守卫');
const css = src('index.css');
ok(/\.pet-lineup\s*\{[^}]*background:var\(--bg2\)/.test(css), '.pet-lineup 复用 --bg2 卡片底（无新颜色）');
ok(/\.pet-pick-chips\s*\{[^}]*flex-wrap:wrap/.test(css), '.pet-pick-chips 可换行（多只也不溢出）');
ok(/\.pet-start-battle\s*\{[^}]*width:100%[^}]*min-height:var\(--touch-min\)/.test(css),
  '.pet-start-battle 全宽且热区 ≥ --touch-min');
ok(/\.pet-mat-row\s*\{[^}]*flex-wrap:wrap/.test(css), '.pet-mat-row 可换行');
ok(/\.pet-btn-wide\s*\{[^}]*flex:1 1 100%[^}]*min-height:var\(--touch-min\)/.test(css),
  '.pet-btn-wide = 100% 基宽 + ≥44px 热区（一键治疗独占一行）');
ok(/\.pet-pick-chip\s*,\s*\.pet-cmp-chip\s*\{[^}]*display\s*:\s*inline-flex/.test(css),
  '芯片的 inline-flex 契约仍在（test-pet-icons 4g 依赖这条）');
/* 新块不引入新字号 / 新颜色字面量 */
const block = (function () {
  const i = css.indexOf('v2.3 WP-I：宠物面板版式');
  return i < 0 ? '' : css.slice(i, css.indexOf('.skill-card{', i));
})();
ok(block.length > 0, 'index.css 里有 v2.3 宠物面板版式区块');
ok(block.length > 0 && !/font-size:(?!var\(--fs-)/.test(block), '新区块的字号全部走 var(--fs-*) 令牌');
ok(block.length > 0 && !/#/.test(block), '新区块没有引入任何新颜色字面量（低风险版式改动）');
const touchRules = (css.match(/min-height:var\(--touch-min\)/g) || []).length;
ok(touchRules >= 6, '--touch-min 规则数 ' + touchRules + ' 处（护栏要求 ≥6）');

/* 接线守卫：判据只有一份、UI 真的用它做条件渲染 */
const storeSrc = src('pet-store.js');
ok(/function petSettleStatus\s*\(/.test(storeSrc), 'petSettleStatus 定义在 pet-store.js（语义唯一来源）');
ok(/window\.petSettleStatus\s*=\s*petSettleStatus/.test(storeSrc) &&
   /globalThis\.petSettleStatus\s*=\s*petSettleStatus/.test(storeSrc), 'petSettleStatus 已导出到 window / globalThis');
ok(/function petSettleStatus[\s\S]*?daysBetween\(pet\.lastSettleDate, today\) > 0/.test(storeSrc),
  '判据用的是 date-roll 的 daysBetween（与 settlePet 同一口径，不另算天数）');
ok(uiSrc.indexOf('petSettleStatus') >= 0, 'pet-ui.js 真的调用 petSettleStatus');
ok(uiSrc.indexOf('st.ready') >= 0 && uiSrc.indexOf('st.ready') < uiSrc.indexOf('id="petSettle"'),
  '「结算」按钮由 st.ready 条件渲染（不是常驻按钮）');
ok(!/id="petSettle"[^>]*id="petSettle"/.test(uiSrc), '结算按钮只有一处渲染点');
ok(uiSrc.indexOf('⚔️ 选择参战宠物（最多 ') < 0, '旧的「列表底部选择参战宠物」标题已移除');
ok(!/undefined|NaN/.test(H), '面板 HTML 无 undefined / NaN 硬伤');
ok(!/undefined|NaN/.test(H2), '结算按钮出现时面板 HTML 同样无硬伤');

/* ---------- 汇总 ---------- */
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log('===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);

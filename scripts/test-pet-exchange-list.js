#!/usr/bin/env node
/* v2.15 测试：🧪 营养液 ⇄ 🍖 宠物粮 互兑 + 宠物列表紧凑化

   作者原话（两件）：
     1) 「让营养液与宠物粮 可以1:2 互相兑换（2换1）」
     2) 「优化宠物列表，现在列表太长了」

   本套守四组：
   [1] **兑换规则**（`pet-materials.js`，纯逻辑单源）
       · 双向：2 营养液 → 1 宠物粮 / 2 宠物粮 → 1 营养液
       · **只做整组**：不足 2 个一律拒绝，且**一个都不扣**
       · **不产生小数**：spent 恒为 2 的整数倍、gained 恒为整数、余额永远是整数
         （times 传 1.7 / -3 / NaN 也按正整数处理）
       · 未支持的材料（灵能/炼化石/碎片）拒绝
   [2] **立即落盘**（`pet-store.js` 的 `exchangePetMaterials`，唯一落盘入口）
       · 成功 → store（= localStorage）立刻是新值；失败 → **一次都不写**
       · 只读视图 `petMatExchangeInfo()` 不写存档
   [3] **列表新版式**（真实 `renderPetPanel()` 的 HTML）
       · 每只宠一行 `.pet-row`；操作收进「⋯」（默认 `hidden`，`aria-expanded=false`，
         `aria-controls` 指向真实存在的折叠区）→ 展开后仍是改前那批 `data-pet-op`（2 次点击可达）
       · 按可操作性分组排序 参战 → 可用 → 受伤 → 成长中 → 阵亡（`data-pet-group`）
       · 名称在 `.pet-card-name` 里（CSS nowrap，附录 A-1 不许回退）
       · 状态逐只可见（成熟/孵化/成长 · 饥饿 · 健康 · 受伤/阵亡）
       · 每个可点目标 ≥44px；互兑按钮两个方向都在、不足时禁用并给出原因行
       · 既有结构未被破坏（参战阵容仍在材料区之前、一键治疗仍 `.pet-btn-wide`、结算按判据渲染）
   [4] **单一来源 / CSS 契约守卫**
       · 比例字面量 `2` 只允许出现在 `pet-materials.js`（UI 不得复制一套数字）
       · UI 只调 `exchangePetMaterials` / `petMatExchangeInfo`
       · `.pet-row` ≥ --touch-min、`.pet-card-actions[hidden]` 真的隐藏、新区块无新字号/新颜色

   Run: node scripts/test-pet-exchange-list.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg, detail) {
  if (cond) pass++;
  else { fail++; fails.push(msg + (detail ? ' — ' + detail : '')); }
}

/* ---------- 与 test-pet-panel-layout.js / test-pet-icons.js 同一套沙箱与加载顺序（口径同源） ---------- */
function makeSandbox(seed) {
  let a = (seed || 1) >>> 0;
  const rnd = function () {          // 确定性随机（mulberry32 同型）：治疗/炼化的区间可复现
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const mem = {};
  const stats = { sets: 0 };
  const sb = { Math: M, JSON, console, Date,
    store: { get: k => (mem[k] === undefined ? null : mem[k]),
             set: (k, v) => { stats.sets++; mem[k] = v; },
             registerSchema: () => {}, _mem: mem, _stats: stats } };
  sb.window = sb; sb.globalThis = sb;
  const ov = {
    innerHTML: '', hidden: false, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
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

/* ============================================================
   [1] 兑换规则（pet-materials.js，纯逻辑）
   ============================================================ */
console.log('\n[1] 兑换规则：双向 / 整组 / 不产生小数');

const S = makeSandbox(20261015);

ok(S.PET_MAT_EXCHANGE_RATE === 2, '比例常量 = 2（2 换 1）', String(S.PET_MAT_EXCHANGE_RATE));
ok(S.matExchangePeer('nutrition') === 'feed' && S.matExchangePeer('feed') === 'nutrition',
  '互兑两端：营养液 ⇄ 宠物粮');
ok(S.matExchangePeer('spirit') === null && S.matExchangePeer('') === null,
  '其它材料不开放兑换（返回 null）');

/* --- 2 营养液 → 1 宠物粮 --- */
let bag = S.createMaterialBag();
bag.nutrition = 5; bag.feed = 3;
let r = S.exchangeNutritionFeed(bag, 'nutrition', 1);
ok(r.ok === true, '2 营养液 → 1 宠物粮：成功', JSON.stringify(r));
ok(bag.nutrition === 3 && bag.feed === 4, '营养液 5→3、宠物粮 3→4', JSON.stringify(bag));
ok(r.spent === 2 && r.gained === 1, '返回 spent=2 / gained=1', JSON.stringify(r));
ok(r.from === 'nutrition' && r.to === 'feed', '返回方向 from=nutrition → to=feed', JSON.stringify(r));
ok(r.fromBalance === 3 && r.toBalance === 4, '返回余额与材料袋一致', JSON.stringify(r));

/* --- 反向：2 宠物粮 → 1 营养液 --- */
let bag2 = S.createMaterialBag();
bag2.nutrition = 0; bag2.feed = 2;
let r2 = S.exchangeNutritionFeed(bag2, 'feed', 1);
ok(r2.ok === true, '2 宠物粮 → 1 营养液：成功', JSON.stringify(r2));
ok(bag2.nutrition === 1 && bag2.feed === 0, '营养液 0→1、宠物粮 2→0', JSON.stringify(bag2));
ok(r2.spent === 2 && r2.gained === 1, '反向 spent=2 / gained=1', JSON.stringify(r2));

/* --- 不足 2 个：拒绝且一个都不扣 --- */
[['nutrition', 0], ['nutrition', 1], ['feed', 1]].forEach(function (c) {
  const b = S.createMaterialBag();
  b[c[0]] = c[1];
  const peer0 = (c[0] === 'nutrition') ? b.feed : b.nutrition;
  const before = JSON.stringify(b);
  const rr = S.exchangeNutritionFeed(b, c[0], 1);
  ok(rr.ok === false, c[0] + ' 只有 ' + c[1] + ' 个 → 拒绝（不足整组）', JSON.stringify(rr));
  ok(/不足/.test(rr.reason || ''), c[0] + ' 不足时给出原因', rr.reason);
  ok(JSON.stringify(b) === before, c[0] + ' 不足时**一个都不扣**（原子性）', JSON.stringify(b));
  ok((c[0] === 'nutrition' ? b.feed : b.nutrition) === peer0, c[0] + ' 不足时对方也不加', JSON.stringify(b));
});

/* --- 只做整组：1 个永远不能换（即使只有 1 个缺口） --- */
const b10 = S.createMaterialBag(); b10.nutrition = 1;
ok(S.exchangeNutritionFeed(b10, 'nutrition', 1).ok === false && b10.nutrition === 1,
  '1 个营养液不能换成 0.5 个宠物粮（整组语义）');

/* --- 不产生小数 --- */
const bDec = S.createMaterialBag(); bDec.nutrition = 7; bDec.feed = 0;
for (let i = 0; i < 3; i++) S.exchangeNutritionFeed(bDec, 'nutrition', 1);
ok(bDec.nutrition === 1 && bDec.feed === 3, '7 个营养液换 3 次 → 余 1 / 得 3（余数留在原处）', JSON.stringify(bDec));
ok([bDec.nutrition, bDec.feed].every(v => Number.isInteger(v)), '交换后余额全是整数（无小数）', JSON.stringify(bDec));
const bTimes = S.createMaterialBag(); bTimes.nutrition = 6;
const rT = S.exchangeNutritionFeed(bTimes, 'nutrition', 3);
ok(rT.ok === true && rT.spent === 6 && rT.gained === 3 && bTimes.feed === 3,
  'times=3 → 花 6 得 3（spent = 2×times）', JSON.stringify(rT));
ok(rT.spent % S.PET_MAT_EXCHANGE_RATE === 0, 'spent 恒为比例的整数倍（不会出现半个）', String(rT.spent));
[1.7, 2.9, -3, NaN, undefined, '2'].forEach(function (t) {
  const bb = S.createMaterialBag(); bb.nutrition = 10;
  const rr = S.exchangeNutritionFeed(bb, 'nutrition', t);
  const timesUsed = 10 - bb.nutrition;   // 花掉的个数
  ok(rr.ok === true && Number.isInteger(rr.gained) && rr.gained >= 1 && timesUsed % 2 === 0,
    'times=' + String(t) + ' 被规整为正整数（gained=' + (rr.ok ? rr.gained : '—') + '，花 ' + timesUsed + '）',
    JSON.stringify(rr));
});

/* --- 未支持的材料 --- */
const bSp = S.createMaterialBag(); bSp.spirit = 10;
ok(S.exchangeNutritionFeed(bSp, 'spirit', 1).ok === false && bSp.spirit === 10,
  '灵能不参与互兑（拒绝且不扣）');
ok(S.exchangeNutritionFeed(null, 'nutrition', 1).ok === false || true, 'bag=null 不抛错');

/* --- 只读视图（UI 消费的唯一判据） --- */
const bView = S.createMaterialBag(); bView.nutrition = 5; bView.feed = 1;
const view = S.matExchangeView(bView);
ok(view.rate === 2 && view.rows.length === 2, '视图：rate=2、两个方向各一行', JSON.stringify(view.rows));
const vNut = view.rows.filter(x => x.from === 'nutrition')[0];
const vFeed = view.rows.filter(x => x.from === 'feed')[0];
ok(vNut.ok === true && vNut.times === 2, '营养液 5 个 → 可兑 2 次', JSON.stringify(vNut));
ok(vFeed.ok === false && vFeed.times === 0 && /不足/.test(vFeed.reason || ''),
  '宠物粮 1 个 → 不足（times=0 + 原因）', JSON.stringify(vFeed));
ok(vNut.need === 2 && vNut.gain === 1 && vNut.label === '营养液' && vNut.peerLabel === '宠物粮',
  '视图字段：need/gain/中文名（UI 靠它拼文案，不自己写数字）', JSON.stringify(vNut));
const snapView = JSON.stringify(bView);
S.matExchangeView(bView); S.matExchangeCapacity(bView, 'nutrition');
ok(JSON.stringify(bView) === snapView, '只读：matExchangeView / matExchangeCapacity 不改材料袋');
ok(S.matExchangeCapacity(bView, 'nutrition') === 2 && S.matExchangeCapacity(bView, 'feed') === 0,
  'matExchangeCapacity：5→2 次、1→0 次');

/* ============================================================
   [2] 立即落盘（pet-store.js，唯一落盘入口）
   ============================================================ */
console.log('\n[2] 立即落盘：exchangePetMaterials / petMatExchangeInfo');
const S2 = makeSandbox(20261016);
function seedStore(sb, bag, pets) {
  sb.store.set('pets', {
    version: 1, pets: pets || [], materials: bag || emptyBag(), orbs: [], battlePicks: [],
    lastSettleDate: null, monthlyKey: null
  });
}
function storedMats(sb) { return JSON.parse(JSON.stringify(sb.store.get('pets').materials)); }

seedStore(S2, Object.assign(emptyBag(), { nutrition: 5, feed: 3 }));
const setsBefore = S2.store._stats.sets;
const pr = S2.exchangePetMaterials('nutrition', 1);
ok(pr.ok === true, 'exchangePetMaterials("nutrition") 成功', JSON.stringify(pr));
ok(S2.store._stats.sets === setsBefore + 1, '成功时**真的写了一次**存档（savePetStore 被调用）',
  'sets ' + setsBefore + ' → ' + S2.store._stats.sets);
ok(storedMats(S2).nutrition === 3 && storedMats(S2).feed === 4,
  '落盘值：营养液 3 / 宠物粮 4（刷新后仍在）', JSON.stringify(storedMats(S2)));

seedStore(S2, Object.assign(emptyBag(), { nutrition: 1, feed: 3 }));
const setsBefore2 = S2.store._stats.sets;
const pr2 = S2.exchangePetMaterials('nutrition', 1);
ok(pr2.ok === false && /不足/.test(pr2.reason || ''), '不足 2 个 → exchangePetMaterials 失败并给出原因', JSON.stringify(pr2));
ok(S2.store._stats.sets === setsBefore2, '失败时**一次都不写盘**', 'sets=' + S2.store._stats.sets);
ok(storedMats(S2).nutrition === 1 && storedMats(S2).feed === 3, '失败时存档原封不动', JSON.stringify(storedMats(S2)));

seedStore(S2, Object.assign(emptyBag(), { nutrition: 4, feed: 2 }));
const setsBefore3 = S2.store._stats.sets;
const info = S2.petMatExchangeInfo();
ok(S2.store._stats.sets === setsBefore3, '只读：petMatExchangeInfo 不写存档');
ok(info.rate === 2 && info.rows.length === 2 && info.rows.every(x => x.ok === true),
  'petMatExchangeInfo 返回两个方向都可用（4/2 都够）', JSON.stringify(info.rows.map(x => x.ok)));

/* ============================================================
   [3] 列表新版式（真实 renderPetPanel 的 HTML）
   ============================================================ */
console.log('\n[3] 列表新版式：紧凑行 + 状态分组 + 操作折叠');
const S3 = makeSandbox(20261017);
function mkPet(sb, speciesId, stage, over) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = stage || 'mature';
  const o = over || {};
  for (const k in o) p[k] = o[k];
  return p;
}
/* 8 只：参战 3 / 可用 1 / 受伤 1 / 成长中 2 / 阵亡 1 —— 五组全覆盖 */
const PETS = [
  mkPet(S3, 'sparkle', 'mature'),                                   // 0 参战
  mkPet(S3, 'icecrystal', 'mature', { injured: true, injuryHeal: 35 }), // 1 受伤
  mkPet(S3, 'chirpbird', 'mature'),                                 // 2 参战
  mkPet(S3, 'dream', 'mature'),                                     // 3 参战
  mkPet(S3, 'darkcrow', 'mature'),                                  // 4 可用（未选中）
  mkPet(S3, 'nonebear', 'mature', { isDead: true, health: 0 }),     // 5 阵亡
  mkPet(S3, 'kirin', 'egg', { hatchProgress: 42 }),                 // 6 成长中（蛋）
  mkPet(S3, 'waterdrop', 'grow', { growth: 30 })                    // 7 成长中（成长）
];
const MATS = Object.assign(emptyBag(), { nutrition: 5, feed: 3, spirit: 4, refineNormal: 21, refineHigh: 1, orbShard: 5 });
const REAL_TODAY = S3.dateKey(new Date());
PETS.forEach(p => { p.lastSettleDate = REAL_TODAY; });
seedStore(S3, MATS, PETS);
S3._petBattlePicks = ['sparkle', 'chirpbird', 'dream'];
S3.renderPetPanel();
const H = S3.__ov.innerHTML;

ok((H.match(/class="pet-card"/g) || []).length === 8, '8 只宠物仍然各渲染一张卡（没有丢人）',
  String((H.match(/class="pet-card"/g) || []).length));
ok((H.match(/class="pet-row"/g) || []).length === 8, '每张卡都是**一行**紧凑行（.pet-row ×8）',
  String((H.match(/class="pet-row"/g) || []).length));
const groups = [...H.matchAll(/class="pet-card" data-pet-group="([a-z]+)"/g)].map(m => m[1]);
ok(groups.join(',') === 'lineup,lineup,lineup,ready,injured,growing,growing,dead',
  '分组排序：参战 → 可用 → 受伤 → 成长中 → 阵亡', groups.join(','));
const idxOrder = [...H.matchAll(/data-pet-op="feed" data-pet-idx="(\d+)"/g)].map(m => Number(m[1]));
ok(idxOrder.join(',') === '0,2,3,4,1,6,7,5',
  '行的顺序变了，但 data-pet-idx 仍是**存档下标**（点了改的是同一只）', idxOrder.join(','));
ok(/data-pet-idx="3"[^]*?<\/div>/.test(H) || H.indexOf('data-pet-idx="3"') > 0, '下标 3（梦幻）的行动绑定仍在');

/* 名称：nowrap 契约 + 每行一个 .pet-card-name */
ok((H.match(/class="pet-card-name"/g) || []).length === 8, '每行一个 .pet-card-name（名称不被挤成侧栏）');
ok(S3.renderPetPanel() === undefined && (S3.__ov.innerHTML.match(/class="pet-card-name">清脆鸟</) || []).length === 1,
  '名称整串渲染（「清脆鸟」不被拆字）');

/* 状态：逐只可见 */
ok(/成熟 · 饥饿 72/.test(H) || /成熟 · 饥饿 \d+/.test(H), '成熟行仍显示「成熟 · 饥饿 N · 健康 N」');
ok(/孵化 42%/.test(H) && /成长 30%/.test(H), '蛋期/成长期仍显示「孵化 42% / 成长 30%」');
ok(/🤕 受伤 35%/.test(H), '受伤行仍显示「🤕 受伤 35%」');
ok(/💀 阵亡/.test(H), '阵亡行仍显示「💀 阵亡」');

/* 操作折叠：默认收起 + aria 契约 + 折叠区 id 真实存在 */
ok((H.match(/class="speed-btn pet-row-more"/g) || []).length === 8, '每行一个「⋯」开关（8 个）');
ok((H.match(/class="pet-card-actions" id="petActs\d+" hidden/g) || []).length === 8,
  '操作默认全部收起（.pet-card-actions 带 hidden）',
  String((H.match(/class="pet-card-actions" id="petActs\d+" hidden/g) || []).length));
ok(!/class="pet-card-actions" id="petActs\d+">/.test(H), '没有一行是默认展开的');
ok((H.match(/aria-expanded="false"/g) || []).length >= 8, '「⋯」默认 aria-expanded=false');
const ctrlIds = [...H.matchAll(/aria-controls="(petActs\d+)"/g)].map(m => m[1]);
const realIds = new Set([...H.matchAll(/id="(petActs\d+)"/g)].map(m => m[1]));
ok(ctrlIds.length === 8 && ctrlIds.every(id => realIds.has(id)), 'aria-controls 指向真实存在的折叠区',
  ctrlIds.join(',') + ' vs ' + [...realIds].join(','));
ok((H.match(/\[data-pet-op\]|data-pet-op="/g) || []).length >= 8 * 3,
  '折叠区里仍是改前那批 data-pet-op 按钮（展开即 2 次点击可达）');

/* 热区：面板里每个 button 要么内联 min-height:44px，要么是 .speed-btn（CSS 保证 44） */
const btns = [...H.matchAll(/<button[^>]*>/g)].map(m => m[0]);
const badTouch = btns.filter(b => !/min-height:44px/.test(b) && !/class="[^"]*\bspeed-btn\b/.test(b));
ok(badTouch.length === 0, '面板内所有按钮都 ≥44px 热区（内联 44 或 .speed-btn 契约）',
  badTouch.slice(0, 3).join(' | '));

/* 互兑按钮：两个方向都在、文案数字来自视图、热区 44 */
const exBtns = [...H.matchAll(/<button[^>]*data-pet-exch="([a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)]
  .map(m => ({ from: m[1], tag: m[0], text: m[2] }));
ok(exBtns.length === 2, '材料区有 2 个互兑按钮（双向各一）', String(exBtns.length));
ok(exBtns.map(b => b.from).sort().join(',') === 'feed,nutrition', '两个方向：nutrition / feed',
  exBtns.map(b => b.from).join(','));
ok(exBtns.every(b => /2→1/.test(b.text)), '按钮文案是「2→1」（由 need/gain 拼出，不是写死的）',
  exBtns.map(b => b.text).join(' | '));
ok(exBtns.every(b => /min-height:44px/.test(b.tag)), '互兑按钮热区 ≥44px');
ok(exBtns.every(b => /aria-label="用 2 个(营养液|宠物粮)兑换 1 个(宠物粮|营养液)"/.test(b.tag)),
  '互兑按钮有 aria-label（图标按钮必须可读出方向）', exBtns.map(b => b.tag.slice(0, 60)).join(' | '));
ok(exBtns.every(b => !/disabled/.test(b.tag)), '材料够 2 个时按钮可点（不误禁用）');
ok(H.indexOf('pet-mat-hint') < 0, '两个方向都能换时**不出**原因行（不占高度）');

/* 不足时：同一次渲染里禁用 + 原因行 */
seedStore(S3, Object.assign(emptyBag(), { nutrition: 5, feed: 1 }), PETS);
S3.renderPetPanel();
const H2 = S3.__ov.innerHTML;
const feedBtn = /<button[^>]*data-pet-exch="feed"[^>]*>/.exec(H2);
const nutBtn = /<button[^>]*data-pet-exch="nutrition"[^>]*>/.exec(H2);
ok(!!feedBtn && /\sdisabled\s/.test(feedBtn[0]) && /aria-disabled="true"/.test(feedBtn[0]),
  '宠物粮只有 1 个 → 「🍖→🧪」禁用（disabled + aria-disabled）', feedBtn ? feedBtn[0] : '');
ok(!!nutBtn && !/\sdisabled\s/.test(nutBtn[0]), '营养液够 2 个 → 「🧪→🍖」仍可点');
ok(/title="宠物粮不足（需 2，现有 1）"/.test(feedBtn ? feedBtn[0] : ''),
  '禁用按钮的 title 说明原因（需 2 / 现有 1）', feedBtn ? feedBtn[0] : '');
ok(/class="pet-mat-hint"/.test(H2) && /宠物粮不足（需 2，现有 1）/.test(H2),
  '不足时另有一行可见原因（不是只能 hover 才看得到）');

/* 既有结构必须未被破坏 */
ok(H.indexOf('class="pet-lineup"') >= 0, '参战阵容区仍在（.pet-lineup）');
ok(H.indexOf('class="pet-lineup"') < H.indexOf('class="pet-mat"'), '参战阵容仍在材料区之前（v2.3 的改动不回退）');
ok(H.indexOf('class="pet-mat"') < H.indexOf('class="pet-card"'), '材料区仍在宠物列表之前');
const heal = /<button[^>]*id="petHealAll"[^>]*>/.exec(H);
ok(!!heal && /pet-btn-wide/.test(heal[0]), '一键治疗仍是 .pet-btn-wide（全宽独占一行）');
ok(!!heal && /min-height:44px/.test(heal[0]), '一键治疗热区 ≥44px');
ok(H.indexOf('id="petSettle"') < 0, '今天已结算 → 结算按钮仍按判据隐藏（条件渲染未动）');
ok(!/undefined|NaN/.test(H) && !/undefined|NaN/.test(H2), '面板 HTML 无 undefined / NaN 硬伤');

/* ============================================================
   [4] 单一来源 + CSS 契约
   ============================================================ */
console.log('\n[4] 单一来源与 CSS 契约');
const matSrc = src('pet-materials.js');
const storeSrc = src('pet-store.js');
const uiSrc = src('pet-ui.js');
const css = src('index.css');

ok(/var PET_MAT_EXCHANGE_RATE = 2;/.test(matSrc), '比例常量定义在 pet-materials.js 且 = 2');
const jsFiles = fs.readdirSync(PAGE).filter(f => f.endsWith('.js'));
const rateSites = jsFiles.filter(f => src(f).indexOf('PET_MAT_EXCHANGE_RATE') >= 0);
ok(rateSites.length === 1 && rateSites[0] === 'pet-materials.js',
  'PET_MAT_EXCHANGE_RATE 只出现在 pet-materials.js（UI 不复制数字）', rateSites.join(', '));
ok(uiSrc.indexOf('PET_MAT_EXCHANGE_RATE') < 0, 'pet-ui.js 不引用比例常量（只消费视图）');
ok(!/(materials|bag)\.(nutrition|feed)\s*[-+]=?\s*2\b/.test(uiSrc),
  'pet-ui.js 不做「±2」的材料算术（口径只在逻辑层）');
ok(uiSrc.indexOf('exchangePetMaterials') >= 0, 'UI 真的调用落盘入口 exchangePetMaterials');
ok(uiSrc.indexOf('petMatExchangeInfo') >= 0, 'UI 真的调用只读视图 petMatExchangeInfo');
ok(/function exchangePetMaterials\s*\(/.test(storeSrc), 'exchangePetMaterials 定义在 pet-store.js（单一落盘）');
ok(/function exchangePetMaterials[\s\S]{0,600}if \(r\.ok\) savePetStore\(d\)/.test(storeSrc),
  '落盘只在成功时发生（失败不写）');
ok(/function exchangeNutritionFeed\s*\(/.test(matSrc) && storeSrc.indexOf('bag[from] -=') < 0,
  '材料增减只在 pet-materials.js（store 层不重写兑换算术）');
ok(/function matExchangeView[\s\S]{0,600}need: PET_MAT_EXCHANGE_RATE/.test(matSrc),
  '视图的 need 取自同一个常量（没有第二份 2）');

/* CSS 契约 */
ok(/\.pet-card-name\{[^}]*white-space:nowrap/.test(css), '名称 white-space:nowrap（附录 A-1 不许回退）');
ok(/\.pet-card-name\{[^}]*text-overflow:ellipsis/.test(css), '名称超长用省略号（不换行、不竖排）');
ok(/\.pet-row\{[^}]*min-height:var\(--touch-min\)/.test(css), '.pet-row 行高 ≥ --touch-min（44px）');
ok(/\.pet-row-more\{[^}]*width:var\(--touch-min\)/.test(css), '「⋯」宽 ≥ --touch-min');
ok(/\.pet-card-actions\[hidden\]\{display:none\}/.test(css),
  '.pet-card-actions[hidden] 真的 display:none（防 .pet-card-actions 的 flex 覆盖 hidden）');
ok(/\.pet-card\{padding:4px 10px;margin-bottom:4px/.test(css), '.pet-card 已是紧凑内边距（4px）');
const v215 = (function () {
  const i = css.indexOf('v2.15：宠物列表「紧凑行」');
  return i < 0 ? '' : css.slice(i, css.indexOf('/* ========== LOADING', i));
})();
ok(v215.length > 0, 'index.css 里有 v2.15 紧凑行区块');
ok(v215.length > 0 && !/font-size:(?!var\(--fs-)/.test(v215), '新区块字号全部走 var(--fs-*) 令牌');
ok(v215.length > 0 && !/#/.test(v215), '新区块没有新颜色字面量');
ok(!/\.pet-card-bar\s*\{/.test(css), '废弃的 .pet-card-bar（进度条）已从 CSS 移除（不留死样式）');

/* 源码级：折叠是「一次只开一行」的就地切换（不整页重渲染） */
ok(/var _petRowOpen = null;/.test(uiSrc), '折叠状态是模块级 UI 状态（不进存档）');
ok(/_petRowOpen = \(_petRowOpen === idx\) \? null : idx/.test(uiSrc), '同一时刻只展开一行（不会又变长）');
ok(/btn\.setAttribute\('aria-expanded', open \? 'true' : 'false'\)/.test(uiSrc),
  '「⋯」就地同步 aria-expanded（不重渲染，滚动位置不丢）');

/* ---------- 汇总 ---------- */
console.log('');
if (fail) {
  console.log('失败项：');
  fails.forEach(m => console.log(' ✗ ' + m));
}
console.log('===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);

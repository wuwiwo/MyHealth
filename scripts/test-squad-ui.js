#!/usr/bin/env node
/* v2.14.24：编队 / 阵容 UI 测试（作者裁决 2026-11-27）
   覆盖：
   · 编队管理：选中态 = 实心 + ✓（aria-pressed 同源）；**已编在别队的宠物**标「在 X」+ 置灰 + disabled；
   · 参战阵容（= 首发队）里同样标出「在 X」并禁用（防点一下把宠物从别队悄悄搬走）；
   · 卡内元信息（首发说明 / 未编队 N 只）；
   · 培养页 `.train-lineup` 改为多队摘要（每队一行 + 点开编队管理），不再自带选择逻辑；
   · 关卡列表形态标签只调 `stageModeLabel`（单一来源），CSS 契约齐全。
   Run: node scripts/test-squad-ui.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(' ✓ ' + msg); }
  else { fail++; fails.push(msg); console.log(' ✗ ' + msg + (extra !== undefined ? '  → ' + extra : '')); }
}

/* ---------- 沙箱：与 test-pet-panel-layout.js 同一套加载顺序（口径同源） ---------- */
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
  vm.createContext(sb);
  ['utils.js', 'date-roll.js', 'levels.js', 'unit.js', 'state-core.js', 'status-defs.js', 'talent.js', 'skill.js',
    'enemy.js', 'terrain.js', 'battle.js', 'orbs.js', 'pet-codex.js', 'pets.js', 'pet-materials.js',
    'pet-store.js', 'group-levels.js', 'pet-ui.js'].forEach(f => vm.runInContext(src(f), sb));
  return sb;
}
function emptyBag() { return { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 }; }
function mkPet(sb, speciesId, stage) {
  const c = sb.getPetCodex(speciesId) || { rarity: 'R', name: speciesId };
  const p = sb.createPet({ speciesId: speciesId, rarity: c.rarity, name: c.name });
  p.stage = stage || 'mature';
  return p;
}

const sb = makeSandbox();
const PETS = ['sparkle', 'dream', 'nonebear', 'kirin', 'flamechick', 'rocksteady']
  .map(sid => mkPet(sb, sid, 'mature'));
sb.store.set('pets', {
  version: 1, pets: PETS, materials: emptyBag(), orbs: [], battlePicks: ['sparkle', 'dream'],
  squads: [
    { id: 'sq-1', name: '一队', petIds: ['sparkle', 'dream'] },
    { id: 'sq-2', name: '二队', petIds: ['nonebear'] }
  ],
  lastSettleDate: sb.dateKey(new Date()), monthlyKey: null
});
/* 首发队的运行时镜像（真实环境由 game-render.js 维护，本沙箱直接注入） */
sb._petBattlePicks = ['sparkle', 'dream'];
sb.renderPetPanel();
const H = sb.__ov.innerHTML;

console.log('\n[1] 编队管理：选中态与跨队占用标记');
const chipOf = (squadId, sid) => {
  const re = new RegExp('<button[^>]*data-squad-pick="' + squadId + '\\|' + sid + '"[^>]*>[\\s\\S]*?</button>');
  const m = re.exec(H);
  return m ? m[0] : null;
};
const c1a = chipOf('sq-1', 'sparkle');
const c2a = chipOf('sq-2', 'sparkle');
const c2b = chipOf('sq-2', 'nonebear');
ok(!!c1a && /aria-pressed="true"/.test(c1a), '一队里的 sparkle 是选中态（aria-pressed=true）');
ok(!!c1a && c1a.includes('pet-squad-chip is-sel'), '选中芯片带 is-sel（实心填充由 CSS 给）');
ok(!!c1a && c1a.includes('pet-squad-chip-mark'), '选中芯片带 ✓ 记号（不只靠颜色）');
ok(!!c2a && c2a.includes('is-taken'), '二队里同名宠物带 is-taken（跨队占用可见）');
ok(!!c2a && / disabled/.test(c2a) && /aria-disabled="true"/.test(c2a), '跨队占用芯片 disabled（点不动，不用点了才报错）');
ok(!!c2a && c2a.includes('在 一队'), '跨队占用芯片直接标出所在队名「在 一队」');
ok(!!c2a && /title="[^"]*同一宠物只能在一支小队/.test(c2a), 'title 说明原因（键盘 / 长按可读）');
ok(!!c2b && !/is-taken/.test(c2b) && /aria-pressed="true"/.test(c2b), '本队自己的宠物不受影响');
ok(H.includes('pet-squad-meta'), '每支小队有元信息行（首发说明 / 未编队 N 只）');
ok(/未编队 3 只/.test(H), '未编队数量按「不在任何队」实算（6 只里 3 只已编 → 3）');

console.log('\n[2] 出战编队摘要（只读）：不再与编队管理重复编辑');
const pickChips = (H.match(/class="pet-pick-chip"/g) || []).length;
ok(pickChips === 2, '摘要芯片 = 首发队 2 只，实际 ' + pickChips);
ok(!/data-pet-pick="/.test(H), '摘要里没有可点芯片（编辑入口只剩编队管理）');
ok((H.match(/<button[^>]*pet-pick-chip/g) || []).length === 0, '摘要芯片是 span 不是 button（只读）');
ok(H.includes('id="petSquadEditJump"'), '有「编队管理 ›」跳转入口（aria-controls 指向编队区）');
ok(/⚔️ 出战编队/.test(H) && !/参战阵容/.test(H), '标题统一为「出战编队」（不再叫「参战阵容」）');
ok(!/作战/.test(H), '徽标不再用「作战」（统一为「首发 / 第 N 队」）');

console.log('\n[3] 源码守卫：培养页多队摘要 + 单源标签');
const gv = src('game-views.js');
ok(gv.includes('data-train-squad='), '培养页每支小队一行（data-train-squad）');
ok(gv.includes('data-open-squad'), '有「编队管理」入口（data-open-squad）');
ok(!gv.includes('data-train-pick') && gv.indexOf('savePetBattlePicks(') < 0, '培养页不再自己改参战阵容（选择入口只剩编队管理）');
ok(gv.includes('_petSquadsOpen = true'), '点队伍会先展开编队区再渲染面板');
ok(/stageModeLabel\(/.test(gv) && !/stageIsMulti\(/.test(gv), '形态标签只调 stageModeLabel（视图不再自己判 mode）');
ok(!/function groupStageModeTag[\s\S]{0,400}stageIsMulti/.test(gv), 'groupStageModeTag 内没有第二套判据');
/* v2.14.25（评审 P2-3）：形态标签只标例外 + 分布写在列表头 */
ok(gv.includes("if (label !== '双 BOSS') return ''"), '「双场景」不再逐卡打标（只标例外「双 BOSS」）');
ok(gv.includes('gl-modes'), '列表头有一行形态分布（本大关 N 关：…）');
/* v2.14.25（评审 P1-2）：大关关卡卡改用类驱动，不再写内联状态色 */
ok(!/btnStyle/.test(gv), '关卡卡不再用内联 btnStyle（改 .gl-stage 状态类）');
ok(gv.includes('gl-stage'), '关卡卡用 .gl-stage 类');
ok(!/style="width:100%;padding:14px;font-size:var\(--fs-md\).*border-color:var\(--blue\)/.test(gv),
  '培养页入口按钮不再写内联语义色（改 .btn-entry）');

const css = src('index.css');
['.train-squad-row', '.train-squad-chip', '.train-squad-caret', '.pet-squad-chip.is-taken', '.pet-squad-chip-tag',
 '.lv-tag', '.gl-modes', '.gl-stage', '.btn-primary', '.btn-entry', '.pet-squad-meta',
 '.pet-lineup-sum', '.pet-squad-jump'].forEach(sel => {
  ok(css.includes(sel), 'CSS 契约：' + sel);
});
ok(/\.pet-squad-chip\[aria-pressed="true"\][^{]*\{[^}]*background:var\(--brand-fill\)/.test(css),
  '选中态是实心背景（不是只改字色）');

console.log(fail ? '\nFAIL ' + fail + ' / ' + (pass + fail) : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

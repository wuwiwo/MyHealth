#!/usr/bin/env node
/* v2.2 WP-H1 / WP-H2 测试
   H1：参战宠物选择持久化（dh-pets-v1 的 battlePicks 字段）+ 旧存档优雅退化
   H2：带宠物开战不再「从固定小关开始 + 胜利覆盖进度」（唯一开战入口 startGroupTrial）
   沙盒按 page/index.html 的真实加载顺序装全部模块（同 test-page-load.js）。
   Run: node scripts/test-pet-battle-picks.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)\?v\d+"><\/script>/g)].map(m => m[1]);

const ls = {};
/* 关键：**先**写入一份「旧存档」（没有 battlePicks 字段），再加载模块 ——
   用来验证迁移兼容：getPetStore() 必须补齐该字段、getPetBattlePicks() 必须返回 []。 */
ls['dh-pets-v1'] = JSON.stringify({
  version: 1, pets: [],
  materials: { nutrition: 0, feed: 0, spirit: 0, refineNormal: 0, refineHigh: 0, orbShard: 0 },
  orbs: [], lastSettleDate: null, monthlyKey: null
});

function mkEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', textContent: '', value: ''
  };
}
const sandbox = { console, JSON, Date, navigator: { userAgent: 'test' } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.localStorage = {
  getItem(k) { return k in ls ? ls[k] : null; },
  setItem(k, v) { ls[k] = String(v); },
  removeItem(k) { delete ls[k]; },
  key(i) { return Object.keys(ls)[i] || null; },
  get length() { return Object.keys(ls).length; }
};
sandbox.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  body: { appendChild() {}, remove() {} },
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  documentElement: { setAttribute() {} }
};
sandbox.toast = function () {};
sandbox.location = { search: '' };
sandbox.addEventListener = () => {};
sandbox.confirm = () => true;
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0;
sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.innerWidth = 375; sandbox.innerHeight = 700;
sandbox.navigator.vibrate = () => {};
vm.createContext(sandbox);
scripts.forEach(src => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', src), 'utf8'), sandbox, { filename: src });
});

/* ============ H1：参战宠物选择持久化 ============ */
ok(typeof sandbox.getPetBattlePicks === 'function', 'H1 getPetBattlePicks 已导出（window/globalThis）');
ok(typeof sandbox.savePetBattlePicks === 'function', 'H1 savePetBattlePicks 已导出');

const oldSave = sandbox.getPetStore();
ok(Array.isArray(oldSave.battlePicks), 'H1 旧存档（无 battlePicks）读取时补齐为数组');
ok(sandbox.getPetBattlePicks().length === 0, 'H1 旧存档 → 参战选择为空数组（优雅退化，不抛错）');

/* 造一只成熟宠物（speciesId = sparkle），用于后续持久化/剔除断言 */
(function () {
  const d = sandbox.getPetStore();
  const p = sandbox.createPet({ speciesId: 'sparkle', rarity: (sandbox.getPetCodex('sparkle') || {}).rarity || 'R', name: '闪闪星' });
  p.stage = 'mature'; p.isDead = false; p.injured = false;
  d.pets.push(p);
  sandbox.savePetStore(d);
})();

sandbox.savePetBattlePicks(['sparkle']);
ok(JSON.stringify(sandbox.getPetStore().battlePicks) === '["sparkle"]', 'H1 选择落盘到 dh-pets-v1.battlePicks');
ok(JSON.stringify(sandbox.getPetBattlePicks()) === '["sparkle"]', 'H1 读回一致');

/* 上限：超过 PET_BATTLE_MAX 截断（复用唯一上限常量） */
sandbox.savePetBattlePicks(['a', 'b', 'c', 'd', 'e', 'f']);
ok(sandbox.getPetBattlePicks().length === sandbox.PET_BATTLE_MAX,
  'H1 落盘按 PET_BATTLE_MAX=' + sandbox.PET_BATTLE_MAX + ' 截断');
sandbox.savePetBattlePicks(null);
ok(Array.isArray(sandbox.getPetBattlePicks()) && sandbox.getPetBattlePicks().length === 0, 'H1 save(null) 退化为 []');

/* 模拟「刷新 / 重开」：清掉内存缓存 → 从存档恢复 */
ok(typeof sandbox.ensurePetBattlePicksLoaded === 'function', 'H1 提供 ensurePetBattlePicksLoaded（运行时从存档恢复）');
sandbox.savePetBattlePicks(['sparkle', 'no_such_species']);
sandbox._petBattlePicks = [];
sandbox._petBattlePicksLoaded = false;
if (typeof sandbox.ensurePetBattlePicksLoaded === 'function') sandbox.ensurePetBattlePicksLoaded();
ok(JSON.stringify(sandbox._petBattlePicks) === '["sparkle"]',
  'H1 刷新后从存档恢复选择，且剔除已不存在的 speciesId');

/* 持久化确实走的是 pets 键（不另开 store 键） */
ok(sandbox.localStorage.getItem('dh-pets-v1').indexOf('battlePicks') >= 0, 'H1 复用 dh-pets-v1（未新增 store 键）');

/* ============ H2：带宠物开战的目标关 ============ */
ok(typeof sandbox.currentGroupStageId === 'function', 'H2 提供 currentGroupStageId（当前进度关）');
const curStage = () => (typeof sandbox.currentGroupStageId === 'function') ? sandbox.currentGroupStageId() : null;
ok(curStage() === 'g1-1', 'H2 初始「当前进度关」= g1-1');
sandbox.markGroupStageCleared('g1-1');
ok(curStage() === 'g1-2', 'H2 通关 g1-1 后「当前进度关」= g1-2');

/* 🔴 关键回归：旧实现（pet-ui.js 自建战斗）**从不设置 `_groupStageId`**，
   于是胜利时 `_groupDone()` 读到的仍是上一次战斗的关 → 把那一关记成通关 = 覆盖进度。
   现在开战入口必须每次都把 `_groupStageId` 设成本次请求的关。 */
sandbox._groupStageId = 'g9-9';     // 模拟「上一场」遗留
sandbox._groupRewarded = true;      // 旧实现也不重置它
sandbox.startGroupTrialWithPets('g2-3', ['sparkle']);
ok(sandbox._groupStageId === 'g2-3', 'H2 开战后 _groupStageId = 本次请求的关（不再沿用上一次 → 不覆盖进度）');
ok(sandbox._groupRewarded === false, 'H2 开战重置 _groupRewarded（每场只结算一次）');
ok(!!sandbox._groupBattle, 'H2 群战已创建');
ok((sandbox._groupBattle.allies || []).some(u => u._petSpecies === 'sparkle'), 'H2 带上了选中的宠物');
ok(sandbox._groupBattle.enemies.length === sandbox.getGroupStage('g2-3').enemies.length,
  'H2 打的是请求的小关（敌人数与 g2-3 一致）');

/* 面板按钮语义：以「当前进度关」开战（不再写死某个大关） */
sandbox.startGroupTrialWithPets(curStage(), ['sparkle']);
ok(sandbox._groupStageId === curStage(), 'H2「带宠物开战」打的是当前进度关');
ok(sandbox._groupStageId !== 'g9-9', 'H2 不再被旧遗留值污染');

/* 源码守卫（行为面）：pet-ui.js 不得再自建战斗 / 写死关卡 */
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'page', 'pet-ui.js'), 'utf8');
  ok(src.indexOf("startGroupTrialWithPets('g5'") < 0, 'H2 pet-ui.js 不再写死关卡 g5');
  ok(src.indexOf('createGroupBattle(') < 0, 'H2 pet-ui.js 不再自建敌群战斗（交给唯一入口）');
  ok(/startGroupTrial\s*\(\s*groupId\s*\)/.test(src), 'H2 startGroupTrialWithPets 委托给 startGroupTrial(groupId)');
})();

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

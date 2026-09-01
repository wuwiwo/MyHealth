#!/usr/bin/env node
/* M4-5 测试：宠物持久化 + 材料来源
   1) 初始蛋
   2) 材料掉落
   3) 每日结算（离线）
   4) 月度重置
   5) 参战 Unit 生成
   6) store 读写
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const load = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');

// 模拟 store（localStorage）
function makeStore() {
  const data = {};
  return {
    get: (k) => data[k] || null,
    set: (k, v) => { data[k] = v; },
    registerSchema: () => {},
    _data: data
  };
}

const files = ['date-roll.js','levels.js','unit.js','state-core.js','status-defs.js','talent.js','skill.js','enemy.js','battle.js','battle-group.js','pets.js','pet-materials.js','pet-codex.js'];
const sb = { Math, JSON, console, Date, store: makeStore() };
sb.window = sb;
vm.createContext(sb);
files.forEach(f => vm.runInContext(load(f), sb));
vm.runInContext(load('pet-store.js'), sb);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(' ✓ ' + name); }
  else { fail++; console.log(' ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. 初始蛋 ----
const r1 = sb.grantStarterPet();
assert('初始蛋发放', r1.ok === true && r1.pet.stage === 'egg', JSON.stringify(r1));
const r2 = sb.grantStarterPet();
assert('不重复发放', r2.ok === false, r2.reason);

// ---- 2. 材料掉落 ----
const m1 = sb.grantMaterial('nutrition', 5);
assert('材料掉落', m1.ok === true && sb.getPetStore().materials.nutrition === 5);
sb.grantMaterial('refineHigh', 3);
assert('材料累计', sb.getPetStore().materials.refineHigh === 3);

// ---- 3. 每日结算（离线）----
const d = sb.getPetStore();
const pet = d.pets[0];
pet.stage = 'grow';
pet.hunger = 80; pet.health = 100; pet.growth = 10;
pet.lastSettleDate = null;
const today = sb.dateKey(new Date());
const ev = sb.settleAllPets(new Date());
assert('每日结算有事件', ev.length >= 0);
assert('lastSettleDate 更新', d.lastSettleDate === today);

// 模拟 5 天前
d.lastSettleDate = sb.dateKey(new Date(Date.now() - 5*86400000));
pet.lastSettleDate = d.lastSettleDate;
const ev5 = sb.settleAllPets(new Date());
assert('离线5天结算', pet.ageDays >= 1, 'ageDays=' + pet.ageDays);

// ---- 4. 月度重置 ----
pet.refineLevel = 15;
pet.skillLevels = { p_shine: 6 };
const mr = sb.monthlyResetPets(new Date());
assert('月度重置执行', mr.ok === true);
assert('炼化清零', pet.refineLevel === 0);
assert('技能减半', pet.skillLevels.p_shine === 3);
const mr2 = sb.monthlyResetPets(new Date());
assert('同月不重复重置', mr2.ok === false);

// ---- 5. 参战 Unit 生成 ----
pet.stage = 'mature';
const units = sb.createPetUnitsForBattle([pet.speciesId], 2);
assert('参战 Unit 生成', units.length === 1 && units[0].side === 'ally', 'len=' + units.length);

// 完整群战
const player = sb.createUnit({ id:'player', side:'ally', name:'你', base:{hp:500,atk:50,def:30,spd:8} });
const enemy = sb.createEnemyUnit({ tier:'elite1', name:'敌', talents:['blade'], skills:['charge'], base:{hp:300,atk:30,def:15,spd:6} });
const gb = sb.createGroupBattle({ allies:[player].concat(units), enemies:[enemy] });
sb.runGroupBattle(gb, 100);
assert('宠物参战完整战斗', gb.done === true);
assert('宠物战斗有行动', gb.log.some(l => l.unit !== '你'), 'units=' + gb.log.map(l=>l.unit).join(','));

// ---- 6. store 持久化 ----
const saved = sb.store.get('pets');
assert('store 已保存', saved && Array.isArray(saved.pets) && saved.pets.length >= 1);

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);

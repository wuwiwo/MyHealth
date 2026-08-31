#!/usr/bin/env node
/* S0 store.js registry tests — simulates localStorage, asserts:
   1) identity equivalence with v1.2 behavior for legacy keys
   2) version upgrade path (migrate + bak old + read new)
   3) corrupted JSON → bak + default
   4) validate-fail → bak + default
   5) future version refuses downgrade
   6) set-time validation rejects bad writes
   Run: node scripts/test-store.js */
'use strict';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } }

function freshStore(keepStorage) {
  const store = keepStorage ? global.localStorage._s : {};
  global.localStorage = {
    _s: store,
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    key(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  };
  global.window = global;
  delete require.cache[require.resolve('../page/store.js')];
  require('../page/store.js');
  return global.store;
}

/* --- 1. identity: legacy shape-checked keys behave as v1.2 --- */
let s = freshStore();
ok(s.set('strength', { entries: [{ id: 'a', date: '2026-08-27', exercise: '深蹲', weight: 50, actualReps: 10 }] }) === true, 'set valid strength ok');
ok(s.get('strength').entries.length === 1, 'get strength roundtrip');
ok(s.get('nonexistent-legacy') === null, 'unknown+missing key → null');
ok(s.get('game') === null, 'known+missing key → null (v1.2 equivalent)');
s.set('theme', 'dark');
ok(s.get('theme') === 'dark', 'string key roundtrip');
ok(s.set('strength', { entries: 'not-an-array' }) === false, 'set invalid shape rejected');
ok(s.get('strength').entries.length === 1, 'rejected set did not clobber cache');
ok(s.getLastModTime() > 0, 'mod-time touched');

/* --- 2. upgrade path: register v2 with migrator, old v1 data present --- */
s = freshStore();
global.localStorage.setItem('dh-pets-v1', JSON.stringify({ version: 1, pets: ['a'] }));
s.registerSchema('pets', {
  version: 2,
  defaultValue: function() { return { version: 2, pets: [], materials: {} }; },
  validate: function(v) { return v && typeof v === 'object' && Array.isArray(v.pets); },
  migrate: { 1: function(d) { return { version: 2, pets: d.pets || [], materials: {} }; } }
});
const up = s.get('pets');
ok(up && up.version === 2 && up.pets[0] === 'a', 'migrated v1→v2 data preserved');
ok(global.localStorage.getItem('dh-pets-v2') !== null, 'new v2 physical key written');
ok(global.localStorage.getItem('dh-pets-v1-bak') !== null, 'old v1 key kept as -bak (ruling #2)');
ok(global.localStorage.getItem('dh-pets-v1') === null, 'old v1 live key removed');
ok(s.migrations().some(m => m.key === 'pets' && m.ok), 'migration logged');

/* --- 3. corrupted JSON → bak + default --- */
s = freshStore();
global.localStorage.setItem('dh-refine-v1', '{oops not json');
s.registerSchema('refine', { version: 1, defaultValue: function() { return { points: 0, upgrades: {} }; } });
const r1 = s.get('refine');
ok(r1 && r1.points === 0, 'corrupt json → defaultValue served');
ok(global.localStorage.getItem('dh-refine-v1-bak') === '{oops not json', 'corrupt raw bak-ed');

/* --- 4. validate-fail → bak + default --- */
s = freshStore();
global.localStorage.setItem('dh-weight-v1', JSON.stringify({ records: 'not-an-array' }));
s.registerSchema('weight', { version: 1, defaultValue: function() { return { records: [] }; } });
const r2 = s.get('weight');
ok(r2 && Array.isArray(r2.records), 'validate-fail → defaultValue served');
ok(global.localStorage.getItem('dh-weight-v1-bak') !== null, 'validate-fail raw bak-ed');
ok(s.migrations().some(m => m.key === 'weight' && m.reason === 'validate-fail'), 'validate-fail logged');

/* --- 5. future version never downgraded --- */
s = freshStore();
global.localStorage.setItem('dh-game-v1', JSON.stringify({ version: 9, cleared: [], current: 'x' }));
s.registerSchema('game', { version: 1 });
const r3 = s.get('game');
ok(r3 && r3.version === 9, 'future version served raw (no downgrade)');

/* --- 6. init scan skips -bak keys --- */
s = freshStore();
global.localStorage.setItem('dh-strength-v1', JSON.stringify({ entries: [] }));
global.localStorage.setItem('dh-strength-v1-bak', JSON.stringify({ entries: 'garbage' }));
s = freshStore(true); // re-init keeping storage
ok(s.get('strength') && Array.isArray(s.get('strength').entries), 'bak key not loaded as live data');

console.log(fail ? '\nFAIL ' + fail : '\nALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);

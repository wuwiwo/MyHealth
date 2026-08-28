/* ============================================
   MyHealth — Store Module v1.3 (M2a S0)
   Generalized K-V interface over localStorage
   with global onChange notification.

   v1.3: schema registry — per-key version,
   validate + migrate chain, raw -bak backup on
   corruption/upgrade (ruling: keep old data,
   read path only reads live keys).
   v1.2: schema validation — known keys are
   shape-checked on read; corrupted values are
   dropped (returned as null) instead of crashing
   every consumer. mergeAll/setAll also filter.
   ============================================ */
(function() {
  'use strict';

  var P = 'dh-';
  var _cache = {};
  var _listeners = [];
  var _modKey = P + 'mod-time';
  var _migLog = [];

  /* ========== SHAPE VALIDATION (legacy, feeds default validators) ========== */
  var SHAPES = {
    strength:   { entries: 'array' },
    cardio:     { entries: 'array' },
    weight:     { records: 'array' },
    plans:      { plans: 'array' },
    cardioPlans:{ plans: 'array' },
    missed:     { notes: 'object' },
    game:       { cleared: 'array', current: 'string' },
    refine:     { points: 'number', upgrades: 'object' },
    attrLog:    'array',
    records:    'object',
    prs:        'object',
    exercises:  'array',
    cardioTypes:'array',
    profile:    'object',
    theme:      'string',
    challenge:  'object'
  };

  function isShape(v, shape) {
    if (shape === 'array')  return Array.isArray(v);
    if (shape === 'object') return v != null && typeof v === 'object' && !Array.isArray(v);
    if (shape === 'string') return typeof v === 'string';
    if (shape === 'number') return typeof v === 'number' && !isNaN(v);
    if (shape && typeof shape === 'object') {
      if (v == null || typeof v !== 'object' || Array.isArray(v)) return false;
      for (var k in shape) {
        if (!shape.hasOwnProperty(k)) continue;
        if (v[k] !== undefined && !isShape(v[k], shape[k])) return false;
      }
      return true;
    }
    return true; // unknown shape → accept
  }

  /* ========== SCHEMA REGISTRY (S0) ========== */
  /* REG[name] = { version, defaultValue, validate, migrate }
     migrate[v] = fn(data) -> data'  upgrading FROM value.version v TO v+1 */
  var REG = {};

  function physKey(name, ver) { return P + name + '-v' + ver; }
  function isBakKey(k) { return /-bak$/.test(k); }

  function registerSchema(name, def) {
    def = def || {};
    REG[name] = {
      version: def.version || 1,
      defaultValue: typeof def.defaultValue === 'function' ? def.defaultValue : null,
      validate: def.validate || (SHAPES[name] ? function(v){ return isShape(v, SHAPES[name]); } : function(){ return true; }),
      migrate: def.migrate || {}
    };
  }
  // Legacy keys: implicit registration at v1 (validate = existing SHAPES)
  Object.keys(SHAPES).forEach(function(k){ registerSchema(k, {}); });

  function validValue(name, v) {
    var reg = REG[name];
    if (!reg) return true; // unknown key → accept as-is
    return reg.validate(v);
  }

  function valueVersion(v, physVer) {
    if (v != null && typeof v === 'object' && !Array.isArray(v) && typeof v.version === 'number') return v.version;
    return physVer;
  }

  /* Bak a raw value (ruling: keep old data readable for rollback) */
  function bakRaw(phys, raw) {
    try { localStorage.setItem(phys + '-bak', raw); } catch (_e) {}
  }

  /* Read + migrate chain for a not-yet-cached key.
     Returns {value, ok, empty?, future?} */
  function loadMigrated(name) {
    var reg = REG[name];
    var target = reg ? reg.version : 1;
    for (var ver = target; ver >= 1; ver--) {
      var phys = physKey(name, ver);
      var raw = localStorage.getItem(phys);
      if (raw == null) continue;
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (e) {
        bakRaw(phys, raw);
        try { localStorage.removeItem(phys); } catch (_e) {}
        _migLog.push({ key: name, from: ver, to: ver, ok: false, reason: 'corrupt-json' });
        return { value: reg && reg.defaultValue ? reg.defaultValue() : null, ok: false, reason: 'corrupt-json' };
      }
      var v0 = valueVersion(parsed, ver);
      if (v0 > target) {
        // future version — serve raw, never downgrade
        return { value: parsed, ok: true, future: true };
      }
      var data = parsed;
      for (var mv = v0; mv < target; mv++) {
        var fn = reg && reg.migrate ? reg.migrate[mv] : null;
        data = fn ? fn(data) : data; // identity when no migrator defined
      }
      if (reg && !reg.validate(data)) {
        bakRaw(phys, raw);
        _migLog.push({ key: name, from: v0, to: target, ok: false, reason: 'validate-fail' });
        return { value: reg && reg.defaultValue ? reg.defaultValue() : null, ok: false, reason: 'validate-fail' };
      }
      if (v0 < target) {
        // write migrated to target key, keep old as -bak (ruling #2)
        try {
          localStorage.setItem(physKey(name, target), JSON.stringify(data));
          bakRaw(phys, raw);
          try { localStorage.removeItem(phys); } catch (_e) {}
        } catch (_e2) {}
        _migLog.push({ key: name, from: v0, to: target, ok: true });
      }
      return { value: data, ok: true };
    }
    return { value: null, ok: true, empty: true };
  }

  function fullKey(name) { return physKey(name, REG[name] ? REG[name].version : 1); }

  function touchModTime() {
    var now = Date.now();
    localStorage.setItem(_modKey, String(now));
  }

  // Load existing dh-* keys into cache on init (skip -bak keys)
  (function initScan() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf(P) !== 0 || isBakKey(k)) continue;
      var m = /^dh-(.+)-v(\d+)$/.exec(k);
      if (!m) continue;
      var short = m[1];
      try {
        var parsed = JSON.parse(localStorage.getItem(k));
        if (validValue(short, parsed)) {
          _cache[short] = parsed;
        } else {
          // Corrupted value — bak it so consumers fall back to defaults
          bakRaw(k, localStorage.getItem(k));
          try { localStorage.removeItem(k); } catch (_e) {}
        }
      } catch (e) {}
    }
  })();

  /* ========== QUOTA GUARD ========== */
  function notifyQuota() {
    try {
      if (window.toast) toast('存储空间不足，请导出备份后清理旧数据','e');
    } catch(e) {}
  }

  window.store = {
    /**
     * @param {string} name  Short key (e.g. 'strength', 'cardio')
     * @returns {*}  Parsed value (schema-checked + migrated), or null
     */
    get: function(name) {
      if (_cache.hasOwnProperty(name)) {
        var v = _cache[name];
        return validValue(name, v) ? v : null;
      }
      // not cached — try storage (with migration chain)
      var res = loadMigrated(name);
      if (res.ok && !res.empty) {
        _cache[name] = res.value;
        return validValue(name, res.value) ? res.value : null;
      }
      if (res.ok && res.empty) return null;
      // migration/validation failure — default (may be null)
      if (res.value != null) {
        _cache[name] = res.value;
        return validValue(name, res.value) ? res.value : null;
      }
      return null;
    },

    /**
     * @param {string} name
     * @param {*}      value
     * @returns {boolean} false if rejected by schema validation
     */
    set: function(name, value) {
      if (!validValue(name, value)) {
        try { console.error('[store] set rejected: schema validation failed for "' + name + '"'); } catch (_e) {}
        return false;
      }
      _cache[name] = value;
      try {
        localStorage.setItem(fullKey(name), JSON.stringify(value));
      } catch(e) {
        notifyQuota();
      }
      touchModTime();
      for (var i = 0; i < _listeners.length; i++) {
        _listeners[i](name, value);
      }
      return true;
    },

    /**
     * Register a per-key schema: version + validate + migrate chain.
     * Call before first get/set of the key (e.g. from domain modules).
     * @param {string} name
     * @param {{version?:number, defaultValue?:Function, validate?:Function, migrate?:Object}} def
     */
    registerSchema: function(name, def) {
      registerSchema(name, def);
      if (_cache.hasOwnProperty(name) && !validValue(name, _cache[name])) {
        delete _cache[name];
      }
    },

    /** Migration/corruption log for this session (diagnostics) */
    migrations: function() { return _migLog.slice(); },

    /**
     * @param {function} fn  (name, value) => void
     */
    onChange: function(fn) {
      _listeners.push(fn);
    },

    /**
     * Returns a deep-cloned snapshot of all cached data.
     * Used by sync engine and export.
     * @returns {object}
     */
    getAll: function() {
      var out = {};
      for (var k in _cache) {
        if (_cache.hasOwnProperty(k) && validValue(k, _cache[k])) {
          out[k] = JSON.parse(JSON.stringify(_cache[k]));
        }
      }
      return out;
    },

    /**
     * Bulk-import data (from sync pull or file import).
     * Only overwrites keys that pass schema validation.
     * @param {object} data  { strength: {...}, cardio: {...}, ... }
     */
    mergeAll: function(data) {
      if (!data) return;
      var changed = false;
      for (var k in data) {
        if (!data.hasOwnProperty(k)) continue;
        var v = data[k];
        if (v == null) continue;
        if (typeof v === 'object' && validValue(k, v)) {
          _cache[k] = v;
          try {
            localStorage.setItem(fullKey(k), JSON.stringify(v));
            changed = true;
          } catch(e) {
            notifyQuota();
          }
        }
      }
      if (!changed) return;
      touchModTime();
      for (var i = 0; i < _listeners.length; i++) {
        _listeners[i]('*', _cache);
      }
    },

    /**
     * Overwrite all keys (import). Filters invalid shapes.
     * @param {object} data
     */
    setAll: function(data) {
      if (!data) return;
      var changed = false;
      for (var k in data) {
        if (!data.hasOwnProperty(k)) continue;
        if (validValue(k, data[k])) {
          _cache[k] = data[k];
          try {
            localStorage.setItem(fullKey(k), JSON.stringify(data[k]));
            changed = true;
          } catch(e) {
            notifyQuota();
          }
        }
      }
      if (!changed) return;
      touchModTime();
      for (var i = 0; i < _listeners.length; i++) {
        _listeners[i]('*', _cache);
      }
    },

    /**
     * Returns the timestamp of the last data modification (set/mergeAll/setAll).
     * Used by sync engine to judge local vs remote freshness.
     * @returns {number} ms timestamp, or 0 if never modified
     */
    getLastModTime: function() {
      return parseInt(localStorage.getItem(_modKey) || '0', 10);
    }
  };
})();

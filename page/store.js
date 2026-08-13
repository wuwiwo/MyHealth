/* ============================================
   MyHealth — Store Module v1.2
   Generalized K-V interface over localStorage
   with global onChange notification.

   v1.2: schema validation — known keys are
   shape-checked on read; corrupted values are
   dropped (returned as null) instead of crashing
   every consumer. mergeAll/setAll also filter.
   ============================================ */
(function() {
  'use strict';

  var P = 'dh-';
  var S = '-v1';
  var _cache = {};
  var _listeners = [];
  var _modKey = P + 'mod-time';

  /* ========== SCHEMA VALIDATION ========== */
  // Known key shapes. 'array' | 'object' | 'string' | 'number' | {key:shape}
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

  function validValue(name, v) {
    var shape = SHAPES[name];
    if (!shape) return true; // unknown key → accept as-is
    return isShape(v, shape);
  }

  function fullKey(name) { return P + name + S; }

  function touchModTime() {
    var now = Date.now();
    localStorage.setItem(_modKey, String(now));
  }

  // Load existing dh-* keys into cache on init
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(P) === 0) {
      try {
        var short = k.slice(P.length, k.lastIndexOf(S) > -1 ? k.lastIndexOf(S) : undefined);
        var parsed = JSON.parse(localStorage.getItem(k));
        if (validValue(short, parsed)) {
          _cache[short] = parsed;
        } else {
          // Corrupted value — drop it so consumers fall back to defaults
          localStorage.removeItem(k);
        }
      } catch(e) {}
    }
  }

  /* ========== QUOTA GUARD ========== */
  function notifyQuota() {
    try {
      if (window.toast) toast('存储空间不足，请导出备份后清理旧数据','e');
    } catch(e) {}
  }

  window.store = {
    /**
     * @param {string} name  Short key (e.g. 'strength', 'cardio')
     * @returns {*}  Parsed value (schema-checked), or null
     */
    get: function(name) {
      var v = _cache.hasOwnProperty(name) ? _cache[name] : null;
      return validValue(name, v) ? v : null;
    },

    /**
     * @param {string} name
     * @param {*}      value
     */
    set: function(name, value) {
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
    },

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

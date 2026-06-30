/* ============================================
   MyHealth — Store Module v1.1
   Generalized K-V interface over localStorage
   with global onChange notification.
   ============================================ */
(function() {
  'use strict';

  var P = 'dh-';
  var S = '-v1';
  var _cache = {};
  var _listeners = [];
  var _modKey = P + 'mod-time';

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
        _cache[short] = JSON.parse(localStorage.getItem(k));
      } catch(e) {}
    }
  }

  window.store = {
    /**
     * @param {string} name  Short key (e.g. 'strength', 'cardio')
     * @returns {*}  Parsed value, or null
     */
    get: function(name) {
      return _cache.hasOwnProperty(name) ? _cache[name] : null;
    },

    /**
     * @param {string} name
     * @param {*}      value
     */
    set: function(name, value) {
      _cache[name] = value;
      localStorage.setItem(fullKey(name), JSON.stringify(value));
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
        if (_cache.hasOwnProperty(k)) {
          out[k] = JSON.parse(JSON.stringify(_cache[k]));
        }
      }
      return out;
    },

    /**
     * Bulk-import data (from sync pull or file import).
     * Only overwrites keys that have meaningful content.
     * @param {object} data  { strength: {...}, cardio: {...}, ... }
     */
    mergeAll: function(data) {
      if (!data) return;
      for (var k in data) {
        if (!data.hasOwnProperty(k)) continue;
        var v = data[k];
        if (v != null && typeof v === 'object') {
          _cache[k] = v;
          localStorage.setItem(fullKey(k), JSON.stringify(v));
        }
      }
      touchModTime();
      for (var i = 0; i < _listeners.length; i++) {
        _listeners[i]('*', _cache);
      }
    },

    /**
     * Overwrite all keys (import).
     * @param {object} data
     */
    setAll: function(data) {
      if (!data) return;
      for (var k in data) {
        if (!data.hasOwnProperty(k)) continue;
        _cache[k] = data[k];
        localStorage.setItem(fullKey(k), JSON.stringify(data[k]));
      }
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

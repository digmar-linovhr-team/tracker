/* Mode tampilan: 'light' | 'dark' | 'system'. Dipasang sebelum CSS dimuat agar tidak berkedip. */
(function () {
  'use strict';
  var KEY = 'pt.theme', listeners = [];
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); return v === 'dark' || v === 'system' ? v : 'light'; }
    catch (e) { return 'light'; }
  }
  function resolved(p) { p = p || pref(); return p === 'system' ? (mq && mq.matches ? 'dark' : 'light') : p; }
  function apply() {
    var r = resolved();
    document.documentElement.setAttribute('data-theme', r);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', r === 'dark' ? '#0f1b26' : '#255473');
    return r;
  }
  apply();
  if (mq) {
    var onSys = function () { if (pref() === 'system') { apply(); listeners.forEach(function (f) { f(resolved()); }); } };
    if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
  }
  window.PTTheme = {
    get: pref,
    resolved: function () { return resolved(); },
    set: function (p) {
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* mode privat */ }
      var r = apply();
      listeners.forEach(function (f) { f(r); });
      return r;
    },
    onChange: function (f) { listeners.push(f); }
  };
})();

/* Lapisan koneksi untuk versi web: API Apps Script, sesi login, dan notifikasi browser.
 * Menyediakan window.pt dengan antarmuka yang sama seperti versi desktop. */
(function () {
  'use strict';
  var CFG = window.PT_CONFIG || {};
  var L = window.PTLogic;
  var VERSION = '2.21.1';
  var POLL_MS = 5 * 60 * 1000;
  var TICK_MS = 30 * 1000;

  // ---------- penyimpanan lokal (aman bila diblokir) ----------
  var mem = {};
  function get(k, d) {
    try { var v = localStorage.getItem('pt.' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return k in mem ? mem[k] : d; }
  }
  function set(k, v) {
    mem[k] = v;
    try { localStorage.setItem('pt.' + k, JSON.stringify(v)); } catch (e) { /* mode privat */ }
  }

  var listeners = {};
  function emit(ch, data) { (listeners[ch] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }

  function apiUrl() { return CFG.apiUrl || get('apiUrl', ''); }
  function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

  // ---------- API ----------
  /** Server sibuk (kunci dipegang permintaan lain) → belum ada yang tersimpan, jadi aman dicoba ulang otomatis. */
  var BUSY_RE = /sedang sibuk|lock timeout|could not obtain lock|tidak dapat memperoleh kunci|too many|timed out/i;
  async function api(action, payload) {
    for (var attempt = 0; ; attempt++) {
      try { return await apiOnce(action, payload); }
      catch (e) {
        if (attempt >= 2 || !BUSY_RE.test(String(e && e.message))) throw e;
        await new Promise(function (r) { setTimeout(r, 1500 + attempt * 2500); });
      }
    }
  }
  async function apiOnce(action, payload) {
    payload = payload || {};
    var token = get('token', '');
    if (get('demo', false)) {
      var session = token ? { username: token.replace(/^demo\./, '') } : null;
      await new Promise(function (r) { setTimeout(r, get('demoDelay', 120)); }); // demoDelay/demoFail: hanya untuk uji
      if (get('demoFail', false) && action === 'updateStatus') throw new Error('Simulasi server gagal');
      try { return JSON.parse(JSON.stringify(window.PTDemo.handle(action, payload, session))); }
      catch (e) { if (e.message === 'UNAUTHORIZED') unauthorized(); throw e; }
    }
    var url = apiUrl();
    if (!url) throw new Error('Alamat server belum diatur');
    var res;
    try {
      res = await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, token: token, appUrl: appUrl() }, payload))
      });
    } catch (e) {
      throw new Error(navigator.onLine ? 'Tidak bisa terhubung ke server. Pastikan Web App di-deploy dengan akses "Anyone".' : 'Anda sedang offline.');
    }
    var json;
    try { json = JSON.parse(await res.text()); }
    catch (e) { throw new Error('Respons server tidak valid. Pastikan URL Web App benar dan di-deploy dengan akses "Anyone".'); }
    if (!json.ok) {
      if (json.code === 'UNAUTHORIZED') { unauthorized(); throw new Error('Sesi berakhir, silakan login lagi'); }
      throw new Error(json.error);
    }
    return json.data;
  }

  function unauthorized() {
    set('token', ''); set('user', null);
    stopScheduler();
    emit('auth:expired');
  }

  // ---------- notifikasi saat aplikasi terbuka ----------
  var myTasks = [], pollTimer = null, tickTimer = null;
  function notifSupported() { return 'Notification' in window; }

  async function showNotification(title, body, taskId, tag, view) {
    if (!notifSupported() || Notification.permission !== 'granted') return false;
    body = body.length > 140 ? body.slice(0, 137) + '…' : body;
    var opts = { body: body, tag: tag || ('pt-' + Date.now()), icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { taskId: taskId, view: view || '' } };
    try {
      var reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return true; }
    } catch (e) { /* fallback */ }
    try {
      var n = new Notification(title, opts);
      n.onclick = function () { window.focus(); if (view) emit('nav:view', view); else if (taskId) emit('nav:task', taskId); n.close(); };
      return true;
    } catch (e) { return false; }
  }

  function checkNotifications() {
    var notified = get('notified', {});
    var due = L.dueNotifications(myTasks, { reminders: get('reminders', [1440, 60]) }, new Date());
    var changed = false;
    due.forEach(function (n) {
      if (notified[n.key]) return;
      notified[n.key] = Date.now(); changed = true;
      showNotification(n.title, n.body, n.task.id, n.key);
    });
    var cutoff = Date.now() - 14 * 864e5;
    Object.keys(notified).forEach(function (k) { if (notified[k] < cutoff) { delete notified[k]; changed = true; } });
    if (changed) set('notified', notified);
    updateBadge();
  }

  function updateBadge() {
    var overdue = myTasks.filter(function (t) { return L.bucket(t) === 'overdue'; }).length;
    try {
      if (navigator.setAppBadge) { overdue ? navigator.setAppBadge(overdue) : navigator.clearAppBadge(); }
    } catch (e) { /* tidak didukung */ }
    document.title = (overdue ? '(' + overdue + ') ' : '') + 'Project Tracker';
  }

  /** Admin: catat pengajuan review; beri notifikasi untuk yang baru (kecuali saat pertama dimuat). */
  function handleReviews(tasks, notify) {
    var seen = get('reviewSeen', {}), fresh = [];
    (tasks || []).forEach(function (t) {
      var k = t.id + '|' + (t.reviewAt || '');
      if (!seen[k]) { seen[k] = Date.now(); fresh.push(t); }
    });
    var cutoff = Date.now() - 30 * 864e5;
    Object.keys(seen).forEach(function (k) { if (seen[k] < cutoff) delete seen[k]; });
    set('reviewSeen', seen);
    if (notify && fresh.length) {
      showNotification(fresh.length === 1 ? 'Task menunggu review' : fresh.length + ' task menunggu review',
        fresh.map(function (t) { return t.ownerName + ': ' + t.task; }).join(' · '), null, 'pt-review', 'review');
    }
    emit('reviews:refreshed', tasks || []);
  }

  async function refreshReviews() {
    try { var r = await api('reviewQueue'); handleReviews(r.tasks, true); } catch (e) { /* coba lagi nanti */ }
  }

  async function refreshTasks() {
    var u = get('user', null);
    if (!get('token', '') || !u || u.mustChange) return;
    if (u.role === 'admin') refreshReviews();
    if (!u.sheetName) return;
    try {
      var r = await api('myTasks');
      myTasks = r.tasks || [];
      checkNotifications();
      emit('tasks:refreshed', myTasks.slice());
    } catch (e) { /* offline: coba lagi nanti */ }
  }

  function startScheduler() {
    stopScheduler();
    // data awal sudah dimuat oleh tampilan; pengecekan berkala dimulai setelah ini
    pollTimer = setInterval(refreshTasks, POLL_MS);
    tickTimer = setInterval(checkNotifications, TICK_MS);
  }
  function stopScheduler() {
    clearInterval(pollTimer); clearInterval(tickTimer);
    pollTimer = tickTimer = null; myTasks = [];
    updateBadge();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && pollTimer) refreshTasks();
  });

  // klik notifikasi dari service worker
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'nav') return;
      if (e.data.view) emit('nav:view', e.data.view);
      else if (e.data.taskId) emit('nav:task', e.data.taskId);
    });
  }
  var qs = new URLSearchParams(location.search);
  if (qs.get('task')) setTimeout(function () { emit('nav:task', qs.get('task')); }, 1500);

  // ---------- install PWA ----------
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; emit('install:available'); });

  // ---------- antarmuka publik ----------
  window.pt = {
    config: async function () {
      return {
        apiUrl: apiUrl(), apiLocked: !!CFG.apiUrl, user: get('user', null), demo: get('demo', false),
        reminders: get('reminders', [1440, 60]), version: VERSION, platform: 'web',
        notifPermission: notifSupported() ? Notification.permission : 'unsupported',
        installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        canInstall: !!installPrompt,
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent)
      };
    },
    setConfig: async function (patch) {
      if (patch.apiUrl !== undefined) {
        var url = String(patch.apiUrl).trim();
        if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec$/.test(url)) {
          throw new Error('URL harus berupa URL Web App Apps Script yang berakhiran /exec');
        }
        var j = null;
        try { j = await (await fetch(url, { redirect: 'follow' })).json(); } catch (e) { /* ditangani di bawah */ }
        if (!j || j.app !== 'project-tracker') throw new Error('Server tidak merespons sebagai Project Tracker. Periksa URL & akses deployment ("Anyone").');
        set('apiUrl', url); set('demo', false);
      }
      if (patch.demo !== undefined) { set('demo', !!patch.demo); set('token', ''); set('user', null); }
      if (Array.isArray(patch.reminders)) set('reminders', patch.reminders.map(Number).filter(function (n) { return n > 0; }));
      return true;
    },
    login: async function (username, password) {
      var r = await api('login', { username: username, password: password });
      set('token', r.token); set('user', r.user);
      if (!r.user.mustChange) startScheduler();
      return r.user;
    },
    changePassword: async function (oldPassword, newPassword) {
      var r = await api('changePassword', { oldPassword: oldPassword, newPassword: newPassword });
      set('user', r.user);
      startScheduler();
      return r.user;
    },
    logout: async function () { set('token', ''); set('user', null); set('reviewBaseline', false); stopScheduler(); return true; },
    call: async function (action, payload) {
      var r = await api(action, payload);
      if (action === 'myTasks') { myTasks = r.tasks || []; checkNotifications(); }
      if (action === 'setMyEmail' && r.user) set('user', Object.assign(get('user', {}), r.user));
      if (action === 'updateStatus' && r.task) {
        myTasks = myTasks.map(function (t) { return t.id === r.task.id ? Object.assign({}, t, { status: r.task.status, startedAt: r.task.startedAt, doneAt: r.task.doneAt }) : t; });
        checkNotifications();
      }
      return r;
    },
    feedTasks: function (tasks) { myTasks = (tasks || []).slice(); checkNotifications(); },
    notify: function (title, body) { showNotification(title, body, null, 'pt-social', 'briefs'); },
    feedReviews: function (tasks) { var first = !get('reviewBaseline', false); set('reviewBaseline', true); handleReviews(tasks, !first); },
    requestNotifications: async function () {
      if (!notifSupported()) return 'unsupported';
      var p = await Notification.requestPermission();
      if (p === 'granted') checkNotifications();
      return p;
    },
    testNotification: async function () {
      if (notifSupported() && Notification.permission === 'default') await Notification.requestPermission();
      return showNotification('Notifikasi aktif', 'Pengingat task akan muncul seperti ini selama Project Tracker terbuka.', null, 'pt-test');
    },
    install: async function () {
      if (!installPrompt) return false;
      installPrompt.prompt();
      var c = await installPrompt.userChoice;
      installPrompt = null;
      return c.outcome === 'accepted';
    },
    openExternal: async function (url) { if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    on: function (ch, fn) { (listeners[ch] = listeners[ch] || []).push(fn); }
  };

  // lanjutkan sesi yang tersimpan
  var u0 = get('user', null);
  if (get('token', '') && u0 && !u0.mustChange) startScheduler();

  // service worker (offline + notifikasi)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) { r.update(); }).catch(function () {}); });
  }
})();

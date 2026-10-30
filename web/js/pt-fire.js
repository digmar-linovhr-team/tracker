/* Lapisan data versi Firebase.
 * - Login: Firebase Auth (username → email sintetis). Login pertama memakai password lama lewat Apps Script (fbLogin).
 * - Baca: seluruh data tim disimpan di memori dan selalu diperbarui realtime (onSnapshot).
 * - Tulis: aksi dijalankan dengan logika yang sama dengan mode demo pada salinan data, lalu hanya perubahan
 *   per kolom yang ditulis ke Firestore (Security Rules memeriksa setiap tulisan).
 * - Aksi yang butuh server (akun login, ekspor Docs, laporan) diteruskan ke Apps Script dengan ID token. */
(function () {
  'use strict';
  var CFG = window.PT_CONFIG || {};
  var FB = CFG.firebase || {};
  var DOMAIN = FB.emailDomain || 'linovhr-tracker.firebaseapp.com';   // email sintetis akun: <username>@DOMAIN
  var app = null, auth = null, db = null, FV = null;
  var S = null, me = '', isAdmin = false, unsubs = [], readyP = null, listeners = {}, changeTimer = null, writing = 0;
  var SERVER_ACTIONS = { saveUserNew: 1, resetPassword: 1, deleteUser: 1, exportBriefDoc: 1, sendReport: 1 };

  function emit(ch, d) { (listeners[ch] || []).forEach(function (fn) { try { fn(d); } catch (e) { console.error(e); } }); }
  function emailOf(u) { return String(u).trim().toLowerCase() + '@' + DOMAIN; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function init() {
    if (app) return;
    app = firebase.initializeApp(FB);
    auth = firebase.auth(); db = firebase.firestore(); FV = firebase.firestore.FieldValue;
    if (CFG.emulator) {   // hanya untuk pengujian lokal
      auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      db.useEmulator('127.0.0.1', 8080);
    } else {
      try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) { /* sudah diaktifkan / tidak didukung */ }
    }
    window.PTDemo.setIdGen(function (kind) {
      return kind + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    });
  }

  // ---------- konversi Firestore → bentuk data aplikasi ----------
  function plain(v) {
    if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = plain(v[k]); }); return o; }
    return v;
  }
  function docData(d) { return plain(d.data({ serverTimestamps: 'estimate' })); }
  var raw = { devices: {}, users: {}, private: {}, tasks: {}, projects: {}, briefs: {}, schedule: {}, schedRequests: {}, holidays: {}, leaves: {}, comments: {}, notifications: {} };

  function nameOf(u) { var x = raw.users[u]; return x ? x.name : u; }
  function rebuild() {
    var users = Object.keys(raw.users).map(function (u) {
      var x = raw.users[u];
      return Object.assign({}, x, { username: u, sheetName: x.hasTasks ? (x.legacySheet || x.name) : '', email: (raw.private[u] || {}).email || '',
        pushDevices: isAdmin ? Object.keys(raw.devices).filter(function (k) { return raw.devices[k].username === u; }).length : undefined });
    });
    var tasks = Object.keys(raw.tasks).map(function (id) {
      var t = raw.tasks[id];
      return Object.assign({ results: [], stageLog: [], notes: '', resultNote: '', startedAt: '', doneAt: '', reviewAt: '' }, t, { id: id, ownerName: nameOf(t.owner), sheet: nameOf(t.owner) });
    }).filter(function (t) { return raw.users[t.owner]; });
    var row = 2;
    var projects = Object.keys(raw.projects).sort().map(function (c) { return Object.assign({ startRaw: '', endRaw: '' }, raw.projects[c], { code: c, row: row++ }); });
    var briefs = Object.keys(raw.briefs).map(function (id) { return Object.assign({}, raw.briefs[id], { id: id }); });
    var sched = {};
    Object.keys(raw.schedule).forEach(function (id) { var r = raw.schedule[id]; sched[r.week + '|' + r.username] = { days: r.days || [], source: r.source || 'choice' }; });
    var holidays = {};
    Object.keys(raw.holidays).forEach(function (d) { holidays[d] = raw.holidays[d].name || 'Libur'; });
    var list = function (col) { return Object.keys(raw[col]).map(function (id) { return Object.assign({}, raw[col][id], { id: id }); }); };
    S = { users: users, tasks: tasks, projects: projects, briefs: briefs, sched: sched, sreqs: list('schedRequests'), holidays: holidays, leaves: list('leaves'), comments: list('comments') };
  }
  function changed() {
    rebuild();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(function () { if (!writing) emit('changed'); }, 250);
  }

  // ---------- langganan realtime ----------
  function subscribe() {
    unsubscribe();
    var pending = [], add = function (name, q, col, keyFn) {
      pending.push(new Promise(function (resolve, reject) {
        var first = true;
        unsubs.push(q.onSnapshot(function (snap) {
          snap.docChanges().forEach(function (c) {
            var key = keyFn ? keyFn(c.doc) : c.doc.id;
            if (c.type === 'removed') delete raw[col][key]; else raw[col][key] = docData(c.doc);
            if (col === 'notifications' && !first && c.type === 'added' && !raw[col][key].read) emit('notif:new', Object.assign({ id: key }, raw[col][key]));
          });
          if (first) { first = false; resolve(); } else changed();
        }, function (err) { console.error('Langganan ' + name + ' gagal', err); if (first) reject(err); else emit('error', err); }));
      }));
    };
    add('users', db.collection('users'), 'users');
    if (isAdmin) add('private', db.collection('private'), 'private');
    else add('private', db.collection('private').where(firebase.firestore.FieldPath.documentId(), '==', me), 'private');
    add('tasks', db.collection('tasks'), 'tasks');
    add('projects', db.collection('projects'), 'projects');
    add('briefs', db.collection('briefs'), 'briefs');
    add('schedule', db.collection('schedule'), 'schedule');
    add('schedRequests', db.collection('schedRequests'), 'schedRequests');
    add('holidays', db.collection('holidays'), 'holidays');
    if (isAdmin) add('leaves', db.collection('leaves'), 'leaves');
    else {
      add('leaves-own', db.collection('leaves').where('username', '==', me), 'leaves');
      add('leaves-ok', db.collection('leaves').where('status', '==', 'Disetujui'), 'leaves');
    }
    add('comments', db.collection('comments'), 'comments');
    add('notifications', db.collection('notifications').where('to', '==', me), 'notifications');
    if (isAdmin) add('devices', db.collection('devices'), 'devices');
    return Promise.all(pending).then(rebuild);
  }
  function unsubscribe() {
    unsubs.forEach(function (u) { try { u(); } catch (e) { /* abaikan */ } });
    unsubs = [];
    Object.keys(raw).forEach(function (k) { raw[k] = {}; });
    S = null;
  }

  /** Tunggu sesi login & data awal. */
  function ensureReady() {
    init();
    if (readyP) return readyP;
    readyP = new Promise(function (resolve, reject) {
      var off = auth.onAuthStateChanged(function (u) {
        off();
        if (!u || !u.email) { readyP = null; reject(new Error('UNAUTHORIZED')); return; }
        me = u.email.split('@')[0];
        // Tepat setelah masuk, token login kadang belum terpasang di koneksi Firestore → izin ditolak sesaat. Ulangi otomatis.
        var attempt = function (n) {
          return u.getIdToken().then(function () { return db.collection('users').doc(me).get(); }).then(function (d) {
            if (!d.exists || d.data().active !== true || d.data().orgOnly) { var e0 = new Error('UNAUTHORIZED'); e0.final = true; throw e0; }
            isAdmin = d.data().role === 'admin';
            return subscribe();
          }).catch(function (e) {
            if (e.final || n >= 4 || !/permission-denied|unauthenticated|unavailable/.test((e && e.code) || '')) throw e;
            unsubscribe();
            return new Promise(function (r) { setTimeout(r, 400 + n * 600); }).then(function () { return n >= 2 ? u.getIdToken(true) : null; }).then(function () { return attempt(n + 1); });
          });
        };
        attempt(0).then(function () { resolve(); pushRegister(true).then(bindForeground).catch(function () { /* izin belum ada */ }); })
          .catch(function (e) { readyP = null; unsubscribe(); reject(/permission-denied/.test((e && e.code) || '') ? new Error('Gagal memuat data setelah masuk. Klik Masuk sekali lagi.') : e); });
      });
    });
    return readyP;
  }

  // ---------- tulis: selisih state → Firestore ----------
  var TASK_SKIP = { id: 1, ownerName: 1, sheet: 1, row: 1, leaveDays: 1, startRaw: 1, endRaw: 1 };
  var USER_KEYS = ['name', 'role', 'active', 'position', 'reportsTo', 'division', 'skills', 'joined', 'orgOnly', 'wfoExempt', 'onboard', 'mustChange'];
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  function omit(o, skip) { var r = {}; Object.keys(o).forEach(function (k) { if (!skip[k] && o[k] !== undefined) r[k] = o[k]; }); return r; }
  function stored(st) {
    var out = { users: {}, private: {}, tasks: {}, projects: {}, briefs: {}, schedule: {}, schedRequests: {}, holidays: {}, leaves: {}, comments: {} };
    st.users.forEach(function (u) {
      out.users[u.username] = Object.assign(pick(u, USER_KEYS), { hasTasks: !!(u.sheetName || u.hasTasks) && !u.orgOnly });
      out.private[u.username] = { email: u.email || '' };
    });
    st.tasks.forEach(function (t) { out.tasks[t.id] = omit(t, TASK_SKIP); });
    st.projects.forEach(function (p) { if (p.code) out.projects[p.code] = omit(p, { code: 1, row: 1, startRaw: 1, endRaw: 1 }); });
    st.briefs.forEach(function (b) { out.briefs[b.id] = omit(b, { id: 1, summary: 1, ownerName: 1, createdByName: 1 }); });
    Object.keys(st.sched).forEach(function (k) { var p = k.split('|'); out.schedule[p[0] + '_' + p[1]] = { week: p[0], username: p[1], days: st.sched[k].days, source: st.sched[k].source }; });
    st.sreqs.forEach(function (q) { out.schedRequests[q.id] = omit(q, { id: 1 }); });
    Object.keys(st.holidays).forEach(function (d) { out.holidays[d] = { name: st.holidays[d] }; });
    st.leaves.forEach(function (l) { out.leaves[l.id] = omit(l, { id: 1 }); });
    st.comments.forEach(function (c) { out.comments[c.id] = omit(c, { id: 1 }); });
    return out;
  }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  /** Daftar operasi tulis dari selisih dua state. */
  function diff(before, after) {
    var A = stored(before), B = stored(after), ops = [];
    Object.keys(B).forEach(function (col) {
      var a = A[col], b = B[col];
      Object.keys(b).forEach(function (id) {
        if (!a[id]) { ops.push({ col: col, id: id, type: 'set', data: b[id] }); return; }
        var ch = {};
        Object.keys(b[id]).forEach(function (k) { if (!eq(a[id][k], b[id][k])) ch[k] = b[id][k]; });
        Object.keys(a[id]).forEach(function (k) { if (!(k in b[id])) ch[k] = null; });
        if (Object.keys(ch).length) ops.push({ col: col, id: id, type: 'update', data: ch });
      });
      Object.keys(a).forEach(function (id) { if (!b[id]) ops.push({ col: col, id: id, type: 'delete' }); });
    });
    return ops;
  }
  /** Sesuaikan operasi dengan aturan keamanan & kebutuhan Firestore. */
  function prepare(ops) {
    var ts = FV.serverTimestamp();
    return ops.filter(function (o) {
      if (o.col === 'private' && o.type === 'set' && !o.data.email) return false;
      if (!isAdmin) {
        if (o.col === 'projects') return false;            // status project dihitung ulang admin/server
        if ((o.col === 'users' || o.col === 'private') && o.id !== me) return false;
        if (o.col === 'users' && o.type !== 'update') return false;
      }
      return true;
    }).map(function (o) {
      var d = o.data ? Object.assign({}, o.data) : null;
      if (d) Object.keys(d).forEach(function (k) { if (d[k] === null && o.type === 'update') d[k] = FV.delete(); });
      // dokumen private bisa belum ada (akun tanpa email) → selalu tulis dengan merge, bukan update
      if (o.col === 'private' && o.type !== 'delete') { d.updatedAt = ts; return { col: o.col, id: o.id, type: 'set', merge: true, data: d }; }
      if (o.col === 'tasks' && o.type !== 'delete') {
        d.updatedBy = me; d.updatedAt = ts;
        if (o.type === 'set' && !d.createdBy && (d.type === 'Request' || d.type === 'Sosmed')) d.createdBy = me;
      }
      if (o.col === 'comments' && o.type === 'set') { d.createdAt = ts; d.deleted = false; d.editedAt = null; }
      if (o.col === 'comments' && o.type === 'update' && 'editedAt' in d) d.editedAt = ts;
      return { col: o.col, id: o.id, type: o.type, data: d };
    });
  }
  function commit(ops) {
    var chunks = [];
    for (var i = 0; i < ops.length; i += 400) chunks.push(ops.slice(i, i + 400));
    return chunks.reduce(function (p, part) {
      return p.then(function () {
        var b = db.batch();
        part.forEach(function (o) {
          var ref = db.collection(o.col).doc(o.id);
          if (o.type === 'delete') b.delete(ref); else if (o.type === 'set') { if (o.merge) b.set(ref, o.data, { merge: true }); else b.set(ref, o.data); } else b.update(ref, o.data);
        });
        return b.commit();
      });
    }, Promise.resolve());
  }
  function friendly(e) {
    var c = e && (e.code || '');
    if (/permission-denied/.test(c)) return new Error('Anda tidak punya izin untuk perubahan ini. Muat ulang data lalu coba lagi.');
    if (/unavailable|deadline/.test(c)) return new Error('Koneksi ke server terputus. Perubahan akan dikirim ulang otomatis saat online.');
    return e instanceof Error ? e : new Error(String(e));
  }


  // ---------- notifikasi: dibuat dari aksi ----------
  var PUSH_TYPES = { mention: 1 };
  var EMAIL_TYPES = { returned: 1, approved: 1, request: 1, leave: 1, sched: 1 };
  function notifsFor(action, p, before, after, result) {
    var out = [], myName = (after.users.find(function (u) { return u.username === me; }) || {}).name || me;
    var admins = after.users.filter(function (u) { return u.role === 'admin' && u.active !== false && !u.orgOnly && u.username !== me; }).map(function (u) { return u.username; });
    var tB = function (id) { return before.tasks.find(function (t) { return t.id === id; }); };
    var tA = function (id) { return after.tasks.find(function (t) { return t.id === id; }); };
    var short = function (x) { x = String(x || '').replace(/^https?:\/\/(www\.)?/, ''); return x.length > 70 ? x.slice(0, 67) + '…' : x; };
    var add = function (to, type, text, extra) {
      (Array.isArray(to) ? to : [to]).forEach(function (u) { if (u && u !== me) out.push(Object.assign({ to: u, type: type, text: text }, extra || {})); });
    };
    switch (action) {
      case 'commentAdd': {
        var c = (result && result.comments || []).filter(function (x) { return x.author === me && x.kind === 'user'; }).pop();
        if (c) add(c.mentions || [], 'mention', myName + ' menyebut Anda: ' + short(c.text), { taskId: p.taskId, title: (tA(p.taskId) || {}).task || '' });
        break;
      }
      case 'saveTask': {
        var id = result && result.id, a = id && tA(id), b0 = id && tB(id);
        if (a && (!b0 || b0.owner !== a.owner)) add(a.owner, 'assign', myName + ' menugaskan task: ' + short(a.task), { taskId: id });
        break;
      }
      case 'updateStatus': {
        var t1 = tA(p.taskId), t0 = tB(p.taskId);
        if (t1 && t0 && t0.status !== 'Review' && t1.status === 'Review') add(admins, 'review', myName + ' mengajukan review: ' + short(t1.task), { view: 'review', taskId: p.taskId });
        break;
      }
      case 'advanceStage': {
        var t2 = tA(p.taskId);
        if (t2 && t2.status === 'Review') add(admins, 'review', myName + ' mengajukan ' + ({ 3: 'review brief', 5: 'review artikel', 8: 'review cek AI' }[t2.stage] || 'review') + ': ' + short(t2.task), { view: 'review', taskId: p.taskId });
        break;
      }
      case 'reviewTask': {
        var t3 = tA(p.taskId); if (!t3) break;
        if (p.decision === 'return') add(t3.owner, 'returned', 'Dikembalikan: ' + short(t3.task) + (p.reason ? ' — ' + short(p.reason) : ''), { taskId: p.taskId });
        else add(t3.owner, 'approved', (t3.status === 'Done' ? 'Disetujui & selesai: ' : 'Disetujui, lanjut tahap berikutnya: ') + short(t3.task), { taskId: p.taskId });
        if (p.decision !== 'return' && t3.type === 'Sosmed' && t3.status === 'Done') add(t3.createdBy, 'approved', 'Konten sosmed selesai: ' + short(t3.task), { taskId: p.taskId, view: 'briefs' });
        break;
      }
      case 'saveRequest': case 'saveSocialBrief': {
        var tk = result && result.task; if (!tk) break;
        var prev = tB(tk.id);
        if (!prev || prev.owner !== tk.owner) add(tk.owner, action === 'saveRequest' ? 'request' : 'assign', (action === 'saveRequest' ? 'Request baru dari ' : 'Brief sosmed dari ') + myName + ': ' + short(tk.task), { taskId: tk.id, view: 'briefs' });
        break;
      }
      case 'requestAction': {
        var br = result && result.brief, t4 = result && result.task; if (!br || !t4) break;
        var mine = t4.owner === me, title = short(br.title || t4.task);
        if (p.act === 'message') add(mine ? br.createdBy : t4.owner, 'request', myName + (mine ? ' bertanya soal request: ' : ' membalas request: ') + title, { taskId: t4.id, view: 'briefs' });
        else if (p.act === 'accept') add(br.createdBy, 'request', myName + ' menerima request: ' + title, { taskId: t4.id, view: 'briefs' });
        else if (p.act === 'submit') add(br.createdBy, 'request', myName + ' mengajukan hasil request: ' + title, { taskId: t4.id, view: 'briefs' });
        else if (p.act === 'approve') add(t4.owner, 'approved', 'Hasil request disetujui: ' + title, { taskId: t4.id, view: 'briefs' });
        else if (p.act === 'return') add(t4.owner, 'returned', 'Hasil request dikembalikan: ' + title + (p.payload && p.payload.text ? ' — ' + short(p.payload.text) : ''), { taskId: t4.id, view: 'briefs' });
        break;
      }
      case 'leaveRequest': {
        var q = p.leave || {};
        if (isAdmin && q.username && q.username !== me) add(q.username, 'leave', myName + ' mencatat ' + String(q.kind || '').toLowerCase() + ' Anda: ' + q.from + (q.to && q.to !== q.from ? ' s.d. ' + q.to : ''), { view: 'schedule' });
        else if (!isAdmin) add(admins, 'leave', myName + ' mengajukan ' + String(q.kind || '').toLowerCase() + ': ' + q.from + (q.to && q.to !== q.from ? ' s.d. ' + q.to : ''), { view: 'schedule' });
        break;
      }
      case 'leaveDecide': {
        var l = after.leaves.find(function (x) { return x.id === p.id; });
        if (l) add(l.username, 'leave', l.kind + ' ' + l.from + (l.to !== l.from ? ' s.d. ' + l.to : '') + (p.decision === 'approve' ? ' disetujui' : ' ditolak') + (p.note ? ' — ' + short(p.note) : ''), { view: 'schedule' });
        break;
      }
      case 'schedRequest': add(admins, 'sched', myName + ' mengajukan perubahan jadwal WFO', { view: 'schedule' }); break;
      case 'schedDecide': {
        var r = after.sreqs.find(function (x) { return x.id === p.id; });
        if (r) add(r.username, 'sched', 'Pengajuan jadwal ' + (p.decision === 'approve' ? 'disetujui' : 'ditolak') + (p.note ? ' — ' + short(p.note) : ''), { view: 'schedule' });
        break;
      }
    }
    return out;
  }
  async function sendNotifs(list) {
    if (!list.length) return;
    var b = db.batch(), ids = [], ts = FV.serverTimestamp();
    list.forEach(function (n) {
      var ref = db.collection('notifications').doc();
      ids.push(ref.id);
      b.set(ref, Object.assign({ from: me, read: false, createdAt: ts, push: !!PUSH_TYPES[n.type], email: !!EMAIL_TYPES[n.type], taskId: '', view: '', title: '' }, n));
    });
    await b.commit();
    // email & push dikirim server; tidak menunda tampilan
    server('fb:dispatch', { ids: ids }).catch(function (e) { console.warn('Kirim notifikasi', e); });
  }

  // ---------- aksi lewat Apps Script ----------
  async function server(action, payload) {
    if (!CFG.apiUrl) throw new Error('Alamat server Apps Script belum diatur');
    var u = auth.currentUser, idToken = u ? await u.getIdToken() : '';
    var res = await fetch(CFG.apiUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, idToken: idToken, appUrl: location.origin + location.pathname.replace(/index\.html$/, '') }, payload || {})) });
    var j = JSON.parse(await res.text());
    if (!j.ok) throw new Error(j.error || 'Server menolak permintaan');
    return j.data;
  }


  // ---------- push (Firebase Cloud Messaging) ----------
  var pushToken = '';
  function pushSupported() { return !!(window.Notification && navigator.serviceWorker && window.firebase && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()) && !CFG.emulator && !!CFG.vapidKey; }
  function deviceLabel() {
    var ua = navigator.userAgent, os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : 'Perangkat';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return os + ' · ' + br;
  }
  async function pushRegister(silent) {
    if (!pushSupported() || Notification.permission !== 'granted') return '';
    var reg = await navigator.serviceWorker.ready;
    var token = await firebase.messaging().getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return '';
    pushToken = token;
    await db.collection('devices').doc(token).set({ username: me, label: deviceLabel(), lastSeen: FV.serverTimestamp(), ua: navigator.userAgent.slice(0, 200) }, { merge: true });
    try { localStorage.setItem('pt.pushToken', token); } catch (e) { /* abaikan */ }
    return token;
  }
  var onMsgBound = false;
  function bindForeground() {
    if (onMsgBound || !pushSupported()) return;
    onMsgBound = true;
    firebase.messaging().onMessage(function (m) {
      var d = (m && m.data) || {};
      if (String(d.tag || '').indexOf('n-') === 0) return;   // notifikasi lonceng sudah ditangani langsung dari Firestore
      emit('push', d);
    });
  }
  async function pushStatus() {
    await ensureReady();
    var perm = window.Notification ? Notification.permission : 'unsupported';
    var prefs = (raw.private[me] && raw.private[me].prefs) || {};
    var devs = [];
    try { devs = (await db.collection('devices').where('username', '==', me).get()).docs.map(function (x) { return Object.assign({ token: x.id }, plain(x.data())); }); } catch (e) { /* abaikan */ }
    return { supported: pushSupported(), permission: perm, enabled: perm === 'granted' && devs.some(function (x) { return x.token === pushToken; }), devices: devs.length,
      thisDevice: pushToken ? deviceLabel() : '', prefs: { mention: prefs.pushMention !== false, deadline: prefs.pushDeadline !== false } };
  }
  async function enablePush() {
    await ensureReady();
    if (!pushSupported()) throw new Error('Browser ini belum mendukung push notification. Gunakan Chrome atau Edge terbaru.');
    var perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return { permission: perm };
    await pushRegister(false); bindForeground();
    return { permission: perm, enabled: !!pushToken };
  }
  async function setPushPrefs(prefs) {
    await ensureReady();
    var cur = (raw.private[me] && raw.private[me].prefs) || {};
    var next = Object.assign({}, cur, { pushMention: prefs.mention !== false, pushDeadline: prefs.deadline !== false });
    await db.collection('private').doc(me).set({ prefs: next }, { merge: true });
    return { ok: true };
  }
  async function disablePush() {
    await ensureReady();
    if (pushToken) { try { await db.collection('devices').doc(pushToken).delete(); await firebase.messaging().deleteToken(); } catch (e) { /* abaikan */ } pushToken = ''; }
    try { localStorage.removeItem('pt.pushToken'); } catch (e) { /* abaikan */ }
    return { ok: true };
  }

  // ---------- antarmuka ----------
  async function call(action, payload) {
    payload = payload || {};
    await ensureReady();
    if (action === 'saveUser' && !S.users.some(function (u) { return u.username === String((payload.user || {}).username || '').toLowerCase(); })) action = 'saveUserNew';
    if (SERVER_ACTIONS[action]) return server('fb:' + action, payload);
    if (action === 'notifications') return { notifications: listNotifs() };
    if (action === 'notifRead') return markRead(payload.ids, payload.all);
    var before = S, work = clone(S);
    var result = window.PTDemo.handleWith(work, action, payload, { username: me });
    result = clone(result === undefined ? null : result);
    var ops = prepare(diff(before, work));
    if (!ops.length) return result;
    writing++;
    try { await commit(ops); }
    catch (e) { writing--; rebuild(); emit('changed'); throw friendly(e); }
    writing--;
    try { await sendNotifs(notifsFor(action, payload, before, work, result)); } catch (e) { console.warn('Notifikasi tidak terkirim', e); }
    return result;
  }
  function listNotifs() {
    return Object.keys(raw.notifications).map(function (id) { return Object.assign({ id: id }, raw.notifications[id]); })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 60);
  }
  async function markRead(ids, all) {
    var list = all ? listNotifs().filter(function (n) { return !n.read; }).map(function (n) { return n.id; }) : (ids || []);
    if (!list.length) return { ok: true };
    var b = db.batch();
    list.forEach(function (id) { if (raw.notifications[id]) { raw.notifications[id].read = true; b.update(db.collection('notifications').doc(id), { read: true }); } });
    await b.commit();
    return { ok: true };
  }

  async function login(username, password) {
    init();
    username = String(username || '').trim().toLowerCase();
    var email = emailOf(username);
    try { await auth.signInWithEmailAndPassword(email, password); }
    catch (e) {
      if (!/invalid-credential|user-not-found|wrong-password|invalid-login/.test(e.code || '')) {
        if (/too-many-requests/.test(e.code || '')) throw new Error('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
        throw new Error(/network/.test(e.code || '') ? 'Tidak bisa terhubung. Periksa koneksi internet.' : 'Login gagal: ' + (e.message || e.code));
      }
      // akun belum dipindah → cek password lama di server, lalu coba lagi
      try { await server('fbLogin', { username: username, password: password }); }
      catch (e2) { throw new Error(/Terlalu banyak|pendek/.test(e2.message) ? e2.message : 'Username atau password salah'); }
      await auth.signInWithEmailAndPassword(email, password);
    }
    readyP = null;
    await ensureReady();
    return publicMe();
  }
  function publicMe() {
    var u = S.users.find(function (x) { return x.username === me; }) || {};
    return { username: me, name: u.name, role: u.role, sheetName: u.sheetName, mustChange: !!u.mustChange, active: u.active, email: u.email || '',
      position: u.position || '', reportsTo: u.reportsTo || '', division: u.division || '', skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly, wfoExempt: !!u.wfoExempt, onboard: u.onboard || '' };
  }
  async function changePassword(oldPw, newPw) {
    await ensureReady();
    if (String(newPw || '').length < 8) throw new Error('Password baru minimal 8 karakter');
    var u = auth.currentUser;
    try { await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, oldPw)); }
    catch (e) { throw new Error('Password lama salah'); }
    await u.updatePassword(newPw);
    await db.collection('users').doc(me).update({ mustChange: false, updatedAt: FV.serverTimestamp() });
    raw.users[me] = Object.assign({}, raw.users[me], { mustChange: false }); rebuild();
    return publicMe();
  }
  async function logout() { init(); unsubscribe(); readyP = null; me = ''; isAdmin = false; await auth.signOut(); }

  window.PTFire = {
    call: call, login: login, logout: logout, changePassword: changePassword, ready: ensureReady,
    on: function (ch, fn) { (listeners[ch] = listeners[ch] || []).push(fn); },
    notifications: listNotifs, _notifsFor: notifsFor,
    pushStatus: pushStatus, enablePush: enablePush, disablePush: disablePush, setPushPrefs: setPushPrefs, testPush: function () { return server('fb:testPush', {}); },
    db: function () { init(); return db; }, auth: function () { init(); return auth; }, me: function () { return me; },
    _diff: diff, _stored: stored
  };
})();

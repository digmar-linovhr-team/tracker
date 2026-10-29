/**
 * Project Tracker — backend Google Apps Script
 * Spreadsheet: "KPI dan Tracker"
 *
 * Cara pasang: lihat README.md (bagian "1. Pasang backend di Google Sheets").
 * Ringkasnya: Extensions > Apps Script > tempel file ini > jalankan setup dari
 * menu "Project Tracker" di spreadsheet > Deploy sebagai Web app.
 */

// ===================== Konfigurasi =====================
var CFG = {
  USERS_SHEET: 'Users',
  MAIN_SHEET: 'Main Project',
  LOG_SHEET: 'Activity Log',
  BRIEF_SHEET: 'Briefs',
  SCHED_SHEET: 'Jadwal', SREQ_SHEET: 'Pengajuan Jadwal', HOLIDAY_SHEET: 'Libur',
  BRIEF_FOLDER: 'Brief Artikel',   // folder Google Drive untuk ekspor brief ke Google Doc
  TOKEN_DAYS: 14,
  HASH_ROUNDS: 300,
  MAX_LOGIN_FAIL: 5,
  LOCK_MINUTES: 15,
  // --- Notifikasi (aktif setelah menu "2. Aktifkan Calendar & email") ---
  CAL_NAME: 'Project Tracker',
  SEND_INVITES: false,      // true = kirim email undangan Calendar setiap event dibuat/diubah
  START_EVENT_MIN: 30,      // durasi blok event "mulai" di Calendar
  DUE_EVENT_MIN: 30,        // durasi blok event "deadline" (berakhir tepat di jam deadline)
  EMAIL_DUE_HOURS: 24,      // email pengingat dikirim saat deadline tinggal ≤ 24 jam
  DIGEST_HOUR: 7            // jam ringkasan pagi (Senin–Jumat)
};

var TASK_HEADERS = ['Code', 'Task', 'Start Date', 'End Date', 'Status',
  'Start Time', 'End Time', 'Priority', 'Task ID', 'Started At', 'Done At', 'Notes',
  'Cal Start ID', 'Cal Due ID', 'Cal Sync', 'Reminded', 'Review At', 'Result', 'Result Note',
  'Type', 'Stage', 'Live URL', 'AI Check URL', 'Stage Log'];
var USER_HEADERS = ['Username', 'Name', 'Role', 'Sheet Name', 'Password Hash',
  'Salt', 'Must Change', 'Active', 'Created At', 'Email', 'Position',
  'Reports To', 'Division', 'Skills', 'Joined', 'Org Only', 'WFO Exempt'];
var MAIN_HEADERS = ['Code', 'Project', 'PIC', 'Start', 'End', 'Priority', 'Status'];
var LOG_HEADERS = ['Timestamp', 'User', 'Action', 'Task ID', 'Detail'];
var BRIEF_HEADERS = ['Brief ID', 'Task ID', 'Owner', 'Created By', 'Type', 'Status', 'Keyword', 'Title',
  'Data', 'Doc URL', 'Created At', 'Updated At', 'Updated By', 'Status At'];

// Cache sederhana per eksekusi: tab Users & peta kolom cukup dibaca sekali per permintaan.
var MEMO_ = { users: null, cols: {} };
function resetMemo_() { MEMO_ = { users: null, cols: {} }; }
function invalidateUsers_() {
  MEMO_.users = null; delete MEMO_.cols[CFG.USERS_SHEET];
  try { CacheService.getScriptCache().remove(USERS_CACHE_KEY); } catch (e) { /* abaikan */ }
}
var USERS_CACHE_KEY = 'users_v1';   // tab Users di-cache 60 detik: tiap permintaan tidak perlu membaca sheet lagi

var STATUSES = ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'];
var PRIORITIES = ['High', 'Medium', 'Low'];

// ===================== Menu & setup =====================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Project Tracker')
    .addItem('1. Setup / perbarui struktur', 'setup')
    .addItem('2. Aktifkan Calendar & email pengingat', 'installNotifications')
    .addSeparator()
    .addItem('Sinkronkan Calendar sekarang', 'runReminders')
    .addItem('Matikan Calendar & email pengingat', 'disableNotifications')
    .addItem('Reset password pengguna…', 'menuResetPassword')
    .addToUi();
}

/**
 * Menyiapkan struktur tanpa menghapus data:
 * - menambah kolom baru (Start Time, End Time, Priority, Task ID, Started At, Done At, Notes)
 *   di akhir setiap tab orang
 * - membuat tab Users & Activity Log
 * - membuat akun untuk setiap tab orang + akun admin, dengan password sementara
 */
function setup() {
  resetMemo_();
  var ss = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  var users = getOrCreateSheet_(CFG.USERS_SHEET, USER_HEADERS);
  ensureHeaders_(users, USER_HEADERS);
  ensureHeaders_(getOrCreateSheet_(CFG.LOG_SHEET, LOG_HEADERS), LOG_HEADERS);
  ensureHeaders_(getOrCreateSheet_(CFG.MAIN_SHEET, MAIN_HEADERS), MAIN_HEADERS);
  ensureHeaders_(getOrCreateSheet_(CFG.BRIEF_SHEET, BRIEF_HEADERS), BRIEF_HEADERS);

  var existing = {};
  readUsers_().forEach(function (u) { existing[u.username] = u; });
  var created = [];

  var system = [CFG.USERS_SHEET, CFG.MAIN_SHEET, CFG.LOG_SHEET, CFG.BRIEF_SHEET, CFG.SCHED_SHEET, CFG.SREQ_SHEET, CFG.HOLIDAY_SHEET];
  var seenIds = {}, fixedVal = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (system.indexOf(name) >= 0 || name.charAt(0) === '_') return;
    ensureHeaders_(sh, TASK_HEADERS);
    assignMissingIds_(sh, seenIds);
    try { if (fixStatusValidation_(sh)) fixedVal.push(name); } catch (e) { Logger.log('validasi ' + name + ': ' + e); }
    var uname = slug_(name);
    var taken = readUsers_().some(function (u) { return u.sheetName === name; });
    if (!existing[uname] && !taken) {
      var pw = tempPassword_();
      appendUser_(uname, name, 'member', name, pw);
      created.push([uname, name, 'member', pw]);
    }
  });

  ensureSyncTrigger_();

  if (!existing['admin']) {
    var apw = tempPassword_();
    appendUser_('admin', 'Administrator', 'admin', '', apw);
    created.push(['admin', 'Administrator', 'admin', apw]);
  }

  var html = '<div style="font-family:Arial;font-size:13px">' +
    '<p>Struktur sudah siap.</p>' +
    '<p><b>Pemasangan pertama:</b> Deploy &gt; New deployment &gt; Web app (Execute as: <b>Me</b>, Who has access: <b>Anyone</b>), lalu salin URL-nya ke aplikasi.</p>' +
    '<p><b>Memperbarui Code.gs:</b> Deploy &gt; Manage deployments &gt; ✏️ &gt; Version: <b>New version</b> &gt; Deploy. Jangan buat New deployment — URL aplikasi akan berganti.</p>';
  if (created.length) {
    html += '<p><b>Akun baru (password sementara, wajib diganti saat login pertama).</b><br>' +
      'Salin sekarang — password tidak ditampilkan lagi.</p>' +
      '<table border="1" cellpadding="5" style="border-collapse:collapse">' +
      '<tr><th>Username</th><th>Nama</th><th>Role</th><th>Password sementara</th></tr>';
    created.forEach(function (r) {
      html += '<tr><td>' + esc_(r[0]) + '</td><td>' + esc_(r[1]) + '</td><td>' + r[2] +
        '</td><td><code>' + esc_(r[3]) + '</code></td></tr>';
    });
    html += '</table>';
  } else {
    html += '<p>Tidak ada akun baru yang dibuat.</p>';
  }
  if (fixedVal.length) html += '<p>Dropdown Status dilengkapi (Review, Hold, Recurring) di tab: ' + esc_(fixedVal.join(', ')) + '.</p>';
  var dups = Object.keys(seenIds).filter(function (k) { return seenIds[k].length > 1; });
  if (dups.length) {
    html += '<p style="color:#a32d2d"><b>Task ID ganda (' + dups.length + ')</b> — biasanya baris yang disalin. Hapus baris salinannya, atau kosongkan sel Task ID-nya lalu jalankan Setup lagi:</p><ul>' +
      dups.slice(0, 20).map(function (k) { return '<li><code>' + esc_(k) + '</code>: ' + esc_(seenIds[k].join(', ')) + '</li>'; }).join('') + '</ul>';
  }
  html += '</div>';
  dataCacheClear_();
  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(html).setWidth(560).setHeight(420), 'Project Tracker');
  } catch (e) {
    Logger.log(JSON.stringify(created));
  }
}

function menuResetPassword() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Reset password', 'Username yang direset:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = resetPassword_(res.getResponseText().trim().toLowerCase());
  ui.alert('Password sementara baru: ' + pw + '\nPengguna wajib menggantinya saat login.');
}

// ===================== HTTP =====================
function doGet() {
  resetMemo_();
  return json_({ ok: true, app: 'project-tracker', version: 19 });
}

function doPost(e) {
  resetMemo_();
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Request tidak valid' });
  }
  try {
    return json_({ ok: true, data: route_(body) });
  } catch (err) {
    var msg = String(err && err.message || err);
    return json_({ ok: false, error: msg, code: msg === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : undefined });
  } finally {
    if (READ_ACTIONS.indexOf(body.action) < 0) {
      try { SpreadsheetApp.flush(); } catch (e) { /* abaikan */ }
      dataCacheClear_();   // ada perubahan → data bacaan dimuat ulang
    }
  }
}

function route_(b) {
  var a = b.action;
  if (a === 'ping') return { ok: true };
  rememberAppUrl_(b.appUrl);
  if (a === 'login') return login_(b.username, b.password);

  var me = auth_(b.token);
  if (a === 'changePassword') return changePassword_(me, b.oldPassword, b.newPassword);
  if (me.mustChange) throw new Error('Ganti password terlebih dahulu');

  switch (a) {
    case 'me': return publicUser_(me);
    case 'myTasks': return { tasks: me.sheetName ? myTasks_(me) : [], projects: cachedProjects_(), me: publicUser_(me), briefs: cachedBriefs_() };
    case 'briefs': return { briefs: cachedBriefs_() };
    case 'getBrief': return { brief: findBrief_(b.briefId).brief };
    case 'saveBrief': return saveBrief_(me, b.brief);
    case 'saveSocialBrief': return saveSocialBrief_(me, b.brief);
    case 'saveRequest': return saveRequest_(me, b.brief);
    case 'requestAction': return requestAction_(me, b.briefId, b.act, b.payload || {});
    case 'deleteBrief': return deleteBrief_(me, b.briefId);
    case 'exportBriefDoc': return exportBriefDoc_(me, b.briefId);
    case 'updateStatus': return updateStatus_(me, b.taskId, b.status, b.owner);
    case 'advanceStage': return advanceStage_(me, b.taskId, b.step, b.url);
    case 'setMyEmail': return setMyEmail_(me, b.email);
    case 'setMySkills': return setMySkills_(me, b.skills);
    case 'schedule': return schedule_(me, b.week);
    case 'schedChoose': return schedChoose_(me, b.week, b.day, b.days);
    case 'schedRequest': return schedRequest_(me, b.req);
    case 'setResults': return setResults_(me, b.taskId, b.results, b.note);
    case 'teamTasks': return teamTasks_();
  }

  if (me.role !== 'admin') throw new Error('Hanya admin yang boleh melakukan ini');
  switch (a) {
    case 'getAll': return getAll_();
    case 'saveTask': return saveTask_(me, b.task);
    case 'bulkSetType': return bulkSetType_(me, b.taskIds, b.type);
    case 'deleteTask': return deleteTask_(me, b.taskId);
    case 'saveProject': return saveProject_(me, b.project);
    case 'deleteProject': return deleteProject_(me, b.row, b.code);
    case 'saveUser': return saveUser_(me, b.user);
    case 'resetPassword': return { password: resetPassword_(b.username) };
    case 'reviewTask': return reviewTask_(me, b.taskId, b.decision, b.reason, b.owner);
    case 'schedSet': return schedSet_(me, b.username, b.week, b.days);
    case 'schedDecide': return schedDecide_(me, b.id, b.decision, b.note);
    case 'schedHoliday': return schedHoliday_(me, b.date, b.name, b.remove);
    case 'reviewQueue': return { tasks: cachedTasks_().filter(function (t) { return t.status === 'Review' && t.type !== 'Request'; }) };
  }
  throw new Error('Aksi tidak dikenal: ' + a);
}

// ===================== Auth =====================
function login_(username, password) {
  username = String(username || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= CFG.MAX_LOGIN_FAIL) {
    throw new Error('Terlalu banyak percobaan. Coba lagi dalam ' + CFG.LOCK_MINUTES + ' menit.');
  }
  var u = findUser_(username);
  if (!u || !u.active || u.orgOnly || hash_(String(password || ''), u.salt) !== u.hash) {
    cache.put(failKey, String(fails + 1), CFG.LOCK_MINUTES * 60);
    throw new Error('Username atau password salah');
  }
  cache.remove(failKey);
  return { token: makeToken_(u.username), user: publicUser_(u) };
}

function changePassword_(me, oldPw, newPw) {
  if (hash_(String(oldPw || ''), me.salt) !== me.hash) throw new Error('Password lama salah');
  newPw = String(newPw || '');
  if (newPw.length < 8) throw new Error('Password baru minimal 8 karakter');
  var lock = lock_(20000);
  try {
    var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh), salt = Utilities.getUuid();
    sh.getRange(me.row, col['salt'] + 1).setValue(salt);
    sh.getRange(me.row, col['password hash'] + 1).setValue(hash_(newPw, salt));
    sh.getRange(me.row, col['must change'] + 1).setValue(false);
    invalidateUsers_();
  } finally { unlock_(lock); }
  me.mustChange = false;
  return { user: publicUser_(me) };
}

function makeToken_(username) {
  var exp = Date.now() + CFG.TOKEN_DAYS * 864e5;
  var payload = username + '|' + exp;
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}

function auth_(token) {
  if (!token) throw new Error('UNAUTHORIZED');
  var parts = String(token).split('.');
  if (parts.length !== 2) throw new Error('UNAUTHORIZED');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); }
  catch (e) { throw new Error('UNAUTHORIZED'); }
  if (sign_(payload) !== parts[1]) throw new Error('UNAUTHORIZED');
  var p = payload.split('|');
  if (Number(p[1]) < Date.now()) throw new Error('UNAUTHORIZED');
  var u = findUser_(p[0]);
  if (!u || !u.active || u.orgOnly) throw new Error('UNAUTHORIZED');
  return u;
}

function sign_(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) throw new Error('Backend belum di-setup. Jalankan menu Project Tracker > Setup.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

function hash_(password, salt) {
  var h = salt + '::' + password;
  for (var i = 0; i < CFG.HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + password, Utilities.Charset.UTF_8));
  }
  return h;
}

function tempPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ===================== Users =====================
function readUsers_() {
  if (MEMO_.users) return MEMO_.users;
  try {
    var hit = CacheService.getScriptCache().get(USERS_CACHE_KEY);
    if (hit) { MEMO_.users = JSON.parse(hit); return MEMO_.users; }
  } catch (e) { /* cache tidak tersedia → baca sheet */ }
  var sh = sheet_(CFG.USERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    var username = String(r[col['username']] || '').trim().toLowerCase();
    if (!username) return;
    out.push({
      row: i + 2,
      username: username,
      name: String(r[col['name']] || username),
      role: String(r[col['role']] || 'member').toLowerCase() === 'admin' ? 'admin' : 'member',
      sheetName: String(r[col['sheet name']] || ''),
      hash: String(r[col['password hash']] || ''),
      salt: String(r[col['salt']] || ''),
      mustChange: bool_(r[col['must change']]),
      active: r[col['active']] === '' ? true : bool_(r[col['active']]),
      email: col['email'] === undefined ? '' : String(r[col['email']] || '').trim(),
      position: col['position'] === undefined ? '' : String(r[col['position']] || '').trim(),
      reportsTo: col['reports to'] === undefined ? '' : String(r[col['reports to']] || '').trim().toLowerCase(),
      division: col['division'] === undefined ? '' : String(r[col['division']] || '').trim(),
      skills: col['skills'] === undefined ? '' : String(r[col['skills']] || '').trim().replace(/^'(?=[=+\-@])/, ''),
      joined: col['joined'] === undefined ? '' : normMonth_(r[col['joined']]),
      orgOnly: col['org only'] === undefined ? false : bool_(r[col['org only']]),
      wfoExempt: col['wfo exempt'] === undefined ? false : bool_(r[col['wfo exempt']])
    });
  });
  MEMO_.users = out;
  try { CacheService.getScriptCache().put(USERS_CACHE_KEY, JSON.stringify(out), 60); } catch (e) { /* terlalu besar → lewati */ }
  return out;
}

function findUser_(username) {
  return readUsers_().filter(function (u) { return u.username === username; })[0] || null;
}

function publicUser_(u) {
  return { username: u.username, name: u.name, role: u.role, sheetName: u.sheetName,
    mustChange: u.mustChange, active: u.active, email: u.email || '', position: u.position || '',
    reportsTo: u.reportsTo || '', division: u.division || '', skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly, wfoExempt: !!u.wfoExempt };
}
/** Data struktur tim untuk semua anggota (tanpa email/akun). */
function orgUser_(u) {
  return { username: u.username, name: u.name, position: u.position || '', reportsTo: u.reportsTo || '', division: u.division || '',
    skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly, hasTasks: !!u.sheetName, role: u.role };
}
function normMonth_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  var m = String(v || '').trim().replace(/^'/, '').match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + '-' + pad_(m[2]) : '';
}
/** Atasan harus pengguna yang ada, bukan diri sendiri, dan tidak membuat struktur berputar. */
function checkReportsTo_(username, boss) {
  if (!boss) return '';
  boss = String(boss).toLowerCase();
  if (boss === username) throw new Error('Atasan tidak boleh diri sendiri');
  var users = readUsers_(), by = {};
  users.forEach(function (u) { by[u.username] = u; });
  if (!by[boss]) throw new Error('Atasan tidak ditemukan');
  var cur = boss, seen = {};
  while (cur && by[cur] && !seen[cur]) {
    if (cur === username) throw new Error('Struktur berputar: ' + by[boss].name + ' sudah berada di bawah orang ini.');
    seen[cur] = true; cur = by[cur].reportsTo;
  }
  return boss;
}
function cleanSkills_(v) { return safeCell_(String(v || '').replace(/\s+/g, ' ').trim().slice(0, 120)); }
function orgFields_(username, data) {
  var o = {};
  if (data.reportsTo !== undefined) o['reports to'] = checkReportsTo_(username, data.reportsTo);
  if (data.division !== undefined) o['division'] = safeCell_(String(data.division).trim().slice(0, 60));
  if (data.skills !== undefined) o['skills'] = cleanSkills_(data.skills);
  if (data.joined !== undefined) o['joined'] = /^\d{4}-\d{2}$/.test(String(data.joined)) ? "'" + data.joined : '';
  return o;
}
function setMySkills_(me, skills) {
  var lock = lock_(20000);
  try {
    var sh = sheet_(CFG.USERS_SHEET);
    ensureHeaders_(sh, USER_HEADERS);
    writeObj_(sh, me.row, { 'skills': cleanSkills_(skills) });
    invalidateUsers_();
    return { user: publicUser_(findUser_(me.username)) };
  } finally { unlock_(lock); }
}

function appendUser_(username, name, role, sheetName, password) {
  var salt = Utilities.getUuid();
  appendObj_(sheet_(CFG.USERS_SHEET), {
    'username': username, 'name': name, 'role': role, 'sheet name': sheetName,
    'password hash': hash_(password, salt), 'salt': salt, 'must change': true,
    'active': true, 'created at': new Date()
  });
  invalidateUsers_();
}

function resetPassword_(username) {
  var u = findUser_(String(username || '').toLowerCase());
  if (!u) throw new Error('Pengguna tidak ditemukan');
  var pw = tempPassword_(), salt = Utilities.getUuid();
  var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh);
  sh.getRange(u.row, col['salt'] + 1).setValue(salt);
  sh.getRange(u.row, col['password hash'] + 1).setValue(hash_(pw, salt));
  sh.getRange(u.row, col['must change'] + 1).setValue(true);
  invalidateUsers_();
  CacheService.getScriptCache().remove('fail_' + u.username);
  return pw;
}

function saveUser_(me, data) {
  data = data || {};
  var username = slug_(data.username || data.name || '');
  if (!username) throw new Error('Username wajib diisi');
  var role = data.role === 'admin' ? 'admin' : 'member';
  var lock = lock_(20000);
  try {
    ensureHeaders_(sheet_(CFG.USERS_SHEET), USER_HEADERS);
    var existing = findUser_(username);
    var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh);
    if (existing) {
      if (existing.username === me.username && (role !== 'admin' || data.active === false)) {
        throw new Error('Anda tidak bisa menurunkan role atau menonaktifkan akun sendiri');
      }
      sh.getRange(existing.row, col['name'] + 1).setValue(data.name || existing.name);
      sh.getRange(existing.row, col['role'] + 1).setValue(role);
      sh.getRange(existing.row, col['active'] + 1).setValue(data.active !== false);
      if (data.email !== undefined) sh.getRange(existing.row, col['email'] + 1).setValue(cleanEmail_(data.email));
      if (data.position !== undefined) sh.getRange(existing.row, col['position'] + 1).setValue(String(data.position).trim().slice(0, 80));
      var of = orgFields_(username, data);
      if (data.wfoExempt !== undefined) of['wfo exempt'] = !!data.wfoExempt;
      if (data.orgOnly !== undefined) {
        if (data.orgOnly && existing.username === me.username) throw new Error('Akun Anda sendiri tidak bisa dijadikan "tanpa akun"');
        of['org only'] = !!data.orgOnly;
      }
      if (Object.keys(of).length) writeObj_(sh, existing.row, of);
      if (data.hasTasks && !existing.sheetName && !data.orgOnly) {
        var sn = ensurePersonSheet_(data.name || existing.name);
        sh.getRange(existing.row, col['sheet name'] + 1).setValue(sn);
      }
      invalidateUsers_();
      invalidateUsers_();
      log_(me, 'update-user', '', username);
      return { user: publicUser_(findUser_(username)) };
    }
    var ofNew = orgFields_(username, data);
    var orgOnly = !!data.orgOnly;
    var sheetName = data.hasTasks === false || orgOnly ? '' : ensurePersonSheet_(data.name || username);
    var pw = tempPassword_();
    appendUser_(username, data.name || username, orgOnly ? 'member' : role, sheetName, pw);
    var nu = findUser_(username), ucol = colMap_(sh);
    if (orgOnly) ofNew['org only'] = true;
    if (data.wfoExempt) ofNew['wfo exempt'] = true;
    if (Object.keys(ofNew).length) writeObj_(sh, nu.row, ofNew);
    if (data.email) sh.getRange(nu.row, ucol['email'] + 1).setValue(cleanEmail_(data.email));
    if (data.position) sh.getRange(nu.row, ucol['position'] + 1).setValue(String(data.position).trim().slice(0, 80));
    invalidateUsers_();
    log_(me, 'create-user', '', username);
    return orgOnly ? { user: publicUser_(findUser_(username)) } : { user: publicUser_(findUser_(username)), password: pw };
  } finally { unlock_(lock); }
}

function ensurePersonSheet_(name) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh, TASK_HEADERS);
  return sh.getName();
}

// ===================== Projects =====================
function readProjects_() {
  var sh = sheet_(CFG.MAIN_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn());
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  var out = [];
  vals.forEach(function (r, i) {
    var code = String(r[col['code']] || '').trim();
    var name = String(r[col['project']] || '').trim();
    if (!code && !name) return;
    out.push({
      row: i + 2, code: code, project: name,
      pic: String(r[col['pic']] || ''),
      start: normDate_(r[col['start']]), startRaw: disp[i][col['start']],
      end: normDate_(r[col['end']]), endRaw: disp[i][col['end']],
      priority: String(r[col['priority']] || ''),
      status: String(r[col['status']] || '')
    });
  });
  return out;
}

function saveProject_(me, p) {
  p = p || {};
  if (!String(p.project || '').trim()) throw new Error('Nama project wajib diisi');
  var lock = lock_(20000);
  try {
    var sh = sheet_(CFG.MAIN_SHEET), col = colMap_(sh);
    var obj = {
      'code': p.code || '', 'project': p.project, 'pic': p.pic || '',
      'start': toDateCell_(p.start), 'end': toDateCell_(p.end),
      'priority': p.priority || 'Medium', 'status': p.status || 'Backlog'
    };
    var row;
    if (p.row) {
      row = Number(p.row);
      var cur = String(sh.getRange(row, col['code'] + 1).getValue()).trim();
      if (cur !== String(p.originalCode || '').trim()) {
        throw new Error('Data project berubah di spreadsheet. Muat ulang lalu coba lagi.');
      }
      writeObj_(sh, row, obj);
    } else {
      row = appendObj_(sh, obj);
    }
    formatDateCells_(sh, row, [col['start'], col['end']]);
    log_(me, p.row ? 'update-project' : 'create-project', '', (p.code || '') + ' ' + p.project);
    return { ok: true };
  } finally { unlock_(lock); }
}

// ---------- Status project mengikuti task ----------
/** Status baru project dari status task-task-nya; null = biarkan.
 *  1 task: status project = status task. Banyak task: Done bila semua Done; dibuka lagi → On-Progress. */
function projectStatusFor_(statuses, current) {
  if (!statuses || !statuses.length) return null;
  if (statuses.length === 1) return STATUSES.indexOf(statuses[0]) >= 0 ? statuses[0] : null;
  if (statuses.every(function (x) { return x === 'Done'; })) return 'Done';
  return current === 'Done' ? 'On-Progress' : null;
}

/** { code: [status task, ...] } dari semua tab orang — hanya membaca kolom yang perlu. */
function taskStatusByCode_() {
  var out = {};
  personSheets_().forEach(function (p) {
    var sh = p.sheet, col = colMap_(sh);
    if (sh.getLastRow() < 2 || col['code'] === undefined || col['status'] === undefined || col['task'] === undefined) return;
    var a = Math.min(col['code'], col['status'], col['task']), b = Math.max(col['code'], col['status'], col['task']);
    sh.getRange(2, a + 1, sh.getLastRow() - 1, b - a + 1).getValues().forEach(function (r) {
      var c = String(r[col['code'] - a] || '').trim(), t = String(r[col['task'] - a] || '').trim();
      if (!c || !t) return;
      (out[c] = out[c] || []).push(String(r[col['status'] - a] || '').trim() || 'Backlog');
    });
  });
  return out;
}

/** Catat code project yang perlu disinkronkan; diproses trigger 1 menit (processProjectSync) supaya simpan task tetap cepat. */
function queueProjectSync_(codes) {
  try {
    var list = (codes || []).map(function (c) { return String(c || '').trim(); }).filter(String);
    if (!list.length) return;
    var props = PropertiesService.getScriptProperties();
    var cur = JSON.parse(props.getProperty('PROJ_SYNC') || '[]');
    list.forEach(function (c) { if (cur.indexOf(c) < 0) cur.push(c); });
    props.setProperty('PROJ_SYNC', JSON.stringify(cur.slice(-200)));
  } catch (e) { Logger.log('queueProjectSync_: ' + e); }
}

/** Trigger tiap 1 menit: sinkronkan status project yang antre. Tidak melakukan apa-apa bila antrean kosong. */
function processProjectSync() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PROJ_SYNC')) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    resetMemo_();
    var codes = JSON.parse(props.getProperty('PROJ_SYNC') || '[]');
    props.deleteProperty('PROJ_SYNC');
    if (codes.length && syncProjectStatus_(codes).length) dataCacheClear_();
  } finally { unlock_(lock); }
}

function ensureSyncTrigger_() {
  try {
    var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processProjectSync'; });
    if (!has) ScriptApp.newTrigger('processProjectSync').timeBased().everyMinutes(1).create();
  } catch (e) { Logger.log('ensureSyncTrigger_: ' + e); }
}

/** Perbarui kolom Status di Main Project. codes = daftar code yang berubah, atau null untuk semua. */
function syncProjectStatus_(codes) {
  try {
    var want = codes ? codes.map(function (c) { return String(c || '').trim(); }).filter(String) : null;
    if (want && !want.length) return [];
    var sh = sheet_(CFG.MAIN_SHEET);
    if (!sh || sh.getLastRow() < 2) return [];
    var col = colMap_(sh);
    if (col['code'] === undefined || col['status'] === undefined) return [];
    var by = taskStatusByCode_(), changed = [];
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(col['code'], col['status']) + 1).getValues();
    vals.forEach(function (r, i) {
      var c = String(r[col['code']] || '').trim();
      if (!c || (want && want.indexOf(c) < 0)) return;
      var cur = String(r[col['status']] || '').trim(), next = projectStatusFor_(by[c], cur);
      if (next && next !== cur) { sh.getRange(i + 2, col['status'] + 1).setValue(next); changed.push({ code: c, status: next }); }
    });
    return changed;
  } catch (e) { Logger.log('syncProjectStatus_: ' + e); return []; }
}

function deleteProject_(me, row, code) {
  var lock = lock_(20000);
  try {
    var sh = sheet_(CFG.MAIN_SHEET), col = colMap_(sh);
    var cur = String(sh.getRange(Number(row), col['code'] + 1).getValue()).trim();
    if (cur !== String(code || '').trim()) throw new Error('Data project berubah. Muat ulang lalu coba lagi.');
    sh.deleteRow(Number(row));
    log_(me, 'delete-project', '', code);
    return { ok: true };
  } finally { unlock_(lock); }
}

// ===================== Tasks =====================
function personSheets_() {
  var ss = SpreadsheetApp.getActive();
  var seen = {}, out = [];
  readUsers_().forEach(function (u) {
    if (!u.sheetName || seen[u.sheetName]) return;
    var sh = ss.getSheetByName(u.sheetName);
    if (sh) { seen[u.sheetName] = 1; out.push({ sheet: sh, user: u }); }
  });
  return out;
}

// ---------- cache data bacaan (dibuang otomatis setiap ada perubahan) ----------
var READ_ACTIONS = ['ping', 'login', 'me', 'myTasks', 'briefs', 'getBrief', 'teamTasks', 'getAll', 'reviewQueue', 'schedule'];
var DATA_TTL = 90;   // detik; perubahan langsung di spreadsheet terlihat paling lambat 1,5 menit
function dataCache_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }
function dataVer_(c) { return (c && c.get('d_ver')) || '0'; }
/** Ganti nomor versi → semua data bacaan lama tidak dipakai lagi. */
function dataCacheClear_() { var c = dataCache_(); if (c) c.put('d_ver', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); }
function cacheGetJson_(c, key) {
  var n = Number(c.get(key) || 0); if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(key + '_' + i);
  var parts = c.getAll(keys), out = '';
  for (var j = 0; j < n; j++) { if (parts[keys[j]] === undefined || parts[keys[j]] === null) return null; out += parts[keys[j]]; }
  try { return JSON.parse(out); } catch (e) { return null; }
}
function cachePutJson_(c, key, obj) {
  var json = JSON.stringify(obj), size = 40000, n = Math.ceil(json.length / size) || 1;
  if (n > 40) return;   // terlalu besar untuk cache
  var map = {};
  for (var i = 0; i < n; i++) map[key + '_' + i] = json.slice(i * size, (i + 1) * size);
  try { c.putAll(map, DATA_TTL); c.put(key, String(n), DATA_TTL); } catch (e) { /* lewati */ }
}
/** Baca dari cache; bila tidak ada, hitung lalu simpan — hanya bila tidak ada perubahan selama menghitung. */
function cached_(name, compute) {
  var c = dataCache_(); if (!c) return compute();
  var ver = dataVer_(c), key = 'd_' + name + '_' + ver;
  var hit = cacheGetJson_(c, key);
  if (hit) return hit;
  var val = compute();
  if (dataVer_(c) === ver) cachePutJson_(c, key, val);
  return val;
}
function cachedTasks_() { return cached_('tasks', allTasks_); }
function cachedProjects_() { return cached_('projects', readProjects_); }
function cachedBriefs_() { return cached_('briefs', function () { return readBriefs_().map(briefSummary_); }); }
/** Tugas milik sendiri: pakai cache semua task bila ada, kalau tidak baca tab sendiri saja (lebih ringan). */
function myTasks_(me) {
  var c = dataCache_();
  var hit = c && cacheGetJson_(c, 'd_tasks_' + dataVer_(c));
  return hit ? hit.filter(function (t) { return t.owner === me.username; }) : readTasksOf_(me);
}

function readTasksOf_(user) {
  var sh = SpreadsheetApp.getActive().getSheetByName(user.sheetName);
  return sh ? readTaskSheet_(sh, user) : [];
}

function readTaskSheet_(sh, user) {
  if (sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  if (col['task'] === undefined) return [];
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn());
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  var out = [];
  vals.forEach(function (r, i) {
    var t = rowTask_(r, disp[i], col, sh, user, i + 2);
    if (t) out.push(t);
  });
  return out;
}

function rowTask_(r, disp, col, sh, user, row) {
  var title = String(r[col['task']] || '').trim();
  if (!title) return null;
  var g = function (k) { return col[k] === undefined ? '' : r[col[k]]; };
  var d = function (k) { return col[k] === undefined || !disp ? '' : disp[col[k]]; };
  return {
    id: String(g('task id') || ''),
    owner: user.username, ownerName: user.name, sheet: sh.getName(), row: row,
    code: String(g('code') || '').trim(),
    task: title,
    startDate: normDate_(g('start date')), startRaw: d('start date'),
    endDate: normDate_(g('end date')), endRaw: d('end date'),
    startTime: normTime_(g('start time')), endTime: normTime_(g('end time')),
    status: (function (v) { v = String(v || 'Backlog').trim(); return /^on[\s-]?hold$/i.test(v) ? 'Hold' : v; })(g('status')),
    priority: String(g('priority') || '').trim(),
    startedAt: normStamp_(g('started at')),
    doneAt: normStamp_(g('done at')),
    reviewAt: normStamp_(g('review at')),
    notes: String(g('notes') || ''),
    results: parseResults_(g('result')),
    resultNote: String(g('result note') || '').replace(/^'(?=[=+\-@])/, ''),
    type: typeName_(g('type')),
    stage: Number(g('stage')) || 0,
    liveUrl: String(g('live url') || ''), aiCheckUrl: String(g('ai check url') || ''),
    stageLog: parseStageLog_(g('stage log'))
  };
}

function allTasks_() {
  var tasks = [];
  personSheets_().forEach(function (p) { tasks = tasks.concat(readTaskSheet_(p.sheet, p.user)); });
  return tasks;
}

/** Data baca-saja untuk menu Tim: semua task + nama & jabatan (tanpa email/akun). */
function teamTasks_() {
  var users = readUsers_().filter(function (u) { return u.sheetName && u.active; })
    .map(function (u) { return { username: u.username, name: u.name, position: u.position || '' }; });
  var org = readUsers_().filter(function (u) { return u.active; }).map(orgUser_);
  return { tasks: cachedTasks_(), users: users, projects: cachedProjects_(), briefs: cachedBriefs_(), org: org };
}

function getAll_() {
  var tasks = cachedTasks_(), seen = {}, dup = {};
  tasks.forEach(function (t) { if (!t.id) return; if (seen[t.id]) dup[t.id] = true; seen[t.id] = true; });
  return { dupIds: Object.keys(dup), tasks: tasks, projects: cachedProjects_(), users: readUsers_().map(publicUser_),
    statuses: STATUSES, priorities: PRIORITIES, notifications: calEnabled_(), briefs: cachedBriefs_() };
}

/** Cari baris task berdasarkan Task ID. Member hanya boleh di tab miliknya. */
function locateTask_(me, taskId, owner) {
  if (!taskId) throw new Error('Task ID kosong');
  var list = me.role === 'admin' ? personSheets_()
    : personSheets_().filter(function (p) { return p.user.username === me.username; });
  if (owner) {   // admin: cari dulu di tab penanggung jawab yang terlihat di aplikasi (aman bila Task ID ganda di tab lain)
    owner = String(owner).toLowerCase();
    list = list.filter(function (p) { return p.user.username === owner; }).concat(list.filter(function (p) { return p.user.username !== owner; }));
  }
  var cache = null, key = 'loc_' + taskId;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  var find = function (p) {
    var sh = p.sheet, col = colMap_(sh);
    if (col['task id'] === undefined || sh.getLastRow() < 2) return null;
    var cell = sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1)
      .createTextFinder(String(taskId)).matchEntireCell(true).findNext();
    return cell ? { sheet: sh, row: cell.getRow(), col: col, user: p.user } : null;
  };
  // tab terakhir tempat task ini ditemukan dicoba lebih dulu (hemat 1 pencarian per tab orang)
  var hint = !owner && cache && cache.get(key);
  if (hint) {
    var hp = list.filter(function (p) { return p.sheet.getName() === hint; })[0];
    var hr = hp && find(hp);
    if (hr) return hr;
  }
  for (var i = 0; i < list.length; i++) {
    if (hint && list[i].sheet.getName() === hint) continue;
    var r = find(list[i]);
    if (r) { if (cache) cache.put(key, r.sheet.getName(), 21600); return r; }
  }
  throw new Error('Task tidak ditemukan (mungkin sudah dihapus). Muat ulang data.');
}

function updateStatus_(me, taskId, status, owner) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Status tidak valid');
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, taskId, owner), sh = loc.sheet, col = loc.col, row = loc.row;
    var r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    var prev = String(r[col['status']]), now = new Date(), ch = { 'status': status };
    if (isRequestRow_(r, col) && me.role !== 'admin') throw new Error('Task request mengikuti alurnya. Gunakan tombol di request (Terima / Ajukan hasil).');
    if (isArticleRow_(r, col)) {
      if (me.role !== 'admin') throw new Error('Task artikel mengikuti tahapnya. Gunakan tombol tahap di task (mis. Ajukan brief / Ajukan review artikel).');
      if (status === 'Done') { var tk = setStage_(sh, row, r, col, loc.user, me, 9); log_(me, 'status', taskId, prev + ' → Done'); return { task: tk }; }
      if (status === 'Review') {
        var cs = Number(r[col['stage']]) || 1, rs = REVIEW_NEXT[cs] ? cs : REVIEW_NEXT[cs + 1] ? cs + 1 : 0;
        if (!rs) throw new Error('Task artikel di tahap ini tidak bisa diajukan review. Ubah tahapnya lewat Edit task.');
        var tr = setStage_(sh, row, r, col, loc.user, me, rs); log_(me, 'status', taskId, prev + ' → Review (tahap ' + rs + ')'); return { task: tr };
      }
    }
    if (me.role !== 'admin') {
      if (status === 'Done') throw new Error('Hanya admin yang bisa menandai Done. Ajukan review agar diperiksa admin.');
      if (prev === 'Done') throw new Error('Task ini sudah disetujui admin. Minta admin untuk membukanya kembali.');
    }
    if (status === 'Review' && prev !== 'Review') ch['review at'] = now;
    if ((status === 'On-Progress' || status === 'Review') && !r[col['started at']]) ch['started at'] = now;
    if (status === 'Done') ch['done at'] = now;
    else if (r[col['done at']]) ch['done at'] = '';
    writeObj_(sh, row, ch);
    Object.keys(ch).forEach(function (k) { r[col[k]] = ch[k]; });
    log_(me, 'status', taskId, prev + ' → ' + status);
    // Calendar diperbarui oleh trigger berkala (perubahan terdeteksi otomatis), supaya simpan tetap cepat.
    var task = rowTask_(r, null, col, sh, loc.user, row);
    var brief = task.type === 'Sosmed' ? mirrorSocialBrief_(taskId, status, me) : task.type === 'Request' ? mirrorRequestBrief_(taskId, status) : null;
    queueProjectSync_([task.code]);
    return brief ? { task: task, brief: brief } : { task: task };
  } finally { unlock_(lock); }
}

function saveTask_(me, t) {
  t = t || {};
  if (!String(t.task || '').trim()) throw new Error('Nama task wajib diisi');
  var owner = findUser_(String(t.owner || '').toLowerCase());
  if (!owner) throw new Error('Penanggung jawab tidak ditemukan');
  if (!owner.sheetName) throw new Error(owner.name + ' belum punya tab task. Aktifkan "punya task" di menu Pengguna.');
  if (t.status && STATUSES.indexOf(t.status) < 0) throw new Error('Status tidak valid');

  var lock = lock_(20000);
  try {
    var ss = SpreadsheetApp.getActive();
    var target = ss.getSheetByName(owner.sheetName);
    ensureHeaders_(target, TASK_HEADERS);
    var obj = {
      'code': t.code || '', 'task': t.task,
      'start date': toDateCell_(t.startDate), 'end date': toDateCell_(t.endDate),
      'start time': t.startTime || '', 'end time': t.endTime || '',
      'status': t.status || 'Backlog', 'priority': t.priority || 'Medium',
      'notes': t.notes || ''
    };
    if (Array.isArray(t.results)) obj['result'] = serializeResults_(t.results);
    if (t.resultNote !== undefined) obj['result note'] = cleanNote_(t.resultNote);
    var article = t.type === 'Artikel';
    if (t.type !== undefined) obj['type'] = article ? 'Artikel' : t.type === 'Sosmed' || t.type === 'Request' ? t.type : 'Non-artikel';
    var wantStage = article && Number(t.stage) >= 1 && Number(t.stage) <= 9 ? Number(t.stage) : 0;
    if (article) delete obj.status;   // status task artikel mengikuti tahap
    var id = t.id;
    if (obj.status === 'Review' && !t.reviewAt) obj['review at'] = new Date();
    var oldCode = '';
    if (id) {
      var loc = locateTask_(me, id);
      oldCode = String(loc.sheet.getRange(loc.row, loc.col['code'] + 1).getValue() || '').trim();
      if (loc.sheet.getName() !== target.getName()) {
        // pindah penanggung jawab: salin kolom yang tidak ada di form lalu hapus baris lama
        ['status', 'started at', 'done at', 'review at', 'result', 'result note', 'type', 'stage', 'live url', 'ai check url', 'stage log'].forEach(function (k) {
          if (obj[k] === undefined && loc.col[k] !== undefined) obj[k] = loc.sheet.getRange(loc.row, loc.col[k] + 1).getValue();
        });
        obj['task id'] = id;
        trashRowEvents_(loc.sheet, loc.row);
        loc.sheet.deleteRow(loc.row);
        var nr = appendObj_(target, obj);
        formatTaskRow_(target, nr);
      } else {
        writeObj_(target, loc.row, obj);
        formatTaskRow_(target, loc.row);
      }
      if (!article) syncStamps_(target, findRowById_(target, id), obj.status, false);
      log_(me, 'update-task', id, t.task + ' → ' + owner.username);
    } else {
      id = newId_();
      obj['task id'] = id;
      if (obj.status === 'Done') obj['done at'] = new Date();
      if (obj.status === 'On-Progress') obj['started at'] = new Date();
      if (article) { obj.status = 'Backlog'; obj['stage'] = 1; obj['stage log'] = JSON.stringify([{ s: 1, t: new Date().toISOString(), by: me.username }]); }
      var row = appendObj_(target, obj);
      formatTaskRow_(target, row);
      log_(me, 'create-task', id, t.task + ' → ' + owner.username);
    }
    var savedRow = findRowById_(target, id);
    if (article && savedRow) {
      // task lama yang diubah menjadi artikel, atau admin mengoreksi tahap
      var tc = colMap_(target), rr = target.getRange(savedRow, 1, 1, target.getLastColumn()).getValues()[0];
      var cur = Number(rr[tc['stage']]) || 0;
      if (!cur) wantStage = wantStage || (String(rr[tc['status']]) === 'Done' ? 9 : String(rr[tc['status']]) === 'On-Progress' ? 2 : 1);
      if (wantStage && wantStage !== cur) setStage_(target, savedRow, rr, tc, owner, me, wantStage);
    }
    var saved = savedRow ? rowTask_(target.getRange(savedRow, 1, 1, target.getLastColumn()).getValues()[0], null, colMap_(target), target, owner, savedRow) : null;
    if (saved && saved.type === 'Sosmed' && t.id) mirrorSocialBrief_(id, saved.status, me);
    queueProjectSync_([obj.code, oldCode]);
    return { id: id, task: saved };
  } finally { unlock_(lock); }
}

// ---------- Result: link hasil kerja ----------
var MAX_RESULTS = 10;

/** Sel "Result": satu link per baris, format "Nama | URL" atau URL saja. */
function parseResults_(v) {
  return String(v || '').split(/\r?\n/).map(function (line) {
    line = line.trim();
    if (!line) return null;
    var i = line.lastIndexOf('|'), label = '', url = line;
    if (i >= 0) { label = line.slice(0, i).trim(); url = line.slice(i + 1).trim(); }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      var m = line.match(/https?:\/\/\S+/i);   // isian manual di sheet yang formatnya bebas
      if (!m) return null;
      url = m[0]; label = line.replace(m[0], '').replace(/[|\-–:]+\s*$/, '').trim();
    }
    return { label: label.slice(0, 80), url: url };
  }).filter(Boolean).slice(0, MAX_RESULTS);
}

function serializeResults_(list) {
  if (!Array.isArray(list)) throw new Error('Format link tidak valid');
  var out = [];
  list.forEach(function (x) {
    var url = String(x && x.url || '').trim(), label = String(x && x.label || '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 80);
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 1500) throw new Error('Link tidak valid: ' + url.slice(0, 60) + ' (harus diawali http:// atau https://)');
    out.push(label ? label + ' | ' + url : url);
  });
  if (out.length > MAX_RESULTS) throw new Error('Maksimal ' + MAX_RESULTS + ' link per task');
  return out.join('\n');
}

function cleanNote_(v) {
  v = String(v || '').replace(/\r\n/g, '\n').trim();
  if (v.length > 2000) throw new Error('Keterangan hasil maksimal 2000 karakter');
  return /^[=+\-@]/.test(v) ? "'" + v : v;   // cegah dibaca sebagai rumus di Sheets
}

/** Pemilik task (atau admin) mengatur link & keterangan hasil kerja. Anggota tidak bisa mengubah task yang sudah Done. */
function setResults_(me, taskId, results, note) {
  var value = serializeResults_(results || []);
  var noteVal = note === undefined || note === null ? undefined : cleanNote_(note);
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, taskId), sh = loc.sheet, row = loc.row;
    ensureHeaders_(sh, TASK_HEADERS);
    var col = colMap_(sh);
    var r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    if (me.role !== 'admin' && String(r[col['status']]).trim() === 'Done') throw new Error('Task ini sudah disetujui admin, link tidak bisa diubah lagi.');
    var ch = { 'result': value };
    if (noteVal !== undefined) ch['result note'] = noteVal;
    writeObj_(sh, row, ch);
    Object.keys(ch).forEach(function (k) { r[col[k]] = ch[k]; });
    log_(me, 'results', taskId, (results || []).length + ' link');
    return { task: rowTask_(r, null, col, sh, loc.user, row) };
  } finally { unlock_(lock); }
}

function resultsHtml_(t) {
  var note = t.resultNote ? '<div style="margin-top:6px;font-size:13px;color:#545a61;border-left:3px solid #c9d6e0;padding:2px 0 2px 8px;white-space:pre-wrap">' + esc_(String(t.resultNote).replace(/^'/, '')) + '</div>' : '';
  if (!t.results || !t.results.length) return note;
  return note + '<div style="margin-top:6px;font-size:13px">' + t.results.map(function (x) {
    return '<a href="' + esc_(x.url) + '" style="display:inline-block;margin:2px 6px 2px 0;padding:2px 9px;border:1px solid #c9d6e0;border-radius:999px;color:#255473;text-decoration:none">📎 ' + esc_(x.label || resultKind_(x.url)) + '</a>';
  }).join('') + '</div>';
}

function resultKind_(url) {
  var u = String(url).toLowerCase();
  if (u.indexOf('docs.google.com/document') >= 0) return 'Google Docs';
  if (u.indexOf('docs.google.com/spreadsheets') >= 0) return 'Google Sheets';
  if (u.indexOf('docs.google.com/presentation') >= 0) return 'Google Slides';
  if (u.indexOf('docs.google.com/forms') >= 0 || u.indexOf('forms.gle') >= 0) return 'Google Forms';
  if (u.indexOf('drive.google.com') >= 0) return 'Google Drive';
  if (u.indexOf('figma.com') >= 0) return 'Figma';
  if (u.indexOf('canva.com') >= 0) return 'Canva';
  return u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

// ===================== Alur task Artikel (8 tahap) =====================
var STAGE_NAMES = ['', 'Ditugaskan', 'Menyusun brief', 'Review brief', 'Menulis artikel', 'Review artikel', 'Publish', 'Cek ulang dengan AI', 'Review cek AI', 'Selesai'];
var STAGE_STATUS = ['', 'Backlog', 'On-Progress', 'Review', 'On-Progress', 'Review', 'On-Progress', 'On-Progress', 'Review', 'Done'];
var REVIEW_NEXT = { 3: 4, 5: 6, 8: 9 }, REVIEW_BACK = { 3: 2, 5: 4, 8: 7 };
var REVIEW_LABEL = { 3: 'brief', 5: 'artikel', 8: 'hasil cek AI' };

function typeName_(v) {
  v = String(v || '');
  return /request/i.test(v) ? 'Request' : /sosmed|social/i.test(v) ? 'Sosmed' : /artikel/i.test(v) && !/non/i.test(v) ? 'Artikel' : 'Non-artikel';
}
function isRequestRow_(r, col) { return col['type'] !== undefined && typeName_(r[col['type']]) === 'Request'; }
function isSocialRow_(r, col) { return col['type'] !== undefined && typeName_(r[col['type']]) === 'Sosmed'; }
function isArticleRow_(r, col) {
  var v = col['type'] === undefined ? '' : String(r[col['type']] || '');
  return /artikel/i.test(v) && !/non/i.test(v);
}
function parseStageLog_(v) {
  if (!v) return [];
  try { var a = JSON.parse(String(v)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

/** Pindah tahap: catat riwayat (dasar KPI), set status & cap waktu, antrekan sinkron project. */
function setStage_(sh, row, r, col, user, me, stage, extra) {
  var now = new Date(), log = parseStageLog_(r[col['stage log']]);
  if (!log.length) {   // task lama yang baru dijadikan artikel: anggap mulai saat Started At (atau sekarang)
    var t0 = isDate_(r[col['started at']]) ? r[col['started at']] : now;
    log.push({ s: Number(r[col['stage']]) || 1, t: t0.toISOString() });
  }
  log.push({ s: stage, t: now.toISOString(), by: me.username });
  var ch = Object.assign({ 'stage': stage, 'status': STAGE_STATUS[stage], 'stage log': JSON.stringify(log.slice(-80)) }, extra || {});
  if (STAGE_STATUS[stage] === 'Review') ch['review at'] = now;
  if (stage >= 2 && !r[col['started at']]) ch['started at'] = now;
  if (stage === 9) ch['done at'] = now; else if (r[col['done at']]) ch['done at'] = '';
  writeObj_(sh, row, ch);
  Object.keys(ch).forEach(function (k) { if (col[k] !== undefined) r[col[k]] = ch[k]; });
  queueProjectSync_([String(r[col['code']] || '')]);
  return rowTask_(r, null, col, sh, user, row);
}

function briefRowOfTask_(taskId) {
  var sh = sheet_(CFG.BRIEF_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var col = colMap_(sh);
  var cell = sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1).createTextFinder(String(taskId)).matchEntireCell(true).findNext();
  if (!cell) return null;
  var row = cell.getRow();
  return { sheet: sh, col: col, row: row, brief: rowBrief_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], col, row) };
}
function setBriefStatus_(taskId, status) {
  var f = briefRowOfTask_(taskId);
  if (f) f.sheet.getRange(f.row, f.col['status'] + 1).setValue(status);
}

/** Admin: ubah jenis banyak task sekaligus (Artikel / Non-artikel). Tahap awal artikel ditebak dari status. */
function bulkSetType_(me, ids, type) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Pilih minimal satu task');
  if (ids.length > 300) throw new Error('Maksimal 300 task sekali ubah');
  if (['Artikel', 'Non-artikel', 'Sosmed', 'Request'].indexOf(type) < 0) throw new Error('Jenis task tidak valid');
  var article = type === 'Artikel';
  var lock = lock_(30000);
  try {
    var out = [], failed = [];
    ids.forEach(function (id) {
      try {
        var loc = locateTask_(me, id), sh = loc.sheet;
        ensureHeaders_(sh, TASK_HEADERS);
        var col = colMap_(sh), r = sh.getRange(loc.row, 1, 1, sh.getLastColumn()).getValues()[0];
        if (typeName_(r[col['type']]) === type) { out.push(rowTask_(r, null, col, sh, loc.user, loc.row)); return; }
        writeObj_(sh, loc.row, { 'type': type });
        r[col['type']] = type;
        var task;
        if (article && !(Number(r[col['stage']]) > 0)) {
          var st = String(r[col['status']]).trim();
          task = setStage_(sh, loc.row, r, col, loc.user, me, st === 'Done' ? 9 : st === 'On-Progress' || st === 'Review' ? 2 : 1);
        } else task = rowTask_(r, null, col, sh, loc.user, loc.row);
        out.push(task);
      } catch (e) { failed.push(id); }
    });
    log_(me, 'bulk-type', '', out.length + ' task → ' + type);
    return { tasks: out, failed: failed };
  } finally { unlock_(lock); }
}

/** Langkah anggota di task Artikel. step: start | submitBrief | submitArticle | publish | submitAiCheck */
function advanceStage_(me, taskId, step, url) {
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, taskId), sh = loc.sheet, row = loc.row;
    ensureHeaders_(sh, TASK_HEADERS);
    var col = colMap_(sh), r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    if (!isArticleRow_(r, col)) throw new Error('Task ini bukan task artikel.');
    var stage = Number(r[col['stage']]) || 1, extra = {}, next;
    var need = function (want, what) { if (stage !== want) throw new Error('Task ini sedang di tahap "' + STAGE_NAMES[stage] + '", bukan tahap ' + what + '. Muat ulang data.'); };
    var cleanUrl = function (u, label) {
      u = String(u || '').trim();
      if (!/^https?:\/\/\S+$/i.test(u) || u.length > 1500) throw new Error(label + ' harus berupa link yang diawali http:// atau https://');
      return u;
    };
    if (step === 'start') { need(1, 'awal'); next = 2; }
    else if (step === 'submitBrief') {
      need(2, 'menyusun brief');
      var f = briefRowOfTask_(taskId);
      if (!f) throw new Error('Buat brief dulu sebelum diajukan.');
      var d = f.brief.data || {}, miss = [];
      if (!String(d.kwMain || '').trim()) miss.push('keyword utama');
      if (!String(d.h1 || '').trim()) miss.push('H1');
      if ((d.competitors || []).filter(function (c) { return c && String(c.url || '').trim(); }).length < MIN_COMPETITORS) miss.push('minimal ' + MIN_COMPETITORS + ' link kompetitor');
      if (!(d.sections || []).some(function (x) { return x && String(x.h2 || '').trim(); })) miss.push('minimal 1 H2');
      if (miss.length) throw new Error('Lengkapi brief dulu: ' + miss.join(', ') + '.');
      var briefLoc = f;
      next = 3;
    } else if (step === 'submitArticle') {
      need(4, 'menulis artikel');
      if (!parseResults_(r[col['result']]).length) throw new Error('Tambahkan link Docs artikel di "Hasil kerja" sebelum mengajukan review.');
      next = 5;
    } else if (step === 'publish') {
      need(6, 'publish'); extra['live url'] = cleanUrl(url, 'URL artikel yang sudah tayang'); next = 7;
    } else if (step === 'submitAiCheck') {
      need(7, 'cek ulang dengan AI'); extra['ai check url'] = cleanUrl(url, 'Link Docs hasil cek AI'); next = 8;
    } else throw new Error('Langkah tidak dikenal');
    var task = setStage_(sh, row, r, col, loc.user, me, next, extra);
    if (step === 'submitBrief') briefLoc.sheet.getRange(briefLoc.row, briefLoc.col['status'] + 1).setValue('Diajukan');   // setelah tahap benar-benar tersimpan
    log_(me, 'stage', taskId, stage + ' → ' + next);
    return { task: task };
  } finally { unlock_(lock); }
}

/** Admin: setujui (Done) atau kembalikan (On-Progress + alasan di Catatan) task yang direview. */
function reviewTask_(me, taskId, decision, reason, owner) {
  if (decision !== 'approve' && decision !== 'return') throw new Error('Keputusan review tidak valid');
  var rq = briefRowOfTask_(taskId);
  if (rq && rq.brief.type === 'Request') return requestAction_(me, rq.brief.id, decision, { text: reason });
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, taskId, owner), sh = loc.sheet, col = loc.col, row = loc.row;
    var r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    var now = new Date(), ch = {};
    if (isArticleRow_(r, col)) return reviewArticle_(me, loc, r, decision, reason);
    if (String(r[col['status']]).trim() !== 'Review') throw new Error('Task ini sudah tidak menunggu review (status sekarang: ' + (String(r[col['status']]).trim() || 'Backlog') + '). Data dimuat ulang.');
    if (decision === 'approve') {
      ch['status'] = 'Done'; ch['done at'] = now;
      if (!r[col['review at']]) ch['review at'] = now;
    } else {
      ch['status'] = 'On-Progress'; ch['done at'] = ''; ch['review at'] = '';
      reason = String(reason || '').trim().slice(0, 500);
      var stamp = Utilities.formatDate(now, tz_(), 'd MMM HH:mm');
      var line = '[Dikembalikan ' + stamp + ' oleh ' + me.name + ']' + (reason ? ' ' + reason : '');
      var old = String(r[col['notes']] || '').trim();
      ch['notes'] = old ? old + '\n' + line : line;
    }
    writeObj_(sh, row, ch);
    Object.keys(ch).forEach(function (k) { r[col[k]] = ch[k]; });
    log_(me, 'review-' + decision, taskId, reason || '');
    var task = rowTask_(r, null, col, sh, loc.user, row);
    if (decision === 'return' && loc.user.email && loc.user.active) {
      try {
        MailApp.sendEmail({
          to: loc.user.email, name: 'Project Tracker',
          subject: '↩️ Task dikembalikan: ' + shortTitle_(task.task),
          htmlBody: emailShell_('Halo ' + esc_(loc.user.name) + ',', 'Task berikut <b>dikembalikan</b> oleh ' + esc_(me.name) +
            ' untuk diperbaiki' + (reason ? ':<br><i>' + esc_(reason) + '</i>' : '.') + taskTableHtml_([task]))
        });
      } catch (e) { /* email tidak boleh menggagalkan keputusan */ }
    }
    var brief = null;
    if (task.type === 'Sosmed') {
      brief = mirrorSocialBrief_(taskId, task.status, me);
      if (brief && decision === 'approve') emailSocialDone_(me, brief, task);
    }
    queueProjectSync_([task.code]);
    return brief ? { task: task, brief: brief } : { task: task };
  } finally { unlock_(lock); }
}

/** Review admin untuk task Artikel di tahap 3 (brief), 5 (artikel), 8 (hasil cek AI). */
function reviewArticle_(me, loc, r, decision, reason) {
  var sh = loc.sheet, col = colMap_(sh), row = loc.row, stage = Number(r[col['stage']]) || 0, taskId = String(r[col['task id']]);
  // Status "Review" tapi tahap belum ikut naik (mis. status diubah langsung di spreadsheet): anggap sedang di tahap review berikutnya
  if (!REVIEW_NEXT[stage] && String(r[col['status']]).trim() === 'Review' && REVIEW_NEXT[stage + 1]) stage = stage + 1;
  if (!REVIEW_NEXT[stage]) throw new Error('Task ini sedang di tahap "' + (STAGE_NAMES[stage] || '-') + '", tidak ada yang perlu direview — mungkin sudah diputuskan sebelumnya. Data dimuat ulang.');
  var extra = {}, what = REVIEW_LABEL[stage], next;
  reason = String(reason || '').trim().slice(0, 500);
  if (decision === 'approve') {
    next = REVIEW_NEXT[stage];
    if (stage === 3) setBriefStatus_(taskId, 'Disetujui');
  } else {
    next = REVIEW_BACK[stage];
    var stamp = Utilities.formatDate(new Date(), tz_(), 'd MMM HH:mm');
    var line = '[' + what.charAt(0).toUpperCase() + what.slice(1) + ' dikembalikan ' + stamp + ' oleh ' + me.name + ']' + (reason ? ' ' + reason : '');
    var old = String(r[col['notes']] || '').trim();
    extra['notes'] = old ? old + '\n' + line : line;
    if (stage === 3) setBriefStatus_(taskId, 'Dikembalikan');
  }
  var task = setStage_(sh, row, r, col, loc.user, me, next, extra);
  log_(me, 'review-' + decision, taskId, what + (reason ? ': ' + reason : ''));
  if (loc.user.email && loc.user.active) {
    var subj = decision === 'approve'
      ? (stage === 8 ? '✅ Artikel selesai: ' : '✅ ' + what.charAt(0).toUpperCase() + what.slice(1) + ' disetujui: ') + shortTitle_(task.task)
      : '↩️ ' + what.charAt(0).toUpperCase() + what.slice(1) + ' dikembalikan: ' + shortTitle_(task.task);
    var body = decision === 'approve'
      ? (stage === 8 ? 'Hasil cek AI disetujui ' + esc_(me.name) + '. Task ditandai <b>Done</b>. Terima kasih!' : esc_(what.charAt(0).toUpperCase() + what.slice(1)) + ' disetujui ' + esc_(me.name) + '. Lanjut ke tahap <b>' + esc_(STAGE_NAMES[next]) + '</b>.')
      : esc_(what.charAt(0).toUpperCase() + what.slice(1)) + ' <b>dikembalikan</b> oleh ' + esc_(me.name) + (reason ? ':<br><i>' + esc_(reason) + '</i>' : '.');
    try { MailApp.sendEmail({ to: loc.user.email, name: 'Project Tracker', subject: subj, htmlBody: emailShell_('Halo ' + esc_(loc.user.name) + ',', body + taskTableHtml_([task])) }); }
    catch (e) { /* email tidak boleh menggagalkan keputusan */ }
  }
  return { task: task };
}

/** Menjaga Started At / Done At konsisten dengan status.
 *  stampDoneNow=true: tombol Done ditekan → waktu selesai = sekarang. */
function syncStamps_(sh, row, status, stampDoneNow) {
  if (!row) return;
  var col = colMap_(sh), now = new Date();
  var started = sh.getRange(row, col['started at'] + 1);
  var done = sh.getRange(row, col['done at'] + 1);
  if ((status === 'On-Progress' || status === 'Review') && !started.getValue()) {
    started.setValue(now).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  if (status === 'Done') {
    if (stampDoneNow || !done.getValue()) done.setValue(now).setNumberFormat('yyyy-mm-dd hh:mm');
  } else if (done.getValue()) {
    done.clearContent();
  }
}

function findRowById_(sh, id) {
  var col = colMap_(sh);
  if (sh.getLastRow() < 2) return 0;
  var cell = sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function deleteTask_(me, taskId) {
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, taskId);
    var title = loc.sheet.getRange(loc.row, loc.col['task'] + 1).getValue();
    var code = String(loc.sheet.getRange(loc.row, loc.col['code'] + 1).getValue() || '').trim();
    trashRowEvents_(loc.sheet, loc.row);
    loc.sheet.deleteRow(loc.row);
    log_(me, 'delete-task', taskId, title);
    queueProjectSync_([code]);
    return { ok: true };
  } finally { unlock_(lock); }
}

/** Isi Task ID yang kosong, dan catat Task ID ganda (biasanya baris yang disalin di spreadsheet) untuk dilaporkan. */
function assignMissingIds_(sh, seen) {
  seen = seen || {};
  var col = colMap_(sh);
  if (sh.getLastRow() < 2 || col['task'] === undefined) return;
  var n = sh.getLastRow() - 1;
  var titles = sh.getRange(2, col['task'] + 1, n, 1).getValues();
  var idRange = sh.getRange(2, col['task id'] + 1, n, 1);
  var ids = idRange.getValues();
  var changed = false;
  for (var i = 0; i < n; i++) {
    var id = String(ids[i][0]).trim();
    if (String(titles[i][0]).trim() && !id) { ids[i][0] = newId_(); changed = true; }
    else if (id && String(titles[i][0]).trim()) { if (seen[id]) seen[id].push(sh.getName() + ' baris ' + (i + 2)); else seen[id] = [sh.getName() + ' baris ' + (i + 2)]; }
  }
  if (changed) idRange.setValues(ids);
  ['start time', 'end time'].forEach(function (k) {
    sh.getRange(1, col[k] + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function formatTaskRow_(sh, row) {
  var col = colMap_(sh);
  formatDateCells_(sh, row, [col['start date'], col['end date']]);
  sh.getRange(row, col['start time'] + 1).setNumberFormat('@');
  sh.getRange(row, col['end time'] + 1).setNumberFormat('@');
  [col['started at'], col['done at']].forEach(function (c) {
    sh.getRange(row, c + 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
}

function formatDateCells_(sh, row, cols) {
  cols.forEach(function (c) {
    if (c !== undefined) sh.getRange(row, c + 1).setNumberFormat('d mmmm yyyy');
  });
}

function newId_() {
  return 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ===================== Normalisasi tanggal/jam =====================
var MONTHS_ = {
  jan: 0, january: 0, januari: 0, feb: 1, february: 1, februari: 1, mar: 2, march: 2, maret: 2,
  apr: 3, april: 3, may: 4, mei: 4, jun: 5, june: 5, juni: 5, jul: 6, july: 6, juli: 6,
  aug: 7, august: 7, agu: 7, agustus: 7, agt: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11, des: 11, desember: 11
};

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }

/** Mengembalikan 'yyyy-MM-dd' atau '' (untuk 'TBD', 'Recurring', kosong). */
function normDate_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?$/);
  if (m && MONTHS_[m[2]] !== undefined) {
    var y = m[3] || Utilities.formatDate(new Date(), tz_(), 'yyyy');
    return y + '-' + pad_(MONTHS_[m[2]] + 1) + '-' + pad_(m[1]);
  }
  return '';
}

function normTime_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'HH:mm');
  var m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? pad_(m[1]) + ':' + m[2] : '';
}

function normStamp_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  return '';
}

function toDateCell_(iso) {
  var s = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // biarkan teks seperti "TBD" / "Recurring"
  return Utilities.parseDate(s, tz_(), 'yyyy-MM-dd');
}


// ===================== Kunci & penulisan aman =====================
/** Kunci antarpermintaan. Bila server sedang sibuk, pesan yang jelas (bukan "Lock timeout"). */
function lock_(ms) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(Math.max(ms || 0, 30000))) throw new Error('Server sedang sibuk menyimpan perubahan lain. Coba lagi beberapa detik lagi.');
  return l;
}
/** Tulis ke spreadsheet dulu (flush) sebelum kunci dilepas, agar permintaan berikutnya membaca data terbaru. */
function unlock_(l) {
  try { SpreadsheetApp.flush(); } catch (e) { /* abaikan */ }
  try { l.releaseLock(); } catch (e) { /* abaikan */ }
}
/** Baris masih berisi task yang sama? (baris bisa bergeser bila task dipindah/dihapus saat pengingat berjalan) */
function sameRow_(sh, row, col, r) {
  if (col['task id'] === undefined) return true;
  var id = String(r[col['task id']] || '');
  return !!id && String(sh.getRange(row, col['task id'] + 1).getValue()) === id;
}
function setReminded_(sh, row, r, col, sent) {
  if (!sameRow_(sh, row, col, r)) return;
  var v = sent.slice(-6).join(',');
  sh.getRange(row, col['reminded'] + 1).setValue(v);
  r[col['reminded']] = v;
}

// ===================== Helper sheet =====================
function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Tambah header yang belum ada di akhir baris 1 — tidak menggeser kolom lama. */
function ensureHeaders_(sh, headers) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var missing = headers.filter(function (h) { return row.indexOf(h.toLowerCase()) < 0; });
  if (!missing.length) return;
  var start = row.join('') === '' ? 1 : sh.getLastColumn() + 1;
  if (start + missing.length - 1 > sh.getMaxColumns()) {
    sh.insertColumnsAfter(sh.getMaxColumns(), start + missing.length - 1 - sh.getMaxColumns());
  }
  sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
  delete MEMO_.cols[sh.getName()];
}

function colMap_(sh) {
  var name = sh.getName();
  if (MEMO_.cols[name]) return MEMO_.cols[name];
  var row = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) {
    var k = String(h).trim().toLowerCase();
    if (k && map[k] === undefined) map[k] = i;
  });
  MEMO_.cols[name] = map;
  return map;
}

function appendObj_(sh, obj) {
  var col = colMap_(sh);
  var arr = [];
  for (var i = 0; i < sh.getLastColumn(); i++) arr.push('');
  Object.keys(obj).forEach(function (k) { if (col[k] !== undefined) arr[col[k]] = obj[k]; });
  // cari baris kosong pertama berdasarkan kolom pertama yang terisi (hindari baris format kosong)
  var row = lastDataRow_(sh) + 1;
  sh.getRange(row, 1, 1, arr.length).setValues([arr]);
  return row;
}

/** Tulis beberapa kolom dalam satu baris. Bila dropdown Status di sheet menolak nilai baru (mis. "Review"),
 *  daftar dropdown-nya dilengkapi otomatis lalu penulisan diulang sekali. */
function writeObj_(sh, row, obj) {
  try { writeObjRaw_(sh, row, obj); }
  catch (e) {
    if (obj.status === undefined || !/validation|validasi|aturan/i.test(String(e && e.message))) throw e;
    fixStatusValidation_(sh);
    writeObjRaw_(sh, row, obj);
  }
}
var STATUS_LIST = ['Backlog', 'On-Progress', 'Review', 'Hold', 'On-Hold', 'Done', 'Recurring'];
/** Dropdown kolom Status harus memuat semua status aplikasi (termasuk Review). Warna chip bawaan dropdown tidak bisa diatur dari Apps Script. */
function fixStatusValidation_(sh) {
  var col = colMap_(sh)['status'];
  if (col === undefined || sh.getMaxRows() < 2) return false;
  var rng = sh.getRange(2, col + 1, sh.getMaxRows() - 1, 1), cur = rng.getCell(1, 1).getDataValidation();
  if (!cur) return false;
  var vals = cur.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST ? (cur.getCriteriaValues()[0] || []) : [];
  if (STATUS_LIST.every(function (v) { return vals.indexOf(v) >= 0; })) return false;
  var list = vals.concat(STATUS_LIST.filter(function (v) { return vals.indexOf(v) < 0; }));
  rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
  return true;
}
function writeObjRaw_(sh, row, obj) {
  var col = colMap_(sh), cells = {};
  Object.keys(obj).forEach(function (k) { if (col[k] !== undefined) cells[col[k]] = obj[k]; });
  var idx = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i < idx.length;) {
    var j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    var vals = [];
    for (var k = i; k <= j; k++) vals.push(cells[idx[k]]);
    sh.getRange(row, idx[i] + 1, 1, vals.length).setValues([vals]);
    i = j + 1;
  }
}

function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var vals = sh.getRange(1, 1, last, Math.min(sh.getLastColumn(), 3)).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i].join('').trim() !== '') return i + 1;
  }
  return 1;
}

function log_(me, action, taskId, detail) {
  try {
    var sh = getOrCreateSheet_(CFG.LOG_SHEET, LOG_HEADERS);
    sh.appendRow([new Date(), me.username, action, taskId || '', detail || '']);
  } catch (e) { /* log tidak boleh menggagalkan aksi */ }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1; }
function pad_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function slug_(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ''); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

// ===================== Google Calendar & email pengingat =====================
// Setiap task (yang punya tanggal dan penanggung jawab ber-email) dibuat 2 event
// di kalender "Project Tracker" milik pemilik script, dengan penanggung jawab
// sebagai tamu — sehingga muncul di Google Calendar orang itu beserta notifikasinya:
//   ▶ <task>          di jam mulai
//   ⏰ Deadline: <task> berakhir tepat di jam deadline
// Ditambah email: pengingat deadline ≤ 24 jam, email saat lewat deadline,
// dan ringkasan pagi (Senin–Jumat).

function calEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIF_ON') === '1';
}

/** Jalankan efek samping Calendar tanpa pernah menggagalkan aksi utama. */
function afterChange_(fn) {
  if (!calEnabled_()) return;
  try { fn(); } catch (e) { Logger.log('Calendar: ' + e); }
}

function installNotifications() {
  resetMemo_();
  var props = PropertiesService.getScriptProperties();
  getCalendar_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runReminders', 'sendDailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runReminders').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(CFG.DIGEST_HOUR).everyDays(1).inTimezone(tz_()).create();
  props.setProperty('NOTIF_ON', '1');
  readUsers_().forEach(function (u) { if (u.sheetName) ensureHeaders_(sheet_(u.sheetName), TASK_HEADERS); });
  runReminders();
  var missing = readUsers_().filter(function (u) { return u.sheetName && u.active && !u.email; })
    .map(function (u) { return u.name; });
  var msg = 'Calendar & email pengingat aktif.\n\nCalendar & email disinkronkan otomatis tiap 5 menit. ' +
    'Ringkasan pagi dikirim pukul ' + CFG.DIGEST_HOUR + ':00 (Senin–Jumat).\n\n' +
    'PENTING: Deploy ulang Web App (Deploy > Manage deployments > Edit > New version) agar izin baru berlaku.';
  if (missing.length) msg += '\n\nBelum punya email (isi di aplikasi > Pengguna, atau kolom Email di tab Users):\n• ' + missing.join('\n• ');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function disableNotifications() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runReminders', 'sendDailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().setProperty('NOTIF_ON', '0');
  try { SpreadsheetApp.getUi().alert('Pengingat dimatikan. Event yang sudah ada di Calendar tidak dihapus.'); } catch (e) { /* trigger */ }
}

function getCalendar_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CAL_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar(CFG.CAL_NAME, {
      summary: 'Jadwal task dari Project Tracker — dibuat otomatis, jangan diedit manual.',
      color: CalendarApp.Color.TEAL
    });
    props.setProperty('CAL_ID', cal.getId());
  }
  return cal;
}

function rememberAppUrl_(url) {
  if (!url || !/^https:\/\/[^\s]+$/.test(url)) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('APP_URL') !== url) props.setProperty('APP_URL', url);
}
function appUrl_() { return PropertiesService.getScriptProperties().getProperty('APP_URL') || ''; }

function cleanEmail_(e) {
  e = String(e || '').trim().toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Format email tidak valid: ' + e);
  return e;
}

function setMyEmail_(me, email) {
  var lock = lock_(20000);
  try {
    var sh = sheet_(CFG.USERS_SHEET);
    ensureHeaders_(sh, USER_HEADERS);
    sh.getRange(me.row, colMap_(sh)['email'] + 1).setValue(cleanEmail_(email));
    invalidateUsers_();
    var u = findUser_(me.username);
    return { user: publicUser_(u) };
  } finally { unlock_(lock); }
}

/** Waktu mulai & deadline (Date) sesuai zona waktu spreadsheet; jam default 09:00 / 18:00. */
function taskTimes_(t) {
  var tz = tz_();
  var at = function (d, time, def) {
    return d ? Utilities.parseDate(d + ' ' + (time || def), tz, 'yyyy-MM-dd HH:mm') : null;
  };
  return { start: at(t.startDate, t.startTime, '09:00'), end: at(t.endDate, t.endTime, '18:00') };
}

function wantsReminders_(t) {
  return ['Done', 'Hold', 'Recurring', 'Review'].indexOf(t.status) < 0;
}

function syncRow_(sh, row, user) {
  if (!row) return;
  var col = colMap_(sh);
  var r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  syncValues_(sh, row, r, col, user, getCalendar_());
}

function syncSheet_(user) {
  var sh = sheet_(user.sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  ensureHeaders_(sh, TASK_HEADERS);
  var col = colMap_(sh), cal = getCalendar_();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  vals.forEach(function (r, i) { syncValues_(sh, i + 2, r, col, user, cal); });
}

/** Membuat/menghapus event Calendar untuk satu baris bila datanya berubah. */
function syncValues_(sh, row, r, col, user, cal) {
  if (col['cal sync'] === undefined) return;
  var t = rowTask_(r, null, col, sh, user, row);
  var curSig = String(r[col['cal sync']] || '');
  var ids = [String(r[col['cal start id']] || ''), String(r[col['cal due id']] || '')];
  var tm = t ? taskTimes_(t) : {};
  var want = t && user.active && user.email && wantsReminders_(t) && (tm.start || tm.end);
  var sig = want ? [user.email, t.code, t.task, tm.start ? tm.start.getTime() : '', tm.end ? tm.end.getTime() : ''].join('|') : '';
  if (sig === curSig) return;

  ids.forEach(function (id) { deleteEvent_(cal, id); });
  var newIds = ['', ''];
  if (want) {
    var label = (t.code ? '[' + t.code + '] ' : '') + t.task;
    var desc = 'Penanggung jawab: ' + user.name +
      (tm.start ? '\nMulai: ' + Utilities.formatDate(tm.start, tz_(), 'EEE, d MMM yyyy HH:mm') : '') +
      (tm.end ? '\nDeadline: ' + Utilities.formatDate(tm.end, tz_(), 'EEE, d MMM yyyy HH:mm') : '') +
      (t.notes ? '\nCatatan: ' + t.notes : '') +
      (appUrl_() ? '\n\nTandai selesai di Project Tracker: ' + appUrl_() : '');
    var opts = { description: desc, guests: user.email, sendInvites: CFG.SEND_INVITES };
    if (tm.start && (!tm.end || tm.start < tm.end)) {
      var se = new Date(tm.start.getTime() + CFG.START_EVENT_MIN * 60000);
      if (tm.end && se > tm.end) se = tm.end;
      var ev1 = cal.createEvent('▶ ' + label, tm.start, se, opts);
      ev1.removeAllReminders(); // pengingat di kalender pemilik script tidak perlu
      newIds[0] = ev1.getId();
    }
    if (tm.end) {
      var ds = new Date(tm.end.getTime() - CFG.DUE_EVENT_MIN * 60000);
      var ev2 = cal.createEvent('⏰ Deadline: ' + label, ds, tm.end, opts);
      ev2.removeAllReminders();
      newIds[1] = ev2.getId();
    }
  }
  if (!sameRow_(sh, row, col, r)) { newIds.forEach(function (id) { deleteEvent_(cal, id); }); return; }   // baris bergeser → ulangi di putaran berikut
  writeObj_(sh, row, { 'cal start id': newIds[0], 'cal due id': newIds[1], 'cal sync': sig });
}

function deleteEvent_(cal, id) {
  if (!id) return;
  try { var ev = cal.getEventById(id); if (ev) ev.deleteEvent(); } catch (e) { /* sudah terhapus */ }
}

/** Simpan ID event dari baris yang akan dihapus; dihapus dari Calendar oleh trigger berikutnya. */
function trashRowEvents_(sh, row) {
  if (!calEnabled_()) return;
  var col = colMap_(sh);
  if (col['cal start id'] === undefined) return;
  var ids = [sh.getRange(row, col['cal start id'] + 1).getValue(), sh.getRange(row, col['cal due id'] + 1).getValue()]
    .map(String).filter(function (x) { return x && x !== 'undefined'; });
  if (!ids.length) return;
  var props = PropertiesService.getScriptProperties();
  var list = JSON.parse(props.getProperty('CAL_TRASH') || '[]').concat(ids).slice(-300);
  props.setProperty('CAL_TRASH', JSON.stringify(list));
}

function emptyCalTrash_(cal) {
  var props = PropertiesService.getScriptProperties();
  var list = JSON.parse(props.getProperty('CAL_TRASH') || '[]');
  if (!list.length) return;
  list.forEach(function (id) { deleteEvent_(cal, id); });
  props.setProperty('CAL_TRASH', '[]');
}

function deleteRowEvents_(sh, row) {
  var col = colMap_(sh);
  if (col['cal start id'] === undefined) return;
  var cal = getCalendar_();
  deleteEvent_(cal, String(sh.getRange(row, col['cal start id'] + 1).getValue() || ''));
  deleteEvent_(cal, String(sh.getRange(row, col['cal due id'] + 1).getValue() || ''));
}

/** Trigger 15 menit: sinkron Calendar (termasuk edit langsung di sheet) + email pengingat. */
function runReminders() {
  resetMemo_();
  if (!calEnabled_()) return;
  // Tidak memegang kunci global selama sinkron Calendar (bisa lama) supaya simpan/acc anggota & admin tidak tertahan.
  // Penulisan per baris dicek ulang Task ID-nya (sameRow_). Putaran yang tumpang-tindih dicegah dengan penanda waktu.
  var props = PropertiesService.getScriptProperties(), running = Number(props.getProperty('REM_RUNNING') || 0);
  if (running && Date.now() - running < 6 * 60000) return;
  props.setProperty('REM_RUNNING', String(Date.now()));
  try {
    var cal = getCalendar_(), now = new Date(), newReviews = [];
    emptyCalTrash_(cal);
    personSheets_().forEach(function (p) {
      var sh = p.sheet;
      if (sh.getLastRow() < 2) return;
      ensureHeaders_(sh, TASK_HEADERS);
      var col = colMap_(sh);
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      var old = now.getTime() - 14 * 864e5;
      vals.forEach(function (r, i) {
        try {
          // task Done > 14 hari: event Calendar-nya sudah dihapus, tidak ada pengingat → lewati agar cepat
          if (String(r[col['status']]).trim() === 'Done' && isDate_(r[col['done at']]) && r[col['done at']].getTime() < old && !r[col['cal start id']] && !r[col['cal due id']]) return;
          syncValues_(sh, i + 2, r, col, p.user, cal);
          emailReminder_(sh, i + 2, r, col, p.user, now);
          collectReview_(sh, i + 2, r, col, p.user, newReviews);
        } catch (e) { Logger.log(sh.getName() + ' baris ' + (i + 2) + ': ' + e); }
      });
    });
    if (newReviews.length) emailReviewsToAdmins_(newReviews);
    var lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
      try {
        props.deleteProperty('PROJ_SYNC');
        if (syncProjectStatus_(null).length) dataCacheClear_();   // semua project, termasuk perubahan yang diketik langsung di spreadsheet
      } finally { unlock_(lock); }
    }
  } finally { props.deleteProperty('REM_RUNNING'); }
}

/** Catat task Review yang belum diberitahukan ke admin (sekali per pengajuan). */
function collectReview_(sh, row, r, col, user, out) {
  if (col['reminded'] === undefined || col['review at'] === undefined) return;
  if (String(r[col['status']]).trim() !== 'Review' || !isDate_(r[col['review at']])) return;
  if (isRequestRow_(r, col)) return;   // request disetujui pembuatnya, bukan admin
  var key = 'review|' + r[col['review at']].getTime();
  var sent = String(r[col['reminded']] || '').split(',').filter(String);
  if (sent.indexOf(key) >= 0) return;
  out.push(rowTask_(r, null, col, sh, user, row));
  sent.push(key);
  setReminded_(sh, row, r, col, sent);
}

function emailReviewsToAdmins_(tasks) {
  readUsers_().filter(function (u) { return u.role === 'admin' && u.email && u.active; }).forEach(function (a) {
    try {
      MailApp.sendEmail({
        to: a.email, name: 'Project Tracker',
        subject: '🔎 ' + tasks.length + ' task menunggu review',
        htmlBody: emailShell_('Halo ' + esc_(a.name) + ',', 'Task berikut diajukan untuk direview. Buka menu <b>Review</b> di Project Tracker untuk menyetujui atau mengembalikan.' + taskTableHtml_(tasks, true))
      });
    } catch (e) { Logger.log('Email review: ' + e); }
  });
}

function emailReminder_(sh, row, r, col, user, now) {
  if (!user.email || !user.active || col['reminded'] === undefined) return;
  var t = rowTask_(r, null, col, sh, user, row);
  if (!t || !wantsReminders_(t)) return;
  var end = taskTimes_(t).end;
  if (!end) return;
  var endKey = Utilities.formatDate(end, tz_(), "yyyy-MM-dd'T'HH:mm");
  var left = end.getTime() - now.getTime();
  var key = null, subject = null, intro = null;
  if (left > 0 && left <= CFG.EMAIL_DUE_HOURS * 36e5) {
    key = 'due|' + endKey;
    subject = '⏰ Deadline ' + humanLeft_(left) + ' lagi: ' + shortTitle_(t.task);
    intro = 'Task berikut akan mencapai deadline dalam <b>' + humanLeft_(left) + '</b>.';
  } else if (left <= 0 && -left < 48 * 36e5) {
    key = 'overdue|' + endKey;
    subject = '⚠️ Lewat deadline: ' + shortTitle_(t.task);
    intro = 'Task berikut sudah <b>melewati deadline</b> dan belum ditandai Done.';
  }
  if (!key) return;
  var sent = String(r[col['reminded']] || '').split(',').filter(String);
  if (sent.indexOf(key) >= 0) return;
  MailApp.sendEmail({
    to: user.email, subject: subject, name: 'Project Tracker',
    htmlBody: emailShell_('Halo ' + esc_(user.name) + ',', intro + taskTableHtml_([t]))
  });
  sent.push(key);
  setReminded_(sh, row, r, col, sent);
}

/** Trigger harian: ringkasan pagi untuk setiap orang + rekap tim untuk admin. */
function sendDailyDigest() {
  resetMemo_();
  if (!calEnabled_()) return;
  var tz = tz_(), now = new Date();
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1=Senin … 7=Minggu
  if (dow >= 6) return;
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var teamOverdue = [];
  personSheets_().forEach(function (p) {
    var open = readTaskSheet_(p.sheet, p.user).filter(wantsReminders_);
    var overdue = open.filter(function (t) { var e = taskTimes_(t).end; return e && e < now; });
    var dueToday = open.filter(function (t) { return t.endDate === today && overdue.indexOf(t) < 0; });
    var startToday = open.filter(function (t) { return t.startDate === today && t.endDate !== today && t.status !== 'On-Progress'; });
    teamOverdue = teamOverdue.concat(overdue);
    if (!p.user.email || !p.user.active || !(overdue.length + dueToday.length + startToday.length)) return;
    var body = '';
    if (overdue.length) body += '<h3 style="color:#c93636;margin:18px 0 6px">Terlambat (' + overdue.length + ')</h3>' + taskTableHtml_(overdue);
    if (dueToday.length) body += '<h3 style="margin:18px 0 6px">Deadline hari ini (' + dueToday.length + ')</h3>' + taskTableHtml_(dueToday);
    if (startToday.length) body += '<h3 style="margin:18px 0 6px">Mulai hari ini (' + startToday.length + ')</h3>' + taskTableHtml_(startToday);
    MailApp.sendEmail({
      to: p.user.email, name: 'Project Tracker',
      subject: '☀️ Task hari ini: ' + dueToday.length + ' deadline' + (overdue.length ? ', ' + overdue.length + ' terlambat' : ''),
      htmlBody: emailShell_('Selamat pagi, ' + esc_(p.user.name) + '!', body)
    });
  });
  if (!teamOverdue.length) return;
  readUsers_().filter(function (u) { return u.role === 'admin' && u.email && u.active; }).forEach(function (a) {
    MailApp.sendEmail({
      to: a.email, name: 'Project Tracker',
      subject: '📋 Rekap tim: ' + teamOverdue.length + ' task terlambat',
      htmlBody: emailShell_('Rekap pagi tim', 'Task yang melewati deadline dan belum Done:' + taskTableHtml_(teamOverdue, true))
    });
  });
}

function taskTableHtml_(tasks, withOwner) {
  var td = 'style="padding:8px 10px;border-bottom:1px solid #e3e4df;vertical-align:top"';
  var rows = tasks.map(function (t) {
    var tm = taskTimes_(t);
    return '<tr>' + (withOwner ? '<td ' + td + '><b>' + esc_(t.ownerName) + '</b></td>' : '') +
      '<td ' + td + '>' + (t.code ? '<span style="font-family:monospace;background:#f1f2ef;padding:1px 6px;border-radius:8px">' + esc_(t.code) + '</span> ' : '') +
      (/^https?:\/\//.test(t.task) ? '<a href="' + esc_(t.task) + '">' + esc_(t.task.replace(/^https?:\/\/(www\.)?/, '')) + '</a>' : esc_(t.task)) +
      (t.type === 'Artikel' && t.stage ? '<div style="font-size:12px;color:#2f6f9e;margin-top:3px">Tahap ' + t.stage + ' · ' + esc_(STAGE_NAMES[t.stage] || '') + (t.liveUrl ? ' · <a href="' + esc_(t.liveUrl) + '">URL live</a>' : '') + (t.aiCheckUrl ? ' · <a href="' + esc_(t.aiCheckUrl) + '">Hasil cek AI</a>' : '') + '</div>' : '') +
      resultsHtml_(t) + '</td>' +
      '<td ' + td + ' nowrap>' + (tm.end ? Utilities.formatDate(tm.end, tz_(), 'd MMM, HH:mm') : '–') + '</td></tr>';
  }).join('');
  return '<table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:8px">' +
    '<tr style="color:#8a8c90;font-size:12px;text-align:left">' + (withOwner ? '<th style="padding:6px 10px">PIC</th>' : '') +
    '<th style="padding:6px 10px">Task</th><th style="padding:6px 10px">Deadline</th></tr>' + rows + '</table>';
}

function emailShell_(greeting, body) {
  var url = appUrl_();
  return '<div style="font-family:Segoe UI,Arial,sans-serif;color:#17181a;max-width:620px">' +
    '<p style="font-size:15px">' + greeting + '</p>' + body +
    (url ? '<p style="margin-top:22px"><a href="' + esc_(url) + '" style="background:#255473;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Buka Project Tracker</a></p>' : '') +
    '<p style="color:#8a8c90;font-size:12px;margin-top:22px">Email otomatis dari Project Tracker.</p></div>';
}

function humanLeft_(ms) {
  var min = Math.round(ms / 60000);
  if (min < 60) return min + ' menit';
  if (min < 48 * 60) return Math.round(min / 60) + ' jam';
  return Math.round(min / 1440) + ' hari';
}
function shortTitle_(s) {
  s = String(s).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return s.length > 70 ? s.slice(0, 67) + '…' : s;
}


// ===================== Brief artikel =====================
var BRIEF_TYPES = ['Informasional', 'Consideration', 'Conversion'];   // jenis konten
var MIN_COMPETITORS = 2;
var BRIEF_MAX_CHARS = 45000;   // satu sel Sheets maksimal 50.000 karakter

function briefSheet_() {
  var sh = getOrCreateSheet_(CFG.BRIEF_SHEET, BRIEF_HEADERS);
  ensureHeaders_(sh, BRIEF_HEADERS);
  return sh;
}

function safeCell_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }

function readBriefs_() {
  var sh = sheet_(CFG.BRIEF_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = [];
  vals.forEach(function (r, i) { var b = rowBrief_(r, col, i + 2); if (b) out.push(b); });
  return out;
}

function rowBrief_(r, col, row) {
  var g = function (k) { return col[k] === undefined ? '' : r[col[k]]; };
  var id = String(g('brief id') || '').trim();
  if (!id) return null;
  var data = {};
  try { data = JSON.parse(String(g('data') || '{}')) || {}; } catch (e) { data = {}; }
  return {
    id: id, row: row, taskId: String(g('task id') || '').trim(), owner: String(g('owner') || ''),
    createdBy: String(g('created by') || ''), type: String(g('type') || 'Informasional'),
    status: String(g('status') || 'Draft'),
    keyword: String(g('keyword') || '').replace(/^'(?=[=+\-@])/, ''),
    title: String(g('title') || '').replace(/^'(?=[=+\-@])/, ''),
    data: data, docUrl: String(g('doc url') || ''),
    createdAt: normStamp_(g('created at')), updatedAt: normStamp_(g('updated at')), updatedBy: String(g('updated by') || ''),
    statusAt: normStamp_(g('status at'))
  };
}

/** Ringkasan brief untuk daftar (isi lengkap diambil saat brief dibuka). */
function briefSummary_(b) {
  if (b.type === 'Sosmed') return socialSummary_(b);
  if (b.type === 'Request') return requestSummary_(b);
  var d = b.data || {}, filled = function (x) { return String(x == null ? '' : x).trim() !== ''; };
  var nH2 = Array.isArray(d.sections) ? d.sections.filter(function (x) { return x && filled(x.h2); }).length
    : (d.outline || []).filter(function (o) { return o && o.level !== 1 && o.level !== 3 && filled(o.heading); }).length;
  return {
    id: b.id, row: b.row, taskId: b.taskId, owner: b.owner, createdBy: b.createdBy, type: b.type, status: b.status,
    keyword: b.keyword, title: b.title, docUrl: b.docUrl, createdAt: b.createdAt, updatedAt: b.updatedAt, updatedBy: b.updatedBy, summary: true,
    data: { kwMain: d.kwMain || '', h1: d.h1 || '', contentType: d.contentType || '', wordEst: d.wordEst || '', ctaPage: d.ctaPage || '',
      nH2: nH2, nComp: (d.competitors || []).filter(function (x) { return x && filled(x.url); }).length,
      nFaq: (d.faq || []).filter(function (x) { return x && filled(typeof x === 'string' ? x : x.q); }).length, nSecondary: (d.kwSecondary || []).length }
  };
}

function findBrief_(id) {
  var sh = briefSheet_(), col = colMap_(sh);
  if (!id || sh.getLastRow() < 2) throw new Error('Brief tidak ditemukan');
  var cell = sh.getRange(2, col['brief id'] + 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!cell) throw new Error('Brief tidak ditemukan (mungkin sudah dihapus). Muat ulang data.');
  var row = cell.getRow();
  return { sheet: sh, col: col, row: row, brief: rowBrief_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], col, row) };
}

/** Admin, atau pemilik task yang terhubung saat ini. */
function assertBriefEditor_(me, brief) {
  if (me.role === 'admin') return;
  if (brief.type === 'Sosmed' && brief.createdBy === me.username) return;
  if (brief.type === 'Sosmed' && !brief.taskId) throw new Error('Hanya pembuat brief dan admin yang bisa mengubah brief ini.');
  try { locateTask_(me, brief.taskId); }
  catch (e) { throw new Error('Hanya pemilik task dan admin yang bisa mengubah brief ini.'); }
}

function cleanBriefData_(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Format brief tidak valid');
  var json = JSON.stringify(d);
  if (json.length > BRIEF_MAX_CHARS) throw new Error('Isi brief terlalu panjang (' + json.length + ' karakter, maksimal ' + BRIEF_MAX_CHARS + '). Ringkas beberapa bagian.');
  return json;
}

function saveBrief_(me, b) {
  b = b || {};
  if (b.type === 'Sosmed') return saveSocialBrief_(me, b);
  var type = BRIEF_TYPES.indexOf(b.type) >= 0 ? b.type : 'Informasional';
  var status = 'Draft';   // status brief diatur oleh tahap task (Diajukan / Disetujui / Dikembalikan)
  var json = cleanBriefData_(b.data || {});
  var d = b.data || {};
  var lock = lock_(20000);
  try {
    var loc = locateTask_(me, b.taskId);   // anggota hanya bisa memilih task miliknya
    var trow = loc.sheet.getRange(loc.row, 1, 1, loc.sheet.getLastColumn()).getValues()[0];
    if (isArticleRow_(trow, loc.col) && me.role !== 'admin' && (Number(trow[loc.col['stage']]) || 1) >= 3) {
      throw new Error('Brief sudah diajukan ke admin, jadi tidak bisa diubah lagi. Minta admin mengembalikannya bila perlu revisi.');
    }
    var sh = briefSheet_(), col = colMap_(sh), now = new Date();
    var dupRow = sh.getLastRow() < 2 ? null : sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1)
      .createTextFinder(String(b.taskId)).matchEntireCell(true).findAll()
      .filter(function (c) { return String(sh.getRange(c.getRow(), col['brief id'] + 1).getValue()) !== String(b.id || ''); })[0];
    if (dupRow) throw new Error('Task ini sudah punya brief. Buka brief yang ada dari menu Brief.');
    var obj = {
      'task id': String(b.taskId), 'owner': loc.user.username, 'type': type,
      'keyword': safeCell_(String(d.kwMain || '').slice(0, 200)), 'title': safeCell_(String(d.h1 || '').slice(0, 300)),
      'data': json, 'updated at': now, 'updated by': me.username
    };
    var id = b.id, row;
    if (id) {
      var f = findBrief_(id);
      if (f.brief.type === 'Sosmed' || f.brief.type === 'Request') throw new Error('Brief ini disimpan lewat editornya sendiri.');
      assertBriefEditor_(me, f.brief);
      if (b.baseUpdatedAt && f.brief.updatedAt && b.baseUpdatedAt !== f.brief.updatedAt) {
        throw new Error('Brief ini baru saja diubah oleh ' + (f.brief.updatedBy || 'orang lain') + '. Muat ulang supaya perubahannya tidak tertimpa.');
      }
      row = f.row;
      writeObj_(sh, row, obj);
    } else {
      id = 'BR' + newId_().replace(/^T/, '');
      obj['brief id'] = id; obj['created by'] = me.username; obj['created at'] = now; obj['status'] = status;
      row = appendObj_(sh, obj);
    }
    if (!b.id) {
      log_(me, 'create-brief', b.taskId, id + ' ' + (d.kwMain || ''));
      if (isArticleRow_(trow, loc.col) && (Number(trow[loc.col['stage']]) || 1) === 1) setStage_(loc.sheet, loc.row, trow, colMap_(loc.sheet), loc.user, me, 2);
    }   // simpan otomatis tidak dicatat agar cepat
    return { brief: rowBrief_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], colMap_(sh), row) };
  } finally { unlock_(lock); }
}

function deleteBrief_(me, id) {
  var pre = findBrief_(id).brief;
  if (pre.type === 'Sosmed' || pre.type === 'Request') return deleteSocialBrief_(me, pre);
  var lock = lock_(20000);
  try {
    var f = findBrief_(id);
    assertBriefEditor_(me, f.brief);
    f.sheet.deleteRow(f.row);
    log_(me, 'delete-brief', f.brief.taskId, id);
    return { ok: true };
  } finally { unlock_(lock); }
}

// ---------- ekspor ke Google Doc ----------
function briefFolder_() {
  var props = PropertiesService.getScriptProperties(), fid = props.getProperty('BRIEF_FOLDER_ID');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* folder dihapus → buat lagi */ } }
  var it = DriveApp.getFoldersByName(CFG.BRIEF_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.BRIEF_FOLDER);
  props.setProperty('BRIEF_FOLDER_ID', folder.getId());
  return folder;
}

function exportBriefDoc_(me, id) {
  var f = findBrief_(id), b = f.brief;
  if (b.type === 'Sosmed') throw new Error('Google Doc hanya untuk brief artikel.');
  assertBriefEditor_(me, b);
  var task = null;
  try { var loc = locateTask_({ role: 'admin' }, b.taskId); task = rowTask_(loc.sheet.getRange(loc.row, 1, 1, loc.sheet.getLastColumn()).getValues()[0], null, loc.col, loc.sheet, loc.user, loc.row); }
  catch (e) { /* task sudah dihapus: tetap ekspor */ }
  var name = 'Brief — ' + (b.keyword || b.title || b.id) + (task && task.code ? ' [' + task.code + ']' : '');
  var doc = null;
  if (b.docUrl) { try { doc = DocumentApp.openByUrl(b.docUrl); doc.setName(name); } catch (e) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create(name);
    try { DriveApp.getFileById(doc.getId()).moveTo(briefFolder_()); } catch (e) { Logger.log('Pindah folder: ' + e); }
  }
  writeBriefDoc_(doc, b, task);
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  [task && findUser_(task.owner), findUser_(b.createdBy), me].forEach(function (u) {
    if (u && u.email) { try { file.addEditor(u.email); } catch (e) { Logger.log('Bagikan ke ' + u.email + ': ' + e); } }
  });
  var url = doc.getUrl ? doc.getUrl() : file.getUrl();
  writeObj_(f.sheet, f.row, { 'doc url': url });
  log_(me, 'brief-doc', b.taskId, id);
  return { url: url, brief: rowBrief_(f.sheet.getRange(f.row, 1, 1, f.sheet.getLastColumn()).getValues()[0], f.col, f.row) };
}

function writeBriefDoc_(doc, b, task) {
  var d = b.data || {}, body = doc.getBody(), H = DocumentApp.ParagraphHeading;
  body.clear();
  var txt = function (v) { return String(v == null ? '' : v).trim(); };
  var para = function (label, v) {
    v = txt(v); if (!v) return;
    var p = body.appendParagraph(label + ': ' + v);
    p.editAsText().setBold(0, label.length, true);
  };
  var head = function (t, lvl) { body.appendParagraph(t).setHeading(lvl || H.HEADING2); };
  var table = function (header, rows) {
    rows = rows.filter(function (r) { return r.some(function (c) { return txt(c); }); });
    if (!rows.length) return;
    var t = body.appendTable([header].concat(rows.map(function (r) { return r.map(txt); })));
    for (var i = 0; i < header.length; i++) t.getCell(0, i).editAsText().setBold(true);
  };
  body.appendParagraph(txt(d.h1) || txt(b.keyword) || 'Brief artikel').setHeading(H.TITLE);
  body.appendParagraph([txt(d.contentType), b.status, txt(d.wordEst) ? '±' + txt(d.wordEst) + ' kata' : '',
    task ? 'Task: ' + (task.code ? task.code + ' ' : '') + task.task + ' · ' + task.ownerName + (task.endDate ? ' · Deadline ' + task.endDate : '') : '']
    .filter(String).join(' · ')).setHeading(H.SUBTITLE);

  head('Keyword');
  para('Keyword utama', d.kwMain); para('Keyword turunan', (d.kwSecondary || []).join(', '));
  head('Analisis kompetitor');
  table(['Link kompetitor', 'Insight'], (d.competitors || []).map(function (c) { return [c.url, c.insight]; }));
  head('H1, jenis konten & meta');
  para('H1', d.h1); para('Jenis konten', d.contentType); para('Estimasi jumlah kata', d.wordEst);
  para('Meta title', d.metaTitle); para('Meta description', d.metaDesc);
  head('Struktur artikel');
  if (txt(d.intro)) { head('Introduction', H.HEADING3); para('Poin pembahasan', d.intro); }
  (d.sections || []).forEach(function (s) {
    if (!txt(s.h2) && !txt(s.points)) return;
    head('H2 · ' + (txt(s.h2) || '(tanpa judul)'), H.HEADING3);
    para('Poin pembahasan', s.points);
    (s.h3 || []).forEach(function (h) {
      if (!txt(h.title) && !txt(h.points)) return;
      var p = body.appendParagraph('H3 · ' + txt(h.title) + (txt(h.points) ? ' — ' + txt(h.points) : ''));
      p.setIndentStart(24);
    });
    var src = (s.sources || []).filter(function (x) { return txt(x); });
    if (src.length) para('Source', src.join(' · '));
  });
  head('CTA');
  para('Ke halaman produk', d.ctaPage); para('Teks / ajakan', d.ctaText);
  head('Link');
  table(['Internal link', 'Anchor text'], (d.internalLinks || []).map(function (l) { return [l.url, l.anchor]; }));
  table(['External link', 'Anchor text'], (d.externalLinks || []).map(function (l) { return [l.url, l.anchor]; }));
  head('FAQ');
  (d.faq || []).forEach(function (f) {
    if (!txt(f.q)) return;
    var p = body.appendParagraph(txt(f.q)); p.editAsText().setBold(true);
    if (txt(f.a)) body.appendParagraph(txt(f.a));
  });
  head('Extra feature');
  para('Fitur', (d.extras || []).join(', ')); para('Catatan', d.extraNote);
}


// ===================== Brief sosmed =====================
// Siapa pun boleh membuat. "Tugaskan" membuat task berjenis Sosmed di tab penanggung jawab
// (alur biasa: Mulai → Ajukan review → admin Setujui = Done). Status brief mengikuti task-nya.
var SOCIAL_FORMATS = ['Carousel', 'Video'];
var SOCIAL_STATUS = { 'Backlog': 'Ditugaskan', 'On-Progress': 'Dikerjakan', 'Review': 'Direview', 'Hold': 'Ditunda', 'Done': 'Selesai', 'Recurring': 'Dikerjakan' };

function asAdmin_(me) { return { role: 'admin', username: me.username, name: me.name, sheetName: me.sheetName }; }

function readTaskById_(id) {
  if (!id) return null;
  try {
    var loc = locateTask_({ role: 'admin' }, id);
    var r = loc.sheet.getRange(loc.row, 1, 1, loc.sheet.getLastColumn()).getValues()[0];
    return { loc: loc, r: r, task: rowTask_(r, null, loc.col, loc.sheet, loc.user, loc.row) };
  } catch (e) { return null; }
}

function socialSummary_(b) {
  var d = b.data || {}, slides = d.slides || [], scenes = d.scenes || [];
  var dur = scenes.reduce(function (s, x) { return s + (Number(x && x.dur) || 0); }, 0);
  var nm = function (u) { var x = u ? findUser_(u) : null; return x ? x.name : (u || ''); };
  return {
    id: b.id, row: b.row, taskId: b.taskId, owner: b.owner, createdBy: b.createdBy, type: b.type, status: b.status,
    keyword: b.keyword, title: b.title, docUrl: '', createdAt: b.createdAt, updatedAt: b.updatedAt, updatedBy: b.updatedBy, statusAt: b.statusAt, summary: true,
    ownerName: nm(b.owner), createdByName: nm(b.createdBy),
    data: { format: d.format || 'Carousel', title: d.title || '', platforms: d.platforms || [], sizes: d.sizes || [],
      nSlides: slides.length, nScenes: scenes.length, dur: dur, assign: d.assign || null }
  };
}

/** Status brief sosmed mengikuti status task-nya. Mengembalikan ringkasan brief (atau null). */
function mirrorSocialBrief_(taskId, status, me) {
  var f = briefRowOfTask_(taskId);
  if (!f || f.brief.type !== 'Sosmed') return null;
  var st = SOCIAL_STATUS[status] || 'Ditugaskan';
  if (f.brief.status !== st) {
    var sh = briefSheet_();   // memastikan kolom Status At ada
    writeObj_(sh, f.row, { 'status': st, 'status at': new Date() });
    f.brief.status = st; f.brief.statusAt = new Date().toISOString();
  }
  return socialSummary_(f.brief);
}

function saveSocialBrief_(me, b) {
  b = b || {};
  var d = b.data || {};
  var json = cleanBriefData_(d);
  var format = SOCIAL_FORMATS.indexOf(d.format) >= 0 ? d.format : 'Carousel';
  var title = String(d.title || '').trim().slice(0, 300);
  var cur = null;
  if (b.id) {
    cur = findBrief_(b.id).brief;
    if (cur.type !== 'Sosmed') throw new Error('Brief ini bukan brief sosmed');
    assertBriefEditor_(me, cur);
    if (b.baseUpdatedAt && cur.updatedAt && b.baseUpdatedAt !== cur.updatedAt) {
      throw new Error('Brief ini baru saja diubah oleh ' + (cur.updatedBy || 'orang lain') + '. Muat ulang supaya perubahannya tidak tertimpa.');
    }
  }
  var taskId = cur ? cur.taskId : '', ownerName = cur ? cur.owner : '';
  var ct = taskId ? readTaskById_(taskId) : null;
  if (ct && ct.task.status === 'Done' && me.role !== 'admin') throw new Error('Konten ini sudah disetujui admin, jadi brief tidak bisa diubah lagi.');
  var task = ct ? ct.task : null, newOwner = null;

  if (b.assign) {
    if (me.role !== 'admin' && cur && cur.createdBy !== me.username) throw new Error('Hanya pembuat brief dan admin yang bisa mengubah penugasan.');
    if (!title) throw new Error('Isi judul konten dulu.');
    var a = b.assign, owner = findUser_(String(a.owner || '').toLowerCase());
    if (!owner || !owner.active) throw new Error('Pilih penanggung jawab.');
    if (!owner.sheetName) throw new Error(owner.name + ' belum punya tab task.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.endDate || ''))) throw new Error('Isi deadline.');
    var base = ct ? ct.task : null;
    var res = saveTask_(asAdmin_(me), {
      id: base ? base.id : '', task: safeCell_(title), owner: owner.username, code: String(a.code || '').trim(),
      startDate: base ? base.startDate : Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), endDate: a.endDate,
      startTime: base ? base.startTime : '09:00', endTime: normTime_(a.endTime) || '18:00',
      priority: PRIORITIES.indexOf(a.priority) >= 0 ? a.priority : 'Medium',
      status: base ? base.status : 'Backlog', notes: base ? base.notes : '', type: 'Sosmed'
    });
    task = res.task; taskId = res.id; ownerName = owner.username;
    if (!base || base.owner !== owner.username) newOwner = owner;
  } else if (ct && title && ct.task.task !== title) {
    writeObj_(ct.loc.sheet, ct.loc.row, { 'task': safeCell_(title) });   // judul task ikut judul brief
    task.task = title;
  }

  var lock = lock_(20000);
  var brief;
  try {
    var sh = briefSheet_(), col = colMap_(sh), now = new Date();
    var status = task ? (SOCIAL_STATUS[task.status] || 'Ditugaskan') : 'Draft';
    var obj = { 'task id': taskId, 'owner': ownerName, 'type': 'Sosmed', 'status': status, 'keyword': format,
      'title': safeCell_(title), 'data': json, 'updated at': now, 'updated by': me.username };
    if (!cur || cur.status !== status) obj['status at'] = now;
    var row;
    if (cur) { row = findBrief_(cur.id).row; writeObj_(sh, row, obj); }
    else {
      obj['brief id'] = 'BS' + newId_().replace(/^T/, ''); obj['created by'] = me.username; obj['created at'] = now;
      row = appendObj_(sh, obj);
    }
    brief = rowBrief_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], colMap_(sh), row);
  } finally { unlock_(lock); }
  if (!cur) log_(me, 'create-brief', taskId, brief.id + ' sosmed ' + title);
  if (newOwner) { log_(me, 'assign-social', taskId, brief.id + ' → ' + newOwner.username); emailSocialAssign_(me, newOwner, brief, task); }
  return { brief: brief, task: task };
}

function deleteSocialBrief_(me, b) {
  if (me.role !== 'admin' && b.createdBy !== me.username) throw new Error('Hanya pembuat brief dan admin yang bisa menghapus brief ini.');
  var ct = readTaskById_(b.taskId), taskDeleted = false;
  if (ct) {
    var untouched = ct.task.status === 'Backlog' && !ct.task.startedAt;
    if (untouched) { deleteTask_(asAdmin_(me), b.taskId); taskDeleted = true; }
    else if (me.role !== 'admin') throw new Error('Konten ini sudah mulai dikerjakan ' + ct.task.ownerName + '. Minta admin bila brief perlu dihapus.');
  }
  var lock = lock_(20000);
  try {
    var f = findBrief_(b.id);
    f.sheet.deleteRow(f.row);
    log_(me, 'delete-brief', b.taskId, b.id + (taskDeleted ? ' + task' : ''));
    return { ok: true, taskDeleted: taskDeleted, taskId: taskDeleted ? b.taskId : '' };
  } finally { unlock_(lock); }
}

function socialHtml_(b) {
  var d = b.data || {}, n = d.format === 'Video' ? (d.scenes || []).length + ' scene' : (d.slides || []).length + ' slide';
  var row = function (k, v) { return v ? '<tr><td style="padding:3px 10px 3px 0;color:#6b6e73">' + k + '</td><td style="padding:3px 0">' + esc_(v) + '</td></tr>' : ''; };
  return '<table style="font-size:14px;margin:10px 0">' + row('Judul', d.title) + row('Bentuk', (d.format || 'Carousel') + ' · ' + n) +
    row('Platform', (d.platforms || []).join(', ')) + row('Ukuran', (d.sizes || []).join(', ')) + '</table>';
}

function emailSocialAssign_(me, owner, brief, task) {
  if (!owner.email || !owner.active || owner.username === me.username) return;
  try {
    MailApp.sendEmail({ to: owner.email, name: 'Project Tracker',
      subject: '🎨 Brief sosmed baru: ' + shortTitle_(task.task),
      htmlBody: emailShell_('Halo ' + esc_(owner.name) + ',', esc_(me.name) + ' menugaskan konten sosmed berikut kepada Anda. Detail brief bisa dibuka dari task di Project Tracker.' +
        socialHtml_(brief) + taskTableHtml_([task])) });
  } catch (e) { Logger.log('Email tugas sosmed: ' + e); }
}

/** Setelah admin menyetujui task sosmed: beri tahu pembuat brief. */
function emailSocialDone_(me, brief, task) {
  var u = findUser_(brief.createdBy);
  if (!u || !u.email || !u.active || u.username === me.username) return;
  try {
    MailApp.sendEmail({ to: u.email, name: 'Project Tracker',
      subject: '✅ Konten sosmed selesai: ' + shortTitle_(task.task),
      htmlBody: emailShell_('Halo ' + esc_(u.name) + ',', 'Konten dari brief Anda sudah dikerjakan ' + esc_(task.ownerName) +
        ' dan <b>disetujui</b> oleh ' + esc_(me.name) + '.' + resultsHtml_(task) + taskTableHtml_([task], true)) });
  } catch (e) { Logger.log('Email sosmed selesai: ' + e); }
}


// ===================== Request (brief custom antar anggota) =====================
// Siapa pun bisa me-request ke anggota mana pun → task berjenis Request di tab penerima.
// Alur: Konfirmasi (penerima boleh minta klarifikasi) → Dikerjakan → Diajukan → pembuat request Setujui = Selesai.
// Kejadian dicatat di kolom Stage Log task ({e, t}) untuk KPI kategori Request (waktu klarifikasi dijeda).
var REQ_MAX_BODY = 20000, REQ_MAX_ATTACH = 15, REQ_MAX_THREAD = 200;
var REQ_TASK_STATUS = { 'Konfirmasi': 'Backlog', 'Klarifikasi': 'Backlog', 'Dikerjakan': 'On-Progress', 'Dikembalikan': 'On-Progress', 'Diajukan': 'Review', 'Selesai': 'Done' };

function requestSummary_(b) {
  var d = b.data || {}, th = d.thread || [], nm = function (u) { var x = u ? findUser_(u) : null; return x ? x.name : (u || ''); };
  var last = th.length ? th[th.length - 1] : null;
  return {
    id: b.id, row: b.row, taskId: b.taskId, owner: b.owner, createdBy: b.createdBy, type: b.type, status: b.status,
    keyword: '', title: b.title, docUrl: '', createdAt: b.createdAt, updatedAt: b.updatedAt, updatedBy: b.updatedBy, statusAt: b.statusAt, summary: true,
    ownerName: nm(b.owner), createdByName: nm(b.createdBy),
    data: { title: d.title || '', nAttach: (d.attachments || []).length, nMsg: th.length, last: last ? { by: last.by, t: last.t, sys: !!last.sys } : null, assign: d.assign || null }
  };
}
function mirrorRequestBrief_(taskId, status) {
  var f = briefRowOfTask_(taskId);
  if (!f || f.brief.type !== 'Request') return null;
  var map = { 'Backlog': 'Konfirmasi', 'On-Progress': 'Dikerjakan', 'Review': 'Diajukan', 'Done': 'Selesai' }, st = map[status];
  if (st && st !== f.brief.status) { writeObj_(briefSheet_(), f.row, { 'status': st, 'status at': new Date() }); f.brief.status = st; }
  return requestSummary_(f.brief);
}
function cleanRequestData_(d, keep) {
  d = d || {};
  var att = (Array.isArray(d.attachments) ? d.attachments : []).map(function (a) {
    var url = String(a && a.url || '').trim();
    return url ? { label: String(a.label || '').trim().slice(0, 80), url: url } : null;
  }).filter(Boolean);
  if (att.length > REQ_MAX_ATTACH) throw new Error('Maksimal ' + REQ_MAX_ATTACH + ' lampiran');
  att.forEach(function (a) { if (!/^https?:\/\/\S+$/i.test(a.url) || a.url.length > 1500) throw new Error('Lampiran harus berupa link yang diawali http:// atau https://'); });
  var body = String(d.body || '');
  if (body.length > REQ_MAX_BODY) throw new Error('Isi request terlalu panjang (maksimal ' + REQ_MAX_BODY + ' karakter)');
  return { v: 1, title: String(d.title || '').trim().slice(0, 200), body: body, attachments: att,
    thread: (keep && keep.thread) || [], assign: d.assign || (keep && keep.assign) || null };
}
function reqLog_(sh, row, r, col, me, e, extra) {
  var log = []; try { log = JSON.parse(String(r[col['stage log']] || '[]')) || []; } catch (x) { log = []; }
  if (!Array.isArray(log)) log = [];
  log.push({ e: e, t: new Date().toISOString(), by: me.username });
  var ch = Object.assign({ 'stage log': JSON.stringify(log.slice(-150)) }, extra || {});
  writeObj_(sh, row, ch);
  Object.keys(ch).forEach(function (k) { if (col[k] !== undefined) r[col[k]] = ch[k]; });
}

function saveRequest_(me, b) {
  b = b || {};
  var cur = null;
  if (b.id) {
    cur = findBrief_(b.id).brief;
    if (cur.type !== 'Request') throw new Error('Ini bukan request');
    if (me.role !== 'admin' && cur.createdBy !== me.username) throw new Error('Hanya pembuat request dan admin yang bisa mengubah request ini.');
    if (cur.status === 'Selesai' && me.role !== 'admin') throw new Error('Request sudah selesai, jadi tidak bisa diubah lagi.');
    if (b.baseUpdatedAt && cur.updatedAt && b.baseUpdatedAt !== cur.updatedAt) throw new Error('Request ini baru saja diubah oleh ' + (cur.updatedBy || 'orang lain') + '. Muat ulang supaya perubahannya tidak tertimpa.');
  }
  var d = cleanRequestData_(b.data, cur ? cur.data : null);
  if (!d.title) throw new Error('Isi judul request.');
  if (!String(d.body).trim()) throw new Error('Tuliskan kebutuhan request.');
  var ct = cur && cur.taskId ? readTaskById_(cur.taskId) : null, task = ct ? ct.task : null, newOwner = null;
  var a = b.assign;
  if (!cur && !a) throw new Error('Pilih penerima request.');
  if (a) {
    var owner = findUser_(String(a.owner || '').toLowerCase());
    if (!owner || !owner.active || !owner.sheetName) throw new Error('Pilih penerima request.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.endDate || ''))) throw new Error('Isi deadline.');
    if (owner.username === (cur ? cur.createdBy : me.username)) throw new Error('Request tidak bisa ditujukan ke pembuatnya sendiri.');
    var base = task;
    var res = saveTask_(asAdmin_(me), {
      id: base ? base.id : '', task: safeCell_(d.title), owner: owner.username, code: String(a.code || '').trim(),
      startDate: base ? base.startDate : Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), endDate: a.endDate,
      startTime: base ? base.startTime : '09:00', endTime: normTime_(a.endTime) || '18:00',
      priority: PRIORITIES.indexOf(a.priority) >= 0 ? a.priority : 'Medium',
      status: base ? base.status : 'Backlog', notes: base ? base.notes : '', type: 'Request'
    });
    task = res.task;
    if (!base || base.owner !== owner.username) newOwner = owner;
    d.assign = { owner: owner.username, endDate: a.endDate, endTime: normTime_(a.endTime) || '18:00', priority: a.priority || 'Medium', code: String(a.code || '').trim() };
  } else if (ct && ct.task.task !== d.title) {
    writeObj_(ct.loc.sheet, ct.loc.row, { 'task': safeCell_(d.title) }); task.task = d.title;
  }
  var lock = lock_(20000), brief;
  try {
    if (task && !cur) {   // catat waktu dibuat untuk KPI waktu respon
      var nt = readTaskById_(task.id);
      if (nt) reqLog_(nt.loc.sheet, nt.loc.row, nt.r, nt.loc.col, me, 'created');
    }
    var sh = briefSheet_(), now = new Date();
    var status = cur ? (newOwner ? 'Konfirmasi' : cur.status) : 'Konfirmasi';
    if (cur && newOwner && task) {   // pindah penerima: mulai lagi dari konfirmasi
      var mt = readTaskById_(task.id);
      if (mt) { writeObj_(mt.loc.sheet, mt.loc.row, { 'status': 'Backlog', 'review at': '', 'started at': '' }); reqLog_(mt.loc.sheet, mt.loc.row, mt.r, mt.loc.col, me, 'created'); task.status = 'Backlog'; }
      d.thread.push({ by: me.username, name: me.name, t: now.toISOString(), text: 'Request dialihkan ke ' + newOwner.name + '.', sys: true });
    }
    var obj = { 'task id': task ? task.id : '', 'owner': task ? task.owner : '', 'type': 'Request', 'status': status,
      'keyword': '', 'title': safeCell_(d.title), 'data': cleanBriefData_(d), 'updated at': now, 'updated by': me.username };
    if (!cur || cur.status !== status) obj['status at'] = now;
    var row;
    if (cur) { row = findBrief_(cur.id).row; writeObj_(sh, row, obj); }
    else { obj['brief id'] = 'RQ' + newId_().replace(/^T/, ''); obj['created by'] = me.username; obj['created at'] = now; row = appendObj_(sh, obj); }
    brief = rowBrief_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], colMap_(sh), row);
  } finally { unlock_(lock); }
  if (!cur) log_(me, 'create-request', task ? task.id : '', brief.id + ' ' + d.title);
  if (newOwner) requestMail_(newOwner, me, brief, task, '📨 Request baru: ', esc_(me.name) + ' mengirim request kepada Anda. Buka request untuk <b>menerima</b> atau <b>meminta klarifikasi</b> dulu.');
  return { brief: brief, task: task };
}

function requestMail_(to, me, brief, task, subj, intro) {
  if (!to || !to.email || !to.active || to.username === me.username) return;
  var d = brief.data || {};
  try {
    MailApp.sendEmail({ to: to.email, name: 'Project Tracker', subject: subj + shortTitle_(d.title || brief.title),
      htmlBody: emailShell_('Halo ' + esc_(to.name) + ',', intro +
        (d.body ? '<div style="margin:10px 0;padding:8px 12px;border-left:3px solid #c9d6e0;color:#545a61;white-space:pre-wrap;font-size:13px">' + esc_(String(d.body).slice(0, 600)) + (String(d.body).length > 600 ? '…' : '') + '</div>' : '') +
        (task ? taskTableHtml_([task]) : '')) });
  } catch (e) { Logger.log('Email request: ' + e); }
}

/** act: message | accept | submit | approve | return. payload: { text, endDate, endTime } */
function requestAction_(me, id, act, payload) {
  payload = payload || {};
  var lock = lock_(20000), out, mail = null;
  try {
    var f = findBrief_(id), b = f.brief;
    if (b.type !== 'Request') throw new Error('Ini bukan request');
    var ct = readTaskById_(b.taskId);
    if (!ct) throw new Error('Task request tidak ditemukan (mungkin sudah dihapus).');
    var t = ct.task, sh = ct.loc.sheet, row = ct.loc.row, col = ct.loc.col, r = ct.r;
    var admin = me.role === 'admin', isOwner = t.owner === me.username, isCreator = b.createdBy === me.username;
    var d = b.data || {}; d.thread = Array.isArray(d.thread) ? d.thread : [];
    var now = new Date(), st = b.status, next = st, text = String(payload.text || '').trim().slice(0, 2000);
    var creator = findUser_(b.createdBy), owner = findUser_(t.owner);
    var say = function (msg, sys) { d.thread.push({ by: me.username, name: me.name, t: now.toISOString(), text: msg, sys: !!sys }); };
    var need = function (ok, msg) { if (!ok) throw new Error(msg); };
    if (act === 'message') {
      need(isOwner || isCreator || admin, 'Hanya pembuat dan penerima request yang bisa mengirim pesan.');
      need(text, 'Tulis pesannya dulu.');
      need(st !== 'Selesai', 'Request sudah selesai.');
      say(text);
      if (isOwner && st === 'Konfirmasi') { next = 'Klarifikasi'; reqLog_(sh, row, r, col, me, 'clar'); mail = [creator, '❓ Klarifikasi request: ', esc_(me.name) + ' meminta klarifikasi sebelum mengerjakan request Anda:<br><i>' + esc_(text) + '</i>']; }
      else if ((isCreator || admin) && !isOwner && st === 'Klarifikasi') {
        next = 'Konfirmasi'; reqLog_(sh, row, r, col, me, 'ans');
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(payload.endDate || ''))) {
          var et = normTime_(payload.endTime) || t.endTime || '18:00';
          writeObj_(sh, row, { 'end date': toDateCell_(payload.endDate), 'end time': et });
          d.assign = Object.assign({}, d.assign || {}, { endDate: payload.endDate, endTime: et });
          say('Deadline diubah ke ' + payload.endDate + ' ' + et + '.', true);
        }
        mail = [owner, '💬 Jawaban request: ', esc_(me.name) + ' menjawab klarifikasi Anda:<br><i>' + esc_(text) + '</i><br>Silakan <b>terima</b> request bila sudah jelas.'];
      } else mail = [isOwner ? creator : owner, '💬 Pesan di request: ', esc_(me.name) + ':<br><i>' + esc_(text) + '</i>'];
    } else if (act === 'accept') {
      need(isOwner || admin, 'Hanya penerima yang bisa menerima request.');
      need(st === 'Konfirmasi' || st === 'Klarifikasi', 'Request ini sudah diterima.');
      next = 'Dikerjakan'; say('Request diterima dan mulai dikerjakan.', true);
      reqLog_(sh, row, r, col, me, 'acc', Object.assign({ 'status': 'On-Progress' }, r[col['started at']] ? {} : { 'started at': now }));
    } else if (act === 'submit') {
      need(isOwner || admin, 'Hanya penerima yang bisa mengajukan hasil.');
      need(st === 'Dikerjakan' || st === 'Dikembalikan', st === 'Diajukan' ? 'Hasil sudah diajukan.' : 'Terima request dulu sebelum mengajukan hasil.');
      need(parseResults_(r[col['result']]).length || String(r[col['result note']] || '').trim(), 'Tambahkan hasil kerja (link atau keterangan) sebelum mengajukan.');
      next = 'Diajukan'; say('Hasil diajukan untuk disetujui.' + (text ? ' ' + text : ''), true);
      reqLog_(sh, row, r, col, me, 'sub', { 'status': 'Review', 'review at': now });
      mail = [creator, '📬 Hasil request siap dicek: ', esc_(me.name) + ' mengajukan hasil request Anda. Buka request untuk <b>menyetujui</b> atau <b>mengembalikan</b>.' + resultsHtml_(rowTask_(r, null, col, sh, ct.loc.user, row))];
    } else if (act === 'approve' || act === 'return') {
      need(isCreator || admin, 'Hanya pembuat request (atau admin) yang bisa menyetujui hasilnya.');
      need(st === 'Diajukan', 'Tidak ada hasil yang menunggu persetujuan — mungkin sudah diputuskan. Data dimuat ulang.');
      if (act === 'approve') {
        next = 'Selesai'; say('Hasil disetujui. Request selesai.' + (text ? ' ' + text : ''), true);
        reqLog_(sh, row, r, col, me, 'done', { 'status': 'Done', 'done at': now });
        mail = [owner, '✅ Request disetujui: ', esc_(me.name) + ' menyetujui hasil request Anda. Terima kasih!'];
      } else {
        next = 'Dikembalikan'; say('Dikembalikan untuk diperbaiki' + (text ? ': ' + text : '.'), true);
        var line = '[Request dikembalikan ' + Utilities.formatDate(now, tz_(), 'd MMM HH:mm') + ' oleh ' + me.name + ']' + (text ? ' ' + text : '');
        var old = String(r[col['notes']] || '').trim();
        reqLog_(sh, row, r, col, me, 'ret', { 'status': 'On-Progress', 'review at': '', 'notes': old ? old + '\n' + line : line });
        mail = [owner, '↩️ Request dikembalikan: ', esc_(me.name) + ' mengembalikan hasil request untuk diperbaiki' + (text ? ':<br><i>' + esc_(text) + '</i>' : '.')];
      }
    } else throw new Error('Aksi request tidak dikenal');
    d.thread = d.thread.slice(-REQ_MAX_THREAD);
    var bobj = { 'data': cleanBriefData_(d), 'updated at': now, 'updated by': me.username };
    if (next !== st) { bobj['status'] = next; bobj['status at'] = now; }
    writeObj_(f.sheet, f.row, bobj);
    log_(me, 'request-' + act, b.taskId, id + ' ' + st + ' → ' + next);
    out = { brief: rowBrief_(f.sheet.getRange(f.row, 1, 1, f.sheet.getLastColumn()).getValues()[0], f.col, f.row),
      task: rowTask_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], null, col, sh, ct.loc.user, row) };
    queueProjectSync_([t.code]);
  } finally { unlock_(lock); }
  if (mail) requestMail_(mail[0], me, out.brief, out.task, mail[1], mail[2]);
  return out;
}


// ===================== Jadwal kerja (WFO / WFH) =====================
// Reguler: Selasa WFO wajib + pilih Senin atau Kamis (2 hari). Rabu & Jumat WFH.
// Bila jadwal final sebuah minggu < 2 hari WFO → minggu depannya wajib 3 hari (Sen, Sel, Kam), tidak menumpuk.
// Pengecualian (WFO Exempt): tidak wajib apa pun; boleh menandai hari ke kantor (tidak dihitung kuota).
// Minimal 2 orang reguler di kantor setiap hari WFO. Pilihan minggu depan terkunci Jumat 17:00.
// Libur nasional: hari WFO yang jatuh di hari libur dianggap terpenuhi (tidak menimbulkan utang).
var SCHED_HEADERS = ['Week', 'Username', 'Days', 'Source', 'Updated At', 'Updated By'];
var SREQ_HEADERS = ['ID', 'Username', 'Week', 'Kind', 'From Day', 'To Day', 'Reason', 'Status', 'Created At', 'Decided By', 'Decided At', 'Note'];
var HOLIDAY_HEADERS = ['Date', 'Name'];
var DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri'];
var DAY_NAMES = { mon: 'Senin', tue: 'Selasa', wed: 'Rabu', thu: 'Kamis', fri: 'Jumat' };
var WFO_DAYS = ['mon', 'tue', 'thu'];
var SCHED_MIN_PEOPLE = 2;

function schedSheet_(name, headers) { var sh = getOrCreateSheet_(name, headers); ensureHeaders_(sh, headers); return sh; }
function isoDate_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function parseIso_(s) { return Utilities.parseDate(String(s), tz_(), 'yyyy-MM-dd'); }
/** Senin (yyyy-MM-dd) dari minggu yang memuat tanggal d. */
function weekOf_(d) {
  var dow = Number(Utilities.formatDate(d, tz_(), 'u'));   // 1 = Senin … 7 = Minggu
  return isoDate_(new Date(parseIso_(isoDate_(d)).getTime() - (dow - 1) * 864e5));
}
function addWeeks_(week, n) { return isoDate_(new Date(parseIso_(week).getTime() + n * 7 * 864e5 + 3 * 36e5)); }
function dayDate_(week, code) { return new Date(parseIso_(week).getTime() + DAY_CODES.indexOf(code) * 864e5); }
/** Batas memilih untuk minggu `week`: Jumat 17:00 minggu sebelumnya. */
function lockAt_(week) { return new Date(parseIso_(week).getTime() - 3 * 864e5 + 17 * 36e5); }
function normWeek_(w) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(w || ''))) return weekOf_(new Date());
  return weekOf_(parseIso_(w));
}
function cleanDays_(list, allowed) {
  var set = {}; (Array.isArray(list) ? list : String(list || '').split(',')).forEach(function (d) { d = String(d).trim().toLowerCase(); if ((allowed || WFO_DAYS).indexOf(d) >= 0) set[d] = 1; });
  return DAY_CODES.filter(function (d) { return set[d]; });
}

function readSchedRows_() {
  var sh = sheet_(CFG.SCHED_SHEET), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var col = colMap_(sh);
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r, i) {
    var w = r[col['week']], u = String(r[col['username']] || '').trim().toLowerCase();
    if (!w || !u) return;
    w = isDate_(w) ? isoDate_(w) : String(w).replace(/^'/, '').trim();
    out[w + '|' + u] = { row: i + 2, week: w, username: u, days: cleanDays_(r[col['days']]), source: String(r[col['source']] || 'choice') };
  });
  return out;
}
function readHolidays_() {
  var sh = sheet_(CFG.HOLIDAY_SHEET), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var col = colMap_(sh);
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r) {
    var d = r[col['date']]; if (!d) return;
    d = isDate_(d) ? isoDate_(d) : String(d).replace(/^'/, '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out[d] = String(r[col['name']] || 'Libur');
  });
  return out;
}
function schedPeople_() {
  return readUsers_().filter(function (u) { return u.active && !u.orgOnly && u.sheetName; });
}
function holidaySet_(week, hol) {
  var set = {}; DAY_CODES.forEach(function (c) { if (hol[isoDate_(dayDate_(week, c))]) set[c] = 1; }); return set;
}
/** Hari terakhir yang dipilih (Senin/Kamis) sebelum minggu `week`. */
function lastChoice_(rows, u, week) {
  for (var i = 1; i <= 12; i++) {
    var r = rows[addWeeks_(week, -i) + '|' + u];
    if (r) { if (r.days.indexOf('mon') >= 0 && r.days.indexOf('thu') < 0) return 'mon'; if (r.days.indexOf('thu') >= 0 && r.days.indexOf('mon') < 0) return 'thu'; }
  }
  return '';
}
/** Rencana satu orang untuk satu minggu. */
function planFor_(u, week, rows, hol) {
  var st = rows[week + '|' + u.username], hs = holidaySet_(week, hol);
  if (u.wfoExempt) return { days: st ? st.days : [], required: 0, exempt: true, chosen: !!st, source: st ? st.source : '', debt: false, holidays: Object.keys(hs) };
  var prev = rows[addWeeks_(week, -1) + '|' + u.username];
  var debt = !!(prev && prev.days.length < 2);   // hari libur tetap tercatat di jadwal → dianggap terpenuhi
  var required = debt ? 3 : 2, days, chosen = true, source = st ? st.source : '';
  if (st) {
    days = st.days.slice();
    if (debt && st.source === 'choice') days = WFO_DAYS.slice();   // utang muncul setelah memilih → otomatis 3 hari
  } else if (debt) { days = WFO_DAYS.slice(); source = 'auto'; }
  else {
    var c = lastChoice_(rows, u.username, week);
    days = c ? ['tue', c].sort(function (a, b) { return DAY_CODES.indexOf(a) - DAY_CODES.indexOf(b); }) : ['tue'];
    chosen = !!c; source = c ? 'auto' : '';
  }
  return { days: days, required: required, exempt: false, chosen: chosen, source: source, debt: debt, holidays: Object.keys(hs) };
}
function weekPlans_(week, rows, hol, people) {
  var plans = {}, count = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
  people.forEach(function (u) {
    var p = planFor_(u, week, rows, hol); plans[u.username] = p;
    if (!p.exempt) p.days.forEach(function (d) { if (!p.holidays.length || p.holidays.indexOf(d) < 0) count[d]++; });
  });
  return { plans: plans, count: count };
}
function readSchedReqs_() {
  var sh = sheet_(CFG.SREQ_SHEET), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var col = colMap_(sh);
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r, i) {
    var id = String(r[col['id']] || ''); if (!id) return;
    var w = r[col['week']]; w = isDate_(w) ? isoDate_(w) : String(w).replace(/^'/, '').trim();
    out.push({ id: id, row: i + 2, username: String(r[col['username']] || ''), week: w, kind: String(r[col['kind']] || ''),
      from: String(r[col['from day']] || ''), to: String(r[col['to day']] || ''), reason: String(r[col['reason']] || '').replace(/^'(?=[=+\-@])/, ''),
      status: String(r[col['status']] || 'Menunggu'), createdAt: normStamp_(r[col['created at']]), decidedBy: String(r[col['decided by']] || ''),
      decidedAt: normStamp_(r[col['decided at']]), note: String(r[col['note']] || '').replace(/^'(?=[=+\-@])/, '') });
  });
  return out;
}

function schedule_(me, week) {
  var cur = weekOf_(new Date()), w0 = normWeek_(week || cur), rows = readSchedRows_(), hol = readHolidays_(), people = schedPeople_();
  var weeks = [w0, addWeeks_(w0, 1)].map(function (w) {
    var wp = weekPlans_(w, rows, hol, people);
    return { week: w, lockAt: lockAt_(w).toISOString(), locked: new Date() >= lockAt_(w),
      days: DAY_CODES.map(function (c) { var dt = isoDate_(dayDate_(w, c)); return { code: c, date: dt, holiday: hol[dt] || '' }; }),
      plans: wp.plans, count: wp.count };
  });
  var reqs = readSchedReqs_().filter(function (r) { return me.role === 'admin' || r.username === me.username || r.status === 'Menunggu'; })
    .filter(function (r) { return r.status === 'Menunggu' || r.week >= addWeeks_(cur, -4); });
  return { today: isoDate_(new Date()), currentWeek: cur, weeks: weeks, requests: reqs, holidays: hol,
    people: people.map(function (u) { return { username: u.username, name: u.name, position: u.position || '', exempt: !!u.wfoExempt }; }) };
}

function writeSchedRow_(rows, week, username, days, source, me) {
  var sh = schedSheet_(CFG.SCHED_SHEET, SCHED_HEADERS), key = week + '|' + username, now = new Date();
  var obj = { 'week': "'" + week, 'username': username, 'days': days.join(','), 'source': source, 'updated at': now, 'updated by': me.username };
  if (rows[key]) writeObj_(sh, rows[key].row, obj);
  else { var row = appendObj_(sh, obj); rows[key] = { row: row }; }
  rows[key] = { row: rows[key].row, week: week, username: username, days: days, source: source };
}

/** Anggota memilih hari WFO kedua (reguler: day = mon|thu) atau menandai hari ke kantor (pengecualian: days). */
function schedChoose_(me, week, day, days) {
  var lock = lock_(20000);
  try {
    week = normWeek_(week);
    var rows = readSchedRows_(), hol = readHolidays_(), people = schedPeople_(), u = findUser_(me.username);
    if (!u || !u.sheetName) throw new Error('Akun Anda tidak termasuk jadwal kerja.');
    var everChosen = Object.keys(rows).some(function (k) { return k.split('|')[1] === u.username; });
    if (new Date() >= lockAt_(week) && (everChosen || week < weekOf_(new Date()))) throw new Error('Jadwal minggu ini sudah terkunci (batas Jumat 17:00). Ajukan pindah hari ke admin bila perlu.');
    if (u.wfoExempt) {
      var dd = cleanDays_(days);
      writeSchedRow_(rows, week, u.username, dd, 'choice', me);
      log_(me, 'sched-flex', '', week + ' ' + dd.join(','));
      return schedule_(me, week);
    }
    if (day !== 'mon' && day !== 'thu') throw new Error('Pilih Senin atau Kamis.');
    var wp = weekPlans_(week, rows, hol, people), p = wp.plans[u.username];
    if (p.required >= 3) throw new Error('Minggu ini Anda wajib WFO 3 hari (Senin, Selasa, Kamis), jadi tidak perlu memilih.');
    var other = day === 'mon' ? 'thu' : 'mon';
    if (p.days.indexOf(other) >= 0 && p.chosen && wp.count[other] - 1 < SCHED_MIN_PEOPLE && wp.count[other] >= SCHED_MIN_PEOPLE) {
      throw new Error(DAY_NAMES[other] + ' tinggal ' + wp.count[other] + ' orang. Minimal ' + SCHED_MIN_PEOPLE + ' orang di kantor, jadi Anda belum bisa pindah sebelum ada yang pindah ke ' + DAY_NAMES[other] + '.');
    }
    writeSchedRow_(rows, week, u.username, ['tue', day].sort(function (a, b) { return DAY_CODES.indexOf(a) - DAY_CODES.indexOf(b); }), 'choice', me);
    log_(me, 'sched-choose', '', week + ' ' + day);
    return schedule_(me, week);
  } finally { unlock_(lock); }
}

/** Admin mengatur jadwal seseorang langsung (tanpa batas waktu & kuota — peringatan ditampilkan di aplikasi). */
function schedSet_(me, username, week, days) {
  var lock = lock_(20000);
  try {
    week = normWeek_(week);
    var u = findUser_(String(username || '').toLowerCase());
    if (!u || !u.sheetName) throw new Error('Pengguna tidak ditemukan');
    var rows = readSchedRows_();
    writeSchedRow_(rows, week, u.username, cleanDays_(days), 'admin', me);
    log_(me, 'sched-set', '', u.username + ' ' + week + ' ' + cleanDays_(days).join(','));
    return schedule_(me, week);
  } finally { unlock_(lock); }
}

/** Pengajuan ke admin. kind: swap (pindah hari WFO) | skip (tidak bisa WFO di hari itu). */
function schedRequest_(me, q) {
  q = q || {};
  var lock = lock_(20000), out;
  try {
    var week = normWeek_(q.week), u = findUser_(me.username);
    if (!u || !u.sheetName) throw new Error('Akun Anda tidak termasuk jadwal kerja.');
    if (u.wfoExempt) throw new Error('Anda termasuk pengecualian, jadi tidak perlu mengajukan perubahan jadwal.');
    var kind = q.kind === 'skip' ? 'skip' : 'swap', from = String(q.from || ''), to = kind === 'swap' ? String(q.to || '') : '';
    var reason = String(q.reason || '').trim().slice(0, 500);
    if (!reason) throw new Error('Tuliskan alasannya.');
    var rows = readSchedRows_(), hol = readHolidays_(), p = planFor_(u, week, rows, hol);
    if (p.days.indexOf(from) < 0) throw new Error('Hari ' + (DAY_NAMES[from] || from) + ' bukan hari WFO Anda minggu itu.');
    if (kind === 'swap' && (WFO_DAYS.indexOf(to) < 0 || p.days.indexOf(to) >= 0)) throw new Error('Pilih hari pengganti (Senin, Selasa, atau Kamis) yang belum menjadi hari WFO Anda.');
    var first = kind === 'swap' && DAY_CODES.indexOf(to) < DAY_CODES.indexOf(from) ? to : from;
    if (new Date() >= new Date(dayDate_(week, first).getTime() - 7 * 36e5)) throw new Error('Pengajuan paling lambat H-1 pukul 17:00.');
    if (readSchedReqs_().some(function (r) { return r.username === u.username && r.week === week && r.from === from && r.status === 'Menunggu'; })) throw new Error('Sudah ada pengajuan untuk hari itu yang menunggu keputusan admin.');
    var sh = schedSheet_(CFG.SREQ_SHEET, SREQ_HEADERS), id = 'JD' + newId_().replace(/^T/, '');
    appendObj_(sh, { 'id': id, 'username': u.username, 'week': "'" + week, 'kind': kind, 'from day': from, 'to day': to, 'reason': safeCell_(reason), 'status': 'Menunggu', 'created at': new Date() });
    log_(me, 'sched-request', '', id + ' ' + kind + ' ' + week + ' ' + from + (to ? '→' + to : ''));
    out = schedule_(me, week);
  } finally { unlock_(lock); }
  try {
    readUsers_().filter(function (x) { return x.role === 'admin' && x.active && x.email; }).forEach(function (a) {
      MailApp.sendEmail({ to: a.email, name: 'Project Tracker', subject: '🗓 Pengajuan jadwal: ' + u.name,
        htmlBody: emailShell_('Halo ' + esc_(a.name) + ',', esc_(u.name) + ' mengajukan <b>' + (kind === 'swap' ? 'pindah hari WFO' : 'tidak bisa WFO') + '</b> untuk ' + esc_(DAY_NAMES[from]) + ' ' + esc_(isoDate_(dayDate_(week, from))) +
          (kind === 'swap' ? ' → ' + esc_(DAY_NAMES[to]) : '') + '.<br><i>' + esc_(reason) + '</i><br>Putuskan di menu <b>Jadwal</b>.') });
    });
  } catch (e) { Logger.log('Email pengajuan jadwal: ' + e); }
  return out;
}

function schedDecide_(me, id, decision, note) {
  if (decision !== 'approve' && decision !== 'reject') throw new Error('Keputusan tidak valid');
  var lock = lock_(20000), q, out;
  try {
    q = readSchedReqs_().filter(function (r) { return r.id === id; })[0];
    if (!q) throw new Error('Pengajuan tidak ditemukan. Muat ulang data.');
    if (q.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diputuskan. Data dimuat ulang.');
    var u = findUser_(q.username);
    if (decision === 'approve' && u) {
      var rows = readSchedRows_(), p = planFor_(u, q.week, rows, readHolidays_());
      var days = p.days.filter(function (d) { return d !== q.from; });
      if (q.kind === 'swap' && days.indexOf(q.to) < 0) days.push(q.to);
      writeSchedRow_(rows, q.week, u.username, cleanDays_(days), 'request', me);
    }
    var sh = schedSheet_(CFG.SREQ_SHEET, SREQ_HEADERS);
    writeObj_(sh, q.row, { 'status': decision === 'approve' ? 'Disetujui' : 'Ditolak', 'decided by': me.username, 'decided at': new Date(), 'note': safeCell_(String(note || '').trim().slice(0, 500)) });
    log_(me, 'sched-' + decision, '', id);
    out = schedule_(me, q.week);
  } finally { unlock_(lock); }
  if (u && u.email && u.active) {
    try {
      MailApp.sendEmail({ to: u.email, name: 'Project Tracker', subject: (decision === 'approve' ? '✅ Pengajuan jadwal disetujui' : '↩️ Pengajuan jadwal ditolak'),
        htmlBody: emailShell_('Halo ' + esc_(u.name) + ',', 'Pengajuan ' + (q.kind === 'swap' ? 'pindah hari WFO ' + esc_(DAY_NAMES[q.from]) + ' → ' + esc_(DAY_NAMES[q.to]) : 'tidak bisa WFO ' + esc_(DAY_NAMES[q.from])) +
          ' (minggu ' + esc_(q.week) + ') <b>' + (decision === 'approve' ? 'disetujui' : 'ditolak') + '</b> oleh ' + esc_(me.name) + '.' + (note ? '<br><i>' + esc_(note) + '</i>' : '') +
          (decision === 'approve' && q.kind === 'skip' ? '<br>Karena minggu itu WFO Anda kurang dari 2 hari, minggu berikutnya wajib WFO 3 hari.' : '')) });
    } catch (e) { Logger.log('Email keputusan jadwal: ' + e); }
  }
  return out;
}

function schedHoliday_(me, date, name, remove) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Tanggal tidak valid');
  var lock = lock_(20000);
  try {
    var sh = schedSheet_(CFG.HOLIDAY_SHEET, HOLIDAY_HEADERS), col = colMap_(sh), found = 0;
    if (sh.getLastRow() >= 2) {
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      for (var i = vals.length - 1; i >= 0; i--) {
        var d = vals[i][col['date']]; d = isDate_(d) ? isoDate_(d) : String(d).replace(/^'/, '').trim();
        if (d === date) { if (remove) sh.deleteRow(i + 2); found = i + 2; }
      }
    }
    if (!remove) {
      var obj = { 'date': "'" + date, 'name': safeCell_(String(name || 'Libur nasional').trim().slice(0, 80)) };
      if (found) writeObj_(sh, found, obj); else appendObj_(sh, obj);
    }
    log_(me, remove ? 'holiday-remove' : 'holiday-add', '', date);
    return schedule_(me, weekOf_(parseIso_(date)));
  } finally { unlock_(lock); }
}

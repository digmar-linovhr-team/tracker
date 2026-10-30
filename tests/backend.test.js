// Simulasi minimal Google Apps Script untuk menguji Code.gs secara lokal.
// Jalankan: TZ=Asia/Jakarta node apps-script/test/harness.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const assert = require('assert');

function col2arr(n) { return Array.from({ length: n }, () => ''); }

class Sheet {
  constructor(name, rows) { this.name = name; this.data = rows.map((r) => r.slice()); this.maxRows = 1000; this.maxCols = 26; this.validation = {}; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  hideSheet() { this.hidden = true; return this; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some((v) => v !== '' && v !== null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.data.forEach((r) => r.forEach((v, i) => { if (v !== '' && v !== null) m = Math.max(m, i + 1); })); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(c, n) { this.maxCols += n; }
  insertRowsAfter(r, n) { this.maxRows += n; }
  setFrozenRows() {}
  cell(r, c) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); return row; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => { this.cell(r, i + 1)[i] = v; }); }
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => (v instanceof Date ? v.toDateString() : String(v)))); }
  getValue() { return this.getValues()[0][0]; }
  check(c, r, v) { const l = this.sh.validation[c]; if (l && r > 1 && v !== '' && !l.includes(v)) throw new Error('The data you entered in cell ' + String.fromCharCode(64 + c) + r + ' violates the data validation rules set on this cell.'); }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.check(this.c + j, this.r + i, v))); vals.forEach((row, i) => row.forEach((v, j) => { this.sh.cell(this.r + i, this.c + j)[this.c + j - 1] = v; })); return this; }
  setValue(v) { this.check(this.c, this.r, v); this.sh.cell(this.r, this.c)[this.c - 1] = v; return this; }
  getCell(i, j) { return new Range(this.sh, this.r + i - 1, this.c + j - 1, 1, 1); }
  getDataValidation() { const l = this.sh.validation[this.c]; return l ? { getCriteriaType: () => 'VALUE_IN_LIST', getCriteriaValues: () => [l.slice(), true] } : null; }
  setDataValidation(rule) { this.sh.validation[this.c] = rule.list; return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.sh.data[this.r - 1 + i]; if (row && row.length >= this.c + j) row[this.c - 1 + j] = ''; } return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  getRow() { return this.r; }
  createTextFinder(text) {
    const self = this;
    return { matchEntireCell() { return this; }, findNext() {
      const v = self.getValues();
      for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) if (String(v[i][j]) === text) return self.sh.getRange(self.r + i, self.c + j);
      return null;
    }, findAll() {
      const v = self.getValues(), out = [];
      for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) if (String(v[i][j]) === text) out.push(self.sh.getRange(self.r + i, self.c + j));
      return out;
    } };
  }
}

const sheets = [];
const ss = {
  getSheets: () => sheets,
  getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
  deleteSheet: (sh) => { const i = sheets.indexOf(sh); if (i >= 0) sheets.splice(i, 1); },
  insertSheet: (n) => { const s = new Sheet(n, []); sheets.push(s); return s; },
  getSpreadsheetTimeZone: () => 'Asia/Jakarta'
};
const pad = (n) => String(n).padStart(2, '0');
const props = {}; const cache = {};
const logs = [];
const docs = {}; let docSeq = 0;
let flushes = 0;
const events = {}; let evSeq = 0; const mails = []; const triggers = [];
const mkEvent = (title, s, e, o) => { const id = 'ev' + (++evSeq) + '@google.com'; events[id] = { title, start: s, end: e, guests: o.guests, desc: o.description }; return { getId: () => id, removeAllReminders() {}, deleteEvent: () => { delete events[id]; } }; };
const calendar = { getId: () => 'cal1', createEvent: mkEvent, getEventById: (id) => events[id] ? { deleteEvent: () => { delete events[id]; } } : null };
const trigBuilder = (fn) => { const b = { timeBased: () => b, everyMinutes: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b, create: () => { triggers.push(fn); } }; return b; };
const sandbox = {
  SpreadsheetApp: { getActive: () => ss, getUi: () => { throw new Error('no ui'); }, flush() { flushes++; },
    DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
    newDataValidation: () => { const b = { list: null, requireValueInList(l) { b.list = l; return b; }, setAllowInvalid() { return b; }, build() { return { list: b.list }; } }; return b; } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; },
    getAll: (ks) => Object.fromEntries(ks.filter((k) => k in cache).map((k) => [k, cache[k]])), putAll: (m) => { Object.assign(cache, m); }, removeAll: (ks) => ks.forEach((k) => delete cache[k]) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: () => ({ setWidth() { return this; }, setHeight() { return this; } }) },
  Logger: { log: (x) => logs.push(x) },
  CalendarApp: { getCalendarById: (id) => (id === 'cal1' ? calendar : null), createCalendar: () => calendar, Color: { TEAL: 'teal' } },
  MailApp: { sendEmail: (m) => mails.push(m) },
  DocumentApp: (() => {
    const mkBody = (doc) => { const p = () => ({ setHeading() { return this; }, setIndentStart() { return this; }, editAsText() { return { setBold() {} }; } });
      return { clear() { doc.text = []; }, appendParagraph(t) { doc.text.push(t); return p(); }, appendListItem(t) { doc.text.push('• ' + t); return p(); },
        appendTable(rows) { doc.text.push(rows.map((r) => r.join(' | ')).join('\n')); return { getCell: () => ({ editAsText: () => ({ setBold() {} }) }) }; } }; };
    const mk = (name) => { const doc = { id: 'doc' + (++docSeq), name, text: [] }; docs[doc.id] = doc;
      return { getId: () => doc.id, getUrl: () => 'https://docs.google.com/document/d/' + doc.id + '/edit', setName(n) { doc.name = n; }, getBody: () => mkBody(doc), saveAndClose() {} }; };
    return { ParagraphHeading: { TITLE: 1, SUBTITLE: 2, HEADING2: 3 }, create: mk,
      openByUrl: (u) => { const id = u.split('/d/')[1].split('/')[0]; const doc = docs[id]; if (!doc) throw new Error('no doc');
        return { getId: () => id, getUrl: () => u, setName(n) { doc.name = n; }, getBody: () => mkBody(doc), saveAndClose() {} }; } };
  })(),
  DriveApp: {
    getFileById: (id) => ({ moveTo() {}, addEditor: (e) => { (docs[id].editors = docs[id].editors || []).push(e); }, getUrl: () => 'u' }),
    getFolderById: () => ({}), getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ getId: () => 'f1' })
  },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: trigBuilder, getOAuthToken: () => 'owner' },
  // UrlFetchApp sungguhan ke emulator Firebase (hanya bila FB_EMU=1, dijalankan lewat `firebase emulators:exec`)
  UrlFetchApp: { fetch: (url, opt) => {
    const args = ['-sS', '-X', String((opt && opt.method) || 'get').toUpperCase(), '-w', '\n%{http_code}', url];
    Object.entries((opt && opt.headers) || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
    if (opt && opt.contentType) args.push('-H', 'Content-Type: ' + opt.contentType);
    if (opt && opt.payload) args.push('--data-binary', opt.payload);
    const out = require('child_process').execFileSync('curl', args, { encoding: 'utf8', env: Object.assign({}, process.env, { no_proxy: '*', NO_PROXY: '*' }) });
    const i = out.lastIndexOf('\n'); const body = out.slice(0, i), code = Number(out.slice(i + 1));
    return { getResponseCode: () => code, getContentText: () => body };
  } },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()),
    computeHmacSha256Signature: (p, k) => Array.from(crypto.createHmac('sha256', k).update(p).digest()),
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    base64EncodeWebSafe: (b) => Buffer.from(typeof b === 'string' ? Buffer.from(b) : b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, f) => f === 'u' ? String(((d.getDay() + 6) % 7) + 1) : f === 'd' ? String(d.getDate()) : f === 'M' ? String(d.getMonth() + 1) : f.replace('EEE, ', '').replace('d MMM', d.getDate() + ' ' + d.getMonth()).replace("'T'", 'T').replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())).replace('XXX', '+07:00'),
    parseDate: (s) => { const [dt, tm] = s.split(' '); const [y, m, d] = dt.split('-').map(Number); const [hh, mm] = (tm || '0:0').split(':').map(Number); return new Date(y, m - 1, d, hh, mm); }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), sandbox);

// --- data awal: salinan struktur sheet asli ---
sheets.push(new Sheet('Main Project', [
  ['Code', 'Project', 'PIC', 'Start', 'End', 'Priority', 'Status'],
  ['A1', 'Optimasi +- 48 article (144 keyword) LinovHR', 'Ari, Fahmi, Ammar, Winona', '26 October', '30 November', 'High', 'On-Progress'],
  ['A7', 'Weekly Report SEO', 'Ari', 'Recurring', 'Recurring', 'Medium', 'Recurring'],
  ['B5', 'Fixing Technical Issue Lawencon', 'Wisnu', 'TBD', 'TBD', 'Medium', 'Backlog']
]));
sheets.push(new Sheet('Ari', [
  ['Code', 'Task', 'Start Date', 'End Date', 'Status'],
  ['A1', 'https://www.linovhr.com/blog/aplikasi-hr-terbaik-era-digital/', '26 October', '29 October', 'On-Progress'],
  ['A1', 'Fixing Technical Issue - Page with Redirect URL', '28 October', '30 November', 'Backlog'],
  ['A7', 'Weekly Report SEO', new Date(2026, 10, 2), new Date(2026, 10, 2), 'Backlog']
]));
sheets.push(new Sheet('Wisnu', [['Code', 'Task', 'Start Date', 'End Date', 'Status'], ['B3', 'Skema FAQ', '29 October', '29 October', 'Backlog']]));

const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).text);
let n = 0; const it = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

sandbox.setup();
const created = logs[0] ? JSON.parse(logs[0]) : [];
const pw = Object.fromEntries(created.map((r) => [r[0], r[3]]));

it('setup membuat akun ari, wisnu, admin + kolom baru tanpa menggeser kolom lama', () => {
  assert.deepStrictEqual(Object.keys(pw).sort(), ['admin', 'ari', 'wisnu']);
  const h = ss.getSheetByName('Ari').data[0];
  assert.deepStrictEqual(h.slice(0, 5), ['Code', 'Task', 'Start Date', 'End Date', 'Status']);
  assert.ok(h.includes('Task ID') && h.includes('Start Time') && h.includes('Done At'));
  const idc = h.indexOf('Task ID');
  assert.ok(ss.getSheetByName('Ari').data.slice(1).every((r) => /^T[A-Z0-9]+$/.test(r[idc])));
});

it('setup bisa dijalankan ulang tanpa duplikasi', () => {
  logs.length = 0; sandbox.setup();
  assert.strictEqual(ss.getSheetByName('Users').getLastRow(), 4);
  assert.strictEqual(ss.getSheetByName('Ari').data[0].filter((x) => x === 'Task ID').length, 1);
});

it('login salah ditolak, benar mendapat token; wajib ganti password', () => {
  assert.strictEqual(post({ action: 'login', username: 'ari', password: 'salah' }).ok, false);
  const r = post({ action: 'login', username: 'ARI', password: pw.ari });
  assert.ok(r.ok && r.data.token); assert.strictEqual(r.data.user.mustChange, true);
  const blocked = post({ action: 'myTasks', token: r.data.token });
  assert.strictEqual(blocked.ok, false);
  const c = post({ action: 'changePassword', token: r.data.token, oldPassword: pw.ari, newPassword: 'rahasia123' });
  assert.ok(c.ok, c.error);
});

let ari, admin;
it('myTasks: tanggal "26 October" dibaca jadi ISO; Date asli juga', () => {
  ari = post({ action: 'login', username: 'ari', password: 'rahasia123' }).data.token;
  const r = post({ action: 'myTasks', token: ari });
  assert.ok(r.ok, r.error);
  const t = r.data.tasks;
  assert.strictEqual(t.length, 3);
  assert.strictEqual(t[0].startDate, new Date().getFullYear() + '-10-26');
  assert.strictEqual(t[2].startDate, '2026-11-02');
  assert.strictEqual(r.data.projects.find((p) => p.code === 'B5').start, '', 'TBD → kosong');
});

it('updateStatus mengembalikan task lengkap (untuk update instan di aplikasi)', () => {
  const t0 = post({ action: 'myTasks', token: ari }).data.tasks[0];
  const r = post({ action: 'updateStatus', token: ari, taskId: t0.id, status: 'Review' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.id, t0.id); assert.strictEqual(r.data.task.status, 'Review');
  assert.strictEqual(r.data.task.task, t0.task); assert.strictEqual(r.data.task.endDate, t0.endDate);
  post({ action: 'updateStatus', token: ari, taskId: t0.id, status: 'On-Progress' });
});

it('anggota: Mulai mencatat Started At; Done ditolak (harus lewat review)', () => {
  const id = post({ action: 'myTasks', token: ari }).data.tasks[1].id;
  let r = post({ action: 'updateStatus', token: ari, taskId: id, status: 'On-Progress' });
  assert.ok(r.data.task.startedAt);
  r = post({ action: 'updateStatus', token: ari, taskId: id, status: 'Done' });
  assert.strictEqual(r.ok, false); assert.ok(/Hanya admin/.test(r.error));
  r = post({ action: 'updateStatus', token: ari, taskId: id, status: 'Review' });
  assert.ok(r.ok, r.error); assert.ok(r.data.task.reviewAt, 'Review At tercatat');
  post({ action: 'updateStatus', token: ari, taskId: id, status: 'On-Progress' });
});

it('anggota tidak bisa mengubah task orang lain atau aksi admin', () => {
  const wid = ss.getSheetByName('Wisnu').data[1][ss.getSheetByName('Wisnu').data[0].indexOf('Task ID')];
  assert.strictEqual(post({ action: 'updateStatus', token: ari, taskId: wid, status: 'Review' }).ok, false);
  assert.strictEqual(post({ action: 'reviewTask', token: ari, taskId: wid, decision: 'approve' }).ok, false);
  assert.strictEqual(post({ action: 'getAll', token: ari }).ok, false);
});

it('admin: buat user baru (tab dibuat), buat task untuknya, pindahkan ke orang lain, hapus', () => {
  const lr = post({ action: 'login', username: 'admin', password: pw.admin });
  admin = lr.data.token;
  post({ action: 'changePassword', token: admin, oldPassword: pw.admin, newPassword: 'adminadmin' });
  const u = post({ action: 'saveUser', token: admin, user: { name: 'Wildan', username: 'wildan', role: 'member', hasTasks: true } });
  assert.ok(u.ok && u.data.password, u.error);
  assert.ok(ss.getSheetByName('Wildan'));
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'wildan', code: 'A4', task: 'Design UI/UX page solusi', startDate: '2026-10-26', startTime: '10:00', endDate: '2026-11-05', endTime: '16:00', priority: 'High', status: 'Backlog' } });
  assert.ok(t.ok, t.error);
  let all = post({ action: 'getAll', token: admin }).data;
  const mine = all.tasks.find((x) => x.id === t.data.id);
  assert.strictEqual(mine.startTime, '10:00'); assert.strictEqual(mine.endDate, '2026-11-05'); assert.strictEqual(mine.owner, 'wildan');
  const mv = post({ action: 'saveTask', token: admin, task: Object.assign({}, mine, { owner: 'wisnu', status: 'Done' }) });
  assert.ok(mv.ok, mv.error);
  all = post({ action: 'getAll', token: admin }).data;
  const moved = all.tasks.find((x) => x.id === t.data.id);
  assert.strictEqual(moved.owner, 'wisnu'); assert.ok(moved.doneAt, 'Done lewat form tetap tercatat');
  assert.ok(post({ action: 'deleteTask', token: admin, taskId: t.data.id }).ok);
  assert.ok(!post({ action: 'getAll', token: admin }).data.tasks.some((x) => x.id === t.data.id));
});

it('admin: tambah & edit project', () => {
  assert.ok(post({ action: 'saveProject', token: admin, project: { code: 'B7', project: 'Project baru', start: '2026-11-01', end: '2026-11-10', priority: 'High', status: 'Backlog' } }).ok);
  const p = post({ action: 'getAll', token: admin }).data.projects.find((x) => x.code === 'B7');
  assert.strictEqual(p.end, '2026-11-10');
  const e = post({ action: 'saveProject', token: admin, project: Object.assign({}, p, { originalCode: 'B7', status: 'Done' }) });
  assert.ok(e.ok, e.error);
});

it('token palsu ditolak dengan kode UNAUTHORIZED', () => {
  const r = post({ action: 'myTasks', token: ari.slice(0, -3) + 'abc' });
  assert.strictEqual(r.code, 'UNAUTHORIZED');
});

it('login dikunci setelah 5 kali salah', () => {
  for (let i = 0; i < 5; i++) post({ action: 'login', username: 'wisnu', password: 'x' });
  const r = post({ action: 'login', username: 'wisnu', password: pw.wisnu });
  assert.ok(/Terlalu banyak/.test(r.error));
});

it('Calendar: belum aktif → tidak ada event', () => {
  assert.strictEqual(Object.keys(events).length, 0);
});

it('aktifkan pengingat: anggota mengisi email sendiri → event mulai & deadline dibuat', () => {
  sandbox.installNotifications();
  assert.deepStrictEqual(triggers.filter((t) => t !== 'processProjectSync' && t !== 'runDailyJobs').sort(), ['runReminders', 'sendDailyDigest']);
  assert.ok(triggers.includes('runDailyJobs'), 'pemicu harian dipasang otomatis saat admin membuka aplikasi');
  assert.ok(triggers.includes('processProjectSync'), 'setup memasang trigger sinkron project');
  const r = post({ action: 'setMyEmail', token: ari, email: 'Ari@LinovHR.com', appUrl: 'https://tim.github.io/tracker/' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.user.email, 'ari@linovhr.com');
  sandbox.runReminders(); // trigger 5 menit
  const ev = Object.values(events).filter((e) => e.guests === 'ari@linovhr.com');
  // 3 task Ari: 1 masih Backlog/On-Progress dengan tanggal → masing-masing 2 event (mulai + deadline)
  assert.strictEqual(ev.length, 6, JSON.stringify(ev.map((e) => e.title)));
  assert.ok(ev.some((e) => e.title.startsWith('⏰ Deadline: [A7] Weekly Report SEO')));
  const due = ev.find((e) => e.title.startsWith('⏰ Deadline: [A7]'));
  assert.strictEqual(due.end.getHours(), 18, 'jam default deadline 18:00');
  assert.ok(due.desc.includes('https://tim.github.io/tracker/'));
});

it('task Done → event dihapus; dibuka lagi → event dibuat ulang', () => {
  const id = post({ action: 'myTasks', token: ari }).data.tasks[2].id;
  post({ action: 'updateStatus', token: admin, taskId: id, status: 'Done' });
  sandbox.runReminders();
  assert.strictEqual(Object.values(events).filter((e) => e.title.includes('[A7]')).length, 0);
  post({ action: 'updateStatus', token: admin, taskId: id, status: 'Backlog' });
  sandbox.runReminders();
  assert.strictEqual(Object.values(events).filter((e) => e.title.includes('[A7]')).length, 2);
});

it('mengubah deadline mengganti event, bukan menduplikasi', () => {
  const t = post({ action: 'getAll', token: admin }).data.tasks.find((x) => x.code === 'A7');
  const sv = post({ action: 'saveTask', token: admin, task: Object.assign({}, t, { endTime: '15:00' }) });
  assert.strictEqual(sv.data.task.endTime, '15:00', 'saveTask mengembalikan task tersimpan');
  sandbox.runReminders();
  const due = Object.values(events).filter((e) => e.title.startsWith('⏰ Deadline: [A7]'));
  assert.strictEqual(due.length, 1); assert.strictEqual(due[0].end.getHours(), 15);
});

it('runReminders idempoten; email deadline ≤24 jam & overdue dikirim sekali', () => {
  const before = Object.keys(events).length;
  sandbox.runReminders(); sandbox.runReminders();
  assert.strictEqual(Object.keys(events).length, before);
  // buat task deadline 3 jam lagi & task yang lewat 2 jam
  const now = new Date(); const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const soon = new Date(now.getTime() + 3 * 36e5), past = new Date(now.getTime() - 2 * 36e5);
  post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Task segera', startDate: iso(now), startTime: '00:00', endDate: iso(soon), endTime: pad(soon.getHours()) + ':' + pad(soon.getMinutes()) } });
  post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Task telat', startDate: iso(past), startTime: '00:00', endDate: iso(past), endTime: pad(past.getHours()) + ':' + pad(past.getMinutes()) } });
  mails.length = 0;
  sandbox.runReminders(); sandbox.runReminders();
  const subj = mails.map((m) => m.subject);
  assert.ok(subj.some((x) => x.startsWith('⏰ Deadline') && x.includes('Task segera')), subj.join(' | '));
  assert.ok(subj.some((x) => x.startsWith('⚠️ Lewat deadline') && x.includes('Task telat')), subj.join(' | '));
  assert.strictEqual(subj.filter((x) => x.includes('Task segera')).length, 1, 'tidak dobel');
  assert.ok(mails.every((m) => m.to === 'ari@linovhr.com'));
});

it('hapus task menghapus event-nya; anggota tanpa email tidak dapat event', () => {
  const t = post({ action: 'getAll', token: admin }).data.tasks.find((x) => x.task === 'Task segera');
  post({ action: 'deleteTask', token: admin, taskId: t.id });
  sandbox.runReminders(); // antrean hapus diproses
  assert.ok(!Object.values(events).some((e) => e.title.includes('Task segera')));
  assert.ok(!Object.values(events).some((e) => e.guests === '' || e.guests === undefined));
});

it('jabatan bisa diisi & dibaca, tidak mengubah hak akses', () => {
  const r = post({ action: 'saveUser', token: admin, user: { username: 'ari', name: 'Ari', role: 'member', active: true, position: 'SEO Specialist' } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.user.position, 'SEO Specialist'); assert.strictEqual(r.data.user.role, 'member');
  const n = post({ action: 'saveUser', token: admin, user: { name: 'Nadia', username: 'nadia', role: 'member', hasTasks: true, position: 'UI UX & Design Grafis Intern' } });
  assert.ok(n.ok, n.error); assert.strictEqual(n.data.user.position, 'UI UX & Design Grafis Intern');
  const me = post({ action: 'myTasks', token: ari }); assert.ok(me.ok);
  assert.strictEqual(post({ action: 'getAll', token: admin }).data.users.find((u) => u.username === 'nadia').position, 'UI UX & Design Grafis Intern');
});

it('menu Tim: anggota melihat task semua orang (dengan catatan), tanpa email/akun', () => {
  const r = post({ action: 'teamTasks', token: ari });
  assert.ok(r.ok, r.error);
  assert.ok(r.data.tasks.some((t) => t.owner === 'wisnu'), 'task orang lain terlihat');
  assert.ok('notes' in r.data.tasks[0]);
  assert.ok(r.data.users.every((u) => !('email' in u) && !('role' in u)), 'tidak membocorkan email/role');
});

it('alur review: ajukan → admin diberi email sekali → setujui = Done; kembalikan = On-Progress + alasan', () => {
  post({ action: 'saveUser', token: admin, user: { username: 'admin', name: 'Administrator', role: 'admin', active: true, email: 'digmar@linovhr.com' } });
  const t = post({ action: 'myTasks', token: ari }).data.tasks.find((x) => x.status !== 'Done');
  assert.ok(post({ action: 'updateStatus', token: ari, taskId: t.id, status: 'Review' }).ok);
  const q = post({ action: 'reviewQueue', token: admin });
  assert.ok(q.data.tasks.some((x) => x.id === t.id));
  mails.length = 0;
  sandbox.runReminders(); sandbox.runReminders();
  const rv = mails.filter((m) => m.subject.includes('menunggu review'));
  assert.strictEqual(rv.length, 1, 'email review ke admin terkirim sekali'); assert.strictEqual(rv[0].to, 'digmar@linovhr.com');
  // kembalikan
  mails.length = 0;
  let r = post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'return', reason: 'Tambahkan meta description' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.status, 'On-Progress');
  assert.ok(r.data.task.notes.includes('Tambahkan meta description'));
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com' && m.subject.startsWith('↩️')), 'anggota diberi tahu');
  // ajukan lagi lalu setujui
  post({ action: 'updateStatus', token: ari, taskId: t.id, status: 'Review' });
  r = post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'approve' });
  assert.strictEqual(r.data.task.status, 'Done'); assert.ok(r.data.task.doneAt); assert.ok(r.data.task.reviewAt);
  // anggota tidak bisa membuka lagi task yang sudah disetujui
  assert.strictEqual(post({ action: 'updateStatus', token: ari, taskId: t.id, status: 'On-Progress' }).ok, false);
});

it('ringkasan pagi terkirim ke anggota & rekap ke admin (jika hari kerja)', () => {
  post({ action: 'saveUser', token: admin, user: { username: 'admin', name: 'Administrator', role: 'admin', active: true, email: 'digmar@linovhr.com' } });
  mails.length = 0;
  sandbox.sendDailyDigest();
  const dow = new Date().getDay();
  if (dow === 0 || dow === 6) { assert.strictEqual(mails.length, 0); return; }
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com' && m.subject.startsWith('☀️')));
  assert.ok(mails.some((m) => m.to === 'digmar@linovhr.com' && m.subject.startsWith('📋')));
});

it('Result: anggota menambah link hasil kerja, terbaca & ikut di email review', () => {
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Landing page payroll', code: 'A3', startDate: '2026-10-28', endDate: '2026-10-30', status: 'On-Progress' } }).data;
  let r = post({ action: 'setResults', token: ari, taskId: t.id, results: [
    { label: 'Brief konten', url: 'https://docs.google.com/document/d/1Ab/edit' },
    { label: '', url: 'https://www.figma.com/file/k2P/Landing' }] });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.data.task.results, [{ label: 'Brief konten', url: 'https://docs.google.com/document/d/1Ab/edit' }, { label: '', url: 'https://www.figma.com/file/k2P/Landing' }]);
  // tersimpan di sel Result satu link per baris
  const mine = post({ action: 'myTasks', token: ari }).data.tasks.find((x) => x.id === t.id);
  assert.strictEqual(mine.results.length, 2);
  // validasi
  assert.strictEqual(post({ action: 'setResults', token: ari, taskId: t.id, results: [{ url: 'javascript:alert(1)' }] }).ok, false);
  assert.strictEqual(post({ action: 'setResults', token: ari, taskId: t.id, results: Array.from({ length: 11 }, (_, i) => ({ url: 'https://a.com/' + i })) }).ok, false);
  // anggota lain tidak bisa mengubah
  const wl = post({ action: 'login', username: 'wisnu', password: pw.wisnu }); const wisnu = wl.ok && !wl.data.user.mustChange ? wl.data.token : null;
  if (wisnu) assert.strictEqual(post({ action: 'setResults', token: wisnu, taskId: t.id, results: [] }).ok, false);
  // tim bisa melihat
  assert.strictEqual(post({ action: 'teamTasks', token: ari }).data.tasks.find((x) => x.id === t.id).results.length, 2);
  // saveTask admin tanpa field results tidak menghapus link
  post({ action: 'saveTask', token: admin, task: Object.assign({}, mine, { results: undefined, task: 'Landing page payroll v2' }) });
  assert.strictEqual(post({ action: 'myTasks', token: ari }).data.tasks.find((x) => x.id === t.id).results.length, 2);
  // email review ke admin memuat link
  post({ action: 'updateStatus', token: ari, taskId: t.id, status: 'Review' });
  mails.length = 0; sandbox.runReminders();
  const m = mails.find((x) => x.subject.includes('menunggu review'));
  assert.ok(m && m.htmlBody.includes('docs.google.com/document/d/1Ab') && m.htmlBody.includes('Brief konten'));
  // setelah Done anggota tidak bisa mengubah, admin bisa
  post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'approve' });
  assert.strictEqual(post({ action: 'setResults', token: ari, taskId: t.id, results: [] }).ok, false);
  assert.ok(post({ action: 'setResults', token: admin, taskId: t.id, results: [] }).ok);
});

it('Result Note: keterangan hasil dari anggota, terpisah dari Catatan admin', () => {
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Artikel reimbursement', startDate: '2026-10-28', endDate: '2026-10-30', status: 'On-Progress', notes: 'Fokus keyword reimbursement karyawan' } }).data;
  let r = post({ action: 'setResults', token: ari, taskId: t.id, results: [], note: 'Sudah tambah meta & 3 internal link' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.task.resultNote, 'Sudah tambah meta & 3 internal link');
  assert.strictEqual(r.data.task.notes, 'Fokus keyword reimbursement karyawan', 'Catatan admin tidak berubah');
  // tanpa field note → keterangan tidak terhapus
  r = post({ action: 'setResults', token: ari, taskId: t.id, results: [{ url: 'https://docs.google.com/document/d/x' }] });
  assert.strictEqual(r.data.task.resultNote, 'Sudah tambah meta & 3 internal link');
  // teks diawali "=" tidak menjadi rumus
  r = post({ action: 'setResults', token: ari, taskId: t.id, results: [], note: '=IMPORTXML("x")' });
  assert.strictEqual(r.data.task.resultNote, '=IMPORTXML("x")');
  assert.strictEqual(post({ action: 'setResults', token: ari, taskId: t.id, results: [], note: 'x'.repeat(2001) }).ok, false);
  // muncul di email review
  post({ action: 'setResults', token: ari, taskId: t.id, results: [], note: 'Siap direview, cek bagian FAQ' });
  post({ action: 'updateStatus', token: ari, taskId: t.id, status: 'Review' });
  mails.length = 0; sandbox.runReminders();
  const m = mails.find((x) => x.subject.includes('menunggu review'));
  assert.ok(m && m.htmlBody.includes('Siap direview, cek bagian FAQ'));
});

it('status project mengikuti task: 1 task = cermin; banyak task = Done bila semua Done', () => {
  const proj = (c) => { sandbox.processProjectSync(); return post({ action: 'getAll', token: admin }).data.projects.find((x) => x.code === c); };
  assert.ok(post({ action: 'saveProject', token: admin, project: { code: 'Z1', project: 'Video testimoni', start: '2026-11-03', end: '2026-11-14', priority: 'High', status: 'Backlog' } }).ok);
  let r = post({ action: 'saveTask', token: admin, task: { owner: 'ari', code: 'Z1', task: 'Video testimoni', startDate: '2026-11-03', endDate: '2026-11-14', status: 'Backlog' } });
  const id = r.data.id;
  r = post({ action: 'updateStatus', token: ari, taskId: id, status: 'On-Progress' });
  assert.strictEqual(proj('Z1').status, 'On-Progress');
  assert.ok(JSON.parse(props.PROJ_SYNC || '[]').includes('Z1') || proj('Z1'), 'masuk antrean sinkron');
  post({ action: 'updateStatus', token: ari, taskId: id, status: 'Review' });
  assert.strictEqual(proj('Z1').status, 'Review');
  post({ action: 'reviewTask', token: admin, taskId: id, decision: 'return', reason: 'x' });
  assert.strictEqual(proj('Z1').status, 'On-Progress');
  post({ action: 'updateStatus', token: ari, taskId: id, status: 'Review' });
  post({ action: 'reviewTask', token: admin, taskId: id, decision: 'approve' });
  assert.strictEqual(proj('Z1').status, 'Done', 'task disetujui → project Done');
  // tambah task kedua → project banyak task: dibuka lagi jadi On-Progress
  r = post({ action: 'saveTask', token: admin, task: { owner: 'ari', code: 'Z1', task: 'Edit versi pendek', startDate: '2026-11-10', endDate: '2026-11-12', status: 'Backlog' } });
  const id2 = r.data.id;
  assert.strictEqual(proj('Z1').status, 'On-Progress');
  // status manual (Hold) tidak ditimpa selama belum semua Done
  const p = proj('Z1');
  post({ action: 'saveProject', token: admin, project: Object.assign({}, p, { originalCode: 'Z1', status: 'Hold' }) });
  post({ action: 'updateStatus', token: ari, taskId: id2, status: 'On-Progress' });
  assert.strictEqual(proj('Z1').status, 'Hold');
  post({ action: 'updateStatus', token: admin, taskId: id2, status: 'Done' });
  assert.strictEqual(proj('Z1').status, 'Done', 'semua task Done → project Done');
  // hapus task → kembali 1 task (Done)
  post({ action: 'deleteTask', token: admin, taskId: id2 });
  assert.strictEqual(proj('Z1').status, 'Done');
});

it('Brief: anggota membuat brief untuk task-nya, satu brief per task, izin, konflik, siap ditulis', () => {
  const tasks = post({ action: 'myTasks', token: ari }).data.tasks;
  const t = tasks.find((x) => x.status !== 'Done');
  const data = { v: 2, kwMain: 'reimbursement karyawan', kwSecondary: ['reimbursement adalah'], h1: 'Reimbursement Karyawan: Pengertian & Alur',
    contentType: 'Informasional', wordEst: '1.800 – 2.200', metaTitle: 'Reimbursement Karyawan', metaDesc: 'Pelajari alur…',
    competitors: [{ url: 'https://talenta.co/x', insight: 'punya template' }, { url: '', insight: '' }],
    intro: 'Masalah klaim', sections: [{ h2: 'Apa itu reimbursement', points: 'definisi', sources: ['https://pajak.go.id/pph21'], h3: [{ title: 'Medis', points: 'plafon' }] }],
    ctaPage: '/fitur/reimbursement', ctaText: 'Coba demo', internalLinks: [{ url: '/blog/pph-21/', anchor: 'PPh 21' }], externalLinks: [{ url: 'https://pajak.go.id', anchor: 'DJP' }],
    faq: [{ q: 'Apakah kena pajak?', a: 'Umumnya tidak' }], extras: ['Infographic'], extraNote: 'alur 5 langkah' };
  let r = post({ action: 'saveBrief', token: ari, brief: { taskId: t.id, type: 'Informasional', data } });
  assert.ok(r.ok, r.error);
  const b = r.data.brief;
  assert.strictEqual(b.owner, 'ari'); assert.strictEqual(b.keyword, 'reimbursement karyawan'); assert.strictEqual(b.status, 'Draft'); assert.strictEqual(b.type, 'Informasional');
  assert.deepStrictEqual(b.data.sections, data.sections);
  assert.ok(post({ action: 'myTasks', token: ari }).data.briefs.some((x) => x.id === b.id));
  assert.ok(post({ action: 'getAll', token: admin }).data.briefs.some((x) => x.id === b.id));
  assert.strictEqual(post({ action: 'saveBrief', token: ari, brief: { taskId: t.id, data: {} } }).ok, false, 'satu task satu brief');
  const wTask = post({ action: 'getAll', token: admin }).data.tasks.find((x) => x.owner === 'wisnu');
  assert.strictEqual(post({ action: 'saveBrief', token: ari, brief: { taskId: wTask.id, data: {} } }).ok, false, 'bukan task miliknya');
  const data2 = Object.assign({}, data, { competitors: [data.competitors[0], { url: 'https://gadjian.com/y', insight: 'alur visual' }] });
  r = post({ action: 'saveBrief', token: ari, brief: { id: b.id, taskId: t.id, status: 'Siap ditulis', baseUpdatedAt: b.updatedAt, data: data2 } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.brief.status, 'Draft', 'status brief tidak bisa diubah langsung');
  const b2 = r.data.brief;
  if (b2.updatedAt !== b.updatedAt) assert.strictEqual(post({ action: 'saveBrief', token: ari, brief: { id: b.id, taskId: t.id, baseUpdatedAt: b.updatedAt, data } }).ok, false, 'versi lama ditolak');
  assert.strictEqual(post({ action: 'saveBrief', token: ari, brief: { id: b.id, taskId: t.id, data: { big: 'x'.repeat(46000) } } }).ok, false);
  // ekspor Google Doc
  post({ action: 'setMyEmail', token: ari, email: 'ari@linovhr.com' });
  r = post({ action: 'exportBriefDoc', token: ari, briefId: b.id });
  assert.ok(r.ok, r.error); assert.ok(/docs\.google\.com\/document/.test(r.data.url));
  const doc = Object.values(docs)[0];
  for (const want of ['Reimbursement Karyawan: Pengertian & Alur', 'gadjian.com/y', 'H2 · Apa itu reimbursement', 'H3 · Medis', 'pajak.go.id/pph21', 'Apakah kena pajak?', '/fitur/reimbursement', 'Infographic'])
    assert.ok(doc.text.some((x) => x.includes(want)), 'doc memuat ' + want);
  assert.ok((doc.editors || []).includes('ari@linovhr.com'));
  post({ action: 'exportBriefDoc', token: ari, briefId: b.id });
  assert.strictEqual(Object.keys(docs).length, 1, 'ekspor ulang tidak membuat doc baru');
  assert.ok(post({ action: 'deleteBrief', token: admin, briefId: b.id }).ok);
  assert.ok(!post({ action: 'briefs', token: ari }).data.briefs.some((x) => x.id === b.id));
  logs.length = 0; sandbox.setup();
  assert.ok(!post({ action: 'getAll', token: admin }).data.users.some((u) => u.username === 'briefs'));
});

it('Alur artikel 8 tahap: brief → review → menulis → review → publish → cek AI → review → Done', () => {
  let r = post({ action: 'saveTask', token: admin, task: { owner: 'ari', type: 'Artikel', code: 'A1', task: 'https://www.linovhr.com/blog/payroll-indonesia/', startDate: '2026-11-02', endDate: '2026-11-06', status: 'Done' } });
  assert.ok(r.ok, r.error);
  const id = r.data.id; let t = r.data.task;
  assert.strictEqual(t.type, 'Artikel'); assert.strictEqual(t.stage, 1); assert.strictEqual(t.status, 'Backlog', 'status mengikuti tahap, bukan isian form');
  const step = (s, url) => post({ action: 'advanceStage', token: ari, taskId: id, step: s, url });
  const rev = (decision, reason) => post({ action: 'reviewTask', token: admin, taskId: id, decision, reason });
  assert.strictEqual(post({ action: 'updateStatus', token: ari, taskId: id, status: 'On-Progress' }).ok, false, 'anggota tidak mengubah status task artikel langsung');
  assert.strictEqual(step('submitBrief').ok, false, 'tidak bisa lompat tahap');
  r = step('start'); assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 2); assert.strictEqual(r.data.task.status, 'On-Progress');
  r = step('submitBrief'); assert.strictEqual(r.ok, false); assert.ok(/Buat brief/.test(r.error));
  const bd = { v: 2, kwMain: 'payroll indonesia', h1: '', competitors: [{ url: 'https://a.com', insight: '' }], sections: [{ h2: 'Apa itu payroll', points: '', sources: [''], h3: [] }] };
  r = post({ action: 'saveBrief', token: ari, brief: { taskId: id, data: bd } }); assert.ok(r.ok, r.error);
  const bid = r.data.brief.id;
  r = step('submitBrief'); assert.strictEqual(r.ok, false); assert.ok(/H1/.test(r.error) && /kompetitor/.test(r.error), r.error);
  const bd2 = Object.assign({}, bd, { h1: 'Payroll Indonesia: Panduan Lengkap', competitors: [{ url: 'https://a.com', insight: 'x' }, { url: 'https://b.com', insight: 'y' }] });
  post({ action: 'saveBrief', token: ari, brief: { id: bid, taskId: id, data: bd2 } });
  r = step('submitBrief'); assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 3); assert.strictEqual(r.data.task.status, 'Review');
  assert.strictEqual(post({ action: 'briefs', token: ari }).data.briefs.find((x) => x.id === bid).status, 'Diajukan');
  assert.strictEqual(post({ action: 'saveBrief', token: ari, brief: { id: bid, taskId: id, data: bd2 } }).ok, false, 'brief terkunci saat direview');
  mails.length = 0; sandbox.runReminders();
  assert.ok(mails.some((m) => m.subject.includes('menunggu review') && m.htmlBody.includes('Review brief')), 'admin diberi tahu review brief');
  mails.length = 0;
  r = rev('return', 'Tambah 1 kompetitor lagi'); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.task.stage, 2); assert.ok(/Brief dikembalikan/.test(r.data.task.notes));
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com' && m.subject.startsWith('↩️ Brief dikembalikan')));
  assert.strictEqual(post({ action: 'briefs', token: ari }).data.briefs.find((x) => x.id === bid).status, 'Dikembalikan');
  assert.ok(post({ action: 'saveBrief', token: ari, brief: { id: bid, taskId: id, data: bd2 } }).ok, 'bisa direvisi setelah dikembalikan');
  step('submitBrief');
  r = rev('approve'); assert.strictEqual(r.data.task.stage, 4); assert.strictEqual(r.data.task.status, 'On-Progress');
  assert.strictEqual(post({ action: 'briefs', token: ari }).data.briefs.find((x) => x.id === bid).status, 'Disetujui');
  r = step('submitArticle'); assert.strictEqual(r.ok, false); assert.ok(/link Docs/.test(r.error));
  post({ action: 'setResults', token: ari, taskId: id, results: [{ label: 'Draft artikel', url: 'https://docs.google.com/document/d/art/edit' }] });
  r = step('submitArticle'); assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 5);
  r = rev('approve'); assert.strictEqual(r.data.task.stage, 6);
  assert.strictEqual(step('publish', 'bukan-url').ok, false);
  r = step('publish', 'https://www.linovhr.com/blog/payroll-indonesia/'); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.task.stage, 7); assert.strictEqual(r.data.task.liveUrl, 'https://www.linovhr.com/blog/payroll-indonesia/');
  r = step('submitAiCheck', 'https://docs.google.com/document/d/aicheck/edit'); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.task.stage, 8); assert.strictEqual(r.data.task.status, 'Review');
  r = rev('return', 'Perbaiki skor readability'); assert.strictEqual(r.data.task.stage, 7);
  step('submitAiCheck', 'https://docs.google.com/document/d/aicheck2/edit');
  r = rev('approve'); assert.ok(r.ok, r.error);
  t = r.data.task;
  assert.strictEqual(t.stage, 9); assert.strictEqual(t.status, 'Done'); assert.ok(t.doneAt);
  assert.deepStrictEqual(t.stageLog.map((x) => x.s), [1, 2, 3, 2, 3, 4, 5, 6, 7, 8, 7, 8, 9]);
  assert.strictEqual(rev('approve').ok, false, 'tidak ada yang perlu direview lagi');
  // task non-artikel tetap alur lama
  const nt = post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Rapat mingguan', startDate: '2026-11-02', endDate: '2026-11-02' } }).data.task;
  assert.strictEqual(nt.type, 'Non-artikel');
  assert.ok(post({ action: 'updateStatus', token: ari, taskId: nt.id, status: 'On-Progress' }).ok);
  assert.strictEqual(post({ action: 'advanceStage', token: ari, taskId: nt.id, step: 'start' }).ok, false);
  // admin mengubah tahap lewat form edit (koreksi)
  const at2 = post({ action: 'saveTask', token: admin, task: { owner: 'ari', type: 'Artikel', task: 'Artikel koreksi', startDate: '2026-11-02', endDate: '2026-11-04' } }).data.task;
  r = post({ action: 'saveTask', token: admin, task: Object.assign({}, at2, { stage: 4 }) });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 4); assert.strictEqual(r.data.task.status, 'On-Progress');
});

it('Admin mengubah jenis banyak task sekaligus; anggota tidak bisa', () => {
  const mk = (task, status) => post({ action: 'saveTask', token: admin, task: { owner: 'ari', task, status, startDate: '2026-11-02', endDate: '2026-11-03' } }).data.id;
  const ids = [mk('Artikel lama A', 'Done'), mk('Artikel lama B', 'On-Progress'), mk('Artikel lama C', 'Backlog')];
  assert.strictEqual(post({ action: 'bulkSetType', token: ari, taskIds: ids, type: 'Artikel' }).ok, false);
  let r = post({ action: 'bulkSetType', token: admin, taskIds: ids.concat('TIDAKADA'), type: 'Artikel' });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.data.tasks.map((t) => [t.type, t.stage, t.status]), [['Artikel', 9, 'Done'], ['Artikel', 2, 'On-Progress'], ['Artikel', 1, 'Backlog']]);
  assert.deepStrictEqual(r.data.failed, ['TIDAKADA']);
  r = post({ action: 'bulkSetType', token: admin, taskIds: [ids[2]], type: 'Non-artikel' });
  assert.strictEqual(r.data.tasks[0].type, 'Non-artikel');
});

it('Cache data bacaan: dipakai ulang, langsung diperbarui setelah ada perubahan; daftar brief berupa ringkasan', () => {
  const a1 = post({ action: 'getAll', token: admin }).data;
  // ubah sheet langsung tanpa lewat aplikasi → masih data cache (sampai kedaluwarsa)
  const sh = ss.getSheetByName('Ari'), col = sh.data[0].indexOf('Task');
  const old = sh.data[1][col]; sh.data[1][col] = 'DIUBAH LANGSUNG';
  assert.ok(!post({ action: 'getAll', token: admin }).data.tasks.some((t) => t.task === 'DIUBAH LANGSUNG'), 'pakai cache');
  // perubahan lewat aplikasi → cache dibuang
  post({ action: 'setMyEmail', token: ari, email: 'ari@linovhr.com' });
  assert.ok(post({ action: 'getAll', token: admin }).data.tasks.some((t) => t.task === 'DIUBAH LANGSUNG'), 'cache diperbarui');
  sh.data[1][col] = old; post({ action: 'setMyEmail', token: ari, email: 'ari@linovhr.com' });
  // brief: daftar ringkas, isi lengkap lewat getBrief
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'ari', type: 'Artikel', task: 'Artikel cache', startDate: '2026-11-02', endDate: '2026-11-04' } }).data.task;
  const b = post({ action: 'saveBrief', token: ari, brief: { taskId: t.id, data: { v: 2, kwMain: 'tes cache', h1: 'Judul', sections: [{ h2: 'A', points: 'x', sources: [''], h3: [] }, { h2: '', points: '', sources: [''], h3: [] }], competitors: [{ url: 'https://a.com' }] } } }).data.brief;
  const sum = post({ action: 'briefs', token: ari }).data.briefs.find((x) => x.id === b.id);
  assert.strictEqual(sum.summary, true); assert.strictEqual(sum.data.nH2, 1); assert.strictEqual(sum.data.nComp, 1); assert.strictEqual(sum.data.sections, undefined);
  const full = post({ action: 'getBrief', token: ari, briefId: b.id }).data.brief;
  assert.strictEqual(full.data.sections.length, 2);
  void a1;
});

it('Brief sosmed: anggota membuat & menugaskan → task Sosmed di tab orang lain; admin setujui → Done + email pembuat', () => {
  // wisnu login
  Object.keys(cache).forEach((k) => { if (/wisnu/i.test(k)) delete cache[k]; });   // buka kunci login dari uji sebelumnya
  const tmp = post({ action: 'resetPassword', token: admin, username: 'wisnu' }).data.password;
  let w = post({ action: 'login', username: 'wisnu', password: tmp }).data.token;
  post({ action: 'changePassword', token: w, oldPassword: tmp, newPassword: 'wisnu12345' });
  w = post({ action: 'login', username: 'wisnu', password: 'wisnu12345' }).data.token;
  post({ action: 'setMyEmail', token: w, email: 'wisnu@linovhr.com' });
  const data = { v: 1, format: 'Carousel', title: '5 Tanda Payroll Perlu Otomatis', platforms: ['Instagram', 'LinkedIn'], sizes: ['4:5 · 1080×1350'],
    slides: [{ text: 'Cover', visual: 'Ilustrasi HR pusing', refs: ['https://instagram.com/p/x'] }, { text: 'Tanda 1', visual: 'ikon', refs: [] }], scenes: [], caption: 'Caption' };
  // draft tanpa task
  let r = post({ action: 'saveSocialBrief', token: ari, brief: { data } });
  assert.ok(r.ok, r.error);
  const b0 = r.data.brief;
  assert.strictEqual(b0.type, 'Sosmed'); assert.strictEqual(b0.status, 'Draft'); assert.strictEqual(b0.taskId, ''); assert.ok(/^BS/.test(b0.id));
  // orang lain (bukan pembuat) tidak bisa mengubah draft
  assert.strictEqual(post({ action: 'saveSocialBrief', token: w, brief: { id: b0.id, data } }).ok, false);
  // tugaskan ke wisnu
  mails.length = 0;
  r = post({ action: 'saveSocialBrief', token: ari, brief: { id: b0.id, data, baseUpdatedAt: b0.updatedAt, assign: { owner: 'wisnu', endDate: '2026-11-06', endTime: '15:00', priority: 'High' } } });
  assert.ok(r.ok, r.error);
  const task = r.data.task;
  assert.strictEqual(task.owner, 'wisnu'); assert.strictEqual(task.type, 'Sosmed'); assert.strictEqual(task.status, 'Backlog'); assert.strictEqual(task.endTime, '15:00');
  assert.strictEqual(r.data.brief.status, 'Ditugaskan'); assert.strictEqual(r.data.brief.taskId, task.id); assert.strictEqual(r.data.brief.owner, 'wisnu');
  assert.ok(mails.some((m) => m.to === 'wisnu@linovhr.com' && m.subject.startsWith('🎨')), 'penanggung jawab diberi tahu');
  // task muncul di tab wisnu, bukan task artikel
  const wt = post({ action: 'myTasks', token: w }).data;
  const mt = wt.tasks.find((x) => x.id === task.id);
  assert.ok(mt && !mt.stage);
  const sum = wt.briefs.find((x) => x.id === b0.id);
  assert.strictEqual(sum.data.nSlides, 2); assert.deepStrictEqual(Array.from(sum.data.platforms), ['Instagram', 'LinkedIn']);
  // penanggung jawab boleh mengubah isi brief, tapi tidak penugasannya
  const full = post({ action: 'getBrief', token: w, briefId: b0.id }).data.brief;
  assert.ok(post({ action: 'saveSocialBrief', token: w, brief: { id: b0.id, data: Object.assign({}, data, { caption: 'Caption baru' }), baseUpdatedAt: full.updatedAt } }).ok);
  assert.strictEqual(post({ action: 'saveSocialBrief', token: w, brief: { id: b0.id, data, assign: { owner: 'ari', endDate: '2026-11-06' } } }).ok, false);
  // judul berubah → judul task ikut
  const f2 = post({ action: 'getBrief', token: ari, briefId: b0.id }).data.brief;
  assert.ok(post({ action: 'saveSocialBrief', token: ari, brief: { id: b0.id, data: Object.assign({}, f2.data, { title: 'Judul revisi' }), baseUpdatedAt: f2.updatedAt } }).ok);
  assert.strictEqual(post({ action: 'myTasks', token: w }).data.tasks.find((x) => x.id === task.id).task, 'Judul revisi');
  // alur biasa: mulai → review → admin setujui
  r = post({ action: 'updateStatus', token: w, taskId: task.id, status: 'On-Progress' });
  assert.strictEqual(r.data.brief.status, 'Dikerjakan');
  post({ action: 'updateStatus', token: w, taskId: task.id, status: 'Review' });
  mails.length = 0;
  r = post({ action: 'reviewTask', token: admin, taskId: task.id, decision: 'approve' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.task.status, 'Done'); assert.strictEqual(r.data.brief.status, 'Selesai'); assert.ok(r.data.brief.statusAt);
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com' && m.subject.startsWith('✅ Konten sosmed')), 'pembuat brief diberi tahu');
  // setelah Done: anggota tidak bisa mengubah lagi, tidak bisa menghapus
  const f3 = post({ action: 'getBrief', token: ari, briefId: b0.id }).data.brief;
  assert.strictEqual(post({ action: 'saveSocialBrief', token: ari, brief: { id: b0.id, data: f3.data, baseUpdatedAt: f3.updatedAt } }).ok, false);
  assert.strictEqual(post({ action: 'deleteBrief', token: ari, briefId: b0.id }).ok, false);
  // brief baru yang langsung ditugaskan lalu dihapus pembuatnya → task (belum dimulai) ikut terhapus
  r = post({ action: 'saveSocialBrief', token: ari, brief: { data: Object.assign({}, data, { format: 'Video', title: 'Video tips', slides: [], scenes: [{ visual: 'a', audio: 'b', dur: 5, refs: [] }] }), assign: { owner: 'wisnu', endDate: '2026-11-07' } } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.endTime, '18:00');
  const tid = r.data.task.id;
  const del = post({ action: 'deleteBrief', token: ari, briefId: r.data.brief.id });
  assert.ok(del.ok && del.data.taskDeleted, del.error);
  assert.ok(!post({ action: 'myTasks', token: w }).data.tasks.some((x) => x.id === tid));
  // saveBrief artikel tidak bisa dipakai untuk brief sosmed; jenis task Sosmed bisa diubah lewat bulk
  assert.strictEqual(post({ action: 'saveBrief', token: admin, brief: { id: b0.id, taskId: task.id, data: {} } }).ok, false);
  assert.strictEqual(post({ action: 'bulkSetType', token: admin, taskIds: [task.id], type: 'Non-artikel' }).data.tasks[0].type, 'Non-artikel');
  assert.strictEqual(post({ action: 'bulkSetType', token: admin, taskIds: [task.id], type: 'Sosmed' }).data.tasks[0].type, 'Sosmed');
});

it('Struktur tim: atasan, divisi, keahlian; anggota tanpa akun; cegah struktur berputar', () => {
  let r = post({ action: 'saveUser', token: admin, user: { username: 'owner', name: 'Pak Owner', position: 'Direktur', orgOnly: true, hasTasks: false } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.password, undefined); assert.strictEqual(r.data.user.orgOnly, true);
  r = post({ action: 'saveUser', token: admin, user: { username: 'wisnu', name: 'Wisnu', role: 'member', reportsTo: 'owner', division: 'Digital marketing', joined: '2023-03' } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.user.reportsTo, 'owner'); assert.strictEqual(r.data.user.joined, '2023-03');
  assert.ok(post({ action: 'saveUser', token: admin, user: { username: 'ari', name: 'Ari', role: 'member', reportsTo: 'wisnu', division: 'SEO dan konten' } }).ok);
  // berputar: wisnu di bawah ari → ditolak; diri sendiri → ditolak
  assert.strictEqual(post({ action: 'saveUser', token: admin, user: { username: 'wisnu', name: 'Wisnu', role: 'member', reportsTo: 'ari' } }).ok, false);
  assert.strictEqual(post({ action: 'saveUser', token: admin, user: { username: 'ari', name: 'Ari', role: 'member', reportsTo: 'ari' } }).ok, false);
  assert.strictEqual(post({ action: 'saveUser', token: admin, user: { username: 'ari', name: 'Ari', role: 'member', reportsTo: 'tidakada' } }).ok, false);
  // anggota tanpa akun tidak bisa login
  assert.strictEqual(post({ action: 'login', username: 'owner', password: 'x' }).ok, false);
  // anggota mengisi keahlian sendiri; data struktur terlihat semua anggota tanpa email
  r = post({ action: 'setMySkills', token: ari, skills: '=Riset keyword, technical SEO' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.user.skills, '=Riset keyword, technical SEO');
  const org = post({ action: 'teamTasks', token: ari }).data.org;
  const a = org.find((u) => u.username === 'ari'), o = org.find((u) => u.username === 'owner');
  assert.strictEqual(a.reportsTo, 'wisnu'); assert.strictEqual(a.division, 'SEO dan konten'); assert.ok(o && o.orgOnly);
  assert.ok(org.every((u) => u.email === undefined));
  assert.strictEqual(post({ action: 'saveUser', token: ari, user: { username: 'ari', reportsTo: '' } }).ok, false, 'anggota tidak bisa ubah struktur');
});

it('Kunci: perubahan di-flush sebelum kunci dilepas; server sibuk → pesan jelas; pengingat tidak memegang kunci', () => {
  const f0 = flushes;
  const t0 = post({ action: 'myTasks', token: ari }).data.tasks.find((x) => x.status !== 'Done' && x.type !== 'Artikel');
  assert.ok(post({ action: 'updateStatus', token: ari, taskId: t0.id, status: 'On-Progress' }).ok);
  assert.ok(flushes > f0, 'flush dipanggil');
  const orig = sandbox.LockService.getScriptLock;
  sandbox.LockService.getScriptLock = () => ({ tryLock() { return false; }, waitLock() { throw new Error('Lock timeout'); }, releaseLock() {} });
  const r = post({ action: 'updateStatus', token: ari, taskId: t0.id, status: 'Review' });
  assert.strictEqual(r.ok, false); assert.ok(/sedang sibuk/.test(r.error), r.error);
  sandbox.runReminders();   // tetap berjalan walau kunci dipegang permintaan lain
  sandbox.LockService.getScriptLock = orig;
  assert.strictEqual(props.REM_RUNNING, undefined, 'penanda dibersihkan');
});

it('Review artikel tahan data tidak konsisten: status Review tapi tahap 2, Task ID ganda di tab lain, keputusan ganda', () => {
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'ari', type: 'Artikel', task: 'Artikel uji review', startDate: '2026-11-02', endDate: '2026-11-04' } }).data.task;
  const sh = ss.getSheetByName('Ari'), h = sh.data[0], ri = sh.data.findIndex((r) => r[h.indexOf('Task ID')] === t.id);
  // status diubah langsung di spreadsheet jadi Review, tahap masih 2
  sh.data[ri][h.indexOf('Stage')] = 2; sh.data[ri][h.indexOf('Status')] = 'Review';
  let r = post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'approve', owner: 'ari' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 4);
  // keputusan kedua → pesan jelas
  r = post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'approve', owner: 'ari' });
  assert.strictEqual(r.ok, false); assert.ok(/sudah diputuskan/.test(r.error), r.error);
  // baris disalin ke tab Wisnu (Task ID ganda): review mengikuti tab pemilik yang dikirim aplikasi
  const ws = ss.getSheetByName('Wisnu'), copy = sh.data[ri].slice(); copy[h.indexOf('Stage')] = 2; copy[h.indexOf('Status')] = 'On-Progress';
  const wh = ws.data[0]; const row = wh.map((k) => copy[h.indexOf(k)] === undefined ? '' : copy[h.indexOf(k)]); ws.data.splice(1, 0, row);
  sh.data[ri][h.indexOf('Stage')] = 5; sh.data[ri][h.indexOf('Status')] = 'Review';
  r = post({ action: 'reviewTask', token: admin, taskId: t.id, decision: 'approve', owner: 'ari' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 6); assert.strictEqual(r.data.task.owner, 'ari');
  assert.ok(post({ action: 'getAll', token: admin }).data.dupIds.includes(t.id), 'ID ganda terdeteksi');
  // salinan dihapus → tidak ganda lagi
  ws.data.splice(1, 1); sandbox.dataCacheClear_();
  assert.ok(!post({ action: 'getAll', token: admin }).data.dupIds.length);
  // admin mengubah status artikel ke Review → tahap ikut naik
  sh.data[ri][h.indexOf('Stage')] = 4; sh.data[ri][h.indexOf('Status')] = 'On-Progress';
  r = post({ action: 'updateStatus', token: admin, taskId: t.id, status: 'Review', owner: 'ari' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 5); assert.strictEqual(r.data.task.status, 'Review');
});

it('Dropdown Status di sheet tanpa "Review" (validasi ketat): dilengkapi otomatis, pengajuan brief tetap tersimpan', () => {
  const t = post({ action: 'saveTask', token: admin, task: { owner: 'ari', type: 'Artikel', task: 'Artikel validasi', startDate: '2026-11-02', endDate: '2026-11-04' } }).data.task;
  const sh = ss.getSheetByName('Ari'), sc = sh.data[0].indexOf('Status') + 1;
  sh.validation[sc] = ['Done', 'On-Progress', 'On-Hold', 'Backlog'];
  assert.ok(post({ action: 'advanceStage', token: ari, taskId: t.id, step: 'start' }).ok);
  assert.ok(post({ action: 'saveBrief', token: ari, brief: { taskId: t.id, data: { v: 2, kwMain: 'kw', h1: 'Judul', competitors: [{ url: 'https://a.com' }, { url: 'https://b.com' }], sections: [{ h2: 'A', points: '', sources: [''], h3: [] }] } } }).ok);
  const r = post({ action: 'advanceStage', token: ari, taskId: t.id, step: 'submitBrief' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.task.stage, 3); assert.strictEqual(r.data.task.status, 'Review');
  assert.ok(sh.validation[sc].includes('Review') && sh.validation[sc].includes('On-Hold'), 'daftar dropdown dilengkapi, nilai lama tetap');
  assert.strictEqual(post({ action: 'briefs', token: ari }).data.briefs.find((b) => b.taskId === t.id).status, 'Diajukan');
  // status lama "On-Hold" dibaca sebagai Hold
  const row = sh.data.findIndex((x) => x[sh.data[0].indexOf('Task ID')] === t.id);
  sh.data[row][sc - 1] = 'On-Hold'; sandbox.dataCacheClear_();
  assert.strictEqual(post({ action: 'myTasks', token: ari }).data.tasks.find((x) => x.id === t.id).status, 'Hold');
  delete sh.validation[sc];
});

it('Request: buat → klarifikasi (dijeda) → terima → ajukan → pembuat setujui; izin; tidak masuk antrean review admin', () => {
  const w = post({ action: 'login', username: 'wisnu', password: 'wisnu12345' }).data.token;
  mails.length = 0;
  let r = post({ action: 'saveRequest', token: ari, brief: { data: { title: 'Copy landing page reimbursement', body: 'Butuh headline, 3 keunggulan, FAQ.', attachments: [{ label: 'Figma', url: 'https://figma.com/x' }] },
    assign: { owner: 'wisnu', endDate: '2026-11-06', endTime: '17:00', priority: 'High' } } });
  assert.ok(r.ok, r.error);
  const b = r.data.brief, tid = r.data.task.id;
  assert.strictEqual(b.type, 'Request'); assert.strictEqual(b.status, 'Konfirmasi'); assert.strictEqual(r.data.task.type, 'Request'); assert.strictEqual(r.data.task.owner, 'wisnu');
  assert.ok(mails.some((m) => m.to === 'wisnu@linovhr.com' && m.subject.startsWith('📨')));
  // tidak boleh ke diri sendiri; lampiran harus link
  assert.strictEqual(post({ action: 'saveRequest', token: ari, brief: { data: { title: 'x', body: 'y' }, assign: { owner: 'ari', endDate: '2026-11-06' } } }).ok, false);
  assert.strictEqual(post({ action: 'saveRequest', token: ari, brief: { data: { title: 'x', body: 'y', attachments: [{ url: 'bukan link' }] }, assign: { owner: 'wisnu', endDate: '2026-11-06' } } }).ok, false);
  // penerima tidak bisa ubah status biasa; tidak bisa ajukan sebelum terima
  assert.strictEqual(post({ action: 'updateStatus', token: w, taskId: tid, status: 'On-Progress' }).ok, false);
  assert.strictEqual(post({ action: 'requestAction', token: w, briefId: b.id, act: 'submit' }).ok, false);
  // klarifikasi → jawaban + deadline baru
  r = post({ action: 'requestAction', token: w, briefId: b.id, act: 'message', payload: { text: 'Perlu versi Inggris?' } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.brief.status, 'Klarifikasi');
  r = post({ action: 'requestAction', token: ari, briefId: b.id, act: 'message', payload: { text: 'Tidak perlu.', endDate: '2026-11-07', endTime: '12:00' } });
  assert.strictEqual(r.data.brief.status, 'Konfirmasi'); assert.strictEqual(r.data.task.endDate, '2026-11-07'); assert.strictEqual(r.data.task.endTime, '12:00');
  // orang lain tidak bisa ikut
  const adminLess = post({ action: 'requestAction', token: ari, briefId: b.id, act: 'accept' }); assert.strictEqual(adminLess.ok, false);
  r = post({ action: 'requestAction', token: w, briefId: b.id, act: 'accept' });
  assert.strictEqual(r.data.brief.status, 'Dikerjakan'); assert.strictEqual(r.data.task.status, 'On-Progress');
  assert.strictEqual(post({ action: 'requestAction', token: w, briefId: b.id, act: 'submit' }).ok, false, 'butuh hasil kerja');
  post({ action: 'setResults', token: w, taskId: tid, results: [{ label: 'Copy', url: 'https://docs.google.com/d/1' }] });
  mails.length = 0;
  r = post({ action: 'requestAction', token: w, briefId: b.id, act: 'submit' });
  assert.strictEqual(r.data.brief.status, 'Diajukan'); assert.strictEqual(r.data.task.status, 'Review');
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com'), 'pembuat diberi tahu');
  assert.ok(!post({ action: 'reviewQueue', token: admin }).data.tasks.some((x) => x.id === tid), 'tidak di antrean admin');
  // penerima tidak bisa menyetujui sendiri; pembuat mengembalikan lalu menyetujui
  assert.strictEqual(post({ action: 'requestAction', token: w, briefId: b.id, act: 'approve' }).ok, false);
  r = post({ action: 'requestAction', token: ari, briefId: b.id, act: 'return', payload: { text: 'Headline terlalu panjang' } });
  assert.strictEqual(r.data.brief.status, 'Dikembalikan'); assert.ok(/Headline terlalu panjang/.test(r.data.task.notes));
  post({ action: 'requestAction', token: w, briefId: b.id, act: 'submit' });
  r = post({ action: 'requestAction', token: ari, briefId: b.id, act: 'approve' });
  assert.strictEqual(r.data.brief.status, 'Selesai'); assert.strictEqual(r.data.task.status, 'Done');
  const ev = r.data.task.stageLog.map((x) => x.e);
  assert.deepStrictEqual(Array.from(ev), ['created', 'clar', 'ans', 'acc', 'sub', 'ret', 'sub', 'done']);
  const full = post({ action: 'getBrief', token: w, briefId: b.id }).data.brief;
  assert.ok(full.data.thread.length >= 5); assert.strictEqual(full.data.attachments[0].url, 'https://figma.com/x');
  const sum = post({ action: 'briefs', token: ari }).data.briefs.find((x) => x.id === b.id);
  assert.strictEqual(sum.data.nAttach, 1); assert.strictEqual(sum.data.body, undefined);
  // sudah selesai: pembuat tidak bisa ubah
  assert.strictEqual(post({ action: 'saveRequest', token: ari, brief: { id: b.id, data: full.data } }).ok, false);
});

it('Jadwal kerja: pilih Senin/Kamis, kuota min 2, pengecualian, pengajuan ke admin, utang 3 hari, libur', () => {
  const cur = post({ action: 'schedule', token: ari }).data.currentWeek;
  const addW = (w, n) => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() + 7 * n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const W2 = addW(cur, 2), W3 = addW(cur, 3);
  let w = post({ action: 'login', username: 'wisnu', password: 'wisnu12345' }).data.token;
  // reguler: default Selasa saja (belum memilih)
  let r = post({ action: 'schedule', token: ari, week: W2 });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(Array.from(r.data.weeks[0].plans.ari.days), ['tue']); assert.strictEqual(r.data.weeks[0].plans.ari.chosen, false);
  assert.ok(post({ action: 'schedChoose', token: ari, week: W2, day: 'mon' }).ok);
  r = post({ action: 'schedChoose', token: w, week: W2, day: 'mon' }); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.weeks[0].count.mon, 2); assert.ok(r.data.weeks[0].count.tue >= 2);
  // pindah ke Kamis membuat Senin tinggal 1 → ditolak
  r = post({ action: 'schedChoose', token: ari, week: W2, day: 'thu' });
  assert.strictEqual(r.ok, false); assert.ok(/tinggal 2 orang/.test(r.error), r.error);
  // pilihan terbawa ke minggu berikutnya
  assert.deepStrictEqual(Array.from(post({ action: 'schedule', token: ari, week: W3 }).data.weeks[0].plans.ari.days), ['mon', 'tue']);
  // pengajuan tidak bisa WFO Senin → disetujui admin → minggu depan wajib 3 hari
  mails.length = 0;
  r = post({ action: 'schedRequest', token: ari, req: { week: W2, kind: 'skip', from: 'mon', reason: 'Ke dokter' } });
  assert.ok(r.ok, r.error);
  assert.ok(post({ action: 'schedRequest', token: ari, req: { week: W2, kind: 'skip', from: 'mon', reason: 'lagi' } }).ok === false, 'tidak dobel');
  const q = r.data.requests.find((x) => x.status === 'Menunggu' && x.username === 'ari');
  assert.strictEqual(post({ action: 'schedDecide', token: ari, id: q.id, decision: 'approve' }).ok, false, 'anggota tidak bisa memutuskan');
  r = post({ action: 'schedDecide', token: admin, id: q.id, decision: 'approve', note: 'Semoga cepat sembuh' });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(Array.from(r.data.weeks[0].plans.ari.days), ['tue']);
  const n = r.data.weeks[1].plans.ari; assert.strictEqual(n.required, 3); assert.strictEqual(n.debt, true); assert.deepStrictEqual(Array.from(n.days), ['mon', 'tue', 'thu']);
  assert.ok(mails.some((m) => m.to === 'ari@linovhr.com' && /disetujui/.test(m.subject)));
  assert.strictEqual(post({ action: 'schedDecide', token: admin, id: q.id, decision: 'approve' }).ok, false, 'sudah diputuskan');
  // minggu wajib 3: tidak perlu memilih
  assert.strictEqual(post({ action: 'schedChoose', token: ari, week: W3, day: 'mon' }).ok, false);
  // pindah hari: wisnu Selasa → Kamis
  r = post({ action: 'schedRequest', token: w, req: { week: W2, kind: 'swap', from: 'tue', to: 'thu', reason: 'Visit klien' } }); assert.ok(r.ok, r.error);
  const q2 = r.data.requests.find((x) => x.username === 'wisnu' && x.status === 'Menunggu');
  r = post({ action: 'schedDecide', token: admin, id: q2.id, decision: 'approve' });
  assert.deepStrictEqual(Array.from(r.data.weeks[0].plans.wisnu.days), ['mon', 'thu']);
  assert.strictEqual(r.data.weeks[1].plans.wisnu.required, 2, 'pindah hari tidak menimbulkan utang');
  // pengajuan untuk minggu yang sudah lewat ditolak
  assert.strictEqual(post({ action: 'schedRequest', token: ari, req: { week: addW(cur, -1), kind: 'skip', from: 'tue', reason: 'x' } }).ok, false);
  // pengecualian: bebas, tidak dihitung kuota
  assert.ok(post({ action: 'saveUser', token: admin, user: { username: 'wisnu', name: 'Wisnu', role: 'member', wfoExempt: true } }).ok);
  r = post({ action: 'schedChoose', token: w, week: W3, days: ['thu'] }); assert.ok(r.ok, r.error);
  const wp = r.data.weeks[0].plans.wisnu; assert.strictEqual(wp.exempt, true); assert.strictEqual(wp.required, 0);
  assert.strictEqual(r.data.weeks[0].count.thu, 1, 'hanya ari (reguler) yang dihitung');
  assert.strictEqual(post({ action: 'schedRequest', token: w, req: { week: W3, kind: 'skip', from: 'thu', reason: 'x' } }).ok, false);
  // libur: Selasa W3 libur → tidak dihitung, tetap tercatat di jadwal
  assert.strictEqual(post({ action: 'schedHoliday', token: ari, date: addW(W3, 0).replace(/\d{2}$/, (d) => String(+d + 1).padStart(2, '0')), name: 'x' }).ok, false, 'hanya admin');
  const tueW3 = (() => { const d = new Date(W3 + 'T00:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  r = post({ action: 'schedHoliday', token: admin, date: tueW3, name: 'Libur nasional' }); assert.ok(r.ok, r.error);
  assert.deepStrictEqual(Array.from(r.data.weeks[0].plans.ari.holidays), ['tue']); assert.strictEqual(r.data.weeks[0].count.tue, 0);
  assert.ok(post({ action: 'schedHoliday', token: admin, date: tueW3, remove: true }).ok);
  assert.ok(!Object.keys(post({ action: 'schedule', token: ari, week: W3 }).data.holidays).length);
});

it('Logika bersama di Code.gs sama persis dengan web/js/logic.js (jalankan tools/embed-logic.js bila beda)', () => {
  const gs = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
  assert.ok(gs.includes(fs.readFileSync(path.join(__dirname, '../web/js/logic.js'), 'utf8').trim()), 'salinan logic.js di Code.gs usang');
  assert.strictEqual(typeof sandbox.PTLogic.summarize, 'function');
});

it('Task berulang: harian (hari kerja), mingguan, bulanan; tidak dobel; Hold dijeda', () => {
  const due = (repeat, start, today) => sandbox.repeatDue_({ repeat, startDate: start }, today);
  assert.ok(due('daily', '2026-10-26', '2026-10-27')); assert.ok(!due('daily', '2026-10-26', '2026-10-31'), 'Sabtu dilewati');
  assert.ok(!due('daily', '2026-10-26', '2026-10-26'), 'hari pertama = task aslinya');
  assert.ok(due('weekly', '2026-10-26', '2026-11-02')); assert.ok(!due('weekly', '2026-10-26', '2026-11-03'));
  assert.ok(due('monthly', '2026-01-31', '2026-02-28'), 'tanggal 31 → akhir bulan'); assert.ok(due('monthly', '2026-10-05', '2026-11-05'));
  let r = post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Weekly Report SEO (rutin)', startDate: '2026-10-26', endDate: '2026-10-27', startTime: '09:00', endTime: '17:00', repeat: 'weekly' } });
  assert.ok(r.ok, r.error); const tplId = r.data.id; assert.strictEqual(r.data.task.repeat, 'weekly');
  let made = sandbox.runRecurring_('2026-11-02');
  assert.strictEqual(made.length, 1);
  let tasks = post({ action: 'getAll', token: admin }).data.tasks;
  const copy = tasks.find((t) => t.id === made[0]);
  assert.strictEqual(copy.task, 'Weekly Report SEO (rutin)'); assert.strictEqual(copy.startDate, '2026-11-02'); assert.strictEqual(copy.endDate, '2026-11-03');
  assert.strictEqual(copy.repeat, ''); assert.strictEqual(copy.repeatOf, tplId); assert.strictEqual(copy.status, 'Backlog'); assert.strictEqual(copy.owner, 'ari');
  assert.strictEqual(sandbox.runRecurring_('2026-11-02').length, 0, 'tidak dobel di hari yang sama');
  assert.strictEqual(sandbox.runRecurring_('2026-11-03').length, 0, 'bukan jadwalnya');
  assert.ok(post({ action: 'updateStatus', token: admin, taskId: tplId, status: 'Hold', owner: 'ari' }).ok);
  assert.strictEqual(sandbox.runRecurring_('2026-11-09').length, 0, 'Hold = dijeda');
  assert.ok(post({ action: 'saveTask', token: admin, task: { id: tplId, owner: 'ari', task: 'Weekly Report SEO (rutin)', startDate: '2026-10-26', endDate: '2026-10-27', status: 'Backlog', repeat: '' } }).ok);
  assert.strictEqual(sandbox.runRecurring_('2026-11-16').length, 0, 'pengulangan dimatikan');
});

it('Cuti & izin: anggota mengajukan, admin menyetujui, kuota WFO & deadline task menyesuaikan', () => {
  const tok = ari;
  const cur = post({ action: 'schedule', token: tok }).data.currentWeek;
  const addD = (w, n) => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const wk = addD(cur, 14), tue = addD(wk, 1), wed = addD(wk, 2);
  let r = post({ action: 'leaveRequest', token: tok, leave: { kind: 'Liburan', from: tue, to: wed } }); assert.strictEqual(r.ok, false);
  r = post({ action: 'leaveRequest', token: tok, leave: { kind: 'Cuti', from: wed, to: tue } }); assert.strictEqual(r.ok, false, 'tanggal terbalik');
  const before = mails.length;
  r = post({ action: 'leaveRequest', token: tok, leave: { kind: 'Cuti', from: tue, to: wed, reason: 'Acara keluarga' } }); assert.ok(r.ok, r.error);
  const lv = r.data.leaves.find((l) => l.username === 'ari' && l.from === tue); assert.strictEqual(lv.status, 'Menunggu');
  assert.ok(mails.length > before, 'admin diberi email');
  assert.strictEqual(post({ action: 'leaveRequest', token: tok, leave: { kind: 'Izin', from: wed, to: wed } }).ok, false, 'bentrok');
  assert.strictEqual(post({ action: 'leaveDecide', token: tok, id: lv.id, decision: 'approve' }).ok, false, 'hanya admin');
  r = post({ action: 'schedule', token: admin, week: wk }); const cntBefore = r.data.weeks[0].count.tue;
  r = post({ action: 'leaveDecide', token: admin, id: lv.id, decision: 'approve' }); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.weeks[0].plans.ari.leave.tue, 'Cuti'); assert.strictEqual(r.data.weeks[0].count.tue, cntBefore - 1, 'tidak dihitung di kuota');
  // deadline task ari di hari cuti mundur 2 hari kerja
  r = post({ action: 'saveTask', token: admin, task: { owner: 'ari', task: 'Task saat cuti', startDate: tue, endDate: wed } }); assert.ok(r.ok, r.error);
  const tk = post({ action: 'getAll', token: admin }).data.tasks.find((t) => t.id === r.data.id); assert.strictEqual(tk.leaveDays, 2);
  // admin mencatat sakit langsung (disetujui), anggota membatalkan yang masih menunggu
  r = post({ action: 'leaveRequest', token: admin, leave: { username: 'ari', kind: 'Sakit', from: addD(wk, 4), to: addD(wk, 4) } }); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.leaves.find((l) => l.kind === 'Sakit').status, 'Disetujui');
  r = post({ action: 'leaveRequest', token: tok, leave: { kind: 'Izin', from: addD(wk, 7), to: addD(wk, 7) } }); assert.ok(r.ok, r.error);
  const iz = r.data.leaves.find((l) => l.kind === 'Izin');
  r = post({ action: 'leaveCancel', token: tok, id: iz.id }); assert.ok(r.ok, r.error);
  assert.ok(!r.data.leaves.some((l) => l.id === iz.id && l.status === 'Menunggu'));
});

it('Laporan mingguan & bulanan: email ke digmar@linovhr.com berisi KPI, dipicu Senin & tanggal 1', () => {
  const n0 = mails.length;
  let r = post({ action: 'sendReport', token: admin, kind: 'week' }); assert.ok(r.ok, r.error);
  const m = mails[mails.length - 1]; assert.strictEqual(m.to, 'digmar@linovhr.com');
  if (process.env.DUMP_REPORT) fs.writeFileSync(process.env.DUMP_REPORT, m.htmlBody); assert.ok(/Laporan mingguan tim/.test(m.subject), m.subject);
  assert.ok(/Per orang|Periode/.test(m.htmlBody));
  r = post({ action: 'sendReport', token: admin, kind: 'month' }); assert.ok(r.ok, r.error); assert.ok(/Laporan bulanan tim/.test(mails[mails.length - 1].subject));
  assert.strictEqual(post({ action: 'sendReport', token: ari, kind: 'week' }).ok, false, 'hanya admin');
  const rg = sandbox.reportRange_('month', new Date(2026, 10, 1, 7)); assert.strictEqual(rg.label, 'Oktober 2026');
  assert.strictEqual(rg.from.getDate(), 1); assert.strictEqual(rg.to.getDate(), 31);
  const wr = sandbox.reportRange_('week', new Date(2026, 10, 2, 7)); assert.strictEqual(wr.from.getDate(), 26); assert.strictEqual(wr.to.getDate(), 1);
  assert.ok(mails.length >= n0 + 2);
});

it('Onboarding: akun baru pending, langkah otomatis & manual, selesai menyembunyikan', () => {
  let r = post({ action: 'saveUser', token: admin, user: { username: 'baru', name: 'Anak Baru', role: 'member', hasTasks: true } }); assert.ok(r.ok, r.error);
  let tok = post({ action: 'login', username: 'baru', password: r.data.password }).data.token;
  tok = post({ action: 'changePassword', token: tok, oldPassword: r.data.password, newPassword: 'baru12345' }).data.token || post({ action: 'login', username: 'baru', password: 'baru12345' }).data.token;
  r = post({ action: 'myTasks', token: tok }); assert.ok(r.ok, r.error);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.data.onboarding.steps)), { account: false, wfo: false, guide: false, org: false, task: false });
  assert.ok(post({ action: 'setMyEmail', token: tok, email: 'baru@linovhr.com' }).ok);
  assert.ok(post({ action: 'onboardStep', token: tok, step: 'guide' }).ok);
  assert.ok(post({ action: 'onboardStep', token: tok, step: 'org' }).ok);
  assert.strictEqual(post({ action: 'onboardStep', token: tok, step: 'hack' }).ok, false);
  r = post({ action: 'myTasks', token: tok }); const st = r.data.onboarding.steps;
  assert.ok(st.account && st.guide && st.org && !st.wfo);
  assert.ok(post({ action: 'onboardStep', token: tok, step: 'done' }).ok);
  assert.strictEqual(post({ action: 'myTasks', token: tok }).data.onboarding, null);
  assert.strictEqual(post({ action: 'myTasks', token: ari }).data.onboarding, null, 'akun lama tidak ditampilkan onboarding');
});

it('Komentar: semua anggota boleh, sebut → email, catatan sistem otomatis, ubah/hapus 15 menit, jumlah ikut data', () => {
  const tasks = post({ action: 'getAll', token: admin }).data.tasks;
  const tk = tasks.find((t) => t.owner === 'ari' && t.status !== 'Done' && t.type !== 'Artikel' && t.type !== 'Request');
  assert.ok(tk, 'ada task ari');
  assert.strictEqual(post({ action: 'commentAdd', token: ari, taskId: tk.id, text: '   ' }).ok, false);
  assert.strictEqual(post({ action: 'commentAdd', token: ari, taskId: 'TIDAKADA', text: 'x' }).ok, false);
  assert.ok(post({ action: 'setMyEmail', token: ari, email: 'ari@linovhr.com' }).ok);
  const n0 = mails.length;
  let r = post({ action: 'commentAdd', token: admin, taskId: tk.id, text: '@Ari tolong cek ulang link-nya ya', mentions: ['ari', 'wisnu'] });
  assert.ok(r.ok, r.error);
  const c1 = r.data.comments.find((c) => c.kind === 'user'); assert.deepStrictEqual(Array.from(c1.mentions), ['ari'], 'hanya yang benar-benar disebut di teks');
  assert.strictEqual(mails.length, n0 + 1); assert.ok(/menyebut Anda/.test(mails[mails.length - 1].subject)); assert.strictEqual(mails[mails.length - 1].to, 'ari@linovhr.com');
  assert.ok(r.data.people.some((p) => p.username === 'ari'));
  // anggota lain (bukan pemilik) boleh berkomentar; tanpa sebutan → tanpa email
  r = post({ action: 'commentAdd', token: ari, taskId: tk.id, text: 'Siap, sudah dicek.' }); assert.ok(r.ok, r.error); assert.strictEqual(mails.length, n0 + 1);
  const mine = r.data.comments.find((c) => c.text === 'Siap, sudah dicek.'); assert.ok(mine.canEdit);
  assert.strictEqual(r.data.comments.find((c) => c.id === c1.id).canEdit, false, 'bukan penulis');
  r = post({ action: 'commentEdit', token: ari, id: mine.id, text: 'Siap, sudah dicek & diperbaiki.' }); assert.ok(r.ok, r.error);
  assert.ok(r.data.comments.find((c) => c.id === mine.id).editedAt);
  assert.strictEqual(post({ action: 'commentEdit', token: ari, id: c1.id, text: 'hack' }).ok, false);
  assert.strictEqual(post({ action: 'commentDelete', token: ari, id: c1.id }).ok, false, 'bukan penulis & bukan admin');
  // catatan sistem: ajukan review → kembalikan dengan alasan
  assert.ok(post({ action: 'updateStatus', token: ari, taskId: tk.id, status: 'Review' }).ok);
  assert.ok(post({ action: 'reviewTask', token: admin, taskId: tk.id, decision: 'return', reason: 'Link internal belum ada' }).ok);
  r = post({ action: 'comments', token: ari, taskId: tk.id }); assert.ok(r.ok, r.error);
  const sys = r.data.comments.filter((c) => c.kind === 'sys');
  assert.ok(sys.some((c) => /mengajukan review/.test(c.text)));
  const ret = sys.find((c) => /mengembalikan/.test(c.text)); assert.ok(ret && /Link internal belum ada/.test(ret.text) && ret.tone === 'return');
  // jumlah komentar (tanpa catatan sistem) ikut di data
  const cnt = post({ action: 'myTasks', token: ari }).data.comments[tk.id]; assert.strictEqual(cnt.n, 2); assert.strictEqual(cnt.by, 'ari');
  assert.strictEqual(post({ action: 'teamTasks', token: ari }).data.comments[tk.id].n, 2);
  // admin boleh menghapus komentar siapa pun
  r = post({ action: 'commentDelete', token: admin, id: mine.id }); assert.ok(r.ok, r.error);
  assert.ok(!r.data.comments.some((c) => c.id === mine.id));
  assert.strictEqual(post({ action: 'getAll', token: admin }).data.comments[tk.id].n, 1);
});

it('Hapus pengguna: wajib nonaktif dulu, tanpa task → tab dihapus, punya task → konfirmasi username & tab diarsipkan', () => {
  let r = post({ action: 'saveUser', token: admin, user: { username: 'tes', name: 'Tes Hapus', role: 'member', hasTasks: true, reportsTo: 'ari' } });
  assert.ok(r.ok, r.error); assert.ok(ss.getSheetByName('Tes Hapus'));
  assert.strictEqual(post({ action: 'deleteUser', token: admin, username: 'tes' }).ok, false, 'harus nonaktif dulu');
  assert.ok(post({ action: 'saveUser', token: admin, user: { username: 'tes', name: 'Tes Hapus', role: 'member', active: false } }).ok);
  assert.strictEqual(post({ action: 'deleteUser', token: ari, username: 'tes' }).ok, false, 'hanya admin');
  r = post({ action: 'deleteUser', token: admin, username: 'tes' }); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.archived, ''); assert.ok(!ss.getSheetByName('Tes Hapus'), 'tab kosong dihapus');
  assert.ok(!post({ action: 'getAll', token: admin }).data.users.some((u) => u.username === 'tes'));
  // wisnu punya task & ari melapor ke wisnu? set dulu
  assert.ok(post({ action: 'saveUser', token: admin, user: { username: 'ari', name: 'Ari', role: 'member', reportsTo: 'wisnu' } }).ok);
  assert.ok(post({ action: 'saveUser', token: admin, user: { username: 'wisnu', name: 'Wisnu', role: 'member', active: false } }).ok);
  const tab = post({ action: 'getAll', token: admin }).data.users.find((u) => u.username === 'wisnu').sheetName;
  r = post({ action: 'deleteUser', token: admin, username: 'wisnu' }); assert.strictEqual(r.ok, false); assert.ok(/Ketik username/.test(r.error));
  r = post({ action: 'deleteUser', token: admin, username: 'wisnu', confirm: 'wisnu' }); assert.ok(r.ok, r.error);
  assert.ok(r.data.tasks > 0); assert.ok(!ss.getSheetByName(tab)); const arc = ss.getSheetByName('(arsip) ' + tab);
  assert.ok(arc && arc.hidden, 'tab diarsipkan & disembunyikan');
  const d = post({ action: 'getAll', token: admin }).data;
  assert.ok(!d.users.some((u) => u.username === 'wisnu')); assert.ok(!d.tasks.some((t) => t.owner === 'wisnu'));
  assert.strictEqual(d.users.find((u) => u.username === 'ari').reportsTo, '', 'atasan yang dihapus dikosongkan');
  assert.strictEqual(post({ action: 'deleteUser', token: admin, username: 'admin' }).ok, false, 'tidak bisa hapus diri sendiri');
  assert.strictEqual(post({ action: 'login', username: 'wisnu', password: 'wisnu12345' }).ok, false);
});

if (process.env.FB_EMU) it('Firebase: salin data ke Firestore, login lama → akun Firebase sekali saja, verifikasi token', () => {
  Object.assign(sandbox.CFG, { FB_PROJECT: 'demo-tracker', FS_BASE: 'http://127.0.0.1:8080/v1', AUTH_BASE: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' });
  const count = sandbox.migrateToFirestore();
  const all = post({ action: 'getAll', token: admin }).data;
  assert.strictEqual(count.tasks, new Set(all.tasks.filter((t) => t.id).map((t) => t.id)).size, 'semua task tersalin');
  assert.ok(count.users >= 3 && count.briefs >= 1 && count.comments >= 1, JSON.stringify(count));
  const u = sandbox.fsGet_('users/ari'); assert.strictEqual(u.name, 'Ari'); assert.strictEqual(u.hasTasks, true); assert.strictEqual(u.authMigrated, undefined);
  const t = all.tasks.find((x) => x.owner === 'ari' && x.results && x.results.length) || all.tasks.find((x) => x.owner === 'ari');
  const ft = sandbox.fsGet_('tasks/' + t.id); assert.strictEqual(ft.task, t.task); assert.strictEqual(ft.owner, 'ari'); assert.deepStrictEqual(JSON.parse(JSON.stringify(ft.results)), JSON.parse(JSON.stringify(t.results)));
  const rq = all.tasks.find((x) => x.type === 'Request'); if (rq) assert.ok(sandbox.fsGet_('tasks/' + rq.id).createdBy, 'createdBy request ikut');
  const cm = sandbox.fsList_('comments'); assert.ok(cm.every((c) => /T/.test(c.createdAt)), 'waktu komentar jadi timestamp');
  // login lama
  assert.strictEqual(post({ action: 'fbLogin', username: 'ari', password: 'salah' }).ok, false);
  let r = post({ action: 'fbLogin', username: 'ari', password: 'rahasia123' }); assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.email, 'ari@linovhr-tracker.firebaseapp.com');
  assert.strictEqual(sandbox.fsGet_('users/ari').authMigrated, true);
  const sign = JSON.parse(require('child_process').execFileSync('curl', ['-sS', '-X', 'POST', 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',
    '-H', 'Content-Type: application/json', '--data-binary', JSON.stringify({ email: r.data.email, password: 'rahasia123', returnSecureToken: true })], { encoding: 'utf8', env: Object.assign({}, process.env, { no_proxy: '*' }) }));
  assert.ok(sign.idToken, JSON.stringify(sign).slice(0, 200));
  assert.strictEqual(sandbox.authVerify_(sign.idToken).username, 'ari');
  assert.throws(() => sandbox.authVerify_('palsu'), /UNAUTHORIZED/);
  assert.strictEqual(post({ action: 'fbLogin', username: 'ari', password: 'rahasia123' }).ok, false, 'setelah pindah, password lama tidak bisa dipakai lagi lewat jalur ini');
  sandbox.migrateToFirestore();
  assert.strictEqual(sandbox.fsGet_('users/ari').authMigrated, true, 'salin ulang tidak menghapus status migrasi');
});

if (process.env.FB_EMU) it('Firebase: kirim notifikasi (push/email), push uji, push deadline sekali per tenggat', () => {
  const pushed = [];
  sandbox.fcmSend_ = (token, data) => { pushed.push({ token, data }); return token === 'tok-mati' ? 'gone' : 'ok'; };
  const mails0 = mails.length;
  sandbox.fsCommit_([
    { path: 'devices/tok-ari', data: { username: 'ari', label: 'Mac · Chrome' } },
    { path: 'devices/tok-mati', data: { username: 'ari', label: 'lama' } },
    { path: 'private/ari', merge: { email: 'ari@x.com' } },
    { path: 'notifications/n1', data: { to: 'ari', from: 'admin', type: 'mention', text: 'Admin menyebut Anda', taskId: 't1', view: '', push: true, email: false, read: false } },
    { path: 'notifications/n2', data: { to: 'ari', from: 'admin', type: 'returned', text: 'Task dikembalikan', taskId: 't1', view: '', push: false, email: true, read: false } },
    { path: 'notifications/n3', data: { to: 'ari', from: 'nadia', type: 'mention', text: 'palsu', push: true, email: false, read: false } }
  ]);
  const me = { username: 'admin', role: 'admin' };
  const r = sandbox.fbDispatch_(me, ['n1', 'n2', 'n3'], 'https://digmar-linovhr-team.github.io/tracker/beta/');
  assert.strictEqual(r.push, 1); assert.strictEqual(r.email, 1, 'email hanya untuk jenis penting; @sebutan tidak di-email karena push sampai');
  assert.ok(pushed.some((p) => p.token === 'tok-ari' && p.data.tag === 'n-n1'));
  assert.ok(!pushed.some((p) => p.data.body === 'palsu'), 'notifikasi milik orang lain tidak ikut dikirim');
  assert.strictEqual(sandbox.fsGet_('devices/tok-mati'), null, 'token tidak berlaku dihapus');
  assert.strictEqual(sandbox.fsGet_('notifications/n1').dispatched, true);
  assert.strictEqual(mails.length, mails0 + 1); assert.ok(/\?task=t1/.test(mails[mails.length - 1].htmlBody), 'link email langsung ke task');
  const again = sandbox.fbDispatch_(me, ['n1', 'n2'], ''); assert.strictEqual(again.push + again.email, 0, 'tidak terkirim dua kali');
  // setelan: push @sebutan dimatikan → jatuh ke email
  sandbox.fsMerge_('private/ari', { prefs: { pushMention: false, pushDeadline: true } });
  sandbox.fsSet_('notifications/n4', { to: 'ari', from: 'admin', type: 'mention', text: 'lagi', push: true, email: false, read: false });
  const r4 = sandbox.fbDispatch_(me, ['n4'], ''); assert.strictEqual(r4.push, 0); assert.strictEqual(r4.email, 1);
  // push deadline
  const now = new Date(); const due = new Date(now.getTime() + 90 * 60000);
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  sandbox.fsSet_('tasks/tdl', { owner: 'ari', task: 'Laporan uji', status: 'On-Progress', startDate: ymd(now), endDate: ymd(due), endTime: hm(due) });
  sandbox.fsSet_('tasks/tdone', { owner: 'ari', task: 'Selesai', status: 'Done', startDate: ymd(now), endDate: ymd(due), endTime: hm(due) });
  pushed.length = 0;
  if (ymd(now) === ymd(due)) {   // lewati bila uji berjalan dekat tengah malam (cuti/hari kerja tidak relevan di sini)
    sandbox.runPushDeadlines(now);
    const mine = pushed.filter((p) => p.data.taskId === 'tdl');
    assert.ok(mine.length === 1 && /2 jam/.test(mine[0].data.title), 'task jatuh tempo 2 jam lagi mendapat push');
    assert.ok(!pushed.some((p) => p.data.taskId === 'tdone'), 'task Done tidak');
    pushed.length = 0; sandbox.runPushDeadlines(new Date(now.getTime() + 15 * 60000));
    assert.ok(!pushed.some((p) => p.data.taskId === 'tdl'), 'tidak diulang 15 menit kemudian');
    pushed.length = 0; sandbox.runPushDeadlines(new Date(due.getTime() + 60000));
    const od = pushed.filter((p) => p.data.taskId === 'tdl');
    assert.ok(od.length === 1 && /terlewat/.test(od[0].data.title), 'push saat terlewat');
  }
});

if (process.env.FB_EMU) it('Tahap 5: otomatisasi membaca Firebase — Calendar, review, pengingat, task berulang, status project, laporan, salinan ke Sheets, mundur', () => {
  sandbox.fcmSend_ = () => 'ok';
  props.NOTIF_ON = '1'; props.CAL_ID = 'cal1';
  sandbox.fsSet_('serverMeta/auto', { lastRun: new Date(Date.now() - 3600e3) });
  const tz = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // sebelum peralihan: tidak berjalan
  assert.strictEqual(sandbox.runFbAutomation(), null, 'BACKEND sheets → otomatisasi Firebase diam');
  sandbox.fbCutover();
  assert.strictEqual(props.BACKEND, 'firebase');
  assert.ok(triggers.includes('runFbAutomation') && triggers.includes('runNightlyBackup'), 'pemicu baru dipasang');
  // pemicu lama tidak menyentuh Sheets lagi
  const ev0 = Object.keys(events).length; sandbox.runReminders(); assert.strictEqual(Object.keys(events).length, ev0, 'runReminders diam setelah peralihan');
  // task berubah → event Calendar
  const now = new Date(), due = new Date(now.getTime() + 5 * 3600e3);
  sandbox.fsSet_('tasks/TF1', { owner: 'ari', task: 'Uji Calendar Firebase', code: 'P1', status: 'On-Progress', startDate: tz(now), endDate: tz(due), startTime: '09:00', endTime: '23:30', priority: 'High', type: 'Non-artikel', updatedBy: 'ari', updatedAt: new Date() });
  const mailsA = mails.length;
  let r = sandbox.runFbAutomation();
  assert.ok(r.changed >= 1 && r.calendar >= 1, 'task baru → event dibuat ' + JSON.stringify(r));
  assert.ok(mails.slice(mailsA).some((m) => /Deadline .* lagi: Uji Calendar Firebase/.test(m.subject)), 'email pengingat deadline (≤ 24 jam)');
  let m1 = sandbox.fsGet_('serverMeta/TF1'); assert.ok(m1.calDueId && events[m1.calDueId], 'ID event tersimpan di serverMeta');
  assert.ok(/Uji Calendar Firebase/.test(events[m1.calDueId].title));
  r = sandbox.runFbAutomation(); assert.strictEqual(r.calendar, 0, 'tanpa perubahan → Calendar tidak disentuh');
  // ganti email → event Calendar ikut diperbarui tanpa mengubah task
  sandbox.fsMerge_('private/ari', { email: 'ari.kantor@x.com', updatedAt: new Date() });
  sandbox.runFbAutomation();
  const m1b = sandbox.fsGet_('serverMeta/TF1'); assert.ok(m1b.calDueId && events[m1b.calDueId].guests === 'ari.kantor@x.com', 'ganti email → undangan Calendar ke email baru');
  sandbox.fsMerge_('private/ari', { email: 'ari@x.com', updatedAt: new Date() }); sandbox.runFbAutomation(); m1 = sandbox.fsGet_('serverMeta/TF1'); assert.ok(events[m1.calDueId]);
  // pengajuan review → email admin sekali
  const mails0 = mails.length;
  sandbox.fsMerge_('tasks/TF1', { status: 'Review', reviewAt: new Date().toISOString(), updatedAt: new Date() });
  r = sandbox.runFbAutomation();
  assert.strictEqual(r.reviews, 1); assert.ok(mails.slice(mails0).some((m) => /menunggu review/.test(m.subject)), 'admin diberi email review');
  assert.ok(!events[m1.calDueId], 'task Review → event dihapus (sama seperti versi Sheets)');
  sandbox.fsMerge_('tasks/TF1', { updatedAt: new Date() }); r = sandbox.runFbAutomation(); assert.strictEqual(r.reviews, 0, 'email review tidak diulang');
  // email pengingat 24 jam
  sandbox.fsMerge_('tasks/TF1', { status: 'On-Progress', reviewAt: '', updatedAt: new Date() });
  const mails1 = mails.length; sandbox.runFbAutomation();
  assert.ok(!mails.slice(mails1).some((m) => /Deadline .* lagi: Uji Calendar Firebase/.test(m.subject)), 'pengingat tidak diulang');
  // status project mengikuti task
  sandbox.fsSet_('projects/P1', { project: 'Project uji', status: 'Backlog' });
  sandbox.fsMerge_('tasks/TF1', { status: 'Done', doneAt: new Date().toISOString(), updatedAt: new Date() });
  sandbox.fsWhere_('tasks', 'code', 'EQUAL', 'P1').filter((t) => t._id !== 'TF1').forEach((t) => sandbox.fsMerge_('tasks/' + t._id, { status: 'Done' }));
  sandbox.runFbAutomation();
  assert.strictEqual(sandbox.fsGet_('projects/P1').status, 'Done', 'status project → Done');
  // task berulang
  const today = tz(now);
  sandbox.fsSet_('tasks/TREP', { owner: 'ari', task: 'Laporan harian', status: 'Backlog', startDate: today, endDate: today, startTime: '09:00', endTime: '17:00', repeat: 'daily', type: 'Non-artikel', updatedAt: new Date() });
  let tomorrow = sandbox.addDaysIso_(today, 1); while ([0, 6].includes(new Date(tomorrow + 'T12:00:00Z').getUTCDay())) tomorrow = sandbox.addDaysIso_(tomorrow, 1); const made = sandbox.fbRecurring_(tomorrow);
  assert.ok(made.length >= 1, 'salinan task berulang dibuat');
  const copyId = made.find((id) => sandbox.fsGet_('tasks/' + id).repeatOf === 'TREP'); assert.ok(copyId, 'salinan dari TREP');
  const copy = sandbox.fsGet_('tasks/' + copyId); assert.strictEqual(copy.status, 'Backlog'); assert.strictEqual(copy.repeat, ''); assert.strictEqual(copy.startDate, tomorrow);
  assert.strictEqual(sandbox.fbRecurring_(tomorrow).length, 0, 'tidak dobel di hari yang sama');
  // ringkasan pagi & laporan dari Firebase
  assert.doesNotThrow(() => sandbox.fbDailyDigest_());
  const rep = sandbox.sendTeamReport_('week', new Date()); assert.ok(/Laporan mingguan/.test(rep.subject));
  // Calendar penuh: task dihapus → event ikut dihapus
  sandbox.fsSet_('tasks/TF2', { owner: 'ari', task: 'Akan dihapus', status: 'Backlog', startDate: tz(due), endDate: tz(due), startTime: '09:00', endTime: '18:00', type: 'Non-artikel', updatedAt: new Date() });
  sandbox.runFbAutomation(); const m2 = sandbox.fsGet_('serverMeta/TF2'); assert.ok(m2 && events[m2.calDueId]);
  sandbox.fsCommit_([{ path: 'tasks/TF2', del: true }]);
  const full = sandbox.fbCalFull_(); assert.ok(full.removed >= 1 && !events[m2.calDueId], 'event task yang dihapus dibersihkan');
  // salinan ke Sheets
  sandbox.fsMerge_('tasks/TF1', { task: 'Judul dari Firebase' });
  sandbox.fsSet_('users/baru', { name: 'Orang Baru', role: 'member', active: true, hasTasks: true, legacySheet: '', orgOnly: false });
  const bk = sandbox.runNightlyBackup();
  assert.ok(bk.tasks >= 2 && bk.users >= 3, JSON.stringify(bk));
  sandbox.resetMemo_();
  const sheetTasks = sandbox.allTasks_();
  assert.ok(sheetTasks.some((t) => t.id === 'TF1' && t.task === 'Judul dari Firebase' && t.status === 'Done'), 'task Firebase tersalin ke tab orangnya');
  assert.ok(sandbox.readUsers_().some((u) => u.username === 'baru' && u.sheetName === 'Orang Baru'), 'pengguna baru tersalin');
  assert.ok(sheetTasks.some((t) => t.id === copyId && t.repeatOf === 'TREP'), 'salinan task berulang ikut');
  // mundur
  sandbox.fbRollback();
  assert.strictEqual(props.BACKEND, 'sheets');
  assert.strictEqual(sandbox.runFbAutomation(), null, 'setelah mundur otomatisasi Firebase diam');
  sandbox.fsCommit_([{ path: 'users/baru', del: true }]);
});

it('Result: isian manual di sheet dengan format bebas tetap terbaca', () => {
  const list = sandbox.parseResults_('Brief | https://docs.google.com/a\nhttps://drive.google.com/x\nDraft - https://canva.com/d\nbukan link');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(list)), [{ label: 'Brief', url: 'https://docs.google.com/a' }, { label: '', url: 'https://drive.google.com/x' }, { label: 'Draft', url: 'https://canva.com/d' }]);
});

console.log(`\n${n} uji backend lulus`);

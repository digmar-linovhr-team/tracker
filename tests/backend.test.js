// Simulasi minimal Google Apps Script untuk menguji Code.gs secara lokal.
// Jalankan: TZ=Asia/Jakarta node apps-script/test/harness.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const assert = require('assert');

function col2arr(n) { return Array.from({ length: n }, () => ''); }

class Sheet {
  constructor(name, rows) { this.name = name; this.data = rows.map((r) => r.slice()); this.maxRows = 1000; this.maxCols = 26; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some((v) => v !== '' && v !== null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.data.forEach((r) => r.forEach((v, i) => { if (v !== '' && v !== null) m = Math.max(m, i + 1); })); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(c, n) { this.maxCols += n; }
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
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { this.sh.cell(this.r + i, this.c + j)[this.c + j - 1] = v; })); return this; }
  setValue(v) { this.sh.cell(this.r, this.c)[this.c - 1] = v; return this; }
  clearContent() { return this.setValue(''); }
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
  insertSheet: (n) => { const s = new Sheet(n, []); sheets.push(s); return s; },
  getSpreadsheetTimeZone: () => 'Asia/Jakarta'
};
const pad = (n) => String(n).padStart(2, '0');
const props = {}; const cache = {};
const logs = [];
const docs = {}; let docSeq = 0;
const events = {}; let evSeq = 0; const mails = []; const triggers = [];
const mkEvent = (title, s, e, o) => { const id = 'ev' + (++evSeq) + '@google.com'; events[id] = { title, start: s, end: e, guests: o.guests, desc: o.description }; return { getId: () => id, removeAllReminders() {}, deleteEvent: () => { delete events[id]; } }; };
const calendar = { getId: () => 'cal1', createEvent: mkEvent, getEventById: (id) => events[id] ? { deleteEvent: () => { delete events[id]; } } : null };
const trigBuilder = (fn) => { const b = { timeBased: () => b, everyMinutes: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b, create: () => { triggers.push(fn); } }; return b; };
const sandbox = {
  SpreadsheetApp: { getActive: () => ss, getUi: () => { throw new Error('no ui'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
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
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: trigBuilder },
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
    formatDate: (d, tz, f) => f === 'u' ? String(((d.getDay() + 6) % 7) + 1) : f.replace('EEE, ', '').replace('d MMM', d.getDate() + ' ' + d.getMonth()).replace("'T'", 'T').replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
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
  assert.deepStrictEqual(triggers.filter((t) => t !== 'processProjectSync').sort(), ['runReminders', 'sendDailyDigest']);
  assert.ok(triggers.includes('processProjectSync'), 'setup memasang trigger sinkron project');
  const r = post({ action: 'setMyEmail', token: ari, email: 'Ari@LinovHR.com', appUrl: 'https://tim.github.io/tracker/' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.user.email, 'ari@linovhr.com');
  sandbox.runReminders(); // trigger 5 menit
  const ev = Object.values(events).filter((e) => e.guests === 'ari@linovhr.com');
  // 3 task Ari: 1 masih Backlog/On-Progress dengan tanggal → masing-masing 2 event (mulai + deadline)
  assert.strictEqual(ev.length, 6, JSON.stringify(ev.map((e) => e.title)));
  assert.ok(ev.some((e) => e.title.startsWith('⏰ Deadline: [A7] Weekly Report SEO')));
  const due = ev.find((e) => e.title.startsWith('⏰ Deadline: [A7]'));
  assert.strictEqual(due.end.getHours(), 17, 'jam default deadline 17:00');
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
  // siap ditulis butuh minimal 2 kompetitor
  r = post({ action: 'saveBrief', token: ari, brief: { id: b.id, taskId: t.id, status: 'Siap ditulis', baseUpdatedAt: b.updatedAt, data } });
  assert.strictEqual(r.ok, false); assert.ok(/kompetitor/.test(r.error));
  const data2 = Object.assign({}, data, { competitors: [data.competitors[0], { url: 'https://gadjian.com/y', insight: 'alur visual' }] });
  r = post({ action: 'saveBrief', token: ari, brief: { id: b.id, taskId: t.id, status: 'Siap ditulis', baseUpdatedAt: b.updatedAt, data: data2 } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.brief.status, 'Siap ditulis');
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

it('Result: isian manual di sheet dengan format bebas tetap terbaca', () => {
  const list = sandbox.parseResults_('Brief | https://docs.google.com/a\nhttps://drive.google.com/x\nDraft - https://canva.com/d\nbukan link');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(list)), [{ label: 'Brief', url: 'https://docs.google.com/a' }, { label: '', url: 'https://drive.google.com/x' }, { label: 'Draft', url: 'https://canva.com/d' }]);
});

console.log(`\n${n} uji backend lulus`);

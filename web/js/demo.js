(function (root) {
// Backend tiruan untuk "Mode demo" — tidak menyentuh Google Sheets.
// Isinya meniru struktur sheet "KPI dan Tracker".
const people = [
  ['ari', 'Ari'], ['ammar', 'Ammar'], ['fahmi', 'Fahmi'], ['winona', 'Winona'],
  ['dany', 'Dany'], ['arya', 'Arya'], ['wisnu', 'Wisnu']
];

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(base, n, h = 0, m = 0) {
  const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d;
}

function build() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const projects = [
    ['A1', 'Optimasi +- 48 article (144 keyword) LinovHR', 'Ari, Fahmi, Ammar, Winona', -2, 33, 'High', 'On-Progress'],
    ['A2', 'Membuat tracking AIO dan visibilitas AI untuk LinovHR', 'Arya, Wisnu', -2, 15, 'High', 'On-Progress'],
    ['A3', 'Membuat NavBar untuk frontend compro LinovHR', 'Arya', -2, 6, 'High', 'On-Progress'],
    ['A5', 'Membuat Sisa Page Solusi (Logistik, Construction, Mining, dll.)', 'Dany', -2, 11, 'High', 'On-Progress'],
    ['A6', 'Report competitor Lawencon di tender terbaru', 'Wisnu', -2, 0, 'High', 'Backlog'],
    ['A7', 'Weekly Report SEO', 'Ari', null, null, 'Medium', 'Recurring'],
    ['A8', 'Company profile deck 2027', 'Dany', 3, 10, 'Medium', 'Backlog'],
    ['B2', 'Fixing Technical Issue - Page with Redirect URL', 'Wisnu, Ari', 0, 33, 'Low', 'Backlog'],
    ['B3', 'Membuat skema FAQ untuk semua possible Landing Page LinovHR', 'Wisnu', 1, 1, 'High', 'Backlog']
  ].map((p, i) => ({
    row: i + 2, code: p[0], project: p[1], pic: p[2],
    start: p[3] === null ? '' : iso(addDays(today, p[3])), startRaw: p[3] === null ? 'Recurring' : '',
    end: p[4] === null ? '' : iso(addDays(today, p[4])), endRaw: p[4] === null ? 'Recurring' : '',
    priority: p[5], status: p[6]
  }));

  const tasks = [];
  let n = 0;
  const add = (owner, code, task, sd, st, ed, et, status, extra = {}) => {
    const name = people.find((p) => p[0] === owner)[1];
    tasks.push(Object.assign({
      id: 'TDEMO' + (++n), owner, ownerName: name, sheet: name, row: n + 1, code, task,
      startDate: sd === null ? '' : iso(addDays(today, sd)), endDate: ed === null ? '' : iso(addDays(today, ed)),
      startRaw: '', endRaw: '', startTime: st, endTime: et, status, priority: 'Medium',
      startedAt: '', doneAt: '', reviewAt: '', notes: '', results: [], resultNote: ''
    }, extra));
  };
  const stamp = (d, h, m) => addDays(today, d, h, m).toISOString();
  const now = new Date();
  const nowH = now.getHours();

  // Ari
  add('ari', 'A1', 'https://www.linovhr.com/blog/aplikasi-hr-terbaik-era-digital/', -2, '09:00', 1, '17:00', 'On-Progress', { startedAt: stamp(-2, 9, 20), priority: 'High', results: [{ label: 'Brief konten', url: 'https://docs.google.com/document/d/1demoBrief/edit' }, { label: '', url: 'https://www.figma.com/file/demoHero/Hero' }] });
  add('ari', 'B2', 'Fixing Technical Issue - Page with Redirect URL', 0, '13:00', 33, '17:00', 'Backlog', { priority: 'Low' });
  add('ari', 'A1', 'https://www.linovhr.com/blog/talent-management-strategy/', 1, '09:00', 5, '17:00', 'Backlog');
  add('ari', 'A7', 'Weekly Report SEO', 5, '09:00', 5, '12:00', 'Backlog');
  add('ari', 'A1', 'https://www.linovhr.com/blog/hris-indonesia/', -9, '09:00', -6, '17:00', 'Done', { startedAt: stamp(-9, 9, 5), doneAt: stamp(-7, 15, 30) });
  add('ari', 'A7', 'Weekly Report SEO', -2, '09:00', -2, '12:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-2, 11, 10) });
  // Ammar
  add('ammar', 'A1', 'https://www.linovhr.com/blog/payroll-outsourcing/', -6, '09:00', -3, '17:00', 'Done', { startedAt: stamp(-6, 9, 30), doneAt: stamp(-3, 16, 40) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/aplikasi-absensi/', -3, '09:00', -1, '17:00', 'On-Progress', { startedAt: stamp(-3, 10, 0) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/kpi-karyawan/', 0, String(Math.min(nowH + 1, 22)).padStart(2, '0') + ':00', 2, '17:00', 'Backlog', { priority: 'High' });
  // Fahmi
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/employee-engagement/', -8, '09:00', -5, '17:00', 'Done', { startedAt: stamp(-8, 9, 0), doneAt: stamp(-7, 14, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/onboarding-karyawan/', -4, '09:00', -2, '17:00', 'Done', { startedAt: stamp(-4, 9, 15), doneAt: stamp(-2, 16, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/offboarding/', 0, '09:00', 3, '17:00', 'On-Progress', { startedAt: stamp(0, 9, 5) });
  // Winona
  add('winona', 'A1', 'https://www.linovhr.com/blog/hr-analytics/', -7, '09:00', -4, '17:00', 'Done', { startedAt: stamp(-7, 9, 0), doneAt: stamp(-3, 10, 30) });
  add('winona', 'A1', 'https://www.linovhr.com/blog/reimbursement/', -1, '09:00', 2, '17:00', 'Review', { startedAt: stamp(-1, 9, 40), reviewAt: new Date(Date.now() - 2 * 36e5).toISOString(), notes: 'Fokus keyword "reimbursement karyawan"', resultNote: 'Sudah tambah meta description dan 3 internal link ke artikel payroll. Gambar ilustrasi ada di folder Drive.', results: [
    { label: 'Draft artikel', url: 'https://docs.google.com/document/d/1demoReimburse/edit' },
    { label: 'Folder gambar', url: 'https://drive.google.com/drive/folders/1demoImg' }] });
  // Dany
  add('dany', 'A5', 'Page Solusi — Logistik', -5, '09:00', -3, '17:00', 'Done', { startedAt: stamp(-5, 9, 0), doneAt: stamp(-4, 15, 0) });
  add('dany', 'A5', 'Page Solusi — Construction', -3, '09:00', -1, '17:00', 'Done', { startedAt: stamp(-3, 9, 0), doneAt: stamp(-1, 17, 0) });
  add('dany', 'A5', 'Page Solusi — Mining', 0, '09:00', 1, '17:00', 'On-Progress', { startedAt: stamp(0, 9, 10) });
  // Arya
  add('arya', 'A3', 'NavBar — struktur menu & mega menu', -2, '09:00', 0, '17:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-1, 13, 0) });
  add('arya', 'A2', 'Setup tracking visibilitas AI Overview', -2, '09:00', 4, '17:00', 'Review', { startedAt: stamp(-2, 11, 0), reviewAt: new Date(Date.now() - 40 * 60000).toISOString(), resultNote: 'Tracking 25 keyword utama sudah jalan; rekap mingguan ada di Slides.', results: [
    { label: 'Dashboard AIO', url: 'https://docs.google.com/spreadsheets/d/1demoAIO/edit' },
    { label: 'Slides laporan', url: 'https://docs.google.com/presentation/d/1demoSlides/edit' },
    { label: '', url: 'https://lookerstudio.google.com/reporting/demo' }] });
  // Wisnu
  add('wisnu', 'A6', 'Discuss dengan Koh Yos terkait competitor Lawencon + report', -2, '09:00', 0, '12:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'B3', 'Skema FAQ untuk semua landing page LinovHR', 1, '09:00', 1, '17:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'A2', 'Riset tools AIO tracking', -9, '09:00', -6, '17:00', 'Done', { startedAt: stamp(-9, 9, 0), doneAt: stamp(-5, 11, 0) });

  const users = [['admin', 'Administrator', 'admin', '']].concat(people.map((p) => [p[0], p[1], 'member', p[1]]))
    .map((u) => ({ username: u[0], name: u[1], role: u[2], sheetName: u[3], mustChange: false, active: true, email: u[0] === 'wisnu' ? '' : u[0] + '@contoh.com',
      position: { ari: 'SEO Specialist', ammar: 'Content Writer', fahmi: 'Content Writer', winona: 'Content Writer Intern', dany: 'Frontend Developer', arya: 'Frontend Developer', wisnu: 'Digital Marketing Lead' }[u[0]] || '' }));
  return { projects, tasks, users };
}

let db = null;
function state() { if (!db) db = build(); return db; }
function reset() { db = null; }

const ST = ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'];
function syncProj(s, codes) {
  const out = [];
  codes.filter(Boolean).forEach((code) => {
    const st = s.tasks.filter((t) => t.code === code).map((t) => t.status || 'Backlog');
    s.projects.filter((p) => p.code === code).forEach((p) => {
      let n = null;
      if (st.length === 1) n = ST.includes(st[0]) ? st[0] : null;
      else if (st.length > 1) n = st.every((x) => x === 'Done') ? 'Done' : (p.status === 'Done' ? 'On-Progress' : null);
      if (n && n !== p.status) { p.status = n; out.push({ code, status: n }); }
    });
  });
  return out;
}

function handle(action, b, session) {
  const s = state();
  const me = session && s.users.find((u) => u.username === session.username);
  switch (action) {
    case 'ping': return { ok: true };
    case 'login': {
      const u = s.users.find((x) => x.username === String(b.username || '').toLowerCase());
      if (!u || b.password !== 'demo') throw new Error('Mode demo: pakai username admin / ari / wisnu dst., password "demo"');
      return { token: 'demo.' + u.username, user: u };
    }
  }
  if (!me) throw new Error('UNAUTHORIZED');
  switch (action) {
    case 'me': return me;
    case 'changePassword': return { user: me };
    case 'setMyEmail': me.email = String(b.email || '').toLowerCase(); return { user: me };
    case 'myTasks': return { tasks: s.tasks.filter((t) => t.owner === me.username), projects: s.projects, me };
    case 'teamTasks': return { tasks: s.tasks, users: s.users.filter((u) => u.sheetName).map((u) => ({ username: u.username, name: u.name, position: u.position || '' })), projects: s.projects };
    case 'setResults': {
      const t = s.tasks.find((x) => x.id === b.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (me.role !== 'admin' && t.status === 'Done') throw new Error('Task ini sudah disetujui admin, link tidak bisa diubah lagi.');
      const list = (b.results || []).filter((x) => x && x.url);
      if (list.some((x) => !/^https?:\/\/\S+$/i.test(x.url))) throw new Error('Link harus diawali http:// atau https://');
      if (list.length > 10) throw new Error('Maksimal 10 link per task');
      t.results = list.map((x) => ({ label: String(x.label || '').slice(0, 80), url: x.url }));
      if (b.note !== undefined) { if (String(b.note).length > 2000) throw new Error('Keterangan hasil maksimal 2000 karakter'); t.resultNote = String(b.note); }
      return { task: t };
    }
    case 'updateStatus': {
      const t = s.tasks.find((x) => x.id === b.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (me.role !== 'admin' && b.status === 'Done') throw new Error('Hanya admin yang bisa menandai Done. Ajukan review agar diperiksa admin.');
      if (me.role !== 'admin' && t.status === 'Done') throw new Error('Task ini sudah disetujui admin.');
      if (b.status === 'Review' && t.status !== 'Review') t.reviewAt = new Date().toISOString();
      if (b.status === 'On-Progress' && !t.startedAt) t.startedAt = new Date().toISOString();
      if (b.status === 'Done') t.doneAt = new Date().toISOString();
      else if (t.status === 'Done') t.doneAt = '';
      t.status = b.status;
      return { task: t, projects: syncProj(s, [t.code]) };
    }
  }
  if (me.role !== 'admin') throw new Error('Hanya admin yang boleh melakukan ini');
  switch (action) {
    case 'getAll': return { tasks: s.tasks, projects: s.projects, users: s.users, notifications: true,
      statuses: ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'], priorities: ['High', 'Medium', 'Low'] };
    case 'saveTask': {
      const t = b.task; const owner = s.users.find((u) => u.username === t.owner);
      if (!owner) throw new Error('Penanggung jawab tidak ditemukan');
      let saved, oldCode = '';
      if (t.id) { saved = s.tasks.find((x) => x.id === t.id); oldCode = saved.code; Object.assign(saved, t, { ownerName: owner.name }); }
      else { saved = Object.assign({ startedAt: '', doneAt: '', reviewAt: '', results: [], resultNote: '' }, t, { id: 'TDEMO' + Date.now(), ownerName: owner.name }); s.tasks.push(saved); }
      return { id: saved.id, task: saved, projects: syncProj(s, [saved.code, oldCode]) };
    }
    case 'deleteTask': { const old = s.tasks.find((x) => x.id === b.taskId); s.tasks = s.tasks.filter((x) => x.id !== b.taskId); return { ok: true, projects: syncProj(s, [old && old.code]) }; }
    case 'reviewQueue': return { tasks: s.tasks.filter((x) => x.status === 'Review') };
    case 'reviewTask': {
      const t = s.tasks.find((x) => x.id === b.taskId);
      if (!t) throw new Error('Task tidak ditemukan');
      if (b.decision === 'approve') { t.status = 'Done'; t.doneAt = new Date().toISOString(); if (!t.reviewAt) t.reviewAt = t.doneAt; }
      else {
        t.status = 'On-Progress'; t.doneAt = ''; t.reviewAt = '';
        const d = new Date(); const line = `[Dikembalikan ${d.getDate()}/${d.getMonth() + 1} oleh ${me.name}]` + (b.reason ? ' ' + b.reason : '');
        t.notes = t.notes ? t.notes + '\n' + line : line;
      }
      return { task: t, projects: syncProj(s, [t.code]) };
    }
    case 'saveProject': {
      const p = b.project;
      if (p.row) Object.assign(s.projects.find((x) => x.row === p.row), p);
      else s.projects.push(Object.assign({}, p, { row: Math.max(...s.projects.map((x) => x.row)) + 1 }));
      return { ok: true };
    }
    case 'deleteProject': s.projects = s.projects.filter((x) => x.row !== b.row); return { ok: true };
    case 'saveUser': {
      const u = b.user; const ex = s.users.find((x) => x.username === u.username);
      if (ex) { Object.assign(ex, u); return { user: ex }; }
      const nu = { username: u.username, name: u.name, role: u.role, sheetName: u.hasTasks === false ? '' : u.name, mustChange: true, active: true, email: u.email || '', position: u.position || '' };
      s.users.push(nu); return { user: nu, password: 'demo' };
    }
    case 'resetPassword': return { password: 'demo' };
  }
  throw new Error('Aksi tidak dikenal');
}

root.PTDemo = { handle };
})(typeof self !== 'undefined' ? self : this);

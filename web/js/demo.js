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
  add('ari', 'A1', 'https://www.linovhr.com/blog/aplikasi-hr-terbaik-era-digital/', -2, '09:00', 1, '18:00', 'On-Progress', { startedAt: stamp(-2, 9, 20), priority: 'High', results: [{ label: 'Brief konten', url: 'https://docs.google.com/document/d/1demoBrief/edit' }, { label: '', url: 'https://www.figma.com/file/demoHero/Hero' }] });
  add('ari', 'B2', 'Fixing Technical Issue - Page with Redirect URL', 0, '13:00', 33, '18:00', 'Backlog', { priority: 'Low' });
  add('ari', 'A1', 'https://www.linovhr.com/blog/talent-management-strategy/', 1, '09:00', 5, '18:00', 'Backlog');
  add('ari', 'A7', 'Weekly Report SEO', 5, '09:00', 5, '12:00', 'Backlog');
  add('ari', 'A1', 'https://www.linovhr.com/blog/hris-indonesia/', -9, '09:00', -6, '18:00', 'Done', { startedAt: stamp(-9, 9, 5), doneAt: stamp(-7, 15, 30) });
  add('ari', 'A7', 'Weekly Report SEO', -2, '09:00', -2, '12:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-2, 11, 10) });
  // Ammar
  add('ammar', 'A1', 'https://www.linovhr.com/blog/payroll-outsourcing/', -6, '09:00', -3, '18:00', 'Done', { startedAt: stamp(-6, 9, 30), doneAt: stamp(-3, 16, 40) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/aplikasi-absensi/', -3, '09:00', -1, '18:00', 'On-Progress', { startedAt: stamp(-3, 10, 0) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/kpi-karyawan/', 0, String(Math.min(nowH + 1, 22)).padStart(2, '0') + ':00', 2, '18:00', 'Backlog', { priority: 'High' });
  // Fahmi
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/employee-engagement/', -8, '09:00', -5, '18:00', 'Done', { startedAt: stamp(-8, 9, 0), doneAt: stamp(-7, 14, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/onboarding-karyawan/', -4, '09:00', -2, '18:00', 'Done', { startedAt: stamp(-4, 9, 15), doneAt: stamp(-2, 16, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/offboarding/', 0, '09:00', 3, '18:00', 'On-Progress', { startedAt: stamp(0, 9, 5) });
  // Winona
  add('winona', 'A1', 'https://www.linovhr.com/blog/hr-analytics/', -7, '09:00', -4, '18:00', 'Done', { startedAt: stamp(-7, 9, 0), doneAt: stamp(-3, 10, 30) });
  add('winona', 'A1', 'https://www.linovhr.com/blog/reimbursement/', -1, '09:00', 2, '18:00', 'Review', { startedAt: stamp(-1, 9, 40), reviewAt: new Date(Date.now() - 2 * 36e5).toISOString(), notes: 'Fokus keyword "reimbursement karyawan"', resultNote: 'Sudah tambah meta description dan 3 internal link ke artikel payroll. Gambar ilustrasi ada di folder Drive.', results: [
    { label: 'Draft artikel', url: 'https://docs.google.com/document/d/1demoReimburse/edit' },
    { label: 'Folder gambar', url: 'https://drive.google.com/drive/folders/1demoImg' }] });
  // Dany
  add('dany', 'A5', 'Page Solusi — Logistik', -5, '09:00', -3, '18:00', 'Done', { startedAt: stamp(-5, 9, 0), doneAt: stamp(-4, 15, 0) });
  add('dany', 'A5', 'Page Solusi — Construction', -3, '09:00', -1, '18:00', 'Done', { startedAt: stamp(-3, 9, 0), doneAt: stamp(-1, 17, 0) });
  add('dany', 'A5', 'Page Solusi — Mining', 0, '09:00', 1, '18:00', 'On-Progress', { startedAt: stamp(0, 9, 10) });
  // Arya
  add('arya', 'A3', 'NavBar — struktur menu & mega menu', -2, '09:00', 0, '18:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-1, 13, 0) });
  add('arya', 'A2', 'Setup tracking visibilitas AI Overview', -2, '09:00', 4, '18:00', 'Review', { startedAt: stamp(-2, 11, 0), reviewAt: new Date(Date.now() - 40 * 60000).toISOString(), resultNote: 'Tracking 25 keyword utama sudah jalan; rekap mingguan ada di Slides.', results: [
    { label: 'Dashboard AIO', url: 'https://docs.google.com/spreadsheets/d/1demoAIO/edit' },
    { label: 'Slides laporan', url: 'https://docs.google.com/presentation/d/1demoSlides/edit' },
    { label: '', url: 'https://lookerstudio.google.com/reporting/demo' }] });
  // Wisnu
  add('wisnu', 'A6', 'Discuss dengan Koh Yos terkait competitor Lawencon + report', -2, '09:00', 0, '12:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'B3', 'Skema FAQ untuk semua landing page LinovHR', 1, '09:00', 1, '18:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'A2', 'Riset tools AIO tracking', -9, '09:00', -6, '18:00', 'Done', { startedAt: stamp(-9, 9, 0), doneAt: stamp(-5, 11, 0) });

  const users = [['admin', 'Administrator', 'admin', '']].concat(people.map((p) => [p[0], p[1], 'member', p[1]]))
    .map((u) => ({ username: u[0], name: u[1], role: u[2], sheetName: u[3], mustChange: false, active: true, email: u[0] === 'wisnu' ? '' : u[0] + '@contoh.com',
      position: { ari: 'SEO Specialist', ammar: 'Content Writer', fahmi: 'Content Writer', winona: 'Content Writer Intern', dany: 'Frontend Developer', arya: 'Frontend Developer', wisnu: 'Digital Marketing Lead' }[u[0]] || '' }));
  // Task artikel (A1 berupa URL blog): jenis, tahap, dan riwayat tahap untuk contoh KPI
  const ST_STATUS = ['', 'Backlog', 'On-Progress', 'Review', 'On-Progress', 'Review', 'On-Progress', 'On-Progress', 'Review', 'Done'];
  const artStage = { '/aplikasi-hr-terbaik-era-digital/': 4, '/talent-management-strategy/': 1, '/hris-indonesia/': 9, '/payroll-outsourcing/': 9,
    '/aplikasi-absensi/': 2, '/kpi-karyawan/': 3, '/employee-engagement/': 9, '/onboarding-karyawan/': 9, '/offboarding/': 8, '/hr-analytics/': 9, '/reimbursement/': 5 };
  tasks.forEach((t) => {
    const key = Object.keys(artStage).find((k) => t.task.includes(k));
    if (!key) { t.type = 'Non-artikel'; return; }
    const st = artStage[key];
    t.type = 'Artikel'; t.stage = st; t.status = ST_STATUS[st];
    const from = new Date(t.startedAt || (t.startDate + 'T09:00:00')), to = st === 9 ? new Date(t.doneAt) : new Date(Date.now() - 45 * 60000);
    const steps = st === 9 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : Array.from({ length: st }, (_, i) => i + 1);
    t.stageLog = steps.map((s2, i) => ({ s: s2, t: new Date(+from + ((to - from) * i) / Math.max(steps.length - 1, 1)).toISOString() }));
    if (ST_STATUS[st] === 'Review') t.reviewAt = t.stageLog[t.stageLog.length - 1].t;
    if (st >= 7) t.liveUrl = t.task;
    if (st >= 8) t.aiCheckUrl = 'https://docs.google.com/document/d/demo-aicheck-' + t.id + '/edit';
    if (st >= 5 && !t.results.length) t.results = [{ label: 'Draft artikel', url: 'https://docs.google.com/document/d/demo-' + t.id + '/edit' }];
  });
  const tid = (frag) => (tasks.find((t) => t.task.includes(frag)) || {}).id;
  const briefs = [
    { id: 'BRDEMO1', taskId: tid('/reimbursement/'), owner: 'winona', createdBy: 'wisnu', type: 'Informasional', status: 'Siap ditulis', docUrl: '',
      createdAt: stamp(-2, 10, 0), updatedAt: stamp(-1, 9, 0), updatedBy: 'winona',
      data: { v: 2, kwMain: 'reimbursement karyawan', kwSecondary: ['reimbursement adalah', 'contoh form reimbursement', 'alur reimbursement'],
        competitors: [{ url: 'https://www.talenta.co/blog/reimbursement/', insight: 'Punya contoh form siap unduh — kita perlu template juga. Belum membahas pajak.' },
          { url: 'https://www.gadjian.com/blog/reimbursement/', insight: 'Alur visual jelas, tapi data 2022 dan tanpa FAQ.' }],
        h1: 'Reimbursement Karyawan: Pengertian, Alur, dan Contoh Form', contentType: 'Informasional', wordEst: '1.800 – 2.200',
        metaTitle: 'Reimbursement Karyawan: Alur & Contoh Form (2026)', metaDesc: 'Pelajari alur reimbursement karyawan, perlakuan pajaknya, dan unduh contoh form gratis.',
        intro: 'Masalah klaim biaya yang lambat & rawan hilang bukti; kenalkan istilah reimbursement.',
        sections: [
          { h2: 'Apa itu reimbursement karyawan', points: 'Definisi singkat 40–50 kata, beda dengan tunjangan.', sources: ['https://www.pajak.go.id/id/pph-pasal-21'], h3: [] },
          { h2: 'Jenis-jenis reimbursement', points: 'Gambaran umum jenis klaim yang paling sering.', sources: [''],
            h3: [{ title: 'Reimbursement medis', points: 'Plafon, bukti kwitansi, contoh kasus' }, { title: 'Reimbursement transportasi', points: 'Perjalanan dinas, BBM, tol' }] },
          { h2: 'Alur pengajuan reimbursement', points: 'Langkah bernomor + infografik.', sources: ['UU No. 36 Tahun 2008 tentang PPh'], h3: [] }],
        ctaPage: '/fitur/reimbursement', ctaText: 'Coba demo gratis modul Reimbursement',
        internalLinks: [{ url: '/blog/pph-21/', anchor: 'perhitungan PPh 21' }, { url: '/blog/aplikasi-hr/', anchor: 'aplikasi HR' }],
        externalLinks: [{ url: 'https://www.pajak.go.id/', anchor: 'ketentuan DJP' }],
        faq: [{ q: 'Apakah reimbursement kena pajak?', a: 'Umumnya tidak, selama berupa penggantian biaya dengan bukti.' }, { q: 'Berapa lama proses reimbursement?', a: 'Tergantung kebijakan perusahaan, biasanya 3–14 hari kerja.' }],
        extras: ['Infographic', 'Tabel perbandingan'], extraNote: 'Infografik alur pengajuan 5 langkah' } },
    { id: 'BRDEMO2', taskId: tid('/aplikasi-absensi/'), owner: 'ammar', createdBy: 'ammar', type: 'Consideration', status: 'Draft', docUrl: '',
      createdAt: stamp(-3, 11, 0), updatedAt: stamp(-1, 15, 0), updatedBy: 'ammar',
      data: { v: 2, kwMain: 'aplikasi absensi', kwSecondary: ['aplikasi absensi online'], contentType: 'Consideration', h1: 'Aplikasi Absensi Online Terbaik 2026',
        competitors: [{ url: 'https://www.talenta.co/blog/aplikasi-absensi/', insight: '' }, { url: '', insight: '' }], sections: [{ h2: 'Kriteria aplikasi absensi yang baik', points: '', sources: [''], h3: [] }] } },
    { id: 'BRDEMO3', taskId: tid('/hr-analytics/'), owner: 'winona', createdBy: 'winona', type: 'Informasional', status: 'Siap ditulis', docUrl: '',
      createdAt: stamp(-8, 9, 0), updatedAt: stamp(-4, 9, 0), updatedBy: 'winona',
      data: { v: 2, kwMain: 'hr analytics', h1: 'HR Analytics: Pengertian dan Cara Menerapkannya', contentType: 'Informasional', wordEst: '1.500',
        competitors: [{ url: 'https://a.com', insight: '' }, { url: 'https://b.com', insight: '' }], sections: [{ h2: 'Apa itu HR analytics', points: '', sources: [''], h3: [] }] } }
    ,{ id: 'BRDEMO4', taskId: tid('/kpi-karyawan/'), owner: 'ammar', createdBy: 'ammar', type: 'Informasional', status: 'Diajukan', docUrl: '',
      createdAt: stamp(0, 8, 0), updatedAt: stamp(0, 8, 30), updatedBy: 'ammar',
      data: { v: 2, kwMain: 'kpi karyawan', kwSecondary: ['contoh kpi karyawan', 'cara menentukan kpi'], h1: 'KPI Karyawan: Pengertian, Contoh, dan Cara Menyusunnya', contentType: 'Informasional', wordEst: '2.000',
        metaTitle: 'KPI Karyawan: Contoh & Cara Menyusun (2026)', metaDesc: 'Panduan menyusun KPI karyawan lengkap dengan contoh per divisi.',
        competitors: [{ url: 'https://www.talenta.co/blog/kpi/', insight: 'Contoh per divisi lengkap' }, { url: 'https://www.gadjian.com/blog/kpi/', insight: 'Tanpa template' }],
        intro: 'Kenapa KPI penting untuk penilaian kinerja.', sections: [{ h2: 'Apa itu KPI karyawan', points: 'Definisi + beda dengan OKR', sources: [''], h3: [] }, { h2: 'Contoh KPI per divisi', points: 'HR, sales, marketing, finance', sources: [''], h3: [] }],
        ctaPage: '/fitur/performance-management', ctaText: 'Coba modul Performance', internalLinks: [], externalLinks: [], faq: [], extras: ['Template unduhan'] } }
  ].filter((b) => b.taskId).map((b) => Object.assign(b, { keyword: b.data.kwMain || '', title: b.data.h1 || '' }));
  return { projects, tasks, users, briefs };
}

let db = null;
function state() { if (!db) db = build(); return db; }
function reset() { db = null; }

function demoStage(t, next, me) {
  const STS = ['', 'Backlog', 'On-Progress', 'Review', 'On-Progress', 'Review', 'On-Progress', 'On-Progress', 'Review', 'Done'];
  const now = new Date().toISOString();
  t.stageLog = (t.stageLog || []).concat({ s: next, t: now, by: me && me.username });
  t.stage = next; t.status = STS[next];
  if (STS[next] === 'Review') t.reviewAt = now;
  if (!t.startedAt && next >= 2) t.startedAt = now;
  t.doneAt = next === 9 ? now : '';
}
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
    case 'myTasks': return { tasks: s.tasks.filter((t) => t.owner === me.username), projects: s.projects, me, briefs: s.briefs };
    case 'briefs': return { briefs: s.briefs };
    case 'teamTasks': return { tasks: s.tasks, users: s.users.filter((u) => u.sheetName).map((u) => ({ username: u.username, name: u.name, position: u.position || '' })), projects: s.projects, briefs: s.briefs };
    case 'saveBrief': {
      const br = b.brief || {};
      const t = s.tasks.find((x) => x.id === br.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (t.type === 'Artikel' && me.role !== 'admin' && (t.stage || 1) >= 3) throw new Error('Brief sudah diajukan ke admin, jadi tidak bisa diubah lagi.');
      if (s.briefs.some((x) => x.taskId === br.taskId && x.id !== br.id)) throw new Error('Task ini sudah punya brief. Buka brief yang ada dari menu Brief.');
      if (JSON.stringify(br.data || {}).length > 45000) throw new Error('Isi brief terlalu panjang');
      if (br.status === 'Siap ditulis' && ((br.data && br.data.competitors) || []).filter((c) => c && c.url).length < 2) throw new Error('Lengkapi dulu: minimal 2 link kompetitor.');
      const now = new Date().toISOString();
      let cur = br.id && s.briefs.find((x) => x.id === br.id);
      if (br.id && !cur) throw new Error('Brief tidak ditemukan');
      if (cur && br.baseUpdatedAt && cur.updatedAt !== br.baseUpdatedAt) throw new Error('Brief ini baru saja diubah oleh ' + cur.updatedBy + '. Muat ulang supaya perubahannya tidak tertimpa.');
      if (!cur) { cur = { id: 'BRDEMO' + Date.now(), createdBy: me.username, createdAt: now, docUrl: '', status: 'Draft' }; s.briefs.push(cur); if (t.type === 'Artikel' && (t.stage || 1) === 1) demoStage(t, 2, me); }
      Object.assign(cur, { taskId: br.taskId, owner: t.owner, type: br.type || 'Informasional', data: br.data || {},
        keyword: (br.data && br.data.kwMain) || '', title: (br.data && br.data.h1) || '', updatedAt: now, updatedBy: me.username });
      return { brief: cur };
    }
    case 'deleteBrief': s.briefs = s.briefs.filter((x) => x.id !== b.briefId); return { ok: true };
    case 'exportBriefDoc': {
      const cur = s.briefs.find((x) => x.id === b.briefId); if (!cur) throw new Error('Brief tidak ditemukan');
      cur.docUrl = cur.docUrl || 'https://docs.google.com/document/d/demo-' + cur.id + '/edit';
      return { url: cur.docUrl, brief: cur };
    }
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
    case 'advanceStage': {
      const t = s.tasks.find((x) => x.id === b.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (t.type !== 'Artikel') throw new Error('Task ini bukan task artikel.');
      const st = t.stage || 1, want = { start: 1, submitBrief: 2, submitArticle: 4, publish: 6, submitAiCheck: 7 }[b.step];
      if (st !== want) throw new Error('Task ini sedang di tahap lain. Muat ulang data.');
      if (b.step === 'submitBrief') {
        const br = s.briefs.find((x) => x.taskId === t.id);
        if (!br) throw new Error('Buat brief dulu sebelum diajukan.');
        const d = br.data || {}, miss = [];
        if (!String(d.kwMain || '').trim()) miss.push('keyword utama');
        if (!String(d.h1 || '').trim()) miss.push('H1');
        if ((d.competitors || []).filter((c) => c && c.url).length < 2) miss.push('minimal 2 link kompetitor');
        if (!(d.sections || []).some((x) => x && String(x.h2 || '').trim())) miss.push('minimal 1 H2');
        if (miss.length) throw new Error('Lengkapi brief dulu: ' + miss.join(', ') + '.');
        br.status = 'Diajukan';
      }
      if (b.step === 'submitArticle' && !(t.results || []).length) throw new Error('Tambahkan link Docs artikel di "Hasil kerja" sebelum mengajukan review.');
      if ((b.step === 'publish' || b.step === 'submitAiCheck') && !/^https?:\/\/\S+$/i.test(String(b.url || ''))) throw new Error('Link harus diawali http:// atau https://');
      if (b.step === 'publish') t.liveUrl = b.url;
      if (b.step === 'submitAiCheck') t.aiCheckUrl = b.url;
      demoStage(t, { start: 2, submitBrief: 3, submitArticle: 5, publish: 7, submitAiCheck: 8 }[b.step], me);
      return { task: t };
    }
    case 'updateStatus': {
      const t = s.tasks.find((x) => x.id === b.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (t.type === 'Artikel' && me.role !== 'admin') throw new Error('Task artikel mengikuti tahapnya. Gunakan tombol tahap di task.');
      if (t.type === 'Artikel' && b.status === 'Done') { demoStage(t, 9, me); return { task: t }; }
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
    case 'getAll': return { tasks: s.tasks, projects: s.projects, users: s.users, notifications: true, briefs: s.briefs,
      statuses: ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'], priorities: ['High', 'Medium', 'Low'] };
    case 'bulkSetType': {
      const out = [], failed = [];
      (b.taskIds || []).forEach((id) => {
        const t = s.tasks.find((x) => x.id === id); if (!t) { failed.push(id); return; }
        const art = b.type === 'Artikel';
        if ((t.type === 'Artikel') !== art) {
          t.type = art ? 'Artikel' : 'Non-artikel';
          if (art && !t.stage) { t.stageLog = [{ s: 1, t: t.startedAt || new Date().toISOString() }]; t.stage = 1; demoStage(t, t.status === 'Done' ? 9 : ['On-Progress', 'Review'].includes(t.status) ? 2 : 1, me); }
        }
        out.push(t);
      });
      return { tasks: out, failed };
    }
    case 'saveTask': {
      const t = b.task; const owner = s.users.find((u) => u.username === t.owner);
      if (!owner) throw new Error('Penanggung jawab tidak ditemukan');
      let saved, oldCode = '';
      const art = t.type === 'Artikel', wantStage = Number(t.stage) || 0;
      const clean = Object.assign({}, t); delete clean.stage; if (art) delete clean.status;
      if (t.id) { saved = s.tasks.find((x) => x.id === t.id); oldCode = saved.code; Object.assign(saved, clean, { ownerName: owner.name }); }
      else { saved = Object.assign({ startedAt: '', doneAt: '', reviewAt: '', results: [], resultNote: '', status: 'Backlog' }, clean, { id: 'TDEMO' + Date.now(), ownerName: owner.name }); s.tasks.push(saved); }
      if (art && !saved.stage) { saved.stage = 1; saved.status = 'Backlog'; saved.stageLog = [{ s: 1, t: new Date().toISOString() }]; }
      if (art && wantStage && wantStage !== saved.stage) demoStage(saved, wantStage, me);
      return { id: saved.id, task: saved, projects: syncProj(s, [saved.code, oldCode]) };
    }
    case 'deleteTask': { const old = s.tasks.find((x) => x.id === b.taskId); s.tasks = s.tasks.filter((x) => x.id !== b.taskId); return { ok: true, projects: syncProj(s, [old && old.code]) }; }
    case 'reviewQueue': return { tasks: s.tasks.filter((x) => x.status === 'Review') };
    case 'reviewTask': {
      const t = s.tasks.find((x) => x.id === b.taskId);
      if (!t) throw new Error('Task tidak ditemukan');
      if (t.type === 'Artikel') {
        const st = t.stage, next = b.decision === 'approve' ? { 3: 4, 5: 6, 8: 9 }[st] : { 3: 2, 5: 4, 8: 7 }[st];
        if (!next) throw new Error('Tidak ada yang perlu direview. Muat ulang data.');
        const br = s.briefs.find((x) => x.taskId === t.id);
        if (st === 3 && br) br.status = b.decision === 'approve' ? 'Disetujui' : 'Dikembalikan';
        if (b.decision !== 'approve') { const d = new Date(), what = { 3: 'Brief', 5: 'Artikel', 8: 'Hasil cek AI' }[st]; const line = `[${what} dikembalikan ${d.getDate()}/${d.getMonth() + 1} oleh ${me.name}]` + (b.reason ? ' ' + b.reason : ''); t.notes = t.notes ? t.notes + '\n' + line : line; }
        demoStage(t, next, me);
        return { task: t, projects: syncProj(s, [t.code]) };
      }
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

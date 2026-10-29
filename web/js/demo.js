(function (root) {
// Backend tiruan untuk "Mode demo" — tidak menyentuh Google Sheets.
// Isinya meniru struktur sheet "KPI dan Tracker".
const people = [
  ['ari', 'Ari'], ['ammar', 'Ammar'], ['fahmi', 'Fahmi'], ['winona', 'Winona'],
  ['dany', 'Dany'], ['arya', 'Arya'], ['wisnu', 'Wisnu'], ['nadia', 'Nadia']
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
  // Nadia (desain) — task sosmed dari brief
  add('nadia', '', '5 Tanda Payroll Kamu Perlu Otomatis', -1, '09:00', 2, '18:00', 'On-Progress', { type: 'Sosmed', startedAt: stamp(-1, 10, 0), priority: 'High' });
  add('nadia', '', 'Tips onboarding karyawan baru dalam 30 detik', -3, '09:00', 0, '18:00', 'Review', { type: 'Sosmed', startedAt: stamp(-3, 9, 30), reviewAt: new Date(Date.now() - 90 * 60000).toISOString(),
    resultNote: 'Versi 9:16 untuk Reels & 1:1 untuk LinkedIn.', results: [{ label: 'Video final', url: 'https://drive.google.com/file/d/demoVideo/view' }, { label: '', url: 'https://www.canva.com/design/demoOnboard/edit' }] });
  add('nadia', '', 'Infografis alur reimbursement', -8, '09:00', -5, '18:00', 'Done', { type: 'Sosmed', startedAt: stamp(-8, 9, 0), doneAt: stamp(-5, 14, 0), reviewAt: stamp(-5, 11, 0),
    results: [{ label: 'Carousel final', url: 'https://www.canva.com/design/demoReimb/edit' }] });

  const users = [['admin', 'Administrator', 'admin', '']].concat(people.map((p) => [p[0], p[1], 'member', p[1]]))
    .map((u) => ({ username: u[0], name: u[1], role: u[2], sheetName: u[3], mustChange: false, active: true, email: u[0] === 'wisnu' ? '' : u[0] + '@contoh.com',
      position: { ari: 'SEO Specialist', ammar: 'Content Writer', fahmi: 'Content Writer', winona: 'Content Writer Intern', dany: 'Frontend Developer', arya: 'Frontend Developer', wisnu: 'Digital Marketing Lead', nadia: 'Graphic Designer' }[u[0]] || '' }));
  // Struktur tim
  const ORG = { wisnu: ['hendra', 'Digital marketing', 'Strategi digital, AIO, laporan kompetitor', '2023-03'], ari: ['wisnu', 'SEO dan konten', 'Riset keyword, technical SEO, brief artikel', '2024-01'],
    ammar: ['ari', 'SEO dan konten', 'Artikel HR & payroll', '2024-06'], fahmi: ['ari', 'SEO dan konten', 'Artikel engagement & onboarding', '2024-07'],
    winona: ['ari', 'SEO dan konten', '', '2026-09'], dany: ['wisnu', 'Web', 'Page solusi, landing page', '2025-02'], arya: ['wisnu', 'Web', 'NavBar, tracking AIO', '2025-04'],
    nadia: ['wisnu', 'Desain', 'Carousel, video pendek, infografis', '2025-08'] };
  users.forEach((u) => { const o = ORG[u.username] || ['', '', '', '']; Object.assign(u, { reportsTo: o[0], division: o[1], skills: o[2], joined: o[3], orgOnly: false }); });
  users.push({ username: 'hendra', name: 'Hendra', role: 'member', sheetName: '', mustChange: false, active: true, email: '', position: 'Direktur', reportsTo: '', division: 'Direksi', skills: '', joined: '2019-01', orgOnly: true });
  // Task artikel (A1 berupa URL blog): jenis, tahap, dan riwayat tahap untuk contoh KPI
  const ST_STATUS = ['', 'Backlog', 'On-Progress', 'Review', 'On-Progress', 'Review', 'On-Progress', 'On-Progress', 'Review', 'Done'];
  const artStage = { '/aplikasi-hr-terbaik-era-digital/': 4, '/talent-management-strategy/': 1, '/hris-indonesia/': 9, '/payroll-outsourcing/': 9,
    '/aplikasi-absensi/': 2, '/kpi-karyawan/': 3, '/employee-engagement/': 9, '/onboarding-karyawan/': 9, '/offboarding/': 8, '/hr-analytics/': 9, '/reimbursement/': 5 };
  tasks.forEach((t) => {
    const key = Object.keys(artStage).find((k) => t.task.includes(k));
    if (!key) { t.type = t.type || 'Non-artikel'; return; }
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
  const SOC = { Backlog: 'Ditugaskan', 'On-Progress': 'Dikerjakan', Review: 'Direview', Hold: 'Ditunda', Done: 'Selesai' };
  const soc = (id, frag, createdBy, data, at) => {
    const t = frag ? tasks.find((x) => x.task.includes(frag)) : null;
    briefs.push({ id, taskId: t ? t.id : '', owner: t ? t.owner : '', createdBy, type: 'Sosmed', status: t ? SOC[t.status] : 'Draft', docUrl: '',
      keyword: data.format, title: data.title, createdAt: at, updatedAt: at, updatedBy: createdBy, statusAt: t && t.doneAt ? t.doneAt : at,
      data: Object.assign({ v: 1, platforms: [], sizes: [], slides: [], scenes: [], caption: '', notes: '' }, data) });
  };
  soc('BSDEMO1', '5 Tanda Payroll', 'ari', { format: 'Carousel', title: '5 Tanda Payroll Kamu Perlu Otomatis', platforms: ['Instagram', 'LinkedIn'], sizes: ['4:5 · 1080×1350'],
    slides: [
      { text: '5 Tanda Payroll Kamu Perlu Otomatis', visual: 'Cover: staf HR di antara tumpukan slip gaji, warna brand biru. Judul besar di tengah.', refs: ['https://www.instagram.com/p/demo-cover/', 'https://www.pinterest.com/pin/demo123/'] },
      { text: '1. Hitung lembur masih manual', visual: 'Ikon kalkulator + jam, ilustrasi flat', refs: [''] },
      { text: '2. Slip gaji sering telat', visual: 'Ilustrasi amplop dengan jam pasir', refs: [''] },
      { text: '3. Salah hitung PPh 21', visual: 'Kertas pajak dengan tanda silang merah', refs: [''] },
      { text: 'Saatnya pakai LinovHR Payroll', visual: 'Mockup layar aplikasi payroll LinovHR + CTA "Coba demo gratis"', refs: ['https://www.linovhr.com/fitur/payroll/'] }],
    caption: 'Masih hitung gaji pakai spreadsheet? Kalau 3 dari 5 tanda ini terjadi di kantormu, sudah waktunya payroll otomatis. 💡\n\nSimpan post ini & bagikan ke tim HR kamu.\n\n#payroll #HRIS #LinovHR',
    notes: 'Pakai template carousel brand Q4.', assign: { owner: 'nadia', endDate: iso(addDays(today, 2)), endTime: '18:00', priority: 'High', code: '' } }, stamp(-1, 9, 0));
  soc('BSDEMO2', 'Tips onboarding', 'wisnu', { format: 'Video', title: 'Tips onboarding karyawan baru dalam 30 detik', platforms: ['Instagram', 'LinkedIn', 'TikTok'], sizes: ['9:16 · 1080×1920', '1:1 · 1080×1080'],
    scenes: [
      { visual: 'Close-up karyawan baru bingung di meja kosong', audio: 'VO: "Hari pertama kerja, tapi nggak tahu harus ngapain?"', dur: 5, refs: ['https://www.tiktok.com/@demo/video/1'] },
      { visual: 'Layar HP: checklist onboarding di aplikasi', audio: 'VO: "Dengan checklist onboarding, semua jelas dari hari pertama."', dur: 10, refs: [''] },
      { visual: 'Logo LinovHR + teks CTA', audio: 'VO: "LinovHR — onboarding lebih rapi."', dur: 5, refs: [''] }],
    caption: 'Onboarding yang rapi bikin karyawan baru betah. Ini caranya 👇 #onboarding #HR', assign: { owner: 'nadia', endDate: iso(today), endTime: '18:00', priority: 'Medium', code: '' } }, stamp(-3, 8, 30));
  soc('BSDEMO3', '', 'ari', { format: 'Carousel', title: 'Mitos vs fakta THR 2027', platforms: ['Instagram'], sizes: ['4:5 · 1080×1350'],
    slides: [{ text: 'Mitos vs Fakta THR', visual: 'Split layout merah / hijau', refs: [''] }, { text: '', visual: '', refs: [''] }], caption: '',
    assign: { owner: '', endDate: '', endTime: '18:00', priority: 'Medium', code: '' } }, stamp(0, 8, 0));
  soc('BSDEMO4', 'Infografis alur reimbursement', 'ari', { format: 'Carousel', title: 'Infografis alur reimbursement', platforms: ['LinkedIn'], sizes: ['1:1 · 1080×1080'],
    slides: [{ text: 'Alur reimbursement 5 langkah', visual: 'Infografis vertikal 5 langkah', refs: [''] }], caption: 'Alur reimbursement yang rapi dalam 5 langkah.' }, stamp(-8, 8, 0));
  // contoh request: Nadia (desain) meminta Fahmi membuat copy landing page
  const rqT = { id: 'TDEMORQ1', owner: 'fahmi', ownerName: 'Fahmi', sheet: 'Fahmi', row: 99, code: '', task: 'Copy landing page modul Reimbursement', type: 'Request',
    startDate: iso(addDays(today, -1)), endDate: iso(addDays(today, 3)), startRaw: '', endRaw: '', startTime: '09:00', endTime: '17:00', status: 'Backlog', priority: 'High',
    startedAt: '', doneAt: '', reviewAt: '', notes: '', results: [], resultNote: '', stage: 0,
    stageLog: [{ e: 'created', t: stamp(-1, 10, 0) }, { e: 'clar', t: stamp(-1, 11, 30) }] };
  tasks.push(rqT);
  briefs.push({ id: 'RQDEMO1', taskId: rqT.id, owner: 'fahmi', createdBy: 'nadia', type: 'Request', status: 'Klarifikasi', docUrl: '', keyword: '', title: rqT.task,
    createdAt: stamp(-1, 10, 0), updatedAt: stamp(-1, 11, 30), updatedBy: 'fahmi', statusAt: stamp(-1, 11, 30),
    data: { v: 1, title: rqT.task, body: 'Copy untuk halaman /fitur/reimbursement versi baru. Target: HR manager perusahaan 100–500 karyawan. Nada profesional, singkat.\n\nYang dibutuhkan:\n- Headline + subheadline (maks 12 kata)\n- 3 keunggulan dengan ikon\n- FAQ 4 pertanyaan\n- CTA "Coba demo gratis"\n\nDesain sudah ada di Figma, tinggal isi teks.',
      attachments: [{ label: 'Desain Figma', url: 'https://www.figma.com/file/demo-reimb-lp' }, { label: 'Referensi kompetitor', url: 'https://www.talenta.co/fitur/reimbursement/' }],
      thread: [{ by: 'fahmi', name: 'Fahmi', t: stamp(-1, 11, 30), text: 'Apakah perlu versi bahasa Inggris juga? FAQ boleh ambil dari artikel reimbursement?' }],
      assign: { owner: 'fahmi', endDate: rqT.endDate, endTime: '17:00', priority: 'High', code: '' } } });
  // jadwal kerja contoh
  users.forEach((u) => { u.wfoExempt = u.username === 'wisnu'; });
  const wk0 = schWeekOf(new Date()), sched = {}, put = (w, u, days, source) => { sched[w + '|' + u] = { days, source: source || 'choice' }; };
  const prevW = schAddWk(wk0, -1);
  [['ari', 'mon'], ['ammar', 'thu'], ['fahmi', 'mon'], ['winona', 'thu'], ['dany', 'thu'], ['arya', 'mon'], ['nadia', 'mon']].forEach(([u, d]) => put(prevW, u, ['tue', d]));
  put(prevW, 'ammar', ['tue'], 'request');   // minggu lalu hanya 1 hari → minggu ini wajib 3
  put(wk0, 'wisnu', ['thu']);
  const sreqs = [{ id: 'JDDEMO1', username: 'fahmi', week: schAddWk(wk0, 1), kind: 'swap', from: 'tue', to: 'thu', reason: 'Visit klien di luar kota', status: 'Menunggu', createdAt: new Date().toISOString(), decidedBy: '', decidedAt: '', note: '' }];
  const wd = (n) => iso(schDay(wk0, SCH_D[n]));
  const leaves = [{ id: 'CTDEMO1', username: 'nadia', kind: 'Sakit', from: wd(2), to: wd(2), reason: 'Demam', status: 'Disetujui', createdAt: new Date().toISOString(), decidedBy: 'admin', note: '' },
    { id: 'CTDEMO2', username: 'ammar', kind: 'Cuti', from: iso(schDay(schAddWk(wk0, 1), 'thu')), to: iso(schDay(schAddWk(wk0, 1), 'fri')), reason: 'Acara keluarga di kampung', status: 'Menunggu', createdAt: new Date().toISOString(), decidedBy: '', note: '' }];
  users.forEach((u) => { if (u.username === 'winona') u.onboard = 'pending'; });
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const rv = tasks.find((t) => t.owner === 'winona' && t.status === 'Review') || tasks.find((t) => t.status === 'Review') || tasks[0];
  const op = tasks.find((t) => t.owner === 'ari' && t.status === 'On-Progress') || tasks[1];
  const comments = [
    { id: 'KMD1', taskId: rv.id, author: 'admin', kind: 'sys:return', text: 'mengembalikan review artikel: Internal link ke /fitur/reimbursement belum ada.', createdAt: ago(30) },
    { id: 'KMD2', taskId: rv.id, author: rv.owner, kind: 'user', text: 'Sudah saya tambahkan 2 internal link. @Administrator boleh dicek lagi?', mentions: ['admin'], createdAt: ago(26) },
    { id: 'KMD3', taskId: rv.id, author: rv.owner, kind: 'sys', text: 'mengajukan review artikel', createdAt: ago(25.9) },
    { id: 'KMD4', taskId: op.id, author: 'wisnu', kind: 'user', text: 'Ari, untuk report minggu ini tolong tambahkan data AI Overview juga ya. Contoh format: https://docs.google.com/spreadsheets/d/contoh', mentions: [], createdAt: ago(3) }];
  return { projects, tasks, users, briefs, sched, sreqs, holidays: {}, leaves, comments };
}
// ---------- komentar (meniru server) ----------
function cmCountsD(s) {
  const m = {};
  (s.comments || []).forEach((c) => { if (c.deleted || c.kind.startsWith('sys')) return; const x = m[c.taskId] || (m[c.taskId] = { n: 0, last: '', by: '' }); x.n++; if (c.createdAt >= x.last) { x.last = c.createdAt; x.by = c.author; } });
  return m;
}
function cmListD(s, me, taskId) {
  const nm = (u) => (s.users.find((x) => x.username === u) || {}).name || u;
  const comments = s.comments.filter((c) => c.taskId === taskId && !c.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => {
    const kind = c.kind.startsWith('sys') ? 'sys' : 'user', canEdit = kind === 'user' && c.author === me.username && Date.now() - new Date(c.createdAt) < 15 * 6e4;
    return { id: c.id, author: c.author, authorName: nm(c.author), kind, tone: c.kind.split(':')[1] || '', text: c.text, mentions: c.mentions || [], createdAt: c.createdAt, editedAt: c.editedAt || '', canEdit, canDelete: kind === 'user' && (canEdit || me.role === 'admin') };
  });
  return { taskId, comments, people: s.users.filter((u) => u.active && !u.orgOnly).map((u) => ({ username: u.username, name: u.name, position: u.position || '' })) };
}
function cmSysD(s, taskId, me, text, tone) { s.comments.push({ id: 'KMD' + Date.now() + Math.random().toString(36).slice(2, 5), taskId, author: me.username, kind: tone ? 'sys:' + tone : 'sys', text, createdAt: new Date().toISOString() }); }
// ---------- jadwal kerja (meniru server) ----------
const SCH_D = ['mon', 'tue', 'wed', 'thu', 'fri'], SCH_W = ['mon', 'tue', 'thu'], SCH_N = { mon: 'Senin', tue: 'Selasa', wed: 'Rabu', thu: 'Kamis', fri: 'Jumat' };
function schWeekOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); }
function schAddWk(w, n) { const x = new Date(w + 'T00:00:00'); x.setDate(x.getDate() + 7 * n); return iso(x); }
function schDay(w, c) { const x = new Date(w + 'T00:00:00'); x.setDate(x.getDate() + SCH_D.indexOf(c)); return x; }
function schLock(w) { const x = new Date(w + 'T00:00:00'); x.setDate(x.getDate() - 3); x.setHours(17, 0, 0, 0); return x; }
function schPlan(s, u, w) {
  const st = s.sched[w + '|' + u.username], hol = SCH_D.filter((c) => s.holidays[iso(schDay(w, c))]);
  if (u.wfoExempt) return { days: st ? st.days.slice() : [], required: 0, exempt: true, chosen: !!st, source: st ? st.source : '', debt: false, holidays: hol };
  const prev = s.sched[schAddWk(w, -1) + '|' + u.username], debt = !!(prev && prev.days.length < 2);
  let days, chosen = true, source = st ? st.source : '';
  if (st) { days = st.days.slice(); if (debt && st.source === 'choice') days = SCH_W.slice(); }
  else if (debt) { days = SCH_W.slice(); source = 'auto'; }
  else {
    let c = '';
    for (let i = 1; i <= 12 && !c; i++) { const r = s.sched[schAddWk(w, -i) + '|' + u.username]; if (r) c = r.days.includes('mon') && !r.days.includes('thu') ? 'mon' : r.days.includes('thu') && !r.days.includes('mon') ? 'thu' : ''; }
    days = c ? ['tue', c].sort((a, b) => SCH_D.indexOf(a) - SCH_D.indexOf(b)) : ['tue']; chosen = !!c; source = c ? 'auto' : '';
  }
  return { days, required: debt ? 3 : 2, exempt: false, chosen, source, debt, holidays: hol };
}
function schPeople(s) { return s.users.filter((u) => u.active && !u.orgOnly && u.sheetName); }
function schLeave(s, un, w) {
  const out = {};
  (s.leaves || []).filter((l) => l.username === un && l.status === 'Disetujui').forEach((l) => SCH_D.forEach((c) => { const d = iso(schDay(w, c)); if (l.from <= d && d <= l.to) out[c] = l.kind; }));
  return out;
}
function okLeaves(s) { return (s.leaves || []).filter((l) => l.status === 'Disetujui'); }
function withLv(s, tasks) { if (root.PTLogic) root.PTLogic.applyLeaves(tasks, okLeaves(s)); return tasks; }
function schWeekData(s, w) {
  const plans = {}, count = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
  schPeople(s).forEach((u) => { const p = schPlan(s, u, w); p.leave = schLeave(s, u.username, w); plans[u.username] = p; if (!p.exempt) p.days.forEach((d) => { if (!p.holidays.includes(d) && !p.leave[d]) count[d]++; }); });
  return { week: w, lockAt: schLock(w).toISOString(), locked: new Date() >= schLock(w), days: SCH_D.map((c) => ({ code: c, date: iso(schDay(w, c)), holiday: s.holidays[iso(schDay(w, c))] || '' })), plans, count };
}
function schData(s, me, w) {
  const cur = schWeekOf(new Date()); w = w ? schWeekOf(new Date(w + 'T00:00:00')) : cur;
  return { today: iso(new Date()), currentWeek: cur, weeks: [schWeekData(s, w), schWeekData(s, schAddWk(w, 1))], holidays: Object.assign({}, s.holidays),
    requests: s.sreqs.filter((r) => me.role === 'admin' || r.username === me.username || r.status === 'Menunggu'),
    leaves: (s.leaves || []).filter((l) => l.status === 'Menunggu' || l.status === 'Disetujui' || l.username === me.username).filter((l) => me.role === 'admin' || l.username === me.username || l.status === 'Disetujui')
      .map((l) => { const o = Object.assign({}, l); if (me.role !== 'admin' && l.username !== me.username) delete o.reason; return o; }),
    people: schPeople(s).map((u) => ({ username: u.username, name: u.name, position: u.position || '', exempt: !!u.wfoExempt })) };
}
const REQ_TS = { Konfirmasi: 'Backlog', Klarifikasi: 'Backlog', Dikerjakan: 'On-Progress', Dikembalikan: 'On-Progress', Diajukan: 'Review', Selesai: 'Done' };
function reqLog(t, e) { t.stageLog = (t.stageLog || []).concat({ e, t: new Date().toISOString() }); }
function saveReq(s, me, br) {
  const d = br.data || {}, title = String(d.title || '').trim(), now = new Date().toISOString(), admin = me.role === 'admin';
  let cur = br.id && s.briefs.find((x) => x.id === br.id);
  if (cur && !admin && cur.createdBy !== me.username) throw new Error('Hanya pembuat request dan admin yang bisa mengubah request ini.');
  if (!title) throw new Error('Isi judul request.');
  if (!String(d.body || '').trim()) throw new Error('Tuliskan kebutuhan request.');
  let task = cur && s.tasks.find((x) => x.id === cur.taskId), newOwner = null;
  const a = br.assign;
  if (!cur && !a) throw new Error('Pilih penerima request.');
  if (a) {
    const owner = s.users.find((u) => u.username === a.owner && u.sheetName);
    if (!owner) throw new Error('Pilih penerima request.');
    if (owner.username === (cur ? cur.createdBy : me.username)) throw new Error('Request tidak bisa ditujukan ke pembuatnya sendiri.');
    if (!task) { task = { id: 'TDEMO' + Date.now(), startDate: iso(new Date()), startTime: '09:00', status: 'Backlog', startedAt: '', doneAt: '', reviewAt: '', results: [], resultNote: '', notes: '', type: 'Request', stageLog: [{ e: 'created', t: now }] }; s.tasks.push(task); }
    if (task.owner !== owner.username) newOwner = owner;
    Object.assign(task, { owner: owner.username, ownerName: owner.name, sheet: owner.name, task: title, code: a.code || '', endDate: a.endDate, endTime: a.endTime || '18:00', priority: a.priority || 'Medium' });
  } else if (task) task.task = title;
  const thread = cur ? (cur.data.thread || []) : [];
  if (!cur) { cur = { id: 'RQDEMO' + Date.now(), createdBy: me.username, createdAt: now, docUrl: '', type: 'Request', status: 'Konfirmasi', statusAt: now }; s.briefs.push(cur); }
  else if (newOwner) { cur.status = 'Konfirmasi'; task.status = 'Backlog'; reqLog(task, 'created'); thread.push({ by: me.username, name: me.name, t: now, text: 'Request dialihkan ke ' + newOwner.name + '.', sys: true }); }
  Object.assign(cur, { taskId: task.id, owner: task.owner, title, keyword: '', data: { v: 1, title, body: d.body, attachments: d.attachments || [], thread, assign: a || (cur.data && cur.data.assign) }, updatedAt: now, updatedBy: me.username });
  return { brief: cur, task };
}
function reqAction(s, me, id, act, p) {
  p = p || {};
  const b = s.briefs.find((x) => x.id === id); if (!b) throw new Error('Request tidak ditemukan');
  const t = s.tasks.find((x) => x.id === b.taskId); if (!t) throw new Error('Task request tidak ditemukan');
  const admin = me.role === 'admin', isOwner = t.owner === me.username, isCreator = b.createdBy === me.username, now = new Date().toISOString();
  const st = b.status; let next = st; const text = String(p.text || '').trim();
  const say = (m, sys) => b.data.thread.push({ by: me.username, name: me.name, t: now, text: m, sys: !!sys });
  const need = (ok, m) => { if (!ok) throw new Error(m); };
  if (act === 'message') {
    need(text, 'Tulis pesannya dulu.'); need(isOwner || isCreator || admin, 'Tidak diizinkan.'); say(text);
    if (isOwner && st === 'Konfirmasi') { next = 'Klarifikasi'; reqLog(t, 'clar'); }
    else if ((isCreator || admin) && !isOwner && st === 'Klarifikasi') { next = 'Konfirmasi'; reqLog(t, 'ans'); if (p.endDate) { t.endDate = p.endDate; t.endTime = p.endTime || t.endTime; say('Deadline diubah ke ' + p.endDate + ' ' + t.endTime + '.', true); } }
  } else if (act === 'accept') { need(isOwner || admin, 'Hanya penerima yang bisa menerima request.'); need(st === 'Konfirmasi' || st === 'Klarifikasi', 'Request ini sudah diterima.'); next = 'Dikerjakan'; say('Request diterima dan mulai dikerjakan.', true); reqLog(t, 'acc'); if (!t.startedAt) t.startedAt = now; }
  else if (act === 'submit') { need(isOwner || admin, 'Hanya penerima yang bisa mengajukan hasil.'); need(st === 'Dikerjakan' || st === 'Dikembalikan', 'Terima request dulu.'); need((t.results || []).length || String(t.resultNote || '').trim(), 'Tambahkan hasil kerja (link atau keterangan) sebelum mengajukan.'); next = 'Diajukan'; say('Hasil diajukan untuk disetujui.', true); reqLog(t, 'sub'); t.reviewAt = now; }
  else if (act === 'approve' || act === 'return') {
    need(isCreator || admin, 'Hanya pembuat request (atau admin) yang bisa menyetujui hasilnya.'); need(st === 'Diajukan', 'Tidak ada hasil yang menunggu persetujuan. Data dimuat ulang.');
    if (act === 'approve') { next = 'Selesai'; say('Hasil disetujui. Request selesai.', true); reqLog(t, 'done'); t.doneAt = now; }
    else { next = 'Dikembalikan'; say('Dikembalikan untuk diperbaiki' + (text ? ': ' + text : '.'), true); reqLog(t, 'ret'); t.reviewAt = ''; }
  } else throw new Error('Aksi request tidak dikenal');
  if (next !== st) { b.status = next; b.statusAt = now; }
  t.status = REQ_TS[b.status]; b.updatedAt = now; b.updatedBy = me.username;
  return { brief: b, task: t };
}

let db = null;
function state() { if (!db) db = build(); return db; }
function reset() { db = null; }

/** Seperti server: daftar brief hanya ringkasan, isi lengkap lewat getBrief. */
function briefSums(s) {
  const f = (x) => String(x == null ? '' : x).trim() !== '';
  return s.briefs.map((b) => { const d = b.data || {};
    const nm = (u) => ((s.users || []).find((x) => x.username === u) || {}).name || u || '';
    if (b.type === 'Request') { const th = d.thread || [], last = th[th.length - 1];
      return Object.assign({}, b, { summary: true, ownerName: nm(b.owner), createdByName: nm(b.createdBy),
        data: { title: d.title || '', nAttach: (d.attachments || []).length, nMsg: th.length, last: last ? { by: last.by, t: last.t, sys: !!last.sys } : null, assign: d.assign || null } }); }
    if (b.type === 'Sosmed') return Object.assign({}, b, { summary: true, ownerName: nm(b.owner), createdByName: nm(b.createdBy), data: { format: d.format || 'Carousel', title: d.title || '', platforms: d.platforms || [], sizes: d.sizes || [],
      nSlides: (d.slides || []).length, nScenes: (d.scenes || []).length, dur: (d.scenes || []).reduce((a, x) => a + (Number(x && x.dur) || 0), 0), assign: d.assign || null } });
    return Object.assign({}, b, { summary: true, data: { kwMain: d.kwMain || '', h1: d.h1 || '', contentType: d.contentType || '', wordEst: d.wordEst || '', ctaPage: d.ctaPage || '',
      nH2: (d.sections || []).filter((x) => x && f(x.h2)).length, nComp: (d.competitors || []).filter((x) => x && f(x.url)).length,
      nFaq: (d.faq || []).filter((x) => x && f(x.q)).length, nSecondary: (d.kwSecondary || []).length } }); });
}
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
const SOC_ST = { Backlog: 'Ditugaskan', 'On-Progress': 'Dikerjakan', Review: 'Direview', Hold: 'Ditunda', Done: 'Selesai', Recurring: 'Dikerjakan' };
function socMirror(s, t) {
  const br = s.briefs.find((x) => x.taskId === t.id && x.type === 'Sosmed');
  if (!br) return null;
  const st = SOC_ST[t.status] || 'Ditugaskan';
  if (br.status !== st) { br.status = st; br.statusAt = new Date().toISOString(); }
  return briefSums({ briefs: [br], users: s.users })[0];
}
function saveSocial(s, me, br) {
  const d = br.data || {}, title = String(d.title || '').trim(), now = new Date().toISOString(), admin = me.role === 'admin';
  let cur = br.id && s.briefs.find((x) => x.id === br.id);
  if (br.id && !cur) throw new Error('Brief tidak ditemukan');
  if (cur) {
    const t0 = cur.taskId && s.tasks.find((x) => x.id === cur.taskId);
    if (!admin && cur.createdBy !== me.username && !(t0 && t0.owner === me.username)) throw new Error('Hanya pembuat brief, penanggung jawab, dan admin yang bisa mengubah brief ini.');
    if (br.baseUpdatedAt && cur.updatedAt !== br.baseUpdatedAt) throw new Error('Brief ini baru saja diubah oleh ' + cur.updatedBy + '. Muat ulang supaya perubahannya tidak tertimpa.');
    if (t0 && t0.status === 'Done' && !admin) throw new Error('Konten ini sudah disetujui admin, jadi brief tidak bisa diubah lagi.');
  }
  let task = cur && cur.taskId ? s.tasks.find((x) => x.id === cur.taskId) : null;
  if (br.assign) {
    if (!admin && cur && cur.createdBy !== me.username) throw new Error('Hanya pembuat brief dan admin yang bisa mengubah penugasan.');
    if (!title) throw new Error('Isi judul konten dulu.');
    const a = br.assign, owner = s.users.find((u) => u.username === a.owner && u.sheetName);
    if (!owner) throw new Error('Pilih penanggung jawab.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.endDate || '')) throw new Error('Isi deadline.');
    if (!task) { task = { id: 'TDEMO' + Date.now(), startDate: iso(new Date()), startTime: '09:00', status: 'Backlog', startedAt: '', doneAt: '', reviewAt: '', results: [], resultNote: '', notes: '', type: 'Sosmed' }; s.tasks.push(task); }
    Object.assign(task, { owner: owner.username, ownerName: owner.name, sheet: owner.name, task: title, code: a.code || '', endDate: a.endDate, endTime: a.endTime || '18:00', priority: a.priority || 'Medium' });
  } else if (task && title) task.task = title;
  if (!cur) { cur = { id: 'BSDEMO' + Date.now(), createdBy: me.username, createdAt: now, docUrl: '', type: 'Sosmed', statusAt: now }; s.briefs.push(cur); }
  const st = task ? (SOC_ST[task.status] || 'Ditugaskan') : 'Draft';
  if (cur.status !== st) cur.statusAt = now;
  Object.assign(cur, { taskId: task ? task.id : '', owner: task ? task.owner : '', status: st, keyword: d.format || 'Carousel', title, data: d, updatedAt: now, updatedBy: me.username });
  return { brief: cur, task, projects: task ? syncProj(s, [task.code]) : [] };
}
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
      if (!u || u.orgOnly || b.password !== 'demo') throw new Error('Mode demo: pakai username admin / ari / wisnu dst., password "demo"');
      return { token: 'demo.' + u.username, user: u };
    }
  }
  if (!me) throw new Error('UNAUTHORIZED');
  switch (action) {
    case 'me': return me;
    case 'changePassword': return { user: me };
    case 'setMyEmail': me.email = String(b.email || '').toLowerCase(); return { user: me };
    case 'myTasks': {
      const mt = withLv(s, s.tasks.filter((t) => t.owner === me.username));
      let onboarding = null;
      if (me.onboard && me.onboard !== 'done') {
        const man = (me.onboard.split(':')[1] || '').split(',');
        onboarding = { steps: { account: !!me.email, wfo: !!me.wfoExempt || Object.keys(s.sched).some((k) => k.split('|')[1] === me.username), guide: man.includes('guide'), org: man.includes('org'),
          task: mt.some((t) => t.status === 'Done' || t.status === 'Review') } };
      }
      return { tasks: mt, projects: s.projects, me, briefs: briefSums(s), onboarding, comments: cmCountsD(s) };
    }
    case 'comments': return cmListD(s, me, b.taskId);
    case 'commentAdd': {
      const text = String(b.text || '').trim(); if (!text) throw new Error('Komentar kosong');
      if (!s.tasks.some((t) => t.id === b.taskId)) throw new Error('Task tidak ditemukan. Muat ulang data.');
      const ment = (b.mentions || []).filter((un) => { const u = s.users.find((x) => x.username === un); return u && un !== me.username && text.includes('@' + u.name); });
      s.comments.push({ id: 'KMD' + Date.now(), taskId: b.taskId, author: me.username, kind: 'user', text, mentions: ment, createdAt: new Date().toISOString() });
      return cmListD(s, me, b.taskId);
    }
    case 'commentEdit': {
      const c = s.comments.find((x) => x.id === b.id && !x.deleted); if (!c) throw new Error('Komentar tidak ditemukan.');
      if (c.author !== me.username || Date.now() - new Date(c.createdAt) >= 15 * 6e4) throw new Error('Komentar hanya bisa diubah penulisnya dalam 15 menit.');
      c.text = String(b.text || '').trim(); c.editedAt = new Date().toISOString(); return cmListD(s, me, c.taskId);
    }
    case 'commentDelete': {
      const c = s.comments.find((x) => x.id === b.id && !x.deleted); if (!c) throw new Error('Komentar tidak ditemukan.');
      if (!(me.role === 'admin' || (c.author === me.username && Date.now() - new Date(c.createdAt) < 15 * 6e4))) throw new Error('Komentar hanya bisa dihapus penulisnya dalam 15 menit, atau oleh admin.');
      c.deleted = true; return cmListD(s, me, c.taskId);
    }
    case 'onboardStep': {
      if (!me.onboard || me.onboard === 'done') return { onboard: me.onboard || '' };
      if (b.step === 'done') me.onboard = 'done';
      else if (['guide', 'org'].includes(b.step)) { const man = (me.onboard.split(':')[1] || '').split(',').filter(Boolean); if (!man.includes(b.step)) man.push(b.step); me.onboard = 'pending:' + man.join(','); }
      else throw new Error('Langkah tidak dikenal');
      return { onboard: me.onboard };
    }
    case 'leaveRequest': {
      const q = b.leave || {}, kinds = ['Cuti', 'Sakit', 'Izin'];
      if (!kinds.includes(q.kind)) throw new Error('Pilih jenis: Cuti, Sakit, atau Izin.');
      const from = q.from, to = q.to || q.from;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw new Error('Tanggal tidak valid');
      if (to < from) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      const un = me.role === 'admin' && q.username ? q.username : me.username, direct = me.role === 'admin';
      if (me.role !== 'admin' && q.kind === 'Cuti' && to < iso(new Date())) throw new Error('Cuti tidak bisa diajukan untuk tanggal yang sudah lewat. Untuk sakit/izin mendadak, pilih jenis Sakit atau Izin.');
      const clash = s.leaves.find((l) => l.username === un && ['Menunggu', 'Disetujui'].includes(l.status) && l.from <= to && from <= l.to);
      if (clash) throw new Error('Sudah ada ' + clash.kind.toLowerCase() + ' ' + clash.from + (clash.to !== clash.from ? ' s.d. ' + clash.to : '') + ' (' + clash.status.toLowerCase() + ') yang bertabrakan.');
      s.leaves.push({ id: 'CTDEMO' + Date.now(), username: un, kind: q.kind, from, to, reason: String(q.reason || '').trim(), status: direct ? 'Disetujui' : 'Menunggu', createdAt: new Date().toISOString(), decidedBy: direct ? me.username : '', note: '' });
      return schData(s, me, schWeekOf(new Date(from + 'T00:00:00')));
    }
    case 'leaveCancel': {
      const l = s.leaves.find((x) => x.id === b.id); if (!l) throw new Error('Pengajuan tidak ditemukan.');
      if (me.role !== 'admin' && (l.username !== me.username || l.status !== 'Menunggu')) throw new Error('Hanya pengajuan Anda yang masih menunggu yang bisa dibatalkan.');
      l.status = 'Dibatalkan'; return schData(s, me, schWeekOf(new Date(l.from + 'T00:00:00')));
    }
    case 'briefs': return { briefs: briefSums(s) };
    case 'getBrief': { const b0 = s.briefs.find((x) => x.id === b.briefId); if (!b0) throw new Error('Brief tidak ditemukan'); return { brief: b0 }; }
    case 'teamTasks': return { comments: cmCountsD(s), tasks: withLv(s, s.tasks), users: s.users.filter((u) => u.sheetName).map((u) => ({ username: u.username, name: u.name, position: u.position || '' })), projects: s.projects, briefs: briefSums(s),
      org: s.users.filter((u) => u.active).map((u) => ({ username: u.username, name: u.name, position: u.position || '', reportsTo: u.reportsTo || '', division: u.division || '', skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly, hasTasks: !!u.sheetName, role: u.role })) };
    case 'setMySkills': me.skills = String(b.skills || '').trim().slice(0, 120); return { user: me };
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
    case 'saveSocialBrief': return saveSocial(s, me, b.brief || {});
    case 'schedule': return schData(s, me, b.week);
    case 'schedChoose': {
      const w = schWeekOf(new Date(b.week + 'T00:00:00'));
      const ever = Object.keys(s.sched).some((k) => k.endsWith('|' + me.username));
      if (new Date() >= schLock(w) && (ever || w < schWeekOf(new Date()))) throw new Error('Jadwal minggu ini sudah terkunci (batas Jumat 17:00). Ajukan pindah hari ke admin bila perlu.');
      if (me.wfoExempt) { s.sched[w + '|' + me.username] = { days: SCH_W.filter((d) => (b.days || []).includes(d)), source: 'choice' }; return schData(s, me, w); }
      if (b.day !== 'mon' && b.day !== 'thu') throw new Error('Pilih Senin atau Kamis.');
      const wd = schWeekData(s, w), p = wd.plans[me.username], other = b.day === 'mon' ? 'thu' : 'mon';
      if (p.required >= 3) throw new Error('Minggu ini Anda wajib WFO 3 hari, jadi tidak perlu memilih.');
      if (p.days.includes(other) && p.chosen && wd.count[other] - 1 < 2 && wd.count[other] >= 2) throw new Error(SCH_N[other] + ' tinggal ' + wd.count[other] + ' orang. Minimal 2 orang di kantor, jadi Anda belum bisa pindah sebelum ada yang pindah ke ' + SCH_N[other] + '.');
      s.sched[w + '|' + me.username] = { days: ['tue', b.day].sort((x, y) => SCH_D.indexOf(x) - SCH_D.indexOf(y)), source: 'choice' };
      return schData(s, me, w);
    }
    case 'schedRequest': {
      const q = b.req || {}, w = schWeekOf(new Date(q.week + 'T00:00:00'));
      if (me.wfoExempt) throw new Error('Anda termasuk pengecualian, jadi tidak perlu mengajukan perubahan jadwal.');
      if (!String(q.reason || '').trim()) throw new Error('Tuliskan alasannya.');
      const p = schPlan(s, me, w);
      if (!p.days.includes(q.from)) throw new Error('Hari itu bukan hari WFO Anda.');
      if (s.sreqs.some((r) => r.username === me.username && r.week === w && r.from === q.from && r.status === 'Menunggu')) throw new Error('Sudah ada pengajuan untuk hari itu yang menunggu keputusan admin.');
      s.sreqs.push({ id: 'JDDEMO' + Date.now(), username: me.username, week: w, kind: q.kind === 'skip' ? 'skip' : 'swap', from: q.from, to: q.kind === 'skip' ? '' : q.to, reason: q.reason, status: 'Menunggu', createdAt: new Date().toISOString(), decidedBy: '', decidedAt: '', note: '' });
      return schData(s, me, w);
    }
    case 'saveRequest': return saveReq(s, me, b.brief || {});
    case 'requestAction': return reqAction(s, me, b.briefId, b.act, b.payload);
    case 'deleteBrief': {
      const cur = s.briefs.find((x) => x.id === b.briefId);
      let taskDeleted = false;
      if (cur && (cur.type === 'Sosmed' || cur.type === 'Request')) {
        if (me.role !== 'admin' && cur.createdBy !== me.username) throw new Error('Hanya pembuat brief dan admin yang bisa menghapus brief ini.');
        const t = cur.taskId && s.tasks.find((x) => x.id === cur.taskId);
        if (t && t.status === 'Backlog' && !t.startedAt) { s.tasks = s.tasks.filter((x) => x !== t); taskDeleted = true; }
        else if (t && me.role !== 'admin') throw new Error('Konten ini sudah mulai dikerjakan ' + t.ownerName + '. Minta admin bila brief perlu dihapus.');
      }
      s.briefs = s.briefs.filter((x) => x.id !== b.briefId); return { ok: true, taskDeleted, taskId: taskDeleted ? cur.taskId : '' };
    }
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
      if (t.status !== b.status) cmSysD(s, t.id, me, { Review: 'mengajukan review', Done: 'menandai selesai (Done)', Hold: 'menunda task (Hold)', 'On-Progress': t.status === 'Review' ? 'menarik kembali dari review' : 'mulai mengerjakan', Backlog: 'mengembalikan ke Backlog' }[b.status]);
      t.status = b.status;
      return { task: t, projects: syncProj(s, [t.code]), brief: socMirror(s, t) };
    }
  }
  if (me.role !== 'admin') throw new Error('Hanya admin yang boleh melakukan ini');
  switch (action) {
    case 'getAll': return { comments: cmCountsD(s), tasks: withLv(s, s.tasks), projects: s.projects, users: s.users, notifications: true, briefs: briefSums(s),
      statuses: ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'], priorities: ['High', 'Medium', 'Low'] };
    case 'bulkSetType': {
      const out = [], failed = [];
      (b.taskIds || []).forEach((id) => {
        const t = s.tasks.find((x) => x.id === id); if (!t) { failed.push(id); return; }
        const art = b.type === 'Artikel';
        if ((t.type || 'Non-artikel') !== b.type) {
          t.type = b.type;
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
    case 'schedSet': { const w = schWeekOf(new Date(b.week + 'T00:00:00')); s.sched[w + '|' + b.username] = { days: SCH_W.filter((d) => (b.days || []).includes(d)), source: 'admin' }; return schData(s, me, w); }
    case 'schedDecide': {
      const q = s.sreqs.find((x) => x.id === b.id); if (!q) throw new Error('Pengajuan tidak ditemukan.');
      if (q.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diputuskan. Data dimuat ulang.');
      if (b.decision === 'approve') { const u = s.users.find((x) => x.username === q.username), p = schPlan(s, u, q.week); let d = p.days.filter((x) => x !== q.from); if (q.kind === 'swap' && !d.includes(q.to)) d.push(q.to); s.sched[q.week + '|' + u.username] = { days: SCH_W.filter((x) => d.includes(x)), source: 'request' }; }
      Object.assign(q, { status: b.decision === 'approve' ? 'Disetujui' : 'Ditolak', decidedBy: me.username, decidedAt: new Date().toISOString(), note: b.note || '' });
      return schData(s, me, q.week);
    }
    case 'schedHoliday': { if (b.remove) delete s.holidays[b.date]; else s.holidays[b.date] = b.name || 'Libur nasional'; return schData(s, me, schWeekOf(new Date(b.date + 'T00:00:00'))); }
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
        cmSysD(s, t.id, me, (b.decision === 'approve' ? 'menyetujui ' : 'mengembalikan ') + { 3: 'review brief', 5: 'review artikel', 8: 'review cek AI' }[st] + (b.decision !== 'approve' && b.reason ? ': ' + b.reason : ''), b.decision === 'approve' ? 'approve' : 'return');
        demoStage(t, next, me);
        return { task: t, projects: syncProj(s, [t.code]) };
      }
      if (b.decision === 'approve') { t.status = 'Done'; t.doneAt = new Date().toISOString(); if (!t.reviewAt) t.reviewAt = t.doneAt; }
      else {
        t.status = 'On-Progress'; t.doneAt = ''; t.reviewAt = '';
        const d = new Date(); const line = `[Dikembalikan ${d.getDate()}/${d.getMonth() + 1} oleh ${me.name}]` + (b.reason ? ' ' + b.reason : '');
        t.notes = t.notes ? t.notes + '\n' + line : line;
      }
      cmSysD(s, t.id, me, b.decision === 'approve' ? 'menyetujui · task selesai (Done)' : 'mengembalikan untuk diperbaiki' + (b.reason ? ': ' + b.reason : ''), b.decision === 'approve' ? 'approve' : 'return');
      return { task: t, projects: syncProj(s, [t.code]), brief: socMirror(s, t) };
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
      if (u.reportsTo) {
        if (u.reportsTo === u.username) throw new Error('Atasan tidak boleh diri sendiri');
        let cur = u.reportsTo; const seen = new Set();
        while (cur && !seen.has(cur)) { if (cur === u.username) throw new Error('Struktur berputar: atasan yang dipilih sudah berada di bawah orang ini.'); seen.add(cur); cur = (s.users.find((x) => x.username === cur) || {}).reportsTo; }
      }
      if (ex) { Object.assign(ex, u); return { user: ex }; }
      const nu = { username: u.username, name: u.name, role: u.role, sheetName: u.hasTasks === false || u.orgOnly ? '' : u.name, mustChange: true, active: true, email: u.email || '', position: u.position || '',
        reportsTo: u.reportsTo || '', division: u.division || '', skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly };
      s.users.push(nu); return u.orgOnly ? { user: nu } : { user: nu, password: 'demo' };
    }
    case 'resetPassword': return { password: 'demo' };
    case 'leaveDecide': {
      const l = s.leaves.find((x) => x.id === b.id); if (!l) throw new Error('Pengajuan tidak ditemukan.');
      if (l.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diputuskan.');
      l.status = b.decision === 'approve' ? 'Disetujui' : 'Ditolak'; l.decidedBy = me.username; l.note = b.note || '';
      return schData(s, me, schWeekOf(new Date(l.from + 'T00:00:00')));
    }
    case 'sendReport': return { to: 'digmar@linovhr.com', subject: '(mode demo) ' + (b.kind === 'month' ? 'Laporan bulanan tim' : 'Laporan mingguan tim'), period: 'demo' };
    case 'deleteUser': {
      const u = s.users.find((x) => x.username === b.username);
      if (!u) throw new Error('Pengguna tidak ditemukan');
      if (u.username === me.username) throw new Error('Anda tidak bisa menghapus akun sendiri');
      if (u.active) throw new Error('Nonaktifkan akun ini dulu sebelum menghapusnya');
      const n = s.tasks.filter((t) => t.owner === u.username).length;
      if (n && String(b.confirm || '').toLowerCase() !== u.username) throw new Error('Ketik username "' + u.username + '" untuk mengonfirmasi penghapusan');
      s.users = s.users.filter((x) => x !== u); s.tasks = s.tasks.filter((t) => t.owner !== u.username);
      s.users.forEach((x) => { if (x.reportsTo === u.username) x.reportsTo = ''; });
      return { ok: true, username: u.username, archived: n && u.sheetName ? '(arsip) ' + u.sheetName : '', tasks: n };
    }
  }
  throw new Error('Aksi tidak dikenal');
}

root.PTDemo = { handle };
})(typeof self !== 'undefined' ? self : this);

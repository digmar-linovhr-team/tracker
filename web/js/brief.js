/* Brief Maker: brief artikel yang terhubung ke task.
 * Memakai fungsi & state dari app.js (S, api, $, esc, modal, toast, go, …). */
'use strict';

// ---------- definisi ----------
const BRIEF_TYPES = {
  artikel: 'Artikel baru',
  optimasi: 'Optimasi artikel lama',
  landing: 'Landing page',
  pillar: 'Pillar page'
};
const INTENTS = ['Informasional', 'Komersial', 'Transaksional', 'Navigasional', 'Campuran'];
const SCHEMAS = ['Article', 'FAQPage', 'HowTo', 'BreadcrumbList', 'Product', 'SoftwareApplication', 'Organization'];
const CHECK_BASE = [
  'Keyword utama ada di H1, 100 kata pertama, minimal 1 H2, dan meta',
  'Semua internal link di brief sudah dipasang',
  'FAQ sudah ditulis sesuai brief',
  'Alt text semua gambar sudah diisi',
  'Sumber data maksimal 2 tahun terakhir',
  'Lolos cek plagiarisme',
  'Paragraf pendek (≤ 3 kalimat) dan mudah dibaca'
];
const CHECK_EXTRA = {
  optimasi: ['URL/slug tidak berubah', 'Data lama & tanggal "diperbarui" sudah diganti'],
  landing: ['CTA utama terlihat tanpa scroll', 'Form/CTA sudah dites berfungsi'],
  pillar: ['Daftar isi (table of contents) ada', 'Link ke semua artikel cluster sudah dipasang']
};
const OUTLINE_TPL = {
  artikel: [[1, 'Intro', 150, 'Hook masalah pembaca; keyword utama di 100 kata pertama'], [2, 'Apa itu {kw}', 200, 'Definisi 40–50 kata (target featured snippet)'],
    [2, '', 300, ''], [2, '', 300, ''], [2, 'FAQ', 250, 'Pertanyaan dari People Also Ask'], [2, 'Kesimpulan', 120, 'Ringkasan + CTA']],
  optimasi: [[1, 'Intro', 150, 'Perbarui hook & data'], [2, '', 0, 'Salin struktur lama; tulis "(baru)" / "(ubah)" di catatan']],
  landing: [[1, 'Hero', 60, 'Headline manfaat utama + CTA'], [2, 'Masalah', 150, ''], [2, 'Solusi & fitur', 300, ''],
    [2, 'Bukti (testimoni, logo klien, angka)', 150, ''], [2, 'FAQ', 200, ''], [2, 'CTA penutup', 60, '']],
  pillar: [[1, 'Intro', 200, 'Gambaran topik & daftar isi'], [2, 'Pengertian {kw}', 300, ''], [2, '', 400, 'Link ke artikel cluster'],
    [2, '', 400, 'Link ke artikel cluster'], [2, '', 400, ''], [2, 'FAQ', 300, ''], [2, 'Kesimpulan', 150, '']]
};
const WORDS_TPL = { artikel: [1500, 2000], optimasi: ['', ''], landing: [600, 1000], pillar: [3000, 4500] };

/** 10 bagian editor: [id, judul, field yang dihitung untuk kelengkapan] */
const BRIEF_SECTIONS = [
  ['ringkasan', 'Ringkasan & tujuan', ['goal', 'kpi']],
  ['keyword', 'Keyword & intent', ['kwMain', 'kwSecondary', 'intent']],
  ['serp', 'SERP & kompetitor', ['competitors', 'angle']],
  ['audiens', 'Audiens & pesan', ['persona', 'problem', 'message', 'tone']],
  ['meta', 'Judul & meta', ['h1', 'metaTitle', 'metaDesc', 'slug']],
  ['outline', 'Outline', ['outline', 'wordMin']],
  ['faq', 'FAQ & schema', ['faq', 'schema']],
  ['link', 'Link', ['links']],
  ['visual', 'Visual & CTA', ['visual', 'ctaEnd']],
  ['checklist', 'Checklist', ['checklist']]
];

// ---------- data & util ----------
function allTasksForBrief() {
  if (S.all) return S.all.tasks;
  if (S.team) return S.team.tasks;
  return S.mine.tasks;
}
const bKw = (b) => (b && ((b.data && b.data.kwMain) || b.keyword)) || '';
const bTitle = (b) => (b && ((b.data && b.data.h1) || b.title)) || '';
function briefOf(taskId) { return (S.briefs || []).find((b) => b.taskId === taskId) || null; }
function briefTask(b) { return allTasksForBrief().find((t) => t.id === b.taskId) || findTask(b.taskId) || null; }
function canEditBrief(b) {
  if (S.user.role === 'admin') return true;
  const t = briefTask(b);
  return !!t && t.owner === S.user.username;
}
function briefStatus(b) {
  const t = briefTask(b);
  if (!t) return ['Task dihapus', 'muted'];
  if (L.isDone(t)) return ['Selesai', 'good'];
  return b.status === 'Siap ditulis' ? ['Siap ditulis', 'info'] : ['Draft', 'warn'];
}
function checklistOf(b) { return Array.isArray(b && b.data && b.data.checklist) ? b.data.checklist.filter((c) => c && String(c.text || '').trim()) : []; }
function checkCount(b) { const c = checklistOf(b); return { done: c.filter((x) => x.done).length, total: c.length }; }
function filled(v) {
  if (Array.isArray(v)) return v.some((x) => typeof x === 'object' ? Object.values(x).some((y) => String(y == null ? '' : y).trim() && typeof y !== 'number' && typeof y !== 'boolean') : String(x).trim());
  return String(v == null ? '' : v).trim() !== '';
}
function sectionState(d, keys) {
  const n = keys.filter((k) => filled(d[k])).length;
  return n === keys.length ? 'full' : n ? 'part' : 'empty';
}
function completeness(d) {
  const all = BRIEF_SECTIONS.flatMap((s) => s[2]);
  return Math.round((all.filter((k) => filled(d[k])).length / all.length) * 100);
}
function guessKeyword(task) {
  const s = String(task.task || '').trim();
  if (!isUrl(s)) return '';
  try { const seg = new URL(s).pathname.split('/').filter(Boolean).pop() || ''; return decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim(); }
  catch (e) { return ''; }
}
function guessSlug(task) {
  const s = String(task.task || '').trim();
  if (!isUrl(s)) return '';
  try { return new URL(s).pathname; } catch (e) { return ''; }
}

function newBriefData(type, task) {
  const kw = guessKeyword(task);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  return {
    goal: '', kpi: '', oldUrl: type === 'optimasi' && isUrl(task.task) ? task.task.trim() : '', currentPerf: '', changes: '',
    kwMain: kw, kwVolume: '', kwKd: '', kwSecondary: [], intent: type === 'landing' ? 'Komersial' : 'Informasional', serpFeature: '', cannibalNote: '',
    competitors: [{ url: '', words: '', strengths: '', gaps: '' }], angle: '',
    persona: '', problem: '', message: '', tone: 'Santai-profesional, menyapa pembaca dengan "Anda"',
    h1: '', metaTitle: '', metaDesc: '', slug: guessSlug(task),
    outline: (OUTLINE_TPL[type] || OUTLINE_TPL.artikel).map(([level, heading, words, notes]) => ({ level, heading: heading.replace('{kw}', kw ? cap(kw) : '…'), words, notes })),
    wordMin: (WORDS_TPL[type] || WORDS_TPL.artikel)[0], wordMax: (WORDS_TPL[type] || WORDS_TPL.artikel)[1],
    faq: ['', '', ''], schema: type === 'landing' ? ['SoftwareApplication', 'FAQPage'] : ['Article', 'FAQPage', 'BreadcrumbList'],
    links: [{ url: '', anchor: '', kind: 'internal' }],
    visual: '', ctaMid: '', ctaEnd: '',
    checklist: CHECK_BASE.concat(CHECK_EXTRA[type] || []).map((text) => ({ text, done: false })),
    writerNotes: ''
  };
}

/** Kata kunci mirip di brief/task lain (cek kanibalisasi sederhana). */
const KW_STOP = new Set(['dan', 'di', 'ke', 'yang', 'untuk', 'cara', 'apa', 'itu', 'adalah', 'dengan', 'dari', 'the', 'of', 'a', 'pada', 'dalam', 'serta']);
function kwTokens(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !KW_STOP.has(w))); }
function kwSimilar(a, b) {
  const A = kwTokens(a), B = kwTokens(b);
  if (!A.size || !B.size) return false;
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / Math.min(A.size, B.size) >= 0.99 || inter / (A.size + B.size - inter) >= 0.6;
}
function similarBriefs(b) {
  const kw = (b.data.kwMain || '').trim();
  if (kw.length < 3) return [];
  return (S.briefs || []).filter((x) => x.id !== b.id).filter((x) => kwSimilar(kw, x.data && x.data.kwMain) || (x.data && (x.data.kwSecondary || []).some((k) => kwSimilar(kw, k))));
}

// ---------- daftar brief ----------
function viewBriefs() {
  if (S.user.role !== 'admin' && !S.team) {
    $('#view').innerHTML = '<div class="loading">Memuat brief…</div>';
    loadTeam().then((ok) => { if (ok && S.view === 'briefs') go('briefs'); });
    return;
  }
  const f = S.bf;
  const tabs = [['all', 'Semua'], ['mine', 'Milik saya'], ['Draft', 'Draft'], ['Siap ditulis', 'Siap ditulis'], ['Selesai', 'Selesai']];
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg" id="bftab">${tabs.map(([k, l]) => `<button data-k="${k}" class="${f.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="fbar fbar-sm"><label class="fb-search">${FB.search}<input type="search" id="bfq" placeholder="Cari keyword, judul, task…" value="${esc(f.q)}"></label></div>
      <span class="spacer"></span>
      ${eligibleTasks().length ? '<button class="btn primary" id="newbrief">+ Brief baru</button>' : ''}
    </div>
    <div id="blist"></div>`;
  $$('#bftab button').forEach((b) => b.onclick = () => { f.tab = b.dataset.k; renderBriefList(); $$('#bftab button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#bfq').oninput = (e) => { f.q = e.target.value; renderBriefList(); };
  if ($('#newbrief')) $('#newbrief').onclick = () => newBriefModal();
  renderBriefList();
}

function renderBriefList() {
  const f = S.bf, q = f.q.trim().toLowerCase();
  let list = (S.briefs || []).slice();
  list = list.filter((b) => {
    const t = briefTask(b), st = briefStatus(b)[0];
    if (f.tab === 'mine' && !(t && t.owner === S.user.username) && b.createdBy !== S.user.username) return false;
    if (['Draft', 'Siap ditulis', 'Selesai'].includes(f.tab) && st !== f.tab) return false;
    if (q && !(bKw(b) + ' ' + bTitle(b) + ' ' + (t ? t.task + ' ' + t.ownerName + ' ' + t.code : '')).toLowerCase().includes(q)) return false;
    return true;
  });
  const order = { 'Siap ditulis': 0, Draft: 1, Selesai: 2, 'Task dihapus': 3 };
  list.sort((a, b) => (order[briefStatus(a)[0]] - order[briefStatus(b)[0]]) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!list.length) {
    $('#blist').innerHTML = `<div class="card empty"><b>${(S.briefs || []).length ? 'Tidak ada brief yang cocok' : 'Belum ada brief'}</b>${eligibleTasks().length ? 'Buat brief dari tombol <b>+ Brief baru</b> atau tombol <b>+ Brief</b> di task.' : 'Brief dibuat dari task yang sedang dikerjakan.'}</div>`;
    return;
  }
  $('#blist').innerHTML = `<div class="card tlist brief-list">
    <div class="bl-head"><span>Keyword & judul</span><span>Task</span><span>Tipe</span><span>Status</span></div>
    ${list.map((b) => {
      const t = briefTask(b), [st, cls] = briefStatus(b), cc = checkCount(b);
      const end = t ? L.schedule(t).end : null;
      return `<button class="bl-row" data-brief="${esc(b.id)}">
        <span class="bl-kw"><b>${esc(bKw(b) || '(tanpa keyword)')}</b><small>${esc(bTitle(b) || 'Judul belum diisi')}</small></span>
        <span class="bl-task">${t ? `${t.code ? `<span class="code-tag">${esc(t.code)}</span> ` : ''}${esc(t.ownerName)}<small>${end ? 'deadline ' + esc(fmtD(end)) + ' · ' : ''}checklist ${cc.done}/${cc.total}</small>` : '<small>Task sudah dihapus</small>'}</span>
        <span class="bl-type">${esc(BRIEF_TYPES[b.type] || '')}</span>
        <span><span class="bstat ${cls}">${esc(st)}</span></span>
      </button>`;
    }).join('')}</div>`;
  $$('[data-brief]', $('#blist')).forEach((r) => r.onclick = () => openBrief(r.dataset.brief));
}

/** Task yang boleh dibuatkan brief oleh pengguna ini (belum punya brief, belum Done). */
function eligibleTasks() {
  const admin = S.user.role === 'admin';
  return allTasksForBrief().filter((t) => t.id && !L.isDone(t) && !briefOf(t.id) && (admin || t.owner === S.user.username));
}

function taskOptions(list, sel) {
  const byOwner = {};
  list.forEach((t) => { (byOwner[t.ownerName] = byOwner[t.ownerName] || []).push(t); });
  const label = (t) => (t.code ? t.code + ' · ' : '') + String(t.task).replace(/^https?:\/\/(www\.)?/, '').slice(0, 70);
  const owners = Object.keys(byOwner).sort();
  if (owners.length === 1) return byOwner[owners[0]].map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(label(t))}</option>`).join('');
  return owners.map((o) => `<optgroup label="${esc(o)}">${byOwner[o].map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(label(t))}</option>`).join('')}</optgroup>`).join('');
}

function newBriefModal(taskId, copyFrom) {
  const list = eligibleTasks();
  if (!list.length) return toast('Semua task Anda yang aktif sudah punya brief.', true);
  modal({
    title: copyFrom ? 'Duplikat brief ke task lain' : 'Brief baru',
    body: `<form id="nbf">
      <label class="field"><span>Task terkait *</span><select name="taskId" required><option value="">Pilih task…</option>${taskOptions(list, taskId)}</select></label>
      <label class="field"><span>Tipe konten</span><select name="type">${Object.entries(BRIEF_TYPES).map(([k, l]) => `<option value="${k}" ${(copyFrom ? copyFrom.type : 'artikel') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted small" style="margin:0">${copyFrom ? `Struktur, outline, kompetitor, link, dan checklist disalin dari brief "${esc(bKw(copyFrom))}". Keyword, judul, dan meta dikosongkan.` : 'Outline dan checklist awal disiapkan sesuai tipe konten. Keyword ditebak dari URL task bila ada.'}</p>
      <div id="nberr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="nbok">${copyFrom ? 'Duplikat' : 'Buat brief'}</button>`,
    onMount: (m, close) => {
      $('#nbok', m).onclick = async () => {
        const f = $('#nbf', m); if (!f.reportValidity()) return;
        const task = list.find((t) => t.id === f.taskId.value), type = f.type.value;
        let data = newBriefData(type, task);
        if (copyFrom) {
          data = JSON.parse(JSON.stringify(copyFrom.data || {}));
          Object.assign(data, { kwMain: guessKeyword(task), kwVolume: '', kwKd: '', kwSecondary: [], cannibalNote: '', h1: '', metaTitle: '', metaDesc: '', slug: guessSlug(task),
            oldUrl: type === 'optimasi' && isUrl(task.task) ? task.task.trim() : '', currentPerf: '' });
          data.checklist = checklistOf(copyFrom).map((c) => ({ text: c.text, done: false }));
        }
        try {
          const r = await busy($('#nbok', m), () => api.call('saveBrief', { brief: { taskId: task.id, type, status: 'Draft', data } }));
          close();
          S.briefs = (S.briefs || []).filter((x) => x.id !== r.brief.id).concat(r.brief);
          saveCache();
          toast(copyFrom ? 'Brief diduplikat' : 'Brief dibuat');
          openBrief(r.brief.id);
        } catch (err) { $('#nberr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

// ---------- editor ----------
function openBrief(id) {
  const b = (S.briefs || []).find((x) => x.id === id);
  if (!b) return toast('Brief tidak ditemukan. Muat ulang data.', true);
  if (!S.bEdit || S.bEdit.id !== id || !S.bEdit.dirty) {
    S.bEdit = { id, b: JSON.parse(JSON.stringify(b)), dirty: false, saving: false, savedAt: b.updatedAt ? new Date(b.updatedAt) : null, error: '', sec: 'ringkasan' };
  }
  go('brief');
}

function viewBrief() {
  const E = S.bEdit;
  if (!E) return go('briefs');
  const b = E.b, d = b.data, task = briefTask(b), edit = canEditBrief(b);
  const ro = edit ? '' : 'disabled';
  const sims = similarBriefs(b);
  $('#view-title').textContent = bKw(b) || 'Brief';
  $('#view-sub').textContent = (BRIEF_TYPES[b.type] || '') + (task ? ' · ' + task.ownerName : '');
  const [st, stc] = briefStatus(b);
  const secNav = BRIEF_SECTIONS.map(([id, label, keys], i) => {
    const s = sectionState(d, keys);
    return `<a href="#sec-${id}" data-sec="${id}" class="${E.sec === id ? 'on' : ''}"><span class="sdot ${s}"></span>${i + 1} ${esc(label)}</a>`;
  }).join('');
  const pct = completeness(d);

  $('#view').innerHTML = `
    <div class="bed-top">
      <button class="btn ghost sm" id="bback">← Brief</button>
      <div class="bed-task">${task ? `${task.code ? `<span class="code-tag">${esc(task.code)}</span> ` : ''}<b>${prettyTitle(task.task)}</b> <span class="muted">· ${esc(task.ownerName)}${L.schedule(task).end ? ' · deadline ' + esc(fmtD(L.schedule(task).end)) : ''}</span>` : '<span class="muted">Task sudah dihapus</span>'}</div>
      <span class="bstat ${stc}">${esc(st)}</span>
      <span class="muted small" id="bsave">${saveText()}</span>
      <div class="bed-actions">
        ${b.docUrl ? `<a class="btn sm" href="${esc(b.docUrl)}" target="_blank" rel="noopener">Buka Google Doc</a>` : ''}
        ${edit ? `<button class="btn sm" id="bdoc">${b.docUrl ? 'Perbarui Doc' : 'Buat Google Doc'}</button>` : ''}
        ${edit && eligibleTasks().length ? '<button class="btn sm" id="bdup">Duplikat</button>' : ''}
        ${edit && st !== 'Selesai' ? (b.status === 'Siap ditulis' ? '<button class="btn sm" id="bstat" data-to="Draft">Kembali ke draft</button>' : '<button class="btn sm primary" id="bstat" data-to="Siap ditulis">Tandai siap ditulis</button>') : ''}
        ${edit ? '<button class="btn sm ghost danger" id="bdel" title="Hapus brief">Hapus</button>' : ''}
      </div>
    </div>
    ${E.error ? `<div class="banner warn"><div>${esc(E.error)}</div><button class="btn sm" id="breload">Muat ulang brief</button></div>` : ''}
    ${edit ? '' : '<div class="banner"><div>Hanya bisa dilihat. Brief ini hanya bisa diubah oleh pemilik task dan admin.</div></div>'}
    <div class="bed">
      <nav class="bed-nav" aria-label="Bagian brief">${secNav}<div class="bed-pct"><span>Kelengkapan <b id="bpct">${pct}%</b></span><div class="bar"><i id="bpctbar" style="width:${pct}%"></i></div></div></nav>
      <div class="bed-main" id="bmain">
        ${secCard(1, 'ringkasan', 'Ringkasan & tujuan', `
          <div class="grid2">${fText('goal', 'Tujuan bisnis', 'mis. Traffic TOFU → leads demo modul Reimbursement', ro)}${fText('kpi', 'KPI', 'mis. Top 3 dalam 90 hari · 1.500 klik/bulan', ro)}</div>
          ${b.type === 'optimasi' ? `${fText('oldUrl', 'URL artikel lama', 'https://www.linovhr.com/blog/…', ro)}
            <div class="grid2">${fArea('currentPerf', 'Performa saat ini', 'mis. posisi 14, 320 klik/bulan, CTR 1,2%', ro)}${fArea('changes', 'Yang harus diubah', 'mis. tambah bagian pajak, perbarui data 2026, tambah FAQ', ro)}</div>` : ''}`)}
        ${secCard(2, 'keyword', 'Keyword & intent', `
          <div class="grid3">${fText('kwMain', 'Keyword utama *', 'mis. reimbursement karyawan', ro)}${fText('kwVolume', 'Volume / bulan', 'mis. 2.900', ro)}${fText('kwKd', 'Keyword difficulty', 'mis. 35 / sedang', ro)}</div>
          <div id="bsim">${simHtml(sims)}</div>
          ${fTags('kwSecondary', 'Keyword turunan / LSI', 'Ketik lalu tekan Enter', ro)}
          <div class="grid2">${fSelect('intent', 'Search intent', INTENTS, ro)}${fText('serpFeature', 'Target SERP feature', 'mis. Featured snippet definisi + People Also Ask', ro)}</div>
          ${fText('cannibalNote', 'Catatan kanibalisasi', 'mis. /blog/klaim-biaya juga ranking — beri link ke artikel ini', ro)}`)}
        ${secCard(3, 'serp', 'Analisis SERP & kompetitor', `
          ${rowsTable('competitors', [['url', 'URL kompetitor', 'https://…', 'w-url'], ['words', 'Jumlah kata', '1900', 'w-num'], ['strengths', 'Kelebihan', '', ''], ['gaps', 'Celah (gap)', '', '']], ro, '+ Kompetitor')}
          ${fArea('angle', 'Angle pembeda', 'Apa yang membuat artikel kita lebih baik dari halaman 1 Google?', ro)}`)}
        ${secCard(4, 'audiens', 'Audiens & pesan', `
          <div class="grid2">${fArea('persona', 'Persona pembaca', 'mis. Staf HR/finance UKM 50–300 karyawan, masih pakai Excel', ro)}${fArea('problem', 'Masalah utama', 'mis. Klaim lambat, bukti hilang, rawan double claim', ro)}</div>
          <div class="grid2">${fArea('message', 'Pesan kunci', 'Satu kalimat yang harus diingat pembaca', ro)}${fArea('tone', 'Tone & gaya', '', ro)}</div>`)}
        ${secCard(5, 'meta', 'Judul & metadata', `
          ${fText('h1', 'Judul (H1)', '', ro)}
          ${fText('metaTitle', 'Meta title', '', ro, 60)}
          ${fArea('metaDesc', 'Meta description', '', ro, 155, 2)}
          ${fText('slug', 'Slug / URL', '/blog/…', ro)}
          <div class="serp-prev" id="bserp">${serpPreview(d)}</div>`)}
        ${secCard(6, 'outline', 'Outline per bagian', `
          <div class="ol-head"><span>Heading</span><span>Kata</span><span>Poin wajib & keyword</span><span></span></div>
          <div id="boutline">${outlineRows(d, ro)}</div>
          ${ro ? '' : '<div class="row" style="gap:6px;margin-top:8px"><button type="button" class="btn sm" data-add="outline" data-level="2">+ H2</button><button type="button" class="btn sm" data-add="outline" data-level="3">+ H3</button></div>'}
          <div class="ol-total" id="bwords">${wordsText(d)}</div>
          <div class="grid2" style="margin-top:10px">${fText('wordMin', 'Target kata minimal', '1500', ro)}${fText('wordMax', 'Target kata maksimal', '2000', ro)}</div>`)}
        ${secCard(7, 'faq', 'FAQ & schema', `
          <div class="field"><span>Pertanyaan FAQ (dari People Also Ask)</span>${listInputs('faq', 'Pertanyaan…', ro)}${ro ? '' : '<button type="button" class="btn sm" data-add="faq">+ Pertanyaan</button>'}</div>
          <div class="field"><span>Schema markup</span><div class="chips-pick">${SCHEMAS.map((x) => `<label class="cpick ${(d.schema || []).includes(x) ? 'on' : ''}"><input type="checkbox" data-schema="${x}" ${(d.schema || []).includes(x) ? 'checked' : ''} ${ro}>${x}</label>`).join('')}</div></div>`)}
        ${secCard(8, 'link', 'Link internal & eksternal', rowsTable('links', [['url', 'Tujuan (URL)', '/fitur/… atau https://…', 'w-url'], ['anchor', 'Anchor text', '', ''], ['kind', 'Jenis', '', 'w-kind', [['internal', 'Internal'], ['external', 'Eksternal']]]], ro, '+ Link'))}
        ${secCard(9, 'visual', 'Visual & CTA', `
          ${fArea('visual', 'Visual yang dibutuhkan', 'mis. Featured image, infografik alur, 2 screenshot LinovHR (alt text berisi keyword)', ro)}
          <div class="grid2">${fText('ctaMid', 'CTA tengah', 'mis. Unduh template Excel', ro)}${fText('ctaEnd', 'CTA akhir', 'mis. Jadwalkan demo modul Reimbursement', ro)}</div>`)}
        ${secCard(10, 'checklist', 'Checklist sebelum ajukan review', `
          <p class="muted small" style="margin:0 0 8px">Dicentang penulis di task-nya. Admin melihat progresnya saat review.</p>
          <div id="bcheck">${checkRows(d, ro)}</div>
          ${ro ? '' : '<button type="button" class="btn sm" data-add="checklist">+ Item</button>'}
          ${fArea('writerNotes', 'Catatan lain untuk penulis', '', ro)}`)}
      </div>
    </div>`;
  bindBriefEditor(edit);
}

function saveText() {
  const E = S.bEdit;
  if (!E) return '';
  if (E.saving) return 'Menyimpan…';
  if (E.dirty) return 'Belum tersimpan';
  return E.savedAt ? 'Tersimpan ' + pad(E.savedAt.getHours()) + ':' + pad(E.savedAt.getMinutes()) : '';
}
function secCard(n, id, title, inner) {
  return `<section class="card bsec" id="sec-${id}" data-secid="${id}"><div class="card-h"><h2><span class="bnum">${n}</span>${esc(title)}</h2></div><div class="card-b">${inner}</div></section>`;
}
function fText(k, label, ph, ro, max) {
  const v = S.bEdit.b.data[k] == null ? '' : S.bEdit.b.data[k];
  return `<label class="field"><span>${esc(label)}${max ? ` <em class="cnt" data-cnt="${k}" data-max="${max}">${String(v).length}/${max}</em>` : ''}</span><input type="text" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph || '')}" ${ro}></label>`;
}
function fArea(k, label, ph, ro, max, rows) {
  const v = S.bEdit.b.data[k] == null ? '' : S.bEdit.b.data[k];
  return `<label class="field"><span>${esc(label)}${max ? ` <em class="cnt" data-cnt="${k}" data-max="${max}">${String(v).length}/${max}</em>` : ''}</span><textarea data-k="${k}" rows="${rows || 2}" placeholder="${esc(ph || '')}" ${ro}>${esc(v)}</textarea></label>`;
}
function fSelect(k, label, opts, ro) {
  const v = S.bEdit.b.data[k] || '';
  return `<label class="field"><span>${esc(label)}</span><select data-k="${k}" ${ro}><option value="">—</option>${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
}
function fTags(k, label, ph, ro) {
  const list = S.bEdit.b.data[k] || [];
  return `<div class="field"><span>${esc(label)}</span><div class="tags" data-tags="${k}">${list.map((t, i) => `<span class="tag">${esc(t)}${ro ? '' : `<button type="button" data-untag="${i}" aria-label="Hapus ${esc(t)}">×</button>`}</span>`).join('')}${ro ? '' : `<input type="text" data-tagin="${k}" placeholder="${esc(ph)}">`}</div></div>`;
}
function rowsTable(arr, cols, ro, addLabel) {
  const list = S.bEdit.b.data[arr] || [];
  return `<div class="rtab" style="--cols:${cols.map((c) => c[3] === 'w-url' ? 'minmax(0,1.6fr)' : c[3] === 'w-num' ? '90px' : c[3] === 'w-kind' ? '120px' : 'minmax(0,1fr)').join(' ')} 34px">
    <div class="rtab-h">${cols.map((c) => `<span>${esc(c[1])}</span>`).join('')}<span></span></div>
    ${list.map((r, i) => `<div class="rtab-r">${cols.map((c) => c[4]
      ? `<select data-arr="${arr}" data-i="${i}" data-f="${c[0]}" aria-label="${esc(c[1])}" ${ro}>${c[4].map(([v, l]) => `<option value="${v}" ${r[c[0]] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : `<input type="text" data-arr="${arr}" data-i="${i}" data-f="${c[0]}" value="${esc(r[c[0]] == null ? '' : r[c[0]])}" placeholder="${esc(c[2])}" aria-label="${esc(c[1])}" ${ro}>`).join('')}
      ${ro ? '<span></span>' : `<button type="button" class="ibtn" data-rm="${arr}" data-i="${i}" aria-label="Hapus baris">×</button>`}</div>`).join('')}
    ${ro ? '' : `<button type="button" class="btn sm" data-add="${arr}">${esc(addLabel)}</button>`}</div>`;
}
function listInputs(arr, ph, ro) {
  return (S.bEdit.b.data[arr] || []).map((v, i) => `<div class="li-row"><span class="li-n">${i + 1}</span><input type="text" data-arr="${arr}" data-i="${i}" value="${esc(v)}" placeholder="${esc(ph)}" ${ro}>${ro ? '' : `<button type="button" class="ibtn" data-rm="${arr}" data-i="${i}" aria-label="Hapus">×</button>`}</div>`).join('');
}
function outlineRows(d, ro) {
  return (d.outline || []).map((o, i) => `<div class="ol-row lv${o.level || 2}">
    <div class="ol-hd">${ro ? '' : `<span class="ol-move"><button type="button" class="ibtn" data-mv="${i}" data-dir="-1" aria-label="Naik" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="ibtn" data-mv="${i}" data-dir="1" aria-label="Turun" ${i === d.outline.length - 1 ? 'disabled' : ''}>↓</button></span>`}
      <button type="button" class="lvl" data-lvl="${i}" ${ro} title="Ganti level">${o.level === 1 ? 'Intro' : 'H' + (o.level || 2)}</button>
      <input type="text" data-arr="outline" data-i="${i}" data-f="heading" value="${esc(o.heading || '')}" placeholder="Judul bagian" ${ro}></div>
    <input type="number" min="0" step="10" data-arr="outline" data-i="${i}" data-f="words" value="${esc(o.words == null ? '' : o.words)}" aria-label="Target kata" ${ro}>
    <input type="text" data-arr="outline" data-i="${i}" data-f="notes" value="${esc(o.notes || '')}" placeholder="Poin wajib, keyword, sumber…" ${ro}>
    ${ro ? '<span></span>' : `<button type="button" class="ibtn" data-rm="outline" data-i="${i}" aria-label="Hapus bagian">×</button>`}
  </div>`).join('');
}
function checkRows(d, ro) {
  return (d.checklist || []).map((c, i) => `<div class="li-row"><span class="cbx ${c.done ? 'on' : ''}" title="${c.done ? 'Sudah dicentang penulis' : 'Belum'}">${c.done ? '✓' : ''}</span><input type="text" data-arr="checklist" data-i="${i}" data-f="text" value="${esc(c.text || '')}" ${ro}>${ro ? '' : `<button type="button" class="ibtn" data-rm="checklist" data-i="${i}" aria-label="Hapus item">×</button>`}</div>`).join('');
}
function totalWords(d) { return (d.outline || []).reduce((n, o) => n + (Number(o.words) || 0), 0); }
function wordsText(d) {
  const t = totalWords(d), mn = Number(d.wordMin) || 0, mx = Number(d.wordMax) || 0;
  const ok = (!mn || t >= mn) && (!mx || t <= mx);
  return `Total <b>${t.toLocaleString('id-ID')}</b> kata${mn || mx ? ` · target ${mn ? mn.toLocaleString('id-ID') : '…'}–${mx ? mx.toLocaleString('id-ID') : '…'}` : ''} ${mn || mx ? `<span class="${ok ? 'ok' : 'warn'}">${ok ? '✓ sesuai' : t < mn ? 'kurang ' + (mn - t).toLocaleString('id-ID') : 'lebih ' + (t - mx).toLocaleString('id-ID')}</span>` : ''}`;
}
function serpPreview(d) {
  const slug = String(d.slug || '').replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
  return `<div class="muted small">Pratinjau Google</div>
    <div class="sp-url">www.linovhr.com${slug.length ? ' › ' + slug.map(esc).join(' › ') : ''}</div>
    <div class="sp-title">${esc(d.metaTitle || d.h1 || 'Meta title belum diisi')}</div>
    <div class="sp-desc">${esc(d.metaDesc || 'Meta description belum diisi.')}</div>`;
}
function simHtml(sims) {
  if (!sims.length) return '';
  return `<div class="bwarn">⚠ Keyword mirip sudah ada di: ${sims.slice(0, 4).map((x) => { const t = briefTask(x); return `<button type="button" class="linkish" data-brief="${esc(x.id)}">${esc(bKw(x))}${t ? ' (' + esc(t.ownerName) + ')' : ''}</button>`; }).join(', ')}. Pastikan tidak saling bersaing di Google.</div>`;
}

// ---------- interaksi editor ----------
function markDirty() {
  const E = S.bEdit;
  E.dirty = true;
  $('#bsave').textContent = saveText();
  clearTimeout(E.timer);
  E.timer = setTimeout(briefSave, 2500);
}
function refreshLive() {
  const d = S.bEdit.b.data;
  BRIEF_SECTIONS.forEach(([id, , keys]) => { const a = $(`.bed-nav [data-sec="${id}"] .sdot`); if (a) a.className = 'sdot ' + sectionState(d, keys); });
  const pct = completeness(d);
  if ($('#bpct')) { $('#bpct').textContent = pct + '%'; $('#bpctbar').style.width = pct + '%'; }
  if ($('#bwords')) $('#bwords').innerHTML = wordsText(d);
  if ($('#bserp')) $('#bserp').innerHTML = serpPreview(d);
  $$('[data-cnt]').forEach((c) => { const n = String(d[c.dataset.cnt] || '').length, max = +c.dataset.max; c.textContent = n + '/' + max; c.classList.toggle('over', n > max); });
}
/** Gambar ulang editor (setelah tambah/hapus baris) tanpa kehilangan posisi gulir & fokus. */
function rerenderBrief(focusSel) {
  const y = window.scrollY, m = $('.main'), my = m ? m.scrollTop : 0;
  viewBrief();
  window.scrollTo(0, y); if ($('.main')) $('.main').scrollTop = my;
  if (focusSel) { const el = $(focusSel); if (el) el.focus({ preventScroll: true }); }
}

function bindBriefEditor(edit) {
  const E = S.bEdit, d = E.b.data, root = $('#bmain');   // elemen baru tiap render → listener tidak menumpuk
  $('#bback').onclick = () => go('briefs');
  if ($('#breload')) $('#breload').onclick = async () => { E.dirty = false; E.error = ''; await loadData(true); openBriefFresh(E.id); };
  $$('.bed-nav a').forEach((a) => a.onclick = (e) => {
    e.preventDefault(); E.sec = a.dataset.sec;
    $$('.bed-nav a').forEach((x) => x.classList.toggle('on', x === a));
    const sec = $('#sec-' + a.dataset.sec); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $$('[data-brief]', $('#view')).forEach((x) => x.onclick = () => { briefFlush(); openBrief(x.dataset.brief); });
  if (!edit) return;

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.k) {
      d[el.dataset.k] = el.value;
      if (el.dataset.k === 'kwMain') { clearTimeout(E.simT); E.simT = setTimeout(() => { $('#bsim').innerHTML = simHtml(similarBriefs(E.b)); $$('#bsim [data-brief]').forEach((x) => x.onclick = () => { briefFlush(); openBrief(x.dataset.brief); }); }, 400); }
    } else if (el.dataset.arr) {
      const list = d[el.dataset.arr], i = +el.dataset.i;
      if (el.dataset.f) list[i][el.dataset.f] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
      else list[i] = el.value;
    } else return;
    markDirty(); refreshLive();
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName === 'SELECT' && (el.dataset.k || el.dataset.arr)) {
      if (el.dataset.k) d[el.dataset.k] = el.value; else d[el.dataset.arr][+el.dataset.i][el.dataset.f] = el.value;
      markDirty(); refreshLive();
    }
    if (el.dataset.schema) {
      const set = new Set(d.schema || []); el.checked ? set.add(el.dataset.schema) : set.delete(el.dataset.schema);
      d.schema = SCHEMAS.filter((x) => set.has(x)); el.closest('.cpick').classList.toggle('on', el.checked);
      markDirty(); refreshLive();
    }
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    if (el.dataset.tagin && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = el.value.trim().replace(/,$/, '');
      if (!v) return;
      const list = d[el.dataset.tagin] = d[el.dataset.tagin] || [];
      v.split(/\s*,\s*/).filter(Boolean).forEach((x) => { if (!list.some((y) => y.toLowerCase() === x.toLowerCase())) list.push(x); });
      markDirty(); rerenderBrief(`[data-tagin="${el.dataset.tagin}"]`);
    } else if (el.dataset.tagin && e.key === 'Backspace' && !el.value && (d[el.dataset.tagin] || []).length) {
      d[el.dataset.tagin].pop(); markDirty(); rerenderBrief(`[data-tagin="${el.dataset.tagin}"]`);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); briefSave(); }
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.untag !== undefined) { const k = b.closest('[data-tags]').dataset.tags; d[k].splice(+b.dataset.untag, 1); markDirty(); rerenderBrief(); }
    else if (b.dataset.add) {
      const a = b.dataset.add;
      const blank = { competitors: { url: '', words: '', strengths: '', gaps: '' }, links: { url: '', anchor: '', kind: 'internal' }, faq: '', checklist: { text: '', done: false }, outline: { level: +b.dataset.level || 2, heading: '', words: '', notes: '' } }[a];
      d[a] = d[a] || []; d[a].push(typeof blank === 'object' ? Object.assign({}, blank) : blank);
      markDirty(); rerenderBrief(`[data-arr="${a}"][data-i="${d[a].length - 1}"]`);
    } else if (b.dataset.rm) { d[b.dataset.rm].splice(+b.dataset.i, 1); markDirty(); rerenderBrief(); }
    else if (b.dataset.mv !== undefined) {
      const i = +b.dataset.mv, j = i + (+b.dataset.dir), o = d.outline;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]]; markDirty(); rerenderBrief(`[data-mv="${j}"][data-dir="${b.dataset.dir}"]`);
    } else if (b.dataset.lvl !== undefined) {
      const o = d.outline[+b.dataset.lvl]; o.level = o.level === 2 ? 3 : o.level === 3 ? 1 : 2;
      markDirty(); rerenderBrief(`[data-lvl="${b.dataset.lvl}"]`);
    }
  });
  if ($('#bstat')) $('#bstat').onclick = () => { E.b.status = $('#bstat').dataset.to; E.dirty = true; briefSave().then(() => { if (S.view === 'brief') rerenderBrief(); }); };
  if ($('#bdup')) $('#bdup').onclick = () => { briefFlush(); newBriefModal(null, E.b); };
  if ($('#bdoc')) $('#bdoc').onclick = async () => {
    const btn = $('#bdoc');
    if (E.dirty) await briefSave();
    try {
      const r = await busy(btn, () => api.call('exportBriefDoc', { briefId: E.id }));
      putBrief(r.brief); E.b.docUrl = r.brief.docUrl; E.b.updatedAt = r.brief.updatedAt;
      toast('Google Doc siap'); rerenderBrief();
      window.open(r.url, '_blank', 'noopener');
    } catch (err) { /* busy sudah menampilkan pesan */ }
  };
  if ($('#bdel')) $('#bdel').onclick = async () => {
    if (!(await confirmBox('Hapus brief?', `Brief "${bKw(E.b)}" akan dihapus. Task-nya tidak ikut terhapus.${E.b.docUrl ? ' Google Doc tetap ada di Drive.' : ''}`))) return;
    try {
      await busy(null, () => api.call('deleteBrief', { briefId: E.id }));
      S.briefs = S.briefs.filter((x) => x.id !== E.id); S.bEdit = null; saveCache();
      toast('Brief dihapus'); go('briefs');
    } catch (err) { /* sudah ditampilkan */ }
  };
}

function putBrief(nb) {
  S.briefs = (S.briefs || []).filter((x) => x.id !== nb.id).concat(nb);
  saveCache();
}
function openBriefFresh(id) { S.bEdit = null; openBrief(id); }

async function briefSave() {
  const E = S.bEdit;
  if (!E || !E.dirty || E.saving) return;
  clearTimeout(E.timer);
  E.saving = true; E.dirty = false;
  const el = $('#bsave'); if (el && S.view === 'brief') el.textContent = saveText();
  const snapshot = JSON.parse(JSON.stringify(E.b));
  try {
    const r = await api.call('saveBrief', { brief: { id: snapshot.id, taskId: snapshot.taskId, type: snapshot.type, status: snapshot.status, data: snapshot.data, baseUpdatedAt: snapshot.updatedAt } });
    E.b.updatedAt = r.brief.updatedAt; E.b.updatedBy = r.brief.updatedBy; E.b.docUrl = r.brief.docUrl || E.b.docUrl;
    E.savedAt = new Date(); E.error = '';
    putBrief(Object.assign({}, r.brief, { data: E.dirty ? snapshot.data : r.brief.data }));
  } catch (e) {
    E.dirty = true;
    const msg = cleanErr(e);
    if (/diubah oleh|tidak ditemukan/.test(msg)) { E.error = msg; if (S.view === 'brief') rerenderBrief(); }
    else toast('Brief belum tersimpan: ' + msg, true);
  } finally {
    E.saving = false;
    const el2 = $('#bsave'); if (el2 && S.view === 'brief') el2.textContent = saveText();
    if (E.dirty && !E.error) { clearTimeout(E.timer); E.timer = setTimeout(briefSave, 4000); }
  }
}
/** Dipanggil saat meninggalkan editor: simpan perubahan yang tertunda di belakang layar. */
function briefFlush() { if (S.bEdit && S.bEdit.dirty && !S.bEdit.error) briefSave(); }
window.addEventListener('beforeunload', (e) => { if (S.bEdit && (S.bEdit.dirty || S.bEdit.saving) && !S.bEdit.error) { briefSave(); e.preventDefault(); e.returnValue = ''; } });

// ---------- integrasi dengan task ----------
/** Chip Brief + checklist di baris task. */
function briefChips(t, readonly, noChecklist) {
  const b = briefOf(t.id);
  if (!b) {
    const can = !readonly && t.id && !L.isDone(t) && (S.user.role === 'admin' || t.owner === S.user.username);
    return can ? `<button type="button" class="res-add" data-newbrief="${esc(t.id)}">${fsvg('<path d="M12 5v14M5 12h14"/>')}Brief</button>` : '';
  }
  const cc = checkCount(b), mine = !readonly && canEditBrief(b) && !L.isDone(t);
  return `<button type="button" class="res-chip brief-chip" data-openbrief="${esc(b.id)}" title="Buka brief: ${esc(bKw(b))}"><span class="res-ico">${ICONS.briefs}</span><span class="res-lbl">Brief${bKw(b) ? ' · ' + esc(bKw(b)) : ''}</span></button>` +
    (cc.total && !noChecklist ? `<button type="button" class="res-chip ck-chip ${cc.done === cc.total ? 'done' : ''}" ${mine ? `data-checklist="${esc(b.id)}"` : `data-openbrief="${esc(b.id)}"`} title="Checklist brief"><span class="ck-ring" style="--p:${Math.round(cc.done / cc.total * 100)}"></span><span class="res-lbl">Checklist ${cc.done}/${cc.total}</span></button>` : '');
}

function bindBriefChips(root) {
  $$('[data-openbrief]', root).forEach((b) => b.onclick = () => openBrief(b.dataset.openbrief));
  $$('[data-newbrief]', root).forEach((b) => b.onclick = () => newBriefModal(b.dataset.newbrief));
  $$('[data-checklist]', root).forEach((b) => b.onclick = () => checklistModal(b.dataset.checklist));
}

/** Penulis mencentang checklist brief. opts.thenReview: tombol "Ajukan review" di bawah. */
function checklistModal(briefId, opts) {
  opts = opts || {};
  const b = (S.briefs || []).find((x) => x.id === briefId);
  if (!b) return;
  const list = () => (b.data.checklist || []);
  const draw = (m) => {
    const cc = checkCount(b);
    $('#ckl', m).innerHTML = list().map((c, i) => String(c.text || '').trim() ? `<label class="check ck-item"><input type="checkbox" data-ci="${i}" ${c.done ? 'checked' : ''}> <span>${esc(c.text)}</span></label>` : '').join('');
    $('#ckn', m).textContent = `${cc.done}/${cc.total} selesai`;
    $$('[data-ci]', m).forEach((cb) => cb.onchange = async () => {
      const i = +cb.dataset.ci, before = list()[i].done;
      list()[i].done = cb.checked; draw(m); putBrief(b);
      try {
        const r = await api.call('briefCheck', { briefId, index: i, done: cb.checked });
        b.updatedAt = r.brief.updatedAt; b.data = r.brief.data; putBrief(b);
        if (S.bEdit && S.bEdit.id === briefId && !S.bEdit.dirty) S.bEdit.b = JSON.parse(JSON.stringify(b));
      } catch (e) { list()[i].done = before; draw(m); putBrief(b); toast('Gagal menyimpan checklist: ' + cleanErr(e), true); }
    });
  };
  modal({
    title: 'Checklist brief',
    body: `<p class="muted small" style="margin:0 0 10px">${esc(bKw(b))} · <span id="ckn"></span></p><div id="ckl"></div>`,
    actions: opts.thenReview
      ? '<button class="btn" data-close>Batal</button><button class="btn primary" id="ck-go">Ajukan review</button>'
      : `<button class="btn" id="ck-open">Buka brief</button><button class="btn primary" data-close>Selesai</button>`,
    onMount: (m, close) => {
      draw(m);
      if ($('#ck-open', m)) $('#ck-open', m).onclick = () => { close(); openBrief(briefId); };
      if ($('#ck-go', m)) $('#ck-go', m).onclick = () => { close(); opts.thenReview(); };
      const done = $$('[data-close]', m); done.forEach((x) => x.addEventListener('click', () => softRender()));
    }
  });
}

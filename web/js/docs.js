/* global S, api, $, $$, esc, go, toast, cleanErr, modal, confirmBox, formPick, busy, userName, INDUSTRIES, ideaAiHtml, ideaLinkLabel, bankOpen, openTask, loadBank, bankAvailable */
'use strict';
// ---------- Dokumen tim: regulasi, data riset, panduan, template, aset brand, data klien ----------
// Semua anggota menambah; admin memverifikasi & menyematkan. Dokumen terverifikasi dibaca Claude lebih dulu di diskusi ide.

const DOC_CATS = [['Regulasi', '#e8a15c'], ['Data & riset', '#4caf82'], ['Panduan tim', '#4b8fd1'], ['Template', '#9b7be0'], ['Brand & aset', '#c9a93a'], ['Data klien', '#e07a9b']];
const DOC_MAX_MB = 10;
let docsLoading = null;

function loadDocs(force) {
  if (docsLoading) return docsLoading;
  if (!force && S.docs && Date.now() - (S.docsAt || 0) < 15000) return Promise.resolve(false);
  docsLoading = api.call('docs').then((r) => {
    const before = JSON.stringify(S.docs || null);
    S.docs = (r && r.docs) || []; S.docsAt = Date.now();
    return before !== JSON.stringify(S.docs);
  }).catch((e) => { if (!S.docs) S.docs = []; toast(cleanErr(e), true); return false; }).finally(() => { docsLoading = null; });
  return docsLoading;
}

/** Jenis tampilan dokumen (ikon & warna). */
function docType(d) {
  const u = String(d.url || ''), m = String(d.mime || '');
  if (d.kind === 'note') return ['TXT', 'note'];
  if (/pdf/i.test(m) || /\.pdf(\?|$)/i.test(u)) return ['PDF', 'pdf'];
  if (/spreadsheet|excel|csv/i.test(m) || /docs\.google\.com\/spreadsheets|\.xlsx?(\?|$)|\.csv(\?|$)/i.test(u)) return ['TBL', 'tbl'];
  if (/wordprocessing|msword|document/i.test(m) || /docs\.google\.com\/document|\.docx?(\?|$)/i.test(u)) return ['DOC', 'doc'];
  if (/presentation|powerpoint/i.test(m) || /docs\.google\.com\/presentation|\.pptx?(\?|$)/i.test(u)) return ['PPT', 'doc'];
  if (/drive\.google\.com\/drive\/folders/i.test(u)) return ['DIR', 'dir'];
  if (/^image\//i.test(m) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) return ['IMG', 'img'];
  return ['URL', 'lnk'];
}
const docIcon = (d) => { const [l, c] = docType(d); return `<span class="dk-ic ic-${c}" aria-hidden="true">${l}</span>`; };
const docCan = (d) => S.user.role === 'admin' || d.createdBy === S.user.username;
const docWho = (u, nm) => nm || (u === S.user.username ? S.user.name : userName(u)) || u || '';
const docBy = (d) => { const n = docWho(d.createdBy, d.createdByName); return n === d.createdBy ? n.charAt(0).toUpperCase() + n.slice(1) : n; };
const docDate = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };

/** Ide & task yang menyebut tautan dokumen ini (ide: isi, diskusi, sumber Claude; task: catatan & hasil). */
function docUses(d) {
  const keys = [d.url, d.fileId].filter((x) => x && x.length > 8);
  if (!keys.length) return [];
  const hit = (o) => { const j = JSON.stringify(o || ''); return keys.some((k) => j.includes(k)); };
  const out = [];
  (S.bank || []).forEach((i) => { if (hit(i.idea)) out.push({ kind: 'Ide', label: (i.title || 'Ide') + ' · ' + (i.authorName || docWho(i.author)), open: () => typeof bankOpen === 'function' && bankOpen(i.id) }); });
  ((S.all && S.all.tasks) || (S.mine && S.mine.tasks) || []).forEach((t) => { if (hit([t.idea, t.notes, t.results, t.resultNote])) out.push({ kind: 'Task', label: (t.code ? t.code + ' · ' : '') + String(t.task || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), open: () => typeof openTask === 'function' && openTask(t.id) }); });
  return out;
}

function viewDocs() {
  if (!S.docs) { $('#view').innerHTML = '<div class="loading">Memuat dokumen…</div>'; loadDocs(true).then(() => { if (S.view === 'docs') go('docs'); }); return; }
  loadDocs().then((ch) => { if (ch && S.view === 'docs') go('docs'); });
  if (!S.bank && typeof loadBank === 'function' && typeof bankAvailable === 'function' && bankAvailable()) loadBank().then(() => { if (S.view === 'docs') go('docs'); });
  const f = S.dk = S.dk || { cat: '', flag: '', q: '', ind: '', type: '', sel: '' };
  const admin = S.user.role === 'admin', all = S.docs;
  const q = f.q.trim().toLowerCase();
  const match = (d) => (!f.cat || d.category === f.cat)
    && (!f.flag || (f.flag === 'pin' ? d.pinned : f.flag === 'ok' ? !!d.verified : f.flag === 'mine' ? d.createdBy === S.user.username : true))
    && (!f.ind || d.industry === f.ind || (f.ind === '_' && !d.industry))
    && (!f.type || docType(d)[0] === f.type)
    && (!q || [d.title, d.summary, d.quote, d.source, (d.tags || []).join(' '), d.category, d.industry].join(' ').toLowerCase().includes(q));
  const list = all.filter(match).sort((a, b) => (b.pinned - a.pinned) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const pins = all.filter((d) => d.pinned);
  const sel = all.find((d) => d.id === f.sel) || null;
  const cnt = (fn) => all.filter(fn).length;
  const cat = (key, label, n, dot) => `<button type="button" class="dk-cat ${key === (f.cat || f.flag ? (f.cat || 'f:' + f.flag) : '') ? 'on' : ''}" data-dkcat="${esc(key)}">${dot ? `<i style="background:${dot}"></i>` : ''}<span>${label}</span><span class="n">${n}</span></button>`;
  const types = ['PDF', 'TBL', 'DOC', 'PPT', 'URL', 'TXT', 'IMG', 'DIR'].filter((t) => all.some((d) => docType(d)[0] === t));
  const TYPE_NAME = { PDF: 'PDF', TBL: 'Tabel / sheet', DOC: 'Dokumen', PPT: 'Presentasi', URL: 'Halaman web', TXT: 'Catatan', IMG: 'Gambar', DIR: 'Folder' };
  const row = (d) => `<button type="button" class="dk-row ${sel && sel.id === d.id ? 'on' : ''}" data-dk="${esc(d.id)}">${docIcon(d)}
      <span class="dk-t"><b>${esc(d.title)}</b><small><span class="chip">${esc(d.category)}</span>${d.industry ? `<span class="chip">${esc(d.industry)}</span>` : ''}${d.visibility === 'admin' ? '<span class="dk-lock">Admin saja</span>' : ''}${d.source ? `<span class="dk-src">${esc(d.source)}</span>` : ''}</small></span>
      <span class="dk-meta">${d.verified ? '<span class="dk-ok">✓ Terverifikasi</span>' : '<span class="chip warn">Belum dicek</span>'}<br>${esc(docBy(d))} · ${esc(docDate(d.createdAt))}</span></button>`;
  $('#view').innerHTML = `<div class="dk">
    <div class="card dk-cats" role="navigation" aria-label="Kategori dokumen"><div class="card-b">
      ${cat('', 'Semua', all.length, 'var(--accent)')}
      ${DOC_CATS.map(([c, col]) => cat(c, esc(c), cnt((d) => d.category === c), col)).join('')}
      <div class="dk-sep"></div>
      ${cat('f:pin', '★ Disematkan', cnt((d) => d.pinned))}${cat('f:ok', '✓ Terverifikasi', cnt((d) => d.verified))}${cat('f:mine', 'Tambahan saya', cnt((d) => d.createdBy === S.user.username))}
    </div></div>
    <div class="dk-main">
      <div class="dk-tool">
        <label class="dk-search"><span aria-hidden="true">⌕</span><input id="dk-q" type="search" placeholder="Cari judul, ringkasan, atau tag" value="${esc(f.q)}" aria-label="Cari dokumen"></label>
        <div class="dk-fsel"><select id="dk-ind" data-pick="plain" aria-label="Industri"><option value="">Semua industri</option><option value="_" ${f.ind === '_' ? 'selected' : ''}>Berlaku umum</option>${INDUSTRIES.map((x) => `<option ${f.ind === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="dk-fsel"><select id="dk-type" data-pick="plain" aria-label="Jenis"><option value="">Semua jenis</option>${types.map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_NAME[t]}</option>`).join('')}</select></div>
        <button type="button" class="btn primary" id="dk-add">+ Tambah dokumen</button>
      </div>
      ${pins.length && !f.cat && !f.flag && !q && !f.ind && !f.type ? `<div class="dk-h">★ Disematkan</div><div class="dk-pins">${pins.slice(0, 3).map((d) => `<button type="button" class="dk-pin" data-dk="${esc(d.id)}">${docIcon(d)}<b>${esc(d.title)}</b><small>${esc(d.category)}${d.source ? ' · ' + esc(d.source) : ''}${d.verified ? ' · <span class="dk-ok">✓ Terverifikasi</span>' : ''}</small></button>`).join('')}</div>` : ''}
      <div class="dk-h">${f.cat ? esc(f.cat) : f.flag === 'pin' ? 'Disematkan' : f.flag === 'ok' ? 'Terverifikasi' : f.flag === 'mine' ? 'Tambahan saya' : 'Semua dokumen'} · ${list.length}</div>
      ${list.length ? `<div class="dk-list">${list.map(row).join('')}</div>`
        : `<div class="empty"><b>${all.length ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen'}</b>${all.length ? 'Coba kata kunci atau filter lain.' : 'Tambahkan regulasi, data riset, panduan, atau template yang sering dipakai tim.'}</div>`}
      <p class="muted small dk-foot">Dokumen yang sudah diverifikasi admin dibaca Claude lebih dulu saat diskusi ide, sebelum mencari di web. Jangan simpan password atau akses akun di sini.</p>
    </div>
    <aside class="dk-side">${sel ? docDetailHtml(sel) : `<div class="card dk-det dk-empty"><div class="card-b"><p class="muted">Pilih dokumen untuk melihat poin penting, kutipan, dan di mana dokumen itu dipakai.</p></div></div>`}</aside>
  </div>`;
  formPick($('#view'));
  $$('[data-dkcat]').forEach((b) => b.onclick = () => { const k = b.dataset.dkcat; f.cat = k.startsWith('f:') ? '' : k; f.flag = k.startsWith('f:') ? k.slice(2) : ''; go('docs'); });
  const qi = $('#dk-q'); let tm = null;
  qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { f.q = qi.value; go('docs'); const n = $('#dk-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  $('#dk-ind').onchange = (e) => { f.ind = e.target.value; go('docs'); };
  $('#dk-type').onchange = (e) => { f.type = e.target.value; go('docs'); };
  $('#dk-add').onclick = () => docEditor();
  $$('[data-dk]').forEach((b) => b.onclick = () => {
    f.sel = b.dataset.dk;
    if (matchMedia('(max-width: 1100px)').matches) { const d = all.find((x) => x.id === f.sel); if (d) docDetailModal(d); return; }
    go('docs');
  });
  if (sel) docDetailBind($('.dk-side'), sel, () => { f.sel = ''; go('docs'); });
  void admin;
}

function docDetailHtml(d, inModal) {
  const admin = S.user.role === 'admin', uses = docUses(d);
  const sum = String(d.summary || '').trim();
  return `<div class="${inModal ? 'dk-det-m' : 'card dk-det'}"><div class="card-h">${docIcon(d)}<span style="flex:1"></span>
      ${admin ? `<button type="button" class="icon-btn ${d.pinned ? 'on' : ''}" data-dka="pin" title="${d.pinned ? 'Lepas sematan' : 'Sematkan'}" aria-label="${d.pinned ? 'Lepas sematan' : 'Sematkan'}">★</button>` : ''}
      ${inModal ? '' : '<button type="button" class="icon-btn" data-dka="close" aria-label="Tutup detail">✕</button>'}</div>
    <div class="card-b">
      <h3>${esc(d.title)}</h3>
      <div class="dk-chips"><span class="chip">${esc(d.category)}</span>${(d.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}<span class="chip">${esc(d.industry || 'Semua industri')}</span></div>
      <div class="dk-kv">
        ${d.source ? `<span>Sumber</span><b>${esc(d.source)}${d.kind === 'file' && d.fileName ? ' · ' + esc(d.fileName) : ''}</b>` : ''}
        <span>Ditambahkan</span><b>${esc(docBy(d))} · ${esc(docDate(d.createdAt))}</b>
        <span>Verifikasi</span>${d.verified ? `<span class="dk-ok" style="justify-self:start">✓ ${esc(d.verified.byName || d.verified.by)}, ${esc(docDate(d.verified.at))}</span>` : '<span class="chip warn" style="justify-self:start">Belum dicek admin</span>'}
        <span>Bisa dilihat</span><b>${d.visibility === 'admin' ? 'Admin saja' : 'Semua anggota'}</b>
      </div>
      ${sum ? `<div class="dk-sum"><b>Poin penting</b><div class="ai-body">${ideaAiHtml(sum)}</div></div>` : ''}
      ${d.quote ? `<blockquote class="dk-quote">${esc(d.quote)}</blockquote>` : ''}
      <div class="dk-sec">Dipakai di</div>
      ${uses.length ? `<div class="dk-use">${uses.slice(0, 8).map((u, i) => `<button type="button" data-dkuse="${i}"><span class="chip ${u.kind === 'Ide' ? 'info' : ''}">${u.kind}</span><span>${esc(u.label)}</span></button>`).join('')}</div>`
        : '<p class="muted small" style="margin:0">Belum ada ide atau task yang menautkan dokumen ini.</p>'}
      <div class="dk-acts">
        ${d.url ? `<a class="btn primary" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Buka sumber</a>` : ''}
        ${d.quote || sum ? '<button type="button" class="btn" data-dka="copy">Salin kutipan</button>' : ''}
        <button type="button" class="btn" data-dka="ask">Tanya Claude</button>
        ${admin ? `<button type="button" class="btn ${d.verified ? '' : 'ok'}" data-dka="verify">${d.verified ? 'Batalkan verifikasi' : 'Tandai terverifikasi'}</button>` : ''}
        ${docCan(d) ? '<button type="button" class="btn" data-dka="edit">Edit</button><button type="button" class="btn danger" data-dka="del">Hapus</button>' : ''}
      </div>
    </div></div>`;
}

function docDetailModal(d) {
  const close = modal({ title: 'Detail dokumen', wide: true, body: '<div id="dk-dm"></div>', actions: '<button class="btn" data-close>Tutup</button>' });
  const render = () => { const box = $('#dk-dm'); if (!box) return; const x = (S.docs || []).find((y) => y.id === d.id); if (!x) { close(); return; } box.innerHTML = docDetailHtml(x, true); docDetailBind(box, x, close, render); };
  render();
}

function docDetailBind(root, d, close, rerender) {
  const refresh = () => { if (rerender) rerender(); if (S.view === 'docs') go('docs'); };
  const uses = docUses(d);
  $$('[data-dkuse]', root).forEach((b) => b.onclick = () => { const u = uses[Number(b.dataset.dkuse)]; if (u) u.open(); });
  $$('[data-dka]', root).forEach((b) => b.onclick = async () => {
    const a = b.dataset.dka;
    if (a === 'close') { close(); return; }
    if (a === 'copy') {
      const text = d.quote ? `"${d.quote}" (${d.title}${d.url ? ', ' + d.url : ''})` : `${d.title}\n${d.summary}${d.url ? '\n' + d.url : ''}`;
      try { await navigator.clipboard.writeText(text); toast('Kutipan disalin'); } catch (e) { toast('Browser menolak menyalin. Pilih teks lalu tekan Ctrl/⌘ + C.', true); }
      return;
    }
    if (a === 'ask') { docAskModal(d); return; }
    if (a === 'edit') { docEditor(d); return; }
    try {
      if (a === 'pin') { await busy(b, () => api.call('pinDoc', { id: d.id, undo: !!d.pinned })); toast(d.pinned ? 'Sematan dilepas' : 'Dokumen disematkan'); }
      if (a === 'verify') { await busy(b, () => api.call('verifyDoc', { id: d.id, undo: !!d.verified })); toast(d.verified ? 'Verifikasi dibatalkan' : 'Ditandai terverifikasi. Claude akan membacanya lebih dulu.'); }
      if (a === 'del') {
        if (!(await confirmBox('Hapus dokumen?', `“${d.title}” akan dihapus dari daftar${d.fileId ? ', dan filenya dipindah ke Sampah di Google Drive' : ''}.`, 'Hapus'))) { if (rerender) rerender(); return; }
        if (d.fileId && !String(d.fileId).startsWith('demo-')) { try { await api.call('docTrash', { id: d.id }); } catch (e) { toast('File di Drive tidak bisa dibuang: ' + cleanErr(e), true); } }
        await api.call('deleteDoc', { id: d.id });
        if (S.dk) S.dk.sel = '';
        toast('Dokumen dihapus'); close();
      }
      await loadDocs(true); refresh();
    } catch (e) { toast(cleanErr(e), true); }
  });
}

function docAskModal(d) {
  const st = { busy: false, answers: [] };
  const close = modal({ title: 'Tanya Claude tentang dokumen ini', wide: true,
    body: `<p class="muted small" style="margin:0 0 10px">${esc(d.title)}. Claude membaca dokumennya, lalu menjawab hanya dari isinya. Jawaban tidak disimpan.</p>
      <div id="dk-ans"></div>
      <label class="field"><span>Pertanyaan</span><textarea id="dk-askq" rows="3" maxlength="1500" placeholder="Contoh: Berapa batas lembur per hari, dan pasal berapa yang mengaturnya?"></textarea></label>`,
    actions: '<button class="btn" data-close>Tutup</button><button class="btn primary" id="dk-asks">Tanya</button>' });
  const draw = () => {
    const box = $('#dk-ans'); if (!box) return;
    box.innerHTML = st.answers.map((x) => `<div class="idea-msg me" style="margin-bottom:8px"><small>Anda</small>${esc(x.q)}</div><div class="idea-msg ai" style="margin-bottom:12px"><small>Claude</small><div class="ai-body">${ideaAiHtml(x.a)}</div>${(x.sources || []).length ? `<div class="idea-src"><span>Sumber yang dibuka Claude</span>${x.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || ideaLinkLabel(s.url))}</a>`).join('')}</div>` : ''}</div>`).join('');
  };
  $('#dk-asks').onclick = async () => {
    const ta = $('#dk-askq'), q = ta.value.trim(), btn = $('#dk-asks');
    if (q.length < 3) { toast('Tulis pertanyaan dulu.', true); return; }
    if (st.busy) return; st.busy = true; btn.disabled = true; btn.textContent = 'Claude membaca dokumen…';
    try { const r = await api.call('docAsk', { id: d.id, question: q }); st.answers.push({ q, a: r.answer, sources: r.sources }); ta.value = ''; draw(); }
    catch (e) { toast(cleanErr(e), true); }
    finally { st.busy = false; if ($('#dk-asks')) { btn.disabled = false; btn.textContent = 'Tanya'; } }
  };
  void close;
}

/** Form tambah/edit dokumen: tautan, unggah file (ke Google Drive tim), atau catatan. Claude bisa mengisi otomatis. */
function docEditor(d0) {
  const admin = S.user.role === 'admin', edit = !!d0;
  const v = Object.assign({ kind: 'link', title: '', url: '', fileId: '', fileName: '', mime: '', size: 0, category: '', industry: '', tags: [], summary: '', quote: '', visibility: 'all' }, d0 ? JSON.parse(JSON.stringify(d0)) : {});
  const st = { busy: '', note: '' };
  const close = modal({ title: edit ? 'Edit dokumen' : 'Tambah dokumen', wide: true, body: '<div id="dk-ed"></div>',
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="dk-save">Simpan</button>' });
  const typeCard = (k, ic, cls, label, sub) => `<button type="button" class="ad-t ${v.kind === k ? 'on' : ''}" data-dkkind="${k}" ${edit && v.kind !== k ? 'disabled' : ''}><span class="dk-ic ic-${cls}">${ic}</span><b>${label}</b><small>${sub}</small></button>`;
  const render = () => {
    const box = $('#dk-ed'); if (!box) return;
    box.innerHTML = `<form id="dk-form" autocomplete="off">
      <div class="ad-types">${typeCard('link', 'URL', 'lnk', 'Tautan', 'Halaman web, PDF online, Google Docs/Sheets/Drive')}${typeCard('file', 'FILE', 'pdf', 'Unggah file', `PDF, Excel, Word, gambar (maks. ${DOC_MAX_MB} MB). Disimpan di Google Drive tim`)}${typeCard('note', 'TXT', 'note', 'Catatan', 'Ringkasan, daftar istilah, angka penting')}</div>
      ${v.kind === 'link' ? `<label class="field"><span>Tautan *</span><input name="url" type="url" required maxlength="1000" placeholder="https://" value="${esc(v.url)}"></label>` : ''}
      ${v.kind === 'file' ? `<div class="field"><span>File *</span>${v.fileId ? `<div class="dk-file">${esc(v.fileName || 'File')} <span class="muted small">${v.size ? (v.size >= 1048576 ? (v.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(v.size / 1024)) + ' KB') + ' · ' : ''}tersimpan di Google Drive</span>${edit ? '' : ' <button type="button" class="linkbtn small" id="dk-refile">Ganti file</button>'}</div>`
        : `<label class="dk-drop" id="dk-drop"><input type="file" id="dk-file" accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.pptx,.png,.jpg,.jpeg,.webp,.txt" hidden><b>${st.busy === 'upload' ? 'Mengunggah…' : 'Pilih file'}</b><span class="muted small">atau tarik file ke sini</span></label>`}</div>` : ''}
      ${v.kind !== 'note' ? `<div class="ad-ai"><div><b>✦ Isi otomatis dengan Claude</b><span class="muted small"> Claude membaca ${v.kind === 'file' ? 'file PDF/gambar' : 'tautannya'}, lalu mengisi judul, kategori, dan poin penting. Periksa dulu sebelum menyimpan.</span></div>
        <button type="button" class="btn sm" id="dk-ai" ${st.busy ? 'disabled' : ''}>${st.busy === 'ai' ? 'Claude membaca…' : 'Isi otomatis'}</button></div>${st.note ? `<p class="muted small" style="margin:-4px 0 12px">${esc(st.note)}</p>` : ''}` : ''}
      <div class="ad-grid">
        <label class="field"><span>Judul *</span><input name="title" required maxlength="200" value="${esc(v.title)}"></label>
        <label class="field"><span>Kategori *</span><select name="category" required data-pick="plain"><option value="">Pilih kategori</option>${DOC_CATS.map(([c]) => `<option ${v.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Industri</span><select name="industry" data-pick="plain"><option value="">Semua industri</option>${INDUSTRIES.map((x) => `<option ${v.industry === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        ${admin ? `<label class="field"><span>Bisa dilihat</span><select name="visibility" data-pick="plain"><option value="all" ${v.visibility !== 'admin' ? 'selected' : ''}>Semua anggota</option><option value="admin" ${v.visibility === 'admin' ? 'selected' : ''}>Admin saja</option></select></label>` : '<div class="field"><span>Bisa dilihat</span><div class="dk-ro">Semua anggota</div></div>'}
      </div>
      <label class="field"><span>Tag <small class="muted">pisahkan dengan koma, maks. 8</small></span><input name="tags" maxlength="250" value="${esc((v.tags || []).join(', '))}" placeholder="Lembur, Jam kerja"></label>
      <label class="field"><span>${v.kind === 'note' ? 'Isi catatan *' : 'Ringkasan / poin penting'} <small class="muted">satu poin per baris, awali dengan "- "</small></span><textarea name="summary" rows="6" maxlength="4000" ${v.kind === 'note' ? 'required' : ''}>${esc(v.summary)}</textarea></label>
      <label class="field"><span>Kutipan siap pakai <small class="muted">kutip persis, sebut pasal/halaman</small></span><textarea name="quote" rows="2" maxlength="1000">${esc(v.quote)}</textarea></label>
      ${edit && !admin && d0.verified ? '<p class="muted small">Dokumen ini sudah diverifikasi admin. Kalau isinya diubah, perlu dicek admin lagi.</p>' : ''}
    </form>`;
    formPick(box);
    const form = $('#dk-form', box);
    const sync = () => { const fd = new FormData(form); ['url', 'title', 'category', 'industry', 'visibility', 'summary', 'quote'].forEach((k) => { if (fd.has(k)) v[k] = String(fd.get(k) || ''); }); if (fd.has('tags')) v.tags = String(fd.get('tags') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8); };
    form.oninput = sync; form.onchange = sync;
    $$('[data-dkkind]', box).forEach((b) => b.onclick = () => { if (edit) return; sync(); v.kind = b.dataset.dkkind; render(); });
    const rf = $('#dk-refile', box); if (rf) rf.onclick = () => { v.fileId = ''; v.fileName = ''; v.url = ''; render(); };
    const fi = $('#dk-file', box), drop = $('#dk-drop', box);
    const upload = async (file) => {
      if (!file) return;
      if (file.size > DOC_MAX_MB * 1048576) { toast(`Ukuran file maksimal ${DOC_MAX_MB} MB. Simpan di Google Drive, lalu tambahkan sebagai tautan.`, true); return; }
      sync(); st.busy = 'upload'; render();
      try {
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('File tidak bisa dibaca.')); r.readAsDataURL(file); });
        const r = await api.call('docUpload', { name: file.name, mime: file.type, size: file.size, data, visibility: v.visibility });
        Object.assign(v, { fileId: r.fileId, url: r.url, fileName: r.name, mime: r.mime || file.type, size: r.size || file.size });
        if (!v.title) v.title = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
        toast('File tersimpan di Google Drive tim');
      } catch (e) { toast(cleanErr(e), true); }
      st.busy = ''; render();
    };
    if (fi) fi.onchange = () => upload(fi.files[0]);
    if (drop) { drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); }; }
    const ai = $('#dk-ai', box);
    if (ai) ai.onclick = async () => {
      sync();
      if (v.kind === 'link' && !/^https?:\/\/\S+$/i.test(v.url)) { toast('Isi tautannya dulu (diawali https://).', true); return; }
      if (v.kind === 'file' && !v.fileId) { toast('Unggah filenya dulu.', true); return; }
      st.busy = 'ai'; st.note = ''; render();
      try {
        const r = await api.call('docAnalyze', v.kind === 'file' ? { fileId: v.fileId, name: v.fileName } : { url: v.url });
        const g = r.suggest || {};
        // hanya mengisi kolom yang masih kosong, kecuali judul & ringkasan yang memang diminta
        if (g.title) v.title = g.title;
        if (g.category && !v.category) v.category = g.category;
        if (g.industry && !v.industry) v.industry = g.industry;
        if ((g.tags || []).length && !(v.tags || []).length) v.tags = g.tags;
        if (g.summary) v.summary = g.summary + (g.effective ? '\n- Terbit/berlaku: ' + g.effective : '');
        if (g.quote && !v.quote) v.quote = g.quote;
        st.note = r.note || 'Sudah diisi Claude. Cocokkan dengan dokumen aslinya sebelum menyimpan.';
      } catch (e) { toast(cleanErr(e), true); }
      st.busy = ''; render();
    };
  };
  render();
  $('#dk-save').onclick = async () => {
    const form = $('#dk-form'); if (!form) return;
    form.dispatchEvent(new Event('change'));
    if (!form.reportValidity()) return;
    if (v.kind === 'file' && !v.fileId) { toast('Unggah filenya dulu.', true); return; }
    try {
      const r = await busy($('#dk-save'), () => api.call('saveDoc', { doc: Object.assign({}, v, { id: d0 ? d0.id : undefined }) }));
      toast(edit ? 'Dokumen diperbarui' : 'Dokumen ditambahkan');
      close();
      S.dk = S.dk || {}; S.dk.sel = (r && r.doc && r.doc.id) || S.dk.sel;
      await loadDocs(true); if (S.view === 'docs') go('docs'); else go('docs');
    } catch (e) { toast(cleanErr(e), true); }
  };
}

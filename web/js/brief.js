/* Brief Maker (versi ringkas): brief artikel yang terhubung ke task.
 * Memakai fungsi & state dari app.js (S, api, $, esc, modal, toast, go, …). */
'use strict';

const CONTENT_TYPES = ['Informasional', 'Consideration', 'Conversion'];
const EXTRAS = ['Infographic', 'Tabel perbandingan', 'Template unduhan', 'Video', 'Kalkulator', 'Checklist', 'Studi kasus'];
const MIN_COMPETITORS = 2;

// ---------- data & util ----------
const bKw = (b) => (b && ((b.data && b.data.kwMain) || b.keyword)) || '';
const bTitle = (b) => (b && ((b.data && b.data.h1) || b.title)) || '';
function allTasksForBrief() {
  if (S.all) return S.all.tasks;
  if (S.team) return S.team.tasks;
  return S.mine.tasks;
}
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
const blankH2 = () => ({ h2: '', points: '', sources: [''], h3: [] });

/** Struktur data brief (v2). Brief lama (versi lengkap) diubah otomatis saat dibuka. */
function normBrief(d) {
  d = d || {};
  if (d.v !== 2) {
    const sections = [];
    let intro = '';
    (d.outline || []).forEach((o) => {
      if (o.level === 1) intro = [o.heading !== 'Intro' ? o.heading : '', o.notes].filter(Boolean).join(' — ');
      else if (o.level === 3 && sections.length) sections[sections.length - 1].h3.push({ title: o.heading || '', points: o.notes || '' });
      else sections.push({ h2: o.heading || '', points: o.notes || '', sources: [''], h3: [] });
    });
    const typeMap = { Informasional: 'Informasional', Komersial: 'Consideration', Transaksional: 'Conversion' };
    d = {
      v: 2, kwMain: d.kwMain || '', kwSecondary: d.kwSecondary || [],
      competitors: (d.competitors || []).map((c) => ({ url: c.url || '', insight: [c.strengths, c.gaps].filter(Boolean).join(' · ') })),
      h1: d.h1 || '', contentType: typeMap[d.intent] || 'Informasional',
      wordEst: [d.wordMin, d.wordMax].filter((x) => x !== '' && x != null).join(' – '),
      metaTitle: d.metaTitle || '', metaDesc: d.metaDesc || '',
      intro, sections: sections.length ? sections : [blankH2()],
      ctaPage: '', ctaText: d.ctaEnd || '',
      internalLinks: (d.links || []).filter((l) => l.kind !== 'external').map((l) => ({ url: l.url || '', anchor: l.anchor || '' })),
      externalLinks: (d.links || []).filter((l) => l.kind === 'external').map((l) => ({ url: l.url || '', anchor: l.anchor || '' })),
      faq: (d.faq || []).map((q) => typeof q === 'string' ? { q, a: '' } : q),
      extras: [], extraNote: d.visual || ''
    };
  }
  const arr = (k, mk) => { if (!Array.isArray(d[k])) d[k] = []; if (mk && !d[k].length) d[k].push(mk()); };
  arr('kwSecondary'); arr('sections', blankH2); arr('internalLinks', () => ({ url: '', anchor: '' })); arr('externalLinks', () => ({ url: '', anchor: '' }));
  arr('faq', () => ({ q: '', a: '' })); arr('extras');
  arr('competitors');
  while (d.competitors.length < MIN_COMPETITORS) d.competitors.push({ url: '', insight: '' });
  d.sections.forEach((s) => { if (!Array.isArray(s.sources) || !s.sources.length) s.sources = ['']; if (!Array.isArray(s.h3)) s.h3 = []; });
  return d;
}
function newBriefData(task) {
  return normBrief({ v: 2, kwMain: guessKeyword(task), contentType: 'Informasional', sections: [blankH2(), blankH2(), blankH2()] });
}
function guessKeyword(task) {
  const s = String(task.task || '').trim();
  if (!isUrl(s)) return '';
  try { const seg = new URL(s).pathname.split('/').filter(Boolean).pop() || ''; return decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim(); }
  catch (e) { return ''; }
}
const filledCompetitors = (d) => (d.competitors || []).filter((c) => String(c.url || '').trim()).length;

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
  let list = (S.briefs || []).filter((b) => {
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
    <div class="bl-head"><span>Keyword & judul</span><span>Task</span><span>Jenis konten</span><span>Status</span></div>
    ${list.map((b) => {
      const t = briefTask(b), [st, cls] = briefStatus(b), d = normBrief(JSON.parse(JSON.stringify(b.data || {})));
      const end = t ? L.schedule(t).end : null;
      return `<button class="bl-row" data-brief="${esc(b.id)}">
        <span class="bl-kw"><b>${esc(bKw(b) || '(tanpa keyword)')}</b><small>${esc(bTitle(b) || 'H1 belum diisi')}</small></span>
        <span class="bl-task">${t ? `${t.code ? `<span class="code-tag">${esc(t.code)}</span> ` : ''}${esc(t.ownerName)}<small>${end ? 'deadline ' + esc(fmtD(end)) + ' · ' : ''}${d.sections.filter((s) => s.h2.trim()).length} H2${d.wordEst ? ' · ' + esc(d.wordEst) + ' kata' : ''}</small>` : '<small>Task sudah dihapus</small>'}</span>
        <span class="bl-type">${esc(d.contentType || '')}</span>
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
  const opt = (t) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(label(t))}</option>`;
  const owners = Object.keys(byOwner).sort();
  if (owners.length === 1) return byOwner[owners[0]].map(opt).join('');
  return owners.map((o) => `<optgroup label="${esc(o)}">${byOwner[o].map(opt).join('')}</optgroup>`).join('');
}

function newBriefModal(taskId, copyFrom) {
  const list = eligibleTasks();
  if (!list.length) return toast('Semua task Anda yang aktif sudah punya brief.', true);
  modal({
    title: copyFrom ? 'Duplikat brief ke task lain' : 'Brief baru',
    body: `<form id="nbf">
      <label class="field"><span>Task terkait *</span><select name="taskId" required><option value="">Pilih task…</option>${taskOptions(list, taskId)}</select></label>
      <p class="muted small" style="margin:0">${copyFrom ? `Struktur H2/H3, poin pembahasan, CTA, link, dan extra feature disalin dari brief "${esc(bKw(copyFrom))}". Keyword, H1, meta, kompetitor, FAQ, dan source dikosongkan.` : 'Keyword ditebak dari URL task bila ada.'}</p>
      <div id="nberr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="nbok">${copyFrom ? 'Duplikat' : 'Buat brief'}</button>`,
    onMount: (m, close) => {
      $('#nbok', m).onclick = async () => {
        const f = $('#nbf', m); if (!f.reportValidity()) return;
        const task = list.find((t) => t.id === f.taskId.value);
        let data = newBriefData(task);
        if (copyFrom) {
          const src = normBrief(JSON.parse(JSON.stringify(copyFrom.data || {})));
          data = normBrief(Object.assign(src, {
            kwMain: guessKeyword(task), kwSecondary: [], h1: '', metaTitle: '', metaDesc: '', competitors: [], faq: [],
            sections: src.sections.map((s) => Object.assign({}, s, { sources: [''] }))
          }));
        }
        try {
          const r = await busy($('#nbok', m), () => api.call('saveBrief', { brief: { taskId: task.id, type: data.contentType, status: 'Draft', data } }));
          close();
          putBrief(r.brief);
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
    const copy = JSON.parse(JSON.stringify(b));
    copy.data = normBrief(copy.data);
    S.bEdit = { id, b: copy, dirty: false, saving: false, savedAt: b.updatedAt ? new Date(b.updatedAt) : null, error: '' };
  }
  go('brief');
}

function viewBrief() {
  const E = S.bEdit;
  if (!E) return go('briefs');
  const b = E.b, d = b.data, task = briefTask(b), edit = canEditBrief(b);
  const ro = edit ? '' : 'disabled';
  $('#view-title').textContent = bKw(b) || 'Brief';
  $('#view-sub').textContent = (d.contentType || '') + (task ? ' · ' + task.ownerName : '');
  const [st, stc] = briefStatus(b);
  const ctaOpts = [...new Set((S.briefs || []).map((x) => x.data && x.data.ctaPage).filter(Boolean))];

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
    <div class="bed-main bed-one" id="bmain">
      ${secCard(1, 'Keyword', `
        ${fText('kwMain', 'Keyword utama', 'mis. reimbursement karyawan', ro)}
        ${fTags('kwSecondary', 'Keyword turunan', 'Ketik lalu tekan Enter', ro)}`)}
      ${secCard(2, 'Analisis kompetitor', `
        <p class="muted small" style="margin:0 0 8px">Minimal ${MIN_COMPETITORS} artikel kompetitor dari halaman 1 Google.</p>
        <div class="comp-h"><span></span><span>Link kompetitor</span><span>Insight yang didapat</span><span></span></div>
        ${d.competitors.map((c, i) => `<div class="comp-r"><span class="li-n">${i + 1}</span>
          <input type="url" data-arr="competitors" data-i="${i}" data-f="url" value="${esc(c.url)}" placeholder="https://…" aria-label="Link kompetitor ${i + 1}" ${ro}>
          <textarea data-arr="competitors" data-i="${i}" data-f="insight" rows="2" placeholder="Apa yang bagus, apa yang kurang, apa yang bisa kita lakukan lebih baik" aria-label="Insight kompetitor ${i + 1}" ${ro}>${esc(c.insight)}</textarea>
          ${ro || d.competitors.length <= MIN_COMPETITORS ? '<span></span>' : `<button type="button" class="ibtn" data-rm="competitors" data-i="${i}" aria-label="Hapus kompetitor">×</button>`}</div>`).join('')}
        ${ro ? '' : '<button type="button" class="btn sm" data-add="competitors">+ Kompetitor</button>'}
        <div class="muted small" id="bcomp" style="margin-top:6px">${compText(d)}</div>`)}
      ${secCard(3, 'H1, jenis konten & meta', `
        ${fText('h1', 'H1', 'Judul artikel', ro)}
        <div class="grid2">
          <div class="field"><span>Jenis konten</span><div class="seg seg-pick" role="radiogroup" aria-label="Jenis konten">${CONTENT_TYPES.map((x) => `<button type="button" role="radio" aria-checked="${d.contentType === x}" class="${d.contentType === x ? 'on' : ''}" data-ctype="${x}" ${ro}>${x}</button>`).join('')}</div></div>
          ${fText('wordEst', 'Estimasi jumlah kata', 'mis. 1.800 – 2.200', ro)}
        </div>
        ${fText('metaTitle', 'Meta title', '', ro, 60)}
        ${fArea('metaDesc', 'Meta description', '', ro, 155, 2)}
        <div class="serp-prev" id="bserp">${serpPreview(d, task)}</div>`)}
      ${secCard(4, 'Struktur artikel', `
        <div class="sx intro"><div class="sx-h"><span class="lvl">Intro</span><b>Introduction</b></div>
          ${fArea('intro', 'Poin pembahasan', 'mis. Masalah klaim biaya yang lambat & rawan hilang bukti; kenalkan istilah reimbursement', ro)}</div>
        ${d.sections.map((s, i) => h2Block(s, i, d.sections.length, ro)).join('')}
        ${ro ? '' : '<button type="button" class="btn sm add-h2" data-add="sections">+ H2</button>'}`)}
      ${secCard(5, 'CTA', `
        <div class="grid2">
          <label class="field"><span>Ke halaman produk</span><input type="text" data-k="ctaPage" list="cta-pages" value="${esc(d.ctaPage || '')}" placeholder="mis. /fitur/reimbursement" ${ro}><datalist id="cta-pages">${ctaOpts.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
          ${fText('ctaText', 'Teks / ajakan', 'mis. Coba demo gratis modul Reimbursement', ro)}
        </div>`)}
      ${secCard(6, 'Link', `
        ${linkList('internalLinks', 'Internal link', '/blog/… atau /fitur/…', ro)}
        ${linkList('externalLinks', 'External link', 'https://…', ro)}`)}
      ${secCard(7, 'FAQ', `
        ${d.faq.map((f, i) => `<div class="sx"><div class="sx-h"><span class="lvl">Q${i + 1}</span>
            <input type="text" data-arr="faq" data-i="${i}" data-f="q" value="${esc(f.q)}" placeholder="Pertanyaan" aria-label="Pertanyaan ${i + 1}" ${ro}>
            ${ro ? '' : `<button type="button" class="ibtn" data-rm="faq" data-i="${i}" aria-label="Hapus pertanyaan">×</button>`}</div>
          <label class="field"><span>Jawaban</span><textarea data-arr="faq" data-i="${i}" data-f="a" rows="2" placeholder="Jawaban singkat 40–60 kata" ${ro}>${esc(f.a)}</textarea></label></div>`).join('')}
        ${ro ? '' : '<button type="button" class="btn sm" data-add="faq">+ Pertanyaan</button>'}`)}
      ${secCard(8, 'Extra feature', `
        <div class="chips-pick">${EXTRAS.concat((d.extras || []).filter((x) => !EXTRAS.includes(x))).map((x) => `<label class="cpick ${(d.extras || []).includes(x) ? 'on' : ''}"><input type="checkbox" data-extra="${esc(x)}" ${(d.extras || []).includes(x) ? 'checked' : ''} ${ro}>${esc(x)}</label>`).join('')}
          ${ro ? '' : '<input type="text" class="extra-in" data-extrain="1" placeholder="+ lainnya (Enter)" aria-label="Extra feature lain">'}</div>
        ${fText('extraNote', 'Catatan', 'mis. Infografik alur pengajuan 5 langkah', ro)}`)}
    </div>`;
  bindBriefEditor(edit);
}

function h2Block(s, i, n, ro) {
  const rm = ro ? '' : `<span class="sx-tools"><button type="button" class="ibtn" data-mv="${i}" data-dir="-1" aria-label="Naikkan H2" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="ibtn" data-mv="${i}" data-dir="1" aria-label="Turunkan H2" ${i === n - 1 ? 'disabled' : ''}>↓</button><button type="button" class="ibtn" data-rm="sections" data-i="${i}" aria-label="Hapus H2">×</button></span>`;
  return `<div class="sx">
    <div class="sx-h"><span class="lvl">H2</span><input type="text" data-sec="${i}" data-f="h2" value="${esc(s.h2)}" placeholder="Judul H2" aria-label="Judul H2 ${i + 1}" ${ro}>${rm}</div>
    <label class="field"><span>Poin pembahasan</span><textarea data-sec="${i}" data-f="points" rows="2" placeholder="mis. Definisi singkat 40–50 kata, beda dengan tunjangan, contoh kasus" ${ro}>${esc(s.points)}</textarea></label>
    ${s.h3.map((h, j) => `<div class="sx-h3">
      <div class="sx-h"><span class="lvl">H3</span><input type="text" data-sec="${i}" data-h3="${j}" data-f="title" value="${esc(h.title)}" placeholder="Judul H3" aria-label="Judul H3" ${ro}>${ro ? '' : `<button type="button" class="ibtn" data-rmh3="${i}" data-j="${j}" aria-label="Hapus H3">×</button>`}</div>
      <label class="field"><span>Poin pembahasan</span><input type="text" data-sec="${i}" data-h3="${j}" data-f="points" value="${esc(h.points)}" placeholder="Poin yang dibahas di H3 ini" ${ro}></label></div>`).join('')}
    ${ro ? '' : `<button type="button" class="btn sm ghost add-h3" data-addh3="${i}">+ H3</button>`}
    <div class="sx-src"><span class="sx-src-h">Source / sumber</span>
      ${s.sources.map((x, k) => `<div class="li-row"><input type="text" data-sec="${i}" data-src="${k}" value="${esc(x)}" placeholder="Link atau nama sumber (mis. UU No. 36/2008, laporan BPS 2025)" aria-label="Source" ${ro}>${ro || s.sources.length <= 1 ? '' : `<button type="button" class="ibtn" data-rmsrc="${i}" data-k="${k}" aria-label="Hapus source">×</button>`}</div>`).join('')}
      ${ro ? '' : `<button type="button" class="btn sm ghost" data-addsrc="${i}">+ Source</button>`}</div>
  </div>`;
}
function linkList(arr, label, ph, ro) {
  const list = S.bEdit.b.data[arr];
  return `<div class="field"><span>${esc(label)}</span>
    ${list.map((l, i) => `<div class="link-r"><input type="text" data-arr="${arr}" data-i="${i}" data-f="url" value="${esc(l.url)}" placeholder="${esc(ph)}" aria-label="${esc(label)} URL" ${ro}><input type="text" data-arr="${arr}" data-i="${i}" data-f="anchor" value="${esc(l.anchor)}" placeholder="anchor text" aria-label="Anchor text" ${ro}>${ro ? '<span></span>' : `<button type="button" class="ibtn" data-rm="${arr}" data-i="${i}" aria-label="Hapus link">×</button>`}</div>`).join('')}
    ${ro ? '' : `<button type="button" class="btn sm" data-add="${arr}">+ ${esc(label)}</button>`}</div>`;
}
function compText(d) {
  const n = filledCompetitors(d);
  return n >= MIN_COMPETITORS ? `<span class="ok">✓ ${n} kompetitor</span>` : `<span class="warn">${n}/${MIN_COMPETITORS} kompetitor terisi — wajib minimal ${MIN_COMPETITORS} sebelum ditandai siap ditulis</span>`;
}
function saveText() {
  const E = S.bEdit;
  if (!E) return '';
  if (E.saving) return 'Menyimpan…';
  if (E.dirty) return 'Belum tersimpan';
  return E.savedAt ? 'Tersimpan ' + pad(E.savedAt.getHours()) + ':' + pad(E.savedAt.getMinutes()) : '';
}
function secCard(n, title, inner) {
  return `<section class="card bsec"><div class="card-h"><h2><span class="bnum">${n}</span>${esc(title)}</h2></div><div class="card-b">${inner}</div></section>`;
}
function fText(k, label, ph, ro, max) {
  const v = S.bEdit.b.data[k] == null ? '' : S.bEdit.b.data[k];
  return `<label class="field"><span>${esc(label)}${max ? ` <em class="cnt" data-cnt="${k}" data-max="${max}">${String(v).length}/${max}</em>` : ''}</span><input type="text" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph || '')}" ${ro}></label>`;
}
function fArea(k, label, ph, ro, max, rows) {
  const v = S.bEdit.b.data[k] == null ? '' : S.bEdit.b.data[k];
  return `<label class="field"><span>${esc(label)}${max ? ` <em class="cnt" data-cnt="${k}" data-max="${max}">${String(v).length}/${max}</em>` : ''}</span><textarea data-k="${k}" rows="${rows || 2}" placeholder="${esc(ph || '')}" ${ro}>${esc(v)}</textarea></label>`;
}
function fTags(k, label, ph, ro) {
  const list = S.bEdit.b.data[k] || [];
  return `<div class="field"><span>${esc(label)}</span><div class="tags" data-tags="${k}">${list.map((t, i) => `<span class="tag">${esc(t)}${ro ? '' : `<button type="button" data-untag="${i}" aria-label="Hapus ${esc(t)}">×</button>`}</span>`).join('')}${ro ? '' : `<input type="text" data-tagin="${k}" placeholder="${esc(ph)}">`}</div></div>`;
}
function serpPreview(d, task) {
  let path = '';
  if (task && isUrl(task.task)) { try { path = new URL(task.task.trim()).pathname; } catch (e) { path = ''; } }
  const parts = path.split('/').filter(Boolean);
  return `<div class="muted small">Pratinjau Google</div>
    <div class="sp-url">www.linovhr.com${parts.length ? ' › ' + parts.map(esc).join(' › ') : ''}</div>
    <div class="sp-title">${esc(d.metaTitle || d.h1 || 'Meta title belum diisi')}</div>
    <div class="sp-desc">${esc(d.metaDesc || 'Meta description belum diisi.')}</div>`;
}

// ---------- interaksi editor ----------
function markDirty() {
  const E = S.bEdit;
  E.dirty = true;
  if ($('#bsave')) $('#bsave').textContent = saveText();
  clearTimeout(E.timer);
  E.timer = setTimeout(briefSave, 2500);
}
function refreshLive() {
  const d = S.bEdit.b.data;
  if ($('#bserp')) $('#bserp').innerHTML = serpPreview(d, briefTask(S.bEdit.b));
  if ($('#bcomp')) $('#bcomp').innerHTML = compText(d);
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
  if ($('#breload')) $('#breload').onclick = async () => { E.dirty = false; E.error = ''; await loadData(true); S.bEdit = null; openBrief(E.id); };
  if (!edit) return;

  root.addEventListener('input', (e) => {
    const el = e.target, ds = el.dataset;
    if (ds.k) d[ds.k] = el.value;
    else if (ds.sec !== undefined && ds.h3 !== undefined) d.sections[+ds.sec].h3[+ds.h3][ds.f] = el.value;
    else if (ds.sec !== undefined && ds.src !== undefined) d.sections[+ds.sec].sources[+ds.src] = el.value;
    else if (ds.sec !== undefined && ds.f) d.sections[+ds.sec][ds.f] = el.value;
    else if (ds.arr) { if (ds.f) d[ds.arr][+ds.i][ds.f] = el.value; else d[ds.arr][+ds.i] = el.value; }
    else return;
    markDirty(); refreshLive();
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.extra) {
      const set = new Set(d.extras || []); el.checked ? set.add(el.dataset.extra) : set.delete(el.dataset.extra);
      d.extras = [...set]; el.closest('.cpick').classList.toggle('on', el.checked);
      markDirty();
    }
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    if (el.dataset.tagin && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = el.value.trim().replace(/,$/, '');
      if (!v) return;
      const list = d[el.dataset.tagin];
      v.split(/\s*,\s*/).filter(Boolean).forEach((x) => { if (!list.some((y) => y.toLowerCase() === x.toLowerCase())) list.push(x); });
      markDirty(); rerenderBrief(`[data-tagin="${el.dataset.tagin}"]`);
    } else if (el.dataset.tagin && e.key === 'Backspace' && !el.value && d[el.dataset.tagin].length) {
      d[el.dataset.tagin].pop(); markDirty(); rerenderBrief(`[data-tagin="${el.dataset.tagin}"]`);
    } else if (el.dataset.extrain && e.key === 'Enter') {
      e.preventDefault();
      const v = el.value.trim(); if (!v) return;
      if (!d.extras.includes(v)) d.extras.push(v);
      markDirty(); rerenderBrief('[data-extrain]');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); briefSave(); }
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const ds = b.dataset;
    if (ds.untag !== undefined) { d[b.closest('[data-tags]').dataset.tags].splice(+ds.untag, 1); markDirty(); rerenderBrief(); }
    else if (ds.ctype) { d.contentType = ds.ctype; markDirty(); rerenderBrief(`[data-ctype="${ds.ctype}"]`); }
    else if (ds.add) {
      const blank = { competitors: () => ({ url: '', insight: '' }), internalLinks: () => ({ url: '', anchor: '' }), externalLinks: () => ({ url: '', anchor: '' }), faq: () => ({ q: '', a: '' }), sections: blankH2 }[ds.add];
      d[ds.add].push(blank());
      const i = d[ds.add].length - 1;
      markDirty(); rerenderBrief(ds.add === 'sections' ? `[data-sec="${i}"][data-f="h2"]` : `[data-arr="${ds.add}"][data-i="${i}"]`);
    } else if (ds.rm) {
      d[ds.rm].splice(+ds.i, 1);
      if (ds.rm === 'sections' && !d.sections.length) d.sections.push(blankH2());
      markDirty(); rerenderBrief();
    } else if (ds.addh3 !== undefined) {
      const s = d.sections[+ds.addh3]; s.h3.push({ title: '', points: '' });
      markDirty(); rerenderBrief(`[data-sec="${ds.addh3}"][data-h3="${s.h3.length - 1}"][data-f="title"]`);
    } else if (ds.rmh3 !== undefined) { d.sections[+ds.rmh3].h3.splice(+ds.j, 1); markDirty(); rerenderBrief(); }
    else if (ds.addsrc !== undefined) {
      const s = d.sections[+ds.addsrc]; s.sources.push('');
      markDirty(); rerenderBrief(`[data-sec="${ds.addsrc}"][data-src="${s.sources.length - 1}"]`);
    } else if (ds.rmsrc !== undefined) { d.sections[+ds.rmsrc].sources.splice(+ds.k, 1); markDirty(); rerenderBrief(); }
    else if (ds.mv !== undefined) {
      const i = +ds.mv, j = i + (+ds.dir), o = d.sections;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]]; markDirty(); rerenderBrief(`[data-mv="${j}"][data-dir="${ds.dir}"]`);
    }
  });
  if ($('#bstat')) $('#bstat').onclick = () => {
    const to = $('#bstat').dataset.to;
    if (to === 'Siap ditulis') {
      const miss = [];
      if (!String(d.kwMain || '').trim()) miss.push('keyword utama');
      if (!String(d.h1 || '').trim()) miss.push('H1');
      if (filledCompetitors(d) < MIN_COMPETITORS) miss.push(`minimal ${MIN_COMPETITORS} link kompetitor`);
      if (!d.sections.some((s) => s.h2.trim())) miss.push('minimal 1 H2');
      if (miss.length) return toast('Lengkapi dulu: ' + miss.join(', ') + '.', true);
    }
    E.b.status = to; E.dirty = true;
    briefSave().then(() => { if (S.view === 'brief') rerenderBrief(); });
  };
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

async function briefSave() {
  const E = S.bEdit;
  if (!E || !E.dirty || E.saving) return;
  clearTimeout(E.timer);
  E.saving = true; E.dirty = false;
  const el = $('#bsave'); if (el && S.view === 'brief') el.textContent = saveText();
  const snap = JSON.parse(JSON.stringify(E.b));
  try {
    const r = await api.call('saveBrief', { brief: { id: snap.id, taskId: snap.taskId, type: snap.data.contentType, status: snap.status, data: snap.data, baseUpdatedAt: snap.updatedAt } });
    E.b.updatedAt = r.brief.updatedAt; E.b.updatedBy = r.brief.updatedBy; E.b.docUrl = r.brief.docUrl || E.b.docUrl;
    E.savedAt = new Date(); E.error = '';
    putBrief(Object.assign({}, r.brief, { data: E.dirty ? snap.data : r.brief.data }));
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
/** Chip Brief di baris task (atau tombol + Brief bila belum ada). */
function briefChips(t, readonly) {
  const b = briefOf(t.id);
  if (!b) {
    const can = !readonly && t.id && !L.isDone(t) && (S.user.role === 'admin' || t.owner === S.user.username);
    return can ? `<button type="button" class="res-add" data-newbrief="${esc(t.id)}">${fsvg('<path d="M12 5v14M5 12h14"/>')}Brief</button>` : '';
  }
  return `<button type="button" class="res-chip brief-chip" data-openbrief="${esc(b.id)}" title="Buka brief: ${esc(bKw(b))}"><span class="res-ico">${ICONS.briefs}</span><span class="res-lbl">Brief${bKw(b) ? ' · ' + esc(bKw(b)) : ''}</span></button>`;
}
function bindBriefChips(root) {
  if (!root) return;
  $$('[data-openbrief]', root).forEach((b) => b.onclick = () => openBrief(b.dataset.openbrief));
  $$('[data-newbrief]', root).forEach((b) => b.onclick = () => newBriefModal(b.dataset.newbrief));
}

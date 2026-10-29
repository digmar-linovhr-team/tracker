/* Alur task Artikel (8 tahap). Memakai fungsi & state dari app.js / brief.js saat dipanggil. */
'use strict';

const ART_STEPS = { 1: 'start', 2: 'submitBrief', 4: 'submitArticle', 6: 'publish', 7: 'submitAiCheck' };
const ART_REVIEW_NEXT = { 3: 4, 5: 6, 8: 9 }, ART_REVIEW_BACK = { 3: 2, 5: 4, 8: 7 };
const ART_REVIEW_LABEL = { 3: 'Review brief', 5: 'Review artikel', 8: 'Review cek AI' };
const isArt = (t) => L.isArticle(t);
/** Tahap efektif: status "Review" tapi tahap belum naik (diubah langsung di spreadsheet) → anggap tahap review berikutnya. */
const artStage = (t) => { const s = L.stageOf(t); return !ART_REVIEW_NEXT[s] && t.status === 'Review' && ART_REVIEW_NEXT[s + 1] ? s + 1 : s; };

/** Label tahap + bar 8 langkah. */
function artStageHtml(t) {
  const st = artStage(t), done = st >= 9;
  return `<span class="stg ${L.REVIEW_STAGES.includes(st) ? 'rv' : ''} ${done ? 'dn' : ''}" title="Alur artikel: ${L.STAGES.slice(1, 9).map((x, i) => (i + 1) + ' ' + x).join(' → ')}">
    <span class="stg-bar">${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${i < st ? 'd' : i === st ? 'c' : ''}"></i>`).join('')}</span>
    ${done ? 'Selesai' : `Tahap ${st}/8 · ${esc(L.STAGES[st])}`}</span>`;
}
function artStageChip(t) {
  const st = artStage(t);
  return `<span class="chip ${st >= 9 ? 'good' : L.REVIEW_STAGES.includes(st) ? 'accent' : 'info'}" title="${esc(L.STAGES[st])}">${st >= 9 ? 'Done' : `Tahap ${st} · ${esc(L.STAGES[st])}`}</span>`;
}

/** Tombol langkah berikutnya untuk pemilik task. */
function artActions(t, readonly) {
  const st = artStage(t), id = esc(t.id);
  const mine = t.owner === S.user.username || S.user.role === 'admin';
  if (readonly || !mine || !t.id) return `<span class="pill ${ST_CLASS[t.status] || 'st-backlog'}">${esc(st >= 9 ? 'Done' : L.STAGES[st])}</span>`;
  const wait = (txt) => `<span class="art-wait">${HOURGLASS_SVG}${txt}</span>`;
  switch (st) {
    case 1: return `<button class="btn sm primary" data-art="start" data-id="${id}">Mulai: susun brief</button>`;
    case 2: return briefOf(t.id)
      ? `<button class="btn sm primary" data-art="submitBrief" data-id="${id}">Ajukan brief</button>`
      : `<button class="btn sm primary" data-newbrief="${id}">+ Buat brief</button>`;
    case 3: return wait('Menunggu review brief');
    case 4: return `<button class="btn sm primary" data-art="submitArticle" data-id="${id}">Ajukan review artikel</button>`;
    case 5: return wait('Menunggu review artikel');
    case 6: return `<button class="btn sm primary" data-art="publish" data-id="${id}">Sudah publish</button>`;
    case 7: return `<button class="btn sm primary" data-art="submitAiCheck" data-id="${id}">Ajukan hasil cek AI</button>`;
    case 8: return wait('Menunggu review cek AI');
    default: return '<span class="pill st-done">Done</span>';
  }
}
function artLinks(t) {
  return (t.liveUrl ? resChip({ label: 'Artikel live', url: t.liveUrl }) : '') + (t.aiCheckUrl ? resChip({ label: 'Hasil cek AI', url: t.aiCheckUrl }) : '');
}

function bindArtActions(root) {
  $$('[data-art]', root).forEach((b) => b.onclick = () => artStep(b.dataset.id, b.dataset.art));
}

/** Tombol langkah: validasi ringan di sini, lalu kirim ke server. */
function artStep(id, step) {
  const t = findTask(id); if (!t) return;
  if (step === 'submitBrief') {
    const b = briefOf(id);
    if (!b) return newBriefModal(id);
    if (S.bEdit && S.bEdit.id === b.id && S.bEdit.dirty) briefFlush();
    const d = briefSum(S.bEdit && S.bEdit.id === b.id ? S.bEdit.b : b), miss = [];
    if (!String(d.kwMain || '').trim()) miss.push('keyword utama');
    if (!String(d.h1 || '').trim()) miss.push('H1');
    if (d.nComp < MIN_COMPETITORS) miss.push(`minimal ${MIN_COMPETITORS} link kompetitor`);
    if (!d.nH2) miss.push('minimal 1 H2');
    if (miss.length) { toast('Lengkapi brief dulu: ' + miss.join(', ') + '.', true); return openBrief(b.id); }
    return confirmBox('Ajukan brief?', `Brief "${bKw(b)}" dikirim ke admin untuk direview. Selama direview, brief tidak bisa diubah.`, 'Ajukan brief')
      .then((ok) => ok && advanceStage(id, step));
  }
  if (step === 'submitArticle') {
    if (!resultsOf(t).length) return resultsModal(t, { then: () => advanceStage(id, 'submitArticle'), saveLabel: 'Simpan & ajukan review artikel', hint: 'Tempel link Google Docs artikel Anda.' });
    return confirmBox('Ajukan review artikel?', 'Link artikel di "Hasil kerja" akan diperiksa admin.', 'Ajukan review').then((ok) => ok && advanceStage(id, step));
  }
  if (step === 'publish') return urlModal(t, step, 'Sudah publish', 'URL artikel yang sudah tayang', 'https://www.linovhr.com/blog/…', 'Setelah disimpan, lanjut ke tahap Cek ulang dengan AI.');
  if (step === 'submitAiCheck') return urlModal(t, step, 'Ajukan hasil cek AI', 'Link Docs hasil cek AI', 'https://docs.google.com/document/d/…', 'Admin akan mereview hasil cek ini sebelum task ditandai Done.');
  return advanceStage(id, step);
}

function urlModal(t, step, title, label, ph, hint) {
  modal({
    title,
    body: `<p class="muted small" style="margin:0 0 10px">${esc(t.task.replace(/^https?:\/\/(www\.)?/, ''))}</p>
      <label class="field"><span>${esc(label)}</span><input type="url" id="art-url" placeholder="${esc(ph)}" value="${esc(step === 'publish' ? (t.liveUrl || (isUrl(t.task) ? t.task.trim() : '')) : (t.aiCheckUrl || ''))}"></label>
      <p class="muted small" style="margin:0">${esc(hint)}</p><div id="art-err"></div>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="art-ok">${esc(title)}</button>`,
    onMount: (m, close) => {
      const go2 = () => {
        const u = $('#art-url', m).value.trim();
        if (!isHttp(u)) { $('#art-err', m).innerHTML = '<div class="error" style="margin-top:10px">Isi link yang diawali http:// atau https://</div>'; return; }
        close(); advanceStage(t.id, step, u);
      };
      $('#art-ok', m).onclick = go2;
      $('#art-url', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
    }
  });
}

/** Pindah tahap: tampilan langsung berubah, dibatalkan bila server menolak. */
async function advanceStage(id, step, url) {
  const t = findTask(id); if (!t) return;
  const next = { start: 2, submitBrief: 3, submitArticle: 5, publish: 7, submitAiCheck: 8 }[step];
  const before = { stage: t.stage, status: t.status, reviewAt: t.reviewAt, startedAt: t.startedAt, liveUrl: t.liveUrl, aiCheckUrl: t.aiCheckUrl, stageLog: t.stageLog };
  const nowIso = new Date().toISOString();
  const patch = { stage: next, status: L.STAGE_STATUS[next], stageLog: (L.stageLog(t).map((x) => ({ s: x.s, t: x.t.toISOString() }))).concat({ s: next, t: nowIso }) };
  if (L.STAGE_STATUS[next] === 'Review') patch.reviewAt = nowIso;
  if (!t.startedAt) patch.startedAt = nowIso;
  if (step === 'publish') patch.liveUrl = url;
  if (step === 'submitAiCheck') patch.aiCheckUrl = url;
  patchTask(id, patch);
  const b = briefOf(id);
  const bBefore = b ? b.status : null;
  if (b && step === 'submitBrief') { b.status = 'Diajukan'; if (S.bEdit && S.bEdit.id === b.id) S.bEdit.b.status = 'Diajukan'; }
  syncProjects([t.code]);
  S.pending.add(id); softRender();
  toast({ start: 'Silakan susun brief.', submitBrief: 'Brief diajukan ke admin.', submitArticle: 'Artikel diajukan ke admin untuk direview.', publish: 'Tercatat sudah publish. Lanjut cek ulang dengan AI.', submitAiCheck: 'Hasil cek AI diajukan ke admin.' }[step]);
  try {
    const r = await api.call('advanceStage', { taskId: id, step, url: url || '' });
    if (r && r.task) patchTask(id, { stage: r.task.stage, status: r.task.status, reviewAt: r.task.reviewAt, startedAt: r.task.startedAt, doneAt: r.task.doneAt, liveUrl: r.task.liveUrl, aiCheckUrl: r.task.aiCheckUrl, stageLog: r.task.stageLog });
    S.pending.delete(id); saveCache(); softRender();
    if (step === 'start' && !briefOf(id)) newBriefModal(id);
  } catch (e) {
    S.pending.delete(id); patchTask(id, before);
    if (b) { b.status = bBefore; if (S.bEdit && S.bEdit.id === b.id) S.bEdit.b.status = bBefore; }
    syncProjects([t.code]); softRender();
    toast('Gagal: ' + cleanErr(e), true);
  }
}

// ---------- Review admin ----------
function artReviewBlock(t) {
  const st = artStage(t);
  if (st === 3) {
    const b = briefOf(t.id), d = b ? briefSum(b) : null;
    return `<div class="rv-hasil"><div class="rv-res-h">Brief yang diajukan</div>
      ${d ? `<div class="rv-brief"><b>${esc(d.h1 || '(H1 belum diisi)')}</b><span>Keyword: ${esc(d.kwMain || '–')}${d.nSecondary ? ' · ' + d.nSecondary + ' turunan' : ''} · ${esc(d.contentType || '')}${d.wordEst ? ' · ±' + esc(d.wordEst) + ' kata' : ''}</span>
        <span>${d.nH2} H2 · ${d.nComp} kompetitor · ${d.nFaq} FAQ</span></div>` : '<span class="muted small">Brief tidak ditemukan</span>'}
      <div class="rv-res">${briefChips(t, true)}</div></div>`;
  }
  if (st === 5) {
    return `<div class="rv-hasil"><div class="rv-res-h">Artikel yang diajukan</div>
      ${t.resultNote ? `<div class="rv-rnote">${esc(t.resultNote)}</div>` : ''}
      <div class="rv-res">${resultsOf(t).map((x) => resChip(x)).join('') || '<span class="muted small">Tidak ada link</span>'}${briefChips(t, true)}</div></div>`;
  }
  return `<div class="rv-hasil"><div class="rv-res-h">Hasil cek ulang dengan AI</div>
    <div class="rv-res">${artLinks(t) || '<span class="muted small">Tidak ada link</span>'}${resultsOf(t).map((x) => resChip(x)).join('')}${briefChips(t, true)}</div></div>`;
}
function artApproveLabel(t) { return { 3: 'Setujui brief', 5: 'Setujui artikel', 8: 'Setujui & selesai' }[artStage(t)] || 'Setujui'; }

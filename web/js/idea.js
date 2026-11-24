/* global L, S, api, $, $$, esc, toast, cleanErr, confirmBox, patchTask, saveCache, softRender, artStage, briefOf, outKindOf, aiEnabled, cmWhen, openTask */
'use strict';
// ---------- Tahap Ide (Artikel TL industri & Studi kasus) ----------
// Writer menulis usulan ide → Claude mereview (cocok dengan industri? alasan nyambung? pembeda?) → diskusi singkat → Finalkan ide.
// Brief baru bisa dibuat setelah ide final (atau dilewati admin). Semua data di task.idea, ditulis lewat server.
// Bentuk task.idea: { form, reviews: [...], chat: [...], final, finalAt, finalBy, skipped, skippedBy }

const IDEA_MAX_REVIEW = 5, IDEA_MAX_REPLY = 10;
/** Pengaturan per jenis output: field form [kunci, label, petunjuk, baris], label kesimpulan & status poin, field wajib sebelum review. */
const IDEA_KINDS = {
  tl: { out: 'Artikel TL industri', name: 'Ide artikel TL', need: ['problem', 'angle'],
    fields: [
      ['problem', 'Masalah industri yang diangkat', 'Masalah nyata yang dialami perusahaan di industri ini — bukan masalah HR umum.', 3],
      ['reason', 'Alasan — kenapa penting sekarang & siapa yang merasakannya', 'mis. regulasi baru, tren, audit, biaya yang membengkak.', 2],
      ['angle', 'Sudut pandang / argumen utama', 'Pendapat atau kerangka berpikir yang ingin dibuktikan artikel ini.', 3],
      ['reader', 'Pembaca utama', 'Jabatan, mis. HR Manager pabrik, HSE Manager site.', 1],
      ['title', 'Judul kerja', '', 1],
      ['data', 'Data / regulasi pendukung', 'Boleh kosong — Claude akan menyarankan sumber yang perlu dicek.', 2]],
    verdict: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], ganti: ['Ganti sudut', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], lemah: ['Lemah', 'bad'] },
    qTitle: 'Pertanyaan pendalaman',
    hint: 'Claude akan menilai apakah masalahnya benar-benar khas industri ini, apakah alasannya nyambung, dan memberi alternatif sudut.' },
  case: { out: 'Studi kasus', name: 'Ide studi kasus', need: ['before', 'solution'],
    fields: [
      ['client', 'Klien', 'Nama asli, atau samaran bila belum ada izin.', 1],
      ['scale', 'Industri & skala', 'mis. Manufaktur komponen otomotif · 1.200 karyawan, 3 shift.', 1],
      ['before', 'Kondisi sebelum — masalah yang dialami klien', 'Proses lama, angka, dan dampaknya bagi HR/perusahaan.', 3],
      ['solution', 'Solusi — modul LinovHR & cara penerapannya', 'Modul yang dipakai, integrasi, lama implementasi.', 3],
      ['result', 'Hasil — angka sebelum & sesudah', 'Sertakan angka terukur bila ada; Claude akan menyarankan data yang perlu diminta.', 2],
      ['permit', 'Sumber data & izin publikasi', 'mis. wawancara HR Manager; izin nama perusahaan sudah/belum ada.', 1],
      ['title', 'Judul kerja', '', 1]],
    verdict: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dilengkapi', 'warn'], ganti: ['Belum layak', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dilengkapi', 'warn'], lemah: ['Belum aman', 'bad'] },
    qTitle: 'Pertanyaan untuk wawancara klien',
    hint: 'Claude akan menilai kekuatan cerita, bukti hasil, relevansi industri, peran LinovHR, dan kesiapan publikasi — plus pertanyaan untuk wawancara klien.' },
  opt: { out: 'Optimasi artikel', name: 'Rencana optimasi', need: ['problem', 'plan'],
    fields: [
      ['url', 'URL artikel yang dioptimasi', 'Claude akan membaca versi live artikel ini.', 1],
      ['keyword', 'Keyword target & kondisi sekarang', 'mis. aplikasi absensi — posisi 8, 12.500 impresi/bln, CTR 1,2%, belum dikutip AI Overview.', 1],
      ['problem', 'Diagnosis — kenapa artikel belum perform?', 'mis. maksud pencarian tidak cocok, konten tipis, kalah lengkap dari kompetitor, CTR rendah.', 3],
      ['competitor', 'Kompetitor di atas kita & kelebihannya', 'Boleh kosong.', 2],
      ['plan', 'Rencana perubahan', 'Bagian yang ditambah, ditulis ulang, digabung, atau dihapus.', 3],
      ['title', 'H1 / judul baru', 'Kosongkan bila tidak berubah.', 1]],
    verdict: { kuat: ['Siap dikerjakan', 'good'], pertajam: ['Perlu dipertajam', 'warn'], ganti: ['Diagnosis keliru', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], lemah: ['Lemah', 'bad'] },
    qTitle: 'Data yang perlu dicek dulu',
    hint: 'Claude membaca artikel live-nya, lalu menilai ketepatan diagnosis, kecocokan maksud pencarian, dampak rencana perubahan, celah kompetitor, dan peluang AI Overview.' }
};
const IDEA = { draft: {}, busy: {}, reply: {} };

/** Jenis tahap ide untuk task ini: 'tl' | 'case' | ''. */
function ideaKind(t) {
  if (!t || typeof aiEnabled !== 'function' || !aiEnabled() || !L.isArticle(t)) return '';
  const k = outKindOf(t);
  return k === 'Artikel TL industri' ? 'tl' : k === 'Studi kasus' ? 'case' : k === 'Optimasi artikel' ? 'opt' : '';
}
/** Task ini wajib melewati tahap Ide? */
function ideaApplies(t) { return !!ideaKind(t); }
/** Ide sudah final / dilewati — brief boleh dibuat. */
function ideaReady(t) { return !ideaApplies(t) || !!(t.idea && (t.idea.final || t.idea.skipped)); }
const ideaCan = (t) => S.user.role === 'admin' || L.isOn(t, S.user.username);
function ideaForm(t) {
  if (!IDEA.draft[t.id]) {
    IDEA.draft[t.id] = Object.assign({}, (t.idea && t.idea.form) || {});
    if (ideaKind(t) === 'opt' && !IDEA.draft[t.id].url) IDEA.draft[t.id].url = t.liveUrl || (/^https?:\/\//.test(String(t.task || '').trim()) ? String(t.task).trim() : '');
  }
  return IDEA.draft[t.id];
}

function ideaSection(t) {
  if (!ideaApplies(t) || !t.id) return '';
  const K = IDEA_KINDS[ideaKind(t)], IDEA_FIELDS = K.fields, IDEA_VERDICT = K.verdict, IDEA_PT = K.pt;
  const idea = t.idea || {}, can = ideaCan(t), admin = S.user.role === 'admin', id = esc(t.id);
  const locked = !!(idea.final || idea.skipped) || artStage(t) >= 3 || !can;
  const f = locked ? (idea.form || {}) : ideaForm(t), busy = IDEA.busy[t.id];
  const reviews = idea.reviews || [], rv = reviews[reviews.length - 1], chat = idea.chat || [];
  const nRev = reviews.length, nRep = chat.filter((c) => c.role === 'user').length;
  const head = idea.final ? `<span class="chip good">Ide final${idea.finalBy ? ' · ' + esc(idea.finalBy) : ''}</span>`
    : idea.skipped ? `<span class="chip">Dilewati admin</span>` : `<span class="chip warn">Belum final</span>`;
  const form = locked
    ? `<div class="idea-ro">${IDEA_FIELDS.filter(([k]) => f[k]).map(([k, l]) => `<div><span>${esc(l)}</span><p>${esc(f[k])}</p></div>`).join('') || '<p class="muted small">Ide belum diisi.</p>'}</div>`
    : `<div class="idea-form">${IDEA_FIELDS.map(([k, l, h, rows]) => `<label class="field"><span>${esc(l)}</span>
        ${rows > 1 ? `<textarea data-idea="${k}" rows="${rows}" maxlength="1200">${esc(f[k] || '')}</textarea>` : `<input data-idea="${k}" maxlength="200" value="${esc(f[k] || '')}">`}
        ${h ? `<small class="muted">${esc(h)}</small>` : ''}</label>`).join('')}
        <div class="idea-act"><button class="btn" data-ideasave="${id}" ${busy ? 'disabled' : ''}>Simpan draf</button>
        <button class="btn primary" data-idearev="${id}" ${busy || nRev >= IDEA_MAX_REVIEW ? 'disabled' : ''}>${busy === 'review' ? 'Claude sedang membaca…' : nRev ? 'Review ulang ide' : 'Diskusikan dengan AI'}</button></div></div>`;
  const pts = rv ? (rv.points || []).map((p) => { const s = IDEA_PT[p.status] || IDEA_PT.pertajam;
    return `<div class="idea-pt ${s[1]}"><b>${esc(p.label)} <span class="chip ${s[1]}">${esc(s[0])}</span></b><p>${esc(p.note)}</p></div>`; }).join('') : '';
  const alts = rv ? (rv.alts || []).map((a, i) => `<div class="idea-alt"><div><b>${esc(a.title)}</b><p>${esc(a.desc)}</p></div>${locked ? '' : `<button class="btn sm" data-ideaalt="${i}">Pakai sudut ini</button>`}</div>`).join('') : '';
  const review = rv ? `<div class="idea-rv">
      <div class="idea-verdict ${(IDEA_VERDICT[rv.verdict] || IDEA_VERDICT.pertajam)[1]}"><b>${esc((IDEA_VERDICT[rv.verdict] || IDEA_VERDICT.pertajam)[0])}</b><span>${esc(rv.summary || '')}</span></div>
      <div class="idea-sh">Catatan per poin <span class="muted">· review ke-${nRev} dari ${IDEA_MAX_REVIEW} · ${esc(cmWhen(rv.at))}</span></div>${pts}
      ${alts ? `<div class="idea-sh">Alternatif sudut</div>${alts}` : ''}
      ${(rv.questions || []).length ? `<div class="idea-sh">${esc(K.qTitle)}</div><ul class="idea-q">${rv.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
      ${(rv.prompts || []).length ? `<div class="idea-sh">Prompt AI Overview yang bisa dijawab</div><ul class="idea-q">${rv.prompts.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    </div>` : (locked ? '' : `<p class="muted small idea-hint">Isi usulan ide lalu klik <b>Diskusikan dengan AI</b>. ${esc(K.hint)}</p>`);
  const thread = chat.length ? `<div class="idea-chat">${chat.map((c) => `<div class="idea-msg ${c.role === 'ai' ? 'ai' : 'me'}"><small>${esc(c.role === 'ai' ? 'Claude' : (c.by || ''))}</small>${esc(c.text)}</div>`).join('')}</div>` : '';
  const replyBox = rv && !locked ? `<div class="idea-reply"><textarea data-ideareply rows="2" maxlength="800" placeholder="Balas atau tanyakan sesuatu ke Claude…">${esc(IDEA.reply[t.id] || '')}</textarea>
      <button class="btn" data-ideasend="${id}" ${busy || nRep >= IDEA_MAX_REPLY ? 'disabled' : ''}>${busy === 'reply' ? 'Menunggu…' : 'Kirim'}</button></div>
      <div class="idea-quota muted small">Sisa kuota: ${IDEA_MAX_REVIEW - nRev} review · ${IDEA_MAX_REPLY - nRep} balasan</div>` : '';
  const finalBtns = locked ? (admin && (idea.final || idea.skipped) && !briefOf(t.id) ? `<div class="idea-act"><button class="btn ghost" data-ideaundo="${id}">Buka lagi ide</button></div>` : '')
    : `<div class="idea-act">${admin && !idea.final ? `<button class="btn ghost" data-ideaskip="${id}">Lewati tahap ide</button>` : ''}<button class="btn ok" data-ideafinal="${id}" ${!rv || busy ? 'disabled' : ''} title="${rv ? '' : 'Diskusikan dengan AI dulu'}">Finalkan ide → mulai brief</button></div>`;
  return `<section class="dp-sec" id="idea-sec"><h3>${esc(K.name)} ${head}</h3>
    ${ideaKind(t) === 'opt' ? '' : t.industry ? `<p class="muted small" style="margin:0 0 8px">Industri: <b>${esc(t.industry)}</b></p>` : '<p class="error small" style="margin:0 0 8px">Industri belum dipilih di task — minta admin mengisinya (Edit task) agar review Claude tepat.</p>'}
    ${form}${review}${thread}${replyBox}${finalBtns}</section>`;
}

function ideaBind(root, t) {
  if (!root || !t || !ideaApplies(t)) return;
  const K = IDEA_KINDS[ideaKind(t)], IDEA_VERDICT = K.verdict;
  const rerender = () => { if (typeof dpRefresh === 'function') dpRefresh(); };
  $$('[data-idea]', root).forEach((el) => el.oninput = () => { ideaForm(t)[el.dataset.idea] = el.value; });
  const rep = $('[data-ideareply]', root); if (rep) rep.oninput = () => { IDEA.reply[t.id] = rep.value; };
  const run = async (kind, action, extra, okMsg) => {
    if (IDEA.busy[t.id]) return;
    IDEA.busy[t.id] = kind; rerender();
    try {
      const r = await api.call(action, Object.assign({ taskId: t.id }, extra || {}));
      if (r && r.idea) { patchTask(t.id, { idea: r.idea }); IDEA.draft[t.id] = Object.assign({}, r.idea.form || {}); }
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r;
    } catch (e) { toast(cleanErr(e), true); return null; }
    finally { delete IDEA.busy[t.id]; saveCache(); rerender(); }
  };
  const form = () => Object.assign({}, ideaForm(t));
  $$('[data-ideasave]', root).forEach((b) => b.onclick = () => run('save', 'ideaSave', { form: form() }, 'Draf ide disimpan'));
  $$('[data-idearev]', root).forEach((b) => b.onclick = () => {
    const f = form();
    const miss = K.need.filter((k) => String(f[k] || '').trim().length < 20).map((k) => (K.fields.find((x) => x[0] === k) || [k, k])[1].split(' — ')[0].toLowerCase());
    if (miss.length) { toast('Isi dulu ' + miss.join(' dan ') + ' (minimal 20 karakter).', true); return; }
    run('review', 'ideaReview', { form: f }, (r) => r && r.idea ? `Review Claude: ${(IDEA_VERDICT[r.idea.reviews[r.idea.reviews.length - 1].verdict] || ['–'])[0]}` : '');
  });
  $$('[data-ideasend]', root).forEach((b) => b.onclick = async () => {
    const text = String(IDEA.reply[t.id] || '').trim();
    if (text.length < 3) { toast('Tulis pesan dulu.', true); return; }
    const r = await run('reply', 'ideaReply', { text, form: form() });
    if (r) { IDEA.reply[t.id] = ''; rerender(); }
  });
  $$('[data-ideaalt]', root).forEach((b) => b.onclick = () => {
    const rv = ((t.idea || {}).reviews || []).slice(-1)[0], a = rv && rv.alts[Number(b.dataset.ideaalt)]; if (!a) return;
    const f = ideaForm(t); f.angle = a.title + ' — ' + a.desc;
    toast('Sudut pandang diganti. Sesuaikan isinya, lalu Simpan draf atau Review ulang ide.'); rerender();
  });
  $$('[data-ideafinal]', root).forEach((b) => b.onclick = async () => {
    const rv = ((t.idea || {}).reviews || []).slice(-1)[0];
    if (rv && rv.verdict !== 'kuat' && !(await confirmBox('Finalkan ide?', `Review terakhir Claude: "${(IDEA_VERDICT[rv.verdict] || ['–'])[0]}". Ide tetap bisa difinalkan bila Anda yakin — admin akan melihat catatannya saat mereview brief.`))) return;
    const r = await run('final', 'ideaFinal', { form: form() }, 'Ide final. Silakan susun brief — judul & sudut pandang sudah terisi.');
    if (r && typeof newBriefModal === 'function' && !briefOf(t.id) && artStage(t) <= 2) newBriefModal(t.id);
  });
  $$('[data-ideaskip]', root).forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Lewati tahap ide?', 'Writer bisa langsung menyusun brief tanpa review ide dari Claude.'))) return;
    run('final', 'ideaSkip', {}, 'Tahap ide dilewati');
  });
  $$('[data-ideaundo]', root).forEach((b) => b.onclick = () => run('final', 'ideaFinal', { undo: true }, 'Ide dibuka lagi'));
}

/** Isi awal brief dari ide yang sudah final. */
function ideaBriefSeed(t, d) {
  const f = (t && t.idea && t.idea.form) || {};
  if (!Object.keys(f).some((k) => f[k])) return d;
  if (f.title && !d.h1) d.h1 = f.title;
  const intro = (f.plan ? [f.problem && 'Diagnosis: ' + f.problem, 'Rencana perubahan: ' + f.plan, f.keyword && 'Keyword & kondisi: ' + f.keyword] : f.before || f.solution
    ? [f.client && 'Klien: ' + f.client + (f.scale ? ' (' + f.scale + ')' : ''), f.before && 'Sebelum: ' + f.before, f.solution && 'Solusi: ' + f.solution, f.result && 'Hasil: ' + f.result]
    : [f.angle && 'Sudut pandang: ' + f.angle, f.problem && 'Masalah: ' + f.problem, f.reader && 'Pembaca: ' + f.reader]).filter(Boolean).join('\n');
  if (intro && !d.intro) d.intro = intro;
  const extra = f.data ? 'Data/regulasi dari tahap ide: ' + f.data : f.permit ? 'Sumber data & izin: ' + f.permit : f.competitor ? 'Celah kompetitor: ' + f.competitor : '';
  if (extra && d.sections && d.sections[0] && !d.sections[0].points) d.sections[0].points = extra;
  return d;
}

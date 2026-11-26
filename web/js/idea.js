/* global bankAvailable, loadBank, bankPut, bankOpen, bankTitleOf, dpRefresh, newBriefModal, L, S, api, $, $$, esc, toast, cleanErr, confirmBox, patchTask, saveCache, softRender, artStage, briefOf, outKindOf, aiEnabled, cmWhen, openTask */
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
      ['problem', 'Masalah di industri ini', 'Masalah yang memang dialami perusahaan di industri ini, bukan masalah HR secara umum.', 3],
      ['reason', 'Kenapa penting sekarang', 'Siapa yang kena dan apa pemicunya. Contoh: aturan baru, audit, biaya naik.', 2],
      ['angle', 'Sudut pandang', 'Pendapat utama yang mau dibuktikan di artikel.', 3],
      ['reader', 'Pembaca', 'Jabatannya. Contoh: HR Manager pabrik, HSE Manager di site.', 1],
      ['title', 'Judul kerja', '', 1],
      ['data', 'Data atau aturan pendukung', 'Boleh dikosongkan. Nanti Claude kasih saran sumber yang perlu dicek.', 2]],
    verdict: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], ganti: ['Ganti sudut', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], lemah: ['Lemah', 'bad'] },
    qTitle: 'Pertanyaan pendalaman',
    hint: 'Claude akan cek apakah masalahnya memang khas industri ini dan alasannya masuk akal, lalu kasih pilihan sudut lain.' },
  case: { out: 'Studi kasus', name: 'Ide studi kasus', need: ['before', 'solution'],
    fields: [
      ['client', 'Klien', 'Nama asli, atau nama samaran kalau belum ada izin.', 1],
      ['scale', 'Industri dan ukuran perusahaan', 'Contoh: manufaktur komponen otomotif, 1.200 karyawan, 3 shift.', 1],
      ['before', 'Kondisi sebelum pakai LinovHR', 'Cara kerja lama, angkanya, dan dampaknya ke HR atau perusahaan.', 3],
      ['solution', 'Yang dipakai dari LinovHR', 'Modul, integrasi, dan berapa lama implementasinya.', 3],
      ['result', 'Hasilnya', 'Angka sebelum dan sesudah. Kalau belum ada, Claude kasih saran data yang perlu diminta.', 2],
      ['permit', 'Sumber data dan izin', 'Contoh: wawancara HR Manager, izin pakai nama perusahaan sudah ada atau belum.', 1],
      ['title', 'Judul kerja', '', 1]],
    verdict: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dilengkapi', 'warn'], ganti: ['Belum layak', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dilengkapi', 'warn'], lemah: ['Belum aman', 'bad'] },
    qTitle: 'Pertanyaan untuk wawancara klien',
    hint: 'Claude akan cek apakah ceritanya kuat, hasilnya ada buktinya, dan aman dipublikasikan, lalu kasih daftar pertanyaan untuk wawancara klien.' },
  opt: { out: 'Optimasi artikel', name: 'Rencana optimasi', need: ['problem', 'plan'],
    fields: [
      ['url', 'URL artikel', 'Claude akan membaca artikel yang sudah tayang ini.', 1],
      ['keyword', 'Keyword dan posisi sekarang', 'Contoh: aplikasi absensi, posisi 8, 12.500 impresi per bulan, CTR 1,2%, belum muncul di AI Overview.', 1],
      ['problem', 'Kenapa artikelnya belum naik', 'Contoh: tidak sesuai yang dicari orang, isinya tipis, kalah lengkap dari kompetitor, CTR rendah.', 3],
      ['competitor', 'Kompetitor di atas kita', 'Apa yang mereka punya dan kita belum. Boleh dikosongkan.', 2],
      ['plan', 'Yang mau diubah', 'Bagian yang ditambah, ditulis ulang, digabung, atau dihapus.', 3],
      ['title', 'Judul baru', 'Kosongkan kalau judulnya tetap.', 1]],
    verdict: { kuat: ['Siap dikerjakan', 'good'], pertajam: ['Perlu dipertajam', 'warn'], ganti: ['Diagnosis keliru', 'bad'] },
    pt: { kuat: ['Kuat', 'good'], pertajam: ['Perlu dipertajam', 'warn'], lemah: ['Lemah', 'bad'] },
    qTitle: 'Data yang perlu dicek dulu',
    hint: 'Claude akan membaca artikelnya, lalu cek apakah analisis dan rencana perubahannya sudah tepat.' }
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
/** Draf form (belum disimpan) per kunci — task id atau id Bank Ide. */
function ideaDraft(key, saved, seed) {
  if (!IDEA.draft[key]) { IDEA.draft[key] = Object.assign({}, saved || {}); if (seed) seed(IDEA.draft[key]); }
  return IDEA.draft[key];
}
function ideaForm(t) { return ideaDraft(t.id, t.idea && t.idea.form, (f) => { if (ideaKind(t) === 'opt' && !f.url) f.url = t.liveUrl || (/^https?:\/\//.test(String(t.task || '').trim()) ? String(t.task).trim() : ''); }); }

/** Sumber tahap ide untuk sebuah task (lihat ideaCoreHtml untuk bentuk src). */
function ideaTaskSrc(t) {
  const idea = t.idea || {}, can = ideaCan(t), admin = S.user.role === 'admin', id = esc(t.id);
  const locked = !!(idea.final || idea.skipped) || artStage(t) >= 3 || !can;
  return { key: t.id, kind: ideaKind(t), idea, locked, ids: { taskId: t.id }, form: () => (locked ? (idea.form || {}) : ideaForm(t)),
    apply: (r) => patchTask(t.id, { idea: r.idea }), rerender: () => { if (typeof dpRefresh === 'function') dpRefresh(); },
    pre: locked ? '' : ideaBankPick(t),
    adminAsk: admin && t.owner !== S.user.username, summaryTop: admin && t.owner !== S.user.username && locked,
    head: idea.final ? `<span class="chip good">Ide final${idea.finalBy ? ' · ' + esc(idea.finalBy) : ''}</span>` : idea.skipped ? `<span class="chip">Dilewati admin</span>` : `<span class="chip warn">Belum final</span>`,
    industry: ideaKind(t) === 'opt' ? '' : t.industry ? `<p class="muted small" style="margin:0 0 8px">Industri: <b>${esc(t.industry)}</b></p>` : '<p class="error small" style="margin:0 0 8px">Industri task ini belum diisi. Minta admin mengisinya lewat Edit task supaya Claude bisa menilai dengan tepat.</p>',
    footer: (rv, busy) => locked ? (admin && (idea.final || idea.skipped) && !briefOf(t.id) ? `<div class="idea-act"><button class="btn ghost" data-ideaundo="${id}">Buka lagi ide</button></div>` : '')
      : `<div class="idea-act">${admin && !idea.final ? `<button class="btn ghost" data-ideaskip="${id}">Lewati tahap ide</button>` : ''}<button class="btn ok" data-ideafinal="${id}" ${!rv || busy ? 'disabled' : ''} title="${rv ? '' : 'Cek ke Claude dulu'}">Finalkan ide dan mulai brief</button></div>` };
}

/** Ide yang sudah disetujui di Bank Ide dan cocok untuk task ini (jenis sama, milik PIC task). */
function ideaBankMatches(t) {
  if (typeof bankAvailable !== 'function' || !bankAvailable()) return [];
  if (!S.bank) { if (typeof loadBank === 'function') loadBank().then((ch) => { if (S.bank && S.bank.length && typeof dpRefresh === 'function') dpRefresh(); }); return []; }
  const kind = ideaKind(t), admin = S.user.role === 'admin', who = admin ? [t.owner].concat(t.members || []) : [S.user.username];
  return S.bank.filter((d) => d.status === 'Disetujui' && d.kind === kind && who.includes(d.author))
    .sort((a, b) => String(b.decision && b.decision.at || b.updatedAt).localeCompare(String(a.decision && a.decision.at || a.updatedAt)));
}
function ideaBankPick(t) {
  const list = ideaBankMatches(t); if (!list.length) return '';
  return `<div class="idea-bank"><div class="idea-bank-h"><b>Ambil dari Bank Ide</b><span class="muted small">${list.length} ide ${S.user.role === 'admin' ? 'milik penanggung jawab task ini' : 'Anda'} sudah disetujui admin. Kalau dipakai, tahap ide langsung selesai.</span></div>
    ${list.slice(0, 5).map((d) => `<div class="idea-bank-it"><div><b>${esc(bankTitleOf(d) || '(belum ada judul)')}</b><span class="muted small">${d.industry ? (t.industry && d.industry !== t.industry ? `<span class="chip warn" title="Industri task ini: ${esc(t.industry)}">${esc(d.industry)}, beda dengan task</span> ` : esc(d.industry) + ' · ') : ''}disetujui ${esc(cmWhen(d.decision && d.decision.at || d.updatedAt))}</span></div>
      <button type="button" class="btn sm" data-bankopen="${esc(d.id)}">Lihat</button><button type="button" class="btn sm primary" data-ideabank="${esc(d.id)}">Pakai ide ini</button></div>`).join('')}
    <p class="muted small" style="margin:6px 0 0">Atau isi ide baru di bawah.</p></div>`;
}

/** HTML inti tahap ide. src: { key, kind, idea, locked, form(), head, industry, footer(rv, busy), wrapId? } */
function ideaCoreHtml(src) {
  const K = IDEA_KINDS[src.kind], IDEA_FIELDS = K.fields, IDEA_VERDICT = K.verdict, IDEA_PT = K.pt;
  const idea = src.idea || {}, locked = src.locked, id = esc(src.key);
  const f = src.form(), busy = IDEA.busy[src.key];
  const reviews = idea.reviews || [], rv = reviews[reviews.length - 1], chat = idea.chat || [];
  const nRev = reviews.length, nRep = chat.filter((c) => c.role === 'user' && !c.admin).length, nAsk = chat.filter((c) => c.admin).length;
  const form = locked
    ? `<div class="idea-ro">${IDEA_FIELDS.filter(([k]) => f[k]).map(([k, l]) => `<div><span>${esc(l)}</span><p>${esc(f[k])}</p></div>`).join('') || '<p class="muted small">Ide belum diisi.</p>'}</div>`
    : `<div class="idea-form">${IDEA_FIELDS.map(([k, l, h, rows]) => `<label class="field"><span>${esc(l)}</span>
        ${rows > 1 ? `<textarea data-idea="${k}" rows="${rows}" maxlength="1200">${esc(f[k] || '')}</textarea>` : `<input data-idea="${k}" maxlength="200" value="${esc(f[k] || '')}">`}
        ${h ? `<small class="muted">${esc(h)}</small>` : ''}</label>`).join('')}
        <div class="idea-act"><button class="btn" data-ideasave="${id}" ${busy ? 'disabled' : ''}>Simpan draf</button>
        <button class="btn primary" data-idearev="${id}" ${busy || nRev >= IDEA_MAX_REVIEW ? 'disabled' : ''}>${busy === 'review' ? 'Claude sedang membaca…' : nRev ? 'Cek lagi ke Claude' : 'Cek ke Claude'}</button></div></div>`;
  const pts = rv ? (rv.points || []).map((p) => { const st = IDEA_PT[p.status] || IDEA_PT.pertajam;
    return `<div class="idea-pt ${st[1]}"><b>${esc(p.label)} <span class="chip ${st[1]}">${esc(st[0])}</span></b><p>${esc(p.note)}</p></div>`; }).join('') : '';
  const alts = rv ? (rv.alts || []).map((a, i) => `<div class="idea-alt"><div><b>${esc(a.title)}</b><p>${esc(a.desc)}</p></div>${locked ? '' : `<button class="btn sm" data-ideaalt="${i}">Pakai sudut ini</button>`}</div>`).join('') : '';
  const review = rv ? `<div class="idea-rv">
      <div class="idea-verdict ${(IDEA_VERDICT[rv.verdict] || IDEA_VERDICT.pertajam)[1]}"><b>${esc((IDEA_VERDICT[rv.verdict] || IDEA_VERDICT.pertajam)[0])}</b><span>${esc(rv.summary || '')}</span></div>
      <div class="idea-sh">Catatan Claude <span class="muted">· cek ke-${nRev} dari ${IDEA_MAX_REVIEW} · ${esc(cmWhen(rv.at))}</span></div>${pts}
      ${alts ? `<div class="idea-sh">Pilihan sudut lain</div>${alts}` : ''}
      ${(rv.questions || []).length ? `<div class="idea-sh">${esc(K.qTitle)}</div><ul class="idea-q">${rv.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
      ${(rv.prompts || []).length ? `<div class="idea-sh">Pertanyaan di AI Overview yang bisa dijawab artikel ini</div><ul class="idea-q">${rv.prompts.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    </div>` : (locked ? '' : `<p class="muted small idea-hint">Isi idenya, lalu klik <b>Cek ke Claude</b>. ${esc(K.hint)}</p>`);
  const who = (c) => c.role === 'ai' ? (c.toAdmin ? 'Claude, menjawab admin' : 'Claude') : c.admin ? `${c.byName || c.by || 'Admin'} (admin)` : (c.byName || (typeof personName === 'function' && c.by ? personName(c.by) : c.by) || 'Writer');
  const thread = chat.length ? `<div class="idea-sh" id="${id}-chat">Diskusi dengan Claude</div><div class="idea-chat">${chat.map((c) => `<div class="idea-msg ${c.role === 'ai' ? 'ai' : c.admin ? 'adm' : 'me'}"><small>${esc(who(c))}${c.web && (c.web.fetched || c.web.searched) ? ` · ${[c.web.fetched ? `membuka ${c.web.fetched} sumber` : '', c.web.searched ? `mencari ${c.web.searched}×` : ''].filter(Boolean).join(', ')}` : ''}</small>${esc(c.text)}${(c.sources || []).length ? `<div class="idea-src"><span>Sumber yang dibuka Claude</span>${c.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))}</a>`).join('')}</div>` : ''}</div>`).join('')}</div>` : '';
  // admin: menanggapi / menyanggah penilaian Claude dengan data pembanding (isi ide tidak berubah)
  const askBox = rv && src.adminAsk ? `<div class="idea-ask" id="${id}-ask"><div class="idea-sh">Tanggapi penilaian Claude</div>
      <p class="muted small" style="margin:0 0 6px">Sanggah, beri data pembanding, atau tanya alasannya. Tempel tautan sumber (mis. JDIH, BPS) supaya Claude membukanya; Claude juga bisa mencari sendiri di web. Isi ide writer tidak berubah, dan writer bisa membaca diskusi ini. Jawaban bisa makan waktu sampai 1 menit.</p>
      <div class="idea-reply"><textarea data-ideaask rows="3" maxlength="1500" placeholder="Contoh: Saya tidak setuju datanya lemah. Survei Apindo 2026 menyebut 6 dari 10 pabrik masih menghitung lembur manual. Apakah itu cukup?">${esc(IDEA.reply['ask:' + src.key] || '')}</textarea>
      <button class="btn primary" data-ideaasksend="${id}" ${busy || nAsk >= 20 ? 'disabled' : ''}>${busy === 'ask' ? 'Claude membuka sumber & menimbang…' : 'Kirim'}</button></div>
      <div class="idea-quota muted small">Sisa ${20 - nAsk} pesan</div></div>` : '';
  // ringkasan Claude di atas (untuk admin yang menilai ide)
  const top = rv && src.summaryTop ? (() => { const V = IDEA_VERDICT[rv.verdict] || IDEA_VERDICT.pertajam, pp = rv.points || [];
    const weak = pp.filter((p) => p.status !== 'kuat');
    return `<div class="idea-top ${V[1]}"><div class="idea-top-h"><b>Penilaian Claude: ${esc(V[0])}</b><span class="muted small">cek ke-${nRev} · ${esc(cmWhen(rv.at))}${chat.length ? ` · ${chat.filter((c) => c.role !== 'ai').length} pesan diskusi` : ''}</span></div>
      <p>${esc(rv.summary || '')}</p>
      ${weak.length ? `<ul>${weak.slice(0, 3).map((p) => `<li><b>${esc(p.label)}:</b> ${esc(p.note)}</li>`).join('')}</ul>` : ''}
      <div class="idea-top-a">${chat.length ? `<button type="button" class="linkbtn small" data-ideajump="${id}-chat">Lihat diskusi</button>` : ''}${src.adminAsk ? `<button type="button" class="btn sm" data-ideajump="${id}-ask">Tanggapi Claude</button>` : ''}</div></div>`; })() : '';
  const replyBox = rv && !locked ? `<div class="idea-reply"><textarea data-ideareply rows="2" maxlength="800" placeholder="Balas atau tanya ke Claude">${esc(IDEA.reply[src.key] || '')}</textarea>
      <button class="btn" data-ideasend="${id}" ${busy || nRep >= IDEA_MAX_REPLY ? 'disabled' : ''}>${busy === 'reply' ? 'Menunggu…' : 'Kirim'}</button></div>
      <div class="idea-quota muted small">Sisa ${IDEA_MAX_REVIEW - nRev} kali cek dan ${IDEA_MAX_REPLY - nRep} kali balas</div>` : '';
  return `<section class="dp-sec" id="${src.wrapId || 'idea-sec'}"><h3>${esc(src.title || K.name)} ${src.head || ''}</h3>
    ${top}${src.pre || ''}${src.industry || ''}${form}${review}${thread}${replyBox}${askBox}${src.footer(rv, busy)}</section>`;
}

/** Tombol inti tahap ide: simpan draf, review, balas, pakai sudut. */
function ideaCoreBind(root, src) {
  const K = IDEA_KINDS[src.kind], IDEA_VERDICT = K.verdict, key = src.key;
  $$('[data-idea]', root).forEach((el) => el.oninput = () => { src.form()[el.dataset.idea] = el.value; });
  const rep = $('[data-ideareply]', root); if (rep) rep.oninput = () => { IDEA.reply[key] = rep.value; };
  const ask = $('[data-ideaask]', root); if (ask) ask.oninput = () => { IDEA.reply['ask:' + key] = ask.value; };
  $$('[data-ideajump]', root).forEach((b) => b.onclick = () => { const el = document.getElementById(b.dataset.ideajump); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const ta = el.querySelector('textarea'); if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 350); } });
  const run = async (kind, action, extra, okMsg) => {
    if (IDEA.busy[key]) return;
    IDEA.busy[key] = kind; src.rerender();
    try {
      const r = await api.call(action, Object.assign({}, src.ids, extra || {}));
      if (r && r.item && r.idea && typeof bankPut === 'function') bankPut(r);
      if (r && r.idea) { src.apply(r); IDEA.draft[key] = Object.assign({}, r.idea.form || {}); }
      else if (r && r.item && src.apply) src.apply(r);
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r;
    } catch (e) { toast(cleanErr(e), true); return null; }
    finally { delete IDEA.busy[key]; saveCache(); src.rerender(); }
  };
  const form = () => Object.assign({}, src.form());
  $$('[data-ideasave]', root).forEach((b) => b.onclick = () => run('save', 'ideaSave', { form: form() }, 'Draf ide disimpan'));
  $$('[data-idearev]', root).forEach((b) => b.onclick = () => {
    const f = form();
    const miss = K.need.filter((k) => String(f[k] || '').trim().length < 20).map((k) => (K.fields.find((x) => x[0] === k) || [k, k])[1].split(' — ')[0].toLowerCase());
    if (miss.length) { toast('Kolom ' + miss.join(' dan ') + ' masih terlalu pendek (minimal 20 karakter).', true); return; }
    run('review', 'ideaReview', { form: f }, (r) => r && r.idea ? `Hasil cek Claude: ${(IDEA_VERDICT[r.idea.reviews[r.idea.reviews.length - 1].verdict] || ['–'])[0]}` : '');
  });
  $$('[data-ideasend]', root).forEach((b) => b.onclick = async () => {
    const text = String(IDEA.reply[key] || '').trim();
    if (text.length < 3) { toast('Tulis pesan dulu.', true); return; }
    const r = await run('reply', 'ideaReply', { text, form: form() });
    if (r) { IDEA.reply[key] = ''; src.rerender(); }
  });
  $$('[data-ideaasksend]', root).forEach((b) => b.onclick = async () => {
    const text = String(IDEA.reply['ask:' + key] || '').trim();
    if (text.length < 3) { toast('Tulis pesan dulu.', true); return; }
    const r = await run('ask', 'ideaAsk', { text });
    if (r) { IDEA.reply['ask:' + key] = ''; src.rerender(); setTimeout(() => { const el = document.getElementById(key + '-chat'); const last = el && el.nextElementSibling && el.nextElementSibling.lastElementChild; if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); }
  });
  $$('[data-ideaalt]', root).forEach((b) => b.onclick = () => {
    const rv = ((src.idea || {}).reviews || []).slice(-1)[0], a = rv && rv.alts[Number(b.dataset.ideaalt)]; if (!a) return;
    src.form().angle = a.title + ': ' + a.desc;
    toast('Sudut pandang sudah diganti. Rapikan isinya, lalu simpan atau cek lagi.'); src.rerender();
  });
  return { run, form };
}

function ideaSection(t) {
  if (!ideaApplies(t) || !t.id) return '';
  return ideaCoreHtml(ideaTaskSrc(t));
}

function ideaBind(root, t) {
  if (!root || !t || !ideaApplies(t)) return;
  const src = ideaTaskSrc(t), K = IDEA_KINDS[src.kind], IDEA_VERDICT = K.verdict;
  const { run, form } = ideaCoreBind(root, src);
  $$('[data-ideafinal]', root).forEach((b) => b.onclick = async () => {
    const rv = ((t.idea || {}).reviews || []).slice(-1)[0];
    if (rv && rv.verdict !== 'kuat' && !(await confirmBox('Finalkan ide?', `Penilaian terakhir Claude: “${(IDEA_VERDICT[rv.verdict] || ['–'])[0]}”. Ide tetap bisa difinalkan, dan admin akan melihat catatannya saat mengecek brief.`, 'Finalkan'))) return;
    const r = await run('final', 'ideaFinal', { form: form() }, 'Ide sudah final. Judul dan sudut pandangnya sudah masuk ke brief.');
    if (r && typeof newBriefModal === 'function' && !briefOf(t.id) && artStage(t) <= 2) newBriefModal(t.id);
  });
  $$('[data-ideaskip]', root).forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Lewati tahap ide?', 'Writer bisa langsung bikin brief tanpa cek ke Claude.', 'Lewati'))) return;
    run('final', 'ideaSkip', {}, 'Tahap ide dilewati');
  });
  $$('[data-ideaundo]', root).forEach((b) => b.onclick = () => run('final', 'ideaFinal', { undo: true }, 'Ide dibuka lagi'));
  $$('[data-bankopen]', root).forEach((b) => b.onclick = () => bankOpen(b.dataset.bankopen));
  $$('[data-ideabank]', root).forEach((b) => b.onclick = async () => {
    const d = (S.bank || []).find((x) => x.id === b.dataset.ideabank); if (!d) return;
    if (!(await confirmBox('Pakai ide ini?', `“${bankTitleOf(d) || 'Ide tanpa judul'}” akan jadi ide final task ini, lengkap dengan catatan Claude-nya. Setelah itu Anda bisa langsung bikin brief.`, 'Pakai ide ini'))) return;
    if (IDEA.busy[t.id]) return;
    IDEA.busy[t.id] = 'final'; src.rerender();
    try {
      const r = await api.call('bankUse', { ideaId: d.id, taskId: t.id });
      bankPut(r);
      const i = d.idea || {};
      patchTask(t.id, { idea: { form: Object.assign({}, i.form || {}), reviews: (i.reviews || []).slice(), chat: (i.chat || []).slice(), final: true, finalAt: new Date().toISOString(), finalBy: S.user.username, fromBank: d.id } });
      delete IDEA.draft[t.id];
      toast('Ide dari Bank Ide sudah dipakai. Lanjut bikin brief.');
      const tt = S.all ? S.all.tasks.find((x) => x.id === t.id) : (S.mine.tasks || []).find((x) => x.id === t.id);
      if (typeof newBriefModal === 'function' && !briefOf(t.id) && artStage(tt || t) <= 2) newBriefModal(t.id);
    } catch (e) { toast(cleanErr(e), true); }
    finally { delete IDEA.busy[t.id]; saveCache(); src.rerender(); }
  });
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

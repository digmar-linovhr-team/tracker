/* global L, S, api, $, $$, esc, toast, cleanErr, confirmBox, modal, go, softRender, saveCache, tile, personName, peopleList, teamData, loadTeam,
   IDEA, IDEA_KINDS, IDEA_MAX_REVIEW, ideaDraft, ideaCoreHtml, ideaCoreBind, aiEnabled, cmWhen, fmtIso, INDUSTRIES, OUT_KINDS, MONTHS_ID, taskModal, openTask */
'use strict';
// ---------- Bank Ide: brainstorming topik tanpa task ----------
// Anggota mengusulkan topik (Artikel TL industri, Studi kasus, Optimasi artikel), mendiskusikannya dengan Claude, lalu mengajukan.
// Admin menyetujui / meminta revisi / menolak; ide yang disetujui bisa langsung dijadikan task (ide masuk ke task sebagai ide final).
// Data di koleksi ideas/ (ditulis lewat server). Status: Draft → Diajukan → Disetujui | Revisi | Ditolak → Dipakai.

const BANK_KINDS = [['tl', 'Artikel TL industri', 'TL industri', 'Masalah HR di satu industri, ditulis dari sudut pandang praktisi.'],
  ['case', 'Studi kasus', 'Studi kasus', 'Klien yang pakai LinovHR dan hasilnya bisa ditunjukkan dengan angka.'],
  ['opt', 'Optimasi artikel', 'Optimasi', 'Artikel lama yang mau diperbaiki supaya naik peringkat.']];
const BANK_STATUSES = ['Draft', 'Diajukan', 'Revisi', 'Disetujui', 'Ditolak', 'Dipakai'];
const BANK_CHIP = { Draft: '', Diajukan: 'info', Revisi: 'warn', Disetujui: 'good', Ditolak: 'bad', Dipakai: 'good' };
const BANK_EDITABLE = ['Draft', 'Revisi'];
const bankKindName = (k) => (BANK_KINDS.find((x) => x[0] === k) || [k, k, k])[2];
const bankOutOf = (k) => (BANK_KINDS.find((x) => x[0] === k) || [k, ''])[1];
const bankAvailable = () => typeof aiEnabled === 'function' && aiEnabled();

let bankLoading = null;
function loadBank(force) {
  if (bankLoading) return bankLoading;
  if (!force && S.bank && Date.now() - (S.bankAt || 0) < 15000) return Promise.resolve(false);
  bankLoading = api.call('ideas').then((r) => {
    const before = JSON.stringify(S.bank || null);
    S.bank = ((r && r.ideas) || []).slice(); S.bankAt = Date.now();
    return before !== JSON.stringify(S.bank);
  }).catch((e) => { if (!S.bank) S.bank = []; toast('Bank Ide gagal dimuat: ' + cleanErr(e), true); return false; })
    .finally(() => { bankLoading = null; });
  return bankLoading;
}
/** Simpan hasil server ke daftar lokal. */
function bankPut(r) {
  if (!S.bank) S.bank = [];
  if (r && r.item) { S.bank = S.bank.filter((x) => x.id !== r.item.id).concat(r.item); }
  if (r && r.removed) S.bank = S.bank.filter((x) => x.id !== r.removed);
  S.bankAt = Date.now();
}
const bankLastRv = (d) => { const rv = ((d.idea || {}).reviews || []); return rv[rv.length - 1]; };
const bankTitleOf = (d) => d.title || ((d.idea || {}).form || {}).title || '';
function bankVerdictChip(d) {
  const rv = bankLastRv(d); if (!rv) return '<span class="chip">Belum dicek Claude</span>';
  const v = ((IDEA_KINDS[d.kind] || IDEA_KINDS.tl).verdict[rv.verdict]) || ['–', ''];
  return `<span class="chip ${v[1]}" title="Review Claude terakhir">Claude: ${esc(v[0])}</span>`;
}
function viewIdeas() {
  if (!bankAvailable()) { $('#view').innerHTML = '<div class="empty"><b>Bank Ide hanya tersedia di versi Firebase</b>Buka aplikasi dari alamat utama.</div>'; return; }
  if (!S.bank) {
    $('#view').innerHTML = '<div class="loading">Memuat Bank Ide…</div>';
    loadBank(true).then(() => { if (S.view === 'ideas') go('ideas'); });
    return;
  }
  loadBank().then((changed) => { if (changed && S.view === 'ideas' && !$('#modal-root .modal')) go('ideas'); });
  if (!(S.all && S.all.users) && !teamData()) loadTeam().then((ok) => { if (ok && S.view === 'ideas') softRender(); });
  const admin = S.user.role === 'admin', me = S.user.username;
  const f = S.bkf = S.bkf || { kind: '', status: admin ? 'Diajukan' : '', mine: !admin, ind: '', q: '' };
  const all = S.bank.slice().sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const q = f.q.trim().toLowerCase();
  const list = all.filter((d) => (!f.kind || d.kind === f.kind) && (!f.status || d.status === f.status) && (!f.mine || d.author === me) && (!f.ind || d.industry === f.ind)
    && (!q || [bankTitleOf(d), d.industry, d.authorName, JSON.stringify((d.idea || {}).form || {})].join(' ').toLowerCase().includes(q)));
  const count = (fn) => all.filter(fn).length;
  const ok = (d) => d.status === 'Disetujui' || d.status === 'Dipakai';
  const ym = new Date().toISOString().slice(0, 7), usedNow = (d) => d.status === 'Dipakai' && String(d.usedAt || '').slice(0, 7) === ym;
  // per orang
  const people = {};
  all.forEach((d) => { const p = people[d.author] = people[d.author] || { name: d.authorName || personName(d.author), Draft: 0, Diajukan: 0, Revisi: 0, Disetujui: 0, Ditolak: 0, Dipakai: 0, n: 0 }; p[d.status] = (p[d.status] || 0) + 1; p.n++; });
  const ppl = Object.entries(people).sort((a, b) => (b[1].Disetujui + b[1].Dipakai) - (a[1].Disetujui + a[1].Dipakai) || b[1].n - a[1].n);
  // cakupan industri (TL & studi kasus)
  const cov = INDUSTRIES.map((ind) => {
    const xs = all.filter((d) => d.industry === ind && d.kind !== 'opt' && d.status !== 'Ditolak');
    return { ind, ok: xs.filter(ok).length, wait: xs.filter((d) => d.status === 'Diajukan').length, draft: xs.filter((d) => d.status === 'Draft' || d.status === 'Revisi').length };
  });
  const covered = cov.filter((c) => c.ok).length;
  const card = (d) => {
    const rv = bankLastRv(d), nRev = ((d.idea || {}).reviews || []).length, title = bankTitleOf(d);
    return `<div class="bk-card" data-id="${esc(d.id)}" tabindex="0" role="button" aria-label="Buka ide ${esc(title || 'tanpa judul')}">
      <div class="bk-top"><span class="chip ${d.kind === 'tl' ? 'info' : d.kind === 'case' ? 'warn' : ''}">${esc(bankKindName(d.kind))}</span>${d.industry ? `<span class="chip">${esc(d.industry)}</span>` : ''}${d.fromTask ? '<span class="chip">Ditulis di task</span>' : ''}<span style="flex:1"></span><span class="chip ${BANK_CHIP[d.status] || ''}">${esc(d.status)}</span></div>
      <b class="bk-title">${title ? esc(title) : '<span class="muted">(belum ada judul)</span>'}</b>
      ${rv && rv.summary ? `<p class="bk-sum">${esc(rv.summary)}</p>` : ''}
      ${d.decision && d.decision.note && (d.status === 'Revisi' || d.status === 'Ditolak') ? `<p class="bk-note ${d.status === 'Ditolak' ? 'bad' : 'warn'}"><b>${esc(firstNameOf(d.decision.byName))}:</b> ${esc(d.decision.note)}</p>` : ''}
      <div class="bk-foot">${bankVerdictChip(d)}<span class="muted small">${esc(d.authorName || personName(d.author))} · ${esc(cmWhen(d.updatedAt || d.createdAt))}${nRev ? ` · dicek ${nRev}×` : ''}</span></div>
    </div>`;
  };
  $('#view').innerHTML = `
    <div class="card bk-hero"><div class="card-b">
      <div class="bk-hero-t"><div>
        <p class="muted" style="margin:0">Tulis ide topik kapan saja. Cek dulu ke Claude, lalu kirim ke admin. Ide yang disetujui bisa dipakai waktu task dibuat, dan ide yang ditulis langsung di task juga tersimpan di sini.</p></div></div>
      <button class="btn primary" id="bk-add">+ Tulis ide</button>
    </div></div>
    <div class="tiles">
      ${tile('TL siap dipakai', count((d) => d.kind === 'tl' && d.status === 'Disetujui'), `${count((d) => d.kind === 'tl' && usedNow(d))} sudah jadi task bulan ini`, 'var(--info)')}
      ${tile('Studi kasus siap dipakai', count((d) => d.kind === 'case' && d.status === 'Disetujui'), `${count((d) => d.kind === 'case' && usedNow(d))} sudah jadi task bulan ini`, 'var(--warn)')}
      ${tile('Optimasi siap dipakai', count((d) => d.kind === 'opt' && d.status === 'Disetujui'), `${count((d) => d.kind === 'opt' && usedNow(d))} sudah jadi task bulan ini`, 'var(--brand)')}
      ${tile('Belum diputuskan', count((d) => d.status === 'Diajukan'), `${count((d) => d.status === 'Draft' || d.status === 'Revisi')} masih draf`, 'var(--muted)')}
    </div>
    <div class="bk-grid2">
      <div class="card"><div class="card-h"><h2>Per orang</h2></div><div class="card-b">
        ${ppl.length ? `<table class="bk-tbl"><thead><tr><th>Nama</th><th title="Draft + Revisi">Draf</th><th>Menunggu</th><th>Disetujui</th><th>Ditolak</th></tr></thead><tbody>
          ${ppl.map(([u, p]) => `<tr data-person="${esc(u)}"><td><b>${esc(p.name)}</b></td><td>${p.Draft + p.Revisi}</td><td>${p.Diajukan}</td><td><b style="color:var(--good)">${p.Disetujui + p.Dipakai}</b></td><td>${p.Ditolak}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted small" style="margin:0">Belum ada ide masuk.</p>'}
      </div></div>
      <div class="card"><div class="card-h"><h2>Cakupan industri</h2><span class="muted small">${covered} dari ${INDUSTRIES.length} sudah ada topik</span></div><div class="card-b">
        <div class="bk-cov">${cov.map((c) => `<button type="button" class="bk-ind ${c.ok ? 'ok' : c.wait ? 'wait' : c.draft ? 'draft' : ''} ${f.ind === c.ind ? 'on' : ''}" data-ind="${esc(c.ind)}" title="${c.ok} disetujui · ${c.wait} menunggu · ${c.draft} draf">${esc(c.ind)}${c.ok + c.wait + c.draft ? `<small>${c.ok + c.wait + c.draft}</small>` : ''}</button>`).join('')}</div>
        <p class="muted small" style="margin:8px 0 0"><span class="bk-dot ok"></span>disetujui <span class="bk-dot wait"></span>menunggu <span class="bk-dot draft"></span>draf · hanya TL dan studi kasus. Klik industri untuk memfilter.</p>
      </div></div>
    </div>
    <div class="toolbar">
      <input type="search" id="bk-q" placeholder="Cari judul atau nama" value="${esc(f.q)}" aria-label="Cari ide">
      <div class="seg" id="bk-kind">${[['', 'Semua']].concat(BANK_KINDS.map((k) => [k[0], k[2]])).map(([k, l]) => `<button data-k="${k}" class="${f.kind === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      ${msTrigger({ id: 'bk-status', single: true, icon: 'status', on: !!f.status, title: 'Status ide', selected: f.status,
        items: [{ value: '', label: 'Semua status' }].concat(BANK_STATUSES.map((s) => ({ value: s, label: s }))), onApply: (v) => { f.status = v; go('ideas'); } })}
      <button class="btn sm ${f.mine ? 'on' : ''}" id="bk-mine" aria-pressed="${f.mine}">Ide saya</button>
      ${f.ind ? `<button class="btn sm on" id="bk-indx" title="Hapus saring industri">${esc(f.ind)} ×</button>` : ''}
    </div>
    ${list.length ? `<div class="bk-list">${list.map(card).join('')}</div>`
      : `<div class="card"><div class="empty"><b>${all.length ? 'Tidak ada ide yang cocok' : 'Belum ada ide'}</b>${all.length ? 'Coba ubah filternya.' : 'Klik “+ Tulis ide” untuk mulai.'}</div></div>`}
    <p class="def">Ide baru bisa dikirim setelah dicek Claude minimal sekali. Claude juga melihat ide teman di industri yang sama, jadi topik yang mirip akan ketahuan. Tiap ide bisa dicek ${IDEA_MAX_REVIEW} kali dan dibalas 10 kali. Ide yang disetujui admin bisa langsung dijadikan task, atau dipilih writer dari tahap ide di task-nya.</p>`;
  const qi = $('#bk-q');
  qi.oninput = () => { f.q = qi.value; clearTimeout(S.bkQt); S.bkQt = setTimeout(() => { go('ideas'); const x = $('#bk-q'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250); };
  $$('#bk-kind button').forEach((b) => b.onclick = () => { f.kind = b.dataset.k; go('ideas'); });
  $('#bk-mine').onclick = () => { f.mine = !f.mine; go('ideas'); };
  if ($('#bk-indx')) $('#bk-indx').onclick = () => { f.ind = ''; go('ideas'); };
  $$('.bk-ind').forEach((b) => b.onclick = () => { f.ind = f.ind === b.dataset.ind ? '' : b.dataset.ind; go('ideas'); });
  $$('tr[data-person]').forEach((r) => r.onclick = () => { f.mine = false; f.q = ''; f.status = ''; f.q = (people[r.dataset.person] || {}).name || ''; go('ideas'); });
  $('#bk-add').onclick = () => bankNewModal();
  $$('.bk-card').forEach((c) => { c.onclick = () => bankOpen(c.dataset.id); c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bankOpen(c.dataset.id); } }; });
}
const firstNameOf = (n) => String(n || '').split(/\s+/)[0];

/** Langkah 1: pilih jenis & industri, lalu ide dibuat sebagai draf. */
function bankNewModal() {
  let kind = 'tl';
  modal({
    title: 'Tulis ide baru',
    body: `<div class="field"><span>Jenis</span><div class="bk-kinds" role="radiogroup">${BANK_KINDS.map(([k, out, , desc]) => `<button type="button" role="radio" data-k="${k}" class="bk-kind ${k === kind ? 'on' : ''}" aria-checked="${k === kind}"><b>${esc(out)}</b><small>${esc(desc)}</small></button>`).join('')}</div></div>
      <label class="field" id="bk-indf"><span>Industri *</span><select id="bk-ind" data-pick="plain"><option value="">Pilih industri</option>${INDUSTRIES.map((i) => `<option>${esc(i)}</option>`).join('')}</select></label>
      <div id="bk-err"></div>`,
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="bk-go">Lanjut</button>',
    onMount: (m, close) => {
      formPick(m);
      const sync = () => { $$('.bk-kind', m).forEach((b) => { b.classList.toggle('on', b.dataset.k === kind); b.setAttribute('aria-checked', b.dataset.k === kind); }); $('#bk-indf', m).classList.toggle('hidden', kind === 'opt'); };
      $$('.bk-kind', m).forEach((b) => b.onclick = () => { kind = b.dataset.k; sync(); });
      $('#bk-go', m).onclick = async () => {
        const ind = $('#bk-ind', m).value;
        if (kind !== 'opt' && !ind) { $('#bk-err', m).innerHTML = '<div class="error">Industrinya belum dipilih.</div>'; return; }
        const btn = $('#bk-go', m); btn.disabled = true; btn.textContent = 'Sebentar…';
        try {
          const r = await api.call('bankSave', { item: { kind, industry: kind === 'opt' ? '' : ind, form: {}, period: '' } });
          bankPut(r); close(); if (S.view === 'ideas') go('ideas'); bankOpen(r.item.id);
        } catch (e) { btn.disabled = false; btn.textContent = 'Lanjut'; $('#bk-err', m).innerHTML = `<div class="error">${esc(cleanErr(e))}</div>`; }
      };
    }
  });
}

/** Editor ide (modal lebar). */
function bankOpen(id) {
  let closeFn = null;
  const render = () => {
    const box = $('#bk-ed'); if (!box) return;
    const d = (S.bank || []).find((x) => x.id === id);
    if (!d) { box.innerHTML = '<div class="empty"><b>Ide tidak ditemukan</b>Mungkin sudah dihapus.</div>'; return; }
    const admin = S.user.role === 'admin', mineIdea = d.author === S.user.username, editable = BANK_EDITABLE.includes(d.status) && (mineIdea || admin);
    const idea = d.idea || {}, rv = bankLastRv(d), busy = IDEA.busy[id];
    const src = {
      key: id, kind: d.kind, idea, locked: !editable, ids: { ideaId: id }, title: (IDEA_KINDS[d.kind] || {}).name,
      form: () => (editable ? ideaDraft(id, idea.form) : (idea.form || {})),
      apply: (r) => { bankPut(r); }, rerender: () => { render(); if (S.view === 'ideas') go('ideas'); },
      head: `<span class="chip ${BANK_CHIP[d.status] || ''}">${esc(d.status)}</span>`,
      industry: d.kind === 'opt' ? '' : `<p class="muted small" style="margin:0 0 8px">Industri <b>${esc(d.industry || '–')}</b> · ditulis ${esc(d.authorName || personName(d.author))}</p>`,
      wrapId: 'bk-sec',
      footer: () => {
        const btn = [];
        if (editable && mineIdea) btn.push('<button class="btn ghost" data-bk="delete">Hapus draf</button>');
        else if (admin && d.status !== 'Dipakai') btn.push('<button class="btn ghost" data-bk="delete">Hapus</button>');
        if (editable) btn.push(`<button class="btn ok" data-bk="submit" ${!rv || busy ? 'disabled' : ''} title="${rv ? '' : 'Cek ke Claude dulu'}">Kirim ke admin</button>`);
        if (d.status === 'Diajukan' && mineIdea) btn.push('<button class="btn" data-bk="withdraw">Tarik lagi</button>');
        if (d.status === 'Dipakai' && d.taskId) btn.push('<button class="btn" data-bk="task">Buka task</button>');
        const decide = admin && ['Diajukan', 'Disetujui', 'Revisi', 'Ditolak'].includes(d.status) ? `<div class="bk-decide">
            <label class="field" style="margin:0"><span>Catatan untuk ${esc(firstNameOf(d.authorName) || 'penulis')} <small class="muted">(wajib kalau minta revisi atau tolak)</small></span><textarea id="bk-dnote" rows="2" maxlength="800" placeholder="Contoh: sudutnya oke, tapi sumber datanya belum ada.">${esc((S.bkNote || {})[id] || '')}</textarea></label>
            <div class="idea-act">${d.status !== 'Ditolak' ? '<button class="btn" data-bk="reject">Tolak</button>' : ''}${d.status !== 'Revisi' ? '<button class="btn" data-bk="revise">Minta revisi</button>' : ''}${d.status !== 'Disetujui' ? '<button class="btn ok" data-bk="approve">Setujui</button>' : ''}
            ${d.status === 'Disetujui' ? '<button class="btn primary" data-bk="use">Jadikan task</button>' : ''}</div></div>` : '';
        return `${decide}${btn.length ? `<div class="idea-act">${btn.join('')}</div>` : ''}`;
      }
    };
    const dec = d.decision && d.decision.note ? `<div class="bk-note ${d.status === 'Ditolak' ? 'bad' : d.status === 'Revisi' ? 'warn' : 'good'}"><b>${esc(d.decision.status)} · ${esc(d.decision.byName || d.decision.by)}</b> <span class="muted small">${esc(cmWhen(d.decision.at))}</span><br>${esc(d.decision.note)}</div>` : '';
    const lockMsg = !editable && d.status === 'Diajukan' && mineIdea ? '<p class="muted small">Ide ini sedang dicek admin. Klik Tarik lagi kalau mau mengubahnya.</p>' : '';
    box.innerHTML = dec + lockMsg + ideaCoreHtml(src);
    const { form } = ideaCoreBind(box, src);
    const note = $('#bk-dnote', box); if (note) note.oninput = () => { (S.bkNote = S.bkNote || {})[id] = note.value; };
    $$('[data-bk]', box).forEach((b) => b.onclick = () => bankAction(id, b.dataset.bk, form, render, () => closeFn && closeFn()));
  };
  const d0 = (S.bank || []).find((x) => x.id === id);
  closeFn = modal({ title: d0 && bankTitleOf(d0) ? bankTitleOf(d0) : 'Ide baru', wide: true, body: '<div id="bk-ed"></div>', actions: '<button class="btn" data-close>Tutup</button>', onMount: () => setTimeout(render, 0) });
}

async function bankAction(id, act, form, render, close) {
  const d = (S.bank || []).find((x) => x.id === id); if (!d) return;
  const call = async (action, payload, msg) => {
    if (IDEA.busy[id]) return null;
    IDEA.busy[id] = act; render();
    try { const r = await api.call(action, Object.assign({ ideaId: id }, payload || {})); bankPut(r); if (r && r.item && r.item.idea) IDEA.draft[id] = Object.assign({}, r.item.idea.form || {}); if (msg) toast(msg); return r; }
    catch (e) { toast(cleanErr(e), true); return null; }
    finally { delete IDEA.busy[id]; render(); if (S.view === 'ideas') go('ideas'); }
  };
  const note = () => String(((S.bkNote || {})[id]) || '').trim();
  if (act === 'submit') {
    const rv = bankLastRv(d), V = (IDEA_KINDS[d.kind] || IDEA_KINDS.tl).verdict;
    if (rv && rv.verdict !== 'kuat') {
      const f0 = form();   // simpan isi form sebelum modal konfirmasi menggantikan editor
      const yes = await confirmBox('Kirim ke admin?', `Penilaian terakhir Claude: “${(V[rv.verdict] || ['–'])[0]}”. Ide tetap bisa dikirim, dan admin akan melihat catatan Claude.`, 'Kirim');
      bankOpen(id); if (!yes) return;
      await call('bankSubmit', { form: f0 }, 'Ide terkirim ke admin'); return;
    }
    await call('bankSubmit', { form: form() }, 'Ide terkirim ke admin');
  } else if (act === 'withdraw') await call('bankDecide', { decision: 'withdraw' }, 'Ide ditarik. Silakan ubah, lalu kirim lagi.');
  else if (act === 'approve' || act === 'revise' || act === 'reject') {
    if (act !== 'approve' && note().length < 5) { toast('Isi catatan untuk penulisnya dulu.', true); const n = $('#bk-dnote'); if (n) n.focus(); return; }
    const r = await call('bankDecide', { decision: act, note: note() }, { approve: 'Ide disetujui', revise: 'Ide dikembalikan untuk direvisi', reject: 'Ide ditolak' }[act]);
    if (r && S.bkNote) delete S.bkNote[id];
  } else if (act === 'delete') {
    if (!(await confirmBox('Hapus ide ini?', 'Ide dan obrolannya dengan Claude akan terhapus dan tidak bisa dikembalikan.'))) { bankOpen(id); return; }
    try { bankPut(await api.call('bankDelete', { ideaId: id })); toast('Ide dihapus'); } catch (e) { toast(cleanErr(e), true); bankOpen(id); return; }
    if (S.view === 'ideas') go('ideas');
  } else if (act === 'task') { close(); if (typeof openTask === 'function') openTask(d.taskId); }
  else if (act === 'use') bankToTask(d, close);
}

/** Admin: ide disetujui → form task baru terisi (jenis output, industri, judul, pengusul). Setelah task tersimpan, ide masuk ke task sebagai ide final. */
function bankToTask(d, close) {
  const f = (d.idea || {}).form || {};
  close();
  const today = new Date(), iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const end = new Date(today); end.setDate(end.getDate() + 3);
  const pre = { type: 'Artikel', task: f.title || bankTitleOf(d) || '', owner: d.author, outKind: bankOutOf(d.kind), industry: d.kind === 'opt' ? '' : d.industry,
    liveUrl: d.kind === 'opt' ? (f.url || '') : '', startDate: iso(today), endDate: iso(end), startTime: '09:00', endTime: '18:00', priority: 'Medium', status: 'Backlog' };
  taskModal(pre, true, { onCreated: async (t) => {
    const r = await api.call('bankUse', { ideaId: d.id, taskId: t.id });
    bankPut(r);
    if (typeof patchTask === 'function') patchTask(t.id, { idea: Object.assign({}, d.idea, { final: true, fromBank: d.id }) });
    toast('Task sudah dibuat. Tahap ide dianggap selesai, jadi writer bisa langsung bikin brief.');
    if (S.view === 'ideas') go('ideas');
  } });
}

/** Angka di menu: admin = ide menunggu keputusan; anggota = ide miliknya yang perlu direvisi. */
function bankBadge() {
  if (!S.bank) return 0;
  return S.user.role === 'admin' ? S.bank.filter((d) => d.status === 'Diajukan').length : S.bank.filter((d) => d.author === S.user.username && d.status === 'Revisi').length;
}

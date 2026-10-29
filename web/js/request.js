/* Request: brief custom antar anggota (mis. desainer → writer untuk copy landing page).
 * Alur: Konfirmasi (penerima boleh minta klarifikasi) → Dikerjakan → Diajukan → pembuat request Setujui = Selesai.
 * Memakai fungsi & state dari app.js / brief.js / social.js / briefdoc.js. */
'use strict';

const REQ_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>';
const REQ_STEPS = [['Konfirmasi', 'Konfirmasi penerima'], ['Dikerjakan', 'Dikerjakan'], ['Diajukan', 'Diajukan'], ['Selesai', 'Selesai']];
const REQ_CLS = { Konfirmasi: 'warn', Klarifikasi: 'warn', Dikerjakan: 'info', Dikembalikan: 'bad', Diajukan: 'info', Selesai: 'good' };
const REQ_LABEL = { Konfirmasi: 'Menunggu diterima', Klarifikasi: 'Klarifikasi', Dikerjakan: 'Dikerjakan', Dikembalikan: 'Dikembalikan', Diajukan: 'Menunggu persetujuan', Selesai: 'Selesai' };
const REQ_TABS = [['all', 'Semua'], ['todo', 'Perlu tindakan saya'], ['in', 'Untuk saya'], ['out', 'Dari saya'], ['done', 'Selesai']];
const isReq = (b) => !!b && b.type === 'Request';

function normRequest(d) {
  d = d || {};
  return { v: 1, title: d.title || '', body: d.body || '', attachments: Array.isArray(d.attachments) ? d.attachments.map((a) => ({ label: a.label || '', url: a.url || '' })) : [],
    thread: Array.isArray(d.thread) ? d.thread : [], assign: d.assign || null };
}
function reqStatus(b) { const s = b.status || 'Konfirmasi'; return [s, REQ_CLS[s] || 'info']; }
function reqTitle(b) { return (b.data && b.data.title) || b.title || ''; }
/** Apa yang perlu dilakukan pengguna ini pada request? '' bila tidak ada. */
function reqTodo(b) {
  const me = S.user.username, s = b.status;
  if (b.owner === me && (s === 'Konfirmasi' || s === 'Dikembalikan')) return s === 'Konfirmasi' ? 'Terima atau tanyakan' : 'Perbaiki & ajukan lagi';
  if (b.createdBy === me && s === 'Klarifikasi') return 'Jawab klarifikasi';
  if (b.createdBy === me && s === 'Diajukan') return 'Cek & setujui hasil';
  return '';
}
function reqTodoCount() { return (S.briefs || []).filter((b) => isReq(b) && reqTodo(b)).length; }
function reqOfTask(taskId) { return (S.briefs || []).find((b) => isReq(b) && b.taskId === taskId) || null; }

// ---------- daftar ----------
function renderRequestList() {
  const f = S.bf, q = f.q.trim().toLowerCase(), me = S.user.username;
  const all = (S.briefs || []).filter(isReq);
  const list = all.filter((b) => {
    if (f.tab === 'todo' && !reqTodo(b)) return false;
    if (f.tab === 'in' && b.owner !== me) return false;
    if (f.tab === 'out' && b.createdBy !== me) return false;
    if (f.tab === 'done' && b.status !== 'Selesai') return false;
    if (f.tab === 'all' && b.status === 'Selesai' && !q) return true;
    if (q && !(reqTitle(b) + ' ' + nameOf(b.owner) + ' ' + nameOf(b.createdBy)).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (reqTodo(b) ? 1 : 0) - (reqTodo(a) ? 1 : 0) || (a.status === 'Selesai') - (b.status === 'Selesai') || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!list.length) {
    $('#blist').innerHTML = `<div class="card empty"><b>${all.length ? (f.tab === 'todo' ? 'Tidak ada yang perlu Anda tindak lanjuti' : 'Tidak ada request yang cocok') : 'Belum ada request'}</b>Minta bantuan anggota lain — mis. copy landing page, desain banner, atau data — lewat tombol “+ Request”. Task-nya otomatis masuk ke penerima.</div>`;
    return;
  }
  $('#blist').innerHTML = `<div class="card tlist brief-list req-list">
    <div class="bl-head"><span>Request</span><span>Dari → untuk</span><span>Deadline</span><span>Status</span></div>
    ${list.map((b) => {
      const t = briefTask(b), [st, cls] = reqStatus(b), todo = reqTodo(b);
      const end = t ? L.schedule(t).end : (b.data && b.data.assign && b.data.assign.endDate ? L.at(b.data.assign.endDate, b.data.assign.endTime || '18:00') : null);
      const n = (b.data && b.data.nMsg) || ((b.data && b.data.thread) || []).length;
      return `<button class="bl-row" data-brief="${esc(b.id)}">
        <span class="bl-kw"><b>${esc(reqTitle(b) || '(tanpa judul)')}</b><small>${n ? n + ' pesan' : 'belum ada pesan'}${b.data && b.data.nAttach ? ' · ' + b.data.nAttach + ' lampiran' : ''}</small></span>
        <span class="bl-task">${esc(nameOf(b.createdBy))} → ${esc(nameOf(b.owner))}<small>${todo ? `<span class="req-todo">${esc(todo)}</span>` : ''}</small></span>
        <span class="bl-type">${end ? esc(fmtS(end)) : '–'}</span>
        <span><span class="bstat ${cls}">${esc(REQ_LABEL[st] || st)}</span></span>
      </button>`;
    }).join('')}</div>`;
  $$('[data-brief]', $('#blist')).forEach((r) => r.onclick = () => openBrief(r.dataset.brief));
}

// ---------- buat / ubah ----------
function requestModal(b) {
  const edit = !!b, d = edit ? normRequest(b.data) : normRequest({});
  const t = edit ? briefTask(b) : null;
  const a = edit ? Object.assign({ owner: b.owner, endDate: t ? t.endDate : '', endTime: t ? t.endTime : '18:00', priority: t ? t.priority : 'Medium', code: t ? t.code : '' }, d.assign || {}, t ? { owner: t.owner, endDate: t.endDate, endTime: t.endTime || '18:00', priority: t.priority || 'Medium', code: t.code || '' } : {}) : { owner: '', endDate: '', endTime: '18:00', priority: 'Medium', code: '' };
  const people = socPeople().filter((u) => u.username !== (edit ? b.createdBy : S.user.username));
  if (!people.length && !S.all && !S.team) { loadTeam().then((ok) => ok && requestModal(b)); return; }
  const opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l || v)}</option>`;
  let att = d.attachments.slice();
  modal({
    title: edit ? 'Ubah request' : 'Request baru', wide: true,
    body: `<form id="rqf">
      <label class="field"><span>Judul *</span><input name="title" required maxlength="200" value="${esc(d.title)}" placeholder="mis. Copy landing page modul Reimbursement"></label>
      <div class="grid2">
        <label class="field"><span>Untuk *</span><select name="owner" required><option value="">Pilih anggota…</option>${people.map((u) => opt(u.username, a.owner, u.name + (u.position ? ' — ' + u.position : ''))).join('')}</select></label>
        <label class="field"><span>Project (opsional)</span><select name="code"><option value="">— tanpa project —</option>${socProjects().map((p) => opt(p.code, a.code, p.code + ' — ' + String(p.project).slice(0, 50))).join('')}</select></label>
      </div>
      <div class="grid3">
        <label class="field"><span>Deadline *</span><input type="date" name="endDate" required value="${esc(a.endDate || '')}"></label>
        <label class="field"><span>Jam</span><input type="time" name="endTime" value="${esc(a.endTime || '18:00')}"></label>
        <label class="field"><span>Prioritas</span><select name="priority">${PRIORITIES.map((p) => opt(p, a.priority || 'Medium')).join('')}</select></label>
      </div>
      <label class="field"><span>Kebutuhan *</span><textarea name="body" rows="9" required maxlength="20000" placeholder="Tulis apa yang Anda butuhkan: tujuan, untuk siapa, poin yang harus ada, nada/gaya, ukuran, contoh yang disukai…">${esc(d.body)}</textarea></label>
      <div class="field"><span>Lampiran / referensi (link)</span><div id="rq-att"></div>
        <div class="link-r"><input type="url" id="rq-url" placeholder="https://drive.google.com/… atau figma.com/…"><input type="text" id="rq-lbl" placeholder="Nama (opsional)" maxlength="80"><button type="button" class="btn sm" id="rq-add">+ Tambah</button></div></div>
      <div id="rqerr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="rq-save">${edit ? 'Simpan perubahan' : 'Kirim request'}</button>`,
    onMount: (m, close) => {
      const f = $('#rqf', m), err = (x) => { $('#rqerr', m).innerHTML = x ? `<div class="error">${esc(x)}</div>` : ''; };
      const draw = () => {
        $('#rq-att', m).innerHTML = att.length ? `<div class="t-res" style="margin:0 0 8px">${att.map((x, i) => `<span class="rq-att">${resChip(x)}<button type="button" class="ibtn" data-rmatt="${i}" aria-label="Hapus lampiran">×</button></span>`).join('')}</div>` : '';
        $$('[data-rmatt]', m).forEach((x) => x.onclick = () => { att.splice(+x.dataset.rmatt, 1); draw(); });
      };
      const add = () => {
        const u = $('#rq-url', m).value.trim(); if (!u) return true;
        if (!isHttp(u)) { err('Lampiran harus berupa link yang diawali http:// atau https://'); return false; }
        att.push({ label: $('#rq-lbl', m).value.trim(), url: u }); $('#rq-url', m).value = ''; $('#rq-lbl', m).value = ''; err(''); draw(); return true;
      };
      $('#rq-add', m).onclick = add;
      $('#rq-url', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      draw();
      $('#rq-save', m).onclick = async () => {
        if (!add() || !f.reportValidity()) return;
        const end = L.at(f.endDate.value, f.endTime.value || '18:00');
        if (!edit && end && end < new Date()) return err('Deadline sudah lewat. Pilih tanggal/jam yang akan datang.');
        const data = { title: f.title.value.trim(), body: f.body.value, attachments: att };
        const assign = { owner: f.owner.value, endDate: f.endDate.value, endTime: f.endTime.value || '18:00', priority: f.priority.value, code: f.code.value };
        const changedAssign = !edit || ['owner', 'endDate', 'endTime', 'priority', 'code'].some((k) => String(assign[k] || '') !== String(a[k] || ''));
        try {
          const r = await busy($('#rq-save', m), () => api.call('saveRequest', { brief: { id: edit ? b.id : undefined, data, assign: changedAssign ? assign : undefined, baseUpdatedAt: edit ? b.updatedAt : undefined } }));
          close();
          if (r.task) upsertTaskLocal(Object.assign({}, r.task, { ownerName: nameOf(r.task.owner) }));
          putBrief(r.brief); saveCache();
          toast(edit ? 'Request diperbarui' : `Request dikirim ke ${nameOf(assign.owner)}`);
          S.bEdit = null; openBrief(r.brief.id);
        } catch (e2) { err(cleanErr(e2)); }
      };
      setTimeout(() => f.title.focus(), 50);
    }
  });
}

// ---------- detail ----------
function viewRequest() {
  const E = S.bEdit, b = E.b, d = b.data, t = briefTask(b), me = S.user.username, admin = S.user.role === 'admin';
  const isOwner = (t ? t.owner : b.owner) === me, isCreator = b.createdBy === me;
  const [st, cls] = reqStatus(b);
  if (!S.all && !S.team && !admin) loadTeam().then((ok) => { if (ok && S.view === 'brief' && S.bEdit === E) viewRequest(); });
  $('#view-title').textContent = d.title || 'Request';
  $('#view-sub').textContent = 'Request · ' + nameOf(b.createdBy) + ' → ' + nameOf(b.owner);
  const k = t ? L.requestKpi(t) : null, end = k && k.effEnd ? k.effEnd : (t ? L.schedule(t).end : null);
  const stepIdx = { Konfirmasi: 0, Klarifikasi: 0, Dikerjakan: 1, Dikembalikan: 1, Diajukan: 2, Selesai: 3 }[st] || 0;
  const res = t ? resultsOf(t) : [];
  const canEdit = (isCreator || admin) && st !== 'Selesai';
  const canDel = (isCreator || admin) && (!t || (t.status === 'Backlog' && !t.startedAt) || admin);
  $('#view').innerHTML = `
    <div class="bed-top">
      <button class="btn ghost sm" id="bback">← Request</button>
      <div class="bed-task"><span class="soc-ico">${REQ_ICON}</span><b>${esc(d.title || 'Request')}</b> <span class="muted">· ${esc(nameOf(b.createdBy))} → ${esc(nameOf(b.owner))}</span></div>
      <span class="bstat ${cls}">${esc(REQ_LABEL[st] || st)}</span>
      <div class="bed-actions">${canEdit ? '<button class="btn sm" id="rq-edit">Ubah</button>' : ''}${canDel ? '<button class="btn sm ghost danger" id="rq-del">Hapus</button>' : ''}</div>
    </div>
    <div class="rq-steps">${REQ_STEPS.map(([key, l], i) => `<span class="${i < stepIdx || st === 'Selesai' ? 'd' : i === stepIdx ? 'c' : ''}">${i + 1}. ${esc(i === 0 && st === 'Klarifikasi' ? 'Klarifikasi' : i === 1 && st === 'Dikembalikan' ? 'Revisi' : l)}</span>`).join('')}</div>
    <div class="rq-grid">
      <article class="card bdoc rq-doc">
        <header class="bdoc-head">
          <div class="bdoc-kicker">Request</div>
          <h1>${esc(d.title || '(tanpa judul)')}</h1>
          <dl class="bdoc-kv">
            <dt>Dari</dt><dd>${esc(nameOf(b.createdBy))}</dd>
            <dt>Untuk</dt><dd>${esc(t ? t.ownerName : nameOf(b.owner))}</dd>
            <dt>Deadline</dt><dd>${end ? esc(fmtDT(end)) : '–'}${k && k.pauseMs > 60000 ? ` <span class="muted small">(+${esc(L.humanDuration(k.pauseMs))} jeda klarifikasi)</span>` : ''}</dd>
            ${t && t.priority ? `<dt>Prioritas</dt><dd>${esc(t.priority)}${t.code ? ' · ' + esc(t.code) : ''}</dd>` : ''}
          </dl>
        </header>
        <section class="bdoc-sec"><h2>Kebutuhan</h2><div class="rq-body">${linkify(d.body)}</div></section>
        ${d.attachments.length ? `<section class="bdoc-sec"><h2>Lampiran</h2><div class="t-res">${d.attachments.map((x) => resChip(x)).join('')}</div></section>` : ''}
        ${res.length || (t && t.resultNote) ? `<section class="bdoc-sec"><h2>Hasil kerja</h2>${t.resultNote ? `<p class="bdoc-p">${txtHtml(t.resultNote)}</p>` : ''}<div class="t-res">${res.map((x) => resChip(x)).join('')}</div></section>` : ''}
      </article>
      <aside class="card rq-side">
        <div id="rq-act">${reqActionsHtml(b, t, st, isOwner, isCreator, admin)}</div>
        <div class="rq-thread-h">Percakapan</div>
        <div class="rq-thread">${d.thread.length ? d.thread.map((m) => m.sys
          ? `<div class="rq-sys">${esc(m.name || nameOf(m.by))}: ${esc(m.text)} <span>${esc(fmtS(new Date(m.t)))}</span></div>`
          : `<div class="rq-msg ${m.by === me ? 'mine' : ''}"><b>${esc(m.name || nameOf(m.by))}</b> <span>${esc(fmtS(new Date(m.t)))}</span><p>${linkify(m.text)}</p></div>`).join('') : '<p class="muted small" style="margin:0">Belum ada pesan.</p>'}</div>
        ${(isOwner || isCreator || admin) && st !== 'Selesai' && !(isOwner && st === 'Konfirmasi') && !((isCreator || admin) && st === 'Klarifikasi') ? `<div class="rq-send"><textarea id="rq-msg" rows="2" maxlength="2000" placeholder="Tulis pesan…"></textarea><button class="btn sm" id="rq-msgbtn">Kirim</button></div>` : ''}
      </aside>
    </div>`;
  $('#bback').onclick = () => { S.bf.kind = 'request'; go('briefs'); };
  if ($('#rq-edit')) $('#rq-edit').onclick = () => requestModal(b);
  if ($('#rq-del')) $('#rq-del').onclick = () => reqDelete(b, t);
  bindReqActions(b, t);
  if ($('#rq-msgbtn')) $('#rq-msgbtn').onclick = () => { const v = $('#rq-msg').value.trim(); if (!v) return $('#rq-msg').focus(); reqAct(b.id, 'message', { text: v }, $('#rq-msgbtn')); };
}

function linkify(text) {
  return esc(String(text || '')).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');
}

function reqActionsHtml(b, t, st, isOwner, isCreator, admin) {
  const who = nameOf(b.createdBy), to = t ? t.ownerName : nameOf(b.owner);
  if (st === 'Selesai') return `<div class="rq-box good"><b>Request selesai</b><span>Hasil disetujui ${esc(who)}.</span></div>`;
  if (isOwner) {
    if (st === 'Konfirmasi' || st === 'Klarifikasi') return `<div class="rq-box"><b>${st === 'Klarifikasi' ? 'Menunggu jawaban ' + esc(who) : 'Request untuk Anda'}</b>
        <span>${st === 'Klarifikasi' ? 'Waktu klarifikasi tidak dihitung ke KPI Anda. Anda tetap bisa menerima bila sudah jelas.' : 'Baca kebutuhannya. Bila ada yang belum jelas, tanyakan dulu — waktu klarifikasi tidak dihitung ke KPI.'}</span>
        <button class="btn primary" id="rq-accept">Terima & mulai kerjakan</button>
        ${st === 'Konfirmasi' ? '<label class="field" style="margin-top:10px"><span>Minta klarifikasi</span><textarea id="rq-q" rows="2" maxlength="2000" placeholder="mis. Perlu versi bahasa Inggris juga?"></textarea></label><button class="btn sm" id="rq-ask">Kirim pertanyaan</button>' : ''}</div>`;
    if (st === 'Dikerjakan' || st === 'Dikembalikan') return `<div class="rq-box ${st === 'Dikembalikan' ? 'bad' : ''}"><b>${st === 'Dikembalikan' ? 'Dikembalikan untuk diperbaiki' : 'Sedang Anda kerjakan'}</b>
        <span>Tempel link hasil (Docs, Figma, dll.) lalu ajukan ke ${esc(who)} untuk disetujui.</span>
        <button class="btn" id="rq-res">${t && resultsOf(t).length ? 'Ubah hasil kerja' : '+ Hasil kerja'}</button>
        <button class="btn primary" id="rq-submit">Ajukan ke ${esc(who)}</button></div>`;
    if (st === 'Diajukan') return `<div class="rq-box"><b>Menunggu persetujuan ${esc(who)}</b><span>Anda akan diberi tahu bila disetujui atau dikembalikan.</span></div>`;
  }
  if (isCreator || admin) {
    if (st === 'Klarifikasi') return `<div class="rq-box warn"><b>${esc(to)} bertanya</b><span>Jawab di bawah. Bila perlu, perpanjang deadline sekalian.</span>
        <textarea id="rq-ans" rows="3" maxlength="2000" placeholder="Jawaban Anda…"></textarea>
        <div class="grid2" style="margin-top:8px"><label class="field"><span>Deadline baru (opsional)</span><input type="date" id="rq-nd"></label><label class="field"><span>Jam</span><input type="time" id="rq-nt" value="${esc((t && t.endTime) || '18:00')}"></label></div>
        <button class="btn primary" id="rq-answer">Kirim jawaban</button></div>`;
    if (st === 'Diajukan') return `<div class="rq-box"><b>Hasil dari ${esc(to)} siap dicek</b><span>Lihat “Hasil kerja” di sebelah kiri.</span>
        <div class="rq-row"><button class="btn" id="rq-return">Kembalikan</button><button class="btn primary" id="rq-approve">Setujui</button></div></div>`;
    return `<div class="rq-box"><b>${esc(REQ_LABEL[st] || st)}</b><span>${st === 'Konfirmasi' ? esc(to) + ' belum menerima request ini.' : esc(to) + ' sedang mengerjakan.'}</span></div>`;
  }
  return `<div class="rq-box"><b>${esc(REQ_LABEL[st] || st)}</b><span>Hanya bisa dilihat.</span></div>`;
}

function bindReqActions(b, t) {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = () => fn(el); };
  on('rq-accept', (el) => reqAct(b.id, 'accept', {}, el));
  on('rq-ask', (el) => { const v = $('#rq-q').value.trim(); if (!v) return $('#rq-q').focus(); reqAct(b.id, 'message', { text: v }, el); });
  on('rq-answer', (el) => { const v = $('#rq-ans').value.trim(); if (!v) return $('#rq-ans').focus(); reqAct(b.id, 'message', { text: v, endDate: $('#rq-nd').value, endTime: $('#rq-nt').value }, el); });
  on('rq-res', () => t && resultsModal(t, { hint: 'Tempel link hasil request ini.' }));
  on('rq-submit', (el) => {
    if (!t) return;
    if (!resultsOf(t).length && !String(t.resultNote || '').trim()) return resultsModal(t, { then: () => reqAct(b.id, 'submit', {}), saveLabel: 'Simpan & ajukan', hint: 'Tambahkan link hasil kerja dulu.' });
    reqAct(b.id, 'submit', {}, el);
  });
  on('rq-approve', (el) => reqAct(b.id, 'approve', {}, el));
  on('rq-return', () => modal({
    title: 'Kembalikan hasil', body: '<label class="field"><span>Apa yang perlu diperbaiki?</span><textarea id="rq-why" rows="3" maxlength="2000" placeholder="mis. Headline terlalu panjang, maksimal 8 kata"></textarea></label>',
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="rq-why-ok">Kembalikan</button>',
    onMount: (m, close) => { $('#rq-why-ok', m).onclick = () => { const v = $('#rq-why', m).value.trim(); close(); reqAct(b.id, 'return', { text: v }); }; }
  }));
}

/** Jalankan aksi request lalu perbarui brief & task di layar. */
async function reqAct(id, act, payload, btn) {
  const labels = { accept: 'Request diterima. Selamat mengerjakan!', submit: 'Hasil diajukan.', approve: 'Disetujui — request selesai.', return: 'Dikembalikan ke penerima.', message: 'Pesan terkirim.' };
  try {
    const r = await busy(btn || null, () => api.call('requestAction', { briefId: id, act, payload }));
    if (r.task) { patchTask(r.task.id, { status: r.task.status, startedAt: r.task.startedAt, reviewAt: r.task.reviewAt, doneAt: r.task.doneAt, notes: r.task.notes, endDate: r.task.endDate, endTime: r.task.endTime, stageLog: r.task.stageLog }); if (!findTask(r.task.id)) upsertTaskLocal(r.task); }
    putBrief(r.brief); saveCache();
    if (S.bEdit && S.bEdit.id === id) { S.bEdit.b = Object.assign({}, r.brief, { data: normRequest(r.brief.data) }); }
    toast(labels[act] || 'Tersimpan');
    renderNav();
    if (S.view === 'brief' && S.bEdit && S.bEdit.id === id) viewRequest(); else softRender();
  } catch (e) {
    if (/dimuat ulang/i.test(cleanErr(e))) refreshInBackground(300);
  }
}

async function reqDelete(b, t) {
  const untouched = t && t.status === 'Backlog' && !t.startedAt;
  if (!(await confirmBox('Hapus request?', `Request "${reqTitle(b)}" akan dihapus.` + (untouched ? ` Task ${t.ownerName} yang belum dimulai ikut terhapus.` : t ? ' Task-nya tidak ikut terhapus.' : '')))) return;
  try {
    const r = await busy(null, () => api.call('deleteBrief', { briefId: b.id }));
    S.briefs = S.briefs.filter((x) => x.id !== b.id);
    if (r && r.taskDeleted) removeTaskLocal(r.taskId);
    S.bEdit = null; saveCache(); toast('Request dihapus');
    S.bf.kind = 'request'; go('briefs');
  } catch (e) { /* busy sudah menampilkan pesan */ }
}

// ---------- di baris task ----------
/** Tombol di baris task Request milik penerima. */
function reqTaskCtrl(t, readonly) {
  const b = reqOfTask(t.id);
  if (!b) return `<span class="pill ${ST_CLASS[t.status] || 'st-backlog'}">${esc(t.status)}</span>`;
  const st = b.status, mine = t.owner === S.user.username;
  if (readonly || !mine) return `<span class="bstat ${REQ_CLS[st] || 'info'}">${esc(REQ_LABEL[st] || st)}</span>`;
  if (st === 'Konfirmasi' || st === 'Klarifikasi') return `<button class="btn sm primary" data-openbrief="${esc(b.id)}">${st === 'Klarifikasi' ? 'Lihat klarifikasi' : 'Buka & terima'}</button>`;
  if (st === 'Dikerjakan' || st === 'Dikembalikan') return `<button class="btn sm primary" data-reqsubmit="${esc(b.id)}" data-id="${esc(t.id)}">Ajukan hasil</button>`;
  if (st === 'Diajukan') return `<span class="art-wait">${HOURGLASS_SVG}Menunggu ${esc(nameOf(b.createdBy))}</span>`;
  return '<span class="pill st-done">Done</span>';
}
function bindReqRows(root) {
  $$('[data-reqsubmit]', root).forEach((x) => x.onclick = () => {
    const t = findTask(x.dataset.id); if (!t) return;
    if (!resultsOf(t).length && !String(t.resultNote || '').trim()) return resultsModal(t, { then: () => reqAct(x.dataset.reqsubmit, 'submit', {}), saveLabel: 'Simpan & ajukan', hint: 'Tempel link hasil request ini.' });
    reqAct(x.dataset.reqsubmit, 'submit', {}, x);
  });
}

// ---------- KPI ----------
function requestKpiCard(tasks, range, team) {
  const all = tasks.filter(L.isRequest);
  if (!all.length) return '';
  const s = L.requestSummary(all, range);
  const people = team ? Object.values(all.reduce((m, t) => { (m[t.owner] = m[t.owner] || { name: t.ownerName, tasks: [] }).tasks.push(t); return m; }, {}))
    .map((g) => Object.assign({ name: g.name }, L.requestSummary(g.tasks, range))).filter((x) => x.total).sort((a, b) => (b.onTimeRate || 0) - (a.onTimeRate || 0) || b.done - a.done) : [];
  return `<div class="card" style="margin-bottom:12px"><div class="card-h"><h2>KPI Request</h2><span class="muted small">kategori terpisah · waktu klarifikasi tidak dihitung</span></div>
    <div class="card-b"><div class="tiles tiles-in">
      ${tile('Request diterima', s.total, `${s.done} selesai · ${s.waiting} berjalan`)}
      ${tile('Selesai tepat waktu', pct(s.onTimeRate), `${s.ontime} dari ${s.ontime + s.late} selesai`, css('--info'))}
      ${tile('Rata-rata waktu respon', L.humanDuration(s.avgResponseMs), 'dibuat → diterima/klarifikasi')}
      ${tile('Disetujui tanpa revisi', pct(s.firstPassRate), s.overdue ? `${s.overdue} lewat deadline` : 'dari request selesai', css('--good'))}
    </div>
    ${people.length > 1 ? `<table class="tbl" style="margin-top:12px"><thead><tr><th>Nama</th><th class="num">Diterima</th><th class="num">Selesai</th><th class="num">Tepat waktu</th><th class="num">Respon rata-rata</th><th class="num">Tanpa revisi</th></tr></thead><tbody>
      ${people.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.total}</td><td class="num">${p.done}</td><td class="num">${pct(p.onTimeRate)}</td><td class="num">${esc(L.humanDuration(p.avgResponseMs))}</td><td class="num">${pct(p.firstPassRate)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div></div>`;
}

/* Panel detail Task & Project dengan alamat sendiri (#task/ID, #project/KODE).
 * Laptop: panel di kanan (daftar tetap terlihat); HP: layar penuh; ⤢ = halaman penuh.
 * Back browser / Esc menutup panel atau kembali ke panel sebelumnya.
 * Memakai fungsi & state dari app.js, comments.js, article.js, request.js, brief.js. */
'use strict';

const DP = { open: false, route: null, trail: [], pushed: 0, focus: '', tab: 'active', loadingTeam: false };
const DP_ICON = {
  link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  full: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  side: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
};

function dpEnabled() { return !!(S.cfg && (S.cfg.backend === 'firebase' || S.cfg.demo)); }
function dpParse(h) {
  const m = /^#(task|project)\/(.+)$/.exec(h || '');
  return m ? { kind: m[1], id: decodeURIComponent(m[2]) } : null;
}
function dpHash(kind, id) { return '#' + kind + '/' + encodeURIComponent(id); }
function dpUrl(kind, id) { return location.origin + location.pathname + dpHash(kind, id); }

/** Buka task. opts.focus = 'comments' untuk langsung ke kolom komentar (mis. dari @sebutan). */
function openTask(id, opts) {
  if (!id) return;
  if (!dpEnabled()) return legacyOpenTask(id);
  DP.focus = (opts && opts.focus) || '';
  dpNav(dpHash('task', id));
}
function openProject(code) { if (code && dpEnabled()) dpNav(dpHash('project', code)); }
function dpNav(h) {
  if (location.hash === h) return dpRoute();
  DP.pushed++;
  location.hash = h;   // menambah riwayat: Back menutup / kembali ke panel sebelumnya
}
/** Perilaku lama (versi Sheets): lompat ke baris task di Task Saya. */
function legacyOpenTask(id) {
  if (!S.user || !S.user.sheetName) return;
  S.f.mineTab = 'all'; S.f.mineQ = '';
  go('mine');
  const el = document.getElementById('task-' + id);
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); }
}

function dpRoute() {
  if (!S.user || !dpEnabled()) return;
  const r = dpParse(location.hash);
  if (!r) return dpHide();
  const key = r.kind + ':' + r.id, i = DP.trail.indexOf(key);
  if (i >= 0) DP.trail = DP.trail.slice(0, i + 1); else DP.trail.push(key);
  DP.route = r;
  dpShow();
}
function dpClose() {
  if (!DP.open) return;
  if (DP.pushed > 0) { const n = DP.pushed; DP.pushed = 0; history.go(-n); }
  else { history.replaceState(null, '', location.pathname + location.search); dpHide(); }
}
function dpBack() { if (DP.pushed > 0) { DP.pushed--; history.back(); } else dpClose(); }
function dpHide() {
  const root = $('#dp-root'); if (root) root.innerHTML = '';
  document.body.classList.remove('dp-open');
  if (DP.open && CM && CM.panel) CM = null;
  DP.open = false; DP.route = null; DP.trail = []; DP.pushed = 0;
}

function dpFull() { try { return localStorage.getItem('pt.dpFull') === '1'; } catch (e) { return false; } }
function dpShell(inner, foot) {
  let root = $('#dp-root');
  if (!root) { root = document.createElement('div'); root.id = 'dp-root'; document.body.appendChild(root); }
  const r = DP.route, prev = DP.trail.length > 1 ? DP.trail[DP.trail.length - 2] : '';
  const prevLbl = prev.startsWith('project:') ? 'Project ' + prev.slice(8) : prev ? 'Kembali' : '';
  root.innerHTML = `<div class="dp-ov" data-dpclose></div>
    <aside class="dp ${dpFull() ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${r.kind === 'task' ? 'Detail task' : 'Detail project'}">
      <div class="dp-top">
        ${prevLbl ? `<button type="button" class="dp-backbtn" data-dpback>${DP_ICON.back}${esc(prevLbl)}</button>` : `<span class="dp-crumb">${r.kind === 'task' ? 'Task' : 'Project'}</span>`}
        <span class="dp-sp"></span>
        <button type="button" class="dp-ib" data-dpcopy title="Salin link" aria-label="Salin link">${DP_ICON.link}</button>
        <button type="button" class="dp-ib dp-fullbtn" data-dpfull title="${dpFull() ? 'Tampilkan sebagai panel' : 'Buka di halaman penuh'}" aria-label="Ubah ukuran">${dpFull() ? DP_ICON.side : DP_ICON.full}</button>
        <button type="button" class="dp-ib" data-dpclose title="Tutup (Esc)" aria-label="Tutup">${DP_ICON.x}</button>
      </div>
      <div class="dp-body" id="dp-body">${inner}</div>
      ${foot || ''}
    </aside>`;
  document.body.classList.add('dp-open');
  $$('[data-dpclose]', root).forEach((b) => b.onclick = dpClose);
  const back = $('[data-dpback]', root); if (back) back.onclick = dpBack;
  $('[data-dpcopy]', root).onclick = async () => {
    try { await navigator.clipboard.writeText(dpUrl(r.kind, r.id)); toast('Link disalin'); } catch (e) { toast('Link: ' + dpUrl(r.kind, r.id)); }
  };
  $('[data-dpfull]', root).onclick = () => { try { localStorage.setItem('pt.dpFull', dpFull() ? '0' : '1'); } catch (e) { /* abaikan */ } dpShow(); };
  return root;
}

function dpShow() {
  if (!DP.route) return;
  if (DP.route.kind === 'task') dpTaskView(); else dpProjectView();
}
/** Dipanggil app.js setiap kali tampilan diperbarui (data baru, simpan, dsb.). */
function dpRefresh() {
  if (!DP.open || !DP.route) return;
  if (DP.route.kind === 'project') return dpProjectView();
  const t = dpTaskOf(DP.route.id), top = $('#dp-task');
  if (!t || !top) return dpTaskView();
  const scroll = $('#dp-body').scrollTop;
  top.innerHTML = dpTaskTop(t); dpBindTop(t);
  $('#dp-body').scrollTop = scroll;
  if (CM && CM.panel && CM.taskId === t.id) dpLoadComments(t.id);
}

// ---------- data ----------
function dpTasks() {
  const seen = new Set(), out = [];
  [S.all && S.all.tasks, S.mine && S.mine.tasks, S.team && S.team.tasks].forEach((list) => (list || []).forEach((t) => { if (t.id && !seen.has(t.id)) { seen.add(t.id); out.push(t); } }));
  return out;
}
function dpTaskOf(id) { return dpTasks().find((t) => t.id === id) || null; }
function dpProjects() { return (S.all && S.all.projects) || (S.mine && S.mine.projects) || []; }
function dpProjectOf(code) { return dpProjects().find((p) => p.code === code) || null; }
function dpUser(un) {
  const list = (S.all && S.all.users) || (S.team && (S.team.org || S.team.users)) || [];
  return list.find((u) => u.username === un) || null;
}
async function dpEnsureTeam() {
  if (S.all || S.team || DP.loadingTeam || typeof loadTeam !== 'function') return false;
  DP.loadingTeam = true;
  try { await loadTeam(); return true; } catch (e) { return false; } finally { DP.loadingTeam = false; }
}
function dpMissing(what) {
  dpShell(`<div class="dp-missing"><b>${what} tidak ditemukan</b><span>Mungkin sudah dihapus, atau Anda tidak punya akses.</span></div>`);
  DP.open = true;
}

// ---------- TASK ----------
function dpTaskView() {
  const id = DP.route.id, t = dpTaskOf(id);
  if (!t) {
    if (!S.all && !S.team) { dpShell('<div class="loading">Memuat task…</div>'); DP.open = true; dpEnsureTeam().then(() => { if (DP.route && DP.route.id === id) dpTaskView(); }); return; }
    return dpMissing('Task');
  }
  const foot = `<form class="cm-compose dp-compose" id="cm-form">
      <div class="cm-input"><textarea id="cm-text" rows="1" maxlength="2000" placeholder="Tulis komentar… ketik @ untuk menyebut"></textarea><div class="cm-pop hidden" id="cm-pop" role="listbox"></div></div>
      <button class="btn primary" id="cm-send" type="submit">Kirim</button></form>`;
  const body = `<div id="dp-task">${dpTaskTop(t)}</div>
    <section class="dp-sec"><h3>Linimasa</h3><ul class="dp-tl" id="dp-tl"><li class="muted">Memuat…</li></ul></section>
    <section class="dp-sec" id="dp-cm"><h3>Komentar <span class="n" id="dp-cmn"></span></h3><div class="cm-thread dp-thread" id="cm-thread"><div class="loading">Memuat komentar…</div></div></section>`;
  const root = dpShell(body, foot);
  DP.open = true;
  dpBindTop(t);
  CM = { taskId: t.id, data: null, mentions: new Set(), task: t, panel: true };
  cmBindCompose();
  const ta = $('#cm-text');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; });
  root.onkeydown = (e) => { if (e.key === 'Escape' && $('#cm-pop') && $('#cm-pop').classList.contains('hidden') && !$('#modal-root').innerHTML) { e.stopPropagation(); dpClose(); } };
  dpLoadComments(t.id).then(() => {
    if (DP.focus === 'comments') {
      const sec = $('#dp-cm'); if (sec) sec.scrollIntoView({ block: 'start' });
      if (!matchMedia('(max-width: 760px)').matches) ta.focus();
    }
    DP.focus = '';
  });
}

function dpLoadComments(id) {
  return api.call('comments', { taskId: id }).then((d) => { if (CM && CM.panel && CM.taskId === id) cmRender(d); })
    .catch((e) => { const el = $('#cm-thread'); if (el && CM && CM.taskId === id) el.innerHTML = `<div class="error">${esc(cleanErr(e))}</div>`; });
}

function dpWhen(d) { return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : '–'; }
function dpTaskTop(t) {
  const sc = L.schedule(t), w = whenInfo(t), art = L.isArticle(t), req = L.isRequest(t), done = L.isDone(t);
  const u = dpUser(t.owner), pos = (u && u.position) || (typeof posOf === 'function' ? posOf(t.owner) : '');
  const proj = t.code ? dpProjectOf(t.code) : null;
  const prio = String(t.priority || '');
  const typeChip = art ? artStageChip(t) : req ? '<span class="chip info">Request</span>' : t.type === 'Sosmed' ? '<span class="chip info">Sosmed</span>' : '';
  const wcls = { bad: 'bad', warn: 'warn', good: 'good', info: 'info', review: 'review' }[w.cls] || '';
  const list = resultsOf(t), note = String(t.resultNote || '').trim();
  const links = list.map((x) => dpLink(x.label, x.url)).join('') + (t.liveUrl ? dpLink('Artikel live', t.liveUrl) : '') + (t.aiCheckUrl ? dpLink('Hasil cek AI', t.aiCheckUrl) : '');
  const brief = typeof briefOf === 'function' ? briefOf(t.id) : null;
  return `
    <h1 class="dp-title">${esc(String(t.task).replace(/^https?:\/\/(www\.)?/, ''))}</h1>
    <div class="dp-chips">${art ? '' : statusChip(t.status)}${typeChip}${prio ? priorityChip(prio) : ''}${t.repeat ? `<span class="chip">↻ ${esc(repeatLabel(t.repeat, t.startDate))}</span>` : ''}${t.leaveDays && !done ? `<span class="chip warn">Deadline +${t.leaveDays} hari kerja (cuti)</span>` : ''}</div>
    ${isUrl(t.task) ? `<a class="dp-url" href="${esc(t.task)}" target="_blank" rel="noopener noreferrer">${esc(t.task)} ↗</a>` : ''}
    <div class="dp-meta">
      <div><span class="k">Penanggung jawab</span><span class="v"><span class="avatar dp-av">${initials(t.ownerName || t.owner)}</span><span class="dp-vt">${esc(t.ownerName || t.owner || '–')}${pos ? `<small>${esc(pos)}</small>` : ''}</span></span></div>
      <div><span class="k">Deadline</span><span class="v"><span class="dp-vt">${esc(dpWhen(sc.end))}<small class="w-${wcls}">${esc(w.main)}</small></span></span></div>
      <div><span class="k">Mulai</span><span class="v">${esc(dpWhen(sc.start))}</span></div>
      <div><span class="k">Project</span><span class="v">${t.code ? `<button type="button" class="dp-plink" data-dpproj="${esc(t.code)}"><span class="chip code">${esc(t.code)}</span> ${esc(proj ? proj.project : projectName(t.code) || '')}</button>` : '<span class="muted">Tanpa project</span>'}</span></div>
    </div>
    <div class="dp-act">${dpActions(t)}</div>
    ${t.notes ? `<section class="dp-sec"><h3>Catatan</h3><div class="dp-notes">${esc(t.notes)}</div></section>` : ''}
    <section class="dp-sec"><h3>Hasil kerja ${list.length ? `<span class="n">${list.length}</span>` : ''}</h3>
      ${note ? `<div class="dp-rnote">${esc(note)}</div>` : ''}
      ${links || (note ? '' : '<p class="muted small dp-empty">Belum ada link hasil kerja.</p>')}
      ${canEditResults(t) ? `<button type="button" class="btn sm ghost" data-res="${esc(t.id)}">${list.length || note ? 'Ubah hasil kerja' : '+ Tambah hasil kerja'}</button>` : ''}
    </section>
    ${brief ? `<section class="dp-sec"><h3>${brief.type === 'Request' ? 'Request' : 'Brief'}</h3><div class="dp-brief">${briefChips(t, true)}</div></section>` : ''}`;
}
function dpLink(label, url) {
  const k = resKind(url);
  return `<a class="dp-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="res-ico" style="color:${k.color}">${k.ico}</span><b>${esc(label || k.name)}</b><span>${esc(url.replace(/^https?:\/\/(www\.)?/, ''))}</span><i aria-hidden="true">↗</i></a>`;
}

/** Tombol aksi sesuai peran: anggota (pemilik), admin, atau hanya lihat. */
function dpActions(t) {
  if (!t.id || String(t.id).startsWith('tmp-')) return '<span class="muted small">Menyimpan…</span>';
  const admin = S.user.role === 'admin', mine = t.owner === S.user.username, ro = !(admin || mine);
  const done = L.isDone(t), art = L.isArticle(t), req = L.isRequest(t), id = esc(t.id);
  const out = [];
  if (art) {
    if (admin && L.REVIEW_STAGES.includes(artStage(t))) out.push(`<button class="btn" data-dpret="${id}">Kembalikan</button><button class="btn primary" data-dpapp="${id}">${esc(artApproveLabel(t))}</button>`);
    else out.push(artActions(t, ro));
  } else if (req) out.push(reqTaskCtrl(t, ro));
  else {
    if (t.status === 'Review' && admin) out.push(`<button class="btn" data-dpret="${id}">Kembalikan</button><button class="btn primary" data-dpapp="${id}">Setujui</button>`);
    else if (t.status === 'Review') out.push(`<span class="art-wait">${HOURGLASS_SVG}Menunggu review admin</span>`);
    else if (!ro && !done) {
      if (['Backlog', 'Hold'].includes(t.status)) out.push(`<button class="btn primary" data-st="On-Progress" data-id="${id}">Mulai</button>`);
      else if (t.status === 'On-Progress') out.push(admin ? `<button class="btn primary" data-st="Done" data-id="${id}">Tandai selesai</button>` : `<button class="btn primary" data-st="Review" data-id="${id}">Ajukan review</button>`);
      if (t.status === 'On-Progress') out.push(`<button class="btn" data-st="Hold" data-id="${id}">Hold</button>`);
    } else if (done && admin) out.push(`<button class="btn" data-st="On-Progress" data-id="${id}">Buka lagi</button>`);
    else if (done) out.push('<span class="chip good">Selesai</span>');
  }
  if (admin) out.push('<span class="dp-sp"></span>' + `<button class="btn" data-dpedit="${id}">Edit</button>`);
  return out.join('');
}
function dpBindTop(t) {
  const root = $('#dp-task'); if (!root) return;
  bindTaskRows(root);
  $$('[data-dpproj]', root).forEach((b) => b.onclick = () => openProject(b.dataset.dpproj));
  $$('[data-dpapp]', root).forEach((b) => b.onclick = () => decideReview(b.dataset.dpapp, 'approve'));
  $$('[data-dpret]', root).forEach((b) => b.onclick = () => returnModal(b.dataset.dpret));
  $$('[data-dpedit]', root).forEach((b) => b.onclick = () => { const x = (S.all && S.all.tasks.find((y) => y.id === b.dataset.dpedit)) || t; taskModal(x); });
}

/** Linimasa (catatan sistem) & komentar dipisah saat utas tampil di panel task. */
function dpRenderThread(d) {
  const sys = d.comments.filter((c) => c.kind === 'sys'), user = d.comments.filter((c) => c.kind !== 'sys');
  const t = CM.task || dpTaskOf(CM.taskId) || {};
  const sc = L.schedule(t);
  const tone = (c) => c.tone === 'approve' ? 'g' : c.tone === 'return' ? 'b' : /review|mengajukan/i.test(c.text) ? 'r' : /mulai/i.test(c.text) ? 'i' : '';
  const items = sys.slice().reverse().map((c) => `<li class="${tone(c)}"><span><b>${esc(c.authorName)}</b> ${linkify(c.text)}</span><small>${esc(cmWhen(c.createdAt))}</small></li>`);
  if (sc.start || sc.end) items.push(`<li><span>Dijadwalkan ${esc(sc.start ? dpWhen(sc.start) : '')}${sc.end ? ' → ' + esc(dpWhen(sc.end)) : ''}</span><small>${esc(t.ownerName || '')}</small></li>`);
  const tl = $('#dp-tl'); if (tl) tl.innerHTML = items.join('') || '<li class="muted">Belum ada aktivitas.</li>';
  const n = $('#dp-cmn'); if (n) n.textContent = user.length ? String(user.length) : '';
  return user;
}

// ---------- PROJECT ----------
function dpProjectView() {
  const code = DP.route.id, p = dpProjectOf(code);
  if (CM && CM.panel) CM = null;
  if (!p) return dpMissing('Project');
  if (!S.all && !S.team && !DP.loadingTeam) dpEnsureTeam().then((ok) => { if (ok && DP.route && DP.route.id === code) dpProjectView(); });
  const tasks = dpTasks().filter((t) => t.code === code);
  const done = tasks.filter(L.isDone), active = tasks.filter((t) => !L.isDone(t));
  const evals = done.map((t) => L.evaluate(t).outcome).filter(Boolean);
  const onTime = evals.length ? Math.round(evals.filter((o) => o !== 'late').length / evals.length * 100) + '%' : '–';
  const count = (f) => tasks.filter(f).length;
  const people = Object.values(tasks.reduce((m, t) => { const k = t.owner || '?'; (m[k] = m[k] || { name: t.ownerName || k, n: 0, all: 0 }).all++; if (!L.isDone(t)) m[k].n++; return m; }, {}))
    .sort((a, b) => b.n - a.n || b.all - a.all);
  const tab = DP.tab, list = (tab === 'done' ? done : tab === 'all' ? tasks : active)
    .slice().sort((a, b) => (L.bucket(a) === 'overdue' ? -1 : 0) - (L.bucket(b) === 'overdue' ? -1 : 0) || (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity));
  const admin = S.user.role === 'admin', pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  const period = [p.start ? fmtIso(p.start) : '', p.end ? fmtIso(p.end) : ''].filter(Boolean).join(' – ');
  const chipFor = (t) => L.isDone(t) ? '<span class="chip good">Done</span>' : L.bucket(t) === 'overdue' ? '<span class="chip bad">Terlambat</span>' : L.isArticle(t) ? artStageChip(t) : statusChip(t.status);
  const sub = (t) => { const sc = L.schedule(t); return esc(t.ownerName || t.owner) + (sc.end ? ' · deadline ' + esc(fmtD(sc.end)) : ''); };
  dpShell(`
    <h1 class="dp-title"><span class="chip code">${esc(p.code)}</span> ${esc(p.project)}</h1>
    <div class="dp-chips">${statusChip(p.status)}${p.priority ? priorityChip(p.priority) : ''}${period ? `<span class="chip">${esc(period)}</span>` : ''}${p.pic ? `<span class="chip">PIC: ${esc(p.pic)}</span>` : ''}</div>
    <section class="dp-sec"><div class="dp-progh"><b>Progres</b><span class="muted small">${done.length} dari ${tasks.length} task selesai · ${pct}%</span></div><div class="dp-prog"><i style="width:${pct}%"></i></div></section>
    <div class="dp-tiles">
      <div class="dp-tile"><b>${count((t) => t.status === 'On-Progress')}</b><span>Berjalan</span></div>
      <div class="dp-tile"><b style="color:var(--review)">${count((t) => t.status === 'Review')}</b><span>Menunggu review</span></div>
      <div class="dp-tile"><b style="color:var(--bad)">${count((t) => L.bucket(t) === 'overdue')}</b><span>Terlambat</span></div>
      <div class="dp-tile"><b style="color:var(--good)">${onTime}</b><span>Tepat waktu</span></div>
    </div>
    ${people.length ? `<section class="dp-sec"><h3>Anggota <span class="n">${people.length}</span></h3><div class="dp-people">${people.map((x) => `<span class="dp-person"><span class="avatar dp-av">${initials(x.name)}</span>${esc(x.name)}<em>${x.n ? x.n + ' aktif' : x.all + ' task'}</em></span>`).join('')}</div></section>` : ''}
    <section class="dp-sec"><h3>Task</h3>
      <div class="dp-tabs" role="tablist">${[['active', 'Aktif', active.length], ['done', 'Selesai', done.length], ['all', 'Semua', tasks.length]].map(([k, l, n]) => `<button type="button" role="tab" class="${tab === k ? 'on' : ''}" data-dptab="${k}" aria-selected="${tab === k}">${l} <span>${n}</span></button>`).join('')}
        <span class="dp-sp"></span>${admin ? '<button class="btn sm" id="dp-newt">+ Task</button><button class="btn sm" id="dp-editp">Edit project</button>' : ''}</div>
      ${list.length ? list.map((t) => `<button type="button" class="dp-tr" data-dptask="${esc(t.id)}">${chipFor(t)}<span class="t"><b>${esc(String(t.task).replace(/^https?:\/\/(www\.)?/, ''))}</b><small>${sub(t)}</small></span><span class="go" aria-hidden="true">›</span></button>`).join('')
        : `<p class="muted small dp-empty">${tab === 'done' ? 'Belum ada task selesai.' : tab === 'active' ? 'Tidak ada task aktif.' : 'Belum ada task di project ini.'}</p>`}
    </section>`);
  DP.open = true;
  const root = $('#dp-root');
  root.onkeydown = (e) => { if (e.key === 'Escape' && !$('#modal-root').innerHTML) { e.stopPropagation(); dpClose(); } };
  $$('[data-dptab]', root).forEach((b) => b.onclick = () => { DP.tab = b.dataset.dptab; dpProjectView(); });
  $$('[data-dptask]', root).forEach((b) => b.onclick = () => openTask(b.dataset.dptask));
  if ($('#dp-newt', root)) $('#dp-newt', root).onclick = () => taskModal(taskFromProject(p), true);
  if ($('#dp-editp', root)) $('#dp-editp', root).onclick = () => projectModal(p);
}

// ---------- titik masuk ----------
window.addEventListener('hashchange', dpRoute);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !DP.open || $('#modal-root').innerHTML) return;
  const pop = $('#cm-pop'); if (pop && !pop.classList.contains('hidden')) return;
  dpClose();
});
// Klik baris task / project di mana pun membuka panel (kecuali tombol, link, dan isian di baris itu)
document.addEventListener('click', (e) => {
  if (!dpEnabled() || !S.user || !e.target.closest) return;
  if (e.target.closest('a, button, select, input, textarea, label, .res-chip, .pick-col, #dp-root, #modal-root')) return;
  const pr = e.target.closest('[data-pcode]');
  if (pr && pr.dataset.pcode) return openProject(pr.dataset.pcode);
  const row = e.target.closest('[data-tid], .trow[id^="task-"], .rv-row[id^="task-"]');
  if (!row) return;
  const id = row.dataset.tid || row.id.replace(/^task-/, '');
  if (id && !id.startsWith('tmp-')) openTask(id);
});

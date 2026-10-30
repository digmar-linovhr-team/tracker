/* Komentar per task: penanda 💬 di baris task + panel utas (samping di desktop, layar penuh di HP).
 * Jumlah komentar ikut data utama (ringan); isi utas dimuat saat panel dibuka. Tanda "baru" disimpan per perangkat.
 * Memakai fungsi & state dari app.js. */
'use strict';

const CM_SEEN_KEY = 'pt.cseen';
let CM = null;   // panel yang sedang terbuka: { taskId, data, mentions:Set, busy }

function cmSeen() { try { return JSON.parse(localStorage.getItem(CM_SEEN_KEY) || '{}'); } catch (e) { return {}; } }
function cmMarkSeen(taskId, iso) {
  try { const m = cmSeen(); m[taskId] = iso || new Date().toISOString(); localStorage.setItem(CM_SEEN_KEY, JSON.stringify(m)); } catch (e) { /* abaikan */ }
}
function cmCounts() { return S.ccount || {}; }
function cmTask(id) {
  return ((S.all && S.all.tasks) || []).concat(S.mine ? S.mine.tasks : [], (S.team && S.team.tasks) || []).find((t) => t.id === id) || null;
}
/** Penanda komentar untuk baris task. */
function cmChip(t) {
  if (!t || !t.id || String(t.id).startsWith('tmp-')) return '';
  const c = cmCounts()[t.id], me = S.user && S.user.username;
  if (!c || !c.n) return `<button type="button" class="cm-chip empty" data-cm="${esc(t.id)}" title="Tulis komentar" aria-label="Komentar">${CM_ICON}0</button>`;
  const seen = cmSeen()[t.id] || '';
  const fresh = c.by !== me && c.last && c.last > seen;
  return `<button type="button" class="cm-chip ${fresh ? 'new' : ''}" data-cm="${esc(t.id)}" title="${c.n} komentar${fresh ? ' · ada yang baru' : ''}" aria-label="${c.n} komentar">${fresh ? '<i class="cm-dot"></i>' : CM_ICON}${c.n}${fresh ? ' · baru' : ''}</button>`;
}
const CM_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

function cmWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const now = new Date(), min = Math.round((now - d) / 6e4);
  if (min < 1) return 'baru saja';
  if (min < 60) return min + ' mnt lalu';
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return 'hari ini ' + hm;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'kemarin ' + hm;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}
function cmText(text, people) {
  let h = linkify(text);
  (people || []).slice().sort((a, b) => b.name.length - a.name.length).forEach((p) => {
    const at = '@' + esc(p.name);
    h = h.split(at).join(`<span class="cm-mention">${at}</span>`);
  });
  return h;
}

function openComments(taskId) {
  if (typeof dpEnabled === 'function' && dpEnabled()) return openTask(taskId, { focus: 'comments' });
  const t = cmTask(taskId);
  CM = { taskId, data: null, mentions: new Set(), task: t };
  let root = $('#cm-root');
  if (!root) { root = document.createElement('div'); root.id = 'cm-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="cm-overlay" data-cmclose></div>
    <aside class="cm-panel" role="dialog" aria-modal="true" aria-label="Komentar task">
      <header class="cm-head"><div class="cm-head-t"><b>${t ? prettyTitle(t.task) : 'Komentar'}</b><small>${t ? esc(t.ownerName || '') : ''}</small></div><button class="x" data-cmclose aria-label="Tutup">×</button></header>
      <div class="cm-thread" id="cm-thread"><div class="loading">Memuat komentar…</div></div>
      <form class="cm-compose" id="cm-form">
        <div class="cm-input"><textarea id="cm-text" rows="2" maxlength="2000" placeholder="Tulis komentar… ketik @ untuk menyebut"></textarea><div class="cm-pop hidden" id="cm-pop" role="listbox"></div></div>
        <button class="btn primary" id="cm-send" type="submit">Kirim</button>
      </form>
    </aside>`;
  document.body.classList.add('cm-open');
  $$('[data-cmclose]', root).forEach((b) => b.onclick = closeComments);
  root.onkeydown = (e) => { if (e.key === 'Escape' && $('#cm-pop').classList.contains('hidden')) closeComments(); };
  cmBindCompose();
  setTimeout(() => { const ta = $('#cm-text'); if (ta && !matchMedia('(max-width: 760px)').matches) ta.focus(); }, 50);
  api.call('comments', { taskId }).then((d) => { if (CM && CM.taskId === taskId) cmRender(d); })
    .catch((e) => { if (CM && CM.taskId === taskId) $('#cm-thread').innerHTML = `<div class="error">${esc(cleanErr(e))}</div>`; });
}
function closeComments() {
  const root = $('#cm-root'); if (root) root.innerHTML = '';
  document.body.classList.remove('cm-open');
  CM = null;
  softRender();
}

function cmRender(d) {
  CM.data = d;
  const user = d.comments.filter((c) => c.kind === 'user');
  const last = user.length ? user[user.length - 1].createdAt : '';
  S.ccount = Object.assign({}, S.ccount || {});
  if (user.length) S.ccount[CM.taskId] = { n: user.length, last, by: user[user.length - 1].author };
  else delete S.ccount[CM.taskId];
  cmMarkSeen(CM.taskId, new Date().toISOString());
  const el = $('#cm-thread'); if (!el) return;
  const shown = CM.panel && typeof dpRenderThread === 'function' ? dpRenderThread(d) : d.comments;
  if (CM.panel && !shown.length) { el.innerHTML = '<div class="cm-empty dp-cmempty"><span>Belum ada komentar. Tanyakan sesuatu atau sebut rekan dengan @nama.</span></div>'; return; }
  if (!d.comments.length) { el.innerHTML = '<div class="cm-empty"><b>Belum ada komentar</b><span>Tanyakan sesuatu, beri masukan, atau sebut rekan dengan @nama. Catatan review & perubahan status juga muncul di sini.</span></div>'; return; }
  el.innerHTML = shown.map((c) => c.kind === 'sys'
    ? `<div class="cm-sys ${esc(c.tone || '')}"><span><b>${esc(c.authorName)}</b> ${linkify(c.text)}</span><time>${esc(cmWhen(c.createdAt))}</time></div>`
    : `<div class="cm-msg ${c.author === S.user.username ? 'mine' : ''}" data-cid="${esc(c.id)}">
        <span class="avatar">${initials(c.authorName)}</span>
        <div class="cm-body"><div class="cm-meta"><b>${esc(c.authorName)}</b><time>${esc(cmWhen(c.createdAt))}${c.editedAt ? ' · diedit' : ''}</time>
          ${c.canEdit ? `<button type="button" class="cm-act" data-cmedit="${esc(c.id)}">Ubah</button>` : ''}${c.canDelete ? `<button type="button" class="cm-act" data-cmdel="${esc(c.id)}">Hapus</button>` : ''}</div>
          <div class="cm-txt">${cmText(c.text, d.people)}</div></div></div>`).join('');
  if (!CM.panel) el.scrollTop = el.scrollHeight;
  $$('[data-cmdel]', el).forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Hapus komentar?', 'Komentar ini akan dihapus dari utas.', 'Hapus'))) return;
    try { cmRender(await busy(b, () => api.call('commentDelete', { id: b.dataset.cmdel }))); } catch (e) { /* busy menampilkan pesan */ }
  });
  $$('[data-cmedit]', el).forEach((b) => b.onclick = () => cmEdit(b.dataset.cmedit));
}

function cmEdit(id) {
  const c = CM.data.comments.find((x) => x.id === id); if (!c) return;
  const box = $(`[data-cid="${id}"] .cm-txt`);
  box.innerHTML = `<textarea class="cm-edit" rows="3" maxlength="2000">${esc(c.text)}</textarea><div class="cm-edit-act"><button type="button" class="btn sm" data-x>Batal</button><button type="button" class="btn sm primary" data-ok>Simpan</button></div>`;
  const ta = $('textarea', box); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  $('[data-x]', box).onclick = () => cmRender(CM.data);
  $('[data-ok]', box).onclick = async () => {
    const v = ta.value.trim(); if (!v) return ta.focus();
    try { cmRender(await busy($('[data-ok]', box), () => api.call('commentEdit', { id, text: v }))); } catch (e) { /* pesan dari busy */ }
  };
}

function cmPeople() {
  if (CM && CM.data && CM.data.people) return CM.data.people;
  const src = (S.all && S.all.users) || (S.team && (S.team.org || S.team.users)) || [];
  return src.filter((u) => u.active !== false && !u.orgOnly).map((u) => ({ username: u.username, name: u.name, position: u.position || '' }));
}
function cmBindCompose() {
  const f = $('#cm-form'), ta = $('#cm-text'), pop = $('#cm-pop');
  let items = [], idx = 0, start = -1;
  const hide = () => { pop.classList.add('hidden'); items = []; start = -1; };
  const pickAt = (i) => {
    const p = items[i]; if (!p) return;
    const pos = ta.selectionStart, before = ta.value.slice(0, start), after = ta.value.slice(pos);
    ta.value = before + '@' + p.name + ' ' + after;
    const caret = (before + '@' + p.name + ' ').length; ta.setSelectionRange(caret, caret);
    CM.mentions.add(p.username); hide(); ta.focus();
  };
  const draw = () => {
    pop.innerHTML = items.map((p, i) => `<button type="button" role="option" class="${i === idx ? 'on' : ''}" data-i="${i}"><span class="avatar">${initials(p.name)}</span><span><b>${esc(p.name)}</b>${p.position ? `<small>${esc(p.position)}</small>` : ''}</span></button>`).join('');
    pop.classList.toggle('hidden', !items.length);
    $$('button', pop).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pickAt(Number(b.dataset.i)); });
  };
  ta.addEventListener('input', () => {
    const pos = ta.selectionStart, upto = ta.value.slice(0, pos), m = upto.match(/(^|\s)@([^\s@]{0,20})$/);
    if (!m) return hide();
    start = pos - m[2].length - 1;
    const q = m[2].toLowerCase(), me = S.user.username;
    items = cmPeople().filter((p) => p.username !== me && (p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(' ' + q) || p.username.startsWith(q))).slice(0, 6);
    idx = 0; draw();
  });
  ta.addEventListener('keydown', (e) => {
    if (!pop.classList.contains('hidden') && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; draw(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; draw(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickAt(idx); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); f.requestSubmit(); }
  });
  ta.addEventListener('blur', () => setTimeout(hide, 150));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim(); if (!text) return ta.focus();
    const people = cmPeople(), mentions = [...CM.mentions].filter((un) => { const p = people.find((x) => x.username === un); return p && text.includes('@' + p.name); });
    try {
      const d = await busy($('#cm-send'), () => api.call('commentAdd', { taskId: CM.taskId, text, mentions }));
      ta.value = ''; CM.mentions.clear(); cmRender(d);
      if (mentions.length) toast(`Terkirim · ${mentions.length === 1 ? (people.find((p) => p.username === mentions[0]) || {}).name : mentions.length + ' orang'} diberi tahu`);
    } catch (err) { /* pesan dari busy */ }
  };
}

// Klik penanda komentar di mana pun (capture: tidak ikut membuka baris/edit task)
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-cm]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  openComments(b.dataset.cm);
}, true);

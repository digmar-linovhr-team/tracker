/* Lonceng notifikasi (versi Firebase): daftar notifikasi realtime + tanda belum dibaca.
 * Notifikasi baru juga muncul sebagai notifikasi browser (lihat pt-web.js) dan push untuk @sebutan saat aplikasi tertutup.
 * Memakai fungsi & state dari app.js. */
'use strict';

const NB_ICON = { mention: '@', assign: '＋', review: '⏳', returned: '↩', approved: '✓', request: '✉', leave: '🌴', sched: '🗓' };
let NB = { list: [], open: false };

function bellEnabled() { return S.cfg && S.cfg.backend === 'firebase' && !S.cfg.demo; }
async function bellLoad() {
  if (!bellEnabled()) return;
  try { NB.list = (await api.call('notifications')).notifications || []; } catch (e) { NB.list = []; }
  bellDraw();
}
function bellUnread() { return NB.list.filter((n) => !n.read).length; }
function bellDraw() {
  const wrap = $('#nb-wrap'); if (!wrap) return;
  wrap.classList.toggle('hidden', !bellEnabled());
  const c = bellUnread(), cnt = $('#nb-count');
  cnt.textContent = c > 9 ? '9+' : String(c); cnt.classList.toggle('hidden', !c);
  $('#btn-bell').setAttribute('aria-label', c ? `Notifikasi, ${c} belum dibaca` : 'Notifikasi');
  if (NB.open) bellPanel();
}
function bellPanel() {
  const p = $('#nb-panel');
  const list = NB.list;
  p.innerHTML = `<div class="nb-head"><b>Notifikasi</b>${bellUnread() ? '<button class="linkbtn" id="nb-all">Tandai semua dibaca</button>' : ''}</div>
    <div class="nb-list">${list.length ? list.map((n) => `<button type="button" class="nb-item ${n.read ? '' : 'unread'}" data-nid="${esc(n.id)}">
      <span class="nb-ic nb-${esc(n.type)}" aria-hidden="true">${NB_ICON[n.type] || '•'}</span>
      <span class="nb-txt"><span>${esc(n.text || '')}</span><small>${esc(cmWhen(n.createdAt))}</small></span>
      ${n.read ? '' : '<i class="nb-dot" aria-label="belum dibaca"></i>'}</button>`).join('')
      : '<div class="nb-empty">Belum ada notifikasi. @sebutan, review, request, dan keputusan cuti akan muncul di sini.</div>'}</div>`;
  if ($('#nb-all', p)) $('#nb-all', p).onclick = async () => { NB.list.forEach((n) => { n.read = true; }); bellDraw(); try { await api.call('notifRead', { all: true }); } catch (e) { /* abaikan */ } };
  $$('[data-nid]', p).forEach((b) => b.onclick = async () => {
    const n = NB.list.find((x) => x.id === b.dataset.nid); if (!n) return;
    bellToggle(false);
    if (!n.read) { n.read = true; bellDraw(); api.call('notifRead', { ids: [n.id] }).catch(() => {}); }
    bellOpen(n);
  });
}
function bellOpen(n) {
  if (n.taskId && typeof dpEnabled === 'function' && dpEnabled()) return openTask(n.taskId, { focus: n.type === 'mention' ? 'comments' : '' });
  if (n.type === 'mention' && n.taskId && typeof openComments === 'function') return openComments(n.taskId);
  if (n.view) return go(n.view);
  if (n.taskId) {
    const t = (S.mine.tasks || []).find((x) => x.id === n.taskId);
    if (t) { S.f.mineTab = 'all'; S.f.mineQ = ''; go('mine'); setTimeout(() => { const el = document.getElementById('task-' + n.taskId); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); } }, 80); return; }
    if (typeof openComments === 'function') openComments(n.taskId);
  }
}
function bellToggle(open) {
  NB.open = open === undefined ? !NB.open : open;
  $('#nb-panel').classList.toggle('hidden', !NB.open);
  $('#btn-bell').setAttribute('aria-expanded', String(NB.open));
  if (NB.open) bellPanel();
}
let bellBound = false;
function bellInit() {
  if (!$('#nb-wrap')) return;
  if (!bellBound) {
    bellBound = true;
    api.on('notif:new', () => bellLoad());
    api.on('data:changed', () => { if (bellEnabled()) bellLoad(); });
  }
  $('#btn-bell').onclick = (e) => { e.stopPropagation(); bellToggle(); };
  document.addEventListener('click', (e) => { if (NB.open && !e.target.closest('#nb-wrap')) bellToggle(false); });
  document.addEventListener('keydown', (e) => { if (NB.open && e.key === 'Escape') bellToggle(false); });
  bellLoad();
}

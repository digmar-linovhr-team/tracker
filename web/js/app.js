/* global PTLogic, Chart */
'use strict';
const L = window.PTLogic;

// Pengaman cache: bila CSS lama masih tersimpan (tidak cocok dengan versi kode ini), muat ulang CSS yang benar.
const CSS_VERSION = '2.11.0';
(function ensureFreshCss() {
  const got = getComputedStyle(document.documentElement).getPropertyValue('--pt-css').trim().replace(/"/g, '');
  if (got === CSS_VERSION) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'styles.css?v=' + CSS_VERSION + '&t=' + Date.now();
  document.head.appendChild(link);
})();
const api = window.pt;

const S = {
  cfg: null, user: null, view: 'mine',
  mine: { tasks: [], projects: [] },
  all: null,
  lastSync: null,
  charts: [],
  pending: new Set(),
  bgTimer: null,
  f: {
    mineTab: 'active', mineQ: '',
    period: '30', persons: [],
    tq: '', towners: [], tstatus: 'active', tcodes: [],
    teamQ: '', teamPeople: [], teamTab: 'active', teamCodes: []
  },
  team: null, teamAt: 0
};

const STATUSES = ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUS_DOT = { Backlog: 'var(--muted)', 'On-Progress': 'var(--info)', Review: 'var(--review)', Hold: 'var(--warn)', Done: 'var(--good)', Recurring: 'var(--accent)' };
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  mine: svg('<path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="4"/>'),
  dashboard: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  tasks: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  projects: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
  team: svg('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0"/>'),
  review: svg('<path d="M9 11l2 2 4-4"/><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};
const fsvg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const FB = {
  search: fsvg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  user: fsvg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  folder: fsvg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  status: fsvg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>'),
  chev: fsvg('<path d="M6 9l6 6 6-6"/>')
};
const THEME_ICONS = {
  light: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  dark: svg('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'),
  system: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>')
};
const THEMES = [['light', 'Terang', THEME_ICONS.light], ['dark', 'Gelap', THEME_ICONS.dark], ['system', 'Ikuti sistem', THEME_ICONS.system]];
const REMINDER_OPTS = [[1440, '1 hari sebelum deadline'], [180, '3 jam sebelum'], [60, '1 jam sebelum'], [30, '30 menit sebelum'], [15, '15 menit sebelum']];

// ---------- util ----------
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanErr = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const pad = (n) => String(n).padStart(2, '0');
function fmtD(d) { return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '–'; }
function fmtDT(d) { return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : '–'; }
function fmtS(d) { return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '–'; }
function fmtIso(iso, raw) { if (!iso) return raw || '–'; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
function pct(x) { return x === null || x === undefined ? '–' : Math.round(x * 100) + '%'; }
function initials(n) { return String(n || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase(); }
function isUrl(s) { return /^https?:\/\/\S+$/.test(String(s).trim()); }
function prettyTitle(s) {
  if (!isUrl(s)) return esc(s);
  const u = String(s).trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return `<a href="#" data-ext="${esc(s)}" title="${esc(s)}">${esc(u)}</a>`;
}
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}

async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Memproses…'; }
  try { return await fn(); }
  catch (e) { toast(cleanErr(e), true); throw e; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
}

// ---------- modal ----------
function modal({ title, body, actions, wide, onMount }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal" style="${wide ? 'width:720px' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(title)}</h2><button class="x" data-close aria-label="Tutup">×</button></div>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${actions || '<button class="btn" data-close>Tutup</button>'}</div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', close));
  $('.overlay', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('overlay')) close(); });
  if (onMount) onMount($('.modal', root), close);
  const first = $('input, select, textarea', root); if (first) first.focus();
  return close;
}
function confirmBox(title, text, okLabel = 'Hapus') {
  return new Promise((resolve) => {
    modal({
      title, body: `<p>${esc(text)}</p>`,
      actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="ok">${esc(okLabel)}</button>`,
      onMount: (m, close) => { $('#ok', m).onclick = () => { close(); resolve(true); }; $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => resolve(false))); }
    });
  });
}

// ---------- auth screens ----------
function showAuth(html, onMount) {
  $('#shell').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#auth-body').innerHTML = html;
  if (onMount) onMount();
  const f = $('#auth-body input'); if (f) f.focus();
}

function showSetup() {
  showAuth(`
    <h2>Hubungkan ke server</h2>
    <p>Tempel URL Web App Google Apps Script dari spreadsheet "KPI dan Tracker". Minta URL ini ke admin.</p>
    <div id="err"></div>
    <form id="f">
      <label class="field"><span>URL Web App</span><input name="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.cfg.apiUrl || '')}" required></label>
      <button class="btn primary" style="width:100%">Simpan &amp; lanjut</button>
    </form>
    <p class="small" style="margin-top:16px">Ingin melihat dulu? <button class="linkbtn" id="demo">Coba mode demo</button></p>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#f button');
      try {
        await busy(btn, () => api.setConfig({ apiUrl: e.target.url.value }));
        S.cfg = await api.config(); showLogin();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
    $('#demo').onclick = async () => { await api.setConfig({ demo: true }); S.cfg = await api.config(); showLogin(); };
  });
}

function showLogin() {
  showAuth(`
    <h2>Masuk</h2>
    <p>${S.cfg.demo ? 'Mode demo: username <b>admin</b>, <b>ari</b>, <b>wisnu</b>, dst. Password <b>demo</b>.' : 'Gunakan akun yang diberikan admin.'}</p>
    <div id="err"></div>
    <form id="f">
      <label class="field"><span>Username</span><input name="u" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" style="width:100%">Masuk</button>
    </form>
    <p class="small" style="margin-top:16px">${S.cfg.demo ? '<button class="linkbtn" id="srv">Keluar dari mode demo</button>' : S.cfg.apiLocked ? '' : '<button class="linkbtn" id="srv">Ganti alamat server</button>'}</p>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      $('#err').innerHTML = '';
      try {
        const user = await busy($('#f button'), () => api.login(e.target.u.value.trim(), e.target.p.value));
        S.user = user;
        if (user.mustChange) showChangePw(e.target.p.value); else enterApp();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
    if ($('#srv')) $('#srv').onclick = async () => {
      if (S.cfg.demo) await api.setConfig({ demo: false });
      S.cfg = await api.config();
      if (S.cfg.apiUrl) showLogin(); else showSetup();
    };
  });
}

function showChangePw(oldPw) {
  showAuth(`
    <h2>Buat password baru</h2>
    <p>Ini login pertama Anda. Ganti password sementara dengan password pribadi (minimal 8 karakter).</p>
    <div id="err"></div>
    <form id="f">
      ${oldPw ? '' : '<label class="field"><span>Password sementara</span><input name="o" type="password" required></label>'}
      <label class="field"><span>Password baru</span><input name="n" type="password" minlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>Ulangi password baru</span><input name="n2" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn primary" style="width:100%">Simpan password</button>
    </form>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.n.value !== f.n2.value) { $('#err').innerHTML = '<div class="error">Password baru tidak sama.</div>'; return; }
      try {
        S.user = await busy($('#f button'), () => api.changePassword(oldPw || f.o.value, f.n.value));
        enterApp();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
  });
}

// ---------- app shell ----------
async function enterApp() {
  $('#auth').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  $('#me-name').textContent = S.user.name;
  renderMe();
  $('#me-avatar').textContent = initials(S.user.name);
  $('#demo-tag').innerHTML = S.cfg.demo ? 'Mode demo' : 'Linov<b>HR</b>';
  renderNav();
  const first = S.user.role === 'admin' && !S.user.sheetName ? 'dashboard' : 'mine';
  const cached = readCache();
  if (cached && cached.mine && (S.user.role !== 'admin' || cached.all)) {
    S.mine = cached.mine;
    S.all = cached.all || null;
    S.team = cached.team || null;
    setSyncInfo('Menyinkronkan…');
    go(first);
    if (await loadData(true)) softRender();
  } else {
    $('#view').innerHTML = '<div class="loading">Memuat data…</div>';
    await loadData();
    go(first);
  }
}

function renderMe() {
  $('#me-name').textContent = S.user.name;
  $('#me-role').textContent = S.user.position || (S.user.role === 'admin' ? 'Admin' : 'Anggota tim');
  $('#me-role').title = S.user.position ? S.user.position + (S.user.role === 'admin' ? ' · Admin' : '') : '';
}

function renderNav() {
  const admin = S.user.role === 'admin';
  const overdue = S.mine.tasks.filter((t) => L.bucket(t) === 'overdue').length;
  const items = [];
  if (S.user.sheetName) items.push(['mine', 'Task Saya', 'Task', overdue]);
  items.push(['dashboard', 'Dashboard', 'Laporan']);
  items.push(['team', 'Tim', 'Tim']);
  if (admin) {
    const reviews = S.all ? S.all.tasks.filter((t) => t.status === 'Review').length : 0;
    items.push(['sect', 'Admin'], ['review', 'Review', 'Review', reviews, 'info'], ['tasks', 'Semua Task', 'Semua'], ['projects', 'Project', 'Project', 0, '', 'secondary'], ['users', 'Pengguna', 'Akun', 0, '', 'secondary']);
  }
  items.push(['sect', ''], ['settings', 'Pengaturan', 'Setelan']);
  $('#nav').innerHTML = items.map((i) => i[0] === 'sect'
    ? `<div class="sect">${esc(i[1])}</div>`
    : `<button data-v="${i[0]}" class="${S.view === i[0] ? 'active' : ''} ${i[5] || ''}"><span class="ico">${ICONS[i[0]]}</span><span class="lbl-full">${i[1]}</span><span class="lbl-short">${i[2]}</span>${i[3] ? `<span class="count ${i[4] || ''}" title="${i[4] === 'info' ? 'Menunggu review' : 'Terlambat'}">${i[3]}</span>` : ''}</button>`).join('');
  $$('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
}

// ---------- cache lokal: aplikasi langsung tampil dengan data terakhir ----------
const cacheKey = () => 'pt.cache.' + (S.cfg.demo ? 'demo.' : '') + S.user.username;
function saveCache() {
  try { localStorage.setItem(cacheKey(), JSON.stringify({ at: Date.now(), mine: S.mine, all: S.all, team: S.team })); } catch (e) { /* penyimpanan penuh/diblokir */ }
}
function readCache() {
  try { const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); return c && Date.now() - c.at < 7 * 864e5 ? c : null; } catch (e) { return null; }
}
function resetSession() { S.all = null; S.team = null; S.teamAt = 0; S.mine = { tasks: [], projects: [] }; }
function clearCaches() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('pt.cache.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* abaikan */ }
}
function setSyncInfo(text) { $('#sync-info').textContent = text; }

async function loadData(quiet) {
  try {
    let mine, all;
    if (S.user.role === 'admin') {
      // admin: satu panggilan getAll sudah mencakup task milik sendiri
      all = await api.call('getAll');
      mine = { tasks: all.tasks.filter((t) => t.owner === S.user.username), projects: all.projects };
      if (S.user.sheetName) api.feedTasks(mine.tasks);
      api.feedReviews(all.tasks.filter((t) => t.status === 'Review'));
    } else {
      mine = S.user.sheetName ? await api.call('myTasks') : { tasks: [], projects: [] };
    }
    S.mine = mine;
    const fresh = (mine && mine.me) || (all && all.users.find((u) => u.username === S.user.username));
    if (fresh) { S.user = Object.assign(S.user, fresh); renderMe(); }
    if (all) { S.all = all; if (!S.user.sheetName) S.mine.projects = all.projects; }
    S.lastSync = new Date();
    setSyncInfo('Diperbarui ' + pad(S.lastSync.getHours()) + ':' + pad(S.lastSync.getMinutes()));
    saveCache();
    return true;
  } catch (e) {
    setSyncInfo(S.lastSync ? 'Gagal memperbarui' : '');
    if (!quiet) toast(cleanErr(e), true);
    return false;
  }
}

/** Gambar ulang tampilan aktif tanpa mengganggu (tidak saat form/modal terbuka atau sedang mengetik). */
function softRender() {
  if (!S.user || $('#modal-root').innerHTML || $('#ms-pop')) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox') return;
  go(S.view);
}

/** Muat data terbaru di belakang layar, lalu perbarui tampilan. */
function refreshInBackground(delay) {
  clearTimeout(S.bgTimer);
  S.bgTimer = setTimeout(async () => { if (await loadData(true)) softRender(); }, delay || 0);
}

function go(view) {
  if (S.view !== view) { const m = $('.main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); }
  S.view = view;
  msClose();
  S.charts.forEach((c) => c.destroy()); S.charts = [];
  renderNav();
  const titles = {
    mine: ['Task Saya', 'Task yang menjadi tanggung jawab Anda'],
    dashboard: ['Dashboard', S.user.role === 'admin' ? 'Laporan waktu pengerjaan & performa tim' : 'Laporan performa Anda'],
    tasks: ['Semua Task', 'Kelola dan bagikan task ke anggota tim'],
    projects: ['Project', 'Daftar project dari tab Main Project'],
    users: ['Pengguna', 'Akun login anggota tim'],
    team: ['Tim', 'Task yang sedang dikerjakan semua anggota (hanya lihat)'],
    review: ['Review', 'Task yang diajukan anggota dan menunggu persetujuan Anda'],
    settings: ['Pengaturan', 'Notifikasi, akun, dan koneksi server']
  };
  $('#view-title').textContent = titles[view][0];
  $('#view-sub').textContent = titles[view][1];
  ({ mine: viewMine, dashboard: viewDashboard, team: viewTeam, review: viewReview, tasks: viewTasks, projects: viewProjects, users: viewUsers, settings: viewSettings })[view]();
}

function projectName(code) {
  const list = (S.all && S.all.projects) || S.mine.projects || [];
  const p = list.find((x) => x.code === code);
  return p ? p.project : '';
}

// ---------- status helpers ----------
function statusChip(s) {
  const map = { 'Done': 'good', 'On-Progress': 'info', 'Review': 'accent', 'Hold': 'warn', 'Recurring': 'accent' };
  return `<span class="chip ${map[s] || ''}">${esc(s || 'Backlog')}</span>`;
}
function priorityChip(p) {
  if (!p) return '';
  const map = { High: 'bad', Medium: 'warn', Low: '' };
  return `<span class="chip ${map[p] || ''}">${p === 'High' ? '▲ ' : p === 'Low' ? '▽ ' : '■ '}${esc(p)}</span>`;
}
function outcomeChip(t) {
  const e = L.evaluate(t);
  switch (e.outcome) {
    case 'over': return `<span class="chip good" title="Selesai sebelum deadline dengan ≤80% waktu rencana">★ Overperforming</span>`;
    case 'ontime': return `<span class="chip info">✓ Tepat waktu</span>`;
    case 'late': return `<span class="chip bad">⚠ Terlambat ${L.humanDuration(-e.slackMs)}</span>`;
    case 'overdue': return `<span class="chip bad">⚠ Lewat ${L.humanDuration(-e.slackMs)}</span>`;
    default: return '';
  }
}
function timing(t) {
  const e = L.evaluate(t), now = new Date();
  if (L.isDone(t)) {
    return `Selesai ${fmtDT(e.doneAt)}${e.durationMs !== null ? ` · dikerjakan ${L.humanDuration(e.durationMs)}` : ''}`;
  }
  if (t.status === 'Recurring') return 'Rutin';
  if (e.plannedEnd && now > e.plannedEnd) return `<b style="color:var(--bad)">Terlambat ${L.humanDuration(now - e.plannedEnd)}</b>`;
  if (e.plannedStart && now < e.plannedStart) return `Mulai ${L.humanDuration(e.plannedStart - now)} lagi`;
  if (e.plannedEnd) {
    const left = e.plannedEnd - now;
    return left < 24 * 36e5 ? `<b style="color:var(--warn)">Deadline ${L.humanDuration(left)} lagi</b>` : `Deadline ${L.humanDuration(left)} lagi`;
  }
  return '';
}
function scheduleText(t) {
  const s = L.schedule(t);
  const a = s.start ? fmtDT(s.start) : (t.startRaw || '–');
  const b = s.end ? fmtDT(s.end) : (t.endRaw || '–');
  return `${a} → ${b}`;
}

// ---------- Task Saya ----------
function viewMine() {
  const tasks = S.mine.tasks;
  const b = (k) => tasks.filter((t) => L.bucket(t) === k);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const doneWeek = tasks.filter((t) => L.isDone(t) && t.doneAt && new Date(t.doneAt) >= weekAgo).length;
  const f = S.f;
  $('#view').innerHTML = `${banners()}
    <div class="tiles">
      ${tile('Hari ini & berjalan', b('today').length, 'deadline ≤ 24 jam atau sedang dikerjakan', css('--info'))}
      ${tile('Terlambat', b('overdue').length, 'lewat deadline, belum done', css('--bad'))}
      ${tile('Akan datang', b('upcoming').length, 'belum mulai', css('--muted'))}
      ${tile('Selesai 7 hari', doneWeek, 'task ditandai done', css('--good'))}
    </div>
    <div class="toolbar">
      <div class="seg" id="mtab">${[['active', 'Aktif'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, l]) => `<button data-k="${k}" class="${f.mineTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="fbar fbar-sm"><label class="fb-search">${FB.search}<input type="search" id="mq" placeholder="Cari task…" value="${esc(f.mineQ)}"></label></div>
    </div>
    <div id="mlist"></div>`;
  bindBanners();
  $$('#mtab button').forEach((x) => x.onclick = () => { f.mineTab = x.dataset.k; viewMine(); });
  $('#mq').oninput = (e) => { f.mineQ = e.target.value; renderMineList(); };
  renderMineList();
}

function banners() {
  const out = [];
  if (S.user.sheetName && !S.user.email) {
    out.push(`<div class="banner"><div><b>Masukkan email Anda</b> agar task otomatis masuk Google Calendar dan pengingat deadline dikirim ke email.</div><button class="btn sm primary" data-go="settings">Isi email</button></div>`);
  }
  if (S.cfg.notifPermission === 'default') {
    out.push(`<div class="banner"><div><b>Izinkan notifikasi</b> agar pengingat muncul selama Project Tracker terbuka.</div><button class="btn sm" id="ask-notif">Izinkan</button></div>`);
  }
  return out.join('');
}

function bindBanners() {
  $$('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  const n = $('#ask-notif');
  if (n) n.onclick = async () => { const p = await api.requestNotifications(); S.cfg = await api.config(); toast(p === 'granted' ? 'Notifikasi aktif' : 'Notifikasi tidak diizinkan', p !== 'granted'); go(S.view); };
}

function renderMineList() {
  const f = S.f, q = f.mineQ.toLowerCase();
  let tasks = S.mine.tasks.filter((t) => !q || (t.task + ' ' + t.code + ' ' + projectName(t.code)).toLowerCase().includes(q));
  if (f.mineTab === 'active') tasks = tasks.filter((t) => !L.isDone(t));
  if (f.mineTab === 'done') tasks = tasks.filter((t) => L.isDone(t));
  const groups = [
    ['overdue', 'Terlambat', css('--bad')], ['today', 'Hari ini & sedang berjalan', css('--info')], ['review', 'Menunggu review admin', css('--brand')],
    ['upcoming', 'Akan datang', css('--muted')], ['backlog', 'Tanpa jadwal', css('--muted')], ['done', 'Selesai', css('--good')]
  ];
  const byStart = (a, b) => (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity);
  const html = groups.map(([k, label, color]) => {
    let list = tasks.filter((t) => L.bucket(t) === k);
    if (!list.length) return '';
    list = k === 'done' ? list.sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0)) : list.sort(byStart);
    return `<div class="group"><div class="group-h"><span class="dot" style="background:${color}"></span>${label} <span class="n">${list.length}</span></div>
      <div class="card tlist">${list.map(taskRow).join('')}</div></div>`;
  }).join('');
  $('#mlist').innerHTML = html || `<div class="card empty"><b>${f.mineTab === 'done' ? 'Belum ada task selesai' : 'Tidak ada task aktif'}</b>Task baru dari admin akan muncul di sini.</div>`;
  bindTaskRows($('#mlist'));
}

const ST_CLASS = { 'Backlog': 'st-backlog', 'On-Progress': 'st-progress', 'Review': 'st-review', 'Hold': 'st-hold', 'Done': 'st-done', 'Recurring': 'st-recurring' };
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function shortDT(d) { return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; }
function relDur(ms) { const d = ms / 864e5; return Math.abs(d) >= 3 ? Math.round(Math.abs(d)) + ' hari' : L.humanDuration(Math.abs(ms)); }
function sameDay(a, b) { return a && b && a.toDateString() === b.toDateString(); }

/** Ringkasan waktu untuk kolom kanan: teks utama, teks kecil, warna, dan progres waktu. */
function whenInfo(t) {
  const e = L.evaluate(t), now = new Date();
  const s = e.plannedStart, end = e.plannedEnd;
  if (L.isDone(t)) {
    const map = { over: ['good', `Lebih cepat ${relDur(e.slackMs)}`], ontime: ['info', 'Tepat waktu'], late: ['bad', `Terlambat ${relDur(-e.slackMs)}`] };
    const [cls, main] = map[e.outcome] || ['good', 'Selesai'];
    return { cls, main, sub: e.doneAt ? 'Done ' + shortDT(e.doneAt) : '' };
  }
  if (t.status === 'Review') {
    const late = e.reviewAt && end && e.reviewAt > end;
    return { cls: late ? 'warn' : 'review', main: 'Menunggu review', sub: e.reviewAt ? 'Diajukan ' + shortDT(e.reviewAt) + (late ? ' · lewat deadline' : '') : '' };
  }
  if (t.status === 'Recurring') return { cls: 'muted', main: 'Rutin', sub: '' };
  if (!s && !end) return { cls: 'muted', main: 'Belum dijadwalkan', sub: [t.startRaw, t.endRaw].filter(Boolean).join(' → ') };
  if (end && now > end) return { cls: 'bad', main: `Terlambat ${relDur(now - end)}`, sub: 'Deadline ' + shortDT(end) };
  if (s && now < s) {
    const range = end ? (sameDay(s, end) ? `${shortDT(s)}–${pad(end.getHours())}:${pad(end.getMinutes())}` : `${s.getDate()} ${MONTHS[s.getMonth()]} → ${end.getDate()} ${MONTHS[end.getMonth()]}`) : shortDT(s);
    return { cls: 'muted', main: `Mulai ${relDur(s - now)} lagi`, sub: range };
  }
  const left = end ? end - now : null;
  const pct = s && end && end > s ? Math.min(100, Math.max(0, ((now - s) / (end - s)) * 100)) : null;
  return { cls: left !== null && left < 24 * 36e5 ? 'warn' : 'normal', main: end ? `${relDur(left)} lagi` : 'Sedang berjalan', sub: end ? 'Deadline ' + shortDT(end) : '', pct };
}

const HOURGLASS_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/></svg>';

/** Lingkaran di kiri baris task: perilakunya tergantung status & hak akses. */
function tickHtml(t, readonly) {
  const id = esc(t.id), admin = S.user.role === 'admin', done = L.isDone(t);
  if (!t.id) return '<span class="tick disabled"></span>';
  if (t.status === 'Review') {
    if (admin && !readonly) return `<button class="tick review" data-st="Done" data-id="${id}" title="Setujui (Done)" aria-label="Setujui">${HOURGLASS_SVG}</button>`;
    return `<span class="tick review" title="Menunggu review admin">${HOURGLASS_SVG}</span>`;
  }
  if (readonly) return `<span class="tick ro ${done ? 'on' : ''}" title="${esc(t.status)}">${done ? CHECK_SVG : ''}</span>`;
  if (done) return admin
    ? `<button class="tick" data-st="On-Progress" data-id="${id}" title="Buka lagi" aria-label="Buka lagi">${CHECK_SVG}</button>`
    : `<span class="tick on" title="Disetujui admin">${CHECK_SVG}</span>`;
  return admin
    ? `<button class="tick" data-st="Done" data-id="${id}" title="Tandai selesai" aria-label="Tandai selesai">${CHECK_SVG}</button>`
    : `<button class="tick" data-st="Review" data-id="${id}" title="Selesai? Ajukan review ke admin" aria-label="Ajukan review">${CHECK_SVG}</button>`;
}

// ---------- Result: link hasil kerja ----------
const RES_ICO = {
  doc: fsvg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  sheet: fsvg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>'),
  slide: fsvg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>'),
  drive: fsvg('<path d="M9 4h6l6 10-3 6H6l-3-6z"/><path d="M9 4l6 10H3M15 4L9 14l-3 6"/>'),
  form: fsvg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  design: fsvg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>'),
  link: fsvg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')
};
const RES_KINDS = [
  [/docs\.google\.com\/document/i, 'Google Docs', 'doc', '#2f6fd6'],
  [/docs\.google\.com\/spreadsheets/i, 'Google Sheets', 'sheet', '#1e8e3e'],
  [/docs\.google\.com\/presentation/i, 'Google Slides', 'slide', '#e8a200'],
  [/docs\.google\.com\/forms|forms\.gle/i, 'Google Forms', 'form', '#7248b9'],
  [/drive\.google\.com/i, 'Google Drive', 'drive', '#1a9b7a'],
  [/figma\.com/i, 'Figma', 'design', '#d0583a'],
  [/canva\.com/i, 'Canva', 'design', '#1aa6c4'],
  [/\.pdf(\?|#|$)/i, 'PDF', 'doc', '#c93636']
];
function resKind(url) {
  const k = RES_KINDS.find(([re]) => re.test(url));
  if (k) return { name: k[1], ico: RES_ICO[k[2]], color: k[3] };
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = 'Link'; }
  return { name: host, ico: RES_ICO.link, color: 'var(--muted)' };
}
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());
function resChip(x, compact) {
  const k = resKind(x.url), label = x.label || k.name;
  return `<a class="res-chip ${compact ? 'compact' : ''}" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="${esc(label + ' — ' + x.url)}"><span class="res-ico" style="color:${k.color}">${k.ico}</span>${compact ? '' : `<span class="res-lbl">${esc(label)}</span>`}</a>`;
}
function resultsOf(t) { return Array.isArray(t.results) ? t.results : []; }
function canEditResults(t) {
  if (!t || !t.id) return false;
  return S.user.role === 'admin' || (t.owner === S.user.username && !L.isDone(t));
}

/** Kelola link hasil kerja satu task. opts.thenReview: setelah simpan langsung ajukan review. */
function resultsModal(t, opts) {
  opts = opts || {};
  let items = resultsOf(t).map((x) => ({ label: x.label || '', url: x.url }));
  const listHtml = () => items.length ? items.map((x, i) => { const k = resKind(x.url); return `<div class="res-item">
      <span class="res-ico" style="color:${k.color}">${k.ico}</span>
      <div class="res-item-b"><input type="text" data-lbl="${i}" value="${esc(x.label)}" placeholder="${esc(k.name)}" aria-label="Nama link" maxlength="80">
        <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" class="res-url">${esc(x.url.replace(/^https?:\/\//, ''))}</a></div>
      <button type="button" class="btn sm ghost danger" data-rm="${i}" aria-label="Hapus link">Hapus</button></div>`; }).join('')
    : '<p class="muted small" style="margin:0 0 4px">Belum ada link. Tempel link dokumen hasil kerja di bawah.</p>';
  modal({
    title: 'Hasil kerja',
    body: `<p class="muted small" style="margin:0 0 12px">${esc(t.task.replace(/^https?:\/\/(www\.)?/, ''))}</p>
      <label class="field"><span>Keterangan hasil</span><textarea id="res-note" rows="3" maxlength="2000" placeholder="mis. Sudah tambah meta description dan 3 internal link. Gambar ada di folder Drive.">${esc(t.resultNote || '')}</textarea></label>
      <div class="res-sect-h">Link dokumen</div>
      <div id="res-list">${listHtml()}</div>
      <div class="res-add-form">
        <label class="field"><span>Link</span><input type="url" id="res-url" placeholder="https://docs.google.com/document/d/…" autocomplete="off"></label>
        <label class="field"><span>Nama (opsional)</span><input type="text" id="res-label" placeholder="mis. Brief konten" maxlength="80"></label>
        <p class="muted small" id="res-kind" style="margin:-4px 0 10px">Docs, Sheets, Slides, Drive, Forms, Figma, Canva, atau link lain.</p>
        <button type="button" class="btn sm" id="res-addbtn">+ Tambah ke daftar</button>
      </div><div id="res-err"></div>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="res-save">${opts.thenReview ? 'Simpan & ajukan review' : 'Simpan'}</button>`,
    onMount: (m, close) => {
      const url = $('#res-url', m), lbl = $('#res-label', m), err = (msg) => { $('#res-err', m).innerHTML = msg ? `<div class="error">${esc(msg)}</div>` : ''; };
      const draw = () => {
        $('#res-list', m).innerHTML = listHtml();
        $$('[data-rm]', m).forEach((b) => b.onclick = () => { items.splice(+b.dataset.rm, 1); draw(); });
        $$('[data-lbl]', m).forEach((inp) => inp.oninput = () => { items[+inp.dataset.lbl].label = inp.value; });
      };
      const add = () => {
        const u = url.value.trim();
        if (!u) return false;
        if (!isHttp(u)) { err('Link harus diawali http:// atau https://'); url.focus(); return null; }
        if (items.length >= 10) { err('Maksimal 10 link per task.'); return null; }
        items.push({ label: lbl.value.trim(), url: u }); url.value = ''; lbl.value = ''; err(''); draw();
        $('#res-kind', m).textContent = 'Ditambahkan. Tempel link lain bila perlu.';
        url.focus(); return true;
      };
      url.oninput = () => { err(''); const u = url.value.trim(); $('#res-kind', m).textContent = isHttp(u) ? 'Terdeteksi: ' + resKind(u).name : 'Docs, Sheets, Slides, Drive, Forms, Figma, Canva, atau link lain.'; };
      [url, lbl].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
      $('#res-addbtn', m).onclick = add;
      draw();
      (opts.focusUrl ? url : $('#res-note', m)).focus();
      $('#res-save', m).onclick = () => {
        if (url.value.trim() && add() === null) return;   // link yang masih di kolom ikut disimpan
        close();
        saveResults(t.id, items.map((x) => ({ label: x.label.trim(), url: x.url })), $('#res-note', m).value.trim(), opts.thenReview);
      };
    }
  });
}

async function saveResults(id, results, note, thenReview) {
  const t = findTask(id);
  if (!t) return;
  const before = { results: resultsOf(t).slice(), resultNote: t.resultNote || '' };
  patchTask(id, { results, resultNote: note });
  S.pending.add(id); softRender();
  if (!thenReview) toast('Hasil kerja disimpan');
  try {
    const r = await api.call('setResults', { taskId: id, results, note });
    if (r && r.task) patchTask(id, { results: r.task.results, resultNote: r.task.resultNote });
    S.pending.delete(id); saveCache(); softRender();
    if (thenReview) setStatus(id, 'Review');
  } catch (e) {
    S.pending.delete(id); patchTask(id, before); softRender();
    toast('Gagal menyimpan hasil kerja: ' + cleanErr(e), true);
  }
}

/** Anggota mengajukan review: ingatkan bila belum ada link (tidak wajib). */
function askReview(id) {
  const t = findTask(id);
  if (!t || resultsOf(t).length || (t.resultNote || '').trim() || S.user.role === 'admin') return setStatus(id, 'Review');
  modal({
    title: 'Ajukan review',
    body: '<p style="margin-top:0">Task ini belum punya keterangan maupun link hasil kerja. Tambahkan supaya admin bisa langsung mengecek.</p><p class="muted small" style="margin-bottom:0">Tidak wajib — lewati bila tidak diperlukan.</p>',
    actions: '<button class="btn" id="rv-skip">Ajukan langsung</button><button class="btn primary" id="rv-add">Isi hasil kerja</button>',
    onMount: (m, close) => {
      $('#rv-skip', m).onclick = () => { close(); setStatus(id, 'Review'); };
      $('#rv-add', m).onclick = () => { close(); resultsModal(t, { thenReview: true }); };
    }
  });
}

function resultsLine(t, readonly) {
  const list = resultsOf(t), note = (t.resultNote || '').trim(), edit = !readonly && canEditResults(t);
  if (!list.length && !note && !edit) return '';
  const has = list.length || note;
  return `${note ? `<div class="t-rnote" title="${esc(note)}"><b>Hasil:</b> ${esc(note.replace(/\s*\n\s*/g, ' · '))}</div>` : ''}
    <div class="t-res">${list.map((x) => resChip(x)).join('')}${edit ? `<button type="button" class="res-add" data-res="${esc(t.id)}">${has ? fsvg('<path d="M4 20h4L19 9l-4-4L4 16z"/>') + 'Ubah hasil' : fsvg('<path d="M12 5v14M5 12h14"/>') + 'Hasil kerja'}</button>` : ''}</div>`;
}

function taskRow(t, opts) {
  opts = opts || {};
  const readonly = !!opts.readonly;
  const done = L.isDone(t);
  const pname = projectName(t.code);
  const showProj = pname && pname.trim().toLowerCase() !== String(t.task).trim().toLowerCase();
  const w = whenInfo(t);
  const id = esc(t.id);
  const prio = String(t.priority || '').toLowerCase();
  const admin = S.user.role === 'admin';
  const canStart = !readonly && !done && ['Backlog', 'Hold'].includes(t.status);
  const options = admin ? STATUSES : STATUSES.filter((x) => x !== 'Done');
  const staticPill = `<span class="pill ${ST_CLASS[t.status] || 'st-backlog'}">${esc(t.status)}</span>`;
  const statusSel = readonly || (done && !admin) ? staticPill
    : `<select class="pill ${ST_CLASS[t.status] || 'st-backlog'}" data-sel="${id}" aria-label="Status task">${options.map((x) => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  return `<div class="trow ${readonly ? 'is-ro' : ''} ${t.status === 'Review' ? 'is-review' : ''} ${S.pending.has(t.id) ? 'is-saving' : ''} ${done ? 'is-done' : ''} ${w.cls === 'bad' ? 'is-late' : ''} prio-${esc(prio || 'none')}" id="task-${id}">
    ${tickHtml(t, readonly)}
    <div class="t-main">
      <div class="t-title">${prettyTitle(t.task)}</div>
      <div class="t-sub">
        ${t.code ? `<span class="code-tag">${esc(t.code)}</span>` : ''}
        ${showProj ? `<span class="t-proj" title="${esc(pname)}">${esc(pname)}</span>` : ''}
        ${prio === 'high' && !done ? '<span class="flag">Prioritas tinggi</span>' : ''}
        ${t.notes ? `<span class="t-note" title="${esc(t.notes)}">Catatan: ${esc(t.notes.split('\n').pop())}</span>` : ''}
      </div>
      ${resultsLine(t, readonly)}
    </div>
    <div class="t-when w-${w.cls}">
      <b>${esc(w.main)}</b>
      ${w.sub ? `<span>${esc(w.sub)}</span>` : ''}
      ${w.pct !== undefined && w.pct !== null ? `<i class="t-bar" title="${Math.round(w.pct)}% waktu terpakai"><i style="width:${w.pct}%"></i></i>` : ''}
    </div>
    <div class="t-ctrl">
      ${canStart && t.id ? `<button class="btn sm start" data-st="On-Progress" data-id="${id}">Mulai</button>` : ''}
      ${t.id ? statusSel : '<span class="muted small">Task ID kosong</span>'}
    </div>
  </div>`;
}

function bindTaskRows(root) {
  $$('[data-ext]', root).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
  $$('[data-st]', root).forEach((b) => b.onclick = () => b.dataset.st === 'Review' ? askReview(b.dataset.id) : setStatus(b.dataset.id, b.dataset.st));
  $$('[data-sel]', root).forEach((s) => s.onchange = () => {
    if (!s.value) return;
    if (s.value === 'Review') { const t = findTask(s.dataset.sel); s.value = t ? t.status : s.value; askReview(s.dataset.sel); }
    else setStatus(s.dataset.sel, s.value);
  });
  $$('[data-res]', root).forEach((b) => b.onclick = () => resultsModal(findTask(b.dataset.res)));
}

function findTask(id) {
  return (S.mine.tasks || []).find((x) => x.id === id) || (S.all && S.all.tasks.find((x) => x.id === id)) || (S.team && S.team.tasks.find((x) => x.id === id)) || null;
}
function patchTask(id, patch) {
  [S.mine.tasks, S.all && S.all.tasks, S.team && S.team.tasks].forEach((list) => { if (!list) return; const t = list.find((x) => x.id === id); if (t) Object.assign(t, patch); });
}

// ---------- status project mengikuti task (aturan sama dengan server) ----------
function projectStatusFor(statuses, current) {
  if (!statuses.length) return null;
  if (statuses.length === 1) return STATUSES.includes(statuses[0]) ? statuses[0] : null;
  if (statuses.every((x) => x === 'Done')) return 'Done';
  return current === 'Done' ? 'On-Progress' : null;
}
/** Perbarui status project di tampilan admin: dari hasil server bila ada, bila tidak dihitung lokal. */
function syncProjects(codes, serverList) {
  if (!S.all || !S.all.projects) return;
  if (Array.isArray(serverList)) {
    serverList.forEach((c) => S.all.projects.filter((p) => p.code === c.code).forEach((p) => { p.status = c.status; }));
    return;
  }
  codes.filter(Boolean).forEach((code) => {
    const st = S.all.tasks.filter((t) => t.code === code).map((t) => t.status || 'Backlog');
    S.all.projects.filter((p) => p.code === code).forEach((p) => { const n = projectStatusFor(st, p.status); if (n) p.status = n; });
  });
}

/** Ubah status: tampilan langsung berubah, penyimpanan berjalan di belakang; dibatalkan bila gagal. */
async function setStatus(id, status) {
  const t = findTask(id);
  if (!t || t.status === status) return;
  const before = { status: t.status, startedAt: t.startedAt, doneAt: t.doneAt, reviewAt: t.reviewAt };
  const nowIso = new Date().toISOString();
  const patch = { status, doneAt: status === 'Done' ? nowIso : '' };
  if (status === 'Review' && t.status !== 'Review') patch.reviewAt = nowIso;
  if ((status === 'On-Progress' || status === 'Review') && !t.startedAt) patch.startedAt = nowIso;
  patchTask(id, patch);
  const projBefore = S.all ? S.all.projects.map((p) => p.status) : null;
  syncProjects([t.code]);
  S.pending.add(id);
  softRender();
  toast(status === 'Done' ? 'Task ditandai selesai.' : status === 'Review' ? 'Diajukan ke admin untuk direview.' : status === 'On-Progress' ? 'Task mulai dikerjakan' : `Status diubah ke ${status}`);
  try {
    const r = await api.call('updateStatus', { taskId: id, status });
    if (r && r.task) patchTask(id, { status: r.task.status, startedAt: r.task.startedAt, doneAt: r.task.doneAt, reviewAt: r.task.reviewAt });
    if (r) syncProjects([t.code], r.projects);
    S.pending.delete(id);
    saveCache();
    softRender();
  } catch (e) {
    S.pending.delete(id);
    patchTask(id, before);
    if (projBefore) S.all.projects.forEach((p, i) => { p.status = projBefore[i]; });
    softRender();
    toast('Gagal menyimpan, status dikembalikan: ' + cleanErr(e), true);
  }
}

function tile(label, value, sub, color) {
  return `<div class="card tile"><div class="lbl">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}</div>
    <div class="val">${value}</div><div class="sub">${sub}</div></div>`;
}

// ---------- Dashboard ----------
function periodRange(p) {
  const now = new Date();
  if (p === 'all') return { from: null, to: null };
  if (p === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59) };
  return { from: new Date(now - Number(p) * 864e5), to: null };
}

function viewDashboard() {
  const admin = S.user.role === 'admin' && S.all;
  const f = S.f;
  const users = admin ? S.all.users.filter((u) => u.sheetName) : [];
  let tasks = admin ? S.all.tasks : S.mine.tasks;
  f.persons = f.persons.filter((x) => users.some((u) => u.username === x));
  if (admin && f.persons.length) { const p = new Set(f.persons); tasks = tasks.filter((t) => p.has(t.owner)); }
  const range = periodRange(f.period);
  const sum = L.summarize(tasks, range);
  const team = admin && f.persons.length !== 1;

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg" id="per">${[['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['all', 'Semua']].map(([k, l]) => `<button data-k="${k}" class="${f.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${admin ? `<div class="fbar fbar-auto">${msTrigger({ id: 'person', kind: 'person', icon: 'user', allLabel: 'Semua orang', selected: f.persons,
        items: personItems(users.slice().sort((a, b) => a.name.localeCompare(b.name))), onApply: (v) => { f.persons = v; go('dashboard'); } })}</div>` : ''}
    </div>
    <div class="tiles">
      ${tile('Penyelesaian', pct(sum.completionRate), `${sum.done} dari ${sum.total} task selesai`)}
      ${tile('Rata-rata waktu pengerjaan', L.humanDuration(sum.avgDurationMs), 'dari mulai dikerjakan hingga done')}
      ${tile('Tepat waktu', pct(sum.onTimeRate), `${sum.over + sum.ontime} dari ${sum.over + sum.ontime + sum.late} task selesai`, css('--info'))}
      ${tile('Overperforming', sum.over, 'selesai lebih cepat dari rencana', css('--good'))}
    </div>
    <div class="tiles">
      ${tile('Selesai terlambat', sum.late, 'done setelah deadline', css('--bad'))}
      ${tile('Overdue aktif', sum.overdue, 'lewat deadline, belum done', css('--warn'))}
      ${tile('Rata-rata selisih deadline', sum.avgSlackMs === null ? '–' : (sum.avgSlackMs >= 0 ? '+' : '') + L.humanDuration(sum.avgSlackMs), 'positif = lebih cepat dari deadline')}
      ${tile('Masih berjalan', sum.open, sum.review ? `${sum.review} menunggu review admin` : 'belum jatuh tempo')}
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-h"><h2>${team ? 'Hasil per orang' : 'Task selesai per minggu'}</h2>
        <div class="legend">${team ? legendOutcome() : ''}</div></div>
        <div class="card-b"><div class="chart-box"><canvas id="c1" aria-label="grafik"></canvas></div></div></div>
      <div class="card"><div class="card-h"><h2>Distribusi hasil</h2></div><div class="card-b" id="dist"></div></div>
    </div>
    ${team ? `<div class="card" style="margin-bottom:12px"><div class="card-h"><h2>Peringkat performa</h2><span class="muted small">diurutkan: tepat waktu, lalu overperforming</span></div><div class="card-b" style="padding-top:6px;overflow:auto" id="board"></div></div>` : ''}
    <div class="card"><div class="card-h"><h2>Riwayat task selesai</h2><span class="muted small">waktu pengerjaan per task</span></div><div class="card-b" style="padding-top:6px;overflow:auto" id="hist"></div></div>
    <p class="def">Definisi — <b>Waktu pengerjaan</b>: dari tombol "Mulai" ditekan (atau jadwal mulai bila tidak ditekan) sampai anggota <b>mengajukan review</b> — lama review admin tidak dihitung. <b>Overperforming</b>: selesai sebelum deadline dan memakai ≤ ${Math.round(L.OVERPERFORM_RATIO * 100)}% durasi rencana. <b>Tepat waktu</b>: selesai sebelum/tepat deadline. Jam default bila kolom jam kosong: mulai ${L.DEFAULT_START}, deadline ${L.DEFAULT_END}.</p>`;

  $$('#per button').forEach((b) => b.onclick = () => { f.period = b.dataset.k; go('dashboard'); });

  renderDist(sum);
  if (team) { renderPersonChart(tasks, range); renderBoard(tasks, range); } else renderWeeklyChart(tasks);
  renderHistory(sum, admin);
}

function legendOutcome() {
  return [['--good', 'Overperforming'], ['--info', 'Tepat waktu'], ['--bad', 'Terlambat'], ['--warn', 'Overdue'], ['--brand', 'Menunggu review'], ['--muted', 'Masih berjalan']]
    .map(([c, l]) => `<span><i class="dot" style="background:${css(c)}"></i>${l}</span>`).join('');
}

function renderDist(sum) {
  const rows = [['Overperforming', sum.over, '--good'], ['Tepat waktu', sum.ontime, '--info'], ['Selesai terlambat', sum.late, '--bad'],
    ['Overdue aktif', sum.overdue, '--warn'], ['Menunggu review', sum.review, '--brand'], ['Masih berjalan', sum.open, '--muted']];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  $('#dist').innerHTML = rows.map(([l, n, c]) => `
    <div style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:5px"><span class="row" style="gap:7px"><i class="dot" style="background:${css(c)}"></i>${l}</span><b style="font-variant-numeric:tabular-nums">${n}</b></div>
      <div class="bar" style="height:8px"><i style="width:${(n / max) * 100}%;background:${css(c)}"></i></div>
    </div>`).join('') + `<p class="muted small" style="margin:6px 0 0">Total ${sum.total} task dalam periode ini.</p>`;
}

function chartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--text-2');
  Chart.defaults.borderColor = css('--border');
}

function renderPersonChart(tasks, range) {
  chartDefaults();
  const people = L.byPerson(tasks, range).sort((a, b) => a.name.localeCompare(b.name));
  const ds = [['over', 'Overperforming', '--good'], ['ontime', 'Tepat waktu', '--info'], ['late', 'Terlambat', '--bad'], ['overdue', 'Overdue', '--warn'], ['review', 'Menunggu review', '--brand'], ['open', 'Masih berjalan', '--muted']]
    .map(([k, l, c]) => ({ label: l, data: people.map((p) => p[k]), backgroundColor: css(c), borderColor: css('--surface'), borderWidth: { right: 2 }, borderRadius: 4, borderSkipped: false, barThickness: 16 }));
  S.charts.push(new Chart($('#c1'), {
    type: 'bar', data: { labels: people.map((p) => p.name), datasets: ds },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { stacked: true, ticks: { precision: 0 }, grid: { color: css('--border') } }, y: { stacked: true, grid: { display: false } } }
    }
  }));
}

function renderWeeklyChart(tasks) {
  chartDefaults();
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 7);
  for (let i = 0; i < 8; i++) { const d = new Date(start); d.setDate(d.getDate() + i * 7); weeks.push(d); }
  const counts = weeks.map((w, i) => {
    const end = i < 7 ? weeks[i + 1] : new Date(w.getTime() + 7 * 864e5);
    return tasks.filter((t) => L.isDone(t) && t.doneAt && new Date(t.doneAt) >= w && new Date(t.doneAt) < end).length;
  });
  S.charts.push(new Chart($('#c1'), {
    type: 'bar',
    data: { labels: weeks.map((w) => fmtD(w)), datasets: [{ label: 'Task selesai', data: counts, backgroundColor: css('--series-1'), borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => 'Minggu ' + it[0].label } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: css('--border') } }, x: { grid: { display: false } } }
    }
  }));
}

function posOf(username) {
  const pool = (S.all && S.all.users) || (S.team && S.team.users) || [];
  const u = pool.find((x) => x.username === username);
  return u ? u.position || '' : '';
}

function renderBoard(tasks, range) {
  const ppl = L.byPerson(tasks, range).sort((a, b) => ((b.onTimeRate || 0) - (a.onTimeRate || 0)) || (b.over - a.over) || (b.done - a.done));
  $('#board').innerHTML = `<table class="tbl"><thead><tr><th>#</th><th>Nama</th><th class="num">Task</th><th class="num">Done</th><th>Penyelesaian</th><th class="num">Tepat waktu</th><th class="num" title="Overperforming">Over&shy;perform</th><th class="num">Telat</th><th class="num">Overdue</th><th class="num">Rata² durasi</th><th class="num">Rata² selisih</th></tr></thead><tbody>
    ${ppl.map((p, i) => `<tr><td class="muted">${i + 1}</td><td><div class="row" style="gap:8px"><span class="avatar" style="width:26px;height:26px;font-size:11px">${initials(p.name)}</span><div><b>${esc(p.name)}</b>${posOf(p.owner) ? `<div class="muted" style="font-size:11.5px">${esc(posOf(p.owner))}</div>` : ''}</div></div></td>
      <td class="num">${p.total}</td><td class="num">${p.done}</td>
      <td><div class="row" style="gap:8px"><div class="bar" style="flex:1;min-width:60px"><i style="width:${p.completionRate * 100}%"></i></div><span class="small" style="width:34px">${pct(p.completionRate)}</span></div></td>
      <td class="num">${pct(p.onTimeRate)}</td><td class="num">${p.over ? `<span class="chip good">★ ${p.over}</span>` : '0'}</td>
      <td class="num">${p.late ? `<span class="chip bad">${p.late}</span>` : '0'}</td><td class="num">${p.overdue ? `<span class="chip warn">${p.overdue}</span>` : '0'}</td>
      <td class="num nw">${L.humanDuration(p.avgDurationMs)}</td><td class="num nw">${p.avgSlackMs === null ? '–' : (p.avgSlackMs >= 0 ? '+' : '') + L.humanDuration(p.avgSlackMs)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderHistory(sum, admin) {
  const rows = sum.rows.filter((x) => L.isDone(x.t)).sort((a, b) => (b.e.doneAt || 0) - (a.e.doneAt || 0)).slice(0, 60);
  if (!rows.length) { $('#hist').innerHTML = '<div class="empty"><b>Belum ada task selesai</b>di periode ini.</div>'; return; }
  $('#hist').innerHTML = `<table class="tbl"><thead><tr><th>Task</th>${admin ? '<th>PIC</th>' : ''}<th>Mulai kerja</th><th>Done</th><th class="num">Durasi kerja</th><th class="num">Rencana</th><th class="num">Selisih</th><th>Hasil</th></tr></thead><tbody>
    ${rows.map(({ t, e }) => `<tr><td class="clip" title="${esc(t.task)}">${t.code ? `<span class="chip code">${esc(t.code)}</span> ` : ''}${esc(t.task.replace(/^https?:\/\/(www\.)?/, ''))}</td>
      ${admin ? `<td>${esc(t.ownerName)}</td>` : ''}<td class="nw">${fmtS(e.startedAt || e.plannedStart)}</td><td class="nw">${fmtS(e.doneAt)}</td>
      <td class="num nw">${L.humanDuration(e.durationMs)}</td><td class="num nw">${L.humanDuration(e.plannedMs)}</td>
      <td class="num nw">${e.slackMs === null ? '–' : (e.slackMs >= 0 ? '+' : '') + L.humanDuration(e.slackMs)}</td><td class="nw">${outcomeChip(t)}</td></tr>`).join('')}
  </tbody></table>`;
}

/** Filter orang ⇄ project (boleh pilih banyak) yang saling menyesuaikan.
 *  Opsi project = project milik orang terpilih; opsi orang = orang yang terlibat di project terpilih.
 *  Pilihan yang tidak lagi cocok dibuang. Array kosong = semua. */
function linkedFilters(tasks, people, persons, codes) {
  const P = () => new Set(persons), C = () => new Set(codes);
  const codesOf = () => { const p = P(); return [...new Set(tasks.filter((t) => t.code && (!p.size || p.has(t.owner))).map((t) => t.code))].sort(); };
  const peopleIn = () => { const c = C(); return c.size ? people.filter((u) => tasks.some((t) => t.owner === u.username && c.has(t.code))) : people; };
  persons = persons.filter((x) => people.some((u) => u.username === x));
  const okCodes = new Set(codesOf());
  codes = codes.filter((c) => okCodes.has(c));
  const okPeople = new Set(peopleIn().map((u) => u.username));
  if (codes.length) persons = persons.filter((x) => okPeople.has(x));
  return { persons, codes, codeOpts: codesOf(), peopleOpts: peopleIn() };
}

// ---------- Dropdown pilih-banyak (avatar + jabatan, centang, Terapkan) ----------
const MS = {};
const firstName = (n) => String(n || '').split(/\s+/)[0];
function msTrigger(cfg) {
  MS[cfg.id] = cfg;
  if (cfg.single) {
    const it = cfg.items.find((x) => x.value === cfg.selected) || cfg.items[0];
    return `<button type="button" class="fb-sel fb-ms ${cfg.on ? 'on' : ''}" data-ms="${cfg.id}" aria-haspopup="listbox" aria-expanded="false"><span class="fb-ico">${FB[cfg.icon]}</span><span class="ms-lbl">${esc(it.label)}</span><span class="fb-chev">${FB.chev}</span></button>`;
  }
  const sel =cfg.items.filter((it) => cfg.selected.includes(it.value));
  const n = sel.length, person = cfg.kind === 'person';
  let label;
  if (!n) label = `<span class="ms-lbl">${esc(cfg.allLabel)}</span>`;
  else if (n <= 2) label = `<span class="ms-lbl">${sel.map((s) => esc(person ? s.label : s.value)).join(', ')}</span>`;
  else if (person) label = `<span class="ms-lbl">${esc(firstName(sel[0].label))}</span><span class="ms-more">+${n - 1}</span>`;
  else label = `<span class="ms-lbl">${esc(sel[0].value)}, ${esc(sel[1].value)}</span><span class="ms-more">+${n - 2}</span>`;
  const lead = n && person
    ? `<span class="ms-stack">${sel.slice(0, 3).map((s) => `<span class="avatar">${initials(s.label)}</span>`).join('')}</span>`
    : `<span class="fb-ico">${FB[cfg.icon]}</span>`;
  const title = n ? sel.map((s) => person ? s.label : s.value + (s.label ? ' — ' + s.label : '')).join('\n') : cfg.allLabel;
  return `<button type="button" class="fb-sel fb-ms ${n ? 'on' : ''}" data-ms="${cfg.id}" aria-haspopup="listbox" aria-expanded="false" title="${esc(title)}">${lead}${label}<span class="fb-chev">${FB.chev}</span></button>`;
}

function msClose() {
  const p = $('#ms-pop'); if (!p) return;
  const t = $(`[data-ms="${p.dataset.for}"]`);
  p.remove(); const b = $('#ms-backdrop'); if (b) b.remove();
  if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('open'); }
}

function msMount(pop, trigger, mobile) {
  if (mobile) { const bd = document.createElement('div'); bd.id = 'ms-backdrop'; bd.className = 'ms-backdrop'; bd.onclick = msClose; document.body.appendChild(bd); }
  document.body.appendChild(pop);
  trigger.setAttribute('aria-expanded', 'true'); trigger.classList.add('open');
  if (mobile) return;
  const r = trigger.getBoundingClientRect(), w = Math.max(pop.classList.contains('single') ? 220 : 290, Math.min(340, r.width + 40));
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const below = innerHeight - r.bottom - 12;
  if (below < 260 && r.top > below) { pop.style.bottom = (innerHeight - r.top + 6) + 'px'; pop.style.maxHeight = (r.top - 16) + 'px'; }
  else { pop.style.top = (r.bottom + 6) + 'px'; pop.style.maxHeight = below + 'px'; }
}

/** Panah atas/bawah berpindah antar pilihan. */
function msArrows(pop, sel, e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const els = $$(sel, pop), i = els.indexOf(document.activeElement);
  const n = e.key === 'ArrowDown' ? Math.min(els.length - 1, i + 1) : Math.max(0, i - 1);
  if (els[n]) { e.preventDefault(); els[n].focus(); (els[n].closest('.ms-item') || els[n]).scrollIntoView({ block: 'nearest' }); }
}

function msOpen(trigger) {
  const id = trigger.dataset.ms, cfg = MS[id];
  if (!cfg) return;
  const wasOpen = $('#ms-pop') && $('#ms-pop').dataset.for === id;
  msClose();
  if (wasOpen) return;
  const person = cfg.kind === 'person', mobile = matchMedia('(max-width: 760px)').matches;
  const pop = document.createElement('div');
  pop.id = 'ms-pop'; pop.dataset.for = id; pop.className = 'ms-pop' + (mobile ? ' sheet' : '') + (cfg.single ? ' single' : '');
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', cfg.allLabel || cfg.title || 'Filter');

  if (cfg.single) {
    pop.innerHTML = `${mobile ? '<div class="ms-grab"></div>' : ''}${cfg.title ? `<div class="ms-head">${esc(cfg.title)}</div>` : ''}<div class="ms-list" role="listbox">${cfg.items.map((it) => it.sep ? '<div class="ms-sep"></div>' :
      `<button type="button" class="ms-item ms-opt ${it.value === cfg.selected ? 'sel' : ''}" role="option" aria-selected="${it.value === cfg.selected}" data-v="${esc(it.value)}">
        ${it.dot ? `<span class="ms-dot" style="background:${it.dot}"></span>` : ''}<span class="ms-txt"><b>${esc(it.label)}</b></span><span class="ms-tick">${fsvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')}</span></button>`).join('')}</div>`;
    msMount(pop, trigger, mobile);
    $$('.ms-opt', pop).forEach((b) => b.onclick = () => { msClose(); cfg.onApply(b.dataset.v); });
    pop.addEventListener('keydown', (e) => msArrows(pop, '.ms-opt', e));
    ($('.ms-opt.sel', pop) || $('.ms-opt', pop)).focus({ preventScroll: true });
    return;
  }

  const draft = new Set(cfg.selected.filter((v) => cfg.items.some((it) => it.value === v)));
  const row = (it) => `<label class="ms-item" data-q="${esc((it.value + ' ' + it.label + ' ' + (it.sub || '')).toLowerCase())}">
      <input type="checkbox" value="${esc(it.value)}"><span class="ms-box"></span>
      ${person ? `<span class="avatar">${initials(it.label)}</span>` : `<span class="code-tag">${esc(it.value)}</span>`}
      <span class="ms-txt"><b>${esc(person ? it.label : (it.label || it.value))}</b>${person && it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></label>`;
  pop.innerHTML = `
    ${mobile ? '<div class="ms-grab"></div>' : ''}
    ${cfg.header ? `<div class="ms-head">${esc(cfg.header)}</div>` : ''}
    ${cfg.items.length > 7 ? `<div class="ms-search">${FB.search}<input type="search" placeholder="${person ? 'Cari nama…' : 'Cari project…'}" aria-label="Cari"></div>` : ''}
    <div class="ms-list" role="listbox" aria-multiselectable="true">
      <label class="ms-item ms-all"><input type="checkbox" data-all><span class="ms-box"></span>
        <span class="ms-txt"><b>${esc(cfg.allLabel)}</b><small>${cfg.items.length} ${person ? 'orang' : 'project'}</small></span></label>
      ${cfg.items.map(row).join('') || '<div class="ms-empty">Tidak ada pilihan</div>'}
      <div class="ms-empty hidden" data-none>Tidak ditemukan</div>
    </div>
    <div class="ms-foot"><span class="muted small" data-count></span><span style="flex:1"></span>
      <button type="button" class="btn sm ghost" data-clear>Hapus</button><button type="button" class="btn sm primary" data-apply>Terapkan</button></div>`;
  msMount(pop, trigger, mobile);

  const sync = () => {
    $$('.ms-item input[value]', pop).forEach((c) => { c.checked = draft.has(c.value); c.closest('.ms-item').classList.toggle('sel', c.checked); });
    $('[data-all]', pop).checked = !draft.size;
    $('.ms-all', pop).classList.toggle('sel', !draft.size);
    $('[data-count]', pop).textContent = draft.size ? `${draft.size} dipilih` : 'Semua';
  };
  sync();
  pop.addEventListener('change', (e) => {
    const c = e.target;
    if (c.type !== 'checkbox') return;
    if (c.hasAttribute('data-all')) draft.clear();
    else if (c.checked) draft.add(c.value); else draft.delete(c.value);
    sync();
  });
  const apply = () => { const v = cfg.items.map((it) => it.value).filter((x) => draft.has(x)); msClose(); cfg.onApply(v); };
  $('[data-clear]', pop).onclick = () => { draft.clear(); sync(); };
  $('[data-apply]', pop).onclick = apply;
  const q = $('.ms-search input', pop);
  if (q) q.oninput = () => {
    const s = q.value.trim().toLowerCase(); let shown = 0;
    $$('.ms-item[data-q]', pop).forEach((el) => { const ok = !s || el.dataset.q.includes(s); el.classList.toggle('hidden', !ok); if (ok) shown++; });
    $('[data-none]', pop).classList.toggle('hidden', !!shown);
  };
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (e.target.type === 'checkbox') apply(); return; }
    msArrows(pop, '.ms-item:not(.hidden) input', e);
  });
  (q || $('.ms-item input', pop)).focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ms]');
  if (t) { e.preventDefault(); msOpen(t); }
});
document.addEventListener('mousedown', (e) => {
  const p = $('#ms-pop');
  if (p && !p.contains(e.target) && !e.target.closest('[data-ms]') && !e.target.closest('#ms-backdrop')) msClose();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#ms-pop')) { const id = $('#ms-pop').dataset.for; msClose(); e.stopImmediatePropagation(); const t = $(`[data-ms="${id}"]`); if (t) t.focus(); }
}, true);
window.addEventListener('resize', () => { if ($('#ms-pop') && !$('#ms-pop').classList.contains('sheet')) msClose(); });
document.addEventListener('scroll', (e) => { const p = $('#ms-pop'); if (p && !p.classList.contains('sheet') && !p.contains(e.target)) msClose(); }, true);

const personItems = (users) => users.map((u) => ({ value: u.username, label: u.name, sub: u.position || '' }));
const codeItems = (codes) => codes.map((c) => ({ value: c, label: projectName(c) || '' }));
const namesOf = (users, list) => list.map((x) => (users.find((u) => u.username === x) || {}).name || x);
const scopeTxt = (arr, max) => arr.length <= (max || 2) ? arr.join(', ') : arr.slice(0, max || 2).join(', ') + ` +${arr.length - (max || 2)}`;

// ---------- Tim (baca-saja) ----------
function teamData() {
  if (S.user.role === 'admin' && S.all) {
    return { tasks: S.all.tasks, users: S.all.users.filter((u) => u.sheetName && u.active).map((u) => ({ username: u.username, name: u.name, position: u.position || '' })) };
  }
  return S.team;
}

async function loadTeam() {
  if (S.user.role === 'admin') return true;
  try { S.team = await api.call('teamTasks'); S.teamAt = Date.now(); saveCache(); return true; }
  catch (e) { toast(cleanErr(e), true); return false; }
}

function viewTeam() {
  const d = teamData();
  if (!d) {
    $('#view').innerHTML = '<div class="loading">Memuat data tim…</div>';
    loadTeam().then((ok) => { if (ok && S.view === 'team') go('team'); });
    return;
  }
  if (S.user.role !== 'admin' && Date.now() - S.teamAt > 60000) {
    S.teamAt = Date.now();
    loadTeam().then((ok) => { if (ok && S.view === 'team') softRender(); });
  }
  const f = S.f, now = new Date(), week = new Date(now - 7 * 864e5);
  const users = d.users.slice().sort((a, b) => a.name.localeCompare(b.name));
  const lf = linkedFilters(d.tasks, users, f.teamPeople, f.teamCodes);
  f.teamPeople = lf.persons; f.teamCodes = lf.codes;
  const involved = new Set(lf.peopleOpts.map((u) => u.username)), picked = new Set(f.teamPeople);
  const stat = (u) => {
    const ts = d.tasks.filter((t) => t.owner === u.username);
    const b = (k) => ts.filter((t) => L.bucket(t, now) === k).length;
    return { running: ts.filter((t) => !L.isDone(t) && (t.status === 'On-Progress' || L.bucket(t, now) === 'today')).length,
      overdue: b('overdue'), review: b('review'), done7: ts.filter((t) => L.isDone(t) && t.doneAt && new Date(t.doneAt) >= week).length,
      upcoming: b('upcoming') };
  };
  $('#view').innerHTML = `
    <div class="wl-grid">${users.map((u) => { const st = stat(u); return `
      <button class="card wl-card ${picked.has(u.username) ? 'on' : ''} ${involved.has(u.username) ? '' : 'dim'}" data-person="${esc(u.username)}" aria-pressed="${picked.has(u.username)}" ${involved.has(u.username) ? '' : `title="Tidak terlibat di project ${esc(f.teamCodes.join(', '))}"`}>
        <div class="row" style="gap:10px"><span class="avatar">${initials(u.name)}</span>
          <div style="min-width:0;text-align:left"><b class="wl-name">${esc(u.name)}${u.username === S.user.username ? ' <span class="muted">(Anda)</span>' : ''}</b><small class="wl-pos">${esc(u.position || '—')}</small></div></div>
        <div class="wl-stats">
          <span title="Sedang berjalan"><b>${st.running}</b> berjalan</span>
          ${st.overdue ? `<span class="bad" title="Terlambat"><b>${st.overdue}</b> terlambat</span>` : ''}
          ${st.review ? `<span class="rv" title="Menunggu review"><b>${st.review}</b> review</span>` : ''}
          <span title="Selesai 7 hari terakhir"><b>${st.done7}</b> selesai</span>
        </div>
      </button>`; }).join('')}</div>
    <div class="toolbar">
      <div class="seg" id="tmtab">${[['active', 'Aktif'], ['review', 'Review'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, l]) => `<button data-k="${k}" class="${f.teamTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="fbar"><label class="fb-search">${FB.search}<input type="search" id="tmq" placeholder="Cari task…" value="${esc(f.teamQ)}"></label>
      ${msTrigger({ id: 'tmperson', kind: 'person', icon: 'user', selected: f.teamPeople, items: personItems(lf.peopleOpts),
        allLabel: f.teamCodes.length ? 'Semua orang di ' + (f.teamCodes.length > 2 ? f.teamCodes.length + ' project' : f.teamCodes.join(', ')) : 'Semua orang',
        header: f.teamCodes.length ? 'Terlibat di ' + scopeTxt(f.teamCodes, 3) : '',
        onApply: (v) => { f.teamPeople = v; go('team'); } })}
      ${msTrigger({ id: 'tmcode', kind: 'code', icon: 'folder', selected: f.teamCodes, items: codeItems(lf.codeOpts),
        allLabel: 'Semua project',
        header: f.teamPeople.length ? 'Project ' + scopeTxt(namesOf(users, f.teamPeople).map(firstName), 3) : '',
        onApply: (v) => { f.teamCodes = v; go('team'); } })}</div>
    </div>
    <div id="tmlist"></div>
    <p class="def">Halaman ini hanya untuk melihat. Perubahan task hanya bisa dilakukan oleh pemilik task (dan admin).</p>`;
  $$('[data-person]').forEach((b) => b.onclick = () => {
    const who = b.dataset.person;
    f.teamPeople = f.teamPeople.includes(who) ? f.teamPeople.filter((x) => x !== who) : f.teamPeople.concat(who);
    if (b.classList.contains('dim')) f.teamCodes = []; // klik orang di luar project → tampilkan semua project-nya
    go('team');
  });
  $$('#tmtab button').forEach((b) => b.onclick = () => { f.teamTab = b.dataset.k; go('team'); });
  $('#tmq').oninput = (e) => { f.teamQ = e.target.value; renderTeamList(d, users); };
  renderTeamList(d, users);
}

function renderTeamList(d, users) {
  const f = S.f, q = f.teamQ.toLowerCase();
  const tab = { active: (t) => !L.isDone(t), review: (t) => t.status === 'Review', done: (t) => L.isDone(t), all: () => true }[f.teamTab];
  const byEnd = (a, b) => (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity);
  const P = new Set(f.teamPeople), C = new Set(f.teamCodes);
  const html = users.filter((u) => !P.size || P.has(u.username)).map((u) => {
    const list = d.tasks.filter((t) => t.owner === u.username && tab(t) && (!C.size || C.has(t.code)) &&
      (!q || (t.task + ' ' + t.code + ' ' + (t.notes || '')).toLowerCase().includes(q)))
      .sort(f.teamTab === 'done' ? (a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0) : byEnd);
    if (!list.length) return '';
    return `<div class="group"><div class="group-h"><span class="avatar" style="width:22px;height:22px;font-size:10px">${initials(u.name)}</span>${esc(u.name)}
      ${u.position ? `<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${esc(u.position)}</span>` : ''} <span class="n">${list.length}</span></div>
      <div class="card tlist">${list.map((t) => taskRow(t, { readonly: true })).join('')}</div></div>`;
  }).join('');
  $('#tmlist').innerHTML = html || '<div class="card empty"><b>Tidak ada task</b>Ubah filter untuk melihat task lain.</div>';
  $$('[data-ext]', $('#tmlist')).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
}

// ---------- Admin: Review ----------
function ago(d) { if (!d) return ''; const ms = Date.now() - d; return ms < 60000 ? 'baru saja' : relDur(ms) + ' lalu'; }

function viewReview() {
  const list = S.all.tasks.filter((t) => t.status === 'Review').sort((a, b) => new Date(a.reviewAt || 0) - new Date(b.reviewAt || 0));
  if (!list.length) {
    $('#view').innerHTML = '<div class="card empty"><b>Tidak ada task yang menunggu review</b>Pengajuan baru dari anggota akan muncul di sini, dan Anda akan diberi tahu lewat notifikasi & email.</div>';
    return;
  }
  $('#view').innerHTML = `<div class="card tlist">${list.map((t) => {
    const e = L.evaluate(t), id = esc(t.id), pname = projectName(t.code);
    const late = e.reviewAt && e.plannedEnd && e.reviewAt > e.plannedEnd;
    const pos = posOf(t.owner);
    return `<div class="rv-row ${S.pending.has(t.id) ? 'is-saving' : ''}" id="task-${id}">
      <div class="rv-who"><span class="avatar">${initials(t.ownerName)}</span><div><b>${esc(t.ownerName)}</b>${pos ? `<small>${esc(pos)}</small>` : ''}</div></div>
      <div class="t-main">
        <div class="t-title">${prettyTitle(t.task)}</div>
        <div class="t-sub">${t.code ? `<span class="code-tag">${esc(t.code)}</span>` : ''}${pname && pname !== t.task ? `<span class="t-proj">${esc(pname)}</span>` : ''}</div>
        ${t.notes ? `<div class="rv-note">${esc(t.notes)}</div>` : ''}
        <div class="rv-hasil"><div class="rv-res-h">Hasil kerja</div>
          ${t.resultNote ? `<div class="rv-rnote">${esc(t.resultNote)}</div>` : ''}
          <div class="rv-res">${resultsOf(t).length ? resultsOf(t).map((x) => resChip(x)).join('') : (t.resultNote ? '' : '<span class="muted small">Belum ada keterangan maupun link</span>')}</div></div>
      </div>
      <div class="t-when ${late ? 'w-warn' : 'w-good'}">
        <b>${late ? 'Lewat deadline' : 'Tepat waktu'}</b>
        <span>Diajukan ${esc(ago(e.reviewAt))}</span>
        ${e.plannedEnd ? `<span>Deadline ${esc(shortDT(e.plannedEnd))}</span>` : ''}
      </div>
      <div class="t-ctrl rv-ctrl">
        <button class="btn sm" data-return="${id}">Kembalikan</button>
        <button class="btn sm primary" data-approve="${id}">Setujui</button>
      </div>
    </div>`; }).join('')}</div>
    <p class="def"><b>Setujui</b> menandai task sebagai Done. <b>Kembalikan</b> mengubahnya menjadi On-Progress; alasan Anda tercatat di Catatan task dan dikirim ke email anggota.</p>`;
  $$('[data-ext]', $('#view')).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
  $$('[data-approve]').forEach((b) => b.onclick = () => decideReview(b.dataset.approve, 'approve'));
  $$('[data-return]').forEach((b) => b.onclick = () => {
    const t = findTask(b.dataset.return);
    modal({
      title: 'Kembalikan task',
      body: `<p style="margin-top:0">${esc(t.ownerName)} — <b>${esc(t.task.replace(/^https?:\/\/(www\.)?/, ''))}</b></p>
        <label class="field"><span>Apa yang perlu diperbaiki? (opsional)</span><textarea id="rv-reason" rows="3" placeholder="mis. Tambahkan meta description dan 2 internal link"></textarea></label>`,
      actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="rv-send">Kembalikan</button>',
      onMount: (m, close) => { $('#rv-send', m).onclick = () => { const reason = $('#rv-reason', m).value.trim(); close(); decideReview(t.id, 'return', reason); }; }
    });
  });
}

async function decideReview(id, decision, reason) {
  const t = findTask(id);
  if (!t) return;
  const before = { status: t.status, doneAt: t.doneAt, reviewAt: t.reviewAt, notes: t.notes };
  const now = new Date();
  if (decision === 'approve') patchTask(id, { status: 'Done', doneAt: now.toISOString(), reviewAt: t.reviewAt || now.toISOString() });
  else {
    const line = `[Dikembalikan ${now.getDate()} ${MONTHS[now.getMonth()]} ${pad(now.getHours())}:${pad(now.getMinutes())} oleh ${S.user.name}]` + (reason ? ' ' + reason : '');
    patchTask(id, { status: 'On-Progress', doneAt: '', reviewAt: '', notes: t.notes ? t.notes + '\n' + line : line });
  }
  syncProjects([t.code]);
  S.pending.add(id);
  softRender(); renderNav();
  toast(decision === 'approve' ? `Disetujui — task ${t.ownerName} ditandai Done.` : `Dikembalikan ke ${t.ownerName}.`);
  try {
    const r = await api.call('reviewTask', { taskId: id, decision, reason: reason || '' });
    if (r && r.task) patchTask(id, { status: r.task.status, doneAt: r.task.doneAt, reviewAt: r.task.reviewAt, notes: r.task.notes });
    if (r) syncProjects([t.code], r.projects);
    saveCache();
  } catch (e) {
    patchTask(id, before); syncProjects([t.code]);
    toast('Gagal menyimpan keputusan: ' + cleanErr(e), true);
  } finally {
    S.pending.delete(id);
    softRender(); renderNav();
  }
}

// ---------- Admin: Semua Task ----------
function viewTasks() {
  const f = S.f, all = S.all;
  const users = all.users.filter((u) => u.sheetName).sort((a, b) => a.name.localeCompare(b.name));
  const lf = linkedFilters(all.tasks, users, f.towners, f.tcodes);
  f.towners = lf.persons; f.tcodes = lf.codes;
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="fbar"><label class="fb-search">${FB.search}<input type="search" id="tq" placeholder="Cari task…" value="${esc(f.tq)}"></label>
      ${msTrigger({ id: 'towner', kind: 'person', icon: 'user', selected: f.towners, items: personItems(lf.peopleOpts),
        allLabel: f.tcodes.length ? 'Semua orang di ' + (f.tcodes.length > 2 ? f.tcodes.length + ' project' : f.tcodes.join(', ')) : 'Semua orang',
        header: f.tcodes.length ? 'Terlibat di ' + scopeTxt(f.tcodes, 3) : '',
        onApply: (v) => { f.towners = v; viewTasks(); } })}
      ${msTrigger({ id: 'tstatus', single: true, icon: 'status', title: 'Status', selected: f.tstatus, on: f.tstatus !== 'active',
        items: [{ value: 'active', label: 'Belum selesai' }, { value: 'overdue', label: 'Terlambat', dot: css('--bad') }, { value: 'all', label: 'Semua status' }, { sep: true }]
          .concat(STATUSES.map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] }))),
        onApply: (v) => { f.tstatus = v; viewTasks(); } })}
      ${msTrigger({ id: 'tcode', kind: 'code', icon: 'folder', selected: f.tcodes, items: codeItems(lf.codeOpts),
        allLabel: 'Semua project',
        header: f.towners.length ? 'Project ' + scopeTxt(namesOf(users, f.towners).map(firstName), 3) : '',
        onApply: (v) => { f.tcodes = v; viewTasks(); } })}</div>
      <span class="spacer"></span>
      <button class="btn primary" id="newtask">+ Task baru</button>
    </div>
    <div class="card" style="overflow:auto" id="tt"></div>`;
  $('#tq').oninput = (e) => { f.tq = e.target.value; renderTaskTable(); };
  $('#newtask').onclick = () => taskModal(null);
  renderTaskTable();
}

function resCell(t) {
  const list = resultsOf(t), note = (t.resultNote || '').trim();
  const noteIco = note ? `<span class="res-chip compact" title="${esc('Keterangan hasil: ' + note)}"><span class="res-ico" style="color:var(--text-2)">${RES_ICO.form}</span></span>` : '';
  if (!list.length) return note ? `<span class="res-cell">${noteIco}</span>` : '<span class="muted">–</span>';
  return `<span class="res-cell">${noteIco}${list.slice(0, 3).map((x) => resChip(x, true)).join('')}${list.length > 3 ? `<span class="ms-more" title="${esc(list.slice(3).map((x) => x.label || x.url).join('\n'))}">+${list.length - 3}</span>` : ''}</span>`;
}

function renderTaskTable() {
  const f = S.f, q = f.tq.toLowerCase();
  let list = S.all.tasks.filter((t) =>
    (!q || (t.task + ' ' + t.ownerName + ' ' + t.code).toLowerCase().includes(q)) &&
    (!f.towners.length || f.towners.includes(t.owner)) &&
    (!f.tcodes.length || f.tcodes.includes(t.code)) &&
    (f.tstatus === 'all' || (f.tstatus === 'active' ? !L.isDone(t) : f.tstatus === 'overdue' ? L.bucket(t) === 'overdue' : t.status === f.tstatus)));
  list = list.sort((a, b) => (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity));
  if (!list.length) { $('#tt').innerHTML = '<div class="empty"><b>Tidak ada task</b>Ubah filter atau buat task baru.</div>'; return; }
  if (matchMedia('(max-width: 760px)').matches) {
    $('#tt').innerHTML = list.map((t) => `<div class="task">
      <div>
        <div class="task-proj">${t.code ? `<span class="chip code">${esc(t.code)}</span>` : ''}<b style="color:var(--text-2)">${esc(t.ownerName)}</b></div>
        <div class="task-title">${prettyTitle(t.task)}</div>
        <div class="task-meta">${statusChip(t.status)}${priorityChip(t.priority)}<span>🗓 ${scheduleText(t)}</span><span>${L.isDone(t) ? outcomeChip(t) : timing(t)}</span></div>
        ${resultsLine(t, true)}
      </div>
      <div class="task-actions"><button class="btn sm" data-edit="${esc(t.id)}">Edit</button><button class="btn sm danger" data-del="${esc(t.id)}">Hapus</button></div>
    </div>`).join('');
  } else $('#tt').innerHTML = `<table class="tbl"><thead><tr><th>Code</th><th>Task</th><th>PIC</th><th>Mulai</th><th>Deadline</th><th>Status</th><th>Hasil</th><th>Prioritas</th><th>Keterangan</th><th></th></tr></thead><tbody>
    ${list.map((t) => { const s = L.schedule(t); return `<tr>
      <td>${t.code ? `<span class="chip code">${esc(t.code)}</span>` : ''}</td>
      <td class="clip" title="${esc(t.task)}">${prettyTitle(t.task)}</td><td>${esc(t.ownerName)}</td>
      <td class="nw">${s.start ? fmtS(s.start) : esc(t.startRaw || '–')}</td><td class="nw">${s.end ? fmtS(s.end) : esc(t.endRaw || '–')}</td>
      <td class="nw">${statusChip(t.status)}</td><td class="nw">${resCell(t)}</td><td class="nw">${priorityChip(t.priority)}</td><td class="small nw">${L.isDone(t) ? outcomeChip(t) : timing(t)}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-edit="${esc(t.id)}">Edit</button> <button class="btn sm danger" data-del="${esc(t.id)}">Hapus</button></td></tr>`; }).join('')}
  </tbody></table>`;
  $$('[data-ext]', $('#tt')).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
  $$('[data-edit]').forEach((b) => b.onclick = () => taskModal(S.all.tasks.find((t) => t.id === b.dataset.edit)));
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    const t = S.all.tasks.find((x) => x.id === b.dataset.del);
    if (!t.id) return toast('Task belum punya Task ID. Jalankan Setup di spreadsheet.', true);
    if (!(await confirmBox('Hapus task?', `"${t.task}" milik ${t.ownerName} akan dihapus dari spreadsheet.`))) return;
    const snapAll = S.all.tasks.slice(), snapMine = S.mine.tasks.slice();
    S.all.tasks = S.all.tasks.filter((x) => x.id !== t.id);
    S.mine.tasks = S.mine.tasks.filter((x) => x.id !== t.id);
    softRender(); toast('Task dihapus');
    try { const r = await api.call('deleteTask', { taskId: t.id }); syncProjects([t.code], r && r.projects); saveCache(); softRender(); }
    catch (e) { S.all.tasks = snapAll; S.mine.tasks = snapMine; softRender(); toast('Gagal menghapus: ' + cleanErr(e), true); }
  });
}

function taskModal(t, prefill) {
  const all = S.all, edit = !!t && !prefill;
  t = t || { owner: S.f.towners.length === 1 ? S.f.towners[0] : '', code: S.f.tcodes.length === 1 ? S.f.tcodes[0] : '', startTime: '09:00', endTime: '17:00', priority: 'Medium', status: 'Backlog' };
  if (edit && !t.id) return toast('Task ini belum punya Task ID. Jalankan menu Setup di spreadsheet.', true);
  const people = all.users.filter((u) => u.sheetName && u.active);
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label || v)}</option>`;
  modal({
    title: edit ? 'Edit task' : 'Task baru', wide: true,
    body: `<form id="tf">
      <div class="grid2">
        <label class="field"><span>Penanggung jawab *</span><select name="owner" required><option value="">Pilih…</option>${people.map((u) => opt(u.username, t.owner, u.name)).join('')}</select></label>
        <label class="field"><span>Project</span><select name="code"><option value="">— tanpa project —</option>${all.projects.filter((p) => p.code).map((p) => opt(p.code, t.code, p.code + ' — ' + p.project.slice(0, 50))).join('')}</select></label>
      </div>
      <label class="field"><span>Nama task / URL *</span><textarea name="task" rows="2" required>${esc(t.task || '')}</textarea></label>
      <div class="grid4">
        <label class="field"><span>Tanggal mulai</span><input type="date" name="startDate" value="${esc(t.startDate || '')}"></label>
        <label class="field"><span>Jam mulai</span><input type="time" name="startTime" value="${esc(t.startTime || '09:00')}"></label>
        <label class="field"><span>Deadline</span><input type="date" name="endDate" value="${esc(t.endDate || '')}"></label>
        <label class="field"><span>Jam deadline</span><input type="time" name="endTime" value="${esc(t.endTime || '17:00')}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Prioritas</span><select name="priority">${PRIORITIES.map((p) => opt(p, t.priority || 'Medium')).join('')}</select></label>
        <label class="field"><span>Status</span><select name="status">${STATUSES.map((s) => opt(s, t.status || 'Backlog')).join('')}</select></label>
      </div>
      <label class="field"><span>Catatan</span><textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></label>
      <label class="field"><span>Keterangan hasil (dari anggota)</span><textarea name="resultNote" rows="2" maxlength="2000">${esc(t.resultNote || '')}</textarea></label>
      <label class="field"><span>Link hasil kerja — satu link per baris, boleh diberi nama: <code>Nama | URL</code></span><textarea name="results" rows="2" placeholder="Brief konten | https://docs.google.com/document/d/…">${esc(resultsOf(t).map((x) => x.label ? x.label + ' | ' + x.url : x.url).join('\n'))}</textarea></label>
      <div id="terr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">${edit ? 'Simpan' : 'Buat task'}</button>`,
    onMount: (m, close) => {
      const f = $('#tf', m);
      f.startDate.addEventListener('change', () => { if (!f.endDate.value) f.endDate.value = f.startDate.value; });
      $('#save', m).onclick = async () => {
        if (!f.reportValidity()) return;
        const data = Object.fromEntries(new FormData(f).entries());
        const s = L.at(data.startDate, data.startTime), e = L.at(data.endDate, data.endTime);
        if (s && e && e < s) { $('#terr', m).innerHTML = '<div class="error">Deadline tidak boleh sebelum waktu mulai.</div>'; return; }
        if (edit) data.id = t.id;
        const parsed = parseResultsText(data.results || '');
        if (parsed.error) { $('#terr', m).innerHTML = `<div class="error">${esc(parsed.error)}</div>`; return; }
        data.results = parsed.list;
        try {
          const r = await busy($('#save', m), () => api.call('saveTask', { task: data }));
          close(); toast(edit ? 'Task diperbarui' : 'Task dibuat & dibagikan');
          if (r && r.task) {
            const owner = S.all.users.find((u) => u.username === r.task.owner);
            const nt = Object.assign({}, r.task, { ownerName: owner ? owner.name : r.task.ownerName });
            S.all.tasks = S.all.tasks.filter((x) => x.id !== nt.id).concat(nt);
            S.mine.tasks = S.mine.tasks.filter((x) => x.id !== nt.id).concat(nt.owner === S.user.username ? [nt] : []);
            syncProjects([nt.code, t.code], r.projects);
            saveCache();
          }
          softRender();
          refreshInBackground(1500);
        } catch (err) { $('#terr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

function parseResultsText(txt) {
  const list = [];
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const i = line.lastIndexOf('|');
    const label = i >= 0 ? line.slice(0, i).trim() : '', url = i >= 0 ? line.slice(i + 1).trim() : line;
    if (!isHttp(url)) return { error: 'Link hasil kerja tidak valid: "' + line.slice(0, 60) + '" — harus diawali http:// atau https://' };
    list.push({ label, url });
  }
  if (list.length > 10) return { error: 'Maksimal 10 link hasil kerja per task.' };
  return { list };
}

// ---------- Admin: Project ----------
function viewProjects() {
  const all = S.all;
  $('#view').innerHTML = `<div class="toolbar"><span class="muted small">${all.projects.length} project</span><span class="spacer"></span><button class="btn primary" id="newp">+ Project baru</button></div>
    <div class="card" style="overflow:auto">${all.projects.length ? `<table class="tbl"><thead><tr><th>Code</th><th>Project</th><th>PIC</th><th>Mulai</th><th>Selesai</th><th>Prioritas</th><th>Status</th><th>Progres task</th><th></th></tr></thead><tbody>
    ${all.projects.map((p) => {
      const ts = all.tasks.filter((t) => t.code && t.code === p.code);
      const d = ts.filter(L.isDone).length, r = ts.length ? d / ts.length : 0;
      return `<tr><td><span class="chip code">${esc(p.code)}</span></td><td class="clip" title="${esc(p.project)}"><b>${esc(p.project)}</b></td><td class="small">${esc(p.pic)}</td>
        <td>${fmtIso(p.start, p.startRaw)}</td><td>${fmtIso(p.end, p.endRaw)}</td><td>${priorityChip(p.priority)}</td><td>${statusChip(p.status)}</td>
        <td>${!ts.length && p.code ? `<button class="btn sm" data-pt="${p.row}" title="Buat task dari project ini">+ Jadikan task</button>` : `<div class="row" style="gap:8px"><div class="bar" style="flex:1"><i style="width:${r * 100}%"></i></div><span class="small muted">${d}/${ts.length}</span></div>`}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-pe="${p.row}">Edit</button> <button class="btn sm danger" data-pd="${p.row}">Hapus</button></td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty"><b>Belum ada project</b></div>'}</div>`;
  $('#newp').onclick = () => projectModal(null);
  $$('[data-pe]').forEach((b) => b.onclick = () => projectModal(all.projects.find((p) => String(p.row) === b.dataset.pe)));
  $$('[data-pt]').forEach((b) => b.onclick = () => taskModal(taskFromProject(all.projects.find((p) => String(p.row) === b.dataset.pt)), true));
  $$('[data-pd]').forEach((b) => b.onclick = async () => {
    const p = all.projects.find((x) => String(x.row) === b.dataset.pd);
    if (!(await confirmBox('Hapus project?', `${p.code} — ${p.project} akan dihapus dari tab Main Project. Task terkait tidak ikut terhapus.`))) return;
    await busy(null, () => api.call('deleteProject', { row: p.row, code: p.code }));
    S.all.projects = S.all.projects.filter((x) => x.row !== p.row);
    toast('Project dihapus'); softRender(); refreshInBackground(800);
  });
}

function projectModal(p) {
  const edit = !!p;
  p = p || { priority: 'High', status: 'Backlog' };
  const opt = (v, cur) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`;
  const names = S.all.users.filter((u) => u.sheetName).map((u) => u.name).join(', ');
  modal({
    title: edit ? 'Edit project' : 'Project baru',
    body: `<form id="pf">
      <div class="grid2"><label class="field"><span>Code</span><input name="code" value="${esc(p.code || '')}" placeholder="mis. B7"></label>
      <label class="field"><span>Prioritas</span><select name="priority">${PRIORITIES.map((x) => opt(x, p.priority)).join('')}</select></label></div>
      <label class="field"><span>Nama project *</span><textarea name="project" rows="2" required>${esc(p.project || '')}</textarea></label>
      <label class="field"><span>PIC (pisahkan dengan koma)</span><input name="pic" value="${esc(p.pic || '')}" placeholder="${esc(names)}"></label>
      <div class="grid2"><label class="field"><span>Mulai</span><input type="date" name="start" value="${esc(p.start || '')}"></label>
      <label class="field"><span>Selesai</span><input type="date" name="end" value="${esc(p.end || '')}"></label></div>
      <label class="field"><span>Status</span><select name="status">${STATUSES.map((x) => opt(x, p.status)).join('')}</select></label>
      ${edit ? '' : `<div class="as-task">
        <label class="check as-task-h"><input type="checkbox" name="asTask" id="as-task"> <span><b>Buat juga sebagai task</b> <small>untuk project yang isinya cukup 1 task</small></span></label>
        <div class="as-task-b hidden" id="as-task-b">
          <div class="grid2">
            <label class="field"><span>Penanggung jawab *</span><select name="owner"><option value="">Pilih…</option>${S.all.users.filter((u) => u.sheetName && u.active).map((u) => `<option value="${esc(u.username)}">${esc(u.name)}</option>`).join('')}</select></label>
            <div class="grid2"><label class="field"><span>Jam mulai</span><input type="time" name="startTime" value="09:00"></label><label class="field"><span>Jam deadline</span><input type="time" name="endTime" value="17:00"></label></div>
          </div>
          <p class="muted small" style="margin:0">Nama task, code, tanggal, dan prioritas mengikuti project. Status project selanjutnya mengikuti task ini.</p>
        </div></div>`}
      <div id="perr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      const f0 = $('#pf', m), cb = $('#as-task', m);
      if (cb) {
        const pickOwner = () => { if (!f0.owner.value) { const u = ownerFromPic(f0.pic.value); if (u) f0.owner.value = u.username; } };
        cb.onchange = () => { $('#as-task-b', m).classList.toggle('hidden', !cb.checked); f0.owner.required = cb.checked; $('#save', m).textContent = cb.checked ? 'Simpan project & task' : 'Simpan'; if (cb.checked) pickOwner(); };
        f0.pic.addEventListener('change', () => { if (cb.checked) pickOwner(); });
        f0.owner.addEventListener('change', () => { if (!f0.pic.value.trim()) { const u = S.all.users.find((x) => x.username === f0.owner.value); if (u) f0.pic.value = u.name; } });
      }
      $('#save', m).onclick = async () => {
        const f = $('#pf', m); if (!f.reportValidity()) return;
        const data = Object.fromEntries(new FormData(f).entries());
        const asTask = !edit && cb && cb.checked;
        if (asTask) {
          const s0 = L.at(data.start, data.startTime), e0 = L.at(data.end, data.endTime);
          if (s0 && e0 && e0 < s0) { $('#perr', m).innerHTML = '<div class="error">Tanggal selesai tidak boleh sebelum tanggal mulai.</div>'; return; }
          if (!data.code.trim()) { $('#perr', m).innerHTML = '<div class="error">Isi Code project supaya task terhubung ke project ini.</div>'; return; }
        }
        const proj = { code: data.code, project: data.project, pic: data.pic, start: data.start, end: data.end, priority: data.priority, status: data.status };
        if (edit) { proj.row = p.row; proj.originalCode = p.code; }
        try {
          await busy($('#save', m), async () => {
            await api.call('saveProject', { project: proj });
            if (asTask) {
              const r = await api.call('saveTask', { task: Object.assign(taskFromProject(proj), { owner: data.owner, startTime: data.startTime, endTime: data.endTime }) });
              if (r && r.task) { const o = S.all.users.find((u) => u.username === r.task.owner); S.all.tasks.push(Object.assign({}, r.task, { ownerName: o ? o.name : r.task.ownerName })); }
            }
          });
          close(); toast(asTask ? 'Project & task dibuat' : 'Project disimpan');
          const data2 = proj;
          if (edit) { Object.assign(S.all.projects.find((x) => x.row === p.row) || {}, data2); softRender(); }
          refreshInBackground(edit ? 800 : 0);
        }
        catch (err) { $('#perr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

/** Data task baru dari sebuah project (untuk project 1 task). */
function taskFromProject(p) {
  return { owner: (ownerFromPic(p.pic || '') || {}).username || '', code: p.code || '', task: p.project || '',
    startDate: p.start || '', endDate: p.end || p.start || '', startTime: '09:00', endTime: '17:00',
    priority: p.priority || 'Medium', status: 'Backlog' };
}
/** Cocokkan isi kolom PIC ("Ari, Wisnu") dengan akun anggota; ambil yang pertama cocok. */
function ownerFromPic(pic) {
  const names = String(pic || '').split(/[,;/&]|\bdan\b/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const people = (S.all ? S.all.users : []).filter((u) => u.sheetName && u.active);
  for (const n of names) {
    const u = people.find((x) => x.name.toLowerCase() === n || x.username === n) || people.find((x) => x.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
    if (u) return u;
  }
  return null;
}

// ---------- Admin: Pengguna ----------
function viewUsers() {
  const all = S.all;
  const noEmail = all.users.filter((u) => u.sheetName && u.active && !u.email).length;
  $('#view').innerHTML = `${all.notifications === false ? `<div class="banner warn"><div><b>Pengingat Google Calendar & email belum aktif.</b> Buka spreadsheet → menu <b>Project Tracker → 2. Aktifkan Calendar &amp; email pengingat</b>, lalu deploy ulang Web App.</div></div>` : ''}
    ${noEmail ? `<div class="banner"><div><b>${noEmail} anggota belum punya email</b> — task mereka belum masuk Google Calendar. Isi lewat tombol Edit, atau minta mereka mengisinya di Pengaturan.</div></div>` : ''}
    <div class="toolbar"><span class="muted small">${all.users.length} akun</span><span class="spacer"></span><button class="btn primary" id="newu">+ Pengguna</button></div>
    <div class="card" style="overflow:auto"><table class="tbl"><thead><tr><th>Nama</th><th>Jabatan</th><th>Username</th><th>Email (Calendar)</th><th>Akses</th><th>Tab task</th><th class="num">Task aktif</th><th>Status</th><th></th></tr></thead><tbody>
    ${all.users.map((u) => `<tr><td><div class="row" style="gap:8px"><span class="avatar" style="width:26px;height:26px;font-size:11px">${initials(u.name)}</span><b>${esc(u.name)}</b></div></td>
      <td class="small">${u.position ? esc(u.position) : '<span class="muted">—</span>'}</td>
      <td><code>${esc(u.username)}</code></td><td class="small">${u.email ? esc(u.email) : (u.sheetName ? '<span class="chip warn">belum diisi</span>' : '<span class="muted">—</span>')}</td><td>${u.role === 'admin' ? '<span class="chip accent">Admin</span>' : 'Anggota'}</td>
      <td>${u.sheetName ? esc(u.sheetName) : '<span class="muted">—</span>'}</td>
      <td class="num">${all.tasks.filter((t) => t.owner === u.username && !L.isDone(t)).length}</td>
      <td>${!u.active ? '<span class="chip">Nonaktif</span>' : u.mustChange ? '<span class="chip warn">Belum login</span>' : '<span class="chip good">Aktif</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-ue="${esc(u.username)}">Edit</button> <button class="btn sm" data-ur="${esc(u.username)}">Reset password</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="def">Setiap anggota dengan tab task punya satu tab di spreadsheet (nama tab = kolom "Tab task"). Password tersimpan sebagai hash di tab Users dan tidak bisa dilihat siapa pun.</p>`;
  $('#newu').onclick = () => userModal(null);
  $$('[data-ue]').forEach((b) => b.onclick = () => userModal(all.users.find((u) => u.username === b.dataset.ue)));
  $$('[data-ur]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Reset password?', `Password ${b.dataset.ur} akan diganti dengan password sementara baru.`, 'Reset'))) return;
    const r = await busy(null, () => api.call('resetPassword', { username: b.dataset.ur }));
    showPassword(b.dataset.ur, r.password); await loadData(true); go('users');
  });
}

function userModal(u) {
  const edit = !!u;
  u = u || { role: 'member', active: true };
  modal({
    title: edit ? 'Edit pengguna' : 'Pengguna baru',
    body: `<form id="uf">
      <label class="field"><span>Nama *</span><input name="name" value="${esc(u.name || '')}" required placeholder="mis. Wildan"></label>
      <label class="field"><span>Username *</span><input name="username" value="${esc(u.username || '')}" ${edit ? 'readonly' : ''} required pattern="[a-zA-Z0-9._-]+" placeholder="huruf kecil tanpa spasi"></label>
      <label class="field"><span>Jabatan</span><input name="position" list="pos-list" maxlength="80" value="${esc(u.position || '')}" placeholder="mis. UI UX &amp; Design Grafis Intern">
        <datalist id="pos-list">${[...new Set((S.all ? S.all.users : []).map((x) => x.position).filter(Boolean))].map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="field"><span>Email (untuk Google Calendar &amp; pengingat)</span><input type="email" name="email" value="${esc(u.email || '')}" placeholder="nama@perusahaan.com"></label>
      <label class="field"><span>Hak akses</span><select name="role"><option value="member" ${u.role !== 'admin' ? 'selected' : ''}>Anggota — melihat & mengubah task sendiri</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin — mengelola semua task, project & pengguna</option></select></label>
      <label class="check"><input type="checkbox" name="hasTasks" ${!edit || u.sheetName ? 'checked' : ''} ${edit && u.sheetName ? 'disabled' : ''}> Punya daftar task (membuat tab di spreadsheet)</label>
      ${edit ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Akun aktif (bisa login)</label>` : ''}
      <div id="uerr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      const f = $('#uf', m);
      if (!edit) f.name.addEventListener('input', () => { f.username.value = f.name.value.toLowerCase().replace(/[^a-z0-9._-]+/g, ''); });
      $('#save', m).onclick = async () => {
        if (!f.reportValidity()) return;
        const data = { name: f.name.value.trim(), username: f.username.value.trim().toLowerCase(), role: f.role.value,
          hasTasks: f.hasTasks.checked, active: edit ? f.active.checked : true, email: f.email.value.trim(), position: f.position.value.trim() };
        try {
          const r = await busy($('#save', m), () => api.call('saveUser', { user: data }));
          close();
          if (r && r.user) { S.all.users = S.all.users.filter((x) => x.username !== r.user.username).concat(r.user); softRender(); }
          refreshInBackground(800);
          if (r.password) showPassword(data.username, r.password); else toast('Pengguna disimpan');
        } catch (err) { $('#uerr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

function showPassword(username, pw) {
  modal({
    title: 'Password sementara',
    body: `<p>Berikan ke <b>${esc(username)}</b>. Password ini hanya ditampilkan sekali dan wajib diganti saat login pertama.</p>
      <div class="pw-box">${esc(pw)}</div>`,
    actions: `<button class="btn" id="cp">Salin</button><button class="btn primary" data-close>Selesai</button>`,
    onMount: (m) => { $('#cp', m).onclick = () => { navigator.clipboard.writeText(pw); toast('Disalin'); }; }
  });
}

// ---------- Pengaturan ----------
function viewSettings() {
  const c = S.cfg;
  const perm = { granted: ['good', 'Aktif'], denied: ['bad', 'Diblokir'], default: ['warn', 'Belum diizinkan'], unsupported: ['', 'Tidak didukung'] }[c.notifPermission] || ['', c.notifPermission];
  const adminOff = S.user.role === 'admin' && S.all && S.all.notifications === false;
  let install;
  if (c.installed) install = '<p>✓ Project Tracker sudah terpasang di perangkat ini.</p>';
  else if (c.canInstall) install = '<p>Pasang sebagai aplikasi agar bisa dibuka dari desktop/home screen tanpa membuka browser.</p><button class="btn primary" id="inst">Pasang aplikasi</button>';
  else if (c.ios) install = '<p>Di iPhone/iPad: buka di <b>Safari</b>, ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas), lalu pilih <b>Tambah ke Layar Utama</b>.</p>';
  else install = '<p>Di Chrome/Edge: klik ikon <b>Install</b> di ujung kanan kolom alamat, atau menu <b>⋮ → Install Project Tracker</b>. Di Android: menu <b>⋮ → Tambahkan ke layar utama</b>.</p>';
  $('#view').innerHTML = `
    <div class="card settings-sect"><div class="card-h"><h2>Google Calendar &amp; email</h2></div><div class="card-b">
      <p>Setiap task Anda otomatis masuk Google Calendar sebagai event <b>▶ mulai</b> dan <b>⏰ deadline</b>, sehingga notifikasi muncul di HP dan laptop walau Project Tracker tidak dibuka. Email pengingat dikirim saat deadline tinggal 24 jam dan saat terlewat, plus ringkasan setiap pagi.</p>
      ${adminOff ? '<div class="banner warn"><div>Fitur ini belum diaktifkan. Admin: buka spreadsheet → menu <b>Project Tracker → 2. Aktifkan Calendar &amp; email pengingat</b>.</div></div>' : ''}
      <form id="ef" class="row" style="flex-wrap:wrap">
        <input type="email" name="email" required placeholder="nama@perusahaan.com" value="${esc(S.user.email || '')}" style="flex:1;min-width:220px">
        <button class="btn primary">Simpan email</button>
      </form>
      <p class="muted small" style="margin:10px 0 0">Gunakan email Google (Workspace/Gmail) yang Anda pakai untuk Google Calendar.</p>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Notifikasi browser</h2><span class="chip ${perm[0]}">${perm[1]}</span></div><div class="card-b">
      <p>Muncul selama Project Tracker terbuka (tab browser atau aplikasi terpasang): saat <b>jam mulai task</b>, sebelum deadline, dan saat <b>melewati deadline</b>.</p>
      ${c.notifPermission === 'denied' ? '<p class="small" style="color:var(--bad)">Notifikasi diblokir. Klik ikon gembok di kolom alamat browser → izinkan Notifikasi, lalu muat ulang.</p>' : ''}
      ${REMINDER_OPTS.map(([m, l]) => `<label class="check"><input type="checkbox" data-rem="${m}" ${c.reminders.includes(m) ? 'checked' : ''}> ${l}</label>`).join('')}
      <div class="row" style="margin-top:12px;flex-wrap:wrap">
        ${c.notifPermission === 'default' ? '<button class="btn primary" id="perm">Izinkan notifikasi</button>' : ''}
        <button class="btn" id="tn" ${c.notifPermission === 'unsupported' || c.notifPermission === 'denied' ? 'disabled' : ''}>Kirim notifikasi uji</button>
      </div>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Tampilan</h2></div><div class="card-b">
      <p>Pilih mode terang atau gelap. <b>Ikuti sistem</b> menyesuaikan otomatis dengan setelan perangkat.</p>
      <div class="theme-pick" id="theme-pick" role="radiogroup" aria-label="Mode tampilan">${THEMES.map(([k, l, ic]) => `<button type="button" role="radio" data-theme-k="${k}" aria-checked="${window.PTTheme.get() === k}" class="${window.PTTheme.get() === k ? 'on' : ''}">
        <span class="tp-prev tp-${k}"><i></i><i></i><i></i></span><span class="tp-lbl">${ic}${l}</span></button>`).join('')}</div>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Pasang di perangkat</h2></div><div class="card-b">${install}</div></div>
    ${S.user.role === 'admin' ? `<div class="card settings-sect"><div class="card-h"><h2>Admin</h2></div><div class="card-b">
      <p>Kelola data tim.</p><div class="row" style="flex-wrap:wrap"><button class="btn" data-go="projects">Project</button><button class="btn" data-go="users">Pengguna</button><button class="btn" data-go="tasks">Semua Task</button></div>
    </div></div>` : ''}
    <div class="card settings-sect"><div class="card-h"><h2>Akun</h2></div><div class="card-b">
      <p>Masuk sebagai <b>${esc(S.user.name)}</b> (${esc(S.user.username)}).</p>
      <div class="row"><button class="btn" id="cpw">Ganti password</button><button class="btn danger" id="lo">Keluar</button></div>
    </div></div>
    ${c.apiLocked && !c.demo ? '' : `<div class="card settings-sect"><div class="card-h"><h2>Server</h2></div><div class="card-b">
      <p>${c.demo ? 'Sedang dalam <b>mode demo</b> — data tidak tersimpan ke spreadsheet.' : `Terhubung ke:<br><code class="small" style="word-break:break-all">${esc(c.apiUrl)}</code>`}</p>
      <button class="btn" id="srv">${c.demo ? 'Keluar dari mode demo' : 'Ganti alamat server'}</button>
    </div></div>`}
    <p class="def">Project Tracker v${esc(c.version)}</p>`;
  $$('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  $('#ef').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await busy($('#ef button'), () => api.call('setMyEmail', { email: e.target.email.value.trim() }));
      S.user = Object.assign(S.user, r.user);
      toast(S.cfg.demo ? 'Email disimpan (mode demo)' : 'Email disimpan — task akan muncul di Google Calendar dalam beberapa menit');
    } catch (err) { /* toast sudah tampil */ }
  };
  $$('[data-rem]').forEach((x) => x.onchange = async () => {
    const r = $$('[data-rem]').filter((i) => i.checked).map((i) => Number(i.dataset.rem));
    await api.setConfig({ reminders: r }); S.cfg = await api.config(); toast('Pengingat disimpan');
  });
  if ($('#perm')) $('#perm').onclick = async () => { await api.requestNotifications(); S.cfg = await api.config(); viewSettings(); };
  $('#tn').onclick = async () => { const ok = await api.testNotification(); S.cfg = await api.config(); if (!ok) toast('Notifikasi tidak diizinkan atau tidak didukung browser ini', true); };
  if ($('#inst')) $('#inst').onclick = async () => { await api.install(); S.cfg = await api.config(); viewSettings(); };
  $('#lo').onclick = async () => { clearCaches(); await api.logout(); S.user = null; resetSession(); S.cfg = await api.config(); showLogin(); };
  if ($('#srv')) $('#srv').onclick = async () => {
    await api.logout();
    if (c.demo) await api.setConfig({ demo: false });
    S.cfg = await api.config();
    if (S.cfg.apiUrl && c.demo) showLogin(); else showSetup();
  };
  $('#cpw').onclick = () => modal({
    title: 'Ganti password',
    body: `<form id="cf"><label class="field"><span>Password lama</span><input type="password" name="o" required></label>
      <label class="field"><span>Password baru (min. 8 karakter)</span><input type="password" name="n" minlength="8" required></label><div id="cerr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      $('#save', m).onclick = async () => {
        const f = $('#cf', m); if (!f.reportValidity()) return;
        try { await busy($('#save', m), () => api.changePassword(f.o.value, f.n.value)); close(); toast('Password diganti'); }
        catch (err) { $('#cerr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

// ---------- event global ----------
$('#btn-logout').onclick = async () => {
  if (!(await confirmBox('Keluar dari akun?', `Anda akan keluar dari akun ${S.user ? S.user.name : ''}. Login lagi untuk masuk dengan akun lain.`, 'Keluar'))) return;
  clearCaches(); await api.logout(); S.user = null; resetSession(); S.cfg = await api.config(); showLogin();
};
// ---------- mode tampilan ----------
function setTheme(k) {
  document.documentElement.classList.add('theme-anim');
  window.PTTheme.set(k);
  setTimeout(() => document.documentElement.classList.remove('theme-anim'), 260);
}
function renderThemeBtn() {
  const dark = window.PTTheme.resolved() === 'dark';
  const b = $('#btn-theme');
  b.innerHTML = dark ? THEME_ICONS.light : THEME_ICONS.dark;
  b.title = dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';
  b.setAttribute('aria-label', b.title);
}
window.PTTheme.onChange(() => { renderThemeBtn(); if (S.user && S.view && !$('#modal-root').innerHTML) { msClose(); go(S.view); } });
renderThemeBtn();
$('#btn-theme').onclick = () => setTheme(window.PTTheme.resolved() === 'dark' ? 'light' : 'dark');
document.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-k]'); if (b) setTheme(b.dataset.themeK); });

$('#btn-refresh').onclick = async () => { setSyncInfo('Menyinkronkan…'); await busy($('#btn-refresh'), () => loadData()); go(S.view); };
api.on('auth:expired', () => { S.user = null; toast('Sesi berakhir, silakan login lagi', true); showLogin(); });
api.on('tasks:refreshed', (tasks) => {
  if (!S.user || !Array.isArray(tasks) || S.pending.size) return;
  S.mine.tasks = tasks;
  if (S.all) S.all.tasks = S.all.tasks.filter((t) => t.owner !== S.user.username).concat(tasks);
  saveCache();
  if (S.view === 'mine' || S.view === 'dashboard') softRender();
});
api.on('reviews:refreshed', (tasks) => {
  if (!S.user || S.user.role !== 'admin' || !S.all || !Array.isArray(tasks)) return;
  tasks.forEach((t) => {
    if (S.pending.has(t.id)) return;
    const i = S.all.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) S.all.tasks[i] = Object.assign({}, S.all.tasks[i], t); else S.all.tasks.push(t);
  });
  saveCache(); renderNav();
  if (S.view === 'review') softRender();
});
api.on('nav:view', (v) => { if (S.user && v) go(v); });
api.on('nav:task', async (id) => {
  if (!S.user || !S.user.sheetName) return;
  S.f.mineTab = 'all'; S.f.mineQ = '';
  go('mine');
  const el = document.getElementById('task-' + id);
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); }
});
setInterval(() => { if (S.user && S.view === 'mine' && !$('#modal-root').innerHTML) renderMineList(); }, 60000);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal-root').innerHTML = ''; });
api.on('install:available', async () => { S.cfg = await api.config(); if (S.user && S.view === 'settings') viewSettings(); });

// ---------- mulai ----------
(async function boot() {
  S.cfg = await api.config();
  if (!S.cfg.apiUrl && !S.cfg.demo) return showSetup();
  if (!S.cfg.user) return showLogin();
  S.user = S.cfg.user;
  if (S.user.mustChange) return showChangePw();
  enterApp();
})();
// ganti tampilan tabel ↔ kartu saat ukuran layar melewati batas HP
matchMedia('(max-width: 760px)').addEventListener('change', () => { if (S.user && ['tasks', 'dashboard'].includes(S.view)) go(S.view); });

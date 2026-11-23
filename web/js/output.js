/* global L, S, api, $, $$, esc, modal, toast, busy, cleanErr, confirmBox, tile, go, softRender, pct, MONTHS, isHttp, formPick, teamData, loadTeam */
'use strict';
// ---------- Target output (Grand Plan) & Backlink ----------
// Hasil kerja dihitung dari task berstatus Done (tanggal Done) dan backlink berstatus Tayang (tanggal tayang).
// Jenis output task disimpan di kolom outKind; task Sosmed otomatis dihitung sebagai post sosmed,
// task Artikel tanpa jenis dihitung sebagai "Artikel biasa".

/** Kelompok target: [label, target per bulan, keterangan sumber]. Ubah target di sini. */
const OUT_KINDS = [
  ['Artikel TL industri', 16, 'task'],
  ['Studi kasus', 4, 'task'],
  ['Optimasi', 16, 'optimasi + draf optimasi'],
  ['Post sosmed', 12, 'task Sosmed'],
  ['Backlink', 12, 'tayang · LinovHR & Lawencon']
];
/** Jenis output task/backlink → kelompok target ('' = tidak dihitung ke target). */
const OUT_GROUP = { 'Artikel TL industri': 'Artikel TL industri', 'Studi kasus': 'Studi kasus', 'Optimasi artikel': 'Optimasi', 'Draf optimasi': 'Optimasi',
  'Post LinkedIn & Instagram': 'Post sosmed', 'Backlink berkualitas': 'Backlink', 'Artikel mention eksternal': 'Backlink', 'Backlink Lawencon': 'Backlink' };
/** Jenis output yang bisa dipilih di form task (Sosmed otomatis). */
/** Target Grand Plan berlaku mulai tahun ini; tahun sebelumnya ditampilkan sebagai uji coba (tanpa target tahunan). */
const GP_YEAR = 2027;
const TASK_OUT_KINDS = ['Artikel TL industri', 'Studi kasus', 'Artikel biasa', 'Optimasi artikel', 'Draf optimasi', 'Artikel Lawencon'];
const OUT_NEEDS_INDUSTRY = ['Artikel TL industri', 'Studi kasus'];
const INDUSTRIES = ['Startup', 'Teknologi', 'Jasa Profesional', 'Keuangan', 'Perhotelan', 'F&B', 'Ritel', 'Kesehatan', 'Logistik', 'Manufaktur',
  'Konstruksi', 'Sektor Riil', 'Pertanian', 'Perkebunan', 'Pertambangan', 'Minyak & Gas', 'Outsourcing'];
const BL_STATUSES = ['Prospek', 'Outreach terkirim', 'Negosiasi', 'Tayang', 'Ditolak', 'Hilang'];
const BL_OPEN = ['Prospek', 'Outreach terkirim', 'Negosiasi'];
const BL_VIA = ['Guest post', 'Partnership', 'Listing / direktori', 'PR / media', 'Komunitas / forum', 'Lainnya'];
const BL_CHIP = { Prospek: '', 'Outreach terkirim': 'info', Negosiasi: 'warn', Tayang: 'good', Ditolak: 'bad', Hilang: 'bad' };

/** Jenis output sebuah task ('' = tidak dihitung ke target). */
function outKindOf(t) {
  if (!t) return '';
  if (t.outKind && TASK_OUT_KINDS.includes(t.outKind)) return t.outKind;
  if (t.type === 'Sosmed') return 'Post LinkedIn & Instagram';
  if (L.isArticle(t)) return 'Artikel biasa';
  return '';
}
/** Jenis output sebuah backlink yang sudah tayang. */
function blKindOf(b) {
  if (!b) return '';
  if (b.brand === 'Lawencon') return 'Backlink Lawencon';
  return b.kind === 'Mention artikel' ? 'Artikel mention eksternal' : 'Backlink berkualitas';
}
const ymOf = (v) => String(v || '').slice(0, 7);   // 'yyyy-mm' dari tanggal ISO
function doneYm(t) {
  if (!L.isDone(t) || !t.doneAt) return '';
  const d = new Date(t.doneAt); if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Hitung hasil per jenis output untuk satu bulan ('yyyy-mm') dan setahun ('yyyy'). */
function outCounts(tasks, backlinks, ym) {
  const y = ym.slice(0, 4), month = {}, year = {}, byMonth = {}, people = {};
  OUT_KINDS.forEach(([k]) => { month[k] = 0; year[k] = 0; });
  const add = (kind, m, who) => {
    const k = OUT_GROUP[kind];
    if (!k || !m) return;
    byMonth[m] = (byMonth[m] || 0) + 1;
    if (m.slice(0, 4) === y) year[k] = (year[k] || 0) + 1;
    if (m === ym) {
      month[k] = (month[k] || 0) + 1;
      if (who) { const p = people[who] = people[who] || {}; p[k] = (p[k] || 0) + 1; }
    }
  };
  (tasks || []).forEach((t) => { if (!L.isRequest(t)) add(outKindOf(t), doneYm(t), t.owner); });
  (backlinks || []).forEach((b) => { if (b.status === 'Tayang') add(blKindOf(b), ymOf(b.date), b.pic); });
  return { month, year, byMonth, people };
}

// ---------- data backlink ----------
let blLoading = null;
function loadBacklinks(force) {
  if (blLoading) return blLoading;
  if (!force && S.backlinks && Date.now() - (S.blAt || 0) < 15000) return Promise.resolve(false);   // data masih baru: tidak ada perubahan (true di sini memicu render berulang)
  blLoading = api.call('backlinks').then((r) => {
    const before = JSON.stringify(S.backlinks || null);
    S.backlinks = (r && r.backlinks) || []; S.blAt = Date.now();
    return before !== JSON.stringify(S.backlinks);
  }).catch((e) => { toast(cleanErr(e), true); return false; }).finally(() => { blLoading = null; });
  return blLoading;
}
/** Muat ulang backlink di belakang layar, lalu gambar ulang bila ada perubahan. */
function refreshBacklinks(view) {
  loadBacklinks().then((changed) => { if (changed && S.view === view) softRender(); });
}
const blAvailable = () => !!(S.cfg && (S.cfg.demo || (window.PT_CONFIG || {}).backend === 'firebase'));
const peopleList = () => {
  const d = (S.all && S.all.users) || ((teamData() || {}).users) || [];
  return d.filter((u) => u.active !== false && (u.sheetName || u.username));
};
const personName = (u) => ((peopleList().find((x) => x.username === u) || {}).name) || u || '–';
function domainOf(url) {
  try { return new URL(String(url).trim()).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---------- halaman Target ----------
function viewTarget() {
  const tasksSrc = S.user.role === 'admin' && S.all ? S.all.tasks : (teamData() || {}).tasks;
  if (!tasksSrc) {
    $('#view').innerHTML = '<div class="loading">Memuat data tim…</div>';
    loadTeam().then((ok) => { if (ok && S.view === 'target') go('target'); });
    return;
  }
  if (blAvailable()) {
    if (!S.backlinks) { $('#view').innerHTML = '<div class="loading">Memuat data backlink…</div>'; loadBacklinks(true).then(() => { if (S.view === 'target') go('target'); }); return; }
    refreshBacklinks('target');
  }
  const now = new Date();
  const f = S.tf = S.tf || { y: now.getFullYear(), m: now.getMonth() + 1 };
  const ym = f.y + '-' + String(f.m).padStart(2, '0');
  const bls = S.backlinks || [];
  const c = outCounts(tasksSrc, bls, ym);
  const monthTarget = OUT_KINDS.reduce((n, k) => n + k[1], 0);
  const monthDone = OUT_KINDS.reduce((n, [k, t]) => n + (t ? Math.min(c.month[k], t) : 0), 0);
  const monthAll = OUT_KINDS.reduce((n, [k]) => n + c.month[k], 0);
  const curM = f.y === now.getFullYear() ? now.getMonth() + 1 : f.y < now.getFullYear() ? 12 : 0;
  const gp = f.y >= GP_YEAR;   // tahun sebelum Grand Plan: target tahunan tidak dihitung
  const ytdTarget = monthTarget * f.m;
  const ytdDone = OUT_KINDS.reduce((n, [k, t]) => n + (t ? Math.min(c.year[k], t * f.m) : 0), 0);
  const open = bls.filter((b) => BL_OPEN.includes(b.status)).length;
  const ratioCls = (r) => r === null ? '' : r >= 1 ? 'good' : r >= 0.7 ? 'info' : r >= 0.4 ? 'warn' : 'bad';
  const ratio = (a, b) => b ? a / b : null;
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  if (!years.includes(f.y)) years.push(f.y);
  const pctChip = (r) => r === null ? '<span class="muted">–</span>' : `<span class="chip ${ratioCls(r)}">${pct(r)}</span>`;
  const rows = OUT_KINDS.map(([k, t, src]) => `<tr>
      <td><b>${esc(k)}</b>${src !== 'task' ? ` <span class="muted small">· ${esc(src)}</span>` : ''}</td>
      <td class="num">${c.month[k]} <span class="muted">/ ${t}</span></td><td class="num">${pctChip(ratio(c.month[k], t))}</td>
      <td class="num">${c.year[k]}${gp ? ` <span class="muted">/ ${t * 12}</span>` : ''}</td><td class="num">${gp ? pctChip(ratio(c.year[k], t * 12)) : '<span class="muted">–</span>'}</td></tr>`).join('');
  // per orang (bulan terpilih)
  const kindsUsed = OUT_KINDS.map((k) => k[0]).filter((k) => Object.values(c.people).some((p) => p[k]));
  const short = { 'Artikel TL industri': 'TL', 'Post sosmed': 'Sosmed' };
  const people = Object.keys(c.people).map((u) => ({ u, name: personName(u), p: c.people[u], total: Object.values(c.people[u]).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  // industri: TL & studi kasus Done di tahun terpilih
  const ind = {};
  tasksSrc.forEach((t) => { const k = outKindOf(t); if (OUT_NEEDS_INDUSTRY.includes(k) && doneYm(t).slice(0, 4) === String(f.y) && t.industry) ind[t.industry] = (ind[t.industry] || 0) + 1; });
  const covered = INDUSTRIES.filter((x) => ind[x]).length;
  const months = Array.from({ length: 12 }, (_, i) => f.y + '-' + String(i + 1).padStart(2, '0'));
  const maxM = Math.max(monthTarget, ...months.map((m) => c.byMonth[m] || 0));

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg" id="tg-y">${years.sort().map((y) => `<button data-y="${y}" class="${y === f.y ? 'on' : ''}">${y}</button>`).join('')}</div>
      <div class="tg-month"><select id="tg-m" data-pick="plain" aria-label="Bulan">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === f.m ? 'selected' : ''}>${m} ${f.y}</option>`).join('')}</select></div>
      ${S.user.role === 'admin' ? '<span class="muted small">Jenis output diatur di form task (Semua Task → Edit). Backlink dicatat di menu Backlink.</span>' : ''}
    </div>
    <div class="tiles">
      ${tile('Hasil ' + MONTHS[f.m - 1], monthAll, `target ${monthTarget}/bulan · capaian ${pct(monthTarget ? monthDone / monthTarget : null)}`, 'var(--brand)')}
      ${gp ? tile('Capaian s.d. ' + MONTHS[f.m - 1] + ' ' + f.y, pct(ytdTarget ? ytdDone / ytdTarget : null), `${ytdDone} dari ${ytdTarget} (target Jan–${MONTHS[f.m - 1]})`, 'var(--good)')
        : tile('Target tahunan', '–', `berlaku mulai Jan ${GP_YEAR}; ${f.y} dipakai untuk uji coba`, 'var(--good)')}
      ${tile('Industri tercover ' + f.y, `${covered}/${INDUSTRIES.length}`, 'punya artikel TL / studi kasus yang Done', 'var(--info)')}
      ${blAvailable() ? tile('Backlink dalam proses', open, 'prospek · outreach · negosiasi', 'var(--warn)') : ''}
    </div>
    <div class="card" style="margin-bottom:12px"><div class="card-h"><h2>Target bulanan & tahunan</h2><span class="muted small">${MONTHS[f.m - 1]} ${f.y} · tahun ${f.y}</span></div>
      <div class="card-b" style="padding-top:6px;overflow:auto"><table class="tbl tg-tbl"><thead><tr><th>Target</th><th class="num">${MONTHS[f.m - 1]}</th><th class="num">%</th><th class="num">${f.y}</th><th class="num">%</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
    <div class="dash-grid">
      <div class="card"><div class="card-h"><h2>Hasil per orang</h2><span class="muted small">${MONTHS[f.m - 1]} ${f.y}</span></div>
        <div class="card-b" style="padding-top:6px;overflow:auto">${people.length ? `<table class="tbl"><thead><tr><th>Nama</th>${kindsUsed.map((k) => `<th class="num">${esc(short[k] || k)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${people.map((p) => `<tr><td>${esc(p.name)}</td>${kindsUsed.map((k) => `<td class="num">${p.p[k] || '<span class="muted">–</span>'}</td>`).join('')}<td class="num"><b>${p.total}</b></td></tr>`).join('')}</tbody></table>`
          : '<div class="empty"><b>Belum ada hasil di bulan ini</b>Hasil masuk saat task disetujui (Done) atau backlink berstatus Tayang.</div>'}</div></div>
      <div class="card"><div class="card-h"><h2>Per bulan ${f.y}</h2><span class="muted small">hasil vs target ${monthTarget}</span></div>
        <div class="card-b">${months.map((m, i) => { const n = c.byMonth[m] || 0, r = monthTarget ? n / monthTarget : 0, future = i + 1 > curM;
          return `<div class="tg-mrow ${future ? 'future' : ''} ${i + 1 === f.m ? 'cur' : ''}"><span>${MONTHS[i]}</span><div class="bar"><i style="width:${(n / maxM) * 100}%;background:${r >= 1 ? 'var(--good)' : 'var(--brand)'}"></i><s style="left:${(monthTarget / maxM) * 100}%"></s></div><b>${n}</b></div>`; }).join('')}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px"><div class="card-h"><h2>Cakupan industri ${f.y}</h2><span class="muted small">artikel TL industri & studi kasus yang Done</span></div>
      <div class="card-b"><div class="tg-ind">${INDUSTRIES.map((x) => `<span class="chip ${ind[x] ? 'good' : ''}">${ind[x] ? '✓' : '○'} ${esc(x)}${ind[x] ? ` · ${ind[x]}` : ''}</span>`).join('')}</div></div></div>
    <p class="def">Cara menghitung — <b>Task</b> dihitung pada bulan disetujui (Done), sesuai <b>Jenis output</b> di form task: TL industri, Studi kasus, Optimasi (optimasi artikel + draf optimasi). Task <b>Sosmed</b> otomatis masuk Post sosmed. Artikel biasa, Artikel Lawencon, dan task Request tidak masuk target. <b>Backlink</b> dihitung pada tanggal tayang (status Tayang), LinovHR & Lawencon, termasuk mention. Persentase capaian total tidak menghitung kelebihan satu target untuk menutup kekurangan target lain.</p>`;
  formPick($('#view'));
  $$('#tg-y button').forEach((b) => b.onclick = () => { f.y = Number(b.dataset.y); go('target'); });
  $('#tg-m').onchange = (e) => { f.m = Number(e.target.value); go('target'); };
}

// ---------- halaman Backlink ----------
function viewBacklinks() {
  if (!blAvailable()) {
    $('#view').innerHTML = '<div class="empty"><b>Menu Backlink hanya tersedia di versi Firebase</b>Buka aplikasi dari alamat utama.</div>';
    return;
  }
  if (!S.backlinks) {
    $('#view').innerHTML = '<div class="loading">Memuat data backlink…</div>';
    loadBacklinks(true).then(() => { if (S.view === 'backlinks') go('backlinks'); });
    return;
  }
  refreshBacklinks('backlinks');
  if (!(S.all && S.all.users) && !teamData()) loadTeam().then((ok) => { if (ok && S.view === 'backlinks') softRender(); });
  const f = S.blf = S.blf || { brand: '', q: '', closed: false, mine: false };
  const q = f.q.trim().toLowerCase();
  const list = S.backlinks.filter((b) => (!f.brand || b.brand === f.brand) && (!f.mine || b.pic === S.user.username)
    && (!q || [b.domain, b.sourceUrl, b.targetUrl, b.anchor, b.notes, personName(b.pic)].join(' ').toLowerCase().includes(q)));
  const by = {}; BL_STATUSES.forEach((s) => { by[s] = []; });
  list.forEach((b) => { (by[b.status] || by.Prospek).push(b); });
  const sortKey = (b) => String(b.status === 'Tayang' ? b.date : b.updatedAt || b.createdAt || '');
  Object.keys(by).forEach((s) => by[s].sort((a, b) => sortKey(b).localeCompare(sortKey(a))));
  const ym = todayIso().slice(0, 7);
  const liveThisMonth = (brand, kind) => S.backlinks.filter((b) => b.status === 'Tayang' && ymOf(b.date) === ym && blKindOf(b) === kind && (!brand || b.brand === brand)).length;
  const cols = BL_STATUSES.filter((s) => f.closed || !['Ditolak', 'Hilang'].includes(s));
  const closedN = by.Ditolak.length + by.Hilang.length;
  const card = (b) => `<div class="bl-card" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="Ubah backlink ${esc(b.domain)}">
      <div class="bl-top"><b class="bl-dom">${esc(b.domain || domainOf(b.sourceUrl) || '(tanpa domain)')}</b>${b.dr !== '' && b.dr != null ? `<span class="chip" title="Domain Rating">DR ${esc(b.dr)}</span>` : ''}</div>
      ${b.anchor ? `<div class="small">“${esc(b.anchor)}”</div>` : ''}
      ${b.targetUrl ? `<div class="muted small bl-clip" title="${esc(b.targetUrl)}">→ ${esc(String(b.targetUrl).replace(/^https?:\/\/(www\.)?/, ''))}</div>` : ''}
      <div class="bl-meta"><span class="chip ${b.brand === 'Lawencon' ? 'warn' : 'info'}">${esc(b.brand)}</span>${b.kind === 'Mention artikel' ? '<span class="chip">Mention</span>' : ''}${b.rel === 'Nofollow' ? '<span class="chip">Nofollow</span>' : ''}${b.via ? `<span class="chip">${esc(b.via)}</span>` : ''}</div>
      <div class="bl-foot"><span class="muted small">${esc(personName(b.pic))}${b.status === 'Tayang' && b.date ? ' · ' + fmtIso(b.date) : ''}</span>
        ${BL_OPEN.includes(b.status) ? `<button class="btn sm" data-next="${esc(b.id)}" title="Pindah ke tahap berikutnya">${b.status === 'Negosiasi' ? '✓ Tayang' : '→ ' + esc(BL_STATUSES[BL_STATUSES.indexOf(b.status) + 1])}</button>` : ''}</div>
    </div>`;
  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" id="bl-q" placeholder="Cari domain, anchor, URL…" value="${esc(f.q)}" aria-label="Cari backlink">
      <div class="seg" id="bl-brand">${[['', 'Semua'], ['LinovHR', 'LinovHR'], ['Lawencon', 'Lawencon']].map(([k, l]) => `<button data-b="${k}" class="${f.brand === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn sm ${f.mine ? 'on' : ''}" id="bl-mine" aria-pressed="${f.mine}">PIC saya</button>
      <button class="btn sm ${f.closed ? 'on' : ''}" id="bl-closed" aria-pressed="${f.closed}">${f.closed ? 'Sembunyikan ditolak/hilang' : `Tampilkan ditolak/hilang (${closedN})`}</button>
      <span style="flex:1"></span>
      <button class="btn primary" id="bl-add">+ Backlink</button>
    </div>
    <div class="tiles">
      ${tile('Backlink LinovHR · ' + MONTHS[new Date().getMonth()], liveThisMonth('LinovHR', 'Backlink berkualitas'), 'tayang bulan ini · target 8', 'var(--brand)')}
      ${tile('Mention eksternal · ' + MONTHS[new Date().getMonth()], liveThisMonth('LinovHR', 'Artikel mention eksternal'), 'tayang bulan ini · target 2', 'var(--info)')}
      ${tile('Backlink Lawencon · ' + MONTHS[new Date().getMonth()], liveThisMonth('Lawencon', 'Backlink Lawencon'), 'tayang bulan ini · target 2', 'var(--gold)')}
      ${tile('Dalam proses', S.backlinks.filter((b) => BL_OPEN.includes(b.status)).length, 'prospek · outreach · negosiasi', 'var(--warn)')}
    </div>
    ${S.backlinks.length ? `<div class="bl-board" style="--cols:${cols.length}">${cols.map((s) => `<section class="bl-col"><h3><span class="chip ${BL_CHIP[s]}">${esc(s)}</span><span class="muted small">${by[s].length}</span></h3>
        ${by[s].length ? by[s].slice(0, s === 'Tayang' ? 40 : 200).map(card).join('') + (s === 'Tayang' && by[s].length > 40 ? `<p class="muted small">+${by[s].length - 40} lainnya — gunakan pencarian.</p>` : '') : '<p class="muted small bl-none">Kosong</p>'}</section>`).join('')}</div>`
      : `<div class="card"><div class="empty"><b>Belum ada backlink</b>Catat target outreach sejak masih prospek. Saat statusnya diubah ke Tayang, backlink otomatis dihitung ke target bulanan.<br><br><button class="btn primary" id="bl-add2">+ Backlink pertama</button></div></div>`}
    <p class="def">Alur: <b>Prospek</b> (calon situs) → <b>Outreach terkirim</b> → <b>Negosiasi</b> → <b>Tayang</b>. Hanya yang berstatus Tayang yang dihitung ke target, pada tanggal tayangnya. Backlink yang dicabut: ubah ke <b>Hilang</b> (jangan dihapus) agar riwayatnya tetap ada. Semua anggota bisa menambah dan mengubah; yang bisa menghapus hanya pembuatnya dan admin.</p>`;
  const qi = $('#bl-q');
  qi.oninput = () => { f.q = qi.value; clearTimeout(S.blQt); S.blQt = setTimeout(() => { go('backlinks'); const x = $('#bl-q'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250); };
  $$('#bl-brand button').forEach((b) => b.onclick = () => { f.brand = b.dataset.b; go('backlinks'); });
  $('#bl-mine').onclick = () => { f.mine = !f.mine; go('backlinks'); };
  $('#bl-closed').onclick = () => { f.closed = !f.closed; go('backlinks'); };
  [$('#bl-add'), $('#bl-add2')].forEach((b) => { if (b) b.onclick = () => backlinkModal(null); });
  $$('.bl-card').forEach((el) => {
    const open = (e) => { if (e.target.closest('[data-next]')) return; backlinkModal(S.backlinks.find((x) => x.id === el.dataset.id)); };
    el.onclick = open; el.onkeydown = (e) => { if (e.key === 'Enter') open(e); };
  });
  $$('[data-next]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const x = S.backlinks.find((y) => y.id === b.dataset.next); if (!x) return;
    const next = BL_STATUSES[BL_STATUSES.indexOf(x.status) + 1];
    if (next === 'Tayang') { backlinkModal(x, 'Tayang'); return; }   // tayang: minta URL sumber & tanggal
    saveBacklink(Object.assign({}, x, { status: next }), b);
  });
}

async function saveBacklink(data, btn) {
  const r = await busy(btn, () => api.call('saveBacklink', { backlink: data }));
  if (r && r.backlink) {
    S.backlinks = (S.backlinks || []).filter((x) => x.id !== r.backlink.id).concat(r.backlink); S.blAt = Date.now();
    toast(data.id ? 'Backlink diperbarui' : 'Backlink ditambahkan');
    if (S.view === 'backlinks' || S.view === 'target') go(S.view);
  }
  return r;
}

function backlinkModal(b, forceStatus) {
  const edit = !!b;
  b = Object.assign({ brand: 'LinovHR', kind: 'Backlink', rel: 'Dofollow', status: 'Prospek', pic: S.user.username, via: '', dr: '', date: '' }, b || {});
  if (forceStatus) { b = Object.assign({}, b, { status: forceStatus }); if (forceStatus === 'Tayang' && !b.date) b.date = todayIso(); }
  const people = peopleList();
  if (b.pic && !people.some((u) => u.username === b.pic)) people.push({ username: b.pic, name: b.pic });
  const opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l || v)}</option>`;
  const canDelete = edit && (S.user.role === 'admin' || b.createdBy === S.user.username);
  modal({
    title: edit ? 'Ubah backlink' : 'Backlink baru', wide: true,
    body: `<form id="blf">
      <div class="grid2">
        <div class="field"><span>Brand</span><div class="seg seg-pick" id="blf-brand">${['LinovHR', 'Lawencon'].map((k) => `<button type="button" data-v="${k}" class="${b.brand === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
        <div class="field"><span>Jenis</span><div class="seg seg-pick" id="blf-kind">${[['Backlink', 'Backlink'], ['Mention artikel', 'Mention artikel']].map(([k, l]) => `<button type="button" data-v="${k}" class="${b.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="grid2">
        <label class="field"><span>Status</span><select name="status" data-pick="plain">${BL_STATUSES.map((s) => opt(s, b.status)).join('')}</select></label>
        <label class="field"><span>Tanggal tayang <small class="muted">— wajib bila Tayang</small></span><input type="date" name="date" value="${esc(b.date || '')}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Domain sumber *</span><input name="domain" value="${esc(b.domain || '')}" placeholder="contoh.com" required></label>
        <label class="field"><span>DR <small class="muted">(Ahrefs)</small></span><input type="number" name="dr" min="0" max="100" value="${esc(b.dr === null ? '' : b.dr)}"></label>
      </div>
      <label class="field"><span>URL halaman sumber <small class="muted">— halaman yang memasang link</small></span><input type="url" name="sourceUrl" value="${esc(b.sourceUrl || '')}" placeholder="https://contoh.com/artikel/…"></label>
      <label class="field"><span>URL tujuan <small class="muted">— halaman ${esc(b.brand)} yang ditautkan</small></span><input type="url" name="targetUrl" value="${esc(b.targetUrl || '')}" placeholder="https://www.linovhr.com/…"></label>
      <div class="grid2">
        <label class="field"><span>Anchor text</span><input name="anchor" value="${esc(b.anchor || '')}" maxlength="200"></label>
        <label class="field"><span>Link</span><select name="rel" data-pick="plain">${['Dofollow', 'Nofollow'].map((s) => opt(s, b.rel)).join('')}</select></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Cara dapat</span><select name="via" data-pick="plain">${opt('', b.via, '— pilih —')}${BL_VIA.map((s) => opt(s, b.via)).join('')}</select></label>
        <label class="field"><span>PIC</span><select name="pic" data-pick="plain">${people.map((u) => opt(u.username, b.pic, u.name)).join('')}</select></label>
      </div>
      <label class="field"><span>Catatan <small class="muted">— kontak, harga, syarat, dll.</small></span><textarea name="notes" rows="2" maxlength="2000">${esc(b.notes || '')}</textarea></label>
      <div id="blerr"></div></form>`,
    actions: `${canDelete ? '<button class="btn danger" id="bl-del" style="margin-right:auto">Hapus</button>' : ''}<button class="btn" data-close>Batal</button><button class="btn primary" id="bl-save">${edit ? 'Simpan' : 'Tambah'}</button>`,
    onMount: (m, close) => {
      formPick(m);
      const f = $('#blf', m), pick = { brand: b.brand, kind: b.kind };
      ['brand', 'kind'].forEach((k) => $$(`#blf-${k} button`, m).forEach((x) => x.onclick = () => {
        pick[k] = x.dataset.v; $$(`#blf-${k} button`, m).forEach((y) => y.classList.toggle('on', y === x));
      }));
      f.sourceUrl.addEventListener('change', () => { if (!f.domain.value.trim()) f.domain.value = domainOf(f.sourceUrl.value); });
      f.status.addEventListener('change', () => { if (f.status.value === 'Tayang' && !f.date.value) f.date.value = todayIso(); });
      const err = (msg) => { $('#blerr', m).innerHTML = `<div class="error">${esc(msg)}</div>`; };
      $('#bl-save', m).onclick = async () => {
        const d = Object.fromEntries(new FormData(f).entries());
        Object.keys(d).forEach((k) => { d[k] = String(d[k]).trim(); });
        d.domain = (d.domain || domainOf(d.sourceUrl)).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
        if (!d.domain) return err('Isi domain sumber.');
        if (d.sourceUrl && !isHttp(d.sourceUrl)) return err('URL halaman sumber harus diawali http:// atau https://');
        if (d.targetUrl && !isHttp(d.targetUrl)) return err('URL tujuan harus diawali http:// atau https://');
        if (d.status === 'Tayang' && !d.date) return err('Isi tanggal tayang.');
        if (d.status === 'Tayang' && !d.sourceUrl) return err('Isi URL halaman sumber untuk backlink yang sudah tayang.');
        const saved = await saveBacklink(Object.assign({}, edit ? { id: b.id } : {}, d, pick, { dr: d.dr === '' ? '' : Math.max(0, Math.min(100, Math.round(Number(d.dr) || 0))) }), $('#bl-save', m)).catch(() => null);
        if (saved) close();
      };
      const del = $('#bl-del', m);
      if (del) del.onclick = async () => {
        close();
        if (!(await confirmBox('Hapus backlink?', `Backlink dari ${b.domain} dihapus permanen. Bila link-nya dicabut, lebih baik ubah status ke "Hilang" agar riwayatnya tetap ada.`))) return;
        try { await api.call('deleteBacklink', { id: b.id }); S.backlinks = S.backlinks.filter((x) => x.id !== b.id); toast('Backlink dihapus'); go(S.view); }
        catch (e) { toast(cleanErr(e), true); }
      };
    }
  });
}

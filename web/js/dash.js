/* global L, S, $, $$, esc, css, pct, initials, go, softRender, openTask, whenInfo, artStage, ago, relDur, Chart, chartDefaults,
   bankAvailable, loadBank, bankOpen, bankTitleOf, BANK_CHIP, bankKindName, firstName, userName, renderWeeklyChart */
'use strict';
// ---------- Dashboard bagian atas (v2.42) ----------
// Kolom kiri: task saya (kartu pastel). Tengah: status task (donat), selesai vs terlambat per minggu, hasil per orang.
// Kanan: admin → Perlu direview & Ide masuk; anggota → Pengajuan saya & Ide saya.

const DH_KIND = [
  [(t) => t.outKind === 'Artikel TL industri', 'TL', 'peach'],
  [(t) => t.outKind === 'Studi kasus', 'SK', 'sky'],
  [(t) => /optimasi/i.test(t.outKind || ''), 'OP', 'rose'],
  [(t) => t.outKind === 'Artikel Lawencon', 'LW', 'lilac'],
  [(t) => L.isRequest(t), 'RQ', 'lilac'],
  [(t) => L.isArticle(t), 'AR', 'sky'],
  [(t) => /sosmed|social|konten/i.test(t.type || ''), 'SM', 'mint'],
  [() => true, 'TK', 'mint']
];
const dhKind = (t) => DH_KIND.find((k) => k[0](t));
const dhTitle = (t) => String(t.task || '').replace(/^https?:\/\/(www\.)?/, '').trim() || '(tanpa judul)';
const dhReturned = (t) => !L.isDone(t) && t.status !== 'Review' && /\[Dikembalikan/.test(String(t.notes || ''));

function dhMyTasks(tab) {
  const now = new Date(), eod = new Date(now); eod.setHours(23, 59, 59, 999);
  const eow = new Date(eod); eow.setDate(eow.getDate() + ((7 - eow.getDay()) % 7));
  const act = ((S.mine && S.mine.tasks) || []).filter((t) => !L.isDone(t) && t.status !== 'Recurring');
  const end = (t) => L.evaluate(t).plannedEnd;
  const pick = tab === 'week' ? act.filter((t) => !end(t) || end(t) <= eow) : tab === 'all' ? act
    : act.filter((t) => (end(t) && end(t) <= eod) || t.status === 'On-Progress' || t.status === 'Review' || dhReturned(t));
  return pick.sort((a, b) => (dhReturned(b) - dhReturned(a)) || ((end(a) || 9e15) - (end(b) || 9e15)));
}

function dhTaskCard(t) {
  const [, tag, tone] = dhKind(t), w = whenInfo(t), art = L.isArticle(t), st = art ? artStage(t) : 0;
  const stage = art ? (st >= 9 ? 'Selesai' : `Tahap ${st} · ${L.STAGES[st]}`) : t.status;
  return `<button type="button" class="dh-tk ${tone}" data-open="${esc(t.id)}">
    <span class="dh-ic">${tag}</span>
    <b>${esc(dhTitle(t))}</b>
    ${dhReturned(t) ? '<p class="dh-ret">Dikembalikan admin, ada catatan perbaikan</p>' : t.industry ? `<p>${esc(t.industry)}${t.code ? ' · ' + esc(t.code) : ''}</p>` : t.code ? `<p>${esc(t.code)}</p>` : ''}
    <span class="dh-meta"><span class="dh-tag">${esc(stage)}</span><span class="dh-tag ${w.cls === 'bad' ? 'bad' : w.cls === 'warn' ? 'warn' : ''}">${w.main.replace(/<[^>]+>/g, '')}</span></span>
  </button>`;
}

function dhDonut(sum) {
  const parts = [['Selesai', sum.over + sum.ontime + sum.late, '--good'], ['Berjalan', sum.open, '--brand'], ['Menunggu review', sum.review, '--review'], ['Lewat deadline', sum.overdue, '--bad']];
  const total = parts.reduce((n, p) => n + p[1], 0), C = 2 * Math.PI * 15.9;
  let off = 0;
  const segs = total ? parts.filter((p) => p[1]).map(([, n, c]) => { const len = (n / total) * C, gap = parts.filter((p) => p[1]).length > 1 ? Math.min(1.2, len * .25) : 0;
    const s = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${css(c)}" stroke-width="4.6" stroke-linecap="round" stroke-dasharray="${Math.max(.01, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 21 21)"/>`;
    off += len; return s; }).join('') : '';
  return `<div class="dh-donut"><svg viewBox="0 0 42 42" role="img" aria-label="Status task: ${parts.map((p) => p[0] + ' ' + p[1]).join(', ')}">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="${css('--surface-2')}" stroke-width="4.6"/>${segs}
      <text x="21" y="21.5" text-anchor="middle" class="dh-dn">${sum.total}</text><text x="21" y="27" text-anchor="middle" class="dh-dl">task</text></svg>
    <div class="dh-leg">${parts.map(([l, n, c]) => `<span><i class="dot" style="background:${css(c)}"></i>${l} <b>${n}</b></span>`).join('')}</div></div>`;
}

/** Selesai tepat waktu vs terlambat per minggu (6 minggu terakhir). */
function dhWeekly(tasks) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 5 * 7);
  const weeks = Array.from({ length: 6 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i * 7); return d; });
  const ok = weeks.map(() => 0), late = weeks.map(() => 0);
  tasks.forEach((t) => {
    if (!L.isDone(t)) return;
    const e = L.evaluate(t), at = e.doneAt || t.doneAt; if (!at) return;
    const d = new Date(at), i = weeks.findIndex((w, j) => d >= w && d < (weeks[j + 1] || new Date(w.getTime() + 7 * 864e5)));
    if (i < 0) return;
    if (e.outcome === 'late') late[i]++; else ok[i]++;
  });
  return { labels: weeks.map((w) => w.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][w.getMonth()]), ok, late };
}

function dhLineChart(tasks) {
  const box = $('#dh-line'); if (!box || typeof Chart === 'undefined') return;
  chartDefaults();
  const w = dhWeekly(tasks), c1 = css('--brand'), c2 = css('--warn');
  const grad = (ctx, c) => { const g = ctx.createLinearGradient(0, 0, 0, box.clientHeight || 160); g.addColorStop(0, c + '38'); g.addColorStop(1, c + '00'); return g; };
  const ctx = box.getContext('2d');
  S.charts.push(new Chart(box, {
    type: 'line',
    data: { labels: w.labels, datasets: [
      { label: 'Tepat waktu', data: w.ok, borderColor: c1, backgroundColor: grad(ctx, c1), fill: true, cubicInterpolationMode: 'monotone', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderWidth: 2.5 },
      { label: 'Terlambat', data: w.late, borderColor: c2, backgroundColor: grad(ctx, c2), fill: true, cubicInterpolationMode: 'monotone', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderWidth: 2.5 }] },
    options: { maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => 'Minggu ' + it[0].label } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 4 }, grid: { color: css('--border') }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } } }
  }));
  const s = $('#dh-line-sum'); if (s) s.innerHTML = `<span><i class="dot" style="background:${c1}"></i>Tepat waktu ${w.ok.reduce((a, b) => a + b, 0)}</span><span><i class="dot" style="background:${c2}"></i>Terlambat ${w.late.reduce((a, b) => a + b, 0)}</span><span class="muted">6 minggu terakhir</span>`;
}

function dhPeople(tasks, range, sum) {
  const ppl = L.byPerson(tasks, range).filter((p) => p.total).sort((a, b) => ((b.onTimeRate || 0) - (a.onTimeRate || 0)) || (b.total - a.total));
  const max = Math.max(1, ...ppl.map((p) => p.total));
  const seg = [['over', '--good', 'Lebih cepat'], ['ontime', '--info', 'Tepat waktu'], ['late', '--bad', 'Terlambat'], ['overdue', '--warn', 'Lewat deadline'], ['review', '--review', 'Menunggu review'], ['open', '--line-strong', 'Berjalan']];
  const best = ppl.filter((p) => p.done >= 2).sort((a, b) => (b.onTimeRate || 0) - (a.onTimeRate || 0))[0];
  return `<div class="dh-legend">${seg.map(([, c, l]) => `<span><i class="dot" style="background:${css(c)}"></i>${l}</span>`).join('')}</div>
    <div class="dh-ppl">${ppl.map((p) => `<button type="button" class="dh-prow" data-person="${esc(p.owner)}" title="${esc(p.name)}: ${seg.map(([k, , l]) => l + ' ' + p[k]).join(', ')}">
      <span class="dh-nm"><span class="avatar">${initials(p.name)}</span>${esc(firstName(p.name))}</span>
      <span class="dh-track">${seg.map(([k, c]) => p[k] ? `<i style="width:${(p[k] / max) * 100}%;background:${css(c)}"></i>` : '').join('')}</span>
      <span class="dh-v"><b>${p.total}</b> task · ${pct(p.onTimeRate)}</span></button>`).join('') || '<p class="muted small">Belum ada task di periode ini.</p>'}</div>
    <div class="dh-kpis"><div><small>Tepat waktu (tim)</small><b>${pct(sum.onTimeRate)}</b></div>
      <div><small>Paling konsisten</small><b>${best ? esc(firstName(best.name)) : '–'}</b>${best ? `<span>${pct(best.onTimeRate)}</span>` : ''}</div>
      <div><small>Lewat deadline</small><b>${sum.overdue}</b><span>task aktif</span></div></div>`;
}

function dhReviewList(admin) {
  const row = (t, sub, cls) => `<button type="button" class="dh-rv" data-open="${esc(t.id)}"><span><b>${esc(dhTitle(t))}</b><small class="${cls || ''}">${sub}</small></span><span class="dh-go" aria-hidden="true">›</span></button>`;
  if (admin) {
    const list = S.all.tasks.filter((t) => t.status === 'Review' && !L.isRequest(t)).sort((a, b) => new Date(a.reviewAt || 0) - new Date(b.reviewAt || 0));
    return { title: 'Perlu direview', chip: list.length ? `<span class="chip bad">${list.length} menunggu</span>` : '', all: list.length > 3 ? '<button type="button" class="linkbtn small" data-go="review">Lihat semua</button>' : '',
      body: list.slice(0, 3).map((t) => row(t, `${esc(firstName(t.ownerName))} · ${esc(L.isArticle(t) ? (typeof ART_REVIEW_LABEL !== 'undefined' && ART_REVIEW_LABEL[artStage(t)]) || 'Review' : 'Hasil kerja')} · ${esc(ago(L.evaluate(t).reviewAt) || '')}`)).join('')
        || '<p class="muted small dh-empty">Tidak ada yang menunggu keputusan.</p>' };
  }
  const mine = ((S.mine && S.mine.tasks) || []);
  const ret = mine.filter(dhReturned), wait = mine.filter((t) => t.status === 'Review');
  const list = ret.map((t) => [t, 'Dikembalikan, perlu diperbaiki', 'bad']).concat(wait.map((t) => [t, 'Menunggu review admin · ' + (ago(L.evaluate(t).reviewAt) || ''), '']));
  return { title: 'Pengajuan saya', chip: ret.length ? `<span class="chip bad">${ret.length} dikembalikan</span>` : wait.length ? `<span class="chip info">${wait.length} menunggu</span>` : '', all: '',
    body: list.slice(0, 3).map(([t, s, c]) => row(t, esc(s), c)).join('') || '<p class="muted small dh-empty">Tidak ada yang sedang menunggu admin.</p>' };
}

function dhIdeas(admin) {
  if (typeof bankAvailable !== 'function' || !bankAvailable()) return null;
  if (!S.bank) { loadBank(true).then(() => { if (S.view === 'dashboard') softRender(); }); return { title: admin ? 'Ide masuk' : 'Ide saya', meta: '', body: '<p class="muted small dh-empty">Memuat…</p>' }; }
  const ready = S.bank.filter((d) => d.status === 'Disetujui' && (admin || d.author === S.user.username)).length;
  const meta = ready ? `<span class="muted small">${ready} siap dipakai</span>` : '';
  const list = admin ? S.bank.filter((d) => d.status === 'Diajukan') : S.bank.filter((d) => d.author === S.user.username && d.status !== 'Dipakai');
  const order = { Revisi: 0, Diajukan: 1, Draft: 2, Disetujui: 3, Ditolak: 4 };
  list.sort((a, b) => admin ? String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')) : (order[a.status] - order[b.status]));
  const body = list.slice(0, 3).map((d) => `<button type="button" class="dh-idea" data-idea="${esc(d.id)}">
      <span class="avatar">${initials(d.authorName || d.author)}</span>
      <span><b>${esc(admin ? firstName(d.authorName || d.author) + ' · ' : '')}${esc(bankKindName(d.kind))}${d.industry ? ' ' + esc(d.industry) : ''}</b>
      <p>${esc(bankTitleOf(d) || '(belum ada judul)')}</p>
      ${admin ? '<span class="dh-cta">Putuskan ›</span>' : `<span class="chip ${BANK_CHIP[d.status] || ''}">${esc(d.status)}</span>`}</span></button>`).join('')
    || `<p class="muted small dh-empty">${admin ? 'Belum ada ide yang dikirim.' : 'Belum ada ide. Tulis di menu Bank Ide.'}</p>`;
  return { title: admin ? 'Ide masuk' : 'Ide saya', meta, body, more: list.length > 3 ? `<button type="button" class="linkbtn small" data-go="ideas">Lihat ${list.length - 3} lainnya</button>` : '' };
}

/** HTML bagian atas Dashboard. */
function dashHero(o) {
  const tab = S.dhTab || 'today';
  let mine = dhMyTasks(tab);
  const rv = dhReviewList(o.admin), idea = dhIdeas(o.admin);
  const nAll = dhMyTasks('all').length;
  const hasTasks = !!S.user.sheetName || nAll > 0;
  const taskCard = `<section class="card dh-tasks"><div class="card-h"><h2>Task saya${nAll ? ` <span class="dh-n">${nAll}</span>` : ''}</h2><button type="button" class="dh-round" data-go="mine" title="Buka Task Saya" aria-label="Buka Task Saya">›</button></div>
      <div class="card-b"><div class="seg dh-tabs" role="tablist">${[['today', 'Hari ini'], ['week', 'Minggu ini'], ['all', 'Semua']].map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
        <div class="dh-list">${mine.slice(0, 40).map(dhTaskCard).join('') || `<p class="muted small dh-empty">${nAll ? 'Tidak ada task untuk pilihan ini.' : 'Tidak ada task aktif.'}</p>`}</div>
        ${mine.length > 4 ? `<button type="button" class="btn sm dh-more" data-go="mine">Lihat semua (${mine.length})</button>` : ''}</div></section>`;
  return `<div class="dh ${idea ? '' : 'no-idea'} ${hasTasks ? '' : 'no-task'}">
    ${hasTasks ? taskCard : ''}
    <section class="card dh-status"><div class="card-h"><h2>Status task</h2><span class="muted small">${esc(o.periodLabel)}</span></div><div class="card-b">${dhDonut(o.sum)}</div></section>
    <section class="card dh-line"><div class="card-h"><h2>Selesai vs terlambat</h2></div><div class="card-b"><div class="dh-chart"><canvas id="dh-line" aria-label="Grafik task selesai tepat waktu dan terlambat per minggu"></canvas></div><div class="dh-sum" id="dh-line-sum"></div></div></section>
    <section class="card dh-rvs"><div class="card-h"><h2>${rv.title}</h2>${rv.chip}</div><div class="card-b">${rv.body}${rv.all}</div></section>
    <section class="card dh-people"><div class="card-h"><h2>${o.team ? 'Hasil per orang' : 'Task selesai per minggu'}</h2></div><div class="card-b">${o.team ? dhPeople(o.tasks, o.range, o.sum)
      : `<div class="chart-box" style="height:210px"><canvas id="c1" aria-label="grafik"></canvas></div><div class="dh-kpis"><div><small>Penyelesaian</small><b>${pct(o.sum.completionRate)}</b></div><div><small>Tepat waktu</small><b>${pct(o.sum.onTimeRate)}</b></div><div><small>Lewat deadline</small><b>${o.sum.overdue}</b><span>task aktif</span></div></div>`}</div></section>
    ${idea ? `<section class="card dh-ideas"><div class="card-h"><h2>${idea.title}</h2>${idea.meta}</div><div class="card-b">${idea.body}${idea.more || ''}</div></section>` : ''}
  </div>`;
}

function dashHeroBind(o) {
  const root = $('.dh'); if (!root) return;
  $$('[data-dtab]', root).forEach((b) => b.onclick = () => { S.dhTab = b.dataset.dtab; go('dashboard'); });
  $$('[data-open]', root).forEach((b) => b.onclick = () => openTask(b.dataset.open));
  $$('[data-go]', root).forEach((b) => b.onclick = () => go(b.dataset.go));
  $$('[data-idea]', root).forEach((b) => b.onclick = () => bankOpen(b.dataset.idea));
  $$('[data-person]', root).forEach((b) => b.onclick = () => { S.f.persons = [b.dataset.person]; go('dashboard'); });
  dhLineChart(o.tasks);
  if (!o.team) renderWeeklyChart(o.tasks);
}

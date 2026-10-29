/* Jadwal kerja WFO / WFH.
 * Reguler: Selasa WFO wajib + pilih Senin atau Kamis (2 hari); Rabu & Jumat WFH. Minimal 2 orang reguler per hari WFO.
 * Jadwal final < 2 hari → minggu depannya wajib 3 hari. Pengecualian: bebas, tidak wajib, tidak dihitung kuota.
 * Pindah hari / tidak bisa WFO diajukan ke admin. Memakai fungsi & state dari app.js. */
'use strict';

const SCH_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const SCH_NAME = { mon: 'Senin', tue: 'Selasa', wed: 'Rabu', thu: 'Kamis', fri: 'Jumat' };
const SCH_SHORT = { mon: 'Sen', tue: 'Sel', wed: 'Rab', thu: 'Kam', fri: 'Jum' };
const SCH_WFO = ['mon', 'tue', 'thu'];
const SCH_MIN = 2;

const schDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const schIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const schAddW = (w, n) => { const d = schDate(w); d.setDate(d.getDate() + 7 * n); return schIso(d); };
function schRange(w) { const a = schDate(w), b = schDate(w); b.setDate(b.getDate() + 4); return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`; }
function schWeekLabel(w, cur) { const n = Math.round((schDate(w) - schDate(cur)) / (7 * 864e5)); return n === 0 ? 'Minggu ini' : n === 1 ? 'Minggu depan' : n === -1 ? 'Minggu lalu' : n > 0 ? n + ' minggu lagi' : -n + ' minggu lalu'; }
const schPending = () => ((S.sched && S.sched.data && S.sched.data.requests) || []).filter((r) => r.status === 'Menunggu');

async function loadSched(week, quiet) {
  try {
    const d = await api.call('schedule', { week: week || (S.sched && S.sched.week) || '' });
    S.sched = { week: d.weeks[0].week, data: d, at: Date.now() };
    return true;
  } catch (e) { if (!quiet) toast(cleanErr(e), true); return false; }
}

function viewSchedule() {
  if (!S.sched || !S.sched.data) {
    $('#view').innerHTML = '<div class="loading">Memuat jadwal…</div>';
    loadSched('', false).then((ok) => { if (ok && S.view === 'schedule') go('schedule'); });
    return;
  }
  if (Date.now() - S.sched.at > 60000 && !S.sched.loading) {
    S.sched.loading = true;
    loadSched(S.sched.week, true).then((ok) => { S.sched.loading = false; if (ok && S.view === 'schedule') softRender(); });
  }
  const D = S.sched.data, me = S.user.username, admin = S.user.role === 'admin';
  const [W, N] = D.weeks, cur = D.currentWeek;
  const people = D.people.slice().sort((a, b) => (a.exempt - b.exempt) || a.name.localeCompare(b.name));
  const mine = D.people.find((p) => p.username === me);
  const today = D.today, todayW = [W, N].find((x) => x.days.some((d) => d.date === today));
  const todayDay = todayW && todayW.days.find((d) => d.date === today);
  const inOffice = todayDay && SCH_DAYS.includes(todayDay.code) && !todayDay.holiday
    ? people.filter((p) => (todayW.plans[p.username] || { days: [] }).days.includes(todayDay.code)) : [];
  const pend = schPending();

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg sch-nav"><button id="sch-prev" aria-label="Minggu sebelumnya">‹</button><button id="sch-now" class="${W.week === cur ? 'on' : ''}">Minggu ini</button><button id="sch-next" aria-label="Minggu berikutnya">›</button></div>
      <span class="muted small">${esc(schWeekLabel(W.week, cur))} · ${esc(schRange(W.week))}</span>
      <span class="spacer"></span>
      ${todayDay ? `<span class="sch-today">${todayDay.holiday ? `Hari ini libur: ${esc(todayDay.holiday)}` : ['wed', 'fri'].includes(todayDay.code) ? 'Hari ini WFH untuk semua' : `Di kantor hari ini: <b>${inOffice.length ? esc(inOffice.map((p) => firstName(p.name)).join(', ')) : '–'}</b>`}</span>` : ''}
    </div>
    ${admin && pend.length ? `<div class="card sch-req-card"><div class="card-h"><h2>Pengajuan jadwal</h2><span class="muted small">${pend.length} menunggu keputusan Anda</span></div><div class="card-b">${pend.map((q) => schReqRow(q, true)).join('')}</div></div>` : ''}
    <div class="sch-grid ${mine ? '' : 'one'}">
      ${mine ? `<div class="sch-mine">${[W, N].map((wk) => schMineCard(wk, mine, cur)).join('')}${schMyReqs(me)}</div>` : ''}
      <div class="sch-team">${[W, N].map((wk) => schTeamCard(wk, people, cur, admin)).join('')}
        ${admin ? schHolidayCard(D) : ''}</div>
    </div>
    <p class="def"><b>Aturan</b> — Selasa WFO untuk semua anggota reguler, ditambah satu hari pilihan: Senin atau Kamis. Rabu & Jumat WFH. Setiap hari WFO minimal ${SCH_MIN} orang di kantor. Pilihan minggu depan terkunci <b>Jumat 17:00</b>; setelah itu perubahan diajukan ke admin (paling lambat H-1 pukul 17:00). Bila WFO seminggu kurang dari 2 hari, minggu berikutnya wajib <b>3 hari</b> (Senin, Selasa, Kamis). Hari WFO yang jatuh di hari libur dianggap terpenuhi. Anggota <b>Fleksibel</b> tidak terikat aturan ini dan tidak dihitung dalam kuota.</p>`;
  $('#sch-prev').onclick = () => schGo(schAddW(W.week, -1));
  $('#sch-next').onclick = () => schGo(schAddW(W.week, 1));
  $('#sch-now').onclick = () => schGo(cur);
  bindSchedule();
}
async function schGo(week) {
  $('#view').classList.add('is-loading');
  const ok = await loadSched(week, false);
  $('#view').classList.remove('is-loading');
  if (ok && S.view === 'schedule') go('schedule');
}

function schChip(code, plan, day) {
  if (day && day.holiday) return `<span class="sch-chip lib" title="${esc(day.holiday)}">Libur</span>`;
  if (!plan) return '<span class="sch-chip">–</span>';
  if (plan.exempt) return plan.days.includes(code) ? '<span class="sch-chip flex">Kantor</span>' : '<span class="sch-chip na">–</span>';
  return plan.days.includes(code) ? `<span class="sch-chip wfo">WFO</span>` : '<span class="sch-chip wfh">WFH</span>';
}

function schMineCard(wk, me, cur) {
  const p = wk.plans[me.username]; if (!p) return '';
  const locked = wk.locked && p.chosen !== false;
  const lockTxt = new Date(wk.lockAt);
  const head = `<div class="card-h"><h2>Jadwal saya · ${esc(schWeekLabel(wk.week, cur))}</h2><span class="muted small">${esc(schRange(wk.week))}${p.exempt ? '' : ` · wajib WFO <b>${p.required} hari</b>`}</span></div>`;
  const days = `<div class="sch-days">${wk.days.map((d) => `<div class="${d.date === S.sched.data.today ? 'today' : ''}"><small>${SCH_SHORT[d.code]} ${schDate(d.date).getDate()}</small>${schChip(d.code, p, d)}${!p.exempt && ((d.code === 'tue') || ['wed', 'fri'].includes(d.code) || p.required >= 3) && !d.holiday ? '<i class="sch-lock" title="Terkunci">🔒</i>' : ''}</div>`).join('')}</div>`;
  let body = '';
  if (p.exempt) {
    body = `<p class="muted small" style="margin:10px 0 6px">Anda termasuk <b>Fleksibel</b>: tidak wajib WFO. Tandai hari Anda ke kantor (opsional) supaya tim tahu.</p>
      <div class="sch-pick">${SCH_WFO.map((c) => `<button type="button" class="${p.days.includes(c) ? 'on' : ''}" data-flex="${c}" data-week="${wk.week}" ${locked ? 'disabled' : ''}>${SCH_NAME[c]}</button>`).join('')}</div>`;
  } else {
    if (p.debt) body += `<div class="sch-warn">Minggu sebelumnya WFO Anda kurang dari 2 hari, jadi minggu ini wajib <b>3 hari</b> (Senin, Selasa, Kamis).</div>`;
    else if (!p.chosen) body += `<div class="sch-warn">Anda belum memilih hari WFO kedua. Pilih Senin atau Kamis.</div>`;
    if (p.required < 3) {
      const choice = p.days.includes('mon') && !p.days.includes('thu') ? 'mon' : p.days.includes('thu') && !p.days.includes('mon') ? 'thu' : '';
      body += `<div class="sch-sub">Hari WFO kedua ${locked ? `<span class="muted small">· terkunci sejak ${esc(fmtS(lockTxt))}</span>` : `<span class="muted small">· bisa diubah sampai ${esc(fmtDT(lockTxt))}</span>`}</div>
        <div class="sch-pick">${['mon', 'thu'].map((c) => `<button type="button" class="${choice === c ? 'on' : ''}" data-choose="${c}" data-week="${wk.week}" ${locked || p.source === 'request' || p.source === 'admin' ? 'disabled' : ''}><b>${SCH_NAME[c]}</b><small>${wk.count[c]} orang${choice === c ? ' · termasuk Anda' : ''}</small></button>`).join('')}</div>
        ${p.source === 'request' || p.source === 'admin' ? `<p class="muted small" style="margin:6px 0 0">Jadwal minggu ini sudah diatur ${p.source === 'admin' ? 'admin' : 'lewat pengajuan yang disetujui'}.</p>` : ''}`;
    }
    const future = wk.days.some((d) => SCH_WFO.includes(d.code) && p.days.includes(d.code) && schDate(d.date).getTime() - 7 * 36e5 > Date.now());
    if (future) body += `<div class="sch-acts"><button class="btn sm" data-schreq="swap" data-week="${wk.week}">Ajukan pindah hari</button><button class="btn sm" data-schreq="skip" data-week="${wk.week}">Ajukan tidak bisa WFO</button></div>`;
  }
  return `<div class="card sch-card">${head}<div class="card-b">${days}${body}</div></div>`;
}

function schMyReqs(me) {
  const list = ((S.sched.data.requests) || []).filter((r) => r.username === me).slice(-6).reverse();
  if (!list.length) return '';
  return `<div class="card sch-card"><div class="card-h"><h2>Pengajuan saya</h2></div><div class="card-b">${list.map((q) => schReqRow(q, false)).join('')}</div></div>`;
}

function schReqText(q) {
  const d = schDate(q.week); d.setDate(d.getDate() + SCH_DAYS.indexOf(q.from));
  return q.kind === 'swap' ? `Pindah ${SCH_NAME[q.from]} ${d.getDate()} ${MONTHS[d.getMonth()]} → ${SCH_NAME[q.to]}` : `Tidak bisa WFO ${SCH_NAME[q.from]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** Dampak pengajuan terhadap kuota & kewajiban (bila minggunya sedang dimuat). */
function schImpact(q) {
  const wk = S.sched.data.weeks.find((w) => w.week === q.week);
  if (!wk) return '';
  const p = wk.plans[q.username] || { days: [] }, out = [];
  const after = Object.assign({}, wk.count);
  if (p.days.includes(q.from)) after[q.from]--;
  if (q.kind === 'swap') after[q.to]++;
  const fromTxt = `${SCH_NAME[q.from]} jadi ${after[q.from]} orang`;
  out.push(after[q.from] < SCH_MIN ? `<span class="bad">${fromTxt} — di bawah minimal ${SCH_MIN}</span>` : `<span class="ok">${fromTxt}</span>`);
  if (q.kind === 'swap') out.push(`<span class="ok">${SCH_NAME[q.to]} jadi ${after[q.to]} orang</span>`);
  if (q.kind === 'skip' && p.days.length - 1 < 2) out.push('<span class="warn">minggu berikutnya wajib WFO 3 hari</span>');
  return `<div class="sch-impact">${out.join(' · ')}</div>`;
}
function schReqRow(q, forAdmin) {
  const who = (S.sched.data.people.find((p) => p.username === q.username) || {}).name || q.username;
  const cls = { Menunggu: 'warn', Disetujui: 'good', Ditolak: 'bad' }[q.status] || '';
  return `<div class="sch-req">
    <div class="sch-req-main">${forAdmin ? `<b>${esc(who)}</b> · ` : ''}${esc(schReqText(q))}<div class="muted small">“${esc(q.reason)}”${q.note ? ` · catatan admin: ${esc(q.note)}` : ''}</div>${forAdmin && q.status === 'Menunggu' ? schImpact(q) : ''}</div>
    ${forAdmin && q.status === 'Menunggu' ? `<div class="sch-req-act"><button class="btn sm" data-schdec="reject" data-id="${esc(q.id)}">Tolak</button><button class="btn sm primary" data-schdec="approve" data-id="${esc(q.id)}">Setujui</button></div>` : `<span class="bstat ${cls}">${esc(q.status)}</span>`}
  </div>`;
}

function schTeamCard(wk, people, cur, admin) {
  return `<div class="card sch-card"><div class="card-h"><h2>Jadwal tim · ${esc(schWeekLabel(wk.week, cur))}</h2><span class="muted small">${esc(schRange(wk.week))}${wk.locked ? ' · terkunci' : ` · pilihan terkunci ${esc(fmtS(new Date(wk.lockAt)))}`}</span></div>
    <div class="card-b" style="overflow-x:auto"><table class="tbl sch-tbl"><thead><tr><th>Nama</th>${wk.days.map((d) => `<th class="${d.date === S.sched.data.today ? 'today' : ''}">${SCH_SHORT[d.code]} ${schDate(d.date).getDate()}${d.holiday ? '<small>libur</small>' : ''}</th>`).join('')}${admin ? '<th></th>' : ''}</tr></thead><tbody>
    ${people.map((u) => { const p = wk.plans[u.username];
      return `<tr class="${u.username === S.user.username ? 'me-row' : ''}"><td><span class="sch-name">${esc(u.name)}</span>${u.exempt ? ' <span class="sch-tag flex">Fleksibel</span>' : p && p.required >= 3 ? ' <span class="sch-tag debt" title="Wajib 3 hari">3×</span>' : p && !p.chosen ? ' <span class="sch-tag warn" title="Belum memilih Senin/Kamis">belum memilih</span>' : ''}</td>
        ${wk.days.map((d) => `<td>${schChip(d.code, p, d)}</td>`).join('')}${admin ? `<td><button class="btn sm ghost" data-schset="${esc(u.username)}" data-week="${wk.week}">Ubah</button></td>` : ''}</tr>`; }).join('')}
    <tr class="sch-count"><td>Di kantor</td>${wk.days.map((d) => SCH_WFO.includes(d.code) && !d.holiday ? `<td class="${wk.count[d.code] < SCH_MIN ? 'low' : ''}" title="${wk.count[d.code] < SCH_MIN ? 'Kurang dari ' + SCH_MIN + ' orang' : ''}"><b>${wk.count[d.code]}</b></td>` : '<td>–</td>').join('')}${admin ? '<td></td>' : ''}</tr>
    </tbody></table></div></div>`;
}

function schHolidayCard(D) {
  const list = Object.entries(D.holidays || {}).filter(([d]) => d >= schAddW(D.currentWeek, -1)).sort();
  return `<div class="card sch-card"><div class="card-h"><h2>Libur nasional</h2><span class="muted small">hari WFO yang libur dianggap terpenuhi</span></div><div class="card-b">
    ${list.length ? list.map(([d, n]) => `<div class="sch-hol"><span>${esc(fmtIso(d))}</span><b>${esc(n)}</b><button class="ibtn" data-holdel="${esc(d)}" aria-label="Hapus libur">×</button></div>`).join('') : '<p class="muted small" style="margin:0 0 8px">Belum ada libur yang ditandai.</p>'}
    <div class="sch-hol-add"><input type="date" id="hol-d" aria-label="Tanggal libur"><input type="text" id="hol-n" placeholder="mis. Hari Raya Natal" maxlength="80" aria-label="Nama libur"><button class="btn sm" id="hol-add">+ Tambah</button></div></div></div>`;
}

function schApply(d) { S.sched = { week: d.weeks[0].week, data: d, at: Date.now() }; renderNav(); if (S.view === 'schedule') go('schedule'); else softRender(); }
async function schCall(action, payload, btn, ok) {
  try { const d = await busy(btn || null, () => api.call(action, payload)); if (ok) toast(ok); schApply(d); return true; }
  catch (e) { if (/dimuat ulang/i.test(cleanErr(e))) loadSched(S.sched.week, true).then(() => softRender()); return false; }
}

function bindSchedule() {
  const root = $('#view');
  $$('[data-choose]', root).forEach((b) => b.onclick = () => schCall('schedChoose', { week: b.dataset.week, day: b.dataset.choose }, b, `WFO kedua: ${SCH_NAME[b.dataset.choose]}`));
  $$('[data-flex]', root).forEach((b) => b.onclick = () => {
    const wk = S.sched.data.weeks.find((w) => w.week === b.dataset.week), p = wk.plans[S.user.username];
    const set = new Set(p.days); set.has(b.dataset.flex) ? set.delete(b.dataset.flex) : set.add(b.dataset.flex);
    schCall('schedChoose', { week: b.dataset.week, days: [...set] }, b, 'Disimpan');
  });
  $$('[data-schreq]', root).forEach((b) => b.onclick = () => schRequestModal(b.dataset.week, b.dataset.schreq));
  $$('[data-schdec]', root).forEach((b) => b.onclick = () => {
    if (b.dataset.schdec === 'approve') return schCall('schedDecide', { id: b.dataset.id, decision: 'approve' }, b, 'Pengajuan disetujui');
    modal({ title: 'Tolak pengajuan', body: '<label class="field"><span>Catatan untuk anggota (opsional)</span><textarea id="sch-note" rows="3" maxlength="500" placeholder="mis. Kamis sudah kurang orang, coba minggu depan"></textarea></label>',
      actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="sch-rej">Tolak</button>',
      onMount: (m, close) => { $('#sch-rej', m).onclick = () => { const n = $('#sch-note', m).value.trim(); close(); schCall('schedDecide', { id: b.dataset.id, decision: 'reject', note: n }, null, 'Pengajuan ditolak'); }; } });
  });
  $$('[data-schset]', root).forEach((b) => b.onclick = () => schSetModal(b.dataset.schset, b.dataset.week));
  $$('[data-holdel]', root).forEach((b) => b.onclick = () => schCall('schedHoliday', { date: b.dataset.holdel, remove: true }, b, 'Libur dihapus'));
  if ($('#hol-add')) $('#hol-add').onclick = () => {
    const d = $('#hol-d').value, n = $('#hol-n').value.trim();
    if (!d) return $('#hol-d').focus();
    schCall('schedHoliday', { date: d, name: n || 'Libur nasional' }, $('#hol-add'), 'Libur ditambahkan');
  };
}

function schRequestModal(week, kind) {
  const wk = S.sched.data.weeks.find((w) => w.week === week), p = wk.plans[S.user.username];
  const okDay = (c) => { const d = wk.days.find((x) => x.code === c); return schDate(d.date).getTime() - 7 * 36e5 > Date.now() && !d.holiday; };
  const froms = p.days.filter((c) => SCH_WFO.includes(c) && okDay(c));
  const tos = SCH_WFO.filter((c) => !p.days.includes(c) && okDay(c));
  if (!froms.length) return toast('Tidak ada hari WFO yang masih bisa diajukan (paling lambat H-1 pukul 17:00).', true);
  if (kind === 'swap' && !tos.length) return toast('Tidak ada hari pengganti yang tersedia minggu ini.', true);
  let from = froms[0], to = tos[0] || '';
  const dayLbl = (c) => { const d = schDate(wk.days.find((x) => x.code === c).date); return `${SCH_NAME[c]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  modal({
    title: kind === 'swap' ? 'Ajukan pindah hari WFO' : 'Ajukan tidak bisa WFO',
    body: `<p class="muted small" style="margin-top:0">${esc(schRange(week))} · diputuskan oleh admin</p>
      <div class="field"><span>${kind === 'swap' ? 'Tidak bisa WFO hari' : 'Hari yang tidak bisa'}</span><div class="sch-pick" id="sr-from">${froms.map((c) => `<button type="button" data-v="${c}" class="${c === from ? 'on' : ''}"><b>${esc(dayLbl(c))}</b><small>${wk.count[c]} orang</small></button>`).join('')}</div></div>
      ${kind === 'swap' ? `<div class="field"><span>Ganti ke</span><div class="sch-pick" id="sr-to">${tos.map((c) => `<button type="button" data-v="${c}" class="${c === to ? 'on' : ''}"><b>${esc(dayLbl(c))}</b><small>${wk.count[c]} orang</small></button>`).join('')}</div></div>`
        : `<div class="sch-warn" style="margin-bottom:12px">${p.days.length - 1 < 2 ? 'Bila disetujui, WFO Anda minggu ini kurang dari 2 hari sehingga <b>minggu berikutnya wajib WFO 3 hari</b>.' : 'WFO Anda minggu ini tetap minimal 2 hari.'}</div>`}
      <label class="field"><span>Alasan *</span><textarea id="sr-why" rows="3" maxlength="500" placeholder="mis. Visit klien di luar kota"></textarea></label><div id="sr-err"></div>`,
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="sr-ok">Kirim ke admin</button>',
    onMount: (m, close) => {
      const pick = (id, set) => $$(`#${id} button`, m).forEach((b) => b.onclick = () => { set(b.dataset.v); $$(`#${id} button`, m).forEach((x) => x.classList.toggle('on', x === b)); });
      pick('sr-from', (v) => { from = v; }); if (kind === 'swap') pick('sr-to', (v) => { to = v; });
      $('#sr-ok', m).onclick = async () => {
        const reason = $('#sr-why', m).value.trim();
        if (!reason) { $('#sr-err', m).innerHTML = '<div class="error">Tuliskan alasannya.</div>'; return $('#sr-why', m).focus(); }
        try {
          const d = await busy($('#sr-ok', m), () => api.call('schedRequest', { req: { week, kind, from, to, reason } }));
          close(); toast('Pengajuan dikirim ke admin'); schApply(d);
        } catch (e) { $('#sr-err', m).innerHTML = `<div class="error">${esc(cleanErr(e))}</div>`; }
      };
    }
  });
}

function schSetModal(username, week) {
  const wk = S.sched.data.weeks.find((w) => w.week === week), p = wk.plans[username] || { days: [] };
  const u = S.sched.data.people.find((x) => x.username === username) || { name: username };
  let days = new Set(p.days);
  modal({
    title: 'Ubah jadwal ' + u.name,
    body: `<p class="muted small" style="margin-top:0">${esc(schRange(week))}${u.exempt ? ' · Fleksibel' : ` · wajib ${p.required} hari`}</p>
      <div class="field"><span>Hari WFO</span><div class="sch-pick" id="ss-days">${SCH_WFO.map((c) => `<button type="button" data-v="${c}" class="${days.has(c) ? 'on' : ''}"><b>${SCH_NAME[c]}</b><small>${wk.count[c]} orang</small></button>`).join('')}</div></div>
      <p class="muted small" style="margin:0">Perubahan oleh admin tidak dibatasi waktu maupun kuota. Bila hasilnya kurang dari 2 hari, minggu berikutnya ${esc(u.name)} wajib 3 hari.</p>`,
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="ss-ok">Simpan</button>',
    onMount: (m, close) => {
      $$('#ss-days button', m).forEach((b) => b.onclick = () => { days.has(b.dataset.v) ? days.delete(b.dataset.v) : days.add(b.dataset.v); b.classList.toggle('on'); });
      $('#ss-ok', m).onclick = async () => {
        try { const d = await busy($('#ss-ok', m), () => api.call('schedSet', { username, week, days: [...days] })); close(); toast('Jadwal diperbarui'); schApply(d); }
        catch (e) { /* busy sudah menampilkan pesan */ }
      };
    }
  });
}

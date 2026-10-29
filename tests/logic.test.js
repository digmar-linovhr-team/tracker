const assert = require('assert');
const L = require('../web/js/logic.js');

const now = new Date(2026, 9, 28, 12, 0); // Rab 28 Okt 2026 12:00
const t = (o) => Object.assign({ id: 'X', task: 'Tes', status: 'Backlog', startTime: '', endTime: '' }, o);
let pass = 0;
const it = (name, fn) => { fn(); pass++; console.log('  ✓ ' + name); };

it('jam default 09:00 / 18:00 bila kolom jam kosong', () => {
  const s = L.schedule(t({ startDate: '2026-10-26', endDate: '2026-10-29' }));
  assert.strictEqual(s.start.getHours(), 9); assert.strictEqual(s.end.getHours(), 18);
});

it('overperforming: selesai cepat (≤80% durasi rencana)', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-24', status: 'Done',
    startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 15).toISOString() }), now);
  assert.strictEqual(e.outcome, 'over');
  assert.strictEqual(e.durationMs, 30 * 36e5);
});

it('tepat waktu: selesai sebelum deadline tapi > 80% durasi', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done',
    startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 16).toISOString() }), now);
  assert.strictEqual(e.outcome, 'ontime');
});

it('terlambat: done setelah deadline', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done',
    doneAt: new Date(2026, 9, 22, 10).toISOString() }), now);
  assert.strictEqual(e.outcome, 'late');
  assert.ok(e.slackMs < 0);
});

it('overdue: belum done & lewat deadline; Recurring tidak dihitung', () => {
  assert.strictEqual(L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-27' }), now).outcome, 'overdue');
  assert.strictEqual(L.evaluate(t({ status: 'Recurring', startDate: '2026-10-20', endDate: '2026-10-27' }), now).outcome, 'open');
});

it('task tanpa tanggal (TBD) tidak error', () => {
  const e = L.evaluate(t({ startDate: '', endDate: '', startRaw: 'TBD' }), now);
  assert.strictEqual(e.outcome, 'open');
  assert.strictEqual(L.bucket(t({}), now), 'backlog');
});

it('notifikasi jam mulai muncul sekali per jadwal', () => {
  const n = L.dueNotifications([t({ id: 'A', startDate: '2026-10-28', startTime: '11:30', endDate: '2026-10-30' })], {}, now);
  assert.strictEqual(n.length, 1); assert.strictEqual(n[0].type, 'start');
  const n2 = L.dueNotifications([t({ id: 'A', status: 'On-Progress', startDate: '2026-10-28', startTime: '11:30', endDate: '2026-10-30' })], {}, now);
  assert.strictEqual(n2.length, 0, 'tidak perlu notifikasi mulai bila sudah On-Progress');
});

it('pengingat deadline: hanya yang paling dekat, kunci berubah bila deadline diubah', () => {
  const task = t({ id: 'B', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '12:45', status: 'On-Progress' });
  const n = L.dueNotifications([task], { reminders: [1440, 60] }, now);
  assert.strictEqual(n.length, 1); assert.ok(n[0].key.includes('due60'));
  const moved = L.dueNotifications([Object.assign({}, task, { endTime: '12:50' })], { reminders: [1440, 60] }, now);
  assert.notStrictEqual(moved[0].key, n[0].key);
});

it('notifikasi overdue & task Done tidak dinotifikasi', () => {
  const n = L.dueNotifications([t({ id: 'C', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '10:00' }),
    t({ id: 'D', status: 'Done', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '10:00' })], {}, now);
  assert.deepStrictEqual(n.map((x) => x.type), ['overdue']);
});

it('ringkasan & per orang', () => {
  const tasks = [
    t({ owner: 'a', ownerName: 'A', startDate: '2026-10-20', endDate: '2026-10-24', status: 'Done', startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 9).toISOString() }),
    t({ owner: 'a', ownerName: 'A', startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done', doneAt: new Date(2026, 9, 22, 9).toISOString() }),
    t({ owner: 'b', ownerName: 'B', startDate: '2026-10-20', endDate: '2026-10-27' })
  ];
  const s = L.summarize(tasks, { from: null, to: null }, now);
  assert.strictEqual(s.total, 3); assert.strictEqual(s.done, 2); assert.strictEqual(s.over, 1);
  assert.strictEqual(s.late, 1); assert.strictEqual(s.overdue, 1); assert.strictEqual(s.onTimeRate, 0.5);
  const p = L.byPerson(tasks, null, now);
  assert.strictEqual(p.find((x) => x.owner === 'a').done, 2);
});

it('review: waktu selesai dihitung dari pengajuan review, bukan persetujuan admin', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done',
    startedAt: new Date(2026, 9, 20, 9).toISOString(), reviewAt: new Date(2026, 9, 21, 15).toISOString(), doneAt: new Date(2026, 9, 23, 10).toISOString() }), now);
  assert.notStrictEqual(e.outcome, 'late', 'admin terlambat menyetujui tidak dihitung terlambat');
  assert.strictEqual(e.durationMs, 30 * 36e5);
});

it('task Review: tidak dianggap overdue, tidak memicu notifikasi, punya kelompok sendiri', () => {
  const rv = t({ id: 'R', status: 'Review', startDate: '2026-10-20', endDate: '2026-10-27', reviewAt: new Date(2026, 9, 26).toISOString() });
  assert.strictEqual(L.evaluate(rv, now).outcome, 'review');
  assert.strictEqual(L.bucket(rv, now), 'review');
  assert.strictEqual(L.dueNotifications([rv], {}, now).length, 0);
  assert.strictEqual(L.summarize([rv], null, now).review, 1);
});

it('format durasi', () => {
  assert.strictEqual(L.humanDuration(45 * 60000), '45 menit');
  assert.strictEqual(L.humanDuration(3 * 36e5 + 15 * 60000), '3 jam 15 mnt');
  assert.strictEqual(L.humanDuration(3 * 864e5), '3 hari');
});

const D = (d, h, m) => new Date(2026, 9, d, h, m || 0);   // Okt 2026: 26 = Senin, 30 = Jumat
it('jam kerja: hanya Senin–Jumat 09:00–18:00 WIB', () => {
  assert.strictEqual(L.workMs(D(26, 9), D(26, 18)), 9 * 36e5);
  assert.strictEqual(L.workMs(D(30, 17), new Date(2026, 10, 2, 10)), 2 * 36e5, 'Jumat 17:00 → Senin 10:00 = 2 jam');
  assert.strictEqual(L.workMs(D(26, 20), D(27, 8)), 0, 'malam tidak dihitung');
  assert.strictEqual(L.workMs(new Date(2026, 9, 31, 10), new Date(2026, 10, 1, 15)), 0, 'akhir pekan tidak dihitung');
});

const art = (s8, s9) => t({ type: 'Artikel', status: 'Done', startDate: '2026-10-26', startTime: '09:00', endDate: '2026-10-28', endTime: '18:00',
  doneAt: s9.toISOString(),
  stageLog: JSON.stringify([[1, D(26, 9)], [2, D(26, 9)], [3, D(26, 14)], [4, D(27, 10)], [5, D(28, 15)], [4, D(29, 9)], [5, D(29, 12)], [6, D(29, 14)], [7, D(29, 15)], [8, s8], [9, s9]]
    .map(([st, d]) => ({ s: st, t: d.toISOString() }))) });
it('KPI artikel: waktu murni = jam kerja − waktu review admin; terlambat bila > jatah + 2 jam', () => {
  // waktu anggota: 5 (brief) + 14 (menulis) + 3 (revisi) + 1 (publish) + 1 (cek AI) = 24 jam; jatah Sen 09 → Rab 18 = 27 jam
  let e = L.evaluate(art(D(29, 16), D(30, 10)), D(30, 12));
  assert.strictEqual(e.plannedMs, 27 * 36e5);
  assert.strictEqual(e.reviewMs, (5 + 3 + 2 + 3) * 36e5, 'review brief 5 + artikel 3 + 2 + cek AI 3 jam');
  assert.strictEqual(e.durationMs, 24 * 36e5);
  assert.strictEqual(e.outcome, 'ontime');
  e = L.evaluate(art(D(30, 12), D(30, 13)), D(30, 16));   // cek AI 6 jam → murni 29 = jatah + 2 → masih tepat waktu
  assert.strictEqual(e.durationMs, 29 * 36e5); assert.strictEqual(e.outcome, 'ontime');
  e = L.evaluate(art(D(30, 13), D(30, 14)), D(30, 16));   // murni 30 jam → terlambat
  assert.strictEqual(e.durationMs, 30 * 36e5); assert.strictEqual(e.outcome, 'late');
  // lama review admin tidak membuat anggota terlambat
  e = L.evaluate(art(D(29, 16), new Date(2026, 10, 4, 17)), new Date(2026, 10, 5, 9));
  assert.strictEqual(e.durationMs, 24 * 36e5); assert.strictEqual(e.outcome, 'ontime');
  assert.strictEqual(L.humanWork(30 * 36e5), '3 hari kerja 3 jam');
});
it('task non-artikel tetap memakai cara hitung lama', () => {
  const e = L.evaluate(t({ status: 'Done', startDate: '2026-10-26', endDate: '2026-10-26', startedAt: D(26, 9).toISOString(), doneAt: D(26, 20).toISOString() }), D(27, 9));
  assert.strictEqual(e.article, undefined); assert.strictEqual(e.outcome, 'late');
});

it('beban kerja: aktif tanpa Done/Hold/Recurring, terlambat & deadline 7 hari, penuh ≥ 6', () => {
  const now = D(27, 10);
  const mk = (o) => t(Object.assign({ owner: 'a', status: 'Backlog', startDate: '2026-10-27', endDate: '2026-11-20' }, o));
  const list = [mk({ status: 'Done' }), mk({ status: 'Hold' }), mk({ status: 'Recurring' }), mk({ endDate: '2026-10-26' }), mk({ endDate: '2026-10-29' }), mk({ status: 'Review' }), mk({}),
    mk({ owner: 'b' })];
  const w = L.workload(list, now);
  assert.strictEqual(w.a.active, 4); assert.strictEqual(w.a.overdue, 1); assert.strictEqual(w.a.dueWeek, 1); assert.strictEqual(w.a.review, 1);
  assert.strictEqual(w.a.level, 'normal'); assert.strictEqual(w.b.level, 'light');
  const many = Array.from({ length: 6 }, () => mk({ owner: 'c' }));
  assert.strictEqual(L.workload(many, now).c.level, 'full');
});

it('cuti/izin: deadline mundur sebanyak hari kerja cuti di rentang task', () => {
  const task = t({ owner: 'a', status: 'Done', startDate: '2026-10-26', endDate: '2026-10-28', doneAt: D(30, 12).toISOString(), startedAt: D(26, 9).toISOString() });
  assert.strictEqual(L.evaluate(task, D(30, 13)).outcome, 'late');
  L.applyLeaves([task], [{ username: 'a', from: '2026-10-27', to: '2026-10-28' }, { username: 'b', from: '2026-10-26', to: '2026-10-30' }]);
  assert.strictEqual(task.leaveDays, 2);
  assert.strictEqual(L.schedule(task).end.getDate(), 30, 'Rabu + 2 hari kerja = Jumat');
  assert.notStrictEqual(L.evaluate(task, D(30, 13)).outcome, 'late');
  L.applyLeaves([task], []); assert.strictEqual(task.leaveDays, undefined);
});

console.log(`\n${pass} uji lulus`);

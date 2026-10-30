// Uji aturan keamanan Firestore dengan emulator. Jalankan: npm run test:rules
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const by = (u, o) => Object.assign({}, o, { updatedBy: u, updatedAt: serverTimestamp() });

const DOMAIN = 'linovhr-tracker.firebaseapp.com';
let n = 0;
const it = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-tracker',
    firestore: { rules: fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8') }
  });
  const as = (u) => env.authenticatedContext('uid-' + u, { email: `${u}@${DOMAIN}` }).firestore();
  const anon = env.unauthenticatedContext().firestore();
  const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

  await seed(async (db) => {
    const u = (name, role, extra) => setDoc(doc(db, 'users', name), Object.assign({ name, role, active: true, hasTasks: true, mustChange: false }, extra || {}));
    await u('admin', 'admin'); await u('ari', 'member'); await u('ammar', 'member'); await u('nadia', 'member');
    await u('lama', 'member', { active: false }); await u('owner', 'member', { orgOnly: true, hasTasks: false });
    await setDoc(doc(db, 'tasks', 'T1'), { owner: 'ari', task: 'Tugas Ari', status: 'Backlog', type: 'Non-artikel' });
    await setDoc(doc(db, 'tasks', 'T2'), { owner: 'ammar', task: 'Artikel Ammar', status: 'On-Progress', type: 'Artikel', stage: 2 });
    await setDoc(doc(db, 'tasks', 'T3'), { owner: 'ari', task: 'Selesai', status: 'Done', type: 'Non-artikel' });
    await setDoc(doc(db, 'tasks', 'RQ1'), { owner: 'nadia', createdBy: 'ari', task: 'Request desain', status: 'Review', type: 'Request' });
    await setDoc(doc(db, 'comments', 'C1'), { taskId: 'T1', author: 'ari', kind: 'user', text: 'halo', deleted: false, createdAt: Timestamp.fromMillis(Date.now() - 60 * 6e4) });
    await setDoc(doc(db, 'leaves', 'L1'), { username: 'ammar', kind: 'Cuti', status: 'Menunggu', reason: 'pribadi' });
    await setDoc(doc(db, 'leaves', 'L2'), { username: 'ammar', kind: 'Sakit', status: 'Disetujui' });
  });
  const ari = as('ari'), ammar = as('ammar'), admin = as('admin'), nadia = as('nadia');

  await it('tanpa login / akun nonaktif / tanpa akun tidak bisa membaca', async () => {
    await assertFails(getDoc(doc(anon, 'tasks', 'T1')));
    await assertFails(getDoc(doc(as('lama'), 'tasks', 'T1')));
    await assertFails(getDoc(doc(as('owner'), 'tasks', 'T1')));
    await assertFails(getDoc(doc(as('penyusup'), 'tasks', 'T1')));
    await assertSucceeds(getDoc(doc(ammar, 'tasks', 'T1')));
  });

  await it('pengguna: hanya admin mengubah profil; pemilik hanya skills/onboard; tidak bisa jadi admin', async () => {
    await assertFails(updateDoc(doc(ari, 'users', 'ari'), { role: 'admin' }));
    await assertFails(updateDoc(doc(ari, 'users', 'ammar'), { skills: 'x' }));
    await assertSucceeds(updateDoc(doc(ari, 'users', 'ari'), { skills: 'SEO teknis' }));
    await assertFails(updateDoc(doc(ari, 'users', 'ari'), { mustChange: true }));
    await assertSucceeds(updateDoc(doc(admin, 'users', 'ammar'), { position: 'Writer' }));
    await assertFails(setDoc(doc(ari, 'users', 'baru'), { name: 'x', role: 'admin', active: true }));
  });

  await it('data pribadi (email) hanya pemilik & admin', async () => {
    await assertSucceeds(setDoc(doc(ari, 'private', 'ari'), { email: 'ari@x.com' }));
    await assertFails(getDoc(doc(ammar, 'private', 'ari')));
    await assertSucceeds(getDoc(doc(admin, 'private', 'ari')));
    await assertFails(setDoc(doc(ari, 'private', 'ari'), { email: 'a@x.com', role: 'admin' }));
  });

  await it('task: pemilik mengerjakan, tidak bisa Done, tidak bisa ubah task orang lain atau deadline', async () => {
    await assertSucceeds(updateDoc(doc(ari, 'tasks', 'T1'), by('ari', { status: 'On-Progress', startedAt: 'x' })));
    await assertFails(updateDoc(doc(ari, 'tasks', 'T1'), by('ari', { status: 'Done' })));
    await assertFails(updateDoc(doc(ari, 'tasks', 'T1'), by('ari', { endDate: '2030-01-01' })));
    await assertFails(updateDoc(doc(ari, 'tasks', 'T1'), { status: 'Review' }), 'harus mencatat updatedBy & waktu');
    await assertFails(updateDoc(doc(ari, 'tasks', 'T1'), { status: 'Review', updatedBy: 'ari', updatedAt: Timestamp.fromMillis(0) }), 'waktu palsu');
    await assertFails(updateDoc(doc(ari, 'tasks', 'T3'), by('ari', { status: 'On-Progress' })), 'task Done terkunci');
    await assertFails(updateDoc(doc(ammar, 'tasks', 'T1'), by('ammar', { status: 'Review' })));
    await assertFails(deleteDoc(doc(ari, 'tasks', 'T1')));
    await assertSucceeds(updateDoc(doc(admin, 'tasks', 'T3'), { status: 'On-Progress' }));
  });

  await it('artikel: maju satu tahap kerja, tidak bisa menyetujui review sendiri', async () => {
    await assertFails(updateDoc(doc(ammar, 'tasks', 'T2'), by('ammar', { stage: 4, status: 'On-Progress' })), 'lompat review brief');
    await assertFails(updateDoc(doc(ammar, 'tasks', 'T2'), by('ammar', { status: 'Review' })), 'status artikel tanpa tahap');
    await assertSucceeds(updateDoc(doc(ammar, 'tasks', 'T2'), by('ammar', { stage: 3, status: 'Review', reviewAt: 'x' })));
    await assertFails(updateDoc(doc(ammar, 'tasks', 'T2'), by('ammar', { stage: 4, status: 'On-Progress' })), 'setujui brief sendiri');
    await assertSucceeds(updateDoc(doc(admin, 'tasks', 'T2'), { stage: 4, status: 'On-Progress' }));
  });

  await it('request: siapa saja membuat untuk orang lain; pembuat menyetujui; penerima tidak bisa Done', async () => {
    await assertSucceeds(setDoc(doc(ari, 'tasks', 'RQ2'), { owner: 'nadia', createdBy: 'ari', type: 'Request', status: 'Backlog', task: 'Banner' }));
    await assertFails(setDoc(doc(ari, 'tasks', 'RQ3'), { owner: 'ari', createdBy: 'ari', type: 'Request', status: 'Backlog', task: 'x' }), 'ke diri sendiri');
    await assertFails(setDoc(doc(ari, 'tasks', 'T9'), { owner: 'nadia', createdBy: 'ari', type: 'Non-artikel', status: 'Backlog', task: 'x' }), 'task biasa hanya admin');
    await assertFails(setDoc(doc(ari, 'tasks', 'RQ4'), { owner: 'nadia', createdBy: 'ammar', type: 'Request', status: 'Backlog', task: 'x' }), 'atas nama orang lain');
    await assertFails(updateDoc(doc(nadia, 'tasks', 'RQ1'), by('nadia', { status: 'Done' })));
    await assertSucceeds(updateDoc(doc(ari, 'tasks', 'RQ1'), by('ari', { status: 'Done', doneAt: 'x' })));
    await assertFails(updateDoc(doc(ammar, 'tasks', 'RQ1'), by('ammar', { status: 'Backlog' })));
    await assertSucceeds(updateDoc(doc(ari, 'tasks', 'RQ2'), by('ari', { owner: 'ammar', status: 'Backlog', stageLog: [] })), 'alihkan request');
    await assertFails(deleteDoc(doc(nadia, 'tasks', 'RQ2')), 'penerima tidak bisa menghapus');
    await assertSucceeds(deleteDoc(doc(ari, 'tasks', 'RQ2')), 'pembuat menghapus selama belum dikerjakan');
    await assertFails(deleteDoc(doc(ari, 'tasks', 'RQ1')), 'sudah berjalan → hanya admin');
  });

  await it('komentar: tulis atas nama sendiri, ubah ≤ 15 menit, admin menghapus', async () => {
    await assertSucceeds(setDoc(doc(ammar, 'comments', 'C2'), { taskId: 'T1', author: 'ammar', kind: 'user', text: '@Ari cek', deleted: false, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ammar, 'comments', 'C3'), { taskId: 'T1', author: 'ari', kind: 'user', text: 'palsu', deleted: false, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ammar, 'comments', 'C4'), { taskId: 'T1', author: 'ammar', kind: 'user', text: 'mundur', deleted: false, createdAt: Timestamp.fromMillis(0) }));
    await assertSucceeds(updateDoc(doc(ammar, 'comments', 'C2'), { text: '@Ari cek ya', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ari, 'comments', 'C1'), { text: 'diubah setelah 1 jam' }));
    await assertFails(updateDoc(doc(ari, 'comments', 'C2'), { deleted: true }));
    await assertSucceeds(updateDoc(doc(admin, 'comments', 'C1'), { deleted: true }));
  });

  await it('notifikasi: hanya penerima yang membaca; pengirim tidak bisa memalsukan nama', async () => {
    await assertSucceeds(setDoc(doc(ammar, 'notifications', 'N1'), { to: 'ari', from: 'ammar', type: 'mention', text: 'x', read: false, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ammar, 'notifications', 'N2'), { to: 'ari', from: 'admin', type: 'mention', text: 'x', read: false, createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(ari, 'notifications', 'N1')));
    await assertFails(getDoc(doc(nadia, 'notifications', 'N1')));
    await assertSucceeds(updateDoc(doc(ari, 'notifications', 'N1'), { read: true }));
    await assertFails(updateDoc(doc(ari, 'notifications', 'N1'), { text: 'ubah' }));
  });

  await it('jadwal & cuti: anggota hanya untuk dirinya; keputusan di admin; alasan cuti menunggu tertutup', async () => {
    await assertSucceeds(setDoc(doc(ari, 'schedule', '2026-11-02_ari'), { week: '2026-11-02', username: 'ari', days: ['tue', 'thu'], source: 'choice' }));
    await assertFails(setDoc(doc(ari, 'schedule', '2026-11-02_ammar'), { week: '2026-11-02', username: 'ammar', days: ['tue'], source: 'choice' }));
    await assertFails(setDoc(doc(ari, 'schedule', '2026-11-09_ari'), { week: '2026-11-09', username: 'ari', days: ['mon', 'tue', 'thu'], source: 'admin' }));
    await assertSucceeds(setDoc(doc(ari, 'leaves', 'L3'), { username: 'ari', kind: 'Izin', status: 'Menunggu' }));
    await assertFails(setDoc(doc(ari, 'leaves', 'L4'), { username: 'ari', kind: 'Cuti', status: 'Disetujui' }));
    await assertFails(updateDoc(doc(ammar, 'leaves', 'L1'), { status: 'Disetujui' }));
    await assertSucceeds(updateDoc(doc(ammar, 'leaves', 'L1'), { status: 'Dibatalkan', decidedBy: 'ammar', decidedAt: 'x' }));
    await assertFails(getDoc(doc(ari, 'leaves', 'L1')));
    await assertSucceeds(getDoc(doc(ari, 'leaves', 'L2')));
    await assertSucceeds(updateDoc(doc(admin, 'leaves', 'L3'), { status: 'Disetujui' }));
  });

  await it('perangkat push & data server', async () => {
    await assertSucceeds(setDoc(doc(ari, 'devices', 'tok1'), { username: 'ari', label: 'Mac' }));
    await assertFails(setDoc(doc(ari, 'devices', 'tok2'), { username: 'ammar', label: 'Mac' }));
    await assertFails(getDoc(doc(ammar, 'devices', 'tok1')));
    await assertFails(getDoc(doc(admin, 'serverMeta', 'T1')));
  });

  await env.cleanup();
  console.log(`\n${n} uji aturan lulus`);
})().catch((e) => { console.error(e); process.exit(1); });

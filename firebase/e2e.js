// Uji end-to-end versi beta (Firebase) di browser sungguhan terhadap emulator.
// Jalankan: npm run test:e2e  (membangun situs mode emulator, mengisi emulator, lalu menguji)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = process.env.SITE || path.join(__dirname, '../.e2e-site');
const SHOTS = process.env.SHOTS || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FS = 'http://127.0.0.1:8080/v1/projects/demo-tracker/databases/(default)/documents/';
const fsGet = async (p) => { const r = await fetch(FS + p, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? r.json() : null; };
const val = (doc, k) => { const f = doc && doc.fields && doc.fields[k]; return f ? Object.values(f)[0] : undefined; };
let n = 0; const ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); n++; console.log('  ✓ ' + m); };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8770);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (user, w, h) => {
    const p = await (await b.newContext({ viewport: { width: w || 1320, height: h || 900 }, serviceWorkers: 'block' })).newPage();
    p.on('pageerror', (e) => errs.push(user + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|ERR_TUNNEL|ERR_PROXY/.test(m.text())) errs.push(user + ' console: ' + m.text().slice(0, 200)); });
    await p.goto('http://127.0.0.1:8770/beta/'); await wait(800);
    await p.fill('[name=u]', user); await p.fill('[name=p]', 'demo1234'); await p.click('#f button');
    try { await p.waitForSelector('#shell:not(.hidden)', { timeout: 15000 }); }
    catch (e) { console.log('LOGIN GAGAL', user, await p.evaluate(() => (document.querySelector('#err') || {}).innerText), errs); throw e; }
    await wait(1200);
    return p;
  };

  const ari = await open('ari');
  ok(await ari.evaluate(() => S.mine.tasks.length > 0 && S.cfg.backend === 'firebase'), 'login ari & Task Saya dimuat dari Firestore');
  if (SHOTS) await ari.screenshot({ path: SHOTS + '/e2e-ari.png' });

  // mulai task Backlog
  const tid = await ari.evaluate(() => (S.mine.tasks.find((t) => t.status === 'Backlog' && (t.type || 'Non-artikel') === 'Non-artikel') || {}).id);
  ok(tid, 'ada task Backlog milik ari');
  await ari.evaluate((id) => api.call('updateStatus', { taskId: id, status: 'On-Progress' }), tid);
  await wait(600);
  let d = await fsGet('tasks/' + tid);
  ok(val(d, 'status') === 'On-Progress' && val(d, 'updatedBy') === 'ari' && val(d, 'startedAt'), 'status tersimpan di Firestore (+ updatedBy & startedAt)');

  // tidak boleh Done
  const err = await ari.evaluate((id) => api.call('updateStatus', { taskId: id, status: 'Done' }).then(() => '', (e) => e.message), tid);
  ok(/admin/i.test(err), 'anggota tidak bisa menandai Done (' + err + ')');

  // komentar + sebutan
  await ari.evaluate((id) => api.call('commentAdd', { taskId: id, text: '@Administrator mohon dicek', mentions: ['admin'] }), tid);
  await wait(500);
  const cm = await ari.evaluate((id) => api.call('comments', { taskId: id }), tid);
  ok(cm.comments.some((c) => c.text === '@Administrator mohon dicek' && c.kind === 'user'), 'komentar tersimpan & terbaca');
  ok(cm.comments.some((c) => c.kind === 'sys' && /mulai mengerjakan/.test(c.text)), 'catatan sistem ikut tersimpan');

  // ajukan review
  await ari.evaluate((id) => api.call('updateStatus', { taskId: id, status: 'Review' }), tid);
  await wait(500);

  // admin di jendela lain: realtime melihat pengajuan, lalu mengembalikan
  const admin = await open('admin');
  ok(await admin.evaluate((id) => S.all.tasks.some((t) => t.id === id && t.status === 'Review'), tid), 'admin melihat pengajuan review');
  // lonceng: admin menerima @sebutan & pengajuan review dari ari
  const nb = await admin.evaluate(() => ({ count: document.querySelector('#nb-count').textContent, shown: !document.querySelector('#nb-wrap').classList.contains('hidden') }));
  ok(nb.shown && Number(nb.count) >= 2, 'lonceng admin menampilkan notifikasi belum dibaca (' + nb.count + ')');
  await admin.click('#btn-bell'); await wait(300);
  const items = await admin.$$eval('.nb-item', (els) => els.map((e) => e.textContent));
  ok(items.some((t) => /menyebut/i.test(t)) && items.some((t) => /review/i.test(t)), 'panel notifikasi berisi @sebutan & review');
  if (SHOTS) await admin.screenshot({ path: SHOTS + '/e2e-bell.png' });
  await admin.click('#nb-all'); await wait(800);
  d = await admin.evaluate(() => api.call('notifications').then((r) => r.notifications.filter((n) => !n.read).length));
  ok(d === 0, 'tandai semua dibaca tersimpan');
  await admin.keyboard.press('Escape');
  // pengguna: penanda push belum aktif
  await admin.evaluate(() => go('users')); await wait(500);
  ok(await admin.evaluate(() => /Push belum aktif/.test(document.querySelector('#view').innerText)), 'admin melihat siapa yang belum menyalakan push');
  await admin.evaluate(() => go('settings')); await wait(800);
  ok(await admin.evaluate(() => !!document.querySelector('#push-card .card')), 'kartu push notification tampil di Pengaturan');
  if (SHOTS) await admin.screenshot({ path: SHOTS + '/e2e-settings.png', fullPage: true });
  await admin.evaluate(() => go('mine'));

  await admin.evaluate((id) => api.call('reviewTask', { taskId: id, decision: 'return', reason: 'Tambahkan link hasil' }), tid);
  await wait(2500);
  ok(await ari.evaluate((id) => (S.mine.tasks.find((t) => t.id === id) || {}).status, tid) === 'On-Progress', 'ari menerima keputusan admin secara realtime (tanpa muat ulang)');
  ok(await ari.evaluate(() => api.call('notifications').then((r) => r.notifications.some((n) => n.type === 'returned' && !n.read))), 'ari mendapat notifikasi task dikembalikan');
  d = await fsGet('tasks/' + tid);
  ok(/Tambahkan link hasil/.test(val(d, 'notes') || ''), 'catatan pengembalian tersimpan');

  // jadwal & cuti
  const sch = await ari.evaluate(() => api.call('schedule', {}));
  ok(sch.weeks && sch.weeks.length === 2, 'jadwal kerja terbaca');
  const lv = await ari.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 20); const x = d.toISOString().slice(0, 10); return api.call('leaveRequest', { leave: { kind: 'Izin', from: x, to: x, reason: 'Urusan keluarga' } }).then((r) => r.leaves.find((l) => l.username === 'ari' && l.kind === 'Izin'), (e) => e.message); });
  ok(lv && lv.status === 'Menunggu', 'pengajuan izin tersimpan (' + JSON.stringify(lv).slice(0, 80) + ')');

  // admin membuat task untuk ari → muncul di ari realtime
  const newId = await admin.evaluate(() => api.call('saveTask', { task: { owner: 'ari', task: 'Task baru dari admin (uji)', startDate: '2026-11-02', endDate: '2026-11-03', startTime: '09:00', endTime: '18:00', priority: 'High', status: 'Backlog', type: 'Non-artikel', results: [] } }).then((r) => r.id));
  await wait(2500);
  ok(await ari.evaluate((id) => S.mine.tasks.some((t) => t.id === id), newId), 'task baru dari admin muncul di ari secara realtime');
  if (SHOTS) await ari.screenshot({ path: SHOTS + '/e2e-ari2.png' });

  // request dari anggota ke anggota
  const rq = await ari.evaluate(() => api.call('saveRequest', { brief: { data: { title: 'Banner webinar', body: 'Ukuran 1080x1080', attachments: [] }, assign: { owner: 'nadia', endDate: '2026-11-05', endTime: '17:00', priority: 'Medium' } } }).then((r) => r.task.id, (e) => 'ERR ' + e.message));
  ok(rq && !/^ERR/.test(rq), 'ari membuat request untuk nadia (' + rq + ')');
  d = await fsGet('tasks/' + rq);
  ok(val(d, 'createdBy') === 'ari' && val(d, 'owner') === 'nadia', 'task request tersimpan dengan pembuat & penerima');

  // keluar & masuk lagi: sesi aman
  await ari.evaluate(() => api.logout()); await wait(300);
  const denied = await ari.evaluate(() => window.PTFire.db().collection('tasks').limit(1).get().then(() => 'terbaca', (e) => e.code));
  ok(denied === 'permission-denied', 'setelah keluar, data tidak bisa dibaca');

  ok(!errs.length, 'tidak ada error JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); server.close();
  console.log(`\n${n} uji end-to-end lulus`);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });

// Bangun folder situs GitHub Pages.
//   site.json { "main": "sheets" }   → versi Sheets di akar, versi Firebase di /beta (masa uji coba)
//   site.json { "main": "firebase" } → versi Firebase di akar (setelah peralihan); /beta mengalihkan ke akar
// Pemakaian: node tools/build-site.js <folder-keluar> [--emulator] [--main=sheets|firebase]   (--emulator tanpa --main: Firebase di /beta untuk uji e2e)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.resolve(process.argv[2] || '_site'), emulator = process.argv.includes('--emulator');
const site = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8')); } catch (e) { return {}; } })();
const flag = (process.argv.find((a) => a.startsWith('--main=')) || '').slice(7);
const mainFirebase = flag ? flag === 'firebase' : site.main === 'firebase' && !emulator;
const cp = (src, dst) => fs.cpSync(src, dst, { recursive: true });
const FB_FILES = ['vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-firestore-compat.js', 'vendor/firebase-messaging-compat.js', 'js/pt-fire.js'];

const fbCfg = fs.readFileSync(path.join(root, 'firebase/config.js'), 'utf8');
const conf = (re) => (fbCfg.match(re) || [])[1];
const firebase = { apiKey: conf(/apiKey: "([^"]+)"/), authDomain: conf(/authDomain: "([^"]+)"/), projectId: conf(/projectId: "([^"]+)"/),
  storageBucket: conf(/storageBucket: "([^"]+)"/), messagingSenderId: conf(/messagingSenderId: "([^"]+)"/), appId: conf(/appId: "([^"]+)"/) };
const vapidKey = conf(/firebaseVapidKey = "([^"]+)"/);
const mainCfg = fs.readFileSync(path.join(root, 'web/config.js'), 'utf8');
const apiUrl = (mainCfg.match(/apiUrl: '([^']+)'/) || [])[1];

/** Ubah salinan web/ di `dir` menjadi versi Firebase. beta = label "(beta)" & cache terpisah. */
function buildFirebase(dir, beta) {
  const cfg = Object.assign({ apiUrl, backend: 'firebase', firebase, vapidKey }, emulator ? { emulator: true, firebase: Object.assign({}, firebase, { projectId: 'demo-tracker' }) } : {});
  fs.writeFileSync(path.join(dir, 'config.js'), '/* Versi Firebase — dibuat otomatis oleh tools/build-site.js */\nwindow.PT_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const ver = (html.match(/pt-web\.js\?v=([\d.]+)/) || [])[1] || '1';
  html = html.replace('<!--FIREBASE-->', ['app', 'auth', 'firestore', 'messaging'].map((m) => `<script src="vendor/firebase-${m}-compat.js?v=${ver}"></script>`).join('\n  ')
    + `\n  <script src="js/pt-fire.js?v=${ver}"></script>`);
  html = html.replace(/connect-src 'self'/, "connect-src 'self' https://*.googleapis.com" + (emulator ? ' http://127.0.0.1:8080 http://127.0.0.1:9099 ws://127.0.0.1:8080' : ''));
  if (beta) html = html.replace(/<title>([^<]*)<\/title>/, '<title>$1 (beta)</title>');
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const sw = path.join(dir, 'sw.js');
  let swSrc = fs.readFileSync(sw, 'utf8');
  if (beta) swSrc = swSrc.replace(/const VERSION = 'pt-v/, "const VERSION = 'pt-beta-v");
  else swSrc = swSrc.replace(/const VERSION = 'pt-v/, "const VERSION = 'pt-fb-v");   // cache baru: versi Sheets lama otomatis dibersihkan di bawah
  swSrc = swSrc.replace(/'vendor\/chart\.umd\.js',/, "'vendor/chart.umd.js', " + FB_FILES.map((f) => `'${f}'`).join(', ') + ',');
  if (!beta) swSrc = swSrc.replace("self.addEventListener('activate', (e) => {", "self.addEventListener('activate', (e) => {\n  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => /^pt-v[\\d.]+$/.test(k)).map((k) => caches.delete(k)))));");
  if (!emulator) swSrc = `/* Push (Firebase Cloud Messaging): pesan data ditampilkan sendiri supaya tag & tujuan klik konsisten. */
importScripts('vendor/firebase-app-compat.js', 'vendor/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(firebase)});
firebase.messaging().onBackgroundMessage((m) => {
  const d = (m && m.data) || {};
  return self.registration.showNotification(d.title || 'Project Tracker', { body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { taskId: d.taskId || '', view: d.view || '' } });
});
` + swSrc;
  fs.writeFileSync(sw, swSrc);
  const mf = path.join(dir, 'manifest.webmanifest');
  if (beta && fs.existsSync(mf)) { const m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.name = (m.name || 'Project Tracker') + ' (beta)'; m.short_name = (m.short_name || 'Tracker') + ' β'; fs.writeFileSync(mf, JSON.stringify(m, null, 2)); }
}
/** Versi Sheets: buang file Firebase. */
function buildSheets(dir) {
  FB_FILES.forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
  fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('  <!--FIREBASE-->\n', ''));
}
/** /beta setelah peralihan: lepas service worker beta lalu alihkan ke alamat utama (tautan #task/… ikut). */
function buildBetaRedirect(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project Tracker</title><meta http-equiv="refresh" content="3;url=../"><style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#334}</style></head>
<body><p>Project Tracker sudah pindah ke alamat utama. Mengalihkan… <a href="../">Buka sekarang</a></p><script src="redirect.js"></script></body></html>\n`);
  fs.writeFileSync(path.join(dir, 'redirect.js'), `(async function () {
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.filter((r) => /\\/beta\\/$/.test(r.scope)).map((r) => r.unregister())); } catch (e) { /* abaikan */ }
  location.replace('../' + location.search + location.hash);
})();\n`);
  // service worker beta lama memperbarui diri ke versi ini: hapus cache beta, lepas diri, muat ulang halaman → dialihkan
  fs.writeFileSync(path.join(dir, 'sw.js'), `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith('pt-beta-v')).map((k) => caches.delete(k)));
  await self.registration.unregister();
  (await self.clients.matchAll({ type: 'window' })).forEach((c) => c.navigate(c.url));
})()));\n`);
}

fs.rmSync(out, { recursive: true, force: true });
cp(path.join(root, 'web'), out);
if (mainFirebase) {
  buildFirebase(out, false);
  buildBetaRedirect(path.join(out, 'beta'));
} else {
  const beta = path.join(out, 'beta');
  cp(path.join(root, 'web'), beta);
  buildFirebase(beta, true);
  buildSheets(out);
}
console.log('Situs dibangun di ' + out + (mainFirebase ? ' — versi utama: Firebase' : ' — versi utama: Sheets, Firebase di /beta') + (emulator ? ' (emulator)' : ''));

// Bangun folder situs: versi utama (Sheets) di akar, versi Firebase di /beta.
// Pemakaian: node tools/build-site.js <folder-keluar> [--emulator]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.resolve(process.argv[2] || '_site'), emulator = process.argv.includes('--emulator');
const cp = (src, dst) => fs.cpSync(src, dst, { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
cp(path.join(root, 'web'), out);
const beta = path.join(out, 'beta');
cp(path.join(root, 'web'), beta);
const fbCfg = fs.readFileSync(path.join(root, 'firebase/config.js'), 'utf8');
const conf = (re) => (fbCfg.match(re) || [])[1];
const firebase = { apiKey: conf(/apiKey: "([^"]+)"/), authDomain: conf(/authDomain: "([^"]+)"/), projectId: conf(/projectId: "([^"]+)"/),
  storageBucket: conf(/storageBucket: "([^"]+)"/), messagingSenderId: conf(/messagingSenderId: "([^"]+)"/), appId: conf(/appId: "([^"]+)"/) };
const vapidKey = conf(/firebaseVapidKey = "([^"]+)"/);
const mainCfg = fs.readFileSync(path.join(root, 'web/config.js'), 'utf8');
const apiUrl = (mainCfg.match(/apiUrl: '([^']+)'/) || [])[1];
const cfg = Object.assign({ apiUrl, backend: 'firebase', firebase, vapidKey }, emulator ? { emulator: true, firebase: Object.assign({}, firebase, { projectId: 'demo-tracker' }) } : {});
fs.writeFileSync(path.join(beta, 'config.js'), '/* Versi Firebase (beta) — dibuat otomatis oleh tools/build-site.js */\nwindow.PT_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
let html = fs.readFileSync(path.join(beta, 'index.html'), 'utf8');
const ver = (html.match(/pt-web\.js\?v=([\d.]+)/) || [])[1] || '1';
html = html.replace('<!--FIREBASE-->', ['app', 'auth', 'firestore', 'messaging'].map((m) => `<script src="vendor/firebase-${m}-compat.js?v=${ver}"></script>`).join('\n  ')
  + `\n  <script src="js/pt-fire.js?v=${ver}"></script>`);
html = html.replace(/connect-src 'self'/, "connect-src 'self' https://*.googleapis.com" + (emulator ? ' http://127.0.0.1:8080 http://127.0.0.1:9099 ws://127.0.0.1:8080' : ''));
html = html.replace(/<title>([^<]*)<\/title>/, '<title>$1 (beta)</title>');
fs.writeFileSync(path.join(beta, 'index.html'), html);
const sw = path.join(beta, 'sw.js');
let swSrc = fs.readFileSync(sw, 'utf8').replace(/const VERSION = 'pt-v/, "const VERSION = 'pt-beta-v");
swSrc = swSrc.replace(/'vendor\/chart\.umd\.js',/, "'vendor/chart.umd.js', 'vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-firestore-compat.js', 'vendor/firebase-messaging-compat.js', 'js/pt-fire.js',");
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
const mf = path.join(beta, 'manifest.webmanifest');
if (fs.existsSync(mf)) { const m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.name = (m.name || 'Project Tracker') + ' (beta)'; m.short_name = (m.short_name || 'Tracker') + ' β'; fs.writeFileSync(mf, JSON.stringify(m, null, 2)); }
// versi utama tidak memuat file Firebase
['vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-firestore-compat.js', 'vendor/firebase-messaging-compat.js', 'js/pt-fire.js'].forEach((f) => fs.rmSync(path.join(out, f), { force: true }));
fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(out, 'index.html'), 'utf8').replace('  <!--FIREBASE-->\n', ''));
console.log('Situs dibangun di ' + out + (emulator ? ' (emulator)' : ''));

/* Service worker: membuat aplikasi bisa dibuka cepat/offline dan menangani klik notifikasi.
 * Naikkan VERSION setiap kali file aplikasi diubah agar semua pengguna mendapat versi baru. */
const VERSION = 'pt-v2.33.3';
const V = VERSION.match(/[\d.]+$/)[0];
// File yang disimpan saat pemasangan. tools/build-site.js mengganti daftar ini dengan file hasil bundel.
const SHELL_FILES = [
  'styles.css', 'config.js', 'manifest.webmanifest',
  'js/theme.js', 'js/logic.js', 'js/demo.js', 'js/aila.js', 'js/pt-web.js', 'js/app.js', 'js/brief.js', 'js/article.js', 'js/social.js', 'js/org.js', 'js/briefdoc.js', 'js/request.js', 'js/schedule.js', 'js/comments.js', 'js/bell.js', 'js/push.js', 'js/detail.js', 'js/ai.js', 'vendor/chart.umd.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png'
];
const SHELL = ['./'].concat(SHELL_FILES.map((f) => f + '?v=' + V));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    // hanya cache milik versi ini (utama 'pt-v…' / beta 'pt-beta-v…') yang dibersihkan, supaya keduanya tidak saling menghapus
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k.startsWith(VERSION.replace(/[\d.]+$/, ''))).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/** Ambil dari jaringan lalu simpan salinannya. */
function fetchPut(req, key) {
  return fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key || req, copy)); }
    return res;
  });
}
// - Halaman (index.html): jaringan dulu supaya versi baru langsung terpakai; bila lambat (> 3 dtk) atau offline, pakai salinan.
// - File berversi (?v=…): langsung dari cache — isinya tidak pernah berubah untuk versi yang sama, jadi tidak perlu ke server.
// - Lainnya: jaringan dulu, cache bila offline. Panggilan ke Firebase/Apps Script (lintas domain) tidak disentuh.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    const net = fetchPut(req, './');
    const cached = new Promise((r) => setTimeout(r, 3000)).then(() => caches.match('./'));
    e.respondWith(Promise.race([net, cached.then((c) => c || net)]).catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || net)));
    return;
  }
  if (url.searchParams.has('v')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetchPut(req)).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(fetchPut(req).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./'))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  const view = e.notification.data && e.notification.data.view;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      if (taskId || view) client.postMessage({ type: 'nav', taskId, view });
    } else {
      await self.clients.openWindow(self.registration.scope + (taskId ? '?task=' + encodeURIComponent(taskId) : view ? '?view=' + encodeURIComponent(view) : ''));
    }
  })());
});

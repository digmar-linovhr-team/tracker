/* AILA — meneruskan notifikasi Project Tracker ke AILA (asisten pribadi di Mac pengguna).
 *
 * Berdiri sendiri: tidak mengubah file lain. Setiap notifikasi yang ditampilkan aplikasi ini
 * (pengingat task, review, mention, push) juga dikirim ke AILA lewat http://127.0.0.1:8765,
 * yaitu alamat yang hanya ada di Mac pengguna itu sendiri.
 *
 * Hanya aktif di browser yang sudah menyimpan token AILA (Pengaturan → AILA). Anggota tim lain
 * tidak terpengaruh sama sekali: tanpa token, file ini tidak melakukan apa pun.
 *
 * Jenis yang dikirim:
 *   - jam mulai task, deadline ≤ 1 jam, lewat deadline → "pengingat" (kapsul AILA, berbunyi, diulang)
 *   - lainnya (deadline lebih jauh, review, mention, push)  → "info" (notifikasi + dibacakan sekali)
 */
(function () {
  'use strict';
  var ALAMAT = 'http://127.0.0.1:8765';
  var KUNCI = 'pt.aila';
  var terkirim = {};          // tag -> waktu, supaya notifikasi yang sama tidak dikirim berkali-kali

  function cfg() {
    try { return Object.assign({ token: '', aktif: false, sembunyikan: true }, JSON.parse(localStorage.getItem(KUNCI) || '{}')); }
    catch (e) { return { token: '', aktif: false, sembunyikan: true }; }
  }
  function simpan(patch) {
    var c = Object.assign(cfg(), patch);
    try { localStorage.setItem(KUNCI, JSON.stringify(c)); } catch (e) { /* mode privat */ }
    return c;
  }
  function siap() { var c = cfg(); return !!(c.aktif && c.token); }

  function jenisDari(judul, tag) {
    tag = String(tag || '');
    if (/\|start\||\|overdue\|/.test(tag)) return 'pengingat';
    var m = tag.match(/\|due(\d+)\|/);
    if (m && Number(m[1]) <= 60) return 'pengingat';
    if (/^Task dimulai|melewati deadline/i.test(judul || '')) return 'pengingat';
    return 'info';
  }

  async function kirim(isi) {
    var c = cfg();
    if (!c.token) return { ok: false, galat: 'Token AILA belum diisi' };
    try {
      var r = await fetch(ALAMAT + '/notifikasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AILA-Token': c.token },
        body: JSON.stringify(Object.assign({ judul: 'Project Tracker' }, isi))
      });
      if (r.status === 401) return { ok: false, galat: 'Token AILA salah. Salin ulang dari AILA → Pengaturan → Aplikasi lain.' };
      var j = await r.json().catch(function () { return {}; });
      return j.ok ? { ok: true } : { ok: false, galat: j.galat || ('AILA menjawab ' + r.status) };
    } catch (e) {
      return { ok: false, galat: 'AILA tidak bisa dihubungi. Pastikan AILA menyala di Mac ini.' };
    }
  }

  /** Teruskan satu notifikasi. Hasil true = AILA menerimanya. */
  async function teruskan(judul, opsi) {
    if (!siap()) return false;
    opsi = opsi || {};
    var tag = opsi.tag || (judul + '|' + (opsi.body || ''));
    var sekarang = Date.now();
    Object.keys(terkirim).forEach(function (k) { if (sekarang - terkirim[k] > 10 * 60000) delete terkirim[k]; });
    if (terkirim[tag]) return true;
    terkirim[tag] = sekarang;
    var isi = String(opsi.body || '').trim();
    var r = await kirim({ jenis: jenisDari(judul, tag), pesan: isi ? judul + ': ' + isi : String(judul || '') });
    if (!r.ok) delete terkirim[tag];
    return r.ok;
  }

  // ---------- sadap notifikasi aplikasi (service worker & Notification) ----------
  if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification) {
    var tampilAsli = ServiceWorkerRegistration.prototype.showNotification;
    ServiceWorkerRegistration.prototype.showNotification = async function (judul, opsi) {
      var diterima = await teruskan(judul, opsi);
      // kalau AILA sudah menerima dan pengguna memilih menyembunyikan notifikasi browser, jangan tampil dobel
      if (diterima && cfg().sembunyikan) return undefined;
      return tampilAsli.call(this, judul, opsi);
    };
  }
  if (window.Notification) {
    var NotifAsli = window.Notification;
    var NotifAila = function (judul, opsi) {
      if (siap() && cfg().sembunyikan) {
        teruskan(judul, opsi);
        var tiruan = new EventTarget();  // pengganti diam: aplikasi tetap bisa memasang onclick/close
        tiruan.close = function () {}; tiruan.title = judul; tiruan.body = (opsi && opsi.body) || '';
        return tiruan;
      }
      teruskan(judul, opsi);
      return new NotifAsli(judul, opsi);
    };
    NotifAila.prototype = NotifAsli.prototype;
    Object.defineProperty(NotifAila, 'permission', { get: function () { return NotifAsli.permission; } });
    NotifAila.requestPermission = function () { return NotifAsli.requestPermission.apply(NotifAsli, arguments); };
    if ('maxActions' in NotifAsli) Object.defineProperty(NotifAila, 'maxActions', { get: function () { return NotifAsli.maxActions; } });
    window.Notification = NotifAila;
  }

  // ---------- sambung cepat lewat tautan: …/tracker/#aila-token=XXXX ----------
  (function () {
    var m = location.hash.match(/aila-token=([\w-]{16,})/);
    if (!m) return;
    simpan({ token: m[1], aktif: true });
    history.replaceState(null, '', location.pathname + location.search);   // token tidak tertinggal di alamat
    setTimeout(function () { kirim({ jenis: 'info', pesan: 'Project Tracker sudah tersambung ke AILA.' }); }, 800);
  })();

  // ---------- kartu di Pengaturan ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kabar(teks, galat) {
    var akar = document.getElementById('toast-root'); if (!akar) return;
    var el = document.createElement('div'); el.className = 'toast' + (galat ? ' err' : ''); el.textContent = teks;
    akar.appendChild(el); setTimeout(function () { el.remove(); }, galat ? 6000 : 3200);
  }
  async function perbaruiLabel() {
    var el = document.getElementById('aila-chip'); if (!el) return;
    var menyala = false;
    try { menyala = (await fetch(ALAMAT + '/status')).ok; } catch (e) { /* mati */ }
    var c = cfg();
    el.className = 'chip ' + (menyala && c.token && c.aktif ? 'good' : menyala ? 'warn' : '');
    el.textContent = !menyala ? 'AILA tidak terdeteksi' : !c.token ? 'Token belum diisi' : c.aktif ? 'Tersambung' : 'Dimatikan';
  }
  function pasangKartu() {
    if (document.getElementById('aila-kartu')) return;
    var judul = Array.prototype.find.call(document.querySelectorAll('#view .settings-sect .card-h h2'), function (h) { return /Notifikasi browser/.test(h.textContent); });
    if (!judul) return;
    var c = cfg();
    var kartu = document.createElement('div');
    kartu.className = 'card settings-sect'; kartu.id = 'aila-kartu';
    kartu.innerHTML = '<div class="card-h"><h2>AILA (asisten di Mac)</h2><span class="chip" id="aila-chip">Memeriksa…</span></div><div class="card-b">'
      + '<p>Teruskan notifikasi Project Tracker ke AILA di Mac ini. Jam mulai task, deadline 1 jam lagi, dan lewat deadline muncul sebagai kapsul AILA yang berbunyi; notifikasi lain dibacakan sekali. Hanya berlaku di browser ini.</p>'
      + '<form id="aila-f" class="row" style="flex-wrap:wrap;gap:8px"><input type="password" name="token" autocomplete="off" style="flex:1;min-width:220px" placeholder="'
      + esc(c.token ? 'Token tersimpan · tempel lagi untuk mengganti' : 'Tempel token dari AILA → Pengaturan → Aplikasi lain') + '"><button class="btn primary">Simpan token</button></form>'
      + '<label class="check" style="margin-top:10px"><input type="checkbox" id="aila-on"' + (c.aktif ? ' checked' : '') + '> Teruskan notifikasi ke AILA</label>'
      + '<label class="check"><input type="checkbox" id="aila-sembunyi"' + (c.sembunyikan ? ' checked' : '') + '> Jangan tampilkan notifikasi browser lagi selama AILA menerimanya (supaya tidak dobel)</label>'
      + '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn" id="aila-uji" type="button">Kirim notifikasi uji ke AILA</button>'
      + (c.token ? '<button class="btn" id="aila-lepas" type="button">Lepaskan</button>' : '') + '</div></div>';
    judul.closest('.settings-sect').insertAdjacentElement('afterend', kartu);
    kartu.querySelector('#aila-f').addEventListener('submit', async function (e) {
      e.preventDefault(); var t = e.target.token.value.trim(); if (!t) return;
      simpan({ token: t, aktif: true }); e.target.token.value = ''; e.target.token.placeholder = 'Token tersimpan · tempel lagi untuk mengganti'; kartu.querySelector('#aila-on').checked = true;
      var r = await kirim({ jenis: 'info', pesan: 'Project Tracker sudah tersambung ke AILA.' });
      kabar(r.ok ? 'Tersambung ke AILA' : r.galat, !r.ok); perbaruiLabel();
    });
    kartu.querySelector('#aila-on').addEventListener('change', function (e) { simpan({ aktif: e.target.checked }); kabar(e.target.checked ? 'Notifikasi diteruskan ke AILA' : 'Tidak diteruskan ke AILA'); perbaruiLabel(); });
    kartu.querySelector('#aila-sembunyi').addEventListener('change', function (e) { simpan({ sembunyikan: e.target.checked }); });
    kartu.querySelector('#aila-uji').addEventListener('click', async function () {
      var r = await kirim({ jenis: 'info', pesan: 'Notifikasi uji dari Project Tracker.' }); kabar(r.ok ? 'Notifikasi uji terkirim ke AILA' : r.galat, !r.ok); perbaruiLabel();
    });
    var lepas = kartu.querySelector('#aila-lepas');
    if (lepas) lepas.addEventListener('click', function () { simpan({ token: '', aktif: false }); kartu.remove(); pasangKartu(); kabar('AILA dilepas dari browser ini'); });
    perbaruiLabel();
  }
  function amati() {
    var view = document.getElementById('view');
    if (!view) return setTimeout(amati, 500);
    new MutationObserver(pasangKartu).observe(view, { childList: true });
    pasangKartu();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', amati); else amati();

  window.PTAila = { kirim: kirim, simpan: simpan, config: cfg };
})();

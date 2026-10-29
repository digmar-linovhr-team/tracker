# Project Tracker di Firebase — struktur data & arsitektur

## Arsitektur
- **PWA (GitHub Pages)** → Firebase Auth (login) + Firestore (data, realtime). Lapisan `web/js/pt-fire.js` menyediakan
  `api.call(action, payload)` yang sama dengan versi Sheets: **baca** dilayani dari cache realtime (onSnapshot), **tulis**
  memakai logika yang sama dengan mode demo, dijalankan sebagai transaksi Firestore.
- **Apps Script** (akun pemilik proyek, OAuth → melewati Security Rules) mengerjakan yang perlu server:
  membuat/reset akun login, migrasi login lama, email, Google Calendar, ringkasan pagi, laporan, task berulang,
  **push FCM** (@sebut & deadline), ekspor brief ke Google Docs, dan salinan malam ke Google Sheets (baca-saja).
- **Google Sheets** tidak lagi menjadi database; disalin tiap malam sebagai cadangan/arsip yang bisa dibaca owner.

## Login
- Pengguna tetap memakai **username + password**. Akun Firebase Auth memakai email sintetis
  `<username>@linovhr-tracker.firebaseapp.com` (tidak pernah dikirimi email).
- **Pendaftaran dari klien dimatikan** (Authentication → Settings → User actions → Enable create: OFF). Akun hanya dibuat Apps Script:
  - **Migrasi bertahap**: login pertama di versi baru → bila akun belum ada, Apps Script memeriksa hash password lama
    lalu membuat akun Firebase dengan password yang sama. Tidak ada reset massal.
  - Pengguna baru / reset password oleh admin → Apps Script membuat/mengubah akun dengan password sementara.
- Aturan keamanan mengenali orang dari `request.auth.token.email` (bagian sebelum `@` = username) dan membaca perannya di `users/{username}`.

## Koleksi
| Koleksi | ID dokumen | Isi | Baca | Tulis |
|---|---|---|---|---|
| `users` | username | profil publik: name, role, active, position, reportsTo, division, skills, joined, orgOnly, wfoExempt, hasTasks, onboard, mustChange | anggota aktif | admin; pemilik hanya `skills`, `onboard`, `mustChange→false` |
| `private` | username | email, preferensi notifikasi | pemilik & admin | pemilik (email, prefs) & admin |
| `projects` | code | project, pic, start, end, priority, status | anggota aktif | admin |
| `tasks` | Task ID | semua kolom task (results & stageLog berupa array) | anggota aktif | admin; pemilik (kolom kerja, tanpa Done & tanpa melompati review); pembuat Request/Sosmed |
| `briefs` | Brief ID | brief artikel/sosmed/request (data berupa map) | anggota aktif | admin, pembuat, penanggung jawab |
| `schedule` | `<week>_<username>` | days, source | anggota aktif | admin; pemilik (source=choice) |
| `schedRequests` | ID | pengajuan pindah hari / tidak bisa WFO | anggota aktif | pemilik buat & batalkan; admin putuskan |
| `holidays` | yyyy-mm-dd | name | anggota aktif | admin |
| `leaves` | ID | cuti/sakit/izin | admin, pemilik, & yang disetujui | pemilik ajukan/batalkan; admin |
| `comments` | ID | taskId, author, kind, text, mentions, createdAt, editedAt, deleted | anggota aktif | penulis (ubah/hapus ≤ 15 menit); admin hapus |
| `notifications` | ID | to, from, type, text, taskId, read, createdAt — isi lonceng | penerima | pengirim membuat; penerima menandai dibaca |
| `devices` | token FCM | username, label, prefs, createdAt, lastSeen | pemilik & admin | pemilik |
| `logs` | otomatis | jejak aktivitas | admin | anggota aktif (hanya menambah) |
| `serverMeta` | Task ID | id event Calendar, status pengingat | — | hanya Apps Script |

## Kuota (Spark: 50.000 baca/hari)
- Aplikasi membuka listener untuk task aktif + selesai 90 hari terakhir; task lebih lama dimuat saat dibutuhkan (Dashboard "Semua").
- Cache offline Firestore (IndexedDB) aktif → membuka ulang aplikasi tidak membaca ulang semua dokumen.
- Perkiraan 5 orang aktif: 2.000–5.000 baca/hari.

## Catatan keamanan
Aturan keamanan menjaga **siapa boleh mengubah apa** (mis. anggota tidak bisa menandai Done, mengubah task orang lain,
atau melompati tahap review artikel). Validasi bisnis yang butuh melihat banyak dokumen (mis. kuota minimal 2 orang WFO)
dijalankan di aplikasi, seperti di versi sekarang.

# Project Tracker (PWA) — panduan setup

Web app untuk tracking task tim yang bisa dibuka dari browser mana pun dan dipasang seperti aplikasi di laptop (Windows/Mac) maupun HP (Android/iPhone). Setiap orang login ke akunnya, melihat task beserta jadwal mulai & deadline, menandai **Mulai** dan **Done**, dan mendapat pengingat lewat **Google Calendar + email**. Admin membagikan task dan melihat dashboard waktu pengerjaan serta siapa yang overperforming.

Database tetap spreadsheet **"KPI dan Tracker"** — perubahan dari aplikasi langsung tertulis ke Sheets, dan sebaliknya.

```
project-tracker/
├── apps-script/Code.gs          ← backend, ditempel ke Apps Script spreadsheet
├── web/                         ← website/PWA (diunggah ke GitHub Pages)
│   └── config.js                ← tempat URL Web App
├── tests/                       ← uji otomatis
└── .github/workflows/pages.yml  ← publikasi otomatis ke GitHub Pages
```

Total waktu setup: ±20 menit, sekali saja.

---

## Langkah 1 — Backend di Google Sheets

1. Buka spreadsheet **KPI dan Tracker** → **Extensions → Apps Script**.
2. Hapus isi `Code.gs` bawaan, tempel seluruh isi `apps-script/Code.gs`, klik **Save**.
3. Kembali ke spreadsheet, **reload**. Muncul menu **Project Tracker**.
4. Klik **Project Tracker → 1. Setup / perbarui struktur** dan izinkan akses (peringatan "unverified app" normal untuk script buatan sendiri → *Advanced → Go to …*). Setup akan:
   - menambah kolom baru (*Start Time, End Time, Priority, Task ID, Started At, Done At, Notes*, dan kolom teknis *Cal …/Reminded*) di **akhir** tiap tab orang — kolom lama tidak digeser,
   - memberi Task ID ke setiap task yang sudah ada,
   - membuat tab **Users** dan **Activity Log**,
   - membuat akun untuk tiap tab orang (username = nama tab huruf kecil: `ari`, `wisnu`, …) + akun `admin`.
5. **Salin password sementara** yang muncul (tidak ditampilkan lagi; bisa di-reset kapan saja).
6. Klik **Project Tracker → 2. Aktifkan Calendar & email pengingat** dan izinkan akses Calendar & Gmail.
7. **Deploy → New deployment** → ikon gerigi → **Web app**:
   - *Execute as*: **Me** · *Who has access*: **Anyone**
   - klik **Deploy**, salin **Web app URL** (`https://script.google.com/macros/s/…/exec`).

> Akses "Anyone" hanya membuat URL bisa dihubungi; setiap aksi tetap wajib login dengan token bertanda tangan. Spreadsheet tetap privat, password disimpan sebagai hash, dan login dikunci 15 menit setelah 5 kali salah.

**Saat Code.gs diperbarui nanti:** tempel versi baru → jalankan menu *1. Setup* lagi → Deploy → *Manage deployments* → ✏️ → Version: *New version* → Deploy. URL tetap sama.

---

## Langkah 2 — Publikasikan website (GitHub Pages)

1. Buka `web/config.js`, isi URL dari langkah 1:
   ```js
   window.PT_CONFIG = { apiUrl: 'https://script.google.com/macros/s/XXXX/exec' };
   ```
   (Boleh dikosongkan — setiap orang lalu diminta menempel URL saat pertama membuka.)
2. Buat repository baru di GitHub, mis. `project-tracker`. Di akun GitHub gratis, GitHub Pages butuh repo **Public** — aman, karena repo hanya berisi kode tampilan; data tetap di spreadsheet.
3. Unggah **seluruh isi** folder `project-tracker` (termasuk folder `.github`) ke repo: *Add file → Upload files*, atau lewat GitHub Desktop.
4. Di repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Buka tab **Actions** dan tunggu workflow *Deploy ke GitHub Pages* selesai (±1 menit). Alamat aplikasi: `https://<username>.github.io/project-tracker/`

Setiap kali file di `web/` diubah dan di-push, website otomatis diperbarui. Jika mengubah file aplikasi, naikkan juga `VERSION` di `web/sw.js` agar perangkat yang sudah memasang aplikasi langsung memuat versi baru.

> Ingin domain sendiri (mis. `tracker.linovhr.com`)? Settings → Pages → *Custom domain*, lalu buat record CNAME ke `<username>.github.io` di DNS.

---

## Langkah 3 — Bagikan ke tim

Kirim link aplikasi + username & password sementara masing-masing. Setiap orang:

1. Buka link → login → buat password baru.
2. Buka **Setelan** → isi **email Google** mereka (untuk Google Calendar & pengingat). Admin juga bisa mengisinya di menu **Pengguna**.
3. **Pasang sebagai aplikasi** (opsional, disarankan):
   - **Chrome/Edge (Windows & Mac):** ikon *Install* di ujung kanan kolom alamat.
   - **Android (Chrome):** menu ⋮ → *Tambahkan ke layar utama*.
   - **iPhone/iPad (Safari):** tombol *Bagikan* → *Tambah ke Layar Utama*.

---

## Cara kerja pengingat

| Saluran | Kapan | Muncul walau aplikasi ditutup? |
|---|---|---|
| **Google Calendar** — event `▶ <task>` di jam mulai dan `⏰ Deadline: <task>` yang berakhir tepat di jam deadline | Notifikasi sesuai setelan default Google Calendar masing-masing (biasanya 10–30 menit sebelumnya) | ✅ Ya, di HP & laptop |
| **Email** — pengingat saat deadline tinggal ≤ 24 jam, dan saat lewat deadline | Dicek tiap 5 menit, tiap email dikirim sekali | ✅ Ya |
| **Ringkasan pagi** — task terlambat, deadline hari ini, mulai hari ini | 07:00, Senin–Jumat; admin juga menerima rekap task terlambat tim | ✅ Ya |
| **Notifikasi browser** | Jam mulai, sebelum deadline (bisa diatur di Setelan), saat lewat deadline | ❌ Hanya saat aplikasi/tab terbuka |

- Event Calendar dibuat di kalender **"Project Tracker"** milik akun admin (pemilik script), dengan penanggung jawab sebagai tamu, sehingga muncul di Calendar mereka. Event otomatis **diperbarui** saat jadwal diubah dan **dihapus** saat task ditandai Done, Hold, atau dihapus.
- Perubahan dari aplikasi maupun yang diketik langsung di spreadsheet tersinkron ke Calendar dalam ≤ 5 menit (atau menu *Sinkronkan Calendar sekarang*).
- Admin pemilik script tidak mendapat notifikasi untuk setiap event (pengingat di kalender pemilik dimatikan). Kalender "Project Tracker" bisa disembunyikan dari tampilan admin.
- Ingin tamu menerima email undangan setiap event dibuat? Ubah `SEND_INVITES: true` di bagian atas `Code.gs`. Jam ringkasan pagi dan ambang email juga diatur di sana.
- Pastikan setelan Google Calendar tim mengizinkan undangan otomatis masuk (*Settings → Event settings → Add invitations to my calendar*). Default Google Workspace sudah mengizinkan undangan dari dalam organisasi.

---

## Cara pakai singkat

**Anggota tim — "Task Saya"**: task dikelompokkan *Terlambat / Hari ini & berjalan / Akan datang / Tanpa jadwal / Selesai*. **▶ Mulai** mencatat waktu mulai dikerjakan, **✓ Done** mencatat waktu selesai, **Buka lagi** bila ternyata belum selesai. Task berupa URL artikel bisa diklik.

**Selesai → Review → Done**: anggota menekan lingkaran centang untuk **mengajukan review** (status *Review*). Admin diberi tahu lewat angka di menu **Review**, notifikasi browser, dan email, lalu memilih **Setujui** (Done) atau **Kembalikan** (kembali ke On-Progress, alasan tercatat di Catatan dan dikirim ke email anggota). Hanya admin yang bisa menandai Done. Waktu selesai di dashboard dihitung dari saat anggota mengajukan review.

**Hasil kerja (kolom *Result* & *Result Note*)**: di setiap task ada tombol **Hasil kerja** untuk menulis **keterangan hasil** (kolom *Result Note*, terpisah dari Catatan admin) dan menempel link dokumen (Google Docs/Sheets/Slides/Drive/Forms, Figma, Canva, atau link lain), maksimal 10 per task. Bisa diubah selama task belum Done. Saat mengajukan review tanpa link, aplikasi mengingatkan (tidak wajib). Admin melihat link di menu **Review**, di kolom *Hasil* Semua Task, dan di email notifikasi review. Di spreadsheet tersimpan di kolom **Result**, satu link per baris: `Nama | URL` atau URL saja — boleh juga diisi langsung dari sheet.

**Project 1 task**: saat membuat **Project baru**, centang **Buat juga sebagai task** dan pilih penanggung jawab — project dan task-nya dibuat sekaligus (nama, code, tanggal, prioritas mengikuti project). Untuk project lama yang belum punya task, klik **+ Jadikan task** di menu Project.

**Status project otomatis**: project dengan 1 task → status project selalu sama dengan task-nya (task disetujui Done → project Done). Project dengan banyak task → otomatis Done saat semua task Done, dan kembali On-Progress bila ada task yang dibuka lagi/ditambah; selain itu status manual (mis. Hold) tidak diubah. Tampilan aplikasi langsung berubah; kolom Status di tab Main Project diperbarui ±1 menit kemudian (perubahan yang diketik langsung di spreadsheet ≤ 5 menit).

**Jenis task: Artikel vs Non-artikel**: saat membuat task, admin memilih jenisnya. Task **Non-artikel** memakai alur biasa (Mulai → Ajukan review → Done). Task **Artikel** memakai 8 tahap: 1 Ditugaskan → 2 Menyusun brief → 3 Review brief (admin) → 4 Menulis artikel (link Docs di Hasil kerja) → 5 Review artikel (admin) → 6 Publish (anggota mengisi URL live) → 7 Cek ulang dengan AI (link Docs hasil cek) → 8 Review cek AI (admin) → Done. Di tiap tahap anggota melihat satu tombol langkah berikutnya; admin menyetujui atau mengembalikan (dengan alasan) di menu **Review** yang menandai jenis pengajuannya (Review brief / artikel / cek AI). Status lama terisi otomatis dari tahap. Riwayat tahap disimpan di kolom *Stage Log*.

**KPI task Artikel**: dihitung dengan **jam kerja** saja (Senin–Jumat 09:00–18:00 WIB). Waktu kerja = sejak ditugaskan/jadwal mulai sampai Done, **dikurangi** lama di review admin (waktu review tetap dicatat dan ditampilkan terpisah). **Terlambat** bila waktu kerja melebihi jatah (jadwal mulai → deadline, dalam jam kerja) lebih dari **2 jam kerja**. Ubah aturan ini di `WORK` / `GRACE_MS` pada `web/js/logic.js`.

**Brief**: menu **Brief** untuk menyusun brief artikel yang terhubung ke task (satu brief per task). Anggota membuat brief untuk task miliknya (tombol **+ Brief** di task atau **+ Brief baru**), admin untuk task siapa pun. Isi brief: keyword utama & turunan · analisis kompetitor (link + insight, minimal 2) · H1, jenis konten (Informasional/Consideration/Conversion), estimasi jumlah kata, meta title & description (dengan pratinjau Google) · struktur artikel: Introduction, H2 + poin pembahasan + source, H3 + poin pembahasan · CTA (halaman produk + ajakan) · internal & external link · FAQ (pertanyaan + jawaban) · extra feature (infographic, tabel, dll.). Simpan otomatis, status Draft → Siap ditulis (butuh keyword, H1, dan minimal 2 kompetitor), **Duplikat** ke task lain, dan ekspor **Google Doc** (folder Drive "Brief Artikel", dibagikan ke penulis). Semua anggota bisa membaca brief; yang bisa mengubah hanya pemilik task dan admin. Data tersimpan di tab **Briefs**.

**Brief sosmed**: menu **Brief › Sosmed**. Siapa pun bisa membuat brief konten **Carousel** (per slide: teks, visual/gambar, link referensi) atau **Video** (per scene: visual/adegan, teks/voice-over, durasi, referensi), lengkap dengan platform, ukuran (preset Instagram/LinkedIn/TikTok, boleh lebih dari satu), caption (penghitung karakter), dan catatan untuk desainer. **Tugaskan & buat task** membuat task berjenis **Sosmed** di tab penanggung jawab (ia mendapat email). Alurnya alur biasa — Mulai → Ajukan review → admin Setujui = Done — dengan KPI biasa. Setelah admin menyetujui, pembuat brief mendapat email + notifikasi di aplikasi. Yang bisa mengubah brief: pembuatnya, penanggung jawab, dan admin; penugasan hanya oleh pembuat & admin. Menghapus brief yang task-nya belum dimulai ikut menghapus task-nya.

**Request**: menu **Brief › Request**. Siapa pun bisa meminta bantuan anggota lain (mis. desainer → writer untuk copy landing page): judul, penerima, deadline, satu kotak teks kebutuhan, dan lampiran berupa link. Task berjenis **Request** otomatis masuk ke penerima (dengan email). Alur: penerima **menerima** atau **meminta klarifikasi** dulu (tanya-jawab di request; pembuat bisa memperpanjang deadline) → mengerjakan & menempel hasil → **mengajukan** → **pembuat request menyetujui** atau mengembalikan. Admin bisa melihat semua request, tetapi request tidak masuk antrean Review admin. **KPI Request** tampil sebagai kategori sendiri di Dashboard (diterima, selesai tepat waktu, waktu respon, disetujui tanpa revisi); waktu klarifikasi dijeda dan menggeser deadline.

**Struktur**: menu **Struktur** menampilkan bagan atasan–bawahan seluruh tim (posisi, divisi, keahlian, task aktif, tanggal bergabung) agar anggota saling mengenal; ada tampilan **Daftar per divisi** dan pencarian. Admin mengatur **Atasan**, **Divisi**, **Bergabung**, dan **Keahlian** lewat Pengguna → Edit (kolom Reports To, Division, Joined, Skills di tab Users; struktur berputar ditolak). Owner/direksi bisa ditambahkan sebagai **Tanpa akun** (kolom Org Only) — hanya tampil di bagan, tidak bisa login. Anggota bisa mengisi keahliannya sendiri dari profilnya. Email tidak ditampilkan.

**Tim**: semua anggota bisa melihat task setiap orang (judul, project, status, jadwal, catatan) beserta ringkasan beban kerja — hanya lihat, tidak bisa mengubah. Server menolak setiap perubahan pada task milik orang lain.

**Admin**: **Review**, **Semua Task** (buat/edit/pindahkan/hapus task lengkap dengan jam), **Project** (tab Main Project + progres), **Pengguna** (tambah anggota — tab baru dibuat otomatis — email, role, reset password), **Dashboard** (filter periode & orang).

### Cara dashboard menghitung
| Metrik | Definisi |
|---|---|
| Waktu pengerjaan | Saat **diajukan review** (*Review At*) − *Started At* (saat tombol Mulai ditekan); bila tidak pernah ditekan Mulai, dihitung dari jadwal mulai. Lama review admin tidak dihitung |
| Overperforming | Selesai sebelum deadline **dan** memakai ≤ 80% durasi rencana (ubah `OVERPERFORM_RATIO` di `web/js/logic.js`) |
| Tepat waktu | Selesai sebelum/tepat deadline |
| Selesai terlambat | Done setelah deadline |
| Overdue aktif | Belum done dan sudah lewat deadline |
| Selisih deadline | Deadline − waktu Done (positif = lebih cepat) |

Jam default bila kolom jam kosong: mulai 09:00, deadline 18:00. Task berstatus *Recurring* atau bertanggal teks (*TBD*) tetap tampil tapi tidak memicu pengingat.

---

## Mode demo
Di layar awal (sebelum URL diisi) klik **Coba mode demo** → login `admin`, `ari`, `wisnu`, dst. dengan password `demo`. Data demo tidak menyentuh spreadsheet.

## Menjalankan & menguji secara lokal
```bash
cd web && python3 -m http.server 8080      # buka http://localhost:8080
node tests/logic.test.js                   # logika durasi, performa & notifikasi
TZ=Asia/Jakarta node tests/backend.test.js # backend dengan simulasi Sheets/Calendar/Gmail
```

## Batasan
- Kuota gratis Apps Script (Workspace): ±1.500 email/hari dan ribuan event Calendar/hari — jauh di atas kebutuhan tim ±20 orang. Respons tiap aksi biasanya 1–3 detik.
- Jangan mengubah nama header kolom, nama tab orang (tersimpan di kolom *Sheet Name* tab Users), atau kolom *Task ID*/*Cal …*. Urutan kolom boleh diubah.

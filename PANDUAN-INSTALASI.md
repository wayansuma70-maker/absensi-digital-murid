# 📋 PANDUAN INSTALASI — Absensi Digital Murid

## A. BACKEND (Google Apps Script)
1. Buka https://script.google.com → **Proyek Baru**, beri nama "Absensi Digital Murid".
2. Rename `Code.gs` → `Kode`, hapus isinya, lalu paste seluruh isi **Kode.gs**.
3. Klik ⚙️ **Project Settings** → centang **Show "appsscript.json" manifest file in editor**. Kembali ke Editor, buka `appsscript.json`, ganti seluruh isinya dengan isi file **appsscript.json** (mengatur zona waktu WITA).
4. Jalankan **`setupAppEnvironment`** — HANYA SEKALI: pilih fungsi di dropdown → ▶ Run → *Review permissions* → izinkan akses Drive, Sheets, Gmail. Pastikan Execution Log menampilkan ✅.
   - ⚠️ Jangan dijalankan lebih dari sekali (folder & sheet akan dobel).
5. Jalankan **`setupTriggers`** sekali (memasang penanda Alpa otomatis tiap hari sekitar pukul 09.00 WITA).
6. Buka Google Sheets hasil setup (link ada di Execution Log) → sheet **Pengaturan**: isi `LAT` dan `LNG` dengan koordinat gerbang sekolah (klik kanan titik di Google Maps → salin koordinat). Atur `RADIUS` (30–50), jam, dan `HARI_LIBUR` (format `2026-12-25,2027-01-01`) bila perlu.
7. Isi data murid di sheet **Murid** (kolom `nis, nama, kelas, sandi_hash, email_ortu, aktif`; `aktif` = `Y`). Ketik kata sandi biasa di kolom `sandi_hash`, lalu jalankan **`hashSandiMassal`** sekali untuk mengubahnya menjadi hash. Lakukan hal sama di sheet **Admin**, lalu **hapus akun contoh** (`20240001` dan `admin`).
8. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone** → Deploy → **salin URL `/exec`**.
9. Setiap mengubah kode `Kode.gs`, lakukan **Deploy → Manage deployments → Edit → New version**.

Login contoh sebelum dihapus: Murid `20240001` / `murid123` · Admin `admin` / `admin123`.

## B. FRONTEND (GitHub Pages)
1. Ekstrak **absensi-digital-murid.zip**. Folder hasil ekstraksi (`absensi-digital-murid`, berisi `index.html`) adalah folder kerja Anda.
2. Buka `js/config.js`, ganti `ISI_URL_EXEC_DI_SINI` dengan URL `/exec` dari langkah A8.
3. Buat repository **Public** di GitHub (jangan centang README/.gitignore/license).
4. Dari **dalam folder `absensi-digital-murid`** (pastikan `dir`/`ls` menampilkan `index.html`), jalankan:
   ```
   git init
   git add .
   git commit -m "Upload pertama"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
   Saat diminta password, gunakan **Personal Access Token** (scope `repo`).
5. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → ✅ **Enforce HTTPS** (wajib untuk kamera & GPS) → Save.
6. Buka `https://USERNAME.github.io/NAMA-REPO/`.

## C. Update di kemudian hari
`git add .` → `git commit -m "keterangan"` → `git push` (dari folder yang sama). Refresh dengan Ctrl+Shift+R.

## D. Tes
1. Login admin → Rekap tampil. Login murid → tombol Absen aktif di jam jendela & di dalam radius.
2. Absen masuk → cek baris baru di sheet **Absensi** dan foto di Drive `Uploads`.
3. Ajukan izin → setujui dari akun admin → status murid menjadi Izin/Sakit.
4. Chrome DevTools → Network → pastikan tidak ada error CORS.

## E. Catatan penting
- Kuota email harian: akun gratis ±100, Workspace ±1.500. Jika kuota hampir habis, email dilewati otomatis; absen tetap tercatat.
- Data Absensi tumbuh ±14.000 baris/bulan. Arsipkan per tahun ajaran (salin spreadsheet) agar tetap cepat.
- Lokasi browser dapat dipalsukan; foto + koordinat + jarak tersimpan sebagai bukti untuk ditinjau admin.

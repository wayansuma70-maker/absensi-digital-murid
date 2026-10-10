// ============================================================
// ABSENSI DIGITAL MURID — Backend REST API (Google Apps Script)
// GET  ?action=config  -> konfigurasi publik
// POST {action, token, data} (Content-Type: text/plain) -> JSON
// ============================================================
const CONFIG = {
  get SPREADSHEET_ID() { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); },
  get ROOT_FOLDER_ID() { return PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID'); },
  get UPLOADS_FOLDER() { return PropertiesService.getScriptProperties().getProperty('UPLOADS_FOLDER'); },
  get EXPORTS_FOLDER() { return PropertiesService.getScriptProperties().getProperty('EXPORTS_FOLDER'); }
};
const TZ = 'Asia/Makassar';
const STATUS_OK = ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa'];
const HEAD = {
  Murid: ['nis', 'nama', 'kelas', 'sandi_hash', 'email_ortu', 'aktif'],
  Admin: ['id', 'nama', 'sandi_hash', 'email'],
  Absensi: ['id', 'tanggal', 'nis', 'nama', 'kelas', 'jam_masuk', 'lat_masuk', 'lng_masuk', 'jarak_masuk', 'foto_masuk',
            'jam_pulang', 'lat_pulang', 'lng_pulang', 'jarak_pulang', 'foto_pulang', 'status', 'keterangan', 'diubah_oleh'],
  Izin: ['id', 'tgl_pengajuan', 'tgl_izin', 'nis', 'nama', 'kelas', 'jenis', 'alasan', 'link_berkas', 'status', 'diproses_oleh', 'catatan'],
  Log: ['waktu', 'pelaku', 'aksi', 'detail']
};

// ============================================================
// ENTRY POINTS
// ============================================================
function doGet(e) {
  try {
    const a = (e.parameter && e.parameter.action) || 'config';
    if (a === 'config') return out({ success: true, data: publicConfig() });
    return out({ success: false, message: 'Action tidak dikenal' });
  } catch (err) { return out({ success: false, message: err.message }); }
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents), a = p.action, d = p.data || {};
    if (a === 'login') return out(login(d));
    const u = auth(p.token);
    if (a === 'logout') { CacheService.getScriptCache().remove('tok_' + p.token); return out({ success: true }); }
    const murid = { home: home, absen: absen, izin: ajukanIzin, riwayat: riwayat };
    const admin = { rekap: adminRekap, ubahStatus: adminUbahStatus, izinList: adminIzinList, keputusan: adminKeputusan,
      setGet: adminSetGet, setSimpan: adminSetSimpan, impor: adminImpor };
    if (murid[a]) { if (u.role !== 'murid') throw new Error('Khusus murid.'); return out(murid[a](u, d)); }
    if (admin[a]) { if (u.role !== 'admin') throw new Error('Khusus admin.'); return out(admin[a](u, d)); }
    return out({ success: false, message: 'Action tidak dikenal' });
  } catch (err) { return out({ success: false, message: err.message }); }
}

// ============================================================
// AUTENTIKASI (token di CacheService, berlaku 6 jam)
// ============================================================
function login(d) {
  const role = d.role === 'admin' ? 'admin' : 'murid', id = String(d.id || '').trim();
  const c = CacheService.getScriptCache(), fk = 'gagal_' + role + id.substring(0, 40);
  if (Number(c.get(fk) || 0) >= 5) throw new Error('Terlalu banyak percobaan. Coba lagi 10 menit lagi.');
  const r = cariBaris(role === 'admin' ? 'Admin' : 'Murid', id);
  if (!r || r.sandi_hash !== hash(String(d.sandi || '')) || (role === 'murid' && r.aktif === 'N')) {
    c.put(fk, String(Number(c.get(fk) || 0) + 1), 600);
    throw new Error('ID atau kata sandi salah.');
  }
  c.remove(fk);
  const token = Utilities.getUuid(), user = { role: role, id: id, nama: r.nama, kelas: r.kelas || '' };
  c.put('tok_' + token, JSON.stringify(user), 21600);
  return { success: true, data: { token: token, user: user } };
}
function auth(t) {
  const v = CacheService.getScriptCache().get('tok_' + t);
  if (!v) throw new Error('SESI_HABIS');
  return JSON.parse(v);
}
function hash(s) {
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + s));
}

// ============================================================
// FITUR MURID
// ============================================================
function home(u) {
  const n = sekarang();
  return { success: true, data: { absen: cariBaris('Absensi', n.tgl + '_' + u.id), cfg: publicConfig() } };
}

function absen(u, d) {
  const p = pengaturan(), n = sekarang(), jenis = d.jenis === 'pulang' ? 'pulang' : 'masuk';
  if (libur(n)) throw new Error('Hari ini bukan hari sekolah / libur (atur di menu Pengaturan).');
  const lat = Number(d.lat), lng = Number(d.lng);
  if (isNaN(lat) || isNaN(lng)) throw new Error('Lokasi tidak terbaca. Aktifkan GPS.');
  const jarak = Math.round(haversine(lat, lng, Number(p.LAT), Number(p.LNG)));
  if (jarak > Number(p.RADIUS)) throw new Error('Anda ' + jarak + ' m dari sekolah (maks ' + p.RADIUS + ' m).');
  let status = 'Hadir';
  const ada = cariBaris('Absensi', n.tgl + '_' + u.id);
  if (jenis === 'masuk') {
    if (ada) throw new Error('Anda sudah tercatat hari ini.');
    if (n.jam < p.MASUK_MULAI) throw new Error('Absen masuk dibuka pukul ' + p.MASUK_MULAI + ' WITA.');
    if (n.jam > p.TERLAMBAT_BATAS) throw new Error('Waktu absen masuk sudah lewat. Hubungi guru.');
    if (n.jam > p.MASUK_BATAS) status = 'Terlambat';
  } else {
    if (!ada || !ada.jam_masuk) throw new Error('Belum absen masuk hari ini.');
    if (ada.jam_pulang) throw new Error('Anda sudah absen pulang.');
    if (n.jam < p.PULANG_MULAI || n.jam > p.PULANG_AKHIR) throw new Error('Absen pulang pukul ' + p.PULANG_MULAI + '–' + p.PULANG_AKHIR + ' WITA.');
    status = ada.status;
  }
  const foto = simpanFile(d.foto, 'image/jpeg', u.id + '_' + n.tgl + '_' + jenis + '.jpg'); // di luar lock agar cepat
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const cur = cariBaris('Absensi', n.tgl + '_' + u.id), s = sh('Absensi');
    if (jenis === 'masuk') {
      if (cur) throw new Error('Anda sudah tercatat hari ini.');
      s.appendRow([n.tgl + '_' + u.id, n.tgl, u.id, u.nama, u.kelas, n.jam, lat, lng, jarak, foto, '', '', '', '', '', status, '', '']);
    } else {
      if (!cur || cur.jam_pulang) throw new Error('Absen pulang sudah tercatat.');
      s.getRange(cur._row, 11, 1, 5).setValues([[n.jam, lat, lng, jarak, foto]]);
    }
  } finally { lock.releaseLock(); }
  kirimEmail(u.id, 'Tanda terima absen ' + jenis + ' — ' + u.nama,
    u.nama + ' (' + u.kelas + ') absen ' + jenis + ' pukul ' + n.jam + ' WITA, status: ' + status + '.');
  return { success: true, message: 'Absen ' + jenis + ' berhasil pukul ' + n.jam + ' WITA' + (status === 'Terlambat' ? ' (Terlambat)' : '') + '.' };
}

function ajukanIzin(u, d) {
  if (['Izin', 'Sakit'].indexOf(d.jenis) < 0) throw new Error('Jenis harus Izin atau Sakit.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal || '')) throw new Error('Tanggal tidak valid.');
  if (!String(d.alasan || '').trim()) throw new Error('Alasan wajib diisi.');
  let link = '';
  if (d.berkas && d.berkas.b64) link = simpanFile(d.berkas.b64, d.berkas.mime || 'application/octet-stream', u.id + '_' + d.tanggal + '_' + (d.berkas.nama || 'surat'));
  sh('Izin').appendRow(['IZ' + Date.now(), sekarang().tgl, d.tanggal, u.id, u.nama, u.kelas, d.jenis, String(d.alasan).trim(), link, 'Menunggu', '', '']);
  return { success: true, message: 'Pengajuan terkirim. Menunggu persetujuan guru.' };
}

function riwayat(u, d) {
  const bln = /^\d{4}-\d{2}$/.test(d.bulan || '') ? d.bulan : sekarang().tgl.slice(0, 7);
  const absen = barisTgl(bln).filter(function (r) { return r.nis === u.id; }).map(function (r) {
    return { tanggal: r.tanggal, jam_masuk: r.jam_masuk, jam_pulang: r.jam_pulang, status: r.status, keterangan: r.keterangan };
  });
  const izin = baris('Izin').filter(function (r) { return r.nis === u.id; }).slice(-15).reverse();
  return { success: true, data: { absen: absen, izin: izin } };
}

// ============================================================
// FITUR ADMIN
// ============================================================
function adminRekap(u, d) {
  const tgl = /^\d{4}-\d{2}-\d{2}$/.test(d.tanggal || '') ? d.tanggal : sekarang().tgl, peta = {};
  barisTgl(tgl).forEach(function (r) { if (r.tanggal === tgl) peta[r.nis] = r; });
  const ringkasan = {};
  const list = baris('Murid').filter(function (m) { return m.aktif !== 'N'; }).map(function (m) {
    const a = peta[m.nis] || {}, x = { nis: m.nis, nama: m.nama, kelas: m.kelas, jam_masuk: a.jam_masuk || '', jam_pulang: a.jam_pulang || '',
      status: a.status || 'Belum', foto_masuk: a.foto_masuk || '', foto_pulang: a.foto_pulang || '' };
    const k = ringkasan[m.kelas] = ringkasan[m.kelas] || { total: 0 };
    k.total++; k[x.status] = (k[x.status] || 0) + 1;
    return x;
  });
  return { success: true, data: { tanggal: tgl, list: list, ringkasan: ringkasan } };
}

function adminUbahStatus(u, d) {
  if (STATUS_OK.indexOf(d.status) < 0) throw new Error('Status tidak valid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal || '')) throw new Error('Tanggal tidak valid.');
  const m = cariBaris('Murid', d.nis);
  if (!m) throw new Error('Murid tidak ditemukan.');
  setStatus(d.tanggal, m, d.status, String(d.keterangan || 'Diubah admin'), u.nama);
  catat(u.nama, 'ubah_status', d.nis + ' ' + d.tanggal + ' -> ' + d.status);
  return { success: true, message: 'Status diperbarui.' };
}

function adminIzinList() {
  return { success: true, data: baris('Izin').slice(-100).reverse() };
}

function adminKeputusan(u, d) {
  if (['Disetujui', 'Ditolak'].indexOf(d.keputusan) < 0) throw new Error('Keputusan tidak valid.');
  const z = cariBaris('Izin', d.id);
  if (!z) throw new Error('Pengajuan tidak ditemukan.');
  if (z.status !== 'Menunggu') throw new Error('Pengajuan sudah diproses.');
  sh('Izin').getRange(z._row, 10, 1, 3).setValues([[d.keputusan, u.nama, String(d.catatan || '')]]);
  if (d.keputusan === 'Disetujui') {
    setStatus(z.tgl_izin, cariBaris('Murid', z.nis) || { nis: z.nis, nama: z.nama, kelas: z.kelas }, z.jenis, z.alasan, u.nama);
  }
  kirimEmail(z.nis, 'Pengajuan ' + z.jenis + ' ' + d.keputusan, 'Pengajuan ' + z.jenis + ' ' + z.nama + ' tanggal ' + z.tgl_izin + ' ' + d.keputusan.toLowerCase() + '. ' + (d.catatan || ''));
  catat(u.nama, 'keputusan_izin', z.id + ' ' + d.keputusan);
  return { success: true, message: 'Pengajuan ' + d.keputusan.toLowerCase() + '.' };
}

// ============================================================
// ADMIN — PENGATURAN & IMPOR MURID
// ============================================================
const KUNCI_SET = ['NAMA_SEKOLAH', 'LAT', 'LNG', 'RADIUS', 'MASUK_MULAI', 'MASUK_BATAS', 'TERLAMBAT_BATAS', 'PULANG_MULAI', 'PULANG_AKHIR', 'HARI_LIBUR', 'HARI_AKTIF'];

function adminSetGet() {
  CacheService.getScriptCache().remove('pengaturan');
  const p = pengaturan(), o = {};
  KUNCI_SET.forEach(function (k) { o[k] = p[k] || ''; });
  return { success: true, data: o };
}

function adminSetSimpan(u, d) {
  const v = {};
  KUNCI_SET.forEach(function (k) { if (d[k] !== undefined) v[k] = String(d[k]).trim(); });
  if ('NAMA_SEKOLAH' in v && !v.NAMA_SEKOLAH) throw new Error('Nama sekolah wajib diisi.');
  ['MASUK_MULAI', 'MASUK_BATAS', 'TERLAMBAT_BATAS', 'PULANG_MULAI', 'PULANG_AKHIR'].forEach(function (k) {
    if (k in v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v[k])) throw new Error('Format jam ' + k + ' harus HH:mm (contoh 07:30).');
  });
  ['LAT', 'LNG'].forEach(function (k) { if (k in v && (v[k] === '' || isNaN(Number(v[k])))) throw new Error(k + ' harus berupa angka.'); });
  if ('HARI_AKTIF' in v && !/^[1-7](,[1-7])*$/.test(v.HARI_AKTIF)) throw new Error('Pilih minimal satu hari sekolah.');
  if ('RADIUS' in v) { const r = Number(v.RADIUS); if (!(r >= 10 && r <= 500)) throw new Error('Radius harus 10–500 meter.'); }
  const m = Object.assign({}, pengaturan(), v);
  if (!(m.MASUK_MULAI < m.MASUK_BATAS && m.MASUK_BATAS <= m.TERLAMBAT_BATAS)) throw new Error('Urutan jam masuk: dibuka < batas tepat waktu ≤ batas terlambat.');
  if (!(m.PULANG_MULAI < m.PULANG_AKHIR)) throw new Error('Jam pulang dibuka harus sebelum jam ditutup.');
  const s = sh('Pengaturan');
  Object.keys(v).forEach(function (k) {
    const r = cariBaris('Pengaturan', k);
    const baris = r ? r._row : s.getLastRow() + 1;
    s.getRange(baris, 1, 1, 2).setNumberFormat('@').setValues([[k, v[k]]]); // paksa teks agar jam tidak diubah jadi Date
  });
  CacheService.getScriptCache().remove('pengaturan');
  catat(u.nama, 'ubah_pengaturan', Object.keys(v).join(','));
  return { success: true, message: 'Pengaturan disimpan.' };
}

function adminImpor(u, d) { // tambah murid dari Excel (dikirim per 100 baris oleh frontend)
  const rows = d.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw new Error('Data tidak valid (maks 200 baris per kiriman).');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const s = sh('Murid'), last = s.getLastRow(), ada = {}, baru = [], galat = [];
    let lewat = 0;
    if (last > 1) s.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { ada[String(r[0]).trim()] = 1; });
    rows.forEach(function (r) {
      const nis = String(r.nis || '').trim(), nama = String(r.nama || '').trim(), kelas = String(r.kelas || '').trim();
      const email = String(r.email || '').trim(), sandi = String(r.sandi || '').trim() || nis;
      if (!nis || !nama || !kelas) { galat.push('Baris ' + r.baris + ': NIS, nama, dan kelas wajib diisi.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { galat.push('Baris ' + r.baris + ' (' + nis + '): email orang tua tidak valid.'); return; }
      if (ada[nis]) { lewat++; return; }
      ada[nis] = 1;
      baru.push([nis, nama, kelas, hash(sandi), email, 'Y']);
    });
    if (baru.length) tambahBaris('Murid', baru);
    catat(u.nama, 'impor_murid', baru.length + ' ditambah, ' + lewat + ' dilewati, ' + galat.length + ' galat');
    return { success: true, data: { ditambah: baru.length, dilewati: lewat, galat: galat } };
  } finally { lock.releaseLock(); }
}

function tambahBaris(n, data) { // tulis banyak baris sekaligus; perluas sheet bila kurang & paksa format teks
  const s = sh(n), awal = s.getLastRow() + 1, kurang = awal + data.length - 1 - s.getMaxRows();
  if (kurang > 0) s.insertRowsAfter(s.getMaxRows(), kurang);
  const r = s.getRange(awal, 1, data.length, data[0].length);
  r.setNumberFormat('@');
  r.setValues(data);
}

// ============================================================
// TRIGGER HARIAN — tandai Alpa setelah batas terlambat
// ============================================================
function tandaiAlpa() {
  const n = sekarang(), p = pengaturan();
  if (libur(n) || n.jam < p.TERLAMBAT_BATAS) return;
  const ada = {};
  barisTgl(n.tgl).forEach(function (r) { if (r.tanggal === n.tgl) ada[r.nis] = 1; });
  const baru = baris('Murid').filter(function (m) { return m.aktif !== 'N' && !ada[m.nis]; }).map(function (m) {
    return [n.tgl + '_' + m.nis, n.tgl, m.nis, m.nama, m.kelas].concat(new Array(10).fill(''), ['Alpa', 'Otomatis', 'sistem']);
  });
  if (baru.length) tambahBaris('Absensi', baru);
}

// ============================================================
// UTILITAS
// ============================================================
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sh(n) { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(n); }
function sekarang() {
  const d = new Date();
  return { tgl: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), jam: Utilities.formatDate(d, TZ, 'HH:mm'), jamDetik: Utilities.formatDate(d, TZ, 'HH:mm:ss') };
}
function libur(n) { // libur = bukan hari sekolah (HARI_AKTIF, 1=Senin..7=Minggu) atau tanggal ada di HARI_LIBUR
  const p = pengaturan(), hari = Utilities.formatDate(new Date(), TZ, 'u');
  const aktif = String(p.HARI_AKTIF).split(',').map(function (x) { return x.trim(); });
  const khusus = String(p.HARI_LIBUR || '').split(',').map(function (x) { return x.trim(); });
  return aktif.indexOf(hari) < 0 || khusus.indexOf(n.tgl) >= 0;
}
function pengaturan() {
  const c = CacheService.getScriptCache(), v = c.get('pengaturan');
  if (v) return JSON.parse(v);
  const tz = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSpreadsheetTimeZone(), o = {};
  sh('Pengaturan').getDataRange().getValues().slice(1).forEach(function (r) {
    const k = String(r[0]), isJam = /_(MULAI|BATAS|AKHIR)$/.test(k);
    let x = r[1];
    if (x instanceof Date) x = Utilities.formatDate(x, tz, isJam ? 'HH:mm' : 'yyyy-MM-dd'); // Sheets mengubah "06:30" jadi Date
    else {
      x = String(x).trim();
      const m = isJam && x.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]m)?/i);
      if (m) { let h = Number(m[1]); if (m[3]) { if (/p/i.test(m[3]) && h < 12) h += 12; if (/a/i.test(m[3]) && h === 12) h = 0; } x = ('0' + h).slice(-2) + ':' + m[2]; }
    }
    o[k] = x;
  });
  if (!o.HARI_AKTIF) o.HARI_AKTIF = '1,2,3,4,5,6'; // default Senin–Sabtu
  c.put('pengaturan', JSON.stringify(o), 60);
  return o;
}
function publicConfig() {
  const p = pengaturan();
  return { nama_sekolah: p.NAMA_SEKOLAH, radius: p.RADIUS, masuk_mulai: p.MASUK_MULAI, masuk_batas: p.MASUK_BATAS,
    terlambat_batas: p.TERLAMBAT_BATAS, pulang_mulai: p.PULANG_MULAI, pulang_akhir: p.PULANG_AKHIR, server_ms: Date.now() };
}
function objBaris(hd, v, row) { const o = row ? { _row: row } : {}; hd.forEach(function (k, i) { o[k] = String(v[i]); }); return o; }
function baris(n) {
  const s = sh(n), last = s.getLastRow();
  if (last < 2) return [];
  const w = s.getLastColumn(), hd = s.getRange(1, 1, 1, w).getValues()[0];
  return s.getRange(2, 1, last - 1, w).getValues().map(function (v) { return objBaris(hd, v); });
}
function cariBaris(n, kunci) { // cari baris dengan kolom A = kunci (cepat via TextFinder)
  const s = sh(n), f = s.getRange('A:A').createTextFinder(String(kunci)).matchEntireCell(true).findNext();
  if (!f) return null;
  const hd = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  return objBaris(hd, s.getRange(f.getRow(), 1, 1, hd.length).getValues()[0], f.getRow());
}
function barisTgl(prefix) { // baca blok baris Absensi yang tanggalnya diawali prefix (yyyy-MM atau yyyy-MM-dd)
  const s = sh('Absensi'), f = s.getRange('B:B').createTextFinder(prefix).findAll();
  if (!f.length) return [];
  const r = f.map(function (x) { return x.getRow(); }), a = Math.min.apply(null, r), b = Math.max.apply(null, r);
  return s.getRange(a, 1, b - a + 1, HEAD.Absensi.length).getValues().map(function (v) { return objBaris(HEAD.Absensi, v); })
    .filter(function (o) { return o.tanggal.indexOf(prefix) === 0; });
}
function setStatus(tgl, m, status, ket, oleh) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const cur = cariBaris('Absensi', tgl + '_' + m.nis);
    if (cur) sh('Absensi').getRange(cur._row, 16, 1, 3).setValues([[status, ket, oleh]]);
    else sh('Absensi').appendRow([tgl + '_' + m.nis, tgl, m.nis, m.nama, m.kelas].concat(new Array(10).fill(''), [status, ket, oleh]));
  } finally { lock.releaseLock(); }
}
function simpanFile(b64, mime, nama) {
  if (!b64) throw new Error('Berkas/foto wajib dilampirkan.');
  const raw = String(b64).split(',').pop();
  if (raw.length > 5500000) throw new Error('Ukuran berkas terlalu besar (maks ±4 MB).');
  return DriveApp.getFolderById(CONFIG.UPLOADS_FOLDER).createFile(Utilities.newBlob(Utilities.base64Decode(raw), mime, nama)).getUrl();
}
function kirimEmail(nis, subjek, isi) {
  try {
    const m = cariBaris('Murid', nis);
    if (m && m.email_ortu && MailApp.getRemainingDailyQuota() > 5) MailApp.sendEmail({ to: m.email_ortu, subject: subjek, body: isi, name: pengaturan().NAMA_SEKOLAH });
  } catch (e) { /* email gagal tidak boleh menggagalkan absen */ }
}
function catat(oleh, aksi, detail) { const n = sekarang(); sh('Log').appendRow([n.tgl + ' ' + n.jamDetik, oleh, aksi, detail]); }
function haversine(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dl = (c - a) * r, dg = (d - b) * r;
  const x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dg / 2) * Math.sin(dg / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ============================================================
// SETUP — jalankan SEKALI saat pertama install
// ============================================================
function setupAppEnvironment() {
  const APP_NAME = 'Absensi Digital Murid';
  Logger.log('🚀 Memulai setup ' + APP_NAME + '...');
  const root = DriveApp.createFolder('📁 ' + APP_NAME), up = root.createFolder('📂 Uploads'), ex = root.createFolder('📂 Exports');
  const ss = SpreadsheetApp.create('🗃️ Database — ' + APP_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(), ROOT_FOLDER_ID: root.getId(), UPLOADS_FOLDER: up.getId(), EXPORTS_FOLDER: ex.getId(), SALT: Utilities.getUuid()
  });

  const cfg = ss.getActiveSheet().setName('AppConfig');
  cfg.appendRow(['key', 'value', 'keterangan']);
  [['APP_NAME', APP_NAME, 'Nama aplikasi'], ['ROOT_FOLDER_ID', root.getId(), 'ID folder root'], ['UPLOADS_ID', up.getId(), 'ID folder uploads'],
   ['EXPORTS_ID', ex.getId(), 'ID folder exports'], ['SPREADSHEET_ID', ss.getId(), 'ID spreadsheet ini'], ['CREATED_AT', new Date().toISOString(), 'Tanggal setup']]
    .forEach(function (r) { cfg.appendRow(r); });
  cfg.setFrozenRows(1);
  cfg.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#ffffff');
  cfg.autoResizeColumns(1, 3);

  Object.keys(HEAD).forEach(function (n) {
    const s = ss.insertSheet(n);
    s.getRange(1, 1, s.getMaxRows(), HEAD[n].length).setNumberFormat('@'); // semua teks: jam/tanggal tidak diubah Sheets
    s.appendRow(HEAD[n]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, HEAD[n].length).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#ffffff');
  });
  const pg = ss.insertSheet('Pengaturan');
  pg.getRange('A:B').setNumberFormat('@');
  [['kunci', 'nilai'], ['NAMA_SEKOLAH', 'SMA Negeri 1 Prestasi'], ['LAT', '-8.6543'], ['LNG', '115.2134'], ['RADIUS', '50'],
   ['MASUK_MULAI', '06:30'], ['MASUK_BATAS', '07:30'], ['TERLAMBAT_BATAS', '08:30'], ['PULANG_MULAI', '13:15'], ['PULANG_AKHIR', '14:00'],
   ['HARI_LIBUR', ''], ['HARI_AKTIF', '1,2,3,4,5,6']].forEach(function (r) { pg.appendRow(r); });
  pg.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#ffffff');

  // Data contoh — ganti setelah login pertama berhasil
  ss.getSheetByName('Murid').appendRow(['20240001', 'Contoh Murid', 'X-1', hash('murid123'), 'ortu@example.com', 'Y']);
  ss.getSheetByName('Admin').appendRow(['admin', 'Administrator', hash('admin123'), 'admin@example.com']);

  Logger.log('✅ Setup selesai. Spreadsheet: ' + ss.getUrl());
  Logger.log('✅ Folder Drive: ' + root.getUrl());
  Logger.log('🔑 Login contoh -> Murid: 20240001 / murid123 | Admin: admin / admin123');
  Logger.log('➡️  Edit sheet "Pengaturan": isi LAT, LNG titik gerbang sekolah.');
}

// Jalankan SEKALI setelah setup: pasang trigger harian penanda Alpa (jam 09.xx WITA)
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tandaiAlpa') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tandaiAlpa').timeBased().everyDays(1).atHour(9).create();
  Logger.log('✅ Trigger tandaiAlpa terpasang.');
}

// Ketik kata sandi biasa di kolom sandi_hash (sheet Murid/Admin), lalu jalankan fungsi ini untuk mengubahnya jadi hash
function hashSandiMassal() {
  ['Murid', 'Admin'].forEach(function (n) {
    const s = sh(n), v = s.getDataRange().getValues(), c = v[0].indexOf('sandi_hash');
    for (let i = 1; i < v.length; i++) { const x = String(v[i][c]); if (x && x.length !== 44) s.getRange(i + 1, c + 1).setValue(hash(x)); }
  });
  Logger.log('✅ Selesai. Kata sandi biasa sudah di-hash.');
}

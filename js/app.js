if (!document.getElementById('snav')) { // index.html usang (belum sesuai versi app.js)
  document.body.insertAdjacentHTML('afterbegin', '<div style="padding:16px;background:#FEE2E2;color:#9F1239;font:600 14px Inter,sans-serif">⚠ File index.html di repo belum diperbarui. Salin index.html terbaru dari ZIP ke folder repo, lalu git add . → git commit → git push, dan buka dengan Ctrl+Shift+R.</div>');
  throw new Error('index.html usang');
}
// ============================================================
// Absensi Digital Murid — Frontend (vanilla JS, fetch ke GAS)
// ============================================================
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let S = JSON.parse(localStorage.getItem('sesi') || 'null'), off = 0, CFG = {}, stream = null, gps = null, watchId = null, jenis = 'masuk', REK = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = s => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const hariIni = () => new Date(Date.now() + off).toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' });

function toast(m, t) { const e = $('#toast'); e.textContent = m; e.className = 'show ' + (t || ''); clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', 3500); }

async function api(action, data, bg) {
  if (!bg) $('#loading').hidden = false;
  try {
    // WAJIB text/plain agar tidak memicu CORS preflight yang diblok GAS
    const r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S && S.token, data: data || {} }) });
    const j = await r.json();
    if (!j.success) {
      if (j.message === 'SESI_HABIS') { keluar(true); throw new Error('Sesi berakhir, silakan masuk lagi.'); }
      throw new Error(j.message);
    }
    return j;
  } catch (e) { toast(e.message === 'Failed to fetch' ? 'Tidak dapat terhubung ke server.' : e.message, 'err'); throw e; }
  finally { $('#loading').hidden = true; }
}

function tampil(v) { ['login', 'murid', 'admin'].forEach(x => $('#v-' + x).hidden = x !== v); $('#userbox').hidden = v === 'login'; document.body.classList.toggle('is-admin', v === 'admin'); }
function tick() {
  const t = new Date(Date.now() + off).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }).replace(/\./g, ':');
  $$('.jam').forEach(e => e.textContent = t);
  const a = $('#atime'); if (a) { a.textContent = new Date(Date.now() + off).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' }) + ' · ' + t + ' WITA'; renderHero(); }
}

// ---------- Login / sesi ----------
$('#l-role').onchange = e => $('#l-idlabel').textContent = e.target.value === 'admin' ? 'ID Admin' : 'NIS';
$('#f-login').onsubmit = async e => {
  e.preventDefault();
  const j = await api('login', { role: $('#l-role').value, id: $('#l-id').value, sandi: $('#l-sandi').value });
  S = j.data; localStorage.setItem('sesi', JSON.stringify(S)); $('#l-sandi').value = ''; mulai();
};
function keluar(diam) {
  if (!diam && S) api('logout', {}, true).catch(() => {});
  S = null; localStorage.removeItem('sesi'); stopKamera(); tampil('login');
}
$('#btn-logout').onclick = $('#a-logout').onclick = () => keluar();

function mulai() {
  $('#uname').textContent = S.user.nama;
  if (S.user.role === 'admin') { tampil('admin'); $('#au-nama').textContent = S.user.nama; $('#au-ava').textContent = ini(S.user.nama); $('#a-tgl').value = hariIni(); nav('dasbor'); }
  else { tampil('murid'); $('#m-nama').textContent = S.user.nama; $('#m-kelas').textContent = 'Kelas ' + S.user.kelas + ' · NIS ' + S.user.id; $('#z-tgl').value = hariIni(); $('#r-bulan').value = hariIni().slice(0, 7); muatBeranda(); }
}

// ---------- Tab ----------
document.addEventListener('click', e => {
  const b = e.target.closest('.tabs button'); if (!b) return;
  const g = b.parentElement.dataset.g;
  $$('.tabs[data-g="' + g + '"] button').forEach(x => x.classList.toggle('on', x === b));
  $$('.pane[data-g="' + g + '"]').forEach(p => p.hidden = p.id !== 't-' + b.dataset.t);
  if (b.dataset.t === 'riwayat') muatRiwayat();
});

// ---------- Murid ----------
async function muatBeranda() {
  const j = await api('home'); CFG = j.data.cfg; const a = j.data.absen;
  $('#st-hari').innerHTML = a ? badge(a.status) + `<small style="display:block;margin-top:4px;color:#C7D2FE">Masuk ${esc(a.jam_masuk || '–')} · Pulang ${esc(a.jam_pulang || '–')}</small>` : badge('Belum') + ' Belum absen';
  $('#win').textContent = CFG.masuk_mulai + ' – ' + CFG.masuk_batas + ' WITA';
  $('#rad').textContent = 'Radius valid: ' + CFG.radius + ' m dari sekolah · Pulang ' + CFG.pulang_mulai;
  $('#btn-masuk').disabled = !!a; $('#btn-pulang').disabled = !(a && a.jam_masuk && !a.jam_pulang);
}
async function muatRiwayat() {
  const j = await api('riwayat', { bulan: $('#r-bulan').value });
  $('#tb-riwayat').innerHTML = j.data.absen.map(r => `<tr><td>${esc(r.tanggal)}</td><td class="tn">${esc(r.jam_masuk || '–')}</td><td class="tn">${esc(r.jam_pulang || '–')}</td><td>${badge(r.status)}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada data.</td></tr>';
  $('#tb-izinsaya').innerHTML = j.data.izin.map(r => `<tr><td>${esc(r.tgl_izin)}</td><td>${esc(r.jenis)}</td><td>${badge(r.status)}</td><td>${esc(r.catatan)}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada pengajuan.</td></tr>';
}
$('#r-bulan').onchange = muatRiwayat;

$('#f-izin').onsubmit = async e => {
  e.preventDefault();
  const f = $('#z-file').files[0]; let berkas = null;
  if (f) {
    if (f.size > 3 * 1024 * 1024) return toast('Berkas lebih dari 3 MB.', 'err');
    berkas = await new Promise(res => { const r = new FileReader(); r.onload = () => res({ nama: f.name, mime: f.type, b64: r.result }); r.readAsDataURL(f); });
  }
  const j = await api('izin', { jenis: $('#z-jenis').value, tanggal: $('#z-tgl').value, alasan: $('#z-alasan').value, berkas });
  toast(j.message, 'ok'); e.target.reset(); $('#z-tgl').value = hariIni();
};

// ---------- Kamera + GPS ----------
async function bukaKamera(j) {
  jenis = j; gps = null; $('#cam-judul').textContent = 'Absen ' + (j === 'masuk' ? 'Masuk' : 'Pulang'); $('#cam-ok').disabled = true;
  $('#gps').textContent = 'Mencari lokasi…'; $('#modal').hidden = false;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false }); $('#cam').srcObject = stream; }
  catch (e) { toast('Kamera tidak bisa diakses. Izinkan akses kamera.', 'err'); return tutupKamera(); }
  watchId = navigator.geolocation.watchPosition(p => {
    gps = p.coords; $('#gps').textContent = '📍 Lokasi ditemukan (akurasi ±' + Math.round(p.coords.accuracy) + ' m)'; $('#cam-ok').disabled = false;
  }, () => { $('#gps').textContent = '⚠️ Lokasi tidak tersedia. Aktifkan GPS & izinkan lokasi.'; }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
function stopKamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; }
function tutupKamera() { stopKamera(); $('#modal').hidden = true; }
$('#btn-masuk').onclick = () => bukaKamera('masuk');
$('#btn-pulang').onclick = () => bukaKamera('pulang');
$('#cam-batal').onclick = tutupKamera;
$('#cam-ok').onclick = async () => {
  const v = $('#cam'), c = document.createElement('canvas'), w = 480; c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth) || 640;
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const foto = c.toDataURL('image/jpeg', 0.6), lat = gps.latitude, lng = gps.longitude;
  tutupKamera();
  try { const r = await api('absen', { jenis, lat, lng, foto }); toast(r.message, 'ok'); } catch (e) { /* toast sudah tampil */ }
  muatBeranda();
};

// ---------- Admin ----------
let DASH = null, IZ = [], TAB = 'semua', MAXLOG = 10;
const cnt = (L, k) => L.filter(x => x.status === k).length, fmt = t => String(t || '').replace(':', '.');
const mnt = t => { const [a, b] = String(t).split(':').map(Number); return a * 60 + b; };
const plus1 = t => { const m = mnt(t) + 1; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); };
const ini = n => String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const WARNA = ['#DBEAFE', '#D1FAE5', '#EDE9FE', '#FEF3C7', '#FFE4E6', '#CFFAFE'];
const ava = n => `<span class="ava" style="background:${WARNA[(String(n).charCodeAt(0) + String(n).length) % 6]}">${esc(ini(n))}</span>`;
const angkatan = k => (String(k).match(/^([IVXLC]+|\d+)(?![A-Za-z])/i) || [k])[0].toUpperCase();
const rom = s => { if (/^\d+$/.test(s)) return +s; const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let t = 0; s.split('').forEach((c, i, a) => t += (v[a[i + 1]] > v[c]) ? -v[c] : (v[c] || 0)); return t; };
const pending = () => IZ.filter(z => z.status === 'Menunggu');

async function nav(p) {
  if (p === 'cetak') { await nav('kehadiran'); return window.print(); }
  $$('#snav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  $$('.apage').forEach(x => x.hidden = x.id !== 'p-' + p);
  $('#crumb').textContent = { dasbor: 'Dasbor Harian', kehadiran: 'Data Kehadiran', izin: 'Persetujuan Izin', murid: 'Kelola Murid', setting: 'Pengaturan Sekolah' }[p];
  if (p === 'dasbor') await muatDasbor(); if (p === 'kehadiran') await muatKehadiran();
  if (p === 'izin') await muatIzinAdmin(); if (p === 'setting') await muatSetting();
}
$('#snav').onclick = e => { const b = e.target.closest('button'); if (b) nav(b.dataset.p); };
$('#bell').onclick = () => nav('izin');

async function muatDasbor(bg) {
  const [r, z] = await Promise.all([api('rekap', { tanggal: hariIni() }, bg), api('izinList', {}, bg)]);
  DASH = r.data; IZ = z.data; renderDasbor();
}
function renderHero() {
  if (!DASH || $('#v-admin').hidden) return;
  const c = DASH.cfg, jam = new Date(Date.now() + off).toLocaleTimeString('en-GB', { timeZone: 'Asia/Makassar', hour12: false }).slice(0, 5), bl = cnt(DASH.list, 'Belum');
  const w = `(${fmt(c.masuk_mulai)} – ${fmt(c.masuk_batas)} WITA)`; let f, j, k = 'red';
  if (jam < c.masuk_mulai) { f = 'Menunggu Jendela Absen'; k = 'amber'; j = `Jendela Absen Masuk Dibuka Pukul ${fmt(c.masuk_mulai)} WITA`; }
  else if (jam <= c.masuk_batas) { f = 'Jendela Absen Berjalan'; k = 'green'; j = `Jendela Absen Masuk Sedang Berjalan ${w}`; }
  else if (jam <= c.terlambat_batas) { f = 'Fase Toleransi Terlambat'; j = `Jendela Absen Masuk Berakhir ${w} · Sedang Berjalan Toleransi (s/d ${fmt(c.terlambat_batas)} WITA)`; }
  else { f = 'Absen Masuk Ditutup'; j = `Absen Masuk Ditutup · Batas Terlambat ${fmt(c.terlambat_batas)} WITA Terlewati`; }
  $('#fase').textContent = '⚠ ' + f; $('#fase').className = 'chip ' + k; $('#hero-judul').textContent = j;
  $('#hero-warn').innerHTML = jam <= c.terlambat_batas ? `Auto-Trigger Status Alpa dieksekusi otomatis setelah pukul <b>${fmt(c.terlambat_batas)} WITA</b> bagi <b>${bl} murid</b> tanpa konfirmasi surat/kehadiran.` : `Status Alpa sudah diterapkan otomatis bagi murid tanpa konfirmasi surat/kehadiran.`;
}
function renderDasbor() {
  const L = DASH.list, T = L.length || 1, c = DASH.cfg, p = n => (n / T * 100).toFixed(1) + '%', R = Number(c.radius);
  const h = cnt(L, 'Hadir'), t = cnt(L, 'Terlambat'), iz = cnt(L, 'Izin'), sk = cnt(L, 'Sakit'), al = cnt(L, 'Alpa'), bl = cnt(L, 'Belum'), pend = pending().length;
  renderHero();
  $('#a-rad').textContent = `● Radius Sekolah: ${R}m Aktif`; $('#g-kuota').textContent = '✉ Kuota Email: ' + DASH.kuota + ' tersisa';
  $('#nb-izin').hidden = !pend; $('#nb-izin').textContent = pend; $('#bell-dot').hidden = !pend;
  const d = DASH.kemarin == null ? null : (h / T * 100 - DASH.kemarin).toFixed(1);
  const kpi = (j, a, u, ik, k, ft, pl) => `<div class="kpi"><div class="kt"><div><small>${j}</small><div class="kn"><b>${a}</b> <span>${u}</span></div></div><span class="ki ${k}">${ik}</span></div><div class="kf"><span>${ft}</span><i class="pill ${k}">${pl}</i></div></div>`;
  $('#kpis').innerHTML = kpi('PRESENSI TEPAT WAKTU', h, '/ ' + L.length + ' Murid', '✔', 'g', d == null ? 'Belum ada data kemarin' : (d >= 0 ? '↗ +' : '↘ ') + d + '% vs kemarin', p(h))
    + kpi('TERLAMBAT MASUK', t, 'Murid', '⏳', 'b', `Absen rentang ${fmt(plus1(c.masuk_batas))} – ${fmt(c.terlambat_batas)}`, p(t))
    + kpi('IZIN / SAKIT TERDAFTAR', iz + sk, 'Berkas', '🩺', 'v', `${iz} Izin · ${sk} Sakit (${pend} review)`, p(iz + sk))
    + kpi(`POTENSI ALPA (${fmt(c.terlambat_batas)} WITA)`, bl + al, 'Belum Hadir', '🚫', 'r', `<a href="#" data-lihat="Belum">Lihat ${bl + al} Murid →</a>`, p(bl + al));
  // angkatan
  const g = {}; L.forEach(x => { const k = angkatan(x.kelas), o = g[k] = g[k] || { n: 0, Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Alpa: 0 }; o.n++; if (o[x.status] !== undefined) o[x.status]++; });
  const ks = Object.keys(g).sort((a, b) => (rom(a) || 0) - (rom(b) || 0) || a.localeCompare(b));
  $('#c-ang').innerHTML = `<div class="ch"><div><h2>Tingkat Kehadiran Angkatan & Kelas</h2><small>Analisis komparatif sebaran real-time seluruh rombongan belajar</small></div>
    <div class="lg"><span><i style="background:#047857"></i>Hadir</span><span><i style="background:#7C3AED"></i>Telat</span><span><i style="background:#C4B5FD"></i>Izin</span><span><i style="background:#DC2626"></i>Alpa</span></div></div>`
    + (ks.map(k => { const o = g[k], w = n => (n / o.n * 100).toFixed(2); return `<div class="ang"><div class="ah"><span><b>Kelas ${esc(k)}</b> <small>(${o.Hadir} Hadir / ${o.n} Murid)</small></span><b>${(o.Hadir / o.n * 100).toFixed(1)}%</b></div><div class="sb"><i style="width:${w(o.Hadir)}%;background:#047857"></i><i style="width:${w(o.Terlambat)}%;background:#7C3AED"></i><i style="width:${w(o.Izin + o.Sakit)}%;background:#C4B5FD"></i><i style="width:${w(o.Alpa)}%;background:#DC2626"></i></div></div>`; }).join('') || '<p class="muted">Belum ada data murid.</p>')
    + `<div class="dist"><small>DISTRIBUSI PER KELAS RINCI</small><div class="kcs">${Object.keys(DASH.ringkasan).sort().map(k => { const r = DASH.ringkasan[k], pr = (r.Hadir || 0) + (r.Terlambat || 0), q = pr / r.total; return `<span class="kc ${q >= .95 ? 'g' : q >= .85 ? 'b' : 'r'}">${esc(k)} <b>${pr}/${r.total}</b></span>`; }).join('')}</div></div>`;
  // geofence
  const M = L.filter(x => x.jam_masuk), J = M.map(x => Number(x.jarak_masuk)).filter(x => !isNaN(x) && x !== ''), dalam = J.filter(x => x <= R).length;
  const avg = J.length ? (J.reduce((a, b) => a + b, 0) / J.length).toFixed(1) : '–', mx = J.length ? Math.max.apply(null, J) : '–';
  $('#c-geo').innerHTML = `<div class="ch"><div><h2>Geofence GPS & Keamanan</h2><small>Validasi koordinat radius ${R} meter</small></div><span class="chip green">● Aktif</span></div>
    <div class="map"><span class="rb">◉ Radius R${R}m</span><div class="c1"><div class="c2"><i></i></div></div><div class="lb"><b>Gerbang ${esc(c.nama_sekolah)}</b>${esc(DASH.geo.lat)}, ${esc(DASH.geo.lng)}</div></div>
    <div class="gr t1"><span>🛡 Validitas GPS Berada Dalam Radius</span><b class="gg">${J.length ? Math.round(dalam / J.length * 100) : 100}% (${dalam})</b></div>
    <div class="gr t2"><span>📏 Rata-rata Jarak GPS Murid dari Gerbang</span><b>${avg} meter</b></div>
    <div class="gr t2"><span>📍 Jarak Terjauh Hari Ini</span><b>${mx} meter</b></div>
    <div class="gr t3"><span>☁ Penyimpanan Google Drive</span><b class="bb">${M.filter(x => x.foto_masuk).length} Foto Tersimpan</b></div>`;
  renderLog(); renderIzinCard();
}
function renderLog() {
  if (!DASH) return;
  const c = DASH.cfg, R = c.radius, q = ($('#a-cari').value || '').toLowerCase();
  let L = DASH.list.filter(x => x.jam_masuk).sort((a, b) => b.jam_masuk.localeCompare(a.jam_masuk));
  const n = { semua: L.length, tepat: cnt(L, 'Hadir'), telat: cnt(L, 'Terlambat') };
  if (TAB === 'tepat') L = L.filter(x => x.status === 'Hadir'); if (TAB === 'telat') L = L.filter(x => x.status === 'Terlambat');
  if (q) L = L.filter(x => (x.nama + x.nis).toLowerCase().includes(q));
  const tb = (k, l) => `<button data-tab="${k}" class="${TAB === k ? 'on' : ''}">${l} (${n[k]})</button>`;
  $('#c-log').innerHTML = `<div class="ch"><div><h2><span style="color:#059669">●</span> Live Log Presensi Masuk Hari Ini</h2><small>Diperbarui otomatis tiap 1 menit dari Google Sheets</small></div></div>
    <div class="tabs2">${tb('semua', 'Semua')}${tb('tepat', 'Tepat Waktu')}${tb('telat', 'Terlambat')}</div>
    <div class="scroll"><table class="lt"><thead><tr><th>MURID</th><th>JAM MASUK (WITA)</th><th>LOKASI & GPS</th><th>SELFIE</th><th>STATUS</th></tr></thead><tbody>${L.slice(0, MAXLOG).map(x => `<tr>
      <td class="mu">${ava(x.nama)}<div><b>${esc(x.nama)}</b><small>NIS: ${esc(x.nis)} · ${esc(x.kelas)}</small></div></td>
      <td class="tn"><b>${esc(x.jam_masuk)}</b><small class="${x.status === 'Terlambat' ? 'tl' : 'tp'}">${x.status === 'Terlambat' ? '+' + (mnt(x.jam_masuk) - mnt(c.masuk_batas)) + ' mnt lewat batas' : 'Tepat Waktu'}</small></td>
      <td><small>📍 <b>${esc(x.jarak_masuk || '–')} m dari Gerbang</b></small><small>Tervalidasi R${esc(R)}m</small></td>
      <td>${x.foto_masuk ? `<a class="vm" href="${esc(x.foto_masuk)}" target="_blank" rel="noopener">📷 Lihat Foto</a>` : '–'}</td><td>${badge(x.status)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada presensi masuk.</td></tr>'}</tbody></table></div>
    <div class="lf"><span>Menampilkan ${Math.min(MAXLOG, L.length)} dari ${L.length} rekaman data log</span><span><button class="lk" id="lg-max">Tampilkan ${MAXLOG === 10 ? 50 : 10} Baris</button><a class="lk2" href="${esc(DASH.sheet_url)}" target="_blank" rel="noopener">Buka Database Lengkap</a></span></div>`;
}
function renderIzinCard() {
  const P = pending();
  $('#c-izin').innerHTML = `<div class="ch"><div><h2>Persetujuan Izin</h2><small>${P.length} permohonan butuh verifikasi guru</small></div><span class="chip red">${P.length} Tertunda</span></div>`
    + (P.slice(0, 3).map(z => `<div class="zi"><div class="zh"><div><b>${esc(z.nama)}</b><small>Kelas ${esc(z.kelas)} · NIS ${esc(z.nis)}</small></div><span class="zc">${esc(z.jenis)} · ${esc(z.tgl_izin)}</span></div>
      <div class="zq">"${esc(z.alasan)}"</div><div class="za"><span>${z.link_berkas ? `📎 <a href="${esc(z.link_berkas)}" target="_blank" rel="noopener">Lampiran</a>` : 'Tanpa lampiran'}</span>
      <span><button class="zx" data-k="Ditolak" data-id="${esc(z.id)}" title="Tolak">✕</button><button class="zs" data-k="Disetujui" data-id="${esc(z.id)}">✔ Setujui</button></span></div></div>`).join('') || '<p class="muted">Tidak ada pengajuan tertunda.</p>')
    + `<a class="zall" href="#" data-izin-all>Buka Semua Pengajuan Izin (${P.length})</a>`;
}
// interaksi dasbor
$('#c-log').onclick = e => {
  const t = e.target.closest('[data-tab]'); if (t) { TAB = t.dataset.tab; return renderLog(); }
  if (e.target.id === 'lg-max') { MAXLOG = MAXLOG === 10 ? 50 : 10; renderLog(); }
};
$('#a-cari').oninput = renderLog;
$('#kpis').onclick = e => { const a = e.target.closest('[data-lihat]'); if (!a) return; e.preventDefault(); $('#f-status').value = a.dataset.lihat; nav('kehadiran'); };
$('#c-izin').onclick = e => { if (e.target.closest('[data-izin-all]')) { e.preventDefault(); return nav('izin'); } izinAksi(e, muatDasbor); };
$('#b-sync').onclick = async () => { await muatDasbor(); toast('Data disinkronkan dari Google Sheets.', 'ok'); };
$('#b-cetak').onclick = () => window.print();
$('#b-notif').onclick = async () => {
  const n = DASH ? DASH.list.filter(x => x.status === 'Belum' || x.status === 'Alpa').length : 0;
  if (!n) return toast('Semua murid sudah tercatat.', 'ok');
  if (!confirm(`Kirim email pengingat ke wali dari ${n} murid yang belum tercatat hadir?`)) return;
  const j = await api('notifWali'); toast(j.message, 'ok');
};
setInterval(() => { if (S && S.user.role === 'admin' && !$('#p-dasbor').hidden && !document.hidden) muatDasbor(true).catch(() => {}); }, 60000);

// Data Kehadiran
async function muatKehadiran() {
  const j = await api('rekap', { tanggal: $('#a-tgl').value || hariIni() }); REK = j.data;
  const ks = Object.keys(REK.ringkasan).sort(), cur = $('#f-kelas').value;
  $('#f-kelas').innerHTML = '<option value="">Semua kelas</option>' + ks.map(k => `<option ${k === cur ? 'selected' : ''}>${esc(k)}</option>`).join('');
  renderRekap();
}
function renderRekap() {
  if (!REK) return;
  const kls = $('#f-kelas').value, st = $('#f-status').value, q = $('#f-cari').value.toLowerCase();
  const L = REK.list.filter(x => (!kls || x.kelas === kls) && (!st || x.status === st) && (!q || (x.nama + x.nis).toLowerCase().includes(q)));
  $('#tb-rekap').innerHTML = L.map(x => `<tr><td>${esc(x.nama)}<small>${esc(x.nis)}</small></td><td>${esc(x.kelas)}</td><td class="tn">${esc(x.jam_masuk || '–')}</td><td class="tn">${esc(x.jam_pulang || '–')}</td>
    <td>${x.foto_masuk ? `<a href="${esc(x.foto_masuk)}" target="_blank" rel="noopener">Foto</a>` : '–'}</td>
    <td><select class="st ${esc(x.status)}" data-nis="${esc(x.nis)}">${['Belum', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa'].map(k => `<option ${k === 'Belum' ? 'disabled' : ''} ${k === x.status ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data.</td></tr>';
}
$('#a-tgl').onchange = muatKehadiran; $('#f-kelas').onchange = $('#f-status').onchange = renderRekap; $('#f-cari').oninput = renderRekap;
$('#tb-rekap').onchange = async e => {
  const s = e.target.closest('select'); if (!s) return;
  try { await api('ubahStatus', { nis: s.dataset.nis, tanggal: REK.tanggal, status: s.value }); toast('Status diperbarui.', 'ok'); } catch (x) { /* toast tampil */ }
  muatKehadiran();
};

// Persetujuan Izin (halaman penuh)
async function muatIzinAdmin() {
  const j = await api('izinList'); IZ = j.data; const P = pending().length;
  $('#nb-izin').hidden = !P; $('#nb-izin').textContent = P; $('#bell-dot').hidden = !P;
  $('#izin-list').innerHTML = IZ.map(z => `<div class="izin-item"><b>${esc(z.nama)}</b> · ${esc(z.kelas)} · ${badge(z.jenis)} ${badge(z.status)}
    <p>📅 ${esc(z.tgl_izin)} — ${esc(z.alasan)}${z.link_berkas ? ` · <a href="${esc(z.link_berkas)}" target="_blank" rel="noopener">Lihat berkas</a>` : ''}</p>
    ${z.status === 'Menunggu' ? `<input placeholder="Catatan (opsional)" data-c="${esc(z.id)}"><button class="btn primary sm" data-k="Disetujui" data-id="${esc(z.id)}">Setujui</button> <button class="btn ghost sm" data-k="Ditolak" data-id="${esc(z.id)}">Tolak</button>` : `<small class="muted">Diproses: ${esc(z.diproses_oleh)} ${esc(z.catatan)}</small>`}</div>`).join('') || '<div class="card">Belum ada pengajuan.</div>';
}
async function izinAksi(e, reload) {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  if (b.dataset.k === 'Ditolak' && !b.closest('#izin-list') && !confirm('Tolak pengajuan ini?')) return;
  const c = document.querySelector('[data-c="' + b.dataset.id + '"]');
  const j = await api('keputusan', { id: b.dataset.id, keputusan: b.dataset.k, catatan: c ? c.value : '' });
  toast(j.message, 'ok'); reload();
}
$('#izin-list').onclick = e => izinAksi(e, muatIzinAdmin);

// ---------- Pengaturan ----------
const SET = [['NAMA_SEKOLAH', 'Nama sekolah', 'text'], ['LAT', 'Latitude gerbang sekolah', 'text'], ['LNG', 'Longitude gerbang sekolah', 'text'],
  ['RADIUS', 'Radius absen (meter, 10–500)', 'number'], ['MASUK_MULAI', 'Absen masuk dibuka', 'time'], ['MASUK_BATAS', 'Batas tepat waktu (setelahnya Terlambat)', 'time'],
  ['TERLAMBAT_BATAS', 'Batas terlambat (setelahnya Alpa)', 'time'], ['PULANG_MULAI', 'Absen pulang dibuka', 'time'], ['PULANG_AKHIR', 'Absen pulang ditutup', 'time'],
  ['HARI_LIBUR', 'Hari libur (yyyy-mm-dd, pisahkan dengan koma)', 'text']];
async function muatSetting() {
  const j = await api('setGet');
  $('#set-form').innerHTML = '<h2>Pengaturan Sekolah & Absensi</h2>' + SET.map(f => `<label>${f[1]}<input id="s-${f[0]}" type="${f[2]}" value="${esc(j.data[f[0]])}" ${f[2] === 'number' ? 'min="10" max="500"' : ''}></label>`).join('')
    + '<fieldset class="hari"><legend>Hari sekolah</legend>' + ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((h, i) => `<label><input type="checkbox" class="hr" value="${i + 1}" ${(j.data.HARI_AKTIF || '1,2,3,4,5,6').split(',').includes(String(i + 1)) ? 'checked' : ''}> ${h}</label>`).join('') + '</fieldset>'
    + '<div class="actions"><button type="button" class="btn ghost" id="s-gps">📍 Pakai lokasi saya</button><button class="btn primary" type="submit">Simpan Pengaturan</button></div>';
}
$('#set-form').onsubmit = async e => {
  e.preventDefault(); const d = {}; SET.forEach(f => d[f[0]] = $('#s-' + f[0]).value);
  d.HARI_AKTIF = $$('.hr:checked').map(x => x.value).join(',');
  const j = await api('setSimpan', d); toast(j.message, 'ok'); $('#sekolah').textContent = $('#sekolah2').textContent = d.NAMA_SEKOLAH;
};
$('#set-form').onclick = e => {
  if (e.target.id !== 's-gps') return;
  navigator.geolocation.getCurrentPosition(p => { $('#s-LAT').value = p.coords.latitude.toFixed(6); $('#s-LNG').value = p.coords.longitude.toFixed(6); toast('Lokasi terisi. Klik Simpan.', 'ok'); },
    () => toast('Lokasi tidak tersedia. Izinkan akses lokasi.', 'err'), { enableHighAccuracy: true, timeout: 15000 });
};

// ---------- Impor murid dari Excel ----------
let IMP = [];
const ALIAS = { nis: ['nis'], nama: ['nama', 'nama murid', 'nama siswa'], kelas: ['kelas'], sandi: ['sandi', 'kata sandi', 'password'], email: ['email_ortu', 'email ortu', 'email orang tua', 'email orang tua/wali', 'email'] };
$('#imp-template').onclick = () => {
  if (typeof XLSX === 'undefined') return toast('Pustaka Excel gagal dimuat. Periksa koneksi internet.', 'err');
  const ws = XLSX.utils.aoa_to_sheet([['nis', 'nama', 'kelas', 'sandi', 'email_ortu'], ['20240002', 'Budi Santoso', 'X-1', 'budi123', 'ortu.budi@gmail.com']]);
  ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Murid'); XLSX.writeFile(wb, 'template-data-murid.xlsx');
};
$('#imp-file').onchange = async e => {
  const f = e.target.files[0]; IMP = []; $('#imp-hasil').innerHTML = ''; $('#imp-go').disabled = true;
  if (!f) return $('#imp-prev').innerHTML = '';
  if (typeof XLSX === 'undefined') return toast('Pustaka Excel gagal dimuat. Periksa koneksi internet.', 'err');
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }).forEach((r, i) => {
      const k = {}, o = { baris: i + 2 }; Object.keys(r).forEach(h => k[String(h).trim().toLowerCase()] = r[h]);
      Object.keys(ALIAS).forEach(f2 => { const a = ALIAS[f2].find(x => x in k); o[f2] = a ? String(k[a]).trim() : ''; });
      if (o.nis || o.nama || o.kelas || o.email) IMP.push(o);
    });
  } catch (x) { return toast('File tidak bisa dibaca. Gunakan template.', 'err'); }
  $('#imp-prev').innerHTML = `<p class="${IMP.length ? 'ok-t' : 'err-t'}">${IMP.length} baris terbaca.${IMP.length ? '' : ' Pastikan header: nis, nama, kelas, sandi, email_ortu.'}</p>`
    + (IMP.length ? `<div class="scroll"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>Email orang tua</th></tr></thead><tbody>${IMP.slice(0, 5).map(r => `<tr><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td>${esc(r.email)}</td></tr>`).join('')}</tbody></table></div>${IMP.length > 5 ? '<small class="muted">Menampilkan 5 baris pertama.</small>' : ''}` : '');
  $('#imp-go').disabled = !IMP.length;
};
$('#imp-go').onclick = async () => {
  let tambah = 0, lewat = 0, galat = [];
  $('#imp-go').disabled = true;
  for (let i = 0; i < IMP.length; i += 100) {
    try { const j = await api('impor', { rows: IMP.slice(i, i + 100) }); tambah += j.data.ditambah; lewat += j.data.dilewati; galat = galat.concat(j.data.galat); }
    catch (x) { galat.push('Kiriman baris ' + (i + 2) + '–' + (i + 101) + ' gagal: ' + x.message); }
  }
  $('#imp-hasil').innerHTML = `<p class="ok-t">✅ ${tambah} murid ditambahkan · ${lewat} dilewati (NIS sudah ada) · ${galat.length} baris bermasalah</p>`
    + (galat.length ? `<ul class="err-t">${galat.slice(0, 30).map(g => `<li>${esc(g)}</li>`).join('')}</ul>${galat.length > 30 ? '<small class="muted">…dan lainnya.</small>' : ''}` : '');
  IMP = []; $('#imp-file').value = ''; $('#imp-prev').innerHTML = '';
};

// ---------- Init ----------
(async function () {
  setInterval(tick, 1000); tick();
  if (GAS_URL.indexOf('http') !== 0) { tampil('login'); return toast('GAS_URL belum diisi di js/config.js', 'err'); }
  try {
    const r = await fetch(GAS_URL + '?action=config'), j = await r.json();
    CFG = j.data; off = CFG.server_ms - Date.now(); $('#sekolah').textContent = $('#sekolah2').textContent = CFG.nama_sekolah;
  } catch (e) { toast('Tidak dapat terhubung ke server.', 'err'); }
  if (S) mulai(); else tampil('login');
})();

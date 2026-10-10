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

function tampil(v) { ['login', 'murid', 'admin'].forEach(x => $('#v-' + x).hidden = x !== v); $('#userbox').hidden = v === 'login'; }
function tick() {
  const t = new Date(Date.now() + off).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }).replace(/\./g, ':');
  $$('.jam').forEach(e => e.textContent = t);
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
$('#btn-logout').onclick = () => keluar();

function mulai() {
  $('#uname').textContent = S.user.nama;
  if (S.user.role === 'admin') { tampil('admin'); $('#a-tgl').value = hariIni(); muatRekap(); }
  else { tampil('murid'); $('#m-nama').textContent = S.user.nama; $('#m-kelas').textContent = 'Kelas ' + S.user.kelas + ' · NIS ' + S.user.id; $('#z-tgl').value = hariIni(); $('#r-bulan').value = hariIni().slice(0, 7); muatBeranda(); }
}

// ---------- Tab ----------
document.addEventListener('click', e => {
  const b = e.target.closest('.tabs button'); if (!b) return;
  const g = b.parentElement.dataset.g;
  $$('.tabs[data-g="' + g + '"] button').forEach(x => x.classList.toggle('on', x === b));
  $$('.pane[data-g="' + g + '"]').forEach(p => p.hidden = p.id !== 't-' + b.dataset.t);
  if (b.dataset.t === 'riwayat') muatRiwayat();
  if (b.dataset.t === 'izinadm') muatIzinAdmin();
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
async function muatRekap() {
  const j = await api('rekap', { tanggal: $('#a-tgl').value || hariIni() }); REK = j.data;
  const hit = k => REK.list.filter(x => x.status === k).length, L = REK.list.length;
  $('#stats').innerHTML = [['Total', L], ['Hadir', hit('Hadir')], ['Terlambat', hit('Terlambat')], ['Izin/Sakit', hit('Izin') + hit('Sakit')], ['Alpa', hit('Alpa')], ['Belum absen', hit('Belum')]]
    .map(x => `<div class="stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  const ks = Object.keys(REK.ringkasan).sort();
  $('#chart').innerHTML = ks.map(k => { const r = REK.ringkasan[k], p = Math.round(((r.Hadir || 0) + (r.Terlambat || 0)) / r.total * 100); return `<div class="bar"><span>${esc(k)}</span><i><b style="width:${p}%"></b></i><span>${p}%</span></div>`; }).join('') || '<p class="muted">Belum ada data.</p>';
  const cur = $('#f-kelas').value; $('#f-kelas').innerHTML = '<option value="">Semua kelas</option>' + ks.map(k => `<option ${k === cur ? 'selected' : ''}>${esc(k)}</option>`).join('');
  renderRekap();
}
function renderRekap() {
  const kls = $('#f-kelas').value, q = $('#f-cari').value.toLowerCase();
  const L = REK.list.filter(x => (!kls || x.kelas === kls) && (!q || (x.nama + x.nis).toLowerCase().includes(q)));
  $('#tb-rekap').innerHTML = L.map(x => `<tr><td>${esc(x.nama)}<small>${esc(x.nis)}</small></td><td>${esc(x.kelas)}</td><td class="tn">${esc(x.jam_masuk || '–')}</td><td class="tn">${esc(x.jam_pulang || '–')}</td>
    <td>${x.foto_masuk ? `<a href="${esc(x.foto_masuk)}" target="_blank" rel="noopener">Foto</a>` : '–'}</td>
    <td><select class="st ${esc(x.status)}" data-nis="${esc(x.nis)}">${['Belum', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa'].map(s => `<option ${s === 'Belum' ? 'disabled' : ''} ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data.</td></tr>';
}
$('#a-tgl').onchange = muatRekap; $('#f-kelas').onchange = renderRekap; $('#f-cari').oninput = renderRekap;
$('#tb-rekap').onchange = async e => {
  const s = e.target.closest('select'); if (!s) return;
  try { await api('ubahStatus', { nis: s.dataset.nis, tanggal: REK.tanggal, status: s.value }); toast('Status diperbarui.', 'ok'); muatRekap(); } catch (x) { muatRekap(); }
};

async function muatIzinAdmin() {
  const j = await api('izinList');
  $('#izin-list').innerHTML = j.data.map(z => `<div class="izin-item"><b>${esc(z.nama)}</b> · ${esc(z.kelas)} · ${badge(z.jenis)} ${badge(z.status)}
    <p>📅 ${esc(z.tgl_izin)} — ${esc(z.alasan)}${z.link_berkas ? ` · <a href="${esc(z.link_berkas)}" target="_blank" rel="noopener">Lihat berkas</a>` : ''}</p>
    ${z.status === 'Menunggu' ? `<input placeholder="Catatan (opsional)" data-c="${esc(z.id)}"><button class="btn primary sm" data-k="Disetujui" data-id="${esc(z.id)}">Setujui</button> <button class="btn ghost sm" data-k="Ditolak" data-id="${esc(z.id)}">Tolak</button>` : `<small class="muted">Diproses: ${esc(z.diproses_oleh)} ${esc(z.catatan)}</small>`}</div>`).join('') || '<div class="card">Belum ada pengajuan.</div>';
}
$('#izin-list').onclick = async e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const c = document.querySelector('[data-c="' + b.dataset.id + '"]');
  const j = await api('keputusan', { id: b.dataset.id, keputusan: b.dataset.k, catatan: c ? c.value : '' });
  toast(j.message, 'ok'); muatIzinAdmin();
};

// ---------- Init ----------
(async function () {
  setInterval(tick, 1000); tick();
  if (GAS_URL.indexOf('http') !== 0) { tampil('login'); return toast('GAS_URL belum diisi di js/config.js', 'err'); }
  try {
    const r = await fetch(GAS_URL + '?action=config'), j = await r.json();
    CFG = j.data; off = CFG.server_ms - Date.now(); $('#sekolah').textContent = CFG.nama_sekolah;
  } catch (e) { toast('Tidak dapat terhubung ke server.', 'err'); }
  if (S) mulai(); else tampil('login');
})();

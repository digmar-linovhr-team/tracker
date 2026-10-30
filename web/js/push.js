/* Push notification (versi Firebase): kartu di Pengaturan & banner satu klik di Task Saya.
 * Memakai fungsi & state dari app.js. */
'use strict';

const PUSH_SNOOZE = 'pt.pushSnooze';
function pushPerm() { return window.Notification ? Notification.permission : 'unsupported'; }
function pushLocalOn() { try { return pushPerm() === 'granted' && !!localStorage.getItem('pt.pushToken'); } catch (e) { return false; } }
function pushSnoozed() { try { return Number(localStorage.getItem(PUSH_SNOOZE) || 0) > Date.now(); } catch (e) { return false; } }
function pushBlockedHelp() {
  const mac = /Mac/.test(navigator.userAgent);
  return `Notifikasi diblokir untuk situs ini. Klik ikon <b>gembok/setelan</b> di kiri kolom alamat → <b>Notifikasi → Izinkan</b>, lalu muat ulang halaman.${mac ? ' Di Mac, pastikan juga <b>System Settings → Notifications → Google Chrome</b> (atau browser Anda) diizinkan.' : ''}`;
}

async function pushEnable(btn) {
  try {
    const r = await busy(btn, () => api.push.enable());
    if (r.permission === 'granted' && r.enabled) { toast('Push notification aktif di perangkat ini'); return true; }
    if (r.permission === 'denied') toast('Notifikasi diblokir browser — lihat petunjuk di Pengaturan', true);
    else toast('Izin notifikasi belum diberikan', true);
  } catch (e) { /* busy menampilkan pesan */ }
  return false;
}

function pushBanner() {
  if (!api.push || S.cfg.demo || pushLocalOn() || pushSnoozed() || !S.user.sheetName) return '';
  const perm = pushPerm();
  if (perm === 'unsupported') return '';
  if (perm === 'denied') return `<div class="banner warn" id="push-bn"><div><b>Notifikasi diblokir.</b> ${pushBlockedHelp()}</div><button class="btn sm" id="push-later">Nanti</button></div>`;
  return `<div class="banner" id="push-bn"><div><b>🔔 Nyalakan notifikasi</b> agar @sebutan dan deadline tetap muncul walau Project Tracker tertutup.</div>
    <div class="row"><button class="btn sm" id="push-later">Nanti</button><button class="btn sm primary" id="push-on">Nyalakan</button></div></div>`;
}
function bindPushBanner() {
  const on = $('#push-on'), later = $('#push-later');
  if (on) on.onclick = async () => { if (await pushEnable(on)) { const b = $('#push-bn'); if (b) b.remove(); } else go(S.view); };
  if (later) later.onclick = () => { try { localStorage.setItem(PUSH_SNOOZE, String(Date.now() + 7 * 864e5)); } catch (e) { /* abaikan */ } const b = $('#push-bn'); if (b) b.remove(); };
}

async function pushCard() {
  const box = $('#push-card'); if (!box) return;
  box.innerHTML = '<div class="card settings-sect"><div class="card-h"><h2>Push notification</h2></div><div class="card-b"><p class="muted">Memuat…</p></div></div>';
  let st;
  try { st = await api.push.status(); } catch (e) { st = { supported: false, permission: pushPerm(), enabled: false, devices: 0, prefs: { mention: true, deadline: true } }; }
  if (!$('#push-card')) return;
  const chip = !st.supported ? ['', 'Tidak didukung'] : st.enabled ? ['good', 'Aktif'] : st.permission === 'denied' ? ['bad', 'Diblokir'] : ['warn', 'Belum aktif'];
  box.innerHTML = `<div class="card settings-sect"><div class="card-h"><h2>Push notification</h2><span class="chip ${chip[0]}">${chip[1]}</span></div><div class="card-b">
    <p>Muncul di laptop walau Project Tracker <b>tertutup</b> (selama browser berjalan). Saat aplikasi terbuka, notifikasi yang sama tampil sekali saja — tidak dobel.</p>
    ${!st.supported ? '<p class="small muted">Browser ini belum mendukung push. Gunakan Chrome atau Edge terbaru.</p>' : ''}
    ${st.supported && st.permission === 'denied' ? `<p class="small" style="color:var(--bad)">${pushBlockedHelp()}</p>` : ''}
    <label class="check"><input type="checkbox" data-pp="mention" ${st.prefs.mention ? 'checked' : ''}> Saat saya di-@sebut di komentar</label>
    <label class="check"><input type="checkbox" data-pp="deadline" ${st.prefs.deadline ? 'checked' : ''}> Deadline: 2 jam sebelumnya &amp; saat terlewat</label>
    <p class="muted small" style="margin:6px 0 0">${st.enabled ? `Aktif di perangkat ini (${esc(st.thisDevice)})` : 'Belum aktif di perangkat ini'}${st.devices ? ` · terdaftar di ${st.devices} perangkat` : ''}. Saat push aktif, email @sebutan tidak dikirim lagi.</p>
    <div class="row" style="margin-top:12px;flex-wrap:wrap">
      ${st.supported && !st.enabled && st.permission !== 'denied' ? '<button class="btn primary" id="pp-on">Nyalakan di perangkat ini</button>' : ''}
      ${st.enabled ? '<button class="btn" id="pp-test">Kirim push uji</button><button class="btn" id="pp-off">Matikan di perangkat ini</button>' : ''}
    </div></div></div>`;
  $$('[data-pp]', box).forEach((x) => x.onchange = async () => {
    const prefs = {}; $$('[data-pp]', box).forEach((i) => { prefs[i.dataset.pp] = i.checked; });
    try { await api.push.setPrefs(prefs); toast('Setelan push disimpan'); } catch (e) { toast(e.message, true); }
  });
  if ($('#pp-on', box)) $('#pp-on', box).onclick = async () => { await pushEnable($('#pp-on', box)); pushCard(); };
  if ($('#pp-off', box)) $('#pp-off', box).onclick = async () => { await busy($('#pp-off', box), () => api.push.disable()); toast('Push dimatikan di perangkat ini'); pushCard(); };
  if ($('#pp-test', box)) $('#pp-test', box).onclick = async () => {
    try { const r = await busy($('#pp-test', box), () => api.push.test()); toast(r.sent ? `Push uji dikirim ke ${r.sent} perangkat — tutup/minimalkan tab untuk melihatnya` : 'Tidak ada perangkat yang menerima push', !r.sent); }
    catch (e) { /* busy menampilkan pesan */ }
  };
}

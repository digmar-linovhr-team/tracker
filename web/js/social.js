/* Brief sosmed (Carousel / Video). Siapa pun bisa membuat, lalu menugaskannya ke desainer / orang terkait:
 * task berjenis Sosmed otomatis dibuat untuk orang itu. Alur task biasa: Mulai → Ajukan review → admin Setujui = Done.
 * Memakai fungsi & state dari app.js / brief.js (S, api, $, esc, modal, toast, go, markDirty, briefSave, …). */
'use strict';

const SOC_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/></svg>';
const SOC_PLATFORMS = ['Instagram', 'LinkedIn', 'TikTok'];
const SOC_SHORT = { Instagram: 'IG', LinkedIn: 'LI', TikTok: 'TT' };
/** Ukuran umum per platform & bentuk (lebar × tinggi piksel). */
const SOC_SIZES = {
  Instagram: { Carousel: ['4:5 · 1080×1350', '1:1 · 1080×1080', '3:4 · 1080×1440', '1.91:1 · 1080×566'], Video: ['9:16 · 1080×1920', '4:5 · 1080×1350', '1:1 · 1080×1080'] },
  LinkedIn: { Carousel: ['4:5 · 1080×1350', '1:1 · 1080×1080', '1.91:1 · 1200×627'], Video: ['9:16 · 1080×1920', '16:9 · 1920×1080', '1:1 · 1080×1080', '4:5 · 1080×1350'] },
  TikTok: { Carousel: ['9:16 · 1080×1920', '4:5 · 1080×1350'], Video: ['9:16 · 1080×1920'] }
};
const SOC_DEFAULT_SIZE = { Carousel: '4:5 · 1080×1350', Video: '9:16 · 1080×1920' };
const SOC_CAPTION_MAX = { Instagram: 2200, LinkedIn: 3000 };
const SOC_ST = { Backlog: 'Ditugaskan', 'On-Progress': 'Dikerjakan', Review: 'Direview', Hold: 'Ditunda', Done: 'Selesai', Recurring: 'Dikerjakan' };
const SOC_CLS = { Draft: 'warn', Ditugaskan: 'info', Dikerjakan: 'info', Direview: 'info', Ditunda: 'muted', Selesai: 'good' };
const SOC_TABS = [['all', 'Semua'], ['mine', 'Milik saya'], ['Draft', 'Draft'], ['run', 'Berjalan'], ['Direview', 'Direview'], ['Selesai', 'Selesai']];

const blankSlide = () => ({ text: '', visual: '', refs: [''] });
const blankScene = () => ({ visual: '', audio: '', dur: '', refs: [''] });

function normSocial(d) {
  d = d || {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  const refs = (r) => { const l = arr(r).map((x) => String(x || '')); return l.length ? l : ['']; };
  const out = {
    v: 1, format: d.format === 'Video' ? 'Video' : 'Carousel', title: d.title || '',
    platforms: arr(d.platforms).slice(), sizes: arr(d.sizes).slice(),
    slides: arr(d.slides).map((x) => ({ text: (x && x.text) || '', visual: (x && x.visual) || '', refs: refs(x && x.refs) })),
    scenes: arr(d.scenes).map((x) => ({ visual: (x && x.visual) || '', audio: (x && x.audio) || '', dur: x && x.dur !== undefined ? x.dur : '', refs: refs(x && x.refs) })),
    caption: d.caption || '', notes: d.notes || '',
    assign: Object.assign({ owner: '', endDate: '', endTime: '18:00', priority: 'Medium', code: '' }, d.assign || {})
  };
  if (!out.slides.length) out.slides.push(blankSlide());
  if (!out.scenes.length) out.scenes.push(blankScene());
  return out;
}
/** Ringkasan untuk daftar (dari server: sudah ringkas; dari editor: dihitung). */
function socSum(b) {
  const d = b.data || {};
  if (b.summary) return Object.assign({ format: 'Carousel', title: '', platforms: [], sizes: [], nSlides: 0, nScenes: 0, dur: 0 }, d);
  return { format: d.format || 'Carousel', title: d.title || '', platforms: d.platforms || [], sizes: d.sizes || [], nSlides: (d.slides || []).length,
    nScenes: (d.scenes || []).length, dur: (d.scenes || []).reduce((a, x) => a + (Number(x && x.dur) || 0), 0), assign: d.assign };
}
const socCount = (s) => (s.format === 'Video' ? `${s.nScenes} scene${s.dur ? ' · ' + socDur(s.dur) : ''}` : `${s.nSlides} slide`);
function socDur(sec) { sec = Number(sec) || 0; return sec >= 60 ? Math.floor(sec / 60) + 'm ' + pad(sec % 60) + 'd' : sec + ' detik'; }
function socPeople() {
  if (S.all) return S.all.users.filter((u) => u.sheetName && u.active);
  return (S.team && S.team.users) || [];
}
function nameOf(username) {
  if (!username) return '';
  const u = ((S.all && S.all.users) || (S.team && S.team.users) || []).find((x) => x.username === username);
  if (u) return u.name;
  if (username === S.user.username) return S.user.name;
  for (const b of S.briefs || []) { if (b.owner === username && b.ownerName) return b.ownerName; if (b.createdBy === username && b.createdByName) return b.createdByName; }
  return username;
}
function socProjects() { return ((S.all && S.all.projects) || (S.team && S.team.projects) || S.mine.projects || []).filter((p) => p.code); }

function socStatus(b) {
  if (!b.taskId) return ['Draft', 'warn'];
  if (String(b.taskId).startsWith('tmp-')) return ['Ditugaskan', 'info'];
  const t = briefTask(b);
  const st = t ? (SOC_ST[t.status] || 'Ditugaskan') : (b.status && b.status !== 'Draft' ? b.status : 'Ditugaskan');
  return [st, SOC_CLS[st] || 'info'];
}
const isAdmin = () => S.user.role === 'admin';
function canEditSocial(b) {
  if (String(b.id).startsWith('tmp-')) return true;
  if (socStatus(b)[0] === 'Selesai' && !isAdmin()) return false;
  if (isAdmin() || b.createdBy === S.user.username) return true;
  const t = b.taskId && briefTask(b);
  return !!(b.taskId && (t ? t.owner : b.owner) === S.user.username);
}
function canAssignSocial(b) {
  if (socStatus(b)[0] === 'Selesai' && !isAdmin()) return false;
  return isAdmin() || b.createdBy === S.user.username || String(b.id).startsWith('tmp-');
}
function canDeleteSocial(b) {
  if (String(b.id).startsWith('tmp-')) return false;
  if (isAdmin()) return true;
  if (b.createdBy !== S.user.username) return false;
  const t = b.taskId && briefTask(b);
  return !t || (t.status === 'Backlog' && !t.startedAt);
}

// ---------- daftar ----------
function renderSocialList() {
  const f = S.bf, q = f.q.trim().toLowerCase(), me = S.user.username;
  const all = (S.briefs || []).filter(isSocial);
  let list = all.filter((b) => {
    const st = socStatus(b)[0];
    if (f.tab === 'mine' && b.createdBy !== me && b.owner !== me) return false;
    if (f.tab === 'Draft' && st !== 'Draft') return false;
    if (f.tab === 'run' && !['Ditugaskan', 'Dikerjakan', 'Ditunda'].includes(st)) return false;
    if (['Direview', 'Selesai'].includes(f.tab) && st !== f.tab) return false;
    if (q && !(bKw(b) + ' ' + nameOf(b.owner) + ' ' + nameOf(b.createdBy) + ' ' + socSum(b).platforms.join(' ')).toLowerCase().includes(q)) return false;
    return true;
  });
  const order = { Direview: 0, Dikerjakan: 1, Ditugaskan: 2, Draft: 3, Ditunda: 4, Selesai: 5 };
  list.sort((a, b) => (S.socNew && S.socNew.has(b.id) ? 1 : 0) - (S.socNew && S.socNew.has(a.id) ? 1 : 0)
    || (order[socStatus(a)[0]] - order[socStatus(b)[0]]) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!list.length) {
    $('#blist').innerHTML = `<div class="card empty"><b>${all.length ? 'Tidak ada brief sosmed yang cocok' : 'Belum ada brief sosmed'}</b>Siapa pun bisa membuat brief konten (carousel atau video) lalu menugaskannya ke desainer atau orang terkait — task-nya dibuat otomatis.</div>`;
    return;
  }
  $('#blist').innerHTML = `<div class="card tlist brief-list soc-list">
    <div class="bl-head"><span>Judul & bentuk</span><span>Penanggung jawab</span><span>Platform & ukuran</span><span>Status</span></div>
    ${list.map((b) => {
      const s = socSum(b), [st, cls] = socStatus(b), t = b.taskId && briefTask(b);
      const end = t ? L.schedule(t).end : (s.assign && s.assign.endDate ? L.at(s.assign.endDate, s.assign.endTime || '18:00') : null);
      const isNew = S.socNew && S.socNew.has(b.id);
      return `<button class="bl-row" data-brief="${esc(b.id)}">
        <span class="bl-kw"><b>${esc(s.title || bKw(b) || '(tanpa judul)')}</b><small><span class="soc-fmt">${esc(s.format)}</span> ${esc(socCount(s))} · dari ${esc(nameOf(b.createdBy))}</small></span>
        <span class="bl-task">${b.taskId ? esc(t ? t.ownerName : nameOf(b.owner)) : '<span class="muted">Belum ditugaskan</span>'}<small>${end ? 'deadline ' + esc(fmtD(end)) : ''}</small></span>
        <span class="bl-type">${esc(s.platforms.join(', ') || '–')}<small>${esc(s.sizes.map((x) => x.split(' · ')[0]).join(', '))}</small></span>
        <span><span class="bstat ${cls}">${esc(st)}</span>${isNew ? '<span class="bnew">Baru disetujui</span>' : ''}</span>
      </button>`;
    }).join('')}</div>`;
  $$('[data-brief]', $('#blist')).forEach((r) => r.onclick = () => openBrief(r.dataset.brief));
}

// ---------- buat baru ----------
/** Brief sosmed baru hanya ada di layar dulu. Baru disimpan ke server setelah judulnya diisi (atau saat ditugaskan),
 *  jadi menekan "+ Brief sosmed" lalu kembali tidak meninggalkan brief tanpa judul. */
function newSocialBrief(copyFrom) {
  const base = copyFrom ? normSocial(JSON.parse(JSON.stringify(copyFrom.data || {}))) : null;
  const data = base
    ? normSocial(Object.assign(base, { title: base.title ? base.title + ' (salinan)' : '', assign: { owner: '', endDate: '', endTime: '18:00', priority: 'Medium', code: '' } }))
    : normSocial({ format: 'Carousel', platforms: ['Instagram', 'LinkedIn'], sizes: [SOC_DEFAULT_SIZE.Carousel], slides: [blankSlide(), blankSlide(), blankSlide()] });
  const tmp = { id: 'tmp-' + Date.now(), taskId: '', owner: '', createdBy: S.user.username, type: 'Sosmed', status: 'Draft', keyword: data.format, title: data.title,
    data, docUrl: '', createdAt: '', updatedAt: '', updatedBy: S.user.username };
  S.bEdit = { id: tmp.id, b: tmp, dirty: !!copyFrom, saving: false, savedAt: null, error: '', isNew: true };
  go('brief');
  if (copyFrom) { toast('Salinan dibuat. Ubah seperlunya — tersimpan otomatis.'); briefSave(); }
  else setTimeout(() => { const el = $('[data-k="title"]'); if (el) el.focus(); }, 50);
}
/** Simpan brief sosmed baru untuk pertama kali (dipanggil oleh simpan otomatis bila judul sudah diisi). */
async function socCreate(E) {
  const snap = JSON.parse(JSON.stringify(E.b));
  const r = await api.call('saveSocialBrief', { brief: { data: snap.data } });
  E.isNew = false; E.id = r.brief.id;
  Object.assign(E.b, { id: r.brief.id, updatedAt: r.brief.updatedAt, createdAt: r.brief.createdAt, updatedBy: r.brief.updatedBy });
  putBrief(Object.assign({}, r.brief, { data: JSON.parse(JSON.stringify(E.b.data)) }));
  if (S.bEdit === E && S.view === 'brief') renderSocActions();
  toast('Brief sosmed disimpan');
  return r;
}

// ---------- editor ----------
function viewSocial() {
  const E = S.bEdit, b = E.b, d = b.data, edit = canEditSocial(b), ro = edit ? '' : 'disabled';
  if (S.socNew && S.socNew.delete(b.id)) renderNav();
  if (!S.all && !S.team && S.user.role !== 'admin') loadTeam().then((ok) => { if (ok && S.view === 'brief' && S.bEdit === E) rerenderBrief(); });
  const video = d.format === 'Video', key = video ? 'scenes' : 'slides', items = d[key];
  const [st, stc] = socStatus(b);
  $('#view-title').textContent = d.title || 'Brief sosmed';
  $('#view-sub').textContent = 'Brief sosmed · ' + d.format;
  if (socialDocMode(b)) {
    $('#view').innerHTML = `
    <div class="bed-top">
      <button class="btn ghost sm" id="bback">← Brief</button>
      <div class="bed-task"><span class="soc-ico">${SOC_ICON}</span><b>${esc(d.title || 'Brief sosmed')}</b> <span class="muted">· dibuat ${esc(nameOf(b.createdBy))}</span></div>
      <span class="bstat ${stc}" id="bstatus">${esc(st)}</span>
      <div class="bed-actions" id="bactions"></div>
    </div>
    ${st === 'Direview' && S.user.role === 'admin' ? '<div class="banner"><div>Konten ini sedang menunggu review Anda. Setujui atau kembalikan dari menu <b>Review</b>.</div><button class="btn sm" id="soc-goreview">Buka Review</button></div>' : ''}
    ${socialDocHtml(b)}`;
    renderSocActions();
    if (edit) { $('#bactions').insertAdjacentHTML('afterbegin', '<button class="btn sm" id="bforce">Ubah brief</button>'); $('#bforce').onclick = () => { E.forceEdit = true; viewSocial(); }; }
    if ($('#soc-goreview')) $('#soc-goreview').onclick = () => go('review');
    renderSocAssign();
    $('#bback').onclick = () => { S.bf.kind = 'sosmed'; go('briefs'); };
    return;
  }
  $('#view').innerHTML = `
    <div class="bed-top">
      <button class="btn ghost sm" id="bback">← Brief</button>
      <div class="bed-task"><span class="soc-ico">${SOC_ICON}</span><b id="soc-ttl">${esc(d.title || 'Brief sosmed baru')}</b> <span class="muted">· dibuat ${esc(nameOf(b.createdBy))}</span></div>
      <span class="bstat ${stc}" id="bstatus">${esc(st)}</span>
      <span class="muted small" id="bsave">${saveText()}</span>
      <div class="bed-actions" id="bactions"></div>
    </div>
    ${E.error ? `<div class="banner warn"><div>${esc(E.error)}</div><button class="btn sm" id="breload">Muat ulang brief</button></div>` : ''}
    ${edit ? '' : `<div class="banner"><div>${st === 'Selesai' ? 'Konten ini sudah disetujui admin — brief hanya bisa dilihat.' : 'Hanya bisa dilihat. Brief ini bisa diubah oleh pembuatnya, penanggung jawab, dan admin.'}</div></div>`}
    <div class="bed-main bed-one" id="bmain">
      ${secCard(1, 'Konten', `
        ${fText('title', 'Judul konten', 'mis. 5 Tanda Payroll Kamu Perlu Otomatis', ro)}
        <div class="field"><span>Bentuk</span><div class="seg seg-pick" role="radiogroup" aria-label="Bentuk konten">${['Carousel', 'Video'].map((x) => `<button type="button" role="radio" aria-checked="${d.format === x}" class="${d.format === x ? 'on' : ''}" data-sfmt="${x}" ${ro}>${x}</button>`).join('')}</div></div>
        <div class="field"><span>Platform</span><div class="chips-pick">${(ro ? d.platforms : SOC_PLATFORMS.concat(d.platforms.filter((x) => !SOC_PLATFORMS.includes(x)))).map((x) => `<label class="cpick ${d.platforms.includes(x) ? 'on' : ''}"><input type="checkbox" data-plat="${esc(x)}" ${d.platforms.includes(x) ? 'checked' : ''} ${ro}>${esc(x)}</label>`).join('')}
          ${ro ? '' : '<input type="text" class="extra-in" data-platin="1" placeholder="+ lainnya (Enter)" aria-label="Platform lain">'}</div></div>
        <div class="field"><span>Ukuran <em class="muted">— boleh lebih dari satu</em></span><div class="chips-pick" id="soc-sizes">${sizeChips(d, ro)}</div>
          <small class="muted soc-hint">Rekomendasi feed Instagram & LinkedIn: <b>4:5 · 1080×1350</b>. Reels / TikTok / Story: <b>9:16 · 1080×1920</b>.</small></div>`)}
      ${secCard(2, video ? 'Scene per scene' : 'Brief visual per slide', `
        ${items.map((x, i) => video ? sceneBlock(x, i, items.length, ro) : slideBlock(x, i, items.length, ro)).join('')}
        ${ro ? '' : `<button type="button" class="btn sm" data-sadd="1">+ ${video ? 'Scene' : 'Slide'}</button>`}
        ${video ? `<div class="muted small" id="soc-total" style="margin-top:8px">${totalText(d)}</div>` : ''}`)}
      ${secCard(3, 'Caption', `
        ${fArea('caption', 'Caption', 'Tulis caption, hashtag, dan mention di sini', ro, 0, 5)}
        <div class="soc-cap" id="soc-cap">${capText(d)}</div>
        ${fArea('notes', 'Catatan untuk desainer (opsional)', 'mis. Pakai template carousel brand Q4, font Poppins', ro, 0, 2)}`)}
      ${secCard(4, 'Penugasan', '<div id="soc-assign"></div>')}
    </div>`;
  renderSocActions();
  renderSocAssign();
  bindSocialEditor(edit);
}

function sizeChips(d, ro) {
  const map = {};
  (d.platforms.length ? d.platforms : ['Instagram', 'LinkedIn']).forEach((p) => ((SOC_SIZES[p] || {})[d.format] || []).forEach((sz) => { (map[sz] = map[sz] || []).push(SOC_SHORT[p] || p); }));
  d.sizes.forEach((sz) => { if (!map[sz]) map[sz] = []; });
  if (ro) return d.sizes.map((sz) => `<label class="cpick on"><input type="checkbox" checked disabled>${esc(sz)}${(map[sz] || []).length ? `<small>${esc(map[sz].join(' · '))}</small>` : ''}</label>`).join('') || '<span class="muted small">Belum dipilih</span>';
  return Object.keys(map).map((sz) => `<label class="cpick ${d.sizes.includes(sz) ? 'on' : ''}"><input type="checkbox" data-size="${esc(sz)}" ${d.sizes.includes(sz) ? 'checked' : ''} ${ro}>${esc(sz)}${map[sz].length ? `<small>${esc(map[sz].join(' · '))}</small>` : ''}</label>`).join('')
    + (ro ? '' : '<input type="text" class="extra-in wide" data-sizein="1" placeholder="+ ukuran lain, mis. 1200×1500 (Enter)" aria-label="Ukuran lain">');
}
function itemTools(i, n, ro, label) {
  if (ro) return '';
  return `<span class="sx-tools"><button type="button" class="ibtn" data-smv="${i}" data-dir="-1" aria-label="Naikkan ${label}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="ibtn" data-smv="${i}" data-dir="1" aria-label="Turunkan ${label}" ${i === n - 1 ? 'disabled' : ''}>↓</button>${n > 1 ? `<button type="button" class="ibtn" data-srm="${i}" aria-label="Hapus ${label}">×</button>` : ''}</span>`;
}
function refsBlock(x, i, ro) {
  if (ro) {
    const links = x.refs.filter((r) => String(r).trim());
    return links.length ? `<div class="sx-src"><span class="sx-src-h">Referensi</span><div class="t-res">${links.map((r) => isHttp(r) ? resChip({ label: '', url: r.trim() }) : `<span class="muted small">${esc(r)}</span>`).join('')}</div></div>` : '';
  }
  return `<div class="sx-src"><span class="sx-src-h">Referensi <em class="muted">— link Google, Instagram, Pinterest, TikTok, dll.</em></span>
    ${x.refs.map((r, k) => `<div class="li-row"><input type="text" data-sl="${i}" data-ref="${k}" value="${esc(r)}" placeholder="https://…" aria-label="Link referensi">${isHttp(r) ? `<a class="ibtn" href="${esc(r.trim())}" target="_blank" rel="noopener noreferrer" aria-label="Buka referensi" title="Buka">↗</a>` : ''}${x.refs.length > 1 ? `<button type="button" class="ibtn" data-rmref="${i}" data-k="${k}" aria-label="Hapus referensi">×</button>` : ''}</div>`).join('')}
    <button type="button" class="btn sm ghost" data-addref="${i}">+ Referensi</button></div>`;
}
function slideBlock(x, i, n, ro) {
  return `<div class="sx soc-item">
    <div class="sx-h"><span class="lvl">Slide ${i + 1}</span>${i === 0 ? '<span class="muted small">cover</span>' : i === n - 1 && n > 1 ? '<span class="muted small">penutup / CTA</span>' : ''}<span class="spacer"></span>${itemTools(i, n, ro, 'slide')}</div>
    <div class="grid2">
      <label class="field"><span>Teks di slide</span><textarea data-sl="${i}" data-f="text" rows="3" placeholder="${i === 0 ? 'mis. 5 Tanda Payroll Kamu Perlu Otomatis' : 'Teks / poin yang tampil di slide ini'}" ${ro}>${esc(x.text)}</textarea></label>
      <label class="field"><span>Visual / gambar</span><textarea data-sl="${i}" data-f="visual" rows="3" placeholder="mis. Ilustrasi staf HR di antara tumpukan slip gaji, warna brand" ${ro}>${esc(x.visual)}</textarea></label>
    </div>
    ${refsBlock(x, i, ro)}
  </div>`;
}
function sceneBlock(x, i, n, ro) {
  return `<div class="sx soc-item">
    <div class="sx-h"><span class="lvl">Scene ${i + 1}</span><span class="spacer"></span>
      <label class="soc-dur"><input type="number" min="0" max="600" step="1" data-sl="${i}" data-f="dur" value="${esc(x.dur)}" placeholder="0" aria-label="Durasi scene ${i + 1} (detik)" ${ro}><span>detik</span></label>${itemTools(i, n, ro, 'scene')}</div>
    <div class="grid2">
      <label class="field"><span>Visual / adegan</span><textarea data-sl="${i}" data-f="visual" rows="3" placeholder="mis. Close-up karyawan baru bingung di meja kosong" ${ro}>${esc(x.visual)}</textarea></label>
      <label class="field"><span>Teks / voice-over / dialog</span><textarea data-sl="${i}" data-f="audio" rows="3" placeholder="mis. VO: “Hari pertama kerja, tapi nggak tahu harus ngapain?”" ${ro}>${esc(x.audio)}</textarea></label>
    </div>
    ${refsBlock(x, i, ro)}
  </div>`;
}
function totalText(d) {
  const sec = d.scenes.reduce((a, x) => a + (Number(x.dur) || 0), 0);
  return `Total durasi: <b>${socDur(sec)}</b> · ${d.scenes.length} scene`;
}
function capText(d) {
  const n = String(d.caption || '').length;
  const plats = d.platforms.filter((p) => SOC_CAPTION_MAX[p]);
  const tags = (String(d.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).length;
  return `<span>${n.toLocaleString('id-ID')} karakter${tags ? ' · ' + tags + ' hashtag' : ''}</span>` + plats.map((p) => `<span class="${n > SOC_CAPTION_MAX[p] ? 'over' : ''}">${p} maks ${SOC_CAPTION_MAX[p].toLocaleString('id-ID')}</span>`).join('');
}

function renderSocActions() {
  const E = S.bEdit, el = $('#bactions'); if (!E || !el) return;
  const b = E.b;
  el.innerHTML = E.isNew ? '<button class="btn sm ghost" id="sdiscard">Batal</button>'
    : `<button class="btn sm" id="sdup">Duplikat</button>${canDeleteSocial(b) ? '<button class="btn sm ghost danger" id="sdel" title="Hapus brief">Hapus</button>' : ''}`;
  if ($('#sdup')) $('#sdup').onclick = () => { briefFlush(); newSocialBrief(E.b); };
  if ($('#sdel')) $('#sdel').onclick = socDelete;
  if ($('#sdiscard')) $('#sdiscard').onclick = async () => {
    const d = E.b.data, filled = String(d.title || '').trim() || d.slides.some((x) => (x.text + x.visual).trim()) || d.scenes.some((x) => (x.visual + x.audio).trim()) || String(d.caption || '').trim();
    if (filled && !(await confirmBox('Buang brief ini?', 'Isinya belum disimpan dan akan hilang.', 'Buang'))) return;
    clearTimeout(E.timer); E.dirty = false; S.bEdit = null; S.bf.kind = 'sosmed'; go('briefs');
  };
}

/** Ringkasan task yang terhubung (penanggung jawab, deadline, status, hasil kerja). */
function socTaskInfo(b) {
  const d = b.data || {}, a = d.assign || {};
  if (String(b.taskId).startsWith('tmp-')) return `<div class="soc-task"><span class="avatar">${initials(nameOf(a.owner))}</span><div><b>${esc(nameOf(a.owner))}</b><small>Membuat task…</small></div></div>`;
  const t = briefTask(b);
  const owner = t ? t.ownerName : nameOf(b.owner);
  const end = t ? L.schedule(t).end : (a.endDate ? L.at(a.endDate, a.endTime || '18:00') : null);
  const res = t ? resultsOf(t) : [];
  return `<div class="soc-task"><span class="avatar">${initials(owner)}</span><div><b>${esc(owner)}</b><small>${end ? 'Deadline ' + esc(fmtDT(end)) : ''}${t && t.code ? ' · ' + esc(t.code) : ''}</small></div>
      ${t ? `<span class="soc-tst">${statusChip(t.status)}</span>` : ''}</div>
    ${t && (res.length || t.resultNote) ? `<div class="soc-res"><div class="rv-res-h">Hasil kerja</div>${t.resultNote ? `<div class="rv-rnote">${esc(t.resultNote)}</div>` : ''}<div class="t-res">${res.map((x) => resChip(x)).join('')}</div></div>` : ''}`;
}

function renderSocAssign() {
  const E = S.bEdit, box = $('#soc-assign'); if (!E || !box) return;
  const b = E.b, d = b.data, a = d.assign, can = canAssignSocial(b);
  if (b.taskId && !E.reassign) {
    box.innerHTML = `<div id="bsoc-task">${socTaskInfo(b)}</div>
      <p class="muted small" style="margin:10px 0 0">${socStatus(b)[0] === 'Selesai' ? 'Konten sudah disetujui admin.' : 'Penanggung jawab mengerjakan lewat Task Saya: Mulai → Ajukan review → admin menyetujui → Done. ' + (b.createdBy === S.user.username ? 'Anda' : esc(nameOf(b.createdBy))) + ' akan diberi tahu saat konten disetujui.'}</p>
      ${can && !String(b.taskId).startsWith('tmp-') && socStatus(b)[0] !== 'Selesai' && !socialDocMode(b) ? '<button type="button" class="btn sm" id="soc-reassign" style="margin-top:10px">Ubah penugasan</button>' : ''}`;
    if ($('#soc-reassign')) $('#soc-reassign').onclick = () => {
      const t = briefTask(b);
      if (t) Object.assign(a, { owner: t.owner, endDate: t.endDate || a.endDate, endTime: t.endTime || a.endTime || '18:00', priority: t.priority || a.priority, code: t.code || '' });
      E.reassign = true; renderSocAssign();
    };
    return;
  }
  if (!can) { box.innerHTML = '<p class="muted" style="margin:0">Belum ditugaskan. Hanya pembuat brief dan admin yang bisa menugaskan.</p>'; return; }
  const people = socPeople(), opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l || v)}</option>`;
  box.innerHTML = `
    <div class="grid2">
      <label class="field"><span>Penanggung jawab *</span><select data-as="owner" data-pick="person"><option value="">${people.length ? 'Pilih orang…' : 'Memuat daftar anggota…'}</option>${people.map((u) => opt(u.username, a.owner, u.name + (u.position ? ' — ' + u.position : ''))).join('')}</select></label>
      <label class="field"><span>Project (opsional)</span><select data-as="code" data-pick="project"><option value="">— tanpa project —</option>${socProjects().map((p) => opt(p.code, a.code, p.code + ' — ' + String(p.project).slice(0, 50))).join('')}</select></label>
    </div>
    <div class="grid3">
      <label class="field"><span>Deadline *</span><input type="date" data-as="endDate" value="${esc(a.endDate)}"></label>
      <label class="field"><span>Jam</span><input type="time" data-as="endTime" value="${esc(a.endTime || '18:00')}"></label>
      <label class="field"><span>Prioritas</span><select data-as="priority" data-pick="plain">${PRIORITIES.map((p) => opt(p, a.priority || 'Medium')).join('')}</select></label>
    </div>
    <p class="muted small" style="margin:0 0 10px">Task berjenis <b>Sosmed</b> otomatis muncul di Task Saya penanggung jawab dan ia mendapat email. Alurnya: Mulai → Ajukan review → admin menyetujui → Done; pembuat brief diberi tahu saat konten disetujui.</p>
    <div id="soc-err"></div>
    <div class="soc-act">${E.reassign ? '<button type="button" class="btn" id="soc-cancel">Batal</button>' : ''}<button type="button" class="btn primary" id="soc-go">${b.taskId ? 'Simpan penugasan' : 'Tugaskan & buat task'}</button></div>`;
  formPick(box);
  if ($('#soc-cancel')) $('#soc-cancel').onclick = () => { E.reassign = false; renderSocAssign(); };
  $('#soc-go').onclick = socialAssign;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function socialAssign() {
  const E = S.bEdit, b = E.b, d = b.data, a = d.assign;
  const err = (m, sel) => { $('#soc-err').innerHTML = `<div class="error" style="margin-bottom:10px">${esc(m)}</div>`; if (sel) { const el = $(sel); if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } };
  if (!String(d.title || '').trim()) return err('Isi judul konten dulu.', '[data-k="title"]');
  if (!a.owner) return err('Pilih penanggung jawab.', '[data-as="owner"]');
  if (!a.endDate) return err('Isi deadline.', '[data-as="endDate"]');
  const end = L.at(a.endDate, a.endTime || '18:00');
  if (!b.taskId && end && end < new Date()) return err('Deadline sudah lewat. Pilih tanggal/jam yang akan datang.', '[data-as="endDate"]');
  const btn = $('#soc-go'); if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
  if (E.creating) { try { await E.creating; } catch (e) { return; } }
  while (E.saving) await sleep(150);
  if (S.bEdit !== E) return;
  clearTimeout(E.timer); E.dirty = false; E.saving = true;
  const snap = JSON.parse(JSON.stringify(b)), person = socPeople().find((u) => u.username === a.owner) || {};
  const prev = { taskId: b.taskId, owner: b.owner, status: b.status }, isNew = !b.taskId;
  let tmpTask = null;
  if (isNew) {
    const now = new Date();
    tmpTask = { id: 'tmp-' + Date.now(), owner: a.owner, ownerName: person.name || a.owner, task: d.title.trim(), type: 'Sosmed', status: 'Backlog', code: a.code || '',
      startDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, startTime: '09:00', endDate: a.endDate, endTime: a.endTime || '18:00', priority: a.priority || 'Medium',
      results: [], resultNote: '', notes: '', startedAt: '', doneAt: '', reviewAt: '', stage: 0, stageLog: [] };
    upsertTaskLocal(tmpTask);
    Object.assign(b, { taskId: tmpTask.id, owner: a.owner, status: 'Ditugaskan' });
    E.reassign = false; renderSocAssign(); socRefreshStatus();
    toast(`Ditugaskan ke ${person.name || a.owner}. Task-nya dibuat.`);
  } else toast('Menyimpan penugasan…');
  const wasNew = !!E.isNew;
  E.creating = api.call('saveSocialBrief', { brief: { id: wasNew ? undefined : snap.id, data: snap.data, baseUpdatedAt: wasNew ? undefined : snap.updatedAt, assign: Object.assign({}, a) } })
    .then((r) => {
      if (wasNew) { E.isNew = false; E.id = r.brief.id; b.id = r.brief.id; b.createdAt = r.brief.createdAt; }
      if (tmpTask) removeTaskLocal(tmpTask.id);
      if (r.task) upsertTaskLocal(Object.assign({}, r.task, { ownerName: person.name || r.task.ownerName }));
      Object.assign(b, { taskId: r.brief.taskId, owner: r.brief.owner, status: r.brief.status, statusAt: r.brief.statusAt, updatedAt: r.brief.updatedAt, updatedBy: r.brief.updatedBy });
      E.savedAt = new Date(); E.reassign = false;
      putBrief(Object.assign({}, r.brief, { data: JSON.parse(JSON.stringify(b.data)) }));
      if (r.projects) syncProjects([r.task && r.task.code], r.projects);
      if (!isNew) toast('Penugasan disimpan');
      if (S.bEdit === E && S.view === 'brief') { renderSocAssign(); renderSocActions(); socRefreshStatus(); }
    })
    .catch((e) => {
      if (tmpTask) removeTaskLocal(tmpTask.id);
      Object.assign(b, prev); E.dirty = true;
      if (S.bEdit === E && S.view === 'brief') { E.reassign = !isNew; renderSocAssign(); socRefreshStatus(); }
      toast((isNew ? 'Gagal menugaskan: ' : 'Penugasan gagal disimpan: ') + cleanErr(e), true);
    })
    .finally(() => {
      E.creating = null; E.saving = false;
      const el = $('#bsave'); if (el && S.view === 'brief') el.textContent = saveText();
      saveCache();
      if (E.dirty && !E.error) { clearTimeout(E.timer); E.timer = setTimeout(briefSave, 2500); }
    });
}
function socRefreshStatus() {
  const el = $('#bstatus'); if (!el || !S.bEdit) return;
  const [st, cls] = socStatus(S.bEdit.b); el.className = 'bstat ' + cls; el.textContent = st;
}
function taskLists() { return [S.mine.tasks, S.all && S.all.tasks, S.team && S.team.tasks].filter(Boolean); }
function upsertTaskLocal(t) {
  if (S.mine.tasks) S.mine.tasks = S.mine.tasks.filter((x) => x.id !== t.id).concat(t.owner === S.user.username ? [t] : []);
  if (S.all) S.all.tasks = S.all.tasks.filter((x) => x.id !== t.id).concat(t);
  if (S.team) S.team.tasks = S.team.tasks.filter((x) => x.id !== t.id).concat(t);
}
function removeTaskLocal(id) {
  S.mine.tasks = S.mine.tasks.filter((x) => x.id !== id);
  if (S.all) S.all.tasks = S.all.tasks.filter((x) => x.id !== id);
  if (S.team) S.team.tasks = S.team.tasks.filter((x) => x.id !== id);
}

async function socDelete() {
  const E = S.bEdit, b = E.b, t = b.taskId && briefTask(b);
  const untouched = t && t.status === 'Backlog' && !t.startedAt;
  const msg = `Brief "${bKw(b) || 'tanpa judul'}" akan dihapus.` + (untouched ? ` Task ${t.ownerName} yang belum dimulai ikut terhapus.` : t ? ' Task-nya tidak ikut terhapus.' : '');
  if (!(await confirmBox('Hapus brief sosmed?', msg))) return;
  try {
    const r = await busy($('#sdel'), () => api.call('deleteBrief', { briefId: E.id }));
    S.briefs = S.briefs.filter((x) => x.id !== E.id);
    if (r && r.taskDeleted) removeTaskLocal(r.taskId);
    S.bEdit = null; saveCache();
    toast(r && r.taskDeleted ? 'Brief & task-nya dihapus' : 'Brief dihapus');
    S.bf.kind = 'sosmed'; go('briefs');
  } catch (err) { /* busy sudah menampilkan pesan */ }
}

/** Tombol ↗ (buka link) muncul begitu isian referensi berupa link. */
function refArrow(input) {
  const row = input.parentElement, v = input.value.trim();
  let a = $('a.ibtn', row);
  if (isHttp(v)) {
    if (!a) { a = document.createElement('a'); a.className = 'ibtn'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Buka'; a.setAttribute('aria-label', 'Buka referensi'); a.textContent = '↗'; input.after(a); }
    a.href = v;
  } else if (a) a.remove();
}
function socLive() {
  const d = S.bEdit.b.data;
  if ($('#soc-cap')) $('#soc-cap').innerHTML = capText(d);
  if ($('#soc-total')) $('#soc-total').innerHTML = totalText(d);
  if ($('#soc-ttl')) $('#soc-ttl').textContent = d.title || 'Brief sosmed baru';
  $('#view-title').textContent = d.title || 'Brief sosmed';
}

function bindSocialEditor(edit) {
  const E = S.bEdit, d = E.b.data, root = $('#bmain');
  $('#bback').onclick = () => { S.bf.kind = 'sosmed'; go('briefs'); };
  if ($('#breload')) $('#breload').onclick = async () => { E.dirty = false; E.error = ''; await loadData(true); S.bEdit = null; openBrief(E.id); };
  // penugasan juga boleh diisi oleh pembuat walau isi brief terkunci (admin/pembuat selalu bisa edit, jadi cukup cek edit)
  if (!edit) return;
  const list = () => d[d.format === 'Video' ? 'scenes' : 'slides'];
  root.addEventListener('input', (e) => {
    const el = e.target, ds = el.dataset;
    if (ds.k) d[ds.k] = el.value;
    else if (ds.sl !== undefined && ds.ref !== undefined) { list()[+ds.sl].refs[+ds.ref] = el.value; refArrow(el); }
    else if (ds.sl !== undefined && ds.f) list()[+ds.sl][ds.f] = ds.f === 'dur' ? (el.value === '' ? '' : Math.max(0, Number(el.value) || 0)) : el.value;
    else if (ds.as) { d.assign[ds.as] = el.value; if ($('#soc-err')) $('#soc-err').innerHTML = ''; }
    else return;
    markDirty(); socLive();
  });
  root.addEventListener('change', (e) => {
    const el = e.target, ds = el.dataset;
    if (ds.plat !== undefined || ds.size !== undefined) {
      const k = ds.plat !== undefined ? 'platforms' : 'sizes', v = ds.plat !== undefined ? ds.plat : ds.size;
      const set = new Set(d[k]); el.checked ? set.add(v) : set.delete(v); d[k] = [...set];
      el.closest('.cpick').classList.toggle('on', el.checked);
      markDirty();
      if (k === 'platforms') { $('#soc-sizes').innerHTML = sizeChips(d, ''); socLive(); }
    }
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target, ds = el.dataset;
    if ((ds.platin || ds.sizein) && e.key === 'Enter') {
      e.preventDefault();
      const v = el.value.trim(); if (!v) return;
      const k = ds.platin ? 'platforms' : 'sizes';
      if (!d[k].some((x) => x.toLowerCase() === v.toLowerCase())) d[k].push(v);
      markDirty(); rerenderBrief(ds.platin ? '[data-platin]' : '[data-sizein]');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); briefSave(); }
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const ds = b.dataset, items = list();
    if (ds.sfmt) {
      if (d.format === ds.sfmt) return;
      d.format = ds.sfmt;
      // ukuran yang tidak cocok untuk bentuk baru diganti ukuran rekomendasi
      const ok = new Set(); (d.platforms.length ? d.platforms : SOC_PLATFORMS).forEach((p) => ((SOC_SIZES[p] || {})[d.format] || []).forEach((x) => ok.add(x)));
      if (!d.sizes.some((x) => ok.has(x))) d.sizes = [SOC_DEFAULT_SIZE[d.format]];
      markDirty(); rerenderBrief(`[data-sfmt="${ds.sfmt}"]`);
    } else if (ds.sadd) {
      items.push(d.format === 'Video' ? blankScene() : blankSlide());
      markDirty(); rerenderBrief(`[data-sl="${items.length - 1}"][data-f="${d.format === 'Video' ? 'visual' : 'text'}"]`);
    } else if (ds.srm !== undefined) {
      const x = items[+ds.srm];
      const filled = x && (String(x.text || '') + x.visual + (x.audio || '') + x.refs.join('')).trim();
      const go2 = () => { items.splice(+ds.srm, 1); if (!items.length) items.push(d.format === 'Video' ? blankScene() : blankSlide()); markDirty(); rerenderBrief(); };
      if (filled) confirmBox('Hapus ' + (d.format === 'Video' ? 'scene' : 'slide') + ' ' + (+ds.srm + 1) + '?', 'Isinya akan hilang.').then((ok) => ok && go2());
      else go2();
    } else if (ds.smv !== undefined) {
      const i = +ds.smv, j = i + (+ds.dir);
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]]; markDirty(); rerenderBrief(`[data-smv="${j}"][data-dir="${ds.dir}"]`);
    } else if (ds.addref !== undefined) {
      const x = items[+ds.addref]; x.refs.push('');
      markDirty(); rerenderBrief(`[data-sl="${ds.addref}"][data-ref="${x.refs.length - 1}"]`);
    } else if (ds.rmref !== undefined) { items[+ds.rmref].refs.splice(+ds.k, 1); markDirty(); rerenderBrief(); }
  });
}

// ---------- notifikasi untuk pembuat brief ----------
/** Dipanggil setiap data dimuat: konten dari brief saya yang baru disetujui admin → toast + tanda di menu Brief. */
function socialNotify() {
  if (!S.user || !S.cfg) return;
  const key = 'pt.socSeen.' + (S.cfg.demo ? 'demo.' : '') + S.user.username;
  let seen = null;
  try { seen = localStorage.getItem(key); } catch (e) { /* abaikan */ }
  const done = (S.briefs || []).filter((b) => isSocial(b) && b.createdBy === S.user.username && b.status === 'Selesai' && b.statusAt && b.owner !== S.user.username);
  const t = (x) => new Date(x).getTime() || 0;
  const latest = done.reduce((m, b) => Math.max(m, t(b.statusAt)), seen ? t(seen) : 0);
  const save = (v) => { try { localStorage.setItem(key, new Date(v).toISOString()); } catch (e) { /* abaikan */ } };
  if (!seen) { save(latest || Date.now()); return; }   // pertama kali: tidak membanjiri notifikasi lama
  const fresh = done.filter((b) => t(b.statusAt) > t(seen));
  if (!fresh.length) return;
  save(latest);
  S.socNew = S.socNew || new Set();
  fresh.forEach((b) => S.socNew.add(b.id));
  setTimeout(() => {
    toast(fresh.length === 1 ? `✅ Konten “${bKw(fresh[0])}” sudah dikerjakan ${nameOf(fresh[0].owner)} dan disetujui admin.` : `✅ ${fresh.length} konten dari brief Anda sudah disetujui admin.`);
    if (S.user) renderNav();
  }, 700);
  if (api.notify) { try { api.notify('Konten sosmed disetujui', fresh.map((b) => bKw(b)).join(', ')); } catch (e) { /* abaikan */ } }
}

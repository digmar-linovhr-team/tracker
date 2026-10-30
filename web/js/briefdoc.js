/* Tampilan dokumen (baca saja) untuk brief yang sedang/sudah direview, atau yang tidak bisa diubah pengguna ini.
 * Brief artikel: tahap ≥ 3 (diajukan ke admin). Brief sosmed: Direview / Selesai, atau bukan pembuat/penanggung jawab/admin. */
'use strict';

const txtHtml = (v) => esc(String(v == null ? '' : v).trim()).replace(/\n/g, '<br>');
const filled = (v) => String(v == null ? '' : v).trim() !== '';
function linkHtml(u, label) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!isHttp(u)) return esc(label || u);
  let host = u; try { host = new URL(u).hostname.replace(/^www\./, '') + new URL(u).pathname.replace(/\/$/, ''); } catch (e) { /* biarkan */ }
  return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || host)}</a>`;
}
function docSec(title, inner) { return inner ? `<section class="bdoc-sec"><h2>${esc(title)}</h2>${inner}</section>` : ''; }

/** Mode baca (dokumen) atau Mode ubah (formulir).
 * Dokumen: bila pengguna tidak boleh mengubah, memilih Mode baca, brief artikel sudah diajukan (tahap ≥ 3),
 * atau admin membuka brief tulisan orang lain. */
function briefDocMode(b) {
  const E = S.bEdit;
  if (E && E.forceEdit) return false;
  if (!canEditBrief(b)) return true;
  if (E && E.readMode) return true;
  const t = briefTask(b);
  if (t && L.isArticle(t) && artStage(t) >= 3) return true;
  return S.user.role === 'admin' && !!t && t.owner !== S.user.username;
}
function socialDocMode(b) {
  const E = S.bEdit;
  if (E && E.forceEdit) return false;
  if (!canEditSocial(b)) return true;
  if (E && E.readMode) return true;
  if (['Direview', 'Selesai'].includes(socStatus(b)[0])) return true;
  return S.user.role === 'admin' && b.createdBy !== S.user.username;
}

/** Bilah di atas brief: pindah Mode baca / Mode ubah + Salin teks (saat membaca). */
function docBar(edit, reading) {
  if (!edit && !reading) return '';
  return `<div class="dv-bar">${edit ? `<div class="dv-seg" role="tablist" aria-label="Tampilan brief"><button type="button" role="tab" data-dvmode="read" class="${reading ? 'on' : ''}" aria-selected="${reading}">Mode baca</button><button type="button" role="tab" data-dvmode="edit" class="${reading ? '' : 'on'}" aria-selected="${!reading}">Mode ubah</button></div>` : ''}
    <span class="dv-sp"></span>${reading ? '<button type="button" class="btn sm" id="dv-copy" title="Salin seluruh brief — bisa ditempel ke Google Docs atau email dengan format rapi">Salin teks</button>' : ''}</div>`;
}
function bindDocBar(rerender) {
  const E = S.bEdit;
  $$('[data-dvmode]').forEach((b) => b.onclick = () => {
    if (!E) return;
    if (b.dataset.dvmode === 'read') { E.forceEdit = false; E.readMode = true; } else { E.forceEdit = true; E.readMode = false; }
    rerender();
  });
  const c = $('#dv-copy');
  if (c) c.onclick = async () => {
    const el = $('.dv'); if (!el) return;
    const clone = el.cloneNode(true);
    $$('#soc-assign, .dv-noprint', clone).forEach((x) => x.remove());
    const html = clone.innerHTML, text = clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
    try {
      if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(text);
      toast('Brief disalin — tempel di Google Docs atau email');
    } catch (e) {
      try { await navigator.clipboard.writeText(text); toast('Brief disalin sebagai teks'); } catch (e2) { toast('Browser menolak menyalin. Pilih teks lalu tekan Ctrl/⌘ + C.', true); }
    }
  };
}

const fv = (v) => String(v == null ? '' : v).trim();
const hostOf = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, ''); } catch (e) { return u; } };
function dvLink(u, label) {
  u = fv(u);
  if (!u) return '';
  if (!isHttp(u)) return esc(label || u);
  return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || hostOf(u))}</a>`;
}

/** Brief artikel sebagai satu dokumen utuh yang enak dibaca. */
function articleDocHtml(b, task) {
  const d = b.data, srcs = [];
  const cite = (list) => (list || []).filter(filled).map((x) => { srcs.push(x); return `<sup>${srcs.length}</sup>`; }).join('');
  const secs = d.sections.filter((s) => filled(s.h2) || filled(s.points) || s.h3.some((h) => filled(h.title) || filled(h.points)));
  const faq = d.faq.filter((f) => filled(f.q));
  const comps = d.competitors.filter((c) => filled(c.url) || filled(c.insight));
  const inl = d.internalLinks.filter((l) => filled(l.url)), ext = d.externalLinks.filter((l) => filled(l.url));
  const end = task ? L.schedule(task).end : null;
  const kick = ['Brief artikel', d.contentType, filled(d.wordEst) ? '±' + fv(d.wordEst) + ' kata' : ''].filter(Boolean).map(esc).join(' · ');
  let path = '';
  if (task && isUrl(task.task)) { try { path = new URL(task.task.trim()).pathname.split('/').filter(Boolean).join(' › '); } catch (e) { path = ''; } }
  const body = secs.map((s, i) => `<h3>${i + 1}. ${esc(fv(s.h2) || '(subjudul belum diisi)')}</h3>
      ${filled(s.points) ? `<p>${txtHtml(s.points)}${cite(s.sources)}</p>` : s.sources.some(filled) ? `<p class="dv-muted">Sumber${cite(s.sources)}</p>` : ''}
      ${s.h3.filter((h) => filled(h.title) || filled(h.points)).map((h, j) => `<h4>${i + 1}.${j + 1} ${esc(fv(h.title) || '(tanpa judul)')}</h4>${filled(h.points) ? `<p>${txtHtml(h.points)}</p>` : ''}`).join('')}`).join('');
  return `<div class="dv-wrap">${docBar(canEditBrief(b), true)}<article class="dv">
    <div class="dv-kick">${kick}</div>
    <h1>${esc(fv(d.h1) || '(H1 belum diisi)')}</h1>
    <p class="dv-by">${task ? `Disusun oleh <b>${esc(task.ownerName)}</b>${end ? ' · deadline ' + esc(fmtD(end)) : ''}${isUrl(task.task) ? ` · untuk ${dvLink(task.task, task.task.replace(/^https?:\/\/(www\.)?/, ''))}` : ''}` : ''}</p>
    <div class="dv-sum">
      <div><span>Keyword utama</span><b>${esc(fv(d.kwMain) || '–')}</b></div>
      <div><span>Keyword turunan</span>${esc(d.kwSecondary.join(', ') || '–')}</div>
      <div><span>CTA</span>${filled(d.ctaText) ? '“' + esc(fv(d.ctaText)) + '”' : '–'}${filled(d.ctaPage) ? ' → ' + esc(fv(d.ctaPage)) : ''}</div>
    </div>
    ${filled(d.metaTitle) || filled(d.metaDesc) ? `<div class="dv-serp"><small>Tampilan di Google · meta title ${fv(d.metaTitle).length}/60 · description ${fv(d.metaDesc).length}/155</small>
      <div class="u">www.linovhr.com${path ? ' › ' + esc(path) : ''}</div><div class="tt">${esc(fv(d.metaTitle) || fv(d.h1))}</div><div class="ds">${esc(fv(d.metaDesc))}</div></div>` : ''}
    <h2 class="dv-part">Kerangka artikel</h2>
    ${filled(d.intro) ? `<p class="dv-intro"><em>Pembuka —</em> ${txtHtml(d.intro)}</p>` : ''}
    ${body || '<p class="dv-muted">Belum ada subjudul.</p>'}
    ${faq.length ? `<h3>FAQ</h3>${faq.map((f) => `<p><b>${esc(fv(f.q))}</b>${filled(f.a) ? '<br>' + txtHtml(f.a) : ''}</p>`).join('')}` : ''}
    ${comps.length ? `<h2 class="dv-part">Riset kompetitor</h2>${comps.map((c, i) => `<p><b>${i + 1}. ${dvLink(c.url) || 'tanpa link'}</b>${filled(c.insight) ? ' — ' + txtHtml(c.insight) : ''}</p>`).join('')}` : ''}
    ${inl.length || ext.length ? `<h2 class="dv-part">Link yang dipakai</h2><ul>${inl.map((l) => `<li>Internal: <b>${esc(fv(l.anchor) || '–')}</b> → ${dvLink(l.url, fv(l.url))}</li>`).join('')}${ext.map((l) => `<li>External: <b>${esc(fv(l.anchor) || '–')}</b> → ${dvLink(l.url)}</li>`).join('')}</ul>` : ''}
    ${d.extras.length || filled(d.extraNote) ? `<h2 class="dv-part">Elemen tambahan</h2><p>${esc(d.extras.join(', '))}${d.extras.length && filled(d.extraNote) ? '. ' : ''}${filled(d.extraNote) ? txtHtml(d.extraNote) : ''}</p>` : ''}
    ${srcs.length ? `<div class="dv-foot"><b>Sumber</b><ol>${srcs.map((x) => `<li>${dvLink(x)}</li>`).join('')}</ol></div>` : ''}
  </article></div>`;
}

/** Brief sosmed sebagai dokumen. */
function socialDocHtml(b) {
  const d = b.data, video = d.format === 'Video', items = (video ? d.scenes : d.slides);
  const total = d.scenes.reduce((a, x) => a + (Number(x.dur) || 0), 0);
  const kick = ['Brief sosmed', d.format, video ? items.length + ' scene' + (total ? ' · ' + socDur(total) : '') : items.length + ' slide'].join(' · ');
  return `<div class="dv-wrap">${docBar(canEditSocial(b), true)}<article class="dv">
    <div class="dv-kick">${esc(kick)}</div>
    <h1>${esc(fv(d.title) || '(tanpa judul)')}</h1>
    <p class="dv-by">Dibuat oleh <b>${esc(nameOf(b.createdBy))}</b></p>
    <div class="dv-sum dv-sum2">
      <div><span>Platform</span>${esc(d.platforms.join(', ') || '–')}</div>
      <div><span>Ukuran</span>${esc(d.sizes.join(', ') || '–')}</div>
    </div>
    <h2 class="dv-part">${video ? 'Scene per scene' : 'Isi per slide'}</h2>
    ${items.map((x, i) => {
      const refs = x.refs.filter(filled);
      return video
        ? `<h3>Scene ${i + 1}${filled(x.dur) ? ` <small>· ${esc(fv(x.dur))} detik</small>` : ''}</h3>
          ${filled(x.visual) ? `<p><span class="dv-lbl">Visual</span>${txtHtml(x.visual)}</p>` : ''}${filled(x.audio) ? `<p><span class="dv-lbl">Teks / voice-over</span>${txtHtml(x.audio)}</p>` : ''}
          ${refs.length ? `<p class="dv-muted">Referensi: ${refs.map((r) => dvLink(r)).join(' · ')}</p>` : ''}`
        : `<h3>Slide ${i + 1}${i === 0 ? ' <small>· cover</small>' : ''}</h3>
          ${filled(x.text) ? `<p class="dv-quote">${txtHtml(x.text)}</p>` : ''}${filled(x.visual) ? `<p><span class="dv-lbl">Visual</span>${txtHtml(x.visual)}</p>` : ''}
          ${refs.length ? `<p class="dv-muted">Referensi: ${refs.map((r) => dvLink(r)).join(' · ')}</p>` : ''}`;
    }).join('')}
    <h2 class="dv-part">Caption</h2>
    ${filled(d.caption) ? `<blockquote class="dv-cap">${txtHtml(d.caption)}</blockquote><p class="dv-muted">${String(d.caption).length.toLocaleString('id-ID')} karakter</p>` : '<p class="dv-muted">Belum ada caption.</p>'}
    ${filled(d.notes) ? `<h2 class="dv-part">Catatan untuk desainer</h2><p>${txtHtml(d.notes)}</p>` : ''}
    <div class="dv-noprint"><h2 class="dv-part">Penugasan</h2><div id="soc-assign"></div></div>
  </article></div>`;
}

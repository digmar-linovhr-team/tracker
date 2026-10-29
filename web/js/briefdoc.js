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

/** Brief artikel ditampilkan sebagai dokumen bila sudah diajukan (tahap ≥ 3) atau pengguna tidak boleh mengubahnya. */
function briefDocMode(b) {
  const E = S.bEdit;
  if (E && E.forceEdit) return false;
  if (!canEditBrief(b)) return true;
  const t = briefTask(b);
  return !!(t && L.isArticle(t) && L.stageOf(t) >= 3);
}

function articleDocHtml(b, task) {
  const d = b.data;
  const meta = [d.contentType, filled(d.wordEst) ? '±' + d.wordEst + ' kata' : ''].filter(Boolean).join(' · ');
  const comps = d.competitors.filter((c) => filled(c.url) || filled(c.insight));
  const secs = d.sections.filter((s) => filled(s.h2) || filled(s.points) || s.h3.length);
  const links = (list) => list.filter((l) => filled(l.url));
  const faq = d.faq.filter((f) => filled(f.q));
  return `<article class="card bdoc">
    <header class="bdoc-head">
      <div class="bdoc-kicker">Brief artikel${meta ? ' · ' + esc(meta) : ''}</div>
      <h1>${esc(d.h1 || '(H1 belum diisi)')}</h1>
      <dl class="bdoc-kv">
        <dt>Keyword utama</dt><dd><b>${esc(d.kwMain || '–')}</b></dd>
        ${d.kwSecondary.length ? `<dt>Keyword turunan</dt><dd><div class="bdoc-tags">${d.kwSecondary.map((k) => `<span>${esc(k)}</span>`).join('')}</div></dd>` : ''}
        ${task ? `<dt>Penulis</dt><dd>${esc(task.ownerName)}${L.schedule(task).end ? ' · deadline ' + esc(fmtD(L.schedule(task).end)) : ''}</dd>` : ''}
      </dl>
    </header>
    ${docSec('Meta', filled(d.metaTitle) || filled(d.metaDesc) ? `<div class="serp-prev">${serpPreview(d, task)}</div>
      <p class="bdoc-note">Meta title ${String(d.metaTitle || '').length}/60 · meta description ${String(d.metaDesc || '').length}/155 karakter</p>` : '')}
    ${docSec('Analisis kompetitor', comps.length ? `<ol class="bdoc-comp">${comps.map((c) => `<li><div>${linkHtml(c.url) || '<span class="muted">tanpa link</span>'}</div>${filled(c.insight) ? `<p>${txtHtml(c.insight)}</p>` : ''}</li>`).join('')}</ol>` : '')}
    ${docSec('Struktur artikel', `
      ${filled(d.intro) ? `<div class="bdoc-h"><span class="lvl">Intro</span><b>Introduction</b></div><p class="bdoc-p">${txtHtml(d.intro)}</p>` : ''}
      ${secs.map((s) => `<div class="bdoc-h2">
        <div class="bdoc-h"><span class="lvl">H2</span><b>${esc(s.h2 || '(tanpa judul)')}</b></div>
        ${filled(s.points) ? `<p class="bdoc-p">${txtHtml(s.points)}</p>` : ''}
        ${s.h3.filter((h) => filled(h.title) || filled(h.points)).map((h) => `<div class="bdoc-h3"><div class="bdoc-h"><span class="lvl">H3</span><b>${esc(h.title || '(tanpa judul)')}</b></div>${filled(h.points) ? `<p class="bdoc-p">${txtHtml(h.points)}</p>` : ''}</div>`).join('')}
        ${s.sources.filter(filled).length ? `<div class="bdoc-src">Sumber: ${s.sources.filter(filled).map((x) => linkHtml(x)).join(' · ')}</div>` : ''}
      </div>`).join('') || '<p class="muted">Belum ada H2.</p>'}`)}
    ${docSec('CTA', filled(d.ctaPage) || filled(d.ctaText) ? `<p class="bdoc-p">${filled(d.ctaText) ? '“' + esc(d.ctaText) + '”' : ''}${filled(d.ctaPage) ? ` → <b>${esc(d.ctaPage)}</b>` : ''}</p>` : '')}
    ${docSec('Link', links(d.internalLinks).length || links(d.externalLinks).length ? `<div class="bdoc-links">
      ${links(d.internalLinks).length ? `<div><h3>Internal</h3><ul>${links(d.internalLinks).map((l) => `<li>${esc(l.anchor || '–')} → ${linkHtml(l.url, l.url)}</li>`).join('')}</ul></div>` : ''}
      ${links(d.externalLinks).length ? `<div><h3>External</h3><ul>${links(d.externalLinks).map((l) => `<li>${esc(l.anchor || '–')} → ${linkHtml(l.url)}</li>`).join('')}</ul></div>` : ''}</div>` : '')}
    ${docSec('FAQ', faq.length ? faq.map((f, i) => `<div class="bdoc-faq"><b>${i + 1}. ${esc(f.q)}</b>${filled(f.a) ? `<p>${txtHtml(f.a)}</p>` : ''}</div>`).join('') : '')}
    ${docSec('Extra feature', d.extras.length || filled(d.extraNote) ? `${d.extras.length ? `<div class="bdoc-tags">${d.extras.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}${filled(d.extraNote) ? `<p class="bdoc-p">${txtHtml(d.extraNote)}</p>` : ''}` : '')}
  </article>`;
}

/** Brief sosmed sebagai dokumen. */
function socialDocMode(b) {
  const E = S.bEdit;
  if (E && E.forceEdit) return false;
  if (!canEditSocial(b)) return true;
  return ['Direview', 'Selesai'].includes(socStatus(b)[0]);
}
function socialDocHtml(b) {
  const d = b.data, video = d.format === 'Video', items = (video ? d.scenes : d.slides);
  const refs = (x) => x.refs.filter(filled);
  const total = d.scenes.reduce((a, x) => a + (Number(x.dur) || 0), 0);
  return `<article class="card bdoc">
    <header class="bdoc-head">
      <div class="bdoc-kicker">Brief sosmed · ${esc(d.format)} · ${video ? items.length + ' scene' + (total ? ' · ' + socDur(total) : '') : items.length + ' slide'}</div>
      <h1>${esc(d.title || '(tanpa judul)')}</h1>
      <dl class="bdoc-kv">
        <dt>Platform</dt><dd>${d.platforms.length ? `<div class="bdoc-tags">${d.platforms.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '–'}</dd>
        <dt>Ukuran</dt><dd>${d.sizes.length ? `<div class="bdoc-tags">${d.sizes.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '–'}</dd>
        <dt>Dibuat oleh</dt><dd>${esc(nameOf(b.createdBy))}</dd>
      </dl>
    </header>
    ${docSec(video ? 'Scene per scene' : 'Brief visual per slide', `<div class="bdoc-slides">${items.map((x, i) => `<div class="bdoc-slide">
      <div class="bdoc-h"><span class="lvl">${video ? 'Scene' : 'Slide'} ${i + 1}</span>${video && filled(x.dur) ? `<span class="muted small">${esc(x.dur)} detik</span>` : !video && i === 0 ? '<span class="muted small">cover</span>' : ''}</div>
      <div class="bdoc-2col">
        <div><h3>${video ? 'Visual / adegan' : 'Teks di slide'}</h3><p>${video ? (txtHtml(x.visual) || '–') : (txtHtml(x.text) || '–')}</p></div>
        <div><h3>${video ? 'Teks / voice-over' : 'Visual / gambar'}</h3><p>${video ? (txtHtml(x.audio) || '–') : (txtHtml(x.visual) || '–')}</p></div>
      </div>
      ${refs(x).length ? `<div class="bdoc-src">Referensi: ${refs(x).map((r) => linkHtml(r)).join(' · ')}</div>` : ''}
    </div>`).join('')}</div>`)}
    ${docSec('Caption', filled(d.caption) ? `<blockquote class="bdoc-cap">${txtHtml(d.caption)}</blockquote><p class="bdoc-note">${String(d.caption).length.toLocaleString('id-ID')} karakter</p>` : '<p class="muted">Belum ada caption.</p>')}
    ${docSec('Catatan untuk desainer', filled(d.notes) ? `<p class="bdoc-p">${txtHtml(d.notes)}</p>` : '')}
    ${docSec('Penugasan', '<div id="soc-assign"></div>')}
  </article>`;
}

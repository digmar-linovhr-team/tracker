/* Penilaian Claude untuk task artikel: brief (tahap 2), draft (tahap 4), halaman live (tahap 7).
 * Server (Apps Script) memanggil Claude API; hasil tersimpan di task (aiBrief / aiDraft / aiLive) dan tampil di panel task,
 * halaman Review, dan Pengaturan admin. Setiap tahap 1× pengecekan; "Cek perbaikan" memverifikasi saran pada versi terbaru.
 * Memakai fungsi & state dari app.js, detail.js, article.js. */
'use strict';

const AI_STAGES = [['brief', 'Brief', 'aiBrief'], ['draft', 'Draft', 'aiDraft'], ['live', 'Halaman live', 'aiLive']];
const AI_ST_ICON = { ok: '✓', part: '◐', no: '✗', na: '⊘', open: '•' };
const AI_ST_LBL = { ok: 'Diperbaiki', part: 'Sebagian', no: 'Belum', na: 'Tidak relevan', open: 'Belum dicek' };
const AI = { tab: {}, busy: {}, cfg: null };
const aiField = (st) => (AI_STAGES.find((x) => x[0] === st) || [])[2];
const aiName = (st) => (AI_STAGES.find((x) => x[0] === st) || [])[1];
const aiModelName = (m) => /haiku/.test(m || '') ? 'Claude Haiku' : /opus/.test(m || '') ? 'Claude Opus' : 'Claude Sonnet';

function aiEnabled() { return !!(S.cfg && (S.cfg.backend === 'firebase' || S.cfg.demo)); }
function aiConfig() {
  if (!AI.cfg) AI.cfg = api.call('aiConfig', {}).catch(() => ({ gate: true, pass: { brief: 70, draft: 75, live: 80 } }));
  return AI.cfg;
}
/** Tahap yang relevan dengan posisi task sekarang. */
function aiStageNow(t) { const st = artStage(t); return st <= 3 ? 'brief' : st <= 5 ? 'draft' : 'live'; }
/** Bisakah tahap ini diperiksa sekarang? Hasil: '' = bisa, atau alasan. */
function aiBlocked(t, stage) {
  const st = artStage(t);
  if (stage === 'brief') return briefOf(t.id) ? '' : 'Buat brief dulu (tahap 2).';
  if (stage === 'draft') {
    if (st < 4) return 'Bisa diperiksa setelah brief disetujui (tahap 4).';
    return (resultsOf(t).some((r) => /docs\.google\.com\/document\/d\//.test(r.url))) ? '' : 'Tempel link Google Docs draft di Hasil kerja dulu.';
  }
  if (st < 7 && !t.liveUrl) return 'Bisa diperiksa setelah artikel dipublish (tahap 7).';
  return t.liveUrl ? '' : 'Isi URL artikel live dulu (tombol Sudah publish).';
}
const aiCanRun = (t) => S.user.role === 'admin' || t.owner === S.user.username;
function aiProgress(rv) { const n = (rv.suggestions || []).length; return n ? (rv.fixed || 0) / n : 1; }
/** Boleh mengajukan? Lulus skor, atau ≥ 80% saran beres. */
function aiGateState(t, stage) {
  if (stage === 'brief') { const why = window.PTDemo.aiBriefGateMsg(t); return why ? { ok: false, msg: why } : { ok: true }; }
  const rv = t[aiField(stage)];
  if (!rv) return { ok: false, msg: `Jalankan "Cek dengan AI" untuk ${aiName(stage).toLowerCase()} dulu.` };
  if (rv.pass) return { ok: true };
  const p = aiProgress(rv);
  if (p >= 0.8) return { ok: true };
  return { ok: false, msg: `Skor ${rv.score} masih di bawah ambang ${rv.passMark}, dan baru ${rv.fixed || 0} dari ${(rv.suggestions || []).length} saran yang beres (perlu ≥ 80%). Perbaiki lalu klik "Cek perbaikan".` };
}

// ---------- tampilan di panel task ----------
function aiSection(t) {
  if (!aiEnabled() || !L.isArticle(t) || !t.id) return '';
  const cur = AI.tab[t.id] || aiStageNow(t);
  const tabs = AI_STAGES.map(([k, l, f]) => { const rv = t[f]; const tag = rv ? `${rv.score}${rv.pass ? ' ✓' : ''}` : k === aiStageNow(t) ? 'belum' : '–';
    return `<button type="button" class="ai-tabb ${k === cur ? 'on' : ''} ${rv ? (rv.pass ? 'good' : 'warn') : ''}" data-aitab="${k}">${l} · ${tag}</button>`; }).join('');
  return `<section class="dp-sec" id="ai-sec"><h3>Penilaian Claude</h3><div class="ai-tabs">${tabs}</div>${aiCard(t, cur)}</section>`;
}
function aiCard(t, stage) {
  const rv = t[aiField(stage)], busy = AI.busy[t.id + stage], can = aiCanRun(t), admin = S.user.role === 'admin', id = esc(t.id);
  if (!rv) {
    const why = aiBlocked(t, stage);
    const src = stage === 'brief' ? 'isi brief' : stage === 'draft' ? 'Google Doc draft di Hasil kerja (dibandingkan dengan brief yang disetujui)' : 'halaman live di linovhr.com';
    return `<div class="ai-card"><div class="ai-h"><div class="ai-ring" style="--p:0"><span>–</span></div>
      <div class="ai-ht"><b>${esc(aiName(stage))} belum diperiksa</b><small>Claude membaca ${src} lalu menilai sesuai Standar SEO Artikel LinovHR. 1× pengecekan per tahap.</small></div></div>
      ${can ? `<div class="ai-act"><button class="btn primary" data-aicheck="${stage}" ${why || busy ? 'disabled' : ''}>${busy ? 'Claude sedang membaca…' : 'Cek dengan AI'}</button><span class="muted small">${esc(why || (busy ? 'biasanya 30–90 detik' : '±1 menit'))}</span></div>` : '<p class="muted small" style="margin:6px 0 0">Penanggung jawab task yang menjalankan pengecekan.</p>'}</div>`;
  }
  const p = Math.max(0, Math.min(100, rv.score)), n = (rv.suggestions || []).length, mine = t.owner === S.user.username;
  const crit = (rv.criteria || []).map((c) => { const r = c.max ? c.score / c.max : 1; return `<span title="${esc(c.note || '')}">${esc(c.name)}${c.mode === 'auto' ? '<span class="ai-auto">otomatis</span>' : ''}</span><span class="ai-bar"><i class="${r < 0.5 ? 'low' : r < 0.75 ? 'mid' : ''}" style="width:${r * 100}%"></i></span><span class="ai-n">${c.score}/${c.max}</span>`; }).join('');
  const sug = (rv.suggestions || []).map((s) => `<div class="ai-s">
      <span class="ai-st st-${esc(s.status)}" title="${esc(AI_ST_LBL[s.status] || '')}">${AI_ST_ICON[s.status] || '•'}</span>
      <span class="ai-t"><em>${esc(s.loc || '')}</em>${esc(s.text)}${s.quote ? `<q>${esc(s.quote)}</q>` : ''}${s.why ? `<span class="ai-why">${esc(s.why)}</span>` : ''}</span>
      ${(mine || admin) && s.status !== 'ok' ? (s.status === 'na' ? `<button type="button" class="linkbtn ai-mk" data-aiundo="${esc(s.id)}">Batalkan</button>` : `<button type="button" class="linkbtn ai-mk" data-aina="${esc(s.id)}">Tidak relevan</button>`) : ''}</div>`).join('');
  const mf = (rv.mustFail || []).map((k) => ((rv.criteria || []).find((c) => c.key === k) || {}).name || k);
  const when = rv.at ? cmWhen(rv.at) : '';
  return `<div class="ai-card">
    <div class="ai-h"><div class="ai-ring ${rv.pass ? 'good' : ''}" style="--p:${p}"><span>${rv.score}</span></div>
      <div class="ai-ht"><b>${esc(aiName(stage))} ${rv.pass ? 'lulus' : 'belum lulus'} <span class="ai-tag ${rv.pass ? 'good' : ''}">ambang ${rv.passMark}</span></b>
      <small>Diperiksa ${esc(aiModelName(rv.model))} · ${esc(when)} · ${rv.checks || 1}× pengecekan${rv.source ? ` · <a href="${esc(rv.source)}" target="_blank" rel="noopener">sumber</a>` : ''}</small></div></div>
    ${rv.summary ? `<p class="ai-sum">${esc(rv.summary)}</p>` : ''}
    ${mf.length ? `<div class="ai-must">Kriteria wajib belum terpenuhi: <b>${esc(mf.join(', '))}</b></div>` : ''}
    <div class="ai-crit">${crit}</div>
    ${n ? `<div class="ai-sh">Saran perbaikan <span class="ai-prog">· ${rv.fixAt ? `${rv.fixed || 0} dari ${n} sudah beres (Cek perbaikan ${esc(cmWhen(rv.fixAt))})` : `${n} saran`}</span></div>${sug}` : '<p class="muted small">Tidak ada saran perbaikan.</p>'}
    <div class="ai-act">
      ${(mine || admin) && n ? `<button class="btn" data-aifix="${stage}" ${busy ? 'disabled' : ''}>${busy ? 'Memeriksa…' : 'Cek perbaikan'}</button>` : ''}
      ${rv.allowRecheck && (mine || admin) ? `<button class="btn primary" data-aicheck="${stage}" ${busy ? 'disabled' : ''}>Cek ulang dengan AI</button>` : ''}
      ${admin && !rv.allowRecheck ? `<button class="btn ghost" data-aiallow="${stage}">Izinkan cek ulang</button>` : ''}
      ${rv.allowRecheck ? '<span class="muted small">Admin mengizinkan cek ulang.</span>' : ''}
    </div>
    ${stage === 'brief' && n ? `<div class="ai-note">Brief bisa diajukan setelah <b>semua</b> saran beres — diperbaiki (lalu klik "Cek perbaikan") atau ditandai tidak relevan dengan alasan. Sekarang ${rv.fixed || 0} dari ${n}.</div>`
      : !rv.pass && n ? `<div class="ai-note">Bisa diajukan bila skor ≥ ${rv.passMark}, atau ≥ 80% saran sudah diperbaiki / ditandai tidak relevan (sekarang ${Math.round(aiProgress(rv) * 100)}%).</div>` : ''}
  </div>`;
}
function aiBind(root, t) {
  if (!root || !t) return;
  const rerender = () => { if (typeof dpRefresh === 'function') dpRefresh(); };
  $$('[data-aitab]', root).forEach((b) => b.onclick = () => { AI.tab[t.id] = b.dataset.aitab; rerender(); });
  const run = async (btn, action, stage, extra, okMsg) => {
    const key = t.id + stage; if (AI.busy[key]) return;
    AI.busy[key] = true; rerender();
    try {
      const r = await api.call(action, Object.assign({ taskId: t.id, stage }, extra || {}));
      if (r && r.field) patchTask(t.id, { [r.field]: r.review });
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r.review) : okMsg);
    } catch (e) { toast(cleanErr(e), true); }
    finally { delete AI.busy[key]; saveCache(); rerender(); }
  };
  $$('[data-aicheck]', root).forEach((b) => b.onclick = () => run(b, 'aiCheck', b.dataset.aicheck, null, (rv) => `Skor ${rv.score} — ${rv.pass ? 'lulus' : 'belum lulus (ambang ' + rv.passMark + ')'}`));
  $$('[data-aifix]', root).forEach((b) => b.onclick = () => run(b, 'aiFix', b.dataset.aifix, null, (rv) => `${rv.fixed || 0} dari ${rv.suggestions.length} saran sudah beres`));
  $$('[data-aiallow]', root).forEach((b) => b.onclick = () => run(b, 'aiAllow', b.dataset.aiallow, null, 'Cek ulang diizinkan untuk task ini'));
  const stage = AI.tab[t.id] || aiStageNow(t);
  $$('[data-aiundo]', root).forEach((b) => b.onclick = () => run(b, 'aiMark', stage, { sid: b.dataset.aiundo, undo: true }));
  $$('[data-aina]', root).forEach((b) => b.onclick = () => modal({
    title: 'Tandai tidak relevan',
    body: '<p class="muted small" style="margin-top:0">Tulis alasannya. Admin akan melihat alasan ini saat mereview.</p><label class="field"><span>Alasan</span><textarea id="ai-why" rows="3" maxlength="200" placeholder="mis. Tabel ringkasan sudah ada di H2 #2"></textarea></label><div id="ai-err"></div>',
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="ai-ok">Simpan</button>',
    onMount: (m, close) => { $('#ai-why', m).focus(); $('#ai-ok', m).onclick = () => { const v = $('#ai-why', m).value.trim(); if (v.length < 5) { $('#ai-err', m).innerHTML = '<div class="error">Alasan minimal 5 karakter.</div>'; return; } close(); run(null, 'aiMark', stage, { sid: b.dataset.aina, reason: v }); }; }
  }));
}

// ---------- syarat pengajuan di tombol tahap artikel ----------
const AI_STEP_STAGE = { submitBrief: 'brief', submitArticle: 'draft', submitAiCheck: 'live' };
if (typeof artStep === 'function') {
  const artStepOrig = artStep;
  // eslint-disable-next-line no-global-assign
  artStep = async function (id, step) {
    const stage = AI_STEP_STAGE[step], t = findTask(id);
    if (!stage || !t || !aiEnabled() || (step === 'submitBrief' && !briefOf(id))) return artStepOrig(id, step);
    const cfg = await aiConfig();
    if (cfg.gate && S.user.role !== 'admin') {
      const g = aiGateState(t, stage);
      if (!g.ok) {
        return modal({ title: 'Belum bisa diajukan', body: `<p style="margin-top:0">${esc(g.msg)}</p>`,
          actions: '<button class="btn" data-close>Tutup</button><button class="btn primary" id="ai-open">Buka Penilaian Claude</button>',
          onMount: (m, close) => { $('#ai-open', m).onclick = () => { close(); AI.tab[id] = stage; openTask(id); setTimeout(() => { const s = $('#ai-sec'); if (s) s.scrollIntoView({ block: 'start' }); }, 400); }; } });
      }
    }
    // tahap 7: hasil cek AI tersimpan di Project Tracker → tidak perlu link dokumen terpisah
    if (step === 'submitAiCheck' && t.aiLive) {
      const link = location.origin + location.pathname + '#task/' + encodeURIComponent(id);
      return confirmBox('Ajukan hasil cek AI?', `Skor halaman live ${t.aiLive.score} dan checklist perbaikannya dikirim ke admin untuk direview.`, 'Ajukan').then((ok) => ok && advanceStage(id, step, link));
    }
    return artStepOrig(id, step);
  };
}

// ---------- chip ringkas (halaman Review) ----------
function aiChip(t) {
  if (!aiEnabled() || !L.isArticle(t)) return '';
  const st = artStage(t), stage = st === 3 ? 'brief' : st === 5 ? 'draft' : st >= 8 ? 'live' : aiStageNow(t), rv = t[aiField(stage)];
  if (!rv) return `<span class="ai-chip none" title="Belum diperiksa Claude">${esc(aiName(stage))} · belum dicek AI</span>`;
  const n = (rv.suggestions || []).length;
  return `<span class="ai-chip ${rv.pass ? '' : 'warn'}" title="Skor Claude · ambang ${rv.passMark}">${esc(aiName(stage))} ${rv.score}${n ? ` · ${rv.fixed || 0}/${n} diperbaiki` : ''}</span>`;
}

// ---------- kartu di Pengaturan (admin) ----------
async function aiSettingsCard() {
  const box = $('#ai-card'); if (!box) return;
  box.innerHTML = '<div class="card settings-sect"><div class="card-h"><h2>Penilai AI (Claude)</h2></div><div class="card-b"><p class="muted">Memuat…</p></div></div>';
  let st;
  try { st = await api.call('aiStatus', {}); } catch (e) { box.innerHTML = `<div class="card settings-sect"><div class="card-h"><h2>Penilai AI (Claude)</h2></div><div class="card-b"><p class="small" style="color:var(--bad)">${esc(cleanErr(e))}</p></div></div>`; return; }
  if (!$('#ai-card')) return;
  const s = st.settings || {}, u = st.usage || {}, cap = Number(s.cap || 8.5), used = Number(u.cost || 0), pct = Math.min(100, used / (Number(s.budget) || 9) * 100);
  const day = new Date().getDate(), days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), proj = day ? used / day * days : used;
  const models = [['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']];
  const sel = (k) => `<select data-aimodel="${k}">${models.map(([v, l]) => `<option value="${v}" ${s.models && s.models[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  box.innerHTML = `<div class="card settings-sect"><div class="card-h"><h2>Penilai AI (Claude)</h2><span class="chip ${st.keySet ? 'good' : 'bad'}">${st.keySet ? 'Tersambung' : 'Kunci API belum dipasang'}</span></div><div class="card-b">
    <p>Claude menilai brief, draft, dan halaman live artikel sesuai Standar SEO Artikel LinovHR. Kunci API tersimpan di server (Apps Script), tidak pernah di browser.</p>
    ${st.keySet ? '' : '<p class="small" style="color:var(--bad)">Pasang di Apps Script → Project Settings → Script Properties: <b>ANTHROPIC_API_KEY</b>.</p>'}
    <b style="font-size:13px">Pemakaian ${esc(u.month || '')}</b><div class="ai-meter"><i style="width:${pct}%;${used >= cap * 0.8 ? 'background:var(--warn)' : ''}"></i></div>
    <div class="muted small">US$${used.toFixed(2)} dari anggaran US$${Number(s.budget || 9).toFixed(0)} · ${u.count || 0} panggilan · perkiraan akhir bulan US$${proj.toFixed(2)} · berhenti otomatis di US$${cap.toFixed(2)}</div>
    <div class="ai-grid">${AI_STAGES.map(([k, l]) => `<div><b>${l}</b>Ambang <input type="number" min="0" max="100" data-aipass="${k}" value="${esc(String((st.pass || {})[k] || ''))}" class="ai-num"> · 1×${sel(k)}</div>`).join('')}</div>
    <div class="muted small" style="margin:-4px 0 8px">Cek perbaikan memakai ${sel('fix')}</div>
    <label class="check"><input type="checkbox" id="ai-gate" ${s.gate !== false ? 'checked' : ''}> Skor / checklist jadi syarat pengajuan (admin tetap bisa menyetujui apa pun skornya)</label>
    <label class="field" style="max-width:260px;margin-top:8px"><span>Berhenti otomatis di (US$ per bulan)</span><input type="number" step="0.5" min="0" id="ai-cap" value="${cap}"></label>
    <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="ai-save">Simpan setelan</button></div></div></div>`;
  $('#ai-save', box).onclick = async () => {
    const models2 = {}, pass2 = {};
    $$('[data-aimodel]', box).forEach((x) => { models2[x.dataset.aimodel] = x.value; });
    $$('[data-aipass]', box).forEach((x) => { pass2[x.dataset.aipass] = Number(x.value) || 0; });
    try { await busy($('#ai-save', box), () => api.call('aiSettings', { settings: { gate: $('#ai-gate', box).checked, cap: Number($('#ai-cap', box).value) || 0, models: models2, pass: pass2 } })); AI.cfg = null; toast('Setelan Penilai AI disimpan'); aiSettingsCard(); }
    catch (e) { /* busy menampilkan pesan */ }
  };
}

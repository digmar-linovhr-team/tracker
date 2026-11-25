'use strict';
// ---------- Pemilih tanggal & jam milik aplikasi (pengganti kalender/jam bawaan browser & macOS) ----------
// Semua <input type="date"> dan <input type="time"> yang muncul di halaman otomatis diganti:
//  - tanggal: input asli jadi hidden (nama, nilai yyyy-mm-dd, event change tetap sama), tombol pemicu membuka kalender aplikasi
//  - jam: input asli jadi teks jj:mm dengan daftar pilihan jam
// Validasi form (required, url, email, panjang) juga ditampilkan sebagai pesan aplikasi, bukan gelembung bawaan browser.
(function () {
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const nice = (v) => { const d = parse(v); return d ? `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}` : ''; };
  const ICO_CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
  const ICO_CLK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const valDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const labelOf = (el) => { const l = el.closest('label'); const s = l && l.querySelector('span'); return (el.getAttribute('aria-label') || (s && s.textContent) || '').replace(/\s*\*\s*$/, '').trim(); };

  let pop = null, popFor = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } if (popFor) { popFor.setAttribute('aria-expanded', 'false'); popFor = null; } }
  function place(p, anchor) {
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight, vw = innerWidth, vh = innerHeight;
    let left = Math.min(Math.max(8, r.left), vw - w - 8), top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    p.style.left = left + 'px'; p.style.top = Math.max(8, Math.min(top, vh - h - 8)) + 'px';
  }
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && e.target !== popFor && !(popFor && popFor.contains(e.target))) closePop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); const f = popFor; closePop(); if (f) f.focus(); } }, true);
  addEventListener('resize', closePop);
  document.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) closePop(); }, true);

  // ---------- tanggal ----------
  function enhanceDate(inp) {
    if (inp.dataset.dp) return; inp.dataset.dp = '1';
    const req = inp.required, min = inp.min, max = inp.max;
    inp.type = 'hidden'; inp.required = false; if (req) inp.dataset.required = '1';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dp-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    const lbl = labelOf(inp); if (lbl) btn.setAttribute('aria-label', lbl + ': pilih tanggal');
    const draw = () => { const v = valDesc.get.call(inp); btn.innerHTML = `${ICO_CAL}<span>${v ? nice(v) : 'Pilih tanggal'}</span>`; btn.classList.toggle('empty', !v); };
    Object.defineProperty(inp, 'value', { configurable: true, get() { return valDesc.get.call(this); }, set(v) { valDesc.set.call(this, v); draw(); } });
    inp.after(btn); draw();
    const set = (v) => { inp.value = v; btn.classList.remove('invalid'); const e = inp.closest('.field') && inp.closest('.field').querySelector('.field-err'); if (e) e.remove(); fire(inp); };
    btn.onclick = () => {
      if (popFor === btn) { closePop(); return; }
      closePop();
      const sel = parse(inp.value), today = new Date(); today.setHours(0, 0, 0, 0);
      let view = new Date((sel || today).getFullYear(), (sel || today).getMonth(), 1);
      const lo = parse(inp.min || min), hi = parse(inp.max || max);
      const p = document.createElement('div'); p.className = 'dp-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', lbl || 'Pilih tanggal');
      const render = () => {
        const first = (view.getDay() + 6) % 7, days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        let cells = '';
        for (let i = 0; i < first; i++) cells += '<span></span>';
        for (let d = 1; d <= days; d++) {
          const dt = new Date(view.getFullYear(), view.getMonth(), d), iso = isoOf(dt), off = (lo && dt < lo) || (hi && dt > hi);
          cells += `<button type="button" data-d="${iso}" class="${sel && iso === isoOf(sel) ? 'on' : ''} ${+dt === +today ? 'today' : ''} ${dt.getDay() === 0 || dt.getDay() === 6 ? 'wk' : ''}" ${off ? 'disabled' : ''}>${d}</button>`;
        }
        p.innerHTML = `<div class="dp-h"><button type="button" data-m="-1" aria-label="Bulan sebelumnya">‹</button><b>${BULAN[view.getMonth()]} ${view.getFullYear()}</b><button type="button" data-m="1" aria-label="Bulan berikutnya">›</button></div>
          <div class="dp-w">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => `<span>${h}</span>`).join('')}</div>
          <div class="dp-g">${cells}</div>
          <div class="dp-f"><button type="button" data-today>Hari ini</button>${req ? '' : '<button type="button" data-clear>Kosongkan</button>'}</div>`;
        p.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + Number(b.dataset.m), 1); render(); });
        p.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { set(b.dataset.d); closePop(); btn.focus(); });
        const td = p.querySelector('[data-today]'); td.onclick = () => { set(isoOf(today)); closePop(); btn.focus(); };
        if ((lo && today < lo) || (hi && today > hi)) td.disabled = true;
        const cl = p.querySelector('[data-clear]'); if (cl) cl.onclick = () => { set(''); closePop(); btn.focus(); };
      };
      render(); place(p, btn); pop = p; popFor = btn; btn.setAttribute('aria-expanded', 'true');
      const f = p.querySelector('.dp-g .on') || p.querySelector('.dp-g .today') || p.querySelector('.dp-g button:not([disabled])'); if (f) f.focus();
    };
  }

  // ---------- jam ----------
  const normTime = (v) => {
    const s = String(v || '').trim().replace(/[.,]/g, ':'); if (!s) return '';
    let m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s.replace(/\s/g, ''));
    if (!m) return null;
    const h = +m[1], mi = m[2] === undefined ? 0 : +m[2];
    return h < 24 && mi < 60 ? pad(h) + ':' + pad(mi) : null;
  };
  function enhanceTime(inp) {
    if (inp.dataset.tp) return; inp.dataset.tp = '1';
    inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 5; inp.autocomplete = 'off';
    if (!inp.placeholder) inp.placeholder = 'jj:mm';
    inp.classList.add('tp-inp'); inp.setAttribute('aria-haspopup', 'listbox');
    const wrap = document.createElement('span'); wrap.className = 'tp-wrap'; inp.before(wrap); wrap.appendChild(inp);
    wrap.insertAdjacentHTML('beforeend', `<span class="tp-ico">${ICO_CLK}</span>`);
    const open = () => {
      if (popFor === inp) return;
      closePop();
      const cur = normTime(inp.value) || '';
      const list = []; for (let h = 6; h <= 22; h++) for (const m of [0, 30]) list.push(pad(h) + ':' + pad(m));
      if (cur && !list.includes(cur)) { list.push(cur); list.sort(); }
      const p = document.createElement('div'); p.className = 'tp-pop'; p.setAttribute('role', 'listbox');
      p.innerHTML = list.map((t) => `<button type="button" role="option" data-t="${t}" class="${t === cur ? 'on' : ''}" aria-selected="${t === cur}">${t}</button>`).join('');
      p.querySelectorAll('[data-t]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); inp.value = b.dataset.t; inp.classList.remove('invalid'); closePop(); fire(inp); });
      p.style.minWidth = wrap.offsetWidth + 'px';
      place(p, wrap); pop = p; popFor = inp;
      const on = p.querySelector('.on') || p.querySelector('[data-t="09:00"]'); if (on) p.scrollTop = on.offsetTop - p.clientHeight / 2 + 16;
    };
    inp.addEventListener('focus', open); inp.addEventListener('click', open);
    inp.addEventListener('blur', () => {
      setTimeout(() => { if (popFor === inp && document.activeElement !== inp) closePop(); }, 120);
      const n = normTime(inp.value);
      if (n === null) { inp.classList.add('invalid'); return; }
      inp.classList.remove('invalid');
      if (n !== inp.value) { inp.value = n; fire(inp); }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && pop && popFor === inp) { const n = normTime(inp.value); if (n) { inp.value = n; fire(inp); } closePop(); e.preventDefault(); } });
  }

  // ---------- validasi form tanpa gelembung bawaan ----------
  function msgFor(el) {
    const v = el.validity;
    if (v.valueMissing) return 'Wajib diisi.';
    if (v.typeMismatch) return el.type === 'email' ? 'Format email belum benar.' : el.type === 'url' ? 'Link harus diawali http:// atau https://' : 'Formatnya belum benar.';
    if (v.tooShort) return `Minimal ${el.minLength} karakter.`;
    if (v.tooLong) return `Maksimal ${el.maxLength} karakter.`;
    if (v.rangeUnderflow) return `Minimal ${el.min}.`;
    if (v.rangeOverflow) return `Maksimal ${el.max}.`;
    if (v.patternMismatch) return el.title || 'Formatnya belum sesuai.';
    if (v.badInput || v.stepMismatch) return 'Isinya belum benar.';
    return el.validationMessage || 'Isinya belum benar.';
  }
  function showErr(el, msg) {
    const field = el.closest('.field') || el.parentElement; if (!field) return;
    let e = field.querySelector(':scope > .field-err');
    if (!e) { e = document.createElement('small'); e.className = 'field-err'; field.appendChild(e); }
    e.textContent = msg;
    const clear = () => { e.remove(); el.removeEventListener('input', clear); el.removeEventListener('change', clear); };
    el.addEventListener('input', clear); el.addEventListener('change', clear);
  }
  HTMLFormElement.prototype.reportValidity = function () {
    this.querySelectorAll('.field-err').forEach((e) => e.remove());
    const bad = [];
    Array.from(this.elements).forEach((el) => {
      if (el.dataset && el.dataset.required && !String(el.value || '').trim()) { bad.push([el, 'Wajib diisi.']); return; }
      if (el.dataset && el.dataset.tp && el.value && normTime(el.value) === null) { bad.push([el, 'Tulis jam dengan format jj:mm, mis. 09:30.']); return; }
      if (el.willValidate && !el.checkValidity()) bad.push([el, msgFor(el)]);
    });
    bad.forEach(([el, m]) => {
      showErr(el, m);
      const vis = el.nextElementSibling && el.nextElementSibling.matches('.dp-btn, .fpick, .fpick-pill') ? el.nextElementSibling : el;
      vis.classList.add('invalid'); setTimeout(() => vis.classList.remove('invalid'), 2500);
    });
    if (bad.length) {
      const el = bad[0][0], vis = el.nextElementSibling && el.nextElementSibling.matches('.dp-btn, .fpick, .fpick-pill') ? el.nextElementSibling : el;
      try { vis.focus({ preventScroll: true }); } catch (e) { /* */ }
      vis.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return !bad.length;
  };
  // tekan Enter di form: jalankan validasi aplikasi dulu
  document.addEventListener('submit', (e) => { const f = e.target; if (f instanceof HTMLFormElement && !f.reportValidity()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // checkValidity() memicu event "invalid" — jangan biarkan browser menampilkan gelembungnya
  document.addEventListener('invalid', (e) => e.preventDefault(), true);

  // ---------- pasang otomatis ----------
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('form')) root.noValidate = true;
    root.querySelectorAll('form').forEach((f) => { f.noValidate = true; });
    root.querySelectorAll('input[type="date"]').forEach(enhanceDate);
    root.querySelectorAll('input[type="time"]').forEach(enhanceTime);
  }
  const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n.parentElement || n); })));
  const start = () => { scan(document.body); mo.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.PTPickers = { scan, normTime };
})();

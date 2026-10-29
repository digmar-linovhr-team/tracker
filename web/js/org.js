/* Struktur tim: bagan atasan–bawahan, posisi, divisi, dan keahlian agar anggota saling mengenal.
 * Data dari tab Users (Reports To, Division, Skills, Joined, Org Only). Memakai fungsi & state dari app.js. */
'use strict';

const DV_N = 6;
let ORG_DIVS = [];   // urutan divisi → warna; diisi tiap kali menu Struktur dibuka
function dvIdx(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return -1;
  const i = ORG_DIVS.indexOf(k);
  if (i >= 0) return i % DV_N;
  let h = 0; for (let j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) >>> 0;
  return h % DV_N;
}
const dvCls = (name) => (dvIdx(name) < 0 ? 'dv-x' : 'dv-' + dvIdx(name));
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function fmtMonth(ym) { const m = String(ym || '').match(/^(\d{4})-(\d{2})/); return m ? MONTHS_LONG[+m[2] - 1] + ' ' + m[1] : ''; }

/** Semua orang di struktur. Akun sistem tanpa tab task, tanpa atasan, tanpa bawahan & divisi tidak ditampilkan. */
function orgPeople() {
  let list;
  if (S.user.role === 'admin' && S.all) {
    list = S.all.users.filter((u) => u.active).map((u) => ({ username: u.username, name: u.name, position: u.position || '', reportsTo: u.reportsTo || '',
      division: u.division || '', skills: u.skills || '', joined: u.joined || '', orgOnly: !!u.orgOnly, hasTasks: !!u.sheetName, role: u.role }));
  } else if (S.team && S.team.org) list = S.team.org.map((u) => Object.assign({}, u));
  else return null;
  const bosses = new Set(list.map((u) => u.reportsTo).filter(Boolean));
  return list.filter((u) => u.hasTasks || u.orgOnly || u.reportsTo || u.division || bosses.has(u.username));
}
function orgTasks() { return (S.all && S.all.tasks) || (S.team && S.team.tasks) || S.mine.tasks || []; }

function viewOrg() {
  let people = orgPeople();
  if (!people || (S.user.role !== 'admin' && Date.now() - S.teamAt > 60000 && !S.orgLoading)) {
    if (!people) $('#view').innerHTML = '<div class="loading">Memuat struktur tim…</div>';
    if (S.user.role !== 'admin') {
      S.orgLoading = true;
      loadTeam().then((ok) => { S.orgLoading = false; if (ok && S.view === 'org') softRender(); });
    }
    if (!people) return;
  }
  const O = S.org = S.org || { mode: 'chart', q: '', sel: S.user.username };
  const by = Object.fromEntries(people.map((u) => [u.username, u]));
  if (!by[O.sel]) O.sel = (people[0] || {}).username || null;
  const divs = [...new Set(people.map((u) => u.division).filter(Boolean))];
  ORG_DIVS = [...new Set(divs.map((d) => d.trim().toLowerCase()))].sort();
  const unset = !people.some((u) => u.reportsTo);
  $('#view').innerHTML = `
    ${unset && S.user.role === 'admin' ? '<div class="banner"><div><b>Struktur belum diatur.</b> Isi <b>Atasan</b> dan <b>Divisi</b> setiap orang lewat menu Pengguna → Edit; bagan tersusun otomatis.</div><button class="btn sm" id="og-users">Buka Pengguna</button></div>' : ''}
    <div class="toolbar">
      <div class="seg" id="og-mode"><button data-m="chart" class="${O.mode === 'chart' ? 'on' : ''}">Bagan</button><button data-m="list" class="${O.mode === 'list' ? 'on' : ''}">Daftar per divisi</button></div>
      <div class="fbar fbar-sm"><label class="fb-search">${FB.search}<input type="search" id="og-q" placeholder="Cari nama, posisi, keahlian…" value="${esc(O.q)}"></label></div>
      <span class="spacer"></span><span class="muted small">${people.length} orang${divs.length ? ' · ' + divs.length + ' divisi' : ''}</span>
    </div>
    <div class="org-grid"><div class="card org-main" id="og-main"></div><aside class="card org-side" id="og-side"></aside></div>`;
  $$('#og-mode button').forEach((b) => b.onclick = () => { O.mode = b.dataset.m; $$('#og-mode button').forEach((x) => x.classList.toggle('on', x === b)); renderOrgMain(people); });
  $('#og-q').oninput = (e) => { O.q = e.target.value; renderOrgMain(people); };
  if ($('#og-users')) $('#og-users').onclick = () => go('users');
  renderOrgMain(people);
  renderOrgSide(people);
}

function orgCard(u, extra) {
  const me = u.username === S.user.username, sel = S.org.sel === u.username;
  return `<button type="button" class="oc-card ${sel ? 'sel' : ''} ${extra || ''}" data-org="${esc(u.username)}" aria-pressed="${sel}">
    <span class="avatar ${dvCls(u.division)}">${initials(u.name)}</span>
    <span class="oc-txt"><b>${esc(u.name)}${me ? ' <em class="oc-me">Anda</em>' : ''}</b><small>${esc(u.position || (u.orgOnly ? '' : '—'))}</small>${extra === 'wide' && u.skills ? `<small class="oc-sk">${esc(u.skills)}</small>` : ''}</span>
  </button>`;
}

function renderOrgMain(people) {
  const O = S.org, box = $('#og-main');
  const q = O.q.trim().toLowerCase();
  if (q) {
    const hits = people.filter((u) => (u.name + ' ' + u.position + ' ' + u.division + ' ' + u.skills).toLowerCase().includes(q));
    box.innerHTML = hits.length ? `<div class="oc-grid">${hits.map((u) => orgCard(u, 'wide')).join('')}</div>` : '<div class="empty"><b>Tidak ada yang cocok</b>Coba kata lain, mis. "writer" atau "SEO".</div>';
  } else if (O.mode === 'list') {
    const groups = {};
    people.forEach((u) => { (groups[u.division || ''] = groups[u.division || ''] || []).push(u); });
    const depth = orgDepth(people);
    const keys = Object.keys(groups).sort((a, b) => (!a) - (!b) || Math.min(...groups[a].map((u) => depth[u.username])) - Math.min(...groups[b].map((u) => depth[u.username])) || a.localeCompare(b));
    box.innerHTML = keys.map((k) => `<section class="oc-group"><h3><span class="oc-dv ${dvCls(k)}">${esc(k || 'Tanpa divisi')}</span><em>${groups[k].length}</em></h3>
      <div class="oc-grid">${groups[k].sort((a, b) => depth[a.username] - depth[b.username] || a.name.localeCompare(b.name)).map((u) => orgCard(u, 'wide')).join('')}</div></section>`).join('');
  } else if (matchMedia('(max-width: 760px)').matches) {
    box.innerHTML = `<div class="oc-outline">${orgOutline(people)}</div>`;
  } else {
    box.innerHTML = `<div class="org-scroll"><ul class="otree">${orgChildren(orgRoots(people), people, new Set())}</ul></div>`;
    // pusatkan orang yang dipilih / puncak bagan bila lebar
    const sc = $('.org-scroll', box), c = sc && $('.oc-card.sel', sc);
    if (sc && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = c ? c.offsetLeft - sc.clientWidth / 2 + c.offsetWidth / 2 : (sc.scrollWidth - sc.clientWidth) / 2;
  }
  $$('[data-org]', box).forEach((b) => b.onclick = () => orgSelect(b.dataset.org, people));
}

function orgRoots(people) {
  const names = new Set(people.map((u) => u.username));
  return people.filter((u) => !u.reportsTo || !names.has(u.reportsTo) || u.reportsTo === u.username);
}
const orgKids = (u, people) => people.filter((x) => x.reportsTo === u.username && x.username !== u.username).sort((a, b) => a.name.localeCompare(b.name));
function orgDepth(people) {
  const out = {}, walk = (list, d, seen) => list.forEach((u) => { if (seen.has(u.username)) return; seen.add(u.username); out[u.username] = d; walk(orgKids(u, people), d + 1, seen); });
  walk(orgRoots(people), 0, new Set());
  people.forEach((u) => { if (out[u.username] === undefined) out[u.username] = 0; });
  return out;
}
/** Saudara selevel ditampilkan berjajar. Hanya bila semua anak tanpa bawahan (level terbawah), mereka ditumpuk ke bawah
 * (dikelompokkan per divisi) supaya bagan tidak terlalu lebar. */
function orgChildren(list, people, seen) {
  list = list.filter((u) => !seen.has(u.username));
  const hasBranch = list.some((u) => orgKids(u, people).length);
  if (hasBranch || list.length <= 1) {
    return list.map((u) => {
      if (seen.has(u.username)) return '';
      seen.add(u.username);
      const kids = orgKids(u, people);
      return `<li>${orgCard(u)}${kids.length ? `<ul>${orgChildren(kids, people, seen)}</ul>` : ''}</li>`;
    }).join('');
  }
  const groups = {};
  list.forEach((u) => { seen.add(u.username); (groups[u.division || ''] = groups[u.division || ''] || []).push(u); });
  const keys = Object.keys(groups);
  return keys.map((k) => `<li class="ot-stack">${k && keys.length > 1 ? `<span class="oc-dv ${dvCls(k)}">${esc(k)}</span>` : ''}<div>${groups[k].map((u) => orgCard(u)).join('')}</div></li>`).join('');
}
function orgOutline(people) {
  const seen = new Set();
  const walk = (list, d) => list.map((u) => {
    if (seen.has(u.username)) return ''; seen.add(u.username);
    const kids = orgKids(u, people);
    return `<div class="oo-row" style="--d:${d}">${orgCard(u)}</div>${walk(kids, d + 1)}`;
  }).join('');
  return walk(orgRoots(people), 0);
}

function orgSelect(username, people) {
  S.org.sel = username;
  $$('#og-main [data-org]').forEach((b) => { const on = b.dataset.org === username; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
  renderOrgSide(people);
  if (matchMedia('(max-width: 900px)').matches) {
    const u = people.find((x) => x.username === username);
    modal({ title: u ? u.name : 'Profil', body: `<div class="org-prof">${orgProfile(username, people)}</div>`, actions: '<button class="btn" data-close>Tutup</button>',
      onMount: (m, close) => bindOrgProfile(m, people, close) });
  }
}

function orgProfile(username, people) {
  const u = people.find((x) => x.username === username);
  if (!u) return '<p class="muted">Pilih seseorang di bagan untuk melihat profilnya.</p>';
  const boss = people.find((x) => x.username === u.reportsTo), kids = orgKids(u, people);
  const active = orgTasks().filter((t) => t.owner === u.username && !L.isDone(t)).length;
  const me = u.username === S.user.username, admin = S.user.role === 'admin';
  const row = (label, val) => `<div class="op-row"><span>${label}</span><div>${val}</div></div>`;
  const chip = (x) => `<button type="button" class="op-chip" data-org="${esc(x.username)}"><span class="avatar ${dvCls(x.division)}">${initials(x.name)}</span>${esc(x.name)}</button>`;
  return `<div class="op-head"><span class="avatar big ${dvCls(u.division)}">${initials(u.name)}</span>
      <b>${esc(u.name)}</b><span class="muted small">${esc(u.position || 'Posisi belum diisi')}</span>
      <span class="op-tags">${u.division ? `<span class="oc-dv ${dvCls(u.division)}">${esc(u.division)}</span>` : ''}${me ? '<span class="chip accent">Anda</span>' : ''}${u.orgOnly ? '<span class="chip">Tanpa akun</span>' : ''}</span></div>
    ${row('Atasan', boss ? chip(boss) : '<span class="muted">—</span>')}
    ${row('Tim langsung', kids.length ? `<div class="op-chips">${kids.map(chip).join('')}</div>` : '<span class="muted">—</span>')}
    ${row('Keahlian', `${u.skills ? esc(u.skills) : '<span class="muted">Belum diisi</span>'}${me ? ' <button type="button" class="btn sm ghost" id="op-skill">Ubah</button>' : ''}`)}
    ${u.hasTasks ? row('Task aktif', `${active} task <button type="button" class="btn sm ghost" id="op-tasks" data-u="${esc(u.username)}">Lihat task-nya</button>`) : ''}
    ${u.joined ? row('Bergabung', esc(fmtMonth(u.joined))) : ''}
    ${admin && S.all ? `<div class="op-foot"><button type="button" class="btn sm" id="op-edit" data-u="${esc(u.username)}">Edit di Pengguna</button></div>` : ''}`;
}

function renderOrgSide(people) {
  const side = $('#og-side'); if (!side) return;
  side.innerHTML = orgProfile(S.org.sel, people);
  bindOrgProfile(side, people);
}

function bindOrgProfile(root, people, close) {
  const done = () => { if (close) close(); };
  $$('[data-org]', root).forEach((b) => b.onclick = () => { done(); orgSelect(b.dataset.org, people); });
  const t = $('#op-tasks', root);
  if (t) t.onclick = () => { done(); S.f.teamPeople = [t.dataset.u]; S.f.teamCodes = []; S.f.teamQ = ''; go('team'); };
  const e = $('#op-edit', root);
  if (e) e.onclick = () => { done(); userModal(S.all.users.find((u) => u.username === e.dataset.u)); };
  const s = $('#op-skill', root);
  if (s) s.onclick = () => { done(); skillsModal(); };
}

function skillsModal() {
  const cur = ((orgPeople() || []).find((u) => u.username === S.user.username) || {}).skills || S.user.skills || '';
  modal({
    title: 'Keahlian / fokus kerja',
    body: `<label class="field"><span>Ceritakan singkat apa yang Anda kerjakan atau kuasai</span><input id="sk-in" maxlength="120" value="${esc(cur)}" placeholder="mis. Riset keyword, technical SEO, brief artikel"></label>
      <p class="muted small" style="margin:0">Tampil di profil Anda di menu Struktur. Maksimal 120 karakter.</p>`,
    actions: '<button class="btn" data-close>Batal</button><button class="btn primary" id="sk-ok">Simpan</button>',
    onMount: (m, close) => {
      const save = async () => {
        const v = $('#sk-in', m).value.trim();
        try {
          const r = await busy($('#sk-ok', m), () => api.call('setMySkills', { skills: v }));
          close();
          const val = (r && r.user && r.user.skills) || v;
          S.user.skills = val;
          if (S.team && S.team.org) S.team.org.forEach((u) => { if (u.username === S.user.username) u.skills = val; });
          if (S.all) S.all.users.forEach((u) => { if (u.username === S.user.username) u.skills = val; });
          saveCache(); toast('Keahlian disimpan'); if (S.view === 'org') go('org');
        } catch (err) { /* busy sudah menampilkan pesan */ }
      };
      $('#sk-ok', m).onclick = save;
      $('#sk-in', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      setTimeout(() => $('#sk-in', m).focus(), 50);
    }
  });
}

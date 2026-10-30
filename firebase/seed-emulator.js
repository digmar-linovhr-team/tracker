// Isi emulator Firebase dengan data demo (untuk uji end-to-end versi beta). Jalankan saat emulator aktif.
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = 'demo-tracker', FS = 'http://127.0.0.1:8080/v1/projects/' + P + '/databases/(default)/documents', AU = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + P;
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, Set };
ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js/demo.js'), 'utf8'), ctx);
const s = ctx.PTDemo.seed();
const enc = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } } : { stringValue: String(v) };
const omit = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !ks.includes(k) && v !== undefined));
const docs = [];
s.users.forEach((u) => {
  docs.push(['users/' + u.username, { name: u.name, role: u.role, active: u.active !== false, position: u.position || '', reportsTo: u.reportsTo || '', division: u.division || '', skills: u.skills || '',
    joined: u.joined || '', orgOnly: !!u.orgOnly, wfoExempt: !!u.wfoExempt, hasTasks: !!u.sheetName, legacySheet: u.sheetName || '', onboard: u.onboard || '', mustChange: false, authMigrated: true }]);
  if (u.email) docs.push(['private/' + u.username, { email: u.email }]);
});
const creator = {}; s.briefs.forEach((b) => { if (b.taskId && (b.type === 'Request' || b.type === 'Sosmed')) creator[b.taskId] = b.createdBy; });
s.tasks.forEach((t) => docs.push(['tasks/' + t.id, Object.assign(omit(t, ['id', 'ownerName', 'sheet', 'row', 'startRaw', 'endRaw']), creator[t.id] ? { createdBy: creator[t.id] } : {}, { updatedBy: 'seed', updatedAt: new Date() })]));
s.projects.forEach((p) => docs.push(['projects/' + p.code, omit(p, ['code', 'row', 'startRaw', 'endRaw'])]));
s.briefs.forEach((b) => docs.push(['briefs/' + b.id, omit(b, ['id'])]));
Object.entries(s.sched).forEach(([k, v]) => { const [w, u] = k.split('|'); docs.push(['schedule/' + w + '_' + u, { week: w, username: u, days: v.days, source: v.source }]); });
s.sreqs.forEach((q) => docs.push(['schedRequests/' + q.id, omit(q, ['id'])]));
s.leaves.forEach((l) => docs.push(['leaves/' + l.id, omit(l, ['id'])]));
s.comments.forEach((c) => docs.push(['comments/' + c.id, Object.assign(omit(c, ['id']), { createdAt: new Date(c.createdAt), deleted: false })]));
const req = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok && !/EMAIL_EXISTS/.test(t)) throw new Error(url + ' ' + r.status + ' ' + t.slice(0, 200)); return t;
};
(async () => {
  for (let i = 0; i < docs.length; i += 400) await req(FS.replace(/\/documents$/, '/documents:commit'), { writes: docs.slice(i, i + 400).map(([p, d]) => ({ update: { name: 'projects/' + P + '/databases/(default)/documents/' + p, fields: enc(d).mapValue.fields } })) });
  for (const u of s.users.filter((x) => !x.orgOnly)) await req(AU + '/accounts', { email: u.username + '@linovhr-tracker.firebaseapp.com', password: 'demo1234', displayName: u.name });
  console.log('Emulator diisi: ' + docs.length + ' dokumen, ' + s.users.filter((x) => !x.orgOnly).length + ' akun (password demo1234)');
})().catch((e) => { console.error(e); process.exit(1); });

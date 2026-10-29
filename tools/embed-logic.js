// Salin web/js/logic.js ke bagian akhir apps-script/Code.gs (server memakai hitungan KPI yang sama untuk laporan email).
// Jalankan: node tools/embed-logic.js   — tes backend memastikan salinannya selalu sama.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const BEGIN = '// ===== LOGIKA BERSAMA (salinan otomatis web/js/logic.js — jangan diedit di sini) =====';
const END = '// ===== AKHIR LOGIKA BERSAMA =====';
const gs = path.join(root, 'apps-script/Code.gs');
const logic = fs.readFileSync(path.join(root, 'web/js/logic.js'), 'utf8').trim();
let src = fs.readFileSync(gs, 'utf8');
const block = BEGIN + '\n' + logic + '\n' + END + '\n';
const i = src.indexOf(BEGIN), j = src.indexOf(END);
src = i >= 0 ? src.slice(0, i) + block + src.slice(j + END.length + 1) : src.replace(/\s*$/, '\n\n') + block;
fs.writeFileSync(gs, src);
module.exports = { BEGIN, END, block };
if (require.main === module) console.log('logic.js disalin ke Code.gs');

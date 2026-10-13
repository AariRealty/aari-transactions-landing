// Decision 142: on the Aari Referrals pages, any sentence that calls the referral model legal must carry the
// condition that every referral fee is paid through the broker (F.S. 475.42(1)(d)). Run before every push:
//   node .checks/referral-legal.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => /^(aari-referrals|referral-.*)\.html$/.test(f));
let bad = [];
for (const f of pages) {
  const txt = fs.readFileSync(path.join(root, f), 'utf8').replace(/<style[^]*?<\/style>/gi, ' ').replace(/<script[^]*?<\/script>/gi, m => /ld\+json/.test(m) ? m.replace(/[{}\[\]"]/g, ' ') : ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  for (const s of txt.split(/(?<=[.!?])\s+/)) {
    if (/\b(is|are|it.s|makes (that|it|this)|fully|perfectly|completely|100%)\s+(fully\s+)?legal\b|\blegally (earn|refer|receive|collect)/i.test(s) && !/\?\s*$/.test(s) && !/\brequires?\b/i.test(s) && !/paid through (your|the) broker|through the employing broker|paid to and through/i.test(s)) bad.push(f + ': ' + s.trim().slice(0, 200));
  }
}
if (bad.length) { console.error('Referral legality claim without the broker payment condition (decision 142):'); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
console.log('referral legal check passed: ' + pages.length + ' pages');

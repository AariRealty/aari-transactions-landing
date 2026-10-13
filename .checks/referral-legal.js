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

// Decision 156: 239.789.4701 is the Aari Realty line only. Aari Transactions and Aari Referrals use 239.688.1770.
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const phoneBad = walk(root).filter(f => /\.(html|js|txt)$/.test(f) && /789[. -]?4701/.test(fs.readFileSync(f, 'utf8')));
if (phoneBad.length) { console.error('Aari Realty line 239.789.4701 found on the Aari Transactions site (decision 156):'); phoneBad.forEach(f => console.error('  ' + path.relative(root, f))); process.exit(1); }
console.log('phone line check passed');

// Rescan Oct 13: Referrals price, split and payment wording must match the RAA (decisions 143, 144, 152).
const refBad = [];
for (const f of walk(root).filter(f => /\.html$/.test(f) && !/(pipeline|aari-crm|mock|tc-portal|broker-cockpit|files)/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  if (/RESPA[ -]clean/i.test(t)) refBad.push(rel + ': "RESPA clean" claim');
  if (/^(aari-referrals|referral-.*)\.html$/.test(rel)) {
    for (const m of t.matchAll(/retains (\d+) ?(percent|%)/gi)) if (m[1] !== '15') refBad.push(rel + ': retains ' + m[1] + ' percent');
    if (/dollar a day|\$1 a day/i.test(t)) refBad.push(rel + ': dollar a day');
    if (/(pay|paid|payment)[^.<]{0,40}through Stripe/i.test(t)) refBad.push(rel + ': Stripe payment while online payment is not open');
    if (/safe harbor/i.test(t)) refBad.push(rel + ': safe harbor');
  }
}
if (refBad.length) { console.error('Referrals wording check failed:'); refBad.forEach(b => console.error('  ' + b)); process.exit(1); }
console.log('referrals wording check passed');

// Decision 158: text consent is optional, split (file texts vs marketing) and never implied by giving a phone number.
const smsBad = [];
for (const f of walk(root).filter(f => /\.html$/.test(f) && !/(pipeline|aari-crm|mock|tc-portal|broker-cockpit|files)/.test(f))) {
  const t = fs.readFileSync(f, 'utf8'), rel = path.relative(root, f);
  if (/by providing your (phone|number)[^<]{0,60}agree/i.test(t)) smsBad.push(rel + ': consent implied by giving a phone number');
  for (const m of t.matchAll(/<input[^>]*name="(sms[^"]*|tcpa[^"]*)"[^>]*>/gi)) if (/\brequired\b|\bchecked\b/i.test(m[0])) smsBad.push(rel + ': text consent box is required or pre checked');
}
if (smsBad.length) { console.error('Text consent check failed (decision 158):'); smsBad.forEach(b => console.error('  ' + b)); process.exit(1); }
console.log('text consent check passed');

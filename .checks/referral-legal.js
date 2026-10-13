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

// Decision 169a: one TC Service Agreement, labeled by date, same text everywhere; no "Version 4.x" label or 30 day purge promise.
{
  const pages = ['index.html', 'register.html', 'public/register.html', 'submit.html', 'js/aari-sa-text.js'].map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]);
  const saBad = [];
  for (const [f, t] of pages) {
    if (/Service Agreement[^<]{0,20}Version 4\.\d|Version 4\.\d &middot; Effective|Post-Closing File Purge|retains no copies of client files/.test(t)) saBad.push(f + ': old Service Agreement label or purge promise');
  }
  const dates = new Set(pages.flatMap(([f, t]) => [...t.matchAll(/(?:Agreement|SERVICES AGREEMENT\\n|SERVICES AGREEMENT\n)\s*[Dd]ated ([A-Z][a-z]+ \d{1,2}, \d{4})/g)].map(m => m[1])));
  if (dates.size > 1) saBad.push('Service Agreement dates differ: ' + [...dates].join(' / '));
  if (saBad.length) { console.error('Service Agreement check failed (decision 169a):'); saBad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('service agreement check passed');
}

// Decision 173b: broker review is described as a checklist review, never an outcome promise.
{
  const outBad = [];
  for (const f of ['index.html', 'about.html', 'contact.html', 'what-we-track.html']) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    if (/license stays clean|anything (off|we find) gets (fixed|flagged)|so you can fix it|every file\. reviewed by a broker/i.test(t)) outBad.push(f + ': broker review outcome promise');
  }
  if (outBad.length) { console.error('Broker review wording check failed (decision 173b):'); outBad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('broker review wording check passed');
}

// Decision 175: no testimonial outside the reviews system (named, permissioned, tied to a file).
{
  const tBad = [];
  for (const f of walk(root).filter(f => /\.html$/.test(f) && !/(pipeline|aari-crm|mock|tc-portal|broker-cockpit|files|tc-cockpit|reviews|review\.html|aari-reviews)/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    if (/written permission on file|class="pull-quote"/i.test(t)) tBad.push(path.relative(root, f) + ': testimonial outside the reviews system');
  }
  if (tBad.length) { console.error('Testimonial check failed (decision 175):'); tBad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('testimonial check passed');
}

// Decisions 181 to 185: no promise words that came back out in the liability sweep.
{
  const pBad = [];
  const re = /confirmation of receipt|staffed by licensed|We(&rsquo;|')re licensed agents|tax hit|fat-finger|logged for FREC|Performed by licensed broker Marlenyi|Marlenyi matches you personally|personally (oversees|selects)|My TC team are licensed|broker personally|watching every file|on every referral file|Audit-ready folder delivered|make the file audit-ready|Username · Password|name="(compliance|signing)_login"|Intro rate through Aug|public testimonial with my name|includes loss of license, willful misconduct|twelve months preceding the claim|70% of (Files|Florida)|eliminates the entire category|closing date is safe/i;
  for (const f of walk(root).filter(f => /\.(html|js|ts)$/.test(f) && !/(pipeline|files\.html|archive|node_modules|\.checks)/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(re);
    if (m) pBad.push(path.relative(root, f) + ': ' + m[0]);
  }
  if (pBad.length) { console.error('Promise words check failed (decisions 181 to 185):'); pBad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('promise words check passed');
}

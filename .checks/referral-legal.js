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
  const re = /confirmation of receipt|staffed by licensed|We(&rsquo;|')re licensed agents|tax hit|fat-finger|logged for FREC|Performed by licensed broker Marlenyi|Marlenyi matches you personally|personally (oversees|selects)|My TC team are licensed|broker personally|watching every file|on every referral file|Audit-ready folder delivered|make the file audit-ready|Username · Password|name="(compliance|signing)_login"|Intro rate through Aug|public testimonial with my name|includes loss of license, willful misconduct|twelve months preceding the claim|70% of (Files|Florida)|eliminates the entire category|closing date is safe|Compliance reviewed before close|Same broker audit applied|never lets a deadline slip|audit finds nothing missing|catch the items before they catch you|Catch it before they do|Every safeguard your file needs|never CCs the buyer|Monday.morning surprise|Nights, weekends, holidays|nights, weekends, holidays|Direct line to the broker|I keep one canonical|Permission on file for every review|I have provided all logins|Compatible with every TC platform|Every deadline tracked|I use on every Aari|Active FL Realtor|239\.440\.1006|407\.910\.5836|pick any Offer Prep|and memberships are non-refundable once work begins|is the whole pricing|brokerages quietly tack on|flags the leverage decisions|protects the timeline|flags this question on every new file|HUD-compliant form language|oceanfront \+ waterfront|protects the file|Standalone work starts at \$49|Revision, amendment and late fees|delivered audit-ready|reads your file before anyone else|every gap found|MLS Setup Only \(\$149|broker-led compliance review|Broker-reviewed before close|A Florida broker on your file|Same broker review on both\.|true (Florida )?dual representation|straight to Marlenyi|Marlenyi will see this|Marlenyi reads every|your broker assigns manually|requires Agent\\?'s credentials|Agent\\?'s system credentials|you owe nothing|no fee owed if it doesn|Waiving appraisal strengthens|\$20 cheaper|double-billing the client|no fee to move; only|Every file we run goes through|does not remove you from service related|stake my license|MLS logins we can use|encrypted at rest<\/strong> and only readable|Broker review 48 hours before close|audit it before it goes to compliance|without proper BRD signed|your client's broker|verified, and organized|run your listing end.to.end|Open house support|MLS setup &(amp;)? syndication|recruit you away from your brokerage|Missed deadline = automatic termination|Effective Date in Florida residential real estate is|Set up by phone|set up your payment with (you|us) (directly|by phone)|Payment is set up with you by phone|Document Signing Login|Buyer or Seller representation|Dual representation\. Both|execution verification \+ broker review|fault is set out in the|at fault as set out in|counter coordination|Execution verification both sides|All-in flat fee|End-to-end listing run|Broker.led|Performed under licensed broker supervision/i;
  // Decision 239: the homepage intake credits MLS Setup, matching Terms (d).
  { const ix = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); if (!/mls_setup:\s*\{ tier: 'Starter'/.test(ix)) pBad.push('index.html: MLS Setup missing from the credit map (decision 239)'); }
  // Decision 248: submit.html keeps the Service Agreement guard.
  { const sb = fs.readFileSync(path.join(root, 'submit.html'), 'utf8'); if (!/if\(!authState\.token && !\(cState\.sa && cState\.sa\.accepted\)\)\{ anonRenderSA\(\); return; \}/.test(sb)) pBad.push('submit.html: Service Agreement guard missing (decision 248)'); }
  // Decision 201: Listing Coordinator is $199 on every page.
  for (const f of ['services.html','index.html','submit.html']) { const t = fs.readFileSync(path.join(root, f), 'utf8'); if (/Listing Coordinator[\s\S]{0,400}\$249/.test(t)) pBad.push(f + ': Listing Coordinator not $199 (decision 201)'); }
  for (const f of walk(root).filter(f => /\.(html|js|ts|json)$/.test(f) && !/(pipeline|files\.html|archive|node_modules|\.checks)/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(re);
    if (m) pBad.push(path.relative(root, f) + ': ' + m[0]);
  }
  if (pBad.length) { console.error('Promise words check failed (decisions 181 to 185):'); pBad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('promise words check passed');
}

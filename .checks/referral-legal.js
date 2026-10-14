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
  const re = /confirmation of receipt|staffed by licensed|We(&rsquo;|')re licensed agents|tax hit|fat-finger|logged for FREC|Performed by licensed broker Marlenyi|Marlenyi matches you personally|personally (oversees|selects)|My TC team are licensed|broker personally|watching every file|on every referral file|Audit-ready folder delivered|make the file audit-ready|Username · Password|name="(compliance|signing)_login"|Intro rate through Aug|public testimonial with my name|includes loss of license, willful misconduct|twelve months preceding the claim|70% of (Files|Florida)|eliminates the entire category|closing date is safe|Compliance reviewed before close|Same broker audit applied|never lets a deadline slip|audit finds nothing missing|catch the items before they catch you|Catch it before they do|Every safeguard your file needs|never CCs the buyer|Monday.morning surprise|Nights, weekends, holidays|nights, weekends, holidays|Direct line to the broker|I keep one canonical|Permission on file for every review|I have provided all logins|Compatible with every TC platform|Every deadline tracked|I use on every Aari|Active FL Realtor|239\.440\.1006|407\.910\.5836|pick any Offer Prep|and memberships are non-refundable once work begins|is the whole pricing|brokerages quietly tack on|flags the leverage decisions|protects the timeline|flags this question on every new file|HUD-compliant form language|oceanfront \+ waterfront|protects the file|Standalone work starts at \$49|Revision, amendment and late fees|delivered audit-ready|reads your file before anyone else|every gap found|MLS Setup Only \(\$149|broker-led compliance review|Broker-reviewed before close|A Florida broker on your file|Same broker review on both\.|true (Florida )?dual representation|straight to Marlenyi|Marlenyi will see this|Marlenyi reads every|your broker assigns manually|requires Agent\\?'s credentials|Agent\\?'s system credentials|you owe nothing|no fee owed if it doesn|Waiving appraisal strengthens|\$20 cheaper|double-billing the client|no fee to move; only|Every file we run goes through|does not remove you from service related|stake my license|MLS logins we can use|encrypted at rest<\/strong> and only readable|Broker review 48 hours before close|audit it before it goes to compliance|without proper BRD signed|your client's broker|verified, and organized|run your listing end.to.end|Open house support|MLS setup &(amp;)? syndication|recruit you away from your brokerage|Missed deadline = automatic termination|Effective Date in Florida residential real estate is|Set up by phone|set up your payment with (you|us) (directly|by phone)|Payment is set up with you by phone|Document Signing Login|Buyer or Seller representation|Dual representation\. Both|execution verification \+ broker review|fault is set out in the|at fault as set out in|counter coordination|Execution verification both sides|All-in flat fee|End-to-end listing run|Broker.led|Performed under licensed broker supervision|headshot and information for social media|use the next business day|we wrote an extension addendum|parallel timeline discussion|anomalies to both sides|CRSP \(Commercial\)|Vacant Land \(CRSP|>CRSP-17<|The login below is for your|Dual representation \(use|Request compliance review|Broker compliance review|Final file audit|call or text you to set up your membership payment|Florida courts have generally|That's your Effective Date|We draft it\. BBA|Independent of any single brokerage|Continued use of the service after an update means you accept the revised Terms|can void a contract if missed|activity load on Eileen|this kind of analysis on your next file|WHOSE FILE IS THIS · the question|review_requests !== false|Yes, send to every client/i;
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

// Decisions 263 to 280 (re scan 11): consent, timing, compliance claims and SA scope wording.
{
  const bad = [];
  const re = /Not bypassable|absolute lock|FTC-compliant|CAN-SPAM compliant|per CAN-SPAM|stay compliant|clean, compliant|top priority in queue|PRE-LAUNCH|Aari handles the rest|every file gets the attention|48-hour intake delay|checkpoint that prevents|execution check, broker review|protects the time|TC will start (today|tomorrow)|be in\s+touch the same day|Same-day\s+intake confirmation|picks it up right away|landed in your inbox|Your signed agreement is on file|30-minute window<\/div>|Agent fault \(loss of license|review request to your client after each file|Aari marketing materials including social media|Florida Rule<\/span>|Every deadline rolls forward|within <strong>10 business days|10-business-day rule|NABOR applies "time is of the essence"|© Aari Realty LLC · Aari Transactions|"Realtor"|Review request goes to your client\.|Sent automatically when a file closes|with or without notice|Modifications must be in writing and signed by both|All fees are non-refundable once charged\.|Fees non-refundable once charged\.|your broker, and tc@aaritransactions|accepts within 4 business hours|the moment they pick up the file|your TC texts|publish without a final okay|We handle everything|M–F 9am–5pm|Aari Realty <small>Transactions|Your broker reviews it and sends|Repairs are negotiated at inspection|Seller has a defined response window|30-item repair list|10-business-day statutory|usually 3 business days|runs this on every file|run on luck|every one of your files automatically|Every Florida form\.|sign, and you are in|The moment you sign, a signed copy|We draft your offer|22 emails\. 6 calls|vacant land \/ rental = \$299|OFF THE TOP|you registered with Aari Transactions/;
  for (const f of walk(root).filter(f => /\.(html|js|ts|tsx|json|md)$/.test(f) && !/(node_modules|\.checks|files\.html|tc-cockpit|seller-checklist-draft)/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(re);
    if (m) bad.push(path.relative(root, f) + ': ' + m[0]);
  }
  // 263: the agent introduction email carries an opt out.
  { const t = fs.readFileSync(path.join(root, 'supabase/functions/_email-templates/AgentIntroduction.tsx'), 'utf8'); if (!/category="marketing"/.test(t) || !/Unsubscribe in the subject/.test(t)) bad.push('AgentIntroduction.tsx: opt out missing (decision 263)'); }
  // 264: texts only after opt in.
  for (const f of ['supabase/functions/send-file-submitted-sms-to-agent/index.ts','supabase/functions/send-tc-acceptance-sms/index.ts']) { const t = fs.readFileSync(path.join(root, f), 'utf8'); if (/sms_opt_in === false/.test(t)) bad.push(f + ': texts must require sms_opt_in true (decision 264)'); }
  // 266: Yes is never saved as 'always'.
  { const t = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); if (/yes: 'always'/.test(t)) bad.push("index.html: review Yes saved as 'always' (decision 266)"); }
  if (bad.length) { console.error('Re scan 11 check failed (decisions 263 to 280):'); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('re scan 11 check passed');
}

// Decisions 293 to 321 (re scan 12).
{
  const bad = [];
  const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
  if (!/disabled: true, reason: "decision_293"/.test(rd('supabase/functions/send-other-side-offer/index.ts'))) bad.push('send-other-side-offer must stay off (decision 293)');
  const q = rd('supabase/functions/quo-incoming-webhook/index.ts');
  if (q.indexOf('Decision 294') < 0 || q.indexOf('Decision 294') > q.indexOf('const tc = await findTcByPhone')) bad.push('quo-incoming-webhook: STOP and HELP must run before the TC match (decision 294)');
  if (!/sms_opt_in === true/.test(rd('supabase/functions/loan-deadline-ping/index.ts'))) bad.push('loan-deadline-ping: opt in check missing (decision 318)');
  const pt = rd('portal.html');
  if (!/Math\.min\(499, Math\.max\(100,/.test(pt)) bad.push('portal.html: land and rental fee must be 10%, $100 to $499 (decision 295)');
  if (!/teamComm\(f\)\*\(agentSplitOf\(f\)\/100\) - fileFee\(f\)/.test(pt)) bad.push('portal.html: fee must come out of the agent share after the split (decision 295)');
  if (/id="goal-auth-publish-mls"/.test(pt)) bad.push('portal.html: MLS publish without okay toggle is back (decision 305)');
  if (bad.length) { console.error('Re scan 12 check failed:'); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('re scan 12 check passed');
}

// Decision 328: no client records hardcoded in public files, and internal files stay blocked.
{
  const bad = [];
  const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
  if (!/const DEFAULT_DATA=\[\]/.test(rd('pipeline.html'))) bad.push('pipeline.html: client records are hardcoded again (decision 328)');
  if (/Susslay|Matos Empire|2509 12th St SW/.test(rd('tc-cockpit.html'))) bad.push('tc-cockpit.html: real client demo is back (decision 328)');
  const r = rd('_redirects');
  for (const rule of ['/sql/*','/supabase/*','/docs/*','/tc-portal/*','/portal.html.bak','/LAUNCH_RUNBOOK.md']) if (r.indexOf(rule + '  /404.html  404!') < 0) bad.push('_redirects: block rule missing for ' + rule + ' (decision 328)');
  if (bad.length) { console.error('Decision 328 check failed:'); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('decision 328 check passed');
}

// Decisions 329 to 359 (deep pass): wording and money rules that must not come back.
{
  const bad = [];
  const re = /YOUR_PROJECT\.supabase\.co|AARI_PUBLIC_ANON_KEY|only when the transaction funds|Activity Bonus|does not restrict your right to engage other transaction coordinators|Real files\. Real names|100% FTC|Compliant with FTC review|Time of essence for Closing Date only|a complete listing run from MLS|aria-label="Most popular"|Your time, your phone, your license|payment link missing — text Marlenyi|DEFAULT_AGENT_KEEP = 80|COMPANY_LEAD_AGENT_PCT = 37\.5|Aari does not pay or process commissions\.|only accessible by you|Only Aari coordinators assigned to your file|fair housing safe|Pick Buyer, Seller, or Dual agency|Insert Aari's standard|Blank defaults to 50%|Recommend offer terms based on comps|I will get a fresh agreement out today|advise the buyer.s side correctly|Offer Prep · Basic \$69|clientPrice: '\$69'|Request review from every closed file|SMS if their number is on file|within 4 hours of every visitor|unenforceable post-NAR settlement|475\.278\(3\)\(c\)|coordinate the 15% withholding|FAR violations carry fines|DBPR retention: 5 years|Nothing is falling through the cracks|No contracts, no retainers|save the creds to your Aari profile|personally within the hour|Share it\. Use it\. It's yours|up to 3 times per file|No further action needed from you|built from real files we've closed|Your countersigned PDF is attached|Buyer written notice required today|price: "\$69"|SAMANTHA50|You agree to indemnify and hold harmless Aari Transactions|We share information only as required|sending me your next friend|screen every applicant|within 48 hours of photo delivery|Their membership credits pay for it|I respond personally to every inquiry|your first month back is 50% off|Missing dates void enforceability|Send 2 client referrals per quarter|DEFAULT_COMM_PCT = 2\.5|puentesana99|You clocked in|attached are wire instructions|You sell\. We handle the rest|Send to Marlenyi|Cancel or pause anytime from the portal|we begin right away|Growth 70\/30|Pro 90\/10|Verification phone: \[Phone\]|share wire details|We load and launch your MLS listing|completely off agents. plates|Your TC stops working your active files|Send a client lead or shout-out to a partner|Give a referral before you ask|Milennys Valdez|Silvia Quintero|id:'closed_title_lender_review'|I would love a Google review whenever you have a moment|After hours \+ weekends|No follow-up sales sequence|Please update the MLS today|Still holding your spot|run this for you on every file|so you always have one source of truth|this closing runs itself|undated BBAs are unenforceable|dual representation kicks in|We are drafting your offer/;
  for (const f of walk(root).filter(f => /\.(html|js|ts|tsx|json)$/.test(f) && !/(node_modules|\.checks|pay-engine\.test)/.test(f))) {
    const t = fs.readFileSync(f, 'utf8'); const m = t.match(re);
    if (m) bad.push(path.relative(root, f) + ': ' + m[0]);
  }
  const pe = fs.readFileSync(path.join(root, 'js/pay-engine.js'), 'utf8');
  if (!/MEMBER_TC_DISCOUNT_BY_TIER/.test(pe)) bad.push('pay-engine.js: member discount must follow the published tier amounts (decision 342)');
  if (/CREDIT_SERVICES = \{[^}]*(standalone_review|offer_prep_complete)/.test(pe)) bad.push('pay-engine.js: credits cover only the Terms (d) list (decision 341)');
  if (fs.readFileSync(path.join(root, 'supabase/functions/submit-tc-invoice/pay-engine.js'), 'utf8') !== pe) bad.push('pay-engine.js copies differ');
  if (!/disabled: true, reason: "decision_331"/.test(fs.readFileSync(path.join(root, 'supabase/functions/send-agent-review/index.ts'), 'utf8'))) bad.push('send-agent-review must stay off (decision 331)');
  if (/a\.tc_may_email_client !== false/.test(fs.readFileSync(path.join(root, 'files.html'), 'utf8'))) bad.push('files.html: client contact must default off (decision 343)');
  if (bad.length) { console.error('Deep pass check failed (decisions 329 to 359):'); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
  console.log('deep pass check passed');
}

/* Aari Transactions · deadline map guard
   Run: node js/deadline-map.test.js

   WHY THIS EXISTS.
   TASK_CLEARS_DL in files.html says "ticking this task means that deadline was met". It is hand
   written. deadline-engine.js says which deadlines a contract actually has. Nothing ever checked
   that the two agreed, so they drifted: 14 deadlines on an FR/BAR AS-IS, 9 wired, 5 forgotten.

   A forgotten deadline can never close. It counts up forever. The only symptom is a coordinator
   saying "I already did that" while the board calls her weeks late, which is exactly what Eileen
   reported over and over before anyone believed the software was wrong rather than her.

   This fails the moment:
     1. TASK_CLEARS_DL points at a deadline no contract type produces (a typo, or a rename in the
        engine that nobody carried over here). That entry silently does nothing.
     2. A deadline becomes unwired without being listed in KNOWN_UNWIRED below with a reason.

   KNOWN_UNWIRED is deliberate, not a todo list to clear. Read the reasons before touching it: a
   task may only close a deadline when completing it PROVES the deadline was met.
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = global;
require(path.join(__dirname, 'deadline-engine.js'));
const ENG = globalThis.AariDeadlineEngine;

const src = fs.readFileSync(path.join(ROOT, 'files.html'), 'utf8');
const blk = src.match(/const TASK_CLEARS_DL = \{[\s\S]*?\n  \};/);
if (!blk) { console.error('FAIL · could not find TASK_CLEARS_DL in files.html'); process.exit(1); }
const TASK_CLEARS_DL = eval('(' + blk[0].replace('const TASK_CLEARS_DL = ', '').replace(/;\s*$/, '') + ')');
const ALIAS = ENG.LEGACY_ALIAS || {};

// Deadlines with no task that can honestly close them. Each needs a REASON, not a shrug.
const KNOWN_UNWIRED = {
  walk_through:  'Only candidate is ctc_walkthrough, labelled "Walk-through SCHEDULED". Scheduling one does not prove it happened. Needs a real completion task.',
  appraisal:     'No task exists at all.',
  survey_notice: 'No task exists at all. Standard A, buyer\'s written notice of survey defects.',
  // Seller-side and NABOR-family keys that only some contract types produce.
  seller_response: 'FR/BAR Standard only. Wired via s_uc_seller_response where it applies.',

  // LATENT · these belong to contract types with ZERO files today (NABOR, NAB089, CC-6). Verified
  // 2026-07-17: every file in the database is frbar_asis, frbar_crsp, or has no contract type set.
  // So nobody is being nagged by these yet. They are listed rather than wired because inventing a
  // task-to-deadline link for a contract nobody has run is how you get a link that is wrong the
  // first time it matters. Wire each one when the first file of that type lands, against the real
  // checklist that file actually uses.
  buyer_title_rev:   'LATENT · NABOR / NAB089. No files of those types exist yet. No task exists.',
  lease_terminate:   'LATENT · NABOR. No files of that type exist yet. No task exists.',
  assignment_disc:   'LATENT · NABOR. No files of that type exist yet. No task exists.',
  buyer_survey:      'LATENT · NABOR. No files of that type exist yet. No task exists.',
  due_diligence_end: 'LATENT · CC-6 commercial. No files of that type exist yet. No task exists.',
  snda_received:     'LATENT · CC-6 commercial. No files of that type exist yet. No task exists.',
};

// EVERY sale-side contract type, not just the FR/BAR family. The first run of this guard "failed"
// on four NABOR keys (survey_existing, title_policy, leases_provided, tenant_lease) purely because
// the list below stopped at FR/BAR. A guard that only knows half the contracts reports its own
// blind spot as a bug in the code, which is worse than no guard: it trains people to ignore it.
const TYPES = ['frbar_asis', 'frbar_standard', 'frbar_crsp', 'vac_15',
               'nabor', 'nab089', 'nab088', 'builder', 'cc_6'];
let failures = [];

function resolves(taskValue, engineKeys){
  if (engineKeys.includes(taskValue)) return taskValue;
  for (const c of (ALIAS[taskValue] || [])) if (engineKeys.includes(c)) return c;
  return null;
}

console.log('\n1. every TASK_CLEARS_DL entry lands on a real deadline somewhere');
const allEngineKeys = new Set();
TYPES.forEach(t => ENG.contractDeadlines(t, '2026-06-01', '2026-07-28').forEach(r => allEngineKeys.add(r.key)));
for (const [task, val] of Object.entries(TASK_CLEARS_DL)) {
  const hit = resolves(val, [...allEngineKeys]);
  if (hit) console.log('  ok   ' + task.padEnd(30) + '-> ' + hit);
  else { console.log('  FAIL ' + task.padEnd(30) + '-> "' + val + '" matches NO deadline on any contract type'); failures.push(task + ' -> ' + val); }
}

console.log('\n2. every deadline is either wired, or knowingly unwired with a reason');
for (const type of TYPES) {
  const keys = ENG.contractDeadlines(type, '2026-06-01', '2026-07-28').map(r => r.key);
  const wired = new Set();
  for (const val of Object.values(TASK_CLEARS_DL)) { const h = resolves(val, keys); if (h) wired.add(h); }
  const orphans = keys.filter(k => !wired.has(k) && !KNOWN_UNWIRED[k] && k !== 'closing');
  if (!orphans.length) console.log('  ok   ' + type.padEnd(16) + keys.length + ' deadlines, ' + wired.size + ' wired, rest known');
  else { console.log('  FAIL ' + type.padEnd(16) + 'unwired and undocumented: ' + orphans.join(', ')); failures.push(type + ': ' + orphans.join(', ')); }
}

console.log('');
if (failures.length) {
  console.error('DEADLINE MAP DRIFT · ' + failures.length + ' problem(s):');
  failures.forEach(f => console.error('  - ' + f));
  console.error('\nA deadline with no task can never close. It will count up at a coordinator forever.');
  console.error('Either wire it in TASK_CLEARS_DL, or add it to KNOWN_UNWIRED with a real reason.');
  process.exit(1);
}
console.log('deadline map guard: all checks passed.');

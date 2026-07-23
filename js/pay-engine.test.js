/* Aari Transactions · pay-engine guard
   Run: node js/pay-engine.test.js
   Fails loudly if the money rules drift apart. Three things it will not let slide:
     1. A price in the cockpit's catalog (index.html) that disagrees with the engine.
     2. files.html or submit-tc-invoice re-declaring its own SERVICE_PRICE / FILE_ORG_PAY
        instead of reading the engine (that is exactly how the last drift started).
     3. The pay branches returning something other than the known-good figures.
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

require(path.join(__dirname, 'pay-engine.js'));
const PAY = globalThis.AariPayEngine;

let failures = [];
function check(name, cond, detail){
  if(cond) { console.log('  ok   ' + name); }
  else { failures.push(name + (detail ? (' — ' + detail) : '')); console.log('  FAIL ' + name + (detail ? (' — ' + detail) : '')); }
}

console.log('\n1. engine prices match the public catalog (index.html)');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const catalog = {};
const re = /id:\s*'([a-z_]+)'[^{}]{0,300}?price:\s*(\d+)/g;
let m;
while((m = re.exec(idx)) !== null) catalog[m[1]] = Number(m[2]);
Object.keys(catalog).forEach(function(id){
  const key = PAY.SERVICE_ALIAS[id] || id;
  const engine = PAY.SERVICE_PRICE[key];
  check('catalog ' + id + ' ($' + catalog[id] + ') == engine ' + key,
        engine === catalog[id], engine === undefined ? 'engine has no price for ' + key : 'engine says $' + engine);
});

console.log('\n2. nobody re-declares the money rules locally');
const files = fs.readFileSync(path.join(ROOT, 'files.html'), 'utf8');
const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/submit-tc-invoice/index.ts'), 'utf8');
check('files.html has no local SERVICE_PRICE', !/var SERVICE_PRICE\s*=\s*\{/.test(files));
check('files.html has no local SERVICE_ALIAS', !/var SERVICE_ALIAS\s*=\s*\{/.test(files));
check('files.html has no local FILE_ORG_PAY literal', !/var FILE_ORG_PAY\s*=\s*\d/.test(files));
check('files.html loads the engine', /src="\/js\/pay-engine\.js"/.test(files));
check('submit-tc-invoice has no local SERVICE_PRICE', !/const SERVICE_PRICE[^=]*=\s*\{/.test(fn));
check('submit-tc-invoice imports the engine', /pay-engine\.js/.test(fn));

console.log('\n3. pay branches still return the known-good figures');
const outside = { submitted_by_tc: 'true' };
check('tc_one_side @50% = $200', PAY.tcPayCeiling({ service_type:'tc_one_side', file_type:'sale', raw_form_data:outside }, 50) === 200);
check('tc_one_side @40% = $160', PAY.tcPayCeiling({ service_type:'tc_one_side', file_type:'sale', raw_form_data:outside }, 40) === 160);
check('mls_setup  @40% = $40',  PAY.tcPayCeiling({ service_type:'mls_setup', file_type:'listing', raw_form_data:outside }, 40) === 40);   // MLS Setup dropped $149 -> $99 (Jul 2026)
check('file_org SERVICE = 50% of $99 = $49.50', PAY.tcPayCeiling({ service_type:'file_org', file_type:'listing', raw_form_data:{ submitted_by_tc:'false' } }, 50) === 49.5);   // File Org service dropped flat-$80 -> flat 50% (Jul 2026)
check('file_org via compliance file_type = $49.50', PAY.tcPayCeiling({ service_type:'', file_type:'compliance', raw_form_data:{ submitted_by_tc:'false' } }, 40) === 49.5);
check('in-house / self-coordinated still = $80 flat', PAY.tcPayCeiling({ service_type:'tc_one_side', file_type:'sale', agent_id:'A', assigned_tc_id:'A', raw_form_data:{ aari_realty:'true' } }, 50) === 80);
check('fo_override still = $80 flat', PAY.tcPayCeiling({ service_type:'tc_one_side', file_type:'sale', raw_form_data:{ submitted_by_tc:'false', fo_override:'true' } }, 50) === 80);
check('lc resolves to $249', PAY.svcPrice({ service_type:'lc' }) === 249);
check('op_basic resolves to $79', PAY.svcPrice({ service_type:'op_basic' }) === 79);
check('unknown service = $0 (no guessing)', PAY.svcPrice({ service_type:'rental' }) === 0);
check('member $50 comes off AARI, coordinator pay unchanged',
      PAY.atTcCut({ service_type:'tc_one_side', raw_form_data:outside }, 50) === 200 &&
      PAY.chargedPrice({ service_type:'tc_one_side', raw_form_data:outside }, { hasMembership:true }) === 349);
check('submitted_by_tc:"false" is not treated as truthy',
      PAY.isAariRealtyFile({ raw_form_data:{ submitted_by_tc:'false', source:'master_import' } }) === true);

console.log('');
if(failures.length){
  console.error('DRIFT DETECTED · ' + failures.length + ' check(s) failed:');
  failures.forEach(function(f){ console.error('  - ' + f); });
  process.exit(1);
}
console.log('pay-engine guard: all checks passed.');

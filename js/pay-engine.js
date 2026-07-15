/* ============================================================================
   Aari Transactions — Shared Pay + Price Engine (July 2026)
   ============================================================================
   SINGLE SOURCE OF TRUTH for what a service costs and what a coordinator earns.
   Used by BOTH the TC cockpit (files.html) and the submit-tc-invoice edge
   function. Do not duplicate these numbers or rules anywhere else — read them
   from AariPayEngine.

   WHY THIS FILE EXISTS. The cockpit and the invoice server each carried their
   own copy of SERVICE_PRICE + the pay branches. Change a price in one and
   forget the other and the invoice silently disagrees with the screen the
   coordinator was looking at. /js/deadline-engine.js already suffers this: see
   friday-summary ("server-side port") and loan-deadline-ping ("mirrors ...
   keep in sync"), both hand-copies guarded only by a comment. This file is the
   fix for the money path.

   HOW IT LOADS IN BOTH WORLDS. deadline-engine.js ends in `})(window)`, which
   is why the server had to port it — `window` does not exist in Deno. This file
   closes over `globalThis` and declares no import/export, which makes it BOTH a
   valid classic <script> AND a valid ES module. So:
     browser  ·  <script src="/js/pay-engine.js"></script>  -> window.AariPayEngine
     Deno     ·  import "./pay-engine.js";                  -> globalThis.AariPayEngine
   The edge function ships this exact file in its bundle, so there is one file
   to edit. NOTE: the function pins the copy it was deployed with — after
   changing a price here, REDEPLOY submit-tc-invoice or the server keeps the old
   number. `node js/pay-engine.test.js` fails loudly if the two ever disagree.

   PURE BY DESIGN. Everything here is a pure function of a file row (+ an
   injected pay % / TC name). Page state — who the TCs are (_tcsById), which
   files a membership credit covered (_creditCoverByFile), who has a membership
   (_membersById) — stays in files.html and is passed IN. That is what lets the
   server run the identical rules with no browser.
   ============================================================================ */
(function (root) {
  'use strict';

  // DEFAULT coordinator share of a service price. A coordinator may carry a
  // per-TC override (tc_pay_rates.pct); this is the fallback when none is set.
  var AT_TC_PCT = 40;
  // File Organization / in-house coordination pay a FLAT rate, not a % split.
  var FILE_ORG_PAY = 80;
  // A member pays $50 off every TC file. It comes out of AARI's share, never the
  // coordinator's pay (atTcCut is computed off the FULL price, deliberately).
  var MEMBER_TC_DISCOUNT = 50;

  // Live service prices · must match the public catalog in index.html.
  var SERVICE_PRICE = {
    tc_one_side: 399, tc_both_sides: 599, tc: 399,
    listing_coordinator: 249, listing_docs: 99, mls_setup: 149,
    file_organization: 99, standalone_review: 149,
    offer_prep_basic: 79, offer_prep_complete: 149
  };

  // Service id vocabulary. The public catalog, the intake, the database and the
  // stage engine speak SHORT ids (lc, op_basic, op_complete, file_org); the money
  // rules were written against LONG ones. Both are live and real, so every lookup
  // resolves through svcKey() first. Add new aliases HERE only — never duplicate a
  // price under a second key, that is how the two vocabularies drifted apart.
  var SERVICE_ALIAS = {
    lc: 'listing_coordinator', listing: 'listing_coordinator',
    op_basic: 'offer_prep_basic', op_complete: 'offer_prep_complete',
    file_org: 'file_organization'
  };

  var TC_SERVICE_TYPES = { tc: 1, tc_one_side: 1, tc_both_sides: 1 };
  // Services a membership CREDIT can cover. TC files are NOT credit-eligible
  // (they take the $50 discount instead) per the catalog rule.
  var CREDIT_SERVICES = {
    mls_setup: 1, listing_docs: 1, offer_prep_basic: 1,
    offer_prep_complete: 1, file_organization: 1, standalone_review: 1
  };
  // Billed upfront rather than at closing.
  var UPFRONT_SERVICES = [
    'listing_docs', 'listing_coordinator', 'mls_setup', 'offer_prep',
    'offer_prep_basic', 'offer_prep_complete', 'file_organization'
  ];

  function svcKey(f){
    var s = String((f && f.service_type) || '').toLowerCase();
    return SERVICE_ALIAS[s] || s;
  }
  function isTcService(f){ return !!TC_SERVICE_TYPES[svcKey(f)]; }
  function isCreditService(f){ return !!CREDIT_SERVICES[svcKey(f)]; }
  function isUpfrontService(f){ return UPFRONT_SERVICES.indexOf(svcKey(f)) !== -1; }
  function svcPrice(f){ return SERVICE_PRICE[svcKey(f)] || 0; }

  // An Aari Realty in-house file (our own agent's deal) vs an OUTSIDE TC client.
  // NOTE the string-truthiness trap: raw_form_data.submitted_by_tc arrives as the
  // STRING "true"/"false", and "false" is truthy in JS. Compare explicitly.
  function isAariRealtyFile(f){
    if(!f) return false;
    var r = f.raw_form_data || {};
    if(r.aari_realty === true || r.aari_realty === 'true') return true;
    if(r.submitted_by_tc === true || r.submitted_by_tc === 'true') return false;
    return String(r.source || '') === 'master_import';
  }
  function isOutsideFile(f){ return !isAariRealtyFile(f); }
  function isFileOrgFile(f){ return ((f && f.file_type) || '') === 'compliance' || svcKey(f) === 'file_organization'; }
  function isFoOverride(f){
    var v = f && f.raw_form_data && f.raw_form_data.fo_override;
    return v === true || v === 'true';
  }
  // The agent IS the assigned coordinator (they ran their own deal), so it is
  // file-org work, not a paid service. An OUTSIDE file is never self-coordinated:
  // agent_id can equal assigned_tc_id purely because the TC uploaded the file.
  // `tcName` is optional and lets a caller match imported files where the agent is
  // stored as free text; omit it and only the id match applies.
  function isSelfCoordinated(f, tcName){
    if(!f || !f.assigned_tc_id) return false;
    if(isOutsideFile(f)) return false;
    if(f.agent_id && String(f.agent_id) === String(f.assigned_tc_id)) return true;
    var an = (f.raw_form_data && f.raw_form_data.agent_name) ? String(f.raw_form_data.agent_name).trim().toLowerCase() : '';
    var tn = tcName ? String(tcName).trim().toLowerCase() : '';
    return !!(an && tn && an === tn);
  }
  function paysFileOrg(f, tcName){
    return isFileOrgFile(f) || isFoOverride(f) || isSelfCoordinated(f, tcName) || (isAariRealtyFile(f) && !isTcService(f));
  }
  // A billable service file (full price, % split).
  function isSplitFile(f, tcName){
    return !isFileOrgFile(f) && !isFoOverride(f) && !isSelfCoordinated(f, tcName) && !(isAariRealtyFile(f) && !isTcService(f));
  }
  // $50 off applies only to OUTSIDE TC clients on a membership. In-house Aari
  // Realty agents who order full TC pay full price, no discount.
  function memberTcDiscount(f, hasMembership){
    return (isOutsideFile(f) && hasMembership && isTcService(f)) ? MEMBER_TC_DISCOUNT : 0;
  }
  // The coordinator's % share. Computed off the FULL price: the member discount
  // comes out of Aari's share, NEVER the coordinator's pay.
  function atTcCut(f, pct){
    var p = svcPrice(f);
    var n = (pct != null && !isNaN(pct)) ? Number(pct) : AT_TC_PCT;
    return p ? Math.round(p * n / 100) : 0;
  }
  // What a coordinator earns on a file BEFORE membership-credit coverage is applied.
  // Coverage can only ever pull this to $0, never raise it, so this doubles as the
  // server's trustworthy CEILING when validating a submitted invoice line.
  function tcPayCeiling(f, pct, tcName){
    if(paysFileOrg(f, tcName)) return FILE_ORG_PAY;
    return atTcCut(f, pct);
  }
  // What the client actually pays. `covered` = a membership credit already paid.
  function chargedPrice(f, opts){
    var o = opts || {};
    if(o.covered) return 0;
    var p = svcPrice(f);
    return p ? (p - memberTcDiscount(f, o.hasMembership)) : 0;
  }

  root.AariPayEngine = {
    AT_TC_PCT: AT_TC_PCT, FILE_ORG_PAY: FILE_ORG_PAY, MEMBER_TC_DISCOUNT: MEMBER_TC_DISCOUNT,
    SERVICE_PRICE: SERVICE_PRICE, SERVICE_ALIAS: SERVICE_ALIAS,
    TC_SERVICE_TYPES: TC_SERVICE_TYPES, CREDIT_SERVICES: CREDIT_SERVICES, UPFRONT_SERVICES: UPFRONT_SERVICES,
    svcKey: svcKey, isTcService: isTcService, isCreditService: isCreditService,
    isUpfrontService: isUpfrontService, svcPrice: svcPrice,
    isAariRealtyFile: isAariRealtyFile, isOutsideFile: isOutsideFile,
    isFileOrgFile: isFileOrgFile, isFoOverride: isFoOverride, isSelfCoordinated: isSelfCoordinated,
    paysFileOrg: paysFileOrg, isSplitFile: isSplitFile,
    memberTcDiscount: memberTcDiscount, atTcCut: atTcCut, tcPayCeiling: tcPayCeiling,
    chargedPrice: chargedPrice
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ============================================================================
   Aari Transactions — Shared Pay + Price Engine (July 2026)
   ============================================================================
   SINGLE SOURCE OF TRUTH for what a service costs and what a coordinator earns.
   ============================================================================ */
(function (root) {
  'use strict';

  var AT_TC_PCT = 40;
  // Self-coordinated / in-house coordination pay a FLAT dollar rate, not a % split.
  var FILE_ORG_PAY = 80;
  // The File Organization SERVICE pays a flat 50% of its price ($99 -> $49.50), same for every TC.
  var FILE_ORG_SVC_PCT = 50;
  var MEMBER_TC_DISCOUNT = 50;

  var SERVICE_PRICE = {
    tc_one_side: 399, tc_both_sides: 599, tc: 399,
    listing_coordinator: 249, listing_docs: 99, mls_setup: 99,
    file_organization: 99, standalone_review: 149,
    offer_prep_basic: 79, offer_prep_complete: 149
  };

  var SERVICE_ALIAS = {
    lc: 'listing_coordinator', listing: 'listing_coordinator',
    op_basic: 'offer_prep_basic', op_complete: 'offer_prep_complete',
    file_org: 'file_organization'
  };

  var TC_SERVICE_TYPES = { tc: 1, tc_one_side: 1, tc_both_sides: 1 };
  var CREDIT_SERVICES = {
    mls_setup: 1, listing_docs: 1, offer_prep_basic: 1,
    offer_prep_complete: 1, file_organization: 1, standalone_review: 1
  };
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
  function isSplitFile(f, tcName){
    return !isFileOrgFile(f) && !isFoOverride(f) && !isSelfCoordinated(f, tcName) && !(isAariRealtyFile(f) && !isTcService(f));
  }
  function memberTcDiscount(f, hasMembership){
    return (isOutsideFile(f) && hasMembership && isTcService(f)) ? MEMBER_TC_DISCOUNT : 0;
  }
  function atTcCut(f, pct){
    var p = svcPrice(f);
    var n = (pct != null && !isNaN(pct)) ? Number(pct) : AT_TC_PCT;
    return p ? Math.round(p * n / 100) : 0;
  }
  function tcPayCeiling(f, pct, tcName){
    // File Organization service · flat 50% of its price ($49.50), every TC the same.
    if(isFileOrgFile(f)) return SERVICE_PRICE.file_organization * FILE_ORG_SVC_PCT / 100;
    // Self-coordinated / in-house / fo_override work · flat $80.
    if(paysFileOrg(f, tcName)) return FILE_ORG_PAY;
    return atTcCut(f, pct);
  }
  function chargedPrice(f, opts){
    var o = opts || {};
    if(o.covered) return 0;
    var p = svcPrice(f);
    return p ? (p - memberTcDiscount(f, o.hasMembership)) : 0;
  }

  root.AariPayEngine = {
    AT_TC_PCT: AT_TC_PCT, FILE_ORG_PAY: FILE_ORG_PAY, FILE_ORG_SVC_PCT: FILE_ORG_SVC_PCT, MEMBER_TC_DISCOUNT: MEMBER_TC_DISCOUNT,
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

/* ============================================================================
   Aari Transactions — Shared FL Deadline Engine (June 2026)
   ============================================================================
   Single source of truth for FAR/BAR AS-IS contract deadlines. Used by BOTH
   the TC cockpit (files.html) and the agent portal (portal.html). Do not
   duplicate this logic anywhere — import this file and read from
   window.AariDeadlineEngine.

   Inputs per file row: effective_date, closing_date, deadline_overrides jsonb
   ({ key: 'YYYY-MM-DD' } · manual override entered by the TC wins).
   Florida rule: a deadline landing on Sat/Sun/federal holiday rolls forward
   to the next business day.
   ============================================================================ */
(function (global) {
  'use strict';

  function ymd(d){ return d.toLocaleDateString('en-CA'); }
  // US federal holidays (observed) generated for ANY year — not hardcoded — so
  // deadlines roll correctly every year forever. Observance per 5 U.S.C. 6103
  // (mirrored by FAR/BAR Standard F): a fixed-date holiday on Saturday is
  // observed the prior Friday; on Sunday, the following Monday.
  function _nthWeekday(year, month, weekday, n){ // month 0-based · weekday 0=Sun
    const d = new Date(year, month, 1, 12); let c = 0;
    while(true){ if(d.getDay() === weekday){ if(++c === n) return d; } d.setDate(d.getDate() + 1); }
  }
  function _lastWeekday(year, month, weekday){
    const d = new Date(year, month + 1, 0, 12);
    while(d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return d;
  }
  function _observed(d){ const x = new Date(d.getTime()); const w = x.getDay(); if(w === 6) x.setDate(x.getDate() - 1); else if(w === 0) x.setDate(x.getDate() + 1); return x; }
  const _holCache = {};
  function fedHolidaysForYear(year){
    if(_holCache[year]) return _holCache[year];
    const dates = [];
    // Fixed-date holidays (with weekend observance): New Year, Juneteenth, July 4, Veterans, Christmas.
    [[0,1],[5,19],[6,4],[10,11],[11,25]].forEach(md => dates.push(_observed(new Date(year, md[0], md[1], 12))));
    dates.push(_nthWeekday(year, 0, 1, 3));   // MLK · 3rd Monday January
    dates.push(_nthWeekday(year, 1, 1, 3));   // Presidents · 3rd Monday February
    dates.push(_lastWeekday(year, 4, 1));     // Memorial · last Monday May
    dates.push(_nthWeekday(year, 8, 1, 1));   // Labor · 1st Monday September
    dates.push(_nthWeekday(year, 9, 1, 2));   // Columbus · 2nd Monday October
    dates.push(_nthWeekday(year, 10, 4, 4));  // Thanksgiving · 4th Thursday November
    const set = new Set(dates.map(ymd));
    _holCache[year] = set;
    return set;
  }
  function isFedHoliday(d){ const k = ymd(d); const y = d.getFullYear(); return fedHolidaysForYear(y).has(k) || fedHolidaysForYear(y + 1).has(k); }
  // Back-compat export · a flat set across a wide range. The live roll uses
  // isFedHoliday(), which generates any year on demand (works past the range too).
  const FED_HOLIDAYS = (function(){ const s = new Set(); const y = (new Date()).getFullYear(); for(let yr = y - 3; yr <= y + 12; yr++){ fedHolidaysForYear(yr).forEach(v => s.add(v)); } return s; })();
  // Florida rule: deadline on Sat/Sun/federal holiday rolls to next business day.
  function flBusinessDay(d){
    const x = new Date(d.getTime());
    for(let i = 0; i < 10; i++){
      const day = x.getDay();
      if(day !== 0 && day !== 6 && !isFedHoliday(x)) return x;
      x.setDate(x.getDate() + 1);
    }
    return x;
  }
  // TRID "business day" for the Closing Disclosure 3-day rule (12 CFR 1026.2(a)(6),
  // specific definition): every calendar day EXCEPT Sundays and federal holidays.
  // Saturdays COUNT — unlike flBusinessDay above, which also excludes Saturdays.
  function tridBusinessDay(d){
    const x = new Date(d.getTime());
    for(let i = 0; i < 10; i++){
      if(x.getDay() !== 0 && !isFedHoliday(x)) return x;
      x.setDate(x.getDate() + 1);
    }
    return x;
  }
  function addDays(base, n){ const d = new Date(base.getTime()); d.setDate(d.getDate() + n); return d; }
  // FR/BAR Standard F: a period of 5 days or fewer is counted in BUSINESS days
  // (excludes Sat/Sun + federal holidays); periods over 5 days are calendar days.
  function addBizIfShort(base, n){
    if(Math.abs(n) <= 5){
      const d = new Date(base.getTime()); const step = n >= 0 ? 1 : -1; let c = 0;
      while(c < Math.abs(n)){ d.setDate(d.getDate() + step); const g = d.getDay(); if(g !== 0 && g !== 6 && !isFedHoliday(d)) c++; }
      return d;
    }
    return addDays(base, n);
  }
  // FR/BAR loan approval / commitment = the EARLIER of (Effective + lappr) or (Closing - 10 days).
  function loanApprovalDate(E, C, c){
    const a = addDays(E, (c && c.lappr != null ? c.lappr : 30));
    if(!C) return a;
    const b = addDays(C, -10);
    return a < b ? a : b;
  }
  function parseDate(s){ if(!s) return null; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? null : d; }

  // Deadlines that live in the schedules for legal completeness but never
  // reach the TC's daily list, calendar sync, or overdue pane. Marlenyi
  // (July 26): "as a TC I don't need to know when the final walk-through is,
  // that's irrelevant." Walk-through is an agent/client checkpoint.
  // Filter is applied at contractDeadlines() output and DEADLINE_DEFS below,
  // so every UI consumer inherits it without changes. Downstream data exports
  // that read byKey['walk_through'] just get undefined — no cascading break.
  const HIDDEN_KEYS = new Set(['walk_through', 'walkthrough']);

  const DEADLINE_DEFS = [
    { key:'emd_initial',      label:'Initial deposit due',        from:'effective', offset:3 },
    { key:'loan_app',         label:'Loan application due',       from:'effective', offset:5 },
    { key:'emd_additional',   label:'Additional deposit due',     from:'effective', offset:10 },
    { key:'inspection_end',   label:'Inspection period ends',     from:'effective', offset:15 },
    { key:'loan_approval',    label:'Loan approval deadline',     from:'effective', offset:30 },
    { key:'tenant_lease',     label:'Tenant lease info due',      from:'effective', offset:5 },
    { key:'title_commitment', label:'Title commitment deadline',  from:'closing',   offset:-15 },
    { key:'estoppel',         label:'Estoppel letter deadline',   from:'closing',   offset:-10 },
    { key:'survey',           label:'Survey deadline',            from:'effective', offset:5 },
    // walkthrough entry removed · see HIDDEN_KEYS note above.
  ];
  // Legacy → contract key aliases, so the flat keys this function returns get
  // their dates from the contract-aware engine (single source of truth).
  const _LEGACY_ALIAS = {
    emd_initial:     ['init_deposit'],
    loan_app:        ['loan_app'],
    emd_additional:  ['additional_deposit'],
    inspection_end:  ['inspection_end', 'feasibility_end', 'due_diligence_end'],
    loan_approval:   ['loan_approval', 'finance_cont'],
    tenant_lease:    ['leases_provided', 'lease_terminate', 'tenant_lease'],
    title_commitment:['title_evidence', 'title_policy', 'buyer_title_rev', 'title_commitment'],
    estoppel:        ['estoppel', 'estoppels_due'],
    survey:          ['survey_seller', 'survey_existing', 'survey', 'survey_notice'],
    compensation:    ['compensation_agreement'],
    walkthrough:     ['walk_through', 'walkthrough'],
  };
  // All FL-rolled deadlines for a file · {} when dates are missing.
  // SINGLE SOURCE OF TRUTH: dates come from the contract-aware engine
  // (contractDeadlines). The flat FAR/BAR offsets are only a fallback for the
  // few legacy keys the contract engine does not model for this contract type,
  // so the cards/calendar/digest now show the SAME dates as the file drawer.
  // ---- SINGLE SOURCE for turning a file into engine overrides -------------
  // Every consumer (cockpit ledger, client portal, client emails) MUST build
  // overrides through this one function so the three surfaces can never show
  // different dates for the same deadline. Pulls each filled contract period
  // from a TC-entered logistics day-field, else a parsed extracted day-count,
  // and maps to BOTH the FR/BAR key and the NABOR-family synonym so whichever
  // contract type the file is, its filled value reaches the engine.
  function _numOv(a, b){
    let v = (a != null && a !== '') ? a : b;
    if(v == null || v === '') return null;
    const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function buildFileOverrides(file){
    const ov = {};
    try {
      const src = (file.deadline_overrides && typeof file.deadline_overrides === 'object') ? file.deadline_overrides : {};
      Object.keys(src).forEach(k => { if(k !== '_dates') ov[k] = src[k]; });
      const lg = file.logistics || {};
      const exf = ((file.raw_form_data || {}).extracted_contract || {}).fields || {};
      const feed = function(cfgKey, logKey, exKey){ if(ov[cfgKey] == null){ const v = _numOv(lg[logKey], exf[exKey]); if(v != null) ov[cfgKey] = v; } };
      feed('insp',         'inspection_days',         'inspection_days');
      feed('lappr',        'loan_approval_days',      'loan_approval_days');
      feed('lapp',         'loan_application_days',   'loan_application_days');
      feed('addl',         'additional_deposit_days', 'additional_deposit_days');
      feed('dep',          'initial_deposit_days',    'initial_deposit_days');
      feed('title',        'title_days',              'title_days');
      feed('fin',          'finance_days',            'finance_days');
      feed('comp',         'compensation_days',       'compensation_days');
      feed('feas',         'feasibility_days',        'feasibility_days');
      feed('sellerResp',   'seller_response_days',    'seller_response_days');
      feed('due_diligence','due_diligence_days',      'due_diligence_days');
      feed('surveyDays',   'survey_days',             'survey_days');
      feed('leaseDays',    'lease_info_days',         'lease_info_days');
      // NABOR-family types read titleDays, not title. Same filled value, second key.
      if(ov.titleDays == null && ov.title != null) ov.titleDays = ov.title;
      // HOA/condo doc-review period: 3 HOA · 7 condo resale · 15 new-construction condo.
      if(ov.hoaReview == null){
        const at = String(lg.assoc_type || '').toLowerCase();
        if(at === 'condo_new') ov.hoaReview = 15;
        else if(at === 'condo') ov.hoaReview = lg.new_construction_condo ? 15 : 7;
        else if(at === 'hoa') ov.hoaReview = 3;
      }
      // frbar_crsp's own hoa_review row reads c.hoa (not c.hoaReview) — mirror it
      // so CRSP condo files stop defaulting to 3 days.
      if(ov.hoa == null && ov.hoaReview != null) ov.hoa = ov.hoaReview;
      // TRID: closing no earlier than 3 business days after CD received (once logged).
      if(ov.cd_received == null && lg.cd_received_date) ov.cd_received = lg.cd_received_date;
    } catch(_){}
    return ov;
  }
  function fileContractDeadlines(file){
    if(!file || !file.effective_date || !file.closing_date) return [];
    // No confirmed contract type = do NOT guess. Guessing FR/BAR AS-IS applied the
    // wrong periods to NABOR / vacant-land / lease / commercial files. An unconfirmed
    // file shows no computed deadlines until the TC sets the type (the cockpit already
    // gates on this) rather than confidently-wrong ones.
    if(!file.contract_type) return [];
    return contractDeadlines(file.contract_type, file.effective_date, file.closing_date, buildFileOverrides(file)) || [];
  }
  function fileDeadlines(file){
    // Same rule as fileContractDeadlines: never guess a contract type. Without one,
    // the flat DEADLINE_DEFS fallback below would emit FR/BAR-shaped deadlines on a
    // file that may be NABOR/land/lease — wrong dates in the portal, emails, calendar.
    if(!file || !file.contract_type) return {};
    const eff = parseDate(file.effective_date);
    const close = parseDate(file.closing_date);
    const ov = (file.deadline_overrides && typeof file.deadline_overrides === 'object') ? file.deadline_overrides : {};
    // Contract-aware dates for this file. Overrides come from the ONE shared
    // builder so the portal computes exactly what the cockpit ledger does.
    const byKey = {};
    const dateOv = (ov._dates && typeof ov._dates === 'object') ? ov._dates : {};
    try {
      const ovc = buildFileOverrides(file);
      const rows = contractDeadlines(file.contract_type || 'frbar_asis', file.effective_date, file.closing_date, ovc) || [];
      rows.forEach(r => { if(r && r.key && r.date) byKey[r.key] = r.date; });
    } catch(_){ /* fall back to flat offsets below */ }
    const out = {};
    DEADLINE_DEFS.forEach(def => {
      // 1) Legacy absolute-date override · the TC typed the contract's actual date.
      if(ov[def.key] && typeof ov[def.key] !== 'object'){
        const od = parseDate(ov[def.key]);
        if(od){ out[def.key] = { label: def.label, date: od, manual: true }; return; }
      }
      const cands = _LEGACY_ALIAS[def.key] || [def.key];
      // 2) New per-deadline absolute override (deadline_overrides._dates), contract key.
      for(const ck of cands){ if(dateOv[ck]){ const od = parseDate(dateOv[ck]); if(od){ out[def.key] = { label: def.label, date: od, manual: true }; return; } } }
      // 3) Contract-aware computed date (the single source).
      for(const ck of cands){ if(byKey[ck]){ out[def.key] = { label: def.label, date: byKey[ck] }; return; } }
      // 4) Fallback · flat offset for legacy keys the contract engine does not model.
      const base = def.from === 'effective' ? eff : close;
      if(!base) return;
      out[def.key] = { label: def.label, date: flBusinessDay(addDays(base, def.offset)) };
    });
    return out;
  }
  function dlState(date){
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(date.getTime()); d.setHours(0,0,0,0);
    if(d < today) return 'overdue';
    if(d.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  }
  function fmtDl(date){ return date.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }

  // ==========================================================================
  // CONTRACT-TYPE DEADLINE SYSTEM  (Fix 3 · Phase 1 · June 2026)
  // ==========================================================================
  // Ported verbatim from the legacy CONTRACT_DEADLINES block in files.html so
  // the shared engine — not a per-page table — is the single computation
  // source for ALL 14 Florida contract types. The simple DEADLINE_DEFS path
  // above is unchanged (still powers cockpit triage + loan-deadline-ping for
  // FR/BAR AS-IS sale files). This richer path adds contract-type awareness,
  // category grouping, paragraph citations, and the Florida weekend+holiday
  // business-day roll applied uniformly (the legacy block rolled weekends
  // only, via nextBiz; here every bizDay:true deadline uses flBusinessDay).
  // Deadlines intentionally fixed by contract (Closing, Walk-Through) keep
  // bizDay:false and are never rolled — time is of the essence.
  // No reader is wired to this yet; that is Phase 2.
  // ==========================================================================

  // Default day counts per contract type. Override per file via
  // files.deadline_overrides JSONB (merged on top of these).
  const CONTRACT_DEFAULTS = {
    'frbar_asis':     { addl:10, dep:3, lapp:5, lappr:30, insp:15, title:15, comp:3 },
    'frbar_standard': { addl:10, dep:3, lapp:5, lappr:30, insp:15, sellerResp:10, title:15, comp:3 },
    'frbar_crsp':     { addl:10, dep:3, lapp:5, lappr:30, insp:15, hoa:3, title:15, comp:3 },
    'nabor':          { addl:10, dep:3, lapp:5, fin:45, insp:15, titleDays:10, surveyDays:10, leaseDays:5 },
    'nab089':         { addl:10, dep:3, lapp:5, fin:45, insp:15, titleDays:10, surveyDays:10 },
    'builder':        { addl:10, dep:5, lapp:7, lappr:30, insp:10, title:15 },
    'vac_15':         { addl:10, dep:3, lapp:5, lappr:30, feas:30, title:15 },
    'nab088':         { addl:10, dep:3, lapp:5, fin:45, feas:30, titleDays:10, surveyDays:10 },
    'cc_6':           { addl:10, dep:3, fin:45, insp:30, due_diligence:60, titleDays:30 },
    'ers_21tn':       { listing_term:180, marketing_review:14 },
    'vlla_6':         { listing_term:180, marketing_review:14 },
    'cl_11':          { lease_exec:14, app_period:7, hoa_approval:30 },
    'rlhd_3x':        { lease_term:365 },
    'bbe_1':          { bba_term:90, protection_period:90 },
    'bbe_2':          { bba_term:90, protection_period:90 },
  };

  const CONTRACT_LABELS = {
    'frbar_asis':     'FR/BAR As-Is (7x)',
    'frbar_standard': 'FR/BAR Standard (7x)',
    'frbar_crsp':     'CRSP-17 (FR Residential)',
    'nabor':          'NABOR Standard',
    'nab089':         'NABOR As-Is (NAB089)',
    'builder':        'Builder / New Construction',
    'vac_15':         'FR/BAR Vacant Land (VAC-15)',
    'nab088':         'NABOR Vacant Land (NAB088)',
    'cc_6':           'Commercial (CC-6)',
    'ers_21tn':       'Residential Listing (ERS-21TN)',
    'vlla_6':         'Vacant Land Listing (VLLA-6)',
    'cl_11':          'Contract to Lease (CL-11)',
    'rlhd_3x':        'Residential Lease (RLHD-3x)',
    'bbe_1':          'BBA Exclusive (BBE-1)',
    'bbe_2':          'BBA Non-Exclusive (BBE-2)',
  };

  // Per-contract deadline definitions. Each item:
  //   key      · unique key (matches legacy file_deadlines.deadline_key)
  //   category · group header
  //   name     · display label
  //   compute  · function(E, C, cfg) → Date
  //   bizDay   · roll to next FL business day if it lands on weekend/holiday
  //   note     · paragraph citation / short legal reference
  const CONTRACT_DEADLINES = {
    'frbar_asis': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 2(a).' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · Paragraph 8(b).' },
      { key:'loan_approval',    category:'Financing',  name:'Loan Approval Period Expires',
        compute:(E,C,c)=>loanApprovalDate(E, C, c), bizDay:true,
        note:(c)=>'Earlier of ' + c.lappr + ' days after Effective Date or 10 days before Closing · Paragraph 8(b). Failure to notify converts to cash.' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Paragraph 12. Buyer may terminate for any reason.' },
      { key:'survey_seller',    category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addBizIfShort(E, 5), bizDay:true,
        note:()=>'5 days after Effective Date if in Seller possession.' },
      { key:'survey_notice',    category:'Title',      name:'Survey / Encroachment Notice Deadline',
        compute:(E,C,c)=>addBizIfShort(C, -5), bizDay:true,
        note:()=>'5 days prior to Closing · Standard A. Buyer must give written notice of survey defects or encroachments by this date.' },
      { key:'compensation_agreement', category:'Closing', name:'Compensation Agreement Deadline',
        compute:(E,C,c)=>addBizIfShort(E, (c.comp||3)), bizDay:true,
        note:(c)=>{ var n=(c&&c.comp)||3; return n+(n===1?' day':' days')+' after Effective Date (default 3 if left blank) · Comprehensive Rider GG · Seller and Buyer\'s Broker execute the Compensation Agreement.'; } },
      { key:'title_evidence',   category:'Title',      name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.title), bizDay:true,
        note:(c)=>c.title + ' days prior to Closing · Paragraph 9(c).' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      // STANDARD F ROLL · read verbatim off an executed FloridaRealtors/FloridaBar ASIS-7x
      // Rev. 2/26 (1216 NW 32nd Pl, July 2026), Standard F, lines 429 to 436:
      //   "Other than time for acceptance and Effective Date as set forth in Paragraph 3, any
      //    time periods provided for OR DATES SPECIFIED in this Contract, whether preprinted,
      //    handwritten, typewritten or inserted herein, which shall end or occur on a Saturday,
      //    Sunday, national legal public holiday (as defined in 5 U.S.C. Sec. 6103(a)), or a day
      //    on which a national legal public holiday is observed because it fell on a Saturday or
      //    Sunday, shall extend to the next calendar day which is not a Saturday, Sunday,
      //    national legal public holiday, or a day on which a national legal public holiday is
      //    observed."
      // The Closing Date is a "date specified", so it rolls. This entry used to carry
      // bizDay:false, on the reasoning that "time is of the essence" makes the date immovable.
      // That reads Standard F backwards: the Standard says time is of the essence AND THEN
      // grants the weekend/holiday extension, in the same sentence. They are not in tension.
      // Only acceptance and Effective Date are carved out, and neither is computed here.
      // flBusinessDay() advances past Sat, Sun and federal holidays, exactly the set Standard F
      // names, and only ever moves forward.
      // SCOPE: verified for THIS form only. frbar_standard, frbar_crsp, vac_15, nabor, nab089,
      // nab088, builder and cc_6 keep bizDay:false on closing because their own time provisions
      // have not been read yet. Do not copy this flag across on the assumption that they match.
      // WALK-THROUGH is deliberately left alone. It is "day prior to Closing Date", so when
      // closing rolls Sat -> Mon the walk-through reads Sunday, and whether Standard F then
      // extends the walk-through into the closing day itself is a question for counsel, not a
      // guess to bury in code.
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:true,
        note:()=>'As set in contract. Time is of the essence. A Closing Date landing on a Saturday, Sunday or national legal public holiday extends to the next day that is none of those \u00b7 Standard F.' },
    ],
    'frbar_standard': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 2(a).' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · Paragraph 8(b).' },
      { key:'loan_approval',    category:'Financing',  name:'Loan Approval Period Expires',
        compute:(E,C,c)=>loanApprovalDate(E, C, c), bizDay:true,
        note:(c)=>'Earlier of ' + c.lappr + ' days after Effective Date or 10 days before Closing · Paragraph 8(b).' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Paragraph 12. Written notice of defects required.' },
      { key:'seller_response',  category:'Inspections', name:'Seller Response to Defects Deadline',
        compute:(E,C,c)=>addDays(E, c.insp + c.sellerResp), bizDay:true,
        note:(c)=>c.sellerResp + ' days after Buyer notice · Seller repairs or estimate.' },
      { key:'survey_seller',    category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addBizIfShort(E, 5), bizDay:true,
        note:()=>'5 days after Effective Date if in Seller possession.' },
      { key:'survey_notice',    category:'Title',      name:'Survey / Encroachment Notice Deadline',
        compute:(E,C,c)=>addBizIfShort(C, -5), bizDay:true,
        note:()=>'5 days prior to Closing · Standard A. Buyer must give written notice of survey defects or encroachments by this date.' },
      { key:'compensation_agreement', category:'Closing', name:'Compensation Agreement Deadline',
        compute:(E,C,c)=>addBizIfShort(E, (c.comp||3)), bizDay:true,
        note:(c)=>{ var n=(c&&c.comp)||3; return n+(n===1?' day':' days')+' after Effective Date (default 3 if left blank) · Comprehensive Rider GG · Seller and Buyer\'s Broker execute the Compensation Agreement.'; } },
      { key:'title_evidence',   category:'Title',      name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.title), bizDay:true,
        note:(c)=>c.title + ' days prior to Closing · Paragraph 9(c).' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to or day of closing.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'As set in contract. Time is of the essence.' },
    ],
    'frbar_crsp': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 2(a).' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · Paragraph 8(b).' },
      { key:'loan_approval',    category:'Financing',  name:'Loan Approval Period Expires',
        compute:(E,C,c)=>loanApprovalDate(E, C, c), bizDay:true,
        note:(c)=>'Earlier of ' + c.lappr + ' days after Effective Date or 10 days before Closing · Paragraph 8(b).' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Paragraph 12.' },
      { key:'hoa_review',       category:'HOA',        name:'HOA/Condo Doc Review Deadline',
        compute:(E,C,c)=>addDays(E, c.hoa), bizDay:true,
        note:(c)=>c.hoa + ' days after association docs · Rider A/B. Cannot be waived.' },
      { key:'survey_seller',    category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addBizIfShort(E, 5), bizDay:true,
        note:()=>'5 days after Effective Date if in Seller possession.' },
      { key:'survey_notice',    category:'Title',      name:'Survey / Encroachment Notice Deadline',
        compute:(E,C,c)=>addBizIfShort(C, -5), bizDay:true,
        note:()=>'5 days prior to Closing · Standard A. Buyer must give written notice of survey defects or encroachments by this date.' },
      { key:'compensation_agreement', category:'Closing', name:'Compensation Agreement Deadline',
        compute:(E,C,c)=>addBizIfShort(E, (c.comp||3)), bizDay:true,
        note:(c)=>{ var n=(c&&c.comp)||3; return n+(n===1?' day':' days')+' after Effective Date (default 3 if left blank) · Comprehensive Rider GG · Seller and Buyer\'s Broker execute the Compensation Agreement.'; } },
      { key:'title_evidence',   category:'Title',      name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.title), bizDay:true,
        note:(c)=>c.title + ' days prior to Closing · Paragraph 9(c).' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'As set in contract. Time is of the essence.' },
    ],
    'nabor': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date.' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · Section 4(b).' },
      { key:'finance_cont',     category:'Financing',  name:'Finance Contingency Expires',
        compute:(E,C,c)=>addDays(E, c.fin), bizDay:true,
        note:(c)=>c.fin + ' days after Effective Date · Section 4(b).' },
      { key:'title_policy',     category:'Title',      name:'Seller Provides Title Policy',
        compute:(E,C,c)=>addDays(E, c.titleDays), bizDay:true,
        note:(c)=>c.titleDays + ' days after Effective Date · Standard B.' },
      { key:'survey_existing',  category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addDays(E, c.surveyDays), bizDay:true,
        note:(c)=>c.surveyDays + ' days after Effective Date · Standard C.' },
      { key:'buyer_title_rev',  category:'Title',      name:'Buyer Title Review Deadline',
        compute:(E,C,c)=>addDays(E, 30), bizDay:true,
        note:()=>'30 days after Effective Date · Standard B.' },
      { key:'leases_provided',  category:'Leases',     name:'Seller Provides Written Leases',
        compute:(E,C,c)=>addDays(E, c.leaseDays), bizDay:true,
        note:(c)=>c.leaseDays + ' days after Effective Date · Lines 100-105.' },
      { key:'lease_terminate',  category:'Leases',     name:'Buyer Lease Termination Deadline',
        compute:(E,C,c)=>addDays(E, 10), bizDay:true,
        note:()=>'10 days after Effective Date.' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Section 6.' },
      { key:'seller_response',  category:'Inspections', name:'Seller Response to Defects',
        compute:(E,C,c)=>addDays(E, c.insp + 10), bizDay:true,
        note:()=>'10 days after Buyer notice.' },
      { key:'assignment_disc',  category:'Closing',    name:'Assignment Disclosure Deadline',
        compute:(E,C,c)=>addDays(C, -15), bizDay:true,
        note:()=>'15 days prior to closing · Standard A.' },
      { key:'buyer_survey',     category:'Closing',    name:'Buyer Survey Deadline',
        compute:(E,C,c)=>addBizIfShort(C, -5), bizDay:true,
        note:()=>'5 days prior to closing.' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing · Standard D.2.d.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Time is of the essence for Closing Date only.' },
    ],
    'nab089': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 4(a).' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · Paragraph 6.' },
      { key:'finance_cont',     category:'Financing',  name:'Finance Contingency Expires',
        compute:(E,C,c)=>addDays(E, c.fin), bizDay:true,
        note:(c)=>c.fin + ' days after Effective Date · Paragraph 6.' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Section 6. Buyer may terminate.' },
      { key:'title_policy',     category:'Title',      name:'Seller Provides Title Policy',
        compute:(E,C,c)=>addDays(E, c.titleDays), bizDay:true,
        note:(c)=>c.titleDays + ' days after Effective Date · Standard B.' },
      { key:'survey_existing',  category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addDays(E, c.surveyDays), bizDay:true,
        note:(c)=>c.surveyDays + ' days after Effective Date · Standard C.' },
      { key:'buyer_title_rev',  category:'Title',      name:'Buyer Title Review Deadline',
        compute:(E,C,c)=>addDays(E, 30), bizDay:true,
        note:()=>'30 days after Effective Date · Standard B.' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Time is of the essence for Closing.' },
    ],
    'builder': [
      { key:'init_deposit',   category:'Deposits',    name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · confirm from the builder contract.' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',       category:'Financing',   name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.lapp), bizDay:true,
        note:(c)=>c.lapp + ' days after Effective Date · confirm from the builder contract.' },
      { key:'loan_approval',  category:'Financing',   name:'Loan Approval / Commitment',
        compute:(E,C,c)=>loanApprovalDate(E, C, c), bizDay:true,
        note:(c)=>'Earlier of ' + c.lappr + ' days after Effective Date or 10 days before Closing · confirm from the builder contract.' },
      { key:'inspection_end', category:'Inspections', name:'Inspection / Walk-Through Period',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · confirm from the builder contract.' },
      { key:'title_evidence', category:'Title',       name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.title), bizDay:true,
        note:(c)=>c.title + ' days prior to Closing · confirm from the builder contract.' },
      { key:'walk_through',   category:'Closing',     name:'Final Walk-Through',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',        category:'Closing',     name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'As set in the builder contract.' },
    ],
    'vac_15': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 2(a).' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, (c.lapp||5)), bizDay:true,
        note:(c)=>((c&&c.lapp)||5) + ' days after Effective Date · financing paragraph. Financed deals only.' },
      { key:'loan_approval',    category:'Financing',  name:'Loan Approval / Commitment',
        compute:(E,C,c)=>loanApprovalDate(E, C, c), bizDay:true,
        note:(c)=>'Earlier of ' + ((c&&c.lappr)||30) + ' days after Effective Date or 10 days before Closing · financing paragraph. Financed deals only.' },
      { key:'feasibility_end',  category:'Feasibility', name:'Feasibility Study Period Ends',
        compute:(E,C,c)=>addDays(E, c.feas), bizDay:true,
        note:(c)=>c.feas + ' days after Effective Date · Paragraph 9. Buyer may terminate.' },
      { key:'survey_seller',    category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addBizIfShort(E, 5), bizDay:true,
        note:()=>'5 days after Effective Date if in Seller possession.' },
      { key:'title_evidence',   category:'Title',      name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.title), bizDay:true,
        note:(c)=>c.title + ' days prior to Closing · Paragraph 10.' },
      { key:'walk_through',     category:'Closing',    name:'Property Inspection / Walk',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Time is of the essence.' },
    ],
    'nab088': [
      { key:'init_deposit',     category:'Deposits',   name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date.' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'loan_app',         category:'Financing',  name:'Loan Application Deadline',
        compute:(E,C,c)=>addBizIfShort(E, (c.lapp||5)), bizDay:true,
        note:(c)=>((c&&c.lapp)||5) + ' days after Effective Date · financing contingency. Financed deals only.' },
      { key:'finance_cont',     category:'Financing',  name:'Financing Contingency Period',
        compute:(E,C,c)=>addDays(E, (c.fin||45)), bizDay:true,
        note:(c)=>((c&&c.fin)||45) + ' days after Effective Date · financing contingency. Financed deals only.' },
      { key:'feasibility_end',  category:'Feasibility', name:'Feasibility Study Period Ends',
        compute:(E,C,c)=>addDays(E, c.feas), bizDay:true,
        note:(c)=>c.feas + ' days after Effective Date. Buyer may terminate.' },
      { key:'title_policy',     category:'Title',      name:'Seller Provides Title Policy',
        compute:(E,C,c)=>addDays(E, c.titleDays), bizDay:true,
        note:(c)=>c.titleDays + ' days after Effective Date · Standard B.' },
      { key:'survey_existing',  category:'Title',      name:'Seller Provides Existing Survey',
        compute:(E,C,c)=>addDays(E, c.surveyDays), bizDay:true,
        note:(c)=>c.surveyDays + ' days after Effective Date.' },
      { key:'walk_through',     category:'Closing',    name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',          category:'Closing',    name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Time is of the essence.' },
    ],
    'cc_6': [
      { key:'init_deposit',     category:'Deposits',    name:'Initial Deposit Deadline',
        compute:(E,C,c)=>addBizIfShort(E, c.dep), bizDay:true,
        note:(c)=>c.dep + ' days after Effective Date · Paragraph 2.' },
      { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
        compute:(E,C,c)=>addDays(E, (c.addl||10)), bizDay:true,
        note:(c)=>((c&&c.addl)||10) + ' days after Effective Date (default 10 if left blank) · Paragraph 2(b) / additional deposit.' },
      { key:'finance_cont',     category:'Financing',   name:'Finance Contingency Expires',
        compute:(E,C,c)=>addDays(E, c.fin), bizDay:false,
        note:(c)=>c.fin + ' days after Effective Date.' },
      { key:'inspection_end',   category:'Inspections', name:'Inspection Period Ends',
        compute:(E,C,c)=>addDays(E, c.insp), bizDay:true,
        note:(c)=>c.insp + ' days after Effective Date · Paragraph 8.' },
      { key:'due_diligence_end', category:'Due Diligence', name:'Due Diligence Period Ends',
        compute:(E,C,c)=>addDays(E, c.due_diligence), bizDay:false,
        note:(c)=>c.due_diligence + ' days after Effective Date · includes Phase I ESA + estoppels + rent roll + financials.' },
      { key:'title_evidence',   category:'Title',       name:'Title Evidence Deadline',
        compute:(E,C,c)=>addDays(C, -c.titleDays), bizDay:true,
        note:(c)=>c.titleDays + ' days prior to Closing · commercial title takes longer.' },
      { key:'estoppels_due',    category:'Tenants',     name:'Tenant Estoppels Received',
        compute:(E,C,c)=>addDays(C, -30), bizDay:false,
        note:()=>'30 days prior to closing · operational continuity.' },
      { key:'snda_received',    category:'Tenants',     name:'SNDA Agreements Received',
        compute:(E,C,c)=>addDays(C, -30), bizDay:false,
        note:()=>'30 days prior to closing · if lender requires.' },
      { key:'walk_through',     category:'Closing',     name:'Walk-Through Inspection',
        compute:(E,C,c)=>addDays(C, -1), bizDay:false,
        note:()=>'Day prior to closing.' },
      { key:'closing',          category:'Closing',     name:'Closing Date',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Time is of the essence.' },
    ],
    'ers_21tn': [
      { key:'listing_start',    category:'Listing Term', name:'Listing Period Start',
        compute:(E,C,c)=>E, bizDay:false,
        note:()=>'Effective Date · Paragraph 1.' },
      { key:'marketing_review', category:'Marketing',    name:'Initial Marketing Review',
        compute:(E,C,c)=>addDays(E, c.marketing_review), bizDay:false,
        note:(c)=>c.marketing_review + ' days after listing live · price + traffic check-in.' },
      { key:'listing_expires',  category:'Listing Term', name:'Listing Period Expires',
        compute:(E,C,c)=>addDays(E, c.listing_term), bizDay:false,
        note:(c)=>c.listing_term + ' days from Effective Date · Paragraph 1. Re-list decision required.' },
    ],
    'vlla_6': [
      { key:'listing_start',    category:'Listing Term', name:'Listing Period Start',
        compute:(E,C,c)=>E, bizDay:false,
        note:()=>'Effective Date.' },
      { key:'marketing_review', category:'Marketing',    name:'Initial Marketing Review',
        compute:(E,C,c)=>addDays(E, c.marketing_review), bizDay:false,
        note:(c)=>c.marketing_review + ' days after listing live · zoning + use-case messaging review.' },
      { key:'listing_expires',  category:'Listing Term', name:'Listing Period Expires',
        compute:(E,C,c)=>addDays(E, c.listing_term), bizDay:false,
        note:(c)=>c.listing_term + ' days from Effective Date. Re-list decision required.' },
    ],
    'cl_11': [
      { key:'lease_exec',       category:'Execution',    name:'Lease Execution Deadline',
        compute:(E,C,c)=>addDays(E, c.lease_exec), bizDay:false,
        note:(c)=>c.lease_exec + ' days after Contract to Lease execution.' },
      { key:'app_period',       category:'Application',  name:'Application Period Ends',
        compute:(E,C,c)=>addDays(E, c.app_period), bizDay:false,
        note:(c)=>c.app_period + ' days for Tenant application + background check.' },
      { key:'hoa_approval_dl',  category:'HOA',          name:'HOA Approval Deadline',
        compute:(E,C,c)=>addDays(E, c.hoa_approval), bizDay:false,
        note:(c)=>c.hoa_approval + ' days for HOA approval · Paragraph 11. CRITICAL · cannot occupy without approval.' },
      { key:'lease_start',      category:'Term',         name:'Lease Term Begins',
        compute:(E,C,c)=>C, bizDay:false,
        note:()=>'Target lease start date.' },
    ],
    'rlhd_3x': [
      { key:'rent_due_start',   category:'Rent',         name:'First Rent Due',
        compute:(E,C,c)=>E, bizDay:false,
        note:()=>'Lease Effective Date.' },
      { key:'lease_expires',    category:'Term',         name:'Lease Term Expires',
        compute:(E,C,c)=>addDays(E, c.lease_term), bizDay:false,
        note:(c)=>c.lease_term + ' days from Lease Effective Date · renewal decision triggers at 60 days out.' },
      { key:'renewal_window',   category:'Term',         name:'Renewal Decision Window Opens',
        compute:(E,C,c)=>addDays(addDays(E, c.lease_term), -60), bizDay:false,
        note:()=>'60 days before lease expiration · LL and Tenant decide renew or end.' },
    ],
    'bbe_1': [
      { key:'bba_start',        category:'BBA Term',     name:'BBA Term Begins',
        compute:(E,C,c)=>E, bizDay:false,
        note:()=>'Effective Date · Paragraph 1.' },
      { key:'bba_term_end',     category:'BBA Term',     name:'BBA Term Ends',
        compute:(E,C,c)=>addDays(E, c.bba_term), bizDay:false,
        note:(c)=>c.bba_term + ' days from Effective Date · Paragraph 1. Decision to renew required.' },
      { key:'protection_end',   category:'Protection Period', name:'Protection Period Ends',
        compute:(E,C,c)=>addDays(addDays(E, c.bba_term), c.protection_period), bizDay:false,
        note:(c)=>c.protection_period + ' days after BBA term ends · Paragraph 7. Compensation owed if Buyer purchases shown property in this window.' },
    ],
    'bbe_2': [
      { key:'bba_start',        category:'BBA Term',     name:'BBA Term Begins',
        compute:(E,C,c)=>E, bizDay:false,
        note:()=>'Effective Date · Paragraph 1.' },
      { key:'bba_term_end',     category:'BBA Term',     name:'BBA Term Ends',
        compute:(E,C,c)=>addDays(E, c.bba_term), bizDay:false,
        note:(c)=>c.bba_term + ' days from Effective Date.' },
      { key:'protection_end',   category:'Protection Period', name:'Protection Period Ends',
        compute:(E,C,c)=>addDays(addDays(E, c.bba_term), c.protection_period), bizDay:false,
        note:(c)=>c.protection_period + ' days after BBA term ends · non-exclusive · procuring cause must be documented.' },
    ],
  };

  // Compute every deadline for a contract type, in definition order.
  // Returns [] for unknown type or missing Effective Date.
  //   contractType · key into CONTRACT_DEADLINES
  //   effective    · Date | 'YYYY-MM-DD' | ISO string (Effective Date)
  //   closing      · Date | 'YYYY-MM-DD' | ISO string (Closing Date) · may be
  //                  null for listing/lease/BBA types that don't use it
  //   overrides    · per-file day-count overrides merged over CONTRACT_DEFAULTS
  // Each row: { key, category, name, date, computedDate, bizDay, citation }
  function _toDate(v){
    if(!v) return null;
    if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v);
    // Anchor 10-char dates at NOON (matches parseDate), so both engines agree and
    // daylight-saving never shifts the calendar day used by the weekend roll.
    const d = new Date(s.length === 10 ? (s + 'T12:00:00') : s);
    return isNaN(d.getTime()) ? null : d;
  }
  // Conditional deadlines appended to residential SALE contracts. The cockpit
  // shows each only when its condition holds (appraisal = financed file;
  // additional deposit = an amount entered in Contract Terms; HOA review +
  // estoppel = an association on the property). Skipped if the base array
  // already defines the key, so we never duplicate.
  const SALE_TYPES = ['frbar_asis','frbar_standard','frbar_crsp','nabor','nab089','builder'];
  // TRID business days for the Closing Disclosure 3-day rule: Saturdays COUNT; Sundays
  // and federal holidays do not (12 CFR 1026.2(a)(6)).
  function addTridDays(base, n){ const d = new Date(base.getTime()); let c = 0; while(c < n){ d.setDate(d.getDate() + 1); if(d.getDay() !== 0 && !isFedHoliday(d)) c++; } return d; }
  const SALE_EXTRAS = [
    { key:'cd_earliest', category:'Closing', name:'Earliest Closing (CD + 3 business days)',
      compute:(E,C,c)=>{ if(!c || !c.cd_received) return null; const d = parseDate(c.cd_received); return d ? addTridDays(d, 3) : null; }, bizDay:false,
      note:()=>'TRID: closing may not occur until 3 business days after the buyer receives the Closing Disclosure (Saturdays count; Sundays and federal holidays do not). Only appears once the CD-received date is logged.' },
    { key:'appraisal', category:'Financing', name:'Appraisal',
      compute:(E,C,c)=>addBizIfShort(C, -5), bizDay:true,
      note:()=>'Lender schedules the actual date · target a few days before the final walk-through. Update with the real date once the lender confirms.' },
    { key:'additional_deposit', category:'Deposits', name:'Additional Deposit Deadline',
      compute:(E,C,c)=>addDays(E, c.addlDep || 10), bizDay:true,
      note:(c)=>(c.addlDep || 10) + ' days after Effective Date · Paragraph 2(b).' },
    { key:'hoa_review', category:'HOA', name:'HOA/Condo Doc Review Deadline',
      compute:(E,C,c)=>addDays(E, c.hoaReview || 3), bizDay:true,
      note:()=>'3-day review on receipt of governance docs · Condo/HOA Rider. Buyer may cancel.' },
    { key:'estoppel', category:'HOA', name:'Estoppel Received',
      compute:(E,C,c)=>addDays(C, -10), bizDay:true,
      note:()=>'Order early · estoppel/governance package received before closing.' },
  ];
  function contractDeadlines(contractType, effective, closing, overrides){
    const baseDefs = CONTRACT_DEADLINES[contractType];
    if(!baseDefs) return [];
    const E = _toDate(effective);
    const C = _toDate(closing);
    if(!E) return [];
    const cfg = Object.assign({}, CONTRACT_DEFAULTS[contractType] || {}, overrides || {});
    let defs = baseDefs;
    if(SALE_TYPES.indexOf(contractType) !== -1){
      const have = {}; baseDefs.forEach(d => { have[d.key] = true; });
      defs = baseDefs.concat(SALE_EXTRAS.filter(x => !have[x.key]));
    }
    const rows = [];
    for(const it of defs){
      // Global TC-side hide list · never emit walk-through, etc. See HIDDEN_KEYS.
      if(HIDDEN_KEYS.has(it.key)) continue;
      let computed;
      try { computed = it.compute(E, C, cfg); } catch(_){ computed = null; }
      if(!computed || isNaN(computed.getTime())) continue;
      // Florida business-day roll, applied uniformly where bizDay:true.
      const date = it.bizDay ? flBusinessDay(computed) : computed;
      rows.push({
        key: it.key,
        category: it.category,
        name: it.name,
        date: date,
        computedDate: computed,
        bizDay: !!it.bizDay,
        citation: typeof it.note === 'function' ? it.note(cfg) : (it.note || ''),
      });
    }
    return rows;
  }
  function contractLabel(contractType){ return CONTRACT_LABELS[contractType] || contractType || ''; }

  global.AariDeadlineEngine = {
    FED_HOLIDAYS, fedHolidaysForYear, isFedHoliday, ymd, flBusinessDay, tridBusinessDay, addDays, parseDate,
    DEADLINE_DEFS, fileDeadlines, dlState, fmtDl,
    // Fix 3 · contract-type system (Phase 1)
    CONTRACT_DEFAULTS, CONTRACT_LABELS, CONTRACT_DEADLINES,
    contractDeadlines, contractLabel, LEGACY_ALIAS: _LEGACY_ALIAS,
    // Shared file→overrides builder · the ONE path all surfaces use.
    buildFileOverrides, fileContractDeadlines,
  };
})(window);

/* ============================================================================
   Aari Transactions — SELLER TASK CHECKLIST  ·  DRAFT FOR REVIEW (not merged)
   ============================================================================
   Purpose: seller-side task set for files.html, mirroring the existing buyer
   STAGE_CHECKLISTS.sale pattern. Renders through the SAME ckRow template,
   persists to the SAME files.stage_tasks column, and reads dates from the SAME
   window.AariDeadlineEngine. Nothing new to build in the DB or the renderer.

   HOW THIS PLUGS IN (mechanical, after content is approved):
     1. SELLER_STAGE_CHECKLISTS below is selected when a SALE file represents the
        seller. Selector: sellerSide(f) === true, where
          sellerSide = (f)=> ['seller','both'].indexOf((f.client_type||'')) !== -1
     2. In renderStageChecklist(), after `let tasks = ckTasksFor(file, stage);`
        branch: if(file.file_type==='sale' && sellerSide(file))
                   tasks = SELLER_STAGE_CHECKLISTS[stage] (fall back to buyer set for 'both').
     3. Merge SELLER_EMAIL_PLAYBOOK into EMAIL_PLAYBOOK.sale (keyed by task id),
        so the inline "Send · <label>" button appears under each task exactly
        like the buyer side.
   No toggle is added. Buyer vs seller is data-driven by client_type, the same
   field the existing scopeChip already reads.

   STAGE MAPPING (your 7 labels -> real sale spine):
     Contract Type ┐
     Parties       ├─ all live inside the Setup stage  (engine key: 'waiting_for_tc')
     Financing     │  as confirmation sub-steps, same as the buyer side.
     Terms & Dates ┘
     Under Contract .......... engine key: 'under_contract'
     Clear to Close .......... engine key: 'ctc'
     Closed .................. engine key: 'closed'
   'new' (pre-acceptance intake) is kept as its own tiny gate, same as buyer.

   DEADLINE SOURCE (verified, no web research):
     All dates below reference EXISTING engine keys in js/deadline-engine.js.
     Day-count basis is the engine's, per contract_type:
       frbar_asis / frbar_standard / frbar_crsp / vac_15 → calendar days,
         final date rolls to next business day (bizDay:true, FR/BAR Standard F).
       nabor → calendar days, NO roll, expires 11:59 PM on the day (bizDay:false).
     Seller-owned engine keys reused:
       survey_seller, survey_existing (NABOR), title_evidence, title_policy (NABOR),
       seller_response (Standard + NABOR), hoa_review (CRSP), leases_provided (NABOR),
       compensation_agreement, closing.

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ REVIEW FLAG 1 — CRSP day-count. Built CALENDAR days to match the engine   │
   │   and FR/BAR Standard F, NOT business days as the spec stated. Confirm.    │
   │ REVIEW FLAG 2 — VAC (vac_15) has no inspection/repair and often no        │
   │   financing contingency. Seller tasks reflect that. Confirm the vac_15     │
   │   feasibility default day count matches your executed Vacant Land form.    │
   │ REVIEW FLAG 3 — Seller's Property Disclosure has no engine date (it is a   │
   │   pre-contract obligation). Modeled as a confirmation task, not a dated    │
   │   deadline. Johnson v. Davis known-defect duty noted in the sub.           │
   └─────────────────────────────────────────────────────────────────────────┘

   TONE: email copy is Alex Cattoni style — one idea, identity + scene + task +
   deadline, no filler, no dashes, no signature (the TC's client signs).
   ============================================================================ */

(function (global) {
  'use strict';

  // Contract-type gates. file.contract_type uses the engine keys.
  var IS = {
    asis:     function(f){ return f.contract_type === 'frbar_asis'; },
    standard: function(f){ return f.contract_type === 'frbar_standard'; },
    crsp:     function(f){ return f.contract_type === 'frbar_crsp'; },
    nabor:    function(f){ return f.contract_type === 'nabor' || f.contract_type === 'nab089'; },
    vac:      function(f){ return f.contract_type === 'vac_15'; },
    farbar:   function(f){ return ['frbar_asis','frbar_standard','frbar_crsp'].indexOf(f.contract_type) !== -1; },
    repairs:  function(f){ return ['frbar_standard','nabor','nab089'].indexOf(f.contract_type) !== -1; } // has a seller repair-response window
  };
  // Reuse the file's existing helpers when present (assocType, financingType, etc).
  var hasHoa    = function(f){ return typeof assocType === 'function' ? !!assocType(f) : false; };
  var isCondo   = function(f){ return typeof assocType === 'function' ? assocType(f) === 'condo' : false; };
  var tenantOcc = function(f){ return !!(f.logistics || {}).tenant_occupied; };

  // ==========================================================================
  // SELLER TASKS BY STAGE
  //   Each task: { id, label, owner, sub, dl?, showIf?, softComplete? }
  //   owner ∈ 'TC' | 'Seller' | 'Agent' (our listing/seller agent) | 'Title' | 'Buyer side'
  //   dl links to an engine key so the due date resolves per contract_type.
  //   showIf gives you ONE task name with different applicability + due dates.
  // ==========================================================================
  var SELLER_STAGE_CHECKLISTS = {

    // ---- NEW · pre-acceptance gate (same as buyer) --------------------------
    'new': [
      { id:'s_new_contract_attached', owner:'TC',
        label:'Confirm executed contract + addenda attached',
        sub:'Fully executed contract, all riders, and the compensation agreement uploaded and signed by all parties before anything else.' },
      { id:'s_new_signatures_verified', owner:'TC',
        label:'Verify all seller signatures + initials',
        sub:'Every page, every signature line, every initial box on the seller side. Do not proceed until the seller execution is complete.' },
      { id:'s_new_payment_check', owner:'TC', systemCheck:'payment' }
    ],

    // ---- SETUP · Contract Type / Parties / Financing / Terms & Dates --------
    // (engine stage key 'waiting_for_tc'; these are confirmations, not dated)
    'waiting_for_tc': [
      { id:'s_setup_accept', owner:'TC', systemCheck:'accept',
        label:'Accept file',
        sub:'Once you accept, this file is yours and the 30 minute window closes.' },
      { id:'s_setup_review_contract', owner:'TC',
        label:'Review full contract + confirm contract type',
        sub:'Know the form before you make contact. Confirm the contract type so every deadline below counts on the right basis. FR/BAR and VAC count calendar days and roll the final date to the next business day. NABOR counts calendar days and expires 11:59 PM on the day.' },
      { id:'s_setup_sellers_disclosure', owner:'Seller',
        label:'Confirm Seller’s Property Disclosure signed by the seller',
        sub:'The seller completes it, not the agent and not the TC. Confirm it is signed and dated by the seller. Johnson v. Davis: the seller must disclose known latent defects, and non-disclosure creates liability for seller, agent, and broker. If missing, request it from the agent now.',
        softComplete:{ label:'Mark received', chip:'Received', flag:'sellers_disclosure' } },
      { id:'s_setup_parties', owner:'TC',
        label:'Confirm seller parties + entity signers',
        sub:'Match names to title exactly. If the seller is an entity or trust, confirm the authorized signer and that signing authority is documented.' },
      { id:'s_setup_closing_agent', owner:'TC',
        label:'Confirm closing agent + who pays owner title policy',
        sub:'FR/BAR: the party selecting the closing agent pays the owner title policy. NABOR: Buyer selects the closing agent regardless of who pays; in Lee and Charlotte the Seller pays, in Collier the Buyer pays and selects. CRSP: closing agent designation is Para 5(c). Confirm against this contract.',
        showIf:function(f){ return !IS.vac(f); } },
      { id:'s_setup_compensation', owner:'TC',
        label:'Confirm compensation agreement executed',
        dl:'compensation_agreement',
        sub:'Comprehensive Rider GG. Seller and Buyer’s Broker execute the compensation agreement. Default 3 days after Effective Date if left blank. Confirm it is signed and on the file.',
        showIf:IS.farbar },
      { id:'s_setup_agent_confirm', owner:'TC',
        label:'Confirm dates + contacts with the seller agent',
        sub:'Send the agent the extracted dates, financials, and contacts to verify. Fix anything off before it goes to all parties. On confirm, the file opens to Under Contract.' },
      { id:'s_setup_opening_email', owner:'TC',
        label:'Send executed contract email',
        sub:'Executed contract intro to all parties: both agents, lender, and title, with file@aaritransactions.com copied for the audit trail. Attach the executed contract and compensation agreement.',
        emailGate:{ requires:'s_setup_agent_confirm', note:'Confirm dates + contacts first so the intro goes out clean.' } }
    ],

    // ---- UNDER CONTRACT · seller obligations run here -----------------------
    'under_contract': [
      // Existing survey — all FR/BAR + VAC, E+5 (survey_seller). NABOR uses survey_existing.
      { id:'s_uc_survey_seller', owner:'Seller',
        label:'Deliver existing survey (if in seller possession)',
        dl:'survey_seller',
        sub:'FR/BAR + Vacant Land: Standard A / Para 10(c). Seller furnishes any survey in possession within 5 days of Effective Date. The survey is the second most important document after the deed.',
        showIf:function(f){ return IS.farbar(f) || IS.vac(f); },
        softComplete:{ label:'Mark delivered', chip:'Delivered', flag:'survey_delivered' } },
      { id:'s_uc_survey_existing_nabor', owner:'Seller',
        label:'Deliver existing survey (if in seller possession)',
        dl:'survey_existing',
        sub:'NABOR Standard C. Seller furnishes a complete copy of any survey in possession. Default 10 days after Effective Date. The survey is the second most important document after the deed.',
        showIf:IS.nabor,
        softComplete:{ label:'Mark delivered', chip:'Delivered', flag:'survey_delivered' } },
      // Title policy — NABOR only (Seller provides existing owner policy, Standard B).
      { id:'s_uc_title_policy_nabor', owner:'Seller',
        label:'Deliver existing owner title policy',
        dl:'title_policy',
        sub:'NABOR Standard B. Seller furnishes any owner title insurance policy in possession, default 10 days after Effective Date. Used as the reissue base to save the buyer premium.',
        showIf:IS.nabor,
        softComplete:{ label:'Mark delivered', chip:'Delivered', flag:'title_policy_delivered' } },
      // HOA / condo docs — CRSP (and any FR/BAR with association). Seller delivers, buyer review runs off receipt.
      { id:'s_uc_hoa_docs', owner:'Seller',
        label:'Deliver HOA / condo documents + order estoppel',
        dl:'hoa_review',
        sub:'Seller delivers association documents. The buyer’s statutory review window to void runs from the moment of receipt, not from send, so log the receipt date. Order the estoppel now so it does not gate closing. Rights cannot be waived.',
        showIf:function(f){ return hasHoa(f); } },
      // Tenant leases + estoppels — NABOR seller delivers leases; FR/BAR if tenant-occupied.
      { id:'s_uc_leases', owner:'Seller',
        label:'Deliver written leases + tenant estoppels',
        dl:'leases_provided',
        sub:'NABOR Lines 100-105. Seller delivers written leases, default 5 days after Effective Date. If the buyer finds a lease unacceptable, they may terminate within 5 days of receipt; if the seller fails to deliver, the buyer may terminate within 10 days of Effective Date.',
        showIf:function(f){ return IS.nabor(f) && tenantOcc(f); } },
      { id:'s_uc_leases_farbar', owner:'Seller',
        label:'Deliver written leases + tenant estoppels',
        sub:'Tenant-occupied FR/BAR. Deliver executed leases and tenant estoppel letters so the buyer can review occupancy and security deposits before closing. Confirm the transfer of deposits at closing.',
        showIf:function(f){ return IS.farbar(f) && tenantOcc(f); },
        softComplete:{ label:'Mark delivered', chip:'Delivered', flag:'leases_delivered' } },
      // Inspection response — Standard + NABOR only (As-Is and VAC have no seller repair duty).
      { id:'s_uc_seller_response', owner:'Seller',
        label:'Seller response to buyer defect notice',
        dl:'seller_response',
        sub:'The buyer sent written notice of defects. FR/BAR Standard: Seller repairs items not in working condition up to the repair limit, or provides a licensed estimate. NABOR: Seller responds within 10 days of buyer notice. Get the seller’s written response before the deadline.',
        showIf:IS.repairs },
      // Seller repair election — FR/BAR Standard, when estimate exceeds the limit (Para 12(b)(iv)).
      { id:'s_uc_repair_election', owner:'Seller',
        label:'Confirm seller repair election (if cost over limit)',
        sub:'FR/BAR Standard Para 12(b)(iv). If the estimated repair cost exceeds the General Repair Limit, the seller must elect: repair all and pay the excess, pay only up to the limit, or refuse (buyer election then pending). Capture the written election so we can advise the buyer’s next step.',
        showIf:IS.standard,
        emailGate:{ requires:'s_uc_seller_response', note:'Complete the seller response first, then confirm the election.' } },
      // FIRPTA — any type, if seller is a foreign person.
      { id:'s_uc_firpta', owner:'Seller',
        label:'Confirm FIRPTA status + affidavit',
        sub:'Obtain the seller’s non-foreign affidavit before closing, or if the seller is a foreign person, coordinate the 15 percent withholding workflow with title early. This holds up disbursement if left to the end.',
        softComplete:{ label:'Affidavit received', chip:'Received', flag:'firpta' } },
      // CCCL — coastal CRSP.
      { id:'s_uc_cccl', owner:'Seller',
        label:'Confirm CCCL affidavit (coastal property)',
        sub:'CRSP Para 7(h). If any part of the property lies seaward of the Coastal Construction Control Line, the seller must provide an affidavit or survey delineating the line, unless the buyer waives.',
        showIf:function(f){ return IS.crsp(f); },
        softComplete:{ label:'N/A · not coastal', chip:'N/A', flag:'cccl_na' } },
      // Feasibility cooperation — VAC only.
      { id:'s_uc_vac_feasibility', owner:'Seller',
        label:'Provide access + land records for buyer feasibility',
        dl:'feasibility_end',
        sub:'Vacant Land Para 9. The buyer’s feasibility study period is running and the buyer may terminate for any reason before it ends. Provide site access and any soil, survey, permit, wetlands, or plat records in the seller’s possession. Vacant Land has no seller repair obligation. Johnson v. Davis still applies to known latent land defects such as flooding or wetlands.',
        showIf:IS.vac },
      // Title evidence — FR/BAR + VAC (title commitment delivered to buyer).
      { id:'s_uc_title_evidence', owner:'Title',
        label:'Title evidence delivered to buyer',
        dl:'title_evidence',
        sub:'FR/BAR Para 9(c) / Vacant Land Para 10. Title insurance commitment delivered to the buyer by the deadline (default 15 days prior to closing). Confirm the title agent is on track.',
        showIf:function(f){ return IS.farbar(f) || IS.vac(f); } },
      { id:'s_uc_weekly_update', owner:'TC',
        label:'Weekly progress update to the seller agent',
        sub:'One clean update a week: what cleared, what is next, what needs the seller. Keeps the agent ahead of every deadline.' }
    ],

    // ---- CLEAR TO CLOSE -----------------------------------------------------
    'ctc': [
      { id:'s_ctc_payoff', owner:'TC',
        label:'Order seller payoff + confirm liens',
        sub:'Request the mortgage payoff and confirm any additional liens, judgments, or unpaid assessments so the closing agent has clean figures. Order early, they take days.' },
      { id:'s_ctc_estoppel_final', owner:'TC',
        label:'Confirm final HOA / condo estoppel received',
        sub:'The estoppel governs what the seller owes the association at closing. Confirm the closing agent has the final figures.',
        showIf:function(f){ return hasHoa(f); } },
      { id:'s_ctc_deed_docs', owner:'Title',
        label:'Confirm warranty deed + seller closing docs prepared',
        sub:'Confirm the closing agent has prepared the deed, closing statement, and seller affidavits, and that entity or trust signing authority is in order.' },
      { id:'s_ctc_cd_review', owner:'TC',
        label:'Review seller settlement statement',
        sub:'Review the seller side of the closing disclosure or settlement statement for errors before the seller sees it. Confirm commission, payoff, prorations, and credits are correct.' },
      { id:'s_ctc_commission', owner:'TC',
        label:'Confirm commission disbursement authorization sent',
        sub:'Confirm the broker commission disbursement authorization is with the closing agent. CDA preparation is the broker and agent obligation; confirm it is handled, do not claim it as Aari work.' },
      { id:'s_ctc_repairs_done', owner:'Seller',
        label:'Confirm agreed repairs complete + receipts',
        sub:'Confirm any agreed repairs are done and paid, with receipts on the file, before the buyer walk-through.',
        showIf:IS.repairs,
        softComplete:{ label:'N/A · no repairs', chip:'N/A', flag:'no_repairs' } },
      { id:'s_ctc_walk_ready', owner:'Seller',
        label:'Seller ready for buyer walk-through',
        dl:'walk_through',
        sub:'Property broom-clean, free of debris and the seller’s personal property, all keys, garage remotes, access devices, and codes gathered for handoff at closing.' }
    ],

    // ---- CLOSED -------------------------------------------------------------
    'closed': [
      { id:'s_cl_funds_recorded', owner:'Title',
        label:'Confirm funds disbursed + deed recorded',
        sub:'Confirm the closing agent disbursed seller proceeds and the deed is recorded. This confirmation unlocks close-out.' },
      { id:'s_cl_keys', owner:'Seller',
        label:'Confirm keys + access handed off',
        sub:'Confirm keys, remotes, and access codes were delivered to the buyer per the possession terms.' },
      { id:'s_cl_archive', owner:'TC',
        label:'Archive the file',
        sub:'Everything funded, recorded, and paid. Locks the file read-only and moves it off the active board.' }
    ]
  };

  // ==========================================================================
  // SELLER EMAIL PLAYBOOK  (merge into EMAIL_PLAYBOOK.sale, keyed by task id)
  //   subject: 1 to 4 words, curiosity-driven. Body: identity + scene + task +
  //   deadline. No signature. {{tokens}} match the existing buyer templates.
  // ==========================================================================
  var SELLER_EMAIL_PLAYBOOK = {
    's_setup_opening_email': {
      id:'s_seller_opening', task:'s_setup_opening_email', thread:4,
      subject:'{{property_street}}',
      label:'Executed contract to all parties',
      body:
'{{time_of_day_greeting}} everyone,\n\n' +
'We are coordinating this file on the seller side. The executed contract is attached.\n\n' +
'Effective Date is {{effective_date}} and closing is set for {{closing_date}}. Every deadline runs off those two dates.\n\n' +
'Reply all here so the whole file stays on one thread.'
    },
    's_uc_survey_seller': {
      id:'s_seller_survey', task:'s_uc_survey_seller', thread:1,
      subject:'Survey',
      label:'Request existing survey',
      body:
'{{time_of_day_greeting}} {{agent_first_name}},\n\n' +
'One quick item to keep {{property_street}} moving.\n\n' +
'If the seller has an existing survey, send it over. It can save the buyer the cost of a new one and it is the second most important document after the deed.\n\n' +
'We need it by {{dl_survey_seller}}.'
    },
    's_uc_hoa_docs': {
      id:'s_seller_hoa', task:'s_uc_hoa_docs', thread:1,
      subject:'Association docs',
      label:'Request HOA docs + estoppel',
      body:
'{{time_of_day_greeting}} {{agent_first_name}},\n\n' +
'{{property_street}} has an association, so two things start the clock.\n\n' +
'Send the association documents to the buyer and tell me the date they receive them. The buyer’s review window runs from receipt, not from send. I am ordering the estoppel now so it does not hold up closing.\n\n' +
'The sooner the docs are delivered, the sooner that window closes.'
    },
    's_uc_seller_response': {
      id:'s_seller_response', task:'s_uc_seller_response', thread:1,
      subject:'Repair response',
      label:'Request seller repair response',
      body:
'{{time_of_day_greeting}} {{agent_first_name}},\n\n' +
'The buyer sent written notice of defects on {{property_street}}.\n\n' +
'I need the seller’s written response: repairs up to the limit, or a licensed estimate. Get it back to me in writing so we do not miss the window.\n\n' +
'The response is due {{dl_seller_response}}.'
    },
    's_uc_firpta': {
      id:'s_seller_firpta', task:'s_uc_firpta', thread:1,
      subject:'FIRPTA',
      label:'Request FIRPTA affidavit',
      body:
'{{time_of_day_greeting}} {{agent_first_name}},\n\n' +
'One item that quietly holds up disbursement if it waits until closing week.\n\n' +
'Send the seller’s non-foreign affidavit. If the seller is a foreign person, tell me now so title can set up the 15 percent withholding.\n\n' +
'Sooner is better than closing week.'
    },
    's_ctc_payoff': {
      id:'s_seller_payoff', task:'s_ctc_payoff', thread:3,
      subject:'Payoff',
      label:'Order payoff to title',
      body:
'{{time_of_day_greeting}},\n\n' +
'We are clear to close on {{property_street}}.\n\n' +
'Please order the seller payoff and confirm any additional liens or unpaid assessments so the seller statement is clean.\n\n' +
'Closing is {{closing_date}}.'
    }
  };

  global.AariSellerChecklist = {
    SELLER_STAGE_CHECKLISTS: SELLER_STAGE_CHECKLISTS,
    SELLER_EMAIL_PLAYBOOK: SELLER_EMAIL_PLAYBOOK,
    IS: IS
  };
})(typeof window !== 'undefined' ? window : this);

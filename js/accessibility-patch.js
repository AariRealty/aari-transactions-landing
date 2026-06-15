/* Aari Transactions · Accessibility Patch v2 (audit fixes)
 * -------------------------------------------------------
 * Loaded deferred on every page. Does:
 *   1. Adds aria-label to any visible input/textarea/select with no label
 *   2. Adds autocomplete attributes to personal-info fields
 *   3. Fixes logo img width/height (prevents CLS)
 *   4. Hides broken img[src$="index.html"] elements
 *   5. Ensures modal ARIA roles are set
 */
(function aariA11yPatch() {
      'use strict';

   // ── 1. aria-label map ──────────────────────────────────────────────
   var labelMap = {
           // Core agent fields
           first_name:'First name', last_name:'Last name',
           email:'Email address', agent_email:'Agent email address',
           gate_email:'Login email', gate_password:'Password',
           password:'Password', passwordConfirm:'Confirm password',
           phone:'Phone number', agent_phone:'Agent phone number',
           agent_name:'Agent full name',
           agent_license_number:'Agent license number',
           agent_license_state:'Agent license state',
           license_number:'Real estate license number',
           license_exp:'License expiration date',
           license_state:'License state',
           licenseNumber:'Real estate license number',
           firstName:'First name', lastName:'Last name',
           // Brokerage
           brokerage:'Brokerage name', brokerage_name:'Brokerage name',
           brokerage_address:'Brokerage address',
           broker_contact:'Broker contact name and email',
           broker_name:'Broker name', broker_email:'Broker email',
           broker_contact_name:'Broker contact name',
           agent_brokerage:'Agent brokerage',
           // Service / onboarding
           service_area:'Service area',
           compliance_login:'Compliance platform login credentials',
           signing_login:'E-signature platform login credentials',
           cap_notes:'Commission cap notes', cap_amount:'Commission cap amount',
           cap_renewal:'Cap renewal date',
           facebook:'Facebook username or URL', instagram:'Instagram username',
           birthday:'Birthday', flower:'Favorite flower', fav_flower:'Favorite flower',
           restaurant:'Favorite restaurant', fav_restaurant:'Favorite restaurant',
           snack:'Favorite snack', fav_food:'Favorite food or snack',
           referral_source:'How did you hear about us',
           additional_notes:'Additional notes', team_status:'Team status',
           team_name:'Team name', cda_complete:'CDA setup status',
           client_reviews:'Client review platform',
           // Transaction
           address:'Property address', client_name:'Client name',
           client_email:'Client email', client_phone:'Client phone',
           effective_date:'Effective date', closing_date:'Closing date',
           closing_date_target:'Target closing date',
           purchase_price:'Purchase price', earnest_money:'Earnest money deposit',
           earnest_money_offer:'Earnest money for offer',
           lender_name:'Lender name', lender_company:'Lending company',
           lender_email:'Lender email', lender_phone:'Lender phone',
           lender:'Lender name',
           title_name:'Title agent name', title_company:'Title company',
           title_email:'Title email', title_phone:'Title phone',
           seller_name:'Seller name', seller_email:'Seller email',
           seller_phone:'Seller phone',
           buyer_name:'Buyer name', buyer_email:'Buyer email',
           buyer_phone:'Buyer phone',
           buyer_entity_name:'Buyer entity legal name',
           seller_entity_name:'Seller entity legal name',
           listing_price:'Listing price', listing_start_date:'Listing start date',
           hoa_info:'HOA information', offer_price:'Offer price',
           financing_type:'Financing type', offer_notes:'Offer notes',
           hoa_approval:'HOA approval notes',
           required_disclosures:'Required disclosures',
           counter_1:'Counter offer instructions', counter_2:'Secondary counter offer',
           agent_license:'Agent license number',
           typed_name:'Full legal name', document_name:'Document name',
           title_company_name:'Title company name', title_agent:'Title agent name',
           body:'Message body',
           required_signatures:'Required signatures',
           // Property detail fields (pa_* prefix)
           pa_buyer_name:'Buyer name', pa_buyer_email:'Buyer email',
           pa_buyer_phone:'Buyer phone', pa_buyer2_name:'Co-buyer name',
           pa_buyer2_email:'Co-buyer email', pa_buyer2_phone:'Co-buyer phone',
           pa_seller_name:'Seller name', pa_seller_email:'Seller email',
           pa_seller_phone:'Seller phone', pa_seller2_name:'Co-seller name',
           pa_seller2_email:'Co-seller email', pa_seller2_phone:'Co-seller phone',
           pa_other_party_name:'Other party name',
           pa_address:'Property address',
           pa_effective_date:'Effective date', pa_closing_date:'Closing date',
           pa_hoa_name:'HOA name', pa_hoa_mgmt_company:'HOA management company',
           pa_hoa_phone:'HOA phone', pa_hoa_monthly_fee:'HOA monthly fee',
           pa_hoa_transfer_fee:'HOA transfer fee',
           pa_title_company:'Title company', pa_title_address:'Title company address',
           pa_title_contact_name:'Title contact name',
           pa_title_contact_email:'Title contact email',
           pa_title_contact_phone:'Title contact phone',
           pa_lender:'Lender', pa_lender_contact_name:'Lender contact name',
           pa_lender_contact_email:'Lender contact email',
           pa_lender_contact_phone:'Lender contact phone',
           pa_listing_agent_name:'Listing agent name',
           pa_listing_agent_company:'Listing agent company',
           pa_listing_agent_phone:'Listing agent phone',
           pa_listing_agent_email:'Listing agent email',
           pa_agent_self_name:'Your name', pa_agent_self_email:'Your email',
           pa_agent_self_phone:'Your phone',
           pa_co_agent_name:'Co-agent name', pa_co_agent_company:'Co-agent company',
           pa_co_agent_phone:'Co-agent phone', pa_co_agent_email:'Co-agent email',
           pa_listing_date:'Listing date', pa_listing_expiration:'Listing expiration',
           pa_listing_price:'Listing price',
           pa_commission_listing_pct:'Listing side commission %',
           pa_commission_buying_pct:'Buying side commission %',
           pa_lead_source:'Lead source', pa_signing_platform:'Signing platform',
           pa_update_frequency:'Update frequency',
           pa_update_method:'Preferred update method',
           pa_showing_instructions:'Showing instructions',
           pa_rent_monthly:'Monthly rent', pa_security_deposit:'Security deposit',
           pa_security_deposit_other:'Security deposit notes',
           pa_application_fee:'Application fee',
           pa_application_fee_other:'Application fee notes',
           pa_association_app_fee:'Association application fee',
           pa_lease_term:'Lease term', pa_lease_term_other:'Lease term notes',
           pa_available_date:'Available date',
           pa_season_rate:'Season rate', pa_off_season_rate:'Off-season rate',
           pa_season_start:'Season start', pa_season_end:'Season end',
           pa_min_stay:'Minimum stay', pa_min_stay_other:'Minimum stay notes',
           pa_rent_included_other:'Rent included notes',
           pa_items_included_other:'Items included notes',
           pa_listing_period_start:'Listing period start',
           pa_listing_period_end:'Listing period end',
           pa_pet_policy:'Pet policy', pa_pet_max_weight:'Pet max weight',
           pa_pet_max_num:'Max number of pets', pa_pet_breed:'Pet breed restrictions',
           pa_pet_deposit:'Pet deposit', pa_pet_deposit_other:'Pet deposit notes',
           pa_rental_fee_amount:'Rental fee amount',
           pa_offer_price:'Offer price', pa_financing_type:'Financing type',
           pa_turnaround:'Turnaround time', pa_commission_notes:'Commission notes',
           pa_agent_notes:'Agent notes',
           // Property specs
           year_built:'Year built', bedrooms:'Bedrooms', bathrooms:'Bathrooms',
           sqft:'Square footage', lot_size:'Lot size',
           showingtime_prefs:'ShowingTime preferences',
           syndication_prefs:'Syndication preferences',
           agent_notes:'Agent notes',
   };

   // ── 2. autocomplete map ────────────────────────────────────────────
   var autocompleteMap = {
           first_name:'given-name', last_name:'family-name', firstName:'given-name',
           lastName:'family-name', email:'email', agent_email:'email',
           gate_email:'email', gate_password:'current-password', password:'new-password',
           passwordConfirm:'new-password', phone:'tel', agent_phone:'tel',
           agent_name:'name', brokerage_name:'organization', brokerage:'organization',
           brokerage_address:'street-address', birthday:'bday',
           broker_email:'email', lender_email:'email', title_email:'email',
           seller_email:'email', buyer_email:'email', client_email:'email',
           pa_buyer_email:'email', pa_seller_email:'email',
           pa_lender_contact_email:'email', pa_title_contact_email:'email',
           lender_phone:'tel', title_phone:'tel', seller_phone:'tel',
           buyer_phone:'tel', client_phone:'tel', pa_buyer_phone:'tel',
           pa_seller_phone:'tel',
   };

   // ── 3. Apply labels + autocomplete ────────────────────────────────
   document.querySelectorAll(
           'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),' +
           'textarea,select'
         ).forEach(function(el) {
           var name = el.name;
           if (!name) return;
           if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') &&
                       !el.closest('label') &&
                       !document.querySelector('label[for="' + el.id + '"]')) {
                     var label = labelMap[name];
                     if (label) el.setAttribute('aria-label', label);
           }
           if (!el.getAttribute('autocomplete')) {
                     var ac = autocompleteMap[name];
                     if (ac) el.setAttribute('autocomplete', ac);
           }
   });

   // ── 4. Logo img: set width/height to prevent CLS ──────────────────
   document.querySelectorAll('img.aari-nav-mark').forEach(function(img) {
           if (!img.getAttribute('width'))  img.setAttribute('width',  '36');
           if (!img.getAttribute('height')) img.setAttribute('height', '36');
           if (!img.loading || img.loading === 'auto') img.loading = 'eager';
   });

   // ── 5. Fix broken img src pointing to index.html ──────────────────
   document.querySelectorAll('img').forEach(function(img) {
           var src = img.getAttribute('src') || '';
           if (src === '' || src.endsWith('index.html')) {
                     img.setAttribute('aria-hidden', 'true');
                     img.style.display = 'none';
           }
   });

   // ── 6. Fix href="#" dead links ────────────────────────────────────
   document.querySelectorAll('a[href="#"]').forEach(function(a) {
           a.setAttribute('href', 'javascript:void(0)');
           a.setAttribute('role', 'button');
   });

})();

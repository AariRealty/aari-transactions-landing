/* Aari Transactions · Accessibility Patch (audit fixes)
 * -------------------------------------------------------
 * Loaded deferred on every page. Does two things:
 *   1. Adds aria-label to any visible input/textarea/select that has no label.
 *   2. Adds autocomplete attributes to common personal-info fields.
 * Safe to run multiple times (idempotent checks on each element).
 */
(function aariA11yPatch() {
    'use strict';

   // ── 1. aria-label map: input[name] → human-readable label ──────────
   var labelMap = {
         first_name:                       'First name',
         last_name:                        'Last name',
         email:                            'Email address',
         agent_email:                      'Agent email address',
         gate_email:                       'Login email',
         gate_password:                    'Password',
         phone:                            'Phone number',
         agent_phone:                      'Agent phone number',
         agent_name:                       'Agent full name',
         agent_license_number:             'Agent license number',
         agent_license_state:              'Agent license state',
         license_number:                   'Real estate license number',
         license_exp:                      'License expiration date',
         license_state:                    'License state',
         brokerage:                        'Brokerage name',
         brokerage_name:                   'Brokerage name',
         brokerage_address:                'Brokerage address',
         broker_contact:                   'Broker contact name and email',
         broker_name:                      'Broker name',
         broker_email:                     'Broker email',
         broker_contact_name:              'Broker contact name',
         service_area:                     'Service area',
         compliance_login:                 'Compliance platform login credentials',
         signing_login:                    'E-signature platform login credentials',
         cap_notes:                        'Commission cap notes',
         cap_amount:                       'Commission cap amount',
         cap_renewal:                      'Cap renewal date',
         facebook:                         'Facebook username or URL',
         instagram:                        'Instagram username',
         birthday:                         'Birthday',
         flower:                           'Favorite flower',
         fav_flower:                       'Favorite flower',
         restaurant:                       'Favorite restaurant',
         fav_restaurant:                   'Favorite restaurant',
         snack:                            'Favorite snack',
         fav_food:                         'Favorite food or snack',
         referral_source:                  'How did you hear about us',
         additional_notes:                 'Additional notes',
         team_status:                      'Team status',
         team_name:                        'Team name',
         cda_complete:                     'CDA setup status',
         client_reviews:                   'Client review platform',
         address:                          'Property address',
         client_name:                      'Client name',
         client_email:                     'Client email',
         client_phone:                     'Client phone',
         effective_date:                   'Effective date',
         closing_date:                     'Closing date',
         closing_date_target:              'Target closing date',
         purchase_price:                   'Purchase price',
         earnest_money:                    'Earnest money deposit',
         earnest_money_offer:              'Earnest money for offer',
         lender_name:                      'Lender name',
         lender_company:                   'Lending company',
         lender_email:                     'Lender email',
         lender_phone:                     'Lender phone',
         title_name:                       'Title agent name',
         title_company:                    'Title company',
         title_email:                      'Title email',
         title_phone:                      'Title phone',
         seller_name:                      'Seller name',
         seller_email:                     'Seller email',
         seller_phone:                     'Seller phone',
         buyer_name:                       'Buyer name',
         buyer_email:                      'Buyer email',
         buyer_phone:                      'Buyer phone',
         buyer_entity_name:                'Buyer entity legal name',
         seller_entity_name:               'Seller entity legal name',
         listing_price:                    'Listing price',
         listing_start_date:               'Listing start date',
         hoa_info:                         'HOA information',
         offer_price:                      'Offer price',
         financing_type:                   'Financing type',
         offer_notes:                      'Offer notes',
         hoa_approval:                     'HOA approval notes',
         required_disclosures:             'Required disclosures',
         counter_1:                        'Counter offer instructions',
         counter_2:                        'Secondary counter offer',
         agent_brokerage:                  'Agent brokerage',
         agent_license:                    'Agent license number',
         typed_name:                       'Full legal name',
         document_name:                    'Document name',
         lender:                           'Lender name',
         title_company_name:               'Title company name',
         title_agent:                      'Title agent name',
         body:                             'Message body',
   };

   // ── 2. autocomplete map: input[name] → autocomplete token ──────────
   var autocompleteMap = {
         first_name:       'given-name',
         last_name:        'family-name',
         email:            'email',
         agent_email:      'email',
         gate_email:       'email',
         gate_password:    'current-password',
         phone:            'tel',
         agent_phone:      'tel',
         agent_name:       'name',
         brokerage_name:   'organization',
         brokerage:        'organization',
         brokerage_address:'street-address',
         birthday:         'bday',
         broker_email:     'email',
         lender_email:     'email',
         title_email:      'email',
         seller_email:     'email',
         buyer_email:      'email',
         client_email:     'email',
         lender_phone:     'tel',
         title_phone:      'tel',
         seller_phone:     'tel',
         buyer_phone:      'tel',
         client_phone:     'tel',
   };

   // ── 3. Apply to all matching inputs ────────────────────────────────
   var inputs = document.querySelectorAll(
         'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),' +
         'textarea,' +
         'select'
       );

   inputs.forEach(function(el) {
         var name = el.name;
         if (!name) return;

                      // aria-label: skip if already labeled
                      if (!el.getAttribute('aria-label') &&
                                  !el.getAttribute('aria-labelledby') &&
                                  !el.closest('label') &&
                                  !document.querySelector('label[for="' + el.id + '"]')) {
                              var label = labelMap[name];
                              if (label) el.setAttribute('aria-label', label);
                      }

                      // autocomplete: skip if already set
                      if (!el.getAttribute('autocomplete')) {
                              var ac = autocompleteMap[name];
                              if (ac) el.setAttribute('autocomplete', ac);
                      }
   });

   // ── 4. Fix logo images missing width/height (prevents CLS) ─────────
   document.querySelectorAll('img.aari-nav-mark').forEach(function(img) {
         if (!img.getAttribute('width'))  img.setAttribute('width',  '36');
         if (!img.getAttribute('height')) img.setAttribute('height', '36');
         if (!img.loading || img.loading === 'auto') img.loading = 'eager';
   });

   // ── 5. Fix broken img src pointing to index.html ───────────────────
   document.querySelectorAll('img[src$="index.html"]').forEach(function(img) {
         img.setAttribute('aria-hidden', 'true');
         img.style.display = 'none';
   });

   // ── 6. Fix modal ARIA if present ───────────────────────────────────
   var modal = document.querySelector('.modal, [role="dialog"], .aari-modal, #compliance-modal, .mr-modal');
    if (modal && !modal.getAttribute('role')) {
          modal.setAttribute('role', 'dialog');
          modal.setAttribute('aria-modal', 'true');
          var heading = modal.querySelector('h2, h3');
          if (heading) {
                  if (!heading.id) heading.id = 'aari-modal-heading';
                  modal.setAttribute('aria-labelledby', heading.id);
          }
    }

})();

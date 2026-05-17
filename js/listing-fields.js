/* =========================================================================
   Aari Transactions · Listing intake fields controller
   -------------------------------------------------------------------------
   Builds the listing intake on top of the existing qwiz architecture.
   Three services share this: LC, Listing Docs, MLS Setup.

   Flow:
     1. Property type picker (6 chips · single_family, condo_villa,
        multi_family, lot_land, rental_long, rental_short).
     2. Schema-driven critical fields appear progressively after type is
        picked. Fields come from window.AariListingSchema.
     3. Description step renders last — Aari generates or agent pastes
        (delegated to window.AariListingDescription).

   Wires into the existing LC/Listing Docs/MLS Setup fieldsets in
   index.html by injecting a [data-listing-shared] block at the top of
   whichever listing fieldset is active. No duplication — single source
   of truth, schema-driven.
   ========================================================================= */
(function(global){
  'use strict';

  const LISTING_SERVICE_IDS = ['lc', 'listing_docs', 'mls_setup'];

  function isListingServiceId(svcId){
    return LISTING_SERVICE_IDS.indexOf(svcId) !== -1;
  }

  function buildPickerHTML(){
    const types = (global.AariListingSchema && global.AariListingSchema.property_types) || [];
    const available = types.filter(t => t.available);
    const deferred  = types.filter(t => !t.available);
    return [
      '<div class="field" data-q="What are you <em>listing</em>?" data-q-sub="Pick the type — fields adjust to match the MLS sheet.">',
      '  <label>Property type *</label>',
      '  <div class="listing-type-grid" role="radiogroup" aria-label="Property type">',
      available.map(t =>
        '<button type="button" class="listing-type-chip" data-listing-type="' + t.id + '" aria-pressed="false">' +
          '<span class="ltc-name">' + escapeHtml(t.label) + '</span>' +
          '<span class="ltc-sub">' + escapeHtml(humanGroup(t.group)) + '</span>' +
        '</button>'
      ).join(''),
      deferred.map(t =>
        '<button type="button" class="listing-type-chip listing-type-chip-disabled" disabled aria-disabled="true" title="' + escapeHtml(t.deferred_reason || 'Coming soon') + '">' +
          '<span class="ltc-name">' + escapeHtml(t.label) + '</span>' +
          '<span class="ltc-sub">Coming soon</span>' +
        '</button>'
      ).join(''),
      '  </div>',
      '  <input type="hidden" name="listing_property_type" id="listingPropertyType" required>',
      '</div>',
    ].join('\n');
  }

  function buildCriticalFieldsHTML(propertyTypeId){
    const fields = (global.AariListingSchema && global.AariListingSchema.getCriticalFields(propertyTypeId)) || [];
    if(fields.length === 0) return '';
    const html = fields.map((f, i) => renderField(f, propertyTypeId, i)).join('');
    return (
      '<div class="listing-critical-fields" data-listing-critical>' + html + '</div>'
    );
  }

  function renderField(f, propertyTypeId, idx){
    const required = f.required ? ' required' : '';
    const star     = f.required ? ' *' : '';
    const subLabel = (idx === 0) ? 'First the basics, one at a time.' : 'Next.';
    const qHead    = '<em>' + escapeHtml(f.label) + '</em>?';
    const qSub     = f.note ? escapeHtml(f.note) : subLabel;
    // Conditional visibility · field only shows when another field equals a value.
    // Emits a data-q-when="name:value" attr that the generic qwiz already
    // evaluates · same format as the LC/Listing Docs entity-ack gating.
    const dep = f.depends_on;
    const qWhenAttr = (dep && dep.name && dep.value)
      ? ' data-q-when="' + escapeHtml(dep.name) + ':' + escapeHtml(String(dep.value)) + '"'
      : '';
    // Optional fields · the generic qwiz reads data-q-optional to skip the
    // "required" check, so Continue isn't blocked by a blank optional field.
    const qOptionalAttr = f.required === false ? ' data-q-optional' : '';

    if(f.type === 'description'){
      return (
        '<div class="field"' + qWhenAttr + qOptionalAttr + ' data-q="' + qHead + '" data-q-sub="3 standouts &middot; we generate, or paste your own.">' +
          '<label>Property description ' + star + '</label>' +
          '<div data-listing-description ' +
               'data-property-type="' + escapeHtml(propertyTypeId) + '" ' +
               'data-source-name="listing_remarks_source" ' +
               'data-text-name="listing_remarks" ' +
               'data-standouts-name="listing_standouts"></div>' +
        '</div>'
      );
    }

    if(f.type === 'confidential_remarks'){
      return (
        '<div class="field"' + qWhenAttr + qOptionalAttr + ' data-q="' + qHead + '" data-q-sub="Agent-to-agent terms · MLS Confidential Remarks.">' +
          '<label>Realtor remarks ' + star + '</label>' +
          '<div data-listing-confidential-remarks ' +
               'data-text-name="confidential_remarks" ' +
               'data-source-name="confidential_remarks_source" ' +
               'data-save-flag-name="confidential_remarks_save_to_profile"></div>' +
        '</div>'
      );
    }

    // Open shell
    let inner = '';
    switch(f.type){
      case 'text':
        inner = '<input type="text" name="' + f.name + '"' + required + (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') + (f.format === 'email' ? ' inputmode="email"' : '') + '>';
        break;
      case 'textarea':
        inner = '<textarea name="' + f.name + '" rows="3"' + required + (f.max_chars ? ' maxlength="' + f.max_chars + '"' : '') + '></textarea>';
        break;
      case 'number':
        inner = '<input type="number" name="' + f.name + '"' + required + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + ' inputmode="numeric">';
        break;
      case 'currency':
        inner = '<input type="text" name="' + f.name + '"' + required + ' inputmode="decimal" placeholder="$" data-format="currency">';
        break;
      case 'date':
        inner = '<input type="date" name="' + f.name + '"' + required + '>';
        break;
      case 'address':
        inner = '<input type="text" name="' + f.name + '"' + required + ' data-google-address autocomplete="off"' + (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') + '>';
        break;
      case 'select':
        inner = '<select name="' + f.name + '"' + required + '><option value="">Select</option>' +
          (f.options || []).map(o => '<option>' + escapeHtml(o) + '</option>').join('') +
          '</select>';
        break;
      case 'radio':
        inner = '<div class="radio-group">' +
          (f.options || []).map((o, i) =>
            '<label class="radio-pill"><input type="radio" name="' + f.name + '" value="' + escapeHtml(o) + '"' + (i === 0 && f.required ? ' required' : '') + '> ' + escapeHtml(o) + '</label>'
          ).join('') +
        '</div>';
        break;
      case 'multiselect':
        inner = '<div class="checkbox-group">' +
          (f.options || []).map(o =>
            '<label class="checkbox-pill"><input type="checkbox" name="' + f.name + '[]" value="' + escapeHtml(o) + '"> ' + escapeHtml(o) + '</label>'
          ).join('') +
        '</div>';
        break;
      case 'yesno':
        inner = '<div class="radio-group">' +
          '<label class="radio-pill"><input type="radio" name="' + f.name + '" value="Yes"' + (f.required ? ' required' : '') + '> Yes</label>' +
          '<label class="radio-pill"><input type="radio" name="' + f.name + '" value="No"> No</label>' +
        '</div>';
        break;
      default:
        inner = '<input type="text" name="' + f.name + '">';
    }

    return (
      '<div class="field"' + qWhenAttr + qOptionalAttr + ' data-q="' + qHead + '" data-q-sub="' + qSub + '">' +
        '<label>' + escapeHtml(f.label) + star + '</label>' +
        inner +
      '</div>'
    );
  }

  function humanGroup(g){
    return ({
      residential: 'Residential',
      residential_income: 'Income property',
      vacant: 'Vacant land',
      rental: 'Rental',
      commercial: 'Commercial',
      standalone: 'Standalone',
    })[g] || g;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function injectStyles(){
    if(document.getElementById('aari-listing-fields-styles')) return;
    const css = document.createElement('style');
    css.id = 'aari-listing-fields-styles';
    css.textContent = `
.listing-type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:6px}
@media(min-width:600px){.listing-type-grid{grid-template-columns:repeat(3,1fr)}}
.listing-type-chip{background:#fff;border:1px solid #d8cdb9;border-radius:10px;padding:14px 12px;cursor:pointer;font-family:inherit;color:#0f0f0f;display:flex;flex-direction:column;gap:3px;text-align:left;transition:all 120ms ease}
.listing-type-chip:hover:not(:disabled){border-color:#b89866}
.listing-type-chip[aria-pressed="true"]{background:#967a4a;border-color:#7a6238;color:#fff}
.listing-type-chip[aria-pressed="true"] .ltc-sub{color:rgba(255,255,255,.75)}
.listing-type-chip-disabled{opacity:.45;cursor:not-allowed}
.ltc-name{font-weight:600;font-size:13px}
.ltc-sub{font-size:11px;color:#3a3a38;letter-spacing:.02em}
.listing-critical-fields{margin-top:8px}
.checkbox-group{display:flex;flex-wrap:wrap;gap:6px}
.checkbox-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;background:#fff;border:1px solid #d8cdb9;border-radius:20px;font-size:12px;cursor:pointer;color:#0f0f0f}
.checkbox-pill input{margin:0}
.checkbox-pill:has(input:checked){background:#967a4a;border-color:#7a6238;color:#fff}
`;
    document.head.appendChild(css);
  }

  /* ----- Hide old duplicate questions superseded by the schema fields.
     The legacy fieldsets ask the same question (address, listing_price,
     etc.) under different names. We hide their containers and clear
     `required` so the submit handler validates against schema fields
     only. Listing agreement / photo upload fields stay — schema doesn't
     cover those. -----*/
  const SUPERSEDED_FIELD_NAMES = [
    'address',            // → property_address
    'listing_price',      // → list_price
    'listing_start_date', // → listing_date
    'year_built',         // → schema
    'bedrooms',           // → schema (string variant)
    'bathrooms',          // → schema full_baths/half_baths split
    'sqft',               // → living_area_sqft
    'lot_size',           // → lot_size_acres
  ];

  function hideSupersededFields(fieldsetEl){
    SUPERSEDED_FIELD_NAMES.forEach(name => {
      fieldsetEl.querySelectorAll('[name="' + name + '"]').forEach(input => {
        input.removeAttribute('required');
        input.disabled = true;
        const wrap = input.closest('[data-q]') || input.closest('.field, .field-row');
        if(wrap){
          wrap.setAttribute('hidden', '');
          wrap.style.display = 'none';
          wrap.setAttribute('data-listing-superseded','1');
        }
      });
    });
  }

  /* ----- Public mount API. Called when the listing intake activates. ----- */
  function activate(serviceId, fieldsetEl){
    if(!isListingServiceId(serviceId)) return;
    if(!fieldsetEl) return;
    if(fieldsetEl.dataset.listingMounted === '1') return;
    fieldsetEl.dataset.listingMounted = '1';
    injectStyles();

    // Strip the legacy duplicate questions first so the agent doesn't
    // see the same prompt twice.
    hideSupersededFields(fieldsetEl);

    // Insert the picker as the very first .field in the fieldset.
    // Schema-driven critical fields come from a stub container that
    // fills in once the type is picked.
    const block = document.createElement('div');
    block.setAttribute('data-listing-shared','');
    block.innerHTML =
      buildPickerHTML() +
      '<div class="listing-critical-fields-host" data-listing-critical-host></div>';
    fieldsetEl.insertBefore(block, fieldsetEl.firstChild);

    // Wire the picker chips
    const hidden = block.querySelector('#listingPropertyType');
    const host   = block.querySelector('[data-listing-critical-host]');
    block.querySelectorAll('.listing-type-chip:not(:disabled)').forEach(chip => {
      chip.addEventListener('click', () => {
        block.querySelectorAll('.listing-type-chip').forEach(c => c.setAttribute('aria-pressed','false'));
        chip.setAttribute('aria-pressed','true');
        const id = chip.dataset.listingType;
        hidden.value = id;
        renderCriticalFields(id, host);
        // Fire a synthetic change event on the hidden input so the generic
        // qwiz's input/change listener triggers a refresh. The qwiz's
        // isAnswered check looks for an input[type="hidden"][required] with
        // a non-empty value, so once this fires it sees the picker as
        // answered and renders the next critical field's headline.
        try {
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
        } catch(_){}
        // Tell anything else that listens for the custom event
        try { window.dispatchEvent(new CustomEvent('aari:listing-type-picked', { detail: { propertyTypeId: id }})); } catch(_){}
      });
    });
  }

  function renderCriticalFields(propertyTypeId, hostEl){
    if(!hostEl) return;
    hostEl.innerHTML = buildCriticalFieldsHTML(propertyTypeId);
    // Mount the description widget(s) inside
    hostEl.querySelectorAll('[data-listing-description]').forEach(el => {
      if(global.AariListingDescription && typeof global.AariListingDescription.mount === 'function'){
        global.AariListingDescription.mount(el);
      }
    });
    // Mount the confidential remarks widget(s) inside
    hostEl.querySelectorAll('[data-listing-confidential-remarks]').forEach(el => {
      if(global.AariListingConfidentialRemarks && typeof global.AariListingConfidentialRemarks.mount === 'function'){
        global.AariListingConfidentialRemarks.mount(el);
      }
    });
    // Currency formatter pass — match existing intake $-format behavior on insert
    hostEl.querySelectorAll('[data-format="currency"]').forEach(input => {
      input.addEventListener('input', () => {
        const digits = input.value.replace(/[^\d]/g, '');
        if(!digits){ input.value = ''; return; }
        input.value = '$' + Number(digits).toLocaleString();
      });
    });
  }

  /* ----- Auto-activate when a listing service is picked ----- */
  function autoWire(){
    // Run after DOM ready so the intake modal exists
    document.addEventListener('click', e => {
      const card = e.target.closest && e.target.closest('.service-card');
      if(!card) return;
      const serviceId = card.dataset.serviceId;
      if(!isListingServiceId(serviceId)) return;
      // Wait a tick for the existing handler to flip the fieldset visible
      setTimeout(() => {
        const svc = (window.SERVICES || []).find && (window.SERVICES || []).find(s => s.id === serviceId);
        const formId = svc ? svc.form : serviceId;
        const fs = document.querySelector('fieldset[data-service-form="' + formId + '"]');
        if(fs) activate(serviceId, fs);
      }, 50);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', autoWire);
  } else {
    autoWire();
  }

  global.AariListingFields = {
    activate,
    isListingServiceId,
    LISTING_SERVICE_IDS,
  };

})(window);

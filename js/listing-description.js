/* =========================================================================
   Aari Transactions · Listing description step (two-path)
   -------------------------------------------------------------------------
   Builds the description capture UI inside the listing intake. Two paths:

   PATH 1 · Aari generates
     Agent provides 3 standout features → POST to
     generate-listing-description edge function → returns MLS-compliant
     remarks (1200 char cap, fair-housing safe, no PII).

   PATH 2 · Agent provides own
     Agent pastes their description → client-side auto-scrubber strips
     names, phones, emails, URLs, gate codes, commission language.
     Shows what was removed so the agent isn't surprised.

   Usage:
     <div data-listing-description
          data-property-type="single_family"
          data-source-name="listing_remarks_source"
          data-text-name="listing_remarks"
          data-standouts-name="listing_standouts">
     </div>
   Then call: AariListingDescription.mount(rootEl);

   Reads basics from the form via hidden inputs the qwiz already populates
   (list_price, bedrooms, full_baths, etc.) — same source of truth as the
   submit handler.
   ========================================================================= */
(function(global){
  'use strict';

  /* ----- Same scrubber regex set as the edge function. Keep in sync. ----- */
  const SCRUBBERS = [
    { kind: 'phone',      re: /(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g,
      label: 'phone number' },
    { kind: 'email',      re: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
      label: 'email address' },
    { kind: 'url',        re: /\bhttps?:\/\/\S+/gi,
      label: 'web URL' },
    { kind: 'domain',     re: /\b(?:www\.)?[A-Za-z0-9\-]+\.(?:com|net|org|io|co|info|biz|us|realtor|homes)\b\S*/gi,
      label: 'website' },
    { kind: 'access_code', re: /\b(gate|access|lockbox|key|door|alarm|security)\s*(code|#|number)?\s*[:\-]?\s*\d{3,8}\b/gi,
      label: 'access/gate code' },
    { kind: 'commission', re: /\b\d+(?:\.\d+)?\s*%\s*(?:co-?broke|commission|comp|bb|sba|coop)?\b/gi,
      label: 'commission language' },
    { kind: 'cobroke',    re: /\b(co-?broke|cooperating broker|bonus|sba|coop)\b[^.]*?\$?\d+/gi,
      label: 'co-broke language' },
  ];

  function scrub(input){
    let out = String(input || '');
    const removed = [];
    SCRUBBERS.forEach(s => {
      out = out.replace(s.re, function(match){
        removed.push({ kind: s.kind, label: s.label, original: match.trim() });
        return '[removed]';
      });
    });
    // Collapse repeated [removed] tokens
    out = out.replace(/(\[removed\]\s*){2,}/g, '[removed] ');
    return { text: out, removed };
  }

  function getFormBasics(rootEl){
    const form = rootEl.closest('form') || document.getElementById('intake-form');
    if(!form) return {};
    const get = name => {
      const el = form.querySelector('[name="' + name + '"]');
      if(!el) return null;
      if(el.type === 'radio' || el.type === 'checkbox'){
        const checked = form.querySelector('[name="' + name + '"]:checked');
        return checked ? checked.value : null;
      }
      const v = el.value;
      return v == null || v === '' ? null : v;
    };
    return {
      address: get('property_address') || get('address'),
      list_price: numOrNull(get('list_price')),
      bedrooms: get('bedrooms'),
      full_baths: numOrNull(get('full_baths')),
      half_baths: numOrNull(get('half_baths')),
      living_area_sqft: numOrNull(get('living_area_sqft')),
      year_built: numOrNull(get('year_built')),
      lot_size_acres: numOrNull(get('lot_size_acres')),
    };
  }

  function numOrNull(v){
    if(v == null) return null;
    const n = Number(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? null : n;
  }

  /* ----- Build the UI inside the host element ----- */
  function mount(rootEl){
    if(!rootEl || rootEl.dataset.lsdMounted === '1') return;
    rootEl.dataset.lsdMounted = '1';

    const propertyType  = rootEl.dataset.propertyType || 'single_family';
    const srcInputName  = rootEl.dataset.sourceName    || 'listing_remarks_source';
    const textInputName = rootEl.dataset.textName      || 'listing_remarks';
    const standoutsName = rootEl.dataset.standoutsName || 'listing_standouts';

    rootEl.innerHTML = `
      <div class="lsd-picker" role="radiogroup" aria-label="How to provide the property description">
        <button type="button" class="lsd-pick lsd-selected" data-mode="generate" aria-pressed="true">
          <span class="lsd-pick-icon" aria-hidden="true">✶</span>
          <span class="lsd-pick-name">Generate for me</span>
          <span class="lsd-pick-sub">Tell us 3 standouts</span>
        </button>
        <button type="button" class="lsd-pick" data-mode="own" aria-pressed="false">
          <span class="lsd-pick-icon" aria-hidden="true">✎</span>
          <span class="lsd-pick-name">I have my own</span>
          <span class="lsd-pick-sub">Paste &amp; auto-scrub</span>
        </button>
      </div>

      <!-- PATH 1: Generate -->
      <div class="lsd-pane" data-pane="generate">
        <label class="lsd-label">Standout #1</label>
        <input type="text" class="lsd-input" data-standout="1" maxlength="120" placeholder="What's the first thing buyers notice?">
        <label class="lsd-label">Standout #2</label>
        <input type="text" class="lsd-input" data-standout="2" maxlength="120" placeholder="What sets it apart from comps?">
        <label class="lsd-label">Standout #3 <span class="lsd-optional">(optional)</span></label>
        <input type="text" class="lsd-input" data-standout="3" maxlength="120" placeholder="Recent upgrades, unique features, etc.">

        <button type="button" class="lsd-gen-btn" data-action="generate">
          <span class="lsd-gen-icon" aria-hidden="true">✶</span>
          <span class="lsd-gen-text">Generate description</span>
        </button>

        <div class="lsd-gen-result" data-result hidden>
          <div class="lsd-result-head">
            <span class="lsd-pill lsd-pill-ok">✓ MLS compliant · fair housing safe</span>
            <button type="button" class="lsd-link" data-action="regenerate">Regenerate</button>
          </div>
          <textarea class="lsd-textarea" data-output rows="6" maxlength="1200" aria-label="Generated property description"></textarea>
          <div class="lsd-meta">
            <span data-char-count>0 / 1200</span>
            <span class="lsd-hint">You can edit before continuing</span>
          </div>
        </div>

        <div class="lsd-err" data-err hidden></div>
      </div>

      <!-- PATH 2: Own -->
      <div class="lsd-pane" data-pane="own" hidden>
        <label class="lsd-label">Your property description</label>
        <textarea class="lsd-textarea" data-own-input rows="7" maxlength="1500" placeholder="Paste your description here. Aari will auto-scrub anything MLS won't allow."></textarea>
        <div class="lsd-meta">
          <span data-own-count>0 / 1200 used</span>
          <span class="lsd-hint">Auto-scrub runs on continue</span>
        </div>
        <div class="lsd-scrub-report" data-scrub-report hidden></div>
      </div>

      <!-- Hidden inputs the submit handler reads -->
      <input type="hidden" name="${srcInputName}" data-hidden-source value="generated">
      <input type="hidden" name="${textInputName}" data-hidden-text value="">
      <input type="hidden" name="${standoutsName}" data-hidden-standouts value="">
    `;

    // Inject styles once
    injectStyles();

    // Wire interactions
    const picks      = rootEl.querySelectorAll('.lsd-pick');
    const panes      = rootEl.querySelectorAll('.lsd-pane');
    const standouts  = rootEl.querySelectorAll('[data-standout]');
    const genBtn     = rootEl.querySelector('[data-action="generate"]');
    const regenBtn   = rootEl.querySelector('[data-action="regenerate"]');
    const resultBox  = rootEl.querySelector('[data-result]');
    const output     = rootEl.querySelector('[data-output]');
    const charCount  = rootEl.querySelector('[data-char-count]');
    const errBox     = rootEl.querySelector('[data-err]');
    const ownInput   = rootEl.querySelector('[data-own-input]');
    const ownCount   = rootEl.querySelector('[data-own-count]');
    const scrubReport= rootEl.querySelector('[data-scrub-report]');
    const hSource    = rootEl.querySelector('[data-hidden-source]');
    const hText      = rootEl.querySelector('[data-hidden-text]');
    const hStandouts = rootEl.querySelector('[data-hidden-standouts]');

    // Mode switch
    picks.forEach(btn => {
      btn.addEventListener('click', () => {
        picks.forEach(b => { b.classList.remove('lsd-selected'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('lsd-selected');
        btn.setAttribute('aria-pressed','true');
        const mode = btn.dataset.mode;
        panes.forEach(p => { p.hidden = (p.dataset.pane !== mode); });
        hSource.value = (mode === 'own') ? 'agent_provided' : 'generated';
        // Re-sync hidden text from whichever pane is active
        if(mode === 'own'){
          hText.value = ownInput.value || '';
        } else {
          hText.value = output.value || '';
        }
      });
    });

    // Generate path
    genBtn.addEventListener('click', async () => {
      errBox.hidden = true;
      const standoutValues = Array.from(standouts).map(i => i.value.trim()).filter(Boolean);
      if(standoutValues.length < 2){
        showErr('Tell us at least 2 standout features so Aari has something to work with.');
        return;
      }
      genBtn.disabled = true;
      genBtn.classList.add('lsd-loading');
      const original = genBtn.querySelector('.lsd-gen-text').textContent;
      genBtn.querySelector('.lsd-gen-text').textContent = 'Generating…';

      try {
        const basics = getFormBasics(rootEl);
        const result = await callGenerate({
          property_type: propertyType,
          standouts: standoutValues,
          basics,
        });
        if(!result || !result.ok){
          throw new Error((result && result.error) || 'Generation failed');
        }
        output.value = result.remarks;
        charCount.textContent = result.char_count + ' / 1200';
        hText.value = result.remarks;
        hStandouts.value = JSON.stringify(standoutValues);
        hSource.value = 'generated';
        resultBox.hidden = false;
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        showErr('We couldn\'t generate the description. ' + (err.message || 'Try again or paste your own.'));
      } finally {
        genBtn.disabled = false;
        genBtn.classList.remove('lsd-loading');
        genBtn.querySelector('.lsd-gen-text').textContent = original;
      }
    });

    if(regenBtn){
      regenBtn.addEventListener('click', () => { genBtn.click(); });
    }

    // Manual edit of generated output stays in sync
    output.addEventListener('input', () => {
      hText.value = output.value;
      const len = output.value.length;
      charCount.textContent = len + ' / 1200';
      charCount.classList.toggle('lsd-over', len > 1200);
    });

    // Own path — live count + scrub on blur
    ownInput.addEventListener('input', () => {
      const len = ownInput.value.length;
      ownCount.textContent = len + ' / 1200 used';
      ownCount.classList.toggle('lsd-over', len > 1200);
    });
    ownInput.addEventListener('blur', () => {
      runScrub();
    });

    function runScrub(){
      const raw = ownInput.value || '';
      if(!raw.trim()){
        scrubReport.hidden = true;
        hText.value = '';
        return;
      }
      const { text, removed } = scrub(raw);
      hText.value = text.length > 1200 ? text.slice(0, 1197).trimEnd() + '...' : text;
      hSource.value = 'agent_provided';
      if(removed.length > 0){
        scrubReport.hidden = false;
        scrubReport.innerHTML =
          '<span class="lsd-pill lsd-pill-warn">' +
          '⚠ Auto-scrub removed ' + removed.length + ' item' + (removed.length === 1 ? '' : 's') + ':</span>' +
          '<ul class="lsd-scrub-list">' +
          removed.slice(0, 6).map(r => '<li>' + escapeHtml(r.label) + ': <code>' + escapeHtml(r.original) + '</code></li>').join('') +
          '</ul>';
      } else {
        scrubReport.hidden = false;
        scrubReport.innerHTML = '<span class="lsd-pill lsd-pill-ok">✓ Clean — nothing removed</span>';
      }
    }

    function showErr(msg){
      errBox.textContent = msg;
      errBox.hidden = false;
    }

    // Public API on the element for the submit handler to call
    rootEl._aariValidate = function(){
      const mode = hSource.value;
      if(mode === 'agent_provided'){
        runScrub(); // ensure scrubbed before validating
      }
      const text = (hText.value || '').trim();
      if(!text) return 'Add a property description or generate one before continuing.';
      if(text.length > 1200) return 'Description exceeds 1200 characters. Trim it before continuing.';
      return null;
    };
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function callGenerate(payload){
    const url = (global.AariSupabase && global.AariSupabase.functionsUrl)
      ? (global.AariSupabase.functionsUrl + '/generate-listing-description')
      : '/functions/v1/generate-listing-description';
    const headers = { 'content-type': 'application/json' };
    // If the AariAuth supabase client is around, pass its anon key
    try {
      const sb = global.AariAuth && (global.AariAuth.client || global.AariAuth.supabase);
      if(sb && sb.functions && typeof sb.functions.invoke === 'function'){
        const { data, error } = await sb.functions.invoke('generate-listing-description', { body: payload });
        if(error) throw new Error(error.message || 'Edge function error');
        return data;
      }
    } catch(_){}
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return resp.json();
  }

  /* ----- Styles ----- */
  function injectStyles(){
    if(document.getElementById('aari-lsd-styles')) return;
    const css = document.createElement('style');
    css.id = 'aari-lsd-styles';
    css.textContent = `
.lsd-picker{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.lsd-pick{background:#fff;border:1px solid #d8cdb9;border-radius:10px;padding:14px 10px;cursor:pointer;font-family:inherit;color:#0f0f0f;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all 120ms ease}
.lsd-pick:hover{border-color:#b89866}
.lsd-pick.lsd-selected{background:#967a4a;border-color:#7a6238;color:#fff}
.lsd-pick.lsd-selected .lsd-pick-sub{color:rgba(255,255,255,.75)}
.lsd-pick-icon{font-size:18px;margin-bottom:2px}
.lsd-pick-name{font-weight:600;font-size:13px}
.lsd-pick-sub{font-size:11px;color:#3a3a38;letter-spacing:.02em}
.lsd-pane{display:block}
.lsd-pane[hidden]{display:none}
.lsd-label{display:block;font-size:12px;font-weight:600;margin:10px 0 5px;color:#0f0f0f}
.lsd-optional{font-weight:400;color:#3a3a38;font-size:11px}
.lsd-input{width:100%;padding:9px 11px;background:#fff;border:1px solid #d8cdb9;border-radius:8px;font-size:13px;font-family:inherit;color:#0f0f0f}
.lsd-input:focus{outline:none;border-color:#967a4a;box-shadow:0 0 0 2px rgba(150,122,74,.18)}
.lsd-gen-btn{margin-top:14px;width:100%;background:#967a4a;color:#fff;border:1px solid #7a6238;border-radius:8px;padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit}
.lsd-gen-btn:hover{background:#7a6238}
.lsd-gen-btn:disabled{opacity:.6;cursor:not-allowed}
.lsd-gen-btn.lsd-loading{opacity:.7}
.lsd-gen-result{margin-top:14px;padding-top:14px;border-top:1px solid #e8dec9}
.lsd-result-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.lsd-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600}
.lsd-pill-ok{background:#e7f3e7;color:#2c6a2c}
.lsd-pill-warn{background:#fcf3da;color:#7a5a10}
.lsd-textarea{width:100%;padding:10px 11px;background:#fff;border:1px solid #d8cdb9;border-radius:8px;font-size:13px;color:#0f0f0f;font-family:inherit;line-height:1.5;resize:vertical}
.lsd-textarea:focus{outline:none;border-color:#967a4a;box-shadow:0 0 0 2px rgba(150,122,74,.18)}
.lsd-meta{display:flex;justify-content:space-between;font-size:11px;color:#3a3a38;margin-top:5px}
.lsd-meta .lsd-over{color:#a02020;font-weight:600}
.lsd-hint{font-style:italic}
.lsd-link{background:none;border:none;color:#7a6238;font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline;font-family:inherit}
.lsd-err{margin-top:10px;padding:8px 11px;background:#fcecec;border-left:3px solid #a02020;color:#7a2020;font-size:12px;border-radius:4px}
.lsd-scrub-report{margin-top:10px;padding:10px 12px;background:#fbf9f4;border-radius:8px;border:1px solid #e8dec9}
.lsd-scrub-list{margin:8px 0 0 18px;font-size:12px;color:#3a3a38;line-height:1.6}
.lsd-scrub-list code{background:#fff;padding:1px 5px;border-radius:3px;border:1px solid #e8dec9;font-size:11px}
`;
    document.head.appendChild(css);
  }

  global.AariListingDescription = {
    mount,
    scrub,
    SCRUBBERS,
  };

})(window);

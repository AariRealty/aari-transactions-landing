/* =========================================================================
   Aari Transactions · Listing confidential remarks step (three-mode)
   -------------------------------------------------------------------------
   Builds the Realtor / agent-to-agent remarks step inside the listing
   intake. The MLS calls this "Confidential Remarks" — visible to other
   agents in the MLS, not to public-facing syndicators.

   Three modes:

   MODE 1 · USE AARI'S STANDARD  (default for first-time agents)
     Inserts the boilerplate Marlenyi ships on every Aari listing:
       - 2-day seller response window
       - Closing date firm · NO "on or before"
       - FAR/BAR AS-IS or Vacant Land contract required
       - POF / pre-approval required
       - Due diligence disclaimer

   MODE 2 · WRITE MY OWN  (custom override)
     Agent writes their own block. Optional checkbox "Save this as my
     default for future listings" pushes the text into the agent profile
     (`agents.default_confidential_remarks`) so it auto-loads next time.

   MODE 3 · USE MY SAVED DEFAULT  (only shown if profile has one)
     Loads the agent's previously saved template from their profile.

   Source of truth for the boilerplate: window.AariListingSchema.AARI_STANDARD_CONFIDENTIAL_REMARKS.

   Usage:
     <div data-listing-confidential-remarks
          data-text-name="confidential_remarks"
          data-source-name="confidential_remarks_source"
          data-save-flag-name="confidential_remarks_save_to_profile">
     </div>
   Then call: AariListingConfidentialRemarks.mount(rootEl);

   Submit handler reads:
     - confidential_remarks         (the final string going to MLS)
     - confidential_remarks_source  (aari_standard | agent_custom | agent_saved)
     - confidential_remarks_save_to_profile  ('1' if checkbox checked)
   ========================================================================= */
(function(global){
  'use strict';

  const MAX_CHARS = 1500;

  function getStandardText(){
    return (global.AariListingSchema && global.AariListingSchema.AARI_STANDARD_CONFIDENTIAL_REMARKS) || '';
  }

  async function getAgentSavedTemplate(){
    /* Reads `default_confidential_remarks` from the current agent's profile
       via AariAuth. Returns null if no template saved or not signed in. */
    if(!global.AariAuth || typeof global.AariAuth.getCurrentSession !== 'function') return null;
    try {
      const session = await global.AariAuth.getCurrentSession();
      if(!session) return null;
      const sb = global.AariAuth.client || global.AariAuth.supabase;
      if(!sb) return null;
      const { data, error } = await sb
        .from('agents')
        .select('default_confidential_remarks')
        .eq('id', session.user.id)
        .maybeSingle();
      if(error) return null;
      const text = data && data.default_confidential_remarks;
      return (typeof text === 'string' && text.trim().length > 0) ? text.trim() : null;
    } catch(_){
      return null;
    }
  }

  async function saveAgentTemplate(text){
    if(!global.AariAuth || typeof global.AariAuth.getCurrentSession !== 'function') return false;
    try {
      const session = await global.AariAuth.getCurrentSession();
      if(!session) return false;
      const sb = global.AariAuth.client || global.AariAuth.supabase;
      if(!sb) return false;
      const { error } = await sb
        .from('agents')
        .update({ default_confidential_remarks: text })
        .eq('id', session.user.id);
      return !error;
    } catch(_){
      return false;
    }
  }

  function injectStyles(){
    if(document.getElementById('aari-listing-confidential-remarks-styles')) return;
    const css = document.createElement('style');
    css.id = 'aari-listing-confidential-remarks-styles';
    css.textContent = (
      '.lcr-wrap{margin:6px 0 4px}' +
      '.lcr-picker{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}' +
      '@media(min-width:600px){.lcr-picker.lcr-has-saved{grid-template-columns:repeat(3,1fr)}}' +
      '.lcr-pick{background:#fff;border:1px solid #d8cdb9;border-radius:10px;padding:14px 12px;cursor:pointer;font-family:inherit;color:#0f0f0f;display:flex;flex-direction:column;gap:3px;text-align:left;transition:all 120ms ease}' +
      '.lcr-pick:hover{border-color:#b89866}' +
      '.lcr-pick[aria-pressed="true"]{background:#967a4a;border-color:#7a6238;color:#fff}' +
      '.lcr-pick[aria-pressed="true"] .lcr-pick-sub{color:rgba(255,255,255,.78)}' +
      '.lcr-pick-name{font-weight:600;font-size:13px}' +
      '.lcr-pick-sub{font-size:11px;color:#3a3a38;letter-spacing:.02em;line-height:1.4}' +
      '.lcr-pane{margin-top:6px}' +
      '.lcr-readonly-block{background:#fbf9f4;border:1px solid #d8cdb9;border-radius:10px;padding:14px 16px;font-size:13.5px;line-height:1.6;color:#0f0f0f;white-space:pre-wrap;font-family:inherit}' +
      '.lcr-readonly-block-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a6238;font-weight:700;margin-bottom:8px}' +
      '.lcr-textarea{width:100%;padding:13px 14px;font-size:13.5px;line-height:1.6;font-family:inherit;color:#0f0f0f;background:#fff;border:1px solid #d8cdb9;border-radius:10px;min-height:160px;resize:vertical;transition:border-color 120ms ease}' +
      '.lcr-textarea:focus{outline:none;border-color:#967a4a}' +
      '.lcr-meta{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11.5px;color:#3a3a38;letter-spacing:.02em}' +
      '.lcr-save-row{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;background:#f9f2dc;border-radius:8px;border-left:3px solid #967a4a}' +
      '.lcr-save-row input{margin:0;cursor:pointer}' +
      '.lcr-save-row label{font-size:12.5px;color:#0f0f0f;cursor:pointer;line-height:1.4}' +
      '.lcr-save-status{font-size:11px;color:#3b6d11;font-weight:600;letter-spacing:.02em;margin-left:auto}'
    );
    document.head.appendChild(css);
  }

  function mount(rootEl){
    if(!rootEl || rootEl.dataset.lcrMounted === '1') return;
    rootEl.dataset.lcrMounted = '1';

    const textName    = rootEl.dataset.textName     || 'confidential_remarks';
    const sourceName  = rootEl.dataset.sourceName   || 'confidential_remarks_source';
    const saveFlagName= rootEl.dataset.saveFlagName || 'confidential_remarks_save_to_profile';

    const STANDARD = getStandardText();

    injectStyles();

    /* Initial render — saved-template chip is added later if the profile
       has one. We do an async fetch to decide; the picker stays usable in
       the meantime with the two default options. */
    rootEl.innerHTML = (
      '<div class="lcr-wrap">' +
        '<div class="lcr-picker" role="radiogroup" aria-label="How to provide the confidential remarks">' +
          '<button type="button" class="lcr-pick" data-mode="aari_standard" aria-pressed="true">' +
            '<span class="lcr-pick-name">Use Aari\'s standard</span>' +
            '<span class="lcr-pick-sub">Boilerplate with response, contract, and due-diligence terms</span>' +
          '</button>' +
          '<button type="button" class="lcr-pick" data-mode="agent_custom" aria-pressed="false">' +
            '<span class="lcr-pick-name">Write my own</span>' +
            '<span class="lcr-pick-sub">Custom remarks for this listing</span>' +
          '</button>' +
        '</div>' +
        // PANE · Aari standard (read-only display)
        '<div class="lcr-pane" data-pane="aari_standard">' +
          '<div class="lcr-readonly-block-label">Goes into MLS Confidential Remarks</div>' +
          '<div class="lcr-readonly-block" data-standard-display></div>' +
        '</div>' +
        // PANE · Agent custom (textarea + save toggle)
        '<div class="lcr-pane" data-pane="agent_custom" hidden>' +
          '<textarea class="lcr-textarea" data-custom-input rows="7" maxlength="' + MAX_CHARS + '" placeholder="Your remarks · only other agents in the MLS see this."></textarea>' +
          '<div class="lcr-meta"><span data-custom-count>0 / ' + MAX_CHARS + '</span></div>' +
          '<div class="lcr-save-row">' +
            '<input type="checkbox" id="lcrSaveToProfile" data-save-toggle>' +
            '<label for="lcrSaveToProfile">Save this as my default for future listings</label>' +
            '<span class="lcr-save-status" data-save-status></span>' +
          '</div>' +
        '</div>' +
        // PANE · Agent saved (read-only, mode added only if profile has one)
        '<div class="lcr-pane" data-pane="agent_saved" hidden>' +
          '<div class="lcr-readonly-block-label">Your saved default · loaded from profile</div>' +
          '<div class="lcr-readonly-block" data-saved-display></div>' +
        '</div>' +
        // Hidden inputs the submit handler reads
        '<input type="hidden" name="' + textName + '" data-hidden-text>' +
        '<input type="hidden" name="' + sourceName + '" data-hidden-source value="aari_standard">' +
        '<input type="hidden" name="' + saveFlagName + '" data-hidden-save-flag value="0">' +
      '</div>'
    );

    rootEl.querySelector('[data-standard-display]').textContent = STANDARD;
    rootEl.querySelector('[data-hidden-text]').value = STANDARD;

    const picker     = rootEl.querySelector('.lcr-picker');
    const picks      = () => Array.from(rootEl.querySelectorAll('.lcr-pick'));
    const customInput= rootEl.querySelector('[data-custom-input]');
    const customCount= rootEl.querySelector('[data-custom-count]');
    const saveToggle = rootEl.querySelector('[data-save-toggle]');
    const saveStatus = rootEl.querySelector('[data-save-status]');
    const savedDisp  = rootEl.querySelector('[data-saved-display]');
    const hText      = rootEl.querySelector('[data-hidden-text]');
    const hSource    = rootEl.querySelector('[data-hidden-source]');
    const hSaveFlag  = rootEl.querySelector('[data-hidden-save-flag]');

    function selectMode(mode){
      picks().forEach(b => {
        const isSel = (b.dataset.mode === mode);
        b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      });
      rootEl.querySelectorAll('.lcr-pane').forEach(p => {
        p.hidden = (p.dataset.pane !== mode);
      });
      hSource.value = mode;
      if(mode === 'aari_standard')      hText.value = STANDARD;
      else if(mode === 'agent_custom')  hText.value = customInput.value || '';
      else if(mode === 'agent_saved')   hText.value = savedDisp.textContent || '';
    }

    picker.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('.lcr-pick');
      if(!btn) return;
      selectMode(btn.dataset.mode);
    });

    customInput.addEventListener('input', () => {
      const len = customInput.value.length;
      customCount.textContent = len + ' / ' + MAX_CHARS;
      hText.value = customInput.value;
    });

    saveToggle.addEventListener('change', async () => {
      hSaveFlag.value = saveToggle.checked ? '1' : '0';
      // If they tick it, attempt to persist now so the toggle gives instant feedback.
      if(saveToggle.checked && customInput.value.trim().length > 0){
        saveStatus.textContent = 'Saving…';
        const ok = await saveAgentTemplate(customInput.value.trim());
        saveStatus.textContent = ok ? 'Saved' : 'Will retry on submit';
      } else {
        saveStatus.textContent = '';
      }
    });

    // Async · pull the agent's saved template (if any) and reveal the third
    // pick chip when it exists.
    getAgentSavedTemplate().then(saved => {
      if(!saved) return;
      savedDisp.textContent = saved;
      // Insert the third chip
      const thirdChip = document.createElement('button');
      thirdChip.type = 'button';
      thirdChip.className = 'lcr-pick';
      thirdChip.dataset.mode = 'agent_saved';
      thirdChip.setAttribute('aria-pressed', 'false');
      thirdChip.innerHTML = (
        '<span class="lcr-pick-name">Use my saved default</span>' +
        '<span class="lcr-pick-sub">From your last saved template</span>'
      );
      picker.appendChild(thirdChip);
      picker.classList.add('lcr-has-saved');
      // Default to the saved one if they have it — that's what they last chose
      selectMode('agent_saved');
    }).catch(()=>{});
  }

  global.AariListingConfidentialRemarks = {
    mount,
    getStandardText,
    getAgentSavedTemplate,
    saveAgentTemplate,
  };
})(window);

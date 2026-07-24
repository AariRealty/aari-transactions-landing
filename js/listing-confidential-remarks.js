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
      '.lcr-save-status{font-size:11px;color:#3b6d11;font-weight:600;letter-spacing:.02em;margin-left:auto}' +
      // Option A · Review card · Keep this / Change it
      '.lcr-btnrow{display:flex;gap:9px;margin-top:14px}' +
      '.lcr-btn{flex:1;text-align:center;font-size:13px;font-weight:600;padding:11px;border-radius:10px;cursor:pointer;border:1px solid #d8cdb9;background:#fff;color:#0f0f0f;font-family:inherit;transition:all 120ms ease}' +
      '.lcr-btn:hover{border-color:#b89866}' +
      '.lcr-btn-pri{background:#0f0f0f;border-color:#0f0f0f;color:#fff}' +
      '.lcr-btn-pri[data-kept="1"]{background:#3b6d11;border-color:#3b6d11}' +
      '.lcr-back{background:none;border:0;color:#7a6238;font-size:12px;font-weight:600;cursor:pointer;padding:8px 0;margin-top:4px;font-family:inherit}' +
      '.lcr-save-choice-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7a6238;font-weight:700;margin:14px 0 6px}' +
      '.lcr-save-choice{display:flex;gap:8px}' +
      '.lcr-chip{font-size:11.5px;font-weight:600;padding:7px 13px;border-radius:20px;border:1px solid #d8cdb9;background:#fff;color:#0f0f0f;cursor:pointer;font-family:inherit}' +
      '.lcr-chip[aria-pressed="true"]{background:#0f0f0f;border-color:#0f0f0f;color:#fff}'
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

    /* Option A · Review card. Spell out the ACTIVE default (the agent's saved
       template if they have one, otherwise the Aari standard), then Keep this
       or Change it. Change opens an editable copy with two save choices:
       use for this listing only, or save as the new profile default. The
       submit contract is unchanged — hidden confidential_remarks /
       _source / _save_to_profile stay in sync. */
    let activeText = STANDARD;
    let activeSource = 'aari_standard';

    rootEl.innerHTML = (
      '<div class="lcr-wrap">' +
        // REVIEW pane · the default spelled out + Keep / Change
        '<div class="lcr-pane" data-pane="review">' +
          '<div class="lcr-readonly-block-label" data-active-label>Goes into MLS Confidential Remarks &middot; Aari standard</div>' +
          '<div class="lcr-readonly-block" data-active-display></div>' +
          '<div class="lcr-btnrow">' +
            '<button type="button" class="lcr-btn lcr-btn-pri" data-keep>Keep this</button>' +
            '<button type="button" class="lcr-btn" data-change>Change it</button>' +
          '</div>' +
        '</div>' +
        // EDIT pane · editable copy + one-time vs new-default choice
        '<div class="lcr-pane" data-pane="edit" hidden>' +
          '<textarea class="lcr-textarea" data-custom-input rows="7" maxlength="' + MAX_CHARS + '" placeholder="Your remarks &middot; only other agents in the MLS see this."></textarea>' +
          '<div class="lcr-meta"><span data-custom-count>0 / ' + MAX_CHARS + '</span><span class="lcr-save-status" data-save-status></span></div>' +
          '<div class="lcr-save-choice-label">For this edit</div>' +
          '<div class="lcr-save-choice" role="radiogroup" aria-label="Save this edit">' +
            '<button type="button" class="lcr-chip" data-save-mode="once" aria-pressed="true">Use for this listing only</button>' +
            '<button type="button" class="lcr-chip" data-save-mode="default" aria-pressed="false">Save as my new default</button>' +
          '</div>' +
          '<button type="button" class="lcr-back" data-back>&lsaquo; Back to my default</button>' +
        '</div>' +
        // Hidden inputs the submit handler reads
        '<input type="hidden" name="' + textName + '" data-hidden-text>' +
        '<input type="hidden" name="' + sourceName + '" data-hidden-source value="aari_standard">' +
        '<input type="hidden" name="' + saveFlagName + '" data-hidden-save-flag value="0">' +
      '</div>'
    );

    const activeDisplay = rootEl.querySelector('[data-active-display]');
    const activeLabel   = rootEl.querySelector('[data-active-label]');
    const panes      = () => Array.from(rootEl.querySelectorAll('.lcr-pane'));
    const customInput= rootEl.querySelector('[data-custom-input]');
    const customCount= rootEl.querySelector('[data-custom-count]');
    const saveStatus = rootEl.querySelector('[data-save-status]');
    const hText      = rootEl.querySelector('[data-hidden-text]');
    const hSource    = rootEl.querySelector('[data-hidden-source]');
    const hSaveFlag  = rootEl.querySelector('[data-hidden-save-flag]');
    const keepBtn    = rootEl.querySelector('[data-keep]');

    function showPane(which){ panes().forEach(p => { p.hidden = (p.dataset.pane !== which); }); }
    function renderActive(){
      activeDisplay.textContent = activeText;
      activeLabel.innerHTML = (activeSource === 'agent_saved')
        ? 'Goes into MLS Confidential Remarks &middot; your saved default'
        : 'Goes into MLS Confidential Remarks &middot; Aari standard';
    }
    function keepActive(){ hText.value = activeText; hSource.value = activeSource; hSaveFlag.value = '0'; }

    // Default state · review pane, active default loaded and kept.
    renderActive();
    keepActive();
    showPane('review');

    keepBtn.addEventListener('click', () => {
      keepActive();
      keepBtn.setAttribute('data-kept', '1');
      keepBtn.textContent = '✓ Keeping these';
      setTimeout(() => { keepBtn.removeAttribute('data-kept'); keepBtn.textContent = 'Keep this'; }, 1600);
    });

    rootEl.querySelector('[data-change]').addEventListener('click', () => {
      customInput.value = activeText;
      customCount.textContent = customInput.value.length + ' / ' + MAX_CHARS;
      hText.value = customInput.value;
      hSource.value = 'agent_custom';
      hSaveFlag.value = '0';
      rootEl.querySelectorAll('[data-save-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.saveMode === 'once' ? 'true' : 'false'));
      saveStatus.textContent = '';
      showPane('edit');
      try { customInput.focus(); } catch(_){}
    });

    rootEl.querySelector('[data-back]').addEventListener('click', () => { keepActive(); showPane('review'); });

    customInput.addEventListener('input', () => {
      customCount.textContent = customInput.value.length + ' / ' + MAX_CHARS;
      hText.value = customInput.value;
    });

    rootEl.querySelectorAll('[data-save-mode]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.saveMode;
        rootEl.querySelectorAll('[data-save-mode]').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        if(mode === 'default'){
          hSaveFlag.value = '1';
          const txt = customInput.value.trim();
          if(txt.length > 0){
            saveStatus.textContent = 'Saving…';
            const ok = await saveAgentTemplate(txt);
            saveStatus.textContent = ok ? 'Saved as default' : 'Will save on submit';
            if(ok){ activeText = txt; activeSource = 'agent_saved'; renderActive(); }
          }
        } else {
          hSaveFlag.value = '0';
          saveStatus.textContent = '';
        }
      });
    });

    // Async · if the agent already has a saved default, IT becomes the active
    // default shown in the review pane instead of the Aari standard.
    getAgentSavedTemplate().then(saved => {
      if(!saved) return;
      activeText = saved;
      activeSource = 'agent_saved';
      renderActive();
      const editPane = rootEl.querySelector('[data-pane="edit"]');
      if(!editPane || editPane.hidden){ keepActive(); }  // don't clobber an in-progress edit
    }).catch(()=>{});
  }

  global.AariListingConfidentialRemarks = {
    mount,
    getStandardText,
    getAgentSavedTemplate,
    saveAgentTemplate,
  };
})(window);

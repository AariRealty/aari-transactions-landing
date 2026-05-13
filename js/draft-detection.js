/* ============================================================================
   Aari Transactions — Draft detection
   ============================================================================
   On every page load, check whether the visitor has an in-progress intake.

     - LOGGED-IN agents: query Supabase `drafts` table for rows owned by them
       that haven't expired. Most-recent wins.
     - LOGGED-OUT visitors: read from localStorage key `aari_intake_draft`.
       Drafts live 30 days; older entries are auto-cleared.

   If a draft exists, show a B&W modal: "You started a [service] submission
   for [property]. Continue or start over?"

     - "Continue" → fires window event 'aari:resume-intake' with { draft }
       payload. The intake modal listener (in index.html) restores form state.
     - "Start again" → confirms, deletes the draft, dismisses the modal.

   Also exposes:
     AariDraft.save(payload)   // upserts the current draft
     AariDraft.clear()         // hard-deletes
     AariDraft.attachSaveAndExit(buttonEl)  // wires "Save & exit" handler

   Wired by index.html. Requires supabase-config.js + auth.js loaded first.
   ============================================================================ */

(function (global) {
  'use strict';

  const LS_KEY = 'aari_intake_draft';
  const SESSION_KEY = 'aari_session_id';

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'anon_' + crypto.getRandomValues(new Uint32Array(2)).join('_') + '_' + Date.now();
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
    }
    return id;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      // Expire after 30 days
      if (draft.updated_at && Date.now() - draft.updated_at > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(LS_KEY);
        return null;
      }
      return draft;
    } catch (e) { return null; }
  }

  function writeLocal(draft) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(draft)); } catch (e) {}
  }

  function clearLocal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  async function readSupabase() {
    if (!global.AariAuth) return null;
    try {
      const session = await global.AariAuth.getCurrentSession();
      if (!session) return null;
      const client = await global.AariAuth.ensureClient();
      const { data, error } = await client
        .from('drafts')
        .select('*')
        .eq('agent_id', session.user.id)
        .gt('expires_at', new Date().toISOString())
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data && data[0]) || null;
    } catch (err) {
      console.warn('[AariDraft] Supabase read failed; falling back to localStorage:', err);
      return null;
    }
  }

  async function detect() {
    // Prefer Supabase draft for logged-in users; fall back to local.
    let draft = await readSupabase();
    if (!draft) {
      const local = readLocal();
      if (local) draft = local;
    }
    if (!draft) return;
    showResumeModal(draft);
  }

  // ===== Save / clear API =====
  async function save(payload) {
    // payload: { service_type, current_step, form_data, property_address }
    const stamped = Object.assign(
      {},
      payload,
      { updated_at: Date.now(), session_id: getSessionId() }
    );
    writeLocal(stamped);

    // Also push to Supabase if logged in.
    if (!global.AariAuth) return;
    try {
      const session = await global.AariAuth.getCurrentSession();
      if (!session) return;
      const client = await global.AariAuth.ensureClient();
      // Upsert by agent_id (one active draft per agent for v1).
      await client.from('drafts').upsert({
        agent_id: session.user.id,
        service_type: payload.service_type,
        current_step: payload.current_step,
        form_data: payload.form_data || {},
        property_address: payload.property_address || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id' });
    } catch (err) {
      console.warn('[AariDraft] Supabase upsert failed:', err);
    }
  }

  async function clear() {
    clearLocal();
    if (!global.AariAuth) return;
    try {
      const session = await global.AariAuth.getCurrentSession();
      if (!session) return;
      const client = await global.AariAuth.ensureClient();
      await client.from('drafts').delete().eq('agent_id', session.user.id);
    } catch (err) {
      console.warn('[AariDraft] Supabase clear failed:', err);
    }
  }

  // ===== Resume modal UI =====
  function showResumeModal(draft) {
    if (document.getElementById('aari-resume-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'aari-resume-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,15,15,0.55);backdrop-filter:blur(4px);z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:30px;padding:38px 40px;max-width:460px;width:100%;box-shadow:0 30px 60px rgba(0,0,0,0.3)';

    const eyebrow = document.createElement('div');
    eyebrow.textContent = 'Welcome back';
    eyebrow.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b6b6b;margin-bottom:10px';
    card.appendChild(eyebrow);

    const title = document.createElement('h2');
    title.textContent = 'You have a draft in progress';
    title.style.cssText = "font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:30px;line-height:1.1;letter-spacing:-0.02em;color:#0f0f0f;margin:0 0 6px";
    card.appendChild(title);

    const detail = document.createElement('p');
    const svc = describeService(draft.service_type);
    const addr = draft.property_address ? ' for ' + draft.property_address : '';
    detail.innerHTML = 'You started a <strong>' + esc(svc) + '</strong> submission' + esc(addr) + '. Continue where you left off?';
    detail.style.cssText = 'font-size:14px;color:#262626;margin-bottom:24px;line-height:1.55';
    card.appendChild(detail);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end';

    const startOver = document.createElement('button');
    startOver.type = 'button';
    startOver.textContent = 'Start again';
    startOver.style.cssText = 'padding:14px 24px;font-size:14px;font-weight:600;border-radius:10px;border:1px solid #0f0f0f;background:transparent;color:#0f0f0f;cursor:pointer;font-family:inherit';
    startOver.addEventListener('click', async () => {
      if (!confirm('This will erase the saved draft. Are you sure?')) return;
      await clear();
      overlay.remove();
    });

    const cont = document.createElement('button');
    cont.type = 'button';
    cont.textContent = 'Continue →';
    cont.style.cssText = 'padding:14px 24px;font-size:14px;font-weight:600;border-radius:10px;border:1px solid #0f0f0f;background:#0f0f0f;color:#fff;cursor:pointer;font-family:inherit';
    cont.addEventListener('click', () => {
      overlay.remove();
      window.dispatchEvent(new CustomEvent('aari:resume-intake', { detail: { draft } }));
    });

    actions.appendChild(startOver);
    actions.appendChild(cont);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function describeService(t) {
    const map = {
      tc_one_side: 'TC One Side', tc_both_sides: 'TC Both Sides',
      lc: 'Listing Coordinator', op_basic: 'Offer Prep · Basic',
      op_complete: 'Offer Prep · Complete', listing_docs: 'Listing Docs',
      mls_setup: 'MLS Setup', file_org: 'File Organization',
      compliance: 'Compliance Review',
    };
    return map[t] || (t || 'file');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // ===== Save & exit button helper =====
  function attachSaveAndExit(btn, getCurrentPayload) {
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const payload = typeof getCurrentPayload === 'function' ? getCurrentPayload() : {};
      await save(payload);
      const toast = document.createElement('div');
      toast.textContent = 'Draft saved. We\'ll restore it next visit.';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f0f0f;color:#fff;padding:14px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:1200;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2400);
    });
  }

  global.AariDraft = { detect, save, clear, attachSaveAndExit, getSessionId };

  // Auto-run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => detect());
  } else {
    detect();
  }
})(window);

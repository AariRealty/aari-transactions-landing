/* ============================================================================
   Aari Transactions — Intake form auto-fill
   ============================================================================
   Behavior:
     - On page load, check the Supabase session.
     - If logged in: fetch the agent profile, fill the intake modal's "Agent"
       fieldset with the saved values, then HIDE that fieldset (its inputs
       still post — they're just hidden from view) and inject a small
       "Submitting as: [Name] · [Brokerage] · Use a different account?" banner.
     - If logged out: leave the fieldset visible and inject a subtle prompt
       "First time? Register first to save your info for next time."

   Loaded by index.html. Requires supabase-config.js + auth.js to be loaded
   first.
   ============================================================================ */

(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }

  function findAgentFieldset() {
    // The agent block is the first form-block whose <legend> reads "Agent".
    const blocks = document.querySelectorAll('#intake-form fieldset.form-block');
    for (const fs of blocks) {
      const legend = fs.querySelector('legend');
      if (legend && legend.textContent.trim().toLowerCase() === 'agent') return fs;
    }
    return null;
  }

  function setInput(name, value) {
    const inp = document.querySelector('#intake-form [name="' + name + '"]');
    if (inp && value != null) inp.value = value;
  }

  function injectBanner(html, kind) {
    const fs = findAgentFieldset();
    if (!fs) return;
    const existing = fs.parentElement.querySelector('.aari-intake-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.className = 'aari-intake-banner ' + kind;
    banner.innerHTML = html;
    banner.style.cssText = [
      'background:' + (kind === 'logged-in' ? '#eef2ec' : '#f0e9da'),
      'border-left:3px solid ' + (kind === 'logged-in' ? '#a4b8a6' : '#0f0f0f'),
      'padding:12px 16px',
      'border-radius:8px',
      'font-size:13px',
      'color:#262626',
      'line-height:1.55',
      'margin-bottom:18px',
    ].join(';');
    fs.parentElement.insertBefore(banner, fs);
  }

  function applyLoggedInState(agent) {
    const fs = findAgentFieldset();
    if (!fs) return;

    // Pre-fill (these inputs stay in the form so the existing submit handler keeps working)
    setInput('agent_name', (agent.first_name + ' ' + agent.last_name).trim());
    setInput('agent_email', agent.email);
    setInput('agent_phone', agent.phone);
    setInput('agent_license_number', agent.license_number);
    setInput('agent_license_state', agent.license_state || 'FL');
    setInput('brokerage', agent.brokerage_name);
    if (agent.broker_name || agent.broker_email) {
      setInput('broker_contact', [agent.broker_name, agent.broker_email].filter(Boolean).join(' · '));
    }

    // Hide the entire fieldset visually but keep inputs in the DOM so they post
    fs.style.display = 'none';
    fs.setAttribute('data-aari-autofilled', 'true');

    // Visible confirmation banner
    const fullName = (agent.first_name + ' ' + agent.last_name).trim();
    injectBanner(
      'Submitting as <strong>' + escapeHtml(fullName) + '</strong>'
        + ' · ' + escapeHtml(agent.brokerage_name || '')
        + ' &nbsp;·&nbsp; <a href="#" data-aari-signout style="color:#0f0f0f;text-decoration:underline;text-underline-offset:3px;font-weight:600;cursor:pointer">Use a different account</a>',
      'logged-in'
    );

    const so = document.querySelector('[data-aari-signout]');
    if (so) so.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await window.AariAuth.signOut(); } catch (err) {}
      window.location.reload();
    });
  }

  function applyLoggedOutState() {
    const fs = findAgentFieldset();
    if (!fs) return;
    injectBanner(
      'First time? <a href="register.html" style="color:#0f0f0f;text-decoration:underline;text-underline-offset:3px;font-weight:600">Register first</a> to save your info. Next time we\'ll only ask for what\'s specific to the file.',
      'logged-out'
    );
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  async function init() {
    if (!window.AariAuth) {
      // auth.js not loaded — silently no-op so the existing intake flow still works.
      return;
    }
    try {
      const session = await window.AariAuth.getCurrentSession();
      if (!session) {
        applyLoggedOutState();
        return;
      }
      const agent = await window.AariAuth.getAgentProfile();
      if (agent) applyLoggedInState(agent);
      else applyLoggedOutState();
    } catch (err) {
      // Network / config error — fall back to logged-out UI so submissions can still happen.
      console.warn('[intake-autofill] falling back to logged-out:', err);
      applyLoggedOutState();
    }
  }

  // The intake modal mounts on page load but stays hidden. We can apply the
  // autofill immediately — the fieldset DOM is present.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

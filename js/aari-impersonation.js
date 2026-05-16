/* ============================================================================
   Aari Transactions · Broker impersonation
   ============================================================================
   When a broker visits a portal page with `?as=USER_ID` in the URL, the page
   loads that user's view instead of the broker's own — without signing the
   broker out. Powered by a parallel RLS policy (see 20260518_broker_impersonation.sql)
   that grants broker-role users SELECT access to every agent row.

   Public API (window.AariImpersonation):
     - init()                       → reads ?as=, verifies broker, sets state, renders banner
     - getImpersonatedUserId()      → returns target user_id if impersonating, else null
     - getImpersonatedProfile()     → returns the impersonated agent row (or null)
     - isActive()                   → boolean shortcut
     - exit()                       → strips ?as= from the URL and reloads (back to broker view)

   Must be loaded AFTER js/supabase-config.js and js/auth.js.
   Call AariImpersonation.init() before fetching any user-scoped data on the page.
   ============================================================================ */
(function (global) {
  'use strict';

  var STATE = {
    active: false,
    targetUserId: null,
    targetProfile: null,
    brokerProfile: null
  };

  function getQueryParam(name) {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch (_) { return null; }
  }

  function injectBannerCss() {
    if (document.getElementById('aari-impersonation-css')) return;
    var s = document.createElement('style');
    s.id = 'aari-impersonation-css';
    s.textContent = [
      '.aari-impersonation-banner{position:sticky;top:0;left:0;right:0;z-index:200;background:#967a4a;color:#fff;padding:10px 18px;display:flex;justify-content:center;align-items:center;gap:14px;font-family:"Inter",sans-serif;font-size:12.5px;font-weight:500;letter-spacing:0.2px;box-shadow:0 2px 6px rgba(0,0,0,.15)}',
      '.aari-impersonation-banner strong{font-weight:700;color:#fff}',
      '.aari-impersonation-banner .aari-imp-exit{background:#0f0f0f;color:#fff;border:1px solid #0f0f0f;padding:6px 14px;border-radius:5px;font-size:11px;font-weight:600;letter-spacing:0.3px;cursor:pointer;text-decoration:none;font-family:inherit;transition:opacity .15s}',
      '.aari-impersonation-banner .aari-imp-exit:hover{opacity:.85}',
      '@media(max-width:540px){.aari-impersonation-banner{flex-direction:column;gap:8px;padding:10px 14px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderBanner() {
    if (!STATE.active || !STATE.targetProfile) return;
    injectBannerCss();
    if (document.getElementById('aari-impersonation-banner')) return;
    var b = document.createElement('div');
    b.id = 'aari-impersonation-banner';
    b.className = 'aari-impersonation-banner';
    b.setAttribute('role', 'status');
    var p = STATE.targetProfile;
    var name = ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || p.email || STATE.targetUserId.slice(0, 8);
    var roleWord = p.role === 'tc' ? 'TC' : (p.role === 'broker' ? 'Broker' : 'Agent');
    b.innerHTML =
      '<span>Viewing as <strong>' + escapeHtml(name) + '</strong> &middot; ' + escapeHtml(roleWord) + ' &middot; impersonation</span>' +
      '<button type="button" class="aari-imp-exit" id="aari-imp-exit-btn">Stop impersonating</button>';
    // Insert at very top of <body>
    document.body.insertBefore(b, document.body.firstChild);
    document.getElementById('aari-imp-exit-btn').addEventListener('click', exit);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  async function init() {
    var targetId = getQueryParam('as');
    if (!targetId) {
      STATE.active = false;
      return STATE;
    }
    if (!global.AariAuth) {
      console.error('[AariImpersonation] AariAuth missing — load auth.js before this module');
      return STATE;
    }
    // Verify the CURRENT user is a broker — anyone else with ?as= in their URL is ignored
    var brokerProfile = await global.AariAuth.getAgentProfile();
    if (!brokerProfile) {
      console.warn('[AariImpersonation] no profile loaded — ignoring ?as=');
      return STATE;
    }
    if (brokerProfile.role !== 'broker') {
      console.warn('[AariImpersonation] current user is not a broker — ignoring ?as=');
      return STATE;
    }
    STATE.brokerProfile = brokerProfile;

    // Load target user's profile via RLS (broker has read-all SELECT on agents)
    try {
      var client = await global.AariAuth.ensureClient();
      var res = await client.from('agents').select('*').eq('id', targetId).single();
      if (res.error || !res.data) {
        console.warn('[AariImpersonation] target user not found', targetId, res.error);
        return STATE;
      }
      STATE.active = true;
      STATE.targetUserId = targetId;
      STATE.targetProfile = res.data;
    } catch (e) {
      console.error('[AariImpersonation] init failed', e);
      return STATE;
    }

    // Wait for DOM ready before rendering the banner
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderBanner);
    } else {
      renderBanner();
    }
    return STATE;
  }

  function getImpersonatedUserId() {
    return STATE.active ? STATE.targetUserId : null;
  }
  function getImpersonatedProfile() {
    return STATE.active ? STATE.targetProfile : null;
  }
  function isActive() { return STATE.active; }
  function exit() {
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete('as');
      window.location.replace(u.toString());
    } catch (_) {
      window.location.href = window.location.pathname;
    }
  }

  global.AariImpersonation = {
    init: init,
    getImpersonatedUserId: getImpersonatedUserId,
    getImpersonatedProfile: getImpersonatedProfile,
    isActive: isActive,
    exit: exit
  };
})(typeof window !== 'undefined' ? window : globalThis);

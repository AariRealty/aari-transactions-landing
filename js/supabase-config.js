/* ============================================================================
   Aari Transactions — Supabase Configuration
   ============================================================================
   PRE-LAUNCH TODO (BLOCKING):
     1. Create the Supabase project at https://supabase.com → Aari Transactions
     2. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with the real values
        (Project Settings → API → URL + anon public key)
     3. Run the SQL migrations in /Migration/supabase-schema.sql (to be created)
     4. Configure Auth → Email Templates (signup confirm, password reset)
     5. Configure Auth → URL Configuration (redirect URLs for password reset)
     6. Verify email send (SMTP) — Supabase default is rate-limited; configure
        a real SMTP (Postmark / Resend / SendGrid) before any agent registers.

   The anon key is safe to expose in browser code — it only grants what RLS
   policies allow. The service_role key MUST NEVER appear in this file.
   ============================================================================ */

/* ---------------------------------------------------------------------------
 * SSO handoff receiver · Marlenyi Jul 28.
 *
 * Two paths so this survives every load ordering:
 *   Path A — URL hash: hub.joinaari.com puts the session in the iframe URL
 *     as #aari-auth=<base64 JSON>. We read + strip it synchronously here,
 *     BEFORE Supabase's JS client boots, so the client finds a valid
 *     session on first check and the login modal never has to appear.
 *   Path B — postMessage: fallback for cases where the hash was stripped
 *     (redirect, referrer policy) or arrives late from the parent.
 *
 * This file is loaded before auth.js on every auth-gated page. Fails open
 * on any exception so a broken handoff can never lock the user out.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * Direct-visit gate · Marlenyi Jul 28.
 *
 * If someone lands on an auth-gated page here without a Supabase session AND
 * without an inbound hash handoff AND we are NOT inside an iframe (i.e. the
 * hub embed flow), bounce to hub.joinaari.com so they hit the shared
 * "Miss us?" sign-in template. Only fires on obviously private surfaces —
 * marketing pages (/, /index.html, /about, /contact, etc.) load normally.
 * ------------------------------------------------------------------------- */
(function () {
  try {
    if (window.top !== window.self) return;             // embedded · parent handles auth
  } catch (_e) { return; }
  var p = (window.location.pathname || '').toLowerCase();
  // Only gate the private surfaces. Anything else (marketing, public forms,
  // reset-password, login modal callers) loads without redirect.
  var GATED = /^\/(files|files-|portal|tc-cockpit|tc-portal|broker-cockpit|broker-backoffice|broker-weekly-report|aari-agent-crm|aari-crm|prospecting|pipeline|my-contacts|aari-reviews|associate-dashboard|briefing|eileen|milennys|marlenyi)(\.html)?(\/|$)/;
  if (!GATED.test(p)) return;
  // If a handoff hash is present or a Supabase session already exists in
  // localStorage, let the page load — the receiver below will seed it.
  if ((window.location.hash || '').indexOf('aari-auth=') !== -1) return;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf('supabase.auth.token') === 0) return;
      if (/^sb-.*-auth-token$/.test(k)) return;
    }
  } catch (_e) { return; }
  window.location.replace('https://hub.joinaari.com/');
})();

(function () {
  var LS_KEY = 'sb-fnlrgmuvtgwzjsihqxcn-auth-token';

  function _seed(d) {
    if (!d || !d.access_token || !d.refresh_token) return;
    try {
      var payload = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + 3600),
        expires_in: d.expires_in || 3600,
        token_type: 'bearer',
        user: d.user || null
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (_err) { /* localStorage blocked · fall through */ }
    try {
      if (window.sb && window.sb.auth && typeof window.sb.auth.setSession === 'function') {
        window.sb.auth.setSession({
          access_token: d.access_token,
          refresh_token: d.refresh_token
        });
      }
    } catch (_err) { /* no-op */ }
    try { window.dispatchEvent(new Event('aari-auth-handoff-received')); } catch (_err) {}
  }

  // Path A · read the URL hash SYNCHRONOUSLY so Supabase's JS client sees
  // the session on first localStorage read, before any login-modal code runs.
  try {
    var m = (window.location.hash || '').match(/[#&]aari-auth=([^&]+)/);
    if (m && m[1]) {
      var raw = atob(decodeURIComponent(m[1]));
      var d = JSON.parse(raw);
      _seed(d);
      // Scrub the hash so tokens do not linger in the URL bar or history.
      try {
        var clean = window.location.pathname + window.location.search;
        history.replaceState(null, '', clean);
      } catch (_e) {}
    }
  } catch (_e) { /* malformed hash · fall through */ }

  // Path B · postMessage fallback for anything Path A missed.
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://hub.joinaari.com') return;
    var msg = e && e.data;
    if (!msg || msg.type !== 'aari-auth-handoff') return;
    _seed(msg);
  }, false);
})();

window.AARI_SUPABASE_CONFIG = {
  // Provisioned 2026-05-10. Browser-safe (anon publishable key).
  SUPABASE_URL: 'https://fnlrgmuvtgwzjsihqxcn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_OsZVC29HKhFAZRNVo3yKqQ_wM7r2ANd',

  // Where Supabase sends users after they click the email confirm / reset link.
  // Must be added to the Supabase project's "Redirect URLs" allow-list.
  // Switched to the working Netlify URL because aaritransactions.com is not yet
  // wired to the new Netlify deploy. Switch back to aaritransactions.com
  // once the custom domain is connected.
  AUTH_REDIRECT_URL: 'https://aari-transactions.netlify.app/portal',
  PASSWORD_RESET_REDIRECT_URL: 'https://aari-transactions.netlify.app/reset-password.html',

  // Used by login rate-limiter (client-side; server-side enforcement is in
  // Supabase Auth's built-in throttling and the rate_limits RLS table).
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MINUTES: 15,
  LOGIN_LOCKOUT_MINUTES: 30,
};

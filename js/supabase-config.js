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
 * When this site is loaded in an iframe from hub.joinaari.com (the TC pill
 * flow), the hub sends the parent user's Supabase session via postMessage.
 * We stash the tokens in Supabase's own localStorage slot BEFORE the JS
 * client boots so the page picks up the session on first render and the
 * login modal never has to appear.
 *
 * Registered synchronously — this file loads before auth.js on every
 * auth-gated page. Fails open on any exception so a broken handoff can
 * never lock the user out.
 * ------------------------------------------------------------------------- */
(function () {
  var LS_KEY = 'sb-fnlrgmuvtgwzjsihqxcn-auth-token';
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://hub.joinaari.com') return;
    var d = e && e.data;
    if (!d || d.type !== 'aari-auth-handoff') return;
    if (!d.access_token || !d.refresh_token) return;
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

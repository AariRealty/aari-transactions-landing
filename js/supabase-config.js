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

window.AARI_SUPABASE_CONFIG = {
  // Provisioned 2026-05-10. Browser-safe (anon publishable key).
  SUPABASE_URL: 'https://fnlrgmuvtgwzjsihqxcn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_OsZVC29HKhFAZRNVo3yKqQ_wM7r2ANd',

  // Where Supabase sends users after they click the email confirm / reset link.
  // Must be added to the Supabase project's "Redirect URLs" allow-list.
  AUTH_REDIRECT_URL: 'https://aaritransactions.com/portal',
  PASSWORD_RESET_REDIRECT_URL: 'https://aaritransactions.com/reset-password.html',

  // Used by login rate-limiter (client-side; server-side enforcement is in
  // Supabase Auth's built-in throttling and the rate_limits RLS table).
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MINUTES: 15,
  LOGIN_LOCKOUT_MINUTES: 30,
};

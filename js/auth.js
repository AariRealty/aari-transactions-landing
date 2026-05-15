/* ============================================================================
   Aari Transactions — Auth API
   ============================================================================
   Wraps Supabase Auth + the `agents` profile table behind a small surface:
     AariAuth.signUp(profile, password)
     AariAuth.signIn(email, password)
     AariAuth.signOut()
     AariAuth.requestPasswordReset(email)
     AariAuth.getCurrentSession()
     AariAuth.getAgentProfile()        // hydrates the row from `agents` table
     AariAuth.checkLoginRateLimit(email)  // client-side rate limiter
     AariAuth.recordLoginAttempt(email, success)

   Loads the Supabase JS client from CDN. Reads config from window.AARI_SUPABASE_CONFIG.
   ============================================================================ */

(function (global) {
  'use strict';

  const CFG = global.AARI_SUPABASE_CONFIG;
  if (!CFG) {
    console.error('[AariAuth] AARI_SUPABASE_CONFIG missing. Include supabase-config.js first.');
    return;
  }

  let _client = null;
  let _clientReady = null;

  function ensureClient() {
    if (_clientReady) return _clientReady;
    // AP-2 · Explicit auth options · session persists across pages of aaritransactions.com
    // until the agent clicks Sign Out. Navigating from /portal back to / (or any link)
    // must NOT log the agent out. persistSession + autoRefreshToken handle this.
    const SUPABASE_AUTH_OPTS = {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
        storageKey: 'aari-auth-session'
      }
    };
    _clientReady = new Promise((resolve, reject) => {
      if (global.supabase && global.supabase.createClient) {
        _client = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, SUPABASE_AUTH_OPTS);
        return resolve(_client);
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      s.async = true;
      s.onload = () => {
        if (!global.supabase || !global.supabase.createClient) {
          return reject(new Error('Supabase JS client failed to load.'));
        }
        _client = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, SUPABASE_AUTH_OPTS);
        resolve(_client);
      };
      s.onerror = () => reject(new Error('Failed to load Supabase from CDN.'));
      document.head.appendChild(s);
    });
    return _clientReady;
  }

  // ===== Rate limiter (client-side; server still enforces via Supabase Auth) =====
  const RL_KEY = 'aari_login_attempts';

  function readAttempts() {
    try {
      return JSON.parse(localStorage.getItem(RL_KEY) || '{}');
    } catch (e) { return {}; }
  }

  function writeAttempts(data) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function checkLoginRateLimit(email) {
    const key = (email || '').toLowerCase().trim();
    if (!key) return { allowed: true };
    const all = readAttempts();
    const rec = all[key];
    if (!rec) return { allowed: true };

    const now = Date.now();
    if (rec.lockoutUntil && now < rec.lockoutUntil) {
      const minutesLeft = Math.ceil((rec.lockoutUntil - now) / 60000);
      return { allowed: false, reason: 'lockout', minutesLeft };
    }
    // Reset window if older than LOGIN_WINDOW_MINUTES
    if (now - rec.windowStart > CFG.LOGIN_WINDOW_MINUTES * 60000) {
      return { allowed: true };
    }
    if (rec.failures >= CFG.LOGIN_MAX_ATTEMPTS) {
      return { allowed: false, reason: 'too_many_attempts' };
    }
    return { allowed: true, attemptsRemaining: CFG.LOGIN_MAX_ATTEMPTS - rec.failures };
  }

  function recordLoginAttempt(email, success) {
    const key = (email || '').toLowerCase().trim();
    if (!key) return;
    const all = readAttempts();
    const now = Date.now();
    const rec = all[key] || { failures: 0, windowStart: now, lockoutUntil: 0 };

    if (success) {
      delete all[key];
    } else {
      // New window if expired
      if (now - rec.windowStart > CFG.LOGIN_WINDOW_MINUTES * 60000) {
        rec.failures = 1;
        rec.windowStart = now;
        rec.lockoutUntil = 0;
      } else {
        rec.failures += 1;
      }
      if (rec.failures >= CFG.LOGIN_MAX_ATTEMPTS) {
        rec.lockoutUntil = now + CFG.LOGIN_LOCKOUT_MINUTES * 60000;
      }
      all[key] = rec;
    }
    writeAttempts(all);
  }

  // ===== Auth API =====

  /**
   * Create a new agent account.
   *
   * Email confirmation is enabled in production, so signUp returns a user
   * but no session. The agent profile row is created server-side by the
   * `handle_new_agent` trigger (M4) reading from raw_user_meta_data.
   * No client-side insert into public.agents — RLS would reject it because
   * auth.uid() is null until the user clicks the confirmation email.
   *
   * @param {Object} profile  Required Tier-1 fields collected at registration.
   *   { firstName, lastName, email, phone, serviceCounties[],
   *     licenseNumber, licenseState, licenseExpiresAt,
   *     brokerageName, brokerageAddress?, brokerName, brokerEmail, brokerPhone? }
   * @param {string} password  Min 8 chars, must include letters and numbers.
   * @returns {Promise<{user, session}>}
   */
  async function signUp(profile, password) {
    const client = await ensureClient();
    const { data: signUpData, error: signUpError } = await client.auth.signUp({
      email: profile.email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: CFG.AUTH_REDIRECT_URL,
        data: {
          // Top-level convenience fields (used by Supabase email templates if
          // they reference {{ .UserMetaData.first_name }} etc.)
          first_name: profile.firstName,
          last_name: profile.lastName,
          // The full profile payload consumed by the handle_new_agent trigger.
          // Keys are snake_case to match the agents table columns.
          agent_profile: {
            first_name: profile.firstName,
            last_name: profile.lastName,
            phone: profile.phone,
            service_counties: profile.serviceCounties || [],
            license_number: profile.licenseNumber,
            license_state: profile.licenseState || 'FL',
            license_expires_at: profile.licenseExpiresAt,
            brokerage_name: profile.brokerageName,
            brokerage_address: profile.brokerageAddress || null,
            broker_name: profile.brokerName,
            broker_email: profile.brokerEmail,
            broker_phone: profile.brokerPhone || null,
          },
        },
      },
    });
    if (signUpError) throw signUpError;

    if (!signUpData.user) {
      throw new Error('Sign-up did not return a user. Please try again.');
    }

    return { user: signUpData.user, session: signUpData.session };
  }

  async function signIn(email, password) {
    const client = await ensureClient();
    const cleanEmail = email.trim().toLowerCase();

    const rl = checkLoginRateLimit(cleanEmail);
    if (!rl.allowed) {
      const err = new Error(
        rl.reason === 'lockout'
          ? `Too many failed attempts. Try again in ${rl.minutesLeft} minute(s).`
          : 'Too many attempts. Please wait before trying again.'
      );
      err.code = 'rate_limited';
      throw err;
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      recordLoginAttempt(cleanEmail, false);
      // Generic message — never reveal whether email is registered.
      const wrapped = new Error('Email or password is incorrect.');
      wrapped.code = 'invalid_credentials';
      throw wrapped;
    }

    recordLoginAttempt(cleanEmail, true);
    return data;
  }

  async function signOut() {
    const client = await ensureClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function requestPasswordReset(email) {
    const client = await ensureClient();
    const { error } = await client.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: CFG.PASSWORD_RESET_REDIRECT_URL }
    );
    if (error) throw error;
  }

  async function getCurrentSession() {
    const client = await ensureClient();
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function getAgentProfile() {
    const client = await ensureClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client
      .from('agents')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  // ===== Public API =====
  global.AariAuth = {
    ensureClient,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    getCurrentSession,
    getAgentProfile,
    checkLoginRateLimit,
    recordLoginAttempt,
  };
})(window);

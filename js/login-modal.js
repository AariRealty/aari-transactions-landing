/* ============================================================================
   Aari Transactions — Login Modal
   ============================================================================
   Drop-in modal usable on any public page. Requires:
     - css/auth.css loaded in <head>
     - js/supabase-config.js loaded
     - js/auth.js loaded

   Usage:
     <button data-aari-login>Sign in</button>
     <a href="#" data-aari-login>Portal</a>
     <a href="#login" data-aari-login>Sign in</a>
     // or programmatic:
     AariLogin.open();

   The modal injects its own DOM on first open. Calling open() again reuses it.
   ============================================================================ */

(function (global) {
  'use strict';

  let _root = null;
  let _state = 'login'; // 'login' | 'reset' | 'reset-sent' | 'signed-in'

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  function mount() {
    if (_root) return _root;
    _root = el('div', { class: 'aari-modal-overlay', 'aria-hidden': 'true' });
    _root.addEventListener('click', e => { if (e.target === _root) close(); });
    document.body.appendChild(_root);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _root.classList.contains('open')) close(); });
    return _root;
  }

  function render() {
    if (!_root) return;
    _root.innerHTML = '';
    const card = el('div', { class: 'aari-modal-card', role: 'dialog', 'aria-modal': 'true' });
    const closeBtn = el('button', { class: 'aari-modal-close', 'aria-label': 'Close', type: 'button' });
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);
    card.appendChild(closeBtn);

    // Brand logo · only renders if the real logo file exists. No placeholder/"A"
    // fallback (per request) · if the file is missing, nothing shows.
    const logoImg = el('img', { src: '/images/aari-a-logo.png', alt: 'Aari', style: 'height:58px;width:auto;display:block;margin:2px auto 20px' });
    logoImg.addEventListener('error', function(){ logoImg.remove(); });
    card.appendChild(logoImg);

    if (_state === 'login') card.appendChild(loginView());
    else if (_state === 'reset') card.appendChild(resetView());
    else if (_state === 'reset-sent') card.appendChild(resetSentView());
    else if (_state === 'signed-in') card.appendChild(signedInView());

    _root.appendChild(card);
  }

  function loginView() {
    const wrap = el('div');
    wrap.appendChild(el('h1', { style: "font-family:'Cormorant Garamond','Playfair Display',Georgia,serif;font-size:34px;font-weight:600;color:#0f0f0f;margin:0 0 6px;letter-spacing:-0.01em", html: 'Agent Portal' }));
    wrap.appendChild(el('p', { style: 'font-size:14px;color:#6b6b6b;line-height:1.5;margin:0 0 20px', html: 'Sign in to access your files and transactions.' }));
    wrap.appendChild(el('div', { style: 'height:1px;background:#e6e2d8;margin:0 0 22px' }));

    // SIGN IN / CREATE ACCOUNT segmented toggle
    const seg = el('div', { style: 'display:flex;border:1px solid #e6e2d8;border-radius:10px;overflow:hidden;margin:0 0 22px' });
    seg.appendChild(el('button', { type: 'button', style: 'flex:1;padding:13px 0;border:0;background:#0f0f0f;color:#fff;font:700 12px Inter,sans-serif;letter-spacing:0.08em;text-transform:uppercase;cursor:default', html: 'Sign in' }));
    const segCreate = el('button', { type: 'button', style: 'flex:1;padding:13px 0;border:0;background:#faf9f6;color:#6b6b6b;font:700 12px Inter,sans-serif;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer', html: 'Create account' });
    segCreate.addEventListener('click', function(){ openRegister(); });
    seg.appendChild(segCreate);
    wrap.appendChild(seg);

    const alertSlot = el('div');
    wrap.appendChild(alertSlot);

    const form = el('form', { novalidate: 'true' });

    const emailField = el('div', { class: 'aari-field' });
    emailField.appendChild(el('label', { for: 'aari-login-email', html: 'Email <span class="req">*</span>' }));
    const emailInput = el('input', { class: 'aari-input', id: 'aari-login-email', type: 'email', autocomplete: 'email', required: 'true', placeholder: 'you@brokerage.com' });
    emailField.appendChild(emailInput);
    form.appendChild(emailField);

    const pwField = el('div', { class: 'aari-field' });
    pwField.appendChild(el('label', { for: 'aari-login-pw', html: 'Password <span class="req">*</span>' }));
    // May 2026 · password show/hide toggle · standard eye icon UX
    const pwWrap = el('div', { class: 'aari-pw-wrap', style: 'position:relative;display:flex;align-items:center' });
    const pwInput = el('input', { class: 'aari-input', id: 'aari-login-pw', type: 'password', autocomplete: 'current-password', required: 'true', placeholder: '••••••••', style: 'padding-right:44px;width:100%' });
    const pwToggle = el('button', {
      type: 'button',
      class: 'aari-pw-toggle',
      'aria-label': 'Show password',
      style: 'position:absolute;right:10px;top:50%;transform:translateY(-50%);background:transparent;border:none;cursor:pointer;color:#967a4a;padding:4px 8px;font-size:13px;font-family:inherit;font-weight:600;letter-spacing:0.04em'
    });
    pwToggle.textContent = 'Show';
    pwToggle.addEventListener('click', () => {
      const showing = pwInput.type === 'text';
      pwInput.type = showing ? 'password' : 'text';
      pwToggle.textContent = showing ? 'Show' : 'Hide';
      pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      pwInput.focus();
    });
    pwWrap.appendChild(pwInput);
    pwWrap.appendChild(pwToggle);
    pwField.appendChild(pwWrap);
    const forgotWrap = el('div', { class: 'aari-helper', style: 'margin-top:8px;text-align:right' });
    const forgotLink = el('a', { html: 'Forgot password?' });
    forgotLink.style.cursor = 'pointer';
    forgotLink.style.color = 'var(--ink)';
    forgotLink.style.fontWeight = '600';
    forgotLink.style.textDecoration = 'underline';
    forgotLink.style.textUnderlineOffset = '3px';
    forgotLink.addEventListener('click', e => { e.preventDefault(); _state = 'reset'; render(); });
    forgotWrap.appendChild(forgotLink);
    pwField.appendChild(forgotWrap);
    form.appendChild(pwField);

    const actions = el('div', { style: 'margin-top:22px' });
    const submitBtn = el('button', { type: 'submit', style: 'width:100%;background:#0f0f0f;color:#fff;border:0;border-radius:10px;padding:16px 0;font:700 13px Inter,sans-serif;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer', html: 'Sign in &rarr;' });
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertSlot.innerHTML = '';
      const email = emailInput.value.trim();
      const pw = pwInput.value;
      if (!email || !pw) {
        showAlert(alertSlot, 'error', 'Email and password are required.');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="aari-spinner"></span> Signing in…';
      try {
        await global.AariAuth.signIn(email, pw);
        // Phase 2 · Honor an intake-driven return path before anything else.
        let next = null;
        try { next = sessionStorage.getItem('aari-after-auth'); } catch (_) {}
        if (next) {
          try { sessionStorage.removeItem('aari-after-auth'); } catch (_) {}
          window.location.href = next;
          return;
        }
        // Role-based routing · Eileen → BD cockpit, staff → CRM, agents → portal.
        try {
          const profile = await global.AariAuth.getAgentProfile();
          if (profile && profile.role === 'tc' && String(profile.first_name || '').toLowerCase() === 'eileen') {
            window.location.href = '/eileen.html';
            return;
          }
          if (profile && (profile.role === 'tc' || profile.role === 'broker')) {
            window.location.href = '/aari-crm';
            return;
          }
        } catch (_) { /* profile lookup failure → fall through to /portal */ }
        window.location.href = '/portal';
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign in &rarr;';
        showAlert(alertSlot, 'error', err.message || 'Sign-in failed. Please try again.');
      }
    });

    wrap.appendChild(form);

    // Privacy footer · matches the Aari sign-in family. No BK license line here.
    wrap.appendChild(el('p', { style: 'text-align:center;font-size:12px;color:#9a9588;line-height:1.5;margin:18px 0 0', html: 'Your data is private, encrypted, and only accessible by you.' }));

    return wrap;
  }

  function resetView() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'aari-auth-eyebrow', html: 'Account' }));
    wrap.appendChild(el('h1', { class: 'aari-auth-title', html: 'Reset password' }));
    wrap.appendChild(el('p', { class: 'aari-auth-sub', html: 'Enter your email. We\'ll send you a reset link.' }));

    const alertSlot = el('div');
    wrap.appendChild(alertSlot);

    const form = el('form', { novalidate: 'true' });
    const emailField = el('div', { class: 'aari-field' });
    emailField.appendChild(el('label', { for: 'aari-reset-email', html: 'Email <span class="req">*</span>' }));
    const emailInput = el('input', { class: 'aari-input', id: 'aari-reset-email', type: 'email', autocomplete: 'email', required: 'true' });
    emailField.appendChild(emailInput);
    form.appendChild(emailField);

    const actions = el('div', { class: 'aari-actions', style: 'margin-top:18px' });
    const back = el('button', { class: 'aari-btn ghost', type: 'button', html: '← Back to sign in' });
    back.addEventListener('click', () => { _state = 'login'; render(); });
    const submit = el('button', { class: 'aari-btn primary lg', type: 'submit', html: 'Send reset link' });
    actions.appendChild(back);
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertSlot.innerHTML = '';
      const email = emailInput.value.trim();
      if (!email) { showAlert(alertSlot, 'error', 'Email is required.'); return; }
      submit.disabled = true;
      submit.innerHTML = '<span class="aari-spinner"></span> Sending…';
      try {
        await global.AariAuth.requestPasswordReset(email);
        _state = 'reset-sent';
        render();
      } catch (err) {
        // Generic success message even on error to avoid email enumeration.
        _state = 'reset-sent';
        render();
      }
    });

    wrap.appendChild(form);
    return wrap;
  }

  function resetSentView() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'aari-auth-eyebrow', html: 'Check your email' }));
    wrap.appendChild(el('h1', { class: 'aari-auth-title', html: 'Link sent' }));
    wrap.appendChild(el('p', { class: 'aari-auth-sub', html: 'If an account exists for that email, a password reset link is on its way. Click the link in the email to choose a new password.' }));
    const actions = el('div', { class: 'aari-actions right', style: 'margin-top:18px' });
    const back = el('button', { class: 'aari-btn primary lg', type: 'button', html: 'Back to sign in' });
    back.addEventListener('click', () => { _state = 'login'; render(); });
    actions.appendChild(back);
    wrap.appendChild(actions);
    return wrap;
  }

  // Shared role-based destination · mirrors the post-login routing below.
  async function portalDestination() {
    try {
      const profile = await global.AariAuth.getAgentProfile();
      if (profile && profile.role === 'tc' && String(profile.first_name || '').toLowerCase() === 'eileen') return '/eileen.html';
      if (profile && (profile.role === 'tc' || profile.role === 'broker')) return '/aari-crm';
    } catch (_) {}
    return '/portal';
  }

  function signedInView() {
    const wrap = el('div');
    wrap.appendChild(el('h1', { style: "font-family:'Cormorant Garamond','Playfair Display',Georgia,serif;font-size:34px;font-weight:600;color:#0f0f0f;margin:0 0 6px;letter-spacing:-0.01em", html: 'You&rsquo;re signed in.' }));
    wrap.appendChild(el('p', { style: 'font-size:14px;color:#6b6b6b;line-height:1.5;margin:0 0 22px', html: 'Pick up where you left off.' }));
    const go = el('button', { type: 'button', style: 'width:100%;background:#0f0f0f;color:#fff;border:0;border-radius:10px;padding:16px 0;font:700 13px Inter,sans-serif;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer', html: 'Go to my portal &rarr;' });
    go.addEventListener('click', async function () {
      go.disabled = true;
      go.innerHTML = '<span class="aari-spinner"></span> Opening…';
      window.location.href = await portalDestination();
    });
    wrap.appendChild(go);
    const out = el('p', { style: 'text-align:center;margin:16px 0 0' });
    const outLink = el('a', { href: '#', style: 'font-size:12.5px;color:#8a877f;text-decoration:underline;text-underline-offset:3px' });
    outLink.textContent = 'Not you? Sign out';
    outLink.addEventListener('click', async function (e) {
      e.preventDefault();
      try { await global.AariAuth.signOut(); } catch (_) {}
      _state = 'login';
      render();
    });
    out.appendChild(outLink);
    wrap.appendChild(out);
    return wrap;
  }

  function showAlert(slot, kind, message) {
    slot.innerHTML = '';
    const a = el('div', { class: 'aari-alert ' + kind });
    a.textContent = message;
    slot.appendChild(a);
  }

  function open() {
    mount();
    _state = 'login';
    render();
    // Already signed in? Swap the form for the signed-in card — the visitor
    // stays on this page until THEY choose to enter the portal.
    (async function () {
      try {
        if (!global.AariAuth) return;
        await global.AariAuth.ensureClient();
        const s = await global.AariAuth.getCurrentSession();
        if (s) { _state = 'signed-in'; render(); }
      } catch (_) {}
    })();
    requestAnimationFrame(() => _root.classList.add('open'));
    _root.setAttribute('aria-hidden', 'false');
    // focus the email field
    setTimeout(() => {
      const f = _root.querySelector('input[type="email"]');
      if (f) f.focus();
    }, 80);
  }

  function close() {
    if (!_root) return;
    _root.classList.remove('open');
    _root.setAttribute('aria-hidden', 'true');
    // Pages can react to a dismissed (not completed) sign-in — e.g. the portal
    // sends signed-out visitors back to the homepage.
    try { document.dispatchEvent(new CustomEvent('aari:login-closed')); } catch (_) {}
  }

  // ── Create-account overlay · register.html runs in an iframe so the
  //    visitor never leaves the page they're on (her rule, June 2026). ──
  let _regRoot = null;
  function regMount() {
    if (_regRoot) return _regRoot;
    _regRoot = el('div', { class: 'aari-modal-overlay', 'aria-hidden': 'true' });
    const card = el('div', { class: 'aari-modal-card', style: 'max-width:620px;width:100%;height:min(740px, calc(100vh - 64px));padding:0;overflow:hidden' });
    const closeBtn = el('button', { class: 'aari-modal-close', 'aria-label': 'Close', type: 'button', style: 'z-index:2;background:#fff' });
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', closeRegister);
    card.appendChild(closeBtn);
    card.appendChild(el('iframe', { src: '/register.html?embed=1', title: 'Create your account', style: 'border:0;width:100%;height:100%;display:block' }));
    _regRoot.appendChild(card);
    _regRoot.addEventListener('click', e => { if (e.target === _regRoot) closeRegister(); });
    document.body.appendChild(_regRoot);
    return _regRoot;
  }
  function openRegister() {
    close();
    regMount();
    requestAnimationFrame(() => _regRoot.classList.add('open'));
    _regRoot.setAttribute('aria-hidden', 'false');
  }
  function closeRegister() {
    if (!_regRoot) return;
    _regRoot.classList.remove('open');
    _regRoot.setAttribute('aria-hidden', 'true');
  }
  // The embedded register page hands its "Sign in" links back to this popup.
  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.data.aari === 'open-login') { closeRegister(); open(); return; }
    if (e.data.aari === 'embed-height' && _regRoot) {
      // Fit the popup to the wizard step — no scrollbar inside the box.
      var c = _regRoot.querySelector('.aari-modal-card');
      if (c && e.data.h) c.style.height = Math.min(Math.ceil(e.data.h), window.innerHeight - 64) + 'px';
    }
  });

  // Auto-attach to [data-aari-login] elements
  function attach() {
    document.querySelectorAll('[data-aari-login]').forEach(node => {
      if (node.__aariLoginAttached) return;
      node.__aariLoginAttached = true;
      node.addEventListener('click', e => { e.preventDefault(); open(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

  global.AariLogin = { open, close, attach, openRegister, closeRegister };
})(window);

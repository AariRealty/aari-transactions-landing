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
  let _state = 'login'; // 'login' | 'reset' | 'reset-sent'

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

    // Aari "A" mark · keeps the Transactions sign-in consistent with the other
    // Aari logins. Just the A · no wordmark, no license line.
    const logo = el('div', {
      class: 'aari-auth-logo',
      style: 'display:flex;justify-content:center;margin:2px 0 20px',
      html: '<span style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:13px;background:#0f0f0f;color:#fff;font-family:\'Cormorant Garamond\',\'Playfair Display\',Georgia,serif;font-weight:600;font-size:36px;line-height:1;letter-spacing:-1px">A</span>'
    });
    card.appendChild(logo);

    if (_state === 'login') card.appendChild(loginView());
    else if (_state === 'reset') card.appendChild(resetView());
    else if (_state === 'reset-sent') card.appendChild(resetSentView());

    _root.appendChild(card);
  }

  function loginView() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'aari-auth-eyebrow', html: 'Member portal' }));
    wrap.appendChild(el('h1', { class: 'aari-auth-title', html: 'Sign in' }));
    wrap.appendChild(el('p', { class: 'aari-auth-sub', html: 'Use the email and password you registered with.' }));

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

    const actions = el('div', { class: 'aari-actions right', style: 'margin-top:18px' });
    const submitBtn = el('button', { class: 'aari-btn primary full lg', type: 'submit', html: 'Sign in' });
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
        submitBtn.innerHTML = 'Sign in';
        showAlert(alertSlot, 'error', err.message || 'Sign-in failed. Please try again.');
      }
    });

    wrap.appendChild(form);

    const below = el('div', { class: 'aari-below-actions', html: 'Don\'t have an account? <a href="register.html">Register</a>' });
    wrap.appendChild(below);

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
  }

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

  global.AariLogin = { open, close, attach };
})(window);

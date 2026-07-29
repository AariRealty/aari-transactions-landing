/* ============================================================================
   Aari Transactions · Phone alerts (Web Push subscription helper)
   ============================================================================
   Wraps browser Push API subscription in a single call:

     AariPhoneAlerts.enable()   → prompts, subscribes, saves to Supabase
     AariPhoneAlerts.disable()  → unsubscribes and deletes from Supabase
     AariPhoneAlerts.status()   → { supported, subscribed }
     AariPhoneAlerts.mountButton(hostEl)  → renders a toggle button

   The public VAPID key is duplicated from files.html so this module stays
   self-contained. Both must match the VAPID_PUBLIC_KEY set on the
   send-web-push edge function.
   ============================================================================ */
(function () {
  'use strict';

  var VAPID_PUBLIC = 'BKtv-wCRFa6Zj6rD3Hrkzzl6097tag9__fJkTNmlxxILQO-EBb7hj1MPnqF3H2WPKBzQRfV3he4ttlY_PmIox5o';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  var _swReg = null;
  async function registerSw() {
    if (!('serviceWorker' in navigator)) return null;
    if (_swReg) return _swReg;
    try {
      _swReg = await navigator.serviceWorker.register('/sw.js');
      return _swReg;
    } catch (e) {
      console.warn('[aari-phone-alerts] sw register failed', e);
      return null;
    }
  }

  async function status() {
    var supported = ('serviceWorker' in navigator) && ('PushManager' in window);
    if (!supported) return { supported: false, subscribed: false };
    var reg = await registerSw();
    if (!reg) return { supported: true, subscribed: false };
    await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    return { supported: true, subscribed: !!sub };
  }

  async function enable() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('This device does not support push notifications.\n\nTip: on iPhone, open Aari in Safari, tap Share → Add to Home Screen, then open the icon and try again.');
      return { ok: false, reason: 'unsupported' };
    }
    if (typeof window.AariAuth === 'undefined') {
      alert('Sign in required.');
      return { ok: false, reason: 'no_auth' };
    }
    var client = await window.AariAuth.ensureClient();
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }
    var reg = await registerSw();
    if (!reg) return { ok: false, reason: 'sw_failed' };
    await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }
    var r = await client.functions.invoke('save-push-subscription', {
      body: { subscription: sub.toJSON(), ua: navigator.userAgent }
    });
    if (r && r.error) {
      console.error('[aari-phone-alerts] save failed', r.error);
      return { ok: false, reason: 'save_failed' };
    }
    return { ok: true };
  }

  async function disable() {
    var reg = await registerSw();
    if (!reg) return { ok: false };
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch (_) {}
    }
    // Deletion of the DB row happens via RLS DELETE from the same user; skip
    // for now (the endpoint is auto-pruned on the next send when the push
    // service returns 410 Gone).
    return { ok: true };
  }

  async function mountButton(hostEl, opts) {
    opts = opts || {};
    if (!hostEl) return;
    var st = await status();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'font-family:Inter,-apple-system,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.02em;padding:8px 14px;border-radius:8px;cursor:pointer;background:#fff;color:#0f0f0f;border:1px solid #0f0f0f;transition:opacity .18s ease';
    btn.onmouseover = function () { btn.style.opacity = '0.85'; };
    btn.onmouseout = function () { btn.style.opacity = '1'; };

    function paint() {
      if (!st.supported) {
        btn.textContent = 'Phone alerts unavailable';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        return;
      }
      btn.textContent = st.subscribed ? '🔔 Phone alerts on' : '🔕 Enable phone alerts';
    }
    paint();

    btn.addEventListener('click', async function () {
      if (!st.supported) return;
      btn.disabled = true;
      var prevText = btn.textContent;
      btn.textContent = '…';
      try {
        if (st.subscribed) {
          var d = await disable();
          if (d.ok) st.subscribed = false;
        } else {
          var e = await enable();
          if (e.ok) {
            st.subscribed = true;
            if (opts.onEnable) opts.onEnable();
          } else if (e.reason === 'permission_denied') {
            alert('Notification permission was blocked. Enable it in your browser settings and try again.');
          } else if (e.reason === 'unsupported') {
            // alert already shown inside enable()
          }
        }
      } catch (err) {
        console.error('[aari-phone-alerts] toggle', err);
        btn.textContent = prevText;
      }
      btn.disabled = false;
      paint();
    });

    hostEl.appendChild(btn);
    return btn;
  }

  window.AariPhoneAlerts = { enable: enable, disable: disable, status: status, mountButton: mountButton };
})();

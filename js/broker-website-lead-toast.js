/* ============================================================================
   Aari Transactions · Broker · Website-lead Realtime toast
   ============================================================================
   Subscribes to the notifications table via Supabase Realtime and shows a
   slide-in toast the moment a website lead lands unassigned. Tapping the toast
   jumps to the assign flow.

   Independent from js/aari-header.js (the header polls other sources). This is
   purely the "act now" alert — it does NOT render a bell or badge. The card in
   broker-cockpit's Needs-a-TC section is the persistent visual for missed
   toasts.
   ============================================================================ */
(function () {
  'use strict';

  var CSS = [
    '.bwl-toast{position:fixed;bottom:24px;right:24px;background:#0a0a0a;color:#fff;border-radius:12px;padding:16px 20px 16px 18px;max-width:360px;box-shadow:0 12px 36px rgba(0,0,0,.36);z-index:9999;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;display:flex;gap:14px;align-items:flex-start;transform:translateY(120%);opacity:0;transition:transform .32s cubic-bezier(.22,.61,.36,1),opacity .32s;cursor:pointer}',
    '.bwl-toast.show{transform:translateY(0);opacity:1}',
    '.bwl-toast-icon{flex-shrink:0;width:36px;height:36px;border-radius:8px;background:#fff8e1;color:#a37500;display:flex;align-items:center;justify-content:center;font-size:18px}',
    '.bwl-toast-body{flex:1;min-width:0}',
    '.bwl-toast-eb{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#f5b400;margin:0 0 4px}',
    '.bwl-toast-title{font-size:14px;font-weight:600;color:#fff;margin:0 0 3px;line-height:1.3}',
    '.bwl-toast-sub{font-size:12px;color:rgba(255,255,255,.72);margin:0 0 8px;line-height:1.4}',
    '.bwl-toast-cta{font-size:11px;font-weight:600;color:#fff;letter-spacing:.4px;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px}',
    '.bwl-toast-close{flex-shrink:0;background:transparent;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:20px;padding:0;width:22px;height:22px;line-height:1}',
    '.bwl-toast-close:hover{color:#fff}',
    '@media(max-width:640px){.bwl-toast{left:16px;right:16px;bottom:16px;max-width:none}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('bwl-css')) return;
    var s = document.createElement('style');
    s.id = 'bwl-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast(payload) {
    injectCss();
    var t = document.createElement('div');
    t.className = 'bwl-toast';
    var title = payload.property_address ? String(payload.property_address).split(',')[0].trim() : 'Website lead';
    var sub = [payload.client_name, payload.service_label].filter(Boolean).join(' · ');
    var url = payload.assign_url || '#';
    t.innerHTML =
      '<div class="bwl-toast-icon" aria-hidden="true">🌐</div>' +
      '<div class="bwl-toast-body">' +
        '<p class="bwl-toast-eb">Website lead · needs a TC</p>' +
        '<p class="bwl-toast-title">' + escapeHtml(title) + '</p>' +
        (sub ? '<p class="bwl-toast-sub">' + escapeHtml(sub) + '</p>' : '') +
        '<span class="bwl-toast-cta">Assign a TC →</span>' +
      '</div>' +
      '<button type="button" class="bwl-toast-close" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });

    var timer = setTimeout(dismiss, 12000);

    function dismiss() {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 340);
    }

    t.querySelector('.bwl-toast-close').addEventListener('click', function (e) {
      e.stopPropagation();
      clearTimeout(timer);
      dismiss();
    });
    t.addEventListener('click', function (e) {
      if (e.target.classList.contains('bwl-toast-close')) return;
      clearTimeout(timer);
      if (url && url !== '#') window.location.href = url;
      dismiss();
    });
  }

  async function init() {
    if (typeof window.AariAuth === 'undefined') {
      setTimeout(init, 200);
      return;
    }
    try {
      var client = await window.AariAuth.ensureClient();
      var session = await window.AariAuth.getCurrentSession();
      if (!session || !session.user) return;
      var userId = session.user.id;

      // Guard: only the broker cares about these. If AariAuth exposes profile
      // role, gate on it; otherwise the RLS on notifications already restricts
      // reads to recipient_id = auth.uid(), so we're safe either way.
      try {
        var profile = await window.AariAuth.getAgentProfile();
        if (profile && profile.role && profile.role !== 'broker') return;
      } catch (_) { /* fall through - RLS still protects */ }

      client
        .channel('bwl:' + userId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'recipient_id=eq.' + userId
          },
          function (msg) {
            var row = msg['new'] || msg.record;
            if (!row || row.type !== 'broker_website_lead_needs_tc') return;
            showToast(row.payload || {});
          }
        )
        .subscribe();
    } catch (e) {
      console.error('[broker-website-lead-toast]', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

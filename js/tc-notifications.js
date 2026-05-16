/* ============================================================================
   Aari Transactions · TC Cockpit · Notifications subsystem (Option C client)
   ============================================================================
   - Subscribes to public.notifications via Supabase Realtime
   - Renders an unread-count badge on the bell button
   - Shows a slide-in toast when a new notification arrives
   - Opens a dropdown listing recent notifications; clicking marks read
   ============================================================================ */
(function () {
  'use strict';

  // Inject styles once (kept inline so we don't fight portal.html's CSS load order)
  var CSS = [
    '.tcn-bell{position:relative;background:#fff;color:#0f0f0f;border:1px solid #e8e8e6;border-radius:999px;width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit;padding:0;line-height:1;transition:border-color .15s}',
    '.tcn-bell:hover{border-color:#0f0f0f}',
    '.tcn-bell svg{width:18px;height:18px;display:block}',
    '.tcn-badge{position:absolute;top:-3px;right:-3px;background:#967a4a;color:#fff;font-size:10px;font-weight:700;letter-spacing:0;min-width:18px;height:18px;border-radius:999px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:2px solid #fff;font-family:Inter,sans-serif}',
    '.tcn-badge[hidden]{display:none!important}',
    '.tcn-menu{position:absolute;top:calc(100% + 8px);right:0;background:#fff;border:1px solid #e8e8e6;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.12);width:340px;max-height:440px;overflow:hidden;display:none;z-index:80;font-family:Inter,sans-serif}',
    '.tcn-menu.open{display:flex;flex-direction:column}',
    '.tcn-menu-head{padding:14px 18px;border-bottom:1px solid #e8e8e6;display:flex;justify-content:space-between;align-items:center}',
    '.tcn-menu-title{font-family:Cormorant Garamond,Georgia,serif;font-size:17px;font-weight:500;color:#0f0f0f;margin:0;letter-spacing:-0.2px}',
    '.tcn-menu-title em{font-style:italic;font-weight:500}',
    '.tcn-menu-mark{font-size:11px;color:#6b6b6b;background:none;border:none;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:3px}',
    '.tcn-menu-mark:hover{color:#0f0f0f}',
    '.tcn-list{flex:1;overflow-y:auto;padding:6px 0}',
    '.tcn-empty{padding:36px 18px;text-align:center;color:#6b6b6b;font-size:13px}',
    '.tcn-item{padding:12px 18px;border-bottom:1px solid #f1f0eb;cursor:pointer;display:block;text-decoration:none;color:inherit;transition:background .12s}',
    '.tcn-item:hover{background:#fafaf8}',
    '.tcn-item:last-child{border-bottom:none}',
    '.tcn-item.unread{background:#f5f0e8}',
    '.tcn-item.unread:hover{background:#ece5d4}',
    '.tcn-item-title{font-size:13px;font-weight:600;color:#0f0f0f;margin:0 0 3px;line-height:1.3}',
    '.tcn-item-body{font-size:12px;color:#6b6b6b;line-height:1.4;margin:0}',
    '.tcn-item-time{font-size:10.5px;color:#9a9a9a;margin-top:5px;letter-spacing:0.2px;text-transform:uppercase;font-weight:600}',
    '.tcn-toast{position:fixed;bottom:24px;right:24px;background:#0a0a0a;color:#fff;border-radius:10px;padding:14px 18px 14px 16px;max-width:340px;box-shadow:0 12px 32px rgba(0,0,0,.32);z-index:100;font-family:Inter,sans-serif;display:flex;gap:12px;align-items:flex-start;transform:translateY(120%);opacity:0;transition:transform .28s cubic-bezier(.22,.61,.36,1),opacity .28s}',
    '.tcn-toast.show{transform:translateY(0);opacity:1}',
    '.tcn-toast-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%;background:#967a4a;margin-top:6px}',
    '.tcn-toast-body{flex:1;min-width:0}',
    '.tcn-toast-title{font-size:13px;font-weight:600;color:#fff;margin:0 0 2px;line-height:1.3}',
    '.tcn-toast-sub{font-size:12px;color:rgba(255,255,255,.7);margin:0;line-height:1.4}',
    '.tcn-toast-close{flex-shrink:0;background:transparent;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:18px;padding:0;width:20px;height:20px;line-height:1}',
    '.tcn-toast-close:hover{color:#fff}'
  ].join('');

  function injectCss() {
    if (document.getElementById('tcn-css')) return;
    var s = document.createElement('style');
    s.id = 'tcn-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    var diff = Math.max(0, Date.now() - then);
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    if (d < 7) return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- Public init ----
  window.AariTcNotifications = window.AariTcNotifications || {};

  window.AariTcNotifications.mount = async function mount(options) {
    options = options || {};
    var hostEl = options.hostEl;
    if (!hostEl) throw new Error('AariTcNotifications.mount: hostEl required');

    var client;
    if (window.AariAuth && typeof window.AariAuth.ensureClient === 'function') {
      client = await window.AariAuth.ensureClient();
    } else {
      throw new Error('AariTcNotifications: window.AariAuth.ensureClient not available');
    }
    var session = await window.AariAuth.getCurrentSession();
    if (!session || !session.user) {
      console.warn('AariTcNotifications: no session, skipping mount');
      return null;
    }
    var userId = session.user.id;

    injectCss();

    // Build DOM
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.innerHTML =
      '<button type="button" class="tcn-bell" id="tcn-bell" aria-label="Notifications" aria-haspopup="menu" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
        '</svg>' +
        '<span class="tcn-badge" id="tcn-badge" hidden>0</span>' +
      '</button>' +
      '<div class="tcn-menu" id="tcn-menu" role="menu" aria-label="Notifications">' +
        '<div class="tcn-menu-head">' +
          '<h3 class="tcn-menu-title">Recent <em>activity.</em></h3>' +
          '<button type="button" class="tcn-menu-mark" id="tcn-mark-all">Mark all read</button>' +
        '</div>' +
        '<div class="tcn-list" id="tcn-list"><div class="tcn-empty">No notifications yet.</div></div>' +
      '</div>';
    hostEl.appendChild(wrap);

    var bell = wrap.querySelector('#tcn-bell');
    var badge = wrap.querySelector('#tcn-badge');
    var menu = wrap.querySelector('#tcn-menu');
    var list = wrap.querySelector('#tcn-list');
    var markAllBtn = wrap.querySelector('#tcn-mark-all');

    // State
    var rows = [];

    function renderList() {
      if (!rows.length) {
        list.innerHTML = '<div class="tcn-empty">No notifications yet.</div>';
        return;
      }
      var html = rows.map(function (n) {
        var unread = !n.read_at;
        var href = n.related_file_id ? ('#file-' + n.related_file_id) : '#';
        return '<a class="tcn-item' + (unread ? ' unread' : '') + '" href="' + escapeHtml(href) + '" data-id="' + escapeHtml(n.id) + '">' +
          '<p class="tcn-item-title">' + escapeHtml(n.title) + '</p>' +
          (n.body ? '<p class="tcn-item-body">' + escapeHtml(n.body) + '</p>' : '') +
          '<p class="tcn-item-time">' + escapeHtml(fmtTime(n.created_at)) + '</p>' +
        '</a>';
      }).join('');
      list.innerHTML = html;
    }

    function renderBadge() {
      var unread = rows.filter(function (n) { return !n.read_at; }).length;
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }

    async function loadInitial() {
      var res = await client
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (res.error) {
        console.error('tcn loadInitial error', res.error);
        return;
      }
      rows = res.data || [];
      renderList();
      renderBadge();
    }

    function showToast(n) {
      var t = document.createElement('div');
      t.className = 'tcn-toast';
      t.innerHTML =
        '<span class="tcn-toast-dot" aria-hidden="true"></span>' +
        '<div class="tcn-toast-body">' +
          '<p class="tcn-toast-title">' + escapeHtml(n.title) + '</p>' +
          (n.body ? '<p class="tcn-toast-sub">' + escapeHtml(n.body) + '</p>' : '') +
        '</div>' +
        '<button type="button" class="tcn-toast-close" aria-label="Dismiss">&times;</button>';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('show'); });

      var dismiss = function () {
        t.classList.remove('show');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
      };
      var timer = setTimeout(dismiss, 7000);
      t.querySelector('.tcn-toast-close').addEventListener('click', function () { clearTimeout(timer); dismiss(); });
      t.addEventListener('click', function (e) {
        if (e.target.classList.contains('tcn-toast-close')) return;
        clearTimeout(timer);
        if (n.related_file_id) {
          window.location.hash = 'file-' + n.related_file_id;
        }
        markRead(n.id);
        dismiss();
      });
    }

    async function markRead(id) {
      var local = rows.find(function (r) { return r.id === id; });
      if (local && !local.read_at) {
        local.read_at = new Date().toISOString();
        renderBadge();
        renderList();
      }
      var res = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('recipient_id', userId);
      if (res.error) console.error('tcn markRead error', res.error);
    }

    async function markAllRead() {
      var unreadIds = rows.filter(function (r) { return !r.read_at; }).map(function (r) { return r.id; });
      if (!unreadIds.length) return;
      var now = new Date().toISOString();
      rows.forEach(function (r) { if (!r.read_at) r.read_at = now; });
      renderBadge();
      renderList();
      var res = await client
        .from('notifications')
        .update({ read_at: now })
        .in('id', unreadIds)
        .eq('recipient_id', userId);
      if (res.error) console.error('tcn markAllRead error', res.error);
    }

    // Wire UI
    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      bell.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        menu.classList.remove('open');
        bell.setAttribute('aria-expanded', 'false');
      }
    });
    list.addEventListener('click', function (e) {
      var item = e.target.closest('.tcn-item');
      if (!item) return;
      var id = item.getAttribute('data-id');
      markRead(id);
    });
    markAllBtn.addEventListener('click', function (e) { e.stopPropagation(); markAllRead(); });

    // Initial fetch
    await loadInitial();

    // Realtime subscription
    var channel = client
      .channel('tcn:' + userId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.' + userId },
        function (payload) {
          var n = payload['new'] || payload.record;
          if (!n) return;
          rows.unshift(n);
          if (rows.length > 50) rows.pop();
          renderList();
          renderBadge();
          showToast(n);
        }
      )
      .subscribe();

    return {
      unmount: function () {
        try { client.removeChannel(channel); } catch (_) {}
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      reload: loadInitial,
    };
  };
})();

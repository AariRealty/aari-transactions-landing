/* Aari Transactions · Slim interior-page header (May 2026 · Option G + D · View-as in chrome)
 * Left: "← Back to website" sentence-case soft gray.
 * Center (broker/TC only): View-as pills.
 * Right: 36px notification bell + 36px avatar circle with dropdown.
 *
 * Role rules:
 *   broker → sees [Broker · TC · Agent] pills + notification bell
 *   tc     → sees [TC · Agent] pills
 *   agent  → no pills (nothing to view-as)
 *
 * Usage:
 *   <div id="aari-header"></div>
 *   <script src="/js/aari-header.js" defer></script>
 *
 * Profile resolution:
 *   1. Page may call window.AariHeader.setProfile(profile) directly (fastest path)
 *   2. Otherwise, header auto-resolves via window.AariAuth.getAgentProfile() on boot
 */
(function () {
  'use strict';
  var ROOT_ID = 'aari-header';
  var READ_NOTIF_KEY = 'aari_read_notifications';
  var REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  var CSS = [
    '.aari-hdr{background:#fff;border-bottom:1px solid #e8e8e6;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:14px;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;position:sticky;top:0;z-index:100}',
    '.aari-hdr-back{font-family:"Inter",-apple-system,sans-serif;font-size:12px;font-weight:400;color:#6b6760;text-decoration:none;display:inline-flex;align-items:center;gap:6px;line-height:1;transition:color .15s;flex-shrink:0}',
    '.aari-hdr-back:hover{color:#0f0f0f;text-decoration:underline;text-underline-offset:3px}',
    '.aari-hdr-back .arrow{font-size:13px;line-height:1}',
    '.aari-hdr-viewas{display:flex;align-items:center;gap:8px;flex:1;justify-content:center}',
    '.aari-hdr-viewas-label{font-size:9px;color:#6b6760;text-transform:uppercase;letter-spacing:1.3px;font-weight:600;white-space:nowrap}',
    '.aari-hdr-viewas-pills{display:flex;gap:4px}',
    '.aari-hdr-viewas-pill{font-family:inherit;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;padding:5px 12px;border:1px solid #e8e8e6;border-radius:999px;color:#6b6760;background:#fff;cursor:pointer;transition:all .15s}',
    '.aari-hdr-viewas-pill:hover{border-color:#0f0f0f;color:#0f0f0f}',
    '.aari-hdr-viewas-pill.active{background:#0f0f0f;color:#fbf9f4;border-color:#0f0f0f}',
    '.aari-hdr-right{display:flex;align-items:center;gap:10px;flex-shrink:0}',
    /* Bell */
    '.aari-hdr-bell{position:relative;background:#fff;color:#0f0f0f;border:1px solid #e8e8e6;width:36px;height:36px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:transform .15s,box-shadow .15s,border-color .15s;flex-shrink:0}',
    '.aari-hdr-bell:hover{transform:scale(1.05);border-color:#0f0f0f;box-shadow:0 2px 8px rgba(0,0,0,.08)}',
    '.aari-hdr-bell:focus-visible{outline:2px solid #0f0f0f;outline-offset:3px}',
    '.aari-hdr-bell svg{width:18px;height:18px;display:block}',
    '.aari-hdr-bell-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:#0f0f0f;border:1.5px solid #fff;display:none}',
    '.aari-hdr-bell-dot.show{display:block}',
    /* Notification panel */
    '.aari-hdr-notif{position:absolute;top:calc(100% + 8px);right:20px;background:#fff;border:1px solid #e8e8e6;border-radius:10px;padding:8px;width:320px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none;z-index:60}',
    '.aari-hdr-notif.open{display:block}',
    '.aari-hdr-notif-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 10px;border-bottom:1px solid #f0ece4;margin-bottom:6px}',
    '.aari-hdr-notif-head .label{font-family:"Inter",sans-serif;font-weight:600;font-size:10px;color:#6b6760;text-transform:uppercase;letter-spacing:1.3px}',
    '.aari-hdr-notif-head .markall{font-family:"Inter",sans-serif;font-size:11px;color:#6b6760;text-decoration:none;cursor:pointer;background:none;border:none;padding:0;font-weight:500}',
    '.aari-hdr-notif-head .markall:hover{color:#0f0f0f;text-decoration:underline;text-underline-offset:2px}',
    '.aari-hdr-notif-body{max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}',
    '.aari-hdr-notif-empty{padding:20px;text-align:center;color:#6b6760;font-size:12px;font-family:"Inter",sans-serif}',
    '.aari-hdr-notif-item{display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:6px;cursor:pointer;text-decoration:none;color:inherit;transition:background .12s}',
    '.aari-hdr-notif-item:hover{background:#f7f5ee}',
    '.aari-hdr-notif-item.unread{background:#fbf9f4}',
    '.aari-hdr-notif-item.unread:hover{background:#f4f0e6}',
    '.aari-hdr-notif-item .icn{flex-shrink:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:#0f0f0f;margin-top:1px}',
    '.aari-hdr-notif-item .icn svg{width:18px;height:18px}',
    '.aari-hdr-notif-item .body{flex:1;min-width:0}',
    '.aari-hdr-notif-item .title{font-family:"Inter",sans-serif;font-size:13px;font-weight:500;color:#0f0f0f;line-height:1.3;margin:0}',
    '.aari-hdr-notif-item .sub{font-family:"Inter",sans-serif;font-size:11px;color:#6b6760;line-height:1.35;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.aari-hdr-notif-item .time{font-family:"Inter",sans-serif;font-size:10px;color:#6b6760;flex-shrink:0;margin-left:6px;margin-top:2px}',
    /* Avatar */
    '.aari-hdr-avatar{background:#0f0f0f;color:#fbf9f4;border:1px solid #0f0f0f;width:36px;height:36px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.5px;line-height:1;transition:transform .15s,box-shadow .15s;overflow:hidden;padding:0;flex-shrink:0}',
    '.aari-hdr-avatar:hover{transform:scale(1.05);box-shadow:0 2px 8px rgba(0,0,0,.15)}',
    '.aari-hdr-avatar:focus-visible{outline:2px solid #0f0f0f;outline-offset:3px}',
    '.aari-hdr-avatar img{width:100%;height:100%;object-fit:cover}',
    '.aari-hdr-menu{position:absolute;top:calc(100% + 8px);right:20px;background:#fff;border:1px solid #e8e8e6;border-radius:10px;padding:6px;width:240px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none;z-index:60}',
    '.aari-hdr-menu.open{display:block}',
    '.aari-hdr-menu .who{padding:12px;border-bottom:1px solid #e8e8e6;margin-bottom:6px}',
    '.aari-hdr-menu .who-name{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:16px;color:#0f0f0f;line-height:1.2;letter-spacing:-.2px}',
    '.aari-hdr-menu .who-role{font-family:"Inter",sans-serif;font-weight:600;font-size:10px;color:#6b6760;text-transform:uppercase;letter-spacing:1.3px;margin-top:4px}',
    '.aari-hdr-menu a{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:13px;color:#0f0f0f;text-decoration:none;border-radius:6px;cursor:pointer;font-weight:500;line-height:1.3}',
    '.aari-hdr-menu a:hover{background:#f7f5ee}',
    '@media(max-width:640px){',
    '  .aari-hdr{padding:10px 14px;gap:8px}',
    '  .aari-hdr-viewas-label{display:none}',
    '  .aari-hdr-viewas-pill{padding:5px 10px;font-size:9.5px}',
    '  .aari-hdr-menu{right:14px;left:14px;width:auto}',
    '  .aari-hdr-notif{right:14px;left:14px;width:auto}',
    '}',
    /* ===== PREVIEW MODE BANNER ===== */
    '#aari-preview-banner{position:relative;background:#fef3e2;border-bottom:1px solid #f3d597;color:#854f0b;padding:10px 24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12.5px;line-height:1.4;z-index:5}',
    '.apb-eb{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;background:#854f0b;color:#fef3e2;padding:3px 8px;border-radius:4px;white-space:nowrap}',
    '.apb-body{flex:1;min-width:0}',
    '.apb-body strong{font-weight:600}',
    '.apb-exit{background:#854f0b;color:#fef3e2;border:0;padding:6px 12px;border-radius:5px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}',
    '.apb-exit:hover{background:#623806}',
    '@media(max-width:560px){#aari-preview-banner{padding:8px 14px;font-size:11.5px}.apb-body{font-size:11.5px}}',
    /* ===== AVATAR MENU · preview section + visual hierarchy ===== */
    '.menu-section-eb{font-size:9.5px;letter-spacing:1.1px;text-transform:uppercase;color:#6b6760;font-weight:700;padding:6px 14px 4px}',
    '.menu-preview{display:flex;justify-content:space-between;align-items:center}',
    '.menu-preview.active{background:#fef3e2;color:#854f0b;font-weight:500}',
    '.menu-preview-check{color:#854f0b;font-weight:700}',
    '.menu-preview-exit{color:#854f0b;font-weight:500;font-style:italic}',
    '.menu-preview-exit:hover{background:#fef3e2}',
    '.menu-sep{height:0.5px;background:#e8e8e6;margin:4px 0}',
    '.who-preview{color:#854f0b;font-size:10px;font-weight:600;letter-spacing:.3px}',
  ].join('');

  function injectCss() {
    if (document.getElementById('aari-hdr-css')) return;
    var s = document.createElement('style');
    s.id = 'aari-hdr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function initialsFrom(p) {
    if (!p) return '–';
    var a = (p.first_name || '').trim();
    var b = (p.last_name || '').trim();
    if (a && b) return (a[0] + b[0]).toUpperCase();
    if (a) return a[0].toUpperCase();
    if (p.email) return p.email[0].toUpperCase();
    return '–';
  }

  function effectiveRole(p) {
    if (!p) return 'agent';
    if (p.role === 'broker') return 'broker';
    if (p.role === 'tc') return 'tc';
    return 'agent';
  }

  var root, currentProfile = null, profileResolved = false;
  var notifications = [];
  var notifLoadError = false;
  var notifRefreshTimer = null;

  function render() {
    if (!root) return;
    root.innerHTML = [
      '<div class="aari-hdr">',
      '  <a href="/briefing.html" class="aari-hdr-back" aria-label="Where to?">',
      '    <span class="arrow" aria-hidden="true">&larr;</span>',
      '    <span>Where to?</span>',
      '  </a>',
      '  <div class="aari-hdr-viewas" id="aari-hdr-viewas"></div>',
      '  <div class="aari-hdr-right">',
      '    <div style="position:relative" id="aari-hdr-bell-wrap"></div>',
      '    <div style="position:relative">',
      '      <button type="button" class="aari-hdr-avatar" id="aari-avatar-btn" aria-haspopup="true" aria-expanded="false" aria-label="Open account menu" title="Account">',
      '        <span id="aari-hdr-initials">&ndash;</span>',
      '      </button>',
      '    </div>',
      '  </div>',
      '  <div class="aari-hdr-menu" id="aari-hdr-menu" role="menu" aria-label="Account menu"></div>',
      '</div>'
    ].join('\n');
    renderViewAs();
    renderMenu();
    renderBell();
    wireAvatar();
  }

  function renderViewAs() {
    // Pills retired · preview now lives in the avatar dropdown menu (cleaner header).
    // We still render the preview banner across the top when sessionStorage has aari-view-as set.
    renderPreviewBanner();
    var container = document.getElementById('aari-hdr-viewas');
    if (container) container.innerHTML = '';
    return;
    // ----- legacy pill code preserved below for reference, no longer reached -----
    if (!container) return;
    var actualRole = effectiveRole(currentProfile);
    // Agent role · no pills (nothing to view-as)
    if (actualRole === 'agent') {
      container.innerHTML = '';
      return;
    }
    var viewAs = '';
    try { viewAs = sessionStorage.getItem('aari-view-as') || ''; } catch (_) {}
    var current = viewAs || actualRole;

    // Broker · 3 pills · TC · 2 pills (no Broker option)
    var pills = [];
    if (actualRole === 'broker') pills.push({ value: 'broker', label: 'Broker' });
    pills.push({ value: 'tc', label: 'TC' });
    pills.push({ value: 'agent', label: 'Agent' });

    var pillsHtml = pills.map(function (p) {
      return '<button type="button" class="aari-hdr-viewas-pill ' +
        (current === p.value ? 'active' : '') +
        '" data-view="' + p.value + '">' + p.label + '</button>';
    }).join('');

    container.innerHTML =
      '<div class="aari-hdr-viewas-pills">' + pillsHtml + '</div>';

    wireViewAs();
  }

  function renderMenu() {
    var menu = document.getElementById('aari-hdr-menu');
    if (!menu) return;
    var p = currentProfile || {};
    var actualRole = (p.role || 'agent').toLowerCase();
    var role = effectiveRole(p);
    var roleWord = { broker: 'Broker', tc: 'Transaction Coordinator', agent: 'Agent' }[role] || 'Agent';
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (p.email || 'Account');

    // Preview-as menu items · only for users whose actual role allows previewing
    var previewItems = '';
    var currentView = '';
    try { currentView = sessionStorage.getItem('aari-view-as') || ''; } catch(_){}
    if (actualRole === 'broker' || actualRole === 'tc') {
      var options = [];
      if (actualRole === 'broker') options.push({ value: 'tc', label: 'Preview as TC' });
      options.push({ value: 'agent', label: 'Preview as Agent' });
      previewItems = '<div class="menu-section-eb">Preview mode</div>';
      previewItems += options.map(function(o){
        var active = currentView === o.value;
        return '<a href="#" data-preview-as="' + o.value + '" role="menuitem" class="menu-preview' + (active ? ' active' : '') + '">' +
          '<span>' + o.label + '</span>' +
          (active ? '<span class="menu-preview-check">✓</span>' : '') +
        '</a>';
      }).join('');
      if (currentView) {
        previewItems += '<a href="#" data-preview-as="__exit" role="menuitem" class="menu-preview-exit">Return to my view</a>';
      }
    }

    menu.innerHTML = [
      '<div class="who">',
      '  <div class="who-name">' + esc(fullName) + '</div>',
      '  <div class="who-role">' + esc(roleWord) + (currentView ? ' <span class="who-preview">· previewing as ' + esc(currentView.toUpperCase()) + '</span>' : '') + '</div>',
      '</div>',
      previewItems,
      previewItems ? '<div class="menu-sep"></div>' : '',
      '<a href="/portal.html#recent-activity" role="menuitem">Recent activity</a>',
      '<a href="/portal.html#billing-documents" role="menuitem">Billing &amp; Documents</a>',
      '<a href="/portal.html#profile" role="menuitem">Settings</a>',
      '<a href="#" id="aari-signout" role="menuitem">Sign out</a>'
    ].join('\n');
    wireSignOut();
    wirePreviewMenu();
  }

  // Wire preview menu items · click switches view + reloads to the role's landing
  function wirePreviewMenu() {
    var items = document.querySelectorAll('[data-preview-as]');
    items.forEach(function(it){
      it.addEventListener('click', function(e){
        e.preventDefault();
        var v = it.getAttribute('data-preview-as');
        try {
          if (v === '__exit') sessionStorage.removeItem('aari-view-as');
          else if (v && v !== effectiveRole(currentProfile)) sessionStorage.setItem('aari-view-as', v);
          else sessionStorage.removeItem('aari-view-as');
        } catch(_){}
        var dest = v === '__exit'
          ? (ROLE_DEFAULT_LANDING[(currentProfile && currentProfile.role) || 'agent'] || '/portal.html')
          : (ROLE_DEFAULT_LANDING[v] || '/portal.html');
        if (dest && location.pathname !== dest) location.href = dest;
        else location.reload();
      });
    });
  }

  // ===== PREVIEW BANNER · top-of-page indicator when in preview mode =====
  function renderPreviewBanner() {
    var existing = document.getElementById('aari-preview-banner');
    var viewAs = '';
    try { viewAs = sessionStorage.getItem('aari-view-as') || ''; } catch(_){}
    var actualRole = currentProfile ? (currentProfile.role || 'agent').toLowerCase() : '';
    if (!viewAs || viewAs === actualRole) {
      if (existing) existing.remove();
      document.body.classList.remove('aari-preview-mode');
      return;
    }
    if (existing) return; // already rendered
    var roleWord = { tc: 'Transaction Coordinator', agent: 'Agent', broker: 'Broker' }[viewAs] || viewAs.toUpperCase();
    var banner = document.createElement('div');
    banner.id = 'aari-preview-banner';
    banner.innerHTML = '<span class="apb-eb">Preview mode</span>' +
      '<span class="apb-body">You\'re seeing what a <strong>' + esc(roleWord) + '</strong> sees.</span>' +
      '<button type="button" class="apb-exit" id="aari-preview-exit">Return to my view</button>';
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('aari-preview-mode');
    var exitBtn = document.getElementById('aari-preview-exit');
    if (exitBtn) exitBtn.addEventListener('click', function(){
      try { sessionStorage.removeItem('aari-view-as'); } catch(_){}
      var dest = ROLE_DEFAULT_LANDING[actualRole] || '/portal.html';
      if (location.pathname !== dest) location.href = dest;
      else location.reload();
    });
  }

  function renderBell() {
    var wrap = document.getElementById('aari-hdr-bell-wrap');
    if (!wrap) return;
    // Bell visible to broker + TC · agent role hides bell (no inbound items)
    var role = effectiveRole(currentProfile);
    if (role !== 'broker' && role !== 'tc') {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = [
      '<button type="button" class="aari-hdr-bell" id="aari-hdr-bell" aria-haspopup="true" aria-expanded="false" aria-label="Open notifications" title="Notifications">',
      '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>',
      '    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
      '  </svg>',
      '  <span class="aari-hdr-bell-dot" id="aari-hdr-bell-dot" aria-hidden="true"></span>',
      '</button>',
      '<div class="aari-hdr-notif" id="aari-hdr-notif" role="menu" aria-label="Notifications"></div>'
    ].join('\n');
    refreshNotifications();
    wireBell();

    // Periodic refresh while header is mounted
    if (notifRefreshTimer) clearInterval(notifRefreshTimer);
    notifRefreshTimer = setInterval(refreshNotifications, REFRESH_INTERVAL_MS);
  }

  function wireAvatar() {
    var btn = document.getElementById('aari-avatar-btn');
    var menu = document.getElementById('aari-hdr-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      // Close notif panel if open
      var notif = document.getElementById('aari-hdr-notif');
      if (notif) notif.classList.remove('open');
      var bellBtn = document.getElementById('aari-hdr-bell');
      if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function wireBell() {
    var btn = document.getElementById('aari-hdr-bell');
    var panel = document.getElementById('aari-hdr-notif');
    if (!btn || !panel) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      // Close avatar menu if open
      var menu = document.getElementById('aari-hdr-menu');
      if (menu) menu.classList.remove('open');
      var avBtn = document.getElementById('aari-avatar-btn');
      if (avBtn) avBtn.setAttribute('aria-expanded', 'false');
      var open = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Default landing page per role · used when the user clicks a view-as pill,
  // so they always land on the page that matters most for that role.
  //   broker → broker cockpit (team operations)
  //   tc     → files.html (the new transaction management page · /tc-cockpit.html retired)
  //   agent  → portal (their kanban / file workspace)
  var ROLE_DEFAULT_LANDING = {
    broker: '/broker-cockpit.html',
    tc: '/files.html',
    agent: '/portal.html',
  };

  function wireViewAs() {
    var pills = document.querySelectorAll('.aari-hdr-viewas-pill');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        var v = pill.getAttribute('data-view');
        try {
          if (v && v !== effectiveRole(currentProfile)) {
            sessionStorage.setItem('aari-view-as', v);
          } else {
            sessionStorage.removeItem('aari-view-as');
          }
        } catch (_) {}
        // Navigate to the role's default landing page so the pill click feels
        // like switching workspaces, not just re-tagging the current page.
        var dest = ROLE_DEFAULT_LANDING[v] || null;
        if (dest && location.pathname !== dest) {
          location.href = dest;
        } else {
          location.reload();
        }
      });
    });
  }

  function wireSignOut() {
    var a = document.getElementById('aari-signout');
    if (!a) return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        if (window.AariAuth && typeof window.AariAuth.signOut === 'function') {
          Promise.resolve(window.AariAuth.signOut()).finally(function () {
            window.location.href = '/index.html';
          });
          return;
        }
      } catch (_) {}
      window.location.href = '/index.html';
    });
  }

  /* ----------------------------------------------------------------------- */
  /* Notifications                                                           */
  /* ----------------------------------------------------------------------- */

  function getReadSet() {
    try {
      var raw = localStorage.getItem(READ_NOTIF_KEY);
      if (!raw) return {};
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      var map = {};
      for (var i = 0; i < arr.length; i++) map[arr[i]] = true;
      return map;
    } catch (_) { return {}; }
  }

  function setReadSet(map) {
    try {
      var keys = Object.keys(map).filter(function (k) { return map[k]; });
      localStorage.setItem(READ_NOTIF_KEY, JSON.stringify(keys));
    } catch (_) {}
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function isSameDay(iso) {
    if (!iso) return false;
    try {
      var d = new Date(iso);
      var n = new Date();
      return d.getFullYear() === n.getFullYear() &&
             d.getMonth() === n.getMonth() &&
             d.getDate() === n.getDate();
    } catch (_) { return false; }
  }

  function hoursSince(iso) {
    if (!iso) return Infinity;
    try {
      var d = new Date(iso).getTime();
      if (isNaN(d)) return Infinity;
      return (Date.now() - d) / 36e5;
    } catch (_) { return Infinity; }
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var h = hoursSince(iso);
    if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
    if (h < 24) return Math.round(h) + 'h';
    var d = Math.round(h / 24);
    return d + 'd';
  }

  function parseNotesField(notes, field) {
    if (!notes || typeof notes !== 'string') return '';
    var re = new RegExp('(?:^|\\n)\\s*' + field + '\\s*:\\s*([^\\n]+)', 'i');
    var m = notes.match(re);
    return m ? m[1].trim() : '';
  }

  function hasEmailInContact(c) {
    if (c.email && String(c.email).trim()) return true;
    var fromNotes = parseNotesField(c.notes, 'Email');
    return !!(fromNotes && /@/.test(fromNotes));
  }

  function computeNotifications(rows) {
    var today = todayStr();
    rows = Array.isArray(rows) ? rows : [];

    // 1. Hand raises waiting > 24h
    var handRaisesStale = rows.filter(function (r) {
      return (r.stage || '').toLowerCase() === 'hand raise' && hoursSince(r.last_touch_at) > 24;
    });

    // 2. Discovery booked today (last_touch_at today)
    var discoveryToday = rows.filter(function (r) {
      return (r.stage || '').toLowerCase() === 'discovery' && isSameDay(r.last_touch_at);
    });

    // 3. Signed today
    var signedToday = rows.filter(function (r) {
      return (r.stage || '').toLowerCase() === 'signed' && isSameDay(r.last_touch_at);
    });

    // 4. Pending campaign uploads — not in campaign, has email
    var pendingCampaign = rows.filter(function (r) {
      return r.in_campaign !== true && hasEmailInContact(r);
    });

    // 5. Eileen today (created_at today)
    var eileenToday = rows.filter(function (r) { return isSameDay(r.created_at); });
    var eileenHandRaises = eileenToday.filter(function (r) {
      return (r.stage || '').toLowerCase() === 'hand raise';
    }).length;
    var eileenDiscovery = eileenToday.filter(function (r) {
      return (r.stage || '').toLowerCase() === 'discovery';
    }).length;

    // 6. Stale Contacted (no touch in 14+ days) · replaces the old silent auto-archive.
    // The bell surfaces these so the broker can open the review modal and decide
    // per-row whether to archive or keep.
    var staleCutoff = Date.now() - 14 * 86400000;
    var staleContacted = rows.filter(function (r) {
      if ((r.stage || '').toLowerCase() !== 'contacted') return false;
      var ref = r.last_touch_at || r.dm_sent_at;
      if (!ref) return true;
      var t = new Date(ref).getTime();
      return isFinite(t) ? (t < staleCutoff) : true;
    });

    var notifs = [];

    if (handRaisesStale.length) {
      var hrNames = handRaisesStale.slice(0, 3).map(nameOf).filter(Boolean).join(', ');
      var hrLatest = handRaisesStale.reduce(latestTouch, null);
      notifs.push({
        id: 'hand-raises-waiting-' + today,
        icon: iconHand(),
        title: handRaisesStale.length + ' hand raise' + (handRaisesStale.length === 1 ? '' : 's') + ' waiting >24h',
        subtitle: hrNames ? ('Last touched: ' + hrNames) : 'Needs follow-up',
        time: hrLatest ? relativeTime(hrLatest) : '',
        href: '/prospecting.html?tab=lineup#funnel'
      });
    }

    if (discoveryToday.length) {
      var discNames = discoveryToday.slice(0, 3).map(nameOf).filter(Boolean).join(', ');
      notifs.push({
        id: 'discovery-today-' + today,
        icon: iconCalendar(),
        title: discoveryToday.length + ' discovery call' + (discoveryToday.length === 1 ? '' : 's') + ' booked today',
        subtitle: discNames || 'Discovery stage',
        time: 'today',
        href: '/prospecting.html?tab=lineup#funnel'
      });
    }

    if (signedToday.length) {
      var signedNames = signedToday.slice(0, 3).map(nameOf).filter(Boolean).join(', ');
      notifs.push({
        id: 'signed-today-' + today,
        icon: iconCheck(),
        title: signedToday.length + ' new signed client' + (signedToday.length === 1 ? '' : 's') + ' today',
        subtitle: signedNames || 'Signed stage',
        time: 'today',
        href: '/prospecting.html?tab=lineup#funnel'
      });
    }

    if (pendingCampaign.length) {
      notifs.push({
        id: 'pending-campaign-' + today,
        icon: iconMail(),
        title: pendingCampaign.length + ' contact' + (pendingCampaign.length === 1 ? '' : 's') + ' ready for email campaign',
        subtitle: 'Has email · not yet in campaign',
        time: '',
        href: '/prospecting.html#campaign'
      });
    }

    if (eileenToday.length) {
      var subBits = [];
      if (eileenHandRaises) subBits.push(eileenHandRaises + ' hand raise' + (eileenHandRaises === 1 ? '' : 's'));
      if (eileenDiscovery) subBits.push(eileenDiscovery + ' discovery');
      notifs.push({
        id: 'eileen-today-' + today,
        icon: iconBolt(),
        title: 'Eileen today: ' + eileenToday.length + '/15 DMs sent',
        subtitle: subBits.length ? subBits.join(' · ') : 'No conversions yet today',
        time: 'today',
        href: '/prospecting.html?tab=recap'
      });
    }

    if (staleContacted.length) {
      notifs.push({
        id: 'stale-contacted-' + today,
        icon: iconClock(),
        title: staleContacted.length + ' stale Contacted to review',
        subtitle: 'No touch in 14+ days · review and decide',
        time: '',
        href: '/prospecting.html#stale-review',
        action: 'open-stale-review'
      });
    }

    return notifs;
  }

  function nameOf(c) {
    if (!c) return '';
    var n = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
    if (n) return n;
    if (c.handle) return c.handle;
    if (c.full_name) return c.full_name;
    return '';
  }

  function latestTouch(acc, c) {
    if (!c.last_touch_at) return acc;
    if (!acc) return c.last_touch_at;
    return new Date(c.last_touch_at).getTime() > new Date(acc).getTime() ? c.last_touch_at : acc;
  }

  /* Inline Tabler-style icons */
  function iconHand() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v8"/><path d="M14 12V6a1.5 1.5 0 0 1 3 0v9"/><path d="M17 8.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2c-2 0-3.5-1.1-4.5-3l-3-5.5c-.5-1 0-2.5 1.5-2.5"/></svg>';
  }
  function iconCalendar() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 10h16"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/></svg>';
  }
  function iconCheck() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
  }
  function iconMail() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
  }
  function iconBolt() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L4 14h7l-1 7 9-11h-7z"/></svg>';
  }
  function iconClock() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  }

  function renderNotifPanel() {
    var panel = document.getElementById('aari-hdr-notif');
    var dot = document.getElementById('aari-hdr-bell-dot');
    if (!panel) return;

    var readSet = getReadSet();
    var unreadCount = notifications.filter(function (n) { return !readSet[n.id]; }).length;

    if (dot) {
      if (unreadCount > 0) dot.classList.add('show');
      else dot.classList.remove('show');
    }

    var headHtml =
      '<div class="aari-hdr-notif-head">' +
      '  <span class="label">Notifications</span>' +
      '  <button type="button" class="markall" id="aari-hdr-markall">Mark all read</button>' +
      '</div>';

    var bodyHtml;
    if (notifLoadError) {
      bodyHtml = '<div class="aari-hdr-notif-empty">Couldn\'t load notifications.</div>';
    } else if (!notifications.length) {
      bodyHtml = '<div class="aari-hdr-notif-empty">You\'re all caught up.</div>';
    } else {
      bodyHtml = notifications.map(function (n) {
        var unread = !readSet[n.id];
        var actionAttr = n.action ? ' data-notif-action="' + esc(n.action) + '"' : '';
        return '<a class="aari-hdr-notif-item ' + (unread ? 'unread' : '') + '" ' +
          'href="' + esc(n.href) + '" data-notif-id="' + esc(n.id) + '"' + actionAttr + '>' +
          '<span class="icn">' + n.icon + '</span>' +
          '<span class="body">' +
          '<div class="title">' + esc(n.title) + '</div>' +
          (n.subtitle ? '<div class="sub">' + esc(n.subtitle) + '</div>' : '') +
          '</span>' +
          (n.time ? '<span class="time">' + esc(n.time) + '</span>' : '') +
          '</a>';
      }).join('');
    }

    panel.innerHTML = headHtml + '<div class="aari-hdr-notif-body">' + bodyHtml + '</div>';

    // Wire item clicks → mark read · special actions (e.g. open stale-review modal)
    // intercept the click instead of navigating.
    var items = panel.querySelectorAll('.aari-hdr-notif-item');
    items.forEach(function (it) {
      it.addEventListener('click', function (e) {
        var id = it.getAttribute('data-notif-id');
        var action = it.getAttribute('data-notif-action');
        if (id) {
          var rs = getReadSet();
          rs[id] = true;
          setReadSet(rs);
          it.classList.remove('unread');
        }
        if (action === 'open-stale-review' && window.AariStaleReview && typeof window.AariStaleReview.open === 'function') {
          e.preventDefault();
          // Close the notif panel before opening the modal
          panel.classList.remove('open');
          var bellBtn = document.getElementById('aari-hdr-bell');
          if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
          window.AariStaleReview.open();
        }
      });
    });

    // Wire "Mark all read"
    var markBtn = document.getElementById('aari-hdr-markall');
    if (markBtn) {
      markBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rs = getReadSet();
        notifications.forEach(function (n) { rs[n.id] = true; });
        setReadSet(rs);
        renderNotifPanel();
      });
    }
  }

  function refreshNotifications() {
    var role = effectiveRole(currentProfile);
    // Agent role gets file_messages only (their own outbound, no bell items here)
    // TC role gets file_messages (agent → TC)
    // Broker role gets bd_contacts + file_messages
    if (role !== 'broker' && role !== 'tc') return;
    if (!window.AariAuth || typeof window.AariAuth.ensureClient !== 'function') {
      notifLoadError = true;
      renderNotifPanel();
      return;
    }
    Promise.resolve(window.AariAuth.ensureClient()).then(function (client) {
      if (!client || !client.from) {
        notifLoadError = true;
        renderNotifPanel();
        return;
      }
      var bdPromise = (role === 'broker')
        ? client.from('bd_contacts')
            .select('id,first_name,last_name,handle,full_name,email,stage,last_touch_at,created_at,in_campaign,notes')
            .limit(2000)
        : Promise.resolve({ data: [] });
      var fmPromise = client.from('file_messages')
        .select('id,file_id,sender_id,sender_role,recipient_role,message,sent_at,replied_at,nudge_count')
        .is('replied_at', null)
        .eq('sender_role','agent')
        .order('sent_at', { ascending: false })
        .limit(50);
      Promise.all([bdPromise, fmPromise]).then(function (results) {
        var bdRes = results[0] || {};
        var fmRes = results[1] || {};
        if (bdRes && bdRes.error) throw bdRes.error;
        // file_messages may error if table not yet migrated · don't break the whole bell
        var fmRows = (fmRes && !fmRes.error && Array.isArray(fmRes.data)) ? fmRes.data : [];
        notifLoadError = false;
        var bdNotifs = (role === 'broker') ? computeNotifications((bdRes && bdRes.data) || []) : [];
        var fmNotifs = computeFileMessageNotifs(fmRows, role, (currentProfile && currentProfile.id) || null, client);
        notifications = bdNotifs.concat(fmNotifs);
        renderNotifPanel();
      }).catch(function () {
        notifLoadError = true;
        notifications = [];
        renderNotifPanel();
      });
    }).catch(function () {
      notifLoadError = true;
      notifications = [];
      renderNotifPanel();
    });
  }

  // Cache the file context lookup (agent name + property address) for message notifs.
  // file_messages joins to files + agents — we hydrate on first paint so the bell
  // can show "Marlenyi · 1234 Maple St" instead of opaque IDs.
  var _fmContextCache = {};
  function computeFileMessageNotifs(rows, role, userId, client) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    // For TC role · filter to only files this user is assigned to.
    // (RLS already enforces this server-side · this is a belt-and-suspenders.)
    // Trigger background hydrate of file context for any uncached file_ids
    var needsHydrate = [];
    rows.forEach(function (m) {
      if (m.file_id && !_fmContextCache[m.file_id]) needsHydrate.push(m.file_id);
    });
    if (needsHydrate.length && client && client.from) {
      client.from('files')
        .select('id, property_address, agent_id, assigned_tc_id')
        .in('id', needsHydrate)
        .then(function (res) {
          if (!res || res.error || !Array.isArray(res.data)) return;
          var agentIds = [];
          res.data.forEach(function (f) {
            _fmContextCache[f.id] = { address: f.property_address || '', agent_id: f.agent_id, assigned_tc_id: f.assigned_tc_id, agent_name: '' };
            if (f.agent_id) agentIds.push(f.agent_id);
          });
          if (agentIds.length) {
            client.from('agents').select('id, first_name, last_name').in('id', agentIds).then(function (ar) {
              if (!ar || ar.error || !Array.isArray(ar.data)) return;
              var nameById = {};
              ar.data.forEach(function (a) { nameById[a.id] = ((a.first_name || '') + ' ' + (a.last_name || '')).trim(); });
              Object.keys(_fmContextCache).forEach(function (fid) {
                var ctx = _fmContextCache[fid];
                if (ctx && ctx.agent_id && nameById[ctx.agent_id]) ctx.agent_name = nameById[ctx.agent_id];
              });
              // re-render once names land
              renderNotifPanel();
            });
          } else {
            renderNotifPanel();
          }
        });
    }
    var landing = role === 'broker' ? '/broker-cockpit.html#messages' : '/files.html';
    return rows.map(function (m) {
      var ctx = _fmContextCache[m.file_id] || {};
      var agentName = ctx.agent_name || 'Agent';
      var addr = ctx.address || 'a file';
      var mins = Math.floor((Date.now() - new Date(m.sent_at).getTime()) / 60000);
      var timeLbl = mins < 60 ? (mins + 'm') : (mins < 1440 ? (Math.floor(mins/60) + 'h') : (Math.floor(mins/1440) + 'd'));
      var urgent = mins >= 240;
      var title = (role === 'broker' ? 'Agent → TC' : 'Agent message') + ' · ' + addr;
      var sub = agentName + ': ' + String(m.message || '').slice(0, 80) + (m.message && m.message.length > 80 ? '…' : '');
      if (urgent) sub = '⚠ Overdue (' + timeLbl + ') · ' + sub;
      return {
        id: 'fm-' + m.id,
        icon: iconMail(),
        title: title,
        subtitle: sub,
        time: timeLbl,
        href: landing + (role === 'tc' ? '' : '')
      };
    });
  }

  function setProfile(profile) {
    if (!profile) return;
    profileResolved = true;
    currentProfile = profile;
    var btn = document.getElementById('aari-avatar-btn');
    if (!btn) return;
    var initials = initialsFrom(profile);
    btn.innerHTML = '<span id="aari-hdr-initials">' + esc(initials) + '</span>';
    if (profile.headshot_url) {
      var img = document.createElement('img');
      img.alt = ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || 'Account';
      img.onerror = function () { btn.innerHTML = '<span id="aari-hdr-initials">' + esc(initials) + '</span>'; };
      img.src = profile.headshot_url;
      btn.innerHTML = '';
      btn.appendChild(img);
    }
    renderViewAs();
    renderMenu();
    renderBell();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Auto-resolve profile from AariAuth if page doesn't call setProfile within 800ms.
  // This makes the header self-sufficient on pages that don't wire setProfile (briefing, etc.).
  function tryAutoResolve() {
    setTimeout(function () {
      if (profileResolved) return;
      if (!window.AariAuth || typeof window.AariAuth.getAgentProfile !== 'function') return;
      Promise.resolve(window.AariAuth.getAgentProfile()).then(function (profile) {
        if (profile && !profileResolved) setProfile(profile);
      }).catch(function () {});
    }, 800);
  }

  function boot() {
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    injectCss();
    render();
    window.AariHeader = { setProfile: setProfile, effectiveRole: effectiveRole, refreshNotifications: refreshNotifications };
    tryAutoResolve();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

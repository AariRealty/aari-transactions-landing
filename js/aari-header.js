/* Aari Transactions · Shared interior-page header (May 2026)
 * Variant 1: pure cream/black/white. Zero gold. Drop-in component.
 *
 * Usage in each interior page:
 *   <div id="aari-header" data-aari-view="VIEW_ID" data-aari-show-submit="yes|no"></div>
 *   <script src="/js/aari-header.js" defer></script>
 *
 * VIEW_ID is one of: portal | broker-cockpit | client-tracker | eileen
 *
 * After the page's auth flow resolves the profile, call:
 *   window.AariHeader.setProfile(profile)   // sets welcome name, avatar initials, role, filters nav
 *
 * Submit button (when data-aari-show-submit="yes") dispatches a custom event:
 *   document.addEventListener('aari:submit-file', () => { ... })
 *
 * Each page can host its own submit-file handler.
 */

(function () {
  'use strict';

  var ROOT_ID = 'aari-header';

  // ── Nav model ─────────────────────────────────────────────────────────
  // Each entry: { id, label, href, roles[] }
  // roles[] is a whitelist. If omitted, all roles see it.
  // Three roles only: broker, tc, agent. No person-named pseudo-roles.
  var NAV = [
    { id: 'broker-cockpit',  label: "Broker Cockpit", href: '/broker-cockpit.html', roles: ['broker'] },
    { id: 'client-crm',      label: "Client CRM",     href: '/aari-crm',            roles: ['broker', 'tc'] },
    { id: 'tc-cockpit',      label: "TC Cockpit",     href: '/tc-cockpit.html',     roles: ['broker', 'tc'] },
    { id: 'portal',          label: "Agent Portal",   href: '/portal',              roles: ['broker', 'tc', 'agent'] }
  ];

  // ── CSS (injected once) ───────────────────────────────────────────────
  var CSS = [
    '.aari-hdr{background:#fff;border-bottom:1px solid #e8e8e6;padding:14px 20px;display:flex;align-items:center;gap:14px;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;position:relative;z-index:50}',
    '.aari-hdr-brand{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#0f0f0f}',
    '.aari-hdr-mark{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:14px;color:#0f0f0f;padding:4px 10px;border:1.5px solid #0f0f0f;border-radius:5px;letter-spacing:2px;line-height:1}',
    '.aari-hdr-name{display:flex;flex-direction:column;gap:4px;line-height:1}',
    '.aari-hdr-page{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:18px;color:#0f0f0f;line-height:1;letter-spacing:-.3px}',
    '.aari-hdr-sub{font-family:"Inter",sans-serif;font-weight:600;font-size:10px;color:#0f0f0f;opacity:.55;text-transform:uppercase;letter-spacing:1.3px;line-height:1}',
    '.aari-hdr-spacer{flex:1;min-width:0}',
    '.aari-hdr-switch{background:#fff;color:#0f0f0f;border:1px solid #0f0f0f;padding:7px 14px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.3px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;line-height:1;white-space:nowrap;transition:all .15s}',
    '.aari-hdr-switch:hover{background:#0f0f0f;color:#fff}',
    '.aari-hdr-switch .caret{font-size:10px;line-height:1}',
    '.aari-hdr-submit{background:#0f0f0f;color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.3px;padding:9px 16px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:opacity .15s}',
    '.aari-hdr-submit:hover{opacity:.85}',
    '.aari-hdr-avatar{background:#fff;color:#0f0f0f;border:1px solid #e8e8e6;border-radius:999px;padding:4px 4px 4px 10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:500;font-family:inherit;line-height:1;transition:border-color .15s}',
    '.aari-hdr-avatar:hover{border-color:#0f0f0f}',
    '.aari-hdr-avatar:hover #aari-hdr-firstname{text-decoration:underline;text-underline-offset:3px}',
    '.aari-hdr-avatar:focus-visible{outline:2px solid #0f0f0f;outline-offset:2px}',
    '#aari-hdr-firstname{font-weight:600;letter-spacing:0.2px}',
    '.aari-hdr-avatar .av{background:#0f0f0f;color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;overflow:hidden}',
    '.aari-hdr-avatar .av img{width:100%;height:100%;object-fit:cover}',
    '.aari-hdr-menu{position:absolute;top:calc(100% + 6px);background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:8px;width:240px;box-shadow:0 4px 16px rgba(0,0,0,.10);display:none;z-index:60}',
    '.aari-hdr-menu.open{display:block}',
    '.aari-hdr-menu .hdr-label{padding:8px 12px;font-size:10px;color:#6b6760;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid #e8e8e6;margin-bottom:4px}',
    '.aari-hdr-menu a{display:block;padding:9px 12px;font-size:13px;color:#0f0f0f;text-decoration:none;border-radius:5px;cursor:pointer;font-weight:500;line-height:1.3}',
    '.aari-hdr-menu a:hover{background:#f7f5ee}',
    '.aari-hdr-menu a.active{background:#faf6ec;font-weight:600}',
    '.aari-hdr-menu a.active::after{content:"●";float:right;font-size:11px;color:#0f0f0f;line-height:1.3}',
    '.aari-hdr-menu .menu-divider{border-top:1px solid #e8e8e6;margin:4px 0 0;padding-top:4px}',
    '.aari-hdr-menu .menu-meta{color:#6b6760;font-weight:500}',
    '#aari-switch-menu{left:auto;right:auto}',
    '@media(max-width:640px){',
    '  .aari-hdr{padding:10px 14px;gap:8px;flex-wrap:wrap}',
    '  .aari-hdr-name small{display:none}',
    '  .aari-hdr-spacer{flex-basis:100%;height:0}',
    '  .aari-hdr-submit{padding:8px 12px;font-size:10px}',
    '  .aari-hdr-avatar span:not(.av){display:none}',
    '  .aari-hdr-menu{width:calc(100vw - 28px);right:14px;left:14px;width:auto}',
    '}'
  ].join('');

  function injectCss() {
    if (document.getElementById('aari-hdr-css')) return;
    var s = document.createElement('style');
    s.id = 'aari-hdr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function initialsFrom(profile) {
    if (!profile) return '–';
    var a = (profile.first_name || '').trim();
    var b = (profile.last_name || '').trim();
    if (a && b) return (a[0] + b[0]).toUpperCase();
    if (a) return a[0].toUpperCase();
    if (profile.email) return profile.email[0].toUpperCase();
    return '–';
  }

  function effectiveRole(profile) {
    if (!profile) return 'agent';
    if (profile.role === 'broker') return 'broker';
    if (profile.role === 'tc') return 'tc';
    return 'agent';
  }

  function pageLabelFromView(view) {
    var map = {
      'portal': 'Agent Portal',
      'broker-cockpit': 'Broker Cockpit',
      'client-crm': 'Client CRM',
      'tc-cockpit': 'TC Cockpit'
    };
    return map[view] || 'Aari Transactions';
  }

  function pageSubFromView(view) {
    var map = {
      'portal': 'Agent dashboard',
      'broker-cockpit': 'Broker view',
      'client-crm': 'Client relationships',
      'tc-cockpit': 'TC workspace'
    };
    return map[view] || '';
  }

  // ── Render ────────────────────────────────────────────────────────────
  var root, currentView, showSubmit;

  function render() {
    if (!root) return;
    var pageLabel = pageLabelFromView(currentView);
    var pageSub = pageSubFromView(currentView);
    root.innerHTML = [
      '<div class="aari-hdr">',
      '  <a href="/" class="aari-hdr-brand" aria-label="Aari Transactions home">',
      '    <span class="aari-hdr-mark">AARI</span>',
      '    <span class="aari-hdr-name">',
      '      <span class="aari-hdr-page">' + escapeHtml(pageLabel) + '</span>',
      '      <span class="aari-hdr-sub" id="aari-hdr-role">' + escapeHtml(pageSub) + '</span>',
      '    </span>',
      '  </a>',
      '  <div class="aari-hdr-spacer"></div>',
      '  <div style="position:relative">',
      '    <button type="button" class="aari-hdr-switch" id="aari-switch-btn" aria-haspopup="true" aria-expanded="false">Switch view <span class="caret">▾</span></button>',
      '    <div class="aari-hdr-menu" id="aari-switch-menu" role="menu" aria-label="Jump to view">',
      '      <div class="hdr-label">Jump to view</div>',
      '      <div id="aari-switch-items"></div>',
      '      <div class="menu-divider">',
      '        <a href="/index.html" role="menuitem" class="menu-meta">← Back to website</a>',
      '        <a href="#" id="aari-signout" role="menuitem" class="menu-meta">Sign out</a>',
      '      </div>',
      '    </div>',
      '  </div>',
      (showSubmit ? '  <button type="button" class="aari-hdr-submit" id="aari-submit-cta">+ Submit New File</button>' : ''),
      '  <button type="button" class="aari-hdr-avatar" id="aari-avatar-btn" aria-label="Edit your profile" title="Edit your profile">',
      '    <span id="aari-hdr-firstname">–</span>',
      '    <span class="av" id="aari-hdr-avatar"><span id="aari-hdr-initials">–</span></span>',
      '  </button>',
      '</div>'
    ].join('\n');

    wireDropdown();
    wireSubmit();
    wireAvatar();
    wireSignOut();
  }

  function renderNavItems(role) {
    var box = document.getElementById('aari-switch-items');
    if (!box) return;
    var items = NAV.filter(function (n) {
      return !n.roles || n.roles.indexOf(role) > -1;
    });
    box.innerHTML = items.map(function (n) {
      var active = n.id === currentView ? ' active' : '';
      return '<a href="' + n.href + '" role="menuitem" class="' + active.trim() + '">' + escapeHtml(n.label) + '</a>';
    }).join('');
  }

  function wireDropdown() {
    var btn = document.getElementById('aari-switch-btn');
    var menu = document.getElementById('aari-switch-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
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

  function wireSubmit() {
    var btn = document.getElementById('aari-submit-cta');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('aari:submit-file'));
    });
  }

  function wireAvatar() {
    var btn = document.getElementById('aari-avatar-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('aari:avatar-click'));
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

  function setProfile(profile) {
    if (!profile) return;
    var role = effectiveRole(profile);
    var roleWord = {
      'broker': 'Broker',
      'tc-eileen': 'TC',
      'tc': 'TC',
      'agent': 'Agent'
    }[role] || '';
    var firstName = profile.first_name || 'Account';
    // Page sub-label stays static per view (set in render()); we don't override it on profile load.
    var firstNameEl = document.getElementById('aari-hdr-firstname');
    var initEl = document.getElementById('aari-hdr-initials');
    var avEl = document.getElementById('aari-hdr-avatar');
    // Avatar pill carries "Name · Role" — this is where the viewer's identity lives.
    if (firstNameEl) firstNameEl.textContent = roleWord ? (firstName + ' · ' + roleWord) : firstName;
    // Avatar render · handles 4 cases: no headshot → initials, headshot loads → image,
    // headshot fails → initials fallback (via onerror), headshot removed → initials restored
    if (avEl) {
      var initials = initialsFrom(profile);
      var fullName = ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || 'Agent';
      // Start by guaranteeing the initials span is present
      avEl.innerHTML = '<span id="aari-hdr-initials">' + escapeHtml(initials) + '</span>';
      if (profile.headshot_url) {
        var img = document.createElement('img');
        img.alt = fullName;
        img.onerror = function () {
          // Image failed to load → restore initials
          avEl.innerHTML = '<span id="aari-hdr-initials">' + escapeHtml(initials) + '</span>';
        };
        img.src = profile.headshot_url;
        avEl.innerHTML = '';
        avEl.appendChild(img);
      }
    }
    renderNavItems(role);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function boot() {
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    currentView = root.getAttribute('data-aari-view') || '';
    showSubmit = root.getAttribute('data-aari-show-submit') === 'yes';
    injectCss();
    render();
    // Render nav with default agent role until setProfile() arrives.
    renderNavItems('agent');
    window.AariHeader = {
      setProfile: setProfile,
      effectiveRole: effectiveRole
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

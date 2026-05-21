/* Aari Transactions · Slim interior-page header (May 2026 · Option G + D)
 * Brand chrome removed. Left: "← Back to website" sentence-case soft gray.
 * Right: 36px avatar circle with dropdown (name/role · view-as · settings · sign out).
 * Banner (aari-banner.js) owns all in-app navigation and CTAs.
 *
 * Usage in each interior page:
 *   <div id="aari-header"></div>
 *   <script src="/js/aari-header.js" defer></script>
 *
 * After auth resolves the profile:
 *   window.AariHeader.setProfile(profile)
 *
 * data-aari-view and data-aari-show-submit attributes from old version are ignored
 * (harmless if left in place · banner owns nav state now).
 */
(function () {
  'use strict';
  var ROOT_ID = 'aari-header';

  var CSS = [
    '.aari-hdr{background:#fff;border-bottom:1px solid #e8e8e6;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;position:relative;z-index:50}',
    '.aari-hdr-back{font-family:"Inter",-apple-system,sans-serif;font-size:12px;font-weight:400;color:#6b6760;text-decoration:none;display:inline-flex;align-items:center;gap:6px;line-height:1;transition:color .15s}',
    '.aari-hdr-back:hover{color:#0f0f0f;text-decoration:underline;text-underline-offset:3px}',
    '.aari-hdr-back .arrow{font-size:13px;line-height:1}',
    '.aari-hdr-avatar{background:#0f0f0f;color:#fbf9f4;border:1px solid #0f0f0f;width:36px;height:36px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.5px;line-height:1;transition:transform .15s,box-shadow .15s;overflow:hidden;padding:0}',
    '.aari-hdr-avatar:hover{transform:scale(1.05);box-shadow:0 2px 8px rgba(0,0,0,.15)}',
    '.aari-hdr-avatar:focus-visible{outline:2px solid #0f0f0f;outline-offset:3px}',
    '.aari-hdr-avatar img{width:100%;height:100%;object-fit:cover}',
    '.aari-hdr-menu{position:absolute;top:calc(100% + 8px);right:20px;background:#fff;border:1px solid #e8e8e6;border-radius:10px;padding:6px;width:240px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none;z-index:60}',
    '.aari-hdr-menu.open{display:block}',
    '.aari-hdr-menu .who{padding:12px;border-bottom:1px solid #e8e8e6;margin-bottom:6px}',
    '.aari-hdr-menu .who-name{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:16px;color:#0f0f0f;line-height:1.2;letter-spacing:-.2px}',
    '.aari-hdr-menu .who-role{font-family:"Inter",sans-serif;font-weight:600;font-size:10px;color:#6b6760;text-transform:uppercase;letter-spacing:1.3px;margin-top:4px}',
    '.aari-hdr-menu .view-as{padding:10px 12px 12px;border-bottom:1px solid #e8e8e6;margin-bottom:6px}',
    '.aari-hdr-menu .view-as-label{font-family:"Inter",sans-serif;font-weight:600;font-size:9px;color:#6b6760;text-transform:uppercase;letter-spacing:1.3px;margin-bottom:8px}',
    '.aari-hdr-menu .view-as-pills{display:flex;gap:4px}',
    '.aari-hdr-menu .view-as-pill{flex:1;padding:6px 8px;font-size:11px;font-weight:600;color:#0f0f0f;background:#f7f5ee;border:1px solid transparent;border-radius:5px;cursor:pointer;text-align:center;font-family:inherit;line-height:1.2;transition:background .12s}',
    '.aari-hdr-menu .view-as-pill.active{background:#0f0f0f;color:#fbf9f4;border-color:#0f0f0f}',
    '.aari-hdr-menu .view-as-pill:hover:not(.active){background:#efeadf}',
    '.aari-hdr-menu a{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:13px;color:#0f0f0f;text-decoration:none;border-radius:6px;cursor:pointer;font-weight:500;line-height:1.3}',
    '.aari-hdr-menu a:hover{background:#f7f5ee}',
    '@media(max-width:640px){',
    '  .aari-hdr{padding:10px 14px}',
    '  .aari-hdr-menu{right:14px;left:14px;width:auto}',
    '}'
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

  var root, currentProfile = null;

  function render() {
    if (!root) return;
    root.innerHTML = [
      '<div class="aari-hdr">',
      '  <a href="/" class="aari-hdr-back" aria-label="Back to website">',
      '    <span class="arrow" aria-hidden="true">&larr;</span>',
      '    <span>Back to website</span>',
      '  </a>',
      '  <div style="position:relative">',
      '    <button type="button" class="aari-hdr-avatar" id="aari-avatar-btn" aria-haspopup="true" aria-expanded="false" aria-label="Open account menu" title="Account">',
      '      <span id="aari-hdr-initials">&ndash;</span>',
      '    </button>',
      '  </div>',
      '  <div class="aari-hdr-menu" id="aari-hdr-menu" role="menu" aria-label="Account menu"></div>',
      '</div>'
    ].join('\n');
    renderMenu();
    wireAvatar();
  }

  function renderMenu() {
    var menu = document.getElementById('aari-hdr-menu');
    if (!menu) return;
    var p = currentProfile || {};
    var role = effectiveRole(p);
    var roleWord = { broker: 'Broker', tc: 'Transaction Coordinator', agent: 'Agent' }[role] || 'Agent';
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (p.email || 'Account');
    var viewAs = '';
    try { viewAs = sessionStorage.getItem('aari-view-as') || ''; } catch (_) {}
    var current = viewAs || role;

    var parts = [
      '<div class="who">',
      '  <div class="who-name">' + esc(fullName) + '</div>',
      '  <div class="who-role">' + esc(roleWord) + '</div>',
      '</div>'
    ];

    if (role === 'broker') {
      parts.push(
        '<div class="view-as">',
        '  <div class="view-as-label">View as</div>',
        '  <div class="view-as-pills">',
        '    <button type="button" class="view-as-pill ' + (current === 'broker' ? 'active' : '') + '" data-view="broker">Broker</button>',
        '    <button type="button" class="view-as-pill ' + (current === 'tc' ? 'active' : '') + '" data-view="tc">TC</button>',
        '    <button type="button" class="view-as-pill ' + (current === 'agent' ? 'active' : '') + '" data-view="agent">Agent</button>',
        '  </div>',
        '</div>'
      );
    }

    parts.push(
      '<a href="/portal.html#profile" role="menuitem">Settings</a>',
      '<a href="#" id="aari-signout" role="menuitem">Sign out</a>'
    );

    menu.innerHTML = parts.join('\n');
    wireViewAs();
    wireSignOut();
  }

  function wireAvatar() {
    var btn = document.getElementById('aari-avatar-btn');
    var menu = document.getElementById('aari-hdr-menu');
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

  function wireViewAs() {
    var pills = document.querySelectorAll('.aari-hdr-menu .view-as-pill');
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
        location.reload();
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

  function setProfile(profile) {
    if (!profile) return;
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
    renderMenu();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function boot() {
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    injectCss();
    render();
    window.AariHeader = { setProfile: setProfile, effectiveRole: effectiveRole };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

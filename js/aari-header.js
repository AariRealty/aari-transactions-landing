/* Aari Transactions · Slim interior-page header (May 2026 · Option G + D · View-as in chrome)
 * Left: "← Back to website" sentence-case soft gray.
 * Center (broker/TC only): View-as pills.
 * Right: 36px avatar circle with dropdown (name/role · settings · sign out).
 *
 * Role rules:
 *   broker → sees [Broker · TC · Agent] pills
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

  var root, currentProfile = null, profileResolved = false;

  function render() {
    if (!root) return;
    root.innerHTML = [
      '<div class="aari-hdr">',
      '  <a href="/" class="aari-hdr-back" aria-label="Back to website">',
      '    <span class="arrow" aria-hidden="true">&larr;</span>',
      '    <span>Back to website</span>',
      '  </a>',
      '  <div class="aari-hdr-viewas" id="aari-hdr-viewas"></div>',
      '  <div style="position:relative">',
      '    <button type="button" class="aari-hdr-avatar" id="aari-avatar-btn" aria-haspopup="true" aria-expanded="false" aria-label="Open account menu" title="Account">',
      '      <span id="aari-hdr-initials">&ndash;</span>',
      '    </button>',
      '  </div>',
      '  <div class="aari-hdr-menu" id="aari-hdr-menu" role="menu" aria-label="Account menu"></div>',
      '</div>'
    ].join('\n');
    renderViewAs();
    renderMenu();
    wireAvatar();
  }

  function renderViewAs() {
    var container = document.getElementById('aari-hdr-viewas');
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
      '<span class="aari-hdr-viewas-label">View as</span>' +
      '<div class="aari-hdr-viewas-pills">' + pillsHtml + '</div>';

    wireViewAs();
  }

  function renderMenu() {
    var menu = document.getElementById('aari-hdr-menu');
    if (!menu) return;
    var p = currentProfile || {};
    var role = effectiveRole(p);
    var roleWord = { broker: 'Broker', tc: 'Transaction Coordinator', agent: 'Agent' }[role] || 'Agent';
    var fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (p.email || 'Account');

    menu.innerHTML = [
      '<div class="who">',
      '  <div class="who-name">' + esc(fullName) + '</div>',
      '  <div class="who-role">' + esc(roleWord) + '</div>',
      '</div>',
      '<a href="/portal.html#profile" role="menuitem">Settings</a>',
      '<a href="#" id="aari-signout" role="menuitem">Sign out</a>'
    ].join('\n');
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
    window.AariHeader = { setProfile: setProfile, effectiveRole: effectiveRole };
    tryAutoResolve();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

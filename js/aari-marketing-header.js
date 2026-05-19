/* Aari Transactions · Shared marketing-page header (May 2026)
 * Drop-in component for all public marketing pages.
 *
 * Usage in each page:
 *   <script src="/js/aari-marketing-header.js" defer></script>
 *
 * Injects:
 *   · CSS (sticky header with cream/transparent bg, AARI logo, nav links, Portal + Submit buttons)
 *   · HTML markup at the top of <body>
 *
 * Behavior:
 *   · Desktop: full nav (Pricing · How it works · FAQ · Portal · Submit a file)
 *   · Mobile (<900px): slim bar (logo + Portal + Submit only)
 *   · Section anchors point back to /index.html#pricing etc. so they work from any inner page
 *   · Replaces any existing <nav class="nav"> or <header> on the page (idempotent)
 */
(function () {
  'use strict';

  if (document.querySelector('nav.aari-shared-nav')) return; // idempotent

  // ── CSS ───────────────────────────────────────────────────────────────
  var CSS = [
    'nav.aari-shared-nav{position:sticky;top:0;left:0;right:0;z-index:90;background:rgba(251,249,244,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #e8e8e6;padding:14px 0;font-family:"Inter","Helvetica Neue",sans-serif}',
    'nav.aari-shared-nav .aari-nav-wrap{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center;gap:20px}',
    'nav.aari-shared-nav .aari-nav-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#0a0a0a}',
    'nav.aari-shared-nav .aari-nav-mark{height:36px;width:auto;flex-shrink:0;display:block}',
    'nav.aari-shared-nav .aari-nav-name{font-weight:700;font-size:15px;line-height:1.1;letter-spacing:-0.01em;color:#0a0a0a}',
    'nav.aari-shared-nav .aari-nav-name small{display:block;font-weight:500;font-size:10px;color:#5a5a5a;letter-spacing:0.5px;margin-top:2px;text-transform:uppercase}',
    'nav.aari-shared-nav .aari-nav-links{display:flex;align-items:center;gap:6px}',
    'nav.aari-shared-nav .aari-nav-links a:not(.aari-nav-portal):not(.aari-nav-cta){font-size:13px;font-weight:500;color:#3a3a3a;padding:8px 14px;border-radius:4px;text-decoration:none;transition:background 0.15s}',
    'nav.aari-shared-nav .aari-nav-links a:not(.aari-nav-portal):not(.aari-nav-cta):hover{background:rgba(0,0,0,0.04)}',
    'nav.aari-shared-nav a.aari-nav-portal{font-size:12.5px;font-weight:600;color:#0a0a0a;letter-spacing:0.4px;padding:9px 14px;border:1px solid rgba(10,10,10,0.4);border-radius:4px;text-decoration:none;background:transparent;transition:background 0.15s,border-color 0.15s;white-space:nowrap}',
    'nav.aari-shared-nav a.aari-nav-portal:hover{background:rgba(10,10,10,0.04);border-color:rgba(10,10,10,0.6)}',
    'nav.aari-shared-nav a.aari-nav-cta{background:#0a0a0a;color:#fff;font-size:12.5px;font-weight:700;letter-spacing:0.4px;padding:10px 18px;border-radius:4px;text-decoration:none;transition:opacity 0.18s;white-space:nowrap}',
    'nav.aari-shared-nav a.aari-nav-cta:hover{opacity:0.88}',
    '@media(max-width:899px){',
    '  nav.aari-shared-nav{padding:10px 0}',
    '  nav.aari-shared-nav .aari-nav-wrap{padding:0 14px;gap:10px}',
    '  nav.aari-shared-nav .aari-nav-name{display:none}',
    '  nav.aari-shared-nav .aari-nav-links a:not(.aari-nav-portal):not(.aari-nav-cta){display:none}',
    '  nav.aari-shared-nav .aari-nav-links{gap:8px}',
    '  nav.aari-shared-nav .aari-nav-mark{height:30px}',
    '  nav.aari-shared-nav a.aari-nav-portal{font-size:11px;padding:8px 14px;white-space:nowrap}',
    '  nav.aari-shared-nav a.aari-nav-cta{font-size:11px;padding:9px 14px;white-space:nowrap}',
    '  nav.aari-shared-nav a.aari-nav-cta .aari-cta-extra{display:none}',
    '}'
  ].join('');

  if (!document.getElementById('aari-shared-nav-style')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'aari-shared-nav-style';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // ── Markup ────────────────────────────────────────────────────────────
  var HTML = [
    '<nav class="aari-shared-nav" aria-label="Primary">',
    '  <div class="aari-nav-wrap">',
    '    <a href="/" class="aari-nav-brand" aria-label="Aari Transactions">',
    '      <img class="aari-nav-mark" src="/images/aari-logo.png" alt="Aari Transactions">',
    '      <span class="aari-nav-name">Aari Transactions<small>Florida TC</small></span>',
    '    </a>',
    '    <div class="aari-nav-links">',
    '      <a href="/index.html#pricing">Pricing</a>',
    '      <a href="/index.html#how">How it works</a>',
    '      <a href="/index.html#faq">FAQ</a>',
    '      <a href="/portal" class="aari-nav-portal">Portal</a>',
    '      <a href="/index.html#apply" class="aari-nav-cta">Submit<span class="aari-cta-extra"> a file</span> &rarr;</a>',
    '    </div>',
    '  </div>',
    '</nav>'
  ].join('\n');

  // ── Inject ────────────────────────────────────────────────────────────
  // Replace any existing <nav class="nav"> or <header> with the shared nav.
  // If neither exists, prepend to <body>.
  var oldNav = document.querySelector('body > nav.nav, body > header');
  if (oldNav) {
    oldNav.outerHTML = HTML;
  } else {
    var div = document.createElement('div');
    div.innerHTML = HTML;
    document.body.insertBefore(div.firstChild, document.body.firstChild);
  }
})();

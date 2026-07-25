/* Aari Transactions · Shared marketing footer (May 2026)
 * Drop-in component for all public marketing pages.
 *
 * Usage:
 *   <script src="/js/aari-footer.js" defer></script>
 *
 * Injects:
 *   · CSS (cream newsletter hero + dark link columns + folded contact/legal row)
 *   · HTML markup (newsletter form, link cols, copyright, privacy/terms/instagram)
 *   · Year stamp
 *
 * Notes:
 *   · Hash anchors (#pricing, #faq, etc.) resolve to /index.html#XXX so they
 *     work from any interior page.
 *   · Newsletter form posts to Netlify (form-name: aari-newsletter) — same
 *     bucket as the index page form so submissions consolidate.
 */
(function () {
  'use strict';

  // ── Brand-mark swap · replace text wordmark with image logo ───────────
  // Runs first so the header updates even if the footer markup is missing.
  // Handles all 4 legacy class variants used across the site:
  //   .mark-wordmark, .brand-mark, .brand-mark-foot, .brand .mark
  // Idempotent · won't re-swap an element that's already an <img>.
  (function swapBrandMark() {
    var marks = document.querySelectorAll('.mark-wordmark, .brand-mark, .brand-mark-foot, .brand .mark, header .mark, .nav .mark');
    if (!marks.length) return;
    if (!document.getElementById('aari-brand-logo-style')) {
      var brandStyle = document.createElement('style');
      brandStyle.id = 'aari-brand-logo-style';
      brandStyle.textContent = '.mark-logo{height:36px;width:auto;flex-shrink:0;display:block;border:none;padding:0;background:transparent}@media(max-width:899px){.mark-logo{height:30px}}footer .mark-logo{filter:invert(1)}';
      document.head.appendChild(brandStyle);
    }
    marks.forEach(function (m) {
      if (m.tagName === 'IMG') return;
      var img = document.createElement('img');
      img.className = 'mark-logo';
      img.src = '/images/aari-logo.png';
      img.alt = 'Aari Transactions';
      m.parentNode.replaceChild(img, m);
    });
  })();

  if (document.querySelector('footer.aari-shared-footer')) return; // idempotent (footer-only)

  // ── CSS (injected once) ───────────────────────────────────────────────
  var CSS = [
    'footer.aari-shared-footer{background:#0a0a0a;color:#fff;padding:0;border-top:1px solid rgba(255,255,255,0.06);font-family:"Inter","Helvetica Neue",sans-serif;margin:0}',
    'footer.aari-shared-footer *{box-sizing:border-box}',
    'footer.aari-shared-footer a{color:inherit;text-decoration:none}',
    '.aari-foot-hero{padding:56px 32px 40px;text-align:center;background:#f5f0e8;color:#000;border-bottom:1px solid #e5dfd2;position:relative;overflow:hidden}',
    '.aari-foot-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 0,rgba(0,0,0,0.04),transparent 60%);pointer-events:none}',
    '.aari-foot-pill{position:relative;display:inline-block;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.18);padding:6px 14px;border-radius:4px;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;color:#000;margin:0 0 18px;z-index:2}',
    '.aari-foot-pill .dot{display:inline-block;width:6px;height:6px;background:#558e58;border-radius:50%;margin-right:8px;vertical-align:1px;animation:aariFootPulse 1.8s ease-in-out infinite}',
    '@keyframes aariFootPulse{0%,100%{opacity:1}50%{opacity:0.5}}',
    '.aari-foot-h{position:relative;z-index:2;font-family:"Cormorant Garamond",Georgia,serif;font-size:56px;color:#000;margin:0 0 8px;letter-spacing:-1.2px;line-height:0.95;font-weight:400}',
    '.aari-foot-h em{font-style:italic;font-weight:400}',
    '.aari-foot-sub{position:relative;z-index:2;font-size:13px;color:#555;margin:0 auto 24px;max-width:460px;line-height:1.5}',
    '.aari-foot-form{position:relative;z-index:2;display:flex;justify-content:center;gap:8px;max-width:460px;margin:0 auto;flex-wrap:wrap}',
    '.aari-foot-input{flex:1;min-width:200px;background:#fff;color:#000;border:1px solid #000;border-radius:4px;padding:14px 18px;font-family:inherit;font-size:13px;outline:none}',
    '.aari-foot-input::placeholder{color:#888}',
    '.aari-foot-btn{background:#000;color:#fff;border:1px solid #000;border-radius:4px;padding:14px 26px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background 0.18s,color 0.18s}',
    '.aari-foot-btn:hover{background:transparent;color:#000}',
    '.aari-foot-micro{font-size:11px;color:#666;margin:14px 0 0;font-family:inherit;position:relative;z-index:2}',
    '.aari-foot-consent{position:relative;z-index:2;font-size:11px;color:#555;margin:12px auto 0;max-width:460px;line-height:1.6;text-align:left;font-family:inherit}',
    '.aari-foot-consent label{cursor:pointer;display:inline-block}',
    '.aari-foot-consent input[type="checkbox"]{accent-color:#000;margin-right:8px;vertical-align:middle}',
    '.aari-foot-consent-upload{display:block;margin-top:6px;font-size:10.5px;color:#777}',
    '.aari-foot-consent-upload input[type="file"]{margin-left:6px;font-size:11px}',
    '.aari-foot-trust{position:relative;z-index:2;display:flex;justify-content:center;align-items:center;gap:14px;margin:24px 0 0;font-size:11px;color:#666;letter-spacing:0.3px;flex-wrap:wrap}',
    '.aari-foot-trust-faces{display:flex;align-items:center}',
    '.aari-foot-trust-face{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#bfb7a5,#7a6f5e);border:2px solid #f5f0e8;margin-left:-8px;overflow:hidden}',
    '.aari-foot-trust-face:first-child{margin-left:0}',
    '.aari-foot-trust-face img{width:100%;height:100%;object-fit:cover;display:block}',
    '.aari-foot-trust span strong{color:#000;font-family:"Cormorant Garamond",Georgia,serif;font-size:14px;letter-spacing:-0.2px;font-weight:400;font-style:italic}',
    '.aari-foot-cols{padding:36px 32px 0;max-width:880px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:32px;text-align:left}',
    '.aari-foot-col h5{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px;font-family:inherit}',
    '.aari-foot-col h5::after{content:"";flex:1;height:1px;background:#2a2a2a}',
    '.aari-foot-col a{display:block;font-size:13px;color:#ccc;line-height:1.85;font-weight:400;transition:color 0.15s}',
    '.aari-foot-col a:hover{color:#fff}',
    '.aari-foot-contact-row{padding:22px 32px 6px;max-width:1100px;margin:36px auto 0;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;font-size:14px;color:#fff;letter-spacing:-0.1px;border-top:1px solid #2a2a2a}',
    '.aari-foot-contact-row a{color:#fff;text-decoration:none}',
    '.aari-foot-contact-row a:hover{color:#aaa}',
    '.aari-foot-bottom{padding:14px 32px 24px;max-width:1100px;margin:0 auto;font-size:11px;color:#888;display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:14px;letter-spacing:0.3px;font-family:inherit}',
    '.aari-foot-bottom a{color:#888;text-decoration:none}',
    '.aari-foot-bottom a:hover{color:#fff}',
    '@media (max-width:900px){',
    '  .aari-foot-hero{padding:40px 20px 32px}',
    '  .aari-foot-h{font-size:36px;letter-spacing:-0.8px}',
    '  .aari-foot-cols{grid-template-columns:1fr;gap:0;padding:0 20px}',
    '  .aari-foot-col{border-bottom:1px solid #2a2a2a}',
    '  .aari-foot-col h5{margin:0;padding:18px 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#fff;user-select:none;min-height:44px}',
    '  .aari-foot-col h5::after{content:"+";flex:0 0 auto;height:auto;width:auto;background:transparent;color:#888;font-size:20px;font-weight:300;line-height:1}',
    '  .aari-foot-col.expanded h5::after{content:"\\2212"}',
    '  .aari-foot-col a{max-height:0;overflow:hidden;opacity:0;padding:0;line-height:0;transition:max-height 0.25s ease,opacity 0.2s ease,padding 0.2s ease,line-height 0.2s ease}',
    '  .aari-foot-col.expanded a{max-height:42px;opacity:1;line-height:1.85;padding:6px 0}',
    '  .aari-foot-col.expanded{padding-bottom:14px}',
    '  .aari-foot-bottom{padding:18px 20px 22px;flex-direction:column;align-items:flex-start;gap:10px;text-align:left}',
    '}',
    '@media (max-width:560px){',
    '  .aari-foot-h{font-size:32px;letter-spacing:-0.6px}',
    '  .aari-foot-form{flex-direction:column;gap:10px}',
    '  .aari-foot-input{min-width:0;width:100%}',
    '  .aari-foot-btn{width:100%}',
    '  .aari-foot-contact-row a[href^="tel"]{font-size:24px !important}',
    '  .aari-foot-contact-row a[href^="mailto"]{font-size:16px !important;word-break:break-all}',
    '}'
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-aari-footer', '');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // ── Markup ────────────────────────────────────────────────────────────
  var year = new Date().getFullYear();
  var HTML = [
    '<footer class="aari-shared-footer">',
    '  <div class="aari-foot-hero">',
    '    <h3 class="aari-foot-h">Join the Aari Blog.<br><em>Florida TC notes.</em></h3>',
    '    <p class="aari-foot-sub">FR/Bar changes, compliance traps, operating notes. Built for agents who actually run files.</p>',
    '    <form class="aari-foot-form" name="aari-newsletter" method="POST" enctype="multipart/form-data" data-netlify="true" netlify-honeypot="bot-field" action="/thank-you.html">',
    '      <input type="hidden" name="form-name" value="aari-newsletter">',
    '      <p hidden><label>Don\'t fill this out: <input name="bot-field"></label></p>',
    '      <input type="email" name="email" class="aari-foot-input" placeholder="your@email.com" aria-label="Email" required>',
    '      <button type="submit" class="aari-foot-btn">Subscribe &rarr;</button>',
    '    </form>',
    '    <p class="aari-foot-consent">',
    '      <label><input type="checkbox" name="photo_consent" value="yes" form="aari-newsletter"> I agree Aari may use my submitted photo in marketing (optional)</label>',
    '    </p>',
    '  </div>',
    '',
    '  <div class="aari-foot-cols">',
    '    <div class="aari-foot-col">',
    '      <h5>Site</h5>',
    '      <a href="/">Home</a>',
    '      <a href="/index.html#pricing">Pricing</a>',
    '      <a href="/blog/">Blog</a>',
    '      <a href="/about.html">About</a>',
    '      <a href="/contact.html">Contact</a>',
    '    </div>',
    '    <div class="aari-foot-col">',
    '      <h5>For agents</h5>',
    '      <a href="/index.html#apply">Submit a file</a>',
    '      <a href="/pre-close-checklist.html">Pre-close checklist</a>',
    '      <a href="/tc-platforms.html">Compatible TC platforms</a>',
    '      <a href="https://aaritransactions.com/aari-referrals.html">Aari Referrals</a>',
    '      <a href="/index.html#faq">FAQ</a>',
    '    </div>',
    '    <div class="aari-foot-col">',
    '      <h5>Connect</h5>',
    '      <a href="/book.html">Book a call</a>',
    '      <a href="/refer.html">Introduce an agent</a>',
    '      <a href="https://www.instagram.com/aari.realty/" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px">',
    '        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.05" fill="currentColor" stroke="none"/></svg>',
    '        Instagram</a>',
    '      <a href="/portal">Portal</a>',
    '    </div>',
    '  </div>',
    '',
    '  <div class="aari-foot-contact-row">',
    '    <a href="tel:2396881770" style="display:block;font-size:28px;letter-spacing:0.5px;margin-bottom:6px">239.688.1770</a>',
    '    <a href="mailto:hello@aaritransactions.com" style="display:block;font-size:22px;letter-spacing:0.3px">hello@aaritransactions.com</a>',
    '  </div>',
    '  <div class="aari-foot-bottom">',
    '    <span>&copy; ' + year + ' Aari Transactions LLC &middot; All rights reserved &middot; Built in Florida &middot; <a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a></span>',
    '  </div>',
    '</footer>'
  ].join('\n');

  // ── Inject ────────────────────────────────────────────────────────────
  // Replace any existing <footer> on the page, or append before </body>.
  var oldFooter = document.querySelector('body > footer:not(.aari-shared-footer)');
  if (oldFooter) {
    oldFooter.outerHTML = HTML;
  } else {
    var div = document.createElement('div');
    div.innerHTML = HTML;
    document.body.appendChild(div.firstChild);
  }

  // ── Mobile accordion ──────────────────────────────────────────────────
  document.querySelectorAll('.aari-foot-col h5').forEach(function (h) {
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.setAttribute('aria-expanded', 'false');
    function toggle() {
      if (window.innerWidth >= 900) return;
      var expanded = h.parentElement.classList.toggle('expanded');
      h.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // ── Subscriber memory ─────────────────────────────────────────────────
  // After someone subscribes on this device, the capture form swaps to a
  // "You're on the list → Read the latest" state. New visitors always see
  // the email capture. Per-browser flag only — never blocks the capture.
  (function () {
    var KEY = 'aari_blog_subscribed';
    var form = document.querySelector('.aari-foot-form');
    if (!form) return;
    var consent = document.querySelector('.aari-foot-consent');
    var subscribed = false;
    try { subscribed = !!localStorage.getItem(KEY); } catch (e) {}
    if (subscribed) {
      // Known-subscriber hint BELOW the capture block — quiet status note,
      // never interrupts the pitch → form flow. Form always stays visible
      // (shared/office devices must still collect emails).
      var d = document.createElement('p');
      d.style.cssText = 'position:relative;z-index:2;font-size:12.5px;color:#6b6b6b;margin:18px 0 0';
      d.innerHTML = '&#10003; You&rsquo;re on the list. <a href="/blog/" style="color:#0a0a0a;font-weight:600;text-decoration:underline;text-underline-offset:3px">Read the latest &rarr;</a>';
      (consent || form).insertAdjacentElement('afterend', d);
    }
    // Email-aware submit: check the subscriber table first. Already on the
    // list → straight to the blog. New → capture via Netlify → thank-you.
    // If the check is unreachable, fall back to the plain Netlify submit.
    var SB_URL = 'https://fnlrgmuvtgwzjsihqxcn.supabase.co';
    var SB_KEY = 'sb_publishable_OsZVC29HKhFAZRNVo3yKqQ_wM7r2ANd';
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (form.querySelector('input[name="email"]') || {}).value || '';
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'One sec…'; }
      fetch(SB_URL + '/rest/v1/rpc/subscribe_blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
        body: JSON.stringify({ p_email: email })
      })
      .then(function (r) { if (!r.ok) throw new Error('rpc ' + r.status); return r.json(); })
      .then(function (already) {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        if (already === true) { window.location.href = '/blog/'; return; }
        var params = new URLSearchParams();
        new FormData(form).forEach(function (v, k) { params.append(k, v); });
        return fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
          .catch(function () {})
          .then(function () { window.location.href = '/thank-you.html'; });
      })
      .catch(function () {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        form.submit(); // native submit bypasses this handler → Netlify capture
      });
    });
  })();
})();

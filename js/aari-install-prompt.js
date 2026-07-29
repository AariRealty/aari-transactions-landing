/* ============================================================================
   Aari Transactions · Add-to-Home-Screen prompt
   ============================================================================
   Slides in a friendly bottom sheet that walks the user through pinning the
   portal to their home screen (mobile) or bookmarking/installing it (desktop).

   - Runs once. Any dismissal — "Yes, I saved it", "Maybe later", the X, or
     tapping the scrim — sets a permanent localStorage flag so it never nags
     again on that device.
   - Detects iOS Safari, Android Chrome, desktop Chrome/Edge (native install),
     desktop Safari (Add to Dock), and everything else (bookmark instructions).
   - Auto-hides on already-standalone (i.e. already installed).

   Usage:
     AariInstallPrompt.autoShow({ role: 'tc' | 'broker' | 'agent' });
   ============================================================================ */
(function () {
  'use strict';

  var CSS = [
    '.aip-scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;opacity:0;transition:opacity .28s ease;pointer-events:none}',
    '.aip-scrim.show{opacity:1;pointer-events:auto}',
    '.aip-sheet{position:fixed;left:0;right:0;bottom:0;background:#ffffff;border-radius:20px 20px 0 0;padding:28px 24px 32px;box-shadow:0 -12px 40px rgba(0,0,0,.24);z-index:9999;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;transform:translateY(100%);transition:transform .34s cubic-bezier(.22,.61,.36,1);max-width:520px;margin:0 auto}',
    '.aip-sheet.show{transform:translateY(0)}',
    // Desktop: center the sheet instead of docking to bottom.
    '@media(min-width:720px){.aip-sheet{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-40%);border-radius:20px;max-width:480px;width:calc(100vw - 40px)}.aip-sheet.show{transform:translate(-50%,-50%)}}',
    '.aip-close{position:absolute;top:14px;right:14px;background:#f2f2f0;border:none;color:#0f0f0f;font-size:20px;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;padding:0}',
    '.aip-close:hover{background:#e6e6e2}',
    '.aip-row{display:flex;gap:14px;align-items:center;margin-bottom:22px;padding-right:44px}',
    '.aip-icon{flex-shrink:0;width:64px;height:64px;border-radius:14px;background:#ffffff;border:1px solid #e8e8e6;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.aip-icon img{width:56px;height:56px;object-fit:contain;display:block}',
    '.aip-title{font-family:Cormorant Garamond,Georgia,serif;font-size:24px;font-weight:500;color:#0f0f0f;line-height:1.15;margin:0 0 4px;letter-spacing:-0.3px}',
    '.aip-sub{font-size:13.5px;color:#6b6b6b;margin:0;line-height:1.4}',
    '.aip-steps{margin:0 0 22px;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}',
    '.aip-step{display:flex;gap:12px;align-items:flex-start;font-size:14px;color:#0f0f0f;line-height:1.45}',
    '.aip-step-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#0f0f0f;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}',
    '.aip-step b{font-weight:600}',
    '.aip-share{display:inline-flex;align-items:center;gap:4px;color:#0a84ff;font-weight:600}',
    '.aip-share svg{width:16px;height:16px;flex-shrink:0}',
    '.aip-cta{width:100%;background:#0f0f0f;color:#fff;border:none;font-family:Inter,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.02em;padding:14px;border-radius:10px;cursor:pointer;transition:opacity .18s ease}',
    '.aip-cta:hover{opacity:0.9}',
    '.aip-later{width:100%;background:transparent;color:#6b6b6b;border:none;font-family:Inter,sans-serif;font-size:13px;padding:12px;cursor:pointer;margin-top:6px}',
    '.aip-later:hover{color:#0f0f0f}',
    '.aip-nudge{position:fixed;left:14px;right:14px;bottom:14px;background:#0f0f0f;color:#fff;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 28px rgba(0,0,0,.28);z-index:9997;font-family:Inter,sans-serif;transform:translateY(140%);transition:transform .3s cubic-bezier(.22,.61,.36,1);cursor:pointer;max-width:520px;margin:0 auto}',
    '.aip-nudge.show{transform:translateY(0)}',
    // Desktop nudge: right-aligned, more compact.
    '@media(min-width:720px){.aip-nudge{left:auto;right:20px;bottom:20px;max-width:360px;margin:0}}',
    '.aip-nudge-icon{flex-shrink:0;width:38px;height:38px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center}',
    '.aip-nudge-icon img{width:30px;height:30px;object-fit:contain}',
    '.aip-nudge-body{flex:1;min-width:0}',
    '.aip-nudge-t{font-size:13px;font-weight:600;color:#fff;margin:0;line-height:1.25}',
    '.aip-nudge-s{font-size:11.5px;color:rgba(255,255,255,.7);margin:0;line-height:1.35}',
    '.aip-nudge-x{flex-shrink:0;background:transparent;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:18px;padding:0;width:22px;height:22px;line-height:1}',
    '.aip-nudge-x:hover{color:#fff}'
  ].join('');

  var COPY = {
    tc: {
      title: 'Save the Aari TC hub to your device',
      sub: 'One tap to your file board, lock-screen alerts when a client submits.',
      nudgeTitle: 'Save Aari TC hub for one-tap access',
      nudgeSub: 'Tap to see how'
    },
    broker: {
      title: 'Save Aari Broker to your device',
      sub: 'One-tap access to the cockpit plus lock-screen alerts for website leads.',
      nudgeTitle: 'Save Aari Broker for one-tap access',
      nudgeSub: 'Tap to see how'
    },
    agent: {
      title: 'Save Aari to your device',
      sub: 'One tap to check on your files, no browser fumbling.',
      nudgeTitle: 'Save Aari to your device',
      nudgeSub: 'Tap to see how'
    }
  };

  var SHARE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v14"/><path d="M8 7l4-4 4 4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>' +
    '</svg>';

  function injectCss() {
    if (document.getElementById('aip-css')) return;
    var s = document.createElement('style');
    s.id = 'aip-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function isStandalone() {
    if (window.navigator && window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return false;
  }

  var UA = navigator.userAgent;
  function isIos() { return /iP(hone|ad|od)/.test(UA) && !window.MSStream; }
  function isAndroid() { return /Android/.test(UA); }
  function isMac() { return /Macintosh/.test(UA) && !isIos(); }
  function isChromiumDesktop() {
    // Chrome, Edge, Brave, Arc — anything Blink-based on desktop.
    return !isIos() && !isAndroid() && /(Chrome|Chromium|Edg|OPR)\//.test(UA);
  }
  function isSafariDesktop() {
    return isMac() && /Safari/.test(UA) && !/Chrome|Chromium|Edg|OPR/.test(UA);
  }

  var _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    // Chrome/Edge (Android + desktop): stash the event so we can trigger the
    // native prompt when the user taps the CTA.
    e.preventDefault();
    _deferredPrompt = e;
  });

  function stepsForEnvironment() {
    if (isIos()) {
      return [
        'Tap the <span class="aip-share">' + SHARE_SVG + 'Share</span> button at the bottom of Safari.',
        'Scroll down and tap <b>Add to Home Screen</b>.',
        'Tap <b>Add</b> in the top-right corner.'
      ];
    }
    if (isAndroid() && _deferredPrompt) {
      return [
        'Tap <b>Install app</b> below.',
        'Confirm in the Chrome prompt.'
      ];
    }
    if (isAndroid()) {
      return [
        'Open the Chrome menu (⋮).',
        'Tap <b>Install app</b> or <b>Add to Home Screen</b>.'
      ];
    }
    if (isChromiumDesktop() && _deferredPrompt) {
      return [
        'Tap <b>Install app</b> below.',
        'Confirm in the browser prompt.'
      ];
    }
    if (isChromiumDesktop()) {
      return [
        'Click the install icon in the address bar (looks like a small monitor).',
        'Or open the browser menu (⋮) and choose <b>Install Aari</b>.'
      ];
    }
    if (isSafariDesktop()) {
      return [
        'Open the <b>File</b> menu at the top of Safari.',
        'Choose <b>Add to Dock…</b> and confirm.'
      ];
    }
    // Generic fallback.
    return [
      'Open your browser menu.',
      'Choose <b>Install app</b>, <b>Add to Home Screen</b>, or bookmark this page.'
    ];
  }

  function ctaLabel() {
    if ((isChromiumDesktop() || isAndroid()) && _deferredPrompt) return 'Install app';
    return 'Yes, I saved it';
  }

  function showSheet(copy, permanentDismiss) {
    injectCss();
    var scrim = document.createElement('div');
    scrim.className = 'aip-scrim';
    var sheet = document.createElement('div');
    sheet.className = 'aip-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Save Aari to your device');

    var steps = stepsForEnvironment();
    var stepsHtml = steps.map(function (t, i) {
      return '<li class="aip-step"><span class="aip-step-num">' + (i + 1) + '</span><div>' + t + '</div></li>';
    }).join('');

    sheet.innerHTML =
      '<button type="button" class="aip-close" aria-label="Dismiss">&times;</button>' +
      '<div class="aip-row">' +
        '<div class="aip-icon"><img src="/images/aari-apple-touch-icon.png" alt="Aari"></div>' +
        '<div>' +
          '<h2 class="aip-title">' + copy.title + '</h2>' +
          '<p class="aip-sub">' + copy.sub + '</p>' +
        '</div>' +
      '</div>' +
      '<ul class="aip-steps">' + stepsHtml + '</ul>' +
      '<button type="button" class="aip-cta" id="aip-install">' + ctaLabel() + '</button>' +
      '<button type="button" class="aip-later">Don’t show this again</button>';

    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    requestAnimationFrame(function () {
      scrim.classList.add('show');
      sheet.classList.add('show');
    });

    function dismiss(markDone) {
      permanentDismiss();
      scrim.classList.remove('show');
      sheet.classList.remove('show');
      setTimeout(function () {
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
      }, 360);
    }

    scrim.addEventListener('click', function () { dismiss(false); });
    sheet.querySelector('.aip-close').addEventListener('click', function () { dismiss(false); });
    sheet.querySelector('.aip-later').addEventListener('click', function () { dismiss(false); });
    sheet.querySelector('#aip-install').addEventListener('click', async function () {
      if (_deferredPrompt) {
        try {
          _deferredPrompt.prompt();
          await _deferredPrompt.userChoice;
        } catch (_) {}
        _deferredPrompt = null;
      }
      dismiss(true);
    });
  }

  function showNudge(copy, onOpen, permanentDismiss) {
    injectCss();
    var nudge = document.createElement('div');
    nudge.className = 'aip-nudge';
    nudge.setAttribute('role', 'button');
    nudge.setAttribute('tabindex', '0');
    nudge.innerHTML =
      '<div class="aip-nudge-icon"><img src="/images/aari-apple-touch-icon.png" alt="Aari"></div>' +
      '<div class="aip-nudge-body">' +
        '<p class="aip-nudge-t">' + copy.nudgeTitle + '</p>' +
        '<p class="aip-nudge-s">' + copy.nudgeSub + '</p>' +
      '</div>' +
      '<button type="button" class="aip-nudge-x" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(nudge);
    requestAnimationFrame(function () { nudge.classList.add('show'); });

    function hide() {
      nudge.classList.remove('show');
      setTimeout(function () { if (nudge.parentNode) nudge.parentNode.removeChild(nudge); }, 320);
    }

    // Explicit X: permanently dismiss so it never comes back.
    nudge.querySelector('.aip-nudge-x').addEventListener('click', function (e) {
      e.stopPropagation();
      permanentDismiss();
      hide();
    });
    // Tap the body: open the full sheet.
    nudge.addEventListener('click', function () {
      hide();
      onOpen();
    });

    // Auto-hide after 14s without marking dismissed — so it can nudge again
    // on the next visit if the user ignored it entirely.
    setTimeout(hide, 14000);
  }

  function autoShow(opts) {
    opts = opts || {};
    var role = opts.role || 'tc';
    var storageKey = opts.storageKey || ('aari.install.dismissed.' + role);
    var copy = COPY[role] || COPY.tc;

    if (isStandalone()) return; // already installed
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch (_) { /* localStorage disabled — continue */ }

    function permanentDismiss() {
      try { localStorage.setItem(storageKey, String(Date.now())); } catch (_) {}
    }

    // Delay a beat so we don't fight the page's own onload work.
    setTimeout(function () {
      showNudge(copy, function () {
        showSheet(copy, permanentDismiss);
      }, permanentDismiss);
    }, 2200);
  }

  window.AariInstallPrompt = {
    autoShow: autoShow,
    showSheet: function (role) {
      var copy = COPY[role] || COPY.tc;
      var storageKey = 'aari.install.dismissed.' + role;
      showSheet(copy, function () {
        try { localStorage.setItem(storageKey, String(Date.now())); } catch (_) {}
      });
    },
    reset: function (role) {
      // Handy escape hatch: AariInstallPrompt.reset('tc') from the console
      // clears the dismissal flag so the nudge appears again on next load.
      try {
        var key = 'aari.install.dismissed.' + (role || 'tc');
        localStorage.removeItem(key);
      } catch (_) {}
    },
    isStandalone: isStandalone
  };
})();

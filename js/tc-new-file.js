/* Aari Transactions · TC cockpit "+ New File" launcher
   ---------------------------------------------------------------------------
   Adds a floating "+ New File" button to a TC cockpit (Eileen / Milennys /
   Marlenyi). Clicking it opens the coordinator's submit flow at /tc-submit.html.

   Why /tc-submit.html and not the public intake: the public intake at
   /index.html?modal-only=1#apply runs the outside-agent path and always ends at
   Stripe checkout. TC services bill at closing — a coordinator submitting on
   behalf of an in-house agent should never be prompted to pay. /tc-submit.html
   opens with the contract upload first, asks whose file it is (so credit
   attaches to the right agent's membership), scans the PDF, and drops the
   coordinator on the new file to confirm. No checkout screen. */
(function () {
  if (window.__aariNewFileLauncher) return;
  window.__aariNewFileLauncher = true;

  function build() {
    if (document.getElementById('aariNewFileBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'aariNewFileBtn';
    btn.type = 'button';
    btn.textContent = '+ New File';
    btn.setAttribute('aria-label', 'Submit a new file');
    btn.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:99998;' +
      'background:#0f0f0f;color:#fff;border:none;border-radius:999px;' +
      'padding:14px 22px;font:600 15px/1 system-ui,-apple-system,sans-serif;' +
      'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)';

    btn.addEventListener('click', function () {
      window.location.href = '/tc-submit.html';
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

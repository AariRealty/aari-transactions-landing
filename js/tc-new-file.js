/* Aari Transactions · TC cockpit "+ New File" launcher
   ---------------------------------------------------------------------------
   Adds a floating "+ New File" button to a TC cockpit (Eileen / Milennys /
   Marlenyi). Clicking it opens the EXISTING public intake full-screen via the
   index.html "?modal-only=1" mode (chrome hidden, intake modal only).

   Why navigation and not an iframe: index.html's modal-only close (×) logic is
   written for window.top === window.self (full page) and returns the user to
   the portal. Embedding it in an iframe is the path the codebase explicitly
   abandoned ("loads full-screen now, not in an iframe"), so the iframe rendered
   blank. Full-page navigation is the supported pattern — and matches the
   original window.open(..., '_self') instinct.

   Why it's still safe:
   - Same origin => the TC's Supabase session in localStorage carries through, so
     the intake auto-routes to the signed-in flow. No re-login, no auth token in
     the URL.
   - It does NOT modify index.html, the intake code, the Kanban, or any table.

   NOT YET DONE (separate step, by design): the post-submit "payment link" screen
   for TC submissions (needs submit-completion detection + the business rule that
   TC services bill at closing and have no Stripe link; only a-la-carte do). */
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
      window.location.href = '/index.html?modal-only=1#apply';
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

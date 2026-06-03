/* Aari Transactions · TC cockpit "+ New File" launcher
   ---------------------------------------------------------------------------
   Adds a floating "+ New File" button to a TC cockpit (Eileen / Milennys /
   Marlenyi). Clicking it opens the EXISTING public intake (/index.html#apply)
   INSIDE the cockpit via a same-origin iframe overlay.

   Why this is safe:
   - Same origin => the TC's Supabase session in localStorage is shared with the
     iframe, so the intake auto-routes to the signed-in flow. No re-login, no
     auth token in the URL, no redirect away from the cockpit.
   - It does NOT modify index.html, the intake code, the Kanban, or any table.
   - ?modal-only=1 is an existing index.html mode that hides page chrome and
     shows only the intake modal on a transparent background.

   NOT YET DONE (separate step, by design): the post-submit "payment link"
   screen for TC submissions. That needs submit-completion detection AND a
   business rule (TC services bill at closing => no Stripe link; only
   a-la-carte services have one). */
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

    var overlay = document.createElement('div');
    overlay.id = 'aariNewFileOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:none;background:rgba(15,15,15,.6)';
    overlay.innerHTML =
      '<button id="aariNewFileClose" aria-label="Close" ' +
      'style="position:fixed;top:16px;right:18px;z-index:100000;width:40px;height:40px;' +
      'border-radius:50%;border:none;background:#fff;color:#0f0f0f;font-size:22px;' +
      'line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)">&times;</button>' +
      '<iframe id="aariNewFileFrame" title="Submit a file" ' +
      'style="width:100%;height:100%;border:0;background:transparent" ' +
      'allow="clipboard-write"></iframe>';

    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    var frame = overlay.querySelector('#aariNewFileFrame');

    function open() {
      frame.src = '/index.html?modal-only=1#apply';
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
    function close() {
      overlay.style.display = 'none';
      frame.src = 'about:blank';
      document.body.style.overflow = '';
    }

    btn.addEventListener('click', open);
    overlay.querySelector('#aariNewFileClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display === 'block') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

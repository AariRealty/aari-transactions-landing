/* ============================================================================
   Aari Workspace Banner · "Where to?" hero-card navigation
   ============================================================================
   Self-mounting component. Drop the <script> on any logged-in workspace page
   (portal, broker-cockpit, tc-cockpit, aari-crm, pipeline, briefing) and the
   banner injects itself at the top of <body>.

   Approved design choices (May 2026):
     · Hero cards layout · 5 cards, icon + label
     · "View as" pills · default = user's actual role, pills let user switch
     · Universal 5 cards · same cards for every role
     · ADHD-optimized · low visual noise, predictable structure, big tap targets

   Destinations are placeholder until routing is approved · all currently
   point to existing inner pages. Update CARDS array when routing locks.
   ============================================================================ */
(function aariBanner(){
  'use strict';

  // ----- Card destinations (placeholder · update after routing approval) -----
  const CARDS = [
    { id:'start',    label:'Start my day',   href:'/briefing.html',       icon:iconSun(),  match:['/briefing'] },
    { id:'team',     label:'Run the team',   href:'/broker-cockpit.html', icon:iconUsers(),match:['/broker-cockpit','/tc-cockpit'] },
    { id:'clients',  label:'Track clients',  href:'/aari-crm.html',       icon:iconBook(), match:['/aari-crm','/crm'] },
    { id:'files',    label:'Work the files', href:'/pipeline.html',       icon:iconFolder(),match:['/pipeline'] },
    { id:'submit',   label:'Submit a file',  href:'/#apply',              icon:iconUpload(),match:[], intake:true },
  ];

  // ----- Inline SVG icons (no external font dependency) -----
  function iconSun(){return svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>');}
  function iconUsers(){return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');}
  function iconBook(){return svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>');}
  function iconFolder(){return svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');}
  function iconUpload(){return svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');}
  function svg(inner){return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';}

  // ----- CSS injected once -----
  const CSS = `
    :root{--awb-cream:#fbf9f4;--awb-ink:#0f0f0f;--awb-muted:#5f5e5a;--awb-line:rgba(15,15,15,0.12);--awb-line-soft:rgba(15,15,15,0.08)}
    #aari-banner{background:var(--awb-cream);border-bottom:0.5px solid var(--awb-line);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;position:sticky;top:60px;z-index:50}
    .awb-inner{max-width:1180px;margin:0 auto;padding:16px 24px 18px}
    .awb-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;flex-wrap:wrap}
    .awb-q{font-family:Georgia,'Cormorant Garamond',serif;font-size:22px;font-weight:500;color:var(--awb-ink);letter-spacing:-0.4px;margin:0}
    .awb-q em{font-style:italic;font-weight:500}
    .awb-pills-wrap{display:flex;align-items:center;gap:8px}
    .awb-pills-label{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--awb-muted);font-weight:600}
    .awb-pills{display:flex;gap:5px}
    .awb-pill{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:5px 11px;border:0.5px solid rgba(15,15,15,0.18);border-radius:999px;color:var(--awb-muted);background:#fff;cursor:pointer;font-family:inherit;transition:all 0.15s ease;-webkit-tap-highlight-color:transparent}
    .awb-pill:hover{border-color:var(--awb-ink);color:var(--awb-ink)}
    .awb-pill.active{background:var(--awb-ink);color:#fff;border-color:var(--awb-ink)}
    .awb-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
    .awb-card{background:#fff;border:1px solid var(--awb-line);border-radius:12px;padding:18px 10px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none;color:var(--awb-ink);transition:border-color 0.15s ease,transform 0.12s ease,background 0.15s ease;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .awb-card:hover{border-color:var(--awb-ink);transform:translateY(-1px)}
    .awb-card.active{background:var(--awb-ink);color:#fff;border-color:var(--awb-ink)}
    .awb-card.muted{opacity:0.4;cursor:not-allowed;pointer-events:none}
    .awb-card-ic{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;color:inherit}
    .awb-card-lbl{font-size:12.5px;font-weight:500;line-height:1.25;letter-spacing:0.1px;text-align:center}
    @media (max-width:899px){
      .awb-inner{padding:12px 16px 14px}
      .awb-q{font-size:18px}
      .awb-cards{grid-template-columns:repeat(2,1fr);gap:8px}
      .awb-cards .awb-card:last-child{grid-column:1 / -1}
      .awb-card{padding:14px 10px}
    }
  `;

  // ----- Build banner HTML for a given role -----
  function buildHTML(role){
    const cardsHtml = CARDS.map(c => {
      const url = window.location.pathname || '';
      const isActive = c.match.some(m => url.indexOf(m) === 0 || url.indexOf(m) >= 0);
      const cls = ['awb-card'];
      if(isActive) cls.push('active');
      // 'Run the team' is greyed for agent role
      if(role === 'agent' && c.id === 'team') cls.push('muted');
      const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
      return `<a class="${cls.join(' ')}" href="${c.href}"${intakeAttr}>
        <span class="awb-card-ic">${c.icon}</span>
        <span class="awb-card-lbl">${c.label}</span>
      </a>`;
    }).join('');

    // View-as pills moved to slim aari-header chrome (May 2026). Banner no longer renders them.
    const showPills = false;
    const pillsHtml = showPills ? `
      <div class="awb-pills-wrap">
        <span class="awb-pills-label">View as</span>
        <div class="awb-pills" data-awb-pills>
          <button class="awb-pill" data-awb-role="broker">Broker</button>
          <button class="awb-pill" data-awb-role="tc">TC</button>
          <button class="awb-pill" data-awb-role="agent">Agent</button>
        </div>
      </div>` : '';

    return `<div class="awb-inner">
      <div class="awb-head">
        <h1 class="awb-q">Where <em>to?</em></h1>
        ${pillsHtml}
      </div>
      <div class="awb-cards">${cardsHtml}</div>
    </div>`;
  }

  // ----- Determine current role · session override > actual profile role -----
  async function resolveRole(){
    // Session override (from "View as" pill click)
    let viewAs = null;
    try { viewAs = sessionStorage.getItem('aari-view-as'); } catch(_){}
    if(viewAs && ['broker','tc','agent'].indexOf(viewAs) >= 0){
      return { actual: await getActualRole(), viewing: viewAs };
    }
    const actual = await getActualRole();
    return { actual, viewing: actual };
  }
  async function getActualRole(){
    try {
      if(window.AariAuth && typeof window.AariAuth.getAgentProfile === 'function'){
        const profile = await window.AariAuth.getAgentProfile();
        if(profile && profile.role) return profile.role;
      }
    } catch(_){}
    return 'agent'; // safe default
  }

  // ----- Mount the banner -----
  async function mount(){
    // Inject CSS once
    if(!document.getElementById('aari-banner-css')){
      const style = document.createElement('style');
      style.id = 'aari-banner-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    // Remove existing banner (if re-mounting after view-as click)
    const existing = document.getElementById('aari-banner');
    if(existing) existing.remove();
    // Resolve role + render
    const { actual, viewing } = await resolveRole();
    const wrapper = document.createElement('div');
    wrapper.id = 'aari-banner';
    wrapper.innerHTML = buildHTML(viewing);
    // Mount AFTER the slim aari-header if present, so the header stays at the very top.
    // Fallback to body.firstChild for pages without the slim header (e.g. legacy pages).
    var headerEl = document.getElementById('aari-header');
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.insertBefore(wrapper, headerEl.nextSibling);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild);
    }
    // Mark the active pill (if pills are shown)
    if(actual === 'broker'){
      wrapper.querySelectorAll('.awb-pill').forEach(p => {
        if(p.getAttribute('data-awb-role') === viewing){
          p.classList.add('active');
        }
      });
    }
    bindPills(wrapper);
    bindIntake(wrapper);
  }

  function bindPills(wrapper){
    wrapper.querySelectorAll('.awb-pill').forEach(p => {
      p.addEventListener('click', e => {
        e.preventDefault();
        const role = p.getAttribute('data-awb-role');
        if(!role) return;
        try { sessionStorage.setItem('aari-view-as', role); } catch(_){}
        mount(); // re-render with the new viewing role
      });
    });
  }

  function bindIntake(wrapper){
    wrapper.querySelectorAll('[data-aw-intake]').forEach(a => {
      a.addEventListener('click', e => {
        // On the homepage with data-intake-trigger present, let the homepage handler take over.
        // Elsewhere, navigate to the homepage's apply hash so it opens the intake modal.
        if(window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')){
          // Let homepage's existing handler catch this · just trigger a click on a real intake button.
          const trigger = document.querySelector('[data-intake-trigger]');
          if(trigger){ e.preventDefault(); trigger.click(); return; }
        }
        // Otherwise navigate to homepage with #apply (homepage's hash handler opens the modal)
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

/* ============================================================================
   Aari Workspace Banner · "Where to?" list navigation
   ============================================================================
   Self-mounting component. Drop the <script> on any logged-in workspace page
   (portal, broker-cockpit, tc-cockpit, aari-crm, pipeline, briefing, files, etc.)
   and the banner injects itself at the top of <body>.

   Design (Direction 3 · July 2026):
     · Slim header · Aari. wordmark + user avatar
     · Status line · time-of-day greeting + what-needs-you sentence
     · Grouped list rows · line icon + label + arrow, hairline dividers only
     · No container cards · no colour · no emoji
     · White ground · light cream framing on header + footer strips only

   Rules locked in with Marlenyi:
     · Mostly white, a bit of light cream, a bit of black
     · Thin line icons, no fills, no colour
     · One accent = ink itself (bold + underline for alerts)
     · Section labels: DAILY / MANAGE / TOOLS
     · Same destinations as the prior tile-grid version — role filter unchanged.

   ============================================================================ */
(function aariBanner(){
  'use strict';

  // ----- Card destinations, now grouped by section for the list layout -----
  const CARDS = [
    // ---------- Broker ----------
    { id:'briefing',   section:'Daily',  label:'Morning briefing', sub:'Your day at a glance',       href:'/briefing.html',            icon:iconSun(),      match:['/briefing'],                        roles:['broker'] },
    { id:'files',      section:'Daily',  label:'Move the files',   sub:'Kanban · playbook',           href:'/files.html',               icon:iconFolder(),   match:['/files.html','/tc-cockpit','/pipeline'], roles:['tc','broker'] },
    { id:'team',       section:'Manage', label:'Run the team',     sub:'Roster · payroll',            href:'/broker-cockpit.html',      icon:iconUsers(),    match:['/broker-cockpit','/tc-cockpit'],   roles:['broker'] },
    { id:'prospecting',section:'Manage', label:'Fill the pipeline',sub:'BD · leads · outreach',       href:'/prospecting.html',         icon:iconBook(),     match:['/prospecting','/bd'],              roles:['broker'] },
    { id:'quality',    section:'Manage', label:'Service quality',  sub:'SLA + response time',         href:'/files-sla.html',           icon:iconChart(),    match:['/files-sla'],                      roles:['tc','broker'] },
    { id:'compliance', section:'Manage', label:'Defend the audit', sub:'Compliance risk · DBPR',      href:'/files-compliance.html',    icon:iconShield(),   match:['/files-compliance'],               roles:['broker'] },
    // ---------- Agent ----------
    { id:'submit',     section:'Daily',  label:'Submit a file',    sub:'Send us the contract',        href:'/index.html?modal-only=1#apply', icon:iconUpload(), match:['/agent-submit','/index.html#services'], roles:['agent'], primary:true },
    { id:'contacts',   section:'Daily',  label:'My contacts',      sub:'Buyer &amp; seller roster',   href:'/my-contacts.html',         icon:iconBook(),     match:['/my-contacts'],                    roles:['agent'] },
  ];

  // ----- Inline SVG icons -----
  function iconSun(){return svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>');}
  function iconUsers(){return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');}
  function iconBook(){return svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>');}
  function iconFolder(){return svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');}
  function iconUpload(){return svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');}
  function iconChart(){return svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');}
  function iconShield(){return svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');}
  function svg(inner){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';}

  // ----- CSS injected once -----
  const CSS = `
    :root{
      --awb-paper:#ffffff;
      --awb-cream:#faf7ef;
      --awb-ink:#0f0f0f;
      --awb-ink-2:#3d3a34;
      --awb-muted:#7a756c;
      --awb-muted-2:#a9a49a;
      --awb-line:#eae5d6;
    }
    #aari-banner{
      background:var(--awb-paper);
      border-bottom:1px solid var(--awb-line);
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      color:var(--awb-ink);
      position:relative;
      z-index:1;
    }
    .awb-shell{max-width:720px;margin:0 auto;padding:0}

    /* Slim brand row · Aari. wordmark + avatar */
    .awb-brandbar{
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 20px 12px;
      border-bottom:1px solid var(--awb-line);
    }
    .awb-brand{
      font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
      font-weight:700;font-size:22px;line-height:1;letter-spacing:-0.4px;
      color:var(--awb-ink);text-decoration:none;
    }
    .awb-brand .awb-dot{color:var(--awb-ink)}
    .awb-brand small{
      display:block;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;
      letter-spacing:2.2px;text-transform:uppercase;color:var(--awb-muted);margin-top:4px;
    }
    .awb-av{
      width:32px;height:32px;border-radius:50%;
      background:var(--awb-ink);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',sans-serif;font-size:12px;font-weight:700;
      text-decoration:none;flex:none;
    }

    /* Status line strip (cream) */
    .awb-status{
      padding:14px 20px 16px;background:var(--awb-cream);
      border-bottom:1px solid var(--awb-line);
    }
    .awb-status .l{
      font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;
      letter-spacing:1.8px;text-transform:uppercase;color:var(--awb-muted);
    }
    .awb-status .m{
      font-family:'Inter',sans-serif;font-size:14.5px;font-weight:600;
      color:var(--awb-ink);letter-spacing:-0.1px;line-height:1.4;margin-top:6px;
    }
    .awb-status .m .k{font-weight:800;border-bottom:1.5px solid var(--awb-ink);padding-bottom:1px}
    .awb-status .m a{color:var(--awb-ink);font-weight:800;text-decoration:underline;text-underline-offset:3px;margin-left:4px}

    /* Section label */
    .awb-gl{
      font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;
      letter-spacing:1.8px;text-transform:uppercase;color:var(--awb-muted);
      padding:16px 20px 4px;margin:0;
    }

    /* List rows · line icon + label + optional sub + arrow */
    .awb-list{padding:0 20px;background:var(--awb-paper);}
    .awb-list a{
      display:flex;align-items:center;gap:14px;
      padding:12px 0;border-bottom:1px solid var(--awb-line);
      text-decoration:none;color:var(--awb-ink);min-height:54px;
      -webkit-tap-highlight-color:transparent;
    }
    .awb-list a:last-child{border-bottom:0}
    .awb-list a:active{background:var(--awb-cream)}
    .awb-list a.active .n{font-weight:800}
    .awb-list a.active::before{
      content:'';position:absolute;left:0;width:3px;height:24px;
      background:var(--awb-ink);border-radius:2px;margin-top:-2px;
    }
    .awb-list a.active{position:relative;padding-left:6px;margin-left:-6px}
    .awb-list .ic{
      width:22px;height:22px;flex:none;color:var(--awb-ink);
      display:flex;align-items:center;justify-content:center;
    }
    .awb-list .ic svg{width:22px;height:22px}
    .awb-list .n{
      flex:1;font-family:'Inter',sans-serif;font-size:14.5px;font-weight:600;
      letter-spacing:-0.1px;line-height:1.2;
    }
    .awb-list .n small{
      display:block;font-family:'Inter',sans-serif;font-size:11px;
      color:var(--awb-muted);font-weight:500;margin-top:2px;letter-spacing:0;
    }
    .awb-list .arr{
      color:var(--awb-muted-2);font-size:16px;flex:none;line-height:1;
      font-family:'Inter',sans-serif;
    }

    /* Desktop tweaks · widen slightly, drop the fixed narrow width */
    @media (min-width:900px){
      .awb-shell{max-width:820px}
      .awb-brandbar{padding:16px 24px 14px}
      .awb-status{padding:16px 24px 18px}
      .awb-gl{padding:18px 24px 6px}
      .awb-list{padding:0 24px}
      .awb-list a{padding:14px 0;min-height:56px}
      .awb-list .n{font-size:15px}
    }
  `;

  // ----- Build banner HTML for a given role -----
  function buildHTML(role){
    const url = window.location.pathname || '';
    const visibleCards = CARDS.filter(c => !c.roles || c.roles.indexOf(role) >= 0);

    // Group by section, preserving insertion order (Daily first, then Manage, then anything else)
    const sectionOrder = ['Daily','Manage','Tools'];
    const bySection = {};
    visibleCards.forEach(c => {
      const s = c.section || 'Manage';
      (bySection[s] = bySection[s] || []).push(c);
    });

    const sectionsHtml = sectionOrder
      .filter(s => bySection[s] && bySection[s].length)
      .map(s => {
        const rows = bySection[s].map(c => {
          const isActive = c.match.some(m => url.indexOf(m) >= 0);
          const cls = isActive ? 'active' : '';
          const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
          const sub = c.sub ? '<small>' + c.sub + '</small>' : '';
          return '<a href="' + c.href + '" class="' + cls + '"' + intakeAttr + '>' +
            '<span class="ic">' + c.icon + '</span>' +
            '<span class="n">' + c.label + sub + '</span>' +
            '<span class="arr">›</span>' +
          '</a>';
        }).join('');
        return '<p class="awb-gl">' + s + '</p><div class="awb-list">' + rows + '</div>';
      }).join('');

    // Status line · time-of-day greeting.
    // TODO: swap the second sentence for a real derivation off files/deadlines when data is wired.
    const hour = new Date().getHours();
    const salut = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

    return '<div class="awb-shell">' +
      '<div class="awb-brandbar">' +
        '<a class="awb-brand" href="/portal">Aari<span class="awb-dot">.</span><small>Transactions</small></a>' +
        '<a class="awb-av" href="/portal" aria-label="Portal home" data-awb-av>M</a>' +
      '</div>' +
      '<div class="awb-status">' +
        '<div class="l">Today</div>' +
        '<div class="m">' + salut + ', <span class="k">ready to run the day</span>. Nothing urgent flagged yet.</div>' +
      '</div>' +
      sectionsHtml +
    '</div>';
  }

  // ----- Determine current role · session override > actual profile role -----
  async function resolveRole(){
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
    return 'agent';
  }

  // Get initial letter for the avatar circle
  async function getAvatarInitial(){
    try {
      if(window.AariAuth && typeof window.AariAuth.getAgentProfile === 'function'){
        const p = await window.AariAuth.getAgentProfile();
        const name = (p && (p.full_name || p.first_name || p.name || p.email)) || '';
        const letter = (name.trim()[0] || 'M').toUpperCase();
        return letter;
      }
    } catch(_){}
    return 'M';
  }

  // ----- Mount -----
  async function mount(){
    // The banner is the hub content · it should only render on the hub page itself
    // (briefing.html), which is where the aari-header topbar's "← Where to?" link
    // takes users. Everywhere else, the topbar alone provides navigation and the
    // banner would be duplicative chrome. Marlenyi flagged this on July 25 as
    // "way too much" when it was mounting on every workspace page. If a new hub
    // page is added later, extend the isHubPage check.
    const url = window.location.pathname || '';
    const isHubPage = url.indexOf('/briefing') >= 0;
    if (!isHubPage) return;

    if(!document.getElementById('aari-banner-css')){
      const style = document.createElement('style');
      style.id = 'aari-banner-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const existing = document.getElementById('aari-banner');
    if(existing) existing.remove();

    let { actual, viewing } = await resolveRole();
    // The agent portal (/portal) is the AGENT product · always shows agent rib
    if((window.location.pathname || '').indexOf('/portal') >= 0){ viewing = 'agent'; }

    // Self-reference check · if the only visible destination for this role IS the current page,
    // the banner is dead weight. Skip mounting.
    const visibleCards = CARDS.filter(c => !c.roles || c.roles.indexOf(viewing) >= 0);
    const isSelfReference = visibleCards.length === 1 &&
      visibleCards[0].match.some(m => url.indexOf(m) >= 0);
    if (isSelfReference) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'aari-banner';
    wrapper.innerHTML = buildHTML(viewing);

    var headerEl = document.getElementById('aari-header');
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.insertBefore(wrapper, headerEl.nextSibling);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild);
    }

    // Populate avatar initial (async so the banner mounts first)
    getAvatarInitial().then(function(letter){
      var av = wrapper.querySelector('[data-awb-av]');
      if (av) av.textContent = letter;
    });

    bindIntake(wrapper);
  }

  function bindIntake(wrapper){
    wrapper.querySelectorAll('[data-aw-intake]').forEach(a => {
      a.addEventListener('click', e => {
        if(window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')){
          const trigger = document.querySelector('[data-intake-trigger]');
          if(trigger){ e.preventDefault(); trigger.click(); return; }
        }
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

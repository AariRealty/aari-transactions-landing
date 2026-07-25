/* ============================================================================
   Aari Workspace Banner · ADHD-approved · two-tile hub
   ============================================================================
   Self-mounting component. Drop the <script> on any logged-in workspace page
   and the banner injects itself at the top of <body>.

   Design (July 25 · Marlenyi feedback: "not ADHD approved"):
     · Slim brand row · Aari. wordmark + user avatar
     · TWO large primary tiles · TC Portal + Agent Portal · the only things
       Marlenyi actually reaches for daily (she confirmed: "I mess with my
       time moving files inside of the portal" → TC Portal is #1 focus)
     · Single "More" toggle · everything else (Submit, Team, Prospecting,
       Quality, Compliance, Pipeline, Contacts, Reviews) collapses behind it
     · No TODAY status strip (cognitive noise)
     · No section headers, no sub-labels on collapsed rows

   Rules locked in with Marlenyi:
     · Mostly white, a bit of light cream, a bit of black
     · Thin line icons, no fills, no colour
     · One accent = ink itself
     · Roles overlap for broker/owner — brokers see everything.
   ============================================================================ */
(function aariBanner(){
  'use strict';

  // ---- Two primary tiles Marlenyi taps every day + a collapsed "More" pool ----
  // July 25: swapped TC Portal → Move the files. She barely uses TC Portal;
  // her daily reality is "moving files inside of the portal" so the file
  // kanban itself is what should occupy tile #1.
  const PRIMARY = [
    { id:'files', label:'Move the files', href:'/files.html',         icon:iconFolder(), match:['/files.html','/tc-cockpit'], roles:['tc','broker'] },
    { id:'agent', label:'Agent Portal',   href:'/aari-agent-crm.html',icon:iconUsers(),  match:['/aari-agent-crm'],            roles:['broker','agent'] },
  ];
  const MORE = [
    { id:'submit',     label:'Submit a file',     href:'/index.html?modal-only=1#apply', icon:iconUpload(), match:['/agent-submit'],       roles:['broker','agent'], intake:true },
    { id:'team',       label:'Run the team',      href:'/broker-cockpit.html',      icon:iconUsers(),  match:['/broker-cockpit'],     roles:['broker'] },
    { id:'prospecting',label:'Fill the pipeline', href:'/prospecting.html',         icon:iconBook(),   match:['/prospecting','/bd'],  roles:['broker'] },
    { id:'quality',    label:'Service quality',   href:'/files-sla.html',           icon:iconChart(),  match:['/files-sla'],          roles:['tc','broker'] },
    { id:'compliance', label:'Defend the audit',  href:'/files-compliance.html',    icon:iconShield(), match:['/files-compliance'],   roles:['broker'] },
    { id:'pipeline',   label:'Pipeline',          href:'/pipeline.html',            icon:iconChart(),  match:['/pipeline'],           roles:['broker'] },
    { id:'contacts',   label:'My contacts',       href:'/my-contacts.html',         icon:iconBook(),   match:['/my-contacts'],        roles:['broker','agent'] },
    { id:'reviews',    label:'Reviews',           href:'/aari-reviews.html',        icon:iconStar(),   match:['/aari-reviews'],       roles:['broker','agent'] },
  ];

  // ----- Inline SVG icons -----
  function iconUsers(){return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');}
  function iconBook(){return svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>');}
  function iconFolder(){return svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');}
  function iconUpload(){return svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');}
  function iconChart(){return svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');}
  function iconShield(){return svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');}
  function iconStar(){return svg('<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/>');}
  function iconChevron(){return svg('<polyline points="6 9 12 15 18 9"/>');}
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

    /* Slim brand row */
    .awb-brandbar{
      display:flex;align-items:center;justify-content:space-between;
      padding:16px 20px 14px;
      border-bottom:1px solid var(--awb-line);
    }
    .awb-brand{
      font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
      font-weight:700;font-size:24px;line-height:1;letter-spacing:-0.4px;
      color:var(--awb-ink);text-decoration:none;
    }
    .awb-brand .awb-dot{color:var(--awb-ink)}
    .awb-brand small{
      display:block;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;
      letter-spacing:2.2px;text-transform:uppercase;color:var(--awb-muted);margin-top:4px;
    }
    .awb-av{
      width:34px;height:34px;border-radius:50%;
      background:var(--awb-ink);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',sans-serif;font-size:13px;font-weight:700;
      text-decoration:none;flex:none;
    }

    /* HERO · two giant tap tiles */
    .awb-hero{
      display:grid;grid-template-columns:1fr 1fr;gap:14px;
      padding:22px 20px 6px;
    }
    .awb-hero a{
      display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;
      gap:26px;
      padding:22px 20px;
      background:var(--awb-cream);
      border:1px solid var(--awb-line);
      border-radius:18px;
      text-decoration:none;color:var(--awb-ink);
      min-height:150px;
      -webkit-tap-highlight-color:transparent;
      transition:transform .12s ease, background .12s ease;
    }
    .awb-hero a:active{transform:scale(0.98);background:#f3ecd8}
    .awb-hero a.active{background:var(--awb-ink);color:#fff;border-color:var(--awb-ink)}
    .awb-hero a.active .awb-hero-arr{color:#fff}
    .awb-hero .ic{width:36px;height:36px;color:var(--awb-ink)}
    .awb-hero a.active .ic{color:#fff}
    .awb-hero .ic svg{width:36px;height:36px}
    .awb-hero-foot{
      display:flex;align-items:flex-end;justify-content:space-between;width:100%;gap:8px;
    }
    .awb-hero .n{
      font-family:'Cormorant Garamond',Georgia,serif;
      font-size:22px;font-weight:600;letter-spacing:-0.4px;line-height:1.1;
    }
    .awb-hero-arr{font-size:22px;color:var(--awb-muted);line-height:1;font-family:'Inter',sans-serif}

    /* MORE toggle */
    .awb-more{padding:14px 20px 20px;}
    .awb-more-btn{
      display:flex;align-items:center;justify-content:space-between;
      width:100%;background:transparent;border:0;border-top:1px solid var(--awb-line);
      padding:16px 0 4px;cursor:pointer;
      font-family:'Inter',sans-serif;font-size:11px;font-weight:700;
      letter-spacing:2px;text-transform:uppercase;color:var(--awb-muted);
      -webkit-tap-highlight-color:transparent;
    }
    .awb-more-btn .awb-chev{width:14px;height:14px;transition:transform .18s ease}
    .awb-more-btn[aria-expanded="true"] .awb-chev{transform:rotate(180deg)}
    .awb-more-btn .awb-chev svg{width:14px;height:14px;stroke-width:2}

    .awb-more-panel{max-height:0;overflow:hidden;transition:max-height .25s ease}
    .awb-more-panel.open{max-height:800px}
    .awb-more-list{padding:6px 0 0;}
    .awb-more-list a{
      display:flex;align-items:center;gap:14px;
      padding:14px 0;border-bottom:1px solid var(--awb-line);
      text-decoration:none;color:var(--awb-ink);min-height:52px;
      -webkit-tap-highlight-color:transparent;
    }
    .awb-more-list a:last-child{border-bottom:0}
    .awb-more-list a:active{opacity:0.55}
    .awb-more-list a.active .n{font-weight:800}
    .awb-more-list .ic{width:22px;height:22px;color:var(--awb-ink);flex:none;display:flex;align-items:center;justify-content:center}
    .awb-more-list .ic svg{width:22px;height:22px}
    .awb-more-list .n{
      flex:1;font-family:'Inter',sans-serif;font-size:14.5px;font-weight:600;
      letter-spacing:-0.1px;line-height:1.2;
    }
    .awb-more-list .arr{color:var(--awb-muted-2);font-size:16px;flex:none;line-height:1;font-family:'Inter',sans-serif}

    /* Desktop tweaks · slightly wider, still calm */
    @media (min-width:900px){
      .awb-shell{max-width:820px}
      .awb-brandbar{padding:18px 24px 16px}
      .awb-hero{padding:26px 24px 8px;gap:18px}
      .awb-hero a{min-height:170px;padding:26px 24px}
      .awb-hero .n{font-size:24px}
      .awb-more{padding:16px 24px 24px}
    }
  `;

  // ----- Build banner HTML for a given role -----
  function buildHTML(role){
    const url = window.location.pathname || '';
    const visible = (list) => list.filter(c => !c.roles || c.roles.indexOf(role) >= 0);

    const primary = visible(PRIMARY);
    const more    = visible(MORE);

    const heroHtml = primary.map(c => {
      const isActive = c.match.some(m => url.indexOf(m) >= 0);
      const cls = isActive ? 'active' : '';
      const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
      return '<a href="' + c.href + '" class="' + cls + '"' + intakeAttr + '>' +
        '<span class="ic">' + c.icon + '</span>' +
        '<span class="awb-hero-foot">' +
          '<span class="n">' + c.label + '</span>' +
          '<span class="awb-hero-arr">›</span>' +
        '</span>' +
      '</a>';
    }).join('');

    const moreRows = more.map(c => {
      const isActive = c.match.some(m => url.indexOf(m) >= 0);
      const cls = isActive ? 'active' : '';
      const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
      return '<a href="' + c.href + '" class="' + cls + '"' + intakeAttr + '>' +
        '<span class="ic">' + c.icon + '</span>' +
        '<span class="n">' + c.label + '</span>' +
        '<span class="arr">›</span>' +
      '</a>';
    }).join('');

    const moreHtml = more.length ? (
      '<div class="awb-more">' +
        '<button type="button" class="awb-more-btn" data-awb-more-toggle aria-expanded="false" aria-controls="awb-more-panel">' +
          '<span>More</span>' +
          '<span class="awb-chev">' + iconChevron() + '</span>' +
        '</button>' +
        '<div class="awb-more-panel" id="awb-more-panel">' +
          '<div class="awb-more-list">' + moreRows + '</div>' +
        '</div>' +
      '</div>'
    ) : '';

    return '<div class="awb-shell">' +
      '<div class="awb-brandbar">' +
        '<a class="awb-brand" href="/portal">Aari<span class="awb-dot">.</span><small>Transactions</small></a>' +
        '<a class="awb-av" href="/portal" aria-label="Portal home" data-awb-av>M</a>' +
      '</div>' +
      '<div class="awb-hero">' + heroHtml + '</div>' +
      moreHtml +
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
    const url = window.location.pathname || '';

    if(!document.getElementById('aari-banner-css')){
      const style = document.createElement('style');
      style.id = 'aari-banner-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const existing = document.getElementById('aari-banner');
    if(existing) existing.remove();

    let { actual, viewing } = await resolveRole();

    // Self-reference check · if the only visible destinations are the current page,
    // the banner is dead weight. Skip mounting.
    const visible = PRIMARY.concat(MORE).filter(c => !c.roles || c.roles.indexOf(viewing) >= 0);
    const isSelfReference = visible.length && visible.every(c => c.match.some(m => url.indexOf(m) >= 0));
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

    getAvatarInitial().then(function(letter){
      var av = wrapper.querySelector('[data-awb-av]');
      if (av) av.textContent = letter;
    });

    bindMoreToggle(wrapper);
    bindIntake(wrapper);
  }

  function bindMoreToggle(wrapper){
    const btn = wrapper.querySelector('[data-awb-more-toggle]');
    const panel = wrapper.querySelector('#awb-more-panel');
    if(!btn || !panel) return;
    btn.addEventListener('click', function(){
      const open = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
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

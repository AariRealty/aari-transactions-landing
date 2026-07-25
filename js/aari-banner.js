/* ============================================================================
   Aari Workspace Banner · ADHD-approved · homepage-style top + tiles
   ============================================================================
   Self-mounting component. Drop the <script> on any logged-in workspace page
   and the banner injects itself at the top of <body>.

   Design (July 25 · Marlenyi feedback: "I need the same banner where the logo
   is on the homepage in this inner page. I don't feel like I have a homepage
   inside of the portal — it feels like a whole bunch of inner pages"):

     · Top nav matches aaritransactions.com homepage · cream sticky bar with
       the real Aari logo image + "Aari Transactions · Florida TC" wordmark
       on the left, avatar (initial) on the right.
     · A warm welcome hero below the nav · time-of-day greeting + first name.
       This is the piece that makes it FEEL like a home base, not chrome.
     · Two large tap tiles · Move the files + Agent Portal · her daily two.
     · Single "More" toggle · everything else collapses behind it.

   Rules locked in with Marlenyi:
     · Mostly white / cream / black. Thin line icons. No color.
     · Serif for greeting + logo wordmark. Inter for everything else.
   ============================================================================ */
(function aariBanner(){
  'use strict';

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

  // ----- CSS · mirrors the homepage .nav treatment (sticky cream bar,
  // backdrop blur, logo image + Aari Transactions wordmark)
  const CSS = `
    :root{
      --awb-paper:#ffffff;
      --awb-cream:#faf7ef;
      --awb-cream-2:#fbf9f4;
      --awb-ink:#0a0a0a;
      --awb-ink-2:#3d3a34;
      --awb-muted:#7a756c;
      --awb-muted-2:#a9a49a;
      --awb-line:#eae5d6;
      --awb-serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;
    }
    #aari-banner{
      background:var(--awb-paper);
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      color:var(--awb-ink);
      position:relative;
      z-index:1;
    }
    .awb-shell{max-width:720px;margin:0 auto;padding:0}

    /* ============ HOMEPAGE-STYLE TOP NAV ============ */
    .awb-nav{
      position:sticky;top:0;z-index:90;
      background:rgba(251,249,244,0.94);
      backdrop-filter:blur(10px);
      -webkit-backdrop-filter:blur(10px);
      border-bottom:1px solid var(--awb-line);
      padding:12px 0;
    }
    .awb-nav-wrap{
      max-width:720px;margin:0 auto;padding:0 20px;
      display:flex;align-items:center;justify-content:space-between;gap:14px;
    }
    .awb-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--awb-ink);flex:1;min-width:0}
    .awb-brand-logo{height:40px;width:auto;flex:none;display:block}
    .awb-brand-name{
      font-family:'Inter',sans-serif;font-weight:700;font-size:14px;
      color:var(--awb-ink);line-height:1.15;letter-spacing:-0.01em;
    }
    .awb-brand-name small{
      display:block;font-weight:500;font-size:10px;color:var(--awb-muted);
      letter-spacing:0.5px;margin-top:2px;
    }
    .awb-av{
      width:38px;height:38px;border-radius:50%;
      background:var(--awb-ink);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',sans-serif;font-size:14px;font-weight:700;
      text-decoration:none;flex:none;
    }

    /* ============ HOME HERO (welcome + first name) ============ */
    .awb-hero-welcome{
      padding:26px 20px 20px;
      background:linear-gradient(180deg, var(--awb-cream) 0%, transparent 100%);
    }
    .awb-hero-eb{
      font-family:'Inter',sans-serif;font-size:10px;font-weight:700;
      letter-spacing:2px;text-transform:uppercase;color:var(--awb-muted);
      display:block;margin-bottom:8px;
    }
    .awb-hero-h{
      font-family:var(--awb-serif);font-weight:600;
      font-size:34px;line-height:1.05;letter-spacing:-0.4px;color:var(--awb-ink);
    }
    .awb-hero-h em{font-style:italic;font-weight:500;color:var(--awb-ink-2)}

    /* ============ TWO PRIMARY TILES ============ */
    .awb-tiles{
      display:grid;grid-template-columns:1fr 1fr;gap:14px;
      padding:8px 20px 8px;
    }
    .awb-tiles a{
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
    .awb-tiles a:active{transform:scale(0.98);background:#f3ecd8}
    .awb-tiles a.active{background:var(--awb-ink);color:#fff;border-color:var(--awb-ink)}
    .awb-tiles a.active .awb-tile-arr{color:#fff}
    .awb-tiles .ic{width:36px;height:36px;color:var(--awb-ink)}
    .awb-tiles a.active .ic{color:#fff}
    .awb-tiles .ic svg{width:36px;height:36px}
    .awb-tile-foot{display:flex;align-items:flex-end;justify-content:space-between;width:100%;gap:8px}
    .awb-tiles .n{
      font-family:var(--awb-serif);
      font-size:22px;font-weight:600;letter-spacing:-0.4px;line-height:1.1;
    }
    .awb-tile-arr{font-size:22px;color:var(--awb-muted);line-height:1;font-family:'Inter',sans-serif}

    /* ============ MORE TOGGLE ============ */
    .awb-more{padding:14px 20px 24px}
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
    .awb-more-panel.open{max-height:900px}
    .awb-more-list{padding:6px 0 0}
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
      .awb-nav-wrap{max-width:820px;padding:0 24px}
      .awb-brand-logo{height:44px}
      .awb-brand-name{font-size:15px}
      .awb-hero-welcome{padding:34px 24px 24px}
      .awb-hero-h{font-size:44px}
      .awb-tiles{padding:8px 24px;gap:18px}
      .awb-tiles a{min-height:170px;padding:26px 24px}
      .awb-tiles .n{font-size:24px}
      .awb-more{padding:16px 24px 28px}
    }
  `;

  // ----- Build banner HTML -----
  function buildHTML(role, firstName){
    const url = window.location.pathname || '';
    const visible = (list) => list.filter(c => !c.roles || c.roles.indexOf(role) >= 0);

    const primary = visible(PRIMARY);
    const more    = visible(MORE);

    const tileHtml = primary.map(c => {
      const isActive = c.match.some(m => url.indexOf(m) >= 0);
      const cls = isActive ? 'active' : '';
      const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
      return '<a href="' + c.href + '" class="' + cls + '"' + intakeAttr + '>' +
        '<span class="ic">' + c.icon + '</span>' +
        '<span class="awb-tile-foot">' +
          '<span class="n">' + c.label + '</span>' +
          '<span class="awb-tile-arr">›</span>' +
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

    // Greeting · time-of-day + first name
    const hour = new Date().getHours();
    const salut = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    const name  = firstName ? (', ' + firstName) : '';

    return '' +
      // Homepage-style top nav
      '<div class="awb-nav">' +
        '<div class="awb-nav-wrap">' +
          '<a class="awb-brand" href="/portal" aria-label="Aari Transactions home">' +
            '<img class="awb-brand-logo" src="/images/aari-logo.png" alt="Aari Transactions">' +
            '<span class="awb-brand-name">Aari Transactions<small>Florida TC</small></span>' +
          '</a>' +
          '<a class="awb-av" href="/portal" aria-label="Portal home" data-awb-av>M</a>' +
        '</div>' +
      '</div>' +
      // Home content shell (welcome + tiles + more)
      '<div class="awb-shell">' +
        '<div class="awb-hero-welcome">' +
          '<span class="awb-hero-eb">Home</span>' +
          '<h1 class="awb-hero-h">' + salut + '<em>' + name + '</em>.</h1>' +
        '</div>' +
        '<div class="awb-tiles">' + tileHtml + '</div>' +
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

  async function getProfileBits(){
    try {
      if(window.AariAuth && typeof window.AariAuth.getAgentProfile === 'function'){
        const p = await window.AariAuth.getAgentProfile();
        const raw = (p && (p.first_name || p.full_name || p.name || p.email)) || '';
        const first = String(raw).trim().split(/\s+/)[0].split('@')[0] || '';
        const initial = (first[0] || 'M').toUpperCase();
        const nameCased = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
        return { firstName: nameCased, initial };
      }
    } catch(_){}
    return { firstName: '', initial: 'M' };
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

    const visible = PRIMARY.concat(MORE).filter(c => !c.roles || c.roles.indexOf(viewing) >= 0);
    const isSelfReference = visible.length && visible.every(c => c.match.some(m => url.indexOf(m) >= 0));
    if (isSelfReference) return;

    const profile = await getProfileBits();

    const wrapper = document.createElement('div');
    wrapper.id = 'aari-banner';
    wrapper.innerHTML = buildHTML(viewing, profile.firstName);

    var headerEl = document.getElementById('aari-header');
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.insertBefore(wrapper, headerEl.nextSibling);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild);
    }

    // Fill the avatar initial
    var av = wrapper.querySelector('[data-awb-av]');
    if (av) av.textContent = profile.initial;

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

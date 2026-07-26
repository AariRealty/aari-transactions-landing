/* ============================================================================
   Aari Workspace Banner · Mark 03 "Daily brief" · Marlenyi's pick July 25
   ============================================================================
   Self-mounting component. Drop the <script> on any logged-in workspace page
   and the banner injects itself at the top of <body>.

   Design (July 25 · she picked Mark 03 from /home-mocks.html):
     · Homepage-style nav · logo image + Aari Transactions wordmark + avatar
     · Personal daily brief · date on right, HOME eyebrow, serif greeting
       with first name
     · Aari pulse card · cream card with sage dot + status line + two stat
       blocks (files needing you / closing this week) — feels like a home
       dashboard, not chrome
     · Compact tile row · Move the files + Agent Portal side by side
     · More toggle · everything else (Submit, Team, Prospecting, Quality,
       Compliance, Pipeline, Contacts, Reviews) collapses behind "MORE ↓"

   Rules locked in with Marlenyi:
     · Mostly white / cream / black. Thin line icons. No color.
     · Serif for headings + wordmark. Inter for everything else.
   ============================================================================ */
(function aariBanner(){
  'use strict';

  const PRIMARY = [
    { id:'files', label:'Move the files', sub:'Kanban · playbook', href:'/files.html',         icon:iconFolder(), match:['/files.html','/tc-cockpit'], roles:['tc','broker'] },
    { id:'agent', label:'Agent Portal',   sub:'Leads · CRM',       href:'/aari-agent-crm.html',icon:iconUsers(),  match:['/aari-agent-crm'],            roles:['broker','agent'] },
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
  function esc(s){return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}

  const CSS = `
    :root{
      --awb-paper:#ffffff;
      --awb-cream:#faf7ef;
      --awb-ink:#0a0a0a;
      --awb-ink-2:#3d3a34;
      --awb-muted:#7a756c;
      --awb-muted-2:#a9a49a;
      --awb-line:#eae5d6;
      --awb-sage:#a4b8a6;
      --awb-serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;
    }
    #aari-banner{
      background:var(--awb-paper);
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      color:var(--awb-ink);
      position:relative;
      z-index:1;
    }
    /* Mobile · the aari-banner nav REPLACES the legacy #aari-header "Where to?"
       bar wherever the banner mounts. Kill it globally so we never stack two
       navs on top of each other. Desktop keeps aari-header untouched. */
    @media (max-width: 899px){
      #aari-header { display: none !important; }
    }

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
    /* Avatar button · shows headshot when profile.headshot_url exists,
       else falls back to the initial. Same treatment as the old
       aari-header so it feels continuous with the rest of the app. */
    .awb-av-wrap{position:relative;flex:none}
    .awb-av{
      width:38px;height:38px;border-radius:50%;
      background:var(--awb-ink);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',sans-serif;font-size:14px;font-weight:700;
      text-decoration:none;border:0;padding:0;cursor:pointer;
      overflow:hidden;transition:transform .15s ease, box-shadow .15s ease;
    }
    .awb-av:hover{transform:scale(1.05);box-shadow:0 2px 8px rgba(0,0,0,.15)}
    .awb-av:focus-visible{outline:2px solid var(--awb-ink);outline-offset:3px}
    .awb-av img{width:100%;height:100%;object-fit:cover;display:block}

    /* Dropdown menu · pinned under the avatar */
    .awb-menu{
      position:absolute;top:calc(100% + 10px);right:0;
      background:#fff;border:1px solid #e8e8e6;border-radius:12px;
      padding:6px;width:260px;
      box-shadow:0 12px 32px rgba(0,0,0,.14);
      display:none;z-index:100;
      font-family:'Inter',sans-serif;
    }
    .awb-menu.open{display:block}
    .awb-menu .who{padding:12px 12px 10px;border-bottom:1px solid #f0ede2;margin-bottom:6px}
    .awb-menu .who-name{font-size:14px;font-weight:700;letter-spacing:-0.1px;color:var(--awb-ink)}
    .awb-menu .who-role{font-size:11.5px;color:var(--awb-muted);margin-top:2px;font-weight:500}
    .awb-menu a{
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      padding:11px 12px;border-radius:8px;text-decoration:none;
      font-size:13.5px;font-weight:500;color:var(--awb-ink);
    }
    .awb-menu a:hover{background:var(--awb-cream)}
    .awb-menu .sep{height:1px;background:#f0ede2;margin:6px 4px}
    .awb-menu .signout{color:#a32d2d}
    .awb-menu .signout:hover{background:#faeaea}
    @media (max-width:600px){
      .awb-menu{right:-4px;left:auto;width:240px}
    }

    /* ============ DAILY BRIEF HERO ============ */
    .awb-brief{max-width:720px;margin:0 auto;padding:32px 20px 8px}
    .awb-brief-row{
      display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:14px;
    }
    .awb-brief-eb{
      font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--awb-muted);
    }
    .awb-brief-date{font-size:11px;color:var(--awb-muted);font-weight:500}
    .awb-brief-greet{
      font-family:var(--awb-serif);font-weight:500;font-size:34px;
      line-height:1.1;letter-spacing:-0.4px;color:var(--awb-ink);
    }
    .awb-brief-greet em{font-style:italic;color:var(--awb-ink-2)}

    /* ============ AARI PULSE CARD ============ */
    .awb-pulse{
      margin:22px 20px 0;max-width:calc(720px - 40px);margin-left:auto;margin-right:auto;
      background:var(--awb-cream);border:1px solid var(--awb-line);border-radius:18px;
      padding:22px 22px;
    }
    .awb-pulse-eb{
      display:flex;align-items:center;gap:8px;
      font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--awb-muted);
      margin-bottom:12px;
    }
    .awb-pulse-dot{width:8px;height:8px;border-radius:50%;background:var(--awb-sage)}
    .awb-pulse-h{
      font-family:var(--awb-serif);font-size:22px;font-weight:600;
      letter-spacing:-0.3px;line-height:1.25;color:var(--awb-ink);
    }
    .awb-pulse-h em{font-style:italic;color:var(--awb-ink-2)}
    .awb-pulse-stat{
      display:flex;gap:24px;margin-top:16px;padding-top:14px;border-top:1px solid var(--awb-line);
    }
    .awb-stat{flex:1}
    .awb-stat .num{
      font-family:var(--awb-serif);font-size:28px;font-weight:600;letter-spacing:-0.5px;line-height:1;
    }
    .awb-stat .lbl{
      font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;
      color:var(--awb-muted);margin-top:6px;display:block;
    }

    /* ============ COMPACT TILE ROW ============ */
    .awb-tiles{
      display:grid;grid-template-columns:1fr 1fr;gap:12px;
      padding:24px 20px 8px;max-width:720px;margin:0 auto;
    }
    .awb-tile{
      display:flex;justify-content:space-between;align-items:center;gap:10px;
      padding:20px 18px;background:var(--awb-paper);border:1px solid var(--awb-line);
      border-radius:16px;text-decoration:none;color:var(--awb-ink);min-height:96px;
      -webkit-tap-highlight-color:transparent;
      transition:transform .12s ease, background .12s ease;
    }
    .awb-tile:active{transform:scale(.98);background:var(--awb-cream)}
    .awb-tile.active{background:var(--awb-ink);color:#fff;border-color:var(--awb-ink)}
    .awb-tile.active .awb-tile-arr,
    .awb-tile.active .n small{color:rgba(255,255,255,0.65)}
    .awb-tile .ic{width:24px;height:24px;color:var(--awb-ink);flex:none}
    .awb-tile.active .ic{color:#fff}
    .awb-tile .ic svg{width:24px;height:24px}
    .awb-tile .n{
      flex:1;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;
      letter-spacing:-0.1px;line-height:1.2;
    }
    .awb-tile .n small{
      display:block;font-size:11px;font-weight:500;color:var(--awb-muted);
      margin-top:3px;letter-spacing:0;
    }
    .awb-tile-arr{color:var(--awb-muted);font-size:18px;line-height:1;font-family:'Inter',sans-serif;flex:none}

    /* ============ MORE TOGGLE ============ */
    .awb-more{max-width:720px;margin:0 auto;padding:8px 20px 32px}
    .awb-more-btn{
      display:flex;align-items:center;justify-content:center;gap:8px;
      width:100%;background:transparent;border:0;
      padding:22px 0 6px;cursor:pointer;
      font-family:'Inter',sans-serif;font-size:12px;font-weight:700;
      letter-spacing:1.4px;text-transform:uppercase;color:var(--awb-muted);
      -webkit-tap-highlight-color:transparent;
    }
    .awb-more-btn:hover{color:var(--awb-ink)}
    .awb-more-btn .awb-chev{width:12px;height:12px;transition:transform .18s ease;color:currentColor}
    .awb-more-btn[aria-expanded="true"] .awb-chev{transform:rotate(180deg)}
    .awb-more-btn .awb-chev svg{width:12px;height:12px;stroke-width:2}

    .awb-more-panel{max-height:0;overflow:hidden;transition:max-height .25s ease}
    .awb-more-panel.open{max-height:900px}
    .awb-more-list{padding:14px 0 0}
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

    /* Desktop tweaks */
    @media (min-width:900px){
      .awb-nav-wrap{max-width:820px;padding:0 24px}
      .awb-brand-logo{height:44px}
      .awb-brand-name{font-size:15px}
      .awb-brief{max-width:820px;padding:40px 24px 8px}
      .awb-brief-greet{font-size:42px}
      .awb-pulse{max-width:calc(820px - 48px);padding:26px 26px}
      .awb-pulse-h{font-size:24px}
      .awb-tiles{max-width:820px;padding:24px 24px 8px;gap:14px}
      .awb-tile{padding:22px 20px}
      .awb-more{max-width:820px;padding:8px 24px 40px}
    }
  `;

  // ----- Build banner HTML -----
  function buildHTML(role, profile, isHome){
    const url = window.location.pathname || '';
    const visible = (list) => list.filter(c => !c.roles || c.roles.indexOf(role) >= 0);
    const firstName = profile.firstName;

    const primary = visible(PRIMARY);
    const more    = visible(MORE);

    const tileHtml = primary.map(c => {
      const isActive = c.match.some(m => url.indexOf(m) >= 0);
      const cls = isActive ? 'awb-tile active' : 'awb-tile';
      const intakeAttr = c.intake ? ' data-aw-intake="true"' : '';
      const sub = c.sub ? '<small>' + c.sub + '</small>' : '';
      return '<a class="' + cls + '" href="' + c.href + '"' + intakeAttr + '>' +
        '<span class="ic">' + c.icon + '</span>' +
        '<span class="n">' + c.label + sub + '</span>' +
        '<span class="awb-tile-arr">›</span>' +
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
          '<span>More options</span>' +
          '<span class="awb-chev">' + iconChevron() + '</span>' +
        '</button>' +
        '<div class="awb-more-panel" id="awb-more-panel">' +
          '<div class="awb-more-list">' + moreRows + '</div>' +
        '</div>' +
      '</div>'
    ) : '';

    // Greeting + short date
    const now = new Date();
    const hour = now.getHours();
    const salut = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    const displayName = firstName || 'friend';
    const dayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    const monShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()];
    const hh = now.getHours() % 12 || 12;
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ampm = now.getHours() < 12 ? 'AM' : 'PM';
    const dateStr = dayShort + ' · ' + monShort + ' ' + now.getDate() + ' · ' + hh + ':' + mm + ' ' + ampm;

    // Top nav mounts on EVERY logged-in page — replaces the legacy
    // "Where to?" bar. Avatar is a real photo when profile.headshot_url is
    // present, else initial. Dropdown menu mirrors the old aari-header.
    const brokerLine = profile.role === 'broker'
      ? '<a href="/portal.html#agent-agreements" role="menuitem">Agent agreements</a>'
      : '';
    const navHtml =
      '<div class="awb-nav">' +
        '<div class="awb-nav-wrap">' +
          '<a class="awb-brand" href="/portal" aria-label="Aari Transactions home">' +
            '<img class="awb-brand-logo" src="/images/aari-logo.png" alt="Aari Transactions">' +
            '<span class="awb-brand-name">Aari Transactions<small>Florida TC</small></span>' +
          '</a>' +
          '<div class="awb-av-wrap">' +
            '<button type="button" class="awb-av" data-awb-av aria-haspopup="true" aria-expanded="false" aria-label="Open account menu">' +
              '<span data-awb-av-initial>' + esc(profile.initial) + '</span>' +
            '</button>' +
            '<div class="awb-menu" data-awb-menu role="menu">' +
              '<div class="who">' +
                '<div class="who-name">' + esc(profile.fullName) + '</div>' +
                '<div class="who-role">' + esc(profile.roleWord) + '</div>' +
              '</div>' +
              '<a href="/portal.html#recent-activity" role="menuitem">Recent activity</a>' +
              '<a href="/portal.html#membership" role="menuitem">Membership</a>' +
              '<a href="/portal.html#billing-documents" role="menuitem">Billing &amp; Documents</a>' +
              brokerLine +
              '<a href="/portal.html#profile" role="menuitem">Settings</a>' +
              '<div class="sep"></div>' +
              '<a href="#" class="signout" role="menuitem" data-awb-signout>Sign out</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Inner pages get JUST the nav — their own content is the reason she
    // visited (files list, agent CRM, pipeline, etc.). Only /portal renders
    // the full Mark 03 hub below.
    if (!isHome) return navHtml;

    // /portal home · full Mark 03 experience
    return navHtml +
      '<section class="awb-brief">' +
        '<div class="awb-brief-row">' +
          '<span class="awb-brief-eb">Home</span>' +
          '<span class="awb-brief-date">' + dateStr + '</span>' +
        '</div>' +
        '<h1 class="awb-brief-greet">' + salut + ',<br><em>' + displayName + '.</em></h1>' +
      '</section>' +
      '<div class="awb-pulse">' +
        '<div class="awb-pulse-eb"><span class="awb-pulse-dot"></span>The Aari pulse</div>' +
        '<div class="awb-pulse-h">Nothing urgent flagged. <em>The team is on it.</em></div>' +
        '<div class="awb-pulse-stat">' +
          '<div class="awb-stat"><div class="num">0</div><span class="lbl">Files needing you</span></div>' +
          '<div class="awb-stat"><div class="num">0</div><span class="lbl">Closing this week</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="awb-tiles">' + tileHtml + '</div>' +
      moreHtml;
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
        const fullName = (((p && p.first_name) || '') + ' ' + ((p && p.last_name) || '')).trim()
                          || (p && p.email) || nameCased || 'Account';
        const role = (p && p.role) ? String(p.role).toLowerCase() : 'agent';
        const roleWord = { broker:'Broker', tc:'Transaction Coordinator', agent:'Agent' }[role] || 'Agent';
        const headshot = (p && (p.headshot_url || p.avatar_url || p.photo_url)) || '';
        return { firstName: nameCased, initial, fullName, roleWord, role, headshot };
      }
    } catch(_){}
    return { firstName: '', initial: 'M', fullName: 'Account', roleWord: 'Agent', role: 'agent', headshot: '' };
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

    // /portal (and only /portal) gets the full Mark 03 hub. Inner pages get
    // just the top nav so their own content is the star.
    const isPortalHome = /^\/portal(?:\/|$|[?#])/.test(url);

    const wrapper = document.createElement('div');
    wrapper.id = 'aari-banner';
    wrapper.innerHTML = buildHTML(viewing, profile, isPortalHome);

    var headerEl = document.getElementById('aari-header');
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.insertBefore(wrapper, headerEl.nextSibling);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild);
    }

    populateAvatar(wrapper, profile);
    bindAvatarMenu(wrapper);
    bindMoreToggle(wrapper);
    bindIntake(wrapper);
  }

  function populateAvatar(wrapper, profile){
    var btn = wrapper.querySelector('[data-awb-av]');
    if (!btn) return;
    var initial = profile.initial || 'M';
    if (profile.headshot){
      var img = document.createElement('img');
      img.alt = profile.fullName || 'Account';
      img.onerror = function(){ btn.innerHTML = '<span data-awb-av-initial>' + esc(initial) + '</span>'; };
      img.src = profile.headshot;
      btn.innerHTML = '';
      btn.appendChild(img);
    } else {
      btn.innerHTML = '<span data-awb-av-initial>' + esc(initial) + '</span>';
    }
  }

  function bindAvatarMenu(wrapper){
    var btn  = wrapper.querySelector('[data-awb-av]');
    var menu = wrapper.querySelector('[data-awb-menu]');
    if (!btn || !menu) return;

    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function(e){
      if (!menu.contains(e.target) && !btn.contains(e.target)){
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    var so = menu.querySelector('[data-awb-signout]');
    if (so){
      so.addEventListener('click', function(e){
        e.preventDefault();
        try {
          if (window.AariAuth && typeof window.AariAuth.signOut === 'function'){
            Promise.resolve(window.AariAuth.signOut()).then(function(){ window.location.href = '/'; });
            return;
          }
        } catch(_){}
        window.location.href = '/';
      });
    }
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

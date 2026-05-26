/* ============================================================================
   Aari Transactions — Eileen Daily Summary (Cloudflare Worker)
   ----------------------------------------------------------------------------
   Trigger: cron · 22:00 UTC weekdays (6pm Eastern during EDT, 5pm during EST).
   Job:     pull today's BD activity from Supabase, compute funnel, email Marlenyi.
   Sends via Resend. Stores a daily_summaries row when the table exists.
   No npm deps — only native fetch + crypto.
   ============================================================================ */

// ──────────────── Hard-coded config ─────────────────────────────────────────
const SUPABASE_URL  = 'https://fnlrgmuvtgwzjsihqxcn.supabase.co';
const SUPABASE_ANON = 'sb_publishable_OsZVC29HKhFAZRNVo3yKqQ_wM7r2ANd';
const TO_EMAIL      = 'marlenyi@aarirealty.com';
// Resend default sandbox sender · works without domain verification.
// Upgrade to a verified domain (e.g. notifications@aaritransactions.com) when ready.
const FROM_EMAIL    = 'Aari Cockpit <onboarding@resend.dev>';

// Daily targets (mirror prospecting.html · day scope)
const TARGET_DMS    = 15;
const TARGET_DISCO  = 1;

// ──────────────── Worker entry ──────────────────────────────────────────────
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySummary(env));
  },
  // Manual test hook · GET https://<worker>/ to trigger on demand.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const result = await runDailySummary(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response('Aari Eileen daily summary worker. POST is for cron; GET /run to fire manually.', {
      headers: { 'content-type': 'text/plain' }
    });
  }
};

// ──────────────── Core ──────────────────────────────────────────────────────
async function runDailySummary(env) {
  const today = easternDate(new Date()); // YYYY-MM-DD in US/Eastern
  const subjectDate = formatPrettyDate(today);

  try {
    const stats = await fetchEileenStats(today);
    const subject = `Eileen · ${subjectDate} · ${stats.dms}/${TARGET_DMS} DMs · ${stats.raises} HR · ${stats.disco} DC · ${stats.signed} signed`;
    const html = renderEmailHtml(stats, today);
    const text = renderEmailText(stats, today);
    const sendResp = await sendResend(env, { subject, html, text });

    // Best-effort: persist a daily_summaries row. Silently skip on RLS / missing-table.
    try {
      await storeDailySummary(today, { ...stats, subject, sent_to: TO_EMAIL });
    } catch (storeErr) {
      console.log('[daily-summaries] skipped:', storeErr && storeErr.message);
    }

    return { ok: true, today, stats, sendResp };
  } catch (err) {
    console.error('[runDailySummary] error:', err && err.stack || err);
    // Fallback email so Marlenyi still hears from the worker.
    const subject = `Eileen · ${subjectDate} · auto-pull failed`;
    const body = `Couldn't auto-pull Eileen's data today. Check the cockpit.\n\nError: ${err && err.message || err}`;
    try {
      await sendResend(env, {
        subject,
        html: `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`,
        text: body
      });
    } catch (e2) {
      console.error('[fallback send] also failed:', e2 && e2.message);
    }
    return { ok: false, error: String(err && err.message || err) };
  }
}

// ──────────────── Supabase query ────────────────────────────────────────────
async function fetchEileenStats(today) {
  // Pull every bd_contacts row visible to the anon key. RLS may restrict this
  // exactly as it does in-browser; if so, see README "auth limitations".
  // Querying with last_touch_at >= today midnight Eastern is the closest proxy
  // to "today's activity" without needing an owner_id lookup.
  const startIso = easternMidnightIso(today);
  const url = `${SUPABASE_URL}/rest/v1/bd_contacts`
    + `?select=id,stage,created_at,last_touch_at`
    + `&or=(created_at.gte.${encodeURIComponent(startIso)},last_touch_at.gte.${encodeURIComponent(startIso)})`;

  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Accept: 'application/json'
    }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const rows = await resp.json();

  // DMs = contacts created today. (One DM per new contact · Eileen's workflow.)
  const dms     = rows.filter(r => r.created_at && r.created_at.startsWith(today)).length;
  // Stage counts are point-in-time (anyone now in the stage who was touched today).
  const raises  = rows.filter(r => r.stage === 'Hand Raise').length;
  const disco   = rows.filter(r => r.stage === 'Discovery' || r.stage === 'Discovery Booked').length;
  const signed  = rows.filter(r => r.stage === 'Signed').length;

  return {
    today,
    dms, raises, disco, signed,
    target_dms: TARGET_DMS, target_disco: TARGET_DISCO,
    sample_count: rows.length
  };
}

async function storeDailySummary(today, payload) {
  const url = `${SUPABASE_URL}/rest/v1/daily_summaries`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ summary_date: today, payload }])
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`store ${resp.status}: ${txt.slice(0, 200)}`);
  }
}

// ──────────────── Resend send ───────────────────────────────────────────────
async function sendResend(env, { subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY secret not set. Run: wrangler secret put RESEND_API_KEY');
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject,
      html,
      text
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Resend ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return await resp.json();
}

// ──────────────── Render ────────────────────────────────────────────────────
function renderEmailHtml(s, today) {
  const dmPct = s.dms >= s.target_dms ? 'Goal hit' : `${s.target_dms - s.dms} to go`;
  const dcPct = s.disco >= s.target_disco ? 'Goal hit' : `${s.target_disco - s.disco} to go`;
  return `
  <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;max-width:540px;color:#0f0f0f">
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:22px;margin:0 0 6px">Eileen &middot; ${formatPrettyDate(today)}</h2>
    <p style="font-size:12px;color:#88857C;letter-spacing:.06em;text-transform:uppercase;margin:0 0 16px">Daily Cockpit Summary</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background:#faf6ec;border-radius:8px">
      <tr>
        ${cell('DMs',         s.dms,    `/ ${s.target_dms} &middot; ${dmPct}`)}
        ${cell('Hand Raises', s.raises, 'today')}
        ${cell('Disco Calls', s.disco,  `/ ${s.target_disco} &middot; ${dcPct}`)}
        ${cell('Signed',      s.signed, 'today')}
      </tr>
    </table>
    <p style="font-size:11px;color:#b0aca3;margin-top:18px">Source: Supabase bd_contacts · ${s.sample_count} rows touched today. Sent by Cloudflare Worker cron.</p>
  </div>`;
}

function cell(label, val, ctx) {
  return `<td style="padding:14px 10px;text-align:center;width:25%">
    <div style="font-family:Montserrat,sans-serif;font-size:9.5px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#88857C">${label}</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:#0f0f0f;margin-top:4px">${val}</div>
    <div style="font-family:Montserrat,sans-serif;font-size:10.5px;color:#b0aca3;margin-top:4px">${ctx}</div>
  </td>`;
}

function renderEmailText(s, today) {
  return [
    `Eileen · ${formatPrettyDate(today)}`,
    `DMs:         ${s.dms} / ${s.target_dms}`,
    `Hand Raises: ${s.raises}`,
    `Disco Calls: ${s.disco} / ${s.target_disco}`,
    `Signed:      ${s.signed}`,
    ``,
    `Source: Supabase bd_contacts (${s.sample_count} rows touched today).`
  ].join('\n');
}

// ──────────────── Date helpers (US/Eastern) ─────────────────────────────────
function easternDate(d) {
  // Returns YYYY-MM-DD in America/New_York for the given Date.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

function easternMidnightIso(ymd) {
  // Convert a YYYY-MM-DD (Eastern) to a UTC ISO for midnight Eastern that day.
  // Eastern is UTC-4 (EDT) most of the year, UTC-5 (EST) Nov–Mar.
  // We approximate by computing the offset for "ymd 00:00 local" using formatToParts.
  const probe = new Date(`${ymd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit'
  }).formatToParts(probe);
  const easternHour = Number(parts.find(p => p.type === 'hour').value);
  // probe is 12:00 UTC; easternHour tells us how many hours behind Eastern is.
  const offsetHours = 12 - easternHour; // 4 in EDT, 5 in EST
  // Midnight Eastern = offsetHours:00 UTC the same calendar day.
  const hh = String(offsetHours).padStart(2, '0');
  return `${ymd}T${hh}:00:00.000Z`;
}

function formatPrettyDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

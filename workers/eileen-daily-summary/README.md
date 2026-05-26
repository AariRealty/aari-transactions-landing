# Eileen Daily Summary · Cloudflare Worker

Server-side cron that emails Marlenyi a daily Eileen BD funnel summary at
**6 PM Eastern (22:00 UTC), weekdays only**. Replaces the Cowork scheduled task
that only fires when Cowork is open.

---

## What it does

1. Cron fires at `0 22 * * 1-5` (UTC).
2. Worker pulls today's `bd_contacts` activity from Supabase REST.
3. Computes DMs / Hand Raises / Discovery / Signed vs daily targets.
4. Sends an HTML email via Resend to `marlenyi@aarirealty.com`.
5. Optionally writes a row to `daily_summaries` for the cockpit to pick up.
6. On failure, sends a plain fallback email so you still get a heartbeat.

Subject line:
`Eileen · May 26 · 12/15 DMs · 2 HR · 1 DC · 0 signed`

---

## One-time setup (do these in order)

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
wrangler --version    # confirm install
wrangler login        # opens browser → log in to your Cloudflare account
```

### 2. Create a Resend account (free tier · 3,000/mo)

1. Go to https://resend.com → sign up with `marlenyi@aarirealty.com`.
2. Resend → API Keys → **Create API Key** → name it `aari-eileen-cron`,
   permission `Sending access`. Copy the key (`re_...`) — you won't see it again.
3. Default sender `onboarding@resend.dev` works immediately; messages may land
   in spam until you add a verified domain (step 5, optional).

### 3. Add the Resend key as a Worker secret

```bash
cd "/Users/marlenyiparedes/Library/Mobile Documents/com~apple~CloudDocs/Cowork OS/Aari Transactions/Website/workers/eileen-daily-summary"
wrangler secret put RESEND_API_KEY
# paste the re_... key when prompted, hit enter
```

### 4. Deploy

```bash
wrangler deploy
```

Cloudflare prints the worker URL (e.g. `https://aari-eileen-daily-summary.<your-subdomain>.workers.dev`).
The cron is registered automatically from `wrangler.toml`.

### 5. (Optional) Move off the Resend sandbox sender

When you're ready for branded sending:

1. Resend → Domains → Add `aaritransactions.com`.
2. Add the DNS records Resend gives you (TXT + DKIM + return-path) at your registrar.
3. Wait for verification (usually <30 min).
4. Edit `src/index.js` → change `FROM_EMAIL` to
   `Aari Cockpit <notifications@aaritransactions.com>`.
5. Redeploy: `wrangler deploy`.

---

## Verifying it works

### Trigger manually (fastest)

```bash
curl https://aari-eileen-daily-summary.<your-subdomain>.workers.dev/run
```

Returns JSON with `ok: true` and the computed stats, and you should receive
the email within a few seconds.

### Tail live logs

```bash
wrangler tail
# in another terminal, hit the /run endpoint or wait for cron
```

### Check cron history in dashboard

Cloudflare dashboard → Workers & Pages → `aari-eileen-daily-summary` →
**Triggers → Cron** shows every fire (success/fail + duration).

---

## Operating notes

### Cron timing

The trigger is `0 22 * * 1-5` (22:00 UTC weekdays). That's:

- **6:00 PM Eastern during EDT** (mid-March → early November) — most of the year.
- **5:00 PM Eastern during EST** (early November → mid-March).

If you want a strict 6 PM year-round, add a second trigger at `0 23 * * 1-5`
and add an Eastern-hour gate inside `runDailySummary`. Not worth the
complexity unless the off-by-one-hour winter delivery actually matters.

### Auth / RLS limitation (READ THIS)

The worker uses the same Supabase anon key the browser uses. That means
**any RLS policy that blocks the unauthenticated browser will also block the
worker** — the worker has no session, no JWT, no `auth.uid()`. If the cockpit
shows numbers but the worker email is empty:

- Quickest fix: add an RLS policy on `bd_contacts` and `daily_summaries` that
  allows `SELECT` (and `INSERT` on `daily_summaries`) when the request is
  anon-keyed and matches some narrow predicate (e.g. `owner_id =
  '<eileen-uuid>'`).
- Better fix: mint a Supabase **service-role key**, store it as a separate
  worker secret (`SUPABASE_SERVICE_KEY`), and switch the auth headers in
  `fetchEileenStats` / `storeDailySummary` to use it. Service-role bypasses
  RLS — never expose it to the browser.

This is the same auth problem the Cowork task hit; we moved venues, not
solved it.

### `daily_summaries` table (optional)

If the table doesn't exist, the INSERT errors are caught and logged but
don't break the email. To enable summary storage, run:

```sql
CREATE TABLE IF NOT EXISTS daily_summaries (
  summary_date date PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
-- plus the appropriate INSERT policy for whichever key you're using
```

### Updating the worker

Edit `src/index.js`, then:

```bash
wrangler deploy
```

Changes are live within ~5 seconds. Wrangler does not auto-deploy from git.

### Disabling the cron

Comment out the `[triggers]` block in `wrangler.toml`, then `wrangler deploy`.
Or delete the worker from the Cloudflare dashboard.

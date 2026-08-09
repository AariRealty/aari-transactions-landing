# Aari Transactions · Email Automation · Deploy Runbook

**Stack:** Supabase (Postgres + Edge Functions + pg_cron) + Resend.
**Owner:** Marlenyi Paredes. **Implementer:** developer of record.
**Last updated:** 2026-05-12.

This folder is drop-in ready. Files are written for a fresh Supabase project. If your project already has tables for `tc_files`, `profiles`, `memberships`, `client_reviews`, leave them alone — the migration only adds new tables and triggers on top.

---

## What's in here

```
supabase/
├── migrations/
│   └── 20260512_email_automation.sql      ← run this once
├── functions/
│   ├── import_map.json                    ← Deno imports (Resend, React Email)
│   ├── _shared/
│   │   ├── resend.ts                      ← Resend client singleton
│   │   ├── supabase.ts                    ← Supabase admin client
│   │   └── send-email.ts                  ← centralized send + log helper
│   ├── _email-templates/
│   │   ├── _components/
│   │   │   ├── Layout.tsx
│   │   │   ├── BrandHeader.tsx
│   │   │   ├── BrandFooter.tsx
│   │   │   └── Button.tsx
│   │   ├── IntakeConfirmation.tsx         ← #1
│   │   ├── TcAssignmentPing.tsx           ← #2
│   │   ├── TcStatusPing.tsx               ← #3
│   │   ├── ReviewRequest.tsx              ← #4
│   │   ├── ReviewApprovedAgent.tsx        ← #5
│   │   ├── MembershipUpgrade.tsx          ← #6
│   │   ├── MembershipPaused.tsx           ← #7
│   │   ├── MembershipCancelled.tsx        ← #8
│   │   ├── WinBackDay30.tsx               ← #9a
│   │   ├── WinBackDay60.tsx               ← #9b
│   │   ├── WinBackDay90.tsx               ← #9c
│   │   └── AgentBroadcast.tsx             ← #10
│   ├── send-intake-confirmation/
│   ├── send-tc-assignment/
│   ├── send-tc-status-ping/
│   ├── send-review-request/
│   ├── send-review-approved/
│   ├── send-membership-event/
│   ├── send-win-back/
│   ├── send-agent-broadcast/
│   └── resend-webhook/                    ← inbound from Resend (delivery/bounce status)
```

---

## Deploy steps (in order)

### 1. Resend account + domain

1. Sign up at <https://resend.com> with `hello@aaritransactions.com`.
2. Add domain `aaritransactions.com`. Resend will give you 4 DNS records (SPF, DKIM, MX, DMARC). Add them to your DNS host. Wait for verification (15 min to 24 hours).
3. Generate an API key in Resend → API Keys → Create. Copy it.
4. (Optional) In Resend → Webhooks → Add endpoint → paste the URL of your `resend-webhook` edge function once deployed in step 6. Copy the signing secret if you want to validate signatures.

### 2. Supabase secrets

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxx
FROM_EMAIL=Aari Transactions <hello@aaritransactions.com>
REPLY_TO_EMAIL=marlenyi@aaritransactions.com
SITE_URL=https://aaritransactions.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxx   # optional
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 3. Database settings for cron + http_post

The migration uses `pg_net.http_post` to call edge functions from triggers and cron. Set these once per database:

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGc...';
```

Replace with your actual project URL and service role key. These are read by the `call_edge_function` helper inside the migration.

### 4. Run the migration

From the Supabase CLI (preferred):

```bash
supabase db push
```

Or paste `migrations/20260512_email_automation.sql` into the SQL Editor and run.

Verify:

```sql
SELECT * FROM email_log LIMIT 1;
SELECT * FROM email_preferences LIMIT 1;
SELECT * FROM cron.job;  -- should list win_back_daily, review_request_daily, pause_resume_reminder
```

### 5. Deploy edge functions

```bash
cd supabase
supabase functions deploy send-intake-confirmation --import-map functions/import_map.json
supabase functions deploy send-tc-assignment       --import-map functions/import_map.json
supabase functions deploy send-tc-status-ping      --import-map functions/import_map.json
supabase functions deploy send-review-request      --import-map functions/import_map.json
supabase functions deploy send-review-approved     --import-map functions/import_map.json
supabase functions deploy send-membership-event    --import-map functions/import_map.json
supabase functions deploy send-win-back            --import-map functions/import_map.json
supabase functions deploy send-agent-broadcast     --import-map functions/import_map.json
supabase functions deploy resend-webhook           --import-map functions/import_map.json --no-verify-jwt
```

Note: `resend-webhook` is deployed with `--no-verify-jwt` since Resend calls it without a Supabase auth header. Validate using the Resend signing secret instead (uncomment the verification block inside the function).

### 6. Wire the Resend webhook

In Resend → Webhooks → paste the URL of `resend-webhook` (visible in Supabase → Edge Functions → resend-webhook → Deploy URL). Enable events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`.

### 7. Smoke test

Run each function with a real payload via curl:

```bash
# Replace YOUR_ANON_KEY and YOUR_PROJECT with real values

curl -X POST \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"file_id":"00000000-0000-0000-0000-000000000001","agent_id":"YOUR_OWN_USER_ID"}' \
  https://YOUR_PROJECT.supabase.co/functions/v1/send-intake-confirmation
```

Use Marlenyi's own user ID for the agent so the test email lands in her inbox.

### 8. Watch the first 30 days

- Check `email_log` daily for failures: `SELECT status, count(*) FROM email_log GROUP BY 1;`
- Watch Resend dashboard for complaint rate. Threshold: < 0.1% complaints. If you spike above, pause the marketing category sends until you investigate.
- Watch deliverability. First week sends may go to Promotions tab in Gmail until reputation builds.

---

## Schema requirements (existing tables this code reads from)

The functions assume your existing schema includes these columns. If yours differs, adjust the SELECTs inside each edge function.

### `profiles`
- `id` (UUID, references auth.users)
- `first_name`, `last_name`, `email`, `phone`
- `review_preference` ('always' | 'ask_per_file' | 'never')

### `tc_files`
- `id`, `agent_id`, `tc_assigned_id`
- `status` (text, includes 'closed' as terminal state)
- `closed_at`, `created_at`
- `client_email`, `client_first_name`
- `property_address`, `transaction_type`
- `review_token` (signed token for client-review.html)
- `review_request_sent_at` (set after review request fires)
- `status_note` (optional free text)

### `memberships`
- `id`, `user_id`, `tier` ('starter' | 'producer' | 'aari_realty_agent')
- `status` ('active' | 'paused' | 'cancelled' | 'past_due')
- `next_renewal_at`, `pause_until`, `period_end_at`

### `client_reviews`
- `id`, `agent_id`, `status` ('pending' | 'approved' | 'rejected')
- `attribution_display`, `rating`, `body`

### `agent_engagement_view` (build this view)
- `id`, `first_name`, `email`
- `last_file_at` (timestamp of most recent tc_files row)
- `engagement_status` ('active' | 'warming' | 'cooling' | 'dormant')
- `is_top_earner` (boolean, top 10 by LTV)
- `member_tier` (joined from memberships)
- `unsub_token` (signed token for one-click unsubscribe)

The win-back and broadcast functions read from this view. Build it in your `tc_files` + `profiles` + `memberships` join.

---

## Compliance summary

| Rule | How we comply |
|---|---|
| **CAN-SPAM** | Physical address in footer. Unsubscribe link in all marketing. Clear from-name. No deceptive subject lines. |
| **Florida Chapter 475** | Emails signed with Marlenyi's name and Aari Transactions LLC in the footer. |
| **FTC Endorsement Guides** | Review-request email states attribution choice + pre-publish review. |
| **FREC** | No income claims. No guarantees. No fair-housing-triggering language. |
| **GDPR / CCPA** | `email_preferences` table for granular opt-out. One-click unsubscribe via `unsub_token`. Stored consent timestamps on review submission. |

---

## Common issues

**Email lands in spam.** SPF / DKIM / DMARC not propagated yet. Wait 24 hours after DNS edits.

**Function returns 500 with `RESEND_API_KEY is not set`.** Secret not added. See step 2.

**Trigger doesn't fire on INSERT.** `app.supabase_url` not set in database settings. See step 3.

**Cron didn't run.** `pg_cron` extension not enabled. Enable in Supabase → Database → Extensions.

**Review request didn't fire 24h after close.** Your `tc_files.closed_at` is null. The migration's BEFORE UPDATE trigger sets it automatically; backfill any pre-existing rows manually.

---

## Cost

| Component | Monthly | Notes |
|---|---|---|
| Resend Pro | $20 | 50,000 emails / month |
| Supabase Pro | $25 | Already on this plan |
| **Total incremental** | **$20** | Scales to ~5,000 active agents before next Resend tier |

---

## Contact

Implementation questions: dev of record.
Copy questions / template changes: Marlenyi (marlenyi@aaritransactions.com).

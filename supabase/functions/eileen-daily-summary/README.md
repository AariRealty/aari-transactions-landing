# eileen-daily-summary

Daily email to `marlenyi@aarirealty.com` summarizing Eileen's BD activity from `bd_contacts`.

- DMs sent today (target: 15)
- Hand raises today
- Discovery booked today (target: 1, includes legacy `Discovery` stage)
- Signed today
- Footer flag if any target missed

Sender: Resend. Recipient: `marlenyi@aarirealty.com`. Today's window: `America/New_York`. Scheduling: pg_cron weekdays at 22:00 UTC (6pm EDT).

---

## Setup (one-time)

1. Install Supabase CLI
   ```
   brew install supabase/tap/supabase
   ```

2. Log in
   ```
   supabase login
   ```

3. Link this project
   ```
   supabase link --project-ref fnlrgmuvtgwzjsihqxcn
   ```

4. Create a Resend account at https://resend.com (free tier: 3,000 emails/month, 100/day)

5. Generate a Resend API key, then set it as a Supabase secret
   ```
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   ```

6. Deploy the Edge Function
   ```
   supabase functions deploy eileen-daily-summary
   ```

7. Apply the cron migration
   ```
   supabase db push
   ```

8. Test manually (replace `SUPABASE_ANON_KEY` with the project anon key)
   ```
   curl -X POST https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/eileen-daily-summary \
     -H "Authorization: Bearer SUPABASE_ANON_KEY"
   ```
   You should get a `200` JSON body and an email in your inbox within ~10 seconds.

9. Verify cron is scheduled — run in the Supabase SQL editor
   ```sql
   select jobid, jobname, schedule, command from cron.job where jobname = 'eileen-daily-summary';
   ```

10. Tail logs
    ```
    supabase functions logs eileen-daily-summary
    ```

---

## How it works

- The function reads `SUPABASE_SERVICE_ROLE_KEY` from the runtime, so RLS is bypassed on `bd_contacts`. No auth issues.
- Today's window is computed in `America/New_York` and converted to UTC ISO strings before querying.
- Rows match if `created_at` OR `last_touch_at` falls in today's window.
- Discovery counts include both `Discovery` (legacy) and `Discovery Booked` (current) stage values.
- On any error (Supabase or Resend), a fallback email titled `Auto-pull failed today` is sent with the error message. Nothing fails silently.

---

## Scheduling caveat — DST

The cron schedule fires at `0 22 * * 1-5` UTC.

| Period | UTC 22:00 = | Result |
| --- | --- | --- |
| EDT (Mar – Nov) | 6pm Eastern | Correct |
| EST (Nov – Mar) | 5pm Eastern | One hour early |

**If you want exactly 6pm Eastern year-round**, add a second cron at `0 23 * * 1-5` and have the function read the current Eastern hour and skip if it isn't 18. Quick patch inside the function handler:

```ts
const easternHour = parseInt(
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()),
  10,
);
const calledByCron = req.method === "POST";
if (calledByCron && easternHour !== 18) {
  return jsonResponse(200, { ok: true, skipped: true, reason: `eastern hour=${easternHour}` });
}
```

For now we accept the one-hour drift in winter — Eileen's day ends earlier anyway.

---

## pg_cron Authorization — two approaches

The migration uses:

```sql
Authorization: 'Bearer ' || coalesce(current_setting('app.settings.supabase_service_role_key', true), '')
```

This requires `app.settings.supabase_service_role_key` to be set at the database level. If it isn't, the header will be `Bearer ` (empty string), which the Supabase function gateway may reject depending on your project's verify-JWT setting.

**Fallback if you hit auth errors:** hardcode the anon key into the SQL migration.

```sql
'Authorization', 'Bearer eyJhbGciOi...your-anon-key...'
```

The anon key is lower-privilege and safe to inline in DB-stored cron commands. The Edge Function itself uses `SUPABASE_SERVICE_ROLE_KEY` internally for the actual DB read, so the inbound call is just authenticating to the function gateway.

To check if the setting exists:
```sql
select current_setting('app.settings.supabase_service_role_key', true);
```

---

## Cost

$0. Supabase Edge Functions free tier covers this easily (1 invocation per weekday), and Resend's free tier (3,000/month) is far above 22 emails/month.

---

## Upgrade later

- **Custom sender domain.** Replace `onboarding@resend.dev` in `index.ts` with `eileen@aaritransactions.com` (or similar) after verifying the domain in Resend.
- **Per-owner segmentation.** Add a `WHERE owner_id = ...` filter if Eileen ever has separate BD pods.
- **Weekly rollup.** Add a second cron at `0 22 * * 5` that aggregates the week instead of the day.

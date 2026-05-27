# `aari-sa-pdf-email` Edge Function

## What it does

Receives a JSON POST from the website signature flow (`index.html`,
Path B2 signing step), then:

1. Builds a multi-page PDF of the **Aari Transactions Service Agreement
   v4.7** with the agent's info, the full SA text (sections 1–19,
   including § 1 Client Contact Limitation and § 4(h) Coordinator Error
   Resolution), and a signature block containing the agent's drawn
   signature image, typed name, signed-at timestamp, and ESIGN/UETA
   reference (Fla. Stat. § 668.50).
2. Emails the PDF as an attachment to the agent via **Resend**, BCC'd
   to `agreements@aaritransactions.com`.
3. Returns JSON `{ ok: true, bytes, filename, recipient }` on success,
   or `{ ok: false, error }` with HTTP 500 on failure.

The function is called **in addition to** (not in place of) the existing
Netlify form posts (`aari-sa-signature`, `aari-sa-agent-copy`). The
client-side call is fire-and-forget; a failure here does not block the
signing flow or the existing audit trail.

## Request shape

```json
{
  "agent_name": "Jane Doe",
  "agent_email": "jane@example.com",
  "agent_phone": "(239) 555-0100",
  "agent_license": "SL3123456",
  "agent_license_state": "FL",
  "agent_brokerage": "Example Realty",
  "signed_at_iso": "2026-05-27T18:30:00-04:00",
  "signed_at_display": "May 27, 2026 at 6:30 PM EDT",
  "signature_data_url": "data:image/png;base64,iVBORw0K...",
  "agreement_version": "4.7",
  "user_agent": "Mozilla/5.0 ...",
  "locale": "en-US"
}
```

`agent_name` and `agent_email` are required; everything else is
optional and will be rendered as best-effort if missing.

## Dependencies

- `pdf-lib@1.17.1` via `https://esm.sh/pdf-lib@1.17.1` (StandardFonts
  only — no external font files).
- Resend HTTP API (no SDK; called via `fetch` to
  `https://api.resend.com/emails`).

No imports from `_shared/` — this function is intentionally
self-contained so it can be deployed independently and called from the
browser without JWT verification.

## Deploy

```bash
# from Website/
supabase functions deploy aari-sa-pdf-email --no-verify-jwt
```

The `--no-verify-jwt` flag is required: this function is called from
the browser before the agent has authenticated their account (or even
if they never authenticate). CORS is permissive (`*`) for v1; tighten
to `https://aaritransactions.com` once stable.

## Secrets

The function requires the `RESEND_API_KEY` secret. This was set in
prior work — verify:

```bash
supabase secrets list
# should show RESEND_API_KEY
```

If missing, set it:

```bash
supabase secrets set RESEND_API_KEY=re_xxx_yourkey
```

## Test (curl)

```bash
PROJECT_URL="https://fnlrgmuvtgwzjsihqxcn.supabase.co"

curl -X POST "$PROJECT_URL/functions/v1/aari-sa-pdf-email" \
  -H 'Content-Type: application/json' \
  -d '{
    "agent_name": "Test Agent",
    "agent_email": "marlenyi@aarirealty.com",
    "agent_phone": "(239) 555-0100",
    "agent_license": "SL3123456",
    "agent_license_state": "FL",
    "agent_brokerage": "Aari Realty",
    "signed_at_iso": "2026-05-27T18:30:00-04:00",
    "signed_at_display": "May 27, 2026 at 6:30 PM EDT",
    "signature_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "agreement_version": "4.7",
    "user_agent": "curl/test",
    "locale": "en-US"
  }'
```

Watch logs:

```bash
supabase functions logs aari-sa-pdf-email --tail
```

## From sender (sandbox vs. production)

The function currently sends from `onboarding@resend.dev` — Resend's
**sandbox sender**. This works for testing and for sending to verified
team emails, but:

- **Deliverability will be poor** for unverified recipients (likely
  spam-foldered).
- **For production:** verify a domain in Resend (e.g.,
  `aaritransactions.com`), update the `from` field in `index.ts` to
  `noreply@aaritransactions.com` (or similar), and redeploy.

This is the single most important post-deployment upgrade — flag it
before any real agent signing.

## Limitations and gotchas

- **Signature data URL size.** A canvas PNG signature is typically
  50–200 KB. The data URL adds ~33% base64 overhead. Supabase Edge
  Function request bodies cap at ~6 MB, so the payload is well within
  limits, but if the canvas resolution is bumped up significantly,
  monitor for 413s.
- **Canvas element ID.** The client-side fetch reads
  `document.getElementById('sig-pad')`. If the signing UI changes the
  canvas ID or replaces it with a typed-only signature input, the
  `signature_data_url` will be empty and the PDF will render with
  "(No drawn signature provided)" in place of the image. The typed
  name and audit metadata are unaffected.
- **WinAnsi encoding.** The PDF uses `StandardFonts.Helvetica`, which
  only supports the WinAnsi character set. Smart quotes, em-dashes,
  the section symbol, and similar Unicode characters are mapped to
  ASCII equivalents in `sanitizeForWinAnsi()`. The SA text was
  pre-decoded from the HTML entities used in `index.html`.
- **No persistence.** This function generates the PDF on-the-fly and
  emails it — it does **not** save the PDF to Supabase Storage. If
  long-term audit storage is needed, chain a storage upload (or use
  the existing `record-signed-agreement` →
  `generate-signed-agreement-pdf` path which already writes to
  storage).
- **No retry on failure.** A Resend 500 returns 500 to the caller.
  Because the client calls this fire-and-forget, a failure surfaces
  only in the Edge Function logs. Monitor with `supabase functions
  logs aari-sa-pdf-email`.

## Follow-ups

- [ ] Verify Aari Transactions domain in Resend and switch `from` to
      `noreply@aaritransactions.com`.
- [ ] Tighten CORS from `*` to `https://aaritransactions.com` once
      domain is live.
- [ ] If any agents already signed under v4.6/v4.7 before this function
      was deployed, regenerate their signed copies by replaying their
      `agreement_signatures` rows through this endpoint.
- [ ] Add a daily log scan or alert on non-`ok` responses (currently
      only visible in `supabase functions logs`).

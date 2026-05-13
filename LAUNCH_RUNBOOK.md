# Aari Transactions · Launch-Day Runbook

**For:** Marlenyi Paredes (broker) + developer of record.
**Last updated:** 2026-05-12.
**Read this top to bottom on launch day.** Each step has a clear owner and a definition-of-done.

---

## Phase 0 · Pre-launch checks (do once, before anything else)

| # | Owner | Action | Done when |
|---|---|---|---|
| 0.1 | Marlenyi | Read every page on the live site one time and approve copy | You sign off on `index.html`, `about.html`, `contact.html`, `reviews.html`, `book.html`, `blog/*`, `refer.html`, `pre-close-checklist.html`, `portal.html`, `agent-submit.html`, `cancel-membership.html`, `privacy.html`, `terms.html` |
| 0.2 | Florida attorney | Review Privacy Policy + Terms of Service | Both signed off in writing (email is fine) |
| 0.3 | Marlenyi | Verify biBERK $1M E&O policy is active and covers TC operations | Certificate of Insurance saved to brokerage compliance binder |
| 0.4 | Marlenyi | Verify Stripe Producer Annual price line item is correct ($1,289/yr) | Price ID matches Stripe dashboard |

---

## Phase 1 · Email infrastructure (Marlenyi + dev)

| # | Owner | Action | Done when |
|---|---|---|---|
| 1.1 | Marlenyi | Sign up at resend.com using `hello@aaritransactions.com` | Account active, API key generated |
| 1.2 | Marlenyi | In Resend → Domains → Add domain → `aaritransactions.com` | Resend shows 4 DNS records to add |
| 1.3 | Marlenyi | Paste the 4 DNS records (SPF, DKIM, MX, DMARC) into your domain registrar | DNS shows propagated (use whatsmydns.net to verify) |
| 1.4 | Marlenyi | In Resend → verify domain | Status shows "Verified" |
| 1.5 | Marlenyi | Generate Resend API key, save in password manager | API key copied |
| 1.6 | Marlenyi | Share API key with dev via password manager (NOT email) | Dev has access |

---

## Phase 2 · Stripe operational config (Marlenyi)

| # | Owner | Action | Done when |
|---|---|---|---|
| 2.1 | Marlenyi | Enable Stripe Customer Portal in Stripe → Settings → Billing → Customer portal | Portal toggle on |
| 2.2 | Marlenyi | Allow: cancel subscription, pause subscription, update payment method | Settings saved |
| 2.3 | Marlenyi | Copy the Customer Portal URL from Stripe | URL in your clipboard |
| 2.4 | Marlenyi | Send the URL to your dev to paste into `portal.html` (replaces the `STRIPE_PORTAL_URL` placeholder) | Dev confirms it's wired |

---

## Phase 3 · Supabase deploy (developer)

Reference: `/supabase/README.md` has the full 8-step deploy. Execute in order:

| # | Owner | Action | Done when |
|---|---|---|---|
| 3.1 | Dev | Supabase project settings → Edge Functions → Secrets → add `RESEND_API_KEY`, `FROM_EMAIL`, `REPLY_TO_EMAIL`, `SITE_URL` | All secrets present |
| 3.2 | Dev | Set database settings: `ALTER DATABASE postgres SET app.supabase_url = '...';` and `app.supabase_service_role_key = '...';` | `SELECT current_setting('app.supabase_url')` returns the URL |
| 3.3 | Dev | Run `migrations/20260512_email_automation.sql` | `email_log` and `email_preferences` tables exist; cron jobs visible in `cron.job` |
| 3.4 | Dev | Run `migrations/20260512_agent_referrals.sql` | `agent_referrals` table exists |
| 3.5 | Dev | Add `unsub_token UUID UNIQUE DEFAULT gen_random_uuid()` column to `profiles` table | Column exists, all existing rows backfilled with UUIDs |
| 3.6 | Dev | Deploy all 9 edge functions: `supabase functions deploy ... --import-map functions/import_map.json` | Each function URL responds to a test POST |
| 3.7 | Dev | In Resend → Webhooks → Add endpoint pointing to `resend-webhook` edge function URL | Webhook events flow into `email_log` table |
| 3.8 | Dev | Smoke test: trigger `send-intake-confirmation` with Marlenyi as the agent | Test email arrives in her inbox |
| 3.9 | Dev | Deprecate old Firebase Realtime DB endpoint `aari-transactions-default-rtdb.firebaseio.com` | Old endpoint returns 404 or is disabled in Firebase console |

---

## Phase 4 · Image performance (dev or content team)

| # | Owner | Action | Done when |
|---|---|---|---|
| 4.1 | Dev | Verify every `<img>` tag in the codebase has `width` and `height` attributes set | Lighthouse CLS score < 0.1 |
| 4.2 | Dev | Compress hero images and large photos to WebP where supported | Total page weight < 500 KB on homepage |

---

## Phase 5 · Reviews seed (Marlenyi)

| # | Owner | Action | Done when |
|---|---|---|---|
| 5.1 | Marlenyi | Identify 3 recently-closed clients willing to give a review | 3 names in your CRM tagged "review candidate" |
| 5.2 | Marlenyi | Send the review link to each (via `client-review.html?t=...` signed token URL once email automation is live, OR manually) | 3 review submissions pending |
| 5.3 | Marlenyi | Approve all 3 reviews in `aari-reviews.html` staff moderation queue | All 3 visible on public `reviews.html` |
| 5.4 | Marlenyi | Save the FTC permission acknowledgments (email or written) to your compliance binder | Audit trail in writing for all 3 |

---

## Phase 6 · Analytics (Marlenyi + dev)

Recommend **Plausible** (privacy-friendly, no consent banner needed, ~$9/mo) over GA4. Snippets are already placeholder-ready across the site marked with `AARI:WIRE`.

| # | Owner | Action | Done when |
|---|---|---|---|
| 6.1 | Marlenyi | Sign up at plausible.io, add `aaritransactions.com` | Domain active in Plausible dashboard |
| 6.2 | Dev | Uncomment the Plausible script in `js/aari-analytics.js` (or add to all HTML files per the AARI:WIRE markers) | Pageviews flowing into Plausible |
| 6.3 | Marlenyi | Create custom events in Plausible for: `intake_submitted`, `book_call_clicked`, `referral_submitted`, `checklist_downloaded`, `membership_upgraded` | Events showing in Plausible Goals |

---

## Phase 7 · SEO + Search Console (Marlenyi)

| # | Owner | Action | Done when |
|---|---|---|---|
| 7.1 | Marlenyi | Verify `aaritransactions.com` in Google Search Console (DNS TXT record method) | Domain verified |
| 7.2 | Marlenyi | Submit `https://aaritransactions.com/sitemap.xml` in Search Console → Sitemaps | Status shows "Success" |
| 7.3 | Marlenyi | Request indexing on the 3 blog posts + homepage + reviews.html + pre-close-checklist.html | Each shows "Indexed" within 48 hours |
| 7.4 | Marlenyi | Set up Bing Webmaster Tools (same sitemap submission) | Optional but easy, free traffic |

---

## Phase 8 · Final smoke test (Marlenyi)

Before announcing launch, walk through the full agent journey end-to-end:

| # | Test path | Pass criteria |
|---|---|---|
| 8.1 | Visit homepage → click "Submit a File" → fill out intake → submit | Intake confirmation email arrives within 60 seconds |
| 8.2 | Sign up as a new agent (register.html) → log into portal | Portal loads with welcome state |
| 8.3 | Submit a Producer membership upgrade through Stripe checkout | Membership upgrade email arrives, portal reflects Producer tier |
| 8.4 | Submit a contact form via contact.html | Contact-type thank-you page renders, Marlenyi's inbox receives the message |
| 8.5 | Submit a referral via refer.html | Intro email sends to the peer, agent_referrals row created |
| 8.6 | Click "Open the checklist now" from exit modal | pre-close-checklist.html renders, print works |
| 8.7 | Visit a blog post on mobile | All 3 posts render correctly, related-posts links work |
| 8.8 | Visit a broken URL (e.g. /asdf.html) | 404.html renders with all 6 path-back cards |

If any test fails: hold launch, fix, re-test.

---

## Phase 9 · Go-live announcement (Marlenyi)

Once Phase 8 passes:

| # | Action |
|---|---|
| 9.1 | Update LinkedIn + Facebook with launch post + link to homepage |
| 9.2 | Email your existing client list with "we just relaunched" |
| 9.3 | Post the first blog post link in 2-3 Florida Realtor Facebook groups |
| 9.4 | Schedule the next blog post for 2 weeks out per `BLOG_STRATEGY.md` |
| 9.5 | Monitor `email_log` table daily for the first 30 days. Threshold for escalation: complaint rate > 0.1% |

---

## Rollback plan (if something is on fire)

| What broke | What to do |
|---|---|
| Email automation looping or sending duplicates | Dev disables the relevant edge function in Supabase dashboard (just unpublish; don't delete) |
| Stripe webhook firing incorrect events | Dev pauses the webhook endpoint in Stripe → Developers → Webhooks |
| Marketing campaign generating spam complaints | Dev sets `email_preferences.marketing = false` for the entire segment via direct SQL, then investigates |
| Site down / DNS issue | Marlenyi contacts hosting provider, dev confirms DNS records are intact |

---

## Reference paths (where everything lives)

- Website root: `/Users/marlenyiparedes/Library/Mobile Documents/com~apple~CloudDocs/Cowork OS/Aari Transactions/Website/`
- Email automation: `supabase/` (functions, migrations, README)
- Email automation spec: `EMAIL_AUTOMATION.md`
- Blog strategy: `BLOG_STRATEGY.md`
- Service Agreement v4.6 (signed): `Aari Transactions/aari-transactions-service-agreement.pdf`
- Brand assets: `images/` (og-cover.svg, og-cover-render.html)

---

**End of runbook.** Questions route to Marlenyi or the developer of record.

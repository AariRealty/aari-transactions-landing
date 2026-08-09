# Aari Transactions · Email Automation Architecture

**Status:** Spec locked, awaiting dev wire.
**Owner:** Marlenyi Paredes (broker) → developer of record.
**Last updated:** 2026-05-12.

---

## 1. Decisions locked

| Decision | Choice | Why |
|---|---|---|
| **Email provider** | Resend (resend.com) | Modern API, $20/mo for 50k emails, React Email template support, 10-min DNS setup. |
| **Runtime** | Supabase Edge Functions (Deno) | Already in stack. Same auth, same database, no separate hosting bill. |
| **Templates** | React Email components in `/supabase/functions/_email-templates/` | Brand-locked once, reused across all sends. |
| **Triggers** | Supabase database webhooks + `pg_cron` scheduled jobs | Webhooks fire on row events. Cron handles time-based queues (Day 30/60/90). |
| **From address** | `hello@aaritransactions.com` | Matches site footer. Replies route to Marlenyi's inbox. |
| **Reply-to** | `marlenyi@aaritransactions.com` (or shared inbox if added later) | Direct reply line, not no-reply. |
| **Sub-domain for sending** | `send.aaritransactions.com` | Isolates marketing/transactional reputation from primary domain MX. |
| **Logging** | Resend dashboard + `email_log` table in Supabase | Every send written to DB row for audit + retry. |

---

## 2. Architecture diagram (text)

```
┌──────────────────┐
│  Aari Website    │
│  (forms, portal, │
│   CRM, etc.)     │
└────────┬─────────┘
         │ INSERT / UPDATE
         ▼
┌──────────────────┐         ┌──────────────────────┐
│  Supabase DB     │────────▶│  pg_cron (scheduled) │
│  (Postgres)      │         │  - Day 30 win-back   │
│                  │         │  - Day 60 win-back   │
│  Tables:         │         │  - Review request    │
│  - tc_files      │         │    after closing     │
│  - profiles      │         └──────────┬───────────┘
│  - client_reviews│                    │
│  - memberships   │                    │
│  - email_log     │                    │
└────────┬─────────┘                    │
         │ Database webhook              │
         ▼                               ▼
┌────────────────────────────────────────────┐
│  Supabase Edge Functions (Deno)            │
│  /functions/                                │
│    send-intake-confirmation/index.ts        │
│    send-review-request/index.ts             │
│    send-win-back/index.ts                   │
│    send-membership-event/index.ts           │
│    send-agent-update/index.ts               │
│    send-tc-status-ping/index.ts             │
│    _email-templates/ (React Email)          │
│      IntakeConfirmation.tsx                 │
│      ReviewRequest.tsx                      │
│      WinBackDay30.tsx                       │
│      WinBackDay60.tsx                       │
│      WinBackDay90.tsx                       │
│      MembershipUpgrade.tsx                  │
│      MembershipPaused.tsx                   │
│      MembershipCancelled.tsx                │
│      AgentUpdate.tsx                        │
│      TcStatusPing.tsx                       │
└────────┬───────────────────────────────────┘
         │ POST /v1/emails
         ▼
┌────────────────────┐
│  Resend API        │──────▶ recipient inbox
│  send.aari...com   │
└────────┬───────────┘
         │ webhook (delivered/bounced/complained)
         ▼
┌────────────────────┐
│  Supabase DB       │
│  email_log table   │
│  updated with      │
│  delivery status   │
└────────────────────┘
```

---

## 3. The 10 transactional emails

Each row maps directly to an `AARI:WIRE` comment already in the codebase.

| # | Email | Trigger | From page | Recipient | Send window |
|---|---|---|---|---|---|
| 1 | **Intake confirmation** | New row in `tc_files` table | `index.html` intake modal | Agent (submitter) | Immediate (< 60 sec) |
| 2 | **TC assignment ping** | `tc_files.tc_assigned_id` populated | `aari-crm.html` (TC assigns) | Agent + assigned TC | Immediate |
| 3 | **TC status ping** | `tc_files.status` changes to milestone | `tc-cockpit.html` (TC updates) | Agent (file owner) | Immediate |
| 4 | **Review request to client** | `tc_files.status` = `closed` AND agent consent | Server-side cron after closing | Client (buyer or seller) | 24 hours post-close |
| 5 | **Review approved → agent notification** | `client_reviews.status` = `approved` | `aari-reviews.html` (broker) | Agent of record | Immediate |
| 6 | **Membership upgrade success** | `memberships.tier` changes to `producer` | Stripe webhook | Agent | Immediate |
| 7 | **Membership paused** | `memberships.status` = `paused` | `cancel-membership.html` | Agent | Immediate + 2-day reminder before resume |
| 8 | **Membership cancelled** | `memberships.status` = `cancelled` | `cancel-membership.html` | Agent | Immediate |
| 9 | **Win-back Day 30/60/90** | `pg_cron` daily scan of inactive agents | `aari-crm.html` win-back queue | Agent | Cron, off-hours |
| 10 | **Agent broadcast** | Manual trigger by broker | `aari-crm.html` Templates tab | Agent segment | On-demand |

---

## 4. Code structure

```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── resend.ts                  # Resend client singleton
│   │   ├── log-email.ts               # writes to email_log
│   │   └── render-template.tsx        # React Email render helper
│   ├── _email-templates/
│   │   ├── IntakeConfirmation.tsx
│   │   ├── TcStatusPing.tsx
│   │   ├── ReviewRequest.tsx
│   │   ├── WinBackDay30.tsx
│   │   ├── WinBackDay60.tsx
│   │   ├── WinBackDay90.tsx
│   │   ├── MembershipUpgrade.tsx
│   │   ├── MembershipPaused.tsx
│   │   ├── MembershipCancelled.tsx
│   │   ├── AgentBroadcast.tsx
│   │   └── _components/
│   │       ├── BrandHeader.tsx        # Aari wordmark + tagline
│   │       ├── BrandFooter.tsx        # Florida broker stamp + unsubscribe
│   │       ├── Button.tsx
│   │       └── Divider.tsx
│   ├── send-intake-confirmation/
│   │   └── index.ts
│   ├── send-tc-status-ping/
│   │   └── index.ts
│   ├── send-review-request/
│   │   └── index.ts
│   ├── send-win-back/
│   │   └── index.ts
│   ├── send-membership-event/
│   │   └── index.ts
│   └── send-agent-broadcast/
│       └── index.ts
└── migrations/
    └── YYYYMMDD_email_log.sql
```

---

## 5. Database schema additions

### `email_log` table

```sql
CREATE TABLE public.email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type      TEXT NOT NULL,          -- 'intake_confirmation', etc.
  to_address      TEXT NOT NULL,
  to_user_id      UUID REFERENCES auth.users(id),
  related_file_id UUID REFERENCES tc_files(id),
  resend_id       TEXT,                   -- Resend API message ID
  status          TEXT DEFAULT 'queued',  -- queued, sent, delivered, bounced, complained, failed
  subject         TEXT,
  template        TEXT,                   -- which React Email template
  payload         JSONB,                  -- variables used in render
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_log_user ON email_log(to_user_id);
CREATE INDEX idx_email_log_status ON email_log(status);
CREATE INDEX idx_email_log_type_created ON email_log(email_type, created_at DESC);
```

### `email_preferences` table (per-user opt-outs)

```sql
CREATE TABLE public.email_preferences (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id),
  transactional      BOOLEAN DEFAULT true,   -- intake conf, status pings (cannot opt out fully — required)
  marketing          BOOLEAN DEFAULT true,   -- win-back, broadcasts
  review_requests    BOOLEAN DEFAULT true,
  unsubscribed_at    TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Environment variables

Set in Supabase Dashboard → Edge Functions → Secrets:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxx
FROM_EMAIL=hello@aaritransactions.com
REPLY_TO_EMAIL=marlenyi@aaritransactions.com
SITE_URL=https://aaritransactions.com
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 7. DNS records for Resend domain verification

Add to DNS provider (likely whoever holds `aaritransactions.com`):

```
TYPE   NAME                              VALUE
TXT    send.aaritransactions.com         v=spf1 include:amazonses.com ~all
TXT    resend._domainkey                 (DKIM key provided by Resend)
TXT    _dmarc.aaritransactions.com       v=DMARC1; p=none; rua=mailto:dmarc@aaritransactions.com
MX     send.aaritransactions.com         10 feedback-smtp.us-east-1.amazonses.com
```

After DNS propagates (15 min to 24 hours), verify in Resend dashboard → Domains → Verify.

---

## 8. Trigger map · which page/event fires which email

### Site-side triggers (from existing pages)

| Page | Event | Email # | Database action |
|---|---|---|---|
| `index.html` intake modal | Submit | #1 Intake confirmation | `INSERT INTO tc_files` → webhook fires |
| `index.html` intake modal | Submit | #1 also CC to Marlenyi | Same webhook, dual-recipient template |
| `agent-submit.html` (agent intake) | Submit | #1 (variant) | Same path, different template variant |
| `cancel-membership.html` | Pause confirmed | #7 Paused | `UPDATE memberships SET status='paused'` |
| `cancel-membership.html` | Cancel confirmed | #8 Cancelled | `UPDATE memberships SET status='cancelled'` |
| `portal.html` | Upgrade click → Stripe checkout success | #6 Upgrade | Stripe webhook → `UPDATE memberships SET tier='producer'` |
| `client-review.html` | Public review submitted | (none to client) | `INSERT INTO client_reviews status='pending'` |
| `aari-reviews.html` | Broker approves | #5 Notify agent | `UPDATE client_reviews SET status='approved'` |
| `aari-crm.html` | Win-back template send | #10 Broadcast | Manual trigger, queued send |
| `tc-cockpit.html` | TC marks milestone done | #3 Status ping | `UPDATE tc_files SET status=X` |
| `aari-crm.html` (TC tab) | TC assigned to file | #2 Assignment ping | `UPDATE tc_files SET tc_assigned_id=Y` |

### Cron-based triggers

| Frequency | Email # | Logic |
|---|---|---|
| Daily 9am ET | #9 Win-back Day 30 | Scan agents whose last `tc_files.created_at` is 28–32 days old, no email sent in last 30 days, `email_preferences.marketing = true`. |
| Daily 9am ET | #9 Win-back Day 60 | Same logic, 58–62 days. |
| Daily 9am ET | #9 Win-back Day 90 | Same logic, 88–92 days. After Day 90, agent moves to "Gone" in CRM. |
| Daily 10am ET | #4 Review request | Scan `tc_files` where `status='closed'` AND `closed_at` was 24 hours ago AND agent's `review_preference` allows it. |
| 2 days before pause resume | #7 reminder | Scan `memberships` where `status='paused'` AND `pause_until` is 2 days away. |

---

## 9. Template content map (Cattoni voice rules)

Every email template MUST follow:
- **Subject line**: ≤ 50 characters, no exclamation marks, no emoji.
- **Opening line**: name the recipient + the specific event. No "Hi there."
- **Body**: ≤ 120 words. Period stops. One ask.
- **CTA**: One button. Black on cream. Inter font.
- **Footer**: Aari Transactions LLC · unsubscribe link (marketing only, not transactional).
- **No emoji. No em-dashes. No filler.**

### Example · #1 Intake Confirmation

```
Subject: We have your file. Here's what's next.

Hi {first_name},

Your TC intake landed at {timestamp}. File ID #{file_id}.

A coordinator will be assigned within one business day. You'll get a second email with their name and a direct line the moment that happens.

If anything on the file needs to change before then, reply to this email.

[BUTTON · View your portal]

Marlenyi Paredes
Aari Transactions
```

### Example · #4 Review Request

```
Subject: One favor before we close the file.

Hi {client_first_name},

{agent_first_name} just closed your {transaction_type} on {property_address}. Aari Transactions coordinated the back end.

Two minutes of your time would help us a lot. One link. No login.

[BUTTON · Share your review]

Reviews are FTC-compliant. You choose your attribution: first name + last initial, full name, or anonymous.

Marlenyi Paredes
Aari Transactions
```

---

## 10. Compliance + legal

| Requirement | How we comply |
|---|---|
| **CAN-SPAM** | Physical mailing address in footer (PO Box recommended). Unsubscribe link in all marketing. Clear from-name. |
| **Florida Chapter 475** | Emails signed with Marlenyi's name and Aari Transactions LLC in the footer. |
| **FTC Endorsement Guides** | Review-request email tells recipient their attribution is their choice + reviewed before publishing. |
| **FREC** | No income claims, no guarantees, no fair-housing-triggering language in any template. |
| **GDPR / CCPA** | Email preferences table lets users opt out granularly. Unsubscribe is one-click. |

---

## 11. Dev handoff checklist

For your developer to execute, in order:

- [ ] Sign up for Resend (resend.com) with `hello@aaritransactions.com`
- [ ] Add `send.aaritransactions.com` as sending domain, add DNS records, verify
- [ ] Generate Resend API key, store in Supabase secrets as `RESEND_API_KEY`
- [ ] Create migration: `email_log` + `email_preferences` tables
- [ ] Install dependencies: `npm i resend react @react-email/components`
- [ ] Build `_email-templates/` React Email components (10 templates)
- [ ] Build `_shared/resend.ts`, `_shared/log-email.ts`, `_shared/render-template.tsx`
- [ ] Build 6 edge functions (one per email category)
- [ ] Configure Supabase database webhooks → edge function URLs
- [ ] Set up `pg_cron` jobs for win-back + review-request scans
- [ ] Wire Stripe webhook → membership-event edge function (Stripe → Supabase auth.users mapping)
- [ ] Update each AARI:WIRE marker in HTML files to remove the placeholder once live
- [ ] Send test emails to Marlenyi's inbox: one per template type
- [ ] Marlenyi approves copy on each template, dev iterates
- [ ] Set up Resend webhook → `email_log` status updates (delivered, bounced, complained)
- [ ] Monitor first 30 days: open rates, bounces, spam complaints. Threshold to escalate: > 0.1% complaint rate.

---

## 12. AARI:WIRE cross-reference

Search the codebase for `AARI:WIRE` to find every integration point. Email-related markers live in:

- `index.html` · intake modal submit handler (#1, #2)
- `agent-submit.html` · agent intake submit handler (#1 variant)
- `client-review.html` · post-submission flow (no email to client, but logs `pending`)
- `aari-reviews.html` · approval action (#5)
- `cancel-membership.html` · pause + cancel handlers (#7, #8)
- `portal.html` · Stripe upgrade routing (#6 via Stripe webhook)
- `aari-crm.html` · win-back queue (#9), broadcast (#10), TC assignment (#2)
- `tc-cockpit.html` · status update generator (#3)

---

## 13. Cost projection

| Component | Cost | Notes |
|---|---|---|
| Resend Pro tier | $20/mo | 50,000 emails/month. Aari volume well under this for first 12 months. |
| Supabase Edge Functions | Included in $25/mo Pro plan | Already on this plan. |
| Supabase pg_cron | Included | Already available. |
| Domain DNS edits | $0 | One-time setup. |
| **Total incremental cost** | **$20/mo** | Fixed. Scales to ~5,000 agents before next tier. |

---

## 14. Rollout order (recommended)

Don't ship all 10 emails at once. Sequence:

1. **Week 1** · Email #1 Intake confirmation. Highest-volume, most-visible.
2. **Week 2** · Email #3 TC status ping. Internal operations are watching these.
3. **Week 3** · Emails #6, #7, #8 Membership lifecycle. Tied to Stripe revenue.
4. **Week 4** · Email #4 Review request. Powers the reviews engine.
5. **Week 5** · Email #5 Review approved.
6. **Week 6** · Emails #9 Win-back queue. Last to ship, biggest impact on retention.
7. **Week 7+** · Email #10 Broadcast. Ad-hoc, used as needed.

---

**End of spec.**

Questions or scope changes route to Marlenyi.
Dev questions on implementation route to whoever owns Supabase/Resend setup.

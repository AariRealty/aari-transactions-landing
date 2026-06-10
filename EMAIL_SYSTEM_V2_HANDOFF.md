# Email System v2 — Verification Pass Handoff Summary

**Date:** June 9, 2026
**Scope:** Section-by-section verification-and-fix pass of the TC cockpit email system (`files.html`) plus Supabase edge functions and migrations.
**Current HEAD:** `1f0612e` — working tree clean (no uncommitted changes).

---

## 1. What was built — every section, with commit hashes

The pass ran as a verification (not a build) pass: each section was read, every claim answered yes/no with line numbers, flagged items ruled on by Marlenyi, then fixes applied, verified (parse + runtime + grep guard + orphan + email-count), and pushed.

| Section | Topic | What was fixed / built | Commit(s) |
|---|---|---|---|
| Backbone | Regenerate engine + versions structure | `versions[]` / `compose{}` / `versionsFrom` engine, `_emailById` lazy index, blank-screen `${{token}}` bug fix (escaped 20 occurrences) | `c28fe62` + cluster `1da8c3e`→`813be84` |
| 1 | System Rules | Sentence spacing (blank line between sentences), "I" not "we" (exceptions: "our side", "our small team"), subject format `· {{street}}` (buyer-rep `· {{buyer_first_name}}`) | `478ca4b` |
| 2 | Thread Structure | Removed thread key 6, moved `closed_google_review` to Standalone, renumbered EMAIL_THREADS keys to 1=Agent Direct, 2=Loan File, 3=Escrow, 4=Master, 5=Standalone | `1047add` |
| 3 | Time of Day Greeting | Night fallback "Good morning"→"Good evening", stripped greeting from buyer-facing standalones, added greeting to legacy emails, `closed_title_lender_review` keeps greeting | `f581eab`→`ae67380` cluster |
| 4 | Auto Triggers | `hardStageGate` single-source gate (SA/payment/Stage-1/opening-email/loan-approval); opening sequence moved to `waiting_for_tc`; `softComplete` mechanism; friday-summary 7-day gate | `f581eab`→`ae67380` cluster |
| 5 | Payment Policy | Wired canonical `STRIPE_LINKS`; rebuilt `closed-payment-reminder` (post-closing TC-fee ladder D1/D7, D14→briefing) for `tc_one_side`/`tc_both_sides` | `5e52977`, `c252d4c` |
| 6 | Stage 1 — New | Reorder; added contract-attached + signatures-verified tasks; updated terms sub-text | `ec4e92e` |
| 7 | Stage 2 — Waiting for TC | Added `wtc_accept` + `wtc_contacts_complete`; moved HOA + survey; added title-insurance; escrow send-gate; reorder | `5e7d968` |
| 8 | Stage 3 — Under Contract | EMD gate, loan gate, HOA followup, survey received, missing-info; `uc_tenant_lease` showIf wired to `logistics.ctc_tenant_occupied` pill; reorder | `352e279` |
| 9 | Stage 4 — Inspection | Deleted `insp_reminder_sent`; added review-report; inspector company/phone + checkGate; proceed/cancel mutually exclusive; cancellation upload gate; reorder | `b0c0873` |
| 10 | Stage 5 — Appraisal | Value entry, below-value lock, title Mark-as-received, full/conditional approval, 3 internal tasks, missing-info; reorder | `f40a487` |
| 11 | Stage 6 — Clear to Close | Payment-link task, CFPB-window calc (`cfpbWindowNote`), title Mark-as-received, renamed `ctc_48hr`→`ctc_wire_warning`, closing-confirm gate, removed walkthrough email, file-review task; dropped `ctc_loan_written` + its email; reorder | `13a4245` |
| 12 | Stage 7 — Closed | Title-confirm hard gate (`closingLocked`), manual `actual_closing_date` entry + schema, congrats email→Thread 1, Day-3 agent + title/lender review auto-sends (`send-agent-review`), `cl_review_24h` copy, archive gate (added closing date, dropped Google review) | `147b43f` |
| 13 | Regenerate Button | Single-version guard in `emailNextVersion` (prevents NaN index on a 1-element `versions[]`) | `1f0612e` |
| 14 | Gmail Labels | First-login Gmail-label onboarding modal (3 label sets, dismiss → per-user localStorage, header reopen link). No Gmail API (manual labeling, per ruling) | `1f0612e` |

> **Note on Sections 3 & 4:** both were pushed across the overnight commit cluster `f581eab` → `2b22bb4` → `5b890a5` → `ac2de0d` → `ae67380` (01:25–01:58, Jun 9). End-state of Sections 1–4 is captured at `ae67380`.
> **Note on `f58cbb5`:** a partial mid-edit snapshot (GitHub Desktop auto-committed during Section 13/14 editing). Fully superseded by `1f0612e`. Ignore it.

---

## 2. Current commit

- **HEAD:** `1f0612e` ("Update files.html"), pushed Jun 9 2026 20:56 ET.
- **Working tree:** clean. No staged or unstaged changes. Everything verified is committed and pushed (Netlify auto-deploys `files.html` on push).
- Verified at HEAD: parse OK (1 script block, 0 failures), runtime OK (no top-level ReferenceError), `grep '[^\\]\${{'` guard clean, Gmail modal + Section 13 guard both present in full.

---

## 3. Emails — final count and status

**74 total** email templates across all file types. The verification pass covered the **`sale`** flow (60 emails). **Zero orphans** — every email's `task` reference matches a task in the same stage.

| File type | Emails | Stages |
|---|---|---|
| sale | 60 | 8 |
| listing | 5 | 5 |
| lease | 5 | 5 |
| buyer_rep | 4 | 4 |
| **TOTAL** | **74** | — |

**Sale emails per stage:**

| Stage | Emails |
|---|---|
| new | 1 |
| waiting_for_tc | 8 |
| under_contract | 12 |
| inspection | 6 |
| remedy | 6 |
| appraisal | 10 |
| ctc | 10 |
| closed | 7 |
| **TOTAL (sale)** | **60** |

Of the 74: **42** carry rotating versions (`versions[]` / `compose{}` / `versionsFrom`), **32** are single-body. 0 use the old `bodyFn` generated engine in the playbook. Orphan check: **0 orphans**.

---

## 4. Checklist — final task counts per stage (sale)

| Stage | Tasks |
|---|---|
| new | 7 |
| waiting_for_tc | 12 |
| under_contract | 14 |
| inspection | 12 |
| remedy | 6 |
| appraisal | 17 |
| ctc | 14 |
| closed | 10 |
| **TOTAL** | **92** |

Closed-stage order (locked): `cl_funds_recorded` → `cl_keys` → `cl_personal_property` → `cl_docs_filed` → `cl_congrats_agent` → `cl_confirm_parties` → `cl_google_review` → `cl_closed_stamp` → `cl_review_24h` → `cl_archive`.

---

## 5. Tokens that need Marlenyi's input before go-live

These are **global placeholders** (not per-file data the TC fills via the missing-field catcher). They render as obvious fill-ins until real values are wired:

| Token / config | Where it resolves from | Current fallback | Action needed |
|---|---|---|---|
| `{{google_review_link_aari}}` | `_profile.google_review_link_aari` | `[Aari Google review link]` | Provide Aari's live Google review URL and set it on the profile/settings record |
| `{{google_review_link_agent}}` | `agent.google_review_link` → `_profile.google_review_link_agent` | `[agent Google review link]` | Decide policy: per-agent review links populated in `agents.google_review_link`, or a single Aari link |
| `GOOGLE_REVIEW_LINK_AARI` (edge secret) | `Deno.env` in `send-agent-review` | `[Aari Google review link]` | Set as a Supabase edge-function secret (same URL as the in-app token) |
| `agents.google_review_link` (column) | used by `send-welcome-home` + agent-review flows | empty | Populate per agent, or leave blank to skip the agent review-link line |

Per-file tokens (title/lender contacts, closing time, closing location, walkthrough date) are **not** global placeholders — the TC fills them inline via the per-task logistics fields and the missing-field catcher before sending.

---

## 6. Open items / cleanup pass — still outstanding

| # | Source | Item | What needs to happen |
|---|---|---|---|
| 1 | Section 13, Q4 | Version memory is **in-session only** | `_emailVer` is an in-memory map keyed by file.id + email.id. It survives in-app navigation but **resets on a full page reload** (picks a fresh random version). This is by design today. Ruling needed only if you want it to survive reloads — would require persisting `_emailVer` to localStorage. **No change made.** |
| 2 | Parked (pre-pass) | Two Google review URLs | Aari's review URL + the per-agent review URL policy. Blocks the review-request emails from going live cleanly. See §5. |
| 3 | Parked (pre-pass) | Resend DNS | Confirm the sending domain DNS (SPF/DKIM/DMARC) is verified in Resend so production sends authenticate. |
| 4 | Section 14 | Manual Gmail labeling | By ruling, there is **no** Gmail API integration. Eileen, Milennys, and Marlenyi must each create their label sets in Gmail manually (the new onboarding modal shows them exactly what to create) and apply labels by hand using the thread badge on each email. |

> **Resolved during the pass (no longer open):** the tenant-occupancy field flag from Section 8 — `uc_tenant_lease` now keys off the "Tenant occupied" pill (`logistics.ctc_tenant_occupied`, files.html line 11110). No standalone field needed.

---

## 7. Backend functions — staged on disk, NOT deployed

All staged together; deploy as a batch. Each is inert in production until deployed.

```bash
supabase functions deploy friday-summary            # weekly send + 7-day min-age gate; Day-14 unpaid TC-fee DO-FIRST surfacing
supabase functions deploy send-morning-briefing-sms # carries the Day-14 unpaid TC-fee "DO FIRST" check
supabase functions deploy payment-reminder          # upfront pre-work D1/D7/D14 ladder (+ broker escalation at D14)
supabase functions deploy closed-payment-reminder   # post-closing TC-fee ladder D1/D7 (D14 → briefing), tc_one_side/tc_both_sides
supabase functions deploy send-welcome-home         # Day-14 buyer welcome-home from closed_at
supabase functions deploy send-review-request       # Day-3 CLIENT review request (timing moved from Day 1)
supabase functions deploy archive-closed-files      # 30-day closed → archived (compliance-safe, no delete)
supabase functions deploy send-agent-review         # Day-3 agent review (no CC) + Day-3 title/lender review (agent CC) — Section 12
```

> Edge-function deploys are **separate** from the Netlify/GitHub path. They require the Supabase CLI and project auth.

---

## 8. Migrations — pending (run before/with the function deploys)

Run `supabase db push` to apply all pending, or apply individually. Required by the staged functions above:

| Migration file | What it does |
|---|---|
| `20260624_welcome_home.sql` | Welcome-home tracking columns + cron for `send-welcome-home` |
| `20260624_payment_ladder.sql` | Adds `files.payment_reminder_count` (0→3 rungs) for the upfront `payment-reminder` ladder |
| `20260624_archive_closed.sql` | 30-day closed→archived cron + status handling for `archive-closed-files` |
| `20260625_closed_payment_reminder.sql` | Adds `files.payment_reminder_last_sent_at` + `closed_payment_reminder_daily` cron |
| `20260628_actual_closing_date_review.sql` | Adds `files.actual_closing_date`, `agent_review_sent_at`, `title_lender_review_sent_at` + `send_agent_review_daily` cron (Section 12) |

> **Verify first:** other migrations also sit in the folder (`20260624_broker_delete_and_timer_reset`, `20260625_delete_requests`, `20260626_sa_dashboard_loan_ping`, `20260627_transaction_files_staff_attach`) from adjacent work. Confirm which are already applied before running `db push` so nothing double-applies.

---

## 9. Before go-live checklist — nothing can be skipped

1. **Confirm Netlify credits** are not exhausted (deploys halt silently when they run out — check before relying on the latest push being live).
2. **Verify `1f0612e` is live** on the production domain (front-end is auto-deployed; confirm the Closed-stage hard gate, the `actual_closing_date` field, and the Gmail modal all render).
3. **Run the 5 pending migrations** (§8) via `supabase db push` — verify no double-apply against the adjacent migrations.
4. **Deploy the 8 staged edge functions** (§7).
5. **Set the Google review URLs** (§5): in-app token value, the `GOOGLE_REVIEW_LINK_AARI` edge secret, and the `agents.google_review_link` policy.
6. **Confirm Resend DNS** is verified for the sending domain so production emails authenticate.
7. **Confirm Stripe links** — the canonical `STRIPE_LINKS` map (10 entries) matches live Stripe payment links in both `files.html` and `_shared/stripe-links.ts`.
8. **Smoke-test one full sale file** end to end: New → Waiting for TC → Under Contract → Inspection → Appraisal → Clear to Close → Closed → Archive. Confirm each stage gate, each Send button, the regenerate button, and that `closed_at` / `actual_closing_date` drive the Day-3 / Day-14 automations.
9. **TC onboarding:** have Eileen and Milennys each create their Gmail label sets from the new onboarding modal before their first real file.
10. **Verify cron schedules** are registered (each `cron.schedule` in the migrations) and that `call_edge_function` is reachable.

---

## 10. Known flags / decisions still open

| Flag | Section | Status / ruling needed |
|---|---|---|
| Version memory resets on full page reload | 13 | **By design today.** Decide whether to persist `_emailVer` to localStorage so a reopened session shows the same version. No code change unless you rule for it. |
| Per-agent vs single Google review link | 5 / 12 | Decide whether `{{google_review_link_agent}}` is populated per agent (`agents.google_review_link`) or collapses to the single Aari link. Affects welcome-home + agent-review copy. |
| Gmail labeling stays manual | 14 | **Ruled:** no Gmail API. Accepted. Onboarding modal documents the labels; nothing auto-applies. |
| "Needs Attention" label has no automation | 14 | **Ruled:** manual label only. TC applies it themselves; documented in the onboarding modal. |
| Marlenyi's dashboard unchanged | 14 | **Ruled:** her labels are for her own Gmail; documented alongside the TCs', no dashboard change. |

---

### Quick reference — confirmed commit chain (this pass)

`478ca4b` (S1) → `1047add` (S2) → `ae67380` (end of S3+S4) → `5e52977`/`c252d4c` (S5) → `ec4e92e` (S6) → `5e7d968` (S7) → `352e279` (S8) → `b0c0873` (S9) → `f40a487` (S10) → `13a4245` (S11) → `147b43f` (S12) → **`1f0612e` (S13+S14, current HEAD)**

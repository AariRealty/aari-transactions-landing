# Rental service — parity audit & work plan

**Goal:** the Rental file in the TC cockpit (`files.html`) should match the full TC ($399 sale) file panel-for-panel, adapted to a lease. This doc is the handoff spec — each item lists the problem, the exact code to touch, the fix, and how to verify.

**Test file:** `8421 Coral Reef Way` (mock rental, `file_type='rental'`, on Milennys' Rentals board). Re-create with the insert in `supabase/migrations` notes if deleted.

**Always:** after editing `files.html`, run the inline-script parse check, then commit one change at a time. The repo lives in iCloud, so clear `.git/index.lock` before committing.

---

## DONE (for context, no action needed)
- Rental intake branch (sale vs rental, short/long term) + all ELLA fields (`index.html`).
- File tagged `file_type='rental'` → Rentals tab + 5 stages (`new/active/signed/occupied/closed`).
- Rental checklist (`STAGE_CHECKLISTS.rental`, 22 tasks) + renders in the file view.
- Rental email playbook (`EMAIL_PLAYBOOK.rental`, 8 emails, each linked to a task).
- Rental deadline tracker (reuses sale `dl-ledger` / `dl-perf` / `dl-step-card` components).
- Rental terms panel (tap-to-edit rows + Confirm & unlock, mirrors sale Contract Terms).
- ELLA/lease document pane (left) reusing the sale contract upload mechanism.
- TC acceptance step (`rnew_accept`, `systemCheck:'accept'`) + email gates on Signed stage.
- `rentalSaveField` hardened to re-read the live record before merge (no field-drop).

---

## REMAINING WORK

### 1. Board card reads sale triage (`cardAction`)  — files.html ~`function cardAction`
**Problem:** `cardAction(f)` computes the card's action line + urgency tone from `fileTriage(f)` + `computeClosingCertainty(f)`, both built on **contract deadlines / verifications**. A rental has none, so the action line and color are meaningless/wrong on the board.
**Fix:** branch `cardAction` on `file_type==='rental'` → derive the action line from the **rental stage + next incomplete checklist task** (e.g. "Confirm ELLA signed", "Input MLS", "Send lease"), neutral tone unless a rental date is overdue (use `renderRentalDates` logic or `stageProgress`).
**Verify:** the rental card shows a rental-relevant next action, not a contract phrase.

### 2. Closing-certainty score always 100 — files.html `function computeClosingCertainty`
**Problem:** the `100` badge starts at 100 and only deducts for sale things (verifs, contract deadlines, sends). Rentals get no deductions → always 100, meaningless.
**Fix (pick one):**
- **Hide** the score badge when `file_type==='rental'` (simplest), OR
- **Rental-tune** it: deduct for no ELLA on file, deposit not held per FS 83.49, lease unsigned past the available date, listing period expiring soon.
**Verify:** rental files either have no score badge or a score that moves with rental state.

### 3. Confirm no sale-only panels leak onto rentals — files.html `renderVerificationsForFile` (+ any closing-logistics)
**Problem:** need to confirm the Verifications panel (and any closing-logistics block) don't render a stray "Pick a contract type…" or empty sale panel on a rental file.
**Fix:** gate those renderers on `file_type` so they're omitted (not shown empty) for `rental`. (Pattern already used for the checklist + deadlines.)
**Verify:** open a rental file — only Rental terms, doc pane, Your Work, Deadlines show. Nothing sale-specific.

### 4. Rental email playbook depth — files.html `EMAIL_PLAYBOOK.rental` (~ the `rental: {` block)
**Problem:** 8 emails total vs the sale's many-per-stage with `versions:[]` rotation ("Try another"). Coverage is thin.
**Fix:** add emails + version variety, each with `task:` linking it to a checklist task:
- **active:** application-received acknowledgement to applicant/agent.
- **signed:** screening **approved** + screening **declined** (adverse-action wording — keep it factual, FCRA-aware).
- **occupied:** rent-payment reminder / portal setup.
- **closed:** renewal **offer** (separate from the renewal-notice), move-out instructions + deposit-return timeline (FS 83.49).
- Give the high-use emails 3–5 rotating `versions` (or the `compose:{openings,body,closings}` shape) so no two read alike.
**Voice:** Alex Cattoni, no dashes, no signature (TC's client signs). Owner = `{{seller_*}}` tokens, tenant = `{{tenant_*}}`, agent = `{{agent_*}}`, `{{street}}`, `{{time_of_day_greeting}}`.
**Verify:** each stage shows its emails inline under the matching task; "Try another" cycles versions.

---

## Suggested order
1 → safest visual wins (card #1, score #2), then leak check #3, then email depth #4 (largest).

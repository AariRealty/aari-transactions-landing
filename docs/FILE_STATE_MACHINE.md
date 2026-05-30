# File State Machine · Canonical Reference

## The two state machines

The `files` table tracks two distinct state machines that legitimately need to coexist:

### 1. `status` · Administrative workflow

Controls intake, broker review, archival. Drives admin dashboards.

| Value | Meaning |
|-------|---------|
| `intake_received` | Agent submitted a file, not yet assigned |
| `awaiting_tc_acceptance` | Assigned to a TC, awaiting their acceptance |
| `tc_engaged` | TC accepted, working on it |
| `awaiting_broker_review` | Flagged for broker attention |
| `awaiting_signatures` | Waiting on e-signatures |
| `awaiting_docs` | Waiting on documents |
| `paused` | Temporarily paused (vacation hold, etc.) |
| `closed` | Successfully closed |
| `archived` | Closed and archived (older closed files) |
| `cancelled` | Cancelled by agent or broker |
| `rejected` | Rejected at intake |

### 2. `transaction_stage` · Transaction lifecycle

Controls the kanban view. What stage of the deal is this in?

| Value | Meaning |
|-------|---------|
| `new` | Just intake, no contract yet |
| `under_contract` | Contract signed |
| `inspection` | Inspection period |
| `remedy` | Repair negotiations |
| `appraisal` | Appraisal in progress |
| `ctc` | Clear to close |
| `closed` | Closed |
| `expired` | Contract expired / dead deal |

## The overlap problem

Both machines have "closed" states. Until the sync migration, code in different files
checked these two fields with OR logic in slightly different combinations, producing
bugs where one dashboard showed a file as closed and another showed it as active.

## The fix · `SHIP_file_status_sync.sql`

1. **`is_file_closed(uuid)` SQL function** — canonical check. Use this in any SQL query.
2. **`sync_file_status_stage` trigger** — auto-syncs the two fields on close. When
   `transaction_stage` becomes `closed`, sets `status='closed'`. Vice versa.
3. **Backfill** — fixes any rows currently drifted. Logs the count to `audit_log`.

After this migration, the data is self-consistent at the database level.

## Canonical lifecycle state (derived)

Use this enum when you need a single value to render UI:

| Lifecycle | When |
|-----------|------|
| `intake` | `status in ('intake_received', 'awaiting_tc_acceptance', 'awaiting_broker_review')` |
| `active` | `status in ('tc_engaged', 'awaiting_docs', 'awaiting_signatures')` AND `transaction_stage in ('new','under_contract','inspection','remedy','appraisal','ctc')` |
| `paused` | `status = 'paused'` |
| `closed` | `is_file_closed()` returns true |
| `expired` | `transaction_stage = 'expired'` |
| `cancelled` | `status in ('cancelled', 'rejected')` |

## Layer 2 · JS refactor (pending)

Files that still have inline state derivation and should eventually use a shared
`Aari.fileLifecycle(f)` helper:

| File | Function | Lines |
|------|----------|-------|
| `portal.html` | `isClosed()` | 606 |
| `portal.html` | `laneFor()` | 648-660 |
| `broker-cockpit.html` | `isClosed()` | 1531 |
| `files.html` | `deriveStage()` | 3158, 3930-3940 |
| `tc-cockpit.html` | stage derivation | 1474-1478 |
| `files-compliance.html` | closed/active filters | 312, 321, 344, 361, 380 |
| `files-sla.html` | closed/active filters | 329, 332, 504-505 |
| `aari-crm.html` | status filters | 3709, 3808-3811 |
| `briefing.html` | status filters | 900-902, 926-927, 943 |

When tackling Layer 2:
1. Create `js/aari-file-state.js` exporting `window.AariFileState.lifecycle(f)` and `window.AariFileState.lane(f, fileType)`
2. Refactor each of the above to call those helpers
3. Verify visually that each page still renders the same kanban/filter behavior
4. Delete the duplicated `isClosed()` from `portal.html` and `broker-cockpit.html`

## Bugs prevented by this canonicalization

- A file marked closed via broker-cockpit's archive button no longer shows up
  as "active" on the agent portal kanban.
- A file dragged to "Closed" on `/files.html` correctly fires the NPS trigger
  AND clears from the SLA dashboard at the same time.
- The compliance dashboard no longer flags closed files as missing verifications.
- The Sunday digest doesn't include deadlines from archived files.

## How to use `is_file_closed()` in your queries

```sql
-- Old · brittle
select * from files where status != 'closed' and status != 'archived' and transaction_stage != 'closed';

-- New · canonical
select * from files where not public.is_file_closed(id);
```

```sql
-- Aggregations
select count(*) filter (where public.is_file_closed(id)) as closed_count,
       count(*) filter (where not public.is_file_closed(id)) as active_count
from files;
```

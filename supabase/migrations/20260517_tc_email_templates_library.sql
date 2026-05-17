-- ============================================================================
-- Aari Transactions · TC Email Template Library (Section 9 · Task 9.1)
-- ============================================================================
-- Extends 20260517_tc_email_templates.sql (Task 8.4) by seeding the rest of
-- the TC's manual-send library. The Kickoff Email is already seeded by 8.4.
--
-- Templates added by this migration (template_key · display_name):
--   doc_request          · Missing Documents Request
--   status_update        · Weekly Status Update
--   deadline_reminder    · Deadline Reminder
--   closing_coordination · Closing Coordination (48hr Out)
--   post_close_thanks    · Post-Close Thank You
--
-- Each TC gets one row per template. Edits are per-TC and don't sync back.
-- ON CONFLICT DO NOTHING so existing custom edits are preserved on re-run.
-- ============================================================================

-- ---- doc_request ----
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'doc_request',
  'Missing Documents Request',
  'Documents still needed for {{file_address}}',
  'Hi {{agent_first_name}},

Quick check-in on {{file_address}}. To keep this file on track for closing on {{closing_date}}, I still need the following:

DOCUMENTS OUTSTANDING
[Replace this with the specific docs you''re waiting on — e.g., signed inspection response, lender pre-approval, HOA estoppel, disclosures]

If any of these are tied to a vendor (lender, title, HOA), tell me who to chase and I''ll take it from there.

Please send what you have by [INSERT DATE] so we don''t lose room on the closing timeline.

{{tc_name}}
{{tc_title}} · Aari Transactions
{{tc_email}}',
  'Chase missing documents. Lists outstanding items + deadline ask.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;

-- ---- status_update ----
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'status_update',
  'Weekly Status Update',
  'Status update · {{file_address}}',
  'Hi {{agent_first_name}},

Quick status on {{file_address}}.

WHERE WE STAND
[Replace with current milestones hit — title ordered, lender confirmed, inspection complete, etc.]

ON DECK THIS WEEK
[Replace with what''s expected this week — inspection response due, financing contingency, etc.]

ANYTHING YOU NEED FROM ME
[Replace with action items you''re flagging for the agent, or "Nothing right now" if all is clear]

Closing target stays {{closing_date}}.

{{tc_name}}
{{tc_title}} · Aari Transactions',
  'Weekly progress note to the agent. Hits status / on-deck / anything-needed.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;

-- ---- deadline_reminder ----
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'deadline_reminder',
  'Deadline Reminder',
  '[Heads up] {{file_address}} deadline approaching',
  'Hi {{agent_first_name}},

Heads up on {{file_address}}.

DEADLINE APPROACHING
[Replace this line with the specific deadline — e.g., "Inspection period ends {{inspection_period_end}}" or "Loan approval contingency closes [date]"]

WHAT TO DO BEFORE THEN
[Replace with the agent''s required action — submit inspection response, confirm financing, etc.]

If the deadline needs an extension, let me know today so I can draft the addendum and route it for signature.

{{tc_name}}
{{tc_title}} · Aari Transactions',
  'Fires when a contract deadline is approaching. Pin the action the agent needs to take.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;

-- ---- closing_coordination ----
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'closing_coordination',
  'Closing Coordination (48hr Out)',
  'Closing in 48 hours · {{file_address}}',
  'Hi {{agent_first_name}},

We''re 48 hours from closing on {{file_address}} ({{closing_date}}).

FINAL CHECKLIST
☐ Final walk-through scheduled
☐ Closing Disclosure reviewed by buyer
☐ Cleared-to-close from lender confirmed
☐ Wire instructions verified directly with title (NEVER by email link)
☐ Keys, garage remotes, mailbox keys ready for delivery
☐ Brokerage compliance file complete

WHAT I NEED FROM YOU TODAY
[Replace with anything outstanding — final disclosures, signed addenda, broker review items]

I''ll be on the clock through closing. Reply to this email or call direct if anything shifts.

{{tc_name}}
{{tc_title}} · Aari Transactions',
  'Sent 48 hours before close. Final coordination checklist + anything outstanding.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;

-- ---- post_close_thanks ----
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'post_close_thanks',
  'Post-Close Thank You',
  'Closed on {{file_address}} — thank you',
  'Hi {{agent_first_name}},

Closed on {{file_address}} today. Congrats on the win.

WHAT''S NEXT
— Your closing folder is delivered to your brokerage drive (audit-ready)
— Aari''s file is permanently archived per FREC retention rules
— Your $[FEE] coordination fee was disbursed at settlement through CDA

A short review from your client helps the next agent decide to work with Aari. I''ll send a separate review request to your client''s email tomorrow morning unless you''d prefer I hold off.

If anything from this file needs post-close follow-up (warranty issue, document request, etc.), reply to this email anytime.

Until the next one —

{{tc_name}}
{{tc_title}} · Aari Transactions',
  'Sent after closing. Thanks the agent, confirms file archive, sets up review request.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;

-- ============================================================================
-- Aari Transactions · MLS-update nudge on closing_date change
-- ============================================================================
-- Marlenyi 2026-08-08 · when the closing date changes on a listing-side file,
-- the assigned TC needs to update the MLS with the new date TODAY. If they
-- don't, the MLS system sends its own notification to the listing agent
-- (Aari's client), and it looks bad on Aari that the agent heard about a
-- stale closing from Zillow instead of us.
--
-- Fires on: files.closing_date UPDATE, when the file is "listing side" per
--   the broader scope Marlenyi approved:
--     · file_type = 'listing'
--     · OR service_type IN ('listing_coordinator','listing_docs','mls_setup')
--     · OR file_type = 'sale' AND client_type IN ('seller','both')
--       AND is_aari_engaged = true  (Aari agent's listings on sale-side files)
--
-- Skips: auto-roll bumps (detected via raw_form_data.closing_date_last_rolled
--   changing in the same UPDATE). Without this, every business day autoRoll
--   fires on a stuck file would spam the TC's bell with the same MLS-update
--   nudge. Manual date changes (from the drawer, reschedule modal, intake edit)
--   set closing_date without touching last_rolled, so those still fire.
--
-- Delivers: single tc_notifications row for the assigned TC with the old date
--   and the new date in the body so they know what to enter in MLS.
--   NULL assigned_tc_id → skip (nobody to notify; broker will pick it up on
--   the file review).
-- ============================================================================

create or replace function public.tg_notify_mls_update_on_closing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_listing_side boolean;
  is_auto_roll boolean;
  addr_short text;
  new_date_lbl text;
  old_date_lbl text;
begin
  -- No-op if closing_date didn't actually change.
  if old.closing_date is not distinct from new.closing_date then
    return new;
  end if;

  -- Skip auto-roll updates · detected via last_rolled changing on this UPDATE.
  -- Auto-roll always stamps raw_form_data.closing_date_last_rolled together
  -- with the closing_date bump. Manual date changes never touch last_rolled.
  is_auto_roll := (
    coalesce(old.raw_form_data->>'closing_date_last_rolled', '')
    is distinct from
    coalesce(new.raw_form_data->>'closing_date_last_rolled', '')
  );
  if is_auto_roll then
    return new;
  end if;

  -- Nobody to notify · bail. Broker will still see the change on file review.
  if new.assigned_tc_id is null then
    return new;
  end if;

  -- Broader scope · Marlenyi's pick. Fires on file_type='listing', any listing
  -- service, and sale-side files where Aari runs the listing (seller/both +
  -- is_aari_engaged). Excludes buyer-side sales where MLS update isn't ours.
  is_listing_side := (
    (new.file_type = 'listing')
    or (new.service_type in ('listing_coordinator', 'listing_docs', 'mls_setup'))
    or (
      new.file_type = 'sale'
      and lower(coalesce(new.client_type, '')) in ('seller', 'both')
      and coalesce(new.is_aari_engaged, false) = true
    )
  );
  if not is_listing_side then
    return new;
  end if;

  -- Address for the notification body · first line only, "Untitled listing" if
  -- somehow blank so the row still reads.
  addr_short := coalesce(nullif(split_part(coalesce(new.property_address, ''), ',', 1), ''), 'this listing');
  new_date_lbl := to_char(new.closing_date, 'FMMon FMDD');
  old_date_lbl := case
    when old.closing_date is null then 'unset'
    else to_char(old.closing_date, 'FMMon FMDD')
  end;

  insert into public.tc_notifications (recipient_id, file_id, kind, title, body)
  values (
    new.assigned_tc_id,
    new.id,
    'mls_needs_closing_date_update',
    'Update MLS with new closing date',
    'Closing date on ' || addr_short || ' moved from ' || old_date_lbl || ' to ' || new_date_lbl ||
    '. Update the MLS listing today so the agent client doesn''t see a stale date from Zillow.'
  );

  return new;
end;
$$;

grant execute on function public.tg_notify_mls_update_on_closing_change() to authenticated;

drop trigger if exists trg_notify_mls_update_on_closing_change on public.files;
create trigger trg_notify_mls_update_on_closing_change
  after update of closing_date on public.files
  for each row
  execute function public.tg_notify_mls_update_on_closing_change();

comment on function public.tg_notify_mls_update_on_closing_change() is
  'AFTER UPDATE on files.closing_date · notifies the assigned TC to update MLS when the change is on a listing-side file. Skips auto-roll bumps (detected via raw_form_data.closing_date_last_rolled diff) to avoid daily spam.';

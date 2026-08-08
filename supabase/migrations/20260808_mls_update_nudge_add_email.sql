-- ============================================================================
-- Aari Transactions · MLS-update nudge · add email delivery
-- ============================================================================
-- Marlenyi 2026-08-08 · extends 20260808_mls_update_nudge_on_closing_date_change
-- by also firing the send-mls-update-nudge edge function so the assigned TC
-- gets a branded email in their inbox alongside the bell notification. TCs
-- may not open the app fast enough for the bell alone to beat Zillow
-- notifying the agent that the MLS date is stale.
--
-- Wire · fire-and-forget net.http_post from inside the trigger. We don't wait
-- for a response (pg_net records status + body in net._http_response for
-- debugging), and any dispatch error just logs a warning · the bell insert
-- above already fired so the TC still gets one channel.
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
  _req_id bigint;
begin
  if old.closing_date is not distinct from new.closing_date then
    return new;
  end if;
  is_auto_roll := (
    coalesce(old.raw_form_data->>'closing_date_last_rolled', '')
    is distinct from
    coalesce(new.raw_form_data->>'closing_date_last_rolled', '')
  );
  if is_auto_roll then
    return new;
  end if;
  if new.assigned_tc_id is null then
    return new;
  end if;
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

  -- Email via send-mls-update-nudge · fire-and-forget so a Resend hiccup
  -- doesn't roll back the calling UPDATE. Errors log a warning; the bell
  -- above already fired so the TC still has one channel.
  begin
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/send-mls-update-nudge',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'file_id', new.id::text,
        'old_date', case when old.closing_date is null then null::text else to_char(old.closing_date, 'YYYY-MM-DD') end,
        'new_date', to_char(new.closing_date, 'YYYY-MM-DD')
      ),
      timeout_milliseconds := 15000
    ) into _req_id;
  exception when others then
    raise warning '[mls-update-nudge] email dispatch failed: %', SQLERRM;
  end;

  return new;
end;
$$;

comment on function public.tg_notify_mls_update_on_closing_change() is
  'AFTER UPDATE on files.closing_date · notifies the assigned TC (bell + email via send-mls-update-nudge) to update MLS when the change is on a listing-side file. Skips auto-roll bumps (detected via raw_form_data.closing_date_last_rolled diff) to avoid daily spam.';

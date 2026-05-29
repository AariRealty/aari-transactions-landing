# Applied via paste-and-run

These migrations were applied directly via the consolidated `SHIP_*.sql` files
in `../../_paste-and-run/` rather than through `supabase db push`.

Do NOT move them back into the active migrations folder. The CLI will try to
re-apply them and conflict on the existing tables/policies.

If you spin up a fresh Supabase project, run the matching SHIP file from
`_paste-and-run/` to bring it to parity, not these.

-- ============================================================================
-- 20260714 · Pin search_path on the 12 flagged functions (function_search_path_mutable)
-- ============================================================================
-- A mutable search_path lets a caller shadow unqualified object references; on a
-- SECURITY DEFINER function that is a privilege-escalation vector. Each function
-- below was read individually: all use only built-ins (now(), round(), jsonb_*),
-- NEW/OLD fields, or FULLY-QUALIFIED references (vault.decrypted_secrets,
-- net.http_post, public.encrypted_credentials). None reference an unqualified
-- schema object, so an empty search_path is safe (pg_catalog stays implicit) and
-- is the most secure setting. Reversible: RESET the search_path per function.
-- ============================================================================

-- SECURITY DEFINER (highest priority — vault + net, both qualified)
alter function public.call_edge_function(text, jsonb) set search_path = '';

-- updated_at / touch trigger functions (NEW + now() only)
alter function public.pay_requests_touch_updated_at()      set search_path = '';
alter function public.pipeline_state_touch_updated_at()    set search_path = '';
alter function public.realty_members_touch()               set search_path = '';
alter function public.set_agents_updated_at()              set search_path = '';
alter function public.set_updated_at()                     set search_path = '';
alter function public.tg_files_touch_updated_at()          set search_path = '';
alter function public.update_updated_at()                  set search_path = '';

-- trigger functions with (fully-qualified) table refs / NEW-only logic
alter function public.recompute_profile_completion()       set search_path = '';
alter function public.set_property_address_from_extraction() set search_path = '';
alter function public.sync_file_status_stage()             set search_path = '';
alter function public.tg_files_touch_last_assigned()       set search_path = '';

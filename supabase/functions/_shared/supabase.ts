// Aari Transactions · Shared · Supabase admin client (service-role)
// Use for any DB read/write inside edge functions.

import { createClient } from "supabase";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in edge function secrets.");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

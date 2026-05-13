// Edge function: resend-webhook
// Trigger: Resend posts to this URL on every email lifecycle event
//   (delivered, bounced, complained, opened, clicked).
// Configure in Resend dashboard → Webhooks → Add endpoint.
// We update email_log.status + timestamps so the broker has audit visibility.

import { supabaseAdmin } from "../_shared/supabase.ts";

interface ResendEvent {
  type: string;     // 'email.sent', 'email.delivered', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked'
  created_at: string;
  data: { email_id: string; to: string[] };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // OPTIONAL: validate webhook signature using Resend signing secret.
  // const signature = req.headers.get("svix-signature");
  // if (!verifySignature(signature, await req.text(), Deno.env.get("RESEND_WEBHOOK_SECRET"))) {
  //   return new Response("Invalid signature", { status: 401 });
  // }

  let event: ResendEvent;
  try { event = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const resendId = event.data?.email_id;
  if (!resendId) return new Response("ok", { status: 200 });

  // Map Resend event types to our internal status values
  const updates: Record<string, unknown> = {};
  switch (event.type) {
    case "email.sent":
      updates.status = "sent";
      updates.sent_at = event.created_at;
      break;
    case "email.delivered":
      updates.status = "delivered";
      updates.delivered_at = event.created_at;
      break;
    case "email.bounced":
      updates.status = "bounced";
      updates.bounced_at = event.created_at;
      break;
    case "email.complained":
      updates.status = "complained";
      break;
    // 'email.opened' and 'email.clicked' are tracked separately if needed; ignore for now.
  }

  if (Object.keys(updates).length) {
    await supabaseAdmin.from("email_log").update(updates).eq("resend_id", resendId);
  }

  return new Response("ok", { status: 200 });
});

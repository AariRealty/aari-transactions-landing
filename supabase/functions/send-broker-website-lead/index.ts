// ============================================================================
// Aari Transactions · send-broker-website-lead
// ============================================================================
// Fires when a client submits online at aaritransactions.com and lands
// unassigned (no TC yet). Sends Marlenyi:
//   1. Email via Resend — the BrokerWebsiteLeadNeedsTc template she approved.
//   2. In-portal notification row — powers the bell badge + toast on her
//      broker-cockpit view via Supabase Realtime.
//
// Both channels are best-effort and independent — one failing doesn't block
// the other.
//
// Body: { file_id: uuid }
// ============================================================================

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { BrokerWebsiteLeadNeedsTc } from "../_email-templates/BrokerWebsiteLeadNeedsTc.tsx";

const BROKER_EMAIL = Deno.env.get("BROKER_EMAIL") ?? "marlenyi@aarirealty.com";
const BROKER_FIRST_NAME = Deno.env.get("BROKER_FIRST_NAME") ?? "Marlenyi";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Human-friendly labels for the raw service_type slugs stored on files.
const SERVICE_LABELS: Record<string, string> = {
  tc_one_side: "TC · One Side",
  tc_both_sides: "TC · Both Sides",
  lc: "Listing Coordinator",
  op_basic: "Offer Prep · Basic",
  op_complete: "Offer Prep · Complete",
  listing_docs: "Listing Docs",
  mls_setup: "MLS Setup",
  file_org: "File Organization",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: { file_id?: string };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "invalid_json" }); }
  if (!body.file_id) return j(400, { ok: false, error: "file_id_required" });

  // ---- 1. Load the file ----------------------------------------------------
  const { data: file, error: fileErr } = await supabaseAdmin
    .from("files")
    .select("id, service_type, property_address, purchase_price_cents, client_name, client_email, client_phone, client_type, raw_form_data, created_at, assigned_tc_id")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "file_lookup_failed: " + fileErr.message });
  if (!file) return j(404, { ok: false, error: "file_not_found" });

  // Defensive: if a TC was assigned after the trigger fired, don't nag.
  if (file.assigned_tc_id) {
    return j(200, { ok: true, skipped: true, reason: "already_assigned" });
  }

  // ---- 2. Look up Marlenyi's auth id (for the notification RLS scope) ------
  // The notifications table gates SELECT on recipient_id = auth.uid(), so we
  // need her real auth.users.id.
  const { data: brokerUser } = await supabaseAdmin
    .from("agents")
    .select("id, first_name, email")
    .eq("email", BROKER_EMAIL)
    .maybeSingle();

  const brokerId = brokerUser?.id ?? null;
  const brokerFirstName = brokerUser?.first_name ?? BROKER_FIRST_NAME;

  // ---- 3. Shape data for the email + notification -------------------------
  // deno-lint-ignore no-explicit-any
  const raw: any = file.raw_form_data ?? {};
  const clientName = file.client_name ?? raw.client_name ?? raw.name ?? "(no name)";
  const clientPhone = file.client_phone ?? raw.client_phone ?? raw.phone ?? undefined;
  const clientEmail = file.client_email ?? raw.client_email ?? raw.email ?? undefined;
  const propertyAddress = file.property_address ?? raw.property_address ?? raw.address ?? "(no address yet)";
  const priceStr = file.purchase_price_cents
    ? `$${(file.purchase_price_cents / 100).toLocaleString("en-US")}`
    : (raw.price ? String(raw.price) : undefined);
  const serviceLabel = SERVICE_LABELS[file.service_type] || file.service_type || "Service";
  const side = normalizeSide(file.client_type ?? raw.client_type);
  const agentName = raw.agent_name ?? undefined;

  const submittedAt = formatSubmittedAt(file.created_at);
  const assignUrl = `${SITE_URL}/files.html?open=${file.id}&assign=1`;

  // ---- 4. Send the email ---------------------------------------------------
  let emailSent = false;
  let emailReason: string | undefined;
  try {
    const result = await sendEmail({
      to: BROKER_EMAIL,
      toUserId: brokerId,
      relatedFileId: null, // FK on email_log points at tc_files; keep null for files
      category: "transactional",
      subject: `New file from aaritransactions.com 👀 pick your TC`,
      templateName: "broker_website_lead_needs_tc",
      reactElement: React.createElement(BrokerWebsiteLeadNeedsTc, {
        brokerFirstName,
        clientName,
        clientPhone,
        clientEmail,
        propertyAddress,
        price: priceStr,
        serviceLabel,
        side,
        agentName,
        submittedAt,
        assignUrl,
      }),
      payload: { file_id: file.id, source: "website" },
    });
    emailSent = !!result.sent;
    emailReason = result.reason;
  } catch (e) {
    console.error("[send-broker-website-lead] email threw:", e);
    emailReason = e instanceof Error ? e.message : String(e);
  }

  // ---- 5. Insert in-portal notification (independent of email outcome) -----
  let notificationInserted = false;
  if (brokerId) {
    const shortAddr = String(propertyAddress).split(",")[0].trim();
    const { error: notifErr } = await supabaseAdmin
      .from("notifications")
      .insert({
        recipient_id: brokerId,
        type: "broker_website_lead_needs_tc",
        title: `Website lead · needs a TC`,
        body: `${shortAddr} · ${serviceLabel}`,
        related_file_id: null,
        payload: {
          file_id: file.id,
          client_name: clientName,
          property_address: propertyAddress,
          service_label: serviceLabel,
          source: "website",
          assign_url: assignUrl,
        },
      });
    if (notifErr) {
      console.error("[send-broker-website-lead] notification insert failed:", notifErr);
    } else {
      notificationInserted = true;
    }
  }

  // ---- 6. Fire Web Push (lock-screen alert) --------------------------------
  // Best-effort. Skips silently if no push subscription or VAPID isn't configured.
  let pushInvoked = false;
  if (brokerId) {
    const shortAddr = String(propertyAddress).split(",")[0].trim();
    try {
      const pushUrl = `${SUPABASE_URL}/functions/v1/send-web-push`;
      const resp = await fetch(pushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
        },
        body: JSON.stringify({
          user_id: brokerId,
          title: "🌐 Website lead · needs a TC",
          body: `${shortAddr} · ${serviceLabel}`,
          url: assignUrl,
          tag: `bwl-${file.id}`,
        }),
      });
      pushInvoked = resp.ok;
    } catch (e) {
      console.error("[send-broker-website-lead] push invoke failed:", e);
    }
  }

  return j(200, {
    ok: emailSent || notificationInserted,
    email_sent: emailSent,
    email_reason: emailReason,
    notification_inserted: notificationInserted,
    push_invoked: pushInvoked,
    broker_id: brokerId,
  });
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizeSide(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "buyer" || s === "buy") return "Buyer";
  if (s === "seller" || s === "sell") return "Seller";
  if (s === "both" || s === "dual") return "Both sides";
  return v;
}

function formatSubmittedAt(iso?: string | null): string {
  if (!iso) return "just now";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "just now";
  // Match the Alex-style copy Marlenyi approved: "Jul 29, 2026 at 10:22 PM"
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} at ${time}`;
}

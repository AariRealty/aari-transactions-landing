// v36: intake_started ping recipient split off from OWNER_EMAIL to a new INTAKE_PING_TO constant (default tc@aarirealty.com) so it does not land in the shared TC inbox. Marlenyi 2026-08-18.
// Aari Transactions · public-submit v36 (2026-08-18)
// v35: "credits" renamed to "free files" in the intake_started email body only. DB columns unchanged.
// v34: intake_started email uses Layout C (dashboard token grid) that
// Marlenyi picked from the three-layout mockup. Black "Not paid yet" chip
// up top, compact serif headline, 2x2 grid of Service / Agent / Member /
// Email, then a wide row for Property, then a cream footer with cadence.
// Zero dashes anywhere in copy · sentences end with periods.
// v33: intake_started HTML redesigned to match branded post-payment emails.
// v32: dedup fixed via system_pings.
// v31: intake_started intent added.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("AARI_CONTRACT_BUCKET") ?? "transaction-files";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";
const REPLY_TO = Deno.env.get("REPLY_TO_EMAIL") ?? "marlenyi@aaritransactions.com";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "marlenyi@aaritransactions.com";
const INTAKE_PING_TO = Deno.env.get("INTAKE_PING_TO") ?? "tc@aarirealty.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());
function esc(s: string){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function upload(admin: any, id: string, b64: string, filename: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > 25 * 1024 * 1024) throw new Error("File is over 25 MB.");
  const safe = String(filename || "file.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${id}/${Date.now()}-${safe}`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Upload failed: " + up.error.message);
  return path;
}

async function confirm(to: string, heading: string, lead: string, next: string) {
  if (!RESEND_KEY || !validEmail(to)) return;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#fafaf6;padding:32px 0;color:#444"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;border-radius:12px;overflow:hidden"><div style="padding:22px 34px 16px;border-bottom:1px solid #e6e2d8"><span style="font-family:Georgia,serif;font-weight:600;font-size:20px;letter-spacing:3px;color:#0f0f0f;border:1.5px solid #0f0f0f;border-radius:5px;padding:4px 12px">AARI</span></div><div style="padding:30px 34px"><h1 style="font-family:Georgia,serif;font-size:26px;font-weight:500;color:#0f0f0f;margin:0 0 16px">${esc(heading)}</h1><p style="font-size:14px;line-height:1.6;margin:0 0 14px">${lead}</p><p style="font-size:14px;line-height:1.6;margin:0">${next}</p></div><div style="padding:20px 34px;background:#fafaf6;border-top:1px solid #e6e2d8;font-size:11px;color:#6b6b6b;line-height:1.55"><strong style="color:#0f0f0f">Marlenyi Paredes</strong> · Florida Real Estate Broker · BK3530153<br>Aari Transactions LLC · hello@aaritransactions.com · 239.688.1770</div></div></div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: "We have your file.", html }),
    });
  } catch (_e) { /* best-effort */ }
}

async function forwardSaPdf(fwd: Record<string, unknown>): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/aari-sa-pdf-email`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` }, body: JSON.stringify(fwd) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && (d as any)?.ok !== false, detail: d };
  } catch (_e) { return { ok: false }; }
}

async function creditPosture(admin: any, agentId: string): Promise<{ credits_total: number; credits_remaining: number; credits_reset_at: string | null; membership_tier: string | null } | null> {
  const { data: mem } = await admin
    .from("memberships")
    .select("tier, status, credits_total, credits_used, activity_bonus_credits_remaining, current_period_end")
    .eq("agent_id", agentId)
    .in("status", ["active", "paused"])
    .limit(1)
    .maybeSingle();
  if (!mem) return null;
  const total = Number(mem.credits_total || 0);
  const used = Number(mem.credits_used || 0);
  const bonus = Number(mem.activity_bonus_credits_remaining || 0);
  const remaining = Math.max(0, total - used) + bonus;
  return { credits_total: total, credits_remaining: remaining, credits_reset_at: mem.current_period_end || null, membership_tier: mem.tier || null };
}

async function recentlyPinged(admin: any, name: string, hours: number): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await admin.from("system_pings").select("last_at").eq("name", name).gte("last_at", cutoff).limit(1).maybeSingle();
    return !!data;
  } catch (_e) { return false; }
}
async function markPinged(admin: any, name: string): Promise<void> {
  try { await admin.from("system_pings").upsert({ name, last_at: new Date().toISOString() }, { onConflict: "name" }); } catch (_e) {}
}

// v34 · Layout C · dashboard token grid picked by Marlenyi.
async function sendIntakeStartedPing(admin: any, opts: {
  agent_email: string; property?: string; service?: string; svc_label?: string;
  first_name?: string; is_member?: boolean; membership_tier?: string | null;
  credits_remaining?: number; agent_name?: string;
}): Promise<void> {
  if (!RESEND_KEY) return;
  const email = String(opts.agent_email || "").trim().toLowerCase();
  if (!validEmail(email)) return;
  const svc = String(opts.service || "").toLowerCase();
  const pingName = `intake_started|${email}|${svc}`;
  if (await recentlyPinged(admin, pingName, 12)) return;

  const name = opts.first_name || opts.agent_name || "Someone";
  const svcLabel = opts.svc_label || svc || "a listing service";
  const property = opts.property || "(no address yet)";
  const agentDisplay = opts.first_name && opts.first_name !== email ? opts.first_name : "(not recognized)";
  const memberMain = opts.is_member
    ? "Aari Pro " + String(opts.membership_tier || "member").charAt(0).toUpperCase() + String(opts.membership_tier || "member").slice(1)
    : "Non member";
  const memberSub = opts.is_member ? Number(opts.credits_remaining || 0) + " free files left" : "No membership";

  const subject = `New intake · ${svcLabel} · ${property} · not paid`;
  const html =
    `<div style="background:#efeae0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#3a3428">` +
      `<div style="max-width:520px;margin:0 auto;background:#ffffff;border:0.5px solid #e6ddca;border-radius:16px;overflow:hidden">` +

        // TOP · badge + headline + sub
        `<div style="padding:22px 24px 18px;background:#faf7ef;border-bottom:0.5px solid #ede6d4;text-align:center">` +
          `<div style="display:inline-block;padding:4px 12px;background:#0f0f0f;color:#ffffff;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;border-radius:50px;font-weight:600">Not paid yet</div>` +
          `<h3 style=\"font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;color:#0f0f0f;letter-spacing:-0.3px;margin:12px 0 4px;line-height:1.2\">${esc(name)} started an order</h3>` +
          `<div style="font-size:12px;color:#6f6a61">Committed at slide 4 of the intake wizard.</div>` +
        `</div>` +

        // GRID · 2x2 using table for email-client compat
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">` +
          `<tr>` +
            `<td width="50%" style="padding:14px 18px;border-bottom:0.5px solid #f2eee4;border-right:0.5px solid #f2eee4;vertical-align:top">` +
              `<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8073;font-weight:600;margin-bottom:4px">Service</div>` +
              `<div style="font-size:13.5px;color:#0f0f0f;line-height:1.3">${esc(svcLabel)}</div>` +
            `</td>` +
            `<td width="50%" style="padding:14px 18px;border-bottom:0.5px solid #f2eee4;vertical-align:top">` +
              `<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8073;font-weight:600;margin-bottom:4px">Agent</div>` +
              `<div style="font-size:13.5px;color:#0f0f0f;line-height:1.3">${esc(agentDisplay)}</div>` +
            `</td>` +
          `</tr>` +
          `<tr>` +
            `<td width="50%" style="padding:14px 18px;border-bottom:0.5px solid #f2eee4;border-right:0.5px solid #f2eee4;vertical-align:top">` +
              `<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8073;font-weight:600;margin-bottom:4px">Member</div>` +
              `<div style="font-size:13.5px;color:#0f0f0f;line-height:1.3">${esc(memberMain)}<br><span style=\"font-size:11px;color:#8a8073\">${esc(memberSub)}</span></div>` +
            `</td>` +
            `<td width="50%" style="padding:14px 18px;border-bottom:0.5px solid #f2eee4;vertical-align:top">` +
              `<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8073;font-weight:600;margin-bottom:4px">Email</div>` +
              `<div style="font-size:12.5px;color:#0f0f0f;line-height:1.3;word-break:break-all">${esc(email)}</div>` +
            `</td>` +
          `</tr>` +
          `<tr>` +
            `<td colspan="2" style="padding:14px 18px;border-bottom:0.5px solid #f2eee4;vertical-align:top">` +
              `<div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8073;font-weight:600;margin-bottom:4px">Property</div>` +
              `<div style="font-size:13.5px;color:#0f0f0f;line-height:1.3">${esc(property)}</div>` +
            `</td>` +
          `</tr>` +
        `</table>` +

        // FOOTER
        `<div style="padding:16px 18px;font-size:12px;color:#6f6a61;line-height:1.55;background:#faf7ef"><strong style="color:#0f0f0f">Nothing charged.</strong> Abandoned checkout nudges to the client fire at T+30 min, T+2 h, T+24 h. Dedup&rsquo;d 12 hours.</div>` +

      `</div>` +
    `</div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [INTAKE_PING_TO], reply_to: REPLY_TO, subject, html }),
    });
    await markPinged(admin, pingName);
  } catch (_e) {}
}

const AGENT_COLS = "id, first_name, last_name, email, role, agreement_signed_at";
const fullName = (r: any) => r ? [r.first_name, r.last_name].filter(Boolean).join(" ").trim() : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "Invalid JSON" }); }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const intent = String(body.intent || "contract").toLowerCase();

  let authAgent: any = null;
  let authEmail = "";
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    try {
      const { data: u } = await admin.auth.getUser(token);
      if (u?.user) {
        authEmail = String(u.user.email || "").trim();
        const { data: rows } = await admin.from("agents").select(AGENT_COLS).eq("id", u.user.id).limit(1);
        authAgent = (rows && rows[0]) || null;
        if (!authAgent && authEmail) {
          const { data: r2 } = await admin.from("agents").select(AGENT_COLS).ilike("email", authEmail).limit(1);
          authAgent = (r2 && r2[0]) || null;
        }
      }
    } catch (_e) {}
  }

  const agent_email = (authAgent && authAgent.email) || authEmail || String(body.agent_email || "").trim();
  if (!validEmail(agent_email)) return j(400, { ok: false, error: "A valid email is required." });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
  const terms = { version: String(body.terms_version || "").trim(), accepted: body.terms_accepted === true, accepted_at: new Date().toISOString(), ip };

  const sa = (body.sa && typeof body.sa === "object" && body.sa.accepted === true && String(body.sa.typed_name || "").trim().length >= 3)
    ? { version: String(body.sa.version || "v4.8").trim(), typed_name: String(body.sa.typed_name).trim().slice(0, 120), accepted: true,
        signed_at: String(body.sa.signed_at_iso || "").trim() || new Date().toISOString(),
        user_agent: String(body.sa.user_agent || "").slice(0, 400), locale: String(body.sa.locale || "").slice(0, 40), ip }
    : null;

  const submitted_via = authAgent ? "portal_authenticated" : "public";

  if (intent === "check_email" || intent === "whoami") {
    if (authAgent) {
      const posture = await creditPosture(admin, authAgent.id);
      return j(200, { ok: true, recognized: true, authenticated: true, name: fullName(authAgent), first_name: authAgent.first_name || "", signed: !!authAgent.agreement_signed_at,
        has_membership: !!posture, membership_tier: posture?.membership_tier || null,
        credits_total: posture?.credits_total ?? 0, credits_remaining: posture?.credits_remaining ?? 0, credits_reset_at: posture?.credits_reset_at ?? null });
    }
    const { data: m } = await admin.from("agents").select("id, first_name").ilike("email", agent_email).limit(1);
    const row = m && m[0];
    let posture = null;
    if (row) posture = await creditPosture(admin, row.id);
    return j(200, { ok: true, recognized: !!row, authenticated: false,
      name: row ? (row.first_name || "") : null, first_name: row ? (row.first_name || "") : null,
      has_membership: !!posture, membership_tier: posture?.membership_tier || null,
      credits_total: posture?.credits_total ?? 0, credits_remaining: posture?.credits_remaining ?? 0, credits_reset_at: posture?.credits_reset_at ?? null });
  }

  if (intent === "intake_started") {
    const svc = String(body.svc || body.service || "").toLowerCase();
    const svcLabel = String(body.svc_label || "").slice(0, 80) || (svc ? svc.replace(/_/g, " ") : "Listing service");
    const property = String(body.property || "").trim().slice(0, 240);
    let firstName = String(body.first_name || "").trim();
    let isMember = body.is_member === true;
    let tier: string | null = String(body.membership_tier || "").trim() || null;
    let creditsRemaining = Number(body.credits_remaining || 0);
    try {
      if (!firstName || !tier) {
        const { data: agRow } = await admin.from("agents").select("id, first_name").ilike("email", agent_email).limit(1);
        const row = agRow && agRow[0];
        if (row) {
          if (!firstName) firstName = row.first_name || "";
          const p = await creditPosture(admin, row.id);
          if (p) { isMember = true; tier = tier || p.membership_tier; creditsRemaining = p.credits_remaining; }
        }
      }
    } catch (_e) {}
    sendIntakeStartedPing(admin, {
      agent_email, property, service: svc, svc_label: svcLabel,
      first_name: firstName, agent_name: fullName(authAgent),
      is_member: isMember, membership_tier: tier, credits_remaining: creditsRemaining,
    }).catch(() => {});
    return j(200, { ok: true, mode: "intake_started" });
  }

  if (intent === "sa_pdf") {
    const typed = String(body.typed_name || body.agent_name || "").trim();
    if (typed.length < 3) return j(400, { ok: false, error: "A typed signature name is required." });
    const signedIso = String(body.signed_at_iso || "").trim() || new Date().toISOString();
    const sig = (typeof body.signature_data_url === "string" && body.signature_data_url.startsWith("data:image/")) ? body.signature_data_url.slice(0, 2000000) : "";
    const res = await forwardSaPdf({
      agent_name: typed, agent_email,
      agent_phone: String(body.agent_phone || "").slice(0, 40),
      agent_license: String(body.agent_license || "").slice(0, 40),
      agent_license_state: String(body.agent_license_state || "FL").slice(0, 10),
      agent_brokerage: String(body.agent_brokerage || "").slice(0, 120),
      signed_at_iso: signedIso,
      signed_at_display: String(body.signed_at_display || "").slice(0, 80) || new Date(signedIso).toLocaleString("en-US", { timeZone: "America/New_York" }),
      signature_data_url: sig,
      agreement_version: String(body.agreement_version || "4.8").replace(/^v/i, "").slice(0, 10),
      user_agent: String(body.user_agent || "").slice(0, 400),
      locale: String(body.locale || "").slice(0, 40),
    });
    return j(res.ok ? 200 : 502, { ok: res.ok, mode: "sa_pdf", detail: res.detail });
  }

  if (intent === "service") {
    const svc = String(body.svc || "").toLowerCase();
    const ALLOWED = ["offer_prep_basic", "offer_prep_complete", "listing_docs", "mls_setup", "file_organization", "standalone_review", "listing_coordinator"];
    if (!ALLOWED.includes(svc)) return j(400, { ok: false, error: "Unknown service." });
    const property = String(body.property || "").trim();
    if (!property) return j(400, { ok: false, error: "The property is required." });
    const listingSvcs = ["listing_docs", "mls_setup", "listing_coordinator"];
    const isListing = listingSvcs.includes(svc);
    const file_type = isListing ? "listing" : "sale";
    const client_type = isListing ? "seller" : "buyer";
    const id = crypto.randomUUID();
    const preferred_tc_id = String(body.preferred_tc_id || "none").toLowerCase();
    const mlsNames = Array.isArray(body.mls_names) ? body.mls_names.map((n: unknown) => String(n || "").trim()).filter(Boolean).slice(0, 20) : [];
    let contract_path = "";
    if (body.contract_base64) {
      try { contract_path = await upload(admin, id, body.contract_base64, body.contract_filename || "listing_agreement.pdf"); }
      catch (e) { return j(400, { ok: false, error: (e as Error).message }); }
    }
    const agentId = (authAgent && authAgent.agreement_signed_at) ? authAgent.id : null;
    const raw: any = { source: "public_submit_service", submitted_via, agent_email, agent_name: fullName(authAgent) || String(body.agent_name || "").trim(), buyer: String(body.buyer || "").trim(), service: svc, preferred_tc_id, mls_names: mlsNames, contract_path, terms };
    if (sa) raw.sa = sa;
    if (authAgent) raw.auth_agent_id = authAgent.id;
    const insertRow: any = { id, property_address: property, service_type: svc, file_type, status: "intake_received", client_type, payment_pending: true, agent_id: agentId, raw_form_data: raw };
    if (mlsNames.length) insertRow.mls_names = mlsNames.join(", ");
    const ins = await admin.from("files").insert(insertRow).select("id").maybeSingle();
    if (ins.error) return j(500, { ok: false, error: "Submit failed: " + ins.error.message });
    if (sa) {
      forwardSaPdf({ agent_name: sa.typed_name, agent_email, signed_at_iso: sa.signed_at, signed_at_display: new Date(sa.signed_at).toLocaleString("en-US", { timeZone: "America/New_York" }), signature_data_url: "", agreement_version: sa.version.replace(/^v/i, ""), user_agent: sa.user_agent, locale: sa.locale }).catch(()=>{});
    }
    if (!isListing) {
      await confirm(agent_email, "We have your request.", `Your <b>${esc(property)}</b> request is in.`, "Complete checkout and we begin right away. Your coordinator has already been notified.");
    }
    return j(200, { ok: true, file_id: id, mode: "service", service: svc, submitted_as: fullName(authAgent) || undefined });
  }

  if (intent === "offer") {
    const property = String(body.property || "").trim();
    if (!property) return j(400, { ok: false, error: "The property is required." });
    const plan = String(body.plan || "basic").toLowerCase();
    const service_type = plan === "complete" ? "offer_prep_complete" : "offer_prep_basic";
    const id = crypto.randomUUID();
    let pre_path = "";
    if (body.pre_approval_base64) {
      try { pre_path = await upload(admin, id, body.pre_approval_base64, body.pre_approval_name || "pre-approval.pdf"); }
      catch (e) { return j(400, { ok: false, error: (e as Error).message }); }
    }
    const raw: any = { source: "public_submit_offer", submitted_via, agent_email, agent_name: fullName(authAgent) || String(body.agent_name || "").trim(), buyer: String(body.buyer || "").trim(), offer_terms: { price: String(body.price || "").trim(), emd: String(body.emd || "").trim(), financing: String(body.financing || "").trim(), close_date: String(body.close_date || "").trim() }, plan, pre_approval_path: pre_path, terms };
    if (body.questionnaire && typeof body.questionnaire === "object") { try { const qs = JSON.stringify(body.questionnaire); if (qs.length <= 20000) raw.questionnaire = JSON.parse(qs); } catch (_e) {} }
    if (authAgent) raw.auth_agent_id = authAgent.id;
    const obRole = String((authAgent && authAgent.role) || "").toLowerCase();
    const ob = (authAgent && (obRole === "tc" || obRole === "broker") && body.on_behalf && typeof body.on_behalf === "object") ? body.on_behalf : null;
    let fileAgentId = (authAgent && authAgent.agreement_signed_at) ? authAgent.id : null;
    let confirmTo = agent_email;
    let paymentPending = true;
    const insertRow: any = { id, property_address: property, service_type, file_type: "sale", status: "intake_received", client_type: "buyer", agent_id: fileAgentId, raw_form_data: raw };
    if (ob) {
      const obEmail = String(ob.agent_email || "").trim().toLowerCase();
      const obName = String(ob.agent_name || "").trim().slice(0, 120);
      const billing = ob.billing_model === "in_house" ? "in_house" : "outside_client";
      let obRow: any = null;
      if (validEmail(obEmail)) { const { data: r } = await admin.from("agents").select(AGENT_COLS).ilike("email", obEmail).limit(1); obRow = (r && r[0]) || null; }
      fileAgentId = (obRow && obRow.agreement_signed_at) ? obRow.id : null;
      paymentPending = billing === "outside_client";
      raw.agent_email = validEmail(obEmail) ? obEmail : agent_email;
      raw.agent_name = obName || fullName(obRow);
      raw.portal_tc_id = authAgent.id;
      raw.billing_model = billing;
      insertRow.agent_id = fileAgentId;
      insertRow.assigned_tc_id = authAgent.id;
      confirmTo = validEmail(obEmail) ? obEmail : agent_email;
    }
    insertRow.payment_pending = paymentPending;
    const ins = await admin.from("files").insert(insertRow).select("id").maybeSingle();
    if (ins.error) return j(500, { ok: false, error: "Submit failed: " + ins.error.message });
    await confirm(confirmTo, "We are drafting your offer.", `Your offer on <b>${esc(property)}</b> is in.`, ob && !paymentPending ? "Your coordinator has it and drafting begins right away." : "Once checkout is complete we draft it and send it back for signature today.");
    return j(200, { ok: true, file_id: id, mode: "offer", property, submitted_as: ob ? (raw.agent_name || undefined) : (fullName(authAgent) || undefined) });
  }

  const { pdf_base64, filename, side, fields } = body;
  if (!pdf_base64) return j(400, { ok: false, error: "A contract is required to submit a file." });
  const id = crypto.randomUUID();
  let path = "";
  try { path = await upload(admin, id, pdf_base64, filename || "contract.pdf"); }
  catch (e) { return j(400, { ok: false, error: (e as Error).message }); }

  const sSide = String(side || "").toLowerCase();
  const service_type = sSide === "both" ? "tc_both_sides" : "tc_one_side";
  const client_type = sSide === "seller" ? "seller" : (sSide === "both" ? "both" : "buyer");
  const f = (fields && typeof fields === "object") ? fields : {};
  const address = (f.address && String(f.address).trim()) || "New file (pending review)";

  let agentRow = authAgent;
  if (!agentRow) { const { data: agentMatches } = await admin.from("agents").select(AGENT_COLS).ilike("email", agent_email).limit(1); agentRow = (agentMatches && agentMatches[0]) || null; }

  const agentId = (agentRow && agentRow.agreement_signed_at) ? agentRow.id : null;
  const agentName = fullName(agentRow);

  const providedName = [String(body.first_name || "").trim(), String(body.last_name || "").trim()].filter(Boolean).join(" ").trim() || (sa ? sa.typed_name : "");
  if (!agentRow && !providedName) return j(400, { ok: false, need_name: true, error: "Your name is required." });

  const raw: any = { contract_path: path, source: "public_submit", submitted_via, agent_email, agent_name: agentName || providedName, lender_name: String(body.lender_name || "").trim(), lender_email: String(body.lender_email || "").trim(), extracted_contract: { fields: f, source: "public-submit/client", at: new Date().toISOString() }, terms };
  if (sa) raw.sa = sa;
  if (authAgent) raw.auth_agent_id = authAgent.id;
  const ins = await admin.from("files").insert({ id, property_address: address, service_type, file_type: "sale", status: "intake_received", client_type, agent_id: agentId, raw_form_data: raw }).select("id").maybeSingle();
  if (ins.error) return j(500, { ok: false, error: "Submit failed: " + ins.error.message });

  try { await fetch(`${SUPABASE_URL}/functions/v1/extract-contract-fields`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` }, body: JSON.stringify({ file_id: id, contract_path: path, write: true }) }); } catch (_e) {}

  if (sa) { await forwardSaPdf({ agent_name: agentName || providedName || sa.typed_name, agent_email, signed_at_iso: sa.signed_at, signed_at_display: new Date(sa.signed_at).toLocaleString("en-US", { timeZone: "America/New_York" }), signature_data_url: "", agreement_version: sa.version.replace(/^v/i, ""), user_agent: sa.user_agent, locale: sa.locale }); }

  await confirm(agent_email, "We have your file.", `Your file on <b>${esc(address)}</b> is in.`, "Your coordinator reviews it and reaches out today. Nothing is billed until you close.");
  return j(200, { ok: true, file_id: id, mode: "contract", address, submitted_as: agentName || undefined });
});

// Edge function: platform-alert (September 2026)
// ============================================================================
// One place, many kinds. When something on the platform crosses a line that
// deserves broker eyes, any caller (edge function, DB trigger, front-end) POSTs
// here and Marlenyi gets a short status card with the address, the people
// involved, and a link to the file.
//
// This function is INTENTIONALLY minimal. It does not decide policy — callers
// tell us what happened and pass the context; we format + send. That way the
// "should I even alert on this" logic lives at the source (the invoice submit
// path, the intake insert, the DB trigger) where the data is already in hand,
// and one template renders every kind consistently. Self-contained (no shared
// React Email deps) so a first-time deploy has no bundle surprises.
//
// KINDS (extend the switch below; keep them stable — the DB trigger references
// these strings):
//   duplicate_address     · two+ active files at the same street address
//   co_invoice            · two different TCs put the same address on invoices.
//                           Hibiscus co-op is auto-approved (severity=info);
//                           everything else is severity=review.
//   file_reassigned       · assigned_tc_id changed
//   file_unarchived       · status went from 'archived' → not archived
//   needs_agent_link      · file created with raw_form_data.needs_agent_link=true
//   manual_paid_mark      · paid_at set with no stripe_checkout_session_id
//   closed_file_edit      · any update to a file whose status is 'closed'
//
// PAYLOAD:  { kind, file_id?, address?, extra? }
// TO:       ALERT_TO env var (defaults to marlenyi@aarirealty.com).
//
// PREVIEW:  POST { "preview_to": "<email>", "kind": "co_invoice" } renders a
// sample with dummy data — subject prefixed "TEST ·" — without hitting the DB.
// Use it to sanity-check the template after edits.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "resend";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
if (!RESEND_KEY) throw new Error("RESEND_API_KEY is not set in Supabase edge function secrets.");
const resend = new Resend(RESEND_KEY);
const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://aaritransactions.com";
const ALERT_TO = Deno.env.get("ALERT_TO") ?? "marlenyi@aarirealty.com";

type AlertKind =
  | "duplicate_address"
  | "co_invoice"
  | "file_reassigned"
  | "file_unarchived"
  | "needs_agent_link"
  | "manual_paid_mark"
  | "closed_file_edit";

interface AlertBody {
  kind?: AlertKind;
  file_id?: string | null;
  address?: string | null;
  extra?: Record<string, unknown> | null;
  preview_to?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  tc: "Full TC",
  tc_one_side: "TC · one side",
  tc_both_sides: "TC · both sides",
  listing_coordinator: "Listing Coordinator",
  listing_docs: "Listing Docs",
  mls_setup: "MLS Setup",
  file_organization: "File Organization",
  standalone_review: "Standalone Review",
  offer_prep_basic: "Offer Prep",
  offer_prep_complete: "Offer Prep Complete",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let body: AlertBody;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body.kind) return json({ ok: false, error: "missing_kind" }, 400);

  // ---- Preview mode: send a sample with dummy data, no DB read ----
  if (body.preview_to) {
    const preview = renderPreview(body.kind);
    if (!preview) return json({ ok: false, error: "unknown_kind" }, 400);
    const r = await sendEmail(body.preview_to, "TEST · " + preview.subject, preview.html);
    return json({ ok: true, mode: "preview", ...r });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Look up the file if given so the email has a name/address without the
  // caller pre-fetching. Best-effort — a missing file renders "unknown".
  let file: Record<string, unknown> | null = null;
  if (body.file_id) {
    const { data } = await admin
      .from("files")
      .select("id, property_address, service_type, file_type, status, assigned_tc_id, agent_id, paid_at, raw_form_data")
      .eq("id", body.file_id)
      .maybeSingle();
    file = data ?? null;
  }
  const address = body.address ?? (file?.property_address as string | null) ?? "(unknown address)";

  const tcId = (file?.assigned_tc_id as string | null) ?? (body.extra?.tc_id as string | null) ?? null;
  const tcName = await tcNameFor(admin, tcId);
  const svc = (file?.service_type as string | null) ?? null;
  const svcLabel = svc ? (SERVICE_LABELS[svc] ?? svc) : null;
  const fileUrl = file?.id ? `${SITE_URL}/files.html?open=${file.id}` : undefined;

  const built = build(body, file, { address, tcName, svcLabel });
  if (!built) return json({ ok: false, error: "unknown_kind" }, 400);

  const html = renderCard({
    title: built.title,
    headline: built.headline,
    rows: built.rows,
    fileUrl,
    noteBelow: built.noteBelow,
    severity: built.severity ?? "review",
  });

  const r = await sendEmail(ALERT_TO, built.subject, html);
  return json({ ok: r.sent, ...r });
});

// ---- template-per-kind ---------------------------------------------------

type Row = { label: string; value: string };
type Built = { subject: string; title: string; headline: string; rows: Row[]; noteBelow?: string; severity?: "info" | "review" };

function build(
  body: AlertBody,
  file: Record<string, unknown> | null,
  ctx: { address: string; tcName: string; svcLabel: string | null },
): Built | null {
  const { kind, extra } = body;
  const rf = (file?.raw_form_data as Record<string, unknown> | null) ?? null;

  if (kind === "duplicate_address") {
    const others = (extra?.other_ids as string[]) ?? [];
    return {
      subject: `Duplicate address on intake · ${ctx.address}`,
      title: "Duplicate address on intake",
      headline: `A new file was created at ${ctx.address}, but ${others.length} active file${others.length === 1 ? "" : "s"} already exist${others.length === 1 ? "s" : ""} at this address. Look and archive the one that shouldn't be there.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "New file · TC", value: ctx.tcName },
        { label: "New file · service", value: ctx.svcLabel ?? "—" },
        { label: "Other active files", value: `${others.length}` },
      ],
      severity: "review",
    };
  }

  if (kind === "co_invoice") {
    const approved = !!rf?.co_invoice_approved || !!(extra?.approved);
    const groupNote = rf?.co_invoice_note as string | undefined;
    const otherTc = (extra?.other_tc_name as string | undefined) ?? "another TC";
    const week = (extra?.week as string | undefined) ?? "this week";
    return {
      subject: approved
        ? `Co-invoice · ${ctx.address} (approved)`
        : `Two TCs invoicing · ${ctx.address}`,
      title: approved ? "Co-invoice submitted (approved)" : "Two TCs invoicing the same address",
      headline: approved
        ? `${ctx.tcName} just submitted their invoice line for ${ctx.address}. This address is on the approved co-invoice list — ${otherTc} also invoices it.`
        : `${ctx.tcName} submitted an invoice line for ${ctx.address} in ${week}, but ${otherTc} also invoices this address. Confirm both should be paid, or archive the dupe on your end.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "This TC", value: ctx.tcName },
        { label: "Other TC on address", value: otherTc },
        { label: "Service", value: ctx.svcLabel ?? "—" },
        { label: "Week", value: week },
        { label: "Approved pair", value: approved ? "Yes" : "No — please review" },
      ],
      noteBelow: approved
        ? (groupNote ?? "Approved co-invoice pair — no action needed.")
        : "If this is a mistake, open the file and archive the dupe. If both should get paid, mark the pair approved so future runs don't ping you.",
      severity: approved ? "info" : "review",
    };
  }

  if (kind === "file_reassigned") {
    const from = (extra?.from_tc_name as string | undefined) ?? (extra?.from_tc_id ? "another TC" : "unassigned");
    const to = (extra?.to_tc_name as string | undefined) ?? ctx.tcName;
    return {
      subject: `File reassigned · ${ctx.address}`,
      title: "File reassigned",
      headline: `${ctx.address} moved from ${from} to ${to}.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "From", value: from },
        { label: "To", value: to },
        { label: "Service", value: ctx.svcLabel ?? "—" },
      ],
      severity: "info",
    };
  }

  if (kind === "file_unarchived") {
    return {
      subject: `File unarchived · ${ctx.address}`,
      title: "File unarchived",
      headline: `${ctx.tcName} brought ${ctx.address} back to the active board.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "TC", value: ctx.tcName },
        { label: "Service", value: ctx.svcLabel ?? "—" },
        { label: "Now status", value: String(file?.status ?? "—") },
      ],
      severity: "review",
    };
  }

  if (kind === "needs_agent_link") {
    const typedName = (rf?.new_agent_name as string | undefined)
                   ?? (extra?.new_agent_name as string | undefined)
                   ?? "(name not captured)";
    return {
      subject: `New agent needs linking · ${typedName}`,
      title: "New agent typed on intake",
      headline: `${ctx.tcName} submitted a file for "${typedName}", who isn't on the agent roster. Link them so the file threads under the right agent.`,
      rows: [
        { label: "Typed name", value: typedName },
        { label: "Address", value: ctx.address },
        { label: "TC", value: ctx.tcName },
        { label: "Service", value: ctx.svcLabel ?? "—" },
      ],
      severity: "review",
    };
  }

  if (kind === "manual_paid_mark") {
    const amount = extra?.amount_paid as number | null | undefined;
    const method = (extra?.method as string | undefined) ?? "manual";
    return {
      subject: `File marked paid manually · ${ctx.address}`,
      title: "File marked paid without a Stripe webhook",
      headline: `${ctx.tcName} marked ${ctx.address} as paid manually (method: ${method}). Stripe didn't trigger the mark — confirm the money actually landed.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "TC", value: ctx.tcName },
        { label: "Service", value: ctx.svcLabel ?? "—" },
        { label: "Amount", value: amount != null ? `$${(Number(amount) / 100).toFixed(2)}` : "—" },
        { label: "Method", value: method },
      ],
      severity: "review",
    };
  }

  if (kind === "closed_file_edit") {
    const fields = (extra?.fields as string[] | undefined) ?? [];
    return {
      subject: `Closed file was edited · ${ctx.address}`,
      title: "Closed file was edited",
      headline: `${ctx.tcName} edited ${ctx.address} after it was marked closed. Usually you don't want this — take a look.`,
      rows: [
        { label: "Address", value: ctx.address },
        { label: "TC", value: ctx.tcName },
        { label: "Fields changed", value: fields.length ? fields.join(", ") : "(unspecified)" },
      ],
      severity: "review",
    };
  }

  return null;
}

// ---- rendering (inline HTML — no React deps) ------------------------------

function renderCard(a: { title: string; headline: string; rows: Row[]; fileUrl?: string; noteBelow?: string; severity: "info" | "review" }): string {
  const chipBg = a.severity === "info" ? "#dcfce7" : "#ffedd5";
  const chipFg = a.severity === "info" ? "#14532d" : "#7a2f00";
  const chipTx = a.severity === "info" ? "PLATFORM · FYI" : "PLATFORM · REVIEW";
  const rowsHtml = a.rows.map((r) => `
    <tr>
      <td style="font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:#7a6238;padding:10px 12px;border-bottom:1px solid #f1ecdf;background:#faf7ef;width:38%;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:600">${esc(r.label)}</td>
      <td style="font-size:13.5px;color:#0f0f0f;padding:10px 12px;border-bottom:1px solid #f1ecdf;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${esc(r.value)}</td>
    </tr>`).join("");
  const btn = a.fileUrl
    ? `<div style="margin:22px 0 6px"><a href="${esc(a.fileUrl)}" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Open the file</a></div>`
    : "";
  const note = a.noteBelow
    ? `<div style="font-size:12.5px;line-height:1.55;color:#7a6238;margin:22px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${esc(a.noteBelow)}</div>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(a.title)}</title></head>
<body style="margin:0;padding:0;background:#f7f3e9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3e9">
    <tr><td align="center" style="padding:28px 16px">
      <table role="presentation" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <tr><td>
          <div style="display:inline-block;font-size:10.5px;letter-spacing:1.2px;font-weight:700;padding:5px 10px;border-radius:999px;color:${chipFg};background:${chipBg};margin-bottom:14px">${chipTx}</div>
          <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 14px;color:#0f0f0f">${esc(a.title)}</h1>
          <p style="font-size:15px;line-height:1.6;color:#0f0f0f;margin:0 0 18px">${esc(a.headline)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e7e2d6;border-radius:6px;overflow:hidden">
            <tbody>${rowsHtml}</tbody>
          </table>
          ${btn}
          ${note}
          <div style="font-size:11.5px;color:#a99a76;margin:28px 0 0;text-align:center;letter-spacing:.4px">Aari Transactions · platform alert</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---- helpers --------------------------------------------------------------

async function tcNameFor(admin: any, id: string | null): Promise<string> {
  if (!id) return "unknown TC";
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    const email = data?.user?.email;
    if (email) return prettyName(email);
  } catch (_) { /* ignore */ }
  return id.slice(0, 8);
}

function prettyName(email: string): string {
  const local = String(email).split("@")[0] || email;
  return local
    .split(/[._-]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to: [to], subject, html });
    if (error) return { sent: false, error: String(error.message ?? error) };
    return { sent: true, id: (data as any)?.id };
  } catch (e) {
    return { sent: false, error: (e as any)?.message ?? String(e) };
  }
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ---- preview mode ---------------------------------------------------------

function renderPreview(kind: AlertKind): { subject: string; html: string } | null {
  const fakeCtx = { address: "1219 Hibiscus Ave, Lehigh Acres, Florida 33972", tcName: "Milennys Re", svcLabel: "File Organization" };
  const built = build(
    { kind, extra: { other_tc_name: "Eileen Refl", week: "2026-08-30 – 2026-09-05", approved: kind === "co_invoice", other_ids: ["fake-id"], new_agent_name: "Alied Machuca", amount_paid: 20000, method: "zelle", fields: ["closing_date","purchase_price_cents"] } },
    { raw_form_data: { co_invoice_approved: kind === "co_invoice", co_invoice_note: "Milennys + Eileen both run File Organization on this address; approved by Marlenyi.", new_agent_name: "Alied Machuca" }, status: "closed" } as any,
    fakeCtx,
  );
  if (!built) return null;
  return {
    subject: built.subject,
    html: renderCard({ title: built.title, headline: built.headline, rows: built.rows, fileUrl: `${SITE_URL}/files.html?open=fake-id`, noteBelow: built.noteBelow, severity: built.severity ?? "review" }),
  };
}

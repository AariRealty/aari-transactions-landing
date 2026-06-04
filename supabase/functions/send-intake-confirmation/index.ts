// Edge function: send-intake-confirmation (Section 8 · Task 8.2)
// Trigger: tc_files INSERT (via DB trigger -> call_edge_function)
// Payload: { file_id: uuid, agent_id: uuid }
//
// Loads the full file row + uploaded documents and renders a confirmation
// email that includes every piece of information the agent submitted, with
// the verbatim note at the bottom (rendered inside the template).

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { IntakeConfirmation } from "../_email-templates/IntakeConfirmation.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: { file_id?: string; agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.file_id || !body.agent_id) {
    return json({ ok: false, error: "missing_file_or_agent" }, 400);
  }

  // Load agent
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, email")
    .eq("id", body.agent_id)
    .single();
  if (agentErr || !agent) return json({ ok: false, error: "agent_not_found" }, 404);

  // Load the full file row · select * so we surface every column the agent submitted
  // V3 intake writes to `files` · legacy submissions live in `tc_files`.
  let { data: file } = await supabaseAdmin
    .from("files")
    .select("*")
    .eq("id", body.file_id)
    .maybeSingle();
  if (!file) {
    const legacy = await supabaseAdmin
      .from("tc_files")
      .select("*")
      .eq("id", body.file_id)
      .maybeSingle();
    file = legacy.data;
  }

  // Load uploaded documents for this file
  const { data: docs } = await supabaseAdmin
    .from("file_documents")
    .select("filename, content_type, size_bytes, uploaded_at")
    .eq("file_id", body.file_id)
    .order("uploaded_at", { ascending: true });

  const f: Record<string, unknown> = file || {};
  const get = (key: string): string | null => {
    const v = f[key];
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  };
  const fmtCurrency = (key: string): string | null => {
    const v = get(key);
    if (!v) return null;
    const n = Number(String(v).replace(/[^0-9.]/g, ""));
    if (!isFinite(n)) return v;
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  };
  const fmtDate = (key: string): string | null => {
    const v = get(key);
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString("en-US", { dateStyle: "long" });
  };

  const submittedAt = file?.created_at
    ? new Date(file.created_at as string).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/New_York",
      })
    : new Date().toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/New_York",
      });

  // Build the section list. Sections with zero non-null rows hide automatically.
  const sections = [
    {
      title: "Service",
      rows: [
        { label: "Service", value: get("service_name") || get("service_type") },
        { label: "Price", value: fmtCurrency("service_price") },
        { label: "Payment", value: get("payment_status") || get("payment_method") },
      ],
    },
    {
      title: "Client & Property",
      rows: [
        { label: "Client type", value: get("client_type") },
        { label: "Property address", value: get("property_address") || get("address") },
        { label: "Buyer entity type", value: get("buyer_entity_type") },
        { label: "Buyer entity name", value: get("buyer_entity_name") },
        { label: "Seller entity type", value: get("seller_entity_type") },
        { label: "Seller entity name", value: get("seller_entity_name") },
        { label: "Client name", value: get("client_name") || get("seller_name") },
        { label: "Client email", value: get("client_email") || get("seller_email") },
        { label: "Client phone", value: get("client_phone") || get("seller_phone") },
        { label: "Co-borrower / Co-seller", value: get("co_party") },
        { label: "Signer 2", value: get("signer_2_name") },
        { label: "Signer 3", value: get("signer_3_name") },
        { label: "Signer 4", value: get("signer_4_name") },
      ],
    },
    {
      title: "Transaction",
      rows: [
        { label: "Deal type", value: get("deal_type") },
        { label: "Effective date", value: fmtDate("effective_date") },
        { label: "Closing date", value: fmtDate("closing_date") },
        { label: "Purchase price", value: fmtCurrency("purchase_price") },
        { label: "Earnest money", value: fmtCurrency("earnest_money") || get("earnest_money") },
        { label: "Listing price", value: fmtCurrency("listing_price") },
        { label: "Offer price", value: fmtCurrency("offer_price") },
      ],
    },
    {
      title: "Lender",
      rows: [
        { label: "Lender contact", value: get("lender_name") },
        { label: "Lender company", value: get("lender_company") },
        { label: "Lender email", value: get("lender_email") },
        { label: "Lender phone", value: get("lender_phone") },
        { label: "Cash deal", value: (get("lender_is_cash") === "1" || get("lender_is_cash") === "true") ? "Yes" : null },
      ],
    },
    {
      title: "Title / Closing Agent",
      rows: [
        { label: "Has title company", value: get("has_title_company") },
        { label: "Title agent", value: get("title_name") },
        { label: "Title company", value: get("title_company") },
        { label: "Title email", value: get("title_email") },
        { label: "Title phone", value: get("title_phone") },
      ],
    },
    {
      title: "Assignment",
      rows: [
        { label: "Preferred TC", value: get("preferred_tc") },
        { label: "Assigned TC ID", value: get("tc_assigned_id") },
      ],
    },
    {
      title: "Service Agreement",
      rows: [
        { label: "Version", value: get("service_agreement_version") },
        { label: "Signed by", value: get("service_agreement_typed_name") },
        { label: "Signed at", value: get("service_agreement_timestamp") || get("service_agreement_signed_at") },
      ],
    },
  ];

  // Build document list from file_documents table + inline columns on the file row.
  const documents: string[] = [];
  if (docs && docs.length > 0) {
    for (const d of docs) documents.push(d.filename);
  }
  const inlineDocs = ["executed_contract", "addenda_disclosures", "listing_agreement", "listing_disclosures", "closing_docs"];
  for (const k of inlineDocs) {
    const v = get(k);
    if (v && !documents.includes(v)) documents.push(`${k.replace(/_/g, " ")} · ${v}`);
  }

  const result = await sendEmail({
    to: agent.email,
    toUserId: agent.id,
    relatedFileId: body.file_id,
    category: "transactional",
    subject: "We have your file. Here's everything you submitted.",
    templateName: "intake_confirmation",
    reactElement: React.createElement(IntakeConfirmation, {
      firstName: agent.first_name ?? "there",
      fileId: body.file_id.slice(0, 8),
      submittedAt,
      portalUrl: `${SITE_URL}/portal.html`,
      sections,
      documents,
    }),
    payload: { file_id: body.file_id, agent_id: agent.id, section_count: sections.length, doc_count: documents.length },
  });

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

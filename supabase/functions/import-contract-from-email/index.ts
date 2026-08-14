// ============================================================================
// Aari Transactions · import-contract-from-email
// ============================================================================
// Receives an executed-contract PDF (base64) from the Gmail Apps Script running
// in the aaritransactions Workspace. Two paths, decided by whether we can match
// this email to an existing file:
//
//   1. MATCH · thread_id already known OR subject contains a street address
//      that resolves to an active file · attach the PDF to that file (via
//      file_documents) and do NOT create a new file. This is where things like
//      "Re: Survey and title policy for 1611 NW 38th Ave" land · they're a
//      reply on an existing thread, not a new deal.
//
//   2. NO MATCH · create a new file in pending review, upload the contract,
//      run extraction. If the extractor comes back empty AND we still can't
//      resolve an address, the file is marked triage_needed so a human can
//      review before it clutters the pipeline. No phantom "New file (pending
//      review)" placeholders escalating to the broker anymore.
//
// Auth: shared secret in the x-import-secret header (baked into the Apps Script).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "transaction-files";
const SHARED_SECRET = "AARI-IMPORT-7Q2X9K4M8W"; // also in the Apps Script

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function normAddr(a: string): string {
  return String(a || "").toUpperCase().replace(/\s+/g, " ").split(",")[0].trim();
}

// Pull the first street-address-shaped token out of an email subject line.
// Examples we want to catch:
//   "Re: Survey and title policy for 1611 NW 38th Ave"
//   "Closing at 4700 32nd Ave SW"
//   "Contract · 509 NE 25th St, Cape Coral"
// The regex intentionally accepts NNN + optional directional (N/S/E/W/NE/NW/SE/SW) +
// street name words + a street suffix (Ave/St/Rd/Blvd/Ln/Dr/Cir/Ct/Ter/Way/Pkwy/Pl/Trl).
function extractAddressHint(subject: string): string {
  const s = String(subject || "");
  const m = s.match(/\b(\d{1,6})\s+(?:(?:N|S|E|W|NE|NW|SE|SW)\s+)?[A-Za-z][A-Za-z0-9'\-\.]*(?:\s+[A-Za-z][A-Za-z0-9'\-\.]*){0,4}\s+(Ave|Avenue|St|Street|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Cir|Circle|Ct|Court|Ter|Terrace|Way|Pkwy|Parkway|Pl|Place|Trl|Trail|Hwy|Highway)\b/i);
  return m ? m[0].trim() : "";
}

// Attach the uploaded PDF as a file_documents row on an existing file. Used
// on the MATCH path so a reply email doesn't spawn a duplicate file record.
async function attachToExisting(
  admin: ReturnType<typeof createClient>,
  existingFileId: string,
  bytes: Uint8Array,
  filename: string,
  subject: string,
  messageId: string | null,
  threadId: string | null,
): Promise<{ ok: boolean; error?: string; storage_path?: string }> {
  const safe = String(filename || "contract.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${existingFileId}/email-import-${Date.now()}-${safe}`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, error: "Attach upload failed: " + up.error.message };
  const { error: insErr } = await admin.from("file_documents").insert({
    file_id: existingFileId,
    filename: safe,
    storage_path: path,
    content_type: "application/pdf",
    size_bytes: bytes.length,
  });
  if (insErr) return { ok: false, error: "file_documents insert failed: " + insErr.message };
  // Log the import in raw_form_data so we know a reply landed on this file
  // (a lightweight breadcrumb for future audit / debugging).
  try {
    const { data: cur } = await admin.from("files").select("raw_form_data").eq("id", existingFileId).maybeSingle();
    const raw = ((cur as any)?.raw_form_data as Record<string, unknown>) || {};
    const imports = Array.isArray((raw as any).email_imports) ? (raw as any).email_imports : [];
    imports.push({
      at: new Date().toISOString(),
      subject, message_id: messageId, thread_id: threadId, storage_path: path, filename: safe,
    });
    (raw as any).email_imports = imports.slice(-20);   // keep last 20
    await admin.from("files").update({ raw_form_data: raw }).eq("id", existingFileId);
  } catch (_) { /* breadcrumb is best-effort */ }
  return { ok: true, storage_path: path };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { ok: false, error: "Method not allowed" });
  if (req.headers.get("x-import-secret") !== SHARED_SECRET) return j(401, { ok: false, error: "Bad secret" });

  let body: { pdf_base64?: string; filename?: string; agent_email?: string; subject?: string; message_id?: string; thread_id?: string; };
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "Invalid JSON" }); }
  if (!body.pdf_base64) return j(400, { ok: false, error: "pdf_base64 required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Dedup 1 · same email already imported (create + attach paths both stamp
  // import_message_id somewhere on the target file so this catches replays).
  if (body.message_id) {
    // create-path files have it in raw_form_data.import_message_id
    const { data: dup } = await admin.from("files").select("id").eq("raw_form_data->>import_message_id", body.message_id).maybeSingle();
    if (dup) return j(200, { ok: true, skipped: true, reason: "already_imported", file_id: dup.id });
    // attach-path files log it under raw_form_data.email_imports[].message_id
    try {
      const { data: attachedDup } = await admin.rpc("noop_placeholder"); // no rpc; do the JSON check inline below instead
      void attachedDup;
    } catch (_) { /* rpc guard */ }
    // Inline JSON check for the attach-path dedup.
    try {
      const { data: rows } = await admin.from("files")
        .select("id, raw_form_data")
        .filter("raw_form_data->email_imports", "not.is", null)
        .limit(500);
      const hit = (rows || []).find((r: any) => Array.isArray(r?.raw_form_data?.email_imports)
        && r.raw_form_data.email_imports.some((imp: any) => imp?.message_id === body.message_id));
      if (hit) return j(200, { ok: true, skipped: true, reason: "already_imported_as_attachment", file_id: (hit as any).id });
    } catch (_) { /* dedup guard */ }
  }

  // Decode the PDF once · used by both paths.
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(body.pdf_base64), (c) => c.charCodeAt(0)); }
  catch { return j(400, { ok: false, error: "pdf_base64 not valid base64" }); }

  // -----------------------------------------------------------------
  // MATCH PATH · try to attach to an existing file before creating one.
  // -----------------------------------------------------------------
  // (a) Thread-id match · previous email in this thread already imported.
  if (body.thread_id) {
    try {
      const { data: threadFile } = await admin.from("files")
        .select("id, property_address, status")
        .eq("raw_form_data->>import_thread_id", body.thread_id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (threadFile) {
        const att = await attachToExisting(admin, (threadFile as any).id, bytes, body.filename || "contract.pdf", body.subject || "", body.message_id || null, body.thread_id);
        if (att.ok) return j(200, { ok: true, matched: "thread", attached_to: (threadFile as any).id, storage_path: att.storage_path });
      }
    } catch (_) { /* thread match is best-effort · fall through to address hint */ }
  }
  // (b) Subject-address match · reply subjects like "Re: Survey and title
  // policy for 1611 NW 38th Ave" resolve to a file whose property_address
  // starts with the same street token.
  const hint = extractAddressHint(body.subject || "");
  if (hint) {
    try {
      const hintNorm = normAddr(hint);
      const { data: candidates } = await admin.from("files")
        .select("id, property_address, status")
        .neq("status", "archived")
        .ilike("property_address", `${hint}%`)
        .limit(20);
      const match = (candidates || []).find((f: any) => normAddr(f.property_address || "") === hintNorm)
        || (candidates || [])[0];
      if (match) {
        const att = await attachToExisting(admin, (match as any).id, bytes, body.filename || "contract.pdf", body.subject || "", body.message_id || null, body.thread_id || null);
        if (att.ok) return j(200, { ok: true, matched: "subject_address", attached_to: (match as any).id, address_hint: hint, storage_path: att.storage_path });
      }
    } catch (_) { /* address match is best-effort · fall through to create */ }
  }

  // -----------------------------------------------------------------
  // NO MATCH PATH · create a file, run extraction, then decide.
  // -----------------------------------------------------------------
  let agent_id: string | null = null;
  if (body.agent_email) {
    const { data: a } = await admin.from("agents").select("id").ilike("email", body.agent_email).maybeSingle();
    if (a) agent_id = a.id;
  }

  const raw: Record<string, unknown> = {
    imported_from_email: true, source: "email_import",
    import_message_id: body.message_id || null, import_thread_id: body.thread_id || null,
    import_subject: body.subject || null, contract_filename: body.filename || "contract.pdf",
  };
  const { data: created, error: insErr } = await admin.from("files").insert({
    service_type: "tc_one_side", file_type: "sale", status: "intake_received", txn_stage: "signed",
    property_address: "New file (pending review)", agent_id, raw_form_data: raw,
  }).select("id").single();
  if (insErr || !created) return j(500, { ok: false, error: "Create file failed: " + (insErr?.message || "unknown") });
  const fileId = created.id as string;

  const safe = String(body.filename || "contract.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${fileId}/contract-${Date.now()}-${safe}`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return j(500, { ok: false, error: "Contract upload failed: " + up.error.message, file_id: fileId });
  raw.contract_path = path;
  await admin.from("files").update({ raw_form_data: raw }).eq("id", fileId);

  // Run extraction (fills extracted_contract; the DB trigger fills property_address).
  let extracted = false;
  let extractedFields = 0;
  let extractedContractType = "";
  try {
    const ex = await fetch(`${SUPABASE_URL}/functions/v1/extract-contract-fields`, {
      method: "POST", headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    extracted = ex.ok;
    if (ex.ok) {
      try {
        const exBody = await ex.json();
        const fields = (exBody && (exBody as any).fields) || {};
        extractedFields = Object.keys(fields).length;
        extractedContractType = String((fields as any).contract_type || "");
      } catch (_) { /* body shape may vary · ignore */ }
    }
  } catch (_) { /* best-effort; the cockpit can re-extract / OCR */ }

  // Listing detection · the importer defaults every file to "sale", but an emailed LISTING agreement or
  // MLS input sheet should be a listing (Marlenyi Aug 14 2026 · 6044 Acorn came in as a sale because it
  // was an emailed listing agreement named "…ListAgree.pdf"). Flip the type when the document clearly
  // looks like a listing; anything ambiguous stays a sale and the TC can reclassify in one tap.
  try {
    const fn = String(body.filename || "").toLowerCase();
    const ct = extractedContractType.toLowerCase();
    const looksListing =
      /list\.?\s*agree|listing|exclusive\s*right\s*to\s*sell|\berts?\b|mls[_\s-]*input|mls[_\s-]*incoming/.test(fn) ||
      /listing|exclusive\s*right\s*to\s*sell/.test(ct);
    if (looksListing) {
      await admin.from("files").update({ file_type: "listing", service_type: "mls_setup" }).eq("id", fileId);
    }
  } catch (_) { /* detection is best-effort; the TC can reclassify in one tap */ }

  // Guard · extracted address dedup. If the extracted address matches an
  // existing active file, archive this copy so the same deal doesn't render
  // twice on the kanban.
  try {
    const { data: me } = await admin.from("files").select("property_address").eq("id", fileId).maybeSingle();
    const addr = normAddr((me as any)?.property_address || "");
    if (addr && !/^NEW FILE/.test(addr) && !/PENDING REVIEW/.test(addr)) {
      const { data: others } = await admin.from("files").select("id, property_address").neq("id", fileId).neq("status", "archived");
      const match = (others || []).find((f: any) => normAddr(f.property_address || "") === addr);
      if (match) {
        await admin.from("files").update({ status: "archived", raw_form_data: { ...raw, dedup_removed: true, dedup_reason: "email import duplicate of active file", duplicate_of: match.id } }).eq("id", fileId);
        return j(200, { ok: true, skipped: true, reason: "duplicate_address", duplicate_of: match.id, file_id: fileId });
      }
    }
  } catch (_) { /* dedup is best-effort */ }

  // Marlenyi 2026-08-11 · when extraction returned nothing AND the address
  // is still the placeholder, this is a phantom-shaped file. Flip it to
  // triage_needed so the sweep skips it and a human can decide (attach to
  // existing, delete, or fill address). We stop short of hard-deleting in
  // case the addendum is a real orphan.
  try {
    const { data: me2 } = await admin.from("files").select("property_address").eq("id", fileId).maybeSingle();
    const addr2 = normAddr((me2 as any)?.property_address || "");
    if (extractedFields === 0 && (/^NEW FILE/.test(addr2) || /PENDING REVIEW/.test(addr2))) {
      await admin.from("files").update({
        status: "triage_needed",
        raw_form_data: { ...raw, triage_reason: "email_import_no_address", extracted_fields: 0 },
      }).eq("id", fileId);
      return j(200, { ok: true, file_id: fileId, triage: true, reason: "no_address_from_extraction" });
    }
  } catch (_) { /* triage flag is best-effort */ }

  return j(200, { ok: true, file_id: fileId, extracted, agent_id, extractedFields });
});

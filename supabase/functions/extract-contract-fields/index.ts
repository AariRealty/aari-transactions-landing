// ============================================================================
// Aari Transactions · extract-contract-fields
// ============================================================================
// FREE contract field extraction. No AI, no per-file cost. Reads the PDF text
// layer with pdf.js, rebuilds page lines by position (poppler -layout quality),
// then pattern-matches the standard FR/BAR "AS IS" fields. Validated 100% on
// 1216NWOffer and 4518SWOffer (person seller, entity seller, multi-buyer).
//
// POST { file_id }                 → read the file's stored contract, parse, and
//                                     write a draft into raw_form_data.extracted_contract
// POST { pdf_base64, write:false } → parse an ad-hoc PDF, return fields only (testing)
//
// It NEVER writes a confirmed value. Output is a draft the TC confirms in the
// Contract terms + Parties steppers (each parsed field shows "from the contract").
// Financing type and HOA are checkboxes (not text) so they are intentionally not
// parsed — the agent already answers both at intake.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// unpdf bundles a DOM-free pdf.js built for serverless / Deno / Workers, which
// avoids the DOMMatrix/Path2D errors raw pdfjs-dist throws in the edge runtime.
import { getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("AARI_CONTRACT_BUCKET") ?? "transaction-files";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- pdf.js: text items -> reconstructed lines (cluster by y, sort by x) -------
async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(bytes);
  const TOL = 5;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as any[])
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: any[] }[] = [];
    for (const it of items) {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= TOL);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    const out: string[] = [];
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = "", lastEnd: number | null = null;
      for (const it of row.items) {
        if (lastEnd != null) {
          const gap = it.x - lastEnd;
          if (gap > 6) line += "  "; else if (line && !/\s$/.test(line)) line += " ";
        }
        line += it.s; lastEnd = it.x + (it.w || it.s.length * 4);
      }
      out.push(line);
    }
    pages.push(out.join("\n"));
  }
  return pages;
}

// Split a bundled upload into its component documents by reading the form title
// at the top of each page. Returns [{ title, page (1-based start), pages }].
function detectDocuments(pages: string[]): { title: string; page: number; pages: number }[] {
  const rules = [
    { re: /AS IS.{0,6}Residential Contract For Sale/i, title: "Contract" },
    { re: /Addendum to Contract|Addendum No|Addendum #/i, title: "Addendum" },
    { re: /Comprehensive Rider/i, title: "Rider" },
    { re: /Compensation Agreement/i, title: "Compensation" },
  ];
  const docs: { title: string; page: number; pages: number }[] = [];
  pages.forEach((pg, i) => {
    const top = pg.split("\n").slice(0, 18).join(" ");
    for (const r of rules) {
      if (r.re.test(top)) {
        if (!docs.length || docs[docs.length - 1].title !== r.title) docs.push({ title: r.title, page: i + 1, pages: 0 });
        break;
      }
    }
  });
  for (let k = 0; k < docs.length; k++) docs[k].pages = (k < docs.length - 1 ? docs[k + 1].page : pages.length + 1) - docs[k].page;
  return docs;
}

// --- FR/BAR field parser (validated against real contracts) -------------------
function parseContract(T: string): Record<string, string> {
  const lines = T.split("\n");
  const out: Record<string, string> = {};
  const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
  const stripNum = (s: string) => clean(s).replace(/^\d+:?\d*\s+/, "");
  const findLine = (re: RegExp) => { for (const l of lines) if (re.test(l)) return l; return ""; };
  const findIdx = (re: RegExp) => { for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };

  const bl = findLine(/\(\s*["“]?Buyer/);
  if (bl) out.buyer = stripNum(bl.replace(/\(\s*["“]?Buyer.*/, "")).replace(/^and\s+/i, "").replace(/_+/g, "").trim();
  const sl = findLine(/\(\s*["“]?Seller/);
  if (sl) out.seller = stripNum(sl.replace(/\(\s*["“]?Seller.*/, "")).replace(/^PARTIES:\s*/i, "").replace(/_+/g, "").trim();

  const al = findLine(/Street address, city, zip:/);
  if (al) out.address = clean(al.split(/zip:\s*/i)[1]);
  if (out.address) {
    const m = out.address.match(/^(.*?)[, ]+([A-Z]{2})\s+(\d{5})\b/);
    if (m) {
      out.state = m[2]; out.zip = m[3];
      const kc = (out.address.match(/(Cape Coral|Fort Myers|Lehigh Acres|North Fort Myers|Bonita Springs|Estero|Naples|Punta Gorda|Marco Island|Sanibel|Babcock Ranch)/i) || [])[0];
      if (kc) { out.city = kc; out.street = clean(m[1].slice(0, m[1].toLowerCase().lastIndexOf(kc.toLowerCase()))).replace(/[, ]+$/, ""); }
      else out.street = clean(m[1]);
    }
  }

  const tm = T.match(/\b\d{2}-\d{2}-\d{2}-[A-Za-z0-9]{2}-\d{4,5}\.\d{3,4}\b/);
  if (tm) out.tax_id = tm[0];
  const bi = findIdx(/Located in:/);
  if (bi >= 0) {
    const lb = lines[bi];
    const m = lb.match(/Located in:\s*([A-Za-z][\w .'-]{1,18}?)\s+County,\s*Florida/);
    if (m && !/_/.test(m[1])) out.county = clean(m[1]);
    if (!out.county) { const after = (lb.split(/Tax ID #:\s*/i)[1] || ""); const am = after.match(/^\s*([A-Za-z][A-Za-z .'-]{1,18}?)\b/); if (am) out.county = clean(am[1]); }
    if (!out.county && bi > 0) { const ab = stripNum(lines[bi - 1]); if (/^[A-Za-z .'-]{2,20}$/.test(ab)) out.county = ab; }
  }
  const ll = findLine(/legal description is/i);
  if (ll) out.legal = clean(ll.split(/legal description is\s*/i)[1]).replace(/\s+together with.*/i, "");

  const dollar = (l: string) => { const m = clean(l).match(/([\d,]+\.\d{2})/g); return m ? m[m.length - 1] : ""; };
  out.price = dollar(findLine(/2\.\s*PURCHASE PRICE/));
  out.emd = dollar(findLine(/Initial deposit to be held/));
  out.loan_amount = dollar(findLine(/\(c\)\s*Financing:/));

  const ci = findIdx(/Closing shall occur on/);
  if (ci >= 0) for (let k = ci - 2; k <= ci + 1; k++) { if (k < 0 || k >= lines.length) continue; const m = clean(lines[k]).match(/[A-Z][a-z]+ \d{1,2}, \d{4}/); if (m) { out.closing_date = m[0]; break; } }

  const sig: string[] = [];
  for (const l of lines) { const s = stripNum(l); if (/^(Buyer|Seller):/.test(s)) { const m = s.match(/Date:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/); if (m) sig.push(m[1]); } }
  if (sig.length) { const ds = sig.map((d) => ({ d, t: Date.parse(d) })).filter((x) => !isNaN(x.t)).sort((a, b) => b.t - a.t); if (ds.length) out.effective_date = ds[0].d; }

  const ei = findIdx(/Escrow Agent Name:/);
  let nm = "";
  if (ei >= 0) {
    const same = lines[ei].split(/Escrow Agent Name:\s*/i)[1];
    if (same && clean(same).replace(/_/g, "").trim()) nm = clean(same).replace(/_/g, "").trim();
    if (!nm) for (let k = ei - 1; k >= ei - 2 && k >= 0; k--) { const c = stripNum(lines[k]).replace(/_/g, "").trim(); if (c && !/CHECK ONE|accompanies|deposit/i.test(c)) { nm = c; break; } }
  }
  out.title_name = nm;
  const em = T.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/); if (em) out.title_email = em[0];
  const ph = T.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/); if (ph) out.title_phone = ph[0];
  const adL = findLine(/Address:.*Phone:/i);
  if (adL) { const m = adL.match(/Address:\s*([^_].*?)\s*Phone:/i); if (m) out.title_address = clean(m[1]).replace(/_+/g, "").trim(); }

  // Paragraph 19 BROKER block · Cooperating = buyer side, Listing = seller side.
  const cols = (line: string) => line.split(/_{3,}/).map((s) => clean(s))
    .filter((s) => s.length > 2 && /[A-Za-z]/.test(s) && !/^\d+$/.test(s) && !/Sales Associate|Cooperating|Listing|if any|^Broker$/i.test(s));
  const sa = findIdx(/Cooperating Sales Associate/i);
  if (sa > 0) { const n = cols(lines[sa - 1]); if (n[0]) out.buyer_agent = n[0]; if (n[1]) out.seller_agent = n[1]; }
  const brI = findIdx(/Cooperating Broker, if any/i);
  if (brI > 0) { const b = cols(lines[brI - 1]); if (b[0]) out.buyer_brokerage = b[0]; if (b[1]) out.seller_brokerage = b[1]; }

  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { file_id?: string; pdf_base64?: string; contract_path?: string; write?: boolean };
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "Invalid JSON" }); }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let bytes: Uint8Array | null = null;
  let file: any = null;

  if (body.pdf_base64) {
    bytes = Uint8Array.from(atob(body.pdf_base64), (c) => c.charCodeAt(0));
  } else if (body.file_id) {
    const { data: f, error } = await admin.from("files").select("id, raw_form_data, logistics").eq("id", body.file_id).maybeSingle();
    if (error) return j(500, { ok: false, error: "File lookup failed: " + error.message });
    if (!f) return j(404, { ok: false, error: "File not found" });
    file = f;
    const path = body.contract_path
      || f.raw_form_data?.contract_path || f.raw_form_data?.contract_file || f.raw_form_data?.contract_url || f.raw_form_data?.executed_contract_path;
    if (!path) return j(422, { ok: false, error: "No contract path on file (raw_form_data.contract_path)" });
    const key = String(path).replace(/^.*\/transaction-files\//, "").replace(/^\/+/, "");
    const dl = await admin.storage.from(BUCKET).download(key);
    if (dl.error) return j(422, { ok: false, error: "Contract download failed: " + dl.error.message });
    bytes = new Uint8Array(await dl.data.arrayBuffer());
  } else {
    return j(400, { ok: false, error: "Provide file_id or pdf_base64" });
  }

  let fields: Record<string, string>;
  let documents: { title: string; page: number; pages: number }[] = [];
  try {
    const pages = await pdfToPages(bytes!);
    fields = parseContract(pages.join("\n"));
    documents = detectDocuments(pages);
  } catch (e) {
    return j(500, { ok: false, error: "Parse failed: " + (e as Error).message });
  }

  // Write the DRAFT only (never a confirmed value). One blob, easy to read + tag.
  if (body.write !== false && body.file_id && file) {
    const raw = Object.assign({}, file.raw_form_data || {});
    raw.extracted_contract = { fields, documents, at: new Date().toISOString(), source: "extract-contract-fields/v3" };
    const { error } = await admin.from("files").update({ raw_form_data: raw }).eq("id", body.file_id);
    if (error) return j(500, { ok: false, fields, documents, error: "Draft save failed: " + error.message });
  }
  return j(200, { ok: true, fields, documents });
});

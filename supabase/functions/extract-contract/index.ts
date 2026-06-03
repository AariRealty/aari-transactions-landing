// ============================================================================
// Aari Transactions · extract-contract (June 2026)
// ============================================================================
// Receives the text of an executed FL purchase contract (extracted in the
// browser via pdf.js) and has Claude pull the key fields so the intake can
// pre-fill them. The agent always confirms — extraction never auto-submits.
//
// Secrets required (Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY · an Anthropic API key with billing enabled
//
// Cost: ~1–3 cents per contract (Claude Haiku, text-only).
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

const PROMPT = `You are reading the text of an executed Florida residential real estate purchase contract (often FAR/BAR). Extract the fields below.

Rules:
- Return ONLY a JSON object, no prose.
- Use "" (empty string) or [] when a value is not clearly present. NEVER guess.
- Dates must be ISO format YYYY-MM-DD.
- form_type must be one of: "FAR/BAR AS-IS", "FAR/BAR Standard", "CRSP", "New construction/builder", "Unknown".
- For effective_date: FAR/BAR defines it as the date the last party signed or initialed AND delivered the final offer/counter. Only return it if the contract states it or it is unambiguous.

JSON shape:
{
  "form_type": "",
  "buyer_names": [],
  "seller_names": [],
  "property_address": "",
  "effective_date": "",
  "closing_date": "",
  "purchase_price": "",
  "escrow_amount": "",
  "title_company_or_escrow_agent": "",
  "financing": "cash | conventional | FHA | VA | other | unknown",
  "inspection_period_days": ""
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 200) {
      return json({ ok: false, reason: "no_text" });
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, reason: "no_api_key" });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: PROMPT + "\n\nCONTRACT TEXT:\n" + text.slice(0, 150000),
          },
        ],
      }),
    });
    const data = await r.json();
    const raw = (data && data.content && data.content[0] && data.content[0].text) || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, reason: "no_json" });
    return json({ ok: true, fields: JSON.parse(m[0]) });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 200);
  }
});

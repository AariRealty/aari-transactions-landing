// Edge function: generate-listing-description
// ============================================================================
// Generates an MLS-compliant property description from 3 standout features
// + property basics. Called from the listing intake's description step.
//
// Compliance requirements baked into the prompt:
//   - 1200 character max (MLS Property Information field cap)
//   - No names (seller, agent, broker, or anyone)
//   - No phone / fax numbers
//   - No gate codes, access codes, lockbox codes
//   - No URLs or website addresses
//   - No commission / compensation language ("co-broke", "BB", "%", etc.)
//   - Fair Housing Act safe: no familial status, race, religion, national
//     origin, disability, sex, color, age. No "perfect for families",
//     "ideal for retirees", "walk to church", "exclusive neighborhood", etc.
//   - Florida real estate friendly phrasing
//
// Request body:
//   {
//     property_type: 'single_family' | 'condo_villa' | 'multi_family' |
//                    'lot_land' | 'rental_long' | 'rental_short',
//     standouts: [string, string, string],
//     basics: {
//       address?: string,        // used only for context (e.g. "Cape Coral")
//       list_price?: number,
//       bedrooms?: string,
//       baths?: number,
//       living_area_sqft?: number,
//       year_built?: number,
//       lot_size_acres?: number,
//     }
//   }
//
// Response:
//   { ok: true, remarks: string, char_count: number }
//   { ok: false, error: string }
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

const SYSTEM_PROMPT = `You are a Florida real estate copywriter writing MLS property descriptions for Aari Realty.

HARD RULES — every output must comply:
- Maximum 1200 characters total (count carefully).
- NEVER include: personal names, phone numbers, gate codes, access codes, lockbox codes, email addresses, URLs, website references, or commission/compensation language.
- FAIR HOUSING ACT COMPLIANCE: never reference familial status, age, race, religion, national origin, disability, sex, or color. Forbidden phrases include "perfect for families", "great for retirees", "exclusive neighborhood", "walk to church", "Christian community", "no children", "ideal for empty nesters", "young professionals only".
- Florida-friendly language: pool, lanai, screened patio, hurricane shutters, dock, Gulf access, canal-front, waterfront are all fine and encouraged when relevant.
- TONE: confident, clean, factual. No fluff. No hyperbole ("once-in-a-lifetime", "best on the market"). No emojis. No exclamation marks.
- STRUCTURE: 3-5 short paragraphs OR a single flowing paragraph if under 500 chars. Open with the property's strongest feature.
- Do not invent details. Use only what the agent provided. If a basic field is missing, omit it rather than guess.

Output ONLY the description text. No labels, no headers, no commentary, no quotes around the text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ ok: false, error: "ANTHROPIC_API_KEY not configured on the edge function" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const standouts = Array.isArray(body.standouts) ? body.standouts.filter((s: any) => typeof s === "string" && s.trim()) : [];
  if (standouts.length < 2) {
    return json({ ok: false, error: "At least 2 standouts are required" }, 400);
  }

  const basics = (body.basics && typeof body.basics === "object") ? body.basics : {};
  const propertyType = typeof body.property_type === "string" ? body.property_type : "single_family";

  // Compose the user prompt
  const lines: string[] = [];
  lines.push(`Property type: ${humanizePropertyType(propertyType)}`);
  if (basics.address)           lines.push(`Location: ${stripPii(String(basics.address))}`);
  if (basics.list_price)        lines.push(`List price: $${Number(basics.list_price).toLocaleString()}`);
  if (basics.bedrooms)          lines.push(`Bedrooms: ${basics.bedrooms}`);
  if (basics.full_baths != null)lines.push(`Full baths: ${basics.full_baths}`);
  if (basics.half_baths != null && basics.half_baths > 0) lines.push(`Half baths: ${basics.half_baths}`);
  if (basics.living_area_sqft)  lines.push(`Living area: ${basics.living_area_sqft.toLocaleString()} sqft`);
  if (basics.year_built)        lines.push(`Year built: ${basics.year_built}`);
  if (basics.lot_size_acres)    lines.push(`Lot size: ${basics.lot_size_acres} acres`);
  lines.push("");
  lines.push("Three standout features (agent's own words — clean these up, don't quote verbatim):");
  standouts.forEach((s: string, i: number) => lines.push(`${i + 1}. ${stripPii(s)}`));
  lines.push("");
  lines.push("Write the MLS property description now. Stay under 1200 characters.");

  // Call Anthropic
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: lines.join("\n") }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ ok: false, error: `Anthropic API error: ${resp.status} ${errText.slice(0, 200)}` }, 502);
    }

    const data = await resp.json();
    let text = "";
    if (data && Array.isArray(data.content)) {
      text = data.content.map((c: any) => (typeof c.text === "string" ? c.text : "")).join("").trim();
    }
    if (!text) {
      return json({ ok: false, error: "Empty response from Anthropic" }, 502);
    }

    // Safety net: re-scrub the output in case the model slipped in any banned content
    text = stripPii(text);

    // Hard-cap to 1200 chars (safety belt — the prompt asks for the cap)
    if (text.length > 1200) {
      text = text.slice(0, 1197).trimEnd() + "...";
    }

    return json({ ok: true, remarks: text, char_count: text.length }, 200);
  } catch (err) {
    return json({ ok: false, error: `Generation failed: ${(err as Error).message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizePropertyType(id: string): string {
  const map: Record<string, string> = {
    single_family: "Single Family Home",
    condo_villa: "Condo or Villa",
    multi_family: "Multi-family (income property)",
    lot_land: "Lot / Land",
    rental_long: "Long-term annual rental",
    rental_short: "Short-term vacation rental",
  };
  return map[id] || "Property";
}

/**
 * Strip the most common compliance violations from any string. Same regex
 * set used by the client-side auto-scrubber in intake — kept in sync so
 * the two paths produce identical output.
 */
function stripPii(input: string): string {
  let out = String(input || "");
  // Phone numbers (US formats: 239-555-1234, (239) 555-1234, 2395551234, +1...)
  out = out.replace(/(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, "[removed]");
  // Email addresses
  out = out.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[removed]");
  // URLs (http/https + bare domains)
  out = out.replace(/\bhttps?:\/\/\S+/gi, "[removed]");
  out = out.replace(/\b(?:www\.)?[A-Za-z0-9\-]+\.(?:com|net|org|io|co|info|biz|us|realtor|homes)\b\S*/gi, "[removed]");
  // Gate/access/lockbox codes (4-8 digit numbers labeled)
  out = out.replace(/\b(gate|access|lockbox|key|door|alarm|security)\s*(code|#|number)?\s*[:\-]?\s*\d{3,8}\b/gi, "[removed]");
  // Commission language
  out = out.replace(/\b\d+(?:\.\d+)?\s*%\s*(?:co-?broke|commission|comp|bb|sba|coop)?\b/gi, "[removed]");
  out = out.replace(/\b(co-?broke|cooperating broker|bonus|sba|coop)\b[^.]*?\$?\d+/gi, "[removed]");
  // Collapse repeated [removed] tokens
  out = out.replace(/(\[removed\]\s*){2,}/g, "[removed] ");
  return out;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

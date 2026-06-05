// Edge function: send-agent-welcome (Agent portal · Item 4 · June 2026)
// Called by the portal when the new-agent onboarding flow finishes OR is
// skipped. Auth: the agent's own JWT (verify_jwt ON) — the function only acts
// on the CALLER's agent row, so it cannot be used to spam other agents.
//
// Payload: { skipped: boolean }
//
// Always:    notification email to Marlenyi — new agent registered.
// Completed: welcome email to the agent introducing their TC by name
//            (preferred TC if picked, otherwise round-robin by open files).
// Skipped:   NO welcome email (her rule) — notification only.
// Idempotent: a welcome_sent_at stamp on the agent row blocks double-sends.

import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { AgentWelcome } from "../_email-templates/AgentWelcome.tsx";

const BROKER_EMAIL = Deno.env.get("BROKER_NOTIFY_EMAIL") ?? "marlenyi@aaritransactions.com";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ---- Identify the CALLER from their JWT · never trust a body agent_id ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "unauthenticated" }, 401);
  const agentId = userData.user.id;

  let body: { skipped?: boolean } = {};
  try { body = await req.json(); } catch { /* default */ }
  const skipped = !!body.skipped;

  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id, first_name, last_name, email, phone, brokerage_name, license_number, preferred_tc_id, welcome_sent_at")
    .eq("id", agentId)
    .single();
  if (agentErr || !agent) return json({ ok: false, error: "agent_not_found" }, 404);

  if (agent.welcome_sent_at) return json({ ok: true, deduped: true });

  // ---- Resolve the TC to introduce ----
  let tc: { id: string; first_name: string; last_name: string; phone: string | null } | null = null;
  if (agent.preferred_tc_id) {
    const { data } = await supabaseAdmin
      .from("agents").select("id, first_name, last_name, phone")
      .eq("id", agent.preferred_tc_id).single();
    tc = data ?? null;
  }
  if (!tc) {
    // Round-robin: TC with the fewest open files (mirrors auto-assign logic).
    const { data: tcs } = await supabaseAdmin
      .from("agents").select("id, first_name, last_name, phone").eq("role", "tc");
    if (tcs && tcs.length) {
      const counts: Record<string, number> = {};
      for (const t of tcs) {
        const { count } = await supabaseAdmin
          .from("files").select("id", { count: "exact", head: true })
          .eq("assigned_tc_id", t.id)
          .not("status", "in", '("closed","cancelled","archived")');
        counts[t.id] = count ?? 0;
      }
      tcs.sort((a, b) => (counts[a.id] - counts[b.id]) || a.first_name.localeCompare(b.first_name));
      tc = tcs[0];
    }
  }
  const tcName = tc ? `${tc.first_name} ${tc.last_name}`.trim() : "your Aari TC";
  const tcPhone = (tc && tc.phone) || "239.688.1770";

  // ---- 1 · Broker notification · always (completion or skip) ----
  const agentName = `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim();
  try {
    await sendEmail({
      to: BROKER_EMAIL,
      toUserId: null,
      category: "transactional",
      subject: `New agent registered — ${agentName}`,
      templateName: "broker-new-agent-notification",
      reactElement: React.createElement(
        "div",
        { style: { fontFamily: "Arial, sans-serif", fontSize: 14, color: "#0f0f0f", lineHeight: 1.6 } },
        React.createElement("p", null, `New agent registered — ${agentName} · ${agent.brokerage_name ?? "brokerage n/a"} · ${agent.license_number ?? "license n/a"}`),
        React.createElement("p", null, `Email: ${agent.email ?? "n/a"} · Phone: ${agent.phone ?? "n/a"}`),
        React.createElement("p", null, skipped ? "Onboarding: skipped." : `Onboarding: completed · TC introduced: ${tcName}.`),
      ),
      payload: { agent_id: agent.id, skipped },
    });
  } catch (e) {
    console.error("[send-agent-welcome] broker notify failed", e);
  }

  // ---- 2 · Agent welcome · completion only ----
  let welcomed = false;
  if (!skipped && agent.email) {
    const result = await sendEmail({
      to: agent.email,
      toUserId: agent.id,
      category: "transactional",
      subject: `Welcome to Aari, ${agent.first_name ?? "there"}`,
      templateName: "agent-welcome",
      reactElement: React.createElement(AgentWelcome, {
        firstName: agent.first_name ?? "there",
        tcName,
        tcPhone,
        intakeUrl: `${SITE_URL}/?modal-only=1#apply`,
      }),
      payload: { agent_id: agent.id, tc_id: tc?.id ?? null },
    });
    welcomed = !!result.sent;
  }

  await supabaseAdmin.from("agents")
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq("id", agent.id);

  return json({ ok: true, welcomed, skipped, tc: tcName });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

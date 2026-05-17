// ============================================================================
// Aari Transactions · send-signed-agreement (Section 6 · Task 6.4)
// ============================================================================
// Sends the executed Service Agreement PDF to:
//   1. The agent who signed (their on-file email)
//   2. The broker (hello@aaritransactions.com or BROKER_EMAIL env var)
//
// Triggered by generate-signed-agreement after the PDF is built and stored.
//
// Request body:
//   { signed_agreement_id: string }
//
// Writes timestamps back to signed_agreements.sent_to_agent_at / sent_to_broker_at.
// ============================================================================

import * as React from 'react';
import { supabaseAdmin } from '../_shared/supabase.ts';
import { resend, FROM, REPLY_TO } from '../_shared/resend.ts';
import { render } from '@react-email/render';
import { SignedAgreement } from '../_email-templates/SignedAgreement.tsx';

const BUCKET = 'signed-agreements';
const BROKER_EMAIL = Deno.env.get('BROKER_EMAIL') ?? 'marlenyi@aaritransactions.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { signed_agreement_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!body.signed_agreement_id) return json({ ok: false, error: 'missing_id' }, 400);

  // 1. Load the signed_agreement row
  const { data: sa, error: saErr } = await supabaseAdmin
    .from('signed_agreements')
    .select('id, agent_id, file_id, agreement_version, typed_legal_name, signed_at, pdf_storage_path')
    .eq('id', body.signed_agreement_id)
    .single();
  if (saErr || !sa) return json({ ok: false, error: 'signed_agreement_not_found' }, 404);
  if (!sa.pdf_storage_path) return json({ ok: false, error: 'no_pdf_path' }, 422);

  // 2. Load the agent's email + first name
  const { data: agent } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', sa.agent_id)
    .single();
  if (!agent?.email) return json({ ok: false, error: 'agent_email_missing' }, 422);

  // 3. Download the PDF from storage as a Uint8Array
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(sa.pdf_storage_path);
  if (dlErr || !pdfBlob) return json({ ok: false, error: 'pdf_download_failed', detail: dlErr?.message }, 500);
  const pdfArrayBuf = await pdfBlob.arrayBuffer();
  const pdfBytes = new Uint8Array(pdfArrayBuf);

  // Resend accepts Buffer/base64 string for attachments. Convert.
  const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
  const filename = `Aari-Service-Agreement-${sa.agreement_version}-${(agent.last_name || 'agent').replace(/\s+/g, '-')}.pdf`;

  const agentFullName = [agent.first_name, agent.last_name].filter(Boolean).join(' ').trim() || sa.typed_legal_name;
  const signedAtPretty = new Date(sa.signed_at).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/New_York',
  });

  // 4. Render the email template once · reused for both sends
  const emailEl = React.createElement(SignedAgreement, {
    agentFirstName: agent.first_name ?? sa.typed_legal_name.split(' ')[0],
    typedLegalName: sa.typed_legal_name,
    agreementVersion: sa.agreement_version,
    signedAt: signedAtPretty,
    fileId: sa.file_id ?? null,
  });
  const html = await render(emailEl);
  const text = await render(emailEl, { plainText: true });

  const subject = `Your Aari Service Agreement (${sa.agreement_version}) — signed copy`;

  const updates: Record<string, string | null> = { email_failure_reason: null };

  // 5. Send to agent
  try {
    const r = await resend.emails.send({
      from: FROM,
      to: [agent.email],
      reply_to: REPLY_TO,
      subject,
      html,
      text,
      attachments: [{ filename, content: pdfBase64 }],
    });
    if (r.error) throw new Error(typeof r.error === 'string' ? r.error : JSON.stringify(r.error));
    updates.sent_to_agent_at = new Date().toISOString();
  } catch (err) {
    console.error('[send-signed-agreement] agent send failed:', err);
    updates.email_failure_reason = `agent: ${(err as Error).message}`;
  }

  // 6. Send to broker
  try {
    const brokerSubject = `${agentFullName} signed Aari Service Agreement ${sa.agreement_version}`;
    const r = await resend.emails.send({
      from: FROM,
      to: [BROKER_EMAIL],
      reply_to: REPLY_TO,
      subject: brokerSubject,
      html,
      text,
      attachments: [{ filename, content: pdfBase64 }],
    });
    if (r.error) throw new Error(typeof r.error === 'string' ? r.error : JSON.stringify(r.error));
    updates.sent_to_broker_at = new Date().toISOString();
  } catch (err) {
    console.error('[send-signed-agreement] broker send failed:', err);
    const prior = updates.email_failure_reason ? updates.email_failure_reason + ' · ' : '';
    updates.email_failure_reason = prior + `broker: ${(err as Error).message}`;
  }

  // 7. Persist send timestamps
  await supabaseAdmin.from('signed_agreements').update(updates).eq('id', sa.id);

  return json({ ok: true, sent_to_agent: !!updates.sent_to_agent_at, sent_to_broker: !!updates.sent_to_broker_at });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Aari Transactions · generate-signed-agreement (Section 6 · Task 6.4)
// ============================================================================
// Generates an executed Service Agreement PDF by appending a signature
// certificate page to the v4.6 source PDF, uploads it to the
// signed-agreements bucket, inserts a row in public.signed_agreements,
// and chains into send-signed-agreement to email both parties.
//
// Trigger: tc_files INSERT (via DB trigger -> call_edge_function), OR
// direct invocation from the intake form on Step 5 Submit.
//
// Request body:
//   {
//     agent_id: string,
//     file_id?: string,
//     typed_legal_name: string,
//     signed_at?: ISO string,
//     ip_address?: string,
//     user_agent?: string,
//     agreement_version?: string   // defaults to 'v4.6'
//   }
//
// Response:
//   { ok: true, signed_agreement_id: string, pdf_storage_path: string }
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const SOURCE_PDF_URL = Deno.env.get('SERVICE_AGREEMENT_PDF_URL') ||
  'https://aari-transactions.netlify.app/aari-transactions-service-agreement.pdf';

const BUCKET = 'signed-agreements';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      agent_id,
      file_id = null,
      typed_legal_name,
      signed_at = new Date().toISOString(),
      ip_address = null,
      user_agent = null,
      agreement_version = 'v4.6',
    } = body || {};

    if (!agent_id || !typed_legal_name) {
      return new Response(
        JSON.stringify({ ok: false, error: 'agent_id and typed_legal_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Insert the signed_agreements row first so we have an ID for the storage path
    const { data: row, error: insertErr } = await supabase
      .from('signed_agreements')
      .insert({
        agent_id,
        file_id,
        agreement_version,
        typed_legal_name,
        signed_at,
        ip_address,
        user_agent,
      })
      .select('id')
      .single();

    if (insertErr || !row) {
      console.error('[generate-signed-agreement] insert failed:', insertErr);
      return new Response(
        JSON.stringify({ ok: false, error: 'DB insert failed', detail: insertErr?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const signedAgreementId = row.id;

    // 2. Fetch the source PDF
    const srcResp = await fetch(SOURCE_PDF_URL);
    if (!srcResp.ok) throw new Error(`Source PDF fetch failed: ${srcResp.status}`);
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());

    // 3. Load + append signature certificate page
    const pdf = await PDFDocument.load(srcBytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([612, 792]); // US Letter
    const ink = rgb(0.06, 0.06, 0.06);
    const muted = rgb(0.42, 0.42, 0.42);
    const bronze = rgb(0.59, 0.48, 0.29);

    // Header
    page.drawText('AARI TRANSACTIONS', {
      x: 50, y: 740, size: 10, font: boldFont, color: bronze,
    });
    page.drawText('Executed Service Agreement', {
      x: 50, y: 720, size: 22, font: boldFont, color: ink,
    });
    page.drawText('Signature Certificate', {
      x: 50, y: 695, size: 13, font: font, color: muted,
    });

    // Divider
    page.drawLine({
      start: { x: 50, y: 670 },
      end: { x: 562, y: 670 },
      thickness: 1,
      color: bronze,
    });

    // Signature block
    let y = 630;
    const drawRow = (label: string, value: string) => {
      page.drawText(label, { x: 50, y, size: 9, font: boldFont, color: muted });
      page.drawText(value || '—', { x: 50, y: y - 16, size: 12, font: font, color: ink });
      y -= 44;
    };

    drawRow('SIGNED BY', typed_legal_name);
    drawRow('SIGNED AT', new Date(signed_at).toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'long',
      timeZone: 'America/New_York',
    }) + ' (America/New_York)');
    drawRow('AGREEMENT VERSION', agreement_version);
    drawRow('SIGNED AGREEMENT ID', signedAgreementId);
    if (file_id) drawRow('FILE ID', file_id);
    if (ip_address) drawRow('IP ADDRESS', ip_address);
    if (user_agent) drawRow('USER AGENT', user_agent.substring(0, 90));

    // Compliance statement
    y -= 10;
    page.drawLine({
      start: { x: 50, y: y },
      end: { x: 562, y: y },
      thickness: 0.5,
      color: rgb(0.8, 0.75, 0.65),
    });
    y -= 24;

    const wrap = (text: string, maxWidth: number, size: number) => {
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth) {
          lines.push(current);
          current = w;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    const statement = `This signature certificate evidences electronic execution of the Aari Transactions Service Agreement (${agreement_version}) by the named Agent on the date and time stated above. The typed legal name, captured timestamp, and originating IP address constitute the Agent's electronic signature under the Florida Electronic Signature Act, Fla. Stat. § 668.50 (Uniform Electronic Transaction Act). The full body of the executed agreement appears on the pages preceding this certificate.`;
    const lines = wrap(statement, 512, 10);
    for (const ln of lines) {
      page.drawText(ln, { x: 50, y, size: 10, font: font, color: ink });
      y -= 14;
    }

    // Footer
    page.drawText('Aari Transactions, LLC · hello@aaritransactions.com · Fort Myers, FL', {
      x: 50, y: 40, size: 8, font: font, color: muted,
    });

    const mergedBytes = await pdf.save();

    // 4. Upload to storage
    const storagePath = `agreements/${agent_id}/${signedAgreementId}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, mergedBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadErr) {
      console.error('[generate-signed-agreement] upload failed:', uploadErr);
      // Roll back the row
      await supabase.from('signed_agreements').delete().eq('id', signedAgreementId);
      return new Response(
        JSON.stringify({ ok: false, error: 'PDF upload failed', detail: uploadErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Update the row with the storage path
    await supabase
      .from('signed_agreements')
      .update({ pdf_storage_path: storagePath })
      .eq('id', signedAgreementId);

    // 6. Chain to send-signed-agreement (broker + agent emails)
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-signed-agreement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ signed_agreement_id: signedAgreementId }),
      });
    } catch (err) {
      console.warn('[generate-signed-agreement] send chain failed:', err);
      // Not fatal — admin can manually re-send later
    }

    return new Response(
      JSON.stringify({
        ok: true,
        signed_agreement_id: signedAgreementId,
        pdf_storage_path: storagePath,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[generate-signed-agreement] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

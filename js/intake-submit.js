/* ============================================================================
   Aari Transactions — Intake submit + draft glue (Part 1 final)
   ============================================================================
   Owns the agent's "Submit File →" click. Supabase is the source of truth.
   Flow:

     1. Generate file_id (UUID) up front so it can flow through Supabase,
        Storage, Stripe metadata, and the thank-you redirect.
     2. Upload the SignaturePad PNG to Storage at
        signatures/{agent_id}/{file_id}_v{version}.png   (RLS-protected)
     3. Insert into public.agreement_signatures (immutable evidence row),
        then fire-and-forget invoke generate-signed-agreement-pdf so the
        personalized signed PDF appears in the agent's dashboard within ~30s.
     4. Insert into public.files with M2 columns:
          status='intake_received'
          billed_via, payment_timing
          signed_agreement_version, signature_image_url
          is_aari_engaged=true (intake came through Aari)
     5. Clear any draft, then redirect:
          upfront → Stripe Payment Link with file_id, agent_id,
                    service_type, service_price metadata in the URL
          at-closing → /thank-you?status=submitted&svc=&file_id=

   Errors:
     - Anonymous (no Supabase session): show inline alert telling the agent
       to register or sign in. Do NOT post to Firebase, do NOT redirect.
     - Supabase write fails: show error, write audit_log, do NOT redirect.
     - Storage upload fails: still write the files row (signature_image_url
       null, drawn_signature_data carried in raw_form_data). Best effort.

   Also injects the "Save & exit" button and listens for the resume-intake
   event from draft-detection.js.
   ============================================================================ */

(function (global) {
  'use strict';

  const SERVICE_AGREEMENT_VERSION = 'v4.5';
  const SERVICE_TYPE_TO_PAYMENT = {
    tc_one_side:         { timing: 'at_closing', billed_via: 'pay_at_closing_da' },
    tc_both_sides:       { timing: 'at_closing', billed_via: 'pay_at_closing_da' },
    lc:                  { timing: 'upfront',    billed_via: 'stripe_upfront' },
    op_basic:            { timing: 'upfront',    billed_via: 'stripe_upfront' },
    op_complete:         { timing: 'upfront',    billed_via: 'stripe_upfront' },
    listing_docs:        { timing: 'upfront',    billed_via: 'stripe_upfront' },
    mls_setup:           { timing: 'upfront',    billed_via: 'stripe_upfront' },
    file_org:            { timing: 'upfront',    billed_via: 'stripe_upfront' },
    compliance_review:   { timing: 'upfront',    billed_via: 'stripe_upfront' },
  };

  // Stripe Payment Link URLs by service id. Mirrors the SERVICES catalog
  // inside the intake IIFE in index.html (which we no longer let run for
  // upfront submissions, since we own the redirect ourselves).
  const SERVICE_STRIPE_URLS = {
    lc:                'https://buy.stripe.com/6oU14f9g32272q78MOcAo06',
    op_basic:          'https://buy.stripe.com/3cI5kv63R227ggXbZ0cAo07',
    op_complete:       'https://buy.stripe.com/6oUfZ99g3gX18Ov4wycAo05',
    listing_docs:      'https://buy.stripe.com/6oU7sD8bZbCH3ubfbccAo08',
    mls_setup:         'https://buy.stripe.com/fZu5kvgIvbCH7Kr7IKcAo09',
    file_org:          'https://buy.stripe.com/6oU00b2RF6infcT8MOcAo0f',
    compliance_review: 'https://buy.stripe.com/8x24grgIv7mrd4L0gicAo0g',
  };

  function uuid() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // RFC4122 v4 fallback
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b).map(x => x.toString(16).padStart(2, '0'));
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const cleaned = String(v).replace(/[^0-9.]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl) return null;
    const [meta, b64] = dataUrl.split(',');
    if (!meta || !b64) return null;
    const mime = (meta.match(/data:([^;]+)/) || [, 'image/png'])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function serializeFormData(fd) {
    const obj = {};
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) {
        obj[k] = v.name ? { filename: v.name, size: v.size, type: v.type } : null;
        continue;
      }
      if (k in obj) obj[k] = [].concat(obj[k], v);
      else obj[k] = v;
    }
    return obj;
  }

  function whenReady(cb) {
    const tryNow = () => {
      const form = document.getElementById('intake-form');
      const foot = document.querySelector('#intake-modal .modal-foot');
      const submitBtn = document.getElementById('intakeSubmit');
      if (form && foot && submitBtn) cb({ form, foot, submitBtn });
      else setTimeout(tryNow, 60);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryNow);
    else tryNow();
  }

  // ===== ERROR ALERT =====
  function showAlert(message, kind) {
    let slot = document.getElementById('aari-intake-alert');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'aari-intake-alert';
      slot.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1300;max-width:520px;width:calc(100% - 48px)';
      document.body.appendChild(slot);
    }
    slot.innerHTML = '';
    const a = document.createElement('div');
    a.className = 'aari-alert ' + (kind || 'error');
    a.style.cssText = 'box-shadow:0 12px 32px rgba(0,0,0,0.18)';
    a.textContent = message;
    slot.appendChild(a);
    setTimeout(() => slot.contains(a) && a.remove(), 8000);
  }

  // ===== STRIPE PAYMENT LINK =====
  // The Stripe URLs live on the SERVICES catalog inside the intake IIFE
  // (as `svc.stripe`). The hidden form field `service_id` carries the id by
  // the time the user reaches Step 5, so we read both here.
  function buildStripeRedirectUrl(stripeUrl, params) {
    if (!stripeUrl) return null;
    // Stripe Payment Links accept URL params:
    //   ?prefilled_email=...
    //   ?prefilled_metadata[file_id]=...&prefilled_metadata[agent_id]=...
    const u = new URL(stripeUrl);
    if (params.email) u.searchParams.set('prefilled_email', params.email);
    if (params.file_id) u.searchParams.set('prefilled_metadata[file_id]', params.file_id);
    if (params.agent_id) u.searchParams.set('prefilled_metadata[agent_id]', params.agent_id);
    if (params.service_type) u.searchParams.set('prefilled_metadata[service_type]', params.service_type);
    if (params.service_price_cents != null) u.searchParams.set('prefilled_metadata[service_price_cents]', String(params.service_price_cents));
    return u.toString();
  }

  function buildThankYouUrl(status, serviceType, fileId) {
    const u = new URL('/thank-you.html', window.location.origin);
    u.searchParams.set('status', status);
    if (serviceType) u.searchParams.set('svc', serviceType);
    if (fileId) u.searchParams.set('file_id', fileId);
    return u.toString();
  }

  // ===== MAIN: hijack the Submit click =====
  function installSubmitHijack(form, submitBtn) {
    // Capture-phase listener on document fires BEFORE the click reaches the
    // submit button (capture travels window → document → ... → target).
    // stopImmediatePropagation here cancels propagation entirely, so the
    // existing inline bubble-phase handler on the button never runs.
    // (A capture listener on the button itself would NOT do this — same-target
    // listeners fire in registration order regardless of phase.)
    document.addEventListener('click', (e) => {
      const t = e.target;
      const inSubmit = t === submitBtn || (submitBtn.contains && submitBtn.contains(t));
      if (!inSubmit) return;
      const modal = document.getElementById('intake-modal');
      if (!modal || modal.hasAttribute('hidden')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handleSubmit(form, submitBtn).catch(err => {
        console.error('[intake-submit] unexpected:', err);
        showAlert(err && err.message ? err.message : 'Unexpected error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit File →';
      });
    }, true);
  }

  async function handleSubmit(form, submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const fd = new FormData(form);

    // Mirror the existing handler's last-step bookkeeping that we just
    // intercepted: it sets payment_status + intake-next based on service.
    // We re-do the relevant bits ourselves.
    const serviceId = fd.get('service_id') || document.getElementById('intakeServiceId').value;
    const serviceName = fd.get('service_name') || document.getElementById('intakeServiceName').value;
    const servicePriceStr = fd.get('service_price') || document.getElementById('intakeServicePrice').value;
    const service_price_cents = servicePriceStr ? Math.round(parseFloat(servicePriceStr) * 100) : null;

    if (!serviceId) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit File →';
      showAlert('No service selected. Go back to Step 1 and pick a service.');
      return;
    }

    if (!global.AariAuth) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit File →';
      showAlert('The auth module did not load. Refresh and try again.');
      return;
    }

    const session = await global.AariAuth.getCurrentSession();
    if (!session) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit File →';
      showAlert('Please sign in or register before submitting a file.');
      if (global.AariLogin) global.AariLogin.open();
      return;
    }
    const agentId = session.user.id;

    const fileId = uuid();
    const client = await global.AariAuth.ensureClient();

    // ===== 1. Upload signature PNG to Storage (best effort) =====
    let signatureUrl = null;
    try {
      const drawn = fd.get('service_agreement_drawn');
      const blob = dataUrlToBlob(drawn);
      if (blob) {
        const path = `${agentId}/${fileId}_${SERVICE_AGREEMENT_VERSION}.png`;
        const up = await client.storage.from('signatures').upload(path, blob, {
          contentType: blob.type || 'image/png',
          upsert: false,
        });
        if (!up.error) {
          // Storage path is enough — the dashboard uses createSignedUrl on demand.
          signatureUrl = path;
        } else {
          console.warn('[intake-submit] signature upload failed:', up.error);
        }
      }
    } catch (sigErr) {
      console.warn('[intake-submit] signature upload threw:', sigErr);
    }

    // ===== 2. Insert files row FIRST (so agreement_signatures.file_id FK is satisfied) =====
    // Order matters: agreement_signatures.file_id references public.files(id). If we
    // insert the signature row first, the FK fails with sqlstate 23503.
    const billing = SERVICE_TYPE_TO_PAYMENT[serviceId] || { timing: null, billed_via: null };
    const fileRow = {
      id: fileId,
      agent_id: agentId,
      service_type: serviceId,
      service_price_cents,
      client_type: fd.get('client_type'),
      client_name: fd.get('client_name') || fd.get('seller_name') || fd.get('buyer_name'),
      client_email: fd.get('client_email') || fd.get('seller_email') || fd.get('buyer_email'),
      client_phone: fd.get('client_phone') || fd.get('seller_phone') || fd.get('buyer_phone'),
      property_address: fd.get('address'),
      effective_date: fd.get('effective_date') || null,
      closing_date: fd.get('closing_date') || fd.get('closing_date_target') || null,
      purchase_price_cents: num(fd.get('purchase_price') || fd.get('offer_price') || fd.get('listing_price')),
      earnest_money_cents: num(fd.get('earnest_money') || fd.get('earnest_money_offer')),
      lender_contact: fd.get('lender_contact') || null,
      title_contact: fd.get('title_contact') || null,
      assigned_tc_id: null,
      service_agreement_signed: true,
      service_agreement_signed_at: new Date().toISOString(),
      service_agreement_typed_name: fd.get('service_agreement_typed_name') || null,
      service_agreement_signature_data: signatureUrl ? null : (fd.get('service_agreement_drawn') || null),
      signed_agreement_version: SERVICE_AGREEMENT_VERSION,
      signature_image_url: signatureUrl,
      is_aari_engaged: true,
      payment_timing: billing.timing,
      billed_via: billing.billed_via,
      payment_status: billing.timing === 'upfront' ? 'pending' : 'at_closing',
      status: 'intake_received',
      raw_form_data: serializeFormData(fd),
    };

    const { data: inserted, error: insertErr } = await client
      .from('files')
      .insert(fileRow)
      .select()
      .single();

    if (insertErr) {
      // Hard fail: do NOT redirect.
      try {
        await client.from('audit_log').insert({
          actor_id: agentId,
          actor_type: 'agent',
          action: 'intake_submit_failed',
          target_table: 'files',
          target_id: fileId,
          details: { error: { code: insertErr.code, message: insertErr.message } },
        });
      } catch (e) {}
      console.error('[intake-submit] files insert failed:', insertErr);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit File →';
      showAlert('We couldn\'t save your file. ' + (insertErr.message || 'Please try again or contact hello@aaritransactions.com.'));
      return;
    }

    // ===== 3. Insert agreement_signatures row (now the FK to files.id is satisfied) =====
    // Then fire-and-forget generate-signed-agreement-pdf. The Edge Function bumps
    // pdf_generation_attempts and is safe to retry. Dashboard polls pdf_generation_status;
    // agents see "Generating…" briefly, then a download link once status flips to 'succeeded'.
    try {
      const { data: sigRow, error: sigInsertErr } = await client
        .from('agreement_signatures')
        .insert({
          agent_id: agentId,
          file_id: fileId,
          // 'service_agreement' is the per-file Service Agreement v4.x execution.
          // Schema check constraint allows: service_agreement, membership_agreement, intake_specific.
          agreement_type: 'service_agreement',
          agreement_version: SERVICE_AGREEMENT_VERSION,
          typed_full_name: fd.get('service_agreement_typed_name') || '',
          drawn_signature_data: signatureUrl ? null : (fd.get('service_agreement_drawn') || null),
          signature_image_url: signatureUrl,
          ip_address: null,
          user_agent: navigator.userAgent,
        })
        .select('id')
        .single();

      if (!sigInsertErr && sigRow && sigRow.id) {
        client.functions
          .invoke('generate-signed-agreement-pdf', { body: { signature_id: sigRow.id } })
          .catch(err => console.warn('[intake-submit] PDF gen invoke deferred:', err));
      } else if (sigInsertErr) {
        console.warn('[intake-submit] agreement_signatures insert failed:', sigInsertErr);
      }
    } catch (sigRowErr) {
      console.warn('[intake-submit] agreement_signatures insert threw:', sigRowErr);
      // Non-fatal — the file row already captured the signature path; PDF can be
      // re-generated manually via the replay curl in README.
    }

    // ===== 4. Clear draft, then redirect =====
    if (global.AariDraft) {
      try { await global.AariDraft.clear(); } catch (e) {}
    }

    // Resolve the Stripe Payment Link URL ourselves. We can't rely on the
    // existing intake IIFE's `intake-next` hidden field — its bubble-phase
    // click handler is cancelled by stopImmediatePropagation above and never
    // gets a chance to set it. SERVICE_STRIPE_URLS is the source of truth.
    const stripeUrl = SERVICE_STRIPE_URLS[serviceId] || null;

    const agentEmail = (await safeGetAgentEmail()) || (fd.get('agent_email') || '');

    // Fire a custom event the page's modal-only script forwards to the parent
    // window (the portal's iframe overlay) so the portal can close the popup
    // and refresh the agent's file list. Browsers ignore it on standalone pages.
    try {
      window.dispatchEvent(new CustomEvent('aari:intake-submitted', {
        detail: { fileId: fileId, serviceId: serviceId, agentId: agentId }
      }));
    } catch (_) {}

    if (billing.timing === 'upfront') {
      const url = buildStripeRedirectUrl(stripeUrl, {
        email: agentEmail,
        file_id: fileId,
        agent_id: agentId,
        service_type: serviceId,
        service_price_cents,
      }) || buildThankYouUrl('unpaid', serviceId, fileId);
      window.location.href = url;
    } else {
      window.location.href = buildThankYouUrl('submitted', serviceId, fileId);
    }
  }

  async function safeGetAgentEmail() {
    try {
      const profile = await global.AariAuth.getAgentProfile();
      return profile && profile.email;
    } catch (e) { return null; }
  }

  // ===== SAVE & EXIT =====
  function installSaveAndExit(foot) {
    if (document.getElementById('intakeSaveExit')) return;
    const btn = document.createElement('button');
    btn.id = 'intakeSaveExit';
    btn.type = 'button';
    btn.textContent = 'Save & exit';
    btn.className = 'btn-step';
    btn.style.cssText = 'background:transparent;border:1px solid currentColor;opacity:0.85;margin-right:auto';
    foot.insertBefore(btn, foot.firstChild);

    btn.addEventListener('click', async () => {
      const form = document.getElementById('intake-form');
      const fd = new FormData(form);
      const stepLabel = (document.getElementById('intakeStepLabel') || {}).textContent || '';
      const stepMatch = stepLabel.match(/(\d+)/);
      const currentStep = stepMatch ? parseInt(stepMatch[1], 10) : 1;
      const serviceId = (document.getElementById('intakeServiceId') || {}).value || null;
      const propertyAddress = fd.get('address') || null;

      if (global.AariDraft) {
        try {
          await global.AariDraft.save({
            service_type: serviceId,
            current_step: currentStep,
            form_data: serializeFormData(fd),
            property_address: propertyAddress,
          });
          showAlert('Draft saved. We\'ll restore it next visit.', 'success');
        } catch (e) {
          showAlert('Saved locally — will sync next time you sign in.', 'success');
        }
      }
      const closeBtn = document.getElementById('intake-close');
      if (closeBtn) closeBtn.click();
    });
  }

  // ===== RESUME =====
  function installResumeHandler() {
    window.addEventListener('aari:resume-intake', (e) => {
      const draft = e.detail && e.detail.draft;
      if (!draft) return;
      const trigger = document.querySelector('[data-intake-trigger]');
      if (trigger) trigger.click();
      setTimeout(() => applyDraftToForm(draft), 60);
    });
  }

  function applyDraftToForm(draft) {
    if (draft.service_type) {
      const card = document.querySelector('.service-card[data-service-id="' + draft.service_type + '"]');
      if (card) card.click();
    }
    const data = draft.form_data || {};
    const form = document.getElementById('intake-form');
    if (!form) return;
    Object.keys(data).forEach(k => {
      const v = data[k];
      const el = form.querySelector('[name="' + cssEscape(k) + '"]');
      if (!el || el.type === 'file') return;
      if (el.type === 'radio') {
        const r = form.querySelector('[name="' + cssEscape(k) + '"][value="' + cssEscape(String(v)) + '"]');
        if (r) r.checked = true;
        return;
      }
      if (el.type === 'checkbox') { el.checked = !!v; return; }
      if (typeof v === 'object') return;
      el.value = v == null ? '' : String(v);
    });
    walkToStep(Math.max(1, Math.min(5, parseInt(draft.current_step || 1, 10))));
  }

  function walkToStep(target) {
    const label = document.getElementById('intakeStepLabel');
    if (!label) return;
    const cur = (label.textContent.match(/(\d+)/) || [])[1];
    const current = cur ? parseInt(cur, 10) : 1;
    if (current >= target) return;
    const nextBtn = document.getElementById('intakeNext');
    if (!nextBtn || nextBtn.hidden) return;
    nextBtn.click();
    setTimeout(() => walkToStep(target), 120);
  }

  function cssEscape(s) {
    return String(s).replace(/(["\\])/g, '\\$1');
  }

  // ===== Bootstrap =====
  whenReady(({ form, foot, submitBtn }) => {
    installSubmitHijack(form, submitBtn);
    installSaveAndExit(foot);
    installResumeHandler();
  });
})(window);

/* tc-tracker.js · shared TC Contact Tracker component
 * Used on eileen.html, milennys.html, and every future TC profile.
 * Single source of truth — edit this file to update every TC's tracker.
 *
 * Data layer: Supabase only. No localStorage. Per-TC isolation via owner_id = auth.uid().
 *
 * UI: 7 filter buttons, one per stage (Contacted / Replied / In Convo / Hand Raise / Discovery / Signed / Not Interested).
 * Each button shows the count at that exact stage. No bucketing / grouping.
 * Legacy stage values from older Supabase rows ("In Conversation", "Added to AC", "Discovery Booked")
 * are normalized on read by normalizeStage() so the UI only ever sees the canonical names.
 *
 * Usage:
 *   <div id="trackerMount"></div>
 *   <script src="js/tc-tracker.js" defer></script>
 *   <script>document.addEventListener('DOMContentLoaded', () => mountTcTracker('#trackerMount'));</script>
 *
 * Public API after mount: window.AariTracker
 *   .getContacts()                     → snapshot of current contacts
 *   .addContact({name, handle, ...})   → insert a new contact
 *   .updateStage(id, stage)            → change a contact's stage (granular)
 *   .deleteContact(id)                 → confirm + delete
 *   .reload()                          → refetch from Supabase
 *   .onChange(callback)                → subscribe to contact-list changes
 */
(function (global) {
  'use strict';

  // ── Unified stage list · display label = data value (May 2026 v3) ──
  // Stages: Contacted / Replied / In Convo / Hand Raise / Discovery / Signed / Not Interested.
  // Legacy stage values ('Added to AC', 'Discovery Booked', 'In Conversation') are normalized on read.
  // `bucket` is now the stage's own filter-key (1 bucket = 1 stage) — no more grouping.
  var STAGES = [
    { key: 'Contacted',      label: 'Contacted',      bucket: 'contacted', cls: 's-contacted', desc: 'DM sent. No reply yet.' },
    { key: 'Replied',        label: 'Replied',        bucket: 'replied',   cls: 's-replied',   desc: 'One message back. Not yet a real conversation.' },
    { key: 'In Convo',       label: 'In Convo',       bucket: 'convo',     cls: 's-convo',     desc: 'Real back and forth.' },
    { key: 'Hand Raise',     label: 'Hand Raise',     bucket: 'raise',     cls: 's-raise',     desc: 'Asked for pricing or how to start. Book a discovery.' },
    { key: 'Discovery',      label: 'Discovery',      bucket: 'disco',     cls: 's-disco',     desc: 'Call on the calendar. Your job is to close.' },
    { key: 'Signed',         label: 'Signed',         bucket: 'signed',    cls: 's-signed',    desc: 'Client. Go find the next one.' },
    { key: 'Not Interested', label: 'Not Interested', bucket: 'notint',    cls: 's-out',       desc: 'Dead lead. Kept for the record.' }
  ];

  // ── 7 filter buttons · one per stage (UI · what the user sees) ──
  // Each bucket key matches a single STAGES.bucket. Settled palette · earthy washes.
  var BUCKETS = [
    { key: 'contacted', label: 'Contacted',      bg: '#F4F2EE', fg: '#6B6862', accent: '#A8A39A' },
    { key: 'replied',   label: 'Replied',        bg: '#F4F2EE', fg: '#6B6862', accent: '#C5BFB4' },
    { key: 'convo',     label: 'In Convo',       bg: '#F1ECE5', fg: '#8C7B5E', accent: '#B8A789' },
    { key: 'raise',     label: 'Hand Raise',     bg: '#EFE3DC', fg: '#8C5A45', accent: '#B58370' },
    { key: 'disco',     label: 'Discovery',      bg: '#E5E9E2', fg: '#5A6B57', accent: '#8A9C85' },
    { key: 'signed',    label: 'Signed',         bg: '#E8EAE3', fg: '#5A6B57', accent: '#8A9C85' },
    { key: 'notint',    label: 'Not Interested', bg: '#F5F2F2', fg: '#9A958B', accent: '#D4C8C8' }
  ];

  // ── Backwards-compat shim · normalize legacy stage strings on read ──
  // Old Supabase rows may still be tagged with the deprecated values.
  // We translate them here so the UI never sees them. Writes always use the new values.
  function normalizeStage(s) {
    if (s === 'Discovery Booked') return 'Discovery';
    if (s === 'Added to AC')      return 'In Convo';
    if (s === 'In Conversation')  return 'In Convo';
    return s || 'Contacted';
  }

  // ── Write-path shim · translate canonical stage values back to legacy strings ──
  // The Supabase CHECK constraint on bd_contacts.stage still lists the OLD values
  // ('In Conversation', 'Discovery Booked'). Until the constraint is migrated, we
  // translate the canonical names back to legacy at the moment we write.
  // The READ path (normalizeStage) reverses this so the UI never sees legacy values.
  function legacyStageForWrite(stage){
    if (stage === 'In Convo') return 'In Conversation';
    if (stage === 'Discovery') return 'Discovery Booked';
    return stage;
  }

  function stageMeta(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return STAGES[i];
    return { key: key, label: key, bucket: 'cold', cls: 's-contacted' };
  }
  function bucketMeta(key) {
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].key === key) return BUCKETS[i];
    return BUCKETS[0];
  }
  function bucketStages(key) {
    return STAGES.filter(function (s) { return s.bucket === key; }).map(function (s) { return s.key; });
  }

  var CSS = [
    '.tct{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0a0a0a}',
    '.tct-search-row{position:relative;margin:4px 0 12px}',
    '.tct-search{width:100%;font-size:13px;padding:9px 36px 9px 36px;border:1px solid #e0dccf;border-radius:8px;font-family:inherit;background:#fff;box-sizing:border-box;color:#0a0a0a}',
    '.tct-search:focus{outline:none;border-color:#a8a39a}',
    '.tct-search::placeholder{color:#a8a39a}',
    '.tct-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#a8a39a;font-size:14px;pointer-events:none}',
    '.tct-search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:none;font-size:16px;color:#a8a39a;cursor:pointer;padding:4px 8px;line-height:1;display:none}',
    '.tct-search-clear.visible{display:block}',
    '.tct-search-clear:hover{color:#5a5650}',
    '.tct-search-count{font-size:11px;color:#9a958b;margin:-6px 0 10px;padding:0 4px}',
    '.tct-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px}',
    '.tct-filters{display:flex;gap:8px;flex-wrap:wrap;flex:1}',
    '.tct-filters.dimmed{opacity:.45}',
    '.tct-add{font-size:11px;padding:6px 12px;border:1px solid #999;background:transparent;color:#555;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.tct-add:hover{background:#fafaf7}',
    '.tct-pill{font-size:11px;padding:5px 14px;border-radius:13px;cursor:pointer;font-family:inherit;font-weight:500;border:1px solid transparent;display:inline-flex;align-items:center;gap:8px;transition:transform .08s ease}',
    '.tct-pill:active{transform:scale(.97)}',
    '.tct-pill.active{background:#0a0a0a;color:#fff;border-color:#0a0a0a}',
    '.tct-pill-count{font-size:10px;opacity:.85;font-weight:500}',
    '.tct-pill.active .tct-pill-count{opacity:1}',
    '.tct-form{display:none;background:#fafaf7;border:1px solid #e0e0e0;border-radius:8px;padding:14px;margin-bottom:14px}',
    '.tct-form.open{display:block}',
    '.tct-form h4{margin:0 0 4px;font-size:13px;font-weight:600}',
    '.tct-form-note{font-size:11px;color:#777;margin:0 0 12px}',
    '.tct-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}',
    '.tct-af{display:flex;flex-direction:column;gap:3px}',
    '.tct-af.full{grid-column:1/-1}',
    '.tct-af label{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#888;font-weight:500}',
    '.tct-af input,.tct-af select{font-size:13px;padding:7px 9px;border:1px solid #d0d0d0;border-radius:6px;font-family:inherit;background:#fff}',
    '.tct-form-actions{display:flex;gap:8px}',
    '.tct-form-actions button{font-size:11px;padding:7px 14px;border:1px solid #999;background:transparent;color:#555;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.tct-form-actions button.primary{background:#0a0a0a;color:#fff;border-color:#0a0a0a}',
    '.tct-empty{padding:32px 16px;text-align:center;font-size:12px;color:#888;background:#fafaf7;border-radius:8px;border:1px dashed #d0d0d0}',
    '.tct-row{padding:14px 16px;border:1px solid #efebe5;border-radius:10px;margin-bottom:8px;background:#fff;cursor:pointer;transition:background .12s ease,border-color .12s ease;overflow:hidden}',
    '.tct-row:hover{background:#faf8f3;border-color:#e2dccd}',
    '.tct-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
    '.tct-row-top > div:first-child{min-width:0;flex:1}',
    '.tct-name{font-size:13px;font-weight:600;color:#0a0a0a;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}',
    '.tct-meta{font-size:11px;color:#9a958b;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:4px;max-width:100%}',
    '.tct-meta > span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.tct-stage-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:11px;font-size:10px;font-weight:500;letter-spacing:.2px;white-space:nowrap}',
    /* Modal */
    '.tct-modal-overlay{display:none;position:fixed;inset:0;background:rgba(20,18,14,.45);z-index:250;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto}',
    '.tct-modal-overlay.open{display:flex}',
    '.tct-modal{background:#fff;border-radius:14px;width:100%;max-width:540px;box-shadow:0 18px 60px rgba(0,0,0,.22);overflow:hidden;font-family:inherit}',
    '.tct-modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #f0ece4}',
    '.tct-modal-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;font-weight:600;margin:0}',
    '.tct-modal-x{background:transparent;border:none;font-size:20px;line-height:1;cursor:pointer;color:#9a958b;padding:0 4px}',
    '.tct-modal-body{padding:18px 22px}',
    '.tct-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}',
    '.tct-edit-grid .full{grid-column:1/-1}',
    '.tct-edit-grid label{display:block;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#9a958b;font-weight:500;margin-bottom:3px}',
    '.tct-edit-grid input,.tct-edit-grid select{width:100%;font-size:13px;padding:8px 10px;border:1px solid #e0dccf;border-radius:6px;font-family:inherit;background:#fff;box-sizing:border-box;color:#0a0a0a}',
    '.tct-edit-grid input:focus,.tct-edit-grid select:focus{outline:none;border-color:#a8a39a}',
    '.tct-modal-ftr{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-top:1px solid #f0ece4;background:#faf8f3;gap:8px}',
    '.tct-modal-ftr .right{display:flex;gap:8px}',
    '.tct-modal-ftr button{font-size:12px;padding:8px 14px;border-radius:6px;cursor:pointer;font-family:inherit;border:1px solid #d8d3c6;background:transparent;color:#5a5650}',
    '.tct-modal-ftr button:hover{background:#fff}',
    '.tct-modal-ftr button.primary{background:#0a0a0a;color:#fff;border-color:#0a0a0a}',
    '.tct-modal-ftr button.primary:hover{background:#1a1a1a}',
    '.tct-modal-ftr button.danger{color:#88857C;border-color:#E8E6DF}',
    '.tct-modal-ftr button.danger:hover{background:#E8E6DF;color:#0f0f0f}',
    /* Follow-up touches · Option 2 timeline dots · monochrome black + cream */
    '.tct-touches{margin-top:18px;padding-top:14px;border-top:1px solid #f0ece4}',
    '.tct-touches-label{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#88857C;font-weight:500;margin-bottom:14px}',
    '.tct-touches-timeline{display:flex;align-items:flex-start;justify-content:space-between;gap:0;margin:0 6px 14px;position:relative}',
    '.tct-touch-step{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto;position:relative;z-index:2;width:90px}',
    '.tct-touch-circle{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;background:#fff;border:2px solid #E8E6DF;color:#88857C;transition:all .15s ease}',
    '.tct-touch-circle.done{background:#0f0f0f;border-color:#0f0f0f;color:#fff}',
    '.tct-touch-circle.due{border-color:#D8D2C6;color:#0f0f0f;background:#D8D2C6}',
    '.tct-touch-label{font-size:10px;color:#6b6760;line-height:1.2;text-align:center}',
    '.tct-touch-label.done{color:#0f0f0f;font-weight:500}',
    '.tct-touch-label.due{color:#0f0f0f;font-weight:600}',
    '.tct-touch-badge{font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#88857C;background:transparent;padding:2px 6px;border-radius:8px;margin-top:1px}',
    '.tct-touch-connector{position:absolute;top:18px;left:0;right:0;height:2px;background:#E8E6DF;z-index:1}',
    '.tct-touch-connector-fill{position:absolute;top:18px;left:0;height:2px;background:#0f0f0f;z-index:1;transition:width .25s ease}',
    '.tct-touch-action{display:flex;justify-content:center;margin-top:4px}',
    '.tct-touch-btn{font-size:11px;padding:8px 18px;border-radius:6px;cursor:pointer;font-family:inherit;background:#0a0a0a;color:#fff;border:1px solid #0a0a0a;font-weight:500;letter-spacing:.04em}',
    '.tct-touch-btn:hover{background:#1a1a1a}',
    '.tct-touch-btn:disabled{background:#E8EAE3;color:#5A6B57;border-color:#E8EAE3;cursor:default}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function buildTemplate() {
    // Single source of truth for stage dropdowns · Contacted / Replied / In Convo / Hand Raise / Discovery / Signed / Not Interested.
    var formStageOpts = STAGES.map(function (s) {
      return '<option value="' + esc(s.key) + '">' + esc(s.label) + '</option>';
    }).join('');

    return [
      '<div class="tct">',
      '  <div class="tct-search-row">',
      '    <span class="tct-search-icon">⌕</span>',
      '    <input class="tct-search" type="search" placeholder="Search by name, handle, brokerage..." data-search autocomplete="off">',
      '    <button class="tct-search-clear" data-action="search-clear" aria-label="Clear search">×</button>',
      '  </div>',
      '  <div class="tct-search-count" data-search-count style="display:none"></div>',
      '  <div class="tct-top">',
      '    <div class="tct-filters" data-filters></div>',
      '    <button class="tct-add" data-action="add-toggle">+ Add</button>',
      '  </div>',
      '  <div class="tct-form" data-form>',
      '    <h4>New Contact</h4>',
      '    <p class="tct-form-note">Add everyone you DM — replied or not.</p>',
      '    <div class="tct-grid">',
      '      <div class="tct-af"><label>Name <span style="color:#0f0f0f;font-weight:700">*</span></label><input type="text" data-field="name" placeholder="Agent name" aria-required="true"></div>',
      '      <div class="tct-af"><label>Instagram <span style="color:#0f0f0f;font-weight:700">*</span></label><input type="text" data-field="handle" placeholder="@handle" aria-required="true"></div>',
      '      <div class="tct-af"><label>Brokerage <span style="color:#0f0f0f;font-weight:700">*</span></label><input type="text" data-field="brok" placeholder="e.g. KW..." aria-required="true"></div>',
      '      <div class="tct-af"><label>Phone</label><input type="text" data-field="phone" placeholder="optional"></div>',
      '      <div class="tct-af"><label>Email <span style="color:#0f0f0f;font-weight:700">*</span></label><input type="email" data-field="email" placeholder="agent@brokerage.com" aria-required="true"></div>',
      '      <div class="tct-af"><label>Found via</label><select data-field="source"><option>IG search</option><option>Referral</option><option>Post comment</option><option>Story view</option><option>Cold email</option><option>Mailer</option><option>Event</option><option>Other</option></select></div>',
      '      <div class="tct-af"><label>Stage</label><select data-field="stage">' + formStageOpts + '</select></div>',
      '      <div class="tct-af full"><label>Next Step</label><input type="text" data-field="next" placeholder="e.g. Follow up Friday..."></div>',
      '    </div>',
      '    <div data-form-error style="display:none;font-size:12px;color:#0f0f0f;font-weight:600;background:#D8D2C6;border:1px solid #D8D2C6;border-radius:6px;padding:8px 10px;margin-bottom:10px"></div>',
      '    <div class="tct-form-actions">',
      '      <button class="primary" data-action="add-submit">Add →</button>',
      '      <button data-action="add-cancel">Cancel</button>',
      '    </div>',
      '  </div>',
      '  <div data-list></div>',
      '  <div class="tct-modal-overlay" data-edit-overlay>',
      '    <div class="tct-modal" data-edit-modal>',
      '      <div class="tct-modal-hdr"><h3 class="tct-modal-title">Edit Contact</h3><button class="tct-modal-x" data-action="edit-close" aria-label="Close">×</button></div>',
      '      <div class="tct-modal-body">',
      '        <div class="tct-edit-grid">',
      '          <div><label>Name</label><input type="text" data-edit-field="name"></div>',
      '          <div><label>Instagram <span data-edit-ig-hint style="display:none;color:#88857C;font-size:10px;font-weight:500;margin-left:6px">&#9888; Add IG</span></label><input type="text" data-edit-field="handle" placeholder="@handle"></div>',
      '          <div><label>Brokerage <span data-edit-brok-hint style="display:none;color:#88857C;font-size:10px;font-weight:500;margin-left:6px">&#9888; Add brokerage</span></label><input type="text" data-edit-field="brok"></div>',
      '          <div><label>Phone <span data-edit-phone-hint style="display:none;color:#88857C;font-size:10px;font-weight:500;margin-left:6px">&#9888; Add phone</span></label><input type="text" data-edit-field="phone" placeholder="optional"></div>',
      '          <div class="full"><label>Email <span data-edit-email-hint style="display:none;color:#88857C;font-size:10px;font-weight:500;margin-left:6px">&#9888; Add email</span></label><input type="email" data-edit-field="email" placeholder="agent@brokerage.com"></div>',
      '          <div><label>Found via</label><select data-edit-field="source"><option>IG search</option><option>Referral</option><option>Post comment</option><option>Story view</option><option>Cold email</option><option>Mailer</option><option>Event</option><option>Other</option></select></div>',
      '          <div><label>Stage</label><select data-edit-field="stage">' + formStageOpts + '</select></div>',
      '          <div class="full"><label>Next Step</label><input type="text" data-edit-field="next"></div>',
      '          <div class="full" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fafaf7;border:1px solid #efebe5;border-radius:6px;margin-top:4px"><input type="checkbox" data-edit-field="in_campaign" id="tct-edit-incampaign" style="accent-color:#0f0f0f;cursor:pointer;width:14px;height:14px;margin:0"><label for="tct-edit-incampaign" style="font-family:var(--sans,Inter);font-size:12px;font-weight:500;color:#0f0f0f;cursor:pointer;margin:0;display:inline-flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#88857C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>In email campaign</label></div>',
      '        </div>',
      '        <div class="tct-touches" data-touches-section>',
      '          <div class="tct-touches-label">Follow-up touches</div>',
      '          <div class="tct-touches-timeline" data-touches-timeline></div>',
      '          <div class="tct-touch-action"><button class="tct-touch-btn" data-action="touch-complete" type="button">Mark Touch 1 complete</button></div>',
      '        </div>',
      '      </div>',
      '      <div class="tct-modal-ftr">',
      '        <button class="danger" data-action="edit-delete">Delete</button>',
      '        <div class="right">',
      '          <button data-action="edit-close">Cancel</button>',
      '          <button class="primary" data-action="edit-save">Save</button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function TcTracker(root, opts) {
    this.root = root;
    this.contacts = [];
    this.counts = { cold: 0, talking: 0, hot: 0, won: 0 };
    this.cb = 'raise';                  // current filter (1 bucket = 1 stage · 7 total)
    this.cbAutoDefault = true;          // auto-land on highest-priority non-empty stage
    this.editingId = null;              // id of contact row currently in edit mode
    this.searchQuery = '';              // active search query (overrides bucket filter)
    this.ownerId = null;
    this.client = null;
    this.listeners = [];
    // Cockpit-owner override · when set, Tracker always reads/writes for this person,
    // regardless of who's logged in. Lets broker preview a TC's tracker correctly.
    this.cockpitOwnerFirstName = (opts && opts.cockpitOwnerFirstName) || null;
  }

  // ── Cadence per stage (days between touches) ──
  // Smart follow-up queue · cadence varies by stage so we don't drown in red dots.
  // Hand Raise → 1d · Discovery → 2d · In Convo → 3d · Replied → 3d · Contacted → 5d
  // Signed / Not Interested → no touches at all.
  var STAGE_CADENCE = {
    'Hand Raise': 1,
    'Discovery': 2,
    'In Convo': 3,
    'Replied': 3,
    'Contacted': 5,
    'Signed': 0,
    'Not Interested': 0
  };
  function cadenceDays(stage) {
    var d = STAGE_CADENCE[normalizeStage(stage)];
    return (typeof d === 'number') ? d : 3;
  }

  // Parse "Brokerage: X · Next: Y · Email: z@x · Touches: t1=YYYY-MM-DD|... · Snoozes: t1=YYYY-MM-DD|... · ...notes..." from the notes column.
  // Email + touches + snoozes live in notes as a fallback so we don't need a schema migration on bd_contacts.
  function parseNotes(notes) {
    var out = { brok: '', next: '', email: '', phone: '', in_campaign: false, touches: { t1: null, t2: null, t3: null }, snoozes: { t1: null, t2: null, t3: null }, notes: '' };
    if (!notes) return out;
    var parts = String(notes).split(' · ');
    var leftover = [];
    parts.forEach(function (p) {
      if (p.indexOf('Brokerage: ') === 0) out.brok = p.slice(11);
      else if (p.indexOf('Next: ') === 0) out.next = p.slice(6);
      else if (p.indexOf('Email: ') === 0) out.email = p.slice(7);
      else if (p.indexOf('Phone: ') === 0) out.phone = p.slice(7);
      else if (p.indexOf('Campaign: ') === 0) out.in_campaign = (p.slice(10).trim().toLowerCase() === 'yes');
      else if (p.indexOf('Touches: ') === 0) {
        var tStr = p.slice(9);
        tStr.split('|').forEach(function (kv) {
          var eq = kv.indexOf('=');
          if (eq < 0) return;
          var k = kv.slice(0, eq).trim();
          var v = kv.slice(eq + 1).trim();
          if (k === 't1' || k === 't2' || k === 't3') out.touches[k] = v || null;
        });
      }
      else if (p.indexOf('Snoozes: ') === 0) {
        var sStr = p.slice(9);
        sStr.split('|').forEach(function (kv) {
          var eq = kv.indexOf('=');
          if (eq < 0) return;
          var k = kv.slice(0, eq).trim();
          var v = kv.slice(eq + 1).trim();
          if (k === 't1' || k === 't2' || k === 't3') out.snoozes[k] = v || null;
        });
      }
      else leftover.push(p);
    });
    out.notes = leftover.join(' · ');
    return out;
  }
  function packNotes(brok, next, notes, email, touches, snoozes, in_campaign, phone) {
    var parts = [];
    if (brok) parts.push('Brokerage: ' + brok);
    if (next) parts.push('Next: ' + next);
    if (email) parts.push('Email: ' + email);
    if (phone) parts.push('Phone: ' + phone);
    if (in_campaign === true) parts.push('Campaign: yes');
    if (touches && (touches.t1 || touches.t2 || touches.t3)) {
      var tParts = [];
      if (touches.t1) tParts.push('t1=' + touches.t1);
      if (touches.t2) tParts.push('t2=' + touches.t2);
      if (touches.t3) tParts.push('t3=' + touches.t3);
      if (tParts.length) parts.push('Touches: ' + tParts.join('|'));
    }
    if (snoozes && (snoozes.t1 || snoozes.t2 || snoozes.t3)) {
      var sParts = [];
      if (snoozes.t1) sParts.push('t1=' + snoozes.t1);
      if (snoozes.t2) sParts.push('t2=' + snoozes.t2);
      if (snoozes.t3) sParts.push('t3=' + snoozes.t3);
      if (sParts.length) parts.push('Snoozes: ' + sParts.join('|'));
    }
    if (notes) parts.push(notes);
    return parts.length ? parts.join(' · ') : null;
  }
  // Touch date helpers · cadence is Touch1=today, Touch2=+3d from T1, Touch3=+3d from T2.
  function todayIsoDate() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function addDaysIso(iso, days) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  // Returns { dueDates: [d1,d2,d3], doneFlags: [b,b,b], nextIdx: 0|1|2|-1, overdueFlags: [b,b,b] }
  // Cadence is stage-aware. Snoozes push a touch's due date forward without marking it done.
  function computeTouchState(touches, stage, snoozes) {
    var t = touches || { t1: null, t2: null, t3: null };
    var sn = snoozes || { t1: null, t2: null, t3: null };
    var today = todayIsoDate();
    var cad = cadenceDays(stage);
    // No-touch stages (Signed / Not Interested) · render nothing as due
    if (cad === 0) {
      return {
        dueDates: [null, null, null],
        doneFlags: [!!t.t1, !!t.t2, !!t.t3],
        nextIdx: -1,
        overdueFlags: [false, false, false],
        dueTodayFlags: [false, false, false],
        doneDates: [t.t1, t.t2, t.t3]
      };
    }
    // T1 due: today (or snoozed) if not done · once done, no due
    // T2 due: T1 done + cadence (or today + cadence if T1 not done yet) · honors snooze
    // T3 due: T2 done + cadence · honors snooze
    var d1 = t.t1 ? null : (sn.t1 || today);
    var d2Base = t.t2 ? null : (t.t1 ? addDaysIso(t.t1, cad) : addDaysIso(today, cad));
    var d2 = t.t2 ? null : (sn.t2 && sn.t2 > d2Base ? sn.t2 : d2Base);
    var d3Base = t.t3 ? null : (t.t2 ? addDaysIso(t.t2, cad) : (t.t1 ? addDaysIso(t.t1, cad * 2) : addDaysIso(today, cad * 2)));
    var d3 = t.t3 ? null : (sn.t3 && sn.t3 > d3Base ? sn.t3 : d3Base);
    var done = [!!t.t1, !!t.t2, !!t.t3];
    var overdue = [
      !done[0] && d1 && d1 < today,
      !done[1] && d2 && d2 < today,
      !done[2] && d3 && d3 < today
    ];
    var dueToday = [
      !done[0] && d1 === today,
      !done[1] && d2 === today,
      !done[2] && d3 === today
    ];
    var nextIdx = done[0] ? (done[1] ? (done[2] ? -1 : 2) : 1) : 0;
    return { dueDates: [d1, d2, d3], doneFlags: done, nextIdx: nextIdx, overdueFlags: overdue, dueTodayFlags: dueToday, doneDates: [t.t1, t.t2, t.t3] };
  }
  // Public · used by callers (Kanban dot, banner counter) to check if a contact has an overdue or due-today touch.
  function contactTouchUrgency(contact) {
    if (!contact) return { overdue: false, dueToday: false };
    if (contact.stage === 'Signed' || contact.stage === 'Not Interested') return { overdue: false, dueToday: false };
    var parsed = parseNotes(contact.notes);
    var st = computeTouchState(parsed.touches, contact.stage, parsed.snoozes);
    return {
      overdue: st.overdueFlags.some(function (b) { return b; }),
      dueToday: st.dueTodayFlags.some(function (b) { return b; })
    };
  }
  // Public · returns whichever touch (1/2/3) is the next-due touch + its due date.
  // Used by Today's Follow-ups queue to render priority rows.
  function contactNextDueTouch(contact) {
    if (!contact) return null;
    if (contact.stage === 'Signed' || contact.stage === 'Not Interested') return null;
    var parsed = parseNotes(contact.notes);
    var st = computeTouchState(parsed.touches, contact.stage, parsed.snoozes);
    if (st.nextIdx < 0) return null;
    return {
      touchNum: st.nextIdx + 1,
      dueDate: st.dueDates[st.nextIdx],
      overdue: st.overdueFlags[st.nextIdx],
      dueToday: st.dueTodayFlags[st.nextIdx]
    };
  }
  // Public · returns per-touch dot states for the 3-dot Kanban indicator.
  // Returns null for no-touch stages (Signed / Not Interested) so callers can skip the row entirely.
  // Otherwise returns ['done'|'upcoming'|'due'|'overdue', ..., ...] of length 3.
  function contactTouchStates(contact) {
    if (!contact) return null;
    if (contact.stage === 'Signed' || contact.stage === 'Not Interested') return null;
    var parsed = parseNotes(contact.notes);
    var st = computeTouchState(parsed.touches, contact.stage, parsed.snoozes);
    return [0, 1, 2].map(function (i) {
      if (st.doneFlags[i]) return 'done';
      if (st.overdueFlags[i]) return 'overdue';
      if (st.dueTodayFlags[i]) return 'due';
      return 'upcoming';
    });
  }
  // Expose helpers on the global namespace so prospecting.html can use them.
  global.TcTrackerTouchUrgency = contactTouchUrgency;
  global.TcTrackerNextDueTouch = contactNextDueTouch;
  global.TcTrackerTouchStates = contactTouchStates;
  global.TcTrackerTodayIso = todayIsoDate;
  global.TcTrackerAddDaysIso = addDaysIso;
  global.TcTrackerParseNotes = parseNotes;
  function isValidEmail(e){ return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  TcTracker.prototype.init = async function () {
    injectCss();
    this.root.innerHTML = buildTemplate();
    this._renderFilters();
    this._wireEvents();
    await this._connectSupabase();
    await this.reload();
  };

  TcTracker.prototype._connectSupabase = async function () {
    if (typeof global.AariAuth === 'undefined' || !global.AariAuth.ensureClient) {
      console.warn('[TcTracker] AariAuth not loaded — tracker will render but cannot read/write.');
      return;
    }
    try {
      this.client = await global.AariAuth.ensureClient();
      // If a cockpit-owner override was provided, look up that person's id from the agents table.
      // Otherwise fall back to the currently-logged-in user.
      if (this.cockpitOwnerFirstName) {
        var r = await this.client
          .from('agents')
          .select('id')
          .ilike('first_name', this.cockpitOwnerFirstName)
          .limit(1)
          .maybeSingle();
        if (r && r.data && r.data.id) {
          this.ownerId = r.data.id;
        } else {
          console.warn('[TcTracker] could not resolve cockpit owner:', this.cockpitOwnerFirstName);
        }
      }
      if (!this.ownerId) {
        var auth = await this.client.auth.getUser();
        this.ownerId = (auth && auth.data && auth.data.user) ? auth.data.user.id : null;
      }
    } catch (e) {
      console.error('[TcTracker] supabase connect failed', e);
    }
  };

  TcTracker.prototype.reload = async function () {
    if (!this.client || !this.ownerId) { this._render(); return; }
    try {
      var r = await this.client
        .from('bd_contacts')
        .select('*')
        .eq('owner_id', this.ownerId)
        .order('last_touch_at', { ascending: false });
      if (r.error) { console.error('[TcTracker] load', r.error); return; }
      this.contacts = (r.data || []).map(function (row) {
        return {
          id: row.id, name: row.name, handle: row.handle, source: row.source,
          stage: normalizeStage(row.stage), notes: row.notes,
          dm_sent_at: row.dm_sent_at, last_touch_at: row.last_touch_at
        };
      });
      this._render();
      this._fireChange();
    } catch (e) {
      console.error('[TcTracker] reload error', e);
    }
  };

  TcTracker.prototype.addContact = async function (input) {
    if (!this.client || !this.ownerId) {
      console.warn('[TcTracker] not authed');
      throw new Error('Not signed in (auth not ready). Refresh the page and try again.');
    }
    // Field-specific validation — surfaces a useful message instead of generic "Save failed"
    var name = (input.name || '').trim();
    if (!name) throw new Error('Name is required.');
    if (input.email && !isValidEmail(input.email)) {
      throw new Error('Email "' + input.email + '" is not a valid address.');
    }
    var nowIso = new Date().toISOString();
    var row = {
      owner_id: this.ownerId,
      name: name,
      handle: input.handle || null,
      source: input.source || 'IG search',
      stage: legacyStageForWrite(normalizeStage(input.stage || 'Contacted')),
      notes: packNotes(input.brok, input.next, input.notes, input.email, null, null, input.in_campaign === true, input.phone),
      dm_sent_at: nowIso,
      last_touch_at: nowIso
    };
    try {
      var r = await this.client.from('bd_contacts').insert([row]).select();
      if (r.error) {
        console.error('[TcTracker] insert', r.error);
        // Surface a specific reason instead of generic "Save failed"
        var msg = r.error.message || JSON.stringify(r.error);
        if (/duplicate key/i.test(msg) || r.error.code === '23505') {
          throw new Error('Looks like a duplicate row was rejected by the database. Refresh and try again.');
        }
        if (/permission|rls|policy/i.test(msg)) {
          throw new Error('Permission denied by Supabase RLS. Check your login.');
        }
        throw new Error('Supabase rejected the save: ' + msg);
      }
      if (r.data && r.data[0]) this.contacts.unshift({
        id: r.data[0].id, name: r.data[0].name, handle: r.data[0].handle,
        source: r.data[0].source, stage: normalizeStage(r.data[0].stage), notes: r.data[0].notes,
        dm_sent_at: r.data[0].dm_sent_at, last_touch_at: r.data[0].last_touch_at
      });
      this._render();
      this._fireChange();
      return r.data && r.data[0];
    } catch (e) {
      console.error('[TcTracker] addContact error', e);
      // Re-throw so the caller (quickAdd) can show the field-specific reason inline.
      throw e;
    }
  };

  TcTracker.prototype.updateStage = async function (id, stage) {
    if (!this.client) return;
    stage = normalizeStage(stage);
    var nowIso = new Date().toISOString();
    try {
      var r = await this.client.from('bd_contacts').update({ stage: legacyStageForWrite(stage), last_touch_at: nowIso }).eq('id', id);
      if (r.error) {
        console.error('[TcTracker] updateStage', r.error);
        var msg = r.error.message || r.error.code || JSON.stringify(r.error);
        alert('Save failed: ' + msg);
        return;
      }
      for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) {
        this.contacts[i].stage = stage; this.contacts[i].last_touch_at = nowIso; break;
      }
      this._render();
      this._fireChange();
    } catch (e) {
      console.error('[TcTracker] updateStage error', e);
      var emsg = (e && e.message) ? e.message : String(e);
      alert('Save failed: ' + emsg);
    }
  };

  TcTracker.prototype.updateContact = async function (id, patch) {
    if (!this.client) return;
    if (patch.email && !isValidEmail(patch.email)) {
      alert('Email "' + patch.email + '" is not a valid address.');
      return;
    }
    var nowIso = new Date().toISOString();
    var canonicalStage = normalizeStage(patch.stage || 'Contacted');
    var update = {
      name: patch.name || '(unnamed)',
      handle: patch.handle || null,
      source: patch.source || null,
      stage: legacyStageForWrite(canonicalStage),
      notes: packNotes(patch.brok, patch.next, patch.notes, patch.email, patch.touches, patch.snoozes, patch.in_campaign === true, patch.phone),
      last_touch_at: nowIso
    };
    try {
      var r = await this.client.from('bd_contacts').update(update).eq('id', id);
      if (r.error) {
        console.error('[TcTracker] updateContact', r.error);
        var msg = r.error.message || r.error.code || JSON.stringify(r.error);
        alert('Save failed: ' + msg);
        return;
      }
      for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) {
        var c = this.contacts[i];
        c.name = update.name; c.handle = update.handle; c.source = update.source;
        c.stage = canonicalStage; c.notes = update.notes; c.last_touch_at = nowIso;
        break;
      }
      this.editingId = null;
      this._render();
      this._fireChange();
    } catch (e) {
      console.error('[TcTracker] updateContact error', e);
      var emsg = (e && e.message) ? e.message : String(e);
      alert('Save failed: ' + emsg);
    }
  };

  TcTracker.prototype.deleteContact = async function (id) {
    if (!this.client) return;
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    try {
      var r = await this.client.from('bd_contacts').delete().eq('id', id);
      if (r.error) {
        console.error('[TcTracker] delete', r.error);
        var msg = r.error.message || r.error.code || JSON.stringify(r.error);
        alert('Delete failed: ' + msg);
        return;
      }
      this.contacts = this.contacts.filter(function (c) { return c.id !== id; });
      this._render();
      this._fireChange();
    } catch (e) { console.error('[TcTracker] deleteContact error', e); }
  };

  // Public · mark a contact's next-due touch as done (writes today's date).
  // Used by the Today's Follow-ups queue widget.
  TcTracker.prototype.markNextTouchDone = async function (id) {
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    var parsed = parseNotes(c.notes);
    var st = computeTouchState(parsed.touches, c.stage, parsed.snoozes);
    if (st.nextIdx < 0) return;
    var today = todayIsoDate();
    var t = { t1: parsed.touches.t1, t2: parsed.touches.t2, t3: parsed.touches.t3 };
    if (st.nextIdx === 0) t.t1 = today;
    else if (st.nextIdx === 1) t.t2 = today;
    else if (st.nextIdx === 2) t.t3 = today;
    // Clear the snooze on the touch we just completed (it's no longer pending)
    var sn = { t1: parsed.snoozes.t1, t2: parsed.snoozes.t2, t3: parsed.snoozes.t3 };
    if (st.nextIdx === 0) sn.t1 = null;
    else if (st.nextIdx === 1) sn.t2 = null;
    else if (st.nextIdx === 2) sn.t3 = null;
    await this.updateContact(id, {
      name: c.name, handle: c.handle, brok: parsed.brok, email: parsed.email, phone: parsed.phone,
      source: c.source, stage: c.stage, next: parsed.next,
      notes: parsed.notes, touches: t, snoozes: sn, in_campaign: parsed.in_campaign
    });
  };

  // Public · snooze a contact's next-due touch by N days (default 1).
  TcTracker.prototype.snoozeNextTouch = async function (id, days) {
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    var parsed = parseNotes(c.notes);
    var st = computeTouchState(parsed.touches, c.stage, parsed.snoozes);
    if (st.nextIdx < 0) return;
    var n = days || 1;
    // Snooze target date = max(today, currentDue) + n days
    var today = todayIsoDate();
    var current = st.dueDates[st.nextIdx] || today;
    var base = current > today ? current : today;
    var target = addDaysIso(base, n);
    var sn = { t1: parsed.snoozes.t1, t2: parsed.snoozes.t2, t3: parsed.snoozes.t3 };
    if (st.nextIdx === 0) sn.t1 = target;
    else if (st.nextIdx === 1) sn.t2 = target;
    else if (st.nextIdx === 2) sn.t3 = target;
    await this.updateContact(id, {
      name: c.name, handle: c.handle, brok: parsed.brok, email: parsed.email, phone: parsed.phone,
      source: c.source, stage: c.stage, next: parsed.next,
      notes: parsed.notes, touches: parsed.touches, snoozes: sn, in_campaign: parsed.in_campaign
    });
  };

  // Public · flip the in_campaign flag for a single contact (writes through updateContact).
  // Used by the Campaign Upload modal's "Mark all as uploaded" action.
  TcTracker.prototype.setInCampaign = async function (id, flag) {
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    var parsed = parseNotes(c.notes);
    await this.updateContact(id, {
      name: c.name, handle: c.handle, brok: parsed.brok, email: parsed.email, phone: parsed.phone,
      source: c.source, stage: c.stage, next: parsed.next,
      notes: parsed.notes, touches: parsed.touches, snoozes: parsed.snoozes,
      in_campaign: !!flag
    });
  };

  // Public · auto-archive: any Contacted contact whose Touch 3 is due/overdue (no manual
  // reply) gets silently moved to Not Interested. Run lazily on each render.
  TcTracker.prototype.autoArchiveStaleContacted = async function () {
    if (!this.client || !this.ownerId) return 0;
    var moved = 0;
    var ids = [];
    var today = todayIsoDate();
    this.contacts.forEach(function (c) {
      if (c.stage !== 'Contacted') return;
      var parsed = parseNotes(c.notes);
      var st = computeTouchState(parsed.touches, c.stage, parsed.snoozes);
      // Trigger: Touch 3 is the next due touch (T1 + T2 done) AND it's due/overdue
      // OR all 3 touches completed without a stage change away from Contacted
      var t3DueOrOverdue = (st.nextIdx === 2) && (st.overdueFlags[2] || st.dueTodayFlags[2]);
      var allThreeDone = st.doneFlags[0] && st.doneFlags[1] && st.doneFlags[2];
      if (t3DueOrOverdue || allThreeDone) {
        ids.push(c.id);
      }
    });
    if (!ids.length) return 0;
    try {
      var nowIso = new Date().toISOString();
      var r = await this.client.from('bd_contacts')
        .update({ stage: legacyStageForWrite('Not Interested'), last_touch_at: nowIso })
        .in('id', ids);
      if (r.error) {
        console.error('[TcTracker] auto-archive', r.error);
        var msg = r.error.message || r.error.code || JSON.stringify(r.error);
        alert('Save failed: ' + msg);
        return 0;
      }
      // Mirror locally
      for (var i = 0; i < this.contacts.length; i++) {
        if (ids.indexOf(this.contacts[i].id) >= 0) {
          this.contacts[i].stage = 'Not Interested';
          this.contacts[i].last_touch_at = nowIso;
          moved++;
        }
      }
      if (moved > 0) { this._render(); this._fireChange(); }
      return moved;
    } catch (e) {
      console.error('[TcTracker] autoArchiveStaleContacted error', e);
      return 0;
    }
  };

  // Public · one-time bulk archive: any Contacted contact whose last_touch_at (or
  // created/dm_sent_at as fallback) is older than 14 days → Not Interested.
  // Idempotent via the localStorage key passed in.
  TcTracker.prototype.bulkArchiveStaleContacted = async function (daysOld) {
    if (!this.client || !this.ownerId) return 0;
    var n = daysOld || 14;
    var cutoffIso = addDaysIso(todayIsoDate(), -n);
    var ids = [];
    this.contacts.forEach(function (c) {
      if (c.stage !== 'Contacted') return;
      var ref = c.last_touch_at || c.dm_sent_at;
      if (!ref) { ids.push(c.id); return; }
      var refDate = String(ref).slice(0, 10);
      if (refDate < cutoffIso) ids.push(c.id);
    });
    if (!ids.length) return 0;
    try {
      var nowIso = new Date().toISOString();
      var r = await this.client.from('bd_contacts')
        .update({ stage: legacyStageForWrite('Not Interested'), last_touch_at: nowIso })
        .in('id', ids);
      if (r.error) {
        console.error('[TcTracker] bulk-archive', r.error);
        var msg = r.error.message || r.error.code || JSON.stringify(r.error);
        alert('Save failed: ' + msg);
        return 0;
      }
      var moved = 0;
      for (var i = 0; i < this.contacts.length; i++) {
        if (ids.indexOf(this.contacts[i].id) >= 0) {
          this.contacts[i].stage = 'Not Interested';
          this.contacts[i].last_touch_at = nowIso;
          moved++;
        }
      }
      if (moved > 0) { this._render(); this._fireChange(); }
      return moved;
    } catch (e) {
      console.error('[TcTracker] bulkArchiveStaleContacted error', e);
      return 0;
    }
  };

  TcTracker.prototype.getContacts = function () { return this.contacts.slice(); };
  TcTracker.prototype.getCounts = function () { return Object.assign({}, this.counts); };
  TcTracker.prototype.onChange = function (cb) { if (typeof cb === 'function') this.listeners.push(cb); };

  TcTracker.prototype._fireChange = function () {
    var snap = this.contacts.slice();
    this.listeners.forEach(function (cb) { try { cb(snap); } catch (_) { } });
  };

  TcTracker.prototype._renderFilters = function () {
    var wrap = this.root.querySelector('[data-filters]');
    if (!wrap) return;
    var self = this;
    wrap.innerHTML = BUCKETS.map(function (b) {
      var active = (b.key === self.cb);
      var style = active ? '' : 'background:' + b.bg + ';color:' + b.fg + ';';
      return '<button class="tct-pill' + (active ? ' active' : '') + '" data-bucket="' + esc(b.key) + '" style="' + style + '">' +
             esc(b.label) +
             ' <span class="tct-pill-count">0</span>' +
             '</button>';
    }).join('');
  };

  TcTracker.prototype._wireEvents = function () {
    var self = this;
    this.root.addEventListener('click', function (e) {
      var t = e.target;
      // Modal overlay click (outside the modal box) → close
      var overlay = self.root.querySelector('[data-edit-overlay]');
      if (overlay && t === overlay) { self._closeEditModal(); return; }
      var btn = t.closest ? t.closest('[data-action], [data-bucket], [data-row-id]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'edit-close')   { self._closeEditModal(); return; }
      if (action === 'edit-save')    { self._commitEdit(); return; }
      if (action === 'edit-delete')  { self._deleteFromModal(); return; }
      if (action === 'touch-complete') { self._completeNextTouch(); return; }
      if (action === 'add-toggle')   { self._toggleForm(); return; }
      if (action === 'add-submit')   { self._submitAdd(); return; }
      if (action === 'add-cancel')   { self._toggleForm(false); return; }
      if (action === 'search-clear') { self._setSearch(''); return; }
      var bucket = btn.getAttribute('data-bucket');
      if (bucket) { self._setBucket(bucket); return; }
      var rowId = btn.getAttribute('data-row-id');
      if (rowId) { self._openEditModal(rowId); return; }
    });
    // Search input: live filter
    this.root.addEventListener('input', function (e) {
      if (e.target && e.target.matches && e.target.matches('[data-search]')) {
        self._setSearch(e.target.value);
      }
    });
  };

  TcTracker.prototype._setSearch = function (q) {
    this.searchQuery = (q || '').trim();
    var input = this.root.querySelector('[data-search]');
    if (input && input.value !== this.searchQuery) input.value = this.searchQuery;
    var clearBtn = this.root.querySelector('[data-action="search-clear"]');
    if (clearBtn) clearBtn.classList.toggle('visible', this.searchQuery.length > 0);
    var filters = this.root.querySelector('[data-filters]');
    if (filters) filters.classList.toggle('dimmed', this.searchQuery.length > 0);
    this._renderList();
  };

  TcTracker.prototype._openEditModal = function (id) {
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    this.editingId = id;
    var parsed = parseNotes(c.notes);
    var m = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
    // Portal the modal overlay to document.body the first time we open it.
    // This lets external views (e.g. the Kanban) trigger the modal even when
    // the tracker's own container is display:none. Rewire click events on the
    // portaled node since it's no longer a descendant of this.root.
    if (m && m.parentNode !== document.body) {
      var self = this;
      document.body.appendChild(m);
      m.addEventListener('click', function (e) {
        var t = e.target;
        if (t === m) { self._closeEditModal(); return; }
        var btn = t.closest ? t.closest('[data-action]') : null;
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        if (action === 'edit-close')     { self._closeEditModal(); return; }
        if (action === 'edit-save')      { self._commitEdit(); return; }
        if (action === 'edit-delete')    { self._deleteFromModal(); return; }
        if (action === 'touch-complete') { self._completeNextTouch(); return; }
      });
    }
    var setField = function (k, v) {
      var el = m.querySelector('[data-edit-field="' + k + '"]');
      if (el) el.value = v == null ? '' : v;
    };
    setField('name', c.name);
    setField('handle', c.handle);
    setField('brok', parsed.brok);
    // Show "Add brokerage" hint for legacy contacts missing the field · non-blocking on edit
    var brokHint = m.querySelector('[data-edit-brok-hint]');
    if (brokHint) brokHint.style.display = (parsed.brok && parsed.brok.trim()) ? 'none' : 'inline';
    setField('email', parsed.email);
    setField('phone', parsed.phone);
    // Inline monochrome hints for missing email + IG + phone · edit stays non-blocking
    var emailHint = m.querySelector('[data-edit-email-hint]');
    if (emailHint) emailHint.style.display = (parsed.email && parsed.email.trim()) ? 'none' : 'inline';
    var igHint = m.querySelector('[data-edit-ig-hint]');
    if (igHint) igHint.style.display = (c.handle && String(c.handle).trim()) ? 'none' : 'inline';
    var phoneHint = m.querySelector('[data-edit-phone-hint]');
    if (phoneHint) phoneHint.style.display = (parsed.phone && parsed.phone.trim()) ? 'none' : 'inline';
    setField('source', c.source || 'IG search');
    setField('stage', normalizeStage(c.stage || 'Contacted'));
    setField('next', parsed.next);
    // Campaign checkbox state · reads from notes blob
    var icEl = m.querySelector('[data-edit-field="in_campaign"]');
    if (icEl) icEl.checked = !!parsed.in_campaign;
    this._renderTouches(c, parsed.touches, parsed.snoozes);
    m.classList.add('open');
    // focus name on open
    setTimeout(function () {
      var n = m.querySelector('[data-edit-field="name"]');
      if (n) n.focus();
    }, 40);
  };

  // Public alias · lets external views (Kanban, etc.) open the edit modal for a contact.
  TcTracker.prototype.openEditModal = function (id) { return this._openEditModal(id); };

  // Render the 3-touch follow-up timeline inside the modal.
  TcTracker.prototype._renderTouches = function (contact, touches, snoozes) {
    var m = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
    if (!m) return;
    var timelineEl = m.querySelector('[data-touches-timeline]');
    var btnEl = m.querySelector('[data-action="touch-complete"]');
    if (!timelineEl || !btnEl) return;
    var st = computeTouchState(touches, contact && contact.stage, snoozes);
    // Build the 3 step dots + connector. Connector fill width = % of completed segments.
    // Two segments between three dots: fillPct = (segments-done / 2) * 100. Each segment counts
    // as done if the LEFT dot is done (T1 done → segment 1; T2 done → segment 2).
    var segDone = (st.doneFlags[0] ? 1 : 0) + (st.doneFlags[1] ? 1 : 0);
    var fillPct = (segDone / 2) * 100;
    function fmtMonthDay(iso) {
      if (!iso) return '';
      var d = new Date(iso + 'T00:00:00');
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    var stepsHtml = '';
    for (var i = 0; i < 3; i++) {
      var n = i + 1;
      var done = st.doneFlags[i];
      var due = st.dueTodayFlags[i];
      var overdue = st.overdueFlags[i];
      var circleCls = 'tct-touch-circle';
      var labelCls = 'tct-touch-label';
      var inner = String(n);
      if (done) { circleCls += ' done'; labelCls += ' done'; inner = '<i class="ti ti-check" aria-hidden="true">&#10003;</i>'; }
      else if (due) { circleCls += ' due'; labelCls += ' due'; /* number stays as inner — no bell, no red */ }
      var labelText = '';
      if (done) labelText = 'Done ' + fmtMonthDay(st.doneDates[i]);
      else if (due) labelText = 'Due today';
      else if (st.dueDates[i]) labelText = fmtMonthDay(st.dueDates[i]);
      else labelText = 'Pending';
      var overdueBadge = (overdue && !done) ? '<span class="tct-touch-badge">Overdue</span>' : '';
      stepsHtml += '<div class="tct-touch-step">' +
        '<span class="' + circleCls + '">' + inner + '</span>' +
        '<span class="' + labelCls + '">' + esc(labelText) + '</span>' +
        overdueBadge +
        '</div>';
    }
    timelineEl.innerHTML =
      '<div class="tct-touch-connector"></div>' +
      '<div class="tct-touch-connector-fill" style="width:' + fillPct + '%"></div>' +
      stepsHtml;
    // Button state
    if (st.nextIdx < 0) {
      btnEl.disabled = true;
      btnEl.textContent = 'All 3 touches complete';
    } else {
      btnEl.disabled = false;
      btnEl.textContent = 'Mark Touch ' + (st.nextIdx + 1) + ' complete';
    }
  };

  // Mark the next incomplete touch as done (today's date) and persist via updateContact.
  TcTracker.prototype._completeNextTouch = async function () {
    var id = this.editingId;
    if (!id) return;
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    var parsed = parseNotes(c.notes);
    var st = computeTouchState(parsed.touches, c.stage, parsed.snoozes);
    if (st.nextIdx < 0) return;
    var today = todayIsoDate();
    var t = { t1: parsed.touches.t1, t2: parsed.touches.t2, t3: parsed.touches.t3 };
    if (st.nextIdx === 0) t.t1 = today;
    else if (st.nextIdx === 1) t.t2 = today;
    else if (st.nextIdx === 2) t.t3 = today;
    // Persist via the full updateContact path so notes blob is repacked correctly.
    // We pull the current modal values for other fields so we don't clobber unsaved edits.
    var m = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
    var get = function (k) {
      var el = m.querySelector('[data-edit-field="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    // Preserve in_campaign value from current modal checkbox (if user toggled it but hasn't saved)
    var icEl = m.querySelector('[data-edit-field="in_campaign"]');
    var icVal = icEl ? !!icEl.checked : !!parsed.in_campaign;
    await this.updateContact(id, {
      name: get('name') || c.name,
      handle: get('handle'),
      brok: get('brok'),
      email: get('email'),
      phone: get('phone'),
      source: get('source') || c.source,
      stage: get('stage') || c.stage,
      next: get('next'),
      notes: parsed.notes,
      touches: t,
      snoozes: parsed.snoozes,
      in_campaign: icVal
    });
    // After updateContact, the contact has new notes. Re-fetch and re-render the timeline.
    var updated = null;
    for (var j = 0; j < this.contacts.length; j++) if (this.contacts[j].id === id) { updated = this.contacts[j]; break; }
    if (updated) {
      var newParsed = parseNotes(updated.notes);
      this.editingId = id; // updateContact clears editingId · restore so user stays in modal
      this._renderTouches(updated, newParsed.touches, newParsed.snoozes);
      // Reopen modal state (updateContact called _closeEditModal indirectly via _render? actually no — it sets editingId=null then re-renders list)
      var overlay = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
      if (overlay) overlay.classList.add('open');
    }
  };

  TcTracker.prototype._closeEditModal = function () {
    this.editingId = null;
    var m = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
    if (m) m.classList.remove('open');
  };

  TcTracker.prototype._commitEdit = function () {
    var id = this.editingId;
    if (!id) return;
    var m = this.root.querySelector('[data-edit-overlay]') || document.querySelector('[data-edit-overlay]');
    var get = function (k) {
      var el = m.querySelector('[data-edit-field="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    // Preserve existing touches + snoozes when committing the edit form — not represented in form inputs
    // but must survive the round-trip through packNotes.
    var existing = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { existing = this.contacts[i]; break; }
    var existingParsed = existing ? parseNotes(existing.notes) : { touches: { t1: null, t2: null, t3: null }, snoozes: { t1: null, t2: null, t3: null }, in_campaign: false };
    // Read in_campaign from the checkbox in the edit modal
    var icEl = m.querySelector('[data-edit-field="in_campaign"]');
    var icVal = icEl ? !!icEl.checked : !!existingParsed.in_campaign;
    this.updateContact(id, {
      name: get('name'), handle: get('handle'), brok: get('brok'), email: get('email'),
      phone: get('phone'),
      source: get('source'), stage: get('stage'), next: get('next'),
      touches: existingParsed.touches,
      snoozes: existingParsed.snoozes,
      in_campaign: icVal
    });
    this._closeEditModal();
  };

  TcTracker.prototype._deleteFromModal = async function () {
    var id = this.editingId;
    if (!id) return;
    // deleteContact prompts confirm internally
    await this.deleteContact(id);
    this._closeEditModal();
  };

  TcTracker.prototype._setBucket = function (bucket) {
    this.cb = bucket;
    this.cbAutoDefault = false;
    this._renderFilters();
    this._updateCountsDom();
    this._renderList();
  };

  TcTracker.prototype._toggleForm = function (force) {
    var f = this.root.querySelector('[data-form]');
    if (!f) return;
    var willOpen = (force === undefined) ? !f.classList.contains('open') : !!force;
    f.classList.toggle('open', willOpen);
  };

  TcTracker.prototype._submitAdd = async function () {
    var f = this.root.querySelector('[data-form]');
    if (!f) return;
    var get = function (k) {
      var el = f.querySelector('[data-field="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    var input = {
      name: get('name'), handle: get('handle'), brok: get('brok'), email: get('email'),
      phone: get('phone'), source: get('source'), stage: get('stage'), next: get('next')
    };
    // Surface validation errors inline near the form instead of failing silently.
    var errEl = f.querySelector('[data-form-error]');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    if (!input.name) {
      if (errEl) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; }
      return;
    }
    if (!input.brok) {
      if (errEl) { errEl.textContent = 'Brokerage is required.'; errEl.style.display = 'block'; }
      var brokInput = f.querySelector('[data-field="brok"]');
      if (brokInput) brokInput.focus();
      return;
    }
    if (!input.handle) {
      if (errEl) { errEl.textContent = 'Instagram handle is required.'; errEl.style.display = 'block'; }
      var igInput = f.querySelector('[data-field="handle"]');
      if (igInput) igInput.focus();
      return;
    }
    if (!input.email) {
      if (errEl) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; }
      var emInput = f.querySelector('[data-field="email"]');
      if (emInput) emInput.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      if (errEl) { errEl.textContent = 'Email format looks wrong (need name@domain).'; errEl.style.display = 'block'; }
      var emInput2 = f.querySelector('[data-field="email"]');
      if (emInput2) emInput2.focus();
      return;
    }
    try {
      await this.addContact(input);
      ['name', 'handle', 'brok', 'email', 'phone', 'next'].forEach(function (k) {
        var el = f.querySelector('[data-field="' + k + '"]');
        if (el) el.value = '';
      });
      this._toggleForm(false);
    } catch (e) {
      if (errEl) {
        errEl.textContent = '⚠ ' + (e && e.message ? e.message : 'Save failed.');
        errEl.style.display = 'block';
      } else {
        alert('⚠ ' + (e && e.message ? e.message : 'Save failed.'));
      }
    }
  };

  TcTracker.prototype._render = function () {
    this._updateCounts();
    if (this.cbAutoDefault) this._applyAutoDefault();
    this._renderFilters();
    this._updateCountsDom();
    this._renderList();
    // Lazy auto-archive: silently move stale Contacted (T3 due/overdue) to Not Interested.
    // Debounced so a single render burst doesn't fire it many times.
    var self = this;
    if (!self._autoArchiveTimer) {
      self._autoArchiveTimer = setTimeout(function () {
        self._autoArchiveTimer = null;
        try { self.autoArchiveStaleContacted(); } catch (_) {}
      }, 400);
    }
  };

  TcTracker.prototype._updateCounts = function () {
    var counts = { contacted: 0, replied: 0, convo: 0, raise: 0, disco: 0, signed: 0, notint: 0 };
    this.contacts.forEach(function (c) {
      var s = stageMeta(c.stage);
      if (s && counts.hasOwnProperty(s.bucket)) counts[s.bucket]++;
    });
    this.counts = counts;
  };

  TcTracker.prototype._updateCountsDom = function () {
    var self = this;
    BUCKETS.forEach(function (b) {
      var btn = self.root.querySelector('[data-bucket="' + b.key + '"] .tct-pill-count');
      if (btn) btn.textContent = self.counts[b.key];
    });
  };

  TcTracker.prototype._applyAutoDefault = function () {
    // Priority order: leads needing action first, then earlier funnel, then dead.
    // disco (call booked) → raise (asked for pricing) → convo → replied → contacted → signed → notint.
    var prio = ['disco', 'raise', 'convo', 'replied', 'contacted', 'signed', 'notint'];
    var target = null;
    for (var i = 0; i < prio.length; i++) if (this.counts[prio[i]] > 0) { target = prio[i]; break; }
    this.cb = target || 'raise';
  };

  TcTracker.prototype._renderList = function () {
    var list = this.root.querySelector('[data-list]');
    if (!list) return;
    var countEl = this.root.querySelector('[data-search-count]');
    var filtered;
    if (this.searchQuery) {
      var q = this.searchQuery.toLowerCase();
      filtered = this.contacts.filter(function (c) {
        return (c.name && c.name.toLowerCase().indexOf(q) >= 0) ||
               (c.handle && c.handle.toLowerCase().indexOf(q) >= 0) ||
               (c.notes && c.notes.toLowerCase().indexOf(q) >= 0) ||
               (c.source && c.source.toLowerCase().indexOf(q) >= 0);
      });
      if (countEl) {
        countEl.style.display = 'block';
        countEl.textContent = filtered.length + (filtered.length === 1 ? ' match' : ' matches') + ' for "' + this.searchQuery + '"';
      }
    } else {
      if (countEl) { countEl.style.display = 'none'; countEl.textContent = ''; }
      var stagesInBucket = bucketStages(this.cb);
      filtered = this.contacts.filter(function (c) { return stagesInBucket.indexOf(c.stage) >= 0; });
    }
    if (!filtered.length) {
      var emptyMsg;
      if (this.searchQuery) {
        emptyMsg = 'No contacts matching "' + this.searchQuery + '".';
      } else {
        emptyMsg = ({
          contacted: 'Nothing contacted yet. Keep DMing.',
          replied:   'No replies yet.',
          convo:     'No active conversations yet.',
          raise:     'No hand raises right now. Work the earlier stages.',
          disco:     'No discovery calls booked.',
          signed:    'No signed clients yet. The next one is in your pipeline.',
          notint:    'No dead leads filed here.'
        })[this.cb] || 'Empty bucket.';
      }
      list.innerHTML = '<div class="tct-empty">' + esc(emptyMsg) + '</div>';
      return;
    }
    list.innerHTML = filtered.map(function (c) {
      var s = stageMeta(c.stage);
      var b = bucketMeta(s.bucket);
      var badgeStyle = 'background:' + b.bg + ';color:' + b.fg;
      var parsed = parseNotes(c.notes);
      var metaParts = [];
      if (c.handle) metaParts.push('<span>' + esc(c.handle) + '</span>');
      if (c.source) metaParts.push('<span>' + esc(c.source) + '</span>');
      if (parsed.brok) metaParts.push('<span>' + esc(parsed.brok) + '</span>');
      if (parsed.next) metaParts.push('<span>→ ' + esc(parsed.next) + '</span>');
      if (parsed.notes) metaParts.push('<span>' + esc(parsed.notes) + '</span>');
      // Email row · ONLY rendered when present (ADHD-friendly cleanliness)
      var emailRow = parsed.email
        ? '<div class="tct-meta" style="margin-top:2px"><span style="word-break:break-all">' + esc(parsed.email) + '</span></div>'
        : '';
      return '<div class="tct-row" data-row-id="' + esc(c.id) + '" tabindex="0" role="button" aria-label="Edit ' + esc(c.name) + '">' +
        '<div class="tct-row-top">' +
          '<div>' +
            '<div class="tct-name">' + esc(c.name) + '</div>' +
            '<div class="tct-meta">' + metaParts.join('') + '</div>' +
            emailRow +
          '</div>' +
          '<span class="tct-stage-badge" style="' + badgeStyle + '">' + esc(s.label) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  };

  function injectCss() {
    if (document.getElementById('tct-css')) return;
    var s = document.createElement('style');
    s.id = 'tct-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  global.mountTcTracker = async function (selector, opts) {
    var root = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!root) { console.warn('[TcTracker] mount target not found:', selector); return null; }
    var t = new TcTracker(root, opts);
    await t.init();
    global.AariTracker = t;
    return t;
  };

  global.TcTrackerStages = STAGES;
  global.TcTrackerBuckets = BUCKETS;
})(window);

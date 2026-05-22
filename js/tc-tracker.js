/* tc-tracker.js · shared TC Contact Tracker component
 * Used on eileen.html, milennys.html, and every future TC profile.
 * Single source of truth — edit this file to update every TC's tracker.
 *
 * Data layer: Supabase only. No localStorage. Per-TC isolation via owner_id = auth.uid().
 *
 * UI: 4 buckets (Cold / Talking / Hot / Won) that group the 7 underlying BD stages.
 * Underlying data model keeps the granular stages — the card badge surfaces the sub-stage.
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

  // ── 7 granular stages (data model · unchanged) ──
  var STAGES = [
    { key: 'Contacted',        label: 'Contacted',     bucket: 'cold',    cls: 's-contacted', desc: 'DM sent. No reply yet.' },
    { key: 'Replied',          label: 'Replied',       bucket: 'cold',    cls: 's-replied',   desc: 'One message back. Not yet a real conversation.' },
    { key: 'In Conversation',  label: 'In Convo',      bucket: 'talking', cls: 's-convo',     desc: 'Real back and forth. Add to ActiveCampaign.' },
    { key: 'Added to AC',      label: 'In AC',         bucket: 'talking', cls: 's-ac',        desc: 'In email nurture. Keep the DM warm.' },
    { key: 'Hand Raise',       label: '✋ Hand Raise', bucket: 'hot',     cls: 's-raise',     desc: 'Asked for pricing or how to start. Book a discovery.' },
    { key: 'Discovery Booked', label: 'Discovery',     bucket: 'hot',     cls: 's-disco',     desc: 'Call on the calendar. Your job is to close.' },
    { key: 'Signed',           label: 'Signed',        bucket: 'won',     cls: 's-signed',    desc: 'Client. Go find the next one.' }
  ];

  // ── 4 visual buckets (UI · what the user sees) ──
  // Settled palette · earthy washes, not pastel pops.
  var BUCKETS = [
    { key: 'cold',    label: 'Cold',    bg: '#F4F2EE', fg: '#6B6862', accent: '#A8A39A' },
    { key: 'talking', label: 'Talking', bg: '#F1ECE5', fg: '#8C7B5E', accent: '#B8A789' },
    { key: 'hot',     label: 'Hot',     bg: '#EFE3DC', fg: '#8C5A45', accent: '#B58370' },
    { key: 'won',     label: 'Won',     bg: '#E8EAE3', fg: '#5A6B57', accent: '#8A9C85' }
  ];

  var IN_AC_STAGES = ['Added to AC', 'Hand Raise', 'Discovery Booked', 'Signed'];

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
    '.tct-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px}',
    '.tct-filters{display:flex;gap:8px;flex-wrap:wrap;flex:1}',
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
    '.tct-row{padding:14px 16px;border:1px solid #efebe5;border-radius:10px;margin-bottom:8px;background:#fff;cursor:pointer;transition:background .12s ease,border-color .12s ease}',
    '.tct-row:hover{background:#faf8f3;border-color:#e2dccd}',
    '.tct-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
    '.tct-name{font-size:13px;font-weight:600;color:#0a0a0a}',
    '.tct-meta{font-size:11px;color:#9a958b;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:4px}',
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
    '.tct-modal-ftr button.danger{color:#A32D2D;border-color:#E8C8C8}',
    '.tct-modal-ftr button.danger:hover{background:#FCEBEB;color:#A32D2D}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function buildTemplate() {
    var formStageOpts = STAGES.map(function (s) {
      return '<option value="' + esc(s.key) + '">' + esc(s.label) + '</option>';
    }).join('') + '<option value="Not Interested">Not Interested</option>';

    return [
      '<div class="tct">',
      '  <div class="tct-top">',
      '    <div class="tct-filters" data-filters></div>',
      '    <button class="tct-add" data-action="add-toggle">+ Add</button>',
      '  </div>',
      '  <div class="tct-form" data-form>',
      '    <h4>New Contact</h4>',
      '    <p class="tct-form-note">Add everyone you DM — replied or not.</p>',
      '    <div class="tct-grid">',
      '      <div class="tct-af"><label>Name</label><input type="text" data-field="name" placeholder="Agent name"></div>',
      '      <div class="tct-af"><label>Instagram / Phone</label><input type="text" data-field="handle" placeholder="@handle"></div>',
      '      <div class="tct-af"><label>Brokerage</label><input type="text" data-field="brok" placeholder="e.g. KW..."></div>',
      '      <div class="tct-af"><label>Found via</label><select data-field="source"><option>IG search</option><option>Referral</option><option>Post comment</option><option>Story view</option><option>Cold email</option><option>Mailer</option><option>Event</option><option>Other</option></select></div>',
      '      <div class="tct-af full"><label>Stage</label><select data-field="stage">' + formStageOpts + '</select></div>',
      '      <div class="tct-af full"><label>Next Step</label><input type="text" data-field="next" placeholder="e.g. Follow up Friday..."></div>',
      '    </div>',
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
      '          <div><label>Instagram / Phone</label><input type="text" data-edit-field="handle"></div>',
      '          <div><label>Brokerage</label><input type="text" data-edit-field="brok"></div>',
      '          <div><label>Found via</label><select data-edit-field="source"><option>IG search</option><option>Referral</option><option>Post comment</option><option>Story view</option><option>Cold email</option><option>Mailer</option><option>Event</option><option>Other</option></select></div>',
      '          <div class="full"><label>Stage</label><select data-edit-field="stage">' + formStageOpts + '</select></div>',
      '          <div class="full"><label>Next Step</label><input type="text" data-edit-field="next"></div>',
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
    this.cb = 'hot';                    // current bucket (4-way filter)
    this.cbAutoDefault = true;          // auto-land on highest-priority non-empty bucket
    this.editingId = null;              // id of contact row currently in edit mode
    this.ownerId = null;
    this.client = null;
    this.listeners = [];
    // Cockpit-owner override · when set, Tracker always reads/writes for this person,
    // regardless of who's logged in. Lets broker preview a TC's tracker correctly.
    this.cockpitOwnerFirstName = (opts && opts.cockpitOwnerFirstName) || null;
  }

  // Parse "Brokerage: X · Next: Y · ...notes..." from the notes column
  function parseNotes(notes) {
    var out = { brok: '', next: '', notes: '' };
    if (!notes) return out;
    var parts = String(notes).split(' · ');
    var leftover = [];
    parts.forEach(function (p) {
      if (p.indexOf('Brokerage: ') === 0) out.brok = p.slice(11);
      else if (p.indexOf('Next: ') === 0) out.next = p.slice(6);
      else leftover.push(p);
    });
    out.notes = leftover.join(' · ');
    return out;
  }
  function packNotes(brok, next, notes) {
    var parts = [];
    if (brok) parts.push('Brokerage: ' + brok);
    if (next) parts.push('Next: ' + next);
    if (notes) parts.push(notes);
    return parts.length ? parts.join(' · ') : null;
  }

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
          stage: row.stage, notes: row.notes,
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
    if (!this.client || !this.ownerId) { console.warn('[TcTracker] not authed'); return null; }
    var nowIso = new Date().toISOString();
    var notesParts = [];
    if (input.brok) notesParts.push('Brokerage: ' + input.brok);
    if (input.next) notesParts.push('Next: ' + input.next);
    if (input.notes) notesParts.push(input.notes);
    var row = {
      owner_id: this.ownerId,
      name: (input.name || '(unnamed)').trim(),
      handle: input.handle || null,
      source: input.source || 'IG search',
      stage: input.stage || 'Contacted',
      notes: notesParts.length ? notesParts.join(' · ') : null,
      dm_sent_at: nowIso,
      last_touch_at: nowIso
    };
    try {
      var r = await this.client.from('bd_contacts').insert([row]).select();
      if (r.error) { console.error('[TcTracker] insert', r.error); alert('Save failed'); return null; }
      if (r.data && r.data[0]) this.contacts.unshift({
        id: r.data[0].id, name: r.data[0].name, handle: r.data[0].handle,
        source: r.data[0].source, stage: r.data[0].stage, notes: r.data[0].notes,
        dm_sent_at: r.data[0].dm_sent_at, last_touch_at: r.data[0].last_touch_at
      });
      this._render();
      this._fireChange();
      return r.data && r.data[0];
    } catch (e) { console.error('[TcTracker] addContact error', e); return null; }
  };

  TcTracker.prototype.updateStage = async function (id, stage) {
    if (!this.client) return;
    var nowIso = new Date().toISOString();
    try {
      var r = await this.client.from('bd_contacts').update({ stage: stage, last_touch_at: nowIso }).eq('id', id);
      if (r.error) { console.error('[TcTracker] updateStage', r.error); return; }
      for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) {
        this.contacts[i].stage = stage; this.contacts[i].last_touch_at = nowIso; break;
      }
      this._render();
      this._fireChange();
    } catch (e) { console.error('[TcTracker] updateStage error', e); }
  };

  TcTracker.prototype.updateContact = async function (id, patch) {
    if (!this.client) return;
    var nowIso = new Date().toISOString();
    var update = {
      name: patch.name || '(unnamed)',
      handle: patch.handle || null,
      source: patch.source || null,
      stage: patch.stage || 'Contacted',
      notes: packNotes(patch.brok, patch.next, patch.notes),
      last_touch_at: nowIso
    };
    try {
      var r = await this.client.from('bd_contacts').update(update).eq('id', id);
      if (r.error) { console.error('[TcTracker] updateContact', r.error); alert('Save failed'); return; }
      for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) {
        var c = this.contacts[i];
        c.name = update.name; c.handle = update.handle; c.source = update.source;
        c.stage = update.stage; c.notes = update.notes; c.last_touch_at = nowIso;
        break;
      }
      this.editingId = null;
      this._render();
      this._fireChange();
    } catch (e) { console.error('[TcTracker] updateContact error', e); }
  };

  TcTracker.prototype.deleteContact = async function (id) {
    if (!this.client) return;
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    try {
      var r = await this.client.from('bd_contacts').delete().eq('id', id);
      if (r.error) { console.error('[TcTracker] delete', r.error); alert('Delete failed'); return; }
      this.contacts = this.contacts.filter(function (c) { return c.id !== id; });
      this._render();
      this._fireChange();
    } catch (e) { console.error('[TcTracker] deleteContact error', e); }
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
      if (action === 'edit-close')  { self._closeEditModal(); return; }
      if (action === 'edit-save')   { self._commitEdit(); return; }
      if (action === 'edit-delete') { self._deleteFromModal(); return; }
      if (action === 'add-toggle')  { self._toggleForm(); return; }
      if (action === 'add-submit')  { self._submitAdd(); return; }
      if (action === 'add-cancel')  { self._toggleForm(false); return; }
      var bucket = btn.getAttribute('data-bucket');
      if (bucket) { self._setBucket(bucket); return; }
      var rowId = btn.getAttribute('data-row-id');
      if (rowId) { self._openEditModal(rowId); return; }
    });
  };

  TcTracker.prototype._openEditModal = function (id) {
    var c = null;
    for (var i = 0; i < this.contacts.length; i++) if (this.contacts[i].id === id) { c = this.contacts[i]; break; }
    if (!c) return;
    this.editingId = id;
    var parsed = parseNotes(c.notes);
    var m = this.root.querySelector('[data-edit-overlay]');
    var setField = function (k, v) {
      var el = m.querySelector('[data-edit-field="' + k + '"]');
      if (el) el.value = v == null ? '' : v;
    };
    setField('name', c.name);
    setField('handle', c.handle);
    setField('brok', parsed.brok);
    setField('source', c.source || 'IG search');
    setField('stage', c.stage || 'Contacted');
    setField('next', parsed.next);
    m.classList.add('open');
    // focus name on open
    setTimeout(function () {
      var n = m.querySelector('[data-edit-field="name"]');
      if (n) n.focus();
    }, 40);
  };

  TcTracker.prototype._closeEditModal = function () {
    this.editingId = null;
    var m = this.root.querySelector('[data-edit-overlay]');
    if (m) m.classList.remove('open');
  };

  TcTracker.prototype._commitEdit = function () {
    var id = this.editingId;
    if (!id) return;
    var m = this.root.querySelector('[data-edit-overlay]');
    var get = function (k) {
      var el = m.querySelector('[data-edit-field="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    this.updateContact(id, {
      name: get('name'), handle: get('handle'), brok: get('brok'),
      source: get('source'), stage: get('stage'), next: get('next')
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
      name: get('name'), handle: get('handle'), brok: get('brok'),
      source: get('source'), stage: get('stage'), next: get('next')
    };
    if (!input.name) return;
    await this.addContact(input);
    ['name', 'handle', 'brok', 'next'].forEach(function (k) {
      var el = f.querySelector('[data-field="' + k + '"]');
      if (el) el.value = '';
    });
    this._toggleForm(false);
  };

  TcTracker.prototype._render = function () {
    this._updateCounts();
    if (this.cbAutoDefault) this._applyAutoDefault();
    this._renderFilters();
    this._updateCountsDom();
    this._renderList();
  };

  TcTracker.prototype._updateCounts = function () {
    var counts = { cold: 0, talking: 0, hot: 0, won: 0 };
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
    // Priority: hot → talking → cold → won. Land on first non-empty bucket.
    var prio = ['hot', 'talking', 'cold', 'won'];
    var target = null;
    for (var i = 0; i < prio.length; i++) if (this.counts[prio[i]] > 0) { target = prio[i]; break; }
    this.cb = target || 'hot';
  };

  TcTracker.prototype._renderList = function () {
    var list = this.root.querySelector('[data-list]');
    if (!list) return;
    var stagesInBucket = bucketStages(this.cb);
    var filtered = this.contacts.filter(function (c) { return stagesInBucket.indexOf(c.stage) >= 0; });
    if (!filtered.length) {
      var emptyMsg = ({
        cold:    'No cold contacts. Keep DMing.',
        talking: 'No active conversations yet.',
        hot:     'Nothing hot right now. Work the cold pile.',
        won:     'No closed clients yet. The next one is in your pipeline.'
      })[this.cb] || 'Empty bucket.';
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
      return '<div class="tct-row" data-row-id="' + esc(c.id) + '" tabindex="0" role="button" aria-label="Edit ' + esc(c.name) + '">' +
        '<div class="tct-row-top">' +
          '<div>' +
            '<div class="tct-name">' + esc(c.name) + '</div>' +
            '<div class="tct-meta">' + metaParts.join('') + '</div>' +
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

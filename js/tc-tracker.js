/* tc-tracker.js · shared TC Contact Tracker component
 * Used on eileen.html, milennys.html, and every future TC profile.
 * Single source of truth — edit this file to update every TC's tracker.
 *
 * Data layer: Supabase only. No localStorage. Per-TC isolation via owner_id = auth.uid().
 *
 * Usage on a TC page:
 *   <div id="trackerMount"></div>
 *   <script src="js/tc-tracker.js" defer></script>
 *   <script>document.addEventListener('DOMContentLoaded', () => mountTcTracker('#trackerMount'));</script>
 *
 * Public API after mount: window.AariTracker
 *   .getContacts()                     → snapshot of current contacts
 *   .addContact({name, handle, ...})   → insert a new contact
 *   .updateStage(id, stage)            → change a contact's stage
 *   .deleteContact(id)                 → soft-delete via confirm
 *   .reload()                          → refetch from Supabase
 *   .onChange(callback)                → subscribe to contact-list changes
 */
(function (global) {
  'use strict';

  var STAGES = [
    { key: 'Hand Raise',       label: '✋ Raises', prio: 1, tone: 'hot',  cls: 's-raise',     desc: 'Asked for pricing or how to start. Book a discovery call immediately.' },
    { key: 'Discovery Booked', label: 'Discovery',     prio: 2, tone: 'hot',  cls: 's-disco',     desc: 'Call on the calendar. Your job is to close.' },
    { key: 'Added to AC',      label: 'In AC',         prio: 3, tone: 'hot',  cls: 's-ac',        desc: 'Getting daily emails. Keep the DM warm. Watch for hand raises.' },
    { key: 'In Conversation',  label: 'In Convo',      prio: 4, tone: 'warm', cls: 's-convo',     desc: 'Real back and forth. Add to AC now.' },
    { key: 'Replied',          label: 'Replied',       prio: 5, tone: 'cool', cls: 's-replied',   desc: 'One message back. Not a two-way conversation. Do NOT add to AC yet.' },
    { key: 'Contacted',        label: 'Contacted',     prio: 6, tone: 'cool', cls: 's-contacted', desc: 'DM sent. No reply. Add to tracker now. Not AC yet.' },
    { key: 'Signed',           label: 'Signed',        prio: 7, tone: 'cool', cls: 's-signed',    desc: 'Client. Notify Marlenyi. Go find the next one.' }
  ];

  var IN_AC_STAGES = ['Added to AC', 'Hand Raise', 'Discovery Booked', 'Signed'];

  var CSS = [
    '.tct{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0a0a0a}',
    '.tct-intro h3{margin:0 0 4px;font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;font-weight:600}',
    '.tct-intro p{margin:0 0 14px;font-size:12px;color:#555;line-height:1.5}',
    '.tct-hdr{display:flex;justify-content:space-between;align-items:center;margin:8px 0 12px;gap:10px;flex-wrap:wrap}',
    '.tct-hdr h3{margin:0;font-size:14px;font-weight:600}',
    '.tct-count{font-size:11px;color:#888;font-weight:400;margin-left:6px}',
    '.tct-btn{font-size:11px;padding:6px 12px;border:1px solid #999;background:transparent;color:#555;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.tct-btn-primary{background:#0a0a0a;color:#fff;border-color:#0a0a0a}',
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
    '.tct-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}',
    '.tct-filter{background:none;border:1px solid #d0d0d0;border-radius:100px;font-family:inherit;font-size:10px;padding:3px 10px;cursor:pointer;color:#666;display:inline-flex;align-items:center;gap:6px}',
    '.tct-filter.active{background:#0a0a0a;color:#fff;border-color:#0a0a0a}',
    '.tct-fc{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:16px;padding:0 5px;border-radius:8px;background:#eee;color:#666;font-size:9px;font-weight:600;line-height:1}',
    '.tct-filter.active .tct-fc{background:rgba(255,255,255,.2);color:#fff}',
    '.tct-fc.hot{background:#FCEBEB;color:#A32D2D}',
    '.tct-fc.warm{background:#FAEEDA;color:#854F0B}',
    '.tct-filter.active .tct-fc.hot,.tct-filter.active .tct-fc.warm{background:rgba(255,255,255,.22);color:#fff}',
    '.tct-empty{padding:30px 16px;text-align:center;font-size:12px;color:#888;background:#fafaf7;border-radius:8px;border:1px dashed #d0d0d0}',
    '.tct-row{padding:12px 14px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fff}',
    '.tct-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px}',
    '.tct-name{font-size:13px;font-weight:600;color:#0a0a0a}',
    '.tct-name .tct-handle{color:#777;font-weight:400;font-size:11px;margin-left:6px}',
    '.tct-meta{font-size:11px;color:#888;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:3px}',
    '.tct-sp{display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:500;letter-spacing:.3px;white-space:nowrap}',
    '.tct-sp.s-contacted{background:#eee;color:#555}',
    '.tct-sp.s-replied{background:#FAEEDA;color:#854F0B}',
    '.tct-sp.s-convo{background:#FAEEDA;color:#854F0B}',
    '.tct-sp.s-ac{background:#FCEBEB;color:#A32D2D}',
    '.tct-sp.s-raise{background:#FCEBEB;color:#A32D2D}',
    '.tct-sp.s-disco{background:#FCEBEB;color:#A32D2D}',
    '.tct-sp.s-signed{background:#E1F5EE;color:#0F6E56}',
    '.tct-sp.s-out{background:#eee;color:#888}',
    '.tct-row-actions{display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap}',
    '.tct-row-actions select{font-size:11px;padding:4px 6px;border:1px solid #d0d0d0;border-radius:5px;font-family:inherit;background:#fff}',
    '.tct-row-actions button{font-size:10px;padding:4px 8px;background:transparent;border:1px solid #d0d0d0;border-radius:5px;cursor:pointer;color:#666;font-family:inherit}',
    '.tct-defs{margin-top:18px;border-top:1px solid #eee;padding-top:14px}',
    '.tct-defs-hdr{display:flex;justify-content:space-between;align-items:center;cursor:pointer}',
    '.tct-defs-hdr h3{margin:0;font-size:12px;font-weight:600}',
    '.tct-defs-hdr .tct-arrow{font-size:11px;color:#888}',
    '.tct-defs-body{display:none;margin-top:10px}',
    '.tct-defs.open .tct-defs-body{display:block}',
    '.tct-def-row{display:flex;gap:10px;padding:6px 0;font-size:11px;color:#555;align-items:flex-start;border-bottom:1px solid #f4f4f1}',
    '.tct-def-row:last-child{border-bottom:none}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function stageMeta(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return STAGES[i];
    return { key: key, label: key, cls: 's-contacted', tone: 'cool' };
  }

  function buildTemplate() {
    var formStageOpts = STAGES.map(function (s) {
      return '<option value="' + esc(s.key) + '">' + esc(s.label) + '</option>';
    }).join('') + '<option value="Not Interested">Not Interested</option>';

    var defsRows = STAGES.map(function (s) {
      return '<div class="tct-def-row"><span class="tct-sp ' + s.cls + '">' + esc(s.label) + '</span><span>' + esc(s.desc) + '</span></div>';
    }).join('');

    return [
      '<div class="tct">',
      '  <div class="tct-intro">',
      '    <h3>Your Contact Tracker</h3>',
      '    <p>Everyone you DM goes here — all 15 per day. <strong>Only "In Conversation" or beyond gets added to ActiveCampaign.</strong></p>',
      '  </div>',
      '  <div class="tct-hdr">',
      '    <h3>All Contacts <span class="tct-count" data-total>(0 active · 0 in AC)</span></h3>',
      '    <div style="display:flex;gap:8px;flex-wrap:wrap">',
      '      <button class="tct-btn" data-action="add-toggle">+ Add</button>',
      '    </div>',
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
      '      <button class="tct-btn tct-btn-primary" data-action="add-submit">Add →</button>',
      '      <button class="tct-btn" data-action="add-cancel">Cancel</button>',
      '    </div>',
      '  </div>',
      '  <div class="tct-filters" data-filters></div>',
      '  <div data-list></div>',
      '  <div class="tct-defs" data-defs>',
      '    <div class="tct-defs-hdr" data-action="defs-toggle"><h3>What does each stage mean?</h3><span class="tct-arrow">↓ expand</span></div>',
      '    <div class="tct-defs-body">' + defsRows + '</div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function TcTracker(root) {
    this.root = root;
    this.contacts = [];
    this.counts = {};
    this.cf = 'Hand Raise';
    this.cfAutoDefault = true;
    this.ownerId = null;
    this.client = null;
    this.listeners = [];
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
      var auth = await this.client.auth.getUser();
      this.ownerId = (auth && auth.data && auth.data.user) ? auth.data.user.id : null;
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
    // Pack brok/next into notes for storage (schema-safe)
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
    wrap.innerHTML = STAGES.map(function (s) {
      var toneCls = s.tone === 'hot' ? ' hot' : s.tone === 'warm' ? ' warm' : '';
      var activeCls = (s.key === this.cf) ? ' active' : '';
      return '<button class="tct-filter' + activeCls + '" data-filter="' + esc(s.key) + '">' +
             esc(s.label) +
             ' <span class="tct-fc' + toneCls + '" data-count="' + esc(s.key) + '">0</span>' +
             '</button>';
    }.bind(this)).join('');
  };

  TcTracker.prototype._wireEvents = function () {
    var self = this;
    this.root.addEventListener('click', function (e) {
      var t = e.target;
      var btn = t.closest ? t.closest('[data-action], .tct-filter, [data-delete-id]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var delId = btn.getAttribute('data-delete-id');
      if (delId) { self.deleteContact(delId); return; }
      if (btn.classList.contains('tct-filter')) {
        var stage = btn.getAttribute('data-filter');
        if (stage) self._setFilter(stage);
        return;
      }
      if (action === 'add-toggle') self._toggleForm();
      else if (action === 'add-submit') self._submitAdd();
      else if (action === 'add-cancel') self._toggleForm(false);
      else if (action === 'defs-toggle') self._toggleDefs();
    });
    this.root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('select[data-stage-for]')) {
        self.updateStage(t.getAttribute('data-stage-for'), t.value);
      }
    });
  };

  TcTracker.prototype._setFilter = function (stage) {
    this.cf = stage;
    this.cfAutoDefault = false;
    var btns = this.root.querySelectorAll('.tct-filter');
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-filter') === stage); });
    this._renderList();
  };

  TcTracker.prototype._toggleForm = function (force) {
    var f = this.root.querySelector('[data-form]');
    if (!f) return;
    var willOpen = (force === undefined) ? !f.classList.contains('open') : !!force;
    f.classList.toggle('open', willOpen);
  };

  TcTracker.prototype._toggleDefs = function () {
    var d = this.root.querySelector('[data-defs]');
    if (!d) return;
    d.classList.toggle('open');
    var arr = d.querySelector('.tct-arrow');
    if (arr) arr.textContent = d.classList.contains('open') ? '↑ collapse' : '↓ expand';
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
    if (this.cfAutoDefault) this._applyAutoDefault();
    this._renderList();
    this._renderTotal();
  };

  TcTracker.prototype._updateCounts = function () {
    var counts = {};
    STAGES.forEach(function (s) { counts[s.key] = 0; });
    this.contacts.forEach(function (c) { if (counts.hasOwnProperty(c.stage)) counts[c.stage]++; });
    this.counts = counts;
    STAGES.forEach(function (s) {
      var el = this.root.querySelector('[data-count="' + s.key + '"]');
      if (el) el.textContent = counts[s.key];
    }.bind(this));
  };

  TcTracker.prototype._applyAutoDefault = function () {
    var prio = STAGES.slice().sort(function (a, b) { return a.prio - b.prio; });
    var first = null;
    for (var i = 0; i < prio.length; i++) if (this.counts[prio[i].key] > 0) { first = prio[i]; break; }
    var target = first ? first.key : 'Hand Raise';
    this.cf = target;
    var btns = this.root.querySelectorAll('.tct-filter');
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-filter') === target); });
  };

  TcTracker.prototype._renderTotal = function () {
    var total = this.contacts.filter(function (c) { return c.stage !== 'Not Interested'; }).length;
    var inAC = this.contacts.filter(function (c) { return IN_AC_STAGES.indexOf(c.stage) >= 0; }).length;
    var el = this.root.querySelector('[data-total]');
    if (el) el.textContent = '(' + total + ' active · ' + inAC + ' in AC)';
  };

  TcTracker.prototype._renderList = function () {
    var list = this.root.querySelector('[data-list]');
    if (!list) return;
    var cf = this.cf;
    var filtered = this.contacts.filter(function (c) { return c.stage === cf; });
    if (!filtered.length) {
      list.innerHTML = '<div class="tct-empty">No contacts in this stage yet.</div>';
      return;
    }
    list.innerHTML = filtered.map(function (c) {
      var s = stageMeta(c.stage);
      var stageOpts = STAGES.map(function (o) {
        return '<option' + (c.stage === o.key ? ' selected' : '') + ' value="' + esc(o.key) + '">' + esc(o.label) + '</option>';
      }).join('') + '<option' + (c.stage === 'Not Interested' ? ' selected' : '') + ' value="Not Interested">Not Interested</option>';
      var notesHtml = c.notes ? '<span>' + esc(c.notes) + '</span>' : '';
      return '<div class="tct-row">' +
        '<div class="tct-row-top">' +
          '<div>' +
            '<div class="tct-name">' + esc(c.name) + '</div>' +
            '<div class="tct-meta">' +
              (c.handle ? '<span>' + esc(c.handle) + '</span>' : '') +
              (c.source ? '<span>' + esc(c.source) + '</span>' : '') +
              notesHtml +
            '</div>' +
          '</div>' +
          '<span class="tct-sp ' + s.cls + '">' + esc(s.label) + '</span>' +
        '</div>' +
        '<div class="tct-row-actions">' +
          '<select data-stage-for="' + esc(c.id) + '">' + stageOpts + '</select>' +
          '<button data-delete-id="' + esc(c.id) + '">Delete</button>' +
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

  global.mountTcTracker = async function (selector) {
    var root = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!root) { console.warn('[TcTracker] mount target not found:', selector); return null; }
    var t = new TcTracker(root);
    await t.init();
    global.AariTracker = t;
    return t;
  };

  global.TcTrackerStages = STAGES;
})(window);

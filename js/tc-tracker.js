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
    '.tct-row{padding:12px 14px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fff}',
    '.tct-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px}',
    '.tct-name{font-size:13px;font-weight:600;color:#0a0a0a}',
    '.tct-meta{font-size:11px;color:#888;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:3px}',
    '.tct-stage-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:11px;font-size:10px;font-weight:500;letter-spacing:.2px;white-space:nowrap}',
    '.tct-row-actions{display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap}',
    '.tct-row-actions select{font-size:11px;padding:4px 6px;border:1px solid #d0d0d0;border-radius:5px;font-family:inherit;background:#fff}',
    '.tct-row-actions button{font-size:10px;padding:4px 8px;background:transparent;border:1px solid #d0d0d0;border-radius:5px;cursor:pointer;color:#666;font-family:inherit}',
    '.tct-row-actions button:hover{background:#fafaf7}'
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
      '</div>'
    ].join('\n');
  }

  function TcTracker(root) {
    this.root = root;
    this.contacts = [];
    this.counts = { cold: 0, talking: 0, hot: 0, won: 0 };
    this.cb = 'hot';                    // current bucket (4-way filter)
    this.cbAutoDefault = true;          // auto-land on highest-priority non-empty bucket
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
      var btn = t.closest ? t.closest('[data-action], [data-bucket], [data-delete-id]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var delId = btn.getAttribute('data-delete-id');
      if (delId) { self.deleteContact(delId); return; }
      var bucket = btn.getAttribute('data-bucket');
      if (bucket) { self._setBucket(bucket); return; }
      if (action === 'add-toggle') self._toggleForm();
      else if (action === 'add-submit') self._submitAdd();
      else if (action === 'add-cancel') self._toggleForm(false);
    });
    this.root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('select[data-stage-for]')) {
        self.updateStage(t.getAttribute('data-stage-for'), t.value);
      }
    });
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
      var stageOpts = STAGES.map(function (o) {
        return '<option' + (c.stage === o.key ? ' selected' : '') + ' value="' + esc(o.key) + '">' + esc(o.label) + '</option>';
      }).join('') + '<option' + (c.stage === 'Not Interested' ? ' selected' : '') + ' value="Not Interested">Not Interested</option>';
      var notesHtml = c.notes ? '<span>' + esc(c.notes) + '</span>' : '';
      var badgeStyle = 'background:' + b.bg + ';color:' + b.fg;
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
          '<span class="tct-stage-badge" style="' + badgeStyle + '">' + esc(s.label) + '</span>' +
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
  global.TcTrackerBuckets = BUCKETS;
})(window);

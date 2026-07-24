/**
 * Aari Transactions · Effective-date reply reader  (v2 · July 24)
 * -------------------------------------------------------------------------
 * Reads agent replies to the "Confirm your effective date" and "Your deadlines
 * are set" emails, and drives the system from them:
 *   · reply YES / a date (MM/DD/YYYY)  -> confirms or sets the effective date
 *   · reply GOOD                        -> locks in the deadline schedule
 *   · anything it can't read cleanly    -> the assigned TC is emailed + the
 *                                          file is flagged; thread labeled for review
 *
 * v2 changes:
 *   · Per-MESSAGE dedupe (Script Properties), not per-thread labels. This means a
 *     SECOND reply on an already-handled thread (a correction, or a late GOOD after
 *     a YES) still gets read. The old version skipped any handled thread and dropped
 *     those silently.
 *   · Window widened to 30 days so a straggler reply is not missed.
 *   · Skips the owner mailbox's own messages (so a reply you send in-thread is not
 *     mistaken for the agent's).
 *   · Posts a heartbeat every run so a watchdog can tell if this stopped running.
 *
 * INSTALL (once):
 *   1. In the Gmail account that RECEIVES the replies (marlenyi@aarirealty.com),
 *      go to script.google.com, open this project, paste this in, Save.
 *   2. Run processAariReplies once and approve the permission prompt.
 *   3. Triggers (clock icon) -> Add Trigger -> processAariReplies,
 *      Time-driven, Minutes timer, every 5 minutes -> Save.
 */

var EDC_URL  = 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/effective-date-confirm';
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubHJnbXV2dGd3empzaWhxeGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODUxNDMsImV4cCI6MjA5Mzk2MTE0M30.C2-9M_OBuDLDDzr6g3DqisZ9OPDoFoKY7uQb7EsgG_Y';

var OWNER_EMAIL  = 'marlenyi@aarirealty.com';   // this mailbox — its own sends are not agent replies
var LABEL_DONE   = 'Aari-Handled';
var LABEL_REVIEW = 'Aari-Needs-TC';
var PROCESSED_KEY = 'aari_processed_msg_ids';
var MAX_IDS = 600; // keep the processed-id store bounded

function processAariReplies() {
  heartbeat_();

  var done   = getOrCreateLabel_(LABEL_DONE);
  var review = getOrCreateLabel_(LABEL_REVIEW);
  var processed = loadProcessed_();
  var touched = false;

  // Every thread carrying our Ref tag from the last 30 days. We no longer exclude
  // handled threads — dedupe is per message below, so corrections still get read.
  var threads = GmailApp.search('"Ref ED-" newer_than:30d', 0, 80);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      var id = msg.getId();
      if (processed[id]) continue;                       // already handled this exact message

      var from = (msg.getFrom() || '').toLowerCase();
      if (from.indexOf('aaritransactions.com') !== -1) { processed[id] = 1; touched = true; continue; } // our own sends
      if (from.indexOf(OWNER_EMAIL) !== -1)            { processed[id] = 1; touched = true; continue; } // owner's own replies

      var body = msg.getPlainBody() || '';
      var ref  = extractRef_(body);
      if (!ref) { processed[id] = 1; touched = true; continue; }

      var replyText = topOfReply_(body);
      if (!replyText) { thread.addLabel(review); processed[id] = 1; touched = true; continue; }

      var res = callConfirm_(ref, replyText);
      if (res && res.ok) { thread.addLabel(done); msg.markRead(); }
      else               { thread.addLabel(review); } // needs_review or error -> the function already emailed the TC
      processed[id] = 1; touched = true;
    }
  }

  if (touched) saveProcessed_(processed);
}

// ---- helpers ----

function heartbeat_() {
  try {
    UrlFetchApp.fetch(EDC_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY },
      payload: JSON.stringify({ op: 'heartbeat' }), muteHttpExceptions: true
    });
  } catch (e) { /* never let a heartbeat failure stop the run */ }
}

function extractRef_(body) {
  var m = body.match(/Ref ED-([A-Za-z0-9-]{6,})/);
  return m ? m[1] : null;
}

// Return only the new text the agent typed, above any quoted original.
function topOfReply_(body) {
  var markers = [
    body.search(/^On .+wrote:/m),
    body.search(/^_{5,}/m),
    body.search(/^-{3,}\s*Original Message/mi),
    body.search(/^From:\s/m)
  ].filter(function (x) { return x >= 0; });
  var cut = markers.length ? Math.min.apply(null, markers) : body.length;
  var top = body.substring(0, cut);
  top = top.split('\n').filter(function (l) { return !/^\s*>/.test(l); }).join('\n');
  return top.trim();
}

function callConfirm_(ref, text) {
  try {
    var resp = UrlFetchApp.fetch(EDC_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY },
      payload: JSON.stringify({ op: 'reply', ref: ref, text: text }),
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function loadProcessed_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
    if (!raw) return {};
    var arr = JSON.parse(raw); var map = {};
    for (var i = 0; i < arr.length; i++) map[arr[i]] = 1;
    return map;
  } catch (e) { return {}; }
}

function saveProcessed_(map) {
  try {
    var ids = Object.keys(map);
    if (ids.length > MAX_IDS) ids = ids.slice(ids.length - MAX_IDS); // keep newest, bound the store
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(ids));
  } catch (e) { /* ignore */ }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

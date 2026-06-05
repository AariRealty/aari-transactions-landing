/* ============================================================================
   Aari Transactions — Shared FL Deadline Engine (June 2026)
   ============================================================================
   Single source of truth for FAR/BAR AS-IS contract deadlines. Used by BOTH
   the TC cockpit (files.html) and the agent portal (portal.html). Do not
   duplicate this logic anywhere — import this file and read from
   window.AariDeadlineEngine.

   Inputs per file row: effective_date, closing_date, deadline_overrides jsonb
   ({ key: 'YYYY-MM-DD' } · manual override entered by the TC wins).
   Florida rule: a deadline landing on Sat/Sun/federal holiday rolls forward
   to the next business day.
   ============================================================================ */
(function (global) {
  'use strict';

  // Federal holidays (observed) · 2026-2027 · extend yearly.
  const FED_HOLIDAYS = new Set([
    '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03',
    '2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
    '2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05',
    '2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24',
  ]);
  function ymd(d){ return d.toLocaleDateString('en-CA'); }
  // Florida rule: deadline on Sat/Sun/federal holiday rolls to next business day.
  function flBusinessDay(d){
    const x = new Date(d.getTime());
    for(let i = 0; i < 10; i++){
      const day = x.getDay();
      if(day !== 0 && day !== 6 && !FED_HOLIDAYS.has(ymd(x))) return x;
      x.setDate(x.getDate() + 1);
    }
    return x;
  }
  function addDays(base, n){ const d = new Date(base.getTime()); d.setDate(d.getDate() + n); return d; }
  function parseDate(s){ if(!s) return null; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? null : d; }

  const DEADLINE_DEFS = [
    { key:'emd_initial',      label:'Initial deposit due',        from:'effective', offset:3 },
    { key:'loan_app',         label:'Loan application due',       from:'effective', offset:5 },
    { key:'emd_additional',   label:'Additional deposit due',     from:'effective', offset:10 },
    { key:'inspection_end',   label:'Inspection period ends',     from:'effective', offset:15 },
    { key:'loan_approval',    label:'Loan approval deadline',     from:'effective', offset:30 },
    { key:'title_commitment', label:'Title commitment deadline',  from:'closing',   offset:-15 },
    { key:'estoppel',         label:'Estoppel letter deadline',   from:'closing',   offset:-10 },
    { key:'survey',           label:'Survey deadline',            from:'closing',   offset:-5 },
    { key:'walkthrough',      label:'Walk-through',               from:'closing',   offset:-1 },
  ];
  // All FL-rolled deadlines for a file · {} when dates are missing.
  function fileDeadlines(file){
    const eff = parseDate(file.effective_date);
    const close = parseDate(file.closing_date);
    const ov = (file.deadline_overrides && typeof file.deadline_overrides === 'object') ? file.deadline_overrides : {};
    const out = {};
    DEADLINE_DEFS.forEach(def => {
      // Manual override wins · the TC entered the contract's actual date.
      if(ov[def.key]){
        const od = parseDate(ov[def.key]);
        if(od){ out[def.key] = { label: def.label, date: od, manual: true }; return; }
      }
      const base = def.from === 'effective' ? eff : close;
      if(!base) return;
      out[def.key] = { label: def.label, date: flBusinessDay(addDays(base, def.offset)) };
    });
    return out;
  }
  function dlState(date){
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(date.getTime()); d.setHours(0,0,0,0);
    if(d < today) return 'overdue';
    if(d.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  }
  function fmtDl(date){ return date.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }

  global.AariDeadlineEngine = {
    FED_HOLIDAYS, ymd, flBusinessDay, addDays, parseDate,
    DEADLINE_DEFS, fileDeadlines, dlState, fmtDl,
  };
})(window);

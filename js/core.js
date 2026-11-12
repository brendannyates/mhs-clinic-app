// Pure logic. No DOM, no fetch. Counts, flags and sorting all come from here so the strip and the list can't disagree.
(function (root) {
  'use strict';

  // "9:05 AM" | "09:05" | "13:00" -> minutes since midnight
  function minutes(t) {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (!m) return null;
    let h = +m[1];
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + +m[2];
  }
  // 24-hour, no leading zero: 9:05, 13:00
  function clock(t) {
    const n = minutes(t);
    return n == null ? String(t || '') : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }

  const FIX_LUMA = /^(Missing in Luma|Luma too high|Luma too low)$/;
  const NEEDS_BIDF = /^(Needs BIDF|Nothing on file)$/;
  const hasIvn = (r) => Array.isArray(r.ivn) && r.ivn.length > 0 && !/^n\/a/i.test(r.ivn[0]);

  // One flag per row: the top need, worded for the desk. Amber for anything to do today; never red here,
  // because red is reserved for "a patient is waiting on staff right now".
  function flag(r) {
    if (FIX_LUMA.test(r.check || '')) return { state: 'soon', text: r.check === 'Missing in Luma' ? 'Copay missing in Luma' : `Fix copay in Luma (${r.check.replace('Luma ', '')})` };
    if (r.check === 'Needs BIDF') return { state: 'soon', text: 'Needs BIDF' };
    if (r.check === 'Nothing on file') return { state: 'soon', text: 'No benefits on file' };
    if ((r.issues || []).length) return { state: 'soon', text: r.issues[0] };
    if (hasIvn(r)) return { state: 'soon', text: 'Tracker update' };
    if (r.checklist !== 'Done') return { state: 'soon', text: r.checklist === 'None' ? 'No checklist sent' : 'Checklist not done' };
    return { state: 'ok', text: 'Ready' };
  }
  const needsAction = (r) => flag(r).state !== 'ok';

  function counts(rows) {
    const n = (f) => rows.filter(f).length;
    return {
      visits: rows.length,
      copayOk: n((r) => r.check === 'OK'),
      fixInLuma: n((r) => FIX_LUMA.test(r.check || '')),
      needsBidf: n((r) => NEEDS_BIDF.test(r.check || '')),
      trackerUpdates: n(hasIvn),
      checklistsDone: n((r) => r.checklist === 'Done'),
      needsAction: n(needsAction),
    };
  }

  // Time order. The "Needs attention" chip (the default) does the urgency cut, so the desk reads the day top to bottom.
  function sortRows(rows) {
    return rows.slice().sort((a, b) => (minutes(a.time) ?? 1e4) - (minutes(b.time) ?? 1e4));
  }

  // LASFIR guard: the app only shows 2-6 letter uppercase codes. Anything else is masked, so a bad output file
  // can't put a full name on screen.
  const isLasfir = (s) => /^[A-Z]{2,6}$/.test(String(s || ''));
  const code = (s) => (isLasfir(s) ? s : '••••••');

  // Pacific date strings for today/tomorrow (the clinics run on Pacific time; Austin/Seattle can override later).
  function pacificDate(offsetDays, now) {
    const d = new Date((now || Date.now()) + (offsetDays || 0) * 864e5);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
  }
  function longDate(iso) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  const api = { minutes, clock, flag, needsAction, counts, sortRows, isLasfir, code, pacificDate, longDate, hasIvn };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);

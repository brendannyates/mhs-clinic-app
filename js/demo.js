// Demo mode (?demo=1). Every code, MRN, payer and person below is invented. Nothing here came from a workbook.
(function (root) {
  'use strict';
  if (!/[?&]demo=1\b/.test(location.search)) return;
  const C = root.Core, today = C.pacificDate(0), tomorrow = C.pacificDate(1);

  const row = (time, lasfir, n, visit, kind, o) => Object.assign({
    time, lasfir, mrn: `DEMO-${String(n).padStart(4, '0')}`, visit, kind, payer: 'Demo Health PPO',
    inLuma: '$20', expected: '$20', basis: 'Tracker plan copay', check: 'OK', checklist: 'Done',
    checklistCheck: 'Correct', issues: [], ivn: [], arrived: false, collected: 'None logged',
    cardOnFile: 'Yes', verbalConsent: 'Yes', dedLeft: '$0', oopmLeft: '$1,850',
  }, o || {});

  const days = {
    [today]: [
      row('8:00 AM', 'QUVOLA', 1, 'TMS Treatment', 'TMS', { arrived: true }),
      row('8:30 AM', 'ZEBRIN', 2, 'TMS Treatment', 'TMS', { inLuma: 'blank', check: 'Missing in Luma', issues: ['Luma copay blank, expected $20: update Luma'] }),
      row('9:00 AM', 'MOXTEV', 3, 'ESK Follow-Up', 'ESK', { inLuma: '$40', expected: '$25', check: 'Luma too high', issues: ['Luma copay $40, expected $25: update Luma'], ivn: ['OOPM remaining $900 vs Sohar $650: re-import'] }),
      row('9:30 AM', 'PLYNOR', 4, 'TMS Treatment', 'TMS', { inLuma: '$0', expected: '', basis: 'Coinsurance, no copay rule', check: 'Needs BIDF', issues: ['No copay rule fits (coinsurance): needs the BIDF before collecting'], ivn: ['Fill the BIDF (Daily PR and BIDF estimate are blank)'] }),
      row('10:00 AM', 'KESWYN', 5, 'Follow-Up', 'Other', { checklist: 'Not done', checklistCheck: 'Correct', issues: ['Checklist not finished: Insurance card, Consent'] }),
      row('10:30 AM', 'DRUFEL', 6, 'IVK Infusion', 'IVK', { inLuma: '$250', expected: '$250', basis: '$250 provider portion (self pay)', ivn: ['2026 BIDF blank: fill the BIDF'] }),
      row('11:00 AM', 'VANOSK', 7, 'TMS Mapping (MT)', 'TMS', { checklist: 'None', checklistCheck: 'No checklist sent', issues: ['No Luma checklist on this visit'] }),
      row('13:00', 'HURPEL', 8, 'TMS Treatment', 'TMS', { inLuma: '$0', expected: '$0', basis: 'OOP max met (TMS tracker)', oopmLeft: '$0' }),
      row('1:30 PM', 'TAZMIR', 9, 'New Patient', 'Other', { inLuma: '$45', expected: '$45', checklistCheck: 'Correct (New Patient Checklist)' }),
      row('2:00 PM', 'GILROW', 10, 'ESK Follow-Up', 'ESK', { inLuma: '$15', expected: '$25', check: 'Luma too low', issues: ['Luma copay $15, expected $25: update Luma'] }),
    ],
    [tomorrow]: [
      row('8:00 AM', 'QUVOLA', 1, 'TMS Treatment', 'TMS'),
      row('9:00 AM', 'BRASKY', 11, 'Consult', 'Other', { checklist: 'Not done', issues: ['Checklist not finished: Intake forms'] }),
      row('10:00 AM', 'MOXTEV', 3, 'ESK Follow-Up', 'ESK', { inLuma: '$40', expected: '$25', check: 'Luma too high', issues: ['Luma copay $40, expected $25: update Luma'] }),
      row('11:30 AM', 'FENJOR', 12, 'TMS Treatment', 'TMS', { check: 'Nothing on file', inLuma: 'blank', expected: '', issues: ['No benefits on file anywhere: verify before collecting'], ivn: ['Add a Benefits row: BIDF, DED and OOPM'] }),
    ],
  };

  const configs = {
    'demo-north': {
      clinic: 'demo-north', displayName: 'Demo North', address: '100 Example Street, Suite 2, Sampletown, CA 90000',
      parking: 'Street parking on Example St. Garage entrance on 2nd Ave, validate at the front desk.',
      hours: 'Mon to Fri 7:30 to 17:00. Closed weekends.',
      directory: [
        { role: 'Front desk', name: 'Alex P.', ext: '101', teams: '' },
        { role: 'TMS tech', name: 'Sam R.', ext: '104', teams: '' },
        { role: 'Practice lead', name: 'Jordan K.', ext: '110', teams: '' },
      ],
      binder: [
        { title: 'Check-in SOP', url: 'https://example.com/check-in', group: 'SOP' },
        { title: 'Copay collection SOP', url: 'https://example.com/copay', group: 'SOP' },
        { title: 'What to expect at your first TMS visit', url: 'https://example.com/tms-first', group: 'Patient resource' },
        { title: 'Release of information form', url: 'https://example.com/roi', group: 'Forms' },
      ],
      teamsChats: {},
    },
    'demo-south': {
      clinic: 'demo-south', displayName: 'Demo South', address: '200 Sample Avenue, Exampleville, CA 90001', parking: 'Lot behind the building.',
      hours: 'Mon to Thu 8:00 to 16:30.', directory: [{ role: 'Front desk', name: 'Riley T.', ext: '201', teams: '' }], binder: [], teamsChats: {},
    },
  };
  const readiness = { 'demo-north': { generatedAt: new Date().toISOString(), clinic: 'demo-north', days } };

  // Stand-ins for the Auth and Read flows. Same request and answer shapes as the build sheet.
  const CODE = '123456', RID = 'demo-req', TOKEN = 'demo-token';
  let tries = 0;
  const fail = (kind, status, body) => Promise.reject(new root.Data.FlowError(kind, `HTTP ${status}`, status, body));
  const later = (v) => new Promise((r) => setTimeout(() => r(v), 250));
  root.Demo = {
    code: CODE, requestId: RID, lastEmail: '',
    call(b) {
      if (b.action === 'start') { tries = 0; this.lastEmail = b.email; return later({ ok: true, requestId: RID, expiresAt: new Date(Date.now() + 6e5).toISOString() }); }
      if (b.action === 'verify') {
        if (b.requestId !== RID) return fail('signin', 401, { ok: false, reason: 'expired' });
        if (tries >= 3) return fail('signin', 401, { ok: false, reason: 'locked' });
        if (b.code !== CODE) { tries++; return fail('signin', 401, { ok: false, reason: tries >= 3 ? 'locked' : 'wrong', triesLeft: 3 - tries }); }
        return later({ ok: true, token: TOKEN, name: 'Alex P.', email: this.lastEmail || 'demo@example.com', role: 'Ops', clinics: ['demo-north', 'demo-south'], expiresAt: new Date(Date.now() + 12 * 36e5).toISOString() });
      }
      if (b.action === 'read') {
        if (b.token !== TOKEN) return fail('signin', 401, { ok: false, reason: 'session' });
        if (!configs[b.clinic]) return fail('denied', 403, { ok: false, reason: 'clinic' });
        const files = (b.files || []).map((f) => ({ name: f, content: f === 'config' ? configs[b.clinic] : f === 'readiness' ? (readiness[b.clinic] || null) : null }));
        return later(JSON.parse(JSON.stringify({ ok: true, clinic: b.clinic, files })));
      }
      return fail('http', 400, { ok: false, reason: 'action' });
    },
  };
})(self);

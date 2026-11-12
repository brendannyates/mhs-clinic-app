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

  const files = {
    'demo:index': { clinics: [{ slug: 'demo-north', config: 'demo:config:north' }, { slug: 'demo-south', config: 'demo:config:south' }, { slug: 'demo-locked', config: 'demo:config:locked' }] },
    'demo:config:north': {
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
      outputs: { readiness: 'demo:readiness' }, flows: {}, secret: '', teamsChats: {},
    },
    'demo:config:south': {
      clinic: 'demo-south', displayName: 'Demo South', address: '200 Sample Avenue, Exampleville, CA 90001', parking: 'Lot behind the building.',
      hours: 'Mon to Thu 8:00 to 16:30.', directory: [{ role: 'Front desk', name: 'Riley T.', ext: '201', teams: '' }], binder: [],
      outputs: {}, flows: {}, secret: '', teamsChats: {},
    },
    'demo:readiness': { generatedAt: new Date().toISOString(), clinic: 'demo-north', days },
  };

  root.Demo = {
    read(url) {
      return new Promise((resolve, reject) => setTimeout(() => {
        if (url === 'demo:config:locked') return reject(new root.Data.ReadError('denied', 'HTTP 403', 403));
        url in files ? resolve(JSON.parse(JSON.stringify(files[url]))) : reject(new root.Data.ReadError('denied', 'HTTP 404', 404));
      }, 150));
    },
    indexUrl: 'demo:index',
  };
})(self);

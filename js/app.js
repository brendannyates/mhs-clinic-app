// UI. Reads go through Data.getJSON; derived state comes from Core. Nothing read from OneDrive is stored:
// it lives in memory until the tab closes. sessionStorage holds only the clinic slug and the display name.
(function () {
  'use strict';
  const C = self.Core, D = self.Data, $ = (id) => document.getElementById(id);
  const DEMO = !!self.Demo;
  const INDEX = DEMO ? self.Demo.indexUrl : (self.SHELL && self.SHELL.indexUrl) || '';
  const POLL = (self.SHELL && self.SHELL.pollMs) || 60000;

  const state = {
    clinics: [],          // [{slug, config}] readable by this user
    clinic: null,         // current config
    route: 'ops/readiness',
    day: 0,               // 0 today, 1 tomorrow
    filter: 'need',       // need | all
    selected: null,       // mrn+time of selected row
    readiness: null,      // {generatedAt, days:{iso:[rows]}}
    readinessErr: null,
    actor: sessionStorage.getItem('actor') || '',
  };

  // tiny DOM helper: text is always set as text, never parsed as HTML
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  }
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2700); };
  const setConn = (s, text) => { $('connDot').dataset.state = s; $('connText').textContent = text; };
  const hhmm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

  // ---------- clinics ----------
  async function loadClinics() {
    if (!INDEX) return renderSetup();
    let index;
    try { index = await D.getJSON(INDEX); }
    catch (e) { console.warn('index read failed', e.kind, e.message); setConn('soon', 'Not connected'); return renderSetup(D.explain(e)); }
    const list = Array.isArray(index.clinics) ? index.clinics : [];
    // Folders this user can't read come back 403 and are dropped. Sharing does the authorization.
    const got = await Promise.all(list.map((c) => D.getJSON(c.config).then((config) => ({ slug: c.slug, config }), (e) => { console.info('clinic hidden', c.slug, e.kind); return null; })));
    state.clinics = got.filter(Boolean);
    if (!state.clinics.length) { setConn('soon', 'No clinic access'); return renderSetup("You don't have access to any clinic folder yet. Ask Brendan to share your clinic's folder with you."); }
    const last = sessionStorage.getItem('clinic');
    pickClinic((state.clinics.find((c) => c.slug === last) || state.clinics[0]).slug);
  }

  function pickClinic(slug) {
    const c = state.clinics.find((x) => x.slug === slug);
    state.clinic = c.config; state.readiness = null; state.readinessErr = null; state.selected = null;
    sessionStorage.setItem('clinic', slug);
    const box = $('clinic'); box.replaceChildren();
    if (state.clinics.length > 1) {
      const sel = h('select', { 'aria-label': 'Clinic', onchange: (e) => pickClinic(e.target.value) },
        state.clinics.map((x) => h('option', { value: x.slug, selected: x.slug === slug }, x.config.displayName || x.slug)));
      box.append('Clinic', sel);
    } else box.append(c.config.displayName || c.slug);
    setConn('ok', 'Connected to OneDrive');
    loadReadiness();
    render();
  }

  // ---------- readiness ----------
  async function loadReadiness() {
    const url = state.clinic && state.clinic.outputs && state.clinic.outputs.readiness;
    if (!url || /^<.*>$/.test(url)) { state.readinessErr = 'Readiness isn\'t set up for this clinic yet.'; return render(); }
    try { state.readiness = await D.getJSON(url); state.readinessErr = null; setConn('ok', `Updated ${hhmm(new Date())}`); }
    catch (e) { console.warn('readiness read failed', e.kind, e.message); state.readinessErr = D.explain(e); setConn('soon', 'Last read failed'); }
    render();
  }
  setInterval(() => { if (state.clinic && document.visibilityState === 'visible') loadReadiness(); }, POLL);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.clinic) loadReadiness(); });

  function dayRows() {
    const iso = C.pacificDate(state.day);
    const r = state.readiness && state.readiness.days && state.readiness.days[iso];
    return { iso, rows: Array.isArray(r) ? r : null };
  }

  function renderReadiness(page) {
    const { iso, rows } = dayRows();
    const all = rows ? C.sortRows(rows) : [];
    const k = C.counts(all);
    const shown = state.filter === 'need' ? all.filter(C.needsAction) : all;
    const key = (r) => `${r.mrn}|${r.time}`;
    if (!shown.some((r) => key(r) === state.selected)) state.selected = shown[0] ? key(shown[0]) : null;
    const sel = shown.find((r) => key(r) === state.selected);

    $('readyCount').hidden = !(state.day === 0 && rows && k.needsAction);
    $('readyCount').textContent = k.needsAction;

    page.append(h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Readiness'),
        h('p', { class: 'sub' }, rows ? `${k.visits} visits, ${k.needsAction} need attention` : C.longDate(iso))),
      h('div', { class: 'clock' }, h('div', { class: 't' }, state.day ? 'Tomorrow' : 'Today'), h('div', { class: 'd' }, C.longDate(iso)))));

    page.append(h('div', { class: 'viewbar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Day' },
      ['Today', 'Tomorrow'].map((l, i) => h('button', { 'aria-pressed': String(state.day === i), onclick: () => { state.day = i; state.selected = null; render(); } }, l)))));

    if (state.readinessErr) return page.append(h('div', { class: 'callout' }, state.readinessErr));
    if (!state.readiness) return page.append(h('div', { class: 'card empty' }, 'Reading readiness from OneDrive'));

    const gen = state.readiness.generatedAt ? new Date(state.readiness.generatedAt) : null;
    if (gen && Date.now() - gen > 26 * 36e5) page.append(h('div', { class: 'callout' }, `Readiness was last run ${gen.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${hhmm(gen)}. Today's run hasn't landed yet.`));
    if (!rows) return page.append(h('div', { class: 'card empty' }, `No readiness run for ${C.longDate(iso)} yet. It appears here after the daily run.`));

    const tile = (v, l, warn) => h('div', { class: 'card tile', 'data-state': warn && v ? 'soon' : '' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
    page.append(h('div', { class: 'strip' },
      tile(k.visits, 'Visits'), tile(`${k.copayOk} of ${k.visits}`, 'Copay matches'), tile(k.fixInLuma, 'Fix in Luma', true),
      tile(k.needsBidf, 'Needs BIDF', true), tile(k.trackerUpdates, 'Tracker updates', true), tile(`${k.checklistsDone} of ${k.visits}`, 'Checklists done')));

    page.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter' },
      h('button', { class: 'chip', 'aria-pressed': String(state.filter === 'need'), onclick: () => { state.filter = 'need'; render(); } }, 'Needs attention', h('span', { class: 'n' }, k.needsAction)),
      h('button', { class: 'chip', 'aria-pressed': String(state.filter === 'all'), onclick: () => { state.filter = 'all'; render(); } }, 'All visits', h('span', { class: 'n' }, k.visits))));

    const list = h('div', { class: 'card list', role: 'listbox', 'aria-label': 'Visits' },
      shown.length ? shown.map((r) => {
        const f = C.flag(r), code = C.code(r.lasfir);
        return h('button', { class: 'rrow', role: 'option', 'aria-selected': String(key(r) === state.selected),
          'aria-label': `${code}, ${C.clock(r.time)}, ${r.visit || ''}, ${f.text}`,
          onclick: () => { state.selected = key(r); render(); } },
          h('span', { class: 't' }, C.clock(r.time)), h('span', { class: 'p' }, code),
          h('span', { class: 'v' }, r.visit || '', r.arrived ? h('span', { class: 'tag' }, 'Arrived') : null),
          h('span', { class: 'need', 'data-state': f.state }, h('span', { class: 'dot', 'data-state': f.state }), h('span', {}, f.text)));
      }) : h('div', { class: 'empty' }, 'Nothing here. Every visit on this day is ready.'));

    page.append(h('div', { class: 'cols' }, list, sel ? renderDetail(sel) : h('div')));
  }

  function renderDetail(r) {
    const f = C.flag(r);
    const fact = (t, v, warn) => [h('dt', {}, t), h('dd', { class: warn ? 'flag' : null }, v == null || v === '' ? '—' : v)];
    const copayWarn = /Luma/.test(r.check || '') && r.check !== 'OK';
    return h('aside', { class: 'card detail', 'aria-label': 'Visit detail' },
      h('div', { class: 'hd' }, h('div', {}, h('span', { class: 'code' }, C.code(r.lasfir)), ' ', h('span', { class: 'mrn' }, `MRN ${r.mrn || '—'}`))),
      h('div', { class: 'meta' }, [C.clock(r.time), r.visit, r.kind && r.kind !== 'Other' ? r.kind : null, r.arrived ? 'Arrived' : null].filter(Boolean).join(' · ')),
      h('p', { class: `lead ${f.state}` }, f.state === 'ok' ? 'Ready. Copay, checklist and tracker all line up.' : f.text),
      h('div', { class: 'section' }, h('div', { class: 'h' }, h('h2', {}, 'Copay'), h('span', {}, r.check || '')),
        h('dl', { class: 'facts' },
          fact('In Luma', r.inLuma, copayWarn), fact('Expected', r.expected), fact('Based on', r.basis), fact('Payer', r.payer),
          fact('Card on file', r.cardOnFile, r.cardOnFile === 'No'), fact('Verbal consent', r.verbalConsent, r.verbalConsent === 'No'),
          fact('DED left', r.dedLeft), fact('OOPM left', r.oopmLeft), fact('Collected', r.collected))),
      h('div', { class: 'section' }, h('div', { class: 'h' }, h('h2', {}, 'Checklist'), h('span', {}, r.checklist || '')),
        h('p', { class: 'meta' }, r.checklistCheck || '')),
      (r.issues || []).length ? h('div', { class: 'section' }, h('div', { class: 'h' }, h('h2', {}, 'Issues'), h('span', {}, `${r.issues.length}`)), h('ul', { class: 'bul' }, r.issues.map((x) => h('li', {}, x)))) : null,
      C.hasIvn(r) ? h('div', { class: 'section' }, h('div', { class: 'h' }, h('h2', {}, 'Tracker needs'), h('span', {}, r.kind || '')), h('ul', { class: 'bul' }, r.ivn.map((x) => h('li', {}, x)))) : null,
      h('p', { class: 'note' }, 'Read-only for now. Make the fix in Luma or the tracker; it shows here after the next run.'));
  }

  // ---------- binder ----------
  function renderBinder(page) {
    const c = state.clinic || {};
    page.append(h('header', { class: 'top' }, h('div', {}, h('h1', {}, 'Binder'), h('p', { class: 'sub' }, c.displayName || ''))));
    const blank = (s) => !s || /^<.*>$/.test(s);
    const cards = [];
    const visit = h('section', { class: 'card bcard' }, h('h2', {}, 'Address and hours'));
    if (!blank(c.address)) visit.append(h('p', {}, c.address), h('p', {}, h('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Open in maps')));
    if (!blank(c.hours)) visit.append(h('p', { class: 'muted' }, c.hours));
    if (!blank(c.parking)) visit.append(h('h2', { style: 'margin-top:16px' }, 'Parking'), h('p', {}, c.parking));
    if (visit.childElementCount === 1) visit.append(h('p', { class: 'muted' }, 'No address or hours in the clinic config yet.'));
    cards.push(visit);

    const dir = (c.directory || []).filter((d) => d.name || d.role);
    cards.push(h('section', { class: 'card bcard' }, h('h2', {}, 'Directory'),
      dir.length ? h('table', { class: 'dir' }, h('thead', {}, h('tr', {}, h('th', {}, 'Role'), h('th', {}, 'Name'), h('th', {}, 'Ext'), h('th', {}, ''))),
        h('tbody', {}, dir.map((d) => h('tr', {}, h('td', {}, d.role || ''), h('td', {}, d.name || ''), h('td', {}, d.ext || ''),
          h('td', {}, teamsLink(d.teams) ? h('a', { href: teamsLink(d.teams), target: '_blank', rel: 'noopener noreferrer' }, 'Teams') : '')))))
        : h('p', { class: 'muted' }, 'No directory in the clinic config yet.')));

    const groups = {};
    for (const b of c.binder || []) if (b.title && /^https:\/\//.test(b.url || '')) (groups[b.group || 'Other'] = groups[b.group || 'Other'] || []).push(b);
    const order = ['SOP', 'Patient resource', 'Forms', ...Object.keys(groups)].filter((g, i, a) => groups[g] && a.indexOf(g) === i);
    const label = { SOP: 'SOPs', 'Patient resource': 'Patient resources', Forms: 'Forms' };
    if (!order.length) cards.push(h('section', { class: 'card bcard' }, h('h2', {}, 'Documents'), h('p', { class: 'muted' }, 'No SOPs or resources linked yet.')));
    for (const g of order) cards.push(h('section', { class: 'card bcard' }, h('h2', {}, label[g] || g),
      h('ul', { class: 'links' }, groups[g].map((b) => h('li', {}, h('a', { href: b.url, target: '_blank', rel: 'noopener noreferrer' }, b.title))))));
    page.append(h('div', { class: 'bgrid' }, cards));
  }
  // teams: a full https link, or a UPN to open a 1:1 chat
  function teamsLink(t) {
    t = String(t || '').trim();
    if (/^https:\/\/teams\.microsoft\.com\//.test(t)) return t;
    if (/^[^@\s]+@[^@\s]+$/.test(t)) return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(t)}`;
    return '';
  }

  function renderClinicians(page) {
    page.append(h('header', { class: 'top' }, h('div', {}, h('h1', {}, 'Clinicians'), h('p', { class: 'sub' }, state.clinic ? state.clinic.displayName : ''))),
      h('div', { class: 'card empty' }, 'Consults in flight, patient journey, demand and the TMS and ESK panels come in a later phase. Ops and Binder work now.'));
  }

  function renderSetup(reason) {
    $('clinic').textContent = 'No clinic';
    const page = $('page'); page.replaceChildren();
    page.append(h('div', { class: 'card setup' }, h('h1', {}, 'Not connected yet'),
      h('p', {}, reason || "This app isn't linked to the clinic folders yet. Brendan sets that up once; nothing to do on your side."),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '?demo=1' }, 'Open the demo'), h('a', { class: 'btn ghost', href: 'probe.html' }, 'Test a OneDrive link'))));
  }

  // ---------- frame ----------
  function renderSigned() {
    const s = $('signed'); s.replaceChildren();
    s.append(state.actor ? `Signed as ${state.actor} (not a verified sign-in) ` : 'No name set. ', h('button', { onclick: askActor }, state.actor ? 'Change' : 'Set your name'));
  }
  function askActor() {
    const dlg = $('actorDlg'); $('actorName').value = state.actor; dlg.showModal();
  }
  $('actorForm').addEventListener('submit', () => {
    const v = $('actorName').value.trim().slice(0, 40);
    if (!v) return;
    state.actor = v; sessionStorage.setItem('actor', v); renderSigned(); toast(`Signed as ${v}`);
  });

  function render() {
    if (!state.clinic) return;
    const page = $('page'); page.replaceChildren();
    const r = state.route;
    document.querySelectorAll('.rail [data-route]').forEach((b) => b.toggleAttribute('aria-current', false));
    const cur = r.startsWith('ops') ? 'ops/readiness' : r;
    document.querySelectorAll(`.rail [data-route="${cur}"]`).forEach((b) => b.setAttribute('aria-current', 'page'));
    $('navReadiness').hidden = !r.startsWith('ops');
    if (r.startsWith('ops')) renderReadiness(page);
    else if (r === 'binder') renderBinder(page);
    else renderClinicians(page);
  }
  function go(route) { state.route = route === 'ops' ? 'ops/readiness' : route; history.replaceState(null, '', '#' + state.route); render(); $('page').focus({ preventScroll: true }); }
  document.querySelectorAll('.rail [data-route]').forEach((b) => b.addEventListener('click', () => go(b.dataset.route)));
  const fromHash = location.hash.slice(1); if (/^(ops(\/readiness)?|clinicians|binder)$/.test(fromHash)) state.route = fromHash === 'ops' ? 'ops/readiness' : fromHash;

  if (DEMO) $('demoBanner').hidden = false;
  renderSigned();
  loadClinics();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
})();

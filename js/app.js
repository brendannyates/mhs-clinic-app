// UI. Every read goes through Data (Power Automate flows); derived state comes from Core. Nothing read is stored:
// it lives in memory until the tab closes. sessionStorage holds the session token, the verified name and the clinic slug.
(function () {
  'use strict';
  const C = self.Core, D = self.Data, $ = (id) => document.getElementById(id);
  const DEMO = !!self.Demo;
  const SH = self.SHELL || {};
  const POLL = SH.pollMs || 300000;
  const CHANNEL = 'mhs-clinic-signin';

  const state = {
    session: null,        // {token, name, email, role, clinics:[slug], expiresAt} from the Auth flow
    clinics: [],          // [{slug, config}] this person can read
    clinic: null,         // current config
    slug: null,
    route: 'ops/readiness',
    day: 0,               // 0 today, 1 tomorrow
    filter: 'need',       // need | all
    selected: null,       // mrn+time of selected row
    readiness: null,      // {generatedAt, days:{iso:[rows]}}
    readinessErr: null,
    signin: { step: 'email', email: '', requestId: '', expiresAt: '', msg: '', busy: false },
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

  // ---------- session ----------
  function loadSession() {
    try {
      const x = JSON.parse(sessionStorage.getItem('session') || 'null');
      return x && x.token && Date.parse(x.expiresAt) > Date.now() ? x : null;
    } catch (e) { return null; }
  }
  function saveSession(x) { sessionStorage.setItem('session', JSON.stringify(x)); }
  function signOut(msg) {
    sessionStorage.removeItem('session'); state.session = null; state.clinic = null; state.clinics = []; state.slug = null;
    state.signin = { step: 'email', email: state.signin.email, requestId: '', expiresAt: '', msg: msg || '', busy: false };
    renderSignIn();
  }
  // A read that comes back 401 means the session ended (expired, or Brendan removed the person): back to sign-in.
  async function read(slug, files) {
    try { return await D.read(state.session.token, slug, files); }
    catch (e) { if (e.kind === 'signin' && state.session) signOut('Your sign-in ran out. Sign in again.'); throw e; }
  }

  // ---------- clinics ----------
  async function loadClinics() {
    const slugs = (state.session.clinics || []).filter((x) => /^[a-z0-9-]+$/.test(x));
    if (!slugs.length) { setConn('soon', 'No clinic access'); return renderNotice('No clinic on your account yet', 'Ask Brendan to add your clinic to your account.'); }
    $('clinic').textContent = 'Loading clinics';
    const got = await Promise.all(slugs.map((slug) => read(slug, ['config']).then((r) => ({ slug, config: (r.files && r.files.config) || { displayName: slug } }),
      (e) => { console.info('clinic not loaded', slug, e.kind); return e.kind === 'signin' ? 'stop' : null; })));
    if (got.includes('stop')) return;
    state.clinics = got.filter(Boolean);
    if (!state.clinics.length) { setConn('soon', 'Not connected'); return renderNotice("Couldn't load your clinic", "The clinic data service didn't answer. Try again in a minute."); }
    const last = sessionStorage.getItem('clinic');
    pickClinic((state.clinics.find((c) => c.slug === last) || state.clinics[0]).slug);
  }

  function pickClinic(slug) {
    const c = state.clinics.find((x) => x.slug === slug);
    state.clinic = c.config; state.slug = slug; state.readiness = null; state.readinessErr = null; state.selected = null;
    sessionStorage.setItem('clinic', slug);
    const box = $('clinic'); box.replaceChildren();
    if (state.clinics.length > 1) {
      const sel = h('select', { 'aria-label': 'Clinic', onchange: (e) => pickClinic(e.target.value) },
        state.clinics.map((x) => h('option', { value: x.slug, selected: x.slug === slug }, x.config.displayName || x.slug)));
      box.append('Clinic', sel);
    } else box.append(c.config.displayName || c.slug);
    setConn('ok', 'Connected');
    loadReadiness();
    render();
  }

  // ---------- readiness ----------
  async function loadReadiness() {
    const slug = state.slug;
    try {
      const r = await read(slug, ['readiness']);
      if (slug !== state.slug) return;
      state.readiness = r.files && r.files.readiness;
      state.readinessErr = state.readiness ? null : "Readiness isn't set up for this clinic yet.";
      setConn('ok', `Updated ${hhmm(new Date())}`);
    } catch (e) {
      if (e.kind === 'signin') return;
      console.warn('readiness read failed', e.kind, e.message); state.readinessErr = D.explain(e); setConn('soon', 'Last read failed');
    }
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

  // ---------- sign in ----------
  // Step 1: work email -> Auth flow sends a code to the person's Teams (Flow bot card with a one-tap Sign in button).
  // Step 2: type or paste the code, or tap the button in Teams, which opens #signin=<requestId>.<code>.
  function railSignedOut() { $('clinic').textContent = ''; $('navWrap').hidden = true; renderSigned(); }
  function renderNotice(title, text) {
    const page = $('page'); page.replaceChildren();
    page.append(h('div', { class: 'card setup' }, h('h1', {}, title), h('p', {}, text),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: () => location.reload() }, 'Try again'))));
  }
  function renderSignIn() {
    railSignedOut();
    const page = $('page'); page.replaceChildren();
    const si = state.signin;
    if (!DEMO && !SH.authUrl) {
      return page.append(h('div', { class: 'card setup' }, h('h1', {}, 'Not connected yet'),
        h('p', {}, "This app isn't linked to its sign-in flow yet. Brendan sets that up once; nothing to do on your side."),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '?demo=1' }, 'Open the demo'))));
    }
    if (si.step === 'link') return page.append(h('div', { class: 'card setup' }, h('h1', {}, 'Signing you in')));
    const msg = si.msg ? h('p', { class: 'msg', role: 'alert' }, si.msg) : null;
    if (si.step === 'email') {
      const input = h('input', { id: 'siEmail', type: 'email', inputmode: 'email', autocomplete: 'username', maxlength: '120', value: si.email,
        placeholder: SH.emailDomain ? `you@${SH.emailDomain}` : 'Work email', 'aria-describedby': 'siHelp' });
      page.append(h('form', { class: 'card setup signin', novalidate: true, onsubmit: (e) => { e.preventDefault(); sendCode(input.value); } },
        h('h1', {}, 'Sign in'), h('p', { id: 'siHelp' }, "Enter your work email. We'll send a code to your Teams."),
        h('label', { for: 'siEmail' }, 'Work email'), input, msg,
        h('button', { class: 'btn primary wide', type: 'submit', disabled: si.busy }, si.busy ? 'Sending' : 'Send my code')));
      input.focus();
      return;
    }
    const until = si.expiresAt ? hhmm(new Date(si.expiresAt)) : '';
    const code = h('input', { id: 'siCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '12', placeholder: '6-digit code', 'aria-describedby': 'siHelp',
      oninput: (e) => { if (digits(e.target.value).length === 6) checkCode(e.target.value); } });
    page.append(h('form', { class: 'card setup signin', novalidate: true, onsubmit: (e) => { e.preventDefault(); checkCode(code.value); } },
      h('h1', {}, 'Check Teams'),
      h('p', { id: 'siHelp' }, `If ${si.email} has access, a message from Workflows has your code${until ? `, good until ${until}` : ''}. Tap Sign in on that message, or type the code here.`),
      h('label', { for: 'siCode' }, 'Code'), code, msg,
      h('button', { class: 'btn primary wide', type: 'submit', disabled: si.busy }, si.busy ? 'Checking' : 'Sign in'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => sendCode(si.email) }, 'Send a new code'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.signin = { step: 'email', email: si.email, msg: '' }; renderSignIn(); } }, 'Use a different email')),
      h('p', { class: 'note' }, 'Nothing after a minute? Your email may not have access yet. Ask Brendan to add you.')));
    if (DEMO) page.append(demoCard());
    code.focus();
  }
  // Demo only: what the Teams message looks like, with a working one-tap link.
  function demoCard() {
    return h('div', { class: 'card teams', 'aria-label': 'Example Teams message' },
      h('div', { class: 'meta' }, 'Demo: the message that arrives in Teams, from Workflows'),
      h('div', { class: 'tc-title' }, 'MHS Clinic sign-in'),
      h('div', { class: 'tc-code' }, '123 456'),
      h('div', { class: 'meta' }, "Good for 10 minutes. If you didn't ask for this, ignore it."),
      h('a', { class: 'btn primary wide', href: `?demo=1#signin=${self.Demo.requestId}.${self.Demo.code}`, target: '_blank', rel: 'noopener' }, 'Sign in to MHS Clinic'));
  }
  const digits = (v) => String(v || '').replace(/\D/g, '');
  function normEmail(v) {
    v = String(v || '').trim().toLowerCase();
    if (v && !v.includes('@') && SH.emailDomain) v += '@' + SH.emailDomain;
    return /^[^@\s'"]+@[^@\s'"]+\.[a-z]{2,}$/.test(v) ? v : '';
  }
  async function sendCode(raw) {
    const email = normEmail(raw);
    if (!email) { Object.assign(state.signin, { step: 'email', email: String(raw || ''), msg: `Enter your work email, like name@${SH.emailDomain || 'example.com'}.` }); return renderSignIn(); }
    Object.assign(state.signin, { email, busy: true, msg: '' }); renderSignIn();
    try {
      const r = await D.start(email);
      state.signin = { step: 'code', email, requestId: r.requestId, expiresAt: r.expiresAt, msg: '', busy: false };
    } catch (e) {
      console.warn('start failed', e.kind, e.message);
      Object.assign(state.signin, { busy: false, msg: D.explain(e) });
    }
    renderSignIn();
  }
  async function checkCode(raw) {
    const code = digits(raw);
    if (state.signin.busy) return;
    if (code.length !== 6) { state.signin.msg = 'The code is 6 digits.'; return renderSignIn(); }
    Object.assign(state.signin, { busy: true, msg: '' }); renderSignIn();
    try { signedIn(await D.verify(state.signin.requestId, code), true); }
    catch (e) {
      const b = e.body || {};
      const msg = b.reason === 'wrong' ? `That code doesn't match. ${b.triesLeft} ${b.triesLeft === 1 ? 'try' : 'tries'} left.`
        : b.reason === 'locked' ? 'Too many tries. Send a new code.'
        : b.reason === 'expired' ? 'That code has run out. Send a new one.' : D.explain(e);
      Object.assign(state.signin, { busy: false, msg });
      renderSignIn();
    }
  }
  function signedIn(r, broadcast) {
    const sess = { token: r.token, name: r.name, email: r.email, role: r.role, clinics: r.clinics || [], expiresAt: r.expiresAt };
    saveSession(sess); D.markSignedIn();
    // tell the tab that asked for the code (the Teams button opens a new tab)
    if (broadcast && self.BroadcastChannel) try { new BroadcastChannel(CHANNEL).postMessage(sess); } catch (e) { /* older browser */ }
    start(sess, true);
  }
  if (self.BroadcastChannel) new BroadcastChannel(CHANNEL).onmessage = (ev) => {
    if (!state.session && ev.data && ev.data.token) { saveSession(ev.data); start(ev.data, true); toast('Signed in from Teams'); }
  };

  // ---------- frame ----------
  function renderSigned() {
    const s = $('signed'); s.replaceChildren();
    if (state.session) s.append(`Signed in as ${state.session.name} · `, h('button', { onclick: () => signOut('Signed out.') }, 'Sign out'));
  }

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
  const fromHash = location.hash.startsWith('#signin=') ? '' : location.hash.slice(1); if (/^(ops(\/readiness)?|clinicians|binder)$/.test(fromHash)) state.route = fromHash === 'ops' ? 'ops/readiness' : fromHash;

  function start(sess, fresh) {
    state.session = sess;
    $('navWrap').hidden = false;
    if (fresh && !/^#(ops|clinicians|binder)/.test(location.hash) && /clinician/i.test(sess.role || '')) state.route = 'clinicians';
    renderSigned();
    loadClinics();
  }

  if (DEMO) $('demoBanner').hidden = false;
  // One-tap link from the Teams card: #signin=<requestId>.<code>. Strip it from the address bar before anything else.
  const link = location.hash.match(/^#signin=([A-Za-z0-9-]{1,64})\.(\d{6})$/);
  if (link) {
    history.replaceState(null, '', location.pathname + location.search);
    state.signin = { step: 'link', email: '', requestId: link[1], msg: '', busy: false };
    renderSignIn();
    D.verify(link[1], link[2]).then((r) => signedIn(r, true), (e) => {
      const b = e.body || {};
      state.signin = { step: 'email', email: '', busy: false,
        msg: b.reason ? 'That sign-in link has run out or was already used. Send a new code.' : D.explain(e) };
      renderSignIn();
    });
  } else {
    const sess = loadSession();
    if (sess) start(sess); else renderSignIn();
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
})();

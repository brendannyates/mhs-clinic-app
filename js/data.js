// Every call to Power Automate goes through here. Nothing read is cached or stored.
// Calls are text/plain POSTs: a "simple" request with no preflight. Each flow's Response action sets
// Access-Control-Allow-Origin so the browser lets the app read the answer (same pattern as the IVK eligibility feed).
(function (root) {
  'use strict';

  class FlowError extends Error {
    constructor(kind, detail, status, body) { super(detail); this.kind = kind; this.status = status || 0; this.body = body || null; }
  }

  async function call(url, body) {
    if (root.Demo) return root.Demo.call(body);
    if (!url) throw new FlowError('setup', 'no flow url');
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch (e) { throw new FlowError('blocked', e && e.message); }
    const text = await res.text().catch(() => '');
    let data = null; try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { /* not json */ }
    if (res.status === 401) throw new FlowError('signin', 'HTTP 401', 401, data);
    if (res.status === 403) throw new FlowError('denied', 'HTTP 403', 403, data);
    if (res.status === 429) throw new FlowError('busy', 'HTTP 429', 429, data);
    if (!res.ok || !data) throw new FlowError('http', `HTTP ${res.status}`, res.status, data);
    return data;
  }

  const S = () => root.SHELL || {};
  const start = (email) => call(S().authUrl, { action: 'start', email });
  const verify = (requestId, code) => call(S().authUrl, { action: 'verify', requestId, code });
  // files: names from the Read flow's allowlist (config, readiness, ...). The flow answers
  // { ok, clinic, files: [{ name, content }] } (content null when the file is missing); the app gets { name: content }.
  // Right after sign-in, Excel can lag a few seconds before the new session row shows, so a 401 in the first 30 s is retried.
  let signedInAt = 0;
  const markSignedIn = () => { signedInAt = Date.now(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function read(token, clinic, files) {
    for (let i = 0; ; i++) {
      try {
        const r = await call(S().readUrl, { action: 'read', token, clinic, files });
        const out = {};
        for (const f of Array.isArray(r.files) ? r.files : []) if (f && f.name) out[f.name] = f.content == null ? null : f.content;
        if (r.files && !Array.isArray(r.files)) Object.assign(out, r.files);
        return { ok: r.ok, clinic: r.clinic, files: out };
      } catch (e) {
        if (e.kind === 'signin' && i < 3 && Date.now() - signedInAt < 30000) { await wait(3000); continue; }
        throw e;
      }
    }
  }

  function explain(e) {
    switch (e && e.kind) {
      case 'signin': return 'Your sign-in ran out. Sign in again.';
      case 'denied': return "You don't have access to this clinic. Ask Brendan to add it to your account.";
      case 'busy': return 'Too many requests right now. Wait a minute and try again.';
      case 'setup': return "This app isn't linked to its flows yet.";
      case 'blocked': return "Couldn't reach the clinic data. Check your connection and try again.";
      default: return 'The clinic data service had a problem. Try again in a minute.';
    }
  }

  root.Data = { call, start, verify, read, explain, markSignedIn, FlowError };
})(self);

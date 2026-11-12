// Read layer. Every read in the app goes through Data.getJSON, so if OneDrive share links can't be read from this
// origin (the phase 1 gate), only this file changes. Nothing here caches or stores what it reads.
(function (root) {
  'use strict';

  class ReadError extends Error {
    constructor(kind, detail, status) { super(detail); this.kind = kind; this.status = status || 0; }
  }

  // Share links answer with an HTML viewer unless asked for the file. Try as given, then the download variant.
  function variants(url) {
    const u = String(url || '').trim();
    if (!u) return [];
    if (/[?&]download=1\b/.test(u)) return [u];
    return [u, u + (u.includes('?') ? '&' : '?') + 'download=1'];
  }

  async function tryOne(url) {
    let res;
    try {
      res = await fetch(url, { credentials: 'include', redirect: 'follow', cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch (e) {
      // A TypeError here is the browser refusing to hand over the response (CORS) or no network.
      throw new ReadError('blocked', e && e.message, 0);
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new ReadError('denied', `HTTP ${res.status}`, res.status);
    if (!res.ok) throw new ReadError('http', `HTTP ${res.status}`, res.status);
    const text = await res.text();
    try { return JSON.parse(text.replace(/^﻿/, '')); }
    catch (e) { throw new ReadError('notjson', (res.headers.get('content-type') || 'unknown type') + ': ' + text.slice(0, 80), res.status); }
  }

  async function getJSON(url) {
    if (root.Demo && String(url).startsWith('demo:')) return root.Demo.read(url);
    let last = new ReadError('blocked', 'no url');
    for (const u of variants(url)) {
      try { return await tryOne(u); }
      catch (e) { last = e; if (e.kind === 'denied') break; }
    }
    throw last;
  }

  // Plain-language reason for a failed read, per copy.md: what happened, what to do.
  function explain(e) {
    switch (e && e.kind) {
      case 'denied': return "You don't have access to this clinic's folder. Ask Brendan to share it with you.";
      case 'notjson': return 'OneDrive sent a page instead of the file. The share link may be wrong or expired.';
      case 'http': return "OneDrive didn't answer. Try again in a minute.";
      default: return "The browser couldn't read the file. Check you're signed in to Microsoft in this browser, then reload.";
    }
  }

  root.Data = { getJSON, explain, variants, ReadError };
})(self);

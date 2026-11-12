// Phase 1 gate: can a page on this origin read a OneDrive share link with the user's own session?
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  $('ua').textContent = (navigator.userAgentData && navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version).join(', ')) || navigator.userAgent;
  $('origin').textContent = location.origin;

  function tries(u) {
    const sep = u.includes('?') ? '&' : '?';
    return [
      ['Link as given, with sign-in', u, { credentials: 'include' }],
      ['Link + download=1, with sign-in', /download=1/.test(u) ? null : u + sep + 'download=1', { credentials: 'include' }],
      ['Link + download=1, no sign-in', /download=1/.test(u) ? u : u + sep + 'download=1', { credentials: 'omit' }],
    ].filter((t) => t[1]);
  }

  async function one(label, url, opts) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { ...opts, redirect: 'follow', cache: 'no-store' });
      const ms = Math.round(performance.now() - t0), ct = res.headers.get('content-type') || 'no content-type';
      const text = await res.text();
      let json = false; try { JSON.parse(text.replace(/^\uFEFF/, '')); json = true; } catch (e) { /* not json */ }
      return { label, ok: res.ok && json, result: res.ok ? (json ? 'Read the JSON' : 'Got a page, not the file') : `HTTP ${res.status}`,
        detail: `${ct}, ${text.length} chars, ${ms} ms${res.redirected ? ', redirected' : ''}` };
    } catch (e) {
      return { label, ok: false, result: 'Blocked by the browser', detail: `${e.name}: ${e.message}. Usually CORS: OneDrive didn't allow this site to read the response. See the console for the exact reason.` };
    }
  }

  $('run').addEventListener('click', async () => {
    const u = $('url').value.trim();
    if (!/^https:\/\/[^/]+\.sharepoint\.com\//.test(u)) { $('verdict').textContent = 'Paste a OneDrive link that starts with https:// and has sharepoint.com in it.'; return; }
    const body = $('out').tBodies[0]; body.replaceChildren(); $('verdict').textContent = 'Testing';
    const rows = [];
    for (const [label, url, opts] of tries(u)) {
      const r = await one(label, url, opts); rows.push(r);
      const tr = document.createElement('tr');
      for (const v of [r.label, r.result, r.detail]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
      tr.children[1].style.color = r.ok ? 'var(--accent)' : 'var(--warn)'; tr.children[1].style.fontWeight = '600';
      body.append(tr);
    }
    const win = rows.find((r) => r.ok && /with sign-in/.test(r.label));
    $('verdict').textContent = win ? `Works: "${win.label}". The app can read OneDrive directly.`
      : rows.some((r) => r.ok) ? 'Readable only without sign-in, which means the link is open to anyone. Change it to "People in Mindful Health Solutions" and test again.'
      : 'Blocked. This site can\'t read OneDrive files directly. Send Brendan a screenshot of this table.';
  });
})();

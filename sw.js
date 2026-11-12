// Caches the shell only. Patient data is never cached: this worker ignores every request that isn't one of the
// shell files below, so OneDrive and Power Automate traffic goes straight to the network and is never stored.
const VERSION = 'shell-v2';
const SHELL = ['./', 'index.html', 'probe.html', 'css/app.css', 'js/shell-config.js', 'js/core.js', 'js/data.js', 'js/demo.js', 'js/app.js', 'js/probe.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const SCOPE = new URL('./', self.location).href;
const isShell = (url) => url.origin === self.location.origin && SHELL.some((p) => new URL(p, SCOPE).href === url.origin + url.pathname);

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !isShell(url)) return; // not ours: let the browser handle it, uncached
  // network first so a deploy shows up on next open; cache only when offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(url.origin + url.pathname, copy)); }
    return res;
  }).catch(() => caches.match(url.origin + url.pathname)));
});

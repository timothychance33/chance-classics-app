// Chance Classics — service worker
// Minimal: enables installability and caches the app shell.
// Data still comes live from Supabase (network), so we use a
// network-first strategy and only fall back to cache when offline.

const CACHE = 'chance-classics-v7';
const SHELL = ['./', './index.html', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Only the same-origin app shell. A cross-origin POST (the charge API on
  // chanceclassics.com) must be left to the browser. Intercepting it, then
  // answering a failed re-fetch with index.html, made Send pay link show
  // "The pay link did not send." on iPhone while curl still saw JSON.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  // App shell: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

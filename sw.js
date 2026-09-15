// Chance Classics — service worker
// Minimal: Android/desktop installability + offline shell fallback.
// iOS standalone does not register this file (see bootApp in index.html).
// Data still comes live from Supabase. Never intercept cross-origin.

const CACHE = 'chance-classics-v6';
const SHELL = ['./', './index.html', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  // Do not claim existing clients. Claiming a page that is already fetching
  // aborts those fetches on iOS (TypeError: Load failed).
});

function isCrossOrigin(url){
  try{ return new URL(url, self.location.href).origin !== self.location.origin; }
  catch(e){ return true; }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  if(isCrossOrigin(req.url)) return;
  if(req.url.includes('supabase') || req.url.includes('googleapis') || req.url.includes('gstatic') || req.url.includes('jsdelivr')) return;

  e.respondWith(
    fetch(req).then(res => {
      // Only cache successful same-origin responses. Never write an error
      // or opaque body into the shell cache (Private Safari A2HS poison).
      if(res && res.ok && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      }
      return res;
    }).catch(() => caches.match(req).then(r => {
      if(r) return r;
      if(req.mode === 'navigate') return caches.match('./index.html');
      return undefined;
    }))
  );
});

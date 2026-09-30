/* Sunshine's Boutique service worker: offline shell, fast images, and "Share to Studio" */
const V = 'sunshine-v1';
const SHELL = ['/', '/assets/styles.css', '/assets/core.js', '/assets/shop.js', '/assets/icons.js', '/assets/config.js', '/assets/icon.svg', '/assets/vendor/supabase.js', '/studio/', '/studio/studio.css', '/studio/studio.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![V, 'share-inbox', 'img-v1'].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function handleShare(req) {
  const form = await req.formData();
  const files = form.getAll('photos').filter((f) => f && typeof f === 'object' && f.size);
  const inbox = await caches.open('share-inbox');
  for (const k of await inbox.keys()) await inbox.delete(k);
  let i = 0;
  for (const f of files) {
    await inbox.put(`/shared/${i++}`, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg', 'X-Name': encodeURIComponent(f.name || 'photo') } }));
  }
  const note = (form.get('text') || form.get('title') || '').toString().slice(0, 300);
  if (note) await inbox.put('/shared/note', new Response(note));
  return Response.redirect(`/studio/?shared=${i}`, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname === '/studio/share') {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Product photos from Supabase storage: cache-first (they never change)
  if (url.pathname.includes('/storage/v1/object/public/')) {
    e.respondWith(caches.open('img-v1').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;

  // Pages: network first, fall back to cache when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('/')));
    return;
  }
  // Assets: stale-while-revalidate
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

const CACHE = 'nora-v1';
const STATIC = [
  './',
  './index.html',
  './menu.html',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Courier+Prime:wght@400;700&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase — her zaman ağdan
  if (url.hostname.includes('supabase.co')) return;
  // Anthropic API — her zaman ağdan
  if (url.hostname.includes('anthropic.com')) return;
  // Chrome extension — atla
  if (url.protocol === 'chrome-extension:') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Sadece başarılı GET'leri cache'e al
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Çevrimdışı', { status: 503 }));
    })
  );
});

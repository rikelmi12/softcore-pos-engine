const CACHE_NAME = 'morada-pizza-shell-20260814-admin-profile-security';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/style.css?v=20260805-search-sort',
  '/script.js?v=20260812-system-audit',
  '/lib/pizza-options.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('morada-pizza-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isPrivatePathname(pathname) {
  const value = String(pathname || '');
  return value.startsWith('/api/')
    || /^\/admin(?:\/|%2f|$)/i.test(value)
    || /^\/admin(?:%20| )login(?:\/|$)/i.test(value)
    || value.startsWith('/garcom/')
    || value.startsWith('/order-receipts/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/admin/')
    || url.pathname.startsWith('/garcom/')
    || url.pathname.startsWith('/order-receipts/')
    || isPrivatePathname(url.pathname)
  ) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/');
        throw new Error('Recurso indisponível offline.');
      }),
  );
});

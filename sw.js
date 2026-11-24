
const cacheName = "run-atlas-fe282bacfab4d5fced71";
const assets = ["app.js", "convention-routes.js", "engine.js", "events.json", "icon192.png", "icon512.png", "index.html", "manifest.webmanifest", "parkrun-courses.json", "privacy.html", "race-courses.json", "style.css", "vendor/copyright", "vendor/leaflet.css", "vendor/leaflet.js"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(assets.map(path => new Request(path, {cache: 'reload'})))
  ));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith('run-atlas-') && name !== cacheName)
      .map(name => caches.delete(name))
  )));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!assets.includes(path)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    (await cache.match(path)) || fetch(event.request)
  ));
});

/* Yen Lens offline cache. Same-origin files are served from cache first;
   the exchange-rate API always goes to the network. */
const CACHE = "yenlens-v1";
const SHELL = [
  "./", "index.html", "prices.js", "manifest.webmanifest",
  "vendor/tesseract.min.js", "vendor/worker.min.js",
  "lang/jpn.traineddata.gz",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      });
    })
  );
});

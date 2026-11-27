const C = "vc-app-v1";
const BASE = ["./", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // red primero: la app siempre al día; si no hay red, la copia guardada
    e.respondWith(fetch(req).then(r => {
      const cp = r.clone();
      caches.open(C).then(c => c.put(req, cp));
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match("./"))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
    if (resp.ok) { const cp = resp.clone(); caches.open(C).then(c => c.put(req, cp)); }
    return resp;
  }).catch(() => r)));
});
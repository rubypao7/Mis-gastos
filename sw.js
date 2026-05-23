const CACHE = "mis-gastos-v5";
const ARCHIVOS = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "sync.js",
  "vendor/msal-browser.min.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// "Red primero": siempre intentamos la versión más nueva de internet y
// actualizamos la caché. Si no hay conexión, servimos lo guardado (offline).
// Los archivos de otros dominios (CDN de MSAL) los gestiona el navegador.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

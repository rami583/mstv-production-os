const CACHE_NAME = "mstv-production-os-v3";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/mstv-icon-192.png",
  "/icons/mstv-icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith("/api/")) return;
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, response.clone()))
              .catch(() => undefined)
          );
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === "navigate") {
          const cachedShell = await caches.match("/");
          if (cachedShell) return cachedShell;
        }
        return Response.error();
      })
  );
});

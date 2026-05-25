const APP_VERSION = new URL(self.location.href).searchParams.get("v") || "local";
const CACHE_PREFIX = "mstv-production-os-shell";
const CACHE_NAME = `${CACHE_PREFIX}-${APP_VERSION}`;
const LEGACY_CACHE_PREFIXES = ["mstv-production-os", CACHE_PREFIX];
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/brand/mon-studio-tv-icon.png",
  "/brand/mon-studio-tv-horizontal.png",
  "/brand/mon-studio-tv-white.png",
  "/icons/favicon-32.png",
  "/icons/mstv-icon-192.png",
  "/icons/mstv-icon-512.png",
  "/icons/apple-touch-icon.png"
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith("/api/");
}

function isCacheableResponse(response) {
  return response && response.ok && response.type === "basic";
}

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith("/_next/static/") || requestUrl.pathname.startsWith("/icons/") || requestUrl.pathname.startsWith("/brand/");
}

async function putInCurrentCache(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function matchCurrentCache(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

function offlineHtmlResponse() {
  return new Response(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>MSTV Production OS</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100svh;
        display: grid;
        place-items: center;
        background: #f4faff;
        color: #1c1917;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      }
      main {
        width: min(22rem, calc(100vw - 2rem));
        border-radius: 1rem;
        background: rgba(255,255,255,.78);
        padding: 1.25rem;
        text-align: center;
      }
      h1 { margin: 0; font-size: 1rem; }
      p { margin: .5rem 0 0; color: #78716c; font-size: .95rem; line-height: 1.4; }
    </style>
  </head>
  <body>
    <main>
      <h1>Pas de connexion Internet</h1>
      <p>Ouvrez MSTV une fois en ligne pour installer la dernière version hors ligne.</p>
    </main>
  </body>
</html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((path) => new Request(path, { cache: "reload" }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (!isSameOrigin(requestUrl) || isApiRequest(requestUrl)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          event.waitUntil(putInCurrentCache(new Request("/"), response.clone()).catch(() => undefined));
          return response;
        })
        .catch(async () => (await matchCurrentCache(new Request("/"))) || offlineHtmlResponse())
    );
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          event.waitUntil(putInCurrentCache(event.request, response.clone()).catch(() => undefined));
          return response;
        })
        .catch(async () => (await matchCurrentCache(event.request)) || Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        event.waitUntil(putInCurrentCache(event.request, response.clone()).catch(() => undefined));
        return response;
      })
      .catch(async () => (await matchCurrentCache(event.request)) || Response.error())
  );
});

// Service worker for 51 Mimi Games — lets the browser offer a real
// "Install app" prompt and makes the hub (and whichever games you've
// actually opened) load instantly and work offline after the first visit.
//
// No precache list to maintain: index.html already loads every game's own
// <script> tag up front (there's no per-game lazy loading), so a plain
// runtime cache — store whatever gets fetched, serve it from cache next
// time — ends up covering the whole app after just one visit, and never
// goes stale on its own: every core hub file already carries a `?v=...`
// cache-busting query string bumped on every real change (see index.html),
// so a new version is simply a new URL — a cache miss that fetches fresh
// and caches under its own key, leaving the old entry unused. No extra
// version-comparison logic needed here.
const CACHE_NAME = "mimi-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POSTs (profiles, page-fetch proxy) always go live
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache the private page-fetch proxy's fetched pages, external assets, etc.
  if (url.pathname.startsWith("/api/")) return; // always live — profiles, the private page viewer, everything server-stateful
  if (url.pathname.startsWith("/downloads/")) return; // large one-off app installers — no reason to fill up the offline cache with these

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // offline and never cached — for a page navigation, the shell is
          // still better than a hard connection-error screen
          if (request.mode === "navigate") return caches.match("/index.html");
          throw new Error("offline and not cached");
        });
    }),
  );
});

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
// Bumped once here: index.html itself (unlike the scripts it references) has
// no cache-busting query string of its own, so a content change to it — like
// today's new/renumbered <script> tags — wouldn't otherwise evict the
// already-cached copy under its same URL. Bumping this forces every cached
// entry (index.html included) to be dropped and re-fetched fresh on next
// activation, same one-time reset any real cache-key change needs.
const CACHE_NAME = "mimi-cache-v12";

// The one key every page load is cached under — see the navigate branch below.
const SHELL_URL = new URL("index.html", self.registration.scope).href;

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

  /* Page loads are network-first; everything else stays cache-first.
   *
   * This used to be cache-first for absolutely everything, which is right for
   * the ?v=-stamped assets (a new version is a new URL, so it can never go
   * stale) but wrong for index.html, which has no version string of its own.
   * The effect was that a deployed change didn't appear until CACHE_NAME
   * happened to move AND the page was loaded twice — confirmed live: the server
   * was serving a new hub while browsers kept showing the previous one.
   *
   * It got worse once games got their own URLs (/snake, /2048 — see
   * resolvePrettyPath in server.js). Each of those is a separate cache key
   * serving the same index.html, so a stale copy was pinned under 80-odd
   * different keys instead of one.
   *
   * Network-first costs one request per page load and makes a deploy show up
   * immediately; the cached copy is still there for offline, which is the
   * reason any of this exists. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            // Stored under one key, not the URL that was asked for, so every
            // game link shares the single offline shell.
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || caches.match(request))),
    );
    return;
  }
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
          // navigations never reach here (handled above); anything else that's
          // offline and was never cached genuinely has nothing to serve
          throw new Error("offline and not cached");
        });
    }),
  );
});

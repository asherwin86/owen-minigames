# CLAUDE.md — 51 Mimi Games

Orientation for an agent working in this repo. Written 2026-08-31 against `main`.

Read this before changing anything. It exists to stop you rediscovering the
same five things, and to keep you from tripping the traps in section 4.

---

## 1. What this is, in one paragraph

A single-origin games hub: one static front end (`index.html` + `js/` + `css/`)
served by one hand-rolled Node server (`server.js`), packaged for web, desktop,
Android and Quest. **89 registered entries** — 85 games and 4 utility apps —
each a file in `js/games/` that calls `MimiGames.register({...})`, plus **Kart
Circuit** (`games/mario-kart/`), which is a standalone page rather than a
hub-embedded game.

**There is no build step.** No bundler, no transpiler, no framework. What you
write is what the browser runs. `node server.js`, open <http://localhost:1764>,
reload to see a change. Do not introduce a build step to solve a problem that
has another solution.

## 2. Where things are

```
index.html            every game's <script> tag; the only place they're listed
server.js             the whole back end (~2000 lines): static files, APIs,
                      WebSocket relay, page-fetch proxy
sw.js                 service worker — offline cache
css/style.css         base layout and components
css/switch2.css       the Switch 2 home-menu skin, layered over style.css
js/app.js             grid, filters, URL routing, opening/closing games
js/engine.js          MimiGames.register + the ctx every game receives
js/keys.js            the keys currency: daily quest, wallet, panel, leaderboard
js/profiles.js        accounts, passkeys, local player roster (~74 KB)
js/switch-shell.js    moves top-bar buttons into the bottom dock; clock/battery
js/hub-backdrop.js    the 3D block backdrop behind the hub
js/update-center.js   the CHANGELOG array the "What's New" panel reads
js/games/*.js         one file per game
games/mario-kart/     Kart Circuit: its own page, styles, and 10k-line game.js
electron/main.js      desktop wrapper; spawns server.js as a child process
```

### The three heavyweight games

| | Engine | Notes |
|---|---|---|
| **Kart Circuit** | Three.js | Standalone page. 14 tracks, cups, split-screen, online matchmaking, WebXR. `game.js` is ~10k lines. |
| **Block Realm** | Three.js | Voxel sandbox. Chunked meshing with baked AO, seeded terrain, saves only player-modified blocks. |
| **Rival Arena** | Three.js | Arena FPS. ADS, gamepad, touch, aim assist, crates that spend keys. |

Block Realm and Rival Arena **load Three.js on demand** rather than from
`index.html` — it's 670 KB the other 85 games don't need, and the hub already
parses ~1.5 MB per load. They share the copy vendored at
`games/mario-kart/three.min.js`. Follow that pattern for any new dependency.

## 3. How to work here

```bash
node server.js                    # http://localhost:1764
npm run electron:start            # desktop app against your working tree
node --check <file>               # there is no linter; this is your syntax check
```

**There is no test suite.** `npm test` is the npm placeholder. Changes are
verified by running the app and driving it. If you have a browser automation
tool, use it — most bugs in this repo are behavioural, not syntactic.

### Adding a game

1. A file in `js/games/` calling `MimiGames.register({ id, title, emoji,
   category, players, howTo, init(stage, ctx) })`. `init` returns a cleanup
   function.
2. A `<script>` tag in `index.html`.
3. Bump `EXPECTED_GAMES` in `js/app.js` — it's a tripwire for a game file that
   silently failed to load, and it warns on every page load if it's wrong.
4. The landing tagline in `index.html` names the game count too.

## 4. Traps — read this section

These are the things that have actually gone wrong here.

- **Cache-busting is manual.** Every `<script>`/`<link>` in `index.html` carries
  `?v=YYYYMMDDx`. Bump it when you change that file. `index.html` itself has no
  query string, so changing *it* means bumping `CACHE_NAME` in `sw.js`.
- **`ctx.tone.chime(notes)` takes an array.** Calling it bare throws inside the
  engine. Optional chaining (`ctx.tone?.chime?.()`) guards the function
  existing, not its arguments — that mistake silently aborted a crate handler
  mid-way and threw on every kill in Rival Arena.
- **`style.css` sets `background: var(--accent2)` on `body::after`.** Overriding
  only `background-image` in a skin leaves that colour behind. It covered the
  entire viewport in solid cyan for one release.
- **A vignette in the same element as a colour layer will flatten it.** Layer
  order matters: darkening has to sit *above* what it darkens.
- **`animation-fill-mode: both` owns `transform` after the animation ends**, so
  a `:hover` transform on the same element never applies. `.game-tile` hit this.
- **Pretty URLs are one path segment on purpose** (`/snake`, not `/play/snake`).
  A page served from a deeper path resolves its relative URLs against that path,
  so `/play/snake` requested every script from `/play/js/` and returned a blank
  hub. `games/mario-kart/index.html` genuinely is in a subfolder and carries a
  `<base>` for exactly this reason.
- **The service worker is network-first for navigations, cache-first for
  everything else.** Don't "simplify" that back to cache-first — versioned
  assets can never go stale, but `index.html` can, and it made deploys
  invisible until the page was loaded twice.
- **Static serving is an allowlist** (`SERVABLE` / `SERVABLE_FILES` in
  `server.js`). It replaced a denylist that was bypassable — see section 6.
  Adding a top-level folder does not publish it, and shouldn't.
- **`/sitemap.xml` isn't a file on disk.** `server.js` builds it at request time
  from every `js/games/*.js`'s own `id: "..."` (the same source `EXPECTED_GAMES`
  guards), so a new game is in it automatically. `robots.txt` *is* a real file
  and just points at that route — don't go looking for a generator for it, and
  don't try to hand-maintain the sitemap if this ever gets rewritten.

## 5. Conventions

- **Comments explain *why*, and what was tried.** The house style is a paragraph
  above anything non-obvious. Several are the only record of a bug that took a
  day to find. Match it; don't strip them.
- **User-visible changes get a `CHANGELOG` entry** at the top of the array in
  `js/update-center.js` — date, time, emoji, title, and prose that says what was
  wrong and what changed. That file is ~116 KB and loads on every page view.
- **Client/server validation lists are duplicated by hand** — `KART_COLOR_SWATCHES`,
  `CAKE_BASE_IDS`, `CAKE_TOPPING_IDS`. Change both.
- **Never commit** `data/*.json` (real accounts), `certs/`, `android-signing/`,
  `downloads/`, `dist-electron*/`. All gitignored for good reasons.

## 6. Deployment and packaging

| Target | How | Notes |
|---|---|---|
| Render | `node server.js`, free plan | The hosted site. Deploys on push to `main`, live in ~45 s. |
| GitHub Pages | static, no server | `window.MIMI_STATIC_MODE` gates accounts/leaderboards/multiplayer/page-viewer. |
| Desktop | Electron spawns `server.js` | Windows is a **portable .exe**; see below. |
| Android / TV / Quest | TWA wrappers | They wrap the hosted URL, so they get web changes with **no rebuild**. |

**Render's free disk is ephemeral** — it resets on every deploy and on wake from
sleep. Profiles, leaderboards and cakes are mirrored to Upstash Redis when
`UPSTASH_REDIS_REST_URL`/`_TOKEN` are set in the Render dashboard. That is
working; verify before any deploy that would otherwise lose accounts.

**Windows cannot build an installer on this machine.** Wine here cannot launch
any Windows program at all (`wine cmd /c ver` exits 1 silently), and
`nsis-web` needs it to run the built installer once to generate its embedded
uninstaller. `build.win.target` is therefore `["portable", "zip"]`, both of
which build without Wine. Put `nsis-web` back the moment Wine works. The
portable build redirects `userData` next to the .exe via
`PORTABLE_EXECUTABLE_DIR` so it keeps its data off the C: drive.

`electron-builder` needs Node 18+ (`@noble/hashes` is ESM) — the system `node`
may be older than that.

## 7. Security posture

**Fixed 2026-08-31 — static path traversal.** `serveStatic` checked for the
literal prefix `/data/` on the raw URL *before* `path.join` normalised it.
Verified against a running server: `/data/profiles.json` was refused, but
`//data/profiles.json` and `/./data/profiles.json` both returned **200 and the
full profiles file** — including `passwordHash` for every account, which the
server compares verbatim, making it a working credential rather than a hash.
The same hole served `/server.js` (including `DEV_SIGNUP_PASSWORD_HASH`) and
`/certs/key.pem`, and `/server.js` was confirmed readable on the deployed site.
Now an allowlist, checked after resolution.

### Still open, in rough priority order

- **The WebSocket relay is unauthenticated and unlimited.** `checkRateLimit`
  only guards `/api/`. Over `/mp`: `presence-hello` validates a `passwordHash`
  with no limiter (bypassing the strict 15/min budget), `host` can create
  unbounded rooms, and `state`/`chat` are relayed unvalidated with no
  `maxPayload`.
- **A socket can join a second room without leaving the first.** `host`, `join`
  and `matchmake` all reassign `joinedRoom` without removing the client from its
  previous room, and `close` cleans only the current one — so the old room keeps
  a phantom player forever and is never swept. Factor out a
  `leaveCurrentRoom()`.
- **The plain-HTTP mirror exposes everything**, not just the update feed:
  `requestHandler` is mounted whole on `PORT+1` whenever TLS is on.
- **Relayed HTML is injected into the hub's own origin** —
  `js/play-together.js` does `gameStage.innerHTML = pt.html` on room data.
  `<img onerror=…>` runs, with access to the `localStorage` holding the session.
  Host-only should be enforced server-side.
- **The dev gate is one shared unsalted SHA-256**, checked at signup only.

### Accepted, not bugs

Keys and game progress live in `localStorage`. They buy cosmetics in
single-player games; someone editing their own browser storage to give
themselves skins is expected. `js/keys.js` says so, and `SECURITY.md` says so
publicly.

## 8. Known weak spots

- **No tests at all.** ~37k lines of client code and a 2000-line server. The
  highest-value first targets are `serveStatic`'s path handling (now that it has
  an allowlist worth protecting) and the room lifecycle.
- **Every page load parses ~1.5 MB of JavaScript** — all 87 game scripts plus a
  110 KB changelog. `sw.js` documents this as deliberate, and it's what makes
  the runtime cache work, but it grows with every game.
- **`saveProfilesToDisk` rewrites the entire dataset on every mutation** — full
  file copy to `.bak`, full `writeFileSync`, full Upstash `SET`, on every save,
  follow, unfollow and achievement unlock. Not atomic (no tmp+rename), and
  concurrent requests race last-write-wins.
- **The two 3D games are unverified on real hardware from here.** The available
  browser is software-rendered WebGL, where both crawl regardless of their own
  cost. Profiling shows the frame body at ~17 ms with ~0% in game JavaScript, so
  they should be fine on a GPU — but that is an inference, not an observation.
  Ask the user how they actually perform.

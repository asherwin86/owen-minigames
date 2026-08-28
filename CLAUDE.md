# CLAUDE.md — 51 Mimi Games

Project guide + standing code audit. Written 2026-08-29 against `main` @ `a01d7f0`
plus the uncommitted working tree.

---

## 1. What this is

A single-origin games hub: one static front end (`index.html` + `js/` + `css/`)
served by one dependency-light Node server (`server.js`), packaged three ways —
web (Render), static preview (GitHub Pages), and desktop (Electron).

- **85 mini-games** in `js/games/*.js`, all registered through `MimiGames.register({...})`
  (`js/engine.js`). Every one is a `<script>` tag in `index.html`; there is no
  bundler, no lazy loading, no build step for the web app.
- **Kart Circuit** (`games/mario-kart/`) is the exception — a standalone Three.js
  page (`game.js`, 10k lines) with its own menu, HUD, split-screen, and networking.
- **Server** is hand-rolled `http`/`https` + `ws`, no framework. ~1900 lines.
  APIs: `/api/profiles/*`, `/api/leaderboards/*`, `/api/friends/*`, `/api/cakes/*`,
  `/api/fetch-page`. Real-time: one WebSocket path, `/mp`, carrying both room
  multiplayer and friends presence.

### Deployment targets and how they differ
| Target | Server | Notes |
|---|---|---|
| Render (`render.yaml`) | `node server.js`, free plan | ephemeral disk; Upstash Redis mirrors `profiles`/`leaderboards`/`cakes` when `UPSTASH_REDIS_REST_*` are set |
| GitHub Pages (`.github/workflows/gh-pages.yml`) | none | `window.MIMI_STATIC_MODE` gates accounts / leaderboards / multiplayer / page viewer |
| Electron (`electron/main.js`) | spawns `server.js` locally | `MIMI_DATA_DIR` points at writable app data; auto-update feed is GitHub Releases |
| LAN / dev | `node server.js` | serves HTTPS if `certs/` exists, plus a plain-HTTP mirror on `PORT+1` |

### Commands
```bash
node server.js
```
```bash
npm run electron:build:linux
```
Wine is broken on this box, so Windows ships as `--win zip` (portable), not NSIS.
`npm test` is a stub — **there are no tests anywhere in this repo.**

---

## 2. Conventions worth knowing before editing

- **Cache-busting is manual.** Every `<script>`/`<link>` in `index.html` and
  `games/mario-kart/index.html` carries `?v=YYYYMMDDx`. Bump it when you change
  the file, and bump `CACHE_NAME` in `sw.js` when you change `index.html` itself
  (it has no query string of its own).
- **Changelog is a code artifact.** User-visible changes get an entry in the
  `CHANGELOG` array at the top of `js/update-center.js` (date, time, emoji,
  title, prose `desc`). That file is now 112 KB and loads on every page view.
- **Comments carry the reasoning.** The house style is long "why, and what we
  tried" comments above non-obvious code. Match it; don't strip it.
- **Client/server validation lists are duplicated by hand** — `KART_COLOR_SWATCHES`,
  `CAKE_BASE_IDS`, `CAKE_TOPPING_IDS` mirror client lists with no shared module.
  Change both.
- **Never commit** `data/*.json` (real accounts), `certs/`, `android-signing/`,
  `downloads/`, `dist-electron*/`. All are gitignored for good reasons.
- **Passwords are hashed client-side** (`hashPassword` in `js/profiles.js`,
  `SHA-256("mimiProfile:" + key + ":" + password)`) and the server stores and
  compares that hash verbatim. See finding S1 — this makes the hash itself the
  credential.

---

## 3. What's currently in the working tree (uncommitted)

~1200 inserted lines across 9 modified files, plus 4 untracked new files. None of
it is committed or pushed.

**Switch 2 home-menu reskin of the hub**
- `css/switch2.css` (new, 518 lines) layered over `style.css`; game tiles become
  coloured rounded-square icons keyed off a stable `--hue` (`js/app.js:181`).
- `js/switch-shell.js` (new) re-parents the existing top-bar buttons into a new
  bottom dock (moves live nodes, so all existing listeners survive), and drives
  a clock + real `navigator.getBattery()` readout.

**Kart Circuit: MK8-style menu flow**
- `games/mario-kart/menu-flow.js` (new) + `mk8-menu.css` (new): the one-tall-card
  pre-race menu becomes one decision per screen with Back/Next, progress dots and
  a summary; the flow is per-mode (`FLOWS`), and picking a cup drops the track step.
- `games/mario-kart/index.html` restructured into `<section class="mk-step">`.

**Kart Circuit: Play Online (public matchmaking)**
- `server.js`: new `matchmake` WS message, a `roomMeta` map beside `rooms`,
  region derived from the client's IANA time zone, a server-owned 25s countdown
  broadcast as `matchStatus`, `matchGo` at zero, and host promotion on host exit.
- `game.js`: lobby UI, `mpMatchmake()`, random track pick on `matchGo`.

**Kart Circuit rendering/HUD** — daylight lighting rebuild, cumulus sky, MK-World
HUD layout, starting-light countdown, and a full control list on the pause screen.

**Housekeeping** — version 1.0.39 → 1.0.41, `sw.js` cache v5 → v7, changelog entries.

---

## 4. Audit findings

Severity: **S** = security, **B** = correctness bug, **O** = operational, **Q** = quality.
Items marked *verified* were reproduced against a running instance.

### S1 — `/data/` guard is bypassable; profiles, TLS key and server source are publicly readable (critical, verified)
`server.js:58` blocks only the literal prefix `/data/`, but the path is joined at
`server.js:63` **after** that check, so `path.join` normalisation lets anything
equivalent through. Verified live against a local instance:

| Request | Result |
|---|---|
| `/data/profiles.json` | 403 |
| `/./data/profiles.json` | **200 — full profile JSON** |
| `//data/profiles.json` | **200** |
| `/games/../data/profiles.json` | **200** |
| `/certs/key.pem` | **200 — private TLS key** |
| `/server.js` | **200 — source, incl. `DEV_SIGNUP_PASSWORD_HASH`** |

Because the server compares the client-supplied `passwordHash` directly
(`server.js:597`, and every other authenticated action), leaking `profiles.json` is not a hash
leak — it is **plaintext-equivalent credentials for every account**, plus emails,
avatars, recovery-code hashes and passkey public keys. On Render the file is
written by `saveProfilesToDisk` even when Upstash is enabled, so it exists in
production. Also note `server.js:64`'s `filePath.startsWith(ROOT)` accepts any
sibling directory sharing the prefix (`/../mini_games_x/secret` passes).

*Fix:* resolve first, then check — `const fp = path.resolve(ROOT, "." + urlPath);
if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) 403;` — and switch to an
explicit allowlist of servable roots (`index.html`, `css/`, `js/`, `games/`,
`icons/`, `downloads/`, `manifest.webmanifest`, `sw.js`) rather than a denylist.

### S2 — WebSocket surface has no authentication, rate limiting or size limit (high)
`checkRateLimit` only guards `/api/` (`server.js:1458`). Over `/mp`:
- `presence-hello` (`server.js:1648`) validates a `passwordHash` with no limiter at
  all — a complete bypass of `RATE_LIMIT_STRICT`'s 15/min credential-check budget.
- `host` creates an unbounded number of rooms; nothing caps rooms per socket, per
  IP, or globally, and the sweep at `server.js:1828` only removes *empty* rooms.
- `state`/`chat` payloads are relayed to the room unvalidated and unbounded.

*Fix:* per-connection token bucket, a `maxPayload` on the `WebSocketServer`, a
cap on rooms per IP, and route `presence-hello` through the strict limiter.

### S3 — the plain-HTTP mirror exposes the whole app, not just the update feed (medium)
`server.js:1904` mounts the *full* `requestHandler` on `PORT+1` whenever TLS is
enabled — so every API (including credential-bearing profile calls) and every
static path is reachable unencrypted, despite the main listener being HTTPS. The
comment describes it as the update feed only.

*Fix:* wrap it in a handler that 404s anything outside `/downloads/updates/` and
`/mp`, or bind it to loopback.

### S4 — relayed HTML is injected into the hub's own origin (medium)
`js/play-together.js:263` does `gameStage.innerHTML = pt.html` with HTML received
over the room relay. `<script>` won't run via `innerHTML`, but `<img onerror=…>`
will, in the hub's origin, with access to `localStorage` (where the session and
`passwordHash` live). The server relays `state` messages without inspecting them,
so any room member can send this — the host role is not enforced.

*Fix:* enforce host-only for `kind:"html"` snapshots server-side, and sanitise or
render into a sandboxed frame.

### S5 — the dev gate is one shared secret, and its hash is public (medium)
`DEV_SIGNUP_PASSWORD_HASH` (`server.js:194`) is a single unsalted SHA-256 with a
fixed `"dev-gate"` key, checked at signup only. Combined with S1's `/server.js`
disclosure it's offline-brute-forceable, and dev accounts can list all profiles
and reset any password (`server.js:639-642`).

*Fix:* move to an env var, and require the dev check per privileged action rather
than only at account creation.

### B1 — a socket can join a second room without leaving the first, leaking rooms forever (high, verified)
`host`/`join`/`matchmake` all reassign `joinedRoom`/`roomCode` without removing
the client from its previous room, and `ws.on("close")` (`server.js:1770`) cleans
only the *current* one. Verified: one socket sent `host` then `matchmake` and got
back two `joined` messages for rooms `BP7S` and `QCS4`; on disconnect only `QCS4`
is cleaned. `BP7S` keeps a phantom player holding a dead socket, so `room.size`
never reaches 0 and neither the close handler nor the 4-hour sweep ever frees it.
Unauthenticated, trivially scriptable memory growth — plus ghost racers on the
grid for anyone who was in that room.

*Fix:* factor out a `leaveCurrentRoom()` and call it at the top of all three
handlers.

### B2 — matchmade races can deadlock at the starting line (high)
The server only *signals* `matchGo` (`server.js:1824`) and simultaneously sets
`open = false`, `countdown = null`; the host client is what actually calls
`startRace()` (`game.js:9364`). So if the host's tab is backgrounded/throttled,
crashes, or disconnects between `matchGo` and `raceStart`, the lobby is
permanently stuck: no race starts, the countdown is disarmed and never re-arms,
and the room is closed to new matchmaking. The promoted host (`hostPromoted`,
`game.js:9427`) is never told a `matchGo` already fired, so host migration does
not recover it either.

*Fix:* have the server re-arm the countdown if no `raceStart` arrives within a
few seconds of `matchGo`, and re-send `matchGo` to a newly promoted host.

### B3 — `mk8-menu.css` hides every step; only `menu-flow.js` un-hides one (medium)
`mk8-menu.css:377` is `.mk-step { display: none }`, and `.is-active` is set solely
by `menu-flow.js`. That file's own header claims deleting it "would degrade to the
old single scrolling card" — true only if the stylesheet goes with it. In practice
any load failure or early throw in that IIFE leaves **a blank menu and an
unstartable game**. The risk is real because several lookups near the end are
unguarded (`backBtn`, `countEl`, `dotsEl` at `menu-flow.js:94-105`; `backBtn`/`nextBtn` at `menu-flow.js:212-213`)
while the ones above them are null-checked.

*Fix:* make the no-JS state the visible one (`.mk-step { display: block }` plus a
`.js-flow` class on the stage that switches to one-at-a-time), and null-guard the
remaining lookups.

### B4 — matchmaking region and identity are client-asserted (low)
`scope`, `region`, `name`, `color`, `avatar` all come straight off the wire
(`server.js:1671`), and `profileKey` is stored without verifying the caller owns
that profile — unlike `presence-hello`, which does check. A client can claim any
region, and impersonate a profile key in room player lists.

### O1 — the published downloads are three versions behind the code (high)
`index.html:49-69` pins every Download App link to
`releases/download/v1.0.38/…`, while `package.json` is at **1.0.41** and freshly
built 1.0.41 artifacts (AppImage, win zip, mac zip — 2026-08-29 07:42) are sitting
unreleased in `downloads/`. `downloads/updates/latest.yml` also still advertises
1.0.38. Anyone downloading the app today gets 1.0.38, and auto-update has nothing
newer to find unless a v1.0.41 GitHub release exists.

*Fix:* cut the release, then update the six pinned URLs — or, better, point them
at `/releases/latest/download/<asset>` so the links stop needing edits.

### O2 — all of section 3's work is uncommitted, and four files of it are untracked (high)
`css/switch2.css`, `js/switch-shell.js`, `games/mario-kart/menu-flow.js` and
`mk8-menu.css` are new and unstaged, but the modified `index.html` and
`games/mario-kart/index.html` already reference them. Committing the tracked
changes without `git add`-ing the new files ships a site that references four
404s. Electron builds read from disk, so local builds hide this; Render and
GitHub Pages deploy from git and would not.

### O3 — Electron `build.files` omits the PWA assets (low)
`package.json`'s `files` list ships `index.html`, `css/`, `js/`, `games/`,
`server.js`, `electron/main.js` — but not `sw.js`, `manifest.webmanifest`, or
`icons/`. `index.html:381` registers the service worker unconditionally, so it
404s in packaged builds (caught, but the offline cache never exists there).

### O4 — persistence rewrites the entire dataset on every mutation (medium)
`saveProfilesToDisk` (`server.js:160`) copies the whole file to `.bak`, then
`writeFileSync`s the full JSON, then `SET`s the entire profiles blob to Upstash —
on every single profile save, follow, unfollow and achievement unlock. With
60 KB avatars embedded per profile this grows super-linearly, the write is not
atomic (no tmp+rename), and concurrent requests race last-write-wins on Upstash.

*Fix:* write to a temp file and `rename`, debounce saves, and store profiles as
individual Redis keys rather than one blob.

### Q1 — no tests, at all
`npm test` is the npm stub. ~23k lines of client code and a 1900-line server with
zero automated coverage; every finding above was found by reading and by manual
probing. The highest-value first targets are `serveStatic` path handling, the
room lifecycle, and the SSRF allowlist in `resolveSafeAddress`.

### Q2 — every page load parses ~1.5 MB of JavaScript
All 85 game scripts plus a 112 KB changelog (`js/update-center.js`) load eagerly
on the hub. `sw.js` documents this as deliberate ("no per-game lazy loading"), and
it's what makes the runtime-cache SW work — but it is the single biggest
first-load cost, and it grows with every game added.

### Q3 — static responses are `Cache-Control: no-store`
`server.js:77` sets `no-store` on everything, which defeats the manual `?v=`
cache-busting scheme entirely for non-SW clients — every asset is re-fetched on
every load. The `?v=` params only matter to the service worker's cache keys.

---

## 5. What is already done well

Worth not regressing:
- **SSRF defence in the page viewer** (`server.js:1157-1200`) is genuinely careful:
  every resolved address is checked, link-local/metadata ranges included, the
  validated address is pinned via a custom `lookup` so Node can't re-resolve
  (DNS-rebinding closed), and every redirect hop is re-checked.
- **Sandboxing of fetched pages**: `allow-scripts` without `allow-same-origin`,
  with a documented cookie/storage shim for sites that throw on opaque origins.
- **Chat rendering** in Kart Circuit (`game.js:9160`) and the whole of
  `js/friends.js` build DOM with `textContent`, not `innerHTML`.
- **`loadProfilesFromDisk` refuses to boot** on a parse failure rather than
  silently starting empty — a scar from a real data-loss incident, and the right
  call.
- **Electron hardening**: `sandbox: true`, no `nodeIntegration`, external links
  forced through `shell.openExternal`, and the cert-error bypass is scoped to the
  local host:port.
- **The Switch 2 / MK8 reskins move live DOM nodes instead of rebuilding them**,
  so existing handlers keep working — and neither new stylesheet needs a single
  `!important`.

---

## 6. Suggested order of work

1. S1 (`serveStatic`) — it is a live credential leak on the hosted site.
2. B1 + B2 — the matchmaking feature being shipped is currently leak-prone and
   can deadlock.
3. O2, then O1 — commit the new files, then cut v1.0.41 and repoint the links.
4. S2, S3, S4.
5. Q1 — a first test file covering exactly the paths in S1 and B1.

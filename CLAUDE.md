# CLAUDE.md — 51 Mimi Games

Orientation for an agent working in this repo. Written 2026-08-31 against `main`; sizes and counts refreshed 2026-10-18.

Read this before changing anything. It exists to stop you rediscovering the
same five things, and to keep you from tripping the traps in section 4.

---

## 1. What this is, in one paragraph

A single-origin games hub: one static front end (`index.html` + `js/` + `css/`)
served by one hand-rolled Node server (`server.js`), packaged for web, desktop,
Android and Quest. **90 registered entries** — 86 games and 4 utility apps —
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
server.js             the whole back end (~2700 lines): static files, APIs,
                      WebSocket relay, page-fetch proxy
sw.js                 service worker — offline cache
css/style.css         base layout and components
css/switch2.css       the Switch 2 home-menu skin, layered over style.css
js/app.js             grid, filters, URL routing, opening/closing games
js/engine.js          MimiGames.register + the ctx every game receives
js/keys.js            the keys currency: daily quest, wallet, panel, leaderboard
js/profiles.js        accounts, passkeys, local player roster (~80 KB)
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

**Kart Circuit Unity** (`js/games/kart-circuit-unity.js`) is a hub card that iframes a
Unity WebGL build hosted separately on Render — the hub's allowlist doesn't serve
.wasm/.unityweb, so the build isn't served from here. It is not the Three.js Kart
Circuit. A local export sits untracked at `games/kart-circuit-unity/` (~69 MB); it's
not what the card embeds, so don't `git add -A` — stage explicit paths.

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
- **Download App's links aren't hardcoded either, for the same reason the
  sitemap isn't.** `index.html`'s `<a>` hrefs are only a fallback; `js/app.js`
  overwrites them from `/api/latest-release` (`server.js`), which resolves
  each of the six platforms' *own* newest GitHub release independently (desktop
  rebuilds most sessions, mobile only when the TWA wrapper itself needs to
  change, so "latest" genuinely differs per platform) and caches it 15
  minutes. This replaced a hardcoded version baked into `index.html` by hand
  — twice: first written directly, then a 2026-09-01 "fix" that just
  re-hardcoded whatever was current *then* and was six releases stale again
  by v1.0.58. Don't reintroduce a third hardcoded version — if a platform's
  link is ever wrong, the bug is in what got published to GitHub Releases,
  not in this file.

## 5. Conventions

- **Comments explain *why*, and what was tried.** The house style is a paragraph
  above anything non-obvious. Several are the only record of a bug that took a
  day to find. Match it; don't strip them.
- **User-visible changes get a `CHANGELOG` entry** at the top of the array in
  `js/update-center.js` — date, time, emoji, title, and prose that says what was
  wrong and what changed. That file is ~140 KB and loads on every page view.
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

**Fixed 2026-09-05 — Wine now works, real NSIS installer is back.** The
bundled Wine electron-builder tries to download (`~/.cache/electron-builder/wine@1.0.1`,
currently 11.0) needs a glibc newer than this machine has — confirmed via
strace: `wineserver` segfaults immediately on load, and stock `wine.real`
fails outright with `undefined symbol: __libc_siglongjmp, version
GLIBC_PRIVATE`. That's a real glibc-version floor, not a config problem — a
same-session workaround that vendored a newer glibc via `LD_LIBRARY_PATH`
made it *worse* (mixing glibc versions crashes `wineserver` a different way).
The actual fix was installing a real system Wine that matches this box's own
glibc: `sudo apt-get install -y wine wine64`, then `sudo dpkg --add-architecture
i386 && sudo apt-get install -y wine32` (NSIS installers are 32-bit PE
binaries — wine64 alone isn't enough, and fails with a silent, unhelpful
"not supported on this system"). electron-builder has a built-in escape
hatch for exactly this, `USE_SYSTEM_WINE=true`, which skips its own
(broken, cached) Wine download entirely — pass it on every Windows build:
`USE_SYSTEM_WINE=true npx electron-builder --win nsis portable zip`.
`build.win.target` is back to `["nsis", "portable", "zip"]` — nsis added
back, portable/zip both kept (their own value, not just a Wine workaround:
portable is USB/no-install-friendly, redirecting `userData` next to the .exe
via `PORTABLE_EXECUTABLE_DIR`).

**Publish releases through electron-builder's own `--publish always`, not
`gh release create` by hand.** Every release from v1.0.49 through v1.0.59 was
published by hand, which skips generating `latest.yml`/`latest-mac.yml`/
`latest-linux.yml` — the metadata `electron-updater` (wired up in
`electron/main.js`) needs to detect a new version at all. The installed
desktop app's own auto-update was silently broken for that entire stretch as
a result. `--publish always` also defaults to creating the release as a
**draft** — `gh release edit <tag> --draft=false --latest` after, or it's
invisible to both the public releases API and electron-updater's default
(non-prerelease) check.

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

- **No tests at all.** ~42k lines of client code and a 2700-line server. The
  highest-value first targets are `serveStatic`'s path handling (now that it has
  an allowlist worth protecting) and the room lifecycle.
- **Every page load parses ~1.7 MB of JavaScript** — all 90 game scripts plus a
  140 KB changelog. `sw.js` documents this as deliberate, and it's what makes
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

## 9. Hosting for other devices (desktop app)

The Windows app can be the server for every other device on the network, and the
website points visitors at it. Added 2026-10-18; the block in `server.js`
headed "Hosting for other devices, and finding a host" explains the why.

- **Server side** (`server.js`, all under `/api/host/`): `info`, `sharing` and
  `announce` are for the app on the same computer (the last two refuse anything
  that isn't a loopback socket without `x-forwarded-for`); `register`,
  `unregister` and `lookup` are the rendezvous the *website* runs. It only
  does anything when `MIMI_HOST_MODE=1`, which `electron/main.js` sets on the
  child it spawns; the hosted site never has it.
- **Why a link, not a connection:** an https page can't fetch or open a WebSocket
  to a plain-http LAN address (mixed content), so `js/host-finder.js` shows a
  banner and the visitor *navigates* to the host, which is allowed. Don't
  "improve" it into a silent switch: it can't work, and a probe can't tell
  whether the host is reachable either.
- **Matching** is by the router's public IPv4 (last `x-forwarded-for` entry, not
  the first, which a client can forge). A phone that reaches the website over
  IPv6 won't match; the address + QR in Settings is the fallback.
- **No CORS headers on these endpoints, on purpose** — anything else would let
  any website read a visitor's LAN address.
- **Stop hosting** is a gate in `requestHandler` and the `/mp` handler
  (`lanBlocked`), not a process kill: the app's own window is served by that
  server and would go blank.
- **Accounts on a host are separate from the website's** (own `data/` in the
  app's userData). That is inherent, not a bug.
- 100 Mimi Games (`/home/anthony/jack/mini-games`, repo `jack-mimigames`) carries a
  copy of this block in `hub-server/server.js`, adapted: it sends CORS only on
  `lookup`, to its own website origins, and it can serve its built game
  (`HUB_STATIC_DIR`). This file is the source of truth; re-port changes there.
- Verified by the owner on real hardware (2026-10-18): the Windows apps'
  built-in servers and the Android update banner. Not verifiable from the dev
  box: the Electron child-process spawn and the Windows firewall prompt. The
  server and browser flows were driven with Playwright against local copies.

## 10. The Wii port (`wii/`)

A native C port for the Nintendo Wii (devkitPPC + libogc), requested 2026-10-23. Self-contained: its own `README.md`,
`Makefile`, `build.sh`, tests and deploy script. It is **not** part of the web hub: `server.js`'s allowlist doesn't serve
`wii/`, and `package.json`'s `build.files` doesn't package it. Read `wii/README.md` before touching it.

- **Game logic is portable on purpose.** Every game file (`wii/source/g_*.c`) only talks to `gfx.h`, `audio.h` and
  `input.h`; the Wii-only back ends are `gfx_wii.c`, `audio_wii.c`, `input_wii.c`. That is what lets `wii/tests` compile the
  real games on the PC with stub or software-rendered graphics. Keep it that way: don't call libogc from a game file.
- **Toolchain trap:** the newest devkitPPC (r48+) needs glibc 2.35. This box is Ubuntu 20.04 (2.31), so the toolchain here is
  r47.1 + libogc 2.11 installed without root under `~/devkitpro-root` (see `wii/README.md`). The official package server
  blocks scripted downloads; a public mirror (`wii.leseratte10.de/devkitPro`) has the same files.
- **Test trap:** AddressSanitizer in this GCC crashes at start-up ~1 run in 3 on WSL2 unless ASLR is off; the tests run under
  `setarch -R` for that reason. Don't chase it as a game bug.
- **Safety stance:** the Wii app deliberately writes nothing to the console or the USB drive (no save file) and uses no
  NAND/IOS/ES/network calls. `scripts/deploy-usb.sh` only writes `apps/owen-minigames/` and moves any old copy aside.
- **Verified by the owner on a real Wii (2026-10-23):** the original ten games boot and play from the Homebrew Channel. Not run in Dolphin. The captured videos/screenshots come from `tests/gfx_soft.c`, a PC
  software renderer, and are not console output.
- **Twelve games, 4x3 menu.** `GAME_COUNT` in `wii/source/fw.h`, `games.h`/`games.c`, a `g_<name>.c`, and a `t_<name>.c` (add the name to `GAMES` in `wii/tests/Makefile`) are the places to touch for another game; tests find menu tiles through `fw_tile_center`, so don't hardcode tile positions. A new game also needs `inputs` (INP_* flags, drawn on the instruction screen's remote picture) and `star2`/`star3` score thresholds in its `GameDef`; `t_flow` checks both.

# 51 Mimi Games

A hub of **86 mini-games and 4 small utility apps**, playable solo, in local
split-screen, or over the internet with friends — in a browser, as a desktop
app, on Android and Android TV, or in a Quest headset.

**Play it: <https://mimi-games-lg9l.onrender.com>**

No build step, no bundler, no framework, no transpiler. The front end is plain
HTML, CSS and JavaScript loaded with `<script>` tags and shipped exactly as
written; the back end is one hand-rolled Node server with three dependencies.
Clone it and open it.

---

## Getting it running

```bash
git clone https://github.com/asherwin86/owen-minigames.git
cd owen-minigames
npm install
node server.js
```

Then open <http://localhost:1764>. That's the whole setup — there is nothing to
compile and no environment to configure. Accounts, leaderboards and multiplayer
all work against your local server out of the box.

Node 18 or newer (the deployed site runs 22.14.0). If `certs/` contains a
`key.pem` and `cert.pem` the server serves HTTPS instead, and mirrors the
desktop update feed on plain HTTP one port up.

## What's in it

| | |
|---|---|
| **Action** | 27 — Snake, Breakout, Asteroids, Pinball, Flappy Wings, Zombie Highway, … |
| **Sports** | 14 — Mini Golf, Bowling, Billiards, Archery, Ski Slalom, Skate Park, … |
| **Puzzle** | 14 — 2048, Minesweeper, Sudoku, Match Three, Tower of Hanoi, … |
| **Board** | 12 — Chess Duel, Checkers, Backgammon, Connect Four, Battleship, … |
| **Party** | 9 — Roulette, Slot Machine, Dice Duel, Bingo, Ludo Race, … |
| **Cards** | 9 — Klondike Solitaire, Blackjack, Crazy Eights, Go Fish, Old Maid, … |
| **Apps** | 4 — Calculator, Notes, Timer & Stopwatch, Video Board |

Plus **Kart Circuit**, which is its own thing: a full 3D kart racer on Three.js
with 14 tracks, cups, items, drifting, four-way split-screen, online
matchmaking, and WebXR support for racing in a headset. It lives in
`games/mario-kart/` rather than in `js/games/` because it's a standalone page,
not a hub-embedded game.

### Things it does that a folder of mini-games usually doesn't

- **Accounts** — sign up with a name and password, and your favourites,
  progress and achievements follow you between devices. Passwords are hashed in
  the browser before they're ever sent. Passkeys are supported too.
- **Online multiplayer** — Kart Circuit matchmakes you into a race regionally or
  worldwide; the rest of the hub has room codes and a "Play Together" mode that
  mirrors one player's screen to everyone else.
- **Voice and video chat** in a race, peer-to-peer over WebRTC.
- **Leaderboards, achievements and friends**, shared across everyone on the
  same server.
- **Gamepad support everywhere**, including a rebindable on-screen cursor so a
  controller can drive the hub's menus, not just the games.
- **Installable** — it's a PWA with a service worker, so it works offline after
  one visit, and it ships as real desktop and mobile apps.
- **Keys** — play 5 different games in a day and you earn 10 keys, spendable on
  crates in Rival Arena. The whole feature lives in `js/keys.js`.

## Downloads

Grab an app from the [latest release](https://github.com/asherwin86/owen-minigames/releases),
or from the **Download App** button in the hub itself. Windows, macOS, Linux,
Android phone/tablet, Android TV, and Meta Quest.

The Android and Quest builds are thin wrappers around the hosted site, so they
pick up new versions automatically. The desktop builds bundle their own copy of
the server and run entirely offline.

## Layout

```
index.html            the hub — every game's <script> tag lives here
server.js             the whole back end: static files, APIs, WebSocket relay
css/
  style.css           base layout and components
  switch2.css         the Switch 2 home-menu skin, layered on top
js/
  app.js              grid, filters, routing, opening and closing games
  engine.js           the tiny API every game registers against
  games/*.js          one file per game, 87 of them
  profiles.js         accounts, passkeys, local player roster
  play-together.js    screen-sharing multiplayer
games/mario-kart/     Kart Circuit — its own page, styles and 10k-line game.js
electron/             desktop app wrapper
```

### Adding a game

One file in `js/games/`, one `<script>` tag in `index.html`:

```js
MimiGames.register({
  id: "my-game",
  title: "My Game",
  emoji: "🎲",
  category: "Puzzle",
  players: "1P",
  howTo: "Click things. Win.",
  init(stage, ctx) {
    // build your UI into `stage`
    // ctx gives you scoring, leaderboards, achievements, gamepad input…
    return () => { /* optional cleanup when the player leaves */ };
  },
});
```

## Where it runs

| Target | How | Notes |
|---|---|---|
| **Render** | `node server.js`, free plan | the hosted site; free-tier disk is wiped on every deploy, so accounts/leaderboards mirror to Upstash Redis |
| **GitHub Pages** | static, no server | a playable preview — every game works, but accounts, leaderboards and multiplayer are gated off behind `MIMI_STATIC_MODE` |
| **Desktop** | Electron, spawns `server.js` locally | auto-updates from GitHub Releases |
| **LAN** | `node server.js` on any machine | everyone on the network can join from a browser |

## Conventions worth knowing before you edit

A few things here are deliberate and easy to trip over:

- **Cache-busting is manual.** Every `<script>` and `<link>` in `index.html`
  carries `?v=YYYYMMDDx`. Bump it when you change that file. `index.html`
  itself has no query string, so changing it means bumping `CACHE_NAME` in
  `sw.js` or browsers keep serving the old copy.
- **The changelog is code.** User-visible changes get an entry in the
  `CHANGELOG` array at the top of `js/update-center.js`, which is what the
  "What's New" panel reads.
- **Comments explain *why*.** The house style is a paragraph above anything
  non-obvious saying what was tried and what went wrong. Several of them are
  the only record of a bug that took a day to find. Please match it, and please
  don't strip them.
- **Never commit** `data/*.json` (real accounts), `certs/`, `downloads/`, or
  build output. All are gitignored for good reasons.

## Scripts

```bash
node server.js                  # run it
npm run electron:start          # run the desktop app against your working tree
npm run electron:build:linux    # AppImage + deb
npm run electron:build:mac      # zip
npm run electron:build:win      # installer (needs a working Wine on Linux)
```

`npm test` is still the npm placeholder — there are no automated tests yet. The
highest-value place to start would be `server.js`'s static-path handling and the
multiplayer room lifecycle.

## License

ISC. Made for fun, and not affiliated with Nintendo.

## Nintendo Wii edition

`wii/` holds a native Wii homebrew port: twelve Wii Remote minigames in one `boot.dol`, built with devkitPPC and libogc
(Balloon Pop, Target Practice, Whack-a-Mole, Fruit Catcher, Memory Match, Dodge It!, Fishing Frenzy, Bubble Pop, Racing
Challenge, Treasure Hunt, Outlaw Shootout, Fist Fury). It is separate from the web hub: nothing in `wii/` is served by `server.js` or packaged into
the desktop app.

```bash
./wii/build.sh                                # builds wii/dist/apps/owen-minigames/boot.dol
make -C wii/tests test                        # automated tests of the game logic (run on the PC)
./wii/scripts/deploy-usb.sh --dry-run         # then without --dry-run: copies it to F:\apps\owen-minigames\
```

Launch it from the Homebrew Channel. Verified working on a real Wii by the owner (2026-10-23) before the last two games were added; not run in Dolphin. Toolchain setup, controls, troubleshooting
and the limits (it is not in USB Loader GX's game list) are in [`wii/README.md`](wii/README.md).

## Running with Docker (home lab)

The whole hub (pages, API, accounts, multiplayer relay) is one Node process, so the image is small and has one volume.

```bash
docker compose up -d --build        # then open http://<your-server>:1764
```

Without compose:

```bash
docker build -t owen-minigames .
docker run -d --name mimi-games --restart unless-stopped -p 1764:1764 -v mimi-data:/var/lib/mimi owen-minigames
```

`docker ps` shows `healthy` once it is serving. Update with `git pull && docker compose up -d --build`.

**Or pull the prebuilt image.** A GitHub Actions workflow (`.github/workflows/docker.yml`) builds the image for amd64 and arm64, smoke-tests
it and publishes it to GitHub's container registry whenever the server or the served files change on `main` (and on release tags):

```bash
docker compose -f docker-compose.ghcr.yml up -d        # runs ghcr.io/asherwin86/owen-minigames:latest, no build needed
docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d    # update later
```

Pin a version with `MIMI_TAG=1.0.66` (release tags) or a commit tag such as `MIMI_TAG=sha-abc1234`. If the pull is refused, the package
is still private: GitHub profile → Packages → `owen-minigames` → Package settings → Change visibility → Public (once).

**Your data.** Accounts, leaderboards, cakes and messages live in the `mimi-data` volume, as JSON files under `/var/lib/mimi/data/`.
That volume is the only thing to back up:

```bash
docker run --rm -v mimi-data:/d -v "$PWD":/b alpine tar czf /b/mimi-data-$(date +%F).tgz -C /d .      # back up
docker run --rm -v mimi-data:/d -v "$PWD":/b alpine tar xzf /b/mimi-data-YYYY-MM-DD.tgz -C /d         # restore
```

If you use a bind mount instead of a named volume, the container runs as the unprivileged `node` user (uid 1000), so
`chown -R 1000:1000 <folder>` first. Accounts on your server are separate from the ones on the Render site.

**HTTPS and a real hostname.** The container speaks plain HTTP. Passkeys, voice chat and camera/microphone games only work over
HTTPS, and passkeys also need a hostname rather than an IP address, so put a reverse proxy in front. With Caddy:

```text
mimi.example.home {
    reverse_proxy 127.0.0.1:1764
}
```

Any proxy works if it forwards WebSocket upgrades on `/mp` (nginx needs `proxy_http_version 1.1` and the `Upgrade` and `Connection`
headers; Caddy and Traefik do this by themselves). When the proxy runs on the same machine, publish the port only to it with
`ports: ["127.0.0.1:1764:1764"]`.

**Keep it on your LAN or VPN.** The multiplayer relay has no login and the per-address rate limits trust the first
`X-Forwarded-For` entry, so don't expose it directly to the internet (see "Still open" in `CLAUDE.md`). Don't mount TLS
certificates into `/app/certs` either: that makes the server open a second plain-HTTP port that serves everything.

| Setting (env var or `.env` next to `docker-compose.yml`) | Meaning |
|---|---|
| `MIMI_PORT` | Host port to publish (default `1764`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional: email notifications and recovery codes |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional: mirror the data to Redis (not needed at home) |

Raspberry Pi or another ARM box: `docker buildx build --platform linux/arm64 -t owen-minigames --load .` (or `linux/amd64,linux/arm64` with
`--push` to a registry). The Download App buttons look up the newest GitHub release from inside the container, so they need outbound
internet; without it the page falls back to its built-in links. The desktop app, the Wii port and the Unity export are not in the image
(`.dockerignore`).


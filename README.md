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

## Ads

Ads are **off by default**: a checkout, the desktop app and the Docker image show none until the server is told otherwise, and nothing
is added to the page or requested from an ad network. They are configured with environment variables, so one image serves any site.
This is a children's site, so the design is deliberately cautious:

- **Consent first.** The visitor sees a short notice ("Show ads" / "No thanks", with a link to `/privacy.html`). Nothing is loaded from the
  ad network until they accept, and "Ad choices" under the banner takes the choice back.
- **Child-directed and non-personalised by default** (`MIMI_ADS_CHILD_DIRECTED=0` turns it off; don't, on a kids' site).
- **No ads during play.** A banner sits under the game grid, a video ad can appear after a game is *closed* (every Nth close, never
  closer together than a minimum gap), and the keys panel has an optional "Watch a short video: +N keys" button.
  Rewarded videos are capped per day.

| Setting | Meaning |
|---|---|
| `MIMI_ADS_PROVIDER` | `off` (default), `adsense`, or `demo` (clearly labelled fake ads, for trying the flow without an account) |
| `MIMI_ADSENSE_CLIENT` | Your publisher id, `ca-pub-…`. Required for `adsense`; also what `/ads.txt` is generated from |
| `MIMI_ADSENSE_BANNER_SLOT` | Optional ad unit id for the banner. Without it only the video ads run |
| `MIMI_ADS_TEST` | `1` asks for test ads (safe to click while setting up) |
| `MIMI_ADS_EVERY` / `MIMI_ADS_MIN_SECONDS` | Between-games video after every Nth closed game (default 3) and at least this many seconds apart (default 180) |
| `MIMI_ADS_REWARD_KEYS` / `MIMI_ADS_REWARD_DAILY_MAX` | Keys for a rewarded video (default 5) and videos per person per day (default 5) |

`demo` first, to see it working: `MIMI_ADS_PROVIDER=demo node server.js`.

**What you still have to do for real ads.** The `adsense` provider uses Google AdSense for the banner and Google's H5 Games Ads
(`adBreak`) for the videos. It was written from Google's documented API and driven against a faked ad network, **not** against live AdSense:
you need an approved AdSense account (and AdSense for Games / H5 access for the video formats), `ads.txt` is served for you at `/ads.txt`,
and visitors in the EEA, UK and Switzerland need a Google-certified consent platform on top of the notice here, which this repo does not
include. Advertising to children carries legal obligations (COPPA in the US, the UK Children's Code, the GDPR's rules for children's data):
have `privacy.html` reviewed for your site and jurisdiction before you switch real ads on.

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

**Exposing it to the internet.** The multiplayer relay has no login by design (a room code is the key), so it is limited instead:
messages are capped at 2 MiB and rate-limited per connection, a socket can be in one room at a time, one address can hold 60 sockets and 10
rooms (500 rooms in all), wrong room codes and wrong presence logins are limited per address, only a room's host can mirror its screen in
Play Together, and what guests receive is stripped of anything that can run code. Those numbers are for a household or a school behind one
address; `MIMI_WS_MAX_CONNS_PER_IP`, `MIMI_WS_MAX_ROOMS_PER_IP` and `MIMI_WS_MAX_ROOMS` change them.

Three things are yours to set when you publish it:

1. **`MIMI_TRUSTED_PROXY_HOPS`** (default `1`): how many reverse proxies sit in front of the container. The per-address limits use the
   `X-Forwarded-For` entry that many places from the *right*, because everything to the left of it was written by the visitor. `1` is right
   for one proxy (Caddy, nginx, Traefik, Render); `2` for e.g. Cloudflare in front of your proxy; **`0` when nothing is in front** (the
   header is then ignored completely, because anyone can send it).
2. **`MIMI_DEV_SIGNUP_HASH`.** Dev accounts get the Admin panel, and the built-in dev password's hash is in this repository's public history.
   Either switch dev sign-up off with `MIMI_DEV_SIGNUP_HASH=off`, or set your own password's hash:
   `printf 'mimiProfile:dev-gate:YOUR-PASSWORD' | sha256sum`. Do one of the two.
3. **HTTPS, by your proxy** (see below). Don't mount certificates into `/app/certs`: the server then also opens a plain-HTTP port next to the
   HTTPS one. It serves only the desktop app's update feed and the `/mp` relay unless `MIMI_PLAIN_HTTP_FULL=1`, but a container doesn't need it.

Passwords and passkeys: a profile's password hash is what the browser sends to prove who it is, so over plain HTTP anyone on the path can
replay it. Use HTTPS for anything that isn't your own LAN.

| Setting (env var or `.env` next to `docker-compose.yml`) | Meaning |
|---|---|
| `MIMI_PORT` | Host port to publish (default `1764`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional: email notifications and recovery codes |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional: mirror the data to Redis (not needed at home) |
| `MIMI_ADS_*`, `MIMI_ADSENSE_*` | Optional: ads, **off by default**. See "Ads" below |
| `MIMI_TRUSTED_PROXY_HOPS` | Reverse proxies in front of the container (default `1`; `0` if none). See "Exposing it to the internet" |
| `MIMI_DEV_SIGNUP_HASH` | `off` to disable dev sign-up, or the SHA-256 of your own dev password. Set one on a public server |
| `MIMI_WS_MAX_CONNS_PER_IP`, `MIMI_WS_MAX_ROOMS_PER_IP`, `MIMI_WS_MAX_ROOMS` | Multiplayer limits (defaults 60, 10 and 500) |
| `MIMI_PLAIN_HTTP_FULL` | `1` serves the whole site on the extra plain-HTTP port that exists only when certificates are mounted (default: update feed only) |

**Using your own domain.** TLS and the domain belong to whatever reverse proxy your lab already runs (Caddy, Traefik, Nginx Proxy Manager,
a Cloudflare tunnel, ...), so none of that is in this repo. Point the proxy at the container's port 1764 and make sure it:

- terminates HTTPS and forwards to `http://<container-or-host>:1764`,
- passes WebSocket upgrades on `/mp` (the multiplayer relay),
- keeps the original `Host` header (passkeys are tied to the hostname),
- sets `X-Forwarded-For` to the real client address, replacing any value the client sent (Caddy and Traefik do; with nginx use
  `proxy_set_header X-Forwarded-For $remote_addr;`) and sets `X-Forwarded-Proto: https`, which passkeys need,
- and tell the server how many proxies there are with `MIMI_TRUSTED_PROXY_HOPS` (default 1).

Accounts and passkeys are per address: someone who signed up on the Render site has no account on yours, and a passkey made on one name
doesn't work on the other. The page still declares the Render address as its canonical URL (`index.html`, `robots.txt`); change those
if your name should be the main one.

**What is still not solved.** A profile's password hash is the credential and travels with every request, so HTTPS is essential. Accounts have no
email verification, and the limits above are per process and kept in memory (a restart resets them). The "Still open" list in `CLAUDE.md`
is the current record.

Raspberry Pi or another ARM box: `docker buildx build --platform linux/arm64 -t owen-minigames --load .` (or `linux/amd64,linux/arm64` with
`--push` to a registry). The Download App buttons look up the newest GitHub release from inside the container, so they need outbound
internet; without it the page falls back to its built-in links. The desktop app, the Wii port and the Unity export are not in the image
(`.dockerignore`).


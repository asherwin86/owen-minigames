# 51 Mimi Games

A hub of **85 mini-games and 4 small utility apps**, playable solo, in local
split-screen, or over the internet with friends — in a browser, as a desktop
app, on Android and Android TV, or in a Quest headset.

**Play it: <https://mimi-games-bvpj.onrender.com>**

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

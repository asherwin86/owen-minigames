# Contributing

Thanks for taking a look. This is a hobby project, so the bar is "does it work
and is it clear", not ceremony.

## Getting set up

```bash
git clone https://github.com/asherwin86/owen-minigames.git
cd owen-minigames
npm install
node server.js
```

Open <http://localhost:1764>. There is no build step, no bundler and no
transpiler — what you write is what ships. Reload the page to see a change.

## Adding a game

One file in `js/games/`, one `<script>` tag in `index.html`, and bump
`EXPECTED_GAMES` in `js/app.js` (it's a tripwire that catches a game file
silently failing to load).

```js
MimiGames.register({
  id: "my-game",
  title: "My Game",
  emoji: "🎲",
  category: "Puzzle",   // Action, Sports, Puzzle, Board, Party, Cards, Apps
  players: "1P",
  howTo: "How to play, including keyboard, gamepad and touch controls.",
  init(stage, ctx) {
    // build into `stage`; ctx has storage, sound, scoring, leaderboards…
    return () => { /* cleanup when the player leaves */ };
  },
});
```

Keep a game to its own file. If it needs a library, load it on demand rather
than adding it to `index.html` — the hub already parses well over a megabyte of
JavaScript on every page load, and 80-odd games shouldn't pay for one game's
dependency. `js/games/block-realm.js` shows the pattern.

## House style

- **Comments explain *why*, not what.** The convention here is a short paragraph
  above anything non-obvious describing what was tried and what went wrong.
  Several of them are the only surviving record of a bug that took a day to
  find. Please match that, and please don't strip them.
- **Cache-busting is manual.** Every `<script>` and `<link>` in `index.html`
  carries `?v=YYYYMMDDx` — bump it when you change that file. `index.html`
  itself has no query string, so changing *it* means bumping `CACHE_NAME` in
  `sw.js` or browsers keep serving the old copy.
- **User-visible changes get a changelog entry** at the top of the `CHANGELOG`
  array in `js/update-center.js`. That array is what the "What's New" panel
  reads.
- Match the surrounding code rather than introducing a new style.

## Testing

There is no automated test suite yet — changes are verified by running the app
and driving it. If you add one, `server.js`'s static-path handling and the
multiplayer room lifecycle are the highest-value places to start.

Please actually play your change before opening a PR, on a keyboard and, if the
game supports them, with a gamepad and on a touchscreen.

## Never commit

`data/*.json` (real accounts), `certs/`, `downloads/`, or build output. All are
gitignored for good reasons.

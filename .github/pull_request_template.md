## What does this change?

<!-- One or two sentences. If it fixes an issue, say "Fixes #123". -->

## Why?

<!-- What was wrong, or what this makes possible. If you tried an approach that
     didn't work, that's worth a line — it's the kind of thing this codebase
     tends to record in comments. -->

## How did you test it?

<!-- There's no automated suite, so say what you actually did: which games you
     opened, what you clicked, what you checked. -->

## Checklist

- [ ] I played the change rather than only reading it
- [ ] Bumped the `?v=` on any `index.html` script/link I touched
- [ ] Bumped `CACHE_NAME` in `sw.js` if I changed `index.html` itself
- [ ] Added a `CHANGELOG` entry in `js/update-center.js` if it's user-visible
- [ ] Updated `EXPECTED_GAMES` in `js/app.js` if I added or removed a game
- [ ] No `data/*.json`, `certs/`, `downloads/` or build output in the diff

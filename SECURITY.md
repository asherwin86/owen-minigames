# Security Policy

## Supported versions

Only the latest release and the current `main` branch are supported. There are
no long-lived branches to backport to.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Use GitHub's private reporting — the **Security** tab → *Report a vulnerability*
— or contact the repository owner directly through GitHub.

Please include what the problem is, how to reproduce it, and what an attacker
could actually do with it. A short proof of concept helps a lot.

You should get an initial response within a week. Since this is a hobby project
maintained in spare time, a fix may take longer than that; you'll be told where
things stand rather than left waiting.

## Scope

The parts of this project worth reporting on:

- `server.js` — static file serving, the profile/leaderboard/friends APIs, the
  page-fetch proxy, and the WebSocket relay.
- Anything that could expose one player's account data to another.
- Anything that lets a client run code in another player's browser.

Known and accepted, so not worth a report:

- **Keys and game progress live in the browser.** They're a local currency for
  cosmetics in single-player games. Someone editing their own `localStorage` to
  give themselves skins is expected, not a vulnerability.
- **The static GitHub Pages preview has no backend at all**, so accounts,
  leaderboards and multiplayer are simply switched off there.
- Self-signed certificates in a local `certs/` directory are for LAN development
  only and are never shipped in a build.

## Running it yourself

Nothing in this project needs to be exposed to the public internet to be used —
it runs fine on `localhost` or a home LAN. If you do host it publicly, note that
the profile API is rate-limited but the WebSocket relay is not authenticated.

# Release

## Status: v0.9.0 release candidate — waiting for launch approval

| | |
|---|---|
| Live (public) | https://therealsiyuan.github.io/CityWalk_v2/ — serves `main`; deploys on every push |
| Last verified live | 2026-10-26: the live page served the commit that added races (strings "Race", "Restart", "Quit", "Other races" present). Fetched over the web from this environment; not opened on a physical phone. |
| itch.io package | `npm run package:itch` → `release/citywalk-itch-0.9.0.zip` (~200 kB, `index.html` + one JS file) |
| CrazyGames package | `npm run package:crazygames` → `release/citywalk-crazygames-0.9.0.zip` (~198 kB, solo, no external links; scanned in CI) |
| Listing copy | `marketing/LISTING.md` |
| Media | `marketing/cover-630x500.png`, `marketing/screenshots/`, `marketing/citywalk-short-vertical.mp4` (23 s, 720×1280), `marketing/citywalk-gameplay-1280x720.mp4` (20 s) |

## Release gate (all must pass before a public release)

- [x] `npm run build` — zero TypeScript errors
- [x] `npm test` — unit tests (swing physics, collision vs rendered roofs, traversal bots, races)
- [x] `npm run e2e` — phone viewport, desktop viewport, swing, race, two-player
- [x] GitHub Actions build + deploy green
- [ ] Owner has played the release candidate on a phone and a desktop
- [ ] Owner approval for the specific external action (see below)

## Pending approval: first external launch

See the approval request in `DECISIONS.md` (latest entry). Nothing has been published
anywhere except the existing GitHub Pages site.

## Known issues (v0.9.0)

- Frame rate on real phones is unmeasured (tests use software rendering).
- Multiplayer over the public internet is unverified from the build environment; strict
  NATs without TURN fall back to solo.
- Rope can pass the London Eye wheel and thin details (not solid by design).
- The live gap to your ghost is an estimate (where your best run passed closest to you on the
  current leg); it hides when you take a path more than 60 m from your best run's.
- Holding Swing in big open plazas (Trafalgar Square, Buckingham Palace forecourt) finds
  nothing to grab; you run across them.
- The CrazyGames build is solo only (no shareable room links there); multiplayer would need
  the CrazyGames SDK invite links (Full Launch work).
- On itch.io the page URL cannot carry a room code, so Share links point at the GitHub
  Pages address; friends join there.

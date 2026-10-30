# Daily progress

Verified work only. Newest first.

## 2026-10-30

**Implemented**
- Ghost of your best race run: finishing any route (fixed or daily) with a new personal best
  saves a compact recording of the run (10 poses/s, ~0.1 m precision) on the device. Racing
  that route again shows a see-through runner labelled "Your best" replaying it, rope and all;
  it waits at the start during the countdown and steps aside a second after its finish.
- Checkpoint toasts now compare with the ghost, e.g. "Big Ben 0:41.2 +1.3 s" (behind) or
  "−0.8 s" (ahead).
- Only today's daily ghost is kept (older daily ghosts are deleted); runs over 10 minutes keep
  no ghost. Tuning in `CONFIG.ghost`. New file `src/ghost.ts`.

**Verified**
- Build: 0 TS errors. Unit: 51 passed (new: fixed-rate recording at any frame rate, replay
  interpolation/rope/end hold, storage round trip and malformed-data rejection, length cap,
  split sign). Browser: 6 passed (race test now checks the ghost is saved with 4 splits, is
  visible on the next attempt starting at the route start, the split toast appears, and the
  ghost hides on Quit). The multiplayer test failed once in the first full run and passed
  alone and in a second full run — looks like a timing flake under load, not this change.
- CrazyGames package rebuilt: scanner clean.
- Not verified: how the ghost looks and feels to a player (needs a human); real phones.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** owner playtest fixes if any; otherwise ghost polish (live gap on the race HUD).

## 2026-10-29

**Implemented**
- "Share today's time": finishing the daily race shows a button that shares (phone share
  sheet) or copies a plain-text line, e.g. "CityWalk Daily · 29 Oct: I raced it in 1:23.4.
  Same route for everyone today. Can you beat it?" plus the game link. The CrazyGames build
  shares the text without any link. Fixed routes do not show the button.
- First screen: the Race button carries a "Daily" badge until today's challenge has a time
  on this device, so returning players see there is a new route.

**Verified**
- Build: 0 TS errors. Unit: 46 passed (new: share text names day and time, link only when
  given). Browser: 6 passed (daily test now finishes the daily, checks the badge appears
  then clears, the button shares the expected text; fixed race shows no share button).
- CrazyGames package rebuilt: scanner clean, no external links.
- GitHub Actions run 40825906884 (commit 3c01323): build (incl. CrazyGames scan), e2e and
  deploy jobs all succeeded.
- Top bar with the badge checked in a 390 px-wide phone screenshot; not checked on narrower
  phones or real devices.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** owner playtest fixes if any; otherwise ghost of your best race run.

## 2026-10-28

**Implemented**
- CrazyGames build variant: `npm run package:crazygames` → `release/citywalk-crazygames-0.9.0.zip`
  (~198 kB). Built with `VITE_PORTAL=crazygames` (`src/portal.ts`): no Share button, no
  player count, no room link, solo play (a room nobody can be invited to is pointless, and
  it makes no relay or peer connections). Gameplay is otherwise identical.
- `tools/check-portal-build.mjs` scans the build and fails on any external URL, GitHub,
  itch.io or other-portal string; the share-URL code is compiled out of that build.
- CI build job now packages and scans the CrazyGames variant on every push.

**Verified**
- Build: 0 TS errors. Unit: 45 passed (new: portal rules, link scanner). Browser: 6 passed.
- CrazyGames build opened in headless Chromium (phone viewport): renders, Share and player
  count hidden, no `<a href>` links, zero requests or websockets to any non-local host, no
  page errors. itch.io package still points Share at GitHub Pages (unchanged).
- GitHub Actions run 40640431927 (commit fb3e03f): build (incl. the CrazyGames scan), e2e and
  deploy jobs all succeeded.
- Not verified: inside CrazyGames' own iframe/QA tool (needs a CrazyGames developer account).

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** daily challenge polish — "Share today's time" text and show the daily on first screen.

## 2026-10-27

**Implemented**
- Daily challenge: the Race menu now opens with "Daily · <date>", a 4-stop landmark route
  generated from the UTC date (same for every player that day), starting from a known-clear
  route start and facing the first stop. Legs are 150–600 m (`CONFIG.daily`). Best time is
  kept per day on the device; tomorrow starts fresh at "New".

**Verified**
- Build: 0 TS errors. Unit: 42 passed (new: a year of daily routes are deterministic, valid,
  within leg limits and varied; per-day bests). Browser: 6 passed (new daily test; the fixed
  race test now picks Westminster Dash by name since the daily is listed first).
- GitHub Actions run 9 (commit 0668dca): build, e2e and deploy jobs all succeeded.
- Not verified: whether generated routes are fun or fairly paced — needs a human playtest.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** CrazyGames no-external-links build variant.

## 2026-10-26

**Implemented**
- Holding Swing chains automatically (auto-release near the top of each arc, re-grab
  ahead), pivot straightened along the street, rope never attaches through buildings, zips
  for level anchors, mid-air jump, landing slides, miss feedback.
- Holding Swing re-arms after a splash or landing (beginners were stuck after falling in).
- Bridge lamp standards are swing points; every courtyard has a mews passage.
- Timed landmark races: 3 routes, countdown, beacon, restart/quit, personal bests.
- Desktop: touch buttons hidden, key hints. Journal: Back to start, version.
- itch.io package script; promo video, screenshots, cover; release docs.
- CI: runners pinned to ubuntu-24.04 (e2e job had started failing on the image move).

**Verified**
- Build: 0 TS errors. Unit: 40 passed. Browser: 5 passed (mobile, swing, two-player, race, desktop).
- Deploy run for the race commit: build + deploy succeeded; live page served the new UI strings.

**Money earned:** £0 (not yet published on a paying channel).

- Daily scheduled development task configured (05:45 UK, ~40 min cap, no external actions).

**Next task:** owner playtest → itch.io launch on approval → daily challenge.

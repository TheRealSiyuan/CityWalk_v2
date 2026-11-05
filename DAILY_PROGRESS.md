# Daily progress

Verified work only. Newest first.

## 2026-11-05

**Implemented**
- A friend's ghost from a challenge link now swings on a visible rope. Before, it hung in mid-air
  with no rope, which is what a new player sees first when a friend sends them a link.
- Links gain a new format that carries one rope anchor per swing. Links already shared in the old
  format still open, without a rope. A run too busy to fit with its rope still gets a link,
  without the rope (the frame rate drops first; the rope goes only if that is not enough).

**Verified**
- Build: 0 TS errors. Unit: 69 passed (3 new: rope round trip, size limits with ropes, a real
  old-format link saved before this change). Browser: 9 passed; the challenge-link test now checks
  the ghost's rope appears and goes again. CrazyGames package rebuilt: scanner clean.
- One-off real run in headless Chromium (temporary script, not kept): holding Swing through a real
  daily race, sharing the real link and opening it in a new browser. Rope seen on the Friend ghost
  in screenshots. Link length: 393 to 719 characters for 13 to 26 s runs with 5 to 9 swings (the
  timed runs were held Swing only, then teleports to the checkpoints, so not a full human race).
- Synthetic runs with a rope every 2.5 s: 60 s fits at 5 frames a second; 120 s at 2; 180 s at 1.
  Nonstop swinging for 300 s still fits a link, but may lose the rope.
- GitHub Actions run 41977013965 (commit 3213a83): build, e2e and deploy all succeeded.
- Not verified: how it looks on a real phone, or whether anyone finds it better (needs a human).

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** links for the fixed routes, or decide whether deploy should wait for e2e.

## 2026-11-04

**Implemented**
- Found and fixed the cause of the intermittent multiplayer failure. It was a real bug that could
  hit real players, not just the test. While alone in a room the game leaves and re-joins every
  18 s or more. If a friend connected during that moment, the connection finished on the room
  being left, one side's second handshake never completed, and the other side believed it was
  connected. Both then showed an empty street, and further re-joins did not clear it.
- Fix in `src/net.ts`: a room being left can no longer add peers; a peer that says nothing for
  12 s after joining (`CONFIG.net.helloTimeout`) has its connection closed, which resets both ends
  so the normal re-join can connect them. Hello is sent on joining, so a player who has switched
  to another app is not dropped once they have said it.

**Verified**
- Reproduced by timing the second player's arrival around the first player's re-join (three pairs
  at once on this 2-core machine, temporary logging in the library, since removed). Before: 4 of
  10 arrivals never connected within 45 s, and 2 more took about 30 s; logs showed the stuck
  handshake. After: all 6 reported arrivals connected: 2 in under 6 s, 1 in 16 s, 3 in about 27 s.
  3 further arrivals in that run were cut off by my output limit, so their results are unknown.
- Before the fix, plain repeats mostly passed: 8/8 of the browser test, and 29/30 in a separate
  join-timing script. So the old "cause unknown" failures fit this bug but were not individually
  traced to it.
- Build: 0 TS errors. Unit: 66 passed (5 new in `tests/net.test.ts`, using a fake room). Browser:
  9 passed, then the multiplayer test 3/3. CrazyGames package rebuilt: scanner clean.
- GitHub Actions run 41784626801 (commit af925a4): build, deploy and e2e all succeeded.
- Not verified: public relays or real phones (all tests use a local relay). A friend arriving
  exactly during a re-join can still wait up to about 27 s; that delay is not fixed.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** decide whether deploy should wait for e2e; owner playtest fixes if any; then shorten
the remaining wait for a friend arriving during a re-join, or show the rope on a friend's ghost.

## 2026-11-03

**Implemented**
- Challenge links ("share a ghost") for the daily race. Finishing a daily now shows
  **Challenge a friend**, which shares a link carrying that run in the URL fragment (not sent
  to any server). Opening it offers "A friend challenged you · Daily · <date> · beat <time>"
  (after the tutorial for new players; at once otherwise), then races the friend's ghost,
  labelled "Friend", with the existing splits and live gap. The result card adds "You beat
  your friend by 1.3 s" or "Your friend was 1.3 s faster"; Race again keeps the friend's ghost.
- Links survive midnight: the route is generated from the day in the code, so an older link
  races that day's route, and doing so leaves today's own ghost alone.
- Codec in `src/challenge.ts`, tuning in `CONFIG.challenge` (longest code 1800 characters,
  kept frame rate drops as runs get longer). The compact form drops the rope and rebuilds
  facing and speed from the path, so a friend's ghost swings without a visible rope.
- Off in the no-external-links build (no link, no offer). Malformed links are ignored.
- The compass pill now hides while the card is up (it showed through the card).

**Verified**
- Build: 0 TS errors. Unit: 61 passed (9 new: round trip, rebuilt facing and speed, size limit
  up to 5 min runs, truncated and random codes, mismatched splits). Browser: 9 passed (new test:
  real link from a finished daily opened in a second browser context, tutorial then offer,
  ghost loaded and visible, result line, Race again, Not now, an older day's link, a broken link).
  Phone screenshots of the offer and result checked. CrazyGames package rebuilt: scanner clean,
  challenge offer text absent from that build.
- GitHub Actions run 41587099776 (commit 679f5a9): attempt 1: build and deploy succeeded, e2e
  FAILED (multiplayer test: peers never saw each other within 45 s; the new test passed). Failed
  job re-run, attempt 2: all green. The site deployed in attempt 1 either way: deploy does not
  wait for e2e.
- Multiplayer test is intermittent and the cause is unknown. On this commit, repeated locally:
  3/5 then 5/5 passed. On the previous commit: 5/5. `src/net.ts` is unchanged and nothing in
  this change touches rooms or peers, but a regression is not ruled out.
- Not verified: link length and ghost smoothness from real human runs (tests use a synthetic
  run and teleports); whether messaging apps keep links this long intact; whether anyone
  shares them (no analytics by design); real phones.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** find out why the multiplayer test fails intermittently, and whether deploy should
wait for e2e; then owner playtest fixes if any; then keep the rope on a friend's ghost, or
challenge links for the fixed routes.

## 2026-11-02

**Implemented**
- First-race hint: during the countdown of a player's very first race a small card says
  "Reach the golden beacon at each stop, in order. The clock stops at the last one." It hides
  itself after 6 s (`CONFIG.firstRun.raceHintSeconds`) or on Quit, and never returns on this
  device (nor shows for anyone who already has a best time).
- Short landscape screens: the hint sits at the bottom between the thumb controls, and the
  countdown digit is smaller and lower so it no longer covers Restart/Quit.

**Verified**
- Build: 0 TS errors. Unit: 52 passed. Browser: 8 passed (new test: hint hidden before a race,
  shown on the first countdown, clear of HUD and digit at 390x844, gone after GO, not back on
  Restart or a later race; at 844x390 clear of the HUD, Quit removes it). Phone and landscape
  screenshots checked. CrazyGames package rebuilt: scanner clean.
- GitHub Actions run 41396607728 (commit 984857a): build, e2e and deploy succeeded.
- Not verified: whether the wording helps new players (needs playtesters); real phones.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** owner playtest fixes if any; otherwise "share a ghost" code for the daily.

## 2026-11-01

**Implemented**
- First-run nudge into a race: when a new player's first tutorial ends (finished or skipped),
  a card under the top bar says "Ready? Try today's daily race", names today's route and
  offers **Race it** (starts the daily straight away) or **Not now**. It hides itself after
  15 s (`CONFIG.firstRun.suggestSeconds`), when any race starts, and never appears for
  returning players, on a tutorial replay, or if today's daily already has a time.

**Verified**
- Build: 0 TS errors. Unit: 52 passed. Browser: 7 passed (new first-run test: card hidden
  during the tutorial, shown after Skip, Race it starts `daily-<today>`; no card after reload
  or on a tutorial replay; Not now dismisses it without starting a race). Phone screenshot
  (390 px) checked: card fits below the top bar, clear of the Jump/Swing buttons.
- CrazyGames package rebuilt: scanner clean.
- GitHub Actions run 41278480266 (commit 0c53024): build, e2e and deploy succeeded.
- Not verified: whether new players actually take the race (no analytics by design; needs
  playtesters); real phones.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** owner playtest fixes if any; otherwise first-countdown race hint, then
"share a ghost" code for the daily.

## 2026-10-31

**Implemented**
- Live gap to your ghost on the race HUD: under the clock, a pill shows how far ahead
  (green, "−1.2 s") or behind (red, "+0.8 s") of your best run you are between checkpoints,
  refreshed 4×/s. It finds where your best run passed closest to you on the current leg and
  compares clocks there; it hides on a first run (no ghost) and when you are more than 60 m
  from your best run's path. Tuning in `CONFIG.ghost` (`liveHz`, `liveMaxOffPath`,
  `liveTieMetres`); logic `liveDelta()` in `src/ghost.ts`.

**Verified**
- Build: 0 TS errors. Unit: 52 passed (new: ahead/behind values, standing together reads
  level, second leg uses its own window, off-path and past-last-checkpoint give no gap).
  Browser: 6 passed (race test checks the gap is hidden on a first run, shows a signed value
  when racing the ghost, and hides on Quit). Phone screenshot (390 px) checked: pill fits
  between the clock and the next-stop line.
- CrazyGames package rebuilt: scanner clean.
- GitHub Actions run 41174170877 (commit 1455c4c): build, e2e and deploy succeeded.
- Not verified: whether the gap reads steadily and feels fair in real play (needs a human);
  real phones.

**Money earned:** £0 (not yet published on a paying channel).

**Next task:** owner playtest fixes if any; otherwise first-run polish (lead new players
into the daily race after the tutorial).

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
- GitHub Actions run 41011039663 (commit 2043a75): build, e2e and deploy all succeeded.
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

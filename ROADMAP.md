# Roadmap

Ordered by impact on getting real players and the first revenue.

## Now (v0.9 → v1.0)

0. **Multiplayer joins**: stuck joins fixed (2026-11-04); a dropped stuck peer now triggers an
   immediate re-join (2026-11-07, unit-tested, real-browser gain not measured). Remaining: slow
   joins (50 s+) seen when 6 browsers shared a 2-core machine, in both old and new builds;
   find whether that is just load or a real slow path. Deploy now waits for e2e (2026-11-08).
   The "User-Initiated Abort" CI flake (2026-11-10) is fixed: it was the library logging a
   friend's abrupt close as an error (2026-11-11). The re-join after an abrupt drop failed the
   two-player test 3 of 6 isolated runs on 2026-11-14: top engineering task now. 2026-11-15:
   normal re-join measured ~5 s, slow path 30 s+; "wait for the library's own reconnect" tried and
   rejected (slower, still failed); failure now logs both sides' network view.
   2026-11-16: cause found (both sides re-joined on the same tick, in lockstep); now only the
   lower id re-joins and the other waits. Re-join step 7 of 7 locally at ~5 s. Watch CI.
   2026-11-17: CI green on both runs since (re-join 1.9 s in the latest). Keep watching.
   2026-11-18: one CI failure (run 44027868413) was a test race, not the game: the tutorial
   timed out between the test's check and its tap. Test fixed. Keep watching.
   2026-11-19: CI green for that fix (run 44247361134). Keep watching.
1. **Owner playtest on phone + desktop**, fix anything it surfaces. Turn on journal → "Frame rate:
   shown" (added 2026-11-20) and note the fps number in busy spots (Westminster, the City) so the
   quality presets can be tuned from real data.
2. **itch.io launch** (awaiting approval — `DECISIONS.md`).
3. **CrazyGames Basic Launch** (awaiting approval — `DECISIONS.md`). The no-external-links
   build is done (`npm run package:crazygames`).
4. **Ghost polish**: live gap to the ghost (done 2026-10-31); challenge links for the daily
   (done 2026-11-03); rope on a friend's ghost (done 2026-11-05); links for the fixed routes
   (done 2026-11-06). Nothing left here until players say otherwise.
5. **Player options**: camera speed (Slow/Normal/Fast), inverted look and sound now saved on the
   device (done 2026-11-19, needs a feel check on a real phone). Next only if players ask:
   separate horizontal/vertical speed, left-handed button layout.
6. **Link previews** (done 2026-11-21): room and challenge links pasted into chat apps now show
   a picture card with the title, public build only. Check how it looks the next time you share
   a link (WhatsApp, Discord, iMessage); some apps cache an old preview for a while.
7. **First-run polish**: daily-race card after a first tutorial (done 2026-11-01); "how races
   work" hint on the first countdown (done 2026-11-02); compass hides while the card shows
   (done 2026-11-03); R restarts a race on desktop (done 2026-11-22).
8. **Race medals** (done 2026-11-23): gold/silver/bronze targets from route length, on the finish
   card and route list. Needs a human check that gold is hard but reachable; tune `medals` in
   `src/config.ts`.

## Next

- Multiplayer race: everyone in a room races the same route. First slice done 2026-11-12:
  friends in a room see a toast with each other's race times. Second slice done 2026-11-13: a
  "Race it" card offers the same route in one tap (only when you are not racing). Third slice
  done 2026-11-14: that race shows the friend's time as a target and the finish says who won.
  Nothing more here until players use it.
- Measure real-phone frame rate (ask testers; in-game readout added 2026-11-20), tune quality presets.
- Swing feel: "nothing to swing from" hint on a missed press (done 2026-11-17, needs a look);
  anchor preview line and on-target reticle (done 2026-11-08); rope tension hum
  (done 2026-11-09, needs a listen); landing crouch/roll (done 2026-11-10, needs a look).

## Later (only if players ask for it)

- Achievements, cosmetics (scarves/colours), more cities.
- Leaderboards (needs a backend or platform SDK — owner decision).

## Not doing

- Exploitative monetisation, energy timers, loot boxes, misleading ads.

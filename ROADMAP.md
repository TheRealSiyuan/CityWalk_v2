# Roadmap

Ordered by impact on getting real players and the first revenue.

## Now (v0.9 → v1.0)

0. **Multiplayer joins**: stuck joins fixed (2026-11-04); a dropped stuck peer now triggers an
   immediate re-join (2026-11-07, unit-tested, real-browser gain not measured). Remaining: slow
   joins (50 s+) seen when 6 browsers shared a 2-core machine, in both old and new builds;
   find whether that is just load or a real slow path. Deploy now waits for e2e (2026-11-08).
1. **Owner playtest on phone + desktop**, fix anything it surfaces.
2. **itch.io launch** (awaiting approval — `DECISIONS.md`).
3. **CrazyGames Basic Launch** (awaiting approval — `DECISIONS.md`). The no-external-links
   build is done (`npm run package:crazygames`).
4. **Ghost polish**: live gap to the ghost (done 2026-10-31); challenge links for the daily
   (done 2026-11-03); rope on a friend's ghost (done 2026-11-05); links for the fixed routes
   (done 2026-11-06). Nothing left here until players say otherwise.
5. **First-run polish**: daily-race card after a first tutorial (done 2026-11-01); "how races
   work" hint on the first countdown (done 2026-11-02); compass hides while the card shows
   (done 2026-11-03).

## Next

- Multiplayer race: everyone in a room races the same route.
- Measure real-phone frame rate (ask testers), tune quality presets.
- Swing feel: anchor preview line and on-target reticle (done 2026-11-08); rope tension hum
  (done 2026-11-09, needs a listen); landing roll animation.

## Later (only if players ask for it)

- Achievements, cosmetics (scarves/colours), more cities.
- Leaderboards (needs a backend or platform SDK — owner decision).

## Not doing

- Exploitative monetisation, energy timers, loot boxes, misleading ads.

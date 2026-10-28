# Decisions

Newest first.

## 2026-10-28 — CrazyGames Basic Launch approval requested (not yet given)

**Request:** submit `release/citywalk-crazygames-0.9.0.zip` to CrazyGames Basic Launch
(free, non-exclusive, no ads or monetisation during Basic Launch; 7–21 days of KPI data).
- **Build:** solo, no external links or other-portal branding (CI-checked). No SDK yet.
- **Cost:** £0. **Terms:** CrazyGames developer terms (18.08.2025, see `MONETISATION.md`);
  auto-renewing 1-year, non-exclusive unless you opt into exclusivity later.
- **What you do:** create/sign in to a CrazyGames developer account, accept the terms, upload
  the zip with the listing copy and cover from `marketing/`. Suggested order: after itch.io.
- **Risk:** untested in CrazyGames' QA iframe; their review may request changes.

## 2026-10-26 — Daily development task scheduled

A scheduled task "CityWalk v2 daily development" runs every day at 05:45 UK time in the
cloud, bounded to ~40 minutes. It may only change this repo; it must pass build, unit and
browser tests before pushing to main (otherwise a `daily/YYYY-MM-DD` branch), and it may not
publish, pay, post, contact anyone or create accounts. It reports by push notification.
Pause or delete it from your scheduled tasks list at any time.

## 2026-10-26 — Launch approval requested (not yet given)

**Request:** publish **CityWalk v0.9.0** on **itch.io** as a free HTML5 game with optional
payments ("pay what you want", minimum £0).

- **Listing:** `therealsiyuan.itch.io/citywalk` (exact URL depends on your itch.io account
  name), copy in `marketing/LISTING.md`, files `release/citywalk-itch-0.9.0.zip`, cover
  `marketing/cover-630x500.png`, screenshots in `marketing/screenshots/`.
- **Monetisation:** optional payments, suggested £3. itch.io share left at the 10% default.
  Payment mode: "Collected by itch.io, paid later" (itch.io is merchant of record and handles
  VAT; payouts to PayPal or Payoneer after a tax interview).
- **Cost:** £0 to list. Per payment: 10% itch.io + $0.30 + 2.9% processing; one-time $3 tax
  verification; possible payout transfer fees.
- **Material terms:** no exclusivity; you can unpublish any time; itch.io reviews payouts.
- **Risks:** low traffic is likely without promotion; multiplayer reveals IP addresses to
  other players in a room (standard for peer-to-peer); untested on real phones.
- **What you do:** create/sign in to itch.io, upload the zip (or approve me guiding you
  through it), complete the payout + tax setup when the first payment arrives.

## 2026-10-26 — Platform order

itch.io first (fastest, no exclusivity, platform handles payments), then CrazyGames Basic
Launch for KPIs, Full Launch ads only if selected. Poki deferred (prefers 5-year web
exclusivity). Reasons and sources: `MONETISATION.md`.

## 2026-10-26 — Holding Swing chains automatically

Beginners hold one button; experts release early for more distance. Measured with bots:
hold-only travel went from 27 m to ~320 m in 30 s.

## 2026-10-04 — Stylised London, physics surface = rendered surface

See README "How it is built".

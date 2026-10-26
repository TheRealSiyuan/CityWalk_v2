# Monetisation — verified platform terms

All terms below were read from the platforms' own pages on **2026-10-26**. Re-check before
acting; terms change.

## itch.io (recommended first channel)

- **Revenue share:** seller chooses itch.io's cut, **0–100%, default 10%**
  ([payments doc](https://itch.io/docs/creators/payments)).
- **Free game with optional payment:** set a minimum price of **0** and buyers can pay what
  they like ([creator FAQ](https://itch.io/docs/creators/faq)).
- **Payment modes:** "Direct to you" (your own PayPal/Stripe, you are merchant of record) or
  "Collected by itch.io, paid later" (itch.io is merchant of record; payouts to PayPal or
  Payoneer). Earnings must be **≥ 7 days old** before payout; payouts are manually reviewed.
- **Fees:** PayPal/Stripe **$0.30 + 2.9%** per transaction; one-time **$3** tax verification
  fee; payout transfer fees may apply. itch.io's example: a **$10 sale nets $8.41** at 10%.
  It recommends a **$2 minimum** for paid items because of the fixed fee.
- **Tax:** a tax interview is required before payouts; without a TIN, **30% default
  withholding** (treaty reductions may apply to UK residents).
- **HTML5:** ZIP with `index.html`, ≤ 500 MB extracted, ≤ 1,000 files, relative paths, HTTPS
  for external requests ([HTML5 doc](https://itch.io/docs/creators/html5)). Our zip: 2 files, ~200 kB.
- **Exclusivity:** none.

## CrazyGames (second channel: advertising)

- **Basic Launch:** SDK optional, **monetisation disabled**, no external ads
  ([requirements](https://docs.crazygames.com/requirements/intro/)). Lasts **7–21 days**; ends
  after 7 days and 500 plays, or 21 days. KPIs watched: average play time (successful titles
  often 10+ min), day-1 retention (strong: 10–15%), conversion (top: 80%+, load < 10 s,
  build < 20 MB) ([Basic Launch guide](https://docs.crazygames.com/resources/basic-launch-metrics/)).
- **Full Launch** (by selection): SDK required; ads only via the SDK.
- **Pay:** the [developer terms (18.08.2025)](https://files.crazygames.com/documents/developer_terms_20250818.pdf)
  set **no fixed percentage**: compensation is calculated monthly from traffic and ad
  performance, only in Full Launch. **€100 minimum** before payment; invoices paid in 30 days.
- **Exclusivity:** non-exclusive by default. Optional 2-month browser exclusivity after Full
  Launch raises compensation **+50%** for those 2 months and bars other browser portals.
- **Restrictions:** no other portal's branding, no non-SDK ads, no promoting other sites
  without consent; can remove a game at any time; auto-renewing 1-year term.
- **Implication for us:** a CrazyGames build must hide the Share link to GitHub Pages and
  any itch.io branding. Full Launch needs SDK work (ads, account/username, invite links).

## Poki (not now)

- Prefers **web-exclusive** deals (default 5-year term, covering the open web, Discord and
  YouTube Playables); non-exclusive deals are a one-time flat fee with no revenue share
  ([deal types](https://developers.poki.com/guide/revenue-deal-types)).
- Conflicts with an itch.io + CrazyGames plan. Revisit only if a Poki deal is offered.

## Order of play

1. **itch.io, free with optional payment** — fastest route to the first £1, no exclusivity,
   no code changes, itch.io handles payment and VAT as merchant of record.
2. **CrazyGames Basic Launch** — free exposure and real KPIs (play time, retention). Needs
   a no-external-links build variant.
3. **CrazyGames Full Launch + SDK ads** — only if selected.
4. Cosmetics / supporter perks — only once there are repeat players asking for them.

No direct payment infrastructure is planned: the platforms handle payments more safely.

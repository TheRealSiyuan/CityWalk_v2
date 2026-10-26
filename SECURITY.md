# Security & privacy

## What the game collects

- **No accounts, no analytics, no third-party trackers, no cookies.**
- `localStorage` on the player's own device: found landmarks, best race times, name tag,
  tutorial-seen flag. Never sent anywhere.

## Multiplayer (please read before promoting it)

- Peers find each other through **public Nostr relays** (via Trystero) and then connect
  **directly over WebRTC**. Like any peer-to-peer game, players in the same room can see
  each other's **IP address**. The relays see an opaque room topic.
- Anyone with a room link can join that room. Names are self-chosen, filtered to letters,
  numbers, spaces, `_` and `-`, max 14 characters. There is no text chat.
- If WebRTC is blocked, the game silently plays solo.

## Repository hygiene

- No secrets, tokens or credentials are committed. The deploy workflow uses GitHub's
  built-in Pages token only.
- `release/` and build outputs are git-ignored.

## Before enabling anything new

Any analytics, payments, ads SDK or account system needs an owner decision and a privacy
review first (see `DECISIONS.md`).

# F10 Racing Product Summary

F10 Racing is a Formula 1 fantasy pick'em app for web and iOS.

Users can browse races as guests, make local guest picks, sign in with Apple or web auth, submit server-backed picks, compete on global and friends leaderboards, and view public profiles.

Each race pick set has three slots:
- P10 finisher
- race winner
- DNF driver

The app supports main races and sprint races. Picks lock from the server-provided `lockCutoffUtc`; server writes are authoritative, and locked picks are protected by app, snapshot, and database-trigger layers.

Current architecture, API surface, and platform constraints are maintained in [`../ai/docs/architecture.md`](../ai/docs/architecture.md). Detailed scoring rules are maintained in [`scoring-rules.md`](scoring-rules.md).

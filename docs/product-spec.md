# F10 Racing — Product Specification

## Overview

F10 Racing is a Formula 1 prediction game with a twist: the most important prediction is **who finishes 10th**, the last points-paying position in F1. Users make three predictions per race weekend, score points based on accuracy, and compete on global and friends leaderboards across the season.

---

## Core Concept

Each race, a user submits one pick set containing:
1. **10th place** — who will finish P10
2. **Race winner** — who will finish P1
3. **DNF** — who will not finish the race

Points are awarded automatically once official results are confirmed.

The app rewards knowledge of the midfield, not just the front-runners — making F10 more interesting and skillful than typical winner-picking fantasy games.

---

## User Flows

### Registration / First Login
1. User opens app → taps "Sign in with Google" (or Apple)
2. Auth completes → system checks if user record exists
3. If new: auto-generate unique public username (e.g. `BlueFalcon27`) + create user profile
4. Redirect to My Picks tab for current/next race

### Making Picks
1. User is on My Picks tab → current race is preselected
2. User taps to select 10th place driver, winner driver, DNF driver
3. Each selection shows driver name, number, team color
4. User taps "Save Picks" → picks saved as draft (editable)
5. Before lock cutoff: user may change picks freely
6. At lock cutoff: picks freeze, UI shows "Picks Locked" state
7. If user tries to submit after cutoff: server rejects with 423 Locked

### Race Weekend Progression
- **Before race**: picks form open, countdown to lock displayed
- **Lock cutoff hit** (server-side): picks immutable
- **Race live** (if live data): live race order shown, user's picks highlighted
- **Race complete**: results confirmed, scores computed, breakdown shown

### Viewing Results
1. User opens My Picks → selects completed race
2. See: their picks | actual results | per-category score | total score
3. Hero visual shows three bubbles: P10 | Winner | DNF with pick vs actual

### Leaderboard
1. Tab shows Global (Top 20) by default
2. Toggle: Global / Friends
3. Toggle: Season total / Last race
4. User's own rank always visible if outside Top 20
5. Tap any user row → see their pick summary for each race (display only)

### Friend System
1. User taps "Add Friend" → search by public username
2. Send friend request → addressee gets notification (or sees pending in app)
3. Accept/decline → if accepted, both appear in each other's Friends leaderboard
4. Friends leaderboard shows only mutually accepted friends

---

## Information Architecture

```
App
├── Header (app name, settings icon)
└── Tab Bar
    ├── Leaderboard Tab
    │   ├── Scope Toggle: Global / Friends
    │   ├── Sort Toggle: Season / Last Race
    │   ├── Leaderboard List (rank, avatar, name, score)
    │   ├── My Rank Row (pinned if outside top 20)
    │   └── Friend Search / Add Friend
    └── My Picks Tab
        ├── Race Selector (current race preselected)
        ├── Hero Visualization (P10 / Winner / DNF bubbles)
        ├── Pick Form (pre-lock) or Picks + Results (post-race)
        ├── Lock Countdown (pre-lock)
        └── Score Breakdown (post-race)
```

---

## Non-Negotiable System Rules

1. **One pick set per user per race** — enforced at DB level (unique constraint) and API level
2. **Normalized race data** — no raw provider format in business logic; internal model always
3. **Locked picks with timestamps** — `createdAt`, `updatedAt`, `lockedAt`; lock is server-side
4. **Deterministic score recalculation** — any score can be re-derived from locked picks + official results

---

## Visual Style

- Premium minimal, mobile-first
- Rounded cards and pills
- Segmented control toggles
- Subtle glass / translucent surfaces
- Soft shadows, generous whitespace
- Strong typography hierarchy
- Team/constructor accent colors where applicable
- Apple-inspired polish, zero gaming clutter

---

## Hero Race Visualization

Signature component at top of My Picks:
- Three prominent bubbles: P10 | Winner | DNF
- Inside each: driver headshot (or initials), team color ring, driver code
- Below each: smaller bubble showing user's pick for that slot
- Pre-race: user's pick only (no actual yet)
- Live: live position updating in real-time (or polling)
- Post-race: side-by-side pick vs result with visual match/miss indication

---

## Assumptions

1. F1 season = calendar year (2025, 2026…)
2. Race weekend = one main race only (sprint weekend scoring TBD, excluded from MVP)
3. Lock cutoff = 5 minutes before official scheduled race start (configurable per race)
4. App is web-first (PWA-ready), native app not in scope for MVP
5. DNS (did not start) drivers are NOT eligible DNF picks — excluded from pick options
6. DSQ (disqualified) counts as classified for pick resolution (driver crossed the line)
7. Non-classified (NC) drivers who were running but lapped — treated as classified at their stated position
8. Live scoring is best-effort; only finalized results produce official scores
9. No sprint races, qualifying, or practice prediction in MVP
10. No private leagues or invitation system in MVP (global + friends only)

# F10 Racing — MVP Roadmap

## Phase 1 — Discovery / Planning ✅
- Product specification
- Scoring formula
- Architecture document
- Database schema
- Service boundary definitions
- API abstraction strategy

---

## Phase 2 — Project Scaffolding

### Goals
Stand up the skeleton. Everything compiles, routes exist, DB connects.

### Tasks
- [ ] Clean repo: remove obsolete source, reset to baseline Next.js
- [ ] Install dependencies: Prisma, Auth.js, Tailwind, CVA
- [ ] Configure tsconfig strict mode
- [ ] Prisma schema with all entities
- [ ] .env.example with all required variables
- [ ] Core domain TypeScript types (domain.ts)
- [ ] F1 provider adapter interface + Jolpica skeleton
- [ ] Scoring formula module (pure functions)
- [ ] Pick lock service
- [ ] Route handler stubs (picks, leaderboard, friends, admin/cron)
- [ ] App layout shell with tab navigation
- [ ] Design system tokens (colors, spacing, type scale)
- [ ] Primitive UI components (Button, Card, Badge, Avatar, Toggle)

---

## Phase 3 — MVP Implementation

### Goals
Full working app. User can sign in, make picks, see results, see leaderboard.

### Tasks
- [ ] Auth: Google sign-in via Auth.js
- [ ] User creation + auto-generated public username on first login
- [ ] Race schedule sync (Jolpica adapter + cron job)
- [ ] Race entry / driver lineup sync
- [ ] My Picks tab: driver selection form
- [ ] Pick save / edit (pre-lock)
- [ ] Lock cutoff enforcement (server-side rejection + cron lock job)
- [ ] Final results ingestion pathway
- [ ] Score computation engine (wired to real DB)
- [ ] Score breakdown display post-race
- [ ] Global leaderboard (season + last race)
- [ ] Friends leaderboard (season + last race)
- [ ] Friend search + request/accept
- [ ] Hero visualization component (bubbles)
- [ ] Race status states (upcoming / live / completed)
- [ ] My rank pinned row in leaderboard

---

## Phase 4 — Polish

### Goals
Production-quality UX. Smooth states, tested core logic, live-race-ready.

### Tasks
- [ ] Loading skeletons for leaderboard, picks
- [ ] Empty states (no picks yet, no friends, no races)
- [ ] Lock countdown timer (animated)
- [ ] Transition animations (page, tab, pick selection)
- [ ] Live race data polling + live classification display
- [ ] Error boundaries + user-facing error messages
- [ ] Unit tests: scoring formula (all edge cases)
- [ ] Unit tests: lock service
- [ ] Integration tests: pick create/update/lock flow
- [ ] Apple sign-in addition to auth
- [ ] PWA manifest + service worker (offline shell)
- [ ] Vercel Analytics setup

---

## Milestone Summary

| Milestone      | Outcome                                                     |
|----------------|-------------------------------------------------------------|
| Phase 1 done   | Architecture decided, no ambiguity before coding            |
| Phase 2 done   | Repo compiles, DB schema ready, skeleton routes exist       |
| Phase 3 done   | Fully functional MVP: picks → scores → leaderboard         |
| Phase 4 done   | Production-ready: tested, polished, live-race-ready         |

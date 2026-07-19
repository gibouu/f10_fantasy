# FX Racing release-polish handoff memory

> Before making changes in this repository, read this entire file, then read `AGENTS.md` and the current open GitHub issues. Verify all statements against the current repository and GitHub state because this document is a handoff record, not an infallible source of truth.

Last updated: 2026-07-19T18:08:02Z

## Project purpose

FX Racing is an F1 fantasy app. The core gameplay is intentionally simple: users pick P1, P10, and DNF before qualifying/race lock, receive bonus/scoring based on those picks, and compare rankings. The current product priority is a cleaner, faster iOS experience with Apple Sports-style race cards, reliable autosave, safe account/device pick recovery, accessible Dynamic Type layouts, and release-ready App Store/landing-page assets.

Primary journeys:

- Browse upcoming/past races and rankings.
- Pick exactly three drivers: P1, P10, DNF.
- Autosave picks locally first, then sync safely to the account/server.
- Review driver season form and race-by-race results.
- Use the static website as an App Store landing page.

## Current repository state

- Repository: `gibouu/f10_fantasy`
- Default branch: `main`
- Active branch: `feat/367-ios-autosave-release-polish`
- Active branch: verify exact current HEAD with `git rev-parse HEAD` before starting; committed handoff milestones are listed below.
- Remote: `https://github.com/gibouu/f10_fantasy.git`
- Upstream: `origin/feat/367-ios-autosave-release-polish`
- Draft PR: #373 — `Polish FX Racing iOS autosave and release handoff`
- Onboarding issue: #374 — `Start here: FX Racing release handoff and repository state`
- Umbrella issue: #367

Important worktrees observed:

- `/Users/gibou/code/github/f10_fantasy` — primary checkout, dirty and unrelated; do not touch without explicit approval.
- `/Users/gibou/code/github/f10_fantasy/.worktrees/feat-367-ios-autosave-release-polish` — active handoff branch.
- `/Users/gibou/code/github/f10_fantasy/.worktrees/feat-360-ios-race-deck-performance` — clean related historical worktree.
- `/Users/gibou/code/github/f10_fantasy/.worktrees/fix-313-privacy-manifest` — dirty unrelated privacy-manifest work; do not touch without explicit approval.

Existing stash observed:

- `stash@{0}: WIP on feat/sprint-round-label-suffix: 850c754 ui: append 'S' to sprint round labels on web (closes #29)` — unrelated; do not apply/drop without explicit approval.

Deployment/release state:

- PR #373 is intentionally draft.
- PR #373 checks observed: Web checks success, Vercel success, Vercel Preview Comments success.
- No App Store submission has been performed.
- No screenshots or builds have been uploaded for release.
- No signing identities, certificates, or provisioning profiles were changed during handoff.

## Architecture

- Frontend/web: Next.js App Router under `src/app`.
- Landing website: `src/app/page.tsx` and `src/app/site.module.css`.
- Backend/API: Next.js route handlers under `src/app/api`, service code under `src/lib/services`.
- Database: Prisma/Supabase; DB access must go through `scripts/db` per `AGENTS.md` and `docs/DATABASE_ACCESS.md`.
- Native iOS app: SwiftUI/XCTest under `ios/FXRacing`, `ios/FXRacingTests`, and `ios/FXRacingUITests`.
- iOS project generation: `ios/project.yml` via XcodeGen.
- Auth/account sync: native auth/session code plus server endpoints; guest mode must remain supported.
- Storage: local pick storage/cache in iOS, server persistence through API routes.
- External services: GitHub, Vercel, Supabase, Apple App Store Connect/Xcode signing.

Important commands:

```bash
npm run test:ios
npm run test:services
npm run test:routes
npm run test:pages
npm run test:components
npm run test:scripts:static
npx tsc --noEmit
npm run lint
npm run build
xcodegen generate --spec ios/project.yml
git diff --check
```

## Completed work

Grouped milestones on `feat/367-ios-autosave-release-polish`:

- Task 1 — season form/history contract.
  - Commits include `3acd2ee`, `4c13ee5`.
  - Added cached driver form history and response bounds coverage.
- Task 2 — native driver form sheet.
  - Commits include `d667143`, `9a26727`.
  - Presented cached driver race history in iOS.
- Task 3 — local-first autosave foundation.
  - Commits include `3653c66`, `de8d670`, `066094c`.
  - Added atomic recovery/autosave foundations and authority defaults.
- Task 4 — autosave status clarity.
  - Commits include `305bfee`, `da26378`, `6495d5a`.
  - Added complete pick revision autosave and status review fixes.
- Task 5A/5B — legacy/device recovery and safety hardening.
  - Commits include `ba5990c`, `905ab7d`, `3e7f1c2`, `bd323d4`, `64f4f94`, `0e1ef0a`.
  - Recovery actions are session/authority/fingerprint guarded.
- Task 5C — saved-pick integrity through metadata refresh.
  - Commit `03ad7e0`.
  - Preserves saved picks when driver metadata is temporarily unavailable.
- Task 6 — stable card geometry and Schedule centering.
  - Commits include `ed344cb`, `41137ca`.
- Task 6A — accessibility layout hardening and footer clipping fix.
  - `62d36c5c959ccdd185115fa179e6be3877bd4570` — `Harden race card accessibility layout`
  - `41ec84043b76cea3e7b1afe7c63d3816fabf09c8` — `Fix accessibility race-card footer clipping`
  - Automated checks are green, but simulator/manual verification remains pending.
- Handoff preservation.
  - `d2fab3ce8184ac76af163b7f1b2d7453810b1e02` — `Add FX Racing handoff memory`
  - `d44f0bf93d1abbcb5bebb6cfe5ea5fe532b45b63` — `Update FX Racing handoff instructions`
  - `921c75e` — `Record latest handoff commit`

## Decisions and rationale

- Autosave remains local-first: local persistence must happen before picker dismissal or remote sync.
- Saved picks must never disappear solely because driver metadata is temporarily unavailable.
- Metadata refreshes must not mutate/invalidate persisted selections.
- UI presentation and persistence stay decoupled.
- Do not reintroduce card-level `Review device picks` without an approved spec.
- Task 6A uses an accessibility-specific layout path instead of squeezing content into normal card height.
- App Store/release work remains gated by native simulator/manual verification.
- Unrelated dirty worktrees/stashes must be preserved and not cleaned/reset/stashed by future agents.

## Verification status

Recorded Task 6A automated verification:

```bash
node --test ios/accessibility-race-card-layout.test.mjs  # 5/5 passed
npm run test:ios                                        # 113/113 passed
xcodebuild ... generic/platform=iOS Simulator build-for-testing  # passed when run outside restricted sandbox
xcodegen generate --spec ios/project.yml                # no project drift
git diff --check                                        # clean
```

PR #373 checks observed on 2026-07-19:

- Web checks: success.
- Vercel: success.
- Vercel Preview Comments: success.
- Merge state observed: clean.

Still mandatory before claiming Task 6A fully verified:

- focused Task 6A UI regression:
  - `FXRacingUITests/MainShellUITests/testAccessibilitySizeRaceCardKeepsCriticalContentVisibleAndOrdered`
- broader `MainShellUITests` slice
- four-state manual inspection:
  - normal Dynamic Type, dark
  - normal Dynamic Type, light
  - `accessibility-extra-extra-extra-large`, dark
  - `accessibility-extra-extra-extra-large`, light
- screenshots for all four states

Known blocker evidence:

```text
CoreSimulatorService connection became invalid
simdiskimaged crashed or is not responding
Unable to locate device set
Connection refused
```

Known simulator device:

```text
9184C625-91BA-4DB0-B467-3D364F2554B5
```

## Known issues and unfinished work

- #374 — onboarding and continuation guide.
  - Status: open.
  - Purpose: first issue future agents should read.
- #368 — Task 6A simulator verification.
  - Status: open, release gate.
  - Matters because accessibility layout cannot be called fully verified until native UI/manual checks pass.
- #369 — Task 7 static landing cleanup and screenshot validator.
  - Status: open.
  - This is the only explicitly separable non-simulator slice if #368 remains blocked.
- #370 — Task 8 full verification and visual feedback loop.
  - Status: open, depends on #368.
- #372 — Task 9 release identifiers, screenshots, and landing assets.
  - Status: open, depends on #368/#370 and owner/App Store access.
- #371 — Task 10 PR merge, deployment, upload, and App Store submission.
  - Status: open, final release step; do last.
- #365 — align iOS DNF tutorial copy with scoring behavior.
  - Status: pre-existing open issue, not part of this handoff branch unless explicitly scoped.
- #362 — optimistic concurrency for cross-device pick edits.
  - Status: pre-existing open issue, separate from current branch.
- #361 — public race API / production TTFB optimization.
  - Status: pre-existing open issue, separate from current branch.

## Operational knowledge

Required services/tools:

- Node/npm.
- Xcode 26.6 observed during this work.
- XcodeGen.
- GitHub CLI.
- Vercel.
- Supabase through `scripts/db` only.
- Apple App Store Connect/Xcode signing only with owner credentials and explicit approval.

Environment variables and secrets:

- Do not print or commit secret values.
- DB credentials live outside the repo per `AGENTS.md`.
- Apple credentials/2FA must be entered by the owner only.

Safe recovery guidance:

- Prefer read-only process and repository inspection first.
- Do not delete simulator devices/runtimes/caches without explicit approval.
- Do not force-push, reset, clean, or apply/drop stashes without explicit approval.

## External dependencies and blockers

- CoreSimulator/simdiskimaged health is required for #368 and later native visual/performance verification.
- App Store Connect access, legal agreements, content rights, screenshots, and owner approval are required before release/upload/submission.
- Vercel/GitHub CI must pass before PR merge.
- Supabase/database access must use the documented CLI entrypoint only.

## Recommended continuation order

1. Read #374, this file, `AGENTS.md`, the implementation plan, SDD progress, and #368–#372.
2. Confirm branch/HEAD and PR #373 checks.
3. Complete #368 if CoreSimulator is usable.
4. If simulator remains blocked and owner approves non-simulator work, complete #369 only.
5. Complete #370 after #368.
6. Complete #372 after #370 and owner/App Store/screenshot prerequisites.
7. Complete #371 last.
8. Keep PR #373 draft until required verification and CI pass.
9. Update this file and related GitHub issues after every material state change.

## Explicit prohibitions until separately authorized

- Do not merge PR #373.
- Do not mark PR #373 ready for review.
- Do not submit to App Store.
- Do not upload screenshots or builds.
- Do not change signing identities, certificates, or provisioning profiles.
- Do not accept Apple legal agreements for the owner.
- Do not expose credentials, secrets, tokens, or 2FA.
- Do not touch the unrelated dirty primary checkout or privacy-manifest worktree.
- Do not apply/drop the unrelated stash.

## Last updated

- UTC timestamp: 2026-07-19T18:08:02Z
- Branch: `feat/367-ios-autosave-release-polish`
- Commit SHA: verify exact current HEAD with `git rev-parse HEAD`; this file records stable task/handoff milestones, not an infallible live branch pointer.
- Authoring environment: Codex desktop session

# FX Racing release-polish handoff memory

> Before making changes in this repository, read this entire file, then read `AGENTS.md` and the current open GitHub issues. Verify all statements against the current repository and GitHub state because this document is a handoff record, not an infallible source of truth.

Last updated: 2026-07-27

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
- Active branch: none. All release work has landed; `main` is the only branch,
  local and remote. Verify with `git branch -a` and `git rev-parse HEAD`.
- Remote: `https://github.com/gibouu/f10_fantasy.git`
- Open PRs: none.
- Open issues: none.

The whole `#367` release train (`#368`–`#374`) is closed, as are the follow-up
issues `#390`, `#396`, `#398`, `#404`, `#409`–`#413`. Historical detail below is
kept as a record of *why* the code looks the way it does; do not treat any of it
as outstanding work.

Worktrees:

- `/Users/gibou/code/github/f10_fantasy` — the only checkout, clean, on `main`.
- All `.worktrees/*` entries were removed on 2026-07-27 after their branches
  merged. Earlier revisions of this file told agents to preserve
  `.worktrees/fix-313-privacy-manifest`; that protection is now obsolete —
  `#313` is closed and its content shipped in a better form on `main`
  (`ios/FXRacing/PrivacyInfo.xcprivacy` plus `ios/privacy-manifest.test.mjs`).

Existing stash observed:

- `stash@{0}: WIP on feat/sprint-round-label-suffix: 850c754 ui: append 'S' to sprint round labels on web (closes #29)` — unrelated; do not apply/drop without explicit approval. Still present and untouched.

Deployment/release state:

- Version 1.8.0, build 45 (`ios/project.yml`).
- `ios/ExportOptions.plist` and `docs/release/app-store-release.md` exist; the
  runbook is the entry point for a release.
- A 1.8.0 (45) archive was built on 2026-07-26 and deleted on 2026-07-27 at the
  owner's request — it predated `#412`/`#414`/`#415`. The owner re-archives from
  Xcode himself; do not build the shipping archive for him.
- No App Store submission has been performed.
- No screenshots or builds have been uploaded for release.
- No signing identities, certificates, or provisioning profiles have been changed.

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

Grouped milestones, all merged into `main` (the branch and its worktree are
gone; the SHAs below are pre-squash and will not resolve):

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
- Unrelated stashes must be preserved and not applied/dropped by future agents.

## Verification status

Full sweep on `main` at `67c5bdc` (owner's Mac, 2026-07-27):

```bash
npm run test:ios        # 126/126 passed
# all ten web suites    # 219/219 passed, 0 failures
npx tsc --noEmit        # clean
npm run lint            # no ESLint warnings or errors
npm run build           # succeeded
xcodebuild -configuration Release -destination 'generic/platform=iOS'  # BUILD SUCCEEDED
```

GitHub Actions on `67c5bdc`: `iOS` success, `Verify` success.

The `iOS` workflow (`.github/workflows/ios.yml`) now runs `xcodebuild` on any
`ios/**` change. It exists because `APIEndpoint.submitPick` once reached `main`
missing an explicit `return` — the app did not compile and nothing caught it.
It pins `xcode-version: latest-stable`; `glassEffect` needs the iOS 26 SDK to
*compile*, so an older Xcode fails the build.

### Historical — Task 6A automated verification

```bash
node --test ios/accessibility-race-card-layout.test.mjs  # 5/5 passed
npm run test:ios                                        # 113/113 passed
xcodebuild ... generic/platform=iOS Simulator build-for-testing  # passed when run outside restricted sandbox
xcodegen generate --spec ios/project.yml                # no project drift
git diff --check                                        # clean
```

The Task 6A gates listed here (the focused `MainShellUITests` regression, the
`MainShellUITests` slice, and four-state Dynamic Type inspection in both
appearances) were completed on 2026-07-26. `#368` is closed. The
`CoreSimulatorService`/`simdiskimaged` blocker recorded earlier was specific to
a cloud box and does not reproduce on the owner's Mac.

## Known issues and unfinished work

Nothing is open. Everything below is a closed record.

- #374 — onboarding and continuation guide.
  - Status: CLOSED. This file supersedes it.
- #368 — Task 6A simulator verification.
  - Status: CLOSED 2026-07-26. All gates passed on the owner's Mac.
- #369 — Task 7 static landing cleanup and screenshot validator.
  - Status: CLOSED 2026-07-25 by PR #382. Do not treat as remaining work.
- #370 — Task 8 full verification and visual feedback loop.
  - Status: CLOSED. All seven enforced performance gates pass; see
    `ios/CLAUDE.md` for the gate values and `scripts/ios-performance`.
- #372 — Task 9 release identifiers, screenshots, and landing assets.
  - Status: CLOSED at the owner's request; he handles the remaining
    landing/App Store Connect assets himself.
- #371 — Task 10 PR merge, deployment, upload, and App Store submission.
  - Status: CLOSED at the owner's request; owner-only from the archive onward.
- #365 — align iOS DNF tutorial copy with scoring behavior.
  - Status: CLOSED. Landed on `main`. Note the fix originally lived in
    `RacePickPanel.swift`, which this branch deletes; the copy now lives in
    `RaceDetailViewModel.slotDescription` and is guarded by
    `ios/dnf-tutorial-copy.test.mjs`.
- #362 — optimistic concurrency for cross-device pick edits.
  - Status: CLOSED. Landed on `main` via PR #385 and merged into this branch.
- #361 — public race API / production TTFB optimization.
  - Status: CLOSED. The caveat recorded earlier was real and has been acted on:
    `revalidatePublicRaceCache()` had nothing registered to purge, so it was
    removed rather than left as a misleading no-op. `src/lib/api/public-race-cache.ts`
    now emits the correct `Vercel-Cache-Tag` header (not `Cache-Tag`) and
    exposes `stalePublicRaceCacheTags()` for cron logging. Public race caching
    is CDN-TTL-based by design; do not reintroduce `revalidateTag` without
    registering cache entries first.
  - `vercel.json` pins `"regions": ["lhr1"]` to sit next to Supabase in
    `eu-west-2`. Moving it back to `iad1` costs ~28x on DB round trips.
    Guarded by `scripts/vercel-region.test.mjs`.
- #377 — activate current-year season when sync-schedule finds it inactive.
  - Status: CLOSED 2026-07-26. Was already fixed on `main` by PR #384.
- #390 — guests could not read the global leaderboard.
  - Status: CLOSED via PR #391. `/api/leaderboard` was missing from
    `isPublicApiRoute()`, so guest GETs were redirected to `/signin` and the app
    decoded HTML as JSON. Guarded by `ios/leaderboard-guest-access.test.mjs`.
    Any new public GET route must be added to `isPublicApiRoute()`.
- #396 — the iOS app did not compile on `main`.
  - Status: CLOSED. `APIEndpoint.submitPick` was missing an explicit `return`;
    Swift drops the implicit single-expression return once another statement
    precedes it. `.github/workflows/ios.yml` exists so this cannot recur.
- #404 / #398 — race deck and ranking-row interaction defects.
  - Status: CLOSED. Two lessons worth keeping:
    `Button` + `.buttonStyle(.plain)` wrapped around a custom label did not
    deliver taps in the rankings `List`; the rows now use `.contentShape` +
    `.onTapGesture` with explicit `.isButton` traits. And a `LazyVStack` will
    not instantiate an off-screen child, so the `FX_PERF_HARNESS` readiness
    marker must stay *above* tall content like the season-form table.
- #410 / #413 — light-mode contrast.
  - Status: CLOSED via PRs #412 and #414. `FXTheme.Colors.warning`, `.success`,
    and `.gold` are adaptive `UIColor { traits in ... }` values; system `.green`
    and raw `#FFCC00` sit at ~1.9:1 and ~1.4:1 on white and are not usable as
    status colours. `FXCardSurfaceModifier` uses `surfaceElevated` + `clipShape`
    + a `FXTheme.cardBorder(isSelected:)` overlay. Do not reintroduce a
    gradient-edged card surface.
- #411 — Me picks history redesign.
  - Status: CLOSED via PR #415. `ProfileView` renders a season ledger: one row
    per race (round, name, three outcome dots, points), drivers on tap. The old
    per-race `Section` + `slotCell` layout is gone.

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

- App Store Connect access, legal agreements, content rights, screenshots, and owner approval are required before release/upload/submission.
- Vercel/GitHub CI must pass before PR merge.
- Supabase/database access must use the documented CLI entrypoint only.

## Verification performed on 2026-07-26 (owner's Mac, Xcode 26.6)

CoreSimulator is healthy on this machine — the #368 host blocker was specific
to the earlier cloud box, not to the code. From this branch after merging
`origin/main`:

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean.
- All ten `npm run test:*` suites — 327 tests, 0 failures.
- `xcodebuild` Release build for iOS Simulator — BUILD SUCCEEDED.
- `MainShellUITests/testAccessibilitySizeRaceCardKeepsCriticalContentVisibleAndOrdered`
  — passed on iPhone 17 Pro Max.
- Release build installed and driven against production; App Store screenshots
  captured and `npm run validate:app-store-screenshots` passes.

Two defects the `origin/main` merge surfaced, both fixed here:

- `APIEndpoint.submitPick` was missing an explicit `return`, so **the iOS app
  did not compile on `main`**. CI never runs `xcodebuild`, so nothing caught it.
- The #365 DNF copy fix lived in a file this branch deletes; reapplied at the
  copy's new home.

## Simulator and device

The owner keeps exactly one simulator, **iPhone 17 Pro Max**, whose native
1320x2868 is exactly the 6.9-inch App Store size. iPhone 17 Pro and a
temporary iPhone 16 Plus were deleted on 2026-07-26 at the owner's request to
reclaim disk. Do not assume any other device exists; older plan documents that
name "iPhone 17 Pro" are historical.

Simulators are shared across the owner's other projects, so a stock device name
will collide. Always go through `scripts/ios-sim` (doctor/boot/fresh/run/udid),
which pins "FX Racing 17 Pro Max" by UDID.

Physical device: IPHG, `00008130-001E318020FA8D3A` (build destination),
`AD325C50-2819-5D71-9F26-2A7CCDE06102` (`devicectl` identifier). If an install
hangs, restart `CoreDeviceService` — do not `kill -9` the install, which wedges
the channel.

## Recommended continuation order

There is no in-flight work. For a new task: read `AGENTS.md`, this file, and
`ios/CLAUDE.md` if the change is native, then open only the files you need.

For a release, follow `docs/release/app-store-release.md`. The owner archives
and submits from Xcode himself.

## Standing constraints

- Do not submit to App Store — the owner does the App Store Connect side.
- Do not upload screenshots or builds.
- Do not build the shipping archive; the owner archives from Xcode.
- Do not change signing identities, certificates, or provisioning profiles.
- Do not accept Apple legal agreements for the owner.
- Do not expose credentials, secrets, tokens, or 2FA.
- Do not apply/drop the unrelated stash.
- Do not force-push, reset, or clean without explicit approval.
- Do not delete simulator devices/runtimes without explicit approval.

## Last updated

- Date: 2026-07-27
- Branch: `main` (only branch)
- Commit SHA: verify with `git rev-parse HEAD`; this file records stable
  handoff state, not a live branch pointer.

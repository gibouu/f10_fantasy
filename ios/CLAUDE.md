# FX Racing iOS — Engineering Memory

## Product invariant

The native app is intentionally simple: for each race, a player chooses P1, P10, and the first DNF, saves the three picks, and later sees the official score/ranking. UI work must not change that gameplay or the shared backend scoring rules.

## Stack and project generation

- Swift 6, SwiftUI, Observation, iOS 17+
- iOS 26 Liquid Glass is optional and isolated behind `FXGlassSurface`; content cards remain readable on older systems and accessibility settings
- `ios/project.yml` is the XcodeGen source of truth; regenerate the project after adding/removing source files
- App API: `Config.apiBaseURL` (localhost in Debug, production in Release)
- Auth: Sign in with Apple → mobile exchange endpoint → Bearer JWT in Keychain
- Native XCTest/XCUITest targets live in `FXRacingTests` and `FXRacingUITests`; Node source-contract tests live under `ios/*.test.mjs`

## Current app structure

```text
ios/FXRacing/
├── FXRacingApp.swift
├── RootView.swift
├── Core/
│   ├── Auth/                 AuthManager + Keychain token lifecycle
│   ├── Images/               one injected FXImagePipeline
│   ├── Networking/           APIClient + endpoints/errors
│   ├── Performance/          points-of-interest signposts
│   ├── Races/                RaceRepository + disk snapshots
│   ├── Storage/              owner-scoped LocalPickStore + guest/tutorial stores
│   └── Sync/                 revision-safe SyncManager worker
├── DesignSystem/
│   ├── FXTheme.swift
│   ├── FXGlassSurface.swift
│   ├── FXRemoteImage.swift
│   └── shared bubbles, banners, haptics, skeletons
├── Features/
│   ├── Home/                 persistent MainShellView + section picker
│   ├── Races/                swipe decks, cards, sheets, results, pick panel
│   ├── Rankings/
│   └── Profile/
└── Performance/              compile-time-only deterministic fixtures
```

## Shell and race navigation

- `MainShellView` owns one persistent `RaceDeckViewModel` and leaderboard model. Switching Upcoming, Past, Rankings, or Profile does not rebuild the app's data layer.
- Upcoming and Past are independent centered horizontal pagers. Selections are stored separately and normalized deterministically when the calendar changes.
- `RaceDeckView` creates private detail state only for the selected race. Public detail/image prefetch may retain the selected race and its next neighbor. Schedule and driver choice use native sheets; ranking rows open `FriendProfileView` in a dismissible native sheet. None requires an outer shell `NavigationStack`.
- Live → completed transitions move the race from Upcoming to Past without discarding a visited detail model or interrupting an unrelated Past selection.
- Upcoming context uses season-form fields already carried by the selected race detail; qualifying rows replace that table as soon as they exist. It must not create a hidden previous-race detail load.
- While the shell is active, race status polls every 60 seconds even before a race becomes live. A published live status also revalidates the selected live detail; foreground race and account refreshes run independently.

## Public race data and cancellation

`RaceRepository` is the sole race-list/detail data boundary.

- Publish cached list/detail snapshots first, then refresh according to `RaceFetchPolicy`.
- List and detail requests are single-flight; late results are protected by token, generation, epoch, and race-identity checks.
- A list/detail status mismatch is stale even if the snapshot age would normally be fresh.
- Freshness windows are 60 seconds for the list, 30 seconds for foreground list revalidation, 5 minutes for upcoming detail, 60 seconds for live detail, and 6 hours for completed/cancelled detail.
- Prefetch scope is capped to the selected race and its next neighbor.
- Visible detail callers have waiter accounting. Canceling/swiping releases visible demand; work is retained only if still useful to the two-race prefetch scope, otherwise it is canceled.
- Season rollover advances the detail epoch, cancels old flights, and prevents old-season writes from repopulating current cache state.
- `RaceDetailViewModel.cancelLoad()` invalidates later public/private merges. `RaceDeckView` calls it on selected-model replacement, backgrounding, and disappearance; `RaceDeckViewModel.setPrivateScope` cancels and evicts the prior account/device scope atomically on account change.

## Image pipeline

- Inject exactly one `FXImagePipeline` at the app root. Do not use `AsyncImage` or create per-view URL sessions/caches.
- Requests include exact rendered pixel dimensions, display scale, and content mode so decoded images are not oversized.
- A decoded `NSCache` is capped at 48 MB/160 images; response `URLCache` uses 16 MB memory/100 MB disk. In-flight requests are shared and prefetch loading is capped at four workers.
- Production prefetch uses the same active/next race cohort as detail prefetch.
- Upcoming cards prefetch 36-point headshots and visible 28-point team logos; compact Past rows prefetch 30-point headshots and no hidden logos.
- Prefetch replacement uses owner IDs so an outgoing view cannot clear a newer view's scope.

## Auth and private-state isolation

```text
launch → restore Keychain token → GET /api/users/me
  200 → authenticated user
  401 → delete token and become guest
  cold transient/network/5xx → retain token and expose accountUnavailable
  foreground transient/network/5xx → retain an already-authenticated cached user
```

- `privateScopeID` is `device` for guests and `user:<id>` for an account.
- Detail view-model cache keys include both race ID and private scope. Changing users cancels and evicts the old scope before another user's data can render.
- Sync work holds a lease over the validated user ID, token, and session UUID. Session invalidation cancels workers, restores captured `.syncing` records to `.queued`, and prevents an old token's 401 or response from signing out or mutating a newer session.
- Global race/leaderboard data remains guest-readable. Friends, cloud pick sync, and account profile actions require auth.

## Pick persistence and server authority

`LocalPickStore` persists a versioned `localPicks_v2` envelope. Each `LocalPickRecord` is keyed by `(PickOwnerScope, raceID)`, has a monotonically checked revision, and uses an explicit sync state:

```text
reviewRequired → queued → syncing(revision, mode) → confirmed
                                         ↘ conflict / expired
```

- Owners are `.guest`, `.user(userID)`, or `.legacyAmbiguous`.
- Local draft/outbox rows and authoritative server picks are stored separately. Official score/result rows always render the server pick.
- Guest saves are local-first. Authenticated saves enqueue the same revision-safe worker rather than issuing ad-hoc uploads from views.
- A private 404 is not success: it creates a visible account-repair state when a local account record needs uploading.
- A 423 lock response reconciles with the authenticated server pick when available; local data cannot overwrite official state.
- Ambiguous legacy device picks never auto-upload. The player must explicitly review/recover them into the current owner scope.
- Migration/expiry notices count actual guest migrations only.
- Local persistence survives restart but not reinstall; Keychain auth may survive reinstall.

## Locking

- `Race.isLocked` derives from server `lockCutoffUtc` and the local clock for immediate UI feedback.
- The UI disables editing, `LocalPickStore` refuses new locked drafts, and the backend remains authoritative through 423 responses.
- A picker that becomes locked while open closes and announces the change for VoiceOver.

## Accessibility and visual rules

- Preserve Dynamic Type; avoid fixed text heights and clipped control labels.
- All tappable actions need at least a 44×44-point target.
- Driver picker focus advances with P1 → P10 → DNF and exposes why a duplicate/locked driver is disabled.
- Pager adjustments respect Reduce Motion.
- Glass belongs on navigation/action chrome. Dense content/results cards use stable opaque/material surfaces for contrast.
- Keep native sheet drag affordances and avoid full-screen navigation when the task is a short choice or schedule inspection.

## Performance measurement

- `FXPerformance` emits points-of-interest spans for launch-to-shell, dependency assembly diagnostics, cached publication, section/race selection, selected detail readiness, picker preparation/presentation, schedule presentation, local save, and server acknowledgement.
- `FXRacingPerformance` uses the `Performance` build configuration. Fixture code is excluded from Debug/Release and therefore cannot ship in the App Store binary.
- `scripts/ios-performance` runs deterministic scenarios with 3 warmups, 30 exact-count samples, raw evidence, and p50/p95 summaries. Launch/cache gates use clean normal simulator launches; interaction gates use XCTest signpost metrics and retain `XCUIApplication` wall time only as a diagnostic.
- Enforced p95 gates are launch 0.8 s, cache publication 0.3 s, race selection 0.6 s, picker preparation 0.1 s, picker presentation 0.5 s, schedule presentation 0.5 s, and local save 0.2 s. Dependency assembly, section switch, selected-detail readiness, and server acknowledgement are instrumented but not wrapper-enforced.
- Keep network boundaries closed in fixture scenarios; a performance result is invalid if it depends on the live backend.

## Verification order

From the repository root:

```bash
# Targeted source contracts first
node --test ios/<relevant>.test.mjs

# Complete source-contract suite
npm run test:ios

# Web repository safety checks
npx tsc --noEmit
npm run lint
npm run build

# Native compile/tests (pin a simulator for execution)
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -destination 'generic/platform=iOS Simulator' build
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -destination 'platform=iOS Simulator,id=<UDID>' test

# Deterministic performance scenarios
scripts/ios-performance --help
```

Use focused native suites while iterating, then run the full applicable native/UI/performance sweep before publishing. Do not claim a speed improvement from visual inspection alone; retain measured evidence.

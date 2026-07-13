# F10 iOS Race Deck and Client Performance Design

Date: 2026-07-13  
Issue: #360  
Branch: `feat/360-ios-race-deck-performance`  
Status: Ready for written-spec review

## Goal

Replace the native iOS app's long race list and slow page transitions with a picks-first, centered race deck that feels native to Apple Sports and iOS 26 Liquid Glass. The same branch will remove the client-side launch and race-detail waterfalls, add local stale-while-revalidate caching, and make the result testable on the booted iPhone 17 Pro simulator.

The game does not change. Users still choose a P1 winner, P10 finisher, and first DNF; picks still lock at the existing cutoff; the pre-qualifying 2× bonus, scoring, rankings, local-first saving, and server authority remain intact.

## Scope Boundary

This specification covers the simulator-visible native iOS work:

- the new Upcoming, Past, and Rankings shell;
- centered swipeable race cards;
- picks-first race content;
- schedule and driver sheets;
- native Liquid Glass on iOS 26+ with an iOS 17–25 fallback;
- concurrent launch/detail loading;
- a shared public-race repository with memory and disk caching;
- decoded image caching and bounded prefetching;
- explicit local-versus-server pick status;
- performance instrumentation, native tests, and simulator verification.

Production API/CDN work is intentionally separated into #361. That issue covers Auth.js bypass for public routes, shared HTTP caching, tagged invalidation, server query parallelism, and production TTFB. Atomic optimistic concurrency for cross-device pick edits is separated into #362. Keeping server mutations separate lets the user review the native experience in the simulator before a backend deployment.

## Non-Goals

- No scoring, bonus, lock, ranking, or entrant-rule changes.
- No database schema or migration work.
- No web-app redesign.
- No practice-session schedule fields that the current API does not provide.
- No change to the iOS 17 deployment target.
- No pick API/versioning contract change; #362 owns conditional cross-device writes.
- No glass styling on dense results, qualifying, or ranking content.
- No weakening of local-pick migration, HTTP 423 handling, or server-wins conflict behavior.

## Confirmed Current State

The implementation baseline is `origin/main` at `aa9e5e1`.

- `RootView` shows a blank background while authentication is `.unknown`, so public race loading cannot start until `/api/users/me` completes.
- `MainTabView` uses bottom tabs for Races, Ranking, and Me.
- `RacesListView` renders a vertical Upcoming/Past `List` and navigates to a 715-line `RaceDetailView`.
- `RacesListViewModel` has no shared decoded-model cache or request coalescing.
- `RaceDetailViewModel` fetches public detail first, then the private pick, and clears visible selections between those operations.
- `DriverPickerSheet` selects one slot and dismisses.
- stable team and driver images use direct `AsyncImage` requests.
- the deployment target is iOS 17.0 and the project uses Swift 6.
- the local toolchain is Xcode 26.5 with the iOS 26.5 SDK, so true `glassEffect`, `GlassEffectContainer`, `.glass`, and `.glassProminent` APIs are available behind `#available(iOS 26, *)` checks.
- the booted target is iPhone 17 Pro, iOS 26.5, UDID `D6231AF1-335A-47EA-94DB-D16CD6529F1F`.

## User Experience

### Main shell

`MainTabView` becomes `MainShellView`, hosted in one `NavigationStack`.

- A compact top control switches between Upcoming, Past, and Rankings.
- There is no bottom tab bar.
- A trailing profile/avatar button preserves access to the existing profile experience.
- The same `LeaderboardViewModel` instance survives section changes, so Rankings returns immediately and retains its existing Global/Friends behavior and stale-response protection.
- While authentication restores, public race content remains usable. Account-only controls show a small checking state rather than blanking the whole app.

The top control is a native segmented `Picker`, not a gesture-only custom control. On iOS 26 it receives the platform's current appearance; on older systems it uses the standard segmented material.

Authentication changes only account features, never the public shell:

| State | Picks and Save | Rankings | Profile and private requests |
|---|---|---|---|
| `.unknown` | Existing drafts remain editable; Save persists on device and says “Saved on this device” | Global remains visible; Friends shows an inline account-checking placeholder | Profile shows progress; no private-pick request starts until restoration resolves |
| signed out | Picks save on device and remain eligible for the existing post-sign-in migration | Global remains visible; Friends shows the existing sign-in prompt | Profile opens the existing sign-in/profile entry point |
| authenticated | Save is local-first, then syncs to the account; private picks hydrate concurrently with public detail | Global and Friends are enabled | Profile and private requests use the restored account |
| username required | The shell may remain rendered behind the existing mandatory username setup presentation; account mutation controls are unavailable until setup completes | Global remains readable; Friends waits for setup | Username setup takes precedence and dismisses only after success/sign-out |

A 401 resolves to signed out and retains device drafts. A network/5xx restoration failure does not pretend the user signed out: public content and device saves remain available, account controls show “Account unavailable — retry,” and no dirty local record is discarded. A draft saved while identity is still `.unknown` is labelled device-only; after restoration it follows guest-migration precedence, and any server conflict retains the displaced device values for an explicit notice rather than silently deleting them.

### Centered race deck

Upcoming and Past share one `CenteredRacePager` implementation:

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 10) {
        // one card per race
    }
    .scrollTargetLayout()
}
.contentMargins(.horizontal, sideInset, for: .scrollContent)
.scrollTargetBehavior(.viewAligned(limitBehavior: .always))
.scrollPosition(id: $selectedRaceID)
```

Pager geometry is derived from one pure function:

```swift
let cardWidth = min(viewportWidth - 36, 430)
let sideInset = (viewportWidth - cardWidth) / 2
let spacing: CGFloat = 10
let adjacentPeek = max(0, sideInset - spacing)
```

On iPhone-width layouts this produces equal 18-point gutters and an 8-point edge of the adjacent card as a swipe cue. The dynamic `sideInset`, not a hard-coded one-sided offset, is passed to `.contentMargins`; it also lets the first and last cards snap to the exact viewport center. Wider layouts cap the card at 430 points and intentionally reveal more neighboring content. Pure geometry tests cover 320-, 375-, 393-, 402-, 430-, and 768-point viewports, including first/middle/last positions. No unilateral padding, translation, or fake centering is allowed.

Upcoming and Past keep independent selected race IDs. The initial Upcoming selection is the first live race, otherwise the next scheduled race. The initial Past selection is the most recently completed race.

An empty Upcoming or Past section shows one compact centered empty state, never an empty pager or a broken snap target. When refreshed data removes a selected race, selection falls back using the same initial-selection rule. If a race transitions from Upcoming to Past while visible, the app dismisses its Schedule/driver sheet, preserves its in-memory draft, selects the nearest remaining Upcoming race, makes the transitioned race the active Past race, and announces the move. A now-locked unsaved draft remains visible if the user returns to that race but cannot be submitted; no lifecycle transition silently clears it.

Supporting content sits below the active pager rather than inside every horizontal page. This keeps snap geometry stable and prevents SwiftUI from constructing full qualifying/result lists for off-screen races.

### Upcoming content

The active Upcoming card presents:

- flag, race name, round or sprint marker, circuit, and countdown;
- a compact Schedule control;
- the three primary picks: P1 winner, P10 finisher, and first DNF;
- completion count and lock/early-bird status;
- a single primary Save action.

The picks are the visual center of gravity. The weekend timeline is not displayed on the card.

Below the pager:

- before qualifying data exists, show the previous completed race and the user's points/picks when available;
- once qualifying data exists for the selected race, replace that context with qualifying results;
- after the race completes, Past becomes the primary destination for its scoring breakdown.

### Past content

The active Past card presents race identity, total points, and the user's three scored picks. Full classification, qualifying, and score breakdown appear below the pager for the active race only.

Completed-state DNF correctness comes from the server's `scoreBreakdown.dnfBonus`. The UI continues to say “First DNF,” but the client must not reinterpret result order or change the existing DNF/DNS/DSQ scoring behavior.

### Driver picker sheet

The driver picker is a native `.sheet` with medium and large detents and a visible drag indicator.

- Opening an empty card starts at P1.
- Choosing a driver advances P1 → P10 → first DNF without dismissing the sheet.
- A driver already selected in another slot is disabled, with an accessible explanation.
- Tapping an existing slot reopens the sheet at that slot.
- The user can swipe down at any time.
- If the lock cutoff passes while the sheet is open, selection and submission are refused by the existing lock checks.

The sheet receives entrants and callbacks. It performs no networking.

### Schedule sheet

The Schedule control opens a native medium sheet. It displays only values already supported by `Race`: qualifying or shootout time, 2× cutoff, lock time, and race or sprint start. It is dismissible by swiping down and does not navigate away from the selected race.

### Design feedback loop

The browser-based review companion remains part of every visual checkpoint. After a meaningful simulator UI update, capture the current Upcoming, Past, Rankings, driver-sheet, and schedule-sheet states and publish them to the same local review board with coordinate-based right-click pins. Notes sync into the branch's review-notes artifact with screen, viewport, and exact coordinates so the next correction is traceable. This annotation layer is development-only and is never included in the App Store bundle.

## Visual System

### Liquid Glass boundary

Glass is a functional navigation/control layer, not the content background.

`FXGlassSurface` provides one availability-gated design-system boundary:

- iOS 26+: `glassEffect(.regular.interactive(), in:)` for floating controls, `.glass` for neutral buttons, and `.glassProminent` or tinted regular glass for the primary Save action;
- iOS 17–25: adaptive `regularMaterial` or `ultraThinMaterial`, a subtle semantic border, and a restrained shadow;
- dense content cards: an opaque/adaptive `FXContentSurface`, never glass-on-glass.

The top section control, profile button, Schedule control, and temporary sheets may use glass. Qualifying rows, score breakdowns, and rankings remain quiet readable surfaces. F10 red is reserved for the current primary pick/save action; gold remains semantic scoring emphasis.

The system must respect light/dark mode, Increased Contrast, Reduce Transparency, and Reduce Motion. Ambient motion is optional decoration and disappears when Reduce Motion is enabled.

## Native Architecture

### Components

Add or extract these focused units:

- `Features/Home/MainShellView.swift`: navigation, section selection, profile presentation.
- `Features/Home/HomeSectionPicker.swift`: Upcoming/Past/Rankings control.
- `Features/Races/RaceDeckView.swift`: loading/error shell and active contextual content.
- `Features/Races/RaceDeckViewModel.swift`: race derivations, selection, polling, and detail-model lifecycle.
- `Features/Races/CenteredRacePager.swift`: reusable symmetric snap geometry.
- `Features/Races/UpcomingRaceCard.swift`: race identity and primary pick panel.
- `Features/Races/PastRaceCard.swift`: completed pick/score summary.
- `Features/Races/RacePickPanel.swift`: three-slot interaction and save status.
- `Features/Races/RaceContextView.swift`: previous-race or qualifying switch.
- `Features/Races/RaceScheduleSheet.swift`: presentation-only schedule.
- `Core/Races/RaceRepository.swift`: public list/detail cache and request coalescing.
- `Core/Races/RaceSnapshotCache.swift`: versioned atomic disk persistence.
- `Core/Images/FXImagePipeline.swift`: decoded-image cache and bounded prefetch.
- `DesignSystem/FXGlassSurface.swift`: one iOS 26/fallback visual boundary.
- `Core/Performance/FXPerformance.swift`: signposts and timing records.

Modify `RootView`, `RaceDetailViewModel`, `DriverPickerSheet`, `LeaderboardView`, `FXTheme`, and `project.yml`. Break useful sections out of `RaceDetailView`; keep the old destination only until the new flow has feature parity, then remove the obsolete route rather than maintain two race experiences.

### State ownership

- `MainShellView` owns the selected top section and presented profile destination.
- `RaceDeckViewModel` owns the list presentation, selected Upcoming/Past IDs, live polling, and the session cache of `RaceDetailViewModel` instances.
- `RaceRepository` is an actor that owns public memory snapshots, disk snapshots, and in-flight list/detail tasks.
- `RaceDetailViewModel` continues to own one race's entrants, results, qualifying, server pick, local draft, lock state, and submission state.
- `LeaderboardViewModel`, `AuthManager`, `LocalPickStore`, and `SyncManager` keep their existing domain responsibilities.
- Sheets remain presentation-only.

Each unit receives dependencies through an initializer or environment value. Network and cache implementations conform to small protocols so tests can use deterministic fixtures.

## Data and Performance Flow

### App launch

1. `FXRacingApp` creates one shared `RaceRepository` and injects it.
2. `RootView` renders `MainShellView` even while authentication is `.unknown`.
3. Race cache loading and `AuthManager.restoreSession()` run independently.
4. A cached race snapshot, if present, is decoded and published immediately.
5. If no snapshot exists, or the snapshot is at least 60 seconds old, one coalesced list refresh starts in the background. A fresh launch snapshot does not force another request.
6. A successful refresh atomically replaces memory/disk snapshots. A refresh failure leaves cached content visible with a non-blocking stale/retry notice.
7. Username onboarding still takes over after authentication resolves to a user whose username is not set.

This removes the current auth → mount races → fetch races waterfall without treating a network failure as a signed-out account.

### Race repository

`RaceRepository` stores public data only:

- `RaceListSnapshot`: schema version, save date, season, races;
- `RaceDetailSnapshot`: schema version, save date, race, entrants, results, qualifying.

The cache lives under the app's Caches directory, uses atomic writes, and can be discarded safely. Private server picks never enter this cache; `LocalPickStore` remains their local source.

Repository behavior:

- return memory immediately when available;
- otherwise return disk immediately when decodable;
- refresh stale data in the background;
- share one in-flight task for the same list or race ID;
- keep visited details in memory for the session;
- prefetch only the active race and its next neighbor;
- preserve the 60-second live-race polling cadence;
- discard incompatible snapshot versions rather than attempting ambiguous migration.

Any cached snapshot may be displayed while refreshing. “Fresh” controls whether a network refresh is required, not whether content is allowed to render.

Freshness is deterministic:

| Snapshot | Fresh for | Revalidation rule |
|---|---:|---|
| race list | 60 seconds | Revalidate when stale; on foreground, force revalidation when at least 30 seconds old |
| scheduled race detail | 5 minutes | Revalidate on expiry, explicit retry, or when the race becomes live |
| live race detail | 60 seconds | Preserve the existing 60-second poll while the race remains active |
| completed race detail | 6 hours | Revalidate on expiry or explicit retry so corrected results can replace the cache |

The app derives countdowns and lock labels from the current clock, not the snapshot save date. At a UTC year boundary, a previous-season list may render as stale while the refresh runs; the first successful response for a different season atomically replaces the list, reapplies the selection fallback rules, and lazily evicts orphaned detail snapshots. Explicit retry always bypasses freshness. Foreground, polling, and manual refresh still share the same in-flight request.

### Detail and pick hydration

For an authenticated user with no pending account edit, public detail and private pick requests start concurrently. A pending account edit follows the ordering rules below before any fetched server value may replace the visible draft.

- The sheet/card first frame uses `Race` summary data already held by the deck.
- Cached public detail is published when available.
- Network public detail replaces it without clearing the user's current draft.
- The local pick hydrates immediately from `LocalPickStore` once entrants are known.
- A successful server pick hydrates selections only when there is no dirty account edit. Existing server-wins behavior remains unchanged for a guest-migration conflict.
- A missing or failed server pick does not blank detail or clear a valid local draft.
- Generation IDs or task cancellation prevent an older refresh from overwriting newer state.

`loadIfNeeded` avoids duplicate work. Foreground and explicit refresh paths may force revalidation.

### Pick submission and retry state

The existing local-first save remains authoritative for immediate UI response. `LocalPick` gains backward-compatible optional metadata for a monotonically increasing local revision, persistent sync state, and an owner scope: `.guest`, `.user(userID)`, or `.legacyAmbiguous`. Authenticated records are indexed by owner plus race and are neither displayed nor uploaded for another account. Existing records without owner metadata decode as `.legacyAmbiguous`, because the old format cannot prove whether a failed upload belonged to a guest or an authenticated account.

Visible submission state becomes explicit:

- `savingLocally`;
- `savedOnDevice`;
- `syncing`;
- `savedToAccount`;
- `conflict`;
- `expired`.

Only a server acknowledgement for the current local revision displays “Saved to account.” A network failure displays “Saved on this device — will sync” and retains a retry control. HTTP 423 displays the existing expired/locked notice.

Persistent records use a small state machine: `queued` is eligible for automatic retry; `syncing` records its captured revision and mode; `confirmed` is complete; `conflict` and `expired` are terminal until explicit user action. One uploader runs per owner/race. A repeated Save with unchanged selections joins the in-flight task. If the user edits and saves a newer revision while an older revision is uploading, the newer revision replaces the queued payload; acknowledgement of the older revision never marks the newer one synced, and the uploader immediately submits the newest explicitly saved revision next.

An explicit Save has a distinct direct path. It first persists the current selections and revision under `.guest` while signed out/unknown, or `.user(currentUserID)` while authenticated. An authenticated explicit Save then POSTs directly because it represents current user intent; it does not run the background GET-first conflict probe. A network/5xx failure moves that revision to `queued`; 401 pauses it in `queued`; 423 moves it to `expired`. A matching current-revision response moves it to `confirmed`. A stale response cannot merge selections, change visible state, or mark a newer revision confirmed.

Dirty-record precedence is explicit and preserves the existing server-wins rule:

- Guest migration in `queued`: GET first. A 200 with identical driver IDs confirms the device record; a differing 200 means the existing server pick wins and the displaced guest values move to `conflict` with a resolved-conflict notice. A 404 permits POST. A 401 or network/5xx leaves the record `queued` and visible.
- Authenticated retry in `queued`: run only when `ownerUserID == currentUserID`. A 200 with identical driver IDs confirms that a prior response was lost. A differing 200 means the server pick wins and no automatic POST occurs; retain the device values in `conflict` and show “Account picks found — review device picks.” A 404 permits POST. A network/5xx remains `queued`; a 401 pauses account recovery without clearing the draft.
- Account switch: records owned by another user are dormant and hidden, never queried or uploaded. They become eligible again only when their owning account returns. Tests cover account A queuing an edit, account B restoring, and account A returning.
- Ambiguous legacy record: decoding moves it to `conflict(.legacyNeedsReview)`, never automatic retry or POST. “Review device picks” is required even after a 404 because no safe account binding exists. Upgrade tests include a legacy fixture representing a failed authenticated upload.
- Conflict recovery: “Review device picks” restores the retained values as an ordinary editable draft. Explicitly tapping Save creates a new revision owned by the current account and uses the direct authenticated POST path above. Conflict/expired records themselves never enter foreground retry.
- Successful POST: apply the returned pick and mark synced only if its captured local revision is still current. A response for an older revision must not merge selections or replace the visible newer draft; it may only advance uploader bookkeeping before the queued newest revision is submitted.
- HTTP 423: mark the pending record expired, retain it for the existing expiry notice, and rehydrate any available server pick; never claim account success.

The current POST has no conditional base-version/`If-Match` contract, so #360 does not claim atomic cross-device conflict detection. #362 owns that capability. Until then, server-wins plus an explicit review action is the only safe client-only policy.

Only `queued` records whose owner is `.guest` or the current user retry after successful session restore and foreground activation. Server receipt/edit time remains authoritative for early-bird scoring; the client never backdates an offline submission.

### Images

`FXImagePipeline` uses:

- `NSCache` for decoded images, with a 48 MB `totalCostLimit`, a 160-image `countLimit`, and decoded byte size as cost;
- a dedicated `URLCache` capped at 16 MB in memory and 100 MB on disk for response data;
- one in-flight request per URL plus target pixel size;
- ImageIO downsampling to the rendered pixel size;
- a prefetch concurrency limit of four for active-race entrant photos and team logos.

Decoded cache keys include URL, target pixel width/height, display scale, and content mode so a thumbnail is never stretched into an avatar that requested a different size. Downsampling runs away from the main actor. When the active race changes, queued and in-flight prefetches outside the new active-plus-next set are cancelled; visible image requests are not. Pending prefetch work is capped to those two races, so concurrency and queue length are both bounded.

Team-color/code placeholders render synchronously, so an image never blocks selection or scrolling.

## Error and Offline Behavior

- No cached list and refresh failure: show a compact retry state inside the deck shell.
- Cached list and refresh failure: keep content interactive and show a dismissible stale banner.
- Cached detail and detail refresh failure: retain detail and expose retry.
- No cached detail: open the sheet/card from summary data immediately and show localized placeholders for the missing sections.
- Private pick failure: retain the local draft and label it accurately.
- Decode failure: discard only the incompatible cache entry, log metadata without response bodies, and refresh.
- Authentication 401: preserve the existing token-clear behavior.
- Network/5xx during auth restoration must not block guest-readable race content.

## Performance Instrumentation and Targets

Use `OSSignposter`/signposts around:

- launch to shell;
- cache read and cached list paint;
- network list paint;
- active race summary paint;
- detail paint;
- private pick hydration;
- driver picker first frame;
- local save;
- server acknowledgement.

Capture `URLSessionTaskMetrics` where the existing networking boundary permits it, without logging tokens, payload bodies, or personal data.

Internal signposts diagnose where time is spent; they end at state/view-tree readiness and are not labelled as rendered-frame gates:

- launch to shell tree: `FXRacingApp.init` begins; `MainShellView.onAppear` ends;
- cached list publication: `RaceDeckViewModel.start` begins; non-empty cached state publication on the main actor ends;
- active summary/detail publication: race selection begins; summary state and cached-detail state publication end separate intervals;
- sheet tree: the slot/schedule tap begins; the presented sheet's `onAppear` ends;
- local save: persistence begins; the atomic store write and visible `savedOnDevice` state publication end;
- server acknowledgement: request resume begins; a matching current-revision response merge ends.

Gating client measurements use a Release-derived `Performance` build configuration and `FXRacingPerformance` scheme on the pinned iPhone 17 Pro / iOS 26.5 simulator, with animations enabled and the host otherwise idle. `FX_PERF_HARNESS` exists only in that configuration; Archive remains ordinary Release and fails a configuration test if that flag appears. The harness injects a fixed clock, versioned race/detail/cache fixtures, an image fixture loader, and a deterministic failing `URLProtocol`. Launch arguments choose empty, cached, or offline state. None of those seams are selectable in Debug/Release production code.

An `FXRacingUITests` target owns the user-perceived gates. Each interval starts before `app.launch()`, swipe, or tap and ends only when the expected accessibility identifier/value exists and its primary control is `isHittable`; this readiness check is inside the measured wall-clock interval. That includes process launch, system animation, presentation, accessibility-tree publication, and interaction readiness instead of inferring a committed frame from `onAppear` or `CADisplayLink`. `XCTOSSignpostMetric` records the internal phases alongside the UI-test wall time.

A checked-in `scripts/ios-performance` wrapper performs 3 warm-up iterations followed by 30 recorded iterations, cleans the simulator container when the scenario requires a cold process, seeds the requested fixture through the performance launch mode, runs the scheme, and exports the `.xcresult` plus raw interval JSON/p50/p95 into an ignored artifacts directory. Production API and server-ack timing use the ordinary Release endpoint, are labelled with network conditions, and remain non-gating in #360.

Unless stated otherwise, every threshold below is the p95 of those 30 recorded iterations. Launch and cached/offline-list checks use cold processes; race summary, cached detail, driver sheet, and local save checks use a warm process with deterministic fixtures.

Release-simulator acceptance targets for #360:

| Flow | Target |
|---|---:|
| Cold launch to shell interactive | ≤ 0.8 s |
| Cold launch to cached/offline race deck interactive | ≤ 1.0 s |
| Race swipe to selected card and cached context ready | ≤ 0.6 s |
| Driver tap to picker interactive | ≤ 0.5 s |
| Schedule tap to sheet interactive | ≤ 0.5 s |
| Save tap to visible device response | ≤ 0.2 s |
| Internal cached snapshot publication | ≤ 0.3 s |
| Retry after session restore/foreground | begins within 5 s |

Server acknowledgement time and empty-cache production TTFB are recorded as baselines but are not gating claims for this client-only issue; #361 owns the public-origin/CDN targets. The local save response remains the user-visible latency guarantee.

## Accessibility

- Use a segmented `Picker` with labels, not only swipe gestures.
- Give the pager adjustable accessibility actions and announce “Belgian Grand Prix, race 1 of 8.”
- Each pick slot announces role, selected driver, editability, and scored points when available.
- Maintain 44×44-point minimum targets.
- Never use color as the only status signal.
- At accessibility text sizes, use `ViewThatFits` or vertical slot layout; do not clip against fixed card heights.
- Move VoiceOver focus to the next slot heading after sheet auto-advance.
- Respect Reduce Motion, Reduce Transparency, Increased Contrast, and Differentiate Without Color.
- Verify local date/time formatting, sheet focus order, light/dark mode, and Dynamic Type.

## Testing

Add native `FXRacingTests` and `FXRacingUITests` targets, the Release-derived `Performance` configuration, and the non-archiving `FXRacingPerformance` scheme in `project.yml`; regenerate the checked-in project once. Use small protocols and fixtures rather than live networking. A configuration regression asserts that `FX_PERF_HARNESS` is absent from Debug, Release, and Archive actions.

Native tests cover:

- Upcoming ascending and Past descending ordering;
- initial active race and independent section positions;
- exact symmetric pager geometry at the specified phone/tablet widths, including first/middle/last snap positions;
- cached-first list and detail publication;
- request coalescing, freshness/foreground/season-rollover rules, and active-plus-next prefetch only;
- stale task/generation rejection;
- draft preservation while detail and pick refresh, including guest/server conflict, dirty authenticated edits, and upgrade from an ambiguous legacy failed-upload fixture;
- three distinct-driver validation and sheet auto-advance;
- lock crossing while a sheet is open;
- local-first save, direct user-save versus background-probe transitions, conflict/expired retry exclusion, unchanged duplicate-tap coalescing, changed-draft resubmission, stale acknowledgement rejection, account switching, 401/404/423/5xx handling, and server-pick precedence;
- Rankings state survival across section changes;
- empty Upcoming/Past states and a selected race transitioning between sections while a sheet/draft is active;
- cache version rejection and atomic replacement;
- decoded-image cost/count limits, size-specific keys/reuse, request coalescing, off-main downsampling, and stale-prefetch cancellation.

Retain and extend the source/configuration regressions under `ios/*.test.mjs`. The baseline is currently green: 28 iOS checks, 79 route checks, and 25 service checks.

Verification order:

1. targeted native/unit tests during development;
2. `npm run test:ios`;
3. `npm run test:routes` and `npm run test:services` for shared contract confidence;
4. `xcodegen generate` only after `project.yml` changes, followed by a clean project diff review;
5. build and run the Performance UI-test scheme and `scripts/ios-performance`, checking the exported p50/p95 evidence;
6. Release simulator build for the pinned iPhone 17 Pro;
7. a generic iOS Simulator build at deployment target 17.0, plus resolver tests that force the non-glass material branch;
8. install and launch `com.fxracing.app` on iPhone 17 Pro;
9. manual Upcoming/Past/Rankings, sheet, pick, offline/stale, light/dark, Dynamic Type, Reduce Motion, and exact card-centering checks;
10. run one iOS 17-runtime smoke pass covering fallback materials, both sheets, Dynamic Type, Reduce Transparency, and Increased Contrast; if the runtime is not installed, obtain it before merge rather than claiming the fallback verified.

The functional simulator build uses Release configuration because Debug points at `http://127.0.0.1:3000`, while Release uses the production API.

## Delivery Sequence

1. Establish protocols, repository/cache tests, and cached-first launch behavior.
2. Build the new shell and centered deck using summary data.
3. Extract picks/context/results from the existing detail view.
4. Implement the progressive driver and schedule sheets.
5. Add availability-gated Liquid Glass and image caching.
6. Add instrumentation and explicit save states.
7. Remove the obsolete list/detail navigation only after feature parity.
8. Build, install, and launch on the booted iPhone 17 Pro for user review.
9. Mirror the implemented screens into the annotatable review companion and address simulator/pinned feedback in #360.
10. Keep production server work in #361 and conditional cross-device writes in #362.

## Success Criteria

- The simple three-pick game behaves exactly as before.
- The app opens directly into useful race content instead of waiting on authentication.
- Upcoming and Past cards are on the exact horizontal centerline with equal gutters.
- Race browsing, driver picking, schedule viewing, and rankings remain in one calm native shell.
- Cached content stays usable during refresh and offline failures.
- The visual layer uses real iOS 26 Liquid Glass only where functional, with a complete iOS 17–25 fallback.
- Automated tests and the Release simulator build pass.
- Every visual checkpoint is available in the coordinate-pinned review companion without adding review code to the shipped app.
- The user can test the complete core flow on the already-open iPhone 17 Pro before any App Store or production API rollout.

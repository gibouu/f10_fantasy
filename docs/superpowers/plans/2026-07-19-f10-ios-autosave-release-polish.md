# F10 iOS Autosave and Release Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship and submit a new FX Racing iOS version whose three picks autosave safely, whose race cards and sheets are stable and centered, whose Season form exposes race-by-race driver results, and whose website/store assets reflect the finished app.

**Architecture:** Keep the existing cached-first race repository and revisioned local outbox. Split pick submission into a synchronous owner-scoped local commit and an asynchronous revision/session-checked sync ticket; add legacy recovery as a separately gated atomic decision. Replace the two season-stat queries with one bounded projected result query, serialize compact history in the existing cached race-detail payload, and keep all new sheets native and image-free.

**Tech Stack:** Swift 6, SwiftUI, XCTest/XCUITest, Node test runner, TypeScript, Next.js App Router, Prisma, XcodeGen 2.45.3, Xcode 26.6, App Store Connect.

## Global Constraints

- Preserve exactly three unique picks: P1, P10, and DNF.
- Preserve current lock, early-bird bonus, scoring, ranking, guest, authentication, and account-ownership rules.
- iOS deployment target remains 17.0; Release binaries must not contain `FX_PERF_HARNESS`.
- Local persistence must complete before picker dismissal or remote work.
- Ambiguous legacy picks never upload before explicit resolution under a resolved current session lease.
- Existing performance ceilings remain: local save p95 ≤ 0.200 s, picker preparation p95 ≤ 0.100 s, picker presentation p95 ≤ 0.500 s, selected race detail p95 ≤ 0.600 s.
- Driver history is same season, same race type, completed races only, strictly earlier by `scheduledStartUtc`; AVG includes only classified non-null positions, while OUT counts DNF/DNS/DSQ.
- Worst-case uncompressed race-detail JSON is ≤ 131072 bytes for 22 entrants × 24 history rows.
- No database schema change, new dependency, tap-time history request, or browser gameplay restoration.
- App Store screenshots contain deterministic public race data and synthetic identities only; no private account data or developer controls.
- Every commit and PR body ends with `— gib`; never add an AI co-author/footer.
- The dirty primary checkout at `/Users/gibou/code/github/f10_fantasy` remains untouched.

---

## File and Interface Map

### Server history contract

- `src/types/domain.ts`: shared `DriverSeasonResult`, `DriverSeasonForm`, and serialized entrant history fields.
- `src/lib/services/driver-season-stats.ts`: one projected `findMany` plus one-pass aggregation.
- `src/app/api/races/[id]/get-handler.js`: dependency-injected race-detail HTTP behavior.
- `src/app/api/races/[id]/route.ts`: thin production dependency wiring.
- `ios/FXRacingTests/Fixtures/race-detail-22x24.json`: shared worst-case payload fixture.

### Native history UI

- `ios/FXRacing/Core/Models/Driver.swift`: optional cached `seasonResults` rows and result labels.
- `ios/FXRacing/Features/Races/DriverFormSheet.swift`: native scrollable history sheet.
- `ios/FXRacing/Features/Races/RaceContextView.swift`: full-width Season form buttons and `OUT` copy.

### Pick authority and autosave

- `ios/FXRacing/Core/Storage/LocalPickRecord.swift`: atomic legacy decision/result types.
- `ios/FXRacing/Core/Storage/LocalPickStore.swift`: revision-checked adopt/replace/discard transaction.
- `ios/FXRacing/Features/Races/RaceDetailViewModel.swift`: synchronous commit ticket and async sync state machine.
- `ios/FXRacing/Core/Models/Pick.swift`: optional server `updatedAt` and `lockedSubmittedBeforeQualifying` authority.
- `ios/FXRacing/Features/Races/RacePickStatusRail.swift`: pure status resolver plus fixed visual rail.
- `ios/FXRacing/Features/Races/LegacyPickRecoverySheet.swift`: guest/account/current-pick recovery matrix.
- `ios/FXRacing/Features/Races/DriverPickerSheet.swift`: richer selection outcome and dismiss-after-local-commit behavior.
- `ios/FXRacing/Features/Races/RaceDeckView.swift`: presentation ownership and background sync launch.

### Stable layout

- `ios/FXRacing/Features/Races/UpcomingCardLayoutMetrics.swift`: precomputed Dynamic Type floors.
- `ios/FXRacing/Features/Races/UpcomingRaceCard.swift`: stable card regions.
- `ios/FXRacing/Features/Races/CenteredRacePager.swift`: 18-point iPhone spacing and zero clipped peek.
- `ios/FXRacing/Features/Races/RaceScheduleSheet.swift`: opaque centered sheet.

### Web, screenshots, and release

- `src/app/page.tsx` and `src/app/site.module.css`: remove repeated scoring strip; later reference v2 images.
- `scripts/app-store-screenshots.mjs`: validate and hash the five-image set.
- `.artifacts/app-store/`: ignored staging only.
- `/Users/gibou/Documents/F10 Releases/`: durable owner-controlled screenshot masters.
- `docs/release/app-store/`: committed release handoff.
- Existing coordinate-note companion remains outside shipped source at `/Users/gibou/.codex/visualizations/2026/07/12/019f552b-9525-7b70-87a2-977c18f8bf29/landing-direction-review-local-v1.html`.

---

### Task 1: Replace aggregate-only season stats with one cached history contract

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/lib/services/driver-season-stats.ts`
- Modify: `src/lib/services/driver-season-stats.test.mjs`
- Create: `src/app/api/races/[id]/get-handler.js`
- Create: `src/app/api/races/[id]/get-handler.test.mjs`
- Modify: `src/app/api/races/[id]/route.ts`
- Modify: `src/app/api/races/route-source.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `getDriverSeasonStats(...): Promise<Map<string, DriverSeasonForm>>`.
- Produces: serialized entrant fields `seasonAverageFinish`, `seasonDnfCount`, `seasonResults`.
- Produces: `createRaceDetailGetHandler(dependencies)` used by the route and real handler tests.

- [ ] **Step 1: Write the failing service test**

Replace the two-groupBy test double with one real-shape `findMany` double and assert this behavior:

```js
assert.equal(findManyCalls.length, 1)
assert.deepEqual(findManyCalls[0].where.race, {
  seasonId: "season-2026",
  type: "MAIN",
  status: "COMPLETED",
  scheduledStartUtc: { lt: before },
})
assert.deepEqual(stats.get("norris"), {
  averageFinish: 3.5,
  nonClassifiedCount: 2,
  results: [
    {
      driverId: "norris",
      raceId: "britain",
      raceName: "British Grand Prix",
      scheduledStartUtc: new Date("2026-07-05T14:00:00.000Z"),
      position: 5,
      status: "CLASSIFIED",
    },
    {
      driverId: "norris",
      raceId: "austria",
      raceName: "Austrian Grand Prix",
      scheduledStartUtc: new Date("2026-06-28T13:00:00.000Z"),
      position: null,
      status: "DNF",
    },
    {
      driverId: "norris",
      raceId: "canada",
      raceName: "Canadian Grand Prix",
      scheduledStartUtc: new Date("2026-06-14T18:00:00.000Z"),
      position: 2,
      status: "CLASSIFIED",
    },
    {
      driverId: "norris",
      raceId: "monaco",
      raceName: "Monaco Grand Prix",
      scheduledStartUtc: new Date("2026-05-24T13:00:00.000Z"),
      position: null,
      status: "DSQ",
    },
  ],
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test src/lib/services/driver-season-stats.test.mjs
```

Expected: FAIL because production still calls `groupBy` twice and returns no history.

- [ ] **Step 3: Add the shared domain types and single-query aggregation**

Add these exact shapes to `src/types/domain.ts`:

```ts
export type DriverSeasonResult = {
  driverId: string
  raceId: string
  raceName: string
  scheduledStartUtc: Date
  position: number | null
  status: ResultStatus
}

export type DriverSeasonForm = {
  averageFinish: number | null
  nonClassifiedCount: number
  results: DriverSeasonResult[]
}

export type SerializedDriverSeasonResult = Omit<
  DriverSeasonResult,
  'driverId' | 'scheduledStartUtc'
> & { scheduledStartUtc: string }
```

Implement one projected query in `driver-season-stats.ts`:

```ts
const rows = await db.raceResult.findMany({
  where: {
    race: {
      seasonId,
      type: raceType,
      status: 'COMPLETED',
      scheduledStartUtc: { lt: before },
    },
  },
  select: {
    driverId: true,
    raceId: true,
    position: true,
    status: true,
    race: { select: { name: true, scheduledStartUtc: true } },
  },
  orderBy: [
    { race: { scheduledStartUtc: 'desc' } },
    { raceId: 'desc' },
    { driverId: 'asc' },
  ],
})
```

Aggregate in one pass, adding to AVG only for `CLASSIFIED` + non-null position and incrementing OUT for every non-classified status.

- [ ] **Step 4: Verify GREEN**

Run the focused service test and `npm run test:services`. Expected: both pass.

- [ ] **Step 5: Write the failing handler tests**

Create a dependency-injected handler test that proves the race lookup, entrants, season form, results, and qualifying path; assert one season call, ISO history dates, no `driverId` inside entrant history rows, and a 404 for an unknown race.

```js
assert.equal(seasonCalls, 1)
assert.equal(body.entrants[0].seasonResults[0].scheduledStartUtc,
  "2026-07-05T14:00:00.000Z")
assert.equal("driverId" in body.entrants[0].seasonResults[0], false)
assert.equal(response.status, 200)
```

- [ ] **Step 6: Verify handler RED**

Run:

```bash
node --test 'src/app/api/races/[id]/get-handler.test.mjs' src/app/api/races/route-source.test.mjs
```

Expected: FAIL because the handler seam and serialized history do not exist.

- [ ] **Step 7: Extract and wire the real handler**

Expose this interface from `get-handler.js`:

```js
export function createRaceDetailGetHandler({
  getRaceById,
  getRaceEntrants,
  getDriverSeasonStats,
  findRaceResults,
  getQualifyingResults,
  getResultScoreGuide,
}) {
  return async function GET(_request, { params }) {
    // Existing route behavior, with one Promise.all and serialized seasonResults.
  }
}
```

Keep `route.ts` as thin dependency wiring and preserve all current result score-guide behavior.

- [ ] **Step 8: Verify handler GREEN and commit**

Run the focused handler tests, `npm run test:routes`, `npx tsc --noEmit`, then commit:

```bash
git add src/types/domain.ts src/lib/services/driver-season-stats.ts \
  src/lib/services/driver-season-stats.test.mjs \
  'src/app/api/races/[id]/get-handler.js' \
  'src/app/api/races/[id]/get-handler.test.mjs' \
  'src/app/api/races/[id]/route.ts' src/app/api/races/route-source.test.mjs package.json
git commit -m $'Add cached driver form history\n\n— gib'
```

---

### Task 2: Decode, cache, and present driver history natively

**Files:**
- Create: `ios/FXRacingTests/Fixtures/race-detail-22x24.json`
- Modify: `ios/project.yml`
- Modify: `ios/FXRacing/Core/Models/Driver.swift`
- Create: `ios/FXRacing/Features/Races/DriverFormSheet.swift`
- Modify: `ios/FXRacing/Features/Races/RaceContextView.swift`
- Modify: `ios/FXRacing/Performance/PerformanceFixtures.swift`
- Modify: `ios/FXRacingTests/Core/Networking/APIClientTests.swift`
- Modify: `ios/FXRacingTests/Core/Races/RaceSnapshotCacheTests.swift`
- Create: `ios/FXRacingTests/Features/Races/DriverFormSheetTests.swift`
- Modify: `ios/FXRacingTests/Features/Races/RaceContextResolverTests.swift`
- Modify: `ios/FXRacingUITests/Home/MainShellUITests.swift`
- Modify: `ios/race-season-form.test.mjs`
- Modify: `ios/FXRacing.xcodeproj/project.pbxproj` through XcodeGen only

**Interfaces:**
- Consumes: `seasonResults` from Task 1.
- Produces: `DriverSeasonResult` and `DriverFormSheet(race:driver:)`.
- Preserves: `RaceDetailSnapshot.currentSchemaVersion == 1` and old cache compatibility.

- [ ] **Step 1: Add failing source and native tests**

Require an optional history field, exact result labels, a full-width Season form `Button`, `OUT` copy, no remote image, and a native sheet:

```swift
XCTAssertEqual(result(resultStatus: .classified, position: 8).resultLabel, "P8")
XCTAssertEqual(result(resultStatus: .dnf, position: nil).resultLabel, "DNF")
XCTAssertEqual(result(resultStatus: .dns, position: nil).resultLabel, "DNS")
XCTAssertEqual(result(resultStatus: .dsq, position: nil).resultLabel, "DSQ")
```

Add a legacy snapshot decode test whose entrant omits `seasonResults` and assert it returns `nil` without invalidating the cache.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test ios/race-season-form.test.mjs
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -destination 'generic/platform=iOS Simulator' build-for-testing
```

Expected: source test fails for missing sheet/model/OUT button contract; focused native compilation fails until new types exist.

- [ ] **Step 3: Add the exact Swift model**

```swift
struct DriverSeasonResult: Codable, Sendable, Identifiable, Equatable {
    let raceId: String
    let raceName: String
    let scheduledStartUtc: Date
    let position: Int?
    let status: ResultStatus

    var id: String { raceId }

    var resultLabel: String {
        switch status {
        case .classified: position.map { "P\($0)" } ?? "—"
        case .dnf: "DNF"
        case .dns: "DNS"
        case .dsq: "DSQ"
        }
    }
}
```

Add `let seasonResults: [DriverSeasonResult]?` and initializer default `nil` to `Driver`. Preserve the field whenever fixtures rebuild a driver.

- [ ] **Step 4: Build the sheet and Season form entry point**

Create `DriverFormSheet` with `race` and `driver`, newest-first rows from the server without re-sorting, `AVG uses classified finishes.`, type-aware Race/Sprint copy, medium/large detents, an opaque surface, and no `FXRemoteImage`.

Change the summary label from `DNF` to `OUT`; accessibility copy says `non-classified results`. Wrap each row in a full-width plain button with at least 44-point height and a trailing chevron at the end of the line.

- [ ] **Step 5: Generate and validate the worst-case fixture**

Create a minified complete race-detail envelope with exactly 22 entrants × 24 `seasonResults` rows, mixed CLASSIFIED/DNF/DNS/DSQ, descending dates, and the longest fixture strings. Assert:

```swift
XCTAssertEqual(payload.entrants.count, 22)
XCTAssertTrue(payload.entrants.allSatisfy { $0.seasonResults?.count == 24 })
XCTAssertLessThanOrEqual(data.count, 131_072)
```

Declare the JSON as an FXRacingTests resource in `ios/project.yml`; run `xcodegen generate --spec ios/project.yml` and review the generated project diff.

- [ ] **Step 6: Verify focused GREEN**

Run `npm run test:ios`, generic simulator build-for-testing, then the focused API/cache/context/sheet native tests and `MainShellUITests/testSeasonFormOpensDriverHistory` on the booted iPhone 17 Pro Simulator.

- [ ] **Step 7: Commit**

```bash
git add ios/project.yml ios/FXRacing.xcodeproj/project.pbxproj \
  ios/FXRacing/Core/Models/Driver.swift \
  ios/FXRacing/Features/Races/DriverFormSheet.swift \
  ios/FXRacing/Features/Races/RaceContextView.swift \
  ios/FXRacing/Performance/PerformanceFixtures.swift \
  ios/FXRacingTests ios/FXRacingUITests ios/race-season-form.test.mjs
git commit -m $'Present cached driver race history\n\n— gib'
```

---

### Task 3: Make legacy pick decisions atomic and owner-safe

**Files:**
- Modify: `ios/FXRacing/Core/Storage/LocalPickRecord.swift`
- Modify: `ios/FXRacing/Core/Storage/LocalPickStore.swift`
- Modify: `ios/FXRacingTests/Core/Storage/LocalPickStoreTests.swift`
- Modify: `ios/offline-pick-migration-expired.test.mjs`

**Interfaces:**
- Produces: `resolveLegacyConflict(race:owner:expectedLegacyRevision:decision:now:)`.
- Produces: atomic discard/adopt/replace outcomes with rollback.

- [ ] **Step 1: Write failing atomic-resolution tests**

Cover guest adopt, account adopt, replace only when the expected destination revision matches, keep/discard, locked, stale legacy revision, destination changed, and rejected persistence. Assert the ambiguous record remains after every failed write.

```swift
XCTAssertEqual(
    store.resolveLegacyConflict(
        race: RaceFixtures.upcoming,
        owner: .user("user-a"),
        expectedLegacyRevision: legacy.revision,
        decision: .replace(expectedDestinationRevision: destination.revision),
        now: RaceFixtures.now
    ),
    .adopted(expectedRecord)
)
XCTAssertNil(store.legacyConflict(for: RaceFixtures.upcoming.id))
```

- [ ] **Step 2: Verify RED**

Run the focused `LocalPickStoreTests`; expected failure is the missing decision API.

- [ ] **Step 3: Add exact decision/result types**

```swift
enum LegacyPickDecision: Equatable, Sendable {
    case discard
    case adopt
    case keepCurrent(expectedDestinationRevision: UInt64?)
    case replace(expectedDestinationRevision: UInt64)
}

enum LegacyPickResolutionResult: Equatable, Sendable {
    case adopted(LocalPickRecord)
    case discarded
    case keptCurrent
    case locked
    case staleLegacy
    case destinationOccupied(LocalPickRecord)
    case destinationChanged(LocalPickRecord?)
    case invalidOwner
    case persistenceFailed
}
```

Implement one envelope mutation: validate the expected legacy record and destination, create the next queued revision for adopt/replace, remove the ambiguous source, persist once, read back, and roll back every in-memory mutation if persistence fails. `keepCurrent` must validate the captured destination revision before removing the legacy source.

- [ ] **Step 4: Verify GREEN and regression safety**

Run focused store tests, `npm run test:ios`, and the offline migration source contract. Confirm ambiguous records never enter `queuedRecords` before resolution.

- [ ] **Step 5: Commit**

```bash
git add ios/FXRacing/Core/Storage/LocalPickRecord.swift \
  ios/FXRacing/Core/Storage/LocalPickStore.swift \
  ios/FXRacingTests/Core/Storage/LocalPickStoreTests.swift \
  ios/offline-pick-migration-expired.test.mjs
git commit -m $'Make legacy pick recovery atomic\n\n— gib'
```

---

### Task 4: Split autosave into synchronous local commit and revision-safe sync

**Files:**
- Modify: `ios/FXRacing/Core/Models/Pick.swift`
- Modify: `ios/FXRacing/Core/Sync/SyncManager.swift`
- Modify: `ios/FXRacing/Features/Races/RaceDetailViewModel.swift`
- Modify: `ios/FXRacingTests/Core/Sync/SyncManagerTests.swift`
- Modify: `ios/FXRacingTests/Features/Races/RaceDetailViewModelTests.swift`
- Modify: `ios/race-detail-load-reset.test.mjs`
- Modify: `ios/server-acknowledgement-span.test.mjs`

**Interfaces:**
- Produces: `selectAndCommit(driver:for:token:userID:localPickStore:) -> PickSelectionOutcome`.
- Produces: `syncCommittedPick(_:token:userID:localPickStore:) async`.
- Produces: explicit private-pick authority state for recovery presentation.
- Produces: `SyncManager.currentSessionLease(currentUserID:token:)` and `SyncManager.isCurrent(_:)` for tap-time recovery revalidation.

- [ ] **Step 1: Write failing ViewModel tests**

Test incomplete selection without persistence, third selection local commit before return, edit creating a newer revision, local failure, immediate background/cancellation after commit, older POST finishing last, account change before/after commit, guest local-only, offline queued, 401, 423, exact qualifying cutoff, and private lookup authority.

```swift
let outcome = viewModel.selectAndCommit(
    driver: DriverFixtures.leclerc,
    for: .dnf,
    token: "token-a",
    userID: "user-a",
    localPickStore: store
)
guard case .committed(let ticket) = outcome else {
    return XCTFail("Expected a durable commit")
}
XCTAssertEqual(store.record(id: ticket.recordID)?.revision, ticket.revision)
XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
```

- [ ] **Step 2: Verify RED**

Run the focused `RaceDetailViewModelTests`; expected failure is missing commit/sync APIs.

- [ ] **Step 3: Add server bonus authority fields**

Extend `Pick` with optional defaulted fields:

```swift
var updatedAt: Date? = nil
var lockedSubmittedBeforeQualifying: Bool? = nil
```

Preserve backwards decoding. Bonus status uses server `updatedAt < qualifyingStartUtc`; equality is false. Only `lockedSubmittedBeforeQualifying == true` says secured.

- [ ] **Step 4: Add commit ticket and outcome**

```swift
struct PickCommitTicket: Equatable, Sendable {
    let recordID: LocalPickRecordID
    let revision: UInt64
    let selection: PickSelection
    let userID: String?
    let draftGeneration: UInt64
}

enum PickSelectionOutcome: Equatable, Sendable {
    case rejected(String)
    case incomplete
    case committed(PickCommitTicket)
}
```

`selectAndCommit` runs on `MainActor`, updates the requested role, validates all three distinct IDs, validates current scope/lock, performs `LocalPickStore.save` synchronously, publishes `.savedOnDevice`, and returns only after the record is readable at the returned revision. It never starts a Task.

- [ ] **Step 5: Extract asynchronous sync**

Move the post-local-write half of current `submit` into `syncCommittedPick`. Revalidate active scope, draft generation, record revision, selection, token, and current user before and after `SyncManager.submitExplicit`. Preserve performance spans and stale-response guards. Map `.queued`, `.unauthorized`, `.conflict`, and `.expired` to explicit submission states without losing the local record.

- [ ] **Step 6: Gate legacy account recovery on private authority**

Track `notRequired`, `checking`, `missing`, `found`, `unavailable`, and `unauthorized` for the captured scope/session. Recovery Use/Replace remains disabled until a signed-in lookup resolves; a scope change clears authority and dismisses pending decisions.

- [ ] **Step 7: Verify GREEN and commit**

Run focused ViewModel tests, SyncManager tests, `npm run test:ios`, and server acknowledgement source-contract tests; commit:

```bash
git add ios/FXRacing/Core/Models/Pick.swift \
  ios/FXRacing/Features/Races/RaceDetailViewModel.swift \
  ios/FXRacingTests/Features/Races/RaceDetailViewModelTests.swift \
  ios/race-detail-load-reset.test.mjs ios/server-acknowledgement-span.test.mjs
git commit -m $'Autosave complete pick revisions\n\n— gib'
```

---

### Task 5: Replace Save/Review controls with the status rail and recovery sheet

**Files:**
- Create: `ios/FXRacing/Features/Races/RacePickStatusRail.swift`
- Create: `ios/FXRacing/Features/Races/LegacyPickRecoverySheet.swift`
- Create: `ios/FXRacing/Features/Races/LegacyRecoveryPresentationSession.swift`
- Modify: `ios/FXRacing/Features/Home/MainShellView.swift`
- Modify: `ios/FXRacing/Features/Races/RacePickPanel.swift`
- Modify: `ios/FXRacing/Features/Races/DriverPickerSheet.swift`
- Modify: `ios/FXRacing/Features/Races/RaceDeckView.swift`
- Modify: `ios/FXRacing/Features/Races/UpcomingRaceCard.swift`
- Create: `ios/FXRacingTests/Features/Races/RacePickStatusResolverTests.swift`
- Create: `ios/FXRacingTests/Features/Races/LegacyRecoveryPresentationSessionTests.swift`
- Modify: `ios/FXRacingTests/Features/Races/DriverPickerStateTests.swift`
- Modify: `ios/FXRacingUITests/Home/MainShellUITests.swift`
- Modify: `ios/FXRacingUITests/FXRacingPerformanceTests.swift`
- Modify: `ios/driver-picker-sheet.test.mjs`
- Modify: `ios/image-design-system.test.mjs`

**Interfaces:**
- Consumes: Task 3 legacy transaction and Task 4 commit ticket.
- Produces: fixed `RacePickStatusRail` and plain-language recovery matrix.
- Produces: one app-session presentation registry keyed by `raceID + privateScopeID`, owned above section switching.

- [ ] **Step 1: Write failing status resolver and UI-contract tests**

Assert exact user-facing states for incomplete, saving, local failure, signed-in confirmed, syncing, offline, guest, 401, 423, and conflict. Assert normal source contains neither `Review device picks` nor `Save picks`.

```swift
XCTAssertEqual(
    RacePickStatusResolver.resolve(confirmedBeforeQualifyingContext),
    RacePickStatus(
        title: "Saved to account",
        detail: "2× bonus eligible",
        systemImage: "checkmark.circle.fill",
        action: .none
    )
)
```

- [ ] **Step 2: Verify RED**

Run new resolver tests and `npm run test:ios`; expected failure is the missing resolver and old Save/Review strings.

- [ ] **Step 3: Implement the fixed two-line rail**

Create a pure `RacePickStatusResolver` with action enum `.none`, `.retry`, `.signIn`, `.resolveConflict`; render a two-line region with a 44-point actionable hit target. Error detail opens an alert/sheet rather than expanding the card. VoiceOver announces the first successful local write once; haptics do not repeat for background acknowledgement.

- [ ] **Step 4: Integrate autosave into the picker**

Change `DriverPickerSheet.onSelect` to return `PickSelectionOutcome`. For `.incomplete`, advance focus as today. For `.committed`, dismiss only after the synchronous local commit and let the parent start `syncCommittedPick` in a Task. For `.rejected`, keep the picker open and show the returned error in an alert.

- [ ] **Step 5: Implement recovery presentation**

`LegacyPickRecoverySheet` displays the three recovered names. Guest actions are Use on this iPhone / Discard / Not now. Signed-in actions wait for private authority; empty account uses Use / Discard / Not now; existing account picks use Keep current / Replace with found / Not now; locked disables adopt/replace. Keep current and Discard remove only the ambiguous record through Task 3's atomic API.

RaceDeckView presents at most once for `raceID + privateScopeID + app session`, dismisses on account change, and never puts recovery UI inside card geometry.

- [ ] **Step 6: Update UI and performance flows**

Remove `onSave` and `onReviewDevicePicks` wiring. Update UI tests to select the third driver and wait for `Saved on this iPhone`/`Saved to account` rather than tapping `save-picks-*`. The local-save performance interval begins immediately before final selection and ends when the local commit returns.

- [ ] **Step 7: Verify GREEN and commit**

Run resolver, picker, ViewModel, focused UI, performance source contracts, `npm run test:ios`, and generic build-for-testing; commit:

```bash
git add ios/FXRacing/Features/Races ios/FXRacingTests/Features/Races \
  ios/FXRacingUITests ios/driver-picker-sheet.test.mjs ios/image-design-system.test.mjs
git commit -m $'Replace pick buttons with autosave status\n\n— gib'
```

---

### Task 6: Guarantee stable race-card geometry and center Schedule

**Status:** Complete in `ed344cb8764db00e209dd1a4681ea4c5b3c8f31c`.

**Task 5C baseline:** `03ad7e06451aba6eeec8c46dd3eda85de56a1a39`

Preserve Task 5C invariants while doing layout work: saved picks must not disappear solely because driver metadata is temporarily unavailable; metadata refreshes must not mutate or invalidate persisted user selections; UI presentation and persistence stay decoupled. Keep the generic unresolved-pick fallback (`Saved pick` / `Driver details unavailable`) unless a future UX task explicitly replaces it. Do not reintroduce `Review device picks` or any equivalent card-level recovery action.

**Files:**
- Create: `ios/FXRacing/Features/Races/UpcomingCardLayoutMetrics.swift`
- Modify: `ios/FXRacing/Features/Races/UpcomingRaceCard.swift`
- Modify: `ios/FXRacing/Features/Races/RacePickPanel.swift`
- Modify: `ios/FXRacing/Features/Races/CenteredRacePager.swift`
- Modify: `ios/FXRacing/Features/Races/RaceScheduleSheet.swift`
- Modify: `ios/FXRacingTests/Features/Races/CenteredRacePagerGeometryTests.swift`
- Create: `ios/FXRacingTests/Features/Races/UpcomingCardLayoutMetricsTests.swift`
- Modify: `ios/FXRacingTests/Features/Races/RaceScheduleSheetTests.swift`
- Modify: `ios/FXRacingUITests/Home/MainShellUITests.swift`
- Modify: `ios/leaderboard-guest-access.test.mjs`

**Interfaces:**
- Produces: deterministic `UpcomingCardLayoutMetrics.cardHeight(for:)`.
- Changes: iPhone `RacePagerGeometry.spacing` from 10 to 18 and `adjacentPeek` to zero.

- [x] **Step 1: Write failing geometry tests**

```swift
for width in [320.0, 375.0, 393.0, 402.0, 430.0] {
    let geometry = RacePagerGeometry(viewportWidth: width)
    XCTAssertEqual(geometry.sideInset, 18, accuracy: 0.001)
    XCTAssertEqual(geometry.spacing, 18, accuracy: 0.001)
    XCTAssertEqual(geometry.adjacentPeek, 0, accuracy: 0.001)
}
```

Assert layout floors are monotonic across Dynamic Type classes and are identical for placeholder, hydrated, saving, conflict, and recovery-available inputs.

- [x] **Step 2: Verify RED**

Run centered-pager, layout-metrics, and Schedule tests; expected failures are spacing 10, missing metrics, and translucent/leading sheet contract.

- [x] **Step 3: Implement precomputed floors**

`UpcomingCardLayoutMetrics` maps each supported `DynamicTypeSize` to a calibrated fixed height covering two race-name lines, two circuit lines, three pick rows, and the two-line rail. It is chosen before interaction and never learned from hydration. Apply the same `.frame(height:)` to placeholder and hydrated cards; detailed errors remain outside.

- [x] **Step 4: Remove optical pager shift**

Use 18-point spacing for iPhone widths, preserve centered offset math, snapping, Reduce Motion, and VoiceOver adjustable actions. Keep wider compatibility layouts composed of complete cards, never clipped slivers.

- [x] **Step 5: Center and opacify Schedule**

Use an opaque dark system presentation background, a centered independent title, equal 18-point margins inside a centered max-width container, and existing medium/large detents plus drag indicator.

- [x] **Step 6: Verify UI frames and commit**

XCUITest compares first/middle/last standard frames, placeholder-to-hydrated frames, and one accessibility content-size launch; Schedule test verifies its content centerline. Run `npm run test:ios` and generic build-for-testing; commit:

```bash
git add ios/FXRacing/Features/Races ios/FXRacingTests/Features/Races \
  ios/FXRacingUITests/Home/MainShellUITests.swift ios/leaderboard-guest-access.test.mjs
git commit -m $'Stabilize race cards and Schedule sheet\n\n— gib'
```

---

### Task 7: Remove the repeated website strip and add screenshot validation

**Files:**
- Modify: `.gitignore`
- Modify: `src/app/page.test.mjs`
- Modify: `src/app/site-chrome.test.mjs`
- Modify: `src/app/page.tsx`
- Modify: `src/app/site.module.css`
- Create: `scripts/app-store-screenshots.mjs`
- Create: `scripts/app-store-screenshots.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run validate:app-store-screenshots -- <directory> <device-name>`.
- Produces: ignored `.artifacts/app-store/` manifest staging.

- [ ] **Step 1: Write failing landing tests**

Assert `data-review-id="landing-rules"`, the repeated bonus sentence, and scoring-only CSS selectors are absent while hero `P1. P10. DNF.` and non-finisher explanation remain.

- [ ] **Step 2: Verify landing RED**

Run `node --test src/app/page.test.mjs src/app/site-chrome.test.mjs`; expected failure is the still-present strip/selectors.

- [ ] **Step 3: Remove the strip and unused CSS**

Delete the complete scoring section so footer follows hero. Delete `.scoringSection`, `.scoringInner`, `.scoreGrid`, `.scoreItem`, `.bonusCopy`, and responsive references. Do not change API/backend routes.

- [ ] **Step 4: Write failing screenshot-validator tests**

Create five tiny fixture metadata responses through an injected `inspectImage` function. Assert accepted portrait dimensions are exactly 1260×2736, 1290×2796, or 1320×2868; reject alpha, unsupported format, wrong dimensions, duplicate canonical IDs, missing required filenames, and incomplete sets.

```js
assert.deepEqual(REQUIRED_SCREENSHOTS, [
  "01-upcoming-autosave.png",
  "02-driver-picker.png",
  "03-driver-form.png",
  "04-past-scoring.png",
  "05-rankings.png",
])
```

- [ ] **Step 5: Verify validator RED**

Run `node --test scripts/app-store-screenshots.test.mjs`; expected failure is missing validator.

- [ ] **Step 6: Implement validator and manifest**

Use `execFile` with argument arrays for `sips`, never shell interpolation. Collect pixel width/height, format, alpha, color space, bytes, and SHA-256; write `manifest.json` containing capture device, canonical screen ID, per-file validation, and overall pass. Add `/.artifacts/app-store/` to `.gitignore`.

- [ ] **Step 7: Verify GREEN and commit**

Run focused page/validator tests, `npm run test:pages`, `npm run test:components`, `npm run test:scripts:static`, and `npm run build`; commit:

```bash
git add .gitignore src/app/page.tsx src/app/site.module.css \
  src/app/page.test.mjs src/app/site-chrome.test.mjs \
  scripts/app-store-screenshots.mjs scripts/app-store-screenshots.test.mjs package.json
git commit -m $'Simplify landing and validate store images\n\n— gib'
```

---

### Task 8: Run complete verification and perform the visual feedback loop

**Files:**
- Modify: `ios/FXRacing/Performance/PerformanceFixtures.swift` if the decode gate needs the worst-case fixture wired into publication.
- Modify: `scripts/ios-performance` and related tests only if a dedicated decode span is required.
- Modify outside repository: canonical localhost annotation companion.

**Interfaces:**
- Produces: exact 3-warmup/30-sample performance evidence.
- Produces: preserved/exported annotation notes and reviewed native screens.

- [ ] **Step 1: Run all static/server checks**

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
```

Expected: all pass with no new warnings attributable to this branch.

- [ ] **Step 2: Regenerate and run native tests**

Run XcodeGen, generic build-for-testing, full FXRacingTests, then focused MainShell UI tests on simulator `9184C625-91BA-4DB0-B467-3D364F2554B5`.

- [ ] **Step 3: Prove real decode and performance gates**

Ensure the race-swipe fixture actually decodes the 22×24 JSON before publication or add a dedicated app-owned decode interval. Run cached launch, offline launch, picker, race selection, Schedule, and local-save scenarios at 3 warmups + 30 measured samples. Do not relax thresholds.

- [ ] **Step 4: Install and inspect the final Release-configuration Simulator build**

Build with the Release configuration and the production API, then install/launch on the existing iPhone 17 Pro Simulator. Exercise initial three-pick autosave, edit autosave, driver sheet, Schedule, first/middle/last swipes, Past, and Rankings. Capture screenshots for comparison, leave the app open for owner acceptance, and do not perform the final App Store submission until the owner approves this build.

- [ ] **Step 5: Preserve and reopen annotation notes**

Before editing the companion, export current browser local-storage notes and record note IDs/count/SHA-256. Preserve all prior views, add canonical IDs `native/upcoming-autosave`, `native/driver-picker`, `native/driver-form`, `native/schedule`, `native/past-scoring`, `native/rankings`, and `web/landing`, then reimport and assert the prior IDs/count are unchanged. Reopen at localhost for user review.

- [ ] **Step 6: Commit any evidence-harness correction**

If Task 3 required a real decode-span change, rerun its failing test red first, implement, rerun green, and commit only those files:

```bash
git commit -m $'Measure worst-case race detail decoding\n\n— gib'
```

---

### Task 9: Select the release version, capture assets, and update landing imagery

**Files:**
- Modify: `ios/project.yml`
- Modify: `ios/FXRacing.xcodeproj/project.pbxproj` through XcodeGen
- Modify: `ios/project-signing.test.mjs`
- Create in ignored staging: `.artifacts/app-store/$VERSION-$BUILD/`
- Create durable owner files: `/Users/gibou/Documents/F10 Releases/$VERSION-$BUILD/app-store/iphone-6.9/`
- Create: `public/landing/fx-racing-race-deck-v2.jpg`
- Create: `public/landing/fx-racing-driver-picker-v2.jpg`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.mjs`
- Create: `docs/release/app-store/$VERSION-$BUILD-handoff.md` after values are known

**Interfaces:**
- Consumes: authenticated App Store Connect version/build state and connected physical iPhone 15 Pro Max.
- Produces: validated 6.9-inch masters, v2 landing derivatives, and exact release identifiers.

- [ ] **Step 1: Resolve Apple authentication without exposing credentials**

Open Xcode Accounts and App Store Connect. The owner enters Apple credentials and any 2FA directly. Confirm team `U6Z87CS4W3` can create a cloud-managed distribution certificate and edit app `6762099290`. If Apple displays a new legal agreement, pause for the Account Holder to read and accept it personally.

- [ ] **Step 2: Select exact version and build**

Public App Store is 1.3.1; source is 1.7.1 (44). In App Store Connect, inspect any 1.7.1 draft and all uploaded builds. Set shell variables to the chosen editable marketing version and the smallest unused build above every existing build. If 1.7.1 cannot be used, create the next version accepted by App Store Connect.

- [ ] **Step 3: Write the failing config expectation, update source, regenerate**

Update `ios/project-signing.test.mjs` to expect the selected literal version/build and run it red. Change only `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml`; run:

```bash
xcodegen generate --spec ios/project.yml
npm run test:ios-config
```

Expected: generated pbxproj matches the selected values and signing contract remains green.

- [ ] **Step 4: Build/install Release on the paired iPhone 15 Pro Max**

Use Xcode-managed signing to build and install the Release configuration on the paired physical device. Exercise all five screenshot states with deterministic public race data and synthetic identity content.

- [ ] **Step 5: Capture and validate five 1290×2796 masters**

Import originals with exact filenames:

```text
01-upcoming-autosave.png
02-driver-picker.png
03-driver-form.png
04-past-scoring.png
05-rankings.png
```

Run `npm run validate:app-store-screenshots -- "$STAGING/iphone-6.9" "iPhone 15 Pro Max"`. Expected: RGB/no alpha, 1290×2796, five unique canonical IDs, overall pass.

- [ ] **Step 6: Copy to durable storage and verify hashes**

Copy masters and manifest to `/Users/gibou/Documents/F10 Releases/$VERSION-$BUILD/app-store/iphone-6.9/`, re-hash every file, and record the expanded durable path plus manifest SHA-256 in the handoff. Only after equality may the staging duplicate be removed.

- [ ] **Step 7: Derive v2 website images**

Use `sips` to downscale masters 01 and 02 without upscaling, export RGB JPEGs at a combined ≤ 409600 bytes, update page image dimensions/paths and `.deviceFrame` aspect ratio, then run page/component/build tests.

- [ ] **Step 8: Commit release identifiers and assets**

```bash
git add ios/project.yml ios/FXRacing.xcodeproj/project.pbxproj \
  ios/project-signing.test.mjs public/landing/fx-racing-race-deck-v2.jpg \
  public/landing/fx-racing-driver-picker-v2.jpg src/app/page.tsx src/app/page.test.mjs \
  src/app/site.module.css docs/release/app-store
git commit -m $'Prepare FX Racing release assets\n\n— gib'
```

---

### Task 10: Review, merge, deploy, archive, upload, and submit

**Files:**
- Create in ignored staging: `.artifacts/app-store/$VERSION-$BUILD/ExportOptions.plist`
- Update: `docs/release/app-store/$VERSION-$BUILD-handoff.md`

**Interfaces:**
- Produces: merged production backend/landing, processed App Store build, uploaded screenshots, and submitted version.

- [ ] **Step 1: Run verification-before-completion**

Run the entire Task 8 suite again on final content, `git diff --check origin/main...HEAD`, secret scan, clean status, and targeted Release archive preflight. Record exact counts and p50/p95 evidence.

- [ ] **Step 2: Push and open the signed PR**

Push `feat/367-ios-autosave-release-polish`; open a draft PR with `Closes #367`, summary, risk notes, performance evidence, screenshot/companion evidence, and a checked Test Plan. End the body with `— gib`.

- [ ] **Step 3: Self-review in GitHub and pass CI**

Inspect the complete GitHub diff, resolve every actionable finding through a new red/green cycle, wait for required checks and Vercel preview, then mark ready.

- [ ] **Step 4: Merge and verify production deployment**

Squash-merge with branch deletion. Fetch `origin/main` in the isolated worktree and archive only the exact merged commit; do not touch the dirty primary checkout. Wait for Vercel production success, then verify `/`, `/privacy`, `/support`, `/api/races`, and a race detail containing compact history.

- [ ] **Step 5: Archive the exact merged Release build**

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "/private/tmp/FXRacing-$VERSION-$BUILD.xcarchive" \
  -allowProvisioningUpdates archive
```

Verify bundle `com.fxracing.app`, version/build, entitlements, Release optimization, privacy manifest, no performance harness, and successful validation.

- [ ] **Step 6: Upload and wait for processing**

Create ignored `ExportOptions.plist` with method `app-store-connect`, destination `upload`, automatic signing, team `U6Z87CS4W3`, `manageAppVersionAndBuildNumber=false`, and symbols enabled. Run `xcodebuild -exportArchive`, resolve validation errors, and wait until App Store Connect finishes processing.

- [ ] **Step 7: Update App Store metadata and screenshots**

Upload the five 6.9-inch images in filename order and select the processed build. Use this What's New text:

```text
Picks now save automatically as soon as P1, P10, and DNF are complete. Tap any driver in Season form to see every recent result behind their average. Race cards and Schedule are also smoother, cleaner, and easier to read.
```

Update the description if the current listing still presents P10 as the only game; state the three-pick P1/P10/DNF rules exactly. Verify support/privacy URLs, age rating, export compliance, content rights, privacy answers, review contact, and guest-mode review instructions.

- [ ] **Step 8: Submit for Review**

The owner's 2026-07-19 instruction “approved and lets get a new version submitted today” authorizes the final Submit for Review action. Submit once every required field is complete and the selected build/screenshots are correct. Do not accept new Apple legal agreements on the owner's behalf.

- [ ] **Step 9: Finalize durable handoff**

Record merged commit/PR, Vercel deployment, archive validation, upload/processing/submission state and timestamp, App Store version/build, durable screenshot path/hash, and any Apple review blocker in the committed handoff. If the handoff changes after merge, file a documentation-only follow-up PR rather than pushing main directly.

---

## Plan Self-Review Checklist

- [x] Every approved spec section maps to Tasks 1–10.
- [x] Every production behavior begins with a failing focused test and observed RED result.
- [x] TypeScript `seasonDnfCount` stays compatible while UI copy truthfully says OUT.
- [x] Swift `seasonResults` and new Pick authority fields decode older payloads/caches.
- [x] Legacy recovery cannot act under unknown/stale account authority.
- [x] Picker dismisses only after a readable local revision exists.
- [x] No conditional action changes race-card height.
- [x] Worst-case payload is measured through real decode, not only an in-memory repository stub.
- [x] Website note tooling remains outside shipped source.
- [x] App Store credentials, secrets, and 2FA never enter commands, logs, or the repo.
- [x] Store submission uses the exact merged commit and an unused version/build.

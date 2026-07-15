# F10 iOS Race Deck and Client Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Apple Sports-inspired, picks-first native iOS race deck with safe local saving, cached-first loading, measurable speed, and a Release build running on the user's open iPhone 17 Pro simulator.

**Architecture:** A single `MainShellView` owns Upcoming/Past/Rankings and reuses one repository-backed `RaceDeckViewModel`. Public race data flows through an actor-based memory/disk stale-while-revalidate repository; private picks stay in an owner-scoped local outbox and use an explicit direct-save/background-retry state machine. Focused SwiftUI cards and sheets consume `RaceDetailViewModel`, while native tests, a Performance-only UI harness, and the existing annotatable browser companion verify behavior and perceived speed.

**Tech Stack:** Swift 6, SwiftUI, Observation, structured concurrency/actors, XCTest/XCUITest, OSLog signposts, ImageIO, XcodeGen 2.45.3, Xcode 26.5, iOS 17 deployment floor with iOS 26 Liquid Glass availability guards, Node source/configuration regressions.

## Global Constraints

- Preserve the game exactly: P1 winner, P10 finisher, first DNF, three distinct entrants, existing lock cutoff, pre-qualifying 2× bonus, scoring, and rankings.
- Keep the server authoritative; preserve HTTP 423, guest-migration server-wins behavior, race locking, snapshot scoring, and early-bird server receipt time.
- Keep production API/CDN work in #361 and conditional cross-device writes in #362; #360 is native-client/simulator work.
- Cache only public race list/detail data; never put private server picks or tokens in the race snapshot cache.
- Keep `IPHONEOS_DEPLOYMENT_TARGET` at 17.0 and `SWIFT_VERSION` at 6.0; use real Liquid Glass only behind `#available(iOS 26.0, *)`.
- Add no third-party iOS dependency. Use Foundation, SwiftUI, Observation, ImageIO, OSLog, XCTest, and XCUITest.
- `FX_PERF_HARNESS` may exist only in the non-archiving Performance configuration; normal Release/Archive must never compile it.
- Dense results, qualifying, and rankings use opaque adaptive surfaces; glass is limited to navigation, controls, sheets, and the primary action.
- Keep the original dirty checkout untouched. All changes stay in `/Users/gibou/code/github/f10_fantasy/.worktrees/feat-360-ios-race-deck-performance`.
- Every commit and PR body ends with `— gib` and contains no AI co-author/footer.
- Every visual checkpoint must be mirrored into the coordinate-pinned review companion; annotation code and screenshots never ship in the app target.

---

### Task 13: Review correction amendment — 2026-07-15

The Simulator review exposed three acceptance gaps. Complete these on the same issue/branch before final handoff:

1. Add red regressions proving the Performance gameplay fixture exposes all 22 active 2026 entrants across 11 constructors, and that P1/P10/DNF pick rows do not opt into horizontal fixed sizing.
2. Add red service/model tests for optional `seasonAverageFinish` and `seasonDnfCount` entrant fields. Compute them from completed, earlier races in the same season and same race type; average only classified positions, while the DNF count follows the game's existing non-classified (`DNF`/`DNS`/`DSQ`) semantics.
3. Replace the Upcoming `.previousRace` context with `.seasonForm`. Render a compact Apple Sports-style Driver/Avg/DNF table before qualifying; qualifying rows still replace it immediately when present. Remove the obsolete previous-race view plumbing.
4. Expand the deterministic gameplay fixture to the same 22-driver/11-team field and include varied season-form values. Keep the benchmark data deterministic and preserve every existing gameplay/scoring rule.
5. Remove the pick-row horizontal `.fixedSize` constraint so the existing spacer pins each chevron to the card's trailing edge. Preserve the `ViewThatFits` compact fallback and accessibility reading order.
6. Run targeted Node and XCTest/UI checks first, then the full iOS/static/type/lint/build suites. Rebuild, install, and launch the Performance gameplay app on the normal iPhone 17 Pro simulator; refresh the same coordinate-pinned localhost review companion without deleting earlier screens or notes.

---

### Task 1: Native test targets and non-shipping Performance configuration

**Files:**
- Create: `ios/project-test-targets.test.mjs`
- Create: `ios/performance-harness-config.test.mjs`
- Create: `ios/FXRacingTests/Fixtures/RaceFixtures.swift`
- Create: `ios/FXRacingTests/Fixtures/DriverFixtures.swift`
- Create: `ios/FXRacingUITests/PerformanceScenario.swift`
- Create: `ios/FXRacingUITests/Fixtures/ReviewLaunch.swift`
- Modify: `ios/project.yml`
- Modify: `package.json`
- Regenerate: `ios/FXRacing.xcodeproj/project.pbxproj`
- Regenerate: `ios/FXRacing.xcodeproj/xcshareddata/xcschemes/FXRacing.xcscheme`
- Create by regeneration: `ios/FXRacing.xcodeproj/xcshareddata/xcschemes/FXRacingPerformance.xcscheme`

**Interfaces:**
- Produces: `FXRacingTests`, `FXRacingUITests`, `Performance`, and `FXRacingPerformance` for every later task.
- Produces: `RaceFixtures`, `DriverFixtures`, `PerformanceScenario`, and `launch(_:)` used by later native/UI tests.

- [ ] **Step 1: Write failing manifest regressions**

```js
test("native tests are app-hosted and the performance scheme cannot archive", () => {
  assert.match(projectYml, /FXRacingTests:\s*\n\s*type: bundle\.unit-test/)
  assert.match(projectYml, /FXRacingUITests:\s*\n\s*type: bundle\.ui-testing/)
  assert.match(projectYml, /Performance: release/)
  assert.match(projectYml, /SWIFT_ACTIVE_COMPILATION_CONDITIONS: FX_PERF_HARNESS/)
  assert.doesNotMatch(performanceScheme, /<ArchiveAction/)
  assert.match(normalScheme, /<ArchiveAction[\s\S]*buildConfiguration = "Release"/)
})
```

- [ ] **Step 2: Run the new regressions and confirm the red state**

Run: `node --test ios/project-test-targets.test.mjs ios/performance-harness-config.test.mjs`

Expected: FAIL because the test targets, Performance configuration, and scheme do not exist.

- [ ] **Step 3: Add the exact XcodeGen configuration and targets**

```yaml
configs:
  Debug: debug
  Performance: release
  Release: release

targets:
  FXRacingTests:
    type: bundle.unit-test
    platform: iOS
    deploymentTarget: "17.0"
    sources:
      - path: FXRacingTests
    dependencies:
      - target: FXRacing
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.fxracing.app.tests
        GENERATE_INFOPLIST_FILE: YES

  FXRacingUITests:
    type: bundle.ui-testing
    platform: iOS
    deploymentTarget: "17.0"
    sources:
      - path: FXRacingUITests
    dependencies:
      - target: FXRacing
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.fxracing.app.uitests
        GENERATE_INFOPLIST_FILE: YES
```

Add `Performance` app settings with `SWIFT_ACTIVE_COMPILATION_CONDITIONS: FX_PERF_HARNESS`, add the normal shared scheme with Release archive, and add `FXRacingPerformance` without an archive action.

- [ ] **Step 4: Add deterministic fixtures and register the Node tests**

```swift
enum RaceFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)
    static func race(id: String, round: Int, status: RaceStatus, startOffset: TimeInterval) -> Race {
        Race(
            id: id,
            seasonId: "season-2026",
            round: round,
            name: "Race \(round)",
            circuitName: "Circuit \(round)",
            country: "Belgium",
            type: .main,
            scheduledStartUtc: now.addingTimeInterval(startOffset),
            lockCutoffUtc: now.addingTimeInterval(startOffset - 120),
            status: status,
            qualifyingStartUtc: now.addingTimeInterval(startOffset - 86_400)
        )
    }

    static let season2026 = Season(id: "season-2026", year: 2026)
    static let upcoming = race(id: "monza", round: 2, status: .upcoming, startOffset: 172_800)
    static let liveSpa = race(id: "spa", round: 1, status: .live, startOffset: 3_600)
    static let completedSpa = race(id: "spa", round: 1, status: .completed, startOffset: -3_600)
    static let upcomingMonza = upcoming
}

enum DriverFixtures {
    static let constructor = DriverConstructor(id: "mclaren", name: "McLaren", shortName: "MCL", color: "FF8700", slug: "mclaren", logoUrl: nil)
    static let norris = Driver(id: "norris", code: "NOR", firstName: "Lando", lastName: "Norris", number: 4, photoUrl: nil, seatKey: "mclaren-1", constructor: constructor)
    static let piastri = Driver(id: "piastri", code: "PIA", firstName: "Oscar", lastName: "Piastri", number: 81, photoUrl: nil, seatKey: "mclaren-2", constructor: constructor)
    static let leclerc = Driver(id: "leclerc", code: "LEC", firstName: "Charles", lastName: "Leclerc", number: 16, photoUrl: nil, seatKey: "ferrari-1", constructor: DriverConstructor(id: "ferrari", name: "Ferrari", shortName: "FER", color: "E80020", slug: "ferrari", logoUrl: nil))
}

enum PerformanceScenario: String {
    case authChecking = "auth-checking"
    case accountUnavailable = "account-unavailable"
    case cached = "cached"
    case cachedLaunch = "cached-launch"
}

extension XCTestCase {
    func launch(_ scenario: PerformanceScenario) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--performance-scenario", scenario.rawValue]
        app.launch()
        return app
    }
}
```

Append both new `.mjs` files to the explicit `test:ios` command.

- [ ] **Step 5: Generate once and verify the green configuration**

Run:

```bash
cd ios
xcodegen generate
cd ..
node --test ios/project-test-targets.test.mjs ios/performance-harness-config.test.mjs
npm run test:ios
```

Expected: configuration tests PASS; existing 28 iOS checks remain PASS; generated diff contains exactly three targets and the two shared schemes.

- [ ] **Step 6: Commit the test foundation**

```bash
git add ios/project.yml ios/FXRacing.xcodeproj ios/FXRacingTests ios/FXRacingUITests ios/project-test-targets.test.mjs ios/performance-harness-config.test.mjs package.json
git commit -m $'Add native iOS test configurations\n\n— gib'
```

### Task 2: Injectable networking, shared response models, and clocks

**Files:**
- Create: `ios/FXRacing/Core/Networking/APIRequesting.swift`
- Create: `ios/FXRacing/Core/Networking/APIResponseModels.swift`
- Create: `ios/FXRacing/Core/Time/ClockProviding.swift`
- Create: `ios/FXRacingTests/Fixtures/APIClientSpy.swift`
- Create: `ios/FXRacingTests/Fixtures/TestClock.swift`
- Create: `ios/FXRacingTests/Core/Networking/APIClientTests.swift`
- Modify: `ios/FXRacing/Core/Networking/APIClient.swift`
- Modify: `ios/FXRacing/Features/Races/RacesListViewModel.swift`
- Modify: `ios/FXRacing/Features/Races/RaceDetailViewModel.swift`
- Modify: `ios/FXRacing/Core/Sync/SyncManager.swift`

**Interfaces:**
- Produces: `APIRequesting.request(_:token:)`, `RaceListPayload`, `RaceDetailPayload`, `PickResponse`, and `ClockProviding.now()`.
- Consumes: native XCTest target from Task 1.

- [ ] **Step 1: Write failing injection and response-decoding tests**

```swift
func testInjectedSessionNormalizesNotFound() async {
    let session = URLSession(configuration: StubURLProtocol.configuration(status: 404, body: #"{"error":"missing"}"#))
    let client = APIClient(baseURL: URL(string: "https://example.test")!, session: session)
    do {
        let _: PickResponse = try await client.request(.pickForRace(raceId: "race"), token: "token")
        XCTFail("Expected notFound")
    } catch APIError.notFound {
    } catch {
        XCTFail("Unexpected error: \(error)")
    }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = Data()
    static func configuration(status: Int, body: String) -> URLSessionConfiguration {
        Self.status = status
        Self.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return configuration
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
```

- [ ] **Step 2: Run the targeted test and confirm it fails to compile**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/APIClientTests`

Expected: FAIL because session injection and shared payloads do not exist.

- [ ] **Step 3: Add the production seams**

```swift
protocol APIRequesting: Sendable {
    func request<T: Decodable & Sendable>(_ endpoint: APIEndpoint, token: String?) async throws -> T
}

extension APIClient: APIRequesting {}

struct RaceListPayload: Codable, Sendable {
    let races: [Race]
    let season: Season?
}

struct RaceDetailPayload: Codable, Sendable {
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
    let qualifyingResults: [QualifyingResultRow]?
}

struct PickResponse: Codable, Sendable {
    let pick: Pick
}

protocol ClockProviding: Sendable { func now() -> Date }
struct SystemClock: ClockProviding { func now() -> Date { Date() } }

struct TestClock: ClockProviding {
    let date: Date
    func now() -> Date { date }
    static let fixed = TestClock(date: RaceFixtures.now)
}

actor APIClientSpy: APIRequesting {
    enum Stub: @unchecked Sendable {
        case data(Data)
        case failure(APIError)
        static func json<T: Encodable & Sendable>(_ value: T) -> Stub {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            return .data(try! encoder.encode(value))
        }
    }
    private let responses: [String: Stub]
    private(set) var requests: [String] = []
    init(responses: [String: Stub]) { self.responses = responses }
    var methods: [String] { requests.map { String($0.split(separator: " ", maxSplits: 1)[0]) } }
    var totalCallCount: Int { requests.count }
    func calls(to path: String) -> Int { requests.filter { $0.hasSuffix(" \(path)") }.count }
    func request<T: Decodable & Sendable>(_ endpoint: APIEndpoint, token: String?) async throws -> T {
        let key = "\(endpoint.method) \(endpoint.path)"
        requests.append(key)
        guard let stub = responses[key] else { throw APIError.notFound }
        switch stub {
        case .data(let data): return try JSONDecoder.api().decode(T.self, from: data)
        case .failure(let error): throw error
        }
    }
}
```

Change `APIClient.init` to accept `session: URLSession = .shared`, and remove the duplicate private response structs from view models/sync code.

- [ ] **Step 4: Verify targeted and existing networking behavior**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/APIClientTests
node --test ios/api-client-unauthorized.test.mjs ios/api-client-decode-logging.test.mjs ios/api-endpoint-json-body.test.mjs
```

Expected: all tests PASS and logs still exclude response bodies/tokens.

- [ ] **Step 5: Commit the networking boundary**

```bash
git add ios/FXRacing/Core/Networking ios/FXRacing/Core/Time ios/FXRacingTests/Fixtures/APIClientSpy.swift ios/FXRacingTests/Core/Networking ios/FXRacing/Features/Races ios/FXRacing/Core/Sync
git commit -m $'Add injectable iOS networking boundaries\n\n— gib'
```

### Task 3: Atomic public race snapshots and coalesced repository

**Files:**
- Create: `ios/FXRacing/Core/Races/RaceSnapshots.swift`
- Create: `ios/FXRacing/Core/Races/RaceSnapshotCache.swift`
- Create: `ios/FXRacing/Core/Races/RaceRepository.swift`
- Create: `ios/FXRacingTests/Fixtures/MemoryRaceSnapshotCache.swift`
- Create: `ios/FXRacingTests/Core/Races/RaceSnapshotCacheTests.swift`
- Create: `ios/FXRacingTests/Core/Races/RaceRepositoryTests.swift`

**Interfaces:**
- Consumes: `APIRequesting`, response payloads, and `ClockProviding` from Task 2.
- Produces: `RaceRepositoryProtocol.cachedList()`, `refreshList(policy:)`, `cachedDetail(id:)`, `refreshDetail(id:policy:)`, and `prefetchDetail(ids:)`.

- [ ] **Step 1: Write failing cache and repository tests**

```swift
func testConcurrentListRefreshesShareOneRequest() async throws {
    let api = APIClientSpy(responses: ["GET /api/races": .json(RaceListPayload(races: [RaceFixtures.upcoming], season: RaceFixtures.season2026))])
    let repository = RaceRepository(api: api, cache: MemoryRaceSnapshotCache(), clock: TestClock.fixed)
    async let first = repository.refreshList(policy: .force)
    async let second = repository.refreshList(policy: .force)
    _ = try await (first, second)
    XCTAssertEqual(await api.calls(to: "/api/races"), 1)
}

func testForegroundListRefreshUsesThirtySecondBoundary() async throws {
    let cache = MemoryRaceSnapshotCache(list: RaceListSnapshot(schemaVersion: 1, savedAt: RaceFixtures.now.addingTimeInterval(-29), season: RaceFixtures.season2026, races: [RaceFixtures.upcoming]))
    let api = APIClientSpy(responses: [:])
    let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
    _ = try await repository.refreshList(policy: .foreground)
    XCTAssertEqual(await api.totalCallCount, 0)
}
```

Add round-trip, corrupt-entry isolation, incompatible-version deletion, atomic replacement, list/detail TTL, season rollover, and active-plus-next prefetch tests.

- [ ] **Step 2: Run repository tests and confirm the red state**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceSnapshotCacheTests -only-testing:FXRacingTests/RaceRepositoryTests`

Expected: FAIL because snapshots/repository do not exist.

- [ ] **Step 3: Implement the snapshot types and cache protocol**

```swift
struct RaceListSnapshot: Codable, Sendable {
    static let currentSchemaVersion = 1
    let schemaVersion: Int
    let savedAt: Date
    let season: Season?
    let races: [Race]
}

struct RaceDetailSnapshot: Codable, Sendable {
    static let currentSchemaVersion = 1
    let schemaVersion: Int
    let savedAt: Date
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
    let qualifyingResults: [QualifyingResultRow]
}

enum RaceFetchPolicy: Sendable { case ifStale, foreground, force }

protocol RaceSnapshotCaching: Sendable {
    func readList() async throws -> RaceListSnapshot?
    func writeList(_ snapshot: RaceListSnapshot) async throws
    func readDetail(id: String) async throws -> RaceDetailSnapshot?
    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws
    func removeDetail(id: String) async
    func pruneDetails(keeping raceIDs: Set<String>) async
}

actor MemoryRaceSnapshotCache: RaceSnapshotCaching {
    var list: RaceListSnapshot?
    var details: [String: RaceDetailSnapshot] = [:]
    init(list: RaceListSnapshot? = nil) { self.list = list }
    func readList() async throws -> RaceListSnapshot? { list }
    func writeList(_ snapshot: RaceListSnapshot) async throws { list = snapshot }
    func readDetail(id: String) async throws -> RaceDetailSnapshot? { details[id] }
    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws { details[snapshot.race.id] = snapshot }
    func removeDetail(id: String) async { details.removeValue(forKey: id) }
    func pruneDetails(keeping raceIDs: Set<String>) async { details = details.filter { raceIDs.contains($0.key) } }
}
```

Persist under `Caches/FXRacing/RaceSnapshots/v1` with `Data.write(options: .atomic)` and discard only the corrupt/incompatible entry.

- [ ] **Step 4: Implement actor-owned memory, freshness, and task coalescing**

```swift
protocol RaceRepositoryProtocol: Sendable {
    func cachedList() async -> RaceListSnapshot?
    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot
    func cachedDetail(id: String) async -> RaceDetailSnapshot?
    func refreshDetail(id: String, policy: RaceFetchPolicy) async throws -> RaceDetailSnapshot
    func prefetchDetail(ids: [String]) async
}
```

Use one in-flight list task, one task per race ID, 60-second list/live TTL, 5-minute scheduled-detail TTL, 6-hour completed-detail TTL, and a 30-second foreground list boundary. `.force` bypasses freshness but joins an existing request. A season change atomically replaces the list and prunes orphan details after publication.

- [ ] **Step 5: Run tests twice to catch task-lifetime flakiness**

Run:

```bash
for run in 1 2; do xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceSnapshotCacheTests -only-testing:FXRacingTests/RaceRepositoryTests || exit 1; done
```

Expected: both runs PASS; coalescing spy reports one request.

- [ ] **Step 6: Commit the public repository**

```bash
git add ios/FXRacing/Core/Races ios/FXRacingTests/Core/Races
git commit -m $'Add cached iOS race repository\n\n— gib'
```

### Task 4: Owner-scoped local-pick v2 storage

**Files:**
- Create: `ios/FXRacing/Core/Storage/LocalPickRecord.swift`
- Create: `ios/FXRacingTests/Core/Storage/LocalPickStoreTests.swift`
- Modify: `ios/FXRacing/Core/Storage/LocalPickStore.swift`
- Modify: `ios/offline-pick-migration-expired.test.mjs`

**Interfaces:**
- Produces: `PickSelection`, `PickOwnerScope`, `LocalPickRecordID`, `LocalPickSyncState`, `LocalPickSaveResult`, owner-filtered `record`, `queuedRecords`, `save`, and revision-checked `transition`.
- Consumes: `Race` lock behavior and clock seam.

- [ ] **Step 1: Write failing migration, revision, and account-isolation tests**

```swift
func testFailedV1AuthenticatedUploadBecomesLegacyConflict() throws {
    let legacy = LegacyLocalPickV1(raceId: "spa", winnerId: "norris", p10Id: "piastri", dnfId: "leclerc", savedAt: RaceFixtures.now, synced: false, migrationStatus: nil)
    defaults.set(try JSONEncoder().encode(["spa": legacy]), forKey: "localPicks_v1")
    let store = LocalPickStore(defaults: defaults, clock: TestClock.fixed)
    let record = try XCTUnwrap(store.legacyConflict(for: "spa"))
    XCTAssertEqual(record.id.owner, .legacyAmbiguous)
    XCTAssertEqual(record.syncState, .conflict(.legacyNeedsReview))
    XCTAssertTrue(store.queuedRecords(currentUserID: "user-b").isEmpty)
}

func testAccountARecordIsHiddenFromAccountB() {
    let store = LocalPickStore(defaults: defaults, clock: TestClock.fixed)
    _ = store.save(
        selection: PickSelection(winnerDriverID: "norris", tenthPlaceDriverID: "piastri", dnfDriverID: "leclerc"),
        race: RaceFixtures.liveSpa,
        owner: .user("a"),
        now: RaceFixtures.now
    )
    XCTAssertNil(store.record(for: "spa", owner: .user("b")))
    XCTAssertTrue(store.queuedRecords(currentUserID: "b").isEmpty)
}
```

Also test store-wide monotonic revisions, unchanged-save joining, persisted `.syncing` normalization to `.queued`, conflict/expired retry exclusion, and v1 key deletion only after v2 persistence succeeds.

- [ ] **Step 2: Run storage tests and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/LocalPickStoreTests`

Expected: FAIL because v2 record types/store methods do not exist.

- [ ] **Step 3: Implement the v2 record model**

```swift
struct PickSelection: Codable, Equatable, Sendable {
    let winnerDriverID: String
    let tenthPlaceDriverID: String
    let dnfDriverID: String
}

enum PickOwnerScope: Codable, Hashable, Sendable {
    case guest
    case user(String)
    case legacyAmbiguous
}

enum PickConflictReason: String, Codable, Sendable { case serverWins, accountPickFound, legacyNeedsReview }
enum PickSyncMode: String, Codable, Sendable { case direct, guestMigration, authenticatedRetry }
enum LocalPickSyncState: Codable, Equatable, Sendable {
    case queued
    case syncing(revision: UInt64, mode: PickSyncMode)
    case confirmed
    case conflict(PickConflictReason)
    case expired
}
```

Persist a v2 envelope containing `schemaVersion`, `nextRevision`, and `[LocalPickRecord]`; index records by owner/race in memory.

- [ ] **Step 4: Implement safe legacy migration and owner-filtered mutations**

Every ownerless non-expired v1 record becomes `.legacyAmbiguous/.conflict(.legacyNeedsReview)` and every expired record stays expired. Signed-out/unknown saves use `.guest`; authenticated saves use `.user(currentUserID)`. Every transition requires both record ID and captured revision.

- [ ] **Step 5: Verify native and source regressions**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/LocalPickStoreTests
node --test ios/offline-pick-migration-expired.test.mjs
```

Expected: PASS; the source regression asserts owner scope, revision checks, 423 expiry, and no automatic legacy retry.

- [ ] **Step 6: Commit local storage v2**

```bash
git add ios/FXRacing/Core/Storage ios/FXRacingTests/Core/Storage ios/offline-pick-migration-expired.test.mjs
git commit -m $'Protect local picks across accounts\n\n— gib'
```

### Task 5: Direct-save and background-retry sync state machine

**Files:**
- Create: `ios/FXRacingTests/Core/Sync/SyncManagerTests.swift`
- Modify: `ios/FXRacing/Core/Sync/SyncManager.swift`
- Modify: `ios/FXRacing/Core/Auth/AuthManager.swift`
- Create: `ios/FXRacing/Core/Auth/TokenStoring.swift`
- Modify: `ios/FXRacing/FXRacingApp.swift`

**Interfaces:**
- Consumes: owner-scoped records from Task 4 and `APIRequesting` from Task 2.
- Produces: `submitExplicit(id:revision:token:localPickStore:)` and `resumeEligiblePicks(currentUserID:token:localPickStore:races:)`.

- [ ] **Step 1: Write the state-transition matrix as failing tests**

```swift
func testExplicitSavePostsWithoutPreflightGet() async {
    let result = await manager.submitExplicit(id: record.id, revision: record.revision, token: "t", localPickStore: store)
    guard case .saved(let pick) = result else { return XCTFail("Expected saved result") }
    XCTAssertEqual(pick.raceId, record.id.raceID)
    XCTAssertEqual(await api.methods, ["POST"])
}

func testDifferentServerPickMovesRetryToConflict() async {
    await manager.resumeEligiblePicks(currentUserID: "a", token: "t", localPickStore: store, races: [RaceFixtures.upcoming])
    XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.syncState, .conflict(.accountPickFound))
    XCTAssertEqual(await api.methods, ["GET"])
}
```

Cover identical 200, differing 200, 401, 404→POST, 423→expired, 5xx→queued, duplicate task joining, newer-revision loop, stale acknowledgement rejection, account A/B/A, guest migration, and legacy/conflict/expired exclusion.

- [ ] **Step 2: Run sync tests and confirm the red state**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/SyncManagerTests`

Expected: FAIL because the new sync entry points do not exist.

- [ ] **Step 3: Implement explicit and automatic paths with one worker per owner/race**

```swift
enum PickSyncResult: Sendable {
    case saved(Pick)
    case queued
    case conflict(Pick?)
    case expired(Pick?)
    case unauthorized
}

func submitExplicit(
    id: LocalPickRecordID,
    revision: UInt64,
    token: String,
    localPickStore: LocalPickStore
) async -> PickSyncResult

func resumeEligiblePicks(
    currentUserID: String,
    token: String,
    localPickStore: LocalPickStore,
    races: [Race]
) async
```

Direct user saves POST immediately. Automatic retry GETs first, confirms identical IDs, records differing picks as conflict, POSTs only after 404, and applies any response only when the captured revision is still current.

- [ ] **Step 4: Make authentication restoration honest and restart eligible queues**

Inject `APIRequesting`, `TokenStoring`, and `SyncManager`. Add `AuthManager.State.accountUnavailable`: a 200 publishes `.authenticated` then resumes guest/current-user queues; 401 deletes the token and signs out; network/5xx retains the token, publishes `.accountUnavailable`, and exposes Retry without enabling private requests. Foreground activation retries restoration from `.unknown`/`.accountUnavailable` or resumes eligible queues without blocking public content.

- [ ] **Step 5: Verify the full sync matrix**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/SyncManagerTests
npm run test:ios
```

Expected: all tests PASS; no server pick is overwritten automatically after a conflicting GET.

- [ ] **Step 6: Commit save synchronization**

```bash
git add ios/FXRacing/Core/Sync ios/FXRacing/Core/Auth ios/FXRacing/FXRacingApp.swift ios/FXRacingTests/Core/Sync
git commit -m $'Make pick synchronization revision safe\n\n— gib'
```

### Task 6: Cached-first, concurrent race-detail hydration

**Files:**
- Create: `ios/FXRacingTests/Features/Races/RaceDetailViewModelTests.swift`
- Modify: `ios/FXRacing/Features/Races/RaceDetailViewModel.swift`
- Rewrite: `ios/race-detail-load-reset.test.mjs`

**Interfaces:**
- Consumes: `RaceRepositoryProtocol`, `APIRequesting`, `SyncManager`, owner-scoped `LocalPickStore`, `ClockProviding`.
- Produces: summary-first `RaceDetailViewModel`, `loadIfNeeded`, `refresh`, `PickSubmissionState`, stable selection IDs, and explicit save/conflict states for cards.

- [ ] **Step 1: Write failing hydration and stale-generation tests**

```swift
func testCachedDetailAndPrivatePickStartWithoutClearingDirtyDraft() async {
    let detail = RaceDetailSnapshot(
        schemaVersion: 1,
        savedAt: RaceFixtures.now,
        race: RaceFixtures.upcoming,
        entrants: [DriverFixtures.norris, DriverFixtures.piastri, DriverFixtures.leclerc],
        results: [],
        qualifyingResults: []
    )
    let cache = MemoryRaceSnapshotCache()
    try! await cache.writeDetail(detail)
    let serverPick = Pick(id: "server", raceId: "monza", tenthPlaceDriverId: "norris", winnerDriverId: "leclerc", dnfDriverId: "piastri", lockedAt: nil, scoreBreakdown: nil)
    let api = APIClientSpy(responses: [
        "GET /api/races/monza": .json(RaceDetailPayload(race: RaceFixtures.upcoming, entrants: detail.entrants, results: [], qualifyingResults: [])),
        "GET /api/picks": .json(PickResponse(pick: serverPick)),
    ])
    let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
    let defaults = UserDefaults(suiteName: #function)!
    defaults.removePersistentDomain(forName: #function)
    let store = LocalPickStore(defaults: defaults, clock: TestClock.fixed)
    let sync = SyncManager(api: api)
    let vm = RaceDetailViewModel(summary: RaceFixtures.upcoming, repository: repository, api: api, syncManager: sync, clock: TestClock.fixed)
    vm.select(driver: DriverFixtures.norris, for: .winner)
    await vm.loadIfNeeded(token: "t", userID: "a", localPickStore: store)
    XCTAssertEqual(vm.selectedWinner?.id, DriverFixtures.norris.id)
}
```

Cover cached publication, concurrent public/private requests, local hydration, private 404/5xx, entrant re-resolution, dirty-server precedence, 423, explicit direct save, and `loadIfNeeded` joining.

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceDetailViewModelTests`

Expected: FAIL because dependencies and concurrent hydration do not exist.

- [ ] **Step 3: Replace destructive resets with selection-ID reconciliation**

```swift
enum PickSubmissionState: Equatable {
    case idle, savingLocally, savedOnDevice, syncing, savedToAccount, conflict, expired
}

func loadIfNeeded(
    token: String?,
    userID: String?,
    localPickStore: LocalPickStore,
    force: Bool = false
) async
```

Initialize with the `Race` summary. Publish cache first; start detail refresh and private GET concurrently; increment/check `loadGeneration`; re-resolve existing selected IDs against new entrants; never clear a dirty/queued/syncing/conflict draft.

- [ ] **Step 4: Implement local-first submission state**

Persist and show `.savedOnDevice` before networking. Signed-out/unknown remains device-only. Authenticated explicit Save calls `submitExplicit`; only a matching current revision becomes `.savedToAccount`. Map 423/conflict/unauthorized/network results to the exact visible states.

- [ ] **Step 5: Replace the obsolete reset source regression**

```js
test("detail refresh preserves a dirty draft and generation guards every merge", () => {
  assert.match(source, /loadGeneration/)
  assert.match(source, /guard generation == loadGeneration/)
  assert.doesNotMatch(source, /selectedWinner = nil[\s\S]*selectedP10 = nil[\s\S]*selectedDNF = nil/)
  assert.match(source, /case \.savedOnDevice/)
  assert.match(source, /case \.savedToAccount/)
})
```

- [ ] **Step 6: Verify and commit detail hydration**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceDetailViewModelTests
node --test ios/race-detail-load-reset.test.mjs
```

Then commit:

```bash
git add ios/FXRacing/Features/Races/RaceDetailViewModel.swift ios/FXRacingTests/Features/Races/RaceDetailViewModelTests.swift ios/race-detail-load-reset.test.mjs
git commit -m $'Hydrate race details without UI waterfalls\n\n— gib'
```

### Task 7: Race-deck state and exact centered pager

**Files:**
- Create: `ios/FXRacing/Features/Races/RaceDeckViewModel.swift`
- Create: `ios/FXRacing/Features/Races/CenteredRacePager.swift`
- Create: `ios/FXRacingTests/Fixtures/RaceRepositoryStub.swift`
- Create: `ios/FXRacingTests/Features/Races/RaceDeckViewModelTests.swift`
- Create: `ios/FXRacingTests/Features/Races/CenteredRacePagerGeometryTests.swift`
- Modify: `ios/races-list-ordering.test.mjs`

**Interfaces:**
- Consumes: `RaceRepositoryProtocol` and detail-model factory from Tasks 3 and 6.
- Produces: ordered `upcoming`/`past`, independent selections, lifecycle transition events, active-plus-next prefetch, and generic `CenteredRacePager`.

- [ ] **Step 1: Write failing ordering, transition, and geometry tests**

```swift
func testPhoneGeometryIsSymmetricWithEightPointPeek() {
    for width in [320.0, 375.0, 393.0, 402.0, 430.0] {
        let geometry = RacePagerGeometry(viewportWidth: width)
        XCTAssertEqual(geometry.cardWidth, width - 36)
        XCTAssertEqual(geometry.sideInset, 18)
        XCTAssertEqual(geometry.spacing, 10)
        XCTAssertEqual(geometry.adjacentPeek, 8)
    }
}

func testVisibleUpcomingRaceMovingToPastPreservesDraftAndUpdatesSelections() async {
    let initial = RaceListSnapshot(schemaVersion: 1, savedAt: RaceFixtures.now, season: RaceFixtures.season2026, races: [RaceFixtures.liveSpa, RaceFixtures.upcomingMonza])
    let repository = RaceRepositoryStub(list: initial)
    let vm = RaceDeckViewModel(repository: repository, clock: TestClock.fixed)
    await vm.start()
    vm.selectedUpcomingID = "spa"
    let refreshed = RaceListSnapshot(schemaVersion: 1, savedAt: RaceFixtures.now, season: RaceFixtures.season2026, races: [RaceFixtures.completedSpa, RaceFixtures.upcomingMonza])
    vm.apply(refreshed)
    XCTAssertEqual(vm.selectedUpcomingID, "monza")
    XCTAssertEqual(vm.selectedPastID, "spa")
    XCTAssertEqual(vm.transitionedRaceID, "spa")
}

actor RaceRepositoryStub: RaceRepositoryProtocol {
    var list: RaceListSnapshot?
    init(list: RaceListSnapshot?) { self.list = list }
    func cachedList() async -> RaceListSnapshot? { list }
    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot { try XCTUnwrap(list) }
    func cachedDetail(id: String) async -> RaceDetailSnapshot? { nil }
    func refreshDetail(id: String, policy: RaceFetchPolicy) async throws -> RaceDetailSnapshot { throw APIError.notFound }
    func prefetchDetail(ids: [String]) async {}
}
```

Cover 320/375/393/402/430/768 widths and first/middle/last centering; default selection, empty sections, fallback, independent IDs, and live polling.

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceDeckViewModelTests -only-testing:FXRacingTests/CenteredRacePagerGeometryTests`

Expected: FAIL because the deck and pager types do not exist.

- [ ] **Step 3: Implement pure pager geometry and the shared view**

```swift
struct RacePagerGeometry: Equatable, Sendable {
    let cardWidth: CGFloat
    let sideInset: CGFloat
    let spacing: CGFloat = 10
    var adjacentPeek: CGFloat { max(0, sideInset - spacing) }

    init(viewportWidth: CGFloat) {
        cardWidth = min(viewportWidth - 36, 430)
        sideInset = (viewportWidth - cardWidth) / 2
    }
}
```

Use `ScrollView(.horizontal)`, `LazyHStack(spacing: geometry.spacing)`, `.scrollTargetLayout()`, dynamic symmetric `.contentMargins`, `.viewAligned(limitBehavior: .always)`, and `.scrollPosition(id:)`. Add adjustable accessibility actions and “race N of M.”

- [ ] **Step 4: Implement repository-backed deck state**

Cached list publishes immediately; freshness controls refresh; Upcoming sorts ascending, Past descending; first live/next scheduled/latest completed are defaults. Keep one detail model per visited race, prefetch active plus next only, poll live races every 60 seconds, dismiss sheets on a section transition without clearing the detail draft. With no cache, refresh failure exposes the compact Retry state; with cached content, failure keeps interaction enabled and exposes the dismissible stale banner. Cached detail failure retains useful content and localized missing sections expose their own retry.

- [ ] **Step 5: Retarget the ordering regression and verify**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/RaceDeckViewModelTests -only-testing:FXRacingTests/CenteredRacePagerGeometryTests
node --test ios/races-list-ordering.test.mjs
```

Expected: all tests PASS and the source regression points at `RaceDeckViewModel.swift`.

- [ ] **Step 6: Commit deck behavior**

```bash
git add ios/FXRacing/Features/Races/RaceDeckViewModel.swift ios/FXRacing/Features/Races/CenteredRacePager.swift ios/FXRacingTests/Features/Races ios/races-list-ordering.test.mjs
git commit -m $'Add centered swipeable race deck\n\n— gib'
```

### Task 8: One picks-first shell with persistent Rankings and profile sheet

**Files:**
- Create: `ios/FXRacing/Features/Home/MainShellView.swift`
- Create: `ios/FXRacing/Features/Home/HomeSectionPicker.swift`
- Create: `ios/FXRacing/Performance/PerformanceAppDependencies.swift`
- Create: `ios/FXRacing/Performance/PerformanceFixtures.swift`
- Create: `ios/FXRacing/Performance/DeterministicFailureURLProtocol.swift`
- Create: `ios/FXRacingUITests/Home/MainShellUITests.swift`
- Modify: `ios/FXRacing/RootView.swift`
- Modify: `ios/FXRacing/FXRacingApp.swift`
- Modify: `ios/FXRacing/Features/Rankings/LeaderboardView.swift`

**Interfaces:**
- Consumes: one `RaceDeckViewModel` from Task 7 and existing `LeaderboardViewModel`/`ProfileView`.
- Produces: `MainShellSection`, `MainShellView`, no bottom tabs, profile presentation, and shell accessibility identifiers.

- [ ] **Step 1: Write failing shell UI tests**

```swift
func testShellIsUsableWhileAuthenticationIsChecking() {
    let app = launch(.authChecking)
    XCTAssertTrue(app.otherElements["main-shell"].waitForExistence(timeout: 1))
    XCTAssertTrue(app.segmentedControls["home-section-picker"].isHittable)
    XCTAssertEqual(app.tabBars.count, 0)
}

func testAccountUnavailableKeepsGlobalContentAndOffersRetry() {
    let app = launch(.accountUnavailable)
    XCTAssertTrue(app.otherElements["race-deck"].waitForExistence(timeout: 1))
    app.buttons["profile-button"].tap()
    XCTAssertTrue(app.buttons["account-retry"].waitForExistence(timeout: 1))
}

func testRankingsScopeSurvivesSectionRoundTrip() {
    let app = launch(.cached)
    app.buttons["Rankings"].tap()
    app.buttons["Friends"].tap()
    app.buttons["Upcoming"].tap()
    app.buttons["Rankings"].tap()
    XCTAssertTrue(app.buttons["Friends"].isSelected)
}
```

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacingPerformance -configuration Performance -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-ui-tests test -only-testing:FXRacingUITests/MainShellUITests`

Expected: FAIL because the shell/identifiers do not exist.

- [ ] **Step 3: Implement the shell and root auth presentation**

```swift
enum MainShellSection: String, CaseIterable, Identifiable {
    case upcoming = "Upcoming"
    case past = "Past"
    case rankings = "Rankings"
    var id: Self { self }
}
```

`RootView` always renders `MainShellView`, including `.unknown` and `.accountUnavailable`; username onboarding presents above it only for an authenticated user with no username. `MainShellView` owns section/profile state and one `LeaderboardViewModel`, and embeds content in one `NavigationStack`. Global Rankings remains visible during account checks/failure; Friends shows checking/sign-in/unavailable content as appropriate; Profile shows progress, guest content, account Retry, or the authenticated profile without turning a network failure into sign-out. Preserve welcome/friends/pick tutorials and the expired-pick notice. Under `#if FX_PERF_HARNESS`, the three performance files map `--performance-scenario` to deterministic auth/cache/repository dependencies so UI tests never hit production; no runtime selector exists in normal Debug/Release.

- [ ] **Step 4: Make LeaderboardView accept the shell-owned model**

```swift
struct LeaderboardView: View {
    @Bindable var vm: LeaderboardViewModel
    init(viewModel: LeaderboardViewModel) { self.vm = viewModel }
}
```

Move Global/Friends scope control from principal toolbar into embedded content. Preserve generation guards, guest Global access, Friends sign-in prompt, friend search, and tutorials.

- [ ] **Step 5: Verify shell behavior and no auth launch waterfall**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacingPerformance -configuration Performance -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-ui-tests test -only-testing:FXRacingUITests/MainShellUITests
node --test ios/leaderboard-guest-access.test.mjs ios/leaderboard-stale-response.test.mjs
```

Expected: PASS; `TabView`/bottom tab bar is absent and race cache/auth tasks start independently.

- [ ] **Step 6: Commit the unified shell**

```bash
git add ios/FXRacing/Features/Home ios/FXRacing/Performance ios/FXRacing/RootView.swift ios/FXRacing/FXRacingApp.swift ios/FXRacing/Features/Rankings/LeaderboardView.swift ios/FXRacingUITests/Home
git commit -m $'Replace iOS tabs with picks first shell\n\n— gib'
```

### Task 9: Upcoming/Past cards, progressive picker, schedule, and context

**Files:**
- Create: `ios/FXRacing/Features/Races/RaceDeckView.swift`
- Create: `ios/FXRacing/Features/Races/UpcomingRaceCard.swift`
- Create: `ios/FXRacing/Features/Races/PastRaceCard.swift`
- Create: `ios/FXRacing/Features/Races/RacePickPanel.swift`
- Create: `ios/FXRacing/Features/Races/RaceScheduleSheet.swift`
- Create: `ios/FXRacing/Features/Races/RaceContextView.swift`
- Create: `ios/FXRacing/Features/Races/RaceResultsView.swift`
- Create: `ios/FXRacing/Features/Races/QualifyingResultsView.swift`
- Create: `ios/FXRacingTests/Features/Races/DriverPickerStateTests.swift`
- Create: `ios/FXRacingTests/Features/Races/RaceContextTests.swift`
- Create: `ios/FXRacingUITests/Races/RaceDeckUITests.swift`
- Create: `ios/FXRacingUITests/Races/DriverPickerUITests.swift`
- Create: `ios/FXRacingUITests/Races/ScheduleSheetUITests.swift`
- Modify: `ios/FXRacing/Features/Races/DriverPickerSheet.swift`
- Modify: `ios/FXRacing/Core/Models/Pick.swift`
- Modify initially, then delete after parity: `ios/FXRacing/Features/Races/RaceDetailView.swift`

**Interfaces:**
- Consumes: shell, pager, deck/detail models, and submission state.
- Produces: complete simulator-visible game flow and presentation-only sheets.

- [ ] **Step 1: Write failing picker/context unit tests and core-flow UI tests**

```swift
func testPickerAdvancesWithoutDismissalAndDisablesDuplicates() {
    var state = DriverPickerState(activeSlot: .winner, selectedDriverIDs: [:], isLocked: false)
    XCTAssertTrue(state.select(DriverFixtures.norris))
    XCTAssertEqual(state.activeSlot, .p10)
    XCTAssertFalse(state.isAvailable(DriverFixtures.norris))
    XCTAssertTrue(state.isPresented)
}

func testQualifyingReplacesSeasonFormOnlyWhenRowsExist() {
    XCTAssertEqual(RaceContextKind.resolve(section: .upcoming, qualifyingCount: 0), .seasonForm)
    XCTAssertEqual(RaceContextKind.resolve(section: .upcoming, qualifyingCount: 20), .qualifying)
}
```

UI tests swipe races, assert exact centered frame within one point, choose three distinct drivers in one sheet, save, open/dismiss Schedule, switch to Past, and read server-scored pick totals.

- [ ] **Step 2: Run the targeted tests and confirm failure**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/DriverPickerStateTests -only-testing:FXRacingTests/RaceContextTests
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacingPerformance -configuration Performance -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-ui-tests test -only-testing:FXRacingUITests/RaceDeckUITests
```

Expected: FAIL because the cards/sheets/context do not exist.

- [ ] **Step 3: Extract score/result/qualifying presentation without changing rules**

Move the existing qualifying/result rows into focused views. Completed DNF correctness and points come from `serverPick.scoreBreakdown.dnfBonus`; do not infer “first” from result order. Keep DNF/DNS/DSQ server semantics.

- [ ] **Step 4: Implement picks-first cards and deck composition**

Upcoming card order: race identity/countdown, Schedule, P1/P10/DNF, `n/3`, lock/2× state, one Save button. Past card order: race identity, total points, three scored picks. Only the active race's qualifying/results/context renders below the pager. Before qualifying rows exist, context shows season average classified finish and DNF count for the current entrants; qualifying replaces it as soon as rows arrive. Empty sections use centered `ContentUnavailableView` equivalents.

- [ ] **Step 5: Implement progressive DriverPickerSheet and Schedule sheet**

```swift
extension PickSlot {
    var next: PickSlot? {
        switch self { case .winner: .p10; case .p10: .dnf; case .dnf: nil }
    }
}
```

Bind `activeSlot`, keep medium/large detents and drag indicator, disable selected IDs with an accessibility reason, retain the sheet after each choice, and refuse a selection after lock. Schedule lists only qualifying/shootout when present, 2× cutoff, lock, and race/sprint start.

- [ ] **Step 6: Verify parity, then remove obsolete navigation views**

Run the native/UI tests and manually compare lock/early-bird/results/pick behavior with the old `RaceDetailView`. Only after parity, delete `RacesListView.swift`, `RacesListViewModel.swift`, `RaceCardView.swift`, and `RaceDetailView.swift`; remove their navigation destinations and update Node source tests.

- [ ] **Step 7: Commit the complete race experience**

```bash
git add ios/FXRacing/Features/Races ios/FXRacing/Core/Models/Pick.swift ios/FXRacingTests/Features/Races ios/FXRacingUITests/Races ios/*.test.mjs
git commit -m $'Build picks first iOS race experience\n\n— gib'
```

### Task 10: Liquid Glass boundary, bounded decoded images, and accessibility

**Files:**
- Create: `ios/FXRacing/DesignSystem/FXGlassSurface.swift`
- Create: `ios/FXRacing/DesignSystem/FXRemoteImage.swift`
- Create: `ios/FXRacing/Core/Images/FXImagePipeline.swift`
- Create: `ios/FXRacingTests/DesignSystem/FXGlassSurfaceResolverTests.swift`
- Create: `ios/FXRacingTests/Core/Images/FXImagePipelineTests.swift`
- Modify: `ios/FXRacing/DesignSystem/FXTheme.swift`
- Modify: `ios/FXRacing/DesignSystem/DriverBubbleView.swift`
- Modify: `ios/FXRacing/Features/Races/DriverPickerSheet.swift`
- Modify: `ios/FXRacing/Features/Profile/GuestProfileView.swift`
- Modify: `ios/FXRacing/Features/Profile/ProfileView.swift`
- Modify: `ios/FXRacing/Features/Profile/FriendProfileView.swift`
- Modify: `ios/FXRacing/Features/Profile/ProfileTeamOption.swift`
- Modify: `ios/FXRacing/Features/Rankings/FriendSearchView.swift`
- Modify: `ios/FXRacing/Features/Rankings/LeaderboardRowView.swift`

**Interfaces:**
- Produces: availability-resolved `FXGlassSurface`, `FXImagePipeline`, and `FXRemoteImage`.
- Consumes: all new shell/card/sheet surfaces from Tasks 8–9.

- [ ] **Step 1: Write failing surface-resolver and image-pipeline tests**

```swift
func testFallbackResolverNeverRequestsGlassBeforeIOS26() {
    XCTAssertEqual(FXSurfaceStyle.resolve(supportsGlass: false, reduceTransparency: false), .material)
    XCTAssertEqual(FXSurfaceStyle.resolve(supportsGlass: false, reduceTransparency: true), .opaque)
}

func testConcurrentIdenticalImageRequestsShareLoader() async throws {
    let loader = ImageDataLoaderSpy(data: Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XQ2hAAAAAElFTkSuQmCC")!)
    let pipeline = FXImagePipeline(loader: loader)
    let request = FXImageRequest(url: URL(string: "https://example.test/avatar.png")!, pixelWidth: 144, pixelHeight: 144, scale: 3, contentMode: .fill)
    async let first = pipeline.image(for: request)
    async let second = pipeline.image(for: request)
    _ = try await (first, second)
    XCTAssertEqual(await loader.callCount, 1)
}

actor ImageDataLoaderSpy: ImageDataLoading {
    let data: Data
    private(set) var callCount = 0
    init(data: Data) { self.data = data }
    func data(for url: URL) async throws -> Data { callCount += 1; return data }
}
```

Also test URL/size/scale/content-mode keys, 48 MB/160 limits, byte cost, off-main downsampling, four-worker ceiling, stale-prefetch cancellation, and visible-request survival.

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/FXGlassSurfaceResolverTests -only-testing:FXRacingTests/FXImagePipelineTests`

Expected: FAIL because glass/image types do not exist.

- [ ] **Step 3: Implement one availability-gated surface boundary**

```swift
@ViewBuilder
func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
        content.glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius))
    } else if reduceTransparency {
        content
            .background(FXTheme.Colors.surfaceElevated, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Color(uiColor: .separator).opacity(0.35)))
    } else {
        content
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Color(uiColor: .separator).opacity(0.25)))
    }
}
```

Use glass only for shell/profile/Schedule/temporary sheet/primary action. Respect Reduce Transparency, Increased Contrast, Differentiate Without Color, and Reduce Motion. Opaque content surfaces remain unchanged.

- [ ] **Step 4: Implement the actor image pipeline and reusable view**

```swift
enum FXImageContentMode: String, Hashable, Sendable { case fit, fill }
struct FXImageRequest: Hashable, Sendable {
    let url: URL
    let pixelWidth: Int
    let pixelHeight: Int
    let scale: CGFloat
    let contentMode: FXImageContentMode
}
protocol ImageDataLoading: Sendable { func data(for url: URL) async throws -> Data }
```

Use a dedicated 16 MB memory/100 MB disk `URLCache`, decoded `NSCache` with 48 MB/160 limits, exact request keys, one in-flight task per key, ImageIO thumbnail creation in `Task.detached`, and maximum four prefetch workers. Replacing the active-plus-next scope cancels prefetch only.

- [ ] **Step 5: Replace every direct AsyncImage and verify accessibility**

Keep team-color/code placeholders synchronous. Add 44-point targets, Dynamic Type vertical fallback, VoiceOver role/driver/status labels, focus advance after picker selection, and no color-only states.

- [ ] **Step 6: Verify iOS 26 and deployment-floor builds**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test -only-testing:FXRacingTests/FXGlassSurfaceResolverTests -only-testing:FXRacingTests/FXImagePipelineTests
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/f10-ios17-compile IPHONEOS_DEPLOYMENT_TARGET=17.0 build
```

Expected: tests and generic compile PASS; no unguarded iOS 26 symbol appears.

- [ ] **Step 7: Commit visual system and images**

```bash
git add ios/FXRacing/DesignSystem ios/FXRacing/Core/Images ios/FXRacing/Features ios/FXRacingTests/DesignSystem ios/FXRacingTests/Core/Images
git commit -m $'Add native glass and cached imagery\n\n— gib'
```

### Task 11: Signposts and executable user-perceived performance harness

**Files:**
- Create: `ios/FXRacing/Core/Performance/FXPerformance.swift`
- Create: `ios/FXRacing/Core/Networking/APIClientMetricsDelegate.swift`
- Modify: `ios/FXRacing/Performance/PerformanceAppDependencies.swift`
- Modify: `ios/FXRacing/Performance/PerformanceFixtures.swift`
- Modify: `ios/FXRacing/Performance/DeterministicFailureURLProtocol.swift`
- Create: `ios/FXRacingUITests/FXRacingPerformanceTests.swift`
- Create: `ios/FXRacingUITests/PerformanceResult.swift`
- Create: `scripts/ios-performance`
- Modify: `.gitignore`
- Modify: `ios/FXRacing/Core/Networking/APIClient.swift`
- Modify: launch/deck/detail/sheet/save files at their exact measured boundaries.

**Interfaces:**
- Produces: static signpost intervals, redacted task metrics, `--scenario` fixture launch mode, and p50/p95 export.
- Consumes: stable accessibility IDs from Tasks 8–10.

- [ ] **Step 1: Write failing instrumentation and harness configuration tests**

```swift
func testCachedLaunchEndsOnlyAfterInteractiveDeck() {
    let app = XCUIApplication()
    app.launchArguments = ["--performance-scenario", "cached-launch"]
    let start = ContinuousClock.now
    app.launch()
    let deck = app.otherElements["race-deck"]
    XCTAssertTrue(deck.waitForExistence(timeout: 2))
    XCTAssertTrue(app.buttons["schedule-button"].isHittable)
    PerformanceResult.record("cached-launch", duration: start.duration(to: .now))
}
```

Node configuration tests assert every app-side harness file is wrapped in `#if FX_PERF_HARNESS`, the Performance scheme cannot archive, and Release conditions omit the flag.

- [ ] **Step 2: Run the harness test and confirm failure**

Run: `xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacingPerformance -configuration Performance -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-performance test -only-testing:FXRacingUITests/FXRacingPerformanceTests`

Expected: FAIL because fixtures/signposts/result export do not exist.

- [ ] **Step 3: Implement static signposts and redacted URL metrics**

```swift
enum FXPerformanceInterval: String, Sendable {
    case launchToShell = "LaunchToShell"
    case cachedListPublication = "CachedListPublication"
    case activeRaceSummaryPublication = "ActiveRaceSummaryPublication"
    case raceDetailPublication = "RaceDetailPublication"
    case driverPickerPresentation = "DriverPickerPresentation"
    case schedulePresentation = "SchedulePresentation"
    case localPickSave = "LocalPickSave"
    case serverAcknowledgement = "ServerAcknowledgement"
}
```

Use one `OSSignposter(subsystem: "com.fxracing.app", category: "performance")`; record timings only, never query values, Authorization, payloads, or response bodies.

- [ ] **Step 4: Implement the compile-time-only fixture dependency graph**

Under `#if FX_PERF_HARNESS`, launch arguments select fixed clock, race/detail/pick/image fixtures and deterministic offline `URLProtocol`. Ordinary Debug/Release have no runtime fixture selector.

- [ ] **Step 5: Implement UI readiness gates and export script**

Measure 3 warm-ups + 30 samples. Start before launch/swipe/tap; stop only after expected identifier/value exists and the primary control is hittable. Export `.xcresult`, raw interval JSON, p50, and p95 under ignored `artifacts/ios-performance/<timestamp>/`. Enforce: shell ≤0.8 s; cached/offline deck ≤1.0 s; swipe/context ≤0.6 s; driver/schedule sheets ≤0.5 s; local response ≤0.2 s; cached publication ≤0.3 s.

- [ ] **Step 6: Run the executable performance suite**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacingPerformance -configuration Performance -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-performance build-for-testing
scripts/ios-performance --udid D6231AF1-335A-47EA-94DB-D16CD6529F1F --scenario cached-launch
```

Expected: script exits 0, emits 30 recorded samples and passing p50/p95; server acknowledgement/production TTFB are labelled non-gating.

- [ ] **Step 7: Commit performance evidence tooling**

```bash
git add ios/FXRacing/Core/Performance ios/FXRacing/Core/Networking ios/FXRacing/Performance ios/FXRacingUITests scripts/ios-performance .gitignore
git commit -m $'Measure native iOS interaction latency\n\n— gib'
```

### Task 12: Full verification, annotatable checkpoint, and iPhone 17 Pro handoff

**Files:**
- Create: `ios/FXRacingUITests/VisualReviewUITests.swift`
- Create: `scripts/ios-review-checkpoint`
- Create: `docs/superpowers/reviews/2026-07-13-f10-ios-race-deck-review-notes.md`
- Modify: `ios/CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-13-f10-ios-race-deck-performance-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-f10-ios-race-deck-performance.md` checkboxes only as tasks complete.

**Interfaces:**
- Consumes: the complete app, test suites, Performance harness, and existing review companion.
- Produces: verified Release app installed on the pinned simulator and coordinate-pinned screenshots for user feedback.

- [ ] **Step 1: Run all automated confidence suites**

Run in order:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-native-tests test
npm run test:ios
npm run test:routes
npm run test:services
npx tsc --noEmit
npm run lint
npm run build
```

Expected: native, iOS, route, service, type, lint, and production build commands PASS. If a repo-wide pre-existing failure appears, record its exact output and prove the changed scopes pass; do not hide it.

- [ ] **Step 2: Build the deployment-floor and Release simulator products**

Run:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/f10-ios17-compile IPHONEOS_DEPLOYMENT_TARGET=17.0 build
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -configuration Release -destination 'platform=iOS Simulator,id=D6231AF1-335A-47EA-94DB-D16CD6529F1F' -derivedDataPath /private/tmp/f10-release build
```

Expected: both commands print `** BUILD SUCCEEDED **`; product exists at `/private/tmp/f10-release/Build/Products/Release-iphonesimulator/FXRacing.app`.

- [ ] **Step 3: Install, launch, and bring Simulator forward**

Run with host access:

```bash
xcrun simctl bootstatus D6231AF1-335A-47EA-94DB-D16CD6529F1F -b
xcrun simctl install D6231AF1-335A-47EA-94DB-D16CD6529F1F /private/tmp/f10-release/Build/Products/Release-iphonesimulator/FXRacing.app
xcrun simctl launch --terminate-running-process D6231AF1-335A-47EA-94DB-D16CD6529F1F com.fxracing.app
open -a Simulator
```

Expected: `com.fxracing.app` launches on the booted iPhone 17 Pro using the production API.

- [ ] **Step 4: Perform manual functional/accessibility smoke checks**

Verify Upcoming/Past/Rankings, exact card center/gutters, race swipes, one-sheet three-pick flow, distinct-driver disabling, local/account save labels, Schedule swipe-down, qualifying/results context, Global/Friends persistence, profile sheet, offline cached content, light/dark, Dynamic Type, VoiceOver order, Reduce Motion, Reduce Transparency, Increased Contrast, and lock crossing. Run a separate iOS 17 runtime smoke pass before merge; do not claim fallback rendering verified until it runs.

- [ ] **Step 5: Publish the development-only annotatable checkpoint**

`scripts/ios-review-checkpoint` captures deterministic Upcoming, Past, Rankings, driver-picker, and schedule states into ignored `.artifacts/ios-review/<commit>/`, then writes a transient `ios-simulator-checkpoint.html` into `/Users/gibou/code/github/f10_fantasy/.superpowers/brainstorm/70526-1783929684/content/`. Each `data-review-id` emits `type`, unique `choice`, `screen`, `reviewId`, normalized `xRatio`/`yRatio`, viewport, and note into the existing event stream. Accepted feedback is copied into the committed review-notes file; no screenshot/HTML enters the app target.

- [ ] **Step 6: Run final diff and secret/scope review**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
rg -n "Bearer |sbp_|service_role|BEGIN PRIVATE|FX_PERF_HARNESS" ios scripts docs package.json
```

Expected: no whitespace errors/secrets; `FX_PERF_HARNESS` appears only in Performance configuration/tests/guarded files; unrelated dirty-checkout files are absent.

- [ ] **Step 7: Commit delivery documentation**

```bash
git add ios/FXRacingUITests/VisualReviewUITests.swift scripts/ios-review-checkpoint docs/superpowers/reviews ios/CLAUDE.md docs/superpowers/specs docs/superpowers/plans
git commit -m $'Document iOS simulator verification\n\n— gib'
```

- [ ] **Step 8: Request review before publishing**

Invoke `superpowers:requesting-code-review`, fix all P1/P2 findings, rerun affected/full verification, then use `superpowers:verification-before-completion`. After proof is current, push the feature branch and open a draft PR with `Closes #360`, a checked Test Plan, simulator/performance evidence, references to #361/#362, and `— gib` as the final line.

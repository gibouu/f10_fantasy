import XCTest
@testable import FXRacing

@MainActor
final class RaceDeckViewModelTests: XCTestCase {
    func testStartPublishesCachedListBeforeRefreshCompletes() async {
        let cached = snapshot([RaceFixtures.liveSpa])
        let refreshed = snapshot([RaceFixtures.liveSpa, RaceFixtures.upcomingMonza])
        let repository = RaceRepositoryStub(
            list: cached,
            refreshOutcomes: [.snapshot(refreshed)],
            gatedRefreshIndices: [0]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        let start = Task { await viewModel.start() }
        await repository.waitForRefreshCalls(1)

        XCTAssertEqual(viewModel.races.map(\.id), ["spa"])
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertTrue(viewModel.isRefreshing)

        await repository.releaseRefresh(at: 0)
        await start.value

        XCTAssertEqual(viewModel.races.map(\.id), ["spa", "monza"])
        let policies = await repository.refreshPolicies
        guard case .ifStale? = policies.first else {
            return XCTFail("start should refresh through the repository freshness policy")
        }
    }

    func testConcurrentStartAndForegroundPreserveCachedPublication() async {
        let cached = RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now.addingTimeInterval(-120),
            season: RaceFixtures.season2026,
            races: [RaceFixtures.liveSpa]
        )
        let cache = MemoryRaceSnapshotCache(
            list: cached,
            gatesListReads: true
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [
                                RaceFixtures.liveSpa,
                                RaceFixtures.upcomingMonza,
                            ],
                            season: RaceFixtures.season2026
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET /api/races"]
        )
        let repository = RaceRepository(
            api: api,
            cache: cache,
            clock: TestClock.fixed
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        let initialStart = Task { await viewModel.start() }
        await cache.waitForListReads(count: 1)
        let foreground = Task { await viewModel.handleForeground() }
        await Task.yield()

        let readsWhileBlocked = await cache.listReadCount
        XCTAssertEqual(readsWhileBlocked, 1)

        await cache.releaseListReads()
        await api.waitForCalls(to: "/api/races", count: 1)

        XCTAssertEqual(viewModel.races.map(\.id), ["spa"])
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertTrue(viewModel.isRefreshing)

        await api.releaseRequests(to: "/api/races")
        await initialStart.value
        await foreground.value

        XCTAssertEqual(viewModel.races.map(\.id), ["spa", "monza"])
        let finalReadCount = await cache.listReadCount
        let networkCallCount = await api.calls(to: "/api/races")
        XCTAssertEqual(finalReadCount, 1)
        XCTAssertEqual(networkCallCount, 1)
    }

    func testOrderingAndDefaultSelectionsAreChronological() async {
        let earlierUpcoming = race(
            id: "silverstone",
            round: 3,
            status: .upcoming,
            offset: 7_200
        )
        let latestCompleted = race(
            id: "suzuka",
            round: 1,
            status: .completed,
            offset: -3_600
        )
        let olderCompleted = race(
            id: "imola",
            round: 0,
            status: .completed,
            offset: -7_200
        )
        let cancelled = race(
            id: "cancelled",
            round: 8,
            status: .cancelled,
            offset: 900
        )
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        viewModel.apply(
            snapshot([
                RaceFixtures.upcomingMonza,
                olderCompleted,
                cancelled,
                earlierUpcoming,
                latestCompleted,
                RaceFixtures.liveSpa,
            ])
        )

        XCTAssertEqual(
            viewModel.upcoming.map(\.id),
            ["spa", "silverstone", "monza"]
        )
        XCTAssertEqual(viewModel.past.map(\.id), ["suzuka", "imola"])
        XCTAssertEqual(viewModel.selectedUpcomingID, "spa")
        XCTAssertEqual(viewModel.selectedPastID, "suzuka")
    }

    func testSelectionsStayIndependentAndUseDeterministicFallbacks() async {
        let live = RaceFixtures.liveSpa
        let next = RaceFixtures.upcomingMonza
        let latestPast = race(
            id: "austria",
            round: 0,
            status: .completed,
            offset: -1_800
        )
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([live, next, latestPast]))

        viewModel.selectedUpcomingID = next.id
        viewModel.selectedPastID = latestPast.id
        XCTAssertEqual(viewModel.selectedUpcomingID, next.id)
        XCTAssertEqual(viewModel.selectedPastID, latestPast.id)

        viewModel.apply(snapshot([live, latestPast]))
        XCTAssertEqual(viewModel.selectedUpcomingID, live.id)
        XCTAssertEqual(viewModel.selectedPastID, latestPast.id)

        viewModel.apply(snapshot([]))
        XCTAssertNil(viewModel.selectedUpcomingID)
        XCTAssertNil(viewModel.selectedPastID)
    }

    func testVisibleUpcomingRaceMovingToPastUpdatesSelectionsAndTransition() async {
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(
            snapshot([RaceFixtures.liveSpa, RaceFixtures.upcomingMonza])
        )
        viewModel.selectedUpcomingID = "spa"

        viewModel.apply(
            snapshot([RaceFixtures.completedSpa, RaceFixtures.upcomingMonza])
        )

        XCTAssertEqual(viewModel.selectedUpcomingID, "monza")
        XCTAssertEqual(viewModel.selectedPastID, "spa")
        XCTAssertEqual(viewModel.transitionedRaceID, "spa")
        viewModel.clearTransitionedRaceID()
        XCTAssertNil(viewModel.transitionedRaceID)
    }

    func testUpcomingRaceMovingToPastDoesNotInterruptPastBrowsing() async {
        let viewedPastRace = race(
            id: "austria",
            round: 0,
            status: .completed,
            offset: -1_800
        )
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(
            snapshot([
                RaceFixtures.liveSpa,
                RaceFixtures.upcomingMonza,
                viewedPastRace,
            ])
        )
        viewModel.selectedPastID = viewedPastRace.id
        viewModel.setActiveSection(.past)

        viewModel.apply(
            snapshot([
                RaceFixtures.completedSpa,
                RaceFixtures.upcomingMonza,
                viewedPastRace,
            ])
        )

        XCTAssertEqual(viewModel.selectedUpcomingID, "monza")
        XCTAssertEqual(viewModel.selectedPastID, viewedPastRace.id)
        XCTAssertNil(viewModel.transitionedRaceID)
    }

    func testInactiveDeckClearsPrefetchAndNormalizesWithoutTransitioning() async {
        let viewedPastRace = race(
            id: "austria",
            round: 0,
            status: .completed,
            offset: -1_800
        )
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(
            snapshot([
                RaceFixtures.liveSpa,
                RaceFixtures.upcomingMonza,
                viewedPastRace,
            ])
        )
        await repository.waitForPrefetchCalls(1)
        viewModel.selectedPastID = viewedPastRace.id

        viewModel.setActiveSection(nil)
        await repository.waitForPrefetchCalls(2)
        viewModel.apply(
            snapshot([
                RaceFixtures.completedSpa,
                RaceFixtures.upcomingMonza,
                viewedPastRace,
            ])
        )

        XCTAssertNil(viewModel.activeSection)
        XCTAssertEqual(viewModel.selectedUpcomingID, RaceFixtures.upcomingMonza.id)
        XCTAssertEqual(viewModel.selectedPastID, viewedPastRace.id)
        XCTAssertNil(viewModel.transitionedRaceID)
        let prefetches = await repository.prefetchedIDs
        XCTAssertEqual(prefetches.last, [])
    }

    func testTransitionDoesNotDiscardVisitedDetailViewModel() async throws {
        let repository = RaceRepositoryStub(list: nil)
        let api = APIClientSpy(responses: [:])
        let factory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed,
            detailViewModelFactory: factory
        )
        viewModel.apply(
            snapshot([RaceFixtures.liveSpa, RaceFixtures.upcomingMonza])
        )
        let visited = try XCTUnwrap(
            viewModel.detailViewModel(for: RaceFixtures.liveSpa)
        )
        visited.select(driver: DriverFixtures.norris, for: .winner)
        visited.select(driver: DriverFixtures.piastri, for: .p10)
        visited.select(driver: DriverFixtures.leclerc, for: .dnf)

        viewModel.apply(
            snapshot([RaceFixtures.completedSpa, RaceFixtures.upcomingMonza])
        )
        let afterTransition = try XCTUnwrap(
            viewModel.detailViewModel(for: RaceFixtures.completedSpa)
        )

        XCTAssertTrue(visited === afterTransition)
        XCTAssertEqual(viewModel.cachedDetailViewModelCount, 1)
        XCTAssertEqual(afterTransition.race.status, .completed)
        XCTAssertEqual(afterTransition.selectedWinnerID, DriverFixtures.norris.id)
        XCTAssertEqual(afterTransition.selectedP10ID, DriverFixtures.piastri.id)
        XCTAssertEqual(afterTransition.selectedDNFID, DriverFixtures.leclerc.id)
    }

    func testRepeatedDetailLookupDoesNotRollBackHydratedRaceSummary() async throws {
        let repository = RaceRepositoryStub(list: nil)
        let api = APIClientSpy(responses: [:])
        let factory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed,
            detailViewModelFactory: factory
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa]))
        let hydrated = try XCTUnwrap(
            viewModel.detailViewModel(for: RaceFixtures.liveSpa)
        )
        hydrated.updateSummary(RaceFixtures.completedSpa)

        let lookedUpAgain = try XCTUnwrap(
            viewModel.detailViewModel(for: RaceFixtures.liveSpa)
        )

        XCTAssertTrue(hydrated === lookedUpAgain)
        XCTAssertEqual(lookedUpAgain.race.status, .completed)
    }

    func testExistingDetailLookupNeverCreatesAnUnvisitedModel() throws {
        let repository = RaceRepositoryStub(list: nil)
        let api = APIClientSpy(responses: [:])
        let factory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed,
            detailViewModelFactory: factory
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa]))

        XCTAssertNil(viewModel.existingDetailViewModel(for: RaceFixtures.liveSpa.id))
        XCTAssertEqual(viewModel.cachedDetailViewModelCount, 0)

        let created = try XCTUnwrap(
            viewModel.detailViewModel(for: RaceFixtures.liveSpa)
        )

        XCTAssertTrue(
            created === viewModel.existingDetailViewModel(for: RaceFixtures.liveSpa.id)
        )
        XCTAssertEqual(viewModel.cachedDetailViewModelCount, 1)
    }

    func testDetailModelsAreEvictedWhenPrivateSessionScopeChanges() throws {
        let repository = RaceRepositoryStub(list: nil)
        let api = APIClientSpy(responses: [:])
        let factory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed,
            detailViewModelFactory: factory
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa]))

        let accountA = try XCTUnwrap(
            viewModel.detailViewModel(
                for: RaceFixtures.liveSpa,
                privateScopeID: "user:a"
            )
        )
        accountA.select(driver: DriverFixtures.norris, for: .winner)

        viewModel.setPrivateScope("user:b")
        let accountB = try XCTUnwrap(
            viewModel.detailViewModel(
                for: RaceFixtures.liveSpa,
                privateScopeID: "user:b"
            )
        )

        XCTAssertFalse(accountA === accountB)
        XCTAssertNil(accountB.selectedWinnerID)
        XCTAssertNil(
            viewModel.existingDetailViewModel(
                for: RaceFixtures.liveSpa.id,
                privateScopeID: "user:a"
            )
        )
        XCTAssertTrue(
            accountB === viewModel.existingDetailViewModel(
                for: RaceFixtures.liveSpa.id,
                privateScopeID: "user:b"
            )
        )
        XCTAssertEqual(viewModel.cachedDetailViewModelCount, 1)
    }

    func testImagePrefetchRequestsUseActiveAndNextEntrantsWithExactSizes() async throws {
        let constructor = DriverConstructor(
            id: "mclaren",
            name: "McLaren",
            shortName: "MCL",
            color: "FF8700",
            slug: "mclaren",
            logoUrl: "https://images.example/team.png"
        )
        let entrant = Driver(
            id: "norris",
            code: "NOR",
            firstName: "Lando",
            lastName: "Norris",
            number: 4,
            photoUrl: "https://images.example/norris.png",
            seatKey: "mclaren-1",
            constructor: constructor
        )
        let activeDetail = detailSnapshot(
            race: RaceFixtures.liveSpa,
            entrants: [entrant]
        )
        let nextDetail = detailSnapshot(
            race: RaceFixtures.upcomingMonza,
            entrants: [entrant]
        )
        let repository = RaceRepositoryStub(
            list: nil,
            details: [
                RaceFixtures.liveSpa.id: activeDetail,
                RaceFixtures.upcomingMonza.id: nextDetail,
            ]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa, RaceFixtures.upcomingMonza]))

        let requests = await viewModel.activeImagePrefetchRequests(displayScale: 2)

        XCTAssertEqual(requests.count, 2, "duplicate entrant assets should be coalesced")
        let photo = try XCTUnwrap(
            requests.first { $0.url.absoluteString.contains("norris") }
        )
        XCTAssertEqual(photo.pixelWidth, 72)
        XCTAssertEqual(photo.pixelHeight, 72)
        XCTAssertEqual(photo.contentMode, .fill)
        let logo = try XCTUnwrap(
            requests.first { $0.url.absoluteString.contains("team") }
        )
        XCTAssertEqual(logo.pixelWidth, 56)
        XCTAssertEqual(logo.pixelHeight, 56)
        XCTAssertEqual(logo.contentMode, .fit)
    }

    func testPastImagePrefetchMatchesTheCompactCardAndSkipsHiddenTeamLogos() async throws {
        let constructor = DriverConstructor(
            id: "mclaren",
            name: "McLaren",
            shortName: "MCL",
            color: "FF8700",
            slug: "mclaren",
            logoUrl: "https://images.example/team.png"
        )
        let entrant = Driver(
            id: "norris",
            code: "NOR",
            firstName: "Lando",
            lastName: "Norris",
            number: 4,
            photoUrl: "https://images.example/norris.png",
            seatKey: "mclaren-1",
            constructor: constructor
        )
        let completedRace = RaceFixtures.completedSpa
        let repository = RaceRepositoryStub(
            list: nil,
            details: [
                completedRace.id: detailSnapshot(
                    race: completedRace,
                    entrants: [entrant]
                ),
            ]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([completedRace]))
        viewModel.setActiveSection(.past)

        let requests = await viewModel.activeImagePrefetchRequests(displayScale: 2)

        XCTAssertEqual(requests.count, 1)
        let photo = try XCTUnwrap(requests.first)
        XCTAssertTrue(photo.url.absoluteString.contains("norris"))
        XCTAssertEqual(photo.pixelWidth, 60)
        XCTAssertEqual(photo.pixelHeight, 60)
        XCTAssertEqual(photo.contentMode, .fill)
    }

    func testRefreshFailureWithoutContentShowsCompactRetryError() async {
        let repository = RaceRepositoryStub(
            list: nil,
            refreshOutcomes: [.failure(.unavailable)]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        await viewModel.start()

        XCTAssertNotNil(viewModel.errorMessage)
        XCTAssertNil(viewModel.staleErrorMessage)
        XCTAssertTrue(viewModel.races.isEmpty)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testRefreshFailureWithCachedContentKeepsDeckAndShowsStaleBanner() async {
        let cached = snapshot([RaceFixtures.liveSpa])
        let repository = RaceRepositoryStub(
            list: cached,
            refreshOutcomes: [.failure(.unavailable)]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        await viewModel.start()

        XCTAssertEqual(viewModel.races.map(\.id), ["spa"])
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertNotNil(viewModel.staleErrorMessage)
        viewModel.dismissStaleError()
        XCTAssertNil(viewModel.staleErrorMessage)
    }

    func testActiveSectionPrefetchesSelectedRaceAndOnlyItsNextNeighbor() async {
        let live = RaceFixtures.liveSpa
        let next = race(
            id: "silverstone",
            round: 3,
            status: .upcoming,
            offset: 7_200
        )
        let later = RaceFixtures.upcomingMonza
        let latestPast = race(
            id: "austria",
            round: 1,
            status: .completed,
            offset: -3_600
        )
        let olderPast = race(
            id: "imola",
            round: 0,
            status: .completed,
            offset: -7_200
        )
        let repository = RaceRepositoryStub(list: nil)
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([later, olderPast, next, latestPast, live]))
        await repository.waitForPrefetchCalls(1)

        viewModel.selectedUpcomingID = next.id
        await repository.waitForPrefetchCalls(2)
        viewModel.selectedPastID = latestPast.id
        viewModel.setActiveSection(.past)
        await repository.waitForPrefetchCalls(3)

        let calls = await repository.prefetchedIDs
        XCTAssertEqual(
            calls,
            [
                ["spa", "silverstone"],
                ["silverstone", "monza"],
                ["austria", "imola"],
            ]
        )
        XCTAssertTrue(calls.allSatisfy { $0.count <= 2 })
    }

    func testLivePollUsesForegroundPolicyOnlyWhileRaceIsLive() async {
        let repository = RaceRepositoryStub(
            list: nil,
            refreshOutcomes: [
                .snapshot(snapshot([RaceFixtures.completedSpa])),
            ]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa]))

        await viewModel.pollLiveRaces()
        await viewModel.pollLiveRaces()

        let policies = await repository.refreshPolicies
        XCTAssertEqual(policies.count, 1)
        guard case .foreground? = policies.first else {
            return XCTFail("live polling should use the foreground policy")
        }
        XCTAssertFalse(viewModel.hasLiveRace)
    }

    func testLivePollDebouncesLifecycleTicksWithinSixtySeconds() async {
        let repository = RaceRepositoryStub(
            list: nil,
            refreshOutcomes: [
                .snapshot(snapshot([RaceFixtures.liveSpa])),
                .snapshot(snapshot([RaceFixtures.liveSpa])),
            ]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([RaceFixtures.liveSpa]))

        await viewModel.pollLiveRaces()
        await viewModel.pollLiveRaces()

        let policies = await repository.refreshPolicies
        XCTAssertEqual(policies.count, 1)
    }

    func testStatusPollDiscoversRaceBecomingLiveAndRequestsDetailRefresh() async {
        let upcoming = race(
            id: RaceFixtures.liveSpa.id,
            round: RaceFixtures.liveSpa.round,
            status: .upcoming,
            offset: 60
        )
        let repository = RaceRepositoryStub(
            list: nil,
            refreshOutcomes: [
                .snapshot(snapshot([RaceFixtures.liveSpa])),
            ]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )
        viewModel.apply(snapshot([upcoming]))

        XCTAssertFalse(viewModel.hasLiveRace)
        XCTAssertEqual(viewModel.liveDetailRefreshRevision, 0)

        await viewModel.pollLiveRaces()

        XCTAssertTrue(viewModel.hasLiveRace)
        XCTAssertEqual(viewModel.selectedUpcomingID, RaceFixtures.liveSpa.id)
        XCTAssertEqual(viewModel.liveDetailRefreshRevision, 1)
        let policies = await repository.refreshPolicies
        XCTAssertEqual(policies.count, 1)
        guard case .foreground? = policies.first else {
            return XCTFail("status polling should use the foreground policy")
        }
    }

    func testLateOlderRefreshCannotReplaceNewerStateOrError() async {
        let old = snapshot([RaceFixtures.liveSpa])
        let latest = snapshot([RaceFixtures.upcomingMonza])
        let repository = RaceRepositoryStub(
            list: nil,
            refreshOutcomes: [.failure(.unavailable), .snapshot(latest)],
            gatedRefreshIndices: [0, 1]
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        let olderLoad = Task { await viewModel.start() }
        await repository.waitForRefreshCalls(1)
        viewModel.apply(old)
        let latestLoad = Task { await viewModel.refresh(policy: .force) }
        await repository.waitForRefreshCalls(2)

        await repository.releaseRefresh(at: 1)
        await latestLoad.value
        await repository.releaseRefresh(at: 0)
        await olderLoad.value

        XCTAssertEqual(viewModel.races.map(\.id), ["monza"])
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertNil(viewModel.staleErrorMessage)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertFalse(viewModel.isRefreshing)
    }

    private func snapshot(_ races: [Race]) -> RaceListSnapshot {
        RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            season: RaceFixtures.season2026,
            races: races
        )
    }

    private func detailSnapshot(
        race: Race,
        entrants: [Driver]
    ) -> RaceDetailSnapshot {
        RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: race,
            entrants: entrants,
            results: [],
            qualifyingResults: []
        )
    }

    private func race(
        id: String,
        round: Int,
        status: RaceStatus,
        offset: TimeInterval
    ) -> Race {
        RaceFixtures.race(
            id: id,
            round: round,
            status: status,
            startOffset: offset
        )
    }
}

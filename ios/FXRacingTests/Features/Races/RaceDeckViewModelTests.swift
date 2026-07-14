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
        let cached = snapshot([RaceFixtures.liveSpa])
        let refreshed = snapshot([
            RaceFixtures.liveSpa,
            RaceFixtures.upcomingMonza,
        ])
        let repository = RaceRepositoryStub(
            list: cached,
            refreshOutcomes: [.snapshot(refreshed), .snapshot(refreshed)],
            gatedRefreshIndices: [0, 1],
            gatesCachedList: true
        )
        let viewModel = RaceDeckViewModel(
            repository: repository,
            clock: TestClock.fixed
        )

        let initialStart = Task { await viewModel.start() }
        await repository.waitForCachedListCalls(1)
        let foreground = Task { await viewModel.handleForeground() }
        await Task.yield()

        let cachedCallsWhileBlocked = await repository.cachedListCallCount
        XCTAssertEqual(cachedCallsWhileBlocked, 1)

        await repository.releaseCachedList()
        await repository.waitForRefreshCalls(1)

        XCTAssertEqual(viewModel.races.map(\.id), ["spa"])
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertTrue(viewModel.isRefreshing)

        await repository.releaseRefresh(at: 0)
        await repository.waitForRefreshCalls(2)
        await repository.releaseRefresh(at: 1)
        await initialStart.value
        await foreground.value

        XCTAssertEqual(viewModel.races.map(\.id), ["spa", "monza"])
        let finalCachedListCalls = await repository.cachedListCallCount
        XCTAssertEqual(finalCachedListCalls, 1)
        let policies = await repository.refreshPolicies
        XCTAssertEqual(policies.count, 2)
        guard case .ifStale = policies[0], case .foreground = policies[1] else {
            return XCTFail("start and foreground should each use their intended policy once")
        }
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
